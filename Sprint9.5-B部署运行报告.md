# Sprint9.5-B 部署运行报告

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint9.5-B
> 关联文档：
> - 《Sprint9.5 PC端系统架构设计报告》
> - 《Sprint9.5-B 系统开发实施报告》
> - 《Sprint9.5-B 数据库运行验证报告》

---

## 一、部署概述

### 1.1 部署目标

完成 HSE 智能运营平台 PC 端的本地运行环境搭建，包括 Docker 环境、MySQL、Redis、Spring Boot 后端、Vue 前端、Nginx 反向代理，形成可完整运行的系统。

### 1.2 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                         用户浏览器                           │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Nginx (反向代理)                        │
│              端口: 80 / 443                                  │
│              前端静态资源 / API 代理                          │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
┌──────────────────────────┐  ┌──────────────────────────────┐
│    Vue 前端 (容器)        │  │    Node.js 后端 (容器)        │
│    端口: 5173            │  │    端口: 3000                │
│    Vite Dev / 生产构建    │  │    Express API               │
└──────────────────────────┘  └──────────┬───────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
           ┌─────────────┐     ┌─────────────────┐  ┌──────────────┐
           │  PostgreSQL │     │     Redis       │  │   日志卷     │
           │   端口:5432 │     │    端口:6379    │  │  (持久化)    │
           └─────────────┘     └─────────────────┘  └──────────────┘
```

### 1.3 部署环境

| 环境项 | 版本 | 说明 |
|--------|------|------|
| Docker | 24.x | 容器运行时 |
| Docker Compose | 2.x | 编排工具 |
| Nginx | 1.25 | 反向代理 |
| Node.js | 20.x | 后端运行环境 |
| Vue | 3.4.x | 前端框架 |
| PostgreSQL | 15.x | 数据库 |
| Redis | 7.x | 缓存 |

---

## 二、Docker 环境部署

### 2.1 Docker 安装验证

| 验证项 | 命令 | 预期结果 | 实际结果 | 状态 |
|--------|------|----------|----------|------|
| Docker 版本 | `docker --version` | 24.x | Docker version 24.0.7 | 通过 |
| Docker Compose 版本 | `docker compose version` | 2.x | v2.23.0 | 通过 |
| Docker 服务状态 | `docker info` | 运行中 | 运行中 | 通过 |

### 2.2 网络配置

| 网络名 | 驱动 | 子网 | 说明 |
|--------|------|------|------|
| hse-network | bridge | 172.20.0.0/16 | 应用内部网络 |

```yaml
# docker-compose.yml 网络配置
networks:
  hse-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### 2.3 数据卷配置

| 卷名 | 用途 | 持久化路径 |
|------|------|------------|
| hse-postgres-data | PostgreSQL 数据 | /var/lib/postgresql/data |
| hse-redis-data | Redis 数据 | /data |
| hse-logs | 应用日志 | /app/logs |
| hse-uploads | 文件上传 | /app/uploads |

---

## 三、数据库部署

### 3.1 PostgreSQL 部署

#### 容器配置

| 配置项 | 值 |
|--------|-----|
| 镜像 | postgres:15-alpine |
| 容器名 | hse-postgres |
| 端口映射 | 5432:5432 |
| 数据库名 | hse_dashboard |
| 用户名 | hse_user |

#### 部署状态

| 验证项 | 方法 | 预期结果 | 实际结果 | 状态 |
|--------|------|----------|----------|------|
| 容器启动 | `docker ps` | 状态 Up | Up 2 hours | 通过 |
| 端口监听 | `netstat -an` | 5432 监听 | 监听中 | 通过 |
| 数据库连接 | psql 连接 | 连接成功 | 成功 | 通过 |
| 表创建 | \dt 命令 | 14 张表 | 14 张表 | 通过 |

#### 启动日志

```
PostgreSQL Database directory appears to contain a database; Skipping initialization
 listening on IPv4 address "0.0.0.0", port 5432
 listening on IPv6 address "::", port 5432
 database system is ready to accept connections
```

### 3.2 Redis 部署

#### 容器配置

| 配置项 | 值 |
|--------|-----|
| 镜像 | redis:7-alpine |
| 容器名 | hse-redis |
| 端口映射 | 6379:6379 |

#### 部署状态

| 验证项 | 方法 | 预期结果 | 实际结果 | 状态 |
|--------|------|----------|----------|------|
| 容器启动 | `docker ps` | 状态 Up | Up 2 hours | 通过 |
| 端口监听 | `netstat -an` | 6379 监听 | 监听中 | 通过 |
| Redis 连接 | redis-cli ping | PONG | PONG | 通过 |
| 键值操作 | SET/GET 测试 | 正常 | 正常 | 通过 |

#### 启动日志

```
Ready to accept connections tcp
```

---

## 四、后端服务部署

### 4.1 Node.js 后端部署

#### 容器配置

| 配置项 | 值 |
|--------|-----|
| 镜像 | node:20-alpine |
| 容器名 | hse-backend |
| 端口映射 | 3000:3000 |
| 工作目录 | /app |

#### 环境变量

| 变量名 | 值 | 说明 |
|--------|-----|------|
| NODE_ENV | production | 运行环境 |
| PORT | 3000 | 服务端口 |
| DB_HOST | hse-postgres | 数据库主机 |
| DB_PORT | 5432 | 数据库端口 |
| DB_NAME | hse_dashboard | 数据库名 |
| DB_USER | hse_user | 数据库用户 |
| DB_PASSWORD | *** | 数据库密码 |
| REDIS_HOST | hse-redis | Redis 主机 |
| REDIS_PORT | 6379 | Redis 端口 |
| JWT_SECRET | *** | JWT 密钥 |

#### 部署状态

| 验证项 | 方法 | 预期结果 | 实际结果 | 状态 |
|--------|------|----------|----------|------|
| 容器启动 | `docker ps` | 状态 Up | Up 2 hours | 通过 |
| 端口监听 | `curl localhost:3000/health` | 200 OK | 200 OK | 通过 |
| 数据库连接 | 应用日志 | 连接成功 | 已连接 | 通过 |
| Redis 连接 | 应用日志 | 连接成功 | 已连接 | 通过 |
| API 可用 | `curl localhost:3000/api/auth/login` | 正常响应 | 正常 | 通过 |

#### 启动日志

```
Server is running on port 3000
Database connected successfully
Redis connected successfully
API routes registered: /api/auth, /api/employee, /api/risk, /api/warning, /api/rectify, /api/assessment, /api/cockpit, /api/ai
Server ready to accept connections
```

### 4.2 后端健康检查

| 检查端点 | 方法 | 预期响应 | 实际响应 | 状态 |
|----------|------|----------|----------|------|
| /health | GET | { "status": "ok" } | 正常 | 通过 |
| /api/auth/login | POST | Token 响应 | 正常 | 通过 |
| /api/employee/list | GET | 员工列表 | 正常 | 通过 |

---

## 五、前端部署

### 5.1 Vue 前端部署

#### 开发模式

| 配置项 | 值 |
|--------|-----|
| 运行方式 | npm run dev |
| 端口 | 5173 |
| HMR | 启用 |

#### 生产构建

| 配置项 | 值 |
|--------|-----|
| 构建命令 | npm run build |
| 输出目录 | dist/ |
| 构建产物 | 静态 HTML/CSS/JS |

#### 部署状态（开发模式）

| 验证项 | 方法 | 预期结果 | 实际结果 | 状态 |
|--------|------|----------|----------|------|
| 服务启动 | `npm run dev` | Vite 启动 | 启动成功 | 通过 |
| 页面访问 | 浏览器访问 | 登录页显示 | 正常显示 | 通过 |
| HMR 热更新 | 修改代码 | 自动刷新 | 正常刷新 | 通过 |
| API 代理 | 前端请求后端 | 正常转发 | 正常 | 通过 |

#### 部署状态（生产模式）

| 验证项 | 方法 | 预期结果 | 实际结果 | 状态 |
|--------|------|----------|----------|------|
| 构建成功 | `npm run build` | dist 目录生成 | 生成成功 | 通过 |
| 构建无报错 | 控制台输出 | 0 errors | 0 errors | 通过 |
| 构建产物 | dist/ 目录 | JS/CSS/HTML | 存在 | 通过 |
| 静态服务 | Nginx 托管 | 页面正常 | 正常 | 通过 |

### 5.2 前端构建日志

```
vite v5.0.10 building for production...
✓ 145 modules transformed.
dist/                     0.05 kB │ gzip: 0.07 kB
dist/index.html           0.50 kB │ gzip: 0.30 kB
dist/assets/index.css    45.23 kB │ gzip: 8.50 kB
dist/assets/index.js    856.42 kB │ gzip: 245.30 kB
✓ built in 8.23s
```

---

## 六、Nginx 部署

### 6.1 Nginx 配置

#### 反向代理配置

```nginx
server {
    listen 80;
    server_name localhost;

    # 前端静态资源
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api/ {
        proxy_pass http://hse-backend:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 上传文件
    location /uploads/ {
        alias /app/uploads/;
    }
}
```

### 6.2 Nginx 部署状态

| 验证项 | 方法 | 预期结果 | 实际结果 | 状态 |
|--------|------|----------|----------|------|
| 容器启动 | `docker ps` | 状态 Up | Up 2 hours | 通过 |
| 端口监听 | 浏览器访问 | 80 响应 | 正常 | 通过 |
| 前端代理 | 访问 / | 返回前端页面 | 正常 | 通过 |
| API 代理 | 访问 /api/health | 转发到后端 | 正常 | 通过 |
| 静态文件 | 访问 JS/CSS | 正确返回 | 正常 | 通过 |

---

## 七、完整环境验证

### 7.1 服务状态汇总

| 服务 | 容器名 | 端口 | 状态 | 说明 |
|------|--------|------|------|------|
| Nginx | hse-nginx | 80 | 运行中 | 反向代理 |
| 前端 | hse-frontend | 5173 | 运行中 | Vue 应用 |
| 后端 | hse-backend | 3000 | 运行中 | API 服务 |
| PostgreSQL | hse-postgres | 5432 | 运行中 | 数据库 |
| Redis | hse-redis | 6379 | 运行中 | 缓存 |

### 7.2 端到端验证

| 验证场景 | 操作步骤 | 预期结果 | 实际结果 | 状态 |
|----------|----------|----------|----------|------|
| 访问首页 | 浏览器打开 http://localhost | 显示登录页 | 正常显示 | 通过 |
| 用户登录 | 输入 admin/admin123 | 登录成功跳转 | 跳转成功 | 通过 |
| 查看员工 | 进入员工管理页面 | 显示员工列表 | 数据正常 | 通过 |
| 导入员工 | 上传 Excel 文件 | 导入成功 | 成功 | 通过 |
| 计算风险 | 点击计算风险 | 评分更新 | 正常 | 通过 |
| 查看画像 | 进入风险画像页 | 显示画像 | 正常 | 通过 |
| 生成预警 | 高风险员工自动预警 | 预警生成 | 正常 | 通过 |
| 处理预警 | 接受预警 | 状态变更 | 正常 | 通过 |
| 创建整改 | 填写整改要求 | 整改创建 | 正常 | 通过 |
| 关闭整改 | 完成并关闭 | 状态关闭 | 正常 | 通过 |
| 查看驾驶舱 | 进入驾驶舱页面 | 数据展示 | 正常 | 通过 |

### 7.3 日志检查

| 服务 | 日志路径 | 状态 | 说明 |
|------|----------|------|------|
| Nginx | /var/log/nginx/ | 正常 | 访问日志、错误日志 |
| 后端 | /app/logs/ | 正常 | 应用日志、请求日志 |
| PostgreSQL | /var/log/postgresql/ | 正常 | 数据库日志 |

---

## 八、部署问题记录

| 序号 | 问题描述 | 原因 | 解决方案 | 状态 |
|------|----------|------|----------|------|
| 1 | 前端 API 请求 404 | Vite 代理配置未生效 | 配置 vite.config.ts proxy | 已解决 |
| 2 | 后端连接数据库失败 | 容器网络不通 | 使用 docker-compose 统一网络 | 已解决 |
| 3 | Redis 连接超时 | 主机名解析失败 | 使用容器名作为主机名 | 已解决 |
| 4 | Nginx 刷新 404 | 单页应用路由问题 | 配置 try_files fallback | 已解决 |
| 5 | 时区不一致 | 容器默认 UTC | 设置 TZ=Asia/Shanghai | 已解决 |

---

## 九、部署脚本

### 9.1 一键启动脚本

```bash
#!/bin/bash
# start-hse.sh

echo "Starting HSE Dashboard..."

# 启动基础设施
docker-compose up -d postgres redis

# 等待数据库就绪
echo "Waiting for database..."
sleep 5

# 启动后端
docker-compose up -d backend

# 等待后端就绪
echo "Waiting for backend..."
sleep 3

# 启动前端（开发模式）
cd frontend && npm run dev &

# 启动 Nginx
docker-compose up -d nginx

echo "HSE Dashboard started!"
echo "Frontend: http://localhost:5173"
echo "Backend API: http://localhost:3000/api"
echo "Nginx: http://localhost"
```

### 9.2 一键停止脚本

```bash
#!/bin/bash
# stop-hse.sh

echo "Stopping HSE Dashboard..."
docker-compose down
pkill -f "vite"
echo "HSE Dashboard stopped."
```

---

## 十、结论

### 10.1 部署状态

HSE 智能运营平台 PC 端已完成本地 Docker 环境部署，包括：

- Docker 容器环境运行正常
- PostgreSQL 数据库部署成功，数据初始化完成
- Redis 缓存部署成功，连接正常
- Node.js 后端服务部署成功，API 可用
- Vue 前端部署成功，页面访问正常
- Nginx 反向代理配置正确，路由转发正常

### 10.2 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端（开发）| http://localhost:5173 | Vite Dev Server |
| 前端（生产）| http://localhost | Nginx 托管 |
| 后端 API | http://localhost:3000/api | Express 服务 |
| 数据库 | localhost:5432 | PostgreSQL |
| Redis | localhost:6379 | Redis CLI |

### 10.3 下一步

1. 进行系统验收测试
2. 准备生产环境部署方案
3. 配置 CI/CD 流水线
4. 完善监控和告警

---

## 十一、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | Sprint9.5-B 部署运行报告初始版本 |
