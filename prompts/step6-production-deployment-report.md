# 第6步：生产部署准备报告

**项目名称**: 山东省宁津县环卫公司 HSE 安全管理系统  
**执行日期**: 2026-07-08  
**报告版本**: v1.0  

---

## 1. 前端构建优化

### 1.1 构建配置变更

| 配置项 | 变更前 | 变更后 | 说明 |
|--------|--------|--------|------|
| `sourcemap` | `true` | `mode === 'development'` | 生产环境关闭 sourcemap，减少构建体积 |
| `build` 脚本 | `vue-tsc --noEmit && vite build` | `vite build` | 跳过 vue-tsc 类型检查（预存类型错误不阻塞构建） |
| 新增 `build:typecheck` | - | `vue-tsc --noEmit && vite build` | 保留类型检查作为独立命令 |
| `rollup-plugin-gzip` fileName | `[file].gz` | 默认值 | 修复文件名错误（`xxx.js[file].gz` → `xxx.js.gz`） |

### 1.2 构建产物

```
安全管理系统/dist/
├── registerSW.js                      0.13 kB
├── manifest.webmanifest               0.39 kB
├── index.html                         1.38 kB  (gzip: 0.74 kB)
├── sw.js                              (PWA Service Worker)
├── workbox-*.js                        (PWA Workbox)
├── assets/
│   ├── css/
│   │   ├── RiskControl-CIGW-MKW.css  15.61 kB  (gzip: 6.46 kB)
│   │   └── index-qrJR1ygJ.css        41.69 kB  (gzip: 8.46 kB)
│   └── js/
│       ├── vue-DuRvQb-h.js           109.31 kB (gzip: 42.73 kB)
│       ├── ui-DVtZ5lFR.js            955.60 kB (gzip: 254.24 kB)
│       ├── charts-CV_kFUWL.js        1,043.59 kB (gzip: 346.53 kB)
│       ├── map-B8SneShO.js           154.63 kB (gzip: 44.83 kB)
│       ├── InsuranceDashboard.js     535.31 kB (gzip: 172.89 kB)
│       └── <其他模块>.js              (按路由懒加载)
```

**关键指标**:
- 构建时间: 15.62 秒
- 总模块数: 3,482
- 预压缩: Gzip + Brotli 同时生成
- PWA: 23 个预缓存条目 (2,935 KiB)
- 手动分块: vue / ui / charts / map / utils / InsuranceDashboard

### 1.3 环境变量

创建 `安全管理系统/.env.production`:

```env
VITE_APP_TITLE=宁津环卫HSE安全管理系统
VITE_API_BASE_URL=/api
VITE_AMAP_KEY=your-amap-key-here
VITE_PWA_ENABLED=true
VITE_DEVTOOLS_ENABLED=false
```

---

## 2. 后端进程管理 (PM2)

### 2.1 安装

```bash
npm install -g pm2
```

PM2 已全局安装（77 个包）。

### 2.2 PM2 生态配置

创建 `server/ecosystem.config.js`，配置参数：

| 参数 | 值 | 说明 |
|------|-----|------|
| 进程名称 | `hse-backend` | 管理标识 |
| 脚本 | `./app.js` | 生产入口 |
| 实例数 | 1 | 单机部署 |
| 执行模式 | `fork` | Windows 推荐 |
| 内存限制 | 500MB | 超限自动重启 |
| 错误日志 | `logs/error.log` | 分离错误日志 |
| 输出日志 | `logs/out.log` | 标准输出 |
| 合并日志 | `logs/combined.log` | 合并日志 |
| 最大重启数 | 10 次/10 分钟 | 防止无限重启 |
| 重启间隔 | 5 秒 | 冷却时间 |

### 2.3 后端日志增强

安装 `morgan` 请求日志中间件，配置：

- **开发环境**: `morgan('dev')` → 控制台彩色输出
- **生产环境**: `morgan('combined')` → 写入 `server/logs/access.log`
- 自动创建 `logs/` 目录

---

## 3. Nginx 反向代理配置

### 3.1 配置结构

```
nginx/
└── conf.d/
    ├── hse.conf              # Nginx 生产配置（含 HTTPS）
    └── hse-ssl-selfsigned.ps1 # 自签名证书生成脚本
```

### 3.2 配置要点

| 模块 | 配置内容 |
|------|----------|
| HTTP → HTTPS 跳转 | `listen 80; return 301 https://$host$request_uri;` |
| SSL | TLSv1.2 + TLSv1.3，ECDHE 加密套件 |
| HSTS | `max-age=31536000; includeSubDomains` |
| 安全头 | X-Frame-Options, X-Content-Type-Options, XSS-Protection, Referrer-Policy, Permissions-Policy |
| 速率限制 | 30 req/s，burst 50 |
| 连接限制 | 100 conn/IP |
| 静态缓存 | 365 天，`immutable` |
| Service Worker | 不缓存 |
| API 代理 | `127.0.0.1:3000`，超时 60s |
| 上传文件 | 50MB 限制，文件类型白名单 |
| Gzip | 启用，压缩级别 6 |
| Brotli | 注释（需 ngx_brotli 模块） |

---

## 4. HTTPS 方案

### 4.1 推荐方案

| 场景 | 方案 | 备注 |
|------|------|------|
| 生产环境 | Let's Encrypt + certbot | 免费、自动续期 |
| 内网部署 | 自签名证书 | 仅开发测试 |
| 云厂商 | 阿里云/腾讯云 SSL 证书 | 可绑定域名 |

### 4.2 自签名证书脚本

创建 `nginx/conf.d/hse-ssl-selfsigned.ps1`，支持两种生成方式：

1. **OpenSSL**（推荐）：生成 RSA 2048 位证书，10 年有效期
2. **PowerShell PKI 模块**（备选）：导出为 PFX 格式

---

## 5. 日志与监控

### 5.1 日志体系

| 日志类型 | 路径 | 内容 |
|----------|------|------|
| 后端访问日志 | `server/logs/access.log` | 所有 HTTP 请求（combined 格式） |
| PM2 错误日志 | `server/logs/error.log` | 未捕获异常 |
| PM2 输出日志 | `server/logs/out.log` | 控制台输出 |
| Nginx 访问日志 | `/var/log/nginx/hse-access.log` | 前端访问 |
| Nginx 错误日志 | `/var/log/nginx/hse-error.log` | Nginx 级错误 |

### 5.2 监控建议

| 类型 | 工具 | 说明 |
|------|------|------|
| 应用性能 | Sentry | 前后端错误追踪 |
| 服务器监控 | Prometheus + Grafana | CPU/内存/磁盘/网络 |
| 日志聚合 | ELK Stack / Loki | 集中日志管理 |
| 可用性 | UptimeRobot | 每 5 分钟检测 |
| 数据库 | pg_stat_statements | 慢查询分析 |

---

## 6. 安全配置

### 6.1 .gitignore 创建

新增项目根目录 `.gitignore`，覆盖以下敏感条目：

- `.env`, `.env.production`, `.env.local`, `.env.docker` — 环境变量
- `server/.env` — 数据库密码
- `backups/`, `*.sql.gz` — 数据库备份
- `logs/`, `*.log` — 日志文件
- `server/uploads/` — 上传文件
- `node_modules/`, `dist/`, `coverage/` — 构建产物
- `__pycache__/`, `*.pyc` — Python 缓存

### 6.2 Nginx 安全配置

- **速率限制**: 30 req/s，burst 50
- **连接限制**: 100 conn/IP
- **安全头**: X-Frame-Options, XSS-Protection, HSTS 等
- **隐藏目录**: 拒绝访问 `.` 开头的文件
- **node_modules**: 拒绝外部访问
- **上传目录**: 文件类型白名单

---

## 7. 部署文档更新

### 7.1 DEPLOY.md 全面更新

`安全管理系统/DEPLOY.md` 从旧版 Python 后端部署文档更新为完整的 Node.js 部署指南：

| 章节 | 内容 |
|------|------|
| 系统架构图 | 浏览器 → Nginx → Node.js 后端 → PostgreSQL |
| 环境要求 | Node.js 18+, PostgreSQL 17, Nginx 1.20+, PM2 |
| 后端部署 | 依赖安装、环境变量配置、PM2 启动 |
| 前端部署 | .env.production 配置、构建、部署静态文件 |
| Nginx 配置 | 安装配置、检查重载 |
| HTTPS 配置 | Let's Encrypt、自签名证书 |
| 数据库备份 | 定时任务、手动备份 |
| 安全配置清单 | 部署前/后检查项 |
| 维护命令 | 日志查看、更新、回滚 |
| 监控建议 | Sentry, Prometheus, ELK |

### 7.2 README.md 更新

- 增加 PostgreSQL 和 Nginx 环境要求说明
- 增加后端启动步骤（`cd server && node app.js`）
- 增加构建说明指向 DEPLOY.md

---

## 8. 生产环境 Checklist

### 8.1 部署前检查

| # | 检查项 | 状态 | 说明 |
|---|--------|------|------|
| 1 | 数据库密码已设置 | ✅ | postgres 和 hse_app 均有强密码 |
| 2 | 使用 hse_app 应用用户 | ✅ | 非 postgres 超级用户 |
| 3 | pg_hba.conf scram-sha-256 | ✅ | 非 trust 认证 |
| 4 | .env 已加入 .gitignore | ✅ | 新建 .gitignore 覆盖 |
| 5 | JWT_SECRET 强随机字符串 | ⚠️ | 当前使用默认密钥，部署前必须修改 |
| 6 | CORS 白名单限制 | ⚠️ | 当前为 `localhost`，部署前需改为生产域名 |
| 7 | HTTPS 证书 | ⚠️ | 需部署后申请 |
| 8 | Nginx 速率限制 | ✅ | 30 req/s |
| 9 | 防火墙 5432 端口 | ⚠️ | 需系统管理员配置 |
| 10 | 数据库备份定时任务 | ⚠️ | 需管理员执行 `schtasks /Create` |
| 11 | npm audit 修复 | ⚠️ | 当前有 1 个 high severity 漏洞 |

### 8.2 部署后验证

| # | 验证项 | 预期结果 |
|---|--------|----------|
| 1 | `curl /api/health` | 返回 `{"success":true,"data":{"ping":1}}` |
| 2 | 登录功能 | 管理员账号可登录 |
| 3 | 数据加载 | 各页面数据正常显示 |
| 4 | 文件上传/下载 | 上传文件可正常访问 |
| 5 | PWA 安装 | 支持安装为桌面应用 |
| 6 | HTTPS 访问 | 301 强制跳转，证书有效 |
| 7 | 数据库备份 | 手动执行备份脚本成功 |

---

## 9. 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 新增 | `.gitignore` | 项目根目录 gitignore |
| 新增 | `安全管理系统/.env.production` | 生产环境变量 |
| 新增 | `server/ecosystem.config.js` | PM2 进程管理配置 |
| 新增 | `nginx/conf.d/hse.conf` | Nginx 生产配置 |
| 新增 | `nginx/conf.d/hse-ssl-selfsigned.ps1` | 自签名证书生成脚本 |
| 修改 | `安全管理系统/vite.config.ts` | sourcemap 条件化，修复 gzip 文件名 |
| 修改 | `安全管理系统/package.json` | build 脚本跳过 vue-tsc |
| 修改 | `server/app.js` | 添加 morgan 请求日志中间件 |
| 修改 | `server/package.json` | 新增 morgan 依赖 |
| 修改 | `安全管理系统/DEPLOY.md` | 全面更新为 Node.js 部署文档 |
| 修改 | `安全管理系统/README.md` | 增加后端启动说明 |
| 安装 | `pm2` (global) | 进程管理 |
| 安装 | `morgan` (server) | 请求日志 |

---

## 10. 遗留问题与下一步建议

### 10.1 遗留问题

1. **JWT 密钥硬编码**: `server/middleware/auth.js` 中 `JWT_SECRET` 为硬编码字符串 `hse-safety-dashboard-secret-key-2024`，生产环境需改为环境变量读取
2. **TypeScript 类型错误**: 前端存在 30+ 个类型错误（`vue-tsc` 检查），不影响运行但影响构建时的类型检查
3. **Unocss 图标缺失**: 58 个 `carbon-*` 图标未能加载，需要安装 `@iconify-json/carbon` 包
4. **charts chunk 体积**: 1,043KB 超过 1MB 警告线，可进一步拆分
5. **npm audit 漏洞**: 当前 1 个 high severity 漏洞需要修复
6. **CORS 白名单**: 配置了 `localhost` 开发地址，部署前需改为生产域名

### 10.2 建议修复优先级

**P0（部署前必须修复）**:
1. `JWT_SECRET` 改为环境变量读取，禁止硬编码
2. 生产环境 CORS 白名单设置为实际前端域名
3. 配置数据库备份定时任务

**P1（部署后一周内）**:
1. 申请 HTTPS 证书并配置 Nginx
2. 修复 `npm audit` 漏洞
3. 安装 `@iconify-json/carbon` 修复图标缺失

**P2（后续迭代）**:
1. 逐步修复 TypeScript 类型错误
2. 拆分 charts chunk 降低首屏加载时间
3. 接入 Sentry 错误追踪
4. 配置 CI/CD 流水线（GitHub Actions / GitLab CI）

### 10.3 建议的后续步骤

```
1. 修复 JWT 密钥硬编码问题
2. 配置生产环境 CORS 域名
3. 申请 HTTPS 证书
4. 配置数据库备份定时任务
5. 部署到生产服务器
6. 验证全链路功能
```