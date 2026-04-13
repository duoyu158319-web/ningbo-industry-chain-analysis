# -*- coding: utf-8 -*-
"""
产业链节点评分自动计算脚本（v5）

======================================================================
更新内容（v5）
  tech_score 改为按节点级别独立计算，不再按 chain_position 共享：
    tech_score = patent_sum_norm × 0.7 + has_patent_ratio_norm × 0.3
    • patent_sum_norm     = SUM(enterprise.patent_count) 全链节点间 min-max 归一化 0~100
    • has_patent_ratio    = 有专利企业数 / 节点企业总数，全链归一化（多样性代理）
  不再依赖 node_ipc_mapping 表。

计算公式（v5）
======================================================================
scale_score = national_ratio_norm × 0.35 + capital_norm × 0.35 + employee_norm × 0.30
  • national_ratio_norm  = ningbo_count / max(national_count,1) 然后全链归一化 0~100
  • capital_norm         = avg(registered_capital)              归一化 0~100
  • employee_norm        = avg(insured_employees)               归一化 0~100

tech_score = patent_sum_norm × 0.7 + has_patent_ratio_norm × 0.3
  • patent_sum_norm   = SUM(enterprise.patent_count) 全链归一化
  • has_patent_ratio  = 有专利企业数 / 总企业数，全链归一化

linkage_score = log1p归一化(upstream_ratio) × 50 + log1p归一化(downstream_ratio) × 50

node_level（加权平均，非等权）：
  weighted_avg = scale × 0.5 + linkage × 0.4 + tech × 0.1
  ningbo_count == 0 → 空白节点（强制）
  weighted_avg ≥ 55 → 优势节点
  weighted_avg ≥ 30 → 潜力节点
  其余             → 薄弱节点

运行方式（在 backend/ 目录下）：
  py -3 scripts/calc_node_scores.py
  py -3 scripts/calc_node_scores.py --chain 新能源汽车
======================================================================
"""
import sys
import os
import math
import argparse
import logging
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, or_
from core.database import SessionLocal
from models.chain import ChainNodeDefinition, ChainRelation
from models.enterprise import Enterprise

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


# ────────── 归一化工具 ──────────

def minmax_normalize(values: list[float], target_max: float = 100.0) -> list[float]:
    """min-max 归一化到 [0, target_max]；全零返回全零。"""
    max_v = max(values) if values else 0
    if max_v == 0:
        return [0.0] * len(values)
    return [v / max_v * target_max for v in values]


def log_normalize(value: float, global_max: float, target_max: float = 50.0) -> float:
    """log1p 压缩后归一化到 [0, target_max]。"""
    if global_max == 0:
        return 0.0
    return min(math.log1p(value) / math.log1p(global_max) * target_max, target_max)


# ────────── 企业指标聚合 ──────────

def build_match_labels(node_name: str, node2_name: str | None) -> list[str]:
    # NOTE: 有 node2_name（子节点）时，只匹配 sub_node = node2_name，
    #       不能再包含 node_name（父节点名），否则会把整个父节点下的所有企业都算进来，
    #       导致四个子节点的 patent_sum 完全一致（都匹配到同一批企业）。
    if node2_name:
        return [node2_name]
    return [node_name]


def calc_enterprise_metrics(db, industry_chain: str, match_labels: list[str]) -> dict:
    """
    聚合企业维度：平均注册资本、平均参保人数、专利总数、有专利企业数。
    """
    base_filter = [
        Enterprise.industry_chain == industry_chain,
        or_(
            Enterprise.chain_node.in_(match_labels),
            Enterprise.sub_node.in_(match_labels),
        ),
    ]
    db_count: int = db.query(func.count(Enterprise.id)).filter(*base_filter).scalar() or 0
    avg_capital: float = float(
        db.query(func.avg(Enterprise.registered_capital)).filter(*base_filter).scalar() or 0
    )
    # NOTE: insured_employees = 参保人数，是当前可用的最佳员工规模代理指标
    avg_employees: float = float(
        db.query(func.avg(Enterprise.insured_employees)).filter(*base_filter).scalar() or 0
    )
    # NOTE: 按节点企业的专利总数和有专利企业数，用于 tech_score 计算
    patent_sum: int = int(
        db.query(func.coalesce(func.sum(Enterprise.patent_count), 0)).filter(*base_filter).scalar() or 0
    )
    has_patent_count: int = int(
        db.query(func.count(Enterprise.id)).filter(
            *base_filter, Enterprise.patent_count > 0
        ).scalar() or 0
    )
    return {
        "db_count":         db_count,
        "avg_capital":      avg_capital,
        "avg_employees":    avg_employees,
        "patent_sum":       patent_sum,
        "has_patent_count": has_patent_count,
    }


# ────────── 核心计算 ──────────

def calc_scores_for_chain(db, industry_chain: str) -> None:
    logger.info(f"\n==== 处理产业链：{industry_chain} ====")

    nodes: list[ChainNodeDefinition] = (
        db.query(ChainNodeDefinition)
        .filter(ChainNodeDefinition.industry_chain == industry_chain)
        .all()
    )
    if not nodes:
        logger.warning("  无节点定义，跳过")
        return

    # ── Step 1：聚合各节点企业指标 ──────────────────────────────────
    raw: dict[int, dict] = {}
    for n in nodes:
        labels = build_match_labels(n.node_name, n.node2_name)
        metrics = calc_enterprise_metrics(db, industry_chain, labels)
        raw[n.id] = metrics
        logger.info(
            f"  [{n.node_name}/{n.node2_name or '-'}] "
            f"CSV宁波={n.ningbo_count}  全国={n.national_count}  DB匹配={metrics['db_count']}  "
            f"均资本={metrics['avg_capital']:.0f}万  均参保={metrics['avg_employees']:.0f}人  "
            f"专利总数={metrics['patent_sum']}  有专利企业={metrics['has_patent_count']}"
        )

    # ── Step 2：scale_score（三维加权）──────────────────────────────
    # 2a. 全国占比：ningbo_count / national_count
    national_ratios = [
        n.ningbo_count / max(n.national_count, 1) for n in nodes
    ]
    # 2b. 平均注册资本
    avg_capitals = [raw[n.id]["avg_capital"] for n in nodes]
    # 2c. 平均参保人数
    avg_employees_list = [raw[n.id]["avg_employees"] for n in nodes]

    ratio_norm    = minmax_normalize(national_ratios,      100.0)
    capital_norm  = minmax_normalize(avg_capitals,         100.0)
    employee_norm = minmax_normalize(avg_employees_list,   100.0)

    scale_scores = {
        n.id: round(
            ratio_norm[i] * 0.35 + capital_norm[i] * 0.35 + employee_norm[i] * 0.30,
            2,
        )
        for i, n in enumerate(nodes)
    }

    # ── Step 3：tech_score（按节点企业专利总数归一化）───────────────
    # NOTE: 每个节点独立计算，不再按 chain_position 共享；
    #   公式：patent_sum_norm × 0.7 + has_patent_ratio_norm × 0.3
    patent_sums    = [float(raw[n.id]["patent_sum"]) for n in nodes]
    db_counts      = [float(raw[n.id]["db_count"]) for n in nodes]
    has_pat_cnts   = [float(raw[n.id]["has_patent_count"]) for n in nodes]
    has_pat_ratios = [
        (h / d) if d > 0 else 0.0
        for h, d in zip(has_pat_cnts, db_counts)
    ]

    patent_sum_norm    = minmax_normalize(patent_sums,    100.0)
    has_pat_ratio_norm = minmax_normalize(has_pat_ratios, 100.0)

    tech_scores = {
        n.id: round(patent_sum_norm[i] * 0.7 + has_pat_ratio_norm[i] * 0.3, 2)
        for i, n in enumerate(nodes)
    }

    # ── Step 4：linkage_score ────────────────────────────────────────
    relations = (
        db.query(ChainRelation)
        .filter(ChainRelation.industry_chain == industry_chain)
        .all()
    )
    upstream_map:   dict[str, list[str]] = defaultdict(list)
    downstream_map: dict[str, list[str]] = defaultdict(list)
    for rel in relations:
        downstream_map[rel.from_node].append(rel.to_node)
        upstream_map[rel.to_node].append(rel.from_node)

    node_count_map: dict[str, int] = defaultdict(int)
    for n in nodes:
        node_count_map[n.node_name] += n.ningbo_count

    raw_up: dict[int, float] = {}
    raw_dn: dict[int, float] = {}
    for n in nodes:
        current = max(node_count_map[n.node_name], 1)
        up_nbrs = upstream_map.get(n.node_name, [])
        dn_nbrs = downstream_map.get(n.node_name, [])
        up_counts = [node_count_map[nb] for nb in up_nbrs if nb in node_count_map]
        dn_counts = [node_count_map[nb] for nb in dn_nbrs if nb in node_count_map]
        raw_up[n.id] = (sum(up_counts) / len(up_counts) / current) if up_counts else 0.0
        raw_dn[n.id] = (sum(dn_counts) / len(dn_counts) / current) if dn_counts else 0.0

    max_up = max(raw_up.values()) if raw_up else 0
    max_dn = max(raw_dn.values()) if raw_dn else 0

    linkage_scores = {
        n.id: round(
            log_normalize(raw_up[n.id], max_up, 50.0)
            + log_normalize(raw_dn[n.id], max_dn, 50.0),
            2,
        )
        for n in nodes
    }

    # ── Step 5：node_level ────────────────────────────────────────────
    # NOTE: 阈值按产业链分开设置，避免不同产业链数据量差异导致评级失真
    SCALE_ONLY_CHAINS = {"生物医药"}   # 生物医药：暂无 chain_relation，仅以 scale_score 判定

    # 新能源汽车专用阈值（scale×0.5+link×0.4+tech×0.1）
    # 目标分布：优势≈1/3(4个)、潜力为主(6个)、薄弱≤2个
    NEV_THRESHOLDS = {"新能源汽车": (40, 15)}   # (优势线, 潜力线)
    DEFAULT_THRESHOLDS = (55, 30)               # 其余产业链默认阈值

    def calc_level(n: ChainNodeDefinition) -> str:
        if n.ningbo_count == 0:
            return "空白节点"

        if industry_chain in SCALE_ONLY_CHAINS:
            s = scale_scores[n.id]
            if s >= 55:
                return "优势节点"
            if s >= 25:
                return "潜力节点"
            return "薄弱节点"

        # 通用加权判定
        adv_thr, pot_thr = NEV_THRESHOLDS.get(industry_chain, DEFAULT_THRESHOLDS)
        weighted = (
            scale_scores[n.id]   * 0.5
            + linkage_scores[n.id] * 0.4
            + tech_scores[n.id]    * 0.1
        )
        if weighted >= adv_thr:
            return "优势节点"
        if weighted >= pot_thr:
            return "潜力节点"
        return "薄弱节点"   # ningbo_count>0 时最低为薄弱节点

    # ── Step 6：写回 DB ──────────────────────────────────────────────
    is_scale_only = industry_chain in SCALE_ONLY_CHAINS
    mode_label = "仅scale" if is_scale_only else "scale×0.5+link×0.4+tech×0.1"
    logger.info(f"\n  评分结果（判定模式: {mode_label}）：")
    logger.info(
        f"  {'节点':<22} {'ratio%':>7} {'scale':>7} {'tech':>7} {'link':>6} {'判定分':>6} 评级"
    )
    logger.info("  " + "-" * 74)

    for i, n in enumerate(nodes):
        old_level = n.node_level
        n.scale_score   = scale_scores[n.id]
        n.tech_score    = tech_scores[n.id]
        n.linkage_score = linkage_scores[n.id]
        n.node_level    = calc_level(n)

        decision_score = n.scale_score if is_scale_only else (
            n.scale_score * 0.5 + n.linkage_score * 0.4 + n.tech_score * 0.1
        )
        ratio_pct = national_ratios[i] * 100
        label = f"{n.node_name}/{n.node2_name}" if n.node2_name else n.node_name
        logger.info(
            f"  {label:<22} {ratio_pct:>6.2f}% {n.scale_score:>7.1f} "
            f"{n.tech_score:>7.1f} {n.linkage_score:>6.1f} {decision_score:>6.1f} "
            f"{old_level} → {n.node_level}"
        )

    db.commit()
    logger.info(f"\n  已更新 {len(nodes)} 个节点的评分")

    # 统计评级分布
    level_counts: dict[str, int] = defaultdict(int)
    for n in nodes:
        level_counts[n.node_level] += 1
    logger.info(
        "  评级分布: " + "  ".join(f"{k}:{v}" for k, v in sorted(level_counts.items()))
    )


# ────────── 入口 ──────────

def main() -> None:
    parser = argparse.ArgumentParser(description="产业链节点评分自动计算 v5")
    parser.add_argument("--chain", type=str, default=None, help="指定产业链，不填则计算所有")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.chain:
            chains = [args.chain]
        else:
            chains = [
                row[0]
                for row in db.query(ChainNodeDefinition.industry_chain).distinct().all()
            ]
            logger.info(f"共 {len(chains)} 条产业链：{chains}")

        for chain in chains:
            calc_scores_for_chain(db, chain)

        logger.info("\n全部完成")

    except Exception as e:
        db.rollback()
        logger.error(f"失败: {e}", exc_info=True)
    finally:
        db.close()


if __name__ == "__main__":
    main()
