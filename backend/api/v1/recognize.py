import datetime
import json
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from core.database import get_db
from models.patent import ChainKeyword, NodeIpcMapping
from models.enterprise import Enterprise
from models.recognition_task import RecognitionTask
from schemas.enterprise import calc_association_level
from schemas.recognize import (
    RecognizeRequest, RecognizeResponse,
    KeywordCreate, KeywordDetail,
    NevPredictRequest, NevPredictResponse,
)
from schemas.recognition_task import (
    RecognitionTaskCreate, RecognitionTaskDetail,
    RecognitionTaskConfirm, GeocodeResult, TaskSummary,
)
from schemas.base import ApiResponse
from services import recognizer
from services import nev_predictor
from services import geocoder as geocoder_svc

router = APIRouter()


# ────────── 智能识别主接口 ──────────

@router.post("/run/", response_model=ApiResponse[RecognizeResponse])
def run_recognition(body: RecognizeRequest, db: Session = Depends(get_db)):
    """
    单条企业智能识别。

    推理逻辑（在线阶段）：
      1. 若 ml_models/ 目录下存在对应产业链的 .pkl 模型 → ML 推理
      2. 否则 → 用 chain_keyword 表关键词匹配（兜底）
      3. 若有 ipc_codes → node_ipc_mapping 前缀匹配叠加
      4. 若无 IPC 但有 patent_text → 文本降权叠加

    NOTE: 当前模型文件由离线训练脚本生成（scripts/train_recognizer.py），
          未训练时系统自动降级为关键词匹配，不影响功能调通。
    """
    result = recognizer.run_recognition(
        name=body.name,
        business_scope=body.business_scope,
        db=db,
        industry_chain=body.industry_chain,
        ipc_codes=body.ipc_codes,
        patent_text=body.patent_text,
    )
    return ApiResponse(data=result)


# ────────── 分词知识库管理接口 ──────────

@router.get("/keywords/", response_model=ApiResponse[List[KeywordDetail]])
def get_keywords(
    industry_chain: Optional[str] = None,
    node_name: Optional[str] = None,
    level: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    查询分词知识库条目（管理用，也是训练时的词汇白名单来源）。
    用户在此表中填入行业关键词，识别引擎自动加载。
    """
    query = db.query(ChainKeyword)
    if industry_chain:
        query = query.filter(ChainKeyword.industry_chain == industry_chain)
    if node_name:
        query = query.filter(ChainKeyword.node_name == node_name)
    if level:
        query = query.filter(ChainKeyword.level == level)
    return ApiResponse(data=query.all())


@router.post("/keywords/", response_model=ApiResponse[KeywordDetail])
def create_keyword(body: KeywordCreate, db: Session = Depends(get_db)):
    """新增分词知识库条目"""
    kw = ChainKeyword(**body.model_dump())
    db.add(kw)
    db.commit()
    db.refresh(kw)
    return ApiResponse(data=kw)


@router.delete("/keywords/{kw_id}/", response_model=ApiResponse[None])
def delete_keyword(kw_id: int, db: Session = Depends(get_db)):
    """删除分词条目"""
    kw = db.query(ChainKeyword).filter(ChainKeyword.id == kw_id).first()
    if not kw:
        return ApiResponse(code=404, message="条目不存在")
    db.delete(kw)
    db.commit()
    return ApiResponse(message="删除成功")


# ────────── IPC 映射表管理接口 ──────────

@router.get("/ipc-mappings/", response_model=ApiResponse[list])
def get_ipc_mappings(
    industry_chain: Optional[str] = None,
    node_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """查询节点-IPC 前缀映射表"""
    query = db.query(NodeIpcMapping)
    if industry_chain:
        query = query.filter(NodeIpcMapping.industry_chain == industry_chain)
    if node_name:
        query = query.filter(NodeIpcMapping.node_name == node_name)
    items = query.all()
    return ApiResponse(data=[
        {
            "id": m.id,
            "industry_chain": m.industry_chain,
            "chain_position": m.chain_position,
            "node_name": m.node_name,
            "ipc_prefix": m.ipc_prefix,
            "match_weight": m.match_weight,
        }
        for m in items
    ])


# ────────── 原有接口（保留兼容）──────────

@router.get("/pending-count/")
def get_pending_count(db: Session = Depends(get_db)):
    """Header 通知铃的待审核数量（未来接入审核工作流时更新）"""
    from schemas.recognize import PendingCount  # type: ignore
    from models.enterprise import Enterprise
    # NOTE: 暂用 geo_status=pending 的企业数作为待审核数量的近似
    count = db.query(Enterprise).filter(Enterprise.geo_status == "pending").count()
    return ApiResponse(data={"count": count})


@router.get("/queue/")
def get_recognition_queue(
    page: int = 1,
    page_size: int = 24,
    db: Session = Depends(get_db),
):
    """
    审核队列：列出尚未确认节点归属的企业，并为每条记录预跑一次识别。
    NOTE: 当前展示 geo_status=pending 或 association_score 为空的企业待识别队列。
    """
    from models.enterprise import Enterprise
    items = (
        db.query(Enterprise)
        .filter(Enterprise.geo_status == "pending")
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    result = []
    for ent in items:
        # 对每个待识别企业执行一次推理
        reco = recognizer.run_recognition(
            name=ent.name,
            business_scope=ent.business_scope or "",
            db=db,
            industry_chain=ent.industry_chain,
        )
        result.append({
            "id": str(ent.id),
            "name": ent.name,
            "tag": "待识别",
            "business_scope_excerpt": (ent.business_scope or "")[:60] + "...",
            "top3_results": [
                {
                    "label": f"{n.chain_position}：{n.node_name}",
                    "score": n.final_score,
                    "chain": n.industry_chain,
                    "node": n.node_name,
                    "position": n.chain_position,
                }
                for n in reco.top3
            ],
            "method_used": reco.method_used,
            "detail": {
                "address": ent.registered_address or "",
                "legal_representative": ent.legal_representative or "",
                "founded_date": ent.founded_date or "",
                "credit_code": ent.credit_code or "",
                "reg_status": ent.reg_status or "",
            },
        })
    return ApiResponse(data=result)


# ────────── 新能源汽车产业链 ML 识别接口 ──────────

@router.get("/nev-health/", summary="NEV 推理服务健康检查")
async def nev_health():
    """
    检查 nev_api 微服务（端口 8001）是否在线。
    前端可据此展示"模型在线/离线"状态。
    """
    online = await nev_predictor.health_check()
    return ApiResponse(data={
        "online": online,
        "service": "nev_api",
        "url": nev_predictor.NEV_API_URL,
        "hint": "请在 nev_backend/ 目录运行: uvicorn nev_api:app --port 8001" if not online else None,
    })


@router.post("/nev-predict/", response_model=ApiResponse[NevPredictResponse], summary="新能源汽车产业链节点识别")
async def nev_predict(body: NevPredictRequest):
    """
    新能源汽车产业链三层级联推理（环节→二级分类→三级分类）。

    调用链路：
        前端 → 主后端 /api/v1/recognize/nev-predict/ → nev_api:8001/predict

    依赖：nev_api 微服务必须处于运行状态（端口 8001）。
    检查方式：GET /api/v1/recognize/nev-health/
    """
    try:
        result = await nev_predictor.predict(body)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return ApiResponse(data=result)


@router.post("/nev-start/", summary="后台启动 NEV 推理服务")
async def nev_start():
    """
    在服务器侧以子进程方式启动 nev_api（端口 8001），**立即返回**，不等待就绪。

    前端收到 starting=true 后，应每隔几秒轮询 GET /nev-health/ 直至 online=true。

    NOTE: 适用于本地开发场景（后端与 nev_backend/ 同机运行）。
    """
    import subprocess
    import sys
    from pathlib import Path

    # 已在线不重复启动
    already_online = await nev_predictor.health_check()
    if already_online:
        return ApiResponse(data={"started": False, "starting": False, "message": "NEV 推理服务已在线，无需重启"})

    nev_dir = Path(__file__).resolve().parents[3] / "nev_backend"
    if not nev_dir.exists():
        raise HTTPException(status_code=500, detail=f"nev_backend 目录不存在: {nev_dir}")

    try:
        # NOTE: sys.executable 是主后端的 Python，可能没有 nev_backend 依赖。
        #       优先读 NEV_PYTHON 环境变量，其次探测常见路径，最后才 fallback 到 sys.executable。
        import os as _os
        nev_python = _os.getenv("NEV_PYTHON") or _find_nev_python()

        kwargs: dict = {}
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        subprocess.Popen(
            [nev_python, "-m", "uvicorn", "nev_api:app",
             "--host", "127.0.0.1", "--port", "8001"],
            cwd=str(nev_dir),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            **kwargs,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"启动失败: {e}")

    # 立即返回，不阻塞等待模型加载完成
    # 前端应轮询 /nev-health/ 确认服务就绪
    return ApiResponse(data={
        "started": True,
        "starting": True,
        "message": "NEV 推理进程已启动，模型加载约需 45 秒，请等待状态栏变绿",
    })


# ══════════════════════════════════════════════════════
# Recognition Tasks — 识别任务持久化 CRUD
# ══════════════════════════════════════════════════════

@router.post("/tasks/", summary="提交识别任务（ML结果入表）",
             response_model=ApiResponse[RecognitionTaskDetail])
def create_task(body: RecognitionTaskCreate, db: Session = Depends(get_db)):
    """
    ML 推理完成后，前端将结果提交至此接口，写入 recognition_tasks 表。
    状态默认为 pending（待审核）。
    """
    task = RecognitionTask(**body.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return ApiResponse(data=task)


@router.get("/tasks/", summary="获取识别任务列表",
            response_model=ApiResponse[List[RecognitionTaskDetail]])
def list_tasks(
    status: Optional[str] = Query(None, description="pending/confirmed/rejected"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """查询识别任务列表，支持按状态筛选。"""
    query = db.query(RecognitionTask)
    if status:
        query = query.filter(RecognitionTask.status == status)
    tasks = query.order_by(RecognitionTask.created_at.desc()).offset(skip).limit(limit).all()
    return ApiResponse(data=tasks)


@router.get("/tasks/summary/", summary="任务数量统计",
            response_model=ApiResponse[TaskSummary])
def task_summary(db: Session = Depends(get_db)):
    """返回各状态的任务数量（用于前端 badge 计数）。"""
    from sqlalchemy import func
    rows = db.query(RecognitionTask.status, func.count().label('cnt')) \
               .group_by(RecognitionTask.status).all()
    counts = {r.status: r.cnt for r in rows}
    total = sum(counts.values())
    return ApiResponse(data=TaskSummary(
        pending=counts.get('pending', 0),
        confirmed=counts.get('confirmed', 0),
        rejected=counts.get('rejected', 0),
        total=total,
    ))


@router.get("/tasks/{task_id}/", summary="获取单个任务详情",
            response_model=ApiResponse[RecognitionTaskDetail])
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(RecognitionTask).filter(RecognitionTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return ApiResponse(data=task)


@router.patch("/tasks/{task_id}/reject", summary="拒绝任务",
              response_model=ApiResponse[RecognitionTaskDetail])
def reject_task(task_id: int, db: Session = Depends(get_db)):
    """将任务标记为 rejected，不入库。"""
    task = db.query(RecognitionTask).filter(RecognitionTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.status != 'pending':
        raise HTTPException(status_code=400, detail=f"任务状态为 {task.status}，无法拒绝")
    task.status = 'rejected'
    task.confirmed_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(task)
    return ApiResponse(data=task)


@router.post("/tasks/{task_id}/confirm", summary="确认入库",
             response_model=ApiResponse[RecognitionTaskDetail])
async def confirm_task(
    task_id: int,
    body: RecognitionTaskConfirm,
    db: Session = Depends(get_db),
):
    """
    审核通过时调用。
    1. 调高德 API 对 address 做地理编码获取经纬度
    2. 将企业信息写入 enterprises 表
    3. 更新 recognition_task.status = confirmed，关联 enterprise_id
    """
    task = db.query(RecognitionTask).filter(RecognitionTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.status != 'pending':
        raise HTTPException(status_code=400, detail=f"任务已处于 {task.status} 状态")

    # ── 1. 地理编码 ──
    lat, lng, fmt_addr, geo_score = None, None, None, None
    if body.address:
        city_hint = body.city or "宁波市"
        full_addr = f"{body.province or ''}{city_hint}{body.district or ''}{body.address}"
        geo = await geocoder_svc.geocode(full_addr, city=city_hint)
        if geo["success"]:
            lat, lng = geo["lat"], geo["lng"]
            fmt_addr = geo["formatted_address"]
            geo_score = geo["confidence"]

    # ── 2. 确定产业链字段 ──
    # chain_node = 用户覆盖 or ML 二级分类
    chain_node = body.chain_node_override or task.ml_second or "未分类"
    chain_position_map = {"上游": "upstream", "中游": "midstream", "下游": "downstream"}
    chain_position = chain_position_map.get(task.ml_stage or "", "midstream")
    conf_100 = round((task.ml_stage_conf or 0) * 100, 1)
    cov_100  = round((task.ml_second_conf or 0) * 100, 1)
    sub_100  = round((task.ml_third_conf or 0) * 100, 1)

    # NOTE: 使用统一的 calc_association_level 函数，基于分类置信度作为代理分（后续可替换为对应的 patent_score）
    assoc = calc_association_level(conf_100)

    # ── 3. 写入 enterprises 表 ──
    ent = Enterprise(
        name=task.enterprise_name,
        credit_code=body.credit_code or task.credit_code,
        description=task.enterprise_intro,
        business_scope=task.business_scope,
        industry_chain="新能源汽车",
        chain_node=chain_node,
        chain_position=chain_position,
        sub_node=task.ml_third,
        sub_node_score=sub_100,
        association_score=conf_100,
        coverage_score=cov_100,
        association_level=assoc,
        status="pending",
        data_source="nev_ml",
        reliability=int(conf_100),
        # 地理
        registered_address=body.address,
        lat=lat,
        lng=lng,
        geo_status="done" if lat else "failed",
        geo_address_matched=fmt_addr,
        geo_score=geo_score or 0.0,
        # 行政区划
        province=body.province,
        city=body.city,
        location=body.district,
        # 工商
        registered_capital=body.registered_capital or 0.0,
        paid_in_capital=body.paid_in_capital or 0.0,
        scale=body.scale,
        # 行业
        industry_category=body.industry_category,
        industry_major=body.industry_major_filled or task.industry_major,
        industry_medium=body.industry_medium,
        industry_minor=body.industry_minor,
    )
    db.add(ent)
    db.flush()  # 获取 ent.id

    # ── 4. 更新 task 状态 ──
    task.status            = 'confirmed'
    task.confirmed_at      = datetime.datetime.utcnow()
    task.enterprise_id     = ent.id
    task.credit_code_filled = body.credit_code
    task.address           = body.address
    task.province          = body.province
    task.city              = body.city
    task.district          = body.district
    task.registered_capital = body.registered_capital
    task.paid_in_capital   = body.paid_in_capital
    task.scale             = body.scale
    task.industry_category = body.industry_category
    task.industry_major_filled = body.industry_major_filled
    task.industry_medium   = body.industry_medium
    task.industry_minor    = body.industry_minor
    task.lat               = lat
    task.lng               = lng
    task.geo_address_matched = fmt_addr
    task.geo_score         = geo_score

    db.commit()
    db.refresh(task)
    return ApiResponse(data=task)


@router.get("/geocode/", summary="地址→经纬度",
            response_model=ApiResponse[GeocodeResult])
async def geocode_address(
    address: str = Query(..., description="待编码地址"),
    city: str    = Query("宁波市", description="城市提示"),
):
    """调用高德 API 将地址解码为经纬度（确认弹窗使用）。"""
    geo = await geocoder_svc.geocode(address, city=city)
    return ApiResponse(data=GeocodeResult(
        address=address,
        formatted_address=geo.get("formatted_address"),
        lat=geo.get("lat"),
        lng=geo.get("lng"),
        level=geo.get("level"),
        confidence=geo.get("confidence"),
        success=geo["success"],
    ))
