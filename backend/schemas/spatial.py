from pydantic import BaseModel, Field
from typing import List, Dict, Optional


# ────────── 缓冲区分析（已有） ──────────

class BufferRequest(BaseModel):
    enterprise_id: int
    radius_km: float
    industry_chain: str


class BufferEnterprise(BaseModel):
    name: str
    chain_node: str
    chain_position: str
    association_level: str
    distance_km: float


class BufferResponseData(BaseModel):
    center: Dict[str, float | str]  # {"name", "lat", "lng"}
    radius_km: float
    results: List[BufferEnterprise]
    summary: Dict[str, int]


# ────────── 地理编码（新增） ──────────

class GeocodeRequest(BaseModel):
    address: str = Field(..., description="待编码地址，如 '宁波市鄞州区中河路55号'")


class GeocodeResponse(BaseModel):
    lng: float
    lat: float
    district: str = Field(description="所属区县，如 '鄞州区'")
    formatted_address: str = Field(description="高德标准化后的完整地址")


# ────────── 等时圈分析（新增） ──────────

class IsochroneRequest(BaseModel):
    lng: float = Field(..., description="中心点经度")
    lat: float = Field(..., description="中心点纬度")
    travel_time_min: int = Field(..., ge=5, le=120, description="等时圈时间（分钟），范围 5~120")
    mode: str = Field(default="driving", description="出行方式：driving（驾车）| walking（步行）")


class IsochroneResponse(BaseModel):
    polygon: List[List[float]] = Field(description="等时圈多边形顶点列表 [[lng, lat], ...]")
    center: List[float] = Field(description="中心点坐标 [lng, lat]")
    travel_time_min: int
    mode: str
