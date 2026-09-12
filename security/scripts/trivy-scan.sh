#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# 宁津环卫 HSE 安全管理系统 v4.1 — Trivy 安全扫描脚本
# 用途: 使用 Trivy 对 Docker 镜像和文件系统进行漏洞扫描
# 输出: security/scans/trivy/ 目录下 JSON + 表格报告
# 前置条件: trivy CLI 已安装
# ============================================================================

# ---- 颜色定义 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'

# ---- 项目根目录 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCAN_DIR="$PROJECT_ROOT/security/scans/trivy"
FRONTEND_DIR="$PROJECT_ROOT/安全看板vben"
BACKEND_DIR="$PROJECT_ROOT/server"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$SCAN_DIR"

# ---- Docker 镜像列表 ----
IMAGES=(
    "hse-frontend:latest"
    "hse-backend:latest"
    "postgres:17-alpine"
)

# ---- Banner ----
echo -e "${MAGENTA}================================================================${NC}"
echo -e "${MAGENTA}  Trivy 安全扫描 — 宁津环卫 HSE 安全管理系统 v4.1${NC}"
echo -e "${MAGENTA}  扫描时间: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${MAGENTA}================================================================${NC}"
echo ""

# ---- 预检查: Trivy CLI ----
if ! command -v trivy &> /dev/null; then
    echo -e "${YELLOW}[跳过] Trivy CLI 未安装${NC}"
    echo -e "${YELLOW}       安装方式 (Linux):${NC}"
    echo -e "${YELLOW}         curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/install.sh | sh -s -- -b /usr/local/bin${NC}"
    echo -e "${YELLOW}       安装方式 (macOS):${NC}"
    echo -e "${YELLOW}         brew install trivy${NC}"
    echo -e "${YELLOW}       文档: https://aquasecurity.github.io/trivy/latest/getting-started/installation/${NC}"
    echo ""
    echo -e "${YELLOW}       创建占位报告 ...${NC}"
    SKIP_FILE="$SCAN_DIR/skipped-${TIMESTAMP}.txt"
    echo "Trivy 扫描跳过 — $(date '+%Y-%m-%d %H:%M:%S')" > "$SKIP_FILE"
    echo "原因: Trivy CLI 未安装" >> "$SKIP_FILE"
    echo "" >> "$SKIP_FILE"
    echo "安装步骤:" >> "$SKIP_FILE"
    echo "  Linux: curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/install.sh | sh -s -- -b /usr/local/bin" >> "$SKIP_FILE"
    echo "  macOS: brew install trivy" >> "$SKIP_FILE"
    echo "  重新运行本脚本" >> "$SKIP_FILE"
    exit 0
fi

TRIVY_VERSION=$(trivy --version 2>/dev/null | head -1 || echo 'version unknown')
echo -e "${GREEN}[+] Trivy 已检测到: $TRIVY_VERSION${NC}"

# ---- 检查 Docker ----
DOCKER_AVAILABLE=false
if command -v docker &> /dev/null && docker info &> /dev/null 2>&1; then
    DOCKER_AVAILABLE=true
    echo -e "${GREEN}[+] Docker 可用 — 将执行镜像扫描${NC}"
else
    echo -e "${YELLOW}[警告] Docker 不可用 — 跳过镜像扫描，仅执行文件系统扫描${NC}"
fi

echo ""

# ---- 统计变量 ----
total_critical=0
total_high=0
total_medium=0
total_low=0

# ============================================================================
# 1. Docker 镜像扫描
# ============================================================================
if [[ "$DOCKER_AVAILABLE" == true ]]; then
    echo -e "${BLUE}[1/5] Docker 镜像扫描${NC}"
    echo ""

    for img in "${IMAGES[@]}"; do
        img_safe=$(echo "$img" | tr '/:' '_')
        JSON_FILE="$SCAN_DIR/image-${img_safe}-${TIMESTAMP}.json"
        TABLE_FILE="$SCAN_DIR/image-${img_safe}-${TIMESTAMP}.txt"

        # 检查镜像是否存在
        if ! docker image inspect "$img" &> /dev/null 2>&1; then
            echo -e "${YELLOW}    [-] 镜像 $img 不存在，跳过${NC}"
            echo "镜像 $img — 不存在，已跳过" >> "$TABLE_FILE"
            continue
        fi

        echo -e "${YELLOW}    正在扫描镜像: $img ...${NC}"

        # JSON 格式报告
        if trivy image --format json --output "$JSON_FILE" --quiet "$img" 2>/dev/null; then
            echo -e "${GREEN}    [OK] $img 扫描完成${NC}"
        else
            echo -e "${RED}    [!] $img 扫描完成 (发现漏洞)${NC}"
        fi

        # 表格格式报告 (人类可读)
        echo "Trivy 镜像扫描报告 — $img" > "$TABLE_FILE"
        echo "扫描时间: $(date '+%Y-%m-%d %H:%M:%S')" >> "$TABLE_FILE"
        echo "================================================" >> "$TABLE_FILE"
        trivy image --format table --quiet "$img" >> "$TABLE_FILE" 2>/dev/null || true

        # 统计 (JSON)
        if command -v jq &> /dev/null && [[ -f "$JSON_FILE" ]]; then
            img_crit=$(jq '[.Results // [] | .[] | .Vulnerabilities // [] | .[] | select(.Severity == "CRITICAL")] | length' "$JSON_FILE" 2>/dev/null || echo "0")
            img_high=$(jq '[.Results // [] | .[] | .Vulnerabilities // [] | .[] | select(.Severity == "HIGH")] | length' "$JSON_FILE" 2>/dev/null || echo "0")
            img_med=$(jq '[.Results // [] | .[] | .Vulnerabilities // [] | .[] | select(.Severity == "MEDIUM")] | length' "$JSON_FILE" 2>/dev/null || echo "0")
            img_low=$(jq '[.Results // [] | .[] | .Vulnerabilities // [] | .[] | select(.Severity == "LOW")] | length' "$JSON_FILE" 2>/dev/null || echo "0")

            total_critical=$((total_critical + img_crit))
            total_high=$((total_high + img_high))
            total_medium=$((total_medium + img_med))
            total_low=$((total_low + img_low))

            echo -e "    ${RED}CRITICAL: $img_crit${NC}  ${RED}HIGH: $img_high${NC}  ${YELLOW}MEDIUM: $img_med${NC}  ${NC}LOW: $img_low"
        fi

        echo -e "    报告: $JSON_FILE / $TABLE_FILE"
        echo ""
    done
else
    echo -e "${YELLOW}[1/5] Docker 镜像扫描 — 跳过 (Docker 不可用)${NC}"
    echo ""
fi

# ============================================================================
# 2. 文件系统扫描 — 前端
# ============================================================================
echo -e "${BLUE}$([[ "$DOCKER_AVAILABLE" == true ]] && echo "[2/5]" || echo "[1/3]") 文件系统扫描 — 安全看板vben/ (前端)${NC}"
echo ""

FS_FE_JSON="$SCAN_DIR/fs-frontend-${TIMESTAMP}.json"
FS_FE_TXT="$SCAN_DIR/fs-frontend-${TIMESTAMP}.txt"

echo -e "${YELLOW}    正在执行: trivy fs --json ...${NC}"
if trivy fs --format json --output "$FS_FE_JSON" --quiet "$FRONTEND_DIR" 2>/dev/null; then
    echo -e "${GREEN}    [OK] 前端文件系统扫描完成${NC}"
else
    echo -e "${RED}    [!] 前端文件系统扫描发现漏洞${NC}"
fi

echo "Trivy 文件系统扫描 — 前端 (安全看板vben/)" > "$FS_FE_TXT"
echo "扫描时间: $(date '+%Y-%m-%d %H:%M:%S')" >> "$FS_FE_TXT"
echo "================================================" >> "$FS_FE_TXT"
trivy fs --format table --quiet "$FRONTEND_DIR" >> "$FS_FE_TXT" 2>/dev/null || true
echo -e "    报告: $FS_FE_JSON / $FS_FE_TXT"
echo ""

# ============================================================================
# 3. 文件系统扫描 — 后端
# ============================================================================
echo -e "${BLUE}$([[ "$DOCKER_AVAILABLE" == true ]] && echo "[3/5]" || echo "[2/3]") 文件系统扫描 — server/ (后端)${NC}"
echo ""

FS_BE_JSON="$SCAN_DIR/fs-backend-${TIMESTAMP}.json"
FS_BE_TXT="$SCAN_DIR/fs-backend-${TIMESTAMP}.txt"

echo -e "${YELLOW}    正在执行: trivy fs --json ...${NC}"
if trivy fs --format json --output "$FS_BE_JSON" --quiet "$BACKEND_DIR" 2>/dev/null; then
    echo -e "${GREEN}    [OK] 后端文件系统扫描完成${NC}"
else
    echo -e "${RED}    [!] 后端文件系统扫描发现漏洞${NC}"
fi

echo "Trivy 文件系统扫描 — 后端 (server/)" > "$FS_BE_TXT"
echo "扫描时间: $(date '+%Y-%m-%d %H:%M:%S')" >> "$FS_BE_TXT"
echo "================================================" >> "$FS_BE_TXT"
trivy fs --format table --quiet "$BACKEND_DIR" >> "$FS_BE_TXT" 2>/dev/null || true
echo -e "    报告: $FS_BE_JSON / $FS_BE_TXT"
echo ""

# ============================================================================
# 4. 汇总
# ============================================================================
SUMMARY_FILE="$SCAN_DIR/trivy-summary-${TIMESTAMP}.txt"

echo -e "${MAGENTA}================================================================${NC}"
echo -e "${MAGENTA}  Trivy 扫描汇总${NC}"
echo -e "${MAGENTA}================================================================${NC}"

echo "Trivy 扫描汇总 — $(date '+%Y-%m-%d %H:%M:%S')" > "$SUMMARY_FILE"
echo "项目: 宁津环卫 HSE 安全管理系统 v4.1" >> "$SUMMARY_FILE"
echo "Trivy 版本: $TRIVY_VERSION" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"

if [[ "$DOCKER_AVAILABLE" == true ]]; then
    echo "镜像扫描:" | tee -a "$SUMMARY_FILE"
    echo "  CRITICAL: $total_critical" | tee -a "$SUMMARY_FILE"
    echo "  HIGH:     $total_high" | tee -a "$SUMMARY_FILE"
    echo "  MEDIUM:   $total_medium" | tee -a "$SUMMARY_FILE"
    echo "  LOW:      $total_low" | tee -a "$SUMMARY_FILE"
    echo "" | tee -a "$SUMMARY_FILE"
fi

echo "文件系统扫描:" | tee -a "$SUMMARY_FILE"
echo "  前端: $FS_FE_JSON" | tee -a "$SUMMARY_FILE"
echo "  后端: $FS_BE_JSON" | tee -a "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"
echo "扫描结果目录: $SCAN_DIR" >> "$SUMMARY_FILE"

echo ""
echo -e "${GREEN}[完成] 所有 Trivy 报告已保存至: $SCAN_DIR${NC}"
echo -e "${GREEN}       汇总文件: $SUMMARY_FILE${NC}"
