// CF-WPS-13 阶段B 只读探测：列出 cn229thwalDs 全部 Sheet 及字段结构（零写入）
import { readFileSync } from 'node:fs';

const envText = readFileSync(new URL('../../../server/.env', import.meta.url), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) envVar[m[1]] = m[2].trim(); }
const APP_ID = envVar.WPS_APP_ID, APP_SECRET = envVar.WPS_APP_SECRET;
const BASE = envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn';
const FILE_ID = 'cn229thwalDs';

if (!APP_ID || !APP_SECRET) { console.error('[GUARD] missing credentials'); process.exit(1); }

const tr = await fetch(`${BASE}/oauth2/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: APP_SECRET }).toString(),
  signal: AbortSignal.timeout(25000),
});
const tj = await tr.json().catch(() => ({}));
if (!tj.access_token) { console.log('TOKEN_FAIL ' + tr.status); process.exit(1); }

const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/schema`, {
  headers: { Authorization: `Bearer ${tj.access_token}` }, signal: AbortSignal.timeout(25000),
});
const j = await res.json().catch(() => ({}));
if (!res.ok || j.code !== 0) { console.log('SCHEMA_FAIL', res.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }

for (const s of (j.data?.sheets || [])) {
  console.log(`\n=== sheet_id=${s.id} 「${s.name}」 records=${s.records_count} ===`);
  for (const f of (s.fields || [])) {
    console.log(`  [${f.id}] ${f.name} (${f.type})`);
  }
}
