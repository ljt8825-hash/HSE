/* setup-feishu-tables.mjs —— 按 Worker 真实字段键在飞书 base 内建表/补齐列
 * 幂等：按表名查重，缺失列补齐，绝不删现有列。
 *
 * 列名以 worker/index.js 的真实输出为准（非 FEISHU_SCHEMA.md 旧稿）：
 *   - 登录读身份表：employee_code/手机号码/password_hash/网格长等级/身份状态/姓名/部门/职位
 *   - 登录读花名册：员工编码/姓名/用工关系状态/负责区域（在职）
 *   - 巡查【测试】目标记录：测试编号/employee_code/姓名/巡查时间/网格/问题描述/问题类型/是否三违/三违行为描述/涉及人员/照片状态/来源/测试状态/client_request_id/创建时间
 *   - 巡查【生产】目标记录：巡查人员ID/姓名/巡查时间/网格/问题描述/问题类型/是否三违/三违行为/涉及人员/来源/client_request_id/创建时间
 *
 * 运行（worker 目录）：
 *   FS_APP_ID=cli_xxx FS_APP_SECRET=xxx \
 *   FS_APP_TOKEN=WX9TbTqJKa7sywsgrU4cVoKdnXb \
 *   FS_PATROL_TEST_TABLE_ID=tblYa9aQD1lhDV8s \
 *   node test/setup-feishu-tables.mjs
 *
 * 安全：仅回显表名/列名/table_id/status/ms；绝不回显 token / secret / 记录内容。
 */
import { getFsToken } from '../storage/feishuAdapter.js';

const FS_BASE = 'https://open.feishu.cn/open-apis';

// 表名（base 内显示名；与列名解耦，列名严格对齐 handler）
const IDENTITY_TABLE_NAME = 'H5移动端身份表';
const ROSTER_TABLE_NAME = 'H5花名册表';
const PATROL_PROD_TABLE_NAME = 'H5巡查生产台账';

// 权威列名（来自 index.js 真实输出）
const IDENTITY_COLUMNS = ['姓名', '手机号码', 'password_hash', '部门', '职位', '网格长等级', '身份状态', 'employee_code'];
const ROSTER_COLUMNS = ['员工编码', '姓名', '用工关系状态', '负责区域（在职）'];
const PATROL_TEST_COLUMNS = ['测试编号', 'employee_code', '姓名', '巡查时间', '网格', '问题描述', '问题类型', '是否三违', '三违行为描述', '涉及人员', '照片状态', '来源', '测试状态', 'client_request_id', '创建时间'];
const PATROL_PROD_COLUMNS = ['巡查人员ID', '姓名', '巡查时间', '网格', '问题描述', '问题类型', '是否三违', '三违行为', '涉及人员', '来源', 'client_request_id', '创建时间'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiFetch(token, method, url, body) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json; charset=utf-8';
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function listTables(token, appToken) {
  const { json } = await apiFetch(token, 'GET', `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables?page_size=200`);
  const items = (json.data && json.data.items) || [];
  return items.map((t) => ({ table_id: t.table_id || (t.data && t.data.table_id), name: t.name || (t.data && t.data.name) }));
}

async function findTableByName(token, appToken, name) {
  const tables = await listTables(token, appToken);
  return tables.find((t) => t.name === name) || null;
}

async function createTable(token, appToken, name, columns) {
  const body = { table: { name, default_view_name: '数据表', fields: columns.map((c) => ({ field_name: c, type: 1 })) } };
  const { ok, json } = await apiFetch(token, 'POST', `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables`, body);
  if (!ok || json.code !== 0) {
    console.log('  [debug] createTable body=', JSON.stringify(body), 'resp=', JSON.stringify(json));
    throw Object.assign(new Error(`create table ${name} failed`), { fsCode: json && json.code, fsMsg: json && json.msg });
  }
  const d = json.data || {};
  const id = d.table_id || (d.table && d.table.table_id);
  await cleanupStrayDefault(token, appToken, id, columns); // 删创建时残留的默认“字段 1”
  return id;
}

async function deleteField(token, appToken, tableId, fieldId) {
  const { ok, json } = await apiFetch(token, 'DELETE', `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields/${encodeURIComponent(fieldId)}`);
  if (!ok || json.code !== 0) console.log(`  [warn] 删除残留列 ${fieldId} 失败 fsCode=${json && json.code}`);
}

// 新建表后删除不在目标列集合内的残留列（典型：默认“字段 1”）
async function cleanupStrayDefault(token, appToken, tableId, columns) {
  const fields = await listFields(token, appToken, tableId);
  const colSet = new Set(columns);
  for (const f of fields) {
    if (!colSet.has(f.field_name)) {
      await deleteField(token, appToken, tableId, f.field_id);
      await sleep(150);
    }
  }
}

async function listFields(token, appToken, tableId) {
  const { json } = await apiFetch(token, 'GET', `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields?page_size=200`);
  return (json.data && json.data.items) || [];
}

async function addField(token, appToken, tableId, name) {
  const { ok, json } = await apiFetch(token, 'POST', `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`, { field_name: name, type: 1 });
  if (!ok || json.code !== 0) throw Object.assign(new Error(`add field ${name} failed`), { fsCode: json && json.code, fsMsg: json && json.msg });
  return json.data && json.data.field_id;
}

async function renameField(token, appToken, tableId, fieldId, name) {
  const { ok, json } = await apiFetch(token, 'PATCH', `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields/${encodeURIComponent(fieldId)}`, { field_name: name });
  if (!ok || json.code !== 0) throw Object.assign(new Error(`rename field ${fieldId} -> ${name} failed`), { fsCode: json && json.code, fsMsg: json && json.msg });
}

// 确保某表具备全部目标列（仅补缺失，不删既有列）
async function ensureColumns(token, appToken, tableId, columns) {
  const fields = await listFields(token, appToken, tableId);
  const existing = new Set(fields.map((f) => f.field_name));
  const missing = columns.filter((c) => !existing.has(c));
  for (const name of missing) {
    await addField(token, appToken, tableId, name);
    await sleep(150); // 避免 1254291 并发写冲突
  }
  return missing;
}

const env = { FS_APP_ID: process.env.FS_APP_ID, FS_APP_SECRET: process.env.FS_APP_SECRET };
const appToken = process.env.FS_APP_TOKEN;
const existingTestTableId = process.env.FS_PATROL_TEST_TABLE_ID; // 复用既有测试表

if (!env.FS_APP_ID || !env.FS_APP_SECRET || !appToken) {
  console.log('缺少环境变量 FS_APP_ID / FS_APP_SECRET / FS_APP_TOKEN');
  process.exit(2);
}

const result = { created: {}, reused: {}, ensuredTest: [] };

try {
  const t0 = Date.now();
  const token = await getFsToken(env);
  console.log(`token OK ms=${Date.now() - t0}`);

  // 0) 既有测试表：补齐缺失列（employee_code / 三违行为描述），不删既有列
  if (existingTestTableId) {
    const tPre = Date.now();
    const missing = await ensureColumns(token, appToken, existingTestTableId, PATROL_TEST_COLUMNS);
    result.reused.testTableId = existingTestTableId;
    result.ensuredTest = missing;
    console.log(`测试表 ${existingTestTableId} 补齐列=${missing.length} ms=${Date.now() - tPre} -> ${missing.join(',') || '(无需补齐)'}`);
  }

  // 1) 身份表
  let t = await findTableByName(token, appToken, IDENTITY_TABLE_NAME);
  if (!t) {
    const id = await createTable(token, appToken, IDENTITY_TABLE_NAME, IDENTITY_COLUMNS);
    t = { table_id: id, name: IDENTITY_TABLE_NAME };
    const m = await ensureColumns(token, appToken, id, IDENTITY_COLUMNS);
    console.log(`新建身份表 ${id} 列=${m.length} -> ${IDENTITY_COLUMNS.length} 列全建`);
    result.created.identity = id;
  } else {
    const m = await ensureColumns(token, appToken, t.table_id, IDENTITY_COLUMNS);
    console.log(`复用身份表 ${t.table_id} 补齐列=${m.length} -> ${m.join(',') || '(无需补齐)'}`);
    result.reused.identity = t.table_id;
  }

  // 2) 花名册表
  t = await findTableByName(token, appToken, ROSTER_TABLE_NAME);
  if (!t) {
    const id = await createTable(token, appToken, ROSTER_TABLE_NAME, ROSTER_COLUMNS);
    t = { table_id: id, name: ROSTER_TABLE_NAME };
    await ensureColumns(token, appToken, id, ROSTER_COLUMNS);
    console.log(`新建花名册表 ${id} -> ${ROSTER_COLUMNS.length} 列全建`);
    result.created.roster = id;
  } else {
    const m = await ensureColumns(token, appToken, t.table_id, ROSTER_COLUMNS);
    console.log(`复用花名册表 ${t.table_id} 补齐列=${m.length} -> ${m.join(',') || '(无需补齐)'}`);
    result.reused.roster = t.table_id;
  }

  // 3) 巡查生产表
  t = await findTableByName(token, appToken, PATROL_PROD_TABLE_NAME);
  if (!t) {
    const id = await createTable(token, appToken, PATROL_PROD_TABLE_NAME, PATROL_PROD_COLUMNS);
    t = { table_id: id, name: PATROL_PROD_TABLE_NAME };
    await ensureColumns(token, appToken, id, PATROL_PROD_COLUMNS);
    console.log(`新建巡查生产表 ${id} -> ${PATROL_PROD_COLUMNS.length} 列全建`);
    result.created.prod = id;
  } else {
    const m = await ensureColumns(token, appToken, t.table_id, PATROL_PROD_COLUMNS);
    console.log(`复用巡查生产表 ${t.table_id} 补齐列=${m.length} -> ${m.join(',') || '(无需补齐)'}`);
    result.reused.prod = t.table_id;
  }

  // 汇总：供用户填 wrangler.toml
  const identityId = result.created.identity || result.reused.identity;
  const rosterId = result.created.roster || result.reused.roster;
  const prodId = result.created.prod || result.reused.prod;
  console.log('\n==== 填入 wrangler.toml 的 ID ====');
  console.log(`FS_APP_TOKEN            = ${appToken}`);
  console.log(`FS_IDENTITY_TABLE_ID    = ${identityId}`);
  console.log(`FS_ROSTER_TABLE_ID      = ${rosterId}`);
  console.log(`FS_PATROL_TEST_TABLE_ID = ${existingTestTableId}`);
  console.log(`FS_PATROL_PRODUCTION_TABLE_ID = ${prodId}`);
  console.log('\nSETUP_FEISHU_TABLES: DONE');
  process.exit(0);
} catch (e) {
  console.log('EXCEPTION', e && e.message, 'fsCode=', e && e.fsCode, 'fsMsg=', e && e.fsMsg);
  process.exit(1);
}
