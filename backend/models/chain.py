from sqlalchemy import Column, Integer, String, Float, ForeignKey
from core.database import Base

class ChainNodeDefinition(Base):
    """产业链节点定义 (侧边栏筛选与图谱构建依赖)"""
    __tablename__ = "chain_node_definition"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    industry_chain = Column(String(100), index=True, nullable=False, comment="所属产业链")
    chain_position = Column(String(50), nullable=False, comment="所属链位 (upstream/midstream/downstream 或各产业自定义)")
    node_name = Column(String(100), nullable=False, index=True, comment="一级节点名称，如'核心零部件'")
    # NOTE: node2_name 为二级子节点，如 node_name='核心零部件' 下的 '汽车动力电池'
    #       为空则表示该行本身就是叶子节点
    node2_name = Column(String(100), nullable=True, index=True, comment="二级子节点名称（可为空）")
    node_level = Column(String(50), default="空白节点", comment="评级: 优势节点/潜力节点/薄弱节点/空白节点")
    ningbo_count = Column(Integer, default=0, comment="宁波本地企业数")
    national_count = Column(Integer, default=0, comment="全国同类企业数")
    scale_score = Column(Float, default=0.0)
    tech_score = Column(Float, default=0.0)
    linkage_score = Column(Float, default=0.0)

class ChainRelation(Base):
    """节点流向关系表"""
    __tablename__ = "chain_relation"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    industry_chain = Column(String(100), index=True, nullable=False)
    from_node = Column(String(100), nullable=False)
    to_node = Column(String(100), nullable=False)
