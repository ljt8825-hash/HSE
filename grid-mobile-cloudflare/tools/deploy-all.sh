#!/usr/bin/env bash
# 一次性部署 Worker + Pages，并做三项线上校验。
# 用法（在 git bash 里）：
#   export CLOUDFLARE_API_TOKEN=<你的 token>
#   bash tools/deploy-all.sh
#
# 说明：默认要求 token 已注入环境变量，不写入任何文件，避免凭据落盘。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGES_URL="https://grid-mobile-cloudflare.pages.dev"
WORKER_URL="https://grid-mobile-cloudflare-worker.ljt8825.workers.dev"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "✗ 请先 export CLOUDFLARE_API_TOKEN=<token>" >&2
  exit 2
fi

cd "$ROOT"

echo "══ 0. 上线前自检 ══"
( cd worker && python _scratch/mkdeploy.py >/dev/null )   # ⚠️ 必须在 worker/ 下跑（脚本用 CWD 相对路径）
node worker/test/_t6c-deploy-drift.mjs | tail -3
cp -f frontend/check.html _pages_deploy/check.html
node tools/predeploy-guard.mjs | tail -3

BUILD_LOCAL=$(grep -o 'hse-build" content="[^"]*"' frontend/check.html | head -1 | sed 's/.*content="//;s/"//')
echo "本地 build = $BUILD_LOCAL"

echo
echo "══ 1. 部署 Worker ══"
( cd worker && npx wrangler deploy )

echo
echo "══ 2. 部署 Pages ══"
( cd _pages_deploy && npx wrangler pages deploy . --project-name grid-mobile-cloudflare --commit-dirty=true )

echo
echo "══ 3. 线上校验 ══"
TMPHTML="$ROOT/.deploy-verify.html"
curl -sL "$PAGES_URL/check.html" -o "$TMPHTML"
BUILD_LIVE=$(grep -o 'hse-build" content="[^"]*"' "$TMPHTML" | head -1 | sed 's/.*content="//;s/"//')
CHGPWD=$(grep -c 'view-changepwd' "$TMPHTML" || true)
echo "① 线上 build        = $BUILD_LIVE   (期望 >= $BUILD_LOCAL)"
echo "② 线上改密页节点数  = $CHGPWD   (期望 > 0)"

CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WORKER_URL/api/mobile/auth/password" \
  -H 'Content-Type: application/json' -d '{}' || true)
echo "③ Worker /auth/password = HTTP $CODE   (期望 401，不是 unknown route)"

rm -f "$TMPHTML"
echo
echo "══ 完成 ══"
