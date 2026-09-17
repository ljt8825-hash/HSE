// CF-WPS-12B 一次性探测：/v7/coop/dbsheet/{file_id}/attachments/upload
// 纪律（任务书 §六）：官方公开文档无该端点 schema → DBSHEET_ATTACHMENT_UPLOAD_SCHEMA=UNAVAILABLE
// 仅允许一次无副作用的 OPTIONS 探测；不得猜 schema、不得发 POST。
// 凭证仅从 server/.env 进入内存；本脚本不打印任何 secret/token。
import { readFileSync } from 'node:fs';

const envText = readFileSync(new URL('../../../server/.env', import.meta.url), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) envVar[m[1]] = m[2].trim(); }
const APP_ID = envVar.WPS_APP_ID, APP_SECRET = envVar.WPS_APP_SECRET;
const BASE = envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn';
const FILE_ID = 'cn229thwalDs';

if (!APP_ID || !APP_SECRET) { console.error('[GUARD] missing credentials'); process.exit(1); }

// client_credentials token（仅进内存）
const tr = await fetch(`${BASE}/oauth2/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: APP_SECRET }).toString(),
  signal: AbortSignal.timeout(25000),
});
const tj = await tr.json().catch(() => ({}));
if (!tj.access_token) { console.log('TOKEN_FAIL status=' + tr.status); process.exit(1); }

// ⭐ 唯一一次请求：OPTIONS（无副作用）
const url = `${BASE}/v7/coop/dbsheet/${FILE_ID}/attachments/upload`;
const res = await fetch(url, {
  method: 'OPTIONS',
  headers: { Authorization: `Bearer ${tj.access_token}` },
  signal: AbortSignal.timeout(25000),
});
const bodyText = await res.text();
const safeBody = bodyText.length > 600 ? bodyText.slice(0, 600) + '...' : bodyText;
console.log('=== OPTIONS /v7/coop/dbsheet/{file_id}/attachments/upload ===');
console.log('status:', res.status);
console.log('allow:', res.headers.get('allow'));
console.log('content-type:', res.headers.get('content-type'));
console.log('body:', safeBody);

// token 不落盘：仅输出是否包含 secret 的负向断言
const joined = `${res.status}|${safeBody}`;
console.log('leakcheck_appsecret:', !joined.includes(APP_SECRET));
