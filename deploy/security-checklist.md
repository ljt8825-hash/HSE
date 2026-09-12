# HSE 安全管理系统 -- 安全检查清单

> **项目**: 宁津环卫 HSE 安全管理系统 v4.1
> **检查日期**: 2026-07-10
> **说明**: 已实现的项标记为 `[x]`，未实现的标记为 `[ ]`。

---

## 1. 认证安全

| # | 检查项 | 状态 | 备注 |
|---|--------|------|------|
| 1.1 | JWT Secret 强度 >= 256 bits（32 字符） | [ ] | `server/.env` 中未配置 `JWT_SECRET`，使用硬编码默认值 `'hse-safety-dashboard-secret-key-2024'`（42 字符，满足长度要求，但生产环境**必须**通过环境变量注入随机密钥） |
| 1.2 | Access Token 有效期 <= 30 分钟 | [x] | `middleware/auth.js` 中设置为 `30m` |
| 1.3 | Refresh Token 有效期 <= 7 天 | [x] | `middleware/auth.js` 中设置为 `7d` |
| 1.4 | Token 黑名单机制已实现 | [x] | `middleware/auth.js` 中 `isTokenBlacklisted` + `blacklistToken` 已实现，登出和修改密码时自动加入黑名单 |
| 1.5 | 密码哈希使用 bcrypt（rounds >= 10） | [x] | `routes/auth.js` 使用 `bcrypt.hash(password, 10)`，rounds = 10 |

---

## 2. 数据库安全

| # | 检查项 | 状态 | 备注 |
|---|--------|------|------|
| 2.1 | PostgreSQL 使用 scram-sha-256 认证 | [ ] | 需确认 `pg_hba.conf` 配置；`postgres:17-alpine` 镜像默认为 scram-sha-256，但建议显式验证 |
| 2.2 | 数据库密码复杂度（>= 16 字符，含大小写+数字+特殊字符） | [x] | `server/.env` 中 `DB_PASSWORD` 为 32 字符随机字符串，满足要求 |
| 2.3 | 仅允许本地连接或指定 IP | [x] | `docker-compose.production.yml` 中数据库端口绑定 `127.0.0.1:5432:5432`，仅本地可访问 |
| 2.4 | 专用数据库用户（非 postgres 超级用户） | [x] | 使用 `hse_app` 专用用户，非 `postgres` 超级用户 |

---

## 3. 网络安全

| # | 检查项 | 状态 | 备注 |
|---|--------|------|------|
| 3.1 | CORS 白名单已配置（不使用 *） | [x] | `app.js` 中通过 `CORS_ORIGINS` 环境变量配置白名单；`CORS_ALLOW_ALL=false` 禁止全放行 |
| 3.2 | Rate Limiting 已启用（合理阈值） | [x] | 全局 500 次/15分钟，BI 1000 次/15分钟，IoT 2000 次/15分钟，分层限流 |
| 3.3 | HTTPS 强制（生产环境） | [ ] | 当前 Nginx 仅监听 80 端口，未配置 SSL/TLS 证书和 HTTPS 重定向；建议在前端部署 443 端口或使用反向代理层强制 HTTPS |
| 3.4 | WebSocket 使用 JWT 认证 | [x] | `services/wsServer.js` 通过 URL query 参数 `?token=xxx` 进行 JWT 认证，未携带 Token 的连接直接关闭 |

---

## 4. Nginx 安全头

| # | 检查项 | 状态 | 备注 |
|---|--------|------|------|
| 4.1 | X-Content-Type-Options: nosniff | [x] | `nginx.conf` 已配置 |
| 4.2 | X-Frame-Options: DENY | [x] | `nginx.conf` 已配置 |
| 4.3 | X-XSS-Protection: 1; mode=block | [ ] | `nginx.conf` 当前配置为 `"1"`，缺少 `; mode=block` 后缀 |
| 4.4 | Content-Security-Policy 策略 | [ ] | `nginx.conf` 当前仅配置 `"default-src 'self'"`，策略过于严格/简单，缺少 `script-src`、`style-src`、`img-src` 等详细指令（已在本次加固中补充） |
| 4.5 | Strict-Transport-Security | [ ] | `nginx.conf` 中未配置（仅在 Express helmet 层启用，Nginx 层缺失；已在本次加固中补充） |
| 4.6 | Referrer-Policy | [x] | `nginx.conf` 已配置 `strict-origin-when-cross-origin` |

---

## 5. 依赖安全

| # | 检查项 | 状态 | 备注 |
|---|--------|------|------|
| 5.1 | npm audit 无 high/critical 漏洞 | [ ] | 需定期运行 `npm audit` 检查；当前未作为 CI/CD 流水线的一部分自动执行 |
| 5.2 | 无已知废弃的依赖包 | [ ] | 需运行 `npm audit` 或使用 `depcheck` 工具检查是否有 deprecated 包 |
| 5.3 | 锁文件（pnpm-lock.yaml / package-lock.json）已提交 | [x] | Vben 前端使用 `安全看板vben/pnpm-lock.yaml`，后端使用 `server/package-lock.json` |

---

## 6. Docker 安全

| # | 检查项 | 状态 | 备注 |
|---|--------|------|------|
| 6.1 | 容器使用非 root 用户运行 | [x] | 后端 `Dockerfile.backend` 创建了 `nodejs` 用户并切换（`USER nodejs`）；前端 Nginx alpine 镜像默认使用 nginx 用户 |
| 6.2 | 镜像使用 alpine 版本 | [x] | 前端构建阶段 `node:22-alpine`，Nginx `nginx:alpine`，数据库 `postgres:17-alpine`；后端使用 `node:22-slim` |
| 6.3 | 敏感信息通过环境变量注入（非硬编码） | [x] | 数据库密码、JWT 密钥等均通过 `env_file` 或 `environment` 注入，未硬编码在镜像中 |

---

## 7. 日志与审计

| # | 检查项 | 状态 | 备注 |
|---|--------|------|------|
| 7.1 | 结构化日志已启用 | [x] | `utils/logger.js` 基于 winston，生产环境使用 JSON 格式，按日期轮转 |
| 7.2 | 登录失败记录已实现 | [x] | `routes/auth.js` 中 `recordLoginAttempt` 记录每次登录尝试（含 IP），支持账户锁定 |
| 7.3 | 操作审计日志已实现 | [ ] | `routes/audit.js` 路由已定义，但 `GET /audit/logs` 接口返回空数据 `{ list: [], total: 0 }`，实际审计日志记录功能尚未完整实现 |

---

## 待改进项汇总

| 优先级 | 项目 | 建议操作 |
|--------|------|----------|
| **高** | JWT_SECRET 生产环境配置 | 在 `server/.env` 中添加 `JWT_SECRET` 和 `JWT_REFRESH_SECRET`，使用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成 |
| **高** | HTTPS 强制 | 在 Nginx 配置 SSL 证书并监听 443 端口，将 80 端口请求 301 重定向到 HTTPS |
| **高** | 审计日志功能完善 | 在关键操作（增删改）处添加审计日志写入逻辑 |
| **中** | X-XSS-Protection 修正 | 将 `nginx.conf` 中的值从 `"1"` 改为 `"1; mode=block"` |
| **中** | npm audit 自动化 | 在 CI/CD 流水线中添加 `npm audit --audit-level=high` 检查步骤 |
| **低** | PostgreSQL 认证验证 | 确认 `pg_hba.conf` 中 `scram-sha-256` 配置生效 |
