@echo off
title NovaGIF Studio Launcher
echo ===========================================
echo   NovaGIF Studio (8-Bit Pixel Edition)
echo ===========================================
echo.
echo [*] Starting local development server...
start /min cmd /c "npm run dev"
echo [*] Waiting for server to start...
timeout /t 2 >nul
echo [*] Opening NovaGIF Studio in your browser...
start http://localhost:5173/
echo.
echo [OK] Done! You can minimize this window.
echo      To close the server, close the minimized terminal or press Ctrl+C here.
echo.
pause
