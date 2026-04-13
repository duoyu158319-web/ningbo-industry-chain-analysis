# -*- coding: utf-8 -*-
"""
calc_representative_score.py
-------------------------------------------------
五维度加权模型，计算每家企业的转型代表性综合评分并写入 representative_score 字段。

评分公式（权重合计 = 1.0）：
  score = 0.35 * ipc_relevance    转型专利比例（命中 node_ipc_mapping 前缀的专利 / 全部专利）
        + 0.25 * assoc_norm       产业链关联强度（association_score / 100，上游系统评定）
        + 0.20 * patent_norm      sqrt(专利数 / 节点最大专利数)，sqrt归一化
        + 0.15 * listed           是否上市（1.0 / 0.0）
        + 0.05 * capital_norm     sqrt(注册资本 / 节点最大资本)，sqrt归一化

运行方式：
  cd backend
  py -3 scripts/calc_representative_score.py
"""

import sys
import os
import math
import logging
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from core.database import SessionLocal, engine
from models.enterprise import Enterprise
from models.patent import Patent, NodeIpcMapping

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)


def ensure_column_exists() -> None:
    with engine.connect() as conn:
        result = conn.execute(text("SHOW COLUMNS FROM enterprises LIKE 'representative_score'")).fetchone()
        if result is None:
            logger.info("Adding representative_score column...")
            conn.execute(text(
                "ALTER TABLE enterprises "
                "ADD COLUMN representative_score FLOAT NOT NULL DEFAULT 0.0 "
                "COMMENT 'node representative score (0-1)'"
            ))
            conn.commit()
        else:
            logger.info("Column representative_score exists.")


def load_transition_prefixes(db) -> list:
    """Load all IPC prefixes from node_ipc_mapping (global, no node filter)."""
    rows = db.query(NodeIpcMapping.ipc_prefix).distinct().all()
    prefixes = [r.ipc_prefix.strip() for r in rows if r.ipc_prefix]
    logger.info("Loaded %d transition IPC prefixes.", len(prefixes))
    return prefixes


def load_enterprise_ipc(db) -> dict:
    """Build enterprise_id -> [ipc_code, ...] mapping from patents table."""
    patents = (
        db.query(Patent.enterprise_id, Patent.ipc_codes)
        .filter(Patent.enterprise_id.isnot(None), Patent.ipc_codes.isnot(None), Patent.ipc_codes != "")
        .all()
    )
    result = defaultdict(list)
    for eid, raw in patents:
        result[eid].extend(c.strip() for c in raw.split(",") if c.strip())
    logger.info("Loaded IPC data for %d enterprises.", len(result))
    return result


def calc_ipc_relevance(eid: int, ent_ipc: dict, prefixes: list) -> float:
    """
    Ratio of transition patents to total patents.
    A patent is 'transition' if any of its IPC codes starts with any prefix in the global list.
    Returns 0.0 if enterprise has no patents or no prefixes configured.
    """
    codes = ent_ipc.get(eid, [])
    if not codes or not prefixes:
        return 0.0
    hits = sum(1 for c in codes if any(c.startswith(p) for p in prefixes))
    return round(hits / len(codes), 6)


def calc_and_update() -> None:
    db = SessionLocal()
    try:
        prefixes = load_transition_prefixes(db)
        ent_ipc  = load_enterprise_ipc(db)

        logger.info("Loading all enterprises...")
        enterprises = db.query(Enterprise).all()
        logger.info("Loaded %d enterprises.", len(enterprises))

        # Group by chain_node for intra-node normalization
        groups: dict = defaultdict(list)
        for e in enterprises:
            groups[e.chain_node].append(e)

        logger.info("Processing %d nodes...", len(groups))

        updated = 0
        for node_name, group in groups.items():
            max_patent  = max((e.patent_count or 0) for e in group) or 1
            max_capital = max((e.registered_capital or 0) for e in group) or 1

            ipc_hits = 0
            for ent in group:
                # sqrt normalization - diminishing returns, lifts SME scores
                p_norm  = math.sqrt((ent.patent_count or 0) / max_patent)
                c_norm  = math.sqrt((ent.registered_capital or 0) / max_capital)
                listed  = 1.0 if ent.is_listed else 0.0

                # association_score: expert-assessed industry chain affiliation (0-100)
                # provides base score even for patent-less companies
                assoc_norm = min((ent.association_score or 0) / 100.0, 1.0)

                # ipc_relevance: share of patents matching transition IPC prefixes
                ipc_rel = calc_ipc_relevance(eid=ent.id, ent_ipc=ent_ipc, prefixes=prefixes)
                if ipc_rel > 0:
                    ipc_hits += 1

                # NOTE: 不再设置 0.5 地板，直接使用 assoc_norm (0~1)，
                # 保证低关联度企业能自然落入初步转型/传统为主区间，形成四级完整分布
                # 权重：ipc_rel 主导，assoc 辅助，形成四级分布
                # 0.40 ipc_rel    转型专利比例（主导：无转型专利→自然低分）
                # 0.35 assoc_norm 产业链关联强度
                # 0.15 p_norm     专利体量
                # 0.10 listed     上市状态
                ent.representative_score = round(
                    0.50 * assoc_norm
                    + 0.30 * ipc_rel
                    + 0.15 * p_norm
                    + 0.05 * listed,
                    6,
                )
                updated += 1

            logger.info("  Node [%s]: %d enterprises, %d with transition patents.", node_name, len(group), ipc_hits)

        logger.info("Committing %d records...", updated)
        db.commit()
        logger.info("[DONE] All scores written successfully.")

    except Exception as exc:
        db.rollback()
        logger.error("Failed, rolled back: %s", exc)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    ensure_column_exists()
    calc_and_update()
