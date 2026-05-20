@echo off
setlocal enabledelayedexpansion

set "SERVICE_NAME=PostMem"
set "PORT=3000"
set "NSSM_EXE=D:\nssm-2.24\win64\nssm.exe"

REM ===== 部署目标目录（按需修改）=====
set "TARGET_DIR=C:\Program Files\PostMem"

REM ===== 构建产物目录（相对于此脚本）=====
set "DIST_DIR=%~dp0..\dist"

set "START_JS=%TARGET_DIR%\start.cjs"

echo ========================================
echo   PostMem - Install Windows Service
echo ========================================
echo.

if not exist "%DIST_DIR%" (
    echo [ERROR] Build artifact not found: %DIST_DIR%
    echo          Please run "pnpm run build" first to generate the dist/ directory.
    echo.
    pause
    exit /b 1
)

if not exist "%NSSM_EXE%" (
    echo [ERROR] nssm not found: %NSSM_EXE%
    echo          Please download nssm from https://nssm.cc/download
    echo          and update the NSSM_EXE path in this script.
    pause
    exit /b 1
)

REM ----- Copy dist to target directory -----
echo [INFO] Deploying to: %TARGET_DIR%
if exist "%TARGET_DIR%" (
    echo [INFO] Target directory exists, removing old files ...
    rmdir /s /q "%TARGET_DIR%"
)
mkdir "%TARGET_DIR%"
echo [INFO] Copying build artifacts to target directory ...
xcopy "%DIST_DIR%" "%TARGET_DIR%" /E /I /H /Y >nul
echo [INFO] Deployment complete.

REM ----- Verify start.cjs exists -----
if not exist "%START_JS%" (
    echo [ERROR] start.cjs not found in build output. Ensure build.mjs completed successfully.
    pause
    exit /b 1
)

REM ----- Service management -----
sc query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Service "%SERVICE_NAME%" already exists, removing old one ...
    net stop "%SERVICE_NAME%" >nul 2>&1
    timeout /t 3 /nobreak >nul
    sc delete "%SERVICE_NAME%" >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo [INFO] Installing service "%SERVICE_NAME%" ...

REM ----- Use start.cjs as the entry point (loads .env then delegates to server.js) -----
"%NSSM_EXE%" install "%SERVICE_NAME%" "C:\Program Files\nodejs\node.exe" "%START_JS%"

"%NSSM_EXE%" set "%SERVICE_NAME%" AppDirectory "%TARGET_DIR%"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStdout "%TARGET_DIR%\logs\service-output.log"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStderr "%TARGET_DIR%\logs\service-error.log"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRotateFiles 1
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRotateBytes 10485760
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRotateOnline 1

REM ----- Environment: .env is loaded by start.cjs automatically. -----
REM ----- Only override essential runtime vars here. -----
"%NSSM_EXE%" set "%SERVICE_NAME%" AppEnvironmentExtra PORT=%PORT%
"%NSSM_EXE%" set "%SERVICE_NAME%" AppEnvironmentExtra NODE_ENV=production
"%NSSM_EXE%" set "%SERVICE_NAME%" Start SERVICE_AUTO_START
"%NSSM_EXE%" set "%SERVICE_NAME%" DisplayName "PostMem - Personal Knowledge Base"
"%NSSM_EXE%" set "%SERVICE_NAME%" Description "PostMem personal knowledge base system with local embedding and LLM chunking, runs at http://localhost:%PORT%"

REM ----- Ensure log directory exists -----
if not exist "%TARGET_DIR%\logs" mkdir "%TARGET_DIR%\logs"

echo [INFO] Starting service ...
net start "%SERVICE_NAME%"

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   Install Succeeded!
    echo   Service Name: %SERVICE_NAME%
    echo   Target Dir:   %TARGET_DIR%
    echo   URL:          http://localhost:%PORT%
    echo   Log Dir:      %TARGET_DIR%\logs\
    echo ========================================
    echo.
    echo   [NOTE] All config is read from .env in the target directory.
    echo   [NOTE] To update .env: edit %TARGET_DIR%\.env then restart service.
    echo   [NOTE] Run migrations if needed:
    echo          cd /d "%TARGET_DIR%"
    echo          npx prisma migrate deploy
    echo.
) else (
    echo [ERROR] Service failed to start, check configuration
    echo         View logs: %TARGET_DIR%\logs\service-error.log
    echo         Common issues:
    echo           1. .env file missing required vars (DATABASE_URL, etc.)
    echo           2. Node.js not found at C:\Program Files\nodejs\node.exe
    echo           3. PostgreSQL / Redis not reachable
    pause
    exit /b 1
)

pause
endlocal
