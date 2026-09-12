/**
 * WPS 多维表接入层 · 管理 Controller（Sprint-WPS-01）
 *
 * 挂载：app.use('/api/wps/dbsheet', authMiddleware, requireRole('system_admin','admin'))
 *       （在 app.js 中显式启用，确保前端/普通用户无权访问，防凭证/结构泄露）
 *
 * 端点（全部只读或受控自清理，不切换 PC 数据源）：
 *   GET  /schema            读取多维表结构（数据表/视图/字段/类型/ID）
 *   GET  /records?limit=N   列举记录（仅 N 条，避免前端窥探全量业务数据）
 *   GET  /records/:id       读取单条
 *   POST /integration-test  受控 CRUD 演练（WPS-INTEGRATION-TEST 标记，自清理）
 *   POST /cleanup           兜底清理残留测试记录
 */
const express = require('express');
const router = express.Router();
const { success } = require('../middleware/response');
const service = require('../services/wps/gridInspectionService');

async function safe(res, fn, okMsg) {
  try {
    res.json(success(await fn(), okMsg));
  } catch (e) {
    // 关键：只回稳定 safeMessage，绝不泄露 WPS 原始错误细节/Token/头/路径
    res.status(502).json({ code: -1, success: false, message: (e && e.safeMessage) || 'WPS 接入异常', data: null });
  }
}

// GET /schema
router.get('/schema', (req, res) => safe(res, () => service.schema(), '查询 Schema 成功'));

// GET /records?limit=20
router.get('/records', (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  safe(res, () => service.list({ limit }), '查询记录成功');
});

// GET /records/:id
router.get('/records/:id', (req, res) => {
  safe(res, async () => {
    const row = await service.get(req.params.id);
    if (!row) return { found: false };
    return { found: true, record: row };
  }, '查询记录成功');
});

// POST /integration-test
router.post('/integration-test', (req, res) => {
  safe(res, () => service.integrationTest(), '集成测试执行完成');
});

// POST /cleanup
router.post('/cleanup', (req, res) => {
  safe(res, () => service.cleanupTestRecords(), '清理完成');
});

module.exports = router;