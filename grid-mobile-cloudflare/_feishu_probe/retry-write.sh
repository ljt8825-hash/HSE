#!/bin/bash
# 飞书写路径探针自动重试：等 tenant_access_token 缓存过期、新权限落进新 token
LOG=/g/hse-dashboard/grid-mobile-cloudflare/_feishu_probe/retry-write.log
URL="https://feishu-edge-probe.pages.dev/fsprobe?app_token=WX9TbTqJKa7sywsgrU4cVoKdnXb&table_id=tblYa9aQD1lhDV8s"
for i in $(seq 1 30); do
  R=$(curl -s --max-time 60 "$URL")
  echo "[$(date '+%H:%M:%S')] attempt=$i $R" >> "$LOG"
  if echo "$R" | grep -q '"roundtrip":true'; then
    echo "[$(date '+%H:%M:%S')] FULL_GREEN create+delete roundtrip PASS" >> "$LOG"
    exit 0
  fi
  sleep 300
done
echo "[$(date '+%H:%M:%S')] EXHAUSTED 30 attempts no success" >> "$LOG"
