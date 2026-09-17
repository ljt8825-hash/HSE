/**
 * 向量存储（AI-05）——PostgreSQL + pgvector
 *
 * 表：knowledge_embeddings（chunk_id 唯一，vector(768)）。
 * 接口：upsertEmbeddings / search / deleteByDocument / count / isAvailable。
 * 说明：pgvector 0.8.2 已在开发库安装（用户授权 2026-09-15）；未安装时 isAvailable=false，
 *      上层如实上报 BLOCKED，绝不伪造向量能力。
 */

const { pool } = require('../../../config/db');

/** 向量可用性（真实探测 vector 类型） */
async function isAvailable() {
  try {
    const r = await pool.query(`SELECT to_regtype('vector') AS t`);
    return r.rows[0].t != null;
  } catch {
    return false;
  }
}

/**
 * upsert 一批 chunk 向量（同 chunk 先删后插，保证唯一）
 * @param {Array<{chunkId:number, model:string, dimension:number, vector:number[]}>} items
 * @returns {Promise<number>} 写入条数
 */
async function upsertEmbeddings(items) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const it of items) {
      await client.query('DELETE FROM knowledge_embeddings WHERE chunk_id = $1', [Number(it.chunkId)]);
      await client.query(
        `INSERT INTO knowledge_embeddings (chunk_id, model, dimension, vector)
         VALUES ($1, $2, $3, $4::vector)`,
        [Number(it.chunkId), it.model, it.dimension, JSON.stringify(it.vector)]
      );
    }
    await client.query('COMMIT');
    return items.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 向量相似检索（余弦距离 → 相似度 1-d）
 * @param {number[]} queryVector
 * @param {Object} opts { topK, filters: { sourceId, sourceType, documentId, sourceStatus, documentStatus } }
 * @returns {Promise<Array<{chunkId, documentId, sourceId, content, page, section, metadata, score, model, documentTitle, sourceName, sourceType}>>}
 */
async function search(queryVector, opts = {}) {
  const topK = Math.min(Math.max(parseInt(opts.topK) || 5, 1), 20);
  const filters = opts.filters || {};
  const conds = [];
  const vals = [];
  vals.push(JSON.stringify(queryVector));

  if (filters.documentId != null) { conds.push(`c.document_id = $${vals.length + 1}`); vals.push(Number(filters.documentId)); }
  if (filters.sourceId != null) { conds.push(`d.source_id = $${vals.length + 1}`); vals.push(Number(filters.sourceId)); }
  if (filters.sourceType) { conds.push(`s.type = $${vals.length + 1}`); vals.push(filters.sourceType); }
  if (filters.sourceStatus) { conds.push(`s.status = $${vals.length + 1}`); vals.push(filters.sourceStatus); }
  if (filters.documentStatus) { conds.push(`d.status = $${vals.length + 1}`); vals.push(filters.documentStatus); }
  // 默认仅检索启用源 + READY 文档
  if (!filters.sourceStatus) conds.push(`s.status = 'ACTIVE'`);
  if (!filters.documentStatus) conds.push(`d.status = 'READY'`);

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const r = await pool.query(
    `SELECT e.chunk_id AS "chunkId", c.document_id AS "documentId", d.source_id AS "sourceId",
            c.content, c.page, c.section, c.metadata, c.chunk_index AS "chunkIndex",
            d.title AS "documentTitle", s.name AS "sourceName", s.type AS "sourceType",
            e.model, e.dimension, (1 - (e.vector <=> $1::vector)) AS score
     FROM knowledge_embeddings e
     JOIN knowledge_chunks c ON c.id = e.chunk_id
     JOIN knowledge_documents d ON d.id = c.document_id
     JOIN knowledge_sources s ON s.id = d.source_id
     ${where}
     ORDER BY e.vector <=> $1::vector
     LIMIT ${topK}`,
    vals
  );
  return r.rows.map((row) => ({
    ...row,
    score: Number(Number(row.score).toFixed(6)),
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
  }));
}

/** 删除某文档全部向量（chunk 删除时级联） */
async function deleteByDocument(documentId) {
  const r = await pool.query(
    `DELETE FROM knowledge_embeddings WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE document_id = $1)`,
    [Number(documentId)]
  );
  return r.rowCount;
}

/** 向量总数（探针/测试用） */
async function count() {
  const r = await pool.query('SELECT count(*)::int AS c FROM knowledge_embeddings');
  return r.rows[0].c;
}

module.exports = { isAvailable, upsertEmbeddings, search, deleteByDocument, count };
