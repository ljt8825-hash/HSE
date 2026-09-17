// CF-WPS-12A 真机实验 v2：OpenAPI 建记录 → webhook AirScript(DBCellValue base64) 写附件 → OpenAPI 回读
// 令牌仅经 process.env.AIRSCRIPT_TOKEN 进入内存；本文件不含任何密钥；日志不输出 base64 全文。
const WEBHOOK_URL = 'https://www.kdocs.cn/api/v3/ide/file/561113841660/script/V2-hjE94ZyOiwVvlZcdi9vgk/sync_task';
const FILE_ID = 'cn229thwalDs';
const SHEET_ID = '13';
const { readFileSync } = await import('node:fs');

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} :: ${detail}`);
}

let wpsToken = null;
async function getWpsToken() {
  if (wpsToken) return wpsToken;
  const envText = readFileSync('G:/hse-dashboard/server/.env', 'utf8');
  const envVar = {};
  for (const line of envText.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) envVar[m[1]] = m[2].trim(); }
  const BASE = envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn';
  const tr = await fetch(BASE + '/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: envVar.WPS_APP_ID, client_secret: envVar.WPS_APP_SECRET }).toString() });
  wpsToken = (await tr.json()).access_token;
  wpsBase = BASE;
  return wpsToken;
}
let wpsBase = null;

async function createRecordViaOpenApi(testNo) {
  const token = await getWpsToken();
  const res = await fetch(`${wpsBase}/v7/coop/dbsheet/${FILE_ID}/sheets/${SHEET_ID}/records/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ prefer_id: false, records: [{ fields_value: JSON.stringify({ 测试编号: testNo, employee_code: 'CF-WPS-12A-TEST', 测试状态: 'record-created', client_request_id: 'CID-12A-' + testNo, 创建时间: new Date().toISOString().slice(0, 10) }) }] }),
  });
  const j = await res.json().catch(() => null);
  const id = j?.data?.records?.[0]?.id;
  return { status: res.status, id: id ? String(id) : null, code: j?.code };
}

async function callAirScript(argv) {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'AirScript-Token': process.env.AIRSCRIPT_TOKEN },
    body: JSON.stringify({ Context: { argv } }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}
function unwrapScriptResult(json) {
  return json?.data?.result ?? json?.data?.result?.result ?? json?.data ?? json;
}

async function readBackRecord(recordId) {
  const token = await getWpsToken();
  const res = await fetch(`${wpsBase}/v7/coop/dbsheet/${FILE_ID}/sheets/${SHEET_ID}/records/list_by_page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ page_num: 1, page_size: 50 }),
  });
  const j = await res.json();
  for (const rec of (j?.data?.records || [])) {
    if (String(rec.id) !== String(recordId)) continue;
    let fv = rec.fields_value ?? rec.fields;
    if (typeof fv === 'string') { try { fv = JSON.parse(fv); } catch { return { parseError: true }; } }
    return fv;
  }
  return null;
}

async function runCase(tag, buf, fileName) {
  const testNo = `CF-WPS-12A-TEST-${tag}`;
  const cr = await createRecordViaOpenApi(testNo);
  if (!cr.id) { record(`[${tag}] OpenAPI建记录`, false, `HTTP ${cr.status} code=${cr.code}`); return null; }
  record(`[${tag}] OpenAPI建记录`, true, `recordId=${cr.id}`);

  const t0 = Date.now();
  // ⭐官方要求：fileData 必须是 Data URL 格式（data:<mime>;base64,xxx），纯 base64 会被当 URL 下载 → Invalid URL
  const mime = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
  const r = await callAirScript({ recordId: cr.id, fileName, fileData: dataUrl });
  const u = unwrapScriptResult(r.json);
  const logs = (r.json?.data?.logs || []).map((l) => l.args.join(' ')).filter((s) => !/base64|fileData/i.test(s));
  const diag = u?.diag || u?.result?.diag;
  const tried = u?.tried || u?.result?.tried;
  const anyOk = tried && tried.some((t) => t.ok && String(t.step).startsWith('S'));
  record(`[${tag}] AirScript setValue (${buf.length}B, ${Date.now() - t0}ms)`, !!anyOk, `tried=${JSON.stringify(tried)} | appKeys=${JSON.stringify((diag?.appKeys || []).slice(0, 20))} | Record=${diag?.Record} Sheets=${diag?.Sheets} DBCellValue=${diag?.DBCellValue}`);
  if (logs.length) console.log(`  logs: ${logs.join(' | ').slice(0, 400)}`);

  const fv = await readBackRecord(cr.id);
  const att = fv && fv['测试图片'];
  const attOk = Array.isArray(att) && att.length > 0 && att[0].uploadId;
  record(`[${tag}] API回读Attachment`, !!attOk, att ? JSON.stringify(att).slice(0, 260) : 'null/empty');
  return { recordId: cr.id, att };
}

const cases = [
  { tag: 'MIN-JPG', buf: Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmgA//9k=', 'base64'), name: 'cfwps12a-min.jpg' },
  { tag: 'MIN-PNG', buf: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'), name: 'cfwps12a-min.png' },
];

const only = process.argv[2];
for (const c of cases) {
  if (only && only !== c.tag && only !== 'PHONE') continue;
  await runCase(c.tag, c.buf, c.name);
}

if (!only || only === 'PHONE') {
  const buf = readFileSync('G:/hse-dashboard/5725acfec02298aa25d65af1764f5cbb.jpg');
  await runCase('PHONE', buf, 'cfwps12a-phone.jpg');
}

console.log('---');
console.log(`TOTAL ${results.filter((x) => x.ok).length}/${results.length} PASS`);
