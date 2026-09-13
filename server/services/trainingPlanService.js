/**
 * 培训模块（/api/training）· 培训计划（Sprint5.10 / 5.11）—— service
 * 端点点簇：/plans 全套 CRUD、POST /plans/:id/execute。
 * 保留 PostgreSQL + 内存降级；controller 仅解释描述符。
 */
const shared = require('./trainingShared');
const assessmentEvent = require('../services/assessmentEventService'); // 月度自动考核事件
const {
  pool, isConnected, ensureTables, initMemoryData,
  memoryTrainingPlans, memoryRecords, buildMemoryRecord, camelKeys, paginateMemory,
  formatRecordRow,
} = shared;

async function listPlans(query) {
  if (!isConnected()) {
    let data = memoryTrainingPlans.filter(r => !r.is_deleted);
    const { page = 1, pageSize = 20, keyword, planType, status } = query;
    if (keyword) {
      const kw = keyword.toLowerCase();
      data = data.filter(r => (r.title && r.title.toLowerCase().includes(kw)) || (r.trainer_name && r.trainer_name.toLowerCase().includes(kw)));
    }
    if (planType) data = data.filter(r => r.plan_type === planType);
    if (status) data = data.filter(r => r.status === status);
    const { list, total } = paginateMemory(data, page, pageSize);
    return { __t: 'list', list: list.map(camelKeys), total, page, pageSize, message: '查询成功(内存模式)' };
  }

  await ensureTables();
  const { page = 1, pageSize = 20, keyword, planType, status } = query;
  let whereSql = ' WHERE is_deleted = false';
  const params = [];
  let paramIdx = 0;

  if (keyword) {
    paramIdx++;
    whereSql += ` AND (title ILIKE $${paramIdx} OR trainer_name ILIKE $${paramIdx} OR target_audience ILIKE $${paramIdx} OR content ILIKE $${paramIdx} OR responsible_dept ILIKE $${paramIdx} OR training_time ILIKE $${paramIdx})`;
    params.push(`%${keyword}%`);
  }
  if (planType) {
    paramIdx++;
    whereSql += ` AND plan_type = $${paramIdx}`;
    params.push(planType);
  }
  if (status) {
    paramIdx++;
    whereSql += ` AND status = $${paramIdx}`;
    params.push(status);
  }

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM training_plans${whereSql}`, params);
  const total = countResult.rows[0].total;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  paramIdx++;
  params.push(parseInt(pageSize));
  paramIdx++;
  params.push(offset);

  // 对齐《安全培训教育实施计划表》：按序号（plan_no 数字）升序，无序号的排最后
  const orderSql = ` ORDER BY (CASE WHEN plan_no ~ '^[0-9]+$' THEN plan_no::int ELSE 2147483647 END) ASC, start_date ASC, id ASC`;
  const result = await pool.query(`SELECT * FROM training_plans${whereSql}${orderSql} LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`, params);
  return { __t: 'list', list: result.rows.map(camelKeys), total, page: parseInt(page), pageSize: parseInt(pageSize), message: '查询成功' };
}

async function getPlan(id) {
  if (!isConnected()) {
    const record = memoryTrainingPlans.find(r => r.id === parseInt(id) && !r.is_deleted);
    if (!record) return { __t: 'error', code: -2, message: '记录不存在' };
    return { __t: 'json', payload: camelKeys(record), message: '查询成功(内存模式)' };
  }

  await ensureTables();
  const result = await pool.query('SELECT * FROM training_plans WHERE id = $1 AND is_deleted = false', [id]);
  if (result.rows.length === 0) return { __t: 'error', code: -2, message: '记录不存在' };
  return { __t: 'json', payload: camelKeys(result.rows[0]), message: '查询成功' };
}

async function createPlan(body) {
  const b = body;
  if (!isConnected()) {
    const record = buildMemoryRecord(shared.planIdCounter2++, {
      title: b.title || '',
      plan_type: b.planType || b.plan_type || 'annual',
      training_type: b.trainingType || b.training_type || 'HSE',
      target_audience: b.targetAudience || '',
      trainer_name: b.trainerName || '',
      trainer_id: b.trainerId || null,
      planned_attendees: b.plannedAttendees || 0,
      actual_attendees: b.actualAttendees || 0,
      start_date: b.startDate || new Date().toISOString().slice(0, 10),
      end_date: b.endDate || new Date().toISOString().slice(0, 10),
      location: b.location || '',
      duration_hours: b.durationHours || 4,
      content: b.content || '',
      exam_required: b.examRequired || false,
      pass_score: b.passScore || 60,
      status: b.status || 'draft',
      remark: b.remark || '',
      training_time: b.trainingTime || '',
      responsible_dept: b.responsibleDept || '',
    });
    memoryTrainingPlans.push(record);
    return { __t: 'json', payload: camelKeys(record), message: '创建成功(内存模式)' };
  }

  await ensureTables();
  const result = await pool.query(`
    INSERT INTO training_plans (title, plan_type, training_type, target_audience, trainer_name, trainer_id, planned_attendees, actual_attendees, start_date, end_date, location, duration_hours, content, exam_required, pass_score, status, remark, training_time, responsible_dept)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [b.title || '', b.planType || b.plan_type || 'annual', b.trainingType || b.training_type || 'HSE',
     b.targetAudience || '', b.trainerName || '', b.trainerId || null, b.plannedAttendees || 0, b.actualAttendees || 0,
     b.startDate || new Date().toISOString().slice(0, 10), b.endDate || new Date().toISOString().slice(0, 10),
     b.location || '', b.durationHours || 4, b.content || '', b.examRequired || false, b.passScore || 60,
     b.status || 'draft', b.remark || '', b.trainingTime || '', b.responsibleDept || '']);
  return { __t: 'json', payload: camelKeys(result.rows[0]), message: '创建成功' };
}

async function updatePlan(id, body) {
  const b = body;
  if (!isConnected()) {
    const idx = memoryTrainingPlans.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
    if (idx === -1) return { __t: 'error', code: -2, message: '记录不存在' };
    if (b.title !== undefined) memoryTrainingPlans[idx].title = b.title;
    if (b.planType !== undefined) memoryTrainingPlans[idx].plan_type = b.planType;
    if (b.trainingType !== undefined) memoryTrainingPlans[idx].training_type = b.trainingType;
    if (b.targetAudience !== undefined) memoryTrainingPlans[idx].target_audience = b.targetAudience;
    if (b.trainerName !== undefined) memoryTrainingPlans[idx].trainer_name = b.trainerName;
    if (b.trainerId !== undefined) memoryTrainingPlans[idx].trainer_id = b.trainerId;
    if (b.plannedAttendees !== undefined) memoryTrainingPlans[idx].planned_attendees = b.plannedAttendees;
    if (b.actualAttendees !== undefined) memoryTrainingPlans[idx].actual_attendees = b.actualAttendees;
    if (b.startDate !== undefined) memoryTrainingPlans[idx].start_date = b.startDate;
    if (b.endDate !== undefined) memoryTrainingPlans[idx].end_date = b.endDate;
    if (b.location !== undefined) memoryTrainingPlans[idx].location = b.location;
    if (b.durationHours !== undefined) memoryTrainingPlans[idx].duration_hours = b.durationHours;
    if (b.content !== undefined) memoryTrainingPlans[idx].content = b.content;
    if (b.examRequired !== undefined) memoryTrainingPlans[idx].exam_required = b.examRequired;
    if (b.passScore !== undefined) memoryTrainingPlans[idx].pass_score = b.passScore;
    if (b.status !== undefined) memoryTrainingPlans[idx].status = b.status;
    if (b.remark !== undefined) memoryTrainingPlans[idx].remark = b.remark;
    if (b.trainingTime !== undefined) memoryTrainingPlans[idx].training_time = b.trainingTime;
    if (b.responsibleDept !== undefined) memoryTrainingPlans[idx].responsible_dept = b.responsibleDept;
    memoryTrainingPlans[idx].updated_at = new Date().toISOString();
    return { __t: 'json', payload: camelKeys(memoryTrainingPlans[idx]), message: '更新成功(内存模式)' };
  }

  await ensureTables();
  const result = await pool.query(`
    UPDATE training_plans SET
      title = COALESCE($1, title),
      plan_type = COALESCE($2, plan_type),
      training_type = COALESCE($3, training_type),
      target_audience = COALESCE($4, target_audience),
      trainer_name = COALESCE($5, trainer_name),
      trainer_id = COALESCE($6, trainer_id),
      planned_attendees = COALESCE($7, planned_attendees),
      actual_attendees = COALESCE($8, actual_attendees),
      start_date = COALESCE($9, start_date),
      end_date = COALESCE($10, end_date),
      location = COALESCE($11, location),
      duration_hours = COALESCE($12, duration_hours),
      content = COALESCE($13, content),
      exam_required = COALESCE($14, exam_required),
      pass_score = COALESCE($15, pass_score),
      status = COALESCE($16, status),
      remark = COALESCE($17, remark),
      training_time = COALESCE($18, training_time),
      responsible_dept = COALESCE($19, responsible_dept),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $20 AND is_deleted = false RETURNING *`,
    [b.title, b.planType, b.trainingType, b.targetAudience, b.trainerName, b.trainerId,
     b.plannedAttendees, b.actualAttendees, b.startDate, b.endDate, b.location, b.durationHours,
     b.content, b.examRequired, b.passScore, b.status, b.remark,
     b.trainingTime !== undefined ? b.trainingTime : null,
     b.responsibleDept !== undefined ? b.responsibleDept : null,
     id]);
  if (result.rows.length === 0) return { __t: 'error', code: -2, message: '记录不存在' };
  return { __t: 'json', payload: camelKeys(result.rows[0]), message: '更新成功' };
}

async function deletePlan(id) {
  if (!isConnected()) {
    const idx = memoryTrainingPlans.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
    if (idx === -1) return { __t: 'error', code: -2, message: '记录不存在' };
    memoryTrainingPlans[idx].is_deleted = true;
    return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
  }

  await ensureTables();
  const result = await pool.query('UPDATE training_plans SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id', [id]);
  if (result.rows.length === 0) return { __t: 'error', code: -2, message: '记录不存在' };
  return { __t: 'json', payload: null, message: '删除成功' };
}

// ========== POST /plans/:id/execute — 从培训计划生成培训记录 ==========
async function executePlan(id, body) {
  const planId = parseInt(id);
  const { employeeIds = [], trainingDate, result = '合格', score = null, remark = '', trainerId = null } = body;

  if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
    return { __t: 'error', code: -1, message: '请选择至少一名参训员工' };
  }

  if (!isConnected()) {
    initMemoryData();
    // 内存模式：先查询计划
    const plan = memoryTrainingPlans.find(p => p.id === planId && !p.is_deleted);
    if (!plan) return { __t: 'error', code: -2, message: '培训计划不存在' };
    const created = [];
    for (const empId of employeeIds) {
      const record = buildMemoryRecord(shared.recordIdCounter++, {
        employee_id: empId,
        trainer_id: trainerId || plan.trainer_id || null,
        training_plan_id: planId,
        training_type: plan.training_type || 'HSE',
        training_date: trainingDate || new Date().toISOString().slice(0, 10),
        duration_minutes: Math.round((plan.duration_hours || 4) * 60),
        content: plan.content || plan.title || '',
        result,
        score,
        trainer: plan.trainer_name || '',
        remark,
      });
      memoryRecords.push(record);
      created.push(formatRecordRow(record));
    }
    // 更新计划实际人数
    plan.actual_attendees = (plan.actual_attendees || 0) + created.length;
    return { __t: 'json', payload: { created, count: created.length }, message: `成功生成${created.length}条培训记录(内存模式)` };
  }

  await ensureTables();

  // 查询培训计划
  const planResult = await pool.query('SELECT * FROM training_plans WHERE id = $1 AND is_deleted = false', [planId]);
  if (planResult.rows.length === 0) return { __t: 'error', code: -2, message: '培训计划不存在' };
  const plan = planResult.rows[0];

  // 批量查询员工信息（使用 v_employee_current 视图，如不存在则降级到 hse_employees）
  let employeeRows = [];
  try {
    const empResult = await pool.query(
      'SELECT employee_id, name, position_name, org_name FROM v_employee_current WHERE employee_id = ANY($1::bigint[]) AND assignment_status = \'active\'',
      [employeeIds]
    );
    employeeRows = empResult.rows;
  } catch (e) {
    // 降级：直接用传入的 employee_id，无姓名信息
    employeeRows = employeeIds.map(id => ({ employee_id: id, name: '', position_name: '', org_name: '' }));
  }

  const empMap = new Map(employeeRows.map(r => [r.employee_id, r]));
  const created = [];
  const effectiveDate = trainingDate || new Date().toISOString().slice(0, 10);
  const durationMinutes = Math.round((parseFloat(plan.duration_hours) || 4) * 60);

  for (const empId of employeeIds) {
    const emp = empMap.get(parseInt(empId)) || empMap.get(empId) || { name: '', position_name: '', org_name: '' };
    const insertResult = await pool.query(`
      INSERT INTO training_records (employee_id, trainer_id, training_plan_id, name, dept, position, training_type, training_date, duration_minutes, content, result, score, trainer, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [empId, trainerId || plan.trainer_id || null, planId, emp.name || '', emp.org_name || '', emp.position_name || '',
       plan.training_type || 'HSE', effectiveDate, durationMinutes, plan.content || plan.title || '',
       result, score, plan.trainer_name || '', remark]);
    created.push(formatRecordRow(insertResult.rows[0]));

    // 月度自动考核：培训结果不合格 → 本人扣分
    if (result === '不合格') {
      assessmentEvent.publish(assessmentEvent.EVENT_TYPES.TRAINING_FAILED, {
        trainingId: insertResult.rows[0].id,
        employeeId: empId,
        content: plan.content || plan.title || '',
        trainingDate: effectiveDate,
      });
    }
  }

  // 更新培训计划实际参训人数
  await pool.query('UPDATE training_plans SET actual_attendees = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [(plan.actual_attendees || 0) + created.length, planId]);

  return { __t: 'json', payload: { created, count: created.length }, message: `成功生成${created.length}条培训记录` };
}

module.exports = {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  executePlan,
};