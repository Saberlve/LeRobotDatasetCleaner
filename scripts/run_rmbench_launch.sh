#!/usr/bin/env bash
set -euo pipefail

TASK_ID="${1:-}"
RUN_ID="${2:-${RMBENCH_LAUNCH_RUN_ID:-}}"
RUNTIME_DIR="${RMBENCH_LAUNCH_RUNTIME_DIR:-}"
LAUNCHER_LOG="${RMBENCH_LAUNCH_LOG_LAUNCHER:-}"
SERVER_LOG="${RMBENCH_LAUNCH_LOG_SERVER:-}"
CLIENT_LOG="${RMBENCH_LAUNCH_LOG_CLIENT:-}"

if [ -z "$TASK_ID" ] || [ -z "$RUN_ID" ] || [ -z "$RUNTIME_DIR" ]; then
  echo "usage: run_rmbench_launch.sh <task_id> <run_id>" >&2
  echo "requires RMBENCH_LAUNCH_RUNTIME_DIR" >&2
  exit 1
fi

OPENPI_ROOT="${OPENPI_CODE_ROOT:-/VLA/openpi}"
REPO_ROOT="${NEXTJS_REPO_ROOT:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
CONDA_BIN="${CONDA_BIN:-conda}"
CLIENT_SCRIPT_PATH="${RMBENCH_LAUNCH_CLIENT_SCRIPT_PATH:-$REPO_ROOT/scripts/rmbench_launch_client.py}"
CHECKPOINT_PATH="${RMBENCH_LAUNCH_CHECKPOINT_PATH:-/root/autodl-tmp/checkpoints/pi05_rmbench_memory_lora_pytorch/rmbench_mem_lora_h800/30000}"
SERVER_PORT="${RMBENCH_LAUNCH_SERVER_PORT:-9999}"
TASK_CONFIG="${RMBENCH_LAUNCH_TASK_CONFIG:-demo_clean}"
POLICY_NAME="${RMBENCH_LAUNCH_POLICY_NAME:-pi05_mem}"
POLICY_CONFIG_NAME="${RMBENCH_LAUNCH_POLICY_CONFIG_NAME:-pi05_rmbench_memory_lora_pytorch}"
PI0_STEP="${RMBENCH_LAUNCH_PI0_STEP:-30}"
SEED="${RMBENCH_LAUNCH_SEED:-42}"

mkdir -p "$RUNTIME_DIR"
LAUNCHER_LOG="${LAUNCHER_LOG:-$RUNTIME_DIR/launcher.log}"
SERVER_LOG="${SERVER_LOG:-$RUNTIME_DIR/server.log}"
CLIENT_LOG="${CLIENT_LOG:-$RUNTIME_DIR/client.log}"
: > "$LAUNCHER_LOG"
: > "$SERVER_LOG"
: > "$CLIENT_LOG"
exec >>"$LAUNCHER_LOG" 2>&1

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

kill_tree() {
  local pid="$1"
  if command -v pgrep >/dev/null 2>&1; then
    local children
    children=$(pgrep -P "$pid" 2>/dev/null) || true
    for child in $children; do
      kill_tree "$child"
    done
  fi
  kill "$pid" 2>/dev/null || true
}

cleanup() {
  if [ -n "${TASK_PID:-}" ]; then
    log "stopping task process $TASK_PID"
    kill_tree "$TASK_PID"
  fi
}
trap cleanup EXIT INT TERM

printf '[%s] using persistent policy server on port %s\n' \
  "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  "$SERVER_PORT" >>"$SERVER_LOG"
log "using persistent policy server on port ${SERVER_PORT}"
log "launching RMBench client for ${TASK_ID}"
(
  cd "$REPO_ROOT"
  PYTHONUNBUFFERED=1 \
  OPENPI_CODE_ROOT="$OPENPI_ROOT" \
  RMBENCH_LAUNCH_RUNTIME_DIR="$RUNTIME_DIR" \
  "$CONDA_BIN" run --no-capture-output -n RMBench python -u "$CLIENT_SCRIPT_PATH" \
    --task-name "$TASK_ID" \
    --task-config "$TASK_CONFIG" \
    --run-id "$RUN_ID" \
    --runtime-dir "$RUNTIME_DIR" \
    --port "$SERVER_PORT" \
    --policy-name "$POLICY_NAME" \
    --policy-config-name "$POLICY_CONFIG_NAME" \
    --checkpoint-dir "$CHECKPOINT_PATH" \
    --pi0-step "$PI0_STEP" \
    --seed "$SEED"
) >>"$CLIENT_LOG" 2>&1 &
TASK_PID=$!
log "client pid ${TASK_PID}"
wait "$TASK_PID"
