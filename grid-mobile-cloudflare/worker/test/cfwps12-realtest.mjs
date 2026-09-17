/* CF-WPS-12 REAL-MACHINE test — Worker /wps/upload/image -> real WPS 3-step upload -> Sheet 13 Attachment.
 * GUARDS:
 *  - records written to Sheet 13 ONLY, all carry 测试编号 CF-WPS-12-TEST-*; deleted at the end
 *  - Sheet 3 / Sheet 11 read-only count snapshots (must be identical)
 *  - one extra UI-verify record (CF-WPS-12-TEST-UIVERIFY) is intentionally KEPT for manual WPS-page check
 *  - secrets/tokens never printed
 * Run: node test/cfwps12-realtest.mjs
 */
import { readFileSync } from 'node:fs';
const envText = readFileSync(new URL('../../../server/.env', import.meta.url), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) envVar[m[1]] = m[2].trim(); }
const APP_ID = envVar.WPS_APP_ID, APP_SECRET = envVar.WPS_APP_SECRET;
const BASE = envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn';
const FILE_ID = 'cn229thwalDs';
const TEST_SHEET = '13', PROD_SHEET = '3', ROSTER_SHEET = '11';
if (!APP_ID || !APP_SECRET) { console.error('[GUARD] missing credentials'); process.exit(1); }

const workerMod = await import('../index.js');
const worker = workerMod.default;
const { signJwtHs256 } = workerMod;

const SESSION_SECRET = 'cfwps12-realtest-session-secret-0123456';
const nowSec = Math.floor(Date.now() / 1000);
const SESSION = await signJwtHs256({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: 'CF-WPS-12-TEST-EMP', name: '测试甲', iat: nowSec, exp: nowSec + 7200, jti: 'c12real' }, SESSION_SECRET);

function workerEnv(overrides = {}) {
  return {
    WPS_CLIENT_ID: APP_ID, WPS_CLIENT_SECRET: APP_SECRET, WPS_OPENAPI_BASE: BASE,
    WPS_DBSHEET_FILE_ID: FILE_ID, WPS_DBSHEET_TEST_SHEET_ID: TEST_SHEET,
    ALLOW_WPS_WRITE: 'true', WORKER_SESSION_SECRET: SESSION_SECRET,
    ...overrides,
  };
}

// direct WPS helpers (read/cleanup only)
let appToken = '';
async function T() { if (appToken) return appToken; const r = await fetch(`${BASE}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: APP_SECRET }).toString() }); return (appToken = (await r.json()).access_token); }
async function listRecords(sheetId, pageNum = 1) {
  const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/list_by_page`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await T()}` },
    body: JSON.stringify({ page_num: pageNum, page_size: 200, prefer_id: false, show_record_extra_info: false }),
    signal: AbortSignal.timeout(25000),
  });
  const j = await res.json();
  return ((j?.data?.records) || []).map((r) => ({ ...r, fields_value: r.fields_value ?? r.fields }));
}
async function countSheet(sheetId) { let n = 0; for (let p = 1; ; p++) { const r = await listRecords(sheetId, p); n += r.length; if (r.length < 200) break; } return n; }
async function batchDelete(sheetId, ids) {
  if (!ids.length) return { status: 200 };
  const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/batch_delete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await T()}` },
    body: JSON.stringify({ records: ids.map(String) }),
  });
  return { status: res.status };
}

const allBodies = [];
let pass = 0, failn = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_REAL ${n}${x ? ' :: ' + x : ''}`); };
const fail = (n, d) => { failn++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : fail(n, d || 'assertion false'));

async function callUpload({ fileBuf, fileName, fileType = 'image/jpeg', token = SESSION, env = workerEnv(), extraFields = {} } = {}) {
  const fd = new FormData();
  if (fileBuf) fd.append('file', new Blob([fileBuf], { type: fileType }), fileName);
  for (const [k, v] of Object.entries(extraFields)) fd.append(k, v);
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const req = new Request('https://worker.local/wps/upload/image', { method: 'POST', headers, body: fd });
  const res = await worker.fetch(req, env);
  const text = await res.text();
  allBodies.push(text);
  return { status: res.status, json: JSON.parse(text || '{}'), text };
}

// small valid test images (synthetic, no sensitive content)
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmgA//9k=', 'base64');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const TXT = Buffer.from('plain text not an image', 'utf8');

console.log('===== baseline (read-only) =====');
const prodBefore = await countSheet(PROD_SHEET);
const rosterBefore = await countSheet(ROSTER_SHEET);
const testBefore = await countSheet(TEST_SHEET);
console.log(`sheet3=${prodBefore} sheet11=${rosterBefore} sheet13=${testBefore}`);

console.log('===== real upload chain =====');
const created = [];
{
  // A: real JPG upload
  const r = await callUpload({ fileBuf: JPEG, fileName: `cfwps12-test-${Date.now()}.jpg`, extraFields: { client_request_id: `CID-C12-A-${Date.now()}` } });
  const recId = r.json?.recordIds?.[0] || null;
  if (recId) created.push(String(recId));
  assert(r.status === 200 && r.json?.success && recId, 'A real JPG upload + record', JSON.stringify(r.json).slice(0, 160));
  assert(r.json?.employee?.employee_code === 'CF-WPS-12-TEST-EMP', 'A session employee_code injected', '');
}
{
  // B: real PNG upload
  const r = await callUpload({ fileBuf: PNG, fileName: `cfwps12-test-${Date.now()}.png`, extraFields: { client_request_id: `CID-C12-B-${Date.now()}` } });
  const recId = r.json?.recordIds?.[0] || null;
  if (recId) created.push(String(recId));
  assert(r.status === 200 && r.json?.success && recId, 'B real PNG upload + record', JSON.stringify(r.json).slice(0, 160));
}
{
  // C: oversized — rejected locally, no WPS call
  const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff); big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
  const r = await callUpload({ fileBuf: big, fileName: 'big.jpg' });
  assert(r.status === 413, 'C oversized -> 413 (no upstream)', `status=${r.status}`);
}
{
  // D/E: non-image + forged MIME
  const r1 = await callUpload({ fileBuf: TXT, fileName: 'note.txt', fileType: 'text/plain' });
  const r2 = await callUpload({ fileBuf: TXT, fileName: 'fake.jpg', fileType: 'image/jpeg' });
  assert(r1.status === 400 && r2.status === 400, 'D/E non-image & forged MIME -> 400', `${r1.status}/${r2.status}`);
}
{
  // M/N: unauthenticated + tampered token
  const r1 = await callUpload({ token: '' });
  const r2 = await callUpload({ token: SESSION.slice(0, -4) + 'AAAA' });
  assert(r1.status === 401 && r2.status === 401, 'M/N unauthenticated & tampered -> 401', `${r1.status}/${r2.status}`);
}
{
  // L: duplicate client_request_id
  const cid = `CID-C12-DUP-${Date.now()}`;
  const r1 = await callUpload({ fileBuf: JPEG, fileName: 'dup1.jpg', extraFields: { client_request_id: cid } });
  if (r1.json?.recordIds?.[0]) created.push(String(r1.json.recordIds[0]));
  const r2 = await callUpload({ fileBuf: JPEG, fileName: 'dup2.jpg', extraFields: { client_request_id: cid } });
  assert(r1.status === 200 && r2.status === 200 && r2.json?.deduplicated === true, 'L duplicate client_request_id -> deduplicated (real scan)', JSON.stringify(r2.json).slice(0, 140));
}
{
  // O: front-end forged employee_code ignored (verify via record read-back)
  const r = await callUpload({ fileBuf: JPEG, fileName: 'forge.jpg', extraFields: { employee_code: 'HACKER-CODE' } });
  const recId = r.json?.recordIds?.[0] ? String(r.json.recordIds[0]) : null;
  if (recId) created.push(recId);
  let realCode = '';
  if (recId) {
    outer: for (let p = 1; p <= 5; p++) {
      for (const rec of await listRecords(TEST_SHEET, p)) {
        if (String(rec.id) !== recId) continue;
        let fv = rec.fields_value; if (typeof fv === 'string') { try { fv = JSON.parse(fv); } catch { fv = {}; } }
        realCode = String(fv?.['employee_code'] ?? '');
        break outer;
      }
    }
  }
  assert(realCode === 'CF-WPS-12-TEST-EMP', 'O record employee_code = session sub (forgery ignored)', `got=${realCode}`);
}
// read-back attachment structure of first A record
{
  let att = null;
  outer: for (let p = 1; p <= 5; p++) {
    for (const rec of await listRecords(TEST_SHEET, p)) {
      let fv = rec.fields_value; if (typeof fv === 'string') { try { fv = JSON.parse(fv); } catch { continue; } }
      if (Array.isArray(fv?.['测试图片']) && fv['测试图片'].length && String(fv?.['测试编号'] || '').includes('CF-WPS-12-TEST')) {
        att = fv['测试图片'][0]; break outer;
      }
    }
  }
  assert(att && att.uploadId && att.source === 'upload_ks3' && /^image\/(jpeg|png)$/.test(att.type || ''),
    'I Attachment read-back structure official', JSON.stringify(att).slice(0, 160));
}

console.log('===== leak scan =====');
{
  const joined = allBodies.join('\n');
  const checks = [
    ['wps app secret', !joined.includes(APP_SECRET)],
    ['session secret', !joined.includes(SESSION_SECRET)],
    ['session token', !joined.includes(SESSION)],
    ['etag/newfilename', !/etag/i.test(joined)],
    ['ID-card-like', !/\d{17}[\dXx]/.test(joined)],
  ];
  for (const [n, c] of checks) assert(c, `leak-scan: ${n}`, c ? '' : 'LEAK');
}

console.log('===== cleanup + pollution check =====');
{
  const del = await batchDelete(TEST_SHEET, created);
  assert(del.status === 200, 'R batch_delete created test records', `n=${created.length}`);
}
await new Promise((r) => setTimeout(r, 1500));
{
  let residue = 0;
  for (const rec of await listRecords(TEST_SHEET)) {
    let fv = rec.fields_value; if (typeof fv === 'string') { try { fv = JSON.parse(fv); } catch { continue; } }
    const tn = String(fv?.['测试编号'] ?? '');
    if (tn.includes('CF-WPS-12-TEST') && !tn.includes('UIVERIFY')) residue++;
  }
  assert(residue === 0, 'R test residue = 0 (UIVERIFY record intentionally kept)', `residue=${residue}`);
  const prodAfter = await countSheet(PROD_SHEET);
  const rosterAfter = await countSheet(ROSTER_SHEET);
  assert(prodAfter === prodBefore, 'S Sheet 3 zero change', `${prodBefore} -> ${prodAfter}`);
  assert(rosterAfter === rosterBefore, 'T Sheet 11 zero change', `${rosterBefore} -> ${rosterAfter}`);
}

console.log(`\n===== RESULT: ${pass} PASS_REAL, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
