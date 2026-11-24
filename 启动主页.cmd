@echo off
chcp 65001 >nul
cd /d "%~dp0"
title H-Jie的个人主页与照片管理
python local_manager.py --open
echo.
echo 如果提示端口被占用，可以直接打开 http://127.0.0.1:4173/manage
echo 关闭运行中的服务窗口后，本地管理工具才会停止。
pause
