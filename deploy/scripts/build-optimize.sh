# ============================================================
# deploy/scripts/build-optimize.sh
# 生产构建优化脚本
# 生成版本号 → 构建 → 分析包体积 → 上传 Sentry SourceMap
# ============================================================

#!/bin/bash
set -euo pipefail

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  HSE 安全管理系统 - 生产构建${NC}"
echo -e "${GREEN}======================================${NC}"

# ---- 1. 生成版本号 ----
VERSION=$(date +%Y%m%d%H%M%S)-$(git rev-parse --short HEAD 2>/dev/null || echo "local")
export VITE_SENTRY_RELEASE="$VERSION"
echo -e "${YELLOW}[1/5] 版本号: ${VERSION}${NC}"

# ---- 2. 环境检查 ----
FRONTEND_DIR="安全看板vben"
FRONTEND_APP_DIR="${FRONTEND_DIR}/apps/web-antd"

if [ ! -f "${FRONTEND_APP_DIR}/.env.production" ]; then
    echo -e "${RED}错误: ${FRONTEND_APP_DIR}/.env.production 不存在${NC}"
    exit 1
fi

# ---- 3. 安装依赖 ----
echo -e "${YELLOW}[2/5] 安装依赖...${NC}"
pnpm --dir "${FRONTEND_DIR}" install --frozen-lockfile

# ---- 4. 构建 ----
echo -e "${YELLOW}[3/5] 构建生产包...${NC}"
pnpm --dir "${FRONTEND_DIR}" run build:antd

# ---- 5. 分析包体积 ----
echo -e "${YELLOW}[4/5] 分析包体积...${NC}"
if npx rollup-plugin-visualizer --help &>/dev/null; then
    echo "跳过可视化分析（需要交互式环境）"
fi

# 打印文件大小
echo ""
echo "构建产物:"
du -sh "${FRONTEND_APP_DIR}/dist/"
echo ""
echo "JS 文件:"
find "${FRONTEND_APP_DIR}/dist/assets" -name '*.js' -exec ls -lh {} \; 2>/dev/null | sort -k5 -h
echo ""
echo "CSS 文件:"
find "${FRONTEND_APP_DIR}/dist/assets" -name '*.css' -exec ls -lh {} \; 2>/dev/null | sort -k5 -h

# ---- 6. 上传 SourceMap 到 Sentry（如果配置了） ----
echo -e "${YELLOW}[5/5] SourceMap 处理...${NC}"
if [ -n "${VITE_SENTRY_DSN:-}" ]; then
    echo "SourceMap 已通过 Vite 插件在构建时自动上传"
else
    echo "跳过 SourceMap 上传（VITE_SENTRY_DSN 未配置）"
fi

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  构建完成! 版本: ${VERSION}${NC}"
echo -e "${GREEN}======================================${NC}"
