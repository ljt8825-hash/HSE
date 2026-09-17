// ============================================================================
// WPS OAuth POC-03-A —— Cloudflare Worker（仅 POC 测试，不接入生产 HSE 登录）
// ============================================================================
// 阶段目标：基于「当前 WPS 官方开放平台文档」对 POC-03 做接口口径收敛，
//   验证「真实 WPS 用户身份 + KSO-1 鉴权闭环」的代码层正确性（真实联调仍待业务方）。
//
// 链路：
//   浏览器 → /wps/oauth/start → WPS 登录授权 → /wps/oauth/callback
//         → code 换 access_token → KSO-1 签名 → GET /v7/users/current
//         → 真实 WPS user_id / user_name / company_id / avatar
//
// 本阶段基于「当前 WPS 官方文档 + 生产 server/services/wpsClient.js」交叉核对（POC-03-A 修正）：
//   1) OAuth 授权/Token 端点使用 WPS 365 标准：
//       授权：GET  {WPS_AUTHORIZE_URL}  参数 client_id / response_type=code / redirect_uri / scope / state
//       Token：POST {WPS_TOKEN_URL}     表单 grant_type=authorization_code&client_id&client_secret&code&redirect_uri
//      （POC-02 的 /oauthapi/v1/oauth2/token + app_id/app_key 经官方文档核实为错误，POC-03 已改）
//   2) Token 响应按 OAuth2 扁平结构解析（access_token/refresh_token/expires_in/token_type）。
//   3) /v7/users/current 走 v7 {code,msg,data} 包裹解析，单独处理。
//   4) KSO-1 签名按官方算法实现（HMAC-SHA256）。
//      POC-03-A 关键修正：官方 /v7/users/current 文档明确要求 KSO-1 签名，
//       → 删除 WPS_API_SIGNATURE 开关，对 userinfo 的正式调用固定为 Bearer + KSO-1；
//         不再保留 Bearer-only 默认路径。
//      token 端点（/oauth2/token）是标准 OAuth2，不加 KSO-1。
//   5) scope 修正为 kso.user_base.read（官方用户授权流程与 /v7/users/current 权限要求一致）。
//
// 安全纪律（与任务书 §二 一致）：
//   - WPS_CLIENT_ID / WPS_CLIENT_SECRET 仅存在于 Worker 服务端 Secret/Env。
//   - access_token / refresh_token 绝不返回浏览器、绝不写入日志、绝不入数据库。
//   - 本 Worker 不连接 PG / HSE / JWT，不修改任何生产登录、权限、WPS Grid 业务。
//   - 本 POC 不把 WPS 身份映射到 employee_id，不写库（见任务书 §二.13）。
// ============================================================================

// 2026-09 改版：密码改为派生规则（姓名首字母+手机号后4位）+常量时间比较，不再依赖 bcryptjs

// ---- Phase B：存储后端适配层（WPS / 飞书 可切换，零行为变更）----
import { getAdapter, storageConfig, findExistingByClientRequestId, rosterSource } from './storage/index.js';
import { pinyinInitials } from './pinyin-init.js'; // 姓名拼音首字母（构建期压缩表，零依赖）
// WPS 附件上传原语（handleUploadImage 的 WPS 分支）仍直接依赖 getAppToken
import { getAppToken } from './storage/wpsAdapter.js';



// ---- 默认端点（均可通过 Cloudflare Var 覆盖；Secret 仅 WPS_CLIENT_ID/SECRET）----
const DEFAULT_AUTHORIZE_URL = 'https://openapi.wps.cn/oauth2/auth';
const DEFAULT_TOKEN_URL     = 'https://openapi.wps.cn/oauth2/token';
const DEFAULT_USERINFO_URL  = 'https://openapi.wps.cn/v7/users/current';
const DEFAULT_SCOPE        = 'kso.user_base.read'; // POC-03-A 修正：原 kso.user_current.read 非官方默认

// ---- Web Crypto 助手（Worker 原生 crypto.subtle；Node 测试环境由 test 注入 globalThis.crypto）----
const _enc = new TextEncoder();

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', _enc.encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(key, msg) {
  const keyBuf = await crypto.subtle.importKey(
    'raw',
    _enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', keyBuf, _enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// KSO-1 签名（纯函数，仅用于 /v7/users/current；官方要求强制签名）
// ----------------------------------------------------------------------------
// 官方算法（open.wps.cn/documents/app-integration-dev/wps365/.../signature-description.html，
// 与本项目生产 server/services/wpsClient.js 的 kso1Sign 完全一致）：
//   signStr = "KSO-1" + METHOD + RequestURI + ContentType + KsoDate + sha256(RequestBody)
//   sig     = HMAC-SHA256(secretKey=APPKEY, signStr)
//   请求头：X-Kso-Date: <RFC1123>
//           X-Kso-Authorization: KSO-1 <APPID>:<sig>
// 说明（POC-03-A 修正）：官方 /v7/users/current 文档明确要求 KSO-1 签名，
//   故本 POC 对 userinfo 的正式调用路径固定为 Bearer + KSO-1，删除 WPS_API_SIGNATURE 开关。
//   token 端点（/oauth2/token）是 OAuth2 标准，不加 KSO-1。
// ============================================================================

// 底层纯函数：给定确定输入，返回确定签名（便于测试断言）
async function kso1Signature({ method, uri, contentType, ksoDate, bodyStr = '', secretKey }) {
  const bodyHash = bodyStr ? await sha256Hex(bodyStr) : '';
  const signStr = 'KSO-1' + method.toUpperCase() + uri + contentType + ksoDate + bodyHash;
  return hmacSha256Hex(secretKey, signStr);
}

// 生成完整 KSO-1 请求头（供实际 fetch 使用；ksoDate 取当前时间）
async function buildKso1Headers({ method, uri, contentType, appId, appSecret, bodyStr = '' }) {
  const ksoDate = new Date().toUTCString(); // RFC1123
  const signature = await kso1Signature({ method, uri, contentType, ksoDate, bodyStr, secretKey: appSecret });
  return {
    'X-Kso-Date': ksoDate,
    'X-Kso-Authorization': `KSO-1 ${appId}:${signature}`,
  };
}

// ----------------------------------------------------------------------------
// Token 解析（OAuth2 扁平优先；兼容旧版 {result,token} 嵌套）
// 注意：/oauth2/token 是 OAuth2 标准端点，响应是扁平 JSON，不是 v7 {code,data} 包裹。
// ----------------------------------------------------------------------------
function parseTokenResponse(json) {
  if (!json || typeof json !== 'object') return { ok: false };

  // WPS 365 oauth2/token 成功：扁平 { access_token, refresh_token, expires_in, token_type }
  if (json.access_token) {
    return {
      ok: true,
      accessToken: json.access_token,
      refreshToken: json.refresh_token || null,
      expiresIn: Number(json.expires_in || 0),
      tokenType: String(json.token_type || 'Bearer'),
      wpsCode: json.code ?? null,
    };
  }

  // 旧版（oauthapi/v2/token）成功：{ result:0, token:{ access_token, ... } }
  if (json.token && json.token.access_token) {
    return {
      ok: true,
      accessToken: json.token.access_token,
      refreshToken: json.token.refresh_token || null,
      expiresIn: Number(json.token.expires_in || 0),
      tokenType: 'Bearer',
      wpsCode: json.result ?? null,
    };
  }

  // 失败：{ code, msg } 或 { code, message }
  return {
    ok: false,
    wpsCode: json.code ?? json.result ?? null,
    wpsMsg: json.msg ?? json.message ?? null,
  };
}

// ----------------------------------------------------------------------------
// 用户信息解析（v7 {code,msg,data} 包裹 → 归一化字段）
// ----------------------------------------------------------------------------
function unwrapV7(body) {
  if (body && typeof body === 'object' && 'data' in body && body.data && typeof body.data === 'object') {
    return body.data;
  }
  return body; // 已是裸对象
}

// 仅以官方确认的字段为正式身份字段：id / user_name / company_id / avatar。
// 保留同字段命名变体（user_id / userName / companyId）作为容错；
// 不以 openid / unionid / nickname / company_uid / name 等未被当前接口确认的字段
// 替代官方 id（POC-03-A §九）。
function normalizeUser(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id ?? raw.user_id ?? null,
    userName: raw.user_name ?? raw.userName ?? null,
    companyId: raw.company_id ?? raw.companyId ?? null,
    avatar: raw.avatar ?? null,
  };
}

// ---- 安全解析 JSON，失败返回 null（绝不抛未捕获异常带走 token）----
async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ---- 取 Cookie ----
function getCookie(req, name) {
  const h = req.headers.get('cookie');
  if (!h) return null;
  for (const part of h.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

// ============================================================================
// 路由：/wps/oauth/start —— 生成 state，重定向上 WPS 授权页
// ============================================================================
function handleStart(env) {
  const state = crypto.randomUUID();
  const redirectUri = env.WPS_REDIRECT_URI;
  const scope = env.WPS_SCOPE || DEFAULT_SCOPE;
  const authorizeUrl = env.WPS_AUTHORIZE_URL || DEFAULT_AUTHORIZE_URL;
  const clientId = env.WPS_CLIENT_ID;

  const url =
    `${authorizeUrl}?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Set-Cookie': `wps_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300`,
      'Cache-Control': 'no-store',
    },
  });
}

// ============================================================================
// 路由：/wps/oauth/callback —— code 换 token，再取用户信息
// ============================================================================
async function handleCallback(request, env) {
  const u = new URL(request.url);
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');

  // ---- state 服务端校验（POC：cookie 双重提交模式）----
  const expectedState = getCookie(request, 'wps_oauth_state');
  const stateOk = !!code && !!expectedState && state === expectedState;
  if (!code || !stateOk) {
    return new Response(
      JSON.stringify({
        success: false,
        stage: 'callback',
        message: '缺少 code 或 state 校验失败',
        stateReceived: !!state,
        stateVerified: stateOk,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  const tokenUrl = env.WPS_TOKEN_URL || DEFAULT_TOKEN_URL;

  // ---- 1) code → access_token（OAuth2 标准表单；不加任何签名）----
  let tokenRes, tokenJson;
  try {
    tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: env.WPS_CLIENT_ID,
        client_secret: env.WPS_CLIENT_SECRET,
        code,
        redirect_uri: env.WPS_REDIRECT_URI,
      }).toString(),
    });
    tokenJson = await safeJson(tokenRes);
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, stage: 'token', message: 'token 请求异常', detail: String(e) }),
      { status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  const token = parseTokenResponse(tokenJson);
  if (!token.ok) {
    return new Response(
      JSON.stringify({
        success: false,
        stage: 'token',
        httpStatus: tokenRes?.status,
        wpsCode: token.wpsCode ?? null,
        message: token.wpsMsg ?? 'token 获取失败',
        tokenReceived: false,
      }),
      { status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }
  const accessToken = token.accessToken;

  // ---- 2) access_token → /v7/users/current（官方要求：Bearer + KSO-1 强制签名）----
  const userInfoUrl = env.WPS_USERINFO_URL || DEFAULT_USERINFO_URL;
  const parsed = new URL(userInfoUrl);
  const requestUri = parsed.pathname + parsed.search; // KSO-1 签名需含 query
  const CONTENT_TYPE = 'application/json';

  // KSO-1 始终附加（POC-03-A：删除 WPS_API_SIGNATURE 开关，按官方文档固定 Bearer + KSO-1）
  const kso1 = await buildKso1Headers({
    method: 'GET',
    uri: requestUri,
    contentType: CONTENT_TYPE,
    appId: env.WPS_CLIENT_ID,
    appSecret: env.WPS_CLIENT_SECRET,
    bodyStr: '',
  });
  const userHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': CONTENT_TYPE,
    ...kso1, // X-Kso-Date + X-Kso-Authorization
  };
  const kso1Applied = true;

  let userRes, userJson;
  try {
    userRes = await fetch(userInfoUrl, { method: 'GET', headers: userHeaders });
    userJson = await safeJson(userRes);
  } catch (e) {
    return new Response(
      JSON.stringify({
        success: false,
        stage: 'current_user',
        httpStatus: userRes?.status ?? null,
        wpsCode: userJson?.code ?? null,
        message: userJson?.msg ?? '用户信息请求异常',
        tokenReceived: true, // 已拿到 token，但绝不回传
        kso1Applied,
      }),
      { status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  // 401/403/签名错误/权限不足/解析为空 —— 保留真实 HTTP 状态与 WPS code，不泄露 token
  const user = normalizeUser(unwrapV7(userJson));
  if (!userRes.ok || !user || !user.id) {
    const status = userRes?.status;
    const ksoErrMsg =
      status === 401 ? '鉴权失败（401）：Bearer 或 KSO-1 签名无效' :
      status === 403 ? '权限不足（403）：scope 或应用权限不足' :
      userJson?.msg ?? '用户信息解析为空';
    return new Response(
      JSON.stringify({
        success: false,
        stage: 'current_user',
        httpStatus: status ?? null,
        wpsCode: userJson?.code ?? null,
        message: ksoErrMsg,
        tokenReceived: true,
        kso1Applied,
      }),
      { status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  // ---- 3) 返回脱敏结果（无 token、无 secret）----
  return new Response(
    JSON.stringify({
      success: true,
      stage: 'completed',
      oauth: { codeReceived: true, stateReceived: true },
      token: {
        received: true,
        tokenType: token.tokenType,
        expiresIn: token.expiresIn,
        refreshTokenReceived: !!token.refreshToken,
      },
      user: {
        id: user.id,
        userName: user.userName,
        companyId: user.companyId,
        avatarReceived: !!user.avatar, // 头像为公开可访问 URL，非敏感凭据
      },
      security: {
        accessTokenReturnedToBrowser: false,
        refreshTokenReturnedToBrowser: false,
        kso1Applied,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
}

// ============================================================================
// CF-WPS-08 最小落地 —— Worker v2 业务代理增量（在 POC OAuth 之上追加）
// ----------------------------------------------------------------------------
// 边界（CF-WPS-08 任务书 §十/§十七）：
//   - 只做「安全代理 + WPS 缓冲层」，不做 HSE 后端、不连 PG、不重写认证。
//   - POST /wps/records/create：最小 WPS record create 代理。
//       · 认证门：Bearer JWT —— 用与本地 HSE 后端相同的 JWT_SECRET（Secret 注入）
//         做 HS256 验签（复用现有 JWT 体系，不新建认证；只验签，不签发）。
//       · 写开关：env ALLOW_WPS_WRITE 必须 === 'true'（fail-closed，默认禁写）。
//       · 字段白名单：仅放行移动端巡查提交相关列（对齐 wpsFieldMap）。
//   - POST /wps/upload/image：WPS Attachment→URL 能力已实测不可用（CF-WPS-02：
//     uploadId 无 URL / attachment/urls 404 / ksc-bj 签发端点未暴露）→ 显式 501，
//     绝不假装可用、绝不引入第三方对象存储。
//   - CORS：仅放行 env CF_ALLOWED_ORIGINS 白名单（逗号分隔），默认空 = 全部拒绝。
//   - 错误归一化：统一 { success:false, code, message }；secret/token/密码绝不入响应与日志。
//   - 本地验证：test/cfwps08.test.mjs（mock WPS upstream，不触碰真实 WPS 写）。
// ============================================================================

// ---- WPS record 字段白名单（CF-WPS-09 实测对齐 cn229thwalDs sheet 3「表格视图」30 字段）----
// 注意：「员工编码」列存在于 sheet 11（员工信息维护），sheet 3 的身份快照列是「巡查人员ID」。
// Attachment 列（三违照片：图片1/2/3）显式不入白名单：二段式上传→URL 能力未验证（CF-WPS-02/08/09）。
const RECORD_FIELD_WHITELIST = new Set([
  '姓名', '分组名称', '所属岗位', '网格等级', '日期',
  '三违行为', '违章人姓名', '违章人性别', '违章人年龄',
  '是否需要整改', '上报状态', '提交时间', '标记',
  '巡查人员ID',
  '三违照片链接', '整改后照片链接', '示意图链接',
]);

// 移动端提交的保护字段（§十）：H5/Worker 永不接受，剥离后由既有系统归因
const PROTECTED_FIELDS = new Set([
  'grid_id', 'inspector_employee_id', 'attribution_status',
  'deduction', 'responsibility', 'review', 'employee_code',
]);

// ---- CF-WPS-10：隔离测试 Sheet 白名单（目标 Sheet「H5提交测试」，业务方 UI 人工创建）----
// 与生产 Sheet 白名单严格分离：employee_code 在测试 Sheet 是业务身份验证列（§五），
// 在生产巡查 Sheet 仍是内部归因字段（PROTECTED_FIELDS，禁止 H5 提交）。
// 注意：此白名单只允许写入隔离测试 Sheet，生产巡查 Sheet（sheet 3）永不变更目标。
const TEST_FIELD_WHITELIST = new Set([
  '测试编号', 'employee_code', '姓名', '巡查时间', '网格',
  '问题描述', '来源', '测试状态', 'client_request_id', '创建时间',
]);

// 请求体元字段（非记录字段，取走后再进白名单过滤）
const BODY_META_FIELDS = new Set(['target']);

// 请求体大小上限（413）：512KB 足够纯文本记录，防滥用
const MAX_BODY_BYTES = 512 * 1024;

function jsonRes(obj, status, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

function errRes(code, message, status, extraHeaders = {}) {
  return jsonRes({ success: false, code, message }, status, extraHeaders);
}

// ---- CORS（白名单）----
function corsOrigin(request, env) {
  const origin = request.headers.get('origin') || '';
  const allow = String(env.CF_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.includes(origin) ? origin : null;
}

function corsHeaders(origin) {
  return origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Max-Age': '600',
      }
    : {};
}

// ---- JWT 验签（HS256，Web Crypto；与本地 HSE 后端同 secret，复用现有 JWT 体系）----
async function verifyJwt(token, secret) {
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [h64, p64, s64] = parts;
  const enc = new TextEncoder();
  let header, payload;
  try {
    header = JSON.parse(atobUrl(h64));
    payload = JSON.parse(atobUrl(p64));
  } catch {
    return false;
  }
  if (header.alg !== 'HS256') return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const sigBytes = b64urlToBytes(s64);
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(`${h64}.${p64}`));
  if (!ok) return false;
  if (payload.exp && Date.now() / 1000 > payload.exp) return false;
  return true;
}

function atobUrl(s) {
  // UTF-8 安全的 base64url 解码（Workers 兼容：atob + TextDecoder，不用 escape/Buffer）
  return new TextDecoder().decode(b64urlToBytes(s));
}

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// ---- 应用 access_token / 记录归一化 / 分页扫描 / 幂等预查 / records create
//      均已迁入 worker/storage/wpsAdapter.js（零行为变更），通过底部 re-export 供测试复用。----

// ---- 最小 record create 代理（白名单 + fail-closed 写开关 + JWT 门）----
async function handleRecordCreate(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

  try {
    // 存储后端装配（WPS / 飞书）
    const adapter = getAdapter(env);
    const cfg = storageConfig(env);

    // 门 1：JWT（现有体系验签；未配置 secret = 拒绝）
    if (!env.JWT_VERIFY_SECRET) return errRes('AUTH_NOT_CONFIGURED', '认证未配置', 503, corsHeaders(origin));
    const auth = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!(await verifyJwt(token, env.JWT_VERIFY_SECRET))) {
      return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
    }
    // 门 2：写开关 fail-closed
    if (String(env.ALLOW_WPS_WRITE || '') !== 'true') {
      return errRes('WPS_WRITE_DISABLED', '写入未启用（ALLOW_WPS_WRITE）', 403, corsHeaders(origin));
    }
    // 门 3：目标文件配置
    const fileId = cfg.fileId;
    if (!fileId) return errRes('STORAGE_NOT_CONFIGURED', '存储目标未配置', 503, corsHeaders(origin));

    // 体：{ target?: 'test', records: [ {字段名: 值} ] }
    // 413：体超限（CF-WPS-10 §七.6）
    const contentLen = Number(request.headers.get('content-length') || '0');
    if (contentLen > MAX_BODY_BYTES) {
      return errRes('BODY_TOO_LARGE', `请求体超过上限（${MAX_BODY_BYTES} 字节）`, 413, corsHeaders(origin));
    }
    let body;
    try { body = await request.json(); } catch { return errRes('BAD_REQUEST', '请求体必须为 JSON', 400, corsHeaders(origin)); }

    // 目标 Sheet 语义（CF-WPS-10）：target==='test' → 隔离测试 Sheet；缺省 → 生产巡查 Sheet
    const target = body && typeof body.target === 'string' ? body.target : '';
    let sheetId;
    let fieldWhitelist;
    let isTestTarget = false;
    if (target === 'test') {
      sheetId = cfg.testSheetId;
      if (!sheetId) return errRes('TEST_SHEET_NOT_CONFIGURED', '测试 Sheet 未配置', 503, corsHeaders(origin));
      fieldWhitelist = TEST_FIELD_WHITELIST;
      isTestTarget = true;
    } else {
      // 通用写代理的生产目标：WPS=三违 Sheet3(WPS_DBSHEET_SHEET_ID)；飞书=FS_PATROL_PRODUCTION_TABLE_ID
      sheetId = cfg.backend === 'feishu' ? env.FS_PATROL_PRODUCTION_TABLE_ID : env.WPS_DBSHEET_SHEET_ID;
      if (!sheetId) return errRes('STORAGE_NOT_CONFIGURED', '生产目标 Sheet 未配置', 503, corsHeaders(origin));
      fieldWhitelist = RECORD_FIELD_WHITELIST;
    }

    const records = Array.isArray(body && body.records) ? body.records : [];
    if (!records.length || records.length > 50) {
      return errRes('BAD_REQUEST', 'records 必须为 1..50 的数组', 400, corsHeaders(origin));
    }
    const cleaned = records.map((r) => {
      const out = {};
      for (const [k, v] of Object.entries(r || {})) {
        if (BODY_META_FIELDS.has(k)) continue;
        // employee_code 仅在测试目标放行（CF-WPS-10 §五 业务身份验证列）；生产通道仍无条件剥离
        if (PROTECTED_FIELDS.has(k) && !(isTestTarget && k === 'employee_code')) continue;
        if (fieldWhitelist.has(k)) out[k] = typeof v === 'string' ? v : String(v);
      }
      return out;
    }).filter((r) => Object.keys(r).length > 0);
    if (!cleaned.length) return errRes('BAD_REQUEST', '无任何白名单内字段', 400, corsHeaders(origin));

    // 幂等预查（CF-WPS-10 §六，仅测试目标）：扫描测试 Sheet 已有记录的 client_request_id，
    // 命中则不再创建，返回既有记录 id（deduplicated:true）。
    // 说明：扫描式幂等依赖全表扫描，仅适用于小体量测试 Sheet；生产通道幂等仍为 PENDING。
    if (isTestTarget) {
      const clientReqIds = cleaned.map((r) => r.client_request_id).filter(Boolean);
      if (clientReqIds.length) {
        const existing = await findExistingByClientRequestId(adapter, env, fileId, sheetId, clientReqIds);
        if (existing) {
          return jsonRes({ success: true, code: 'OK', deduplicated: true, recordIds: existing }, 200, corsHeaders(origin));
        }
      }
    }

    // 上游：存储后端 records create（适配器按后端转换端点/格式）
    // 飞书后端：表已类型化，写入前做日期列（日期/提交时间）字符串→毫秒变换
    const outCleaned = cfg.backend === 'feishu' ? cleaned.map(feishuTypedRecord) : cleaned;
    try {
      const recs = await adapter.createRecords(env, fileId, sheetId, outCleaned);
      return jsonRes({ success: true, code: 'OK', recordIds: recs }, 200, corsHeaders(origin));
    } catch (e) {
      if (e && e.isRateLimit) return errRes('WPS_RATE_LIMITED', '存储限频，请稍后重试', 429, corsHeaders(origin));
      return errRes('WPS_UPSTREAM_ERROR', '存储写入失败', 502, corsHeaders(origin));
    }
  } catch (e) {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

// ============================================================================
// CF-WPS-11 —— H5 移动端身份 + 手机号+密码登录（最小闭环）
// 2026-09 改版：登录人员唯一来源 = 飞书「网格长信息台账」(FS_LEDGER_TABLE_ID)。
// ----------------------------------------------------------------------------
// 身份链（fail-closed，无任何模糊/兜底命中）：
//   网格长信息台账 手机号唯一命中（无手机号/重复手机号 = 拒绝）
//     → 分级 ∈ {公司管理, 乡镇作业中心经理, 管理员}（映射为应用角色；其他值拒绝）
//     → 密码 = 姓名拼音首字母(小写, 姓氏特殊读音覆盖) + 手机号后4位
//       常量时间比对（输入侧大小写不敏感，避免「傻瓜式」用户大小写踩坑）
//     → 签发 Worker 专用 Session JWT（WORKER_SESSION_SECRET，iss/aud 隔离；
//       sub=手机号，含 role/直接上级 快照）
// 安全纪律：
//   - 不复用 JWT_VERIFY_SECRET 签发：否则 Worker 签出的 token 会被本地 HSE 后端
//     接受（同 secret），形成跨系统信任升级。Worker 对 /wps/records/create 仍只验签。
//   - 全部认证失败统一 401「手机号或密码错误」，不做账号枚举区分。
//   - 密码明文/完整手机号/WPS token/secret 绝不入响应与日志。
//   - Session 为无状态 JWT（不引入外部存储）；logout = 客户端丢弃 + 短 TTL 兜底，
//     服务端无法主动吊销（限制如实写报告）。
//   - 派生密码规则本身即业务约定（用户侧公示），台账即凭据源；规则变更须同步本实现。
// ============================================================================

const LOGIN_BODY_LIMIT = 8 * 1024;           // 登录体上限 8KB
const MAX_PASSWORD_BYTES = 72;               // 密码长度上限（沿用旧 bcrypt 72 字节纪律）→ 超长输入 fail-closed
const SESSION_ISS = 'hse-worker-mobile';
const SESSION_AUD = 'hse-mobile-h5';
const AUTH_FAILED_MSG = '手机号或密码错误';

// ---- 轻量内存级失败限速（best-effort，Workers isolate 重建即清零；不作硬保证）----
const loginFailCounter = new Map(); // ip -> { count, resetAt }
const LOGIN_FAIL_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_FAIL_MAX = 30;

function loginRateLimited(ip) {
  const now = Date.now();
  const e = loginFailCounter.get(ip);
  if (!e || now > e.resetAt) return false;
  return e.count >= LOGIN_FAIL_MAX;
}

function loginRecordFail(ip) {
  const now = Date.now();
  const e = loginFailCounter.get(ip);
  if (!e || now > e.resetAt) {
    loginFailCounter.set(ip, { count: 1, resetAt: now + LOGIN_FAIL_WINDOW_MS });
  } else {
    e.count += 1;
  }
}

// ---- JWT 签发（HS256，Web Crypto）----
async function signJwtHs256(payload, secret) {
  const enc = new TextEncoder();
  const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const h64 = b64u(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const p64 = b64u(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${h64}.${p64}`));
  return `${h64}.${p64}.${b64u(new Uint8Array(sig))}`;
}

// ---- Worker Session 验签（HS256 + exp + iss/aud 校验；不接受本地 HSE 后端 token）----
async function verifyWorkerSession(token, secret) {
  if (!token || !secret) return null;
  if (!(await verifyJwt(token, secret))) return null;
  try {
    const payload = JSON.parse(atobUrl(token.split('.')[1]));
    if (payload.iss !== SESSION_ISS || payload.aud !== SESSION_AUD) return null;
    return payload;
  } catch {
    return null;
  }
}

function bearerToken(request) {
  const auth = request.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

// ---- 身份/花名册字段取值（容错对象/数组形态；Phone 列取纯数字）----
function fieldText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v)) return v.map(fieldText).filter(Boolean).join(',');
    return String(v.text ?? v.value ?? v.name ?? '');
  }
  return String(v);
}

// ---- 飞书表结构类型化（2026-09）：日期列=日期型（API 写毫秒时间戳），照片列=附件型 ----
// 时间字符串（YYYY-MM-DD / YYYY-MM-DD HH[:MM[:SS]]）按北京时间（+08:00）解析为毫秒时间戳。
// Workers 运行时 TZ=UTC，直接 Date.parse 会差 8 小时，必须显式带 +08:00。
function patrolTimeToMs(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v; // 已是时间戳
  const str = String(v || '').trim();
  const m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (!m) return '';
  const [, y, mo, d, h = '0', mi = '0', se = '0'] = m;
  const pad = (n) => String(n).padStart(2, '0');
  const ms = Date.parse(`${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(se)}+08:00`);
  return Number.isFinite(ms) ? ms : '';
}

function msToPatrolTime(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '';
  // 飞书日期字段返回毫秒时间戳；按北京时间格式化回字符串
  return new Date(n + 8 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

// 飞书类型化表（测试/生产两表统一结构）的字段映射：
//   巡查时间→日期(ms)、创建时间→提交时间(ms)；其余键原样透传。
// ⚠️ 白名单硬防护：飞书 bitable 写入「表里不存在的字段名」会自动补建文本列（列漂移）。
//    因此 feishu 后端只允许写出白名单内的字段，未知键一律丢弃（WPS 后端不走此变换）。
const FEISHU_FIELD_WHITELIST = new Set([
  // Excel 19 列
  '序号', '昵称', '分组名称', '姓名', '所属岗位', '网格等级', '日期', '三违照片', '三违行为',
  '违章人姓名', '违章人性别', '违章人年龄', '整改后照片', '当日是否报名', '标记', '是否补交',
  '提交时间', '编号', '来源日期',
  // H5 巡查链路列
  '巡查人员ID', '网格', '问题描述', '问题类型', '是否三违', '涉及人员', '来源', 'client_request_id',
  'employee_code', '测试编号', '三违行为描述', '照片状态', '测试状态',
]);

function feishuTypedRecord(record) {
  const out = {};
  for (const [k, v] of Object.entries(record || {})) {
    if (!FEISHU_FIELD_WHITELIST.has(k)) continue; // 未知字段丢弃，防飞书自动补列
    if (k === '巡查时间') { const ms = patrolTimeToMs(v); if (ms !== '') out['日期'] = ms; continue; }
    if (k === '创建时间') { const ms = patrolTimeToMs(v); if (ms !== '') out['提交时间'] = ms; continue; }
    if (k === '日期' || k === '提交时间') { const ms = patrolTimeToMs(v); if (ms !== '') out[k] = ms; continue; }
    out[k] = v;
  }
  return out;
}

function phoneDigits(v) {
  return fieldText(v).replace(/\D+/g, '');
}

function mapLedgerRecord(rec) {
  const f = rec.fields;
  return {
    recordId: rec.id,
    name: fieldText(f['姓名']).trim(),
    superior: fieldText(f['直接上级']).trim(),
    department: fieldText(f['所属部门']).trim(),
    position: fieldText(f['职位']).trim(),
    gridLevel: fieldText(f['网格长等级']).trim(),
    phone: phoneDigits(f['手机号']),
    grade: fieldText(f['分级']).trim(),
  };
}

// 分级 → 应用角色（check.html 的角色路由消费这三个值；其他分级值 fail-closed 拒登）
const LEDGER_ROLE_MAP = {
  '公司管理': '公司管理',
  '乡镇作业中心经理': '经理',
  '管理员': '管理员',
};

// 常量时间字符串比较（复用全局 sha256Hex：哈希后逐字节比较，避免长度/前缀时序泄漏）
async function constantTimeEqual(a, b) {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

// ---- POST /api/mobile/auth/login ----
async function handleMobileLogin(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

  try {
    // 存储后端装配（WPS / 飞书）
    const adapter = getAdapter(env);
    const cfg = storageConfig(env);

    // 门 1：登录总开关（fail-closed，默认禁用）
    if (String(env.MOBILE_LOGIN_ENABLED || '') !== 'true') {
      return errRes('LOGIN_DISABLED', '移动端登录未启用', 403, corsHeaders(origin));
    }
    // 门 2：Session secret 与台账 Sheet 配置
    if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
    const fileId = cfg.fileId;
    const ledgerSheetId = cfg.ledgerSheetId;
    if (!fileId || !ledgerSheetId) return errRes('IDENTITY_NOT_CONFIGURED', '身份表未配置', 503, corsHeaders(origin));

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (loginRateLimited(ip)) {
      return errRes('TOO_MANY_ATTEMPTS', '尝试过于频繁，请稍后再试', 429, corsHeaders(origin));
    }

    // 门 3：体限制与输入校验（统一 400，不区分细节）
    const contentLen = Number(request.headers.get('content-length') || '0');
    if (contentLen > LOGIN_BODY_LIMIT) return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin));
    let body;
    try { body = await request.json(); } catch { return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin)); }
    // 输入侧严格校验（fail-closed）：原始手机号必须是 11 位纯数字；注入串/全角/带格式一律 400。
    // 数字归一化（phoneDigits）只用于 WPS 身份数据读取侧的比对，不用于放宽登录输入。
    const rawPhone = body && typeof body.phone === 'string' ? body.phone.trim() : '';
    const phone = phoneDigits(rawPhone);
    const password = body && typeof body.password === 'string' ? body.password : '';
    const pwdBytes = new TextEncoder().encode(password).length;
    if (!/^1\d{10}$/.test(rawPhone) || !/^1\d{10}$/.test(phone) || !password || pwdBytes < 1 || pwdBytes > MAX_PASSWORD_BYTES) {
      return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin));
    }

    // 1) 网格长信息台账 扫描 + 手机号唯一命中（无手机号记录天然不可命中）
    let ledgerRecs;
    try {
      ledgerRecs = (await adapter.scanRecords(env, fileId, ledgerSheetId)).map(mapLedgerRecord);
    } catch {
      return errRes('WPS_UPSTREAM_ERROR', '身份服务暂不可用，请稍后再试', 502, corsHeaders(origin));
    }
    const phoneMatches = ledgerRecs.filter((r) => r.phone === phone);
    // 防时序枚举：任何失败路径都先做一次等价派生+哈希比较
    const denyPwd = async () => { await constantTimeEqual(password, 'x0x0x0x0'); };
    if (phoneMatches.length !== 1) {
      loginRecordFail(ip);
      await denyPwd();
      return errRes('AUTH_FAILED', AUTH_FAILED_MSG, 401, corsHeaders(origin));
    }
    const identity = phoneMatches[0];

    // 2) 分级 → 应用角色（白名单外 fail-closed）
    const role = LEDGER_ROLE_MAP[identity.grade];
    if (!role) {
      loginRecordFail(ip);
      await denyPwd();
      return errRes('AUTH_FAILED', AUTH_FAILED_MSG, 401, corsHeaders(origin));
    }

    // 3) 密码校验：姓名拼音首字母(小写) + 手机号后4位；输入侧大小写不敏感
    const expectedPwd = pinyinInitials(identity.name);
    if (!expectedPwd) {
      // 台账姓名含无法解析的字符 → 该账号 fail-closed 不可登录
      loginRecordFail(ip);
      await denyPwd();
      return errRes('AUTH_FAILED', AUTH_FAILED_MSG, 401, corsHeaders(origin));
    }
    const pwdOk = await constantTimeEqual(password.toLowerCase(), expectedPwd + identity.phone.slice(-4));
    if (!pwdOk) {
      loginRecordFail(ip);
      return errRes('AUTH_FAILED', AUTH_FAILED_MSG, 401, corsHeaders(origin));
    }

    // 4) 签发 Worker 专用 Session JWT（最小身份快照；sub=手机号为稳定业务身份）
    const ttl = Math.min(Math.max(Number(env.MOBILE_SESSION_TTL_SECONDS || 7200), 300), 86400 * 7);
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await signJwtHs256({
      iss: SESSION_ISS, aud: SESSION_AUD,
      sub: identity.phone,
      name: identity.name,
      department: identity.department,
      position: identity.position,
      grid_level: identity.gridLevel,
      role,
      superior: identity.superior,
      iat: nowSec, exp: nowSec + ttl,
      jti: crypto.randomUUID(),
    }, env.WORKER_SESSION_SECRET);

    return jsonRes({
      success: true, code: 'OK',
      tokenType: 'Bearer', token, expiresIn: ttl,
      employee: {
        employee_code: identity.phone,
        name: identity.name,
        department: identity.department,
        position: identity.position,
        grid_level: identity.gridLevel,
        role,
        superior: identity.superior,
      },
    }, 200, corsHeaders(origin));
  } catch {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

// ---- GET /api/mobile/me（Session → 当前身份快照）----
async function handleMobileMe(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
  return jsonRes({
    success: true, code: 'OK',
    employee: {
      employee_code: payload.sub,
      name: payload.name || '',
      department: payload.department || '',
      position: payload.position || '',
      grid_level: payload.grid_level || '',
      role: payload.role || '',
      superior: payload.superior || '',
    },
  }, 200, corsHeaders(origin));
}

// ---- POST /api/mobile/auth/logout（无状态：验证后返回成功，客户端丢弃 token）----
async function handleMobileLogout(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
  // 无状态 JWT 无服务端吊销通道（不引入外部存储）；过期由 exp 短 TTL 兜底。
  return jsonRes({ success: true, code: 'OK', message: '已退出登录' }, 200, corsHeaders(origin));
}


// ============================================================================
// CF-WPS-19 —— H5 选人数据链：组织关系（台账「直接上级」）+ 真实花名册
// ----------------------------------------------------------------------------
// 背景：选人页原用内置演示数据（张三/李四/王五）。现改为两条真实链路：
//   ① 经理两步选人第一步「选管理员」 ← 网格长信息台账「直接上级」列
//      规则：台账中「直接上级 == 我的姓名」的记录 = 我的直接下级；按「分级」分层返回。
//   ② 选班组人员 / 搜人 ← 飞书「H5花名册表」（作业人员花名册，真实数据）
// 两个接口均为只读 + Worker Session 鉴权：
//   GET /api/mobile/org/subordinates[?under=<姓名>]
//   GET /api/mobile/roster[?q=&area=&limit=]
// 安全纪律：
//   - 只读：绝不写台账（登录唯一事实源）与花名册（禁业务写）。
//   - 台账以「姓名」连接上下级（台账无稳定 ID 列）：本人姓名不唯一 → fail-closed 返回空并提示，
//     不做模糊/拼音兜底匹配。
//   - 越权防护：?under= 只允许落在「本人子树」内（BFS + 环检测 + 深度上限 ORG_MAX_DEPTH），
//     防止任意登录用户枚举全公司组织。
//   - 手机号仅在鉴权通过后下发（业务要求「点击拨打」）；台账/花名册未配号码则留空，
//     前端自动隐藏拨打入口。
// ============================================================================
const ORG_MAX_DEPTH = 6;

// 台账子节点（直接下级）
function ledgerChildren(rows, name) {
  return rows.filter((r) => r.superior && r.superior === name);
}

// 本人子树（不含自己）。本人姓名在台账中不唯一 → null（fail-closed，避免错挂组织）
function ledgerSubtree(rows, meName) {
  const mine = rows.filter((r) => r.name === meName);
  if (mine.length !== 1) return null;
  const seen = new Set([meName]);
  const out = [];
  let frontier = [meName];
  for (let d = 0; d < ORG_MAX_DEPTH && frontier.length; d++) {
    const next = [];
    for (const nm of frontier) {
      for (const child of ledgerChildren(rows, nm)) {
        if (seen.has(child.name)) continue; // 环 / 同名重复保护
        seen.add(child.name);
        out.push({ ...child, depth: d + 1 });
        next.push(child.name);
      }
    }
    frontier = next;
  }
  return out;
}

function orgItem(r, depth) {
  return {
    name: r.name,
    department: r.department,
    position: r.position,
    gridLevel: r.gridLevel,
    grade: r.grade,
    phone: r.phone,
    depth,
  };
}

// 按「分级」分层（前端：经理先看 admins；只有 managers 时先下钻一层）
function splitOrg(descs) {
  const admins = [], managers = [], others = [];
  for (const d of descs) {
    const it = orgItem(d, d.depth);
    if (d.grade === '管理员') admins.push(it);
    else if (d.grade === '乡镇作业中心经理') managers.push(it);
    else others.push(it);
  }
  return { admins, managers, others };
}

// ---- GET /api/mobile/org/subordinates?under=<姓名> ----
async function handleOrgSubordinates(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'GET') return errRes('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, corsHeaders(origin));
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

  const adapter = getAdapter(env);
  const cfg = storageConfig(env);
  if (!cfg.fileId || !cfg.ledgerSheetId) return errRes('IDENTITY_NOT_CONFIGURED', '台账未配置', 503, corsHeaders(origin));

  let rows;
  try {
    rows = (await adapter.scanRecords(env, cfg.fileId, cfg.ledgerSheetId)).map(mapLedgerRecord).filter((r) => r.name);
  } catch {
    return errRes('UPSTREAM_ERROR', '组织信息暂不可用，请稍后再试', 502, corsHeaders(origin));
  }

  const meName = String(payload.name || '').trim();
  const subtree = ledgerSubtree(rows, meName);
  const url = new URL(request.url);
  const under = (url.searchParams.get('under') || '').trim() || meName;

  if (!subtree) {
    return jsonRes({
      success: true, code: 'AMBIGUOUS_SELF',
      message: '台账中你的姓名不唯一或未登记，无法解析下级，请联系管理员规范台账',
      me: { name: meName }, under: { name: under },
      admins: [], managers: [], others: [],
    }, 200, corsHeaders(origin));
  }
  if (under !== meName && !subtree.some((r) => r.name === under)) {
    return errRes('FORBIDDEN', '无权查看该人员的下级', 403, corsHeaders(origin));
  }

  const selfRow = rows.find((r) => r.name === under) || {};
  const direct = ledgerChildren(rows, under);
  const { admins, managers, others } = splitOrg(direct);
  const hasDeeper = direct.some((d) => ledgerChildren(rows, d.name).length > 0);

  return jsonRes({
    success: true, code: 'OK',
    me: { name: meName, department: String(payload.department || ''), position: String(payload.position || ''), role: String(payload.role || '') },
    under: { name: under, department: selfRow.department || '', position: selfRow.position || '', grade: selfRow.grade || '', gridLevel: selfRow.gridLevel || '' },
    isSelf: under === meName,
    count: direct.length,
    hasDeeper,
    admins, managers, others,
  }, 200, corsHeaders(origin));
}

// ---- GET /api/mobile/roster?q=&area=&limit= ----
// 真实作业人员花名册。字段容错映射：表里有哪些列就下发哪些（业务后续加列无需改代码）
// 数据源 = rosterSource(env) → WPS Sheet 11「员工信息维护」（1291 名正式员工，见 storage/index.js 注释）
const ROSTER_FIELD_ALIASES = {
  code: ['员工编码', '工号', '员工编号'],
  name: ['姓名'],
  status: ['用工关系状态', '在职状态', '状态'],
  // dept = 组织归属（班组/部门）；area = 网格责任区（Sheet 11「负责区域（在职）」，形如「八里堂村+惠宁」）
  // 二者语义不同：选人按班组收敛（dept），巡查按网格解析（area），不可混用。
  dept: ['所属部门', '部门', '所属班组', '班组'],
  area: ['负责区域（在职）', '负责区域'],
  phone: ['手机号', '手机号码', '联系电话', '电话'],
  sex: ['性别'],
  age: ['年龄'],
  job: ['岗位', '职位', '所属岗位'],
};
const ROSTER_INACTIVE_RE = /离职|已退|停用|退出/;

function pickRosterField(f, aliases) {
  for (const k of aliases) {
    if (f[k] === undefined || f[k] === null) continue;
    const s = fieldText(f[k]).trim();
    if (s) return s;
  }
  return '';
}
function mapRosterRecord(rec) {
  const f = rec.fields || {};
  const o = { recordId: rec.id };
  for (const key of Object.keys(ROSTER_FIELD_ALIASES)) o[key] = pickRosterField(f, ROSTER_FIELD_ALIASES[key]);
  o.phone = phoneDigits(o.phone);
  return o;
}

// ---- 花名册进程内缓存（best-effort，per-isolate）----
// 1291 人 ≈ 7 次上游分页拉取，选人页会反复调用（每位管理员下钻一次），故允许短 TTL 缓存。
// 默认关闭（TTL=0）→ 单元测试天然确定性；生产由 wrangler var ROSTER_CACHE_TTL_MS 开启。
let rosterCache = { key: '', at: 0, rows: null };
function rosterCacheTtl(env) {
  const n = Number(env.ROSTER_CACHE_TTL_MS || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
async function loadRosterRows(env) {
  const src = rosterSource(env);
  if (!src.fileId || !src.sheetId) {
    const e = new Error('roster not configured');
    e.notConfigured = true;
    throw e;
  }
  const ttl = rosterCacheTtl(env);
  const key = `${src.backend}|${src.fileId}|${src.sheetId}`;
  const now = Date.now();
  if (ttl > 0 && rosterCache.rows && rosterCache.key === key && now - rosterCache.at < ttl) return rosterCache.rows;
  const rows = (await src.adapter.scanRecords(env, src.fileId, src.sheetId)).map(mapRosterRecord);
  if (ttl > 0) rosterCache = { key, at: now, rows };
  return rows;
}

// 班组/网格匹配规则（2026-09-17 真机校准）：
//   dept（所属部门，组织口径，取自台账同一套命名）→ 正反双向包含：
//     正向 c.includes(area) ：「柴胡店镇一班」命中 area=「柴胡店镇」
//     反向 area.includes(c) ：台账部门粒度较粗时的兜底（c=「柴胡店镇」，area=「柴胡店镇一班」）
//   area（负责区域（在职），自由文本网格串）→ 仅正向包含 area.includes(areaParam)：
//     反向会误伤——实测「宁城街道三班/刘国芳」的网格为「宁城街道」，被 area=「宁城街道一班」反向命中。
function rosterAreaHit(r, area) {
  if (r.dept && (r.dept.includes(area) || (r.dept.length <= 40 && area.includes(r.dept)))) return true;
  return !!r.area && r.area.includes(area);
}

async function handleRoster(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'GET') return errRes('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, corsHeaders(origin));
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 32);
  let area = (url.searchParams.get('area') || '').trim().slice(0, 64);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50) || 50, 1), 200);
  // 最小权限：既未指定 area（班组/网格）也未搜索（q）时，默认收敛到本人所属部门，
  // 避免任意登录账号一次拉走全公司花名册（1291 人）。
  const meDept = String(payload.department || '').trim();
  const scopedToSelf = !area && !q;
  if (scopedToSelf) area = meDept;

  let all;
  try {
    all = await loadRosterRows(env);
  } catch (e) {
    if (e && e.notConfigured) return errRes('ROSTER_NOT_CONFIGURED', '花名册未配置', 503, corsHeaders(origin));
    return errRes('UPSTREAM_ERROR', '花名册暂不可用，请稍后再试', 502, corsHeaders(origin));
  }

  const active = all.filter((r) => r.name && !ROSTER_INACTIVE_RE.test(r.status));
  let hits = active;
  if (area) hits = hits.filter((r) => rosterAreaHit(r, area));
  if (q) {
    const qq = q.toLowerCase();
    hits = hits.filter((r) => r.name.toLowerCase().includes(qq) || (r.code && r.code.toLowerCase().includes(qq)));
  }
  const items = hits.slice(0, limit).map((r) => ({
    recordId: r.recordId, code: r.code, name: r.name,
    job: r.job, dept: r.dept, area: r.area, sex: r.sex, age: r.age, phone: r.phone,
  }));

  return jsonRes({
    success: true, code: 'OK',
    total: hits.length, rosterSize: active.length, truncated: hits.length > limit,
    source: rosterSource(env).backend,
    filters: { q, area, scopedToSelf },
    items,
  }, 200, corsHeaders(origin));
}

// ============================================================================
// CF-WPS-12 —— WPS 官方照片附件链路（真机三步上传实测通过后最小落地）
// ----------------------------------------------------------------------------
// 官方链路（2026-09-15 真机实证，权限 kso.documents.readwrite 须已开通）：
//   ① POST /v7/documents/{file_id}/attachments/upload/address  {name,size,type}
//        → data.request.{url,method,headers} + data.upload_id + data.send_back_params
//   ② PUT data.request.url（携带 data.request.headers）传二进制
//        → 响应头 ETag（去引号）+ newfilename
//   ③ POST /v7/documents/{file_id}/attachments/upload/complete
//        {upload_id, params:{etag,key}} → data.attachment_id
//   ④ dbsheet record 字段值 = [{fileName,size,source:'upload_ks3',type,uploadId}]
// 安全纪律：
//   - 只允许 image/jpeg / image/png；magic bytes 校验，不信 Content-Type。
//   - employee_code 一律取自 Session.sub（服务端注入），前端传入的一律忽略。
//   - 本阶段只写隔离测试 Sheet（WPS_DBSHEET_TEST_SHEET_ID）；生产 Sheet 3 永不触碰。
//   - ALLOW_WPS_WRITE 门 + Session 门 fail-closed；secret/token 不入响应与日志。
// ============================================================================

const UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // ≤5MB（§十二）
const UPLOAD_BODY_LIMIT = 6 * 1024 * 1024; // multipart 开销余量
const IMAGE_MAGIC = [
  { mime: 'image/jpeg', exts: new Set(['jpg', 'jpeg']), bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', exts: new Set(['png']), bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

// 魔数嗅探（不信 Content-Type/扩展名）；ext 用于文件名校验的宽松一致性
function detectImageMagic(bytes) {
  if (!bytes || bytes.length < 8) return null;
  for (const m of IMAGE_MAGIC) {
    if (m.bytes.every((b, i) => bytes[i] === b)) return m;
  }
  return null;
}

// ---- WPS 三步上传原语（CF-WPS-12 实证；KSO-1 与 Bearer 并用）----
async function wpsDocHeaders(env, method, path, bodyStr) {
  const u = new URL(`${(env.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, '')}${path}`);
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await getAppToken(env)}`,
    ...(await buildKso1Headers({ method, uri: u.pathname + u.search, contentType: 'application/json', appId: env.WPS_CLIENT_ID, appSecret: env.WPS_CLIENT_SECRET, bodyStr })),
  };
}

async function wpsGetUploadAddress(env, name, size, mime) {
  const base = (env.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, '');
  const path = `/v7/documents/${encodeURIComponent(env.WPS_DBSHEET_FILE_ID)}/attachments/upload/address`;
  const body = JSON.stringify({ name, size, type: mime });
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: await wpsDocHeaders(env, 'POST', path, body), body });
  const json = await safeJson(res);
  if (!res.ok || !json || json.code !== 0) {
    throw Object.assign(new Error('wps upload address failed'), { wpsHttpStatus: res.status, wpsCode: json?.code, wpsMsg: json?.message || json?.msg });
  }
  const d = json.data || {};
  return {
    uploadId: d.upload_id,
    url: d.request && d.request.url,
    method: (d.request && d.request.method) || 'PUT',
    headers: (d.request && d.request.headers) || {},
    sendBackParams: d.send_back_params || null,
  };
}

async function wpsUploadBinary(addr, buf) {
  // 存储商 URL 可能带 host 头要求；部分运行时禁设 host 头 → 失败则剥离 host 重试一次
  let res;
  try {
    res = await fetch(addr.url, { method: addr.method, headers: addr.headers, body: buf });
  } catch {
    const stripped = { ...addr.headers };
    delete stripped.host;
    res = await fetch(addr.url, { method: addr.method, headers: stripped, body: buf });
  }
  if (!res.ok) throw Object.assign(new Error('wps binary upload failed'), { wpsHttpStatus: res.status });
  const headers = {};
  res.headers.forEach((v, k) => {
    const kl = k.toLowerCase();
    if (kl === 'etag' || kl === 'newfilename') headers[kl] = v;
  });
  return { etag: (headers.etag || '').replace(/"/g, ''), key: headers.newfilename || '' };
}

async function wpsCompleteUpload(env, uploadId, etag, key) {
  const base = (env.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, '');
  const path = `/v7/documents/${encodeURIComponent(env.WPS_DBSHEET_FILE_ID)}/attachments/upload/complete`;
  const body = JSON.stringify({ upload_id: uploadId, params: { etag, key } });
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: await wpsDocHeaders(env, 'POST', path, body), body });
  const json = await safeJson(res);
  if (!res.ok || !json || json.code !== 0) {
    throw Object.assign(new Error('wps upload complete failed'), { wpsHttpStatus: res.status, wpsCode: json?.code, wpsMsg: json?.message || json?.msg });
  }
  return { attachmentId: json.data && json.data.attachment_id };
}

// ---- POST /wps/upload/image（升级 CF-WPS-08 的 501 占位；不新建重复端点）----
async function handleUploadImage(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

  try {
    // 存储后端装配（WPS / 飞书）
    const adapter = getAdapter(env);
    const cfg = storageConfig(env);

    // 门 1：Session（employee_code 唯一来源=sub；不支持后端 JWT——上传属移动端会话语义）
    if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
    const session = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
    if (!session) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
    const employeeCode = String(session.sub || ''); // 服务端注入；前端传入的一律忽略
    if (!employeeCode) return errRes('UNAUTHORIZED', '会话身份缺失', 401, corsHeaders(origin));

    // 门 2：写开关（fail-closed）
    if (String(env.ALLOW_WPS_WRITE || '') !== 'true') {
      return errRes('WPS_WRITE_DISABLED', 'WPS 写入未启用（ALLOW_WPS_WRITE）', 403, corsHeaders(origin));
    }
    // 门 3：只允许隔离测试 Sheet（本阶段禁止生产 Sheet 3）
    const fileId = cfg.fileId;
    const testSheetId = cfg.testSheetId;
    if (!fileId || !testSheetId) return errRes('TEST_SHEET_NOT_CONFIGURED', '测试 Sheet 未配置', 503, corsHeaders(origin));

    // 门 4：体大小（multipart）
    const contentLen = Number(request.headers.get('content-length') || '0');
    if (contentLen > UPLOAD_BODY_LIMIT) return errRes('BODY_TOO_LARGE', `请求体超过上限（${UPLOAD_BODY_LIMIT} 字节）`, 413, corsHeaders(origin));
    let form;
    try { form = await request.formData(); } catch { return errRes('BAD_REQUEST', '请求必须为 multipart/form-data', 400, corsHeaders(origin)); }
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return errRes('BAD_REQUEST', '缺少文件字段 file', 400, corsHeaders(origin));
    const clientRequestId = String(form.get('client_request_id') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

    // 门 5：大小 + magic bytes（不信 Content-Type/扩展名）
    if (file.size <= 0) return errRes('BAD_REQUEST', '空文件', 400, corsHeaders(origin));
    if (file.size > UPLOAD_MAX_BYTES) return errRes('FILE_TOO_LARGE', `图片超过上限（${UPLOAD_MAX_BYTES} 字节）`, 413, corsHeaders(origin));
    const buf = new Uint8Array(await file.arrayBuffer());
    const magic = detectImageMagic(buf);
    if (!magic) return errRes('UNSUPPORTED_FILE_TYPE', '仅支持 JPEG/PNG 图片', 400, corsHeaders(origin));
    const rawName = String(file.name || 'photo');
    const ext = (rawName.split('.').pop() || '').toLowerCase();
    if (ext && !magic.exts.has(ext)) return errRes('UNSUPPORTED_FILE_TYPE', '文件扩展名与图片内容不符', 400, corsHeaders(origin));

    // ---- 飞书后端：drive media 上传 → file_token（纯上传，不建记录；附件在巡查提交时落入「三违照片」列）----
    if (cfg.backend === 'feishu') {
      if (!env.FS_APP_TOKEN) return errRes('STORAGE_NOT_CONFIGURED', '存储目标未配置', 503, corsHeaders(origin));
      const safeName = (rawName.split(/[\\/]/).pop() || `photo.${[...magic.exts][0]}`).slice(0, 128);
      let fileToken;
      try {
        const { uploadMedia } = await import('./storage/feishuAdapter.js');
        fileToken = await uploadMedia(env, buf, safeName, magic.mime);
      } catch (e) {
        if (e && e.isRateLimit) return errRes('WPS_RATE_LIMITED', '存储限频，请稍后重试', 429, corsHeaders(origin));
        return errRes('WPS_UPSTREAM_ERROR', `照片上传失败（fsCode=${e && e.fsCode}）`, 502, corsHeaders(origin));
      }
      return jsonRes({ success: true, code: 'OK', backend: 'feishu', file_token: fileToken, employee: { employee_code: employeeCode } }, 200, corsHeaders(origin));
    }

    // 幂等预查（仅测试 Sheet；沿用 client_request_id 语义）
    if (clientRequestId) {
      const existing = await findExistingByClientRequestId(adapter, env, fileId, testSheetId, [clientRequestId]);
      if (existing) {
        return jsonRes({ success: true, code: 'OK', deduplicated: true, recordIds: existing, employee: { employee_code: employeeCode } }, 200, corsHeaders(origin));
      }
    }

    // WPS 官方三步上传
    const safeName = (rawName.split(/[\\/]/).pop() || `photo.${[...magic.exts][0]}`).slice(0, 128);
    let addr, store;
    try {
      addr = await wpsGetUploadAddress(env, safeName, file.size, magic.mime);
      if (!addr.url || !addr.uploadId) throw Object.assign(new Error('address incomplete'), { wpsHttpStatus: 502 });
      store = await wpsUploadBinary(addr, buf);
      const done = await wpsCompleteUpload(env, addr.uploadId, store.etag, store.key);
      addr.attachmentId = done.attachmentId;
    } catch (e) {
      if (e && e.wpsHttpStatus === 403) {
        return errRes('UPLOAD_SCOPE_MISSING', 'WPS 附件上传权限未开通（kso.documents.readwrite）', 503, corsHeaders(origin));
      }
      return errRes('WPS_UPSTREAM_ERROR', 'WPS 上传失败，请稍后再试', 502, corsHeaders(origin));
    }

    // 写隔离测试 Sheet 记录（字段白名单 = 测试 Sheet 列；employee_code 服务端注入）
    const attObj = { fileName: safeName, size: file.size, source: 'upload_ks3', type: magic.mime, uploadId: addr.uploadId };
    const record = {
      '测试编号': `CF-WPS-12-TEST-${Date.now()}`,
      'employee_code': employeeCode,
      '测试图片': [attObj],
      '测试状态': 'uploaded',
      'client_request_id': clientRequestId || `CID-C12-${Date.now()}`,
      '创建时间': new Date().toISOString().slice(0, 10),
    };
    let recs;
    try {
      recs = await adapter.createRecords(env, fileId, testSheetId, [record]);
    } catch (e) {
      if (e && e.isRateLimit) return errRes('WPS_RATE_LIMITED', 'WPS 限频，请稍后重试', 429, corsHeaders(origin));
      return errRes('WPS_UPSTREAM_ERROR', 'WPS 写入失败', 502, corsHeaders(origin));
    }
    return jsonRes({
      success: true, code: 'OK',
      recordIds: recs.map((r) => (typeof r === 'string' ? r : r && r.id)).filter(Boolean),
      attachment: { uploadId: addr.uploadId, attachmentId: addr.attachmentId || null },
      employee: { employee_code: employeeCode },
    }, 200, corsHeaders(origin));
  } catch {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

// ============================================================================
// CF-WPS-13 —— 网格长巡查文字业务链（Session→employee_code→WPS 缓冲表）
// ----------------------------------------------------------------------------
// 边界（CF-WPS-13 任务书）：
//   - 身份：一律取 Session.sub（employee_code），前端传入的 employee_code 一律忽略。
//   - 网格：不按姓名/手机号猜。唯一来源 = Sheet 11「负责区域（在职）」按员工编码精确命中；
//     解析不出 → 明确失败「当前人员无法确定巡查网格，请联系管理员」。
//   - 目标 Sheet fail-closed：
//       · 缺省 → 隔离测试 Sheet（WPS_DBSHEET_TEST_SHEET_ID）。
//       · 生产目标 = WPS_PATROL_TARGET_SHEET=UNRESOLVED（CF-WPS-13 阶段 B 审计结论：
//         现有 Sheet 3 为三违巡查表，缺 问题描述/问题类型/client_request_id 等列，
//         硬写会污染三违台账）。启用生产写须同时满足三个 env 开关
//         （MOBILE_PATROL_PRODUCTION_ENABLED + MOBILE_PATROL_TARGET_SHEET_ID +
//          WPS_PATROL_FIELDS_CONFIRMED），任一缺失 → 503 PATROL_TARGET_UNRESOLVED。
//   - 三违：只做移动端「发现并记录」，不做责任人/扣分/审核/整改计算。
//   - 照片：PHOTO_STATUS=PENDING_EXTERNAL（CF-WPS-12B 终局结论），不阻塞文字链。
//   - 幂等：沿用 client_request_id 预查（O(n) 扫描）→ IDEMPOTENCY_STATUS=LIMITED。
// ============================================================================

const PATROL_BODY_LIMIT = 32 * 1024; // 巡查提交体上限
const PATROL_DESC_MAX = 500;         // 问题描述长度上限
const PATROL_VIOL_DESC_MAX = 300;    // 三违行为描述长度上限
const PATROL_PEOPLE_MAX = 200;       // 涉及人员长度上限
const PATROL_TIME_MAX = 32;          // 巡查时间字符串长度上限
const PATROL_LIST_LIMIT = 50;        // 「我的巡查记录」返回条数上限

// 问题类型候选（env MOBILE_PATROL_PROBLEM_TYPES 可覆盖；默认集仅用于隔离测试，正式类型清单待业务方确认）
const PATROL_DEFAULT_PROBLEM_TYPES = ['环境卫生', '设施设备', '安全隐患', '秩序管理', '其他'];

function patrolProblemTypes(env) {
  const raw = String(env.MOBILE_PATROL_PROBLEM_TYPES || '').trim();
  if (!raw) return PATROL_DEFAULT_PROBLEM_TYPES.slice();
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : PATROL_DEFAULT_PROBLEM_TYPES.slice();
}

// ---- 目标 Sheet 解析（fail-closed；生产三开关缺一不可）----
function patrolTarget(env, cfg) {
  cfg = cfg || storageConfig(env);
  const prodEnabled = String(env.MOBILE_PATROL_PRODUCTION_ENABLED || '') === 'true';
  const prodSheet = String(cfg.prodSheetId || '').trim();
  const fieldsConfirmed = String(env.WPS_PATROL_FIELDS_CONFIRMED || '') === 'true';
  if (prodEnabled && prodSheet && fieldsConfirmed) return { sheetId: prodSheet, production: true };
  const testSheet = String(cfg.testSheetId || '').trim();
  if (!testSheet) return null;
  return { sheetId: testSheet, production: false };
}

// ---- 文本净化：去控制字符 + 长度截断 ----
function patrolText(v, maxLen) {
  if (v == null || typeof v !== 'string') return '';
  const t = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

// ---- 网格归一：Sheet 11「负责区域（在职）」值 → 网格名数组 ----
// 实测形态："八里堂村+惠宁" / "专业队" / "0"（无效）/ 空。分隔符 +，、/;；均拆分。
function normalizeGridAreas(areaStr) {
  return String(areaStr || '')
    .split(/[+＋,，、/;；|]+/)
    .map((s) => s.trim())
    .filter((s) => s && s !== '0');
}

// ---- Sheet 11 负责区域读取（新 mapper，不改动既有 mapRosterRecord 语义）----
function mapRosterAreaRecord(rec) {
  const f = rec.fields;
  return {
    recordId: rec.id,
    employeeCode: fieldText(f['员工编码']).trim(),
    name: fieldText(f['姓名']).trim(),
    areaOnDuty: fieldText(f['负责区域（在职）']).trim(),
  };
}

// employee_code → 网格列表（精确匹配；多行命中/无法解析 → fail-closed 空）
// 数据源与 /api/mobile/roster 同源（rosterSource → WPS Sheet 11），确保「选人看到的人」与
// 「能解析出网格的人」是同一份花名册；未配置时返回空而非抛错（由调用方决定文案）。
async function resolvePatrolGrids(env, employeeCode) {
  const src = rosterSource(env);
  if (!src.fileId || !src.sheetId) return { grids: [], matched: 0 };
  const recs = await src.adapter.scanRecords(env, src.fileId, src.sheetId);
  const matches = recs.map(mapRosterAreaRecord).filter((r) => r.employeeCode === employeeCode);
  if (matches.length !== 1) return { grids: [], matched: matches.length };
  return { grids: normalizeGridAreas(matches[0].areaOnDuty), matched: 1 };
}

// ---- GET /api/mobile/patrol/meta：身份 + 网格解析 + 问题类型候选 ----
async function handlePatrolMeta(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
  const cfg = storageConfig(env);

  let grids = [], matched = 0;
  try {
    const r = await resolvePatrolGrids(env, payload.sub);
    grids = r.grids; matched = r.matched;
  } catch {
    return errRes('WPS_UPSTREAM_ERROR', '网格信息暂不可用，请稍后再试', 502, corsHeaders(origin));
  }
  const resolved = grids.length > 0;
  const target = patrolTarget(env, cfg);
  return jsonRes({
    success: true, code: 'OK',
    employee: {
      employee_code: payload.sub,
      name: payload.name || '',
      department: payload.department || '',
      position: payload.position || '',
      grid_level: payload.grid_level || '',
    },
    grid_resolved: resolved,
    grid_mode: resolved ? (grids.length === 1 ? 'auto' : 'select') : 'unresolved',
    grids,
    roster_matches: matched,
    message: resolved ? '' : '当前人员无法确定巡查网格，请联系管理员',
    problem_types: patrolProblemTypes(env),
    photo_status: 'FEISHU_ATTACHMENT_READY',
    photo_note: cfg.backend === 'feishu'
      ? '照片经 /wps/upload/image 上传至飞书（返回 file_token），提交时随记录落入「三违照片」附件列'
      : '照片链路 WPS 页面预览能力未开放（CF-WPS-12B），本次巡查可先提交文字记录',
    target: target ? (target.production ? 'production' : 'test') : 'unconfigured',
  }, 200, corsHeaders(origin));
}

// ---- 巡查提交字段校验（全部服务端定值；body 字段绝不展开进 record）----
// 超长文本 = 拒绝（不静默截断，避免篡改用户内容）
function validatePatrolBody(body, problemTypes) {
  const errors = [];
  const inspectTime = patrolText(body && body.inspection_time, PATROL_TIME_MAX);
  if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(inspectTime) || patrolText(body && body.inspection_time, PATROL_TIME_MAX + 1).length > PATROL_TIME_MAX) errors.push('inspection_time');

  const gridRaw = patrolText(body && body.grid, 101);
  const grid = patrolText(body && body.grid, 100);
  if (!grid || gridRaw.length > 100) errors.push('grid');

  const descRaw = patrolText(body && body.description, PATROL_DESC_MAX + 1);
  const description = patrolText(body && body.description, PATROL_DESC_MAX);
  if (!description || descRaw.length > PATROL_DESC_MAX) errors.push('description');

  const typeList = problemTypes;
  const problemType = patrolText(body && body.problem_type, 50);
  if (!typeList.includes(problemType)) errors.push('problem_type');

  const isViolation = patrolText(body && body.is_violation, 4);
  if (isViolation !== '是' && isViolation !== '否') errors.push('is_violation');

  let violationDesc = '', violationPeople = '';
  if (isViolation === '是') {
    violationDesc = patrolText(body && body.violation_desc, PATROL_VIOL_DESC_MAX);
    const vdRaw = patrolText(body && body.violation_desc, PATROL_VIOL_DESC_MAX + 1);
    if (!violationDesc || vdRaw.length > PATROL_VIOL_DESC_MAX) errors.push('violation_desc');
    violationPeople = patrolText(body && body.violation_people, PATROL_PEOPLE_MAX);
    const vpRaw = patrolText(body && body.violation_people, PATROL_PEOPLE_MAX + 1);
    if (!violationPeople || vpRaw.length > PATROL_PEOPLE_MAX) errors.push('violation_people');
  }

  const photoTaken = String((body && body.photo_taken) || '') === 'true';
  const clientRequestId = patrolText(body && body.client_request_id, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientRequestId)) errors.push('client_request_id');

  return {
    errors,
    values: {
      inspectionTime: inspectTime, grid, description, problemType,
      isViolation, violationDesc, violationPeople,
      photoStatus: photoTaken ? 'PENDING_EXTERNAL' : '未拍摄',
      clientRequestId,
    },
  };
}

// ---- POST /api/mobile/patrol/submit ----
async function handlePatrolSubmit(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  try {
    // 存储后端装配（WPS / 飞书）
    const adapter = getAdapter(env);
    const cfg = storageConfig(env);

    // 门 1：Session（employee_code 唯一来源）
    if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
    const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
    if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
    const employeeCode = payload.sub; // 服务端注入；前端 employee_code 一律忽略

    // 门 2：写开关 fail-closed
    if (String(env.ALLOW_WPS_WRITE || '') !== 'true') {
      return errRes('WPS_WRITE_DISABLED', '写入未启用（ALLOW_WPS_WRITE）', 403, corsHeaders(origin));
    }

    // 门 3：目标 Sheet fail-closed（生产目标 UNRESOLVED → 测试 Sheet；三开关缺一 → 拒生产）
    const target = patrolTarget(env, cfg);
    if (!target) return errRes('PATROL_TARGET_NOT_CONFIGURED', '巡查目标表未配置', 503, corsHeaders(origin));
    if (target.production && !cfg.fileId) {
      return errRes('PATROL_TARGET_NOT_CONFIGURED', '巡查目标表未配置', 503, corsHeaders(origin));
    }
    const fileId = cfg.fileId;
    const sheetId = target.sheetId;

    // 门 4：体限制 + JSON
    const contentLen = Number(request.headers.get('content-length') || '0');
    if (contentLen > PATROL_BODY_LIMIT) return errRes('BODY_TOO_LARGE', `请求体超过上限（${PATROL_BODY_LIMIT} 字节）`, 413, corsHeaders(origin));
    let body;
    try { body = await request.json(); } catch { return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin)); }
    if (!body || typeof body !== 'object') return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin));

    // 校验（protected 字段 employee_code/inspector_employee_id/grid_id/attribution_status
    // 等即使出现在 body 也绝不进入 record：record 全部由服务端定值构建）
    const { errors, values } = validatePatrolBody(body, patrolProblemTypes(env));
    if (errors.length) {
      return errRes('PATROL_FIELD_INVALID', `字段校验失败：${errors.join(',')}`, 400, corsHeaders(origin));
    }

    // 照片附件（可选，仅飞书后端）：body.photo_tokens = 上传接口返回的 file_token 数组（≤3）
    let photoTokens = [];
    if (body.photo_tokens != null) {
      const ok = Array.isArray(body.photo_tokens) && body.photo_tokens.length <= 3
        && body.photo_tokens.every((t) => typeof t === 'string' && /^[A-Za-z0-9]{10,120}$/.test(t));
      if (!ok) return errRes('PATROL_FIELD_INVALID', 'photo_tokens 不合法（≤3 个、字母数字、来自上传接口）', 400, corsHeaders(origin));
      if (cfg.backend !== 'feishu') return errRes('UPLOAD_NOT_SUPPORTED', 'WPS 后端照片链路未开放，请勿携带 photo_tokens', 501, corsHeaders(origin));
      photoTokens = [...new Set(body.photo_tokens)];
    }

    // 门 5：网格 fail-closed（服务端解析为准；body.grid 必须在解析结果内）
    // 注意：resolvePatrolGrids 只接受 (env, employeeCode) —— 数据源由 rosterSource(env) 决定，
    // 不再由调用方传入 adapter/cfg（曾因旧签名残留导致 env 错位、网格恒 unresolved）。
    let grids;
    try {
      grids = await resolvePatrolGrids(env, employeeCode);
    } catch {
      return errRes('WPS_UPSTREAM_ERROR', '网格信息暂不可用，请稍后再试', 502, corsHeaders(origin));
    }
    if (!grids.grids.length) {
      return errRes('GRID_UNRESOLVED', '当前人员无法确定巡查网格，请联系管理员', 422, corsHeaders(origin));
    }
    if (!grids.grids.includes(values.grid)) {
      return errRes('GRID_NOT_ALLOWED', '巡查网格与服务端解析结果不一致', 422, corsHeaders(origin));
    }

    // 门 6：幂等预查（LIMITED：O(n) 扫描，≤20 页）
    const existing = await findExistingByClientRequestId(adapter, env, fileId, sheetId, [values.clientRequestId]);
    if (existing) {
      return jsonRes({
        success: true, code: 'OK', deduplicated: true,
        recordIds: existing,
        client_request_id: values.clientRequestId,
        employee: { employee_code: employeeCode },
      }, 200, corsHeaders(origin));
    }

    // 组 record（全部服务端定值；姓名取 Session 快照）
    // CF-WPS-17：正式目标表(Sheet 15「生产用台账」)不含测试字段(测试编号/测试状态/照片状态)，
    // 按 target.production 分叉构建，避免向不存在的列写入导致 WPS 500；测试表保持原形态。
    // 三生产开关（MOBILE_PATROL_PRODUCTION_ENABLED / TARGET_SHEET_ID / WPS_PATROL_FIELDS_CONFIRMED）
    // 任一为 false → patrolTarget() 回落测试表，本分支永不被触发（CF-WPS-17 §七）。
    const record = target.production
      ? {
          '巡查人员ID': employeeCode,   // 复用现有列[X]；mobile 业务身份=employee_code，语义=巡查人员标识（CF-WPS-17 §六 安全复用，有明确证据）
          '姓名': payload.name || '',
          '巡查时间': values.inspectionTime,
          '网格': values.grid,
          '问题描述': values.description,
          '问题类型': values.problemType,
          '是否三违': values.isViolation,
          '三违行为': values.violationDesc, // 复用现有列[M] 三违行为（CF-WPS-17 §六 安全复用，语义一致）
          '涉及人员': values.violationPeople, // CF-WPS-18 §二/§五：新增列[B0]，仅承载 H5 允许的 violation_people 输入（多人逗号分隔，≤200 字符）；不映射到 违章人姓名/姓名/三违行为/巡查人员ID
          '来源': 'h5-mobile',
          client_request_id: values.clientRequestId,
          '创建时间': new Date().toISOString().slice(0, 10),
        }
      : {
          '测试编号': `CF-WPS-13-TEST-${Date.now()}`,
          employee_code: employeeCode,
          '姓名': payload.name || '',
          '巡查时间': values.inspectionTime,
          '网格': values.grid,
          '问题描述': values.description,
          '问题类型': values.problemType,
          '是否三违': values.isViolation,
          '三违行为描述': values.violationDesc,
          '涉及人员': values.violationPeople,
          '照片状态': values.photoStatus,
          '来源': 'h5-mobile',
          '测试状态': 'submitted',
          client_request_id: values.clientRequestId,
          '创建时间': new Date().toISOString().slice(0, 10),
        };

    // 照片附件（飞书后端）：file_token 数组落入「三违照片」附件列，照片状态同步置「已上传」
    if (photoTokens.length) {
      record['三违照片'] = photoTokens.map((t) => ({ file_token: t }));
      record['照片状态'] = '已上传';
    }

    // 写存储后端（适配器按后端转换端点/格式）
    // 飞书后端：表已类型化（日期列=日期型毫秒、照片列=附件），写入前做字段映射变换
    const outRecord = cfg.backend === 'feishu' ? feishuTypedRecord(record) : record;
    let recs;
    try {
      recs = await adapter.createRecords(env, fileId, sheetId, [outRecord]);
    } catch (e) {
      if (e && e.isRateLimit) return errRes('WPS_RATE_LIMITED', '存储限频，请稍后重试', 429, corsHeaders(origin));
      return errRes('WPS_UPSTREAM_ERROR', '存储写入失败', 502, corsHeaders(origin));
    }
    return jsonRes({
      success: true, code: 'OK',
      recordIds: recs.map((r) => (typeof r === 'string' ? r : r && r.id)).filter(Boolean),
      client_request_id: values.clientRequestId,
      employee: { employee_code: employeeCode },
      target: target.production ? 'production' : 'test',
    }, 200, corsHeaders(origin));
  } catch {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

// ---- GET /api/mobile/patrol/records（列表；?id= 详情；仅本人记录）----
function patrolRecordView(rec, full) {
  const f = rec.fields || {};
  const base = {
    record_id: rec.id,
    inspection_time: fieldText(f['巡查时间']) || msToPatrolTime(f['日期']),
    grid: fieldText(f['网格']),
    problem_type: fieldText(f['问题类型']),
    description: fieldText(f['问题描述']),
    is_violation: fieldText(f['是否三违']),
    created_at: fieldText(f['创建时间']) || msToPatrolTime(f['提交时间']),
  };
  if (!full) return base;
  return {
    ...base,
    employee_code: fieldText(f['employee_code']) || fieldText(f['巡查人员ID']),
    name: fieldText(f['姓名']),
    violation_desc: fieldText(f['三违行为描述']) || fieldText(f['三违行为']),
    violation_people: fieldText(f['涉及人员']),
    photo_status: fieldText(f['照片状态']) || 'PENDING_EXTERNAL',
    photo_count: Array.isArray(f['三违照片']) ? f['三违照片'].length : 0,
    source: fieldText(f['来源']),
    test_status: fieldText(f['测试状态']),
    client_request_id: fieldText(f['client_request_id']),
  };
}

async function handlePatrolRecords(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
  const adapter = getAdapter(env);
  const cfg = storageConfig(env);

  const target = patrolTarget(env, cfg);
  if (!target) return errRes('PATROL_TARGET_NOT_CONFIGURED', '巡查目标表未配置', 503, corsHeaders(origin));
  const fileId = cfg.fileId;

  let recs;
  try {
    recs = await adapter.scanRecords(env, fileId, target.sheetId);
  } catch {
    return errRes('WPS_UPSTREAM_ERROR', '巡查记录暂不可用，请稍后再试', 502, corsHeaders(origin));
  }

  const url = new URL(request.url);
  const wantId = url.searchParams.get('id');

  if (wantId) {
    const hit = recs.find((r) => r.id === String(wantId) && (fieldText(r.fields['employee_code']) || fieldText(r.fields['巡查人员ID'])) === payload.sub);
    if (!hit) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
    return jsonRes({ success: true, code: 'OK', record: patrolRecordView(hit, true) }, 200, corsHeaders(origin));
  }

  const mine = recs
    .filter((r) => (fieldText(r.fields['employee_code']) || fieldText(r.fields['巡查人员ID'])) === payload.sub)
    .sort((a, b) => {
      const ta = fieldText(a.fields['创建时间']) || msToPatrolTime(a.fields['日期']) || fieldText(a.fields['提交时间']);
      const tb = fieldText(b.fields['创建时间']) || msToPatrolTime(b.fields['日期']) || fieldText(b.fields['提交时间']);
      return String(tb).localeCompare(String(ta));
    })
    .slice(0, PATROL_LIST_LIMIT);
  return jsonRes({
    success: true, code: 'OK',
    total: mine.length,
    records: mine.map((r) => patrolRecordView(r, false)),
  }, 200, corsHeaders(origin));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === '/wps/oauth/start') return handleStart(env);
    if (p === '/wps/oauth/callback') return handleCallback(request, env);
    if (p === '/wps/records/create') return handleRecordCreate(request, env);
    if (p === '/wps/upload/image') return handleUploadImage(request, env);
    // CF-WPS-11：移动端身份登录（最小闭环）
    if (p === '/api/mobile/auth/login') return handleMobileLogin(request, env);
    if (p === '/api/mobile/auth/logout') return handleMobileLogout(request, env);
    if (p === '/api/mobile/me') return handleMobileMe(request, env);
    // CF-WPS-19：选人数据链（组织关系 + 真实花名册）
    if (p === '/api/mobile/org/subordinates') return handleOrgSubordinates(request, env);
    if (p === '/api/mobile/roster') return handleRoster(request, env);
    // CF-WPS-13：网格长巡查文字业务链
    if (p === '/api/mobile/patrol/meta') return handlePatrolMeta(request, env);
    if (p === '/api/mobile/patrol/submit') return handlePatrolSubmit(request, env);
    if (p === '/api/mobile/patrol/records') return handlePatrolRecords(request, env);

    return jsonRes({ success: false, code: 'NOT_FOUND', message: 'unknown route', path: p }, 404);
  },
};

// 导出供 Node 测试复用（Cloudflare 运行时不依赖这些导出）
// 注：normalizeWpsRecord / scanWpsRecords 已迁入 worker/storage/wpsAdapter.js（零行为变更），此处再导出供测试
export { normalizeWpsRecord, getAppToken } from './storage/wpsAdapter.js';
export {
  kso1Signature,
  buildKso1Headers,
  parseTokenResponse,
  unwrapV7,
  normalizeUser,
  handleStart,
  handleCallback,
  handleRecordCreate,
  handleUploadImage,
  handleMobileLogin,
  handleMobileMe,
  handleMobileLogout,
  verifyJwt,
  verifyWorkerSession,
  signJwtHs256,
  mapLedgerRecord,
  LEDGER_ROLE_MAP,
  constantTimeEqual,
  pinyinInitials,
  // CF-WPS-19
  handleOrgSubordinates,
  handleRoster,
  mapRosterRecord,
  rosterSource,
  rosterAreaHit,
  ledgerChildren,
  ledgerSubtree,
  splitOrg,
  ORG_MAX_DEPTH,
  handlePatrolMeta,
  handlePatrolSubmit,
  handlePatrolRecords,
  patrolTarget,
  patrolProblemTypes,
  normalizeGridAreas,
  validatePatrolBody,
  wpsGetUploadAddress,
  wpsUploadBinary,
  wpsCompleteUpload,
  detectImageMagic,
  UPLOAD_MAX_BYTES,
  RECORD_FIELD_WHITELIST,
  TEST_FIELD_WHITELIST,
  PROTECTED_FIELDS,
};
