'use strict';
/**
 * CF-WPS-06：employee_code 巡查归因链（最小实现）
 * ------------------------------------------------------------------
 * 唯一职责：把「移动端业务身份键 employee_code」安全解析为「PG 内部代理键 employee.id」，
 * 再由 employee.id 派生 grid_id，最后 **只补 NULL** 地回填
 * grid_inspection_records.inspector_employee_id + grid_id。
 *
 * 铁律（每一行代码都不得违反）：
 *   1. employee_code   = 花名册员工编码（VARCHAR，移动端业务身份键）
 *      employee.id     = public.employee.id（BIGINT，PG 内部代理键）
 *      inspector_employee_id = employee.id —— **绝不**等于 employee_code。
 *      严禁 `SET inspector_employee_id = employee_code` 或任何直接赋值。
 *   2. Pull Engine 不负责人员归因；本模块是唯一的 employee_code → employee.id 出口。
 *   3. 所有不确定情况一律 fail-closed → pending（0 行 / >1 行 / 无网格 / 多网格 / 已归属）。
 *   4. 绝不覆盖：仅当 inspector_employee_id IS NULL **AND** grid_id IS NULL 才允许补齐
 *      （SQL WHERE 层面双重断言，不依赖 Node 侧判断）。
 *   5. 只处理 source_channel = 'mobile_h5'（本次新移动端链路）；**不做历史批量回填**。
 *   6. 本模块只有 SELECT（解析阶段）与受护栏约束的 UPDATE（补齐阶段）；
 *      绝无 DDL、绝不删除、绝不触碰图片/业务字段、绝不改 wps_account_employee_map。
 *
 * 状态机：attributed | pending （绝不出 failed —— 无可信来源可判定失败）
 */
const { pool } = require('../config/db');
const gridScope = require('./gridScope');

/** 归因结论状态 */
const CODE_ATTR_STATUS = { PENDING: 'pending', ATTRIBUTED: 'attributed' };

/** pending 的精确原因（可审计，便于后续定位） */
const CODE_ATTR_REASON = {
  EMPTY_CODE: 'empty_employee_code',            // 空 / 纯空白
  UNKNOWN_CODE: 'unknown_employee_code',        // employee_code 查无此人（0 行）
  MULTIPLE_EMPLOYEE: 'multiple_employee_match', // 同码命中 >1 在职行（唯一索引下不应发生 → fail-closed）
  INVALID_EMPLOYEE_ID: 'invalid_employee_id',   // employee.id 非安全整数 → 拒绝
  NO_GRID: 'no_grid',                           // 该员工无有效网格
  MULTIPLE_GRID: 'multiple_grid',               // 该员工命中多网格（禁止猜测）
  LOOKUP_ERROR: 'lookup_error',                 // 查询异常 → fail-closed
  NOT_MOBILE_H5: 'not_mobile_h5',               // 来源非本次移动端链路
  ALREADY_ATTRIBUTED: 'already_attributed',     // 已有 inspector_employee_id
  ALREADY_GRID: 'already_grid_bound',           // 已有 grid_id
  MISSING_CODE: 'missing_employee_code',        // 记录上没有 employee_code
  OK: 'employee_code+gridscope',
};

const norm = (v) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * employee_code → employee.id（**唯一允许的解析入口**）。
 *
 * @param {string} employeeCode 花名册员工编码（来自 WPS「员工编码」/ 移动端提交）
 * @param {{client?: object, logger?: object}} [opts]
 * @returns {Promise<{status:'pending'|'attributed', reason:string, employeeId:number|null, gridId:number|null}>}
 *
 * 严格规则：
 *   trim → 空值 pending
 *   SELECT id FROM public.employee WHERE employee_code=$1 AND is_deleted=false
 *     0 行 → pending(UNKNOWN_CODE)
 *     1 行 → 继续
 *     >1 行 → pending(MULTIPLE_EMPLOYEE)   ← 绝不任选其一
 *   deriveGridIdForEmployee(employeeId)
 *     no_grid     → pending(NO_GRID)
 *     multiple    → pending(MULTIPLE_GRID)
 *     ok          → attributed(employeeId, gridId)
 */
async function resolveByEmployeeCode(employeeCode, { client, logger = console } = {}) {
  const db = client || pool;
  const code = norm(employeeCode);
  if (code === '') {
    return { status: CODE_ATTR_STATUS.PENDING, reason: CODE_ATTR_REASON.EMPTY_CODE, employeeId: null, gridId: null };
  }

  let rows;
  try {
    const r = await db.query(
      'SELECT id FROM public.employee WHERE employee_code = $1 AND is_deleted = false ORDER BY id',
      [code]
    );
    rows = (r && r.rows) || [];
  } catch (e) {
    if (logger && typeof logger.error === 'function') {
      logger.error('[gridEmployeeCodeResolver] public.employee 查询失败:', e && e.message);
    }
    return { status: CODE_ATTR_STATUS.PENDING, reason: CODE_ATTR_REASON.LOOKUP_ERROR, employeeId: null, gridId: null };
  }

  if (rows.length === 0) {
    return { status: CODE_ATTR_STATUS.PENDING, reason: CODE_ATTR_REASON.UNKNOWN_CODE, employeeId: null, gridId: null };
  }
  if (rows.length > 1) {
    // 唯一部分索引 uk_employee_code 下不应出现；出现即为结构漂移 → 拒绝归属，绝不任选其一
    return { status: CODE_ATTR_STATUS.PENDING, reason: CODE_ATTR_REASON.MULTIPLE_EMPLOYEE, employeeId: null, gridId: null };
  }

  // bigint 由 node-pg 返回字符串；必须显式校验为安全整数，避免精度丢失后写入错误 id
  const rawId = rows[0] && rows[0].id;
  const employeeId = Number(rawId);
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0 || !/^\d+$/.test(norm(rawId))) {
    return { status: CODE_ATTR_STATUS.PENDING, reason: CODE_ATTR_REASON.INVALID_EMPLOYEE_ID, employeeId: null, gridId: null };
  }

  const g = await gridScope.deriveGridIdForEmployee(employeeId, { client: db, logger });
  if (g.status === 'ok') {
    return { status: CODE_ATTR_STATUS.ATTRIBUTED, reason: CODE_ATTR_REASON.OK, employeeId, gridId: Number(g.gridId) };
  }
  if (g.status === 'multiple') {
    return { status: CODE_ATTR_STATUS.PENDING, reason: CODE_ATTR_REASON.MULTIPLE_GRID, employeeId, gridId: null };
  }
  return { status: CODE_ATTR_STATUS.PENDING, reason: CODE_ATTR_REASON.NO_GRID, employeeId, gridId: null };
}

/**
 * 归因写计划（**不写库**，纯函数）—— 所有覆盖护栏集中在此。
 *
 * 允许写入的**唯一**条件（全部满足）：
 *   1. 归因结论 status === 'attributed'
 *   2. 记录 source_channel === 'mobile_h5'（本次新移动端链路）
 *   3. 记录 inspector_employee_id == null
 *   4. 记录 grid_id == null
 * 任一不满足 → 不写（写计划为空）。默认最安全策略，不存在「只补一个」的旁路。
 *
 * @returns {{attributable:boolean, reason:string, writes:{inspector_employee_id?:number, grid_id?:number}}}
 */
function buildEmployeeCodeWritePlan(record, resolution) {
  const rec = record || {};
  const res = resolution || {};
  if (!res || res.status !== CODE_ATTR_STATUS.ATTRIBUTED) {
    return { attributable: false, reason: (res && res.reason) || CODE_ATTR_REASON.LOOKUP_ERROR, writes: {} };
  }
  if (norm(rec.source_channel) !== 'mobile_h5') {
    return { attributable: false, reason: CODE_ATTR_REASON.NOT_MOBILE_H5, writes: {} };
  }
  if (rec.inspector_employee_id != null) {
    return { attributable: false, reason: CODE_ATTR_REASON.ALREADY_ATTRIBUTED, writes: {} };
  }
  if (rec.grid_id != null) {
    return { attributable: false, reason: CODE_ATTR_REASON.ALREADY_GRID, writes: {} };
  }
  if (norm(rec.employee_code) === '') {
    return { attributable: false, reason: CODE_ATTR_REASON.MISSING_CODE, writes: {} };
  }
  return {
    attributable: true,
    reason: CODE_ATTR_REASON.OK,
    // 关键：写下的是 employee.id（BIGINT），**永远不是** employee_code
    writes: { inspector_employee_id: Number(res.employeeId), grid_id: Number(res.gridId) },
  };
}

/**
 * 单条记录归因：读 → 解析 → 计划 → 受护栏补齐。
 * @param {object} client pg Client（建议在调用方事务内）
 * @param {number} id grid_inspection_records.id
 * @param {{dryRun?:boolean}} [opts]
 */
async function attributeOneById(client, id, { dryRun = false } = {}) {
  const db = client || pool;
  const r = await db.query(
    `SELECT id, employee_code, inspector_employee_id, grid_id, source_channel
       FROM grid_inspection_records WHERE id = $1`,
    [id]
  );
  const record = r.rows && r.rows[0];
  if (!record) return { id, status: CODE_ATTR_STATUS.PENDING, reason: 'record_not_found', applied: false };

  const resolution = await resolveByEmployeeCode(record.employee_code, { client: db });
  const plan = buildEmployeeCodeWritePlan(record, resolution);
  if (!plan.attributable) {
    return { id, status: resolution.status, reason: plan.reason, employeeId: resolution.employeeId, gridId: resolution.gridId, applied: false };
  }
  if (dryRun) {
    return { id, status: resolution.status, reason: plan.reason, employeeId: resolution.employeeId, gridId: resolution.gridId, applied: false, wouldWrite: plan.writes, dryRun: true };
  }
  const n = await applyWritePlan(db, id, plan);
  return { id, status: resolution.status, reason: plan.reason, employeeId: resolution.employeeId, gridId: resolution.gridId, applied: n > 0, rowsAffected: n };
}

/**
 * 受护栏 UPDATE：SQL 层再次断言「两列同时为 NULL」，与 Node 侧护栏双重保险。
 * 任何并发/竞态下都不可能覆盖已有归属。
 * @returns {Promise<number>} 受影响行数（0 = 护栏拒绝/已被他人补齐）
 */
async function applyWritePlan(client, id, plan) {
  const writes = (plan && plan.writes) || {};
  if (writes.inspector_employee_id == null || writes.grid_id == null) {
    // 不允许部分写入（不能只补 inspector 不补 grid，反之亦然）
    return 0;
  }
  const r = await client.query(
    `UPDATE grid_inspection_records
        SET inspector_employee_id = $1, grid_id = $2, updated_at = NOW()
      WHERE id = $3
        AND inspector_employee_id IS NULL
        AND grid_id IS NULL`,
    [writes.inspector_employee_id, writes.grid_id, id]
  );
  return r.rowCount || 0;
}

/**
 * 批量归因入口（**只处理本次移动端链路**）。
 *
 * 候选集硬条件（SQL 层）：
 *   source_channel = 'mobile_h5' AND employee_code IS NOT NULL
 *   AND inspector_employee_id IS NULL AND grid_id IS NULL
 * ⇒ 结构上不可能覆盖任何已有归属，也不可能触碰历史（历史 source_channel 全 NULL）。
 * 本阶段**不做历史数据回填**：历史记录不在候选集内。
 *
 * @param {object} client pg Client
 * @param {{ids?:number[], limit?:number, dryRun?:boolean}} [opts]
 */
async function attributePendingByEmployeeCode(client, opts = {}) {
  const db = client || pool;
  const dryRun = !!opts.dryRun;
  const limit = Number.isFinite(Number(opts.limit)) && Number(opts.limit) > 0 ? Math.floor(Number(opts.limit)) : 500;
  const ids = Array.isArray(opts.ids) && opts.ids.length ? opts.ids.map(Number).filter(Number.isSafeInteger) : null;

  const params = [];
  let where = `source_channel = 'mobile_h5' AND employee_code IS NOT NULL
                 AND inspector_employee_id IS NULL AND grid_id IS NULL`;
  if (ids) {
    params.push(ids);
    where += ` AND id = ANY($${params.length}::int[])`;
  }
  params.push(limit);
  const sel = await db.query(
    `SELECT id, employee_code, inspector_employee_id, grid_id, source_channel
       FROM grid_inspection_records
      WHERE ${where}
      ORDER BY id
      LIMIT $${params.length}`,
    params
  );

  const stats = {
    candidates: sel.rows.length,
    attributed: 0,
    pending: 0,
    applied: 0,
    dryRun,
    byReason: {},
    details: [],
  };
  for (const row of sel.rows) {
    const resolution = await resolveByEmployeeCode(row.employee_code, { client: db });
    const plan = buildEmployeeCodeWritePlan(row, resolution);
    const reason = plan.attributable ? plan.reason : plan.reason;
    stats.byReason[reason] = (stats.byReason[reason] || 0) + 1;
    if (!plan.attributable) {
      stats.pending++;
      if (stats.details.length < 50) stats.details.push({ id: row.id, status: resolution.status, reason });
      continue;
    }
    stats.attributed++;
    if (dryRun) {
      if (stats.details.length < 50) stats.details.push({ id: row.id, status: resolution.status, reason, wouldWrite: plan.writes, dryRun: true });
      continue;
    }
    const n = await applyWritePlan(db, row.id, plan);
    stats.applied += n;
    if (stats.details.length < 50) stats.details.push({ id: row.id, status: resolution.status, reason, rowsAffected: n });
  }
  return stats;
}

module.exports = {
  CODE_ATTR_STATUS,
  CODE_ATTR_REASON,
  resolveByEmployeeCode,
  buildEmployeeCodeWritePlan,
  applyWritePlan,
  attributeOneById,
  attributePendingByEmployeeCode,
};
