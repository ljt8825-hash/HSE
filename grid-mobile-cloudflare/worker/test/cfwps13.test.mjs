/* CF-WPS-13: OFFLINE mock tests — 网格长巡查文字业务链.
 * GUARDS: fetch fully mocked (WPS upstream); no real network, no real WPS writes.
 * Covers 任务书 §十七 A/B:
 *   A: Session employee_code 获取 / 未登录拒绝 / employee_code 缺失拒绝 / 非法字段拒绝 /
 *      protected 注入拒绝 / client_request_id 校验 / 网格无法确定拒绝
 *   B: 正常登录 / 正常巡查提交 / 未登录提交 / 过期 Session / employee_code 注入 /
 *      grid_id 注入 / inspector_employee_id 注入 / attribution_status 注入 /
 *      超长问题描述 / 重复 client_request_id
 * Run: node test/cfwps13.test.mjs
 */
import bcrypt from 'bcryptjs';

const workerMod = await import('../index.js');
const worker = workerMod.default;
const { signJwtHs256, normalizeGridAreas, validatePatrolBody, patrolTarget } = workerMod;

const SESSION_SECRET = 'mock-session-secret-0123456789abcdef';
const WPS_APP_TOKEN = 'mock-wps-app-token-xyz';
const FILE_ID = 'mockfile123';
const EMP = '00307234';
const EMP_NAME = '测试甲';

// ---- mock WPS 数据（内存）----
const identityRows = [ // Sheet 14（登录用）
  { id: 'ID1', fields: JSON.stringify({ employee_code: EMP, 姓名: EMP_NAME, 手机号码: '13800000001', password_hash: bcrypt.hashSync('pass1234', 4), 部门: '某某镇作业中心', 职位: '网格长', 网格长等级: '二级网格长', 身份状态: '正常' }) },
];
let rosterRows = [ // Sheet 11（网格映射用）
  { id: 'R1', fields: JSON.stringify({ 员工编码: EMP, 姓名: EMP_NAME, 用工关系状态: '正式员工', '负责区域（在职）': '八里堂村+惠宁' }) },
];
const sheet13Rows = []; // 幂等扫描 + 我的记录
let createCalls = 0;
const createdRecords = [];

// 台账 mock（2026-09 登录链改版：网格长信息台账为唯一登录源）
const LEDGER_TABLE_ID = 'tblMockLedger';
const LEDGER_PHONE = '13800000001';
const LEDGER_ROWS = [
  { record_id: 'L1', fields: { '姓名': EMP_NAME, '直接上级': '领导甲', '所属部门': '某某镇作业中心', '职位': '网格长', '网格长等级': '二级网格长', '手机号': LEDGER_PHONE, '分级': '管理员' } },
];

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('/oauth2/token')) return new Response(JSON.stringify({ access_token: WPS_APP_TOKEN, expires_in: 7200 }), { status: 200 });
  if (u.includes('/auth/v3/tenant_access_token/internal')) return new Response(JSON.stringify({ code: 0, tenant_access_token: 'mock-fs-tenant-token', expire: 7200 }), { status: 200 });
  if (u.includes(`/tables/${LEDGER_TABLE_ID}/records`)) return new Response(JSON.stringify({ code: 0, data: { items: LEDGER_ROWS, has_more: false } }), { status: 200 });
  const mk = (m) => m && typeof m === 'object' ? m : {};
  const parseBody = () => { try { return JSON.parse(init.body); } catch { return {}; } };
  if (u.includes('/sheets/14/records/list_by_page')) {
    return new Response(JSON.stringify({ code: 0, data: { records: identityRows } }), { status: 200 });
  }
  if (u.includes('/sheets/11/records/list_by_page')) {
    return new Response(JSON.stringify({ code: 0, data: { records: rosterRows } }), { status: 200 });
  }
  if (u.includes('/sheets/13/records/list_by_page')) {
    return new Response(JSON.stringify({ code: 0, data: { records: sheet13Rows } }), { status: 200 });
  }
  if (u.includes('/sheets/13/records/create')) {
    createCalls++;
    const body = parseBody();
    const fv = JSON.parse(body.records[0].fields_value);
    const id = 'REC' + String(createCalls).padStart(3, '0');
    createdRecords.push({ id, fields: fv });
    sheet13Rows.push({ id, fields: JSON.stringify(fv) });
    return new Response(JSON.stringify({ code: 0, data: { records: [{ id }] } }), { status: 200 });
  }
  throw new Error(`UNMOCKED URL (guard): ${u}`);
};

function workerEnv(overrides = {}) {
  return {
    WPS_CLIENT_ID: 'mock-app-id', WPS_CLIENT_SECRET: 'mock-app-secret',
    WPS_OPENAPI_BASE: 'https://mock.wps.example',
    WPS_DBSHEET_FILE_ID: FILE_ID,
    WPS_DBSHEET_TEST_SHEET_ID: '13',
    WPS_DBSHEET_IDENTITY_SHEET_ID: '14',
    IDENTITY_ROSTER_SHEET_ID: '11',
    ALLOW_WPS_WRITE: 'true',
    WORKER_SESSION_SECRET: SESSION_SECRET,
    MOBILE_LOGIN_ENABLED: 'true',
    ...overrides,
  };
}

let pass = 0, failn = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_MOCK ${n}${x ? ' :: ' + x : ''}`); };
const fail = (n, d) => { failn++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : fail(n, d || 'assertion false'));

const nowSec = Math.floor(Date.now() / 1000);
const SESSION = await signJwtHs256({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: EMP, name: EMP_NAME, department: '某某镇作业中心', grid_level: '二级网格长', iat: nowSec, exp: nowSec + 7200, jti: 'c13' }, SESSION_SECRET);
const EXPIRED = await signJwtHs256({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: EMP, name: EMP_NAME, iat: nowSec - 9000, exp: nowSec - 100, jti: 'c13e' }, SESSION_SECRET);
const NO_SUB = await signJwtHs256({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: '', name: EMP_NAME, iat: nowSec, exp: nowSec + 7200, jti: 'c13n' }, SESSION_SECRET);

async function call(path, { method, body, token = SESSION, env = workerEnv() } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const req = new Request(`https://worker.local${path}`, { method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined });
  const res = await worker.fetch(req, env);
  const text = await res.text();
  return { status: res.status, json: JSON.parse(text || '{}'), text };
}

function validBody(over = {}) {
  return {
    inspection_time: '2026-09-16 08:30',
    grid: '八里堂村',
    description: '巡查发现村口垃圾堆放，已现场劝导清理。',
    problem_type: '环境卫生',
    is_violation: '否',
    client_request_id: 'CID13TEST0001',
    ...over,
  };
}

// ============================================================
console.log('===== A/B1 正常登录（mock 全链路：Sheet14 + bcrypt + 花名册桥） =====');
{
  // 2026-09：登录唯一来源=飞书网格长信息台账；密码=姓名首字母(测试甲->csj)+手机号后4位
  const ledgerEnv = workerEnv({ STORAGE_BACKEND: 'feishu', FS_APP_TOKEN: 'mock-fs-token', FS_APP_ID: 'mock-fs-id', FS_APP_SECRET: 'mock-fs-secret', FS_LEDGER_TABLE_ID: LEDGER_TABLE_ID });
  const r = await call('/api/mobile/auth/login', { body: { phone: LEDGER_PHONE, password: 'csj0001' }, env: ledgerEnv });
  assert(r.status === 200 && r.json.success && r.json.employee.employee_code === LEDGER_PHONE && r.json.employee.role === '管理员', 'B1 正常登录 -> 200 + employee_code=手机号 + role 来自台账分级', `status=${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
}

console.log('===== A Session employee_code 获取（meta） =====');
{
  const r = await call('/api/mobile/patrol/meta');
  assert(r.status === 200 && r.json.employee.employee_code === EMP, 'A1 meta 返回 Session employee_code', JSON.stringify(r.json).slice(0, 160));
  assert(r.json.grid_resolved === true && r.json.grid_mode === 'select' && r.json.grids.join(',') === '八里堂村,惠宁', 'A1 网格解析：多网格 → select 模式', JSON.stringify(r.json.grids));
  assert(r.json.photo_status === 'FEISHU_ATTACHMENT_READY', 'A1 照片状态 FEISHU_ATTACHMENT_READY（feishu 附件真实上传已上线）');
}

console.log('===== A2/B3 未登录拒绝 =====');
{
  const m = await call('/api/mobile/patrol/meta', { token: '' });
  const s = await call('/api/mobile/patrol/submit', { token: '', body: validBody() });
  const l = await call('/api/mobile/patrol/records', { token: '' });
  assert(m.status === 401 && s.status === 401 && l.status === 401, 'A2/B3 meta/submit/records 未登录全部 401', `${m.status}/${s.status}/${l.status}`);
}

console.log('===== A3 employee_code 缺失（Session 无 sub）→ 拒绝 =====');
{
  const r = await call('/api/mobile/patrol/submit', { token: NO_SUB, body: validBody() });
  assert(r.status === 422 && r.json.code === 'GRID_UNRESOLVED', 'A3 employee_code 缺失 → 网格无法解析 → 422 GRID_UNRESOLVED', JSON.stringify(r.json));
}

console.log('===== A4 非法字段拒绝 =====');
{
  const t1 = await call('/api/mobile/patrol/submit', { body: validBody({ inspection_time: '明天早上' }) });
  assert(t1.status === 400 && t1.json.code === 'PATROL_FIELD_INVALID' && t1.json.message.includes('inspection_time'), 'A4 非法巡查时间 → 400', JSON.stringify(t1.json));
  const t2 = await call('/api/mobile/patrol/submit', { body: validBody({ problem_type: '不存在的类型' }) });
  assert(t2.status === 400 && t2.json.message.includes('problem_type'), 'A4 非法问题类型 → 400');
  const t3 = await call('/api/mobile/patrol/submit', { body: validBody({ is_violation: 'maybe' }) });
  assert(t3.status === 400 && t3.json.message.includes('is_violation'), 'A4 非法是否三违 → 400');
  const t4 = await call('/api/mobile/patrol/submit', { body: validBody({ is_violation: '是' }) });
  assert(t4.status === 400 && t4.json.message.includes('violation_desc') && t4.json.message.includes('violation_people'), 'A4 三违=是 缺描述/涉及人员 → 400');
}

console.log('===== A6/B10 client_request_id 校验 + 幂等 =====');
{
  const bad1 = await call('/api/mobile/patrol/submit', { body: validBody({ client_request_id: 'short' }) });
  assert(bad1.status === 400 && bad1.json.message.includes('client_request_id'), 'A6 过短 client_request_id → 400');
  const bad2 = await call('/api/mobile/patrol/submit', { body: validBody({ client_request_id: 'has space;' }) });
  assert(bad2.status === 400, 'A6 非法字符 client_request_id → 400');
  const ok1 = await call('/api/mobile/patrol/submit', { body: validBody({ client_request_id: 'CID13DUP00001' }) });
  assert(ok1.status === 200 && ok1.json.success && !ok1.json.deduplicated, 'B2 正常巡查提交 -> 200', JSON.stringify(ok1.json).slice(0, 140));
  const ok2 = await call('/api/mobile/patrol/submit', { body: validBody({ client_request_id: 'CID13DUP00001' }) });
  assert(ok2.status === 200 && ok2.json.deduplicated === true, 'B10 重复 client_request_id → deduplicated:true', JSON.stringify(ok2.json).slice(0, 140));
  assert(createCalls === 1, 'B10 幂等命中后不再 create（create 次数=1）', `createCalls=${createCalls}`);
}

console.log('===== A5/B5-B8 protected fields 注入拒绝（record 只含服务端定值） =====');
{
  const injected = validBody({
    client_request_id: 'CID13INJ00001',
    employee_code: 'HACKER-CODE',
    grid_id: '133',
    inspector_employee_id: '6697',
    attribution_status: 'approved',
    deduction: '100',
    responsibility: '全部',
    review: '通过',
    grid: '惠宁',
  });
  const r = await call('/api/mobile/patrol/submit', { body: injected });
  assert(r.status === 200 && r.json.success, '注入请求本身成功（字段被忽略而非报错）', JSON.stringify(r.json).slice(0, 120));
  const rec = createdRecords.find((x) => x.fields.client_request_id === 'CID13INJ00001');
  assert(!!rec, '注入请求已落表（供断言）');
  assert(rec.fields.employee_code === EMP, 'B5 employee_code=Session.sub，前端注入被忽略', rec.fields.employee_code);
  assert(!('grid_id' in rec.fields), 'B6 grid_id 零残留');
  assert(!('inspector_employee_id' in rec.fields), 'B7 inspector_employee_id 零残留');
  assert(!('attribution_status' in rec.fields) && !('deduction' in rec.fields) && !('review' in rec.fields), 'B8 attribution_status/deduction/review 零残留');
  assert(rec.fields['网格'] === '惠宁', '网格=服务端解析集内合法值');
  assert(rec.fields['姓名'] === EMP_NAME && rec.fields['是否三违'] === '否' && rec.fields['照片状态'] === '未拍摄', 'record 其余字段为服务端定值', JSON.stringify(rec.fields).slice(0, 200));
}

console.log('===== B4 过期 Session =====');
{
  const r = await call('/api/mobile/patrol/submit', { token: EXPIRED, body: validBody() });
  assert(r.status === 401, 'B4 过期 Session → 401', `status=${r.status}`);
}

console.log('===== B9 超长问题描述 → 拒绝（不静默截断） =====');
{
  const r = await call('/api/mobile/patrol/submit', { body: validBody({ description: '长'.repeat(501), client_request_id: 'CID13LONG0001' }) });
  assert(r.status === 400 && r.json.message.includes('description'), 'B9 501 字描述 → 400', JSON.stringify(r.json));
}

console.log('===== A7 网格解析：键（工号 → 姓名兜底） / 值（负责区域 → 所属部门） =====');
{
  // ① 负责区域与所属部门皆缺 → 仍 fail-closed（不猜网格）
  rosterRows = [{ id: 'R1', fields: JSON.stringify({ 员工编码: EMP, 姓名: EMP_NAME, '负责区域（在职）': '' }) }];
  const r1 = await call('/api/mobile/patrol/submit', { body: validBody({ client_request_id: 'CID13GRID0001' }) });
  assert(r1.status === 422 && r1.json.code === 'GRID_UNRESOLVED' && r1.json.message === '当前人员无法确定巡查网格，请联系管理员', 'A7a 两列皆空 → 422 + 明确文案', JSON.stringify(r1.json));
  const m1 = await call('/api/mobile/patrol/meta');
  assert(m1.json.grid_resolved === false && m1.json.message === '当前人员无法确定巡查网格，请联系管理员', 'A7a meta 同样 unresolved + 文案');

  // ② 业务口径「负责区域就是所属部门」：负责区域为空 → 回落「所属部门」
  rosterRows = [{ id: 'R1', fields: JSON.stringify({ 员工编码: EMP, 姓名: EMP_NAME, '负责区域（在职）': '', '所属部门': '某某镇一班' }) }];
  const m0 = await call('/api/mobile/patrol/meta');
  assert(m0.json.grid_resolved === true && m0.json.grids.join(',') === '某某镇一班' && m0.json.grid_resolved_by === 'employee_code',
    'A7b 负责区域为空 → 回落「所属部门」解析出网格', JSON.stringify({ grids: m0.json.grids, by: m0.json.grid_resolved_by }));
  const r1b = await call('/api/mobile/patrol/submit', { body: validBody({ grid: '某某镇一班', client_request_id: 'CID13GRID0011' }) });
  assert(r1b.status === 200, 'A7b 以「所属部门」作为网格提交 → 200', JSON.stringify(r1b.json).slice(0, 140));

  // ③ 工号多行命中 → fail-closed
  rosterRows = [{ id: 'RX', fields: JSON.stringify({ 员工编码: EMP, 姓名: EMP_NAME }), }, { id: 'RY', fields: JSON.stringify({ 员工编码: EMP, 姓名: EMP_NAME, '负责区域（在职）': '甲村' }) }];
  const r2 = await call('/api/mobile/patrol/submit', { body: validBody({ client_request_id: 'CID13GRID0002' }) });
  assert(r2.status === 422 && r2.json.code === 'GRID_UNRESOLVED', 'A7c 工号多行命中 → fail-closed 422');

  // ④ 真机根因复现：台账登录的 Session sub 是手机号（不匹配任何员工编码）→ 必须按姓名兜底
  const PHONE_SESSION = await signJwtHs256({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: '13900001234', name: EMP_NAME, department: '某某镇作业中心', iat: nowSec, exp: nowSec + 7200, jti: 'c13p' }, SESSION_SECRET);
  rosterRows = [{ id: 'R1', fields: JSON.stringify({ 员工编码: EMP, 姓名: EMP_NAME, '负责区域（在职）': '八里堂村+惠宁' }) }];
  const m2 = await call('/api/mobile/patrol/meta', { token: PHONE_SESSION });
  assert(m2.json.grid_resolved === true && m2.json.grids.join(',') === '八里堂村,惠宁' && m2.json.grid_resolved_by === 'name',
    'A7d 手机号 sub 匹配不到工号 → 按姓名兜底解析成功（修复真机恒 unresolved）', JSON.stringify({ grids: m2.json.grids, by: m2.json.grid_resolved_by }));
  // 姓名重名时兜底同样 fail-closed
  rosterRows = [{ id: 'RX', fields: JSON.stringify({ 员工编码: 'X1', 姓名: EMP_NAME, '负责区域（在职）': '甲村' }) }, { id: 'RY', fields: JSON.stringify({ 员工编码: 'X2', 姓名: EMP_NAME, '负责区域（在职）': '乙村' }) }];
  const m3 = await call('/api/mobile/patrol/meta', { token: PHONE_SESSION });
  assert(m3.json.grid_resolved === false, 'A7e 姓名兜底遇重名 → 仍 fail-closed（不猜网格）', JSON.stringify(m3.json.grids));

  // ⑤ 网格不一致
  rosterRows = [{ id: 'R1', fields: JSON.stringify({ 员工编码: EMP, 姓名: EMP_NAME, '负责区域（在职）': '八里堂村+惠宁' }) }];
  const r3 = await call('/api/mobile/patrol/submit', { body: validBody({ grid: '不存在的网格', client_request_id: 'CID13GRID0003' }) });
  assert(r3.status === 422 && r3.json.code === 'GRID_NOT_ALLOWED', 'A7f body.grid 不在服务端解析集 → 422 GRID_NOT_ALLOWED', JSON.stringify(r3.json));
  const r4 = await call('/api/mobile/patrol/submit', { body: validBody({ grid: '惠宁', client_request_id: 'CID13GRID0004', employee_code: 'FAKE' }) });
  assert(r4.status === 200, 'B5 补充：前端带 employee_code 不影响正常提交');
}

console.log('===== A8 重名消歧：手机号 → 员工编码 → 姓名 → +所属部门 → +直接上级 → fail-closed =====');
{
  // 真机事实：花名册 1291 人含 24 个重名。单一「姓名」键会错挂网格，必须多键联合识别。
  const phoneSession = (over = {}) => signJwtHs256(
    { iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: '13900001234', name: EMP_NAME, department: '', superior: '', iat: nowSec, exp: nowSec + 7200, jti: 'c13a8' + Math.random().toString(36).slice(2, 6) },
    SESSION_SECRET,
  );

  // ① 重名 + 手机号 —— 唯一命中（最稳键，不依赖部门/上级）
  rosterRows = [
    { id: 'R1', fields: JSON.stringify({ 员工编码: 'X1', 姓名: EMP_NAME, 手机号: '13900001234', '负责区域（在职）': '甲村' }) },
    { id: 'R2', fields: JSON.stringify({ 员工编码: 'X2', 姓名: EMP_NAME, 手机号: '13900005678', '负责区域（在职）': '乙村' }) },
  ];
  const m1 = await call('/api/mobile/patrol/meta', { token: await phoneSession() });
  assert(m1.json.grid_resolved === true && m1.json.grids.join(',') === '甲村' && m1.json.grid_resolved_by === 'phone',
    'A8a 重名 + 手机号 → 精确命中本人网格（by=phone）', JSON.stringify({ grids: m1.json.grids, by: m1.json.grid_resolved_by }));

  // ② 手机号脏数据（两行同号）→ 不盲选，继续降级
  rosterRows = [
    { id: 'R1', fields: JSON.stringify({ 员工编码: 'X1', 姓名: '某甲', 手机号: '13900001234', '负责区域（在职）': '甲村' }) },
    { id: 'R2', fields: JSON.stringify({ 员工编码: 'X2', 姓名: '某乙', 手机号: '13900001234', '负责区域（在职）': '乙村' }) },
  ];
  const m2 = await call('/api/mobile/patrol/meta', { token: await phoneSession() });
  assert(m2.json.grid_resolved === false && m2.json.grid_resolved_by === null,
    'A8b 手机号命中多行（脏数据）→ 不盲选，fail-closed', JSON.stringify({ grids: m2.json.grids, matched: m2.json.roster_matches }));

  // ③ 重名 + 员工编码（会话 sub 即工号）→ 唯一命中，且优先于姓名
  rosterRows = [
    { id: 'R1', fields: JSON.stringify({ 员工编码: EMP, 姓名: EMP_NAME, '负责区域（在职）': '甲村' }) },
    { id: 'R2', fields: JSON.stringify({ 员工编码: 'X2', 姓名: EMP_NAME, '负责区域（在职）': '乙村' }) },
  ];
  const m3 = await call('/api/mobile/patrol/meta', { token: SESSION });
  assert(m3.json.grid_resolved === true && m3.json.grids.join(',') === '甲村' && m3.json.grid_resolved_by === 'employee_code',
    'A8c 重名 + 员工编码 → 精确命中（by=employee_code，不走姓名）', JSON.stringify({ grids: m3.json.grids, by: m3.json.grid_resolved_by }));

  // ④ 重名 + 所属部门消歧（无手机号、无工号可用时）
  rosterRows = [
    { id: 'R1', fields: JSON.stringify({ 员工编码: 'X1', 姓名: EMP_NAME, 所属部门: '柴胡店镇一班', '负责区域（在职）': '甲村' }) },
    { id: 'R2', fields: JSON.stringify({ 员工编码: 'X2', 姓名: EMP_NAME, 所属部门: '张大庄镇二班', '负责区域（在职）': '乙村' }) },
  ];
  const deptTok = await signJwtHs256({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: '13900001234', name: EMP_NAME, department: '柴胡店镇一班', iat: nowSec, exp: nowSec + 7200, jti: 'c13a8d' }, SESSION_SECRET);
  const m4 = await call('/api/mobile/patrol/meta', { token: deptTok });
  assert(m4.json.grid_resolved === true && m4.json.grids.join(',') === '甲村' && m4.json.grid_resolved_by === 'name+dept',
    'A8d 重名 + 所属部门 → 唯一命中（by=name+dept）', JSON.stringify({ grids: m4.json.grids, by: m4.json.grid_resolved_by }));

  // ⑤ 重名 + 同部门 + 直接上级消歧（部门收敛不到唯一时再降一级）
  rosterRows = [
    { id: 'R1', fields: JSON.stringify({ 员工编码: 'X1', 姓名: EMP_NAME, 所属部门: '柴胡店镇一班', 直接上级: '甲领导', '负责区域（在职）': '甲村' }) },
    { id: 'R2', fields: JSON.stringify({ 员工编码: 'X2', 姓名: EMP_NAME, 所属部门: '柴胡店镇一班', 直接上级: '乙领导', '负责区域（在职）': '乙村' }) },
  ];
  const supTok = await signJwtHs256({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: '13900001234', name: EMP_NAME, department: '柴胡店镇一班', superior: '甲领导', iat: nowSec, exp: nowSec + 7200, jti: 'c13a8s' }, SESSION_SECRET);
  const m5 = await call('/api/mobile/patrol/meta', { token: supTok });
  assert(m5.json.grid_resolved === true && m5.json.grids.join(',') === '甲村' && m5.json.grid_resolved_by === 'name+superior',
    'A8e 重名 + 同部门 → 直接上级消歧（by=name+superior）', JSON.stringify({ grids: m5.json.grids, by: m5.json.grid_resolved_by }));

  // ⑥ 重名 + 部门/上级都收敛不到唯一 → fail-closed，绝不猜网格
  const noMatchTok = await signJwtHs256({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: '13900001234', name: EMP_NAME, department: '柴胡店镇一班', superior: '丙领导', iat: nowSec, exp: nowSec + 7200, jti: 'c13a8n' }, SESSION_SECRET);
  const m6 = await call('/api/mobile/patrol/meta', { token: noMatchTok });
  assert(m6.json.grid_resolved === false && m6.json.message === '当前人员无法确定巡查网格，请联系管理员' && m6.json.roster_matches === 2,
    'A8f 重名无法唯一收敛 → fail-closed（matched=2 便于排查）', JSON.stringify({ grids: m6.json.grids, matched: m6.json.roster_matches }));
  const r6 = await call('/api/mobile/patrol/submit', { token: noMatchTok, body: validBody({ client_request_id: 'CID13A8F0001' }) });
  assert(r6.status === 422 && r6.json.code === 'GRID_UNRESOLVED', 'A8f 重名未收敛时提交同样被挡住 → 422', JSON.stringify(r6.json));

  // ⑦ 姓名唯一 + 负责区域多网格（+ 分隔）→ 仍走姓名键（确认重名分支未误伤唯一姓名）
  rosterRows = [
    { id: 'R1', fields: JSON.stringify({ 员工编码: 'X1', 姓名: EMP_NAME, 手机号: '13900009999', '负责区域（在职）': '八里堂村+惠宁' }) },
  ];
  const m7 = await call('/api/mobile/patrol/meta', { token: await phoneSession() });
  assert(m7.json.grid_resolved === true && m7.json.grids.length === 2 && m7.json.grid_resolved_by === 'name',
    'A8g 手机号未列/未命中 → 姓名唯一仍可解析（多网格保留）', JSON.stringify({ grids: m7.json.grids, by: m7.json.grid_resolved_by }));

  // 收尾还原默认花名册，避免后续块受影响
  rosterRows = [{ id: 'R1', fields: JSON.stringify({ 员工编码: EMP, 姓名: EMP_NAME, 用工关系状态: '正式员工', '负责区域（在职）': '八里堂村+惠宁' }) }];
}

console.log('===== 门控：写开关 / 目标未配置 / 生产三开关 =====');
{
  const envOff = workerEnv(); delete envOff.ALLOW_WPS_WRITE;
  const r1 = await call('/api/mobile/patrol/submit', { env: envOff, body: validBody({ client_request_id: 'CID13GATE0001' }) });
  assert(r1.status === 403 && r1.json.code === 'WPS_WRITE_DISABLED', '写开关关闭 → 403');
  const envNoSheet = workerEnv(); delete envNoSheet.WPS_DBSHEET_TEST_SHEET_ID;
  const r2 = await call('/api/mobile/patrol/submit', { env: envNoSheet, body: validBody({ client_request_id: 'CID13GATE0002' }) });
  assert(r2.status === 503 && r2.json.code === 'PATROL_TARGET_NOT_CONFIGURED', '测试 Sheet 未配置 → 503');
  const envProd1 = workerEnv({ MOBILE_PATROL_PRODUCTION_ENABLED: 'true' });
  const r3 = await call('/api/mobile/patrol/submit', { env: envProd1, body: validBody({ client_request_id: 'CID13GATE0003' }) });
  assert(r3.status === 200 && r3.json.target === 'test', '生产单开关（缺 sheet id/确认开关）→ 不写生产，安全回落测试表', JSON.stringify(r3.json));
  const envProd2 = workerEnv({ MOBILE_PATROL_PRODUCTION_ENABLED: 'true', MOBILE_PATROL_TARGET_SHEET_ID: '3', WPS_PATROL_FIELDS_CONFIRMED: 'true' });
  const t = patrolTarget(envProd2);
  assert(t && t.production === true && t.sheetId === '3', '生产三开关齐全 → target=production(3)（本阶段默认不配置）');
  assert(patrolTarget(workerEnv()).production === false, '缺省配置 → 隔离测试 Sheet');
}

console.log('===== 我的巡查记录 / 详情（仅本人） =====');
{
  const otherRows = sheet13Rows.slice();
  otherRows.push({ id: 'RECX', fields: JSON.stringify({ employee_code: 'OTHER-EMP', 姓名: '别人', 网格: '惠宁', 问题描述: '别人的记录' }) });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/sheets/13/records/list_by_page')) return new Response(JSON.stringify({ code: 0, data: { records: otherRows } }), { status: 200 });
    return realFetch(url, init);
  };
  const r = await call('/api/mobile/patrol/records');
  assert(r.status === 200 && r.json.success && r.json.records.every((x) => x.record_id !== 'RECX'), '列表只含本人记录（他人记录被过滤）', `total=${r.json.total}`);
  assert(r.json.records.length >= 2, '本人记录条数≥2', `total=${r.json.total}`);
  const d1 = await call('/api/mobile/patrol/records?id=' + r.json.records[0].record_id);
  assert(d1.status === 200 && d1.json.record.employee_code === EMP, '详情：本人记录可读，含 employee_code');
  const d2 = await call('/api/mobile/patrol/records?id=RECX');
  assert(d2.status === 404, '详情：他人记录 → 404（防枚举）', `status=${d2.status}`);
  const d3 = await call('/api/mobile/patrol/records?id=NOEXIST99');
  assert(d3.status === 404, '详情：不存在 → 404');
  globalThis.fetch = realFetch;
}

console.log('===== 纯函数：normalizeGridAreas / validatePatrolBody =====');
{
  assert(normalizeGridAreas('八里堂村+惠宁').join('|') === '八里堂村|惠宁', 'normalize: + 分隔多网格');
  assert(normalizeGridAreas('专业队').join('|') === '专业队', 'normalize: 单值');
  assert(normalizeGridAreas('0').length === 0 && normalizeGridAreas('').length === 0, 'normalize: "0"/空 → 无网格');
  const bad = validatePatrolBody({ inspection_time: 'x', grid: '', description: '', problem_type: '', is_violation: '', client_request_id: '' }, ['环境卫生']);
  assert(bad.errors.length >= 6, 'validate: 全空 body 报出全部字段错误', bad.errors.join(','));
  const good = validatePatrolBody(validBody(), ['环境卫生']);
  assert(good.errors.length === 0 && good.values.photoStatus === '未拍摄', 'validate: 合法 body 通过');
}

console.log('===== 泄露扫描 =====');
{
  const joined = JSON.stringify(createdRecords) + JSON.stringify(sheet13Rows);
  assert(!joined.includes('mock-app-secret') && !joined.includes(SESSION_SECRET) && !joined.includes('password') && !joined.includes('$2a$') && !joined.includes('$2b$'), '记录与响应无 secret/密码/哈希');
}

console.log(`\n===== RESULT: ${pass} PASS_MOCK, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
