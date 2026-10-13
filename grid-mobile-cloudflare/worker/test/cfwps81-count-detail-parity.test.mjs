/* CF-WPS-81 · 后端侧 —— 首页统计卡数字 与 下钻明细 必须**同源同值**
 *
 * 背景（项目自己写下的不变式，见 index.js handleSummary 与 check.html localUnsynced）：
 *   「本卡数字与下钻必须**同源**，否则『卡上写 78、点进去是另一套』」
 *   「⚠️ 判定条件必须与 renderStatDetail 的下钻过滤**逐字一致**，否则『数字 = 明细条数』会破」
 *
 * 但两侧的**取数方式**并不一样：
 *   · 卡片数字：handleSummary 对台账做一次 **scanRecords 全表扫描**（全量口径）；
 *   · 下钻明细：各自的分页接口，条数被 PATROL_LIST_LIMIT = 50 **截断**。
 * 于是只要某一组超过 50 条，「卡上 60、点进去 50」就必然发生。
 *
 * 本文件钉住两件事：
 *   ① 每个下钻接口都必须把**该组真实总数**一并下发（total / pending_count /
 *      done_count / monthly_done_count），且**不许被 50 条上限污染**；
 *   ② 那个真值必须**等于统计卡上的数字**（同源）。
 * 前端据此在标题里写「共 N 条（仅列最近 50 条）」，见 check.html 的 CF-WPS-81。
 * （截断提示真的渲染出来由 test/cfwps81-detail-truncation.e2e.mjs 负责。）
 *
 * Run: node worker/test/cfwps81-count-detail-parity.test.mjs
 */
const workerMod = await import('../index.js');
const worker = workerMod.default;
const { pinyinInitials, hashPassword } = workerMod;

const SESSION_SECRET = 'mock-session-secret-parity-0123456789abcdef';
const FS_APP_TOKEN = 'mock-fs-app-token-parity';
const LEDGER_TABLE_ID = 'tblMockLedgerParity';
const PATROL_TABLE_ID = 'tblMockPatrolParity';

const ME_NAME = '对账测试甲';
const ME_PHONE = '13900000881';
const OTHER_NAME = '对账测试乙';
const OTHER_PHONE = '13900000882';
const PW = (n, p) => pinyinInitials(n) + p.slice(-4);
const ME_HASH = await hashPassword(PW(ME_NAME, ME_PHONE), 20000);

const LEDGER_ROWS = [
  { record_id: 'L-me', fields: { 姓名: ME_NAME, 直接上级: '对账上级', 所属部门: '对账片区', 职位: '管理员', 网格长等级: '二级网格长', 手机号: ME_PHONE, 分级: '管理员', 密码哈希: ME_HASH } },
  { record_id: 'L-other', fields: { 姓名: OTHER_NAME, 直接上级: '对账上级', 所属部门: '对账片区', 职位: '管理员', 网格长等级: '二级网格长', 手机号: OTHER_PHONE, 分级: '管理员' } },
];

const TODO_F = {
  assigneeId: '整改接收人ID', assigneeName: '整改接收人姓名', town: '整改责任单位', status: '整改状态',
  assignerId: '指派人ID', assignerName: '指派人姓名', assignerDept: '指派人单位',
  assignedAt: '指派时间', doneAt: '整改完成时间', note: '整改说明',
  chainId: '派发链路ID', chainText: '派发链路',
};
const PEND_TXT = '待整改', DONE_TXT = '已完成';

/* 本月（与 Worker 的 todoNowLocal 同口径：东八区） */
const cnNow = new Date(Date.now() + 8 * 3600 * 1000);
const YM = cnNow.getUTCFullYear() + '-' + String(cnNow.getUTCMonth() + 1).padStart(2, '0');
const DAY = YM + '-13 08:00';
const DONE_DAY = YM + '-12 10:00';

const LIMIT = 50;          // PATROL_LIST_LIMIT
const N = 60;              // 每组 60 条 > 上限 → 必然触发截断

const rid = (p, i) => (p + String(i).padStart(6, '0')).slice(0, 16);   // 过 /^[A-Za-z0-9]{8,64}$/

const base = (id, o) => ({ record_id: id, fields: Object.assign({
  检查时间: DAY, 是否三违: '是', 违章行为: '闯红灯', 违章人员姓名: '张三',
  违章照片: [], 整改后照片: [], 备注: '',
  巡查人ID: '', 巡查时间: '', 日期: 1750000000000,
  [TODO_F.assigneeId]: '', [TODO_F.assigneeName]: '', [TODO_F.status]: '',
  [TODO_F.assignerId]: '', [TODO_F.assignerName]: '', [TODO_F.assignedAt]: '',
  [TODO_F.doneAt]: '', [TODO_F.chainId]: '', [TODO_F.chainText]: '',
}, o) });

const PATROL_ROWS = [];
// ① 我巡查的（本月）→ month_post
for (let i = 0; i < N; i++) PATROL_ROWS.push(base(rid('recMineP', i), { 巡查人ID: ME_PHONE, 巡查时间: DAY }));
// ② 派给我的·待整改 → pending
for (let i = 0; i < N; i++) PATROL_ROWS.push(base(rid('recToMeW', i), { 巡查人ID: OTHER_PHONE, 巡查时间: DAY, [TODO_F.assigneeId]: ME_PHONE, [TODO_F.assigneeName]: ME_NAME, [TODO_F.status]: PEND_TXT, [TODO_F.assignerId]: OTHER_PHONE, [TODO_F.assignedAt]: DAY }));
// ③ 派给我的·本月已完成 → rectified
for (let i = 0; i < N; i++) PATROL_ROWS.push(base(rid('recToMeD', i), { 巡查人ID: OTHER_PHONE, 巡查时间: DAY, [TODO_F.assigneeId]: ME_PHONE, [TODO_F.assigneeName]: ME_NAME, [TODO_F.status]: DONE_TXT, [TODO_F.assignerId]: OTHER_PHONE, [TODO_F.assignedAt]: DAY, [TODO_F.doneAt]: DONE_DAY }));
// ④ 我派出去的（本月）→ month_dispatch / dispatch_pending
for (let i = 0; i < N; i++) PATROL_ROWS.push(base(rid('recFromMe', i), { 巡查人ID: OTHER_PHONE, 巡查时间: DAY, [TODO_F.assignerId]: ME_PHONE, [TODO_F.assignerName]: ME_NAME, [TODO_F.assigneeId]: OTHER_PHONE, [TODO_F.assigneeName]: OTHER_NAME, [TODO_F.status]: PEND_TXT, [TODO_F.assignedAt]: DAY }));

const FIELD_NAMES = [
  '检查时间', '是否三违', '违章行为', '违章人员姓名', '违章照片', '整改后照片', '备注', '日期',
  '巡查人ID', '巡查时间', '幂等键', '密码哈希', '姓名', '直接上级', '所属部门', '职位', '网格长等级', '手机号', '分级',
  ...Object.values(TODO_F),
];

// 还原 fieldText 的取值口径（我的数据集里都是纯字符串 / 数字）
const txt = (v) => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? (x.text || x.name || '') : String(x))).join('');
  if (typeof v === 'object') return String(v.text || v.name || '');
  return String(v);
};
// 还原 searchRecords 的 filter 语义（operator: is / contains）
const applyFilter = (rows, body) => {
  const c = body && body.filter && body.filter.conditions && body.filter.conditions[0];
  if (!c) return rows;
  const want = String((c.value || [])[0]);
  return rows.filter((r) => {
    const got = txt(r.fields[c.field_name]);
    if (c.operator === 'contains') return got.includes(want);
    return got === want;
  });
};

let unmocked = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const method = String((init && init.method) || 'GET').toUpperCase();
  const body = (() => { try { return JSON.parse((init && init.body) || '{}'); } catch { return {}; } })();
  if (u.includes('/auth/v3/tenant_access_token/internal')) {
    return new Response(JSON.stringify({ code: 0, tenant_access_token: 'mock-tenant-token', expire: 7200 }), { status: 200 });
  }
  if (u.includes('/records/search')) {
    const rows = u.includes(PATROL_TABLE_ID) ? PATROL_ROWS : LEDGER_ROWS;
    return new Response(JSON.stringify({ code: 0, data: { items: applyFilter(rows, body), has_more: false } }), { status: 200 });
  }
  if (/\/records(\?|$)/.test(u)) {
    const rows = u.includes(PATROL_TABLE_ID) ? PATROL_ROWS : LEDGER_ROWS;
    return new Response(JSON.stringify({ code: 0, data: { items: rows, has_more: false } }), { status: 200 });
  }
  if (u.includes('/fields')) {
    if (method === 'POST') return new Response(JSON.stringify({ code: 1254000, msg: 'duplicated' }), { status: 200 });
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

const get = async (token, path) => {
  const r = await worker.fetch(new Request('https://worker.local' + path, {
    method: 'GET',
    headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'cf-connecting-ip': '10.2.0.' + Math.floor(Math.random() * 200) },
  }), env);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

console.log('\n=== CF-WPS-81 · 后端：统计卡数字 ↔ 下钻明细 同源同值 ===\n');
console.log(`数据集：每组 ${N} 条（> 列表上限 ${LIMIT}），月份 ${YM}\n`);

const login = await worker.fetch(new Request('https://worker.local/api/mobile/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.2.0.9' },
  body: JSON.stringify({ phone: ME_PHONE, password: PW(ME_NAME, ME_PHONE) }),
}), env);
const lj = await login.json().catch(() => ({}));
ck(login.status === 200 && !!lj.token, '前置：本人账号登录成功', `HTTP ${login.status} ${JSON.stringify(lj).slice(0, 120)}`);
const TOKEN = lj.token;
if (!TOKEN) { console.log('\n登录失败，后续用例无意义'); process.exit(1); }

/* ---------- 1. 统计卡数字（全量口径） ---------- */
console.log('═══ 1. /summary 的五个数字 ═══');
const sum = await get(TOKEN, '/api/mobile/summary');
ck(sum.status === 200 && sum.body.success === true, '① /summary 200 success', `HTTP ${sum.status}`);
const S = sum.body || {};
ck(S.month_post === N, '① month_post = ' + N, String(S.month_post));
ck(S.pending === N, '① pending = ' + N, String(S.pending));
ck(S.rectified === N, '① rectified = ' + N, String(S.rectified));
ck(S.month_dispatch === N, '① month_dispatch = ' + N, String(S.month_dispatch));
ck(S.dispatch_pending === N, '① dispatch_pending = ' + N, String(S.dispatch_pending));

/* ---------- 2. 下钻接口必须下发「真实总数」且不被上限污染 ---------- */
console.log('\n═══ 2. 下钻接口的真实总数（不受 ' + LIMIT + ' 条上限影响）═══');
const rec = await get(TOKEN, '/api/mobile/patrol/records?mine=1&month=' + YM + '&limit=' + LIMIT);
ck(rec.status === 200, '② /patrol/records 200', `HTTP ${rec.status}`);
ck((rec.body.records || []).length === LIMIT, '② 明细确实被截断到 ' + LIMIT + ' 条（所以必须有提示）', String((rec.body.records || []).length));
ck(rec.body.total === N, '② 但 total 必须是全量真值 ' + N, String(rec.body.total));
ck(rec.body.has_more === true, '② has_more = true（前端据此显示「仅列最近 N 条」）', String(rec.body.has_more));

const inbox = await get(TOKEN, '/api/mobile/inbox');
ck(inbox.status === 200, '② /inbox 200', `HTTP ${inbox.status}`);
const inT = inbox.body.todos || [];
ck(inT.filter((t) => t.todo_status === PEND_TXT).length === LIMIT, '② 待整改明细被截断到 ' + LIMIT, String(inT.filter((t) => t.todo_status === PEND_TXT).length));
ck(inT.filter((t) => t.todo_status === DONE_TXT).length === LIMIT, '② 已完成明细被截断到 ' + LIMIT, String(inT.filter((t) => t.todo_status === DONE_TXT).length));
ck(inbox.body.pending_count === N, '② pending_count 是全量真值 ' + N, String(inbox.body.pending_count));
ck(inbox.body.monthly_done_count === N, '② monthly_done_count 是全量真值 ' + N, String(inbox.body.monthly_done_count));
ck(inbox.body.done_more === true, '② done_more = true', String(inbox.body.done_more));

const disp = await get(TOKEN, '/api/mobile/dispatched?month=' + YM);
ck(disp.status === 200, '② /dispatched 200', `HTTP ${disp.status}`);
ck((disp.body.records || []).length === LIMIT, '② 未完成明细被截断到 ' + LIMIT, String((disp.body.records || []).length));
ck(disp.body.pending_count === N, '② pending_count 是全量真值 ' + N, String(disp.body.pending_count));
ck(disp.body.done_count === 0, '② done_count = 0（本月没有已完成的派发）', String(disp.body.done_count));

/* ---------- 3. 不变式：卡片数字 == 下钻真值总数（前端现在消费的就是这些字段） ---------- */
console.log('\n═══ 3. 不变式：卡片数字 == 下钻真值总数 ═══');
const parity = [
  ['本月上报', S.month_post, rec.body.total, 'summary.month_post ↔ patrol/records.total'],
  ['待整改', S.pending, inbox.body.pending_count, 'summary.pending ↔ inbox.pending_count'],
  ['已整改', S.rectified, inbox.body.monthly_done_count, 'summary.rectified ↔ inbox.monthly_done_count'],
  ['本月派发', S.month_dispatch, (disp.body.pending_count || 0) + (disp.body.done_count || 0), 'summary.month_dispatch ↔ dispatched.pending_count + done_count'],
];
parity.forEach(([name, card, drill, how]) => {
  ck(card === drill && card === N, '③ ' + name + '：卡上 ' + card + ' == 下钻真值 ' + drill, how);
});

/* ---------- 4. 护栏 ---------- */
console.log('\n═══ 4. 护栏 ═══');
ck(unmocked.length === 0, '④ 没有漏 mock 的飞书请求', unmocked.slice(0, 3).join(' | '));

console.log('\n══════════════════════════════');
console.log(bad ? `❌ ${bad} 项未通过` : `✅ 全部通过（${pass} 项）`);
process.exit(bad ? 1 : 0);
