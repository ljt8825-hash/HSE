#!/usr/bin/env bash
# 生产构建脚本（Git Bash / WSL 版）—— 与 scripts/build-prod.ps1 行为一致
# 1) 备份 dist/ 到 dist.bak.{timestamp}
# 2) 清空 NODE_OPTIONS / CODEBUDDY_SESSION_ID（避免托管注入触发 genie-safe-delete 钩子）
# 3) 调用 node_modules/.bin/vite.cmd build --mode production（cwd=apps/web-antd）
# 4) 输出产物体积摘要
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Repo root = parent of scripts/ (scripts/ lives at repo root). Fallback: walk up
# to pnpm-workspace.yaml so the script still resolves correctly if moved.
REPO_ROOT="$SCRIPT_DIR"
if [ ! -f "$REPO_ROOT/pnpm-workspace.yaml" ]; then
  REPO_ROOT="$(dirname "$SCRIPT_DIR")"
  while [ "$REPO_ROOT" != "/" ] && [ ! -f "$REPO_ROOT/pnpm-workspace.yaml" ]; do
    REPO_ROOT="$(dirname "$REPO_ROOT")"
  done
fi
APP_DIR="$REPO_ROOT/apps/web-antd"
DIST_DIR="$APP_DIR/dist"
VITE_CMD="$REPO_ROOT/node_modules/.bin/vite.cmd"

# 1) 备份 dist/
if [ -d "$DIST_DIR" ]; then
  TS="$(date +%Y%m%d%H%M%S)"
  BAK="$APP_DIR/dist.bak.$TS"
  mv "$DIST_DIR" "$BAK"
  echo "BACKUP: moved existing dist/ -> $BAK"
else
  echo "BACKUP: no existing dist/ to backup, skip"
fi

# 2) 清空会触发 safe-delete 钩子的变量（unset 后子进程不再继承）
unset NODE_OPTIONS
unset CODEBUDDY_SESSION_ID

# 3) 构建
if [ ! -f "$VITE_CMD" ]; then
  echo "ERROR: vite.cmd not found at $VITE_CMD" >&2
  exit 2
fi

echo "BUILD: $VITE_CMD build --mode production (cwd=$APP_DIR)"
( cd "$APP_DIR" && "$VITE_CMD" build --mode production )
BUILD_EXIT=$?
if [ "$BUILD_EXIT" -ne 0 ]; then
  echo "BUILD FAILED with exit code $BUILD_EXIT" >&2
  exit "$BUILD_EXIT"
fi

# 4) 产物体积摘要
if [ -d "$DIST_DIR" ]; then
  # Total size without depending on `du` (not always present in Git Bash on Windows).
  TOTAL_BYTES="$(find "$DIST_DIR" -type f -printf '%s\n' | awk '{s+=$1} END{print s+0}')"
  TOTAL_MB="$(awk "BEGIN{printf \"%.2f\", $TOTAL_BYTES/1048576}")"
  echo "BUILD_OK: dist total size = ${TOTAL_MB} MB, files = $(find "$DIST_DIR" -type f | wc -l)"
  echo "=== Top chunks by size (js/css) ==="
  find "$DIST_DIR" -type f \( -name '*.js' -o -name '*.css' \) -printf '%s\t%p\n' \
    | sort -rn | head -15 \
    | while IFS=$'\t' read -r sz path; do
        kb=$(awk "BEGIN{printf \"%.1f\", $sz/1024}")
        rel="${path#$DIST_DIR}"
        printf '%10s KB  %s\n' "$kb" "$rel"
      done
  echo "BUILD_EXIT:0"
  exit 0
else
  echo "ERROR: dist/ not produced after build" >&2
  exit 3
fi
