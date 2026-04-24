#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

DATASET_ALIAS="${DATASET_ALIAS:-local/pickXtimes_v21_filtered}"
DATASET_ROOT="${DATASET_ROOT:-/mnt/d/pickXtimes_v21_filtered}"
PORT_WAS_SET=0
if [ -n "${PORT+x}" ]; then
  PORT_WAS_SET=1
fi
PORT=3001

port_in_use() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -i ":${port}" >/dev/null 2>&1
    return $?
  fi

  if command -v fuser >/dev/null 2>&1; then
    fuser "${port}/tcp" >/dev/null 2>&1
    return $?
  fi

  return 1
}

if port_in_use "$PORT"; then
  if [ "$PORT_WAS_SET" -eq 1 ]; then
    echo "PORT ${PORT} is already in use. Set PORT to a free port and retry."
    exit 1
  fi

  NEXT_PORT="$PORT"
  while port_in_use "$NEXT_PORT"; do
    NEXT_PORT=$((NEXT_PORT + 1))
  done
  PORT="$NEXT_PORT"
fi

export LOCAL_LEROBOT_DATASETS_JSON="${LOCAL_LEROBOT_DATASETS_JSON:-{\"${DATASET_ALIAS}\":\"${DATASET_ROOT}\"}}"
export LOCAL_DATASET_BASE_URL="${LOCAL_DATASET_BASE_URL:-http://127.0.0.1:${PORT}}"
export NEXT_PUBLIC_LOCAL_DATASET_BASE_URL="${NEXT_PUBLIC_LOCAL_DATASET_BASE_URL:-${LOCAL_DATASET_BASE_URL}}"

if [ "${1:-}" = "help" ] || [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  cat <<EOF
用法：
  ./run_local_v21.sh

说明：
  这个脚本用于在本地 v2.1 数据集上启动 lerobot-dataset-visualizer。

默认配置：
  DATASET_ALIAS=${DATASET_ALIAS}
  DATASET_ROOT=${DATASET_ROOT}
  PORT=${PORT}
  LOCAL_DATASET_BASE_URL=${LOCAL_DATASET_BASE_URL}
  NEXT_PUBLIC_LOCAL_DATASET_BASE_URL=${NEXT_PUBLIC_LOCAL_DATASET_BASE_URL}

启动后可直接访问：
  http://127.0.0.1:${PORT}/${DATASET_ALIAS}/episode_0

可覆盖环境变量：
  DATASET_ALIAS
    本地数据集别名，默认：${DATASET_ALIAS}
  DATASET_ROOT
    本地数据集目录，默认：${DATASET_ROOT}
  PORT
    Next.js 启动端口，默认：${PORT}
  LOCAL_DATASET_BASE_URL
    本地数据 API 基础地址，默认：${LOCAL_DATASET_BASE_URL}
  NEXT_PUBLIC_LOCAL_DATASET_BASE_URL
    前端使用的本地数据 API 基础地址，默认：${NEXT_PUBLIC_LOCAL_DATASET_BASE_URL}

示例：
  ./run_local_v21.sh
  PORT=3001 LOCAL_DATASET_BASE_URL=http://127.0.0.1:3001 NEXT_PUBLIC_LOCAL_DATASET_BASE_URL=http://127.0.0.1:3001 ./run_local_v21.sh
EOF
  exit 0
fi

INSTALL_CMD=()
DEV_CMD=()
INSTALL_NEEDED=0
NEXT_BIN_PATH="node_modules/next/dist/bin/next"
NEXT_PKG_PATH="node_modules/next/package.json"

next_install_is_healthy() {
  [ -s "$NEXT_BIN_PATH" ] && [ -f "$NEXT_PKG_PATH" ]
}

if command -v npm >/dev/null 2>&1 && command -v npx >/dev/null 2>&1; then
  INSTALL_CMD=(npm install --no-package-lock)
  if next_install_is_healthy; then
    DEV_CMD=(node "$NEXT_BIN_PATH" dev --port "$PORT")
  else
    DEV_CMD=(npx next dev --port "$PORT")
  fi
else
  echo "npm/npx was not found in PATH"
  exit 1
fi

if [ ! -d node_modules ] || ! next_install_is_healthy; then
  INSTALL_NEEDED=1
fi

if [ "$INSTALL_NEEDED" -eq 1 ]; then
  "${INSTALL_CMD[@]}"
fi

if ! next_install_is_healthy; then
  echo "Next.js dependencies are missing or corrupted."
  echo "Expected a non-empty ${NEXT_BIN_PATH} and ${NEXT_PKG_PATH}."
  echo "Please rerun the installer with npm install --no-package-lock."
  exit 1
fi

exec "${DEV_CMD[@]}" "$@"
