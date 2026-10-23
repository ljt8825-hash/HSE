/**
 * 安全生产费用业务域（任务第二优先级 P2）—— 业务层（上线阻断项修复版）
 * ---------------------------------------------------------------------------
 * 数据流：预算主体(hse_safety_budget) → 预算明细(hse_budget_item)
 *        → 费用申请(hse_cost_request，可关联隐患/事故/检查/培训等)
 *        → 承诺(hse_cost_commitment) → 实际支出(hse_cost_actual)
 *        → 成本归因(hse_cost_allocation：公司→业务领域→作业类型→投入类别→对象→事件→费用)
 *
 * 本轮（上线阻断项）要点：
 *   P0-1 业务请求绝不自动执行迁移：ensureCostTables 的「运行时自愈执行 DDL」已彻底移除。
 *        所有入口仅做「结构存在性检查」（checkCostSchema），缺失即返回可追踪的
 *        MIGRATION_REQUIRED 错误（含 current_database() 与缺失对象清单），绝不静默降级
 *        为成功；DDL 只能由受控迁移流程执行（server/sql/*.sql）。
 *   P0-2 独立分摊接口（allocationCreate/Update/Delete）事务 + FOR UPDATE 锁定实际支出，
 *        强制「有效分摊净额 == 实际支出净额」；已完成归因的实际支出不允许超额追加；
 *        并发请求由行锁串行化；失败整体回滚，不留部分分摊。
 *   P0-3 预算导入防重：批次(batch_no, 唯一索引) + 文件指纹(SHA-256) 绑定预览与确认；
 *        确认时文件被替换即拒绝；编码非空按编码判重、编码为空按业务键
 *        (年度+项目+事项+金额) 判重；写入用 ON CONFLICT DO NOTHING（并发安全，
 *        不覆盖既有预算）；同批次重复确认直接返回首次结果，不重复插入。
 *   P1   金额解析严格化：禁 parseFloat 静默转换、禁截断超位小数、禁负值/NaN/Infinity/
 *        超 NUMERIC(14,2) 范围；合法格式仅 1600 / 1600.00；比较一律以「分」为整数。
 *   财务口径（保持上一轮已实现定义，不被破坏）：年度预算 / 已承诺 / 待执行承诺 /
 *        实际净支出 / 未支出余额 / 未承诺可用 / 承诺率 / 执行率；按有效分摊汇总、
 *        未归因单列；年度过滤用 actual_date 自然年。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool, isConnected } = require('../config/db');
const XLSX = require('xlsx');

// 统一描述符（与 objectiveService 一致，由 controller.respond 解释）
const ok = (payload, message) => ({ __t: 'json', payload, message });
const err = (code, message) => ({ __t: 'json', error: { code, message } });
const list = (list_, total, page, pageSize, message) => ({ __t: 'list', list: list_, total, page, pageSize, message });

// 列白名单（仅允许这些列进入 INSERT/UPDATE，防注入）
const COLUMNS = {
  hse_budget_item: ['budget_id', 'item_name', 'category', 'biz_domain_id', 'planned_amount', 'annual_plan_total', 'responsible_person', 'responsible_employee_id', 'org_unit_id', 'department', 'township', 'remark', 'created_by', 'updated_by'],
  hse_cost_request: ['budget_id', 'title', 'source_type', 'source_id', 'applicant_id', 'applicant_name', 'apply_amount', 'apply_date', 'expected_date', 'purpose', 'status', 'approved_amount', 'approved_by', 'approved_at', 'reject_reason', 'remark', 'created_by', 'updated_by'],
  hse_cost_commitment: ['request_id', 'budget_id', 'commitment_no', 'amount', 'commitment_date', 'fiscal_month', 'status', 'remark', 'created_by', 'updated_by'],
  hse_cost_actual: ['request_id', 'commitment_id', 'budget_id', 'actual_amount', 'actual_date', 'fiscal_month', 'payment_method', 'invoice_no', 'payee', 'record_type', 'remark', 'created_by', 'updated_by'],
  hse_cost_allocation: ['cost_actual_id', 'request_id', 'company', 'biz_domain_id', 'op_type_id', 'invest_category_id', 'object_type', 'object_id', 'object_name', 'event_type', 'event_id', 'event_name', 'amount', 'record_type', 'remark', 'created_by', 'updated_by'],
};

const REFERENCE_COLUMNS = {
  hse_cost_biz_domain: ['code', 'name', 'sort_order', 'is_active'],
  hse_cost_op_type: ['biz_domain_id', 'code', 'name', 'sort_order', 'is_active'],
  hse_cost_invest_category: ['code', 'name', 'sort_order', 'is_active'],
};

// 写操作必须走专用校验接口的表（禁止通用 CRUD 绕过金额/事务校验）
const VALIDATED_WRITE_TABLES = {
  hse_cost_actual: '实际支出（含分摊金额一致性校验与事务）',
  hse_cost_allocation: '成本分摊（含实际支出锁定与总额校验）',
};

function snakeToCamel(s) { return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }
function rowToCamel(row) { const o = {}; if (!row) return o; for (const k of Object.keys(row)) o[snakeToCamel(k)] = row[k]; return o; }
const pick = (body, key) => (body[key] !== undefined ? body[key] : body[snakeToCamel(key)]);
const normStr = (v) => (v === undefined || v === null ? '' : String(v).trim());

// ============================================================================
// 金额精度处理（P1：严格解析）
//   合法格式：非负十进制，最多两位小数，如 1600、1600.00、0.07；
//   一律拒绝：NaN / Infinity / 负数（除 DB 聚合净额外）/ 科学计数法 / 千分位 /
//             单位后缀 / 多于两位小数 / 超过 NUMERIC(14,2) 上限。
//   比较一律以「分」为整数，杜绝二进制浮点误差。
// ============================================================================
const MAX_CENTS = 99999999999999; // NUMERIC(14,2) 上限 999,999,999,999.99 → 分

function toCents(v, opts) {
  const allowNegative = !!(opts && opts.allowNegative); // 仅 DB 聚合净额（可能为负）使用
  if (v === null || v === undefined) return null;
  let s;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    s = String(v);
    if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) return null; // 科学计数法一律拒绝
  } else if (typeof v === 'string') {
    s = v.trim();
  } else if (typeof v === 'bigint') {
    s = v.toString();
  } else {
    return null;
  }
  if (s === '') return null;
  let neg = false;
  if (s.charAt(0) === '-') { if (!allowNegative) return null; neg = true; s = s.slice(1); }
  if (s.charAt(0) === '+') s = s.slice(1);
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null; // 禁负号(已处理)/禁超位小数/禁千分位等
  const dot = s.indexOf('.');
  const ip = dot < 0 ? s : s.slice(0, dot);
  const fp = dot < 0 ? '' : s.slice(dot + 1);
  if (ip.length > 12) return null; // 整数部分最多 12 位，防 safe integer 溢出
  const cents = parseInt(ip, 10) * 100 + (fp ? parseInt(fp.padEnd(2, '0'), 10) : 0);
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return neg ? -cents : cents;
}
const fromCents = (c) => ((c === null || c === undefined) ? 0 : Math.round(c) / 100); // 分 → 元（数值）
const fmtYuan = (c) => (((c === null || c === undefined) ? 0 : Math.round(c)) / 100).toFixed(2); // 分 → 元（字符串）
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0); // 百分比，保留2位

// 用户输入金额 → 整数分；非法即返回可理解错误，绝不静默转 0
function parseAmountInput(v, label) {
  const c = toCents(v);
  if (c === null) return { error: `${label}不是合法金额：仅支持非负数字且最多两位小数（如 1600、1600.00）；收到「${v === undefined || v === null ? '空' : v}」` };
  if (c <= 0) return { error: `${label}必须大于 0（收到 ¥${fmtYuan(c)}）` };
  return { cents: c };
}

// ============================================================================
// 事务助手：单连接 BEGIN/COMMIT/ROLLBACK，异常必回滚并释放连接
// ============================================================================
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* 忽略二次回滚错误 */ }
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================================
// P0-1：结构存在性检查（只读，绝不执行任何 DDL）
//   业务请求只能确认表/列/索引是否存在；缺失即报「迁移未完成」，绝不自动建表加列。
// ============================================================================
const REQUIRED_SCHEMA = {
  tables: [
    'hse_safety_budget', 'hse_budget_item', 'hse_cost_request', 'hse_cost_commitment',
    'hse_cost_actual', 'hse_cost_allocation', 'hse_cost_biz_domain', 'hse_cost_op_type',
    'hse_cost_invest_category', 'hse_cost_import_batch',
  ],
  columns: [
    { table: 'hse_cost_actual', column: 'record_type' },
    { table: 'hse_cost_allocation', column: 'record_type' },
    { table: 'hse_cost_import_batch', column: 'file_fingerprint' },
    { table: 'hse_cost_import_batch', column: 'batch_no' },
  ],
  indexes: ['uq_cost_commitment_active_per_request', 'uq_hse_safety_budget_bizkey'],
};
const MIGRATION_FILES = [
  'server/sql/20261023_hse_safety_cost_domain.sql',
  'server/sql/20261024_hse_safety_cost_hardening.sql',
  'server/sql/20261025_hse_cost_import_constraints.sql',
];

// 结构完好时缓存 15 秒，避免每请求重复查询；缺失时不缓存，迁移完成后立即可用。
// 缓存以 required 的内容签名为键，防止运行期变更检查清单时读到脏缓存。
let _schemaCache = { at: 0, report: null, sig: null };

async function checkCostSchema(required = REQUIRED_SCHEMA, opts = {}) {
  const now = Date.now();
  const sig = JSON.stringify(required);
  if (!opts.force && _schemaCache.report && _schemaCache.sig === sig && now - _schemaCache.at < 15000) return _schemaCache.report;
  const tables = required.tables || [];
  const columns = required.columns || [];
  const indexes = required.indexes || [];
  const [objR, colR, idxR, dbR] = await Promise.all([
    pool.query(
      `SELECT c.relname AS name, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname = ANY($1) AND c.relkind IN ('r','p')`, [tables]),
    pool.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_name = ANY($1)`, [Array.from(new Set(columns.map((c) => c.table)))]),
    pool.query(
      `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind='i' AND c.relname = ANY($1)`, [indexes]),
    pool.query('SELECT current_database() AS db'),
  ]);
  const existingTables = new Set(objR.rows.map((r) => r.name));
  const existingCols = new Set(colR.rows.map((r) => `${r.table_name}.${r.column_name}`));
  const existingIdx = new Set(idxR.rows.map((r) => r.name));
  const missing = {
    tables: tables.filter((t) => !existingTables.has(t)),
    columns: columns.filter((c) => !existingCols.has(`${c.table}.${c.column}`)).map((c) => `${c.table}.${c.column}`),
    indexes: indexes.filter((i) => !existingIdx.has(i)),
  };
  const report = {
    ok: missing.tables.length === 0 && missing.columns.length === 0 && missing.indexes.length === 0,
    missing,
    database: dbR.rows[0].db,
  };
  if (report.ok) _schemaCache = { at: now, report, sig };
  else _schemaCache = { at: 0, report: null, sig: null };
  return report;
}

function describeMissing(m) {
  const parts = [];
  if (m.tables.length) parts.push(`缺失表[${m.tables.join(', ')}]`);
  if (m.columns.length) parts.push(`缺失列[${m.columns.join(', ')}]`);
  if (m.indexes.length) parts.push(`缺失索引[${m.indexes.join(', ')}]`);
  return parts.join('；');
}

async function requireSchema() {
  const r = await checkCostSchema();
  if (r.ok) return null;
  return err(-4,
    `安全生产费用域数据库结构不完整（迁移未完成），当前库 ${r.database}。${describeMissing(r.missing)}。` +
    `请通过受控迁移流程依次执行 ${MIGRATION_FILES.join('、')} 后重试；业务请求不会自动执行任何 DDL。`);
}

function requireConn() {
  if (!isConnected()) return err(-1, '数据库当前不可用（开发环境内存降级或连接失败），无法操作安全生产费用数据');
  return null;
}

// ============================================================================
// 参照维度
// ============================================================================
async function listBizDomains() {
  if (!isConnected()) return ok([], '内存模式无数据');
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const r = await pool.query('SELECT id, code, name, sort_order, is_active FROM hse_cost_biz_domain WHERE is_active=true ORDER BY sort_order, id');
  return ok(r.rows.map(rowToCamel));
}
async function listOpTypes(bizDomainId) {
  if (!isConnected()) return ok([], '内存模式无数据');
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const params = []; const where = ['is_active=true'];
  if (bizDomainId) { params.push(bizDomainId); where.push(`biz_domain_id=$${params.length}`); }
  const r = await pool.query(`SELECT id, biz_domain_id, code, name, sort_order, is_active FROM hse_cost_op_type WHERE ${where.join(' AND ')} ORDER BY sort_order, id`, params);
  return ok(r.rows.map(rowToCamel));
}
async function listInvestCategories() {
  if (!isConnected()) return ok([], '内存模式无数据');
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const r = await pool.query('SELECT id, code, name, sort_order, is_active FROM hse_cost_invest_category WHERE is_active=true ORDER BY sort_order, id');
  return ok(r.rows.map(rowToCamel));
}

// ============================================================================
// 预算明细（单表 CRUD）
// ============================================================================
async function budgetItemList(query = {}) {
  const { page, pageSize, budgetId, keyword, bizDomainId } = query;
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const where = ['is_deleted=false']; const params = [];
  if (budgetId) { params.push(budgetId); where.push(`budget_id=$${params.length}`); }
  if (bizDomainId) { params.push(bizDomainId); where.push(`biz_domain_id=$${params.length}`); }
  if (keyword) { params.push(`%${keyword}%`); where.push(`(item_name ILIKE $${params.length} OR category ILIKE $${params.length} OR remark ILIKE $${params.length})`); }
  const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
  const [cR, lR] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM hse_budget_item WHERE ${where.join(' AND ')}`, params),
    pool.query(`SELECT * FROM hse_budget_item WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
  ]);
  return list(lR.rows.map(rowToCamel), parseInt(cR.rows[0].c), p, ps, '查询成功');
}
async function budgetItemDetail(idRaw) {
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const r = await pool.query('SELECT * FROM hse_budget_item WHERE id=$1 AND is_deleted=false', [parseInt(idRaw)]);
  if (!r.rows.length) return err(-2, '预算明细不存在');
  return ok(rowToCamel(r.rows[0]));
}
async function budgetItemCreate(body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  if (!pick(body, 'budgetId') && !pick(body, 'budget_id')) return err(-1, '必须关联预算主体(budgetId)');
  if (!pick(body, 'itemName') && !pick(body, 'item_name')) return err(-1, '请填写明细名称(itemName)');
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const plannedRaw = pick(body, 'plannedAmount') ?? pick(body, 'planned_amount');
  if (plannedRaw !== undefined && plannedRaw !== null && plannedRaw !== '') {
    const p = parseAmountInput(plannedRaw, '计划金额(plannedAmount)');
    if (p.error) return err(-1, p.error);
  }
  const rec = { ...body };
  const cols = COLUMNS.hse_budget_item.filter((c) => rec[c] !== undefined || rec[snakeToCamel(c)] !== undefined);
  const vals = cols.map((c) => (rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)]));
  const r = await pool.query(`INSERT INTO hse_budget_item(${cols.join(',')}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
  return ok(rowToCamel(r.rows[0]), '创建成功');
}
async function budgetItemUpdate(idRaw, body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const plannedRaw = pick(body, 'plannedAmount') ?? pick(body, 'planned_amount');
  if (plannedRaw !== undefined && plannedRaw !== null && plannedRaw !== '') {
    const p = parseAmountInput(plannedRaw, '计划金额(plannedAmount)');
    if (p.error) return err(-1, p.error);
  }
  const rec = { ...body };
  const sets = []; const params = []; let idx = 1;
  for (const c of COLUMNS.hse_budget_item) {
    const v = rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)];
    if (v !== undefined) { sets.push(`${c}=$${idx}`); params.push(v); idx++; }
  }
  if (!sets.length) return err(-1, '无可更新字段');
  params.push(parseInt(idRaw));
  const r = await pool.query(`UPDATE hse_budget_item SET ${sets.join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${idx} RETURNING *`, params);
  if (!r.rows.length) return err(-2, '预算明细不存在');
  return ok(rowToCamel(r.rows[0]), '更新成功');
}
async function budgetItemDelete(idRaw) {
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  await pool.query('UPDATE hse_budget_item SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [parseInt(idRaw)]);
  return ok(null, '删除成功');
}

// ============================================================================
// 费用申请（可关联业务来源）—— 创建带分摊：事务
// ============================================================================
function genRequestNo() { return `CR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`; }
function genCommitmentNo() { return `CM-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 6)}`; }

async function costRequestList(query = {}) {
  const { page, pageSize, keyword, status, sourceType, budgetId } = query;
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const where = ['is_deleted=false']; const params = [];
  if (status) { params.push(status); where.push(`status=$${params.length}`); }
  if (sourceType) { params.push(sourceType); where.push(`source_type=$${params.length}`); }
  if (budgetId) { params.push(budgetId); where.push(`budget_id=$${params.length}`); }
  if (keyword) { params.push(`%${keyword}%`); where.push(`(title ILIKE $${params.length} OR request_no ILIKE $${params.length} OR purpose ILIKE $${params.length})`); }
  const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
  const [cR, lR] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM hse_cost_request WHERE ${where.join(' AND ')}`, params),
    pool.query(`SELECT * FROM hse_cost_request WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
  ]);
  return list(lR.rows.map(rowToCamel), parseInt(cR.rows[0].c), p, ps, '查询成功');
}
async function costRequestDetail(idRaw) {
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const r = await pool.query('SELECT * FROM hse_cost_request WHERE id=$1 AND is_deleted=false', [parseInt(idRaw)]);
  if (!r.rows.length) return err(-2, '费用申请不存在');
  const row = rowToCamel(r.rows[0]);
  const alR = await pool.query('SELECT * FROM hse_cost_allocation WHERE request_id=$1 AND is_deleted=false ORDER BY id', [parseInt(idRaw)]);
  row.allocations = alR.rows.map(rowToCamel);
  return ok(row);
}

// 申请阶段可携带计划归因（原子写入申请 + 分摊；失败整体回滚）
async function costRequestCreate(body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  if (!body.title) return err(-1, '请填写申请标题(title)');
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const applyRaw = pick(body, 'applyAmount') ?? pick(body, 'apply_amount');
  if (applyRaw !== undefined && applyRaw !== null && applyRaw !== '') {
    const p = parseAmountInput(applyRaw, '申请金额(applyAmount)');
    if (p.error) return err(-1, p.error);
  }
  const allocations = Array.isArray(body.allocations) ? body.allocations : [];
  for (let i = 0; i < allocations.length; i++) {
    const a = allocations[i] || {};
    const p = parseAmountInput(pick(a, 'amount'), `第 ${i + 1} 条计划归因金额`);
    if (p.error) return err(-1, p.error);
  }
  const rec = { ...body };
  try {
    const created = await withTransaction(async (client) => {
      const cols = COLUMNS.hse_cost_request.filter((c) => rec[c] !== undefined || rec[snakeToCamel(c)] !== undefined);
      const vals = cols.map((c) => (rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)]));
      const r = await client.query(`INSERT INTO hse_cost_request(request_no, ${cols.join(',')}) VALUES($1, ${cols.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`, [genRequestNo(), ...vals]);
      const row = rowToCamel(r.rows[0]);
      for (const a of allocations) {
        const acols = ['request_id', ...COLUMNS.hse_cost_allocation.filter((c) => c !== 'request_id' && (a[c] !== undefined || a[snakeToCamel(c)] !== undefined))];
        const avals = acols.map((c) => (c === 'request_id' ? row.id : (a[c] !== undefined ? a[c] : a[snakeToCamel(c)])));
        await client.query(`INSERT INTO hse_cost_allocation(${acols.join(',')}) VALUES(${acols.map((_, i) => `$${i + 1}`).join(',')})`, avals);
      }
      return row;
    });
    return ok(created, '创建成功');
  } catch (e) {
    return err(-1, '创建费用申请失败：' + e.message);
  }
}

// 审批通过 → 自动生成/更新承诺（行锁串行化 + 唯一约束 backstop，绝不重复占用资金）
async function costRequestUpdate(idRaw, body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const id = parseInt(idRaw);
  try {
    const updated = await withTransaction(async (client) => {
      // 行锁：串行化同一费用申请的并发审批，使「查有效承诺 → 建/改」成为原子操作
      const ex = await client.query('SELECT * FROM hse_cost_request WHERE id=$1 AND is_deleted=false FOR UPDATE', [id]);
      if (!ex.rows.length) { const e = new Error('费用申请不存在'); e.svcCode = -2; throw e; }
      const existing = ex.rows[0];
      const rec = { ...body };
      const sets = []; const params = []; let idx = 1;
      for (const c of COLUMNS.hse_cost_request) {
        const v = rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)];
        if (v !== undefined) { sets.push(`${c}=$${idx}`); params.push(v); idx++; }
      }
      if (sets.length) {
        params.push(id);
        await client.query(`UPDATE hse_cost_request SET ${sets.join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${idx}`, params);
      }
      const newStatus = rec.status !== undefined ? rec.status : rec[snakeToCamel('status')];
      if (newStatus === 'approved') {
        const approvedAmt = rec.approvedAmount !== undefined ? rec.approvedAmount : rec.approved_amount;
        const amt = approvedAmt !== undefined ? approvedAmt : existing.apply_amount;
        // 审批金额严格校验：非法/负/超精度一律拒绝，绝不静默沿用
        const amtParsed = parseAmountInput(amt, '审批金额(approvedAmount)');
        if (amtParsed.error) { const e = new Error(amtParsed.error); e.svcCode = -1; throw e; }
        // 已有有效承诺 → 仅更新金额（幂等，不重复创建）；否则创建
        const ck = await client.query("SELECT id, amount FROM hse_cost_commitment WHERE request_id=$1 AND status='active' AND is_deleted=false ORDER BY id LIMIT 1", [id]);
        if (ck.rows.length) {
          if (toCents(ck.rows[0].amount, { allowNegative: true }) !== amtParsed.cents) {
            await client.query('UPDATE hse_cost_commitment SET amount=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [fromCents(amtParsed.cents), ck.rows[0].id]);
          }
        } else {
          // ON CONFLICT DO NOTHING 依赖唯一约束 backstop；行锁已保证串行，双保险
          await client.query(
            "INSERT INTO hse_cost_commitment(request_id, budget_id, amount, commitment_date, status, commitment_no) VALUES($1,$2,$3,CURRENT_DATE,'active',$4) ON CONFLICT DO NOTHING",
            [id, existing.budget_id, fromCents(amtParsed.cents), genCommitmentNo()]
          );
        }
      } else if (newStatus && ['rejected', 'withdrawn', 'closed', 'draft'].includes(newStatus) && existing.status === 'approved') {
        // 撤回 / 驳回 / 取消：仅在承诺尚未被实际支出消耗时释放（取消承诺，保留历史）
        const consumed = await client.query(
          "SELECT COALESCE(SUM(CASE WHEN record_type='reversal' THEN -actual_amount ELSE actual_amount END),0)::numeric AS net FROM hse_cost_actual WHERE request_id=$1 AND is_deleted=false",
          [id]
        );
        if (toCents(consumed.rows[0].net, { allowNegative: true }) === 0) {
          await client.query("UPDATE hse_cost_commitment SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE request_id=$1 AND status='active' AND is_deleted=false", [id]);
        }
        // 已被实际支出消耗时保留承诺（资金已花，不能凭空释放；退款走冲销反向记录）
      }
      const r = await client.query('SELECT * FROM hse_cost_request WHERE id=$1', [id]);
      return rowToCamel(r.rows[0]);
    });
    return ok(updated, '更新成功');
  } catch (e) {
    if (e.svcCode === -2) return err(-2, e.message);
    if (e.svcCode === -1) return err(-1, e.message);
    return err(-1, '更新费用申请失败：' + e.message);
  }
}
async function costRequestDelete(idRaw) {
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  await pool.query('UPDATE hse_cost_request SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [parseInt(idRaw)]);
  return ok(null, '删除成功');
}

// ============================================================================
// 承诺 / 实际支出 / 归因
// ============================================================================
async function genericCrud(table, idRaw, body, query) {
  const blocked = requireConn(); if (blocked) return blocked;
  if (VALIDATED_WRITE_TABLES[table]) {
    return err(-1, `${table} 属于${VALIDATED_WRITE_TABLES[table]}，必须走专用接口（含事务与金额校验），禁止通过通用 CRUD 绕过校验`);
  }
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const id = parseInt(idRaw);
  if (body && Object.keys(body).length) {
    const rec = { ...body };
    const sets = []; const params = []; let idx = 1;
    for (const c of COLUMNS[table]) {
      const v = rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)];
      if (v !== undefined) { sets.push(`${c}=$${idx}`); params.push(v); idx++; }
    }
    if (sets.length) { params.push(id); await pool.query(`UPDATE ${table} SET ${sets.join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${idx}`, params); }
  }
  if (idRaw) {
    const r = await pool.query(`SELECT * FROM ${table} WHERE id=$1 AND is_deleted=false`, [id]);
    if (!r.rows.length) return err(-2, '记录不存在');
    return ok(rowToCamel(r.rows[0]), '操作成功');
  }
  return ok(null);
}

async function commitmentList(query = {}) {
  const { page, pageSize, requestId, budgetId } = query;
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const where = ['is_deleted=false']; const params = [];
  if (requestId) { params.push(requestId); where.push(`request_id=$${params.length}`); }
  if (budgetId) { params.push(budgetId); where.push(`budget_id=$${params.length}`); }
  const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
  const [cR, lR] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM hse_cost_commitment WHERE ${where.join(' AND ')}`, params),
    pool.query(`SELECT * FROM hse_cost_commitment WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
  ]);
  return list(lR.rows.map(rowToCamel), parseInt(cR.rows[0].c), p, ps, '查询成功');
}
async function commitmentCreate(body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  if (!pick(body, 'requestId') && !pick(body, 'request_id')) return err(-1, '承诺必须关联费用申请(requestId)');
  const amtParsed = parseAmountInput(pick(body, 'amount'), '承诺金额(amount)');
  if (amtParsed.error) return err(-1, amtParsed.error);
  const requestId = parseInt(pick(body, 'requestId') ?? pick(body, 'request_id'));
  const reqR = await pool.query('SELECT id FROM hse_cost_request WHERE id=$1 AND is_deleted=false', [requestId]);
  if (!reqR.rows.length) return err(-2, '关联的费用申请不存在或已删除');
  const rec = { ...body };
  const cols = COLUMNS.hse_cost_commitment.filter((c) => rec[c] !== undefined || rec[snakeToCamel(c)] !== undefined);
  const vals = cols.map((c) => (rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)]));
  const r = await pool.query(`INSERT INTO hse_cost_commitment(${cols.join(',')}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
  return ok(rowToCamel(r.rows[0]), '创建成功');
}

// 审计既有数据是否已存在「同一申请多条有效承诺」（只读、只报不删）
async function auditDuplicateCommitments() {
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const r = await pool.query(`
    SELECT request_id, COUNT(*)::int AS active_count,
           ARRAY_AGG(id ORDER BY id) AS commitment_ids,
           COALESCE(SUM(amount),0)::numeric AS total_amount
    FROM hse_cost_commitment
    WHERE is_deleted=false AND status='active'
    GROUP BY request_id HAVING COUNT(*) > 1
    ORDER BY active_count DESC`);
  const rows = r.rows.map((x) => ({
    requestId: x.request_id,
    activeCount: parseInt(x.active_count),
    commitmentIds: x.commitment_ids,
    totalAmount: fromCents(toCents(x.total_amount, { allowNegative: true })),
  }));
  return ok(rows, rows.length ? `发现 ${rows.length} 个申请存在重复有效承诺（未做任何删除，请人工核对）` : '未发现重复有效承诺');
}

async function actualList(query = {}) {
  const { page, pageSize, requestId, budgetId } = query;
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const where = ['is_deleted=false']; const params = [];
  if (requestId) { params.push(requestId); where.push(`request_id=$${params.length}`); }
  if (budgetId) { params.push(budgetId); where.push(`budget_id=$${params.length}`); }
  const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
  const [cR, lR] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM hse_cost_actual WHERE ${where.join(' AND ')}`, params),
    pool.query(`SELECT * FROM hse_cost_actual WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
  ]);
  return list(lR.rows.map(rowToCamel), parseInt(cR.rows[0].c), p, ps, '查询成功');
}

// 校验实际金额与分摊金额（整数分比较，禁负/空分摊）
function validateActualAllocations(actualAmountRaw, allocations) {
  const actualParsed = parseAmountInput(actualAmountRaw, '实际支出金额(actualAmount)');
  if (actualParsed.error) return actualParsed.error;
  for (let i = 0; i < allocations.length; i++) {
    const a = allocations[i] || {};
    const p = parseAmountInput(pick(a, 'amount'), `第 ${i + 1} 条分摊金额`);
    if (p.error) return p.error;
  }
  if (allocations.length > 0) {
    const sum = allocations.reduce((s, a) => s + toCents(pick(a, 'amount')), 0);
    if (sum !== actualParsed.cents) {
      return `分摊金额合计（¥${fmtYuan(sum)}）与实际支出金额（¥${fmtYuan(actualParsed.cents)}）不一致；单归属须相等，多域分摊合计须相等`;
    }
  }
  return null; // 通过；无分摊 = 待归因（单独统计）
}

async function actualCreate(body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  if (!pick(body, 'requestId') && !pick(body, 'request_id')) return err(-1, '实际支出必须关联费用申请(requestId)');
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const recordType = pick(body, 'recordType') ?? pick(body, 'record_type') ?? 'normal';
  if (!['normal', 'reversal'].includes(recordType)) return err(-1, 'record_type 仅支持 normal/reversal（冲销请用 reversal 反向记录）');
  const allocations = Array.isArray(body.allocations) ? body.allocations : [];
  const vErr = validateActualAllocations(pick(body, 'actualAmount') ?? pick(body, 'actual_amount'), allocations);
  if (vErr) return err(-1, vErr);
  const rec = { ...body };
  const requestId = parseInt(pick(body, 'requestId') ?? pick(body, 'request_id'));
  try {
    const created = await withTransaction(async (client) => {
      const cols = COLUMNS.hse_cost_actual.filter((c) => rec[c] !== undefined || rec[snakeToCamel(c)] !== undefined);
      const vals = cols.map((c) => (rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)]));
      const r = await client.query(`INSERT INTO hse_cost_actual(${cols.join(',')}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
      const row = rowToCamel(r.rows[0]);
      for (const a of allocations) {
        const restCols = COLUMNS.hse_cost_allocation.filter((c) => !['cost_actual_id', 'request_id', 'record_type'].includes(c) && (a[c] !== undefined || a[snakeToCamel(c)] !== undefined));
        const acols = ['cost_actual_id', 'request_id', 'record_type', ...restCols];
        const avals = acols.map((c) => {
          if (c === 'cost_actual_id') return row.id;
          if (c === 'request_id') return requestId;
          if (c === 'record_type') return recordType;
          return a[c] !== undefined ? a[c] : a[snakeToCamel(c)];
        });
        await client.query(`INSERT INTO hse_cost_allocation(${acols.join(',')}) VALUES(${acols.map((_, i) => `$${i + 1}`).join(',')})`, avals);
      }
      return row;
    });
    return ok(created, '创建成功');
  } catch (e) {
    return err(-1, '创建实际支出失败：' + e.message);
  }
}

async function allocationList(query = {}) {
  const { page, pageSize, costActualId, requestId, bizDomainId } = query;
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const where = ['is_deleted=false']; const params = [];
  if (costActualId) { params.push(costActualId); where.push(`cost_actual_id=$${params.length}`); }
  if (requestId) { params.push(requestId); where.push(`request_id=$${params.length}`); }
  if (bizDomainId) { params.push(bizDomainId); where.push(`biz_domain_id=$${params.length}`); }
  const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
  const [cR, lR] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM hse_cost_allocation WHERE ${where.join(' AND ')}`, params),
    pool.query(`SELECT * FROM hse_cost_allocation WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
  ]);
  return list(lR.rows.map(rowToCamel), parseInt(cR.rows[0].c), p, ps, '查询成功');
}

// 归属某实际支出的「有效分摊净额」（normal 为正、reversal 为负）
async function sumAllocationNet(client, costActualId) {
  const r = await client.query(
    "SELECT COALESCE(SUM(CASE WHEN record_type='reversal' THEN -amount ELSE amount END),0)::numeric AS net FROM hse_cost_allocation WHERE cost_actual_id=$1 AND is_deleted=false",
    [costActualId]
  );
  return toCents(r.rows[0].net, { allowNegative: true });
}

/**
 * P0-2：独立新增分摊。
 * 事务内 FOR UPDATE 锁定对应实际支出 → 串行化并发写入；
 * 强制规则：追加后「有效分摊净额」必须恰好等于「实际支出净额」。
 *   - 首次分摊 1000（实际 1600）→ 拒绝（非完整归因）；
 *   - 已有 1000 再追加 700 → 拒绝（超额）；
 *   - 已有 1000 再追加 600 → 成功（补齐）。
 * 待归因语义：实际支出可以先不带分摊创建（待归因，单独统计），但归因一旦开始
 * 就必须在本事务内一次补齐；部分归因不落地，从根上杜绝「半条归因」。
 */
async function allocationCreate(body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const costActualId = parseInt(pick(body, 'costActualId') ?? pick(body, 'cost_actual_id'));
  if (!costActualId) return err(-1, '分摊必须关联实际支出(costActualId)');
  const amtParsed = parseAmountInput(pick(body, 'amount'), '分摊金额(amount)');
  if (amtParsed.error) return err(-1, amtParsed.error);
  const recordType = pick(body, 'recordType') ?? pick(body, 'record_type') ?? 'normal';
  if (!['normal', 'reversal'].includes(recordType)) return err(-1, 'record_type 仅支持 normal/reversal');
  try {
    const created = await withTransaction(async (client) => {
      const aR = await client.query('SELECT * FROM hse_cost_actual WHERE id=$1 FOR UPDATE', [costActualId]);
      if (!aR.rows.length) { const e = new Error('关联的实际支出不存在'); e.svcCode = -2; throw e; }
      const actual = aR.rows[0];
      if (actual.is_deleted) { const e = new Error('关联的实际支出已删除，不能再追加分摊'); e.svcCode = -2; throw e; }
      const actualType = actual.record_type || 'normal';
      if (actualType !== recordType) {
        const e = new Error(`分摊记录类型(${recordType})必须与实际支出一致(${actualType})；冲销须以 reversal 实际支出为基准，不得把冲销记录当成普通正向支出`);
        e.svcCode = -1; throw e;
      }
      const signedActual = recordType === 'reversal'
        ? -toCents(actual.actual_amount, { allowNegative: true })
        : toCents(actual.actual_amount, { allowNegative: true });
      const existingNet = await sumAllocationNet(client, costActualId);
      const newSigned = recordType === 'reversal' ? -amtParsed.cents : amtParsed.cents;
      const after = existingNet + newSigned;
      if (after !== signedActual) {
        const e = new Error(
          `分摊总额校验失败：该实际支出金额 ¥${fmtYuan(signedActual)}，已归因 ¥${fmtYuan(existingNet)}，` +
          `本次新增 ¥${fmtYuan(newSigned)} 后合计 ¥${fmtYuan(after)}，必须完全一致。` +
          `独立追加分摊只能用于「补齐」归因（使合计恰好相等）；如需部分归因，请创建不带分摊的「待归因」实际支出；` +
          `如需调整既有归因，请使用分摊修改接口（PUT /api/cost/allocations/:id）。`
        );
        e.svcCode = -1; throw e;
      }
      const acols = ['cost_actual_id', 'request_id', 'record_type', ...COLUMNS.hse_cost_allocation.filter((c) => !['cost_actual_id', 'request_id', 'record_type'].includes(c) && (body[c] !== undefined || body[snakeToCamel(c)] !== undefined))];
      const avals = acols.map((c) => {
        if (c === 'cost_actual_id') return costActualId;
        if (c === 'request_id') return actual.request_id; // 归属申请的 ID 一律取实际支出上的值，防伪造错挂
        if (c === 'record_type') return recordType;
        const v = body[c] !== undefined ? body[c] : body[snakeToCamel(c)];
        return v;
      });
      const r = await client.query(`INSERT INTO hse_cost_allocation(${acols.join(',')}) VALUES(${acols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, avals);
      return rowToCamel(r.rows[0]);
    });
    return ok(created, '创建成功');
  } catch (e) {
    if (e.svcCode === -2) return err(-2, e.message);
    if (e.svcCode === -1) return err(-1, e.message);
    return err(-1, '创建分摊失败（已回滚）：' + e.message);
  }
}

/**
 * P0-2：明确的「分摊修改」流程（替代无限追加）。
 * 事务内锁定分摊行及其实际支出，改后重新校验总额一致性。
 */
async function allocationUpdate(idRaw, body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const id = parseInt(idRaw);
  const amtRaw = pick(body, 'amount');
  const hasAmount = amtRaw !== undefined && amtRaw !== null && amtRaw !== '';
  let amtParsed = null;
  if (hasAmount) {
    amtParsed = parseAmountInput(amtRaw, '分摊金额(amount)');
    if (amtParsed.error) return err(-1, amtParsed.error);
  }
  try {
    const updated = await withTransaction(async (client) => {
      const alR = await client.query('SELECT * FROM hse_cost_allocation WHERE id=$1 FOR UPDATE', [id]);
      if (!alR.rows.length) { const e = new Error('分摊记录不存在'); e.svcCode = -2; throw e; }
      const al = alR.rows[0];
      if (al.is_deleted) { const e = new Error('分摊记录已删除'); e.svcCode = -2; throw e; }
      const recordType = pick(body, 'recordType') ?? pick(body, 'record_type') ?? (al.record_type || 'normal');
      if (!['normal', 'reversal'].includes(recordType)) { const e = new Error('record_type 仅支持 normal/reversal'); e.svcCode = -1; throw e; }
      if (al.cost_actual_id) {
        // 锁定实际支出并重算：换掉旧分摊后的净额必须仍等于实际支出净额
        const aR = await client.query('SELECT * FROM hse_cost_actual WHERE id=$1 FOR UPDATE', [al.cost_actual_id]);
        if (!aR.rows.length) { const e = new Error('关联的实际支出不存在'); e.svcCode = -2; throw e; }
        const actual = aR.rows[0];
        if (actual.is_deleted) { const e = new Error('关联的实际支出已删除，不能修改其分摊'); e.svcCode = -2; throw e; }
        const actualType = actual.record_type || 'normal';
        if (actualType !== recordType) { const e = new Error(`分摊记录类型(${recordType})必须与实际支出一致(${actualType})`); e.svcCode = -1; throw e; }
        const signedActual = recordType === 'reversal'
          ? -toCents(actual.actual_amount, { allowNegative: true })
          : toCents(actual.actual_amount, { allowNegative: true });
        const netAll = await sumAllocationNet(client, al.cost_actual_id);
        const oldSigned = (al.record_type || 'normal') === 'reversal' ? -toCents(al.amount, { allowNegative: true }) : toCents(al.amount, { allowNegative: true });
        const newSigned = hasAmount
          ? (recordType === 'reversal' ? -amtParsed.cents : amtParsed.cents)
          : ((recordType === 'reversal' ? -1 : 1) * oldSigned * ((al.record_type || 'normal') === 'reversal' ? -1 : 1)); // 未传金额：仅记录类型变化时换符号，否则保持不变
        const after = netAll - oldSigned + newSigned;
        if (after !== signedActual) {
          const e = new Error(
            `分摊修改后总额校验失败：该实际支出金额 ¥${fmtYuan(signedActual)}，本条原分摊 ¥${fmtYuan(oldSigned)}，` +
            `修改为 ¥${fmtYuan(newSigned)} 后合计 ¥${fmtYuan(after)}，必须完全一致。`
          );
          e.svcCode = -1; throw e;
        }
      }
      const rec = { ...body };
      const sets = []; const params = []; let idx = 1;
      for (const c of COLUMNS.hse_cost_allocation) {
        const v = rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)];
        if (v !== undefined) { sets.push(`${c}=$${idx}`); params.push(v); idx++; }
      }
      if (!sets.length) { const e = new Error('无可更新字段'); e.svcCode = -1; throw e; }
      params.push(id);
      const r = await client.query(`UPDATE hse_cost_allocation SET ${sets.join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${idx} RETURNING *`, params);
      return rowToCamel(r.rows[0]);
    });
    return ok(updated, '更新成功');
  } catch (e) {
    if (e.svcCode === -2) return err(-2, e.message);
    if (e.svcCode === -1) return err(-1, e.message);
    return err(-1, '更新分摊失败（已回滚）：' + e.message);
  }
}

/**
 * P0-2：分摊删除（软删除）同样受总额约束：
 * 已完整归因的实际支出不允许抽走任一分摊（会破坏归因完整性）——
 * 修正归因请用 allocationUpdate，作废支出请建 reversal 反向实际支出。
 * 申请级计划归因（未关联实际支出）允许删除。
 */
async function allocationDelete(idRaw) {
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const id = parseInt(idRaw);
  try {
    const done = await withTransaction(async (client) => {
      const alR = await client.query('SELECT * FROM hse_cost_allocation WHERE id=$1 FOR UPDATE', [id]);
      if (!alR.rows.length) { const e = new Error('分摊记录不存在'); e.svcCode = -2; throw e; }
      const al = alR.rows[0];
      if (al.is_deleted) { const e = new Error('分摊记录已删除'); e.svcCode = -2; throw e; }
      if (al.cost_actual_id) {
        const aR = await client.query('SELECT * FROM hse_cost_actual WHERE id=$1 FOR UPDATE', [al.cost_actual_id]);
        if (!aR.rows.length) { const e = new Error('关联的实际支出不存在'); e.svcCode = -2; throw e; }
        const actual = aR.rows[0];
        if (!actual.is_deleted) {
          const e = new Error('该分摊已参与实际支出归因，删除会破坏归因完整性：请改用分摊修改接口调整金额/维度，或对实际支出建 reversal 冲销记录');
          e.svcCode = -1; throw e;
        }
      }
      await client.query('UPDATE hse_cost_allocation SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
      return true;
    });
    return ok(done, '删除成功');
  } catch (e) {
    if (e.svcCode === -2) return err(-2, e.message);
    if (e.svcCode === -1) return err(-1, e.message);
    return err(-1, '删除分摊失败（已回滚）：' + e.message);
  }
}

// ============================================================================
// 预算财务状态（口径统一，全部由交易表计算，不信任 spent_amount）
//   年度预算        budgetAmount
//   已承诺总额      committed        = Σ 有效(active)承诺.amount
//   待执行承诺      pendingCommitted = Σ max(承诺.amount - 已被实际净消耗, 0)
//   实际净支出      actual           = Σ(normal) - Σ(reversal)
//   未支出预算余额  balance          = 年度预算 - 实际净支出
//   未承诺可用预算  availableUncommitted = 年度预算 - 待执行承诺（已计入实际的承诺不重复扣减）
//   承诺率          commitmentRate   = 已承诺 / 年度预算
//   执行率          executionRate    = 实际净支出 / 年度预算
// ============================================================================
const PENDING_COMMITTED_SQL = `
  SELECT COALESCE(SUM(GREATEST(c.amount - COALESCE(cons.net, 0), 0)), 0)::numeric AS pending
  FROM hse_cost_commitment c
  LEFT JOIN (
    SELECT commitment_id, SUM(CASE WHEN record_type='reversal' THEN -actual_amount ELSE actual_amount END) AS net
    FROM hse_cost_actual WHERE is_deleted=false AND commitment_id IS NOT NULL
    GROUP BY commitment_id
  ) cons ON cons.commitment_id = c.id
  WHERE c.budget_id=$1 AND c.is_deleted=false AND c.status='active'`;

async function budgetFinancials(budgetIdRaw) {
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const budgetId = parseInt(budgetIdRaw);
  const bR = await pool.query('SELECT id, budget_amount, budget_year, project_name, item_name FROM hse_safety_budget WHERE id=$1 AND is_deleted=false', [budgetId]);
  if (!bR.rows.length) return err(-2, '预算主体不存在');
  const budgetCents = toCents(bR.rows[0].budget_amount, { allowNegative: true });
  const [cR, pR, aR, iR] = await Promise.all([
    pool.query("SELECT COALESCE(SUM(amount),0)::numeric AS s FROM hse_cost_commitment WHERE budget_id=$1 AND is_deleted=false AND status='active'", [budgetId]),
    pool.query(PENDING_COMMITTED_SQL, [budgetId]),
    pool.query("SELECT COALESCE(SUM(CASE WHEN record_type='reversal' THEN -actual_amount ELSE actual_amount END),0)::numeric AS s FROM hse_cost_actual WHERE budget_id=$1 AND is_deleted=false", [budgetId]),
    pool.query('SELECT COUNT(*)::int AS c FROM hse_budget_item WHERE budget_id=$1 AND is_deleted=false', [budgetId]),
  ]);
  const committedCents = toCents(cR.rows[0].s, { allowNegative: true });
  const pendingCents = toCents(pR.rows[0].pending, { allowNegative: true });
  const actualCents = toCents(aR.rows[0].s, { allowNegative: true });
  return ok({
    budgetId,
    budgetYear: bR.rows[0].budget_year,
    projectName: bR.rows[0].project_name,
    itemName: bR.rows[0].item_name,
    budgetAmount: fromCents(budgetCents),
    committed: fromCents(committedCents),
    pendingCommitted: fromCents(pendingCents),
    actual: fromCents(actualCents),
    balance: fromCents(budgetCents - actualCents),
    availableUncommitted: fromCents(budgetCents - pendingCents),
    commitmentRate: pct(committedCents, budgetCents),
    executionRate: pct(actualCents, budgetCents),
    itemCount: parseInt(iR.rows[0].c),
  });
}

async function budgetFinancialOverview(query = {}) {
  const { page, pageSize, keyword, budgetYear, status } = query;
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const where = ['b.is_deleted=false']; const params = [];
  if (budgetYear) { params.push(budgetYear); where.push(`b.budget_year=$${params.length}`); }
  if (keyword) { params.push(`%${keyword}%`); where.push(`(b.project_name ILIKE $${params.length} OR b.item_name ILIKE $${params.length} OR b.budget_code ILIKE $${params.length})`); }
  if (status) { params.push(status); where.push(`b.status=$${params.length}`); }
  const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
  const [cR, lR] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM hse_safety_budget b WHERE ${where.join(' AND ')}`, params),
    pool.query(`SELECT b.id, b.budget_code, b.budget_year, b.project_name, b.item_name, b.budget_amount, b.category, b.department, b.status,
        COALESCE((SELECT SUM(c.amount) FROM hse_cost_commitment c WHERE c.budget_id=b.id AND c.is_deleted=false AND c.status='active'),0)::numeric AS committed,
        COALESCE((SELECT SUM(CASE WHEN a.record_type='reversal' THEN -a.actual_amount ELSE a.actual_amount END) FROM hse_cost_actual a WHERE a.budget_id=b.id AND a.is_deleted=false),0)::numeric AS actual,
        COALESCE((
          SELECT SUM(GREATEST(c.amount - COALESCE(cons.net,0),0))
          FROM hse_cost_commitment c
          LEFT JOIN (SELECT commitment_id, SUM(CASE WHEN record_type='reversal' THEN -actual_amount ELSE actual_amount END) AS net FROM hse_cost_actual WHERE is_deleted=false AND commitment_id IS NOT NULL GROUP BY commitment_id) cons ON cons.commitment_id=c.id
          WHERE c.budget_id=b.id AND c.is_deleted=false AND c.status='active'
        ),0)::numeric AS pending_committed
      FROM hse_safety_budget b WHERE ${where.join(' AND ')} ORDER BY b.budget_year DESC, b.id DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
  ]);
  const data = lR.rows.map((row) => {
    const budgetCents = toCents(row.budget_amount, { allowNegative: true });
    const committedCents = toCents(row.committed, { allowNegative: true });
    const pendingCents = toCents(row.pending_committed, { allowNegative: true });
    const actualCents = toCents(row.actual, { allowNegative: true });
    return {
      budgetId: row.id, budgetCode: row.budget_code, budgetYear: row.budget_year, projectName: row.project_name,
      itemName: row.item_name, category: row.category, department: row.department, status: row.status,
      budgetAmount: fromCents(budgetCents), committed: fromCents(committedCents),
      pendingCommitted: fromCents(pendingCents), actual: fromCents(actualCents),
      balance: fromCents(budgetCents - actualCents),
      availableUncommitted: fromCents(budgetCents - pendingCents),
      commitmentRate: pct(committedCents, budgetCents),
      executionRate: pct(actualCents, budgetCents),
    };
  });
  return list(data, parseInt(cR.rows[0].c), p, ps, '查询成功');
}

// ============================================================================
// 费用统计（按有效分摊归集；未归因单列；年度用 actual_date 自然年）
// ============================================================================
async function costStats(query = {}) {
  const { budgetYear } = query;
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const params = [];
  let yearFilter = '';
  if (budgetYear) {
    params.push(parseInt(budgetYear));
    // 明确按「实际支出日期 actual_date」的自然年过滤，不用模糊月份前缀
    yearFilter = ` AND a.actual_date IS NOT NULL AND EXTRACT(YEAR FROM a.actual_date)=$${params.length}::int`;
  }
  const netActualExpr = "COALESCE(SUM(CASE WHEN a.record_type='reversal' THEN -a.actual_amount ELSE a.actual_amount END),0)::numeric";
  const [totalR, domR, catR, unattributedR] = await Promise.all([
    pool.query(`SELECT ${netActualExpr} AS s FROM hse_cost_actual a WHERE a.is_deleted=false${yearFilter}`, params),
    pool.query(`SELECT d.name AS biz_domain, COALESCE(SUM(CASE WHEN al.record_type='reversal' THEN -al.amount ELSE al.amount END),0)::numeric AS amount
      FROM hse_cost_allocation al JOIN hse_cost_actual a ON al.cost_actual_id=a.id LEFT JOIN hse_cost_biz_domain d ON al.biz_domain_id=d.id
      WHERE al.is_deleted=false AND a.is_deleted=false${yearFilter} GROUP BY d.name ORDER BY amount DESC`, params),
    pool.query(`SELECT c.name AS invest_category, COALESCE(SUM(CASE WHEN al.record_type='reversal' THEN -al.amount ELSE al.amount END),0)::numeric AS amount
      FROM hse_cost_allocation al JOIN hse_cost_actual a ON al.cost_actual_id=a.id LEFT JOIN hse_cost_invest_category c ON al.invest_category_id=c.id
      WHERE al.is_deleted=false AND a.is_deleted=false${yearFilter} GROUP BY c.name ORDER BY amount DESC`, params),
    // 待归因：无任何有效分摊记录的实际净支出（单独体现，不静默丢失）
    pool.query(`SELECT ${netActualExpr} AS s FROM hse_cost_actual a WHERE a.is_deleted=false${yearFilter}
      AND NOT EXISTS (SELECT 1 FROM hse_cost_allocation al WHERE al.cost_actual_id=a.id AND al.is_deleted=false)`, params),
  ]);
  const totalNetCents = toCents(totalR.rows[0].s, { allowNegative: true });
  const unattributedCents = toCents(unattributedR.rows[0].s, { allowNegative: true });
  return ok({
    totalActual: fromCents(totalNetCents),
    allocatedTotal: fromCents(totalNetCents - unattributedCents),
    unattributedActual: fromCents(unattributedCents),
    byDomain: domR.rows.map((r) => ({ bizDomain: r.biz_domain || '未归集', amount: fromCents(toCents(r.amount, { allowNegative: true })) })),
    byCategory: catR.rows.map((r) => ({ investCategory: r.invest_category || '未归集', amount: fromCents(toCents(r.amount, { allowNegative: true })) })),
  });
}

// ============================================================================
// 预算 Excel 导入（P0-3：批次+文件指纹绑定；ON CONFLICT DO NOTHING 并发防重；
//              编码判重 + 空编码业务键判重；不覆盖既有预算；批次留痕）
// ============================================================================
const BUDGET_IMPORT_COLUMN_MAP = {
  预算年度: 'budget_year', 年度: 'budget_year', year: 'budget_year',
  预算编码: 'budget_code', 编码: 'budget_code', code: 'budget_code',
  项目名称: 'project_name', 项目: 'project_name', project: 'project_name',
  明细名称: 'item_name', 事项: 'item_name', 名称: 'item_name', item: 'item_name',
  预算金额: 'budget_amount', 金额: 'budget_amount', amount: 'budget_amount',
  类别: 'category', 分类: 'category',
  部门: 'department', 责任部门: 'department', dept: 'department',
  用途: 'purpose', 使用用途: 'purpose', remark: 'remark', 备注: 'remark',
};
const BUDGET_FIELD_LABELS = {
  budget_year: '预算年度', budget_code: '预算编码', project_name: '项目名称',
  item_name: '事项名称', budget_amount: '预算金额', category: '类别', department: '部门', purpose: '用途',
};
const BUDGET_IMPORT_REQUIRED = ['budget_year', 'project_name', 'item_name', 'budget_amount'];

function parseBudgetFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const out = [];
  for (const raw of rows) {
    const rec = {};
    for (const k of Object.keys(raw)) {
      const key = String(k).trim();
      if (BUDGET_IMPORT_COLUMN_MAP[key] && raw[k] !== '' && raw[k] != null) rec[BUDGET_IMPORT_COLUMN_MAP[key]] = raw[k];
    }
    out.push(rec);
  }
  return out;
}

// P1：行级校验（金额严格解析，绝不把非法文本静默变 0）
function validateBudgetRow(rec, idx) {
  const errors = [];
  for (const f of BUDGET_IMPORT_REQUIRED) {
    if (rec[f] === undefined || rec[f] === '' || rec[f] == null) errors.push(`第${idx}行缺少必填字段「${BUDGET_FIELD_LABELS[f] || f}」`);
  }
  if (rec.budget_amount !== undefined && rec.budget_amount !== '' && rec.budget_amount != null) {
    const p = parseAmountInput(rec.budget_amount, `第${idx}行预算金额`);
    if (p.error) errors.push(p.error);
  }
  if (rec.budget_year !== undefined && rec.budget_year !== '' && rec.budget_year != null) {
    if (!/^\d{4}$/.test(String(rec.budget_year).trim())) errors.push(`第${idx}行预算年度格式应为4位数字（如 2026）`);
  }
  if (rec.budget_code !== undefined && rec.budget_code !== '' && rec.budget_code != null && String(rec.budget_code).length > 64) {
    errors.push(`第${idx}行预算编码过长（超过 64 字符）`);
  }
  return errors;
}

// 文件指纹：SHA-256（预览与确认必须绑定同一指纹，防止「预览 A、确认 B」）
function fileFingerprint(filePath) {
  const buf = fs.readFileSync(filePath);
  return { sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length };
}

// 空编码预算的业务键：年度 + 项目 + 事项 + 金额（金额按分归一，1600 与 1600.00 同键）
function budgetDedupKey(rec) {
  return [normStr(rec.budget_year), normStr(rec.project_name), normStr(rec.item_name), String(toCents(rec.budget_amount))].join('｜');
}

// 载入既有预算的判重键集合（编码集合 + 业务键集合；业务键仅在项目/事项非空时有意义）
async function loadExistingBudgetKeys() {
  const r = await pool.query('SELECT budget_code, budget_year, project_name, item_name, budget_amount FROM hse_safety_budget WHERE is_deleted=false');
  const codes = new Set();
  const keys = new Set();
  for (const row of r.rows) {
    const code = normStr(row.budget_code);
    if (code) codes.add(code);
    if (normStr(row.project_name) && normStr(row.item_name)) keys.add(budgetDedupKey(row));
  }
  return { codes, keys };
}

// 生成唯一批次号（batch_no 有唯一索引，冲突自动重试）
async function createImportBatch({ fileName, filePath, fingerprint, size, totalRows }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const batchNo = `IMP-BUDGET-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}${attempt ? '-' + attempt : ''}`;
    try {
      const r = await pool.query(
        "INSERT INTO hse_cost_import_batch(module, batch_no, file_name, file_path, file_fingerprint, file_size, total_rows, status) VALUES('safety_budget',$1,$2,$3,$4,$5,$6,'previewed') RETURNING batch_no",
        [batchNo, fileName || null, filePath || null, fingerprint, size, totalRows]
      );
      return r.rows[0].batch_no;
    } catch (e) {
      if (e.code === '23505' && attempt < 2) continue;
      throw e;
    }
  }
  throw new Error('无法生成唯一导入批次号，请重试');
}

async function budgetImportPreview(filePath, operator = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  if (!filePath) return err(-1, '未收到上传文件');
  let fp;
  try { fp = fileFingerprint(filePath); } catch (e) { return err(-1, '文件读取失败：' + e.message); }
  let recs;
  try { recs = parseBudgetFile(filePath); } catch (e) { return err(-1, '文件解析失败：' + e.message); }
  const { codes, keys } = await loadExistingBudgetKeys();
  const seenCodes = new Set();
  const seenKeys = new Set();
  const rows = [];
  let errorCount = 0;
  let dupCount = 0;
  recs.forEach((rec, i) => {
    const idx = i + 2; // 含表头
    const errors = validateBudgetRow(rec, idx);
    let dup = false;
    let dupReason = '';
    if (!errors.length) {
      const code = normStr(rec.budget_code);
      const key = budgetDedupKey(rec);
      if (code && (codes.has(code) || seenCodes.has(code))) { dup = true; dupReason = '预算编码已存在或文件内重复'; }
      else if (!code && keys.has(key)) { dup = true; dupReason = '同一「年度+项目+事项+金额」的预算已存在（空编码按业务键判重）'; }
      else if (!code && seenKeys.has(key)) { dup = true; dupReason = '文件内存在相同业务键的预算'; }
      if (code) seenCodes.add(code);
      seenKeys.add(key);
    }
    if (errors.length) errorCount++;
    if (dup) dupCount++;
    rows.push({ rowIndex: idx, data: rec, errors, duplicate: dup, duplicateReason: dupReason, status: errors.length ? 'error' : (dup ? 'duplicate' : 'ok') });
  });
  // 同一文件是否已成功导入过（指纹匹配）→ 提示重复导入
  const prevDone = await pool.query(
    "SELECT batch_no, inserted, skipped, failed FROM hse_cost_import_batch WHERE module='safety_budget' AND file_fingerprint=$1 AND status='done' ORDER BY id DESC LIMIT 1",
    [fp.sha256]
  );
  const alreadyImported = prevDone.rows.length > 0;
  let batchNo;
  try {
    batchNo = await createImportBatch({ fileName: operator.fileName, filePath, fingerprint: fp.sha256, size: fp.size, totalRows: recs.length });
  } catch (e) {
    return err(-1, '创建导入批次失败：' + e.message);
  }
  return ok({
    batchNo,
    total: recs.length,
    errorCount,
    duplicateCount: dupCount,
    alreadyImported,
    previousBatchNo: alreadyImported ? prevDone.rows[0].batch_no : null,
    rows,
  }, '预览成功');
}

async function budgetImportConfirm(filePath, operator = {}, batchNoRaw) {
  const blocked = requireConn(); if (blocked) return blocked;
  const schemaErr = await requireSchema(); if (schemaErr) return schemaErr;
  const batchNo = normStr(batchNoRaw);
  if (!batchNo) return err(-1, '缺少导入批次号(batchNo)：请先执行预览，再基于预览返回的批次确认；防止确认与预览不是同一份文件');
  if (!filePath) return err(-1, '未收到上传文件');
  let fp;
  try { fp = fileFingerprint(filePath); } catch (e) { return err(-1, '文件读取失败：' + e.message); }
  try {
    const result = await withTransaction(async (client) => {
      // 行锁批次：串行化同一批次的并发确认
      const bR = await client.query('SELECT * FROM hse_cost_import_batch WHERE batch_no=$1 FOR UPDATE', [batchNo]);
      if (!bR.rows.length) { const e = new Error('导入批次不存在或已过期：请重新执行预览'); e.svcCode = -2; throw e; }
      const batch = bR.rows[0];
      if (batch.file_fingerprint && batch.file_fingerprint !== fp.sha256) {
        const e = new Error('待确认文件与预览时的文件不一致（文件已被替换）：请重新选择文件并预览后再确认');
        e.svcCode = -1; throw e;
      }
      if (batch.status === 'done') {
        // 同批次重复确认：直接返回首次结果，绝不重复插入
        return {
          batchNo, total: batch.total_rows, inserted: batch.inserted, updated: 0,
          skipped: batch.skipped, failed: batch.failed, duplicateConfirm: true,
        };
      }
      let recs;
      try { recs = parseBudgetFile(filePath); } catch (e) { const x = new Error('文件解析失败：' + e.message); x.svcCode = -1; throw x; }
      const existing = await loadExistingBudgetKeys();
      const codes = new Set(existing.codes);
      const keys = new Set(existing.keys);
      const toInsert = [];
      let skipped = 0;
      let failed = 0;
      const errorDetail = [];
      for (let i = 0; i < recs.length; i++) {
        const rec = recs[i];
        const idx = i + 2;
        const errors = validateBudgetRow(rec, idx);
        if (errors.length) { failed++; errorDetail.push(errors.join('; ')); continue; }
        const code = normStr(rec.budget_code);
        const key = budgetDedupKey(rec);
        if (code && codes.has(code)) { skipped++; continue; }              // 编码判重（已存在 → 跳过，不覆盖）
        if (!code && keys.has(key)) { skipped++; continue; }               // 空编码业务键判重
        toInsert.push({ rec, key });
        if (code) codes.add(code);
        keys.add(key);
      }
      let inserted = 0;
      for (const { rec } of toInsert) {
        // ON CONFLICT DO NOTHING（无 arbiter）：撞上编码唯一索引或业务键唯一索引都跳过，
        // 并发导入的防重由数据库约束保证，绝不覆盖既有真实预算。
        const r = await client.query(
          `INSERT INTO hse_safety_budget(budget_year, budget_code, project_name, item_name, budget_amount, category, department, purpose, created_at, updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING RETURNING id`,
          [parseInt(rec.budget_year, 10), normStr(rec.budget_code) || null, normStr(rec.project_name), normStr(rec.item_name),
            fromCents(toCents(rec.budget_amount)), normStr(rec.category) || null, normStr(rec.department) || null, normStr(rec.purpose) || null]
        );
        if (r.rows.length) inserted++;
        else skipped++; // 数据库层判重（并发撞键）
      }
      await client.query(
        `UPDATE hse_cost_import_batch
         SET status='done', file_name=COALESCE($2, file_name), operator_id=COALESCE($3, operator_id), operator_name=COALESCE($4, operator_name),
             total_rows=$5, inserted=$6, updated=0, skipped=$7, failed=$8, error_detail=$9
         WHERE batch_no=$1`,
        [batchNo, operator.fileName || null, operator.operatorId || null, operator.operatorName || null,
          recs.length, inserted, skipped, failed, errorDetail.join('\n').slice(0, 4000) || null]
      );
      return { batchNo, total: recs.length, inserted, updated: 0, skipped, failed, errors: errorDetail.slice(0, 10) };
    });
    return ok(result, '导入完成');
  } catch (e) {
    // 事务已回滚（预算与批次写入均未落库）；尽力把批次标记为 failed 便于排查（不影响已回滚数据）
    try {
      await pool.query("UPDATE hse_cost_import_batch SET status='failed', error_detail=$1 WHERE batch_no=$2 AND status<>'done'", [String(e.message).slice(0, 4000), batchNo]);
    } catch (_) { /* 忽略 */ }
    if (e.svcCode === -2) return err(-2, e.message);
    if (e.svcCode === -1) return err(-1, e.message);
    return err(-1, '导入失败（已回滚，未写入任何数据）：' + e.message);
  }
}

module.exports = {
  // 参照
  listBizDomains, listOpTypes, listInvestCategories,
  // 预算明细
  budgetItemList, budgetItemDetail, budgetItemCreate, budgetItemUpdate, budgetItemDelete,
  // 费用申请
  costRequestList, costRequestDetail, costRequestCreate, costRequestUpdate, costRequestDelete,
  // 承诺 / 实际 / 归因
  commitmentList, commitmentCreate, actualList, actualCreate,
  allocationList, allocationCreate, allocationUpdate, allocationDelete,
  auditDuplicateCommitments,
  genericCrud,
  // 财务状态 / 统计
  budgetFinancials, budgetFinancialOverview, costStats,
  // 导入
  budgetImportPreview, budgetImportConfirm,
  // 事务助手（供测试/复用）
  withTransaction,
  // 金额助手（供测试断言）
  toCents, fromCents, parseAmountInput,
  // 结构检查（只读；供测试与运维核对，绝不执行 DDL）
  checkCostSchema, REQUIRED_SCHEMA, MIGRATION_FILES,
  // 文件指纹（供测试）
  fileFingerprint,
};
