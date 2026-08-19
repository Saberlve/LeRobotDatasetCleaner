#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

DATASET_ALIAS="${DATASET_ALIAS:-local/my_dataset}"
DATASET_ROOT="${DATASET_ROOT:-/absolute/path/to/your/lerobot_dataset}"
PORT_WAS_SET=0
if [ -n "${PORT+x}" ]; then
  PORT_WAS_SET=1
fi
PORT="${PORT:-3000}"

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
Usage:
  ./run_local_v21.sh

Starts lerobot-dataset-visualizer for a local LeRobot dataset (v2.0/v2.1/v3.0).

Default configuration:
  DATASET_ALIAS=${DATASET_ALIAS}
  DATASET_ROOT=${DATASET_ROOT}
  PORT=${PORT}
  LOCAL_DATASET_BASE_URL=${LOCAL_DATASET_BASE_URL}
  NEXT_PUBLIC_LOCAL_DATASET_BASE_URL=${NEXT_PUBLIC_LOCAL_DATASET_BASE_URL}

Once started, open:
  http://127.0.0.1:${PORT}/${DATASET_ALIAS}/episode_0

Overridable environment variables:
  DATASET_ALIAS
    Local dataset alias, default: ${DATASET_ALIAS}
  DATASET_ROOT
    Local dataset directory, default: ${DATASET_ROOT}
  PORT
    Next.js dev server port, default: ${PORT}
  LOCAL_DATASET_BASE_URL
    Local dataset API base URL, default: ${LOCAL_DATASET_BASE_URL}
  NEXT_PUBLIC_LOCAL_DATASET_BASE_URL
    Local dataset API base URL used by the frontend, default: ${NEXT_PUBLIC_LOCAL_DATASET_BASE_URL}

Examples:
  ./run_local_v21.sh
  DATASET_ROOT=/data/my_dataset DATASET_ALIAS=local/my_dataset PORT=3001 ./run_local_v21.sh
EOF
  exit 0
fi

# Prefer bun (this repo's package manager), fall back to npm.
BUN_BIN="${BUN_BIN:-}"
if [ -z "$BUN_BIN" ]; then
  if command -v bun >/dev/null 2>&1; then
    BUN_BIN="bun"
  elif [ -x "$HOME/.bun/bin/bun" ]; then
    BUN_BIN="$HOME/.bun/bin/bun"
  fi
fi

if [ -n "$BUN_BIN" ]; then
  if [ ! -d node_modules ]; then
    "$BUN_BIN" install
  fi
  exec "$BUN_BIN" dev --port "$PORT" "$@"
elif command -v npm >/dev/null 2>&1; then
  if [ ! -d node_modules ]; then
    npm install --no-package-lock
  fi
  exec node node_modules/next/dist/bin/next dev --port "$PORT" "$@"
else
  echo "Neither bun nor npm was found in PATH"
  exit 1
fi
