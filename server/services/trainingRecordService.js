/**
 * 培训模块（/api/training）· 培训记录 —— service
 * 对应端点：/records 全套（GET 列表 / GET export / GET :id / POST / PUT :id / DELETE :id）
 * 保留 PostgreSQL + 内存降级双模式；业务/SQL 在此，controller 仅解释描述符。
 */
const shared = require('./trainingShared');
const {
  pool, isConnected, initMemoryData, memoryPlans, memoryRecords,
  formatRecordRow, calcExpiryStatus, buildTrainingCsvExport,
  paginateMemory, buildListResponse, sendNotFound,
  resolveTrainingPersonId, resolveTrainingPersonName, resolveTrainerEmployeeId,
} = shared;

// ========== GET /records — 培训计划列表 ==========
async function listRecords(query) {
  if (!isConnected()) {
    initMemoryData();
    let data = memoryPlans.filter(r => !r.is_deleted);
    const { page = 1, pageSize = 20, keyword, type, status } = query;
    if (keyword) {
      const kw = keyword.toLowerCase();
      data = data.filter(r => (r.title && r.title.toLowerCase().includes(kw)) || (r.trainer && r.trainer.toLowerCase().includes(kw)));
    }
    if (type) data = data.filter(r => r.type === type);
    if (status) data = data.filter(r => r.status === status);
    const { list, total } = paginateMemory(data, page, pageSize);
    return { __t: 'list', list, total, page, pageSize, message: '查询成功(内存模式)' };
  }

  const { page = 1, pageSize = 20, keyword, type, status } = query;
  let whereSql = ' WHERE tr.is_deleted = false';
  const params = [];
  let paramIdx = 0;

  if (keyword) {
    paramIdx++;
    whereSql += ` AND (tr.name ILIKE $${paramIdx} OR tr.content ILIKE $${paramIdx} OR tr.trainer ILIKE $${paramIdx})`;
    params.push(`%${keyword}%`);
  }
  if (type) {
    paramIdx++;
    whereSql += ` AND tr.training_type = $${paramIdx}`;
    params.push(type);
  }

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM training_records tr${whereSql}`, params);
  const total = countResult.rows[0].total;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  paramIdx++;
  params.push(parseInt(pageSize));
  paramIdx++;
  params.push(offset);

  const result = await pool.query(`SELECT tr.*, sup.id AS supervisor_id, sup.name AS supervisor_name
     FROM training_records tr
     LEFT JOIN employee_assignment ea ON tr.employee_id = ea.employee_id AND ea.is_primary = true AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN employee sup ON ea.supervisor_id = sup.id AND sup.is_deleted = false
     ${whereSql} ORDER BY tr.is_pinned DESC NULLS LAST, CASE tr.personnel_type WHEN '主要负责人' THEN 0 WHEN '安全管理人员' THEN 1 ELSE 2 END, tr.training_date ASC NULLS LAST, tr.id ASC LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`, params);
  return { __t: 'list', list: result.rows.map(formatRecordRow), total, page: parseInt(page), pageSize: parseInt(pageSize), message: '查询成功' };
}

// ========== GET /records/export — 导出培训记录清单（CSV） ==========
async function exportRecords() {
  if (!isConnected()) {
    initMemoryData();
    const data = memoryRecords.filter(r => !r.is_deleted).map(r => ({
      ...r,
      expiry_status: calcExpiryStatus(r.trainingDate || r.training_date),
    }));
    return { __t: 'csv', ...buildTrainingCsvExport(data) };
  }

  const result = await pool.query(`
    SELECT id, name, dept, position, training_type, training_date, duration_minutes,
           content, result, score, trainer, remark, personnel_type, validity, created_at
    FROM training_records WHERE is_deleted = FALSE ORDER BY is_pinned DESC NULLS LAST, training_date ASC NULLS LAST, id ASC
  `);
  const list = result.rows.map(r => ({
    ...r,
    expiry_status: calcExpiryStatus(r.training_date),
  }));
  return { __t: 'csv', ...buildTrainingCsvExport(list) };
}

// ========== GET /records/:id — 单条 ==========
async function getRecord(id) {
  if (!isConnected()) {
    initMemoryData();
    const record = memoryRecords.find(r => r.id === parseInt(id) && !r.is_deleted);
    if (!record) return { __t: 'not-found' };
    return { __t: 'json', payload: record, message: '查询成功(内存模式)' };
  }
  const result = await pool.query('SELECT * FROM training_records WHERE id = $1 AND is_deleted = false', [id]);
  if (result.rows.length === 0) return { __t: 'error', code: -2, message: '记录不存在' };
  return { __t: 'json', payload: formatRecordRow(result.rows[0]), message: '查询成功' };
}

// ========== POST /records — 创建 ==========
async function createRecord(body) {
  const b = body;
  if (!isConnected()) {
    initMemoryData();
    const record = {
      id: shared.planIdCounter++,
      title: b.title || '',
      type: b.type || 'safety',
      status: b.status || 'draft',
      targetAudience: b.targetAudience || '',
      trainer: b.trainer || '',
      plannedAttendees: b.plannedAttendees || 0,
      actualAttendees: b.actualAttendees,
      startDate: b.startDate || new Date().toISOString(),
      endDate: b.endDate || new Date().toISOString(),
      location: b.location || '',
      duration: b.duration || 0,
      content: b.content || '',
      examRequired: b.examRequired || false,
      passScore: b.passScore,
      remark: b.remark || '',
      is_deleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryPlans.push(record);
    return { __t: 'json', payload: record, message: '创建成功(内存模式)' };
  }

  await shared.ensureTables();

  const { name, personnel_id, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark, employee_id, trainer_id, personnel_type, validity, is_pinned } = b;
  // 兼容前端 camelCase 入参（personnelType / validity / isPinned），与 snake_case 等价
  const personnelTypeIn = personnel_type != null ? personnel_type : (b.personnelType ?? '');
  const validityIn = validity != null ? validity : (b.validity ?? '');
  const isPinnedIn = is_pinned != null ? is_pinned : (b.isPinned ?? false);
  // 兼容前端 camelCase 入参（employeeId / personnelId / idCard），与 snake_case 等价
  const employeeIdIn = employee_id != null ? employee_id : b.employeeId;
  const personnelIdIn = personnel_id != null ? personnel_id : b.personnelId;
  const idCardIn = id_card != null ? id_card : b.idCard;
  // 阶段5：人员落键（显式 employeeId/personnelId > 身份证 hash > 姓名唯一匹配）
  const resolvedEmployeeId = await resolveTrainingPersonId(name, idCardIn, employeeIdIn || personnelIdIn || null);
  // 落键成功则以员工主数据为准同步标准姓名，避免自由文本错名
  const standardName = resolvedEmployeeId ? await resolveTrainingPersonName(resolvedEmployeeId) : null;
  const finalName = standardName || name || '';
  const finalPersonnelId = resolvedEmployeeId != null ? resolvedEmployeeId : (personnelIdIn || null);
  // 花名册自动匹配：落键到员工后，若部门/职位未显式提供（新增行只填姓名），则从 v_employee_org_full 自动带出
  let finalDept = dept || '';
  let finalPosition = position || '';
  if (!finalDept || !finalPosition) {
    const orgRes = await pool.query(
      'SELECT org_name, position_name FROM v_employee_org_full WHERE employee_id = $1 AND is_current = true AND is_deleted = false LIMIT 1',
      [resolvedEmployeeId]
    );
    const org = orgRes.rows[0];
    if (org) {
      finalDept = finalDept || org.org_name || '';
      finalPosition = finalPosition || org.position_name || '';
    }
  }
  // 培训人员(讲师)落键：显式 trainerId > 讲师姓名唯一匹配
  let finalTrainerId = trainer_id != null ? trainer_id : (b.trainerId ?? null);
  if (finalTrainerId == null && trainer) finalTrainerId = await resolveTrainerEmployeeId(trainer);
  const insertResult = await pool.query(`
    INSERT INTO training_records (personnel_id, name, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark, employee_id, trainer_id, personnel_type, validity, is_pinned)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
    [finalPersonnelId, finalName, idCardIn || '', finalDept, finalPosition, grid_level || '', frequency || '', training_type || 'HSE', training_date || null, duration_minutes || 0, content || '', result || '合格', score || null, trainer || '', remark || '', resolvedEmployeeId, finalTrainerId, personnelTypeIn || '', validityIn || '', isPinnedIn]);
  return { __t: 'json', payload: formatRecordRow(insertResult.rows[0]), message: '创建成功' };
}

// ========== PUT /records/:id — 更新 ==========
async function updateRecord(id, body) {
  const b = body;
  if (!isConnected()) {
    initMemoryData();
    const idx = memoryPlans.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
    if (idx === -1) return { __t: 'error', code: -2, message: '记录不存在' };
    Object.assign(memoryPlans[idx], b, { updatedAt: new Date().toISOString() });
    return { __t: 'json', payload: memoryPlans[idx], message: '更新成功(内存模式)' };
  }

  const { name, personnel_id, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark, employee_id, trainer_id, personnel_type, validity, is_pinned } = b;
  // 兼容前端 camelCase 入参（employeeId / personnelId / idCard / personnelType / validity / isPinned），与 snake_case 等价
  const employeeIdIn = employee_id != null ? employee_id : b.employeeId;
  const personnelTypeIn = personnel_type != null ? personnel_type : (b.personnelType ?? null);
  const validityIn = validity != null ? validity : (b.validity ?? null);
  const isPinnedIn = is_pinned != null ? is_pinned : (b.isPinned ?? null);
  const personnelIdIn = personnel_id != null ? personnel_id : b.personnelId;
  const idCardIn = id_card != null ? id_card : b.idCard;
  // 阶段5：人员落键（同 POST 口径）；未落键时保留调用方传入值，维持 COALESCE 局部更新语义
  const resolvedEmployeeId = await resolveTrainingPersonId(name, idCardIn, employeeIdIn || personnelIdIn || null);
  const standardName = resolvedEmployeeId ? await resolveTrainingPersonName(resolvedEmployeeId) : null;
  const finalName = standardName || name;
  const finalPersonnelId = resolvedEmployeeId != null ? resolvedEmployeeId : personnelIdIn;
  const finalEmployeeId = resolvedEmployeeId != null ? resolvedEmployeeId : employeeIdIn;
  // 花名册自动匹配（编辑场景）：本次更新携带姓名 且 未显式提供部门/职位时，从 v_employee_org_full 补齐
  const nameTouched = !!(b && typeof b === 'object' && 'name' in b);
  let finalDept = dept;
  let finalPosition = position;
  if (nameTouched && finalEmployeeId && (finalDept === undefined || finalPosition === undefined)) {
    const orgResU = await pool.query(
      'SELECT org_name, position_name FROM v_employee_org_full WHERE employee_id = $1 AND is_current = true AND is_deleted = false LIMIT 1',
      [finalEmployeeId]
    );
    const orgU = orgResU.rows[0];
    if (orgU) {
      if (finalDept === undefined) finalDept = orgU.org_name;
      if (finalPosition === undefined) finalPosition = orgU.position_name;
    }
  }
  // 培训人员(讲师)落键（同 POST 口径）
  let finalTrainerId = trainer_id != null ? trainer_id : (b.trainerId ?? null);
  if (finalTrainerId == null && trainer) finalTrainerId = await resolveTrainerEmployeeId(trainer);
  const updateResult = await pool.query(`
    UPDATE training_records SET
      name = COALESCE($1, name), personnel_id = COALESCE($2, personnel_id),
      id_card = COALESCE($3, id_card), dept = COALESCE($4, dept),
      position = COALESCE($5, position), grid_level = COALESCE($6, grid_level),
      frequency = COALESCE($7, frequency), training_type = COALESCE($8, training_type),
      training_date = COALESCE($9, training_date), duration_minutes = COALESCE($10, duration_minutes),
      content = COALESCE($11, content), result = COALESCE($12, result),
      score = COALESCE($13, score), trainer = COALESCE($14, trainer),
      remark = COALESCE($15, remark), employee_id = COALESCE($16, employee_id),
      trainer_id = COALESCE($17, trainer_id),
      personnel_type = COALESCE($18, personnel_type), validity = COALESCE($19, validity),
      is_pinned = COALESCE($20, is_pinned),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $21 AND is_deleted = false RETURNING *`,
    [finalName, finalPersonnelId, idCardIn, finalDept, finalPosition, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark, finalEmployeeId, finalTrainerId, personnelTypeIn != null ? personnelTypeIn : null, validityIn != null ? validityIn : null, isPinnedIn, id]);
  if (updateResult.rows.length === 0) return { __t: 'error', code: -2, message: '记录不存在' };
  return { __t: 'json', payload: formatRecordRow(updateResult.rows[0]), message: '更新成功' };
}

// ========== DELETE /records/:id — 删除 ==========
async function deleteRecord(id) {
  if (!isConnected()) {
    initMemoryData();
    const record = memoryRecords.find(r => r.id === parseInt(id) && !r.is_deleted);
    if (!record) return { __t: 'error', code: -2, message: '记录不存在' };
    record.is_deleted = true;
    return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
  }
  const result = await pool.query('UPDATE training_records SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id', [id]);
  if (result.rows.length === 0) return { __t: 'error', code: -2, message: '记录不存在' };
  return { __t: 'json', payload: null, message: '删除成功' };
}

module.exports = {
  listRecords,
  exportRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
};