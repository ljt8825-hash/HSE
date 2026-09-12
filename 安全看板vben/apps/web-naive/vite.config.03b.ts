/**
 * HSE-MOBILE-GRID-03-B 写入验证专用 Vite 配置（临时文件，验证结束即删除）
 *
 * 目的：把前端的 /api 与 /uploads 代理指向【隔离测试后端 5882】
 *      （5882 使用 safety_dashboard_dev 测试库、SCHEDULER_ENABLED=false、WPS_GRID_SYNC=false），
 *      从而在完全不触碰 5173 / 5876 / 5881 / server/.env 的前提下完成真实写入 E2E。
 *
 * 除端口、缓存目录与代理目标外，其余行为与 apps/web-naive/vite.config.ts 完全一致。
 */
import { defineConfig } from '@vben/vite-config';

const TARGET = 'http://127.0.0.1:5882';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      // 独立缓存目录：避免与正在运行的 5173 dev server 共用 node_modules/.vite/deps
      cacheDir: 'node_modules/.vite-03b',
      server: {
        allowedHosts: true,
        port: 5175,
        strictPort: true,
        proxy: {
          '/api': {
            changeOrigin: true,
            target: TARGET,
            ws: true,
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.removeHeader('origin');
              });
            },
          },
          '/uploads': {
            changeOrigin: true,
            target: TARGET,
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.removeHeader('origin');
              });
            },
          },
        },
      },
    },
  };
});
