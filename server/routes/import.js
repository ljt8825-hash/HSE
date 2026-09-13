/**
 * HSE 智能导入 API 路由 —— 纯聚合入口
 * 业务已按能力拆至 services/ + controllers/ + routes/import/main.js，本文件仅负责挂载，
 * 对外路由契约逐字节不变（挂载点 /api/import，由 app.js app.use('/api/import', importRoutes) 依赖）。
 *
 * 接口（与原实现逐一对应）：
 *   POST /api/import/parse            — 解析文件（Node 原生解析优先，Python 引擎 fallback）
 *   POST /api/import/confirm          — 确认入库（原生入库/内存模式，Python 引擎 fallback）
 *   POST /api/import/rollback         — 回滚
 *   GET  /api/import/logs             — 查询导入日志
 *   GET  /api/import/config           — 查询字段映射配置
 *   GET  /api/import/template/:module — 下载模板（CSV/XLSX）
 *   POST /api/import/upload           — 上传 Excel 并解析
 *   GET  /api/import/stats            — 导入统计
 *
 * 能力归属：
 *   - 共享辅助（callPython / parseExcelNative / 图片抽取 / 模板数据 / Mojibake 防御等）→ services/importShared.js
 *   - 原生入库 confirmImportNative → services/importExcelService.js
 *   - 内存模式入库 confirmImportMemory → services/importMemoryService.js
 *   - 查询类（logs/config/stats）→ services/importQueryService.js
 *   - 薄控制层 → controllers/import.js（注意：controllers/hse-import.js 是「人员主数据员工导入」控制器，不在此域）
 *   - 纯绑定子路由 → routes/import/main.js
 */

const express = require('express');
const router = express.Router();

// ============================================================
// 子路由挂载（业务全部下沉，此处只做聚合）
// ============================================================
router.use('/', require('./import/main'));

// ============================================================
// 模块级导出转发（保持原内部符号可被 require('../routes/import').xxx 引用）
// 兼容 _debug_test.js 等脚本对 fixDateValue 的直接引用；如后续测试需原文件内部
// 符号，同样从这里单例转发（参照 insurance 父文件文尾转发做法）。
// ============================================================
module.exports = router;
module.exports.fixDateValue = require('../services/importShared').fixDateValue;