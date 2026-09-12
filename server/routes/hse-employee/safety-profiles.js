/**
 * HSE 一人一档 & 岗位安全画像 (employee_safety_profile / position_safety_profile 表)
 * 从 hse-employee.js 拆分迁移 —— 保持对外路由契约逐字节不变
 * 由父路由 router.use('/', this) 挂载，最终契约 /api/hse/employee/safety-profiles(...) / position-safety-profiles(...)
 */
const express = require('express');
const router = express.Router();

const { pool, isConnected } = require('../../config/db');
const { success, error } = require('../../middleware/response');
const { buildListResponse, buildDetailResponse, camelKeys } = require('../../utils/commonResponse');
const { auditLog } = require('../audit');
const { requireRole, requirePermission } = require('../../middleware/auth');

const VALID_RISK_LEVELS = ['low', 'medium', 'high', 'critical', 'unknown'];
const VALID_ASSESSMENT_METHODS = ['manual', 'auto_calculated', 'hybrid'];
const VALID_QUALIFICATION_STATUS = ['qualified', 'unqualified', 'pending', 'expired'];
const VALID_HEALTH_STATUS = ['fit', 'unfit', 'restricted', 'pending_exam'];

// GET /safety-profiles — 分页查询一人一档
router.get('/safety-profiles', async (req, res) => {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, undefined, { camelCase: true });

    const { page = 1, pageSize = 20, riskLevel, qualification, healthStatus, keyword } = req.query;
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

    buildListResponse(res, result.rows, total, pageNum, limitNum, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /safety-profiles/stats — 一人一档统计
router.get('/safety-profiles/stats', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ total: 0, byRiskLevel: {}, byQualification: {}, byHealth: {} })));

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

    res.json(success(camelKeys({
      total: totalR.rows[0].total,
      byRiskLevel,
      byQualification,
      byHealth,
    })));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /safety-profiles/employee/:employeeId — 查询某员工一人一档
router.get('/safety-profiles/employee/:employeeId', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT sp.*, e.name AS employee_name, e.employee_code, e.gender, e.birth_date,
              CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age
       FROM employee_safety_profile sp
       LEFT JOIN employee e ON sp.employee_id = e.id AND e.is_deleted = false
       WHERE sp.employee_id = $1 AND sp.is_deleted = false`,
      [req.params.employeeId]
    );

    let profile = result.rows[0] || null;

    if (!profile) {
      const empResult = await pool.query(
        `SELECT id, name, employee_code, gender, birth_date,
                CASE WHEN birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(birth_date))::INT ELSE NULL END AS age
         FROM employee WHERE id = $1 AND is_deleted = false`,
        [req.params.employeeId]
      );
      if (empResult.rows.length === 0) return res.json(error(-2, '员工不存在'));

      const insertR = await pool.query(
        `INSERT INTO employee_safety_profile (employee_id, created_by)
         VALUES ($1, $2) RETURNING *`,
        [req.params.employeeId, req.user?.id || null]
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
      [req.params.employeeId]
    );

    const histResult = await pool.query(
      `SELECT id, event_type, event_date, before_status, after_status, remark
       FROM employee_history
       WHERE employee_id = $1 AND is_deleted = false
       ORDER BY event_date DESC LIMIT 10`,
      [req.params.employeeId]
    );

    res.json(success(camelKeys({
      profile,
      certificates: certResult.rows,
      history: histResult.rows,
    })));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 风险评定规则（应用层实现，AI不参与）
// ============================================================
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

// POST /safety-profiles/employee/:employeeId/assess — 手动触发风险评估
router.post('/safety-profiles/employee/:employeeId/assess', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const { assessment_method = 'auto_calculated' } = req.body;

    let result = await pool.query(
      `SELECT * FROM employee_safety_profile WHERE employee_id = $1 AND is_deleted = false`,
      [req.params.employeeId]
    );

    let profile;
    if (result.rows.length === 0) {
      const empR = await pool.query(`SELECT id FROM employee WHERE id = $1 AND is_deleted = false`, [req.params.employeeId]);
      if (empR.rows.length === 0) return res.json(error(-2, '员工不存在'));
      const insR = await pool.query(
        `INSERT INTO employee_safety_profile (employee_id, created_by) VALUES ($1, $2) RETURNING *`,
        [req.params.employeeId, req.user?.id || null]
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
      [level, score, assessment_method, req.params.employeeId]
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'assess', module: '一人一档',
      description: `风险评估员工ID: ${req.params.employeeId}, 等级: ${level}, 评分: ${score}`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(camelKeys({
      profile: updateResult.rows[0],
      risk_factors: {
        accident_responsible: profile.accident_responsible_count || 0,
        serious_violation: profile.serious_violation_count || 0,
        violation: profile.violation_count || 0,
        accident: profile.accident_count || 0,
        rectification_overdue: profile.rectification_overdue_count || 0,
        health_status: profile.health_status || null,
      },
    }), '风险评估完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /safety-profiles/:id — 更新风险画像
router.put('/safety-profiles/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const existing = await pool.query(`SELECT id FROM employee_safety_profile WHERE id = $1 AND is_deleted = false`, [req.params.id]);
    if (existing.rows.length === 0) return res.json(error(-2, '风险画像不存在'));

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
      if (req.body[f] !== undefined) {
        fields.push(`${f} = $${idx}`);
        params.push(req.body[f]);
        idx++;
      }
    }

    if (req.body.risk_level !== undefined && !VALID_RISK_LEVELS.includes(req.body.risk_level)) {
      return res.json(error(-3, `风险等级必须为：${VALID_RISK_LEVELS.join(', ')}`));
    }

    if (fields.length === 0) return res.json(success(camelKeys(existing.rows[0]), '无更新'));
    fields.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE employee_safety_profile SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '一人一档',
      description: `更新风险画像 ID: ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /safety-profiles/batch-assess — 批量风险评估
router.post('/safety-profiles/batch-assess', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const { filter = {}, assessment_method = 'auto_calculated' } = req.body;

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

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'batch_assess', module: '一人一档',
      description: `批量风险评估: ${updated}人`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(camelKeys({ total: profiles.rows.length, updated }), '批量评估完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 九、岗位安全画像 (position_safety_profile 表)
// ============================================================

const VALID_POSITION_RISK_LEVELS = ['low', 'medium', 'high', 'critical', 'unknown'];
const VALID_POSITION_ASSESSMENT_METHODS = ['manual', 'auto_calculated', 'hybrid'];
const VALID_INSPECTION_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'once'];

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

// GET /position-safety-profiles — 分页查询岗位安全画像
router.get('/position-safety-profiles', async (req, res) => {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, undefined, { camelCase: true });
    const { page = 1, pageSize = 20, positionId, riskLevel, keyword } = req.query;
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

    buildListResponse(res, result.rows, totalR.rows[0].total, pageNum, limitNum, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /position-safety-profiles/stats — 岗位安全画像统计
router.get('/position-safety-profiles/stats', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ total: 0, byRiskLevel: {}, bySpecialOperation: {}, bySafetyCritical: {} })));

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

    res.json(success(camelKeys({
      total: totalR.rows[0].total,
      byRiskLevel,
      bySpecialOperation,
      bySafetyCritical,
    })));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /position-safety-profiles/:id — 岗位安全画像详情
router.get('/position-safety-profiles/:id', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT ps.*, p.name AS position_name, p.position_code, p.dept_id, p.job_category
       FROM position_safety_profile ps
       LEFT JOIN position p ON ps.position_id = p.id AND p.is_deleted = false
       WHERE ps.id = $1 AND ps.is_deleted = false`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '岗位安全画像不存在'));
    buildDetailResponse(res, result.rows[0], undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /position-safety-profiles/position/:positionId — 查询某岗位的安全画像
router.get('/position-safety-profiles/position/:positionId', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const posResult = await pool.query(`SELECT id, name, position_code FROM position WHERE id = $1 AND is_deleted = false`, [req.params.positionId]);
    if (posResult.rows.length === 0) return res.json(error(-2, '岗位不存在'));

    const result = await pool.query(
      `SELECT ps.*
       FROM position_safety_profile ps
       WHERE ps.position_id = $1 AND ps.is_deleted = false`,
      [req.params.positionId]
    );

    let profile = result.rows[0] || null;
    if (!profile) {
      const insertR = await pool.query(
        `INSERT INTO position_safety_profile (position_id, created_by)
         VALUES ($1, $2) RETURNING *`,
        [req.params.positionId, req.user?.id || null]
      );
      profile = insertR.rows[0];
    }

    const trainingResult = await pool.query(
      `SELECT id, training_type, training_category, required_hours, frequency, is_mandatory
       FROM position_training_requirement
       WHERE position_id = $1 AND is_deleted = false
       ORDER BY is_mandatory DESC, created_at DESC`,
      [req.params.positionId]
    );

    res.json(success(camelKeys({
      profile,
      position: posResult.rows[0],
      trainingRequirements: trainingResult.rows,
    })));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /position-safety-profiles — 新增/更新岗位安全画像
router.post('/position-safety-profiles', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const {
      position_id, risk_level, risk_score, risk_factors,
      required_cert_categories, required_special_operation = false,
      required_safety_critical = false, safety_hazards, safety_procedures,
      emergency_response, ppe_requirements, work_permit_required = false,
      inspection_frequency, last_risk_assessment_date, assessment_method = 'manual',
      ai_risk_analysis, ai_suggestion
    } = req.body;

    if (!position_id) return res.json(error(-3, '岗位ID不能为空'));

    const posResult = await pool.query(`SELECT id FROM position WHERE id = $1 AND is_deleted = false`, [position_id]);
    if (posResult.rows.length === 0) return res.json(error(-2, '岗位不存在'));

    if (risk_level && !VALID_POSITION_RISK_LEVELS.includes(risk_level)) {
      return res.json(error(-3, `风险等级必须为：${VALID_POSITION_RISK_LEVELS.join(', ')}`));
    }
    if (assessment_method && !VALID_POSITION_ASSESSMENT_METHODS.includes(assessment_method)) {
      return res.json(error(-3, `评估方式必须为：${VALID_POSITION_ASSESSMENT_METHODS.join(', ')}`));
    }
    if (inspection_frequency && !VALID_INSPECTION_FREQUENCIES.includes(inspection_frequency)) {
      return res.json(error(-3, `巡检频率必须为：${VALID_INSPECTION_FREQUENCIES.join(', ')}`));
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
         ai_risk_analysis || null, ai_suggestion || null, req.user?.id || null]
      );
    }

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: existingResult.rows.length > 0 ? 'update' : 'create', module: '岗位安全画像',
      description: `${existingResult.rows.length > 0 ? '更新' : '新增'}岗位安全画像: 岗位ID ${position_id}`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], existingResult.rows.length > 0 ? '更新成功' : '新增成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /position-safety-profiles/:id — 更新岗位安全画像
router.put('/position-safety-profiles/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const {
      risk_level, risk_score, risk_factors,
      required_cert_categories, required_special_operation,
      required_safety_critical, safety_hazards, safety_procedures,
      emergency_response, ppe_requirements, work_permit_required,
      inspection_frequency, last_risk_assessment_date, assessment_method,
      ai_risk_analysis, ai_suggestion
    } = req.body;

    const updates = [];
    const params = [];
    let idx = 1;

    if (risk_level !== undefined) {
      if (!VALID_POSITION_RISK_LEVELS.includes(risk_level)) {
        return res.json(error(-3, `风险等级必须为：${VALID_POSITION_RISK_LEVELS.join(', ')}`));
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
        return res.json(error(-3, `巡检频率必须为：${VALID_INSPECTION_FREQUENCIES.join(', ')}`));
      }
      updates.push(`inspection_frequency = $${idx}`);
      params.push(inspection_frequency);
      idx++;
    }
    if (last_risk_assessment_date !== undefined) { updates.push(`last_risk_assessment_date = $${idx}`); params.push(last_risk_assessment_date); idx++; }
    if (assessment_method !== undefined) {
      if (!VALID_POSITION_ASSESSMENT_METHODS.includes(assessment_method)) {
        return res.json(error(-3, `评估方式必须为：${VALID_POSITION_ASSESSMENT_METHODS.join(', ')}`));
      }
      updates.push(`assessment_method = $${idx}`);
      params.push(assessment_method);
      idx++;
    }
    if (ai_risk_analysis !== undefined) { updates.push(`ai_risk_analysis = $${idx}`); params.push(ai_risk_analysis); idx++; }
    if (ai_suggestion !== undefined) { updates.push(`ai_suggestion = $${idx}`); params.push(ai_suggestion); idx++; }

    if (updates.length === 0) return res.json(error(-3, '请提供要更新的字段'));

    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE position_safety_profile SET ${updates.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.json(error(-2, '岗位安全画像不存在'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '岗位安全画像',
      description: `更新岗位安全画像: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// DELETE /position-safety-profiles/:id — 软删除岗位安全画像
router.delete('/position-safety-profiles/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const result = await pool.query(
      `UPDATE position_safety_profile SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '岗位安全画像不存在'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '岗位安全画像',
      description: `删除岗位安全画像: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /position-safety-profiles/batch-assess — 批量岗位风险评估
router.post('/position-safety-profiles/batch-assess', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const { filter = {}, assessment_method = 'auto_calculated' } = req.body;

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

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'batch_assess', module: '岗位安全画像',
      description: `批量岗位风险评估: ${updated}个岗位`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(camelKeys({ total: profiles.rows.length, updated }), '批量评估完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

module.exports = router;
