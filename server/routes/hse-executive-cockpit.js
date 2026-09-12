/**
 * Sprint6.5-C 集团HSE智能驾驶舱 API
 * 路由前缀: /api/hse/executive-cockpit
 * 接口：
 *   GET /overview              - 集团HSE总体态势
 *   GET /org-ranking           - 组织安全排名（支持level参数）
 *   GET /risk-trend            - 风险态势分析（员工/驾驶/事故趋势）
 *   GET /indicator-completion  - 考核指标完成情况
 *   GET /major-risk-warning    - 重大风险预警
 *   GET /management-performance - 管理履职分析
 * 模型版本: v1.1（从hse_assessment_model_version表读取）
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// ===== 考核模型v1.1 规则常量 =====
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

// ===== 权限过滤辅助函数 =====
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

// ===== 辅助函数 =====

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

function getGrade(score) {
  if (score >= 90) return '优秀';
  if (score >= 80) return '良好';
  if (score >= 70) return '合格';
  return '不合格';
}

function getRiskLevel(score) {
  if (score >= 80) return '低风险';
  if (score >= 60) return '一般风险';
  if (score >= 40) return '较高风险';
  return '重大风险';
}

function getStatusColor(status) {
  const colorMap = {
    excellent: '#52c41a',
    good: '#1890ff',
    warning: '#faad14',
    danger: '#f5222d',
  };
  return colorMap[status] || '#8c8c8c';
}

function getYearRange(year) {
  const y = parseInt(year) || new Date().getFullYear();
  return {
    year: y,
    yearStart: `${y}-01-01`,
    yearEnd: `${y}-12-31`,
  };
}

function getFiveYearAgoStr() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().split('T')[0];
}

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

  return {
    scores: { safety: safetyScore, risk: riskScore, accident: accidentScore, rectification: rectificationScore, management: managementScore },
    overallScore,
    grade: getGrade(overallScore),
    riskLevel: getRiskLevel(overallScore),
  };
}

// ===== 1. GET /overview - 集团HSE总体态势 =====
router.get('/overview', async (req, res) => {
  try {
    const { year, yearStart, yearEnd } = getYearRange(req.query.year);
    const fiveYearsAgoStr = getFiveYearAgoStr();

    // 读取当前active模型版本
    const modelResult = await pool.query(
      `SELECT version, effective_date, description FROM hse_assessment_model_version WHERE status = 'active' AND is_deleted = false LIMIT 1`
    );
    const modelVersion = modelResult.rows[0] ? {
      version: modelResult.rows[0].version,
      effectiveDate: modelResult.rows[0].effective_date,
      description: modelResult.rows[0].description,
    } : { version: 'v1.1', effectiveDate: null, description: '默认版本' };

    // 事故统计
    const accidentResult = await pool.query(
      `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE level IN ('重大', '特别重大')) as major_count,
         COALESCE(SUM(CASE level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
       FROM accidents
       WHERE is_deleted = false AND accident_date >= $1 AND accident_date <= $2`,
      [yearStart, yearEnd]
    );
    const accidentRow = accidentResult.rows[0];

    // 三违统计
    const violationResult = await pool.query(
      `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE violation_level = '严重') as serious_count
       FROM violation_records
       WHERE is_deleted = false AND violation_date >= $1 AND violation_date <= $2`,
      [yearStart, yearEnd]
    );
    const violationRow = violationResult.rows[0];

    // 隐患整改
    const rectResult = await pool.query(
      `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
         COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
       FROM rectification_task
       WHERE is_deleted = false AND created_at >= $1 AND created_at <= $2`,
      [yearStart, yearEnd]
    );
    const rectRow = rectResult.rows[0];

    // 驾驶风险(近5年)
    const demeritResult = await pool.query(
      `SELECT COALESCE(SUM(demerit_points), 0) as total_points,
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
       LEFT JOIN hazard_record i ON i.inspector_id = e.id AND i.is_deleted = false
         AND i.discover_date >= $1 AND i.discover_date <= $2
       WHERE e.is_deleted = false AND (p.name ILIKE '%网格长%')
       GROUP BY grid_level`,
      [yearStart, yearEnd]
    );
    const gridCompliance = calculateGridCompliance(gridChiefResult.rows);

    // 汇总统计
    const stats = {
      violationCount: parseInt(violationRow.total_count) || 0,
      seriousViolationCount: parseInt(violationRow.serious_count) || 0,
      majorRiskCount: parseInt(riskRow.major_count) || 0,
      highRiskCount: parseInt(riskRow.high_count) || 0,
      mediumRiskCount: parseInt(riskRow.medium_count) || 0,
      accidentWeightedIndex: parseInt(accidentRow.weighted_index) || 0,
      majorAccidentCount: parseInt(accidentRow.major_count) || 0,
      rectificationTotal: parseInt(rectRow.total_count) || 0,
      rectificationCompleted: parseInt(rectRow.completed_count) || 0,
      rectificationOverdue: parseInt(rectRow.overdue_count) || 0,
      fiveYearDemeritPoints: parseInt(demeritRow.total_points) || 0,
      driverCount: parseInt(demeritRow.driver_count) || 0,
      gridCompliance,
    };

    const { scores, overallScore, grade, riskLevel } = computeOverallScores(stats);

    const accidentCount = parseInt(accidentRow.total_count) || 0;
    const rectificationRate = stats.rectificationTotal > 0
      ? Math.round((stats.rectificationCompleted / stats.rectificationTotal) * 100)
      : 100;

    // KPI卡片数据
    const kpiCards = [
      {
        key: 'assessmentScore',
        title: '年度考核得分',
        value: overallScore,
        unit: '分',
        status: overallScore >= 90 ? 'excellent' : overallScore >= 80 ? 'good' : overallScore >= 70 ? 'warning' : 'danger',
        trend: null,
        description: `考核等级：${grade}`,
      },
      {
        key: 'assessmentGrade',
        title: '考核等级',
        value: grade,
        unit: '',
        status: grade === '优秀' ? 'excellent' : grade === '良好' ? 'good' : grade === '合格' ? 'warning' : 'danger',
        trend: null,
        description: modelVersion.version,
      },
      {
        key: 'riskLevel',
        title: '风险等级',
        value: riskLevel,
        unit: '',
        status: riskLevel === '低风险' ? 'excellent' : riskLevel === '一般风险' ? 'good' : riskLevel === '较高风险' ? 'warning' : 'danger',
        trend: null,
        description: `平均风险分：${Math.round(parseFloat(riskRow.avg_score) || 0)}`,
      },
      {
        key: 'accidentCount',
        title: '事故数量',
        value: accidentCount,
        unit: '起',
        status: accidentCount === 0 ? 'excellent' : accidentCount <= 3 ? 'good' : accidentCount <= 10 ? 'warning' : 'danger',
        trend: null,
        description: `重大事故：${stats.majorAccidentCount}起`,
      },
      {
        key: 'rectificationRate',
        title: '整改完成率',
        value: rectificationRate,
        unit: '%',
        status: rectificationRate >= 98 ? 'excellent' : rectificationRate >= 90 ? 'good' : rectificationRate >= 80 ? 'warning' : 'danger',
        trend: null,
        description: `逾期：${stats.rectificationOverdue}项`,
      },
    ];

    res.json({
      code: 0,
      data: {
        currentYear: year,
        modelVersion,
        overallScore,
        grade,
        riskLevel,
        kpiCards,
        scores,
        summary: {
          accidentCount,
          majorAccidentCount: stats.majorAccidentCount,
          violationCount: stats.violationCount,
          majorRiskCount: stats.majorRiskCount,
          highRiskCount: stats.highRiskCount,
          rectificationRate,
          gridCompliance,
          avgRiskScore: Math.round(parseFloat(riskRow.avg_score) || 0),
        },
      }
    });
  } catch (e) {
    console.error('[executive-cockpit] overview error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

// ===== 2. GET /org-ranking - 组织安全排名 =====
router.get('/org-ranking', async (req, res) => {
  try {
    const level = (req.query.level || 'department').toLowerCase();
    const { year, yearStart, yearEnd } = getYearRange(req.query.year);
    const scope = getPermissionScope(req);

    const orgTypeMap = {
      department: "('department', 'operation_center', 'center')",
      center: "('operation_center', 'center')",
      township: "('town_center', 'township', 'area')",
      area: "('area', 'town_center', 'township')",
    };
    const orgTypeFilter = orgTypeMap[level] || orgTypeMap.department;

    // 查询组织单元
    const orgResult = await pool.query(
      `SELECT id, org_name, org_type, parent_id FROM hse_org_unit 
       WHERE is_deleted = false AND org_type IN ${orgTypeFilter} 
       ORDER BY org_name`
    );

    // 查询各组织事故统计
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

    // 查询各组织三违统计
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

    // 汇总
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
      const { scores, overallScore, grade } = computeOverallScores(stats);

      // 红黄绿状态
      let status = 'green';
      if (overallScore < 70 || majorAccident > 0 || majorRisk > 0) {
        status = 'red';
      } else if (overallScore < 85 || highRisk > 3) {
        status = 'yellow';
      }

      return {
        orgId: org.id,
        orgName: org.org_name,
        orgType: org.org_type,
        overallScore,
        grade,
        status,
        scores,
        accidentCount: parseInt(acc.accident_count) || 0,
        majorAccidentCount: majorAccident,
        violationCount,
        employeeCount,
        majorRiskCount: majorRisk,
        highRiskCount: highRisk,
      };
    });

    // 按得分排序
    rankings.sort((a, b) => b.overallScore - a.overallScore);
    rankings.forEach((r, idx) => { r.rank = idx + 1; });

    // 统计分布
    const statusStats = {
      green: rankings.filter(r => r.status === 'green').length,
      yellow: rankings.filter(r => r.status === 'yellow').length,
      red: rankings.filter(r => r.status === 'red').length,
    };

    res.json({
      code: 0,
      data: { level, currentYear: year, rankings, statusStats }
    });
  } catch (e) {
    console.error('[executive-cockpit] org-ranking error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

// ===== 3. GET /risk-trend - 风险态势分析 =====
router.get('/risk-trend', async (req, res) => {
  try {
    const { year, yearStart, yearEnd } = getYearRange(req.query.year);
    const fiveYearsAgoStr = getFiveYearAgoStr();

    // 员工风险趋势（近12个月）
    const employeeRiskTrend = await pool.query(
      `SELECT TO_CHAR(snapshot_date, 'YYYY-MM') as month,
         COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE risk_level = '重大') as major_count,
         COUNT(*) FILTER (WHERE risk_level = '较高') as high_count,
         COUNT(*) FILTER (WHERE risk_level = '一般') as medium_count,
         COUNT(*) FILTER (WHERE risk_level = '低') as low_count,
         COALESCE(AVG(total_score), 0) as avg_score
       FROM hse_employee_risk_snapshot
       WHERE is_deleted = false AND snapshot_date >= $1 AND snapshot_date <= $2
       GROUP BY month
       ORDER BY month`,
      [yearStart, yearEnd]
    );

    // 驾驶风险趋势（近5年按月）
    const driverRiskTrend = await pool.query(
      `SELECT TO_CHAR(demerit_date, 'YYYY-MM') as month,
         COUNT(*) as record_count,
         COALESCE(SUM(demerit_points), 0) as total_points,
         COUNT(DISTINCT employee_id) as driver_count
       FROM license_demerit_records
       WHERE is_deleted = false AND demerit_date >= $1
       GROUP BY month
       ORDER BY month`,
      [fiveYearsAgoStr]
    );

    // 事故趋势（近5年按季度）
    const accidentTrend = await pool.query(
      `SELECT EXTRACT(YEAR FROM accident_date)::int as year,
         EXTRACT(QUARTER FROM accident_date)::int as quarter,
         CONCAT(EXTRACT(YEAR FROM accident_date)::int, '-Q', EXTRACT(QUARTER FROM accident_date)::int) as period,
         COUNT(*) as accident_count,
         COUNT(*) FILTER (WHERE level IN ('重大', '特别重大')) as major_count,
         COALESCE(SUM(CASE level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index
       FROM accidents
       WHERE is_deleted = false AND accident_date >= CURRENT_DATE - INTERVAL '5 years'
       GROUP BY year, quarter, period
       ORDER BY year, quarter`
    );

    res.json({
      code: 0,
      data: {
        currentYear: year,
        employeeRisk: {
          title: '员工风险趋势',
          months: employeeRiskTrend.rows.map(r => r.month),
          avgScores: employeeRiskTrend.rows.map(r => Math.round(parseFloat(r.avg_score) || 0)),
          majorCount: employeeRiskTrend.rows.map(r => parseInt(r.major_count) || 0),
          highCount: employeeRiskTrend.rows.map(r => parseInt(r.high_count) || 0),
          mediumCount: employeeRiskTrend.rows.map(r => parseInt(r.medium_count) || 0),
          lowCount: employeeRiskTrend.rows.map(r => parseInt(r.low_count) || 0),
          totalCount: employeeRiskTrend.rows.map(r => parseInt(r.total_count) || 0),
        },
        driverRisk: {
          title: '驾驶风险趋势',
          months: driverRiskTrend.rows.map(r => r.month),
          totalPoints: driverRiskTrend.rows.map(r => parseInt(r.total_points) || 0),
          driverCount: driverRiskTrend.rows.map(r => parseInt(r.driver_count) || 0),
          recordCount: driverRiskTrend.rows.map(r => parseInt(r.record_count) || 0),
        },
        accident: {
          title: '事故趋势',
          periods: accidentTrend.rows.map(r => r.period),
          accidentCount: accidentTrend.rows.map(r => parseInt(r.accident_count) || 0),
          majorCount: accidentTrend.rows.map(r => parseInt(r.major_count) || 0),
          weightedIndex: accidentTrend.rows.map(r => parseInt(r.weighted_index) || 0),
        },
      }
    });
  } catch (e) {
    console.error('[executive-cockpit] risk-trend error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

// ===== 4. GET /indicator-completion - 考核指标完成情况 =====
router.get('/indicator-completion', async (req, res) => {
  try {
    const { year, yearStart, yearEnd } = getYearRange(req.query.year);
    const fiveYearsAgoStr = getFiveYearAgoStr();

    // 查询目标责任书版本
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
          `SELECT id, name, category, target_value, target_unit, responsible_unit
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

    const rectAgg = await pool.query(
      `SELECT COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE status = 'completed') as completed_count
       FROM rectification_task
       WHERE is_deleted = false AND created_at >= $1 AND created_at <= $2`,
      [yearStart, yearEnd]
    );
    const rcTotal = parseInt(rectAgg.rows[0].total_count) || 0;
    const rcCompleted = parseInt(rectAgg.rows[0].completed_count) || 0;
    const rectRate = rcTotal > 0 ? Math.round((rcCompleted / rcTotal) * 100) : 0;

    const riskAgg = await pool.query(
      `SELECT COUNT(*) as total_employees,
         COUNT(*) FILTER (WHERE risk_level IN ('重大', '较高')) as high_risk_count
       FROM hse_employee_risk_snapshot
       WHERE is_deleted = false AND snapshot_date >= $1`,
      [yearStart]
    );
    const rkTotal = parseInt(riskAgg.rows[0].total_employees) || 0;
    const rkHigh = parseInt(riskAgg.rows[0].high_risk_count) || 0;
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
       LEFT JOIN hazard_record i ON i.inspector_id = e.id AND i.is_deleted = false
         AND i.discover_date >= $1 AND i.discover_date <= $2
       WHERE e.is_deleted = false AND (p.name ILIKE '%网格长%')
       GROUP BY grid_level`,
      [yearStart, yearEnd]
    );
    const gridCompliance = calculateGridCompliance(gridChiefResult.rows);

    // 默认关键指标
    const keyIndicators = [
      { id: 1, name: '事故起数控制', category: '事故目标', targetValue: 0, targetUnit: '起', actualValue: accTotal, actualUnit: '起', isReverse: true, dataSource: 'accidents表' },
      { id: 2, name: '重大事故控制', category: '事故目标', targetValue: 0, targetUnit: '起', actualValue: accMajor, actualUnit: '起', isReverse: true, dataSource: 'accidents表' },
      { id: 3, name: '三违次数控制', category: '三违目标', targetValue: 50, targetUnit: '次', actualValue: vioTotal, actualUnit: '次', isReverse: true, dataSource: 'violation_records表' },
      { id: 4, name: '隐患整改率', category: '整改目标', targetValue: 98, targetUnit: '%', actualValue: rectRate, actualUnit: '%', isReverse: false, dataSource: 'rectification_task表' },
      { id: 5, name: '高风险人员占比', category: '风险目标', targetValue: 5, targetUnit: '%', actualValue: highRiskRate, actualUnit: '%', isReverse: true, dataSource: 'hse_employee_risk_snapshot表' },
      { id: 6, name: '驾驶风险扣分率', category: '驾驶目标', targetValue: 10, targetUnit: '%', actualValue: demeritRate, actualUnit: '%', isReverse: true, dataSource: 'license_demerit_records表' },
      { id: 7, name: '网格长巡查合规率', category: '管理目标', targetValue: 90, targetUnit: '%', actualValue: gridCompliance, actualUnit: '%', isReverse: false, dataSource: 'hazard_record + position表' },
    ];

    // 计算完成率和状态
    function calcCompletionRate(actual, target, isReverse) {
      if (isReverse) {
        if (actual === 0) return target === 0 ? 100 : 100;
        return target >= actual ? 100 : Math.round((target / actual) * 100);
      } else {
        if (target === 0) return actual > 0 ? 100 : 0;
        return Math.min(100, Math.round((actual / target) * 100));
      }
    }

    function calcStatus(actual, target, isReverse) {
      const rate = calcCompletionRate(actual, target, isReverse);
      if (rate >= 100) return 'excellent';
      if (rate >= 90) return 'good';
      if (rate >= 70) return 'warning';
      return 'danger';
    }

    const indicatorsWithStatus = keyIndicators.map(ind => ({
      ...ind,
      completionRate: calcCompletionRate(ind.actualValue, ind.targetValue, ind.isReverse),
      status: calcStatus(ind.actualValue, ind.targetValue, ind.isReverse),
    }));

    // 分类统计
    const categories = {};
    indicatorsWithStatus.forEach(ind => {
      if (!categories[ind.category]) {
        categories[ind.category] = { total: 0, completed: 0 };
      }
      categories[ind.category].total++;
      if (ind.completionRate >= 100) categories[ind.category].completed++;
    });

    // 目标责任书整体完成率
    const contractCompletionRate = indicatorsWithStatus.length > 0
      ? Math.round(indicatorsWithStatus.filter(i => i.completionRate >= 100).length / indicatorsWithStatus.length * 100)
      : 0;

    // 关键指标完成率
    const keyIndicatorRate = indicatorsWithStatus.length > 0
      ? Math.round(indicatorsWithStatus.reduce((sum, i) => sum + i.completionRate, 0) / indicatorsWithStatus.length)
      : 0;

    res.json({
      code: 0,
      data: {
        currentYear: year,
        contractVersion: contractVersion || {
          id: 0, name: `${year}年度HSE目标责任书`, version: `v${year}.1`,
          effectiveDate: `${year}-01-01`, expiryDate: `${year}-12-31`, status: '生效中',
        },
        contractCompletionRate,
        keyIndicatorRate,
        categories: Object.entries(categories).map(([name, stat]) => ({
          category: name,
          total: stat.total,
          completed: stat.completed,
          completionRate: stat.total > 0 ? Math.round(stat.completed / stat.total * 100) : 0,
        })),
        indicators: indicatorsWithStatus,
      }
    });
  } catch (e) {
    console.error('[executive-cockpit] indicator-completion error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

// ===== 5. GET /major-risk-warning - 重大风险预警 =====
router.get('/major-risk-warning', async (req, res) => {
  try {
    const { year, yearStart, yearEnd } = getYearRange(req.query.year);

    // 高风险组织（综合得分低于70分或有重大事故的部门/中心）
    const highRiskOrgsResult = await pool.query(
      `SELECT o.id, o.org_name, o.org_type,
         COUNT(a.id) as accident_count,
         COUNT(a.id) FILTER (WHERE a.level IN ('重大', '特别重大')) as major_count,
         COALESCE(SUM(CASE a.level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END), 0) as weighted_index,
         COUNT(DISTINCT e.id) as employee_count,
         COUNT(DISTINCT rs.employee_id) FILTER (WHERE rs.risk_level IN ('重大', '较高')) as high_risk_count
       FROM hse_org_unit o
       LEFT JOIN employee_assignment ea ON ea.org_unit_id = o.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
       LEFT JOIN accidents a ON a.personnel_id::bigint = e.id AND a.is_deleted = false
         AND a.accident_date >= $1 AND a.accident_date <= $2
       LEFT JOIN hse_employee_risk_snapshot rs ON rs.employee_id = e.id AND rs.is_deleted = false AND rs.snapshot_date >= $3
       WHERE o.is_deleted = false AND o.org_type IN ('department', 'operation_center', 'center')
       GROUP BY o.id, o.org_name, o.org_type
       HAVING COUNT(a.id) FILTER (WHERE a.level IN ('重大', '特别重大')) > 0
          OR COUNT(DISTINCT rs.employee_id) FILTER (WHERE rs.risk_level IN ('重大', '较高')) > 5
       ORDER BY major_count DESC, high_risk_count DESC
       LIMIT 10`,
      [yearStart, yearEnd, yearStart]
    );

    const highRiskOrgs = highRiskOrgsResult.rows.map(r => {
      const weightedIndex = parseInt(r.weighted_index) || 0;
      const score = Math.max(0, 100 - weightedIndex * 3);
      let riskLevel = '较高风险';
      if (score < 60 || parseInt(r.major_count) > 0) riskLevel = '重大风险';
      else if (score >= 80) riskLevel = '一般风险';

      return {
        orgId: parseInt(r.id),
        orgName: r.org_name,
        orgType: r.org_type,
        riskLevel,
        overallScore: score,
        accidentCount: parseInt(r.accident_count) || 0,
        majorAccidentCount: parseInt(r.major_count) || 0,
        highRiskCount: parseInt(r.high_risk_count) || 0,
        employeeCount: parseInt(r.employee_count) || 0,
        warningReasons: [
          parseInt(r.major_count) > 0 ? `发生重大事故${r.major_count}起` : null,
          parseInt(r.high_risk_count) > 5 ? `高风险人员${r.high_risk_count}人` : null,
        ].filter(Boolean),
      };
    });

    // 高风险员工（风险等级为重大或较高的前20名）
    const highRiskEmployeesResult = await pool.query(
      `SELECT rs.employee_id, e.employee_name, e.employee_code,
         p.name as position_name,
         o.org_name as dept_name,
         rs.total_score,
         rs.risk_level,
         rs.risk_level_code
       FROM hse_employee_risk_snapshot rs
       LEFT JOIN employee e ON e.id = rs.employee_id AND e.is_deleted = false
       LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN hse_org_unit o ON o.id = ea.org_unit_id AND o.is_deleted = false
       WHERE rs.is_deleted = false
         AND rs.risk_level IN ('重大', '较高')
         AND rs.id IN (SELECT MAX(id) FROM hse_employee_risk_snapshot WHERE is_deleted = false GROUP BY employee_id)
       ORDER BY rs.total_score DESC
       LIMIT 20`
    );

    const highRiskEmployees = highRiskEmployeesResult.rows.map(r => ({
      employeeId: parseInt(r.employee_id),
      employeeName: r.employee_name,
      employeeCode: r.employee_code,
      positionName: r.position_name,
      deptName: r.dept_name,
      totalScore: parseFloat(r.total_score) || 0,
      riskLevel: r.risk_level,
      riskLevelCode: r.risk_level_code,
    }));

    // 重大事故风险（近30天有事故苗头或有重大隐患的）
    const majorAccidentRisksResult = await pool.query(
      `SELECT a.id, a.title, a.level, a.accident_date,
         a.personnel_name,
         o.org_name as dept_name,
         a.loss_amount,
         a.casualties,
         a.injuries
       FROM accidents a
       LEFT JOIN employee e ON e.id = a.personnel_id::bigint
       LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN hse_org_unit o ON o.id = ea.org_unit_id
       WHERE a.is_deleted = false AND a.level IN ('重大', '特别重大', '较大')
         AND a.accident_date >= $1 AND a.accident_date <= $2
       ORDER BY a.accident_date DESC
       LIMIT 10`,
      [yearStart, yearEnd]
    );

    const majorAccidentRisks = majorAccidentRisksResult.rows.map(r => ({
      accidentId: parseInt(r.id),
      title: r.title,
      level: r.level,
      accidentDate: r.accident_date,
      personnelName: r.personnel_name,
      deptName: r.dept_name,
      lossAmount: parseFloat(r.loss_amount) || 0,
      casualties: parseInt(r.casualties) || 0,
      injuries: parseInt(r.injuries) || 0,
    }));

    // 整改逾期（超过截止日期未完成的隐患）
    const overdueRectificationsResult = await pool.query(
      `SELECT rt.id, rt.task_title, rt.status,
         rt.created_at,
         rt.due_date,
         rt.responsible_person,
         o.org_name as dept_name,
         rt.priority_level
       FROM rectification_task rt
       LEFT JOIN employee e ON e.employee_name = rt.responsible_person
       LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN hse_org_unit o ON o.id = ea.org_unit_id
       WHERE rt.is_deleted = false AND rt.status = 'overdue'
         AND rt.created_at >= $1
       ORDER BY rt.due_date ASC
       LIMIT 20`,
      [yearStart]
    );

    const overdueRectifications = overdueRectificationsResult.rows.map(r => ({
      taskId: parseInt(r.id),
      taskTitle: r.task_title,
      status: r.status,
      createdAt: r.created_at,
      dueDate: r.due_date,
      responsiblePerson: r.responsible_person,
      deptName: r.dept_name,
      priorityLevel: r.priority_level,
    }));

    // 预警统计
    const warningStats = {
      highRiskOrgCount: highRiskOrgs.length,
      highRiskEmployeeCount: highRiskEmployees.length,
      majorAccidentCount: majorAccidentRisks.filter(r => r.level === '重大' || r.level === '特别重大').length,
      overdueCount: overdueRectifications.length,
    };

    res.json({
      code: 0,
      data: {
        currentYear: year,
        warningStats,
        highRiskOrgs,
        highRiskEmployees,
        majorAccidentRisks,
        overdueRectifications,
      }
    });
  } catch (e) {
    console.error('[executive-cockpit] major-risk-warning error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

// ===== 6. GET /management-performance - 管理履职分析 =====
router.get('/management-performance', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);
    const daysAgoStr = daysAgo.toISOString().split('T')[0];

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
       LEFT JOIN hazard_record i ON i.inspector_id = e.id AND i.is_deleted = false
         AND i.discover_date >= $1
       WHERE e.is_deleted = false AND (p.name ILIKE '%网格长%')
       GROUP BY grid_level`,
      [daysAgoStr]
    );

    // 计算巡查完成率
    const inspectionCompletion = gridChiefResult.rows.map(r => {
      const level = r.grid_level;
      const chiefCount = parseInt(r.chief_count) || 0;
      const actualCount = parseInt(r.inspection_count) || 0;
      let expectedCount = 0;
      if (GRID_CHIEF_INSPECTION_REQUIREMENT[level]) {
        const req = GRID_CHIEF_INSPECTION_REQUIREMENT[level];
        expectedCount = Math.floor(days / req.days) * req.requiredInspections * chiefCount;
      }
      const completionRate = expectedCount > 0 ? Math.round((actualCount / expectedCount) * 100) : 100;
      return {
        gridLevel: level,
        chiefCount,
        actualCount,
        expectedCount,
        completionRate: Math.min(100, completionRate),
      };
    }).filter(r => r.gridLevel !== '其他');

    const totalChiefs = inspectionCompletion.reduce((sum, r) => sum + r.chiefCount, 0);
    const totalActual = inspectionCompletion.reduce((sum, r) => sum + r.actualCount, 0);
    const totalExpected = inspectionCompletion.reduce((sum, r) => sum + r.expectedCount, 0);
    const overallInspectionRate = totalExpected > 0 ? Math.round((totalActual / totalExpected) * 100) : 100;

    // 隐患发现率（每10次巡查发现的隐患数）
    const hazardDiscoveryResult = await pool.query(
      `SELECT COUNT(*) as total_inspections,
         COUNT(*) FILTER (WHERE description IS NOT NULL AND description != '') as hazard_count
       FROM hazard_record
       WHERE is_deleted = false AND discover_date >= $1`,
      [daysAgoStr]
    );
    const totalInspections = parseInt(hazardDiscoveryResult.rows[0].total_inspections) || 0;
    const hazardCount = parseInt(hazardDiscoveryResult.rows[0].hazard_count) || 0;
    const hazardDiscoveryRate = totalInspections > 0 ? Math.round((hazardCount / totalInspections) * 100) : 0;

    // 整改闭环率
    const closureResult = await pool.query(
      `SELECT COUNT(*) as total_tasks,
         COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
         COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count,
         COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
         COUNT(*) FILTER (WHERE status = 'pending') as pending_count
       FROM rectification_task
       WHERE is_deleted = false AND created_at >= $1`,
      [daysAgoStr]
    );
    const totalTasks = parseInt(closureResult.rows[0].total_tasks) || 0;
    const completedTasks = parseInt(closureResult.rows[0].completed_count) || 0;
    const closureRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // 按网格级别统计隐患发现和整改
    const byLevelHazardResult = await pool.query(
      `SELECT CASE
           WHEN p.name ILIKE '%总网格长%' THEN '总网格长'
           WHEN p.name ILIKE '%一级网格长%' THEN '一级网格长'
           WHEN p.name ILIKE '%二级网格长%' THEN '二级网格长'
           WHEN p.name ILIKE '%三级网格长%' THEN '三级网格长'
           ELSE '其他'
         END as grid_level,
         COUNT(DISTINCT i.id) as inspection_count,
         COUNT(DISTINCT rt.id) as hazard_count,
         COUNT(DISTINCT rt.id) FILTER (WHERE rt.status = 'completed') as completed_count
       FROM employee e
       LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN hazard_record i ON i.inspector_id = e.id AND i.is_deleted = false AND i.discover_date >= $1
       LEFT JOIN rectification_task rt ON rt.created_by = e.employee_name AND rt.is_deleted = false AND rt.created_at >= $1
       WHERE e.is_deleted = false AND (p.name ILIKE '%网格长%')
       GROUP BY grid_level`,
      [daysAgoStr]
    );

    const byLevelPerformance = byLevelHazardResult.rows.filter(r => r.grid_level !== '其他').map(r => {
      const inspectionCount = parseInt(r.inspection_count) || 0;
      const hazardCount = parseInt(r.hazard_count) || 0;
      const completedCount = parseInt(r.completed_count) || 0;
      return {
        gridLevel: r.grid_level,
        inspectionCount,
        hazardCount,
        hazardDiscoveryRate: inspectionCount > 0 ? Math.round((hazardCount / inspectionCount) * 100) : 0,
        completedCount,
        closureRate: hazardCount > 0 ? Math.round((completedCount / hazardCount) * 100) : 100,
      };
    });

    // 三个核心KPI
    const kpiMetrics = [
      {
        key: 'inspectionRate',
        title: '网格长巡查完成率',
        value: Math.min(100, overallInspectionRate),
        unit: '%',
        target: 90,
        status: overallInspectionRate >= 90 ? 'excellent' : overallInspectionRate >= 80 ? 'good' : overallInspectionRate >= 70 ? 'warning' : 'danger',
        description: `${days}天内巡查${totalActual}次，应巡查${totalExpected}次`,
      },
      {
        key: 'hazardDiscoveryRate',
        title: '隐患发现率',
        value: hazardDiscoveryRate,
        unit: '%',
        target: 30,
        status: hazardDiscoveryRate >= 50 ? 'excellent' : hazardDiscoveryRate >= 30 ? 'good' : hazardDiscoveryRate >= 15 ? 'warning' : 'danger',
        description: `巡查${totalInspections}次，发现隐患${hazardCount}项`,
      },
      {
        key: 'closureRate',
        title: '整改闭环率',
        value: closureRate,
        unit: '%',
        target: 95,
        status: closureRate >= 95 ? 'excellent' : closureRate >= 85 ? 'good' : closureRate >= 75 ? 'warning' : 'danger',
        description: `隐患${totalTasks}项，已完成${completedTasks}项`,
      },
    ];

    res.json({
      code: 0,
      data: {
        days,
        kpiMetrics,
        inspectionCompletion,
        byLevelPerformance,
        summary: {
          totalChiefs,
          totalInspections,
          totalHazards: hazardCount,
          totalTasks,
          completedTasks,
          overallInspectionRate: Math.min(100, overallInspectionRate),
          hazardDiscoveryRate,
          closureRate,
        },
      }
    });
  } catch (e) {
    console.error('[executive-cockpit] management-performance error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

module.exports = router;
