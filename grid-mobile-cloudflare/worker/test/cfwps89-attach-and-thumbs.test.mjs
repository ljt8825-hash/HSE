/* CF-WPS-89 —— 「不是我建的记录也能补照片」+「台账列表直接显示缩略图」
 *
 * 用户原话（两个需求）：
 *   1、给「不是我建的」记录也能补照片；
 *   2、让台账列表直接显示照片缩略图。
 *
 * 改造前：
 *   · 详情页的「换一张现场照片」只对本机记录开放（localRecByServerId + checkerId 判定）
 *     ⇒ 公司管理 / 经理翻到别人上报、但没拍照片的记录，只能看着「现场照片：未记录」，
 *       没有任何补救入口（只能去飞书多维表格手工补传）；
 *   · 后端 handlePatrolAttach 更是**只认记录创建者**（patrolIsMine），
 *     即便前端给了入口也会 404；
 *   · 台账列表（serverRecCard）根本不认识照片 —— 因为 patrolRecordView 只在
 *     full=true 时下发照片字段，列表视图里连 token 都没有。
 *
 * 本次改动：
 *   A. Worker patrolRecordView：photo_count / rectify_photo_count / scene_photo_tokens /
 *      rectify_photo_tokens 移进 base ⇒ **列表也带照片字段**（§B 用真 HTTP 路由断言）。
 *   B. Worker handlePatrolAttach：kind='scene' 放宽到「可见范围内」（resolveViewScope +
 *      patrolInScope），且非本人只能**补空**（目标列已有照片 → 409）；
 *      kind='rectify' 仍限本人（那是整改人自己的凭证）。§A 逐条真跑。
 *   C. 前端 renderServerDetail：非本人 + 无现场照片 + 有权限 → 显示「补传现场照片」卡
 *      （sceneReplaceBox 的 add 模式）。判定收敛进纯函数 shouldOfferSceneAdd（§D1 真跑）。
 *   D. 前端 serverRecCard：现场 / 整改各取第一张渲染 72px 缩略图，IntersectionObserver
 *      懒加载 + 全局 3 并发（§D2 用最小 DOM 桩真跑 appendThumbStrip / pumpThumbQueue）。
 *
 * Run: node worker/test/cfwps89-attach-and-thumbs.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = resolve(__dir, '../../frontend/check.html');
const PAGES_PATH = resolve(__dir, '../../_pages_deploy/check.html');
const html = readFileSync(HTML_PATH, 'utf8');
const pagesHtml = readFileSync(PAGES_PATH, 'utf8');

const workerMod = await import('../index.js');
const worker = workerMod.default;
const { pinyinInitials, hashPassword } = workerMod;

let pass = 0, bad = 0;
const ok = (n, x = '') => { pass++; console.log('  ok  ' + n + (x ? ' :: ' + x : '')); };
const ng = (n, d) => { bad++; console.log('  NG  ' + n + ' :: ' + d); };
const ck = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : ng(n, d || 'assertion false'));

/* ─────────────── 花括号配对精确抽取具名函数 ─────────────── */
function extractFn(name) {
  const re = new RegExp('(?:^|\\n)(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(html);
  if (!m) return null;
  const braceStart = html.indexOf('{', m.index + m[0].length - 1);
  if (braceStart < 0) return null;
  let depth = 0, inS = null, inLC = false, inBC = false, i = braceStart;
  for (; i < html.length; i++) {
    const c = html[i], n = html[i + 1];
    if (inLC) { if (c === '\n') inLC = false; continue; }
    if (inBC) { if (c === '*' && n === '/') { inBC = false; i++; } continue; }
    if (inS) { if (c === '\\') { i++; continue; } if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { inLC = true; i++; continue; }
    if (c === '/' && n === '*') { inBC = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return html.slice(m.index, i);
}

/* ══════════════════ §A Worker：handlePatrolAttach 权限放宽 ══════════════════ */
const SESSION_SECRET = 'mock-session-secret-cfwps89-0123456789';
const FS_APP_TOKEN = 'mock-fs-app-token-89';
const LEDGER_TABLE_ID = 'tblMockLedger89';
const PATROL_TABLE_ID = 'tblMockPatrol89';

const MGR_NAME = '测试八十九经理'; const MGR_PHONE = '13900000891';
const ADM_NAME = '测试八十九管理'; const ADM_PHONE = '13900000892';
const OUT_NAME = '测试八十九外人'; const OUT_PHONE = '13900000893';
const CO_NAME = '测试八十九公司'; const CO_PHONE = '13900000894';
const PW = (n, p) => pinyinInitials(n) + p.slice(-4);
const mkHash = (n, p) => hashPassword(PW(n, p), 20000);

const MGR_HASH = await mkHash(MGR_NAME, MGR_PHONE);
const ADM_HASH = await mkHash(ADM_NAME, ADM_PHONE);
const OUT_HASH = await mkHash(OUT_NAME, OUT_PHONE);
const CO_HASH = await mkHash(CO_NAME, CO_PHONE);

const LEDGER_ROWS = [
  { record_id: 'L-mgr89', fields: { 姓名: MGR_NAME, 直接上级: '八十九上级', 所属部门: '八十九镇作业中心', 职位: '经理', 网格长等级: '二级网格长', 手机号: MGR_PHONE, 分级: '乡镇作业中心经理', 密码哈希: MGR_HASH } },
  { record_id: 'L-adm89', fields: { 姓名: ADM_NAME, 直接上级: MGR_NAME, 所属部门: '八十九镇作业中心', 职位: '管理员', 网格长等级: '二级网格长', 手机号: ADM_PHONE, 分级: '管理员', 密码哈希: ADM_HASH } },
  { record_id: 'L-out89', fields: { 姓名: OUT_NAME, 直接上级: '别处上级', 所属部门: '别处作业中心', 职位: '管理员', 网格长等级: '二级网格长', 手机号: OUT_PHONE, 分级: '管理员', 密码哈希: OUT_HASH } },
  { record_id: 'L-co89', fields: { 姓名: CO_NAME, 直接上级: '', 所属部门: '安环管理部', 职位: '经理', 网格长等级: '一级网格长', 手机号: CO_PHONE, 分级: '公司管理', 密码哈希: CO_HASH } },
];

// ⚠️ record_id / file_token 必须过服务端正则（/^[A-Za-z0-9]{8,64}$/、/^[A-Za-z0-9]{10,120}$/）
const REC_ADM_EMPTY = 'rec89admempty';
const REC_ADM_FULL = 'rec89admfull1';
const REC_OUT_FULL = 'rec89outfull1';
const FT_OLD_A = 'FT89OLDSCENE1';
const FT_OLD_B = 'FT89OLDSCENE2';
const FT_NEW_1 = 'FT89NEWSCENE1';
const FT_NEW_R = 'FT89NEWRECTIF';

const patrolFields = (o) => Object.assign({
  检查时间: '2026-10-15 08:00', 是否三违: '是', 违章行为: '骑车不戴头盔', 违章人员姓名: '张三',
  违章照片: [], 整改后照片: [],
}, o);

const PATROL_ROWS = [
  // 管理员乙自己报的、**没有现场照片**的记录（本次补传的主角）
  { record_id: REC_ADM_EMPTY, fields: patrolFields({ 巡查人ID: ADM_PHONE }) },
  // 管理员乙自己报的、已有两张现场照片的记录
  { record_id: REC_ADM_FULL, fields: patrolFields({ 巡查人ID: ADM_PHONE, 违章照片: [{ file_token: FT_OLD_A }, { file_token: FT_OLD_B }] }) },
  // 别人（外单位管理员）报的、已有照片的记录
  { record_id: REC_OUT_FULL, fields: patrolFields({ 巡查人ID: OUT_PHONE, 违章照片: [{ file_token: FT_OLD_A }] }) },
];

const FIELD_NAMES = ['检查时间', '是否三违', '违章行为', '违章人员姓名', '违章照片', '整改后照片', '备注', '巡查人ID', '巡查时间', '幂等键', '密码哈希'];

let lastUpdate = null;
let putCount = 0;
const unmocked = [];

globalThis.fetch = async (url, init) => {
  const u = String(url);
  const method = String((init && init.method) || 'GET').toUpperCase();
  if (u.includes('/auth/v3/tenant_access_token/internal')) {
    return new Response(JSON.stringify({ code: 0, tenant_access_token: 'mock-tenant-token', expire: 7200 }), { status: 200 });
  }
  const rec = u.match(/\/tables\/([^/?]+)\/records\/([^/?]+)/);
  if (rec && rec[2] !== 'search' && rec[2] !== 'batch_create') {
    const recId = rec[2];
    if (method === 'PUT') {
      const body = JSON.parse((init && init.body) || '{}');
      lastUpdate = { recId, fields: body.fields || {} };
      putCount++;
      return new Response(JSON.stringify({ code: 0, data: { record: { record_id: recId } } }), { status: 200 });
    }
    const row = PATROL_ROWS.find((r) => r.record_id === recId);
    if (!row) return new Response(JSON.stringify({ code: 1254042, msg: 'RecordNotFound' }), { status: 404 });
    return new Response(JSON.stringify({ code: 0, data: { record: { record_id: recId, fields: row.fields } } }), { status: 200 });
  }
  if (u.includes('/records/search')) {
    const items = u.includes(PATROL_TABLE_ID) ? PATROL_ROWS : LEDGER_ROWS;
    return new Response(JSON.stringify({ code: 0, data: { items, has_more: false } }), { status: 200 });
  }
  if (/\/records(\?|$)/.test(u)) {
    const items = u.includes(PATROL_TABLE_ID) ? PATROL_ROWS : LEDGER_ROWS;
    return new Response(JSON.stringify({ code: 0, data: { items, has_more: false } }), { status: 200 });
  }
  if (u.includes('/fields')) {
    return new Response(JSON.stringify({ code: 0, data: { items: FIELD_NAMES.map((n) => ({ field_name: n, type: 1 })), has_more: false } }), { status: 200 });
  }
  if (/\/bitable\/v1\/apps\/[^/]+\/tables(\?|$)/.test(u)) {
    return new Response(JSON.stringify({ code: 0, data: { items: [
      { table_id: LEDGER_TABLE_ID, name: 'H5移动端身份表' },
      { table_id: PATROL_TABLE_ID, name: 'H5员工日常不安全行为台账' },
    ], has_more: false } }), { status: 200 });
  }
  unmocked.push(u);
  throw new Error('UNMOCKED URL (guard): ' + u);
};

const env = {
  STORAGE_BACKEND: 'feishu',
  FS_APP_TOKEN, FS_APP_ID: 'mock-app-id', FS_APP_SECRET: 'mock-app-secret',
  FS_IDENTITY_TABLE_ID: LEDGER_TABLE_ID,
  FS_LEDGER_TABLE_ID: LEDGER_TABLE_ID,
  FS_PATROL_PRODUCTION_TABLE_ID: PATROL_TABLE_ID,
  MOBILE_LOGIN_ENABLED: 'true',
  WORKER_SESSION_SECRET: SESSION_SECRET,
  MOBILE_SESSION_TTL_SECONDS: '7200',
  ROSTER_CACHE_TTL_MS: '0',
};

const login = async (phone, password) => {
  const r = await worker.fetch(new Request('https://worker.local/api/mobile/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.2.0.' + Math.floor(Math.random() * 200) },
    body: JSON.stringify({ phone, password }),
  }), env);
  const j = await r.json().catch(() => ({}));
  return { status: r.status, token: j.token, role: j.role };
};
const attach = (token, payload) => worker.fetch(new Request('https://worker.local/api/mobile/patrol/attach', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
  body: typeof payload === 'string' ? payload : JSON.stringify(payload),
}), env);
const listRecords = (token, qs) => worker.fetch(new Request('https://worker.local/api/mobile/patrol/records' + (qs || ''), {
  headers: token ? { authorization: 'Bearer ' + token } : {},
}), env);

console.log('\n=== CF-WPS-89 · A. /patrol/attach 权限：可见范围内可补传，非本人只能补空 ===\n');

console.log('═══ A0. 前置：mock 账号登录 ═══');
const MGR_L = await login(MGR_PHONE, PW(MGR_NAME, MGR_PHONE));
ck(MGR_L.status === 200 && !!MGR_L.token, '经理登录成功', `HTTP ${MGR_L.status} role=${MGR_L.role}`);
const ADM_L = await login(ADM_PHONE, PW(ADM_NAME, ADM_PHONE));
ck(ADM_L.status === 200 && !!ADM_L.token, '管理员登录成功', `HTTP ${ADM_L.status} role=${ADM_L.role}`);
const OUT_L = await login(OUT_PHONE, PW(OUT_NAME, OUT_PHONE));
ck(OUT_L.status === 200 && !!OUT_L.token, '外单位管理员登录成功', `HTTP ${OUT_L.status}`);
const CO_L = await login(CO_PHONE, PW(CO_NAME, CO_PHONE));
ck(CO_L.status === 200 && !!CO_L.token, '公司管理登录成功', `HTTP ${CO_L.status} role=${CO_L.role}`);
const MGR = MGR_L.token, ADM = ADM_L.token, OUT = OUT_L.token, CO = CO_L.token;

console.log('\n═══ A1. 本人补自己的空记录（原行为，必须仍然可用）═══');
{
  lastUpdate = null; putCount = 0;
  const r = await attach(ADM, { record_id: REC_ADM_EMPTY, kind: 'scene', photo_tokens: [FT_NEW_1] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 200 && j.success === true, '① 本人补传 → 200 success', `HTTP ${r.status} ${JSON.stringify(j)}`);
  ck(j.column === '违章照片', '① 写入列 = 违章照片', String(j.column));
  const wrote = lastUpdate && lastUpdate.fields['违章照片'];
  ck(putCount === 1 && Array.isArray(wrote) && wrote.length === 1 && wrote[0].file_token === FT_NEW_1,
    '① PUT 一次、写入新 token', JSON.stringify(wrote));
}

console.log('\n═══ A2. 经理补**下级**的空记录（CF-WPS-89 核心：不是我建的也能补）═══');
{
  // 先清空，模拟「下级那条还是没照片」
  PATROL_ROWS.find((r) => r.record_id === REC_ADM_EMPTY).fields['违章照片'] = [];
  lastUpdate = null; putCount = 0;
  const r = await attach(MGR, { record_id: REC_ADM_EMPTY, kind: 'scene', photo_tokens: [FT_NEW_1] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 200 && j.success === true,
    '② 经理（DEPT 范围含下级）补传下级的记录 → 200（改造前必然 404）', `HTTP ${r.status} ${JSON.stringify(j)}`);
  ck(putCount === 1 && lastUpdate && lastUpdate.recId === REC_ADM_EMPTY, '② 确实写进了那条记录', `recId=${lastUpdate && lastUpdate.recId}`);
}

console.log('\n═══ A3. 公司管理补任意记录的空照片（ALL 范围）═══');
{
  PATROL_ROWS.find((r) => r.record_id === REC_OUT_FULL).fields['违章照片'] = [];
  lastUpdate = null; putCount = 0;
  const r = await attach(CO, { record_id: REC_OUT_FULL, kind: 'scene', photo_tokens: [FT_NEW_1] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 200 && j.success === true, '③ 公司管理补外单位记录 → 200', `HTTP ${r.status}`);
  ck(putCount === 1, '③ 落库一次');
}

console.log('\n═══ A4. 范围外的人 → 404，且**不落库**（越权防线）═══');
{
  PATROL_ROWS.find((r) => r.record_id === REC_ADM_EMPTY).fields['违章照片'] = [];
  lastUpdate = null; putCount = 0;
  const r = await attach(OUT, { record_id: REC_ADM_EMPTY, kind: 'scene', photo_tokens: [FT_NEW_1] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 404 && j.success !== true,
    '④ 外单位管理员补别人的记录 → 404（SELF 范围不含）', `HTTP ${r.status} code=${j.code}`);
  ck(putCount === 0 && lastUpdate === null, '④ **没有落库**（越权请求连写都没写）');
}

console.log('\n═══ A5. 可见范围内但**已有照片** → 409，不覆盖别人的既有证据 ═══');
{
  PATROL_ROWS.find((r) => r.record_id === REC_ADM_FULL).fields['违章照片'] = [{ file_token: FT_OLD_A }, { file_token: FT_OLD_B }];
  lastUpdate = null; putCount = 0;
  const rM = await attach(MGR, { record_id: REC_ADM_FULL, kind: 'scene', photo_tokens: [FT_NEW_1] });
  const jM = await rM.json().catch(() => ({}));
  ck(rM.status === 409 && jM.code === 'PATROL_FIELD_INVALID',
    '⑤ 经理补「下级已有照片」的记录 → 409（只能补空，不能覆盖）', `HTTP ${rM.status} code=${jM.code}`);
  ck(putCount === 0, '⑤ 409 时没有落库');

  lastUpdate = null; putCount = 0;
  const rC = await attach(CO, { record_id: REC_ADM_FULL, kind: 'scene', photo_tokens: [FT_NEW_1] });
  const jC = await rC.json().catch(() => ({}));
  ck(rC.status === 409, '⑤ 公司管理同样不能覆盖别人的照片 → 409', `HTTP ${rC.status}`);

  // 本人仍可**更换**（覆盖）自己的照片
  lastUpdate = null; putCount = 0;
  const rSelf = await attach(ADM, { record_id: REC_ADM_FULL, kind: 'scene', photo_tokens: [FT_NEW_1] });
  const jSelf = await rSelf.json().catch(() => ({}));
  ck(rSelf.status === 200 && jSelf.success === true, '⑤ 本人换自己的照片仍然 200（换图语义不受影响）', `HTTP ${rSelf.status}`);
  const wrote = lastUpdate && lastUpdate.fields['违章照片'];
  ck(Array.isArray(wrote) && wrote.length === 1 && wrote[0].file_token === FT_NEW_1,
    '⑤ 本人换图是**覆盖**（只剩新 token）', JSON.stringify(wrote));
}

console.log('\n═══ A6. kind=rectify 仍**只限本人**（整改凭证不给别人改）═══');
{
  PATROL_ROWS.find((r) => r.record_id === REC_ADM_EMPTY).fields['整改后照片'] = [];
  lastUpdate = null; putCount = 0;
  const r = await attach(MGR, { record_id: REC_ADM_EMPTY, kind: 'rectify', photo_tokens: [FT_NEW_R] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 404, '⑥ 经理给下级挂整改后照片 → 404（放宽只针对现场照片）', `HTTP ${r.status} code=${j.code}`);
  ck(putCount === 0, '⑥ 没有落库');

  lastUpdate = null; putCount = 0;
  const r2 = await attach(ADM, { record_id: REC_ADM_EMPTY, kind: 'rectify', photo_tokens: [FT_NEW_R] });
  const j2 = await r2.json().catch(() => ({}));
  ck(r2.status === 200 && j2.column === '整改后照片', '⑥ 本人挂整改后照片 → 200', `HTTP ${r2.status} column=${j2.column}`);
}

console.log('\n═══ A7. 未认证 / 入参非法仍被拦住（放宽没有松动基本盘）═══');
{
  lastUpdate = null; putCount = 0;
  const r = await attach('', { record_id: REC_ADM_EMPTY, kind: 'scene', photo_tokens: [FT_NEW_1] });
  ck(r.status === 401, '⑦ 未带 token → 401', `HTTP ${r.status}`);
  const r2 = await attach(ADM, { record_id: REC_ADM_EMPTY, kind: 'scene', photo_tokens: ['short'] });
  ck(r2.status === 400, '⑦ token 格式非法 → 400', `HTTP ${r2.status}`);
  ck(putCount === 0, '⑦ 都没落库');
}

/* ══════════════════ §B Worker：列表视图也下发照片字段 ══════════════════ */
console.log('\n═══ B1. 台账**列表**（不带 ?id=）现在带照片 token ═══');
{
  PATROL_ROWS.find((r) => r.record_id === REC_ADM_FULL).fields['违章照片'] = [{ file_token: FT_OLD_A }, { file_token: FT_OLD_B }];
  PATROL_ROWS.find((r) => r.record_id === REC_ADM_FULL).fields['整改后照片'] = [{ file_token: FT_NEW_R }];
  const r = await listRecords(CO);
  const j = await r.json().catch(() => ({}));
  ck(r.status === 200 && j.success === true, 'B1 列表请求成功', `HTTP ${r.status}`);
  const row = (j.records || []).find((x) => x.record_id === REC_ADM_FULL);
  ck(!!row, 'B1 命中目标记录');
  ck(row && Array.isArray(row.scene_photo_tokens) && row.scene_photo_tokens.length === 2
    && row.scene_photo_tokens[0] === FT_OLD_A,
    'B1 列表项带 scene_photo_tokens（缩略图的数据源）', JSON.stringify(row && row.scene_photo_tokens));
  ck(row && row.photo_count === 2, 'B1 列表项带 photo_count', String(row && row.photo_count));
  ck(row && Array.isArray(row.rectify_photo_tokens) && row.rectify_photo_tokens[0] === FT_NEW_R,
    'B1 列表项带 rectify_photo_tokens', JSON.stringify(row && row.rectify_photo_tokens));
  ck(row && !('client_request_id' in row),
    'B1 列表**仍不下发** client_request_id（敏感/仅详情需要，未被顺手带出来）');
}

console.log('\n═══ B2. 单条详情（?id=）仍然完整（full 字段没被挪坏）═══');
{
  const r = await listRecords(CO, '?id=' + REC_ADM_FULL);
  const j = await r.json().catch(() => ({}));
  const rec = j.record || {};
  ck(r.status === 200 && rec.record_id === REC_ADM_FULL, 'B2 ?id= 拉到单条', `HTTP ${r.status}`);
  ck('client_request_id' in rec && 'photo_status' in rec && 'employee_code' in rec,
    'B2 full 专属字段仍在（client_request_id / photo_status / employee_code）',
    JSON.stringify(Object.keys(rec).filter((k) => ['client_request_id', 'photo_status', 'employee_code'].includes(k))));
  ck(Array.isArray(rec.scene_photo_tokens) && rec.scene_photo_tokens.length === 2, 'B2 full 里照片 token 也没丢');
}

console.log('\n═══ B3. 空照片记录下发空数组（不是 undefined —— 前端据此判断「无照片」）═══');
{
  PATROL_ROWS.find((r) => r.record_id === REC_ADM_EMPTY).fields['违章照片'] = [];
  const r = await listRecords(CO);
  const j = await r.json().catch(() => ({}));
  const row = (j.records || []).find((x) => x.record_id === REC_ADM_EMPTY);
  ck(row && Array.isArray(row.scene_photo_tokens) && row.scene_photo_tokens.length === 0,
    'B3 无照片 → 空数组', JSON.stringify(row && row.scene_photo_tokens));
  ck(row && row.photo_count === 0, 'B3 photo_count = 0', String(row && row.photo_count));
}

/* ══════════════════ §C 前端：静态接线 ══════════════════ */
console.log('\n═══ C1. renderServerDetail 接上「补传」分支 ═══');
{
  const rd = extractFn('renderServerDetail') || '';
  ck(!!rd, 'C1 抽出 renderServerDetail');
  ck(/shouldOfferSceneAdd\(/.test(rd), 'C1 用纯函数 shouldOfferSceneAdd 判定补传入口');
  ck(/mode:\s*["']add["']/.test(rd), 'C1 补传卡以 mode:"add" 渲染（文案是「补传」不是「换一张」）');
  ck(/iOwnIt/.test(rd) && /localRecByServerId\(rid\)/.test(rd), 'C1 先取本机记录、算出 iOwnIt');
  ck(/target\.photoToken/.test(rd), 'C1 补传成功后把新 token 回写进服务端视图（否则重绘还是「未记录」）');
  const sa = extractFn('shouldOfferSceneAdd') || '';
  ck(!!sa, 'C1 shouldOfferSceneAdd 存在（可离线真跑）');
  ck(/o\.hasScenePhoto/.test(sa) && /o\.pending/.test(sa) && /o\.iOwnIt/.test(sa) && /o\.role/.test(sa),
    'C1 判定覆盖 4 个输入：hasScenePhoto / pending / iOwnIt / role');
}

console.log('\n═══ C2. serverRecCard 挂缩略图 ═══');
{
  const sc = extractFn('serverRecCard') || '';
  ck(!!sc, 'C2 抽出 serverRecCard');
  ck(/appendThumbStrip\(card,/.test(sc), 'C2 调用 appendThumbStrip');
  ck(/scene_photo_tokens/.test(sc) && /rectify_photo_tokens/.test(sc), 'C2 现场 / 整改两个 token 都用上');
  ck(/thumbs\.push/.test(sc), 'C2 组 thumbs 列表');
  const at = extractFn('appendThumbStrip') || '';
  ck(!!at, 'C2 appendThumbStrip 存在');
  ck(/img\.dataset\.ft/.test(at) && /io\.observe\(img\)/.test(at), 'C2 每张图挂 dataset.ft 并交给观察器');
  ck(/thumb-tag/.test(at), 'C2 缩略图带「现场 / 整改」角标');
  const pq = extractFn('pumpThumbQueue') || '';
  ck(/THUMB_CONCURRENCY/.test(pq), 'C2 并发闸门用了 THUMB_CONCURRENCY');
  ck(/job\.img\.classList\.add\(["']on["']\)/.test(pq), 'C2 加载成功后淡入（classList.on）');
  ck(/removeChild\(box\)/.test(pq), 'C2 加载失败摘掉**整块**占位（不是只摘 img，否则剩个空灰框）');
  const io = extractFn('thumbObserver') || '';
  ck(/IntersectionObserver/.test(io), 'C2 用 IntersectionObserver 懒加载');
  ck(/typeof IntersectionObserver !== ["']function["']/.test(io), 'C2 老 WebView 无 IO 时降级为直接排队');
  ck(/rootMargin/.test(io), 'C2 有 rootMargin 预热');
  const ro = extractFn('resetThumbObserver') || '';
  ck(/disconnect\(\)/.test(ro) && /thumbQueue\.length = 0/.test(ro), 'C2 resetThumbObserver 断开并清队列');
  ck(/resetThumbObserver\(\)/.test(extractFn('renderMyChecks') || ''), 'C2 renderMyChecks 重绘前 reset');
  ck(/resetThumbObserver\(\)/.test(extractFn('renderStatDetail') || ''), 'C2 renderStatDetail 重绘前 reset');
}

console.log('\n═══ C3. sceneReplaceBox 的 add 模式 & 错误透传 ═══');
{
  const sr = extractFn('sceneReplaceBox') || '';
  ck(/opts\.mode === ["']add["']/.test(sr), 'C3 addMode = opts.mode==="add"');
  ck(/补传现场照片/.test(sr), 'C3 标题「补传现场照片」');
  ck(/确认上传/.test(sr), 'C3 按钮「确认上传」');
  ck(/已取消，未补传照片/.test(sr), 'C3 取消文案随模式切换');
  const ap = extractFn('attachPhotoToRecord') || '';
  ck(/errOut/.test(ap), 'C3 attachPhotoToRecord 支持回传服务端错误文案');
  ck(/aerr\.message \|\|/.test(sr), 'C3 补传失败时优先显示服务端原话（如 409 的说明）');
}

console.log('\n═══ C4. 版本自洽（≥ .88）与副本同步 ═══');
{
  const b = (html.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  const cfg = (html.match(/config\.js\?v=([^"]+)"/) || [])[1];
  const app = (html.match(/app\.js\?v=([^"]+)"/) || [])[1];
  ck(!!b, 'C4 hse-build 存在', b);
  ck(b === cfg && b === app, 'C4 三处版本一致', `${b} / ${cfg} / ${app}`);
  ck(!!b && b >= '2026-10-15.88', 'C4 版本 ≥ .88', b);
  const pb = (pagesHtml.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  ck(pb === b, 'C4 _pages_deploy 副本已同步', pb);
  ck(html === pagesHtml, 'C4 frontend 与 _pages_deploy 逐字节一致');
}

/* ══════════════════ §D 前端：行为层真跑 ══════════════════ */
console.log('\n═══ D1. shouldOfferSceneAdd 真值表（真跑纯函数）═══');
{
  const SA_SRC = extractFn('shouldOfferSceneAdd');
  ck(!!SA_SRC, 'D1 抽出 shouldOfferSceneAdd');
  const f = new Function(SA_SRC + '\nreturn shouldOfferSceneAdd;')();
  const T = (o, want, name) => ck(f(o) === want, 'D1 ' + name, '→ ' + f(o));

  T({ iOwnIt: false, hasScenePhoto: false, pending: false, role: '公司管理' }, true, '公司管理 + 别人的空记录 → 显示补传');
  T({ iOwnIt: false, hasScenePhoto: false, pending: false, role: '经理' }, true, '经理 + 别人的空记录 → 显示补传');
  T({ iOwnIt: false, hasScenePhoto: false, pending: false, role: '管理员' }, false, '管理员 + 别人的空记录 → **不显示**（点了必然 404）');
  T({ iOwnIt: true, hasScenePhoto: false, pending: false, role: '管理员' }, true, '本人 + 自己的空记录 → 显示（本机照片丢了也能补）');
  T({ iOwnIt: false, hasScenePhoto: true, pending: false, role: '公司管理' }, false, '已有现场照片 → 不显示（后端会 409）');
  T({ iOwnIt: false, hasScenePhoto: false, pending: true, role: '公司管理' }, false, 'full 详情还没回来（pending）→ 不显示（避免误报「没有照片」）');
  T({ iOwnIt: true, hasScenePhoto: true, pending: false, role: '经理' }, false, '已有照片 → 不显示');
  T(null, false, '空输入不抛错');
  T(undefined, false, 'undefined 不抛错');
}

console.log('\n═══ D2. 缩略图懒加载真跑（最小 DOM 桩 + 可控 loadServerPhoto）═══');
{
  const a = html.indexOf('const THUMB_CONCURRENCY');
  const b = html.indexOf('function appendThumbStrip');
  const THUMB_SRC = (a >= 0 && b > a) ? html.slice(a, b) : null;
  const APPEND_SRC = extractFn('appendThumbStrip');
  ck(!!THUMB_SRC && !!APPEND_SRC, 'D2 抽出缩略图模块源码');

  const makeEl = (tag) => {
    const el = {
      tagName: tag, className: '', alt: '', src: '', dataset: {}, style: {}, children: [],
      parentNode: null, textContent: '', _on: false,
      classList: { add(c) { if (c === 'on') el._on = true; } },
      appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
      removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentNode = null; return c; },
      remove() { if (el.parentNode) el.parentNode.removeChild(el); },
    };
    return el;
  };
  const fakeDoc = { createElement: (t) => makeEl(t) };

  const buildThumbs = (loadServerPhoto, IO) => {
    const f = new Function('loadServerPhoto', 'document', 'IntersectionObserver',
      THUMB_SRC + '\n' + APPEND_SRC +
      '\nreturn { append: appendThumbStrip, reset: resetThumbObserver, pump: pumpThumbQueue,' +
      ' queue: thumbQueue, busy: () => thumbBusy };');
    return f(loadServerPhoto, fakeDoc, IO);
  };

  // —— D2a：没有 IntersectionObserver（老 WebView）→ 立即排队，但并发 ≤ 3
  {
    const pending = [];
    const started = [];
    const h = buildThumbs((ft) => { started.push(ft); return new Promise((res) => pending.push({ ft, res })); }, undefined);
    const card = makeEl('div');
    h.append(card, [{ ft: 'A1', tag: '现场' }, { ft: 'R1', tag: '整改' }]);
    ck(h.queue.length === 0 && h.busy() === 2, 'D2a 无 IO → 立即派发（2 张同时在飞）', `busy=${h.busy()}`);
    ck(card.children.length === 1 && card.children[0].className === 'thumb-strip', 'D2a 卡片上挂了 thumb-strip');
    ck(card.children[0].children.length === 2, 'D2a 两张缩略图占位都在');
    pending.forEach((p) => p.res('blob:' + p.ft));
    await new Promise((r) => setTimeout(r, 0));
    const imgs = card.children[0].children.map((w) => w.children[0]);
    ck(imgs.every((im) => im && im.src.startsWith('blob:')), 'D2a 成功后 img.src 指向 blob URL',
      JSON.stringify(imgs.map((i) => i && i.src)));
    ck(imgs.every((im) => im && im._on === true), 'D2a 成功后 classList.on（淡入）');
    ck(card.children[0].children.map((w) => w.children[1] && w.children[1].textContent).join(',') === '现场,整改',
      'D2a 角标文案 = 现场 / 整改');
  }

  // —— D2b：有 IntersectionObserver → 先 observe，滚进视口才取图
  {
    const started = [];
    const observed = [];
    let fire = null;
    class FakeIO {
      constructor(cb, opts) { this.cb = cb; this.opts = opts; fire = (targets) => cb(targets.map((t) => ({ target: t, isIntersecting: true }))); }
      observe(t) { observed.push(t); }
      unobserve(t) { observed.splice(observed.indexOf(t), 1); }
      disconnect() { observed.length = 0; }
    }
    const h = buildThumbs((ft) => { started.push(ft); return Promise.resolve('blob:' + ft); }, FakeIO);
    const card = makeEl('div');
    h.append(card, [{ ft: 'B1', tag: '现场' }]);
    ck(observed.length === 1 && started.length === 0,
      'D2b 滚进视口前**不发请求**（懒加载核心）', `observed=${observed.length} started=${started.length}`);
    ck(h.busy() === 0, 'D2b 没有在飞请求');
    fire(observed.slice());
    ck(started.length === 1 && started[0] === 'B1', 'D2b 进入视口后才取图', JSON.stringify(started));
    await new Promise((r) => setTimeout(r, 0));
    ck(card.children[0].children[0].children[0].src === 'blob:B1', 'D2b 图片最终落地');
  }

  // —— D2c：全局并发闸门（8 张同时在飞也不能超过 3）
  {
    let inFlight = 0, maxInFlight = 0;
    const resolvers = [];
    const h = buildThumbs(() => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((res) => resolvers.push(() => { inFlight--; res('blob:x'); }));
    }, undefined);
    const card = makeEl('div');
    const many = [];
    for (let i = 0; i < 8; i++) many.push({ ft: 'C' + i, tag: '现场' });
    h.append(card, many);
    ck(maxInFlight === 3, 'D2c 一次最多 3 张在飞', `max=${maxInFlight}`);
    ck(h.queue.length === 5, 'D2c 其余 5 张排队', `queue=${h.queue.length}`);
    // 放行一张 → 队列补一张
    resolvers.shift()();
    await new Promise((r) => setTimeout(r, 0));
    ck(maxInFlight === 3 && h.queue.length === 4, 'D2c 完成一张后立刻补位（仍不超过 3）', `max=${maxInFlight} queue=${h.queue.length}`);
    while (resolvers.length) { resolvers.shift()(); await new Promise((r) => setTimeout(r, 0)); }
    ck(h.busy() === 0 && h.queue.length === 0, 'D2c 全部跑完，闸门归零');
  }

  // —— D2d：取图失败 → 占位整块移除，不留破图
  {
    const h = buildThumbs(() => Promise.resolve(null), undefined);
    const card = makeEl('div');
    h.append(card, [{ ft: 'D1', tag: '现场' }, { ft: 'D2', tag: '整改' }]);
    await new Promise((r) => setTimeout(r, 0));
    ck(card.children[0].children.length === 0, 'D2d 失败的两张都从 DOM 移除（不留破图）',
      `left=${card.children[0].children.length}`);
    ck(card.children.length === 1, 'D2d 外层的 thumb-strip 仍在（不影响卡片其他内容）');
  }

  // —— D2e：reset 清队列 + disconnect
  {
    let disconnected = false;
    class FakeIO2 {
      constructor(cb) { this.cb = cb; }
      observe() { }
      unobserve() { }
      disconnect() { disconnected = true; }
    }
    const h = buildThumbs(() => new Promise(() => { }), FakeIO2);
    const card = makeEl('div');
    h.append(card, [{ ft: 'E1', tag: '现场' }]);
    h.reset();
    ck(disconnected === true, 'D2e reset → observer.disconnect()（不再持有旧卡片引用）');
    ck(h.queue.length === 0, 'D2e reset → 排队项清空');
  }

  // —— D2f：无照片 → 不产生任何 DOM / 请求
  {
    let called = 0;
    const h = buildThumbs(() => { called++; return Promise.resolve(null); }, undefined);
    const card = makeEl('div');
    h.append(card, []);
    ck(card.children.length === 0 && called === 0, 'D2f 没有照片 → 不渲染条、不发请求');
  }
}

console.log(`\n--- ${pass} 通过 / ${bad} 失败 ---`);
process.exit(bad === 0 ? 0 : 1);
