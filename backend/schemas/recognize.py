# -*- coding: utf-8 -*-
from pydantic import BaseModel, Field
from typing import List, Optional


# ────────── 专利 Schema ──────────

class PatentCreate(BaseModel):
    """新增专利的请求体"""
    enterprise_id: Optional[int] = Field(None, description="关联企业ID，可为空")
    title: str = Field(..., description="专利标题")
    abstract: Optional[str] = Field(None, description="专利摘要")
    ipc_codes: Optional[str] = Field(None, description="IPC分类号，逗号分隔，如 H01M4/36,H01M10/0525")
    patent_type: str = Field(default="发明", description="发明 / 实用新型 / 外观设计")
    pub_date: Optional[str] = Field(None, description="公开日期，如 2022-05-18")
    applicant: Optional[str] = Field(None, description="申请人名称")


class PatentDetail(BaseModel):
    """专利详情响应"""
    id: int
    enterprise_id: Optional[int] = None
    title: str
    abstract: Optional[str] = None
    ipc_codes: Optional[str] = None
    patent_type: str
    pub_date: Optional[str] = None
    applicant: Optional[str] = None
    source: str

    class Config:
        from_attributes = True


# ────────── 分词知识库 Schema ──────────

class KeywordCreate(BaseModel):
    """新增分词条目"""
    industry_chain: Optional[str] = None
    chain_position: Optional[str] = None
    node_name: Optional[str] = None
    keyword: str
    weight: float = Field(default=1.0, ge=0.0, le=1.0)
    level: str = Field(default="node", description="chain / position / node")


class KeywordDetail(BaseModel):
    id: int
    industry_chain: Optional[str] = None
    chain_position: Optional[str] = None
    node_name: Optional[str] = None
    keyword: str
    weight: float
    level: str

    class Config:
        from_attributes = True


# ────────── 识别请求/响应 Schema ──────────

class RecognizeRequest(BaseModel):
    """
    单条企业识别请求。
    必填：企业名称 + 经营范围文本
    可选：产业链限定（加速推理）、专利信息（提升准确率）
    """
    name: str = Field(..., description="企业名称")
    business_scope: str = Field(..., description="经营范围描述文本")
    industry_chain: Optional[str] = Field(None, description="若已知产业链，可限定范围加速推理")
    # 专利辅助匹配（二选一或均不填）
    ipc_codes: Optional[str] = Field(None, description="已知IPC号，逗号分隔，用于精确匹配节点")
    patent_text: Optional[str] = Field(None, description="专利标题或摘要文本，无IPC时使用")


class NodeScore(BaseModel):
    """单个节点的评分明细"""
    node_name: str
    chain_position: str
    industry_chain: str
    # 融合最终分
    final_score: float = Field(description="融合最终分 0~100")
    # 分项来源（用于前端分解展示）
    scope_score: float = Field(description="经营范围文本匹配分")
    patent_score: float = Field(description="专利辅助分（无专利则为0）")
    # 命中的关键词（可解释性）
    matched_keywords: List[str] = Field(default_factory=list, description="命中的关键词列表")


class RecognizeResponse(BaseModel):
    """识别结果"""
    # Top-3 推荐节点
    top3: List[NodeScore]
    # 所有节点的分值（用于图谱展示）
    all_scores: List[NodeScore]
    # NOTE: 记录本次用了哪种推理路径，便于调试和前端展示
    method_used: str = Field(
        description="推理方法: model_only / model+ipc / model+patent_text / keyword_fallback"
    )
    # 是否使用了训练好的 ML 模型
    model_loaded: bool = False


# ────────── NEV 新能源汽车产业链预测 Schema ──────────

class NevPatentItem(BaseModel):
    """单条专利/技术信息"""
    title: str = Field(default="", description="专利标题或技术名称")
    abstract: str = Field(default="", description="专利摘要或技术描述")
    ipc_codes: List[str] = Field(default_factory=list, description="该专利的 IPC 分类号列表（如 H01M10/052）")


class NevPredictRequest(BaseModel):
    """
    新能源汽车产业链节点判定请求
    企业信息与专利列表均可选，但至少需要提供一方。
    """
    enterprise_name: str = Field(default="", description="企业名称")
    industry_major: str = Field(default="", description="国标行业门类")
    industry_large: str = Field(default="", description="国标行业大类")
    industry_medium: str = Field(default="", description="国标行业中类")
    industry_minor: str = Field(default="", description="国标行业小类")
    enterprise_intro: str = Field(default="", description="企业简介")
    business_scope: str = Field(default="", description="经营范围")
    patents: List[NevPatentItem] = Field(default_factory=list, description="专利列表")
    ipc_codes: List[str] = Field(default_factory=list, description="IPC 分类号列表")

    # 可选调参
    biz_weight: float = Field(default=0.5, ge=0.0, le=1.0, description="企业侧权重")
    ipc_weight: float = Field(default=0.15, ge=0.0, le=1.0, description="IPC 信号权重")
    threshold_stage: float = Field(default=0.50, ge=0.0, le=1.0, description="环节置信阈值")
    threshold_second: float = Field(default=0.50, ge=0.0, le=1.0, description="二级分类置信阈值")
    threshold_third: float = Field(default=0.50, ge=0.0, le=1.0, description="三级分类置信阈值")


class NevLevelResult(BaseModel):
    """单层级预测结果"""
    label: Optional[str] = None
    confidence: float = 0.0
    low_confidence: bool = False
    candidates: dict = Field(default_factory=dict, description="所有超过阈值的候选项及其概率")


class NevPredictResponse(BaseModel):
    """新能源汽车产业链节点三层判定结果"""
    input_sources: List[str] = Field(default_factory=list)
    models_used: List[str] = Field(default_factory=list)
    stage: NevLevelResult = Field(description="环节（上游/中游/下游）")
    second: NevLevelResult = Field(description="二级分类")
    third: NevLevelResult = Field(description="三级分类（仅核心零部件时有值）")
    score_detail: dict = Field(default_factory=dict, description="各层级分数明细")
