/* CF-WPS-23 本地「Pages 等价」预览服务器（仅本地验证用，不部署、不改生产）
 *
 * 目的：在不动生产的前提下，把 _pages_deploy/ 静态页 + /api //wps 反向代理
 *       （等价于 Cloudflare Pages Functions: functions/api/[[route]].js、
 *        functions/wps/[[route]].js、_workerProxy.js）在本地复现出来，
 *       从而能用真实后端跑浏览器 E2E。
 *
 * 关键点：
 *   - 转发时**剥掉 Origin/Referer**：Worker 侧 CORS 白名单（CF_ALLOWED_ORIGINS）
 *     默认空 = 全部拒绝，剥掉 Origin 后 Worker 按非浏览器请求处理，浏览器侧
 *     看到的是「同源」响应，无 CORS 问题。
 *   - 出网需代理（直连 workers.dev 不通）：用 HTTPS_PROXY=http://127.0.0.1:7890
 *     NODE_USE_ENV_PROXY=1 启动本服务。
 *
 * 用法：HTTPS_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1 node tools/local-pages-server.mjs
 *      （PORT 默认 5899；WORKER_ORIGIN 可覆盖）
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// PAGES_ROOT 可覆盖静态根目录：默认仍是发布根 _pages_deploy（不改行为），
// 但本地验证「还没 cp 进 _pages_deploy 的 frontend/ 改动」时可以直接指向 frontend/，
// 避免为了跑一次 E2E 就把半成品改动推进发布根。
const ROOT = path.resolve(process.env.PAGES_ROOT || path.resolve(HERE, '..', '_pages_deploy'));
const WORKER_ORIGIN = process.env.WORKER_ORIGIN || 'https://grid-mobile-cloudflare-worker.ljt8825.workers.dev';
const PORT = Number(process.env.PORT || 5899);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Pages 的 _redirects：`[source] [destination] [code?]`，默认 302（本文件只用 301/302/303/307/308）。
// 官方语义（2026-09-17 核对 docs）：**命中规则即跳转，与是否存在同名静态资源无关**，
// 且**不作用于 Pages Functions 路由**（即 /api、/wps 由 Functions 先接管，不参与匹配）。
// 本地必须复现这条，否则「/home 302 → /check」这类改动在本地测不出来。
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
function loadRedirects() {
  const rules = [];
  const file = path.join(ROOT, '_redirects');
  let txt = '';
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return rules; }
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const code = parts[2] ? Number(parts[2]) : 302;
    if (!REDIRECT_CODES.has(code)) continue;          // 200（proxying）等未支持的写法一律忽略
    rules.push({ source: parts[0], destination: parts[1], code });
  }
  return rules;
}
function matchRedirect(rules, urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/\/+$/, '') || '/';
  for (const r of rules) {                             // 顺序敏感：取最上面一条
    const src = r.source.replace(/\/+$/, '') || '/';
    const hit = src.includes('*')
      ? clean.startsWith(src.slice(0, src.indexOf('*'))) || clean === src.replace(/\/\*$/, '')
      : clean === src;
    if (hit) return r;
  }
  return null;
}
const REDIRECTS = loadRedirects();

// Pages 的 pretty URL：/login → login.html；同时兼容 /login.html 直连
function resolveStatic(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  // 注：官方文档称 _redirects 不会被对外提供，但 2026-09-17 实测生产 `GET /_redirects` 返回 200，
  // 故本地**按生产实测行为**处理（照常提供），保持本地 == 线上。
  const candidates = [];
  if (clean === '/' || clean === '') candidates.push('index.html');
  else {
    const rel = clean.replace(/^\/+/, '');
    candidates.push(rel);
    if (!path.extname(rel)) candidates.push(rel + '.html');
  }
  for (const c of candidates) {
    const abs = path.resolve(ROOT, c);
    if (!abs.startsWith(ROOT)) continue;               // 目录穿越防护
    let st = null;
    try { st = fs.statSync(abs); } catch { continue; }
    if (st.isDirectory()) {
      const idx = path.join(abs, 'index.html');
      if (fs.existsSync(idx)) return idx;
      continue;
    }
    return abs;
  }
  return null;
}

async function proxy(req, res, urlPath) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lk = k.toLowerCase();
    // 剥掉 accept-encoding：Node fetch 在客户端自带编码协商时才解压；显式透传会让
    // 上游返回 gzip/br 而我们拿到的是压缩字节流（实测导致浏览器 JSON 解析失败）。
    if (lk === 'host' || lk === 'origin' || lk === 'referer' || lk === 'connection'
      || lk === 'content-length' || lk === 'accept-encoding') continue;
    headers[k] = v;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  let upstream;
  try {
    upstream = await fetch(WORKER_ORIGIN + urlPath, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    });
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, code: 'LOCAL_PROXY_ERROR', message: String(e && e.message || e) }));
    return;
  }
  const out = {};
  upstream.headers.forEach((v, k) => {
    if (['content-encoding', 'content-length', 'transfer-encoding', 'access-control-allow-origin'].includes(k.toLowerCase())) return;
    out[k] = v;
  });
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, out);
  res.end(buf);
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url || '/';
  if (urlPath.startsWith('/api/') || urlPath.startsWith('/wps/')) return proxy(req, res, urlPath);

  // _redirects 优先于静态资源（与官方一致）
  const rule = matchRedirect(REDIRECTS, urlPath);
  if (rule) {
    res.writeHead(rule.code, { location: rule.destination, 'cache-control': 'no-store' });
    res.end();
    return;
  }

  const file = resolveStatic(urlPath);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found: ' + urlPath);
    return;
  }
  const buf = fs.readFileSync(file);
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(buf);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[local-pages] http://127.0.0.1:${PORT}  root=${ROOT}`);
  console.log(`[local-pages] /api /wps → ${WORKER_ORIGIN}`);
});
