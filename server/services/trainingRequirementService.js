/**
 * 培训模块（/api/training）· 培训要求管理（Sprint5.10）—— service
 * 端点点簇：/requirements 全套 CRUD。
 * 保留 PostgreSQL + 内存降级；controller 仅解释描述符。
 */
const shared = require('./trainingShared');
const {
  pool, isConnected, ensureTables, memoryRequirements, buildMemoryRecord, camelKeys,
  paginateMemory,
} = shared;

async function listRequirements(query) {
  if (!isConnected()) {
    let data = memoryRequirements.filter(r => !r.is_deleted);
    const { page = 1, pageSize = 20, positionId, keyword } = query;
    if (positionId) data = data.filter(r => r.position_id === parseInt(positionId));
    if (keyword) {
      const kw = keyword.toLowerCase();
      data = data.filter(r => (r.position_name && r.position_name.toLowerCase().includes(kw)) || (r.training_name && r.training_name.toLowerCase().includes(kw)));
    }
    const { list, total } = paginateMemory(data, page, pageSize);
    return { __t: 'list', list: list.map(camelKeys), total, page, pageSize, message: '查询成功(内存模式)' };
  }

  await ensureTables();
  const { page = 1, pageSize = 20, positionId, keyword } = query;
  let whereSql = ' WHERE is_deleted = false';
  const params = [];
  let paramIdx = 0;

  if (positionId) {
    paramIdx++;
    whereSql += ` AND position_id = $${paramIdx}`;
    params.push(parseInt(positionId));
  }
  if (keyword) {
    paramIdx++;
    whereSql += ` AND (position_name ILIKE $${paramIdx} OR training_name ILIKE $${paramIdx})`;
    params.push(`%${keyword}%`);
  }

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM training_requirements${whereSql}`, params);
  const total = countResult.rows[0].total;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  paramIdx++;
  params.push(parseInt(pageSize));
  paramIdx++;
  params.push(offset);

  const result = await pool.query(`SELECT * FROM training_requirements${whereSql} ORDER BY position_name, training_name LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`, params);
  return { __t: 'list', list: result.rows.map(camelKeys), total, page: parseInt(page), pageSize: parseInt(pageSize), message: '查询成功' };
}

async function getRequirement(id) {
  if (!isConnected()) {
    const record = memoryRequirements.find(r => r.id === parseInt(id) && !r.is_deleted);
    if (!record) return { __t: 'error', code: -2, message: '记录不存在' };
    return { __t: 'json', payload: camelKeys(record), message: '查询成功(内存模式)' };
  }

  await ensureTables();
  const result = await pool.query('SELECT * FROM training_requirements WHERE id = $1 AND is_deleted = false', [id]);
  if (result.rows.length === 0) return { __t: 'error', code: -2, message: '记录不存在' };
  return { __t: 'json', payload: camelKeys(result.rows[0]), message: '查询成功' };
}

async function createRequirement(body) {
  const b = body;
  if (!isConnected()) {
    const record = buildMemoryRecord(shared.requirementIdCounter++, {
      position_id: b.positionId || b.position_id || 0,
      position_name: b.positionName || b.position_name || '',
      training_name: b.trainingName || b.training_name || '',
      training_cycle: b.trainingCycle || b.training_cycle || '年度',
      is_required: b.isRequired !== undefined ? b.isRequired : true,
      duration_minutes: b.durationMinutes || b.duration_minutes || 60,
      remark: b.remark || '',
    });
    memoryRequirements.push(record);
    return { __t: 'json', payload: camelKeys(record), message: '创建成功(内存模式)' };
  }

  await ensureTables();
  const result = await pool.query(`
    INSERT INTO training_requirements (position_id, position_name, training_name, training_cycle, is_required, duration_minutes, remark)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.positionId || b.position_id || 0, b.positionName || b.position_name || '', b.trainingName || b.training_name || '',
     b.trainingCycle || b.training_cycle || '年度', b.isRequired !== undefined ? b.isRequired : true,
     b.durationMinutes || b.duration_minutes || 60, b.remark || '']);
  return { __t: 'json', payload: camelKeys(result.rows[0]), message: '创建成功' };
}

async function updateRequirement(id, body) {
  const b = body;
  if (!isConnected()) {
    const idx = memoryRequirements.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
    if (idx === -1) return { __t: 'error', code: -2, message: '记录不存在' };
    if (b.positionId !== undefined) memoryRequirements[idx].position_id = b.positionId;
    if (b.positionName !== undefined) memoryRequirements[idx].position_name = b.positionName;
    if (b.trainingName !== undefined) memoryRequirements[idx].training_name = b.trainingName;
    if (b.trainingCycle !== undefined) memoryRequirements[idx].training_cycle = b.trainingCycle;
    if (b.isRequired !== undefined) memoryRequirements[idx].is_required = b.isRequired;
    if (b.durationMinutes !== undefined) memoryRequirements[idx].duration_minutes = b.durationMinutes;
    if (b.remark !== undefined) memoryRequirements[idx].remark = b.remark;
    memoryRequirements[idx].updated_at = new Date().toISOString();
    return { __t: 'json', payload: camelKeys(memoryRequirements[idx]), message: '更新成功(内存模式)' };
  }

  await ensureTables();
  const result = await pool.query(`
    UPDATE training_requirements SET
      position_id = COALESCE($1, position_id),
      position_name = COALESCE($2, position_name),
      training_name = COALESCE($3, training_name),
      training_cycle = COALESCE($4, training_cycle),
      is_required = COALESCE($5, is_required),
      duration_minutes = COALESCE($6, duration_minutes),
      remark = COALESCE($7, remark),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $8 AND is_deleted = false RETURNING *`,
    [b.positionId, b.positionName, b.trainingName, b.trainingCycle, b.isRequired, b.durationMinutes, b.remark, id]);
  if (result.rows.length === 0) return { __t: 'error', code: -2, message: '记录不存在' };
  return { __t: 'json', payload: camelKeys(result.rows[0]), message: '更新成功' };
}

async function deleteRequirement(id) {
  if (!isConnected()) {
    const idx = memoryRequirements.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
    if (idx === -1) return { __t: 'error', code: -2, message: '记录不存在' };
    memoryRequirements[idx].is_deleted = true;
    return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
  }

  await ensureTables();
  const result = await pool.query('UPDATE training_requirements SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id', [id]);
  if (result.rows.length === 0) return { __t: 'error', code: -2, message: '记录不存在' };
  return { __t: 'json', payload: null, message: '删除成功' };
}

module.exports = {
  listRequirements,
  getRequirement,
  createRequirement,
  updateRequirement,
  deleteRequirement,
};