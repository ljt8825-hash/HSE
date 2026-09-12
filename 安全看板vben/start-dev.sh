#!/bin/bash
# ============================================
#  Vben Admin v5.7.0 - 一键启动脚本 (Linux/Mac)
#  自动启动前端 + 后端服务，并打开浏览器
# ============================================

set -e

PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)
BACKEND_DIR="$PROJECT_DIR/../server"
FRONTEND_DIR="$PROJECT_DIR/apps/web-antd"
FRONTEND_URL="http://localhost:5666"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         Vben Admin v5.7.0 启动器         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Check if pnpm is available
if ! command -v pnpm &> /dev/null; then
    echo "❌ Error: pnpm is not installed."
    echo "Please install pnpm first: npm install -g pnpm"
    exit 1
fi

# Start backend server if it exists
if [ -f "$BACKEND_DIR/package.json" ]; then
    echo "[1/3] Starting backend server..."
    cd "$BACKEND_DIR" && npm run dev &
    BACKEND_PID=$!
    sleep 3
else
    echo "[1/3] Backend server not found at $BACKEND_DIR"
    echo "      Skipping backend startup."
fi

# Start frontend dev server
echo "[2/3] Starting frontend dev server..."
cd "$FRONTEND_DIR" && pnpm dev &
FRONTEND_PID=$!

# Wait for server to start and open browser
echo "[3/3] Waiting for server to start..."
sleep 15

echo "Opening browser..."
if command -v xdg-open &> /dev/null; then
    xdg-open "$FRONTEND_URL"
elif command -v open &> /dev/null; then
    open "$FRONTEND_URL"
else
    echo "Please open $FRONTEND_URL in your browser"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║              启动完成                     ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Frontend:  $FRONTEND_URL              ║"
echo "║  Backend:   http://localhost:5666/api    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Press Ctrl+C to stop all servers..."

# Wait and cleanup
trap "echo 'Stopping servers...'; kill $FRONTEND_PID 2>/dev/null; kill $BACKEND_PID 2>/dev/null; exit 0" INT
wait