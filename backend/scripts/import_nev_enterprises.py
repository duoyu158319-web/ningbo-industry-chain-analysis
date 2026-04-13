# -*- coding: utf-8 -*-
"""
宁波市新能源汽车产业链企业数据导入脚本（全字段版）

功能：
  - 新记录：INSERT
  - 已存在（按 credit_code 判断）：UPDATE 补齐全部字段

运行方式（在 backend/ 目录下）:
    py -3 scripts/import_nev_enterprises.py
"""
import sys
import os
import re
import csv
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import SessionLocal, engine, Base
from models.enterprise import Enterprise
from models.patent import Patent, ChainKeyword, NodeIpcMapping  # noqa: F401

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

CSV_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data", "宁波市新能源汽车产业预测_仅产业链企业_含经纬度.csv"
)

INDUSTRY_CHAIN = "新能源汽车"
BATCH_SIZE = 100

POSITION_MAP = {"上游": "upstream", "中游": "midstream", "下游": "downstream"}
GEO_STATUS_MAP = {"ok": "done", "not_found": "failed", "": "pending"}


# ────────── 解析工具函数 ──────────

def parse_capital(raw: str) -> float:
    if not raw or raw.strip() in ("-", ""):
        return 0.0
    m = re.search(r"[\d]+\.?\d*", raw.replace(",", ""))
    return float(m.group()) if m else 0.0


def parse_int(raw: str) -> int:
    try:
        return int(str(raw).strip())
    except (ValueError, TypeError):
        return 0


def parse_float(raw: str):
    if not raw or raw.strip() == "":
        return None
    try:
        return float(raw.strip())
    except ValueError:
        return None


def parse_score(raw: str) -> float:
    v = parse_float(raw)
    return round(v * 100, 2) if v is not None else 0.0


def parse_geo_status(raw: str) -> str:
    return GEO_STATUS_MAP.get((raw or "").strip(), "pending")


def row_to_fields(row: dict) -> dict:
    """
    将 CSV 一行数据映射到 Enterprise 模型字段字典。
    CSV 列名与字段名对照关系在此函数内完整维护。
    """
    lng = parse_float(row.get("经度"))
    lat = parse_float(row.get("纬度"))
    geo_raw = (row.get("地理编码状态") or "").strip()
    geo_status = parse_geo_status(geo_raw)
    if lat is None or lng is None:
        geo_status = "pending"

    position_cn = (row.get("环节") or "").strip()
    chain_position = POSITION_MAP.get(position_cn, "midstream")

    chain_node = (row.get("二级分类") or "").strip() or "待分类"
    sub_node_raw = (row.get("三级分类") or "").strip()
    sub_node = sub_node_raw if sub_node_raw else None

    has_patent_raw = (row.get("使用专利") or "").strip()
    has_patent = has_patent_raw == "是"

    geo_score_raw = parse_float(row.get("地理编码得分"))
    geo_score = geo_score_raw if geo_score_raw is not None else 0.0

    # NOTE: 邮箱只取第一个主邮箱，多余的邮箱不存入（避免超长）
    email_raw = (row.get("邮箱") or "").strip()
    email = email_raw[:255] if email_raw else None

    # NOTE: website 字段 CSV 里直接取"官网"列
    website_raw = (row.get("官网") or "").strip()
    website = website_raw[:255] if website_raw and website_raw != "-" else None

    return dict(
        # 产业链归属
        industry_chain=INDUSTRY_CHAIN,
        chain_node=chain_node,
        chain_position=chain_position,
        sub_node=sub_node,
        sub_node_score=parse_score(row.get("三级分类_置信度") or ""),
        # 评分
        association_score=parse_score(row.get("环节_置信度") or ""),
        coverage_score=parse_score(row.get("二级分类_置信度") or ""),
        patent_count=parse_int(row.get("专利数量") or "0"),
        has_patent=has_patent,
        # 工商
        reg_status=(row.get("登记状态") or "存续").strip(),
        legal_representative=(row.get("法定代表人") or "").strip() or None,
        org_type=(row.get("企业(机构)类型") or "").strip() or None,
        scale=(row.get("企业规模") or "").strip() or None,
        registered_capital=parse_capital(row.get("注册资本") or ""),
        paid_in_capital=parse_capital(row.get("实缴资本") or ""),
        founded_date=(row.get("成立日期") or "").strip() or None,
        approved_date=(row.get("核准日期") or "").strip() or None,
        business_term=(row.get("营业期限") or "").strip() or None,
        insured_employees=parse_int(row.get("参保人数") or "0"),
        latest_report_year=(row.get("最新年报年份") or "").strip() or None,
        taxpayer_type=(row.get("纳税人资质") or "").strip() or None,
        reg_authority=(row.get("登记机关") or "").strip() or None,
        registered_address=(row.get("企业地址") or "").strip() or None,
        business_scope=(row.get("经营范围") or "").strip() or None,
        description=(row.get("企业简介") or "").strip() or None,
        former_names=(row.get("曾用名") or "").strip() or None,
        english_name=(row.get("英文名") or "").strip() or None,
        phone=(row.get("电话") or "").strip() or None,
        website=website,
        email=email,
        # 区划
        province=(row.get("所属省份") or "浙江省").strip(),
        city=(row.get("所属城市") or "宁波市").strip(),
        location=(row.get("所属区县") or "").strip() or None,
        # 国标行业
        industry_category=(row.get("国标行业门类") or "").strip() or None,
        industry_major=(row.get("国标行业大类") or "").strip() or None,
        industry_medium=(row.get("国标行业中类") or "").strip() or None,
        industry_minor=(row.get("国标行业小类") or "").strip() or None,
        # 地理
        lat=lat,
        lng=lng,
        geo_status=geo_status,
        geo_address_matched=(row.get("地理编码匹配地址") or "").strip() or None,
        geo_score=geo_score,
        geo_type=(row.get("地理编码类型") or "").strip() or None,
        # 固定值
        data_source="nev_custom",
        reliability=80,
        status="verified",
    )


# ────────── 主逻辑 ──────────

def import_csv() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # 读取已有 credit_code → id 映射，用于判断 INSERT 还是 UPDATE
        existing: dict[str, int] = {
            row[0]: row[1]
            for row in db.query(Enterprise.credit_code, Enterprise.id).all()
        }
        logger.info(f"数据库已有 {len(existing)} 条企业记录")

        inserted = updated = skipped = 0
        insert_batch: list[Enterprise] = []

        with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)

            for row_num, row in enumerate(reader, start=2):
                name = (row.get("原文件导入名称") or "").strip()
                credit_code = (row.get("统一社会信用代码") or "").strip()

                if not name or not credit_code:
                    skipped += 1
                    continue

                fields = row_to_fields(row)

                if credit_code in existing:
                    # ── UPDATE：补填新字段 ──────────────────────────────
                    ent_id = existing[credit_code]
                    db.query(Enterprise).filter(Enterprise.id == ent_id).update(
                        {**fields, "name": name},
                        synchronize_session=False,
                    )
                    updated += 1
                    # 小批次提交，避免长事务
                    if updated % BATCH_SIZE == 0:
                        db.commit()
                        logger.info(f"  UPDATE 进度：{updated} 条...")
                else:
                    # ── INSERT ────────────────────────────────────────────
                    ent = Enterprise(name=name, credit_code=credit_code, **fields)
                    insert_batch.append(ent)
                    existing[credit_code] = -1  # 防 CSV 内重复

                    if len(insert_batch) >= BATCH_SIZE:
                        db.add_all(insert_batch)
                        db.commit()
                        inserted += len(insert_batch)
                        logger.info(f"  INSERT 进度：{inserted} 条...")
                        insert_batch = []

        # 剩余提交
        if insert_batch:
            db.add_all(insert_batch)
            inserted += len(insert_batch)
        db.commit()

        logger.info("")
        logger.info(f"导入完成！")
        logger.info(f"  新增（INSERT）: {inserted} 条")
        logger.info(f"  更新（UPDATE）: {updated} 条（已存在记录补齐全字段）")
        logger.info(f"  跳过（缺必填）: {skipped} 条")

    except Exception as e:
        db.rollback()
        logger.error(f"导入失败: {e}", exc_info=True)
    finally:
        db.close()


if __name__ == "__main__":
    import_csv()
