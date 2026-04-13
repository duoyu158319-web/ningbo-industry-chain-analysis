# -*- coding: utf-8 -*-
"""
import_ipc_from_docx_v2.py
--------------------------------------------------
从《新能源汽车相关专利定义.docx》解析 IPC 前缀，
清空旧数据后按文档分类重新写入 node_ipc_mapping。

文档节结构：
  5.1  新能源汽车整车制造      → 整车制造 节点
  5.2  新能源汽车装置、配件制造  → 核心零部件 节点
  5.3  新能源汽车相关设施制造   → 电控系统组件 节点（设施/充电）
  5.4  新能源汽车相关服务       → 汽车服务 节点

IPC 处理规则：
  - "B60K1*" → 前缀 "B60K1"（去掉 *）
  - "B60L50/70" → 前缀 "B60L50/70"（精确前缀）
  - "(不含XXX)" 括号排除说明忽略，全部取 prefix
"""

import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from docx import Document
from core.database import SessionLocal
from models.patent import NodeIpcMapping
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

DOCX_PATH = r"e:\毕业设计\宁波市产业链智能分析平台\data\新能源汽车相关专利定义.docx"

# 文档中 5.x 子标题 → 数据库 chain_node 名称映射
# NOTE: 通过之前查询确认节点名称
SECTION_TO_NODE = {
    "5.1": "新能源汽车整车",
    "5.2": "核心零部件",
    "5.3": "电控系统组件",
    "5.4": "汽车服务",
}


def parse_ipc_codes(raw_cell: str) -> list[str]:
    """
    从表格单元格文本中提取所有 IPC 前缀。
    - 去掉括号中的排除说明（不含...）
    - "B60K1*" → "B60K1"
    - 按顿号 / 中文逗号 / 英文逗号 分割
    """
    # 去掉括号内排除说明
    cleaned = re.sub(r"（不含[^）]*）", "", raw_cell)
    cleaned = re.sub(r"\(不含[^)]*\)", "", cleaned)

    # 分割
    codes = re.split(r"[、，,\s]+", cleaned)
    result = []
    for code in codes:
        code = code.strip().rstrip("*").strip()
        if not code:
            continue
        # 只保留合法 IPC 前缀格式（字母+数字开头）
        if re.match(r"^[A-HY]\d", code):
            result.append(code)
    return result


def load_ipc_from_docx(path: str) -> dict[str, list[str]]:
    """解析 docx，返回 {node_name: [ipc_prefix, ...]}"""
    doc = Document(path)
    node_prefixes: dict[str, list[str]] = {v: [] for v in SECTION_TO_NODE.values()}

    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            if len(cells) < 3:
                continue
            section_id = cells[0].strip()
            ipc_raw    = cells[2].strip()

            node_name = SECTION_TO_NODE.get(section_id)
            if node_name and ipc_raw:
                prefixes = parse_ipc_codes(ipc_raw)
                node_prefixes[node_name].extend(prefixes)

    # 去重
    for node in node_prefixes:
        node_prefixes[node] = sorted(set(node_prefixes[node]))
        logger.info("Node [%s]: %d IPC prefixes", node, len(node_prefixes[node]))

    return node_prefixes


SECTION_TO_POSITION = {
    "5.1": "整车制造",
    "5.2": "零部件制造",
    "5.3": "相关设施",
    "5.4": "相关服务",
}

INDUSTRY_CHAIN = "新能源汽车"


def update_node_ipc_mapping(node_prefixes: dict[str, list[str]]) -> None:
    db = SessionLocal()
    try:
        # 清空旧数据
        deleted = db.query(NodeIpcMapping).delete()
        logger.info("Deleted %d old records.", deleted)

        # 写入新数据
        total = 0
        for section_id, node_name in SECTION_TO_NODE.items():
            prefixes   = node_prefixes.get(node_name, [])
            position   = SECTION_TO_POSITION.get(section_id, section_id)
            for prefix in prefixes:
                db.add(NodeIpcMapping(
                    industry_chain=INDUSTRY_CHAIN,
                    chain_position=position,
                    node_name=node_name,
                    ipc_prefix=prefix,
                ))
                total += 1

        db.commit()
        logger.info("Inserted %d records into node_ipc_mapping.", total)

    except Exception as e:
        db.rollback()
        logger.error("Failed: %s", e)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    logger.info("Parsing docx: %s", DOCX_PATH)
    node_prefixes = load_ipc_from_docx(DOCX_PATH)
    update_node_ipc_mapping(node_prefixes)
    logger.info("[DONE] node_ipc_mapping updated successfully.")
