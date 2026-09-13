/**
 * 保险模块 · 通用附件/版本管理服务（insurance_attachments / insurance_versions）—— PostgreSQL + 内存降级双模式
 * 从 routes/insurance.js 通用附件管理子域迁移（:bizType/:id/attachments、:bizType/:id/versions）。
 * 业务逻辑 + SQL，无 express 依赖（req.file 在 controller 层解析后传入文件元信息）。
 * 跨域共享辅助取自 services/insuranceShared（ensureAttachmentTables / memoryAttachments / memoryVersions）。
 */

const { pool, isConnected } = require('../config/db');
const { buildMemoryRecord, camelKeys } = require('../utils/commonResponse');
const {
  ensureAttachmentTables,
  memoryAttachments,
  memoryVersions,
} = require('./insuranceShared');

const VALID_BIZ_TYPES = ['vehicle', 'personnel', 'overage', 'other'];

// GET /:bizType/:id/attachments — 附件列表
async function listAttachments(bizType, id) {
  if (!VALID_BIZ_TYPES.includes(bizType)) return { __t: 'json', payload: null, message: '', error: { code: -1, message: '无效的业务类型' } };

  if (!isConnected()) {
    let data = memoryAttachments.filter(a => a.biz_type === bizType && a.biz_id === parseInt(id) && !a.is_deleted);
    return { __t: 'json', payload: data.map(camelKeys), message: '查询成功(内存模式)' };
  }

  await ensureAttachmentTables();
  const result = await pool.query(
    'SELECT * FROM insurance_attachments WHERE biz_type = $1 AND biz_id = $2 AND is_deleted = FALSE ORDER BY is_latest DESC, created_at DESC',
    [bizType, id]
  );
  return { __t: 'json', payload: result.rows.map(camelKeys), message: '查询成功' };
}

// POST /:bizType/:id/attachments — 上传附件（file 元信息由 controller 解析 req.file 后传入）
async function uploadAttachment(bizType, id, file, body) {
  if (!VALID_BIZ_TYPES.includes(bizType)) return { __t: 'json', payload: null, message: '', error: { code: -1, message: '无效的业务类型' } };
  if (!file) return { __t: 'json', payload: null, message: '', error: { code: -1, message: '请上传文件' } };

  const { version = '1.0', uploaded_by = 'admin' } = body;
  const fileUrl = file.fileUrl;
  const originalName = file.originalName;

  if (!isConnected()) {
    memoryAttachments.forEach(a => {
      if (a.biz_type === bizType && a.biz_id === parseInt(id) && a.is_latest) a.is_latest = false;
    });
    const record = buildMemoryRecord(memoryAttachmentIdCounter(), {
      biz_type: bizType,
      biz_id: parseInt(id),
      filename: file.filename,
      original_name: originalName,
      file_type: 'document',
      file_size: file.size,
      file_url: fileUrl,
      version,
      uploaded_by,
      is_latest: true,
    });
    memoryAttachments.push(record);
    memoryVersions.push(buildMemoryRecord(memoryVersionIdCounter(), {
      biz_type: bizType,
      biz_id: parseInt(id),
      version,
      change_type: 'create',
      change_summary: `上传附件 ${originalName}`,
      changed_by: uploaded_by,
    }));
    return { __t: 'json', payload: camelKeys(record), message: '上传成功(内存模式)' };
  }

  await ensureAttachmentTables();
  await pool.query(
    'UPDATE insurance_attachments SET is_latest = FALSE WHERE biz_type = $1 AND biz_id = $2 AND is_latest = TRUE',
    [bizType, id]
  );
  const result = await pool.query(`
    INSERT INTO insurance_attachments (biz_type, biz_id, filename, original_name, file_type, file_size, file_url, version, uploaded_by, is_latest)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE) RETURNING *
  `, [bizType, id, file.filename, originalName, 'document', file.size, fileUrl, version, uploaded_by]);

  await pool.query(`
    INSERT INTO insurance_versions (biz_type, biz_id, version, change_type, change_summary, changed_by)
    VALUES ($1, $2, $3, 'create', $4, $5)
  `, [bizType, id, version, `上传附件 ${originalName}`, uploaded_by]);

  return { __t: 'json', payload: camelKeys(result.rows[0]), message: '上传成功' };
}

// DELETE /:bizType/:id/attachments/:aid — 删除附件
async function deleteAttachment(bizType, id, aid) {
  if (!VALID_BIZ_TYPES.includes(bizType)) return { __t: 'json', payload: null, message: '', error: { code: -1, message: '无效的业务类型' } };

  if (!isConnected()) {
    const att = memoryAttachments.find(a => a.id === parseInt(aid) && a.biz_type === bizType && a.biz_id === parseInt(id) && !a.is_deleted);
    if (!att) return { __t: 'not-found', message: '附件不存在' };
    att.is_deleted = true;
    memoryVersions.push(buildMemoryRecord(memoryVersionIdCounter(), {
      biz_type: bizType,
      biz_id: parseInt(id),
      version: att.version,
      change_type: 'delete',
      change_summary: `删除附件 ${att.original_name}`,
      changed_by: 'admin',
    }));
    return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
  }

  await ensureAttachmentTables();
  const attResult = await pool.query(
    'SELECT * FROM insurance_attachments WHERE id = $1 AND biz_type = $2 AND biz_id = $3',
    [aid, bizType, id]
  );
  if (attResult.rows.length === 0) return { __t: 'not-found', message: '附件不存在' };

  await pool.query(
    'UPDATE insurance_attachments SET is_deleted = TRUE WHERE id = $1 AND biz_type = $2 AND biz_id = $3',
    [aid, bizType, id]
  );

  await pool.query(`
    INSERT INTO insurance_versions (biz_type, biz_id, version, change_type, change_summary, changed_by)
    VALUES ($1, $2, $3, 'delete', $4, $5)
  `, [bizType, id, attResult.rows[0].version, `删除附件 ${attResult.rows[0].original_name}`, 'admin']);

  return { __t: 'json', payload: null, message: '删除成功' };
}

// GET /:bizType/:id/versions — 历史版本履历
async function listVersions(bizType, id) {
  if (!VALID_BIZ_TYPES.includes(bizType)) return { __t: 'json', payload: null, message: '', error: { code: -1, message: '无效的业务类型' } };

  if (!isConnected()) {
    const data = memoryVersions.filter(v => v.biz_type === bizType && v.biz_id === parseInt(id));
    return { __t: 'json', payload: data.map(camelKeys), message: '查询成功(内存模式)' };
  }

  await ensureAttachmentTables();
  const result = await pool.query(
    'SELECT * FROM insurance_versions WHERE biz_type = $1 AND biz_id = $2 ORDER BY created_at DESC',
    [bizType, id]
  );
  return { __t: 'json', payload: result.rows.map(camelKeys), message: '查询成功' };
}

// 内存自增计数器（原 insuranceAttachmentIdCounter / insuranceVersionIdCounter 收敛于此）
let aCounter = 1;
let vCounter = 1;
function memoryAttachmentIdCounter() { return aCounter++; }
function memoryVersionIdCounter() { return vCounter++; }

module.exports = {
  VALID_BIZ_TYPES,
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  listVersions,
};