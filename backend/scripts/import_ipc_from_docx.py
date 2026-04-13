# -*- coding: utf-8 -*-
"""
import_ipc_from_docx.py — 从新能源汽车相关专利定义.docx 写入精细化 node_ipc_mapping 记录

分类规则（用户指定）：
  5.1 整车制造       → midstream（中游）
  5.2 装置配件制造   → upstream（上游） 或 midstream（中游）按现有IPC分布
  5.3 相关设施制造   → upstream（上游） 或 midstream（中游）按现有IPC分布
  5.4 相关服务       → downstream（下游）

5.2/5.3 判断规则：
  - B60L53*、B60L55*、H02J7*、C08K*、F17C*、G01R* → upstream（基础材料/充电基础设施）
  - 其余（H01M*、H02K*、B60G*、B60W*等整车配件） → midstream（核心装置配件）

所有权重均为 1.0（用户要求）
"""
import sys, os, re, logging
from docx import Document

# NOTE: 脚本在 backend/scripts/ 下，需要将 backend/ 加入 path
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND_DIR)

from core.database import SessionLocal
from models.patent import NodeIpcMapping

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

INDUSTRY_CHAIN = "新能源汽车"
# NOTE: 脚本在 <root>/backend/scripts/，_BACKEND_DIR = <root>/backend，根目录 = _BACKEND_DIR 的父目录
_PROJECT_ROOT = os.path.dirname(_BACKEND_DIR)
DOCX_PATH = os.path.normpath(os.path.join(_PROJECT_ROOT, "data", "新能源汽车相关专利定义.docx"))

# ── 5.2/5.3 upstream 前缀列表（其余默认 midstream） ──────────────
# NOTE: 充电基础设施、基础材料归上游
UPSTREAM_IF_52_53 = {
    "B60L53",  # 充电桩接口
    "B60L55",  # 充电基础设施
    "H02J7",   # 充电控制电路
    "C08K",    # 高分子基础材料（隔膜/绝缘）
    "F17C",    # 储气容器（氢能）
    "G01L",    # 压力测量（氢燃料压力）
    "G01M13",  # 传动测试设备
    "G01M15",  # 发动机测试设备
    "G01R31",  # 电路测量
}


def normalize_ipc(raw: str) -> list[str]:
    """
    将文档中的 IPC 字段解析为前缀列表。
    规则：
      - 通配符 * → 截取到 * 之前的部分作为前缀（如 B60K1* → B60K1）
      - 斜杠后内容 → 保留为精确前缀（如 B60K6/32 → B60K6/32）
      - 括号说明文字（不含F02B63/04）→ 忽略
      - 顿号、逗号、空格分隔多个 IPC
    """
    # 去掉括号内的补充说明
    raw = re.sub(r'（[^）]*）', '', raw)
    raw = re.sub(r'\([^)]*\)', '', raw)
    # 按顿号、逗号、空格分割
    parts = re.split(r'[、，,\s]+', raw)
    prefixes = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if '*' in p:
            # B60K1* → B60K1，取 * 前的部分
            prefix = p.split('*')[0].rstrip('/')
        else:
            prefix = p
        if len(prefix) >= 3:
            prefixes.append(prefix)
    return prefixes


def determine_position(category_code: str, ipc_prefix: str) -> str:
    """
    根据大类编号和 IPC 前缀决定 chain_position。
    5.1 → midstream
    5.4 → downstream
    5.2/5.3 → 按前缀判断 upstream/midstream
    """
    if category_code.startswith("5.1"):
        return "midstream"
    if category_code.startswith("5.4"):
        return "downstream"
    # 5.2 / 5.3 → 按前缀判断
    for up_prefix in UPSTREAM_IF_52_53:
        if ipc_prefix.startswith(up_prefix):
            return "upstream"
    return "midstream"


def determine_node_name(category_code: str, position: str) -> str:
    """根据大类编号确定 node_name"""
    mapping = {
        "5.1": "新能源汽车整车制造",
        "5.2": "新能源汽车装置配件制造",
        "5.3": "新能源汽车相关设施制造",
        "5.4": "新能源汽车相关服务",
    }
    for code, name in mapping.items():
        if category_code.startswith(code):
            return name
    return category_code


def run():
    logger.info(f"读取文档: {DOCX_PATH}")
    doc = Document(DOCX_PATH)
    tbl = doc.tables[0]

    rows_to_insert: list[NodeIpcMapping] = []
    seen = set()  # 去重

    for row in tbl.rows:
        cells = [c.text.strip() for c in row.cells]
        category_code = cells[0]   # 5.1 / 5.2 / 5.3 / 5.4
        category_name = cells[1]   # 新能源汽车整车制造 等
        ipc_raw = cells[2]         # IPC 字段

        # 只处理 5.x 子类
        if not re.match(r'^5\.[1-4]$', category_code):
            continue
        if not ipc_raw:
            continue

        prefixes = normalize_ipc(ipc_raw)
        logger.info(f"[{category_code}] {category_name}: 解析出 {len(prefixes)} 个前缀")

        for prefix in prefixes:
            position = determine_position(category_code, prefix)
            node_name = determine_node_name(category_code, position)
            key = (position, node_name, prefix)
            if key in seen:
                continue
            seen.add(key)
            rows_to_insert.append(NodeIpcMapping(
                industry_chain=INDUSTRY_CHAIN,
                chain_position=position,
                node_name=node_name,
                ipc_prefix=prefix,
                match_weight=1.0,   # 用户要求全部为 1
            ))

    logger.info(f"共解析出 {len(rows_to_insert)} 条去重后记录")

    # 写入数据库（追加，不清空已有数据）
    db = SessionLocal()
    try:
        # NOTE: 仅删除来自 docx 定义的节点名，保留之前的环节粗粒度数据
        docx_node_names = {
            "新能源汽车整车制造", "新能源汽车装置配件制造",
            "新能源汽车相关设施制造", "新能源汽车相关服务"
        }
        deleted = db.query(NodeIpcMapping).filter(
            NodeIpcMapping.industry_chain == INDUSTRY_CHAIN,
            NodeIpcMapping.node_name.in_(docx_node_names)
        ).delete(synchronize_session=False)
        logger.info(f"清除旧记录 {deleted} 条（同节点名）")

        db.bulk_save_objects(rows_to_insert)
        db.commit()
        logger.info(f"✅ 成功写入 {len(rows_to_insert)} 条")

        # 打印分布摘要
        from collections import Counter
        counter = Counter((r.chain_position, r.node_name) for r in rows_to_insert)
        for (pos, name), cnt in sorted(counter.items()):
            logger.info(f"  [{pos:12}] {name}: {cnt} 条")

    except Exception as e:
        db.rollback()
        logger.error(f"写入失败: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
