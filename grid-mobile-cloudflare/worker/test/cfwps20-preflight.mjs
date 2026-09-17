/* CF-WPS-20 PREFLIGHT: bcrypt cost=10 on REAL Cloudflare Workers runtime.
 * 播种 1 个测试身份 → 公网 Worker 真实登录（bcrypt cost=10）→ 记录耗时/错误 → 清理。
 * 仅写 Sheet13(无)/Sheet14 播种行；不写 Sheet3/11/15。
 * Run: node test/cfwps20-preflight.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const envText = readFileSync(path.join(ROOT, '../server/.env'), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) envVar[m[1]] = m[2].trim(); }
const APP_ID = envVar.WPS_APP_ID, APP_SECRET = envVar.WPS_APP_SECRET;
const BASE = (envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, '');
const FILE_ID = 'cn229thwalDs';
const PUBLIC_ORIGIN = 'https://grid-mobile-cloudflare.pages.dev';

async function wps(p, body, method) {
  const tr = await fetch(`${BASE}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: APP_SECRET }).toString() });
  const tj = await tr.json().catch(() => ({}));
  const res = await fetch(`${BASE}${p}`, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tj.access_token}` }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function scanSheet(sheetId, maxPages = 50) {
  const out = [];
  for (let p = 1; p <= maxPages; p++) {
    const r = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/list_by_page`, { page_num: p, page_size: 200 });
    const recs = r.json?.data?.records || [];
    for (const rec of recs) { let fv = rec.fields_value ?? rec.fields; try { if (typeof fv === 'string') fv = JSON.parse(fv); } catch { fv = {}; } out.push({ id: rec.id, fields: fv }); }
    if (recs.length < 200) break; await sleep(120);
  }
  return out;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const roster = await scanSheet(11);
  const cand = roster.find((r) => { const c = String(r.fields['员工编码'] || '').trim(); const st = String(r.fields['用工关系状态'] || ''); const a = String(r.fields['负责区域（在职）'] || '').trim(); return c && st && !st.includes('离职') && a && a !== '0'; });
  const CAND_CODE = String(cand.fields['员工编码']).trim();
  const TEST_PHONE = '138' + String(Date.now()).slice(-8);
  const TEST_PWD = 'Cf20pre!' + Date.now().toString().slice(-4);
  const seedRes = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/14/records/create`, { prefer_id: false, records: [{ fields_value: JSON.stringify({ employee_code: CAND_CODE, 姓名: String(cand.fields['姓名'] || ''), 手机号码: TEST_PHONE, password_hash: bcrypt.hashSync(TEST_PWD, 10), 部门: '', 职位: '', 身份状态: '正常', 创建时间: new Date().toISOString().slice(0, 10) }) }] });
  console.log('seed S14:', seedRes.status, 'code=', seedRes.json?.code);
  const seedId = seedRes.json?.data?.records?.[0]?.id;
  await sleep(800);

  const t0 = Date.now();
  const lr = await fetch(`${PUBLIC_ORIGIN}/api/mobile/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: TEST_PHONE, password: TEST_PWD }), signal: AbortSignal.timeout(90000) });
  const dt = Date.now() - t0;
  const ltext = await lr.text();
  let summary;
  try { const lj = JSON.parse(ltext); summary = JSON.stringify({ success: lj.success, code: lj.code, msg: (lj.message || '').slice(0, 60), hasToken: !!lj.token, keys: Object.keys(lj).slice(0, 8) }); }
  catch { summary = 'NON_JSON status=' + lr.status + ' head=' + ltext.replace(/\s+/g, ' ').slice(0, 120); }
  console.log(`PUBLIC LOGIN (bcrypt cost=10): HTTP ${lr.status} wall=${dt}ms`);
  console.log('body:', summary);

  if (seedId) await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/14/records/batch_delete`, { records: [String(seedId)] });
  const s14 = (await scanSheet(14)).length;
  console.log('cleanup done, S14 count =', s14);
} catch (e) {
  console.error('PREFLIGHT ERROR:', String(e && e.stack || e).slice(0, 400));
  process.exit(1);
}
