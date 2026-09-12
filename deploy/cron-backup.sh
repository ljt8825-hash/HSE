#!/bin/bash
# ============================================================
# cron-backup.sh — HSE 安全管理系统 Docker 环境定时备份
# 宁津环卫 HSE 安全管理系统 v4.1
#
# 使用方式:
#   chmod +x deploy/cron-backup.sh
#   ./deploy/cron-backup.sh                          # 显示使用帮助
#   ./deploy/cron-backup.sh exec                     # 方案一：docker exec 备份
#   ./deploy/cron-backup.sh run                      # 方案二：docker compose run 备份
#   ./deploy/cron-backup.sh setup-cron               # 设置宿主机 crontab
#
# 方案一（docker exec）:
#   通过 docker exec 在运行中的 PostgreSQL 容器内执行 pg_dump
#   优点：简单直接，不需要额外容器
#   缺点：需要在宿主机安装 gzip 等工具
#
# 方案二（docker compose run，推荐）:
#   使用独立的 backup 容器执行备份
#   优点：环境隔离，依赖清晰，可复用
#   缺点：需要额外的 Docker 镜像
#
# Crontab 配置示例:
#   0 3 * * * /path/to/deploy/cron-backup.sh run >> /var/log/hse-backup.log 2>&1
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
error() { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" >&2; }

# ---- 配置 ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$SCRIPT_DIR"

# Docker 配置
DB_CONTAINER="hse-db"
DB_NAME="safety_dashboard"
DB_USER="hse_app"
DB_PORT="5432"

# 备份配置
BACKUP_DIR="$PROJECT_ROOT/backups/db"
RETENTION_DAYS=7
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.production.yml"

# ============================================================
#  方案一：docker exec 备份
# ============================================================
backup_via_docker_exec() {
  info "使用 docker exec 方式备份数据库..."

  # 检查 Docker
  if ! command -v docker &>/dev/null; then
    error "Docker 未安装"
    exit 1
  fi

  # 检查容器是否运行
  local container_status
  container_status=$(docker inspect --format='{{.State.Status}}' "$DB_CONTAINER" 2>/dev/null || echo "not_found")
  if [ "$container_status" != "running" ]; then
    error "数据库容器 $DB_CONTAINER 未运行（状态: ${container_status}）"
    exit 1
  fi
  ok "数据库容器运行中"

  # 创建备份目录
  mkdir -p "$BACKUP_DIR"
  local backup_file="$BACKUP_DIR/hse_backup_full_${TIMESTAMP}.sql.gz"

  # 读取数据库密码
  local db_password=""
  local env_file="$PROJECT_ROOT/.env.production"
  if [ -f "$env_file" ]; then
    db_password=$(grep -E "^DB_PASSWORD=" "$env_file" | head -1 | cut -d'=' -f2- || echo "")
  elif [ -f "$PROJECT_ROOT/.env" ]; then
    db_password=$(grep -E "^DB_PASSWORD=" "$PROJECT_ROOT/.env" | head -1 | cut -d'=' -f2- || echo "")
  fi

  # 执行备份（通过 docker exec + pg_dump + 管道压缩）
  info "开始备份: $backup_file"
  if [ -n "$db_password" ]; then
    docker exec -e PGPASSWORD="$db_password" "$DB_CONTAINER" \
      pg_dump \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -h localhost \
        -p "$DB_PORT" \
        --clean \
        --create \
        --no-owner \
        --no-privileges \
        --format=plain \
    | gzip > "$backup_file"
  else
    docker exec "$DB_CONTAINER" \
      pg_dump \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -h localhost \
        -p "$DB_PORT" \
        --clean \
        --create \
        --no-owner \
        --no-privileges \
        --format=plain \
    | gzip > "$backup_file"
  fi

  # 验证备份
  if [ -f "$backup_file" ] && [ "$(stat -c%s "$backup_file" 2>/dev/null || stat -f%z "$backup_file" 2>/dev/null || echo "0")" -gt 0 ]; then
    ok "备份完成: $backup_file ($(du -h "$backup_file" | cut -f1))"
  else
    error "备份失败或文件为空"
    exit 1
  fi

  # 清理旧备份
  local deleted
  deleted=$(find "$BACKUP_DIR" -name "hse_backup_full_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete -print 2>/dev/null | wc -l)
  if [ "$deleted" -gt 0 ]; then
    ok "已清理 ${deleted} 个旧备份"
  fi

  # 输出 JSON 结果
  local file_size
  file_size=$(du -h "$backup_file" | cut -f1)
  echo "{\"status\":\"success\",\"method\":\"docker-exec\",\"file\":\"$backup_file\",\"size\":\"$file_size\",\"timestamp\":\"$(date '+%Y-%m-%d %H:%M:%S')\"}"
}

# ============================================================
#  方案二：docker compose run 备份（推荐）
# ============================================================
backup_via_compose_run() {
  info "使用 docker compose run 方式备份数据库..."

  # 检查 docker compose
  if ! docker compose version &>/dev/null; then
    error "docker compose 未安装"
    exit 1
  fi

  # 检查 compose 文件
  if [ ! -f "$COMPOSE_FILE" ]; then
    error "Docker Compose 文件不存在: $COMPOSE_FILE"
    exit 1
  fi

  # 创建备份目录
  mkdir -p "$BACKUP_DIR"

  info "执行 docker compose run backup..."
  docker compose -f "$COMPOSE_FILE" --profile backup run --rm backup

  # 验证备份文件是否生成
  local latest_backup
  latest_backup=$(ls -t "$BACKUP_DIR"/hse_backup_*_${TIMESTAMP}.dump 2>/dev/null | head -1 || true)
  if [ -z "$latest_backup" ]; then
    latest_backup=$(ls -t "$BACKUP_DIR"/*.dump 2>/dev/null | head -1 || true)
  fi

  if [ -n "$latest_backup" ]; then
    ok "备份完成: $latest_backup ($(du -h "$latest_backup" | cut -f1))"
  else
    warn "未找到备份文件（请检查 backup 服务日志）"
  fi
}

# ============================================================
#  设置宿主机 crontab
# ============================================================
setup_cron() {
  info "设置宿主机 crontab 定时备份任务..."

  local script_path
  script_path="$(cd "$SCRIPT_DIR" && pwd)/cron-backup.sh"
  local log_dir="$PROJECT_ROOT/logs"
  mkdir -p "$log_dir"

  # crontab 条目
  local cron_entry="0 3 * * * ${script_path} run >> ${log_dir}/backup.log 2>&1"

  info "将添加以下 crontab 条目:"
  echo "  $cron_entry"
  echo ""
  echo "如果需要修改备份时间或日志路径，请手动编辑 crontab（crontab -e）"

  # 检查是否已存在相同条目
  if crontab -l 2>/dev/null | grep -qF "$script_path"; then
    warn "crontab 中已存在相同条目，跳过添加"
  else
    # 追加到当前 crontab
    (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
    ok "crontab 条目已添加"
  fi

  info "提示: 可通过以下命令查看当前 crontab:"
  echo "  crontab -l"
}

# ============================================================
#  主入口
# ============================================================
case "${1:-help}" in
  exec)
    backup_via_docker_exec
    ;;
  run)
    backup_via_compose_run
    ;;
  setup-cron)
    setup_cron
    ;;
  help|--help|-h|"")
    echo ""
    echo "HSE 安全管理系统 — Docker 定时备份工具"
    echo ""
    echo "用法: $0 <命令>"
    echo ""
    echo "命令:"
    echo "  exec          方案一：通过 docker exec 在运行中的容器内执行 pg_dump"
    echo "  run           方案二（推荐）：通过 docker compose run 启动独立备份容器"
    echo "  setup-cron    设置宿主机 crontab 定时任务"
    echo "  help          显示此帮助信息"
    echo ""
    echo "推荐方案: 使用 'run' 命令（独立 backup 容器）"
    echo ""
    echo "Crontab 示例:"
    echo "  0 3 * * * $0 run >> /var/log/hse-backup.log 2>&1"
    echo "  0 3 * * * $0 exec >> /var/log/hse-backup.log 2>&1"
    echo ""
    ;;
  *)
    error "未知命令: ${1}"
    echo "使用 '$0 help' 查看帮助"
    exit 1
    ;;
esac
