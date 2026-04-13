from fastapi import APIRouter
from . import enterprises, chain, spatial, transition, recognize, geo, patents

api_router = APIRouter()
api_router.include_router(enterprises.router, prefix="/enterprises", tags=["企业模块"])
api_router.include_router(chain.router, prefix="/chain", tags=["图谱模块"])
api_router.include_router(spatial.router, prefix="/spatial", tags=["空间分析模块"])
api_router.include_router(transition.router, prefix="/transition", tags=["转型看板"])
api_router.include_router(recognize.router, prefix="/recognize", tags=["智能识别"])
api_router.include_router(geo.router, prefix="/geo", tags=["地理服务"])
api_router.include_router(patents.router, prefix="/patents", tags=["专利管理"])


