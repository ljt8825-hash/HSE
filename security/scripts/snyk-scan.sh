#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# 宁津环卫 HSE 安全管理系统 v4.1 — Snyk 安全扫描脚本
# 用途: 使用 Snyk 对前端/后端依赖进行已知漏洞扫描 + IaC 配置扫描
# 输出: security/scans/snyk/ 目录下 JSON 报告
# 前置条件: SNYK_TOKEN 环境变量已设置, snyk CLI 已安装
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
SCAN_DIR="$PROJECT_ROOT/security/scans/snyk"
FRONTEND_DIR="$PROJECT_ROOT/安全看板vben"
BACKEND_DIR="$PROJECT_ROOT/server"
IAC_FILE="$PROJECT_ROOT/docker-compose.production.yml"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$SCAN_DIR"

# ---- Banner ----
echo -e "${MAGENTA}================================================================${NC}"
echo -e "${MAGENTA}  Snyk 安全扫描 — 宁津环卫 HSE 安全管理系统 v4.1${NC}"
echo -e "${MAGENTA}  扫描时间: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${MAGENTA}================================================================${NC}"
echo ""

# ---- 预检查: Snyk CLI ----
if ! command -v snyk &> /dev/null; then
    echo -e "${YELLOW}[跳过] Snyk CLI 未安装${NC}"
    echo -e "${YELLOW}       安装方式: npm install -g snyk${NC}"
    echo -e "${YELLOW}       文档: https://docs.snyk.io/snyk-cli/install-and-configure${NC}"
    echo ""
    echo -e "${YELLOW}       创建占位报告 ...${NC}"
    SKIP_FILE="$SCAN_DIR/skipped-${TIMESTAMP}.txt"
    echo "Snyk 扫描跳过 — $(date '+%Y-%m-%d %H:%M:%S')" > "$SKIP_FILE"
    echo "原因: Snyk CLI 未安装" >> "$SKIP_FILE"
    echo "" >> "$SKIP_FILE"
    echo "安装步骤:" >> "$SKIP_FILE"
    echo "  1. npm install -g snyk" >> "$SKIP_FILE"
    echo "  2. snyk auth (或设置 SNYK_TOKEN 环境变量)" >> "$SKIP_FILE"
    echo "  3. 重新运行本脚本" >> "$SKIP_FILE"
    exit 0
fi

echo -e "${GREEN}[+] Snyk CLI 已检测到: $(snyk --version 2>/dev/null | head -1 || echo 'version unknown')${NC}"

# ---- 预检查: SNYK_TOKEN ----
if [[ -z "${SNYK_TOKEN:-}" ]]; then
    echo -e "${YELLOW}[警告] SNYK_TOKEN 环境变量未设置${NC}"
    echo -e "${YELLOW}       Snyk 将使用交互式认证或已有会话${NC}"
    echo -e "${YELLOW}       推荐设置: export SNYK_TOKEN=your-token-here${NC}"
    echo ""
else
    echo -e "${GREEN}[+] SNYK_TOKEN 已设置 (${#SNYK_TOKEN} 字符)${NC}"
fi

echo ""

# ---- 统计变量 ----
snyk_issues_total=0

# ============================================================================
# 1. 前端扫描 (pnpm 项目)
# ============================================================================
echo -e "${BLUE}[1/3] 前端依赖扫描 — 安全看板vben/${NC}"
echo ""

FRONTEND_JSON="$SCAN_DIR/frontend-snyk-${TIMESTAMP}.json"

if [[ -f "$FRONTEND_DIR/package.json" ]]; then
    echo -e "${YELLOW}    正在执行: snyk test --json ...${NC}"
    if snyk test --json --file="$FRONTEND_DIR/package.json" > "$FRONTEND_JSON" 2>&1; then
        echo -e "${GREEN}    [OK] 前端扫描完成，未发现已知漏洞${NC}"
    else
        echo -e "${RED}    [!] 前端发现安全漏洞${NC}"
    fi
    echo -e "    报告: $FRONTEND_JSON"
else
    echo -e "${RED}    [-] 前端 package.json 不存在，跳过${NC}"
fi

echo ""

# ============================================================================
# 2. 后端扫描 (npm 项目)
# ============================================================================
echo -e "${BLUE}[2/3] 后端依赖扫描 — server/${NC}"
echo ""

BACKEND_JSON="$SCAN_DIR/backend-snyk-${TIMESTAMP}.json"

if [[ -f "$BACKEND_DIR/package.json" ]]; then
    echo -e "${YELLOW}    正在执行: snyk test --json ...${NC}"
    if snyk test --json --file="$BACKEND_DIR/package.json" > "$BACKEND_JSON" 2>&1; then
        echo -e "${GREEN}    [OK] 后端扫描完成，未发现已知漏洞${NC}"
    else
        echo -e "${RED}    [!] 后端发现安全漏洞${NC}"
    fi
    echo -e "    报告: $BACKEND_JSON"
else
    echo -e "${RED}    [-] 后端 package.json 不存在，跳过${NC}"
fi

echo ""

# ============================================================================
# 3. IaC 扫描 (docker-compose.production.yml)
# ============================================================================
echo -e "${BLUE}[3/3] IaC 配置扫描 — docker-compose.production.yml${NC}"
echo ""

IAC_JSON="$SCAN_DIR/iac-snyk-${TIMESTAMP}.json"

if [[ -f "$IAC_FILE" ]]; then
    echo -e "${YELLOW}    正在执行: snyk iac test --json ...${NC}"
    if snyk iac test --json "$IAC_FILE" > "$IAC_JSON" 2>&1; then
        echo -e "${GREEN}    [OK] IaC 扫描完成，未发现配置问题${NC}"
    else
        echo -e "${RED}    [!] IaC 扫描发现配置问题${NC}"
    fi
    echo -e "    报告: $IAC_JSON"
else
    echo -e "${RED}    [-] docker-compose.production.yml 不存在，跳过 IaC 扫描${NC}"
fi

echo ""

# ============================================================================
# 4. 汇总
# ============================================================================
SUMMARY_FILE="$SCAN_DIR/snyk-summary-${TIMESTAMP}.txt"

echo -e "${MAGENTA}================================================================${NC}"
echo -e "${MAGENTA}  Snyk 扫描汇总${NC}"
echo -e "${MAGENTA}================================================================${NC}"

echo "Snyk 扫描汇总 — $(date '+%Y-%m-%d %H:%M:%S')" > "$SUMMARY_FILE"
echo "项目: 宁津环卫 HSE 安全管理系统 v4.1" >> "$SUMMARY_FILE"
echo "Snyk 版本: $(snyk --version 2>/dev/null | head -1 || echo 'unknown')" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"

# 统计漏洞
if command -v jq &> /dev/null; then
    fe_issues=$(jq '[.vulnerabilities // [] | .[]] | length' "$FRONTEND_JSON" 2>/dev/null || echo "0")
    be_issues=$(jq '[.vulnerabilities // [] | .[]] | length' "$BACKEND_JSON" 2>/dev/null || echo "0")
    iac_issues=$(jq '[.vulnerabilities // [] | .[]] | length' "$IAC_JSON" 2>/dev/null || echo "0")

    echo "前端依赖:  $fe_issues 个问题" | tee -a "$SUMMARY_FILE"
    echo "后端依赖:  $be_issues 个问题" | tee -a "$SUMMARY_FILE"
    echo "IaC 配置:  $iac_issues 个问题" | tee -a "$SUMMARY_FILE"
    echo "合计:      $((fe_issues + be_issues + iac_issues)) 个问题" | tee -a "$SUMMARY_FILE"
else
    echo "前端依赖:  详见 $FRONTEND_JSON" | tee -a "$SUMMARY_FILE"
    echo "后端依赖:  详见 $BACKEND_JSON" | tee -a "$SUMMARY_FILE"
    echo "IaC 配置:  详见 $IAC_JSON" | tee -a "$SUMMARY_FILE"
    echo "(安装 jq 以获取详细统计)" | tee -a "$SUMMARY_FILE"
fi

echo "" >> "$SUMMARY_FILE"
echo "扫描结果目录: $SCAN_DIR" >> "$SUMMARY_FILE"

echo ""
echo -e "${GREEN}[完成] 所有 Snyk 报告已保存至: $SCAN_DIR${NC}"
echo -e "${GREEN}       汇总文件: $SUMMARY_FILE${NC}"
