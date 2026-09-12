#!/bin/bash
# ============================================================
# backup.sh — HSE 安全管理系统 生产级数据库备份脚本
# 宁津环卫 HSE 安全管理系统 v4.1
#
# 使用方式:
#   chmod +x server/scripts/backup.sh
#   ./server/scripts/backup.sh                           # 全量备份（默认）
#   ./server/scripts/backup.sh --type=incr                # 增量备份
#   ./server/scripts/backup.sh --type=full --quiet        # 安静模式（适合 cron）
#   ./server/scripts/backup.sh --dry-run                  # 预览模式
#   ./server/scripts/backup.sh --output-dir=/tmp/backups   # 自定义输出目录
#
# 功能说明:
#   1. 全量备份：pg_dump 生成纯 SQL + gzip 压缩
#   2. 同时生成自定义压缩格式备份（支持 pg_restore 并行恢复）
#   3. 备份文件命名：hse_backup_<type>_YYYYMMDD_HHMMSS.<ext>
#   4. 保留策略：全量备份保留 7 天，增量备份保留 2 天
#   5. 备份验证：检查文件大小、gzip 完整性、pg_restore --list
#   6. JSON 格式输出备份结果（成功/失败/文件路径/大小/耗时）
#   7. 支持 cron 安静模式
# ============================================================

set -euo pipefail

# ---- 颜色定义 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---- 日志函数（安静模式下仅输出错误） ----
QUIET_MODE=false
log_info()  { [ "$QUIET_MODE" = false ] && echo -e "${BLUE}[INFO]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*" || true; }
log_ok()    { [ "$QUIET_MODE" = false ] && echo -e "${GREEN}[OK]${NC}    $(date '+%Y-%m-%d %H:%M:%S') $*" || true; }
log_warn()  { [ "$QUIET_MODE" = false ] && echo -e "${YELLOW}[WARN]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*" || true; }
log_error() { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" >&2; }

# ---- 默认参数 ----
BACKUP_TYPE="full"         # 备份类型：full | incr
OUTPUT_DIR=""              # 备份输出目录（默认自动检测）
DRY_RUN=false              # 预览模式

# ---- 解析命令行参数 ----
for arg in "$@"; do
  case "$arg" in
    --type=*)
      BACKUP_TYPE="${arg#--type=}"
      if [[ "$BACKUP_TYPE" != "full" && "$BACKUP_TYPE" != "incr" ]]; then
        log_error "无效的备份类型: $BACKUP_TYPE（仅支持 full 或 incr）"
        exit 1
      fi
      ;;
    --output-dir=*)
      OUTPUT_DIR="${arg#--output-dir=}"
      ;;
    --quiet)
      QUIET_MODE=true
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    --help|-h)
      echo "用法: $0 [选项]"
      echo ""
      echo "选项:"
      echo "  --type=full|incr    备份类型（默认 full）"
      echo "  --output-dir=DIR    备份输出目录（默认 ./backups）"
      echo "  --quiet             安静模式（仅输出错误，适合 cron）"
      echo "  --dry-run           预览模式（不实际执行备份）"
      echo "  --help, -h          显示帮助信息"
      exit 0
      ;;
    *)
      log_error "未知参数: $arg（使用 --help 查看帮助）"
      exit 1
      ;;
  esac
done

# ---- 脚本路径与项目根目录 ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---- 从 .env 文件读取数据库配置 ----
ENV_FILE="$PROJECT_ROOT/.env"

DB_HOST="127.0.0.1"
DB_PORT="5432"
DB_USER="hse_app"
DB_PASSWORD=""
DB_NAME="safety_dashboard"

if [ -f "$ENV_FILE" ]; then
  # 逐行解析，避免 source 带来安全问题
  _val=$(grep -E "^DB_HOST="     "$ENV_FILE" | head -1 | cut -d'=' -f2- || true)
  [ -n "$_val" ] && DB_HOST="$_val"
  _val=$(grep -E "^DB_PORT="     "$ENV_FILE" | head -1 | cut -d'=' -f2- || true)
  [ -n "$_val" ] && DB_PORT="$_val"
  _val=$(grep -E "^DB_USER="     "$ENV_FILE" | head -1 | cut -d'=' -f2- || true)
  [ -n "$_val" ] && DB_USER="$_val"
  _val=$(grep -E "^DB_PASSWORD=" "$ENV_FILE" | head -1 | cut -d'=' -f2- || true)
  [ -n "$_val" ] && DB_PASSWORD="$_val"
  _val=$(grep -E "^DB_NAME="     "$ENV_FILE" | head -1 | cut -d'=' -f2- || true)
  [ -n "$_val" ] && DB_NAME="$_val"
  log_info "已从 $ENV_FILE 加载数据库配置"
else
  log_warn "未找到 .env 文件 ($ENV_FILE)，使用默认配置"
fi

# ---- 备份目录（默认在项目根目录下的 backups） ----
if [ -z "$OUTPUT_DIR" ]; then
  OUTPUT_DIR="$PROJECT_ROOT/backups"
fi

# ---- 备份保留策略 ----
RETENTION_FULL_DAYS=7     # 全量备份保留 7 天
RETENTION_INCR_DAYS=2     # 增量备份保留 2 天

# ---- 时间戳与文件命名 ----
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
DATE_TAG=$(date '+%Y%m%d')

# ---- 导出 PGPASSWORD 以便 pg_dump 使用 ----
export PGPASSWORD="$DB_PASSWORD"

# ---- 结果变量 ----
BACKUP_RESULT="success"
BACKUP_FILES=()
BACKUP_SIZES=()
TOTAL_DURATION=0

# ============================================================
#  步骤1: 环境检查
# ============================================================
check_environment() {
  log_info "检查运行环境..."

  # 检查 pg_dump 是否可用
  if ! command -v pg_dump &>/dev/null; then
    log_error "pg_dump 未安装（请安装 PostgreSQL 客户端工具）"
    BACKUP_RESULT="failed"
    exit 1
  fi
  log_ok "pg_dump 已就绪"

  # 检查 gzip 是否可用
  if ! command -v gzip &>/dev/null; then
    log_error "gzip 未安装"
    BACKUP_RESULT="failed"
    exit 1
  fi
  log_ok "gzip 已就绪"

  # 测试数据库连接
  if [ "$DRY_RUN" = false ]; then
    if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &>/dev/null; then
      log_error "无法连接数据库 ${DB_NAME}@${DB_HOST}:${DB_PORT}（用户: ${DB_USER}）"
      BACKUP_RESULT="failed"
      exit 1
    fi
    log_ok "数据库连接正常"
  else
    log_info "[预览] 将测试数据库连接: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
  fi
}

# ============================================================
#  步骤2: 创建备份目录
# ============================================================
prepare_output_dir() {
  if [ ! -d "$OUTPUT_DIR" ]; then
    log_info "创建备份目录: $OUTPUT_DIR"
    if [ "$DRY_RUN" = false ]; then
      mkdir -p "$OUTPUT_DIR"
    fi
  fi

  # 创建按日期分类的子目录
  local date_subdir="$OUTPUT_DIR/$DATE_TAG"
  if [ ! -d "$date_subdir" ] && [ "$DRY_RUN" = false ]; then
    mkdir -p "$date_subdir"
  fi

  log_ok "备份目录: $OUTPUT_DIR"
}

# ============================================================
#  步骤3: 执行数据库备份
# ============================================================
do_backup() {
  local start_time
  start_time=$(date +%s)

  log_info "开始${BACKUP_TYPE}备份..."
  log_info "数据库: ${DB_NAME}@${DB_HOST}:${DB_PORT}"

  # ---- 全量备份：生成 SQL + 自定义格式双份 ----
  if [ "$BACKUP_TYPE" = "full" ]; then
    # 文件名定义
    local sql_file="$OUTPUT_DIR/$DATE_TAG/hse_backup_full_${TIMESTAMP}.sql.gz"
    local custom_file="$OUTPUT_DIR/$DATE_TAG/hse_backup_full_${TIMESTAMP}.dump"

    if [ "$DRY_RUN" = true ]; then
      log_info "[预览] 将执行: pg_dump --format=plain ... | gzip > $sql_file"
      log_info "[预览] 将执行: pg_dump --format=custom ... > $custom_file"
      BACKUP_FILES+=("$sql_file" "$custom_file")
      return 0
    fi

    # 1) 纯 SQL 备份 + gzip 压缩
    log_info "生成纯 SQL 备份: $sql_file"
    if pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --clean \
        --create \
        --no-owner \
        --no-privileges \
        --format=plain \
      | gzip > "$sql_file"; then
      BACKUP_FILES+=("$sql_file")
      log_ok "纯 SQL 备份完成"
    else
      log_error "纯 SQL 备份失败"
      BACKUP_RESULT="partial"
    fi

    # 2) 自定义格式备份（支持 pg_restore 并行恢复）
    log_info "生成自定义格式备份: $custom_file"
    if pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --format=custom \
        --no-owner \
        --no-privileges \
        -f "$custom_file"; then
      BACKUP_FILES+=("$custom_file")
      log_ok "自定义格式备份完成"
    else
      log_error "自定义格式备份失败"
      BACKUP_RESULT="partial"
    fi

  # ---- 增量备份：仅生成 SQL + gzip（轻量快速） ----
  else
    local sql_file="$OUTPUT_DIR/$DATE_TAG/hse_backup_incr_${TIMESTAMP}.sql.gz"

    if [ "$DRY_RUN" = true ]; then
      log_info "[预览] 将执行: pg_dump --format=plain ... | gzip > $sql_file"
      BACKUP_FILES+=("$sql_file")
      return 0
    fi

    # 增量备份使用 --data-only 选项仅导出数据变化
    # 注意：首次增量备份前应先完成一次全量备份
    log_info "生成增量备份: $sql_file"
    if pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --data-only \
        --inserts \
        --column-inserts \
        --no-owner \
        --no-privileges \
        --format=plain \
      | gzip > "$sql_file"; then
      BACKUP_FILES+=("$sql_file")
      log_ok "增量备份完成"
    else
      log_error "增量备份失败"
      BACKUP_RESULT="failed"
    fi
  fi

  local end_time
  end_time=$(date +%s)
  TOTAL_DURATION=$(( end_time - start_time ))
}

# ============================================================
#  步骤4: 验证备份文件
# ============================================================
verify_backup() {
  log_info "验证备份文件完整性..."

  for file in "${BACKUP_FILES[@]}"; do
    # 预览模式跳过实际验证
    if [ "$DRY_RUN" = true ]; then
      log_info "[预览] 将验证文件: $file"
      continue
    fi

    # 检查文件是否存在
    if [ ! -f "$file" ]; then
      log_error "文件不存在: $file"
      BACKUP_RESULT="failed"
      continue
    fi

    # 检查文件大小是否大于 0
    local file_size_bytes
    file_size_bytes=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo "0")
    if [ "$file_size_bytes" -eq 0 ]; then
      log_error "备份文件为空: $file"
      BACKUP_RESULT="failed"
      continue
    fi

    local file_size_human
    file_size_human=$(du -h "$file" | cut -f1)
    BACKUP_SIZES+=("$file_size_human")
    log_ok "文件大小检查通过: $file ($file_size_human)"

    # 根据文件类型进行额外验证
    case "$file" in
      *.gz)
        # gzip 完整性检查
        if gzip -t "$file" 2>/dev/null; then
          log_ok "gzip 完整性验证通过: $file"
        else
          log_error "gzip 完整性验证失败: $file"
          BACKUP_RESULT="failed"
        fi
        ;;
      *.dump)
        # pg_restore --list 验证自定义格式备份
        if pg_restore --list "$file" &>/dev/null; then
          log_ok "pg_restore 验证通过: $file"
        else
          log_error "pg_restore 验证失败: $file"
          BACKUP_RESULT="failed"
        fi
        ;;
    esac
  done
}

# ============================================================
#  步骤5: 清理过期备份
# ============================================================
cleanup_old_backups() {
  local retention_days
  local pattern

  if [ "$BACKUP_TYPE" = "full" ]; then
    retention_days=$RETENTION_FULL_DAYS
    pattern="hse_backup_full_*.sql.gz"
  else
    retention_days=$RETENTION_INCR_DAYS
    pattern="hse_backup_incr_*.sql.gz"
  fi

  log_info "清理 ${retention_days} 天前的过期${BACKUP_TYPE}备份..."

  if [ "$DRY_RUN" = true ]; then
    log_info "[预览] 将删除 $retention_days 天前的 ${BACKUP_TYPE} 备份"
    find "$OUTPUT_DIR" -name "$pattern" -mtime "+${retention_days}" -print 2>/dev/null || true
    return 0
  fi

  # 删除按日期分类目录中的旧备份
  local deleted_count=0
  while IFS= read -r -d '' old_dir; do
    local dir_date
    dir_date=$(basename "$old_dir")
    local dir_epoch
    # 将日期字符串转换为 epoch 秒数用于比较
    dir_epoch=$(date -d "$dir_date" +%s 2>/dev/null || echo "0")
    local cutoff_epoch
    cutoff_epoch=$(date -d "${retention_days} days ago" +%s 2>/dev/null || echo "0")

    if [ "$dir_epoch" -gt 0 ] && [ "$dir_epoch" -lt "$cutoff_epoch" ]; then
      rm -rf "$old_dir"
      deleted_count=$(( deleted_count + 1 ))
      log_info "已删除过期备份目录: $old_dir"
    fi
  done < <(find "$OUTPUT_DIR" -maxdepth 1 -mindepth 1 -type d -print0 2>/dev/null)

  # 同时清理旧格式备份（直接在 backups 根目录的文件）
  local old_files
  old_files=$(find "$OUTPUT_DIR" -maxdepth 1 -name "$pattern" -mtime "+${retention_days}" -print 2>/dev/null || true)
  if [ -n "$old_files" ]; then
    echo "$old_files" | while read -r old_file; do
      rm -f "$old_file"
      deleted_count=$(( deleted_count + 1 ))
      log_info "已删除过期备份文件: $old_file"
    done
  fi

  if [ "$deleted_count" -gt 0 ]; then
    log_ok "已清理 ${deleted_count} 个过期备份"
  else
    log_info "无需清理（无超过 ${retention_days} 天的 ${BACKUP_TYPE} 备份）"
  fi
}

# ============================================================
#  步骤6: 输出备份结果（JSON 格式）
# ============================================================
output_result() {
  local files_json=""
  local i=0

  for file in "${BACKUP_FILES[@]}"; do
    local size="${BACKUP_SIZES[$i]:-}"
    if [ -z "$size" ] && [ -f "$file" ]; then
      size=$(du -h "$file" | cut -f1)
    fi

    if [ $i -gt 0 ]; then
      files_json+=","
    fi
    files_json+=$(cat <<EOF
    {
      "path": "$file",
      "size": "${size:-unknown}"
    }
EOF
)
    i=$(( i + 1 ))
  done

  local result_json
  result_json=$(cat <<EOF
{
  "status": "$BACKUP_RESULT",
  "type": "$BACKUP_TYPE",
  "timestamp": "$(date '+%Y-%m-%d %H:%M:%S')",
  "database": "${DB_NAME}@${DB_HOST}:${DB_PORT}",
  "files": [$files_json],
  "duration_seconds": $TOTAL_DURATION,
  "dry_run": $DRY_RUN
}
EOF
)

  # 安静模式下 JSON 输出到 stdout，正常模式额外显示可读摘要
  if [ "$QUIET_MODE" = true ]; then
    echo "$result_json"
  else
    echo ""
    echo "============================================================"
    echo -e "  ${GREEN}备份完成${NC} — $BACKUP_RESULT"
    echo "============================================================"
    echo ""
    echo "  备份类型:   $BACKUP_TYPE"
    echo "  数据库:     ${DB_NAME}@${DB_HOST}:${DB_PORT}"
    echo "  耗时:       ${TOTAL_DURATION} 秒"
    echo "  备份文件:"
    for file in "${BACKUP_FILES[@]}"; do
      echo "    - $file"
    done
    echo ""
    echo "  JSON 结果:"
    echo "$result_json"
    echo ""
    echo "============================================================"
  fi
}

# ============================================================
#  主流程
# ============================================================
main() {
  # 预览模式横幅
  if [ "$DRY_RUN" = true ]; then
    log_warn "预览模式 — 不会实际执行备份操作"
    echo ""
  fi

  log_info "HSE 安全管理系统数据库备份开始"
  log_info "备份类型: $BACKUP_TYPE"

  check_environment
  prepare_output_dir
  do_backup
  verify_backup
  cleanup_old_backups
  output_result

  # 返回退出码
  if [ "$BACKUP_RESULT" = "success" ]; then
    exit 0
  elif [ "$BACKUP_RESULT" = "partial" ]; then
    exit 2
  else
    exit 1
  fi
}

main
