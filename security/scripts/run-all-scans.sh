#!/usr/bin/env bash
# ============================================================================
# 宁津环卫 HSE 安全管理系统 v4.1 — 一键执行全部安全扫描
# 用途: 依次调用 npm-audit / snyk-scan / trivy-scan / secret-scan
# 特性: Snyk/Trivy 不存在时自动跳过，不报错；彩色 banner + 汇总输出
# ============================================================================

# 不设置 set -e，因为子脚本可能在 Snyk/Trivy 缺失时 exit 0
set -uo pipefail

# ---- 颜色定义 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
NC='\033[0m'
BOLD='\033[1m'

# ---- 路径 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
FINAL_SUMMARY="$PROJECT_ROOT/security/scans/all-scans-summary-${TIMESTAMP}.txt"

mkdir -p "$PROJECT_ROOT/security/scans"

# ---- 大 Banner ----
echo ""
echo -e "${WHITE}${BOLD}  ███████╗███████╗███╗   ██╗████████╗██████╗  ██████╗ ████████╗███████╗██████╗ ██╗   ██╗███╗   ███╗███████╗██████╗ ${NC}"
echo -e "${WHITE}${BOLD}  ██╔════╝██╔════╝████╗  ██║╚══██╔══╝██╔══██╗██╔═══██╗╚══██╔══╝██╔════╝██╔══██╗██║   ██║████╗ ████║██╔════╝██╔══██╗${NC}"
echo -e "${WHITE}${BOLD}  ███████╗█████╗  ██╔██╗ ██║   ██║   ██████╔╝██║   ██║   ██║   █████╗  ██████╔╝██║   ██║██╔████╔██║█████╗  ██████╔╝${NC}"
echo -e "${WHITE}${BOLD}  ╚════██║██╔══╝  ██║╚██╗██║   ██║   ██╔══██╗██║   ██║   ██║   ██╔══╝  ██╔══██╗██║   ██║██║╚██╔╝██║██╔══╝  ██╔══██╗${NC}"
echo -e "${WHITE}${BOLD}  ███████║███████╗██║ ╚████║   ██║   ██║  ██║╚██████╔╝   ██║   ███████╗██║  ██║╚██████╔╝██║ ╚═╝ ██║███████╗██║  ██║${NC}"
echo -e "${WHITE}${BOLD}  ╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝    ╚═╝   ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝${NC}"
echo ""
echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}  宁津环卫 HSE 安全管理系统 v4.1 — 全量安全扫描${NC}"
echo -e "${CYAN}  扫描时间: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${CYAN}  扫描范围: npm audit + Snyk + Trivy + 硬编码密钥${NC}"
echo -e "${CYAN}================================================================${NC}"
echo ""

# ---- 初始化汇总文件 ----
echo "全量安全扫描汇总" > "$FINAL_SUMMARY"
echo "================================================" >> "$FINAL_SUMMARY"
echo "项目: 宁津环卫 HSE 安全管理系统 v4.1" >> "$FINAL_SUMMARY"
echo "扫描时间: $(date '+%Y-%m-%d %H:%M:%S')" >> "$FINAL_SUMMARY"
echo "" >> "$FINAL_SUMMARY"

# ---- 追踪结果 ----
declare -A scan_status
scan_status[npm-audit]="pending"
scan_status[snyk]="pending"
scan_status[trivy]="pending"
scan_status[secret]="pending"

# ============================================================================
# [1/4] npm audit 扫描
# ============================================================================
echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}  [1/4] npm audit 扫描 — 依赖漏洞检测${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

if [[ -x "$SCRIPT_DIR/npm-audit.sh" ]]; then
    if bash "$SCRIPT_DIR/npm-audit.sh" 2>&1 | tee -a "$FINAL_SUMMARY"; then
        scan_status[npm-audit]="success"
    else
        scan_status[npm-audit]="failed"
    fi
else
    echo -e "${RED}[-] npm-audit.sh 不存在或不可执行${NC}" | tee -a "$FINAL_SUMMARY"
    scan_status[npm-audit]="skipped"
fi

echo ""
echo -e "${GREEN}────────────────────────────────────────────────────────────${NC}"
echo ""

# ============================================================================
# [2/4] Snyk 扫描 (可选)
# ============================================================================
echo -e "${MAGENTA}================================================================${NC}"
echo -e "${MAGENTA}  [2/4] Snyk 扫描 — 已知漏洞深度检测 (可选)${NC}"
echo -e "${MAGENTA}================================================================${NC}"
echo ""

if [[ -x "$SCRIPT_DIR/snyk-scan.sh" ]]; then
    if bash "$SCRIPT_DIR/snyk-scan.sh" 2>&1 | tee -a "$FINAL_SUMMARY"; then
        scan_status[snyk]="success"
    else
        # Snyk 不存在时脚本会 exit 0 并创建 skipped 文件
        if command -v snyk &> /dev/null; then
            scan_status[snyk]="failed"
        else
            scan_status[snyk]="skipped"
        fi
    fi
else
    echo -e "${YELLOW}[-] snyk-scan.sh 不存在或不可执行${NC}" | tee -a "$FINAL_SUMMARY"
    scan_status[snyk]="skipped"
fi

echo ""
echo -e "${GREEN}────────────────────────────────────────────────────────────${NC}"
echo ""

# ============================================================================
# [3/4] Trivy 扫描 (可选)
# ============================================================================
echo -e "${MAGENTA}================================================================${NC}"
echo -e "${MAGENTA}  [3/4] Trivy 扫描 — 容器镜像 + 文件系统漏洞 (可选)${NC}"
echo -e "${MAGENTA}================================================================${NC}"
echo ""

if [[ -x "$SCRIPT_DIR/trivy-scan.sh" ]]; then
    if bash "$SCRIPT_DIR/trivy-scan.sh" 2>&1 | tee -a "$FINAL_SUMMARY"; then
        scan_status[trivy]="success"
    else
        if command -v trivy &> /dev/null; then
            scan_status[trivy]="failed"
        else
            scan_status[trivy]="skipped"
        fi
    fi
else
    echo -e "${YELLOW}[-] trivy-scan.sh 不存在或不可执行${NC}" | tee -a "$FINAL_SUMMARY"
    scan_status[trivy]="skipped"
fi

echo ""
echo -e "${GREEN}────────────────────────────────────────────────────────────${NC}"
echo ""

# ============================================================================
# [4/4] 硬编码密钥扫描
# ============================================================================
echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}  [4/4] 硬编码密钥扫描 — 源码敏感信息检测${NC}"
echo -e "${CYAN}================================================================${NC}"
echo ""

if [[ -x "$SCRIPT_DIR/secret-scan.sh" ]]; then
    if bash "$SCRIPT_DIR/secret-scan.sh" 2>&1 | tee -a "$FINAL_SUMMARY"; then
        scan_status[secret]="success"
    else
        scan_status[secret]="failed"
    fi
else
    echo -e "${RED}[-] secret-scan.sh 不存在或不可执行${NC}" | tee -a "$FINAL_SUMMARY"
    scan_status[secret]="skipped"
fi

echo ""
echo -e "${GREEN}────────────────────────────────────────────────────────────${NC}"
echo ""

# ============================================================================
# 最终汇总
# ============================================================================
echo "" >> "$FINAL_SUMMARY"
echo "" >> "$FINAL_SUMMARY"
echo "================================================" >> "$FINAL_SUMMARY"
echo "最终汇总" >> "$FINAL_SUMMARY"
echo "================================================" >> "$FINAL_SUMMARY"
echo "" >> "$FINAL_SUMMARY"

echo -e "${WHITE}${BOLD}================================================================${NC}"
echo -e "${WHITE}${BOLD}  全量安全扫描 — 最终汇总${NC}"
echo -e "${WHITE}${BOLD}================================================================${NC}"
echo ""

# 各扫描状态
for scan_name in npm-audit snyk trivy secret; do
    status="${scan_status[$scan_name]}"
    case "$status" in
        success)
            msg="${GREEN}[完成]${NC}"
            ;;
        failed)
            msg="${RED}[失败]${NC}"
            ;;
        skipped)
            msg="${YELLOW}[跳过]${NC}"
            ;;
        *)
            msg="${NC}[未知]${NC}"
            ;;
    esac
    echo -e "  ${msg}  $scan_name" | tee -a "$FINAL_SUMMARY"
done

echo "" | tee -a "$FINAL_SUMMARY"

# 已知漏洞提醒
echo "已知漏洞提醒:" | tee -a "$FINAL_SUMMARY"
echo "" | tee -a "$FINAL_SUMMARY"
echo -e "  ${RED}[CRITICAL] 硬编码 JWT_SECRET / JWT_REFRESH_SECRET — 需立即修复${NC}" | tee -a "$FINAL_SUMMARY"
echo -e "  ${RED}[HIGH]     spawn 命令注入风险 — server/routes/import.js${NC}" | tee -a "$FINAL_SUMMARY"
echo -e "  ${RED}[HIGH]     multer 文件上传路径未校验 — server/backups/js-original/file-records.js${NC}" | tee -a "$FINAL_SUMMARY"
echo -e "  ${YELLOW}[MEDIUM]   Helmet CSP 关闭 — 依赖 Nginx 配置${NC}" | tee -a "$FINAL_SUMMARY"
echo -e "  ${YELLOW}[MEDIUM]   trust proxy 未配置${NC}" | tee -a "$FINAL_SUMMARY"
echo -e "  ${YELLOW}[MEDIUM]   敏感数据明文存储${NC}" | tee -a "$FINAL_SUMMARY"
echo "" | tee -a "$FINAL_SUMMARY"

echo "扫描报告目录: $PROJECT_ROOT/security/scans/" >> "$FINAL_SUMMARY"
echo "汇总文件: $FINAL_SUMMARY" >> "$FINAL_SUMMARY"

echo ""
echo -e "${WHITE}${BOLD}================================================================${NC}"
echo -e "${GREEN}${BOLD}  全量安全扫描执行完毕${NC}"
echo -e "${WHITE}${BOLD}================================================================${NC}"
echo ""
echo -e "  详细报告请查看:"
echo -e "    $PROJECT_ROOT/security/scans/"
echo -e "    $FINAL_SUMMARY"
echo ""
