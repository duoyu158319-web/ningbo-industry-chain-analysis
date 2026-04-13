# -*- coding: utf-8 -*-
"""
import_ipc_mapping.py — 从新能源汽车_专利_IPC汇总.json 写入 node_ipc_mapping 表

策略：
  - 使用 JSON 中 "按环节_前缀" 部分（精度合适）
  - 每个 IPC 前缀的 node_name 设为对应环节名（上游/中游/下游）
  - chain_position 映射为 upstream/midstream/downstream
  - 跳过 "-" 等无效前缀
  - 重复运行安全：先清空再写入
"""
import sys, os, json, logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.database import SessionLocal
from models.patent import NodeIpcMapping

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── 配置 ──────────────────────────
JSON_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..",
    "nev_backend", "ml_models_patent", "新能源汽车_专利_IPC汇总.json"
)
INDUSTRY_CHAIN = "新能源汽车"

POSITION_MAP = {
    "上游": "upstream",
    "中游": "midstream",
    "下游": "downstream",
}

# IPC 大类前缀 → 核心权重（3位前缀，如 "H01"、"B60"）
# NOTE: 这些是新能源汽车领域最核心的 IPC 大类
HIGH_WEIGHT_PREFIXES_3 = {
    "H01",   # 电池（H01M）、基本电气元件（H01L 半导体）
    "H02",   # 电机、发电机、电力变换（电控核心）
    "H04",   # 通信（车联网、V2X）
    "B60",   # 汽车（整车/底盘/动力/自动驾驶相关）
    "B62",   # 陆地车辆
    "G05",   # 控制系统（自动驾驶、BMS 控制）
    "G06",   # 计算机（车载算法、智驾）
    "C01",   # 无机化合物（正负极材料）
    "C08",   # 有机高分子（隔膜、电解质材料）
    "G01",   # 测量检验（传感器）
}


def get_weight(prefix: str) -> float:
    """根据 3 位 IPC 大类前缀判断权重"""
    if prefix[:3] in HIGH_WEIGHT_PREFIXES_3:
        return 1.0
    return 0.6


def run():
    # 读取 JSON
    json_path = os.path.normpath(JSON_PATH)
    logger.info(f"读取 IPC 汇总文件: {json_path}")
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    # 使用 "按环节_大类" 部分（IPC前3位大类前缀，精度合适用于前缀匹配）
    prefix_data: dict = data.get("按环节_大类", {})
    if not prefix_data:
        logger.error("JSON 中未找到 '按环节_前缀' 字段，请检查文件结构")
        sys.exit(1)

    # 构建待插入行
    rows: list[NodeIpcMapping] = []
    for position_cn, prefixes in prefix_data.items():
        position_en = POSITION_MAP.get(position_cn)
        if not position_en:
            logger.warning(f"未知环节名称: {position_cn}，跳过")
            continue

        valid_prefixes = [p for p in prefixes if p and p != "-" and len(p) >= 2]
        logger.info(f"  {position_cn} ({position_en}): {len(valid_prefixes)} 个有效前缀")

        for prefix in valid_prefixes:
            rows.append(NodeIpcMapping(
                industry_chain=INDUSTRY_CHAIN,
                chain_position=position_en,
                node_name=position_cn,          # 用环节名作为节点名（粗粒度）
                ipc_prefix=prefix.strip(),
                match_weight=get_weight(prefix),
            ))

    logger.info(f"共准备写入 {len(rows)} 条记录")

    # 写入数据库
    db = SessionLocal()
    try:
        # 清空旧数据（同产业链）
        deleted = db.query(NodeIpcMapping).filter(
            NodeIpcMapping.industry_chain == INDUSTRY_CHAIN
        ).delete()
        logger.info(f"已清除旧记录 {deleted} 条")

        db.bulk_save_objects(rows)
        db.commit()
        logger.info(f"✅ 成功写入 {len(rows)} 条 IPC 映射记录")

        # 打印摘要
        for pos_cn in POSITION_MAP:
            pos_en = POSITION_MAP[pos_cn]
            cnt = sum(1 for r in rows if r.chain_position == pos_en)
            high = sum(1 for r in rows if r.chain_position == pos_en and r.match_weight == 1.0)
            logger.info(f"  {pos_cn}: {cnt} 条（核心权重1.0: {high} 条，辅助权重0.6: {cnt - high} 条）")

    except Exception as e:
        db.rollback()
        logger.error(f"写入失败: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
