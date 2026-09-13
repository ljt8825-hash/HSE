/**
 * 三违记录（/api/violations）—— 子路由绑定层
 * 仅绑定路径 → 方法 → 中间件 → controller 函数，严格按原 routes/violations.js 的端点注册顺序。
 * 权限（requireRole('admin','safety_manager')）在此层绑定。
 *
 * 关键顺序约束（与原文件一致，不可调整）：
 *  - /stats、/filter-options 必须注册在 /:id 之前，避免被参数路由遮蔽。
 *  - DELETE /batch 必须注册在 DELETE /:id 之前，避免被参数路由遮蔽。
 */
const express = require('express');
const router = express.Router();
const { requireRole } = require('../../middleware/auth');
const ctl = require('../../controllers/violationController');

const WRITER = requireRole('admin', 'safety_manager');

// 1-3. 列表 + 统计 + 筛选选项（均先于 /:id）
router.get('/', ctl.list);
router.get('/stats', ctl.stats);
router.get('/filter-options', ctl.filterOptions);

// 4. 单条详情
router.get('/:id', ctl.detail);

// 5. 新建（写限权）
router.post('/', WRITER, ctl.create);

// 6. 更新
router.put('/:id', WRITER, ctl.update);

// 7. 批量删除（必须先于 DELETE /:id）
router.delete('/batch', WRITER, ctl.batchDelete);

// 8. 单条删除
router.delete('/:id', WRITER, ctl.remove);

// 9. CSV 导出（保持原序）
router.get('/export/csv', ctl.exportCsv);

// 10-11. 整改闭环
router.put('/:id/rectify', WRITER, ctl.rectify);
router.put('/:id/review', WRITER, ctl.review);

// 12-15. 统计（人员/高风险/部门/岗位）
router.get('/statistics/employee-count', ctl.statisticsEmployeeCount);
router.get('/statistics/high-risk', ctl.statisticsHighRisk);
router.get('/statistics/department-ranking', ctl.statisticsDepartmentRanking);
router.get('/statistics/position-ranking', ctl.statisticsPositionRanking);

module.exports = router;