/* CF-WPS-19: OFFLINE mock tests — 选人数据链（台账组织关系 + 真实花名册）。
 * 覆盖：
 *   ① GET /api/mobile/org/subordinates  台账「直接上级」解出下级，按分级分层；
 *      ?under= 逐层下钻；越权（不在本人子树）→ 403；本人同名歧义 → AMBIGUOUS_SELF；
 *      环检测与深度上限（纯函数直接测）。
 *   ② GET /api/mobile/roster  花名册字段容错映射、离职剔除、班组/网格过滤、姓名/工号搜索。
 *      数据源 = 飞书多维表格「花名册」表（storageConfig.rosterSheetId = FS_ROSTER_TABLE_ID），
 *      与台账/身份同后端（生产 = feishu）。
 * GUARDS:
 *  - global fetch fully mocked：NO real network（未 mock 的 URL 直接抛错）
 *  - 全部凭据/姓名/手机号为 fixture 假值；身份证号码列故意填入 → 断言绝不外泄
 *  - 未认证 → 401；花名册未配置 → 503
 * Run: node test/cfwps19.test.mjs
 */
const workerMod = await import('../index.js');
const worker = workerMod.default;
const { pinyinInitials, ledgerSubtree, ledgerChildren, splitOrg, ORG_MAX_DEPTH } = workerMod;

// ---- fixture (all fake) ----
const SESSION_SECRET = 'mock-session-secret-0123456789abcdef';
const FS_APP_TOKEN = 'mock-fs-app-token-xyz';
const FS_APP_ID = 'mock-fs-app-id';
const FS_APP_SECRET = 'mock-fs-app-secret';
const LEDGER_TABLE_ID = 'tblMockLedger';
const ROSTER_TABLE_ID = 'tblMockRoster';
const FAKE_ID_CARD = '370101199001011234'; // 真实表有「身份证号码」列 → 必须被丢弃

const PW = (name, phone) => pinyinInitials(name) + phone.slice(-4);
// 组织链：王五(公司管理) → 李四(片区经理) → 张三(管理员)
//                     └→ 赵六 / 孙七 / 周八×2（直属管理员，后者同名制造歧义）
const P_WANG = '13900000101', P_LI = '13900000102', P_ZHANG = '13900000103';
const P_ZHAO = '13900000104', P_SUN = '13900000105', P_Z1 = '13900000106', P_Z2 = '13900000107';
const LEDGER_ROWS = [
  { record_id: 'L1', fields: { '姓名': '王五', '直接上级': '总领导', '所属部门': '环卫作业中心', '职位': '经理', '网格长等级': '一级网格长', '手机号': P_WANG, '分级': '公司管理' } },
  { record_id: 'L2', fields: { '姓名': '李四', '直接上级': '王五', '所属部门': '测试片区', '职位': '乡镇作业中心经理', '网格长等级': '二级网格长', '手机号': P_LI, '分级': '乡镇作业中心经理' } },
  { record_id: 'L3', fields: { '姓名': '张三', '直接上级': '李四', '所属部门': '测试一班', '职位': '管理员', '网格长等级': '三级网格长', '手机号': P_ZHANG, '分级': '管理员' } },
  { record_id: 'L4', fields: { '姓名': '赵六', '直接上级': '王五', '所属部门': '直属一组', '职位': '管理员', '网格长等级': '三级网格长', '手机号': P_ZHAO, '分级': '管理员' } },
  { record_id: 'L5', fields: { '姓名': '孙七', '直接上级': '王五', '所属部门': '直属二组', '职位': '管理员', '网格长等级': '三级网格长', '手机号': P_SUN, '分级': '管理员' } },
  { record_id: 'L6', fields: { '姓名': '周八', '直接上级': '王五', '所属部门': '重复一组', '职位': '管理员', '手机号': P_Z1, '分级': '管理员' } },
  { record_id: 'L7', fields: { '姓名': '周八', '直接上级': '王五', '所属部门': '重复二组', '职位': '管理员', '手机号': P_Z2, '分级': '管理员' } },
  { record_id: 'L8', fields: { '姓名': '无下级甲', '所属部门': '孤立组', '职位': '管理员', '手机号': '13900000108', '分级': '管理员' } },
];
// 该手机号在台账中不存在（未录入 → 不可登录）
const P_GHOST = '13900000199';

// 花名册 fixture —— 列名与飞书「花名册」表真实列一致（16 列中的业务相关列）
// （员工编码/姓名/所属部门/职位/性别/年龄/用工关系状态/负责区域（在职）+ 身份证号码）
// dept＝所属部门（班组，选人收敛口径）；area＝负责区域（在职）（网格，巡查口径）
// 注：真实表当前无手机号列；R1/R2 故意使用「手机号」与「手机号码」两种列名，
//     用于验证别名容错机制（业务后续补列即生效、无需改代码）。
const ROSTER_ROWS = [
  { record_id: 'R1', fields: { 员工编码: 'E001', 姓名: '张保洁', 用工关系状态: '正式员工', 所属部门: '测试一班', '负责区域（在职）': '八里堂村+惠宁', 手机号: '13700001111', 性别: '男', 年龄: '55', 职位: '保洁员', 身份证号码: FAKE_ID_CARD } },
  { record_id: 'R2', fields: { 员工编码: 'E002', 姓名: '李保洁', 用工关系状态: '正式员工', 所属部门: '测试一班', '负责区域（在职）': '八里堂村', 手机号码: '13700002222', 性别: '女', 年龄: '48', 职位: '保洁员' } },
  { record_id: 'R3', fields: { 员工编码: 'E003', 姓名: '王离职', 用工关系状态: '离职', 所属部门: '测试一班', '负责区域（在职）': '八里堂村', 手机号: '13700003333', 性别: '男', 年龄: '60', 职位: '保洁员', 离职日期: '2026/01/01' } },
  { record_id: 'R4', fields: { 员工编码: 'E004', 姓名: '赵司机', 用工关系状态: '正式员工', 所属部门: '测试二班', '负责区域（在职）': '测试一班', 性别: '男', 年龄: '40', 职位: '司机' } },
  // R5：无「负责区域（在职）」——证明班组口径（dept）独立于网格口径（area）
  { record_id: 'R5', fields: { 员工编码: 'E005', 姓名: '孙管理', 用工关系状态: '正式员工', 所属部门: '测试片区', 性别: '女', 年龄: '35', 职位: '管理员' } },
  // R6：网格串比查询班组更短 → 不得反向误命中（真机教训：宁城街道三班某人网格为「宁城街道」）
  { record_id: 'R6', fields: { 员工编码: 'E006', 姓名: '吴三班', 用工关系状态: '正式员工', 所属部门: '测试三班', '负责区域（在职）': '测试', 性别: '男', 年龄: '44', 职位: '保洁员' } },
];
let rosterUpstreamCalls = 0;

// ---- mock fetch: 飞书（台账 + 花名册 + 表清单）；unmocked URL = hard fail ----
// mockTableList 可变：C22「花名册未配置」改用全新 baseToken + 无花名册的表清单，模拟缺表
let mockTableList = [
  { table_id: LEDGER_TABLE_ID, name: 'H5移动端身份表' },
  { table_id: ROSTER_TABLE_ID, name: 'H5花名册表' },
  { table_id: 'tblMockProd', name: 'H5员工日常不安全行为台账' },
];
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/auth/v3/tenant_access_token/internal')) {
    return new Response(JSON.stringify({ code: 0, tenant_access_token: 'mock-fs-tenant-token', expire: 7200 }), { status: 200 });
  }
  if (/\/bitable\/v1\/apps\/[^/]+\/tables(\?|$)/.test(u)) {
    // 缺花名册的 base（C22）或缺身份表/台账的 base（A17）：表清单按 token 剔除
    const items = u.includes('mock-base-no-roster')
      ? mockTableList.filter((t) => t.name !== 'H5花名册表')
      : u.includes('mock-base-no-identity')
        ? mockTableList.filter((t) => t.name !== 'H5移动端身份表')
        : mockTableList;
    return new Response(JSON.stringify({ code: 0, data: { items, has_more: false } }), { status: 200 });
  }
  if (u.includes(`/tables/${LEDGER_TABLE_ID}/records`)) {
    return new Response(JSON.stringify({ code: 0, data: { items: LEDGER_ROWS, has_more: false } }), { status: 200 });
  }
  if (u.includes(`/tables/${ROSTER_TABLE_ID}/records`)) {
    rosterUpstreamCalls++;
    return new Response(JSON.stringify({ code: 0, data: { items: ROSTER_ROWS, has_more: false } }), { status: 200 });
  }
  throw new Error(`UNMOCKED URL (guard): ${u}`);
};

function workerEnv(overrides = {}) {
  return {
    STORAGE_BACKEND: 'feishu',
    FS_APP_TOKEN, FS_APP_ID, FS_APP_SECRET,
    FS_LEDGER_TABLE_ID: LEDGER_TABLE_ID,
    FS_ROSTER_TABLE_ID: ROSTER_TABLE_ID, // 飞书「花名册」表 = 选人 + 网格解析的唯一数据源
    ROSTER_CACHE_TTL_MS: '0', // 测试关闭缓存 → 每例确定性
    MOBILE_LOGIN_ENABLED: 'true',
    WORKER_SESSION_SECRET: SESSION_SECRET,
    MOBILE_SESSION_TTL_SECONDS: '7200',
    ...overrides,
  };
}

let pass = 0, failn = 0;
function ok(name, extra = '') { pass++; console.log(`PASS_MOCK ${name}${extra ? ' :: ' + extra : ''}`); }
function fail(name, detail) { failn++; console.log(`FAIL ${name} :: ${detail}`); }
function assert(cond, name, detail) { cond ? ok(name, typeof detail === 'string' ? detail : '') : fail(name, detail); }

async function login(phone, env) {
  const req = new Request('https://worker.local/api/mobile/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.1' },
    body: JSON.stringify({ phone, password: PW(nameOf(phone), phone) }),
  });
  const res = await worker.fetch(req, env);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, token: json.token || '' };
}
function nameOf(phone) {
  const row = LEDGER_ROWS.find((r) => String(r.fields['手机号']) === phone);
  return row ? row.fields['姓名'] : 'X';
}
async function get(path, token, env) {
  const req = new Request('https://worker.local' + path, {
    method: 'GET',
    headers: token ? { authorization: 'Bearer ' + token } : {},
  });
  const res = await worker.fetch(req, env);
  const text = await res.text();
  return { status: res.status, json: JSON.parse(text), text };
}

console.log('===== A. 组织关系：台账「直接上级」 =====');
const ENV = workerEnv();
const tokWang = (await login(P_WANG, ENV)).token;   // 公司管理
const tokLi = (await login(P_LI, ENV)).token;       // 片区经理
const tokZhang = (await login(P_ZHANG, ENV)).token; // 管理员

assert(!!tokWang && !!tokLi && !!tokZhang, 'A0 三个角色登录成功', `wang=${!!tokWang} li=${!!tokLi} zhang=${!!tokZhang}`);

{
  // 片区经理李四：直接下级只有管理员张三
  const r = await get('/api/mobile/org/subordinates', tokLi, ENV);
  const j = r.json;
  assert(r.status === 200 && j.success && j.code === 'OK', 'A1 经理取下级 200/OK', `status=${r.status} code=${j.code}`);
  assert(j.isSelf === true && j.count === 1, 'A2 经理直接下级数=1', `count=${j.count}`);
  assert(j.admins.length === 1 && j.admins[0].name === '张三', 'A3 下级管理员=张三', JSON.stringify(j.admins.map((a) => a.name)));
  assert(j.admins[0].department === '测试一班' && j.admins[0].gridLevel === '三级网格长', 'A4 管理员带部门/等级', JSON.stringify(j.admins[0]));
  assert(j.managers.length === 0 && j.others.length === 0, 'A5 经理层/其他为空');
}
{
  // 公司管理王五：直接下级含片区经理 1 + 直属管理员 4（周八×2 属两条独立记录）
  const r = await get('/api/mobile/org/subordinates', tokWang, ENV);
  const j = r.json;
  assert(j.managers.length === 1 && j.managers[0].name === '李四' && j.managers[0].department === '测试片区',
    'A6 公司管理看到下辖片区经理', JSON.stringify(j.managers));
  // ⚠️ 只断言「成员集合」不断言顺序：同 depth 的次序由 name.localeCompare(zh) 决定，
  //    而各 Node 构建的 ICU 中文排序不一致（本机 孙七<赵六，其他环境可能相反）。
  //    按名去重的 bug 已修（见 ledgerSubtree keyOf），这里改为集合比较以免误报。
  const adminNames = j.admins.map((a) => a.name).slice().sort();
  assert(j.admins.length === 4 && adminNames.join(',') === ['周八', '周八', '孙七', '赵六'].sort().join(','),
    'A7 直属管理员 4 人（同名两条独立记录）', j.admins.map((a) => a.name).join(','));
  assert(j.hasDeeper === true, 'A8 hasDeeper=true（可继续下钻）');
  assert(j.me.role === '公司管理' && j.me.name === '王五', 'A9 me 回显角色/姓名', JSON.stringify(j.me));
}
{
  // 下钻：?under=李四 → 其管理员
  const r = await get('/api/mobile/org/subordinates?under=' + encodeURIComponent('李四'), tokWang, ENV);
  const j = r.json;
  assert(j.isSelf === false && j.under.name === '李四', 'A10 under=李四 生效', JSON.stringify(j.under));
  assert(j.admins.length === 1 && j.admins[0].name === '张三', 'A11 李四的下级=张三');
  assert(j.under.department === '测试片区' && j.under.grade === '乡镇作业中心经理', 'A12 under 节点自身信息回显');
}
{
  // 越权：李四的子树里没有 孙七 → 403
  const r = await get('/api/mobile/org/subordinates?under=' + encodeURIComponent('孙七'), tokLi, ENV);
  assert(r.status === 403 && r.json.code === 'FORBIDDEN', 'A13 越权下钻他人 → 403 FORBIDDEN', `status=${r.status} code=${r.json.code}`);
}
{
  // 本人同名歧义：周八在台账有两条 → fail-closed
  const tokZhou = (await login(P_Z1, ENV)).token;
  const r = await get('/api/mobile/org/subordinates', tokZhou, ENV);
  assert(r.status === 200 && r.json.code === 'AMBIGUOUS_SELF', 'A14 本人姓名不唯一 → AMBIGUOUS_SELF', `code=${r.json.code}`);
  assert(r.json.admins.length === 0 && r.json.managers.length === 0, 'A15 歧义时不返回任何下级');
}
{
  const r = await get('/api/mobile/org/subordinates', '', ENV);
  assert(r.status === 401 && r.json.code === 'UNAUTHORIZED', 'A16 未认证 → 401', `status=${r.status}`);
}
{
  const bad = workerEnv({ FS_APP_TOKEN: 'mock-base-no-identity', FS_LEDGER_TABLE_ID: '', FS_ROSTER_TABLE_ID: '' });
  const r = await get('/api/mobile/org/subordinates', tokLi, bad);
  assert(r.status === 503 && r.json.code === 'IDENTITY_NOT_CONFIGURED', 'A17 台账未配置 → 503', `status=${r.status} code=${r.json.code}`);
}

console.log('===== B. 组织树纯函数（环 / 深度 / 分层） =====');
{
  const rows = [
    { name: 'A', superior: 'B' }, { name: 'B', superior: 'A' }, // 环
    { name: 'C', superior: 'B' },
  ];
  const sub = ledgerSubtree(rows, 'A');
  assert(Array.isArray(sub) && sub.length === 2, 'B1 A↔B 环不死循环且不重复计入', `len=${sub && sub.length}`);
  const sub2 = ledgerSubtree([{ name: 'A' }, { name: 'A' }], 'A');
  assert(sub2 === null, 'B2 本人同名 → null（fail-closed）');
  // 深链：限制 ORG_MAX_DEPTH 层
  const chain = [];
  for (let i = 0; i < ORG_MAX_DEPTH + 6; i++) chain.push({ name: 'N' + i, superior: i ? 'N' + (i - 1) : '' });
  const deep = ledgerSubtree(chain, 'N0');
  assert(deep.length === ORG_MAX_DEPTH, 'B3 深度受 ORG_MAX_DEPTH 限制', `len=${deep.length} max=${ORG_MAX_DEPTH}`);
  const { admins, managers, others } = splitOrg([
    { name: 'x', grade: '管理员', depth: 1 },
    { name: 'y', grade: '乡镇作业中心经理', depth: 1 },
    { name: 'z', grade: '临时工', depth: 1 },
  ]);
  assert(admins.length === 1 && managers.length === 1 && others.length === 1, 'B4 按分级分层正确');
  assert(splitOrg([]).admins.length === 0, 'B5 空输入安全');
}

console.log('===== C. 花名册（飞书「花名册」表） =====');
{
  const r = await get('/api/mobile/roster', tokLi, ENV);
  const j = r.json;
  assert(r.status === 200 && j.success && j.code === 'OK', 'C1 花名册 200/OK', `status=${r.status}`);
  assert(j.source === 'feishu', 'C2 响应标注数据源 = feishu（与 STORAGE_BACKEND 同源）', `source=${j.source}`);
  assert(j.rosterSize === 5, 'C3 在职人员 5 人（离职已剔除）', `rosterSize=${j.rosterSize}`);
}
{
  // 最小权限：无 area 且无 q 时收敛到本人所属部门（李四=测试片区 → 仅本班组 1 人）
  const r = await get('/api/mobile/roster', tokLi, ENV);
  const j = r.json;
  assert(j.filters.scopedToSelf === true && j.filters.area === '测试片区', 'C4 无参调用收敛到本人部门', JSON.stringify(j.filters));
  assert(j.total === 1 && j.items[0].name === '孙管理', 'C5 收敛后只返回本班组（不返回全公司 4 人）', JSON.stringify(j.items.map((x) => x.name)));
  assert(j.items[0].dept === '测试片区' && j.items[0].area === '', 'C6 无负责区域的人员仍可按班组命中（dept/area 分离）', JSON.stringify(j.items[0]));
}
{
  const r = await get('/api/mobile/roster?area=' + encodeURIComponent('测试一班'), tokZhang, ENV);
  const j = r.json;
  const names = j.items.map((x) => x.name).sort().join(',');
  // 张保洁/李保洁 按「所属部门」命中；赵司机 按「负责区域（在职）」命中
  assert(names === '张保洁,李保洁,赵司机', 'C7 area 过滤命中班组或负责区域', names);
  assert(j.total === 3, 'C8 total 与 items 一致', `total=${j.total}`);
  assert(!j.items.some((x) => x.name === '王离职'), 'C9 离职人员不出现在结果中');
  assert(!j.items.some((x) => x.name === '吴三班'),
    'C10 更短的网格串不得反向误命中（真机教训：网格「宁城街道」≠班组「宁城街道一班」）');
  assert(j.items.every((x) => (x.dept + '|' + x.area).includes('测试一班')), 'C11 结果班组或负责区域必含目标');
  assert(j.filters.scopedToSelf === false, 'C12 显式 area 时不标记为收敛调用');
}
{
  const r = await get('/api/mobile/roster?q=' + encodeURIComponent('保洁'), tokLi, ENV);
  const j = r.json;
  assert(j.total === 2 && j.items.length === 2, 'C13 姓名模糊搜索 = 2 人（q 不受部门收敛限制）', `total=${j.total}`);
}
{
  const r = await get('/api/mobile/roster?q=E004', tokLi, ENV);
  const j = r.json;
  assert(j.total === 1 && j.items[0].name === '赵司机', 'C14 员工编码可搜索', JSON.stringify(j.items.map((x) => x.name)));
}
{
  // 字段容错：R1 用「手机号」，R2 用「手机号码」；R4 无号码 → 空串（前端隐藏拨打）
  // 注：真实 WPS Sheet 11 当前无手机号列，此用例保证「业务补列即生效、无需改代码」
  const r = await get('/api/mobile/roster?area=' + encodeURIComponent('测试一班'), tokLi, ENV);
  const byName = Object.fromEntries(r.json.items.map((x) => [x.name, x]));
  assert(byName['张保洁'].phone === '13700001111', 'C15 「手机号」列被识别');
  assert(byName['李保洁'].phone === '13700002222', 'C16 「手机号码」别名被识别');
  assert(byName['张保洁'].job === '保洁员' && byName['张保洁'].sex === '男' && String(byName['张保洁'].age) === '55',
    'C17 职位/性别/年龄透传', JSON.stringify(byName['张保洁']));
  assert(byName['张保洁'].code === 'E001' && !!byName['张保洁'].recordId, 'C18 记录 ID 与员工编码透传');
  const r4 = await get('/api/mobile/roster?q=' + encodeURIComponent('赵司机'), tokLi, ENV);
  assert(r4.json.items[0].phone === '', 'C19 未配号码 → 空串（不臆造）');
}
{
  const r = await get('/api/mobile/roster?q=' + encodeURIComponent('不存在的人'), tokLi, ENV);
  assert(r.status === 200 && r.json.total === 0 && r.json.items.length === 0, 'C20 无结果 → 空数组（非错误）');
}
{
  const r = await get('/api/mobile/roster', '', ENV);
  assert(r.status === 401, 'C21 花名册未认证 → 401', `status=${r.status}`);
  const r2 = await get('/api/mobile/roster', tokLi, workerEnv({ FS_APP_TOKEN: 'mock-base-no-roster', FS_ROSTER_TABLE_ID: '', FS_LEDGER_TABLE_ID: '' }));
  assert(r2.status === 503 && r2.json.code === 'ROSTER_NOT_CONFIGURED', 'C22 花名册未配置 → 503', `code=${r2.json.code}`);
}
{
  const r = await get('/api/mobile/roster?area=' + encodeURIComponent('测试一班') + '&limit=1', tokLi, ENV);
  assert(r.json.items.length === 1 && r.json.truncated === true && r.json.total === 3, 'C23 limit 截断并标记 truncated', `items=${r.json.items.length} truncated=${r.json.truncated}`);
}
{
  // 花名册缓存：默认关闭（本环境 TTL=0）→ 两次调用各扫一次上游
  const before = rosterUpstreamCalls;
  await get('/api/mobile/roster?area=' + encodeURIComponent('测试一班'), tokLi, ENV);
  await get('/api/mobile/roster?area=' + encodeURIComponent('测试一班'), tokLi, ENV);
  assert(rosterUpstreamCalls - before === 2, 'C24 TTL=0 时不做缓存（每次真实读取上游）', `calls=${rosterUpstreamCalls - before}`);
}
{
  // 上游失败 → 502（不泄漏上游错误细节）
  const failing = workerEnv();
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v3/tenant_access_token/internal')) {
      return new Response(JSON.stringify({ code: 0, tenant_access_token: 'mock-fs-tenant-token', expire: 7200 }), { status: 200 });
    }
    return new Response(JSON.stringify({ code: 99991, msg: 'internal upstream detail' }), { status: 500 });
  };
  const r = await get('/api/mobile/roster', tokLi, failing);
  assert(r.status === 502 && r.json.code === 'UPSTREAM_ERROR', 'C25 上游失败 → 502 统一文案', `status=${r.status} code=${r.json.code}`);
  assert(!r.text.includes('internal upstream detail'), 'C26 不泄漏上游错误原文');
  globalThis.fetch = orig;
}

console.log('===== D. 响应不含敏感字段 =====');
{
  const rOrg = await get('/api/mobile/org/subordinates', tokLi, ENV);
  const rRoster = await get('/api/mobile/roster?area=' + encodeURIComponent('测试一班'), tokLi, ENV);
  const joined = rOrg.text + rRoster.text;
  assert(!joined.includes(SESSION_SECRET), 'D1 不含会话密钥');
  assert(!joined.includes(FS_APP_SECRET), 'D2 不含飞书应用密钥');
  assert(!joined.includes(FS_APP_TOKEN), 'D3 不含 base token');
  assert(!joined.includes('tenant_access_token'), 'D4 不回显上游 token 字段');
  assert(!/password|password_hash|\$2[aby]\$/.test(joined), 'D5 不含任何口令字段');
  assert(!joined.includes(FAKE_ID_CARD) && !/\d{17}[\dXx]/.test(joined), 'D6 身份证号码列被丢弃（真实表有该列）');
}

console.log(`\n===== RESULT: ${pass} passed, ${failn} failed =====`);
if (failn) process.exit(1);
