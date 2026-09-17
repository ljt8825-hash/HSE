/**
 * 知识源服务（AI-05）
 * 数据模型：knowledge_sources（server/sql/ai05_knowledge_base_v1.sql）
 */

const { pool } = require('../../../config/db');

const SOURCE_TYPES = ['manual_upload', 'system_document', 'policy', 'regulation', 'procedure', 'training'];
const SOURCE_STATUS = ['ACTIVE', 'DISABLED'];

/** 创建知识源 */
async function createSource({ sourceId, name, type = 'manual_upload', description = null, createdBy = null }) {
  if (!sourceId || !name) throw new Error('source_id 与 name 必填');
  if (!SOURCE_TYPES.includes(type)) throw new Error(`type 必须是 ${SOURCE_TYPES.join('/')} 之一`);
  const r = await pool.query(
    `INSERT INTO knowledge_sources (source_id, name, type, description, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, source_id, name, type, description, status, created_at, updated_at`,
    [String(sourceId).trim(), String(name).trim(), type, description, createdBy]
  );
  return r.rows[0];
}

/** 列出知识源（可过滤 status；默认全部） */
async function listSources({ status = null } = {}) {
  if (status && !SOURCE_STATUS.includes(status)) throw new Error(`status 必须是 ${SOURCE_STATUS.join('/')} 之一`);
  const r = status
    ? await pool.query('SELECT * FROM knowledge_sources WHERE status = $1 ORDER BY id', [status])
    : await pool.query('SELECT * FROM knowledge_sources ORDER BY id');
  return r.rows;
}

/** 按 id 或 source_id 取单个知识源 */
async function getSource(idOrSourceId) {
  const r = /^\d+$/.test(String(idOrSourceId))
    ? await pool.query('SELECT * FROM knowledge_sources WHERE id = $1', [Number(idOrSourceId)])
    : await pool.query('SELECT * FROM knowledge_sources WHERE source_id = $1', [String(idOrSourceId)]);
  return r.rows[0] || null;
}

/** 更新知识源（name/type/description） */
async function updateSource(id, { name, type, description }) {
  const sets = [];
  const vals = [];
  if (name != null) { sets.push(`name = $${sets.length + 1}`); vals.push(String(name).trim()); }
  if (type != null) {
    if (!SOURCE_TYPES.includes(type)) throw new Error(`type 必须是 ${SOURCE_TYPES.join('/')} 之一`);
    sets.push(`type = $${sets.length + 1}`); vals.push(type);
  }
  if (description !== undefined) { sets.push(`description = $${sets.length + 1}`); vals.push(description); }
  if (sets.length === 0) throw new Error('没有可更新的字段');
  sets.push(`updated_at = NOW()`);
  vals.push(Number(id));
  const r = await pool.query(
    `UPDATE knowledge_sources SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
    vals
  );
  return r.rows[0] || null;
}

/** 启用/禁用知识源（status=DISABLED 时其下文档检索默认排除） */
async function setSourceStatus(id, status) {
  if (!SOURCE_STATUS.includes(status)) throw new Error(`status 必须是 ${SOURCE_STATUS.join('/')} 之一`);
  const r = await pool.query(
    'UPDATE knowledge_sources SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [status, Number(id)]
  );
  return r.rows[0] || null;
}

/** 源下文档计数 */
async function countDocuments(sourceId) {
  const r = await pool.query('SELECT count(*)::int AS c FROM knowledge_documents WHERE source_id = $1', [Number(sourceId)]);
  return r.rows[0].c;
}

module.exports = {
  SOURCE_TYPES,
  SOURCE_STATUS,
  createSource,
  listSources,
  getSource,
  updateSource,
  setSourceStatus,
  countDocuments,
};
