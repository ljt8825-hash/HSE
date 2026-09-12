# 第6步：生产部署准备

## 前置条件（第5步完成后）

第1-5步全部完成：数据已迁移、Auth 已对接、后端架构已统一、数据库已加固、API 接口已测试通过。系统功能完整、安全加固到位、接口稳定。

## 项目背景

你正在开发**山东省宁津县环卫公司 HSE 安全管理系统**。

**当前部署状态：**
- 前端：Vite 开发服务器（`npm run dev`），端口 8080
- 后端：Node.js Express，端口 3000
- 数据库：PostgreSQL 17，端口 5432
- 无 Nginx 反向代理
- 无 HTTPS 配置
- 无进程管理器（直接 `node server/app.js` 运行）
- 无 Docker 化部署
- 有 Docker 模板文件（`.env.docker.example`），但未见 `Dockerfile` 或 `docker-compose.yml`
- 前端重构阶段曾生成 `DEPLOY.md`，但内容可能已过时

**技术栈回顾：**
- 前端：Vue 3 + TypeScript + Naive UI + Vite 6 + Pinia + ECharts + UnoCSS
- 后端：Node.js Express + pg
- 数据库：PostgreSQL 17
- 操作系统：Windows Server（生产环境推测）
- 可选：Docker（项目有 Docker 相关配置）

## 核心问题

系统只能在开发模式下运行，无法在生产环境稳定部署。缺乏进程守护、反向代理、HTTPS、日志管理、监控告警等生产级基础设施。

## 你的任务

### 任务 1：前端构建优化

配置并执行前端生产构建：

**1.1 环境变量配置**
- 创建/更新 `安全管理系统/.env.production`
- 设置生产环境 API 地址（`VITE_API_BASE_URL`）
- 设置高德地图 Key（`VITE_AMAP_KEY`，替换占位符）
- 确认其他环境变量

**1.2 构建执行与验证**
```bash
cd 安全管理系统
npm run build  # Vite 构建到 dist/ 目录
```

**1.3 构建产物检查**
- 检查 `dist/` 目录结构和文件大小
- 确认静态资源已正确哈希命名（缓存策略）
- 检查是否包含 source map（生产环境应移除或限制访问）
- 验证 index.html 中的资源引用路径正确

**1.4 Gzip/Brotli 预压缩（如 Vite 插件已配置）**
- 确认 `vite-plugin-compression` 配置
- 验证生成的 .gz / .br 文件

### 任务 2：后端构建与进程管理

**2.1 TypeScript 编译（如使用 TS 版入口）**
```bash
cd server
npm run build  # 编译到 dist/ 目录
```

**2.2 进程管理器配置**
使用 **PM2** 作为进程管理器（Node.js 生态主流方案）：

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'hse-api',
    script: 'dist/app.js',  // 或 app.js
    cwd: './server',
    instances: 1,           // 单实例（数据库连接池限制）
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/api-error.log',
    out_file: './logs/api-out.log',
    max_memory_restart: '256M',
    autorestart: true,
    watch: false
  }]
};
```

**2.3 PM2 安装与配置**
```bash
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # 开机自启
```

### 任务 3：Nginx 反向代理配置

创建 Nginx 配置文件，统一前端静态文件和后端 API：

```nginx
server {
    listen 80;
    server_name hse.your-domain.com;  # 替换为实际域名或 IP

    # 前端静态文件
    root /path/to/安全管理系统/dist;
    index index.html;

    # SPA 路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # 上传文件访问
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1024;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

### 任务 4：HTTPS 配置

**方案 A：Let's Encrypt（推荐，免费）**
```bash
# 安装 certbot
certbot --nginx -d hse.your-domain.com
# 自动续期
certbot renew --dry-run
```

**方案 B：自签名证书（内网环境）**
- 使用 OpenSSL 生成自签名证书
- 配置 Nginx SSL

**方案 C：已有证书**
- 将证书文件放到服务器指定位置
- 配置 Nginx SSL

### 任务 5：日志与监控

**5.1 日志管理**
- PM2 日志：`logs/api-error.log` + `logs/api-out.log`
- Nginx 日志：`access.log` + `error.log`
- PostgreSQL 日志：第4步已配置
- 日志轮转：配置 `pm2 install pm2-logrotate`

**5.2 健康检查**
- 利用已有的 `/api/health` 接口
- 配置 PM2 自带的健康检查或外部监控

**5.3 性能监控（可选）**
- PM2 内置监控：`pm2 monit`
- 或集成轻量 APM（如 OpenTelemetry，项目根目录 requirements.txt 中已有相关依赖）

### 任务 6：部署文档更新

更新以下文档：
- `DEPLOY.md` — 完整的部署指南（从零开始部署到生产环境）
- `README.md` — 更新项目架构图、启动命令、环境要求
- `.env.docker.example` — 更新 Docker 部署模板

部署文档应包含：
1. 环境要求（Node.js 版本、PostgreSQL 版本、Nginx 版本）
2. 安装步骤
3. 配置说明（所有环境变量）
4. 构建步骤
5. 启动步骤
6. 验证步骤
7. 常见问题排查
8. 回滚方案

### 任务 7：生产环境 Checklist

生成一份生产上线前的最终检查清单，逐项验证：

**基础设施**
- [ ] PostgreSQL 正常运行，`hse_app` 用户权限正确
- [ ] 自动备份已配置并测试恢复
- [ ] Nginx 已安装并配置
- [ ] PM2 已安装并配置开机自启
- [ ] 防火墙规则正确（仅开放 80/443，5432 不对外开放）

**应用**
- [ ] 前端 `npm run build` 成功，产物完整
- [ ] 后端 TypeScript 编译成功（如使用 TS）
- [ ] `.env.production` 配置正确（API 地址、高德 Key 等）
- [ ] `server/.env` 配置正确（数据库密码、端口等）

**安全**
- [ ] 数据库非空密码
- [ ] JWT Secret 使用强随机值
- [ ] CORS 配置正确（仅允许前端域名）
- [ ] HTTPS 证书有效
- [ ] 默认管理员密码已修改

**功能**
- [ ] 登录/登出正常
- [ ] 各业务模块数据正常显示
- [ ] 文件上传/下载正常
- [ ] 数据导入/导出正常
- [ ] 图表和统计正常渲染

## 输出要求

生成一份 Markdown 报告文件 `step6-production-deployment-report.md`，保存到 `f:\个人文件\新安全看板\prompts\` 目录，包含以下章节：

1. **前端构建报告** — 构建配置、产物大小统计、优化建议
2. **后端部署配置** — PM2 配置、进程管理、日志方案
3. **Nginx 配置** — 完整的配置文件、反向代理规则、缓存策略
4. **HTTPS 方案** — 选择的方案、证书配置、自动续期
5. **部署文档** — 完整的 DEPLOY.md 内容
6. **上线 Checklist** — 逐项检查结果、未通过项及处理计划
7. **遗留问题与后续优化建议** — 性能优化、扩展性、灾备方案

## 技术约束

- 操作系统：Windows Server（目标生产环境）
- Node.js 版本：与开发环境一致
- 前端构建目录：`安全管理系统/dist/`
- 后端入口：`server/app.js` 或 `server/dist/app.js`
- Nginx 配置文件：`f:\个人文件\新安全看板\nginx\hse.conf`（待创建）
- PM2 配置文件：`f:\个人文件\新安全看板\ecosystem.config.js`（待创建）

## 关键文件路径

| 文件 | 路径 |
|------|------|
| 前端 Vite 配置 | `f:\个人文件\新安全看板\安全管理系统\vite.config.ts` |
| 前端环境变量 | `f:\个人文件\新安全看板\安全管理系统\.env` |
| 前端 package.json | `f:\个人文件\新安全看板\安全管理系统\package.json` |
| 后端入口 (JS) | `f:\个人文件\新安全看板\server\app.js` |
| 后端入口 (TS) | `f:\个人文件\新安全看板\server\src\app.ts` |
| 后端 TS 配置 | `f:\个人文件\新安全看板\server\tsconfig.json` |
| 后端环境变量 | `f:\个人文件\新安全看板\server\.env` |
| 后端 package.json | `f:\个人文件\新安全看板\server\package.json` |
| Docker 模板 | `f:\个人文件\新安全看板\.env.docker.example` |
| README | `f:\个人文件\新安全看板\server\README.md` |
