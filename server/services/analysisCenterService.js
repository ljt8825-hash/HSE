/**
 * Sprint8-A HSE智能分析中心（/api/hse/analysis-center）—— 业务层
 * 原 routes/hse-analysis-center.js（约 2300 行）全部业务 + SQL + 预测/画像辅助计算收敛于此。
 * 每个 HTTP 端点对应一个 service 函数，返回统一描述符（__t:'json'），由 controllers/analysisCenterController.js 的 respond()
 * 统一解释为对外 JSON 契约，行为与原路由逐字节一致（挂载点 /api/hse/analysis-center 不变）。
 *
 * 描述符语义：
 *  - 成功：{ __t:'json', payload, message }
 *  - 业务错误：{ __t:'json', error:{code,message} }（code<0 为业务码，200 JSON，等价原 !isConnected / 业务校验分支）
 *  - 内部异常：{ __t:'json', error:{code,message}, httpStatus }（httpStatus 存在时 controller 设对应 HTTP 状态码；
 *    原实现 catch 为 res.status(500).json(error(-1, e.message))，故此处异常统一带 httpStatus:500）
 *
 * 数据约束：仅读取 employee_risk/driver_risk/accident/assessment/warning/rectification 表及预测/模型版本表，禁止修改源数据。
 * 权限：admin/safety_manager 全局；department_manager 本部门；township_manager 本中心；area_manager 本片区。
 * requireRole 中间件在 routes/hse-analysis-center/main.js 绑定层，本层不感知鉴权。
 */

const { pool, isConnected } = require('../config/db');
const { createNotification } = require('./notificationService');

// ============================================================
// 常量映射（原文件顶层常量，逐字保留）
// ============================================================

const ORG_TYPE_MAP = {
  'department': '部门',
  'township': '乡镇作业中心',
  'area': '片区',
  'grid': '网格',
  'group': '集团',
};

const TREND_MAP = {
  'up': '上升',
  'down': '下降',
  'stable': '稳定',
};

const PREDICTION_TYPE_MAP = {
  'risk_trend': '风险趋势预测',
  'accident': '事故预测',
  'risk_level': '风险等级预测',
  'abnormal': '异常识别',
};

const MODEL_STATUS_MAP = {
  'active': '启用',
  'inactive': '停用',
  'deprecated': '已弃用',
};

const ALGORITHM_MAP = {
  'linear_regression': '线性回归',
};

const SOURCE_LABELS = {
  'employee_risk': '员工风险',
  'driver_risk': '驾驶风险',
  'accident': '事故中心',
  'assessment': '考核中心',
  'management': '管理履职',
};

// ============================================================
// 描述符快捷构造
// ============================================================
const ok = (payload, message) => ({ __t: 'json', payload, message });
const err = (code, message, httpStatus) => ({ __t: 'json', error: { code, message }, ...(httpStatus ? { httpStatus } : {}) });
const dbDown = () => err(-1, '数据库未连接');

/** 统一包裹：异常 → {error:{code:-1,message:e.message}, httpStatus:500}（等价原 catch 的 res.status(500).json(error(-1,e.message))） */
async function W(fn) {
  try {
    return await fn();
  } catch (e) {
    return err(-1, e.message, 500);
  }
}

// ============================================================
// 辅助函数（原文件顶层，模块私有）
// ============================================================

/** 生成编号 */
function generateCode(prefix) {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${prefix}-${dateStr}-${random}`;
}

function camelKeys(obj) {
  if (!obj) return obj;
  const result = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

function getPermissionScope(user) {
  const role = user?.role || 'admin';
  const scopes = {
    'admin': { level: 'all', canViewAll: true },
    'safety_manager': { level: 'all', canViewAll: true },
    'group_leader': { level: 'group', canViewAll: true },
    'department_manager': { level: 'department', canViewAll: false, filterType: 'department' },
    'township_manager': { level: 'township', canViewAll: false, filterType: 'township' },
    'area_manager': { level: 'area', canViewAll: false, filterType: 'area' },
    'administrator': { level: 'grid', canViewAll: false, filterType: 'grid' },
  };
  return scopes[role] || scopes['admin'];
}

// ============================================================
// 模块一：风险趋势分析
// ============================================================

/** GET /risk-trend - 全局风险趋势概览 */
const riskTrend = async (query) => W(async () => {
  if (!isConnected()) return dbDown();

  const { period = 'monthly', start_date, end_date } = query;
  const startDate = start_date || new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const endDate = end_date || new Date().toISOString().split('T')[0];

  const periodExpr = period === 'weekly'
    ? `DATE_TRUNC('week', snapshot_date)`
    : period === 'quarterly'
    ? `DATE_TRUNC('quarter', snapshot_date)`
    : period === 'yearly'
    ? `DATE_TRUNC('year', snapshot_date)`
    : `DATE_TRUNC('month', snapshot_date)`;

  const trendResult = await pool.query(`
    SELECT
      ${periodExpr} AS period,
      AVG(employee_risk_score) AS avg_employee_score,
      SUM(employee_risk_high) AS total_high_risk,
      SUM(employee_risk_medium) AS total_medium_risk,
      SUM(employee_risk_low) AS total_low_risk,
      AVG(driver_risk_score) AS avg_driver_score,
      SUM(accident_total) AS total_accidents,
      SUM(accident_major) AS total_major_accidents,
      AVG(rectification_effective_rate) AS avg_effective_rate,
      AVG(rectification_repeat_rate) AS avg_repeat_rate
    FROM hse_analysis_snapshot
    WHERE is_deleted = false
      AND snapshot_date >= $1
      AND snapshot_date <= $2
      AND analysis_type IN ('risk_trend', 'accident_trend', 'rectification')
    GROUP BY period
    ORDER BY period ASC
  `, [startDate, endDate]);

  let trendData = trendResult.rows;
  if (trendData.length === 0) {
    const realtimeResult = await computeRealtimeRiskTrend(period, startDate, endDate);
    trendData = realtimeResult;
  }

  const withTrend = trendData.map((row, idx) => {
    if (idx === 0) return { ...camelKeys(row), trend: 'stable', changeRate: 0 };
    const prev = trendData[idx - 1];
    const cur = parseFloat(row.avg_employee_score) || 0;
    const prevVal = parseFloat(prev.avg_employee_score) || 0;
    let trend = 'stable';
    let changeRate = 0;
    if (prevVal > 0) {
      changeRate = ((cur - prevVal) / prevVal) * 100;
      if (changeRate > 5) trend = 'up';
      else if (changeRate < -5) trend = 'down';
    }
    return { ...camelKeys(row), trend, changeRate: parseFloat(changeRate.toFixed(2)) };
  });

  const summary = {
    avgEmployeeScore: withTrend.length > 0
      ? parseFloat(withTrend.reduce((sum, r) => sum + (r.avgEmployeeScore || 0), 0) / withTrend.length).toFixed(2)
      : 0,
    latestHighRisk: withTrend.length > 0 ? withTrend[withTrend.length - 1].totalHighRisk || 0 : 0,
    totalAccidents: withTrend.reduce((sum, r) => sum + (r.totalAccidents || 0), 0),
    avgEffectiveRate: withTrend.length > 0
      ? parseFloat(withTrend.reduce((sum, r) => sum + (r.avgEffectiveRate || 0), 0) / withTrend.length).toFixed(2)
      : 0,
  };

  return ok({
    period,
    startDate,
    endDate,
    summary,
    trend: withTrend,
  });
});

/** GET /risk-trend/:target_type/:target_id - 单个对象风险历史趋势 */
const riskTrendDetail = async (params, query) => W(async () => {
  if (!isConnected()) return dbDown();

  const { target_type, target_id } = params;
  const months = parseInt(query.months || 12);
  const targetId = parseInt(target_id);

  if (!['employee', 'department', 'township', 'area', 'grid'].includes(target_type)) {
    return err(-2, '无效的对象类型');
  }

  const startDate = new Date(Date.now() - months * 30 * 24 * 3600 * 1000);
  const startStr = startDate.toISOString().split('T')[0];

  let trendData = [];
  if (target_type === 'employee') {
    const result = await pool.query(`
      SELECT
        DATE_TRUNC('month', snapshot_date) AS month,
        AVG(total_score) AS avg_score,
        MAX(total_score) AS max_score,
        MIN(total_score) AS min_score,
        COUNT(*) AS snapshot_count
      FROM hse_employee_risk_snapshot
      WHERE employee_id = $1
        AND snapshot_date >= $2
        AND is_deleted = false
      GROUP BY DATE_TRUNC('month', snapshot_date)
      ORDER BY month ASC
    `, [targetId, startStr]);
    trendData = result.rows;
  } else {
    const result = await pool.query(`
      SELECT
        DATE_TRUNC('month', snapshot_date) AS month,
        AVG(employee_risk_score) AS avg_score,
        SUM(employee_risk_high) AS high_count,
        SUM(employee_risk_medium) AS medium_count,
        SUM(employee_risk_low) AS low_count
      FROM hse_analysis_snapshot
      WHERE org_id = $1
        AND org_type = $2
        AND snapshot_date >= $3
        AND is_deleted = false
        AND analysis_type = 'risk_trend'
      GROUP BY DATE_TRUNC('month', snapshot_date)
      ORDER BY month ASC
    `, [targetId, target_type, startStr]);
    trendData = result.rows;
  }

  const withMetrics = trendData.map((row, idx) => {
    const item = camelKeys(row);
    const score = parseFloat(item.avgScore) || 0;
    if (idx === 0) {
      return { ...item, trend: 'stable', changeRate: 0, movingAvg: score };
    }
    const prev = parseFloat(trendData[idx - 1].avg_score) || 0;
    let trend = 'stable';
    let changeRate = 0;
    if (prev > 0) {
      changeRate = ((score - prev) / prev) * 100;
      if (changeRate > 5) trend = 'up';
      else if (changeRate < -5) trend = 'down';
    }
    const window = trendData.slice(Math.max(0, idx - 2), idx + 1);
    const movingAvg = parseFloat(
      (window.reduce((sum, r) => sum + (parseFloat(r.avg_score) || 0), 0) / window.length).toFixed(2)
    );
    return { ...item, trend, changeRate: parseFloat(changeRate.toFixed(2)), movingAvg };
  });

  const prediction = predictNextPeriod(withMetrics);

  return ok({
    targetType: target_type,
    targetId,
    targetTypeLabel: ORG_TYPE_MAP[target_type] || target_type,
    months,
    trend: withMetrics,
    prediction,
  });
});

// ============================================================
// 模块二：事故趋势分析
// ============================================================

/** GET /accident-trend - 事故趋势分析 */
const accidentTrend = async (query) => W(async () => {
  if (!isConnected()) return dbDown();

  const { period = 'monthly', start_date, end_date, group_by = 'category' } = query;
  const startDate = start_date || new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const endDate = end_date || new Date().toISOString().split('T')[0];

  const periodExpr = period === 'weekly'
    ? `DATE_TRUNC('week', accident_date)`
    : period === 'quarterly'
    ? `DATE_TRUNC('quarter', accident_date)`
    : period === 'yearly'
    ? `DATE_TRUNC('year', accident_date)`
    : `DATE_TRUNC('month', accident_date)`;

  let groupExpr = 'category';
  if (group_by === 'level') groupExpr = 'level';
  else if (group_by === 'cause') groupExpr = 'cause';

  const trendResult = await pool.query(`
    SELECT
      ${periodExpr} AS period,
      ${groupExpr} AS dimension,
      COUNT(*) AS accident_count,
      COUNT(CASE WHEN level IN ('重大', '特别重大') THEN 1 END) AS major_count,
      COALESCE(SUM(casualties), 0) AS total_casualties,
      COALESCE(SUM(injuries), 0) AS total_injuries,
      COALESCE(SUM(loss_amount), 0) AS total_loss,
      AVG(CASE level
        WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6
        WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1
      END) AS avg_severity
    FROM accidents
    WHERE is_deleted = false
      AND accident_date >= $1
      AND accident_date <= $2
    GROUP BY period, dimension
    ORDER BY period ASC, accident_count DESC
  `, [startDate, endDate]);

  const summaryResult = await pool.query(`
    SELECT
      COUNT(*) AS total_accidents,
      COUNT(CASE WHEN level IN ('重大', '特别重大') THEN 1 END) AS major_accidents,
      COALESCE(SUM(casualties), 0) AS total_casualties,
      COALESCE(SUM(injuries), 0) AS total_injuries,
      COALESCE(SUM(loss_amount), 0) AS total_loss,
      COUNT(DISTINCT category) AS category_count,
      COUNT(DISTINCT cause) AS cause_count,
      ROUND(COUNT(*)::numeric / NULLIF(EXTRACT(EPOCH FROM age($2::date, $1::date)) / 86400.0 / 30.0, 0), 2) AS avg_monthly_rate
    FROM accidents
    WHERE is_deleted = false
      AND accident_date >= $1
      AND accident_date <= $2
  `, [startDate, endDate]);

  const repeatResult = await pool.query(`
    WITH recent_accidents AS (
      SELECT
        a.id,
        a.accident_date,
        a.category,
        a.location,
        a.responsible_id,
        LAG(a.accident_date) OVER (PARTITION BY a.category, a.location ORDER BY a.accident_date) AS prev_date
      FROM accidents a
      WHERE a.is_deleted = false
        AND a.accident_date >= $1
        AND a.accident_date <= $2
    )
    SELECT
      category,
      location,
      COUNT(*) AS repeat_count,
      MIN(accident_date) AS first_date,
      MAX(accident_date) AS last_date
    FROM recent_accidents
    WHERE prev_date IS NOT NULL
      AND (accident_date - prev_date) <= INTERVAL '30 days'
    GROUP BY category, location
    ORDER BY repeat_count DESC
    LIMIT 20
  `, [startDate, endDate]);

  return ok({
    period,
    groupBy: group_by,
    summary: camelKeys(summaryResult.rows[0] || {}),
    trend: trendResult.rows.map(camelKeys),
    repeatAccidents: repeatResult.rows.map(camelKeys),
  });
});

/** GET /accident-repeat - 重复事故专项分析 */
const accidentRepeat = async (query) => W(async () => {
  if (!isConnected()) return dbDown();

  const { days = 90, min_repeats = 2 } = query;
  const startDate = new Date(Date.now() - parseInt(days) * 24 * 3600 * 1000).toISOString().split('T')[0];

  const repeatResult = await pool.query(`
    WITH ranked AS (
      SELECT
        a.id,
        a.accident_date,
        a.category,
        a.location,
        a.cause,
        a.level,
        a.responsible_id,
        LAG(a.accident_date) OVER (
          PARTITION BY COALESCE(a.location, '') || '|' || COALESCE(a.category, '')
          ORDER BY a.accident_date
        ) AS prev_date,
        COUNT(*) OVER (
          PARTITION BY COALESCE(a.location, '') || '|' || COALESCE(a.category, '')
        ) AS total_count
      FROM accidents a
      WHERE a.is_deleted = false
        AND a.accident_date >= $1
    )
    SELECT
      category,
      location,
      cause,
      total_count AS repeat_count,
      MIN(accident_date) AS first_accident,
      MAX(accident_date) AS last_accident,
      ARRAY_AGG(DISTINCT level) AS levels,
      ARRAY_AGG(DISTINCT responsible_id) AS involved_ids
    FROM ranked
    WHERE total_count >= $2
    GROUP BY category, location, cause, total_count
    ORDER BY repeat_count DESC, last_accident DESC
  `, [startDate, min_repeats]);

  const statsResult = await pool.query(`
    WITH grouped AS (
      SELECT
        COALESCE(location, '') || '|' || COALESCE(category, '') AS group_key,
        COUNT(*) AS cnt
      FROM accidents
      WHERE is_deleted = false
        AND accident_date >= $1
      GROUP BY group_key
    )
    SELECT
      COUNT(*) FILTER (WHERE cnt >= 2) AS repeat_groups,
      COUNT(*) AS total_groups,
      ROUND(COUNT(*) FILTER (WHERE cnt >= 2)::numeric / NULLIF(COUNT(*), 0) * 100, 2) AS repeat_rate_pct
    FROM grouped
  `, [startDate]);

  return ok({
    days: parseInt(days),
    minRepeats: parseInt(min_repeats),
    statistics: camelKeys(statsResult.rows[0] || {}),
    repeatPatterns: repeatResult.rows.map(camelKeys),
  });
});

// ============================================================
// 模块三：整改效果分析
// ============================================================

/** GET /rectification-analysis - 整改效果分析 */
const rectificationAnalysis = async (query) => W(async () => {
  if (!isConnected()) return dbDown();

  const { year = new Date().getFullYear(), org_id, org_type } = query;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  let orgFilter = '';
  const orgParams = [];
  let idx = 1;
  if (org_id && org_type) {
    orgFilter = `AND wt.org_id = $${idx++}`;
    orgParams.push(parseInt(org_id));
  }

  const taskStats = await pool.query(`
    SELECT
      COUNT(*) AS total_tasks,
      COUNT(CASE WHEN wt.status = 'closed' THEN 1 END) AS closed_tasks,
      COUNT(CASE WHEN wt.status = 'pending' THEN 1 END) AS pending_tasks,
      COUNT(CASE WHEN wt.status = 'processing' THEN 1 END) AS processing_tasks,
      COUNT(CASE WHEN wt.status = 'pending_review' THEN 1 END) AS review_tasks,
      COUNT(CASE WHEN wt.status = 'rejected' THEN 1 END) AS rejected_tasks,
      COUNT(CASE WHEN wt.actual_completion_date > wt.deadline_date THEN 1 END) AS overdue_tasks,
      ROUND(AVG(CASE
        WHEN wt.actual_completion_date IS NOT NULL
        THEN (wt.actual_completion_date - wt.created_at)
      END), 1) AS avg_cycle_days,
      ROUND(AVG(CASE
        WHEN wt.deadline_date IS NOT NULL AND wt.actual_completion_date IS NOT NULL
        THEN CASE WHEN wt.actual_completion_date <= wt.deadline_date THEN 1.0 ELSE 0.0 END
      END) * 100, 2) AS on_time_rate
    FROM hse_warning_task wt
    WHERE wt.is_deleted = false
      AND wt.created_at >= $1
      AND wt.created_at <= $2
      ${orgFilter}
  `, [yearStart, yearEnd, ...orgParams]);

  const evalStats = await pool.query(`
    SELECT
      COUNT(*) AS total_evaluations,
      COUNT(CASE WHEN level_improved = true THEN 1 END) AS improved_count,
      ROUND(AVG(effect_score), 2) AS avg_effect_score,
      ROUND(AVG(timeliness_score), 2) AS avg_timeliness_score,
      ROUND(AVG(effectiveness_score), 2) AS avg_effectiveness_score,
      ROUND(AVG(repeat_rate), 2) AS avg_repeat_rate,
      ROUND(COUNT(CASE WHEN level_improved = true THEN 1 END)::numeric /
        NULLIF(COUNT(*), 0) * 100, 2) AS improvement_rate_pct
    FROM hse_rectification_evaluation
    WHERE is_deleted = false
      AND evaluation_time >= $1
      AND evaluation_time <= $2
      ${org_id ? `AND task_id IN (SELECT id FROM hse_warning_task WHERE org_id = $${orgParams.length + 1})` : ''}
  `, [yearStart, yearEnd, ...(org_id ? [parseInt(org_id)] : [])]);

  const monthlyTrend = await pool.query(`
    SELECT
      DATE_TRUNC('month', wt.created_at) AS month,
      COUNT(*) AS total_tasks,
      COUNT(CASE WHEN wt.status = 'closed' THEN 1 END) AS closed_tasks,
      COUNT(CASE WHEN wt.actual_completion_date > wt.deadline_date THEN 1 END) AS overdue_tasks,
      ROUND(AVG(CASE
        WHEN wt.deadline_date IS NOT NULL AND wt.actual_completion_date IS NOT NULL
        THEN CASE WHEN wt.actual_completion_date <= wt.deadline_date THEN 1.0 ELSE 0.0 END
      END) * 100, 2) AS on_time_rate
    FROM hse_warning_task wt
    WHERE wt.is_deleted = false
      AND wt.created_at >= $1
      AND wt.created_at <= $2
      ${orgFilter}
    GROUP BY month
    ORDER BY month ASC
  `, [yearStart, yearEnd, ...orgParams]);

  const bySource = await pool.query(`
    SELECT
      wr.source_type,
      COUNT(*) AS total_warnings,
      COUNT(DISTINCT wt.id) AS rectification_tasks,
      COUNT(CASE WHEN wt.status = 'closed' THEN 1 END) AS closed_tasks,
      ROUND(COUNT(CASE WHEN wt.status = 'closed' THEN 1 END)::numeric /
        NULLIF(COUNT(DISTINCT wt.id), 0) * 100, 2) AS rectification_rate
    FROM hse_warning_record wr
    LEFT JOIN hse_warning_task wt ON wr.rectification_task_id = wt.id AND wt.is_deleted = false
    WHERE wr.is_deleted = false
      AND wr.created_at >= $1
      AND wr.created_at <= $2
      ${orgFilter.replace('wt.', 'wr.')}
    GROUP BY wr.source_type
    ORDER BY total_warnings DESC
  `, [yearStart, yearEnd, ...orgParams]);

  return ok({
    year: parseInt(year),
    orgId: org_id ? parseInt(org_id) : null,
    orgType: org_type || null,
    taskStats: camelKeys(taskStats.rows[0] || {}),
    evaluationStats: camelKeys(evalStats.rows[0] || {}),
    monthlyTrend: monthlyTrend.rows.map(r => ({
      ...camelKeys(r),
      onTimeRate: parseFloat(r.on_time_rate || 0),
    })),
    bySource: bySource.rows.map(r => ({
      ...camelKeys(r),
      sourceTypeLabel: SOURCE_LABELS[r.source_type] || r.source_type,
    })),
  });
});

// ============================================================
// 模块四：组织风险画像
// ============================================================

/** GET /org-portrait - 组织风险画像列表 */
const orgPortrait = async (query, user) => W(async () => {
  if (!isConnected()) return dbDown();

  const { org_type, parent_id } = query;
  const scope = getPermissionScope(user);

  let typeFilter = '';
  let parentFilter = '';
  const params = [];
  let idx = 1;

  if (org_type) {
    typeFilter = `AND o.type = $${idx++}`;
    params.push(org_type);
  }
  if (parent_id) {
    parentFilter = `AND o.parent_id = $${idx++}`;
    params.push(parseInt(parent_id));
  }

  const orgResult = await pool.query(`
    SELECT o.id, o.name, o.type, o.parent_id,
      CASE
        WHEN o.type IN ('集团', 'group') THEN 'group'
        WHEN o.type IN ('部门', 'department') THEN 'department'
        WHEN o.type IN ('乡镇作业中心', 'township') THEN 'township'
        WHEN o.type IN ('片区', 'area') THEN 'area'
        WHEN o.type IN ('网格', 'grid') THEN 'grid'
        ELSE 'unknown'
      END AS org_type_code
    FROM hse_org o
    WHERE o.is_deleted = false
      ${typeFilter}
      ${parentFilter}
    ORDER BY o.type, o.name
  `, params);

  const portraits = [];
  for (const org of orgResult.rows) {
    const portrait = await computeOrgPortrait(org, scope);
    portraits.push(portrait);
  }

  return ok({
    orgType: org_type || null,
    parentId: parent_id ? parseInt(parent_id) : null,
    total: portraits.length,
    portraits,
  });
});

/** GET /org-portrait/:org_type/:org_id - 单个组织画像详情 */
const orgPortraitDetail = async (params, user) => W(async () => {
  if (!isConnected()) return dbDown();

  const { org_type, org_id } = params;
  const orgId = parseInt(org_id);
  const scope = getPermissionScope(user);

  const orgResult = await pool.query(`
    SELECT id, name, type, parent_id
    FROM hse_org WHERE id = $1 AND is_deleted = false
  `, [orgId]);

  if (orgResult.rows.length === 0) {
    return err(-2, '组织不存在');
  }

  const portrait = await computeOrgPortrait(orgResult.rows[0], scope, true);

  return ok({
    org: camelKeys(orgResult.rows[0]),
    portrait,
  });
});

/**
 * 计算组织风险画像
 */
async function computeOrgPortrait(org, scope, detail = false) {
  const orgId = org.id;
  const orgTypeCode = {
    '集团': 'group', 'group': 'group',
    '部门': 'department', 'department': 'department',
    '乡镇作业中心': 'township', 'township': 'township',
    '片区': 'area', 'area': 'area',
    '网格': 'grid', 'grid': 'grid',
  }[org.type] || 'unknown';

  const riskResult = await pool.query(`
    SELECT
      COUNT(DISTINCT s.employee_id) AS employee_count,
      ROUND(AVG(s.total_score), 2) AS avg_risk_score,
      ROUND(AVG(s.violation_deduct), 2) AS avg_violation,
      ROUND(AVG(s.driver_deduct), 2) AS avg_driver_deduct,
      ROUND(AVG(s.training_deduct), 2) AS avg_training_deduct,
      ROUND(AVG(s.incident_deduct), 2) AS avg_incident_deduct,
      ROUND(AVG(s.management_deduct), 2) AS avg_management_deduct,
      COUNT(CASE WHEN s.risk_level_code IN ('critical', '重大') THEN 1 END) AS high_risk_count,
      COUNT(CASE WHEN s.risk_level_code IN ('major', '较大') THEN 1 END) AS medium_risk_count,
      COUNT(CASE WHEN s.risk_level_code IN ('minor', '一般', 'low', '轻微') THEN 1 END) AS low_risk_count
    FROM hse_employee_risk_snapshot s
    WHERE s.org_id = $1
      AND s.is_deleted = false
      AND s.snapshot_date = (
        SELECT MAX(s2.snapshot_date)
        FROM hse_employee_risk_snapshot s2
        WHERE s2.org_id = $1 AND s2.is_deleted = false
      )
  `, [orgId]);

  const warningResult = await pool.query(`
    SELECT
      COUNT(*) AS total_warnings,
      COUNT(CASE WHEN wr.status IN ('pending', 'processing') THEN 1 END) AS active_warnings,
      COUNT(CASE WHEN wr.status = 'closed' THEN 1 END) AS closed_warnings,
      COUNT(CASE WHEN wr.warning_level = 'critical' THEN 1 END) AS critical_warnings,
      COUNT(CASE WHEN wr.warning_level = 'major' THEN 1 END) AS major_warnings,
      COUNT(CASE WHEN wr.is_escalated = true THEN 1 END) AS escalated_warnings
    FROM hse_warning_record wr
    WHERE wr.is_deleted = false
      AND wr.org_id = $1
  `, [orgId]);

  const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const accidentResult = await pool.query(`
    SELECT
      COUNT(*) AS total_accidents,
      COUNT(CASE WHEN level IN ('重大', '特别重大') THEN 1 END) AS major_accidents,
      COALESCE(SUM(casualties), 0) AS total_casualties,
      COALESCE(SUM(injuries), 0) AS total_injuries,
      COALESCE(SUM(loss_amount), 0) AS total_loss
    FROM accidents
    WHERE is_deleted = false
      AND accident_date >= $1
  `, [oneYearAgo]);

  const riskData = riskResult.rows[0] || {};
  const warningData = warningResult.rows[0] || {};
  const avgScore = parseFloat(riskData.avg_risk_score) || 0;
  const highCount = parseInt(riskData.high_risk_count) || 0;
  const totalEmployees = parseInt(riskData.employee_count) || 0;

  let orgRiskLevel = '低风险';
  let orgRiskLevelCode = 'low';
  const highRatio = totalEmployees > 0 ? highCount / totalEmployees : 0;
  if (avgScore >= 80 || highRatio > 0.3) {
    orgRiskLevel = '重大风险';
    orgRiskLevelCode = 'critical';
  } else if (avgScore >= 65 || highRatio > 0.15) {
    orgRiskLevel = '较大风险';
    orgRiskLevelCode = 'major';
  } else if (avgScore >= 50) {
    orgRiskLevel = '一般风险';
    orgRiskLevelCode = 'medium';
  }

  const portrait = {
    orgId,
    orgName: org.name,
    orgType: orgTypeCode,
    orgTypeLabel: ORG_TYPE_MAP[orgTypeCode] || orgTypeCode,
    parentId: org.parent_id,
    employeeCount: totalEmployees,
    avgRiskScore: avgScore,
    riskLevel: orgRiskLevel,
    riskLevelCode: orgRiskLevelCode,
    riskDistribution: {
      high: highCount,
      medium: parseInt(riskData.medium_risk_count) || 0,
      low: parseInt(riskData.low_risk_count) || 0,
    },
    dimensions: {
      violation: parseFloat(riskData.avg_violation) || 0,
      driver: parseFloat(riskData.avg_driver_deduct) || 0,
      training: parseFloat(riskData.avg_training_deduct) || 0,
      incident: parseFloat(riskData.avg_incident_deduct) || 0,
      management: parseFloat(riskData.avg_management_deduct) || 0,
    },
    warningStats: {
      total: parseInt(warningData.total_warnings) || 0,
      active: parseInt(warningData.active_warnings) || 0,
      closed: parseInt(warningData.closed_warnings) || 0,
      critical: parseInt(warningData.critical_warnings) || 0,
      major: parseInt(warningData.major_warnings) || 0,
      escalated: parseInt(warningData.escalated_warnings) || 0,
    },
    accidentStats: camelKeys(accidentResult.rows[0] || {}),
  };

  if (detail) {
    const childOrgs = await pool.query(`
      SELECT id, name, type FROM hse_org
      WHERE parent_id = $1 AND is_deleted = false
      ORDER BY type, name
    `, [orgId]);
    portrait.children = childOrgs.rows.map(camelKeys);

    const trendMonths = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      trendMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    portrait.trend = trendMonths.map(async (month) => {
      const monthResult = await pool.query(`
        SELECT AVG(total_score) AS avg_score
        FROM hse_employee_risk_snapshot
        WHERE org_id = $1
          AND is_deleted = false
          AND DATE_TRUNC('month', snapshot_date) = $2::date
      `, [orgId, month + '-01']);
      return {
        month,
        avgScore: parseFloat(monthResult.rows[0]?.avg_score) || null,
      };
    });
    portrait.trend = await Promise.all(portrait.trend);
  }

  return portrait;
}

// ============================================================
// 模块五：风险预测模型
// ============================================================

/** POST /predict - 执行风险预测 */
const predict = async (body, user) => W(async () => {
  if (!isConnected()) return dbDown();

  const {
    prediction_type = 'risk_trend',
    target_type = 'all',
    target_id,
    months = 3,
    note,
  } = body;

  if (!['risk_trend', 'accident', 'risk_level', 'abnormal'].includes(prediction_type)) {
    return err(-2, '无效的预测类型');
  }
  if (!['employee', 'department', 'township', 'area', 'grid', 'all'].includes(target_type)) {
    return err(-2, '无效的对象类型');
  }

  const predictionDate = new Date();
  const targetDate = new Date(Date.now() + parseInt(months) * 30 * 24 * 3600 * 1000);
  const predictionTarget = targetDate.toISOString().split('T')[0];
  const predictionDateStr = predictionDate.toISOString().split('T')[0];

  const historyData = await collectHistoryData(target_type, target_id);

  const prediction = computePrediction(prediction_type, target_type, historyData, parseInt(months));

  const abnormalResult = detectAbnormal(historyData, prediction);

  const insertResult = await pool.query(`
    INSERT INTO hse_risk_prediction (
      prediction_date, prediction_target, prediction_type, prediction_model,
      target_type, target_id, target_name,
      predicted_risk_score, predicted_risk_level, predicted_accidents,
      predicted_trend, predicted_confidence,
      trend_slope, trend_change_rate, warning_threshold,
      is_abnormal, abnormal_degree,
      contributing_factors, baseline_avg, baseline_stddev,
      prediction_note, model_version, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
    RETURNING *
  `, [
    predictionDateStr,
    predictionTarget,
    prediction_type,
    prediction.model || 'trend',
    target_type,
    target_id || null,
    prediction.target_name || null,
    prediction.predicted_risk_score || null,
    prediction.predicted_risk_level || null,
    prediction.predicted_accidents || null,
    prediction.predicted_trend || 'stable',
    prediction.predicted_confidence || 0,
    prediction.trend_slope || null,
    prediction.trend_change_rate || null,
    prediction.warning_threshold || null,
    abnormalResult.is_abnormal,
    abnormalResult.abnormal_degree || 0,
    JSON.stringify(prediction.contributing_factors || []),
    prediction.baseline_avg || null,
    prediction.baseline_stddev || null,
    note || prediction.prediction_note || null,
    prediction.model_version || 'v1.0',
    user?.id || null,
  ]);

  const saved = camelKeys(insertResult.rows[0]);

  return ok({
    ...saved,
    predictionTypeLabel: PREDICTION_TYPE_MAP[prediction_type] || prediction_type,
    predictedTrendLabel: TREND_MAP[prediction.predicted_trend] || prediction.predicted_trend,
    contributingFactors: prediction.contributing_factors || [],
    isAbnormal: abnormalResult.is_abnormal,
    abnormalDegree: abnormalResult.abnormal_degree || 0,
    message: '风险预测已生成',
  });
});

/** GET /predictions - 查询历史预测结果 */
const predictions = async (query) => W(async () => {
  if (!isConnected()) return dbDown();

  const {
    prediction_type, target_type, target_id,
    date_from, date_to, is_abnormal,
    page = 1, pageSize = 20,
  } = query;

  const conditions = ['is_deleted = false'];
  const params = [];
  let idx = 1;

  if (prediction_type) { conditions.push(`prediction_type = $${idx++}`); params.push(prediction_type); }
  if (target_type) { conditions.push(`target_type = $${idx++}`); params.push(target_type); }
  if (target_id) { conditions.push(`target_id = $${idx++}`); params.push(parseInt(target_id)); }
  if (date_from) { conditions.push(`prediction_date >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`prediction_date <= $${idx++}`); params.push(date_to); }
  if (is_abnormal !== undefined) { conditions.push(`is_abnormal = $${idx++}`); params.push(is_abnormal === 'true'); }

  const whereClause = conditions.join(' AND ');
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM hse_risk_prediction WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  const listResult = await pool.query(`
    SELECT * FROM hse_risk_prediction
    WHERE ${whereClause}
    ORDER BY prediction_date DESC, prediction_target DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `, [...params, parseInt(pageSize), offset]);

  const list = listResult.rows.map(row => {
    const item = camelKeys(row);
    item.predictionTypeLabel = PREDICTION_TYPE_MAP[row.prediction_type] || row.prediction_type;
    item.predictedTrendLabel = TREND_MAP[row.predicted_trend] || row.predicted_trend;
    item.contributingFactors = row.contributing_factors || [];
    return item;
  });

  return ok({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

/** GET /predictions/:id - 查询单个预测详情 */
const predictionDetail = async (params) => W(async () => {
  if (!isConnected()) return dbDown();

  const { id } = params;
  const result = await pool.query(`
    SELECT * FROM hse_risk_prediction WHERE id = $1 AND is_deleted = false
  `, [id]);

  if (result.rows.length === 0) {
    return err(-2, '预测记录不存在');
  }

  const item = camelKeys(result.rows[0]);
  item.predictionTypeLabel = PREDICTION_TYPE_MAP[result.rows[0].prediction_type] || result.rows[0].prediction_type;
  item.predictedTrendLabel = TREND_MAP[result.rows[0].predicted_trend] || result.rows[0].predicted_trend;
  item.contributingFactors = result.rows[0].contributing_factors || [];

  return ok(item);
});

/** GET /abnormal - 异常识别结果列表 */
const abnormal = async (query) => W(async () => {
  if (!isConnected()) return dbDown();

  const { target_type, is_resolved, page = 1, pageSize = 20 } = query;

  const conditions = ['is_deleted = false', 'is_abnormal = true'];
  const params = [];
  let idx = 1;

  if (target_type) { conditions.push(`target_type = $${idx++}`); params.push(target_type); }
  if (is_resolved !== undefined) {
    if (is_resolved === 'true') conditions.push(`predicted_trend = 'stable'`);
    else conditions.push(`predicted_trend != 'stable'`);
  }

  const whereClause = conditions.join(' AND ');
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM hse_risk_prediction WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  const listResult = await pool.query(`
    SELECT * FROM hse_risk_prediction
    WHERE ${whereClause}
    ORDER BY abnormal_degree DESC, prediction_date DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `, [...params, parseInt(pageSize), offset]);

  const statsResult = await pool.query(`
    SELECT
      COUNT(*) AS total_abnormal,
      ROUND(AVG(abnormal_degree), 2) AS avg_degree,
      COUNT(CASE WHEN abnormal_degree >= 70 THEN 1 END) AS severe_count,
      COUNT(CASE WHEN abnormal_degree >= 40 AND abnormal_degree < 70 THEN 1 END) AS moderate_count,
      COUNT(CASE WHEN abnormal_degree < 40 THEN 1 END) AS mild_count,
      COUNT(DISTINCT target_type) AS affected_types
    FROM hse_risk_prediction
    WHERE is_deleted = false AND is_abnormal = true
  `);

  const list = listResult.rows.map(row => {
    const item = camelKeys(row);
    item.predictionTypeLabel = PREDICTION_TYPE_MAP[row.prediction_type] || row.prediction_type;
    item.predictedTrendLabel = TREND_MAP[row.predicted_trend] || row.predicted_trend;
    return item;
  });

  return ok({
    statistics: camelKeys(statsResult.rows[0] || {}),
    list,
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize),
  });
});

// ============================================================
// 预测计算辅助函数
// ============================================================

async function collectHistoryData(targetType, targetId) {
  const endDate = new Date();
  const startDate = new Date(Date.now() - 12 * 30 * 24 * 3600 * 1000);
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const data = {
    employeeRisk: [],
    driverRisk: [],
    accidents: [],
    warnings: [],
    rectifications: [],
  };

  if (targetType === 'employee' || targetType === 'all') {
    const result = await pool.query(`
      SELECT snapshot_date, total_score, risk_level_code
      FROM hse_employee_risk_snapshot
      WHERE is_deleted = false AND snapshot_date >= $1 AND snapshot_date <= $2
      ORDER BY snapshot_date
    `, [startStr, endStr]);
    data.employeeRisk = result.rows.map(r => ({ date: r.snapshot_date, score: parseFloat(r.total_score), level: r.risk_level_code }));
  }

  const accidentResult = await pool.query(`
    SELECT accident_date, level, category, casualties, injuries
    FROM accidents
    WHERE is_deleted = false AND accident_date >= $1 AND accident_date <= $2
    ORDER BY accident_date
  `, [startStr, endStr]);
  data.accidents = accidentResult.rows.map(r => ({
    date: r.accident_date,
    level: r.level,
    category: r.category,
    casualties: parseInt(r.casualties) || 0,
    injuries: parseInt(r.injuries) || 0,
  }));

  const warningResult = await pool.query(`
    SELECT created_at, warning_level, source_type, status
    FROM hse_warning_record
    WHERE is_deleted = false AND created_at >= $1 AND created_at <= $2
    ORDER BY created_at
  `, [startStr, endStr]);
  data.warnings = warningResult.rows.map(r => ({
    date: r.created_at,
    level: r.warning_level,
    source: r.source_type,
    status: r.status,
  }));

  const rectResult = await pool.query(`
    SELECT created_at, actual_completion_date, deadline_date, status
    FROM hse_warning_task
    WHERE is_deleted = false AND created_at >= $1 AND created_at <= $2
    ORDER BY created_at
  `, [startStr, endStr]);
  data.rectifications = rectResult.rows.map(r => ({
    created: r.created_at,
    completed: r.actual_completion_date,
    deadline: r.deadline_date,
    status: r.status,
  }));

  return data;
}

function computePrediction(predictionType, targetType, historyData, months) {
  const result = {
    model: 'trend',
    predicted_risk_score: null,
    predicted_risk_level: null,
    predicted_accidents: null,
    predicted_trend: 'stable',
    predicted_confidence: 0,
    trend_slope: null,
    trend_change_rate: null,
    warning_threshold: null,
    contributing_factors: [],
    baseline_avg: null,
    baseline_stddev: null,
    prediction_note: null,
    model_version: 'v1.0',
  };

  if (historyData.employeeRisk.length >= 3) {
    const scores = historyData.employeeRisk.map(d => d.score).filter(s => s > 0);
    if (scores.length >= 3) {
      const n = scores.length;
      const xMean = (n - 1) / 2;
      const yMean = scores.reduce((a, b) => a + b, 0) / n;

      let numerator = 0;
      let denominator = 0;
      for (let i = 0; i < n; i++) {
        numerator += (i - xMean) * (scores[i] - yMean);
        denominator += (i - xMean) ** 2;
      }

      const slope = denominator > 0 ? numerator / denominator : 0;
      const intercept = yMean - slope * xMean;

      const futureX = n - 1 + months;
      const predictedScore = Math.max(0, Math.min(100, intercept + slope * futureX));

      result.predicted_risk_score = parseFloat(predictedScore.toFixed(2));
      result.trend_slope = parseFloat(slope.toFixed(4));
      result.trend_change_rate = parseFloat((slope / yMean * 100).toFixed(4));
      result.baseline_avg = parseFloat(yMean.toFixed(2));

      const predictions = scores.map((_, i) => intercept + slope * i);
      const residuals = scores.map((s, i) => s - predictions[i]);
      const ssRes = residuals.reduce((a, b) => a + b ** 2, 0);
      const ssTot = scores.reduce((s, v) => s + (v - yMean) ** 2, 0);
      const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
      result.predicted_confidence = parseFloat(Math.max(0, Math.min(100, r2 * 100)).toFixed(2));
      result.baseline_stddev = parseFloat(Math.sqrt(ssRes / n).toFixed(2));

      if (slope > 1) result.predicted_trend = 'up';
      else if (slope < -1) result.predicted_trend = 'down';

      if (predictedScore >= 80) result.predicted_risk_level = 'critical';
      else if (predictedScore >= 65) result.predicted_risk_level = 'major';
      else if (predictedScore >= 50) result.predicted_risk_level = 'minor';
      else result.predicted_risk_level = 'info';
    }
  }

  if (historyData.accidents.length > 0) {
    const monthlyCounts = {};
    for (const acc of historyData.accidents) {
      const month = acc.date ? new Date(acc.date).toISOString().slice(0, 7) : null;
      if (month) monthlyCounts[month] = (monthlyCounts[month] || 0) + 1;
    }
    const counts = Object.values(monthlyCounts);
    if (counts.length >= 3) {
      const avgMonthly = counts.reduce((a, b) => a + b, 0) / counts.length;
      result.predicted_accidents = Math.round(avgMonthly * months);
    }
  }

  const factors = [];
  if (historyData.employeeRisk.length > 0) {
    const recentScores = historyData.employeeRisk.slice(-3).map(d => d.score).filter(s => s > 0);
    if (recentScores.length >= 2) {
      const scoreChange = recentScores[recentScores.length - 1] - recentScores[0];
      if (Math.abs(scoreChange) > 5) {
        factors.push({
          factor: '员工风险分变化',
          weight: Math.min(1, Math.abs(scoreChange) / 20),
          direction: scoreChange > 0 ? 'up' : 'down',
          value: parseFloat(scoreChange.toFixed(2)),
        });
      }
    }
  }

  if (historyData.accidents.length > 0) {
    const recentAccidents = historyData.accidents.slice(-6);
    if (recentAccidents.length > 0) {
      factors.push({
        factor: '近期事故频次',
        weight: Math.min(1, recentAccidents.length / 10),
        direction: recentAccidents.length > 3 ? 'up' : 'stable',
        value: recentAccidents.length,
      });
    }
  }

  if (historyData.warnings.length > 0) {
    const criticalWarnings = historyData.warnings.filter(w => w.level === 'critical').length;
    if (criticalWarnings > 0) {
      factors.push({
        factor: '重大预警数',
        weight: Math.min(1, criticalWarnings / 5),
        direction: criticalWarnings > 2 ? 'up' : 'stable',
        value: criticalWarnings,
      });
    }
  }

  result.contributing_factors = factors;
  result.prediction_note = generatePredictionNote(result, predictionType);

  return result;
}

function detectAbnormal(historyData, prediction) {
  const result = { is_abnormal: false, abnormal_degree: 0 };

  if (prediction.predicted_trend === 'up') {
    result.is_abnormal = true;
    result.abnormal_degree = Math.min(100, Math.abs(prediction.trend_slope || 0) * 10);
  }

  if (prediction.predicted_confidence !== null && prediction.predicted_confidence < 50) {
    result.is_abnormal = true;
    result.abnormal_degree = Math.max(result.abnormal_degree, 40);
  }

  if (historyData.employeeRisk.length >= 6) {
    const scores = historyData.employeeRisk.map(d => d.score).filter(s => s > 0);
    if (scores.length >= 6) {
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
      const stddev = Math.sqrt(variance);

      if (stddev > 15) {
        result.is_abnormal = true;
        result.abnormal_degree = Math.max(result.abnormal_degree, Math.min(100, stddev * 3));
      }

      const lastScore = scores[scores.length - 1];
      if (Math.abs(lastScore - mean) > 2 * stddev) {
        result.is_abnormal = true;
        result.abnormal_degree = Math.max(result.abnormal_degree, 60);
      }
    }
  }

  if (historyData.accidents.length > 5) {
    const recentMonthAccidents = historyData.accidents.filter(a => {
      const d = a.date ? new Date(a.date) : null;
      return d && d > new Date(Date.now() - 30 * 24 * 3600 * 1000);
    }).length;
    if (recentMonthAccidents > 5) {
      result.is_abnormal = true;
      result.abnormal_degree = Math.max(result.abnormal_degree, 70);
    }
  }

  return result;
}

function generatePredictionNote(prediction, predictionType) {
  const parts = [];
  if (prediction.predicted_risk_score !== null) {
    parts.push(`预测风险分: ${prediction.predicted_risk_score}`);
  }
  if (prediction.predicted_trend) {
    parts.push(`趋势: ${TREND_MAP[prediction.predicted_trend] || prediction.predicted_trend}`);
  }
  if (prediction.predicted_accidents !== null) {
    parts.push(`预测事故数: ${prediction.predicted_accidents}`);
  }
  if (prediction.predicted_confidence !== null) {
    parts.push(`置信度: ${prediction.predicted_confidence}%`);
  }
  return parts.join('；');
}

async function computeRealtimeRiskTrend(period, startDate, endDate) {
  const periodExpr = period === 'weekly'
    ? `DATE_TRUNC('week', snapshot_date)`
    : period === 'quarterly'
    ? `DATE_TRUNC('quarter', snapshot_date)`
    : period === 'yearly'
    ? `DATE_TRUNC('year', snapshot_date)`
    : `DATE_TRUNC('month', snapshot_date)`;

  const riskResult = await pool.query(`
    SELECT
      ${periodExpr} AS period,
      AVG(total_score) AS avg_employee_score,
      COUNT(CASE WHEN risk_level_code IN ('critical', '重大') THEN 1 END) AS total_high_risk,
      COUNT(CASE WHEN risk_level_code IN ('major', '较大') THEN 1 END) AS total_medium_risk,
      COUNT(CASE WHEN risk_level_code IN ('minor', '一般', 'low', '轻微') THEN 1 END) AS total_low_risk
    FROM hse_employee_risk_snapshot
    WHERE is_deleted = false AND snapshot_date >= $1 AND snapshot_date <= $2
    GROUP BY period ORDER BY period ASC
  `, [startDate, endDate]);

  const accidentResult = await pool.query(`
    SELECT
      ${periodExpr} AS period,
      COUNT(*) AS total_accidents,
      COUNT(CASE WHEN level IN ('重大', '特别重大') THEN 1 END) AS total_major_accidents
    FROM accidents
    WHERE is_deleted = false AND accident_date >= $1 AND accident_date <= $2
    GROUP BY period ORDER BY period ASC
  `, [startDate, endDate]);

  const rectResult = await pool.query(`
    SELECT
      ${periodExpr} AS period,
      ROUND(AVG(CASE
        WHEN actual_completion_date IS NOT NULL AND deadline_date IS NOT NULL
        THEN CASE WHEN actual_completion_date <= deadline_date THEN 100.0 ELSE 0.0 END
      END), 2) AS avg_effective_rate,
      ROUND(AVG(CASE
        WHEN deadline_date IS NOT NULL AND actual_completion_date IS NOT NULL
        THEN CASE WHEN actual_completion_date > deadline_date THEN 100.0 ELSE 0.0 END
      END), 2) AS avg_repeat_rate
    FROM hse_warning_task
    WHERE is_deleted = false AND created_at >= $1 AND created_at <= $2
    GROUP BY period ORDER BY period ASC
  `, [startDate, endDate]);

  const accidentMap = {};
  for (const r of accidentResult.rows) {
    accidentMap[r.period] = r;
  }
  const rectMap = {};
  for (const r of rectResult.rows) {
    rectMap[r.period] = r;
  }

  return riskResult.rows.map(r => ({
    period: r.period,
    avg_employee_score: r.avg_employee_score,
    total_high_risk: r.total_high_risk,
    total_medium_risk: r.total_medium_risk,
    total_low_risk: r.total_low_risk,
    avg_driver_score: null,
    total_accidents: accidentMap[r.period]?.total_accidents || 0,
    total_major_accidents: accidentMap[r.period]?.total_major_accidents || 0,
    avg_effective_rate: rectMap[r.period]?.avg_effective_rate || null,
    avg_repeat_rate: rectMap[r.period]?.avg_repeat_rate || null,
  }));
}

function predictNextPeriod(trendData) {
  if (trendData.length < 3) return { predictedScore: null, trend: 'stable', confidence: 0 };

  const scores = trendData.map(r => parseFloat(r.avgScore) || 0).filter(s => s > 0);
  if (scores.length < 3) return { predictedScore: null, trend: 'stable', confidence: 0 };

  const n = scores.length;
  const xMean = (n - 1) / 2;
  const yMean = scores.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (scores[i] - yMean);
    denominator += (i - xMean) ** 2;
  }

  const slope = denominator > 0 ? numerator / denominator : 0;
  const intercept = yMean - slope * xMean;
  const predictedScore = Math.max(0, Math.min(100, intercept + slope * n));

  let trend = 'stable';
  if (slope > 0.5) trend = 'up';
  else if (slope < -0.5) trend = 'down';

  return {
    predictedScore: parseFloat(predictedScore.toFixed(2)),
    trend,
    confidence: parseFloat(Math.min(100, Math.abs(slope / yMean * 100)).toFixed(2)),
  };
}

// ============================================================
// Sprint8-A-1: 预测模型版本管理
// ============================================================

/** GET /model-versions - 预测模型版本列表 */
const modelVersions = async (query) => W(async () => {
  if (!isConnected()) return dbDown();

  const { model_code, status } = query;
  const conditions = ['is_deleted = false'];
  const params = [];
  let idx = 1;

  if (model_code) { conditions.push(`model_code = $${idx++}`); params.push(model_code); }
  if (status) { conditions.push(`status = $${idx++}`); params.push(status); }

  const result = await pool.query(`
    SELECT * FROM hse_prediction_model_version
    WHERE ${conditions.join(' AND ')}
    ORDER BY model_code, created_at DESC
  `, params);

  const list = result.rows.map(row => {
    const item = camelKeys(row);
    item.statusLabel = MODEL_STATUS_MAP[row.status] || row.status;
    item.algorithmLabel = ALGORITHM_MAP[row.algorithm] || row.algorithm;
    item.isFrozenLabel = row.is_frozen ? '已冻结' : '未冻结';
    return item;
  });

  return ok({ list, total: list.length });
});

/** GET /model-versions/:id - 预测模型版本详情 */
const modelVersionDetail = async (params) => W(async () => {
  if (!isConnected()) return dbDown();

  const { id } = params;
  const result = await pool.query(`
    SELECT * FROM hse_prediction_model_version WHERE id = $1 AND is_deleted = false
  `, [id]);

  if (result.rows.length === 0) {
    return err(-2, '模型版本不存在');
  }

  const item = camelKeys(result.rows[0]);
  item.statusLabel = MODEL_STATUS_MAP[result.rows[0].status] || result.rows[0].status;
  item.algorithmLabel = ALGORITHM_MAP[result.rows[0].algorithm] || result.rows[0].algorithm;
  item.isFrozenLabel = result.rows[0].is_frozen ? '已冻结' : '未冻结';

  return ok(item);
});

/** GET /model-versions/active - 获取当前生效的预测模型配置 */
const modelVersionActive = async () => W(async () => {
  if (!isConnected()) return dbDown();

  const result = await pool.query(`
    SELECT * FROM hse_prediction_model_version
    WHERE is_deleted = false AND status = 'active' AND is_frozen = true
    ORDER BY created_at DESC LIMIT 1
  `);

  if (result.rows.length === 0) {
    return err(-2, '无冻结的生效模型版本');
  }

  const item = camelKeys(result.rows[0]);
  item.statusLabel = MODEL_STATUS_MAP[result.rows[0].status] || result.rows[0].status;
  item.algorithmLabel = ALGORITHM_MAP[result.rows[0].algorithm] || result.rows[0].algorithm;

  return ok(item);
});

/** POST /model-versions - 创建预测模型版本 */
const modelVersionCreate = async (body, user) => W(async () => {
  if (!isConnected()) return dbDown();

  const {
    model_code = 'HSE-RISK-PREDICT',
    version,
    algorithm = 'linear_regression',
    prediction_cycle = 3,
    parameters = {},
    confidence_method = 'r2',
    confidence_min = 30,
    level_critical = 80,
    level_major = 65,
    level_minor = 50,
    anomaly_stddev_threshold = 2,
    anomaly_slope_threshold = 1,
    anomaly_accident_surge = 5,
    trend_up_threshold = 5,
    trend_down_threshold = -5,
    status = 'active',
    change_log,
  } = body;

  if (!version) {
    return err(-2, '版本号不能为空');
  }

  const existCheck = await pool.query(`
    SELECT id FROM hse_prediction_model_version
    WHERE model_code = $1 AND version = $2 AND is_deleted = false
  `, [model_code, version]);

  if (existCheck.rows.length > 0) {
    return err(-2, '该模型版本已存在');
  }

  const result = await pool.query(`
    INSERT INTO hse_prediction_model_version (
      model_code, version, algorithm, prediction_cycle,
      parameters, confidence_method, confidence_min,
      level_critical, level_major, level_minor,
      anomaly_stddev_threshold, anomaly_slope_threshold, anomaly_accident_surge,
      trend_up_threshold, trend_down_threshold,
      status, is_frozen, change_log, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING *
  `, [
    model_code, version, algorithm, prediction_cycle,
    JSON.stringify(parameters), confidence_method, confidence_min,
    level_critical, level_major, level_minor,
    anomaly_stddev_threshold, anomaly_slope_threshold, anomaly_accident_surge,
    trend_up_threshold, trend_down_threshold,
    status, false, change_log || '新建版本',
    user?.id || null,
  ]);

  const item = camelKeys(result.rows[0]);
  item.statusLabel = MODEL_STATUS_MAP[result.rows[0].status] || result.rows[0].status;
  item.algorithmLabel = ALGORITHM_MAP[result.rows[0].algorithm] || result.rows[0].algorithm;

  return ok(item, '模型版本创建成功');
});

/** PUT /model-versions/:id - 更新预测模型版本（冻结版本不可修改） */
const modelVersionUpdate = async (params, body) => W(async () => {
  if (!isConnected()) return dbDown();

  const { id } = params;

  const existing = await pool.query(`
    SELECT id, is_frozen FROM hse_prediction_model_version
    WHERE id = $1 AND is_deleted = false
  `, [id]);

  if (existing.rows.length === 0) {
    return err(-2, '模型版本不存在');
  }

  if (existing.rows[0].is_frozen) {
    return err(-3, '已冻结的版本不可修改');
  }

  const updateFields = [];
  const paramsArr = [];
  let idx = 1;

  const allowedFields = [
    'prediction_cycle', 'parameters', 'confidence_method', 'confidence_min',
    'level_critical', 'level_major', 'level_minor',
    'anomaly_stddev_threshold', 'anomaly_slope_threshold', 'anomaly_accident_surge',
    'trend_up_threshold', 'trend_down_threshold',
    'status', 'change_log',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateFields.push(`${field} = $${idx++}`);
      if (field === 'parameters') {
        paramsArr.push(JSON.stringify(body[field]));
      } else {
        paramsArr.push(body[field]);
      }
    }
  }

  if (updateFields.length === 0) {
    return err(-2, '无更新内容');
  }

  paramsArr.push(id);
  const result = await pool.query(`
    UPDATE hse_prediction_model_version
    SET ${updateFields.join(', ')}, updated_at = NOW()
    WHERE id = $${idx} AND is_deleted = false
    RETURNING *
  `, paramsArr);

  const item = camelKeys(result.rows[0]);
  item.statusLabel = MODEL_STATUS_MAP[result.rows[0].status] || result.rows[0].status;

  return ok(item, '模型版本更新成功');
});

/** PUT /model-versions/:id/freeze - 冻结模型版本 */
const modelVersionFreeze = async (params) => W(async () => {
  if (!isConnected()) return dbDown();

  const { id } = params;

  const existing = await pool.query(`
    SELECT id, is_frozen, status FROM hse_prediction_model_version
    WHERE id = $1 AND is_deleted = false
  `, [id]);

  if (existing.rows.length === 0) {
    return err(-2, '模型版本不存在');
  }

  if (existing.rows[0].is_frozen) {
    return err(-3, '该版本已冻结');
  }

  const detail = await pool.query(`
    SELECT * FROM hse_prediction_model_version WHERE id = $1
  `, [id]);

  const v = detail.rows[0];
  if (!v.prediction_cycle || !v.level_critical || !v.level_major || !v.level_minor) {
    return err(-4, '配置不完整，无法冻结：缺少等级阈值');
  }

  const result = await pool.query(`
    UPDATE hse_prediction_model_version
    SET is_frozen = true, updated_at = NOW()
    WHERE id = $1 AND is_deleted = false
    RETURNING *
  `, [id]);

  const item = camelKeys(result.rows[0]);
  item.statusLabel = MODEL_STATUS_MAP[result.rows[0].status] || result.rows[0].status;

  return ok(item, '模型版本已冻结');
});

/** DELETE /model-versions/:id - 删除模型版本（软删除，冻结版本不可删除） */
const modelVersionDelete = async (params) => W(async () => {
  if (!isConnected()) return dbDown();

  const { id } = params;

  const existing = await pool.query(`
    SELECT id, is_frozen FROM hse_prediction_model_version
    WHERE id = $1 AND is_deleted = false
  `, [id]);

  if (existing.rows.length === 0) {
    return err(-2, '模型版本不存在');
  }

  if (existing.rows[0].is_frozen) {
    return err(-3, '已冻结的版本不可删除');
  }

  await pool.query(`
    UPDATE hse_prediction_model_version
    SET is_deleted = true, updated_at = NOW()
    WHERE id = $1 AND is_deleted = false
  `, [id]);

  return ok(null, '模型版本已删除');
});

// ============================================================
// Sprint8-A-1: 预测预警联动
// ============================================================

/** POST /predictions/:id/generate-warning - 预测预警联动 */
const generateWarning = async (params) => W(async () => {
  if (!isConnected()) return dbDown();

  const { id } = params;
  const prediction = await pool.query(`
    SELECT * FROM hse_risk_prediction WHERE id = $1 AND is_deleted = false
  `, [id]);

  if (prediction.rows.length === 0) {
    return err(-2, '预测记录不存在');
  }

  const pred = prediction.rows[0];

  if (pred.predicted_trend !== 'up' || !['critical', 'major'].includes(pred.predicted_risk_level)) {
    return err(-3, '当前预测无需生成预警（仅趋势上升+等级≥major生成）');
  }

  let warningRule = await getOrCreatePredictionRule();

  const existWarning = await pool.query(`
    SELECT id, warning_code FROM hse_warning_record
    WHERE source_type = 'prediction'
      AND target_type = $1
      AND target_id = $2
      AND status IN ('pending', 'processing')
      AND is_deleted = false
      AND created_at > NOW() - INTERVAL '7 days'
  `, [pred.target_type, pred.target_id]);

  if (existWarning.rows.length > 0) {
    return err(-4, `已存在未处理的预测预警：${existWarning.rows[0].warning_code}`);
  }

  const warningCode = generateCode('PW');
  const riskReason = `预测风险等级 ${pred.predicted_risk_level}，趋势${pred.predicted_trend === 'up' ? '上升' : '下降'}，预测分 ${pred.predicted_risk_score}，置信度 ${pred.predicted_confidence}%`;

  const warningResult = await pool.query(`
    INSERT INTO hse_warning_record (
      warning_code, rule_id, rule_name, source_type,
      warning_level, target_type, target_id, target_name,
      risk_reason, risk_data, status, created_at
    ) VALUES ($1, $2, $3, 'prediction', $4, $5, $6, $7, $8, $9, 'pending', NOW())
    RETURNING *
  `, [
    warningCode,
    warningRule.id,
    warningRule.rule_name,
    pred.predicted_risk_level === 'critical' ? 'critical' : 'major',
    pred.target_type,
    pred.target_id,
    pred.target_name,
    riskReason,
    JSON.stringify({
      prediction_id: pred.id,
      predicted_score: pred.predicted_risk_score,
      predicted_level: pred.predicted_risk_level,
      predicted_trend: pred.predicted_trend,
      confidence: pred.predicted_confidence,
      trend_slope: pred.trend_slope,
      contributing_factors: pred.contributing_factors,
    }),
  ]);

  const warningItem = camelKeys(warningResult.rows[0]);

  if (pred.target_id) {
    await createNotification({
      userId: pred.target_id,
      title: `预测预警：${warningCode}`,
      content: riskReason,
      type: 'system',
      bizType: 'prediction_warning',
      bizId: String(warningResult.rows[0].id),
    });
  }

  const linkResult = await pool.query(`
    UPDATE hse_risk_prediction
    SET prediction_note = COALESCE(prediction_note, '') || '；已生成预警: ${warningCode}',
        updated_at = NOW()
    WHERE id = $1 AND is_deleted = false
  `, [id]);

  return ok({
    warning: warningItem,
    prediction: camelKeys(linkResult.rows[0] || pred),
    message: `预测预警 ${warningCode} 已生成`,
  });
});

/** GET /prediction-warnings - 预测预警列表 */
const predictionWarnings = async (query) => W(async () => {
  if (!isConnected()) return dbDown();

  const { status, warning_level, page = 1, pageSize = 20 } = query;
  const conditions = ['source_type = \'prediction\'', 'is_deleted = false'];
  const params = [];
  let idx = 1;

  if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
  if (warning_level) { conditions.push(`warning_level = $${idx++}`); params.push(warning_level); }

  const whereClause = conditions.join(' AND ');
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM hse_warning_record WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  const listResult = await pool.query(`
    SELECT wr.*, wt.task_code, wt.status as task_status
    FROM hse_warning_record wr
    LEFT JOIN hse_warning_task wt ON wr.rectification_task_id = wt.id AND wt.is_deleted = false
    WHERE ${whereClause}
    ORDER BY wr.created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `, [...params, parseInt(pageSize), offset]);

  const levelLabel = { 'critical': '重大', 'major': '较大', 'minor': '一般', 'info': '提示' };
  const statusLabel = { 'pending': '待处理', 'processing': '处理中', 'resolved': '已解决', 'closed': '已关闭', 'ignored': '已忽略' };

  const list = listResult.rows.map(row => {
    const item = camelKeys(row);
    item.warningLevelLabel = levelLabel[row.warning_level] || row.warning_level;
    item.statusLabel = statusLabel[row.status] || row.status;
    return item;
  });

  return ok({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

/** GET /prediction-warnings/stats - 预测预警统计 */
const predictionWarningStats = async (query) => W(async () => {
  if (!isConnected()) return dbDown();

  const year = parseInt(query.year || new Date().getFullYear());
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const statsResult = await pool.query(`
    SELECT
      COUNT(*) AS total_warnings,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count,
      COUNT(CASE WHEN status = 'processing' THEN 1 END) AS processing_count,
      COUNT(CASE WHEN status = 'closed' THEN 1 END) AS closed_count,
      COUNT(CASE WHEN warning_level = 'critical' THEN 1 END) AS critical_count,
      COUNT(CASE WHEN warning_level = 'major' THEN 1 END) AS major_count,
      COUNT(CASE WHEN is_escalated = true THEN 1 END) AS escalated_count,
      ROUND(AVG(CASE
        WHEN status = 'closed' AND closed_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600.0
      END), 1) AS avg_close_hours
    FROM hse_warning_record
    WHERE source_type = 'prediction'
      AND is_deleted = false
      AND created_at >= $1
      AND created_at <= $2
  `, [yearStart, yearEnd]);

  const monthlyTrend = await pool.query(`
    SELECT
      DATE_TRUNC('month', created_at) AS month,
      COUNT(*) AS total,
      COUNT(CASE WHEN warning_level = 'critical' THEN 1 END) AS critical_count,
      COUNT(CASE WHEN warning_level = 'major' THEN 1 END) AS major_count
    FROM hse_warning_record
    WHERE source_type = 'prediction'
      AND is_deleted = false
      AND created_at >= $1
      AND created_at <= $2
    GROUP BY month ORDER BY month ASC
  `, [yearStart, yearEnd]);

  return ok({
    year,
    overview: camelKeys(statsResult.rows[0] || {}),
    monthlyTrend: monthlyTrend.rows.map(camelKeys),
  });
});

// ============================================================
// 预测预警联动辅助函数
// ============================================================

async function getOrCreatePredictionRule() {
  const existing = await pool.query(`
    SELECT * FROM hse_warning_rule
    WHERE rule_code = 'WR-PREDICT-001' AND is_deleted = false
  `);

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const newRule = await pool.query(`
    INSERT INTO hse_warning_rule (
      rule_code, rule_name, source_type, warning_level,
      target_type, condition_config, action_config,
      description, status, version
    ) VALUES (
      'WR-PREDICT-001',
      '预测风险升高预警',
      'prediction',
      'major',
      'employee',
      '{"condition": "predicted_trend=up AND predicted_level>=major"}'::jsonb,
      '{"action": "create_warning"}'::jsonb,
      '由风险预测模型v1.0自动生成，当预测风险等级升高至重大/较大时触发',
      'active',
      'v1.0'
    )
    RETURNING *
  `);

  return newRule.rows[0];
}

// ============================================================
// 导出
// ============================================================
module.exports = {
  riskTrend,
  riskTrendDetail,
  accidentTrend,
  accidentRepeat,
  rectificationAnalysis,
  orgPortrait,
  orgPortraitDetail,
  predict,
  predictions,
  predictionDetail,
  abnormal,
  modelVersions,
  modelVersionDetail,
  modelVersionActive,
  modelVersionCreate,
  modelVersionUpdate,
  modelVersionFreeze,
  modelVersionDelete,
  generateWarning,
  predictionWarnings,
  predictionWarningStats,
};