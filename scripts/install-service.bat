@echo off
setlocal enabledelayedexpansion

set SERVICE_NAME=PostMem
set NSSM_EXE=D:\nssm-2.24\win64\nssm.exe
set NODE_EXE=C:\Program Files\nodejs\node.exe
set TARGET_DIR=D:\prod\postmem

echo ========================================
echo   PostMem - Install Windows Service
echo ========================================
echo.

set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..

if not exist "%NSSM_EXE%" (
    echo [ERROR] nssm not found: %NSSM_EXE%
    echo         Please download nssm from https://nssm.cc/download
    exit /b 1
)

if not exist "%NODE_EXE%" (
    echo [ERROR] Node.js not found: %NODE_EXE%
    echo         Please install Node.js on Windows.
    exit /b 1
)

if not exist "%TARGET_DIR%" (
    echo [INFO] Creating target directory: %TARGET_DIR%
    mkdir "%TARGET_DIR%"
)

echo [INFO] Copying .env from project root to target directory ...
if exist "%PROJECT_DIR%\.env" (
    copy /Y "%PROJECT_DIR%\.env" "%TARGET_DIR%\.env" >nul
) else (
    echo [WARN] .env not found at project root, skipping.
)

echo [INFO] Copying start.cjs from scripts/ to target directory ...
if exist "%SCRIPT_DIR%start.cjs" (
    copy /Y "%SCRIPT_DIR%start.cjs" "%TARGET_DIR%\start.cjs" >nul
) else (
    echo [ERROR] start.cjs not found in scripts directory.
    exit /b 1
)

sc query %SERVICE_NAME% >nul 2>&1
if %errorlevel%==0 (
    echo [INFO] Service '%SERVICE_NAME%' already exists, updating ...
    echo.
    echo [INFO] Stopping service ...
    net stop %SERVICE_NAME% >nul 2>&1
    echo [INFO] Service stopped, waiting for process to release files ...
    timeout /t 3 /nobreak >nul
    echo.
) else (
    echo [INFO] Service '%SERVICE_NAME%' does not exist, will install.
    echo.
)

if not exist "%TARGET_DIR%\logs" mkdir "%TARGET_DIR%\logs"

sc query %SERVICE_NAME% >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing service '%SERVICE_NAME%' ...
    echo.
    "%NSSM_EXE%" install %SERVICE_NAME% "%NODE_EXE%" "%TARGET_DIR%\start.cjs"
    "%NSSM_EXE%" set %SERVICE_NAME% AppDirectory "%TARGET_DIR%"
    "%NSSM_EXE%" set %SERVICE_NAME% AppStdout "%TARGET_DIR%\logs\service-output.log"
    "%NSSM_EXE%" set %SERVICE_NAME% AppStderr "%TARGET_DIR%\logs\service-error.log"
    "%NSSM_EXE%" set %SERVICE_NAME% Start SERVICE_AUTO_START
    "%NSSM_EXE%" set %SERVICE_NAME% DisplayName "PostMem - Personal Knowledge Base"
)

echo [INFO] Starting service ...
net start %SERVICE_NAME%

echo.
echo ========================================
echo   Install Complete!
echo   Service Name: %SERVICE_NAME%
echo   Target Dir:   %TARGET_DIR%
echo   Log Dir:      %TARGET_DIR%\logs\
echo ========================================
echo.
echo   [NOTE] All config is read from .env in the target directory.
echo   [NOTE] To update .env: edit %TARGET_DIR%\.env then restart service.
echo   [NOTE] Run migrations if needed:
echo          cd /d "%TARGET_DIR%"
echo          npx prisma migrate deploy
echo.
