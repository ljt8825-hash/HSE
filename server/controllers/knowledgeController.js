/**
 * 知识库 API 控制器（AI-05）
 * 对应路由前缀：/api/hse/ai/v2/knowledge（routes/ai-knowledge.js）
 *
 * 权限：写操作（source/document 创建、parse/index、禁用）→ requireRole(admin, safety_manager)；
 *       读/检索（list、search、rag）→ 任意登录用户（与 v2 读端点惯例一致）。
 * userId 取认证上下文 req.user.id，不做身份推断（AI-02 基线）。
 */

const { toErrorResponse } = require('../services/ai/errors');
const sourceService = require('../services/ai/knowledge/knowledgeSourceService');
const docService = require('../services/ai/knowledge/knowledgeDocumentService');
const ragService = require('../services/ai/knowledge/ragService');

function ok(res, payload) {
  res.json({ success: true, ...payload });
}
function fail(res, err) {
  res.json(toErrorResponse(err));
}
function userIdOf(req) {
  return req.user && req.user.id != null ? req.user.id : null;
}

// ==================== Sources ====================

/** GET /sources */
async function listSources(req, res) {
  try {
    const status = req.query.status || null;
    const rows = await sourceService.listSources({ status });
    ok(res, { sources: rows, count: rows.length });
  } catch (err) { fail(res, err); }
}

/** POST /sources */
async function createSource(req, res) {
  try {
    const { sourceId, source_id, name, type, description } = req.body || {};
    const source = await sourceService.createSource({
      sourceId: sourceId || source_id,
      name,
      type,
      description,
      createdBy: userIdOf(req),
    });
    ok(res, { source });
  } catch (err) { fail(res, err); }
}

/** POST /sources/:id/enable | /disable */
async function setSourceStatus(req, res) {
  try {
    const status = String(req.path).includes('disable') ? 'DISABLED' : 'ACTIVE';
    const source = await sourceService.setSourceStatus(req.params.id, status);
    if (!source) throw new Error('知识源不存在');
    ok(res, { source });
  } catch (err) { fail(res, err); }
}

// ==================== Documents ====================

/** GET /documents */
async function listDocuments(req, res) {
  try {
    const rows = await docService.listDocuments({
      sourceId: req.query.sourceId != null ? req.query.sourceId : null,
      status: req.query.status || null,
    });
    ok(res, { documents: rows, count: rows.length });
  } catch (err) { fail(res, err); }
}

/** POST /documents（JSON：content = 纯文本；txt/md 最小闭环） */
async function createDocument(req, res) {
  try {
    const { sourceId, title, fileName, fileType, content } = req.body || {};
    const r = await docService.createDocument({
      sourceId,
      title,
      fileName,
      fileType,
      contentText: content,
      createdBy: userIdOf(req),
    });
    ok(res, { duplicated: r.duplicated, document: r.document });
  } catch (err) { fail(res, err); }
}

/** POST /documents/:id/parse */
async function parseDocument(req, res) {
  try {
    const doc = await docService.parseDocumentById(req.params.id);
    ok(res, { document: doc });
  } catch (err) { fail(res, err); }
}

/** POST /documents/:id/index（chunk + embed + 向量入库） */
async function indexDocument(req, res) {
  try {
    await docService.chunkDocument(req.params.id, req.body || {});
    const result = await docService.indexDocument(req.params.id, req.body || {});
    ok(res, result);
  } catch (err) { fail(res, err); }
}

/** POST /documents/:id/disable | /enable */
async function setDocumentStatus(req, res) {
  try {
    const status = String(req.path).includes('disable') ? 'DISABLED' : 'READY';
    const doc = await docService.setDocumentStatus(req.params.id, status);
    if (!doc) throw new Error('文档不存在');
    ok(res, { document: doc });
  } catch (err) { fail(res, err); }
}

// ==================== Search / RAG ====================

/** POST /search（纯检索，Top-K + score + filters） */
async function search(req, res) {
  try {
    const { question, query, topK, filters, provider } = req.body || {};
    const result = await ragService.search({ question: question || query, topK, filters, provider });
    ok(res, result);
  } catch (err) { fail(res, err); }
}

/** POST /rag（完整 RAG：检索 → 上下文 → AI Gateway → Ollama → Answer + Citation） */
async function rag(req, res) {
  try {
    const { question, query, topK, filters, provider, record } = req.body || {};
    const result = await ragService.rag({
      question: question || query,
      topK,
      filters,
      provider,
      record,
      userId: userIdOf(req),
    });
    ok(res, result);
  } catch (err) { fail(res, err); }
}

module.exports = {
  listSources,
  createSource,
  setSourceStatus,
  listDocuments,
  createDocument,
  parseDocument,
  indexDocument,
  setDocumentStatus,
  search,
  rag,
};
