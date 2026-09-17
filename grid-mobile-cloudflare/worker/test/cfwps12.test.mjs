/* CF-WPS-12: OFFLINE mock tests — /wps/upload/image closed loop.
 * GUARDS: fetch fully mocked (WPS upstream + storage); no real network.
 * Covers: session/写开关 gates, magic bytes, size, employee_code injection, idempotency, error mapping, leak scan.
 * Run: node test/cfwps12.test.mjs
 */
import { createHmac } from 'node:crypto';

const workerMod = await import('../index.js');
const worker = workerMod.default;
const { signJwtHs256, detectImageMagic } = workerMod;

const SESSION_SECRET = 'mock-session-secret-0123456789abcdef';
const WPS_APP_TOKEN = 'mock-wps-app-token-xyz';
const FILE_ID = 'mockfile123';
let createCalls = 0;
let lastCreateBody = null;
const existingRows = []; // sheet 13 records for idempotency scan

// minimal valid images
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmgA//9k=', 'base64');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const TXT = Buffer.from('hello this is not an image', 'utf8');

let addressFailMode = null; // null | 'http500' | 'forbidden'

globalThis.fetch = async (url, init = {}) => {
  const u = String(url instanceof URL ? url : url);
  if (u.includes('/oauth2/token')) return new Response(JSON.stringify({ access_token: WPS_APP_TOKEN, expires_in: 7200 }), { status: 200 });
  if (u.includes('/attachments/upload/address')) {
    if (addressFailMode === 'http500') return new Response(JSON.stringify({ code: 500, msg: 'internal' }), { status: 500 });
    if (addressFailMode === 'forbidden') return new Response(JSON.stringify({ code: 400000003, message: 'kso: PermissionDenied invalid_scope' }), { status: 403 });
    return new Response(JSON.stringify({
      code: 0,
      data: {
        request: { url: 'https://storage.mock/bucket/obj1', method: 'PUT', headers: { 'x-domain-id': 'office-coop' } },
        send_back_params: { etag: 'header.ETag', key: 'header.newfilename' },
        upload_id: 'mock-upload-uuid-1',
      },
    }), { status: 200 });
  }
  if (u.startsWith('https://storage.mock/')) {
    return new Response(null, { status: 200, headers: { ETag: '"abc123"', newfilename: 'stored-key-1' } });
  }
  if (u.includes('/attachments/upload/complete')) {
    return new Response(JSON.stringify({ code: 0, data: { attachment_id: 'ATTMOCK1' } }), { status: 200 });
  }
  if (u.includes('/sheets/13/records/create')) {
    createCalls++;
    lastCreateBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ code: 0, data: { records: [{ id: 'REC' + createCalls }] } }), { status: 200 });
  }
  if (u.includes('/sheets/13/records/list_by_page')) {
    return new Response(JSON.stringify({ code: 0, data: { records: existingRows.map((r) => ({ id: r.id, fields: JSON.stringify(r.fields) })) } }), { status: 200 });
  }
  throw new Error(`UNMOCKED URL (guard): ${u}`);
};

function workerEnv(overrides = {}) {
  return {
    WPS_CLIENT_ID: 'mock-app-id', WPS_CLIENT_SECRET: 'mock-app-secret',
    WPS_OPENAPI_BASE: 'https://mock.wps.example',
    WPS_DBSHEET_FILE_ID: FILE_ID,
    WPS_DBSHEET_TEST_SHEET_ID: '13',
    ALLOW_WPS_WRITE: 'true',
    WORKER_SESSION_SECRET: SESSION_SECRET,
    ...overrides,
  };
}

let pass = 0, failn = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_MOCK ${n}${x ? ' :: ' + x : ''}`); };
const fail = (n, d) => { failn++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : fail(n, d || 'assertion false'));

const nowSec = Math.floor(Date.now() / 1000);
const SESSION = await signJwtHs256({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: 'EMP-SESSION-001', name: '测试甲', iat: nowSec, exp: nowSec + 7200, jti: 'c12' }, SESSION_SECRET);

const allBodies = [];
async function callUpload({ fileBuf, fileName, fileType = 'image/jpeg', token = SESSION, env = workerEnv(), extraFields = {} } = {}) {
  const fd = new FormData();
  if (fileBuf) fd.append('file', new Blob([fileBuf], { type: fileType }), fileName || 'photo.jpg');
  for (const [k, v] of Object.entries(extraFields)) fd.append(k, v);
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const req = new Request('https://worker.local/wps/upload/image', { method: 'POST', headers, body: fd });
  const res = await worker.fetch(req, env);
  const text = await res.text();
  allBodies.push(text);
  return { status: res.status, json: JSON.parse(text || '{}'), text };
}

console.log('===== gates =====');
{
  const r = await callUpload({ token: '' });
  assert(r.status === 401, 'M unauthenticated -> 401', `status=${r.status}`);
}
{
  const bad = SESSION.slice(0, -4) + 'AAAA';
  const r = await callUpload({ token: bad });
  assert(r.status === 401, 'N tampered token -> 401', `status=${r.status}`);
}
{
  const env = workerEnv(); delete env.ALLOW_WPS_WRITE;
  const r = await callUpload({ env });
  assert(r.status === 403 && r.json.code === 'WPS_WRITE_DISABLED', 'write switch off -> 403', JSON.stringify(r.json));
}
{
  const env = workerEnv(); delete env.WPS_DBSHEET_TEST_SHEET_ID;
  const r = await callUpload({ env });
  assert(r.status === 503, 'test sheet not configured -> 503', `status=${r.status}`);
}

console.log('===== validation =====');
{
  const r = await callUpload({ fileBuf: TXT, fileName: 'note.txt', fileType: 'text/plain' });
  assert(r.status === 400 && r.json.code === 'UNSUPPORTED_FILE_TYPE', 'D non-image -> 400', JSON.stringify(r.json));
}
{
  // E: forged MIME — text bytes named .jpg with declared image/jpeg
  const r = await callUpload({ fileBuf: TXT, fileName: 'fake.jpg', fileType: 'image/jpeg' });
  assert(r.status === 400 && r.json.code === 'UNSUPPORTED_FILE_TYPE', 'E forged MIME -> magic bytes reject 400', JSON.stringify(r.json));
}
{
  // C: oversized (>5MB)
  const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);
  big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
  const r = await callUpload({ fileBuf: big, fileName: 'big.jpg' });
  assert(r.status === 413 && r.json.code === 'FILE_TOO_LARGE', 'C oversized -> 413', JSON.stringify(r.json));
}
{
  const r = await callUpload({ env: workerEnv() }); // no file
  assert(r.status === 400, 'missing file field -> 400', `status=${r.status}`);
}
// magic sniff units
assert(detectImageMagic(JPEG)?.mime === 'image/jpeg', 'magic: jpeg', '');
assert(detectImageMagic(PNG)?.mime === 'image/png', 'magic: png', '');
assert(detectImageMagic(TXT) === null, 'magic: txt rejected', '');

console.log('===== happy path (mock) =====');
createCalls = 0;
{
  const r = await callUpload({ fileBuf: JPEG, fileName: 'cfwps12-test.jpg', extraFields: { employee_code: 'FAKE-CODE' } });
  assert(r.status === 200 && r.json.success && r.json.attachment?.uploadId === 'mock-upload-uuid-1' && r.json.attachment?.attachmentId === 'ATTMOCK1',
    'A mock upload chain OK (address->PUT->complete->record)', JSON.stringify(r.json).slice(0, 160));
  assert(createCalls === 1, 'record created once', `createCalls=${createCalls}`);
  const fv = JSON.parse(lastCreateBody.records[0].fields_value);
  assert(fv['employee_code'] === 'EMP-SESSION-001', 'O employee_code from session, front-end FAKE ignored', `got=${fv['employee_code']}`);
  assert(Array.isArray(fv['测试图片']) && fv['测试图片'][0].uploadId === 'mock-upload-uuid-1' && fv['测试图片'][0].source === 'upload_ks3', 'H Attachment field shape official', JSON.stringify(fv['测试图片']));
  assert(!r.text.includes('FAKE-CODE'), 'front-end forged code not echoed', '');
}
console.log('===== idempotency (mock) =====');
{
  existingRows.push({ id: 'EXIST1', fields: { 'client_request_id': 'CID-DUP-1' } });
  const r = await callUpload({ fileBuf: JPEG, fileName: 'dup.jpg', extraFields: { client_request_id: 'CID-DUP-1' } });
  assert(r.status === 200 && r.json.deduplicated === true && r.json.recordIds[0] === 'EXIST1', 'L duplicate client_request_id -> deduplicated', JSON.stringify(r.json));
  assert(createCalls === 1, 'no extra record created on duplicate', `createCalls=${createCalls}`);
}
console.log('===== error mapping (mock) =====');
{
  addressFailMode = 'http500';
  const r = await callUpload({ fileBuf: JPEG, fileName: 'e1.jpg' });
  assert(r.status === 502 && r.json.code === 'WPS_UPSTREAM_ERROR', 'G WPS address 500 -> 502 normalized', JSON.stringify(r.json));
  addressFailMode = 'forbidden';
  const r2 = await callUpload({ fileBuf: JPEG, fileName: 'e2.jpg' });
  assert(r2.status === 503 && r2.json.code === 'UPLOAD_SCOPE_MISSING', 'G2 WPS 403 scope -> 503 UPLOAD_SCOPE_MISSING', JSON.stringify(r2.json));
  addressFailMode = null;
}

console.log('===== leak scan =====');
{
  const joined = allBodies.join('\n');
  const checks = [
    ['wps app token', !joined.includes(WPS_APP_TOKEN)],
    ['wps app secret', !joined.includes('mock-app-secret')],
    ['session secret', !joined.includes(SESSION_SECRET)],
    ['session token leak', !joined.includes(SESSION)],
    ['etag/newfilename not echoed', !joined.includes('abc123') && !joined.includes('stored-key-1')],
  ];
  for (const [n, c] of checks) assert(c, `leak-scan: ${n}`, c ? '' : 'LEAK');
}

console.log(`\n===== RESULT: ${pass} PASS_MOCK, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
