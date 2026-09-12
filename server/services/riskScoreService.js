/**
 * Sprint6.2 风险评分计算服务
 * 
 * 核心功能：
 *   1. 查询员工岗位信息和责任信息
 *   2. 查询各风险类型事实数据
 *   3. 计算各风险类型积分
 *   4. 应用岗位权重计算总分
 *   5. 检查特殊规则和特殊加权
 *   6. 确定风险等级
 *   7. 保存评分记录和等级记录
 * 
 * 冻结规则依据：Sprint6.1-H-2 风险模型最终冻结报告
 */

const { pool } = require('../config/db');

const FROZEN_WEIGHT_MATRIX = {
  driver: {
    violation: 0.20,
    driver_compliance: 0.35,
    training_compliance: 0.15,
    incident: 0.30,
    management_execution: 0.00
  },
  normal: {
    violation: 0.35,
    driver_compliance: 0.00,
    training_compliance: 0.25,
    incident: 0.40,
    management_execution: 0.00
  },
  management: {
    frontline: {
      violation: 0.20,
      driver_compliance: 0.00,
      training_compliance: 0.15,
      incident: 0.25,
      management_execution: 0.40
    },
    middle: {
      violation: 0.15,
      driver_compliance: 0.00,
      training_compliance: 0.20,
      incident: 0.25,
      management_execution: 0.40
    },
    high: {
      violation: 0.10,
      driver_compliance: 0.00,
      training_compliance: 0.20,
      incident: 0.25,
      management_execution: 0.45
    }
  }
};

const ACCIDENT_TYPE_WEIGHTS = {
  '生产安全事故': 1.0,
  '交通事故': 0.8,
  '环境污染事故': 0.7
};

const GRID_INSPECTION_INTERVALS = {
  '总网格长': 3,
  '一级网格长': 2,
  '二级网格长': 1,
  '三级网格长': 1
};

const getWeights = (riskCategory, managementLevel) => {
  if (riskCategory === 'management') {
    return FROZEN_WEIGHT_MATRIX.management[managementLevel] || FROZEN_WEIGHT_MATRIX.management.frontline;
  }
  return FROZEN_WEIGHT_MATRIX[riskCategory] || FROZEN_WEIGHT_MATRIX.normal;
};

const determineRiskLevel = (score) => {
  if (score >= 76) return { level: '重大风险', code: 'critical' };
  if (score >= 51) return { level: '较高风险', code: 'high' };
  if (score >= 26) return { level: '一般风险', code: 'medium' };
  return { level: '低风险', code: 'low' };
};

const calculateViolationScore = async (employeeId) => {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const twelveMonthsAgoStr = twelveMonthsAgo.toISOString().split('T')[0];

  const result = await pool.query(
    `SELECT violation_type, violation_level, status
     FROM violation_records
     WHERE violator_id = $1
       AND is_deleted = false
       AND violation_date >= $2`,
    [employeeId, twelveMonthsAgoStr]
  );

  const violations = result.rows;
  const count = violations.length;

  let countScore = Math.min(40, count * 8);

  let levelWeightScore = 0;
  const hasSevere = violations.some(v => v.violation_level === '严重');
  const hasMajor = violations.some(v => v.violation_level === '较大');
  const hasNormal = violations.some(v => v.violation_level === '一般');

  if (hasSevere) {
    levelWeightScore = 25;
  } else if (hasMajor) {
    levelWeightScore = 15;
  } else if (hasNormal) {
    levelWeightScore = 8;
  }

  const pendingCount = violations.filter(v => v.status === '待处理' || v.status === '整改中').length;
  const pendingScore = Math.min(20, pendingCount * 5);

  const types = [...new Set(violations.map(v => v.violation_type))];
  const typeScore = types.length >= 3 ? 10 : 0;

  const score = Math.min(100, countScore + levelWeightScore + pendingScore + typeScore);

  return {
    score: parseFloat(score.toFixed(2)),
    details: {
      count,
      countScore,
      levelWeightScore,
      hasSevere,
      hasMajor,
      hasNormal,
      pendingCount,
      pendingScore,
      typeCount: types.length,
      typeScore
    }
  };
};

const calculateDriverComplianceScore = async (employeeId) => {
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const fiveYearsAgoStr = fiveYearsAgo.toISOString().split('T')[0];

  const demeritResult = await pool.query(
    `SELECT demerit_points FROM license_demerit_records
     WHERE employee_id = $1 AND is_deleted = false AND demerit_date >= $2`,
    [employeeId, fiveYearsAgoStr]
  );

  const demerits = demeritResult.rows;
  const totalPoints = demerits.reduce((sum, d) => sum + d.demerit_points, 0);
  const demeritCount = demerits.length;

  const licenseScore = Math.min(42, totalPoints * 1.5) + Math.min(18, demeritCount * 3);
  const over12Score = totalPoints >= 12 ? 50 : 0;

  const inspectionResult = await pool.query(
    `SELECT result, rectification_status FROM hse_driver_inspection_records
     WHERE employee_id = $1 AND is_deleted = false`,
    [employeeId]
  );

  const inspections = inspectionResult.rows;
  const totalInspections = inspections.length;
  const completedCount = inspections.filter(i => i.result === '合格').length;
  const notCompletedRate = totalInspections > 0 ? (totalInspections - completedCount) / totalInspections : 0;
  const inspectionScore = notCompletedRate * 40;

  const notRectifiedCount = inspections.filter(i => i.rectification_status === '未整改').length;
  const rectificationScore = Math.min(12, notRectifiedCount * 3);

  const score = Math.min(100, licenseScore + over12Score + inspectionScore + rectificationScore);

  return {
    score: parseFloat(score.toFixed(2)),
    details: {
      license: {
        totalPoints,
        demeritCount,
        licenseScore,
        over12Score
      },
      inspection: {
        totalInspections,
        completedCount,
        notCompletedRate: parseFloat(notCompletedRate.toFixed(2)),
        inspectionScore: parseFloat(inspectionScore.toFixed(2)),
        notRectifiedCount,
        rectificationScore
      }
    }
  };
};

const calculateTrainingComplianceScore = async (employeeId) => {
  const result = await pool.query(
    `SELECT result FROM training_records
     WHERE personnel_id = $1 AND is_deleted = false`,
    [employeeId]
  );

  const trainings = result.rows;
  const totalCount = trainings.length;
  const completedCount = trainings.filter(t => t.result === '合格').length;
  const pendingCount = trainings.filter(t => t.result !== '合格' && t.result !== '').length;

  let score = 0;
  if (totalCount === 0) {
    score += 50;
  } else {
    const failureRate = (totalCount - completedCount) / totalCount;
    score += failureRate * 30;
  }
  score += Math.min(20, pendingCount * 5);

  score = Math.min(100, score);

  return {
    score: parseFloat(score.toFixed(2)),
    details: {
      totalCount,
      completedCount,
      pendingCount,
      score: parseFloat(score.toFixed(2))
    }
  };
};

const calculateIncidentScore = async (employeeId) => {
  const result = await pool.query(
    `SELECT accident_type, level, responsibility, casualties, injuries
     FROM hse_incident_records
     WHERE employee_id = $1 AND is_deleted = false`,
    [employeeId]
  );

  const incidents = result.rows;

  let countScore = 0;
  let levelScore = 0;
  let responsibilityCount = 0;
  let hasCasualties = false;

  incidents.forEach(incident => {
    const typeWeight = ACCIDENT_TYPE_WEIGHTS[incident.accident_type] || 1.0;
    countScore += 15 * typeWeight;

    switch (incident.level) {
      case '重大': levelScore += 10; break;
      case '较大': levelScore += 7; break;
      case '一般': levelScore += 4; break;
    }

    if (incident.responsibility && incident.responsibility !== '') {
      responsibilityCount++;
    }

    if ((incident.casualties && incident.casualties > 0) || (incident.injuries && incident.injuries > 0)) {
      hasCasualties = true;
    }
  });

  countScore = Math.min(45, countScore);
  const responsibilityScore = Math.min(15, responsibilityCount * 5);
  const casualtyScore = hasCasualties ? 25 : 0;

  const score = Math.min(100, countScore + levelScore + responsibilityScore + casualtyScore);

  return {
    score: parseFloat(score.toFixed(2)),
    details: {
      totalCount: incidents.length,
      countScore: parseFloat(countScore.toFixed(2)),
      levelScore,
      responsibilityCount,
      responsibilityScore,
      hasCasualties,
      casualtyScore
    },
    incidents // 保留原始数据用于特殊规则检查
  };
};

const calculateManagementExecutionScore = async (employeeId, gridLevel) => {
  if (!gridLevel || !GRID_INSPECTION_INTERVALS[gridLevel]) {
    return { score: 0, details: { gridLevel, reason: '无网格长权限' } };
  }

  const intervalDays = GRID_INSPECTION_INTERVALS[gridLevel];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  const result = await pool.query(
    `SELECT result, problems_found, rectification_status, inspection_date
     FROM hse_grid_inspection_records
     WHERE employee_id = $1 AND is_deleted = false AND inspection_date >= $2`,
    [employeeId, thirtyDaysAgoStr]
  );

  const inspections = result.rows;
  const actualCount = inspections.length;
  const expectedCount = Math.ceil(30 / intervalDays);
  const completionRate = expectedCount > 0 ? actualCount / expectedCount : 0;

  let completionScore = 0;
  if (actualCount === 0) {
    completionScore = 80;
  } else if (completionRate < 0.5) {
    completionScore = 60;
  } else if (completionRate < 0.7) {
    completionScore = 40;
  } else if (completionRate < 0.9) {
    completionScore = 20;
  }

  const problemsFoundCount = inspections.filter(i => i.problems_found && i.problems_found !== '').length;
  const problemsScore = Math.min(20, problemsFoundCount * 4);

  const notRectifiedCount = inspections.filter(i => i.rectification_status === '未整改').length;
  const rectificationScore = Math.min(20, notRectifiedCount * 8);

  const score = Math.min(100, completionScore + problemsScore + rectificationScore);

  return {
    score: parseFloat(score.toFixed(2)),
    details: {
      gridLevel,
      intervalDays,
      expectedCount,
      actualCount,
      completionRate: parseFloat(completionRate.toFixed(2)),
      completionScore,
      problemsFoundCount,
      problemsScore,
      notRectifiedCount,
      rectificationScore
    }
  };
};

const checkSpecialRules = (incidents, driverComplianceDetails, managementExecutionDetails) => {
  const triggeredRules = [];
  const specialWeightings = [];

  incidents.forEach(incident => {
    if (incident.level === '重大') {
      triggeredRules.push('重大事故直接判定重大风险');
    } else if (incident.level === '较大') {
      triggeredRules.push('较大事故风险等级不低于较高风险');
    }

    if ((incident.casualties && incident.casualties > 0)) {
      triggeredRules.push('事故造成人员死亡直接判定重大风险');
    } else if ((incident.injuries && incident.injuries > 0)) {
      triggeredRules.push('事故造成人员重伤风险等级不低于重大风险');
    }
  });

  const trafficAccidents = incidents.filter(i => i.accident_type === '交通事故');
  if (trafficAccidents.length >= 3) {
    specialWeightings.push({ type: '多次交通事故', score: 30, reason: `近12个月发生${trafficAccidents.length}次交通事故` });
  } else if (trafficAccidents.length >= 2) {
    specialWeightings.push({ type: '多次交通事故', score: 15, reason: `近12个月发生${trafficAccidents.length}次交通事故` });
  }

  if (driverComplianceDetails && driverComplianceDetails.license) {
    if (driverComplianceDetails.license.totalPoints >= 12) {
      triggeredRules.push('驾驶证扣满12分');
    }
  }

  if (managementExecutionDetails && managementExecutionDetails.completionRate < 0.5) {
    triggeredRules.push('巡查完成率低于50%');
  }

  return {
    triggeredRules: [...new Set(triggeredRules)],
    specialWeightings
  };
};

const getPositionInfo = async (employeeId) => {
  const relationResult = await pool.query(
    `SELECT er.position_id, p.name as position_name
     FROM employee_assignment er
     LEFT JOIN position p ON p.id = er.position_id AND p.is_deleted = false
     WHERE er.employee_id = $1 AND er.is_current = true AND er.is_deleted = false
     ORDER BY er.is_primary DESC, er.id DESC LIMIT 1`,
    [employeeId]
  );

  const relation = relationResult.rows[0];
  if (!relation) {
    return { positionId: null, positionName: null, riskCategory: 'normal', managementLevel: null };
  }

  let mappingResult = await pool.query(
    `SELECT risk_category, management_level, applicable_risk_types
     FROM position_risk_mapping
     WHERE position_id = $1 AND is_active = true`,
    [relation.position_id]
  );

  // 如果position_id未找到映射，回退到position_name匹配（岗位别名兼容）
  if (mappingResult.rows.length === 0 && relation.position_name) {
    mappingResult = await pool.query(
      `SELECT risk_category, management_level, applicable_risk_types
       FROM position_risk_mapping
       WHERE position_name = $1 AND is_active = true`,
      [relation.position_name]
    );
  }

  if (mappingResult.rows.length > 0) {
    const mapping = mappingResult.rows[0];
    let applicableRiskTypes = [];
    if (mapping.applicable_risk_types) {
      if (Array.isArray(mapping.applicable_risk_types)) {
        applicableRiskTypes = mapping.applicable_risk_types;
      } else {
        try {
          applicableRiskTypes = JSON.parse(mapping.applicable_risk_types);
        } catch {
          applicableRiskTypes = [];
        }
      }
    }
    return {
      positionId: relation.position_id,
      positionName: relation.position_name,
      riskCategory: mapping.risk_category,
      managementLevel: mapping.management_level,
      applicableRiskTypes
    };
  }

  return {
    positionId: relation.position_id,
    positionName: relation.position_name,
    riskCategory: 'normal',
    managementLevel: null
  };
};

const getResponsibilityInfo = async (employeeId) => {
  const result = await pool.query(
    `SELECT responsibility_type, grid_level, grid_role, inspection_frequency
     FROM hse_responsibility
     WHERE employee_id = $1 AND is_deleted = false AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [employeeId]
  );

  const resp = result.rows[0];
  if (!resp) {
    return { responsibilityType: 'none', gridLevel: null };
  }

  return {
    responsibilityType: resp.responsibility_type,
    gridLevel: resp.grid_level,
    gridRole: resp.grid_role,
    inspectionFrequency: resp.inspection_frequency
  };
};

const getEmployeeInfo = async (employeeId) => {
  const result = await pool.query(
    `SELECT id, employee_code, name FROM employee WHERE id = $1 AND is_deleted = false`,
    [employeeId]
  );

  return result.rows[0] || null;
};

const calculateRiskScore = async (employeeId) => {
  const employee = await getEmployeeInfo(employeeId);
  if (!employee) {
    throw new Error('员工不存在');
  }

  const positionInfo = await getPositionInfo(employeeId);
  const responsibilityInfo = await getResponsibilityInfo(employeeId);

  const { riskCategory, managementLevel } = positionInfo;
  const weights = getWeights(riskCategory, managementLevel);

  const scores = {};
  const details = {};

  scores.violation = (await calculateViolationScore(employeeId)).score;
  details.violation = (await calculateViolationScore(employeeId)).details;

  if (riskCategory === 'driver') {
    const driverCompliance = await calculateDriverComplianceScore(employeeId);
    scores.driver_compliance = driverCompliance.score;
    details.driver_compliance = driverCompliance.details;
  } else {
    scores.driver_compliance = 0;
    details.driver_compliance = { reason: '非驾驶员岗位' };
  }

  scores.training_compliance = (await calculateTrainingComplianceScore(employeeId)).score;
  details.training_compliance = (await calculateTrainingComplianceScore(employeeId)).details;

  const incidentResult = await calculateIncidentScore(employeeId);
  scores.incident = incidentResult.score;
  details.incident = incidentResult.details;

  if (riskCategory === 'management') {
    const mgmtExecution = await calculateManagementExecutionScore(employeeId, responsibilityInfo.gridLevel);
    scores.management_execution = mgmtExecution.score;
    details.management_execution = mgmtExecution.details;
  } else {
    scores.management_execution = 0;
    details.management_execution = { reason: '非管理岗位' };
  }

  let baseTotalScore = 0;
  baseTotalScore += scores.violation * weights.violation;
  baseTotalScore += scores.driver_compliance * weights.driver_compliance;
  baseTotalScore += scores.training_compliance * weights.training_compliance;
  baseTotalScore += scores.incident * weights.incident;
  baseTotalScore += scores.management_execution * weights.management_execution;

  baseTotalScore = parseFloat(baseTotalScore.toFixed(2));

  const specialRules = checkSpecialRules(
    incidentResult.incidents || [],
    details.driver_compliance,
    details.management_execution
  );

  const specialWeightedScore = specialRules.specialWeightings.reduce((sum, w) => sum + w.score, 0);
  let finalScore = Math.min(100, baseTotalScore + specialWeightedScore);

  let riskLevel = determineRiskLevel(finalScore);

  if (specialRules.triggeredRules.includes('重大事故直接判定重大风险') ||
      specialRules.triggeredRules.includes('事故造成人员死亡直接判定重大风险')) {
    riskLevel = { level: '重大风险', code: 'critical' };
    finalScore = 100;
  } else if (specialRules.triggeredRules.includes('较大事故风险等级不低于较高风险') && riskLevel.code === 'low') {
    riskLevel = { level: '较高风险', code: 'high' };
    finalScore = Math.max(51, finalScore);
  } else if (specialRules.triggeredRules.includes('事故造成人员重伤风险等级不低于重大风险') && riskLevel.code !== 'critical') {
    riskLevel = { level: '重大风险', code: 'critical' };
    finalScore = Math.max(76, finalScore);
  }

  const result = {
    employeeId: employee.id,
    employeeCode: employee.employee_code,
    employeeName: employee.name,
    position: {
      id: positionInfo.positionId,
      name: positionInfo.positionName,
      riskCategory,
      managementLevel
    },
    responsibility: {
      type: responsibilityInfo.responsibilityType,
      gridLevel: responsibilityInfo.gridLevel
    },
    weights,
    scores: {
      violation: scores.violation,
      driver_compliance: scores.driver_compliance,
      training_compliance: scores.training_compliance,
      incident: scores.incident,
      management_execution: scores.management_execution
    },
    details,
    baseTotalScore,
    specialWeightedScore,
    finalScore: parseFloat(finalScore.toFixed(2)),
    riskLevel: riskLevel.level,
    riskLevelCode: riskLevel.code,
    specialRulesTriggered: specialRules.triggeredRules,
    specialWeightings: specialRules.specialWeightings,
    calculatedAt: new Date().toISOString()
  };

  return result;
};

const saveScoreRecord = async (scoreResult) => {
  await pool.query(
    `INSERT INTO risk_score_records (
      employee_id, employee_code, employee_name, position_id, position_name,
      risk_category, management_level, violation_score, driver_compliance_score,
      training_compliance_score, incident_score, management_execution_score,
      base_total_score, special_weighted_score, final_score, risk_level,
      risk_level_code, special_rules_triggered, special_weightings, calculated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      scoreResult.employeeId,
      scoreResult.employeeCode,
      scoreResult.employeeName,
      scoreResult.position.id,
      scoreResult.position.name,
      scoreResult.position.riskCategory,
      scoreResult.position.managementLevel,
      scoreResult.scores.violation,
      scoreResult.scores.driver_compliance,
      scoreResult.scores.training_compliance,
      scoreResult.scores.incident,
      scoreResult.scores.management_execution,
      scoreResult.baseTotalScore,
      scoreResult.specialWeightedScore,
      scoreResult.finalScore,
      scoreResult.riskLevel,
      scoreResult.riskLevelCode,
      scoreResult.specialRulesTriggered,
      scoreResult.specialWeightings.map(w => JSON.stringify(w)),
      scoreResult.calculatedAt
    ]
  );
};

const saveLevelRecord = async (scoreResult) => {
  const lastLevelResult = await pool.query(
    `SELECT risk_level, risk_score FROM risk_level_records
     WHERE employee_id = $1 AND is_active = true AND is_deleted = false
     ORDER BY valid_from DESC LIMIT 1`,
    [scoreResult.employeeId]
  );

  const lastLevel = lastLevelResult.rows[0];

  let levelChange = '无变化';
  let changeReason = '';

  if (!lastLevel) {
    levelChange = '首次评定';
    changeReason = '员工首次进行风险等级评定';
  } else if (lastLevel.risk_level !== scoreResult.riskLevel) {
    const levels = ['低风险', '一般风险', '较高风险', '重大风险'];
    const currentIndex = levels.indexOf(scoreResult.riskLevel);
    const lastIndex = levels.indexOf(lastLevel.risk_level);
    if (currentIndex > lastIndex) {
      levelChange = '等级上升';
    } else {
      levelChange = '等级下降';
    }
    changeReason = `从${lastLevel.risk_level}(${lastLevel.risk_score}分)变更为${scoreResult.riskLevel}(${scoreResult.finalScore}分)`;
  }

  await pool.query(
    `UPDATE risk_level_records SET is_active = false, valid_to = NOW()
     WHERE employee_id = $1 AND is_active = true AND is_deleted = false`,
    [scoreResult.employeeId]
  );

  await pool.query(
    `INSERT INTO risk_level_records (
      employee_id, employee_code, employee_name, position_id, position_name,
      risk_level, risk_level_code, risk_score, previous_risk_level,
      previous_risk_score, level_change, change_reason, valid_from
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      scoreResult.employeeId,
      scoreResult.employeeCode,
      scoreResult.employeeName,
      scoreResult.position.id,
      scoreResult.position.name,
      scoreResult.riskLevel,
      scoreResult.riskLevelCode,
      scoreResult.finalScore,
      lastLevel ? lastLevel.risk_level : null,
      lastLevel ? lastLevel.risk_score : null,
      levelChange,
      changeReason,
      scoreResult.calculatedAt
    ]
  );
};

const getRiskLevel = async (employeeId) => {
  const result = await pool.query(
    `SELECT risk_level, risk_level_code, risk_score, valid_from, valid_to, level_change
     FROM risk_level_records
     WHERE employee_id = $1 AND is_active = true AND is_deleted = false`,
    [employeeId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

const getScoreHistory = async (employeeId, limit = 10) => {
  const result = await pool.query(
    `SELECT id, violation_score, driver_compliance_score, training_compliance_score,
            incident_score, management_execution_score, base_total_score,
            special_weighted_score, final_score, risk_level, risk_level_code,
            special_rules_triggered, special_weightings, calculated_at
     FROM risk_score_records
     WHERE employee_id = $1 AND is_deleted = false
     ORDER BY calculated_at DESC LIMIT $2`,
    [employeeId, limit]
  );

  return result.rows;
};

const getLevelHistory = async (employeeId, limit = 10) => {
  const result = await pool.query(
    `SELECT id, risk_level, risk_level_code, risk_score, previous_risk_level,
            previous_risk_score, level_change, change_reason, valid_from, valid_to
     FROM risk_level_records
     WHERE employee_id = $1 AND is_deleted = false
     ORDER BY valid_from DESC LIMIT $2`,
    [employeeId, limit]
  );

  return result.rows;
};

module.exports = {
  calculateRiskScore,
  saveScoreRecord,
  saveLevelRecord,
  getRiskLevel,
  getScoreHistory,
  getLevelHistory,
  getWeights,
  determineRiskLevel
};
