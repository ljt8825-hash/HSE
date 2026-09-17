/* cfwps19-realtest.mjs —— CF-WPS-19 真实数据联通验证（只读，不写任何表）
 * 目的：用 Worker 真实代码路径直读 飞书多维表格「花名册」表，
 *       证明「选人花名册」拿到的确实是 1291 名真实员工，且班组口径（所属部门）可命中。
 * 用法（worker 目录）：
 *   FS_APP_ID=... FS_APP_SECRET=... FS_APP_TOKEN=... FS_ROSTER_TABLE_ID=... \
 *   node test/cfwps19-realtest.mjs
 * GUARDS：只调用 scanRecords / handleRoster（GET 语义），无 create/batch_delete。
 */
const workerMod = await import('../index.js');
const { handleRoster, signJwtHs256 } = workerMod;

const SESSION_SECRET = 'realtest-session-secret-' + 'x'.repeat(20);

const env = {
  STORAGE_BACKEND: 'feishu',
  FS_APP_ID: process.env.FS_APP_ID,
  FS_APP_SECRET: process.env.FS_APP_SECRET,
  FS_APP_TOKEN: process.env.FS_APP_TOKEN,
  FS_ROSTER_TABLE_ID: process.env.FS_ROSTER_TABLE_ID,
  ROSTER_CACHE_TTL_MS: '0',
  WORKER_SESSION_SECRET: SESSION_SECRET,
};

if (!env.FS_APP_ID || !env.FS_APP_SECRET || !env.FS_APP_TOKEN || !env.FS_ROSTER_TABLE_ID) {
  console.log('缺少 FS_APP_ID / FS_APP_SECRET / FS_APP_TOKEN / FS_ROSTER_TABLE_ID —— 跳过真实联通验证');
  process.exit(2);
}

let pass = 0, failn = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_REAL ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { failn++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'false'));

const nowSec = Math.floor(Date.now() / 1000);
async function sessionFor(name, phone, department) {
  return signJwtHs256({
    iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: phone, name,
    department, position: '管理员', grid_level: '三级网格长',
    role: '管理员', iat: nowSec, exp: nowSec + 3600, jti: 'real19',
  }, SESSION_SECRET);
}
async function roster(query, token) {
  const req = new Request('https://worker.local/api/mobile/roster' + query, {
    method: 'GET', headers: { authorization: 'Bearer ' + token },
  });
  const res = await handleRoster(req, env);
  const text = await res.text();
  return { status: res.status, json: JSON.parse(text), text };
}

console.log('===== 花名册源与全量规模 =====');
const t0 = Date.now();
const tok = await sessionFor('联通验证甲', '13900000000', '宁城街道一班');
const r1 = await roster('?area=' + encodeURIComponent('宁城街道一班') + '&limit=200', tok);
const ms1 = Date.now() - t0;
assert(r1.status === 200 && r1.json.code === 'OK', 'R1 area=宁城街道一班 查询成功', `status=${r1.status} ms=${ms1}`);
assert(r1.json.source === 'feishu', 'R2 数据源标注 = feishu（飞书「花名册」表）', `source=${r1.json.source}`);
assert(r1.json.rosterSize > 1000, 'R3 全量花名册规模 > 1000 人（真实数据已接通）', `rosterSize=${r1.json.rosterSize} 耗时=${ms1}ms`);
assert(r1.json.total >= 15 && r1.json.total <= 30, 'R4 宁城街道一班 命中 15~30 人', `total=${r1.json.total}`);
assert(r1.json.items.every((x) => (x.dept || '').includes('宁城街道一班') || (x.area || '').includes('宁城街道一班')),
  'R5 每条结果班组或负责区域含目标班组');
assert(r1.json.items.every((x) => x.name && x.code), 'R6 每条结果都有姓名与员工编码');
const sample = r1.json.items[0];
assert(!JSON.stringify(sample).match(/\d{17}[\dXx]/), 'R7 身份证号码列未被下发');
assert(!/password|secret|token/i.test(r1.text), 'R8 响应无凭据字样');

console.log('===== 班组口径（所属部门）跨片区 =====');
for (const dept of ['柴胡店镇一班', '津城街道二班', '项目管理层']) {
  const r = await roster('?area=' + encodeURIComponent(dept) + '&limit=200', tok);
  assert(r.json.total > 0 && r.json.items.every((x) => (x.dept || '').includes(dept)),
    `R9「${dept}」命中 ${r.json.total} 人且班组一致`, JSON.stringify(r.json.items.slice(0, 2).map((x) => x.name + '/' + x.dept)));
}

console.log('===== 姓名/工号搜索（全公司范围） =====');
const nameProbe = sample ? sample.name.slice(0, 2) : '张';
const rs = await roster('?q=' + encodeURIComponent(nameProbe), tok);
assert(rs.status === 200 && rs.json.total >= 1, `R10 姓名前缀「${nameProbe}」可搜索`, `total=${rs.json.total}`);
const codeProbe = sample ? sample.code : '';
const rc = await roster('?q=' + encodeURIComponent(codeProbe), tok);
assert(rc.json.total === 1 && rc.json.items[0].code === codeProbe, 'R11 员工编码精确搜索命中唯一', `total=${rc.json.total}`);

console.log('===== 最小权限：无参收敛到本人部门 =====');
const rScope = await roster('', tok);
assert(rScope.json.filters.scopedToSelf === true && rScope.json.filters.area === '宁城街道一班',
  'R12 无 area/q → 收敛到本人部门', JSON.stringify(rScope.json.filters));
assert(rScope.json.total <= 30, 'R13 收敛后不返回全公司名单', `total=${rScope.json.total}`);

console.log('===== 未认证 =====');
const rNoAuth = await handleRoster(new Request('https://worker.local/api/mobile/roster', { method: 'GET' }), env);
assert(rNoAuth.status === 401, 'R14 未认证 → 401', `status=${rNoAuth.status}`);

console.log(`\n===== RESULT: ${pass} passed, ${failn} failed =====`);
if (failn) process.exit(1);
