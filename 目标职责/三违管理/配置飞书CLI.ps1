# 飞书 CLI 配置脚本
# 安全提示：请在安全的终端环境中运行此脚本

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  飞书 CLI 配置向导" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 刷新环境变量
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# 从环境变量读取 App ID，避免明文入库（未设置时交互输入）
$appId = $env:FEISHU_APP_ID
if ([string]::IsNullOrWhiteSpace($appId)) { $appId = Read-Host "请输入 App ID" }

Write-Host "App ID: $appId" -ForegroundColor Yellow
Write-Host ""

# 输入 App Secret
Write-Host "请输入 App Secret:" -ForegroundColor Yellow
Write-Host "(提示: 您在飞书开放平台获取的 App Secret)" -ForegroundColor Gray
$appSecret = Read-Host -AsSecureString
$appSecretPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($appSecret))

# 写入配置文件
Write-Host ""
Write-Host "正在保存配置..." -ForegroundColor Yellow

# 获取配置目录
$configDir = "$env:USERPROFILE\.lark-cli"
if (!(Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

# 创建配置文件
$configFile = Join-Path $configDir "config.json"
$config = @{
    appId = $appId
    appSecret = $appSecretPlain
} | ConvertTo-Json

$config | Out-File -FilePath $configFile -Encoding UTF8

Write-Host "✅ 配置已保存到: $configFile" -ForegroundColor Green
Write-Host ""

# 清除内存中的敏感信息
$appSecret = $null
$appSecretPlain = $null

Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ 配置完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "下一步:" -ForegroundColor Yellow
Write-Host "1. 运行 'lark-cli auth login --domain base' 进行授权" -ForegroundColor White
Write-Host "2. 在浏览器中完成授权确认" -ForegroundColor White
Write-Host ""

Read-Host "按任意键退出"
