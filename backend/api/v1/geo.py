from fastapi import APIRouter
from typing import Optional

from services import amap_service
from schemas.base import ApiResponse

router = APIRouter()


@router.get("/districts/", response_model=ApiResponse[list])
async def query_districts(
    keywords: str,
    subdistrict: int = 1,
):
    """
    行政区划查询（代理高德 v3/config/district），供前端省/市/区级联选择器使用。
    - keywords: 查询关键字，如 '浙江省'、'宁波市'
    - subdistrict: 向下展开层级数 0=仅本级, 1=含下一级, 2=含两级
    """
    districts = await amap_service.get_districts(keywords, subdistrict)
    return ApiResponse(data=districts)
