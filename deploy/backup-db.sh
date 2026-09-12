#!/bin/bash
# ============================================================
# backup-db.sh — HSE 安全管理系统数据库备份脚本
# 宁津环卫 HSE 安全管理系统 v4.1
#
# 使用方式:
#   chmod +x deploy/backup-db.sh
#   ./deploy/backup-db.sh                # 执行备份
#   ./deploy/backup-db.sh --dry-run      # 预览模式（不实际执行）
#
# 配置说明:
#   - 默认备份 Docker 容器中的 PostgreSQL 数据库
#   - 备份文件保存为 gzip 压缩格式
#   - 按日期命名: hse_backup_YYYYMMDD_HHMMSS.sql.gz
#   - 自动清理 7 天前的旧备份
#   - 可配合 crontab 实现定时自动备份
#
# Crontab 定时备份（每天凌晨 2 点）:
#   0 2 * * * /path/to/deploy/backup-db.sh >> /var/log/hse-backup.log 2>&1
# ============================================================

set -euo pipefail

# ---- 颜色定义 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $(date '+%Y-%m-%d %H:%M:%S') $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*"; }
error() { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"; }

# ---- 备份配置 ----
# 数据库容器名称（与 docker-compose 中定义的 container_name 一致）
DB_CONTAINER="hse-db"

# 数据库连接参数
DB_HOST="hse-db"                  # Docker 内部服务名
DB_PORT="5432"
DB_NAME="safety_dashboard"
DB_USER="hse_app"

# 从 .env.production 读取密码（如果存在）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.production"

if [ -f "$ENV_FILE" ]; then
  DB_PASSWORD=$(grep -E "^DB_PASSWORD=" "$ENV_FILE" | head -1 | cut -d'=' -f2- || echo "")
fi

# 备份存储目录
BACKUP_DIR="$PROJECT_ROOT/backups/db"

# 备份文件保留天数
RETENTION_DAYS=7

# 备份文件名格式
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="hse_backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

# ---- 是否为预览模式 ----
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  warn "预览模式 — 不会实际执行备份操作"
fi

# ---- 横幅 ----
banner() {
  echo ""
  echo "============================================================"
  echo "  HSE 安全管理系统 — 数据库备份"
  echo "  目标: ${DB_NAME}@${DB_CONTAINER}:${DB_PORT}"
  echo "============================================================"
  echo ""
}

# ---- 步骤1: 检查 Docker 环境 ----
check_docker() {
  info "检查 Docker 环境..."

  if ! command -v docker &>/dev/null; then
    error "Docker 未安装"
    exit 1
  fi

  # 检查数据库容器是否运行
  local container_status
  container_status=$(docker inspect --format='{{.State.Status}}' "$DB_CONTAINER" 2>/dev/null || echo "not_found")

  if [ "$container_status" != "running" ]; then
    error "数据库容器 $DB_CONTAINER 未运行 (状态: ${container_status})"
    exit 1
  fi

  ok "数据库容器运行中"
}

# ---- 步骤2: 创建备份目录 ----
prepare_backup_dir() {
  if [ ! -d "$BACKUP_DIR" ]; then
    info "创建备份目录: $BACKUP_DIR"
    if [ "$DRY_RUN" = false ]; then
      mkdir -p "$BACKUP_DIR"
    fi
  fi
  ok "备份目录: $BACKUP_DIR"
}

# ---- 步骤3: 执行数据库备份 ----
do_backup() {
  info "开始备份数据库..."
  info "备份文件: $BACKUP_PATH"

  if [ "$DRY_RUN" = true ]; then
    info "[预览] 将执行: docker exec $DB_CONTAINER pg_dump ..."
    info "[预览] 输出文件: $BACKUP_PATH"
    return 0
  fi

  # 使用 docker exec 调用 pg_dump，通过管道直接压缩
  # --clean: 包含 DROP 语句（恢复时先清理）
  # --create: 包含 CREATE DATABASE 语句
  # --format=plain: 纯文本 SQL 格式
  # --no-owner: 不设置所有权（恢复时使用当前用户）
  # --no-privileges: 不导出权限
  docker exec "$DB_CONTAINER" \
    pg_dump \
      -U "$DB_USER" \
      -d "$DB_NAME" \
      -h "$DB_HOST" \
      -p "$DB_PORT" \
      --clean \
      --create \
      --no-owner \
      --no-privileges \
      --format=plain \
    | gzip > "$BACKUP_PATH"

  # 检查备份文件是否生成成功
  if [ ! -f "$BACKUP_PATH" ]; then
    error "备份文件生成失败"
    exit 1
  fi

  local file_size
  file_size=$(du -h "$BACKUP_PATH" | cut -f1)
  ok "备份完成: $BACKUP_PATH ($file_size)"
}

# ---- 步骤4: 清理旧备份 ----
cleanup_old_backups() {
  info "清理 ${RETENTION_DAYS} 天前的旧备份..."

  if [ "$DRY_RUN" = true ]; then
    info "[预览] 将删除 $RETENTION_DAYS 天前的备份文件"
    find "$BACKUP_DIR" -name "hse_backup_*.sql.gz" -mtime "+${RETENTION_DAYS}" -print 2>/dev/null || true
    return 0
  fi

  local deleted_count
  deleted_count=$(find "$BACKUP_DIR" -name "hse_backup_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete -print 2>/dev/null | wc -l)

  if [ "$deleted_count" -gt 0 ]; then
    ok "已清理 ${deleted_count} 个旧备份文件"
  else
    info "无需清理（当前无超过 ${RETENTION_DAYS} 天的备份）"
  fi
}

# ---- 步骤5: 显示备份摘要 ----
show_summary() {
  echo ""
  echo "============================================================"
  echo -e "  ${GREEN}备份完成${NC}"
  echo "============================================================"
  echo ""
  echo "  备份文件: $BACKUP_PATH"
  echo "  备份时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "  保留策略: 最近 ${RETENTION_DAYS} 天"
  echo ""

  # 列出现有备份
  echo "  现有备份列表:"
  if ls "$BACKUP_DIR"/hse_backup_*.sql.gz &>/dev/null; then
    ls -lh "$BACKUP_DIR"/hse_backup_*.sql.gz 2>/dev/null | while read -r line; do
      echo "    $line"
    done
  else
    echo "    （暂无备份文件）"
  fi

  echo ""
  echo "  恢复命令:"
  echo "    gunzip < $BACKUP_PATH | docker exec -i $DB_CONTAINER psql -U $DB_USER -d postgres"
  echo ""
  echo "============================================================"
}

# ---- 主流程 ----
main() {
  banner
  check_docker
  prepare_backup_dir
  do_backup
  cleanup_old_backups
  show_summary
}

main
