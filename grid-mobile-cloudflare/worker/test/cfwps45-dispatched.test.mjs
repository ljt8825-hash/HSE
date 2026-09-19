/* CF-WPS-45 OFFLINE mock 测试：GET /api/mobile/dispatched 的口径
 *
 * 需求（2026-09-19 用户原话）：「增加：派发的记录」→ 底部导航新增一页，
 *   口径 = **只列我派出去、对方还没整改完的**（跨月一直显示，直到整改完成）。
 *
 * 与 /api/mobile/inbox 互为镜像，这里钉死「派发方视角」的四条边界：
 *   ① 跨月（上月指派、至今未整改）→ **仍在列表**（本需求核心，不按自然月过滤）
 *   ② 已整改完成的（本月完成 / 上月完成都一样）→ **不在列表**，只进 done_count
 *   ③ 别人派的记录 → 一条都不进我的列表（口径完全依赖服务端按「指派人ID」过滤）
 *   ④ 从未派发过的记录（指派人ID 为空）→ 不进列表
 *   ⑤ 列表按「指派时间」倒序（刚派完的排最前，便于确认派发成功）
 *   ⑥ 前端渲染依赖的字段确实随响应下发（assignee_name / todo_status / assigned_at …）
 *   ⑦ 未带会话 → 401（不泄露任何记录）
 *
 * 数据来源：cfwps45-dispatch-fixture.mjs（与浏览器 E2E **同一份**，钉死前后端接缝）
 * GUARDS: 该夹具模块内 global fetch 全量 mock，未 mock 的 URL 直接抛错。
 * Run: node test/cfwps45-dispatched.test.mjs
 */
import {
  installMockFetch, login, env, buildDispatched, searchCalls,
  ME_PHONE, ME_NAME, ME_PW, SUB_NAME, BOSS_NAME,
  PREV_ASSIGN_AT, THIS_ASSIGN_AT, THIS_YM, PREV_YM,
} from './cfwps45-dispatch-fixture.mjs';

let pass = 0, failn = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_MOCK ${n}${x ? ' :: ' + x : ''}`); };
const fail = (n, d) => { failn++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : fail(n, d || 'assertion false'));

console.log(`\n=== CF-WPS-45 派发记录口径（本月=${THIS_YM}，上月=${PREV_YM}）===\n`);

installMockFetch();

/* ---- 前置：真实登录接口 ---- */
const lg = await login();
assert(lg.status === 200 && !!lg.body.token, '前置：mock 台账账号登录成功', `HTTP ${lg.status}`);
assert(String(lg.body.employee && lg.body.employee.role) === '经理', '前置：角色解析为「经理」', JSON.stringify(lg.body.employee && lg.body.employee.role));
assert(lg.body.employee && lg.body.employee.name === ME_NAME, '前置：登录人名 = 夹具经理名', String(lg.body.employee && lg.body.employee.name));

/* ---- 主调用 ---- */
const { status, body } = await buildDispatched(lg.body.token);
assert(status === 200 && body.success === true, '接口 200 且 success', `HTTP ${status}`);

const recs = body.records || [];
const ids = recs.map((r) => r.record_id);

/* ---- ③ search 必须按「指派人ID」过滤（口径的物理基础） ---- */
assert(searchCalls.fields.includes('指派人ID'), '③ 服务端按「指派人ID」检索（不是接收人ID）', searchCalls.fields.join(','));

/* ---- ① 跨月不清零（本需求核心） ---- */
assert(ids.includes('D-CROSS'), '① 上月派出去、至今未整改 → 仍在列表（跨月不清零）', ids.join(','));
assert(body.pending_count === 2, '①② 未整改完成 = 2（跨月 1 + 本月 1）', `实际=${body.pending_count}`);

/* ---- ② 已完成的不占列表 ---- */
assert(!ids.includes('D-DONE-THIS'), '② 本月已整改完成 → 不在列表', ids.join(','));
assert(!ids.includes('D-DONE-PREV'), '② 上月已整改完成 → 同样不在列表（口径是「未完成」而非「本月完成」）', ids.join(','));
assert(body.done_count === 2, '② done_count = 2（两条已完成的只报数、不占列表）', `实际=${body.done_count}`);

/* ---- ③④ 不属于我的派发 ---- */
assert(!ids.includes('D-OTHERS'), '③ 别人派的记录不进我的列表', `searchCalls=${searchCalls.n}`);
assert(!ids.includes('D-NOASSIGN'), '④ 从未派发过（指派人ID 空）的记录不进列表', ids.join(','));
assert(body.total === 4, '③④ 我派出去的总数 = 4（6 条 mock 中排除别人派的 1 + 未派发的 1）', `实际=${body.total}`);

/* ---- ⑤ 排序：指派时间倒序 ---- */
assert(recs.length === 2 && recs[0].record_id === 'D-THIS' && recs[1].record_id === 'D-CROSS',
  '⑤ 列表按指派时间倒序（刚派完的排最前）', ids.join(','));

/* ---- ⑥ 前端渲染所需字段确实下发 ---- */
const cross = recs.find((r) => r.record_id === 'D-CROSS') || {};
assert(cross.assignee_name === SUB_NAME, '⑥ 下发 assignee_name（派给了谁）', String(cross.assignee_name));
assert(cross.todo_status === '待整改', '⑥ 下发 todo_status（当前状态）', String(cross.todo_status));
assert(cross.assigned_at === PREV_ASSIGN_AT, '⑥ 下发 assigned_at（派发时间，跨月记录为本月之前）', String(cross.assigned_at));
assert(cross.assigner_name === ME_NAME, '⑥ 下发 assigner_name（派发人=本人）', String(cross.assigner_name));
assert(!!cross.town, '⑥ 下发 town（整改责任单位）', String(cross.town));
const thisOne = recs.find((r) => r.record_id === 'D-THIS') || {};
assert(thisOne.assigned_at === THIS_ASSIGN_AT, '⑥ 本月记录指派时间正确（与排序断言同源）', String(thisOne.assigned_at));
assert(!!(thisOne.violation_desc || thisOne.description), '⑥ 下发违规/问题描述（卡片标题来源）', String(thisOne.violation_desc || thisOne.description));
assert(!!thisOne.violation_people, '⑥ 下发 violation_people（涉及人员）', String(thisOne.violation_people));
assert(body.me && body.me.id === ME_PHONE, '⑥ 回传 me.id（前端据此确认身份）', String(body.me && body.me.id));

/* ---- ⑦ 未认证 ---- */
const anon = await buildDispatched('');
assert(anon.status === 401, '⑦ 无会话 → 401（不泄露记录）', `HTTP ${anon.status}`);
assert(!Array.isArray(anon.body.records), '⑦ 401 响应体不含 records', JSON.stringify(anon.body).slice(0, 80));

console.log(`\n===== RESULT: ${pass} PASS_MOCK, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
