@echo off
chcp 65001 >nul
cd /d "%~dp0.."

set "PYTHON=C:\Users\doctor\printviewer\venv\Scripts\python.exe"
if not exist "%PYTHON%" (
  echo [ERROR] venv not found: %PYTHON%
  pause
  exit /b 1
)

echo ============================================================
echo  Gokaku LAN start - Python proxy on port 5000
echo  Stop printviewer first if it uses port 5000.
echo ============================================================
echo.

if not exist ".next\BUILD_ID" (
  echo Building...
  call npm run build
  if errorlevel 1 exit /b 1
)

set PORT=3000
start "gokaku-next" /MIN cmd /c "cd /d \"%CD%\" && set PORT=3000 && npm start"
echo Starting Next.js on internal port 3000...
timeout /t 4 /nobreak >nul

echo.
echo When OK, you will see Flask messages in red/yellow:
echo   Running on http://192.168.0.41:5000
echo.
echo Open from other PCs:
echo   http://192.168.0.41:5000/login
echo.
echo If you only see Next.js text, LAN access is NOT active.
echo.

"%PYTHON%" "%~dp0lan-proxy-5000.py"
