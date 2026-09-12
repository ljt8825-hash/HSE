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
        proxy: {
          // 阶段04：接入真实后端（与 web-antd 权威配置对齐）。
          // 请求路径保留 /api 前缀（requestClient baseURL=VITE_GLOB_API_URL=/api），
          // 故此处不再 rewrite，转发 /api/* → http://127.0.0.1:5800/api/*。
          // 阶段12：changeOrigin 仅改写 Host，不处理 Origin 头——浏览器 PUT/POST 会带
          // Origin: http://127.0.0.1:5174，后端 CORS_ORIGINS 白名单未含 5174 → 写接口 500
          // （CORS 策略不允许此来源）。此处移除 Origin，后端按无来源放行（dev 同源代理语义）。
          '/api': {
            changeOrigin: true,
            // 开发阶段代理到开发后端 5881；生产/正式联调请改回 5876
            target: 'http://127.0.0.1:5881',
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
            // 开发阶段随 /api 一起走开发后端 5881
            target: 'http://127.0.0.1:5881',
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
