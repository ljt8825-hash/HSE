/**
 * serve-frontend.cjs
 * 生产前端发布伴随服务器（零额外基础设施）。
 * - 静态托管 web-naive 的 dist 构建物
 * - 将 /api、/uploads、/templates 反向代理到 5876 生产后端（同源 /api，满足发布指南要求）
 * - 支持 Vue History 路由 SPA 回退
 *
 * 用法：
 *   PORT=8090 TARGET_PORT=5876 node server/serve-frontend.cjs
 * 生产部署：在一台可访问 5876 后端的机器上运行本服务，前端访问地址即本服务端口。
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.PORT || 8090);
const TARGET_PORT = Number(process.env.TARGET_PORT || 5876);
const TARGET_HOST = process.env.TARGET_HOST || '127.0.0.1';
const DIST = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.join(__dirname, '..', '安全看板vben', 'apps', 'web-naive', 'dist');

if (!fs.existsSync(DIST)) {
  console.error(`[serve-frontend] dist 目录不存在: ${DIST}`);
  process.exit(1);
}

const app = express();
const PROXY_PREFIXES = ['/api', '/uploads', '/templates'];

function proxyToBackend(req, res) {
  const options = {
    host: TARGET_HOST,
    port: TARGET_PORT,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` },
    timeout: 30000,
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ success: false, code: 502, message: `backend proxy error: ${err.message}` }));
  });
  proxyReq.on('timeout', () => proxyReq.destroy(new Error('backend timeout')));
  req.pipe(proxyReq);
}

// 1) API / 上传 / 模板 -> 反代到生产后端
app.use((req, res, next) => {
  if (PROXY_PREFIXES.some((p) => req.path.startsWith(p))) {
    return proxyToBackend(req, res);
  }
  next();
});

// 2) 静态托管 dist
app.use(express.static(DIST, { index: false, extensions: ['html'] }));

// 3) SPA History 回退（仅 HTML 请求）
app.get('*', (req, res, next) => {
  if (req.method === 'GET' && (req.headers.accept || '').includes('text/html')) {
    const idx = path.join(DIST, 'index.html');
    if (fs.existsSync(idx)) return res.sendFile(idx);
  }
  next();
});

app.use((req, res) => {
  res.status(404).send('Not Found');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[serve-frontend] dist=${DIST}\n` +
    `[serve-frontend] listening http://0.0.0.0:${PORT}  (proxy /api -> ${TARGET_HOST}:${TARGET_PORT})`
  );
});
