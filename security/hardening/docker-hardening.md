# Docker 安全加固指南

| 项目信息       | 内容                                  |
|----------------|---------------------------------------|
| 系统名称       | 宁津环卫 HSE 安全管理系统 v4.1        |
| 文档编号       | HSE-SEC-HARDEN-2026-001               |
| 日期           | 2026-07-11                            |

---

## 1. 非 root 用户运行

容器内应用不应以 root 用户运行，防止容器逃逸后获得宿主机 root 权限。

```dockerfile
# 在 Dockerfile 中创建专用用户
RUN groupadd -r hseapp && useradd -r -g hseapp -d /app -s /sbin/nologin hseapp

# 设置工作目录并切换用户
WORKDIR /app
RUN chown -R hseapp:hseapp /app
USER hseapp

# 后续所有命令以 hseapp 用户运行
CMD ["node", "server/index.js"]
```

**验证方法**:
```bash
docker exec <container_id> whoami
# 应输出: hseapp
# 不应输出: root
```

---

## 2. 最小化基础镜像

使用精简的基础镜像，减少攻击面和镜像体积。

```dockerfile
# 推荐：使用 Node.js Alpine 镜像
FROM node:20-alpine AS builder
# 或使用 slim 变体（glibc 兼容性更好）
# FROM node:20-slim AS builder
```

| 镜像类型     | 大小      | 优势                   | 劣势                  |
|-------------|-----------|-----------------------|-----------------------|
| node:20      | ~1.1GB   | 完整工具链              | 体积大，攻击面广      |
| node:20-slim| ~250MB   | 较小，glibc 兼容       | 仍包含部分系统工具    |
| node:20-alpine| ~180MB  | 最小体积，musl libc     | 部分原生模块不兼容    |

> **建议**: 使用 `node:20-alpine` 作为运行阶段镜像。如需编译原生模块，构建阶段使用 slim 镜像。

---

## 3. 多阶段构建

分离构建和运行环境，避免将构建工具带入生产镜像。

```dockerfile
# 构建阶段
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

# 运行阶段
FROM node:20-alpine AS runtime
WORKDIR /app

# 仅复制生产依赖
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./

# 非 root 用户
RUN addgroup -S hseapp && adduser -S hseapp -G hseapp
USER hseapp

EXPOSE 3000
CMD ["node", "server/index.js"]
```

---

## 4. .dockerignore

防止敏感文件和不必要的文件被复制到镜像中。

```gitignore
# .dockerignore
node_modules
npm-debug.log
.env
.env.local
.git
.gitignore
dist
coverage
.nyc_output
*.md
.vscode
.idea
backups/
tests/
*.test.js
docker-compose*.yml
Dockerfile*
```

---

## 5. 健康检查

配置 Docker 健康检查，便于容器编排监控。

```dockerfile
# Dockerfile 中配置健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
```

```yaml
# docker-compose.yml 中配置
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
  interval: 30s
  timeout: 5s
  start_period: 10s
  retries: 3
```

---

## 6. 资源限制

在 docker-compose.yml 中限制容器资源使用，防止资源耗尽攻击。

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2.0'        # 最多使用 2 个 CPU 核心
          memory: 1G         # 内存上限 1GB
        reservations:
          cpus: '0.5'        # 保留 0.5 个 CPU 核心
          memory: 256M       # 保留 256MB 内存
    # 限制 PID 数量，防止 fork 炸弹
    pids_limit: 100
```

---

## 7. 只读文件系统（可选）

将容器文件系统设为只读，仅允许写入必要目录。

```yaml
services:
  backend:
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=100m
      - /app/logs:rw,noexec,nosuid,size=50m
    # 如需上传文件，挂载专用 volume
    volumes:
      - uploads:/app/uploads:rw
```

> **注意**: 需确保应用不向除 /tmp 外的目录写入文件。

---

## 8. 安全选项

在 docker-compose.yml 中配置容器安全选项。

```yaml
services:
  backend:
    # 禁止获取新权限（防止提权）
    security_opt:
      - no-new-privileges:true

    # 只读文件系统 + 写入限制（同第 7 节）
    read_only: true

    # 禁止容器内修改系统时间
    cap_drop:
      - SYS_TIME
      - SYS_ADMIN
      - NET_ADMIN
      - ALL

    # 仅保留必要权限
    cap_add:
      - CHOWN      # 文件所有权变更
      - SETUID     # 用户 ID 切换
      - SETGID     # 组 ID 切换
```

---

## 9. 网络隔离

使用 Docker 网络隔离容器通信。

```yaml
services:
  backend:
    networks:
      - internal
    # 不暴露端口到宿主机，通过 Nginx 反向代理

  nginx:
    networks:
      - internal
      - external
    ports:
      - "80:80"
      - "443:443"

networks:
  internal:
    driver: bridge
    internal: true    # 仅内部通信，无法访问外网
  external:
    driver: bridge
    # 默认可访问外网
```

---

## 10. 镜像安全扫描

定期扫描镜像中的已知漏洞。

```bash
# 使用 Trivy 扫描
trivy image hse-safety-backend:latest

# 使用 docker scout（Docker 内置）
docker scout cves hse-safety-backend:latest

# CI/CD 中集成
trivy image --exit-code 1 --severity CRITICAL,HIGH hse-safety-backend:latest
```

---

## 11. 加固检查清单

| 检查项                     | 状态   | 说明                        |
|----------------------------|--------|-----------------------------|
| 非 root 用户               | PASS   | 当前已配置                  |
| 最小化镜像                 | CHECK  | 确认使用 alpine/slim        |
| 多阶段构建                 | CHECK  | 确认构建/运行分离           |
| .dockerignore              | CHECK  | 确认敏感文件已排除          |
| 健康检查                   | CHECK  | 确认已配置                  |
| 资源限制                   | CHECK  | 确认已配置 CPU/内存限制     |
| 只读文件系统               | OPT    | 可选但推荐                  |
| 安全选项                   | CHECK  | no-new-privileges + cap    |
| 网络隔离                   | CHECK  | 确认使用独立网络            |
| 镜像漏洞扫描              | CHECK  | CI 中集成 Trivy             |

---

*文档日期: 2026-07-11*
