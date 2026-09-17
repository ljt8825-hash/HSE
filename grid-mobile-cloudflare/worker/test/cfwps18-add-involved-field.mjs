// CF-WPS-18 §四/§五：为「生产用台账」(cn229thwalDs / sheet 15) 增量新增「涉及人员」字段。
// 严格原则：只新增、不修改/不删除任何现有字段；幂等（先查重再创建）。
// 体限制：生产记录写入开关保持 false，本脚本只改 schema，绝不写业务记录。
import { readFileSync } from 'node:fs';

const envText = readFileSync(new URL('../../../server/.env', import.meta.url), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) envVar[m[1]] = m[2].trim();
}
const APP_ID = envVar.WPS_APP_ID, APP_SECRET = envVar.WPS_APP_SECRET;
const BASE = (envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, '');
const FILE_ID = 'cn229thwalDs';
const SHEET_ID = '15';

if (!APP_ID || !APP_SECRET) { console.error('[GUARD] missing WPS creds'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getToken() {
  const tr = await fetch(`${BASE}/oauth2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: APP_SECRET }).toString(),
    signal: AbortSignal.timeout(25000),
  });
  const tj = await tr.json().catch(() => ({}));
  if (!tj.access_token) { console.error('TOKEN_FAIL', tr.status, JSON.stringify(tj).slice(0, 200)); process.exit(1); }
  return tj.access_token;
}

async function getSchema(token) {
  const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/schema`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.code !== 0) { console.error('SCHEMA_FAIL', res.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
  return j.data;
}

async function findSheet(token) {
  const data = await getSchema(token);
  const s = (data.sheets || []).find((x) => String(x.id) === String(SHEET_ID));
  if (!s) { console.error('SHEET15_NOT_FOUND'); process.exit(1); }
  return s;
}

// CF-WPS-18 §二：涉及人员，MultiLineText，最多 200 字符（长度由 Worker 校验，schema 不强制）
const TARGET_FIELDS = [
  { name: '涉及人员', type: 'MultiLineText' },
];

async function main() {
  const token = await getToken();
  const sheet = await findSheet(token);
  console.log(`\n=== 现有 Sheet 15「${sheet.name}」字段（${sheet.fields.length} 个，records=${sheet.records_count}）===\n`);
  const existing = new Map();
  for (const f of sheet.fields) {
    existing.set(f.name, f);
    console.log(`  [${f.id}] ${f.name} (${f.type})`);
  }
  console.log('\n=== 增量新增（只加不存在的）===\n');
  const created = [], skipped = [], failed = [];
  for (const tf of TARGET_FIELDS) {
    if (existing.has(tf.name)) {
      const ef = existing.get(tf.name);
      const ok = ef.type === tf.type;
      skipped.push({ ...tf, id: ef.id, typeMatch: ok });
      console.log(`  SKIP  ${tf.name} 已存在 [${ef.id}] (${ef.type})${ok ? '' : '  ⚠类型不匹配(期望 ' + tf.type + ')'}`);
      continue;
    }
    try {
      const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/sheets/${SHEET_ID}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fields: [{ name: tf.name, type: tf.type }] }),
        signal: AbortSignal.timeout(25000),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.code !== 0) {
        failed.push({ ...tf, status: res.status, msg: JSON.stringify(j).slice(0, 200) });
        console.log(`  FAIL  ${tf.name} (${tf.type}) -> HTTP ${res.status} ${JSON.stringify(j).slice(0, 200)}`);
      } else {
        created.push(tf);
        console.log(`  CREATE ${tf.name} (${tf.type}) -> OK`);
      }
    } catch (e) {
      failed.push({ ...tf, err: String(e).slice(0, 120) });
      console.log(`  ERROR ${tf.name} -> ${String(e).slice(0, 120)}`);
    }
    await sleep(300);
  }

  // 读回验证
  console.log('\n=== 读回验证（POST-create 后再 GET schema）===\n');
  const sheet2 = await findSheet(token);
  const finalMap = new Map();
  for (const f of sheet2.fields) finalMap.set(f.name, f);
  let allOk = true;
  for (const tf of TARGET_FIELDS) {
    const f = finalMap.get(tf.name);
    const ok = f && f.type === tf.type;
    if (!ok) allOk = false;
    console.log(`  ${ok ? 'PASS' : 'MISS'} ${tf.name} (期望 ${tf.type}) -> ${f ? `[${f.id}] (${f.type})` : '不存在'}`);
  }
  // §十 字段完整性：原 30 + CF-WPS-17 的 8 + 本阶段 1 = 39
  const added18 = created.length;
  const expected = sheet.fields.length + added18;
  console.log(`\n=== 汇总 ===`);
  console.log(`  创建前字段数: ${sheet.fields.length}`);
  console.log(`  创建后字段数: ${sheet2.fields.length}`);
  console.log(`  新增(本阶段): ${added18} / 跳过(已存在): ${skipped.length} / 失败: ${failed.length}`);
  console.log(`  完整性期望: ${expected} / 实际: ${sheet2.fields.length}`);
  console.log(`  SHEET15_EXISTING_FIELDS_UNTOUCHED = ${sheet2.fields.length === expected ? 'PASS' : 'CHECK'}`);
  // 输出实际 fieldId
  const inv = finalMap.get('涉及人员');
  if (inv) console.log(`  WPS_SHEET15_INVOLVED_PERSON_FIELD_ID = ${inv.id}`);
  console.log(`  INVOLVED_PERSON_FIELD_STATUS = ${allOk && failed.length === 0 && inv ? 'PASS' : 'BLOCKED'}`);
  console.log(`  FORMAL_SHEET_FIELD_STATUS = ${allOk && failed.length === 0 ? 'PASS' : 'BLOCKED'}`);
  process.exit(allOk && failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
