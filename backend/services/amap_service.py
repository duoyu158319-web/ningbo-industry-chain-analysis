"""
高德地图 Web Service 调用封装

NOTE: 所有对高德 REST API 的请求均在后端发起，不在前端暴露 Key。
      遵循「前端 → 后端 FastAPI → 高德 Web Service」代理架构。
"""
import httpx
import math
import logging
from typing import Optional

from core.config import settings

logger = logging.getLogger(__name__)

AMAP_BASE_URL = "https://restapi.amap.com"

# 各出行方式的平均速度（km/h），用于估算等时圈探索半径
AVG_SPEED_KMH: dict[str, float] = {
    "driving": 40.0,
    "walking": 5.0,
}

# 等时圈分析的方位角（从正北顺时针，8 个均匀分布方向）
ISOCHRONE_BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315]


async def geocode(address: str) -> Optional[dict]:
    """
    地址 → 经纬度（高德地理编码接口 v3/geocode/geo）

    :param address: 地址字符串，如 '宁波市鄞州区中河路55号'
    :return: {"lng", "lat", "district", "formatted_address"} 或 None（编码失败）
    """
    params = {
        "key": settings.AMAP_WEB_SERVICE_KEY,
        "address": address,
        "city": "0574",  # NOTE: 宁波市区号，可提升编码精度，减少歧义
        "output": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{AMAP_BASE_URL}/v3/geocode/geo", params=params)
            data = resp.json()
    except Exception as exc:
        logger.error(f"[AMap Geocode] HTTP 请求异常: {exc}")
        return None

    if data.get("status") != "1" or not data.get("geocodes"):
        logger.warning(f"[AMap Geocode] 未找到结果: address={address!r}, resp={data}")
        return None

    geo = data["geocodes"][0]
    loc_parts = geo["location"].split(",")
    return {
        "lng": float(loc_parts[0]),
        "lat": float(loc_parts[1]),
        "district": geo.get("district", ""),
        "formatted_address": geo.get("formatted_address", address),
    }


async def get_districts(keywords: str, subdistrict: int = 1) -> list[dict]:
    """
    行政区域查询（高德行政区划接口 v3/config/district）

    :param keywords: 查询关键字，如 '宁波市'
    :param subdistrict: 子级层数 0=仅本级 / 1=含下一级 / 2=含两级
    :return: 行政区信息列表（高德原始 districts 数组）
    """
    params = {
        "key": settings.AMAP_WEB_SERVICE_KEY,
        "keywords": keywords,
        "subdistrict": subdistrict,
        "output": "json",
        "extensions": "base",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{AMAP_BASE_URL}/v3/config/district", params=params)
            data = resp.json()
    except Exception as exc:
        logger.error(f"[AMap District] HTTP 请求异常: {exc}")
        return []

    if data.get("status") != "1":
        logger.error(f"[AMap District] API 返回失败: keywords={keywords!r}, resp={data}")
        return []

    return data.get("districts", [])


def _offset_lnglat(
    center_lng: float, center_lat: float, bearing_deg: float, distance_km: float
) -> tuple[float, float]:
    """
    球面坐标偏移：从起始点按方位角和距离求目标经纬度

    NOTE: 采用球面三角法，精度远优于平面近似，适用范围 <500km
    """
    R = 6371.0
    d_rat = distance_km / R
    lat1 = math.radians(center_lat)
    lng1 = math.radians(center_lng)
    brng = math.radians(bearing_deg)

    lat2 = math.asin(
        math.sin(lat1) * math.cos(d_rat)
        + math.cos(lat1) * math.sin(d_rat) * math.cos(brng)
    )
    lng2 = lng1 + math.atan2(
        math.sin(brng) * math.sin(d_rat) * math.cos(lat1),
        math.cos(d_rat) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lng2), math.degrees(lat2)


async def compute_isochrone(
    center_lng: float,
    center_lat: float,
    travel_time_min: int,
    mode: str = "driving",
) -> list[list[float]]:
    """
    等时圈分析：向 8 个方向各发起一次路径规划，截取时间限制内最远可达点，
    连成近似等时圈多边形。

    NOTE: 高德 Web Service 无直接等时圈接口，采用「多方向路径截取法」近似：
          每个方向探索到 2 倍预估距离处，遍历路径 steps 找到时间截止点。

    :param center_lng: 中心点经度
    :param center_lat: 中心点纬度
    :param travel_time_min: 等时圈时间（分钟），范围 5~120
    :param mode: 出行方式 'driving'（驾车）| 'walking'（步行）
    :return: 多边形顶点列表 [[lng, lat], ...]，顺序与 ISOCHRONE_BEARINGS 对应
    """
    speed_kmh = AVG_SPEED_KMH.get(mode, 40.0)
    # 探索半径 = 预估可达距离 × 2 倍安全余量（真实路径比直线长）
    explore_km = speed_kmh * (travel_time_min / 60.0) * 2.0
    target_seconds = float(travel_time_min * 60)

    api_path = "/v3/direction/driving" if mode == "driving" else "/v3/direction/walking"
    polygon_points: list[list[float]] = []

    async with httpx.AsyncClient(timeout=25.0) as client:
        for bearing in ISOCHRONE_BEARINGS:
            dest_lng, dest_lat = _offset_lnglat(center_lng, center_lat, bearing, explore_km)

            params: dict = {
                "key": settings.AMAP_WEB_SERVICE_KEY,
                "origin": f"{center_lng},{center_lat}",
                "destination": f"{dest_lng},{dest_lat}",
                "output": "json",
                "extensions": "all",
            }

            # 默认 fallback：若路径规划失败，以探索目标点作为边界
            boundary_lng, boundary_lat = dest_lng, dest_lat

            try:
                resp = await client.get(f"{AMAP_BASE_URL}{api_path}", params=params)
                data = resp.json()

                if data.get("status") == "1":
                    route = data.get("route", {})
                    paths = route.get("paths", [])

                    if paths:
                        steps = paths[0].get("steps", [])
                        elapsed = 0.0

                        for step in steps:
                            step_dur = float(step.get("duration", 0))
                            poly_str = step.get("polyline", "")

                            if elapsed + step_dur > target_seconds:
                                # 本步会超出时间上限，取本步起点作为边界
                                if poly_str:
                                    first_coords = poly_str.split(";")[0].split(",")
                                    boundary_lng = float(first_coords[0])
                                    boundary_lat = float(first_coords[1])
                                break

                            elapsed += step_dur

                            # 更新已通过的最新点
                            if poly_str:
                                last_coords = poly_str.split(";")[-1].split(",")
                                boundary_lng = float(last_coords[0])
                                boundary_lat = float(last_coords[1])

            except Exception as exc:
                logger.error(f"[AMap Isochrone] 方位 {bearing}° 请求失败: {exc}")

            polygon_points.append([boundary_lng, boundary_lat])

    return polygon_points
