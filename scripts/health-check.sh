#!/bin/bash
# ============================================================
# health-check.sh — 综合健康检查脚本
# 宁津环卫 HSE 安全管理系统 v4.1
#
# 使用方式:
#   chmod +x scripts/health-check.sh
#   ./scripts/health-check.sh            # 标准检查（文本输出）
#   ./scripts/health-check.sh --verbose   # 详细模式（输出更多信息）
#   ./scripts/health-check.sh --json      # JSON 格式输出（便于程序解析）
#   ./scripts/health-check.sh --once     # 单次检查（不持续监控）
#
# 功能:
#   1. 检查 Docker 容器状态（前端/后端/数据库）
#   2. 检查后端 API 健康接口（/api/health）
#   3. 检查数据库连接（pg_isready）
#   4. 检查 WebSocket 连接
#   5. 检查磁盘空间
#   6. 检查内存使用
#   7. 检查可观测性监控服务状态（Prometheus/Grafana/AlertManager/Loki）(可选)
#   8. 输出检查报告（文本或 JSON 格式）
#
# 返回值:
#   0 = 全部正常
#   1 = 部分异常（服务可用但存在警告）
#   2 = 严重故障（核心服务不可用）
# ============================================================

set -euo pipefail

# ---- 颜色定义 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---- 参数解析 ----
VERBOSE=false
JSON_OUTPUT=false
CHECK_TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --verbose|-v)
        VERBOSE=true
        shift
        ;;
      --json|-j)
        JSON_OUTPUT=true
        shift
        ;;
      --help|-h)
        echo ""
        echo "用法: ./health-check.sh [选项]"
        echo ""
        echo "选项:"
        echo "  --verbose, -v   详细模式，输出更多检查细节"
        echo "  --json, -j      JSON 格式输出（便于程序解析）"
        echo "  --help, -h      显示帮助信息"
        echo ""
        echo "检查项:"
        echo "  1. Docker 容器状态（前端/后端/数据库）"
        echo "  2. 后端 API 健康接口"
        echo "  3. 数据库连接"
        echo "  4. WebSocket 连接"
        echo "  5. 磁盘空间使用率"
        echo "  6. 系统内存使用率"
        echo "  7. 可观测性监控服务（Prometheus/Grafana/AlertManager/Loki）"
        echo ""
        echo "返回值:"
        echo "  0 = 全部正常"
        echo "  1 = 部分异常（服务可用但存在警告）"
        echo "  2 = 严重故障（核心服务不可用）"
        echo ""
        exit 0
        ;;
      *)
        echo "未知参数: $1（使用 --help 查看帮助）"
        exit 1
        ;;
    esac
  done
}

# ---- 检查结果收集 ----
# 使用关联数组存储每项检查的结果
declare -A CHECK_RESULTS   # check_name => "pass|warn|fail"
declare -A CHECK_MESSAGES  # check_name => 详细信息
declare -A CHECK_TIMES     # check_name => 耗时(ms)

# ---- 辅助函数：记录检查结果 ----
record_result() {
  local name="$1"
  local status="$2"  # pass / warn / fail
  local message="$3"
  local duration="${4:-0}"

  CHECK_RESULTS["$name"]="$status"
  CHECK_MESSAGES["$name"]="$message"
  CHECK_TIMES["$name"]="$duration"
}

# ---- 文本输出函数 ----
print_text() {
  local name="$1"
  local status="$2"
  local message="$3"
  local duration="${4:-0}"

  local status_icon=""
  local color=""

  case "$status" in
    pass)
      status_icon="[OK]"
      color="$GREEN"
      ;;
    warn)
      status_icon="[WARN]"
      color="$YELLOW"
      ;;
    fail)
      status_icon="[FAIL]"
      color="$RED"
      ;;
  esac

  if [ "$VERBOSE" = true ]; then
    echo -e "${color}${status_icon}${NC} ${name}: ${message} (${duration}ms)"
  else
    echo -e "${color}${status_icon}${NC} ${name}: ${message}"
  fi
}

# ============================================================
# 检查1: Docker 容器状态
# ============================================================
check_docker_containers() {
  local start_time
  start_time=$(date +%s%N)

  local name="Docker 容器状态"
  local all_ok=true

  # 定义需要检查的容器列表
  local containers=("hse-frontend" "hse-backend" "hse-db")
  local container_errors=""

  for container in "${containers[@]}"; do
    local state
    state=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "missing")

    if [ "$state" = "missing" ]; then
      all_ok=false
      container_errors="${container_errors}  - ${container}: 容器不存在\n"
    elif [ "$state" = "running" ]; then
      # 进一步检查健康状态
      local health
      health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")
      if [ "$health" = "healthy" ]; then
        if [ "$VERBOSE" = true ]; then
          container_errors="${container_errors}  - ${container}: running (${health})\n"
        fi
      elif [ "$health" = "unhealthy" ]; then
        all_ok=false
        container_errors="${container_errors}  - ${container}: unhealthy\n"
      elif [ "$health" = "starting" ]; then
        # 容器正在启动中，标记为警告
        if [ "$all_ok" = true ]; then
          all_ok="warn_starting"
        fi
        container_errors="${container_errors}  - ${container}: starting\n"
      fi
    else
      all_ok=false
      container_errors="${container_errors}  - ${container}: ${state}\n"
    fi
  done

  local end_time
  end_time=$(date +%s%N)
  local duration=$(( (end_time - start_time) / 1000000 ))

  if [ "$all_ok" = true ]; then
    record_result "$name" "pass" "所有容器正常运行" "$duration"
  elif [ "$all_ok" = "warn_starting" ]; then
    record_result "$name" "warn" "部分容器正在启动中" "$duration"
  else
    record_result "$name" "fail" "以下容器异常:\n${container_errors}" "$duration"
  fi
}

# ============================================================
# 检查2: 后端 API 健康接口
# ============================================================
check_api_health() {
  local start_time
  start_time=$(date +%s%N)

  local name="后端 API 健康"
  local api_url="http://localhost:3000/api/health"

  # 尝试通过宿主机端口访问
  local response
  local http_code
  http_code=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "$api_url" 2>/dev/null || echo "000")

  if [ "$http_code" = "200" ]; then
    response=$(curl -sf --max-time 10 "$api_url" 2>/dev/null || echo "")
    local end_time
    end_time=$(date +%s%N)
    local duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$VERBOSE" = true ] && [ -n "$response" ]; then
      record_result "$name" "pass" "HTTP 200 — 响应: ${response:0:100}" "$duration"
    else
      record_result "$name" "pass" "HTTP 200 — API 正常响应" "$duration"
    fi
  elif [ "$http_code" = "000" ]; then
    # 连接失败，尝试通过 Docker 内部网络检查
    local internal_code
    internal_code=$(docker exec hse-frontend curl -sf -o /dev/null -w "%{http_code}" --max-time 5 http://hse-backend:3000/api/health 2>/dev/null || echo "000")

    local end_time
    end_time=$(date +%s%N)
    local duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$internal_code" = "200" ]; then
      record_result "$name" "warn" "API 通过内部网络可访问，但宿主机端口不可达（检查端口映射或防火墙）" "$duration"
    else
      record_result "$name" "fail" "API 无法访问 (HTTP ${http_code})" "$duration"
    fi
  else
    local end_time
    end_time=$(date +%s%N)
    local duration=$(( (end_time - start_time) / 1000000 ))
    record_result "$name" "fail" "API 返回异常状态码 HTTP ${http_code}" "$duration"
  fi
}

# ============================================================
# 检查3: 数据库连接
# ============================================================
check_database() {
  local start_time
  start_time=$(date +%s%N)

  local name="数据库连接"

  # 方式一：通过 pg_isready 检查（快速连接测试）
  local pg_status
  pg_status=$(docker exec hse-db pg_isready -U hse_app -d safety_dashboard -h localhost -p 5432 2>/dev/null || echo "failed")

  local end_time
  end_time=$(date +%s%N)
  local duration=$(( (end_time - start_time) / 1000000 ))

  if echo "$pg_status" | grep -q "accepting connections"; then
    # 额外检查：数据库大小和连接数
    if [ "$VERBOSE" = true ]; then
      local db_size
      db_size=$(docker exec hse-db psql -U hse_app -d safety_dashboard -t -c "SELECT pg_size_pretty(pg_database_size('safety_dashboard'));" 2>/dev/null | xargs || echo "未知")
      local conn_count
      conn_count=$(docker exec hse-db psql -U hse_app -d safety_dashboard -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname='safety_dashboard';" 2>/dev/null | xargs || echo "未知")
      record_result "$name" "pass" "PostgreSQL 正常 (数据库大小: ${db_size}, 活跃连接: ${conn_count})" "$duration"
    else
      record_result "$name" "pass" "PostgreSQL 连接正常" "$duration"
    fi
  else
    record_result "$name" "fail" "PostgreSQL 连接失败: ${pg_status}" "$duration"
  fi
}

# ============================================================
# 检查4: WebSocket 连接
# ============================================================
check_websocket() {
  local start_time
  start_time=$(date +%s%N)

  local name="WebSocket 连接"

  # 检查后端是否监听 WebSocket（检查 3000 端口上的 /ws 路径）
  # 使用 curl 发送 WebSocket 升级请求（不实际建立 WebSocket，仅检查握手响应）
  local ws_response
  ws_response=$(curl -sf -o /dev/null -w "%{http_code}" \
    -H "Upgrade: websocket" \
    -H "Connection: Upgrade" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    -H "Sec-WebSocket-Version: 13" \
    --max-time 5 \
    http://localhost:3000/ws 2>/dev/null || echo "000")

  local end_time
  end_time=$(date +%s%N)
  local duration=$(( (end_time - start_time) / 1000000 ))

  # 101 Switching Protocols 表示 WebSocket 握手成功
  if [ "$ws_response" = "101" ]; then
    record_result "$name" "pass" "WebSocket 握手正常 (HTTP 101)" "$duration"
  elif [ "$ws_response" = "426" ]; then
    record_result "$name" "warn" "WebSocket 端点存在但需要 HTTPS" "$duration"
  elif [ "$ws_response" = "000" ]; then
    # WebSocket 可能未启用（非核心功能）
    # 检查环境变量配置
    local ws_enabled
    ws_enabled=$(docker exec hse-backend printenv WS_ENABLED 2>/dev/null || echo "true")
    if [ "$ws_enabled" = "false" ]; then
      record_result "$name" "pass" "WebSocket 已禁用 (WS_ENABLED=false)" "$duration"
    else
      record_result "$name" "warn" "WebSocket 端点无响应（可能未启用或正在启动）" "$duration"
    fi
  else
    record_result "$name" "warn" "WebSocket 端点返回 HTTP ${ws_response}" "$duration"
  fi
}

# ============================================================
# 检查5: 磁盘空间
# ============================================================
check_disk_space() {
  local start_time
  start_time=$(date +%s%N)

  local name="磁盘空间"

  # 获取 Docker 数据目录所在分区的使用率
  local disk_info
  disk_info=$(df -h / 2>/dev/null | tail -1 || echo "")

  if [ -z "$disk_info" ]; then
    local end_time
    end_time=$(date +%s%N)
    local duration=$(( (end_time - start_time) / 1000000 ))
    record_result "$name" "warn" "无法获取磁盘信息" "$duration"
    return
  fi

  local usage_percent
  usage_percent=$(echo "$disk_info" | awk '{print $5}' | tr -d '%')
  local available
  available=$(echo "$disk_info" | awk '{print $4}')
  local total
  total=$(echo "$disk_info" | awk '{print $2}')
  local mount_point
  mount_point=$(echo "$disk_info" | awk '{print $6}')

  local end_time
  end_time=$(date +%s%N)
  local duration=$(( (end_time - start_time) / 1000000 ))

  if [ "$usage_percent" -lt 70 ]; then
    if [ "$VERBOSE" = true ]; then
      record_result "$name" "pass" "使用率 ${usage_percent}% (可用 ${available} / 总计 ${total}, 挂载点: ${mount_point})" "$duration"
    else
      record_result "$name" "pass" "磁盘使用率 ${usage_percent}%, 可用 ${available}" "$duration"
    fi
  elif [ "$usage_percent" -lt 90 ]; then
    record_result "$name" "warn" "磁盘使用率较高 ${usage_percent}% (可用 ${available})" "$duration"
  else
    record_result "$name" "fail" "磁盘空间不足! 使用率 ${usage_percent}% (仅剩 ${available})" "$duration"
  fi
}

# ============================================================
# 检查6: 内存使用
# ============================================================
check_memory() {
  local start_time
  start_time=$(date +%s%N)

  local name="内存使用"

  # 检查 Docker 容器的内存使用情况
  local total_mem_mb=0
  local used_mem_mb=0
  local container_count=0

  for container in hse-frontend hse-backend hse-db; do
    local mem_usage
    mem_usage=$(docker stats --no-stream --format "{{.MemUsage}}" "$container" 2>/dev/null || echo "")

    if [ -n "$mem_usage" ]; then
      # 解析内存使用字符串，例如 "123.4MiB / 512MiB"
      local used
      local limit
      used=$(echo "$mem_usage" | awk -F '/' '{print $1}' | tr -d 'MiBGiB ')
      limit=$(echo "$mem_usage" | awk -F '/' '{print $2}' | tr -d 'MiBGiB ')

      if [ -n "$used" ] && [ -n "$limit" ]; then
        # 转换为 MB（处理 GiB 情况）
        used_mem_mb=$(echo "$used_mem_mb + $(echo "$used" | awk '{printf "%.0f", $1}')" | bc 2>/dev/null || echo "$used_mem_mb")
        container_count=$((container_count + 1))
      fi

      if [ "$VERBOSE" = true ]; then
        local mem_percent
        mem_percent=$(docker stats --no-stream --format "{{.MemPerc}}" "$container" 2>/dev/null || echo "N/A")
        CHECK_MESSAGES["$name"]="${CHECK_MESSAGES[$name]}  - ${container}: ${mem_usage} (${mem_percent})\n"
      fi
    fi
  done

  local end_time
  end_time=$(date +%s%N)
  local duration=$(( (end_time - start_time) / 1000000 ))

  # 同时检查系统整体内存
  local sys_total
  local sys_available
  sys_total=$(free -m 2>/dev/null | awk '/^Mem:/ {print $2}' || echo "0")
  sys_available=$(free -m 2>/dev/null | awk '/^Mem:/ {print $7}' || echo "0")

  if [ "$sys_total" -gt 0 ]; then
    local sys_used=$((sys_total - sys_available))
    local sys_percent=$((sys_used * 100 / sys_total))

    if [ "$sys_percent" -lt 80 ]; then
      if [ "$VERBOSE" = true ]; then
        local msg="系统内存: ${sys_used}MB / ${sys_total}MB (${sys_percent}%)"
        msg="${msg}\n${CHECK_MESSAGES[$name]:-}"
        record_result "$name" "pass" "$msg" "$duration"
      else
        record_result "$name" "pass" "系统内存使用 ${sys_percent}% (${sys_available}MB 可用)" "$duration"
      fi
    elif [ "$sys_percent" -lt 95 ]; then
      record_result "$name" "warn" "系统内存使用率较高 ${sys_percent}% (可用 ${sys_available}MB)" "$duration"
    else
      record_result "$name" "fail" "系统内存严重不足! 使用率 ${sys_percent}% (仅剩 ${sys_available}MB)" "$duration"
    fi
  else
    record_result "$name" "warn" "无法获取内存信息（free 命令不可用）" "$duration"
  fi
}

# ============================================================
# 检查7: 可观测性监控服务（可选，不影响主状态）
# ============================================================
check_monitoring_services() {
  local start_time
  start_time=$(date +%s%N)

  local name="可观测性监控"
  local monitoring_results=""
  local all_ok=true

  # 定义监控服务检查项
  declare -A MONITORING_CHECKS=(
    [Prometheus]="http://localhost:9090/-/healthy|hse-prometheus|指标引擎"
    [Grafana]="http://localhost:3001/api/health|hse-grafana|可视化大屏"
    [AlertManager]="http://localhost:9093/-/healthy|hse-alertmanager|告警管理"
    [Loki]="http://localhost:3100/ready|hse-loki|日志聚合"
  )

  for svc_name in "${!MONITORING_CHECKS[@]}"; do
    IFS='|' read -r url container desc <<< "${MONITORING_CHECKS[$svc_name]}"

    # 检查端口可达性
    local http_code
    http_code=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")

    if [ "$http_code" = "200" ]; then
      monitoring_results="${monitoring_results}  - ${svc_name} (${desc}): OK\n"
    elif [ "$http_code" = "000" ]; then
      # 端口不可达，可能是未启动（非核心故障）
      # 检查容器是否存在
      local container_state
      container_state=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "not_found")

      if [ "$container_state" = "not_found" ] || [ -z "$container_state" ]; then
        monitoring_results="${monitoring_results}  - ${svc_name}: 未启动 (可选组件)\n"
        # 监控服务未启动不算主服务故障
      else
        monitoring_results="${monitoring_results}  - ${svc_name}: 异常 (HTTP ${http_code}, 容器状态: ${container_state})\n"
        all_ok=false
      fi
    else
      monitoring_results="${monitoring_results}  - ${svc_name}: 返回 HTTP ${http_code}\n"
      all_ok="warn_partial"
    fi
  done

  local end_time
  end_time=$(date +%s%N)
  local duration=$(( (end_time - start_time) / 1000000 ))

  if [ "$all_ok" = true ]; then
    record_result "$name" "pass" "所有监控组件运行正常\n${monitoring_results}" "$duration"
  elif [ "$all_ok" = "warn_partial" ]; then
    record_result "$name" "warn" "部分监控组件异常\n${monitoring_results}" "$duration"
  else
    record_result "$name" "pass" "监控服务未启动（可选）\n${monitoring_results}" "$duration"
  fi
}

# ============================================================
# 输出文本报告
# ============================================================
output_text_report() {
  echo ""
  echo "============================================================"
  echo "  HSE 安全管理系统 — 综合健康检查报告"
  echo "  检查时间: $CHECK_TIMESTAMP"
  echo "============================================================"
  echo ""

  for name in "${!CHECK_RESULTS[@]}"; do
    print_text "$name" "${CHECK_RESULTS[$name]}" "${CHECK_MESSAGES[$name]}" "${CHECK_TIMES[$name]}"
  done

  echo ""
  echo "------------------------------------------------------------"
}

# ============================================================
# 输出 JSON 报告
# ============================================================
output_json_report() {
  local pass_count=0
  local warn_count=0
  local fail_count=0

  echo "{"
  echo "  \"timestamp\": \"$CHECK_TIMESTAMP\","
  echo "  \"system\": \"宁津环卫HSE安全管理系统 v4.1\","
  echo "  \"checks\": {"

  local first=true
  for name in "${!CHECK_RESULTS[@]}"; do
    if [ "$first" = true ]; then
      first=false
    else
      echo ","
    fi

    local status="${CHECK_RESULTS[$name]}"
    local message="${CHECK_MESSAGES[$name]}"
    local duration="${CHECK_TIMES[$name]}"

    # 转义 JSON 中的特殊字符
    message=$(echo "$message" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')

    printf '    "%s": {"status": "%s", "message": "%s", "duration_ms": %s}' \
      "$name" "$status" "$message" "$duration"

    case "$status" in
      pass) pass_count=$((pass_count + 1)) ;;
      warn) warn_count=$((warn_count + 1)) ;;
      fail) fail_count=$((fail_count + 1)) ;;
    esac
  done

  echo ""
  echo "  },"
  echo "  \"summary\": {"
  echo "    \"total\": $((pass_count + warn_count + fail_count)),"
  echo "    \"pass\": $pass_count,"
  echo "    \"warn\": $warn_count,"
  echo "    \"fail\": $fail_count"
  echo "  }"
  echo "}"
}

# ============================================================
# 计算并返回总体状态
# ============================================================
get_overall_status() {
  local has_fail=false
  local has_warn=false

  for name in "${!CHECK_RESULTS[@]}"; do
    case "${CHECK_RESULTS[$name]}" in
      fail) has_fail=true ;;
      warn) has_warn=true ;;
    esac
  done

  if [ "$has_fail" = true ]; then
    return 2  # 严重故障
  elif [ "$has_warn" = true ]; then
    return 1  # 部分异常
  else
    return 0  # 全部正常
  fi
}

# ============================================================
# 主流程
# ============================================================
main() {
  parse_args "$@"

  # 执行所有检查
  check_docker_containers
  check_api_health
  check_database
  check_websocket
  check_disk_space
  check_memory
  check_monitoring_services

  # 输出报告
  if [ "$JSON_OUTPUT" = true ]; then
    output_json_report
  else
    output_text_report

    # 输出总结
    local total=${#CHECK_RESULTS[@]}
    local pass=0 warn=0 fail=0

    for name in "${!CHECK_RESULTS[@]}"; do
      case "${CHECK_RESULTS[$name]}" in
        pass) pass=$((pass + 1)) ;;
        warn) warn=$((warn + 1)) ;;
        fail) fail=$((fail + 1)) ;;
      esac
    done

    echo -e "  总计: ${total} 项 | ${GREEN}通过: ${pass}${NC} | ${YELLOW}警告: ${warn}${NC} | ${RED}失败: ${fail}${NC}"
    echo ""
    echo "============================================================"
    echo ""
  fi

  # 返回总体状态码
  get_overall_status
}

main "$@"
