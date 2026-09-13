/**
 * 培训模块（/api/training）· 附件与版本 —— service
 * 端点点簇：GET/POST /records/:id/attachments、DELETE /records/:id/attachments/:aid、
 *           GET /records/:id/versions。
 * 保留 PostgreSQL + 内存降级；DB 异常原样透传给 controller 走 next(err)（与原 catch→next 一致）。
 */
const shared = require('./trainingShared');
const {
  pool, isConnected, ensureTables, initMemoryData,
  memoryTrainingAttachments, memoryTrainingVersions, buildMemoryRecord, camelKeys,
} = shared;

// ========== GET /records/:id/attachments — 附件列表 ==========
async function listAttachments(id, version) {
  if (!isConnected()) {
    initMemoryData();
    let data = memoryTrainingAttachments.filter(a => a.record_id === parseInt(id) && !a.is_deleted);
    if (version) data = data.filter(a => a.version === version);
    return { __t: 'json', payload: data.map(camelKeys), message: '查询成功(内存模式)' };
  }

  await ensureTables();

  let sql = 'SELECT * FROM training_attachments WHERE record_id = $1 AND is_deleted = FALSE';
  const params = [id];
  let paramIdx = 1;
  if (version) {
    paramIdx++;
    sql += ` AND version = $${paramIdx}`;
    params.push(version);
  }
  sql += ' ORDER BY is_latest DESC, created_at DESC';

  const result = await pool.query(sql, params);
  return { __t: 'json', payload: result.rows.map(camelKeys), message: '查询成功' };
}

// ========== POST /records/:id/attachments — 上传附件 ==========
// file 由 controller 解析为 {filename, originalName, size, fileUrl}，此处仅处理落库。
async function uploadAttachment(id, file, body) {
  if (!file) return { __t: 'error', code: -1, message: '请上传文件' };

  const { version = '1.0', uploaded_by = 'admin' } = body || {};

  if (!isConnected()) {
    initMemoryData();
    memoryTrainingAttachments.forEach(a => {
      if (a.record_id === parseInt(id) && a.is_latest) a.is_latest = false;
    });
    const record = buildMemoryRecord(shared.trainingAttachmentIdCounter++, {
      record_id: parseInt(id),
      filename: file.filename,
      original_name: file.originalName,
      file_type: 'document',
      file_size: file.size,
      file_url: file.fileUrl,
      version,
      uploaded_by,
      is_latest: true,
    });
    memoryTrainingAttachments.push(record);
    // 同步记录版本履历
    memoryTrainingVersions.push(buildMemoryRecord(shared.trainingVersionIdCounter++, {
      record_id: parseInt(id),
      version,
      change_type: 'create',
      change_summary: `上传附件 ${file.originalName}`,
      changed_by: uploaded_by,
    }));
    return { __t: 'json', payload: camelKeys(record), message: '上传成功(内存模式)' };
  }

  await ensureTables();

  await pool.query(
    'UPDATE training_attachments SET is_latest = FALSE WHERE record_id = $1 AND is_latest = TRUE',
    [id]
  );

  const result = await pool.query(`
    INSERT INTO training_attachments (record_id, filename, original_name, file_type, file_size, file_url, version, uploaded_by, is_latest)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
    RETURNING *
  `, [id, file.filename, file.originalName, 'document', file.size, file.fileUrl, version, uploaded_by]);

  // 同步记录版本履历
  await pool.query(`
    INSERT INTO training_versions (record_id, version, change_type, change_summary, changed_by)
    VALUES ($1, $2, 'create', $3, $4)
  `, [id, version, `上传附件 ${file.originalName}`, uploaded_by]);

  return { __t: 'json', payload: camelKeys(result.rows[0]), message: '上传成功' };
}

// ========== DELETE /records/:id/attachments/:aid — 删除附件 ==========
async function deleteAttachment(id, aid) {
  if (!isConnected()) {
    initMemoryData();
    const att = memoryTrainingAttachments.find(a => a.id === parseInt(aid) && a.record_id === parseInt(id) && !a.is_deleted);
    if (!att) return { __t: 'not-found', message: '附件不存在' };
    att.is_deleted = true;
    // 记录删除履历
    memoryTrainingVersions.push(buildMemoryRecord(shared.trainingVersionIdCounter++, {
      record_id: parseInt(id),
      version: att.version,
      change_type: 'delete',
      change_summary: `删除附件 ${att.original_name}`,
      changed_by: 'admin',
    }));
    return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
  }

  await ensureTables();

  const result = await pool.query(
    'UPDATE training_attachments SET is_deleted = TRUE WHERE id = $1 AND record_id = $2 RETURNING id',
    [aid, id]
  );
  if (result.rows.length === 0) return { __t: 'not-found', message: '附件不存在' };
  return { __t: 'json', payload: null, message: '删除成功' };
}

// ========== GET /records/:id/versions — 历史版本履历 ==========
async function listVersions(id) {
  if (!isConnected()) {
    initMemoryData();
    const data = memoryTrainingVersions.filter(v => v.record_id === parseInt(id));
    return { __t: 'json', payload: data.map(camelKeys), message: '查询成功(内存模式)' };
  }

  await ensureTables();

  const result = await pool.query(
    'SELECT * FROM training_versions WHERE record_id = $1 ORDER BY created_at DESC',
    [id]
  );
  return { __t: 'json', payload: result.rows.map(camelKeys), message: '查询成功' };
}

module.exports = {
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  listVersions,
};