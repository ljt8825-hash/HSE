/* CF-WPS-45 共享夹具：在离线 mock 飞书端点下跑出 /api/mobile/dispatched 的**真实响应 JSON**。
 *
 * 为什么要有这个文件（而不在各测试里各写一份 mock）：
 *   「派发记录」有两半 —— 后端过滤口径、前端渲染接缝。若后端单测自己造一份 JSON、
 *   前端 E2E 再自己造一份，两边字段名对不上时**两个测试都会绿**，线上却空白。
 *   所以夹具统一由**后端真实处理器产出**：单测直接断言它，E2E 把它塞进浏览器路由。
 *   一份数据贯穿两侧 ⇒ 字段名/口径任一侧改了，另一侧立刻红。
 *
 * GUARDS：globalThis.fetch 全量 mock，未 mock 的 URL 直接抛错 ⇒ 零真实网络、零真实写库。
 * 数据全为合成号（1390000045x），不含任何真实手机号 / 身份证。
 *
 * 口径（2026-09-19 用户定）：只列「我派出去、对方还没整改完」的，**不按自然月过滤** ——
 *   上月派的今天没整改完，这个月继续挂在列表里，直到整改完成才消失。
 */
const workerMod = await import('../index.js');
const worker = workerMod.default;
const { pinyinInitials } = workerMod;

export const SESSION_SECRET = 'mock-session-secret-cfwps45-0123456789';
export const LEDGER_TABLE_ID = 'tblMockLedger45';
export const PATROL_TABLE_ID = 'tblMockPatrol45';

/* 以「东八区当前时刻」为基准构造月份，避免写死月份后到下月失效 */
const cnNow = () => new Date(Date.now() + 8 * 3600 * 1000);
const ymOf = (d) => d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
export const THIS_YM = ymOf(cnNow());
export const PREV_YM = (() => { const d = cnNow(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return ymOf(d); })();

export const ME_NAME = '测试经理丙';
export const ME_PHONE = '13900000450';
export const SUB_NAME = '测试网格员丁';
export const SUB_PHONE = '13900000451';
export const BOSS_NAME = '测试公司管理戊';
export const BOSS_PHONE = '13900000452';

export const ME_PW = pinyinInitials(ME_NAME) + ME_PHONE.slice(-4);

export const PREV_ASSIGN_AT = `${PREV_YM}-01 09:00`;
export const THIS_ASSIGN_AT = `${THIS_YM}-10 09:30`;

const LEDGER_ROWS = [
  { record_id: 'L-me', fields: { 姓名: ME_NAME, 直接上级: '上级丙', 所属部门: '甲片区', 职位: '经理', 网格长等级: '二级网格长', 手机号: ME_PHONE, 分级: '乡镇作业中心经理' } },
  { record_id: 'L-sub', fields: { 姓名: SUB_NAME, 直接上级: ME_NAME, 所属部门: '甲片区', 职位: '管理员', 网格长等级: '三级网格长', 手机号: SUB_PHONE, 分级: '管理员' } },
  { record_id: 'L-boss', fields: { 姓名: BOSS_NAME, 直接上级: '—', 所属部门: '安环管理部', 职位: '经理', 网格长等级: '一级网格长', 手机号: BOSS_PHONE, 分级: '公司管理' } },
];

/* 主台账 mock：所有场景一次铺开，用断言逐条钉口径。
   ⚠️ 必须是 { record_id, fields } 包装 —— 适配器按 item.fields[列名] 取值，
      写成扁平对象时 search 过滤会读到 undefined（表现为接口 502，极难定位）。 */
const row = (id, o) => ({
  record_id: id,
  fields: Object.assign({
    '片区|班组': '甲片区', 违章行为: '未戴安全帽', 违章人员姓名: '张三', 描述: '',
    日期: Date.now(),
  }, o),
});

export const PATROL_ROWS = [
  // ① 上月派出去、至今未整改 → **仍要在列表里**（跨月不清零，本需求的核心）
  row('D-CROSS', { 整改接收人ID: SUB_PHONE, 整改接收人姓名: SUB_NAME, 整改责任单位: '甲片区',
    整改状态: '待整改', 指派人ID: ME_PHONE, 指派人姓名: ME_NAME, 指派人单位: '甲片区', 指派时间: PREV_ASSIGN_AT, 整改完成时间: '' }),
  // ② 本月派出去、未整改 → 在列表里
  row('D-THIS', { 整改接收人ID: SUB_PHONE, 整改接收人姓名: SUB_NAME, 整改责任单位: '甲片区',
    整改状态: '待整改', 指派人ID: ME_PHONE, 指派人姓名: ME_NAME, 指派人单位: '甲片区', 指派时间: THIS_ASSIGN_AT, 整改完成时间: '' }),
  // ③ 我派的、本月已整改完成 → 不在列表（只计入 done_count）
  row('D-DONE-THIS', { 整改接收人ID: SUB_PHONE, 整改接收人姓名: SUB_NAME, 整改责任单位: '甲片区',
    整改状态: '已完成', 指派人ID: ME_PHONE, 指派人姓名: ME_NAME, 指派人单位: '甲片区', 指派时间: `${THIS_YM}-02 09:00`, 整改完成时间: `${THIS_YM}-05 10:00` }),
  // ④ 我派的、**上月**已整改完成 → 同样不在列表（口径是「未完成」而非「本月完成」）
  row('D-DONE-PREV', { 整改接收人ID: SUB_PHONE, 整改接收人姓名: SUB_NAME, 整改责任单位: '甲片区',
    整改状态: '已完成', 指派人ID: ME_PHONE, 指派人姓名: ME_NAME, 指派人单位: '甲片区', 指派时间: PREV_ASSIGN_AT, 整改完成时间: `${PREV_YM}-20 10:00` }),
  // ⑤ 别人派的（指派人不是我）→ 一条都不该出现
  row('D-OTHERS', { 整改接收人ID: SUB_PHONE, 整改接收人姓名: SUB_NAME, 整改责任单位: '乙片区',
    整改状态: '待整改', 指派人ID: BOSS_PHONE, 指派人姓名: BOSS_NAME, 指派人单位: '安环管理部', 指派时间: THIS_ASSIGN_AT, 整改完成时间: '' }),
  // ⑥ 从未派发过的记录（指派人ID 空）→ 不该出现
  row('D-NOASSIGN', { 整改状态: '', 指派人ID: '', 指派时间: '' }),
];

const FIELD_NAMES = ['整改接收人ID', '整改接收人姓名', '整改责任单位', '整改状态', '指派人ID', '指派人姓名', '指派人单位', '指派时间', '整改完成时间', '整改说明'];

export const searchCalls = { n: 0, fields: [] };

export function installMockFetch() {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/auth/v3/tenant_access_token/internal')) {
      return new Response(JSON.stringify({ code: 0, tenant_access_token: 'mock-tenant-token-45', expire: 7200 }), { status: 200 });
    }
    // 搜索必须排在通用 records 之前（路径含 /records/search）
    if (u.includes(`/tables/${PATROL_TABLE_ID}/records/search`)) {
      searchCalls.n++;
      const body = JSON.parse((init && init.body) || '{}');
      const cond = (body.filter && body.filter.conditions && body.filter.conditions[0]) || {};
      const want = String((cond.value || [])[0] || '');
      searchCalls.fields.push(String(cond.field_name || ''));
      // 模拟飞书服务端过滤：只回「该列等于该值」的记录（Worker 依赖这个前提，测试一并验证）
      const items = PATROL_ROWS.filter((r) => !want || String(r.fields[cond.field_name]) === want);
      return new Response(JSON.stringify({ code: 0, data: { items, has_more: false } }), { status: 200 });
    }
    if (u.includes(`/tables/${PATROL_TABLE_ID}/fields`)) {
      return new Response(JSON.stringify({ code: 0, data: { items: FIELD_NAMES.map((n) => ({ field_name: n, type: 1 })), has_more: false } }), { status: 200 });
    }
    // 全表扫描分支（search 抛异常时的兜底路径）—— 必须排在 /records/search 之后
    if (u.includes(`/tables/${PATROL_TABLE_ID}/records`)) {
      return new Response(JSON.stringify({ code: 0, data: { items: PATROL_ROWS, has_more: false } }), { status: 200 });
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
}

export const env = {
  STORAGE_BACKEND: 'feishu',
  FS_APP_TOKEN: 'mock-fs-app-token-45', FS_APP_ID: 'mock-app-id', FS_APP_SECRET: 'mock-app-secret',
  FS_IDENTITY_TABLE_ID: LEDGER_TABLE_ID,
  FS_LEDGER_TABLE_ID: LEDGER_TABLE_ID,
  FS_PATROL_PRODUCTION_TABLE_ID: PATROL_TABLE_ID,
  MOBILE_LOGIN_ENABLED: 'true',
  WORKER_SESSION_SECRET: SESSION_SECRET,
  MOBILE_SESSION_TTL_SECONDS: '7200',
  ROSTER_CACHE_TTL_MS: '0',
};

/* 走真实登录接口拿 Bearer token（顺带验证 mock 台账账号可登录、角色解析正确） */
export async function login() {
  const res = await worker.fetch(new Request('https://worker.local/api/mobile/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.11' },
    body: JSON.stringify({ phone: ME_PHONE, password: ME_PW }),
  }), env);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/* 跑一次真实处理器，返回 { status, body } —— 这就是前端会拿到的那份 JSON */
export async function buildDispatched(token) {
  const res = await worker.fetch(new Request('https://worker.local/api/mobile/dispatched', {
    headers: { authorization: 'Bearer ' + token },
  }), env);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

export async function buildDispatchedAfterLogin() {
  installMockFetch();
  const lg = await login();
  if (!lg.body || !lg.body.token) return { status: lg.status, body: lg.body, token: '' };
  const out = await buildDispatched(lg.body.token);
  return { ...out, token: lg.body.token, role: lg.body.employee && lg.body.employee.role };
}
