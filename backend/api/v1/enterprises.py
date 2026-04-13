from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import List, Optional

from core.database import get_db
from models.enterprise import Enterprise
from schemas.enterprise import (
    EnterpriseDetailSchema, EnterpriseMapPoint,
    EnterpriseCreate, EnterpriseCreatedResponse,
    calc_association_level,
)
from schemas.base import ApiResponse, PaginationMeta
from services import amap_service

router = APIRouter()

# NOTE: 前端传中文链位，数据库存英文，此处做映射
_POSITION_ZH_TO_EN: dict[str, str] = {
    "上游": "upstream", "中游": "midstream", "下游": "downstream",
}


@router.get("/", response_model=ApiResponse[List[EnterpriseDetailSchema]])
def get_enterprises(
    industry_chain: Optional[str] = None,
    chain_node: Optional[str] = None,
    sub_node: Optional[str] = None,
    chain_position: Optional[str] = None,
    keyword: Optional[str] = None,
    scale: Optional[str] = None,
    location: Optional[str] = None,
    association_level: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """查询企业列表，支持分页与多维条件过滤。
    - chain_position 支持中文（上游）和英文（upstream）两种格式
    - chain_node 同时匹配 chain_node 和 sub_node 字段，实现三级节点过滤
    """
    query = db.query(Enterprise)

    if industry_chain:
        query = query.filter(Enterprise.industry_chain == industry_chain)

    # NOTE: 兼容前端传中文、数据库存英文
    if chain_position and chain_position not in ("全部", "all"):
        en_pos = _POSITION_ZH_TO_EN.get(chain_position, chain_position)
        query = query.filter(Enterprise.chain_position == en_pos)

    # NOTE: 链节点过滤同时检查 chain_node 和 sub_node，支持三级节点直接过滤
    if chain_node:
        nodes = [n.strip() for n in chain_node.split(",") if n.strip()]
        query = query.filter(
            or_(Enterprise.chain_node.in_(nodes), Enterprise.sub_node.in_(nodes))
        )

    if sub_node:
        subs = [s.strip() for s in sub_node.split(",") if s.strip()]
        query = query.filter(Enterprise.sub_node.in_(subs))

    if keyword:
        query = query.filter(Enterprise.name.like(f"%{keyword}%"))
    if scale and scale not in ("全部",):
        query = query.filter(Enterprise.scale == scale)
    if location and location not in ("全部", "-"):
        query = query.filter(Enterprise.location == location)
    if association_level and association_level not in ("全部",):
        query = query.filter(Enterprise.association_level == association_level)

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    for item in items:
        setattr(item, "data_source_front", "企查查" if item.data_source == "qichacha" else "自建")

    return ApiResponse(
        data=items,
        pagination=PaginationMeta(page=page, page_size=page_size, total=total)
    )


@router.post("/", response_model=ApiResponse[EnterpriseCreatedResponse])
async def create_enterprise(body: EnterpriseCreate, db: Session = Depends(get_db)):
    """
    新增企业（自建数据源）。

    NOTE: 若提供了 registered_address 但未提供 lat/lng，
          后端自动调用高德地理编码接口填充坐标和区县信息。
    """
    lat: Optional[float] = body.lat
    lng: Optional[float] = body.lng
    district: Optional[str] = body.location

    # 自动地理编码：有地址、缺坐标时触发
    if body.registered_address and (lat is None or lng is None):
        geo = await amap_service.geocode(body.registered_address)
        if geo:
            lat = geo["lat"]
            lng = geo["lng"]
            if not district:
                district = geo["district"]

    ent = Enterprise(
        name=body.name,
        industry_chain=body.industry_chain,
        chain_node=body.chain_node,
        chain_position=body.chain_position,
        registered_address=body.registered_address,
        location=district,
        lat=lat,
        lng=lng,
        geo_status="done" if lat is not None and lng is not None else "pending",
        legal_representative=body.legal_representative,
        credit_code=body.credit_code,
        registered_capital=body.registered_capital or 0.0,
        founded_date=body.founded_date,
        description=body.description,
        # NOTE: 自建数据来源标记
        data_source="nev_custom",
        # NOTE: 新增企业暂无专利数据， score=0，计算得到“中”；后续批量计算后可知行重新回塡
        association_level=calc_association_level(0.0),
    )
    db.add(ent)
    db.commit()
    db.refresh(ent)
    return ApiResponse(data=ent)


@router.get("/map-points/", response_model=ApiResponse[List[EnterpriseMapPoint]])
def get_map_points(
    industry_chain: Optional[str] = None,
    chain_position: Optional[str] = None,
    chain_nodes: Optional[str] = None,
    location: Optional[str] = None,
    scale_list: Optional[str] = None,
    association_level: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    地图散点数据，支持多维度过滤。

    参数说明：
        industry_chain   : 产业链名称，如 "新能源汽车"
        chain_position   : 链位英文，如 "upstream" / "midstream" / "downstream"
        chain_nodes      : 二级节点，逗号分隔，如 "汽车零部件,充电桩"
        location         : 区县，如 "鄞州区"（当前数据库仅下沉到区县级别）
        scale_list       : 企业规模，逗号分隔，如 "大型,中型"（匹配 Enterprise.scale 字段）
        association_level: 关联强度，如 "强" / "较强" / "中"
    """
    query = db.query(Enterprise).filter(
        Enterprise.lat.isnot(None),
        Enterprise.geo_status == "done",
    )

    # NOTE: 产业链过滤——仅显示指定产业链企业；无数据的产业链返回空列表
    if industry_chain:
        query = query.filter(Enterprise.industry_chain == industry_chain)

    # 链位过滤（前端传英文：upstream/midstream/downstream）
    if chain_position and chain_position not in ("全部", "all"):
        query = query.filter(Enterprise.chain_position == chain_position)

    # NOTE: 节点多选支持二级节点（chain_node）和三级节点（sub_node）双层匹配。
    #       产业链图谱跳转时传入的是三级节点名（如"汽车动力电池"），
    #       企业 chain_node 存储二级名（如"核心零部件"），需同时检查 sub_node 字段。
    if chain_nodes:
        from sqlalchemy import or_
        nodes = [n.strip() for n in chain_nodes.split(",") if n.strip()]
        if nodes:
            query = query.filter(
                or_(
                    Enterprise.chain_node.in_(nodes),
                    Enterprise.sub_node.in_(nodes),
                )
            )

    # 区县过滤
    if location and location not in ("宁波市", "全部"):
        query = query.filter(Enterprise.location == location)

    # 企业规模多选（逗号分隔，匹配数据库 scale 字段）
    if scale_list and scale_list not in ("全部",):
        scales = [s.strip() for s in scale_list.split(",") if s.strip() and s.strip() != "全部"]
        if scales:
            # NOTE: 数据库中 scale 字段存储"大型"/"中型"/"小微"等中文标签
            query = query.filter(Enterprise.scale.in_(scales))

    # 关联强度过滤
    if association_level and association_level not in ("全部",):
        query = query.filter(Enterprise.association_level == association_level)

    items = query.all()
    return ApiResponse(data=items)


@router.get("/{id}/", response_model=ApiResponse[EnterpriseDetailSchema])
def get_enterprise_detail(
    id: int,
    db: Session = Depends(get_db)
):
    """企业详细信息读取"""
    ent = db.query(Enterprise).filter(Enterprise.id == id).first()
    if ent:
        setattr(ent, "data_source_front", "企查查" if ent.data_source == "qichacha" else "自建")
    return ApiResponse(data=ent)
