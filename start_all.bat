@echo off
chcp 65001 > nul
title 宁波市产业链智能分析平台 - 全栈启动
echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║       宁波市产业链智能分析平台  一键启动             ║
echo ╠══════════════════════════════════════════════════════╣
echo ║  Window 1: ML 推理服务    http://localhost:8001      ║
echo ║  Window 2: 主后端 API     http://localhost:8000      ║
echo ║  Window 3: 前端开发服务   http://localhost:5173      ║
echo ╚══════════════════════════════════════════════════════╝
echo.

set ROOT=%~dp0

:: ── 窗口1：ML 推理服务（8001） ──────────────────────────────
echo [1/3] 启动 ML 推理服务 (port 8001)...
start "ML推理服务-8001" cmd /k "chcp 65001 && cd /d %ROOT%nev_backend && echo [ML] 加载模型中... && py -3 -m uvicorn nev_api:app --host 0.0.0.0 --port 8001"

:: 等待 ML 服务加载（模型较大，约需 8 秒）
echo     等待模型加载 (8s)...
timeout /t 8 /nobreak > nul

:: ── 窗口2：主后端（8000） ────────────────────────────────────
echo [2/3] 启动主后端 API (port 8000)...
start "主后端-8000" cmd /k "chcp 65001 && cd /d %ROOT%backend && echo [Backend] FastAPI 启动中... && py -3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

:: 等待后端启动
timeout /t 3 /nobreak > nul

:: ── 窗口3：前端开发服务 ──────────────────────────────────────
echo [3/3] 启动前端开发服务...
start "前端-Vite" cmd /k "chcp 65001 && cd /d %ROOT% && echo [Frontend] Vite 启动中... && npm run dev"

echo.
echo ✅ 全部服务已在独立窗口中启动！
echo.
echo    ML 推理:  http://localhost:8001/health
echo    后端文档: http://localhost:8000/docs
echo    前端页面: http://localhost:5173
echo.
echo 关闭本窗口不会停止服务，请分别关闭对应窗口来停止服务。
echo.
pause
