/**
 * HSE 人员主数据中心路由 —— 纯聚合入口（不再承载业务 handler）
 *
 * 业务按领域拆至 ./hse-employee/ 子路由，本文件仅负责挂载，对外路由契约不变：
 *   ① 员工 CRUD          → ./hse-employee/employee       （employee 表）
 *   ② 组织树管理          → ./hse-employee/org-tree       （department 表, 五级树形）
 *   ③ 岗位管理            → ./hse-employee/position       （position 表）
 *   ④ 人员组织关系维护     → ./hse-employee/assignment     （employee_assignment, 调岗/状态变更）
 *   ⑤ 人事变动记录        → ./hse-employee/history        （employee_history）
 *   ⑥ 员工导入            → ./hse-employee/import         （JSON + Excel）
 *   ⑦ 证件管理            → ./hse-employee/certificates   （employee_certificate）
 *   ⑧ 一人一档/岗位画像    → ./hse-employee/safety-profiles
 *   ⑨ 岗位培训要求/培训系列 → ./hse-employee/trainings
 *   Sprint5.4 检查管理中心  → ./hse-employee/inspection-center
 *   Sprint5.7 员工档案中心  → ./hse-employee/profile-center
 *   Sprint5.8 员工公共选择  → ./hse-employee/selector
 *   Sprint11-2 超龄自动识别 → ./hse-employee/over-age
 *
 * 跨域共享辅助（ENCRYPT_FIELDS / buildOrgPath / buildOverAgeCondition 等）
 * 统一收敛在 ./hse-employee/_shared.js；不得在本文件新增业务逻辑。
 */

const express = require('express');
const router = express.Router();

// ============================================================
// 子路由挂载（挂载顺序不影响匹配；各子路由路径互斥）
// ============================================================

// 一、员工管理 —— 已拆至 ./hse-employee/employee
router.use('/', require('./hse-employee/employee'));
// 二、组织树管理 —— 已拆至 ./hse-employee/org-tree
router.use('/', require('./hse-employee/org-tree'));
// 三、岗位管理 —— 已拆至 ./hse-employee/position
router.use('/', require('./hse-employee/position'));
// 四、人员组织关系维护 —— 已拆至 ./hse-employee/assignment
router.use('/', require('./hse-employee/assignment'));
// 五、人事变动记录 —— 已拆至 ./hse-employee/history
router.use('/', require('./hse-employee/history'));
// 六、员工导入 —— 已拆至 ./hse-employee/import
router.use('/', require('./hse-employee/import'));
// 七、证件管理 (employee_certificate 表) —— 已拆至 ./hse-employee/certificates
router.use('/', require('./hse-employee/certificates'));

// 八、一人一档 (employee_safety_profile 表) & 九、岗位安全画像 —— 已拆至 ./hse-employee/safety-profiles
router.use('/', require('./hse-employee/safety-profiles'));

// 十、岗位培训要求 (position_training_requirement 表) & 培训系列(台账/入职/状态) —— 已拆至 ./hse-employee/trainings
router.use('/', require('./hse-employee/trainings'));

// Sprint5.4 HSE检查管理中心（检查计划/任务/记录/隐患/模板）—— 已拆至 ./hse-employee/inspection-center
router.use('/', require('./hse-employee/inspection-center'));

// Sprint5.7 员工档案中心（基于 v_employee_current 视图）—— 已拆至 ./hse-employee/profile-center
router.use('/', require('./hse-employee/profile-center'));

// Sprint5.8 员工公共选择（培训/保险/三违/隐患/消防等模块复用）—— 已拆至 ./hse-employee/selector
router.use('/', require('./hse-employee/selector'));

// Sprint11-2 超龄人员自动识别（基于 employee 表 birth_date，阈值见 config/hseRules）—— 已拆至 ./hse-employee/over-age
router.use('/', require('./hse-employee/over-age'));

module.exports = router;
