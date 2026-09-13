/**
 * HSE 人员主数据中心路由 - Sprint5.1 + Sprint5.1.1 生产加固 + Sprint-C Phase 1
 *
 * 依据: hse-employee-master-data-design-v1.2-freeze.md
 * 对应表: employee / department / position / employee_assignment / hse_org_unit / employee_history
 *
 * 功能模块:
 *   1. 员工 CRUD (employee 表, 无age, 年龄由视图计算)
 *   2. 组织树管理 (department 表, 五级树形)
 *   3. 岗位管理 (position 表)
 *   4. 人员组织关系维护 (employee_assignment, 含调岗流程) [Sprint-C Phase 1 迁移]
 *   5. 人事变动记录 (employee_history, 生命周期, 含 operator_id)
 *   6. 员工导入 (JSON + Excel)
 *
 * Sprint5.1.1 加固点:
 *   - 员工新增/更新/导入：使用 HMAC-SHA256 哈希列(id_card_hash/phone_hash)做唯一性校验
 *     (解决 AES-GCM 随机 IV 导致密文不可比较的问题)
 *   - 人事变动记录：所有 employee_history INSERT 写入 operator_id (来自 req.user.id)
 *   - Excel 导入：支持 .xlsx 模板下载、文件上传、解析、预览、校验、错误报告
 *
 * Sprint-C Phase 1 迁移点:
 *   - 人员组织关系从 hse_employee_org 迁移至 employee_assignment
 *   - 保持 API 接口契约不变（请求参数、响应结构）
 *   - hse_employee_org 已冻结为只读（仅供审计）
 *
 * 权限: admin / safety_manager 可写；其他角色只读
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { buildListResponse, buildDetailResponse, camelKeys } = require('../utils/commonResponse');
const { auditLog } = require('./audit');
const {
  encryptMiddleware,
  decryptMiddleware,
  decryptFields,
  decryptResult,
} = require('../middleware/encryption');
const { encrypt, hashSensitive } = require('../utils/encryption');
const { requireRole, requirePermission } = require('../middleware/auth');
const { uploadExcel, validateUploadedFile, deleteFile, fixFilenameEncoding } = require('../middleware/upload');
const { getOverAgeThresholds, getEmployeeAgeRule } = require('../config/hseRules');

// Sprint-C Phase 1: 人员组织关系服务
const {
  resolveOrgUnitId,
  buildOrgPathFromDepartment,
  getCurrentAssignment,
  getAssignmentHistory,
  endCurrentAssignment,
  createAssignment,
  updateAssignmentStatus,
  findCurrentAssignmentByEmployeeId,
  getEmployeeCountByStatus,
  getEmployeeCountByDepartments,
  STATUS_MAP,
  STATUS_REVERSE_MAP,
} = require('../services/employeeAssignmentService');

// P0-2: 员工事件服务（EMPLOYEE_* 事件发布 / 轮询兜底）
const employeeEventService = require('../services/employeeEventService');

const { ENCRYPT_FIELDS, computeHash, secureEncode, buildOrgPath, buildDeptPath, fetchEmployeeInfosByIds, parseIdList } = require('./hse-employee/_shared');








// 七、证件管理 (employee_certificate 表) —— 已拆至 ./hse-employee/certificates
router.use('/', require('./hse-employee/employee'));
router.use('/', require('./hse-employee/org-tree'));
router.use('/', require('./hse-employee/position'));
router.use('/', require('./hse-employee/assignment'));
router.use('/', require('./hse-employee/history'));

// 六、员工导入 (JSON + Excel) —— 已拆至 ./hse-employee/import
router.use('/', require('./hse-employee/import'));

router.use('/', require('./hse-employee/certificates'));

// ============================================================
// 八、一人一档 (employee_safety_profile 表)
// ============================================================
// 八、一人一档 & 九、岗位安全画像 —— 已拆至 ./hse-employee/safety-profiles
router.use('/', require('./hse-employee/safety-profiles'));


// ============================================================
// 十、岗位培训要求 (position_training_requirement 表)
// ============================================================
// 十、岗位培训要求 & 培训系列(台账/入职/状态) —— 已拆至 ./hse-employee/trainings
router.use('/', require('./hse-employee/trainings'));


// ============================================================
// Sprint5.4 HSE检查管理中心 API
// ============================================================
// Sprint5.4 检查管理中心(检查计划/任务/记录/隐患/模板) —— 已拆至 ./hse-employee/inspection-center
router.use('/', require('./hse-employee/inspection-center'));


// ============================================================
// Sprint5.7: 员工档案中心 API（基于 v_employee_current 视图）
// ============================================================
// Sprint5.7 员工档案中心 —— 已拆至 ./hse-employee/profile-center
router.use('/', require('./hse-employee/profile-center'));


// ============================================================
// Sprint5.8: 员工公共选择 API（用于培训/保险/三违/隐患/消防等模块）
// ============================================================
// Sprint5.8 员工公共选择 —— 已拆至 ./hse-employee/selector
router.use('/', require('./hse-employee/selector'));


// ============================================================
// Sprint11-2: 超龄人员自动识别（基于employee表birth_date）
// 规则来源: config/hseRules/employee-age-rule.json
//   男性 > overAgeThresholds.male (默认60)
//   女性 > overAgeThresholds.female (默认50)
// 禁止: 硬编码阈值散落各处
// ============================================================
// Sprint11-2 超龄自动识别 —— 已拆至 ./hse-employee/over-age
router.use('/', require('./hse-employee/over-age'));



module.exports = router;





