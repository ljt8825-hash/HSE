// ============================================================================
// Pages Functions · 同源反代到 Worker（共享实现；下划线开头 = 不作为路由暴露）
// ----------------------------------------------------------------------------
// 由 functions/api/[[route]].js 与 functions/wps/[[route]].js 共同复用：
//   /api/*  —— H5 主业务链路（登录 / meta / submit / records / me / logout）
//   /wps/*  —— 照片上传 /wps/upload/image 与历史 wps 通道（不在 /api 前缀下）
//
// 目的：H5 前端 API_BASE=''（同源相对路径），请求打到 Pages 域名（pages.dev 或
// 自有域名），由本函数转发到 Worker 公网地址。手机无需访问被墙的 workers.dev。
// ============================================================================

// 硬编码兜底：若 Pages 生产环境未注入 WORKER_ORIGIN 变量（Pages 的 [vars] 在部分
// 场景不生效），仍可正常工作；后续换自有域名只需改这里或注入同名变量覆盖。
const DEFAULT_WORKER_ORIGIN = 'https://grid-mobile-cloudflare-worker.ljt8825.workers.dev';

const PASS_HEADERS = [
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-max-age',
  'access-control-expose-headers',
  'vary',
];

export const proxyToWorker = async (context) => {
  const { request, env } = context;
  const workerOrigin = String(env.WORKER_ORIGIN || DEFAULT_WORKER_ORIGIN || '').replace(/\/+$/, '');
  if (!workerOrigin) {
    return new Response(
      JSON.stringify({ success: false, code: 'PROXY_NOT_CONFIGURED', message: 'Worker 反代未配置（WORKER_ORIGIN）' }),
      { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  }

  const incoming = new URL(request.url);
  const upstreamUrl = `${workerOrigin}${incoming.pathname}${incoming.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('cookie'); // Worker 不消费浏览器 cookie（OAuth state 仅 Worker 域内使用）

  let upstreamRes;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, code: 'UPSTREAM_UNREACHABLE', message: `无法连接后端 Worker：${e && e.message}` }),
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  }

  const resHeaders = new Headers();
  const contentType = upstreamRes.headers.get('content-type');
  if (contentType) resHeaders.set('content-type', contentType);
  resHeaders.set('cache-control', 'no-store');
  // 透传 Worker 按白名单生成的 CORS 响应头（否则合法跨域 Origin 拿不到 ACAO）
  for (const h of PASS_HEADERS) {
    const v = upstreamRes.headers.get(h);
    if (v) resHeaders.set(h, v);
  }
  return new Response(upstreamRes.body, { status: upstreamRes.status, headers: resHeaders });
};
