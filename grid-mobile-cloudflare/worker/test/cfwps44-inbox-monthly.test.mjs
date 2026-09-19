/* CF-WPS-44 OFFLINE mock 测试：/api/mobile/inbox 的「待整改 / 本月已整改」两个计数口径
 *
 * 为什么单写：
 *   前端 E2E 打的是**尚未升级的生产 Worker**（还没有 monthly_done_count 字段），
 *   所以「服务端按自然月统计」这条真实路径在浏览器里跑不到。本文件用 mock 飞书端点
 *   把服务端口径钉死，两条通道互补。
 *
 * 业务口径（用户诉求）：
 *   · 待整改 = 指派给我且**未完成** —— 不按月过滤，跨月继续显示，直到整改完成为止；
 *   · 已整改 = 指派给我且**完成时间落在本自然月**（首页「已整改」卡片取值来源）。
 *
 * 覆盖：
 *   ① 跨月（上月指派、至今未完成）→ 仍计入 pending_count（跨月不清零）
 *   ② 本月未完成 → 计入 pending_count
 *   ③ 本月完成 → 计入 monthly_done_count，且不再计入 pending_count
 *   ④ 上月完成 → 既不计 pending_count，也不计 monthly_done_count（本月口径）
 *   ⑤ 完成时间为空的老记录 → 不计 monthly_done_count（无完成时间即无法归属月份，如实不猜）
 *   ⑥ 指派给别人的记录 → 不计入（口径完全依赖服务端 search 过滤，本测试同步验证过滤真的生效）
 *   ⑦ todos 列表 pending 在前、已完成在后
 *
 * GUARDS: global fetch 全量 mock（未 mock 的 URL 直接抛错，保证零真实网络/零真实写库）
 * Run: node test/cfwps44-inbox-monthly.test.mjs
 */
const workerMod = await import('../index.js');
const worker = workerMod.default;
const { pinyinInitials } = workerMod;

const SESSION_SECRET = 'mock-session-secret-cfwps44-0123456789';
const FS_APP_TOKEN = 'mock-fs-app-token-44';
const LEDGER_TABLE_ID = 'tblMockLedger44';
const PATROL_TABLE_ID = 'tblMockPatrol44';

/* ---- 以「东八区当前时刻」为基准构造月份，避免测试写死月份后到下月失效 ---- */
const cnNow = () => new Date(Date.now() + 8 * 3600 * 1000);
const ymOf = (d) => d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
const THIS_YM = ymOf(cnNow());
const PREV_YM = (() => { const d = cnNow(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return ymOf(d); })();
const THIS_DONE_AT = `${THIS_YM}-05 10:00`;
const PREV_DONE_AT = `${PREV_YM}-20 10:00`;
const PREV_ASSIGN_AT = `${PREV_YM}-01 09:00`;

const ME_NAME = '测试经理甲';
const ME_PHONE = '13900000440';
const OTHER_PHONE = '13900000441';
const PW = pinyinInitials(ME_NAME) + ME_PHONE.slice(-4);

const LEDGER_ROWS = [
  { record_id: 'L-me', fields: { 姓名: ME_NAME, 直接上级: '上级甲', 所属部门: '甲片区', 职位: '管理员', 网格长等级: '二级网格长', 手机号: ME_PHONE, 分级: '乡镇作业中心经理' } },
  { record_id: 'L-other', fields: { 姓名: '测试管理员乙', 直接上级: ME_NAME, 所属部门: '甲片区', 职位: '管理员', 网格长等级: '三级网格长', 手机号: OTHER_PHONE, 分级: '管理员' } },
];

/* ---- 主台账 mock 记录：所有场景一次铺开，用断言逐条钉口径 ---- */
const todoFields = (o) => Object.assign({
  检查时间: `${THIS_YM}-01 08:00`, 是否三违: '是', 违章描述: '未戴安全帽', 违章人员: '张三',
  [ '整改接收人ID' ]: ME_PHONE, 整改接收人姓名: ME_NAME, 整改责任单位: '甲片区',
  指派人ID: '13900000499', 指派人姓名: '测试公司管理', 指派人单位: '安环管理部',
}, o);
const PATROL_ROWS = [
  // ① 上月指派、至今未完成 → 跨月仍算「待整改」
  { record_id: 'P-CROSS', fields: todoFields({ 整改状态: '待整改', 指派时间: PREV_ASSIGN_AT }) },
  // ② 本月指派、未完成 → 待整改
  { record_id: 'P-PENDING', fields: todoFields({ 整改状态: '待整改', 指派时间: `${THIS_YM}-10 09:30` }) },
  // ③ 本月完成 → 本月已整改 1
  { record_id: 'P-DONE-THIS', fields: todoFields({ 整改状态: '已完成', 指派时间: `${THIS_YM}-02 09:00`, 整改完成时间: THIS_DONE_AT }) },
  // ④ 上月完成 → 不计本月已整改（也不算 pending）
  { record_id: 'P-DONE-PREV', fields: todoFields({ 整改状态: '已完成', 指派时间: PREV_ASSIGN_AT, 整改完成时间: PREV_DONE_AT }) },
  // ⑤ 已完成但完成时间为空（TODO_FIELDS 列上线前的老记录）→ 不猜月份，不计本月已整改
  { record_id: 'P-DONE-NODATE', fields: todoFields({ 整改状态: '已完成', 指派时间: PREV_ASSIGN_AT }) },
  // ⑥ 指派给别人的记录 → 一条都不该进我的统计
  { record_id: 'P-OTHERS', fields: todoFields({ 整改接收人ID: OTHER_PHONE, 整改接收人姓名: '测试管理员乙', 整改状态: '待整改', 指派时间: `${THIS_YM}-11 09:30` }) },
];

const FIELD_NAMES = ['整改接收人ID', '整改接收人姓名', '整改责任单位', '整改状态', '指派人ID', '指派人姓名', '指派人单位', '指派时间', '整改完成时间', '整改说明'];

let searchCalls = 0;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('/auth/v3/tenant_access_token/internal')) {
    return new Response(JSON.stringify({ code: 0, tenant_access_token: 'mock-tenant-token', expire: 7200 }), { status: 200 });
  }
  // 搜索必须排在通用 records 之前（路径含 /records/search）
  if (u.includes(`/tables/${PATROL_TABLE_ID}/records/search`)) {
    searchCalls++;
    const body = JSON.parse((init && init.body) || '{}');
    const cond = (body.filter && body.filter.conditions && body.filter.conditions[0]) || {};
    const want = String((cond.value || [])[0] || '');
    // 模拟飞书服务端过滤：只回「该列等于该值」的记录（前端/Worker 依赖这个前提，测试一并验证）
    const items = PATROL_ROWS.filter((r) => !want || String(r.fields[cond.field_name]) === want);
    return new Response(JSON.stringify({ code: 0, data: { items, has_more: false } }), { status: 200 });
  }
  if (u.includes(`/tables/${PATROL_TABLE_ID}/fields`)) {
    return new Response(JSON.stringify({ code: 0, data: { items: FIELD_NAMES.map((n) => ({ field_name: n, type: 1 })), has_more: false } }), { status: 200 });
  }
  if (u.includes(`/tables/${LEDGER_TABLE_ID}/records`)) {
    return new Response(JSON.stringify({ code: 0, data: { items: LEDGER_ROWS, has_more: false } }), { status: 200 });
  }
  if (/\/bitable\/v1\/apps\/[^/]+\/tables(\?|$)/.test(u)) {
    return new Response(JSON.stringify({ code: 0, data: { items: [
      { table_id: LEDGER_TABLE_ID, name: 'H5移动端身份表' },
      { table_id: PATROL_TABLE_ID, name: 'H5员工日常不安全行为台账' },
    ], has_more: false } }), { status: 200 });
  }
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

console.log(`\n=== CF-WPS-44 inbox 口径（本月=${THIS_YM}，上月=${PREV_YM}）===\n`);

/* ---- 登录拿会话（走真实登录接口，顺带验证 mock 台账可登录） ---- */
const loginRes = await worker.fetch(new Request('https://worker.local/api/mobile/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.9' },
  body: JSON.stringify({ phone: ME_PHONE, password: PW }),
}), env);
const loginJson = await loginRes.json().catch(() => ({}));
assert(loginRes.status === 200 && !!loginJson.token, '前置：mock 台账账号登录成功', `HTTP ${loginRes.status}`);
assert(String(loginJson.employee && loginJson.employee.role) === '经理', '前置：角色解析为「经理」（首页显示已整改的两级之一）', JSON.stringify(loginJson.employee && loginJson.employee.role));

const inboxRes = await worker.fetch(new Request('https://worker.local/api/mobile/inbox', {
  headers: { authorization: 'Bearer ' + loginJson.token },
}), env);
const inbox = await inboxRes.json().catch(() => ({}));

assert(inboxRes.status === 200 && inbox.success === true, 'inbox 接口 200', `HTTP ${inboxRes.status}`);

/* ---- ① ② ④ ⑤ ⑥ 待整改口径 ---- */
assert(inbox.pending_count === 2, '①② 待整改 = 2（跨月未完成 + 本月未完成）', `实际=${inbox.pending_count}`);
const pendIds = (inbox.todos || []).filter((t) => t.status === '待整改').map((t) => t.record_id);
assert(pendIds.includes('P-CROSS'), '① 上月指派的未完成记录**仍在**待整改（跨月不清零）', pendIds.join(','));
assert(!pendIds.includes('P-DONE-PREV') && !pendIds.includes('P-DONE-THIS'), '④ 已完成的不占「待整改」', pendIds.join(','));
assert(!(inbox.todos || []).some((t) => t.record_id === 'P-OTHERS'), '⑥ 指派给别人的记录不出现在我的待办（服务端 search 过滤生效）', `searchCalls=${searchCalls}`);

/* ---- ③ ④ ⑤ 已整改口径 ---- */
assert(inbox.monthly_done_count === 1, '③ 本月已整改 = 1（仅本月完成那条）', `实际=${inbox.monthly_done_count}`);
assert(inbox.monthly_done_count !== 5, '④⑤ 上月完成的 / 完成时间为空的老记录**不计**本月已整改');
assert(inbox.total === 5, '⑥ 我的记录总数 = 5（6 条 mock 中排除指派给别人的 1 条）', `实际=${inbox.total}`);

/* ---- ⑦ 列表排序：pending 在前 ---- */
const firstDone = (inbox.todos || []).findIndex((t) => t.status === '已完成');
const lastPending = (inbox.todos || []).map((t) => t.status).lastIndexOf('待整改');
assert(firstDone === -1 || lastPending === -1 || lastPending < firstDone, '⑦ todos 列表：待整改在前、已完成在后', `lastPending=${lastPending} firstDone=${firstDone}`);

/* ---- 落地字段：前端 todoToRec 依赖 done_at / todo_status ---- */
const cross = (inbox.todos || []).find((t) => t.record_id === 'P-CROSS') || {};
assert(cross.done_at === '' && cross.assigned_at === PREV_ASSIGN_AT, '跨月记录回传 assigned_at / 空的 done_at（前端按此渲染「来自 XXX」）', `${cross.assigned_at} / done_at='${cross.done_at}'`);
const doneThis = (inbox.todos || []).find((t) => t.record_id === 'P-DONE-THIS') || {};
assert(doneThis.done_at === THIS_DONE_AT, '本月完成记录回传 done_at（口径与 monthly_done_count 同源）', doneThis.done_at);

console.log(`\n===== RESULT: ${pass} PASS_MOCK, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
