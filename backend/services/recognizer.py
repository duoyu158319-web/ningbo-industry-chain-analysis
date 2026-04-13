# -*- coding: utf-8 -*-
"""
产业链识别推理服务

推理流程：
    1. 尝试加载离线训练好的 ML 模型（LinearSVC pkl）
    2. 若模型可用 → 用 TF-IDF + 分类器预测节点概率分布
    3. 若模型不可用 → 降级为关键词匹配（使用 chain_keyword 表）
    4. 若有专利 IPC → 通过 node_ipc_mapping 前缀匹配叠加打分
    5. 若无 IPC 但有专利文本 → 文本降权后代入步骤2/3
    6. 融合分 = scope_score × 0.6 + patent_score × 0.4
"""
import os
import logging
import pickle
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from models.patent import ChainKeyword, NodeIpcMapping
from schemas.recognize import NodeScore, RecognizeResponse

logger = logging.getLogger(__name__)

# NOTE: 模型文件存放在 backend/ml_models/ 目录下
#       文件命名约定: {chain_name}_vectorizer.pkl / {chain_name}_model.pkl
ML_MODEL_DIR = Path(__file__).parent.parent / "ml_models"

# 融合权重常量
WEIGHT_SCOPE = 0.6
WEIGHT_PATENT = 0.4
WEIGHT_PATENT_TEXT_PENALTY = 0.7  # 专利文本匹配（无IPC）的降权系数


def _load_model(chain_name: str) -> tuple:
    """
    尝试加载指定产业链的 TF-IDF 向量化器和分类器。
    返回 (vectorizer, model) 或 (None, None)（文件不存在时）。
    """
    safe_name = chain_name.replace(" ", "_")
    vpath = ML_MODEL_DIR / f"{safe_name}_vectorizer.pkl"
    mpath = ML_MODEL_DIR / f"{safe_name}_model.pkl"

    if not vpath.exists() or not mpath.exists():
        logger.info(f"[recognizer] 未找到产业链 '{chain_name}' 的训练模型，将降级为关键词匹配")
        return None, None

    try:
        with open(vpath, "rb") as f:
            vectorizer = pickle.load(f)
        with open(mpath, "rb") as f:
            model = pickle.load(f)
        logger.info(f"[recognizer] 已加载产业链 '{chain_name}' 的 ML 模型")
        return vectorizer, model
    except Exception as e:
        logger.warning(f"[recognizer] 加载模型失败: {e}")
        return None, None


def _try_import_jieba():
    """懒加载 jieba，避免在未安装时启动报错"""
    try:
        import jieba
        return jieba
    except ImportError:
        logger.warning("[recognizer] jieba 未安装，将跳过分词直接使用原文")
        return None


def _tokenize(text: str) -> list[str]:
    """
    中文分词：优先使用 jieba，未安装时退化为原文字符串。
    返回 token 列表（同时保留原始文本用于子串匹配双保险）。
    """
    jieba = _try_import_jieba()
    if jieba:
        return list(jieba.cut(text))
    return list(text)


def _score_by_keywords(text: str, db: Session, industry_chain: Optional[str] = None) -> dict[str, float]:
    """
    关键词匹配（兜底方案 / 可解释性标注）。
    对每个节点的关键词组计算加权命中率：
        score = Σ(命中关键词.weight) / Σ(所有关键词.weight) × 100

    同时使用 jieba tokens 精确匹配 + 原文子串匹配（双重保险）：
    - jieba 分词精度高，避免子串误命中
    - 原文子串兜底，防止 jieba 误切行业专有名词
    """
    tokens = set(_tokenize(text))  # jieba 分词结果
    text_lower = text  # 原文（子串匹配兜底）

    query = db.query(ChainKeyword)
    if industry_chain:
        query = query.filter(
            (ChainKeyword.industry_chain == industry_chain) |
            (ChainKeyword.industry_chain == None)
        )
    keywords = query.filter(ChainKeyword.node_name != None).all()

    # 按 node_name 分组
    node_kw_groups: dict[str, list] = {}
    for kw in keywords:
        node_kw_groups.setdefault(kw.node_name, []).append(kw)

    scores: dict[str, float] = {}
    for node_name, kws in node_kw_groups.items():
        total_weight = sum(kw.weight for kw in kws)
        if total_weight == 0:
            continue
        hit_weight = sum(
            kw.weight for kw in kws
            if kw.keyword in tokens or kw.keyword in text_lower
        )
        scores[node_name] = round((hit_weight / total_weight) * 100, 2)

    return scores


def _score_by_ipc(ipc_codes_str: str, db: Session) -> dict[str, float]:
    """
    IPC 前缀直接匹配（精确信号，权重最高）。
    对每个节点，累加所有命中 IPC 前缀的 match_weight × 100，上限为 100。

    NOTE: IPC 号格式如 "H01M4/36"，前缀匹配 "H01M4" 即可
    """
    ipc_list = [c.strip() for c in ipc_codes_str.split(",") if c.strip()]
    mappings = db.query(NodeIpcMapping).all()

    scores: dict[str, float] = {}
    for mapping in mappings:
        for ipc in ipc_list:
            if ipc.upper().startswith(mapping.ipc_prefix.upper()):
                prev = scores.get(mapping.node_name, 0.0)
                scores[mapping.node_name] = min(prev + mapping.match_weight * 100, 100.0)

    return {k: round(v, 2) for k, v in scores.items()}


def _get_node_meta(node_name: str, db: Session) -> dict:
    """按 node_name 查询节点所属的 industry_chain 和 chain_position"""
    from models.chain import ChainNodeDefinition
    node = db.query(ChainNodeDefinition).filter(
        ChainNodeDefinition.node_name == node_name
    ).first()
    if node:
        return {"industry_chain": node.industry_chain, "chain_position": node.chain_position}
    return {"industry_chain": "未知", "chain_position": "未知"}


def _get_matched_keywords(text: str, node_name: str, db: Session) -> list[str]:
    """返回文本中命中该节点的所有关键词（用于前端展示可解释性）"""
    tokens = set(_tokenize(text))
    kws = db.query(ChainKeyword).filter(ChainKeyword.node_name == node_name).all()
    return [kw.keyword for kw in kws if kw.keyword in tokens or kw.keyword in text]


def run_recognition(
    name: str,
    business_scope: str,
    db: Session,
    industry_chain: Optional[str] = None,
    ipc_codes: Optional[str] = None,
    patent_text: Optional[str] = None,
) -> RecognizeResponse:
    """
    智能识别主入口。

    优先级：
      1. 若 industry_chain 指定 → 加载该链的 ML 模型
      2. 若 industry_chain 为空 → 遍历所有已有模型，选分值最高的
      3. 模型不可用 → 关键词兜底

    专利信号（独立于主分类，叠加处理）：
      - ipc_codes 优先（精确），patent_text 次之（文本降权）
      - 两者都无则 method = model_only / keyword_fallback
    """
    scope_scores: dict[str, float] = {}
    model_loaded = False
    method_parts = []

    # ── 步骤1：经营范围评分 ──────────────────────────────────────────
    vectorizer, model = _load_model(industry_chain) if industry_chain else (None, None)

    if vectorizer and model:
        # ML 模型路径
        model_loaded = True
        method_parts.append("model")
        try:
            # 尝试获取各类别的概率分布（LinearSVC 不原生支持 predict_proba）
            # NOTE: sklearn LinearSVC 使用 decision_function 作为置信度代理
            vec = vectorizer.transform([business_scope])
            classes = model.classes_
            decision = model.decision_function(vec)[0]

            # 归一化到 0-100
            d_min, d_max = decision.min(), decision.max()
            if d_max > d_min:
                normalized = (decision - d_min) / (d_max - d_min) * 100
            else:
                normalized = [50.0] * len(classes)

            scope_scores = {cls: round(float(score), 2) for cls, score in zip(classes, normalized)}
        except Exception as e:
            logger.warning(f"[recognizer] ML 推理失败，降级为关键词匹配: {e}")
            scope_scores = _score_by_keywords(business_scope, db, industry_chain)
            method_parts = ["keyword_fallback"]
    else:
        # 关键词兜底
        scope_scores = _score_by_keywords(business_scope, db, industry_chain)
        method_parts.append("keyword_fallback")

    # ── 步骤2：专利信号评分 ──────────────────────────────────────────
    patent_scores: dict[str, float] = {}
    has_patent = False

    if ipc_codes and ipc_codes.strip():
        patent_scores = _score_by_ipc(ipc_codes, db)
        has_patent = True
        method_parts.append("ipc")
    elif patent_text and patent_text.strip():
        raw_patent_scores = _score_by_keywords(patent_text, db, industry_chain)
        # 无 IPC 时专利文本降权
        patent_scores = {k: round(v * WEIGHT_PATENT_TEXT_PENALTY, 2) for k, v in raw_patent_scores.items()}
        has_patent = True
        method_parts.append("patent_text")

    # ── 步骤3：融合评分 ───────────────────────────────────────────────
    all_nodes = set(scope_scores.keys()) | set(patent_scores.keys())
    merged: dict[str, float] = {}

    for node in all_nodes:
        s_score = scope_scores.get(node, 0.0)
        p_score = patent_scores.get(node, 0.0)

        if has_patent:
            merged[node] = round(s_score * WEIGHT_SCOPE + p_score * WEIGHT_PATENT, 2)
        else:
            merged[node] = s_score

    # ── 步骤4：组装结果 ───────────────────────────────────────────────
    def build_node_score(node_name: str, final_score: float) -> NodeScore:
        meta = _get_node_meta(node_name, db)
        return NodeScore(
            node_name=node_name,
            chain_position=meta["chain_position"],
            industry_chain=meta["industry_chain"],
            final_score=final_score,
            scope_score=scope_scores.get(node_name, 0.0),
            patent_score=patent_scores.get(node_name, 0.0),
            matched_keywords=_get_matched_keywords(business_scope, node_name, db),
        )

    sorted_nodes = sorted(merged.items(), key=lambda x: x[1], reverse=True)
    all_scores = [build_node_score(n, s) for n, s in sorted_nodes]
    top3 = all_scores[:3]

    method_used = "+".join(method_parts) if method_parts else "keyword_fallback"

    return RecognizeResponse(
        top3=top3,
        all_scores=all_scores,
        method_used=method_used,
        model_loaded=model_loaded,
    )
