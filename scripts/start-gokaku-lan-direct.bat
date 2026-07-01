@echo off
chcp 65001 >nul
echo.
echo [INFO] Direct port 3000 does not work on this PC.
echo [INFO] Starting LAN proxy version instead...
echo.
call "%~dp0start-gokaku-lan.bat"
