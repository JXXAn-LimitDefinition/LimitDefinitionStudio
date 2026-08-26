@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [!] 未检测到 Node.js。请先到 https://nodejs.org/zh-cn 安装（一路点下一步即可）。
  echo     安装完成后，重新双击本文件打开编辑器。
  pause
  exit /b 1
)

echo ============================================
echo   极限定义工作室 · 本地编辑器
echo   正在启动，稍后会自动打开浏览器
echo   地址: http://127.0.0.1:3130 （仅本机可访问）
echo   关闭本窗口 = 退出编辑器
echo ============================================
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 1; Start-Process 'http://127.0.0.1:3130'"
node admin\server.mjs

echo.
echo 编辑器已退出。按任意键关闭窗口。
pause >nul
