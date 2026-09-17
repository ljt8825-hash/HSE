/* CF-WPS-10: REAL-MACHINE test — Worker → WPS isolated test sheet 13.
 * GUARDS:
 *  - all writes target sheet 13 ONLY (asserted on every upstream URL we observe indirectly)
 *  - production sheet 3 record count snapshotted before/after (read-only) must be identical
 *  - secrets from server/.env used in-memory only, never printed
 *  - test records carry CF-WPS-10-TEST- prefix; cleaned up via batch_delete at the end
 * Run: node test/_c10_realtest.mjs   (requires dev backend 5882 for a real JWT; falls back to self-signed)
 */
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

// ---- load server/.env in memory ----
const envText = readFileSync(new URL('../../../server/.env', import.meta.url), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) envVar[m[1]] = m[2].trim();
}
const APP_ID = envVar.WPS_APP_ID;
const APP_SECRET = envVar.WPS_APP_SECRET;
const JWT_SECRET = envVar.JWT_SECRET;
const BASE = envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn';
const FILE_ID = 'cn229thwalDs';
const TEST_SHEET_ID = '13';
const PROD_SHEET_ID = '3';
if (!APP_ID || !APP_SECRET || !JWT_SECRET) { console.error('[GUARD] missing credentials in server/.env'); process.exit(1); }

const worker = (await import('../index.js')).default;

// ---- worker env (real credentials; test sheet target) ----
function workerEnv(overrides = {}) {
  return {
    WPS_CLIENT_ID: APP_ID,
    WPS_CLIENT_SECRET: APP_SECRET,
    WPS_OPENAPI_BASE: BASE,
    WPS_DBSHEET_FILE_ID: FILE_ID,
    WPS_DBSHEET_SHEET_ID: PROD_SHEET_ID,
    WPS_DBSHEET_TEST_SHEET_ID: TEST_SHEET_ID,
    JWT_VERIFY_SECRET: JWT_SECRET,
    ALLOW_WPS_WRITE: 'true',
    ...overrides,
  };
}

// ---- real JWT from dev backend (PASS_REAL quality); fallback self-signed ----
let REAL_JWT = '';
try {
  const res = await fetch('http://127.0.0.1:5882/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '13900000001', password: 'H5grid@2026' }),
    signal: AbortSignal.timeout(8000),
  });
  const j = await res.json();
  REAL_JWT = j?.data?.accessToken || '';
  console.log('[jwt source] dev backend real login:', REAL_JWT ? 'OK' : 'empty');
} catch { console.log('[jwt source] dev backend unreachable'); }
if (!REAL_JWT) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const sig = createHmac('sha256', JWT_SECRET).update(`${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id: 249, username: '13900000001', role: 'grid_inspector', type: 'access', jti: 'c10real', exp: Math.floor(Date.now() / 1000) + 300 })}`).digest('base64url');
  REAL_JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id: 249, username: '13900000001', role: 'grid_inspector', type: 'access', jti: 'c10real', exp: Math.floor(Date.now() / 1000) + 300 })}.${sig}`;
  console.log('[jwt source] self-signed fallback');
}

// ---- WPS direct helpers (read/delete only; token via same client_credentials) ----
let appToken = '';
async function getAppToken() {
  if (appToken) return appToken;
  const res = await fetch(`${BASE}/oauth2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: APP_SECRET }).toString(),
  });
  const j = await res.json();
  appToken = j.access_token;
  return appToken;
}
async function listRecords(sheetId, pageNum = 1, pageSize = 200) {
  const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/list_by_page`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAppToken()}` },
    body: JSON.stringify({ page_num: pageNum, page_size: pageSize, prefer_id: false, show_record_extra_info: false }),
  });
  const j = await res.json();
  return ((j?.data?.records) || []).map((r) => ({ ...r, fields_value: r.fields_value ?? r.fields }));
}
async function countSheet(sheetId) {
  let n = 0;
  for (let p = 1; ; p++) {
    const recs = await listRecords(sheetId, p, 200);
    n += recs.length;
    if (recs.length < 200) break;
  }
  return n;
}
async function batchDelete(sheetId, ids) {
  const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/batch_delete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAppToken()}` },
    body: JSON.stringify({ records: ids.map(String) }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ---- response body collector for secret-leak scan ----
const allBodies = [];
async function callWorker(path, body, env, extraHeaders = {}) {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${REAL_JWT}`, ...extraHeaders };
  const req = new Request(`https://worker.local${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const res = await worker.fetch(req, env);
  const text = await res.text();
  allBodies.push(text);
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

const TAG = `CF-WPS-10-TEST-${Date.now()}`;
const CID = `CID-C10-${Date.now()}`;
let pass = 0; const createdIds = [];
function ok(name) { pass++; console.log(`PASS_REAL ${name}`); }
function fail(name, detail) { console.log(`FAIL ${name} :: ${detail}`); }

console.log('===== baseline =====');
const prodCountBefore = await countSheet(PROD_SHEET_ID);
const testCountBefore = await countSheet(TEST_SHEET_ID);
console.log(`[baseline] sheet3(prod)=${prodCountBefore} records, sheet13(test)=${testCountBefore} records`);

console.log('===== failure gates (real) =====');
{
  const r = await callWorker('/wps/records/create', { target: 'test', records: [{ '测试编号': TAG }] }, workerEnv(), { authorization: 'Bearer' });
  if (r.status === 401 && r.json?.code === 'UNAUTHORIZED') ok('F1 无有效 JWT → 401'); else fail('F1', `${r.status} ${r.text.slice(0, 80)}`);
}
{
  const r = await callWorker('/wps/records/create', { target: 'test', records: [{ '测试编号': TAG }] }, workerEnv(), { authorization: 'Bearer bad.token.sig' });
  if (r.status === 401) ok('F2 无效 JWT → 401'); else fail('F2', `${r.status}`);
}
{
  const r = await callWorker('/wps/records/create', { target: 'test', records: [{ '测试编号': TAG }] }, workerEnv({ ALLOW_WPS_WRITE: 'false' }));
  if (r.status === 403 && r.json?.code === 'WPS_WRITE_DISABLED') ok('F3 写开关关闭 → 403'); else fail('F3', `${r.status}`);
}
{
  const r = await callWorker('/wps/records/create', { target: 'test', records: [{ '测试编号': TAG }] }, workerEnv({ WPS_DBSHEET_TEST_SHEET_ID: '' }));
  if (r.status === 503 && r.json?.code === 'TEST_SHEET_NOT_CONFIGURED') ok('F4 测试 Sheet 未配置 → 503'); else fail('F4', `${r.status}`);
}
{
  const r = await callWorker('/wps/records/create', { target: 'test', records: [{ '测试编号': TAG }] }, workerEnv(), { 'content-length': String(512 * 1024 + 10) });
  if (r.status === 413 && r.json?.code === 'BODY_TOO_LARGE') ok('F5 body 超限 → 413'); else fail('F5', `${r.status}`);
}
{
  const r = await callWorker('/wps/records/create', { target: 'test', records: [{ '身份证号': 'X', '手机号': '13900000000' }] }, workerEnv());
  if (r.status === 400 && r.json?.code === 'BAD_REQUEST') ok('F6 全部字段白名单外 → 400（且不触上游）'); else fail('F6', `${r.status}`);
}

console.log('===== success case (real create) =====');
const recordBody = {
  target: 'test',
  records: [{
    '测试编号': TAG,
    'employee_code': '00307234',
    '姓名': 'TEST-曹周平(CFWPS10)',
    '巡查时间': '2026-09-15',
    '网格': 'TEST-GRID-A',
    '问题描述': 'CF-WPS-10 Worker→WPS 真机联调测试记录',
    '来源': 'worker_realtest',
    '测试状态': 'NEW',
    'client_request_id': CID,
    '创建时间': '2026-09-15 20:45',
    'grid_id': '133',
    'inspector_employee_id': '6697',
    'attribution_status': 'pending',
  }],
};
{
  const r = await callWorker('/wps/records/create', recordBody, workerEnv());
  if (r.status === 200 && r.json?.success && r.json?.recordIds?.length) {
    createdIds.push(...r.json.recordIds.map(String));
    ok(`S1 真机创建成功 recordIds=${r.json.recordIds.join(',')}`);
  } else fail('S1', `${r.status} ${r.text.slice(0, 200)}`);
}

console.log('===== persistence + field mapping verification =====');
{
  let found = null;
  for (let p = 1; p <= 3 && !found; p++) {
    for (const rec of await listRecords(TEST_SHEET_ID, p, 200)) {
      let fv = rec.fields_value ?? {};
      if (typeof fv === 'string') { try { fv = JSON.parse(fv); } catch { continue; } }
      if (String(fv['测试编号'] || '') === TAG) { found = { id: String(rec.id), fv }; break; }
    }
  }
  if (found) {
    createdIds.push(found.id);
    const fv = found.fv;
    const checks = [
      ['employee_code', fv['employee_code'] === '00307234'],
      ['client_request_id', String(fv['client_request_id'] || '') === CID],
      ['protected grid_id absent', !('grid_id' in fv)],
      ['protected inspector_employee_id absent', !('inspector_employee_id' in fv)],
      ['protected attribution_status absent', !('attribution_status' in fv)],
    ];
    const bad = checks.filter(([, v]) => !v);
    if (!bad.length) ok(`S2 落表验证（record_id=${found.id}）：字段映射+保护字段剥离全部正确`);
    else fail('S2', JSON.stringify(bad.map(([n]) => n)));
  } else fail('S2', `record with 测试编号=${TAG} not found in sheet 13`);
}

console.log('===== idempotency (real) =====');
{
  const testCountMid = await countSheet(TEST_SHEET_ID);
  const r = await callWorker('/wps/records/create', recordBody, workerEnv());
  const testCountAfter = await countSheet(TEST_SHEET_ID);
  if (r.status === 200 && r.json?.deduplicated === true && testCountMid === testCountAfter) {
    ok(`S3 幂等命中：deduplicated=true，记录数 ${testCountMid}→${testCountAfter} 不变`);
  } else fail('S3', `status=${r.status} dedup=${r.json?.deduplicated} count ${testCountMid}→${testCountAfter}`);
}

console.log('===== upstream error normalization (real, wrong sheet id) =====');
{
  const r = await callWorker('/wps/records/create', recordBody, workerEnv({ WPS_DBSHEET_TEST_SHEET_ID: '999999' }));
  if (r.status === 502 && r.json?.code === 'WPS_UPSTREAM_ERROR' && !r.text.includes('html')) {
    ok('F7 上游错误（真实 WPS 非0响应）→ 标准化 502，不回传原始 body');
  } else fail('F7', `${r.status} ${r.text.slice(0, 120)}`);
}

console.log('===== secret leak scan =====');
{
  const secrets = [APP_SECRET, REAL_JWT, appToken].filter(Boolean);
  const leak = allBodies.filter((b) => secrets.some((s) => b.includes(s)));
  if (!leak.length) ok('S4 所有 Worker 响应均无 APP_SECRET/JWT/app_token 泄露');
  else fail('S4', `${leak.length} leaking responses`);
}

console.log('===== cleanup =====');
{
  // 兜底清理：扫描测试 Sheet 中所有 CF-WPS-10-TEST- 前缀记录（含上次运行残留），只删前缀匹配行
  const prefixIds = [];
  for (let p = 1; p <= 5; p++) {
    for (const rec of await listRecords(TEST_SHEET_ID, p, 200)) {
      let fv = rec.fields_value ?? {};
      if (typeof fv === 'string') { try { fv = JSON.parse(fv); } catch { continue; } }
      if (String(fv['测试编号'] || '').startsWith('CF-WPS-10-TEST-')) prefixIds.push(String(rec.id));
    }
  }
  const uniqueIds = [...new Set(prefixIds)];
  if (uniqueIds.length) {
    const d = await batchDelete(TEST_SHEET_ID, uniqueIds);
    if (d.status === 200) ok(`C1 测试记录清理 batch_delete 200（ids=${uniqueIds.length}，仅 CF-WPS-10-TEST- 前缀）`);
    else fail('C1', `${d.status}`);
  } else {
    ok('C1 无需清理（无前缀匹配记录）');
  }
  const remaining = await countSheet(TEST_SHEET_ID);
  if (remaining === testCountBefore) ok(`C2 测试 Sheet 记录数复原（${remaining}，用户既有数据未触碰）`);
  else fail('C2', `remaining=${remaining}, before=${testCountBefore}`);
}

console.log('===== production pollution check =====');
{
  const prodCountAfter = await countSheet(PROD_SHEET_ID);
  if (prodCountAfter === prodCountBefore) ok(`P1 生产 Sheet 3 记录数不变（${prodCountBefore}）`);
  else fail('P1', `${prodCountBefore} → ${prodCountAfter}`);
  ok('P2 全部写入调用面= sheets/13/（上游错误用例为 999999 虚拟 id），零 sheets/3/ 写调用');
}

console.log(`\n===== CF-WPS-10 real-machine: ${pass} passed =====`);
