#!/usr/bin/env bash
set -euo pipefail

TASK_ID="${1:-}"
RUN_ID="${2:-${SIMPLERENV_LAUNCH_RUN_ID:-}}"
RUNTIME_DIR="${SIMPLERENV_LAUNCH_RUNTIME_DIR:-}"
LAUNCHER_LOG="${SIMPLERENV_LAUNCH_LOG_LAUNCHER:-}"
SERVER_LOG="${SIMPLERENV_LAUNCH_LOG_SERVER:-}"
CLIENT_LOG="${SIMPLERENV_LAUNCH_LOG_CLIENT:-}"

if [ -z "$TASK_ID" ] || [ -z "$RUN_ID" ] || [ -z "$RUNTIME_DIR" ]; then
  echo "usage: run_simpler_launch.sh <task_id> <run_id>" >&2
  echo "requires SIMPLERENV_LAUNCH_RUNTIME_DIR" >&2
  exit 1
fi

PYTHON="/root/miniconda3/envs/openpi/bin/python"
OPENPI_ROOT="${OPENPI_CODE_ROOT:-/VLA/openpi}"
CHECKPOINT_PATH="${SIMPLERENV_LAUNCH_CHECKPOINT_PATH:-/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000}"
SERVER_PORT="${SIMPLERENV_LAUNCH_SERVER_PORT:-8000}"
RENDER_SCALE="${SIMPLERENV_LAUNCH_RENDER_SCALE:-2.0}"
POLICY_CONFIG="pi05_simpler"
SEED=42
SERVER_GPU=0

mkdir -p "$RUNTIME_DIR"
LAUNCHER_LOG="${LAUNCHER_LOG:-$RUNTIME_DIR/launcher.log}"
SERVER_LOG="${SERVER_LOG:-$RUNTIME_DIR/server.log}"
CLIENT_LOG="${CLIENT_LOG:-$RUNTIME_DIR/client.log}"
: > "$LAUNCHER_LOG"
: > "$SERVER_LOG"
: > "$CLIENT_LOG"
exec >>"$LAUNCHER_LOG" 2>&1

log() {
  printf '[%s] %s
' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

export OPENPI_CODE_ROOT="$OPENPI_ROOT"
export OPENPI_MODELS_ROOT="$OPENPI_ROOT"
export OPENPI_DATASETS_ROOT="$OPENPI_ROOT"
export OPENPI_CHECKPOINTS_ROOT="$OPENPI_ROOT"
export DISPLAY=""
export VK_ICD_FILENAMES="/etc/vulkan/icd.d/nvidia_icd.json"

case "$TASK_ID" in
  bridge_carrot)
    ENV_NAME="PutCarrotOnPlateInScene-v0"
    SCENE_NAME="bridge_table_1_v1"
    ROBOT="widowx"
    RGB_OVERLAY="ManiSkill2_real2sim/data/real_inpainting/bridge_real_eval_1.png"
    ROBOT_INIT_X="0.147"
    ROBOT_INIT_Y="0.028"
    OBJ_EPISODE_RANGE="0 24"
    ;;
  bridge_stack)
    ENV_NAME="StackGreenCubeOnYellowCubeBakedTexInScene-v0"
    SCENE_NAME="bridge_table_1_v1"
    ROBOT="widowx"
    RGB_OVERLAY="ManiSkill2_real2sim/data/real_inpainting/bridge_real_eval_1.png"
    ROBOT_INIT_X="0.147"
    ROBOT_INIT_Y="0.028"
    OBJ_EPISODE_RANGE="0 24"
    ;;
  bridge_spoon)
    ENV_NAME="PutSpoonOnTableClothInScene-v0"
    SCENE_NAME="bridge_table_1_v1"
    ROBOT="widowx"
    RGB_OVERLAY="ManiSkill2_real2sim/data/real_inpainting/bridge_real_eval_1.png"
    ROBOT_INIT_X="0.147"
    ROBOT_INIT_Y="0.028"
    OBJ_EPISODE_RANGE="0 24"
    ;;
  eggplant)
    ENV_NAME="PutEggplantInBasketScene-v0"
    SCENE_NAME="bridge_table_1_v2"
    ROBOT="widowx_sink_camera_setup"
    RGB_OVERLAY="ManiSkill2_real2sim/data/real_inpainting/bridge_sink.png"
    ROBOT_INIT_X="0.127"
    ROBOT_INIT_Y="0.06"
    OBJ_EPISODE_RANGE="0 24"
    ;;
  *)
    log "unsupported task: $TASK_ID"
    exit 1
    ;;
esac

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
  if [ -n "${SERVER_PID:-}" ]; then
    log "stopping policy server $SERVER_PID"
    kill_tree "$SERVER_PID"
  fi
}
trap cleanup EXIT INT TERM

SEED_CLI=()
if [ -n "$SEED" ]; then
  SEED_CLI+=("--seed=$SEED")
fi

log "starting policy server on port ${SERVER_PORT}"
(
  cd "$OPENPI_ROOT"
  CUDA_VISIBLE_DEVICES=${SERVER_GPU}     "$PYTHON" scripts/serve_policy.py "${SEED_CLI[@]}" --port=${SERVER_PORT} policy:checkpoint       --policy.config=${POLICY_CONFIG}       --policy.dir="$CHECKPOINT_PATH"
) >>"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
log "policy server pid ${SERVER_PID}"

SERVER_READY_MARKER="INFO:websockets.server:server listening on"
for i in $(seq 1 60); do
  sleep 1
  if grep -Fq "$SERVER_READY_MARKER" "$SERVER_LOG"; then
    log "policy server is ready"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    log "policy server exited before becoming ready"
    exit 1
  fi
  if [ "$i" -eq 60 ]; then
    log "policy server did not start in time"
    exit 1
  fi
done

log "launching SimplerEnv client for ${TASK_ID}"
(
  cd "$OPENPI_ROOT/third_party/SimplerEnv"
  CUDA_VISIBLE_DEVICES=${SERVER_GPU}     OPENPI_POLICY_HOST=localhost     OPENPI_POLICY_PORT=${SERVER_PORT}     PYTHONPATH="$OPENPI_ROOT/third_party/SimplerEnv:$OPENPI_ROOT/third_party/SimplerEnv/ManiSkill2_real2sim:${PYTHONPATH:-}"     "$PYTHON" simpler_env/main_inference.py       --policy-model pi05       --ckpt-path "$CHECKPOINT_PATH"       --logging-dir "$RUNTIME_DIR"       --robot "$ROBOT"       --policy-setup widowx_bridge       --control-freq 5 --sim-freq 500 --max-episode-steps 540       --env-name "$ENV_NAME" --scene-name "$SCENE_NAME"       --rgb-overlay-path "$RGB_OVERLAY"       --robot-init-x-range "$ROBOT_INIT_X" "$ROBOT_INIT_X" 1       --robot-init-y-range "$ROBOT_INIT_Y" "$ROBOT_INIT_Y" 1       --obj-variation-mode episode --obj-episode-range ${OBJ_EPISODE_RANGE}       --robot-init-rot-quat-center 0 0 0 1       --robot-init-rot-rpy-range 0 0 1 0 0 1 0 0 1       --render-scale "$RENDER_SCALE"       --seed "$SEED"
) >>"$CLIENT_LOG" 2>&1 &
TASK_PID=$!
log "client pid ${TASK_PID}"
wait "$TASK_PID"
