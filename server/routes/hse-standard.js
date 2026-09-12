/**
 * 安全生产标准化评价中心路由 - HSE V2 Sprint4
 *
 * 端点（Phase 2: 条款管理）:
 *   GET    /tree                获取三级条款树
 *   GET    /stats               条款统计
 *   GET    /export              导出条款（JSON）
 *   GET    /:id                 获取条款详情
 *   POST   /                    新增条款
 *   PUT    /:id                 修改条款
 *   PUT    /:id/status          启用/停用条款
 *   POST   /import              批量导入条款
 *
 * 复用（不修改）:
 *   - middleware/auth.js     的 requireRole（角色校验）
 *   - middleware/response.js 的 success / error
 *   - services/standardService 标准条款管理业务逻辑
 */

const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { requireRole } = require('../middleware/auth');
const standardService = require('../services/standardService');

// ============================================================
// 1. 条款树查询
// ============================================================
router.get('/tree', async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const tree = await standardService.getClauseTree({ includeInactive });
    res.json(success(tree, '查询成功'));
  } catch (err) {
    console.error('[HSE-Standard] 条款树查询失败:', err);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

// ============================================================
// 2. 条款统计
// ============================================================
router.get('/stats', async (req, res) => {
  try {
    const stats = await standardService.getClauseStats();
    res.json(success(stats, '查询成功'));
  } catch (err) {
    console.error('[HSE-Standard] 条款统计失败:', err);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

// ============================================================
// 3. 导出条款（JSON格式）- 必须在 /:id 之前定义
// ============================================================
router.get('/export', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const clauses = await standardService.exportClauses();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="safety_standard_clauses_${Date.now()}.json"`
    );
    res.json(success(clauses, '导出成功'));
  } catch (err) {
    console.error('[HSE-Standard] 导出条款失败:', err);
    res.json(error(-1, `导出失败: ${err.message}`));
  }
});

// ============================================================
// 4. 条款详情
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.json(error(-1, '无效的ID'));
    }

    const clause = await standardService.getClauseById(id);
    if (!clause) {
      return res.json(error(404, '条款不存在'));
    }
    res.json(success(clause, '查询成功'));
  } catch (err) {
    console.error('[HSE-Standard] 条款详情查询失败:', err);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

// ============================================================
// 4. 新增条款
// ============================================================
router.post('/', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { code, level } = req.body;

    if (!code) {
      return res.json(error(-1, '条款编码不能为空'));
    }
    if (!level || ![1, 2, 3].includes(level)) {
      return res.json(error(-1, '条款层级不正确，必须是 1/2/3'));
    }

    const result = await standardService.createClause(req.body, req.user);
    res.json(success(result, '条款创建成功'));
  } catch (err) {
    console.error('[HSE-Standard] 创建条款失败:', err);
    res.json(error(-1, `创建失败: ${err.message}`));
  }
});

// ============================================================
// 5. 修改条款
// ============================================================
router.put('/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.json(error(-1, '无效的ID'));
    }

    const result = await standardService.updateClause(id, req.body, req.user);
    if (!result) {
      return res.json(error(404, '条款不存在'));
    }
    res.json(success(result, '条款更新成功'));
  } catch (err) {
    console.error('[HSE-Standard] 更新条款失败:', err);
    res.json(error(-1, `更新失败: ${err.message}`));
  }
});

// ============================================================
// 6. 启用/停用条款
// ============================================================
router.put('/:id/status', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.json(error(-1, '无效的ID'));
    }

    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) {
      return res.json(error(-1, '状态值不正确，只能是 active 或 inactive'));
    }

    const result = await standardService.setClauseStatus(id, status);
    res.json(success(result, status === 'active' ? '条款已启用' : '条款已停用'));
  } catch (err) {
    console.error('[HSE-Standard] 更新条款状态失败:', err);
    res.json(error(-1, `操作失败: ${err.message}`));
  }
});

// ============================================================
// 8. 批量导入条款
// ============================================================
router.post('/import', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { clauses } = req.body;
    if (!Array.isArray(clauses)) {
      return res.json(error(-1, '导入数据格式错误，clauses 必须是数组'));
    }

    const result = await standardService.batchImportClauses(clauses, req.user);
    res.json(success(result, '导入完成'));
  } catch (err) {
    console.error('[HSE-Standard] 导入条款失败:', err);
    res.json(error(-1, `导入失败: ${err.message}`));
  }
});

module.exports = router;
