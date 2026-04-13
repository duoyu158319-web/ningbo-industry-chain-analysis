"""
Vercel Serverless Function 入口文件

NOTE: Vercel Python Runtime 使用 Mangum 将 ASGI（FastAPI）应用适配为 AWS Lambda 兼容接口。
      文件命名为 index.py，对应路由 /api/* → /api/index。

HACK: Vercel 的工作目录是项目根目录，但 backend/ 内部使用相对导入（如 from core.config import settings），
      所以需要将 backend/ 加入 sys.path 最高优先级，以保证所有模块能被正确解析。
"""
import sys
import os

# 将 backend 目录添加到模块搜索路径最前面（绝对路径，避免 cwd 不确定）
_backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from main import app  # noqa: F401
from mangum import Mangum

# Mangum 将 AWS Lambda / Vercel Serverless 的请求格式转换为 ASGI 标准格式
handler = Mangum(app, lifespan="off")
