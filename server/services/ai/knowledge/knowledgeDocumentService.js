/**
 * 知识文档服务（AI-05）
 * 数据模型：knowledge_documents / knowledge_chunks / knowledge_embeddings。
 * 生命周期：create（DRAFT，记录 content_hash）→ parse（PARSING → READY/FAILED）
 *          → chunk（生成 knowledge_chunks）→ index（embed + 向量入库）。
 * 幂等：content_hash 相同 → 返回既有 READY 文档（不重复建）。
 */

const { pool } = require('../../../config/db');
const { parseDocument } = require('./knowledgeParser');
const { chunkText, sha256Hex } = require('./knowledgeChunker');
const embeddingService = require('./embeddingService');
const vectorStore = require('./vectorStore');
const sourceService = require('./knowledgeSourceService');

const DOC_STATUS = {
  DRAFT: 'DRAFT',
  PARSING: 'PARSING',
  READY: 'READY',
  FAILED: 'FAILED',
  DISABLED: 'DISABLED',
};

/** 文档列表（可按 sourceId/status 过滤） */
async function listDocuments({ sourceId = null, status = null } = {}) {
  const conds = [];
  const vals = [];
  if (sourceId != null) { conds.push('d.source_id = $' + (vals.length + 1)); vals.push(Number(sourceId)); }
  if (status) { conds.push('d.status = $' + (vals.length + 1)); vals.push(status); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const r = await pool.query(
    `SELECT d.*, s.name AS source_name, s.type AS source_type, s.status AS source_status,
            (SELECT count(*)::int FROM knowledge_chunks c WHERE c.document_id = d.id) AS chunk_count
     FROM knowledge_documents d
     JOIN knowledge_sources s ON s.id = d.source_id
     ${where}
     ORDER BY d.id DESC`,
    vals
  );
  return r.rows;
}

/** 单文档（含源信息） */
async function getDocument(id) {
  const r = await pool.query(
    `SELECT d.*, s.name AS source_name, s.type AS source_type, s.status AS source_status,
            (SELECT count(*)::int FROM knowledge_chunks c WHERE c.document_id = d.id) AS chunk_count
     FROM knowledge_documents d
     JOIN knowledge_sources s ON s.id = d.source_id
     WHERE d.id = $1`,
    [Number(id)]
  );
  return r.rows[0] || null;
}

/**
 * 创建文档（幂等：content_hash 命中既有 READY 文档直接返回）
 * @param {Object} input { sourceId, title, fileName, fileType, buffer, createdBy }
 */
async function createDocument({ sourceId, title, fileName = null, fileType = null, buffer = null, contentText = null, createdBy = null }) {
  const source = await sourceService.getSource(sourceId);
  if (!source) throw new Error(`知识源不存在: ${sourceId}`);
  if (source.status !== 'ACTIVE') throw new Error(`知识源已禁用: ${source.source_id}`);

  // 解析（有 buffer 则立即解析为纯文本；contentText 直通）
  let text = contentText;
  let parsedType = fileType;
  if (buffer) {
    const parsed = await parseDocument(buffer, { fileName, fileType });
    text = parsed.text;
    parsedType = parsed.fileType;
  }
  if (text == null) throw new Error('必须提供 buffer 或 contentText');
  text = String(text);

  const hash = sha256Hex(text);
  const dup = await pool.query(
    `SELECT * FROM knowledge_documents WHERE content_hash = $1 AND source_id = $2 ORDER BY id DESC LIMIT 1`,
    [hash, source.id]
  );
  if (dup.rows[0]) return { duplicated: true, document: dup.rows[0] };

  const r = await pool.query(
    `INSERT INTO knowledge_documents (source_id, title, file_name, file_type, status, content, content_hash, created_by)
     VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7)
     RETURNING *`,
    [source.id, String(title).trim(), fileName, parsedType || null, text, hash, createdBy]
  );
  return { duplicated: false, document: r.rows[0] };
}

/** 解析文档：PARSING → READY/FAILED（存储解析后纯文本） */
async function parseDocumentById(id) {
  const doc = await getDocument(id);
  if (!doc) throw new Error(`文档不存在: ${id}`);

  await pool.query(`UPDATE knowledge_documents SET status='PARSING', parse_error=NULL, updated_at=NOW() WHERE id=$1`, [doc.id]);
  try {
    if (!doc.content) throw new Error('文档无内容可解析（创建时必须提供 buffer/contentText）');
    const hash = sha256Hex(doc.content);
    const r = await pool.query(
      `UPDATE knowledge_documents SET status='READY', content_hash=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [doc.id, hash]
    );
    return r.rows[0];
  } catch (err) {
    await pool.query(
      `UPDATE knowledge_documents SET status='FAILED', parse_error=$2, updated_at=NOW() WHERE id=$1`,
      [doc.id, String(err.message).slice(0, 2000)]
    );
    throw err;
  }
}

/** 分块：删除旧 chunks（含向量级联）并生成新 chunks */
async function chunkDocument(id, opts = {}) {
  const doc = await getDocument(id);
  if (!doc) throw new Error(`文档不存在: ${id}`);
  if (doc.status !== 'READY') throw new Error(`文档状态必须是 READY（当前 ${doc.status}）`);

  const chunks = chunkText(doc.content, { fileType: doc.file_type || 'txt', ...opts });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM knowledge_chunks WHERE document_id = $1', [doc.id]); // 级联清 embeddings
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      await client.query(
        `INSERT INTO knowledge_chunks (document_id, chunk_index, content, char_count, token_estimate, page, section, metadata, content_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [doc.id, i, c.content, c.char_count, c.token_estimate, c.page, c.section, JSON.stringify(c.metadata), c.content_hash]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { documentId: doc.id, chunksCount: chunks.length };
}

/** 索引：对全部 chunks 批量 embed 并写入向量表 */
async function indexDocument(id, opts = {}) {
  const doc = await getDocument(id);
  if (!doc) throw new Error(`文档不存在: ${id}`);
  if (doc.status !== 'READY') throw new Error(`文档状态必须是 READY（当前 ${doc.status}）`);

  const chunks = (await pool.query('SELECT * FROM knowledge_chunks WHERE document_id = $1 ORDER BY chunk_index', [doc.id])).rows;
  if (chunks.length === 0) {
    await chunkDocument(id, opts);
    return indexDocument(id, opts);
  }

  const embed = await embeddingService.embedTexts(chunks.map((c) => c.content), opts);
  if (embed.embeddings.length !== chunks.length) {
    throw new Error(`embedding 数量不符: ${embed.embeddings.length} != ${chunks.length}`);
  }
  const inserted = await vectorStore.upsertEmbeddings(
    chunks.map((c, i) => ({ chunkId: c.id, model: embed.model, dimension: embed.dimension, vector: embed.embeddings[i] }))
  );
  return { documentId: doc.id, chunksCount: chunks.length, embedded: inserted, model: embed.model, dimension: embed.dimension };
}

/** 禁用/启用文档（DISABLED 文档不参与检索） */
async function setDocumentStatus(id, status) {
  if (!Object.values(DOC_STATUS).includes(status)) throw new Error(`status 非法: ${status}`);
  const r = await pool.query('UPDATE knowledge_documents SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [status, Number(id)]);
  return r.rows[0] || null;
}

/** 文档的 chunks（检索/调试用） */
async function listChunks(documentId) {
  const r = await pool.query(
    'SELECT id, chunk_index, content, char_count, token_estimate, page, section, metadata, content_hash FROM knowledge_chunks WHERE document_id = $1 ORDER BY chunk_index',
    [Number(documentId)]
  );
  return r.rows;
}

module.exports = {
  DOC_STATUS,
  listDocuments,
  getDocument,
  createDocument,
  parseDocumentById,
  chunkDocument,
  indexDocument,
  setDocumentStatus,
  listChunks,
};
