#!/usr/bin/env bash
set -euo pipefail

RUNTIME_DIR="${RMBENCH_MODEL_SERVER_RUNTIME_DIR:-}"
LAUNCHER_LOG="${RMBENCH_MODEL_SERVER_LOG_LAUNCHER:-}"
SERVER_LOG="${RMBENCH_MODEL_SERVER_LOG_SERVER:-}"
PORT="${RMBENCH_MODEL_SERVER_PORT:-9999}"
CHECKPOINT_PATH="${RMBENCH_MODEL_SERVER_CHECKPOINT_PATH:-/root/autodl-tmp/checkpoints/pi05_rmbench_memory_lora_pytorch/rmbench_mem_lora_h800/30000}"
PI0_STEP="${RMBENCH_MODEL_SERVER_PI0_STEP:-30}"
POLICY_NAME="${RMBENCH_MODEL_SERVER_POLICY_NAME:-pi05_mem}"
POLICY_CONFIG_NAME="${RMBENCH_MODEL_SERVER_POLICY_CONFIG_NAME:-pi05_rmbench_memory_lora_pytorch}"

if [ -z "$RUNTIME_DIR" ]; then
  echo "requires RMBENCH_MODEL_SERVER_RUNTIME_DIR" >&2
  exit 1
fi

OPENPI_ROOT="${OPENPI_CODE_ROOT:-/VLA/openpi}"
RMBENCH_ROOT="$OPENPI_ROOT/third_party/RMBench"
PYTHON_BIN="${RMBENCH_MODEL_SERVER_PYTHON_BIN:-$OPENPI_ROOT/.venv/bin/python}"

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

log "starting persistent RMBench policy server on port ${PORT}"
log "checkpoint: ${CHECKPOINT_PATH}"

cd "$RMBENCH_ROOT"
exec env PYTHONUNBUFFERED=1 OMP_NUM_THREADS=1 "$PYTHON_BIN" -u script/policy_model_server.py \
  --port "$PORT" \
  --config policy/pi05_mem/deploy_policy.yml \
  --overrides \
  --policy_name "$POLICY_NAME" \
  --policy_config_name "$POLICY_CONFIG_NAME" \
  --checkpoint_dir "$CHECKPOINT_PATH" \
  --pi0_step "$PI0_STEP" >>"$SERVER_LOG" 2>&1
