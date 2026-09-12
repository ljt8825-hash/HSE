#!/bin/bash
# ============================================================
# backup-verify.sh — HSE 安全管理系统 备份验证脚本
# 宁津环卫 HSE 安全管理系统 v4.1
#
# 使用方式:
#   chmod +x server/scripts/backup-verify.sh
#   ./server/scripts/backup-verify.sh                    # 完整验证
#   ./server/scripts/backup-verify.sh --quiet             # 安静模式（适合 cron）
#   ./server/scripts/backup-verify.sh --backup-dir=/path  # 指定备份目录
#
# 功能说明:
#   1. 列出所有备份文件及大小、日期
#   2. 验证每个备份文件是否可恢复（pg_restore --list 或 gzip -t）
#   3. 检查备份策略合规性（全量备份是否存在、是否过期）
#   4. 输出验证报告（JSON 格式 + 可读摘要）
# ============================================================

set -euo pipefail

# ---- 颜色定义 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---- 日志函数 ----
QUIET_MODE=false
log_info()  { [ "$QUIET_MODE" = false ] && echo -e "${BLUE}[INFO]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*" || true; }
log_ok()    { [ "$QUIET_MODE" = false ] && echo -e "${GREEN}[OK]${NC}    $(date '+%Y-%m-%d %H:%M:%S') $*" || true; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" >&2; }

# ---- 默认参数 ----
BACKUP_DIR=""              # 备份目录（默认自动检测）

# ---- 解析命令行参数 ----
for arg in "$@"; do
  case "$arg" in
    --backup-dir=*)
      BACKUP_DIR="${arg#--backup-dir=}"
      ;;
    --quiet)
      QUIET_MODE=true
      ;;
    --help|-h)
      echo "用法: $0 [选项]"
      echo ""
      echo "选项:"
      echo "  --backup-dir=DIR  备份目录路径（默认 ./backups）"
      echo "  --quiet           安静模式（仅输出警告和错误）"
      echo "  --help, -h        显示帮助信息"
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

# ---- 备份目录（默认在项目根目录下的 backups） ----
if [ -z "$BACKUP_DIR" ]; then
  BACKUP_DIR="$PROJECT_ROOT/backups"
fi

# ---- 策略配置 ----
FULL_RETENTION_DAYS=7     # 全量备份最大保留天数
INCR_RETENTION_DAYS=2     # 增量备份最大保留天数
MAX_FULL_AGE_HOURS=30     # 全量备份最大间隔（小时），超过则视为过期

# ---- 统计变量 ----
TOTAL_FILES=0
VALID_FILES=0
INVALID_FILES=0
FULL_BACKUP_COUNT=0
INCR_BACKUP_COUNT=0
TOTAL_SIZE_BYTES=0
LATEST_FULL_BACKUP=""
LATEST_FULL_AGE_HOURS=""
COMPLIANCE_ISSUES=()

# ============================================================
#  步骤1: 扫描备份目录
# ============================================================
scan_backup_dir() {
  log_info "扫描备份目录: $BACKUP_DIR"

  if [ ! -d "$BACKUP_DIR" ]; then
    log_error "备份目录不存在: $BACKUP_DIR"
    exit 1
  fi

  # 查找所有备份文件（包括子目录中的文件）
  local all_backup_files=()
  while IFS= read -r -d '' file; do
    all_backup_files+=("$file")
  done < <(find "$BACKUP_DIR" -type f \( -name "hse_backup_full_*.sql.gz" -o -name "hse_backup_full_*.dump" -o -name "hse_backup_incr_*.sql.gz" \) -print0 2>/dev/null)

  # 如果未找到新格式文件，尝试旧格式
  if [ ${#all_backup_files[@]} -eq 0 ]; then
    while IFS= read -r -d '' file; do
      all_backup_files+=("$file")
    done < <(find "$BACKUP_DIR" -type f -name "hse_backup_*.sql.gz" -print0 2>/dev/null)
  fi

  TOTAL_FILES=${#all_backup_files[@]}

  if [ "$TOTAL_FILES" -eq 0 ]; then
    log_warn "未找到任何备份文件"
    COMPLIANCE_ISSUES+=("未找到任何备份文件")
    return 0
  fi

  log_info "共找到 $TOTAL_FILES 个备份文件"
  echo ""
}

# ============================================================
#  步骤2: 验证备份文件
# ============================================================
verify_files() {
  log_info "开始验证备份文件..."

  local all_backup_files=()
  while IFS= read -r -d '' file; do
    all_backup_files+=("$file")
  done < <(find "$BACKUP_DIR" -type f \( -name "hse_backup_full_*.sql.gz" -o -name "hse_backup_full_*.dump" -o -name "hse_backup_incr_*.sql.gz" \) -print0 2>/dev/null)

  # 尝试旧格式
  if [ ${#all_backup_files[@]} -eq 0 ]; then
    while IFS= read -r -d '' file; do
      all_backup_files+=("$file")
    done < <(find "$BACKUP_DIR" -type f -name "hse_backup_*.sql.gz" -print0 2>/dev/null)
  fi

  for file in "${all_backup_files[@]}"; do
    local filename
    filename=$(basename "$file")
    local file_size_bytes
    file_size_bytes=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo "0")
    local file_size_human
    file_size_human=$(du -h "$file" | cut -f1)
    local file_date
    file_date=$(stat -c%Y "$file" 2>/dev/null || stat -f%m "$file" 2>/dev/null || echo "0")
    local file_date_str
    file_date_str=$(date -d "@$file_date" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -r "$file_date" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "unknown")

    # 统计文件大小
    TOTAL_SIZE_BYTES=$(( TOTAL_SIZE_BYTES + file_size_bytes ))

    # 统计备份类型
    case "$filename" in
      hse_backup_full_*)
        FULL_BACKUP_COUNT=$(( FULL_BACKUP_COUNT + 1 ))
        ;;
      hse_backup_incr_*)
        INCR_BACKUP_COUNT=$(( INCR_BACKUP_COUNT + 1 ))
        ;;
      hse_backup_*)
        # 旧格式备份，视为全量
        FULL_BACKUP_COUNT=$(( FULL_BACKUP_COUNT + 1 ))
        ;;
    esac

    # 显示文件信息
    if [ "$QUIET_MODE" = false ]; then
      echo "  文件: $filename"
      echo "    路径: $file"
      echo "    大小: $file_size_human"
      echo "    日期: $file_date_str"
    fi

    # 检查文件大小是否为 0
    if [ "$file_size_bytes" -eq 0 ]; then
      log_error "  验证失败: 文件为空 - $filename"
      INVALID_FILES=$(( INVALID_FILES + 1 ))
      continue
    fi

    # 根据文件类型进行验证
    local validation_ok=true
    case "$file" in
      *.sql.gz)
        if ! gzip -t "$file" 2>/dev/null; then
          log_error "  验证失败: gzip 完整性检查不通过 - $filename"
          validation_ok=false
        else
          if [ "$QUIET_MODE" = false ]; then
            echo "    gzip 完整性: 通过"
          fi
        fi
        ;;
      *.dump)
        if command -v pg_restore &>/dev/null; then
          if ! pg_restore --list "$file" &>/dev/null; then
            log_error "  验证失败: pg_restore 检查不通过 - $filename"
            validation_ok=false
          else
            if [ "$QUIET_MODE" = false ]; then
              echo "    pg_restore 验证: 通过"
            fi
          fi
        else
          log_warn "  跳过 pg_restore 验证（未安装 pg_restore）- $filename"
        fi
        ;;
    esac

    if [ "$validation_ok" = true ]; then
      VALID_FILES=$(( VALID_FILES + 1 ))
      if [ "$QUIET_MODE" = false ]; then
        echo "    状态: ${GREEN}有效${NC}"
      fi
    else
      INVALID_FILES=$(( INVALID_FILES + 1 ))
    fi

    # 记录最新的全量备份
    case "$filename" in
      hse_backup_full_*.sql.gz|hse_backup_full_*.dump|hse_backup_*.sql.gz)
        if [ -z "$LATEST_FULL_BACKUP" ]; then
          LATEST_FULL_BACKUP="$file"
          LATEST_FULL_AGE_HOURS="$file_date"
        else
          if [ "$file_date" -gt "$LATEST_FULL_AGE_HOURS" ]; then
            LATEST_FULL_BACKUP="$file"
            LATEST_FULL_AGE_HOURS="$file_date"
          fi
        fi
        ;;
    esac

    if [ "$QUIET_MODE" = false ]; then
      echo ""
    fi
  done
}

# ============================================================
#  步骤3: 备份策略合规性检查
# ============================================================
check_compliance() {
  log_info "检查备份策略合规性..."

  local current_epoch
  current_epoch=$(date +%s)

  # ---- 检查1: 是否存在全量备份 ----
  if [ "$FULL_BACKUP_COUNT" -eq 0 ]; then
    COMPLIANCE_ISSUES+=("不存在任何全量备份 — 请立即执行全量备份")
    log_error "合规性违规: 不存在任何全量备份"
  else
    log_ok "全量备份数量: $FULL_BACKUP_COUNT"
  fi

  # ---- 检查2: 最新全量备份是否过期 ----
  if [ -n "$LATEST_FULL_BACKUP" ] && [ -n "$LATEST_FULL_AGE_HOURS" ]; then
    local age_seconds
    age_seconds=$(( current_epoch - LATEST_FULL_AGE_HOURS ))
    local age_hours
    age_hours=$(( age_seconds / 3600 ))
    local latest_filename
    latest_filename=$(basename "$LATEST_FULL_BACKUP")

    log_info "最新全量备份: $latest_filename（${age_hours} 小时前）"

    if [ "$age_hours" -gt "$MAX_FULL_AGE_HOURS" ]; then
      COMPLIANCE_ISSUES+=("最新全量备份已过期（${age_hours} 小时前，超过 ${MAX_FULL_AGE_HOURS} 小时阈值）")
      log_error "合规性违规: 全量备份已过期"
    else
      log_ok "全量备份时效性检查通过"
    fi
  fi

  # ---- 检查3: 备份文件总量 ----
  local total_size_mb
  total_size_mb=$(( TOTAL_SIZE_BYTES / 1024 / 1024 ))
  log_info "备份总大小: ${total_size_mb}MB（${TOTAL_FILES} 个文件）"

  # ---- 检查4: 增量备份 ----
  if [ "$INCR_BACKUP_COUNT" -eq 0 ]; then
    log_info "未找到增量备份（可选，非必需）"
  else
    log_ok "增量备份数量: $INCR_BACKUP_COUNT"
  fi
}

# ============================================================
#  步骤4: 输出验证报告
# ============================================================
output_report() {
  local compliance_status="pass"
  if [ ${#COMPLIANCE_ISSUES[@]} -gt 0 ] || [ "$INVALID_FILES" -gt 0 ]; then
    compliance_status="fail"
  fi

  # JSON 格式报告
  local issues_json=""
  for i in "${!COMPLIANCE_ISSUES[@]}"; do
    if [ "$i" -gt 0 ]; then
      issues_json+=","
    fi
    issues_json+="\"${COMPLIANCE_ISSUES[$i]}\""
  done

  local total_size_mb
  total_size_mb=$(( TOTAL_SIZE_BYTES / 1024 / 1024 ))

  local report_json
  report_json=$(cat <<EOF
{
  "compliance": "$compliance_status",
  "timestamp": "$(date '+%Y-%m-%d %H:%M:%S')",
  "backup_dir": "$BACKUP_DIR",
  "summary": {
    "total_files": $TOTAL_FILES,
    "valid_files": $VALID_FILES,
    "invalid_files": $INVALID_FILES,
    "full_backups": $FULL_BACKUP_COUNT,
    "incremental_backups": $INCR_BACKUP_COUNT,
    "total_size_mb": $total_size_mb
  },
  "latest_full_backup": "${LATEST_FULL_BACKUP:-none}",
  "issues": [$issues_json]
}
EOF
)

  if [ "$QUIET_MODE" = true ]; then
    echo "$report_json"
  else
    echo ""
    echo "============================================================"
    echo "  HSE 安全管理系统 — 备份验证报告"
    echo "============================================================"
    echo ""
    echo "  备份目录:     $BACKUP_DIR"
    echo "  总文件数:     $TOTAL_FILES"
    echo "  有效文件:     $VALID_FILES"
    echo "  无效文件:     $INVALID_FILES"
    echo "  全量备份数:   $FULL_BACKUP_COUNT"
    echo "  增量备份数:   $INCR_BACKUP_COUNT"
    echo "  备份总大小:   ${total_size_mb}MB"
    echo ""
    echo "  合规性状态:   $(if [ "$compliance_status" = "pass" ]; then echo -e "${GREEN}通过${NC}"; else echo -e "${RED}未通过${NC}"; fi)"
    echo ""

    if [ ${#COMPLIANCE_ISSUES[@]} -gt 0 ]; then
      echo "  合规性问题:"
      for issue in "${COMPLIANCE_ISSUES[@]}"; do
        echo -e "    ${RED}- $issue${NC}"
      done
      echo ""
    fi

    if [ -n "$LATEST_FULL_BACKUP" ]; then
      echo "  最新全量备份: $(basename "$LATEST_FULL_BACKUP")"
    fi

    echo ""
    echo "  JSON 报告:"
    echo "$report_json"
    echo ""
    echo "============================================================"
  fi
}

# ============================================================
#  主流程
# ============================================================
main() {
  log_info "HSE 安全管理系统 — 备份验证开始"

  scan_backup_dir
  verify_files
  check_compliance
  output_report

  # 如果存在合规性问题，返回非零退出码
  if [ ${#COMPLIANCE_ISSUES[@]} -gt 0 ]; then
    exit 1
  fi

  exit 0
}

main
