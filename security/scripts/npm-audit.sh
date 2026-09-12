#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# 宁津环卫 HSE 安全管理系统 v4.1 — npm audit 扫描脚本
# 用途: 对前端 (pnpm) 和后端 (npm) 执行依赖漏洞审计
# 输出: security/scans/npm-audit/ 目录下 JSON + 人类可读报告
# ============================================================================

# ---- 颜色定义 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ---- 项目根目录 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCAN_DIR="$PROJECT_ROOT/security/scans/npm-audit"
FRONTEND_DIR="$PROJECT_ROOT/安全看板vben"
BACKEND_DIR="$PROJECT_ROOT/server"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

# ---- 创建输出目录 ----
mkdir -p "$SCAN_DIR"

# ---- 打印 Banner ----
echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}  npm audit 扫描 — 宁津环卫 HSE 安全管理系统 v4.1${NC}"
echo -e "${CYAN}  扫描时间: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${CYAN}================================================================${NC}"
echo ""

# ---- 统计变量 ----
total_vulnerabilities=0
frontend_vulns=0
backend_vulns=0

# ============================================================================
# 1. 前端扫描 (pnpm audit --prod --json)
# ============================================================================
echo -e "${BLUE}[1/2] 前端扫描 (pnpm) — 安全看板vben/${NC}"
echo -e "       路径: $FRONTEND_DIR"
echo ""

if command -v pnpm &> /dev/null; then
    echo -e "${GREEN}[+] pnpm 已检测到: $(pnpm --version)${NC}"

    FRONTEND_JSON="$SCAN_DIR/frontend-audit-${TIMESTAMP}.json"
    FRONTEND_TXT="$SCAN_DIR/frontend-audit-${TIMESTAMP}.txt"

    echo -e "${YELLOW}    正在执行 pnpm audit --prod --json ...${NC}"
    if pnpm --dir "$FRONTEND_DIR" audit --prod --json > "$FRONTEND_JSON" 2>&1; then
        echo -e "${GREEN}    [OK] 前端扫描完成${NC}"
    else
        echo -e "${RED}    [!] 前端发现安全漏洞 (退出码非零为预期行为)${NC}"
    fi

    # 生成可读报告
    echo -e "前端 npm audit 报告 — $(date '+%Y-%m-%d %H:%M:%S')" > "$FRONTEND_TXT"
    echo "扫描命令: pnpm audit --prod --json" >> "$FRONTEND_TXT"
    echo "扫描目录: $FRONTEND_DIR" >> "$FRONTEND_TXT"
    echo "================================================" >> "$FRONTEND_TXT"

    # 使用 npm audit 的 human-readable 输出作为补充
    if pnpm --dir "$FRONTEND_DIR" audit --prod 2>&1 | tee -a "$FRONTEND_TXT"; then
        :
    fi

    # 提取漏洞统计
    if command -v jq &> /dev/null; then
        frontend_vulns=$(jq '[.vulnerabilities // {} | to_entries[] | .value] | length' "$FRONTEND_JSON" 2>/dev/null || echo "0")
        frontend_critical=$(jq '[.vulnerabilities // {} | to_entries[] | select(.value.severity == "critical")] | length' "$FRONTEND_JSON" 2>/dev/null || echo "0")
        frontend_high=$(jq '[.vulnerabilities // {} | to_entries[] | select(.value.severity == "high")] | length' "$FRONTEND_JSON" 2>/dev/null || echo "0")
        frontend_medium=$(jq '[.vulnerabilities // {} | to_entries[] | select(.value.severity == "moderate" or .value.severity == "medium")] | length' "$FRONTEND_JSON" 2>/dev/null || echo "0")
        frontend_low=$(jq '[.vulnerabilities // {} | to_entries[] | select(.value.severity == "low")] | length' "$FRONTEND_JSON" 2>/dev/null || echo "0")

        echo "" >> "$FRONTEND_TXT"
        echo "漏洞统计:" >> "$FRONTEND_TXT"
        echo "  Critical: $frontend_critical" >> "$FRONTEND_TXT"
        echo "  High:     $frontend_high" >> "$FRONTEND_TXT"
        echo "  Medium:   $frontend_medium" >> "$FRONTEND_TXT"
        echo "  Low:      $frontend_low" >> "$FRONTEND_TXT"
    fi

    echo -e "    JSON 报告: $FRONTEND_JSON"
    echo -e "    TXT  报告: $FRONTEND_TXT"
else
    echo -e "${RED}[-] pnpm 未安装，跳过前端扫描${NC}"
    echo -e "${YELLOW}    安装方式: corepack enable && corepack prepare pnpm@latest --activate${NC}"
    FRONTEND_JSON=""
    FRONTEND_TXT=""
fi

echo ""

# ============================================================================
# 2. 后端扫描 (npm audit --json)
# ============================================================================
echo -e "${BLUE}[2/2] 后端扫描 (npm) — server/${NC}"
echo -e "       路径: $BACKEND_DIR"
echo ""

if command -v npm &> /dev/null; then
    echo -e "${GREEN}[+] npm 已检测到: $(npm --version)${NC}"

    BACKEND_JSON="$SCAN_DIR/backend-audit-${TIMESTAMP}.json"
    BACKEND_TXT="$SCAN_DIR/backend-audit-${TIMESTAMP}.txt"

    echo -e "${YELLOW}    正在执行 npm audit --json ...${NC}"
    if npm --prefix "$BACKEND_DIR" audit --json > "$BACKEND_JSON" 2>&1; then
        echo -e "${GREEN}    [OK] 后端扫描完成，未发现已知漏洞${NC}"
    else
        echo -e "${RED}    [!] 后端发现安全漏洞 (退出码非零为预期行为)${NC}"
    fi

    # 生成可读报告
    echo -e "后端 npm audit 报告 — $(date '+%Y-%m-%d %H:%M:%S')" > "$BACKEND_TXT"
    echo "扫描命令: npm audit --json" >> "$BACKEND_TXT"
    echo "扫描目录: $BACKEND_DIR" >> "$BACKEND_TXT"
    echo "================================================" >> "$BACKEND_TXT"

    if npm --prefix "$BACKEND_DIR" audit 2>&1 | tee -a "$BACKEND_TXT"; then
        :
    fi

    # 提取漏洞统计
    if command -v jq &> /dev/null; then
        backend_vulns=$(jq '[.vulnerabilities // {} | to_entries[] | .value] | length' "$BACKEND_JSON" 2>/dev/null || echo "0")
        backend_critical=$(jq '[.vulnerabilities // {} | to_entries[] | select(.value.severity == "critical")] | length' "$BACKEND_JSON" 2>/dev/null || echo "0")
        backend_high=$(jq '[.vulnerabilities // {} | to_entries[] | select(.value.severity == "high")] | length' "$BACKEND_JSON" 2>/dev/null || echo "0")
        backend_medium=$(jq '[.vulnerabilities // {} | to_entries[] | select(.value.severity == "moderate" or .value.severity == "medium")] | length' "$BACKEND_JSON" 2>/dev/null || echo "0")
        backend_low=$(jq '[.vulnerabilities // {} | to_entries[] | select(.value.severity == "low")] | length' "$BACKEND_JSON" 2>/dev/null || echo "0")

        echo "" >> "$BACKEND_TXT"
        echo "漏洞统计:" >> "$BACKEND_TXT"
        echo "  Critical: $backend_critical" >> "$BACKEND_TXT"
        echo "  High:     $backend_high" >> "$BACKEND_TXT"
        echo "  Medium:   $backend_medium" >> "$BACKEND_TXT"
        echo "  Low:      $backend_low" >> "$BACKEND_TXT"
    fi

    echo -e "    JSON 报告: $BACKEND_JSON"
    echo -e "    TXT  报告: $BACKEND_TXT"
else
    echo -e "${RED}[-] npm 未安装，跳过后端扫描${NC}"
    echo -e "${YELLOW}    安装方式: https://nodejs.org/${NC}"
    BACKEND_JSON=""
    BACKEND_TXT=""
fi

echo ""

# ============================================================================
# 3. 汇总
# ============================================================================
SUMMARY_FILE="$SCAN_DIR/audit-summary-${TIMESTAMP}.txt"

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}  扫描汇总${NC}"
echo -e "${CYAN}================================================================${NC}"

echo "npm audit 扫描汇总 — $(date '+%Y-%m-%d %H:%M:%S')" > "$SUMMARY_FILE"
echo "项目: 宁津环卫 HSE 安全管理系统 v4.1" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"

echo "前端 (pnpm):  $frontend_vulns 个漏洞" | tee -a "$SUMMARY_FILE"
echo "后端 (npm):   $backend_vulns 个漏洞" | tee -a "$SUMMARY_FILE"
echo "合计:         $((frontend_vulns + backend_vulns)) 个已知依赖漏洞" | tee -a "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"
echo "扫描结果目录: $SCAN_DIR" >> "$SUMMARY_FILE"

echo ""
echo -e "${GREEN}[完成] 所有报告已保存至: $SCAN_DIR${NC}"
echo -e "${GREEN}       汇总文件: $SUMMARY_FILE${NC}"
