/* CF-WPS-20: cleanup leftover seeded S14 rows from preflight (部门/职位 为空 + 今日创建 + 138 手机) */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const envText = readFileSync(path.join(ROOT, '../server/.env'), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) envVar[m[1]] = m[2].trim(); }
const APP_ID = envVar.WPS_APP_ID, APP_SECRET = envVar.WPS_APP_SECRET;
const BASE = (envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, '');
const FILE_ID = 'cn229thwalDs';

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

const recs = await scanSheet(14);
const today = new Date().toISOString().slice(0, 10);
const suspects = recs.filter((r) => {
  const f = r.fields;
  const dept = String(f['部门'] ?? '').trim(), pos = String(f['职位'] ?? '').trim();
  const phone = String(f['手机号码'] ?? '').trim();
  const created = String(f['创建时间'] ?? '').trim();
  return phone.startsWith('138') && dept === '' && pos === '' && created === today;
});
console.log('S14 total =', recs.length, '| seeded leftovers =', suspects.length);
if (suspects.length) {
  const ids = suspects.map((s) => s.id);
  const dr = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/14/records/batch_delete`, { records: ids.map(String) });
  console.log('batch_delete:', dr.status, 'code=', dr.json?.code, 'deleted=', ids.length);
}
const after = (await scanSheet(14)).length;
console.log('S14 after =', after);
