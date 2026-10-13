/* CF-WPS-换图 · 后端侧 —— 「详情页换图」最终要落到台账附件列被**覆盖**
 *
 * 背景：CF-WPS-换图 的前端链路是
 *     选图 → compressImage → POST /api/mobile/upload 拿新 file_token
 *          → POST /api/mobile/patrol/attach {record_id, kind:'scene', photo_tokens:[新token]}
 * 前端只负责「把新 token 交给后端」；**「台账附件列到底有没有被覆盖」取决于本文件的被测对象**：
 *     handlePatrolAttach → adapter.updateRecord(… { 违章照片: tokens.map(t => ({file_token:t})) })
 * 这里把飞书端点全部 mock 掉（零真实网络 / 零真实写库），断言 PUT 的**写入内容**：
 *   ① kind='scene' → 写「违章照片」，且写入值**只有新 token**（覆盖，不是追加 —— 换图的核心语义）；
 *   ② kind='rectify' → 写「整改后照片」，且不碰「违章照片」；
 *   ③ 同一 token 重复传 → 去重（count 与实际写入都是 1）；
 *   ④ 归属校验：只能改自己的记录（别人的 / 不存在的 → 404，且**不落库**）；
 *   ⑤ 入参非法（record_id / photo_tokens 数量或格式）→ 400，且不落库；
 *   ⑥ 未认证 → 401；OPTIONS 预检 → 204。
 *
 * 配套的前端 E2E：test/cfwps77-scene-replace.e2e.mjs（真浏览器走详情页换图 UI）。
 * 两者合起来才是完整的「详情页换图 → 台账附件列确实被覆盖」。
 *
 * Run: node worker/test/cfwps77-attach-overwrite.test.mjs
 */
const workerMod = await import('../index.js');
const worker = workerMod.default;
const { pinyinInitials, hashPassword } = workerMod;

const SESSION_SECRET = 'mock-session-secret-attach-overwrite-0123456789';
const FS_APP_TOKEN = 'mock-fs-app-token-aw';
const LEDGER_TABLE_ID = 'tblMockLedgerAW';
const PATROL_TABLE_ID = 'tblMockPatrolAW';

const ME_NAME = '测试换图甲';
const ME_PHONE = '13900000771';
const OTHER_NAME = '测试换图乙';
const OTHER_PHONE = '13900000772';
const PW = (n, p) => pinyinInitials(n) + p.slice(-4);

const ME_HASH = await hashPassword(PW(ME_NAME, ME_PHONE), 20000);   // 已改密 → 绕过「首次登录须改密」网关
const OTHER_HASH = await hashPassword(PW(OTHER_NAME, OTHER_PHONE), 20000);

const LEDGER_ROWS = [
  { record_id: 'L-me', fields: { 姓名: ME_NAME, 直接上级: '换图上级', 所属部门: '换图片区', 职位: '管理员', 网格长等级: '二级网格长', 手机号: ME_PHONE, 分级: '管理员', 密码哈希: ME_HASH } },
  { record_id: 'L-other', fields: { 姓名: OTHER_NAME, 直接上级: '换图上级', 所属部门: '换图片区', 职位: '管理员', 网格长等级: '二级网格长', 手机号: OTHER_PHONE, 分级: '管理员', 密码哈希: OTHER_HASH } },
];

// ⚠️ record_id / file_token 都要过服务端正则：/^[A-Za-z0-9]{8,64}$/、/^[A-Za-z0-9]{10,120}$/
//    —— 所以**不能带下划线/短横线**，也不能太短。
const REC_MINE = 'recMINE00001';
const REC_OTHER = 'recOTHER0001';
const REC_MISSING = 'recNOPE00001';
const FT_OLD_1 = 'FTOLDSCENE01';
const FT_OLD_2 = 'FTOLDSCENE02';
const FT_NEW_SCENE = 'FTNEWSCENE001';
const FT_NEW_RECT = 'FTNEWRECTIFY01';

const patrolFields = (o) => Object.assign({
  检查时间: '2026-10-13 08:00', 是否三违: '是', 违章行为: '闯红灯', 违章人员姓名: '张三',
  违章照片: [], 整改后照片: [],
}, o);

const PATROL_ROWS = [
  // 本机记录：原本挂着两张旧现场照片 —— 换图后必须只剩新图
  { record_id: REC_MINE, fields: patrolFields({ 巡查人ID: ME_PHONE, 违章照片: [{ file_token: FT_OLD_1 }, { file_token: FT_OLD_2 }] }) },
  { record_id: REC_OTHER, fields: patrolFields({ 巡查人ID: OTHER_PHONE, 违章照片: [{ file_token: FT_OLD_1 }] }) },
];

const FIELD_NAMES = ['检查时间', '是否三违', '违章行为', '违章人员姓名', '违章照片', '整改后照片', '备注', '巡查人ID', '巡查时间', '幂等键', '密码哈希'];

let lastUpdate = null;      // 捕获最近一次 PUT /records/{id}
let putCount = 0;
let unmocked = [];

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

let pass = 0, bad = 0;
const ok = (n, x = '') => { pass++; console.log('  ok  ' + n + (x ? ' :: ' + x : '')); };
const ng = (n, d) => { bad++; console.log('  NG  ' + n + ' :: ' + d); };
const ck = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : ng(n, d || 'assertion false'));

const login = async (phone, password) => {
  const r = await worker.fetch(new Request('https://worker.local/api/mobile/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.1.0.' + Math.floor(Math.random() * 200) },
    body: JSON.stringify({ phone, password }),
  }), env);
  const j = await r.json().catch(() => ({}));
  return { status: r.status, token: j.token };
};
const attach = (token, payload) => worker.fetch(new Request('https://worker.local/api/mobile/patrol/attach', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
  body: typeof payload === 'string' ? payload : JSON.stringify(payload),
}), env);

console.log('\n=== CF-WPS-换图 · 后端：/api/mobile/patrol/attach 必须**覆盖**附件列 ===\n');

/* ---- 前置 ---- */
console.log('═══ 0. 前置：mock 账号登录 ═══');
const meLogin = await login(ME_PHONE, PW(ME_NAME, ME_PHONE));
ck(meLogin.status === 200 && !!meLogin.token, '本人账号登录成功', `HTTP ${meLogin.status}`);
const ME = meLogin.token;
const otherLogin = await login(OTHER_PHONE, PW(OTHER_NAME, OTHER_PHONE));
ck(otherLogin.status === 200 && !!otherLogin.token, '他人账号登录成功', `HTTP ${otherLogin.status}`);
const OTHER = otherLogin.token;

/* ---- ① 换现场照片 = 覆盖「违章照片」列 ---- */
console.log('\n═══ 1. kind=scene：覆盖「违章照片」列（换图核心语义）═══');
{
  lastUpdate = null; putCount = 0;
  const r = await attach(ME, { record_id: REC_MINE, kind: 'scene', photo_tokens: [FT_NEW_SCENE] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 200 && j.success === true, '① 换图 → 200 success', `HTTP ${r.status} ${JSON.stringify(j)}`);
  ck(j.column === '违章照片', '① 响应标明写入列 = 违章照片', String(j.column));
  ck(putCount === 1 && lastUpdate && lastUpdate.recId === REC_MINE, '① PUT 命中且只写一次', `recId=${lastUpdate && lastUpdate.recId} put=${putCount}`);
  const wrote = lastUpdate && lastUpdate.fields['违章照片'];
  ck(Array.isArray(wrote) && wrote.length === 1 && wrote[0].file_token === FT_NEW_SCENE,
    '① 写入值 = 只含新 token 的 1 项', JSON.stringify(wrote));
  const flat = JSON.stringify(wrote);
  ck(!flat.includes(FT_OLD_1) && !flat.includes(FT_OLD_2),
    '① **覆盖**语义：旧的两张图都不在写入值里（不是追加）', flat);
  ck(lastUpdate && !('整改后照片' in lastUpdate.fields),
    '① 不误写「整改后照片」列', JSON.stringify(Object.keys((lastUpdate && lastUpdate.fields) || {})));
}

/* ---- ② 整改后照片走 kind=rectify，且不碰现场照片列 ---- */
console.log('\n═══ 2. kind=rectify：写「整改后照片」，不动「违章照片」═══');
{
  lastUpdate = null; putCount = 0;
  const r = await attach(ME, { record_id: REC_MINE, kind: 'rectify', photo_tokens: [FT_NEW_RECT] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 200 && j.column === '整改后照片', '② 响应列 = 整改后照片', `HTTP ${r.status} column=${j.column}`);
  const wrote = lastUpdate && lastUpdate.fields['整改后照片'];
  ck(Array.isArray(wrote) && wrote.length === 1 && wrote[0].file_token === FT_NEW_RECT, '② 写入整改后照片 token', JSON.stringify(wrote));
  ck(lastUpdate && !('违章照片' in lastUpdate.fields), '② 不误写「违章照片」列（现场图必须还在）');
}

/* ---- ③ kind 缺省/非法一律按 scene（老前端兼容）---- */
console.log('\n═══ 3. kind 缺省或非法 → 按 scene 处理 ═══');
{
  lastUpdate = null;
  const r = await attach(ME, { record_id: REC_MINE, photo_tokens: [FT_NEW_SCENE] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 200 && j.column === '违章照片', '③ 不传 kind → 违章照片', `column=${j.column}`);
  lastUpdate = null;
  const r2 = await attach(ME, { record_id: REC_MINE, kind: '乱写', photo_tokens: [FT_NEW_SCENE] });
  const j2 = await r2.json().catch(() => ({}));
  ck(r2.status === 200 && j2.column === '违章照片', '③ 非法 kind → 违章照片（不报错、不乱写列）', `column=${j2.column}`);
}

/* ---- ④ 同一 token 重复传 → 去重 ---- */
console.log('\n═══ 4. 重复 token 去重 ═══');
{
  lastUpdate = null;
  const r = await attach(ME, { record_id: REC_MINE, kind: 'scene', photo_tokens: [FT_NEW_SCENE, FT_NEW_SCENE, FT_NEW_SCENE] });
  const j = await r.json().catch(() => ({}));
  const wrote = lastUpdate && lastUpdate.fields['违章照片'];
  ck(j.count === 1, '④ 响应 count = 1', String(j.count));
  ck(Array.isArray(wrote) && wrote.length === 1, '④ 实际写入 1 项', JSON.stringify(wrote));
}

/* ---- ⑤ 归属校验：只能换自己的记录 ---- */
console.log('\n═══ 5. 归属校验：换不了别人的记录 ═══');
{
  lastUpdate = null; putCount = 0;
  const r = await attach(ME, { record_id: REC_OTHER, kind: 'scene', photo_tokens: [FT_NEW_SCENE] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 404 && j.code === 'NOT_FOUND', '⑤ 换别人的记录 → 404 NOT_FOUND', `HTTP ${r.status} ${j.code}`);
  ck(putCount === 0, '⑤ 且**完全不落库**（没有 PUT）', 'put=' + putCount);

  lastUpdate = null; putCount = 0;
  const r2 = await attach(ME, { record_id: REC_MISSING, kind: 'scene', photo_tokens: [FT_NEW_SCENE] });
  const j2 = await r2.json().catch(() => ({}));
  ck(r2.status === 404 && j2.code === 'NOT_FOUND', '⑤ 记录不存在 → 404', `HTTP ${r2.status} ${j2.code}`);
  ck(putCount === 0, '⑤ 且不落库', 'put=' + putCount);
}

/* ---- ⑥ 入参非法 ---- */
console.log('\n═══ 6. 入参非法 → 400 且不落库 ═══');
{
  const cases = [
    ['record_id 太短', { record_id: 'short', kind: 'scene', photo_tokens: [FT_NEW_SCENE] }],
    ['record_id 带非法字符', { record_id: 'rec-MINE-001', kind: 'scene', photo_tokens: [FT_NEW_SCENE] }],
    ['photo_tokens 空数组', { record_id: REC_MINE, kind: 'scene', photo_tokens: [] }],
    ['photo_tokens 非数组', { record_id: REC_MINE, kind: 'scene', photo_tokens: FT_NEW_SCENE }],
    ['photo_tokens 超 3 个', { record_id: REC_MINE, kind: 'scene', photo_tokens: [FT_NEW_SCENE, FT_NEW_RECT, 'FTTHIRD00001', 'FTFOURTH0001'] }],
    ['token 太短', { record_id: REC_MINE, kind: 'scene', photo_tokens: ['short'] }],
    ['token 带非法字符', { record_id: REC_MINE, kind: 'scene', photo_tokens: ['ft-new-scene-01'] }],
  ];
  for (const [label, body] of cases) {
    lastUpdate = null; putCount = 0;
    const r = await attach(ME, body);
    const j = await r.json().catch(() => ({}));
    ck(r.status === 400 && j.code === 'PATROL_FIELD_INVALID' && putCount === 0,
      '⑥ ' + label + ' → 400 且不落库', `HTTP ${r.status} ${j.code} put=${putCount}`);
  }
  lastUpdate = null; putCount = 0;
  const rb = await attach(ME, '{ 这不是 json');
  const jb = await rb.json().catch(() => ({}));
  ck(rb.status === 400 && jb.code === 'BAD_REQUEST' && putCount === 0, '⑥ 非法 JSON → 400 且不落库', `HTTP ${rb.status} ${jb.code}`);
}

/* ---- ⑦ 认证 ---- */
console.log('\n═══ 7. 认证与预检 ═══');
{
  const r = await attach(null, { record_id: REC_MINE, kind: 'scene', photo_tokens: [FT_NEW_SCENE] });
  const j = await r.json().catch(() => ({}));
  ck(r.status === 401 && j.code === 'UNAUTHORIZED', '⑦ 无 token → 401', `HTTP ${r.status} ${j.code}`);

  const r2 = await attach('not-a-real-token', { record_id: REC_MINE, kind: 'scene', photo_tokens: [FT_NEW_SCENE] });
  ck(r2.status === 401, '⑦ 伪造 token → 401', `HTTP ${r2.status}`);

  const r3 = await worker.fetch(new Request('https://worker.local/api/mobile/patrol/attach', { method: 'OPTIONS' }), env);
  ck(r3.status === 204, '⑦ OPTIONS 预检 → 204（不需要登录态）', `HTTP ${r3.status}`);
}

/* ---- ⑧ mock 完整性护栏 ---- */
console.log('\n═══ 8. 护栏：没有漏 mock 的飞书请求 ═══');
ck(unmocked.length === 0, '⑧ 所有飞书请求都被 mock 命中', unmocked.length ? unmocked.slice(0, 3).join(' | ') : 'none');

console.log('\n══════════════════════════════');
console.log(bad ? `❌ ${pass} 通过 / ${bad} 失败` : `✅ 全部通过（${pass} 项）`);
process.exit(bad ? 1 : 0);
