# 飞书 CLI 完整安装脚本
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  飞书 CLI 安装向导" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 步骤1: 下载 Node.js LTS 安装程序
Write-Host "[1/5] 正在下载 Node.js LTS..." -ForegroundColor Yellow
$nodeInstaller = "$env:TEMP\nodejs-installer.msi"

# 删除旧的安装文件（如果有）
if (Test-Path $nodeInstaller) {
    Remove-Item $nodeInstaller -Force
}

try {
    # 下载 Node.js 24.x LTS (最新稳定版)
    Write-Host "正在从 nodejs.org 下载..."
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v24.14.0/node-v24.14.0-x64.msi" -OutFile $nodeInstaller -UseBasicParsing
    
    Write-Host "✅ 下载完成!" -ForegroundColor Green
} catch {
    Write-Host "❌ 下载失败，请检查网络连接" -ForegroundColor Red
    Write-Host "您也可以手动访问 https://nodejs.org/ 下载 LTS 版本" -ForegroundColor Yellow
    Read-Host "按任意键退出"
    exit 1
}

# 步骤2: 安装 Node.js
Write-Host ""
Write-Host "[2/5] 正在安装 Node.js..." -ForegroundColor Yellow
Write-Host "请在安装向导中勾选 'Add to PATH' 选项!" -ForegroundColor Red -BackgroundColor Black

try {
    Start-Process -FilePath msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart ADDLOCAL=ALL" -Wait
    Write-Host "✅ Node.js 安装完成!" -ForegroundColor Green
} catch {
    Write-Host "❌ 安装失败，请尝试手动运行安装包" -ForegroundColor Red
    Write-Host "安装包位置: $nodeInstaller"
    Start-Process $nodeInstaller
    Read-Host "按任意键退出"
    exit 1
}

# 步骤3: 刷新环境变量
Write-Host ""
Write-Host "[3/5] 正在刷新环境变量..." -ForegroundColor Yellow

# 重新加载环境变量
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# 步骤4: 验证安装
Write-Host ""
Write-Host "[4/5] 正在验证 Node.js 安装..." -ForegroundColor Yellow

try {
    $nodeVersion = & "C:\Program Files\nodejs\node.exe" --version 2>&1
    $npmVersion = & "C:\Program Files\nodejs\npm.cmd" --version 2>&1
    
    if ($nodeVersion -match "v\d+") {
        Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
        Write-Host "✅ npm: v$npmVersion" -ForegroundColor Green
    } else {
        throw "Node.js 未找到"
    }
} catch {
    Write-Host "⚠️ 需要重启终端或电脑使环境变量生效" -ForegroundColor Yellow
    Write-Host "重启后请重新运行此脚本的后续步骤" -ForegroundColor Yellow
}

# 步骤5: 安装飞书 CLI
Write-Host ""
Write-Host "[5/5] 正在安装飞书 CLI..." -ForegroundColor Yellow

try {
    & "C:\Program Files\nodejs\npm.cmd" install -g @larksuite/cli
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  ✅ 安装完成!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "重要提示:" -ForegroundColor Yellow
    Write-Host "1. 请重启终端或电脑使环境变量完全生效" -ForegroundColor Yellow
    Write-Host "2. 运行 'lark-cli config init --new' 初始化配置" -ForegroundColor Yellow
    Write-Host "3. 运行 'lark-cli auth login --domain base' 授权访问" -ForegroundColor Yellow
    Write-Host ""
    
} catch {
    Write-Host "❌ 飞书 CLI 安装失败" -ForegroundColor Red
    Write-Host "请重启终端后手动运行: npm install -g @larksuite/cli" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
