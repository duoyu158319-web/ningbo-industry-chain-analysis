# -*- coding: utf-8 -*-
"""
geocoder.py — 高德地图 Web Service 地理编码服务

调用高德 /geocode/geo 接口，将地址字符串解码为经纬度。
"""
import os
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

AMAP_KEY = os.getenv("AMAP_WEB_SERVICE_KEY", "")
_GEO_URL = "https://restapi.amap.com/v3/geocode/geo"
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


async def geocode(address: str, city: str = "宁波市") -> dict:
    """
    将地址字符串解码为经纬度。

    Returns:
        {
            "success": bool,
            "lat": float | None,
            "lng": float | None,
            "formatted_address": str | None,
            "level": str | None,
            "confidence": float | None,
        }
    """
    if not AMAP_KEY:
        logger.warning("AMAP_WEB_SERVICE_KEY 未配置，跳过地理编码")
        return {"success": False, "lat": None, "lng": None,
                "formatted_address": None, "level": None, "confidence": None}

    params = {
        "key": AMAP_KEY,
        "address": address,
        "city": city,
        "output": "JSON",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(_GEO_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"高德地理编码请求失败: {e}")
        return {"success": False, "lat": None, "lng": None,
                "formatted_address": None, "level": None, "confidence": None}

    if data.get("status") != "1" or not data.get("geocodes"):
        logger.warning(f"高德地理编码无结果: address={address}, resp={data}")
        return {"success": False, "lat": None, "lng": None,
                "formatted_address": None, "level": None, "confidence": None}

    geo = data["geocodes"][0]
    location = geo.get("location", "")
    if not location or "," not in location:
        return {"success": False, "lat": None, "lng": None,
                "formatted_address": None, "level": None, "confidence": None}

    lng_str, lat_str = location.split(",", 1)
    try:
        lng_val = float(lng_str)
        lat_val = float(lat_str)
    except ValueError:
        return {"success": False, "lat": None, "lng": None,
                "formatted_address": None, "level": None, "confidence": None}

    # NOTE: 高德返回的 level 字段表示匹配精度，如 "门址" / "道路" / "兴趣点"
    level = geo.get("level")
    # 精度分 0-10 高德不直接返回，用 level 推算简单置信度
    level_conf_map = {"门址": 0.98, "兴趣点": 0.90, "道路辅路": 0.75,
                      "道路": 0.70, "村庄": 0.65, "镇": 0.55, "区县": 0.40}
    confidence = level_conf_map.get(level, 0.60)

    return {
        "success": True,
        "lat": lat_val,
        "lng": lng_val,
        "formatted_address": geo.get("formatted_address"),
        "level": level,
        "confidence": confidence,
    }
