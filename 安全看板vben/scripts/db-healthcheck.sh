#!/bin/bash
# 文件路径：scripts/db-healthcheck.sh | 用途：PostgreSQL数据库健康检查脚本 | 实现日期：2026-07-13
# 关键实现点：检查数据库连接、表结构完整性、索引状态、查询性能、磁盘空间、备份状态
# 依赖：PostgreSQL 15+，psql命令

set -e

# ==========================================
# 配置参数
# ==========================================
DB_NAME="safety_dashboard"
DB_USER="postgres"
DB_HOST="localhost"
DB_PORT="5432"

# 告警阈值
MAX_CONNECTIONS_THRESHOLD=80        # 最大连接数百分比
MAX_CPU_THRESHOLD=80                # CPU使用率百分比
MAX_DISK_THRESHOLD=80               # 磁盘使用率百分比
MAX_QUERY_TIME_THRESHOLD=500        # 查询时间阈值（毫秒）
BACKUP_STALE_HOURS=24               # 备份过期时间（小时）

# ==========================================
# 日志函数
# ==========================================
log() {
    echo "[$(date +%Y-%m-%d %H:%M:%S)] $1"
}

log_ok() {
    log "✓ $1"
}

log_warn() {
    log "⚠ $1"
}

log_error() {
    log "✗ $1"
}

# ==========================================
# 检查结果统计
# ==========================================
OK_COUNT=0
WARN_COUNT=0
ERROR_COUNT=0

# ==========================================
# 检查数据库连接
# ==========================================
check_connection() {
    log "检查数据库连接..."
    
    if psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1" > /dev/null 2>&1; then
        log_ok "数据库连接正常"
        ((OK_COUNT++))
    else
        log_error "数据库连接失败"
        ((ERROR_COUNT++))
    fi
}

# ==========================================
# 检查数据库版本
# ==========================================
check_version() {
    log "检查数据库版本..."
    
    VERSION=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT version()" | head -1 | awk '{print $2}')
    log_ok "PostgreSQL版本: ${VERSION}"
    ((OK_COUNT++))
}

# ==========================================
# 检查连接数
# ==========================================
check_connections() {
    log "检查连接数..."
    
    CURRENT=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname='${DB_NAME}'" | tr -d ' ')
    MAX=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SHOW max_connections" | tr -d ' ')
    
    PERCENT=$((CURRENT * 100 / MAX))
    log "当前连接数: ${CURRENT}/${MAX} (${PERCENT}%)"
    
    if [ "${PERCENT}" -lt "${MAX_CONNECTIONS_THRESHOLD}" ]; then
        log_ok "连接数正常"
        ((OK_COUNT++))
    else
        log_warn "连接数偏高"
        ((WARN_COUNT++))
    fi
}

# ==========================================
# 检查表结构完整性
# ==========================================
check_tables() {
    log "检查表结构完整性..."
    
    EXPECTED_TABLES=("hse_users" "hse_roles" "hse_permissions" "hse_menus" "hse_alerts" "hse_workflow_definitions" "hse_workflow_instances" "hse_workflow_tasks" "hse_audit_logs" "hse_notifications" "hse_file_records" "hse_hazards" "hse_accidents" "hse_system_configs")
    
    for TABLE in "${EXPECTED_TABLES[@]}"; do
        if psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='${TABLE}' AND table_schema='hse')" | grep -q "t"; then
            log_ok "表 ${TABLE} 存在"
            ((OK_COUNT++))
        else
            log_error "表 ${TABLE} 不存在"
            ((ERROR_COUNT++))
        fi
    done
}

# ==========================================
# 检查索引状态
# ==========================================
check_indexes() {
    log "检查索引状态..."
    
    INVALID_INDEXES=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT indexrelname FROM pg_indexes WHERE schemaname='hse' AND NOT EXISTS(SELECT 1 FROM pg_stat_user_indexes WHERE pg_stat_user_indexes.indexrelname = pg_indexes.indexrelname)" | grep -v "^$")
    
    if [ -z "${INVALID_INDEXES}" ]; then
        log_ok "所有索引状态正常"
        ((OK_COUNT++))
    else
        log_warn "存在无效索引:"
        echo "${INVALID_INDEXES}" | while read -r idx; do
            log_warn "  - ${idx}"
        done
        ((WARN_COUNT++))
    fi
}

# ==========================================
# 检查查询性能
# ==========================================
check_query_performance() {
    log "检查查询性能..."
    
    QUERY_TIME=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "EXPLAIN ANALYZE SELECT count(*) FROM hse.hse_alerts WHERE status='pending'" 2>&1 | grep "Execution Time" | awk '{print $3}' | cut -d. -f1)
    
    if [ -n "${QUERY_TIME}" ]; then
        log "查询执行时间: ${QUERY_TIME}ms"
        
        if [ "${QUERY_TIME}" -lt "${MAX_QUERY_TIME_THRESHOLD}" ]; then
            log_ok "查询性能正常"
            ((OK_COUNT++))
        else
            log_warn "查询性能较慢"
            ((WARN_COUNT++))
        fi
    else
        log_warn "无法获取查询时间"
        ((WARN_COUNT++))
    fi
}

# ==========================================
# 检查磁盘空间
# ==========================================
check_disk_space() {
    log "检查磁盘空间..."
    
    DISK_USAGE=$(df -h / | tail -1 | awk '{print $5}' | cut -d'%' -f1)
    log "磁盘使用率: ${DISK_USAGE}%"
    
    if [ "${DISK_USAGE}" -lt "${MAX_DISK_THRESHOLD}" ]; then
        log_ok "磁盘空间充足"
        ((OK_COUNT++))
    else
        log_warn "磁盘空间紧张"
        ((WARN_COUNT++))
    fi
}

# ==========================================
# 检查备份状态
# ==========================================
check_backup() {
    log "检查备份状态..."
    
    BACKUP_DIR="/backup/hse/db"
    LATEST_BACKUP=$(find "${BACKUP_DIR}" -name "*.dump.gz" -type f -printf '%T@ %p\n' | sort -n | tail -1 | awk '{print $2}')
    
    if [ -n "${LATEST_BACKUP}" ]; then
        BACKUP_TIME=$(stat -c "%Y" "${LATEST_BACKUP}")
        CURRENT_TIME=$(date +%s)
        AGE_HOURS=$(( (CURRENT_TIME - BACKUP_TIME) / 3600 ))
        
        log "最新备份: ${LATEST_BACKUP}"
        log "备份时间: ${AGE_HOURS}小时前"
        
        if [ "${AGE_HOURS}" -lt "${BACKUP_STALE_HOURS}" ]; then
            log_ok "备份状态正常"
            ((OK_COUNT++))
        else
            log_warn "备份已过期（${AGE_HOURS}小时）"
            ((WARN_COUNT++))
        fi
    else
        log_error "未找到备份文件"
        ((ERROR_COUNT++))
    fi
}

# ==========================================
# 检查慢查询
# ==========================================
check_slow_queries() {
    log "检查慢查询..."
    
    SLOW_QUERIES=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT queryid, query, total_time FROM pg_stat_statements WHERE total_time > 5000 ORDER BY total_time DESC LIMIT 5" 2>/dev/null | grep -v "^$")
    
    if [ -z "${SLOW_QUERIES}" ]; then
        log_ok "无慢查询"
        ((OK_COUNT++))
    else
        log_warn "存在慢查询:"
        echo "${SLOW_QUERIES}" | while read -r line; do
            log_warn "  ${line}"
        done
        ((WARN_COUNT++))
    fi
}

# ==========================================
# 检查数据库锁
# ==========================================
check_locks() {
    log "检查数据库锁..."
    
    BLOCKING_LOCKS=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT count(*) FROM pg_locks WHERE NOT granted AND pid IS NOT NULL" | tr -d ' ')
    
    log "阻塞锁数量: ${BLOCKING_LOCKS}"
    
    if [ "${BLOCKING_LOCKS}" -eq 0 ]; then
        log_ok "无阻塞锁"
        ((OK_COUNT++))
    else
        log_warn "存在 ${BLOCKING_LOCKS} 个阻塞锁"
        ((WARN_COUNT++))
    fi
}

# ==========================================
# 主流程
# ==========================================
log "========== 数据库健康检查开始 =========="

check_connection
check_version
check_connections
check_tables
check_indexes
check_query_performance
check_disk_space
check_backup
check_slow_queries
check_locks

# ==========================================
# 输出汇总
# ==========================================
log "========== 健康检查汇总 =========="
log "通过: ${OK_COUNT}"
log "警告: ${WARN_COUNT}"
log "错误: ${ERROR_COUNT}"

if [ "${ERROR_COUNT}" -eq 0 ]; then
    log "数据库健康状态: ✓ 正常"
    exit 0
elif [ "${WARN_COUNT}" -gt 0 ] && [ "${ERROR_COUNT}" -eq 0 ]; then
    log "数据库健康状态: ⚠ 存在警告"
    exit 1
else
    log "数据库健康状态: ✗ 存在错误"
    exit 2
fi
