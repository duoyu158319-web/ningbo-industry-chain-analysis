from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings

# NOTE: 这里将使用 FastAPI 初始化应用
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="后端 API 服务",
)

# HACK: 这里为了方便本地前端 Vite 开发联调，解析逗号分隔的 URL 设为 Origins
origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": f"Welcome to {settings.PROJECT_NAME}"}

from api.v1 import api_router
app.include_router(api_router, prefix="/api/v1")

# NOTE: 启动时自动为尚不存在的表建表（仅新增，不修改已有表结构）
from core.database import engine, Base
import models.enterprise        # noqa: F401
import models.patent            # noqa: F401
import models.recognition_task  # noqa: F401
Base.metadata.create_all(bind=engine)
