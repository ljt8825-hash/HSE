/**
 * HSE 员工域 · 超龄人员自动识别服务（employee 表 birth_date 实时计算）
 * 规则来源: config/hseRules/employee-age-rule.json；优化管控页专用口径 >68 周岁
 * 从 hse-employee/over-age.js route 内联 handler 迁移 —— 行为逐字节不变
 */
const { pool } = require('../config/db');
const { getOverAgeThresholds, getEmployeeAgeRule } = require('../config/hseRules');

// 加密字段常量（与父路由保持一致）
const ENCRYPT_FIELDS = ['id_card', 'phone'];

const ageRule = getEmployeeAgeRule();
const OVER_AGE_THRESHOLDS_CONFIG = getOverAgeThresholds();
const OVER_AGE_THRESHOLDS = {
  '男': OVER_AGE_THRESHOLDS_CONFIG.male || 60,
  '女': OVER_AGE_THRESHOLDS_CONFIG.female || 50,
};
const DEFAULT_THRESHOLD = OVER_AGE_THRESHOLDS_CONFIG.default || 60;

function getOverAgeThresholdLocal(gender) {
  return OVER_AGE_THRESHOLDS[gender] || DEFAULT_THRESHOLD;
}

function buildOverAgeYearsExpr(tableAlias = 'e') {
  const maleTh = OVER_AGE_THRESHOLDS['男'];
  const femaleTh = OVER_AGE_THRESHOLDS['女'];
  const defTh = DEFAULT_THRESHOLD;
  return `CASE
    WHEN ${tableAlias}.gender = '男' THEN EXTRACT(YEAR FROM age(${tableAlias}.birth_date))::INT - ${maleTh}
    WHEN ${tableAlias}.gender = '女' THEN EXTRACT(YEAR FROM age(${tableAlias}.birth_date))::INT - ${femaleTh}
    ELSE EXTRACT(YEAR FROM age(${tableAlias}.birth_date))::INT - ${defTh}
  END`;
}

function buildAgeThresholdExpr(tableAlias = 'e') {
  const maleTh = OVER_AGE_THRESHOLDS['男'];
  const femaleTh = OVER_AGE_THRESHOLDS['女'];
  const defTh = DEFAULT_THRESHOLD;
  return `CASE
    WHEN ${tableAlias}.gender = '男' THEN ${maleTh}
    WHEN ${tableAlias}.gender = '女' THEN ${femaleTh}
    ELSE ${defTh}
  END`;
}

// ============================================================
// 超龄优化管控页专用阈值：公司高龄优化口径（超过68周岁）
// 独立于员工列表的「超龄人员卡」（男60/女50），互不影响
// ============================================================
const OVERAGE_OPTIMIZE_LIMIT = 68;

function buildOptimizeOverAgeCondition(tableAlias = 'e') {
  return `EXTRACT(YEAR FROM age(${tableAlias}.birth_date))::INT > ${OVERAGE_OPTIMIZE_LIMIT}`;
}
function buildOptimizeOverAgeYearsExpr(tableAlias = 'e') {
  return `EXTRACT(YEAR FROM age(${tableAlias}.birth_date))::INT - ${OVERAGE_OPTIMIZE_LIMIT}`;
}

// GET /over-age/auto-list — 自动识别的超龄人员列表（优化管控页口径 >68 周岁）
async function getAutoList(query) {
  const { page = 1, pageSize = 20, keyword, township, secondaryDept, positionName, gender } = query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [
    'e.is_deleted = false',
    "e.employment_relation = '正式员工'", // 超龄仅统计在职（正式员工），离职（辞职/死亡）不计入
    'e.birth_date IS NOT NULL',
    buildOptimizeOverAgeCondition('e'),
  ];
  const params = [];
  let paramIdx = 1;

  if (keyword) {
    conditions.push(`(e.name ILIKE $${paramIdx} OR e.employee_code ILIKE $${paramIdx})`);
    params.push(`%${keyword}%`);
    paramIdx++;
  }
  if (gender) {
    conditions.push(`e.gender = $${paramIdx}`);
    params.push(gender);
    paramIdx++;
  }
  if (township) {
    conditions.push(`(eo.org_path LIKE $${paramIdx} OR eo.org_path = $${paramIdx})`);
    params.push(`/${township}/%`);
    paramIdx++;
  }
  if (secondaryDept) {
    conditions.push(`eo.org_path LIKE $${paramIdx}`);
    params.push(`%/${secondaryDept}`);
    paramIdx++;
  }
  if (positionName) {
    conditions.push(`p.name = $${paramIdx}`);
    params.push(positionName);
    paramIdx++;
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM employee e
     LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
     LEFT JOIN hse_org_unit eo ON eo.id = ea.org_unit_id AND eo.is_deleted = false
     LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
     LEFT JOIN (SELECT MAX(id) AS id, personnel_id FROM over_age_personnel WHERE is_deleted = false GROUP BY personnel_id) oap ON oap.personnel_id = e.id
     WHERE ${whereClause}`,
    params
  );
  const total = countResult.rows[0].total;

  params.push(limitNum, offset);
  const result = await pool.query(
    `SELECT e.id, e.employee_code, e.id_card, e.name, e.gender, e.birth_date, e.phone,
            e.person_category, e.person_type, e.is_public_welfare,
            EXTRACT(YEAR FROM age(e.birth_date))::INT AS age,
            ${buildOptimizeOverAgeYearsExpr('e')} AS over_age_years,
            oap.id AS over_age_id,
            ea.org_unit_id, eo.org_name AS dept_name, eo.org_path,
            ea.position_id, p.name AS position_name, ea.status AS status
     FROM employee e
     LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
     LEFT JOIN hse_org_unit eo ON eo.id = ea.org_unit_id AND eo.is_deleted = false
     LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
     LEFT JOIN (SELECT MAX(id) AS id, personnel_id FROM over_age_personnel WHERE is_deleted = false GROUP BY personnel_id) oap ON oap.personnel_id = e.id
     WHERE ${whereClause}
     ORDER BY
       CASE
         WHEN p.name LIKE '%乡镇作业中心经理%' THEN 1
         WHEN p.name = '管理员' THEN 2
         WHEN p.name IN ('中转站管理员','转运站操作员') THEN 3
         WHEN p.name LIKE '%保洁%' THEN 4
         ELSE 5
       END,
       age DESC, e.birth_date ASC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    params
  );

  return { rows: result.rows, total, pageNum, limitNum };
}

// GET /over-age/auto-stats — 超龄人员统计
async function getAutoStats() {
  const [totalResult, genderResult, ageGroupResult, deptResult] = await Promise.all([
    pool.query(`
      SELECT COUNT(*)::int AS total FROM employee e
      WHERE e.is_deleted = false AND e.employment_relation = '正式员工' AND e.birth_date IS NOT NULL
      AND ${buildOptimizeOverAgeCondition('e')}`),
    pool.query(`
      SELECT e.gender, COUNT(*)::int AS count FROM employee e
      WHERE e.is_deleted = false AND e.employment_relation = '正式员工' AND e.birth_date IS NOT NULL
      AND ${buildOptimizeOverAgeCondition('e')}
      GROUP BY e.gender`),
    pool.query(`
      SELECT
        CASE
          WHEN EXTRACT(YEAR FROM age(e.birth_date))::INT BETWEEN 51 AND 55 THEN '51-55岁'
          WHEN EXTRACT(YEAR FROM age(e.birth_date))::INT BETWEEN 56 AND 60 THEN '56-60岁'
          WHEN EXTRACT(YEAR FROM age(e.birth_date))::INT BETWEEN 61 AND 65 THEN '61-65岁'
          WHEN EXTRACT(YEAR FROM age(e.birth_date))::INT BETWEEN 66 AND 70 THEN '66-70岁'
          WHEN EXTRACT(YEAR FROM age(e.birth_date))::INT > 70 THEN '70岁以上'
          ELSE '其他'
        END AS age_group,
        COUNT(*)::int AS count
      FROM employee e
      WHERE e.is_deleted = false AND e.employment_relation = '正式员工' AND e.birth_date IS NOT NULL
      AND ${buildOptimizeOverAgeCondition('e')}
      GROUP BY age_group
      ORDER BY age_group`),
    pool.query(`
      SELECT ev.org_name AS dept_name, COUNT(*)::int AS count
      FROM employee e
      LEFT JOIN v_employee_current ev ON ev.employee_id = e.id
      WHERE e.is_deleted = false AND e.employment_relation = '正式员工' AND e.birth_date IS NOT NULL
      AND ${buildOptimizeOverAgeCondition('e')}
      GROUP BY ev.org_name
      ORDER BY count DESC
      LIMIT 10`),
  ]);

  const byGender = {};
  genderResult.rows.forEach(r => { byGender[r.gender || '未知'] = r.count; });

  const byAgeGroup = {};
  ageGroupResult.rows.forEach(r => { byAgeGroup[r.age_group] = r.count; });

  return {
    total: totalResult.rows[0].total,
    byGender,
    byAgeGroup,
    topDepartments: deptResult.rows,
    thresholds: { 男: OVERAGE_OPTIMIZE_LIMIT, 女: OVERAGE_OPTIMIZE_LIMIT },
  };
}

// GET /over-age/auto-export — 导出超龄人员清单（返回原始行，密文 id_card/phone 由 controller 解密后组装 CSV）
async function getAutoExport(query) {
  const { keyword, gender } = query;
  const conditions = [
    'e.is_deleted = false',
    "e.employment_relation = '正式员工'", // 导出仅在职超龄，离职（辞职/死亡）不计入
    'e.birth_date IS NOT NULL',
    buildOptimizeOverAgeCondition('e'),
  ];
  const params = [];
  let paramIdx = 1;
  if (keyword) {
    conditions.push(`(e.name ILIKE $${paramIdx} OR e.employee_code ILIKE $${paramIdx})`);
    params.push(`%${keyword}%`);
    paramIdx++;
  }
  if (gender) {
    conditions.push(`e.gender = $${paramIdx}`);
    params.push(gender);
    paramIdx++;
  }
  const whereClause = conditions.join(' AND ');

  const result = await pool.query(
    `SELECT e.id, e.employee_code, e.name, e.gender, e.birth_date,
            EXTRACT(YEAR FROM age(e.birth_date))::INT AS age,
            ${buildOptimizeOverAgeYearsExpr('e')} AS over_age_years,
            e.id_card, e.phone,
            e.person_category, e.person_type, e.is_public_welfare,
            eo.org_name AS dept_name, p.name AS position_name,
            oap.id AS over_age_id
     FROM employee e
     LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
     LEFT JOIN hse_org_unit eo ON eo.id = ea.org_unit_id AND eo.is_deleted = false
     LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
     LEFT JOIN (SELECT MAX(id) AS id, personnel_id FROM over_age_personnel WHERE is_deleted = false GROUP BY personnel_id) oap ON oap.personnel_id = e.id
     WHERE ${whereClause}
     ORDER BY
       CASE
         WHEN p.name LIKE '%乡镇作业中心经理%' THEN 1
         WHEN p.name = '管理员' THEN 2
         WHEN p.name IN ('中转站管理员','转运站操作员') THEN 3
         WHEN p.name LIKE '%保洁%' THEN 4
         ELSE 5
       END,
       age DESC, e.birth_date ASC`,
    params
  );

  return result.rows;
}

// GET /over-age/auto/:id — 单个超龄人员详情
async function getAutoDetail(id) {
  const result = await pool.query(
    `SELECT e.id, e.employee_code, e.id_card, e.name, e.gender, e.birth_date, e.phone,
            e.person_category, e.person_type, e.is_public_welfare, e.id_address,
            EXTRACT(YEAR FROM age(e.birth_date))::INT AS age,
            ${buildOptimizeOverAgeYearsExpr('e')} AS over_age_years,
            ${OVERAGE_OPTIMIZE_LIMIT} AS age_threshold,
            oap.id AS over_age_id
     FROM employee e
     LEFT JOIN (SELECT MAX(id) AS id, personnel_id FROM over_age_personnel WHERE is_deleted = false GROUP BY personnel_id) oap ON oap.personnel_id = e.id
     WHERE e.id = $1 AND e.is_deleted = false AND e.birth_date IS NOT NULL`,
    [id]
  );

  if (result.rows.length === 0) return { error: -2, message: '员工不存在或无出生日期' };

  const emp = result.rows[0];

  const orgResult = await pool.query(
    `SELECT ea.org_unit_id, ou.org_name AS dept_name, ou.org_path,
            ea.position_id, p.name AS position_name, ea.status AS status,
            ea.start_date
     FROM employee_assignment ea
     LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
     LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
     WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false`,
    [id]
  );
  emp.org = orgResult.rows[0] || null;
  if (orgResult.rows[0]) {
    emp.dept_name = orgResult.rows[0].dept_name;
    emp.position_name = orgResult.rows[0].position_name;
  }

  return { row: emp };
}

module.exports = {
  getAutoList,
  getAutoStats,
  getAutoExport,
  getAutoDetail,
};
