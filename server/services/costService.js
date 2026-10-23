/**
 * 安全生产费用业务域（任务第二优先级 P2）—— 业务层（返修强化版）
 * ---------------------------------------------------------------------------
 * 数据流：预算主体(hse_safety_budget) → 预算明细(hse_budget_item)
 *        → 费用申请(hse_cost_request，可关联隐患/事故/检查/培训等)
 *        → 承诺(hse_cost_commitment) → 实际支出(hse_cost_actual)
 *        → 成本归因(hse_cost_allocation：公司→业务领域→作业类型→投入类别→对象→事件→费用)
 *
 * 返修要点（对应任务书）：
 *   修正1 事务：创建申请+分摊、创建实际+分摊、审批+承诺，均在「单连接事务」内完成，
 *              任何关键步骤失败即 ROLLBACK 并释放连接，绝不留下半条记录。
 *   修正2 金额：所有金额以「分」为整数比较（NUMERIC(14,2) 精确），不依赖浮点；
 *              实际与分摊必须一致（单归属 / 多域合计）；禁负数 / 空分摊；
 *              退款 / 冲销 / 更正是独立 record_type='reversal' 反向记录，绝不改历史；
 *              无分摊的实际支出为「待归因」独立状态，单独统计、不计入已归集域。
 *   修正3 口径：年度预算 / 已承诺 / 待执行承诺 / 实际净支出 / 未支出余额 / 未承诺可用 /
 *              承诺率 / 执行率 全部由交易表计算；已计入实际支出的承诺不重复扣减；
 *              汇总基于有效分摊，未归因单列；年度过滤用 actual_date 自然年（明确字段）。
 *   修正4 防重：审批用 SELECT ... FOR UPDATE 行锁串行化同一申请 + 唯一约束 backstop，
 *              重复审批只更新既有有效承诺金额、不重复创建；撤回/驳回/取消在未被实际
 *              支出消耗时释放承诺；提供审计接口查历史重复承诺（只报不删）。
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
  hse_cost_actual: ['request_id', 'commitment_id', 'budget_id', 'actual_amount', 'actual_date', 'fiscal_month', 'payment_method', 'invoice_no', 'payee', 'record_type', 'remark', 'created_by', 'updated_by'],
  hse_cost_allocation: ['cost_actual_id', 'request_id', 'company', 'biz_domain_id', 'op_type_id', 'invest_category_id', 'object_type', 'object_id', 'object_name', 'event_type', 'event_id', 'event_name', 'amount', 'record_type', 'remark', 'created_by', 'updated_by'],
};

const REFERENCE_COLUMNS = {
  hse_cost_biz_domain: ['code', 'name', 'sort_order', 'is_active'],
  hse_cost_op_type: ['biz_domain_id', 'code', 'name', 'sort_order', 'is_active'],
  hse_cost_invest_category: ['code', 'name', 'sort_order', 'is_active'],
};

function snakeToCamel(s) { return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }
function rowToCamel(row) { const o = {}; if (!row) return o; for (const k of Object.keys(row)) o[snakeToCamel(k)] = row[k]; return o; }

// ============================================================================
// 金额精度处理：以「分」为整数，杜绝浮点直接比较（NUMERIC(14,2) 下精确）
// ============================================================================
function toCents(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') { if (!isFinite(v)) return 0; return Math.round(v * 100); }
  const s = String(v).trim();
  if (s === '') return 0;
  const neg = s.charAt(0) === '-';
  const m = s.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!m) { const n = parseFloat(s); return Math.round((isNaN(n) ? 0 : n) * 100); }
  const intPart = parseInt(m[2], 10);
  // 仅取两位小数；NUMERIC(14,2) 保证不会出现更多位，这里是防御
  const frac = (m[3] || '').slice(0, 2).padEnd(2, '0');
  const cents = intPart * 100 + parseInt(frac, 10);
  return neg ? -cents : cents;
}
const fromCents = (c) => Math.round(c) / 100;          // 分 → 元（数值）
const fmtYuan = (c) => (Math.round(c) / 100).toFixed(2); // 分 → 元（字符串）
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0); // 百分比，保留2位

// ============================================================================
// 事务助手（修正1）：单连接 BEGIN/COMMIT/ROLLBACK，异常必回滚并释放连接
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

// 运行期自愈：若新表不存在，执行正式迁移（幂等）；随后执行硬化迁移（幂等）。
let _ensurePromise = null;
async function ensureCostTables() {
  if (!isConnected()) return;
  if (_ensurePromise) return _ensurePromise;
  _ensurePromise = (async () => {
    try {
      const chk = await pool.query("SELECT to_regclass('public.hse_cost_request') AS t");
      if (!chk.rows[0].t) {
        const sqlPath = path.join(__dirname, '..', 'sql', '20261023_hse_safety_cost_domain.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        for (const stmt of sql.split(';')) {
          const s = stmt.trim();
          if (!s) continue;
          try { await pool.query(s); } catch (e) { /* 幂等忽略 */ }
        }
      }
      // 硬化迁移（record_type + 唯一约束）：整文件单查询执行以保留 DO 块；幂等。
      const hPath = path.join(__dirname, '..', 'sql', '20261024_hse_safety_cost_hardening.sql');
      if (fs.existsSync(hPath)) {
        const hsql = fs.readFileSync(hPath, 'utf8');
        try { await pool.query(hsql); } catch (e) { /* 幂等忽略 */ }
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
// 预算明细（单表 CRUD）
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
// 费用申请（可关联业务来源）—— 创建带分摊：事务
// ============================================================================
function genRequestNo() { return `CR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`; }
function genCommitmentNo() { return `CM-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 6)}`; }

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

// 申请阶段可携带计划归因（原子写入申请 + 分摊；失败整体回滚）
async function costRequestCreate(body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  if (!body.title) return err(-1, '请填写申请标题(title)');
  await ensureCostTables();
  const rec = { ...body };
  const allocations = Array.isArray(body.allocations) ? body.allocations : [];
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

// 审批通过 → 自动生成/更新承诺（修正4：行锁串行化 + 唯一约束 backstop，绝不重复占用资金）
async function costRequestUpdate(idRaw, body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
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
        // 已有有效承诺 → 仅更新金额（幂等，不重复创建）；否则创建
        const ck = await client.query("SELECT id, amount FROM hse_cost_commitment WHERE request_id=$1 AND status='active' AND is_deleted=false ORDER BY id LIMIT 1", [id]);
        if (ck.rows.length) {
          if (toCents(ck.rows[0].amount) !== toCents(amt)) {
            await client.query('UPDATE hse_cost_commitment SET amount=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [amt, ck.rows[0].id]);
          }
        } else {
          // ON CONFLICT DO NOTHING 依赖唯一约束 backstop；行锁已保证串行，双保险
          await client.query(
            "INSERT INTO hse_cost_commitment(request_id, budget_id, amount, commitment_date, status, commitment_no) VALUES($1,$2,$3,CURRENT_DATE,'active',$4) ON CONFLICT DO NOTHING",
            [id, existing.budget_id, amt, genCommitmentNo()]
          );
        }
      } else if (newStatus && ['rejected', 'withdrawn', 'closed', 'draft'].includes(newStatus) && existing.status === 'approved') {
        // 撤回 / 驳回 / 取消：仅在承诺尚未被实际支出消耗时释放（取消承诺，保留历史）
        const consumed = await client.query(
          "SELECT COALESCE(SUM(CASE WHEN record_type='reversal' THEN -actual_amount ELSE actual_amount END),0)::numeric AS net FROM hse_cost_actual WHERE request_id=$1 AND is_deleted=false",
          [id]
        );
        if (toCents(consumed.rows[0].net) === 0) {
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
    return err(-1, '更新费用申请失败：' + e.message);
  }
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

// 修正4：审计既有数据是否已存在「同一申请多条有效承诺」（只读、只报不删）
async function auditDuplicateCommitments() {
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
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
    totalAmount: fromCents(toCents(x.total_amount)),
  }));
  return ok(rows, rows.length ? `发现 ${rows.length} 个申请存在重复有效承诺（未做任何删除，请人工核对）` : '未发现重复有效承诺');
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

// 修正2：校验实际金额与分摊金额（整数分比较，禁负/空分摊）；修正1：实际+分摊事务写入。
function validateActualAllocations(actualAmountRaw, allocations) {
  const actualCents = toCents(actualAmountRaw);
  if (!(actualCents > 0)) return `实际支出金额必须为大于 0 的合法金额（收到：${fmtYuan(actualCents)}）`;
  for (let i = 0; i < allocations.length; i++) {
    const a = allocations[i] || {};
    const c = toCents(a.amount !== undefined ? a.amount : a[snakeToCamel('amount')]);
    if (!(c > 0)) return `第 ${i + 1} 条分摊金额必须大于 0（收到：${fmtYuan(c)}）；不允许负数或空分摊`;
  }
  if (allocations.length > 0) {
    const sum = allocations.reduce((s, a) => s + toCents(a.amount !== undefined ? a.amount : a[snakeToCamel('amount')]), 0);
    if (sum !== actualCents) {
      return `分摊金额合计（¥${fmtYuan(sum)}）与实际支出金额（¥${fmtYuan(actualCents)}）不一致；单归属须相等，多域分摊合计须相等`;
    }
  }
  return null; // 通过；无分摊 = 待归因（单独统计）
}

async function actualCreate(body = {}) {
  const blocked = requireConn(); if (blocked) return blocked;
  if (!body.requestId && !body.request_id) return err(-1, '实际支出必须关联费用申请(requestId)');
  await ensureCostTables();
  const actualAmount = body.actualAmount !== undefined ? body.actualAmount : body.actual_amount;
  const allocations = Array.isArray(body.allocations) ? body.allocations : [];
  const vErr = validateActualAllocations(actualAmount, allocations);
  if (vErr) return err(-1, vErr);
  const rec = { ...body };
  const recordType = (body.recordType !== undefined ? body.recordType : body.record_type) || 'normal';
  const requestId = body.requestId !== undefined ? body.requestId : body.request_id;
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
  const amt = toCents(body.amount !== undefined ? body.amount : body[snakeToCamel('amount')]);
  if (!(amt > 0)) return err(-1, '分摊金额必须大于 0；不允许负数或空分摊');
  const rec = { ...body };
  const cols = COLUMNS.hse_cost_allocation.filter((c) => rec[c] !== undefined || rec[snakeToCamel(c)] !== undefined);
  const vals = cols.map((c) => (rec[c] !== undefined ? rec[c] : rec[snakeToCamel(c)]));
  const r = await pool.query(`INSERT INTO hse_cost_allocation(${cols.join(',')}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
  return ok(rowToCamel(r.rows[0]), '创建成功');
}

// ============================================================================
// 预算财务状态（修正3：口径统一，全部由交易表计算，不信任 spent_amount）
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
  await ensureCostTables();
  const budgetId = parseInt(budgetIdRaw);
  const bR = await pool.query('SELECT id, budget_amount, budget_year, project_name, item_name FROM hse_safety_budget WHERE id=$1 AND is_deleted=false', [budgetId]);
  if (!bR.rows.length) return err(-2, '预算主体不存在');
  const budgetCents = toCents(bR.rows[0].budget_amount);
  const [cR, pR, aR, iR] = await Promise.all([
    pool.query("SELECT COALESCE(SUM(amount),0)::numeric AS s FROM hse_cost_commitment WHERE budget_id=$1 AND is_deleted=false AND status='active'", [budgetId]),
    pool.query(PENDING_COMMITTED_SQL, [budgetId]),
    pool.query("SELECT COALESCE(SUM(CASE WHEN record_type='reversal' THEN -actual_amount ELSE actual_amount END),0)::numeric AS s FROM hse_cost_actual WHERE budget_id=$1 AND is_deleted=false", [budgetId]),
    pool.query('SELECT COUNT(*)::int AS c FROM hse_budget_item WHERE budget_id=$1 AND is_deleted=false', [budgetId]),
  ]);
  const committedCents = toCents(cR.rows[0].s);
  const pendingCents = toCents(pR.rows[0].pending);
  const actualCents = toCents(aR.rows[0].s);
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
    const budgetCents = toCents(row.budget_amount);
    const committedCents = toCents(row.committed);
    const pendingCents = toCents(row.pending_committed);
    const actualCents = toCents(row.actual);
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
// 费用统计（修正3：按有效分摊归集；未归因单列；年度用 actual_date 自然年）
// ============================================================================
async function costStats(query = {}) {
  const { budgetYear } = query;
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
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
  const totalNetCents = toCents(totalR.rows[0].s);
  const unattributedCents = toCents(unattributedR.rows[0].s);
  return ok({
    totalActual: fromCents(totalNetCents),
    allocatedTotal: fromCents(totalNetCents - unattributedCents),
    unattributedActual: fromCents(unattributedCents),
    byDomain: domR.rows.map((r) => ({ bizDomain: r.biz_domain || '未归集', amount: fromCents(toCents(r.amount)) })),
    byCategory: catR.rows.map((r) => ({ investCategory: r.invest_category || '未归集', amount: fromCents(toCents(r.amount)) })),
  });
}

// ============================================================================
// 预算 Excel 导入（解析→校验→预览→确认→批次留痕→防重；确认为单事务）
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
  if (rec.budget_amount !== undefined && rec.budget_amount !== '' && !(Number(rec.budget_amount) > 0)) errors.push(`第${idx}行预算金额必须大于 0`);
  if (rec.budget_year !== undefined && rec.budget_year !== '' && (!/^\d{4}$/.test(String(rec.budget_year)))) errors.push(`第${idx}行预算年度格式应为4位数字`);
  return errors;
}

async function budgetImportPreview(filePath) {
  const blocked = requireConn(); if (blocked) return blocked;
  await ensureCostTables();
  let recs;
  try { recs = parseBudgetFile(filePath); } catch (e) { return err(-1, '文件解析失败：' + e.message); }
  const rows = []; let errorCount = 0; let dupCount = 0;
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
  // 先做行级校验/防重（不写库），再在单事务内批量写入 + 批次留痕（原子）
  const existing = await pool.query('SELECT budget_code FROM hse_safety_budget WHERE is_deleted=false AND budget_code IS NOT NULL');
  const codes = new Set(existing.rows.map((r) => r.budget_code));
  const toInsert = []; let skipped = 0; let failed = 0; const errorDetail = [];
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i]; const idx = i + 2;
    const errors = validateBudgetRow(rec, idx);
    if (errors.length) { failed++; errorDetail.push(errors.join('; ')); continue; }
    if (rec.budget_code && codes.has(rec.budget_code)) { skipped++; continue; } // 防重：已存在编码则跳过，不覆盖
    toInsert.push({ rec, idx });
    if (rec.budget_code) codes.add(rec.budget_code);
  }
  try {
    const inserted = await withTransaction(async (client) => {
      let n = 0;
      for (const { rec } of toInsert) {
        const cols = ['budget_year', 'budget_code', 'project_name', 'item_name', 'budget_amount', 'category', 'department', 'purpose'];
        const vals = [rec.budget_year, rec.budget_code || null, rec.project_name, rec.item_name, rec.budget_amount, rec.category || null, rec.department || null, rec.purpose || null];
        await client.query(`INSERT INTO hse_safety_budget(${cols.join(',')}, created_at, updated_at) VALUES(${cols.map((_, i) => `$${i + 1}`).join(',')}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, vals);
        n++;
      }
      await client.query('INSERT INTO hse_cost_import_batch(module, batch_no, file_name, operator_id, operator_name, total_rows, inserted, updated, skipped, failed, status, error_detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,\'done\',$11)',
        ['safety_budget', batchNo, operator.fileName || null, operator.operatorId || null, operator.operatorName || null, recs.length, n, 0, skipped, failed, errorDetail.join('\n').slice(0, 4000) || null]);
      return n;
    });
    return ok({ batchNo, total: recs.length, inserted, updated: 0, skipped, failed }, '导入完成');
  } catch (e) {
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
  commitmentList, commitmentCreate, actualList, actualCreate, allocationList, allocationCreate,
  auditDuplicateCommitments,
  genericCrud,
  // 财务状态 / 统计
  budgetFinancials, budgetFinancialOverview, costStats,
  // 导入
  budgetImportPreview, budgetImportConfirm,
  // 事务助手（供测试/复用）
  withTransaction,
  // 金额助手（供测试断言）
  toCents, fromCents,
  // 自检
  ensureCostTables,
};
