# -*- coding: utf-8 -*-
"""
产业链节点定义 & 流向关系导入脚本

从 data/ 目录下的两个 CSV 文件更新数据库：
  - chain_node_definition.csv → chain_node_definition 表
  - chain_relation.csv        → chain_relation 表

运行方式（在 backend/ 目录下）:
    py -3 scripts/import_chain_data.py

注意：
  - 会清空原有 chain_node_definition 和 chain_relation 表中的全部记录后重新导入
  - 若 chain_node_definition 表缺少 node2_name 列，会自动 ALTER TABLE 补列
"""
import sys
import os
import csv
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from core.database import SessionLocal, engine, Base
from models.chain import ChainNodeDefinition, ChainRelation
from models.enterprise import Enterprise          # noqa: 确保建表
from models.patent import Patent, ChainKeyword, NodeIpcMapping  # noqa

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data"
)
NODE_CSV     = os.path.join(DATA_DIR, "chain_node_definition.csv")
RELATION_CSV = os.path.join(DATA_DIR, "chain_relation.csv")

# CSV 文件编码（GBK）
CSV_ENCODING = "gbk"


def ensure_node2_name_column() -> None:
    """若 chain_node_definition 表中尚无 node2_name 列，则自动补加。"""
    with engine.connect() as conn:
        result = conn.execute(text("SHOW COLUMNS FROM chain_node_definition"))
        existing = {row[0] for row in result}

    if "node2_name" not in existing:
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE chain_node_definition "
                "ADD COLUMN node2_name VARCHAR(100) NULL COMMENT '二级子节点名称' "
                "AFTER node_name"
            ))
        logger.info("  已自动 ALTER TABLE 加入 node2_name 列")
    else:
        logger.info("  node2_name 列已存在，跳过")


def parse_int(v: str) -> int:
    try:
        return int(v.strip())
    except (ValueError, TypeError):
        return 0


def parse_float(v: str):
    try:
        return float(v.strip())
    except (ValueError, TypeError):
        return None


def import_nodes(db) -> int:
    """导入 chain_node_definition.csv，返回导入条数。"""
    count = 0
    with open(NODE_CSV, encoding=CSV_ENCODING, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            node = ChainNodeDefinition(
                industry_chain = row["industry_chain"].strip(),
                chain_position = row["chain_position"].strip(),
                node_name      = row["node_name"].strip(),
                node2_name     = row.get("node2_name", "").strip() or None,
                node_level     = row.get("node_level", "").strip() or "空白节点",
                ningbo_count   = parse_int(row.get("ningbo_count", "0")),
                national_count = parse_int(row.get("national_count", "0")),
                scale_score    = parse_float(row.get("scale_score", "")) or 0.0,
                tech_score     = parse_float(row.get("tech_score", "")) or 0.0,
                linkage_score  = parse_float(row.get("linkage_score", "")) or 0.0,
            )
            db.add(node)
            count += 1
    return count


def import_relations(db) -> int:
    """导入 chain_relation.csv，返回导入条数。"""
    count = 0
    with open(RELATION_CSV, encoding=CSV_ENCODING, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rel = ChainRelation(
                industry_chain = row["industry_chain"].strip(),
                from_node      = row["from_node"].strip(),
                to_node        = row["to_node"].strip(),
            )
            db.add(rel)
            count += 1
    return count


def main() -> None:
    # 确保所有表存在（含新字段）
    Base.metadata.create_all(bind=engine)
    ensure_node2_name_column()

    db = SessionLocal()
    try:
        # ── 清空旧数据 ──────────────────────────────────────────────────
        old_nodes = db.query(ChainNodeDefinition).count()
        old_rels  = db.query(ChainRelation).count()
        db.query(ChainNodeDefinition).delete()
        db.query(ChainRelation).delete()
        db.commit()
        logger.info(f"已清空旧数据：nodes={old_nodes} 条，relations={old_rels} 条")

        # ── 导入节点定义 ────────────────────────────────────────────────
        logger.info(f"正在导入 {NODE_CSV} ...")
        n_nodes = import_nodes(db)
        db.commit()
        logger.info(f"  导入节点定义：{n_nodes} 条")

        # ── 导入流向关系 ────────────────────────────────────────────────
        logger.info(f"正在导入 {RELATION_CSV} ...")
        n_rels = import_relations(db)
        db.commit()
        logger.info(f"  导入流向关系：{n_rels} 条")

        logger.info("")
        logger.info("导入完成！")
        logger.info(f"  chain_node_definition: {n_nodes} 条")
        logger.info(f"  chain_relation:        {n_rels} 条")

    except Exception as e:
        db.rollback()
        logger.error(f"导入失败: {e}", exc_info=True)
    finally:
        db.close()

    # 清理临时预览文件
    for tmp in ["tmp_preview.txt", "tmp_relation.txt"]:
        p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), tmp)
        if os.path.exists(p):
            os.remove(p)


if __name__ == "__main__":
    main()
