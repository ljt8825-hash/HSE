/**
 * 三违记录（/api/violations）—— 子路由绑定层
 * 仅绑定路径 → 方法 → 中间件 → controller 函数，严格按原 routes/violations.js 的端点注册顺序。
 * 权限（requireRole）在此层绑定。
 *
 * E-08-01 权限闸门（P2-B1-E-08-01 §六）：
 *  - 读端点 READ = requireRole('admin','hse_manager','safety_manager')——正式三违管理页
 *    不对 grid_inspector 开放（后端为真正闸门，非前端仅隐藏菜单）。
 *  - 写端点 WRITER 保持原样 requireRole('admin','safety_manager')（pre-existing 语义不重构）。
 *
 * 关键顺序约束（与原文件一致，不可调整）：
 *  - /stats、/filter-options、/export/csv、/statistics/* 必须注册在 /:id 之前，避免被参数路由遮蔽。
 *  - DELETE /batch 必须注册在 DELETE /:id 之前，避免被参数路由遮蔽。
 */
const express = require('express');
const router = express.Router();
const { requireRole } = require('../../middleware/auth');
const ctl = require('../../controllers/violationController');

const READ = requireRole('admin', 'hse_manager', 'safety_manager');
const WRITER = requireRole('admin', 'safety_manager');

// ==================== MOBILE-05：手机端三违现场录入最小权限修复 ====================
// 生产事实（MOBILE-04 审计 + 生产只读核验）：58 名持「管理员/乡镇作业中心经理」检查岗位的
// 登录用户系统角色全部为 grid_inspector；原 WRITER/READ 门禁使其经手机端提交正式三违
// （POST /）与回显结果（GET /:id、GET /:id/evidence-chain）必然 403。
// 最小放行（仅下述 3 个端点；列表/统计/导出/更新/删除等其余端点权限零变化）：
//   POST /                  —— 手机端提交三违（检查人身份与检查来源仍由服务端权威判定，
//                              E-08-08/09 fail-closed 链路不变，不信任任何客户端身份字段）
//   GET /:id                —— 手机端提交结果回显
//   GET /:id/evidence-chain —— 手机端责任对象/实际扣分回显
// 行级收紧：grid_inspector 对 2 个读端点仅可读取「本人为检查人」的记录
// （violation_records.inspector_id === users.employee_id），防止枚举他人记录；
// admin/hse_manager/safety_manager 保持原有全量语义。
const MOBILE_ITEM_READ = requireRole('admin', 'hse_manager', 'safety_manager', 'grid_inspector');

/** 行级守卫：grid_inspector 仅可读取本人为检查人的三违记录（其余角色直通，维持原语义）。 */
async function guardOwnInspectedRecord(req, res, next) {
  if (!req.user || req.user.role !== 'grid_inspector') return next();
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(403).json({ success: false, code: 403, message: '权限不足，无法执行此操作' });
    }
    const { pool } = require('../../config/db');
    const uR = await pool.query('SELECT employee_id FROM users WHERE id = $1', [req.user.id]);
    const userEmployeeId = uR.rows[0]?.employee_id;
    if (userEmployeeId == null) {
      return res.status(403).json({ success: false, code: 403, message: '当前账号未绑定员工身份，无法查看三违记录' });
    }
    const vR = await pool.query('SELECT inspector_id FROM violation_records WHERE id = $1', [id]);
    const inspectorId = vR.rows[0]?.inspector_id;
    if (inspectorId == null || Number(inspectorId) !== Number(userEmployeeId)) {
      return res.status(403).json({ success: false, code: 403, message: '仅可查看本人检查的三违记录' });
    }
    return next();
  } catch (err) {
    console.error('[violations guardOwnInspectedRecord]', err.message);
    return res.status(403).json({ success: false, code: 403, message: '权限不足，无法执行此操作' });
  }
}

// 1-3. 列表 + 统计 + 筛选选项（均先于 /:id）
router.get('/', READ, ctl.list);
router.get('/stats', READ, ctl.stats);
router.get('/filter-options', READ, ctl.filterOptions);

// 4a. 证据链（E-08-01：vr→candidate→gir→deduction→audit，只读；先于 /:id 注册）
//     MOBILE-05：追加 grid_inspector（行级守卫收紧为本人检查的记录）
router.get('/:id/evidence-chain', MOBILE_ITEM_READ, guardOwnInspectedRecord, ctl.evidenceChain);

// 4b. 单条详情（MOBILE-05：追加 grid_inspector，同上行级守卫）
router.get('/:id', MOBILE_ITEM_READ, guardOwnInspectedRecord, ctl.detail);

// 5. 新建（写限权；MOBILE-05：追加 grid_inspector——手机端现场提交，身份仍服务端派生）
router.post('/', requireRole('admin', 'safety_manager', 'grid_inspector'), ctl.create);

// 6. 更新
router.put('/:id', WRITER, ctl.update);

// 7. 批量删除（必须先于 DELETE /:id）
router.delete('/batch', WRITER, ctl.batchDelete);

// 8. 单条删除
router.delete('/:id', WRITER, ctl.remove);

// 9. CSV 导出（保持原序）
router.get('/export/csv', READ, ctl.exportCsv);

// 10-11. 整改闭环
router.put('/:id/rectify', WRITER, ctl.rectify);
router.put('/:id/review', WRITER, ctl.review);

// 12-15. 统计（人员/高风险/部门/岗位）
router.get('/statistics/employee-count', READ, ctl.statisticsEmployeeCount);
router.get('/statistics/high-risk', READ, ctl.statisticsHighRisk);
router.get('/statistics/department-ranking', READ, ctl.statisticsDepartmentRanking);
router.get('/statistics/position-ranking', READ, ctl.statisticsPositionRanking);

module.exports = router;
