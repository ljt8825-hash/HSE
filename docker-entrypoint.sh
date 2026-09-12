#!/bin/bash
# ============================================================
# docker-entrypoint.sh — 容器启动入口脚本
# 功能: 等待 PostgreSQL 就绪 → 初始化 SQL → 启动 Node.js
# ============================================================

set -e

echo "============================================"
echo "  HSE 安全管理系统 — Docker 启动"
echo "============================================"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 启动中..."
echo ""

# ---- 1. 等待 PostgreSQL 就绪 ----
echo "[1/4] 等待 PostgreSQL 就绪..."
MAX_RETRIES=30
RETRY_COUNT=0

while ! pg_isready -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" 2>/dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "[ERROR] PostgreSQL 连接超时 (${MAX_RETRIES}次重试失败)"
        echo "[INFO] 将以无数据库模式启动 (内存模式)"
        break
    fi
    echo "  等待中... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
    echo "  ✅ PostgreSQL 已就绪"
fi

# ---- 2. 初始化数据库 schema (首次启动) ----
SQL_FILE="/app/scripts/import_schema.sql"

if [ -f "$SQL_FILE" ]; then
    echo ""
    echo "[2/4] 检查数据库 schema..."

    # 检查 import_logs 表是否已存在 (判断是否首次初始化)
    TABLE_EXISTS=$(PGPASSWORD="${DB_PASSWORD:-postgres}" \
        psql -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" \
        -U "${DB_USER:-postgres}" -d "${DB_NAME:-safety_dashboard}" \
        -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='import_logs');" 2>/dev/null || echo "false")

    if [ "$TABLE_EXISTS" = "f" ] || [ -z "$TABLE_EXISTS" ]; then
        echo "  首次启动, 执行 schema 初始化..."
        PGPASSWORD="${DB_PASSWORD:-postgres}" \
            psql -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" \
            -U "${DB_USER:-postgres}" -d "${DB_NAME:-safety_dashboard}" \
            -f "$SQL_FILE" 2>&1 | tail -5
        echo "  ✅ Schema 初始化完成"
    else
        echo "  ✅ Schema 已存在, 跳过初始化"
    fi
else
    echo "[2/4] ⚠️ 未找到 SQL schema 文件: $SQL_FILE"
fi

# ---- 3. 打印环境信息 ----
echo ""
echo "[3/4] 环境信息:"
echo "  Node.js:    $(node --version)"
echo "  Python:     $(python3 --version 2>&1)"
echo "  DB Host:    ${DB_HOST:-postgres}:${DB_PORT:-5432}"
echo "  DB Name:    ${DB_NAME:-safety_dashboard}"
echo "  Server:     http://localhost:${PORT:-3000}"
echo "  Python路径: ${PYTHON_PATH:-python3}"

# 验证 Python 依赖
echo ""
echo "  Python 依赖检查:"
python3 -c "import polars; print('    polars:', polars.__version__)" 2>/dev/null || echo "    ⚠️ polars 未安装"
python3 -c "import pyarrow; print('    pyarrow:', pyarrow.__version__)" 2>/dev/null || echo "    ⚠️ pyarrow 未安装"
python3 -c "import openpyxl; print('    openpyxl:', openpyxl.__version__)" 2>/dev/null || echo "    ⚠️ openpyxl 未安装"
python3 -c "import psycopg2; print('    psycopg2: OK')" 2>/dev/null || echo "    ⚠️ psycopg2 未安装"
python3 -c "import pydantic; print('    pydantic:', pydantic.__version__)" 2>/dev/null || echo "    ⚠️ pydantic 未安装"
python3 -c "import opentelemetry; print('    opentelemetry: OK')" 2>/dev/null || echo "    ⚠️ opentelemetry 未安装"

# ---- 4. 启动 Node.js 服务 ----
echo ""
echo "[4/4] 启动 Node.js 服务..."
echo "============================================"
echo ""

exec "$@"
