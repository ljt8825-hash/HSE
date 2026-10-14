/* CF-WPS-85：整改完成回写「违章人员档案三列」（性别/年龄/岗位）
 *
 * 背景（测试台账实测复现）：公司管理派发任务时没选违章人员 → 被指派人整改时才选人
 * （花名册数据完整，性别/年龄/职位/完整度100% 都有），但完成接口只回写「违章人员姓名」，
 * 台账「性别/年龄/车辆类型|保洁员」三列永远留空；整改确认页也只显示姓名不显示档案。
 *
 * 本测试用 mock 飞书端点把 POST /api/mobile/assign/complete 钉死（零真实网络 / 零真实写库）：
 *   ① 传 violation_sex/age/job → 200，且 PUT 写入「性别/年龄/车辆类型|保洁员」（含姓名）
 *   ② 旧前端不传档案三列 → 200，且 PUT **不含**这三列（向前兼容，不动存量值）
 *   ③ 只传姓名不传档案 → 姓名落库、三列不出现
 *   ④ 非接收人本人 + 档案 → 403 且不落库
 *   ⑤ 记录不存在 → 404
 *   ⑥ 静态：前端发送端/保存端/展示端与 Worker 接收端/视图端五处闭环
 *
 * Run: node test/cfwps85-person-attrs-writeback.test.mjs
 */
const workerMod = await import('../index.js');
const worker = workerMod.default;
const { pinyinInitials, hashPassword } = workerMod;
const { readFileSync } = await import('node:fs');

const SESSION_SECRET = 'mock-session-secret-attrs-85-0123456789';
const FS_APP_TOKEN = 'mock-fs-app-token-85';
const LEDGER_TABLE_ID = 'tblMockLedger85';
const PATROL_TABLE_ID = 'tblMockPatrol85';

const ME_NAME = '测试经理丁';
const ME_PHONE = '13900000881';
const PW = pinyinInitials(ME_NAME) + ME_PHONE.slice(-4);
const OTHER_NAME = '测试路人戊';
const OTHER_PHONE = '13900000882';
const OTHER_PW = pinyinInitials(OTHER_NAME) + OTHER_PHONE.slice(-4);

const ME_HASH = await hashPassword(PW, 20000);
const OTHER_HASH = await hashPassword(OTHER_PW, 20000);

const LEDGER_ROWS = [
  { record_id: 'L-me', fields: { 姓名: ME_NAME, 直接上级: '上级丁', 所属部门: '丁片区', 职位: '管理员', 网格长等级: '二级网格长', 手机号: ME_PHONE, 分级: '乡镇作业中心经理', 密码哈希: ME_HASH } },
  { record_id: 'L-other', fields: { 姓名: OTHER_NAME, 直接上级: '上级丁', 所属部门: '丁片区', 职位: '管理员', 网格长等级: '二级网格长', 手机号: OTHER_PHONE, 分级: '管理员', 密码哈希: OTHER_HASH } },
];

const todoFields = (o) => Object.assign({
  检查时间: '2026-10-01 08:00', 是否三违: '是', 违章描述: '骑车不戴头盔', 违章人员: '',
  性别: '', 年龄: '', '车辆类型|保洁员': '',
  '整改接收人ID': ME_PHONE, '整改接收人姓名': ME_NAME, '整改责任单位': '丁片区',
  指派人ID: '13900000899', 指派人姓名: '测试公司管理', 指派人单位: '安环管理部',
  整改状态: '待整改', 指派时间: '2026-10-10 09:30',
}, o);

const PATROL_ROWS = [
  { record_id: 'R-MINE', fields: todoFields({}) },
  { record_id: 'R-OTHER', fields: todoFields({ '整改接收人ID': OTHER_PHONE, '整改接收人姓名': OTHER_NAME }) },
];

const FIELD_NAMES = ['整改接收人ID', '整改接收人姓名', '整改责任单位', '整改状态', '指派人ID', '指派人姓名', '指派人单位', '指派时间', '整改完成时间', '整改说明', '违章行为', '违章人员姓名', '违章照片', '整改后照片', '性别', '年龄', '车辆类型|保洁员', '密码哈希', '密码修改时间'];

let lastUpdate = null;

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

console.log(`\n=== CF-WPS-85：assign/complete 回写违章人员档案三列 ===\n`);

const meLogin = await login(ME_PHONE, PW);
assert(meLogin.status === 200 && !!meLogin.token, '前置：接收人 mock 账号登录成功', `HTTP ${meLogin.status}`);
const ME = meLogin.token;
const otherLogin = await login(OTHER_PHONE, OTHER_PW);
assert(otherLogin.status === 200 && !!otherLogin.token, '前置：非接收人 mock 账号登录成功', `HTTP ${otherLogin.status}`);
const OTHER = otherLogin.token;

/* ---- ① 合法提交：姓名 + 档案三列一起回写 ---- */
lastUpdate = null;
const r1 = await complete(ME, {
  record_id: 'R-MINE', note: '已现场整改完成', photo_tokens: ['FT_OK_1'],
  violation_desc: '骑车不戴头盔', violation_people: '刘福龙',
  violation_sex: '男', violation_age: '36', violation_job: '乡镇保洁员',
});
const j1 = await r1.json().catch(() => ({}));
assert(r1.status === 200 && j1.success === true, '① 合法提交 → 200 success', `HTTP ${r1.status} ${JSON.stringify(j1)}`);
assert(!!lastUpdate && lastUpdate.recId === 'R-MINE', '① PUT 命中正确记录', lastUpdate ? lastUpdate.recId : 'no PUT');
assert(lastUpdate && lastUpdate.fields['违章人员姓名'] === '刘福龙', '① 写回「违章人员姓名」', lastUpdate && JSON.stringify(lastUpdate.fields['违章人员姓名']));
assert(lastUpdate && lastUpdate.fields['性别'] === '男', '① 写回「性别」= 提交值', lastUpdate && JSON.stringify(lastUpdate.fields['性别']));
assert(lastUpdate && String(lastUpdate.fields['年龄']) === '36', '① 写回「年龄」= 提交值', lastUpdate && JSON.stringify(lastUpdate.fields['年龄']));
assert(lastUpdate && lastUpdate.fields['车辆类型|保洁员'] === '乡镇保洁员', '① 写回「车辆类型|保洁员」= 提交值', lastUpdate && JSON.stringify(lastUpdate.fields['车辆类型|保洁员']));
assert(lastUpdate && lastUpdate.fields['整改状态'] === '已完成', '① 仍正常回写整改状态', lastUpdate && JSON.stringify(lastUpdate.fields['整改状态']));

/* ---- ② 旧前端：不传档案三列 → 不写三列（向前兼容） ---- */
lastUpdate = null;
const r2 = await complete(ME, { record_id: 'R-MINE', note: '旧前端完成' });
const j2 = await r2.json().catch(() => ({}));
assert(r2.status === 200 && j2.success === true, '② 旧前端（只 note）→ 200 success', `HTTP ${r2.status}`);
assert(lastUpdate && !('性别' in lastUpdate.fields) && !('年龄' in lastUpdate.fields) && !('车辆类型|保洁员' in lastUpdate.fields),
  '② PUT 不含档案三列（不动存量值）', lastUpdate ? JSON.stringify(Object.keys(lastUpdate.fields)) : 'no PUT');

/* ---- ③ 只传姓名不传档案（花名册无档案的人）→ 姓名落库、三列不出现 ---- */
lastUpdate = null;
const r3 = await complete(ME, { record_id: 'R-MINE', note: 'x', violation_people: '无档人' });
const j3 = await r3.json().catch(() => ({}));
assert(r3.status === 200 && j3.success === true, '③ 只传姓名 → 200 success', `HTTP ${r3.status}`);
assert(lastUpdate && lastUpdate.fields['违章人员姓名'] === '无档人', '③ 姓名照常回写', lastUpdate && JSON.stringify(lastUpdate.fields['违章人员姓名']));
assert(lastUpdate && !('性别' in lastUpdate.fields) && !('年龄' in lastUpdate.fields) && !('车辆类型|保洁员' in lastUpdate.fields),
  '③ 档案三列仍不出现', lastUpdate ? JSON.stringify(Object.keys(lastUpdate.fields)) : 'no PUT');

/* ---- ④ 非接收人本人 + 档案 → 403 且不落库 ---- */
lastUpdate = null;
const r4 = await complete(OTHER, { record_id: 'R-MINE', note: '越权', violation_people: '王五', violation_sex: '男', violation_age: '30', violation_job: '司机' });
assert(r4.status === 403, '④ 非接收人提交 → 403', `HTTP ${r4.status}`);
assert(lastUpdate === null, '④ 越权时**不落库**（无 PUT）', lastUpdate ? JSON.stringify(lastUpdate.fields) : 'ok');

/* ---- ⑤ 记录不存在 → 404 ---- */
const r5 = await complete(ME, { record_id: 'R-NOPE', note: 'x' });
assert(r5.status === 404, '⑤ 记录不存在 → 404', `HTTP ${r5.status}`);

/* ---- ⑥ 静态：前后端五处闭环 ---- */
const html = readFileSync(new URL('../../frontend/check.html', import.meta.url), 'utf8');
const wjs = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
assert(/violation_sex: done\._rectifyConfirmed \? \(done\.personSex \|\| ""\) : ""/.test(html), '⑥-1 submitRectify 发送 violation_sex（仅本次选过人时发）');
assert(/violation_age: done\._rectifyConfirmed \? \(done\.personAge \|\| ""\) : ""/.test(html), '⑥-2 submitRectify 发送 violation_age');
assert(/violation_job: done\._rectifyConfirmed \? \(done\.personJob \|\| ""\) : ""/.test(html), '⑥-3 submitRectify 发送 violation_job');
assert(/rec\.personSex = f\.person\.sex/.test(html) && /rec\.personAge = f\.person\.age/.test(html) && /rec\.personJob = f\.person\.job/.test(html),
  '⑥-4 finishRectifyConfirm 把档案落到记录上');
assert(/personMetaText\(rec\)/.test(html), '⑥-5 整改确认页/派发上下文卡显示档案一行文');
assert(/personSex: t\.violation_sex/.test(html) && /personAge: t\.violation_age/.test(html) && /personJob: t\.violation_job/.test(html),
  '⑥-6 todoToRec 把服务端档案映射进待办记录');
assert(/(?:const|let) vSex = patrolText\(body && body\.violation_sex/.test(wjs) && /if \(vSex\) fields\['性别'\] = vSex/.test(wjs)
  && /if \(vAge\) fields\['年龄'\] = vAge/.test(wjs) && /if \(vJob\) fields\['车辆类型\|保洁员'\] = vJob/.test(wjs),
  '⑥-7 Worker assign/complete 接收并写回三列');
assert(/violation_sex: fieldText\(f\['性别'\]\)/.test(wjs) && /violation_age: fieldText\(f\['年龄'\]\)/.test(wjs)
  && /violation_job: fieldText\(f\['车辆类型\|保洁员'\]\)/.test(wjs),
  '⑥-8 Worker patrolRecordView 下发档案三列');

console.log(`\n===== RESULT: ${pass} PASS_MOCK, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
