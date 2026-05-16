#!/usr/bin/env bash
set -euo pipefail

RUNTIME_DIR="${SIMPLER_MODEL_SERVER_RUNTIME_DIR:-}"
LAUNCHER_LOG="${SIMPLER_MODEL_SERVER_LOG_LAUNCHER:-}"
SERVER_LOG="${SIMPLER_MODEL_SERVER_LOG_SERVER:-}"
PORT="${SIMPLER_MODEL_SERVER_PORT:-8000}"
CHECKPOINT_PATH="${SIMPLER_MODEL_SERVER_CHECKPOINT_PATH:-/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000}"

if [ -z "$RUNTIME_DIR" ]; then
  echo "requires SIMPLER_MODEL_SERVER_RUNTIME_DIR" >&2
  exit 1
fi

PYTHON="/root/miniconda3/envs/openpi/bin/python"
OPENPI_ROOT="${OPENPI_CODE_ROOT:-/VLA/openpi}"
POLICY_CONFIG="pi05_simpler"
SEED=42
SERVER_GPU=0

mkdir -p "$RUNTIME_DIR"
LAUNCHER_LOG="${LAUNCHER_LOG:-$RUNTIME_DIR/launcher.log}"
SERVER_LOG="${SERVER_LOG:-$RUNTIME_DIR/server.log}"
: > "$LAUNCHER_LOG"
: > "$SERVER_LOG"
exec >>"$LAUNCHER_LOG" 2>&1

log() {
  printf '[%s] %s
' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

export OPENPI_CODE_ROOT="$OPENPI_ROOT"
export OPENPI_MODELS_ROOT="$OPENPI_ROOT"
export OPENPI_DATASETS_ROOT="$OPENPI_ROOT"
export OPENPI_CHECKPOINTS_ROOT="$OPENPI_ROOT"

log "starting persistent Simpler policy server on port ${PORT}"
log "checkpoint: ${CHECKPOINT_PATH}"

cd "$OPENPI_ROOT"
exec env PYTHONUNBUFFERED=1 CUDA_VISIBLE_DEVICES=${SERVER_GPU} \
  "$PYTHON" scripts/serve_policy.py "--seed=${SEED}" --port=${PORT} policy:checkpoint \
  --policy.config=${POLICY_CONFIG} \
  --policy.dir="$CHECKPOINT_PATH" >>"$SERVER_LOG" 2>&1
