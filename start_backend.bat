@echo off
chcp 65001 > nul
title 主后端 API 服务 (port 8000)
echo.
echo ============================================
echo   宁波市产业链智能分析平台 - 主后端
echo   地址: http://localhost:8000
echo   接口文档: http://localhost:8000/docs
echo ============================================
echo.

cd /d "%~dp0backend"

echo [启动中] FastAPI 主后端服务...
echo.
py -3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

pause
