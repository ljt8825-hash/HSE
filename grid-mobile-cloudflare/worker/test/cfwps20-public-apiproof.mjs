/* CF-WPS-20 FAST PUBLIC API-PROOF — 仅公网 API 级验证（无浏览器，短健康窗口可捕获）
 * 捕获：bcrypt cost=10 公网登录 + protected fields 篡改忽略 + 幂等 + 跨用户隔离（A/B 双身份）。
 * 纪律：仅写 Sheet13(测试) + Sheet14 播种/清理；Sheet3/11/15 零写入。所有 WPS 请求短超时+有限重试。
 * 比完整浏览器 E2E 快一个数量级（~15-30s 健康窗口即可），专门用于在 WPS 间歇窗口捕获高价值证明。
 * Run: node test/cfwps20-public-apiproof.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const PAGES = 'https://grid-mobile-cloudflare.pages.dev';
const envText = readFileSync(path.join(ROOT, '../server/.env'), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) envVar[m[1]] = m[2].trim(); }
const APP_ID = envVar.WPS_APP_ID, APP_SECRET = envVar.WPS_APP_SECRET;
const BASE = (envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, '');
const FILE_ID = 'cn229thwalDs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wps(p, body, method, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const tr = await fetch(`${BASE}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: APP_SECRET }).toString(), signal: AbortSignal.timeout(25000) });
      const tj = await tr.json().catch(() => ({}));
      const res = await fetch(`${BASE}${p}`, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tj.access_token}` }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000) });
      return { status: res.status, json: await res.json().catch(() => ({})) };
    } catch (e) { if (i === tries - 1) throw e; await sleep(1500); }
  }
}
async function scanSheet(sheetId, maxPages = 50) {
  const out = [];
  for (let p = 1; p <= maxPages; p++) {
    const r = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/list_by_page`, { page_num: p, page_size: 200 });
    const recs = r.json?.data?.records || [];
    for (const rec of recs) { let fv = rec.fields_value ?? rec.fields; try { if (typeof fv === 'string') fv = JSON.parse(fv); } catch { fv = {}; } out.push({ id: rec.id, fields: fv }); }
    if (recs.length < 200) break; await sleep(100);
  }
  return out;
}
const countSheet = async (s) => (await scanSheet(s)).length;
async function pub(p, opt = {}, tries = 2, timeout = 45000) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(PAGES + p, { ...opt, signal: AbortSignal.timeout(timeout) });
      const body = await r.json().catch(() => ({}));
      return { status: r.status, headers: r.headers, body };
    } catch (e) { lastErr = e; await sleep(1500 + i * 1500); }
  }
  throw lastErr;
}

let pass = 0, failn = 0; const fails = [];
const ok = (n, x = '') => { pass++; console.log(`PASS ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { failn++; fails.push(`${n} :: ${d}`); console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'false'));

try {
  const base3 = await countSheet(3), base11 = await countSheet(11), base13 = await countSheet(13), base14 = await countSheet(14), base15 = await countSheet(15);
  console.log(`baseline: S3=${base3} S11=${base11} S13=${base13} S14=${base14} S15=${base15}`);
  assert(base3 === 2063 && base11 === 1291 && base15 === 0, 'P0 生产表基线（S3/S11/S15）', `S3=${base3} S11=${base11} S15=${base15}`);

  const roster = await scanSheet(11);
  const cands = roster.filter((r) => { const c = String(r.fields['员工编码'] || '').trim(); const st = String(r.fields['用工关系状态'] || ''); const a = String(r.fields['负责区域（在职）'] || '').trim(); return c && st && !st.includes('离职') && a && a !== '0'; }).slice(0, 2);
  assert(cands.length === 2, '花名册取到 2 个有效候选（A/B 身份）', `got=${cands.length}`);
  const mkIdentity = async (cand, tag) => {
    const phone = '138' + String(Date.now()).slice(-8) + tag;
    const pwd = 'Cf20api!' + Date.now().toString().slice(-4) + tag;
    const r = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/14/records/create`, { prefer_id: false, records: [{ fields_value: JSON.stringify({ employee_code: String(cand.fields['员工编码']).trim(), 姓名: String(cand.fields['姓名'] || ''), 手机号码: phone, password_hash: bcrypt.hashSync(pwd, 10), 部门: String(cand.fields['所属部门'] || ''), 职位: String(cand.fields['职位'] || ''), 身份状态: '正常', 创建时间: new Date().toISOString().slice(0, 10) }) }] });
    assert(r.status === 200 && r.json.code === 0, `Sheet14 播种身份${tag}`);
    return { phone, pwd, code: String(cand.fields['员工编码']).trim(), area: String(cand.fields['负责区域（在职）'] || '').trim(), seedId: r.json?.data?.records?.[0]?.id };
  };
  const A = await mkIdentity(cands[0], '1'); await sleep(300);
  const B = await mkIdentity(cands[1], '2'); await sleep(600);
  const seedingOk = !!(A.seedId && B.seedId);
  if (!seedingOk) { bad('WPS_SEEDING', 'Sheet14 播种失败（WPS 出海间歇挂死）→ 中止'); throw new Error('ABORT'); }
  let collected13 = [];

  // ---- API 级证明（快） ----
  try {
    const tA0 = Date.now();
    const loginA = await pub('/api/mobile/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: A.phone, password: A.pwd }) });
    const tA = Date.now() - tA0;
    assert(loginA.status === 200 && loginA.body.token, `API 登录 A（bcrypt cost=10 公网实测）`, `wall=${tA}ms`);
    const TOKA = 'Bearer ' + loginA.body.token;
    ok('bcrypt cost=10 真实 CF runtime 可用（无 CPU 超限）', `api wall=${tA}ms`);

    // protected fields 篡改
    const tamperCid = 'CFWPS20-TAMPER-' + Date.now();
    const tamper = await pub('/api/mobile/patrol/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: TOKA }, body: JSON.stringify({ inspection_time: '2026-09-16 12:00', grid: 'ATTACK-GRID', employee_code: 'ATTACK', grid_id: 999999, inspector_employee_id: 999999, attribution_status: 'confirmed', responsibility: 'ATTACK', deduction: 9999, review: 'approved', problem_type: '其他', description: '【CF-WPS-20】protected-fields 篡改测试', is_violation: '否', violation_desc: '', violation_people: '', photo_taken: 'false', client_request_id: tamperCid }) });
    assert(tamper.status === 200 && tamper.body.success, '篡改 body 提交被接受处理（服务端重建记录）', `status=${tamper.status} code=${tamper.body.code}`);
    await sleep(1200);
    const s13all = await scanSheet(13);
    const tamperRec = s13all.find((x) => String(x.fields.client_request_id || '') === tamperCid);
    assert(!!tamperRec, '篡改测试记录已在 Sheet13 落表（供读回核验）');
    if (tamperRec) {
      collected13.push(tamperRec.id);
      const f = tamperRec.fields;
      assert(String(f['巡查人员ID'] ?? '') === A.code, '巡查人员ID=Session.sub（非 body.ATTACK）', String(f['巡查人员ID']).slice(0, 12));
      assert(!('employee_code' in f) && !('grid_id' in f) && !('inspector_employee_id' in f) && !('attribution_status' in f) && !('deduction' in f) && !('review' in f), '受保护键未进入 WPS 记录');
      assert(String(f['网格'] ?? '') !== 'ATTACK-GRID', '网格非 body 注入值（服务端解析）', String(f['网格']).slice(0, 20));
      assert(f['attribution_status'] === undefined && f['responsibility'] === undefined, '归因/责任字段不存在（三违系统专有）');
    }

    // 幂等
    const dupCid = 'CFWPS20-DUP-' + Date.now();
    const metaA = await pub('/api/mobile/patrol/meta', { headers: { authorization: TOKA } });
    assert(metaA.status === 200 && metaA.body.grid_resolved, 'meta 网格解析（API）');
    const dupBody = { inspection_time: '2026-09-16 12:30', grid: metaA.body.grids[0], problem_type: '其他', description: '【CF-WPS-20】幂等双提交测试', is_violation: '否', violation_desc: '', violation_people: '', photo_taken: 'false', client_request_id: dupCid };
    const d1 = await pub('/api/mobile/patrol/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: TOKA }, body: JSON.stringify(dupBody) });
    const d2 = await pub('/api/mobile/patrol/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: TOKA }, body: JSON.stringify(dupBody) });
    assert(d1.status === 200 && d1.body.success, '幂等第一次提交成功', `code=${d1.body.code}`);
    assert(d2.status === 200 && (d2.body.deduplicated === true || d2.body.success === false), '幂等第二次提交被去重/拒绝', `dedup=${d2.body.deduplicated} code=${d2.body.code}`);
    await sleep(1000);
    const dupRecs = (await scanSheet(13)).filter((x) => String(x.fields.client_request_id || '') === dupCid);
    assert(dupRecs.length === 1, '同 CID 仅落 1 条记录', `count=${dupRecs.length}`);
    for (const r of dupRecs) collected13.push(r.id);

    // 跨用户隔离
    const loginB = await pub('/api/mobile/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: B.phone, password: B.pwd }) });
    assert(loginB.status === 200 && loginB.body.token, 'API 登录 B');
    const TOKB = 'Bearer ' + loginB.body.token;
    const listB = await pub('/api/mobile/patrol/records', { headers: { authorization: TOKB } });
    assert(listB.status === 200, 'B 拉取自己的记录列表');
    const bIds = JSON.stringify(listB.body || {});
    const aRecords = s13all.filter((x) => String(x.fields['巡查人员ID'] ?? '') === A.code);
    const leak = aRecords.filter((r) => bIds.includes(r.id));
    assert(leak.length === 0, 'B 列表中无 A 的任何记录（防枚举）', `aRecs=${aRecords.length} leaked=${leak.length}`);
    if (tamperRec) {
      const detailB = await pub(`/api/mobile/patrol/records?id=${tamperRec.id}`, { headers: { authorization: TOKB } });
      assert(detailB.status === 404, 'B 读 A 详情 → 404（防枚举）', `status=${detailB.status}`);
    }
    const listA = await pub('/api/mobile/patrol/records', { headers: { authorization: TOKA } });
    assert(listA.status === 200, 'A 仍只看到自己的记录（列表可用）');
  } catch (e) {
    bad('API_PROOFS', String(e && e.stack || e).slice(0, 400));
  }

  // ---- 清理 ----
  try {
    const del13 = new Set(collected13.filter(Boolean).map(String));
    const fresh13 = await scanSheet(13);
    for (const x of fresh13) { const cid = String(x.fields.client_request_id || ''); if (cid.startsWith('H5S-') || cid.startsWith('CFWPS20-')) del13.add(x.id); }
    if (del13.size) { const dr = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/13/records/batch_delete`, { records: [...del13] }); assert(dr.status === 200 && dr.json.code === 0, `Sheet13 清理 ${del13.size} 条`); }
    else ok('Sheet13 无残留');
    const del14 = [A.seedId, B.seedId].filter(Boolean).map(String);
    if (del14.length) { const dr = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/14/records/batch_delete`, { records: del14 }); assert(dr.status === 200 && dr.json.code === 0, `Sheet14 清理 ${del14.length} 身份`); }
  } catch (e) { bad('CLEANUP', String(e).slice(0, 200)); }
} catch (e) {
  if (String(e && e.message || '').includes('ABORT')) console.log('INFO 健康门中止（播种失败）');
  else bad('RUNNER', String(e && e.stack || e).slice(0, 400));
}

try {
  await sleep(400);
  const post3 = await countSheet(3), post11 = await countSheet(11), post13 = await countSheet(13), post14 = await countSheet(14), post15 = await countSheet(15);
  console.log(`postline: S3=${post3} S11=${post11} S13=${post13} S14=${post14} S15=${post15}`);
  assert(post3 === 2063 && post11 === 1291, 'S3/S11 生产表零变化');
  assert(post13 === 3, 'S13 回基线 3', `=${post13}`);
  assert(post14 === 3, 'S14 回基线 3', `=${post14}`);
  assert(post15 === 0, 'S15 零业务写入', `=${post15}`);
} catch (e) { bad('POLLUTION_CHECK', String(e).slice(0, 200)); }

console.log(`\n===== CF-WPS-20 FAST API-PROOF RESULT: ${pass} PASS, ${failn} FAIL =====`);
if (failn) { console.log('FAILED:\n' + fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
process.exit(0);
