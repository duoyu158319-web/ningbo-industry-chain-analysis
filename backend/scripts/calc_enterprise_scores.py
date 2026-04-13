# -*- coding: utf-8 -*-
"""
企业级评分补全脚本

计算并写回 enterprises 表中两个此前未填充的字段：

1. patent_similarity_score（专利相似度）
   ─────────────────────────────────────
   衡量该企业的专利 IPC 分布与其所在产业节点的 IPC 映射表之间的重叠程度。

   计算方式：
     · 从 patents 表取该企业所有已关联专利的 IPC 分类号（逗号分隔字段）
     · 从 node_ipc_mapping 取该企业所在 chain_node 及 chain_position 的所有 IPC 前缀
     · matched_codes = 企业 IPC 中能 startswith 任一前缀的代码集合
     · raw_score = len(matched_codes) / len(all_enterprise_ipc_codes)  [0,1]
     · patent_similarity_score = raw_score × 100（保留 1 位小数）
     · 无专利 → 0.0

2. scale_percentile（规模分位）
   ──────────────────────────────
   衡量该企业在 **同一 chain_node（二级节点）** 内的规模排名百分位。

   规模代理指标 = 注册资本（万元）× 0.6 + 参保人数（人）× 0.4
   （两者均在节点内先 min-max 归一化到 [0,100] 再加权）

   计算方式：
     · 按 chain_node 分组，对组内所有企业计算综合规模分
     · 对每家企业计算在组内的百分位：
         percentile = 本企业规模分低于的企业数量 / (组内总数 - 1) × 100
     · 结果保留 1 位小数

运行方式（在项目根目录执行）：
    py -3 backend/scripts/calc_enterprise_scores.py
    py -3 backend/scripts/calc_enterprise_scores.py --chain 新能源汽车
    py -3 backend/scripts/calc_enterprise_scores.py --dry-run   # 只打印，不写库
"""

import sys
import os
import argparse
import logging
from collections import defaultdict
from typing import Optional

# 确保能 import backend 模块
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import func
from core.database import SessionLocal
from models.enterprise import Enterprise
from models.patent import Patent, NodeIpcMapping

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

BATCH_SIZE = 200  # 每批提交数量


# ══════════════════════════════════════════════════════════════════════
# 专利相似度
# ══════════════════════════════════════════════════════════════════════

def build_ipc_prefix_map(db, industry_chain: Optional[str] = None) -> dict[str, list[str]]:
    """
    从 node_ipc_mapping 表构建：
        (chain_node, chain_position) → [ipc_prefix, ...]
    NOTE: 若该产业链没有 IPC 映射，专利相似度将全部为 0。
    """
    query = db.query(NodeIpcMapping)
    if industry_chain:
        query = query.filter(NodeIpcMapping.industry_chain == industry_chain)

    prefix_map: dict[str, list[str]] = defaultdict(list)
    for m in query.all():
        # 同时以节点名 和 链位 为 key，优先用节点名精确匹配
        key_node = m.node_name
        key_pos  = m.chain_position
        prefix_map[key_node].append(m.ipc_prefix)
        prefix_map[key_pos].append(m.ipc_prefix)

    if not prefix_map:
        logger.warning("  node_ipc_mapping 无数据，patent_similarity_score 将全部为 0")
    else:
        logger.info(f"  IPC 前缀映射：{len(prefix_map)} 个节点/链位key")
    return prefix_map


def build_enterprise_ipc_map(db, enterprise_ids: list[int]) -> dict[int, list[str]]:
    """
    为指定企业 ID 列表批量查询其所有专利的 IPC 分类号。
    返回 { enterprise_id: [ipc_code, ...] }
    """
    rows = (
        db.query(Patent.enterprise_id, Patent.ipc_codes)
        .filter(
            Patent.enterprise_id.in_(enterprise_ids),
            Patent.ipc_codes.isnot(None),
        )
        .all()
    )
    result: dict[int, list[str]] = defaultdict(list)
    for ent_id, ipc_str in rows:
        codes = [c.strip() for c in ipc_str.split(",") if c.strip()]
        result[ent_id].extend(codes)
    return result


def calc_patent_similarity(
    ipc_codes: list[str],
    prefixes: list[str],
) -> float:
    """
    计算单家企业对其节点的 IPC 匹配得分（0~100）。

    公式：
      matched = {code for code in ipc_codes if startswith any prefix}
      score   = len(matched) / len(set(ipc_codes)) × 100
    """
    if not ipc_codes or not prefixes:
        return 0.0

    unique_codes = set(ipc_codes)
    matched = set()
    for code in unique_codes:
        for prefix in prefixes:
            if code.startswith(prefix):
                matched.add(code)
                break

    return round(len(matched) / len(unique_codes) * 100, 1)


# ══════════════════════════════════════════════════════════════════════
# 规模分位
# ══════════════════════════════════════════════════════════════════════

def minmax_norm(values: list[float]) -> list[float]:
    """min-max 归一化到 [0, 100]；全相同时返回全 50（避免一家独大显示全 0）。"""
    min_v, max_v = min(values), max(values)
    if max_v == min_v:
        return [50.0] * len(values)
    return [(v - min_v) / (max_v - min_v) * 100 for v in values]


def calc_scale_percentiles(enterprises: list[Enterprise]) -> dict[int, float]:
    """
    计算一组企业（同 chain_node）中每家的规模百分位。

    规模代理指标 = 注册资本(归一化) × 0.6 + 参保人数(归一化) × 0.4
    百分位 = 低于本企业综合得分的企业数 / (总数-1) × 100
    """
    n = len(enterprises)
    if n == 0:
        return {}
    if n == 1:
        # 该节点只有一家企业，规模分位无意义，给 50
        return {enterprises[0].id: 50.0}

    capitals  = [float(e.registered_capital  or 0) for e in enterprises]
    employees = [float(e.insured_employees    or 0) for e in enterprises]

    cap_norm  = minmax_norm(capitals)
    emp_norm  = minmax_norm(employees)

    # 综合规模分
    scores = [cap_norm[i] * 0.6 + emp_norm[i] * 0.4 for i in range(n)]

    # 百分位：低于本企业得分的企业数 / (n-1)
    result: dict[int, float] = {}
    for i, ent in enumerate(enterprises):
        below = sum(1 for s in scores if s < scores[i])
        pct = round(below / (n - 1) * 100, 1)
        result[ent.id] = pct

    return result


# ══════════════════════════════════════════════════════════════════════
# 主流程
# ══════════════════════════════════════════════════════════════════════

def run(industry_chain: Optional[str] = None, dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        # ── 1. 拉取目标企业 ─────────────────────────────────────────────
        query = db.query(Enterprise)
        if industry_chain:
            query = query.filter(Enterprise.industry_chain == industry_chain)

        enterprises: list[Enterprise] = query.all()
        logger.info(f"共 {len(enterprises)} 家企业待计算（产业链={industry_chain or '全部'}）")

        # ── 2. 构建 IPC 前缀映射 ────────────────────────────────────────
        ipc_prefix_map = build_ipc_prefix_map(db, industry_chain)

        # ── 3. 批量查询企业专利 IPC ─────────────────────────────────────
        ent_ids = [e.id for e in enterprises]
        ent_ipc_map = build_enterprise_ipc_map(db, ent_ids)
        logger.info(f"  有专利 IPC 记录的企业：{len(ent_ipc_map)} 家")

        # ── 4. 按 chain_node 分组，用于规模分位 ─────────────────────────
        node_groups: dict[str, list[Enterprise]] = defaultdict(list)
        for ent in enterprises:
            node_groups[ent.chain_node or "未分类"].append(ent)

        logger.info(f"  涉及 {len(node_groups)} 个二级节点")

        # ── 5. 计算规模分位（整节点计算，一次性） ──────────────────────
        scale_pct_map: dict[int, float] = {}
        for node_name, group in node_groups.items():
            pcts = calc_scale_percentiles(group)
            scale_pct_map.update(pcts)
            logger.info(
                f"  节点[{node_name}] {len(group)} 家企业，"
                f"规模分位范围 {min(pcts.values()):.1f}%～{max(pcts.values()):.1f}%"
            )

        # ── 6. 逐企业计算专利相似度 & 写回 ────────────────────────────
        updated = 0
        sim_nonzero = 0
        for ent in enterprises:
            # 找该企业节点对应的 IPC 前缀（优先精确节点名，其次链位）
            prefixes = (
                ipc_prefix_map.get(ent.chain_node or "")
                or ipc_prefix_map.get(ent.chain_position or "")
                or []
            )
            ipc_codes = ent_ipc_map.get(ent.id, [])
            sim_score = calc_patent_similarity(ipc_codes, prefixes)
            pct_score = scale_pct_map.get(ent.id, 0.0)

            if not dry_run:
                ent.patent_similarity_score = sim_score
                ent.scale_percentile        = pct_score

            if sim_score > 0:
                sim_nonzero += 1
            updated += 1

            if updated % BATCH_SIZE == 0:
                if not dry_run:
                    db.commit()
                logger.info(f"  进度：{updated}/{len(enterprises)}")

        if not dry_run:
            db.commit()

        logger.info("")
        logger.info(f"完成！共更新 {updated} 家企业")
        logger.info(f"  patent_similarity_score > 0 的企业：{sim_nonzero} 家")
        logger.info(f"  scale_percentile 已写入（min-max 百分位）")
        if dry_run:
            logger.info("  [DRY-RUN 模式] 未实际写库")

    except Exception as e:
        db.rollback()
        logger.error(f"计算失败: {e}", exc_info=True)
    finally:
        db.close()


# ══════════════════════════════════════════════════════════════════════
# 入口
# ══════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(
        description="企业级评分补全：patent_similarity_score + scale_percentile"
    )
    parser.add_argument(
        "--chain", type=str, default=None,
        help="指定产业链名称，如 '新能源汽车'；不填则处理全部",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="仅打印计算结果，不写入数据库",
    )
    args = parser.parse_args()
    run(industry_chain=args.chain, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
