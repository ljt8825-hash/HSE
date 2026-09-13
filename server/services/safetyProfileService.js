/**
 * HSE 员工域 · 安全画像服务（employee_safety_profile / position_safety_profile 表）
 * 从 hse-employee/safety-profiles.js route 内联 handler 迁移 —— 行为逐字节不变
 */
const { pool } = require('../config/db');

const VALID_RISK_LEVELS = ['low', 'medium', 'high', 'critical', 'unknown'];
const VALID_ASSESSMENT_METHODS = ['manual', 'auto_calculated', 'hybrid'];
const VALID_QUALIFICATION_STATUS = ['qualified', 'unqualified', 'pending', 'expired'];
const VALID_HEALTH_STATUS = ['fit', 'unfit', 'restricted', 'pending_exam'];
const VALID_POSITION_RISK_LEVELS = ['low', 'medium', 'high', 'critical', 'unknown'];
const VALID_POSITION_ASSESSMENT_METHODS = ['manual', 'auto_calculated', 'hybrid'];
const VALID_INSPECTION_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'once'];

// 风险评定规则（应用层实现，AI不参与）
function calculateRiskLevel(profile) {
  const {
    accident_responsible_count = 0,
    serious_violation_count = 0,
    rectification_overdue_count = 0,
    violation_count = 0,
    accident_count = 0,
    health_status = null,
  } = profile;

  let score = 0;

  if (accident_responsible_count >= 1) score += 40;
  if (serious_violation_count >= 3) score += 30;
  if (rectification_overdue_count >= 5) score += 20;
  if (accident_count >= 2) score += 15;
  if (violation_count >= 5) score += 15;
  if (rectification_overdue_count >= 2) score += 10;
  if (health_status === 'unfit') score += 25;
  if (health_status === 'restricted') score += 10;
  if (violation_count >= 2) score += 5;
  if (accident_count >= 1) score += 5;

  let level = 'low';
  if (score >= 60) level = 'critical';
  else if (score >= 35) level = 'high';
  else if (score >= 15) level = 'medium';
  else if (score > 0) level = 'low';
  else level = 'unknown';

  return { level, score: Math.min(100, Math.max(0, score)) };
}

function calculatePositionRiskLevel(profile) {
  const { required_special_operation = false, required_safety_critical = false, safety_hazards = [] } = profile;
  let score = 0;
  if (required_special_operation) score += 30;
  if (required_safety_critical) score += 25;
  const hazardCount = Array.isArray(safety_hazards) ? safety_hazards.length : 0;
  score += hazardCount * 10;
  if (profile.work_permit_required) score += 15;
  let level = 'low';
  if (score >= 60) level = 'critical';
  else if (score >= 35) level = 'high';
  else if (score >= 15) level = 'medium';
  else if (score > 0) level = 'low';
  else level = 'unknown';
  return { level, score: Math.min(100, Math.max(0, score)) };
}

// GET /safety-profiles — 分页查询一人一档
async function listSafetyProfiles(query) {
  const { page = 1, pageSize = 20, riskLevel, qualification, healthStatus, keyword } = query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
  const offset = (pageNum - 1) * limitNum;

  const conditions = ['sp.is_deleted = false'];
  const params = [];
  let paramIdx = 1;

  if (riskLevel && VALID_RISK_LEVELS.includes(riskLevel)) {
    conditions.push(`sp.risk_level = $${paramIdx}`);
    params.push(riskLevel);
    paramIdx++;
  }
  if (qualification && VALID_QUALIFICATION_STATUS.includes(qualification)) {
    conditions.push(`sp.safety_qualification = $${paramIdx}`);
    params.push(qualification);
    paramIdx++;
  }
  if (healthStatus && VALID_HEALTH_STATUS.includes(healthStatus)) {
    conditions.push(`sp.health_status = $${paramIdx}`);
    params.push(healthStatus);
    paramIdx++;
  }
  if (keyword) {
    conditions.push(`(e.name ILIKE $${paramIdx} OR e.employee_code ILIKE $${paramIdx})`);
    params.push(`%${keyword}%`);
    paramIdx++;
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM employee_safety_profile sp
     LEFT JOIN employee e ON sp.employee_id = e.id
     WHERE ${whereClause}`,
    params
  );
  const total = countResult.rows[0].total;

  params.push(limitNum, offset);
  const result = await pool.query(
    `SELECT sp.*, e.name AS employee_name, e.employee_code, e.gender, e.birth_date,
            CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age
     FROM employee_safety_profile sp
     LEFT JOIN employee e ON sp.employee_id = e.id AND e.is_deleted = false
     WHERE ${whereClause}
     ORDER BY sp.risk_score DESC NULLS LAST, sp.updated_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    params
  );

  return { rows: result.rows, total, pageNum, limitNum };
}

// GET /safety-profiles/stats — 一人一档统计
async function getSafetyProfileStats() {
  const [totalR, riskR, qualR, healthR] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM employee_safety_profile WHERE is_deleted = false`),
    pool.query(`SELECT risk_level, COUNT(*)::int AS count FROM employee_safety_profile WHERE is_deleted = false GROUP BY risk_level`),
    pool.query(`SELECT safety_qualification, COUNT(*)::int AS count FROM employee_safety_profile WHERE is_deleted = false AND safety_qualification IS NOT NULL GROUP BY safety_qualification`),
    pool.query(`SELECT health_status, COUNT(*)::int AS count FROM employee_safety_profile WHERE is_deleted = false AND health_status IS NOT NULL GROUP BY health_status`),
  ]);

  const byRiskLevel = {};
  riskR.rows.forEach(r => { byRiskLevel[r.risk_level] = r.count; });
  const byQualification = {};
  qualR.rows.forEach(r => { byQualification[r.safety_qualification] = r.count; });
  const byHealth = {};
  healthR.rows.forEach(r => { byHealth[r.health_status] = r.count; });

  return {
    total: totalR.rows[0].total,
    byRiskLevel,
    byQualification,
    byHealth,
  };
}

// GET /safety-profiles/employee/:employeeId — 查询某员工一人一档
async function getEmployeeSafetyProfile(employeeId, userId) {
  const result = await pool.query(
    `SELECT sp.*, e.name AS employee_name, e.employee_code, e.gender, e.birth_date,
            CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age
     FROM employee_safety_profile sp
     LEFT JOIN employee e ON sp.employee_id = e.id AND e.is_deleted = false
     WHERE sp.employee_id = $1 AND sp.is_deleted = false`,
    [employeeId]
  );

  let profile = result.rows[0] || null;

  if (!profile) {
    const empResult = await pool.query(
      `SELECT id, name, employee_code, gender, birth_date,
              CASE WHEN birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(birth_date))::INT ELSE NULL END AS age
       FROM employee WHERE id = $1 AND is_deleted = false`,
      [employeeId]
    );
    if (empResult.rows.length === 0) return { error: -2, message: '员工不存在' };

    const insertR = await pool.query(
      `INSERT INTO employee_safety_profile (employee_id, created_by)
       VALUES ($1, $2) RETURNING *`,
      [employeeId, userId || null]
    );
    profile = insertR.rows[0];
    profile.employee_name = empResult.rows[0].name;
    profile.employee_code = empResult.rows[0].employee_code;
    profile.gender = empResult.rows[0].gender;
    profile.birth_date = empResult.rows[0].birth_date;
    profile.age = empResult.rows[0].age;
  }

  const certResult = await pool.query(
    `SELECT id, cert_name, cert_category, cert_type, expire_date, status, is_special_operation
     FROM employee_certificate
     WHERE employee_id = $1 AND is_deleted = false
     ORDER BY created_at DESC LIMIT 20`,
    [employeeId]
  );

  const histResult = await pool.query(
    `SELECT id, event_type, event_date, before_status, after_status, remark
     FROM employee_history
     WHERE employee_id = $1 AND is_deleted = false
     ORDER BY event_date DESC LIMIT 10`,
    [employeeId]
  );

  return { profile, certificates: certResult.rows, history: histResult.rows };
}

// POST /safety-profiles/employee/:employeeId/assess — 手动触发风险评估
async function assessEmployeeRisk(employeeId, body, userId) {
  const { assessment_method = 'auto_calculated' } = body;

  let result = await pool.query(
    `SELECT * FROM employee_safety_profile WHERE employee_id = $1 AND is_deleted = false`,
    [employeeId]
  );

  let profile;
  if (result.rows.length === 0) {
    const empR = await pool.query(`SELECT id FROM employee WHERE id = $1 AND is_deleted = false`, [employeeId]);
    if (empR.rows.length === 0) return { error: -2, message: '员工不存在' };
    const insR = await pool.query(
      `INSERT INTO employee_safety_profile (employee_id, created_by) VALUES ($1, $2) RETURNING *`,
      [employeeId, userId || null]
    );
    profile = insR.rows[0];
  } else {
    profile = result.rows[0];
  }

  const { level, score } = calculateRiskLevel(profile);

  const updateResult = await pool.query(
    `UPDATE employee_safety_profile
     SET risk_level = $1, risk_score = $2, last_assessment_date = CURRENT_DATE,
         assessment_method = $3, updated_at = NOW()
     WHERE employee_id = $4 AND is_deleted = false
     RETURNING *`,
    [level, score, assessment_method, employeeId]
  );

  const risk_factors = {
    accident_responsible: profile.accident_responsible_count || 0,
    serious_violation: profile.serious_violation_count || 0,
    violation: profile.violation_count || 0,
    accident: profile.accident_count || 0,
    rectification_overdue: profile.rectification_overdue_count || 0,
    health_status: profile.health_status || null,
  };

  return { row: updateResult.rows[0], risk_factors, audit: { level, score } };
}

// PUT /safety-profiles/:id — 更新风险画像
async function updateSafetyProfile(id, body) {
  const existing = await pool.query(`SELECT id FROM employee_safety_profile WHERE id = $1 AND is_deleted = false`, [id]);
  if (existing.rows.length === 0) return { error: -2, message: '风险画像不存在' };

  const fields = [];
  const params = [];
  let idx = 1;

  const updatable = [
    'risk_level', 'risk_score', 'risk_factors',
    'accident_count', 'accident_responsible_count',
    'violation_count', 'serious_violation_count',
    'training_count', 'training_hours', 'last_training_date',
    'hazard_involved_count', 'rectification_count', 'rectification_overdue_count',
    'last_accident_date', 'last_violation_date',
    'assessment_method', 'safety_qualification',
    'special_operation_qualified', 'health_status',
    'last_health_exam_date', 'next_health_exam_date',
    'restricted_work_types', 'ai_risk_analysis', 'ai_suggestion',
    'ai_analysis_date', 'ai_analysis_version', 'remark'
  ];

  for (const f of updatable) {
    if (body[f] !== undefined) {
      fields.push(`${f} = $${idx}`);
      params.push(body[f]);
      idx++;
    }
  }

  if (body.risk_level !== undefined && !VALID_RISK_LEVELS.includes(body.risk_level)) {
    return { error: -3, message: `风险等级必须为：${VALID_RISK_LEVELS.join(', ')}` };
  }

  if (fields.length === 0) return { noop: true, existing: existing.rows[0] };
  fields.push(`updated_at = NOW()`);
  params.push(id);

  const result = await pool.query(
    `UPDATE employee_safety_profile SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );

  return { row: result.rows[0], audit: { id } };
}

// POST /safety-profiles/batch-assess — 批量风险评估
async function batchAssessSafetyProfiles(body) {
  const { filter = {}, assessment_method = 'auto_calculated' } = body;

  let whereClause = 'is_deleted = false';
  const params = [];
  let idx = 1;
  if (filter.riskLevel && Array.isArray(filter.riskLevel)) {
    const placeholders = filter.riskLevel.map((_, i) => `$${idx + i}`).join(', ');
    whereClause += ` AND risk_level IN (${placeholders})`;
    params.push(...filter.riskLevel);
    idx += filter.riskLevel.length;
  }

  const profiles = await pool.query(
    `SELECT * FROM employee_safety_profile WHERE ${whereClause} ORDER BY id`,
    params
  );

  let updated = 0;
  for (const profile of profiles.rows) {
    const { level, score } = calculateRiskLevel(profile);
    await pool.query(
      `UPDATE employee_safety_profile
       SET risk_level = $1, risk_score = $2, last_assessment_date = CURRENT_DATE,
           assessment_method = $3, updated_at = NOW()
       WHERE id = $4`,
      [level, score, assessment_method, profile.id]
    );
    updated++;
  }

  return { total: profiles.rows.length, updated, audit: { updated } };
}

// GET /position-safety-profiles — 分页查询岗位安全画像
async function listPositionSafetyProfiles(query) {
  const { page = 1, pageSize = 20, positionId, riskLevel, keyword } = query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(pageSize);
  const offset = (pageNum - 1) * limitNum;

  let whereClause = 'ps.is_deleted = false';
  const params = [];
  let idx = 1;

  if (positionId) {
    whereClause += ` AND ps.position_id = $${idx}`;
    params.push(positionId);
    idx++;
  }
  if (riskLevel) {
    whereClause += ` AND ps.risk_level = $${idx}`;
    params.push(riskLevel);
    idx++;
  }
  if (keyword) {
    whereClause += ` AND (p.name LIKE $${idx} OR ps.risk_factors::TEXT LIKE $${idx})`;
    params.push(`%${keyword}%`);
    idx++;
  }

  const result = await pool.query(
    `SELECT ps.*, p.name AS position_name, p.position_code, p.dept_id
     FROM position_safety_profile ps
     LEFT JOIN position p ON ps.position_id = p.id AND p.is_deleted = false
     WHERE ${whereClause}
     ORDER BY ps.risk_score DESC NULLS LAST, ps.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limitNum, offset]
  );

  const totalR = await pool.query(
    `SELECT COUNT(*)::int AS total FROM position_safety_profile ps WHERE ${whereClause}`,
    params
  );

  return { rows: result.rows, total: totalR.rows[0].total, pageNum, limitNum };
}

// GET /position-safety-profiles/stats — 岗位安全画像统计
async function getPositionSafetyProfileStats() {
  const [totalR, riskR, specialR, criticalR] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM position_safety_profile WHERE is_deleted = false`),
    pool.query(`SELECT risk_level, COUNT(*)::int AS count FROM position_safety_profile WHERE is_deleted = false GROUP BY risk_level`),
    pool.query(`SELECT required_special_operation, COUNT(*)::int AS count FROM position_safety_profile WHERE is_deleted = false GROUP BY required_special_operation`),
    pool.query(`SELECT required_safety_critical, COUNT(*)::int AS count FROM position_safety_profile WHERE is_deleted = false GROUP BY required_safety_critical`),
  ]);

  const byRiskLevel = {};
  riskR.rows.forEach(r => { byRiskLevel[r.risk_level] = r.count; });
  const bySpecialOperation = {};
  specialR.rows.forEach(r => { bySpecialOperation[r.required_special_operation ? 'required' : 'not_required'] = r.count; });
  const bySafetyCritical = {};
  criticalR.rows.forEach(r => { bySafetyCritical[r.required_safety_critical ? 'required' : 'not_required'] = r.count; });

  return {
    total: totalR.rows[0].total,
    byRiskLevel,
    bySpecialOperation,
    bySafetyCritical,
  };
}

// GET /position-safety-profiles/:id — 岗位安全画像详情
async function getPositionSafetyProfile(id) {
  const result = await pool.query(
    `SELECT ps.*, p.name AS position_name, p.position_code, p.dept_id, p.job_category
     FROM position_safety_profile ps
     LEFT JOIN position p ON ps.position_id = p.id AND p.is_deleted = false
     WHERE ps.id = $1 AND ps.is_deleted = false`,
    [id]
  );
  if (result.rows.length === 0) return { error: -2, message: '岗位安全画像不存在' };
  return { row: result.rows[0] };
}

// GET /position-safety-profiles/position/:positionId — 查询某岗位的安全画像
async function getPositionSafetyProfileByPosition(positionId, userId) {
  const posResult = await pool.query(`SELECT id, name, position_code FROM position WHERE id = $1 AND is_deleted = false`, [positionId]);
  if (posResult.rows.length === 0) return { error: -2, message: '岗位不存在' };

  const result = await pool.query(
    `SELECT ps.*
     FROM position_safety_profile ps
     WHERE ps.position_id = $1 AND ps.is_deleted = false`,
    [positionId]
  );

  let profile = result.rows[0] || null;
  if (!profile) {
    const insertR = await pool.query(
      `INSERT INTO position_safety_profile (position_id, created_by)
       VALUES ($1, $2) RETURNING *`,
      [positionId, userId || null]
    );
    profile = insertR.rows[0];
  }

  const trainingResult = await pool.query(
    `SELECT id, training_type, training_category, required_hours, frequency, is_mandatory
     FROM position_training_requirement
     WHERE position_id = $1 AND is_deleted = false
     ORDER BY is_mandatory DESC, created_at DESC`,
    [positionId]
  );

  return { profile, position: posResult.rows[0], trainingRequirements: trainingResult.rows };
}

// POST /position-safety-profiles — 新增/更新岗位安全画像
async function upsertPositionSafetyProfile(body, userId) {
  const {
    position_id, risk_level, risk_score, risk_factors,
    required_cert_categories, required_special_operation = false,
    required_safety_critical = false, safety_hazards, safety_procedures,
    emergency_response, ppe_requirements, work_permit_required = false,
    inspection_frequency, last_risk_assessment_date, assessment_method = 'manual',
    ai_risk_analysis, ai_suggestion
  } = body;

  if (!position_id) return { error: -3, message: '岗位ID不能为空' };

  const posResult = await pool.query(`SELECT id FROM position WHERE id = $1 AND is_deleted = false`, [position_id]);
  if (posResult.rows.length === 0) return { error: -2, message: '岗位不存在' };

  if (risk_level && !VALID_POSITION_RISK_LEVELS.includes(risk_level)) {
    return { error: -3, message: `风险等级必须为：${VALID_POSITION_RISK_LEVELS.join(', ')}` };
  }
  if (assessment_method && !VALID_POSITION_ASSESSMENT_METHODS.includes(assessment_method)) {
    return { error: -3, message: `评估方式必须为：${VALID_POSITION_ASSESSMENT_METHODS.join(', ')}` };
  }
  if (inspection_frequency && !VALID_INSPECTION_FREQUENCIES.includes(inspection_frequency)) {
    return { error: -3, message: `巡检频率必须为：${VALID_INSPECTION_FREQUENCIES.join(', ')}` };
  }

  const jsonRiskFactors = risk_factors ? JSON.stringify(risk_factors) : null;
  const jsonSafetyHazards = safety_hazards ? JSON.stringify(safety_hazards) : null;
  const jsonPpeRequirements = ppe_requirements ? JSON.stringify(ppe_requirements) : null;

  const existingResult = await pool.query(
    `SELECT id FROM position_safety_profile WHERE position_id = $1 AND is_deleted = false`,
    [position_id]
  );

  let result;
  if (existingResult.rows.length > 0) {
    result = await pool.query(
      `UPDATE position_safety_profile SET
         risk_level = $1, risk_score = $2, risk_factors = $3,
         required_cert_categories = $4, required_special_operation = $5,
         required_safety_critical = $6, safety_hazards = $7, safety_procedures = $8,
         emergency_response = $9, ppe_requirements = $10, work_permit_required = $11,
         inspection_frequency = $12, last_risk_assessment_date = $13, assessment_method = $14,
         ai_risk_analysis = $15, ai_suggestion = $16, updated_at = NOW()
       WHERE position_id = $17 AND is_deleted = false
       RETURNING *`,
      [risk_level || null, risk_score || null, jsonRiskFactors,
       required_cert_categories || null, required_special_operation,
       required_safety_critical, jsonSafetyHazards, safety_procedures || null,
       emergency_response || null, jsonPpeRequirements, work_permit_required,
       inspection_frequency || null, last_risk_assessment_date || null, assessment_method,
       ai_risk_analysis || null, ai_suggestion || null, position_id]
    );
  } else {
    result = await pool.query(
      `INSERT INTO position_safety_profile (
         position_id, risk_level, risk_score, risk_factors,
         required_cert_categories, required_special_operation,
         required_safety_critical, safety_hazards, safety_procedures,
         emergency_response, ppe_requirements, work_permit_required,
         inspection_frequency, last_risk_assessment_date, assessment_method,
         ai_risk_analysis, ai_suggestion, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [position_id, risk_level || 'unknown', risk_score || null, jsonRiskFactors,
       required_cert_categories || null, required_special_operation,
       required_safety_critical, jsonSafetyHazards, safety_procedures || null,
       emergency_response || null, jsonPpeRequirements, work_permit_required,
       inspection_frequency || null, last_risk_assessment_date || null, assessment_method,
       ai_risk_analysis || null, ai_suggestion || null, userId || null]
    );
  }

  const isUpdate = existingResult.rows.length > 0;
  return { row: result.rows[0], audit: { position_id, isUpdate, msg: isUpdate ? '更新成功' : '新增成功' } };
}

// PUT /position-safety-profiles/:id — 更新岗位安全画像
async function updatePositionSafetyProfile(id, body) {
  const {
    risk_level, risk_score, risk_factors,
    required_cert_categories, required_special_operation,
    required_safety_critical, safety_hazards, safety_procedures,
    emergency_response, ppe_requirements, work_permit_required,
    inspection_frequency, last_risk_assessment_date, assessment_method,
    ai_risk_analysis, ai_suggestion
  } = body;

  const updates = [];
  const params = [];
  let idx = 1;

  if (risk_level !== undefined) {
    if (!VALID_POSITION_RISK_LEVELS.includes(risk_level)) {
      return { error: -3, message: `风险等级必须为：${VALID_POSITION_RISK_LEVELS.join(', ')}` };
    }
    updates.push(`risk_level = $${idx}`);
    params.push(risk_level);
    idx++;
  }
  if (risk_score !== undefined) { updates.push(`risk_score = $${idx}`); params.push(risk_score); idx++; }
  if (risk_factors !== undefined) { updates.push(`risk_factors = $${idx}`); params.push(risk_factors); idx++; }
  if (required_cert_categories !== undefined) { updates.push(`required_cert_categories = $${idx}`); params.push(required_cert_categories); idx++; }
  if (required_special_operation !== undefined) { updates.push(`required_special_operation = $${idx}`); params.push(required_special_operation); idx++; }
  if (required_safety_critical !== undefined) { updates.push(`required_safety_critical = $${idx}`); params.push(required_safety_critical); idx++; }
  if (safety_hazards !== undefined) { updates.push(`safety_hazards = $${idx}`); params.push(safety_hazards); idx++; }
  if (safety_procedures !== undefined) { updates.push(`safety_procedures = $${idx}`); params.push(safety_procedures); idx++; }
  if (emergency_response !== undefined) { updates.push(`emergency_response = $${idx}`); params.push(emergency_response); idx++; }
  if (ppe_requirements !== undefined) { updates.push(`ppe_requirements = $${idx}`); params.push(ppe_requirements); idx++; }
  if (work_permit_required !== undefined) { updates.push(`work_permit_required = $${idx}`); params.push(work_permit_required); idx++; }
  if (inspection_frequency !== undefined) {
    if (!VALID_INSPECTION_FREQUENCIES.includes(inspection_frequency)) {
      return { error: -3, message: `巡检频率必须为：${VALID_INSPECTION_FREQUENCIES.join(', ')}` };
    }
    updates.push(`inspection_frequency = $${idx}`);
    params.push(inspection_frequency);
    idx++;
  }
  if (last_risk_assessment_date !== undefined) { updates.push(`last_risk_assessment_date = $${idx}`); params.push(last_risk_assessment_date); idx++; }
  if (assessment_method !== undefined) {
    if (!VALID_POSITION_ASSESSMENT_METHODS.includes(assessment_method)) {
      return { error: -3, message: `评估方式必须为：${VALID_POSITION_ASSESSMENT_METHODS.join(', ')}` };
    }
    updates.push(`assessment_method = $${idx}`);
    params.push(assessment_method);
    idx++;
  }
  if (ai_risk_analysis !== undefined) { updates.push(`ai_risk_analysis = $${idx}`); params.push(ai_risk_analysis); idx++; }
  if (ai_suggestion !== undefined) { updates.push(`ai_suggestion = $${idx}`); params.push(ai_suggestion); idx++; }

  if (updates.length === 0) return { error: -3, message: '请提供要更新的字段' };

  updates.push(`updated_at = NOW()`);
  params.push(id);

  const result = await pool.query(
    `UPDATE position_safety_profile SET ${updates.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`,
    params
  );

  if (result.rows.length === 0) return { error: -2, message: '岗位安全画像不存在' };

  return { row: result.rows[0], audit: { id } };
}

// DELETE /position-safety-profiles/:id — 软删除岗位安全画像
async function deletePositionSafetyProfile(id) {
  const result = await pool.query(
    `UPDATE position_safety_profile SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`,
    [id]
  );

  if (result.rows.length === 0) return { error: -2, message: '岗位安全画像不存在' };

  return { row: result.rows[0], audit: { id } };
}

// POST /position-safety-profiles/batch-assess — 批量岗位风险评估
async function batchAssessPositionSafetyProfiles(body) {
  const { filter = {}, assessment_method = 'auto_calculated' } = body;

  let whereClause = 'is_deleted = false';
  const params = [];
  let idx = 1;
  if (filter.riskLevel && Array.isArray(filter.riskLevel)) {
    const placeholders = filter.riskLevel.map((_, i) => `$${idx + i}`).join(', ');
    whereClause += ` AND risk_level IN (${placeholders})`;
    params.push(...filter.riskLevel);
    idx += filter.riskLevel.length;
  }

  const profiles = await pool.query(
    `SELECT * FROM position_safety_profile WHERE ${whereClause} ORDER BY id`,
    params
  );

  let updated = 0;
  for (const profile of profiles.rows) {
    const { level, score } = calculatePositionRiskLevel(profile);
    await pool.query(
      `UPDATE position_safety_profile
       SET risk_level = $1, risk_score = $2, last_risk_assessment_date = CURRENT_DATE,
           assessment_method = $3, updated_at = NOW()
       WHERE id = $4`,
      [level, score, assessment_method, profile.id]
    );
    updated++;
  }

  return { total: profiles.rows.length, updated, audit: { updated } };
}

module.exports = {
  VALID_RISK_LEVELS,
  VALID_ASSESSMENT_METHODS,
  VALID_QUALIFICATION_STATUS,
  VALID_HEALTH_STATUS,
  VALID_POSITION_RISK_LEVELS,
  VALID_POSITION_ASSESSMENT_METHODS,
  VALID_INSPECTION_FREQUENCIES,
  listSafetyProfiles,
  getSafetyProfileStats,
  getEmployeeSafetyProfile,
  assessEmployeeRisk,
  updateSafetyProfile,
  batchAssessSafetyProfiles,
  listPositionSafetyProfiles,
  getPositionSafetyProfileStats,
  getPositionSafetyProfile,
  getPositionSafetyProfileByPosition,
  upsertPositionSafetyProfile,
  updatePositionSafetyProfile,
  deletePositionSafetyProfile,
  batchAssessPositionSafetyProfiles,
};