# -*- coding: utf-8 -*-
"""
nev_predictor.py — 新能源汽车产业链预测微服务代理

nev_api.py 运行在独立进程（端口 8001），本模块封装对它的 HTTP 调用，
供主后端 API 路由直接使用，无需感知 nev_api 内部实现。

配置环境变量：
    NEV_API_URL=http://127.0.0.1:8001   （默认值即可）
"""
import os
import logging
import httpx

from schemas.recognize import (
    NevPredictRequest, NevPredictResponse,
    NevLevelResult,
)

logger = logging.getLogger(__name__)

# NOTE: nev_api 启动在 8001，与主后端 8000 分离
NEV_API_URL = os.getenv("NEV_API_URL", "http://127.0.0.1:8001")
_TIMEOUT = httpx.Timeout(60.0, connect=5.0)


def _to_level(raw: dict, key: str) -> NevLevelResult:
    """将 nev_api 的原始字典字段映射为 NevLevelResult。"""
    return NevLevelResult(
        label=raw.get(key),
        confidence=raw.get(f"{key}_置信度", 0.0),
        low_confidence=raw.get(f"{key}_低置信度", False),
        candidates=raw.get(f"{key}_命中候选", {}),
    )


async def predict(req: NevPredictRequest) -> NevPredictResponse:
    """
    异步调用 nev_api /predict，返回结构化的三层预测结果。
    若 nev_api 不可用，抛出 RuntimeError。
    """
    payload = {
        "enterprise_name": req.enterprise_name,
        "industry_major":  req.industry_major,
        "industry_large":  req.industry_large,
        "industry_middle": req.industry_medium,
        "industry_small":  req.industry_minor,
        "enterprise_intro": req.enterprise_intro,
        "business_scope":  req.business_scope,
        # 每条专利携带自身的 ipc_codes
        "patents": [
            {
                "title":     p.title,
                "abstract":  p.abstract,
                "ipc_codes": p.ipc_codes if hasattr(p, "ipc_codes") else [],
            }
            for p in req.patents
        ],
        # 汇总级别的额外 IPC 代码
        "extra_ipc_codes": getattr(req, "ipc_codes", []),
        "ipc_weight":       getattr(req, "ipc_weight", 0.20),
        "biz_weight":        req.biz_weight,
        "threshold_stage":  req.threshold_stage,
        "threshold_second": req.threshold_second,
        "threshold_third":  req.threshold_third,
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(f"{NEV_API_URL}/predict", json=payload)
            resp.raise_for_status()
            raw = resp.json()
    except httpx.ConnectError:
        raise RuntimeError(
            f"无法连接 NEV 推理服务（{NEV_API_URL}）。"
            "请先启动：cd nev_backend && uvicorn nev_api:app --port 8001"
        )
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"NEV 推理服务返回错误 {e.response.status_code}: {e.response.text}")

    # NOTE: nev_api 旧版本返回 PredictResponse（有中文字段），
    #       新版返回 dict 格式。做兼容处理。
    if "环节" in raw and isinstance(raw["环节"], dict):
        # nev_api 已用 PredictResponse model 返回，字段是嵌套的
        env = raw["环节"]
        sec = raw.get("二级分类", {})
        trd = raw.get("三级分类", {})
        return NevPredictResponse(
            input_sources=raw.get("input_sources", []),
            models_used=raw.get("使用模型", []),
            stage=NevLevelResult(
                label=env.get("label"),
                confidence=env.get("confidence", 0.0),
                low_confidence=env.get("low_confidence", False),
                candidates=env.get("candidates", {}),
            ),
            second=NevLevelResult(
                label=sec.get("label"),
                confidence=sec.get("confidence", 0.0),
                low_confidence=sec.get("low_confidence", False),
                candidates=sec.get("candidates", {}),
            ),
            third=NevLevelResult(
                label=trd.get("label"),
                confidence=trd.get("confidence", 0.0),
                low_confidence=trd.get("low_confidence", False),
                candidates=trd.get("candidates", {}),
            ),
            score_detail=raw.get("各级分数明细", {}),
        )
    else:
        # 原始 dict 字段（_predict_with_patents 返回格式）
        return NevPredictResponse(
            input_sources=raw.get("input_sources", []),
            models_used=raw.get("使用模型", []),
            stage=_to_level(raw, "环节"),
            second=_to_level(raw, "二级分类"),
            third=_to_level(raw, "三级分类"),
            score_detail=raw.get("各级分数明细", {}),
        )


async def health_check() -> bool:
    """检查 nev_api 是否在线，返回 True/False。"""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(3.0)) as client:
            resp = await client.get(f"{NEV_API_URL}/health")
            return resp.status_code == 200
    except Exception:
        return False
