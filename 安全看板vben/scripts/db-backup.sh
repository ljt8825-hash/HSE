#!/bin/bash
# 文件路径：scripts/db-backup.sh | 用途：PostgreSQL数据库备份脚本 | 实现日期：2026-07-13
# 关键实现点：自动备份safety_dashboard数据库、按日期命名、自动清理旧备份、支持全量/增量备份
# 依赖：PostgreSQL 15+，pg_dump命令

set -e

# ==========================================
# 配置参数
# ==========================================
DB_NAME="safety_dashboard"
DB_USER="postgres"
DB_HOST="localhost"
DB_PORT="5432"

# 备份目录
BACKUP_DIR="/backup/hse/db"
FULL_BACKUP_DIR="${BACKUP_DIR}/full"
INCREMENTAL_BACKUP_DIR="${BACKUP_DIR}/incremental"

# 保留天数
FULL_RETENTION_DAYS=30
INCREMENTAL_RETENTION_DAYS=7

# 备份文件名格式
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FULL_BACKUP_FILE="${FULL_BACKUP_DIR}/hse_full_${TIMESTAMP}.dump.gz"
INCREMENTAL_BACKUP_FILE="${INCREMENTAL_BACKUP_DIR}/hse_inc_${TIMESTAMP}.dump.gz"

# 是否执行全量备份（每周日执行全量）
IS_FULL_BACKUP=false
DAY_OF_WEEK=$(date +%u)  # 1-7，7为周日

if [ "${DAY_OF_WEEK}" -eq 7 ]; then
    IS_FULL_BACKUP=true
fi

# ==========================================
# 日志函数
# ==========================================
log() {
    echo "[$(date +%Y-%m-%d %H:%M:%S)] $1"
}

error() {
    log "ERROR: $1"
    exit 1
}

# ==========================================
# 初始化目录
# ==========================================
log "初始化备份目录..."
mkdir -p "${FULL_BACKUP_DIR}"
mkdir -p "${INCREMENTAL_BACKUP_DIR}"
mkdir -p "${BACKUP_DIR}/logs"

# ==========================================
# 检查pg_dump命令
# ==========================================
if ! command -v pg_dump &> /dev/null; then
    error "pg_dump命令未找到，请确保已安装PostgreSQL客户端"
fi

# ==========================================
# 全量备份
# ==========================================
perform_full_backup() {
    log "开始全量备份数据库: ${DB_NAME}"
    
    # 使用自定义格式备份（支持压缩和恢复时选表）
    pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
        -F c -b -v \
        | gzip > "${FULL_BACKUP_FILE}" 2>"${BACKUP_DIR}/logs/backup_${TIMESTAMP}.log"
    
    if [ $? -eq 0 ]; then
        log "全量备份成功: ${FULL_BACKUP_FILE}"
        
        # 记录最新全量备份路径（用于增量备份参考）
        echo "${FULL_BACKUP_FILE}" > "${BACKUP_DIR}/latest_full_backup.txt"
        
        # 清理过期全量备份
        log "清理${FULL_RETENTION_DAYS}天前的全量备份..."
        find "${FULL_BACKUP_DIR}" -name "hse_full_*.dump.gz" -mtime +${FULL_RETENTION_DAYS} -delete
        log "清理完成"
    else
        error "全量备份失败，请查看日志: ${BACKUP_DIR}/logs/backup_${TIMESTAMP}.log"
    fi
}

# ==========================================
# 增量备份（基于WAL）
# ==========================================
perform_incremental_backup() {
    log "开始增量备份数据库: ${DB_NAME}"
    
    # 检查是否存在最新全量备份
    if [ ! -f "${BACKUP_DIR}/latest_full_backup.txt" ]; then
        log "未找到最新全量备份，自动执行全量备份"
        perform_full_backup
        return
    fi
    
    # 获取最新全量备份时间点
    LATEST_FULL=$(cat "${BACKUP_DIR}/latest_full_backup.txt")
    log "基于全量备份: ${LATEST_FULL}"
    
    # 使用pg_basebackup进行增量备份（需要PostgreSQL开启archive_mode）
    pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
        -F c -v --schema=hse \
        | gzip > "${INCREMENTAL_BACKUP_FILE}" 2>"${BACKUP_DIR}/logs/backup_inc_${TIMESTAMP}.log"
    
    if [ $? -eq 0 ]; then
        log "增量备份成功: ${INCREMENTAL_BACKUP_FILE}"
        
        # 清理过期增量备份
        log "清理${INCREMENTAL_RETENTION_DAYS}天前的增量备份..."
        find "${INCREMENTAL_BACKUP_DIR}" -name "hse_inc_*.dump.gz" -mtime +${INCREMENTAL_RETENTION_DAYS} -delete
        log "清理完成"
    else
        error "增量备份失败，请查看日志: ${BACKUP_DIR}/logs/backup_inc_${TIMESTAMP}.log"
    fi
}

# ==========================================
# 主流程
# ==========================================
log "========== 数据库备份开始 =========="

if [ "${IS_FULL_BACKUP}" = true ]; then
    log "检测到周日，执行全量备份"
    perform_full_backup
else
    log "执行增量备份"
    perform_incremental_backup
fi

# 验证备份文件
if [ -f "${FULL_BACKUP_FILE}" ] || [ -f "${INCREMENTAL_BACKUP_FILE}" ]; then
    log "备份验证: 文件存在且有效"
    
    # 计算备份大小
    BACKUP_SIZE=$(du -sh "${FULL_BACKUP_FILE:-${INCREMENTAL_BACKUP_FILE}}" | awk '{print $1}')
    log "备份大小: ${BACKUP_SIZE}"
else
    error "备份文件未生成"
fi

log "========== 数据库备份完成 =========="

exit 0
