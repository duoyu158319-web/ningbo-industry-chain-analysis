from typing import Literal, Optional
from pydantic import BaseModel, Field

# NOTE: 关联强度枚举，全局统一，禁止在此之外使用其他字符串
AssociationLevel = Literal['强', '较强', '中']

def calc_association_level(patent_similarity_score: float) -> str:
    """
    根据 patent_similarity_score（百分制 0-100）计算关联强度。
    强  : ≥ 80
    较强: ≥ 60
    中  : 其余（包括 score=0 无专利情况）
    """
    score = patent_similarity_score or 0.0
    if score >= 80:
        return '强'
    if score >= 60:
        return '较强'
    return '中'

class EnterpriseBase(BaseModel):
    # 此处映射前端的基本 Enterprise 模式
    # NOTE: revenue/location 等数据库字段实际可能为 NULL，统一改为 Optional 防止序列化报 422
    id: str | int
    name: str
    chainSegment: Optional[str] = Field(alias="chain_position", default=None)
    revenue: Optional[str] = None
    dataSource: Optional[str] = Field(alias="data_source_front", default=None)
    reliability: Optional[int] = None
    location: Optional[str] = None
    status: Optional[str] = "verified"
    description: Optional[str] = None
    valuation: Optional[str] = None
    growthRate: Optional[str] = Field(alias="growth_rate", default=None)

    class Config:
        populate_by_name = True
        from_attributes = True

class EnterpriseDetailSchema(EnterpriseBase):
    # 完整属性拓展，所有数据库中可能为 NULL 的字段设为 Optional
    credit_code: Optional[str] = None
    registered_capital: Optional[float] = None
    paid_in_capital: Optional[float] = None
    founded_date: Optional[str] = None
    reg_status: Optional[str] = None
    legal_representative: Optional[str] = None
    org_type: Optional[str] = None
    insured_employees: Optional[int] = None
    reg_authority: Optional[str] = None
    registered_address: Optional[str] = None
    business_scope: Optional[str] = None

    industry_chain: Optional[str] = None
    chain_node: Optional[str] = None
    chain_position: Optional[str] = None
    sub_node: Optional[str] = None

    association_level: Optional[AssociationLevel] = None
    association_score: Optional[float] = None
    coverage_score: Optional[float] = None
    patent_similarity_score: Optional[float] = None
    scale_percentile: Optional[float] = None
    patent_count: Optional[int] = None
    is_listed: Optional[bool] = None
    scale: Optional[str] = None

    lat: Optional[float] = None
    lng: Optional[float] = None
    geo_status: Optional[str] = None

    class Config:
        from_attributes = True

# 轻量化返回用于散点图
class EnterpriseMapPoint(BaseModel):
    id: str | int
    name: str
    lat: float
    lng: float
    chain_position: str
    association_level: AssociationLevel = '中'  # 默认中，实际由 patent_similarity_score 计算

    class Config:
        from_attributes = True


# ────────── 新增企业 Schema ──────────

class EnterpriseCreate(BaseModel):
    """新增企业的请求体。提供 registered_address 时，若未填 lat/lng，后端将自动调用高德地理编码补全坐标。"""
    name: str = Field(..., description="企业名称")
    industry_chain: str = Field(..., description="所属产业链，如 '新能源汽车'")
    chain_node: str = Field(..., description="核心节点，如 '正极材料'")
    chain_position: str = Field(..., description="链位：upstream / midstream / downstream")

    registered_address: Optional[str] = Field(None, description="注册地址，用于自动地理编码")
    location: Optional[str] = Field(None, description="区县名，如 '鄞州区'，可由地理编码自动填充")
    lat: Optional[float] = Field(None, description="纬度，可由地理编码自动填充")
    lng: Optional[float] = Field(None, description="经度，可由地理编码自动填充")

    legal_representative: Optional[str] = None
    credit_code: Optional[str] = None
    registered_capital: Optional[float] = 0.0
    founded_date: Optional[str] = None
    description: Optional[str] = None


class EnterpriseCreatedResponse(BaseModel):
    """新增企业成功后的响应（轻量级，仅返回核心字段）"""
    id: int
    name: str
    industry_chain: str
    chain_node: str
    chain_position: str
    location: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    geo_status: str

    class Config:
        from_attributes = True
