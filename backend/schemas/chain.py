from pydantic import BaseModel
from typing import List, Dict, Optional

class ChainNodeItem(BaseModel):
    """单个叶子节点定义"""
    label: str          # 显示名称
    value: str          # 传给 chain_nodes 过滤参数的实际值（对应企业表 chain_node 字段）
    parent: Optional[str] = None  # 所属一级节点名（有二级时填写）

class ChainNodePosition(BaseModel):
    industry_chain: str
    positions: Dict[str, List[ChainNodeItem]]  # key = chain_position 英文（upstream/midstream/downstream）

class NodeStatsBase(BaseModel):
    id: str
    label: str
    type: str # upstream/midstream/downstream
    status: str # advantage/potential/weakness/blank
    ningbo_count: int
    national_count: int
    scale_score: float
    tech_score: float
    linkage_score: float
    node_level: str
    count_ratio_pct: float
    # NOTE: 二级子节点名如“汽车动力电池”； parent_name 用于前端分组框渲染
    node2_name: Optional[str] = None
    parent_name: Optional[str] = None

class ChainGraphEdge(BaseModel):
    source: str
    target: str

class ChainGraphData(BaseModel):
    nodes: List[NodeStatsBase]
    edges: List[ChainGraphEdge]

class NodeEnterprise(BaseModel):
    id: int
    name: str
    is_listed: bool
    patent_count: int

class ChainNodeDetail(BaseModel):
    node_name: str
    chain_position: str
    node_level: str
    ningbo_count: int
    national_count: int
    count_ratio_pct: float
    ningbo_patents: int
    tech_self_rate: float
    scale_score: float
    tech_score: float
    linkage_score: float
    upstream_nodes: List[Dict[str, str]]
    downstream_nodes: List[Dict[str, str]]
    od_distances: Dict[str, float]
    suggestion: str
    top_enterprises: List[NodeEnterprise]
