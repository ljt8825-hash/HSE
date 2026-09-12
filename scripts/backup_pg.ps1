#Requires -Version 5.1
<#
.SYNOPSIS
    PostgreSQL 数据库自动备份脚本
.DESCRIPTION
    每日全量备份 safety_dashboard 数据库，保留最近 7 天备份
    备份文件使用 gzip 压缩存储
.NOTES
    作者: HSE 安全管理系统
    版本: 1.0
    执行方式: PowerShell -ExecutionPolicy Bypass -File backup_pg.ps1
    定时任务: Windows 任务计划程序，每天 02:00 执行
#>

param(
    [string]$Database = "safety_dashboard",
    [string]$BackupDir = "F:\个人文件\新安全看板\backups\postgresql",
    [int]$KeepDays = 7,
    [string]$PgDumpPath = "D:\PostgreSQL\17\bin\pg_dump.exe",
    [string]$Host = "127.0.0.1",
    [int]$Port = 5432
)

# 日志函数
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    Write-Host $logEntry
    Add-Content -Path "$BackupDir\backup.log" -Value $logEntry -ErrorAction SilentlyContinue
}

# 创建备份目录
$dateDir = Get-Date -Format "yyyyMMdd"
$backupPath = Join-Path $BackupDir $dateDir
New-Item -ItemType Directory -Force -Path $backupPath | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $backupPath "${Database}_${timestamp}.sql"
$compressedFile = "$backupFile.gz"

Write-Log "开始备份数据库: $Database"

# 从环境变量或 .env 文件读取密码
$envPath = "F:\个人文件\新安全看板\server\.env"
$pgPassword = $env:PGPASSWORD
if (-not $pgPassword -and (Test-Path $envPath)) {
    $envContent = Get-Content $envPath -Raw
    if ($envContent -match 'POSTGRES_PASSWORD=(.+)') {
        $pgPassword = $matches[1].Trim()
    }
}

if (-not $pgPassword) {
    Write-Log "错误: 无法获取数据库密码，请设置 PGPASSWORD 环境变量或在 .env 中配置" "ERROR"
    exit 1
}

# 设置环境变量（pg_dump 使用）
$env:PGPASSWORD = $pgPassword

# 执行备份
$arguments = @(
    "-h", $Host,
    "-p", $Port,
    "-U", "postgres",
    "-d", $Database,
    "-F", "p",           # plain text format
    "-v",               # verbose
    "-f", $backupFile
)

try {
    $process = Start-Process -FilePath $PgDumpPath -ArgumentList $arguments -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -ne 0) {
        Write-Log "pg_dump 执行失败，退出码: $($process.ExitCode)" "ERROR"
        exit 1
    }
} catch {
    Write-Log "备份执行异常: $_" "ERROR"
    exit 1
}

# 压缩备份文件
try {
    $inputFile = [System.IO.File]::OpenRead($backupFile)
    $outputFile = [System.IO.File]::Create($compressedFile)
    $gzipStream = New-Object System.IO.Compression.GZipStream($outputFile, [System.IO.Compression.CompressionMode]::Compress)
    $inputFile.CopyTo($gzipStream)
    $gzipStream.Close()
    $inputFile.Close()
    $outputFile.Close()

    # 删除未压缩的原始文件
    Remove-Item $backupFile -Force

    $originalSize = (Get-Item $backupFile -ErrorAction SilentlyContinue).Length
    $compressedSize = (Get-Item $compressedFile).Length
    $ratio = if ($originalSize -gt 0) { [math]::Round(($compressedSize / $originalSize) * 100, 1) } else { 0 }

    Write-Log "备份完成: $compressedFile"
    Write-Log "压缩后大小: $([math]::Round($compressedSize / 1MB, 2)) MB (压缩率: $ratio%)"
} catch {
    Write-Log "压缩失败: $_" "ERROR"
    # 保留未压缩文件作为后备
}

# 清理过期备份
try {
    $cutoffDate = (Get-Date).AddDays(-$KeepDays)
    $oldBackups = Get-ChildItem -Path $BackupDir -Directory | Where-Object {
        $dirDate = $null
        [datetime]::TryParseExact($_.Name, "yyyyMMdd", $null, [System.Globalization.DateTimeStyles]::None, [ref]$dirDate)
        $dirDate -and $dirDate -lt $cutoffDate
    }

    foreach ($oldDir in $oldBackups) {
        Remove-Item -Path $oldDir.FullName -Recurse -Force
        Write-Log "清理过期备份: $($oldDir.Name)" "INFO"
    }
} catch {
    Write-Log "清理过期备份失败: $_" "WARN"
}

Write-Log "备份任务完成"

# 清理环境变量
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
