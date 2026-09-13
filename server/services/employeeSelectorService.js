/**
 * HSE 员工域 · 员工公共选择服务（培训/保险/三违/隐患/消防等模块复用）
 * 从 hse-employee/selector.js route 内联 handler 迁移 —— 行为逐字节不变
 */
const { pool } = require('../config/db');

// GET /employees/selector — 员工选择列表（精简字段，关键词 + 组织/岗位/驾驶员筛选）
async function listSelector(query) {
  const { keyword, org_unit_id, position_id, is_driver, limit = 20 } = query;
  const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);

  const conditions = ['ev.is_deleted = false', 'ev.is_current = true'];
  const params = [];
  let paramIdx = 1;

  if (keyword) {
    conditions.push(`(ev.name ILIKE $${paramIdx} OR ev.employee_code ILIKE $${paramIdx})`);
    params.push(`%${keyword}%`);
    paramIdx++;
  }
  if (org_unit_id) {
    conditions.push(`ev.org_unit_id = $${paramIdx}`);
    params.push(parseInt(org_unit_id));
    paramIdx++;
  }
  if (position_id) {
    conditions.push(`ev.position_id = $${paramIdx}`);
    params.push(parseInt(position_id));
    paramIdx++;
  }
  if (is_driver === 'true') {
    conditions.push(`(ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%')`);
  } else if (is_driver === 'false') {
    conditions.push(`(ev.position_name IS NULL OR (ev.position_name NOT ILIKE '%驾驶员%' AND ev.position_name NOT ILIKE '%司机%'))`);
  }

  const whereClause = conditions.join(' AND ');

  const result = await pool.query(
    `SELECT ev.employee_id, ev.employee_code, ev.name, ev.gender,
            ev.org_unit_id, ev.org_name,
            ev.operation_unit_id, ev.unit_name,
            ev.position_id, ev.position_name
     FROM v_employee_org_full ev
     WHERE ${whereClause}
     ORDER BY ev.name ASC
     LIMIT $${paramIdx}`,
    [...params, limitNum]
  );

  return result.rows;
}

// GET /employees/selector/:id — 员工选择单条查询（已选择员工回显）
async function getSelectorById(id) {
  const result = await pool.query(
    `SELECT ev.employee_id, ev.employee_code, ev.name, ev.gender,
            ev.org_unit_id, ev.org_name,
            ev.operation_unit_id, ev.unit_name,
            ev.position_id, ev.position_name
     FROM v_employee_org_full ev
     WHERE ev.employee_id = $1 AND ev.is_deleted = false AND ev.is_current = true`,
    [parseInt(id)]
  );
  if (result.rows.length === 0) return { error: -2, message: '员工不存在' };
  return { row: result.rows[0] };
}

// POST /employees/selector/batch — 员工选择批量查询（批量回显）
async function batchSelector(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { rows: [], message: 'ID列表为空' };
  const intIds = ids.map((id) => parseInt(id)).filter((id) => Number.isFinite(id) && id > 0);
  if (intIds.length === 0) return { rows: [], message: '无效ID' };

  const result = await pool.query(
    `SELECT ev.employee_id, ev.employee_code, ev.name, ev.gender,
            ev.org_unit_id, ev.org_name,
            ev.operation_unit_id, ev.unit_name,
            ev.position_id, ev.position_name
     FROM v_employee_org_full ev
     WHERE ev.employee_id = ANY($1) AND ev.is_deleted = false AND ev.is_current = true
     ORDER BY ev.name ASC`,
    [intIds]
  );
  return { rows: result.rows };
}

module.exports = {
  listSelector,
  getSelectorById,
  batchSelector,
};
