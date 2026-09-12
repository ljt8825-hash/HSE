#!/bin/bash
# ============================================================
# restore.sh — HSE 安全管理系统 数据库恢复脚本
# 宁津环卫 HSE 安全管理系统 v4.1
#
# 使用方式:
#   chmod +x server/scripts/restore.sh
#   ./server/scripts/restore.sh --file=backups/20260710/hse_backup_full_20260710_030000.sql.gz
#   ./server/scripts/restore.sh --file=backup.sql.gz --target-db=test_restore --verify
#   ./server/scripts/restore.sh --file=backup.dump --dry-run
#
# 功能说明:
#   1. 从 .sql.gz 或 .dump 备份文件恢复数据库
#   2. 恢复前自动创建目标数据库的当前备份（回滚保障）
#   3. 恢复前验证备份文件完整性
#   4. 支持 --target-db 指定恢复到不同数据库（安全测试恢复）
#   5. 恢复后数据完整性检查（表计数对比）
#   6. 恢复结果 JSON 输出
#
# 安全警告:
#   - 恢复操作会覆盖目标数据库中的现有数据
#   - 建议先使用 --target-db 恢复到测试库验证
#   - 生产环境恢复前请确保已通知相关人员
# ============================================================

set -euo pipefail

# ---- 颜色定义 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---- 日志函数 ----
log_info()  { echo -e "${BLUE}[INFO]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" >&2; }

# ---- 默认参数 ----
BACKUP_FILE=""             # 备份文件路径（必需）
TARGET_DB=""               # 目标数据库名（默认从 .env 读取）
VERIFY_AFTER=false         # 恢复后验证数据完整性
DRY_RUN=false              # 预览模式
AUTO_PRE_BACKUP=true       # 恢复前自动备份

# ---- 解析命令行参数 ----
for arg in "$@"; do
  case "$arg" in
    --file=*)
      BACKUP_FILE="${arg#--file=}"
      ;;
    --target-db=*)
      TARGET_DB="${arg#--target-db=}"
      ;;
    --verify)
      VERIFY_AFTER=true
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    --no-pre-backup)
      AUTO_PRE_BACKUP=false
      ;;
    --help|-h)
      echo "用法: $0 --file=备份文件路径 [选项]"
      echo ""
      echo "必需参数:"
      echo "  --file=PATH           备份文件路径（.sql.gz 或 .dump）"
      echo ""
      echo "可选参数:"
      echo "  --target-db=NAME      恢复到指定数据库（默认从 .env 读取 DB_NAME）"
      echo "  --verify              恢复后验证数据完整性（表计数对比）"
      echo "  --dry-run             预览模式（不实际执行恢复）"
      echo "  --no-pre-backup       禁用恢复前自动备份"
      echo "  --help, -h            显示帮助信息"
      echo ""
      echo "示例:"
      echo "  $0 --file=backups/hse_backup_full_20260710_030000.sql.gz"
      echo "  $0 --file=backups/hse_backup_full_20260710_030000.sql.gz --target-db=test_db --verify"
      exit 0
      ;;
    *)
      log_error "未知参数: $arg（使用 --help 查看帮助）"
      exit 1
      ;;
  esac
done

# ---- 验证必需参数 ----
if [ -z "$BACKUP_FILE" ]; then
  log_error "缺少必需参数 --file（请指定备份文件路径）"
  echo "使用 --help 查看帮助信息"
  exit 1
fi

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

# 如果未指定目标数据库，使用 .env 中的默认值
if [ -z "$TARGET_DB" ]; then
  TARGET_DB="$DB_NAME"
fi

# ---- 导出 PGPASSWORD ----
export PGPASSWORD="$DB_PASSWORD"

# ---- 结果变量 ----
RESTORE_RESULT="success"
RESTORE_DURATION=0
PRE_BACKUP_FILE=""
TABLE_COUNT_BEFORE=0
TABLE_COUNT_AFTER=0

# ============================================================
#  步骤1: 环境检查
# ============================================================
check_environment() {
  log_info "检查运行环境..."

  # 检查备份文件是否存在
  if [ ! -f "$BACKUP_FILE" ]; then
    log_error "备份文件不存在: $BACKUP_FILE"
    RESTORE_RESULT="failed"
    exit 1
  fi
  log_ok "备份文件存在: $BACKUP_FILE"

  # 检查文件大小
  local file_size_bytes
  file_size_bytes=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null || echo "0")
  if [ "$file_size_bytes" -eq 0 ]; then
    log_error "备份文件为空: $BACKUP_FILE"
    RESTORE_RESULT="failed"
    exit 1
  fi
  log_ok "备份文件大小: $(du -h "$BACKUP_FILE" | cut -f1)"

  # 检查 psql/pg_restore 是否可用
  case "$BACKUP_FILE" in
    *.dump)
      if ! command -v pg_restore &>/dev/null; then
        log_error "pg_restore 未安装（恢复 .dump 文件需要 pg_restore）"
        RESTORE_RESULT="failed"
        exit 1
      fi
      log_ok "pg_restore 已就绪"
      ;;
    *.sql.gz|*.sql)
      if ! command -v psql &>/dev/null; then
        log_error "psql 未安装（恢复 SQL 文件需要 psql）"
        RESTORE_RESULT="failed"
        exit 1
      fi
      log_ok "psql 已就绪"
      ;;
    *)
      log_error "不支持的备份文件格式: $BACKUP_FILE（支持 .sql.gz、.sql、.dump）"
      RESTORE_RESULT="failed"
      exit 1
      ;;
  esac

  # 检查 gzip（如果需要）
  case "$BACKUP_FILE" in
    *.gz)
      if ! command -v gzip &>/dev/null; then
        log_error "gzip 未安装（解压 .gz 文件需要 gzip）"
        RESTORE_RESULT="failed"
        exit 1
      fi
      ;;
  esac

  # 测试数据库连接
  if [ "$DRY_RUN" = false ]; then
    if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1;" &>/dev/null; then
      log_error "无法连接数据库服务器 ${DB_HOST}:${DB_PORT}"
      RESTORE_RESULT="failed"
      exit 1
    fi
    log_ok "数据库服务器连接正常"
  else
    log_info "[预览] 将测试数据库连接: ${DB_HOST}:${DB_PORT}"
  fi
}

# ============================================================
#  步骤2: 验证备份文件完整性
# ============================================================
verify_backup_file() {
  log_info "验证备份文件完整性..."

  case "$BACKUP_FILE" in
    *.sql.gz)
      if [ "$DRY_RUN" = false ]; then
        if gzip -t "$BACKUP_FILE" 2>/dev/null; then
          log_ok "gzip 完整性验证通过"
        else
          log_error "gzip 完整性验证失败（文件可能已损坏）"
          RESTORE_RESULT="failed"
          exit 1
        fi
      else
        log_info "[预览] 将执行: gzip -t $BACKUP_FILE"
      fi
      ;;
    *.dump)
      if [ "$DRY_RUN" = false ]; then
        if pg_restore --list "$BACKUP_FILE" &>/dev/null; then
          log_ok "pg_restore 验证通过"
        else
          log_error "pg_restore 验证失败（文件可能已损坏）"
          RESTORE_RESULT="failed"
          exit 1
        fi
      else
        log_info "[预览] 将执行: pg_restore --list $BACKUP_FILE"
      fi
      ;;
    *.sql)
      log_ok "纯 SQL 文件，无需额外完整性验证"
      ;;
  esac
}

# ============================================================
#  步骤3: 恢复前自动备份（回滚保障）
# ============================================================
pre_restore_backup() {
  if [ "$AUTO_PRE_BACKUP" = false ]; then
    log_warn "已跳过恢复前自动备份（--no-pre-backup）"
    return 0
  fi

  log_info "创建恢复前备份（回滚保障）..."

  # 检查目标数据库是否存在
  local db_exists
  if [ "$DRY_RUN" = false ]; then
    db_exists=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB';" 2>/dev/null || echo "")
  else
    db_exists="1"  # 预览模式假设存在
  fi

  if [ -z "$db_exists" ]; then
    log_warn "目标数据库 $TARGET_DB 不存在，跳过恢复前备份"
    return 0
  fi

  # 记录恢复前表计数（用于后续验证）
  if [ "$VERIFY_AFTER" = true ] && [ "$DRY_RUN" = false ]; then
    TABLE_COUNT_BEFORE=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" -tAc \
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || echo "0")
    log_info "恢复前表计数: $TABLE_COUNT_BEFORE"
  fi

  # 创建恢复前备份
  local pre_backup_dir="$PROJECT_ROOT/backups/pre-restore"
  local pre_backup_file="${pre_backup_dir}/pre_restore_${TARGET_DB}_$(date '+%Y%m%d_%H%M%S').sql.gz"

  if [ "$DRY_RUN" = true ]; then
    log_info "[预览] 将创建恢复前备份: $pre_backup_file"
    PRE_BACKUP_FILE="$pre_backup_file"
    return 0
  fi

  mkdir -p "$pre_backup_dir"

  if pg_dump \
      -h "$DB_HOST" \
      -p "$DB_PORT" \
      -U "$DB_USER" \
      -d "$TARGET_DB" \
      --clean \
      --no-owner \
      --no-privileges \
      --format=plain \
    | gzip > "$pre_backup_file"; then
    PRE_BACKUP_FILE="$pre_backup_file"
    log_ok "恢复前备份已创建: $pre_backup_file ($(du -h "$pre_backup_file" | cut -f1))"
  else
    log_error "恢复前备份创建失败，中止恢复操作"
    RESTORE_RESULT="failed"
    exit 1
  fi
}

# ============================================================
#  步骤4: 执行数据库恢复
# ============================================================
do_restore() {
  local start_time
  start_time=$(date +%s)

  log_info "开始恢复数据库..."
  log_info "备份文件: $BACKUP_FILE"
  log_info "目标数据库: $TARGET_DB"

  if [ "$DRY_RUN" = true ]; then
    case "$BACKUP_FILE" in
      *.sql.gz)
        log_info "[预览] 将执行: gunzip < $BACKUP_FILE | psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB"
        ;;
      *.dump)
        log_info "[预览] 将执行: pg_restore -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB --clean --no-owner $BACKUP_FILE"
        ;;
    esac
    return 0
  fi

  case "$BACKUP_FILE" in
    *.sql.gz)
      # 解压并通过 psql 恢复
      log_info "通过 psql 恢复 SQL 备份..."
      if gunzip < "$BACKUP_FILE" | psql \
          -h "$DB_HOST" \
          -p "$DB_PORT" \
          -U "$DB_USER" \
          -d "$TARGET_DB" \
          -v ON_ERROR_STOP=1 \
          --quiet \
          2>&1; then
        log_ok "SQL 备份恢复完成"
      else
        log_error "SQL 备份恢复失败"
        RESTORE_RESULT="failed"
        return 1
      fi
      ;;
    *.sql)
      # 直接通过 psql 恢复
      log_info "通过 psql 恢复 SQL 备份..."
      if psql \
          -h "$DB_HOST" \
          -p "$DB_PORT" \
          -U "$DB_USER" \
          -d "$TARGET_DB" \
          -v ON_ERROR_STOP=1 \
          --quiet \
          -f "$BACKUP_FILE" \
          2>&1; then
        log_ok "SQL 备份恢复完成"
      else
        log_error "SQL 备份恢复失败"
        RESTORE_RESULT="failed"
        return 1
      fi
      ;;
    *.dump)
      # 通过 pg_restore 恢复自定义格式备份
      log_info "通过 pg_restore 恢复自定义格式备份..."
      if pg_restore \
          -h "$DB_HOST" \
          -p "$DB_PORT" \
          -U "$DB_USER" \
          -d "$TARGET_DB" \
          --clean \
          --no-owner \
          --no-privileges \
          --verbose \
          "$BACKUP_FILE" \
          2>&1; then
        log_ok "自定义格式备份恢复完成"
      else
        log_error "自定义格式备份恢复失败"
        RESTORE_RESULT="failed"
        return 1
      fi
      ;;
  esac

  local end_time
  end_time=$(date +%s)
  RESTORE_DURATION=$(( end_time - start_time ))
}

# ============================================================
#  步骤5: 恢复后数据完整性验证
# ============================================================
verify_after_restore() {
  if [ "$VERIFY_AFTER" = false ]; then
    log_info "跳过恢复后验证（未指定 --verify）"
    return 0
  fi

  log_info "执行恢复后数据完整性验证..."

  if [ "$DRY_RUN" = true ]; then
    log_info "[预览] 将查询目标数据库表计数并对比"
    return 0
  fi

  # 获取恢复后的表计数
  TABLE_COUNT_AFTER=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" -tAc \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || echo "0")

  log_info "恢复后表计数: $TABLE_COUNT_AFTER"

  if [ "$TABLE_COUNT_BEFORE" -gt 0 ]; then
    log_info "恢复前表计数: $TABLE_COUNT_BEFORE"

    # 列出恢复后的所有表
    log_info "恢复后数据库表清单:"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" -tAc \
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;" \
      2>/dev/null | while read -r table_name; do
      # 统计每张表的行数
      local row_count
      row_count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" -tAc \
        "SELECT COUNT(*) FROM \"$table_name\";" 2>/dev/null || echo "?")
      log_info "  表 $table_name: $row_count 行"
    done

    # 表数量变化检查
    local diff=$(( TABLE_COUNT_AFTER - TABLE_COUNT_BEFORE ))
    if [ "$diff" -ge 0 ]; then
      log_ok "表数量验证通过（恢复前: $TABLE_COUNT_BEFORE，恢复后: $TABLE_COUNT_AFTER）"
    else
      log_warn "表数量减少: 恢复前 $TABLE_COUNT_BEFORE 张，恢复后 $TABLE_COUNT_AFTER 张（差异: $diff）"
      log_warn "这可能表明恢复的备份中缺少部分表"
    fi
  else
    log_info "无恢复前表计数记录，跳过对比（首次恢复或目标库之前为空）"
  fi
}

# ============================================================
#  步骤6: 输出恢复结果（JSON 格式）
# ============================================================
output_result() {
  local result_json
  result_json=$(cat <<EOF
{
  "status": "$RESTORE_RESULT",
  "backup_file": "$BACKUP_FILE",
  "target_database": "$TARGET_DB",
  "database_host": "${DB_HOST}:${DB_PORT}",
  "timestamp": "$(date '+%Y-%m-%d %H:%M:%S')",
  "duration_seconds": $RESTORE_DURATION,
  "pre_backup_file": "${PRE_BACKUP_FILE:-none}",
  "verification": {
    "enabled": $VERIFY_AFTER,
    "tables_before": $TABLE_COUNT_BEFORE,
    "tables_after": $TABLE_COUNT_AFTER
  },
  "dry_run": $DRY_RUN
}
EOF
)

  echo ""
  echo "============================================================"
  if [ "$RESTORE_RESULT" = "success" ]; then
    echo -e "  ${GREEN}数据库恢复完成${NC}"
  else
    echo -e "  ${RED}数据库恢复失败${NC}"
  fi
  echo "============================================================"
  echo ""
  echo "  备份文件:   $BACKUP_FILE"
  echo "  目标数据库: $TARGET_DB"
  echo "  耗时:       ${RESTORE_DURATION} 秒"
  if [ -n "$PRE_BACKUP_FILE" ]; then
    echo "  回滚备份:   $PRE_BACKUP_FILE"
    echo ""
    echo "  回滚命令:"
    echo "    gunzip < $PRE_BACKUP_FILE | psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB"
  fi
  echo ""
  echo "  JSON 结果:"
  echo "$result_json"
  echo ""
  echo "============================================================"
}

# ============================================================
#  主流程
# ============================================================
main() {
  # 预览模式横幅
  if [ "$DRY_RUN" = true ]; then
    log_warn "预览模式 — 不会实际执行恢复操作"
    echo ""
  fi

  echo ""
  echo "============================================================"
  echo -e "  ${YELLOW}HSE 安全管理系统 — 数据库恢复${NC}"
  echo "  备份文件: $BACKUP_FILE"
  echo "  目标数据库: $TARGET_DB"
  echo "============================================================"
  echo ""

  # 安全确认（非预览模式）
  if [ "$DRY_RUN" = false ]; then
    echo -e "${RED}警告: 恢复操作将覆盖目标数据库 $TARGET_DB 中的现有数据！${NC}"
    if [ -n "$PRE_BACKUP_FILE" ] || [ "$AUTO_PRE_BACKUP" = true ]; then
      echo -e "${YELLOW}恢复前将自动创建当前数据库的备份，可用于回滚。${NC}"
    fi
    echo ""
    read -rp "确认恢复？请输入 'YES' 继续: " confirmation
    if [ "$confirmation" != "YES" ]; then
      log_warn "用户取消恢复操作"
      exit 0
    fi
    echo ""
  fi

  log_info "HSE 安全管理系统数据库恢复开始"

  check_environment
  verify_backup_file
  pre_restore_backup
  do_restore
  verify_after_restore
  output_result

  # 返回退出码
  if [ "$RESTORE_RESULT" = "success" ]; then
    exit 0
  else
    exit 1
  fi
}

main
