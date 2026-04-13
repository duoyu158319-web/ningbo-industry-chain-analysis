# -*- coding: utf-8 -*-
"""
转型看板 API
提供真实的企业转型指标聚合数据、排行榜、专利IPC分布和地图坐标点。
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from typing import List, Optional
from collections import defaultdict

from core.database import get_db
from models.enterprise import Enterprise
from models.patent import Patent, NodeIpcMapping
from schemas.base import ApiResponse
from pydantic import BaseModel

router = APIRouter()


# ────────── Response Schemas ──────────

class TransitionMetrics(BaseModel):
    """转型看板顶部指标卡数据"""
    total_enterprises: int
    enterprises_with_patents: int
    avg_transition_index: float     # representative_score × 100，保留1位小数
    leading_enterprises: int        # representative_score >= 0.7


class TransitionRankItem(BaseModel):
    """排行榜单条"""
    rank: int
    name: str
    chain_node: str
    chain_position: str
    score: float        # representative_score × 100
    patents: int
    is_listed: bool


class PatentDistItem(BaseModel):
    """专利IPC分布单条"""
    ipc_prefix: str     # 如 "H01M"
    count: int
    percentage: float   # 0~100


class TransitionMapPoint(BaseModel):
    """地图散点：企业坐标 + 转型指数"""
    id: int
    name: str
    lat: float
    lng: float
    chain_node: str
    chain_position: str
    transition_index: float  # representative_score × 100


class TransitionDashboardData(BaseModel):
    metrics: TransitionMetrics
    ranking: List[TransitionRankItem]
    patent_distribution: List[PatentDistItem]
    map_points: List[TransitionMapPoint]


# ── 常见 IPC 前缀的中文分类说明（用于前端展示） ──
IPC_LABELS: dict[str, str] = {
    "H01M": "电化学(电池)",
    "B60L": "电动推进",
    "H02K": "电机技术",
    "H02P": "电机控制",
    "B60K": "车辆驱动",
    "G06N": "人工智能",
    "C08J": "高分子材料",
    "H01L": "半导体",
    "A61K": "医药制剂",
    "A61P": "医疗用途",
    "其他": "其他",
}


@router.get("/dashboard/", response_model=ApiResponse[TransitionDashboardData])
def get_transition_dashboard(
    industry_chain: Optional[str] = Query(None, description="产业链名称，如 '新能源汽车'"),
    district: Optional[str] = Query(None, description="区县名称，如 '鄞州区'"),
    db: Session = Depends(get_db),
):
    """
    转型看板聚合数据接口。
    - industry_chain 为 None 时统计全产业链
    - district 为 None 时统计全区域
    """
    # ── 基础查询条件构建 ──
    ent_query = db.query(Enterprise)
    if industry_chain:
        ent_query = ent_query.filter(Enterprise.industry_chain == industry_chain)
    if district:
        ent_query = ent_query.filter(Enterprise.location == district)

    # ─── 1. 指标卡统计 ───────────────────────────────────────────────────────
    total_enterprises = ent_query.count()

    # 有专利的企业数（patent_count > 0）
    enterprises_with_patents = ent_query.filter(Enterprise.patent_count > 0).count()

    # 平均转型指数（representative_score × 100）
    avg_score_result = ent_query.with_entities(
        func.avg(Enterprise.representative_score)
    ).scalar()
    avg_transition_index = round((avg_score_result or 0.0) * 100, 1)

    # 领先企业数（产业校准阈值：宁波NEV产业链实际分布≥0.55为领先）
    leading_enterprises = ent_query.filter(
        Enterprise.representative_score >= 0.55
    ).count()

    metrics = TransitionMetrics(
        total_enterprises=total_enterprises,
        enterprises_with_patents=enterprises_with_patents,
        avg_transition_index=avg_transition_index,
        leading_enterprises=leading_enterprises,
    )

    # ─── 2. 排行榜（前20，按representative_score降序） ──────────────────────
    top_ents = (
        ent_query
        .order_by(Enterprise.representative_score.desc())
        .limit(20)
        .all()
    )
    ranking = [
        TransitionRankItem(
            rank=i + 1,
            name=ent.name,
            chain_node=ent.chain_node or "—",
            chain_position=ent.chain_position or "—",
            score=round(ent.representative_score * 100, 1),
            patents=ent.patent_count or 0,
            is_listed=ent.is_listed or False,
        )
        for i, ent in enumerate(top_ents)
    ]

    # ─── 3. 专利IPC分布（仅统计命中 node_ipc_mapping 前缀的转型专利）──────────
    # NOTE: 先加载全局转型 IPC 前缀表，按前缀匹配过滤，确保分布图只展示有转型意义的技术方向
    all_prefixes = [
        row.ipc_prefix.strip()
        for row in db.query(NodeIpcMapping.ipc_prefix).distinct().all()
        if row.ipc_prefix
    ]
    ent_ids = [row.id for row in ent_query.with_entities(Enterprise.id).all()]

    ipc_counter: dict[str, int] = defaultdict(int)
    if ent_ids and all_prefixes:
        patents_q = (
            db.query(Patent.ipc_codes)
            .filter(
                Patent.enterprise_id.in_(ent_ids),
                Patent.ipc_codes.isnot(None),
                Patent.ipc_codes != "",
            )
            .all()
        )

        for (ipc_raw,) in patents_q:
            for code in ipc_raw.split(","):
                code = code.strip()
                if not code:
                    continue
                # NOTE: 只计入命中转型前缀的 IPC 号，以 node_ipc_mapping 中的 prefix 作为分类键
                for prefix in all_prefixes:
                    if code.startswith(prefix):
                        ipc_counter[prefix] += 1
                        break  # 每条 IPC 号最多命中一个前缀，避免重复计数

    total_patents_counted = sum(ipc_counter.values())

    # 按数量降序，取前6个，其余归入"其他"
    sorted_ipc = sorted(ipc_counter.items(), key=lambda x: x[1], reverse=True)
    top6 = sorted_ipc[:6]
    other_count = sum(v for _, v in sorted_ipc[6:])

    patent_distribution: list[PatentDistItem] = []
    for prefix, count in top6:
        pct = round(count / total_patents_counted * 100, 1) if total_patents_counted > 0 else 0.0
        patent_distribution.append(PatentDistItem(
            ipc_prefix=prefix,
            count=count,
            percentage=pct,
        ))
    if other_count > 0:
        pct = round(other_count / total_patents_counted * 100, 1) if total_patents_counted > 0 else 0.0
        patent_distribution.append(PatentDistItem(
            ipc_prefix="其他",
            count=other_count,
            percentage=pct,
        ))

    # ─── 4. 地图散点（有坐标的企业） ─────────────────────────────────────────
    map_ents = (
        ent_query
        .filter(
            Enterprise.lat.isnot(None),
            Enterprise.lng.isnot(None),
            Enterprise.geo_status == "done",
        )
        .all()
    )
    map_points = [
        TransitionMapPoint(
            id=ent.id,
            name=ent.name,
            lat=ent.lat,
            lng=ent.lng,
            chain_node=ent.chain_node or "—",
            chain_position=ent.chain_position or "—",
            transition_index=round(ent.representative_score * 100, 1),
        )
        for ent in map_ents
    ]

    return ApiResponse(
        data=TransitionDashboardData(
            metrics=metrics,
            ranking=ranking,
            patent_distribution=patent_distribution,
            map_points=map_points,
        )
    )
