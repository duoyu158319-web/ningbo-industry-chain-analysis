# -*- coding: utf-8 -*-
"""
产业链识别模型训练脚本

使用方式（在 backend/ 目录下）：
    py -3 scripts/train_recognizer.py --chain 新能源汽车 --csv path/to/data.csv

CSV 格式要求（两列）：
    business_scope  | chain_node
    磷酸铁锂的研发… | 正极材料
    电芯制造与销售… | 电芯制造

训练产物（保存至 backend/ml_models/）：
    {chain}_vectorizer.pkl  — TF-IDF 向量化器
    {chain}_model.pkl        — LinearSVC 分类器
    {chain}_report.txt       — 分类报告（accuracy、f1等）
"""
import sys
import os
import argparse
import pickle
import logging
from pathlib import Path

# 将 backend/ 加入模块搜索路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).parent.parent / "ml_models"
MODEL_DIR.mkdir(exist_ok=True)


def load_jieba_stopwords() -> set:
    """加载停用词：过滤'公司''有限''销售'等对分类无意义的高频词"""
    stopwords = {
        "有限", "责任", "公司", "股份", "集团", "及", "的", "与", "和",
        "或", "等", "其", "为", "以", "是", "在", "对", "从事", "提供",
        "服务", "业务", "研发", "开发", "生产", "销售", "代理", "经营",
        "技术", "咨询", "设计", "制造", "加工", "贸易", "进出口",
    }
    return stopwords


def tokenize(text: str, stopwords: set) -> str:
    """jieba 分词 → 过滤停用词 → 返回空格分隔的词串（供 TfidfVectorizer 处理）"""
    try:
        import jieba
        tokens = jieba.cut(text)
        return " ".join(t for t in tokens if t.strip() and t not in stopwords and len(t) > 1)
    except ImportError:
        logger.warning("jieba 未安装，将使用字符级 n-gram 作为 token")
        return " ".join(text)


def train(chain_name: str, records: list[tuple[str, str]]) -> None:
    """
    训练核心函数。
    records: [(business_scope, chain_node), ...]
    """
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.svm import LinearSVC
    from sklearn.pipeline import Pipeline
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import classification_report

    # 加载 chain_keyword 表中的专业词汇（需要数据库连接）
    # NOTE: 此处也可以直接从种子数据读，避免依赖数据库
    stopwords = load_jieba_stopwords()

    logger.info(f"[train] 开始处理 {len(records)} 条训练数据...")
    texts, labels = zip(*records)

    # 分词预处理
    tokenized = [tokenize(t, stopwords) for t in texts]

    # TF-IDF 向量化
    # NOTE: min_df=2 过滤只出现一次的罕见词；ngram_range=(1,2) 捕获二元短语如"正极材料"
    vectorizer = TfidfVectorizer(
        min_df=2,
        max_features=8000,
        ngram_range=(1, 2),
        sublinear_tf=True,  # 对词频取对数，减少高频词主导
    )

    X = vectorizer.fit_transform(tokenized)
    y = list(labels)

    if len(set(y)) < 2:
        logger.error("[train] 标签类别数不足 2，无法训练！")
        return

    # 训练/验证集拆分（8:2）
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    # LinearSVC：在短文本多分类中表现优异，速度快
    model = LinearSVC(C=1.0, max_iter=2000, class_weight="balanced")
    model.fit(X_train, y_train)

    # 评估
    y_pred = model.predict(X_test)
    report = classification_report(y_test, y_pred, zero_division=0)
    logger.info(f"\n[分类报告]\n{report}")

    # 保存模型
    safe_name = chain_name.replace(" ", "_")
    vpath = MODEL_DIR / f"{safe_name}_vectorizer.pkl"
    mpath = MODEL_DIR / f"{safe_name}_model.pkl"
    rpath = MODEL_DIR / f"{safe_name}_report.txt"

    with open(vpath, "wb") as f:
        pickle.dump(vectorizer, f)
    with open(mpath, "wb") as f:
        pickle.dump(model, f)
    with open(rpath, "w", encoding="utf-8") as f:
        f.write(f"产业链: {chain_name}\n训练样本: {len(records)}\n\n{report}")

    logger.info(f"[train] 模型已保存至 {MODEL_DIR}")
    logger.info(f"  向量化器: {vpath.name}")
    logger.info(f"  分类器:   {mpath.name}")
    logger.info(f"  报告:     {rpath.name}")


def load_csv(csv_path: str) -> list[tuple[str, str]]:
    """读取 CSV 文件（需包含 business_scope 和 chain_node 两列）"""
    import csv
    records = []
    with open(csv_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            scope = row.get("business_scope", "").strip()
            node = row.get("chain_node", "").strip()
            if scope and node:
                records.append((scope, node))
    logger.info(f"[load_csv] 从 {csv_path} 读取 {len(records)} 条有效记录")
    return records


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="产业链识别模型训练脚本")
    parser.add_argument("--chain", required=True, help="产业链名称，如 '新能源汽车'")
    parser.add_argument("--csv", required=True, help="训练数据 CSV 文件路径")
    args = parser.parse_args()

    records = load_csv(args.csv)
    if not records:
        logger.error("未读取到有效数据，请检查 CSV 文件格式")
        sys.exit(1)

    train(args.chain, records)
