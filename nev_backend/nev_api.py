"""
nev_api.py — 新能源汽车产业链节点判定 API
=========================================================
启动方式：
    uvicorn nev_api:app --host 0.0.0.0 --port 8000 --reload

接口：
    POST /predict   单企业节点判定（企业信息 + 专利列表）
    GET  /health    服务健康检查
    GET  /labels    查询产业链标签体系

输入说明：
    企业信息字段全部可选；专利列表可为空；
    同时提供企业+专利时按 0.5:0.5 权重融合，
    仅提供一方时该方占满权重。
"""

from __future__ import annotations

import json
import sys
import logging
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── 保证 predict_nev_combined 中的 tokenize/normalize_text 可被 joblib 找到 ──
# （训练时以 __main__ 保存，joblib 反序列化时会在 sys.modules["__main__"] 查找）
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

import predict_nev_combined as _nev  # noqa: E402  —— 触发词典加载 & 函数注册

# 同时把 tokenize/normalize_text 挂到 __main__
import __main__ as _main
_main.tokenize = _nev.tokenize
_main.normalize_text = _nev.normalize_text

from predict_nev_combined import (  # noqa: E402
    predict_combined,
    CombinedConfig,
    STAGE_SECOND_LABELS,
    THIRD_SUPPORTED_SECOND,
    BIZ_STAGE_DIR, BIZ_FOCUS_DIR, PATENT_DIR,
    BIZ_STAGE_SLUG, BIZ_SECOND_SLUGS, BIZ_THIRD_SLUG,
    PAT_STAGE_SLUG, PAT_SECOND_SLUG, PAT_THIRD_SLUG,
    _load, _score_dict, _combine, _best, _passing_scores,
    build_biz_text, build_patent_text,
)

logger = logging.getLogger("nev_api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


# ─────────────────────────────────────────────────────────────────────────────
# IPC 知识库加载（按环节）
# ─────────────────────────────────────────────────────────────────────────────
_IPC_DB_PATH = BASE_DIR / "ml_models_patent" / "新能源汽车_专利_IPC汇总.json"

@lru_cache(maxsize=1)
def _load_ipc_db() -> dict:
    """惰性加载 IPC 知识库，仅加载一次。"""
    if not _IPC_DB_PATH.exists():
        logger.warning(f"IPC 知识库不存在: {_IPC_DB_PATH}")
        return {}
    with open(_IPC_DB_PATH, encoding="utf-8") as f:
        db = json.load(f)
    logger.info(f"IPC 知识库加载成功，共 {len(db)} 个顶层分区")
    return db


def _ipc_to_stage_scores(ipc_codes: list[str], ipc_weight: float = 0.20) -> dict[str, float]:
    """
    根据输入的 IPC 代码列表与知识库匹配，返回各环节的加权得分。

    匹配策略（优先级递减）：
      1. 完整 IPC 代码命中 → 得分 1.0
      2. IPC 大类前缀（前3位）命中 → 得分 0.6
      3. 未命中 → 得分 0.0

    最终得分 = 所有 IPC 匹配得分的均值，再乘以 ipc_weight。
    """
    if not ipc_codes:
        return {}

    db = _load_ipc_db()
    full_map: dict[str, list[str]] = db.get("按环节_完整IPC", {})
    prefix_map: dict[str, list[str]] = db.get("按环节_大类", {})
    stages = list(STAGE_SECOND_LABELS.keys())  # [上游, 中游, 下游]

    per_ipc_scores: list[dict[str, float]] = []

    for code in ipc_codes:
        code = code.strip().upper()
        if not code:
            continue
        score_row: dict[str, float] = {s: 0.0 for s in stages}
        matched = False

        # 精确匹配
        for stage, codes in full_map.items():
            if code in codes:
                score_row[stage] = 1.0
                matched = True
                break

        # 大类前缀匹配（取前 3 位字母+数字，如 H01）
        if not matched:
            prefix3 = code[:3]
            for stage, prefixes in prefix_map.items():
                if prefix3 in prefixes:
                    score_row[stage] = 0.6
                    break

        per_ipc_scores.append(score_row)

    if not per_ipc_scores:
        return {}

    # 对所有 IPC 取均值，再乘权重
    result: dict[str, float] = {}
    for stage in stages:
        avg = sum(r[stage] for r in per_ipc_scores) / len(per_ipc_scores)
        result[stage] = round(avg * ipc_weight, 4)

    return result


def _merge_ipc_into_scores(
    ml_scores: dict[str, float],
    ipc_scores: dict[str, float],
) -> dict[str, float]:
    """
    将 IPC 得分作为加性修正叠加到 ML 概率分数上，然后重新归一化。
    IPC 得分已含权重，不影响整体量级。
    """
    if not ipc_scores:
        return ml_scores
    merged = {}
    all_keys = set(ml_scores) | set(ipc_scores)
    for k in all_keys:
        merged[k] = ml_scores.get(k, 0.0) + ipc_scores.get(k, 0.0)
    # 归一化至 [0,1]
    total = sum(merged.values())
    if total > 0:
        merged = {k: round(v / total, 4) for k, v in merged.items()}
    return merged


# ─────────────────────────────────────────────────────────────────────────────
# 启动预热：在服务就绪前把所有模型加载进内存缓存
# ─────────────────────────────────────────────────────────────────────────────
def _warmup_models() -> None:
    logger.info("预热模型中...")
    slugs = [
        (BIZ_STAGE_DIR, BIZ_STAGE_SLUG),
        (BIZ_FOCUS_DIR, BIZ_SECOND_SLUGS["上游"]),
        (BIZ_FOCUS_DIR, BIZ_SECOND_SLUGS["中游"]),
        (BIZ_FOCUS_DIR, BIZ_SECOND_SLUGS["下游"]),
        (BIZ_FOCUS_DIR, BIZ_THIRD_SLUG),
        (PATENT_DIR,    PAT_STAGE_SLUG),
        (PATENT_DIR,    PAT_SECOND_SLUG),
        (PATENT_DIR,    PAT_THIRD_SLUG),
    ]
    loaded, failed = 0, 0
    for directory, slug in slugs:
        result = _load(directory, slug)
        if result:
            loaded += 1
        else:
            logger.warning(f"模型加载失败: {directory}/{slug}")
            failed += 1
    logger.info(f"模型预热完成：成功 {loaded}，失败 {failed}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _warmup_models()
    yield


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI 应用
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="新能源汽车产业链节点判定 API",
    description="基于企业工商信息和专利文本，判定企业所属产业链环节及分类",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# 请求 / 响应模型
# ─────────────────────────────────────────────────────────────────────────────
class PatentItem(BaseModel):
    """单条专利/技术信息"""
    title: str = Field(default="", description="专利标题或技术名称（中文）")
    abstract: str = Field(default="", description="专利摘要或技术描述（中文）")
    ipc_codes: list[str] = Field(default_factory=list, description="该专利的 IPC 分类号列表（如 H01M10/052）")


class PredictRequest(BaseModel):
    """节点判定请求"""
    # 企业工商信息（全部可选）
    enterprise_name: str = Field(default="", description="企业名称")
    industry_major: str = Field(default="", description="国标行业门类")
    industry_large: str = Field(default="", description="国标行业大类")
    industry_middle: str = Field(default="", description="国标行业中类")
    industry_small: str = Field(default="", description="国标行业小类")
    enterprise_intro: str = Field(default="", description="企业简介")
    business_scope: str = Field(default="", description="经营范围")

    # 专利/技术信息（可为空列表）
    patents: list[PatentItem] = Field(default_factory=list, description="专利或技术项列表，可传多条")

    # IPC 辅助信号（汇总级别，不依附于单条专利）
    extra_ipc_codes: list[str] = Field(default_factory=list, description="额外 IPC 代码列表（可从专利证书直接复制）")

    # IPC 信号权重（相对于 ML 分数的叠加强度）
    ipc_weight: float = Field(default=0.20, ge=0.0, le=1.0, description="IPC 匹配得分的叠加权重")

    # 可选调参
    biz_weight: float = Field(default=0.5, ge=0.0, le=1.0, description="企业侧权重（0~1），剩余权重自动分配给专利侧")
    threshold_stage: float = Field(default=0.50, ge=0.0, le=1.0, description="环节置信阈值")
    threshold_second: float = Field(default=0.50, ge=0.0, le=1.0, description="二级分类置信阈值")
    threshold_third: float = Field(default=0.50, ge=0.0, le=1.0, description="三级分类置信阈值")


class LevelResult(BaseModel):
    label: Optional[str]
    confidence: float
    low_confidence: bool
    candidates: dict[str, float]   # 所有 >= 阈值的候选及其概率


class PredictResponse(BaseModel):
    """节点判定结果"""
    input_sources: list[str]       # 实际使用的信息源
    使用模型: list[str]
    环节: LevelResult
    二级分类: LevelResult
    三级分类: LevelResult
    各级分数明细: dict[str, dict[str, float]]


# ─────────────────────────────────────────────────────────────────────────────
# 多专利聚合打分
# ─────────────────────────────────────────────────────────────────────────────
def _aggregate_patent_scores(
    patents: list[PatentItem],
    model_dir: Path,
    slug: str,
) -> dict[str, float]:
    """
    对多条专利分别打分后取行平均，返回 {label: avg_prob}。
    专利为空时返回空字典。
    """
    arts = _load(model_dir, slug)
    if arts is None or not patents:
        return {}

    model, vectorizer, _ = arts
    classes = list(model.classes_)
    texts = [
        build_patent_text(p.title, p.abstract)
        for p in patents
        if len((p.title + p.abstract).replace(" ", "")) > 5
    ]
    if not texts:
        return {}

    features = vectorizer.transform(texts)

    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(features)
    elif len(classes) == 2:
        raw = model.decision_function(features).ravel()
        p1 = 1.0 / (1.0 + np.exp(-raw))
        probs = np.column_stack([1.0 - p1, p1])
    else:
        raw2d = model.decision_function(features)
        if raw2d.ndim == 1:
            raw2d = raw2d.reshape(1, -1)
        e = np.exp(raw2d - raw2d.max(axis=1, keepdims=True))
        probs = e / e.sum(axis=1, keepdims=True)

    avg = probs.mean(axis=0)
    return dict(zip(classes, avg.tolist()))


# ─────────────────────────────────────────────────────────────────────────────
# 核心预测（支持多专利）
# ─────────────────────────────────────────────────────────────────────────────
def _predict_with_patents(req: PredictRequest) -> dict:
    config = CombinedConfig(
        biz_weight=req.biz_weight,
        patent_weight=1.0 - req.biz_weight,
        threshold_stage=req.threshold_stage,
        threshold_second=req.threshold_second,
        threshold_third=req.threshold_third,
    )

    biz_text = build_biz_text(
        req.enterprise_name, req.industry_major, req.industry_large,
        req.industry_middle, req.industry_small, req.enterprise_intro,
        req.business_scope,
    )
    use_biz = any([
        req.enterprise_name.strip(), req.business_scope.strip(),
        req.enterprise_intro.strip(), req.industry_major.strip(),
        req.industry_large.strip(), req.industry_middle.strip(),
        req.industry_small.strip(),
    ])
    use_pat = bool(req.patents) and any(
        len((p.title + p.abstract).replace(" ", "")) > 5 for p in req.patents
    )

    result: dict = {
        "input_sources": [],
        "使用模型": [],
        "环节": None,
        "环节_置信度": 0.0,
        "环节_低置信度": False,
        "环节_命中候选": {},
        "二级分类": None,
        "二级分类_置信度": 0.0,
        "二级分类_低置信度": False,
        "二级分类_命中候选": {},
        "三级分类": None,
        "三级分类_置信度": 0.0,
        "三级分类_低置信度": False,
        "三级分类_命中候选": {},
        "各级分数明细": {},
    }

    if use_biz:
        result["input_sources"].append("企业信息")
    if use_pat:
        result["input_sources"].append("专利文本")

    if not use_biz and not use_pat:
        result["错误"] = "未提供有效输入（企业信息与专利文本均为空）"
        return result

    # ── 收集所有 IPC 代码（各专利 + 额外列表）──────────────────────────
    all_ipc_codes: list[str] = list(req.extra_ipc_codes)
    for p in req.patents:
        all_ipc_codes.extend(p.ipc_codes)
    ipc_stage_scores = _ipc_to_stage_scores(all_ipc_codes, req.ipc_weight)
    if ipc_stage_scores:
        result["使用模型"].append(f"IPC辅助信号({len(all_ipc_codes)}条)")
        result["input_sources"].append("IPC分类")

    # ── 1. 环节 ──────────────────────────────────────────────────────────
    biz_stage: dict[str, float] = {}
    pat_stage: dict[str, float] = {}

    if use_biz:
        arts = _load(BIZ_STAGE_DIR, BIZ_STAGE_SLUG)
        biz_stage = _score_dict(biz_text, arts)
        if arts:
            result["使用模型"].append("企业_环节模型")

    if use_pat:
        pat_stage = _aggregate_patent_scores(req.patents, PATENT_DIR, PAT_STAGE_SLUG)
        if pat_stage:
            result["使用模型"].append("专利_环节模型")

    stage_scores = _combine(biz_stage, pat_stage, config.biz_weight, config.patent_weight)
    # NOTE: IPC 信号叠加融合：作为加性修正后重新归一化
    stage_scores = _merge_ipc_into_scores(stage_scores, ipc_stage_scores)
    stage, stage_conf = _best(stage_scores)
    result["环节_命中候选"] = _passing_scores(stage_scores, config.threshold_stage)
    result["环节_置信度"] = round(stage_conf, 4)
    result["环节_低置信度"] = bool(stage_conf < config.threshold_stage)
    result["各级分数明细"]["环节"] = {k: round(v, 4) for k, v in stage_scores.items()}
    result["环节"] = stage if stage_conf >= config.threshold_stage else None

    if not stage or result["环节"] is None:
        return result

    # ── 2. 二级分类 ──────────────────────────────────────────────────────
    candidate_seconds = STAGE_SECOND_LABELS.get(stage, [])
    biz_second: dict[str, float] = {}
    pat_second: dict[str, float] = {}

    if use_biz:
        slug2 = BIZ_SECOND_SLUGS.get(stage)
        if slug2:
            arts2 = _load(BIZ_FOCUS_DIR, slug2)
            biz_second = _score_dict(biz_text, arts2)
            if arts2:
                result["使用模型"].append(f"企业_二级分类_{stage}聚焦模型")

    if use_pat:
        pat_second = _aggregate_patent_scores(req.patents, PATENT_DIR, PAT_SECOND_SLUG)
        if pat_second:
            result["使用模型"].append("专利_二级分类模型")

    second_scores = _combine(
        biz_second, pat_second,
        config.biz_weight, config.patent_weight,
        candidate_labels=candidate_seconds,
    )
    second, second_conf = _best(second_scores)
    result["二级分类_命中候选"] = _passing_scores(second_scores, config.threshold_second)
    result["二级分类_置信度"] = round(second_conf, 4)
    result["二级分类_低置信度"] = bool(second_conf < config.threshold_second)
    result["各级分数明细"]["二级分类"] = {k: round(v, 4) for k, v in second_scores.items()}
    result["二级分类"] = second if second_conf >= config.threshold_second else None

    if result["二级分类"] not in THIRD_SUPPORTED_SECOND:
        return result

    # ── 3. 三级分类（仅二级==核心零部件）────────────────────────────────
    biz_third: dict[str, float] = {}
    pat_third: dict[str, float] = {}

    if use_biz:
        arts3 = _load(BIZ_FOCUS_DIR, BIZ_THIRD_SLUG)
        biz_third = _score_dict(biz_text, arts3)
        if arts3:
            result["使用模型"].append("企业_三级分类_核心零部件聚焦模型")

    if use_pat:
        pat_third = _aggregate_patent_scores(req.patents, PATENT_DIR, PAT_THIRD_SLUG)
        if pat_third:
            result["使用模型"].append("专利_三级分类模型")

    third_scores = _combine(biz_third, pat_third, config.biz_weight, config.patent_weight)
    third, third_conf = _best(third_scores)
    result["三级分类_命中候选"] = _passing_scores(third_scores, config.threshold_third)
    result["三级分类_置信度"] = round(third_conf, 4)
    result["三级分类_低置信度"] = bool(third_conf < config.threshold_third)
    result["各级分数明细"]["三级分类"] = {k: round(v, 4) for k, v in third_scores.items()}
    result["三级分类"] = third if third_conf >= config.threshold_third else None

    return result


# ─────────────────────────────────────────────────────────────────────────────
# 路由
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/health", summary="健康检查")
async def health():
    return {"status": "ok", "model_cache_size": len(_nev._MODEL_CACHE)}


@app.get("/labels", summary="查询产业链标签体系")
async def get_labels():
    return {
        "产业链标签体系": {
            "环节": list(STAGE_SECOND_LABELS.keys()),
            "二级分类": STAGE_SECOND_LABELS,
            "三级分类支持的二级标签": list(THIRD_SUPPORTED_SECOND),
        }
    }


@app.post("/predict", response_model=PredictResponse, summary="企业产业链节点判定")
async def predict(req: PredictRequest):
    """
    输入企业工商信息（经营范围、行业分类等）和/或专利信息（标题、摘要），
    返回该企业所属产业链环节（上游/中游/下游）、二级分类、三级分类（若适用）
    及各级置信度。

    - 企业字段和专利列表均可选，但至少需要提供一方。
    - 专利列表传多条时，系统对多条专利打分取均值后再与企业分融合。
    - 置信度低于阈值时 `low_confidence=true`，预测结果仍然返回供参考。
    """
    try:
        raw = _predict_with_patents(req)
    except Exception as exc:
        logger.exception("预测异常")
        raise HTTPException(status_code=500, detail=str(exc))

    if "错误" in raw:
        raise HTTPException(status_code=422, detail=raw["错误"])

    def _to_level(key: str) -> LevelResult:
        return LevelResult(
            label=raw.get(key),
            confidence=raw.get(f"{key}_置信度", 0.0),
            low_confidence=raw.get(f"{key}_低置信度", False),
            candidates=raw.get(f"{key}_命中候选", {}),
        )

    return PredictResponse(
        input_sources=raw.get("input_sources", []),
        使用模型=raw.get("使用模型", []),
        环节=_to_level("环节"),
        二级分类=_to_level("二级分类"),
        三级分类=_to_level("三级分类"),
        各级分数明细=raw.get("各级分数明细", {}),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 直接运行入口
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("nev_api:app", host="0.0.0.0", port=8000, reload=False)
