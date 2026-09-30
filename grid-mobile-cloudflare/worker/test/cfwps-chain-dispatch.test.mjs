/* CF-WPS-派发链路 离线回归：转派后，上游派发人的「派发记录」不能丢
 *
 * 用户反馈（2026-09-30 原话）：
 *   「公司管理指派后给乡镇作业中心经理，乡镇作业中心经理指派给管理员后，
 *     公司指派人员的派发记录中，无此条指派记录」
 *
 * 根因：`handleAssign` 每次指派都**覆盖**「指派人ID」。经理一转派，这条记录的
 *   指派人就变成了经理；而 /api/mobile/dispatched 按「指派人ID == 我」过滤 ⇒
 *   公司管理（首发人）的记录凭空消失。
 *
 * 修法：引入**只追加、不覆盖**的「派发链路ID / 派发链路」两列，dispatched 的过滤
 *   改为 `指派人ID == 我 或 我在派发链路里`；并把「我的派发时间」按链路反查，
 *   使排序 / 挂账 / 本月派发都按**我方视角**算（否则公司管理会看到经理的转派时间）。
 *
 * 本测试用 mock 飞书端点钉死（零真实网络 / 零真实写库）：
 *   A. 首发（公司管理 → 经理）：链路起点 = 公司管理
 *   B. 转派（经理 → 管理员）：链路**追加**经理，指派人ID 变为经理，链路不丢
 *   C. ★ 公司管理的 dispatched **仍能看到这条**（本缺陷的核心回归）
 *   D. 公司管理看到的「派发时间」= 他自己派发的时间（不是经理转派的时间）
 *   E. 公司管理看到 reassigned=true + 完整链路文案
 *   F. 经理（当前指派人）看到 reassigned=false，且**不重复**（两路搜索需去重）
 *   G. 老数据（无链路列、只有指派人ID）仍能按原口径查到
 *   H. summary 的 month_dispatch / dispatch_pending 与 dispatched 同源同值
 *   I. 无会话 → 401
 *
 * Run: node test/cfwps-chain-dispatch.test.mjs
 */
const workerMod = await import('../index.js');
const worker = workerMod.default;
const { pinyinInitials, hashPassword } = workerMod;

const SESSION_SECRET = 'mock-session-secret-chain-dispatch-0123456789';
const FS_APP_TOKEN = 'mock-fs-app-token-chain';
const LEDGER_TABLE_ID = 'tblMockLedgerCH';
const PATROL_TABLE_ID = 'tblMockPatrolCH';
const CHAIN_SEP = ' → ';

const cnNow = () => new Date(Date.now() + 8 * 3600 * 1000);
const ymOf = (d) => d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
const THIS_YM = ymOf(cnNow());
const PREV_YM = (() => { const d = cnNow(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return ymOf(d); })();

/* 三个角色：公司管理戊（首发）/ 乡镇作业中心经理丙（转派）/ 管理员丁（最终接收人） */
const BOSS_NAME = '测试公司管理戊';
const BOSS_PHONE = '13900000470';
const ME_NAME = '测试经理丙';
const ME_PHONE = '13900000471';
const SUB_NAME = '测试管理员丁';
const SUB_PHONE = '13900000472';
const OTHER_PHONE = '13900000479';

const pw = (name, phone) => pinyinInitials(name) + phone.slice(-4);
const BOSS_PW = pw(BOSS_NAME, BOSS_PHONE);
const ME_PW = pw(ME_NAME, ME_PHONE);
const SUB_PW = pw(SUB_NAME, SUB_PHONE);

// 已设过自定义密码 —— 否则会撞上「首次登录须改密」网关（写接口一律 403）
const BOSS_HASH = await hashPassword(BOSS_PW, 20000);
const ME_HASH = await hashPassword(ME_PW, 20000);
const SUB_HASH = await hashPassword(SUB_PW, 20000);

const LEDGER_ROWS = [
  { record_id: 'L-boss', fields: { 姓名: BOSS_NAME, 直接上级: '—', 所属部门: '安环管理部', 职位: '经理', 网格长等级: '一级网格长', 手机号: BOSS_PHONE, 分级: '公司管理', 密码哈希: BOSS_HASH } },
  { record_id: 'L-me', fields: { 姓名: ME_NAME, 直接上级: BOSS_NAME, 所属部门: '甲片区', 职位: '经理', 网格长等级: '二级网格长', 手机号: ME_PHONE, 分级: '乡镇作业中心经理', 密码哈希: ME_HASH } },
  { record_id: 'L-sub', fields: { 姓名: SUB_NAME, 直接上级: ME_NAME, 所属部门: '甲片区', 职位: '管理员', 网格长等级: '三级网格长', 手机号: SUB_PHONE, 分级: '管理员', 密码哈希: SUB_HASH } },
];

const row = (id, o) => ({
  record_id: id,
  fields: Object.assign({
    '片区|班组': '甲片区', 违章行为: '未戴安全帽', 违章人员姓名: '张三', 描述: '', 日期: Date.now(),
  }, o),
});

/* R0：初始**未派发**（无指派人、无链路）—— 用来跑「首发 → 转派」的真实写入链路
   R1：链路已存在、且**两段时间明显不同**（公司管理上月派 → 经理本月转派）——
       用来钉死「公司管理看到的是**自己**的派发时间 / 月份」，两次操作在同一分钟时 R0 区分不出来
   R2：老数据（只有指派人ID、**没有**链路列）—— 验证向后兼容
   R3：别人派的 —— 一条都不该进我的列表 */
const BOSS1_AT = `${PREV_YM}-05 09:00`;   // 公司管理派发时间（上月）
const ME1_AT = `${THIS_YM}-10 09:30`;     // 经理转派时间（本月）
const R0 = row('R0', { 整改状态: '', 指派人ID: '', 指派时间: '' });
const R1 = row('R1', { 整改接收人ID: SUB_PHONE, 整改接收人姓名: SUB_NAME, 整改责任单位: '甲片区',
  整改状态: '待整改', 指派人ID: ME_PHONE, 指派人姓名: ME_NAME, 指派人单位: '甲片区',
  指派时间: ME1_AT,
  派发链路ID: `${BOSS_PHONE},${ME_PHONE}`,
  派发链路: `${BOSS_NAME}（安环管理部） ${BOSS1_AT}${CHAIN_SEP}${ME_NAME}（甲片区） ${ME1_AT}`,
  整改完成时间: '' });
const R2 = row('R2', { 整改接收人ID: SUB_PHONE, 整改接收人姓名: SUB_NAME, 整改责任单位: '甲片区',
  整改状态: '待整改', 指派人ID: ME_PHONE, 指派人姓名: ME_NAME, 指派人单位: '甲片区',
  指派时间: `${THIS_YM}-02 08:00`, 整改完成时间: '' });
const R3 = row('R3', { 整改接收人ID: SUB_PHONE, 整改接收人姓名: SUB_NAME, 整改责任单位: '乙片区',
  整改状态: '待整改', 指派人ID: OTHER_PHONE, 指派人姓名: '无关的人', 指派人单位: '乙片区',
  指派时间: `${THIS_YM}-03 08:00`, 派发链路ID: OTHER_PHONE, 派发链路: `无关的人（乙片区） ${THIS_YM}-03 08:00` });

const PATROL_ROWS = [R0, R1, R2, R3];

const FIELD_NAMES = [
  // 主台账待办列（含本次新增的链路两列 —— 全给齐，避免 mock 触发建列 POST）
  '整改接收人ID', '整改接收人姓名', '整改责任单位', '整改状态', '指派人ID', '指派人姓名', '指派人单位',
  '指派时间', '整改完成时间', '整改说明', '派发链路ID', '派发链路',
  '违章行为', '违章人员姓名', '违章照片', '整改后照片',
  // 身份表列
  '姓名', '直接上级', '所属部门', '职位', '网格长等级', '手机号', '分级', '密码哈希', '密码修改时间',
];

const searchCalls = [];   // { field, op, want }
let lastUpdate = null;    // 最近一次 PUT 的写入内容

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
      const target = PATROL_ROWS.find((r) => r.record_id === recId);
      if (target) Object.assign(target.fields, body.fields || {});   // 让后续 GET 看到新值
      return new Response(JSON.stringify({ code: 0, data: { record: { record_id: recId } } }), { status: 200 });
    }
    const r0 = PATROL_ROWS.find((r) => r.record_id === recId);
    if (!r0) return new Response(JSON.stringify({ code: 1254042, msg: 'RecordNotFound' }), { status: 404 });
    return new Response(JSON.stringify({ code: 0, data: { record: { record_id: recId, fields: r0.fields } } }), { status: 200 });
  }
  // 搜索：按飞书语义模拟（is = 全等；contains = 子串），并记录调用参数供断言
  if (u.includes(`/tables/${PATROL_TABLE_ID}/records/search`)) {
    const body = JSON.parse((init && init.body) || '{}');
    const cond = (body.filter && body.filter.conditions && body.filter.conditions[0]) || {};
    const field = String(cond.field_name || '');
    const want = String((cond.value || [])[0] || '');
    const op = String(cond.operator || 'is');
    searchCalls.push({ field, op, want });
    const items = PATROL_ROWS.filter((r) => {
      const v = r.fields[field] == null ? '' : String(r.fields[field]);
      if (!want) return true;
      return op === 'contains' ? v.includes(want) : v === want;
    });
    return new Response(JSON.stringify({ code: 0, data: { items, has_more: false } }), { status: 200 });
  }
  if (u.includes(`/tables/${LEDGER_TABLE_ID}/records/search`)) {
    return new Response(JSON.stringify({ code: 0, data: { items: LEDGER_ROWS, has_more: false } }), { status: 200 });
  }
  if (u.includes('/fields')) {
    return new Response(JSON.stringify({ code: 0, data: { items: FIELD_NAMES.map((n) => ({ field_name: n, type: 1 })), has_more: false } }), { status: 200 });
  }
  // 全量列表 GET /records?page_size=500（身份表登录扫描 + summary 的 scanRecords 都走这条）
  if (/\/records(\?|$)/.test(u)) {
    const items = u.includes(PATROL_TABLE_ID) ? PATROL_ROWS : LEDGER_ROWS;
    return new Response(JSON.stringify({ code: 0, data: { items, has_more: false } }), { status: 200 });
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
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.1.0.' + Math.floor(Math.random() * 200) },
    body: JSON.stringify({ phone, password }),
  }), env);
  const j = await r.json().catch(() => ({}));
  return { status: r.status, token: j.token, role: j.employee && j.employee.role };
};
const assign = (token, payload) => worker.fetch(new Request('https://worker.local/api/mobile/assign', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
  body: JSON.stringify(payload),
}), env);
const dispatched = async (token) => {
  const r = await worker.fetch(new Request('https://worker.local/api/mobile/dispatched', {
    headers: { authorization: 'Bearer ' + token },
  }), env);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const summary = async (token) => {
  const r = await worker.fetch(new Request('https://worker.local/api/mobile/summary', {
    headers: { authorization: 'Bearer ' + token },
  }), env);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

console.log(`\n=== CF-WPS-派发链路：转派后上游派发人的记录不能丢（本月=${THIS_YM}，上月=${PREV_YM}）===\n`);

/* ---- 前置：三个角色登录 ---- */
const bossLg = await login(BOSS_PHONE, BOSS_PW);
const meLg = await login(ME_PHONE, ME_PW);
const subLg = await login(SUB_PHONE, SUB_PW);
assert(bossLg.status === 200 && !!bossLg.token && bossLg.role === '公司管理', '前置：公司管理登录成功且角色正确', `HTTP ${bossLg.status} role=${bossLg.role}`);
assert(meLg.status === 200 && !!meLg.token && meLg.role === '经理', '前置：乡镇作业中心经理登录成功且角色正确', `HTTP ${meLg.status} role=${meLg.role}`);
assert(subLg.status === 200 && !!subLg.token && subLg.role === '管理员', '前置：管理员登录成功且角色正确', `HTTP ${subLg.status} role=${subLg.role}`);
const BOSS = bossLg.token, ME = meLg.token, SUB = subLg.token;

/* ================= A. 首发：公司管理 → 经理 ================= */
console.log('\n--- A. 首发（公司管理 → 乡镇作业经理）---');
const a1 = await assign(BOSS, { record_id: 'R0', assignee_id: ME_PHONE, assignee_name: ME_NAME, town: '甲片区', note: '公司派发' });
const a1b = await a1.json().catch(() => ({}));
assert(a1.status === 200 && a1b.success === true, 'A 首发指派 200 成功', `HTTP ${a1.status} ${JSON.stringify(a1b).slice(0, 80)}`);
const f1 = (lastUpdate && lastUpdate.fields) || {};
assert(lastUpdate && lastUpdate.recId === 'R0', 'A 写入的是目标记录 R0', String(lastUpdate && lastUpdate.recId));
assert(f1['指派人ID'] === BOSS_PHONE, 'A 指派人ID = 公司管理', String(f1['指派人ID']));
assert(f1['整改接收人ID'] === ME_PHONE, 'A 接收人 = 经理', String(f1['整改接收人ID']));
assert(f1['派发链路ID'] === BOSS_PHONE, 'A 链路起点 = 公司管理（首发）', String(f1['派发链路ID']));
assert(/^测试公司管理戊（安环管理部） \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(f1['派发链路'] || '')),
  'A 链路文案 = 姓名（单位） 时间', String(f1['派发链路']));
const bossAssignAt = String(f1['指派时间'] || '');
assert(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(bossAssignAt), 'A 指派时间格式正确', bossAssignAt);

/* ================= B. 转派：经理 → 管理员 ================= */
console.log('\n--- B. 转派（乡镇作业经理 → 管理员）---');
const b1 = await assign(ME, { record_id: 'R0', assignee_id: SUB_PHONE, assignee_name: SUB_NAME, town: '甲片区', note: '经理转派' });
const b1b = await b1.json().catch(() => ({}));
assert(b1.status === 200 && b1b.success === true, 'B 经理转派 200 成功', `HTTP ${b1.status} ${JSON.stringify(b1b).slice(0, 80)}`);
const f2 = (lastUpdate && lastUpdate.fields) || {};
assert(f2['指派人ID'] === ME_PHONE, 'B 指派人ID 被更新为经理（这正是缺陷的起因）', String(f2['指派人ID']));
assert(f2['整改接收人ID'] === SUB_PHONE, 'B 接收人 = 管理员', String(f2['整改接收人ID']));
assert(f2['派发链路ID'] === `${BOSS_PHONE},${ME_PHONE}`, 'B ★ 链路**追加**经理、且保留公司管理（只追加不覆盖）', String(f2['派发链路ID']));
assert(String(f2['派发链路']).includes(CHAIN_SEP), 'B 链路文案含分隔符（两段）', String(f2['派发链路']).slice(0, 120));
assert(String(f2['派发链路']).startsWith('测试公司管理戊（安环管理部）'), 'B 链路第一段仍是公司管理', String(f2['派发链路']).slice(0, 60));

/* ================= C/D/E. 公司管理的派发记录（核心回归） ================= */
console.log('\n--- C/D/E. 公司管理视角 ---');
const bossDisp = await dispatched(BOSS);
assert(bossDisp.status === 200 && bossDisp.body.success === true, 'C 公司管理 dispatched 200', `HTTP ${bossDisp.status}`);
const bIds = (bossDisp.body.records || []).map((r) => r.record_id);
assert(bIds.includes('R0'), 'C ★★ 转派后，公司管理的「派发记录」里**仍有这条**（本缺陷核心）', bIds.join(',') || '(空)');
assert(bIds.includes('R1'), 'C 静态链路数据同样可见（不只依赖本次写入）', bIds.join(','));
assert(!bIds.includes('R3'), 'C 别人派的记录不进公司管理列表', bIds.join(','));
assert(bossDisp.body.total === 2 && bossDisp.body.pending_count === 2, 'C 公司管理派发总数 = 2（他派过的 R0 + R1）', `total=${bossDisp.body.total} pending=${bossDisp.body.pending_count}`);
assert(bIds[0] === 'R0' && bIds[1] === 'R1', 'C 按**我方**派发时间倒序（今天派的在前，上月派的在后）', bIds.join(','));
const b0 = (bossDisp.body.records || []).find((r) => r.record_id === 'R0') || {};
assert(b0.assigned_at === bossAssignAt, 'D ★ 公司管理看到的派发时间 = **他自己**派发的时间（不是经理转派时间）', `${b0.assigned_at} vs ${bossAssignAt}`);
const bRec1 = (bossDisp.body.records || []).find((r) => r.record_id === 'R1') || {};
assert(bRec1.assigned_at === BOSS1_AT, 'D ★★ 时间可区分时同样成立：R1 显示上月我方派发时间，而非本月转派时间',
  `实际=${bRec1.assigned_at} 期望=${BOSS1_AT}（经理转派时间=${ME1_AT}）`);
assert(bRec1.assigned_at !== ME1_AT, 'D ★ 明确**不是**下游转派的时间', `assigned_at=${bRec1.assigned_at}`);
assert(b0.reassigned === true, 'E 公司管理看到 reassigned=true（已被下游转派）', String(b0.reassigned));
assert(String(b0.chain || '').includes('测试公司管理戊') && String(b0.chain || '').includes('测试经理丙'),
  'E 下发完整派发链路（公司管理 → 经理）', String(b0.chain).slice(0, 120));
assert(b0.assignee_name === SUB_NAME, 'E 「派给谁」显示**当前**接收人（管理员），便于看出活现在在谁手上', String(b0.assignee_name));
assert(!(bossDisp.body.done_records || []).some((r) => r.record_id === 'R0'), 'E 未整改完成的记录不进 done_records', '');
assert(searchCalls.some((c) => c.field === '派发链路ID' && c.op === 'contains'), 'C 服务端按「派发链路ID contains 我」补查一路',
  searchCalls.map((c) => `${c.field}:${c.op}`).join(' | '));
assert(searchCalls.some((c) => c.field === '指派人ID' && c.op === 'is'), 'C 同时保留原「指派人ID is 我」这一路（两路并集）',
  searchCalls.map((c) => `${c.field}:${c.op}`).join(' | '));

/* ================= F. 经理视角（当前指派人） ================= */
console.log('\n--- F. 经理视角 ---');
const meDisp = await dispatched(ME);
const mIds = (meDisp.body.records || []).map((r) => r.record_id);
assert(mIds.filter((x) => x === 'R0').length === 1, 'F ★ 经理视角下 R0 **只出现一次**（两路搜索必须去重）', mIds.join(','));
assert(mIds.filter((x) => x === 'R1').length === 1, 'F ★ R1 同样只出现一次（R1 两路都命中）', mIds.join(','));
assert(mIds.includes('R2'), 'G 老数据（只有指派人ID、无链路列）仍按原口径查到', mIds.join(','));
assert(!mIds.includes('R3'), 'F 别人派的记录不进经理列表', mIds.join(','));
assert(meDisp.body.total === 3, 'F 经理派发总数 = 3（R0 转派 + R1 转派 + R2 老数据）', `total=${meDisp.body.total}`);
const m0 = (meDisp.body.records || []).find((r) => r.record_id === 'R0') || {};
assert(m0.reassigned === false, 'F 经理是最新派发方 → reassigned=false', String(m0.reassigned));
assert(m0.assigned_at === String(f2['指派时间']), 'F 经理看到的是自己的派发时间', `${m0.assigned_at}`);
const m1 = (meDisp.body.records || []).find((r) => r.record_id === 'R1') || {};
assert(m1.assigned_at === ME1_AT, 'F 同一份数据、不同人看到不同派发时间（经理 = 自己的转派时间）', String(m1.assigned_at));
const m2 = (meDisp.body.records || []).find((r) => r.record_id === 'R2') || {};
assert(m2.assigned_at === `${THIS_YM}-02 08:00`, 'G 老数据派发时间原样下发', String(m2.assigned_at));

/* ================= H. summary 与 dispatched 同源 ================= */
console.log('\n--- H. 首页统计与下钻同源 ---');
const bossSum = await summary(BOSS);
assert(bossSum.status === 200 && bossSum.body.success === true, 'H 公司管理 summary 200', `HTTP ${bossSum.status}`);
assert(bossSum.body.dispatch_pending === bossDisp.body.pending_count,
  'H ★ summary.dispatch_pending == dispatched.pending_count（同源）', `${bossSum.body.dispatch_pending} vs ${bossDisp.body.pending_count}`);
assert(bossSum.body.month_dispatch === 1,
  'H ★ month_dispatch 按**公司管理自己**的派发月份算（R0 本月 = 1；R1 是上月，不计入）',
  `month_dispatch=${bossSum.body.month_dispatch}（若误用下游转派时间会变成 2）`);
const meSum = await summary(ME);
assert(meSum.body.month_dispatch === 3, 'H 经理本月派发 = 3（R0/R1/R2 都是本月）', `month_dispatch=${meSum.body.month_dispatch}`);
assert(meSum.body.dispatch_pending === meDisp.body.pending_count, 'H 经理 summary.dispatch_pending == dispatched.pending_count',
  `${meSum.body.dispatch_pending} vs ${meDisp.body.pending_count}`);

/* ================= I. 未认证 ================= */
console.log('\n--- I. 未认证 ---');
const anon = await dispatched('');
assert(anon.status === 401, 'I 无会话 → 401（不泄露记录）', `HTTP ${anon.status}`);
assert(!Array.isArray(anon.body.records), 'I 401 响应体不含 records', JSON.stringify(anon.body).slice(0, 80));

console.log(`\n===== RESULT: ${pass} PASS_MOCK, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
