from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import math

from core.database import get_db
from models.enterprise import Enterprise
from schemas.spatial import (
    BufferRequest, BufferResponseData,
    GeocodeRequest, GeocodeResponse,
    IsochroneRequest, IsochroneResponse,
)
from schemas.base import ApiResponse
from services import amap_service

router = APIRouter()


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    地球两点的大圆距离计算（Haversine 公式，单位 km）
    NOTE: 用于缓冲区内点的筛选，精度满足城市级别分析需求
    """
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


@router.post("/buffer/", response_model=ApiResponse[BufferResponseData])
def compute_buffer(req: BufferRequest, db: Session = Depends(get_db)):
    """基于 Haversine 距离的点周边缓冲区查询（纯本地计算，无需调用外部 API）"""
    center_ent = db.query(Enterprise).filter(Enterprise.id == req.enterprise_id).first()
    if not center_ent or not center_ent.lat or not center_ent.lng:
        return ApiResponse(code=400, message="Center enterprise not found or lacks coordinates")

    all_ents = db.query(Enterprise).filter(
        Enterprise.industry_chain == req.industry_chain,
        Enterprise.lat != None,
        Enterprise.id != center_ent.id
    ).all()

    results = []
    summary: dict[str, int] = {}

    for e in all_ents:
        dist = haversine_distance(center_ent.lat, center_ent.lng, e.lat, e.lng)
        if dist <= req.radius_km:
            results.append({
                "name": e.name,
                "chain_node": e.chain_node,
                "chain_position": e.chain_position,
                "association_level": e.association_level,
                "distance_km": round(dist, 2)
            })
            summary[e.association_level] = summary.get(e.association_level, 0) + 1

    results.sort(key=lambda x: x["distance_km"])

    return ApiResponse(
        data=BufferResponseData(
            center={"name": center_ent.name, "lng": center_ent.lng, "lat": center_ent.lat},
            radius_km=req.radius_km,
            results=results,
            summary=summary
        )
    )


@router.post("/geocode/", response_model=ApiResponse[GeocodeResponse])
async def geocode_address(body: GeocodeRequest):
    """
    地址地理编码代理接口（调用高德 v3/geocode/geo）

    NOTE: 接收地址字符串，返回经纬度 + 所属区县 + 标准化地址。
          Key 保留在后端，前端不接触高德原始 API。
    """
    result = await amap_service.geocode(body.address)
    if not result:
        return ApiResponse(code=400, message=f"地理编码失败，请检查地址是否正确：{body.address}")
    return ApiResponse(data=GeocodeResponse(**result))


@router.post("/isochrone/", response_model=ApiResponse[IsochroneResponse])
async def compute_isochrone(body: IsochroneRequest):
    """
    等时圈分析接口（调用高德路径规划接口，多方向截取法）

    NOTE: 向 8 个方向各发起一次高德路径规划请求，截取时间限制内的最远点，
          连成近似等时圈多边形。小于真实等时圈（偏保守），满足可视化需求。
    """
    polygon = await amap_service.compute_isochrone(
        center_lng=body.lng,
        center_lat=body.lat,
        travel_time_min=body.travel_time_min,
        mode=body.mode,
    )
    return ApiResponse(
        data=IsochroneResponse(
            polygon=polygon,
            center=[body.lng, body.lat],
            travel_time_min=body.travel_time_min,
            mode=body.mode,
        )
    )
