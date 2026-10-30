/**
 * HSE 员工域 · 员工公共选择服务（培训/保险/三违/隐患/消防等模块复用）
 * 从 hse-employee/selector.js route 内联 handler 迁移 —— 行为逐字节不变
 */
const { pool } = require('../config/db');
const { formalEmployeeEligibilitySql } = require('./employeeStatusDict');

// GET /employees/selector — 员工选择列表（精简字段，关键词 + 组织/岗位/驾驶员筛选）
//
// 【B-1-P1-03-02】业务资格分类：正式员工专属（新建业务候选列表）。
//   依据任务书已确认规则：候选列表按花名册正式员工身份过滤——
//   辞职/死亡/退休终态人员、employment_relation IS NULL（待核实）人员一律不进入候选；
//   禁止姓名/岗位/组织推断。片段复用 formalEmployeeEligibilitySql（R4 冻结口径参数化），
//   花名册映射证据见 employeeStatusDict.formalEmployeeEligibilitySql 注释。
//   原有关键词、组织、岗位、驾驶员筛选与 LIMIT 分页行为不变，API 契约不变。
async function listSelector(query) {
  const { keyword, org_unit_id, position_id, is_driver, limit = 20 } = query;
  const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);

  const conditions = ['ev.is_deleted = false', 'ev.is_current = true',
    // 正式员工资格（花名册权威口径）：NOT NULL + '正式员工' 精确命中
    formalEmployeeEligibilitySql('ev')];
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
//
// 【B-1-P1-03-02】业务资格分类：历史回显 —— 不得加正式员工/终态过滤。
//   历史单据（三违、网格、部门负责人等）编辑/查看时按 id 回显已选人员；
//   已离职、已退休或待核实人员只要历史业务关系存在，仍必须正确回显姓名与历史信息
//   （任务书规则 7；P1-03-01 报告 §6.2 边界①）。返回结构与字段不变。
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
//
// 【B-1-P1-03-02】业务资格分类：历史回显 —— 不得加正式员工/终态过滤。
//   培训、三违、网格、部门、隐患等页面用本接口按 id 批量回显历史单据人员姓名
//   （P1-03-01 附录 A）；终态人员必须仍能回显（任务书规则 7）。
//   返回结构与排序规则（ORDER BY name）不变。
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
