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
set DIST_DIR=%SCRIPT_DIR%..\dist

if not exist "%DIST_DIR%\server.js" (
    echo [ERROR] Build artifacts not found in dist/ directory.
    echo         Please run 'pnpm run build' first.
    exit /b 1
)

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

echo [INFO] Deploying to: %TARGET_DIR%
if exist "%TARGET_DIR%" (
    echo [INFO] Removing old deployment ...
    rmdir /s /q "%TARGET_DIR%"
)
mkdir "%TARGET_DIR%"

echo [INFO] Copying build artifacts from dist/ to target directory ...
xcopy "%DIST_DIR%\*" "%TARGET_DIR%\" /e /i /q /y >nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to copy build artifacts.
    exit /b 1
)
echo [INFO] Deployment complete.

if not exist "%TARGET_DIR%\start.cjs" (
    echo [ERROR] start.cjs not found in target directory. Build may be incomplete.
    exit /b 1
)

if not exist "%TARGET_DIR%\server.js" (
    echo [ERROR] server.js not found in target directory. Build may be incomplete.
    exit /b 1
)

if not exist "%TARGET_DIR%\.env" (
    echo [WARN] .env not found in target directory. Service may fail to start.
    echo        Please copy .env to %TARGET_DIR%\.env manually.
)

mkdir "%TARGET_DIR%\logs" 2>nul

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
