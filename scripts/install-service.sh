#!/bin/bash
set -eo pipefail

FORCE_REINSTALL=false
if [ "${1:-}" = "--force" ] || [ "${1:-}" = "-f" ]; then
  FORCE_REINSTALL=true
fi

SERVICE_NAME="PostMem"
PORT=3000
NSSM_EXE="D:\\nssm-2.24\\win64\\nssm.exe"
NODE_EXE="C:\\Program Files\\nodejs\\node.exe"
TARGET_DIR="D:\\prod\\postmem"

NSSM_WSL="/mnt/d/nssm-2.24/win64/nssm.exe"
NODE_WSL="/mnt/c/Program Files/nodejs/node.exe"
TARGET_WSL="/mnt/d/prod/postmem"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$(cd "$SCRIPT_DIR/../dist" && pwd)"

echo "========================================"
echo "  PostMem - Install Windows Service"
echo "========================================"
echo ""

if [ ! -d "$DIST_DIR" ]; then
  echo "[ERROR] Build artifact not found: $DIST_DIR"
  echo "        Please run 'pnpm run build' first."
  exit 1
fi

if [ ! -f "$NSSM_WSL" ]; then
  echo "[ERROR] nssm not found: $NSSM_WSL"
  echo "        Please download nssm from https://nssm.cc/download"
  exit 1
fi

if [ ! -f "$NODE_WSL" ]; then
  echo "[ERROR] Node.js not found: $NODE_WSL"
  echo "        Please install Node.js on Windows."
  exit 1
fi

nssm_elevated() {
  echo "[INFO] nssm $*"
  powershell.exe -Command "Start-Process '${NSSM_EXE}' -ArgumentList '$*' -Verb RunAs -Wait"
  echo "[INFO] Done: nssm $*"
  echo ""
}

SERVICE_EXISTS=false
if powershell.exe -Command "Get-Service -Name '${SERVICE_NAME}' -ErrorAction SilentlyContinue" 2>/dev/null | grep -q "${SERVICE_NAME}"; then
  SERVICE_EXISTS=true
fi

if [ "$SERVICE_EXISTS" = true ]; then
  if [ "$FORCE_REINSTALL" = true ]; then
    echo "[INFO] --force: Removing existing service '${SERVICE_NAME}' ..."
    echo ""
    echo "[INFO] Stopping service ..."
    powershell.exe -Command "Start-Process powershell -ArgumentList '-Command','Stop-Service -Name ${SERVICE_NAME}' -Verb RunAs -Wait"
    echo "[INFO] Service stopped."
    echo ""
    echo "[INFO] Removing service ..."
    nssm_elevated remove "${SERVICE_NAME}" confirm
    SERVICE_EXISTS=false
  else
    echo "[INFO] Service '${SERVICE_NAME}' already exists, updating ..."
    echo ""
    echo "[INFO] Stopping service ..."
    powershell.exe -Command "Start-Process powershell -ArgumentList '-Command','Stop-Service -Name ${SERVICE_NAME}' -Verb RunAs -Wait"
    echo "[INFO] Service stopped, waiting for process to release files ..."
    sleep 3
    echo ""
  fi
else
  echo "[INFO] Service '${SERVICE_NAME}' does not exist, will install."
  echo ""
fi

echo "[INFO] Deploying to: $TARGET_DIR"
if [ -d "$TARGET_WSL" ]; then
  echo "[INFO] Removing old files ..."
  rm -rf "$TARGET_WSL"
fi
mkdir -p "$TARGET_WSL"

echo "[INFO] Copying build artifacts to target directory ..."
cp -r "$DIST_DIR"/. "$TARGET_WSL"/
echo "[INFO] Deployment complete."

if [ ! -f "${TARGET_WSL}/start.cjs" ]; then
  echo "[ERROR] start.cjs not found in build output. Ensure build.mjs completed successfully."
  exit 1
fi

mkdir -p "${TARGET_WSL}/logs"

if [ "$SERVICE_EXISTS" = false ]; then
  echo "[INFO] Installing service '${SERVICE_NAME}' ..."
  echo ""

  nssm_elevated install "${SERVICE_NAME}" "\"${NODE_EXE}\"" "\"${TARGET_DIR}\\start.cjs\""
  nssm_elevated set "${SERVICE_NAME}" AppDirectory "\"${TARGET_DIR}\""
  nssm_elevated set "${SERVICE_NAME}" AppStdout "\"${TARGET_DIR}\\logs\\service-output.log\""
  nssm_elevated set "${SERVICE_NAME}" AppStderr "\"${TARGET_DIR}\\logs\\service-error.log\""
  nssm_elevated set "${SERVICE_NAME}" Start SERVICE_AUTO_START
  nssm_elevated set "${SERVICE_NAME}" DisplayName "\"PostMem - Personal Knowledge Base\""
fi

echo "[INFO] Starting service ..."
powershell.exe -Command "Start-Process powershell -ArgumentList '-Command','Start-Service -Name ${SERVICE_NAME}' -Verb RunAs -Wait"

echo ""
echo "========================================"
echo "  Install Complete!"
echo "  Service Name: ${SERVICE_NAME}"
echo "  Target Dir:   ${TARGET_DIR}"
echo "  URL:          http://localhost:${PORT}"
echo "  Log Dir:      ${TARGET_DIR}\\logs\\"
echo "========================================"
echo ""
echo "  [NOTE] All config is read from .env in the target directory."
echo "  [NOTE] To update .env: edit ${TARGET_DIR}\\.env then restart service."
echo "  [NOTE] Run migrations if needed:"
echo "         cd /d \"${TARGET_DIR}\""
echo "         npx prisma migrate deploy"
echo ""