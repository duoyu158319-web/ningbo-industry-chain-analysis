"""
批量根据 patent_similarity_score 回填 association_level 字段。
阈值规则统一引用 schemas.enterprise.calc_association_level，避免与其他入口分叉。
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import SessionLocal
from models.enterprise import Enterprise
from schemas.enterprise import calc_association_level

def main():
    db = SessionLocal()
    try:
        enterprises = db.query(Enterprise).all()
        print(f"共 {len(enterprises)} 家企业，开始回填 association_level...")

        stats: dict[str, int] = {}
        for ent in enterprises:
            score = ent.patent_similarity_score or 0.0
            level = calc_association_level(score)
            ent.association_level = level
            stats[level] = stats.get(level, 0) + 1

        db.commit()
        print("回填完成！分布：")
        for label in ["强", "较强", "中"]:
            print(f"  {label}: {stats.get(label, 0)} 条")

    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    main()
