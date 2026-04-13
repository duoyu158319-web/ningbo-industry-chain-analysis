from sqlalchemy import Column, Integer, String, Float, Boolean, Text
from core.database import Base

class Enterprise(Base):
    """
    企业基础信息核心模型 - 对齐 CSV 全字段 + PRD 扩展字段
    """
    __tablename__ = "enterprises"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), index=True, nullable=False, comment="企业名称")

    # 基础状态
    revenue = Column(String(100), default="未公开", comment="营收，如 '¥1.2亿'")
    data_source = Column(String(50), default="qichacha", comment="数据来源: qichacha/nev_custom")
    reliability = Column(Integer, default=0, comment="可信度 0-100")
    status = Column(String(50), default="verified", comment="状态: new/pending/verified/anomaly")
    valuation = Column(String(100), comment="估值，如 '¥42.1亿'")
    growth_rate = Column(String(50), comment="增长率，如 '+12.4%'")

    # 产业链归属
    industry_chain = Column(String(100), index=True, nullable=False, comment="产业链，如 '新能源汽车'")
    chain_node = Column(String(100), index=True, nullable=False, comment="二级分类节点，如 '核心零部件'")
    chain_position = Column(String(50), index=True, nullable=False, comment="链位: upstream/midstream/downstream")
    # NOTE: 三级分类是更精细的节点标签，后续可通过识别模块关联到 chain_node_definition
    sub_node = Column(String(100), nullable=True, index=True, comment="三级分类节点")
    sub_node_score = Column(Float, default=0.0, comment="三级分类置信度x100")

    # 产业关联评分
    association_level = Column(String(20), default="中", comment="关联强度：强/较强/中")
    association_score = Column(Float, default=0.0, comment="环节置信度x100 (0-100)")
    coverage_score = Column(Float, default=0.0, comment="二级分类置信度x100 (0-100)")
    patent_similarity_score = Column(Float, default=0.0, comment="专利相似度 (0-100)")
    scale_percentile = Column(Float, default=0.0, comment="规模得分分位")
    patent_count = Column(Integer, default=0, comment="专利数量")
    has_patent = Column(Boolean, default=False, comment="是否使用专利")
    is_listed = Column(Boolean, default=False, comment="是否上市")
    # NOTE: 代表性评分 = 专利35% + 上市30% + 注册资本25% + 参保人数10%（节点内归一化）
    representative_score = Column(Float, default=0.0, comment="节点内代表性综合评分 (0-1)")

    # 工商基础信息
    credit_code = Column(String(50), unique=True, index=True, comment="统一社会信用代码")
    reg_status = Column(String(50), default="存续", comment="登记状态")
    legal_representative = Column(String(100), comment="法定代表人")
    org_type = Column(String(100), comment="企业(机构)类型")
    scale = Column(String(20), comment="企业规模：微型/小型/中型/大型")
    registered_capital = Column(Float, default=0.0, comment="注册资本（万元）")
    paid_in_capital = Column(Float, default=0.0, comment="实缴资本（万元）")
    founded_date = Column(String(50), comment="成立日期 YYYY-MM-DD")
    approved_date = Column(String(50), comment="核准日期 YYYY-MM-DD")
    business_term = Column(String(100), comment="营业期限")
    insured_employees = Column(Integer, default=0, comment="参保人数")
    latest_report_year = Column(String(10), comment="最新年报年份")
    taxpayer_type = Column(String(50), comment="纳税人资质")
    reg_authority = Column(String(100), comment="登记机关")
    registered_address = Column(Text, comment="企业地址（工商登记）")
    business_scope = Column(Text, comment="经营范围全文")
    description = Column(Text, comment="企业简介")
    former_names = Column(Text, comment="曾用名，多个以逗号分隔")
    english_name = Column(String(500), comment="英文名")
    phone = Column(String(200), comment="主要联系电话")
    website = Column(String(255), comment="官网 URL")
    email = Column(String(255), comment="联系邮箱")

    # 行政区划
    province = Column(String(50), default="浙江省", comment="所属省份")
    city = Column(String(50), default="宁波市", comment="所属城市")
    location = Column(String(100), index=True, comment="所属区县，如 '鄞州区'")

    # 国标行业分类
    industry_category = Column(String(100), comment="国标行业门类，如 '制造业'")
    industry_major = Column(String(100), comment="国标行业大类，如 '汽车制造业'")
    industry_medium = Column(String(100), comment="国标行业中类")
    industry_minor = Column(String(100), comment="国标行业小类")

    # 空间地理信息
    lat = Column(Float, nullable=True, comment="纬度")
    lng = Column(Float, nullable=True, comment="经度")
    geo_status = Column(String(50), default="done", comment="地理编码状态: done/pending/failed")
    geo_address_matched = Column(String(255), comment="地理编码匹配到的地址")
    geo_score = Column(Float, default=0.0, comment="地理编码得分 0-100")
    geo_type = Column(String(50), comment="地理编码类型，如 '门址'")

    def __repr__(self):
        return f"<Enterprise(name='{self.name}', node='{self.chain_node}')>"
