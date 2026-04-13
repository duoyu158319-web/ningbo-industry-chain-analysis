@echo off
chcp 65001 > nul
title NEV ML 推理服务 (port 8001)
echo.
echo ============================================
echo   新能源汽车 ML 推理服务
echo   地址: http://localhost:8001
echo   健康检查: http://localhost:8001/health
echo ============================================
echo.

:: 切换到 nev_backend 目录
cd /d "%~dp0"

:: 检查 uvicorn 是否可用
py -3 -m uvicorn --version > nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 uvicorn，正在安装...
    py -3 -m pip install uvicorn
)

echo [启动中] 正在加载 8 个 ML 模型，请稍候...
echo.
py -3 -m uvicorn nev_api:app --host 0.0.0.0 --port 8001 --reload

pause
