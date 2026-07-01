@echo off
chcp 65001 >nul
REM 必ず「管理者として実行」した CMD から起動してください

net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] 管理者権限がありません。
  echo.
  echo 手順:
  echo   1. スタートメニューで cmd と入力
  echo   2. 「コマンド プロンプト」を右クリック
  echo   3. 「管理者として実行」
  echo   4. cd C:\Users\doctor\gokaku-program
  echo   5. scripts\allow-node-firewall.cmd
  echo.
  echo 管理者権限がない PC の場合は scripts\start-gokaku-lan.bat を使ってください。
  pause
  exit /b 1
)

echo === Node.js firewall allow (LAN port 3000) ===

for /f "delims=" %%i in ('where node 2^>nul') do set "NODE_EXE=%%i"
if not defined NODE_EXE (
  echo [ERROR] node.exe not found
  pause
  exit /b 1
)
echo node.exe: %NODE_EXE%

netsh advfirewall firewall delete rule name="Gokaku Node Inbound" >nul 2>&1
netsh advfirewall firewall add rule name="Gokaku Node Inbound" dir=in action=allow program="%NODE_EXE%" enable=yes profile=any
if errorlevel 1 (
  echo [ERROR] Failed to add Node rule
  pause
  exit /b 1
)

netsh advfirewall firewall delete rule name="Gokaku TCP 3000 In" >nul 2>&1
netsh advfirewall firewall add rule name="Gokaku TCP 3000 In" dir=in action=allow protocol=TCP localport=3000 profile=any
if errorlevel 1 (
  echo [ERROR] Failed to add port 3000 rule
  pause
  exit /b 1
)

echo.
echo [OK] Firewall rules added.
echo Test: scripts\start-gokaku-lan-direct.bat
echo If still blocked, use scripts\start-gokaku-lan.bat (port 5000 proxy).
echo.
pause
