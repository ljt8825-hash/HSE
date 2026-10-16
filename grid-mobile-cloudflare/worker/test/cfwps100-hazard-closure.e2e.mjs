// CF-WPS-100：隐患整改闭环回归测试。
// 背景（2026-10-16 用户确认的设计）：
//   · 指派对象 = 全公司账号任选（不按组织层级收敛）；
//   · 全部隐患都要安环管理部验收通过才闭环；打回回「待整改」并累加打回次数；
//   · 状态机：待整改 →（整改人提交）→ 待验收 →（安环部通过）→ 已闭环。
// 结构：
//   A 静态接线（前端四屏 + Worker 四接口 + 门禁 + 归属校验）
//   B 纯函数单测（直接 import worker 导出，不靠复制实现）
//   C 本地真链路 E2E（wrangler dev 8787；Server 不在时自动 SKIP，不误报）
//   D 收尾清理（E2E 造的记录一律删除，只动测试库 hazard 表）
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(path.join(root, 'frontend', 'check.html'), 'utf8');
const workerSrc = readFileSync(path.join(root, 'worker', 'index.js'), 'utf8');

let pass = 0, fail = 0, skip = 0;
const ck = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  => ' + JSON.stringify(extra ?? '')));
  cond ? pass++ : fail++;
};
const sk = (name, why) => { console.log('SKIP  ' + name + '  => ' + why); skip++; };

console.log('=== A. 静态接线 ===');
// ---- 前端四屏 + 关键函数 ----
for (const v of ['view-hazard-assign', 'view-hazard-todos', 'view-hazard-rectify', 'view-hazard-review']) {
  ck('check.html 有屏 ' + v, html.includes('id="' + v + '"'));
}
for (const fn of ['hazardClosureCardHtml', 'wireHazardDetailActions', 'hzDoReview',
  'openHazardAssign', 'searchHazardAssignable', 'submitHazardAssign',
  'openHazardRectify', 'pickHazardRectifyPhoto', 'submitHazardRectify',
  'renderHazardTodos', 'renderHazardReview', 'refreshMeHazardEntry', 'loadHazardTodos']) {
  ck('check.html 有函数 ' + fn, html.includes('function ' + fn + '('));
}
ck('「派给我的隐患」入口卡存在（我的页）', html.includes('id="btn-me-hazard-todo"'));
ck('指派页有候选人搜索框 + 期限输入', html.includes('id="hz-assign-q"') && html.includes('id="hz-assign-deadline"'));
ck('打回需填意见（textarea + 确认按钮）', html.includes('id="hz-reject-comment"') && html.includes('id="btn-hz-reject-ok"'));
ck('列表 scope 切换（我登记的 / 全部隐患）', html.includes('data-hscope="mine"') && html.includes('data-hscope="all"'));
ck('验收分段（待验收 / 已闭环）', html.includes('data-hseg="review"') && html.includes('data-hseg="closed"'));
ck('整改进展卡展示整改后照片（复用带登录态取图）',
  html.includes('id="hz-rectify-detail-photos"')
  && html.includes('renderHazardPhotos($("#hz-rectify-detail-photos"), x.rectifyPhotoTokens)'));
ck('整改后照片也带当日水印（CF-WPS-97 机制复用）',
  (html.match(/\}, photoWatermarkDate\(\)\);/g) || []).length === 2);

// ---- 前端门禁：待办两屏任何人都能进，指派/验收仍只归安环部 ----
ck('HAZARD_VIEWS 含 assign/review（安环部专属）',
  /const HAZARD_VIEWS = \[[^\]]*"hazard-assign"[^\]]*"hazard-review"/.test(html));
ck('HAZARD_TODO_VIEWS 不含 assign/review（指派人也能进）',
  /const HAZARD_TODO_VIEWS = \["hazard-todos", "hazard-rectify"\]/.test(html));

// ---- Worker 侧 ----
for (const h of ['handleHazardAssign', 'handleHazardAssignable', 'handleHazardTodos',
  'handleHazardRectify', 'handleHazardReview']) {
  ck('worker 有 handler ' + h, workerSrc.includes('async function ' + h + '('));
}
for (const r of ['/api/mobile/hazard/assign', '/api/mobile/hazard/assignable',
  '/api/mobile/hazard/todos', '/api/mobile/hazard/rectify', '/api/mobile/hazard/review']) {
  ck('worker 注册路由 ' + r, workerSrc.includes("p === '" + r + "'"));
}
ck('三个写路由进 PWD_GUARDED_ROUTES（初始密码不可写）',
  ["'/api/mobile/hazard/assign'", "'/api/mobile/hazard/rectify'", "'/api/mobile/hazard/review'"]
    .every((s) => workerSrc.includes(s)));
ck('assignable/todos 是读接口、不进写门禁',
  !workerSrc.includes("'/api/mobile/hazard/assignable', '/api/mobile/hazard/rectify'"));
ck('assign/review 走 hazardGate（服务端角色门，安环部专属）',
  /async function handleHazardAssign[\s\S]{0,900}const denied = hazardGate/.test(workerSrc)
  && /async function handleHazardReview[\s\S]{0,900}const denied = hazardGate/.test(workerSrc));
ck('rectify/todos 只校验登录态（整改人不限角色）',
  /async function handleHazardRectify[\s\S]{0,700}if \(!payload\) return errRes\('UNAUTHORIZED'/.test(workerSrc)
  && /async function handleHazardTodos[\s\S]{0,700}if \(!payload\) return errRes\('UNAUTHORIZED'/.test(workerSrc));
ck('指派校验整改人须是身份表账号（花名册没账号的人派了=死单）',
  workerSrc.includes('getIdentityRows(adapter, env, cfg.fileId, cfg.ledgerSheetId)')
  && workerSrc.includes('整改人不是有效账号，请从候选人列表选择'));
ck('指派拒公司管理账号当整改人（CF-WPS-58 口径）',
  /async function handleHazardAssign[\s\S]{0,4000}公司管理账号不能作为整改人/.test(workerSrc));
ck('指派状态守卫：待验收/已闭环不能改派',
  workerSrc.includes('整改已提交、正在等待验收，不能改派')
  && workerSrc.includes('该隐患已闭环，不能指派'));
ck('rectify 归属校验：只有整改人能提交',
  workerSrc.includes('只有整改人可以提交整改'));
ck('review 状态守卫：只有待验收能验收',
  workerSrc.includes('整改尚未提交') && workerSrc.includes('该隐患已闭环')
  && workerSrc.includes("'，不能验收'"));
ck('review 打回累加打回次数',
  workerSrc.includes('[HAZARD_FIELDS.rejectCount]: String(Math.min(item.rejectCount + 1, 99))'));
ck('review 通过写闭环时间',
  /action === 'pass'[\s\S]{0,500}closedAt\]: now/.test(workerSrc));
ck('mapHazardRecord 扩展闭环字段（rectifyPhotoTokens/overdue/rejectCount）',
  workerSrc.includes('rectifyPhotoTokens: hazardPhotoTokens(f, HAZARD_FIELDS.rectifyPhotos)')
  && workerSrc.includes('overdue: hazardOverdue(status, deadline)'));
ck('detail 归属放宽为三种人（登记人/整改人/安环部）',
  workerSrc.includes('item.finderId !== me && item.rectifierId !== me && !isHazardDept'));
ck('闭环列幂等补建（换 base / 手工删列不 1254045）',
  workerSrc.includes('async function ensureHazardRectFields'));
ck('指派成功后微信通知整改人（独立文案，不混网格巡查）',
  workerSrc.includes('async function notifyHazardAssign')
  && workerSrc.includes('收到一条隐患整改待办'));

console.log('\n=== B. 纯函数单测（import worker 真实导出） ===');
let mod = null;
try {
  mod = await import('../index.js');
} catch (e) {
  sk('worker 导出 import', e.message);
}
if (mod) {
  const { hazardDeadlineCheck, hazardStatusNorm, hazardOverdue, cnToday } = mod;
  // 期限校验
  ck('deadline 合法明天', hazardDeadlineCheck(cnToday().replace(/(\d{4})-(\d{2})-(\d{2})/, (m, y, mo, d) => {
    const t = new Date(Date.UTC(+y, +mo - 1, +d) + 86400000);
    return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0');
  })).ok === true);
  ck('deadline 今天合法（当天派当天改）', hazardDeadlineCheck(cnToday()).ok === true);
  ck('deadline 昨天被拒', hazardDeadlineCheck('2020-01-01').ok === false);
  ck('deadline 格式错被拒', hazardDeadlineCheck('2026-1-1').ok === false);
  ck('deadline 假日期被拒（2 月 30）', hazardDeadlineCheck('2026-02-30').ok === false);
  ck('deadline 超过一年被拒', hazardDeadlineCheck('2999-01-01').ok === false);
  // 状态归一（存量数据兼容）
  ck('存量空串按待整改', hazardStatusNorm('') === '待整改');
  ck('存量「整改中/已整改」按待整改', hazardStatusNorm('整改中') === '待整改' && hazardStatusNorm('已整改') === '待整改');
  ck('待验收/已闭环原样', hazardStatusNorm('待验收') === '待验收' && hazardStatusNorm('已闭环') === '已闭环');
  // 逾期派生
  ck('待整改 + 昨天期限 = 逾期', hazardOverdue('待整改', '2020-01-01') === true);
  ck('待整改 + 未来期限 = 不逾期', hazardOverdue('待整改', '2999-12-31') === false);
  ck('待验收即使过期也不算逾期（活已干完）', hazardOverdue('待验收', '2020-01-01') === false);
  ck('已闭环不算逾期', hazardOverdue('已闭环', '2020-01-01') === false);
  ck('cnToday 是 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(cnToday()));
}

console.log('\n=== C. 本地真链路 E2E（wrangler dev） ===');
const BASE = process.env.HAZARD_E2E_BASE || 'http://127.0.0.1:8787';
let live = false;
try {
  const r = await fetch(BASE + '/api/mobile/hazard/list', { method: 'GET' });
  live = r.status === 401;   // 路由存在（未登录 401）即视为本地 Worker 在线
} catch { /* 不在线 */ }
if (!live || !mod) {
  sk('E2E 全链路', !live ? '本地 Worker 不在线（' + BASE + '）' : 'worker 导出不可用');
} else {
  const { signJwtHs256 } = mod;
  // 测试账号（身份表实测：72 个账号；刘金涛=公司管理，马金华=管理员）
  const A_DEPT = '安环管理部';
  // ⚠️ 伪造 token 用的 secret 必须与本地 wrangler dev 的 WORKER_SESSION_SECRET 一致，
  //    否则验签失败全 401。secret 从 worker/.dev.vars 读（测试库专用）。
  let secret = process.env.HAZARD_E2E_SECRET || '';
  if (!secret && existsSync(path.join(root, 'worker', '.dev.vars'))) {
    const m = readFileSync(path.join(root, 'worker', '.dev.vars'), 'utf8')
      .split(/\r?\n/).find((l) => l.trim().startsWith('WORKER_SESSION_SECRET'));
    if (m) secret = m.slice(m.indexOf('=') + 1).trim().replace(/^"(.*)"$/, '$1');
  }
  const tok = async (sub, name, department, role) => signJwtHs256({
    iss: 'hse-worker-mobile', aud: 'hse-mobile-h5',
    sub, name, department, position: role === '公司管理' ? '公司管理' : '管理员',
    role, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    jti: crypto.randomUUID(), pwd: 1,
  }, secret);
  const api = async (m, p, body, t) => {
    const r = await fetch(BASE + p, {
      method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let j = null; try { j = await r.json(); } catch { /* 非 JSON */ }
    return { status: r.status, body: j };
  };
  const A = await tok('13385340822', '刘金涛', A_DEPT, '公司管理');        // 安环部
  const R = await tok('13774955144', '马金华', '宁城街道一班', '管理员');   // 整改人
  const X = await tok('13969270399', '张秋生', '津城街道一班', '管理员');   // 无关账号
  const C = await tok('15621259666', '张康', A_DEPT, '公司管理');          // 另一个公司管理

  const created = [];
  try {
    // 1) 安环部登记一条隐患
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const findTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const sub = await api('POST', '/api/mobile/hazard/submit', {
      category: '设备设施', level: '一般隐患',
      location: 'CF-WPS-100 自动化测试位', description: 'CF-WPS-100 闭环自动化测试（可删）',
      find_time: findTime, client_request_id: 'e2e100a' + Date.now().toString(36),
    }, A);
    ck('安环部登记隐患 200', sub.status === 200 && sub.body && sub.body.success, sub.body);
    const recId = (sub.body && sub.body.recordIds && sub.body.recordIds[0]) || '';
    ck('返回 recordId', !!recId, recId);
    if (recId) created.push(recId);

    // 2) 指派给马金华（明天到期）
    const tm = new Date(Date.now() + 86400000);
    const deadline = `${tm.getFullYear()}-${pad(tm.getMonth() + 1)}-${pad(tm.getDate())}`;
    const as = await api('POST', '/api/mobile/hazard/assign', {
      record_id: recId, assignee_id: '13774955144', deadline,
    }, A);
    ck('指派 200 且整改人马金华', as.status === 200 && as.body && as.body.item
      && as.body.item.rectifierName === '马金华' && as.body.item.deadline === deadline
      && as.body.item.status === '待整改', as.body && as.body.item);

    // 3) 整改人看到待办
    const td = await api('GET', '/api/mobile/hazard/todos', undefined, R);
    ck('整改人待办含本记录', td.status === 200 && (td.body.items || []).some((x) => x.recordId === recId),
      td.body && (td.body.items || []).length);

    // 4) 无关账号看不到
    const tdX = await api('GET', '/api/mobile/hazard/todos', undefined, X);
    ck('无关账号待办为空', tdX.status === 200 && (tdX.body.items || []).length === 0);

    // 5) 整改人提交 → 待验收
    const rf = await api('POST', '/api/mobile/hazard/rectify', { record_id: recId, note: '已更换护罩' }, R);
    ck('整改提交 → 待验收', rf.status === 200 && rf.body && rf.body.status === '待验收'
      && rf.body.item.rectifyNote === '已更换护罩', rf.body);

    // 6) 重复提交被拒（409）
    const rf2 = await api('POST', '/api/mobile/hazard/rectify', { record_id: recId }, R);
    ck('重复提交 409', rf2.status === 409, rf2.body && rf2.body.message);

    // 7) 安环部打回 → 待整改 + 打回次数 1
    const rj = await api('POST', '/api/mobile/hazard/review', { record_id: recId, action: 'reject', comment: '照片未拍到实处' }, A);
    ck('打回 → 待整改 + rejectCount=1', rj.status === 200 && rj.body && rj.body.item
      && rj.body.item.status === '待整改' && rj.body.item.rejectCount === 1
      && /打回/.test(rj.body.item.reviewResult || ''), rj.body && rj.body.item);

    // 8) 整改人重新提交 → 待验收
    const rf3 = await api('POST', '/api/mobile/hazard/rectify', { record_id: recId, note: '已补拍' }, R);
    ck('重新提交 → 待验收', rf3.status === 200 && rf3.body && rf3.body.status === '待验收');

    // 9) 安环部通过 → 已闭环
    const ps = await api('POST', '/api/mobile/hazard/review', { record_id: recId, action: 'pass', comment: '复核通过' }, A);
    ck('验收通过 → 已闭环 + 闭环时间', ps.status === 200 && ps.body && ps.body.item
      && ps.body.item.status === '已闭环' && !!ps.body.item.closedAt
      && ps.body.item.reviewResult === '通过：复核通过', ps.body && ps.body.item);

    // 10) 已闭环再验收被拒（409）
    const ps2 = await api('POST', '/api/mobile/hazard/review', { record_id: recId, action: 'pass' }, A);
    ck('重复验收 409', ps2.status === 409);

    // 11) 权限/参数负例
    ck('整改人不能指派（403）', (await api('POST', '/api/mobile/hazard/assign',
      { record_id: recId, assignee_id: '13774955144', deadline }, R)).status === 403);
    ck('整改人不能验收（403）', (await api('POST', '/api/mobile/hazard/review',
      { record_id: recId, action: 'pass' }, R)).status === 403);
    ck('无关账号不能提交整改（403）', (await api('POST', '/api/mobile/hazard/rectify',
      { record_id: recId }, X)).status === 403);
    ck('无关账号不能看详情（403）', (await api('GET', '/api/mobile/hazard/detail?id=' + recId, undefined, X)).status === 403);
    const rd = await api('GET', '/api/mobile/hazard/detail?id=' + recId, undefined, R);
    ck('整改人可以看详情（200）', rd.status === 200, rd.body && rd.body.message);
    ck('安环部可以看任何人详情（200）', (await api('GET', '/api/mobile/hazard/detail?id=' + recId, undefined, A)).status === 200);
    // 12) 指派负例要在**仍处于待整改**的记录上验（已闭环记录会先被状态守卫拦成 409，
    //     验证不到后面的参数/账号校验）→ 现开一条专门给负例用。
    const sub3 = await api('POST', '/api/mobile/hazard/submit', {
      category: '用电安全', level: '一般隐患', description: 'CF-WPS-100 指派负例（可删）',
      find_time: findTime, client_request_id: 'e2e100c' + Date.now().toString(36),
    }, A);
    const rec3 = (sub3.body && sub3.body.recordIds && sub3.body.recordIds[0]) || '';
    if (rec3) created.push(rec3);
    ck('截止昨天被拒（400）', (await api('POST', '/api/mobile/hazard/assign',
      { record_id: rec3, assignee_id: '13774955144', deadline: '2020-01-01' }, A)).status === 400);
    ck('期限格式错被拒（400）', (await api('POST', '/api/mobile/hazard/assign',
      { record_id: rec3, assignee_id: '13774955144', deadline: '明天' }, A)).status === 400);
    ck('花名册外手机号被拒（400）', (await api('POST', '/api/mobile/hazard/assign',
      { record_id: rec3, assignee_id: '19900000000', deadline }, A)).status === 400);
    ck('公司管理账号不能被派（403）', (await api('POST', '/api/mobile/hazard/assign',
      { record_id: rec3, assignee_id: '15621259666', deadline }, A)).status === 403);
    ck('已闭环记录不能再指派（409）', (await api('POST', '/api/mobile/hazard/assign',
      { record_id: recId, assignee_id: '13774955144', deadline }, A)).status === 409);

    // 12b) 待验收记录不能改派：现开一条 → 指派 → 整改人提交 → 再指派应 409
    const sub4 = await api('POST', '/api/mobile/hazard/submit', {
      category: '作业安全', level: '一般隐患', description: 'CF-WPS-100 待验收禁改派（可删）',
      find_time: findTime, client_request_id: 'e2e100d' + Date.now().toString(36),
    }, A);
    const rec4 = (sub4.body && sub4.body.recordIds && sub4.body.recordIds[0]) || '';
    if (rec4) created.push(rec4);
    await api('POST', '/api/mobile/hazard/assign', { record_id: rec4, assignee_id: '13774955144', deadline }, A);
    await api('POST', '/api/mobile/hazard/rectify', { record_id: rec4 }, R);
    ck('待验收记录不能改派（409）', (await api('POST', '/api/mobile/hazard/assign',
      { record_id: rec4, assignee_id: '13969270399', deadline }, A)).status === 409);

    // 13) 改派链路：新建一条 → 指派马金华 → 改派张秋生，确认整改人切换
    const sub2 = await api('POST', '/api/mobile/hazard/submit', {
      category: '消防安全', level: '重大隐患', description: 'CF-WPS-100 改派测试（可删）',
      find_time: findTime, client_request_id: 'e2e100b' + Date.now().toString(36),
    }, A);
    const rec2 = (sub2.body && sub2.body.recordIds && sub2.body.recordIds[0]) || '';
    if (rec2) created.push(rec2);
    const as2 = await api('POST', '/api/mobile/hazard/assign', { record_id: rec2, assignee_id: '13774955144', deadline }, A);
    ck('第二次指派成功', as2.status === 200);
    const as3 = await api('POST', '/api/mobile/hazard/assign', { record_id: rec2, assignee_id: '13969270399', deadline }, C);
    ck('改派给张秋生（另一安环部账号也可指派）', as3.status === 200 && as3.body && as3.body.item
      && as3.body.item.rectifierId === '13969270399', as3.body && as3.body.item);
    const td2 = await api('GET', '/api/mobile/hazard/todos', undefined, X);
    ck('改派后新整改人看到待办', td2.status === 200 && (td2.body.items || []).some((x) => x.recordId === rec2));
    const td3 = await api('GET', '/api/mobile/hazard/todos', undefined, R);
    ck('改派后旧整改人不再看到', !(td3.body.items || []).some((x) => x.recordId === rec2));

    // 13) scope=all 含两条测试记录
    const all = await api('GET', '/api/mobile/hazard/list?scope=all', undefined, A);
    ck('scope=all 含测试记录', all.status === 200 && (all.body.items || []).length >= 2);
  } finally {
    // 收尾：删除 E2E 造的所有 hazard 记录（测试库专用，绝不动生产）
    if (created.length && existsSync(path.join(root, 'worker', '.dev.vars'))) {
      try {
        const { getAdapter } = await import('../storage/index.js');
        const devTxt = readFileSync(path.join(root, 'worker', '.dev.vars'), 'utf8');
        const cfgTxt = Object.fromEntries(devTxt.split(/\r?\n/)
          .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
          .map((l) => {
            const i = l.indexOf('=');
            let v = l.slice(i + 1).trim().replace(/\s*#.*$/, '').trim().replace(/^"(.*)"$/, '$1');
            return [l.slice(0, i).trim(), v];
          }));
        const env = { ...cfgTxt, HTTPS_PROXY: 'http://127.0.0.1:7890', NO_PROXY: '127.0.0.1,localhost' };
        const adapter = getAdapter(env);
        const { storageConfig } = await import('../storage/index.js');
        const cfg = await storageConfig(env);
        await adapter.batchDelete(env, cfg.fileId, cfg.hazardSheetId, created);
        console.log('CLEAN  删除 E2E 记录 ' + created.length + ' 条');
      } catch (e) {
        console.log('WARN  清理失败（请手工删）：' + created.join(',') + ' :: ' + e.message);
      }
    }
  }
}

console.log('\n===== ' + pass + ' passed, ' + fail + ' failed, ' + skip + ' skipped =====');
process.exit(fail ? 1 : 0);
