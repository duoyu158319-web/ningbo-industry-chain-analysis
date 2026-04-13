# -*- coding: utf-8 -*-
"""
数据库字段同步脚本 - 为 enterprises 表添加新增字段（ALTER TABLE）
由于项目不使用 Alembic，通过此脚本手动补齐列定义。

运行方式（在 backend/ 目录下）:
    py -3 scripts/migrate_enterprise_fields.py
"""
import sys
import os
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from core.database import engine

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 需要新增的列：(列名, DDL 类型, 默认值描述)
NEW_COLUMNS = [
    ("sub_node",           "VARCHAR(100)",  "NULL"),
    ("sub_node_score",     "FLOAT",         "0.0"),
    ("has_patent",         "TINYINT(1)",    "0"),
    ("scale",              "VARCHAR(20)",   "NULL"),
    ("approved_date",      "VARCHAR(50)",   "NULL"),
    ("business_term",      "VARCHAR(100)",  "NULL"),
    ("latest_report_year", "VARCHAR(10)",   "NULL"),
    ("taxpayer_type",      "VARCHAR(50)",   "NULL"),
    ("former_names",       "TEXT",          "NULL"),
    ("english_name",       "VARCHAR(500)",  "NULL"),
    ("phone",              "VARCHAR(200)",  "NULL"),
    ("website",            "VARCHAR(255)",  "NULL"),
    ("email",              "VARCHAR(255)",  "NULL"),
    ("province",           "VARCHAR(50)",   "NULL"),
    ("city",               "VARCHAR(50)",   "NULL"),
    ("industry_category",  "VARCHAR(100)",  "NULL"),
    ("industry_major",     "VARCHAR(100)",  "NULL"),
    ("industry_medium",    "VARCHAR(100)",  "NULL"),
    ("industry_minor",     "VARCHAR(100)",  "NULL"),
    ("geo_address_matched","VARCHAR(255)",  "NULL"),
    ("geo_score",          "FLOAT",         "0.0"),
    ("geo_type",           "VARCHAR(50)",   "NULL"),
]


def get_existing_columns() -> set:
    """查询 enterprises 表已有列名"""
    with engine.connect() as conn:
        result = conn.execute(text("SHOW COLUMNS FROM enterprises"))
        return {row[0] for row in result}


def migrate():
    existing = get_existing_columns()
    logger.info(f"enterprises 表当前共 {len(existing)} 个字段")

    added = 0
    skipped = 0

    with engine.begin() as conn:
        for col_name, col_type, default in NEW_COLUMNS:
            if col_name in existing:
                logger.debug(f"  跳过（已存在）: {col_name}")
                skipped += 1
                continue

            # NULL 默认值不需要 DEFAULT 子句
            if default == "NULL":
                ddl = f"ALTER TABLE enterprises ADD COLUMN {col_name} {col_type}"
            else:
                ddl = f"ALTER TABLE enterprises ADD COLUMN {col_name} {col_type} DEFAULT {default}"

            conn.execute(text(ddl))
            logger.info(f"  + 新增列: {col_name} {col_type}")
            added += 1

    logger.info(f"\n完成：新增 {added} 列，跳过 {skipped} 列（已存在）")


if __name__ == "__main__":
    migrate()
