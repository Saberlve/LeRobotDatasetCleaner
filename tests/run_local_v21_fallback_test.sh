#!/bin/bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_SCRIPT="$REPO_ROOT/run_local_v21.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PROJECT_DIR="$TMP_DIR/project"
BIN_DIR="$TMP_DIR/bin"
LOG_FILE="$TMP_DIR/commands.log"

mkdir -p "$PROJECT_DIR" "$BIN_DIR"
cp "$SOURCE_SCRIPT" "$PROJECT_DIR/run_local_v21.sh"
chmod +x "$PROJECT_DIR/run_local_v21.sh"

cat >"$BIN_DIR/npm" <<'EOF'
#!/bin/bash
printf 'npm %s\n' "$*" >>"$TEST_LOG_FILE"
exit 0
EOF

cat >"$BIN_DIR/npx" <<'EOF'
#!/bin/bash
printf 'npx %s\n' "$*" >>"$TEST_LOG_FILE"
exit 0
EOF

chmod +x "$BIN_DIR/npm" "$BIN_DIR/npx"

(
  cd "$PROJECT_DIR"
  PATH="$BIN_DIR:/usr/bin:/bin" TEST_LOG_FILE="$LOG_FILE" ./run_local_v21.sh
)

grep -Fx 'npm install --no-package-lock' "$LOG_FILE"
grep -Fx 'npx next dev --port 3000' "$LOG_FILE"

echo "run_local_v21 fallback test passed"
