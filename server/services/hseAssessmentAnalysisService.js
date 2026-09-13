/**
 * 集团HSE考核分析中心（/api/hse-assessment-analysis）—— service 层
 * 原 routes/hse-assessment-analysis.js 的业务逻辑全部下沉至此（Sprint6.5-A 模型优化版）。
 * 全部端点只读 SELECT，无内存降级、无鉴权中间件。
 *
 * 契约：每个对外函数返回统一描述符
 *   - 成功：{ __t:'json', body }，body 即最终 res.json 的对象（概览为 {code:0, data}）。
 *   - 异常：抛 Errror，由 controller run() 归一为 res.status(500).json({code:1, message:err.message})
 *     （等价原文件所有端点的 res.status(500).json({code:1, message:e.message})，传真实 error message）。
 */

const { pool } = require('../config/db');

const ACCIDENT_LEVEL_WEIGHT = {
  '轻微': 1, '一般': 3, '较大': 6, '重大': 10, '特别重大': 15,
};

const GRID_CHIEF_INSPECTION_REQUIREMENT = {
  '总网格长': { days: 3, requiredInspections: 1 },
  '一级网格长': { days: 2, requiredInspections: 1 },
  '二级网格长': { days: 1, requiredInspections: 1 },
  '三级网格长': { days: 1, requiredInspections: 1 },
};

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

function calculateDeptGridCompliance(grid) {
  const daysInYear = 365;
  let totalRequired = 0;
  let totalActual = grid.inspectionCount || 0;
  if (grid.totalGridChiefCount > 0) totalRequired += Math.floor(daysInYear / 3) * grid.totalGridChiefCount;
  if (grid.level1GridChiefCount > 0) totalRequired += Math.floor(daysInYear / 2) * grid.level1GridChiefCount;
  if (grid.level2GridChiefCount > 0) totalRequired += daysInYear * grid.level2GridChiefCount;
  if (grid.level3GridChiefCount > 0) totalRequired += daysInYear * grid.level3GridChiefCount;
  return totalRequired > 0 ? Math.round((totalActual / totalRequired) * 100) : 100;
}

// ========== GET /overview — 集团考核总览 ==========
async function overview() {
  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;

  const accidentResult = await pool.query(
    `SELECT COUNT(*) as total_count,
       COUNT(*) FILTER (WHERE level IN ('重大', '特别重大')) as major_count,
       COUNT(*) FILTER (WHERE level = '较大') as serious_count,
       COUNT(*) FILTER (WHERE level = '一般') as general_count,
       COUNT(*) FILTER (WHERE level = '轻微') as minor_count,
       COUNT(*) FILTER (WHERE status = '已结案') as closed_count,
       COALESCE(SUM(casualties), 0) as total_casualties,
       COALESCE(SUM(injuries), 0) as total_injuries,
       COALESCE(SUM(loss_amount), 0) as total_loss,
       COALESCE(SUM(CASE level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
     FROM accidents
     WHERE is_deleted = false AND accident_date >= $1 AND accident_date <= $2`,
    [yearStart, yearEnd]
  );

  const violationResult = await pool.query(
    `SELECT COUNT(*) as total_count,
       COUNT(*) FILTER (WHERE violation_level = '严重') as serious_count,
       COUNT(*) FILTER (WHERE violation_level = '一般') as general_count,
       COUNT(*) FILTER (WHERE violation_level = '轻微') as minor_count,
       COUNT(*) FILTER (WHERE status = '已关闭') as closed_count,
       COUNT(*) FILTER (WHERE status = '待处理') as pending_count
     FROM violation_records
     WHERE is_deleted = false AND violation_date >= $1 AND violation_date <= $2`,
    [yearStart, yearEnd]
  );

  const trainingResult = await pool.query(
    `SELECT COUNT(*) as total_count,
       COUNT(*) FILTER (WHERE result = '合格') as qualified_count,
       COUNT(*) FILTER (WHERE result = '不合格') as unqualified_count,
       COALESCE(AVG(score), 0) as avg_score
     FROM training_records
     WHERE is_deleted = false AND training_date >= $1 AND training_date <= $2`,
    [yearStart, yearEnd]
  );

  const hazardResult = await pool.query(
    `SELECT COUNT(*) as total_count,
       COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
       COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count,
       COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
       COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count
     FROM rectification_task
     WHERE is_deleted = false AND created_at >= $1 AND created_at <= $2`,
    [yearStart, yearEnd]
  );

  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const fiveYearsAgoStr = fiveYearsAgo.toISOString().split('T')[0];

  const demeritResult = await pool.query(
    `SELECT COUNT(*) as total_records,
       COALESCE(SUM(demerit_points), 0) as total_points,
       COUNT(DISTINCT employee_id) as driver_count,
       COUNT(*) FILTER (WHERE demerit_date >= $1 AND demerit_date < $2) as current_year_records,
       COALESCE(SUM(CASE WHEN demerit_date >= $1 AND demerit_date < $2 THEN demerit_points ELSE 0 END), 0) as current_year_points
     FROM license_demerit_records
     WHERE is_deleted = false AND demerit_date >= $3`,
    [yearStart, yearEnd, fiveYearsAgoStr]
  );

  const riskScoreResult = await pool.query(
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

  const trendResult = await pool.query(
    `SELECT EXTRACT(YEAR FROM accident_date)::int as year,
       COUNT(*) as accident_count,
       COALESCE(SUM(loss_amount), 0) as total_loss,
       COALESCE(SUM(CASE level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
     FROM accidents
     WHERE is_deleted = false AND accident_date >= CURRENT_DATE - INTERVAL '5 years'
     GROUP BY EXTRACT(YEAR FROM accident_date) ORDER BY year`
  );

  const targets = {
    accidentCount: 0, majorAccidentCount: 0, accidentWeightedIndex: 0,
    violationCount: 50, trainingCompletionRate: 95, rectificationRate: 98,
    avgRiskScore: 80, demeritRate: 10, gridInspectionCompliance: 90,
  };

  const accidentRow = accidentResult.rows[0];
  const violationRow = violationResult.rows[0];
  const trainingRow = trainingResult.rows[0];
  const hazardRow = hazardResult.rows[0];
  const demeritRow = demeritResult.rows[0];
  const riskScoreRow = riskScoreResult.rows[0];

  const accidentTotal = parseInt(accidentRow.total_count) || 0;
  const violationTotal = parseInt(violationRow.total_count) || 0;
  const trainingTotal = parseInt(trainingRow.total_count) || 0;
  const hazardTotal = parseInt(hazardRow.total_count) || 0;
  const trainingQualified = parseInt(trainingRow.qualified_count) || 0;
  const hazardCompleted = parseInt(hazardRow.completed_count) || 0;
  const driverCount = parseInt(demeritRow.driver_count) || 0;
  const fiveYearDemeritPoints = parseInt(demeritRow.total_points) || 0;

  const demeritRate = driverCount > 0 ? Math.round((fiveYearDemeritPoints / (driverCount * 60)) * 100) : 0;
  const gridInspectionCompliance = calculateGridCompliance(gridChiefResult.rows);

  const body = {
    code: 0,
    data: {
      currentYear,
      targets: { ...targets },
      actual: {
        accidentCount: accidentTotal,
        majorAccidentCount: parseInt(accidentRow.major_count) || 0,
        seriousAccidentCount: parseInt(accidentRow.serious_count) || 0,
        generalAccidentCount: parseInt(accidentRow.general_count) || 0,
        minorAccidentCount: parseInt(accidentRow.minor_count) || 0,
        accidentClosedCount: parseInt(accidentRow.closed_count) || 0,
        accidentCasualties: parseInt(accidentRow.total_casualties) || 0,
        accidentInjuries: parseInt(accidentRow.total_injuries) || 0,
        accidentLoss: parseFloat(accidentRow.total_loss) || 0,
        accidentWeightedIndex: parseInt(accidentRow.weighted_index) || 0,
        violationCount: violationTotal,
        violationSeriousCount: parseInt(violationRow.serious_count) || 0,
        violationGeneralCount: parseInt(violationRow.general_count) || 0,
        violationMinorCount: parseInt(violationRow.minor_count) || 0,
        violationClosedCount: parseInt(violationRow.closed_count) || 0,
        violationPendingCount: parseInt(violationRow.pending_count) || 0,
        trainingCount: trainingTotal,
        trainingQualifiedCount: trainingQualified,
        trainingUnqualifiedCount: parseInt(trainingRow.unqualified_count) || 0,
        trainingAvgScore: parseFloat(trainingRow.avg_score) || 0,
        hazardCount: hazardTotal,
        hazardCompletedCount: hazardCompleted,
        hazardOverdueCount: parseInt(hazardRow.overdue_count) || 0,
        hazardPendingCount: parseInt(hazardRow.pending_count) || 0,
        hazardInProgressCount: parseInt(hazardRow.in_progress_count) || 0,
        demeritRecords: parseInt(demeritRow.total_records) || 0,
        demeritPoints: parseInt(demeritRow.total_points) || 0,
        demeritDriverCount: driverCount,
        currentYearDemeritRecords: parseInt(demeritRow.current_year_records) || 0,
        currentYearDemeritPoints: fiveYearDemeritPoints,
        demeritRate,
        riskTotalEmployees: parseInt(riskScoreRow.total_employees) || 0,
        riskMajorCount: parseInt(riskScoreRow.major_count) || 0,
        riskHighCount: parseInt(riskScoreRow.high_count) || 0,
        riskMediumCount: parseInt(riskScoreRow.medium_count) || 0,
        riskLowCount: parseInt(riskScoreRow.low_count) || 0,
        riskAvgScore: parseFloat(riskScoreRow.avg_score) || 0,
        gridInspectionCompliance,
        gridChiefStats: gridChiefResult.rows.map(r => ({
          gridLevel: r.grid_level,
          chiefCount: parseInt(r.chief_count) || 0,
          inspectionCount: parseInt(r.inspection_count) || 0,
        })),
      },
      completionRates: {
        accidentTargetRate: accidentTotal === 0 ? 100 : Math.max(0, 100 - accidentTotal * 20),
        accidentIndexRate: parseInt(accidentRow.weighted_index) === 0 ? 100 : Math.max(0, 100 - parseInt(accidentRow.weighted_index)),
        violationTargetRate: violationTotal <= targets.violationCount ? 100 : Math.max(0, 100 - ((violationTotal - targets.violationCount) / targets.violationCount) * 50),
        trainingCompletionRate: trainingTotal > 0 ? Math.round((trainingQualified / trainingTotal) * 100) : 0,
        rectificationRate: hazardTotal > 0 ? Math.round((hazardCompleted / hazardTotal) * 100) : 0,
        demeritRate: Math.max(0, 100 - demeritRate),
        gridInspectionCompliance: gridInspectionCompliance,
      },
      trend: trendResult.rows.map(r => ({
        year: r.year,
        accidentCount: parseInt(r.count) || 0,
        totalLoss: parseFloat(r.total_loss) || 0,
        weightedIndex: parseInt(r.weighted_index) || 0,
      })),
    }
  };
  return { __t: 'json', body };
}

// ========== GET /department-ranking — 部门排名 ==========
async function departmentRanking() {
  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;

  const deptResult = await pool.query(
    `SELECT id, org_name, parent_id, org_type FROM hse_org_unit
     WHERE is_deleted = false AND org_type IN ('department', 'center') ORDER BY org_name`
  );

  const departments = deptResult.rows.map(d => ({
    id: d.id, name: d.org_name, parentId: d.parent_id, unitType: d.org_type,
  }));

  const deptAccidentResult = await pool.query(
    `SELECT o.id as dept_id, o.org_name as dept_name,
       COUNT(a.id) as accident_count,
       COUNT(a.id) FILTER (WHERE a.level IN ('重大', '特别重大')) as major_count,
       COUNT(a.id) FILTER (WHERE a.level = '较大') as serious_count,
       COUNT(a.id) FILTER (WHERE a.level = '一般') as general_count,
       COUNT(a.id) FILTER (WHERE a.level = '轻微') as minor_count,
       COUNT(a.id) FILTER (WHERE a.status = '已结案') as closed_count,
       COALESCE(SUM(CASE a.level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
     FROM hse_org_unit o
     LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
     LEFT JOIN accidents a ON a.personnel_id::bigint = e.id AND a.is_deleted = false
       AND a.accident_date >= $1 AND a.accident_date <= $2
     WHERE o.is_deleted = false AND o.org_type IN ('department', 'center')
     GROUP BY o.id, o.org_name`,
    [yearStart, yearEnd]
  );

  const deptViolationResult = await pool.query(
    `SELECT o.id as dept_id, o.org_name as dept_name,
       COUNT(vr.id) as violation_count,
       COUNT(vr.id) FILTER (WHERE vr.violation_level = '严重') as serious_count,
       COUNT(vr.id) FILTER (WHERE vr.violation_level = '一般') as general_count,
       COUNT(vr.id) FILTER (WHERE vr.status = '已关闭') as closed_count
     FROM hse_org_unit o
     LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
     LEFT JOIN violation_records vr ON vr.violator_id = e.id AND vr.is_deleted = false
       AND vr.violation_date >= $1 AND vr.violation_date <= $2
     WHERE o.is_deleted = false AND o.org_type IN ('department', 'center')
     GROUP BY o.id, o.org_name`,
    [yearStart, yearEnd]
  );

  const deptRiskResult = await pool.query(
    `SELECT o.id as dept_id, o.org_name as dept_name,
       COUNT(DISTINCT e.id) as employee_count,
       COUNT(DISTINCT e.id) FILTER (WHERE hrs.risk_level = '重大') as major_risk_count,
       COUNT(DISTINCT e.id) FILTER (WHERE hrs.risk_level = '较高') as high_risk_count,
       COUNT(DISTINCT e.id) FILTER (WHERE hrs.risk_level = '一般') as medium_risk_count,
       COALESCE(AVG(hrs.total_score), 0) as avg_risk_score
     FROM hse_org_unit o
     LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
     LEFT JOIN hse_employee_risk_snapshot hrs ON hrs.employee_id = e.id AND hrs.is_deleted = false
       AND hrs.snapshot_date >= $1
     WHERE o.is_deleted = false AND o.org_type IN ('department', 'center')
     GROUP BY o.id, o.org_name`,
    [yearStart]
  );

  const deptRectificationResult = await pool.query(
    `SELECT o.id as dept_id, o.org_name as dept_name,
       COUNT(rt.id) as task_count,
       COUNT(rt.id) FILTER (WHERE rt.status = 'completed') as completed_count,
       COUNT(rt.id) FILTER (WHERE rt.status = 'overdue') as overdue_count,
       COUNT(rt.id) FILTER (WHERE rt.status = 'in_progress') as in_progress_count
     FROM hse_org_unit o
     LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
    LEFT JOIN rectification_task rt ON rt.responsible_id = e.id AND rt.is_deleted = false
      AND rt.created_at >= $1 AND rt.created_at <= $2
     WHERE o.is_deleted = false AND o.org_type IN ('department', 'center')
     GROUP BY o.id, o.org_name`,
    [yearStart, yearEnd]
  );

  const deptGridResult = await pool.query(
    `SELECT o.id as dept_id, o.org_name as dept_name,
       COUNT(DISTINCT e.id) FILTER (WHERE p.name ILIKE '%总网格长%') as total_grid_chief_count,
       COUNT(DISTINCT e.id) FILTER (WHERE p.name ILIKE '%一级网格长%') as level1_grid_chief_count,
       COUNT(DISTINCT e.id) FILTER (WHERE p.name ILIKE '%二级网格长%') as level2_grid_chief_count,
       COUNT(DISTINCT e.id) FILTER (WHERE p.name ILIKE '%三级网格长%') as level3_grid_chief_count,
       COUNT(DISTINCT hr.id) as inspection_count
     FROM hse_org_unit o
     LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
     LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
     LEFT JOIN hazard_record hr ON hr.employee_id = e.id AND hr.is_deleted = false
       AND hr.report_date >= $1 AND hr.report_date <= $2
     WHERE o.is_deleted = false AND o.org_type IN ('department', 'center')
     GROUP BY o.id, o.org_name`,
    [yearStart, yearEnd]
  );

  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const fiveYearsAgoStr = fiveYearsAgo.toISOString().split('T')[0];

  const deptDemeritResult = await pool.query(
    `SELECT o.id as dept_id, o.org_name as dept_name,
       COUNT(DISTINCT e.id) as driver_count,
       COUNT(ldr.id) as demerit_count_5y,
       COALESCE(SUM(ldr.demerit_points), 0) as demerit_points_5y,
       COUNT(ldr.id) FILTER (WHERE ldr.demerit_date >= $1 AND ldr.demerit_date <= $2) as demerit_count_current,
       COALESCE(SUM(CASE WHEN ldr.demerit_date >= $1 AND ldr.demerit_date <= $2 THEN ldr.demerit_points ELSE 0 END), 0) as demerit_points_current
     FROM hse_org_unit o
     LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
     LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
     LEFT JOIN license_demerit_records ldr ON ldr.employee_id = e.id AND ldr.is_deleted = false
       AND ldr.demerit_date >= $3
     WHERE o.is_deleted = false AND o.org_type IN ('department', 'center')
       AND (p.name ILIKE '%驾驶员%' OR p.name ILIKE '%司机%')
     GROUP BY o.id, o.org_name`,
    [yearStart, yearEnd, fiveYearsAgoStr]
  );

  const accidentMap = new Map();
  deptAccidentResult.rows.forEach(r => accidentMap.set(r.dept_id, {
    accidentCount: parseInt(r.accident_count) || 0,
    majorCount: parseInt(r.major_count) || 0,
    seriousCount: parseInt(r.serious_count) || 0,
    generalCount: parseInt(r.general_count) || 0,
    minorCount: parseInt(r.minor_count) || 0,
    closedCount: parseInt(r.closed_count) || 0,
    weightedIndex: parseInt(r.weighted_index) || 0,
  }));

  const violationMap = new Map();
  deptViolationResult.rows.forEach(r => violationMap.set(r.dept_id, {
    violationCount: parseInt(r.violation_count) || 0,
    seriousCount: parseInt(r.serious_count) || 0,
    generalCount: parseInt(r.general_count) || 0,
    closedCount: parseInt(r.closed_count) || 0,
  }));

  const riskMap = new Map();
  deptRiskResult.rows.forEach(r => riskMap.set(r.dept_id, {
    employeeCount: parseInt(r.employee_count) || 0,
    majorRiskCount: parseInt(r.major_risk_count) || 0,
    highRiskCount: parseInt(r.high_risk_count) || 0,
    mediumRiskCount: parseInt(r.medium_risk_count) || 0,
    avgRiskScore: parseFloat(r.avg_risk_score) || 0,
  }));

  const rectificationMap = new Map();
  deptRectificationResult.rows.forEach(r => rectificationMap.set(r.dept_id, {
    taskCount: parseInt(r.task_count) || 0,
    completedCount: parseInt(r.completed_count) || 0,
    overdueCount: parseInt(r.overdue_count) || 0,
    inProgressCount: parseInt(r.in_progress_count) || 0,
  }));

  const gridMap = new Map();
  deptGridResult.rows.forEach(r => gridMap.set(r.dept_id, {
    totalGridChiefCount: parseInt(r.total_grid_chief_count) || 0,
    level1GridChiefCount: parseInt(r.level1_grid_chief_count) || 0,
    level2GridChiefCount: parseInt(r.level2_grid_chief_count) || 0,
    level3GridChiefCount: parseInt(r.level3_grid_chief_count) || 0,
    inspectionCount: parseInt(r.inspection_count) || 0,
  }));

  const demeritMap = new Map();
  deptDemeritResult.rows.forEach(r => demeritMap.set(r.dept_id, {
    driverCount: parseInt(r.driver_count) || 0,
    demeritCount5y: parseInt(r.demerit_count_5y) || 0,
    demeritPoints5y: parseInt(r.demerit_points_5y) || 0,
    demeritCountCurrent: parseInt(r.demerit_count_current) || 0,
    demeritPointsCurrent: parseInt(r.demerit_points_current) || 0,
  }));

  const departmentRankings = departments.map(dept => {
    const acc = accidentMap.get(dept.id) || { accidentCount: 0, majorCount: 0, seriousCount: 0, generalCount: 0, minorCount: 0, closedCount: 0, weightedIndex: 0 };
    const vio = violationMap.get(dept.id) || { violationCount: 0, seriousCount: 0, generalCount: 0, closedCount: 0 };
    const risk = riskMap.get(dept.id) || { employeeCount: 0, majorRiskCount: 0, highRiskCount: 0, mediumRiskCount: 0, avgRiskScore: 0 };
    const rect = rectificationMap.get(dept.id) || { taskCount: 0, completedCount: 0, overdueCount: 0, inProgressCount: 0 };
    const grid = gridMap.get(dept.id) || { totalGridChiefCount: 0, level1GridChiefCount: 0, level2GridChiefCount: 0, level3GridChiefCount: 0, inspectionCount: 0 };
    const dem = demeritMap.get(dept.id) || { driverCount: 0, demeritCount5y: 0, demeritPoints5y: 0, demeritCountCurrent: 0, demeritPointsCurrent: 0 };

    const safetyScore = Math.max(0, 100 - vio.violationCount * 2 - vio.seriousCount * 3);
    const riskScore = Math.max(0, 100 - risk.majorRiskCount * 15 - risk.highRiskCount * 8 - risk.mediumRiskCount * 3);
    const accidentScore = Math.max(0, 100 - acc.weightedIndex * 3 - acc.majorCount * 15);
    const rectificationScore = rect.taskCount > 0 ? Math.max(0, Math.round((rect.completedCount / rect.taskCount) * 100) - rect.overdueCount * 5) : 100;

    const gridCompliance = calculateDeptGridCompliance(grid);
    const driverRiskScore = dem.driverCount > 0 ? Math.max(0, 100 - (dem.demeritPoints5y / (dem.driverCount * 60)) * 100 * 2) : 100;
    const managementScore = Math.round((gridCompliance * 0.6 + driverRiskScore * 0.4));

    const overallScore = Math.round(
      safetyScore * 0.20 + riskScore * 0.15 + accidentScore * 0.25 + rectificationScore * 0.15 + managementScore * 0.25
    );

    return {
      deptId: dept.id, deptName: dept.name, unitType: dept.unitType,
      safetyRank: 0, safetyScore, riskRank: 0, riskScore,
      accidentRank: 0, accidentScore, rectificationRank: 0, rectificationScore,
      managementRank: 0, managementScore, overallScore,
      accidentCount: acc.accidentCount, majorAccidentCount: acc.majorCount,
      seriousAccidentCount: acc.seriousCount, generalAccidentCount: acc.generalCount,
      minorAccidentCount: acc.minorCount, accidentClosedCount: acc.closedCount,
      accidentWeightedIndex: acc.weightedIndex,
      violationCount: vio.violationCount, seriousViolationCount: vio.seriousCount,
      generalViolationCount: vio.generalCount, violationClosedCount: vio.closedCount,
      employeeCount: risk.employeeCount, majorRiskCount: risk.majorRiskCount,
      highRiskCount: risk.highRiskCount, mediumRiskCount: risk.mediumRiskCount,
      avgRiskScore: risk.avgRiskScore,
      taskCount: rect.taskCount, completedTaskCount: rect.completedCount,
      overdueTaskCount: rect.overdueCount, inProgressTaskCount: rect.inProgressCount,
      gridCompliance,
      totalGridChiefCount: grid.totalGridChiefCount, level1GridChiefCount: grid.level1GridChiefCount,
      level2GridChiefCount: grid.level2GridChiefCount, level3GridChiefCount: grid.level3GridChiefCount,
      inspectionCount: grid.inspectionCount,
      driverCount: dem.driverCount, demeritCount5y: dem.demeritCount5y,
      demeritPoints5y: dem.demeritPoints5y, demeritCountCurrent: dem.demeritCountCurrent,
      demeritPointsCurrent: dem.demeritPointsCurrent,
    };
  }).sort((a, b) => b.overallScore - a.overallScore);

  const sortedBySafety = [...departmentRankings].sort((a, b) => b.safetyScore - a.safetyScore);
  const sortedByRisk = [...departmentRankings].sort((a, b) => b.riskScore - a.riskScore);
  const sortedByAccident = [...departmentRankings].sort((a, b) => b.accidentScore - a.accidentScore);
  const sortedByRectification = [...departmentRankings].sort((a, b) => b.rectificationScore - a.rectificationScore);
  const sortedByManagement = [...departmentRankings].sort((a, b) => b.managementScore - a.managementScore);

  departmentRankings.forEach(item => {
    item.safetyRank = sortedBySafety.findIndex(r => r.deptId === item.deptId) + 1;
    item.riskRank = sortedByRisk.findIndex(r => r.deptId === item.deptId) + 1;
    item.accidentRank = sortedByAccident.findIndex(r => r.deptId === item.deptId) + 1;
    item.rectificationRank = sortedByRectification.findIndex(r => r.deptId === item.deptId) + 1;
    item.managementRank = sortedByManagement.findIndex(r => r.deptId === item.deptId) + 1;
  });

  const body = {
    code: 0,
    data: {
      currentYear,
      rankings: departmentRankings,
      scoringWeights: { safety: 20, risk: 15, accident: 25, rectification: 15, management: 25 },
    }
  };
  return { __t: 'json', body };
}

// ========== GET /township-ranking — 乡镇排名 ==========
async function townshipRanking() {
  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;

  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const fiveYearsAgoStr = fiveYearsAgo.toISOString().split('T')[0];

  const townshipResult = await pool.query(
    `SELECT id, org_name, parent_id, org_type FROM hse_org_unit
     WHERE is_deleted = false AND org_type IN ('town_center') ORDER BY org_name`
  );

  const townships = townshipResult.rows.map(t => ({
    id: t.id, name: t.org_name, parentId: t.parent_id, unitType: t.org_type,
  }));

  const townshipAccidentResult = await pool.query(
    `SELECT o.id as township_id, o.org_name as township_name,
       COUNT(a.id) as accident_count,
       COUNT(a.id) FILTER (WHERE a.level IN ('重大', '特别重大')) as major_count,
       COUNT(a.id) FILTER (WHERE a.level = '较大') as serious_count,
       COUNT(a.id) FILTER (WHERE a.level = '一般') as general_count,
       COUNT(a.id) FILTER (WHERE a.level = '轻微') as minor_count,
       COALESCE(SUM(CASE a.level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
     FROM hse_org_unit o
     LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
     LEFT JOIN accidents a ON a.personnel_id::bigint = e.id AND a.is_deleted = false
       AND a.accident_date >= $1 AND a.accident_date <= $2
     WHERE o.is_deleted = false AND o.org_type IN ('town_center')
     GROUP BY o.id, o.org_name`,
    [yearStart, yearEnd]
  );

  const townshipViolationResult = await pool.query(
    `SELECT o.id as township_id, o.org_name as township_name,
       COUNT(vr.id) as violation_count,
       COUNT(vr.id) FILTER (WHERE vr.violation_level = '严重') as serious_count,
       COUNT(vr.id) FILTER (WHERE vr.violation_level = '一般') as general_count,
       COUNT(vr.id) FILTER (WHERE vr.violation_level = '轻微') as minor_count
     FROM hse_org_unit o
     LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
     LEFT JOIN violation_records vr ON vr.violator_id = e.id AND vr.is_deleted = false
       AND vr.violation_date >= $1 AND vr.violation_date <= $2
     WHERE o.is_deleted = false AND o.org_type IN ('town_center')
     GROUP BY o.id, o.org_name`,
    [yearStart, yearEnd]
  );

  const townshipDemeritResult = await pool.query(
    `SELECT o.id as township_id, o.org_name as township_name,
       COUNT(DISTINCT e.id) as driver_count,
       COUNT(ldr.id) as demerit_count_5y,
       COALESCE(SUM(ldr.demerit_points), 0) as demerit_points_5y,
       COUNT(ldr.id) FILTER (WHERE ldr.demerit_date >= $1 AND ldr.demerit_date <= $2) as demerit_count_current,
       COALESCE(SUM(CASE WHEN ldr.demerit_date >= $1 AND ldr.demerit_date <= $2 THEN ldr.demerit_points ELSE 0 END), 0) as demerit_points_current
     FROM hse_org_unit o
     LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
     LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
     LEFT JOIN license_demerit_records ldr ON ldr.employee_id = e.id AND ldr.is_deleted = false
       AND ldr.demerit_date >= $3
     WHERE o.is_deleted = false AND o.org_type IN ('town_center')
       AND (p.name ILIKE '%驾驶员%' OR p.name ILIKE '%司机%')
     GROUP BY o.id, o.org_name`,
    [yearStart, yearEnd, fiveYearsAgoStr]
  );

  const townshipRiskResult = await pool.query(
    `SELECT o.id as township_id, o.org_name as township_name,
       COUNT(DISTINCT e.id) as employee_count,
       COUNT(DISTINCT e.id) FILTER (WHERE hrs.risk_level = '重大') as major_count,
       COUNT(DISTINCT e.id) FILTER (WHERE hrs.risk_level = '较高') as high_count,
       COUNT(DISTINCT e.id) FILTER (WHERE hrs.risk_level = '一般') as medium_count,
       COUNT(DISTINCT e.id) FILTER (WHERE hrs.risk_level = '低') as low_count,
       COALESCE(AVG(hrs.total_score), 0) as avg_score
     FROM hse_org_unit o
     LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
     LEFT JOIN hse_employee_risk_snapshot hrs ON hrs.employee_id = e.id AND hrs.is_deleted = false
       AND hrs.snapshot_date >= $1
     WHERE o.is_deleted = false AND o.org_type IN ('town_center')
     GROUP BY o.id, o.org_name`,
    [yearStart]
  );

  const townshipHazardResult = await pool.query(
    `SELECT o.id as township_id, o.org_name as township_name,
       COUNT(hr.id) as hazard_count,
       COUNT(hr.id) FILTER (WHERE hr.hazard_level = 'high') as high_risk_count,
       COUNT(hr.id) FILTER (WHERE hr.status = 'resolved') as resolved_count,
       COUNT(hr.id) FILTER (WHERE hr.status = 'pending') as pending_count
    FROM hse_org_unit o
    LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
    LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
    LEFT JOIN hazard_record hr ON hr.employee_id = e.id AND hr.is_deleted = false
      AND hr.report_date >= $1 AND hr.report_date <= $2
    WHERE o.is_deleted = false AND o.org_type IN ('town_center')
    GROUP BY o.id, o.org_name`,
    [yearStart, yearEnd]
  );

  const townshipGridResult = await pool.query(
    `SELECT o.id as township_id, o.org_name as township_name,
       COUNT(DISTINCT e.id) FILTER (WHERE p.name ILIKE '%总网格长%') as total_grid_chief_count,
       COUNT(DISTINCT e.id) FILTER (WHERE p.name ILIKE '%一级网格长%') as level1_grid_chief_count,
       COUNT(DISTINCT e.id) FILTER (WHERE p.name ILIKE '%二级网格长%') as level2_grid_chief_count,
       COUNT(DISTINCT e.id) FILTER (WHERE p.name ILIKE '%三级网格长%') as level3_grid_chief_count,
       COUNT(DISTINCT hr.id) as inspection_count
     FROM hse_org_unit o
     LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
     LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
     LEFT JOIN hazard_record hr ON hr.employee_id = e.id AND hr.is_deleted = false
       AND hr.report_date >= $1 AND hr.report_date <= $2
     WHERE o.is_deleted = false AND o.org_type IN ('town_center')
     GROUP BY o.id, o.org_name`,
    [yearStart, yearEnd]
  );

  const accidentMap = new Map();
  townshipAccidentResult.rows.forEach(r => accidentMap.set(r.township_id, {
    accidentCount: parseInt(r.accident_count) || 0, majorCount: parseInt(r.major_count) || 0,
    seriousCount: parseInt(r.serious_count) || 0, generalCount: parseInt(r.general_count) || 0,
    minorCount: parseInt(r.minor_count) || 0, weightedIndex: parseInt(r.weighted_index) || 0,
  }));

  const violationMap = new Map();
  townshipViolationResult.rows.forEach(r => violationMap.set(r.township_id, {
    violationCount: parseInt(r.violation_count) || 0, seriousCount: parseInt(r.serious_count) || 0,
    generalCount: parseInt(r.general_count) || 0, minorCount: parseInt(r.minor_count) || 0,
  }));

  const demeritMap = new Map();
  townshipDemeritResult.rows.forEach(r => demeritMap.set(r.township_id, {
    driverCount: parseInt(r.driver_count) || 0, demeritCount5y: parseInt(r.demerit_count_5y) || 0,
    demeritPoints5y: parseInt(r.demerit_points_5y) || 0, demeritCountCurrent: parseInt(r.demerit_count_current) || 0,
    demeritPointsCurrent: parseInt(r.demerit_points_current) || 0,
  }));

  const riskMap = new Map();
  townshipRiskResult.rows.forEach(r => riskMap.set(r.township_id, {
    employeeCount: parseInt(r.employee_count) || 0, majorCount: parseInt(r.major_count) || 0,
    highCount: parseInt(r.high_count) || 0, mediumCount: parseInt(r.medium_count) || 0,
    lowCount: parseInt(r.low_count) || 0, avgScore: parseFloat(r.avg_score) || 0,
  }));

  const hazardMap = new Map();
  townshipHazardResult.rows.forEach(r => hazardMap.set(r.township_id, {
    hazardCount: parseInt(r.hazard_count) || 0, highRiskCount: parseInt(r.high_risk_count) || 0,
    resolvedCount: parseInt(r.resolved_count) || 0, pendingCount: parseInt(r.pending_count) || 0,
  }));

  const gridMap = new Map();
  townshipGridResult.rows.forEach(r => gridMap.set(r.township_id, {
    totalGridChiefCount: parseInt(r.total_grid_chief_count) || 0, level1GridChiefCount: parseInt(r.level1_grid_chief_count) || 0,
    level2GridChiefCount: parseInt(r.level2_grid_chief_count) || 0, level3GridChiefCount: parseInt(r.level3_grid_chief_count) || 0,
    inspectionCount: parseInt(r.inspection_count) || 0,
  }));

  const townshipRankings = townships.map(township => {
    const acc = accidentMap.get(township.id) || { accidentCount: 0, majorCount: 0, seriousCount: 0, generalCount: 0, minorCount: 0, weightedIndex: 0 };
    const vio = violationMap.get(township.id) || { violationCount: 0, seriousCount: 0, generalCount: 0, minorCount: 0 };
    const dem = demeritMap.get(township.id) || { driverCount: 0, demeritCount5y: 0, demeritPoints5y: 0, demeritCountCurrent: 0, demeritPointsCurrent: 0 };
    const risk = riskMap.get(township.id) || { employeeCount: 0, majorCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, avgScore: 0 };
    const haz = hazardMap.get(township.id) || { hazardCount: 0, highRiskCount: 0, resolvedCount: 0, pendingCount: 0 };
    const grid = gridMap.get(township.id) || { totalGridChiefCount: 0, level1GridChiefCount: 0, level2GridChiefCount: 0, level3GridChiefCount: 0, inspectionCount: 0 };

    const riskLevelScore = Math.max(0, 100 - risk.majorCount * 20 - risk.highCount * 10 - risk.mediumCount * 5);
    const violationScore = Math.max(0, 100 - vio.violationCount * 2 - vio.seriousCount * 4);
    const driverRiskScore = dem.driverCount > 0 ? Math.max(0, 100 - (dem.demeritPoints5y / (dem.driverCount * 60)) * 100 * 2) : 100;
    const accidentScore = Math.max(0, 100 - acc.weightedIndex * 3 - acc.majorCount * 15);
    const patrolScore = haz.hazardCount > 0 ? Math.max(0, Math.round((haz.resolvedCount / haz.hazardCount) * 100) - haz.pendingCount * 3) : 100;
    const gridCompliance = calculateDeptGridCompliance(grid);
    const managementScore = gridCompliance;

    const overallScore = Math.round(
      riskLevelScore * 0.15 + violationScore * 0.15 + driverRiskScore * 0.15 + accidentScore * 0.20 + patrolScore * 0.15 + managementScore * 0.20
    );

    return {
      townshipId: township.id, townshipName: township.name, unitType: township.unitType,
      overallRank: 0, overallScore,
      riskLevelScore, violationScore, driverRiskScore, accidentScore, patrolScore, managementScore, gridCompliance,
      accidentCount: acc.accidentCount, majorAccidentCount: acc.majorCount,
      seriousAccidentCount: acc.seriousCount, generalAccidentCount: acc.generalCount,
      minorAccidentCount: acc.minorCount, accidentWeightedIndex: acc.weightedIndex,
      violationCount: vio.violationCount, seriousViolationCount: vio.seriousCount,
      generalViolationCount: vio.generalCount, minorViolationCount: vio.minorCount,
      driverCount: dem.driverCount, demeritCount5y: dem.demeritCount5y,
      demeritPoints5y: dem.demeritPoints5y, demeritCountCurrent: dem.demeritCountCurrent,
      demeritPointsCurrent: dem.demeritPointsCurrent,
      employeeCount: risk.employeeCount, majorRiskCount: risk.majorCount,
      highRiskCount: risk.highCount, mediumRiskCount: risk.mediumCount,
      lowRiskCount: risk.lowCount, avgRiskScore: risk.avgScore,
      hazardCount: haz.hazardCount, highRiskHazardCount: haz.highRiskCount,
      resolvedHazardCount: haz.resolvedCount, pendingHazardCount: haz.pendingCount,
      totalGridChiefCount: grid.totalGridChiefCount, level1GridChiefCount: grid.level1GridChiefCount,
      level2GridChiefCount: grid.level2GridChiefCount, level3GridChiefCount: grid.level3GridChiefCount,
      inspectionCount: grid.inspectionCount,
    };
  }).sort((a, b) => b.overallScore - a.overallScore);

  townshipRankings.forEach((item, index) => { item.overallRank = index + 1; });

  const body = {
    code: 0,
    data: {
      currentYear,
      rankings: townshipRankings,
      scoringWeights: { riskLevel: 15, violation: 15, driverRisk: 15, accident: 20, patrol: 15, management: 20 },
    }
  };
  return { __t: 'json', body };
}

// ========== GET /goals — 目标达成分析 ==========
async function goals() {
  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;

  const contractVersionsResult = await pool.query(
    `SELECT id, name, version, effective_date, expiry_date, status, created_at, updated_at
     FROM objective_contract_version
     WHERE is_deleted = false AND EXTRACT(YEAR FROM effective_date) = $1
     ORDER BY version DESC`,
    [currentYear]
  ).catch(() => ({ rows: [] }));

  const currentVersion = contractVersionsResult.rows[0];
  const versionId = currentVersion ? currentVersion.id : null;

  const contractGoalsResult = await pool.query(
    `SELECT id, contract_version_id, indicator_name, category, target_value, target_unit, description
     FROM objective_contract_indicator
     WHERE is_deleted = false AND contract_version_id = $1`,
    [versionId]
  ).catch(() => ({ rows: [] }));

  const accidentGoal = await pool.query(
    `SELECT COUNT(*) as actual,
       COUNT(*) FILTER (WHERE level IN ('重大', '特别重大')) as major_actual,
       COALESCE(SUM(CASE level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
     FROM accidents WHERE is_deleted = false AND accident_date >= $1 AND accident_date <= $2`,
    [yearStart, yearEnd]
  );

  const violationGoal = await pool.query(
    `SELECT COUNT(*) as actual FROM violation_records WHERE is_deleted = false AND violation_date >= $1 AND violation_date <= $2`,
    [yearStart, yearEnd]
  );

  const trainingGoal = await pool.query(
    `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE result = '合格') as qualified FROM training_records WHERE is_deleted = false AND training_date >= $1 AND training_date <= $2`,
    [yearStart, yearEnd]
  );

  const hazardGoal = await pool.query(
    `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'completed') as completed FROM rectification_task WHERE is_deleted = false AND created_at >= $1 AND created_at <= $2`,
    [yearStart, yearEnd]
  );

  const riskGoal = await pool.query(
    `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE risk_level = '重大' OR risk_level = '较高') as high_risk FROM hse_employee_risk_snapshot WHERE is_deleted = false AND snapshot_date >= $1`,
    [yearStart]
  );

  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const fiveYearsAgoStr = fiveYearsAgo.toISOString().split('T')[0];

  const demeritGoal = await pool.query(
    `SELECT COUNT(DISTINCT employee_id) as driver_count,
       COUNT(*) as demerit_count, COALESCE(SUM(demerit_points), 0) as total_points,
       COUNT(*) FILTER (WHERE demerit_date >= $1 AND demerit_date <= $2) as current_year_count,
       COALESCE(SUM(CASE WHEN demerit_date >= $1 AND demerit_date <= $2 THEN demerit_points ELSE 0 END), 0) as current_year_points
     FROM license_demerit_records WHERE is_deleted = false AND demerit_date >= $3`,
    [yearStart, yearEnd, fiveYearsAgoStr]
  );

  const accidentRow = accidentGoal.rows[0];
  const accidentActual = parseInt(accidentRow.actual) || 0;
  const accidentMajorActual = parseInt(accidentRow.major_actual) || 0;
  const accidentWeightedIndex = parseInt(accidentRow.weighted_index) || 0;
  const violationActual = parseInt(violationGoal.rows[0].actual) || 0;
  const trainingTotal = parseInt(trainingGoal.rows[0].total) || 0;
  const trainingQualified = parseInt(trainingGoal.rows[0].qualified) || 0;
  const hazardTotal = parseInt(hazardGoal.rows[0].total) || 0;
  const hazardCompleted = parseInt(hazardGoal.rows[0].completed) || 0;
  const riskTotal = parseInt(riskGoal.rows[0].total) || 0;
  const riskHigh = parseInt(riskGoal.rows[0].high_risk) || 0;
  const demeritRow = demeritGoal.rows[0];
  const demeritDriverCount = parseInt(demeritRow.driver_count) || 0;
  const demeritFiveYearPoints = parseInt(demeritRow.total_points) || 0;

  const dbGoals = contractGoalsResult.rows;
  const goals = [];

  if (dbGoals.length > 0) {
    dbGoals.forEach((goal, index) => {
      let actualValue = 0, gap = 0, completionRate = 0;
      let status = 'in_progress';

      switch (goal.indicator_name) {
        case '事故起数控制':
          actualValue = accidentActual;
          gap = accidentActual - goal.target_value;
          completionRate = accidentActual === 0 ? 100 : Math.max(0, 100 - accidentActual * 20);
          status = accidentActual === 0 ? 'completed' : accidentActual <= 3 ? 'in_progress' : 'warning';
          break;
        case '重大事故控制':
          actualValue = accidentMajorActual;
          gap = accidentMajorActual - goal.target_value;
          completionRate = accidentMajorActual === 0 ? 100 : 0;
          status = accidentMajorActual === 0 ? 'completed' : 'warning';
          break;
        case '事故指数控制':
          actualValue = accidentWeightedIndex;
          gap = accidentWeightedIndex - goal.target_value;
          completionRate = accidentWeightedIndex === 0 ? 100 : Math.max(0, 100 - accidentWeightedIndex);
          status = accidentWeightedIndex === 0 ? 'completed' : accidentWeightedIndex <= 5 ? 'in_progress' : 'warning';
          break;
        case '三违次数控制':
          actualValue = violationActual;
          gap = violationActual - goal.target_value;
          completionRate = violationActual <= goal.target_value ? 100 : Math.max(0, 100 - ((violationActual - goal.target_value) / goal.target_value) * 50);
          status = violationActual <= goal.target_value ? 'completed' : violationActual <= goal.target_value * 1.5 ? 'in_progress' : 'warning';
          break;
        case '培训完成率':
          actualValue = trainingTotal > 0 ? Math.round((trainingQualified / trainingTotal) * 100) : 0;
          gap = actualValue - goal.target_value;
          completionRate = actualValue;
          status = actualValue >= goal.target_value ? 'completed' : actualValue >= goal.target_value * 0.8 ? 'in_progress' : 'warning';
          break;
        case '隐患整改率':
          actualValue = hazardTotal > 0 ? Math.round((hazardCompleted / hazardTotal) * 100) : 0;
          gap = actualValue - goal.target_value;
          completionRate = actualValue;
          status = actualValue >= goal.target_value ? 'completed' : actualValue >= goal.target_value * 0.9 ? 'in_progress' : 'warning';
          break;
        case '高风险人员控制':
          actualValue = riskTotal > 0 ? Math.round((riskHigh / riskTotal) * 100) : 0;
          gap = actualValue - goal.target_value;
          completionRate = actualValue <= goal.target_value ? 100 : Math.max(0, 100 - ((actualValue - goal.target_value) / goal.target_value) * 100);
          status = actualValue <= goal.target_value ? 'completed' : actualValue <= goal.target_value * 2 ? 'in_progress' : 'warning';
          break;
        case '驾驶风险控制':
          actualValue = demeritDriverCount > 0 ? Math.round((demeritFiveYearPoints / (demeritDriverCount * 60)) * 100) : 0;
          gap = actualValue - goal.target_value;
          completionRate = Math.max(0, 100 - actualValue);
          status = actualValue <= goal.target_value ? 'completed' : actualValue <= goal.target_value * 2 ? 'in_progress' : 'warning';
          break;
        default:
          actualValue = 0;
          completionRate = 0;
      }

      goals.push({
        id: goal.id || index + 1, name: goal.indicator_name, category: goal.category,
        targetValue: goal.target_value, targetUnit: goal.target_unit,
        actualValue, actualUnit: goal.target_unit, gap, completionRate, status,
        description: goal.description,
      });
    });
  } else {
    goals.push(
      { id: 1, name: '事故起数控制', category: '安全目标',
        targetValue: 0, targetUnit: '起', actualValue: accidentActual, actualUnit: '起',
        gap: accidentActual - 0, completionRate: accidentActual === 0 ? 100 : Math.max(0, 100 - accidentActual * 20),
        status: accidentActual === 0 ? 'completed' : accidentActual <= 3 ? 'in_progress' : 'warning',
        description: '年度事故起数控制目标',
      },
      { id: 2, name: '重大事故控制', category: '安全目标',
        targetValue: 0, targetUnit: '起', actualValue: accidentMajorActual, actualUnit: '起',
        gap: 0, completionRate: 100,
        status: accidentMajorActual === 0 ? 'completed' : 'warning',
        description: '年度重大及以上事故为零目标',
      },
      { id: 3, name: '事故指数控制', category: '安全目标',
        targetValue: 0, targetUnit: '分', actualValue: accidentWeightedIndex, actualUnit: '分',
        gap: accidentWeightedIndex, completionRate: accidentWeightedIndex === 0 ? 100 : Math.max(0, 100 - accidentWeightedIndex),
        status: accidentWeightedIndex === 0 ? 'completed' : accidentWeightedIndex <= 5 ? 'in_progress' : 'warning',
        description: '年度事故等级加权指数控制目标',
      },
      { id: 4, name: '三违次数控制', category: '安全目标',
        targetValue: 50, targetUnit: '次', actualValue: violationActual, actualUnit: '次',
        gap: violationActual - 50, completionRate: violationActual <= 50 ? 100 : Math.max(0, 100 - ((violationActual - 50) / 50) * 50),
        status: violationActual <= 50 ? 'completed' : violationActual <= 80 ? 'in_progress' : 'warning',
        description: '年度三违次数控制目标',
      },
      { id: 5, name: '培训完成率', category: '培训目标',
        targetValue: 95, targetUnit: '%',
        actualValue: trainingTotal > 0 ? Math.round((trainingQualified / trainingTotal) * 100) : 0, actualUnit: '%',
        gap: (trainingTotal > 0 ? Math.round((trainingQualified / trainingTotal) * 100) : 0) - 95,
        completionRate: trainingTotal > 0 ? Math.round((trainingQualified / trainingTotal) * 100) : 0,
        status: trainingTotal > 0 && (trainingQualified / trainingTotal) >= 0.95 ? 'completed' : 'in_progress',
        description: '年度培训合格完成率目标',
      },
      { id: 6, name: '隐患整改率', category: '隐患目标',
        targetValue: 98, targetUnit: '%',
        actualValue: hazardTotal > 0 ? Math.round((hazardCompleted / hazardTotal) * 100) : 0, actualUnit: '%',
        gap: (hazardTotal > 0 ? Math.round((hazardCompleted / hazardTotal) * 100) : 0) - 98,
        completionRate: hazardTotal > 0 ? Math.round((hazardCompleted / hazardTotal) * 100) : 0,
        status: hazardTotal > 0 && (hazardCompleted / hazardTotal) >= 0.98 ? 'completed' : 'in_progress',
        description: '年度隐患整改闭环率目标',
      },
      { id: 7, name: '高风险人员控制', category: '风险目标',
        targetValue: 5, targetUnit: '%',
        actualValue: riskTotal > 0 ? Math.round((riskHigh / riskTotal) * 100) : 0, actualUnit: '%',
        gap: (riskTotal > 0 ? Math.round((riskHigh / riskTotal) * 100) : 0) - 5,
        completionRate: riskTotal > 0 && (riskHigh / riskTotal) <= 0.05 ? 100 : Math.max(0, 100 - ((riskHigh / riskTotal) - 0.05) * 1000),
        status: riskTotal > 0 && (riskHigh / riskTotal) <= 0.05 ? 'completed' : 'in_progress',
        description: '高风险人员占比控制目标',
      },
      { id: 8, name: '驾驶风险控制', category: '驾驶目标',
        targetValue: 10, targetUnit: '%',
        actualValue: demeritDriverCount > 0 ? Math.round((demeritFiveYearPoints / (demeritDriverCount * 60)) * 100) : 0, actualUnit: '%',
        gap: (demeritDriverCount > 0 ? Math.round((demeritFiveYearPoints / (demeritDriverCount * 60)) * 100) : 0) - 10,
        completionRate: Math.max(0, 100 - (demeritDriverCount > 0 ? Math.round((demeritFiveYearPoints / (demeritDriverCount * 60)) * 100) : 0)),
        status: (demeritDriverCount > 0 ? Math.round((demeritFiveYearPoints / (demeritDriverCount * 60)) * 100) : 0) <= 10 ? 'completed' : 'in_progress',
        description: '驾驶风险控制目标（近5年扣分规则，扣分率=近5年累计扣分/(驾驶员人数×60)×100%）',
      },
      { id: 9, name: '网格长巡查合规率', category: '管理目标',
        targetValue: 90, targetUnit: '%',
        actualValue: 0, actualUnit: '%',
        gap: -90, completionRate: 0,
        status: 'in_progress',
        description: '网格长巡查频次合规率目标',
      },
    );
  }

  const body = {
    code: 0,
    data: {
      currentYear,
      goals,
      contractVersion: currentVersion ? {
        id: currentVersion.id,
        name: currentVersion.name,
        version: currentVersion.version,
        effectiveDate: currentVersion.effective_date,
        expiryDate: currentVersion.expiry_date,
        status: currentVersion.status,
      } : null,
      allVersions: contractVersionsResult.rows.map(v => ({
        id: v.id,
        name: v.name,
        version: v.version,
        effectiveDate: v.effective_date,
        expiryDate: v.expiry_date,
        status: v.status,
      })),
    }
  };
  return { __t: 'json', body };
}

// ========== GET /deduction — 考核扣分明细 ==========
async function deduction() {
  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;

  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const fiveYearsAgoStr = fiveYearsAgo.toISOString().split('T')[0];

  const reasonResult = await pool.query(
    `SELECT '事故' as "reasonType", a.accident_type as "subReason",
       COUNT(*)::int as "count",
       SUM(CASE a.level WHEN '轻微' THEN 3 WHEN '一般' THEN 10 WHEN '较大' THEN 20 WHEN '重大' THEN 50 WHEN '特别重大' THEN 100 ELSE 5 END)::int as "deductionPoints",
       a.level as "severity"
     FROM accidents a
     WHERE a.is_deleted = false AND a.accident_date >= $1 AND a.accident_date <= $2
     GROUP BY a.accident_type, a.level
     UNION ALL
     SELECT '三违' as "reasonType", vr.violation_type as "subReason",
       COUNT(*)::int as "count",
       SUM(CASE vr.violation_level WHEN '严重' THEN 5 WHEN '一般' THEN 2 WHEN '轻微' THEN 1 ELSE 1 END)::int as "deductionPoints",
       vr.violation_level as "severity"
     FROM violation_records vr
     WHERE vr.is_deleted = false AND vr.violation_date >= $1 AND vr.violation_date <= $2
     GROUP BY vr.violation_type, vr.violation_level`,
    [yearStart, yearEnd]
  );

  const deptResult = await pool.query(
    `SELECT o.org_name as "deptName",
       COUNT(DISTINCT a.id)::int as "accidentCount",
       COUNT(DISTINCT v.id)::int as "violationCount",
       COUNT(DISTINCT CASE WHEN rh.is_overdue = true THEN rh.id END)::int as "overdueCount",
       (COUNT(DISTINCT a.id) * 5 + COUNT(DISTINCT v.id) * 2 + COUNT(DISTINCT CASE WHEN rh.is_overdue = true THEN rh.id END) * 5)::int as "totalDeduction"
     FROM hse_org_unit o
     LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
     LEFT JOIN accidents a ON a.personnel_id::bigint = e.id AND a.is_deleted = false AND a.accident_date >= $1 AND a.accident_date <= $2
     LEFT JOIN violation_records v ON v.violator_id::bigint = e.id AND v.is_deleted = false AND v.violation_date >= $1 AND v.violation_date <= $2
     LEFT JOIN hse_rectifications rh ON rh.responsible_person_id = e.id AND rh.is_deleted = false AND rh.is_overdue = true
     WHERE o.is_deleted = false AND o.org_type IN ('department','center')
     GROUP BY o.org_name
     HAVING COUNT(DISTINCT a.id) > 0 OR COUNT(DISTINCT v.id) > 0 OR COUNT(DISTINCT CASE WHEN rh.is_overdue = true THEN rh.id END) > 0
     ORDER BY "totalDeduction" DESC`,
    [yearStart, yearEnd]
  );

  const personResult = await pool.query(
    `SELECT e.id as "employeeId", e.name as "employeeName", e.employee_code as "employeeCode",
       '' as "positionName",
       COALESCE(o.org_name, '') as "deptName",
       COUNT(DISTINCT a.id)::int as "accidentCount",
       COUNT(DISTINCT v.id)::int as "violationCount",
       COUNT(DISTINCT CASE WHEN v.violation_level = '严重' THEN v.id END)::int as "demeritCount",
       (COUNT(DISTINCT a.id) * 5 + COUNT(DISTINCT v.id) * 2 + COUNT(DISTINCT CASE WHEN v.violation_level = '严重' THEN v.id END) * 3)::int as "totalDeduction"
     FROM employee e
     LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN hse_org_unit o ON o.id = ea.org_unit_id AND o.is_deleted = false
     LEFT JOIN accidents a ON a.personnel_id::bigint = e.id AND a.is_deleted = false AND a.accident_date >= $1 AND a.accident_date <= $2
     LEFT JOIN violation_records v ON v.violator_id::bigint = e.id AND v.is_deleted = false AND v.violation_date >= $1 AND v.violation_date <= $2
     WHERE e.is_deleted = false
     GROUP BY e.id, e.name, e.employee_code, o.org_name
     HAVING COUNT(DISTINCT a.id) > 0 OR COUNT(DISTINCT v.id) > 0
     ORDER BY "totalDeduction" DESC
     LIMIT 50`,
    [yearStart, yearEnd]
  );

  const rectResult = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM hazards WHERE is_deleted = false)::int as total,
       (SELECT COUNT(*) FROM hazards WHERE is_deleted = false AND status = '已完成')::int as completed,
       (SELECT COUNT(*) FROM hazards WHERE is_deleted = false AND status = '未完成')::int as pending,
       (SELECT COUNT(*) FROM hse_rectifications WHERE is_deleted = false AND is_overdue = true)::int as overdue,
       (SELECT COUNT(*) FROM hse_rectifications WHERE is_deleted = false AND status IN ('进行中','整改中'))::int as "inProgress"`
  );

  const body = {
    code: 0,
    data: {
      currentYear,
      reasonAnalysis: reasonResult.rows,
      departmentDeduction: deptResult.rows,
      personDeduction: personResult.rows,
      rectificationStatus: rectResult.rows[0] || { total: 0, completed: 0, pending: 0, overdue: 0, inProgress: 0 },
    }
  };
  return { __t: 'json', body };
}

module.exports = {
  overview,
  departmentRanking,
  townshipRanking,
  goals,
  deduction,
};