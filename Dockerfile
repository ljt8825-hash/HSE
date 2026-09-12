# ============================================================
# Dockerfile — HSE 安全管理系统
# 多语言镜像: Node.js 20 + Python 3 (child_process 调用)
# ============================================================

# ---- 基础镜像: Node.js 20 (Debian bookworm slim) ----
FROM node:20-bookworm-slim

# 维护者信息
LABEL maintainer="HSE Data Team"
LABEL description="宁津项目HSE安全管理系统 — Node.js API + Python 解析引擎"

# ---- 安装系统依赖 + Python 3 + PostgreSQL 客户端 ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    postgresql-client \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 创建 Python 虚拟环境 (隔离依赖, 不污染系统)
RUN python3 -m venv /opt/python-env

# 升级 pip
RUN /opt/python-env/bin/pip install --no-cache-dir --upgrade pip

# ---- 复制 Python 依赖文件并安装 ----
COPY requirements.txt /tmp/requirements.txt
RUN /opt/python-env/bin/pip install --no-cache-dir -r /tmp/requirements.txt

# 将虚拟环境加入 PATH (node 进程的 child_process 会继承)
ENV PATH="/opt/python-env/bin:${PATH}"

# ---- 工作目录 ----
WORKDIR /app

# ---- 复制 package.json 并安装 Node.js 依赖 (含 devDependencies 用于 TypeScript 编译) ----
COPY server/package.json ./server/package.json
COPY server/package-lock.json ./server/package-lock.json
COPY server/tsconfig.json ./server/tsconfig.json

RUN cd server && npm install && npm cache clean --force

# ---- 安装 OpenTelemetry Node.js 包 (追加到已有 node_modules) ----
RUN cd server && npm install --silent \
    @opentelemetry/api \
    @opentelemetry/sdk-node \
    @opentelemetry/auto-instrumentations-node \
    @opentelemetry/exporter-trace-otlp-http \
    @opentelemetry/exporter-logs-otlp-http \
    @opentelemetry/resources \
    @opentelemetry/semantic-conventions \
    @opentelemetry/instrumentation-express \
    @opentelemetry/instrumentation-http \
    @opentelemetry/instrumentation-pg \
    winston \
    winston-logstash && npm cache clean --force

# ---- 复制 TypeScript 源码并编译 ----
COPY server/src/ ./server/src/

RUN cd server && npx tsc

# ---- 复制项目文件 ----
# Python 脚本
COPY scripts/ ./scripts/

# 前端静态文件 (index.html + modules + styles)

# 数据源 (用于 Python 解析引擎读取 Excel)
# 注意: 实际运行时通过 volume 挂载, 这里只放空目录占位
RUN mkdir -p 数据源

# 上传目录
RUN mkdir -p server/uploads/documents \
    server/uploads/excel \
    server/uploads/file-records \
    server/uploads/hazards \
    server/uploads/images

# ---- 环境变量 (默认值, 可被 .env 覆盖) ----
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_HOST=postgres
ENV DB_PORT=5432
ENV DB_USER=postgres
ENV DB_PASSWORD=postgres
ENV DB_NAME=safety_dashboard
ENV PYTHON_PATH=python3
ENV UPLOAD_DIR=./uploads
ENV PYTHONIOENCODING=utf-8

# ---- 复制启动脚本 ----
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# 防止 Windows CRLF 换行符导致 bash 报错
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-entrypoint.sh

# ---- 健康检查 ----
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -sf http://localhost:3000/api/health || exit 1

# ---- 暴露端口 ----
EXPOSE 3000

# ---- 启动命令 ----
# 使用 tsc 编译后的产物 (构建阶段已执行 npx tsc)
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/dist/app.js"]
