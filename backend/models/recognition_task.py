# -*- coding: utf-8 -*-
"""
recognition_task.py — 识别任务临时表

存储 ML 推理结果，记录审核状态。
- status=pending   : 待审核
- status=confirmed : 已确认入库（enterprise_id 关联 enterprises 表）
- status=rejected  : 已拒绝，不入库
"""
import datetime
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, JSON
from core.database import Base


class RecognitionTask(Base):
    __tablename__ = "recognition_tasks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # ── 企业基础信息（ML推理时的输入）──
    enterprise_name      = Column(String(255), nullable=False, index=True, comment="企业名称")
    credit_code          = Column(String(50),  nullable=True,  comment="统一信用代码（用户填写）")
    enterprise_intro     = Column(Text,        nullable=True,  comment="企业简介")
    business_scope       = Column(Text,        nullable=True,  comment="经营范围")
    industry_major       = Column(String(100), nullable=True,  comment="国标行业（输入时）")
    patents_json         = Column(Text,        nullable=True,  comment="专利输入列表（JSON）")
    biz_weight           = Column(Float,       default=0.5,    comment="企业信息权重")
    ipc_weight           = Column(Float,       default=0.2,    comment="IPC权重")
    threshold            = Column(Float,       default=0.3,    comment="置信度阈值")

    # ── ML 推理结果 ──
    ml_stage             = Column(String(50),  nullable=True, comment="环节判定（上游/中游/下游）")
    ml_stage_conf        = Column(Float,       default=0.0,   comment="环节置信度")
    ml_second            = Column(String(100), nullable=True, comment="二级分类判定")
    ml_second_conf       = Column(Float,       default=0.0,   comment="二级置信度")
    ml_third             = Column(String(100), nullable=True, comment="三级分类判定")
    ml_third_conf        = Column(Float,       default=0.0,   comment="三级置信度")
    ml_score_detail      = Column(Text,        nullable=True, comment="全量分数明细（JSON）")
    ml_models_used       = Column(Text,        nullable=True, comment="使用的模型列表（JSON）")

    # ── 用户审核时补充的信息 ──
    credit_code_filled   = Column(String(50),  nullable=True, comment="确认时填的信用代码")
    address              = Column(Text,        nullable=True, comment="企业地址（用于地理编码）")
    province             = Column(String(50),  default="浙江省", comment="省")
    city                 = Column(String(50),  default="宁波市", comment="市")
    district             = Column(String(50),  nullable=True, comment="区/县")
    registered_capital   = Column(Float,       nullable=True, comment="注册资本（万元）")
    paid_in_capital      = Column(Float,       nullable=True, comment="实缴资本（万元）")
    scale                = Column(String(20),  nullable=True, comment="企业规模：微型/小型/中型/大型")
    industry_category    = Column(String(100), nullable=True, comment="国标门类")
    industry_major_filled = Column(String(100), nullable=True, comment="国标大类")
    industry_medium      = Column(String(100), nullable=True, comment="国标中类")
    industry_minor       = Column(String(100), nullable=True, comment="国标小类")

    # ── 地理编码结果（确认时由高德解码）──
    lat                  = Column(Float,       nullable=True, comment="纬度")
    lng                  = Column(Float,       nullable=True, comment="经度")
    geo_address_matched  = Column(String(255), nullable=True, comment="高德匹配地址")
    geo_score            = Column(Float,       nullable=True, comment="地理编码得分")

    # ── 状态管理 ──
    status               = Column(String(20),  default="pending", index=True,
                                  comment="状态: pending/confirmed/rejected")
    created_at           = Column(DateTime, default=datetime.datetime.utcnow, comment="创建时间")
    confirmed_at         = Column(DateTime, nullable=True, comment="确认/拒绝时间")

    # ── 入库后关联 ──
    enterprise_id        = Column(Integer, nullable=True, index=True,
                                  comment="入库后关联的 enterprises.id")

    def __repr__(self) -> str:
        return f"<RecognitionTask(id={self.id}, name='{self.enterprise_name}', status='{self.status}')>"
