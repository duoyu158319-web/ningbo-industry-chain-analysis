# -*- coding: utf-8 -*-
"""
recognition_task.py — 识别任务相关 Pydantic Schema
"""
import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# ────────────── 创建任务（ML推理完成后提交）──────────────

class RecognitionTaskCreate(BaseModel):
    """ML 推理完成后，前端提交的任务数据"""
    enterprise_name:  str  = Field(..., description="企业名称")
    credit_code:      Optional[str]   = Field(None, description="统一信用代码")
    enterprise_intro: Optional[str]   = Field(None)
    business_scope:   Optional[str]   = Field(None)
    industry_major:   Optional[str]   = Field(None)
    patents_json:     Optional[str]   = Field(None, description="专利列表 JSON 字符串")
    biz_weight:       float = Field(0.5)
    ipc_weight:       float = Field(0.2)
    threshold:        float = Field(0.3)

    # ML 推理结果
    ml_stage:         Optional[str]   = None
    ml_stage_conf:    float = 0.0
    ml_second:        Optional[str]   = None
    ml_second_conf:   float = 0.0
    ml_third:         Optional[str]   = None
    ml_third_conf:    float = 0.0
    ml_score_detail:  Optional[str]   = Field(None, description="JSON 字符串")
    ml_models_used:   Optional[str]   = Field(None, description="JSON 字符串")


# ────────────── 详情返回 ──────────────

class RecognitionTaskDetail(BaseModel):
    """任务列表/详情返回"""
    id:               int
    enterprise_name:  str
    credit_code:      Optional[str]
    enterprise_intro: Optional[str]
    business_scope:   Optional[str]
    industry_major:   Optional[str]

    ml_stage:         Optional[str]
    ml_stage_conf:    float
    ml_second:        Optional[str]
    ml_second_conf:   float
    ml_third:         Optional[str]
    ml_third_conf:    float
    ml_score_detail:  Optional[str]
    ml_models_used:   Optional[str]

    status:           str
    created_at:       datetime.datetime
    confirmed_at:     Optional[datetime.datetime]
    enterprise_id:    Optional[int]

    # 地理信息（确认后填充）
    address:          Optional[str]
    province:         Optional[str]
    city:             Optional[str]
    district:         Optional[str]
    lat:              Optional[float]
    lng:              Optional[float]
    registered_capital: Optional[float]
    paid_in_capital:  Optional[float]
    scale:            Optional[str]
    industry_category: Optional[str]
    industry_major_filled: Optional[str]
    industry_medium:  Optional[str]
    industry_minor:   Optional[str]

    class Config:
        from_attributes = True


# ────────────── 确认入库（弹窗提交）──────────────

class RecognitionTaskConfirm(BaseModel):
    """确认入库时用户补充的企业信息"""
    credit_code:          str   = Field(...,  description="统一信用代码（必填）")
    address:              Optional[str]  = Field(None, description="企业注册地址")
    province:             str   = Field("浙江省")
    city:                 str   = Field("宁波市")
    district:             Optional[str]  = Field(None, description="区/县")
    registered_capital:   Optional[float] = Field(None, description="注册资本（万元）")
    paid_in_capital:      Optional[float] = Field(None, description="实缴资本（万元）")
    scale:                Optional[str]  = Field(None, description="微型/小型/中型/大型")
    industry_category:    Optional[str]  = None
    industry_major_filled: Optional[str] = None
    industry_medium:      Optional[str]  = None
    industry_minor:       Optional[str]  = None
    # 链节点覆盖（若审核时觉得 ML 判错，可手动调整）
    chain_node_override:  Optional[str]  = Field(None, description="手动覆盖二级分类")


# ────────────── 地理编码 ──────────────

class GeocodeResult(BaseModel):
    address:          str
    formatted_address: Optional[str]
    lat:              Optional[float]
    lng:              Optional[float]
    level:            Optional[str]   = None
    confidence:       Optional[float] = None
    success:          bool


# ────────────── 任务摘要（前端 badge 计数）──────────────

class TaskSummary(BaseModel):
    pending:   int
    confirmed: int
    rejected:  int
    total:     int
