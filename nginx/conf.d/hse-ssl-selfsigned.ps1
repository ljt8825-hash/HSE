# ============================================================
# 生成自签名 SSL 证书（仅用于开发/测试环境）
# 生产环境请使用 Let's Encrypt 或云厂商的正式证书
# ============================================================
# 使用方法:
#   以管理员身份运行 PowerShell
#   .\hse-ssl-selfsigned.ps1
# ============================================================

$certDir = "$PSScriptRoot\ssl"

# 创建证书目录
if (-not (Test-Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir -Force | Out-Null
    Write-Host "[OK] 创建证书目录: $certDir"
}

$certName = "hse-selfsigned"
$certPath = "$certDir\$certName"
$days = 3650  # 10 年有效期（自签名证书仅开发测试使用）

# 使用 OpenSSL 生成自签名证书
# 如果没有 OpenSSL，可以使用以下命令安装:
#   winget install OpenSSL.Light
# 或使用 PowerShell 的 SelfSignedCertificate 模块（仅 Windows 8+）:

try {
    # 方法1: 使用 OpenSSL（推荐）
    openssl req -x509 -nodes -days $days -newkey rsa:2048 `
        -keyout "$certPath.key" `
        -out "$certPath.crt" `
        -subj "/C=CN/ST=Shandong/L=Dezhou/O=HSE/OU=IT/CN=localhost"

    Write-Host "[OK] 证书已生成:"
    Write-Host "    证书文件: $certPath.crt"
    Write-Host "    私钥文件: $certPath.key"
    Write-Host ""
    Write-Host "Nginx 配置引用:"
    Write-Host "    ssl_certificate     $certPath.crt;"
    Write-Host "    ssl_certificate_key $certPath.key;"
}
catch {
    Write-Host "[WARN] OpenSSL 未安装，尝试使用 PowerShell 自签名证书..."

    # 方法2: 使用 PowerShell 的 PKI 模块
    $cert = New-SelfSignedCertificate `
        -Subject "CN=localhost, O=HSE, OU=IT" `
        -DnsName "localhost" `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -NotAfter (Get-Date).AddDays($days) `
        -CertStoreLocation "Cert:\CurrentUser\My"

    # 导出证书和私钥
    $pwd = ConvertTo-SecureString -String "hse-dev-only" -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath "$certPath.pfx" -Password $pwd | Out-Null

    Write-Host "[OK] 自签名证书已生成:"
    Write-Host "    PFX 文件: $certPath.pfx"
    Write-Host "    密码: hse-dev-only"
    Write-Host ""
    Write-Host "    Nginx 需要 PEM 格式，请安装 OpenSSL 后转换:"
    Write-Host "    openssl pkcs12 -in $certPath.pfx -nocerts -out $certPath.key"
    Write-Host "    openssl pkcs12 -in $certPath.pfx -clcerts -nokeys -out $certPath.crt"
}