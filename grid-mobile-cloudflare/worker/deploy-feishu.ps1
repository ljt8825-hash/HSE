# ============================================================================
# deploy-feishu.ps1 —— Phase B 飞书切换一键运行本（用户侧在本地终端执行）
# ----------------------------------------------------------------------------
# 本脚本只编排「wrangler var put + wrangler deploy + 回退」，不碰任何业务代码。
# 飞书控制台侧的前置工作（本脚本不代做，须先完成）：
#   1) 飞书应用已开 bitable:app（读写）且已发布；应用已加为 base 协作者（可管理）
#   2) 按 FEISHU_SCHEMA.md §2 在 base 内建 3 张表，列名严格一致，并导入数据
#      （至少 1 个测试登录账号：手机号 + bcrypt 哈希 + employee_code + 花名册命中 + 负责区域）
#   3) App Secret 已轮换（旧 Secret 曾在对话中暴露，必须先在飞书后台重置）
#   4) 已交互执行 secret 注入：
#        wrangler secret put FS_APP_ID
#        wrangler secret put FS_APP_SECRET   （用轮换后的新值，非对话里的旧值）
#   5) wrangler.toml 已填 FS_APP_TOKEN / FS_*_TABLE_ID
#      （先只填 FS_PATROL_TEST_TABLE_ID 验证，通过后再填生产表 + 放三开关）
# ============================================================================

[CmdletBinding()]
param(
  [switch]$DryRun,     # 只打印将要执行的命令，不真正执行
  [switch]$Rollback,   # 回退到 WPS 后端（wpsAdapter 完整保留）
  [switch]$SkipDeploy  # 只切换 var，不重新 deploy（用于已部署仅切开关）
)

$ErrorActionPreference = 'Stop'
$workerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $workerDir
Write-Host "==> 工作目录: $workerDir" -ForegroundColor Cyan

# 0) 前置：wrangler 可用性
if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) {
  Write-Error "未找到 wrangler。请先：npm i -g wrangler && wrangler login"
  exit 1
}

# ---- 回退分支 ----
if ($Rollback) {
  Write-Host "==> 回退：STORAGE_BACKEND -> wps（wpsAdapter 仍完整保留）" -ForegroundColor Yellow
  # wrangler v3 无 var put 命令：改 wrangler.toml 后重新 deploy
  (Get-Content wrangler.toml -Raw) -replace 'STORAGE_BACKEND = "[^"]*"', 'STORAGE_BACKEND = "wps"' | Set-Content wrangler.toml -Encoding UTF8
  if (-not $DryRun) { wrangler deploy }
  Write-Host "回退完成。生产恢复 WPS 多维表格后端。" -ForegroundColor Green
  exit 0
}

# 0.5) 前置检查：必需 secret 是否已注入
$needSecrets = @('WORKER_SESSION_SECRET', 'FS_APP_ID', 'FS_APP_SECRET')
$have = @()
try { $have = (wrangler secret list 2>$null | ConvertFrom-Json).name } catch {}
$missing = $needSecrets | Where-Object { $_ -notin $have }
if ($missing) {
  Write-Error "缺少 secret：$($missing -join ', ')。请先执行 wrangler secret put <名称>（值交互输入，勿当命令敲）。"
  exit 2
}
Write-Host "==> secret 检查通过：$($needSecrets -join ', ')" -ForegroundColor Green

# 1) 切换后端（改 wrangler.toml；wrangler v3 无 var put 命令）
Write-Host "==> 切换 STORAGE_BACKEND -> feishu（写入 wrangler.toml）" -ForegroundColor Cyan
(Get-Content wrangler.toml -Raw) -replace 'STORAGE_BACKEND = "[^"]*"', 'STORAGE_BACKEND = "feishu"' | Set-Content wrangler.toml -Encoding UTF8

# 3) 部署
if (-not $SkipDeploy) {
  Write-Host "==> 部署 worker（重新构建并上传 index.js + storage/*）" -ForegroundColor Cyan
  if ($DryRun) { Write-Host "(dry-run) wrangler deploy" }
  else { wrangler deploy }
}

# 4) 后置验证提示
Write-Host "==> 部署完成，请手动做公网 E2E 验证：" -ForegroundColor Green
Write-Host "     登录 -> /api/mobile/patrol/meta -> submit -> records -> 清理"
Write-Host "     本地 adapter 冒烟（真实飞书凭据，创建即删零污染）："
Write-Host "       `$env:FS_APP_ID='...'; `$env:FS_APP_SECRET='...'; `$env:FS_APP_TOKEN='...'; `$env:FS_PATROL_TEST_TABLE_ID='...'"
Write-Host "       node test/cfwpsB-feishu-adapter-smoke.mjs"
Write-Host "     若异常：pwsh deploy-feishu.ps1 -Rollback"
