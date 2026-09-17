/**
 * 知识库 API 路由（AI-05）
 * 挂载前缀：/api/hse/ai/v2/knowledge（app.js）
 *
 * 链路：Route → RAG Service → AI Gateway → Provider Registry → Ollama（禁止直连）。
 * 权限：写操作 requireRole('admin','safety_manager')；读/检索任意登录用户。
 */
const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const ctl = require('../controllers/knowledgeController');

const KB_WRITER = requireRole('admin', 'safety_manager');

// ---- Sources ----
router.get('/sources', ctl.listSources);
router.post('/sources', KB_WRITER, ctl.createSource);
router.post('/sources/:id/enable', KB_WRITER, ctl.setSourceStatus);
router.post('/sources/:id/disable', KB_WRITER, ctl.setSourceStatus);

// ---- Documents ----
router.get('/documents', ctl.listDocuments);
router.post('/documents', KB_WRITER, ctl.createDocument);
router.post('/documents/:id/parse', KB_WRITER, ctl.parseDocument);
router.post('/documents/:id/index', KB_WRITER, ctl.indexDocument);
router.post('/documents/:id/enable', KB_WRITER, ctl.setDocumentStatus);
router.post('/documents/:id/disable', KB_WRITER, ctl.setDocumentStatus);

// ---- Search / RAG ----
router.post('/search', ctl.search);
router.post('/rag', ctl.rag);

module.exports = router;
