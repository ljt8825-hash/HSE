/**
 * HSE 员工域 · 员工档案中心服务（基于 v_employee_current 视图）
 * 从 hse-employee/profile-center.js route 内联 handler 迁移 —— 行为逐字节不变
 */
const { pool } = require('../config/db');

// GET /employees/profile/list — 员工档案列表（分页 + 搜索 + 筛选）
async function getProfileList(query) {
  const { page = 1, pageSize = 20, keyword, org_unit_id, position_id, is_driver, status } = query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
  const offset = (pageNum - 1) * limitNum;

  const conditions = ['e.is_deleted = false'];
  const params = [];
  let paramIdx = 1;

  if (keyword) {
    conditions.push(`(ev.name ILIKE $${paramIdx} OR ev.employee_code ILIKE $${paramIdx})`);
    params.push(`%${keyword}%`);
    paramIdx++;
  }
  if (org_unit_id) {
    conditions.push(`ea.org_unit_id = $${paramIdx}`);
    params.push(parseInt(org_unit_id));
    paramIdx++;
  }
  if (position_id) {
    conditions.push(`ea.position_id = $${paramIdx}`);
    params.push(parseInt(position_id));
    paramIdx++;
  }
  if (is_driver === 'true') {
    conditions.push(`(ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%')`);
    conditions.push(`
      COALESCE(
        (SELECT x.employment_relation FROM employee x
           WHERE x.is_deleted = false AND x.employment_relation IS NOT NULL
             AND x.id_card_hash IS NOT NULL AND e.id_card_hash IS NOT NULL
             AND x.id_card_hash = e.id_card_hash ORDER BY x.id LIMIT 1),
        (SELECT x.employment_relation FROM employee x
           WHERE x.is_deleted = false AND x.employment_relation IS NOT NULL
             AND x.employee_code IS NOT NULL AND e.employee_code IS NOT NULL
             AND x.employee_code = e.employee_code ORDER BY x.id LIMIT 1),
        (SELECT x.employment_relation FROM employee x
           WHERE x.is_deleted = false AND x.employment_relation IS NOT NULL
             AND x.name IS NOT NULL AND x.name = e.name ORDER BY x.id LIMIT 1),
        e.employment_relation
      ) NOT IN ('辞职', '死亡')
    `);
  } else if (is_driver === 'false') {
    conditions.push(`(ev.position_name IS NULL OR (ev.position_name NOT ILIKE '%驾驶员%' AND ev.position_name NOT ILIKE '%司机%'))`);
  }
  if (status) {
    conditions.push(`ev.assignment_status = $${paramIdx}`);
    params.push(status);
    paramIdx++;
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM v_employee_current ev
     JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
     LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
     WHERE ${whereClause}`,
    params
  );
  const total = countResult.rows[0].total;

  params.push(limitNum, offset);
  const result = await pool.query(
    `SELECT ev.employee_id AS id, ev.employee_code, ev.name,
            e.gender,
            CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM AGE(e.birth_date))::int END AS age,
            ea.org_unit_id,
            ev.org_name, ev.org_type,
            ev.org_code,
            ev.operation_unit_id,
            ev.unit_name,
            ev.unit_type,
            COALESCE(ea.dept_name, ev.org_name) AS dept_name,
            ea.position_id,
            ev.position_name,
            ev.position_code,
            CASE WHEN e.employment_relation IN ('辞职','死亡') THEN 'left' ELSE ev.assignment_status END AS status,
            COALESCE(ea.start_date, ev.start_date) AS hire_date,
            e.leave_date,
            e.roster_department,
            e.roster_position,
            e.roster_work_area,
            e.phone, e.id_card,
            (ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%') AS is_driver
     FROM v_employee_current ev
     JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
     LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
     WHERE ${whereClause}
     ORDER BY ea.start_date DESC NULLS LAST
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    params
  );

  return { list: result.rows, total, page: pageNum, pageSize: limitNum };
}

// GET /employees/profile/roster-version — 花名册名单版本号（前端本地缓存比对用）
async function getRosterVersion(scope) {
  const positionCond =
    scope === 'driver'
      ? ` AND (ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%')`
      : '';
  const r = await pool.query(
    `SELECT ev.name, e.employment_relation, e.leave_date, e.updated_at, COALESCE(ea.dept_name, ev.org_name) AS dept
     FROM v_employee_current ev
     JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
     LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id
       AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
     WHERE e.is_deleted = false${positionCond}
     ORDER BY ev.name, e.id`,
  );
  return r.rows;
}

// GET /employees/profile/:id — 员工档案详情（基本 + 当前组织）
async function getProfileDetail(id) {
  const empResult = await pool.query(
    `SELECT e.id, e.employee_code, e.name, e.gender, e.birth_date, e.phone, e.id_card,
            e.person_type, e.person_category, e.is_public_welfare,
            CASE WHEN e.employment_relation IN ('辞职','死亡') THEN 'left'
                 WHEN e.is_deleted THEN 'inactive' ELSE 'active' END AS status,
            e.roster_department, e.roster_position, e.roster_work_area, e.leave_date,
            CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age,
            e.created_at, e.updated_at
     FROM employee e WHERE e.id = $1 AND e.is_deleted = false`,
    [parseInt(id)]
  );
  if (empResult.rows.length === 0) return { error: -2, message: '员工不存在' };

  const emp = empResult.rows[0];

  const currentResult = await pool.query(
    `SELECT ea.org_unit_id, ou.org_name, ou.org_type, ou.org_code, ou.org_path,
            ea.operation_unit_id, opu.unit_name, opu.unit_type, opu.unit_code,
            ea.dept_name,
            ea.position_id, p.name AS position_name, p.position_code, p.risk_level,
            ea.supervisor_id, sup.name AS supervisor_name,
            ea.status AS assignment_status, ea.start_date, ea.end_date
     FROM employee_assignment ea
     LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
     LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
     LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
     LEFT JOIN employee sup ON sup.id = ea.supervisor_id AND sup.is_deleted = false
     WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false`,
    [parseInt(id)]
  );

  return {
    basic: emp,
    currentOrg: currentResult.rows.length > 0 ? currentResult.rows[0] : null,
  };
}

// GET /employees/profile/:id/assignments — 员工任职历史列表
async function getProfileAssignments(id) {
  const result = await pool.query(
    `SELECT ea.id, ea.org_unit_id, ea.operation_unit_id, ea.position_id,
            ea.is_primary, ea.is_current, ea.status, ea.start_date, ea.end_date, ea.remark,
            ea.dept_name,
            ou.org_name, ou.org_code,
            opu.unit_name, opu.unit_type,
            p.name AS position_name, p.position_code,
            sup.name AS supervisor_name
     FROM employee_assignment ea
     LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
     LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
     LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
     LEFT JOIN employee sup ON sup.id = ea.supervisor_id AND sup.is_deleted = false
     WHERE ea.employee_id = $1 AND ea.is_deleted = false
     ORDER BY ea.start_date DESC`,
    [parseInt(id)]
  );
  return result.rows;
}

// GET /employees/profile/:id/driver-info — 员工驾驶员信息（从 employee_assignment.remark 解析）
async function getDriverInfo(id) {
  const result = await pool.query(
    `SELECT ea.remark
     FROM employee_assignment ea
     WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false`,
    [parseInt(id)]
  );

  let driverInfo = { is_driver: false, license_type: null };
  if (result.rows.length > 0 && result.rows[0].remark) {
    const remark = result.rows[0].remark;
    driverInfo.is_driver = remark.includes('is_driver=true');
    const licenseMatch = remark.match(/license_type=([^;]+)/);
    if (licenseMatch) driverInfo.license_type = licenseMatch[1];
  }
  return driverInfo;
}

module.exports = {
  getProfileList,
  getRosterVersion,
  getProfileDetail,
  getProfileAssignments,
  getDriverInfo,
};