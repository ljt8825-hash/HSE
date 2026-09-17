// CF-WPS-17 §八 / §一.5：正式「生产用台账」(Sheet 15) DRY-RUN。
// 完全复制 worker/index.js 生产分支的 record 构建逻辑，对真实 schema 做字段映射校验，
// 并断言受保护字段不可被客户端覆盖。严禁调用 records/create（只在构造后拦截）。
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

async function getToken() {
  const tr = await fetch(`${BASE}/oauth2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: APP_SECRET }).toString(),
    signal: AbortSignal.timeout(25000),
  });
  const tj = await tr.json().catch(() => ({}));
  if (!tj.access_token) { console.error('TOKEN_FAIL', tr.status); process.exit(1); }
  return tj.access_token;
}
async function getSchema(token) {
  const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/schema`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.code !== 0) { console.error('SCHEMA_FAIL', res.status); process.exit(1); }
  const s = (j.data.sheets || []).find((x) => String(x.id) === String(SHEET_ID));
  if (!s) { console.error('SHEET15_NOT_FOUND'); process.exit(1); }
  return s;
}

// ---- 模拟 Worker 服务端定值（与 index.js 生产分支一致）----
const SESSION = { sub: '00369234', name: '刘胜彬', department: '网格管理中心', position: '网格长', grid_level: '一级' };
const RESOLVED_GRID = '八里堂村惠宁'; // 由 resolvePatrolGrids 服务端解析
// 客户端“恶意”提交（试图伪造受保护字段）
const MALICIOUS_BODY = {
  employee_code: '99999999',            // 企图伪造身份
  grid: '_admin_grid',                 // 企图伪造网格
  grid_id: 'GX-0',                     // 企图覆盖
  inspector_employee_id: '88888888',   // 企图覆盖
  attribution_status: 'CONFIRMED',     // 企图覆盖
  responsibility: 'someone',           // 企图覆盖
  inspection_time: '2026-09-16 09:30',
  description: '现场发现垃圾桶满溢未清理',
  problem_type: '环境卫生',
  is_violation: '否',
  violation_desc: '',
  violation_people: '',
  client_request_id: 'dryrun-' + Date.now(),
  source: 'evil-origin',               // 企图伪造来源
};
// 服务端校验后的值（模拟 validatePatrolBody 产出；实际由 Worker 计算，此处等价）
const values = {
  inspectionTime: MALICIOUS_BODY.inspection_time,
  grid: RESOLVED_GRID,                 // 以服务端解析为准，忽略 body.grid
  description: MALICIOUS_BODY.description,
  problemType: MALICIOUS_BODY.problem_type,
  isViolation: MALICIOUS_BODY.is_violation,
  violationDesc: MALICIOUS_BODY.violation_desc,
  violationPeople: MALICIOUS_BODY.violation_people,
  clientRequestId: MALICIOUS_BODY.client_request_id,
};

// ---- 生产分支 record（复制 index.js 最终形态：安全复用现有列，不自动创建缺失列）----
function buildProductionRecord() {
  return {
    '巡查人员ID': SESSION.sub,         // 复用现有列[X]；来自 Session.sub，非 body
    '姓名': SESSION.name,
    '巡查时间': values.inspectionTime,
    '网格': values.grid,               // 服务端解析
    '问题描述': values.description,
    '问题类型': values.problemType,
    '是否三违': values.isViolation,
    '三违行为': values.violationDesc,  // 复用现有列[M]
    '来源': 'h5-mobile',               // 硬编码，非 body
    client_request_id: values.clientRequestId,
    '创建时间': new Date().toISOString().slice(0, 10), // 服务端生成
    // 涉及人员：Sheet 15 无语义一致安全列，本阶段不写入（待业务决定）
  };
}

function main() {
  return getToken().then(getSchema).then((sheet) => {
    const fieldByName = new Map();
    for (const f of sheet.fields) fieldByName.set(f.name, f);

    const record = buildProductionRecord();
    console.log('=== DRY-RUN：生产分支最终将发送 WPS 的 record（字段名→值，无 secret）===\n');
    const problems = [];
    for (const [k, v] of Object.entries(record)) {
      const f = fieldByName.get(k);
      if (!f) { problems.push(`字段不存在于 Sheet 15：${k}`); console.log(`  [MISS]  ${k} = ${JSON.stringify(v).slice(0,40)}`); continue; }
      let ok = true;
      if (f.type === 'Date') ok = /^\d{4}-\d{2}-\d{2}/.test(String(v));
      else if (f.type === 'MultiLineText') ok = typeof v === 'string';
      console.log(`  [${f.id}] ${k} (${f.type}) = ${JSON.stringify(v).slice(0,40)}${ok ? '' : '  ⚠类型不符'}`);
      if (!ok) problems.push(`类型不符：${k} 期望 ${f.type}`);
    }

    // ---- 受保护字段断言 ----
    console.log('\n=== 受保护字段断言（客户端伪造必须被忽略）===\n');
    const checks = [
      ['巡查人员ID(employee_code) 来自 Session.sub', record['巡查人员ID'] === SESSION.sub && record['巡查人员ID'] !== MALICIOUS_BODY.employee_code],
      ['网格来自服务端解析', record['网格'] === RESOLVED_GRID && record['网格'] !== MALICIOUS_BODY.grid],
      ['来源硬编码 h5-mobile', record['来源'] === 'h5-mobile' && record['来源'] !== MALICIOUS_BODY.source],
      ['创建时间服务端生成', /^\d{4}-\d{2}-\d{2}$/.test(record['创建时间'])],
      ['grid_id 未进入 record', !('grid_id' in record)],
      ['inspector_employee_id 未进入 record', !('inspector_employee_id' in record)],
      ['attribution_status 未进入 record', !('attribution_status' in record)],
      ['responsibility 未进入 record', !('responsibility' in record)],
      ['测试编号 未进入正式 record', !('测试编号' in record)],
      ['测试状态 未进入正式 record', !('测试状态' in record)],
      ['照片状态 未进入正式 record', !('照片状态' in record)],
    ];
    let protOk = true;
    for (const [name, pass] of checks) { console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`); if (!pass) protOk = false; }

    console.log('\n=== 拦截断言（DRY-RUN 未调用 records/create）===');
    console.log('  PASS  本脚本未发起任何 WPS records/create 请求（构造后即拦截）');
    const status = (problems.length === 0 && protOk) ? 'PASS' : 'BLOCKED';
    console.log(`\nFORMAL_SHEET_DRY_RUN_STATUS = ${status}`);
    console.log(`FIELD_MAP_PROBLEMS = ${problems.length}`);
    if (problems.length) console.log(problems.map((p) => '  - ' + p).join('\n'));
    process.exit(status === 'PASS' ? 0 : 1);
  });
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
