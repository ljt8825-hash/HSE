// ============================================================================
// H5 移动端 Worker —— 网格长巡查业务（2026-09-18 起仅飞书多维表格后端，已弃 WPS）
// ============================================================================
// 链路（同一份代码可在不同飞书 base 间切换，换 base 仅改 FS_APP_TOKEN；表 ID 按表名解析）：
//   浏览器 → /api/mobile/auth/login     网格长信息台账手机号+派生密码登录 → Worker Session JWT
//          → /api/mobile/patrol/meta    解析巡查网格 + 问题类型/三违库下发
//          → /api/mobile/upload         飞书 drive media 上传照片 → file_token
//          → /api/mobile/patrol/submit  规范校验 + client_request_id 幂等 → 写「H5员工日常不安全行为台账」主台账
//   /wps/records/create                    历史路径名保留的最小 records create 代理（同样写飞书主台账）
//
// 存储装配见 worker/storage/index.js（仅飞书；表 ID 按表名契约解析，env 显式 ID 可覆盖）。
// 安全纪律：
//   - secret（FS_APP_SECRET / WORKER_SESSION_SECRET / JWT_VERIFY_SECRET）仅存于 Worker Secret。
//   - Session JWT 绝不回传明文密码；日志/响应绝不泄露 密码明文、完整手机号、token、secret。
//   - 本 Worker 不连接 PG / HSE，不修改生产登录、权限、HSE 后端任何业务。
// ============================================================================

// 2026-09 改版：密码改为派生规则（姓名首字母+手机号后4位）+常量时间比较，不再依赖 bcryptjs

// ---- 存储后端（仅飞书；2026-09-18 起已放弃 WPS）----
import { getAdapter, storageConfig, findExistingByClientRequestId, invalidateMainLedger, getIdentityRows, invalidateIdentity } from './storage/index.js';
import { pinyinInitials } from './pinyin-init.js'; // 姓名拼音首字母（构建期压缩表，零依赖）
// CF-WPS-21：离线逆地理编码（宁津县乡镇/街道边界内置，零外部依赖）
import { regeoNingjin, validLatLng, GEO_TOWNS } from './geo-regeo.js';



// ---- Web Crypto 助手（Worker 原生 crypto.subtle；Node 测试环境由 test 注入 globalThis.crypto）----
const _enc = new TextEncoder();

// 常量时间字符串比较复用 sha256Hex；此处保留 sha256Hex 供登录 fail-closed 使用
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', _enc.encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// CF-WPS-08 最小落地 —— Worker 业务代理（2026-09-18 起仅飞书后端）
// ----------------------------------------------------------------------------
// 边界（CF-WPS-08 任务书 §十/§十七；2026-09-18 已去 WPS）：
//   - 只做「安全代理 + 飞书缓冲层」，不做 HSE 后端、不连 PG、不重写认证。
//   - POST /wps/records/create：最小 records create 代理（历史路径名保留，后端即飞书主台账）。
//       · 认证门：Bearer JWT —— 用与本地 HSE 后端相同的 JWT_SECRET（Secret 注入）
//         做 HS256 验签（复用现有 JWT 体系，不新建认证；只验签，不签发）。
//       · 字段白名单：仅放行移动端巡查提交相关列（对齐主台账）。原 ALLOW_WPS_WRITE 写开关已废除，
//         写入目标一律为「H5员工日常不安全行为台账」主台账（Q1 单主台账口径）。
//   - POST /api/mobile/upload：飞书 drive media 上传图片 → file_token（纯上传，不建记录；
//     附件在巡查提交时随 body.photo_tokens 落入「三违照片」列）。
//   - CORS：仅放行 env CF_ALLOWED_ORIGINS 白名单（逗号分隔），默认空 = 全部拒绝。
//   - 错误归一化：统一 { success:false, code, message }；secret/token/密码绝不入响应与日志。
//   - 本地验证：test/cfwps08.test.mjs（mock 上游，不触碰真实写）。
// ============================================================================

// ---- record 字段白名单（移动端巡查提交相关列；仅用于 /wps/records/create 历史代理）----
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

// ---- 分页扫描 / 幂等预查 / records create 均已迁入 worker/storage/index.js / feishuAdapter.js ----

// ---- 最小 record create 代理（白名单 + JWT 门；写飞书主台账）----
async function handleRecordCreate(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

  try {
    // 存储后端装配（飞书）
    const adapter = getAdapter(env);
    const cfg = await storageConfig(env);

    // 门 1：JWT（现有体系验签；未配置 secret = 拒绝）
    if (!env.JWT_VERIFY_SECRET) return errRes('AUTH_NOT_CONFIGURED', '认证未配置', 503, corsHeaders(origin));
    const auth = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!(await verifyJwt(token, env.JWT_VERIFY_SECRET))) {
      return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
    }
    // 门 2：目标文件配置
    const fileId = cfg.fileId;
    if (!fileId) return errRes('STORAGE_NOT_CONFIGURED', '存储目标未配置', 503, corsHeaders(origin));

    // 体：{ records: [ {字段名: 值} ] }（历史 target='test' 分支已废弃）
    // 413：体超限（CF-WPS-10 §七.6）
    const contentLen = Number(request.headers.get('content-length') || '0');
    if (contentLen > MAX_BODY_BYTES) {
      return errRes('BODY_TOO_LARGE', `请求体超过上限（${MAX_BODY_BYTES} 字节）`, 413, corsHeaders(origin));
    }
    let body;
    try { body = await request.json(); } catch { return errRes('BAD_REQUEST', '请求体必须为 JSON', 400, corsHeaders(origin)); }

    // 目标 Sheet 语义（2026-09-18 单主台账：原 test 分支已删，一律写主台账 prodSheetId）
    const sheetId = cfg.prodSheetId;
    if (!sheetId) return errRes('STORAGE_NOT_CONFIGURED', '主台账未配置', 503, corsHeaders(origin));
    const fieldWhitelist = RECORD_FIELD_WHITELIST;

    const records = Array.isArray(body && body.records) ? body.records : [];
    if (!records.length || records.length > 50) {
      return errRes('BAD_REQUEST', 'records 必须为 1..50 的数组', 400, corsHeaders(origin));
    }
    const cleaned = records.map((r) => {
      const out = {};
      for (const [k, v] of Object.entries(r || {})) {
        if (BODY_META_FIELDS.has(k)) continue;
        if (PROTECTED_FIELDS.has(k)) continue; // 保护字段无条件剥离
        if (fieldWhitelist.has(k)) out[k] = typeof v === 'string' ? v : String(v);
      }
      return out;
    }).filter((r) => Object.keys(r).length > 0);
    if (!cleaned.length) return errRes('BAD_REQUEST', '无任何白名单内字段', 400, corsHeaders(origin));

    // 写主台账（飞书表已类型化：日期列字符串→毫秒）
    const outCleaned = cleaned.map(feishuTypedRecord);
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
//   - 密码明文/完整手机号/secret 绝不入响应与日志。
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
//    因此 feishu 后端只允许写出白名单内的字段，未知键一律丢弃。
// ⚠️ 重映射键也必须进白名单：否则白名单先 `continue` 掉，重映射分支永远不执行。
//    （2026-09-17 实测：巡查时间/创建时间被静默丢弃，9 条记录里 8 条「日期/提交时间」为空，
//      接口却返回 success —— 典型静默数据丢失。见 test/_t4-timeloss-proof.mjs）
const FEISHU_FIELD_WHITELIST = new Set([
  // Excel 19 列
  '序号', '昵称', '分组名称', '姓名', '所属岗位', '网格等级', '日期', '三违照片', '三违行为',
  '违章人姓名', '违章人性别', '违章人年龄', '整改后照片', '当日是否报名', '标记', '是否补交',
  '提交时间', '编号', '来源日期',
  // 主台账「H5员工日常不安全行为台账」tbl5QiCv5Qbal044 真实列（2026-09-18 lark 实测 17 列）
  // ⚠️ 这是 H5 巡查提交的**唯一**写入目标。此前白名单里只有「表格视图」的旧列名
  //    （三违行为/违章人姓名/提交时间…）和一套主台账里根本不存在的列
  //    （巡查人员ID/网格/问题描述/问题类型/是否三违/涉及人员/来源），
  //    导致每一次提交都被飞书以 1254045 FieldNameNotFound 拒绝 → 前端只看到 502
  //    「存储写入失败」（见 test/_t25-write-why.mjs、_t26-find-table.mjs）。
  // ⚠️ 「日期」是 type=1001 创建时间**只读**列，绝不能写入。
  '检查人姓名', '网格等级', '片区|班组', '违章照片', '违章人员姓名', '性别', '年龄',
  '车辆类型|保洁员', '司龄', '违章行为', '项目采取措施', '惩罚数额', '整改后照片', '备注', '描述', '来源',
  // H5 旧链路列（保留仅为兼容历史 /wps/records/create 调用，主台账无这些列，写了会 1254045）
  '巡查人员ID', '网格', '问题描述', '问题类型', '是否三违', '涉及人员', 'client_request_id',
  'employee_code', '测试编号', '三违行为描述', '照片状态', '测试状态',
  // 重映射源键（必须先过白名单，才能被下面的 if 改写成「日期」/「提交时间」）
  '巡查时间', '创建时间',
  // ── CF-WPS-62 巡查身份三件套（从「备注」拆出的独立列）────────────────────
  '巡查人ID', '幂等键',
  // ── CF-WPS-36 整改待办（跨账号指派）新增列 ──────────────────────────────
  // 指派关系必须落在**服务端**才能被被指派人读到（此前只写指派人本机 localStorage，
  // 导致「转给责任乡镇」后对方永远收不到，见 docs/三级账号权限与流程测试报告.md）。
  // 全部用文本列（type=1）：值域自由、不依赖单选选项，避免选项漂移导致写入失败。
  '整改接收人ID', '整改接收人姓名', '整改责任单位', '整改状态',
  '指派人ID', '指派人姓名', '指派人单位', '指派时间', '整改完成时间', '整改说明',
]);

/* 整改待办列（CF-WPS-36）—— 与主台账同表存放：一条巡查记录最多一条待办，
   语义一致、无需额外建表；新增列由 ensureTodoFields() 幂等创建。 */
const TODO_FIELDS = {
  assigneeId: '整改接收人ID',
  assigneeName: '整改接收人姓名',
  town: '整改责任单位',
  status: '整改状态',
  assignerId: '指派人ID',
  assignerName: '指派人姓名',
  assignerDept: '指派人单位',   // CF-WPS-57：指派人的**所属部门**（如 公司管理=安环管理部），
                                // 与 town（整改责任单位=接收方单位）语义不同，不可混用：
                                // 「来自 XXX」应显示指派人的单位，而非接收方的责任单位。
  assignedAt: '指派时间',
  doneAt: '整改完成时间',
  note: '整改说明',
  // CF-WPS-派发链路（2026-09-30）：这条记录**经手过的所有派发人**，只追加、不覆盖。
  //   背景：公司管理派给乡镇经理 → 经理再转派给管理员时，「指派人ID」被经理覆盖，
  //   公司管理的「派发记录」（按 指派人ID == 我 过滤）里这条就**直接消失**了。
  //   链路与「派发链路ID」**等长、同序**：第 i 段文本对应第 i 个 id，用于反查「我是什么时候派的」。
  chainId: '派发链路ID',
  chainText: '派发链路',
};

/* ── 派发链路工具（CF-WPS-派发链路）──────────────────────────────
   两个列都是文本列，用固定分隔符拼接，保证「顺序一致 + 可反查」：
     派发链路ID  = `13900000452,13900000450`                     （纯 id，供过滤）
     派发链路    = `张三（安环管理部） 2026-09-30 17:20 → 李四（甲片区） 2026-09-30 17:25`
   取「我的派发时间」时按 id 的下标去文本列取对应段，再抠出末尾时间戳。 */
const CHAIN_SEP = ' → ';
function chainSplitIds(v) {
  return fieldText(v).split(',').map((s) => s.trim()).filter(Boolean);
}
function chainSplitLabels(v) {
  return fieldText(v).split(CHAIN_SEP).map((s) => s.trim()).filter(Boolean);
}
function chainLabel(name, dept, time) {
  const n = String(name || '').trim();
  const d = String(dept || '').trim();
  const t = String(time || '').trim();
  return n + (d ? '（' + d + '）' : '') + (t ? ' ' + t : '');
}
/* 这条记录算不算「我派出去的」：
   ① 我是最新指派人（正常路径）；或 ② 我在派发链路里（我派过，但已被下游转派）。
   两者缺一：只判 ① 就是本次线上缺陷（公司管理的记录被经理转派后消失）。 */
function isMyDispatch(fields, me) {
  const f = fields || {};
  if (!me) return false;
  if (fieldText(f[TODO_FIELDS.assignerId]) === me) return true;
  return chainSplitIds(f[TODO_FIELDS.chainId]).includes(me);
}
/* 我在这条记录里的**派发时间**（派发方视角的排序 / 挂账 / 本月派发都要用它）：
   我是最新指派人 → 「指派时间」；我只在链路里 → 链路里属于我的那一段的时间。
   兜底返回空串，调用方再退回「指派时间」，避免老数据排序错乱。 */
function myDispatchTime(fields, me) {
  const f = fields || {};
  if (!me) return '';
  if (fieldText(f[TODO_FIELDS.assignerId]) === me) return fieldText(f[TODO_FIELDS.assignedAt]);
  const ids = chainSplitIds(f[TODO_FIELDS.chainId]);
  const i = ids.indexOf(me);
  if (i < 0) return '';
  const seg = chainSplitLabels(f[TODO_FIELDS.chainText])[i] || '';
  const m = seg.match(/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)\s*$/);
  return m ? m[1] : '';
}


/* CF-WPS-62：巡查身份三件套 —— 从「备注」里拆出来，落成主台账的**独立文本列**。
   ---------------------------------------------------------------------------
   历史包袱：主台账「日期」是 type=1001 创建时间**只读**列，写不进去，
   于是把「巡查人手机号 / 巡查时间 / 幂等键」三样结构化信息压进唯一的自由文本列
   「备注」（格式 `巡查人ID:<phone> · 巡查时间:<t> · req:<cid>`）。
   代价：判定「这条是不是我上报的」「本月上报多少条」全靠正则解析备注 ——
   脆弱、不可索引、飞书里做视图/筛选/仪表盘根本没法用。
   现按业务要求拆成独立列。迁移期**双写 + 读时回退**（详见 patrolIdentity）：
     · 新记录：独立列 + 备注都写
     · 历史记录：只有备注 → 读时自动回退解析，行为不变
     · 列不存在（建列失败）：只写备注，**绝不阻塞提交** */
const PATROL_META_FIELDS = {
  userId: '巡查人ID',      // 巡查人手机号（= employee_code）
  time: '巡查时间',        // YYYY-MM-DD HH:mm
  req: '幂等键',           // 客户端幂等键（防重复提交）
};
const TODO_STATUS = { pending: '待整改', done: '已完成' };

// 幂等建列：表内缺哪列补哪列（同名已存在时飞书返回 duplicated，视为成功）。
// 建列失败**不阻断业务**（降级：待办写入会失败但巡查提交照常），只记日志。
/* CF-WPS-62：确保主台账有巡查身份三件套的独立列（type=1 文本，自动建）。
   与 ensureTodoFields 同套路（只建一次并缓存），但**多返回一份实际存在的列名集合**：
   调用方据此决定「写不写新列」—— 建列失败时只写备注，**绝不阻塞提交**。 */
let patrolFieldsReady = null;
async function ensurePatrolMetaFields(env, fileId, sheetId) {
  if (patrolFieldsReady) return patrolFieldsReady;
  const adapter = getAdapter(env);
  try {
    const existing = new Set((await adapter.listFields(env, fileId, sheetId)).map((f) => f.fieldName));
    const missing = Object.values(PATROL_META_FIELDS).filter((n) => !existing.has(n));
    for (const n of missing) {
      try { await adapter.ensureField(env, fileId, sheetId, n, 1); existing.add(n); }
      catch (e) { console.warn('[patrol-meta] ensureField failed: ' + n + ' ' + (e && e.fsMsg)); }
    }
    patrolFieldsReady = { ok: true, has: existing };
  } catch (e) {
    console.warn('[patrol-meta] listFields failed: ' + (e && e.message));
    // 读不到列清单就当「三列都不存在」→ 调用方退回只写备注，历史行为完全不变
    patrolFieldsReady = { ok: false, has: new Set() };
  }
  return patrolFieldsReady;
}

async function ensureTodoFields(env, fileId, sheetId) {
  if (todoFieldsReady) return todoFieldsReady;
  const adapter = getAdapter(env);
  try {
    const existing = new Set((await adapter.listFields(env, fileId, sheetId)).map((f) => f.fieldName));
    const missing = Object.values(TODO_FIELDS).filter((n) => !existing.has(n));
    for (const n of missing) {
      try { await adapter.ensureField(env, fileId, sheetId, n, 1); }
      catch (e) { console.warn('[todo] ensureField failed: ' + n + ' ' + (e && e.fsMsg)); }
    }
    todoFieldsReady = { ok: true, missing: missing.length };
  } catch (e) {
    console.warn('[todo] listFields failed: ' + (e && e.message));
    todoFieldsReady = { ok: false, err: String((e && e.message) || e) };
  }
  return todoFieldsReady;
}
let todoFieldsReady = null;   // 同一 isolate 内只建一次，避免每次请求都回源飞书

/* ─────────────── 微信推送（WxPusher，CF-WPS-41）───────────────
   通道选型（2026-09-19 与业务方确认）：WxPusher 标准推送。
   - 个人微信即可接收，不需要企业微信/认证服务号，现场人员零门槛。
   - 用户在「我的」页点关注链接 → 关注应用 → 把自己的 UID 填回 App 完成绑定。
   绑定关系写在「H5移动端身份表」新增列「微信推送UID」：
   该表一行一个人、手机号即账号 → 天然对齐，**不需要额外建表也不需要 KV**。
   ⚠️ 未配置 WX_APP_TOKEN 时全部静默降级：可以没有推送，但不能因为没配推送就派不了活。 */
const WX_FIELD = '微信推送UID';
const WX_API = 'https://wxpusher.zjiecode.com/api';
let wxFieldReady = null;

/* ─────────────── 来源列（CF-WPS 派发/上报区分）───────────────
   公司管理 / 乡镇作业中心经理 建的记录了算「派发任务」，其余角色算「上报」。
   前端 toPatrolBody 会把 rec.source 透传进 body.source，Worker 落主台账「来源」列，
   台账卡片据此显示 派发/上报 标签。列缺则幂等补建（文本列 type=1），
   建列失败不阻断业务（降级：来源为空），只记日志。 */
const SOURCE_FIELD = '来源';
let sourceFieldReady = null;

async function ensureSourceField(env, fileId, sheetId) {
  if (sourceFieldReady) return sourceFieldReady;
  const adapter = getAdapter(env);
  try {
    const existing = new Set((await adapter.listFields(env, fileId, sheetId)).map((f) => f.fieldName));
    let present = existing.has(SOURCE_FIELD);
    if (!present) {
      try { await adapter.ensureField(env, fileId, sheetId, SOURCE_FIELD, 1); present = true; }
      catch (e) { console.warn('[source] ensureField failed: ' + (e && e.fsMsg)); present = false; }
    }
    sourceFieldReady = { ok: present };
  } catch (e) {
    console.warn('[source] listFields failed: ' + (e && e.message));
    sourceFieldReady = { ok: false };
  }
  return sourceFieldReady;
}

async function ensureWxField(env, fileId, sheetId) {
  if (wxFieldReady) return wxFieldReady;
  const adapter = getAdapter(env);
  try {
    const existing = new Set((await adapter.listFields(env, fileId, sheetId)).map((f) => f.fieldName));
    if (!existing.has(WX_FIELD)) {
      try { await adapter.ensureField(env, fileId, sheetId, WX_FIELD, 1); }
      catch (e) { console.warn('[wx] ensureField failed: ' + (e && e.fsMsg)); }
    }
    wxFieldReady = { ok: true };
  } catch (e) {
    console.warn('[wx] listFields failed: ' + (e && e.message));
    wxFieldReady = { ok: false };
  }
  return wxFieldReady;
}

// 发一条微信。全部 try/catch：推送失败绝不影响主流程。
async function wxSend(env, uids, summary, content, url) {
  const token = String(env.WX_APP_TOKEN || '').trim();
  if (!token) return { ok: false, reason: 'not_configured' };
  const list = (Array.isArray(uids) ? uids : [uids])
    .filter((u) => typeof u === 'string' && /^UID_[A-Za-z0-9]+$/i.test(u.trim()));
  if (!list.length) return { ok: false, reason: 'no_uid' };
  try {
    const res = await fetch(WX_API + '/send/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appToken: token,
        content: String(content || '').slice(0, 40000),
        summary: String(summary || '').slice(0, 100),
        contentType: 1,   // 1=纯文本：现场人员手机（含老旧 WebView）渲染最稳
        uids: list.slice(0, 2000),
        url: url ? String(url).slice(0, 1000) : undefined,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (j && j.code === 1000) return { ok: true };
    return { ok: false, reason: 'upstream', msg: String((j && j.msg) || res.status) };
  } catch (e) {
    return { ok: false, reason: 'network', msg: String((e && e.message) || e) };
  }
}

// 手机号 → UID（身份表一行一人；找不到/未绑定返回空串）
async function wxUidByPhone(env, cfg, phone) {
  const p = String(phone || '').replace(/\D/g, '');
  if (p.length < 6) return '';
  // CF-WPS-43：60s 缓存身份表，wxPush 段从 2s 降到 ~0.3s
  let rows;
  try { rows = await getIdentityRows(getAdapter(env), env, cfg.fileId, cfg.ledgerSheetId); }
  catch { return ''; }
  const hit = rows.find((r) => phoneDigits((r.fields || {})['手机号']) === p);
  return hit ? fieldText((hit.fields || {})[WX_FIELD]).trim() : '';
}

// 校验 UID 确实关注了本应用（防填错 / 填成别人的 UID）
async function wxUidFollows(env, uid) {
  const token = String(env.WX_APP_TOKEN || '').trim();
  const u = String(uid || '').trim();
  if (!token || !/^UID_[A-Za-z0-9]+$/i.test(u)) return false;
  try {
    const qs = new URLSearchParams({ appToken: token, uid: u, page: '1', pageSize: '100', type: '0' });
    const res = await fetch(WX_API + '/fun/wxuser/v2?' + qs.toString());
    const j = await res.json().catch(() => ({}));
    const recs = (j && j.data && j.data.records) || [];
    return recs.some((r) => String(r.uid || '').toUpperCase() === u.toUpperCase() && !r.reject);
  } catch { return false; }
}

/*
 * 指派成功后的微信通知（CF-WPS-43 抽成公共函数，供 /patrol/submit 的「建单即指派」
 * 与 /assign 的「事后指派」复用）。
 * 推送失败**绝不影响指派结果**（活已经派出去了），只回执状态给前端如实提示。
 * 未配置 WX_APP_TOKEN 时直接短路返回 not_configured —— 不能因为没配推送就把「派活」拖慢。
 */
async function notifyAssign(env, cfg, o) {
  const src = o || {};
  if (!String(env.WX_APP_TOKEN || '').trim()) return 'not_configured';
  try {
    await ensureWxField(env, cfg.fileId, cfg.ledgerSheetId);
    const uid = await wxUidByPhone(env, cfg, src.assigneeId);
    if (!uid) return 'no_uid';
    const r = await wxSend(
      env, [uid], '收到一条整改待办',
      [
        '【网格巡查】' + String(src.assignerName || '上级') + ' 指派你整改：',
        '问题：' + (src.problem || '（详见 App）'),
        '责任单位：' + (src.town || '—'),
        '指派时间：' + (src.assignedAt || ''),
        '请打开「网格巡查」→「整改任务」处理。',
      ].join('\n'),
      String(env.WX_APP_URL || 'https://grid-mobile-cloudflare.pages.dev/check')
    );
    return r.ok ? 'sent' : (r.reason || 'failed');
  } catch { return 'error'; }
}

/*
 * 隐患指派成功后的微信通知（CF-WPS-100）。与 notifyAssign 同思路、但隐患文案独立：
 * 「网格巡查」与「隐患排查」是两个业务模块，推送文案不能混。
 * ⚠️ 整改人是从**全公司花名册**选的，而 WX UID 只存在于身份表（app 账号）——
 *    花名册有、身份表没有的人拿不到 uid → 返回 'no_uid'（指派本身照常成功，
 *    待办会在App内可见，只是没有微信提醒）。推送失败绝不影响指派结果。
 */
async function notifyHazardAssign(env, cfg, o) {
  const src = o || {};
  if (!String(env.WX_APP_TOKEN || '').trim()) return 'not_configured';
  try {
    await ensureWxField(env, cfg.fileId, cfg.ledgerSheetId);
    const uid = await wxUidByPhone(env, cfg, src.assigneeId);
    if (!uid) return 'no_uid';
    const r = await wxSend(
      env, [uid], '收到一条隐患整改待办',
      [
        '【隐患排查】' + String(src.assignerName || '安环管理部') + ' 指派你整改隐患：',
        '隐患：' + (src.problem || '（详见 App）'),
        '位置：' + (src.town || '—'),
        '整改期限：' + (src.deadline || '—'),
        '请打开「隐患排查」→「我的待办」处理。',
      ].join('\n'),
      String(env.WX_APP_URL || 'https://grid-mobile-cloudflare.pages.dev/check')
    );
    return r.ok ? 'sent' : (r.reason || 'failed');
  } catch { return 'error'; }
}

// 主台账无「是否三违」布尔列、也无「问题类型」列 —— 沿用业务约定用「违章行为」有无表达：
//   是三违 → 填具体三违行为；非三违 → 填「无三违行为」。
const NO_VIOLATION_TEXT = '无三违行为';

// 主台账既没有「巡查人员ID」列，也没有可写的日期列（日期=1001 只读），
// 因此把「手机号 / 巡查时间 / 幂等键」三样结构化信息压进唯一的自由文本列「备注」
// （docs/H5环节与飞书各表关联.md §5.3 即指定 备注 承载 H5 身份标识）。
// 格式：`巡查人ID:<phone> · 巡查时间:<YYYY-MM-DD HH:mm> · req:<clientRequestId>`
function buildPatrolNote(employeeCode, inspectionTime, clientRequestId) {
  return ['巡查人ID:' + employeeCode, '巡查时间:' + inspectionTime, 'req:' + clientRequestId].join(' · ');
}
const NOTE_EMPLOYEE_RE = /巡查人ID:([^\s·]+)/;
const NOTE_TIME_RE = /巡查时间:(\d{4}-\d{2}-\d{2}(?:[ \s]\d{2}:\d{2})?)/;
const NOTE_REQ_RE = /req:([A-Za-z0-9_-]{8,64})/;
function parsePatrolNote(note) {
  const s = String(note || '');
  const mE = s.match(NOTE_EMPLOYEE_RE), mT = s.match(NOTE_TIME_RE), mR = s.match(NOTE_REQ_RE);
  return { employeeCode: mE ? mE[1] : '', inspectionTime: mT ? mT[1] : '', clientRequestId: mR ? mR[1] : '' };
}

/* CF-WPS-62：统一的「巡查身份」读取入口 —— **优先读独立列，读不到才回退解析备注**。
   迁移期必然是新旧数据混存：
     · 新记录：独立列 + 备注都写了
     · 历史记录：只有备注
   所以读取必须两边都能吃，否则要么老数据「凭空消失」，要么必须一次性回填完才能上线。
   所有原来直接 parsePatrolNote(备注) 的地方都改成走这里。 */
function patrolIdentity(fields) {
  const f = fields || {};
  const t = (k) => fieldText(f[k]).trim();
  const n = parsePatrolNote(fieldText(f['备注']));
  return {
    employeeCode: t(PATROL_META_FIELDS.userId) || n.employeeCode,
    inspectionTime: t(PATROL_META_FIELDS.time) || n.inspectionTime,
    clientRequestId: t(PATROL_META_FIELDS.req) || n.clientRequestId,
  };
}

function feishuTypedRecord(record) {
  const out = {};
  for (const [k, v] of Object.entries(record || {})) {
    if (!FEISHU_FIELD_WHITELIST.has(k)) continue; // 未知字段丢弃，防飞书自动补列
    // CF-WPS-62：「巡查时间」现在有独立文本列了 —— 除原样重映射到「日期」外，
    // 同时写独立列。**调用方只在确认该列存在时才会传这个 key**（见 ensurePatrolMetaFields），
    // 所以这里无需再判断，列不存在时根本不会走到这儿。
    if (k === '巡查时间') { const ms = patrolTimeToMs(v); if (ms !== '') out['日期'] = ms; out[PATROL_META_FIELDS.time] = v; continue; }
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
    // CF-WPS-61：自定义密码哈希（飞书身份表可选列「密码哈希」）。
    // 业务方未建该列时恒为空串 → 走「初始派生密码」分支，行为与改造前完全一致。
    pwdHash: fieldText(f[PWD_HASH_FIELD]).trim(),
  };
}

// 分级 → 应用角色（check.html 的角色路由消费这三个值；其他分级值 fail-closed 拒登）
const LEDGER_ROLE_MAP = {
  '公司管理': '公司管理',
  '乡镇作业中心经理': '经理',
  '管理员': '管理员',
};

// CF-WPS-58 —— 业务口径：**身份表「分级/角色」压过花名册「职位」**。
//   账号在身份表的分级若是「公司管理」，即便花名册把它写成「XX作业中心经理」，
//   它**也不是乡镇作业中心经理**，不得作为整改接收人 —— 他就是公司管理。
//   （实测黄元同被 5 个单位、刘菲被 1 个单位顶成「经理」，语义退化成「派给同级」。）
function isCompanyGrade(row) {
  return String((row && row.grade) || '').trim() === '公司管理';
}

// 校验「拟接收人」是不是公司管理角色 —— 用于 /assign 与 patrol/submit 的 assign_to
// 两条写入路径的**服务端硬校验**（前端列表过滤只是体验优化，防不住直接打接口）。
// 命中手机号为先（session.sub 即手机号），姓名兜底。
// fail-open：身份表读不到时不阻断既有派单流程，仅跳过该项校验（避免误伤）。
async function assigneeIsCompanyRole(adapter, env, cfg, assigneeId, assigneeName) {
  try {
    const rows = (await getIdentityRows(adapter, env, cfg.fileId, cfg.ledgerSheetId))
      .map(mapLedgerRecord).filter((r) => r.name);
    const id = String(assigneeId || '').trim();
    const nm = String(assigneeName || '').trim();
    const hit = (id && rows.find((r) => r.phone && r.phone === id))
      || (nm && rows.find((r) => r.name === nm));
    return !!(hit && isCompanyGrade(hit));
  } catch {
    return false;
  }
}

// 常量时间字符串比较（复用全局 sha256Hex：哈希后逐字节比较，避免长度/前缀时序泄漏）
async function constantTimeEqual(a, b) {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

/* ================= CF-WPS-61 密码保护：首次登录强制改密 =================
   背景：初始密码是**可推导的** —— 姓名拼音首字母 + 手机号后 4 位（见 pinyinInitials）。
   知道姓名和手机号就能算出来，等同于没有密码。
   业务要求：第一次登录后**第一时间**改成自己的密码，改完才能用业务功能。

   存储：自定义密码哈希写在**飞书身份表新增列「密码哈希」**（与「微信推送UID」
        同一张表、同一条 updateRecord 写入链路，该列已验证可写）。
        格式：`pbkdf2$<iter>$<saltHex>$<hashHex>`（PBKDF2-HMAC-SHA256，每账号随机 salt）。

   ⚠️ 向后兼容 / 优雅降级（重要）：
        · 表里**没有**这一列（业务方还没建）→ 该行读到空串 → 一律按「仍在用初始密码」
          处理，登录照常成功、只是提示改密；此时改密接口写不进飞书，
          返回 503 并给出明确文案，**不会把任何账号锁死**。
        · 已建列且该行有值 → 按存储哈希校验。
        · 管理员重置密码 = 把该行「密码哈希」清空 → 自动回落到初始派生密码。

   CPU 预算：Workers 免费计划 10ms。实测 PBKDF2 20000 次 ≈ 3ms（原生实现）；
        付费计划可用 wrangler 变量 PWD_PBKDF2_ITER 调高（10 万次 ≈ 7ms）。 */
const PWD_HASH_FIELD = '密码哈希';         // 飞书身份表列名（文本列，需业务方建）
const PWD_CHANGED_FIELD = '密码修改时间';   // 可选列；写失败不影响主流程
const PWD_DEFAULT_ITER = 20000;
const PWD_MIN_LEN = 6;
const PWD_MAX_LEN = 32;
// 仍在用初始密码时，这些**写操作**一律拒绝 —— 前端强制改密的服务端兜底，
// 防止绕过界面直接调接口。读接口放行（否则用户连改密页都进不去）。
const PWD_GUARDED_ROUTES = new Set([
  '/api/mobile/patrol/submit', '/api/mobile/patrol/attach',
  '/api/mobile/assign', '/api/mobile/assign/complete',
  '/api/mobile/wx/bind', '/wps/records/create',
  '/api/mobile/hazard/submit',
  // CF-WPS-100 隐患闭环写接口（读接口 todos 不用守：没指派人时就是空列表）
  '/api/mobile/hazard/assign', '/api/mobile/hazard/rectify', '/api/mobile/hazard/review',
]);

function pwdIter(env) {
  const n = Number(env && env.PWD_PBKDF2_ITER);
  return Number.isFinite(n) && n >= 1000 && n <= 200000 ? Math.floor(n) : PWD_DEFAULT_ITER;
}
function toHex(u8) {
  let s = '';
  for (const b of u8) s += b.toString(16).padStart(2, '0');
  return s;
}
function fromHex(hex) {
  const h = String(hex || '');
  const out = new Uint8Array(Math.floor(h.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16) || 0;
  return out;
}
// 初始（默认）密码：姓名拼音首字母(小写) + 手机号后 4 位 —— 与登录校验口径严格一致
function defaultPassword(name, phone) {
  const initials = pinyinInitials(name);
  return initials ? initials + String(phone || '').slice(-4) : '';
}
async function hashPassword(pwd, iter) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pwd), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return 'pbkdf2$' + iter + '$' + toHex(salt) + '$' + toHex(new Uint8Array(bits));
}
// 校验存储哈希；格式损坏一律 false（fail-closed）
async function verifyStoredPassword(stored, pwd) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iter = Number(parts[1]);
    if (!Number.isFinite(iter) || iter < 1000 || iter > 200000) return false;
    const salt = fromHex(parts[2]);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pwd), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
    return await constantTimeEqual(toHex(new Uint8Array(bits)), parts[3]);
  } catch { return false; }
}
// 新密码强度：返回空串 = 通过；否则返回给用户看的中文原因
function weakPasswordReason(pwd, identity) {
  const p = String(pwd || '');
  if (p.length < PWD_MIN_LEN) return '密码至少 ' + PWD_MIN_LEN + ' 位';
  if (p.length > PWD_MAX_LEN) return '密码最多 ' + PWD_MAX_LEN + ' 位';
  if (/[^\x20-\x7e]/.test(p)) return '密码不能包含中文或全角字符';
  const lower = p.toLowerCase();
  if (identity) {
    if (lower === defaultPassword(identity.name, identity.phone)) return '新密码不能与初始密码相同';
    if (p === String(identity.phone || '').slice(-4)) return '新密码不能是手机号后 4 位';
    if (p === String(identity.phone || '')) return '新密码不能是手机号';
  }
  return '';
}
// 统一口令校验：优先按存储哈希，没存过就按初始派生密码
// 返回 { ok, usingDefault }
async function checkPassword(identity, password) {
  if (identity.pwdHash) {
    return { ok: await verifyStoredPassword(identity.pwdHash, password), usingDefault: false };
  }
  const expected = defaultPassword(identity.name, identity.phone);
  if (!expected) return { ok: false, usingDefault: true };
  return { ok: await constantTimeEqual(String(password).toLowerCase(), expected), usingDefault: true };
}

// ---- POST /api/mobile/auth/login ----
async function handleMobileLogin(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

  try {
    // 存储后端装配（飞书）
    const adapter = getAdapter(env);
    const cfg = await storageConfig(env);

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
    // 数字归一化（phoneDigits）只用于身份数据读取侧的比对，不用于放宽登录输入。
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

    /* 3) 密码校验（CF-WPS-61）：
          有自定义哈希 → 校验哈希；没有 → 校验初始密码「姓名拼音首字母 + 手机尾号4位」。
          姓名含无法解析的字符、且又没设过自定义密码 → 该账号 fail-closed 不可登录。 */
    const { ok: pwdOk, usingDefault } = await checkPassword(identity, password);
    if (!pwdOk) {
      loginRecordFail(ip);
      return errRes('AUTH_FAILED', AUTH_FAILED_MSG, 401, corsHeaders(origin));
    }
    // 仍在用初始密码 → 登录后必须第一时间改密（前端据此直接进改密页）
    const mustChange = usingDefault;

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
      // CF-WPS-61：pwd = 0 表示仍在用初始密码（关键写操作会被服务端拒），1 = 已改密
      pwd: mustChange ? 0 : 1,
      iat: nowSec, exp: nowSec + ttl,
      jti: crypto.randomUUID(),
    }, env.WORKER_SESSION_SECRET);

    return jsonRes({
      success: true, code: 'OK',
      tokenType: 'Bearer', token, expiresIn: ttl,
      must_change_password: mustChange,
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
    // CF-WPS-61：前端 boot 据此决定是否强制进改密页（刷新/重开也不会绕过）
    // ⚠️ 必须用 `!== 1` 而不是 `=== 0`：
    //    部署前签发的**老会话没有 pwd claim**（undefined），用 `=== 0` 会判成 false
    //    → 那些在改造前就登录、会话还没过期的账号**永远不会被强制改密**，
    //      要等 2 小时会话自然过期重登才生效。
    //    改成「不是明确的已改密(1) 就算未改密」后，部署即对所有人生效。
    must_change_password: payload.pwd !== 1,
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

/* ---- CF-WPS-61：确保身份表有「密码哈希」列（type=1 文本，自动建，业务方无需手动加）----
   与 ensureWxField 同一套路：只建一次并缓存结果；建列失败（无编辑权限）不抛错，
   由改密接口在写入失败时给明确文案。 */
let pwdFieldReady = null;
async function ensurePwdField(env, fileId, sheetId) {
  if (pwdFieldReady) return pwdFieldReady;
  const adapter = getAdapter(env);
  try {
    const existing = new Set((await adapter.listFields(env, fileId, sheetId)).map((f) => f.fieldName));
    if (!existing.has(PWD_HASH_FIELD)) {
      try { await adapter.ensureField(env, fileId, sheetId, PWD_HASH_FIELD, 1); }
      catch (e) { console.warn('[pwd] ensureField failed: ' + (e && e.fsMsg)); }
    }
    pwdFieldReady = { ok: true };
  } catch (e) {
    console.warn('[pwd] listFields failed: ' + (e && e.message));
    pwdFieldReady = { ok: false };
  }
  return pwdFieldReady;
}

// ---- POST /api/mobile/auth/password（CF-WPS-61：改密码）----
// 首次登录强制改密的落点。改完**重新签发会话**（pwd=1），前端换成新 token 即可立刻解锁。
async function handlePasswordChange(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'POST') return errRes('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, corsHeaders(origin));
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

  let body;
  try { body = await request.json(); } catch { return errRes('BAD_JSON', '请求体解析失败', 400, corsHeaders(origin)); }
  const oldPwd = String((body && body.old_password) || '');
  const newPwd = String((body && body.new_password) || '');
  const confirmPwd = String((body && body.confirm_password) || '');
  if (!oldPwd || !newPwd) return errRes('BAD_REQUEST', '请填写原密码和新密码', 400, corsHeaders(origin));
  if (newPwd !== confirmPwd) return errRes('PASSWORD_MISMATCH', '两次输入的新密码不一致', 400, corsHeaders(origin));
  if (new TextEncoder().encode(newPwd).length > PWD_MAX_LEN) {
    return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin));
  }

  const adapter = getAdapter(env);
  const cfg = await storageConfig(env);
  let recs;
  try { recs = await adapter.scanRecords(env, cfg.fileId, cfg.ledgerSheetId); }
  catch { return errRes('UPSTREAM_ERROR', '身份信息暂不可用，请稍后再试', 502, corsHeaders(origin)); }
  const me = String(payload.sub || '').replace(/\D/g, '');
  const hits = recs.map(mapLedgerRecord).filter((r) => r.name && r.phone === me);
  if (hits.length !== 1) return errRes('NOT_FOUND', '身份表中未找到你的账号', 404, corsHeaders(origin));
  const identity = hits[0];

  // ① 原密码必须对 —— 防止「拿到会话就能改密码」（会话可能被借手机拿到）
  const { ok: oldOk } = await checkPassword(identity, oldPwd);
  if (!oldOk) return errRes('OLD_PASSWORD_WRONG', '原密码不正确', 400, corsHeaders(origin));

  // ② 新密码强度（不能太短 / 不能与初始密码相同 / 不能是手机号尾号）
  const why = weakPasswordReason(newPwd, identity);
  if (why) return errRes('WEAK_PASSWORD', why, 400, corsHeaders(origin));

  // ③ 建列（幂等，只建一次）
  await ensurePwdField(env, cfg.fileId, cfg.ledgerSheetId);

  // ④ 写入 PBKDF2 哈希
  const hash = await hashPassword(newPwd, pwdIter(env));
  try {
    await adapter.updateRecord(env, cfg.fileId, cfg.ledgerSheetId, identity.recordId, { [PWD_HASH_FIELD]: hash });
    invalidateIdentity(cfg.fileId, cfg.ledgerSheetId);   // 否则 60s 内登录仍读到旧哈希
  } catch {
    return errRes('UPSTREAM_ERROR', '密码保存失败，请稍后重试（身份表可能未开通编辑权限）', 502, corsHeaders(origin));
  }

  // ⑤ 重新签发会话：pwd=1，解锁被拦截的写操作
  const ttl = Math.min(Math.max(Number(env.MOBILE_SESSION_TTL_SECONDS || 7200), 300), 86400 * 7);
  const nowSec = Math.floor(Date.now() / 1000);
  const token = await signJwtHs256({
    iss: SESSION_ISS, aud: SESSION_AUD,
    sub: identity.phone,
    name: identity.name,
    department: identity.department,
    position: identity.position,
    grid_level: identity.gridLevel,
    role: payload.role,
    superior: identity.superior,
    pwd: 1,
    iat: nowSec, exp: nowSec + ttl,
    jti: crypto.randomUUID(),
  }, env.WORKER_SESSION_SECRET);

  return jsonRes({
    success: true, code: 'OK',
    tokenType: 'Bearer', token, expiresIn: ttl,
    must_change_password: false,
    message: '密码已修改，请牢记新密码',
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

// 台账子节点（直接下级）。
// ⚠️ 同名保护：台账以「姓名」连接上下级（无稳定 ID 列）。若某姓名在台账中不唯一，
//   它作为「直接上级」的值会把这批人**全部**挂过来，产生错挂组织。
//   故仅当上级姓名在台账中唯一时才认这条边；上级查无此人（如「公司」等非人名占位）不设限。
function ledgerChildren(rows, name, nameCount) {
  const out = [];
  for (const r of rows) {
    if (!r.superior || r.superior !== name) continue;
    if (nameCount && nameCount.get(name) > 1) continue; // 上级重名 → fail-closed
    out.push(r);
  }
  return out;
}

// 本人子树（不含自己）。本人姓名在台账中不唯一 → null（fail-closed，避免错挂组织）
// ⚠️ 去重键必须用「记录唯一标识」而非姓名：台账允许同名多记录（实测王五下有两名「周八」，
//   属两个真实的人）。曾用 seen.has(child.name) 去重，会把第二个人静默吃掉
//   （cfwps19 A7 长期红灯）。父边歧义已由 ledgerChildren 的 nameCount 把关，此处无需再按名去重。
function ledgerSubtree(rows, meName) {
  const nameCount = ledgerNameCount(rows);
  const mine = rows.filter((r) => r.name === meName);
  if (mine.length !== 1) return null;
  const keyOf = (r) => String(r.recordId || (r.name + '\u0000' + r.department + '\u0000' + r.position));
  const seen = new Set([keyOf(mine[0])]);
  const out = [];
  let frontier = [meName];
  for (let d = 0; d < ORG_MAX_DEPTH && frontier.length; d++) {
    const next = [];
    for (const nm of frontier) {
      for (const child of ledgerChildren(rows, nm, nameCount)) {
        const ck = keyOf(child);
        if (seen.has(ck)) continue; // 环 / 同一记录重复计入保护
        seen.add(ck);
        out.push({ ...child, depth: d + 1 });
        next.push(child.name);
      }
    }
    frontier = next;
  }
  return out;
}

// 姓名出现次数（重名保护用：被重名的姓名不得作为组织连接键）
function ledgerNameCount(rows) {
  const m = new Map();
  for (const r of rows) m.set(r.name, (m.get(r.name) || 0) + 1);
  return m;
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

// 按「分级」分层并稳定排序（前端：经理先看 admins；只有 managers 时先下钻一层）
function splitOrg(descs) {
  const admins = [], managers = [], others = [];
  for (const d of descs) {
    const it = orgItem(d, d.depth);
    if (d.grade === '管理员') admins.push(it);
    else if (d.grade === '乡镇作业中心经理') managers.push(it);
    else others.push(it);
  }
  const byDepthThenName = (a, b) => (a.depth - b.depth) || a.name.localeCompare(b.name, 'zh');
  admins.sort(byDepthThenName);
  managers.sort(byDepthThenName);
  others.sort(byDepthThenName);
  return { admins, managers, others };
}

// ============================================================================
// 作业中心清单 + 单位内接收人（公司管理转派 / 自己处理选人，两条链路共用）
// ----------------------------------------------------------------------------
// 【已用飞书真实台账核准，2026-09-17；口径修订 2026-09-18】
// 台账 tbl58t9kjyDlacSw 共 68 人，字段：
//   序号 / 姓名 / 直接上级 / 所属部门 / 职位 / 网格长等级 / 手机号 / 分级
//
// 「所属部门」真实写法：
//   · 乡镇经理  → 「宁城街道片区」「柴胡店镇片区」「刘营伍乡片区」…（XX + 片区）
//   · 乡镇管理员 → 「宁城街道一班」「杜集镇三四班」「杜集镇六七班」…（XX + N班/N九班）
//   · 公司本部  → 「项目管理层」「安环管理部」「生产管理部」（职能部门，非作业中心，排除）
//   · 作业中心  → 「环卫作业中心」「市政园林作业中心」（2026-09-18 起纳入）
//   · 公园      → 「康宁湖公园」「新河公园」「中心公园」（2026-09-18 起纳入）
//
// 实测推导出 **17 个作业中心**（与 2026-09-18 业务口径一致）：
//   12 个乡镇：保店镇/柴胡店镇/大曹镇/大柳镇/杜集镇/津城街道/刘营伍乡/宁城街道/
//              时集镇/相衙镇/张大庄镇/长官镇
//   3 个公园：康宁湖公园/新河公园/中心公园
//   2 个作业中心：环卫作业中心/市政园林作业中心
//   · 乡镇作业中心经理 11 人 + 管理员 51 人（其中 6 名管理员在公园）
//   · ⚠️ 「津城街道」只有 3 个管理员、**未配经理** → 不能只按「经理部门」推导单位，
//      必须按「所属部门归口」，否则会漏掉一个乡镇。
//   · ⚠️ 公园与环卫/市政园林作业中心**没有**「乡镇作业中心经理」分级的人
//      → 负责人必须走 fillUnitHead 三级兜底，否则这些单位恒显示「未配经理 / 待维护」。
// ============================================================================

// 乡镇名 = 所属部门剥掉「片区」/「N班」后缀。
// 「N班」含中文数字与组合写法（一班/三四班/六七班/十班），用字符类一次覆盖。
const TOWN_DEPT_SUFFIX_RE = /(片区|[\d一二三四五六七八九十百]+班)$/u;
function townLabel(row) {
  const dept = fieldText(row && row.department).trim();
  const town = dept.replace(TOWN_DEPT_SUFFIX_RE, '').trim();
  return { town, department: dept };
}

// 乡镇锚点：剥完后缀后以行政区划字结尾（镇/乡/街道）。
// 仅用于**需要区分「行政区划 vs 其他作业中心」**的地方（如人员分级的兜底口径）。
const TOWN_ANCHOR_RE = /(镇|乡|街道)$/u;
function isTownName(town) {
  return TOWN_ANCHOR_RE.test(String(town || ''));
}

// 作业中心锚点：行政区划（镇/乡/街道）+ 公园 + 作业中心。
// ---------------------------------------------------------------------------
// 【2026-09-18 业务口径变更】用户要求：公司管理必须能检查**全公司所有作业中心**，
//   不止 12 个乡镇——公园与环卫/市政园林作业中心同样是作业中心，必须一并下发。
//   原实现只认 (镇|乡|街道)，导致 3 个公园 + 2 个作业中心被静默排除
//   （旧注释甚至写着「公园…须排除」，那是上一版口径，现已作废）。
//
// 归属判定（剥掉「片区」「N班」后缀后再匹配）：
//   · 「宁城街道一班」→「宁城街道」  ✓ 乡镇
//   · 「康宁湖公园」  →「康宁湖公园」 ✓ 公园
//   · 「环卫作业中心」→「环卫作业中心」✓ 作业中心
//   · 「安环管理部」  → 不匹配 ✗（公司本部职能部门，不是作业中心，正确排除）
//   · 「项目管理层」  → 不匹配 ✗
const UNIT_ANCHOR_RE = /(镇|乡|街道|公园|作业中心)$/u;
function isUnitName(unit) {
  return UNIT_ANCHOR_RE.test(String(unit || ''));
}

// ---- CF-WPS-60：公司管理「派发」时的排除名单 ----
// 业务口径（2026-09-19 用户确认）：环卫作业中心、市政园林作业中心是
// **乡镇作业中心的上级**、由公司管理直管，它们不是被派发对象 ——
// 给它们派单等于「公司管理派给公司管理」（这两个中心的经理本人就是公司管理角色，
// 服务端已由 assigneeIsCompanyRole 拦截 403，见 CF-WPS-58）。
// 光靠服务端 403 不够：那要等用户点下去才报错，正确做法是**根本不出现在列表里**。
//
// ⚠️ 只作用于「派发目标列表」（/org/subordinates 的 towns），
//    **不影响** /org/towns（那是选人级联，公司管理要能选到全公司的人）
//    也不影响 /org/teams 的合法性校验（否则查这两个中心的班组会变 404）。
//
// 3 个公园**不在**排除之列（公司管理直接派发给公园管理员），
// 因此按名字精确排除、不用 /作业中心$/ 通配 —— 避免以后新增作业中心被静默吞掉。
const NON_DISPATCH_UNITS = new Set(['环卫作业中心', '市政园林作业中心']);

// 全部作业中心清单（按名称去重 + 中文排序）。
// 口径：镇/乡/街道 + 公园 + 作业中心（见 UNIT_ANCHOR_RE）。
// 只读推导，零额外配置表；数据源 = 网格长信息台账。
// 负责人在本单位有登记时带上姓名/电话（津城街道无经理 → manager 为空，前端显示「未配经理」）。
function ledgerTowns(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const { town, department } = townLabel(r);
    if (!town || !isUnitName(town) || seen.has(town)) continue;
    seen.add(town);
    out.push({ town, department, managerName: '', managerPhone: '' });
  }
  for (const t of out) fillUnitHead(rows, t);
  out.sort((a, b) => a.town.localeCompare(b.town, 'zh'));
  return out;
}

// 回填某作业中心的负责人。三级兜底，覆盖三类命名/分级写法：
//   ① 本单位内 分级=乡镇作业中心经理 的人 —— 12 个乡镇走这条（杨清华/王臣祥…）
//   ② 本单位内 分级=公司管理 且职位含「经理」 —— 环卫/市政园林作业中心走这条
//      （刘菲/韩晓亮/黄元同：分级是「公司管理」，职位「经理」，本中心没有乡镇经理分级的人）
//   ③ 本单位成员的「直接上级」中分级为负责人者 —— 3 个公园走这条
//      （公园管理员本人所属部门=XX公园，但他们没有经理分级；其直接上级是黄元同，
//        即市政园林作业中心经理。没有这条，公园会永远显示「未配经理」）
function fillUnitHead(rows, unit) {
  const inUnit = rows.filter((r) => townLabel(r).town === unit.town);

  // ① 乡镇作业中心经理
  for (const r of inUnit) {
    if (r.grade === '乡镇作业中心经理') {
      unit.managerName = r.name;
      unit.managerPhone = r.phone || '';
      return;
    }
  }
  // ② 【CF-WPS-58 移除】原「公司管理 + 职位带经理」兜底。
  //    业务口径：身份表角色压过花名册职位。公司管理账号即便花名册写着
  //    「XX作业中心经理」，也**不是**乡镇作业中心经理 —— 顶着「经理」头衔进组织树，
  //    会让前端「指派给乡镇作业中心经理」列出公司管理账号，语义退化成「派给同级」
  //    （实测：黄元同被 5 个单位、刘菲被 1 个单位顶成经理）。
  //    移除后这些单位如实暴露「未配乡镇经理」的数据缺口，与服务端硬校验一致。
  // ③ 成员的直接上级 —— **仅对非行政区划单位（公园）生效，且只认乡镇作业中心经理**。
  //    ⚠️ 乡镇绝不能走这条：津城街道确实「未配经理」，其 3 名管理员的直接上级
  //    直接挂到了市政园林作业中心经理黄元同名下。若对乡镇也兜底，会把公司级经理
  //    误报成乡镇负责人，掩盖真实的「未配经理」状态（2026-09-18 实测踩到）。
  //    公园原本靠这条取管理员的上级作负责人，但那个上级（黄元同）是**公司管理**，
  //    按 CF-WPS-58 口径同样不能算乡镇经理 → 只保留 grade='乡镇作业中心经理' 的命中。
  if (isTownName(unit.town)) return;
  const superiors = new Set();
  for (const r of inUnit) if (r.superior) superiors.add(r.superior);
  for (const nm of superiors) {
    const p = rows.find((r) => r.name === nm);
    if (!p) continue;
    if (p.grade === '乡镇作业中心经理') {
      unit.managerName = p.name;
      unit.managerPhone = p.phone || '';
      return;
    }
  }
}

// 某乡镇的接收人 = 该镇的「乡镇作业中心经理」+「管理员」。
// 判定口径：**按人自身的「所属部门」归镇**（不按上下级下钻）——
//   ① 经理与管理员都是本镇成员，按部门归镇最稳；
//   ② 「津城街道」无经理但有管理员，按上下级下钻会整镇漏掉。
// 「直接上级」仅作补充：收本镇成员的直接下级（覆盖部门列填得不规范、但上下级挂对的情况）。
// ⚠️ 越权防护（双重）：
//   ① allowed = 本人子树白名单（公司管理 = 全公司），不在白名单的人一律不下发；
//   ② nameCount 重名保护：重名姓名不得作为组织连接键。
function ledgerTownPeople(rows, town, nameCount, allowed) {
  const people = [];
  const push = (r, depth) => {
    if (!r || !r.name) return;
    if (allowed && !allowed.has(r.name)) return; // ① 越权闸门
    const it = orgItem(r, depth);
    it.town = town;
    people.push(it);
  };

  // (a) 本单位成员：按自身所属部门归口（只认能归到本单位的部门）
  const members = rows.filter((r) => {
    const t = townLabel(r);
    return t.town === town && isUnitName(t.town);
  });
  for (const r of members) push(r, 1);
  // (b) 补充：本单位成员的直接下级（部门列可能为空/不规范，但上下级挂对）
  //    ⚠️ 2026-09-18 修正：下级若**自己就归属于另一个作业中心**，不得计入本单位。
  //    典型事故：市政园林作业中心经理黄元同是全公司 20 人的直接上级（含 12 名乡镇经理、
  //    津城街道 3 名管理员——该镇未配经理，人直接挂在他名下）。若不排除，市政园林作业中心
  //    会被算成 21 人，等于把大半个公司的人塞进一个单位里。
  for (const a of members) {
    for (const child of ledgerChildren(rows, a.name, nameCount)) {
      const ct = townLabel(child).town;
      if (isUnitName(ct) && ct !== town) continue; // 该下级另有归属单位，跳过
      push(child, 2);
    }
  }

  // 去重（同一人可能同时被 (a) 与 (b) 命中）
  const seen = new Set();
  const uniq = [];
  for (const p of people) {
    const k = p.name + '|' + (p.department || '') + '|' + (p.position || '');
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(p);
  }
  let { admins, managers, others } = splitOrg(uniq);

  // ⚠️ 非行政区划单位（公园 / 环卫·市政园林作业中心）的兜底：
  //    这些单位里根本没有「乡镇作业中心经理」这个分级的人——
  //    环卫作业中心只有刘菲/韩晓亮（分级=公司管理），市政园林作业中心只有黄元同（分级=公司管理）。
  //    按老口径他们会落进 others，而 others 又被清空 → 这些单位 peopleCount=0 → 前端显示「待维护」。
  //    公司管理分级本身就是负责人/经理，理应作为接收人下发。
  if (!isTownName(town)) {
    const promoted = others.filter((o) => o.grade === '公司管理');
    others = others.filter((o) => o.grade !== '公司管理');
    managers = managers.concat(promoted).sort((a, b) => (a.depth - b.depth) || a.name.localeCompare(b.name, 'zh'));
  }

  // 转派接收人只认「乡镇作业中心经理」与「管理员」两类（+ 上述非乡镇单位的公司管理负责人）；
  // others（其他分级）不具整改权限，不进接收人清单，避免推错人。
  return { admins, managers, others: [] };
}

// ============================================================================
// 乡镇 → 班组 → 人员 三级级联（惰性加载）
// ----------------------------------------------------------------------------
// 动机：选人页原先一上来就拉全公司花名册（1291 人），既慢又浪费；
//   改为「点到哪个乡镇、哪个班组，才加载哪个班组的姓名」。
//
// 【真实数据实测 2026-09-17】台账 68 人 / 花名册 1291 人，两级命名规律：
//   · 片区  「大曹镇片区」   → 承载「乡镇作业中心经理」（花名册里也有这个班组）
//   · 班组  「大曹镇一班」   → 承载「管理员」+ 作业人员
//   · 公司本部「人力综合部/生产管理部/安环管理部/项目管理层/财务部」、
//     「车队」→ **不是作业中心**，由 isUnitName（镇|乡|街道|公园|作业中心 收尾）排除。
//     ⚠️ 2026-09-18 口径修订：「环卫作业中心」「市政园林作业中心」「XX公园」**属于**作业中心，
//        不再排除（旧版把它们一并排除了，业务侧要求公司管理能检查全公司所有作业中心）。
//
// ⚠️ 三个必须处理的现实差异（否则会漏人）：
//   ① 班组名里的数字**不是简单 1/2/3**：实测存在「杜集镇三四班」「杜集镇六七班」
//      「杜集镇九班」「杜集镇十班」→ 排序不能按字符串，也不能假设只有个位数。
//   ② **花名册有班组、台账没管理员**：大曹镇一班(15人)、大柳镇四班(28人)、
//      宁城街道二班/三班 等 → 这些班必须照样可点，否则整班人无法选择。
//   ③ **台账有管理员、花名册没有该班组**：个别一人班组 → 也要照样可点。
//   故班组清单 = 花名册班组 ∪ 台账管理员所在班组（并集，不以一边为准）。
// ============================================================================

// 中文数字 → 数值（支持「十」「十二」「三四」这类组合写法）
const CN_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function cnNum(s) {
  const t = String(s || '');
  if (/^\d+$/.test(t)) return Number(t);
  if (t === '十') return 10;
  // 「十二」= 12，「二十」= 20，「二十三」= 23
  const m = t.match(/^(.)?十(.)?$/);
  if (m) return (m[1] ? (CN_DIGIT[m[1]] || 0) : 1) * 10 + (m[2] ? (CN_DIGIT[m[2]] || 0) : 0);
  return CN_DIGIT[t] || 0;
}

// 班组排序键：按班号升序，片区排最前（-1）。
// ⚠️ 组合写法（「三四班」「六七班」）表示**多个班**，必须按其**首位**数字排序：
//     六七班(6~7) 应排在 八班(8) 之前，而不是按两位数值 67 排到最后。
//   实测杜集镇同时存在 一班/二班/五班/八班/九班/十班/三四班/六七班 ——
//   若按两位数排序会出现「八班 → 九班 → 十班 → 三四班 → 六七班」这种反直觉顺序。
function teamSortKey(dept, town) {
  const tail = String(dept || '').replace(String(town || ''), '').trim();
  if (/片区/.test(tail)) return [-1, 0, dept];
  const m = tail.match(/^([\d一二三四五六七八九十百]+)班$/u);
  if (!m) return [999, 0, dept];                 // 不符合「N班」的兜底排最后
  const raw = m[1];
  if (/^\d+$/.test(raw)) return [Number(raw), raw.length, dept];
  // 取首位中文数字作为主序；「十班」特殊（首位=十 → 10）
  const first = CN_DIGIT[raw[0]] || 0;
  return [first, raw.length, dept];
}
function sortTeams(list, town) {
  return list.slice().sort((a, b) => {
    const ka = teamSortKey(a.dept, town), kb = teamSortKey(b.dept, town);
    return (ka[0] - kb[0]) || (ka[1] - kb[1]) || String(ka[2]).localeCompare(String(kb[2]), 'zh');
  });
}

// 某作业中心的班组清单（含片区）= 花名册班组 ∪ 台账管理员班组。
// managerName 仅在片区行回填；其余班组带 maxAdmin / adminCount 供前端展示。
function townTeams(ledgerRows, rosterRows, town) {
  // 复用三级兜底（乡镇经理 → 公司管理职位带经理 → 成员的直接上级），
  // 否则公园 / 环卫·市政园林作业中心永远取不到负责人。
  const headStub = { town, department: '', managerName: '', managerPhone: '' };
  fillUnitHead(ledgerRows, headStub);
  const mgr = headStub.managerName
    ? ledgerRows.find((r) => r.name === headStub.managerName) || null
    : null;

  const depts = new Set();
  const adminsByDept = {};
  for (const r of ledgerRows) {
    const { town: t, department } = townLabel(r);
    if (t !== town || !department) continue;
    // 公园 / 作业中心没有「片区」也没有「N班」，其部门名本身就是单位名 —— 直接成一个组
    if (r.grade === '管理员') {
      depts.add(department);
      (adminsByDept[department] = adminsByDept[department] || []).push(r);
    }
  }
  // 花名册班组（仅在职，且能归到本镇）
  const rosterCount = {};
  for (const r of rosterRows || []) {
    if (ROSTER_INACTIVE_RE.test(r.status)) continue;
    const d = String(r.dept || '').trim();
    if (!d) continue;
    const t = d.replace(TOWN_DEPT_SUFFIX_RE, '').trim();
    if (t !== town || !UNIT_ANCHOR_RE.test(t)) continue;
    depts.add(d);
    rosterCount[d] = (rosterCount[d] || 0) + 1;
  }

  const list = [...depts].map((dept) => {
    const adm = adminsByDept[dept] || [];
    const isArea = /片区$/.test(dept);
    return {
      dept,
      town,
      isManagerTeam: isArea,
      managerName: isArea && mgr ? mgr.name : '',
      managerPhone: isArea && mgr ? mgr.phone || '' : '',
      admins: adm.map((a) => ({ name: a.name, phone: a.phone || '', position: a.position || a.grade || '管理员' })),
      adminCount: adm.length,
      rosterCount: rosterCount[dept] || 0,
      peopleCount: rosterCount[dept] || 0,
    };
  });
  return { mgr, teams: sortTeams(list, town) };
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
  const cfg = await storageConfig(env);
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

  const nameCount = ledgerNameCount(rows);
  const selfRow = rows.find((r) => r.name === under) || {};
  const direct = ledgerChildren(rows, under, nameCount);
  const { admins, managers, others } = splitOrg(direct);
  const hasDeeper = direct.some((d) => ledgerChildren(rows, d.name, nameCount).length > 0);

  // 公司管理「转给责任乡镇」：只读下发全部责任乡镇 + 每镇接收人。
  // 仅公司管理需要（其他人转派无意义），且仅在查询本人时下发，避免任意用户枚举全公司乡镇人员。
  const role = String(payload.role || '');
  let towns = [];
  if (role === '公司管理' && under === meName && subtree) {
    // ⚠️ 公司管理是**公司级**角色：转派目标必须覆盖全部责任乡镇，
    //    不能按「登录人的直属下级子树」收敛。
    //    原实现 allowed = subtree(me)，导致像「安环管理部经理」这类在台账里
    //    没有直属下级的公司管理账号，拿到 12 个乡镇全部 peopleCount=0
    //    （2026-09-18 线上复现：刘金涛 133****0822）。
    //    越权防护已由「仅 role==='公司管理' 且 under===meName 才下发 towns」承担，
    //    此处显式传 null 表示不做个人范围收敛。
    const allowed = null;
    // CF-WPS-60：公司管理的派发目标 = 12 个乡镇 + 3 个公园，**不含**环卫/市政园林作业中心
    const dispatchUnits = ledgerTowns(rows).filter((t) => !NON_DISPATCH_UNITS.has(t.town));
    towns = dispatchUnits.map((t) => {
      const { admins: ta, managers: tm, others: to } = ledgerTownPeople(rows, t.town, nameCount, allowed);
      return {
        town: t.town,
        department: t.department,
        manager: { name: t.managerName, phone: t.managerPhone },
        admins: ta,
        managers: tm,
        others: to,
        peopleCount: ta.length + tm.length + to.length,
      };
    });
  }

  return jsonRes({
    success: true, code: 'OK',
    me: { name: meName, department: String(payload.department || ''), position: String(payload.position || ''), role },
    under: { name: under, department: selfRow.department || '', position: selfRow.position || '', grade: selfRow.grade || '', gridLevel: selfRow.gridLevel || '' },
    isSelf: under === meName,
    count: direct.length,
    hasDeeper,
    towns,
    admins, managers, others,
  }, 200, corsHeaders(origin));
}

// ---- GET /api/mobile/roster?q=&area=&limit= ----
// 真实作业人员花名册。字段容错映射：表里有哪些列就下发哪些（业务后续加列无需改代码）
// 数据源 = storageConfig(env).rosterSheetId → 飞书多维表格「花名册」表（1291 名正式员工，见 storage/index.js 注释）
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
// 1291 人 ≈ 7 次**串行**上游分页拉取（飞书 page_token 是链式的，无法并发），
// 实测单次 ≈ 10.9s（2026-09-18 _t22 性能实测）。故必须缓存，且**所有调用点都要走缓存**。
//
// ⚠️ 缓存在「原始记录」层（未 map），因为花名册有两个不同的字段映射：
//    · mapRosterRecord     （选人/搜索：code/name/job/dept/area/sex/age/phone/status）
//    · mapRosterAreaRecord （网格解析：employeeCode/areaOnDuty/dept/superior/...）
//    旧实现只在 mapRosterRecord 之后缓存，导致 resolvePatrolGrids 绕过缓存直接打飞书
//    → patrol/meta（三违列表入口）恒定 11s 且冷热无差别。这是本缓存存在的根本原因。
// 默认关闭（TTL=0）→ 单元测试天然确定性；生产由 wrangler var ROSTER_CACHE_TTL_MS 开启。
let rosterCache = { key: '', at: 0, raw: null };
function rosterCacheTtl(env) {
  const n = Number(env.ROSTER_CACHE_TTL_MS || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// 第三层：Cache API（跨 isolate / 同 PoP 共享）
// 进程内缓存只活在当前 isolate，Cloudflare 随时可能把请求调度到新 isolate，
// 那时进程内缓存是空的 → 用户重新吃一次 ~10s 冷启动。
// Cache API 在同一 PoP 内共享，能把**冷启动也压到毫秒级**。
// 1800s（30 分钟）：花名册以天/周为单位变动，30 分钟陈旧度业务上无感知；
// 每 30 分钟才可能有一次 ~6s 的冷拉取，且前端进首页时会后台预热，用户基本撞不上。
const ROSTER_HTTP_CACHE_TTL = 1800; // 秒
async function rosterHttpCache() {
  try {
    if (typeof caches === 'undefined' || !caches.default) return null;
    return caches.default;
  } catch { return null; }
}

// 原始记录（未 map）——所有花名册消费方的唯一入口
// 三级缓存：① 进程内（最快）② Cache API（跨 isolate）③ 上游飞书（~10s）
async function loadRosterRaw(env, cfg) {
  const adapter = getAdapter(env);
  if (!cfg.fileId || !cfg.rosterSheetId) {
    const e = new Error('roster not configured');
    e.notConfigured = true;
    throw e;
  }
  const ttl = rosterCacheTtl(env);
  const key = `${cfg.backend}|${cfg.fileId}|${cfg.rosterSheetId}`;
  const now = Date.now();

  // ① 进程内
  if (ttl > 0 && rosterCache.raw && rosterCache.key === key && now - rosterCache.at < ttl) return rosterCache.raw;

  // ② Cache API（同 PoP 跨 isolate 共享）
  const httpCache = await rosterHttpCache();
  const cacheUrl = `https://hse-roster-cache.internal/${encodeURIComponent(String(cfg.backend))}/${encodeURIComponent(String(cfg.fileId))}/${encodeURIComponent(String(cfg.rosterSheetId))}`;
  if (httpCache && ttl > 0) {
    const hit = await httpCache.match(cacheUrl).catch(() => null);
    if (hit) {
      const j = await hit.json().catch(() => null);
      if (Array.isArray(j) && j.length) {
        rosterCache = { key, at: now, raw: j }; // 回填进程内，后续连 Cache API 都省了
        return j;
      }
    }
  }

  // ③ 上游（最慢：1291 人 → 3 次串行分页 ≈ 数秒～10s）
  const raw = await adapter.scanRecords(env, cfg.fileId, cfg.rosterSheetId);
  if (ttl > 0) rosterCache = { key, at: now, raw };
  if (httpCache && ttl > 0) {
    await httpCache.put(cacheUrl, new Response(JSON.stringify(raw), {
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${ROSTER_HTTP_CACHE_TTL}`,
      },
    })).catch(() => {});
  }
  return raw;
}
async function loadRosterRows(env, cfg) {
  return (await loadRosterRaw(env, cfg)).map(mapRosterRecord);
}

/* ---- CF-WPS-86：按姓名查花名册档案（唯一命中才用） ----
   用于 assign/complete 的「档案兜底回填」：客户端只发姓名时，服务端按花名册
   把性别/年龄/岗位补齐。重名（>1 个在职同名人）一律放弃 —— 宁可留空也不写错人。
   花名册已配置但读取失败同样放弃（绝不让兜底逻辑把一次已完成的整改变成 502）。 */
async function rosterPersonBio(env, cfg, name) {
  const n = String(name || '').trim();
  if (!n) return null;
  let rows;
  try { rows = await loadRosterRows(env, cfg); } catch { return null; }
  const hits = rows.filter((r) => r.name === n && !ROSTER_INACTIVE_RE.test(r.status));
  if (hits.length !== 1) return null;
  return { sex: hits[0].sex, age: hits[0].age, job: hits[0].job };
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

  const cfg = await storageConfig(env);
  let all;
  try {
    all = await loadRosterRows(env, cfg);
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
    source: cfg.backend,
    filters: { q, area, scopedToSelf },
    items,
  }, 200, corsHeaders(origin));
}

// ============================================================================
// 乡镇 → 班组 → 人员 级联接口（惰性加载，「自己处理」选人页用）
// ----------------------------------------------------------------------------
//   GET /api/mobile/org/towns                   → 12 个责任乡镇（含经理姓名）
//   GET /api/mobile/org/teams?town=大曹镇        → 该镇班组（片区在首，其后一班/二班…）
//   GET /api/mobile/roster?area=<班组名>          → 该班组在职人员（复用 handleRoster）
//
// 权限与 /api/mobile/org/subordinates 同一套：
//   · 本人子树（ledgerSubtree）作白名单；不在子树内的人不下发。
//   · 「自己处理」在公司管理视角下需要跨乡镇选人 → 白名单 = 全公司（与转派口径一致）。
//   · 非公司管理不暴露全公司乡镇清单（避免任意账号枚举组织）。
// ============================================================================

// 拉台账 + 花名册（两接口共用；花名册走 TTL 缓存）
async function loadLedgerRows(env, cfg) {
  const adapter = getAdapter(env);
  if (!cfg.fileId || !cfg.ledgerSheetId) {
    const e = new Error('ledger not configured');
    e.notConfigured = true;
    throw e;
  }
  return (await adapter.scanRecords(env, cfg.fileId, cfg.ledgerSheetId)).map(mapLedgerRecord).filter((r) => r.name);
}

// ---- GET /api/mobile/org/towns ----
async function handleOrgTowns(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'GET') return errRes('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, corsHeaders(origin));
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

  const cfg = await storageConfig(env);
  let rows, rosterRows;
  try {
    rows = await loadLedgerRows(env, cfg);
    rosterRows = await loadRosterRows(env, cfg).catch(() => []);
  } catch (e) {
    if (e && e.notConfigured) return errRes('IDENTITY_NOT_CONFIGURED', '台账未配置', 503, corsHeaders(origin));
    return errRes('UPSTREAM_ERROR', '组织信息暂不可用，请稍后再试', 502, corsHeaders(origin));
  }

  const meName = String(payload.name || '').trim();
  const subtree = ledgerSubtree(rows, meName);
  if (!subtree) {
    return jsonRes({
      success: true, code: 'AMBIGUOUS_SELF',
      message: '台账中你的姓名不唯一或未登记，无法解析组织，请联系管理员规范台账',
      towns: [],
    }, 200, corsHeaders(origin));
  }
  const allowed = new Set(subtree.map((r) => r.name));
  allowed.add(meName);

  // 乡镇清单只对公司管理下发全量；其他人仅下发「自己子树覆盖到的乡镇」
  const isCompany = String(payload.role || '') === '公司管理';
  const towns = ledgerTowns(rows)
    .map((t) => {
      const { mgr, teams } = townTeams(rows, rosterRows, t.town);
      const visTeams = isCompany
        ? teams
        : teams
            .map((x) => ({ ...x, admins: x.admins.filter((a) => allowed.has(a.name)) }))
            .filter((x) => (x.admins.length || x.rosterCount) && (x.isManagerTeam ? (mgr && allowed.has(mgr.name)) : true));
      const mgrVisible = !isCompany && mgr && !allowed.has(mgr.name) ? null : mgr;
      const admTotal = visTeams.reduce((s, x) => s + x.adminCount, 0);
      return {
        town: t.town,
        department: t.department,
        managerName: mgrVisible ? mgr.name : '',
        managerPhone: mgrVisible ? mgr.phone || '' : '',
        teams: visTeams.map((x) => ({
          dept: x.dept, isManagerTeam: x.isManagerTeam,
          managerName: x.managerName, adminCount: x.adminCount,
          rosterCount: x.rosterCount,
        })),
        teamCount: visTeams.length,
        peopleCount: visTeams.reduce((s, x) => s + Math.max(x.rosterCount, x.adminCount), 0),
        adminCount: admTotal,
      };
    })
    .filter((t) => (isCompany ? true : t.teams.length > 0));

  return jsonRes({
    success: true, code: 'OK',
    scope: isCompany ? 'company' : 'subtree',
    towns,
  }, 200, corsHeaders(origin));
}

// ---- GET /api/mobile/org/teams?town=大曹镇 ----
// 返回该镇班组清单（片区在首，其后按班号升序）+ 每班管理员姓名。
async function handleOrgTeams(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'GET') return errRes('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, corsHeaders(origin));
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

  const url = new URL(request.url);
  const town = (url.searchParams.get('town') || '').trim().slice(0, 40);
  if (!town || !isUnitName(town)) return errRes('BAD_REQUEST', '作业中心参数不合法', 400, corsHeaders(origin));

  const cfg = await storageConfig(env);
  let rows, rosterRows;
  try {
    rows = await loadLedgerRows(env, cfg);
    rosterRows = await loadRosterRows(env, cfg).catch(() => []);
  } catch (e) {
    if (e && e.notConfigured) return errRes('IDENTITY_NOT_CONFIGURED', '台账未配置', 503, corsHeaders(origin));
    return errRes('UPSTREAM_ERROR', '组织信息暂不可用，请稍后再试', 502, corsHeaders(origin));
  }

  // 该乡镇必须真实存在（防任意字符串探测）
  if (!ledgerTowns(rows).some((t) => t.town === town)) {
    return errRes('NOT_FOUND', '未找到该乡镇', 404, corsHeaders(origin));
  }

  const meName = String(payload.name || '').trim();
  const subtree = ledgerSubtree(rows, meName);
  const isCompany = String(payload.role || '') === '公司管理';
  const allowed = subtree ? new Set(subtree.map((r) => r.name)) : new Set([meName]);
  allowed.add(meName);

  const { mgr, teams } = townTeams(rows, rosterRows, town);
  const out = teams.map((x) => {
    const admins = isCompany ? x.admins : x.admins.filter((a) => allowed.has(a.name));
    return {
      dept: x.dept,
      isManagerTeam: x.isManagerTeam,
      managerName: x.isManagerTeam ? (isCompany || (mgr && allowed.has(mgr.name)) ? (mgr ? mgr.name : '') : '') : '',
      managerPhone: x.isManagerTeam && (isCompany || (mgr && allowed.has(mgr.name))) ? (mgr ? mgr.phone || '' : '') : '',
      admins,
      adminCount: admins.length,
      rosterCount: x.rosterCount,
      peopleCount: x.rosterCount,
    };
  }).filter((x) => x.adminCount || x.rosterCount || x.isManagerTeam);

  return jsonRes({
    success: true, code: 'OK',
    town,
    managerName: mgr ? mgr.name : '',
    managerPhone: mgr ? mgr.phone || '' : '',
    managerMissing: !mgr,
    teams: out,
  }, 200, corsHeaders(origin));
}

// ============================================================================
// CF-WPS-21 —— H5 定位逆地理编码（GPS 经纬度 → 乡镇/街道 地理位置）
// ----------------------------------------------------------------------------
// 背景：H5 首页定位行原为占位文案「当前网格辖区」。业务要求改为由经纬度反查真实位置
//       （乡镇—村庄级），替代无意义的占位。
// 实现（两段式，默认只跑第一段）：
//   ① 离线判定（默认、恒可用）：内置宁津县 12 个乡镇/街道边界（GCJ-02，见 geo-ningjin-data.js），
//      手机 GPS(WGS-84) → GCJ-02 → 点落面 → 「宁津县柴胡店镇」。
//      为什么离线优先：乡镇上信号差，外部逆地理 API 需要 key 且断网即失败；
//      离线判定零依赖、零延迟、可离线单测（乡镇级准确率已用 1.7 万点网格与原始边界比对验证）。
//   ② 高德增强（可选）：env.AMAP_WEB_KEY 已配置时，由 Worker 侧再调一次高德 Web 服务逆地理编码，
//      补全到村级/POI 级（address 更细）。**注意必须是「Web 服务」类型的 key**——
//      vben 前端用的是 JS API key（2dbd01fb…），在 REST 端点会返回 USERKEY_PLAT_NOMATCH。
//      失败/未配置一律静默回落 ①，绝不因外部依赖影响定位展示。
// 安全纪律：只读、Session 鉴权、不落库、不写台账；返回体只含地理描述，不含任何凭据。
// ============================================================================

async function amapRegeo(env, gcjLng, gcjLat) {
  const key = String(env.AMAP_WEB_KEY || '').trim();
  if (!key) return null;
  const url = `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(key)}`
    + `&location=${gcjLng},${gcjLat}&radius=500&extensions=base&roadlevel=0`;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 4000) : null;
  try {
    const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
    const j = await res.json();
    if (!j || j.status !== '1' || !j.regeocode) return null;
    const rg = j.regeocode;
    const ac = rg.addressComponent || {};
    return {
      formatted: String(rg.formatted_address || '').slice(0, 120),
      township: String(ac.township || '').slice(0, 40),
      neighborhood: fieldText(ac.neighborhood).slice(0, 60),
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---- GET /api/mobile/geo/regeo?lat=&lng= ----
async function handleGeoRegeo(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'GET') return errRes('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, corsHeaders(origin));
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (!validLatLng(lat, lng)) return errRes('GEO_INVALID_COORD', '定位坐标不合法', 400, corsHeaders(origin));

  const base = regeoNingjin(lat, lng);
  let detail = null;
  const enhanced = await amapRegeo(env, base.gcj[0], base.gcj[1]);
  if (enhanced && enhanced.formatted) {
    detail = enhanced;
    base.address = enhanced.formatted;
    base.source = 'amap';
  }
  return jsonRes({
    success: true, code: 'OK',
    input: { lat, lng },
    county: base.county,
    town: base.town,
    inCounty: base.inCounty,
    nearest: base.nearest,
    distanceKm: base.distanceKm,
    address: base.address,
    detail,                       // 高德增强结果（未配置时为 null）
    source: base.source,
    towns: GEO_TOWNS,
  }, 200, corsHeaders(origin));
}

// ============================================================================
// 移动端照片上传 —— 仅飞书 drive media（2026-09-18 已去 WPS 三步上传）
// ----------------------------------------------------------------------------
// 链路：multipart(file, client_request_id) → 飞书 drive media 上传 → file_token（纯上传，
//   不建记录）。附件在巡查提交（/api/mobile/patrol/submit）时随 body.photo_tokens 落入
//   「三违照片」附件列。
// 安全纪律：
//   - 只允许 image/jpeg / image/png；magic bytes 校验，不信 Content-Type。
//   - employee_code 一律取自 Session.sub（服务端注入），前端传入的一律忽略。
//   - Session 门 fail-closed；secret/token 不入响应与日志。
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

// ---- POST /api/mobile/upload（飞书 drive media 上传 → file_token）----
async function handleUploadImage(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

  try {
    // 门 1：Session（employee_code 唯一来源=sub；不支持后端 JWT——上传属移动端会话语义）
    if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
    const session = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
    if (!session) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
    const employeeCode = String(session.sub || ''); // 服务端注入；前端传入的一律忽略
    if (!employeeCode) return errRes('UNAUTHORIZED', '会话身份缺失', 401, corsHeaders(origin));

    // 门 2：体大小（multipart）
    const contentLen = Number(request.headers.get('content-length') || '0');
    if (contentLen > UPLOAD_BODY_LIMIT) return errRes('BODY_TOO_LARGE', `请求体超过上限（${UPLOAD_BODY_LIMIT} 字节）`, 413, corsHeaders(origin));
    let form;
    try { form = await request.formData(); } catch { return errRes('BAD_REQUEST', '请求必须为 multipart/form-data', 400, corsHeaders(origin)); }
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return errRes('BAD_REQUEST', '缺少文件字段 file', 400, corsHeaders(origin));
    form.get('client_request_id'); // 预留：纯上传暂不建记录，幂等由提交链路负责

    // 门 3：大小 + magic bytes（不信 Content-Type/扩展名）
    if (file.size <= 0) return errRes('BAD_REQUEST', '空文件', 400, corsHeaders(origin));
    if (file.size > UPLOAD_MAX_BYTES) return errRes('FILE_TOO_LARGE', `图片超过上限（${UPLOAD_MAX_BYTES} 字节）`, 413, corsHeaders(origin));
    const buf = new Uint8Array(await file.arrayBuffer());
    const magic = detectImageMagic(buf);
    if (!magic) return errRes('UNSUPPORTED_FILE_TYPE', '仅支持 JPEG/PNG 图片', 400, corsHeaders(origin));
    const rawName = String(file.name || 'photo');
    const ext = (rawName.split('.').pop() || '').toLowerCase();
    if (ext && !magic.exts.has(ext)) return errRes('UNSUPPORTED_FILE_TYPE', '文件扩展名与图片内容不符', 400, corsHeaders(origin));

    // 门 4：存储目标配置
    if (!env.FS_APP_TOKEN) return errRes('STORAGE_NOT_CONFIGURED', '存储目标未配置', 503, corsHeaders(origin));

    // 飞书 drive media 上传 → file_token（纯上传，不建记录；附件在巡查提交时落入「三违照片」列）
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
  } catch {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

// ============================================================================
// CF-WPS-13 —— 网格长巡查文字业务链（Session→employee_code→飞书主台账）
// ----------------------------------------------------------------------------
// 边界（CF-WPS-13 任务书；2026-09-18 单主台账，已去 WPS 测试表分叉）：
//   - 身份：一律取 Session.sub（employee_code），前端传入的 employee_code 一律忽略。
//   - 网格：不按姓名/手机号猜。唯一来源 = 花名册「负责区域（在职）」按员工编码精确命中；
//     解析不出 → 明确失败「当前人员无法确定巡查网格，请联系管理员」。
//   - 目标表：一律「H5员工日常不安全行为台账」主台账（prodSheetId）。
//   - 三违：只做移动端「发现并记录」，不做责任人/扣分/审核/整改计算。
//   - 照片：经 /api/mobile/upload 上传（file_token），提交时落入「三违照片」附件列。
//   - 幂等：沿用 client_request_id 预查（O(n) 扫描）→ IDEMPOTENCY_STATUS=LIMITED。
// ============================================================================

const PATROL_BODY_LIMIT = 32 * 1024; // 巡查提交体上限
const PATROL_DESC_MAX = 500;         // 问题描述长度上限
const PATROL_VIOL_DESC_MAX = 300;    // 三违行为描述长度上限
const PATROL_PEOPLE_MAX = 200;       // 涉及人员长度上限
const PATROL_ATTR_MAX = 50;          // 违章人档案字段（性别/年龄/职位）长度上限
const PATROL_TIME_MAX = 32;          // 巡查时间字符串长度上限
const PATROL_LIST_LIMIT = 50;        // 「我的巡查记录」返回条数上限

// 问题类型候选（env MOBILE_PATROL_PROBLEM_TYPES 可覆盖）
// ⚠️ 必须含「三违」：H5 的「是三违」分支按问题类型=三违入库（is_violation=是 + 三违行为描述 才是真判据）。
// ⚠️ 必须含「一般问题」「现场正常」：H5「不是三违」分支的巡查结果就这两个值（check.html 单选卡
//    data-patrol），直接透传为 problem_type。曾因白名单只有「环境卫生/设施设备/…」，
//    普通巡查提交恒 400 PATROL_FIELD_INVALID —— 而普通巡查是最常用入口，等于主路径全断。
//    （2026-09-17 端到端验收暴露，见 test/cfwps29b-contract.test.mjs）
const PATROL_DEFAULT_PROBLEM_TYPES = ['三违', '一般问题', '现场正常', '环境卫生', '设施设备', '安全隐患', '秩序管理', '其他'];

// ---------------------------------------------------------------------------
// 三违标准库（业务方 2026-09-17 下发，共 20 条）—— H5「选择三违」宫格的唯一数据源
// ---------------------------------------------------------------------------
// 这是**服务端权威清单**：前端不再硬编码，而是经 GET /api/mobile/patrol/meta 的
// `violation_types` 字段下发，保证「前端可选」与「后端可收」永远一致
// （否则新增三违项时前端能选、后端校验拒绝，形成静默失败）。
// 校验规则：提交的 violation_desc 必须命中本清单（见 validatePatrolBody）。
const PATROL_VIOLATION_LIB = [
  '闯红灯',
  '骑车不戴头盔',
  '逆行',
  '违章停车',
  '超速行驶',
  '违章掉头',
  '违章变道',
  '驾车时抽烟',
  '打电话',
  '破坏车内监控设施',
  '未穿工作服',
  '横穿马路',
  '翻越护栏',
  '不领取防暑物资',
  '出车不三检',
  '脱岗、玩岗、替岗',
  '隐瞒身体不适状况上岗',
  '危险作业未按要求采取保护措施',
  '机动车道作业未摆放路锥',
  '背向来车方向作业',
];

// 三违库（env MOBILE_PATROL_VIOLATION_TYPES 可覆盖，逗号分隔；不配则用内置 20 条）
function patrolViolationLib(env) {
  const raw = String(env.MOBILE_PATROL_VIOLATION_TYPES || '').trim();
  if (!raw) return PATROL_VIOLATION_LIB.slice();
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : PATROL_VIOLATION_LIB.slice();
}

function patrolProblemTypes(env) {
  const raw = String(env.MOBILE_PATROL_PROBLEM_TYPES || '').trim();
  if (!raw) return PATROL_DEFAULT_PROBLEM_TYPES.slice();
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : PATROL_DEFAULT_PROBLEM_TYPES.slice();
}

// ---- 目标表解析（2026-09-18 单主台账：prod/test 已合并，一律写主台账 prodSheetId）----
function patrolTarget(env, cfg) {
  const sheetId = String((cfg && cfg.prodSheetId) || '').trim();
  if (!sheetId) return null;
  return { sheetId, production: true };
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

// ---- 花名册「负责区域（在职）/所属部门/直接上级/手机号/职位」读取（新 mapper，不改动既有 mapRosterRecord 语义）----
// phone/superior/job 用于重名消歧（业务口径 2026-09-17：重名 + 手机号/员工编码/所属部门/职位 共同识别）
function mapRosterAreaRecord(rec) {
  const f = rec.fields;
  return {
    recordId: rec.id,
    employeeCode: fieldText(f['员工编码']).trim(),
    name: fieldText(f['姓名']).trim(),
    areaOnDuty: fieldText(f['负责区域（在职）']).trim(),
    dept: fieldText(f['所属部门']).trim(),
    superior: fieldText(f['直接上级']).trim(),
    job: fieldText(f['职位']).trim(),
    phone: phoneDigits(f['手机号'] !== undefined ? f['手机号'] : f['手机号码']),
  };
}

// 人员标识 → 网格列表（fail-closed：解析不出唯一人 → 空）
// ----------------------------------------------------------------------------
// 键优先级（2026-09-17 三次修正，业务口径：重名 + 手机号/员工编码/所属部门/职位 共同识别）：
//   ① 手机号   —— 最稳。现行台账登录签发 sub=手机号；花名册补「手机号」列后立即生效
//   ② 员工编码 —— 稳定工号（台账补列后由 session 透传）
//   ③ 姓名唯一 —— 命中即用
//   ④ 姓名重名 —— 先用「职位」收敛：业务口径「只有乡镇作业中心经理/管理员及以上才是网格长」，
//                 同名里的非网格长（乡镇保洁员/司机等）无权占坑，剔除后唯一即命中（by='name+job'）
//   ⑤ 姓名重名 —— 职位仍不唯一时，用「所属部门」消歧，再退到「直接上级」消歧
//   ⑥ 以上都收敛不到唯一人 → fail-closed（matched=命中行数，by=null），绝不错挂网格
// 值（业务口径：「负责区域」就是「所属部门」）：优先「负责区域（在职）」，为空回落「所属部门」
// 数据源与 /api/mobile/roster 同源（storageConfig.rosterSheetId）。
const PATROL_GRID_BY = {
  PHONE: 'phone',
  CODE: 'employee_code',
  NAME_JOB: 'name+job',
  NAME_DEPT: 'name+dept',
  NAME_SUPERIOR: 'name+superior',
  NAME: 'name',
};

// 「网格长」职位白名单（业务口径 2026-09-17：乡镇作业中心经理 / 管理员及以上才是网格长）
// ⚠️ 词汇陷阱（实测 2026-09-17）：台账「分级」= 管理员/乡镇作业中心经理/公司管理；
//    花名册「职位」是另一套枚举（人工班长 45 / 人工片区长 13 / 乡镇保洁员 1156 / 司机 43 / 中转站管理员 16 …）。
//    两者对齐关系：台账 管理员 ↔ 花名册 人工班长；台账 乡镇作业中心经理 ↔ 花名册 人工片区长。
//    若把「管理员|乡镇作业中心经理」字面拿去花名册职位过滤 ⇒ 68 名台账人员中 62 人 0 命中被打成 fail-closed，
//    故这里同时收录两套词表的等值写法，且**只做精确等值匹配**——
//    正因为精确匹配，收「管理员」也不会误放「中转站管理员」（后者≠「管理员」）。
// 白名单可由 Worker 变量 PATROL_GRID_LEADER_JOBS 覆盖（逗号分隔；`/re/` 形式按正则），
// 业务新增职位时改配置即可，无需改代码。未知职位一律视为「非网格长」。
const GRID_LEADER_JOBS_DEFAULT = [
  // 花名册「职位」实测值（台账 68 人对应行全部命中其中 6 项）
  '人工班长', '人工片区长', '项目总经理', '安环管理部经理', '生产管理部经理', '生产作业中心副经理（人工）',
  // 台账「分级」同义写法（业务口述用词）
  '管理员', '乡镇作业中心经理',
];
function gridLeaderJobs(env) {
  const raw = String((env && env.PATROL_GRID_LEADER_JOBS) || '').trim();
  if (!raw) return { exact: new Set(GRID_LEADER_JOBS_DEFAULT), res: [] };
  const exact = new Set(), res = [];
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^\/(.*)\/$/.exec(part);
    if (m) { try { res.push(new RegExp(m[1])); } catch { /* 非法正则忽略 */ } } else exact.add(part);
  }
  return { exact, res };
}
function isGridLeaderJob(job, wl) {
  const j = String(job || '').trim();
  if (!j) return false; // 职位缺失 → 保守视为非网格长
  return wl.exact.has(j) || wl.res.some((re) => re.test(j));
}

function pickGridRow(row, by) {
  const src = row.areaOnDuty || row.dept;
  return { grids: normalizeGridAreas(src), matched: 1, by };
}

// 重名消歧：同名多行时先按「职位（网格长）」收敛，再依次用「所属部门」→「直接上级」降级
function narrowDuplicateName(hits, me, env) {
  const wl = gridLeaderJobs(env);
  const leaders = hits.filter((r) => isGridLeaderJob(r.job, wl));
  // 业务口径：非网格长不参与网格归属判定。只在能定案（恰 1 人）时生效；
  // 若 0 人（职位未维护/新职位）则保留原全集继续降级，避免把已可用的人打成 fail-closed。
  const pool = leaders.length ? leaders : hits;
  if (leaders.length === 1) return { rows: leaders, by: PATROL_GRID_BY.NAME_JOB };

  const dept = String((me && me.dept) || '').trim();
  const superior = String((me && me.superior) || '').trim();
  if (dept) {
    const byDept = pool.filter((r) => r.dept && (r.dept === dept || r.dept.includes(dept) || dept.includes(r.dept)));
    if (byDept.length === 1) return { rows: byDept, by: PATROL_GRID_BY.NAME_DEPT };
  }
  if (superior) {
    const bySup = pool.filter((r) => r.superior && (r.superior === superior || r.superior.includes(superior)));
    if (bySup.length === 1) return { rows: bySup, by: PATROL_GRID_BY.NAME_SUPERIOR };
  }
  return { rows: pool, by: null };
}


async function resolvePatrolGrids(env, ident) {
  const code = String((ident && ident.code) || '').trim();
  const name = String((ident && ident.name) || '').trim();
  const cfg = await storageConfig(env);
  if (!cfg.fileId || !cfg.rosterSheetId) return { grids: [], matched: 0, by: null };
  // 会话必须带 sub：缺失 = 非本系统正常签发的会话 → fail-closed，不走姓名兜底
  if (!code) return { grids: [], matched: 0, by: null };
  const me = ident || {};
  const phone = phoneDigits(me.phone || (/^1\d{10}$/.test(code) ? code : ''));
  // ⚠️ 必须走 loadRosterRaw（带 TTL 缓存），不能直接 scanRecords：
  //    花名册 1291 人要 7 次串行分页 ≈ 10.9s，patrol/meta 是三违列表的唯一入口，
  //    绕过缓存会让用户每次点开三违都干等 11 秒（2026-09-18 _t22 实测）。
  const recs = (await loadRosterRaw(env, cfg)).map(mapRosterAreaRecord);

  if (phone) {
    const byPhone = recs.filter((r) => r.phone && r.phone === phone);
    if (byPhone.length === 1) return pickGridRow(byPhone[0], PATROL_GRID_BY.PHONE);
  }
  const byCode = recs.filter((r) => r.employeeCode && r.employeeCode === code);
  if (byCode.length === 1) return pickGridRow(byCode[0], PATROL_GRID_BY.CODE);
  if (name) {
    const byName = recs.filter((r) => r.name && r.name === name);
    if (byName.length === 1) return pickGridRow(byName[0], PATROL_GRID_BY.NAME);
    if (byName.length > 1) {
      const n = narrowDuplicateName(byName, { dept: me.dept, superior: me.superior }, env);
      if (n.rows.length === 1) return pickGridRow(n.rows[0], n.by);
      return { grids: [], matched: n.rows.length, by: null };
    }
  }
  return { grids: [], matched: 0, by: null };
}

// ---- GET /api/mobile/patrol/meta：身份 + 网格解析 + 问题类型候选 ----
async function handlePatrolMeta(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
  const cfg = await storageConfig(env);

  let grids = [], matched = 0, gridBy = null;
  try {
    const r = await resolvePatrolGrids(env, { code: payload.sub, name: payload.name, dept: payload.department, superior: payload.superior });
    grids = r.grids; matched = r.matched; gridBy = r.by;
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
    grid_resolved_by: gridBy,
    message: resolved ? '' : '当前人员无法确定巡查网格，请联系管理员',
    problem_types: patrolProblemTypes(env),
    violation_types: patrolViolationLib(env),
    photo_status: 'FEISHU_ATTACHMENT_READY',
    photo_note: '照片经 /api/mobile/upload 上传至飞书（返回 file_token），提交时随记录落入「三违照片」附件列',
    target: target ? 'production' : 'unconfigured',
  }, 200, corsHeaders(origin));
}

// ---- 巡查提交字段校验（全部服务端定值；body 字段绝不展开进 record）----
// 超长文本 = 拒绝（不静默截断，避免篡改用户内容）
function validatePatrolBody(body, problemTypes, violationLib) {
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

  let violationDesc = '', violationPeople = '', violationSex = '', violationAge = '', violationJob = '';
  if (isViolation === '是') {
    violationDesc = patrolText(body && body.violation_desc, PATROL_VIOL_DESC_MAX);
    const vdRaw = patrolText(body && body.violation_desc, PATROL_VIOL_DESC_MAX + 1);
    if (!violationDesc || vdRaw.length > PATROL_VIOL_DESC_MAX) errors.push('violation_desc');
    // 三违行为必须命中服务端权威三违库（前端宫格的可选项即来自同一清单，见 patrolViolationLib）。
    // 精确等值匹配 —— 不允许自造三违项，避免脏数据污染统计口径。
    else if (Array.isArray(violationLib) && violationLib.length && !violationLib.includes(violationDesc) && !violationLib.includes(violationDesc.split('（')[0].trim())) {
      errors.push('violation_desc_not_in_lib');
    }
    violationPeople = patrolText(body && body.violation_people, PATROL_PEOPLE_MAX);
    const vpRaw = patrolText(body && body.violation_people, PATROL_PEOPLE_MAX + 1);
    if (!violationPeople || vpRaw.length > PATROL_PEOPLE_MAX) errors.push('violation_people');
    // 违章人补充档案（可选）：性别/年龄/职位 → 主台账「性别」「年龄」「车辆类型|保洁员」列
    violationSex = patrolText(body && body.violation_sex, PATROL_ATTR_MAX);
    violationAge = patrolText(body && body.violation_age, PATROL_ATTR_MAX);
    violationJob = patrolText(body && body.violation_job, PATROL_ATTR_MAX);
  }

  const photoTaken = String((body && body.photo_taken) || '') === 'true';
  const clientRequestId = patrolText(body && body.client_request_id, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientRequestId)) errors.push('client_request_id');

  return {
    errors,
    values: {
      inspectionTime: inspectTime, grid, description, problemType,
      isViolation, violationDesc, violationPeople, violationSex, violationAge, violationJob,
      photoStatus: photoTaken ? 'PENDING_EXTERNAL' : '未拍摄',
      clientRequestId,
    },
  };
}

/* ---- CF-WPS-重复台账：并发提交的写后自愈 ------------------------------------
   背景：/patrol/submit 的幂等是「先查后写」——findExistingByClientRequestId 查一次
   （~200-400ms），没命中就 createRecords。客户端只要在第一次提交**在途期间**又发一次
   （同一个 client_request_id），两条请求就会都在对方落库前完成预查 → 双双建单 →
   台账里出现逐字段一致、只有创建时间差几秒的多条记录。
   实测生产：112 条里 27 组重复、多出 53 条。

   这里在建单成功后按 req 回查一次，>1 条时保留创建最早的一条、删掉其余重复。
   只删「本次建单前后 10 分钟内创建」的，避免误伤任何历史记录。
   全程静默失败：自愈是附加保护，绝不能把一次已经成功的提交变成 502。
   调用方用 ctx.waitUntil 触发 → 不给提交链路增加延迟。 */
async function healDuplicatePatrolRecords(adapter, env, fileId, sheetId, clientRequestId) {
  try {
    if (!clientRequestId || typeof adapter.searchRecords !== 'function') return 0;
    const rows = await adapter.searchRecords(env, fileId, sheetId, {
      field: '备注', operator: 'contains', value: 'req:' + clientRequestId, maxPages: 2,
    });
    if (!rows || rows.length < 2) return 0;
    // 创建时间：主台账「日期」是日期型自动列（毫秒）。取不到就退化为「保持返回顺序」。
    const at = (r) => {
      const v = r && r.fields && r.fields['日期'];
      const n = Number(v && typeof v === 'object' ? (v.value ?? v.text) : v);
      return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
    };
    const sorted = [...rows].sort((a, b) => at(a) - at(b));
    const keep = sorted[0];
    const now = Date.now();
    const victims = sorted.slice(1)
      .filter((r) => r.id && r.id !== keep.id)
      .filter((r) => { const t = at(r); return t === Number.MAX_SAFE_INTEGER || (now - t) < 10 * 60 * 1000; })
      .map((r) => r.id);
    if (!victims.length) return 0;
    await adapter.batchDelete(env, fileId, sheetId, victims);
    invalidateMainLedger(fileId, sheetId);
    console.warn('[patrol-dedupe] req=' + clientRequestId + ' removed=' + victims.length + ' kept=' + keep.id);
    return victims.length;
  } catch (e) {
    console.warn('[patrol-dedupe] skipped: ' + (e && e.message));
    return 0;
  }
}

// ---- POST /api/mobile/patrol/submit ----
async function handlePatrolSubmit(request, env, ctx) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  try {
    // 存储后端装配（飞书）
    const adapter = getAdapter(env);
    const cfg = await storageConfig(env);

    // 门 1：Session（employee_code 唯一来源）
    if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
    const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
    if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
    const employeeCode = payload.sub; // 服务端注入；前端 employee_code 一律忽略

    // 门 2：目标 Sheet fail-closed（2026-09-18 单主台账：一律写主台账 prodSheetId）
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
    const { errors, values } = validatePatrolBody(body, patrolProblemTypes(env), patrolViolationLib(env));
    if (errors.length) {
      return errRes('PATROL_FIELD_INVALID', `字段校验失败：${errors.join(',')}`, 400, corsHeaders(origin));
    }

    // 照片附件（可选，仅飞书后端）：body.photo_tokens = 上传接口返回的 file_token 数组（≤3）
    let photoTokens = [];
    if (body.photo_tokens != null) {
      const ok = Array.isArray(body.photo_tokens) && body.photo_tokens.length <= 3
        && body.photo_tokens.every((t) => typeof t === 'string' && /^[A-Za-z0-9]{10,120}$/.test(t));
      if (!ok) return errRes('PATROL_FIELD_INVALID', 'photo_tokens 不合法（≤3 个、字母数字、来自上传接口）', 400, corsHeaders(origin));
      photoTokens = [...new Set(body.photo_tokens)];
    }

    // 门 5：网格 fail-closed（服务端解析为准；body.grid 必须在解析结果内）
    // 注意：resolvePatrolGrids 只接受 (env, {code, name, dept, superior}) —— 数据源由 storageConfig(env) 决定，
    // 不再由调用方传入 adapter/cfg（曾因旧签名残留导致 env 错位、网格恒 unresolved）。
    // code=Session sub（现行=手机号，会天然走②工号不中 → ①手机号/③姓名）；dept/superior 用于重名消歧。
    let grids;
    try {
      grids = await resolvePatrolGrids(env, { code: employeeCode, name: payload.name, dept: payload.department, superior: payload.superior });
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
    // 2026-09-18 单主台账：一律写「H5员工日常不安全行为台账」主台账字段，无测试字段分叉。
    // ⚠️ 列名必须是主台账**实测**列名（见 FEISHU_FIELD_WHITELIST 上方注释）：
    //    用旧列名会被飞书 1254045 FieldNameNotFound 拒掉，前端只看到 502「存储写入失败」。
    const isVio = values.isViolation === '是';
    // CF-WPS-62：巡查身份三件套落成独立列。建列失败时 meta.has 为空 → 退回只写「备注」，
    // 提交流程完全不受影响（不能因为多了三个列就把现场上报搞挂）。
    const metaFields = await ensurePatrolMetaFields(env, cfg.fileId, target.sheetId);

    const record = {
      '检查人姓名': payload.name || '',                       // 提交人姓名（主台账权威）
      '网格等级': payload.grid_level || '',                    // 台账「网格长等级」
      '片区|班组': values.grid,                                // 巡查网格 / 片区
      '违章行为': isVio ? values.violationDesc : NO_VIOLATION_TEXT,
      '违章人员姓名': isVio ? values.violationPeople : '',      // 非三违无违章人
      '性别': isVio ? values.violationSex : '',                // 违章人档案 → 主台账「性别」
      '年龄': isVio ? values.violationAge : '',                // 违章人档案 → 主台账「年龄」
      '车辆类型|保洁员': isVio ? values.violationJob : '',      // 违章人职位 → 主台账「车辆类型|保洁员」
      '描述': values.description,                              // 问题描述 / 巡查结果
      // 「备注」仍然写（历史数据与兜底都靠它，见 patrolIdentity 的回退逻辑）
      '备注': buildPatrolNote(employeeCode, values.inspectionTime, values.clientRequestId),
    };
    // CF-WPS-62：独立列 —— 只有确认列存在才写，否则飞书会 1254045 FieldNameNotFound
    if (metaFields.has.has(PATROL_META_FIELDS.userId)) record[PATROL_META_FIELDS.userId] = employeeCode;
    if (metaFields.has.has(PATROL_META_FIELDS.time)) record[PATROL_META_FIELDS.time] = values.inspectionTime;
    if (metaFields.has.has(PATROL_META_FIELDS.req)) record[PATROL_META_FIELDS.req] = String(values.clientRequestId || '');

    // 照片附件（飞书后端）：file_token 数组落入主台账附件列「违章照片」
    // （旧代码写「三违照片」——那是「表格视图」表的列名，主台账里没有，同样会 1254045）
    if (photoTokens.length) {
      record['违章照片'] = photoTokens.map((t) => ({ file_token: t }));
    }
    // 整改后照片（可选）：body.rectify_photo_tokens，落入「整改后照片」附件列
    if (Array.isArray(body.rectify_photo_tokens) && body.rectify_photo_tokens.length
        && body.rectify_photo_tokens.every((t) => typeof t === 'string' && /^[A-Za-z0-9]{10,120}$/.test(t))) {
      record['整改后照片'] = [...new Set(body.rectify_photo_tokens)].slice(0, 3).map((t) => ({ file_token: t }));
    }

    /* ---- 可选：建单即指派（CF-WPS-43）----------------------------------------
       现场反馈「点乡镇经理/管理员的姓名，要等好几秒才跳下一页」。
       原链路：patrol/submit（≈4.2s）→ /api/mobile/assign（≈3.3s）**串行两段**，
       而 assign 里的 getRecord（≈0.9s）+ updateRecord（≈2.2s）纯粹是把刚建好的
       同一条记录再读一遍、再写一遍。建单时接收人信息已经全部已知 →
       直接并进这一次 create，省掉整段 assign 往返（端到端 ≈7.7s → ≈4.3s）。
       /api/mobile/assign 保留不动：事后改派、经理转派、历史补发仍走它。 */
    let assignInfo = null;
    const at = body.assign_to;
    if (at && typeof at === 'object' && !Array.isArray(at)) {
      const aid = String(at.assignee_id || '').trim();
      if (aid) {
        if (!/^\d{6,20}$/.test(aid)) {
          return errRes('ASSIGN_FIELD_INVALID', 'assign_to.assignee_id 须为工号或手机号', 400, corsHeaders(origin));
        }
        // 新建记录的归属人就是调用者本人 → 「只能派自己的记录」天然满足，
        // 只剩经理的接收人范围约束（与 /assign 同一套口径）。
        const roleS = String(payload.role || '');
        if (roleS === '经理' && roleS !== '公司管理') {
          const subs = await managerSubordinatePhones(env, cfg, String(payload.name || ''));
          if (!subs.has(aid)) {
            return errRes('FORBIDDEN', '乡镇作业中心经理只能指派给你所在作业中心的下级', 403, corsHeaders(origin));
          }
        }
        // CF-WPS-58：接收人不得是公司管理角色（角色压过职位，详见 isCompanyGrade 注释）
        if (await assigneeIsCompanyRole(adapter, env, cfg, aid, at.assignee_name)) {
          return errRes('FORBIDDEN', '公司管理账号不可作为整改接收人（其身份角色为公司管理，不因花名册职位而改变）', 403, corsHeaders(origin));
        }
        await ensureTodoFields(env, fileId, sheetId);
        assignInfo = {
          [TODO_FIELDS.assigneeId]: aid,
          [TODO_FIELDS.assigneeName]: patrolText(at.assignee_name || aid, 40),
          [TODO_FIELDS.town]: patrolText(at.town || '', 40),
          [TODO_FIELDS.status]: TODO_STATUS.pending,
          [TODO_FIELDS.assignerId]: String(payload.sub || ''),
          [TODO_FIELDS.assignerName]: patrolText(payload.name || '', 40),
          // 指派人单位 = 指派人自己的所属部门（如 公司管理=安环管理部），供「来自 XXX · 单位」显示
          [TODO_FIELDS.assignerDept]: patrolText(payload.department || '', 40),
          [TODO_FIELDS.assignedAt]: todoNowLocal(),
          [TODO_FIELDS.doneAt]: '',
          [TODO_FIELDS.note]: patrolText(at.note || '', 200),
        };
        Object.assign(record, assignInfo);
      }
    }

    // CF-WPS（派发/上报区分）：来源列幂等补建 + 落主台账
    // 来源：公司管理 / 乡镇作业中心经理 建的记录算「派发任务」，其余角色算「上报」（与前端 toPatrolBody 一致）
    // ⚠️ fail-open：列建不出来（listFields/ensureField 异常）时**不写来源**，让巡查提交照常成功，
    //    绝不能因为一个附加标签列把整条巡查挡在 1254045 之外。
    const srcReady = await ensureSourceField(env, fileId, sheetId);
    if (srcReady && srcReady.ok) record['来源'] = patrolText((body && body.source) || '上报', 10);

    // 写主台账（飞书表已类型化：日期列=日期型毫秒、照片列=附件，写入前做字段映射变换）
    const outRecord = feishuTypedRecord(record);
    let recs;
    try {
      recs = await adapter.createRecords(env, fileId, sheetId, [outRecord]);
    } catch (e) {
      if (e && e.isRateLimit) return errRes('WPS_RATE_LIMITED', '存储限频，请稍后重试', 429, corsHeaders(origin));
      return errRes('WPS_UPSTREAM_ERROR', '存储写入失败', 502, corsHeaders(origin));
    }
    invalidateMainLedger(fileId, sheetId);   // CF-WPS-43：写后失效缓存，下次查重可见新记录
    // CF-WPS-重复台账：并发提交自愈（写后回查去重）。挂在 waitUntil 上 → 不加提交延迟；
    // 测试环境（无 ctx）退化为直接 await，行为一致。
    {
      const heal = healDuplicatePatrolRecords(adapter, env, fileId, sheetId, values.clientRequestId);
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(heal);
      else await heal;
    }
    const notify = assignInfo
      ? await notifyAssign(env, cfg, {
          assigneeId: assignInfo[TODO_FIELDS.assigneeId],
          assignerName: assignInfo[TODO_FIELDS.assignerName],
          problem: String(record['违章行为'] || record['描述'] || ''),
          town: assignInfo[TODO_FIELDS.town],
          assignedAt: assignInfo[TODO_FIELDS.assignedAt],
        })
      : 'skipped';
    return jsonRes({
      success: true, code: 'OK',
      recordIds: recs.map((r) => (typeof r === 'string' ? r : r && r.id)).filter(Boolean),
      client_request_id: values.clientRequestId,
      employee: { employee_code: employeeCode },
      target: 'production',
      assigned: !!assignInfo,
      notify,
    }, 200, corsHeaders(origin));
  } catch {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

// ---- POST /api/mobile/patrol/attach（把事后拍的照片补挂到已提交记录）----
// 整改后照片是**记录提交之后**才拍的：提交那一刻还拿不到 file_token，
// 只能等拍完 → 上传 → 再 PUT 回同一条记录（飞书 records/:id 局部更新）。
// 归属校验用「备注」里的 巡查人ID，杜绝给别人记录挂照片。
async function handlePatrolAttach(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  try {
    const adapter = getAdapter(env);
    const cfg = await storageConfig(env);

    if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
    const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
    if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

    const target = patrolTarget(env, cfg);
    if (!target) return errRes('PATROL_TARGET_NOT_CONFIGURED', '巡查目标表未配置', 503, corsHeaders(origin));

    const contentLen = Number(request.headers.get('content-length') || '0');
    if (contentLen > PATROL_BODY_LIMIT) return errRes('BODY_TOO_LARGE', `请求体超过上限（${PATROL_BODY_LIMIT} 字节）`, 413, corsHeaders(origin));
    let body;
    try { body = await request.json(); } catch { return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin)); }
    if (!body || typeof body !== 'object') return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin));

    const recordId = patrolText(body.record_id, 64);
    if (!/^[A-Za-z0-9]{8,64}$/.test(recordId)) return errRes('PATROL_FIELD_INVALID', 'record_id 不合法', 400, corsHeaders(origin));

    const kind = patrolText(body.kind, 8) === 'rectify' ? 'rectify' : 'scene';
    const tokens = body.photo_tokens;
    const okTokens = Array.isArray(tokens) && tokens.length >= 1 && tokens.length <= 3
      && tokens.every((t) => typeof t === 'string' && /^[A-Za-z0-9]{10,120}$/.test(t));
    if (!okTokens) return errRes('PATROL_FIELD_INVALID', 'photo_tokens 不合法（1~3 个、来自上传接口）', 400, corsHeaders(origin));

    let hit;
    try { hit = await adapter.getRecord(env, cfg.fileId, target.sheetId, recordId); }
    catch (e) {
      if (e && e.isNotFound) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
      return errRes('WPS_UPSTREAM_ERROR', '巡查记录暂不可用，请稍后再试', 502, corsHeaders(origin));
    }

    // 归属校验：CF-WPS-89 —— 「现场照片」放宽到**可见范围内**的人都能补传
    //   （公司管理 ALL / 经理 DEPT 本人+下级 / 管理员 SELF，与台账可见范围同源）；
    //   以前两种都只允许记录创建者 ⇒「不是我建的记录」根本补不了照片。
    //   额外防误伤：非本人只能「补空」—— 目标列已有照片时拒绝，避免覆盖别人的既有证据。
    // CF-WPS-90：「整改后照片」放宽到**待办接收人（整改人）**。
    //   那张图本来就是整改人拍的，可派发链路上他不是记录创建者（记录是公司管理/经理建的），
    //   于是只能靠 /assign/complete 一次成功 —— 上传失败就没有任何补救路径，照片只能烂在本机。
    //   现在他自己就能补挂（也顺便支持「整改照片拍错了重拍」）。
    if (!hit) return errRes('NOT_FOUND', '记录不存在或无权修改', 404, corsHeaders(origin));
    const col = kind === 'rectify' ? '整改后照片' : '违章照片';
    if (!patrolIsMine(hit.fields, payload.sub)) {
      const assigneeOfRectify = kind === 'rectify' && todoIsMine(hit.fields, payload.sub);
      if (assigneeOfRectify) {
        // 放行：整改人给自己的待办挂整改后照片（下方直接写 col）
      } else if (kind !== 'scene') {
        return errRes('NOT_FOUND', '记录不存在或无权修改', 404, corsHeaders(origin));
      } else {
        let allowed = false;
        try {
          const view = await resolveViewScope(adapter, env, cfg, payload);
          allowed = patrolInScope(hit.fields, view);
        } catch { allowed = false; }   // fail-closed：取不到可见范围就不放行
        if (!allowed) return errRes('NOT_FOUND', '记录不存在或无权修改', 404, corsHeaders(origin));
        const existing = hit.fields && hit.fields[col];
        if (Array.isArray(existing) && existing.length) {
          return errRes('PATROL_FIELD_INVALID', '该记录已有现场照片，只有本人可更换', 409, corsHeaders(origin));
        }
      }
    }

    try {
      await adapter.updateRecord(env, cfg.fileId, target.sheetId, recordId, {
        [col]: [...new Set(tokens)].slice(0, 3).map((t) => ({ file_token: t })),
      });
      invalidateMainLedger(cfg.fileId, target.sheetId);   // CF-WPS-43
    } catch (e) {
      if (e && e.isRateLimit) return errRes('WPS_RATE_LIMITED', '存储限频，请稍后重试', 429, corsHeaders(origin));
      return errRes('WPS_UPSTREAM_ERROR', '照片补挂失败', 502, corsHeaders(origin));
    }
    return jsonRes({
      success: true, code: 'OK',
      record_id: recordId, column: col, count: new Set(tokens).size,
    }, 200, corsHeaders(origin));
  } catch {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

// ---- GET /api/mobile/patrol/records（列表；?id= 详情；仅本人记录）----
function patrolRecordView(rec, full) {
  const f = rec.fields || {};
  // 主台账真实列（2026-09-18 实测）：检查人姓名 / 网格等级 / 片区|班组 / 违章行为 /
  //   违章人员姓名 / 描述 / 备注 / 违章照片 / 整改后照片 …
  // 旧列名（巡查时间/网格/问题类型/问题描述/是否三违/涉及人员）在主台账里**不存在**，
  // 继续按旧名读只会得到一串空字符串 —— 台账页会显示成空白行。
  const note = patrolIdentity(f);
  const behavior = fieldText(f['违章行为']);
  const isVio = !!behavior && behavior !== NO_VIOLATION_TEXT;
  const base = {
    record_id: rec.id,
    inspection_time: note.inspectionTime || msToPatrolTime(f['日期']),
    grid: fieldText(f['片区|班组']),
    problem_type: isVio ? '三违' : '现场正常',
    description: fieldText(f['描述']),
    is_violation: isVio ? '是' : '否',
    created_at: msToPatrolTime(f['日期']),
    // CF-WPS-58：列表也带检查人姓名（详情页要显示「谁查的」）。
    // 只放**姓名**、不放手机号 —— 姓名本就是台账列表的业务信息（台账卡片一直显示网格与
    // 涉及人员），手机号属敏感项，仍只在 full=true（单条详情）时下发。
    checker_name: fieldText(f['检查人姓名']),
    // ⚠️ 三违行为 / 违章人员必须进列表视图：台账页卡片靠这两个字段显示
    //    「违章停车 · 张三」，只放进详情会让列表退化成光秃秃的「三违」。
    violation_desc: isVio ? behavior : '',
    violation_people: fieldText(f['违章人员姓名']),
    // CF-WPS-85：违章人员档案随视图下发 —— 被指派人整改页要显示「性别/年龄/岗位」，
    //   建单时选人的记录三列有值；派发时未选人的记录为空串（前端据此不显示）。
    violation_sex: fieldText(f['性别']),
    violation_age: fieldText(f['年龄']),
    violation_job: fieldText(f['车辆类型|保洁员']),
    // CF-WPS-36 整改待办：列表与详情都带指派信息 ——
    // 公司管理要在台账里看到「派给了谁 / 现在什么状态」，被指派人要知道「谁派给我的」。
    // 不放进视图的话前端拿不到，台账卡片就无法区分「自建」与「上级指派」（测试报告 D2）。
    assignee_id: fieldText(f[TODO_FIELDS.assigneeId]),
    assignee_name: fieldText(f[TODO_FIELDS.assigneeName]),
    todo_town: fieldText(f[TODO_FIELDS.town]),
    todo_status: fieldText(f[TODO_FIELDS.status]),
    assigner_id: fieldText(f[TODO_FIELDS.assignerId]),
    assigner_name: fieldText(f[TODO_FIELDS.assignerName]),
    assigned_at: fieldText(f[TODO_FIELDS.assignedAt]),
    done_at: fieldText(f[TODO_FIELDS.doneAt]),
    todo_note: fieldText(f[TODO_FIELDS.note]),
    // CF-WPS 派发/上报区分：来源列 → source，台账卡片据此显示 派发/上报 标签
    // 历史记录（来源为空）→ 前端回退显示「上报」，符合其业务本质。
    source: fieldText(f['来源']),
    // CF-WPS-89：照片字段也进**列表**视图 —— 台账列表要直接显示缩略图（前端凭 token
    //   经 /api/mobile/photo 取图）。以前只在 full=true（单条详情）下发，列表卡片拿不到
    //   照片、详情也显示「未记录/无」（CF-WPS-88 的前端补拉只是给老 Worker 兜底）。
    //   token 是短字符串、不含 PII；图片本体仍要单独走代理取，不会因此变重。
    photo_count: Array.isArray(f['违章照片']) ? f['违章照片'].length : 0,
    rectify_photo_count: Array.isArray(f['整改后照片']) ? f['整改后照片'].length : 0,
    scene_photo_tokens: photoTokens(f['违章照片']),
    rectify_photo_tokens: photoTokens(f['整改后照片']),
  };
  if (!full) return base;
  return {
    ...base,
    employee_code: note.employeeCode || fieldText(f['employee_code']) || fieldText(f['巡查人员ID']),
    name: fieldText(f['检查人姓名']),
    grid_level: fieldText(f['网格等级']),
    photo_status: (Array.isArray(f['违章照片']) && f['违章照片'].length) ? '已上传' : 'PENDING_EXTERNAL',
    client_request_id: note.clientRequestId || fieldText(f['client_request_id']),
  };
}
// 「本人记录」判定：主台账没有 employee_code 列，只能靠「备注」里的 巡查人ID:<手机号>。
// 姓名不参与判定（重名会串号），手机号才是唯一身份。
function patrolIsMine(fields, sub) {
  const note = patrolIdentity(fields);
  return note.employeeCode === String(sub);
}

/* ---- 巡查台账的可见范围（scope，2026-09-19 用户决策：按组织树放开）----
     公司管理      → ALL  全公司
     乡镇作业中心经理 → DEPT 本人 + 直接/间接下级
     管理员        → SELF 仅本人（与放开前行为完全一致）
   组织关系取自**身份台账**的「直接上级」列（ledgerSubtree 递归，复用 /org/subordinates 同款解析），
   不取主台账 —— 主台账没有「所属单位」列（实际列名见 patrolRecordView 注释）。
   次级判定键是「备注」里的 巡查人ID（手机号），与 patrolIsMine 同源；
   不用姓名判定 —— 花名册有 24 组重名，姓名会串号。
   ⚠️ fail-closed：取不到组织信息（上游抖动／姓名不唯一）时退回 SELF，
      绝不因为一次上游失败就把全公司台账放开。 */
const SCOPE_TTL_MS = 5 * 60 * 1000;
const deptScopeCache = new Map();   // 'DEPT|<姓名>' → { at, phones:Set }

function patrolInScope(fields, view) {
  if (!view || view.scope === 'ALL') return true;
  const code = patrolIdentity(fields).employeeCode;
  return !!code && view.phones.has(String(code));
}

async function resolveViewScope(adapter, env, cfg, payload) {
  const role = String(payload.role || '');
  const mePhone = phoneDigits(payload.sub);
  const selfOnly = { scope: 'SELF', phones: new Set(mePhone ? [mePhone] : []) };
  if (role === '公司管理') return { scope: 'ALL', phones: null };
  if (role !== '经理') return selfOnly;
  const meName = String(payload.name || '').trim();
  if (!meName) return selfOnly;
  const key = 'DEPT|' + meName;
  const hit = deptScopeCache.get(key);
  if (hit && Date.now() - hit.at < SCOPE_TTL_MS) return hit.value;
  let rows;
  try {
    rows = (await adapter.scanRecords(env, cfg.fileId, cfg.ledgerSheetId))
      .map(mapLedgerRecord).filter((r) => r.name);
  } catch {
    return Object.assign({}, selfOnly, { degraded: true });   // fail-closed
  }
  const subtree = ledgerSubtree(rows, meName);
  // null = 台账里姓名不唯一或未登记 → 无法确定下级范围，不放开
  if (!subtree) return Object.assign({}, selfOnly, { degraded: true });
  const phones = new Set(mePhone ? [mePhone] : []);
  for (const r of subtree) if (r.phone) phones.add(r.phone);
  const value = { scope: 'DEPT', phones };
  deptScopeCache.set(key, { at: Date.now(), value });
  return value;
}

// ============================================================================
// CF-WPS-95 —— 隐患排查模块（仅「公司管理 × 安环管理部」账号可用）
// ----------------------------------------------------------------------------
// 数据落独立飞书表「H5隐患排查台账表」（storage/index.js 按表名解析 table_id，
// env FS_HAZARD_TABLE_ID 可覆盖）。与主台账（巡查）完全分离：
//   · 列名不混、统计口径不混、myChecks 等既有列表不含隐患记录；
//   · 角色判定走身份表口径：role=公司管理 且 department=安环管理部
//     （身份表「分级」压过花名册职位，与 ledgerChildren 同一套口径）。
// 幂等：client_request_id 压进「备注」req:<id>，复用主台账同一套
//   findExistingByClientRequestId（备注 contains 检索）。
//   三道防线（CF-WPS-96 补第二道）：
//     ① isolate 缓存 cid→recordId（落库后写入，覆盖重试窗口的 search 索引延迟）；
//     ② **在途表** cid→Promise（create 之前占位）——覆盖「两条并发请求同时穿过
//        预查、各写一条」的双写竞态（自查实测复现过，41 例矩阵已转绿）；
//     ③ 飞书 search 预查（覆盖 isolate 重启 / 换设备重提，best-effort）。
// 照片：走 /api/mobile/upload 的 file_token → 附件列「现场照片」（≤3）。
// 取图：/api/mobile/photo?ft=<file_token>（复用派发图代理）。
// 三条接口（submit/list/detail）都做同一道角色门 —— 显示层隐藏只是体验，
// 权限判定以服务端为准（前端入口隐藏可被改 JS 绕过）。
// ============================================================================

const HAZARD_BODY_LIMIT = 16 * 1024;   // 提交体上限（不含照片二进制，照片走独立上传）
const HAZARD_DESC_MAX = 500;           // 隐患描述长度上限
const HAZARD_LOCATION_MAX = 100;       // 隐患位置长度上限
const HAZARD_PHOTO_MAX = 3;            // 现场照片张数上限
const HAZARD_TIME_MAX = 32;            // 排查时间字符串长度上限
const HAZARD_LIST_LIMIT = 100;         // 我的隐患返回条数上限

// 近实时幂等缓存（与 storage/index.js 的 mainLedgerCache 同思路）：
// 飞书 search 索引有秒级延迟 —— 「提交后立刻重试」的窗口里 search 查不到刚落的记录
// （主台账同款现象，见 CF-WPS-43）。hazard 提交频率低、但重复台账更难清理，
// 故加一层 isolate 内 cid → recordId 缓存（TTL 5min）兜底；search 预查仍保留
// （覆盖 isolate 重启 / 换设备重提的场景，best-effort）。
// ⚠️ 缓存键是 **sub + '|' + cid**，不是裸 cid：cid 由客户端随机生成、跨账号不复用，
// 但加了账号维度后，即使出现极端撞 cid 也只会命中自己的记录，不会把 A 的
// recordId 返给 B（detail 有归属校验兜底，这里双保险）。
const HAZARD_CID_TTL_MS = 5 * 60 * 1000;
let hazardCidCache = new Map(); // sub|cid -> { recordId, at }
// 同一 cid 的**并发**提交合并（与上面的缓存互补，覆盖「预查都没查到 → 各写一条」）：
// 缓存只在记录落库后才写入，两条并发请求会在写入前双双穿过预查。
// 在途表在 create 之前就占位，后到的那条直接共享前一条的落库结果。
const HAZARD_INFLIGHT_TTL_MS = 30 * 1000;   // 在途任务超时（异常挂起不留残影）
let hazardCidInflight = new Map(); // sub|cid -> { task, at }
const hazardCidKey = (sub, cid) => String(sub || '') + '|' + String(cid || '');
function hazardInflightGet(sub, cid) {
  const hit = hazardCidInflight.get(hazardCidKey(sub, cid));
  if (!hit) return null;
  if (Date.now() - hit.at > HAZARD_INFLIGHT_TTL_MS) { hazardCidInflight.delete(hazardCidKey(sub, cid)); return null; }
  return hit.task;
}
function hazardInflightPut(sub, cid, task) {
  if (!cid || !task) return;
  hazardCidInflight.set(hazardCidKey(sub, cid), { task, at: Date.now() });
  if (hazardCidInflight.size > 100) {   // 体积控制：先清过期，仍满则清半（宁可多重，不锁死）
    [...hazardCidInflight.entries()].forEach(([k, v]) => {
      if (Date.now() - v.at > HAZARD_INFLIGHT_TTL_MS) hazardCidInflight.delete(k);
    });
    if (hazardCidInflight.size > 100) {
      [...hazardCidInflight.keys()].slice(0, 50).forEach((k) => hazardCidInflight.delete(k));
    }
  }
}
function hazardCidGet(sub, cid) {
  const hit = hazardCidCache.get(hazardCidKey(sub, cid));
  if (!hit) return null;
  if (Date.now() - hit.at > HAZARD_CID_TTL_MS) { hazardCidCache.delete(hazardCidKey(sub, cid)); return null; }
  return hit.recordId;
}
function hazardCidPut(sub, cid, recordId) {
  if (!cid || !recordId) return;
  hazardCidCache.set(hazardCidKey(sub, cid), { recordId, at: Date.now() });
  if (hazardCidCache.size > 200) {   // 简单体积控制（安环部账号量级远小于此）
    const old = [...hazardCidCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100);
    old.forEach(([k]) => hazardCidCache.delete(k));
  }
}

// 类别 / 级别：**服务端权威清单**（前端硬编码同一份；新增类别两边必须同步改，
// 否则前端能选、后端拒绝，形成静默失败 —— 与 patrol 三违库同纪律）。
const HAZARD_CATEGORIES = ['设备设施', '消防安全', '用电安全', '危化品', '作业安全', '高处作业', '交通运输', '公共设施', '环境卫生', '违规操作', '其他'];
const HAZARD_LEVELS = ['一般隐患', '重大隐患'];
const HAZARD_STATUS_PENDING = '待整改';

/* ---- CF-WPS-100 隐患整改闭环状态机 --------------------------------------
     待整改 ──整改人提交（照片+说明）──▶ 待验收 ──安环部通过──▶ 已闭环（唯一终点）
       ▲                                  │
       └──────────安环部打回────────────────┘（打回次数 +1，回炉重改）
   存量历史数据「处理状态」可能是空串 / 整改中 / 已整改：读取与写入都按「待整改」
   兼容（见 mapHazardRecord 的 statusNorm），不阻断新流程。 */
const HAZARD_STATUS_REVIEW = '待验收';
const HAZARD_STATUS_CLOSED = '已闭环';
const HAZARD_DEADLINE_MAX_DAYS = 365;    // 整改期限最长一年
const HAZARD_RECT_NOTE_MAX = 500;        // 整改说明长度上限
const HAZARD_REVIEW_COMMENT_MAX = 200;   // 验收意见长度上限
const HAZARD_TODO_LIMIT = 100;           // 「派给我的隐患」返回条数上限

// 闭环字段列名。2026-10-16 已由 _scratch/hazard-fields-extend.mjs 在两个 base 幂等建好；
// Worker 侧写前再走一遍 ensureHazardRectFields 兜底 —— 换 base / 手工删列后写入不会
// 直接 1254045（列缺失时尽力补建，仍缺则上游报错转 502，绝不静默丢字段）。
const HAZARD_FIELDS = {
  rectifierId: '整改人ID',
  rectifierName: '整改人姓名',
  rectifierDept: '整改人部门',
  assignerId: '指派人ID',
  assignerName: '指派人姓名',
  assignedAt: '指派时间',
  deadline: '整改期限',
  rectifyNote: '整改说明',
  rectifyAt: '整改提交时间',
  rectifyPhotos: '整改后照片',
  reviewer: '验收人',
  reviewAt: '验收时间',
  reviewResult: '验收结论',
  closedAt: '闭环时间',
  rejectCount: '打回次数',
};
// 「整改后照片」是附件列（type 17），其余均为文本列（type 1）
const HAZARD_RECT_FIELD_TYPES = { [HAZARD_FIELDS.rectifyPhotos]: 17 };

// 幂等补建闭环列（与 ensureTodoFields 同口径：只查一次建一次并缓存，失败不抛）
let hazardRectFieldsReady = null;
async function ensureHazardRectFields(env, fileId, tableId) {
  if (hazardRectFieldsReady) return hazardRectFieldsReady;
  const adapter = getAdapter(env);
  try {
    const existing = new Set((await adapter.listFields(env, fileId, tableId)).map((f) => f.fieldName));
    const missing = Object.values(HAZARD_FIELDS).filter((n) => !existing.has(n));
    for (const n of missing) {
      try { await adapter.ensureField(env, fileId, tableId, n, HAZARD_RECT_FIELD_TYPES[n] || 1); }
      catch (e) { console.warn('[hazard-rect] ensureField failed: ' + n + ' ' + (e && e.fsMsg)); }
    }
    hazardRectFieldsReady = { ok: true };
  } catch (e) {
    console.warn('[hazard-rect] listFields failed: ' + (e && e.message));
    hazardRectFieldsReady = { ok: false };
  }
  return hazardRectFieldsReady;
}

// 东八区「今天」的 YYYY-MM-DD（与 todoNowLocal 同一套 +8h 口径，Worker 时钟是 UTC）
function cnToday() {
  const cn = new Date(Date.now() + 8 * 3600 * 1000), p = (n) => String(n).padStart(2, '0');
  return cn.getUTCFullYear() + '-' + p(cn.getUTCMonth() + 1) + '-' + p(cn.getUTCDate());
}
// 整改期限：YYYY-MM-DD、真实日期、不早于今天、不超过一年。
// 返回 { ok, msg }：「格式/假日期」与「过期/超长」分开报错，用户才知道该调什么。
function hazardDeadlineCheck(v) {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, msg: '整改期限格式应为 YYYY-MM-DD' };
  const [Y, M, D] = s.split('-').map(Number);
  const t = Date.UTC(Y, M - 1, D);
  if (new Date(t).getUTCDate() !== D) return { ok: false, msg: '整改期限不是有效日期' };
  const todayMs = Date.parse(cnToday() + 'T00:00:00Z');
  if (t < todayMs) return { ok: false, msg: '整改期限不能早于今天' };
  if (t > todayMs + HAZARD_DEADLINE_MAX_DAYS * 86400000) {
    return { ok: false, msg: `整改期限不能超过 ${HAZARD_DEADLINE_MAX_DAYS} 天` };
  }
  return { ok: true };
}
// 存量状态归一：空串 / 整改中 / 已整改 一律视作「待整改」（老数据不丢、不卡流程）
function hazardStatusNorm(s) {
  const v = String(s || '').trim();
  if (v === HAZARD_STATUS_REVIEW) return HAZARD_STATUS_REVIEW;
  if (v === HAZARD_STATUS_CLOSED) return HAZARD_STATUS_CLOSED;
  return HAZARD_STATUS_PENDING;
}
function hazardCountNum(v) {
  const n = Number(fieldText(v).trim());
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
// 逾期派生：只在「待整改」且期限已过时算逾期（待验收/已闭环都不算 —— 活已干完）
function hazardOverdue(status, deadline) {
  const d = String(deadline || '').trim();
  return status === HAZARD_STATUS_PENDING && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < cnToday();
}

// 排查时间格式 "YYYY-MM-DD HH:MM"。
// ⚠️ 两个坑（CF-WPS-96 都实测踩过）：
//  ① 不能直接 new Date('YYYY-MM-DDTHH:MM') 解析 —— ES2020 起无时区 ISO 串按
//     **本地时区**解释，而 Worker 时钟是 UTC，两边一对不上就会把正常填报判非法；
//  ② 未来时间容差必须覆盖时区偏移：前端传的是手机本地 wall-clock，UTC+8 用户
//     填「现在」按 UTC 解析后天然超前 8 小时，全球最大时区 +14h，再留余量给钟漂。
// 返回 { ok, msg }：「格式/假日期」与「未来时间」分开报错，用户才知道该调什么。
const HAZARD_TIME_FUTURE_SKEW_MS = 24 * 3600 * 1000;
function hazardTimeCheck(v) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) {
    return { ok: false, msg: '排查时间格式应为 YYYY-MM-DD HH:MM' };
  }
  const [ymd, hm] = String(v).split(' ');
  const [Y, M, D] = ymd.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  if (M < 1 || M > 12 || D < 1 || D > 31 || h > 23 || mi > 59) {
    return { ok: false, msg: '排查时间格式应为 YYYY-MM-DD HH:MM' };
  }
  const t = Date.UTC(Y, M - 1, D, h, mi);
  if (new Date(t).getUTCDate() !== D) {   // 2 月 30 日 / 4 月 31 日会进位 → 拒
    return { ok: false, msg: '排查时间格式应为 YYYY-MM-DD HH:MM' };
  }
  if (t < Date.UTC(2020, 0, 1)) return { ok: false, msg: '排查时间不能早于 2020 年' };
  if (t > Date.now() + HAZARD_TIME_FUTURE_SKEW_MS) {
    return { ok: false, msg: '排查时间晚于当前时间，请检查手机时间设置' };
  }
  return { ok: true };
}
function hazardTimeValid(v) { return hazardTimeCheck(v).ok; }

// 角色门：仅「公司管理 × 安环管理部」。返回 null = 通过。
function hazardGate(env, payload, origin) {
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
  const roleOk = String((payload && payload.role) || '').trim() === '公司管理';
  const deptOk = String((payload && payload.department) || '').trim() === '安环管理部';
  if (!roleOk || !deptOk) {
    return errRes('FORBIDDEN_NOT_HAZARD_DEPT', '隐患排查功能仅对安环管理部账号开放', 403, corsHeaders(origin));
  }
  return null;
}

// 隐患编号：YH + yyyymmddHHmmss + 4 位随机（幂等由 client_request_id 兜底，
// 编号仅作展示与人工检索用）
function newHazardNo() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return 'YH' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
    + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
    + String(Math.floor(1000 + Math.random() * 9000));
}

// 附件列 file_token 提取（飞书附件列 = [{file_token, name, ...}]，兼容已扁平化的字符串）
// col 默认「现场照片」；CF-WPS-100 起「整改后照片」同一函数复用。
function hazardPhotoTokens(fields, col) {
  const raw = fields && fields[col || '现场照片'];
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const a of raw) {
    if (typeof a === 'string' && a) out.push(a);
    else if (a && typeof a === 'object' && typeof a.file_token === 'string' && a.file_token) out.push(a.file_token);
  }
  return out;
}

// 飞书记录 → 前端隐患对象（list/detail 共用；附件列转 file_tokens 数组）
function mapHazardRecord(rec) {
  const f = rec.fields || {};
  const status = hazardStatusNorm(fieldText(f['处理状态']));
  const deadline = fieldText(f[HAZARD_FIELDS.deadline]).trim();
  return {
    recordId: rec.id,
    hazardNo: fieldText(f['隐患编号']).trim(),
    finderId: fieldText(f['排查人ID']).trim(),
    finderName: fieldText(f['排查人姓名']).trim(),
    finderDept: fieldText(f['排查人部门']).trim(),
    finderPosition: fieldText(f['排查人职位']).trim(),
    findTime: fieldText(f['排查时间']).trim(),
    category: fieldText(f['隐患类别']).trim(),
    level: fieldText(f['隐患级别']).trim(),
    location: fieldText(f['隐患位置']).trim(),
    description: fieldText(f['隐患描述']).trim(),
    latitude: fieldText(f['纬度']).trim(),
    longitude: fieldText(f['经度']).trim(),
    status,
    note: fieldText(f['备注']).trim(),
    photoTokens: hazardPhotoTokens(f),
    // ---- CF-WPS-100 整改闭环字段 ----
    rectifierId: fieldText(f[HAZARD_FIELDS.rectifierId]).trim(),
    rectifierName: fieldText(f[HAZARD_FIELDS.rectifierName]).trim(),
    rectifierDept: fieldText(f[HAZARD_FIELDS.rectifierDept]).trim(),
    assignerId: fieldText(f[HAZARD_FIELDS.assignerId]).trim(),
    assignerName: fieldText(f[HAZARD_FIELDS.assignerName]).trim(),
    assignedAt: fieldText(f[HAZARD_FIELDS.assignedAt]).trim(),
    deadline,
    rectifyNote: fieldText(f[HAZARD_FIELDS.rectifyNote]).trim(),
    rectifySubmittedAt: fieldText(f[HAZARD_FIELDS.rectifyAt]).trim(),
    rectifyPhotoTokens: hazardPhotoTokens(f, HAZARD_FIELDS.rectifyPhotos),
    reviewer: fieldText(f[HAZARD_FIELDS.reviewer]).trim(),
    reviewAt: fieldText(f[HAZARD_FIELDS.reviewAt]).trim(),
    reviewResult: fieldText(f[HAZARD_FIELDS.reviewResult]).trim(),
    closedAt: fieldText(f[HAZARD_FIELDS.closedAt]).trim(),
    rejectCount: hazardCountNum(f[HAZARD_FIELDS.rejectCount]),
    overdue: hazardOverdue(status, deadline),
  };
}

// 隐患提交响应统一出口（leader / follower / 落库失败共用，保证形状一致）
function hazardSubmitResponse(done, cid, dedup, origin) {
  if (done && done.error) return done.error;
  return jsonRes({
    success: true, code: 'OK', deduplicated: !!dedup,
    recordIds: (done && done.recordIds) || [],
    hazardNo: (done && done.hazardNo) || '',
    client_request_id: cid || '',
  }, 200, corsHeaders(origin));
}

// ---- POST /api/mobile/hazard/submit：登记一条隐患 ----
async function handleHazardSubmit(request, env, ctx) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  try {
    const adapter = getAdapter(env);
    const cfg = await storageConfig(env);
    const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
    const denied = hazardGate(env, payload, origin);
    if (denied) return denied;

    const tableId = String((cfg && cfg.hazardSheetId) || '').trim();
    if (!tableId) return errRes('HAZARD_TARGET_NOT_CONFIGURED', '隐患排查表未配置', 503, corsHeaders(origin));

    const contentLen = Number(request.headers.get('content-length') || '0');
    if (contentLen > HAZARD_BODY_LIMIT) return errRes('BODY_TOO_LARGE', `请求体超过上限（${HAZARD_BODY_LIMIT} 字节）`, 413, corsHeaders(origin));
    let body;
    try { body = await request.json(); } catch { return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin)); }
    if (!body || typeof body !== 'object') return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin));

    // 字段校验（category/level 必须命中服务端权威清单，禁止自造项污染统计）
    const category = patrolText(body.category, 20);
    if (!HAZARD_CATEGORIES.includes(category)) {
      return errRes('HAZARD_FIELD_INVALID', `隐患类别不合法：${category || '(空)'}`, 400, corsHeaders(origin));
    }
    const level = patrolText(body.level, 20);
    if (!HAZARD_LEVELS.includes(level)) {
      return errRes('HAZARD_FIELD_INVALID', `隐患级别不合法：${level || '(空)'}`, 400, corsHeaders(origin));
    }
    const description = patrolText(body.description, HAZARD_DESC_MAX);
    if (!description) return errRes('HAZARD_FIELD_INVALID', '隐患描述不能为空', 400, corsHeaders(origin));
    const location = patrolText(body.location, HAZARD_LOCATION_MAX);
    let findTime = patrolText(body.find_time, HAZARD_TIME_MAX);
    if (!findTime) {
      const d = new Date(), p = (n) => String(n).padStart(2, '0');
      findTime = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    const timeChk = hazardTimeCheck(findTime);
    if (!timeChk.ok) return errRes('HAZARD_FIELD_INVALID', timeChk.msg, 400, corsHeaders(origin));

    // 经纬度：非法值整段丢弃（写空绝不写错坐标）
    const geoNum = (v, lo, hi) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= lo && n <= hi ? String(n) : '';
    };
    const lat = geoNum(body.latitude, -90, 90);
    const lng = geoNum(body.longitude, -180, 180);

    // 照片（可选，≤3）：file_token 必须来自 /api/mobile/upload
    let photoTokens = [];
    if (body.photo_tokens != null) {
      const ok = Array.isArray(body.photo_tokens) && body.photo_tokens.length <= HAZARD_PHOTO_MAX
        && body.photo_tokens.every((t) => typeof t === 'string' && /^[A-Za-z0-9]{10,120}$/.test(t));
      if (!ok) return errRes('HAZARD_FIELD_INVALID', `photo_tokens 不合法（≤${HAZARD_PHOTO_MAX} 个、来自上传接口）`, 400, corsHeaders(origin));
      photoTokens = [...new Set(body.photo_tokens)];
    }

    const cid = patrolText(body.client_request_id, 64);
    if (cid && !/^[A-Za-z0-9_-]{8,64}$/.test(cid)) {
      return errRes('HAZARD_FIELD_INVALID', 'client_request_id 不合法（8~64 位字母数字_-）', 400, corsHeaders(origin));
    }

    // 幂等预查：先查本 isolate 缓存（近实时兜底），再查飞书 search（覆盖重启/换设备）
    if (cid) {
      const cached = hazardCidGet(payload.sub, cid);
      if (cached) {
        return jsonRes({
          success: true, code: 'OK', deduplicated: true,
          recordIds: [cached],
          client_request_id: cid,
        }, 200, corsHeaders(origin));
      }
      const existing = await findExistingByClientRequestId(adapter, env, cfg.fileId, tableId, [cid]);
      if (existing) {
        return jsonRes({
          success: true, code: 'OK', deduplicated: true,
          recordIds: existing,
          client_request_id: cid,
        }, 200, corsHeaders(origin));
      }
      // 并发合并：弱网重试 / 连点两下提交时，两条请求会**同时**穿过上面的预查
      //（都查不到），然后各写一条 ⇒「提交一次落两条」。同一 cid 的后到请求
      // 直接共享先到那条的落库结果（recordIds 相同），不再建记录。
      const pending = hazardInflightGet(payload.sub, cid);
      if (pending) {
        const done = await pending;
        return hazardSubmitResponse(done, cid, true, origin);
      }
    }

    // record 全部服务端定值：身份一律取 Session，前端传入的一律忽略
    const record = {
      '隐患编号': newHazardNo(),
      '排查人ID': String(payload.sub || ''),
      '排查人姓名': patrolText(payload.name, 40),
      '排查人部门': patrolText(payload.department, 40),
      '排查人职位': patrolText(payload.position, 40),
      '排查时间': findTime,
      '隐患类别': category,
      '隐患级别': level,
      '隐患位置': location,
      '隐患描述': description,
      '处理状态': HAZARD_STATUS_PENDING,
      '备注': cid ? `req:${cid}` : '',
    };
    if (lat) record['纬度'] = lat;
    if (lng) record['经度'] = lng;
    if (photoTokens.length) record['现场照片'] = photoTokens.map((t) => ({ file_token: t }));

    // 落库（有 cid 时登记在途表，供并发同 cid 请求共享结果）
    const runCreate = async () => {
      let recs;
      try {
        recs = await adapter.createRecords(env, cfg.fileId, tableId, [record]);
      } catch (e) {
        if (e && e.isRateLimit) {
          return { error: errRes('WPS_RATE_LIMITED', '存储限频，请稍后重试', 429, corsHeaders(origin)) };
        }
        return { error: errRes('WPS_UPSTREAM_ERROR', '存储写入失败', 502, corsHeaders(origin)) };
      }
      const recordIds = (recs || []).map((r) => (typeof r === 'string' ? r : r && r.id)).filter(Boolean);
      if (cid && recordIds.length) hazardCidPut(payload.sub, cid, recordIds[0]);   // 近实时幂等缓存
      return { recordIds, hazardNo: record['隐患编号'] };
    };
    if (cid) {
      const task = runCreate();
      hazardInflightPut(payload.sub, cid, task);
      try {
        const done = await task;
        return hazardSubmitResponse(done, cid, false, origin);
      } finally {
        hazardCidInflight.delete(hazardCidKey(payload.sub, cid));   // 失败必须能重试：不留在途残影
      }
    }
    const done = await runCreate();
    return hazardSubmitResponse(done, cid, false, origin);
  } catch {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

// ---- GET /api/mobile/hazard/list：我的隐患（按排查时间倒序）----
// scope=mine（默认）：仅本人登记的（安环部个人视角）
// scope=all：全部记录（安环部部门视角，指派/验收管理用）。
//   ⚠️ 该参数不给跨权限放大：hazardGate 已保证调用者必是「公司管理 × 安环管理部」，
//      全公司隐患对本部门本就该可见；非安环部账号连门都进不来。
async function handleHazardList(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  try {
    const adapter = getAdapter(env);
    const cfg = await storageConfig(env);
    const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
    const denied = hazardGate(env, payload, origin);
    if (denied) return denied;

    const tableId = String((cfg && cfg.hazardSheetId) || '').trim();
    if (!tableId) return errRes('HAZARD_TARGET_NOT_CONFIGURED', '隐患排查表未配置', 503, corsHeaders(origin));

    const scope = String(new URL(request.url).searchParams.get('scope') || 'mine').trim();

    // ⚠️ 不用 searchRecords(filter)：飞书 filter search 走**索引**，新建记录有分钟级延迟
    // （2026-10-16 实测：15:28 提交 → 15:31 查不到 → ~15:33 才可见）→「提交后回列表看不到
    // 自己刚登记的隐患」，用户会以为丢了。隐患登记量极小（安环管理部数人），全量 scan +
    // 本地按 排查人ID 过滤：一次往返、无索引延迟。detail 走 getRecord（O(1)，本就不受影响）。
    let rows;
    try {
      rows = await adapter.scanRecords(env, cfg.fileId, tableId, 3);   // 500/页 × 3 = 1500 条上限
    } catch {
      return errRes('WPS_UPSTREAM_ERROR', '隐患列表暂不可用，请稍后再试', 502, corsHeaders(origin));
    }
    const mine = scope === 'all' ? rows : rows.filter((r) => fieldText((r.fields || {})['排查人ID']).trim() === String(payload.sub || ''));
    const items = mine.map(mapHazardRecord)
      .sort((a, b) => String(b.findTime).localeCompare(String(a.findTime)))
      .slice(0, HAZARD_LIST_LIMIT);
    return jsonRes({ success: true, code: 'OK', items, total: items.length }, 200, corsHeaders(origin));
  } catch {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

// ---- GET /api/mobile/hazard/detail?id=<recordId>：单条详情 ----
// CF-WPS-100 起**不再整门 hazardGate**：整改人（全公司任选的结果，任何角色）也要能
// 打开自己名下的隐患看「到底改什么」。权限收敛靠下面三选一归属校验
//（登记人 / 整改人 / 安环管理部），比「整个部门都能看」更严也更准。
async function handleHazardDetail(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  try {
    const adapter = getAdapter(env);
    const cfg = await storageConfig(env);
    const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
    if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
    if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

    const tableId = String((cfg && cfg.hazardSheetId) || '').trim();
    if (!tableId) return errRes('HAZARD_TARGET_NOT_CONFIGURED', '隐患排查表未配置', 503, corsHeaders(origin));

    const url = new URL(request.url);
    const recordId = String(url.searchParams.get('id') || '').trim();
    if (!/^[A-Za-z0-9]{10,64}$/.test(recordId)) return errRes('BAD_REQUEST', '缺少或非法的记录 id', 400, corsHeaders(origin));

    let hit;
    try {
      hit = await adapter.getRecord(env, cfg.fileId, tableId, recordId);
    } catch (e) {
      if (e && e.isNotFound) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
      return errRes('WPS_UPSTREAM_ERROR', '隐患详情暂不可用，请稍后再试', 502, corsHeaders(origin));
    }
    if (!hit) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
    const item = mapHazardRecord(hit);
    // 归属校验（CF-WPS-100 起三种人可见）：
    //   ① 登记人本人；② 整改人（要看到底改什么）；③ 安环管理部（指派/验收需要）。
    // 其余账号一律拒 —— 隐患内容含位置坐标，不是全公司可见的数据。
    const isHazardDept = String((payload && payload.role) || '').trim() === '公司管理'
      && String((payload && payload.department) || '').trim() === '安环管理部';
    const me = String(payload.sub || '');
    if (item.finderId !== me && item.rectifierId !== me && !isHazardDept) {
      return errRes('FORBIDDEN', '只能查看本人登记或指派的隐患', 403, corsHeaders(origin));
    }
    return jsonRes({ success: true, code: 'OK', item }, 200, corsHeaders(origin));
  } catch {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

/* ============================================================================
   CF-WPS-100 隐患整改闭环（四接口）------------------------------------------------
   业务口径（2026-10-16 用户确认）：
     · 指派对象 = 全公司任选（花名册搜索，不受组织层级限制）；
     · 全部隐患都要安环管理部验收通过才闭环（无一般/重大分级豁免）；
     · 打回 = 回「待整改」重改，「打回次数」累加留痕。
   与巡查派发机器（TODO_FIELDS / patrolTarget 硬编码主台账）**完全独立**：
   隐患闭环只读写 hazard 表自己的列，不动巡查主链一根汗毛。
   ============================================================================ */

// ---- GET /api/mobile/hazard/assignable?q=&limit=：隐患整改人候选（全公司账号）----
// 与巡查派发的选人（组织层级收敛）不同：用户 2026-10-16 确认「全公司任选」——
// 不按乡镇/下级收敛，但限定在**有 App 账号的人**（身份表，实测 72 人）：
// 花名册 1372 人里绝大多数没账号，派给他们没人能登录看到待办（死单）。
// 公司管理分级账号不当整改人（CF-WPS-58 口径），直接从候选里剔除。
async function handleHazardAssignable(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  try {
    const adapter = getAdapter(env);
    const cfg = await storageConfig(env);
    const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
    const denied = hazardGate(env, payload, origin);
    if (denied) return denied;

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().slice(0, 32).toLowerCase();
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100) || 100, 1), 200);

    let idRows;
    try { idRows = await getIdentityRows(adapter, env, cfg.fileId, cfg.ledgerSheetId); }
    catch { return errRes('WPS_UPSTREAM_ERROR', '身份表暂不可用，请稍后再试', 502, corsHeaders(origin)); }
    const items = idRows.map(mapLedgerRecord)
      .filter((r) => r.name && r.phone && !isCompanyGrade(r))
      .map((r) => ({ code: r.phone, name: r.name, dept: r.department, position: r.position }))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.code.includes(q)
        || (r.dept || '').toLowerCase().includes(q) || (r.position || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
      .slice(0, limit);
    return jsonRes({ success: true, code: 'OK', items, total: items.length }, 200, corsHeaders(origin));
  } catch {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

// ---- POST /api/mobile/hazard/assign：指派隐患整改（安环部 → 全公司任选）----
// body: { record_id, assignee_id, deadline }（assignee_id = 手机号或工号）
async function handleHazardAssign(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  try {
    const adapter = getAdapter(env);
    const cfg = await storageConfig(env);
    const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
    const denied = hazardGate(env, payload, origin);
    if (denied) return denied;

    const tableId = String((cfg && cfg.hazardSheetId) || '').trim();
    if (!tableId) return errRes('HAZARD_TARGET_NOT_CONFIGURED', '隐患排查表未配置', 503, corsHeaders(origin));

    const contentLen = Number(request.headers.get('content-length') || '0');
    if (contentLen > HAZARD_BODY_LIMIT) return errRes('BODY_TOO_LARGE', `请求体超过上限（${HAZARD_BODY_LIMIT} 字节）`, 413, corsHeaders(origin));
    let body;
    try { body = await request.json(); } catch { return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin)); }
    if (!body || typeof body !== 'object') return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin));

    const recordId = patrolText(body.record_id, 64);
    if (!/^[A-Za-z0-9]{10,64}$/.test(recordId)) return errRes('HAZARD_FIELD_INVALID', 'record_id 不合法', 400, corsHeaders(origin));
    const assigneeId = String(body.assignee_id || '').trim();
    if (!/^\d{6,20}$/.test(assigneeId)) {
      return errRes('HAZARD_FIELD_INVALID', 'assignee_id 须为手机号（6~20 位数字）', 400, corsHeaders(origin));
    }
    const dChk = hazardDeadlineCheck(body.deadline);
    if (!dChk.ok) return errRes('HAZARD_FIELD_INVALID', dChk.msg, 400, corsHeaders(origin));
    const deadline = String(body.deadline).trim();

    let hit;
    try {
      hit = await adapter.getRecord(env, cfg.fileId, tableId, recordId);
    } catch (e) {
      if (e && e.isNotFound) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
      return errRes('WPS_UPSTREAM_ERROR', '隐患记录暂不可用，请稍后再试', 502, corsHeaders(origin));
    }
    if (!hit) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
    const item = mapHazardRecord(hit);
    // 状态机守卫：只有「待整改（含空串存量）」能指派；待验收/已闭环都不能改派
    if (item.status === HAZARD_STATUS_REVIEW) {
      return errRes('HAZARD_STATUS_INVALID', '整改已提交、正在等待验收，不能改派', 409, corsHeaders(origin));
    }
    if (item.status === HAZARD_STATUS_CLOSED) {
      return errRes('HAZARD_STATUS_INVALID', '该隐患已闭环，不能指派', 409, corsHeaders(origin));
    }

    // 整改人必须是**有 App 账号的人**（身份表），且全公司任选（不按组织层级收敛，
    // 2026-10-16 用户确认）。2026-10-16 实测：身份表 72 个账号 / 花名册 1372 人 ——
    // 花名册里绝大多数人没有账号，派给他们等于死单（没人能登录看到待办）。
    let idRows;
    try { idRows = await getIdentityRows(adapter, env, cfg.fileId, cfg.ledgerSheetId); }
    catch { return errRes('WPS_UPSTREAM_ERROR', '身份表暂不可用，请稍后再试', 502, corsHeaders(origin)); }
    const digits = assigneeId.replace(/\D+/g, '');
    const personRow = idRows.find((r) => digits && phoneDigits((r.fields || {})['手机号']) === digits);
    if (!personRow) {
      return errRes('HAZARD_FIELD_INVALID', '整改人不是有效账号，请从候选人列表选择', 400, corsHeaders(origin));
    }
    const person = mapLedgerRecord(personRow);
    if (!person.name || !person.phone) {
      return errRes('HAZARD_FIELD_INVALID', '整改人账号信息不完整，请重新选择', 400, corsHeaders(origin));
    }
    // CF-WPS-58 口径：身份表「分级=公司管理」压过花名册职位，公司管理账号不当整改人
    if (isCompanyGrade(person)) {
      return errRes('FORBIDDEN', '公司管理账号不能作为整改人', 403, corsHeaders(origin));
    }

    const rectifierId = person.phone;
    await ensureHazardRectFields(env, cfg.fileId, tableId);
    const fields = {
      [HAZARD_FIELDS.rectifierId]: rectifierId,
      [HAZARD_FIELDS.rectifierName]: patrolText(person.name, 40),
      [HAZARD_FIELDS.rectifierDept]: patrolText(person.department || '', 40),
      [HAZARD_FIELDS.assignerId]: String(payload.sub || ''),
      [HAZARD_FIELDS.assignerName]: patrolText(payload.name, 40),
      [HAZARD_FIELDS.assignedAt]: todoNowLocal(),
      [HAZARD_FIELDS.deadline]: deadline,
      '处理状态': HAZARD_STATUS_PENDING,
    };
    // 改派（重指）时清掉上一轮整改产物，避免验收看到前任留下的照片/说明
    if (item.rectifierId) {
      fields[HAZARD_FIELDS.rectifyNote] = '';
      fields[HAZARD_FIELDS.rectifyAt] = '';
      if (item.rectifyPhotoTokens.length) fields[HAZARD_FIELDS.rectifyPhotos] = [];
    }
    try {
      await adapter.updateRecord(env, cfg.fileId, tableId, recordId, fields);
    } catch (e) {
      if (e && e.isRateLimit) return errRes('WPS_RATE_LIMIT', '存储限频，请稍后重试', 429, corsHeaders(origin));
      return errRes('WPS_UPSTREAM_ERROR', '指派写入失败', 502, corsHeaders(origin));
    }

    const notify = await notifyHazardAssign(env, cfg, {
      assigneeId: rectifierId,
      assignerName: fields[HAZARD_FIELDS.assignerName],
      problem: item.description,
      town: item.location,
      deadline,
    });

    // 回执即前端列表刷新依据：就地合并最新值，前端不必再拉一次 detail
    const out = {
      ...item,
      status: HAZARD_STATUS_PENDING,
      overdue: false,
      rectifierId,
      rectifierName: fields[HAZARD_FIELDS.rectifierName],
      rectifierDept: fields[HAZARD_FIELDS.rectifierDept],
      assignerId: fields[HAZARD_FIELDS.assignerId],
      assignerName: fields[HAZARD_FIELDS.assignerName],
      assignedAt: fields[HAZARD_FIELDS.assignedAt],
      deadline,
    };
    if (item.rectifierId) {
      out.rectifyNote = '';
      out.rectifySubmittedAt = '';
      out.rectifyPhotoTokens = [];
    }
    return jsonRes({ success: true, code: 'OK', item: out, notify }, 200, corsHeaders(origin));
  } catch {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

// ---- GET /api/mobile/hazard/todos：派给我的隐患待办（任何登录账号）----
// 整改人不限角色（全公司任选的结果），所以这里**不走 hazardGate**，只校验登录态。
async function handleHazardTodos(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  try {
    const adapter = getAdapter(env);
    const cfg = await storageConfig(env);
    const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
    if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

    const tableId = String((cfg && cfg.hazardSheetId) || '').trim();
    if (!tableId) return errRes('HAZARD_TARGET_NOT_CONFIGURED', '隐患排查表未配置', 503, corsHeaders(origin));

    // 与 hazard/list 同口径：scan 全量 + 本地过滤（search 索引延迟会让刚指派的待办看不见）
    let rows;
    try {
      rows = await adapter.scanRecords(env, cfg.fileId, tableId, 3);
    } catch {
      return errRes('WPS_UPSTREAM_ERROR', '隐患待办暂不可用，请稍后再试', 502, corsHeaders(origin));
    }
    const me = String(payload.sub || '');
    const items = rows
      .filter((r) => fieldText((r.fields || {})[HAZARD_FIELDS.rectifierId]).trim() === me)
      .map(mapHazardRecord)
      .filter((x) => x.status === HAZARD_STATUS_PENDING || x.status === HAZARD_STATUS_REVIEW)
      .sort((a, b) => String(b.assignedAt).localeCompare(String(a.assignedAt)))
      .slice(0, HAZARD_TODO_LIMIT);
    return jsonRes({ success: true, code: 'OK', items, total: items.length }, 200, corsHeaders(origin));
  } catch {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

// ---- POST /api/mobile/hazard/rectify：整改人提交整改（照片 + 说明 → 待验收）----
// body: { record_id, note?, photo_tokens? }
async function handleHazardRectify(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  try {
    const adapter = getAdapter(env);
    const cfg = await storageConfig(env);
    const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
    if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

    const tableId = String((cfg && cfg.hazardSheetId) || '').trim();
    if (!tableId) return errRes('HAZARD_TARGET_NOT_CONFIGURED', '隐患排查表未配置', 503, corsHeaders(origin));

    const contentLen = Number(request.headers.get('content-length') || '0');
    if (contentLen > HAZARD_BODY_LIMIT) return errRes('BODY_TOO_LARGE', `请求体超过上限（${HAZARD_BODY_LIMIT} 字节）`, 413, corsHeaders(origin));
    let body;
    try { body = await request.json(); } catch { return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin)); }
    if (!body || typeof body !== 'object') return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin));

    const recordId = patrolText(body.record_id, 64);
    if (!/^[A-Za-z0-9]{10,64}$/.test(recordId)) return errRes('HAZARD_FIELD_INVALID', 'record_id 不合法', 400, corsHeaders(origin));
    const note = patrolText(body.note, HAZARD_RECT_NOTE_MAX);
    let photoTokens = [];
    if (body.photo_tokens != null) {
      const ok = Array.isArray(body.photo_tokens) && body.photo_tokens.length <= HAZARD_PHOTO_MAX
        && body.photo_tokens.every((t) => typeof t === 'string' && /^[A-Za-z0-9]{10,120}$/.test(t));
      if (!ok) return errRes('HAZARD_FIELD_INVALID', `photo_tokens 不合法（≤${HAZARD_PHOTO_MAX} 个、来自上传接口）`, 400, corsHeaders(origin));
      photoTokens = [...new Set(body.photo_tokens)];
    }

    let hit;
    try {
      hit = await adapter.getRecord(env, cfg.fileId, tableId, recordId);
    } catch (e) {
      if (e && e.isNotFound) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
      return errRes('WPS_UPSTREAM_ERROR', '隐患记录暂不可用，请稍后再试', 502, corsHeaders(origin));
    }
    if (!hit) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
    const item = mapHazardRecord(hit);
    // 归属校验：只有整改人能提交（防 A 替 B 结案）
    if (item.rectifierId !== String(payload.sub || '')) {
      return errRes('FORBIDDEN', '只有整改人可以提交整改', 403, corsHeaders(origin));
    }
    // 状态守卫：只有「待整改」能提交（已提交的不能重复提交刷掉验收队列）
    if (item.status !== HAZARD_STATUS_PENDING) {
      const why = item.status === HAZARD_STATUS_REVIEW ? '整改已提交，等待安环部验收' : '该隐患已闭环';
      return errRes('HAZARD_STATUS_INVALID', why + '，不能重复提交', 409, corsHeaders(origin));
    }

    await ensureHazardRectFields(env, cfg.fileId, tableId);
    const fields = {
      '处理状态': HAZARD_STATUS_REVIEW,
      [HAZARD_FIELDS.rectifyAt]: todoNowLocal(),
    };
    if (note) fields[HAZARD_FIELDS.rectifyNote] = note;
    if (photoTokens.length) fields[HAZARD_FIELDS.rectifyPhotos] = photoTokens.map((t) => ({ file_token: t }));
    try {
      await adapter.updateRecord(env, cfg.fileId, tableId, recordId, fields);
    } catch (e) {
      if (e && e.isRateLimit) return errRes('WPS_RATE_LIMIT', '存储限频，请稍后重试', 429, corsHeaders(origin));
      return errRes('WPS_UPSTREAM_ERROR', '整改提交失败', 502, corsHeaders(origin));
    }
    const out = {
      ...item,
      status: HAZARD_STATUS_REVIEW,
      overdue: false,
      rectifySubmittedAt: fields[HAZARD_FIELDS.rectifyAt],
    };
    if (note) out.rectifyNote = note;
    if (photoTokens.length) out.rectifyPhotoTokens = photoTokens;
    return jsonRes({ success: true, code: 'OK', status: HAZARD_STATUS_REVIEW, item: out }, 200, corsHeaders(origin));
  } catch {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

// ---- POST /api/mobile/hazard/review：安环部验收（通过 → 已闭环 / 打回 → 待整改）----
// body: { record_id, action: 'pass'|'reject', comment? }
async function handleHazardReview(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  try {
    const adapter = getAdapter(env);
    const cfg = await storageConfig(env);
    const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
    const denied = hazardGate(env, payload, origin);
    if (denied) return denied;

    const tableId = String((cfg && cfg.hazardSheetId) || '').trim();
    if (!tableId) return errRes('HAZARD_TARGET_NOT_CONFIGURED', '隐患排查表未配置', 503, corsHeaders(origin));

    const contentLen = Number(request.headers.get('content-length') || '0');
    if (contentLen > HAZARD_BODY_LIMIT) return errRes('BODY_TOO_LARGE', `请求体超过上限（${HAZARD_BODY_LIMIT} 字节）`, 413, corsHeaders(origin));
    let body;
    try { body = await request.json(); } catch { return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin)); }
    if (!body || typeof body !== 'object') return errRes('BAD_REQUEST', '请求格式不正确', 400, corsHeaders(origin));

    const recordId = patrolText(body.record_id, 64);
    if (!/^[A-Za-z0-9]{10,64}$/.test(recordId)) return errRes('HAZARD_FIELD_INVALID', 'record_id 不合法', 400, corsHeaders(origin));
    const action = String(body.action || '').trim();
    if (action !== 'pass' && action !== 'reject') {
      return errRes('HAZARD_FIELD_INVALID', "action 须为 'pass' 或 'reject'", 400, corsHeaders(origin));
    }
    const comment = patrolText(body.comment, HAZARD_REVIEW_COMMENT_MAX);

    let hit;
    try {
      hit = await adapter.getRecord(env, cfg.fileId, tableId, recordId);
    } catch (e) {
      if (e && e.isNotFound) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
      return errRes('WPS_UPSTREAM_ERROR', '隐患记录暂不可用，请稍后再试', 502, corsHeaders(origin));
    }
    if (!hit) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
    const item = mapHazardRecord(hit);
    // 状态守卫：只有「待验收」能验收（防重复闭环 / 打回还没整改就又来一次）
    if (item.status !== HAZARD_STATUS_REVIEW) {
      const why = item.status === HAZARD_STATUS_CLOSED ? '该隐患已闭环' : '整改尚未提交';
      return errRes('HAZARD_STATUS_INVALID', why + '，不能验收', 409, corsHeaders(origin));
    }

    await ensureHazardRectFields(env, cfg.fileId, tableId);
    const reviewer = patrolText(payload.name, 40);
    const now = todoNowLocal();
    let fields;
    if (action === 'pass') {
      fields = {
        '处理状态': HAZARD_STATUS_CLOSED,
        [HAZARD_FIELDS.reviewer]: reviewer,
        [HAZARD_FIELDS.reviewAt]: now,
        [HAZARD_FIELDS.closedAt]: now,
        [HAZARD_FIELDS.reviewResult]: comment ? `通过：${comment}` : '通过',
      };
    } else {
      fields = {
        '处理状态': HAZARD_STATUS_PENDING,
        [HAZARD_FIELDS.reviewer]: reviewer,
        [HAZARD_FIELDS.reviewAt]: now,
        [HAZARD_FIELDS.rejectCount]: String(Math.min(item.rejectCount + 1, 99)),
        [HAZARD_FIELDS.reviewResult]: comment ? `打回：${comment}` : '打回',
      };
    }
    try {
      await adapter.updateRecord(env, cfg.fileId, tableId, recordId, fields);
    } catch (e) {
      if (e && e.isRateLimit) return errRes('WPS_RATE_LIMIT', '存储限频，请稍后重试', 429, corsHeaders(origin));
      return errRes('WPS_UPSTREAM_ERROR', '验收写入失败', 502, corsHeaders(origin));
    }
    const out = {
      ...item,
      status: fields['处理状态'],
      overdue: hazardOverdue(fields['处理状态'], item.deadline),
      reviewer,
      reviewAt: now,
      reviewResult: fields[HAZARD_FIELDS.reviewResult],
    };
    if (action === 'pass') out.closedAt = now;
    else out.rejectCount = Math.min(item.rejectCount + 1, 99);
    return jsonRes({ success: true, code: 'OK', action, item: out }, 200, corsHeaders(origin));
  } catch {
    return errRes('INTERNAL_ERROR', '内部错误，请稍后再试', 500, corsHeaders(origin));
  }
}

async function handlePatrolRecords(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
  const adapter = getAdapter(env);
  const cfg = await storageConfig(env);

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
  // 可见范围：公司管理 ALL / 经理 DEPT（本人 + 下级）/ 管理员 SELF
  let view = await resolveViewScope(adapter, env, cfg, payload);
  // ?mine=1：强制「仅本人」范围（首页「本月上报」卡下钻用）。
  // 该卡的数字口径是「我巡查的」，而下钻若走角色 scope（公司管理 = 全公司），
  // 就会「卡上写 3、点进去几十条」—— 同源约束要求整条链口径一致，故给显式覆盖开关。
  if (url.searchParams.get('mine') === '1') {
    const mp = phoneDigits(payload.sub);
    view = { scope: 'SELF', phones: new Set(mp ? [mp] : []) };
  }

  if (wantId) {
    const hit = recs.find((r) => r.id === String(wantId) && patrolInScope(r.fields, view));
    if (!hit) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
    return jsonRes({
      success: true, code: 'OK', scope: view.scope,
      record: patrolRecordView(hit, true),
    }, 200, corsHeaders(origin));
  }

  // ?month=YYYY-MM 可选；不传则不按月过滤（与放开前行为一致，避免打断既有调用）
  const monthRaw = (url.searchParams.get('month') || '').trim();
  const wantMonth = /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : '';
  const inWantMonth = (r) => {
    if (!wantMonth) return true;
    const t = patrolIdentity(r.fields).inspectionTime || msToPatrolTime(r.fields['日期']);
    return String(t).slice(0, 7) === wantMonth;
  };

  const visible = recs
    .filter((r) => patrolInScope(r.fields, view))
    .filter(inWantMonth)
    .sort((a, b) => {
      // 排序键：备注里的巡查时间 → 退到 日期（创建时间，毫秒）
      const ta = patrolIdentity(a.fields).inspectionTime || msToPatrolTime(a.fields['日期']);
      const tb = patrolIdentity(b.fields).inspectionTime || msToPatrolTime(b.fields['日期']);
      return String(tb).localeCompare(String(ta));
    });
  const total = visible.length;
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const limit = Math.min(PATROL_LIST_LIMIT,
    Math.max(1, Number(url.searchParams.get('limit')) || PATROL_LIST_LIMIT));
  const page = visible.slice(offset, offset + limit);

  // 审计：放开读范围（公司管理/经理可看他人记录）必须留痕，
  // 便于事后回答「谁在什么时候拉了多少条别人的记录」。
  console.log(JSON.stringify({
    evt: 'patrol_records', role: String(payload.role || ''), scope: view.scope,
    degraded: !!view.degraded, month: wantMonth || 'all', total, returned: page.length,
  }));

  return jsonRes({
    success: true, code: 'OK',
    scope: view.scope,                 // 前端据此显示「范围：本人 / 本中心 / 全公司」
    scope_degraded: !!view.degraded,   // true = 组织信息取不到，已退回仅本人
    month: wantMonth || '',
    total,                             // 命中总数（不受分页影响）
    has_more: offset + page.length < total,
    records: page.map((r) => patrolRecordView(r, false)),
  }, 200, corsHeaders(origin));
}

/* ============================================================================
   CF-WPS-36 整改待办：跨账号指派的服务端实体 + 三个接口
   ---------------------------------------------------------------------------
   背景：此前「转给责任乡镇」只在**指派人本机 localStorage**打标记，被指派人
   永远收不到（见 docs/三级账号权限与流程测试报告.md 的 B3/B4/B5/C1/C2/F2/F3）。
   指派关系必须落到服务端，才能被另一个账号读到。

   存储：与主台账同表，新增 9 个文本列（TODO_FIELDS），由 ensureTodoFields() 幂等创建。
   一条巡查记录最多对应一条待办，语义一致、无需额外建表。

   五个接口：
     POST /api/mobile/assign            指派（创建/覆盖待办；同时把派发人追加进「派发链路」）
     GET  /api/mobile/inbox             我的待办（按 整改接收人ID 过滤，含已完成明细）
     GET  /api/mobile/dispatched        我派发出去的记录（指派人ID == 我 或 我在派发链路里）
     GET  /api/mobile/summary           首页统计（5 个数字与各自下钻源一并下发，保证同源）
     POST /api/mobile/assign/complete   完成待办（仅接收人可操作）
   ============================================================================ */

// 本地时间字符串 YYYY-MM-DD HH:mm（与前端 nowLocalInspectTime 同格式，便于人工阅读）
function todoNowLocal(d) {
  const t = d || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  // Cloudflare Worker 默认 UTC；业务在东八区，+8h 后取本地时间
  const cn = new Date(t.getTime() + 8 * 3600 * 1000);
  return cn.getUTCFullYear() + '-' + pad(cn.getUTCMonth() + 1) + '-' + pad(cn.getUTCDate())
    + ' ' + pad(cn.getUTCHours()) + ':' + pad(cn.getUTCMinutes());
}

// 飞书附件列（违章照片 / 整改后照片）是 [{ file_token }] 数组，不可直接访问。
// 这里只抽出 file_token（前端再经 /api/mobile/photo 代理取图），不把附件对象原样下发。
function photoTokens(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (x && (x.file_token || x.fileToken || '')) || '')
    .filter(Boolean);
}

// 待办视图：给被指派人看的字段（含「谁派给我的」来源信息 —— 测试报告 D2 要求）
function todoView(rec, full) {
  const f = rec.fields || {};
  const base = patrolRecordView(rec, false);
  const todo = {
    record_id: rec.id,
    assignee_id: fieldText(f[TODO_FIELDS.assigneeId]),
    assignee_name: fieldText(f[TODO_FIELDS.assigneeName]),
    town: fieldText(f[TODO_FIELDS.town]),
    status: fieldText(f[TODO_FIELDS.status]),
    assigner_id: fieldText(f[TODO_FIELDS.assignerId]),
    assigner_name: fieldText(f[TODO_FIELDS.assignerName]),
    // 指派人**所属单位**（不是接收方责任单位）——「来自 XXX · 单位」据此显示
    assigner_dept: fieldText(f[TODO_FIELDS.assignerDept]),
    assigned_at: fieldText(f[TODO_FIELDS.assignedAt]),
    done_at: fieldText(f[TODO_FIELDS.doneAt]),
    note: fieldText(f[TODO_FIELDS.note]),
  };
  if (!full) return { ...base, ...todo };
  return {
    ...base, ...todo,
    rectify_photo_count: Array.isArray(f['整改后照片']) ? f['整改后照片'].length : 0,
    description: fieldText(f['描述']),
    // CF-WPS-派发图：把派发原图的 file_token 一并下发（非图片本身），
    // 前端凭 token 调 /api/mobile/photo 取回原图，解决「接任务的人看不到派发图」问题。
    scene_photo_tokens: photoTokens(f['违章照片']),
    rectify_photo_tokens: photoTokens(f['整改后照片']),
  };
}

function todoIsMine(fields, sub) {
  const id = fieldText((fields || {})[TODO_FIELDS.assigneeId]);
  return !!id && id === String(sub);
}

// ---- POST /api/mobile/assign ----
// body: { record_id, assignee_id, assignee_name, town, note }
// 权限：记录创建者本人，或公司管理（可指派全公司任一条）
async function handleAssign(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'POST') return errRes('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, corsHeaders(origin));
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

  let body;
  try { body = await request.json(); } catch { return errRes('BAD_JSON', '请求体解析失败', 400, corsHeaders(origin)); }
  const recordId = String((body && body.record_id) || '').trim();
  const assigneeId = String((body && body.assignee_id) || '').trim();
  const assigneeName = String((body && body.assignee_name) || '').trim();
  if (!recordId) return errRes('ASSIGN_FIELD_INVALID', '缺少 record_id', 400, corsHeaders(origin));
  if (!assigneeId) return errRes('ASSIGN_FIELD_INVALID', '缺少 assignee_id（接收人工号/手机号）', 400, corsHeaders(origin));
  if (!/^\d{6,20}$/.test(assigneeId)) return errRes('ASSIGN_FIELD_INVALID', 'assignee_id 须为工号或手机号', 400, corsHeaders(origin));

  const adapter = getAdapter(env);
  const cfg = await storageConfig(env);
  const target = patrolTarget(env, cfg);
  if (!target) return errRes('PATROL_TARGET_NOT_CONFIGURED', '巡查目标表未配置', 503, corsHeaders(origin));
  await ensureTodoFields(env, cfg.fileId, target.sheetId);

  // CF-WPS-43：单条 GET 替代全表扫描（之前 5s+）—— 写入路径必须看到刚 submit 的最新记录。
  let hit;
  try { hit = await adapter.getRecord(env, cfg.fileId, target.sheetId, recordId); }
  catch (e) {
    if (e && e.isNotFound) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
    return errRes('WPS_UPSTREAM_ERROR', '巡查记录暂不可用，请稍后再试', 502, corsHeaders(origin));
  }
  if (!hit) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
  const recs = [hit];

  // 权限（CF-WPS-41 扩展：给乡镇作业中心经理对称的「派活」能力）：
  //   公司管理                 → 全公司可派，接收人不限；
  //   乡镇作业中心经理         → 可派「自己接收的」或「责任单位 = 本作业中心」的记录，
  //                              且接收人**必须是台账里直接上级 = 本人**的下级；
  //   其它角色                 → 只能派自己创建的记录（原行为不变，避免动到既有流程）。
  const role = String(payload.role || '');
  const isCompany = role === '公司管理';
  const isManager = role === '经理';
  let permitted = false;
  let denyMsg = '只能指派自己创建的记录';
  if (isCompany || patrolIsMine(hit.fields, payload.sub)) permitted = true;
  else if (isManager) {
    const townNow = patrolText(hit.fields[TODO_FIELDS.town] || '');
    const dept = String(payload.department || '');
    const ownUnit = !!townNow && !!dept && (townNow === dept || dept.includes(townNow) || townNow.includes(dept));
    if (todoIsMine(hit.fields, payload.sub) || ownUnit) permitted = true;
    else denyMsg = '只能指派你本人接收的、或属于你所在作业中心的记录';
  }
  if (!permitted) return errRes('FORBIDDEN', denyMsg, 403, corsHeaders(origin));

  // 接收人范围收敛：经理只能派给本作业中心的下级（越权指派到别的镇一律拒绝）
  if (isManager && !isCompany) {
    const subs = await managerSubordinatePhones(env, cfg, String(payload.name || ''));
    if (!subs.has(assigneeId)) {
      return errRes('FORBIDDEN', '乡镇作业中心经理只能指派给你所在作业中心的下级', 403, corsHeaders(origin));
    }
  }

  // CF-WPS-58：接收人不得是公司管理角色 —— **身份表角色压过花名册职位**。
  //   公司管理即便在花名册挂着「XX作业中心经理」，也不是乡镇作业中心经理，
  //   不能当整改接收人（否则「派给乡镇经理」退化成「派给同级」）。
  //   ⚠️ isCompany 分支原本「接收人不限」，这是唯一的角色兜底，必须补在这里。
  if (await assigneeIsCompanyRole(adapter, env, cfg, assigneeId, assigneeName)) {
    return errRes('FORBIDDEN', '公司管理账号不可作为整改接收人（其身份角色为公司管理，不因花名册职位而改变）', 403, corsHeaders(origin));
  }

  // CF-WPS-派发链路：把「这条记录经手过的所有派发人」记下来（只追加、不覆盖）。
  //   否则公司管理派给经理、经理再转派给管理员后，记录上的「指派人ID」变成经理，
  //   公司管理的「派发记录」里这条就消失了（2026-09-30 用户反馈的线上缺陷）。
  const meId = String(payload.sub || '');
  const meName = String(payload.name || '');
  const meDept = patrolText(payload.department || '', 40);
  const prevAssignerId = fieldText(hit.fields[TODO_FIELDS.assignerId]);
  const prevAssignerName = fieldText(hit.fields[TODO_FIELDS.assignerName]);
  const prevAssignerDept = fieldText(hit.fields[TODO_FIELDS.assignerDept]);
  const prevAssignedAt = fieldText(hit.fields[TODO_FIELDS.assignedAt]);
  const linkIds = chainSplitIds(hit.fields[TODO_FIELDS.chainId]);
  let linkText = fieldText(hit.fields[TODO_FIELDS.chainText]);
  // 老数据升级：链路列还空着、但已有指派人 → 用现任指派人把链路起点补上
  if (!linkIds.length && prevAssignerId) linkIds.push(prevAssignerId);
  if (!linkText && prevAssignerId && prevAssignerName) {
    linkText = chainLabel(prevAssignerName, prevAssignerDept, prevAssignedAt);
  }
  // 同一人重复指派（改派）不重复记账 —— 链路记的是「谁经手过」，不是「派了几次」
  if (meId && !linkIds.includes(meId)) {
    linkIds.push(meId);
    const meLabel = chainLabel(meName, meDept, todoNowLocal());
    linkText = linkText ? (linkText + CHAIN_SEP + meLabel) : meLabel;
  }

  const fields = {
    [TODO_FIELDS.assigneeId]: assigneeId,
    [TODO_FIELDS.assigneeName]: assigneeName || assigneeId,
    [TODO_FIELDS.town]: patrolText((body && body.town) || '', 40),
    [TODO_FIELDS.status]: TODO_STATUS.pending,
    [TODO_FIELDS.assignerId]: meId,
    [TODO_FIELDS.assignerName]: meName,
    // 指派人单位 = 指派人自己的所属部门（如 公司管理=安环管理部），供「来自 XXX · 单位」显示
    [TODO_FIELDS.assignerDept]: meDept,
    [TODO_FIELDS.assignedAt]: todoNowLocal(),
    [TODO_FIELDS.doneAt]: '',
    [TODO_FIELDS.note]: patrolText((body && body.note) || '', 200),
    [TODO_FIELDS.chainId]: linkIds.join(','),
    [TODO_FIELDS.chainText]: linkText,
  };
  try {
    await adapter.updateRecord(env, cfg.fileId, target.sheetId, recordId, fields);
    invalidateMainLedger(cfg.fileId, target.sheetId);   // CF-WPS-43
  } catch (e) {
    if (e && e.isRateLimit) return errRes('WPS_RATE_LIMITED', '存储限频，请稍后重试', 429, corsHeaders(origin));
    return errRes('WPS_UPSTREAM_ERROR', '指派写入失败：' + String((e && e.fsMsg) || ''), 502, corsHeaders(origin));
  }
  // CF-WPS-41：指派成功后给接收人发微信（未配令牌时内部直接短路）。
  const notify = await notifyAssign(env, cfg, {
    assigneeId,
    assignerName: String(payload.name || ''),
    problem: patrolText(hit.fields['违章行为'] || '') || patrolText(hit.fields['描述'] || ''),
    town: fields[TODO_FIELDS.town],
    assignedAt: fields[TODO_FIELDS.assignedAt],
  });

  return jsonRes({
    success: true, code: 'OK',
    record_id: recordId,
    assignee_id: assigneeId, assignee_name: fields[TODO_FIELDS.assigneeName],
    town: fields[TODO_FIELDS.town], status: TODO_STATUS.pending,
    assigned_at: fields[TODO_FIELDS.assignedAt],
    notify,   // sent | no_uid（接收人未绑定微信）| not_configured | upstream | network | error
  }, 200, corsHeaders(origin));
}

// 台账里「直接上级 = meName」的人的手机号集合（经理可指派范围）
async function managerSubordinatePhones(env, cfg, meName) {
  const out = new Set();
  const name = String(meName || '').trim();
  if (!name) return out;
  const adapter = getAdapter(env);
  let rows;
  try {
    // CF-WPS-43：走 60s 缓存的身份表，避免每次指派都把台账整表扫一遍（~1s）
    rows = (await getIdentityRows(adapter, env, cfg.fileId, cfg.ledgerSheetId)).map(mapLedgerRecord).filter((r) => r.name);
  } catch { return out; }
  const count = ledgerNameCount(rows);
  for (const d of ledgerChildren(rows, name, count)) {
    if (d.phone) out.add(String(d.phone));
  }
  return out;
}

// ---- GET /api/mobile/inbox（我的待办）----
// 按「整改接收人ID == 我」过滤 —— 与 patrol/records（按创建者过滤）互补：
// 前者是「我派出去的」，这里是「派给我的」。
async function handleInbox(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'GET') return errRes('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, corsHeaders(origin));
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

  const adapter = getAdapter(env);
  const cfg = await storageConfig(env);
  const target = patrolTarget(env, cfg);
  if (!target) return errRes('PATROL_TARGET_NOT_CONFIGURED', '巡查目标表未配置', 503, corsHeaders(origin));

  // CF-WPS-43：用「按整改接收人ID过滤」替代全表扫描 —— 单条人通常只有几条记录，
  // 飞书原生 search API 单次往返 ~200ms。
  await ensureTodoFields(env, cfg.fileId, target.sheetId);
  let mine;
  try {
    mine = await adapter.searchRecords(env, cfg.fileId, target.sheetId, {
      field: TODO_FIELDS.assigneeId, value: String(payload.sub || ''), maxPages: 5,
    });
  } catch {
    // 旧字段不存在（建列失败前的老数据）或 search 列不过筛：退回全表扫描兜底，
    // 不至于接口挂掉 —— 这条路径只会出现在极端 race condition 下。
    let recs;
    try { recs = await adapter.scanRecords(env, cfg.fileId, target.sheetId); }
    catch { return errRes('WPS_UPSTREAM_ERROR', '待办暂不可用，请稍后再试', 502, corsHeaders(origin)); }
    mine = recs.filter((r) => todoIsMine(r.fields, payload.sub));
  }

  const pending = mine.filter((r) => fieldText(r.fields[TODO_FIELDS.status]) !== TODO_STATUS.done);
  // 本月已整改：指派给我、状态为「已完成」且完成时间落在本自然月。
  // 使用字符串前缀 YYYY-MM 匹配，避免 Worker UTC 时区解析歧义；待整改 pending 不按月过滤，
  // 跨月未完成的记录继续显示在「待整改」中，直到整改完成为止。
  const thisYm = todoNowLocal().slice(0, 7);
  const doneThisMonth = mine.filter((r) => {
    if (fieldText(r.fields[TODO_FIELDS.status]) !== TODO_STATUS.done) return false;
    const doneAt = fieldText(r.fields[TODO_FIELDS.doneAt]) || '';
    return doneAt.slice(0, 7) === thisYm;
  });
  const sortKey = (r) => fieldText(r.fields[TODO_FIELDS.assignedAt]);
  const byTimeDesc = (a, b) => String(sortKey(b)).localeCompare(String(sortKey(a)));

  const doneAll = mine
    .filter((r) => fieldText(r.fields[TODO_FIELDS.status]) === TODO_STATUS.done)
    .sort(byTimeDesc);

  // 未完成 / 已完成**分别限量**：原实现把两类拼接后统一 slice(0, LIMIT)，
  // 未完成一旦超过上限，已完成明细会被整体挤出（数字仍准 —— monthly_done_count 走全量，
  // 但「已完成」下钻列表会空）—— 2026-09-19 修。
  // full=true 补全 description / rectify_photo_count，供详情页使用。
  const pendingPage = pending.sort(byTimeDesc).slice(0, PATROL_LIST_LIMIT);
  const donePage = doneAll.slice(0, PATROL_LIST_LIMIT);
  const todos = [...pendingPage, ...donePage].map((r) => todoView(r, true));
  // 老记录（「指派人单位」列上线前建的）没有该值 → 用身份台账按指派人手机号回填。
  // 目的：让「来自 XXX · 单位」对存量待办也显示**指派人自己的单位**，而不是接收方的责任单位。
  // 回填失败静默降级（单位缺失只是显示少一截，不影响待办本身）。
  const needFill = todos.filter((t) => !t.assigner_dept && t.assigner_id);
  if (needFill.length) {
    try {
      const rows = (await getIdentityRows(adapter, env, cfg.fileId, cfg.ledgerSheetId)).map(mapLedgerRecord);
      const deptByPhone = new Map();
      for (const r of rows) if (r.phone) deptByPhone.set(String(r.phone), r.department || '');
      for (const t of needFill) t.assigner_dept = deptByPhone.get(String(t.assigner_id)) || '';
    } catch { /* 回填失败静默 */ }
  }

  return jsonRes({
    success: true, code: 'OK',
    me: { id: String(payload.sub || ''), name: String(payload.name || ''), role: String(payload.role || '') },
    pending_count: pending.length,        // 首页「待整改」红点直接取这个
    monthly_done_count: doneThisMonth.length, // 首页「已整改」（经理/管理员），本月口径
    done_count: doneAll.length,           // 指派给我且已完成的总数（不限本月）
    done_more: doneAll.length > donePage.length,
    total: mine.length,
    todos,                                // 未完成在前、已完成在后，各自独立限量
  }, 200, corsHeaders(origin));
}

// ---- GET /api/mobile/dispatched（我派发出去的、尚未整改完成的记录）----
// 口径（2026-09-19 用户定）：只列「我派出去、对方还没整改完」的，**不按自然月过滤** ——
// 上个月派的到今天没整改完，这个月继续挂在列表里，直到整改完成才消失。
// 与 /api/mobile/inbox 互为镜像：
//   inbox      = 整改接收人ID == 我（别人派给我的）
//   dispatched = 我派出去的 = 指派人ID == 我 **或** 我在「派发链路」里
//                （后者覆盖「公司管理 → 经理 → 管理员」这种转派：
//                 经理一转派，记录上的指派人ID 就变成经理了，只看指派人ID 会让
//                 公司管理这条记录凭空消失 —— 2026-09-30 用户反馈的线上缺陷）
// 门槛在前端：只有实际会派发的角色（公司管理 / 乡镇作业中心经理）挂这个页签；
// 管理员不转派（前端转派页对管理员直接跳过），列表恒空，故不给它挂。
async function handleDispatched(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'GET') return errRes('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, corsHeaders(origin));
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

  const adapter = getAdapter(env);
  const cfg = await storageConfig(env);
  const target = patrolTarget(env, cfg);
  if (!target) return errRes('PATROL_TARGET_NOT_CONFIGURED', '巡查目标表未配置', 503, corsHeaders(origin));

  const me = String(payload.sub || '');
  const url = new URL(request.url);
  await ensureTodoFields(env, cfg.fileId, target.sheetId);

  // 与 inbox 同款取数：优先飞书原生 search（单次往返），失败再退回全表扫描兜底。
  // 退路必须保留：指派人ID 列在极早的老数据上可能为空，search 不匹配时会返回空集而不是报错，
  // 所以兜底只在**抛异常**时走（列不存在 / search 列不过滤）。
  //
  // CF-WPS-派发链路：要取**两路**再合并 ——
  //   ① 指派人ID == 我       （我现在就是这条的派发方）
  //   ② 派发链路ID contains 我（我派过，但已被下游转派；只查 ① 会让记录凭空消失）
  // 任一路抛错都退回全表扫描，保证结果集与旧口径**单调变多**、不会漏。
  let sent;
  try {
    const [asAssigner, inChain] = await Promise.all([
      adapter.searchRecords(env, cfg.fileId, target.sheetId, {
        field: TODO_FIELDS.assignerId, value: me, maxPages: 5,
      }),
      adapter.searchRecords(env, cfg.fileId, target.sheetId, {
        field: TODO_FIELDS.chainId, value: me, operator: 'contains', maxPages: 5,
      }),
    ]);
    const seen = new Set();
    sent = [];
    for (const r of asAssigner.concat(inChain)) {
      if (!r || seen.has(r.id)) continue;
      seen.add(r.id);
      sent.push(r);
    }
  } catch {
    let recs;
    try { recs = await adapter.scanRecords(env, cfg.fileId, target.sheetId); }
    catch { return errRes('WPS_UPSTREAM_ERROR', '派发记录暂不可用，请稍后再试', 502, corsHeaders(origin)); }
    sent = recs.filter((r) => isMyDispatch(r.fields, me));
  }

  // 排序 / 挂账 / 本月派发都用**我方视角**的派发时间：
  //   我是最新指派人 → 指派时间；我已被下游转派 → 链路里属于我的那一段时间。
  //   否则公司管理看到的会是「经理转派的时间」，挂账天数与本月派发都会被算错。
  const sortKey = (r) => myDispatchTime(r.fields, me) || fieldText(r.fields[TODO_FIELDS.assignedAt]);
  const byNewest = (a, b) => String(sortKey(b)).localeCompare(String(sortKey(a)));

  // 本月派发数：**始终**按本月算，不受 ?month 参数影响 —— 首页统计卡取它，
  // 与 /api/mobile/summary 的 month_dispatch 同源同值。
  // 跨月未整改的会一直留在列表里挂着，但不计入本月派发。
  const thisYm = todoNowLocal().slice(0, 7);
  const monthlyDispatch = sent.filter((r) => String(sortKey(r)).slice(0, 7) === thisYm).length;

  // ?month=YYYY-MM 可选：只列「指派时间落在该月」的（供首页「本月派发」卡下钻）。
  // 不传时返回全部（含跨月挂账），与放开前行为完全一致。
  const monthRaw = (url.searchParams.get('month') || '').trim();
  const wantMonth = /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : '';
  const view = wantMonth ? sent.filter((r) => String(sortKey(r)).slice(0, 7) === wantMonth) : sent;

  const open = view
    .filter((r) => fieldText(r.fields[TODO_FIELDS.status]) !== TODO_STATUS.done)
    .sort(byNewest);
  const doneAll = view
    .filter((r) => fieldText(r.fields[TODO_FIELDS.status]) === TODO_STATUS.done)
    .sort(byNewest);

  const openPage = open.slice(0, PATROL_LIST_LIMIT);
  const donePage = doneAll.slice(0, PATROL_LIST_LIMIT);

  // 派发方视角的视图：把「派发时间」换成**我方**的时间，并带上转派信息，
  //   让公司管理一眼看出「这条我已转派下去，现在在谁手上」。
  const viewForMe = (r) => {
    const v = todoView(r, true);
    const mine = myDispatchTime(r.fields, me);
    if (mine) v.assigned_at = mine;
    v.reassigned = fieldText(r.fields[TODO_FIELDS.assignerId]) !== me;   // 我已不是最新派发方
    v.chain = fieldText(r.fields[TODO_FIELDS.chainText]);
    return v;
  };

  return jsonRes({
    success: true, code: 'OK',
    me: { id: me, name: String(payload.name || ''), role: String(payload.role || '') },
    pending_count: open.length,   // 未整改完成条数（页签红点可直接取这个）
    done_count: doneAll.length,   // 我派出去且已整改完成的条数
    total: view.length,
    month: wantMonth || '',                       // '' = 未按月筛选（全部）
    monthly_dispatch_count: monthlyDispatch,      // 本月派发数（首页统计卡）
    done_more: doneAll.length > donePage.length,
    // records 语义**保持不变**（= 仅未完成），避免打断既有断言；
    // 已完成走 done_records（「已完成」分组可查）。
    // 传 full=true 补全 description / rectify_photo_count —— 详情页要用。
    records: openPage.map(viewForMe),
    done_records: donePage.map(viewForMe),
  }, 200, corsHeaders(origin));
}

/* ---- GET /api/mobile/summary（首页统计的唯一来源）----
   决策背景（2026-09-19）：首页统计卡要能**点击下钻**，就必须保证「卡上的数字」与
   「点进去的列表」**同源**。此前「本月派发」走本机 db.records、「派发记录」页签走服务端
   dispatched ⇒ 换手机 / 清缓存 / 派发动作发生在别人手机上时，两者必然对不上
   （会呈现为「卡上写 3、点进去 0 条」）。故首页数字统一由服务端一次算出，前端只渲染不计算。

   各数字的过滤键，必须与对应下钻接口**逐字一致**：
     month_post     = 备注.巡查人ID == 我  且 巡查时间在本月        → patrol/records?month=
     month_dispatch = 我派过的（指派人ID==我 或 我在派发链路里） 且 我方派发时间在本月 → dispatched?month=
     pending        = 整改接收人ID == 我  且 整改状态 ≠ 已完成     → inbox（未完成部分）
     rectified      = 整改接收人ID == 我  且 完成时间在本月        → inbox（已完成部分）
     closed         = 本机口径（主台账没有「整改完成」独立列，服务端无法判断
                       未经派发的记录是否闭环）→ 前端用本机 db.records 计算，
                       因此**不在本响应里**，由前端自行填。
   时区：月份一律用 todoNowLocal() 的字符串前缀 YYYY-MM 比较，不用 Date 解析
        （Worker 默认 UTC，用 Date 会跨月错位）。 */
async function handleSummary(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'GET') return errRes('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, corsHeaders(origin));
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

  const adapter = getAdapter(env);
  const cfg = await storageConfig(env);
  const target = patrolTarget(env, cfg);
  if (!target) return errRes('PATROL_TARGET_NOT_CONFIGURED', '巡查目标表未配置', 503, corsHeaders(origin));

  // 五个数字都来自同一份全量台账快照 —— 只扫一次，避免多次往返上游。
  let recs;
  try { recs = await adapter.scanRecords(env, cfg.fileId, target.sheetId); }
  catch { return errRes('WPS_UPSTREAM_ERROR', '统计暂不可用，请稍后再试', 502, corsHeaders(origin)); }

  const me = phoneDigits(payload.sub);
  const role = String(payload.role || '');
  const thisYm = todoNowLocal().slice(0, 7);
  const inMonth = (v) => String(v || '').slice(0, 7) === thisYm;
  const f = (r, k) => fieldText((r.fields || {})[k]);
  const isDone = (r) => f(r, TODO_FIELDS.status) === TODO_STATUS.done;
  const patrolCode = (r) => patrolIdentity(r.fields).employeeCode;
  const patrolTime = (r) => patrolIdentity(r.fields).inspectionTime || msToPatrolTime((r.fields || {})['日期']);

  const minePatrol = recs.filter((r) => !!me && patrolCode(r) === me);
  // CF-WPS-派发链路：含「我派过但已被下游转派」的（只看指派人ID 会让公司管理的记录消失）
  const mineDispatch = recs.filter((r) => isMyDispatch(r.fields, me));
  const myDispatchAt = (r) => myDispatchTime(r.fields, me) || f(r, TODO_FIELDS.assignedAt);
  const mineInbox = recs.filter((r) => !!me && f(r, TODO_FIELDS.assigneeId) === me);

  return jsonRes({
    success: true, code: 'OK',
    me: { id: me, name: String(payload.name || ''), role },
    month: thisYm,
    month_post: minePatrol.filter((r) => inMonth(patrolTime(r))).length,
    month_dispatch: mineDispatch.filter((r) => inMonth(myDispatchAt(r))).length,
    pending: mineInbox.filter((r) => !isDone(r)).length,
    rectified: mineInbox.filter((r) => isDone(r) && inMonth(f(r, TODO_FIELDS.doneAt))).length,
    // 派发方视角的两个数（供「派发记录」页签角标，省掉首页单独再拉一次 dispatched）
    dispatch_pending: mineDispatch.filter((r) => !isDone(r)).length,
    dispatch_done: mineDispatch.filter(isDone).length,
    // 每张统计卡对应的下钻数据源，随响应下发 —— 前端不必硬编码，
    // 以后改口径只改这里一处，数字与明细不会各走各的。
    scopes: {
      month_post: { api: '/api/mobile/patrol/records', query: 'month=' + thisYm },
      month_dispatch: { api: '/api/mobile/dispatched', query: 'month=' + thisYm },
      pending: { api: '/api/mobile/inbox', group: 'pending' },
      rectified: { api: '/api/mobile/inbox', group: 'done' },
      closed: { api: 'local', note: '本机口径：未上报记录仅本机可见' },
    },
  }, 200, corsHeaders(origin));
}

// ---- POST /api/mobile/assign/complete ----
// body: { record_id, note, photo_tokens?, violation_desc?, violation_people?,
//          violation_sex?, violation_age?, violation_job? }   ← 后三项 CF-WPS-85 追加
// 权限：**仅接收人**（整改接收人ID == 我）可完成 —— 别人不能替他结案。
async function handleAssignComplete(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'POST') return errRes('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, corsHeaders(origin));
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

  let body;
  try { body = await request.json(); } catch { return errRes('BAD_JSON', '请求体解析失败', 400, corsHeaders(origin)); }
  const recordId = String((body && body.record_id) || '').trim();
  if (!recordId) return errRes('ASSIGN_FIELD_INVALID', '缺少 record_id', 400, corsHeaders(origin));

  const adapter = getAdapter(env);
  const cfg = await storageConfig(env);
  const target = patrolTarget(env, cfg);
  if (!target) return errRes('PATROL_TARGET_NOT_CONFIGURED', '巡查目标表未配置', 503, corsHeaders(origin));

  await ensureTodoFields(env, cfg.fileId, target.sheetId);

  // CF-WPS-43：单条 GET 替代全表扫描
  let hit;
  try { hit = await adapter.getRecord(env, cfg.fileId, target.sheetId, recordId); }
  catch (e) {
    if (e && e.isNotFound) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
    return errRes('WPS_UPSTREAM_ERROR', '巡查记录暂不可用，请稍后再试', 502, corsHeaders(origin));
  }
  if (!hit) return errRes('NOT_FOUND', '记录不存在', 404, corsHeaders(origin));
  if (!todoIsMine(hit.fields, payload.sub)) {
    return errRes('FORBIDDEN', '只有接收人本人可以完成这条待办', 403, corsHeaders(origin));
  }

  const fields = {
    [TODO_FIELDS.status]: TODO_STATUS.done,
    [TODO_FIELDS.doneAt]: todoNowLocal(),
    [TODO_FIELDS.note]: patrolText((body && body.note) || '', 200),
  };
  // CF-WPS-被指派人确认：被指派人打开派发任务后，先「确认三违行为 → 选择违章人员」再拍整改后照片。
  //   两项均可选（向后兼容旧前端：不传就不动台账原值）；提供则校验并写回「违章行为」「违章人员姓名」。
  //   三违行为必须命中服务端权威三违库（与 patrol/submit 同口径），否则拒绝，避免自造项污染统计。
  const vDesc = patrolText(body && body.violation_desc, PATROL_VIOL_DESC_MAX);
  if (vDesc) {
    const lib = patrolViolationLib(env);
    if (lib.length && !lib.includes(vDesc) && !lib.includes(vDesc.split('（')[0].trim())) {
      return errRes('VIOLATION_DESC_NOT_IN_LIB', '三违行为不在标准库内', 400, corsHeaders(origin));
    }
    fields['违章行为'] = vDesc;
  }
  const vPeople = patrolText(body && body.violation_people, PATROL_PEOPLE_MAX);
  if (vPeople) fields['违章人员姓名'] = vPeople;
  // CF-WPS-85：选中人员的档案三列（性别/年龄/岗位）一起回写。
  //   背景：建单时选人会写全三列（见 patrol/submit），但「派发 → 被指派人整改时才选人」
  //   这条路径以前只回写姓名 ⇒ 台账「性别/年龄/车辆类型|保洁员」永远留空，
  //   而花名册里这些数据本来就存在（实测测试台账完整度 100% 也被丢）。
  //   仅当本次提供了才写（向前兼容：旧前端不传就不动台账原值）。
  let vSex = patrolText(body && body.violation_sex, PATROL_ATTR_MAX);
  let vAge = patrolText(body && body.violation_age, PATROL_ATTR_MAX);
  let vJob = patrolText(body && body.violation_job, PATROL_ATTR_MAX);
  // CF-WPS-86：档案兜底回填。旧版本前端（.85 之前 / 手机还跑着旧页面）只发姓名不发档案，
  //   于是「派发 → 整改时选人」这条路上三列仍旧留空 —— 用户反复看到的「档案不显示」。
  //   花名册里本来就有这些值，且姓名唯一命中时才补（重名一律不猜，绝不写错人的档案）。
  if (vPeople && (!vSex || !vAge || !vJob)) {
    const cur = hit.fields || {};
    const missSex = !vSex && !fieldText(cur['性别']).trim();
    const missAge = !vAge && !fieldText(cur['年龄']).trim();
    const missJob = !vJob && !fieldText(cur['车辆类型|保洁员']).trim();
    if (missSex || missAge || missJob) {
      const bio = await rosterPersonBio(env, cfg, vPeople);
      if (bio) {
        if (missSex && bio.sex) vSex = bio.sex;
        if (missAge && bio.age) vAge = bio.age;
        if (missJob && bio.job) vJob = bio.job;
      }
    }
  }
  if (vSex) fields['性别'] = vSex;
  if (vAge) fields['年龄'] = vAge;
  if (vJob) fields['车辆类型|保洁员'] = vJob;
  const tokens = Array.isArray(body.photo_tokens) ? body.photo_tokens.filter((t) => typeof t === 'string' && t) : [];
  if (tokens.length) fields['整改后照片'] = [...new Set(tokens)].slice(0, 3).map((t) => ({ file_token: t }));

  try {
    await adapter.updateRecord(env, cfg.fileId, target.sheetId, recordId, fields);
    invalidateMainLedger(cfg.fileId, target.sheetId);   // CF-WPS-43
  } catch (e) {
    if (e && e.isRateLimit) return errRes('WPS_RATE_LIMITED', '存储限频，请稍后重试', 429, corsHeaders(origin));
    return errRes('WPS_UPSTREAM_ERROR', '完成写入失败：' + String((e && e.fsMsg) || ''), 502, corsHeaders(origin));
  }
  return jsonRes({
    success: true, code: 'OK',
    record_id: recordId, status: TODO_STATUS.done,
    done_at: fields[TODO_FIELDS.doneAt],
    photo_count: tokens.length,
  }, 200, corsHeaders(origin));
}

/* 微信推送绑定状态（CF-WPS-41） */
async function handleWxStatus(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'GET') return errRes('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, corsHeaders(origin));
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

  const cfg = await storageConfig(env);
  const uid = await wxUidByPhone(env, cfg, payload.sub).catch(() => '');
  return jsonRes({
    success: true, code: 'OK',
    enabled: !!String(env.WX_APP_TOKEN || '').trim(),
    bound: !!uid,
    // 未配置关注链接时前端降级为纯文字引导
    follow_url: String(env.WX_FOLLOW_URL || 'https://wxpusher.zjiecode.com/admin/'),
  }, 200, corsHeaders(origin));
}

/* 绑定 / 解绑微信推送 UID（CF-WPS-41） */
async function handleWxBind(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'POST') return errRes('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, corsHeaders(origin));
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
  if (!String(env.WX_APP_TOKEN || '').trim()) {
    return errRes('WX_NOT_CONFIGURED', '微信推送未开通', 503, corsHeaders(origin));
  }
  let body;
  try { body = await request.json(); } catch { return errRes('BAD_JSON', '请求体解析失败', 400, corsHeaders(origin)); }
  const uid = String((body && body.uid) || '').trim();
  const unbind = !!(body && body.unbind);

  const adapter = getAdapter(env);
  const cfg = await storageConfig(env);
  await ensureWxField(env, cfg.fileId, cfg.ledgerSheetId);

  let recs;
  try { recs = await adapter.scanRecords(env, cfg.fileId, cfg.ledgerSheetId); }
  catch { return errRes('UPSTREAM_ERROR', '身份信息暂不可用，请稍后再试', 502, corsHeaders(origin)); }
  const me = String(payload.sub || '').replace(/\D/g, '');
  const hit = recs.find((r) => phoneDigits((r.fields || {})['手机号']) === me);
  if (!hit) return errRes('NOT_FOUND', '身份表中未找到你的账号', 404, corsHeaders(origin));

  if (unbind) {
    try {
      await adapter.updateRecord(env, cfg.fileId, cfg.ledgerSheetId, hit.id, { [WX_FIELD]: '' });
      invalidateIdentity(cfg.fileId, cfg.ledgerSheetId);   // CF-WPS-43：否则 60s 内仍读到旧 UID
    }
    catch { return errRes('UPSTREAM_ERROR', '解绑写入失败', 502, corsHeaders(origin)); }
    return jsonRes({ success: true, code: 'OK', bound: false }, 200, corsHeaders(origin));
  }

  if (!/^UID_[A-Za-z0-9]+$/i.test(uid)) {
    return errRes('WX_UID_INVALID', 'UID 格式不对（应以 UID_ 开头）', 400, corsHeaders(origin));
  }
  // 必须真的关注了本应用才允许绑定 —— 否则会把消息推到陌生人或静默丢失
  const ok = await wxUidFollows(env, uid);
  if (!ok) {
    return errRes('WX_UID_NOT_FOLLOWED', '该 UID 尚未关注本应用，请先点关注链接完成关注', 400, corsHeaders(origin));
  }
  try {
    await adapter.updateRecord(env, cfg.fileId, cfg.ledgerSheetId, hit.id, { [WX_FIELD]: uid });
    invalidateIdentity(cfg.fileId, cfg.ledgerSheetId);   // CF-WPS-43：让下一次指派立刻用上刚绑定的 UID
  }
  catch { return errRes('UPSTREAM_ERROR', '绑定写入失败', 502, corsHeaders(origin)); }
  return jsonRes({ success: true, code: 'OK', bound: true, uid }, 200, corsHeaders(origin));
}

/* CF-WPS-61：仍在用初始密码 → 关键写操作一律拒绝。
   这是「前端强制改密」的服务端兜底 —— 防止有人绕过界面直接调接口写数据。
   读接口（组织/花名册/台账/统计）不拦，否则用户连改密页都进不去。
   OPTIONS 预检必须放行，否则浏览器 CORS 预检失败。 */
async function guardPasswordChanged(request, env) {
  const origin = corsOrigin(request, env);
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));
  if (payload.pwd === 0) {
    return errRes('PASSWORD_CHANGE_REQUIRED', '首次登录后必须先修改密码才能使用该功能', 403, corsHeaders(origin));
  }
  return null;
}

// CF-WPS-派发图：图片代理。被指派人在整改页/详情页凭 file_token 取回派发原图。
// 飞书附件不可直链，这里用服务端 tenant_access_token 拉取后原样转发；前端带登录 JWT 鉴权，
// 避免图片被未登录方盗刷。?ft=<file_token>
async function handleServerPhoto(request, env) {
  const origin = corsOrigin(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'GET') return errRes('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, corsHeaders(origin));
  // 门 1：登录态（只有登录的移动端用户才能取图）
  if (!env.WORKER_SESSION_SECRET) return errRes('SESSION_NOT_CONFIGURED', '会话密钥未配置', 503, corsHeaders(origin));
  const payload = await verifyWorkerSession(bearerToken(request), env.WORKER_SESSION_SECRET);
  if (!payload) return errRes('UNAUTHORIZED', '未认证或登录态失效', 401, corsHeaders(origin));

  const url = new URL(request.url);
  const fileToken = String(url.searchParams.get('ft') || '').trim();
  if (!fileToken) return errRes('BAD_REQUEST', '缺少 ft 参数（图片 file_token）', 400, corsHeaders(origin));

  let fsRes;
  try {
    const { downloadMedia } = await import('./storage/feishuAdapter.js');
    fsRes = await downloadMedia(env, fileToken);
  } catch (e) {
    if (e && e.isNotFound) return errRes('NOT_FOUND', '图片不存在或已删除', 404, corsHeaders(origin));
    if (e && e.isRateLimit) return errRes('UPSTREAM_RATE_LIMITED', '飞书图片服务限流，请稍后重试', 429, corsHeaders(origin));
    if (e && e.isBadRequest) return errRes('BAD_REQUEST', '图片参数无效', 400, corsHeaders(origin));
    return errRes('WPS_UPSTREAM_ERROR', '图片暂不可用，请稍后再试', 502, corsHeaders(origin));
  }

  // 原样转发飞书返回的二进制流 + content-type；同源部署无需跨域，仍带上 CORS 头保险。
  const ct = fsRes.headers.get('content-type') || 'image/jpeg';
  const cl = fsRes.headers.get('content-length');
  const headers = { ...corsHeaders(origin), 'content-type': ct, 'cache-control': 'private, max-age=300' };
  if (cl) headers['content-length'] = cl;
  return new Response(fsRes.body, { status: 200, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (request.method !== 'OPTIONS' && PWD_GUARDED_ROUTES.has(p)) {
      const g = await guardPasswordChanged(request, env);
      if (g) return g;
    }

    if (p === '/wps/records/create') return handleRecordCreate(request, env);
    if (p === '/api/mobile/upload') return handleUploadImage(request, env);
    // CF-WPS-11：移动端身份登录（最小闭环）
    if (p === '/api/mobile/auth/login') return handleMobileLogin(request, env);
    if (p === '/api/mobile/auth/logout') return handleMobileLogout(request, env);
    // CF-WPS-61：改密码（首次登录强制走这一步）
    if (p === '/api/mobile/auth/password') return handlePasswordChange(request, env);
    if (p === '/api/mobile/me') return handleMobileMe(request, env);
    // CF-WPS-19：选人数据链（组织关系 + 真实花名册）
    if (p === '/api/mobile/org/subordinates') return handleOrgSubordinates(request, env);
    if (p === '/api/mobile/org/towns') return handleOrgTowns(request, env);
    if (p === '/api/mobile/org/teams') return handleOrgTeams(request, env);
    if (p === '/api/mobile/roster') return handleRoster(request, env);
    if (p === '/api/mobile/geo/regeo') return handleGeoRegeo(request, env);
    // CF-WPS-13：网格长巡查文字业务链
    if (p === '/api/mobile/patrol/meta') return handlePatrolMeta(request, env);
    if (p === '/api/mobile/patrol/submit') return handlePatrolSubmit(request, env, ctx);
    if (p === '/api/mobile/patrol/attach') return handlePatrolAttach(request, env);
    if (p === '/api/mobile/patrol/records') return handlePatrolRecords(request, env);
    // CF-WPS-95：隐患排查（仅 公司管理 × 安环管理部；角色门在 handler 内，服务端为准）
    if (p === '/api/mobile/hazard/submit') return handleHazardSubmit(request, env, ctx);
    if (p === '/api/mobile/hazard/list') return handleHazardList(request, env);
    if (p === '/api/mobile/hazard/detail') return handleHazardDetail(request, env);
    // CF-WPS-100：隐患整改闭环（assign/review 走 hazardGate；todos/rectify 只校验登录态）
    if (p === '/api/mobile/hazard/assignable') return handleHazardAssignable(request, env);
    if (p === '/api/mobile/hazard/assign') return handleHazardAssign(request, env);
    if (p === '/api/mobile/hazard/todos') return handleHazardTodos(request, env);
    if (p === '/api/mobile/hazard/rectify') return handleHazardRectify(request, env);
    if (p === '/api/mobile/hazard/review') return handleHazardReview(request, env);
    // CF-WPS-36：整改待办（跨账号指派）
    if (p === '/api/mobile/assign') return handleAssign(request, env);
    if (p === '/api/mobile/inbox') return handleInbox(request, env);
    // CF-WPS-派发图：图片代理（凭 file_token 取派发原图）。放 inbox 之后、dispatched 之前。
    if (p === '/api/mobile/photo') return handleServerPhoto(request, env);
    if (p === '/api/mobile/dispatched') return handleDispatched(request, env);
    if (p === '/api/mobile/summary') return handleSummary(request, env);
    if (p === '/api/mobile/assign/complete') return handleAssignComplete(request, env);
    // CF-WPS-41：微信推送绑定（GET 状态 / POST 绑定或解绑）
    if (p === '/api/mobile/wx/status') return handleWxStatus(request, env);
    if (p === '/api/mobile/wx/bind') return handleWxBind(request, env);

    return jsonRes({ success: false, code: 'NOT_FOUND', message: 'unknown route', path: p }, 404);
  },
};

// 导出供 Node 测试复用（Cloudflare 运行时不依赖这些导出）
//
// ⚠️⚠️ 改了上面的正式代码？**必须重新生成 deploy.js**，否则线上跑的还是旧逻辑且不会报错！
//   python worker/_scratch/mkdeploy.py     # 切出 deploy.js（= 本文件砍掉下面这些具名导出）
//   node   worker/test/_t6c-deploy-drift.mjs   # 校验两者同步（红灯就去跑上一行）
//   npx wrangler deploy                    # 部署
//   原因：wrangler 3.114.17 的模块校验拒绝「export default {fetch}」与「非函数具名导出」共存
//        （报 Incorrect type for map entry），所以部署入口是 deploy.js 而不是本文件。
//
// 导出供 Node 测试复用（Cloudflare 运行时不依赖这些导出）
export {
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
  handleOrgTowns,
  handleOrgTeams,
  townTeams,
  sortTeams,
  teamSortKey,
  handleRoster,
  mapRosterRecord,
  rosterAreaHit,
  ledgerChildren,
  ledgerSubtree,
  splitOrg,
  ORG_MAX_DEPTH,
  // CF-WPS-32（作业中心口径：镇/乡/街道 + 公园 + 作业中心，供单测直接复用真实逻辑）
  townLabel,
  isTownName,
  isUnitName,
  ledgerTowns,
  ledgerTownPeople,
  ledgerNameCount,
  fillUnitHead,
  // CF-WPS-58（业务口径：身份表角色压过花名册职位 —— 公司管理不得当整改接收人）
  isCompanyGrade,
  assigneeIsCompanyRole,
  // CF-WPS-60（派发目标列表排除环卫/市政园林作业中心；离线测试用）
  NON_DISPATCH_UNITS,
  // CF-WPS-61（密码保护：首次登录强制改密）
  handlePasswordChange,
  guardPasswordChanged,
  defaultPassword,
  hashPassword,
  verifyStoredPassword,
  weakPasswordReason,
  checkPassword,
  PWD_HASH_FIELD,
  PWD_GUARDED_ROUTES,
  TOWN_ANCHOR_RE,
  UNIT_ANCHOR_RE,
  handlePatrolMeta,
  handlePatrolSubmit,
  handlePatrolAttach,
  // CF-WPS-重复台账：并发提交的写后自愈（离线测试用）
  healDuplicatePatrolRecords,
  // CF-WPS-36 整改待办
  handleAssign,
  handleInbox,
  handleAssignComplete,
  todoView,
  todoIsMine,
  todoNowLocal,
  TODO_FIELDS,
  TODO_STATUS,
  // CF-WPS-41 微信推送 + 经理指派范围
  handleWxStatus,
  handleWxBind,
  wxSend,
  wxUidByPhone,
  wxUidFollows,
  ensureWxField,
  notifyAssign,
  managerSubordinatePhones,
  WX_FIELD,
  handlePatrolRecords,
  patrolTarget,
  // CF-WPS-95：隐患排查（单测/联调直接复用真实逻辑）
  handleHazardSubmit,
  handleHazardList,
  handleHazardDetail,
  hazardGate,
  mapHazardRecord,
  hazardCidGet,
  hazardCidPut,
  HAZARD_CATEGORIES,
  HAZARD_LEVELS,
  // CF-WPS-100 隐患整改闭环
  handleHazardAssign,
  handleHazardAssignable,
  handleHazardTodos,
  handleHazardRectify,
  handleHazardReview,
  notifyHazardAssign,
  ensureHazardRectFields,
  HAZARD_FIELDS,
  HAZARD_STATUS_REVIEW,
  HAZARD_STATUS_CLOSED,
  hazardStatusNorm,
  hazardDeadlineCheck,
  hazardOverdue,
  cnToday,
  patrolProblemTypes,
  normalizeGridAreas,
  validatePatrolBody,
  PATROL_GRID_BY,
  // CF-WPS-22（离线回放/单测直接复用真实逻辑，避免测试侧复刻实现）
  mapRosterAreaRecord,
  narrowDuplicateName,
  gridLeaderJobs,
  isGridLeaderJob,
  GRID_LEADER_JOBS_DEFAULT,
  // CF-WPS-21
  handleGeoRegeo,
  amapRegeo,
  regeoNingjin,
  validLatLng,
  GEO_TOWNS,
  detectImageMagic,
  UPLOAD_MAX_BYTES,
  RECORD_FIELD_WHITELIST,
  PROTECTED_FIELDS,
  // 主台账真实列映射（2026-09-18 修正：旧列名在主台账里不存在，写必 1254045）
  FEISHU_FIELD_WHITELIST,
  feishuTypedRecord,
  patrolRecordView,
  patrolIsMine,
  buildPatrolNote,
  parsePatrolNote,
  patrolIdentity,
  PATROL_META_FIELDS,
  ensurePatrolMetaFields,
  NO_VIOLATION_TEXT,
};
