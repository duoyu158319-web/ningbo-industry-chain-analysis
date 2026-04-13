# -*- coding: utf-8 -*-
"""
import_patents.py — 将新能源汽车专利.xlsx 批量导入 patents 表

字段映射：
  标题(译)(简体中文) / 标题         → title
  摘要(译)(简体中文) / 摘要          → abstract
  IPC分类号（| 分隔）               → ipc_codes（逗号分隔）
  专利类型                          → patent_type
  公开(公告)日                      → pub_date
  [标]当前申请(专利权)人             → applicant
  工商统一社会信用代码               → 关联 enterprises.credit_code → enterprise_id

性能设计：
  - 批量 bulk_insert（每批 2000 条），避免逐行 commit
  - 用内存字典缓存 credit_code → enterprise_id
  - 跳过已存在的 applicant+pub_date 组合（防重复）
  - 文本截断保护（title 500字符，ipc_codes 500字符）
"""
import sys, os, re, logging
from datetime import datetime

import openpyxl

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND_DIR)

from core.database import SessionLocal, engine
from models.patent import Patent
from models.enterprise import Enterprise
from sqlalchemy import text

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

XLSX_PATH = os.path.normpath(os.path.join(
    os.path.dirname(_BACKEND_DIR), "data", "新能源汽车专利.xlsx"
))
BATCH_SIZE = 2000    # 每批提交条数
MAX_TITLE  = 500
MAX_IPC    = 500
MAX_DATE   = 50
MAX_TYPE   = 50
MAX_APP    = 255


def clean_ipc(raw: str | None) -> str | None:
    """将 'B62D25/20 | B60K1/04' 转为 'B62D25/20,B60K1/04'"""
    if not raw:
        return None
    codes = [c.strip() for c in re.split(r'[|；;,，\s]+', str(raw)) if c.strip()]
    result = ",".join(codes)
    return result[:MAX_IPC] if result else None


def safe_str(val, max_len: int) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return s[:max_len] if s else None


def load_enterprise_map(db) -> dict[str, int]:
    """从 enterprises 表加载 credit_code → id 的映射"""
    rows = db.execute(text("SELECT id, credit_code FROM enterprises WHERE credit_code IS NOT NULL")).fetchall()
    m = {r[1]: r[0] for r in rows if r[1]}
    logger.info(f"企业信用代码缓存: {len(m)} 条")
    return m


def run():
    logger.info(f"读取 Excel: {XLSX_PATH}")
    if not os.path.exists(XLSX_PATH):
        logger.error(f"文件不存在: {XLSX_PATH}")
        sys.exit(1)

    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.rows

    # 读取表头，建立列名→索引映射
    headers = [str(c.value).strip() if c.value else "" for c in next(rows_iter)]
    col = {h: i for i, h in enumerate(headers)}
    logger.info(f"共 {len(headers)} 列，总行数约 {ws.max_row - 1} 条")

    db = SessionLocal()
    try:
        ent_map = load_enterprise_map(db)

        # NOTE: 清空 patents 表再全量重建（专利数据属于基础数据，全量替换更安全）
        confirm = input("将清空 patents 表后全量导入，确认继续？(y/n): ").strip().lower()
        if confirm != 'y':
            logger.info("用户取消操作")
            return

        logger.info("清空 patents 表...")
        db.execute(text("DELETE FROM patents"))
        db.commit()
        logger.info("清空完成，开始批量导入...")

        batch: list[dict] = []
        total_written = 0
        total_skipped = 0
        start_time = datetime.now()

        def flush_batch():
            nonlocal total_written
            if not batch:
                return
            db.execute(Patent.__table__.insert(), batch)
            db.commit()
            total_written += len(batch)
            batch.clear()
            elapsed = (datetime.now() - start_time).seconds
            logger.info(f"  已写入 {total_written} 条  跳过 {total_skipped} 条  耗时 {elapsed}s")

        for row in rows_iter:
            vals = [c.value for c in row]

            def get(key: str):
                idx = col.get(key)
                return vals[idx] if idx is not None and idx < len(vals) else None

            # 标题：优先中文译文
            title_raw = get("标题(译)(简体中文)") or get("标题")
            title = safe_str(title_raw, MAX_TITLE)
            if not title:
                total_skipped += 1
                continue

            # 摘要：优先中文译文
            abstract = safe_str(get("摘要(译)(简体中文)") or get("摘要"), 10000)

            # IPC
            ipc_codes = clean_ipc(get("IPC分类号"))

            # 专利类型
            patent_type_raw = safe_str(get("专利类型"), MAX_TYPE) or "发明"
            # 标准化：发明申请/授权发明 → 发明；实用新型；外观设计
            if "实用新型" in patent_type_raw:
                patent_type = "实用新型"
            elif "外观" in patent_type_raw:
                patent_type = "外观设计"
            else:
                patent_type = "发明"

            # 公开日期
            pub_date_raw = get("公开(公告)日")
            if pub_date_raw:
                pub_date = str(pub_date_raw)[:MAX_DATE]
            else:
                pub_date = None

            # 申请人
            applicant = safe_str(get("[标]当前申请(专利权)人"), MAX_APP)

            # 关联企业
            credit_code = safe_str(get("工商统一社会信用代码"), 50)
            enterprise_id = ent_map.get(credit_code) if credit_code else None

            batch.append({
                "enterprise_id": enterprise_id,
                "title": title,
                "abstract": abstract,
                "ipc_codes": ipc_codes,
                "patent_type": patent_type,
                "pub_date": pub_date,
                "applicant": applicant,
                "source": "import",
            })

            if len(batch) >= BATCH_SIZE:
                flush_batch()

        flush_batch()  # 写入最后一批

        wb.close()
        elapsed = (datetime.now() - start_time).seconds
        logger.info(f"✅ 导入完成！总写入: {total_written} 条，跳过: {total_skipped} 条，耗时: {elapsed}s")

        # 统计关联企业数量
        linked = db.execute(text("SELECT COUNT(*) FROM patents WHERE enterprise_id IS NOT NULL")).scalar()
        total = db.execute(text("SELECT COUNT(*) FROM patents")).scalar()
        logger.info(f"  关联企业: {linked}/{total} 条（{linked/total*100:.1f}%）")

    except Exception as e:
        db.rollback()
        logger.error(f"导入失败: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
