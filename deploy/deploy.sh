#!/bin/bash
# ============================================================
# deploy.sh — HSE 安全管理系统一键部署脚本
# 宁津环卫 HSE 安全管理系统 v4.1
#
# 使用方式:
#   chmod +x deploy/deploy.sh
#   ./deploy/deploy.sh           # 全新部署
#   ./deploy/deploy.sh --rebuild # 强制重新构建镜像
#   ./deploy/deploy.sh --down    # 停止所有服务
#   ./deploy/deploy.sh --with-monitoring  # 部署主服务 + 监控服务
#   ./deploy/deploy.sh --monitoring-only  # 仅启动/停止监控服务
#   ./deploy/deploy.sh --stop-monitoring  # 仅停止监控服务
#
# 功能:
#   1. 环境预检（Docker、Docker Compose、.env.production）
#   2. 构建 Docker 镜像
#   3. 启动 docker-compose.production.yml
#   4. 等待健康检查通过
#   5. 显示部署结果摘要
# ============================================================

set -euo pipefail

# ---- 颜色定义 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # 无颜色

# ---- 脚本所在目录 ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$SCRIPT_DIR"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.production.yml"
MONITORING_COMPOSE="$DEPLOY_DIR/../monitoring/docker-compose.monitoring.yml"
ENV_FILE="$PROJECT_ROOT/.env.production"

# ---- 打印带颜色的信息 ----
info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---- 横幅 ----
banner() {
  echo ""
  echo "============================================================"
  echo "  宁津环卫 HSE 安全管理系统 v4.1 — 生产环境部署"
  echo "============================================================"
  echo ""
}

# ---- 步骤1: 检查 Docker 是否安装 ----
check_docker() {
  info "检查 Docker 环境..."

  if ! command -v docker &>/dev/null; then
    error "Docker 未安装，请先安装 Docker: https://docs.docker.com/get-docker/"
    exit 1
  fi

  if ! docker info &>/dev/null; then
    error "Docker 守护进程未运行，请先启动 Docker"
    exit 1
  fi

  # 检查 Docker Compose 是否可用（V2 插件版或独立版）
  if docker compose version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
  else
    error "Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
  fi

  ok "Docker 版本: $(docker --version | grep -oP 'Docker version \K[^,]+')"
  ok "Docker Compose: $($COMPOSE_CMD version --short 2>/dev/null || echo '已安装')"
}

# ---- 步骤2: 检查 .env.production 是否存在 ----
check_env_file() {
  info "检查环境变量配置..."

  if [ ! -f "$ENV_FILE" ]; then
    error ".env.production 文件不存在"
    warn "请从模板复制并修改:"
    warn "  cp deploy/.env.production.template .env.production"
    warn "  nano .env.production  # 修改所有 [必改] 配置项"
    exit 1
  fi

  ok "环境变量文件: $ENV_FILE"

  # 检查是否包含默认密码（安全警告）
  if grep -q "请修改为强密码" "$ENV_FILE" || grep -q "请修改为32位以上" "$ENV_FILE"; then
    warn "检测到默认密码/密钥未修改，生产环境请务必修改以下配置项:"
    grep -n "请修改" "$ENV_FILE" | while read -r line; do
      warn "  $line"
    done
    echo ""
    read -p "是否继续部署? (y/N): " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      info "部署已取消"
      exit 0
    fi
  fi
}

# ---- 步骤3: 构建 Docker 镜像 ----
build_images() {
  local rebuild_flag=""
  if [[ "${1:-}" == "--rebuild" ]]; then
    rebuild_flag="--no-cache"
    info "强制重新构建镜像（--no-cache）..."
  else
    info "构建 Docker 镜像..."
  fi

  cd "$DEPLOY_DIR"

  $COMPOSE_CMD -f "$COMPOSE_FILE" build $rebuild_flag \
    --env-file "$ENV_FILE"

  ok "镜像构建完成"
}

# ---- 步骤4: 启动服务 ----
start_services() {
  info "启动生产环境服务..."

  cd "$DEPLOY_DIR"

  # 检查是否传入 --down 参数（仅停止服务）
  if [[ "${1:-}" == "--down" ]]; then
    info "停止所有服务..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
    ok "所有服务已停止"
    return 0
  fi

  # 启动服务（-d 后台运行）
  $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

  ok "服务启动命令已执行"
}

# ---- 步骤5: 等待健康检查通过 ----
wait_healthy() {
  info "等待服务健康检查通过..."

  local services=("hse-db" "hse-backend" "hse-frontend")
  local max_wait=120          # 最大等待时间（秒）
  local interval=5           # 检查间隔（秒）
  local elapsed=0

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
        docker logs --tail 20 "$svc" 2>/dev/null || true
        exit 1
      fi

      sleep $interval
      elapsed=$((elapsed + interval))
      echo -ne "\r  已等待 ${elapsed}s / ${max_wait}s (状态: ${status:-starting})..."
    done

    if [ $elapsed -ge $max_wait ]; then
      error "$svc 在 ${max_wait}s 内未通过健康检查"
      docker logs --tail 30 "$svc" 2>/dev/null || true
      exit 1
    fi
  done

  echo ""
}

# ---- 步骤6: 显示部署结果 ----
show_result() {
  echo ""
  echo "============================================================"
  echo -e "  ${GREEN}部署完成!${NC}"
  echo "============================================================"
  echo ""
  echo "  服务状态:"
  docker ps --filter "name=hse-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
  echo ""
  echo "  访问地址:"
  echo "    - 前端页面: http://localhost"
  echo "    - API 接口: http://localhost/api/health"
  echo ""
  echo "  常用命令:"
  echo "    - 查看日志: cd deploy && docker compose -f docker-compose.production.yml logs -f"
  echo "    - 停止服务: ./deploy/deploy.sh --down"
  echo "    - 重启服务: cd deploy && docker compose -f docker-compose.production.yml restart"
  echo "    - 备份数据库: ./deploy/backup-db.sh"
    - 启动监控: ./monitoring/start.sh"
    echo ""
    echo "============================================================"
}

# ---- 步骤7: 启动监控服务（可选） ----
start_monitoring() {
  info "启动可观测性监控服务..."

  local monitoring_dir="$PROJECT_ROOT/monitoring"

  if [ ! -f "$MONITORING_COMPOSE" ]; then
    warn "监控编排文件不存在，跳过监控服务启动"
    warn "如需启用监控，请先运行 monitoring 配置脚本"
    return 0
  fi

  cd "$monitoring_dir"

  $COMPOSE_CMD -f "$MONITORING_COMPOSE" ${ENV_FILE:+--env-file "$ENV_FILE"} up -d

  ok "监控服务已启动（Prometheus + Grafana + AlertManager + Loki）"

  # 显示监控访问地址
  echo ""
  echo "  监控服务地址:"
  echo "    - Grafana 大屏:   http://localhost:3001 (admin/admin)"
  echo "    - Prometheus:     http://localhost:9090"
  echo "    - AlertManager:   http://localhost:9093"
  echo "    - Loki 日志:      http://localhost:3100 (Grafana 内嵌)"
}

# ---- 步骤8: 停止监控服务 ----
stop_monitoring() {
  info "停止可观测性监控服务..."

  local monitoring_dir="$PROJECT_ROOT/monitoring"

  if [ ! -f "$MONITORING_COMPOSE" ]; then
    warn "监控编排文件不存在"
    return 0
  fi

  cd "$monitoring_dir"

  $COMPOSE_CMD -f "$MONITORING_COMPOSE" down

  ok "监控服务已停止"
}

# ---- 主流程 ----
main() {
  banner
  check_docker

  # 仅操作监控服务
  if [[ "${1:-}" == "--monitoring-only" ]]; then
    check_env_file
    start_monitoring
    return 0
  fi

  # 仅停止监控服务
  if [[ "${1:-}" == "--stop-monitoring" ]]; then
    stop_monitoring
    return 0
  fi

  # 如果传入 --down 参数，仅停止服务（含监控）
  if [[ "${1:-}" == "--down" ]]; then
    check_env_file
    start_services --down
    # 同时停止监控（如果正在运行）
    stop_monitoring 2>/dev/null || true
    return 0
  fi

  check_env_file
  build_images "$@"
  start_services
  wait_healthy
  show_result

  # 如果带 --with-monitoring，额外启动监控服务
  local has_monitoring=false
  for arg in "$@"; do
    if [ "$arg" = "--with-monitoring" ]; then
      has_monitoring=true
      break
    fi
  done

  if [ "$has_monitoring" = true ]; then
    echo ""
    start_monitoring
  fi
}

# 执行主流程
main "$@"
