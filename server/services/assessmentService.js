/**
 * Sprint6.5-B 集团HSE考核分析系统（/api/hse/assessment）—— 业务层
 * 原 routes/hse-assessment.js（约 1362 行）全部业务 + SQL + 私有辅助函数收敛于此。
 * 每个 HTTP 端点对应一个 service 函数，返回统一描述符（__t:'json'），由 controllers/assessmentController.js 的 respond()
 * 统一解释为对外 JSON 契约，行为与原路由逐字节一致（挂载点 /api/hsse/assessment 不变，由 app.js 依赖）。
 *
 * 描述符语义（本域为纯只读 GET，六端点均无鉴权、无鉴权守卫）：
 *  - 成功：{ __t:'json', payload, message } → controller 输出 { code:0, data: payload }（HTTP 200）
 *  - 内部异常：{ __t:'json', error:{code:1,message}, httpStatus } → controller 输出 { code:1, message }（对应原 catch 的 res.status(500)）
 *
 * 错误语义判定（逐条对照原文，全部 6 个 catch 均为 res.status(500).json({code:1,message})）：
 *  本文件不存在 res.json(error(...)) 的默认 200 业务分支；六个端点（overview/ranking/indicator-analysis/target-progress/deduction-detail/）
 *  成功=200（code:0），异常=500（code:1，message 为 e.message）。故 service 错误描述符一律带 httpStatus:500。
 *  内置的「非致命」处理：overview 的模型版本查询（仅当 e.code==='42P01' 时视为表缺失静默降级）与部门排名查询（吞异常）；
 *  target-progress 的目标责任书查询（表缺失时使用默认数据）——均为 try/catch 内的局部兜底，不触发顶层 catch。
 *
 * 数据约束：仅读取 accidents/violation_records/training_records/rectification_task/license_demerit_records/
 *  hse_employee_risk_snapshot/employee/employee_assignment/position/hazard_record/hse_org_unit/
 *  hse_assessment_model_version/objective_contract_version/objective_contract_indicator/assessment_records，禁止修改源数据。
 */

const { pool } = require('../config/db');

// ============================================================
// 常量（原文件顶层常量，逐字保留）
// ============================================================

// 考核模型v1.1 规则常量
const ACCIDENT_LEVEL_WEIGHT = {
  '轻微': 1, '一般': 3, '较大': 6, '重大': 10, '特别重大': 15,
};

const GRID_CHIEF_INSPECTION_REQUIREMENT = {
  '总网格长': { days: 3, requiredInspections: 1 },
  '一级网格长': { days: 2, requiredInspections: 1 },
  '二级网格长': { days: 1, requiredInspections: 1 },
  '三级网格长': { days: 1, requiredInspections: 1 },
};

const DEPT_SCORING_WEIGHTS = { safety: 0.20, risk: 0.15, accident: 0.25, rectification: 0.15, management: 0.25 };

const TOWNSHIP_SCORING_WEIGHTS = { riskLevel: 0.15, violation: 0.15, driverRisk: 0.15, accident: 0.20, patrol: 0.15, management: 0.20 };

// ============================================================
// 描述符快捷构造
// ============================================================
const ok = (payload, message) => ({ __t: 'json', payload, message });
const err = (code, message, httpStatus) => ({ __t: 'json', error: { code, message }, ...(httpStatus ? { httpStatus } : {}) });

/** 统一包裹：异常 → {error:{code:1,message}, httpStatus:500}（等价原 catch 的 res.status(500).json({code:1,message})） */
async function W(fn) {
  try {
    return await fn();
  } catch (e) {
    console.error('[hse-assessment] error:', e);
    return err(1, e.message, 500);
  }
}

// ============================================================
// 辅助函数（原文件顶层模块私有函数，逐字保留）
// ============================================================

/**
 * 权限过滤辅助函数
 * 原实现为 getPermissionScope(req)，内部通过 req.user?.role 读取角色，req.user 可 undefined（未鉴权时回退 admin）。
 */
function getPermissionScope(req) {
  const role = req.user?.role || 'admin';
  const scopes = {
    'admin': { level: 'all', canViewAll: true },
    'safety_manager': { level: 'all', canViewAll: true },
    'group_leader': { level: 'group', canViewAll: true },
    'department_manager': { level: 'department', canViewAll: false, filterType: 'department' },
    'township_manager': { level: 'township', canViewAll: false, filterType: 'township' },
    'area_manager': { level: 'area', canViewAll: false, filterType: 'area' },
  };
  return scopes[role] || scopes['admin'];
}

/**
 * 计算网格巡查合规率
 * @param {Array} gridRows 网格长统计行
 * @returns {number} 合规率(0-100)
 */
function calculateGridCompliance(gridRows) {
  let totalRequired = 0;
  let totalActual = 0;
  gridRows.forEach(row => {
    const chiefCount = parseInt(row.chief_count) || 0;
    const inspectionCount = parseInt(row.inspection_count) || 0;
    const gridLevel = row.grid_level;
    if (GRID_CHIEF_INSPECTION_REQUIREMENT[gridLevel]) {
      const requirement = GRID_CHIEF_INSPECTION_REQUIREMENT[gridLevel];
      const requiredInspections = Math.floor(365 / requirement.days) * requirement.requiredInspections * chiefCount;
      totalRequired += requiredInspections;
      totalActual += inspectionCount;
    }
  });
  return totalRequired > 0 ? Math.round((totalActual / totalRequired) * 100) : 100;
}

/**
 * 根据综合得分返回等级
 */
function getGrade(score) {
  if (score >= 90) return '优秀';
  if (score >= 80) return '良好';
  if (score >= 70) return '合格';
  return '不合格';
}

/**
 * 返回指标状态: excellent/good/warning/danger
 * @param {number} value 实际值
 * @param {number} target 目标值
 * @param {boolean} isReverse 是否反向指标(值越小越好)
 */
function getIndicatorStatus(value, target, isReverse) {
  value = parseFloat(value) || 0;
  target = parseFloat(target) || 0;
  if (isReverse) {
    if (value <= target) return 'excellent';
    if (value <= target * 1.1) return 'good';
    if (value <= target * 1.5) return 'warning';
    return 'danger';
  } else {
    if (target === 0) return value > 0 ? 'excellent' : 'warning';
    if (value >= target) return 'excellent';
    if (value >= target * 0.9) return 'good';
    if (value >= target * 0.7) return 'warning';
    return 'danger';
  }
}

/**
 * 获取年度时间范围
 */
function getYearRange(year) {
  const y = parseInt(year) || new Date().getFullYear();
  return {
    year: y,
    yearStart: `${y}-01-01`,
    yearEnd: `${y}-12-31`,
  };
}

/**
 * 获取5年前日期字符串(用于驾驶风险查询)
 */
function getFiveYearAgoStr() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().split('T')[0];
}

/**
 * 计算各维度得分及综合得分
 * @param {Object} stats 统计数据
 * @returns {Object} { scores, overallScore, grade, deductions }
 */
function computeOverallScores(stats) {
  const violationTotal = parseInt(stats.violationCount) || 0;
  const seriousViolation = parseInt(stats.seriousViolationCount) || 0;
  const majorRisk = parseInt(stats.majorRiskCount) || 0;
  const highRisk = parseInt(stats.highRiskCount) || 0;
  const mediumRisk = parseInt(stats.mediumRiskCount) || 0;
  const weightedIndex = parseInt(stats.accidentWeightedIndex) || 0;
  const majorAccident = parseInt(stats.majorAccidentCount) || 0;
  const rectificationTotal = parseInt(stats.rectificationTotal) || 0;
  const rectificationCompleted = parseInt(stats.rectificationCompleted) || 0;
  const rectificationOverdue = parseInt(stats.rectificationOverdue) || 0;
  const fiveYearDemeritPoints = parseInt(stats.fiveYearDemeritPoints) || 0;
  const driverCount = parseInt(stats.driverCount) || 0;
  const gridCompliance = parseFloat(stats.gridCompliance) || 0;

  const safetyScore = Math.max(0, 100 - violationTotal * 2 - seriousViolation * 3);
  const riskScore = Math.max(0, 100 - majorRisk * 15 - highRisk * 8 - mediumRisk * 3);
  const accidentScore = Math.max(0, 100 - weightedIndex * 3 - majorAccident * 15);
  const rectificationRate = rectificationTotal > 0 ? (rectificationCompleted / rectificationTotal) * 100 : 100;
  const rectificationScore = Math.max(0, Math.round(rectificationRate) - rectificationOverdue * 5);
  const driverRiskScore = driverCount > 0
    ? Math.max(0, Math.round(100 - (fiveYearDemeritPoints / (driverCount * 60)) * 100 * 2))
    : 100;
  const managementScore = Math.round(gridCompliance * 0.6 + driverRiskScore * 0.4);

  const overallScore = Math.round(
    safetyScore * DEPT_SCORING_WEIGHTS.safety +
    riskScore * DEPT_SCORING_WEIGHTS.risk +
    accidentScore * DEPT_SCORING_WEIGHTS.accident +
    rectificationScore * DEPT_SCORING_WEIGHTS.rectification +
    managementScore * DEPT_SCORING_WEIGHTS.management
  );

  const deductions = [
    { category: '三违', reason: `三违总数${violationTotal}次`, deductionPoints: violationTotal * 2 + seriousViolation * 3 },
    { category: '风险', reason: `重大风险${majorRisk}人,高风险${highRisk}人`, deductionPoints: majorRisk * 15 + highRisk * 8 },
    { category: '事故', reason: `事故加权指数${weightedIndex},重大事故${majorAccident}起`, deductionPoints: weightedIndex * 3 + majorAccident * 15 },
    { category: '整改', reason: `逾期整改${rectificationOverdue}项`, deductionPoints: rectificationOverdue * 5 + Math.round(100 - rectificationRate) },
    { category: '管理', reason: `网格合规率${gridCompliance}%`, deductionPoints: Math.round(100 - managementScore) },
  ].filter(d => d.deductionPoints > 0).sort((a, b) => b.deductionPoints - a.deductionPoints);

  return {
    scores: { safety: safetyScore, risk: riskScore, accident: accidentScore, rectification: rectificationScore, management: managementScore },
    overallScore,
    grade: getGrade(overallScore),
    deductions,
  };
}

// ============================================================
// 1. GET /overview - 集团HSE考核总览
// ============================================================
const overview = (query) => W(async () => {
  const { year, yearStart, yearEnd } = getYearRange(query.year);
  const fiveYearsAgoStr = getFiveYearAgoStr();

  let modelVersion = { version: 'v1.1', effectiveDate: null, description: '默认版本' };
  try {
    const modelResult = await pool.query(
      `SELECT version, effective_date, description FROM hse_assessment_model_version WHERE status = 'active' AND is_deleted = false LIMIT 1`
    );
    if (modelResult.rows[0]) {
      modelVersion = {
        version: modelResult.rows[0].version,
        effectiveDate: modelResult.rows[0].effective_date,
        description: modelResult.rows[0].description,
      };
    }
  } catch (e) {
    if (e.code !== '42P01') throw e;
  }

  // 事故统计
  const accidentResult = await pool.query(
    `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE level IN ('重大', '特别重大')) as major_count,
         COUNT(*) FILTER (WHERE level = '较大') as serious_count,
         COUNT(*) FILTER (WHERE level = '一般') as general_count,
         COUNT(*) FILTER (WHERE level = '轻微') as minor_count,
         COALESCE(SUM(casualties), 0) as total_casualties,
         COALESCE(SUM(injuries), 0) as total_injuries,
         COALESCE(SUM(loss_amount), 0) as total_loss,
         COALESCE(SUM(CASE level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
       FROM accidents
       WHERE is_deleted = false AND accident_date >= $1 AND accident_date <= $2`,
    [yearStart, yearEnd]
  );
  const accidentRow = accidentResult.rows[0];

  // 三违统计
  const violationResult = await pool.query(
    `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE violation_level = '严重') as serious_count,
         COUNT(*) FILTER (WHERE violation_level = '一般') as general_count,
         COUNT(*) FILTER (WHERE violation_level = '轻微') as minor_count
       FROM violation_records
       WHERE is_deleted = false AND violation_date >= $1 AND violation_date <= $2`,
    [yearStart, yearEnd]
  );
  const violationRow = violationResult.rows[0];

  // 培训统计
  const trainingResult = await pool.query(
    `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE result = '合格') as qualified_count,
         COALESCE(AVG(score), 0) as avg_score
       FROM training_records
       WHERE is_deleted = false AND training_date >= $1 AND training_date <= $2`,
    [yearStart, yearEnd]
  );
  const trainingRow = trainingResult.rows[0];

  // 隐患整改
  const rectResult = await pool.query(
    `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
         COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count,
         COUNT(*) FILTER (WHERE status = 'pending') as pending_count
       FROM rectification_task
       WHERE is_deleted = false AND created_at >= $1 AND created_at <= $2`,
    [yearStart, yearEnd]
  );
  const rectRow = rectResult.rows[0];

  // 驾驶风险(近5年)
  const demeritResult = await pool.query(
    `SELECT COUNT(*) as total_records,
         COALESCE(SUM(demerit_points), 0) as total_points,
         COUNT(DISTINCT employee_id) as driver_count
       FROM license_demerit_records
       WHERE is_deleted = false AND demerit_date >= $1`,
    [fiveYearsAgoStr]
  );
  const demeritRow = demeritResult.rows[0];

  // 风险快照
  const riskResult = await pool.query(
    `SELECT COUNT(*) as total_employees,
         COUNT(*) FILTER (WHERE risk_level = '重大') as major_count,
         COUNT(*) FILTER (WHERE risk_level = '较高') as high_count,
         COUNT(*) FILTER (WHERE risk_level = '一般') as medium_count,
         COUNT(*) FILTER (WHERE risk_level = '低') as low_count,
         COALESCE(AVG(total_score), 0) as avg_score
       FROM hse_employee_risk_snapshot
       WHERE is_deleted = false AND snapshot_date >= $1`,
    [yearStart]
  );
  const riskRow = riskResult.rows[0];

  // 网格长巡查统计
  const gridChiefResult = await pool.query(
    `SELECT CASE
           WHEN p.name ILIKE '%总网格长%' THEN '总网格长'
           WHEN p.name ILIKE '%一级网格长%' THEN '一级网格长'
           WHEN p.name ILIKE '%二级网格长%' THEN '二级网格长'
           WHEN p.name ILIKE '%三级网格长%' THEN '三级网格长'
           ELSE '其他'
         END as grid_level,
         COUNT(DISTINCT e.id) as chief_count,
         COUNT(DISTINCT i.id) as inspection_count
       FROM employee e
       LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN hazard_record i ON i.employee_id = e.id AND i.is_deleted = false
         AND i.report_date >= $1 AND i.report_date <= $2
       WHERE e.is_deleted = false AND (p.name ILIKE '%网格长%')
       GROUP BY grid_level`,
    [yearStart, yearEnd]
  );
  const gridCompliance = calculateGridCompliance(gridChiefResult.rows);

  // 近5年事故趋势
  const trendResult = await pool.query(
    `SELECT EXTRACT(YEAR FROM accident_date)::int as year,
         COUNT(*) as accident_count,
         COALESCE(SUM(CASE level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
       FROM accidents
       WHERE is_deleted = false AND accident_date >= CURRENT_DATE - INTERVAL '5 years'
       GROUP BY EXTRACT(YEAR FROM accident_date) ORDER BY year`
  );

  // 汇总统计数据
  const accidentTotal = parseInt(accidentRow.total_count) || 0;
  const violationTotal = parseInt(violationRow.total_count) || 0;
  const seriousViolation = parseInt(violationRow.serious_count) || 0;
  const trainingTotal = parseInt(trainingRow.total_count) || 0;
  const trainingQualified = parseInt(trainingRow.qualified_count) || 0;
  const rectTotal = parseInt(rectRow.total_count) || 0;
  const rectCompleted = parseInt(rectRow.completed_count) || 0;
  const rectOverdue = parseInt(rectRow.overdue_count) || 0;
  const driverCount = parseInt(demeritRow.driver_count) || 0;
  const fiveYearDemeritPoints = parseInt(demeritRow.total_points) || 0;
  const majorRisk = parseInt(riskRow.major_count) || 0;
  const highRisk = parseInt(riskRow.high_count) || 0;
  const mediumRisk = parseInt(riskRow.medium_count) || 0;
  const weightedIndex = parseInt(accidentRow.weighted_index) || 0;
  const majorAccident = parseInt(accidentRow.major_count) || 0;

  const stats = {
    violationCount: violationTotal,
    seriousViolationCount: seriousViolation,
    majorRiskCount: majorRisk,
    highRiskCount: highRisk,
    mediumRiskCount: mediumRisk,
    accidentWeightedIndex: weightedIndex,
    majorAccidentCount: majorAccident,
    rectificationTotal: rectTotal,
    rectificationCompleted: rectCompleted,
    rectificationOverdue: rectOverdue,
    fiveYearDemeritPoints,
    driverCount,
    gridCompliance,
  };

  const { scores, overallScore, grade } = computeOverallScores(stats);

  // 各维度排名(集团整体在自身内部的相对位置,此处简化为基于得分排序)
  const scoreEntries = Object.entries(scores).map(([key, val]) => ({ key, val }));
  scoreEntries.sort((a, b) => b.val - a.val);
  const scoreRanks = {};
  scoreEntries.forEach((item, idx) => { scoreRanks[item.key] = idx + 1; });

  const trainingCompletionRate = trainingTotal > 0 ? Math.round((trainingQualified / trainingTotal) * 100) : 0;
  const rectificationRate = rectTotal > 0 ? Math.round((rectCompleted / rectTotal) * 100) : 0;
  const demeritRate = driverCount > 0 ? Math.round((fiveYearDemeritPoints / (driverCount * 60)) * 100) : 0;

  // 部门排名(取top)
  let topDepartments = [];
  try {
    const deptResult = await pool.query(
      `SELECT o.id, o.org_name,
           COUNT(a.id) as accident_count,
           COALESCE(SUM(CASE a.level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
         FROM hse_org_unit o
         LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
         LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
         LEFT JOIN accidents a ON a.personnel_id::bigint = e.id AND a.is_deleted = false
           AND a.accident_date >= $1 AND a.accident_date <= $2
         WHERE o.is_deleted = false AND o.org_type IN ('department', 'operation_center', 'center')
         GROUP BY o.id, o.org_name
         ORDER BY weighted_index ASC, accident_count ASC
         LIMIT 5`,
      [yearStart, yearEnd]
    );
    topDepartments = deptResult.rows.map((r, idx) => ({
      deptId: r.id,
      deptName: r.org_name,
      overallScore: Math.max(0, 100 - (parseInt(r.weighted_index) || 0) * 3),
      rank: idx + 1,
    }));
  } catch (e) {
    // 部门排名查询失败不影响主流程
  }

  return ok({
    currentYear: year,
    modelVersion,
    overallScore,
    grade,
    scores: {
      safety: { score: scores.safety, rank: scoreRanks.safety },
      risk: { score: scores.risk, rank: scoreRanks.risk },
      accident: { score: scores.accident, rank: scoreRanks.accident },
      rectification: { score: scores.rectification, rank: scoreRanks.rectification },
      management: { score: scores.management, rank: scoreRanks.management },
    },
    summary: {
      accidentCount: accidentTotal,
      accidentWeightedIndex: weightedIndex,
      violationCount: violationTotal,
      seriousViolationCount: seriousViolation,
      trainingCompletionRate,
      rectificationRate,
      demeritRate,
      gridInspectionCompliance: gridCompliance,
      majorRiskCount: majorRisk,
      highRiskCount: highRisk,
      avgRiskScore: Math.round(parseFloat(riskRow.avg_score) || 0),
    },
    trend: trendResult.rows.map(r => ({
      year: parseInt(r.year) || 0,
      accidentCount: parseInt(r.accident_count) || 0,
      weightedIndex: parseInt(r.weighted_index) || 0,
      overallScore: Math.max(0, 100 - (parseInt(r.weighted_index) || 0) * 3),
    })),
    topDepartments,
  });
});

// ============================================================
// 2. GET /ranking - 组织考核排名
// ============================================================
const ranking = (query) => W(async () => {
  const level = (query.level || 'group').toLowerCase();
  const { year, yearStart, yearEnd } = getYearRange(query.year);

  // group级别返回集团整体得分
  if (level === 'group') {
    const accidentResult = await pool.query(
      `SELECT COUNT(*) as total_count,
           COUNT(*) FILTER (WHERE level IN ('重大', '特别重大')) as major_count,
           COALESCE(SUM(CASE level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
         FROM accidents WHERE is_deleted = false AND accident_date >= $1 AND accident_date <= $2`,
      [yearStart, yearEnd]
    );
    const row = accidentResult.rows[0];
    const weightedIndex = parseInt(row.weighted_index) || 0;
    return ok({
      level: 'group',
      currentYear: year,
      rankings: [{
        orgId: 0,
        orgName: '集团整体',
        orgType: 'group',
        overallScore: Math.max(0, 100 - weightedIndex * 3),
        overallRank: 1,
        scores: { safety: 0, risk: 0, accident: 0, rectification: 0, management: 0 },
        ranks: { safety: 1, risk: 1, accident: 1, rectification: 1, management: 1 },
        topDeductions: [{ category: '事故', reason: `事故加权指数${weightedIndex}`, deductionPoints: weightedIndex * 3 }],
        accidentCount: parseInt(row.total_count) || 0,
        violationCount: 0,
        employeeCount: 0,
        majorRiskCount: 0,
        highRiskCount: 0,
      }]
    });
  }

  // 根据 level 确定组织类型过滤条件，兼容历史数据中的旧枚举值
  const orgTypeMap = {
    department: "('department', 'operation_center', 'center')",
    center: "('operation_center', 'center')",
    township: "('town_center', 'township', 'area')",
    area: "('area', 'town_center', 'township')",
  };
  const orgTypeFilter = orgTypeMap[level] || orgTypeMap.department;

  // 查询组织单元
  const orgResult = await pool.query(
    `SELECT id, org_name, org_type FROM hse_org_unit WHERE is_deleted = false AND org_type IN ${orgTypeFilter} ORDER BY org_name`
  );

  // 查询各组织的事故统计
  const accidentByOrg = await pool.query(
    `SELECT o.id as org_id,
         COUNT(a.id) as accident_count,
         COUNT(a.id) FILTER (WHERE a.level IN ('重大', '特别重大')) as major_count,
         COALESCE(SUM(CASE a.level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
       FROM hse_org_unit o
       LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
       LEFT JOIN accidents a ON a.personnel_id::bigint = e.id AND a.is_deleted = false
         AND a.accident_date >= $1 AND a.accident_date <= $2
       WHERE o.is_deleted = false AND o.org_type IN ${orgTypeFilter}
       GROUP BY o.id`,
    [yearStart, yearEnd]
  );

  // 查询各组织的三违统计
  const violationByOrg = await pool.query(
    `SELECT o.id as org_id,
         COUNT(v.id) as violation_count,
         COUNT(v.id) FILTER (WHERE v.violation_level = '严重') as serious_count
       FROM hse_org_unit o
       LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
       LEFT JOIN violation_records v ON v.violator_id = e.id AND v.is_deleted = false
         AND v.violation_date >= $1 AND v.violation_date <= $2
       WHERE o.is_deleted = false AND o.org_type IN ${orgTypeFilter}
       GROUP BY o.id`,
    [yearStart, yearEnd]
  );

  // 查询各组织员工数及风险人数
  const employeeByOrg = await pool.query(
    `SELECT o.id as org_id,
         COUNT(DISTINCT e.id) as employee_count,
         COUNT(DISTINCT rs.employee_id) FILTER (WHERE rs.risk_level = '重大') as major_risk,
         COUNT(DISTINCT rs.employee_id) FILTER (WHERE rs.risk_level = '较高') as high_risk
       FROM hse_org_unit o
       LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
       LEFT JOIN hse_employee_risk_snapshot rs ON rs.employee_id = e.id AND rs.is_deleted = false AND rs.snapshot_date >= $1
       WHERE o.is_deleted = false AND o.org_type IN ${orgTypeFilter}
       GROUP BY o.id`,
    [yearStart]
  );

  // 汇总每个组织的得分
  const accidentMap = {};
  accidentByOrg.rows.forEach(r => { accidentMap[r.org_id] = r; });
  const violationMap = {};
  violationByOrg.rows.forEach(r => { violationMap[r.org_id] = r; });
  const employeeMap = {};
  employeeByOrg.rows.forEach(r => { employeeMap[r.org_id] = r; });

  const rankings = orgResult.rows.map(org => {
    const acc = accidentMap[org.id] || {};
    const vio = violationMap[org.id] || {};
    const emp = employeeMap[org.id] || {};
    const violationCount = parseInt(vio.violation_count) || 0;
    const seriousViolation = parseInt(vio.serious_count) || 0;
    const majorRisk = parseInt(emp.major_risk) || 0;
    const highRisk = parseInt(emp.high_risk) || 0;
    const weightedIndex = parseInt(acc.weighted_index) || 0;
    const majorAccident = parseInt(acc.major_count) || 0;
    const employeeCount = parseInt(emp.employee_count) || 0;

    const stats = {
      violationCount, seriousViolationCount: seriousViolation,
      majorRiskCount: majorRisk, highRiskCount: highRisk, mediumRiskCount: 0,
      accidentWeightedIndex: weightedIndex, majorAccidentCount: majorAccident,
      rectificationTotal: 0, rectificationCompleted: 0, rectificationOverdue: 0,
      fiveYearDemeritPoints: 0, driverCount: 0, gridCompliance: 100,
    };
    const { scores, deductions } = computeOverallScores(stats);

    return {
      orgId: org.id,
      orgName: org.org_name,
      orgType: org.org_type,
      scores,
      topDeductions: deductions.slice(0, 3),
      accidentCount: parseInt(acc.accident_count) || 0,
      violationCount,
      employeeCount,
      majorRiskCount: majorRisk,
      highRiskCount: highRisk,
      _overallScore: scores.safety * DEPT_SCORING_WEIGHTS.safety + scores.risk * DEPT_SCORING_WEIGHTS.risk + scores.accident * DEPT_SCORING_WEIGHTS.accident + scores.rectification * DEPT_SCORING_WEIGHTS.rectification + scores.management * DEPT_SCORING_WEIGHTS.management,
    };
  });

  // 计算综合排名及各维度排名
  rankings.sort((a, b) => b._overallScore - a._overallScore);
  rankings.forEach((r, idx) => {
    r.overallScore = Math.round(r._overallScore);
    r.overallRank = idx + 1;
    delete r._overallScore;
  });
  // 各维度排名
  ['safety', 'risk', 'accident', 'rectification', 'management'].forEach(dim => {
    const sorted = [...rankings].sort((a, b) => b.scores[dim] - a.scores[dim]);
    sorted.forEach((r, idx) => {
      if (!r.ranks) r.ranks = {};
      r.ranks[dim] = idx + 1;
    });
  });
  rankings.forEach(r => { r.scores = { ...r.scores }; });

  return ok({ level, currentYear: year, rankings });
});

// ============================================================
// 3. GET /indicator-analysis - 指标分析
// ============================================================
const indicatorAnalysis = (query) => W(async () => {
  const category = query.category;
  const { year, yearStart, yearEnd } = getYearRange(query.year);
  const fiveYearsAgoStr = getFiveYearAgoStr();

  // 事故指标
  const accidentResult = await pool.query(
    `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE level IN ('重大', '特别重大')) as major_count,
         COUNT(*) FILTER (WHERE status = '已结案') as closed_count,
         COALESCE(SUM(CASE level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index,
         EXTRACT(QUARTER FROM accident_date)::int as quarter
       FROM accidents
       WHERE is_deleted = false AND accident_date >= $1 AND accident_date <= $2
       GROUP BY quarter ORDER BY quarter`,
    [yearStart, yearEnd]
  );
  const accidentAgg = await pool.query(
    `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE level IN ('重大', '特别重大')) as major_count,
         COUNT(*) FILTER (WHERE status = '已结案') as closed_count,
         COALESCE(SUM(CASE level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
       FROM accidents WHERE is_deleted = false AND accident_date >= $1 AND accident_date <= $2`,
    [yearStart, yearEnd]
  );
  const accAgg = accidentAgg.rows[0];
  const accTotal = parseInt(accAgg.total_count) || 0;
  const accMajor = parseInt(accAgg.major_count) || 0;
  const accClosed = parseInt(accAgg.closed_count) || 0;
  const accIndex = parseInt(accAgg.weighted_index) || 0;
  const accCloseRate = accTotal > 0 ? Math.round((accClosed / accTotal) * 100) : 0;
  const quarterValues = [1, 2, 3, 4].map(q => {
    const row = accidentResult.rows.find(r => parseInt(r.quarter) === q);
    return row ? parseInt(row.total_count) || 0 : 0;
  });

  // 三违指标
  const violationResult = await pool.query(
    `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE violation_level = '严重') as serious_count,
         COUNT(*) FILTER (WHERE status = '已关闭') as closed_count,
         EXTRACT(QUARTER FROM violation_date)::int as quarter
       FROM violation_records
       WHERE is_deleted = false AND violation_date >= $1 AND violation_date <= $2
       GROUP BY quarter ORDER BY quarter`,
    [yearStart, yearEnd]
  );
  const violationAgg = await pool.query(
    `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE violation_level = '严重') as serious_count,
         COUNT(*) FILTER (WHERE status = '已关闭') as closed_count
       FROM violation_records WHERE is_deleted = false AND violation_date >= $1 AND violation_date <= $2`,
    [yearStart, yearEnd]
  );
  const vioAgg = violationAgg.rows[0];
  const vioTotal = parseInt(vioAgg.total_count) || 0;
  const vioSerious = parseInt(vioAgg.serious_count) || 0;
  const vioClosed = parseInt(vioAgg.closed_count) || 0;
  const vioCloseRate = vioTotal > 0 ? Math.round((vioClosed / vioTotal) * 100) : 0;
  const vioQuarterValues = [1, 2, 3, 4].map(q => {
    const row = violationResult.rows.find(r => parseInt(r.quarter) === q);
    return row ? parseInt(row.total_count) || 0 : 0;
  });

  // 风险指标
  const riskResult = await pool.query(
    `SELECT COUNT(*) as total_employees,
         COUNT(*) FILTER (WHERE risk_level = '重大') as major_count,
         COUNT(*) FILTER (WHERE risk_level = '较高') as high_count,
         COUNT(*) FILTER (WHERE risk_level = '一般') as medium_count,
         COUNT(*) FILTER (WHERE risk_level = '低') as low_count,
         COALESCE(AVG(total_score), 0) as avg_score
       FROM hse_employee_risk_snapshot
       WHERE is_deleted = false AND snapshot_date >= $1`,
    [yearStart]
  );
  const riskRow = riskResult.rows[0];
  const majorRisk = parseInt(riskRow.major_count) || 0;
  const highRisk = parseInt(riskRow.high_count) || 0;
  const mediumRisk = parseInt(riskRow.medium_count) || 0;
  const lowRisk = parseInt(riskRow.low_count) || 0;
  const avgRiskScore = Math.round(parseFloat(riskRow.avg_score) || 0);

  // 驾驶指标(近5年)
  const demeritResult = await pool.query(
    `SELECT COALESCE(SUM(demerit_points), 0) as total_points,
         COUNT(DISTINCT employee_id) as driver_count,
         EXTRACT(YEAR FROM demerit_date)::int as yr
       FROM license_demerit_records
       WHERE is_deleted = false AND demerit_date >= $1
       GROUP BY yr ORDER BY yr`,
    [fiveYearsAgoStr]
  );
  const demeritAgg = await pool.query(
    `SELECT COALESCE(SUM(demerit_points), 0) as total_points,
         COUNT(DISTINCT employee_id) as driver_count
       FROM license_demerit_records WHERE is_deleted = false AND demerit_date >= $1`,
    [fiveYearsAgoStr]
  );
  const demAgg = demeritAgg.rows[0];
  const fiveYearPoints = parseInt(demAgg.total_points) || 0;
  const driverCount = parseInt(demAgg.driver_count) || 0;
  const demeritRate = driverCount > 0 ? Math.round((fiveYearPoints / (driverCount * 60)) * 100) : 0;
  const demeritYearLabels = demeritResult.rows.map(r => String(r.yr));
  const demeritYearValues = demeritResult.rows.map(r => parseInt(r.total_points) || 0);

  // 整改指标
  const rectResult = await pool.query(
    `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
         COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
         COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
         COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
       FROM rectification_task
       WHERE is_deleted = false AND created_at >= $1 AND created_at <= $2`,
    [yearStart, yearEnd]
  );
  const rectRow = rectResult.rows[0];
  const rectTotal = parseInt(rectRow.total_count) || 0;
  const rectCompleted = parseInt(rectRow.completed_count) || 0;
  const rectInProgress = parseInt(rectRow.in_progress_count) || 0;
  const rectPending = parseInt(rectRow.pending_count) || 0;
  const rectOverdue = parseInt(rectRow.overdue_count) || 0;
  const rectRate = rectTotal > 0 ? Math.round((rectCompleted / rectTotal) * 100) : 0;

  // 管理履职指标
  const gridChiefResult = await pool.query(
    `SELECT CASE
           WHEN p.name ILIKE '%总网格长%' THEN '总网格长'
           WHEN p.name ILIKE '%一级网格长%' THEN '一级网格长'
           WHEN p.name ILIKE '%二级网格长%' THEN '二级网格长'
           WHEN p.name ILIKE '%三级网格长%' THEN '三级网格长'
           ELSE '其他'
         END as grid_level,
         COUNT(DISTINCT e.id) as chief_count,
         COUNT(DISTINCT i.id) as inspection_count
       FROM employee e
       LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN hazard_record i ON i.employee_id = e.id AND i.is_deleted = false
         AND i.report_date >= $1 AND i.report_date <= $2
       WHERE e.is_deleted = false AND (p.name ILIKE '%网格长%')
       GROUP BY grid_level`,
    [yearStart, yearEnd]
  );
  const overallGridCompliance = calculateGridCompliance(gridChiefResult.rows);
  const gridComplianceByLevel = {};
  gridChiefResult.rows.forEach(r => {
    const level = r.grid_level;
    if (GRID_CHIEF_INSPECTION_REQUIREMENT[level]) {
      const req = GRID_CHIEF_INSPECTION_REQUIREMENT[level];
      const chiefCount = parseInt(r.chief_count) || 0;
      const inspectionCount = parseInt(r.inspection_count) || 0;
      const required = Math.floor(365 / req.days) * req.requiredInspections * chiefCount;
      gridComplianceByLevel[level] = required > 0 ? Math.round((inspectionCount / required) * 100) : 100;
    }
  });

  // 构建6类指标
  const allCategories = [
    {
      category: '事故指标', categoryKey: 'accident',
      indicators: [
        { name: '事故起数', value: accTotal, target: 0, score: accTotal === 0 ? 100 : Math.max(0, 100 - accTotal * 20), status: getIndicatorStatus(accTotal, 0, true) },
        { name: '事故指数', value: accIndex, target: 0, score: Math.max(0, 100 - accIndex * 3), status: getIndicatorStatus(accIndex, 0, true) },
        { name: '重大事故', value: accMajor, target: 0, score: accMajor === 0 ? 100 : 0, status: getIndicatorStatus(accMajor, 0, true) },
        { name: '事故结案率', value: accCloseRate, unit: '%', target: 100, score: accCloseRate, status: getIndicatorStatus(accCloseRate, 100, false) },
      ],
      chartData: { labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: quarterValues }
    },
    {
      category: '三违指标', categoryKey: 'violation',
      indicators: [
        { name: '三违次数', value: vioTotal, target: 50, score: vioTotal <= 50 ? 100 : Math.max(0, 100 - (vioTotal - 50) * 2), status: getIndicatorStatus(vioTotal, 50, true) },
        { name: '严重三违', value: vioSerious, target: 0, score: Math.max(0, 100 - vioSerious * 3), status: getIndicatorStatus(vioSerious, 0, true) },
        { name: '三违结案率', value: vioCloseRate, unit: '%', target: 100, score: vioCloseRate, status: getIndicatorStatus(vioCloseRate, 100, false) },
      ],
      chartData: { labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: vioQuarterValues }
    },
    {
      category: '风险指标', categoryKey: 'risk',
      indicators: [
        { name: '重大风险人数', value: majorRisk, target: 0, score: Math.max(0, 100 - majorRisk * 15), status: getIndicatorStatus(majorRisk, 0, true) },
        { name: '高风险人数', value: highRisk, target: 0, score: Math.max(0, 100 - highRisk * 8), status: getIndicatorStatus(highRisk, 0, true) },
        { name: '平均风险评分', value: avgRiskScore, target: 80, score: avgRiskScore >= 80 ? 100 : Math.max(0, avgRiskScore), status: getIndicatorStatus(avgRiskScore, 80, false) },
      ],
      chartData: { labels: ['重大', '较高', '一般', '较低'], values: [majorRisk, highRisk, mediumRisk, lowRisk] }
    },
    {
      category: '驾驶指标', categoryKey: 'driver',
      indicators: [
        { name: '扣分率(5年)', value: demeritRate, unit: '%', target: 10, score: Math.max(0, 100 - demeritRate * 2), status: getIndicatorStatus(demeritRate, 10, true) },
        { name: '近5年累计扣分', value: fiveYearPoints, target: 0, score: fiveYearPoints === 0 ? 100 : 0, status: getIndicatorStatus(fiveYearPoints, 0, true) },
        { name: '扣分驾驶员数', value: driverCount, target: 0, score: driverCount === 0 ? 100 : 0, status: getIndicatorStatus(driverCount, 0, true) },
      ],
      chartData: { labels: demeritYearLabels, values: demeritYearValues }
    },
    {
      category: '整改指标', categoryKey: 'rectification',
      indicators: [
        { name: '隐患总数', value: rectTotal, target: 0, score: rectTotal === 0 ? 100 : 0, status: getIndicatorStatus(rectTotal, 0, true) },
        { name: '整改完成率', value: rectRate, unit: '%', target: 98, score: rectRate, status: getIndicatorStatus(rectRate, 98, false) },
        { name: '逾期整改', value: rectOverdue, target: 0, score: Math.max(0, 100 - rectOverdue * 5), status: getIndicatorStatus(rectOverdue, 0, true) },
      ],
      chartData: { labels: ['已完成', '处理中', '待处理', '逾期'], values: [rectCompleted, rectInProgress, rectPending, rectOverdue] }
    },
    {
      category: '管理履职指标', categoryKey: 'management',
      indicators: [
        { name: '网格巡查合规率', value: overallGridCompliance, unit: '%', target: 90, score: overallGridCompliance >= 90 ? 100 : overallGridCompliance, status: getIndicatorStatus(overallGridCompliance, 90, false) },
        { name: '总网格长合规率', value: gridComplianceByLevel['总网格长'] || 0, unit: '%', target: 90, score: (gridComplianceByLevel['总网格长'] || 0) >= 90 ? 100 : (gridComplianceByLevel['总网格长'] || 0), status: getIndicatorStatus(gridComplianceByLevel['总网格长'] || 0, 90, false) },
        { name: '一级网格长合规率', value: gridComplianceByLevel['一级网格长'] || 0, unit: '%', target: 90, score: (gridComplianceByLevel['一级网格长'] || 0) >= 90 ? 100 : (gridComplianceByLevel['一级网格长'] || 0), status: getIndicatorStatus(gridComplianceByLevel['一级网格长'] || 0, 90, false) },
      ],
      chartData: {
        labels: ['总网格长', '一级', '二级', '三级'],
        values: ['总网格长', '一级网格长', '二级网格长', '三级网格长'].map(l => gridComplianceByLevel[l] || 0)
      }
    },
  ];

  const categories = category
    ? allCategories.filter(c => c.categoryKey === category)
    : allCategories;

  return ok({ currentYear: year, categories });
});

// ============================================================
// 4. GET /target-progress - 目标责任书完成情况
// ============================================================

/** 计算目标完成状态（原 handler 内局部函数） */
function calcStatus(actualValue, targetValue, isReverse) {
  if (isReverse) {
    if (actualValue <= targetValue) return 'completed';
    if (actualValue <= targetValue * 1.1) return 'in_progress';
    return 'warning';
  } else {
    if (targetValue === 0) return actualValue > 0 ? 'completed' : 'warning';
    if (actualValue >= targetValue) return 'completed';
    if (actualValue >= targetValue * 0.9) return 'in_progress';
    return 'warning';
  }
}

/** 计算目标完成率（原 handler 内局部函数） */
function calcCompletionRate(actualValue, targetValue, isReverse) {
  if (isReverse) {
    if (actualValue === 0) return targetValue === 0 ? 100 : 100;
    return targetValue >= actualValue ? 100 : Math.round((targetValue / actualValue) * 100);
  } else {
    if (targetValue === 0) return actualValue > 0 ? 100 : 0;
    return Math.min(100, Math.round((actualValue / targetValue) * 100));
  }
}

const targetProgress = (query) => W(async () => {
  const { year, yearStart, yearEnd } = getYearRange(query.year);
  const fiveYearsAgoStr = getFiveYearAgoStr();

  // 查询当前年度目标责任书版本
  let contractVersion = null;
  let dbIndicators = [];
  try {
    const contractResult = await pool.query(
      `SELECT id, name, version, effective_date, expiry_date, status
         FROM objective_contract_version
         WHERE is_deleted = false AND effective_date <= $1 AND expiry_date >= $2
         ORDER BY effective_date DESC LIMIT 1`,
      [yearEnd, yearStart]
    );
    if (contractResult.rows[0]) {
      const c = contractResult.rows[0];
      contractVersion = {
        id: c.id, name: c.name, version: c.version,
        effectiveDate: c.effective_date, expiryDate: c.expiry_date,
        status: c.status || '生效中',
      };
      const indicatorResult = await pool.query(
        `SELECT id, name, category, target_value, target_unit, responsible_unit, responsibility_level
           FROM objective_contract_indicator
           WHERE is_deleted = false AND contract_id = $1 ORDER BY id`,
        [c.id]
      );
      dbIndicators = indicatorResult.rows;
    }
  } catch (e) {
    // 表不存在时使用默认数据
  }

  // 查询实际数据
  const accidentAgg = await pool.query(
    `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE level IN ('重大', '特别重大')) as major_count,
         COALESCE(SUM(CASE level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
       FROM accidents WHERE is_deleted = false AND accident_date >= $1 AND accident_date <= $2`,
    [yearStart, yearEnd]
  );
  const accRow = accidentAgg.rows[0];
  const accTotal = parseInt(accRow.total_count) || 0;
  const accMajor = parseInt(accRow.major_count) || 0;
  const accIndex = parseInt(accRow.weighted_index) || 0;

  const violationAgg = await pool.query(
    `SELECT COUNT(*) as total_count FROM violation_records
       WHERE is_deleted = false AND violation_date >= $1 AND violation_date <= $2`,
    [yearStart, yearEnd]
  );
  const vioTotal = parseInt(violationAgg.rows[0].total_count) || 0;

  const trainingAgg = await pool.query(
    `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE result = '合格') as qualified_count
       FROM training_records
       WHERE is_deleted = false AND training_date >= $1 AND training_date <= $2`,
    [yearStart, yearEnd]
  );
  const trRow = trainingAgg.rows[0];
  const trTotal = parseInt(trRow.total_count) || 0;
  const trQualified = parseInt(trRow.qualified_count) || 0;
  const trainingRate = trTotal > 0 ? Math.round((trQualified / trTotal) * 100) : 0;

  const rectAgg = await pool.query(
    `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE status = 'completed') as completed_count
       FROM rectification_task
       WHERE is_deleted = false AND created_at >= $1 AND created_at <= $2`,
    [yearStart, yearEnd]
  );
  const rcRow = rectAgg.rows[0];
  const rcTotal = parseInt(rcRow.total_count) || 0;
  const rcCompleted = parseInt(rcRow.completed_count) || 0;
  const rectRate = rcTotal > 0 ? Math.round((rcCompleted / rcTotal) * 100) : 0;

  const riskAgg = await pool.query(
    `SELECT COUNT(*) as total_employees,
         COUNT(*) FILTER (WHERE risk_level IN ('重大', '较高')) as high_risk_count
       FROM hse_employee_risk_snapshot
       WHERE is_deleted = false AND snapshot_date >= $1`,
    [yearStart]
  );
  const rkRow = riskAgg.rows[0];
  const rkTotal = parseInt(rkRow.total_employees) || 0;
  const rkHigh = parseInt(rkRow.high_risk_count) || 0;
  const highRiskRate = rkTotal > 0 ? Math.round((rkHigh / rkTotal) * 100) : 0;

  const demeritAgg = await pool.query(
    `SELECT COALESCE(SUM(demerit_points), 0) as total_points,
         COUNT(DISTINCT employee_id) as driver_count
       FROM license_demerit_records
       WHERE is_deleted = false AND demerit_date >= $1`,
    [fiveYearsAgoStr]
  );
  const dmRow = demeritAgg.rows[0];
  const driverCount = parseInt(dmRow.driver_count) || 0;
  const fiveYearPoints = parseInt(dmRow.total_points) || 0;
  const demeritRate = driverCount > 0 ? Math.round((fiveYearPoints / (driverCount * 60)) * 100) : 0;

  // 网格长合规率
  const gridChiefResult = await pool.query(
    `SELECT CASE
           WHEN p.name ILIKE '%总网格长%' THEN '总网格长'
           WHEN p.name ILIKE '%一级网格长%' THEN '一级网格长'
           WHEN p.name ILIKE '%二级网格长%' THEN '二级网格长'
           WHEN p.name ILIKE '%三级网格长%' THEN '三级网格长'
           ELSE '其他'
         END as grid_level,
         COUNT(DISTINCT e.id) as chief_count,
         COUNT(DISTINCT i.id) as inspection_count
       FROM employee e
       LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN hazard_record i ON i.employee_id = e.id AND i.is_deleted = false
         AND i.report_date >= $1 AND i.report_date <= $2
       WHERE e.is_deleted = false AND (p.name ILIKE '%网格长%')
       GROUP BY grid_level`,
    [yearStart, yearEnd]
  );
  const gridCompliance = calculateGridCompliance(gridChiefResult.rows);

  // 如果数据库有指标配置则使用,否则使用默认指标
  let targets;
  if (dbIndicators.length > 0) {
    targets = dbIndicators.map(ind => {
      let actualValue = 0;
      let actualUnit = ind.target_unit || '';
      let isReverse = true;
      const name = ind.name || '';
      if (name.includes('事故起数')) { actualValue = accTotal; }
      else if (name.includes('重大事故')) { actualValue = accMajor; }
      else if (name.includes('事故指数')) { actualValue = accIndex; }
      else if (name.includes('三违')) { actualValue = vioTotal; }
      else if (name.includes('培训')) { actualValue = trainingRate; isReverse = false; }
      else if (name.includes('整改')) { actualValue = rectRate; isReverse = false; }
      else if (name.includes('高风险')) { actualValue = highRiskRate; }
      else if (name.includes('驾驶')) { actualValue = demeritRate; }
      else if (name.includes('网格')) { actualValue = gridCompliance; isReverse = false; }
      const targetValue = parseFloat(ind.target_value) || 0;
      const gap = isReverse ? actualValue - targetValue : targetValue - actualValue;
      return {
        id: ind.id,
        name: ind.name,
        category: ind.category,
        targetValue,
        targetUnit: ind.target_unit || '',
        actualValue,
        actualUnit,
        gap,
        completionRate: calcCompletionRate(actualValue, targetValue, isReverse),
        status: calcStatus(actualValue, targetValue, isReverse),
        responsibleUnit: ind.responsible_unit || '全集团',
        responsibilityLevel: ind.responsibility_level || '集团',
      };
    });
  } else {
    targets = [
      { id: 1, name: '事故起数控制', category: '事故目标', targetValue: 0, targetUnit: '起', actualValue: accTotal, actualUnit: '起', isReverse: true, responsibleUnit: '全集团', responsibilityLevel: '集团' },
      { id: 2, name: '重大事故控制', category: '事故目标', targetValue: 0, targetUnit: '起', actualValue: accMajor, actualUnit: '起', isReverse: true, responsibleUnit: '全集团', responsibilityLevel: '集团' },
      { id: 3, name: '事故指数控制', category: '事故目标', targetValue: 0, targetUnit: '', actualValue: accIndex, actualUnit: '', isReverse: true, responsibleUnit: '各部门', responsibilityLevel: '部门' },
      { id: 4, name: '三违次数控制', category: '三违目标', targetValue: 50, targetUnit: '次', actualValue: vioTotal, actualUnit: '次', isReverse: true, responsibleUnit: '各中心', responsibilityLevel: '环卫作业中心' },
      { id: 5, name: '培训完成率', category: '培训目标', targetValue: 95, targetUnit: '%', actualValue: trainingRate, actualUnit: '%', isReverse: false, responsibleUnit: '各部门', responsibilityLevel: '部门' },
      { id: 6, name: '隐患整改率', category: '整改目标', targetValue: 98, targetUnit: '%', actualValue: rectRate, actualUnit: '%', isReverse: false, responsibleUnit: '各片区', responsibilityLevel: '片区' },
      { id: 7, name: '高风险人员控制', category: '风险目标', targetValue: 5, targetUnit: '%', actualValue: highRiskRate, actualUnit: '%', isReverse: true, responsibleUnit: '各部门', responsibilityLevel: '部门' },
      { id: 8, name: '驾驶风险控制', category: '驾驶目标', targetValue: 10, targetUnit: '%', actualValue: demeritRate, actualUnit: '%', isReverse: true, responsibleUnit: '各片区', responsibilityLevel: '片区' },
      { id: 9, name: '网格长巡查合规率', category: '管理目标', targetValue: 90, targetUnit: '%', actualValue: gridCompliance, actualUnit: '%', isReverse: false, responsibleUnit: '网格长', responsibilityLevel: '网格长' },
    ].map(t => {
      const gap = t.isReverse ? t.actualValue - t.targetValue : t.targetValue - t.actualValue;
      return {
        id: t.id, name: t.name, category: t.category,
        targetValue: t.targetValue, targetUnit: t.targetUnit,
        actualValue: t.actualValue, actualUnit: t.actualUnit,
        gap,
        completionRate: calcCompletionRate(t.actualValue, t.targetValue, t.isReverse),
        status: calcStatus(t.actualValue, t.targetValue, t.isReverse),
        responsibleUnit: t.responsibleUnit,
        responsibilityLevel: t.responsibilityLevel,
      };
    });
  }

  if (!contractVersion) {
    contractVersion = {
      id: 0, name: `${year}年度HSE目标责任书`, version: `v${year}.1`,
      effectiveDate: `${year}-01-01`, expiryDate: `${year}-12-31`, status: '生效中',
    };
  }

  return ok({ currentYear: year, contractVersion, targets });
});

// ============================================================
// 5. GET /deduction-detail - 扣分原因分析
// ============================================================
const deductionDetail = (query, req) => W(async () => {
  const category = (query.category || 'accident').toLowerCase();
  const orgId = query.orgId ? parseInt(query.orgId) : null;
  const { year, yearStart, yearEnd } = getYearRange(query.year);
  const scope = getPermissionScope(req); // 权限范围(预留用于后续按角色过滤)

  // 构建组织过滤条件
  const orgFilter = orgId ? `AND o.id = $3` : '';
  const orgParams = orgId ? [yearStart, yearEnd, orgId] : [yearStart, yearEnd];

  let totalDeduction = 0;
  let details = [];

  if (category === 'accident') {
    // 事故扣分分析
    const accidentByOrg = await pool.query(
      `SELECT o.id, o.org_name,
           COUNT(a.id) as accident_count,
           COUNT(a.id) FILTER (WHERE a.level = '轻微') as minor_count,
           COUNT(a.id) FILTER (WHERE a.level = '一般') as general_count,
           COUNT(a.id) FILTER (WHERE a.level = '较大') as serious_count,
           COUNT(a.id) FILTER (WHERE a.level = '重大') as major_count,
           COUNT(a.id) FILTER (WHERE a.level = '特别重大') as special_count,
           COALESCE(SUM(CASE a.level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
         FROM hse_org_unit o
         LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
         LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
         LEFT JOIN accidents a ON a.personnel_id::bigint = e.id AND a.is_deleted = false
           AND a.accident_date >= $1 AND a.accident_date <= $2
         WHERE o.is_deleted = false AND o.org_type IN ('department', 'operation_center', 'center') ${orgFilter}
         GROUP BY o.id, o.org_name
         HAVING COUNT(a.id) > 0
         ORDER BY weighted_index DESC`,
      orgParams
    );

    const totalWeightedIndex = accidentByOrg.rows.reduce((sum, r) => sum + (parseInt(r.weighted_index) || 0), 0);
    const accidentDeduction = totalWeightedIndex * 3;
    totalDeduction += accidentDeduction;

    const responsibles = accidentByOrg.rows.map(r => {
      const minor = parseInt(r.minor_count) || 0;
      const general = parseInt(r.general_count) || 0;
      const serious = parseInt(r.serious_count) || 0;
      const major = parseInt(r.major_count) || 0;
      const special = parseInt(r.special_count) || 0;
      const weighted = parseInt(r.weighted_index) || 0;
      const detailParts = [];
      if (minor > 0) detailParts.push(`轻微事故${minor}起(权重${minor * ACCIDENT_LEVEL_WEIGHT['轻微']})`);
      if (general > 0) detailParts.push(`一般事故${general}起(权重${general * ACCIDENT_LEVEL_WEIGHT['一般']})`);
      if (serious > 0) detailParts.push(`较大事故${serious}起(权重${serious * ACCIDENT_LEVEL_WEIGHT['较大']})`);
      if (major > 0) detailParts.push(`重大事故${major}起(权重${major * ACCIDENT_LEVEL_WEIGHT['重大']})`);
      if (special > 0) detailParts.push(`特别重大事故${special}起(权重${special * ACCIDENT_LEVEL_WEIGHT['特别重大']})`);
      return {
        type: 'department',
        id: r.id,
        name: r.org_name,
        contribution: weighted * 3,
        details: detailParts.join('，'),
      };
    });

    details.push({
      indicator: '事故加权指数',
      indicatorCode: 'HSE-KPI-ACC-006',
      deductionPoints: accidentDeduction,
      dataSources: [{ table: 'accidents', recordCount: accidentByOrg.rows.reduce((s, r) => s + (parseInt(r.accident_count) || 0), 0), description: '本年度事故记录' }],
      responsibles,
    });

    // 重大事故扣分
    const majorAccidentCount = accidentByOrg.rows.reduce((sum, r) => sum + (parseInt(r.major_count) || 0) + (parseInt(r.special_count) || 0), 0);
    const majorDeduction = majorAccidentCount * 15;
    totalDeduction += majorDeduction;
    details.push({
      indicator: '重大事故扣分',
      indicatorCode: 'HSE-KPI-ACC-002',
      deductionPoints: majorDeduction,
      dataSources: [{ table: 'accidents', recordCount: majorAccidentCount, description: majorAccidentCount === 0 ? '无重大事故' : `重大及以上事故${majorAccidentCount}起` }],
      responsibles: majorAccidentCount === 0 ? [] : accidentByOrg.rows.filter(r => (parseInt(r.major_count) || 0) + (parseInt(r.special_count) || 0) > 0).map(r => ({
        type: 'department', id: r.id, name: r.org_name,
        contribution: ((parseInt(r.major_count) || 0) + (parseInt(r.special_count) || 0)) * 15,
        details: `重大事故${r.major_count}起,特别重大事故${r.special_count}起`,
      })),
    });

  } else if (category === 'safety') {
    // 三违扣分分析
    const violationByOrg = await pool.query(
      `SELECT o.id, o.org_name,
           COUNT(v.id) as violation_count,
           COUNT(v.id) FILTER (WHERE v.violation_level = '严重') as serious_count,
           COUNT(v.id) FILTER (WHERE v.violation_level = '一般') as general_count,
           COUNT(v.id) FILTER (WHERE v.violation_level = '轻微') as minor_count
         FROM hse_org_unit o
         LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
         LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
         LEFT JOIN violation_records v ON v.violator_id = e.id AND v.is_deleted = false
           AND v.violation_date >= $1 AND v.violation_date <= $2
         WHERE o.is_deleted = false AND o.org_type IN ('department', 'operation_center', 'center') ${orgFilter}
         GROUP BY o.id, o.org_name
         HAVING COUNT(v.id) > 0
         ORDER BY violation_count DESC`,
      orgParams
    );

    const totalViolation = violationByOrg.rows.reduce((s, r) => s + (parseInt(r.violation_count) || 0), 0);
    const totalSerious = violationByOrg.rows.reduce((s, r) => s + (parseInt(r.serious_count) || 0), 0);
    const safetyDeduction = totalViolation * 2 + totalSerious * 3;
    totalDeduction = safetyDeduction;

    details.push({
      indicator: '三违扣分',
      indicatorCode: 'HSE-KPI-SAF-001',
      deductionPoints: safetyDeduction,
      dataSources: [{ table: 'violation_records', recordCount: totalViolation, description: '本年度三违记录' }],
      responsibles: violationByOrg.rows.map(r => {
        const total = parseInt(r.violation_count) || 0;
        const serious = parseInt(r.serious_count) || 0;
        return {
          type: 'department', id: r.id, name: r.org_name,
          contribution: total * 2 + serious * 3,
          details: `三违总数${total}次(扣${total * 2}分),严重三违${serious}次(扣${serious * 3}分)`,
        };
      }),
    });

  } else if (category === 'risk') {
    // 风险扣分分析(此查询仅用$1=yearStart, orgId使用$2)
    const riskOrgFilter = orgId ? `AND o.id = $2` : '';
    const riskOrgParams = orgId ? [yearStart, orgId] : [yearStart];
    const riskByOrg = await pool.query(
      `SELECT o.id, o.org_name,
           COUNT(DISTINCT rs.employee_id) FILTER (WHERE rs.risk_level = '重大') as major_count,
           COUNT(DISTINCT rs.employee_id) FILTER (WHERE rs.risk_level = '较高') as high_count,
           COUNT(DISTINCT rs.employee_id) FILTER (WHERE rs.risk_level = '一般') as medium_count
         FROM hse_org_unit o
         LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
         LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
         LEFT JOIN hse_employee_risk_snapshot rs ON rs.employee_id = e.id AND rs.is_deleted = false AND rs.snapshot_date >= $1
         WHERE o.is_deleted = false AND o.org_type IN ('department', 'operation_center', 'center') ${riskOrgFilter}
         GROUP BY o.id, o.org_name
         HAVING COUNT(DISTINCT rs.employee_id) FILTER (WHERE rs.risk_level IN ('重大', '较高', '一般')) > 0
         ORDER BY major_count DESC, high_count DESC`,
      riskOrgParams
    );

    const totalMajor = riskByOrg.rows.reduce((s, r) => s + (parseInt(r.major_count) || 0), 0);
    const totalHigh = riskByOrg.rows.reduce((s, r) => s + (parseInt(r.high_count) || 0), 0);
    const totalMedium = riskByOrg.rows.reduce((s, r) => s + (parseInt(r.medium_count) || 0), 0);
    const riskDeduction = totalMajor * 15 + totalHigh * 8 + totalMedium * 3;
    totalDeduction = riskDeduction;

    details.push({
      indicator: '风险人员扣分',
      indicatorCode: 'HSE-KPI-RSK-001',
      deductionPoints: riskDeduction,
      dataSources: [{ table: 'hse_employee_risk_snapshot', recordCount: totalMajor + totalHigh + totalMedium, description: '风险人员快照' }],
      responsibles: riskByOrg.rows.map(r => {
        const major = parseInt(r.major_count) || 0;
        const high = parseInt(r.high_count) || 0;
        const medium = parseInt(r.medium_count) || 0;
        return {
          type: 'department', id: r.id, name: r.org_name,
          contribution: major * 15 + high * 8 + medium * 3,
          details: `重大风险${major}人,高风险${high}人,一般风险${medium}人`,
        };
      }),
    });

  } else if (category === 'rectification') {
    // 整改扣分分析
    const rectResult = await pool.query(
      `SELECT COUNT(*) as total_count,
           COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
           COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
         FROM rectification_task
         WHERE is_deleted = false AND created_at >= $1 AND created_at <= $2`,
      [yearStart, yearEnd]
    );
    const rectRow = rectResult.rows[0];
    const rectTotal = parseInt(rectRow.total_count) || 0;
    const rectCompleted = parseInt(rectRow.completed_count) || 0;
    const rectOverdue = parseInt(rectRow.overdue_count) || 0;
    const rectRate = rectTotal > 0 ? Math.round((rectCompleted / rectTotal) * 100) : 100;
    const rectDeduction = rectOverdue * 5 + Math.max(0, 100 - rectRate);
    totalDeduction = rectDeduction;

    details.push({
      indicator: '整改扣分',
      indicatorCode: 'HSE-KPI-REC-001',
      deductionPoints: rectDeduction,
      dataSources: [{ table: 'rectification_task', recordCount: rectTotal, description: '本年度隐患整改任务' }],
      responsibles: [{
        type: 'group', id: 0, name: '全集团',
        contribution: rectDeduction,
        details: `整改完成率${rectRate}%(未达标扣${Math.max(0, 100 - rectRate)}分),逾期${rectOverdue}项(扣${rectOverdue * 5}分)`,
      }],
    });

  } else if (category === 'management') {
    // 管理履职扣分分析
    const gridChiefResult = await pool.query(
      `SELECT CASE
             WHEN p.name ILIKE '%总网格长%' THEN '总网格长'
             WHEN p.name ILIKE '%一级网格长%' THEN '一级网格长'
             WHEN p.name ILIKE '%二级网格长%' THEN '二级网格长'
             WHEN p.name ILIKE '%三级网格长%' THEN '三级网格长'
             ELSE '其他'
           END as grid_level,
           COUNT(DISTINCT e.id) as chief_count,
           COUNT(DISTINCT i.id) as inspection_count
         FROM employee e
         LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
         LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
         LEFT JOIN hazard_record i ON i.employee_id = e.id AND i.is_deleted = false
           AND i.report_date >= $1 AND i.report_date <= $2
         WHERE e.is_deleted = false AND (p.name ILIKE '%网格长%')
         GROUP BY grid_level`,
      [yearStart, yearEnd]
    );
    const gridCompliance = calculateGridCompliance(gridChiefResult.rows);
    const mgmtDeduction = Math.max(0, 100 - gridCompliance);
    totalDeduction = mgmtDeduction;

    details.push({
      indicator: '网格巡查合规扣分',
      indicatorCode: 'HSE-KPI-MGT-001',
      deductionPoints: mgmtDeduction,
      dataSources: [{ table: 'hazard_record', recordCount: gridChiefResult.rows.reduce((s, r) => s + (parseInt(r.inspection_count) || 0), 0), description: '网格长巡查记录' }],
      responsibles: gridChiefResult.rows.map(r => {
        const level = r.grid_level;
        const chiefCount = parseInt(r.chief_count) || 0;
        const inspectionCount = parseInt(r.inspection_count) || 0;
        const req = GRID_CHIEF_INSPECTION_REQUIREMENT[level];
        const required = req ? Math.floor(365 / req.days) * req.requiredInspections * chiefCount : 0;
        const compliance = required > 0 ? Math.round((inspectionCount / required) * 100) : 100;
        return {
          type: 'position', id: 0, name: level,
          contribution: Math.max(0, 100 - compliance),
          details: `${level}共${chiefCount}人,实际巡查${inspectionCount}次,合规率${compliance}%`,
        };
      }).filter(r => r.contribution > 0),
    });
  }

  return ok({ category, currentYear: year, totalDeduction, details });
});

// ============================================================
// 6. GET / - 考核记录列表（供前端 /objectives/assessment 视图使用）
// ============================================================
const assessmentList = (query) => W(async () => {
  const page = parseInt(query.page) || 1;
  const pageSize = parseInt(query.pageSize) || 20;
  const keyword = typeof query.keyword === 'string' ? query.keyword.trim() : '';
  const year = query.year ? parseInt(query.year) : null;
  const offset = (page - 1) * pageSize;

  const conditions = ['is_deleted = false'];
  const params = [];
  if (keyword) {
    conditions.push('(employee_name ILIKE $1 OR dept_name ILIKE $1 OR assessment_no ILIKE $1)');
    params.push(`%${keyword}%`);
  }
  if (year) {
    conditions.push(`EXTRACT(YEAR FROM assessment_date) = $${params.length + 1}`);
    params.push(year);
  }
  const whereSql = conditions.join(' AND ');

  const countR = await pool.query(`SELECT COUNT(*)::int AS c FROM assessment_records WHERE ${whereSql}`, params);
  const listR = await pool.query(
    `SELECT id, employee_id, employee_no, dept_id, dept_name, employee_name, position,
              assessment_no, assessment_title, assessment_type, assessment_date,
              score, pass_score, is_pass, grade, status, remark, created_at, updated_at
       FROM assessment_records
       WHERE ${whereSql}
       ORDER BY assessment_date DESC NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );

  const list = listR.rows.map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeNo: r.employee_no,
    year: r.assessment_date ? new Date(r.assessment_date).getFullYear() : null,
    quarter: r.assessment_date ? Math.floor(new Date(r.assessment_date).getMonth() / 3) + 1 : null,
    department: r.dept_name,
    person: r.employee_name,
    position: r.position,
    orgUnitId: r.dept_id,
    township: null,
    score: r.score,
    level: r.grade,
    status: r.status,
    remark: r.remark,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return ok({ list, total: parseInt(countR.rows[0].c), page, pageSize });
});

module.exports = {
  overview,
  ranking,
  indicatorAnalysis,
  targetProgress,
  deductionDetail,
  assessmentList,
};