#!/bin/bash
set -eo pipefail

SERVICE_NAME="PostMem"
NSSM_EXE="D:\\nssm-2.24\\win64\\nssm.exe"

echo "========================================"
echo "  PostMem - Uninstall Windows Service"
echo "========================================"
echo ""

echo "[WARN] This will stop and remove the '${SERVICE_NAME}' service."
read -rp "Are you sure? (Y/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "[INFO] Uninstall cancelled."
  exit 0
fi

echo "[INFO] Stopping service ..."
powershell.exe -Command "Start-Process powershell -ArgumentList '-Command','Stop-Service -Name ${SERVICE_NAME} -Force' -Verb RunAs -Wait"

sleep 2

echo "[INFO] Removing service ..."
powershell.exe -Command "Start-Process '${NSSM_EXE}' -ArgumentList 'remove ${SERVICE_NAME} confirm' -Verb RunAs -Wait"

sleep 2

echo ""
echo "========================================"
echo "  Uninstall Complete!"
echo "  Service '${SERVICE_NAME}' has been removed."
echo "========================================"
echo ""
echo "  [NOTE] Log files and build artifacts are not deleted."
echo "  [NOTE] To clean up: rm -rf /mnt/d/prod/postmem"
echo ""