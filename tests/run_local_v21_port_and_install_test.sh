#!/bin/bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_SCRIPT="$REPO_ROOT/run_local_v21.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PROJECT_DIR="$TMP_DIR/project"
BIN_DIR="$TMP_DIR/bin"
LOG_FILE="$TMP_DIR/commands.log"

mkdir -p "$PROJECT_DIR" "$BIN_DIR" "$PROJECT_DIR/node_modules/next/dist/bin"
cp "$SOURCE_SCRIPT" "$PROJECT_DIR/run_local_v21.sh"
chmod +x "$PROJECT_DIR/run_local_v21.sh"
touch "$PROJECT_DIR/node_modules/next/dist/bin/next"

cat >"$BIN_DIR/npm" <<'EOF'
#!/bin/bash
printf 'npm %s\n' "$*" >>"$TEST_LOG_FILE"
exit 0
EOF

cat >"$BIN_DIR/npx" <<'EOF'
#!/bin/bash
printf 'LOCAL_DATASET_BASE_URL=%s\n' "$LOCAL_DATASET_BASE_URL" >>"$TEST_LOG_FILE"
printf 'npx %s\n' "$*" >>"$TEST_LOG_FILE"
exit 0
EOF

cat >"$BIN_DIR/node" <<'EOF'
#!/bin/bash
printf 'LOCAL_DATASET_BASE_URL=%s\n' "$LOCAL_DATASET_BASE_URL" >>"$TEST_LOG_FILE"
printf 'node %s\n' "$*" >>"$TEST_LOG_FILE"
exit 0
EOF

cat >"$BIN_DIR/lsof" <<'EOF'
#!/bin/bash
if [ "$#" -eq 2 ] && [ "$1" = "-i" ] && [ "$2" = ":3000" ]; then
  echo "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME"
  echo "node 999 root 20u IPv4 0 0t0 TCP *:3000 (LISTEN)"
  exit 0
fi
exit 1
EOF

chmod +x "$BIN_DIR/npm" "$BIN_DIR/npx" "$BIN_DIR/node" "$BIN_DIR/lsof"

(
  cd "$PROJECT_DIR"
  PATH="$BIN_DIR:/usr/bin:/bin" TEST_LOG_FILE="$LOG_FILE" ./run_local_v21.sh
)

grep -Fx 'LOCAL_DATASET_BASE_URL=http://127.0.0.1:3001' "$LOG_FILE"
grep -Fx 'node node_modules/next/dist/bin/next dev --port 3001' "$LOG_FILE"

echo "run_local_v21 port/install test passed"
