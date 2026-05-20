@echo off
setlocal enabledelayedexpansion

set "SERVICE_NAME=PostMem"
set "NSSM_EXE=D:\nssm-2.24\win64\nssm.exe"

echo ========================================
echo   PostMem - Uninstall Windows Service
echo ========================================
echo.

sc query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Service "%SERVICE_NAME%" does not exist, nothing to uninstall.
    pause
    exit /b 0
)

echo [WARN] This will stop and remove the "%SERVICE_NAME%" service.
set /p CONFIRM=Are you sure? (Y/N):

if /i not "!CONFIRM!"=="Y" (
    echo [INFO] Uninstall cancelled.
    pause
    exit /b 0
)

echo [INFO] Stopping service ...
net stop "%SERVICE_NAME%" >nul 2>&1

if %errorlevel% equ 0 (
    echo [INFO] Service stopped successfully.
) else (
    echo [WARN] Service may already be stopped, continuing ...
)

timeout /t 2 /nobreak >nul

echo [INFO] Removing service ...
sc delete "%SERVICE_NAME%" >nul 2>&1

if %errorlevel% equ 0 (
    echo [INFO] Service removal initiated.
) else (
    echo [ERROR] Failed to remove service.
    pause
    exit /b 1
)

timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo   Uninstall Succeeded!
echo   Service "%SERVICE_NAME%" has been removed.
echo ========================================
echo.
echo   [NOTE] Log files and build artifacts are not deleted.
echo   [NOTE] To clean up logs: rmdir /s /q logs
echo.

pause
endlocal
