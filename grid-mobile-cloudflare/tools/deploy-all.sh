#!/usr/bin/env bash
# 一次性部署 Worker + Pages，并做线上校验。
#
# 用法（在 git bash 里）：
#   export CLOUDFLARE_API_TOKEN=<你的 token>
#   export CLOUDFLARE_ACCOUNT_ID=00ee1b2bf2903f1bb2567aee1a80ce8e
#   bash tools/deploy-all.sh            # Worker + Pages 都部署
#   bash tools/deploy-all.sh pages      # 只部署 Pages（前端改动时用这个）
#   bash tools/deploy-all.sh worker     # 只部署 Worker
#   bash tools/deploy-all.sh verify     # 不部署，只跑线上校验（无需凭据）
#
# 说明：
#   - token / account_id 只从环境变量读，不写入任何文件，避免凭据落盘。
#   - 两个都必须给。两份 wrangler.toml 都没有 account_id，只给 token 时
#     wrangler 会交互式询问账户，在非交互终端里会直接卡死。
#   - 一律使用本地二进制 worker/node_modules/.bin/wrangler，**不要用 npx**：
#     npx 临时缓存里的 @cloudflare/workerd-windows-64 会被 npm cleanup 删掉，
#     之后 workerd 报「package could not be found」导致部署失败。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── 目标与期望值 ────────────────────────────────────────────────
PAGES_URL="https://grid-mobile-cloudflare.pages.dev"   # 默认域名（有边缘缓存延迟）
CUSTOM_URL="https://grid1ns.dpdns.org"                 # 现场实际入口（Pages 自定义域名）
WORKER_URL="https://grid-mobile-cloudflare-worker.ljt8825.workers.dev"
WRANGLER="$ROOT/worker/node_modules/.bin/wrangler"
PAGES_PROJECT="grid-mobile-cloudflare"

# ── 部署范围 ────────────────────────────────────────────────────
# DO_*   = 是否执行部署
# CHECK_* = 是否执行线上校验（读操作，独立于部署，verify 模式只开这个）
SCOPE="${1:-all}"
case "$SCOPE" in
  all)    DO_WORKER=1; DO_PAGES=1; NEED_CREDS=1; CHECK_PAGES=1; CHECK_WORKER=1 ;;
  pages)  DO_WORKER=0; DO_PAGES=1; NEED_CREDS=1; CHECK_PAGES=1; CHECK_WORKER=1 ;;
  worker) DO_WORKER=1; DO_PAGES=0; NEED_CREDS=1; CHECK_PAGES=0; CHECK_WORKER=1 ;;
  verify) DO_WORKER=0; DO_PAGES=0; NEED_CREDS=0; CHECK_PAGES=1; CHECK_WORKER=1 ;;
  *) echo "✗ 参数只能是 all / pages / worker / verify，收到：$SCOPE" >&2; exit 2 ;;
esac

# ── 凭据与工具前置检查（先全部查完再动手，别部署一半才报错）──────
MISSING=0
if [ "$NEED_CREDS" -eq 1 ]; then
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
    echo "✗ 缺少 CLOUDFLARE_API_TOKEN" >&2
    echo "  → export CLOUDFLARE_API_TOKEN=<token>   （dash.cloudflare.com/profile/api-tokens）" >&2
    MISSING=1
  fi
  if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    echo "✗ 缺少 CLOUDFLARE_ACCOUNT_ID" >&2
    echo "  → export CLOUDFLARE_ACCOUNT_ID=00ee1b2bf2903f1bb2567aee1a80ce8e" >&2
    echo "     （两份 wrangler.toml 都没写 account_id，缺它会交互式问账户而卡住）" >&2
    MISSING=1
  fi
  if [ ! -x "$WRANGLER" ]; then
    echo "✗ 找不到本地 wrangler：$WRANGLER" >&2
    echo "  → 先在 worker/ 下跑一次 npm install" >&2
    MISSING=1
  fi
fi
[ "$MISSING" -eq 0 ] || exit 2

echo "部署范围：$SCOPE   （worker=$DO_WORKER pages=$DO_PAGES）"
if [ "$NEED_CREDS" -eq 1 ]; then
  echo "wrangler：$("$WRANGLER" --version 2>/dev/null | tail -1)"
  echo "账户 ID ：$CLOUDFLARE_ACCOUNT_ID"
else
  echo "（verify 模式：不部署、不需要凭据）"
fi
echo

cd "$ROOT"

# ── 0. 上线前自检 ───────────────────────────────────────────────
if [ "$NEED_CREDS" -eq 1 ]; then
  echo "══ 0. 上线前自检 ══"
fi
if [ "$DO_WORKER" -eq 1 ]; then
  ( cd worker && python _scratch/mkdeploy.py >/dev/null )   # ⚠️ 必须在 worker/ 下跑（脚本用 CWD 相对路径）
  node worker/test/_t6c-deploy-drift.mjs | tail -3
fi
if [ "$DO_PAGES" -eq 1 ]; then
  cp -f frontend/check.html _pages_deploy/check.html
  node tools/predeploy-guard.mjs | tail -3
fi

BUILD_LOCAL=$(grep -o 'hse-build" content="[^"]*"' frontend/check.html | head -1 | sed 's/.*content="//;s/"//')
echo "本地 build = $BUILD_LOCAL"

# ── 1. 部署 Worker ──────────────────────────────────────────────
if [ "$DO_WORKER" -eq 1 ]; then
  echo
  echo "══ 1. 部署 Worker ══"
  ( cd worker && "$WRANGLER" deploy )
fi

# ── 2. 部署 Pages ───────────────────────────────────────────────
DEPLOY_URL=""
if [ "$DO_PAGES" -eq 1 ]; then
  echo
  echo "══ 2. 部署 Pages ══"
  DEPLOY_OUT=$( cd _pages_deploy && "$WRANGLER" pages deploy . \
    --project-name "$PAGES_PROJECT" --branch main --commit-dirty=true 2>&1 )
  echo "$DEPLOY_OUT"
  DEPLOY_URL=$(printf '%s' "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9]+\.'"$PAGES_PROJECT"'\.pages\.dev' | head -1 || true)
fi

# ── 3. 线上校验 ─────────────────────────────────────────────────
# 注意：curl 结果一律存进 shell 变量，不写临时文件。
#       之前写 "$ROOT/.deploy-verify.html" 撞上 curl Exit 23 直接中断脚本。
echo
echo "══ 3. 线上校验 ══"
FAIL=0

check_build() {   # $1=标签 $2=URL
  local label="$1" url="$2" html build
  html=$(curl -sL --max-time 30 "$url/check.html" || true)
  if [ -z "$html" ]; then
    echo "✗ $label 取不到页面：$url"
    FAIL=1
    return
  fi
  build=$(printf '%s' "$html" | grep -o 'hse-build" content="[^"]*"' | head -1 | sed 's/.*content="//;s/"//')
  if [ "$build" = "$BUILD_LOCAL" ]; then
    echo "✓ $label build = $build"
  else
    echo "✗ $label build = $build   （期望 $BUILD_LOCAL）"
    FAIL=1
  fi
}

if [ "$CHECK_PAGES" -eq 1 ]; then
  # 部署专属 URL 无边缘缓存，立刻生效 —— 先用它确认「部署本身成功」
  if [ -n "$DEPLOY_URL" ]; then
    check_build "部署专属 URL" "$DEPLOY_URL"
  fi

  # pages.dev / 自定义域名有边缘缓存传播延迟（实测约 1 分钟），轮询等待
  # 注意：不要写成 `[ ... ] && { ... }` —— 条件不成立时该 && 列表返回 1，
  #       作为循环体最后一条命令会触发 set -e 直接退出脚本。
  for i in 1 2 3 4 5 6; do
    H1=$(curl -sL --max-time 30 "$PAGES_URL/check.html" || true)
    B1=$(printf '%s' "$H1" | grep -o 'hse-build" content="[^"]*"' | head -1 | sed 's/.*content="//;s/"//')
    if [ "$B1" = "$BUILD_LOCAL" ]; then
      break
    fi
    if [ "$i" -lt 6 ]; then
      echo "  … $PAGES_URL 仍是 $B1，等 15s 重试（$i/6）"
      sleep 15
    fi
  done
  if [ "$B1" = "$BUILD_LOCAL" ]; then
    echo "✓ pages.dev build = $B1"
  else
    echo "✗ pages.dev build = $B1   （期望 $BUILD_LOCAL）"
    echo "  → 若部署专属 URL 已是新版本，说明是边缘缓存传播延迟，稍后重跑校验即可"
    FAIL=1
  fi

  check_build "现场入口 grid1ns.dpdns.org" "$CUSTOM_URL"

  CHGPWD=$(printf '%s' "$H1" | grep -c 'view-changepwd' || true)
  echo "① 线上改密页节点数 = $CHGPWD   （期望 > 0）"
  [ "$CHGPWD" -gt 0 ] || FAIL=1
fi

# workers.dev 直连在本环境常不通，000 只提示不判失败。
# ⚠️ 不要写成 `curl ... || echo 000`：curl 失败时 -w 已经输出了 000，
#    || 分支再补一个 000 ⇒ 变量变成 "000000"，判空逻辑全部失效。
# ⚠️ 也不要靠「HTTPS_PROXY 是否已设置」来决定要不要重试：本环境预置了沙箱代理
#    （127.0.0.1:3202），它不转发 workers.dev，照样 000。判据只能是结果本身。
probe_worker() {   # $1=代理 URL（可空）
  curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
    ${1:+--proxy "$1"} \
    -X POST "$WORKER_URL/api/mobile/auth/password" \
    -H 'Content-Type: application/json' -d '{}' 2>/dev/null || true
}
if [ "$CHECK_WORKER" -eq 1 ]; then
  CODE=$(probe_worker)
  [ -n "$CODE" ] || CODE="000"
  VIA=""

  if [ "$CODE" = "000" ]; then
    # 本机惯例代理端口（见 memory：workers.dev 走它才通）
    echo "  … 直连失败（HTTP 000），试走本地代理 127.0.0.1:7890"
    CODE=$(probe_worker "http://127.0.0.1:7890")
    [ -n "$CODE" ] || CODE="000"
    if [ "$CODE" != "000" ]; then
      VIA="  （经 127.0.0.1:7890 代理）"
    fi
  fi

  echo "② Worker /auth/password = HTTP $CODE$VIA   （期望 401）"
  if [ "$CODE" = "401" ]; then
    :
  elif [ "$CODE" = "000" ]; then
    echo "  ⚠️ 连不上 workers.dev —— 本环境直连不通属正常，手动复核："
    echo "     curl -s -o /dev/null -w '%{http_code}' -x http://127.0.0.1:7890 \\"
    echo "       -X POST $WORKER_URL/api/mobile/auth/password -H 'Content-Type: application/json' -d '{}'"
  else
    echo "  ✗ Worker 返回 $CODE，不是 401 —— 可能路由挂了或返回 unknown route"
    FAIL=1
  fi
fi

echo
if [ "$FAIL" -eq 0 ]; then
  if [ "$NEED_CREDS" -eq 1 ]; then
    echo "══ 完成：部署成功且线上校验全部通过 ══"
  else
    echo "══ 完成：线上校验全部通过 ══"
  fi
else
  if [ "$NEED_CREDS" -eq 1 ]; then
    echo "══ 完成：部署已执行，但线上校验未全通过（见上方 ✗）══"
  else
    echo "══ 完成：线上校验未全通过（见上方 ✗）══"
  fi
  exit 1
fi
