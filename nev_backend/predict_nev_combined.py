"""
predict_nev_combined.py
综合判定模型：融合企业经营范围模型 + 专利文本模型
─────────────────────────────────────────────────────────────
输入可以是以下任意组合：
  a) 仅企业信息（企业名称 / 经营范围 / 行业分类 / 简介）
  b) 仅专利信息（标题(译) / 摘要(译)）
  c) 同时提供两者 → 加权融合

决策流程：
  1. 环节（上游 / 中游 / 下游）— 企业+专利联合判断
  2. 二级分类 — 企业使用阶段聚焦模型，专利使用直接模型，联合判断
  3. 三级分类（仅二级==核心零部件时）— 同上

置信度：
  - 使用 LinearSVC.decision_function → softmax 得到伪概率
  - 低于阈值时结果标记 low_confidence=True（仍输出预测，供参考）

可配置参数（通过 CombinedConfig 传入）：
  biz_weight      企业模型权重（默认 0.3 | 精度 ~75-90%）
  patent_weight   专利模型权重（默认 0.7 | 精度 ~91-99%）
  threshold_stage     环节置信阈值（默认 0.50）
  threshold_second    二级置信阈值（默认 0.50）
  threshold_third     三级置信阈值（默认 0.55）
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import jieba
import joblib
import numpy as np

BASE_DIR = Path(__file__).resolve().parent
BIZ_STAGE_DIR = BASE_DIR / "ml_models_improved"
BIZ_FOCUS_DIR = BASE_DIR / "ml_models_focus"
PATENT_DIR = BASE_DIR / "ml_models_patent"

TOKEN_RE = re.compile(r"[\u4e00-\u9fffA-Za-z0-9\+\-]+")

# ── 加载领域词典（训练/推理共用，保证分词一致）──────────────────────────
_DOMAIN_DICT = BASE_DIR / "domain_dict.txt"
if _DOMAIN_DICT.exists():
    jieba.load_userdict(str(_DOMAIN_DICT))

# ── 分词函数（必须定义在模块顶层，与训练时命名空间一致）─────────────────
def tokenize(text: str) -> list[str]:
    cleaned = " ".join(TOKEN_RE.findall(str(text)))
    return [t.strip() for t in jieba.lcut(cleaned) if t.strip()]


def normalize_text(text: str) -> str:
    return " ".join(TOKEN_RE.findall(str(text)))


# ── 将 tokenize/normalize_text 注入 __main__ 命名空间 ───────────────────
# joblib 加载用 __main__ 训练的模型时，需要能在 __main__ 中找到这些函数
import __main__ as _main
_main.tokenize = tokenize
_main.normalize_text = normalize_text


# ── 阶段→二级分类候选标签 ────────────────────────────────────────────────
STAGE_SECOND_LABELS: dict[str, list[str]] = {
    "上游": ["关键原材料", "电池材料", "锂电设备", "核心电子元器件", "电控系统组件"],
    "中游": ["核心零部件", "新能源汽车整车"],
    "下游": ["汽车服务", "新能源汽车充电及换电", "应用领域"],
}

# 三级分类支持的二级标签
THIRD_SUPPORTED_SECOND = {"核心零部件"}

# ── 企业侧模型路径映射 ────────────────────────────────────────────────────
BIZ_STAGE_SLUG = "新能源汽车_环节_增强版"
BIZ_SECOND_SLUGS: dict[str, str] = {
    "上游": "新能源汽车_二级分类_上游聚焦",
    "中游": "新能源汽车_二级分类_中游聚焦",
    "下游": "新能源汽车_二级分类_下游聚焦",
}
BIZ_THIRD_SLUG = "新能源汽车_三级分类_核心零部件聚焦"

# ── 专利侧模型路径映射 ────────────────────────────────────────────────────
PAT_STAGE_SLUG = "新能源汽车_专利_环节"
PAT_SECOND_SLUG = "新能源汽车_专利_二级分类"
PAT_THIRD_SLUG = "新能源汽车_专利_三级分类"


# ── 配置数据类 ────────────────────────────────────────────────────────────
# 当前企业级应用场景中，经营范围与专利文本各有信息量：
#   - 企业文本更稳定，能提供行业/经营范围约束
#   - 专利文本更细，但在宁波样本上存在传统汽车零部件语料偏差
# 因此默认采用 0.5 : 0.5 融合；仅单侧提供时，该侧自动占满权重。
@dataclass
class CombinedConfig:
    biz_weight: float = 0.5
    patent_weight: float = 0.5
    threshold_stage: float = 0.50
    threshold_second: float = 0.50
    threshold_third: float = 0.50


# ── 工具函数 ──────────────────────────────────────────────────────────────

def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x))
    return e / e.sum()


# 模型缓存：避免每次预测都重复 joblib.load
_MODEL_CACHE: dict = {}


def _load(directory: Path, slug: str):
    """加载 model / vectorizer / labels，失败返回 None。结果缓存在内存中。"""
    key = str(directory / slug)
    if key in _MODEL_CACHE:
        return _MODEL_CACHE[key]
    try:
        model = joblib.load(directory / f"{slug}_model.pkl")
        vectorizer = joblib.load(directory / f"{slug}_vectorizer.pkl")
        labels: list[str] = joblib.load(directory / f"{slug}_labels.pkl")
        result = (model, vectorizer, labels)
        _MODEL_CACHE[key] = result
        return result
    except Exception:
        _MODEL_CACHE[key] = None
        return None


def _score_dict(text: str, artifacts) -> dict[str, float]:
    """
    返回 {label: probability}，加载失败时返回空字典。
    优先使用经 Platt Scaling 校准的 predict_proba；
    未校准模型回退到 decision_function + softmax/sigmoid。
    """
    if artifacts is None:
        return {}
    model, vectorizer, _ = artifacts          # 忽略 labels pkl，用 classes_
    features = vectorizer.transform([text])
    classes = list(model.classes_)

    if hasattr(model, "predict_proba"):
        # 校准模型（CalibratedClassifierCV）：直接使用真实概率
        probs = model.predict_proba(features)[0]
        return dict(zip(classes, probs.tolist()))

    # 非校准 LinearSVC：使用 decision_function + softmax/sigmoid
    raw = model.decision_function(features)   # shape: (1,n) 或 (1,) 或 (n,)
    if len(classes) == 2:
        score = float(raw.ravel()[0])
        p1 = 1.0 / (1.0 + np.exp(-score))    # sigmoid
        return {classes[0]: round(1.0 - p1, 6), classes[1]: round(p1, 6)}
    else:
        vec = raw[0] if raw.ndim == 2 else raw
        probs = _softmax(vec)
        return dict(zip(classes, probs.tolist()))


def _combine(
    scores_a: dict[str, float],
    scores_b: dict[str, float],
    w_a: float,
    w_b: float,
    candidate_labels: Optional[list[str]] = None,
) -> dict[str, float]:
    """
    加权合并两个概率字典。
    - 若某一方为空，则另一方占100%。
    - candidate_labels 限定标签空间（用于阶段过滤）。
    """
    # 确定活跃权重（某一方缺失则另一方满权）
    have_a = bool(scores_a)
    have_b = bool(scores_b)
    if not have_a and not have_b:
        return {}
    if not have_a:
        w_a, w_b = 0.0, 1.0
    elif not have_b:
        w_a, w_b = 1.0, 0.0
    else:
        total = w_a + w_b
        w_a, w_b = w_a / total, w_b / total

    all_labels = candidate_labels if candidate_labels else sorted(
        set(scores_a) | set(scores_b)
    )
    # 过滤候选标签
    if candidate_labels:
        all_labels = [l for l in candidate_labels if l in scores_a or l in scores_b]

    if not all_labels:
        return {}

    combined: dict[str, float] = {}
    for label in all_labels:
        combined[label] = (
            w_a * scores_a.get(label, 0.0)
            + w_b * scores_b.get(label, 0.0)
        )
    # 对候选子集归一化
    total_prob = sum(combined.values())
    if total_prob > 0:
        combined = {k: v / total_prob for k, v in combined.items()}
    return combined


def _best(scores: dict[str, float]) -> tuple[str, float]:
    """返回 (best_label, confidence)。"""
    if not scores:
        return "", 0.0
    label = max(scores, key=scores.__getitem__)
    return label, scores[label]


def _passing_scores(scores: dict[str, float], threshold: float) -> dict[str, float]:
    """返回所有 >= threshold 的标签分数，按概率从高到低排序。"""
    passed = [
        (label, round(prob, 4))
        for label, prob in scores.items()
        if prob >= threshold
    ]
    passed.sort(key=lambda x: x[1], reverse=True)
    return dict(passed)


# ── 文本构建 ──────────────────────────────────────────────────────────────

def build_biz_text(
    enterprise_name: str = "",
    industry_major: str = "",
    industry_large: str = "",
    industry_middle: str = "",
    industry_small: str = "",
    enterprise_intro: str = "",
    business_scope: str = "",
) -> str:
    industry = " ".join(
        filter(None, [industry_major.strip(), industry_large.strip(),
                      industry_middle.strip(), industry_small.strip()])
    )
    return (
        f"企业名称 {enterprise_name.strip()} "
        f"国标行业 {industry} "
        f"企业简介 {enterprise_intro.strip()} "
        f"经营范围 {business_scope.strip()}"
    ).strip()


def build_patent_text(title_cn: str = "", abstract_cn: str = "") -> str:
    return f"{title_cn.strip()} {abstract_cn.strip()}".strip()


# ── 主预测函数 ────────────────────────────────────────────────────────────

def predict_combined(
    # 企业字段（全部可选，不传则不使用企业模型）
    enterprise_name: str = "",
    industry_major: str = "",
    industry_large: str = "",
    industry_middle: str = "",
    industry_small: str = "",
    enterprise_intro: str = "",
    business_scope: str = "",
    # 专利字段（全部可选，不传则不使用专利模型）
    patent_title_cn: str = "",
    patent_abstract_cn: str = "",
    # 配置
    config: Optional[CombinedConfig] = None,
) -> dict:
    if config is None:
        config = CombinedConfig()

    biz_text = build_biz_text(
        enterprise_name, industry_major, industry_large,
        industry_middle, industry_small, enterprise_intro, business_scope,
    )
    pat_text = build_patent_text(patent_title_cn, patent_abstract_cn)

    use_biz = any([
        enterprise_name.strip(), business_scope.strip(), enterprise_intro.strip(),
        industry_major.strip(), industry_large.strip(),
        industry_middle.strip(), industry_small.strip(),
    ])
    use_pat = len(pat_text.replace(" ", "")) > 5

    result: dict = {
        "input_sources": [],
        "环节": None,
        "环节_置信度": 0.0,
        "环节_低置信度": False,
        "环节_命中候选": {},
        "二级分类": None,
        "二级分类_置信度": 0.0,
        "二级分类_低置信度": False,
        "二级分类_命中候选": {},
        "三级分类": None,
        "三级分类_置信度": 0.0,
        "三级分类_低置信度": False,
        "三级分类_命中候选": {},
        "各级分数明细": {},
        "使用模型": [],
    }

    if use_biz:
        result["input_sources"].append("企业信息")
    if use_pat:
        result["input_sources"].append("专利文本")

    if not use_biz and not use_pat:
        result["错误"] = "未提供有效输入（企业信息与专利文本均为空）"
        return result

    # ─── 1. 环节预测 ──────────────────────────────────────────────────────
    biz_stage_scores: dict[str, float] = {}
    pat_stage_scores: dict[str, float] = {}

    if use_biz:
        arts = _load(BIZ_STAGE_DIR, BIZ_STAGE_SLUG)
        biz_stage_scores = _score_dict(biz_text, arts)
        if arts:
            result["使用模型"].append("企业_环节模型")

    if use_pat:
        arts = _load(PATENT_DIR, PAT_STAGE_SLUG)
        pat_stage_scores = _score_dict(pat_text, arts)
        if arts:
            result["使用模型"].append("专利_环节模型")

    stage_scores = _combine(
        biz_stage_scores, pat_stage_scores,
        config.biz_weight, config.patent_weight,
    )
    stage, stage_conf = _best(stage_scores)
    result["环节_命中候选"] = _passing_scores(stage_scores, config.threshold_stage)
    result["环节_置信度"] = round(stage_conf, 4)
    result["环节_低置信度"] = bool(stage_conf < config.threshold_stage)
    result["各级分数明细"]["环节"] = {k: round(v, 4) for k, v in stage_scores.items()}
    result["环节"] = stage if stage_conf >= config.threshold_stage else None

    if not stage or result["环节"] is None:
        return result

    # ─── 2. 二级分类预测 ─────────────────────────────────────────────────
    biz_second_scores: dict[str, float] = {}
    pat_second_scores: dict[str, float] = {}

    if use_biz:
        slug = BIZ_SECOND_SLUGS.get(stage)
        if slug:
            arts = _load(BIZ_FOCUS_DIR, slug)
            biz_second_scores = _score_dict(biz_text, arts)
            if arts:
                result["使用模型"].append(f"企业_二级分类_{stage}聚焦")

    if use_pat:
        arts = _load(PATENT_DIR, PAT_SECOND_SLUG)
        pat_second_scores = _score_dict(pat_text, arts)
        if arts:
            result["使用模型"].append("专利_二级分类模型")

    # 只在该阶段候选标签内融合
    stage_candidates = STAGE_SECOND_LABELS.get(stage)
    second_scores = _combine(
        biz_second_scores, pat_second_scores,
        config.biz_weight, config.patent_weight,
        candidate_labels=stage_candidates,
    )
    second, second_conf = _best(second_scores)
    result["二级分类_命中候选"] = _passing_scores(second_scores, config.threshold_second)
    result["二级分类"] = second if second_conf >= config.threshold_second else None
    result["二级分类_置信度"] = round(second_conf, 4)
    result["二级分类_低置信度"] = bool(second_conf < config.threshold_second)
    result["各级分数明细"]["二级分类"] = {k: round(v, 4) for k, v in second_scores.items()}

    # ─── 3. 三级分类预测（仅核心零部件）────────────────────────────────
    if result["二级分类"] in THIRD_SUPPORTED_SECOND:
        biz_third_scores: dict[str, float] = {}
        pat_third_scores: dict[str, float] = {}

        if use_biz:
            arts = _load(BIZ_FOCUS_DIR, BIZ_THIRD_SLUG)
            biz_third_scores = _score_dict(biz_text, arts)
            if arts:
                result["使用模型"].append("企业_三级分类_核心零部件聚焦")

        if use_pat:
            arts = _load(PATENT_DIR, PAT_THIRD_SLUG)
            pat_third_scores = _score_dict(pat_text, arts)
            if arts:
                result["使用模型"].append("专利_三级分类模型")

        third_scores = _combine(
            biz_third_scores, pat_third_scores,
            config.biz_weight, config.patent_weight,
        )
        third, third_conf = _best(third_scores)
        result["三级分类_命中候选"] = _passing_scores(third_scores, config.threshold_third)
        result["三级分类"] = third if third_conf >= config.threshold_third else None
        result["三级分类_置信度"] = round(third_conf, 4)
        result["三级分类_低置信度"] = bool(third_conf < config.threshold_third)
        result["各级分数明细"]["三级分类"] = {k: round(v, 4) for k, v in third_scores.items()}

    return result


# ── CLI 入口 ──────────────────────────────────────────────────────────────

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="综合判定：企业经营范围 + 专利文本 联合预测新能源汽车产业链位置"
    )
    # 企业字段
    parser.add_argument("--name",    default="", help="企业名称")
    parser.add_argument("--scope",   default="", help="经营范围")
    parser.add_argument("--intro",   default="", help="企业简介")
    parser.add_argument("--major",   default="", help="国标行业(门类)")
    parser.add_argument("--large",   default="", help="国标行业(大类)")
    parser.add_argument("--middle",  default="", help="国标行业(中类)")
    parser.add_argument("--small",   default="", help="国标行业(小类)")
    # 专利字段
    parser.add_argument("--pat-title",    default="", dest="pat_title",    help="专利标题(译)")
    parser.add_argument("--pat-abstract", default="", dest="pat_abstract", help="专利摘要(译)")
    # 权重与阈值
    parser.add_argument("--biz-weight",   type=float, default=0.5,  dest="biz_weight",
                        help="企业模型权重（默认0.5）")
    parser.add_argument("--pat-weight",   type=float, default=0.5,  dest="pat_weight",
                        help="专利模型权重（默认0.5）")
    parser.add_argument("--thr-stage",    type=float, default=0.50, dest="thr_stage",
                        help="环节置信阈值（默认0.50）")
    parser.add_argument("--thr-second",   type=float, default=0.50, dest="thr_second",
                        help="二级置信阈值（默认0.50）")
    parser.add_argument("--thr-third",    type=float, default=0.50, dest="thr_third",
                        help="三级置信阈值（默认0.50）")

    args = parser.parse_args()
    cfg = CombinedConfig(
        biz_weight=args.biz_weight,
        patent_weight=args.pat_weight,
        threshold_stage=args.thr_stage,
        threshold_second=args.thr_second,
        threshold_third=args.thr_third,
    )

    result = predict_combined(
        enterprise_name=args.name,
        industry_major=args.major,
        industry_large=args.large,
        industry_middle=args.middle,
        industry_small=args.small,
        enterprise_intro=args.intro,
        business_scope=args.scope,
        patent_title_cn=args.pat_title,
        patent_abstract_cn=args.pat_abstract,
        config=cfg,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
