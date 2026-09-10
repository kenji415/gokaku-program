@echo off
setlocal EnableExtensions
title Gokaku Program
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

REM Prefer 127.0.0.1 (avoids IPv6 localhost hang). Short timeout via curl if available.
set "ALREADY_UP=0"
where curl.exe >nul 2>&1
if not errorlevel 1 (
  curl.exe -s -o nul -m 2 http://127.0.0.1:3000/ >nul 2>&1
  if not errorlevel 1 set "ALREADY_UP=1"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { $c = New-Object Net.Sockets.TcpClient; $iar = $c.BeginConnect('127.0.0.1',3000,$null,$null); if (-not $iar.AsyncWaitHandle.WaitOne(1500,$false)) { $c.Close(); exit 1 }; $c.EndConnect($iar); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 set "ALREADY_UP=1"
)

if "%ALREADY_UP%"=="1" (
  echo Already running. Opening http://127.0.0.1:3000
  start "" "http://127.0.0.1:3000"
  exit /b 0
)

echo Starting gokaku-program (npm run dev)...
echo Browser will open after a few seconds.
echo Press Ctrl+C in this window to stop.
echo.

REM Open browser once the server is up (best-effort, does not block start).
start "" /b cmd /c "timeout /t 8 /nobreak >nul & start http://127.0.0.1:3000"

call npm.cmd run dev
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Start failed. Exit code: %EXIT_CODE%
  echo Check the messages above. This window stays open.
  pause
)

exit /b %EXIT_CODE%
