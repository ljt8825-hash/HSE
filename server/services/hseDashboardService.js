/**
 * HSE 综合驾驶舱（/api/hse/dashboard）—— service 层
 * Sprint6.3-B-1，7 个只读查询端点；业务 + SQL 全在此。
 *
 * 描述符语义（非标准 success/error，忠实复刻原文件响应形状）：
 *  - ok(data, message)                            → controller res.json({ success:true, data, message })
 *  - boom(httpStatus, message[, data])            → controller res.status(httpStatus).json({ success:false, message })
 * 未捕获异常：外抛 → controller 兜底 res.status(500).json({ success:false, message: err.message })
 *               （等价原文件每个端点 try/catch → res.status(500).json(...)）。
 *
 * 特注：原文件响应**不含 code 字段**，且失败时缺失 data——本域不套用 middleware/response
 * 的 success()/error()，由 controller 按原形状输出，保证契约逐位一致。
 */
const { pool } = require('../config/db');

const ok = (data, message) => ({ __t: 'hse-dash', ok: true, data, message });
const boom = (httpStatus, message, data) => ({ __t: 'hse-dash', ok: false, httpStatus, message, data });

// 1. 驾驶舱总览
async function overview() {
  // 员工总数（通过employee_assignment统计）
  const totalResult = await pool.query(`
    SELECT COUNT(DISTINCT ea.employee_id) as total
    FROM employee_assignment ea
    WHERE ea.is_current = true AND ea.is_deleted = false
  `);

  // 已评估人数
  const evaluatedResult = await pool.query(`
    SELECT COUNT(DISTINCT employee_id) as cnt
    FROM risk_level_records
    WHERE is_active = true AND is_deleted = false
  `);

  // 风险等级分布
  const levelResult = await pool.query(`
    SELECT rlc.level_code, rlc.level_name, rlc.color_code,
           COUNT(rlr.employee_id) as count
    FROM risk_level_config rlc
    LEFT JOIN risk_level_records rlr ON rlc.level_code = rlr.risk_level_code 
      AND rlr.is_active = true AND rlr.is_deleted = false
    WHERE rlc.is_enabled = true AND rlc.is_deleted = false
    GROUP BY rlc.level_code, rlc.level_name, rlc.color_code, rlc.level_order
    ORDER BY rlc.level_order
  `);

  const levels = {};
  let criticalCount = 0;
  let highCount = 0;
  levelResult.rows.forEach(r => {
    levels[r.level_code] = { name: r.level_name, count: parseInt(r.count), color: r.color_code };
    if (r.level_code === 'critical') criticalCount = parseInt(r.count);
    if (r.level_code === 'high') highCount = parseInt(r.count);
  });

  // 风险改善率（近30天）
  const improvementResult = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE level_change = 'level_down') as improved_count,
      COUNT(*) as total_count
    FROM risk_level_records
    WHERE valid_from >= CURRENT_DATE - INTERVAL '30 days'
      AND is_deleted = false
  `);

  const improvement = improvementResult.rows[0];
  const improvementRate = improvement.total_count > 0
    ? parseFloat((improvement.improved_count * 100.0 / improvement.total_count).toFixed(2))
    : 0;

  const totalEmployees = parseInt(totalResult.rows[0].total);
  const evaluatedCount = parseInt(evaluatedResult.rows[0].cnt);
  const highRiskCount = criticalCount + highCount;
  const highRiskRatio = evaluatedCount > 0
    ? parseFloat((highRiskCount * 100.0 / evaluatedCount).toFixed(2))
    : 0;

  return ok({
    totalEmployees,
    evaluatedCount,
    criticalRiskCount: criticalCount,
    highRiskCount,
    highRiskRatio,
    improvementRate,
    levelDistribution: levels,
    avgScore: null
  }, '查询成功');
}

// 2. 风险等级分布
async function levelDistribution() {
  const result = await pool.query(`
    SELECT rlc.level_code, rlc.level_name, rlc.color_code, rlc.min_score, rlc.max_score,
           COUNT(rlr.employee_id) as count,
           ROUND(COUNT(rlr.employee_id) * 100.0 / NULLIF(SUM(COUNT(rlr.employee_id)) OVER (), 0), 2) as ratio
    FROM risk_level_config rlc
    LEFT JOIN risk_level_records rlr ON rlc.level_code = rlr.risk_level_code 
      AND rlr.is_active = true AND rlr.is_deleted = false
    WHERE rlc.is_enabled = true AND rlc.is_deleted = false
    GROUP BY rlc.level_code, rlc.level_name, rlc.color_code, rlc.min_score, rlc.max_score, rlc.level_order
    ORDER BY rlc.level_order
  `);

  const total = result.rows.reduce((sum, r) => sum + parseInt(r.count), 0);

  return ok({
    levels: result.rows.map(r => ({
      levelCode: r.level_code,
      levelName: r.level_name,
      colorCode: r.color_code,
      minScore: parseFloat(r.min_score),
      maxScore: parseFloat(r.max_score),
      count: parseInt(r.count),
      ratio: parseFloat(r.ratio) || 0
    })),
    total
  }, '查询成功');
}

// 3. 风险类型分析
async function riskTypeAnalysis() {
  // 各风险类型平均积分和高风险人数（单项等级：积分>=51为高风险）
  const result = await pool.query(`
    SELECT 
      ROUND(AVG(violation_score), 2) as violation_avg,
      COUNT(*) FILTER (WHERE violation_score >= 51) as violation_high,
      ROUND(AVG(driver_compliance_score), 2) as driver_avg,
      COUNT(*) FILTER (WHERE driver_compliance_score >= 51) as driver_high,
      ROUND(AVG(training_compliance_score), 2) as training_avg,
      COUNT(*) FILTER (WHERE training_compliance_score >= 51) as training_high,
      ROUND(AVG(incident_score), 2) as incident_avg,
      COUNT(*) FILTER (WHERE incident_score >= 51) as incident_high,
      ROUND(AVG(management_execution_score), 2) as management_avg,
      COUNT(*) FILTER (WHERE management_execution_score >= 51) as management_high,
      COUNT(*) as total_count
    FROM risk_score_records r
    WHERE r.is_deleted = false
      AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id)
  `);

  const row = result.rows[0];

  // 补充统计：三违违规总数、事故总数、驾驶员人数
  const violationCount = await pool.query(`
    SELECT COUNT(*) as cnt FROM violation_records
    WHERE is_deleted = false AND violation_date >= CURRENT_DATE - INTERVAL '12 months'
  `);

  const incidentCount = await pool.query(`
    SELECT COUNT(*) as cnt, 
           COUNT(*) FILTER (WHERE level = '重大') as major_count,
           COUNT(*) FILTER (WHERE casualties > 0 OR injuries > 0) as casualty_count
    FROM hse_incident_records WHERE is_deleted = false
  `);

  const driverCount = await pool.query(`
    SELECT COUNT(DISTINCT ea.employee_id) as cnt
    FROM employee_assignment ea
    JOIN position p ON ea.position_id = p.id
    WHERE (p.name LIKE '%驾驶员%' OR p.name LIKE '%司机%')
      AND ea.is_current = true AND ea.is_deleted = false
  `);

  // 培训数据（通过v_training_records视图统一employee_id）
  const trainingStats = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE result = '合格') as qualified,
      COUNT(DISTINCT employee_id) FILTER (WHERE result != '合格') as uncompleted_persons
    FROM v_training_records
  `);

  return ok({
    riskTypes: [
      {
        typeCode: 'violation',
        typeName: '三违风险',
        avgScore: parseFloat(row.violation_avg) || 0,
        highRiskCount: parseInt(row.violation_high) || 0,
        extra: { totalViolations: parseInt(violationCount.rows[0].cnt) }
      },
      {
        typeCode: 'driver_compliance',
        typeName: '驾驶风险',
        avgScore: parseFloat(row.driver_avg) || 0,
        highRiskCount: parseInt(row.driver_high) || 0,
        extra: { driverCount: parseInt(driverCount.rows[0].cnt) }
      },
      {
        typeCode: 'incident',
        typeName: '事故风险',
        avgScore: parseFloat(row.incident_avg) || 0,
        highRiskCount: parseInt(row.incident_high) || 0,
        extra: {
          totalIncidents: parseInt(incidentCount.rows[0].cnt),
          majorIncidents: parseInt(incidentCount.rows[0].major_count) || 0,
          casualtyIncidents: parseInt(incidentCount.rows[0].casualty_count) || 0
        }
      },
      {
        typeCode: 'training_compliance',
        typeName: '培训风险',
        avgScore: parseFloat(row.training_avg) || 0,
        highRiskCount: parseInt(row.training_high) || 0,
        extra: {
          totalTrainings: parseInt(trainingStats.rows[0].total),
          qualifiedCount: parseInt(trainingStats.rows[0].qualified),
          uncompletedPersons: parseInt(trainingStats.rows[0].uncompleted_persons) || 0
        }
      },
      {
        typeCode: 'management_execution',
        typeName: '管理履职风险',
        avgScore: parseFloat(row.management_avg) || 0,
        highRiskCount: parseInt(row.management_high) || 0,
        extra: {}
      }
    ],
    totalEvaluated: parseInt(row.total_count)
  }, '查询成功');
}

// 4. 风险TOP
async function riskTop(query) {
  const limit = parseInt(query.limit) || 10;

  // TOP10风险员工
  const topEmployees = await pool.query(`
    SELECT r.employee_id, r.employee_code, r.employee_name, r.position_name,
           r.final_score, r.risk_level, r.risk_level_code,
           r.violation_score, r.driver_compliance_score, r.training_compliance_score,
           r.incident_score, r.management_execution_score
    FROM risk_score_records r
    WHERE r.is_deleted = false
      AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id)
    ORDER BY r.final_score DESC
    LIMIT $1
  `, [limit]);

  // TOP5风险部门
  const topDepartments = await pool.query(`
    SELECT ou.id as org_id, ou.org_name as dept_name,
           ROUND(AVG(r.final_score), 2) as avg_score,
           COUNT(*) FILTER (WHERE r.risk_level_code IN ('high','critical')) as high_risk_count,
           COUNT(*) as total_count
    FROM risk_score_records r
    JOIN employee_assignment ea ON r.employee_id = ea.employee_id 
      AND ea.is_current = true AND ea.is_deleted = false
    JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
    WHERE r.is_deleted = false
      AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id)
    GROUP BY ou.id, ou.org_name
    ORDER BY avg_score DESC
    LIMIT 5
  `);

  // TOP5风险作业单元
  const topUnits = await pool.query(`
    SELECT ou.id as unit_id, ou.org_name as unit_name,
           ROUND(AVG(r.final_score), 2) as avg_score,
           COUNT(*) FILTER (WHERE r.risk_level_code IN ('high','critical')) as high_risk_count,
           COUNT(*) as total_count
    FROM risk_score_records r
    JOIN employee_assignment ea ON r.employee_id = ea.employee_id 
      AND ea.is_current = true AND ea.is_deleted = false
    JOIN hse_org_unit ou ON ea.operation_unit_id = ou.id AND ou.is_deleted = false
    WHERE r.is_deleted = false
      AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id)
      AND ea.operation_unit_id IS NOT NULL
    GROUP BY ou.id, ou.org_name
    ORDER BY avg_score DESC
    LIMIT 5
  `);

  return ok({
    topEmployees: topEmployees.rows.map(r => ({
      employeeId: parseInt(r.employee_id),
      employeeCode: r.employee_code,
      employeeName: r.employee_name,
      positionName: r.position_name,
      finalScore: parseFloat(r.final_score),
      riskLevel: r.risk_level,
      riskLevelCode: r.risk_level_code,
      scores: {
        violation: parseFloat(r.violation_score),
        driverCompliance: parseFloat(r.driver_compliance_score),
        trainingCompliance: parseFloat(r.training_compliance_score),
        incident: parseFloat(r.incident_score),
        managementExecution: parseFloat(r.management_execution_score)
      }
    })),
    topDepartments: topDepartments.rows.map(r => ({
      orgId: parseInt(r.org_id),
      orgName: r.dept_name,
      avgScore: parseFloat(r.avg_score),
      highRiskCount: parseInt(r.high_risk_count),
      totalCount: parseInt(r.total_count)
    })),
    topOperationUnits: topUnits.rows.map(r => ({
      unitId: parseInt(r.unit_id),
      unitName: r.unit_name,
      avgScore: parseFloat(r.avg_score),
      highRiskCount: parseInt(r.high_risk_count),
      totalCount: parseInt(r.total_count)
    }))
  }, '查询成功');
}

// 5. 风险趋势
async function riskTrend(query) {
  const period = query.period || 'daily';
  const metric = query.metric || 'total';

  // 根据period设置默认时间范围
  let defaultDays;
  switch (period) {
    case 'weekly': defaultDays = 84; break;
    case 'monthly': defaultDays = 365; break;
    default: defaultDays = 30; break;
  }

  const metricMap = {
    total: 'total_score',
    violation: 'violation_score',
    driver: 'driver_compliance_score',
    training: 'training_compliance_score',
    incident: 'incident_score',
    management: 'management_execution_score'
  };
  const metricField = metricMap[metric] || 'total_score';

  const trend = await pool.query(`
    SELECT calculate_date,
           ROUND(AVG(${metricField}), 2) as avg_score,
           COUNT(*) as employee_count,
           COUNT(*) FILTER (WHERE risk_level_code IN ('high','critical')) as high_risk_count
    FROM risk_score_history
    WHERE calculate_period = $1
      AND calculate_date >= CURRENT_DATE - INTERVAL '${defaultDays} days'
      AND is_deleted = false
    GROUP BY calculate_date
    ORDER BY calculate_date
  `, [period]);

  // 等级分布趋势
  const levelTrend = await pool.query(`
    SELECT calculate_date,
           risk_level_code,
           COUNT(*) as count
    FROM risk_score_history
    WHERE calculate_period = $1
      AND calculate_date >= CURRENT_DATE - INTERVAL '${defaultDays} days'
      AND is_deleted = false
    GROUP BY calculate_date, risk_level_code
    ORDER BY calculate_date, risk_level_code
  `, [period]);

  return ok({
    period,
    metric,
    trend: trend.rows.map(r => ({
      date: r.calculate_date,
      avgScore: parseFloat(r.avg_score) || 0,
      employeeCount: parseInt(r.employee_count),
      highRiskCount: parseInt(r.high_risk_count)
    })),
    levelTrend: levelTrend.rows.map(r => ({
      date: r.calculate_date,
      levelCode: r.risk_level_code,
      count: parseInt(r.count)
    }))
  }, '查询成功');
}

// 6. 管理履职
async function managementExecution(query) {
  const days = parseInt(query.days) || 30;
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - days);
  const daysAgoStr = daysAgo.toISOString().split('T')[0];

  // 巡查完成率（执行指标）
  const completionResult = await pool.query(`
    SELECT gi.grid_level,
           COUNT(*) as actual_count,
           CASE 
             WHEN gi.grid_level = 'chief' THEN CEIL(${days}/3.0)
             WHEN gi.grid_level = 'level1' THEN CEIL(${days}/2.0)
             WHEN gi.grid_level IN ('level2','level3') THEN ${days}
           END as expected_count
    FROM hse_grid_inspection_records gi
    WHERE gi.inspection_date >= $1
      AND gi.is_deleted = false
    GROUP BY gi.grid_level
    ORDER BY gi.grid_level
  `, [daysAgoStr]);

  // 问题发现率（质量指标）
  const qualityResult = await pool.query(`
    SELECT gi.grid_level,
           COUNT(*) as total_inspections,
           COUNT(*) FILTER (WHERE gi.problems_found IS NOT NULL AND gi.problems_found != '') as problem_count
    FROM hse_grid_inspection_records gi
    WHERE gi.inspection_date >= $1
      AND gi.is_deleted = false
    GROUP BY gi.grid_level
    ORDER BY gi.grid_level
  `, [daysAgoStr]);

  // 整改完成率（闭环指标）
  const closureResult = await pool.query(`
    SELECT gi.grid_level,
           COUNT(*) FILTER (WHERE gi.problems_found IS NOT NULL AND gi.problems_found != '') as total_problems,
           COUNT(*) FILTER (WHERE gi.rectification_status = 'completed') as completed_count,
           COUNT(*) FILTER (WHERE gi.rectification_status = 'pending') as pending_count,
           COUNT(*) FILTER (WHERE gi.rectification_status = 'overdue') as overdue_count
    FROM hse_grid_inspection_records gi
    WHERE gi.inspection_date >= $1
      AND gi.is_deleted = false
    GROUP BY gi.grid_level
    ORDER BY gi.grid_level
  `, [daysAgoStr]);

  // 汇总统计
  const summaryResult = await pool.query(`
    SELECT 
      COUNT(*) as total_inspections,
      COUNT(*) FILTER (WHERE problems_found IS NOT NULL AND problems_found != '') as total_problems,
      COUNT(*) FILTER (WHERE rectification_status = 'completed') as completed_count,
      COUNT(*) FILTER (WHERE rectification_status = 'overdue') as overdue_count
    FROM hse_grid_inspection_records
    WHERE inspection_date >= $1 AND is_deleted = false
  `, [daysAgoStr]);

  const summary = summaryResult.rows[0];
  const totalInspections = parseInt(summary.total_inspections) || 0;
  const totalProblems = parseInt(summary.total_problems) || 0;
  const completedCount = parseInt(summary.completed_count) || 0;
  const overdueCount = parseInt(summary.overdue_count) || 0;

  const problemFoundRate = totalInspections > 0
    ? parseFloat((totalProblems * 100.0 / totalInspections).toFixed(2)) : 0;
  const rectificationRate = totalProblems > 0
    ? parseFloat((completedCount * 100.0 / totalProblems).toFixed(2)) : 0;

  return ok({
    summary: {
      totalInspections,
      totalProblems,
      completedCount,
      overdueCount,
      problemFoundRate,
      rectificationRate
    },
    execution: {
      title: '巡查完成率（执行指标）',
      gridLevels: completionResult.rows.map(r => ({
        gridLevel: r.grid_level,
        actualCount: parseInt(r.actual_count),
        expectedCount: parseInt(r.expected_count),
        completionRate: parseInt(r.expected_count) > 0
          ? parseFloat((parseInt(r.actual_count) * 100.0 / parseInt(r.expected_count)).toFixed(2)) : 0
      }))
    },
    quality: {
      title: '问题发现率（质量指标）',
      gridLevels: qualityResult.rows.map(r => ({
        gridLevel: r.grid_level,
        totalInspections: parseInt(r.total_inspections),
        problemCount: parseInt(r.problem_count),
        problemFoundRate: parseInt(r.total_inspections) > 0
          ? parseFloat((parseInt(r.problem_count) * 100.0 / parseInt(r.total_inspections)).toFixed(2)) : 0
      }))
    },
    closure: {
      title: '整改完成率（闭环指标）',
      gridLevels: closureResult.rows.map(r => ({
        gridLevel: r.grid_level,
        totalProblems: parseInt(r.total_problems),
        completedCount: parseInt(r.completed_count),
        pendingCount: parseInt(r.pending_count),
        overdueCount: parseInt(r.overdue_count),
        rectificationRate: parseInt(r.total_problems) > 0
          ? parseFloat((parseInt(r.completed_count) * 100.0 / parseInt(r.total_problems)).toFixed(2)) : 0
      }))
    }
  }, '查询成功');
}

// 7. 风险等级配置
async function riskLevelConfig() {
  const result = await pool.query(`
    SELECT level_code, level_name, level_order, min_score, max_score, color_code, description
    FROM risk_level_config
    WHERE is_enabled = true AND is_deleted = false
    ORDER BY level_order
  `);

  return ok(result.rows.map(r => ({
    levelCode: r.level_code,
    levelName: r.level_name,
    levelOrder: r.level_order,
    minScore: parseFloat(r.min_score),
    maxScore: parseFloat(r.max_score),
    colorCode: r.color_code,
    description: r.description
  })), '查询成功');
}

module.exports = {
  overview,
  levelDistribution,
  riskTypeAnalysis,
  riskTop,
  riskTrend,
  managementExecution,
  riskLevelConfig,
};