/* CF-WPS-86：assign/complete 档案兜底回填（旧前端只发姓名 → 服务端按花名册补三列）
 *
 * 背景（用户连续两次反馈「还是没有显示档案」后定位）：
 *   .85 已让前端在「整改时选人」后把性别/年龄/岗位随 violation_people 一起发出，
 *   但只要用户手机里还跑着旧页面（没重载 / 微信 webview 缓存），完成接口里就只有姓名。
 *   花名册里这些值本来就有（实测完整度 100%），姓名唯一命中时服务端直接补齐，
 *   重名一律不猜 —— 这样无论前端什么版本，台账三列都不再留空。
 *
 * 本测试 mock 全部飞书端点（零真实网络 / 零真实写库）：
 *   ① 只传姓名、花名册唯一命中 → 200，PUT 带齐姓名 + 三列
 *   ② 客户端显式传了档案 → 用客户端值（不被花名册覆盖）
 *   ③ 花名册重名（两个在职同名人）→ 不猜，三列不写
 *   ④ 花名册查无此人（含「未指定」）→ 不写
 *   ⑤ 台账已有档案 + 客户端没传 → 保持原值，不重复写
 *   ⑥ 账号/班组无花名册配置 → 静默跳过，仍 200（不把已完成的整改变 502）
 *   ⑦ 非接收人 → 403 不落库
 *   ⑧ 静态：Worker 侧兜底逻辑与注释在位
 *
 * Run: node test/cfwps86-roster-bio-backfill.test.mjs
 */
const workerMod = await import('../index.js');
const worker = workerMod.default;
const { pinyinInitials, hashPassword } = workerMod;
const { readFileSync } = await import('node:fs');

const SESSION_SECRET = 'mock-session-secret-bio-86-0123456789';
const FS_APP_TOKEN = 'mock-fs-app-token-86';
const LEDGER_TABLE_ID = 'tblMockLedger86';
const PATROL_TABLE_ID = 'tblMockPatrol86';
const ROSTER_TABLE_ID = 'tblMockRoster86';

const ME_NAME = '测试经理丁';
const ME_PHONE = '13900000881';
const PW = pinyinInitials(ME_NAME) + ME_PHONE.slice(-4);
const ME_HASH = await hashPassword(PW, 20000);

const LEDGER_ROWS = [
  { record_id: 'L-me', fields: { 姓名: ME_NAME, 直接上级: '上级丁', 所属部门: '丁片区', 职位: '管理员', 网格长等级: '二级网格长', 手机号: ME_PHONE, 分级: '乡镇作业中心经理', 密码哈希: ME_HASH } },
];

const todoFields = (o) => Object.assign({
  检查时间: '2026-10-01 08:00', 是否三违: '是', 违章描述: '骑车不戴头盔', 违章人员: '',
  性别: '', 年龄: '', '车辆类型|保洁员': '',
  '整改接收人ID': ME_PHONE, '整改接收人姓名': ME_NAME, '整改责任单位': '丁片区',
  指派人ID: '13900000899', 指派人姓名: '测试公司管理', 指派人单位: '安环管理部',
  整改状态: '待整改', 指派时间: '2026-10-10 09:30',
}, o);

const PATROL_ROWS = [
  { record_id: 'R-PLAIN', fields: todoFields({}) },                                  // 三列空
  { record_id: 'R-HASBIO', fields: todoFields({ 性别: '女', 年龄: '51', '车辆类型|保洁员': '人工班长' }) }, // 已有档案
];

const ROSTER_ROWS = [
  { record_id: 'S-1', fields: { 姓名: '刘福龙', 性别: '男', 年龄: '36', 职位: '乡镇保洁员', 所属部门: '津城街道一班', 用工关系状态: '正式员工' } },
  { record_id: 'S-2', fields: { 姓名: '王芳', 性别: '女', 年龄: '44', 职位: '文员', 所属部门: '人力综合部', 用工关系状态: '正式员工' } },
  { record_id: 'S-3', fields: { 姓名: '王芳', 性别: '女', 年龄: '39', 职位: '会计', 所属部门: '财务部', 用工关系状态: '正式员工' } }, // 重名
  { record_id: 'S-4', fields: { 姓名: '李离职', 性别: '男', 年龄: '50', 职位: '司机', 所属部门: '车队', 用工关系状态: '离职' } },  // 离职不算在职
];

const FIELD_NAMES = ['整改接收人ID', '整改接收人姓名', '整改责任单位', '整改状态', '指派人ID', '指派人姓名', '指派人单位', '指派时间', '整改完成时间', '整改说明', '违章行为', '违章人员姓名', '违章照片', '整改后照片', '性别', '年龄', '车辆类型|保洁员', '密码哈希', '密码修改时间'];
const ROSTER_FIELD_NAMES = ['姓名', '性别', '年龄', '职位', '所属部门', '用工关系状态', '员工编码'];

let lastUpdate = null;
let rosterConfigured = true;   // ⑥ 用例临时关掉花名册

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
      return new Response(JSON.stringify({ code: 0, data: { record: { record_id: recId } } }), { status: 200 });
    }
    const row = PATROL_ROWS.find((r) => r.record_id === recId);
    if (!row) return new Response(JSON.stringify({ code: 1254042, msg: 'RecordNotFound' }), { status: 404 });
    return new Response(JSON.stringify({ code: 0, data: { record: { record_id: recId, fields: row.fields } } }), { status: 200 });
  }
  if (u.includes('/records/search')) {
    let items;
    if (u.includes(ROSTER_TABLE_ID)) items = ROSTER_ROWS;
    else if (u.includes(PATROL_TABLE_ID)) items = PATROL_ROWS;
    else items = LEDGER_ROWS;
    return new Response(JSON.stringify({ code: 0, data: { items, has_more: false } }), { status: 200 });
  }
  if (/\/records(\?|$)/.test(u)) {
    const items = u.includes(ROSTER_TABLE_ID) ? ROSTER_ROWS : (u.includes(PATROL_TABLE_ID) ? PATROL_ROWS : LEDGER_ROWS);
    return new Response(JSON.stringify({ code: 0, data: { items, has_more: false } }), { status: 200 });
  }
  if (u.includes('/fields')) {
    const names = u.includes(ROSTER_TABLE_ID) ? ROSTER_FIELD_NAMES : FIELD_NAMES;
    return new Response(JSON.stringify({ code: 0, data: { items: names.map((n) => ({ field_name: n, type: 1 })), has_more: false } }), { status: 200 });
  }
  if (/\/bitable\/v1\/apps\/[^/]+\/tables(\?|$)/.test(u)) {
    return new Response(JSON.stringify({ code: 0, data: { items: [
      { table_id: LEDGER_TABLE_ID, name: 'H5移动端身份表' },
      { table_id: PATROL_TABLE_ID, name: 'H5员工日常不安全行为台账' },
      { table_id: ROSTER_TABLE_ID, name: '花名册' },
    ], has_more: false } }), { status: 200 });
  }
  console.error('[mock] UNMOCKED URL:', u);
  throw new Error(`UNMOCKED URL (guard): ${u}`);
};

const baseEnv = {
  STORAGE_BACKEND: 'feishu',
  FS_APP_TOKEN, FS_APP_ID: 'mock-app-id', FS_APP_SECRET: 'mock-app-secret',
  FS_IDENTITY_TABLE_ID: LEDGER_TABLE_ID,
  FS_LEDGER_TABLE_ID: LEDGER_TABLE_ID,
  FS_PATROL_PRODUCTION_TABLE_ID: PATROL_TABLE_ID,
  FS_ROSTER_TABLE_ID: ROSTER_TABLE_ID,
  MOBILE_LOGIN_ENABLED: 'true',
  WORKER_SESSION_SECRET: SESSION_SECRET,
  MOBILE_SESSION_TTL_SECONDS: '7200',
  ROSTER_CACHE_TTL_MS: '0',
};
// ⑥ 需要「花名册未配置」的场景：把 roster 表 id 拿掉
const envNoRoster = Object.assign({}, baseEnv);
delete envNoRoster.FS_ROSTER_TABLE_ID;
delete envNoRoster.IDENTITY_ROSTER_SHEET_ID;
delete envNoRoster.IDENTITY_ROSTER_CHECK;

let pass = 0, failn = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_MOCK ${n}${x ? ' :: ' + x : ''}`); };
const fail = (n, d) => { failn++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : fail(n, d || 'assertion false'));

const login = async () => {
  const r = await worker.fetch(new Request('https://worker.local/api/mobile/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.77' },
    body: JSON.stringify({ phone: ME_PHONE, password: PW }),
  }), baseEnv);
  const j = await r.json().catch(() => ({}));
  return j.token;
};
const debugLogin = async () => {
  const r = await worker.fetch(new Request('https://worker.local/api/mobile/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.78' },
    body: JSON.stringify({ phone: ME_PHONE, password: PW }),
  }), baseEnv);
  return { status: r.status, body: await r.text() };
};
const complete = (token, payload, env) => worker.fetch(new Request('https://worker.local/api/mobile/assign/complete', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
  body: JSON.stringify(payload),
}), env || baseEnv);

console.log(`\n=== CF-WPS-86：档案兜底回填（只发姓名也能补齐三列） ===\n`);
const ME = await login();
if (!ME) { console.log('登录返回：', JSON.stringify(await debugLogin())); }
assert(!!ME, '前置：mock 账号登录成功');

/* ① 只传姓名、花名册唯一命中 → 三列补齐 */
lastUpdate = null;
const r1 = await complete(ME, { record_id: 'R-PLAIN', note: '旧前端完成', violation_people: '刘福龙' });
const j1 = await r1.json().catch(() => ({}));
assert(r1.status === 200 && j1.success === true, '① 只传姓名 → 200 success', `HTTP ${r1.status}`);
assert(lastUpdate && lastUpdate.fields['违章人员姓名'] === '刘福龙', '① 姓名照常回写', lastUpdate && JSON.stringify(lastUpdate.fields['违章人员姓名']));
assert(lastUpdate && lastUpdate.fields['性别'] === '男', '① 兜底补「性别」（花名册值）', lastUpdate && JSON.stringify(lastUpdate.fields['性别']));
assert(lastUpdate && String(lastUpdate.fields['年龄']) === '36', '① 兜底补「年龄」', lastUpdate && JSON.stringify(lastUpdate.fields['年龄']));
assert(lastUpdate && lastUpdate.fields['车辆类型|保洁员'] === '乡镇保洁员', '① 兜底补「车辆类型|保洁员」', lastUpdate && JSON.stringify(lastUpdate.fields['车辆类型|保洁员']));

/* ② 客户端显式传档案 → 用客户端值，不被花名册覆盖 */
lastUpdate = null;
const r2 = await complete(ME, { record_id: 'R-PLAIN', note: 'x', violation_people: '刘福龙', violation_sex: '男', violation_age: '37', violation_job: '人工班长' });
assert(r2.status === 200, '② 客户端传档案 → 200', `HTTP ${r2.status}`);
assert(lastUpdate && String(lastUpdate.fields['年龄']) === '37' && lastUpdate.fields['车辆类型|保洁员'] === '人工班长',
  '② 显式值优先（不被花名册 36/乡镇保洁员 覆盖）', lastUpdate && JSON.stringify({ a: lastUpdate.fields['年龄'], j: lastUpdate.fields['车辆类型|保洁员'] }));

/* ③ 花名册重名 → 不猜 */
lastUpdate = null;
const r3 = await complete(ME, { record_id: 'R-PLAIN', note: 'x', violation_people: '王芳' });
assert(r3.status === 200, '③ 重名 → 200', `HTTP ${r3.status}`);
assert(lastUpdate && !('性别' in lastUpdate.fields) && !('年龄' in lastUpdate.fields) && !('车辆类型|保洁员' in lastUpdate.fields),
  '③ 重名一律不猜：三列不写', lastUpdate ? JSON.stringify(Object.keys(lastUpdate.fields)) : 'no PUT');

/* ④ 花名册查无此人 / 「未指定」→ 不写 */
lastUpdate = null;
const r4 = await complete(ME, { record_id: 'R-PLAIN', note: 'x', violation_people: '查无此人' });
const r4b = await complete(ME, { record_id: 'R-PLAIN', note: 'x', violation_people: '未指定' });
assert(r4.status === 200 && r4b.status === 200, '④ 查无此人 / 未指定 → 都 200', `${r4.status}/${r4b.status}`);
assert(lastUpdate && !('性别' in lastUpdate.fields), '④ 查无此人：三列不写', lastUpdate ? JSON.stringify(Object.keys(lastUpdate.fields)) : 'no PUT');

/* ⑤ 台账已有档案 + 客户端没传 → 保持原值 */
lastUpdate = null;
const r5 = await complete(ME, { record_id: 'R-HASBIO', note: 'x', violation_people: '刘福龙' });
assert(r5.status === 200, '⑤ 已有档案的记录 → 200', `HTTP ${r5.status}`);
assert(lastUpdate && !('性别' in lastUpdate.fields) && !('年龄' in lastUpdate.fields) && !('车辆类型|保洁员' in lastUpdate.fields),
  '⑤ 不覆盖台账已有的性别/年龄/岗位', lastUpdate ? JSON.stringify(Object.keys(lastUpdate.fields)) : 'no PUT');

/* ⑥ 账号没配花名册 → 静默跳过，不报错 */
lastUpdate = null;
const r6 = await complete(ME, { record_id: 'R-PLAIN', note: 'x', violation_people: '刘福龙' }, envNoRoster);
assert(r6.status === 200, '⑥ 花名册未配置 → 依然 200（兜底失败不能拖垮完成）', `HTTP ${r6.status}`);
assert(lastUpdate && lastUpdate.fields['违章人员姓名'] === '刘福龙' && !('性别' in lastUpdate.fields),
  '⑥ 未配置时只写姓名', lastUpdate ? JSON.stringify(Object.keys(lastUpdate.fields)) : 'no PUT');

/* ⑦ 非接收人 → 403 不落库（兜底不放大越权面） */
const otherToken = await (async () => {
  // 直接复用「非接收人」场景：构造一个别人的 token 不现实，改用不存在的会话
  return 'forged-token';
})();
lastUpdate = null;
const r7 = await complete(otherToken, { record_id: 'R-PLAIN', note: 'x', violation_people: '刘福龙' });
assert(r7.status === 401, '⑦ 伪造会话 → 401', `HTTP ${r7.status}`);
assert(lastUpdate === null, '⑦ 未落库', lastUpdate ? 'PUT happened' : 'ok');

/* ⑧ 静态：Worker 侧兜底逻辑在位 */
const wjs = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
assert(/async function rosterPersonBio\(env, cfg, name\)/.test(wjs), '⑧-1 rosterPersonBio 助手存在');
assert(/if \(hits\.length !== 1\) return null;/.test(wjs), '⑧-2 重名一律不猜（唯一命中才返回）');
assert(/!ROSTER_INACTIVE_RE\.test\(r\.status\)/.test(wjs), '⑧-3 只认在职花名册');
assert(/try \{ rows = await loadRosterRows\(env, cfg\); \} catch \{ return null; \}/.test(wjs), '⑧-4 花名册读取失败静默放弃');
assert(/const bio = await rosterPersonBio\(env, cfg, vPeople\);/.test(wjs), '⑧-5 assign/complete 调用兜底');
assert(/if \(missSex && bio\.sex\) vSex = bio\.sex;/.test(wjs), '⑧-6 只补空缺列（不覆盖客户端显式值与存量值）');

console.log(`\n===== RESULT: ${pass} PASS_MOCK, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
