# 宁津环卫 HSE 安全管理系统 - 部署指南

> 版本: v4.1  
> 更新日期: 2026-07-10  
> 适用环境: Ubuntu 22.04 / CentOS 8+ / Debian 12

---

## 目录

1. [前置条件](#1-前置条件)
2. [快速部署（5 分钟）](#2-快速部署5-分钟)
3. [详细部署步骤](#3-详细部署步骤)
4. [运维管理](#4-运维管理)
5. [常见问题排查](#5-常见问题排查)
6. [性能调优建议](#6-性能调优建议)
7. [安全检查清单](#7-安全检查清单)
8. [验证命令](#8-验证命令)

---

## 1. 前置条件

### 1.1 服务器要求

| 项目       | 最低要求     | 推荐配置       |
|------------|-------------|---------------|
| CPU        | >= 2 核      | >= 4 核        |
| 内存       | >= 4GB       | >= 8GB         |
| 磁盘       | >= 50GB SSD  | >= 100GB SSD   |
| 网络       | 公网 IP      | 公网 IP + 域名 |
| 操作系统   | Ubuntu 22.04 | Ubuntu 22.04 LTS |

> **说明**: 数据库、后端、前端三个服务总计需要约 2GB 内存运行，预留 2GB 给操作系统。推荐 8GB 以获得更好的性能表现。

### 1.2 软件依赖

| 软件              | 最低版本  | 用途                           |
|-------------------|----------|-------------------------------|
| Docker            | >= 24.0  | 容器运行环境（必需）              |
| Docker Compose    | >= 2.20  | 服务编排（必需）                 |
| Node.js           | >= 22    | 前端构建（仅构建时需要）           |
| pnpm              | >= 10    | 包管理器（仅构建时需要）           |
| curl              | >= 7.68  | 健康检查和 API 测试              |
| git               | >= 2.30  | 克隆代码仓库                    |

> **运行时不需要 Node.js**: Docker 镜像内已包含运行所需的所有依赖，服务器上只需安装 Docker 和 Docker Compose 即可运行。Node.js 和 pnpm 仅在本地构建前端时需要。

---

## 2. 快速部署（5 分钟）

> 适用于已有 Docker 环境的服务器，快速将系统部署上线。

### 2.1 克隆项目

```bash
git clone <仓库地址> /opt/hse-safety
cd /opt/hse-safety
```

### 2.2 配置环境变量

```bash
# 从模板复制环境变量文件
cp deploy/.env.production.template .env.production

# 编辑环境变量（务必修改所有标记为 [必改] 的配置项）
nano .env.production
```

**最小化必改配置项**:

```bash
# 1. 数据库密码（必须修改，至少 16 位强密码）
DB_PASSWORD=你的强密码_至少16位
POSTGRES_PASSWORD=你的强密码_至少16位

# 2. JWT 密钥（必须修改，32 位以上随机字符串）
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

# 3. CORS 允许的域名（修改为实际前端域名）
CORS_ORIGINS=https://your-domain.com
```

### 2.3 一键部署

```bash
# 赋予脚本执行权限
chmod +x deploy/deploy.sh

# 执行一键部署
./deploy/deploy.sh
```

部署脚本将自动完成以下步骤:
1. 检查 Docker 和 Docker Compose 环境
2. 检查环境变量配置
3. 构建 Docker 镜像（首次约 5-10 分钟）
4. 启动所有服务
5. 等待健康检查通过
6. 显示部署结果

部署成功后，访问:
- **前端页面**: `http://服务器IP`
- **API 接口**: `http://服务器IP/api/health`

---

## 3. 详细部署步骤

### 3.1 环境准备

#### Docker 安装（Ubuntu 22.04）

```bash
# 更新软件源
sudo apt update

# 安装依赖
sudo apt install -y ca-certificates curl gnupg lsb-release

# 添加 Docker 官方 GPG 密钥
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# 添加 Docker 软件源
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_code -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list

# 安装 Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 将当前用户加入 docker 组（免 sudo）
sudo usermod -aG docker $USER

# 验证安装
docker --version        # 期望: Docker version 24.x.x
docker compose version  # 期望: Docker Compose version v2.x.x
```

#### Docker 安装（CentOS 8+）

```bash
# 安装依赖
sudo dnf install -y dnf-utils device-mapper-persistent-data lvm2

# 添加 Docker 仓库
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# 安装 Docker
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 启动并设为开机自启
sudo systemctl enable --now docker

# 将当前用户加入 docker 组
sudo usermod -aG docker $USER

# 验证安装
docker --version
docker compose version
```

#### 可选：Node.js + pnpm 安装（本地构建用）

```bash
# 通过 NodeSource 安装 Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 pnpm
npm install -g pnpm@latest

# 验证
node --version   # v22.x.x
pnpm --version   # 10.x.x
```

### 3.2 环境变量配置

#### 从模板创建 .env.production

```bash
cp deploy/.env.production.template .env.production
```

#### 必需变量说明

| 变量名              | 说明                      | 示例值                              | 安全要求            |
|--------------------|--------------------------|-----------------------------------|-------------------|
| `DB_PASSWORD`      | 数据库密码                | `Xk9$mP2@vL7#nQ5w`               | 至少 16 位，含大小写数字特殊字符 |
| `POSTGRES_PASSWORD` | PostgreSQL 容器密码        | 与 `DB_PASSWORD` 保持一致          | 同上               |
| `JWT_SECRET`       | JWT 签名密钥              | `a1b2c3d4e5f6...` (32+位十六进制)  | 至少 32 位随机字符串   |
| `JWT_REFRESH_SECRET` | JWT 刷新密钥             | 同上格式                            | 至少 32 位随机字符串   |
| `CORS_ORIGINS`     | 允许的跨域来源            | `https://your-domain.com`          | 设置为实际域名         |

**生成随机密钥的命令**:

```bash
# 生成 JWT 密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 或使用 OpenSSL
openssl rand -hex 32
```

#### 可选变量说明

| 变量名              | 说明                      | 默认值     |
|--------------------|--------------------------|-----------|
| `AI_PROVIDER`      | AI 服务提供商              | 空（不启用） |
| `AI_API_KEY`       | AI API 密钥               | 空         |
| `AI_BASE_URL`       | AI API 基础 URL           | 空         |
| `MQTT_HOST`         | MQTT Broker 地址          | 空（不启用） |
| `SENTRY_DSN`        | Sentry 错误监控 DSN       | 空         |
| `REDIS_HOST`        | Redis 缓存地址            | 空（内存缓存） |

#### 安全注意事项

```bash
# 1. 确保 .env.production 不被提交到版本控制
echo ".env.production" >> .gitignore

# 2. 设置文件权限（仅允许当前用户读写）
chmod 600 .env.production

# 3. 检查是否包含默认密码
grep "请修改" .env.production
# 如果有输出，说明密码未修改，务必修改后再部署
```

### 3.3 构建与部署

#### 方式一：Docker Compose 部署（推荐）

这是最推荐的部署方式，所有服务通过 Docker 容器运行，环境一致性好。

```bash
# 一键部署
./deploy/deploy.sh

# 强制重新构建（代码更新后使用）
./deploy/deploy.sh --rebuild

# 停止所有服务
./deploy/deploy.sh --down
```

**服务架构说明**:

```
                  +------------------+
                  |   Nginx (80)     |  <-- 前端静态文件 + 反向代理
                  |  hse-frontend    |
                  +--------+---------+
                           |
                  +--------+---------+
                  |  Node.js (3000)  |  <-- 后端 API 服务
                  |  hse-backend     |
                  +--------+---------+
                           |
                  +--------+---------+
                  | PostgreSQL (5432)|  <-- 数据库
                  |  hse-db          |
                  +------------------+

  网络隔离: 所有服务运行在 hse-network 桥接网络中
  端口映射: 3000 和 5432 仅绑定 127.0.0.1，外部不可直接访问
```

**资源限制**:

| 服务          | CPU 限制 | 内存限制  | 内存预留  |
|--------------|---------|----------|----------|
| hse-frontend | 0.5 核  | 256MB    | 64MB     |
| hse-backend  | 1.0 核  | 512MB    | 128MB    |
| hse-db       | 1.0 核  | 1GB      | 512MB    |

#### 方式二：PM2 手动部署

适用于无法使用 Docker 或需要更灵活控制的场景。

```bash
# 1. 安装后端依赖
cd server
npm install --production

# 2. 配置环境变量（在 server 目录创建 .env 文件）
cp ../.env.production .env

# 3. 初始化数据库
psql -U hse_app -d safety-dashboard -f ../scripts/import_schema.sql

# 4. 使用 PM2 启动后端
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # 设置开机自启

# 5. 构建前端
cd ..
pnpm install
pnpm build

# 6. 使用 Nginx 托管前端构建产物
sudo cp -r dist/* /usr/share/nginx/html/
sudo cp deploy/nginx.conf /etc/nginx/conf.d/hse.conf
sudo nginx -t && sudo systemctl reload nginx
```

### 3.4 SSL/HTTPS 配置

#### Let's Encrypt 免费证书

```bash
# 1. 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 2. 申请证书（将 your-domain.com 替换为实际域名）
sudo certbot --nginx -d your-domain.com

# 3. 自动续期（Certbot 安装时已自动添加）
sudo certbot renew --dry-run   # 测试续期是否正常
```

#### Nginx HTTPS 配置示例

在 `deploy/nginx.conf` 中添加 HTTPS server 块:

```nginx
# ---- HTTPS 服务器 ----
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书路径（Let's Encrypt 自动生成）
    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # HSTS（强制 HTTPS，360 天）
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # 其余配置与 HTTP server 块一致
    root /usr/share/nginx/html;
    # ... 复制 HTTP server 中的 location 配置 ...
}

# ---- HTTP 到 HTTPS 重定向 ----
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

### 3.5 AI 服务配置

#### Grok API 配置

在 `.env.production` 中设置:

```bash
AI_PROVIDER=openai
AI_API_KEY=你的API密钥
AI_BASE_URL=https://api.x.ai/v1   # Grok API 地址
AI_MODEL=grok-3                    # 模型名称
```

#### Ollama 本地部署（离线 AI 推理）

```bash
# 1. 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. 拉取模型
ollama pull qwen2.5:7b   # 推荐使用 Qwen2.5 中文模型

# 3. 配置环境变量
AI_PROVIDER=custom
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=qwen2.5:7b
AI_API_KEY=ollama        # Ollama 不需要真实密钥，任意值即可
```

---

## 4. 运维管理

### 4.1 日常运维命令

#### 查看日志

```bash
# 查看所有服务日志（实时跟踪）
cd deploy && docker compose -f docker-compose.production.yml logs -f

# 查看单个服务日志
docker logs -f hse-frontend --tail 100
docker logs -f hse-backend --tail 100
docker logs -f hse-db --tail 100

# 查看指定时间段的日志
docker logs --since "2026-07-10T08:00:00" --until "2026-07-10T09:00:00" hse-backend
```

#### 重启服务

```bash
# 重启单个服务
docker restart hse-backend

# 重启所有服务
cd deploy && docker compose -f docker-compose.production.yml restart

# 完全停止并重新启动
cd deploy && docker compose -f docker-compose.production.yml down && \
  docker compose -f docker-compose.production.yml --env-file ../.env.production up -d
```

#### 数据库备份与恢复

```bash
# 手动备份（使用内置脚本）
./deploy/backup-db.sh

# 预览备份操作（不实际执行）
./deploy/backup-db.sh --dry-run

# 恢复数据库
gunzip < backups/db/hse_backup_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i hse-db psql -U hse_app -d postgres

# 查看现有备份
ls -lh backups/db/
```

**定时自动备份** (每天凌晨 2 点):

```bash
# 添加 crontab 任务
crontab -e

# 添加以下行
0 2 * * * /opt/hse-safety/deploy/backup-db.sh >> /var/log/hse-backup.log 2>&1

# 或使用 deploy/cron-backup.sh（项目已提供）
./deploy/cron-backup.sh install   # 安装定时任务
./deploy/cron-backup.sh uninstall # 卸载定时任务
```

### 4.2 监控

#### 健康检查

```bash
# 标准检查
./scripts/health-check.sh

# 详细模式
./scripts/health-check.sh --verbose

# JSON 格式（便于程序解析和告警系统集成）
./scripts/health-check.sh --json

# 结合 cron 实现定时监控
*/5 * * * * /opt/hse-safety/scripts/health-check.sh --json >> /var/log/hse-health.json 2>&1
```

**健康检查返回值**:
- `0` = 全部正常
- `1` = 部分异常（服务可用但存在警告）
- `2` = 严重故障（核心服务不可用）

#### Prometheus 指标

后端服务内置 Prometheus 指标端点 `/metrics`，包含:

| 指标名                    | 类型     | 说明                  |
|--------------------------|---------|----------------------|
| `http_requests_total`    | Counter | HTTP 请求总数          |
| `http_request_duration`   | Summary | HTTP 请求耗时          |
| `db_query_duration`      | Summary | 数据库查询耗时          |
| `active_websocket_count` | Gauge   | 当前活跃 WebSocket 数量 |
| `nodejs_heap_used_bytes` | Gauge   | Node.js 堆内存使用量    |

```bash
# 手动查看指标
curl http://localhost:3000/metrics
```

#### 日志查询

```bash
# 按服务筛选
docker compose logs hse-backend --since 1h

# 按关键词搜索
docker compose logs hse-backend | grep -i "error"

# 统计错误数量
docker compose logs hse-backend --since 24h | grep -c "ERROR"

# Docker 日志磁盘占用
docker system df -v
```

### 4.3 回滚

> 回滚脚本: `deploy/rollback.sh`

#### 回滚到上一个版本

```bash
./deploy/rollback.sh
```

#### 回滚到指定版本

```bash
# 查看可用版本
docker images --filter "reference=*hse*" --format "{{.Repository}}:{{.Tag}}"

# 回滚到指定版本
./deploy/rollback.sh --version=v4.0.3

# 跳过确认
./deploy/rollback.sh --version=v4.0.3 --force
```

#### 预览回滚操作

```bash
# 预览模式（不实际执行）
./deploy/rollback.sh --version=v4.0.3 --dry-run
```

#### 回滚安全机制

回滚脚本内置以下安全措施:
1. **回滚前自动备份**: 备份当前容器配置和环境变量到 `backups/rollback/` 目录
2. **数据库连接检查**: 确保数据库可访问后才执行回滚，防止数据丢失
3. **自动恢复**: 回滚后健康检查失败时自动恢复到回滚前的版本
4. **操作日志**: 所有回滚操作记录到 `logs/rollback.log`

---

## 5. 常见问题排查

### 5.1 服务启动失败

**现象**: `docker compose up -d` 执行后容器退出

```bash
# 查看容器退出原因
docker ps -a --filter "name=hse-"
docker logs hse-backend --tail 50

# 常见原因:
# 1. 端口被占用 → 修改 PORT 或停止占用端口的进程
sudo lsof -i :3000
sudo lsof -i :80

# 2. .env.production 文件格式错误 → 检查文件编码和格式
file .env.production   # 应输出: UTF-8 Unicode text

# 3. 镜像构建失败 → 查看构建日志
cd deploy && docker compose build --no-cache 2>&1 | tail -50
```

### 5.2 数据库连接失败

**现象**: 后端日志显示 `ECONNREFUSED` 或 `Connection refused`

```bash
# 检查数据库容器状态
docker ps --filter "name=hse-db"

# 检查数据库是否就绪
docker exec hse-db pg_isready -U hse_app -d safety-dashboard

# 检查端口映射
docker port hse-db

# 常见原因:
# 1. 数据库未完全启动 → 等待 10-30 秒后重试
# 2. 密码不匹配 → 确保 DB_PASSWORD 和 POSTGRES_PASSWORD 一致
grep -E "^DB_PASSWORD=|^POSTGRES_PASSWORD=" .env.production

# 3. 数据卷损坏 → 删除数据卷并重新初始化（警告: 会丢失数据）
docker volume rm hse_postgres_data
docker compose up -d
```

### 5.3 前端空白页

**现象**: 浏览器访问后显示空白页面

```bash
# 检查前端容器日志
docker logs hse-frontend --tail 20

# 检查 Nginx 配置
docker exec hse-frontend nginx -t

# 检查静态文件是否存在
docker exec hse-frontend ls /usr/share/nginx/html/

# 浏览器 F12 控制台常见错误:
# 1. "Failed to fetch" → API 代理配置问题，检查 nginx.conf 中的 proxy_pass
# 2. "net::ERR_CONNECTION_REFUSED" → 后端未启动
# 3. 白屏无错误 → 检查 index.html 是否存在且非空
```

### 5.4 WebSocket 连接失败

**现象**: 实时告警或数据推送不工作

```bash
# 测试 WebSocket 握手
curl -v -H "Upgrade: websocket" \
  -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://localhost:3000/ws

# 检查环境变量
docker exec hse-backend printenv WS_ENABLED

# 常见原因:
# 1. Nginx 未配置 WebSocket 代理 → 检查 nginx.conf 中 /ws location
# 2. 防火墙阻止长连接 → 检查防火墙超时设置
# 3. WS_ENABLED=false → 设置为 true 并重启
```

### 5.5 AI 服务不可用

**现象**: AI 辅助功能无响应或报错

```bash
# 检查 AI 配置
docker exec hse-backend printenv AI_PROVIDER
docker exec hse-backend printenv AI_BASE_URL

# 测试 AI API 连通性
curl -s http://localhost:11434/api/tags  # Ollama 本地部署
curl -s https://api.x.ai/v1/models -H "Authorization: Bearer YOUR_KEY"  # Grok API

# 常见原因:
# 1. API 密钥无效 → 重新生成并更新 .env.production
# 2. AI_BASE_URL 错误 → 检查 URL 是否包含正确的协议和路径
# 3. 模型未下载（Ollama） → 执行 ollama pull qwen2.5:7b
```

---

## 6. 性能调优建议

### 6.1 数据库

```sql
-- 连接到数据库
docker exec -it hse-db psql -U hse_app -d safety-dashboard

-- 查看当前连接数
SELECT count(*) FROM pg_stat_activity;

-- 查看慢查询（执行时间超过 1 秒）
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
WHERE mean_time > 1000
ORDER BY mean_time DESC
LIMIT 20;

-- 查看索引使用情况
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY schemaname, tablename;
```

**PostgreSQL 参数调优** (在 `.env.production` 或 docker-compose 中):

| 参数                              | 小型部署    | 中型部署    | 大型部署    |
|----------------------------------|-----------|-----------|-----------|
| `POSTGRES_SHARED_BUFFERS`        | 256MB     | 512MB     | 1GB       |
| `POSTGRES_EFFECTIVE_CACHE_SIZE`  | 768MB     | 1.5GB     | 3GB       |
| `POSTGRES_MAX_CONNECTIONS`        | 100       | 200       | 300       |
| `POSTGRES_WORK_MEM`               | 4MB       | 8MB       | 16MB      |

### 6.2 Node.js

```bash
# 查看后端进程内存使用
docker stats hse-backend --no-stream

# 调整 Node.js 内存限制（在 Dockerfile.backend 中）
# NODE_OPTIONS=--max-old-space-size=384  (384MB)

# 检查 GC 日志（如需排查内存泄漏）
# 在 .env.production 中设置:
NODE_OPTIONS=--max-old-space-size=384 --expose-gc
```

**连接池优化** (在 `.env.production` 中):

| 参数                  | 小型部署 | 中型部署 | 大型部署 |
|----------------------|--------|--------|--------|
| `DB_POOL_MIN`        | 2      | 5      | 10     |
| `DB_POOL_MAX`        | 20     | 50     | 100    |
| `DB_IDLE_TIMEOUT_MS` | 30000  | 20000  | 15000  |

### 6.3 Nginx

关键配置建议已在 `deploy/nginx.conf` 中预置:

```nginx
# 已优化项:
# - Gzip 压缩 (级别 6)
# - 静态资源长期缓存 (30 天)
# - API 请求缓冲 (16k buffer, 4x32k buffers)
# - WebSocket 长连接保持 (24 小时超时)
# - 速率限制 (10 req/s)
# - 安全响应头

# 如需进一步优化:
# 1. 启用 HTTP/2 Server Push（需要 HTTPS）
# 2. 增加 proxy_buffer 大小（处理大 JSON 响应时）
# 3. 启用 open_file_cache（高并发静态资源访问）
```

---

## 7. 安全检查清单

> 详细安全检查清单请参阅 [`deploy/security-checklist.md`](security-checklist.md)（如存在）

**部署前必检项**:

- [ ] 数据库密码已修改为强密码（非默认值）
- [ ] JWT 密钥为 32 位以上随机字符串
- [ ] CORS_ORIGINS 设置为实际前端域名（非 `*`）
- [ ] `CORS_ALLOW_ALL` 设为 `false`
- [ ] `.env.production` 文件权限为 `600`
- [ ] `.env.production` 已添加到 `.gitignore`
- [ ] 数据库端口 5432 仅绑定 127.0.0.1
- [ ] 后端端口 3000 仅绑定 127.0.0.1
- [ ] 已启用 HTTPS（生产环境）
- [ ] 已配置防火墙（仅开放 80/443 端口）
- [ ] Sentry 错误监控已配置（推荐）
- [ ] 数据库自动备份已配置（crontab）

---

## 8. 验证命令

部署完成后，使用以下命令验证系统运行状态。

### 8.1 Docker Compose 配置验证

```bash
# 验证配置文件语法
cd deploy && docker compose -f docker-compose.production.yml config

# 检查所有服务状态
docker ps --filter "name=hse-" --format "table {{.Names}}\t{{.Status}}"

# 检查网络配置
docker network inspect hse-network

# 检查数据卷
docker volume ls --filter "name=hse"
```

### 8.2 健康检查

```bash
# 运行综合健康检查
./scripts/health-check.sh --verbose

# 手动检查各服务
docker exec hse-db pg_isready -U hse_app -d safety-dashboard
curl -sf http://localhost:3000/api/health
curl -sf http://localhost/ | head -5
```

### 8.3 备份/恢复测试

```bash
# 测试备份
./deploy/backup-db.sh

# 验证备份文件完整性
ls -lh backups/db/
file backups/db/hse_backup_*.sql.gz

# 测试恢复（建议在测试环境执行）
# gunzip < backups/db/hse_backup_YYYYMMDD_HHMMSS.sql.gz | \
#   docker exec -i hse-db psql -U hse_app -d postgres
```

---

## 附录: 文件结构

```
deploy/
  ├── deploy.sh                    # 一键部署脚本
  ├── rollback.sh                  # 回滚脚本
  ├── backup-db.sh                 # 数据库备份脚本
  ├── cron-backup.sh               # 定时备份安装脚本
  ├── docker-compose.production.yml  # 生产环境服务编排
  ├── Dockerfile.frontend          # 前端 Dockerfile
  ├── Dockerfile.backend           # 后端 Dockerfile
  ├── nginx.conf                   # Nginx 配置
  ├── .env.production.template     # 环境变量模板
  └── README.md                    # 本文档

scripts/
  ├── health-check.sh              # 综合健康检查脚本
  ├── init-db.sh                   # 数据库初始化脚本
  └── import_schema.sql            # 数据库初始化 SQL

backups/
  ├── db/                          # 数据库备份文件
  └── rollback/                    # 回滚配置备份
```
