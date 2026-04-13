# -*- coding: utf-8 -*-
"""
数据库初始化脚本 - 建表并填充宁波产业链 Mock 数据
运行方式: 在 backend/ 目录下执行 py -3 seed/init_data.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.enterprise import Enterprise
from models.chain import ChainNodeDefinition, ChainRelation
# NOTE: 导入新模型，确保 Base.metadata.create_all() 时会创建对应数据库表
from models.patent import Patent, ChainKeyword, NodeIpcMapping  # noqa: F401
from core.database import SessionLocal, engine, Base


def init_db():
    print("[1/5] 正在创建数据库表结构（含新增 patents / chain_keyword / node_ipc_mapping）...")
    Base.metadata.create_all(bind=engine)
    print("[OK] 表结构就绪")
    print("      新增表：patents（专利）、chain_keyword（分词知识库）、node_ipc_mapping（IPC映射）")
    print("      请在启动后通过 Swagger 或直接操作数据库填入分词和IPC映射数据")

    db = SessionLocal()

    if db.query(Enterprise).count() > 0:
        print("[SKIP] 数据已存在，跳过初始化。如需重置请先清空数据库表。")
        db.close()
        return

    print("[2/4] 正在写入企业数据...")
    enterprises = [
        Enterprise(
            name="宁波瑞曼新能源材料有限公司",
            revenue="86.3亿", data_source="qichacha", reliability=95,
            location="鄞州区", industry_chain="新能源汽车",
            chain_node="正极材料", chain_position="upstream",
            association_level="强", association_score=92.5,
            coverage_score=88.0, patent_similarity_score=74.0,
            scale_percentile=92.0, patent_count=34, is_listed=True,
            credit_code="91330201MA2H1X8Y0A", registered_capital=86300,
            founded_date="2008-05-12", reg_status="存续",
            legal_representative="张建国", org_type="有限责任公司",
            insured_employees=1240, reg_authority="宁波市市场监督管理局",
            registered_address="宁波市鄞州区高新区智慧路888号",
            business_scope="新能源材料、锂电池正极材料的研发、生产、销售",
            lat=29.815, lng=121.555, geo_status="done"
        ),
        Enterprise(
            name="宁波驰能动力科技有限公司",
            revenue="152.1亿", data_source="qichacha", reliability=88,
            location="北仑区", industry_chain="新能源汽车",
            chain_node="电芯制造", chain_position="midstream",
            association_level="强", association_score=96.1,
            coverage_score=95.0, patent_similarity_score=82.0,
            scale_percentile=98.0, patent_count=156, is_listed=True,
            credit_code="91330206MA2H4Y8X0C", registered_capital=152100,
            founded_date="2012-08-22", reg_status="存续",
            legal_representative="李明远", org_type="股份有限公司",
            insured_employees=4500, reg_authority="宁波市市场监督管理局",
            registered_address="宁波市北仑区滨海新城创业路100号",
            business_scope="动力电池制造、电芯生产、储能系统集成",
            lat=29.905, lng=121.845, geo_status="done"
        ),
        Enterprise(
            name="宁波天骏汽车零部件有限公司",
            revenue="34.5亿", data_source="nev_custom", reliability=72,
            location="慈溪市", industry_chain="新能源汽车",
            chain_node="整车配件", chain_position="downstream",
            association_level="较强", association_score=75.6,
            coverage_score=65.0, patent_similarity_score=54.0,
            scale_percentile=60.0, patent_count=12, is_listed=False,
            credit_code="91330282MA2H1Z9U0B", registered_capital=3450,
            founded_date="2015-11-05", reg_status="存续",
            legal_representative="王大伟", org_type="有限责任公司",
            insured_employees=340, reg_authority="慈溪市市场监督管理局",
            registered_address="宁波市慈溪市经济开发区工业路55号",
            business_scope="汽车零部件加工制造、模具设计，整车内外饰件",
            lat=30.170, lng=121.265, geo_status="done"
        ),
        Enterprise(
            name="宁波鑫辉电解液科技股份有限公司",
            revenue="45.2亿", data_source="qichacha", reliability=90,
            location="镇海区", industry_chain="新能源汽车",
            chain_node="电解液", chain_position="upstream",
            association_level="强", association_score=88.3,
            coverage_score=82.0, patent_similarity_score=79.0,
            scale_percentile=85.0, patent_count=67, is_listed=True,
            credit_code="91330211MA2G8X1Y0D", registered_capital=45200,
            founded_date="2010-03-18", reg_status="存续",
            legal_representative="陈志远", org_type="股份有限公司",
            insured_employees=820, reg_authority="宁波市市场监督管理局",
            registered_address="宁波市镇海区化工新材料园区A区5号",
            business_scope="锂离子电池电解液研发、生产与销售",
            lat=29.950, lng=121.718, geo_status="done"
        ),
        Enterprise(
            name="宁波华龙热管理系统有限公司",
            revenue="28.8亿", data_source="qichacha", reliability=78,
            location="余姚市", industry_chain="新能源汽车",
            chain_node="热管理系统", chain_position="midstream",
            association_level="较强", association_score=80.2,
            coverage_score=72.0, patent_similarity_score=68.0,
            scale_percentile=70.0, patent_count=29, is_listed=False,
            credit_code="91330281MA2G9R3Z0E", registered_capital=2880,
            founded_date="2017-06-30", reg_status="存续",
            legal_representative="周国强", org_type="有限责任公司",
            insured_employees=410, reg_authority="余姚市市场监督管理局",
            registered_address="宁波市余姚市工业园区环保路22号",
            business_scope="新能源汽车热管理系统设计制造",
            lat=30.037, lng=121.155, geo_status="done"
        ),
        Enterprise(
            name="宁波光芯半导体科技有限公司",
            revenue="23.5亿", data_source="qichacha", reliability=85,
            location="鄞州区", industry_chain="集成电路",
            chain_node="半导体材料", chain_position="upstream",
            association_level="强", association_score=91.0,
            coverage_score=86.0, patent_similarity_score=88.0,
            scale_percentile=80.0, patent_count=94, is_listed=False,
            credit_code="91330212MA281X8829", registered_capital=2350,
            founded_date="2015-06-12", reg_status="存续",
            legal_representative="张光远", org_type="有限责任公司",
            insured_employees=310, reg_authority="鄞州区市场监督管理局",
            registered_address="宁波市鄞州区科技园区光电大道88号",
            business_scope="半导体用蓝宝石晶体衬底开发及精密光学镀膜",
            lat=29.791, lng=121.629, geo_status="done"
        ),
        Enterprise(
            name="宁波先锋集成电路设计有限公司",
            revenue="16.3亿", data_source="qichacha", reliability=80,
            location="高新区", industry_chain="集成电路",
            chain_node="芯片设计", chain_position="midstream",
            association_level="较强", association_score=79.5,
            coverage_score=71.0, patent_similarity_score=84.0,
            scale_percentile=65.0, patent_count=52, is_listed=False,
            credit_code="91330215MA2G7P9X0F", registered_capital=1630,
            founded_date="2018-09-14", reg_status="存续",
            legal_representative="刘海鹏", org_type="有限责任公司",
            insured_employees=220, reg_authority="宁波高新区市场监督管理局",
            registered_address="宁波市高新区科技城创新路66号",
            business_scope="集成电路设计、嵌入式系统研发",
            lat=29.823, lng=121.583, geo_status="done"
        ),
        Enterprise(
            name="宁波博瑞生物制药有限公司",
            revenue="38.9亿", data_source="qichacha", reliability=82,
            location="鄞州区", industry_chain="生物医药",
            chain_node="生物药", chain_position="医药制品",
            association_level="强", association_score=87.2,
            coverage_score=80.0, patent_similarity_score=76.0,
            scale_percentile=75.0, patent_count=48, is_listed=True,
            credit_code="91330201MA2G5K7X0G", registered_capital=3890,
            founded_date="2011-04-25", reg_status="存续",
            legal_representative="孙丽华", org_type="股份有限公司",
            insured_employees=650, reg_authority="宁波市市场监督管理局",
            registered_address="宁波市鄞州区医疗器械产业园B区18号",
            business_scope="生物制药研发、生产、销售；医疗器械代理",
            lat=29.850, lng=121.598, geo_status="done"
        ),
        Enterprise(
            name="宁波康仁医疗器械股份有限公司",
            revenue="21.4亿", data_source="qichacha", reliability=76,
            location="江北区", industry_chain="生物医药",
            chain_node="医疗器械", chain_position="医疗器械",
            association_level="较强", association_score=76.8,
            coverage_score=68.0, patent_similarity_score=72.0,
            scale_percentile=62.0, patent_count=31, is_listed=False,
            credit_code="91330204MA2G3P5Y0H", registered_capital=2140,
            founded_date="2013-07-08", reg_status="存续",
            legal_representative="赵明亮", org_type="股份有限公司",
            insured_employees=480, reg_authority="宁波市市场监督管理局",
            registered_address="宁波市江北区生命健康产业园D栋",
            business_scope="医疗器械研发制造、手术设备代理销售",
            lat=29.897, lng=121.546, geo_status="done"
        ),
        Enterprise(
            name="宁波先进特种纤维有限公司",
            revenue="55.7亿", data_source="qichacha", reliability=88,
            location="奉化区", industry_chain="新材料",
            chain_node="特种纤维", chain_position="upstream",
            association_level="强", association_score=89.4,
            coverage_score=83.0, patent_similarity_score=81.0,
            scale_percentile=88.0, patent_count=78, is_listed=True,
            credit_code="91330213MA2F9R2Z0I", registered_capital=5570,
            founded_date="2009-11-20", reg_status="存续",
            legal_representative="邓志强", org_type="股份有限公司",
            insured_employees=1100, reg_authority="奉化区市场监督管理局",
            registered_address="宁波市奉化区工业新城滨海路200号",
            business_scope="碳纤维、玻璃纤维等特种纤维的研究开发与生产",
            lat=29.656, lng=121.408, geo_status="done"
        ),
        Enterprise(
            name="宁波智研科技有限公司",
            revenue="12.8亿", data_source="nev_custom", reliability=68,
            location="高新区", industry_chain="人工智能",
            chain_node="人工智能算法", chain_position="midstream",
            association_level="中", association_score=65.3,
            coverage_score=55.0, patent_similarity_score=71.0,
            scale_percentile=55.0, patent_count=22, is_listed=False,
            credit_code="91330215MA2G7Q4X0J", registered_capital=1280,
            founded_date="2019-03-15", reg_status="存续",
            legal_representative="吴宇航", org_type="有限责任公司",
            insured_employees=160, reg_authority="宁波高新区市场监督管理局",
            registered_address="宁波市高新区创业大道99号AI产业基地C座",
            business_scope="人工智能算法研发、智能制造解决方案",
            lat=29.832, lng=121.565, geo_status="done"
        ),
        Enterprise(
            name="宁波南方新材料有限公司",
            revenue="18.2亿", data_source="qichacha", reliability=75,
            location="象山县", industry_chain="新材料",
            chain_node="高分子材料", chain_position="midstream",
            association_level="较强", association_score=73.1,
            coverage_score=64.0, patent_similarity_score=60.0,
            scale_percentile=58.0, patent_count=18, is_listed=False,
            credit_code="91330226MA2F4T1K0K", registered_capital=1820,
            founded_date="2014-08-10", reg_status="存续",
            legal_representative="林国华", org_type="有限责任公司",
            insured_employees=290, reg_authority="象山县市场监督管理局",
            registered_address="宁波市象山县经济开发区发展路77号",
            business_scope="高分子材料及改性材料的研发、生产",
            lat=29.477, lng=121.867, geo_status="done"
        ),
        Enterprise(
            name="宁波宸睿智能装备有限公司",
            revenue="9.5亿", data_source="nev_custom", reliability=65,
            location="宁海县", industry_chain="人工智能",
            chain_node="智能装备", chain_position="downstream",
            association_level="中", association_score=62.4,
            coverage_score=52.0, patent_similarity_score=58.0,
            scale_percentile=45.0, patent_count=9, is_listed=False,
            credit_code="91330224MA2F1R9L0L", registered_capital=950,
            founded_date="2020-01-06", reg_status="存续",
            legal_representative="徐志远", org_type="有限责任公司",
            insured_employees=120, reg_authority="宁海县市场监督管理局",
            registered_address="宁波市宁海县高新技术产业园区",
            business_scope="工业机器人、自动化设备研发与集成",
            lat=29.287, lng=121.423, geo_status="done"
        ),
    ]
    db.add_all(enterprises)

    print("[3/4] 正在写入产业链节点定义...")
    nodes = [
        ChainNodeDefinition(industry_chain="新能源汽车", chain_position="upstream",   node_name="正极材料",  node_level="优势节点", ningbo_count=12, national_count=280, scale_score=72.4, tech_score=58.1, linkage_score=75.0),
        ChainNodeDefinition(industry_chain="新能源汽车", chain_position="upstream",   node_name="负极材料",  node_level="潜力节点", ningbo_count=5,  national_count=150, scale_score=45.0, tech_score=52.0, linkage_score=60.0),
        ChainNodeDefinition(industry_chain="新能源汽车", chain_position="upstream",   node_name="电解液",    node_level="优势节点", ningbo_count=8,  national_count=120, scale_score=68.0, tech_score=72.0, linkage_score=70.0),
        ChainNodeDefinition(industry_chain="新能源汽车", chain_position="upstream",   node_name="隔膜",      node_level="薄弱节点", ningbo_count=2,  national_count=80,  scale_score=22.0, tech_score=30.0, linkage_score=25.0),
        ChainNodeDefinition(industry_chain="新能源汽车", chain_position="upstream",   node_name="锂矿采选",  node_level="空白节点", ningbo_count=0,  national_count=45,  scale_score=0.0,  tech_score=0.0,  linkage_score=0.0),
        ChainNodeDefinition(industry_chain="新能源汽车", chain_position="midstream",  node_name="电芯制造",  node_level="优势节点", ningbo_count=8,  national_count=90,  scale_score=80.0, tech_score=75.0, linkage_score=82.0),
        ChainNodeDefinition(industry_chain="新能源汽车", chain_position="midstream",  node_name="BMS",       node_level="潜力节点", ningbo_count=4,  national_count=60,  scale_score=55.0, tech_score=62.0, linkage_score=58.0),
        ChainNodeDefinition(industry_chain="新能源汽车", chain_position="midstream",  node_name="热管理系统", node_level="潜力节点", ningbo_count=3, national_count=55,  scale_score=48.0, tech_score=50.0, linkage_score=45.0),
        ChainNodeDefinition(industry_chain="新能源汽车", chain_position="downstream", node_name="整车配件",  node_level="潜力节点", ningbo_count=45, national_count=1200, scale_score=62.0, tech_score=40.0, linkage_score=55.0),
        ChainNodeDefinition(industry_chain="新能源汽车", chain_position="downstream", node_name="充电桩",    node_level="薄弱节点", ningbo_count=3,  national_count=200, scale_score=18.0, tech_score=22.0, linkage_score=20.0),
        ChainNodeDefinition(industry_chain="集成电路",   chain_position="upstream",   node_name="半导体材料", node_level="优势节点", ningbo_count=6, national_count=120, scale_score=65.0, tech_score=80.0, linkage_score=70.0),
        ChainNodeDefinition(industry_chain="集成电路",   chain_position="midstream",  node_name="芯片设计",  node_level="潜力节点", ningbo_count=4,  national_count=300, scale_score=42.0, tech_score=68.0, linkage_score=50.0),
        ChainNodeDefinition(industry_chain="集成电路",   chain_position="downstream", node_name="消费电子",  node_level="薄弱节点", ningbo_count=2,  national_count=500, scale_score=15.0, tech_score=20.0, linkage_score=18.0),
        ChainNodeDefinition(industry_chain="生物医药",   chain_position="医药制品",   node_name="生物药",    node_level="优势节点", ningbo_count=7,  national_count=180, scale_score=70.0, tech_score=65.0, linkage_score=68.0),
        ChainNodeDefinition(industry_chain="生物医药",   chain_position="医疗器械",   node_name="医疗器械",  node_level="潜力节点", ningbo_count=9,  national_count=400, scale_score=55.0, tech_score=50.0, linkage_score=60.0),
        ChainNodeDefinition(industry_chain="新材料",     chain_position="upstream",   node_name="特种纤维",  node_level="优势节点", ningbo_count=5,  national_count=90,  scale_score=75.0, tech_score=80.0, linkage_score=72.0),
        ChainNodeDefinition(industry_chain="新材料",     chain_position="midstream",  node_name="高分子材料", node_level="潜力节点", ningbo_count=8, national_count=200, scale_score=58.0, tech_score=52.0, linkage_score=55.0),
        ChainNodeDefinition(industry_chain="人工智能",   chain_position="midstream",  node_name="人工智能算法", node_level="潜力节点", ningbo_count=3, national_count=600, scale_score=30.0, tech_score=55.0, linkage_score=35.0),
        ChainNodeDefinition(industry_chain="人工智能",   chain_position="downstream", node_name="智能装备",  node_level="空白节点", ningbo_count=1,  national_count=250, scale_score=12.0, tech_score=18.0, linkage_score=10.0),
    ]
    db.add_all(nodes)

    print("[4/4] 正在写入产业链流向关系...")
    relations = [
        ChainRelation(industry_chain="新能源汽车", from_node="锂矿采选",   to_node="正极材料"),
        ChainRelation(industry_chain="新能源汽车", from_node="锂矿采选",   to_node="负极材料"),
        ChainRelation(industry_chain="新能源汽车", from_node="正极材料",   to_node="电芯制造"),
        ChainRelation(industry_chain="新能源汽车", from_node="负极材料",   to_node="电芯制造"),
        ChainRelation(industry_chain="新能源汽车", from_node="电解液",     to_node="电芯制造"),
        ChainRelation(industry_chain="新能源汽车", from_node="隔膜",       to_node="电芯制造"),
        ChainRelation(industry_chain="新能源汽车", from_node="电芯制造",   to_node="BMS"),
        ChainRelation(industry_chain="新能源汽车", from_node="电芯制造",   to_node="热管理系统"),
        ChainRelation(industry_chain="新能源汽车", from_node="BMS",        to_node="整车配件"),
        ChainRelation(industry_chain="新能源汽车", from_node="热管理系统", to_node="整车配件"),
        ChainRelation(industry_chain="新能源汽车", from_node="整车配件",   to_node="充电桩"),
        ChainRelation(industry_chain="集成电路",   from_node="半导体材料", to_node="芯片设计"),
        ChainRelation(industry_chain="集成电路",   from_node="芯片设计",   to_node="消费电子"),
    ]
    db.add_all(relations)

    db.commit()
    print("[完成] 数据库初始化成功！共写入：")
    print("   - 企业数据：" + str(len(enterprises)) + " 条")
    print("   - 产业链节点：" + str(len(nodes)) + " 条")
    print("   - 节点流向关系：" + str(len(relations)) + " 条")
    print("")
    print("[提示] 以下三张表已创建，内容待手动填入（可通过 Swagger API 操作）：")
    print("   - patents          ：专利信息（标题、摘要、IPC号）")
    print("   - chain_keyword    ：分词知识库（关键词与权重）")
    print("   - node_ipc_mapping ：节点-IPC前缀映射")
    db.close()


if __name__ == "__main__":
    init_db()
