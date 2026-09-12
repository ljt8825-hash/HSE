/**
 * 阶段17 —— 局域网静态服务器
 * 仅用于办公局域网环境，非公网生产。
 * - 监听 0.0.0.0:5280，服务 web-naive 生产产物 dist/
 * - 将 /api 同源代理到本机后端 127.0.0.1:5800
 * - 不做任何代码改动，仅此单文件 + 防火墙规则
 *
 * 安全要点：
 * - 用 path.resolve + 目录穿越防护，避免 Windows 下 path.join 把
 *   "/js/foo.js" 解析成盘根导致静态文件 403 / 遍历泄露。
 * - 仅放行 DIST_DIR 之内路径，越界返回 403。
 *
 * 说明：本仓库 package.json 设 "type":"module"，故此处用 ESM import。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 5280;
const API_TARGET = 'http://127.0.0.1:5800';
const DIST_DIR = path.resolve(__dirname, '安全看板vben', 'apps', 'web-naive', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

// 将请求 URL 安全解析为 DIST_DIR 内绝对路径；越界返回 null
function resolveSafe(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0]);
  const rel = decoded.replace(/^[/\\]+/, ''); // 去掉前导斜杠，始终相对 DIST_DIR
  const full = path.resolve(DIST_DIR, rel);
  if (full !== DIST_DIR && !full.startsWith(DIST_DIR + path.sep)) return null;
  return full;
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function proxyApi(req, res) {
  let targetUrl;
  try {
    targetUrl = new URL(req.url, API_TARGET);
  } catch (e) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: { ...req.headers, host: targetUrl.host },
  };
  // 关键修复：本机后端对“非白名单 Origin”会 500（局域网 IP 不在其 CORS 白名单）。
  // 浏览器访问 /api 属同源（均在 192.168.10.107:5280），不会触发 CORS 预检，
  // 故在代理侧剥离 origin/referer，使后端按“无 Origin”处理（已验证返回 200），
  // 浏览器端因同源不校验 CORS，登录/接口调用恢复正常。
  delete options.headers['origin'];
  delete options.headers['referer'];
  delete options.headers['sec-fetch-site'];
  delete options.headers['sec-fetch-mode'];
  delete options.headers['sec-fetch-dest'];
  const proxy = http.request(options, (pRes) => {
    const outHeaders = { ...pRes.headers };
    delete outHeaders['transfer-encoding'];
    res.writeHead(pRes.statusCode, outHeaders);
    pRes.pipe(res);
  });
  proxy.on('error', (e) => {
    console.error('[proxy error]', e.message);
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Gateway');
  });
  req.pipe(proxy);
}

const server = http.createServer((req, res) => {
  if (req.url === '/api' || req.url.startsWith('/api/')) {
    return proxyApi(req, res);
  }
  const filePath = resolveSafe(req.url);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      // 哈希路由 SPA：无扩展名的未知路径回退 index.html；
      // 带扩展名却缺失的资源直接 404，避免把 HTML 当 JS/CSS 返回
      if (!path.extname(filePath)) {
        return serveFile(res, path.join(DIST_DIR, 'index.html'));
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    serveFile(res, filePath);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[HSE LAN] static server  : http://0.0.0.0:${PORT}`);
  console.log(`[HSE LAN] serving dist   : ${DIST_DIR}`);
  console.log(`[HSE LAN] api proxy      : /api -> ${API_TARGET}`);
  console.log(`[HSE LAN] LAN access URL : http://192.168.10.107:${PORT}`);
});
