/* CF-WPS-派发图 离线回归：被指派人能拿到「派发原图 file_token」并凭它取回原图
 *
 * 背景（用户反馈的真实 bug）：公司管理派发任务后，领到任务的账号点开任务，
 * 既看不到派发人拍的现场照片、也没有文字上下文 —— 不知要改什么。
 * 根因：后端 inbox 只下发 photo_count，前端从不渲染原图。
 *
 * 本测试用 mock 飞书端点把两条服务端路径钉死（零真实网络 / 零真实写库）：
 *   ① GET /api/mobile/inbox 的 todoView 必须回传 scene_photo_tokens / rectify_photo_tokens
 *      （有附件 → 抽出 file_token 数组；无附件 → 空数组，而非缺字段）
 *   ② GET /api/mobile/photo?ft=<token> 图片代理：
 *      - 无登录态 → 401
 *      - 缺 ft 参数 → 400
 *      - ft 在飞书不存在 → 404
 *      - ft 存在 → 200 + 原图二进制 + content-type 透传
 *
 * Run: node test/cfwps-photodispatch.test.mjs
 */
const workerMod = await import('../index.js');
const worker = workerMod.default;
const { pinyinInitials } = workerMod;

const SESSION_SECRET = 'mock-session-secret-photodispatch-0123456789';
const FS_APP_TOKEN = 'mock-fs-app-token-pd';
const LEDGER_TABLE_ID = 'tblMockLedgerPD';
const PATROL_TABLE_ID = 'tblMockPatrolPD';
const THIS_YM = (() => { const d = new Date(Date.now() + 8 * 3600 * 1000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); })();

const ME_NAME = '测试经理丙';
const ME_PHONE = '13900000880';
const PW = pinyinInitials(ME_NAME) + ME_PHONE.slice(-4);

const LEDGER_ROWS = [
  { record_id: 'L-me', fields: { 姓名: ME_NAME, 直接上级: '上级丙', 所属部门: '丙片区', 职位: '管理员', 网格长等级: '二级网格长', 手机号: ME_PHONE, 分级: '乡镇作业中心经理' } },
];

const todoFields = (o) => Object.assign({
  检查时间: `${THIS_YM}-01 08:00`, 是否三违: '是', 违章描述: '未戴安全帽', 违章人员: '张三',
  [ '整改接收人ID' ]: ME_PHONE, 整改接收人姓名: ME_NAME, 整改责任单位: '丙片区',
  指派人ID: '13900000899', 指派人姓名: '测试公司管理', 指派人单位: '安环管理部',
  整改状态: '待整改', 指派时间: `${THIS_YM}-10 09:30`,
}, o);

const PATROL_ROWS = [
  // 有派发原图 + 整改后原图
  { record_id: 'P-PHOTO', fields: todoFields({
    违章照片: [ { file_token: 'FT_SCENE_1' }, { file_token: 'FT_SCENE_2' } ],
    整改后照片: [ { file_token: 'FT_RECT_1' } ],
  }) },
  // 无任何附件（旧记录 / 未配图）→ 必须回空数组，不能缺字段
  { record_id: 'P-NOPHOTO', fields: todoFields({ 违章照片: [], 整改后照片: [] }) },
  // 附件列形状异常（非数组 / 缺 file_token）→ 容错为空
  { record_id: 'P-BADSHAPE', fields: todoFields({ 违章照片: 'not-an-array', 整改后照片: [ {} ] }) },
];

const FIELD_NAMES = ['整改接收人ID', '整改接收人姓名', '整改责任单位', '整改状态', '指派人ID', '指派人姓名', '指派人单位', '指派时间', '整改完成时间', '整改说明', '违章照片', '整改后照片'];

// 1x1 透明 PNG，用于模拟飞书原图二进制流
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('/auth/v3/tenant_access_token/internal')) {
    return new Response(JSON.stringify({ code: 0, tenant_access_token: 'mock-tenant-token', expire: 7200 }), { status: 200 });
  }
  if (u.includes('/drive/v1/medias/') && u.includes('/download')) {
    const m = u.match(/medias\/([^/]+)\/download/);
    const token = m && m[1];
    if (!token || token === 'FT_UNKNOWN') {
      return new Response(JSON.stringify({ code: 12521, msg: 'media not found' }), { status: 404 });
    }
    const buf = Buffer.from(PNG_B64, 'base64');
    return new Response(buf, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(buf.length) } });
  }
  if (u.includes(`/tables/${PATROL_TABLE_ID}/records/search`)) {
    const body = JSON.parse((init && init.body) || '{}');
    const cond = (body.filter && body.filter.conditions && body.filter.conditions[0]) || {};
    const want = String((cond.value || [])[0] || '');
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

console.log(`\n=== CF-WPS-派发图：inbox 派发图 token + /api/mobile/photo 代理 ===\n`);

/* ---- 登录拿会话 ---- */
const loginRes = await worker.fetch(new Request('https://worker.local/api/mobile/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.9' },
  body: JSON.stringify({ phone: ME_PHONE, password: PW }),
}), env);
const loginJson = await loginRes.json().catch(() => ({}));
assert(loginRes.status === 200 && !!loginJson.token, '前置：mock 台账账号登录成功', `HTTP ${loginRes.status}`);
const TOKEN = loginJson.token;

/* ---- ① inbox 下发派发图 token ---- */
const inboxRes = await worker.fetch(new Request('https://worker.local/api/mobile/inbox', {
  headers: { authorization: 'Bearer ' + TOKEN },
}), env);
const inbox = await inboxRes.json().catch(() => ({}));
assert(inboxRes.status === 200 && inbox.success === true, 'inbox 接口 200', `HTTP ${inboxRes.status}`);

const byId = (id) => (inbox.todos || []).find((t) => t.record_id === id) || {};

const photo = byId('P-PHOTO');
assert(Array.isArray(photo.scene_photo_tokens) && photo.scene_photo_tokens.length === 2, '① 有附件记录：scene_photo_tokens 抽出 2 个 file_token', JSON.stringify(photo.scene_photo_tokens));
assert(photo.scene_photo_tokens[0] === 'FT_SCENE_1' && photo.scene_photo_tokens[1] === 'FT_SCENE_2', '① token 顺序与值正确', JSON.stringify(photo.scene_photo_tokens));
assert(Array.isArray(photo.rectify_photo_tokens) && photo.rectify_photo_tokens.length === 1 && photo.rectify_photo_tokens[0] === 'FT_RECT_1', '① rectify_photo_tokens 抽出 1 个', JSON.stringify(photo.rectify_photo_tokens));

const nophoto = byId('P-NOPHOTO');
assert(Array.isArray(nophoto.scene_photo_tokens) && nophoto.scene_photo_tokens.length === 0, '① 无附件记录：scene_photo_tokens 为空数组（不缺字段）', JSON.stringify(nophoto.scene_photo_tokens));

const bad = byId('P-BADSHAPE');
assert(Array.isArray(bad.scene_photo_tokens) && bad.scene_photo_tokens.length === 0 && Array.isArray(bad.rectify_photo_tokens) && bad.rectify_photo_tokens.length === 0, '① 异常列形状容错：两张都为空数组', JSON.stringify([bad.scene_photo_tokens, bad.rectify_photo_tokens]));

/* ---- ② /api/mobile/photo 代理 ---- */
const photoUrl = (ft) => `https://worker.local/api/mobile/photo?ft=${encodeURIComponent(ft)}`;

const noAuth = await worker.fetch(new Request(photoUrl('FT_SCENE_1')), env);
assert(noAuth.status === 401, '② 无登录态取图 → 401', `HTTP ${noAuth.status}`);

const noFt = await worker.fetch(new Request('https://worker.local/api/mobile/photo', { headers: { authorization: 'Bearer ' + TOKEN } }), env);
assert(noFt.status === 400, '② 缺 ft 参数 → 400', `HTTP ${noFt.status}`);

const notFound = await worker.fetch(new Request(photoUrl('FT_UNKNOWN'), { headers: { authorization: 'Bearer ' + TOKEN } }), env);
assert(notFound.status === 404, '② ft 在飞书不存在 → 404', `HTTP ${notFound.status}`);

const good = await worker.fetch(new Request(photoUrl('FT_SCENE_1'), { headers: { authorization: 'Bearer ' + TOKEN } }), env);
assert(good.status === 200, '② ft 存在 → 200', `HTTP ${good.status}`);
const ct = good.headers.get('content-type') || '';
assert(ct === 'image/jpeg', '② content-type 透传为 image/jpeg', ct);
const buf = Buffer.from(await good.arrayBuffer());
assert(buf.length === Buffer.from(PNG_B64, 'base64').length, '② 原图二进制流完整返回', `len=${buf.length}`);

console.log(`\n===== RESULT: ${pass} PASS_MOCK, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
