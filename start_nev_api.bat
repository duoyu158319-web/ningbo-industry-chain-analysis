@echo off
chcp 65001 >nul
echo ============================================
echo  NEV 推理微服务启动脚本
echo  端口: 8001  模型目录: nev_backend/
echo ============================================
cd /d "%~dp0nev_backend"
echo.
echo [1/2] 检查依赖...
pip install -r requirements.txt -q
echo.
echo [2/2] 启动 nev_api 推理服务...
echo  访问文档: http://localhost:8001/docs
echo  健康检查: http://localhost:8001/health
echo.
uvicorn nev_api:app --host 0.0.0.0 --port 8001 --reload
