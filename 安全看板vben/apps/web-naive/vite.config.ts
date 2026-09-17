import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      server: {
        // 阶段13：局域网访问放行。Vite 5+ 默认只允许 localhost/127.0.0.1 等 Host，
        // --host 0.0.0.0 后同事用 192.168.x.x 访问 dev server 会被 403「Blocked request，
        // this host is not allowed」拦截，故显式关闭宿主检查以支持局域网访问。
        allowedHosts: true,
        // AI-12：代理目标支持环境变量覆盖（start-hse-ai.ps1 注入 VITE_PROXY_TARGET /
        // VITE_UPLOADS_PROXY_TARGET 指向开发栈后端）。未设置时保持原硬编码默认值，行为不变。
        proxy: {
          // 阶段04：接入真实后端（与 web-antd 权威配置对齐）。
          // 请求路径保留 /api 前缀（requestClient baseURL=VITE_GLOB_API_URL=/api），
          // 故此处不再 rewrite，转发 /api/* → http://127.0.0.1:5800/api/*。
          // 阶段12：changeOrigin 仅改写 Host，不处理 Origin 头——浏览器 PUT/POST 会带
          // Origin: http://127.0.0.1:5174，后端 CORS_ORIGINS 白名单未含 5174 → 写接口 500
          // （CORS 策略不允许此来源）。此处移除 Origin，后端按无来源放行（dev 同源代理语义）。
          '/api': {
            changeOrigin: true,
            // E-09：本阶段 DEV 测试窗口代理 DEV 后端 5882（safety_dashboard_dev）——
            // 禁止将三违新增测试写入生产。此前默认 5876（safety_dashboard 生产）。
            // AI-12：默认值保持 5882，可由 VITE_PROXY_TARGET 环境变量覆盖（start-hse-ai.ps1）。
            target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5882',
            ws: true,
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.removeHeader('origin');
              });
            },
          },
          // 网格长巡查台账内嵌图片等静态资源：原始 webpath 形如 /uploads/grid-inspection/{run}/xxx.jpeg
          // 由后端统一 /uploads 目录输出，dev 环境需同源代理到后端，否则前端图片 404。
          '/uploads': {
            changeOrigin: true,
            // 05-B0：随 /api 一起走生产后端 5876
            // AI-12：默认值保持 5876，可由 VITE_UPLOADS_PROXY_TARGET 环境变量覆盖（start-hse-ai.ps1）。
            target: process.env.VITE_UPLOADS_PROXY_TARGET || 'http://127.0.0.1:5876',
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
