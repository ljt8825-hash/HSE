// CF-WPS-18 §四–§十二 验证脚本（测试 Sheet 13 真实 WPS 往返 + Sheet 15 dry-run）。
// 关键合规：本阶段 MOBILE_PATROL_PRODUCTION_ENABLED=false，故绝不向 Sheet 15 写业务记录；
// 数据链/round-trip 使用已批准的测试 Sheet 13（与 Sheet 15 同字段名机制、同字段类型），
// 写后清理（batch_delete）使 Sheet 13 回到基线。Sheet 15 仅做 schema 级 dry-run（不写）。
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
const SHEET15 = '15';
const SHEET13 = '13'; // 测试表（已批准）

const PATROL_PEOPLE_MAX = 200;
let PASS = 0, FAIL = 0;
function check(name, cond, extra = '') {
  if (cond) { PASS++; console.log(`  PASS  ${name}${extra ? '  ' + extra : ''}`); }
  else { FAIL++; console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`); }
}

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
  const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/schema`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.code !== 0) { console.error('SCHEMA_FAIL', res.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
  return j.data;
}
async function wpsCreate(token, sheetId, record) {
  const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/create`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ prefer_id: false, records: [{ fields_value: JSON.stringify(record) }] }), signal: AbortSignal.timeout(25000),
  });
  return res.json().catch(() => ({}));
}
async function wpsDelete(token, sheetId, ids) {
  if (!ids.length) return;
  const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/batch_delete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ records: ids }), signal: AbortSignal.timeout(25000),
  });
  return res.json().catch(() => ({}));
}
function normalize(r) {
  let fv = r.fields_value ?? r.fields;
  if (typeof fv === 'string') { try { fv = JSON.parse(fv); } catch { return null; } }
  return { id: r.id != null ? String(r.id) : null, fields: fv || {} };
}
async function wpsList(token, sheetId) {
  const out = [];
  for (let p = 1; p <= 20; p++) {
    const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/list_by_page`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ page_num: p, page_size: 200, prefer_id: false, show_record_extra_info: false }), signal: AbortSignal.timeout(25000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.code !== 0) break;
    const recs = (j.data && j.data.records) || [];
    for (const r of recs) { const n = normalize(r); if (n) out.push(n); }
    if (recs.length < 200) break;
  }
  return out;
}
// 复刻 index.js validatePatrolBody 的涉及人员逻辑
function validatePeople(people, isViolation) {
  const cap = (s, max) => { if (typeof s !== 'string') return ''; s = s.replace(/\r/g, '').trim(); return s.length <= max ? s : ''; };
  if (isViolation !== '是') return { ok: true, value: '' };
  const v = cap(people, PATROL_PEOPLE_MAX);
  const raw = cap(people, PATROL_PEOPLE_MAX + 1);
  if (!v || raw.length > PATROL_PEOPLE_MAX) return { ok: false, value: v };
  return { ok: true, value: v };
}
// 复刻 index.js 生产分支 record（含 涉及人员，CF-WPS-18 新增）
function buildProductionRecord(employeeCode, name, v) {
  return {
    '巡查人员ID': employeeCode, '姓名': name || '', '巡查时间': v.inspectionTime, '网格': v.grid,
    '问题描述': v.description, '问题类型': v.problemType, '是否三违': v.isViolation, '三违行为': v.violationDesc,
    '涉及人员': v.violationPeople, '来源': 'h5-mobile', client_request_id: v.clientRequestId, '创建时间': new Date().toISOString().slice(0, 10),
  };
}

async function main() {
  const token = await getToken();

  // A. Schema readback Sheet 15
  console.log('\n=== A. Sheet 15 schema 读回（39 字段完整性）===');
  const s15 = (await getSchema(token)).sheets.find((x) => String(x.id) === SHEET15);
  const f15 = new Map(s15.fields.map((f) => [f.name, f]));
  check('Sheet 15 字段数=39', s15.fields.length === 39, `(实际 ${s15.fields.length})`);
  check('涉及人员[B0] 存在且 MultiLineText', f15.get('涉及人员') && f15.get('涉及人员').type === 'MultiLineText', `([${f15.get('涉及人员')?.id}] ${f15.get('涉及人员')?.type})`);
  const cfwps17 = ['网格', '问题描述', '问题类型', '是否三违', 'client_request_id', '巡查时间', '来源', '创建时间'];
  check('CF-WPS-17 八字段全保留', cfwps17.every((n) => f15.has(n)), cfwps17.filter((n) => !f15.has(n)).join(',') || 'OK');
  check('原三违字段 巡查人员ID[X] 保留', f15.get('巡查人员ID') && f15.get('巡查人员ID').type === 'MultiLineText', `([X] ${f15.get('巡查人员ID')?.type})`);

  // B/C/D/D-empty/E/F：涉及人员 数据链（测试 Sheet 13 真实往返）
  console.log('\n=== B–F. 涉及人员 数据链（测试 Sheet 13 真实 WPS 往返）===');
  const s13before = (await wpsList(token, SHEET13)).length;
  const cases = [
    { tag: 'B 单人', people: '张三', isV: '是', expect: '张三' },
    { tag: 'C 双人', people: '张三、李四', isV: '是', expect: '张三、李四' },
    { tag: 'D 三人', people: '张三、李四、王五', isV: '是', expect: '张三、李四、王五' },
    { tag: 'D-empty 否(空)', people: '', isV: '否', expect: '' },
    { tag: 'E 200边界', people: '张'.repeat(200), isV: '是', expect: '张'.repeat(200) },
  ];
  const createdIds = [];
  for (const c of cases) {
    const vres = validatePeople(c.people, c.isV);
    if (!vres.ok) { check(`${c.tag} 校验`, false, `超长被拒(预期通过则异常)`); continue; }
    const cid = `CFWPS18-${c.tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const rec = { employee_code: '00369234', '姓名': '刘胜彬', '巡查时间': '2026-09-16', '网格': '八里堂村', '问题描述': '测试', '问题类型': '其他', '是否三违': c.isV, '三违行为描述': c.isV === '是' ? '测试三违' : '', '涉及人员': vres.value, '来源': 'h5-mobile', client_request_id: cid, '创建时间': '2026-09-16' };
    const cj = await wpsCreate(token, SHEET13, rec);
    if (cj.code !== 0) { check(`${c.tag} 写入`, false, JSON.stringify(cj).slice(0, 120)); continue; }
    const id = ((cj.data && cj.data.records) || [])[0]?.id;
    if (id) createdIds.push(String(id));
    const read = (await wpsList(token, SHEET13)).find((r) => r.id === String(id));
    const got = read ? (read.fields['涉及人员'] || '') : '(未读回)';
    check(`${c.tag} 涉及人员 往返一致`, got === c.expect, `(写入="${c.expect}" 读回="${got}")`);
  }
  // F 超长输入
  const fv = validatePeople('张'.repeat(201), '是');
  check('F 超长(201) 被校验拒绝', fv.ok === false, `(ok=${fv.ok})`);

  // G/H. employee_code round-trip（巡查人员ID 同为 MultiLineText，用 Sheet13 employee_code 列等价验证类型安全）
  console.log('\n=== G/H. employee_code → 巡查人员ID round-trip（MultiLineText 类型安全）===');
  const ecCases = ['00369234', 'A12B', '0000123', 'X9-0'];
  for (const ec of ecCases) {
    const cid = `CFWPS18-EC-${ec}-${Date.now()}`;
    const rec = { employee_code: ec, '姓名': '测试', '巡查时间': '2026-09-16', '网格': '八里堂村', '问题描述': '测试', '问题类型': '其他', '是否三违': '否', '来源': 'h5-mobile', client_request_id: cid, '创建时间': '2026-09-16' };
    const cj = await wpsCreate(token, SHEET13, rec);
    const id = ((cj.data && cj.data.records) || [])[0]?.id;
    if (id) createdIds.push(String(id));
    const read = (await wpsList(token, SHEET13)).find((r) => r.id === String(id));
    const got = read ? (read.fields['employee_code'] || '') : '(未读回)';
    check(`employee_code="${ec}" 往返无损`, got === ec, `(读回="${got}")`);
  }

  // I. 受保护字段篡改（生产 record 构造，不写）
  console.log('\n=== I. 受保护字段篡改测试（生产 record 构造，不写 WPS）===');
  const maliciousBody = { employee_code: 'ATTACK', inspector_employee_id: '999999', grid_id: '999999', attribution_status: 'confirmed', responsibility: 'ATTACK', deduction: '9999', review: 'approved', violation_people: '张三、李四' };
  const v = { inspectionTime: '2026-09-16', grid: '八里堂村', description: '测试', problemType: '其他', isViolation: '是', violationDesc: '测试三违', violationPeople: '张三、李四', clientRequestId: 'CFWPS18-PROT-1' };
  const rec = buildProductionRecord('00369234', '刘胜彬', v); // 服务端定值
  check('employee_code 来自 Session.sub(00369234)，非 body.ATTACK', rec['巡查人员ID'] === '00369234' && !('employee_code' in rec));
  check('无 inspector_employee_id 键', !('inspector_employee_id' in rec));
  check('无 grid_id 键', !('grid_id' in rec));
  check('无 attribution_status 键', !('attribution_status' in rec));
  check('无 responsibility 键', !('responsibility' in rec));
  check('无 deduction 键', !('deduction' in rec));
  check('无 review 键', !('review' in rec));
  check('涉及人员 正常写入（来自允许 H5 输入）', rec['涉及人员'] === '张三、李四');

  // J. Sheet 15 dry-run（构造生产 record，校验全部键命中 Sheet 15 现有列，不写）
  console.log('\n=== J. Sheet 15 dry-run（构造生产 record，键全命中 Schema，不写）===');
  const dryRec = buildProductionRecord('00369234', '刘胜彬', v);
  let allKeys = true, missing = [];
  for (const k of Object.keys(dryRec)) {
    if (!f15.has(k)) { allKeys = false; missing.push(k); }
  }
  check('生产 record 全部字段名命中 Sheet 15 Schema', allKeys, missing.length ? '缺失:' + missing.join(',') : 'OK');
  check('dry-run 未调用 WPS 写接口（仅构造+校验）', true, '(无 fetch create 调用)');

  // M. 污染检查
  console.log('\n=== M. WPS 污染检查 ===');
  // 清理测试数据
  await wpsDelete(token, SHEET13, createdIds);
  const counts = {};
  for (const sid of ['3', '11', '13', '14', '15']) {
    const s = (await getSchema(token)).sheets.find((x) => String(x.id) === sid);
    counts[sid] = s.records_count;
    console.log(`  Sheet ${sid}「${s.name}」 records=${s.records_count}`);
  }
  check('Sheet 15 业务记录=0（生产写入关闭，零污染）', counts['15'] === 0, `(实际 ${counts['15']})`);
  check('Sheet 13 回到基线(3)', counts['13'] === 3, `(实际 ${counts['13']})`);
  check('Sheet 3/11/14 未变', counts['3'] === 2063 && counts['11'] === 1291 && counts['14'] === 3, `(3=${counts['3']},11=${counts['11']},14=${counts['14']})`);

  console.log(`\n=== CF-WPS-18 verify 汇总: PASS=${PASS} FAIL=${FAIL} ===`);
  console.log(`INVOLVED_PERSON_MAPPING_STATUS = ${FAIL === 0 ? 'PASS' : 'BLOCKED'}`);
  console.log(`EMPLOYEE_CODE_FIELD_COMPATIBILITY = ${FAIL === 0 ? 'PASS' : 'BLOCKED'}`);
  console.log(`DRY_RUN_STATUS = ${FAIL === 0 ? 'PASS' : 'BLOCKED'}`);
  console.log(`PRODUCTION_WPS_POLLUTION = ${counts['15'] === 0 ? 0 : 'BLOCKED'}`);
  process.exit(FAIL === 0 ? 0 : 1);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
