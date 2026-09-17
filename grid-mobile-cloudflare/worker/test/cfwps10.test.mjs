/* CF-WPS-10: offline tests for test-sheet target + idempotency pre-check + 413.
 * Mock upstream only — zero real WPS contact. Run: node test/cfwps10.test.mjs
 */
import assert from 'node:assert';
import { createHmac } from 'node:crypto';

const worker = (await import('../index.js')).default;
const { TEST_FIELD_WHITELIST, PROTECTED_FIELDS } = await import('../index.js');

const JWT_SECRET = 'cfwps10-test-secret';
const WPS_SECRET = 'cfwps10-wps-secret';
const MOCK_TOKEN = 'mock-token-c10';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function signJwt(payload) {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
}
const VALID_JWT = signJwt({ id: 249, username: '13900000001', role: 'grid_inspector', type: 'access', jti: 'c10', exp: Math.floor(Date.now() / 1000) + 300 });

function baseEnv(extra = {}) {
  return {
    WPS_CLIENT_ID: 'app_id_test',
    WPS_CLIENT_SECRET: WPS_SECRET,
    WPS_OPENAPI_BASE: 'https://mock-wps.example',
    WPS_DBSHEET_FILE_ID: 'file123',
    WPS_DBSHEET_SHEET_ID: '7',
    WPS_DBSHEET_TEST_SHEET_ID: '99',
    JWT_VERIFY_SECRET: JWT_SECRET,
    ALLOW_WPS_WRITE: 'true',
    CF_ALLOWED_ORIGINS: 'https://pages.example.com',
    ...extra,
  };
}

let upstreamCalls = [];
function installFetchMock({ listPageRecords = null } = {}) {
  upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    upstreamCalls.push({ url: u, init });
    if (u.includes('/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: MOCK_TOKEN, expires_in: 7200, token_type: 'Bearer' }), { status: 200 });
    }
    if (u.includes('/records/list_by_page')) {
      const recs = listPageRecords ? listPageRecords() : [];
      return new Response(JSON.stringify({ code: 0, data: { records: recs } }), { status: 200 });
    }
    if (u.includes('/records/create')) {
      return new Response(JSON.stringify({ code: 0, data: { records: [{ id: 'NEW1' }] } }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
}

function req(path, { body, auth, headers = {} } = {}) {
  const h = { ...headers };
  if (auth) h.authorization = `Bearer ${auth}`;
  if (body !== undefined) h['content-type'] = 'application/json';
  return new Request(`https://worker.example${path}`, { method: 'POST', headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

const TEST_BODY = {
  target: 'test',
  records: [{
    '测试编号': 'CF-WPS-10-TEST-0001',
    'employee_code': '00307234',
    '姓名': 'TEST曹周平',
    '巡查时间': '2026-09-15 20:00',
    '网格': 'TEST-GRID',
    '问题描述': 'CF-WPS-10 联调测试记录',
    '来源': 'worker_test',
    '测试状态': 'NEW',
    'client_request_id': 'CID-C10-0001',
    '创建时间': '2026-09-15 20:00',
    'grid_id': '133',                 // protected → stripped
    'inspector_employee_id': '6697',  // protected → stripped
    'attribution_status': 'pending',  // protected → stripped
    'target': 'hack',                 // meta in record → ignored
    '身份证号': 'X',                   // not in whitelist → stripped
  }],
};

let pass = 0;
function ok(name) { pass++; console.log(`PASS ${name}`); }

async function main() {
  // T1 target=test 未配置测试 Sheet → 503
  {
    installFetchMock();
    const r = await worker.fetch(req('/wps/records/create', { body: TEST_BODY, auth: VALID_JWT }), baseEnv({ WPS_DBSHEET_TEST_SHEET_ID: '' }));
    assert.equal(r.status, 503);
    const j = await r.json();
    assert.equal(j.code, 'TEST_SHEET_NOT_CONFIGURED');
    ok('T1 target=test 未配置测试 Sheet → 503 fail-closed');
  }

  // T2 target=test 正常创建：上游打测试 Sheet 99；employee_code 通过；保护字段/白名单外字段剥离
  {
    installFetchMock();
    const r = await worker.fetch(req('/wps/records/create', { body: TEST_BODY, auth: VALID_JWT }), baseEnv());
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual(j.recordIds, ['NEW1']);
    assert.ok(!j.deduplicated, 'first create must not be deduplicated');
    const createCall = upstreamCalls.find((c) => c.url.includes('/records/create'));
    assert.ok(createCall.url.includes('/sheets/99/records/create'), 'must target test sheet 99');
    const fv = JSON.parse(JSON.parse(createCall.init.body).records[0].fields_value);
    assert.equal(fv['employee_code'], '00307234', 'test sheet allows employee_code');
    assert.equal(fv['测试编号'], 'CF-WPS-10-TEST-0001');
    assert.ok(!('grid_id' in fv) && !('inspector_employee_id' in fv) && !('attribution_status' in fv), 'protected stripped');
    assert.ok(!('身份证号' in fv) && !('target' in fv), 'non-whitelist/meta stripped');
    assert.ok(!JSON.stringify(fv).includes('6697'), 'no protected value leaked');
    ok('T2 测试 Sheet 创建成功 + 白名单/保护字段/元字段正确');
  }

  // T3 幂等：list_by_page 已有同 client_request_id → deduplicated:true，不再调 create
  {
    installFetchMock({
      listPageRecords: () => [{
        id: 'EXIST9',
        fields_value: JSON.stringify({ client_request_id: 'CID-C10-0001', '测试编号': 'CF-WPS-10-TEST-0001' }),
      }],
    });
    const r = await worker.fetch(req('/wps/records/create', { body: TEST_BODY, auth: VALID_JWT }), baseEnv());
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.deduplicated, true);
    assert.deepEqual(j.recordIds, ['EXIST9']);
    assert.ok(!upstreamCalls.some((c) => c.url.includes('/records/create')), 'must NOT call upstream create on idempotent hit');
    ok('T3 幂等命中：同 client_request_id 不产生重复记录');
  }

  // T4 幂等未命中：正常创建
  {
    installFetchMock({ listPageRecords: () => [] });
    const r = await worker.fetch(req('/wps/records/create', { body: TEST_BODY, auth: VALID_JWT }), baseEnv());
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok(!j.deduplicated);
    assert.deepEqual(j.recordIds, ['NEW1']);
    ok('T4 幂等未命中：正常创建');
  }

  // T5 体超限 → 413
  {
    installFetchMock();
    const r = await worker.fetch(req('/wps/records/create', { body: { records: [{ a: 'b' }] }, auth: VALID_JWT, headers: { 'content-length': String(512 * 1024 + 1) } }), baseEnv());
    assert.equal(r.status, 413);
    const j = await r.json();
    assert.equal(j.code, 'BODY_TOO_LARGE');
    ok('T5 body 超限 → 413');
  }

  // T6 生产通道不变：无 target → sheet 7；employee_code 仍被剥离；巡查人员ID 通过
  {
    installFetchMock();
    const body = { records: [{ '巡查人员ID': '00307234', 'employee_code': '00307234', '姓名': '曹周平', 'grid_id': '133' }] };
    const r = await worker.fetch(req('/wps/records/create', { body, auth: VALID_JWT }), baseEnv());
    assert.equal(r.status, 200);
    const createCall = upstreamCalls.find((c) => c.url.includes('/records/create'));
    assert.ok(createCall.url.includes('/sheets/7/records/create'), 'production target unchanged');
    const fv = JSON.parse(JSON.parse(createCall.init.body).records[0].fields_value);
    assert.equal(fv['巡查人员ID'], '00307234');
    assert.ok(!('employee_code' in fv), 'production path still strips employee_code');
    assert.ok(!('grid_id' in fv));
    ok('T6 生产通道回归：目标/白名单/保护字段行为不变');
  }

  // T7 写开关对测试目标同样生效
  {
    installFetchMock();
    const r = await worker.fetch(req('/wps/records/create', { body: TEST_BODY, auth: VALID_JWT }), baseEnv({ ALLOW_WPS_WRITE: 'false' }));
    assert.equal(r.status, 403);
    ok('T7 ALLOW_WPS_WRITE=false 对测试目标同样 403');
  }

  // T8 白名单集合本身断言（防回退）
  {
    assert.ok(TEST_FIELD_WHITELIST.has('client_request_id') && TEST_FIELD_WHITELIST.has('employee_code'));
    assert.ok(PROTECTED_FIELDS.has('employee_code'));
    ok('T8 TEST 白名单包含 client_request_id/employee_code；employee_code 在 PROTECTED 集（生产剥离语义不变）');
  }

  console.log(`\n=== CF-WPS-10 offline tests: ${pass}/8 passed ===`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('FAIL', e && e.message);
  process.exit(1);
});
