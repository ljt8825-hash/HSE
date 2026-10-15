/* CF-WPS-90 —— 「派发任务的整改后照片落本机 + 上传失败自动补挂 + 详情页本机优先」
 *
 * 用户原话（业务模型确认）：
 *   「虽然是派发的记录，但整改人拍的照片，整改人的手机本地就应该存着，而不是从多维表格里抓；
 *     从表里抓的是上级 —— 公司管理（派发）→ 乡镇作业中心经理（派发）→ 管理员（整改），
 *     整改人本机有照片，乡镇经理和公司管理这两个上级才从表里取。」
 *
 * 改造前（三条缺口）：
 *   · 派发记录**不在 db.records**（todoToRec 只造一张卡片壳），整改后照片以前只挂在内存对象
 *     rectifying.afterPhoto 上 ⇒ 页面被系统回收 / 刷新就没了；
 *   · 上传失败（uploadPhotoToken 返回 null）时 tokens=[]，但状态照样回写成「已完成」——
 *     照片彻底丢，且没有任何重试入口；
 *   · 详情页「整改后照片」只认服务端 token ⇒ 整改人自己刚拍的图，在台账里看不到。
 *
 * 本次改动：
 *   A. Worker handlePatrolAttach：kind='rectify' 放宽到**待办接收人（整改人）**（todoIsMine），
 *      让他能给自己那条待办补挂 / 重拍整改后照片；非接收人、非创建者仍 404。§A 逐条真跑。
 *   B. 前端新增 hse_rectify_local_v1 本机暂存层（键 = serverRecordId）：setAfterPhoto 落盘、
 *      submitRectify 成功才标 uploaded、retryPendingSyncOnce 自动补挂、详情页本机优先。§B 静态接线。
 *   C. 暂存层的淘汰 / 配额降级 / 幂等 / 重试全部**真跑**（localStorage 桩）。§C。
 *
 * Run: node worker/test/cfwps90-rectify-local-photo.test.mjs
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

/* ══════════════════ §A Worker：rectify 放宽到「待办接收人」 ══════════════════ */
const SESSION_SECRET = 'mock-session-secret-cfwps90-0123456789';
const FS_APP_TOKEN = 'mock-fs-app-token-90';
const LEDGER_TABLE_ID = 'tblMockLedger90';
const PATROL_TABLE_ID = 'tblMockPatrol90';

const MGR_NAME = '测试九十经理'; const MGR_PHONE = '13900000901';
const ADM_NAME = '测试九十管理'; const ADM_PHONE = '13900000902';
const OUT_NAME = '测试九十外人'; const OUT_PHONE = '13900000903';
const CO_NAME = '测试九十公司'; const CO_PHONE = '13900000904';
const PW = (n, p) => pinyinInitials(n) + p.slice(-4);
const mkHash = (n, p) => hashPassword(PW(n, p), 20000);

const MGR_HASH = await mkHash(MGR_NAME, MGR_PHONE);
const ADM_HASH = await mkHash(ADM_NAME, ADM_PHONE);
const OUT_HASH = await mkHash(OUT_NAME, OUT_PHONE);
const CO_HASH = await mkHash(CO_NAME, CO_PHONE);

const LEDGER_ROWS = [
  { record_id: 'L-mgr90', fields: { 姓名: MGR_NAME, 直接上级: '九十上级', 所属部门: '九十镇作业中心', 职位: '经理', 网格长等级: '二级网格长', 手机号: MGR_PHONE, 分级: '乡镇作业中心经理', 密码哈希: MGR_HASH } },
  { record_id: 'L-adm90', fields: { 姓名: ADM_NAME, 直接上级: MGR_NAME, 所属部门: '九十镇作业中心', 职位: '管理员', 网格长等级: '二级网格长', 手机号: ADM_PHONE, 分级: '管理员', 密码哈希: ADM_HASH } },
  { record_id: 'L-out90', fields: { 姓名: OUT_NAME, 直接上级: '别处上级', 所属部门: '别处作业中心', 职位: '管理员', 网格长等级: '二级网格长', 手机号: OUT_PHONE, 分级: '管理员', 密码哈希: OUT_HASH } },
  { record_id: 'L-co90', fields: { 姓名: CO_NAME, 直接上级: '', 所属部门: '安环管理部', 职位: '经理', 网格长等级: '一级网格长', 手机号: CO_PHONE, 分级: '公司管理', 密码哈希: CO_HASH } },
];

// ⚠️ record_id / file_token 必须过服务端正则（/^[A-Za-z0-9]{8,64}$/、/^[A-Za-z0-9]{10,120}$/）
const REC_ASSIGNED = 'rec90assigned1';   // 公司管理建、派给管理员（整改人 = ADM）
const REC_TO_MGR = 'rec90assigntom1';    // 公司管理建、派给经理（整改人 = MGR）
const FT_SCENE = 'FT90SCENEPHOT1';
const FT_RECT_OLD = 'FT90RECTOOOOO1';
const FT_RECT_NEW = 'FT90RECTNEWWW1';

const patrolFields = (o) => Object.assign({
  检查时间: '2026-10-15 08:00', 是否三违: '是', 违章行为: '骑车不戴头盔', 违章人员姓名: '张三',
  违章照片: [], 整改后照片: [],
}, o);

const PATROL_ROWS = [
  {
    record_id: REC_ASSIGNED,
    fields: patrolFields({
      巡查人ID: CO_PHONE,                     // 创建者 = 公司管理（patrolIsMine 只认他）
      整改接收人ID: ADM_PHONE,                // 整改人 = 管理员（todoIsMine 认他）
      整改接收人姓名: ADM_NAME,
      整改状态: '待整改',
    }),
  },
  {
    record_id: REC_TO_MGR,
    fields: patrolFields({
      巡查人ID: CO_PHONE,
      整改接收人ID: MGR_PHONE,                // 这条派给经理
      整改接收人姓名: MGR_NAME,
      整改状态: '待整改',
    }),
  },
];

const FIELD_NAMES = ['检查时间', '是否三违', '违章行为', '违章人员姓名', '违章照片', '整改后照片', '备注', '巡查人ID', '巡查时间', '幂等键', '密码哈希', '整改接收人ID', '整改接收人姓名', '整改状态'];

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
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.3.0.' + Math.floor(Math.random() * 200) },
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

const resetRow = (recId, patch) => {
  const row = PATROL_ROWS.find((r) => r.record_id === recId);
  row.fields['违章照片'] = [];
  row.fields['整改后照片'] = [];
  if (patch) Object.assign(row.fields, patch);
};

console.log('\n=== CF-WPS-90 · A. /patrol/attach：整改后照片放宽到「待办接收人」 ===\n');

console.log('═══ A0. 前置：mock 账号登录 ═══');
const MGR_L = await login(MGR_PHONE, PW(MGR_NAME, MGR_PHONE));
ck(MGR_L.status === 200 && !!MGR_L.token, '经理登录成功', `HTTP ${MGR_L.status} role=${MGR_L.role}`);
const ADM_L = await login(ADM_PHONE, PW(ADM_NAME, ADM_PHONE));
ck(ADM_L.status === 200 && !!ADM_L.token, '管理员（整改人）登录成功', `HTTP ${ADM_L.status} role=${ADM_L.role}`);
const OUT_L = await login(OUT_PHONE, PW(OUT_NAME, OUT_PHONE));
ck(OUT_L.status === 200 && !!OUT_L.token, '外单位管理员登录成功', `HTTP ${OUT_L.status}`);
const CO_L = await login(CO_PHONE, PW(CO_NAME, CO_PHONE));
ck(CO_L.status === 200 && !!CO_L.token, '公司管理（创建者）登录成功', `HTTP ${CO_L.status} role=${CO_L.role}`);
const MGR = MGR_L.token, ADM = ADM_L.token, OUT = OUT_L.token, CO = CO_L.token;

console.log('\n═══ A1. 整改人（待办接收人）给自己那条派发记录补挂整改后照片 ═══');
{
  resetRow(REC_ASSIGNED);
  lastUpdate = null; putCount = 0;
  const r = await attach(ADM, { record_id: REC_ASSIGNED, kind: 'rectify', photo_tokens: [FT_RECT_NEW] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 200 && j.success === true,
    '① 整改人补挂 → 200（改造前必然 404：他不是记录创建者）', `HTTP ${r.status} ${JSON.stringify(j)}`);
  ck(j.column === '整改后照片', '① 写入列 = 整改后照片', String(j.column));
  const wrote = lastUpdate && lastUpdate.fields['整改后照片'];
  ck(putCount === 1 && Array.isArray(wrote) && wrote.length === 1 && wrote[0].file_token === FT_RECT_NEW,
    '① PUT 一次、写入新 token', JSON.stringify(wrote));
  ck(lastUpdate && !('违章照片' in lastUpdate.fields),
    '① **没有顺手动现场照片列**（只写目标列）', JSON.stringify(Object.keys((lastUpdate && lastUpdate.fields) || {})));
}

console.log('\n═══ A2. 整改人重拍（目标列已有照片）→ 覆盖，而不是 409 ═══');
{
  resetRow(REC_ASSIGNED, { 整改后照片: [{ file_token: FT_RECT_OLD }] });
  lastUpdate = null; putCount = 0;
  const r = await attach(ADM, { record_id: REC_ASSIGNED, kind: 'rectify', photo_tokens: [FT_RECT_NEW] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 200 && j.success === true,
    '② 整改人重拍 → 200（现场照片的「只能补空」限制**不**套在整改照片上）', `HTTP ${r.status} code=${j.code}`);
  const wrote = lastUpdate && lastUpdate.fields['整改后照片'];
  ck(Array.isArray(wrote) && wrote.length === 1 && wrote[0].file_token === FT_RECT_NEW,
    '② 覆盖为最新一张（只剩新 token）', JSON.stringify(wrote));
}

console.log('\n═══ A3. 记录创建者（公司管理）挂整改照片 —— 老路径不受影响 ═══');
{
  resetRow(REC_ASSIGNED);
  lastUpdate = null; putCount = 0;
  const r = await attach(CO, { record_id: REC_ASSIGNED, kind: 'rectify', photo_tokens: [FT_RECT_NEW] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 200 && j.column === '整改后照片', '③ 创建者挂整改照片 → 200（patrolIsMine 分支）', `HTTP ${r.status}`);
  ck(putCount === 1, '③ 落库一次');
}

console.log('\n═══ A4. 非创建者、非整改人 → 404，且**不落库**（越权防线）═══');
{
  resetRow(REC_ASSIGNED);
  lastUpdate = null; putCount = 0;
  const rM = await attach(MGR, { record_id: REC_ASSIGNED, kind: 'rectify', photo_tokens: [FT_RECT_NEW] });
  const jM = await rM.json().catch(() => ({}));
  ck(rM.status === 404 && jM.success !== true,
    '④ 经理（这条派给了管理员）挂整改照片 → 404', `HTTP ${rM.status} code=${jM.code}`);
  ck(putCount === 0 && lastUpdate === null, '④ **没有落库**');

  lastUpdate = null; putCount = 0;
  const rO = await attach(OUT, { record_id: REC_ASSIGNED, kind: 'rectify', photo_tokens: [FT_RECT_NEW] });
  ck(rO.status === 404, '④ 外单位管理员 → 404', `HTTP ${rO.status}`);
  ck(putCount === 0, '④ 没有落库');
}

console.log('\n═══ A5. 待办接收人字段指向别人 → 404（判定的是「我」而不是「有人」）═══');
{
  resetRow(REC_TO_MGR);
  lastUpdate = null; putCount = 0;
  const r = await attach(ADM, { record_id: REC_TO_MGR, kind: 'rectify', photo_tokens: [FT_RECT_NEW] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 404, '⑤ 这条派给了经理，管理员来挂 → 404', `HTTP ${r.status} code=${j.code}`);
  ck(putCount === 0, '⑤ 没有落库');

  lastUpdate = null; putCount = 0;
  const r2 = await attach(MGR, { record_id: REC_TO_MGR, kind: 'rectify', photo_tokens: [FT_RECT_NEW] });
  ck(r2.status === 200, '⑤ 该条的整改人（经理）自己挂 → 200', `HTTP ${r2.status}`);
}

console.log('\n═══ A6. 放宽 rectify 没有顺带松开 scene（现场照片仍按可见范围）═══');
{
  resetRow(REC_ASSIGNED);
  lastUpdate = null; putCount = 0;
  const r = await attach(ADM, { record_id: REC_ASSIGNED, kind: 'scene', photo_tokens: [FT_SCENE] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 404,
    '⑥ 整改人给「别人的记录」补现场照片 → 404（管理员 = SELF 范围，不含）', `HTTP ${r.status} code=${j.code}`);
  ck(putCount === 0, '⑥ 没有落库');
}

console.log('\n═══ A7. 未认证 / 入参非法仍被拦住（放宽没有松动基本盘）═══');
{
  lastUpdate = null; putCount = 0;
  const r = await attach('', { record_id: REC_ASSIGNED, kind: 'rectify', photo_tokens: [FT_RECT_NEW] });
  ck(r.status === 401, '⑦ 未带 token → 401', `HTTP ${r.status}`);
  const r2 = await attach(ADM, { record_id: REC_ASSIGNED, kind: 'rectify', photo_tokens: ['short'] });
  ck(r2.status === 400, '⑦ token 格式非法 → 400', `HTTP ${r2.status}`);
  const r3 = await attach(ADM, { record_id: 'x', kind: 'rectify', photo_tokens: [FT_RECT_NEW] });
  ck(r3.status === 400, '⑦ record_id 非法 → 400', `HTTP ${r3.status}`);
  ck(putCount === 0, '⑦ 都没落库');
}

/* ══════════════════ §B 前端：静态接线 ══════════════════ */
console.log('\n═══ B1. 本机暂存层存在且键名 / 上限正确 ═══');
{
  ck(/const RECTIFY_LOCAL_KEY = "hse_rectify_local_v1"/.test(html), 'B1 键名 = hse_rectify_local_v1');
  const maxM = html.match(/const RECTIFY_LOCAL_MAX = (\d+)/);
  ck(maxM && Number(maxM[1]) > 0 && Number(maxM[1]) <= 20, 'B1 条数封顶存在且克制', maxM && maxM[1]);
  ['loadRectifyLocal', 'saveRectifyLocal', 'putRectifyLocal', 'markRectifyLocalUploaded', 'rectifyLocalEntry', 'retryRectifyLocal']
    .forEach((n) => ck(!!extractFn(n), 'B1 ' + n + ' 已定义'));
}

console.log('\n═══ B2. setAfterPhoto：派发记录也落一份本机副本 ═══');
{
  const sap = extractFn('setAfterPhoto') || '';
  ck(!!sap, 'B2 抽出 setAfterPhoto');
  ck(/putRectifyLocal\(rectifying\.serverRecordId/.test(sap),
    'B2 按 serverRecordId 落盘（键就是台账记录 id）');
  ck(/rectifying && rectifying\.serverRecordId/.test(sap), 'B2 先判存在再落盘（本机自建记录走 db.records，无需副本）');
}

console.log('\n═══ B3. retryPendingSyncOnce 先跑一遍整改照片补挂 ═══');
{
  const rp = extractFn('retryPendingSyncOnce') || '';
  ck(!!rp, 'B3 抽出 retryPendingSyncOnce');
  const head = rp.slice(0, rp.indexOf('const pend'));
  ck(/await retryRectifyLocal\(\)/.test(head),
    'B3 在过滤 db.records 之前先 await retryRectifyLocal()（否则派发记录永远补不到）');
}

console.log('\n═══ B4. 详情页「整改后照片」本机优先 + 状态标注 ═══');
{
  const rd = extractFn('renderServerDetail') || '';
  ck(!!rd, 'B4 抽出 renderServerDetail');
  ck(/rectifyLocalEntry\(rid\)/.test(rd), 'B4 读本机副本');
  const iLocal = rd.indexOf('if(rLocal && rLocal.photo)');
  const iTok = rd.indexOf('else if(rTok.length)');
  ck(iLocal >= 0 && iTok > iLocal, 'B4 本机分支排在服务端 token 分支**之前**（本机优先）',
    `iLocal=${iLocal} iTok=${iTok}`);
  ck(/整改后照片（本机）/.test(rd), 'B4 本机图有明确标注「整改后照片（本机）」');
  ck(/已同步到台账/.test(rd) && /待上传（联网后自动补传）/.test(rd), 'B4 两种状态文案都在');
  ck(/rLocal\.uploaded \? "var\(--t3\)" : "var\(--warn\)"/.test(rd), 'B4 未上传用告警色（一眼能看出没进台账）');
}

console.log('\n═══ B5. submitRectify：只有真的传上去了才标「已上传」 ═══');
{
  const sr = extractFn('submitRectify') || '';
  ck(!!sr, 'B5 抽出 submitRectify');
  const hits = (sr.match(/markRectifyLocalUploaded\(/g) || []).length;
  ck(hits === 2, 'B5 服务端派发 / 本人自建两个分支都挂了标记', 'count=' + hits);
  ck(/done\.completedToServer && tokens\.length\) markRectifyLocalUploaded/.test(sr),
    'B5 派发分支：completedToServer **且** 本次带了 token 才标（上传失败必须留 pending）');
  ck(/if\(attached\) markRectifyLocalUploaded/.test(sr),
    'B5 自建分支：attach 成功才标');
}

console.log('\n═══ B6. 版本自洽（≥ .89）与副本同步 ═══');
{
  const b = (html.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  const cfg = (html.match(/config\.js\?v=([^"]+)"/) || [])[1];
  const app = (html.match(/app\.js\?v=([^"]+)"/) || [])[1];
  ck(!!b, 'B6 hse-build 存在', b);
  ck(b === cfg && b === app, 'B6 三处版本一致', `${b} / ${cfg} / ${app}`);
  ck(!!b && b >= '2026-10-15.89', 'B6 版本 ≥ .89', b);
  const pb = (pagesHtml.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  ck(pb === b, 'B6 _pages_deploy 副本已同步', pb);
  ck(html === pagesHtml, 'B6 frontend 与 _pages_deploy 逐字节一致');
}

/* ══════════════════ §C 前端：暂存层真跑 ══════════════════ */
console.log('\n═══ C. hse_rectify_local_v1 暂存层真跑（localStorage 桩）═══');

const RECT_SRC = (() => {
  const a = html.indexOf('const RECTIFY_LOCAL_KEY');
  const b = html.indexOf('function patrolSubmitHint');
  return (a >= 0 && b > a) ? html.slice(a, b) : null;
})();

// localStorage 桩：store 为纯对象；opts.throwOnUploaded 模拟「配额只够存未上传的」
const mkLS = (opts = {}) => {
  const store = {};
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem(k, v) {
      if (opts.throwOnUploaded && String(v).includes('"uploaded":true')) {
        const e = new Error('QuotaExceededError'); throw e;
      }
      if (opts.alwaysThrow) { const e = new Error('QuotaExceededError'); throw e; }
      store[k] = String(v);
    },
    removeItem: (k) => { delete store[k]; },
  };
};

const buildRect = (ls, upTok, attachFn) => {
  const f = new Function('localStorage', 'uploadPhotoToken', 'attachPhotoToRecord',
    RECT_SRC +
    '\nreturn { load: loadRectifyLocal, save: saveRectifyLocal, put: putRectifyLocal,' +
    ' mark: markRectifyLocalUploaded, entry: rectifyLocalEntry, retry: retryRectifyLocal,' +
    ' KEY: RECTIFY_LOCAL_KEY, MAX: RECTIFY_LOCAL_MAX };');
  return f(ls, upTok || (async () => 'TK'), attachFn || (async () => true));
};

console.log('\n═══ C0. 模块源码抽取 ═══');
ck(!!RECT_SRC, 'C0 抽出 CF-WPS-90 暂存层源码', RECT_SRC ? RECT_SRC.length + ' 字符' : 'null');

console.log('\n═══ C1. put / entry / load：落盘并读回 ═══');
{
  const ls = mkLS();
  const h = buildRect(ls);
  h.put('recAAA', 'data:image/jpeg;base64,AAA', 'req-1');
  const e = h.entry('recAAA');
  ck(!!e && e.photo === 'data:image/jpeg;base64,AAA', 'C1 读回照片');
  ck(e.uploaded === false, 'C1 新落盘默认未上传');
  ck(e.reqId === 'req-1', 'C1 记住 reqId（补挂时复用幂等键）');
  ck(typeof e.at === 'number' && e.at > 0, 'C1 带时间戳（淘汰排序用）');
  ck(h.entry('nope') === null, 'C1 不存在的键 → null');
  ck(h.put('', 'data:x') === null && h.put('recAAA', '') === null, 'C1 空 id / 空图 → null（不脏写）');
  // 真的写进了 localStorage（不是只在内存里飘）
  const stored = JSON.parse(ls.store['hse_rectify_local_v1'] || 'null');
  ck(!!stored && !!stored.recAAA && stored.recAAA.photo === 'data:image/jpeg;base64,AAA',
    'C1 真落进 localStorage（页面被回收也能读回）');
  // 换一个「全新页面」实例（缓存清空）也能读到 —— 模拟刷新
  const h2 = buildRect(ls);
  ck(!!h2.entry('recAAA') && h2.entry('recAAA').photo === 'data:image/jpeg;base64,AAA',
    'C1 新实例（模拟刷新）读得到同一份副本');
  ck(h2.entry('recAAA').uploaded === false, 'C1 刷新后仍是待上传状态');
}

console.log('\n═══ C2. put 幂等：同图保留 uploaded/token，换图重置 ═══');
{
  const h = buildRect(mkLS());
  h.put('recAAA', 'data:A', 'req-1');
  h.mark('recAAA', 'TK-1');
  ck(h.entry('recAAA').uploaded === true && h.entry('recAAA').token === 'TK-1', 'C2 标记已上传');
  h.put('recAAA', 'data:A', 'req-1');   // 同一张图再写一次（重绘/重复触发）
  ck(h.entry('recAAA').uploaded === true && h.entry('recAAA').token === 'TK-1',
    'C2 同图重写**保留**已上传状态（否则补传成功后一重绘又退回「待上传」）');
  h.put('recAAA', 'data:B', 'req-2');   // 换新图
  ck(h.entry('recAAA').uploaded === false && h.entry('recAAA').token === '',
    'C2 换图 → 重置为未上传（旧 token 已作废）');
}

console.log('\n═══ C3. 淘汰：先丢「已上传」的最老的，未上传的一律保命 ═══');
{
  const ls = mkLS();
  const h = buildRect(ls);
  const MAX = h.MAX;
  for (let i = 1; i <= MAX; i++) { h.put('r' + i, 'data:' + i); if (i <= 3) h.mark('r' + i, 'TK' + i); }
  ck(Object.keys(h.load()).length === MAX, 'C3 刚好装满不淘汰', 'n=' + Object.keys(h.load()).length);
  h.put('r' + (MAX + 1), 'data:x');
  ck(Object.keys(h.load()).length === MAX, 'C3 超一条立刻回落到上限', 'n=' + Object.keys(h.load()).length);
  ck(h.entry('r1') === null, 'C3 最老的「已上传」被淘汰（表里有副本，丢了不影响上级）');
  ck(!!h.entry('r2') && !!h.entry('r3'), 'C3 其他已上传的还在');
  ck(!!h.entry('r' + (MAX + 1)), 'C3 新写入的一定在');
  // 再把剩余已上传的全挤掉，验证未上传的仍被保留
  h.mark('r2', 'TK2'); h.mark('r3', 'TK3');
  for (let i = 0; i < 3; i++) h.put('extra' + i, 'data:e' + i);
  const keys = Object.keys(h.load());
  ck(keys.length === MAX, 'C3 持续超额仍稳在上限', 'n=' + keys.length);
  const allUploaded = keys.every((k) => h.load()[k].uploaded);
  ck(!allUploaded, 'C3 **未上传的没有被误删**（丢一张没上传的就是永久丢图）',
    'uploaded=' + keys.filter((k) => h.load()[k].uploaded).length + '/' + keys.length);
}

console.log('\n═══ C4. 配额降级：写不下时先丢「已上传」的，再写；绝不抛错 ═══');
{
  const ls = mkLS({ throwOnUploaded: true });
  const h = buildRect(ls);
  h.put('keep', 'data:keep');           // 未上传
  h.put('sent', 'data:sent');           // 待会儿标已上传
  let threw = false;
  try { h.mark('sent', 'TK'); } catch (e) { threw = true; }
  ck(threw === false, 'C4 mark 不抛错（配额异常不得中断整改流程）');
  ck(h.entry('sent') === null, 'C4 配额满 → 已上传的被丢弃');
  ck(!!h.entry('keep'), 'C4 未上传的保留（下次联网还能补挂）');
  ck(JSON.parse(ls.store['hse_rectify_local_v1'])['keep'] !== undefined, 'C4 降级后确实写进了存储');

  // 全写不下 → save 返回 false，且不抛
  const ls2 = mkLS({ alwaysThrow: true });
  const h2 = buildRect(ls2);
  h2.put('a', 'data:a');
  let r = null, t2 = false;
  try { r = h2.save(); } catch (e) { t2 = true; }
  ck(t2 === false && r === false, 'C4 彻底写不下 → 返回 false 且不抛错', 'ret=' + r);
}

console.log('\n═══ C5. retryRectifyLocal 真跑：补挂成功 / 失败留 pending / 重入保护 ═══');
{
  // —— C5a：有 pending → 上传 + attach，成功后标已上传
  {
    const calls = { up: [], attach: [] };
    const h = buildRect(mkLS(),
      async (photo, kind, reqId) => { calls.up.push({ photo, kind, reqId }); return 'TK-NEW'; },
      async (rec, kind, tk) => { calls.attach.push({ rid: rec.serverRecordId, kind, tk }); return true; });
    h.put('recAAA', 'data:A', 'req-1');
    h.put('recBBB', 'data:B', 'req-2');
    h.mark('recBBB', 'TK-OLD');           // 这条已上传 → 不该被重试
    await h.retry();
    ck(calls.up.length === 1 && calls.up[0].photo === 'data:A', 'C5a 只重试未上传的那条', JSON.stringify(calls.up));
    ck(calls.up[0].kind === 'after', 'C5a 上传 kind = after（整改后照片）', calls.up[0].kind);
    ck(calls.up[0].reqId === 'req-1', 'C5a 复用原 reqId 作幂等键', calls.up[0].reqId);
    ck(calls.attach.length === 1 && calls.attach[0].kind === 'rectify' && calls.attach[0].rid === 'recAAA',
      'C5a 补挂 kind=rectify、目标 = 那条记录', JSON.stringify(calls.attach));
    ck(h.entry('recAAA').uploaded === true && h.entry('recAAA').token === 'TK-NEW', 'C5a 成功后标记已上传 + token');
    ck(h.entry('recBBB').uploaded === true, 'C5a 已上传的那条没被碰');
  }

  // —— C5b：上传失败（token=null）→ 保持 pending，且不发 attach
  {
    const calls = { attach: 0 };
    const h = buildRect(mkLS(),
      async () => null,
      async () => { calls.attach++; return true; });
    h.put('recAAA', 'data:A', 'req-1');
    await h.retry();
    ck(h.entry('recAAA').uploaded === false, 'C5b 上传失败 → 仍为待上传（下次再试）');
    ck(calls.attach === 0, 'C5b 没有 token 就不去 attach（避免写空）');
  }

  // —— C5c：attach 失败（返回 false）→ 保持 pending
  {
    const h = buildRect(mkLS(), async () => 'TK-NEW', async () => false);
    h.put('recAAA', 'data:A', 'req-1');
    await h.retry();
    ck(h.entry('recAAA').uploaded === false, 'C5c 补挂失败 → 仍为待上传');
  }

  // —— C5d：uploadPhotoToken 抛错 → 静默吞掉，不冒泡，仍 pending
  {
    const h = buildRect(mkLS(), async () => { throw new Error('network down'); }, async () => true);
    h.put('recAAA', 'data:A', 'req-1');
    let threw = false;
    try { await h.retry(); } catch (e) { threw = true; }
    ck(threw === false, 'C5d 网络异常不冒泡（轮询里调用，抛出去会打断整轮同步）');
    ck(h.entry('recAAA').uploaded === false, 'C5d 仍为待上传');
  }

  // —— C5e：无 pending → 一次网络请求都不发
  {
    let up = 0;
    const h = buildRect(mkLS(), async () => { up++; return 'TK'; }, async () => true);
    h.put('recAAA', 'data:A'); h.mark('recAAA', 'TK');
    await h.retry();
    ck(up === 0, 'C5e 全已上传 → 零请求（轮询高频调用不能白跑）');
  }

  // —— C5f：重入保护（并发调用只跑一轮）
  {
    let up = 0;
    const h = buildRect(mkLS(),
      async () => { up++; await new Promise((r) => setTimeout(r, 5)); return 'TK'; },
      async () => true);
    h.put('recAAA', 'data:A');
    const p1 = h.retry();
    const p2 = h.retry();     // 同步重入：busy 已置位 → 立即返回
    await Promise.all([p1, p2]);
    ck(up === 1, 'C5f 并发重入只跑一轮（busy 闸门）', 'up=' + up);
    ck(h.entry('recAAA').uploaded === true, 'C5f 那一轮正常完成');
  }
}

console.log(`\n--- ${pass} 通过 / ${bad} 失败 ---`);
process.exit(bad === 0 ? 0 : 1);
