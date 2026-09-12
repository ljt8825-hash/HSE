import { defineConfig } from '@vben/vite-config';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const _dirname = path.dirname(fileURLToPath(import.meta.url));

// 后端代理目标默认值：/api、/uploads、/ws 三个代理派生自同一个目标来源。
// 覆盖优先级：外部进程环境变量 VITE_PROXY_TARGET > .env.* 文件（loadEnv）> 默认值。
const DEFAULT_BACKEND_PROXY_TARGET = 'http://127.0.0.1:5800';

export default defineConfig(async ({ mode }) => {
  // 在配置回调内通过 loadEnv 读取 .env.*（外部进程 env 优先于文件值）
  const env = loadEnv(mode, _dirname, 'VITE_');
  const backendProxyTarget =
    process.env.VITE_PROXY_TARGET || env.VITE_PROXY_TARGET || DEFAULT_BACKEND_PROXY_TARGET;

  return {
    application: {},
    vite: {
      build: {
        // [构建环境修复-提示词105] rolldown-vite 8.1.4 默认内置压缩器在本机 emit 阶段死锁，
        // 改用 esbuild 压缩器可正常产出压缩版生产构建并 exit 0（已验证）。
        minify: 'esbuild',
        /** 代码分割：将大型依赖拆分为独立 chunk，减少首屏加载体积 */
        rollupOptions: {
          output: {
            manualChunks(id: string) {
              // 将 node_modules 中的大型依赖拆分为独立 chunk
              if (id.includes('node_modules')) {
                if (id.includes('ant-design-vue')) return 'vendor-antd';
                if (id.includes('echarts') || id.includes('zrender')) return 'vendor-echarts';
                if (id.includes('leaflet')) return 'vendor-leaflet';
                if (id.includes('vxe-table') || id.includes('vxe-pc-ui')) return 'vendor-vxe';
                if (id.includes('vue') || id.includes('pinia') || id.includes('vue-router')) return 'vendor-vue';
                if (id.includes('dayjs') || id.includes('lodash')) return 'vendor-utils';
              }
            },
          },
        },
      },
      server: {
        host: true,
        port: Number(process.env.FRONTEND_PORT || 5173),
        strictPort: true,
        proxy: {
          '/api': {
            changeOrigin: true,
            target: backendProxyTarget,
          },
          '/uploads': {
            changeOrigin: true,
            target: backendProxyTarget,
          },
          '/ws': {
            changeOrigin: true,
            target: backendProxyTarget.replace(/^http/, 'ws'),
            ws: true,
          },
        },
      },
    },
  };
});
