/**
 * 保险模块路由 —— 纯聚合入口（不再承载业务 handler）
 *
 * 业务已按子域拆至 ./insurance/ 子路由，本文件仅负责挂载，对外路由契约逐字节不变（挂载点 /api/insurance）：
 *   ① /vehicle         → ./insurance/vehicle       （vehicles 表，批量导入/导出/CRUD/统计）
 *   ② /personnel       → ./insurance/personnel     （personnel_insurance 表，透视/统计/同步/批量/导入导出/规则/待办/CRUD）
 *   ③ /overage         → ./insurance/overage       （over_age_personnel 表，色敏读/导出/CRUD）
 *   ④ 通用附件/版本     → ./insurance/attachments   （:bizType/:id/attachments、:bizType/:id/versions）
 *   ⑤ /other           → ./insurance/other         （other_insurance 表，CRUD/统计/PDF 识别导入）
 *   ⑥ /policies        → ./insurance/policies      （insurance_policies 表，清单/采购 PDF/编辑/删除）
 *   ⑦ /stats/overview  → ./insurance/stats         （保险模块全量统计，供安全总览调用）
 *   ⑧ 受保护保单读取    → ./insurance/policy-read   （policies/:id/file、other/:id/file）
 *
 * 跨域共享辅助（maskIdCard / calcExpiryStatus / formatOverage / formatOtherInsurance / streamInsuranceFile 等）
 * 统一收敛在 services/insuranceShared.js；本文件不再新增任何业务逻辑。
 *
 * 兼容说明：原文件模块级导出的内存单例与纯函数（供固定时间/行为单元测试引用）在此经 insuranceShared 转发保留。
 */

const express = require('express');
const router = express.Router();

const shared = require('../services/insuranceShared');

// ============================================================
// 子路由挂载（各子路由路径互斥，挂载顺序不影响匹配）
// ============================================================
router.use('/', require('./insurance/vehicle'));
router.use('/', require('./insurance/personnel'));
router.use('/', require('./insurance/overage'));
router.use('/', require('./insurance/attachments'));
router.use('/', require('./insurance/other'));
router.use('/', require('./insurance/policies'));
router.use('/', require('./insurance/stats'));
router.use('/', require('./insurance/policy-read'));

module.exports = router;

// ============================================================
// 测试面向的单例 / 纯函数转发（与原 routes/insurance.js 导出逐名一致）
// ============================================================
module.exports.memoryStores = shared.memoryStores;
module.exports.memoryCounters = shared.memoryCounters;
module.exports.calcInsuranceStatus = shared.calcInsuranceStatus;
module.exports.calcPersonStatus = shared.calcPersonStatus;
module.exports.calcComplianceStatus = shared.calcComplianceStatus;
module.exports.complianceStatusSql = shared.complianceStatusSql;
module.exports.personLevelSql = shared.personLevelSql;
module.exports.getBusinessDayStr = shared.getBusinessDayStr;
module.exports.BUSINESS_DAY_SQL = shared.BUSINESS_DAY_SQL;
module.exports.policyStateSql = shared.policyStateSql;
module.exports.pickBestInsuranceRecord = shared.pickBestInsuranceRecord;
module.exports.compareInsuranceRecords = shared.compareInsuranceRecords;
module.exports.insuranceRecordRank = shared.insuranceRecordRank;
module.exports.activePolicySql = shared.activePolicySql;
module.exports.policyPivotSql = shared.policyPivotSql;