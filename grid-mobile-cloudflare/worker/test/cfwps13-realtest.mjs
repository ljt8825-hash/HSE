/* CF-WPS-13: REAL-machine test — 网格长巡查文字业务链（真实 WPS 上游，仅隔离测试 Sheet）.
 * 前提纪律：
 *   - 写入目标 = Sheet 13「H5提交测试」（隔离表）；Sheet 3/11/14 零写入（14 仅播种+清理测试行）。
 *   - secrets 仅从 server/.env 进入内存，绝不打印。
 * 流程：基线 → Sheet13 补字段（幂等）→ 播种 Sheet14 测试身份（真实花名册员工）→ 真实登录
 *      → meta(网格解析) → 提交 → 幂等 → 注入 → 401 → 回读/列表/详情 → 清理 → 基线复核
 * Run: node test/cfwps13-realtest.mjs
 */
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';

const workerMod = await import('../index.js');
const worker = workerMod.default;
const { signJwtHs256 } = workerMod;

const envText = readFileSync(new URL('../../../server/.env', import.meta.url), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) envVar[m[1]] = m[2].trim(); }
const APP_ID = envVar.WPS_APP_ID, APP_SECRET = envVar.WPS_APP_SECRET;
const BASE = (envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, '');
const FILE_ID = 'cn229thwalDs';
if (!APP_ID || !APP_SECRET) { console.error('[GUARD] missing credentials'); process.exit(1); }

const SESSION_SECRET = envVar.WORKER_SESSION_SECRET || ('ephemeral-' + Date.now() + '-' + Math.random().toString(36).slice(2));
const workerEnv = {
  WPS_CLIENT_ID: APP_ID, WPS_CLIENT_SECRET: APP_SECRET, WPS_OPENAPI_BASE: BASE,
  WPS_DBSHEET_FILE_ID: FILE_ID,
  WPS_DBSHEET_TEST_SHEET_ID: '13',
  WPS_DBSHEET_IDENTITY_SHEET_ID: '14',
  IDENTITY_ROSTER_SHEET_ID: '11',
  ALLOW_WPS_WRITE: 'true',
  MOBILE_LOGIN_ENABLED: 'true',
  WORKER_SESSION_SECRET: SESSION_SECRET,
};

let pass = 0, failn = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_REAL ${n}${x ? ' :: ' + x : ''}`); };
const fail = (n, d) => { failn++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : fail(n, d || 'assertion false'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wps(path, body, method) {
  const tr = await fetch(`${BASE}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: APP_SECRET }).toString() });
  const tj = await tr.json().catch(() => ({}));
  const res = await fetch(`${BASE}${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tj.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
async function scanSheet(sheetId, maxPages = 50) {
  const out = [];
  for (let p = 1; p <= maxPages; p++) {
    const r = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/list_by_page`, { page_num: p, page_size: 200 });
    const recs = r.json?.data?.records || [];
    for (const rec of recs) {
      let fv = rec.fields_value ?? rec.fields;
      try { if (typeof fv === 'string') fv = JSON.parse(fv); } catch { fv = {}; }
      out.push({ id: rec.id, fields: fv });
    }
    if (recs.length < 200) break;
    await sleep(150);
  }
  return out;
}
async function countSheet(sheetId) { return (await scanSheet(sheetId)).length; }

async function callWorker(path, { method, body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const req = new Request(`https://worker.local${path}`, { method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined });
  const res = await worker.fetch(req, workerEnv);
  const text = await res.text();
  return { status: res.status, json: JSON.parse(text || '{}') };
}

// ============ 0. 基线 ============
console.log('===== 0. 基线记录 =====');
const base3 = await countSheet(3);
const base11 = await countSheet(11);
const base13 = await countSheet(13);
const base14 = await countSheet(14);
console.log(`baseline: S3=${base3} S11=${base11} S13=${base13} S14=${base14}`);
assert(base3 === 2063 && base11 === 1291, 'P0 生产两表基线与历史一致', `S3=${base3} S11=${base11}`);

// ============ 1. Sheet 13 补字段（幂等） ============
console.log('===== 1. Sheet 13 巡查字段（幂等创建） =====');
const NEED_FIELDS = ['问题类型', '是否三违', '三违行为描述', '涉及人员', '照片状态'];
const schemaRes = await wps(`/v7/coop/dbsheet/${FILE_ID}/schema`);
const s13 = (schemaRes.json?.data?.sheets || []).find((s) => String(s.id) === '13');
const existingNames = new Set((s13?.fields || []).map((f) => f.name));
const missing = NEED_FIELDS.filter((n) => !existingNames.has(n));
if (missing.length) {
  const cr = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/13/fields`, { fields: missing.map((n) => ({ name: n, type: 'MultiLineText' })) });
  assert(cr.status === 200 && cr.json.code === 0, `Sheet13 新增字段 [${missing.join(',')}]`, JSON.stringify(cr.json).slice(0, 120));
} else {
  ok('Sheet13 巡查字段已存在（幂等跳过）');
}

// ============ 2. 播种 Sheet 14 测试身份（真实花名册员工） ============
console.log('===== 2. 播种测试身份（真实花名册 + 负责区域） =====');
const roster = await scanSheet(11);
const candidates = roster.filter((r) => {
  const code = String(r.fields['员工编码'] || '').trim();
  const status = String(r.fields['用工关系状态'] || '');
  const area = String(r.fields['负责区域（在职）'] || '').trim();
  return code && status && !status.includes('离职') && area && area !== '0';
});
assert(candidates.length > 0, '花名册存在可测员工（在职+负责区域非空）', `candidates=${candidates.length}`);
const cand = candidates[0];
const CAND_CODE = String(cand.fields['员工编码']).trim();
const CAND_NAME = String(cand.fields['姓名'] || '').trim();
const rawAreas = String(cand.fields['负责区域（在职）'] || '').trim();
console.log(`candidate: ${CAND_NAME}(${CAND_CODE}) areas="${rawAreas}"`);
const TEST_PHONE = '139' + String(Date.now()).slice(-8);
const seedRes = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/14/records/create`, {
  prefer_id: false,
  records: [{ fields_value: JSON.stringify({
    employee_code: CAND_CODE, 姓名: CAND_NAME, 手机号码: TEST_PHONE,
    password_hash: bcrypt.hashSync('H5pass2026', 4),
    部门: String(cand.fields['所属部门'] || ''), 职位: String(cand.fields['职位'] || ''),
    身份状态: '正常', 创建时间: new Date().toISOString().slice(0, 10),
  }) }],
});
assert(seedRes.status === 200 && seedRes.json.code === 0, 'Sheet14 测试身份行创建', `code=${seedRes.json?.code}`);
let seedId = seedRes.json?.data?.records?.[0]?.id || null;
await sleep(800); // WPS 写入可见性余量

// ============ 3. 真实登录 ============
console.log('===== 3. 真实登录（手机号+密码 → Session） =====');
let TOKEN = '';
{
  const r = await callWorker('/api/mobile/auth/login', { body: { phone: TEST_PHONE, password: 'H5pass2026' } });
  assert(r.status === 200 && r.json.success && r.json.employee.employee_code === CAND_CODE, '真机登录成功，employee_code=花名册员工编码', `status=${r.status} ${JSON.stringify(r.json).slice(0, 140)}`);
  TOKEN = r.json.token || '';
}
{
  const r = await callWorker('/api/mobile/auth/login', { body: { phone: TEST_PHONE, password: 'wrong-pass' } });
  assert(r.status === 401 && r.json.code === 'AUTH_FAILED', '真机错误密码 → 401 统一口令');
}

// ============ 4. meta（网格解析） ============
console.log('===== 4. meta：身份 + 网格解析 =====');
let metaGrids = [];
{
  const r = await callWorker('/api/mobile/patrol/meta', { token: TOKEN });
  assert(r.status === 200 && r.json.success && r.json.grid_resolved === true, '真机 meta：网格解析成功', JSON.stringify(r.json).slice(0, 200));
  metaGrids = r.json.grids || [];
  assert(metaGrids.length > 0, '网格列表非空', JSON.stringify(metaGrids));
  assert(r.json.photo_status === 'PENDING_EXTERNAL', 'meta 明示照片 PENDING_EXTERNAL');
}
const THE_GRID = metaGrids[0];

// ============ 5. 提交 + 幂等 + 注入 + 401 + 回读 ============
console.log('===== 5. 提交链（真机 WPS 写入 Sheet 13） =====');
const CID_MAIN = 'H5RT13MAIN' + String(Date.now()).slice(-8);
let mainRecordId = null;
{
  const r = await callWorker('/api/mobile/patrol/submit', { token: TOKEN, body: {
    inspection_time: '2026-09-16 09:15', grid: THE_GRID,
    problem_type: '环境卫生',
    description: '【CF-WPS-13 真机测试】巡查发现路面垃圾堆积，已现场劝导清理。',
    is_violation: '是', violation_desc: '【测试】有人乱倒垃圾', violation_people: '测试涉及人员',
    photo_taken: 'true', client_request_id: CID_MAIN,
  } });
  assert(r.status === 200 && r.json.success && (r.json.recordIds || []).length === 1, '真机巡查提交 → 200 + record_id', JSON.stringify(r.json).slice(0, 140));
  mainRecordId = r.json.recordIds[0];
  assert(r.json.target === 'test', '提交目标=隔离测试表');
}
await sleep(800);
{
  const r = await callWorker('/api/mobile/patrol/submit', { token: TOKEN, body: {
    inspection_time: '2026-09-16 09:15', grid: THE_GRID, problem_type: '环境卫生',
    description: '【CF-WPS-13 真机测试】重复提交', is_violation: '否', client_request_id: CID_MAIN,
  } });
  assert(r.status === 200 && r.json.deduplicated === true && r.json.recordIds[0] === mainRecordId, '真机重复 client_request_id → deduplicated + 同一 record_id');
}
{
  const r = await callWorker('/api/mobile/patrol/submit', { token: TOKEN, body: {
    inspection_time: '2026-09-16 09:20', grid: '不存在的网格XYZ', problem_type: '其他',
    description: '网格不一致测试', is_violation: '否', client_request_id: 'H5RT13GRID' + String(Date.now()).slice(-8),
  } });
  assert(r.status === 422 && r.json.code === 'GRID_NOT_ALLOWED', '真机网格不一致 → 422 GRID_NOT_ALLOWED', JSON.stringify(r.json));
}
{
  const r = await callWorker('/api/mobile/patrol/submit', { body: {
    inspection_time: '2026-09-16 09:20', grid: THE_GRID, problem_type: '其他',
    description: '未登录测试', is_violation: '否', client_request_id: 'H5RT13NOAUTH01',
  } });
  assert(r.status === 401, '真机未登录提交 → 401');
}
console.log('===== 6. 注入与回读（真机） =====');
{
  const CID_INJ = 'H5RT13INJ0' + String(Date.now()).slice(-8);
  const r = await callWorker('/api/mobile/patrol/submit', { token: TOKEN, body: {
    inspection_time: '2026-09-16 09:25', grid: THE_GRID, problem_type: '安全隐患',
    description: '【CF-WPS-13 真机测试】注入验证', is_violation: '否',
    employee_code: 'HACKER-99', grid_id: '133', inspector_employee_id: '6697', attribution_status: 'approved',
    client_request_id: CID_INJ,
  } });
  assert(r.status === 200, '注入请求提交成功（字段应被忽略）');
  await sleep(800);
  const recs = await scanSheet(13);
  const inj = recs.find((x) => x.fields.client_request_id === CID_INJ);
  const main = recs.find((x) => x.fields.client_request_id === CID_MAIN);
  assert(!!inj && inj.fields.employee_code === CAND_CODE, '真机回读：employee_code=Session.sub（前端注入被忽略）', inj ? inj.fields.employee_code : 'missing');
  assert(inj && !('grid_id' in inj.fields) && !('inspector_employee_id' in inj.fields) && !('attribution_status' in inj.fields), '真机回读：grid_id/inspector_employee_id/attribution_status 零残留');
  assert(!!main && main.fields['网格'] === THE_GRID && main.fields['是否三违'] === '是' && main.fields['照片状态'] === 'PENDING_EXTERNAL', '真机回读：主记录字段与服务端定值一致', main ? JSON.stringify(main.fields).slice(0, 200) : 'missing');
  assert(!!main && main.fields.employee_code === CAND_CODE && main.fields['姓名'] === CAND_NAME, '真机回读：身份快照来自 Session');
}
console.log('===== 7. 我的记录 / 详情（真机） =====');
{
  const r = await callWorker('/api/mobile/patrol/records', { token: TOKEN });
  assert(r.status === 200 && r.json.success && r.json.records.some((x) => x.record_id === mainRecordId), '真机「我的巡查记录」含刚提交记录', `total=${r.json.total}`);
  const d = await callWorker('/api/mobile/patrol/records?id=' + mainRecordId, { token: TOKEN });
  assert(d.status === 200 && d.json.record && d.json.record.violation_desc === '【测试】有人乱倒垃圾', '真机详情：三违字段可读', JSON.stringify(d.json.record || {}).slice(0, 160));
  const dn = await callWorker('/api/mobile/patrol/records?id=NOTEXIST99', { token: TOKEN });
  assert(dn.status === 404, '真机详情：不存在 → 404');
}

// ============ 8. 清理 ============
console.log('===== 8. 清理（测试记录 + 播种身份行） =====');
const delIds = [mainRecordId].filter(Boolean);
{
  const recs = await scanSheet(13);
  for (const x of recs) {
    const cid = String(x.fields.client_request_id || '');
    const no = String(x.fields['测试编号'] || '');
    if ((cid.startsWith('H5RT13') || cid.startsWith('H5S-') || no.startsWith('CF-WPS-13-TEST') || no.startsWith('H5-PATROL')) && !delIds.includes(x.id)) delIds.push(x.id);
  }
}
if (delIds.length) {
  const dr = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/13/records/batch_delete`, { records: delIds.map(String) });
  assert(dr.status === 200 && dr.json.code === 0, `Sheet13 测试记录清理 ${delIds.length} 条`, `code=${dr.json?.code}`);
} else {
  ok('Sheet13 无本阶段残留');
}
if (seedId) {
  const dr = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/14/records/batch_delete`, { records: [String(seedId)] });
  assert(dr.status === 200 && dr.json.code === 0, 'Sheet14 播种身份行清理', `code=${dr.json?.code}`);
}

// ============ 9. 基线复核 ============
console.log('===== 9. 基线复核（生产污染检查） =====');
await sleep(500);
const post3 = await countSheet(3);
const post11 = await countSheet(11);
const post13 = await countSheet(13);
const post14 = await countSheet(14);
console.log(`postline: S3=${post3} S11=${post11} S13=${post13} S14=${post14}`);
assert(post3 === base3, 'S3 零变化', `${base3}→${post3}`);
assert(post11 === base11, 'S11 零变化', `${base11}→${post11}`);
assert(post13 === base13, 'S13 回基线（含字段留存，行数不变）', `${base13}→${post13}`);
assert(post14 === base14, 'S14 回基线', `${base14}→${post14}`);

console.log(`\n===== RESULT: ${pass} PASS_REAL, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
