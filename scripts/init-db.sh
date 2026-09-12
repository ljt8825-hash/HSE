#!/bin/bash
# ============================================================
# 宁津环卫 HSE 安全管理系统 — 数据库初始化脚本
# 用途: 首次部署时执行，创建所有表结构和初始数据
# 使用: ./init-db.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_DIR="$SCRIPT_DIR/../sql"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "==========================================="
echo "  宁津环卫 HSE 系统 - 数据库初始化"
echo "==========================================="
echo ""

# 检查 PostgreSQL 连接
check_db_connection() {
    echo -e "${YELLOW}检查数据库连接...${NC}"
    if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_DATABASE" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 数据库连接正常${NC}"
        return 0
    else
        echo -e "${RED}✗ 数据库连接失败${NC}"
        return 1
    fi
}

# 执行 SQL 文件
execute_sql() {
    local file=$1
    local desc=$2
    echo -e "${YELLOW}执行: $desc ($(basename $file))${NC}"
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_DATABASE" -f "$file" -v ON_ERROR_STOP=1 > /dev/null 2>&1; then
        echo -e "${GREEN}  ✓ 执行成功${NC}"
    else
        echo -e "${RED}  ✗ 执行失败${NC}"
        return 1
    fi
}

# 主流程
main() {
    # 从环境变量读取配置，默认值
    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-5432}"
    DB_USER="${DB_USER:-hse_user}"
    DB_DATABASE="${DB_DATABASE:-hse_db}"
    DB_PASSWORD="${DB_PASSWORD:-}"

    export PGPASSWORD="$DB_PASSWORD"

    echo "数据库主机: $DB_HOST:$DB_PORT"
    echo "数据库用户: $DB_USER"
    echo "数据库名称: $DB_DATABASE"
    echo ""

    # 检查连接
    if ! check_db_connection; then
        echo ""
        echo -e "${RED}无法连接到数据库，请检查：${NC}"
        echo "  1. PostgreSQL 服务是否启动"
        echo "  2. 连接配置是否正确 (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD)"
        echo "  3. 数据库是否已创建"
        exit 1
    fi

    echo ""
    echo "开始执行数据库迁移..."
    echo ""

    # 按顺序执行迁移脚本
    MIGRATIONS=(
        "auth_schema.sql:基础表结构"
        "migrate_rbac.sql:RBAC权限系统"
        "migrate_workflow.sql:工作流模块"
        "migrate_notifications.sql:通知系统"
        "migrate_indexes_optimization.sql:性能优化索引"
    )

    SUCCESS_COUNT=0
    FAILED_COUNT=0

    for migration in "${MIGRATIONS[@]}"; do
        file="${migration%%:*}"
        desc="${migration##*:}"
        filepath="$SQL_DIR/$file"

        if [ ! -f "$filepath" ]; then
            echo -e "${YELLOW}  ! 文件不存在，跳过: $file${NC}"
            continue
        fi

        if execute_sql "$filepath" "$desc"; then
            ((SUCCESS_COUNT++))
        else
            ((FAILED_COUNT++))
        fi
    done

    echo ""
    echo "==========================================="
    echo "  初始化完成"
    echo "==========================================="
    echo -e "  成功: ${GREEN}$SUCCESS_COUNT${NC}"
    echo -e "  失败: ${RED}$FAILED_COUNT${NC}"
    echo ""

    if [ "$FAILED_COUNT" -gt 0 ]; then
        echo -e "${RED}有迁移脚本执行失败，请检查日志${NC}"
        exit 1
    else
        echo -e "${GREEN}✓ 数据库初始化完成！${NC}"
        echo ""
        echo "初始管理员账号:"
        echo "  用户名: admin"
        echo "  密码:   admin123"
        echo ""
        echo -e "${YELLOW}⚠️  请登录后立即修改默认密码！${NC}"
    fi

    unset PGPASSWORD
}

# 交互式询问数据库密码
if [ -z "$DB_PASSWORD" ]; then
    read -sp "请输入数据库密码: " DB_PASSWORD
    echo ""
    export DB_PASSWORD
fi

main "$@"
