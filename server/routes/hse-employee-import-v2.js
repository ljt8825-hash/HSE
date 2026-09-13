/**
 * HSE Sprint5.6 员工花名册导入 V2 路由 —— 纯聚合入口（不再承载业务 handler）
 *
 * 业务已按三层下沉至 services/employeeImportV2Service.js（全部业务 + SQL + 私有辅助函数 + 文件/XLSX/加密/审计调用）+
 * controllers/employeeImportV2Controller.js（薄 handler，统一解释 __t:'json' 描述符）+
 * routes/hse-employee-import-v2/main.js（纯绑定子路由，requireRole 与 multer 上传中间件留在绑定层，注册顺序与原文件逐条一致）。
 * 本文件仅负责挂载，对外路由契约逐字节不变（挂载点 /api/hse/employee-import/v2，由 app.js
 * `app.use('/api/hse/employee-import/v2', hseEmployeeImportV2Routes)` 依赖）。
 *
 * 兼容说明：源文件记录花名册导入流程（上传→解析→校验→组织/作业单元/岗位匹配→异常待审→正式入库），
 * 含高危清空能力；此处保持最简聚合，原文件仅导出 router（无内存单例导出），不与任何外部消费者耦合。
 * 流程约束（禁止直接写 employee；禁止硬编码组织与岗位规则）见 services/employeeImportV2Service.js 文件头保留。
 */

const express = require('express');
const router = express.Router();

// 子路由挂载（保持 /api/hse/employee-import/v2/... 契约与注册顺序不变）
router.use('/', require('./hse-employee-import-v2/main'));

module.exports = router;