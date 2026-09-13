/**
 * HSE 员工风险画像（/api/hse/risk-profile）—— service 层
 * 承载全部业务逻辑与 SQL，无 express 依赖，可独立单测。
 *
 * 对外契约（与原 routes/hse-risk-profile.js 逐一等价）：
 *  - 成功：payload + message，由 controller 包装 success()。
 *  - 业务分支：返回 { notFound: true }（404 '员工不存在' / '配置不存在'）。
 *  - 非预期异常：函数内不捕获，抛给 controller 的 catch → res.json(error(-1, e.message))。
 *
 * ⚠️ 评分循环有两处，计算方法不同，必须各自忠实还原，不得合并：
 *  1) score(单员工 /:employeeId/score)：
 *     - 循环条件 `rule && rule.ranges`；无 ranges 时走兜底公式
 *       `score = rawValue >= 0 ? Math.max(0, config.max_score - rawValue * 10) : 0`。
 *     - dimensionDetails 含 indicator 字段，字段顺序为
 *       { indicator, raw_value, score, weight, applicable }。
 *     - 适度维度判断用 `profile.position_name && profile.position_name.includes('驾驶员')`。
 *  2) calculateAll(批量 POST /calculate-all)：
 *     - 循环条件 `rule?.ranges`；无 ranges 时 score 保持 0（无兜底公式）。
 *     - dimensionDetails 不含 indicator，字段顺序为
 *       { raw_value, score, weight, applicable }。
 *     - 适度维度判断用 `profile.position_name?.includes('驾驶员')`。
 */

const { pool } = require('../config/db');

/**
 * 员工风险画像列表（分页）
 * @returns {Promise<{rows: Array, count: number}>}
 */
async function list({ page = 1, pageSize = 20, org_unit_id, position_id, responsibility_type, keyword }) {
  const offset = (page - 1) * pageSize;
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (org_unit_id) {
    conditions.push(`o.id = $${paramIdx++}`);
    params.push(org_unit_id);
  }
  if (position_id) {
    conditions.push(`p.id = $${paramIdx++}`);
    params.push(position_id);
  }
  if (responsibility_type) {
    conditions.push(`r.responsibility_type = $${paramIdx++}`);
    params.push(responsibility_type);
  }
  if (keyword) {
    conditions.push(`(e.name ILIKE $${paramIdx} OR e.employee_code ILIKE $${paramIdx})`);
    params.push(`%${keyword}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';

  const countResult = await pool.query(
    `SELECT COUNT(DISTINCT e.id) as cnt
     FROM employee e
     JOIN employee_assignment er ON er.employee_id = e.id AND er.is_current = true AND er.is_deleted = false
     LEFT JOIN hse_org_unit o ON o.id = er.org_unit_id
     LEFT JOIN position p ON p.id = er.position_id
     LEFT JOIN hse_responsibility r ON r.employee_id = e.id AND r.is_deleted = false AND r.status = 'active'
     WHERE e.is_deleted = false ${whereClause}`,
    params
  );

  const listResult = await pool.query(
    `SELECT
       e.id as employee_id, e.employee_code, e.name, e.gender,
       o.org_name, ou.unit_name, ou.unit_type,
       p.name as position_name,
       r.responsibility_type, r.grid_level, r.grid_role,
       COALESCE(vs.cnt_12m, 0) as violation_count_12m,
       COALESCE(ts.compliance_rate, 0) as training_compliance_rate,
       COALESCE(a_s.accident_count, 0) as accident_count,
       COALESCE(hs.responsible_count, 0) as hazard_responsible_count,
       COALESCE(snap.total_score, 0) as risk_score,
       snap.risk_level
     FROM employee e
     JOIN employee_assignment er ON er.employee_id = e.id AND er.is_current = true AND er.is_deleted = false
     LEFT JOIN hse_org_unit o ON o.id = er.org_unit_id
     LEFT JOIN hse_operation_unit ou ON ou.id = er.operation_unit_id
     LEFT JOIN position p ON p.id = er.position_id
     LEFT JOIN hse_responsibility r ON r.employee_id = e.id AND r.is_deleted = false AND r.status = 'active'
     LEFT JOIN LATERAL (
       SELECT COUNT(*) as cnt_12m FROM violations v
       WHERE v.name = e.name AND v.violation_date >= CURRENT_DATE - INTERVAL '12 months'
     ) vs ON true
     LEFT JOIN LATERAL (
       SELECT compliance_rate FROM employee_training_status WHERE employee_id = e.id AND is_deleted = false LIMIT 1
     ) ts ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*) as accident_count FROM accidents WHERE is_deleted = false AND involved_person = e.name
     ) a_s ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*) as responsible_count FROM hazard_record WHERE is_deleted = false AND employee_id::bigint = e.id
     ) hs ON true
     LEFT JOIN hse_employee_risk_snapshot snap ON snap.employee_id = e.id AND snap.is_deleted = false
       AND snap.snapshot_date = (SELECT MAX(snapshot_date) FROM hse_employee_risk_snapshot WHERE employee_id = e.id AND is_deleted = false)
     WHERE e.is_deleted = false ${whereClause}
     ORDER BY COALESCE(snap.total_score, 0) ASC, e.id
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, Number(pageSize), Number(offset)]
  );

  return { rows: listResult.rows, count: parseInt(countResult.rows[0].cnt) };
}

/**
 * 员工风险画像详情
 * @returns {Promise<{notFound:true} | {notFound:false, payload:Object}>}
 */
async function detail(employeeId) {
  // 基础画像
  const profileResult = await pool.query(
    `SELECT * FROM v_employee_risk_profile WHERE employee_id = $1`,
    [employeeId]
  );
  if (profileResult.rows.length === 0) return { notFound: true };
  const profile = profileResult.rows[0];

  // 三违明细（近12个月）
  const violationResult = await pool.query(
    `SELECT v.violation_date, v.violation_type, v.description, v.punishment, v.amount, v.status, v.township
     FROM violations v
     WHERE v.name = $1
       AND v.violation_date >= CURRENT_DATE - INTERVAL '12 months'
     ORDER BY v.violation_date DESC`,
    [profile.name]
  );

  // 培训明细
  const trainingResult = await pool.query(
    `SELECT ts.compliance_rate, ts.compliance_status, ts.total_requirements,
            ts.completed_count, ts.pending_count, ts.expired_count,
            ts.last_training_date, ts.next_due_date
     FROM employee_training_status ts
     WHERE ts.employee_id = $1 AND ts.is_deleted = false
     LIMIT 1`,
    [employeeId]
  );

  // 三级安全教育
  const inductionResult = await pool.query(
    `SELECT overall_status, overall_result, qualified_date, expiry_date,
            company_level_status, department_level_status, team_level_status
     FROM employee_induction_training
     WHERE employee_id = $1 AND is_deleted = false
     LIMIT 1`,
    [employeeId]
  );

  // 事故明细
  const accidentResult = await pool.query(
    `SELECT a.accident_date, a.accident_type, a.description, a.responsibility_level,
            a.level, a.status, a.casualties, a.injuries, a.loss_amount
     FROM accidents a
     WHERE a.is_deleted = false
       AND (a.involved_person = $1 OR a.personnel_id::bigint = $2)
     ORDER BY a.accident_date DESC`,
    [profile.name, employeeId]
  );

  // 隐患明细
  const hazardResult = await pool.query(
    `SELECT hr.hazard_code, hr.hazard_level, hr.hazard_category, hr.description,
            hr.location, hr.status, hr.deadline_date, hr.actual_completion_date
     FROM hazard_record hr
     WHERE hr.is_deleted = false
       AND (hr.employee_id::bigint = $1 OR hr.responsible_id::bigint = $1)
     ORDER BY hr.created_at DESC`,
    [employeeId]
  );

  // 驾驶员信息（仅驾驶员岗位）—— 注意：此处同时含 '驾驶员' 与 '司机'
  let traffic = null;
  const isDriver = profile.position_name && (
    profile.position_name.includes('驾驶员') || profile.position_name.includes('司机')
  );
  if (isDriver) {
    traffic = {
      is_driver: true,
      position_name: profile.position_name,
      traffic_accidents: accidentResult.rows.filter(a =>
        a.accident_type === '交通事故' || a.accident_type === '交通'
      ),
      traffic_violations: violationResult.rows.filter(v =>
        v.violation_type && (v.violation_type.includes('交通') || v.violation_type.includes('驾驶'))
      )
    };
  }

  // 网格巡查（仅 grid_leader）
  let patrol = null;
  if (profile.responsibility_type === 'grid_leader') {
    const patrolResult = await pool.query(
      `SELECT ga.grid_code, ga.name, ga.grid_level, ga.completion_rate, ga.patrol_frequency
       FROM grid_areas ga
       WHERE ga.personnel_id = $1 AND ga.is_deleted = false`,
      [employeeId]
    );
    patrol = patrolResult.rows;
  }

  // 最新评分快照
  const scoreResult = await pool.query(
    `SELECT total_score, risk_level, dimension_scores, dimension_details, calculated_at
     FROM hse_employee_risk_snapshot
     WHERE employee_id = $1 AND is_deleted = false
     ORDER BY snapshot_date DESC LIMIT 1`,
    [employeeId]
  );

  return {
    notFound: false,
    payload: {
      profile,
      violations: violationResult.rows,
      training: trainingResult.rows[0] || null,
      induction: inductionResult.rows[0] || null,
      accidents: accidentResult.rows,
      hazards: hazardResult.rows,
      traffic,
      patrol,
      score: scoreResult.rows[0] || null
    }
  };
}

/** 单员工评分配置查询（共享） */
async function loadActiveConfig() {
  const configResult = await pool.query(
    `SELECT * FROM hse_risk_score_config WHERE is_deleted = false AND status = 'active' ORDER BY risk_dimension`
  );
  return configResult.rows;
}

/**
 * 风险评分计算（单员工）—— 完整还原原 routes/hse-risk-profile.js /:employeeId/score 逻辑
 * 差异见文件顶部注释第 1 条。
 */
async function score(employeeId) {
  const profileResult = await pool.query(
    `SELECT * FROM v_employee_risk_profile WHERE employee_id = $1`,
    [employeeId]
  );
  if (profileResult.rows.length === 0) return { notFound: true };
  const profile = profileResult.rows[0];

  const configs = await loadActiveConfig();

  const dimensionScores = {};
  const dimensionDetails = {};
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const config of configs) {
    const dim = config.risk_dimension;
    let rawValue = 0;

    switch (config.indicator_code) {
      case 'violation_count':
        rawValue = profile.violation_count_12m || 0;
        break;
      case 'training_rate':
        rawValue = parseFloat(profile.training_compliance_rate) || 0;
        break;
      case 'accident_count':
        rawValue = profile.accident_count || 0;
        break;
      case 'hazard_count':
        rawValue = profile.hazard_responsible_count || 0;
        break;
      case 'traffic_violation': {
        const isDriver = profile.position_name && profile.position_name.includes('驾驶员');
        rawValue = isDriver ? (profile.violation_count_12m || 0) : -1;
        break;
      }
      case 'patrol_rate': {
        const isGridLeader = profile.responsibility_type === 'grid_leader';
        rawValue = isGridLeader ? (parseFloat(profile.patrol_completion_rate) || 0) : -1;
        break;
      }
    }

    let dimScore = 0;
    if (rawValue === -1) {
      dimScore = -1;
    } else {
      const rule = config.score_rule;
      if (rule && rule.ranges) {
        for (const range of rule.ranges) {
          const min = range.min !== undefined ? range.min : -Infinity;
          const max = range.max !== undefined ? range.max : Infinity;
          if (rawValue >= min && rawValue <= max) { dimScore = range.score; break; }
        }
      } else {
        dimScore = rawValue >= 0 ? Math.max(0, config.max_score - rawValue * 10) : 0;
      }
    }

    dimensionScores[dim] = dimScore;
    dimensionDetails[dim] = {
      indicator: config.indicator_code,
      raw_value: rawValue,
      score: dimScore,
      weight: parseFloat(config.weight),
      applicable: dimScore !== -1
    };

    if (dimScore !== -1) {
      totalWeightedScore += dimScore * parseFloat(config.weight);
      totalWeight += parseFloat(config.weight);
    }
  }

  const totalScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;

  // 确定风险等级
  let riskLevel = 'low';
  if (totalScore < 40) riskLevel = 'critical';
  else if (totalScore < 60) riskLevel = 'high';
  else if (totalScore < 80) riskLevel = 'medium';

  // 保存评分快照
  await pool.query(
    `INSERT INTO hse_employee_risk_snapshot
       (employee_id, snapshot_date, total_score, risk_level, dimension_scores, dimension_details)
     VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
     ON CONFLICT (employee_id, snapshot_date)
     DO UPDATE SET total_score = $2, risk_level = $3, dimension_scores = $4,
                   dimension_details = $5, calculated_at = CURRENT_TIMESTAMP`,
    [employeeId, totalScore, riskLevel,
     JSON.stringify(dimensionScores), JSON.stringify(dimensionDetails)]
  );

  return {
    notFound: false,
    employeeId,
    totalScore,
    riskLevel,
    dimensionScores,
    dimensionDetails
  };
}

/** 风险统计概览 */
async function riskStats() {
  const stats = await pool.query(
    `SELECT
       COUNT(DISTINCT e.id) as total_employees,
       COUNT(DISTINCT e.id) FILTER (WHERE r.responsibility_type = 'grid_leader') as grid_leader_count,
       COUNT(DISTINCT e.id) FILTER (WHERE r.responsibility_type = 'production_manager') as production_manager_count,
       COUNT(DISTINCT e.id) FILTER (WHERE p.name LIKE '%驾驶员%') as driver_count,
       COUNT(DISTINCT CASE WHEN vs.cnt > 0 THEN e.id END) as employees_with_violations,
       COUNT(DISTINCT CASE WHEN a_s.cnt > 0 THEN e.id END) as employees_with_accidents
     FROM employee e
     JOIN employee_assignment er ON er.employee_id = e.id AND er.is_current = true AND er.is_deleted = false
     LEFT JOIN position p ON p.id = er.position_id
     LEFT JOIN hse_responsibility r ON r.employee_id = e.id AND r.is_deleted = false AND r.status = 'active'
     LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM violations WHERE name = e.name AND violation_date >= CURRENT_DATE - INTERVAL '12 months') vs ON true
     LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM accidents WHERE is_deleted = false AND involved_person = e.name) a_s ON true
     WHERE e.is_deleted = false`
  );

  // 风险等级分布
  const riskDist = await pool.query(
    `SELECT risk_level, COUNT(*) as cnt
     FROM hse_employee_risk_snapshot
     WHERE is_deleted = false AND snapshot_date = (SELECT MAX(snapshot_date) FROM hse_employee_risk_snapshot WHERE is_deleted = false)
     GROUP BY risk_level`
  );

  return { overview: stats.rows[0], riskDistribution: riskDist.rows };
}

/** 评分配置列表 */
async function scoreConfig() {
  const result = await pool.query(
    `SELECT * FROM hse_risk_score_config WHERE is_deleted = false ORDER BY risk_dimension`
  );
  return result.rows;
}

/**
 * 更新评分配置
 * @returns {Promise<{notFound:true} | {notFound:false, row:Object}>}
 */
async function updateScoreConfig(id, body) {
  const { weight, score_rule, status } = body;
  const result = await pool.query(
    `UPDATE hse_risk_score_config
     SET weight = COALESCE($1, weight),
         score_rule = COALESCE($2, score_rule),
         status = COALESCE($3, status),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4 AND is_deleted = false
     RETURNING *`,
    [weight, score_rule ? JSON.stringify(score_rule) : null, status, id]
  );
  if (result.rows.length === 0) return { notFound: true };
  return { notFound: false, row: result.rows[0] };
}

/**
 * 批量计算所有员工评分 —— 完整还原原 routes/hse-risk-profile.js POST /calculate-all 逻辑
 * 差异见文件顶部注释第 2 条。
 */
async function calculateAll() {
  const employees = await pool.query(
    `SELECT e.id FROM employee e
     JOIN employee_assignment er ON er.employee_id = e.id AND er.is_current = true AND er.is_deleted = false
     WHERE e.is_deleted = false
     GROUP BY e.id`
  );

  let calculated = 0;
  for (const emp of employees.rows) {
    const profileResult = await pool.query(`SELECT * FROM v_employee_risk_profile WHERE employee_id = $1`, [emp.id]);
    if (profileResult.rows.length === 0) continue;
    const profile = profileResult.rows[0];

    const configResult = await pool.query(
      `SELECT * FROM hse_risk_score_config WHERE is_deleted = false AND status = 'active'`
    );

    let totalWeightedScore = 0, totalWeight = 0;
    const dimScores = {}, dimDetails = {};

    for (const config of configResult.rows) {
      const dim = config.risk_dimension;
      let rawValue = 0;
      switch (config.indicator_code) {
        case 'violation_count': rawValue = profile.violation_count_12m || 0; break;
        case 'training_rate': rawValue = parseFloat(profile.training_compliance_rate) || 0; break;
        case 'accident_count': rawValue = profile.accident_count || 0; break;
        case 'hazard_count': rawValue = profile.hazard_responsible_count || 0; break;
        case 'traffic_violation': rawValue = profile.position_name?.includes('驾驶员') ? (profile.violation_count_12m || 0) : -1; break;
        case 'patrol_rate': rawValue = profile.responsibility_type === 'grid_leader' ? (parseFloat(profile.patrol_completion_rate) || 0) : -1; break;
      }
      let dimScore = 0;
      if (rawValue === -1) { dimScore = -1; }
      else {
        const rule = config.score_rule;
        if (rule?.ranges) {
          for (const range of rule.ranges) {
            const min = range.min ?? -Infinity, max = range.max ?? Infinity;
            if (rawValue >= min && rawValue <= max) { dimScore = range.score; break; }
          }
        }
      }
      dimScores[dim] = dimScore;
      dimDetails[dim] = { raw_value: rawValue, score: dimScore, weight: parseFloat(config.weight), applicable: dimScore !== -1 };
      if (dimScore !== -1) { totalWeightedScore += dimScore * parseFloat(config.weight); totalWeight += parseFloat(config.weight); }
    }

    const totalScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;
    let riskLevel = 'low';
    if (totalScore < 40) riskLevel = 'critical';
    else if (totalScore < 60) riskLevel = 'high';
    else if (totalScore < 80) riskLevel = 'medium';

    await pool.query(
      `INSERT INTO hse_employee_risk_snapshot (employee_id, snapshot_date, total_score, risk_level, dimension_scores, dimension_details)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
       ON CONFLICT (employee_id, snapshot_date) DO UPDATE SET total_score = $2, risk_level = $3, dimension_scores = $4, dimension_details = $5, calculated_at = CURRENT_TIMESTAMP`,
      [emp.id, totalScore, riskLevel, JSON.stringify(dimScores), JSON.stringify(dimDetails)]
    );
    calculated++;
  }

  return { calculated, total: employees.rows.length };
}

module.exports = {
  list,
  detail,
  score,
  riskStats,
  scoreConfig,
  updateScoreConfig,
  calculateAll,
};