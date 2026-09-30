/* CF-WPS-被指派人确认 离线回归：被指派人整改时把「三违行为 / 违章人员」写回台账
 *
 * 背景（用户反馈的流程要求）：公司管理派发任务后，被指派人点开任务，
 * 应先「确认三违行为 → 选择违章人员」，再拍整改后照片、完成。
 * 服务端此前只接收 { record_id, note, photo_tokens }，不接受也不写行为/人员。
 *
 * 本测试用 mock 飞书端点把 POST /api/mobile/assign/complete 钉死（零真实网络 / 零真实写库）：
 *   ① 合法 violation_desc（命中三违库）+ violation_people → 200，且 PUT 写入
 *      「违章行为」「违章人员姓名」「整改状态」「整改完成时间」「整改说明」「整改后照片」
 *   ② violation_desc 不在标准库 → 400 VIOLATION_DESC_NOT_IN_LIB，且**不落库**
 *   ③ 不传 violation_desc / violation_people（旧前端向后兼容）→ 200，且 PUT **不含**这两列
 *   ④ 非接收人本人 → 403，且不落库
 *   ⑤ 记录不存在 → 404
 *
 * Run: node test/cfwps-rectify-confirm.test.mjs
 */
const workerMod = await import('../index.js');
const worker = workerMod.default;
const { pinyinInitials, hashPassword } = workerMod;

const SESSION_SECRET = 'mock-session-secret-rectify-confirm-0123456789';
const FS_APP_TOKEN = 'mock-fs-app-token-rc';
const LEDGER_TABLE_ID = 'tblMockLedgerRC';
const PATROL_TABLE_ID = 'tblMockPatrolRC';
const THIS_YM = (() => { const d = new Date(Date.now() + 8 * 3600 * 1000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); })();

const ME_NAME = '测试经理丁';
const ME_PHONE = '13900000881';
const PW = pinyinInitials(ME_NAME) + ME_PHONE.slice(-4);

const OTHER_NAME = '测试路人戊';
const OTHER_PHONE = '13900000882';
const OTHER_PW = pinyinInitials(OTHER_NAME) + OTHER_PHONE.slice(-4);

// 已设过自定义密码的身份行 —— 否则会撞上「首次登录须改密」网关（写接口一律 403）
const ME_HASH = await hashPassword(PW, 20000);
const OTHER_HASH = await hashPassword(OTHER_PW, 20000);

const LEDGER_ROWS = [
  { record_id: 'L-me', fields: { 姓名: ME_NAME, 直接上级: '上级丁', 所属部门: '丁片区', 职位: '管理员', 网格长等级: '二级网格长', 手机号: ME_PHONE, 分级: '乡镇作业中心经理', 密码哈希: ME_HASH } },
  { record_id: 'L-other', fields: { 姓名: OTHER_NAME, 直接上级: '上级丁', 所属部门: '丁片区', 职位: '管理员', 网格长等级: '二级网格长', 手机号: OTHER_PHONE, 分级: '管理员', 密码哈希: OTHER_HASH } },
];

const todoFields = (o) => Object.assign({
  检查时间: `${THIS_YM}-01 08:00`, 是否三违: '是', 违章描述: '违章停车', 违章人员: '',
  [ '整改接收人ID' ]: ME_PHONE, 整改接收人姓名: ME_NAME, 整改责任单位: '丁片区',
  指派人ID: '13900000899', 指派人姓名: '测试公司管理', 指派人单位: '安环管理部',
  整改状态: '待整改', 指派时间: `${THIS_YM}-10 09:30`,
}, o);

const PATROL_ROWS = [
  { record_id: 'R-MINE', fields: todoFields({}) },
  { record_id: 'R-OTHER', fields: todoFields({ [ '整改接收人ID' ]: OTHER_PHONE, 整改接收人姓名: OTHER_NAME }) },
];

const FIELD_NAMES = ['整改接收人ID', '整改接收人姓名', '整改责任单位', '整改状态', '指派人ID', '指派人姓名', '指派人单位', '指派时间', '整改完成时间', '整改说明', '违章行为', '违章人员姓名', '违章照片', '整改后照片', '密码哈希', '密码修改时间'];

let lastUpdate = null;   // 捕获最近一次 PUT /records/{id} 的写入内容

globalThis.fetch = async (url, init) => {
  const u = String(url);
  const method = String((init && init.method) || 'GET').toUpperCase();
  if (u.includes('/auth/v3/tenant_access_token/internal')) {
    return new Response(JSON.stringify({ code: 0, tenant_access_token: 'mock-tenant-token', expire: 7200 }), { status: 200 });
  }
  // 单条记录 GET / PUT（排除 search / batch_create）
  const rec = u.match(/\/tables\/([^/?]+)\/records\/([^/?]+)/);
  if (rec && rec[2] !== 'search' && rec[2] !== 'batch_create') {
    const recId = rec[2];
    if (method === 'PUT') {
      const body = JSON.parse((init && init.body) || '{}');
      lastUpdate = { recId, fields: body.fields || {} };
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
  // 全量列表 GET /records?page_size=500（身份表登录扫描走这条）
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
  console.error('[mock] UNMOCKED URL:', u);
  throw new Error(`UNMOCKED URL (guard): ${u}`);
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

let pass = 0, failn = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_MOCK ${n}${x ? ' :: ' + x : ''}`); };
const fail = (n, d) => { failn++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : fail(n, d || 'assertion false'));

const login = async (phone, password) => {
  const r = await worker.fetch(new Request('https://worker.local/api/mobile/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.' + Math.floor(Math.random() * 200) },
    body: JSON.stringify({ phone, password }),
  }), env);
  const j = await r.json().catch(() => ({}));
  return { status: r.status, token: j.token };
};

const complete = (token, payload) => worker.fetch(new Request('https://worker.local/api/mobile/assign/complete', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
  body: JSON.stringify(payload),
}), env);

console.log(`\n=== CF-WPS-被指派人确认：assign/complete 写回三违行为 / 违章人员 ===\n`);

/* ---- 前置：登录 ---- */
const meLogin = await login(ME_PHONE, PW);
assert(meLogin.status === 200 && !!meLogin.token, '前置：接收人 mock 账号登录成功', `HTTP ${meLogin.status}`);
const ME = meLogin.token;
const otherLogin = await login(OTHER_PHONE, OTHER_PW);
assert(otherLogin.status === 200 && !!otherLogin.token, '前置：非接收人 mock 账号登录成功', `HTTP ${otherLogin.status}`);
const OTHER = otherLogin.token;

/* ---- ① 合法提交：写回行为 / 人员 ---- */
lastUpdate = null;
const r1 = await complete(ME, { record_id: 'R-MINE', note: '已现场整改完成', photo_tokens: ['FT_OK_1'], violation_desc: '违章停车', violation_people: '张三' });
const j1 = await r1.json().catch(() => ({}));
assert(r1.status === 200 && j1.success === true, '① 合法提交 → 200 success', `HTTP ${r1.status} ${JSON.stringify(j1)}`);
assert(!!lastUpdate && lastUpdate.recId === 'R-MINE', '① PUT 命中正确记录', lastUpdate ? lastUpdate.recId : 'no PUT');
assert(lastUpdate && lastUpdate.fields['违章行为'] === '违章停车', '① 写回「违章行为」= 提交值', lastUpdate && JSON.stringify(lastUpdate.fields['违章行为']));
assert(lastUpdate && lastUpdate.fields['违章人员姓名'] === '张三', '① 写回「违章人员姓名」= 提交值', lastUpdate && JSON.stringify(lastUpdate.fields['违章人员姓名']));
assert(lastUpdate && lastUpdate.fields['整改状态'] === '已完成', '① 写回「整改状态」= 已完成', lastUpdate && JSON.stringify(lastUpdate.fields['整改状态']));
assert(lastUpdate && !!lastUpdate.fields['整改完成时间'], '① 写回「整改完成时间」', lastUpdate && JSON.stringify(lastUpdate.fields['整改完成时间']));
assert(lastUpdate && lastUpdate.fields['整改说明'] === '已现场整改完成', '① 写回「整改说明」', lastUpdate && JSON.stringify(lastUpdate.fields['整改说明']));
assert(lastUpdate && Array.isArray(lastUpdate.fields['整改后照片']) && lastUpdate.fields['整改后照片'][0].file_token === 'FT_OK_1', '① 写回「整改后照片」附件', lastUpdate && JSON.stringify(lastUpdate.fields['整改后照片']));

/* ---- ② 非法行为（不在三违库）→ 400 且不落库 ---- */
lastUpdate = null;
const r2 = await complete(ME, { record_id: 'R-MINE', note: 'x', violation_desc: '自造三违项', violation_people: '李四' });
const j2 = await r2.json().catch(() => ({}));
assert(r2.status === 400 && j2.code === 'VIOLATION_DESC_NOT_IN_LIB', '② 非标准三违行为 → 400 VIOLATION_DESC_NOT_IN_LIB', `HTTP ${r2.status} ${JSON.stringify(j2)}`);
assert(lastUpdate === null, '② 拒绝时**不落库**（无 PUT）', lastUpdate ? JSON.stringify(lastUpdate.fields) : 'ok');

/* ---- ③ 向后兼容：不传行为/人员 → 200 且不写这两列 ---- */
lastUpdate = null;
const r3 = await complete(ME, { record_id: 'R-MINE', note: '旧前端完成' });
const j3 = await r3.json().catch(() => ({}));
assert(r3.status === 200 && j3.success === true, '③ 不传行为/人员 → 200 success（向后兼容）', `HTTP ${r3.status}`);
assert(lastUpdate && !('违章行为' in lastUpdate.fields) && !('违章人员姓名' in lastUpdate.fields), '③ PUT 不含「违章行为」「违章人员姓名」', lastUpdate ? JSON.stringify(Object.keys(lastUpdate.fields)) : 'no PUT');
assert(lastUpdate && lastUpdate.fields['整改状态'] === '已完成', '③ 仍正常回写整改状态', lastUpdate && JSON.stringify(lastUpdate.fields['整改状态']));

/* ---- ④ 非接收人本人 → 403 且不落库 ---- */
lastUpdate = null;
const r4 = await complete(OTHER, { record_id: 'R-MINE', note: '越权', violation_desc: '违章停车', violation_people: '王五' });
const j4 = await r4.json().catch(() => ({}));
assert(r4.status === 403, '④ 非接收人提交 → 403', `HTTP ${r4.status} ${JSON.stringify(j4)}`);
assert(lastUpdate === null, '④ 越权时**不落库**（无 PUT）', lastUpdate ? JSON.stringify(lastUpdate.fields) : 'ok');

/* ---- ⑤ 记录不存在 → 404 ---- */
const r5 = await complete(ME, { record_id: 'R-NOPE', note: 'x' });
assert(r5.status === 404, '⑤ 记录不存在 → 404', `HTTP ${r5.status}`);

/* ---- ⑥ 缺 record_id → 400 ---- */
const r6 = await complete(ME, { note: 'x' });
assert(r6.status === 400, '⑥ 缺 record_id → 400', `HTTP ${r6.status}`);

console.log(`\n===== RESULT: ${pass} PASS_MOCK, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
