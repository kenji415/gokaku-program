@echo off
setlocal EnableExtensions
cd /d "C:\Users\doctor\gokaku-program"
if errorlevel 1 (
  echo [ERROR] Cannot open project folder.
  echo C:\Users\doctor\gokaku-program
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json not found.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found. Install Node.js first.
  pause
  exit /b 1
)

REM If already running on :3000, just open browser.
powershell.exe -NoProfile -Command "try { $null = Invoke-WebRequest -UseBasicParsing http://localhost:3000 -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo Already running. Opening http://localhost:3000
  start "" "http://localhost:3000"
  exit /b 0
)

echo Starting gokaku-program (npm run dev)...
echo Browser will open after a few seconds.
echo Press Ctrl+C in this window to stop.
echo.

REM Open browser once the server is up (best-effort, does not block start).
start "" /b cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:3000"

call npm.cmd run dev
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Start failed. Exit code: %EXIT_CODE%
  echo Check the messages above. This window stays open.
  pause
)

exit /b %EXIT_CODE%