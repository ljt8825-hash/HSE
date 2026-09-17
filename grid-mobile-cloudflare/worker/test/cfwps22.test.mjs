/* CF-WPS-22: OFFLINE mock tests — 重名消歧「姓名 + 职位」键（业务口径 2026-09-17）
 *
 * 业务口径：重名可用「姓名 + 职位」区别——**只有乡镇作业中心经理 / 管理员及以上才是网格长**，
 *           同名里的非网格长（乡镇保洁员 / 司机 / 中转站管理员 …）无权占坑。
 *
 * ⚠️ 词汇陷阱（本阶段实测）：台账「分级」= 管理员/乡镇作业中心经理/公司管理；
 *    花名册「职位」是另一套枚举 = 人工班长 / 人工片区长 / 乡镇保洁员 / 司机 / 中转站管理员 …
 *    对齐关系：台账 管理员 ↔ 花名册 人工班长；台账 乡镇作业中心经理 ↔ 花名册 人工片区长。
 *    若按字面把「管理员|乡镇作业中心经理」拿去花名册职位过滤 ⇒ 68 名台账人员中 62 人被打成 fail-closed。
 *
 * 覆盖：
 *   ① 重名 + 职位可定案（1 名网格长）→ by='name+job'，且**优先于部门**（部门不匹配也选网格长）
 *   ② 重名 + 2 名网格长 → 降级「所属部门」收敛（by='name+dept'）
 *   ③ 重名 + 全员非网格长（职位未维护 / 新职位）→ 不误杀，降级部门（保持既有行为）
 *   ④ 重名 + 2 名网格长同部门 → fail-closed（grids=[] / grid_resolved=false / matched 回传）
 *   ⑤ 姓名唯一 → 完全不受影响（by='name'）——保证 62/68 类人群零回归
 *   ⑥ 「中转站管理员」不得被当作网格长（精确等值匹配，禁用 `/管理员/` 模糊匹配）
 *   ⑦ 台账词汇（管理员 / 乡镇作业中心经理）作为等值写法同样被接受
 *   ⑧ 白名单可由 Worker 变量 PATROL_GRID_LEADER_JOBS 覆盖（逗号分隔精确值；`/re/` 正则）
 *   ⑨ 响应不泄露敏感列（身份证号码 / 凭据）
 * GUARDS: global fetch fully mocked（NO real network，未 mock URL 直接抛错）
 * Run: node test/cfwps22.test.mjs
 */
const workerMod = await import('../index.js');
const worker = workerMod.default;
const { pinyinInitials } = workerMod;

const SESSION_SECRET = 'mock-session-secret-0123456789abcdef';
const FS_APP_TOKEN = 'mock-fs-app-token-xyz';
const LEDGER_TABLE_ID = 'tblMockLedger22';
const ROSTER_TABLE_ID = 'tblMockRoster22';
const FAKE_ID_CARD = '370101199001011234'; // 真实表有「身份证号码」列 → 必须被丢弃/不外泄

const PW = (name, phone) => pinyinInitials(name) + phone.slice(-4);

// ---- 台账（登录账号来源）：每人一个手机号，部门/上级经 session 透传 ----
const P_JIA = '13900000201', P_LI = '13900000202', P_WANG = '13900000203', P_ZHAO = '13900000204';
const P_QIAN = '13900000205', P_SUN = '13900000206', P_ZHOU = '13900000207', P_WU = '13900000208';
const P_ZHENG = '13900000209', P_CHU = '13900000210';
const ledger = (name, phone, dept, superior = '上级甲') => ({ record_id: 'L-' + phone, fields: { '姓名': name, '直接上级': superior, '所属部门': dept, '职位': '管理员', '网格长等级': '三级网格长', '手机号': phone, '分级': '管理员' } });
const LEDGER_ROWS = [
  ledger('贾班长', P_JIA, '甲班'),
  ledger('李双长', P_LI, '甲班'),
  ledger('王双员', P_WANG, '甲班'),
  ledger('赵双长', P_ZHAO, '丙班'),
  ledger('钱独长', P_QIAN, '甲班'),
  ledger('孙中管', P_SUN, '甲班'),
  ledger('周台账', P_ZHOU, '甲班'),
  ledger('吴缺职', P_WU, '甲班'),
  ledger('郑配长', P_ZHENG, '甲班'),
  ledger('楚正长', P_CHU, '甲班'),
];

// ---- 花名册 fixture：同名多行的各种组合 ----
const r = (id, code, name, dept, job, area, extra = {}) => ({
  record_id: id,
  fields: { 员工编码: code, 姓名: name, 用工关系状态: '正式员工', 所属部门: dept, 职位: job, '负责区域（在职）': area, ...extra },
});
const ROSTER_ROWS = [
  // ① 贾班长：非网格长那行**部门与台账一致**（旧逻辑会误选它），网格长那行部门不一致
  r('R1', 'E001', '贾班长', '甲班', '乡镇保洁员', '甲村'),
  r('R2', 'E002', '贾班长', '乙班', '人工班长', ''),
  // ② 李双长：两行都是网格长，部门不同
  r('R3', 'E003', '李双长', '甲班', '人工班长', '甲村'),
  r('R4', 'E004', '李双长', '乙班', '人工班长', '乙村'),
  // ③ 王双员：两行都是非网格长（部门不同）→ 不得被误杀
  r('R5', 'E005', '王双员', '甲班', '乡镇保洁员', '甲村'),
  r('R6', 'E006', '王双员', '乙班', '乡镇保洁员', '乙村'),
  // ④ 赵双长：两行都是网格长且同部门 → 无论如何都不可收敛
  r('R7', 'E007', '赵双长', '丙班', '人工班长', '丙村'),
  r('R8', 'E008', '赵双长', '丙班', '人工班长', '丁村'),
  // ⑤ 钱独长：姓名唯一（62/68 类人群代表）
  r('R9', 'E009', '钱独长', '甲班', '人工班长', '甲村', { 身份证号码: FAKE_ID_CARD }),
  // ⑥ 孙中管：含「中转站管理员」——精确匹配下不得算网格长
  r('R10', 'E010', '孙中管', '甲班', '中转站管理员', '甲村'),
  r('R11', 'E011', '孙中管', '乙班', '人工班长', '乙村'),
  // ⑦ 周台账：职位用的是台账词汇（管理员）
  r('R12', 'E012', '周台账', '甲班', '管理员', '甲村'),
  r('R13', 'E013', '周台账', '乙班', '乡镇保洁员', '乙村'),
  // ⑧ 吴缺职：两行都没有「职位」列 → 职位无法判定，不得误杀
  r('R14', 'E014', '吴缺职', '甲班', undefined, '甲村'),
  r('R15', 'E015', '吴缺职', '乙班', undefined, '乙村'),
  // ⑨⑩ 白名单覆盖用例
  r('R16', 'E016', '郑配长', '甲班', '乡镇保洁员', '甲村'),
  r('R17', 'E017', '郑配长', '乙班', '人工班长', '乙村'),
  r('R18', 'E018', '楚正长', '甲班', '乡镇保洁员', '甲村'),
  r('R19', 'E019', '楚正长', '乙班', '人工片区长', '乙村'),
];

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/auth/v3/tenant_access_token/internal')) return new Response(JSON.stringify({ code: 0, tenant_access_token: 'mock-fs-tenant-token', expire: 7200 }), { status: 200 });
  if (u.includes(`/tables/${LEDGER_TABLE_ID}/records`)) return new Response(JSON.stringify({ code: 0, data: { items: LEDGER_ROWS, has_more: false } }), { status: 200 });
  if (u.includes(`/tables/${ROSTER_TABLE_ID}/records`)) return new Response(JSON.stringify({ code: 0, data: { items: ROSTER_ROWS, has_more: false } }), { status: 200 });
  throw new Error(`UNMOCKED URL (guard): ${u}`);
};

function workerEnv(overrides = {}) {
  return {
    STORAGE_BACKEND: 'feishu',
    FS_APP_TOKEN, FS_APP_ID: 'mock-fs-app-id', FS_APP_SECRET: 'mock-fs-app-secret',
    FS_LEDGER_TABLE_ID: LEDGER_TABLE_ID,
    FS_ROSTER_TABLE_ID: ROSTER_TABLE_ID,
    ROSTER_CACHE_TTL_MS: '0',
    MOBILE_LOGIN_ENABLED: 'true',
    WORKER_SESSION_SECRET: SESSION_SECRET,
    MOBILE_SESSION_TTL_SECONDS: '7200',
    ...overrides,
  };
}

let pass = 0, failn = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_MOCK ${n}${x ? ' :: ' + x : ''}`); };
const fail = (n, d) => { failn++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : fail(n, d || 'assertion false'));

async function login(phone, env) {
  const row = LEDGER_ROWS.find((x) => String(x.fields['手机号']) === phone);
  const res = await worker.fetch(new Request('https://worker.local/api/mobile/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.1' },
    body: JSON.stringify({ phone, password: PW(row.fields['姓名'], phone) }),
  }), env);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, token: json.token || '' };
}
async function meta(token, env) {
  const res = await worker.fetch(new Request('https://worker.local/api/mobile/patrol/meta', { headers: { authorization: 'Bearer ' + token } }), env);
  const text = await res.text();
  return { status: res.status, json: JSON.parse(text || '{}'), text };
}
// 便捷：登录 → 取 meta
async function resolveAs(name, phone, env = workerEnv()) {
  const lg = await login(phone, env);
  if (!lg.token) return { loginFailed: `${lg.status} ${JSON.stringify(lg.json).slice(0, 160)}` };
  const m = await meta(lg.token, env);
  return m;
}

console.log('===== A. 重名 + 职位消歧（核心口径） =====');
{
  // ① 非网格长那行部门与台账一致、网格长那行部门不一致 → 必须选网格长（职位优先于部门）
  const m = await resolveAs('贾班长', P_JIA);
  const j = m.json;
  assert(m.status === 200 && j.grid_resolved === true, 'A1 重名+1 名网格长 → 解析成功', `status=${m.status} resolved=${j.grid_resolved}`);
  assert(j.grid_resolved_by === 'name+job', 'A2 解析依据 = name+job（新增职位键）', `by=${j.grid_resolved_by}`);
  assert(JSON.stringify(j.grids) === JSON.stringify(['乙班']), 'A3 取网格长那行（乙班）而非同名非网格长（甲村）', JSON.stringify(j.grids));
  assert(j.roster_matches === 1, 'A4 roster_matches=1（收敛后唯一）', `matched=${j.roster_matches}`);
}
{
  // ⑥ 「中转站管理员」不得被当成网格长（禁 `/管理员/` 模糊匹配）
  const m = await resolveAs('孙中管', P_SUN);
  const j = m.json;
  assert(j.grid_resolved_by === 'name+job' && JSON.stringify(j.grids) === JSON.stringify(['乙村']),
    'A5 「中转站管理员」不算网格长 → 选「人工班长」行（禁模糊匹配）', `by=${j.grid_resolved_by} grids=${JSON.stringify(j.grids)}`);
}
{
  // ⑦ 台账词汇等值写法（管理员）同样被接受
  const m = await resolveAs('周台账', P_ZHOU);
  const j = m.json;
  assert(j.grid_resolved_by === 'name+job' && JSON.stringify(j.grids) === JSON.stringify(['甲村']),
    'A6 花名册「职位=管理员」（台账词汇）等同视为网格长', `by=${j.grid_resolved_by} grids=${JSON.stringify(j.grids)}`);
}

console.log('===== B. 职位不能定案时的降级（不误杀） =====');
{
  // ② 两名网格长 → 降级部门
  const m = await resolveAs('李双长', P_LI);
  const j = m.json;
  assert(j.grid_resolved_by === 'name+dept' && JSON.stringify(j.grids) === JSON.stringify(['甲村']),
    'B1 重名+2 名网格长 → 降级「所属部门」收敛', `by=${j.grid_resolved_by} grids=${JSON.stringify(j.grids)}`);
}
{
  // ③ 全员非网格长 → 保留原全集继续降级（既有行为，不被打成 fail-closed）
  const m = await resolveAs('王双员', P_WANG);
  const j = m.json;
  assert(j.grid_resolved === true && j.grid_resolved_by === 'name+dept' && JSON.stringify(j.grids) === JSON.stringify(['甲村']),
    'B2 重名+全员非网格长 → 不误杀，降级部门（职位未维护时保持可用）', `by=${j.grid_resolved_by} grids=${JSON.stringify(j.grids)}`);
}
{
  // ⑧ 职位列全空同理
  const m = await resolveAs('吴缺职', P_WU);
  const j = m.json;
  assert(j.grid_resolved === true && j.grid_resolved_by === 'name+dept', 'B3 职位列缺失 → 降级部门（保守不误杀）', `by=${j.grid_resolved_by} grids=${JSON.stringify(j.grids)}`);
}

console.log('===== C. fail-closed 与零回归 =====');
{
  // ④ 两名网格长且同部门 → 不可收敛
  const m = await resolveAs('赵双长', P_ZHAO);
  const j = m.json;
  assert(m.status === 200 && j.grid_resolved === false && Array.isArray(j.grids) && j.grids.length === 0,
    'C1 重名+2 名网格长同部门 → 仍 fail-closed（绝不盲选）', JSON.stringify({ resolved: j.grid_resolved, grids: j.grids }));
  assert(j.grid_resolved_by === null && j.roster_matches === 2, 'C2 by=null 且回传 matched=2（便于运维定位）', `by=${j.grid_resolved_by} matched=${j.roster_matches}`);
  assert(j.grid_mode === 'unresolved' && /无法确定巡查网格/.test(j.message || ''), 'C3 grid_mode=unresolved + 可读提示');
}
{
  // ⑤ 姓名唯一 → 完全不受影响
  const m = await resolveAs('钱独长', P_QIAN);
  const j = m.json;
  assert(j.grid_resolved_by === 'name' && JSON.stringify(j.grids) === JSON.stringify(['甲村']),
    'C4 姓名唯一 → by=name（62/68 类人群零回归）', `by=${j.grid_resolved_by} grids=${JSON.stringify(j.grids)}`);
}

console.log('===== D. 白名单可配置（业务加职位免改码） =====');
{
  // ⑧ 覆盖为「乡镇保洁员」→ 原非网格长那行成为唯一候选
  const m = await resolveAs('郑配长', P_ZHENG, workerEnv({ PATROL_GRID_LEADER_JOBS: '乡镇保洁员' }));
  const j = m.json;
  assert(j.grid_resolved_by === 'name+job' && JSON.stringify(j.grids) === JSON.stringify(['甲村']),
    'D1 PATROL_GRID_LEADER_JOBS 逗号精确值生效', `by=${j.grid_resolved_by} grids=${JSON.stringify(j.grids)}`);
}
{
  // `/re/` 形式按正则
  const m = await resolveAs('楚正长', P_CHU, workerEnv({ PATROL_GRID_LEADER_JOBS: '/片区长/' }));
  const j = m.json;
  assert(j.grid_resolved_by === 'name+job' && JSON.stringify(j.grids) === JSON.stringify(['乙村']),
    'D2 `/re/` 正则形式生效', `by=${j.grid_resolved_by} grids=${JSON.stringify(j.grids)}`);
}

console.log('===== E. 不泄露敏感信息 =====');
{
  const m = await resolveAs('钱独长', P_QIAN);
  assert(!m.text.includes(FAKE_ID_CARD), 'E1 响应不含花名册「身份证号码」');
  assert(!m.text.includes(SESSION_SECRET), 'E2 响应不含会话密钥');
  assert(!/password|secret/i.test(m.text), 'E3 响应不含任何凭据字段');
}

console.log(`\n===== RESULT: ${pass} PASS_MOCK, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
