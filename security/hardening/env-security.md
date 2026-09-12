# 环境变量安全检查清单

| 项目信息       | 内容                                  |
|----------------|---------------------------------------|
| 系统名称       | 宁津环卫 HSE 安全管理系统 v4.1        |
| 文档编号       | HSE-SEC-HARDEN-2026-004               |
| 日期           | 2026-07-11                            |

---

## 1. 必须通过环境变量注入的密钥

以下密钥**必须**通过环境变量或密钥管理服务注入，**严禁**硬编码在源码中。

| # | 环境变量名                | 用途               | 必需 | 密钥强度要求        | 当前状态   |
|---|---------------------------|--------------------| ----|---------------------|-----------|
| 1 | `JWT_SECRET`              | JWT 签名密钥        | [x]  | >= 64 字符随机       | 存在硬编码 |
| 2 | `JWT_REFRESH_SECRET`       | JWT 刷新密钥       | [x]  | >= 64 字符随机       | 存在硬编码 |
| 3 | `DATABASE_URL`             | 数据库连接字符串    | [x]  | 含密码              | OK        |
| 4 | `DB_PASSWORD`             | 数据库密码          | [x]  | >= 16 字符           | OK        |
| 5 | `SESSION_SECRET`          | Session 加密密钥   | [x]  | >= 32 字符随机       | OK        |
| 6 | `ENCRYPTION_KEY`          | 数据加密密钥       | [x]  | >= 32 字符随机       | OK        |
| 7 | `REDIS_URL`               | Redis 连接字符串   | [x]  | 含密码（如有）      | OK        |
| 8 | `CORS_ORIGINS`            | CORS 允许源         | [x]  | -                   | OK        |
| 9 | `NODE_ENV`                | 运行环境            | [x]  | production/development | OK     |
|10 | `PORT`                    | 服务端口            | [ ]  | 3000               | OK        |
|11 | `LOG_LEVEL`               | 日志级别            | [ ]  | info               | OK        |
|12 | `PYTHON_PATH`             | Python 解释器路径   | [ ]  | -                  | OK        |

---

## 2. .gitignore 检查

确认以下文件和目录已在 `.gitignore` 中：

```
# 环境变量文件
.env
.env.local
.env.production
.env.staging
.env.development

# 密钥和证书
*.pem
*.key
*.crt
*.p12
*.jks

# 密码文件
**/passwords/
**/secrets/

# IDE 配置
.vscode/settings.json
.idea/workspace.xml

# OS 文件
.DS_Store
Thumbs.db
```

**检查命令**:
```bash
# 确认 .env 不在版本控制中
git ls-files | grep -E '\.env$' || echo "OK: .env 未被跟踪"

# 确认历史提交中无 .env
git log --all --full-history -- '*.env' || echo "OK: 历史中无 .env"
```

---

## 3. .env.example 检查

`.env.example` 应包含所有必需环境变量的占位值（不含真实密钥）。

```bash
# .env.example 示例

# 应用配置
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# JWT 密钥（必须生成强随机密钥）
JWT_SECRET=your-jwt-secret-here-min-64-chars
JWT_REFRESH_SECRET=your-refresh-secret-here-min-64-chars

# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/hse_db
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hse_db
DB_USER=hse_user
DB_PASSWORD=your-db-password-here

# Redis（如使用）
REDIS_URL=redis://localhost:6379

# Session
SESSION_SECRET=your-session-secret-here-min-32-chars

# 加密
ENCRYPTION_KEY=your-encryption-key-here-min-32-chars

# CORS
CORS_ORIGINS=http://localhost:5173

# Python（数据导入）
PYTHON_PATH=/usr/bin/python3
```

**检查清单**:

| 检查项                           | 状态   |
|----------------------------------|--------|
| .env.example 文件存在             | [ ]    |
| 包含所有必需环境变量              | [ ]    |
| 无真实密钥值                      | [ ]    |
| 每个变量有注释说明                 | [ ]    |
| 密钥变量有强度要求提示             | [ ]    |
| .env.example 已提交到版本控制     | [ ]    |

---

## 4. JWT_SECRET 强度要求

### 4.1 最小要求

| 属性           | 要求                    |
|----------------|------------------------|
| 最小长度        | 64 字符                |
| 建议长度        | 128 字符               |
| 字符集          | 全十六进制（0-9a-f）    |
| 生成方式        | crypto.randomBytes     |
| 轮换周期        | 每 90 天               |

### 4.2 生成方法

```bash
# 生成 64 字符随机密钥（推荐）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 生成 128 字符随机密钥（高安全）
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 使用 OpenSSL
openssl rand -hex 32
openssl rand -hex 64

# 使用 Python
python3 -c "import secrets; print(secrets.token_hex(32))"
python3 -c "import secrets; print(secrets.token_hex(64))"
```

### 4.3 禁止使用的密钥

以下类型的值**严禁**用作 JWT 密钥：

- 项目名称、公司名称、版本号等可预测字符串
- 日期或时间戳
- UUID（熵不够）
- 短于 32 字符的任意字符串
- 任何出现在源码中的字符串

### 4.4 当前问题密钥

```
密钥值: 'hse-safety-dashboard-secret-key-2024'
问题: 包含项目名称 'hse-safety-dashboard' + 固定后缀 'secret-key-2024'
严重程度: Critical
建议: 立即使用上述方法生成新密钥并替换
```

---

## 5. 环境变量注入方式

### 5.1 推荐方式（按安全等级排序）

| 方式                    | 安全等级 | 适用场景                   |
|-------------------------|----------|---------------------------|
| HashiCorp Vault        | 最高     | 大规模生产环境             |
| AWS Secrets Manager     | 高       | AWS 云环境                 |
| Kubernetes Secrets      | 高       | K8s 部署                   |
| Docker Secrets          | 中高     | Docker Swarm 部署          |
| .env 文件（gitignore）  | 中       | 中小规模项目（当前方式）    |

### 5.2 当前方式评估

当前项目使用 `.env` 文件 + `.gitignore` 的方式，适合当前规模。

**确保以下安全措施**:
- `.env` 文件不在版本控制中
- 服务器上 `.env` 文件权限为 `600`（仅所有者可读写）
- 生产环境通过运维工具部署 `.env`（不手动编辑）

```bash
# 设置 .env 文件权限
chmod 600 /app/.env
chown hseapp:hseapp /app/.env

# 验证权限
ls -la /app/.env
# 应输出: -rw------- 1 hseapp hseapp ... .env
```

---

## 6. 环境变量安全检查清单

| # | 检查项                          | 通过 | 备注                        |
|---|---------------------------------|------|----------------------------|
| 1 | JWT_SECRET 通过环境变量注入      | [ ]  | 不得硬编码                  |
| 2 | JWT_REFRESH_SECRET 通过环境变量   | [ ]  | 不得硬编码                  |
| 3 | DATABASE_URL 通过环境变量注入     | [ ]  |                             |
| 4 | SESSION_SECRET 通过环境变量注入   | [ ]  |                             |
| 5 | .env 在 .gitignore 中             | [ ]  |                             |
| 6 | .env.example 存在且无真实密钥     | [ ]  |                             |
| 7 | JWT_SECRET 长度 >= 64 字符        | [ ]  |                             |
| 8 | JWT_REFRESH_SECRET 长度 >= 64 字符 | [ ]  |                             |
| 9 | .env 文件权限为 600               | [ ]  | 仅所有者可读写               |
|10 | 启动时检查必需环境变量             | [ ]  | 缺失时拒绝启动               |
|11 | 历史提交中无密钥泄露              | [ ]  | 检查 git history            |
|12 | 生产环境 NODE_ENV=production      | [ ]  |                             |

---

## 7. 泄露应急处理

如果环境变量（密钥）疑似泄露：

1. **立即轮换所有密钥**
2. **使所有现有 JWT Token 失效**（清除 Redis 缓存 + 重启服务）
3. **通知所有用户重新登录**
4. **排查泄露原因**（Git 历史、日志、备份等）
5. **清理泄露的密钥记录**
6. **加强访问控制**（限制 .env 文件访问权限）

```bash
# 紧急轮换密钥（示例）
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
export JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# 写入 .env
echo "JWT_SECRET=${JWT_SECRET}" >> /app/.env
echo "JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}" >> /app/.env

# 重启服务
pm2 restart hse-backend
# 或
docker-compose restart backend
```

---

*文档日期: 2026-07-11*
