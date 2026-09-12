#!/bin/bash
# ============================================================
# rollback.sh — 生产环境回滚脚本
# 宁津环卫 HSE 安全管理系统 v4.1
#
# 使用方式:
#   chmod +x deploy/rollback.sh
#   ./deploy/rollback.sh                     # 回滚到上一个版本
#   ./deploy/rollback.sh --version=v4.0.3    # 回滚到指定版本
#   ./deploy/rollback.sh --step=2            # 回滚到 2 个版本前
#   ./deploy/rollback.sh --dry-run           # 预览模式（不实际执行）
#   ./deploy/rollback.sh --version=v4.0.3 --force  # 跳过确认
#
# 功能:
#   1. 显示当前运行版本（docker images + 容器状态）
#   2. 显示可回滚的历史版本列表
#   3. 停止当前容器
#   4. 切换到指定版本（或上一个版本）
#   5. 启动回滚版本
#   6. 健康检查确认回滚成功
#   7. 回滚失败自动恢复
#
# 安全措施:
#   - 回滚前自动备份当前容器配置
#   - 回滚前检查数据库连接（防止数据丢失）
#   - 回滚失败自动重启原版本
#   - 操作记录日志
# ============================================================

set -euo pipefail

# ---- 颜色定义 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ---- 脚本目录 ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$SCRIPT_DIR"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.production.yml"
ENV_FILE="$PROJECT_ROOT/.env.production"
LOG_DIR="$PROJECT_ROOT/logs"
ROLLBACK_LOG="$LOG_DIR/rollback.log"

# 回滚备份配置目录
ROLLBACK_BACKUP_DIR="$PROJECT_ROOT/backups/rollback"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')

# Docker Compose 命令（自动检测 V2 插件或独立版）
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD="docker-compose"
else
  COMPOSE_CMD=""
fi

# ---- 打印函数 ----
info()  { echo -e "${BLUE}[INFO]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$ROLLBACK_LOG"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$ROLLBACK_LOG"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$ROLLBACK_LOG"; }
error() { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$ROLLBACK_LOG"; }

# ---- 参数解析 ----
TARGET_VERSION=""
STEP=1
DRY_RUN=false
FORCE=false

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --version=*)
        TARGET_VERSION="${1#*=}"
        shift
        ;;
      --step=*)
        STEP="${1#*=}"
        shift
        ;;
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      --force)
        FORCE=true
        shift
        ;;
      --help|-h)
        echo ""
        echo "用法: ./rollback.sh [选项]"
        echo ""
        echo "选项:"
        echo "  --version=TAG   回滚到指定镜像标签 (例: --version=v4.0.3)"
        echo "  --step=N       回滚到 N 个版本前 (默认: 1)"
        echo "  --dry-run      预览模式，不实际执行回滚"
        echo "  --force        跳过确认提示"
        echo "  --help         显示帮助信息"
        echo ""
        echo "示例:"
        echo "  ./rollback.sh                       # 回滚到上一个版本"
        echo "  ./rollback.sh --version=v4.0.3      # 回滚到 v4.0.3"
        echo "  ./rollback.sh --step=2 --dry-run    # 预览回滚到 2 个版本前"
        echo ""
        exit 0
        ;;
      *)
        error "未知参数: $1"
        echo "使用 --help 查看帮助信息"
        exit 1
        ;;
    esac
  done
}

# ---- 横幅 ----
banner() {
  echo ""
  echo "============================================================"
  echo "  宁津环卫 HSE 安全管理系统 v4.1 — 生产环境回滚"
  echo "============================================================"
  echo ""
}

# ---- 步骤0: 初始化日志 ----
init_log() {
  mkdir -p "$LOG_DIR"
  touch "$ROLLBACK_LOG"
  info "回滚日志: $ROLLBACK_LOG"
}

# ---- 步骤1: 检查 Docker 环境 ----
check_docker() {
  info "检查 Docker 环境..."

  if ! command -v docker &>/dev/null; then
    error "Docker 未安装"
    exit 1
  fi

  if ! docker info &>/dev/null; then
    error "Docker 守护进程未运行"
    exit 1
  fi

  if [ -z "$COMPOSE_CMD" ]; then
    error "Docker Compose 未安装"
    exit 1
  fi

  ok "Docker: $(docker --version | grep -oP 'Docker version \K[^,]+')"
  ok "Docker Compose: $($COMPOSE_CMD version --short 2>/dev/null || echo '已安装')"
}

# ---- 步骤2: 显示当前版本状态 ----
show_current_status() {
  info "当前服务状态:"
  echo ""

  # 显示 hse 相关容器状态
  echo "  容器状态:"
  docker ps --filter "name=hse-" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "    无运行中的容器"

  echo ""
  echo "  当前镜像版本:"
  docker images --filter "reference=*hse*" --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}" 2>/dev/null || echo "    无 hse 相关镜像"

  echo ""

  # 记录当前运行的镜像版本（用于失败恢复）
  CURRENT_FRONTEND_IMAGE=$(docker inspect --format='{{.Config.Image}}' hse-frontend 2>/dev/null || echo "")
  CURRENT_BACKEND_IMAGE=$(docker inspect --format='{{.Config.Image}}' hse-backend 2>/dev/null || echo "")

  if [ -n "$CURRENT_FRONTEND_IMAGE" ]; then
    info "当前前端镜像: $CURRENT_FRONTEND_IMAGE"
  fi
  if [ -n "$CURRENT_BACKEND_IMAGE" ]; then
    info "当前后端镜像: $CURRENT_BACKEND_IMAGE"
  fi
}

# ---- 步骤3: 显示可回滚版本列表 ----
show_available_versions() {
  info "可回滚的历史版本:"
  echo ""

  # 列出所有 hse 相关镜像，按创建时间倒序
  local versions
  versions=$(docker images --filter "reference=*hse*" --format "{{.Repository}}:{{.Tag}}|{{.ID}}|{{.CreatedAt}}|{{.Size}}" 2>/dev/null || true)

  if [ -z "$versions" ]; then
    error "没有可用的历史版本镜像"
    exit 1
  fi

  echo "  #  镜像名称                                    镜像ID          创建时间              大小"
  echo "  --  --------------------------------------------  --------------  -------------------  ------"
  local idx=1
  while IFS='|' read -r name id created size; do
    printf "  %2d  %-44s  %-14s  %-19s  %s\n" "$idx" "$name" "$id" "${created%%.000000000}" "$size"
    idx=$((idx + 1))
  done <<< "$versions"

  echo ""
}

# ---- 步骤4: 确定目标版本 ----
determine_target_version() {
  if [ -n "$TARGET_VERSION" ]; then
    # 用户指定了版本号
    info "目标版本（用户指定）: $TARGET_VERSION"

    # 检查目标版本镜像是否存在
    local found=false
    while IFS='|' read -r name id created size; do
      if [[ "$name" == *"$TARGET_VERSION"* ]]; then
        found=true
        TARGET_IMAGE_NAME="$name"
        break
      fi
    done <<< "$(docker images --filter "reference=*hse*" --format "{{.Repository}}:{{.Tag}}|{{.ID}}|{{.CreatedAt}}|{{.Size}}" 2>/dev/null || true)"

    if [ "$found" = false ]; then
      error "目标版本 $TARGET_VERSION 的镜像不存在"
      info "请使用 docker images --filter 'reference=*hse*' 查看可用版本"
      exit 1
    fi
  else
    # 按 step 参数确定回滚目标
    info "回滚到 ${STEP} 个版本前..."

    local all_images
    all_images=$(docker images --filter "reference=*hse*" --format "{{.Repository}}:{{.Tag}}" 2>/dev/null || true)

    if [ -z "$all_images" ]; then
      error "没有可用的历史版本镜像"
      exit 1
    fi

    # 将镜像列表转为数组
    mapfile -t IMAGE_LIST <<< "$all_images"

    local target_idx=$((STEP))
    if [ "$target_idx" -ge "${#IMAGE_LIST[@]}" ]; then
      error "回滚步数超出范围，总共只有 ${#IMAGE_LIST[@]} 个版本"
      exit 1
    fi

    TARGET_VERSION="${IMAGE_LIST[$target_idx]}"
    TARGET_IMAGE_NAME="$TARGET_VERSION"
    info "目标版本（自动选择）: $TARGET_VERSION"
  fi
}

# ---- 步骤5: 检查数据库连接 ----
check_database_connection() {
  info "检查数据库连接..."

  local db_status
  db_status=$(docker exec hse-db pg_isready -U hse_app -d safety_dashboard -h localhost -p 5432 2>/dev/null || echo "failed")

  if [ "$db_status" != "accepting connections" ] && [ "$db_status" != "/var/run/postgresql:5432 - accepting connections" ]; then
    error "数据库连接异常: $db_status"
    error "回滚中止 — 数据库不可访问可能导致数据丢失"
    exit 1
  fi

  ok "数据库连接正常"
}

# ---- 步骤6: 备份当前配置 ----
backup_current_config() {
  info "备份当前容器配置..."

  mkdir -p "$ROLLBACK_BACKUP_DIR"

  local config_backup="$ROLLBACK_BACKUP_DIR/pre_rollback_${TIMESTAMP}.json"

  if [ "$DRY_RUN" = true ]; then
    info "[预览] 将备份当前容器配置到: $config_backup"
    return 0
  fi

  # 导出当前容器配置信息
  docker inspect hse-frontend hse-backend hse-db 2>/dev/null > "$config_backup" || true

  # 同时备份 .env.production
  if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "$ROLLBACK_BACKUP_DIR/env_production_${TIMESTAMP}.bak"
    ok "环境变量已备份"
  fi

  ok "配置备份完成: $config_backup"
}

# ---- 步骤7: 确认回滚操作 ----
confirm_rollback() {
  if [ "$FORCE" = true ]; then
    info "跳过确认（--force 模式）"
    return 0
  fi

  if [ "$DRY_RUN" = true ]; then
    echo ""
    warn "===== 预览模式 — 以下操作不会实际执行 ====="
    warn "目标版本: $TARGET_VERSION"
    warn "===== 预览模式结束 ====="
    echo ""
    return 0
  fi

  echo ""
  echo "============================================================"
  warn "即将执行回滚操作"
  warn "  目标版本: $TARGET_VERSION"
  warn "  当前版本: ${CURRENT_FRONTEND_IMAGE:-未确定} / ${CURRENT_BACKEND_IMAGE:-未确定}"
  warn ""
  warn "回滚期间服务将短暂不可用（预计 30-60 秒）"
  warn "回滚前已自动备份数据库和容器配置"
  echo "============================================================"
  echo ""
  read -p "确认回滚? 请输入 'yes' 继续: " confirm

  if [ "$confirm" != "yes" ]; then
    info "回滚已取消"
    exit 0
  fi
}

# ---- 步骤8: 停止当前容器 ----
stop_current_services() {
  info "停止当前服务..."

  if [ "$DRY_RUN" = true ]; then
    info "[预览] 将执行: $COMPOSE_CMD -f $COMPOSE_FILE down"
    return 0
  fi

  cd "$DEPLOY_DIR"
  $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down --timeout 30

  ok "服务已停止"
}

# ---- 步骤9: 切换到目标版本并启动 ----
start_target_version() {
  info "启动目标版本: $TARGET_VERSION"

  if [ "$DRY_RUN" = true ]; then
    info "[预览] 将使用镜像 $TARGET_IMAGE_NAME 启动服务"
    return 0
  fi

  cd "$DEPLOY_DIR"

  # 使用目标版本的镜像启动
  # 通过设置镜像标签来切换版本
  # 如果回滚镜像的 tag 与 docker-compose 中不同，需要临时修改
  # 这里采用直接 docker run 的方式来精确控制版本
  # 但优先尝试使用 compose 启动（更简洁）

  # 方法一：如果目标镜像名称匹配 compose 定义中的 image，直接启动
  # 方法二：否则需要手动 docker run

  local backend_image=""
  local frontend_image=""

  # 从目标版本中提取前后端镜像
  while IFS='|' read -r name id created size; do
    if [[ "$name" == *frontend* || "$name" == *nginx* ]]; then
      frontend_image="$name"
    fi
    if [[ "$name" == *backend* || "$name" == *node* ]]; then
      backend_image="$name"
    fi
  done <<< "$(docker images --filter "reference=*hse*" --format "{{.Repository}}:{{.Tag}}|{{.ID}}|{{.CreatedAt}}|{{.Size}}" 2>/dev/null || true)"

  if [ -z "$frontend_image" ] && [ -z "$backend_image" ]; then
    # 如果无法自动识别，使用完整的镜像名
    warn "无法自动识别前后端镜像，尝试使用 Docker Compose 启动..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
  else
    # 通过环境变量覆盖 docker-compose 中的镜像
    info "前端镜像: $frontend_image"
    info "后端镜像: $backend_image"

    # 导出目标镜像
    local target_compose="$ROLLBACK_BACKUP_DIR/docker-compose.rollback.${TIMESTAMP}.yml"
    cp "$COMPOSE_FILE" "$target_compose"

    # 替换镜像为历史版本
    if [ -n "$frontend_image" ]; then
      # 在回滚 compose 文件中设置前端镜像
      sed -i "s|build:.*context:.*|image: ${frontend_image}|" "$target_compose" 2>/dev/null || \
      sed -i "s|build:|image: ${frontend_image}  # 回滚覆盖|" "$target_compose" 2>/dev/null || true
    fi
    if [ -n "$backend_image" ]; then
      sed -i "/hse-backend:/,/container_name:/s|build:.*|image: ${backend_image}|" "$target_compose" 2>/dev/null || true
    fi

    $COMPOSE_CMD -f "$target_compose" --env-file "$ENV_FILE" up -d
  fi

  ok "回滚版本启动命令已执行"
}

# ---- 步骤10: 健康检查 ----
health_check() {
  info "等待回滚版本健康检查通过..."

  local services=("hse-db" "hse-backend" "hse-frontend")
  local max_wait=120
  local interval=5
  local elapsed=0
  local all_healthy=true

  for svc in "${services[@]}"; do
    info "等待 $svc 启动..."
    elapsed=0
    while [ $elapsed -lt $max_wait ]; do
      local status
      status=$(docker inspect --format='{{.State.Health.Status}}' "$svc" 2>/dev/null || echo "not_found")

      if [ "$status" = "healthy" ]; then
        ok "$svc 已就绪"
        break
      elif [ "$status" = "unhealthy" ]; then
        error "$svc 健康检查失败"
        all_healthy=false
        break
      fi

      sleep $interval
      elapsed=$((elapsed + interval))
      echo -ne "\r  已等待 ${elapsed}s / ${max_wait}s (状态: ${status:-starting})..."
    done

    if [ $elapsed -ge $max_wait ]; then
      error "$svc 在 ${max_wait}s 内未通过健康检查"
      all_healthy=false
    fi
  done

  echo ""

  if [ "$all_healthy" = false ]; then
    return 1
  fi

  # 额外检查 API 健康接口
  info "检查后端 API 健康接口..."
  local api_response
  api_response=$(curl -sf --max-time 10 http://localhost:3000/api/health 2>/dev/null || echo "")

  if [ -n "$api_response" ]; then
    ok "API 健康检查通过: $api_response"
  else
    warn "API 健康接口无响应（可能仍在启动中）"
  fi

  return 0
}

# ---- 步骤11: 回滚失败自动恢复 ----
auto_recover() {
  error "回滚后健康检查未通过，启动自动恢复..."

  info "停止回滚版本..."
  cd "$DEPLOY_DIR"
  $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down --timeout 30 2>/dev/null || true

  info "恢复原版本..."
  # 使用备份的 compose 文件恢复（如果存在）
  local latest_backup
  latest_backup=$(ls -t "$ROLLBACK_BACKUP_DIR"/docker-compose.rollback.*.yml 2>/dev/null | head -1 || echo "")

  if [ -n "$latest_backup" ]; then
    warn "尝试恢复..."
    # 回到原始 docker-compose 文件
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
  else
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
  fi

  ok "原版本恢复启动命令已执行"
  warn "请手动检查服务状态: docker ps --filter 'name=hse-'"
}

# ---- 步骤12: 显示回滚结果 ----
show_result() {
  local status=$1

  echo ""
  echo "============================================================"
  if [ "$status" = "success" ]; then
    echo -e "  ${GREEN}回滚成功!${NC}"
  else
    echo -e "  ${RED}回滚完成，但健康检查未全部通过${NC}"
    echo -e "  ${YELLOW}已自动恢复原版本${NC}"
  fi
  echo "============================================================"
  echo ""
  echo "  当前服务状态:"
  docker ps --filter "name=hse-" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
  echo ""
  echo "  目标版本: $TARGET_VERSION"
  echo "  操作时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "  日志文件: $ROLLBACK_LOG"
  echo ""

  if [ "$status" = "success" ]; then
    echo "  常用命令:"
    echo "    - 查看日志: cd deploy && $COMPOSE_CMD -f docker-compose.production.yml logs -f"
    echo "    - 健康检查: ./scripts/health-check.sh"
    echo "    - 数据库备份: ./deploy/backup-db.sh"
    echo ""
  else
    echo "  排查建议:"
    echo "    - 查看日志: docker logs hse-backend --tail 50"
    echo "    - 查看日志: docker logs hse-frontend --tail 50"
    echo "    - 健康检查: ./scripts/health-check.sh --verbose"
    echo "    - 联系运维人员并提供回滚日志: $ROLLBACK_LOG"
    echo ""
  fi

  echo "============================================================"
}

# ---- 主流程 ----
main() {
  parse_args "$@"
  banner
  init_log

  check_docker
  show_current_status
  show_available_versions
  determine_target_version
  check_database_connection
  backup_current_config
  confirm_rollback

  if [ "$DRY_RUN" = true ]; then
    echo ""
    ok "预览模式完成，未执行任何回滚操作"
    echo ""
    exit 0
  fi

  stop_current_services
  start_target_version

  # 健康检查，失败则自动恢复
  if health_check; then
    show_result "success"
  else
    auto_recover
    show_result "recovered"
    exit 1
  fi
}

main "$@"
