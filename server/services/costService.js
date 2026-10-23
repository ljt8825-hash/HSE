/**
 * 安全生产费用业务域（任务第二优先级 P2）—— 业务层
 * ---------------------------------------------------------------------------
 * 数据流：预算主体(hse_safety_budget) → 预算明细(hse_budget_item)
 *        → 费用申请(hse_cost_request，可关联隐患/事故/检查/培训等)
 *        → 承诺(hse_cost_commitment) → 实际支出(hse_cost_actual)
 *        → 成本归因(hse_cost_allocation：公司→业务领域→作业类型→投入类别→对象→事件→费用)
 *
 * 关键约束（与任务书一致）：
 *   - 预算余额 / 执行率 由承诺额、实际额从交易表计算，不把 hse_safety_budget.spent_amount
 *     当作可信的「已使用」手工数字。
 *   - 所有写操作参数化，列名走白名单，杜绝 SQL 注入。
 *   - 参照维度（业务领域/作业类型/投入类别）可配置、可扩展。
 *   - 导入具备 解析→校验→预览→确认→批次留痕→防重 全流程。
 */

const fs = require('fs');
const path = require('path');
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
  hse_cost_actual: ['request_id', 'commitment_id', 'budget_id', 'actual_amount', 'actual_date', 'fiscal_month', 'payment_method', 'invoice_no', 'payee', 'remark', 'created_by', 'updated_by'],
  hse_cost_allocation: ['cost_actual_id', 'request_id', 'company', 'biz_domain_id', 'op_type_id', 'invest_category_id', 'object_type', 'object_id', 'object_name', 'event_type', 'event_id', 'event_name', 'amount', 'remark', 'created_by', 'updated_by'],
};

const REFERENCE_COLUMNS = {
  hse_cost_biz_domain: ['code', 'name', 'sort_order', 'is_active'],
  hse_cost_op_type: ['biz_domain_id', 'code', 'name', 'sort_order', 'is_active'],
  hse_cost_invest_category: ['code', 'name', 'sort_order', 'is_active'],
};

function snakeToCamel(s) { return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }
function rowToCamel(row) { const o = {}; if (!row) return o; for (const k of Object.keys(row)) o[snakeToCamel(k)] = row[k]; return o; }

// 运行期自愈：若新表不存在，则执行正式迁移文件（幂等）。保证 dev / 测试环境表结构一致。
let _ensurePromise = null;
async function ensureCostTables() {
  if (!isConnected()) return;
  if (_ensurePromise) return _ensurePromise;
  _ensurePromise = (async () => {
    try {
      const chk = await pool.query("SELECT to_regclass('public.hse_cost_request') AS t");
      if (chk.rows[0].t) return;
      const sqlPath = path.join(__dirname, '..', 'sql', '20261023_hse_safety_cost_domain.sql');
      const sql = fs.readFileSync(sqlPath, 'utf8');
      for (const stmt of sql.split(';')) {
        const s = stmt.trim();
        if (!s) continue;
        try { await pool.query(s); } catch (e) { /* 幂等忽略 */ }
      }
    } catch (e) { /* 忽略自愈失败，交由具体查询报错 */ }
  })();
  return _ensurePromise;
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
  await ensureCostTables();
  const r = await pool.query('SELECT id, code, name, sort_order, is_active FROM hse_cost_biz_domain WHERE is_active=true ORDER BY sort_order, id');
  return ok(r.rows.map(rowToCamel));
}
async function listOpTypes(bizDomainId) {
  if (!isConnected()) return ok([], '内存模式无数据');
  await ensureCostTables();
  const params = []; const where = ['is_active=true'];
  if (bizDomainId) { params.push(bizDomainId); where.push(`biz_domain_id=$${params.length}`); }
  const r = await pool.query(`SELECT id, biz_domain_id, code, name, sort_order, is_active FROM hse_cost_op_type WHERE ${where.join(' AND ')} ORDER BY sort_order, id`, params);
  return ok(r.rows.map(rowToCamel));
}
async function listInvestCategories() {
  if (!isConnected()) return ok([], '内存模式无数据');
  await ensureCostTables();
  const r = await pool.query('SELECT id, code, name, sort_order, is_active FROM hse_cost_invest_category WHERE is_active=true ORDER BY sort_order, id');
  return ok(r.rows.map(rowToCamel));
}

// ============================================================================
// 预算明细
// ============================================================================
async function budgetItemList(query = {}) {
  const { page, pageSize, budgetId, keyword, bizDomainId } = query;
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
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
  await ensureCostTables();
  const r = await pool.query('SELECT * FROM hse_budget_item WHERE id=$1 AND is_deleted=false', [parseInt(idRaw)]);
  if (!r.rows.length) return err(-2, '预算明细不存在');
  return ok(rowToCamel(r.rows[0]));
}
async function budgetItemCreate(body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  if (!body.budgetId && !body.budget_id) return err(-1, '必须关联预算主体(budgetId)');
  if (!body.itemName && !body.item_name) return err(-1, '请填写明细名称(itemName)');
  await ensureCostTables();
  const rec = { ...body };
  const cols = COLUMNS.hse_budget_item.filter((c) => rec[c] !== undefined || rec[snakeToCamel(c)] !== undefined);
  const vals = cols.map((c) => (rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)]));
  const r = await pool.query(`INSERT INTO hse_budget_item(${cols.join(',')}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
  return ok(rowToCamel(r.rows[0]), '创建成功');
}
async function budgetItemUpdate(idRaw, body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
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
  await ensureCostTables();
  await pool.query('UPDATE hse_budget_item SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [parseInt(idRaw)]);
  return ok(null, '删除成功');
}

// ============================================================================
// 费用申请（可关联业务来源）
// ============================================================================
function genRequestNo() { return `CR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`; }

async function costRequestList(query = {}) {
  const { page, pageSize, keyword, status, sourceType, budgetId } = query;
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
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
  await ensureCostTables();
  const r = await pool.query('SELECT * FROM hse_cost_request WHERE id=$1 AND is_deleted=false', [parseInt(idRaw)]);
  if (!r.rows.length) return err(-2, '费用申请不存在');
  const row = rowToCamel(r.rows[0]);
  const alR = await pool.query('SELECT * FROM hse_cost_allocation WHERE request_id=$1 AND is_deleted=false ORDER BY id', [parseInt(idRaw)]);
  row.allocations = alR.rows.map(rowToCamel);
  return ok(row);
}
async function costRequestCreate(body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  if (!body.title) return err(-1, '请填写申请标题(title)');
  await ensureCostTables();
  const rec = { ...body };
  const cols = COLUMNS.hse_cost_request.filter((c) => rec[c] !== undefined || rec[snakeToCamel(c)] !== undefined);
  const vals = cols.map((c) => (rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)]));
  const r = await pool.query(`INSERT INTO hse_cost_request(request_no, ${cols.join(',')}) VALUES($1, ${cols.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`, [genRequestNo(), ...vals]);
  const created = rowToCamel(r.rows[0]);
  // 申请阶段可携带计划归因（不依赖实际支出）
  if (Array.isArray(body.allocations)) {
    for (const a of body.allocations) {
      const acols = COLUMNS.hse_cost_allocation.filter((c) => a[c] !== undefined || a[snakeToCamel(c)] !== undefined);
      const avals = acols.map((c) => (a[c] !== undefined ? a[c] : a[snakeToCamel(c)]));
      await pool.query(`INSERT INTO hse_cost_allocation(request_id, ${acols.join(',')}) VALUES($1, ${acols.map((_, i) => `$${i + 2}`).join(',')})`, [created.id, ...avals]);
    }
  }
  return ok(created, '创建成功');
}
async function costRequestUpdate(idRaw, body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
  const id = parseInt(idRaw);
  const existing = await pool.query('SELECT * FROM hse_cost_request WHERE id=$1 AND is_deleted=false', [id]);
  if (!existing.rows.length) return err(-2, '费用申请不存在');
  const rec = { ...body };
  const sets = []; const params = []; let idx = 1;
  for (const c of COLUMNS.hse_cost_request) {
    const v = rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)];
    if (v !== undefined) { sets.push(`${c}=$${idx}`); params.push(v); idx++; }
  }
  if (sets.length) {
    params.push(id);
    await pool.query(`UPDATE hse_cost_request SET ${sets.join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${idx}`, params);
  }
  // 审批通过 → 自动生成承诺（已占用/已承诺资金），避免重复生成
  const newStatus = rec.status !== undefined ? rec.status : rec[snakeToCamel('status')];
  if (newStatus === 'approved') {
    const amt = parseFloat(rec.approvedAmount !== undefined ? rec.approvedAmount : rec.approved_amount) || parseFloat(existing.rows[0].apply_amount) || 0;
    const chk = await pool.query('SELECT COUNT(*)::int AS c FROM hse_cost_commitment WHERE request_id=$1 AND is_deleted=false', [id]);
    if (parseInt(chk.rows[0].c) === 0) {
      await pool.query('INSERT INTO hse_cost_commitment(request_id, budget_id, amount, commitment_date, status) VALUES($1,$2,$3,CURRENT_DATE,\'active\')', [id, existing.rows[0].budget_id, amt]);
    }
  }
  const r = await pool.query('SELECT * FROM hse_cost_request WHERE id=$1', [id]);
  return ok(rowToCamel(r.rows[0]), '更新成功');
}
async function costRequestDelete(idRaw) {
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
  await pool.query('UPDATE hse_cost_request SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [parseInt(idRaw)]);
  return ok(null, '删除成功');
}

// ============================================================================
// 承诺 / 实际支出 / 归因
// ============================================================================
async function genericCrud(table, idRaw, body, query) {
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
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
  await ensureCostTables();
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
  if (!body.requestId && !body.request_id) return err(-1, '承诺必须关联费用申请(requestId)');
  await ensureCostTables();
  const rec = { ...body };
  const cols = COLUMNS.hse_cost_commitment.filter((c) => rec[c] !== undefined || rec[snakeToCamel(c)] !== undefined);
  const vals = cols.map((c) => (rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)]));
  const r = await pool.query(`INSERT INTO hse_cost_commitment(${cols.join(',')}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
  return ok(rowToCamel(r.rows[0]), '创建成功');
}

async function actualList(query = {}) {
  const { page, pageSize, requestId, budgetId } = query;
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
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
async function actualCreate(body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  if (!body.requestId && !body.request_id) return err(-1, '实际支出必须关联费用申请(requestId)');
  await ensureCostTables();
  const rec = { ...body };
  const cols = COLUMNS.hse_cost_actual.filter((c) => rec[c] !== undefined || rec[snakeToCamel(c)] !== undefined);
  const vals = cols.map((c) => (rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)]));
  const r = await pool.query(`INSERT INTO hse_cost_actual(${cols.join(',')}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
  const created = rowToCamel(r.rows[0]);
  // 实际支出携带成本归因（权威归集维度）
  if (Array.isArray(body.allocations)) {
    for (const a of body.allocations) {
      const acols = ['cost_actual_id', ...COLUMNS.hse_cost_allocation.filter((c) => c !== 'cost_actual_id' && (a[c] !== undefined || a[snakeToCamel(c)] !== undefined))];
      const avals = acols.map((c) => (c === 'cost_actual_id' ? created.id : (a[c] !== undefined ? a[c] : a[snakeToCamel(c)])));
      await pool.query(`INSERT INTO hse_cost_allocation(${acols.join(',')}) VALUES(${acols.map((_, i) => `$${i + 1}`).join(',')})`, avals);
    }
  }
  return ok(created, '创建成功');
}

async function allocationList(query = {}) {
  const { page, pageSize, costActualId, requestId, bizDomainId } = query;
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
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
async function allocationCreate(body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
  const rec = { ...body };
  const cols = COLUMNS.hse_cost_allocation.filter((c) => rec[c] !== undefined || rec[snakeToCamel(c)] !== undefined);
  const vals = cols.map((c) => (rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)]));
  const r = await pool.query(`INSERT INTO hse_cost_allocation(${cols.join(',')}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
  return ok(rowToCamel(r.rows[0]), '创建成功');
}

// ============================================================================
// 预算财务状态（关键：由交易表计算，不信任 hse_safety_budget.spent_amount）
// ============================================================================
async function budgetFinancials(budgetIdRaw) {
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
  const budgetId = parseInt(budgetIdRaw);
  const bR = await pool.query('SELECT id, budget_amount, budget_year, project_name, item_name FROM hse_safety_budget WHERE id=$1 AND is_deleted=false', [budgetId]);
  if (!bR.rows.length) return err(-2, '预算主体不存在');
  const budgetAmount = parseFloat(bR.rows[0].budget_amount) || 0;
  const [cR, aR, iR] = await Promise.all([
    pool.query('SELECT COALESCE(SUM(amount),0)::numeric AS s FROM hse_cost_commitment WHERE budget_id=$1 AND is_deleted=false AND status=\'active\'', [budgetId]),
    pool.query('SELECT COALESCE(SUM(actual_amount),0)::numeric AS s FROM hse_cost_actual WHERE budget_id=$1 AND is_deleted=false', [budgetId]),
    pool.query('SELECT COUNT(*)::int AS c FROM hse_budget_item WHERE budget_id=$1 AND is_deleted=false', [budgetId]),
  ]);
  const committed = parseFloat(cR.rows[0].s) || 0;
  const actual = parseFloat(aR.rows[0].s) || 0;
  const balance = Math.round((budgetAmount - actual) * 100) / 100;
  const executionRate = budgetAmount > 0 ? Math.round((actual / budgetAmount) * 10000) / 100 : 0;
  return ok({
    budgetId,
    budgetAmount: Math.round(budgetAmount * 100) / 100,
    committed: Math.round(committed * 100) / 100,
    actual: Math.round(actual * 100) / 100,
    balance,
    executionRate,
    itemCount: parseInt(iR.rows[0].c),
    budgetYear: bR.rows[0].budget_year,
    projectName: bR.rows[0].project_name,
    itemName: bR.rows[0].item_name,
  });
}

async function budgetFinancialOverview(query = {}) {
  const { page, pageSize, keyword, budgetYear, status } = query;
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
  const where = ['b.is_deleted=false']; const params = [];
  if (budgetYear) { params.push(budgetYear); where.push(`b.budget_year=$${params.length}`); }
  if (keyword) { params.push(`%${keyword}%`); where.push(`(b.project_name ILIKE $${params.length} OR b.item_name ILIKE $${params.length} OR b.budget_code ILIKE $${params.length})`); }
  if (status) { params.push(status); where.push(`b.status=$${params.length}`); }
  const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
  const [cR, lR] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM hse_safety_budget b WHERE ${where.join(' AND ')}`, params),
    pool.query(`SELECT b.id, b.budget_code, b.budget_year, b.project_name, b.item_name, b.budget_amount, b.category, b.department, b.status,
        COALESCE((SELECT SUM(c.amount) FROM hse_cost_commitment c WHERE c.budget_id=b.id AND c.is_deleted=false AND c.status='active'),0)::numeric AS committed,
        COALESCE((SELECT SUM(a.actual_amount) FROM hse_cost_actual a WHERE a.budget_id=b.id AND a.is_deleted=false),0)::numeric AS actual
      FROM hse_safety_budget b WHERE ${where.join(' AND ')} ORDER BY b.budget_year DESC, b.id DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
  ]);
  const data = lR.rows.map((row) => {
    const budgetAmount = parseFloat(row.budget_amount) || 0;
    const actual = parseFloat(row.actual) || 0;
    const committed = parseFloat(row.committed) || 0;
    return {
      budgetId: row.id, budgetCode: row.budget_code, budgetYear: row.budget_year, projectName: row.project_name,
      itemName: row.item_name, category: row.category, department: row.department, status: row.status,
      budgetAmount: Math.round(budgetAmount * 100) / 100, committed: Math.round(committed * 100) / 100,
      actual: Math.round(actual * 100) / 100,
      balance: Math.round((budgetAmount - actual) * 100) / 100,
      executionRate: budgetAmount > 0 ? Math.round((actual / budgetAmount) * 10000) / 100 : 0,
    };
  });
  return list(data, parseInt(cR.rows[0].c), p, ps, '查询成功');
}

// ============================================================================
// 费用统计（按业务领域 / 投入类别归集实际支出）
// ============================================================================
async function costStats(query = {}) {
  const { budgetYear, sourceType } = query;
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
  const params = []; const where = ['al.is_deleted=false', 'a.is_deleted=false'];
  if (budgetYear) { params.push(budgetYear); where.push(`a.fiscal_month LIKE $${params.length} || '%'`); }
  const [totalR, domR, catR] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(al.amount),0)::numeric AS s FROM hse_cost_allocation al JOIN hse_cost_actual a ON al.cost_actual_id=a.id WHERE ${where.join(' AND ')}`, params),
    pool.query(`SELECT d.name AS biz_domain, COALESCE(SUM(al.amount),0)::numeric AS amount FROM hse_cost_allocation al JOIN hse_cost_actual a ON al.cost_actual_id=a.id LEFT JOIN hse_cost_biz_domain d ON al.biz_domain_id=d.id WHERE ${where.join(' AND ')} GROUP BY d.name ORDER BY amount DESC`, params),
    pool.query(`SELECT c.name AS invest_category, COALESCE(SUM(al.amount),0)::numeric AS amount FROM hse_cost_allocation al JOIN hse_cost_actual a ON al.cost_actual_id=a.id LEFT JOIN hse_cost_invest_category c ON al.invest_category_id=c.id WHERE ${where.join(' AND ')} GROUP BY c.name ORDER BY amount DESC`, params),
  ]);
  return ok({
    totalActual: Math.round(parseFloat(totalR.rows[0].s) * 100) / 100,
    byDomain: domR.rows.map((r) => ({ bizDomain: r.biz_domain || '未归集', amount: Math.round(parseFloat(r.amount) * 100) / 100 })),
    byCategory: catR.rows.map((r) => ({ investCategory: r.invest_category || '未归集', amount: Math.round(parseFloat(r.amount) * 100) / 100 })),
  });
}

// ============================================================================
// 预算 Excel 导入（解析→校验→预览→确认→批次留痕→防重）
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
const BUDGET_IMPORT_NUMERIC = ['budget_year', 'budget_amount'];
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

function validateBudgetRow(rec, idx) {
  const errors = [];
  for (const f of BUDGET_IMPORT_REQUIRED) {
    if (rec[f] === undefined || rec[f] === '' || rec[f] == null) errors.push(`第${idx}行缺少必填字段「${f}」`);
  }
  for (const f of BUDGET_IMPORT_NUMERIC) {
    if (rec[f] !== undefined && rec[f] !== '' && isNaN(Number(rec[f]))) errors.push(`第${idx}行「${f}」不是数字`);
  }
  if (rec.budget_year !== undefined && rec.budget_year !== '' && (!/^\d{4}$/.test(String(rec.budget_year)))) errors.push(`第${idx}行预算年度格式应为4位数字`);
  return errors;
}

async function budgetImportPreview(filePath) {
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
  let recs;
  try { recs = parseBudgetFile(filePath); } catch (e) { return err(-1, '文件解析失败：' + e.message); }
  const rows = []; let errorCount = 0; let dupCount = 0;
  // 已存在预算编码集合（防重）
  const existing = await pool.query('SELECT budget_code FROM hse_safety_budget WHERE is_deleted=false AND budget_code IS NOT NULL');
  const codes = new Set(existing.rows.map((r) => r.budget_code));
  const seen = new Set();
  recs.forEach((rec, i) => {
    const idx = i + 2; // 含表头
    const errors = validateBudgetRow(rec, idx);
    let dup = false;
    if (rec.budget_code && (codes.has(rec.budget_code) || seen.has(rec.budget_code))) dup = true;
    if (rec.budget_code) seen.add(rec.budget_code);
    if (errors.length) errorCount++;
    if (dup) dupCount++;
    rows.push({ rowIndex: idx, data: rec, errors, duplicate: dup, status: errors.length ? 'error' : (dup ? 'duplicate' : 'ok') });
  });
  return ok({ total: recs.length, errorCount, duplicateCount: dupCount, rows }, '预览成功');
}

async function budgetImportConfirm(filePath, operator = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
  let recs;
  try { recs = parseBudgetFile(filePath); } catch (e) { return err(-1, '文件解析失败：' + e.message); }
  const batchNo = `IMP-BUDGET-${Date.now()}`;
  let inserted = 0, updated = 0, skipped = 0, failed = 0; const errorDetail = [];
  const existing = await pool.query('SELECT budget_code FROM hse_safety_budget WHERE is_deleted=false AND budget_code IS NOT NULL');
  const codes = new Set(existing.rows.map((r) => r.budget_code));
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i]; const idx = i + 2;
    const errors = validateBudgetRow(rec, idx);
    if (errors.length) { failed++; errorDetail.push(errors.join('; ')); continue; }
    // 防重：已有预算编码则跳过（不覆盖既有数据）
    if (rec.budget_code && codes.has(rec.budget_code)) { skipped++; continue; }
    try {
      const cols = ['budget_year', 'budget_code', 'project_name', 'item_name', 'budget_amount', 'category', 'department', 'purpose'];
      const vals = [rec.budget_year, rec.budget_code || null, rec.project_name, rec.item_name, rec.budget_amount, rec.category || null, rec.department || null, rec.purpose || null];
      await pool.query(`INSERT INTO hse_safety_budget(${cols.join(',')}, created_at, updated_at) VALUES(${cols.map((_, i) => `$${i + 1}`).join(',')}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, vals);
      if (rec.budget_code) codes.add(rec.budget_code);
      inserted++;
    } catch (e) { failed++; errorDetail.push(`第${idx}行写入失败：${e.message}`); }
  }
  await pool.query('INSERT INTO hse_cost_import_batch(module, batch_no, file_name, operator_id, operator_name, total_rows, inserted, updated, skipped, failed, status, error_detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,\'done\',$11)',
    ['safety_budget', batchNo, operator.fileName || null, operator.operatorId || null, operator.operatorName || null, recs.length, inserted, updated, skipped, failed, errorDetail.join('\n').slice(0, 4000) || null]);
  return ok({ batchNo, total: recs.length, inserted, updated, skipped, failed }, '导入完成');
}

module.exports = {
  // 参照
  listBizDomains, listOpTypes, listInvestCategories,
  // 预算明细
  budgetItemList, budgetItemDetail, budgetItemCreate, budgetItemUpdate, budgetItemDelete,
  // 费用申请
  costRequestList, costRequestDetail, costRequestCreate, costRequestUpdate, costRequestDelete,
  // 承诺 / 实际 / 归因
  commitmentList, commitmentCreate, actualList, actualCreate, allocationList, allocationCreate,
  genericCrud,
  // 财务状态 / 统计
  budgetFinancials, budgetFinancialOverview, costStats,
  // 导入
  budgetImportPreview, budgetImportConfirm,
  // 自检
  ensureCostTables,
};
