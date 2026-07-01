@echo off
chcp 65001 >nul
setlocal

set "DEST_DIR=C:\Users\doctor\gokaku-program\data"
set "SRC=V:\gokakumaker保存用\data\goukaku.db"
set "DEST=%DEST_DIR%\goukaku.db"
set "LOG=C:\Users\doctor\gokaku-program\copy-db.log"

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

echo === DB copy started %date% %time% === > "%LOG%"

if not exist "%SRC%" (
  echo SOURCE_MISSING: %SRC% >> "%LOG%"
  echo SOURCE_MISSING
  exit /b 1
)

echo SOURCE_EXISTS: %SRC% >> "%LOG%"
copy /Y "%SRC%" "%DEST%" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo COPY_FAILED >> "%LOG%"
  echo COPY_FAILED
  exit /b 1
)

for %%F in ("%DEST%") do set SIZE=%%~zF
echo COPY_OK >> "%LOG%"
echo DEST=%DEST% >> "%LOG%"
echo SIZE_BYTES=%SIZE% >> "%LOG%"
echo COPY_OK %DEST% %SIZE% bytes
exit /b 0
