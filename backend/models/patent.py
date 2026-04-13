# -*- coding: utf-8 -*-
from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey
from core.database import Base


class Patent(Base):
    """
    专利表：存储与企业关联的专利基本信息。
    enterprise_id 可为 NULL（孤立专利，尚未关联到企业）。
    ipc_codes 存储逗号分隔的 IPC 分类号，如 "H01M4/36,H01M10/0525"。
    """
    __tablename__ = "patents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    enterprise_id = Column(Integer, ForeignKey("enterprises.id", ondelete="SET NULL"), nullable=True, index=True)

    title = Column(String(500), nullable=False, comment="专利标题")
    abstract = Column(Text, nullable=True, comment="摘要")
    # NOTE: 多个 IPC 号逗号分隔，如 "H01M4/36,H01M10/0525,C01G45/12"
    ipc_codes = Column(String(500), nullable=True, comment="IPC分类号，逗号分隔")
    patent_type = Column(String(50), default="发明", comment="发明 / 实用新型 / 外观设计")
    pub_date = Column(String(50), nullable=True, comment="公开日期，如 2022-05-18")
    applicant = Column(String(255), nullable=True, comment="申请人名称")
    # NOTE: manual=手动录入, import=批量导入, cnipa=知识产权局API获取
    source = Column(String(50), default="manual", comment="数据来源")


class ChainKeyword(Base):
    """
    产业链分词知识库。
    存储三个层级的行业关键词，作为：
      1. TF-IDF 训练时的词汇白名单（过滤通用词、保留专业术语）
      2. 无训练模型时的兜底关键词匹配
      3. 前端识别结果"命中关键词"解释性展示

    三个层级（level 字段）：
      - chain:    产业链级通用词，如 "NEV"、"锂电池"
      - position: 链位级通用词，如 "化工原料"（适用 upstream）
      - node:     节点级精确词，如 "磷酸铁锂"（适用 正极材料 节点）
    """
    __tablename__ = "chain_keyword"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # NULL 表示跨链通用
    industry_chain = Column(String(100), nullable=True, index=True, comment="所属产业链")
    # NULL 表示链级通用词（不限链位）
    chain_position = Column(String(50), nullable=True, comment="链位: upstream/midstream/downstream")
    # NULL 表示链位级通用词（不限节点）
    node_name = Column(String(100), nullable=True, index=True, comment="节点名称")

    keyword = Column(String(200), nullable=False, comment="关键词，如 '磷酸铁锂'")
    # NOTE: 专家标注的重要性权重，相当于 IDF 的领域先验
    weight = Column(Float, default=1.0, comment="权重 0.0~1.0，核心术语=1.0")
    level = Column(String(20), default="node", comment="层级: chain / position / node")


class NodeIpcMapping(Base):
    """
    节点-IPC 前缀映射表（用于专利的 IPC 直接匹配）。
    使用前缀匹配策略，如 ipc_prefix="H01M4" 可匹配 "H01M4/36"、"H01M4/505" 等。
    支持一个节点对应多个 IPC 前缀，权重可不同。
    """
    __tablename__ = "node_ipc_mapping"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    industry_chain = Column(String(100), nullable=False, index=True)
    chain_position = Column(String(50), nullable=False)
    node_name = Column(String(100), nullable=False, index=True)
    # IPC 前缀，如 "H01M4"，匹配时用 ipc_code.startswith(ipc_prefix)
    ipc_prefix = Column(String(20), nullable=False, comment="IPC前缀，前缀匹配，如 H01M4")
    match_weight = Column(Float, default=1.0, comment="命中权重 0.0~1.0")
