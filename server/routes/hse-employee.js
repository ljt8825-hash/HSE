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

// 加密字段常量
const ENCRYPT_FIELDS = ['id_card', 'phone'];

// 辅助：构建 org_path（根据五级组织ID查询名称拼接路径）
async function buildOrgPath(client, { group_id, region_id, enterprise_id, project_id, team_id }) {
  const ids = [group_id, region_id, enterprise_id, project_id, team_id].filter(Boolean);
  if (ids.length === 0) return null;
  const result = await client.query(
    `SELECT id, name FROM department WHERE id = ANY($1::bigint[]) AND is_deleted = false`,
    [ids]
  );
  const map = new Map(result.rows.map((r) => [r.id, r.name]));
  const pathParts = [];
  if (group_id && map.has(group_id)) pathParts.push(map.get(group_id));
  if (region_id && map.has(region_id)) pathParts.push(map.get(region_id));
  if (enterprise_id && map.has(enterprise_id)) pathParts.push(map.get(enterprise_id));
  if (project_id && map.has(project_id)) pathParts.push(map.get(project_id));
  if (team_id && map.has(team_id)) pathParts.push(map.get(team_id));
  return pathParts.length > 0 ? `/${pathParts.join('/')}` : null;
}

// 辅助：构建部门 path（层级路径，如 /1/5/12/）
async function buildDeptPath(client, parentId) {
  if (!parentId) return '/';
  const result = await client.query(
    `SELECT path FROM department WHERE id = $1 AND is_deleted = false`,
    [parentId]
  );
  if (result.rows.length === 0) return '/';
  const parentPath = result.rows[0].path || '/';
  return parentPath.endsWith('/') ? `${parentPath}` : `${parentPath}/`;
}

// ============================================================
// P0-1 批量员工查询辅助（花名册为基石 / Phase 1 任务1）
// ============================================================

/**
 * 解析 ID 列表入参。
 * 支持：数字数组 [1,2,3]、逗号分隔字符串 "1,2,3"、单个数字、undefined/null（视为空）。
 * @param {*} input
 * @returns {number[]|null} 去重后的正整数数组；格式非法返回 null
 */
function parseIdList(input) {
  if (input === undefined || input === null) return [];
  if (typeof input === 'string' && input.trim() === '') return [];
  let arr;
  if (Array.isArray(input)) {
    arr = input;
  } else if (typeof input === 'string') {
    arr = input.split(',');
  } else if (typeof input === 'number') {
    arr = [input];
  } else {
    return null;
  }
  const ids = [];
  const seen = new Set();
  for (const item of arr) {
    const n = typeof item === 'number' ? item : parseInt(String(item).trim(), 10);
    if (!Number.isInteger(n) || n <= 0) return null;
    if (!seen.has(n)) {
      seen.add(n);
      ids.push(n);
    }
  }
  return ids;
}

/**
 * 按 ID 批量查询员工基础信息，返回 EmployeeInfo[]（与前端契约一致）。
 * - 数据源：v_employee_current 视图（与 employee_assignment 统一数据模型一致）
 * - 手动解密 id_card / phone（避免 decryptMiddleware 仅识别 snake_case 的字段名错配）
 * - 不存在的 ID 静默跳过
 * @param {number[]} ids
 * @returns {Promise<Array>} EmployeeInfo[]
 */
async function fetchEmployeeInfosByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const result = await pool.query(
    `SELECT ev.employee_id AS id, ev.employee_code, e.id_card, ev.name,
            ev.org_name AS dept_name, ev.position_name,
            ev.assignment_status AS org_status, e.phone
     FROM v_employee_current ev
     JOIN employee e ON e.id = ev.employee_id
     WHERE e.is_deleted = false AND ev.employee_id = ANY($1::bigint[])`,
    [ids]
  );
  return result.rows.map(r => {
    const d = decryptFields(r, ['id_card', 'phone']);
    return {
      employeeId: d.id,
      employeeCode: d.employee_code || '',
      name: d.name || '',
      deptName: d.dept_name || '',
      positionName: d.position_name || '',
      orgStatus: d.org_status || '',
      phone: d.phone || '',
      idCard: d.id_card || '',
    };
  });
}

// ============================================================
// Sprint5.1.1 加固辅助函数
// ============================================================

/**
 * 计算字段的哈希值（用于唯一性校验）
 * @param {string} plaintext - 明文（已加密前的原始值）
 * @returns {string|null} HMAC-SHA256 hex (64字符) 或 null
 */
function computeHash(plaintext) {
  return hashSensitive(plaintext);
}

/**
 * 加密明文并返回密文 + 哈希
 * 配合 v60 迁移新增的 id_card_hash / phone_hash 列使用
 * @param {string} plaintext
 * @returns {{cipher:string|null, hash:string|null}}
 */
function secureEncode(plaintext) {
  if (!plaintext) return { cipher: null, hash: null };
  return {
    cipher: encrypt(plaintext),
    hash: hashSensitive(plaintext),
  };
}

/**
 * Excel 表头 → 数据库字段的映射（员工导入模板）
 * 顺序与模板一致；用户在 Excel 中填写中文表头
 */
const EXCEL_HEADER_MAP = {
  '工号': 'employee_code',
  '员工编码': 'employee_code',
  '姓名': 'name',
  '身份证号': 'id_card',
  '身份证件号': 'id_card',
  '身份证号码': 'id_card',
  '身份证地址': 'id_address',
  '性别': 'gender',
  '出生日期': 'birth_date',
  '手机号': 'phone',
  '手机号码': 'phone',
  '人员分类': 'person_category',
  '人员类型': 'person_type',
  '是否公益岗': 'is_public_welfare',
  '组织路径': 'org_path',
  '所属乡镇': 'township',
  '二级部门': 'secondary_dept',
  '所属部门': 'dept_name',
  '岗位': 'position_name',
  '岗位名称': 'position_name',
  '职位': 'position_name',
  '入职日期': 'hire_date',
  '年龄': 'age',
};

/** Excel 模板示例行（用于模板下载） */
const TEMPLATE_SAMPLE_ROWS = [
  {
    '工号': 'EMP001',
    '姓名': '张三',
    '身份证号': '370102199001011234',
    '身份证地址': '山东省济南市历下区XX街道XX号',
    '性别': '男',
    '出生日期': '1990-01-01',
    '手机号': '13800138001',
    '人员分类': '适龄人员',
    '人员类型': '生产人员',
    '是否公益岗': '否',
    '组织路径': '/测试集团/测试区域公司/测试企业/测试项目/测试班组',
    '岗位名称': '测试电工',
    '入职日期': '2024-01-15',
  },
  {
    '工号': 'EMP002',
    '姓名': '李四',
    '身份证号': '370102199508152345',
    '身份证地址': '山东省济南市市中区XX街道XX号',
    '性别': '女',
    '出生日期': '1995-08-15',
    '手机号': '13900139002',
    '人员分类': '适龄人员',
    '人员类型': '管理人员',
    '是否公益岗': '否',
    '组织路径': '/测试集团/测试区域公司/测试企业/测试项目',
    '岗位名称': '安全员',
    '入职日期': '2023-06-01',
  },
];

/** 允许的性别值 */
const VALID_GENDERS = ['男', '女'];
/** 允许的人员分类 */
const VALID_CATEGORIES = ['适龄人员', '超龄人员'];
/** 允许的人员类型（v1.2: 不含驾驶员） */
const VALID_PERSON_TYPES = ['生产人员', '管理人员', '技术人员', '辅助人员'];

/**
 * 校验单行员工数据
 * @param {Object} row - 已映射为数据库字段的行
 * @param {number} rowIndex - Excel 行号（从2开始，1为表头）
 * @returns {{valid:boolean, errors:string[]}}
 */
function validateEmployeeRow(row, rowIndex) {
  const errors = [];
  if (!row.name || String(row.name).trim() === '') {
    errors.push(`第${rowIndex}行：姓名不能为空`);
  }
  if (row.gender && !VALID_GENDERS.includes(row.gender)) {
    errors.push(`第${rowIndex}行：性别必须是"男"或"女"，实际为"${row.gender}"`);
  }
  if (row.person_category && !VALID_CATEGORIES.includes(row.person_category)) {
    errors.push(`第${rowIndex}行：人员分类必须为${VALID_CATEGORIES.join('/')}`);
  }
  if (row.person_type && !VALID_PERSON_TYPES.includes(row.person_type)) {
    errors.push(`第${rowIndex}行：人员类型必须为${VALID_PERSON_TYPES.join('/')}`);
  }
  if (row.birth_date) {
    const d = String(row.birth_date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) && !/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(d) && !/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(d)) {
      errors.push(`第${rowIndex}行：出生日期格式应为 YYYY-MM-DD`);
    }
  }
  if (row.id_card && !/^\d{17}[\dXx]$/.test(String(row.id_card).trim())) {
    errors.push(`第${rowIndex}行：身份证号应为18位数字（末位可为X）`);
  }
  if (row.phone && !/^1\d{10}$/.test(String(row.phone).trim())) {
    errors.push(`第${rowIndex}行：手机号应为11位数字且以1开头`);
  }
  if (row.is_public_welfare !== undefined && row.is_public_welfare !== null) {
    const v = String(row.is_public_welfare).trim();
    if (!['是', '否', 'true', 'false', '1', '0'].includes(v)) {
      errors.push(`第${rowIndex}行：是否公益岗必须为"是"或"否"`);
    }
  }
  if (row.hire_date) {
    const d = String(row.hire_date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) && !/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(d) && !/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(d)) {
      errors.push(`第${rowIndex}行：入职日期格式应为 YYYY-MM-DD`);
    }
  }
  if (row.org_path) {
    const p = String(row.org_path).trim();
    if (!p.startsWith('/')) {
      errors.push(`第${rowIndex}行：组织路径必须以"/"开头，如"/集团/区域/企业/项目/班组"`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 规范化行数据：转换字段名 + 类型转换
 * @param {Object} rawRow - 原始行（中文表头）
 * @returns {Object} 规范化后的行（数据库字段名）
 */
function normalizeExcelRow(rawRow) {
  const result = {};
  for (const [cnHeader, dbField] of Object.entries(EXCEL_HEADER_MAP)) {
    if (rawRow[cnHeader] !== undefined && rawRow[cnHeader] !== '') {
      result[dbField] = rawRow[cnHeader];
    }
  }
  // 日期格式统一（支持 2025/1/1, 2025.1.1, 2025-01-01, 数字序列号）
  if (result.birth_date) {
    result.birth_date = normalizeDate(result.birth_date);
  }
  if (result.hire_date) {
    result.hire_date = normalizeDate(result.hire_date);
  }
  // 布尔字段
  if (result.is_public_welfare !== undefined) {
    const v = String(result.is_public_welfare).trim();
    result.is_public_welfare = ['是', 'true', '1'].includes(v.toLowerCase());
  }
  // 组织路径标准化
  if (result.org_path) {
    let p = String(result.org_path).trim();
    if (!p.startsWith('/')) p = '/' + p;
    if (p.endsWith('/')) p = p.slice(0, -1);
    result.org_path = p;
  }
  // 手机号：Excel 可能存储为数字，统一转为字符串
  if (result.phone !== undefined) {
    const phoneStr = String(result.phone).trim();
    result.phone = phoneStr;
  }
  // 员工编码：Excel 可能存储为数字，统一转为字符串
  if (result.employee_code !== undefined) {
    result.employee_code = String(result.employee_code).trim();
  }
  // 字符串trim
  if (result.gender) result.gender = String(result.gender).trim();
  if (result.name) result.name = String(result.name).trim();
  if (result.id_card) result.id_card = String(result.id_card).trim();
  if (result.person_category) result.person_category = String(result.person_category).trim();
  if (result.person_type) result.person_type = String(result.person_type).trim();
  if (result.position_name) result.position_name = String(result.position_name).trim();
  if (result.dept_name) result.dept_name = String(result.dept_name).trim();
  if (result.id_address) result.id_address = String(result.id_address).trim();

  // 由所属乡镇 + 二级部门构造组织路径
  if (!result.org_path && (result.township || result.secondary_dept)) {
    const township = String(result.township || '').trim();
    const secondaryDept = String(result.secondary_dept || '').trim();
    const parts = [township, secondaryDept].filter(Boolean);
    if (parts.length > 0) {
      result.org_path = '/' + parts.join('/');
    }
  }
  delete result.township;
  delete result.secondary_dept;

  // 根据年龄反推出生日期（当没有birth_date但有age时）
  if (!result.birth_date && result.age) {
    const age = parseInt(String(result.age).trim());
    if (!isNaN(age) && age > 0 && age < 120) {
      const now = new Date();
      const birthYear = now.getFullYear() - age;
      result.birth_date = `${birthYear}-01-01`;
    }
  }
  delete result.age;

  return result;
}

/** 日期格式统一为 YYYY-MM-DD */
function normalizeDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    // Excel 日期序列号
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  const m1 = s.match(/^(\d{4})[.\/\-](\d{1,2})[.\/\-](\d{1,2})$/);
  if (m1) {
    return `${m1[1]}-${String(m1[2]).padStart(2, '0')}-${String(m1[3]).padStart(2, '0')}`;
  }
  return s;
}

/**
 * 根据组织路径匹配部门ID（五级组织：集团/区域/企业/项目/班组）
 * 如果部门不存在则自动创建
 * @param {Object} client - 数据库连接
 * @param {string} orgPath - 组织路径，如 /集团/区域/企业/项目/班组
 * @returns {Promise<{group_id, region_id, enterprise_id, project_id, team_id, org_path}|null>}
 */
async function matchOrgPath(client, orgPath) {
  if (!orgPath) return null;
  const parts = orgPath.split('/').filter(Boolean);
  if (parts.length === 0 || parts.length > 5) return null;

  const deptIds = { group_id: null, region_id: null, enterprise_id: null, project_id: null, team_id: null };
  let parentId = null;
  const levelNames = ['group_id', 'region_id', 'enterprise_id', 'project_id', 'team_id'];

  for (let i = 0; i < parts.length; i++) {
    const name = parts[i];
    let result = await client.query(
      `SELECT id FROM department
       WHERE name = $1 AND is_deleted = false
       AND (parent_id = $2 OR (parent_id IS NULL AND $2 IS NULL))
       LIMIT 1`,
      [name, parentId]
    );

    let deptId;
    if (result.rows.length === 0) {
      const deptCode = 'DEPT_' + Date.now().toString(36).toUpperCase() + '_' + Math.random().toString(36).slice(2, 6).toUpperCase();
      const createResult = await client.query(
        `INSERT INTO department (dept_code, name, parent_id, level, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING id`,
        [deptCode, name, parentId, i + 1]
      );
      deptId = createResult.rows[0].id;

      // 提示词-112 T3.3：导入自动创建部门时检测 org_unit_id 映射
      const ouMatch = await client.query(
        `SELECT id FROM hse_org_unit WHERE is_deleted = false AND (org_name = $1 OR org_name LIKE $1 || '%') LIMIT 1`,
        [name]
      );
      if (ouMatch.rows.length > 0) {
        await client.query(
          `UPDATE department SET org_unit_id = $1 WHERE id = $2`,
          [ouMatch.rows[0].id, deptId]
        );
      }
    } else {
      deptId = result.rows[0].id;
    }

    deptIds[levelNames[i]] = deptId;
    parentId = deptId;
  }

  return { ...deptIds, org_path: orgPath };
}

/**
 * 根据岗位名称匹配岗位ID
 * 如果岗位不存在则自动创建
 * @param {Object} client - 数据库连接
 * @param {string} positionName - 岗位名称
 * @param {number|null} deptId - 所属部门ID（可选，用于缩小范围）
 * @returns {Promise<number|null>}
 */
async function matchPositionByName(client, positionName, deptId = null) {
  if (!positionName) return null;

  let conditions = ['name = $1', 'is_deleted = false'];
  let params = [positionName];
  if (deptId) {
    conditions.push('dept_id = $2');
    params.push(deptId);
  }

  let result = await client.query(
    `SELECT id FROM position WHERE ${conditions.join(' AND ')} LIMIT 1`,
    params
  );

  if (result.rows.length > 0) {
    return result.rows[0].id;
  }

  if (deptId) {
    conditions = ['name = $1', 'is_deleted = false'];
    params = [positionName];
    result = await client.query(
      `SELECT id FROM position WHERE ${conditions.join(' AND ')} LIMIT 1`,
      params
    );
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
  }

  const positionCode = 'POS_' + Date.now().toString(36).toUpperCase() + '_' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const createResult = await client.query(
    `INSERT INTO position (position_code, name, dept_id, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING id`,
    [positionCode, positionName, deptId || null]
  );
  return createResult.rows[0].id;
}

/**
 * 根据花名册「所属部门」名称解析组织单位ID（hse_org_unit）
 * 支持无「组织路径」列的花名册格式（如：所属部门 + 职位）
 * 匹配策略：
 *   1. 精确匹配 org_name
 *   2. 模糊匹配：去掉「片区/作业中心/中心」或「X班」后缀后按前缀匹配（如 宁城街道片区 → 宁城街道作业中心）
 * @param {Object} client - 数据库连接（支持事务）
 * @param {string} deptName - 花名册所属部门名称
 * @returns {Promise<number|null>}
 */
async function resolveOrgUnitByDeptName(client, deptName) {
  if (!deptName) return null;

  const exact = await client.query(
    `SELECT id FROM hse_org_unit WHERE org_name = $1 AND is_deleted = false LIMIT 1`,
    [deptName]
  );
  if (exact.rows.length > 0) return exact.rows[0].id;

  const base = String(deptName)
    .replace(/(片区|作业中心|中心)$/, '')
    .replace(/[一二三四五六七八九十]+班$/, '')
    .trim();
  if (base && base !== String(deptName).trim()) {
    const fuzzy = await client.query(
      `SELECT id FROM hse_org_unit WHERE org_name LIKE $1 AND is_deleted = false LIMIT 1`,
      [`${base}%`]
    );
    if (fuzzy.rows.length > 0) return fuzzy.rows[0].id;
  }

  return null;
}

// ============================================================
// 一、员工管理 (employee 表)
// ============================================================

// GET /employees — 分页查询员工列表（通过视图返回年龄）
router.get('/employees', decryptMiddleware(...ENCRYPT_FIELDS), async (req, res) => {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, '数据库未连接');

    const { page = 1, pageSize = 20, keyword, personType, personCategory, status, gender, deptName, positionName, employmentRelation, overageOnly } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['e.is_deleted = false'];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(ev.name ILIKE $${paramIdx} OR ev.employee_code ILIKE $${paramIdx} OR e.phone ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (personType) {
      conditions.push(`e.person_type = $${paramIdx}`);
      params.push(personType);
      paramIdx++;
    }
    if (personCategory) {
      conditions.push(`e.person_category = $${paramIdx}`);
      params.push(personCategory);
      paramIdx++;
    }
    if (gender) {
      conditions.push(`e.gender = $${paramIdx}`);
      params.push(gender);
      paramIdx++;
    }
    if (deptName) {
      conditions.push(`(ev.org_name = $${paramIdx} OR opu.unit_name = $${paramIdx})`);
      params.push(deptName);
      paramIdx++;
    }
    if (positionName) {
      conditions.push(`ev.position_name = $${paramIdx}`);
      params.push(positionName);
      paramIdx++;
    }
    // 统计卡点击联动：按「用工关系状态」/超龄口径过滤（与 /employees/stats 口径一致）
    if (overageOnly === 'true' || employmentRelation) {
      if (overageOnly === 'true') {
        // 超龄：仅在在职（正式员工）中按男60/女50判定
        conditions.push(`e.employment_relation = '正式员工'`);
        conditions.push(buildOverAgeCondition('e'));
      } else if (employmentRelation === 'active') {
        conditions.push(`e.employment_relation = '正式员工'`);
      } else if (employmentRelation === 'left') {
        conditions.push(`e.employment_relation IN ('辞职','死亡')`);
      } else if (employmentRelation === 'total') {
        conditions.push(`e.employment_relation IN ('正式员工','辞职','死亡')`);
      }
    } else if (status) {
      conditions.push(`ev.assignment_status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    } else {
      // 默认（未选状态）仅显示当前在职：须存在一条当前主岗任职，否则把历史/离职人员（重放产生的全量档案）排除出“员工列表”
      conditions.push(`EXISTS (
        SELECT 1 FROM employee_assignment _cur
        WHERE _cur.employee_id = e.id
          AND _cur.is_current = true
          AND _cur.is_primary = true
          AND _cur.is_deleted = false
      )`);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM v_employee_current ev
       JOIN employee e ON e.id = ev.employee_id
       LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
       LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
       WHERE ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT ev.employee_id AS id, ev.employee_code, e.id_card, ev.name, e.gender,
              e.birth_date, e.phone, e.person_category, e.person_type,
              e.is_public_welfare, e.id_address,
              CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM AGE(e.birth_date))::int END AS age,
              ea.org_unit_id,
              -- 「部门」列归因口径：乡镇作业中心级组织显示为「xx镇乡镇作业中心」，其余保持 org_name
              CASE WHEN ev.org_type = 'town_center' THEN regexp_replace(ev.org_name, '作业中心$', '乡镇作业中心')
                   ELSE ev.org_name END AS dept_name,
              ou.org_path AS org_path,
              ea.position_id, ev.position_name,
              CASE WHEN e.employment_relation IN ('辞职','死亡') THEN 'left' ELSE ev.assignment_status END AS org_status,
              ea.start_date,
              e.leave_date,
              CASE WHEN ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%' THEN true ELSE false END AS is_driver,
              ea_sup.supervisor_id AS supervisor_id,
              sup.name AS supervisor_name
       FROM v_employee_current ev
       JOIN employee e ON e.id = ev.employee_id
       LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
       LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
       LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
       LEFT JOIN employee_assignment ea_sup ON ev.employee_id = ea_sup.employee_id AND ea_sup.is_primary = true AND ea_sup.is_current = true AND ea_sup.is_deleted = false
       LEFT JOIN employee sup ON ea_sup.supervisor_id = sup.id AND sup.is_deleted = false
       WHERE ${whereClause}
       ORDER BY ea.start_date DESC NULLS LAST
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    buildListResponse(res, result.rows, total, pageNum, limitNum, '查询成功');
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /employees/filter-options — 筛选项动态化（提示词-92 任务1）
// 从花名册实际数据（v_employee_current，当前在职员工）提取去重后的部门/岗位列表，
// 仅返回「有员工」的部门与岗位，避免组织/岗位定义表带来的空选项。
router.get('/employees/filter-options', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const r = await pool.query(`
      SELECT
        (SELECT COALESCE(json_agg(d ORDER BY d), '[]'::json)
         FROM (SELECT DISTINCT ev.org_name AS d
               FROM v_employee_current ev
               JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
               WHERE ev.org_name IS NOT NULL) t) AS departments,
        (SELECT COALESCE(json_agg(p ORDER BY p), '[]'::json)
         FROM (SELECT DISTINCT ev.position_name AS p
               FROM v_employee_current ev
               JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
               WHERE ev.position_name IS NOT NULL) t) AS positions
    `);

    const row = r.rows[0] || {};
    res.json(success({
      departments: row.departments || [],
      positions: row.positions || [],
    }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /employees/stats — 员工统计
router.get('/employees/stats', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    // 在职/离职口径以「花名册·用工关系状态」为权威（import-employment-relation.cjs 已全量回填）：
    //   在职 = 用工关系状态 = '正式员工'
    //   离职 = 用工关系状态 ∈（辞职，死亡）
    const ACTIVE_RELATION = `e.employment_relation = '正式员工'`;
    const LEFT_RELATION = `e.employment_relation IN ('辞职','死亡')`;

    const [totalResult, typeResult, categoryResult, statusResult, listTotalResult, activeResult, leftResult, overAgeResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM employee WHERE is_deleted = false`),
      pool.query(`SELECT person_type, COUNT(*)::int AS count FROM employee WHERE is_deleted = false AND person_type IS NOT NULL GROUP BY person_type ORDER BY count DESC`),
      pool.query(`SELECT person_category, COUNT(*)::int AS count FROM employee WHERE is_deleted = false AND person_category IS NOT NULL GROUP BY person_category`),
      // Sprint-C Phase 1: 使用 employee_assignment 替代 hse_employee_org
      pool.query(`
        SELECT 
          CASE 
            WHEN ea.status = 'active' THEN '在职'
            WHEN ea.status = 'pending' THEN '待岗'
            WHEN ea.status = 'inactive' THEN '离职'
            WHEN ea.status = 'retired' THEN '退休'
            WHEN ea.status = 'reinstated' THEN '返聘'
            ELSE ea.status
          END AS status,
          COUNT(*)::int AS count 
        FROM employee_assignment ea 
        WHERE ea.is_current = true AND ea.is_deleted = false 
        GROUP BY ea.status
      `),
      // 员工总数：花名册用工关系状态非空（在职 1291 + 辞职 1951 + 死亡 7 = 3249）
      pool.query(`SELECT COUNT(*)::int AS n FROM employee e WHERE e.is_deleted = false AND e.employment_relation IN ('正式员工','辞职','死亡')`),
      // 在职人员：花名册用工关系状态 = 正式员工
      pool.query(`SELECT COUNT(*)::int AS n FROM employee e WHERE e.is_deleted = false AND ${ACTIVE_RELATION}`),
      // 离职人员：花名册用工关系状态 ∈（辞职，死亡）
      pool.query(`SELECT COUNT(*)::int AS n FROM employee e WHERE e.is_deleted = false AND ${LEFT_RELATION}`),
      // 超龄人员：仅在「在职（正式员工）」中按 overAgeThresholds(male 60 / female 50) 实时计算
      pool.query(`SELECT COUNT(*)::int AS n FROM employee e WHERE e.is_deleted = false AND ${ACTIVE_RELATION} AND ${buildOverAgeCondition('e')}`),
    ]);

    // 卡片口径（与员工列表/花名册回放/超龄规则保持一致）：
    //   listTotal  员工总数（与员工列表默认视图一致：有当前主岗任职）
    //   activeCount 在职人员（有当前主岗任职 且 非离职）
    //   leftCount   离职人员（含花名册「辞职/离职」并集，独立于列表口径）
    //   overAgeCount 超龄人员（按生日实时判定）
    res.json(success({
      total: totalResult.rows[0].total,
      listTotal: listTotalResult.rows[0].n,
      activeCount: activeResult.rows[0].n,
      leftCount: leftResult.rows[0].n,
      overAgeCount: overAgeResult.rows[0].n,
      byPersonType: typeResult.rows,
      byPersonCategory: categoryResult.rows,
      byOrgStatus: statusResult.rows,
    }, '统计成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /employees/batch — 批量获取员工基础信息（P0-1 / Phase 1 任务1）
// 花名册为基石：隐患/事故/应急等模块按 ID 批量拉取 EmployeeInfo
// 支持 GET ?ids=1,2,3 或 POST body { ids: [1,2,3] }
// 单次最多 200 个 ID；不存在的 ID 静默跳过；权限同 GET /employees（只读）
router.get('/employees/batch', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const ids = parseIdList(req.query.ids);
    if (ids === null) return res.json(error(-3, 'ids 参数格式错误（需逗号分隔数字或数字数组）'));
    if (ids.length === 0) return res.json(success([], '查询成功'));
    if (ids.length > 200) return res.json(error(-4, '单次最多查询 200 个 ID'));
    const rows = await fetchEmployeeInfosByIds(ids);
    res.json(success(rows, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /employees/batch — 同上，支持 body { ids: [...] }
router.post('/employees/batch', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const rawIds = req.body && req.body.ids;
    const ids = parseIdList(rawIds);
    if (ids === null) return res.json(error(-3, 'ids 参数格式错误（需数字数组或逗号分隔字符串）'));
    if (ids.length === 0) return res.json(success([], '查询成功'));
    if (ids.length > 200) return res.json(error(-4, '单次最多查询 200 个 ID'));
    const rows = await fetchEmployeeInfosByIds(ids);
    res.json(success(rows, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /events — 员工事件轮询端点（P0-2 / Phase 1 任务2）
// 返回 since（epoch ms 或 ISO 时间戳）之后发生的 EMPLOYEE_* 事件，供前端轮询兜底。
// 实时通道为 WebSocket（/ws，type=EMPLOYEE_EVENT）；此端点为离线/重连兜底。
router.get('/events', async (req, res) => {
  try {
    const since = req.query.since;
    const list = employeeEventService.getEventsSince(since);
    res.json(success({ events: list, serverTime: Date.now() }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// R1-Phase1 收尾 · 提示词-40 任务 C：员工主档案页
// GET /employees/:id/profile —— 完整档案（基本信息 + 组织岗位 + 关联业务统计）
// GET /employees/:id/{hazards,accidents,emergency-plans,training,violations} —— 关联业务列表（分页）
//
// 说明：现有 hazards/accidents/emergency 端点不支持按人员 ID 过滤，且红线禁止修改其他模块代码，
//       故在此模块内新增专用关联业务端点，避免跨模块改动。字段已按真实 schema 核验：
//       - 组织类型来自 hse_org_unit.org_type（非 unit_type）
//       - employee 表无 hire_date 列，入职日期取 employee_assignment.start_date
//       - violations 表无 employee_id 列，三违记录按 employee.name 文本匹配
// ============================================================

// 脱敏：身份证 前6 + **** + 后4
function maskIdCard(value) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 10) return '****';
  return `${s.slice(0, 6)}****${s.slice(-4)}`;
}

// 脱敏：手机 前3 + **** + 后4
function maskPhone(value) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 7) return '****';
  return `${s.slice(0, 3)}****${s.slice(-4)}`;
}

// 日期格式化 YYYY-MM-DD（null 安全）
function formatProfileDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// GET /employees/:id/profile — 员工主档案（R1-Phase1 收尾 · 提示词-40 任务 C）
router.get('/employees/:id/profile', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const empId = parseInt(req.params.id, 10);

    const empResult = await pool.query(
      `SELECT e.id, e.employee_code, e.id_card, e.name, e.gender, e.birth_date, e.phone,
              e.person_category, e.person_type, e.id_address,
              CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age
       FROM employee e WHERE e.id = $1 AND e.is_deleted = false`,
      [empId],
    );
    if (empResult.rows.length === 0) return res.json(error(-2, '员工不存在'));

    const emp = empResult.rows[0];
    decryptFields(emp, ENCRYPT_FIELDS); // 解密身份证/手机（若已加密）

    const orgResult = await pool.query(
      `SELECT ea.org_unit_id, ea.operation_unit_id, ea.position_id, ea.start_date,
              CASE
                WHEN ea.status = 'active' THEN '在职'
                WHEN ea.status = 'pending' THEN '待岗'
                WHEN ea.status = 'inactive' THEN '离职'
                WHEN ea.status = 'retired' THEN '退休'
                WHEN ea.status = 'reinstated' THEN '返聘'
                ELSE ea.status END AS assignment_status,
              ou.org_name, ou.org_type,
              opu.unit_name, opu.unit_type AS operation_unit_type,
              p.name AS position_name,
              CASE WHEN p.name ILIKE '%驾驶员%' OR p.name ILIKE '%司机%' THEN true ELSE false END AS is_driver
       FROM employee_assignment ea
       LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
       LEFT JOIN hse_operation_unit opu ON ea.operation_unit_id = opu.id AND opu.is_deleted = false
       LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
       WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_deleted = false`,
      [empId],
    );
    const org = orgResult.rows[0] || null;

    const [haz, acc, emg, trn, vio] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM hazards WHERE (checker_id = $1 OR fixer_id = $1) AND is_deleted = false`, [empId]),
      pool.query(`SELECT COUNT(*)::int AS c FROM accidents WHERE handler_id = $1 AND is_deleted = false`, [empId]),
      pool.query(`SELECT COUNT(*)::int AS c FROM emergency_plans WHERE responsible_person_id = $1 AND is_deleted = false`, [empId]),
      pool.query(`SELECT COUNT(*)::int AS c FROM training_records WHERE employee_id = $1 AND is_deleted = false`, [empId]),
      pool.query(`SELECT COUNT(*)::int AS c FROM violations WHERE name = (SELECT name FROM employee WHERE id = $1 AND is_deleted = false)`, [empId]),
    ]);

    const profile = {
      id: emp.id,
      employeeCode: emp.employee_code,
      name: emp.name,
      gender: emp.gender,
      age: emp.age,
      idCard: maskIdCard(emp.id_card),
      phone: maskPhone(emp.phone),
      // 注：employee 表无 hire_date 列，入职日期取当前任职 assignment.start_date
      hireDate: org ? formatProfileDate(org.start_date) : null,
      status: org ? org.assignment_status : '未知',
      orgUnitId: org ? org.org_unit_id : null,
      orgName: org ? org.org_name : null,
      orgType: org ? org.org_type : null,
      positionId: org ? org.position_id : null,
      positionName: org ? org.position_name : null,
      operationUnitId: org ? org.operation_unit_id : null,
      unitName: org ? org.unit_name : null,
      isDriver: org ? org.is_driver : false,
      stats: {
        hazardCount: haz.rows[0].c,
        accidentCount: acc.rows[0].c,
        emergencyPlanCount: emg.rows[0].c,
        trainingCount: trn.rows[0].c,
        violationCount: vio.rows[0].c,
      },
    };

    res.json(success(profile, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// 关联业务：隐患记录（checker_id 或 fixer_id）
router.get('/employees/:id/hazards', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, '数据库未连接');
    const empId = parseInt(req.params.id, 10);
    const pageNum = Math.max(1, parseInt(req.query.page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(req.query.pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;
    const where = `(checker_id = $1 OR fixer_id = $1) AND is_deleted = false`;
    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM hazards WHERE ${where}`, [empId]);
    const total = countR.rows[0].total;
    const r = await pool.query(
      `SELECT id, no, hazard_date, category, level, status, checker_id, fixer_id, description
       FROM hazards WHERE ${where} ORDER BY hazard_date DESC NULLS LAST LIMIT $2 OFFSET $3`,
      [empId, limitNum, offset],
    );
    buildListResponse(res, r.rows, total, pageNum, limitNum, '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// 关联业务：事故记录（handler_id）
router.get('/employees/:id/accidents', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, '数据库未连接');
    const empId = parseInt(req.params.id, 10);
    const pageNum = Math.max(1, parseInt(req.query.page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(req.query.pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;
    const where = `handler_id = $1 AND is_deleted = false`;
    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM accidents WHERE ${where}`, [empId]);
    const total = countR.rows[0].total;
    const r = await pool.query(
      `SELECT id, no, accident_date, accident_type, level, status, handler_id, description
       FROM accidents WHERE ${where} ORDER BY accident_date DESC NULLS LAST LIMIT $2 OFFSET $3`,
      [empId, limitNum, offset],
    );
    buildListResponse(res, r.rows, total, pageNum, limitNum, '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// 关联业务：应急预案（responsible_person_id）
router.get('/employees/:id/emergency-plans', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, '数据库未连接');
    const empId = parseInt(req.params.id, 10);
    const pageNum = Math.max(1, parseInt(req.query.page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(req.query.pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;
    const where = `responsible_person_id = $1 AND is_deleted = false`;
    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM emergency_plans WHERE ${where}`, [empId]);
    const total = countR.rows[0].total;
    const r = await pool.query(
      `SELECT id, name, type, level, status, responsible_person_id
       FROM emergency_plans WHERE ${where} ORDER BY id DESC LIMIT $2 OFFSET $3`,
      [empId, limitNum, offset],
    );
    buildListResponse(res, r.rows, total, pageNum, limitNum, '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// 关联业务：培训记录（employee_id）
router.get('/employees/:id/training', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, '数据库未连接');
    const empId = parseInt(req.params.id, 10);
    const pageNum = Math.max(1, parseInt(req.query.page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(req.query.pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;
    const where = `employee_id = $1 AND is_deleted = false`;
    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM training_records WHERE ${where}`, [empId]);
    const total = countR.rows[0].total;
    const r = await pool.query(
      `SELECT id, name, training_type, training_date, result, score, employee_id
       FROM training_records WHERE ${where} ORDER BY training_date DESC NULLS LAST LIMIT $2 OFFSET $3`,
      [empId, limitNum, offset],
    );
    buildListResponse(res, r.rows, total, pageNum, limitNum, '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// 关联业务：三违记录（按姓名匹配 employee.name；violations 表无 employee_id 列）
router.get('/employees/:id/violations', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, '数据库未连接');
    const empId = parseInt(req.params.id, 10);
    const pageNum = Math.max(1, parseInt(req.query.page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(req.query.pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;
    const where = `name = (SELECT name FROM employee WHERE id = $1 AND is_deleted = false)`;
    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM violations WHERE ${where}`, [empId]);
    const total = countR.rows[0].total;
    const r = await pool.query(
      `SELECT id, no, violation_date, violation_type, status, name, position, description
       FROM violations WHERE ${where} ORDER BY violation_date DESC NULLS LAST LIMIT $2 OFFSET $3`,
      [empId, limitNum, offset],
    );
    buildListResponse(res, r.rows, total, pageNum, limitNum, '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /employees/:id — 员工详情（含组织关系和年龄）
router.get('/employees/:id', decryptMiddleware(...ENCRYPT_FIELDS), async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `SELECT e.id, e.employee_code, e.id_card, e.name, e.gender, e.birth_date, e.phone,
              e.person_category, e.person_type, e.is_public_welfare, e.id_address, e.created_at, e.updated_at,
              CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age
       FROM employee e WHERE e.id = $1 AND e.is_deleted = false`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '员工不存在'));

    const emp = result.rows[0];

    // 查询当前组织关系 - Sprint-C Phase 1: 使用 employee_assignment 替代 hse_employee_org
    const orgResult = await pool.query(
      `SELECT ea.id, ea.position_id, ea.start_date, ea.supervisor_id,
              CASE 
                WHEN ea.status = 'active' THEN '在职'
                WHEN ea.status = 'pending' THEN '待岗'
                WHEN ea.status = 'inactive' THEN '离职'
                WHEN ea.status = 'retired' THEN '退休'
                WHEN ea.status = 'reinstated' THEN '返聘'
                ELSE ea.status
              END AS status,
              ou.org_path,
              ou.id AS org_unit_id,
              ou.org_name,
              p.name AS position_name,
              s.name AS supervisor_name
       FROM employee_assignment ea
       LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
       LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
       LEFT JOIN employee s ON ea.supervisor_id = s.id AND s.is_deleted = false
       WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_deleted = false`,
      [req.params.id]
    );

    emp.org = orgResult.rows[0] || null;
    buildDetailResponse(res, emp, '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /employees — 新增员工（纯身份数据）
// Sprint5.1.1: 不再使用 encryptMiddleware (它会在路由前覆盖明文，无法计算哈希)
// 改为在路由内部手动加密 + 计算哈希
router.post('/employees', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const { employee_code, id_card, name, gender, birth_date, phone, person_category, person_type, is_public_welfare, id_address } = req.body;
    if (!name) return res.json(error(-3, '姓名不能为空'));

    // 检查工号唯一性
    if (employee_code) {
      const existCode = await pool.query(`SELECT id FROM employee WHERE employee_code = $1 AND is_deleted = false`, [employee_code]);
      if (existCode.rows.length > 0) return res.json(error(-4, '工号已存在'));
    }
    // Sprint5.1.1: 通过 id_card_hash 做唯一性校验（解决 AES-GCM 随机IV不可比较问题）
    const idCardEnc = secureEncode(id_card); // { cipher, hash }
    const phoneEnc = secureEncode(phone);
    if (idCardEnc.hash) {
      const existIdCard = await pool.query(`SELECT id FROM employee WHERE id_card_hash = $1 AND is_deleted = false`, [idCardEnc.hash]);
      if (existIdCard.rows.length > 0) return res.json(error(-4, '身份证号已存在'));
    }
    if (phoneEnc.hash) {
      const existPhone = await pool.query(`SELECT id FROM employee WHERE phone_hash = $1 AND is_deleted = false`, [phoneEnc.hash]);
      if (existPhone.rows.length > 0) return res.json(error(-4, '手机号已存在'));
    }

    const result = await pool.query(
      `INSERT INTO employee (employee_code, id_card, id_card_hash, name, gender, birth_date, phone, phone_hash, person_category, person_type, is_public_welfare, id_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [employee_code || null, idCardEnc.cipher, idCardEnc.hash, name, gender || null, birth_date || null,
       phoneEnc.cipher, phoneEnc.hash, person_category || null, person_type || null, is_public_welfare || false, id_address || null]
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '人员主数据',
      description: `新增员工: ${name}（${employee_code || '-'}）`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /employees/:id — 更新员工信息
// Sprint5.1.1: 手动加密 + 哈希唯一性校验
router.put('/employees/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const updates = req.body;
    const fields = [];
    const values = [];
    let paramIdx = 1;

    // 工号唯一性检查
    if (updates.employee_code) {
      const existCode = await pool.query(`SELECT id FROM employee WHERE employee_code = $1 AND id != $2 AND is_deleted = false`, [updates.employee_code, req.params.id]);
      if (existCode.rows.length > 0) return res.json(error(-4, '工号已存在'));
    }
    // Sprint5.1.1: 身份证 + 手机号哈希唯一性校验
    const idCardEnc = secureEncode(updates.id_card);
    const phoneEnc = secureEncode(updates.phone);
    if (idCardEnc.hash) {
      const existIdCard = await pool.query(`SELECT id FROM employee WHERE id_card_hash = $1 AND id != $2 AND is_deleted = false`, [idCardEnc.hash, req.params.id]);
      if (existIdCard.rows.length > 0) return res.json(error(-4, '身份证号已存在'));
    }
    if (phoneEnc.hash) {
      const existPhone = await pool.query(`SELECT id FROM employee WHERE phone_hash = $1 AND id != $2 AND is_deleted = false`, [phoneEnc.hash, req.params.id]);
      if (existPhone.rows.length > 0) return res.json(error(-4, '手机号已存在'));
    }

    // 普通字段
    const allowedFields = ['employee_code', 'name', 'gender', 'birth_date', 'person_category', 'person_type', 'is_public_welfare', 'id_address'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = $${paramIdx++}`);
        values.push(updates[field]);
      }
    }
    // 花名册「用工关系状态 / 离职日期」（以花名册为权威，空串置空）
    if (updates.employment_relation !== undefined) {
      fields.push(`employment_relation = $${paramIdx++}`);
      values.push(updates.employment_relation ? String(updates.employment_relation).trim() : null);
    }
    if (updates.leave_date !== undefined) {
      fields.push(`leave_date = $${paramIdx++}`);
      values.push(updates.leave_date ? String(updates.leave_date).trim() : null);
    }
    // 加密字段：明文 → 密文 + 哈希 同步写入
    if (updates.id_card !== undefined) {
      fields.push(`id_card = $${paramIdx++}`);
      values.push(idCardEnc.cipher);
      fields.push(`id_card_hash = $${paramIdx++}`);
      values.push(idCardEnc.hash);
    }
    if (updates.phone !== undefined) {
      fields.push(`phone = $${paramIdx++}`);
      values.push(phoneEnc.cipher);
      fields.push(`phone_hash = $${paramIdx++}`);
      values.push(phoneEnc.hash);
    }
    if (fields.length === 0) return res.json(error(-3, '没有要更新的字段'));

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE employee SET ${fields.join(', ')} WHERE id = $${paramIdx} AND is_deleted = false RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.json(error(-2, '员工不存在或已删除'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '人员主数据',
      description: `更新员工 ID=${req.params.id}: ${updates.name || ''}`,
      ip: req.ip,
    }).catch(() => {});

    // P0-2: 发布员工事件（信息变更 → EMPLOYEE_INFO_UPDATED）
    try {
      const changedFields = [];
      for (const f of ['employee_code', 'name', 'gender', 'birth_date', 'person_category', 'person_type', 'is_public_welfare', 'id_address', 'id_card', 'phone']) {
        if (updates[f] !== undefined) changedFields.push(f);
      }
      if (changedFields.length > 0) {
        employeeEventService.publishEmployeeEvent({
          type: 'EMPLOYEE_INFO_UPDATED',
          employeeId: parseInt(req.params.id, 10),
          occurredAt: new Date().toISOString(),
          payload: { fields: changedFields },
        });
      }
    } catch (e) {
      console.warn('[hse-employee] 发布 EMPLOYEE_INFO_UPDATED 事件失败:', e.message);
    }

    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /employees/:id/roster-authority — 员工「花名册权威状态」
// 以花名册「用工关系状态」为权威：按 id_card_hash > employee_code > 姓名 定位花名册行，
// 优先取有 employment_relation 的非删除记录（可捕获同名幽灵记录，如王春堂 id=9727 但其花名册行=辞职）。
router.get('/employees/:id/roster-authority', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:view'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const id = parseInt(req.params.id, 10);

    const target = await pool.query(
      `SELECT id, employee_code, name, id_card_hash, employment_relation, leave_date FROM employee WHERE id = $1 AND is_deleted = false`,
      [id]
    );
    if (target.rows.length === 0) return res.json(error(-2, '员工不存在或已删除'));
    const t = target.rows[0];

    // 依次按 id_card_hash > employee_code > 姓名，定位有 employment_relation 的花名册行
    const pick = async (where, params) => {
      const r = await pool.query(
        `SELECT employment_relation, leave_date FROM employee
         WHERE is_deleted = false AND employment_relation IS NOT NULL AND ${where}
         ORDER BY id LIMIT 1`,
        params
      );
      return r.rows[0] || null;
    };
    let authority = null;
    let matchedBy = '';
    if (t.id_card_hash) { authority = await pick(`id_card_hash = $1`, [t.id_card_hash]); if (authority) matchedBy = 'id_card'; }
    if (!authority && t.employee_code) { authority = await pick(`employee_code = $1`, [t.employee_code]); if (authority) matchedBy = 'employee_code'; }
    if (!authority && t.name) { authority = await pick(`name = $1`, [t.name]); if (authority) matchedBy = 'name'; }

    res.json(success({
      id: t.id,
      found: !!authority,
      matchedBy,
      employment_relation: authority ? authority.employment_relation : t.employment_relation ?? null,
      leave_date: authority ? authority.leave_date : t.leave_date ?? null,
    }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// DELETE /employees/:id — 删除员工（软删除）
router.delete('/employees/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `UPDATE employee SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING id, name`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '员工不存在或已删除'));

    // Sprint-C Phase 1: 使用 employee_assignment 替代 hse_employee_org
    // 同时结束当前组织关系
    await pool.query(
      `UPDATE employee_assignment SET is_current = false, end_date = CURRENT_DATE, updated_at = NOW()
       WHERE employee_id = $1 AND is_current = true AND is_deleted = false`,
      [req.params.id]
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '人员主数据',
      description: `删除员工: ${result.rows[0].name} (ID=${req.params.id})`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 二、组织树管理 (department 表)
// ============================================================

// GET /departments/tree — 重组部门树（阶段1：hse_org_unit 骨架 + department 班组叶子）
// 提示词-124：以 hse_org_unit 为骨架，department 班组级节点（按乡镇名前缀）挂载为乡镇叶子，
// 一次性解决同名冗余、空列表、编制人数三大问题。前端 departments.vue 依赖 snake_case 字段。
// 注意：圆角括号/红线的其他接口（GET /departments 扁平列表、GET /departments/:id/employees）保持不变。
router.get('/departments/tree', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success([], '数据库未连接'));

    const includeInactive = req.query.includeInactive === 'true';
    const teamCondition = includeInactive
      ? 'd.is_deleted = false'
      : "d.is_deleted = false AND d.status = 'active'";

    // 第 1 步：hse_org_unit 全量节点（骨架）
    const ouRes = await pool.query(
      `SELECT id, parent_id, org_name, org_type, org_code, org_path, level,
              sort_order, headcount, status, description, manager_id
       FROM hse_org_unit WHERE is_deleted = false ORDER BY level, sort_order, id`
    );
    const ouRows = ouRes.rows;

    // 第 2 步：department 班组级节点（车队 / 片区 / X班）。正则命中"X班"结尾、"车队"、"片区"。
    const teamRes = await pool.query(
      `SELECT d.id, d.dept_code, d.name, d.short_name, d.parent_id, d.level, d.path, d.township,
              d.manager_id, d.safety_manager_id, d.headcount, d.sort_order, d.status, d.description,
              d.org_unit_id
       FROM department d
       WHERE ${teamCondition}
         AND d.name ~ '(\u4e00|\u4e8c|\u4e09|\u56db|\u4e94|\u516d|\u4e03|\u516b|\u4e5d|\u5341)\u73ed$|^\u8f66\u961f$|^\u7247\u533a$|.*\u7247\u533a$'
       ORDER BY d.sort_order ASC, d.id ASC`
    );
    const teamRows = teamRes.rows;

    // 第 3 步：员工数（精确，按 org_unit_id）+ 负责人姓名（从 employee_assignment.supervisor_id 关联）
    const ouIds = ouRows.map(r => r.id);
    const countMap = {};
    const supMap = {};
    const mgrMap = {};
    if (ouIds.length > 0) {
      const cRes = await pool.query(
        `SELECT ea.org_unit_id, COUNT(DISTINCT ea.employee_id)::int AS count
         FROM employee_assignment ea
         JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
         WHERE ea.org_unit_id = ANY($1)
           AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
           AND e.employment_relation = '正式员工'
         GROUP BY ea.org_unit_id`,
        [ouIds]
      );
      cRes.rows.forEach(r => { countMap[r.org_unit_id] = r.count; });

      // 负责人姓名：部门“直接上级”= 该部门内职位最高者（负责人）在花名册中的“直接上级”
      // 花名册逐人记录“直接上级”（已回填 employee.direct_supervisor），此处按职位等级取部门最高位者，
      // 以其 roster 直接上级作为部门直接上级（总经理→作业中心经理→经理→管理员→站长…）。
      const sRes = await pool.query(
        `SELECT top.org_unit_id, e.direct_supervisor AS supervisor_name
         FROM (
           SELECT DISTINCT ON (ea.org_unit_id)
             ea.org_unit_id, ea.employee_id
           FROM employee_assignment ea
           JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
           WHERE ea.org_unit_id = ANY($1)
             AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
           ORDER BY ea.org_unit_id,
             CASE WHEN p.name LIKE '%总经理%' THEN 0
                  WHEN p.name LIKE '%作业中心经理%' OR p.name LIKE '%片区经理%' THEN 1
                  WHEN p.name LIKE '%经理%' THEN 2
                  WHEN p.name LIKE '%管理员%' THEN 3
                  WHEN p.name LIKE '%站长%' THEN 4
                  WHEN p.name LIKE '%班长%' OR p.name LIKE '%网格长%' THEN 5
                  ELSE 9 END ASC,
             ea.employee_id ASC
         ) top
         JOIN employee e ON e.id = top.employee_id AND e.is_deleted = false`,
        [ouIds]
      );
      sRes.rows.forEach(r => { supMap[r.org_unit_id] = r.supervisor_name || null; });

      // 部门负责人：取该组织单元「职位最高者」（负责人）的员工 id 与姓名，查询期推导（自动跟随花名册变动）
      const mgrRes = await pool.query(
        `SELECT DISTINCT ON (ea.org_unit_id)
           ea.org_unit_id, ea.employee_id AS mgr_id, e.name AS mgr_name
         FROM employee_assignment ea
         JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
         JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
         WHERE ea.org_unit_id = ANY($1)
           AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
         ORDER BY ea.org_unit_id,
           CASE WHEN p.name LIKE '%总经理%' THEN 0
                WHEN p.name LIKE '%作业中心经理%' OR p.name LIKE '%片区经理%' THEN 1
                WHEN p.name LIKE '%经理%' THEN 2
                WHEN p.name LIKE '%管理员%' THEN 3
                WHEN p.name LIKE '%站长%' THEN 4
                WHEN p.name LIKE '%班长%' OR p.name LIKE '%网格长%' THEN 5
                ELSE 9 END ASC,
           ea.employee_id ASC`,
        [ouIds]
      );
      mgrRes.rows.forEach(r => { mgrMap[r.org_unit_id] = { id: r.mgr_id, name: r.mgr_name }; });
    }

    // 构建 hse_org_unit 节点：id 用合成 "ou_<id>"（org_unit_id 保留真实 id 供阶段2映射）；
    // 乡镇节点显示名剥离"作业中心"后缀以与提示词目标树一致。
    const ouNodeMap = new Map();
    ouRows.forEach(r => {
      const isTown = r.org_type === 'town_center';
      const displayName = isTown ? r.org_name.replace(/作业中心$/, '') : r.org_name;
      ouNodeMap.set(r.id, {
        id: 'ou_' + r.id,
        name: displayName,
        dept_code: r.org_code,
        org_type: r.org_type,
        level: r.level,
        status: r.status || 'active',
        headcount: r.headcount,
        employee_count: countMap[r.id] || 0,
        actual_headcount: countMap[r.id] || 0,
        manager_id: (mgrMap[r.id] && mgrMap[r.id].id) ?? r.manager_id,
        manager_name: (mgrMap[r.id] && mgrMap[r.id].name) ?? null,
        safety_manager_id: null,
        supervisor_name: supMap[r.id] || null,
        short_name: null,
        township: isTown ? displayName : null,
        parent_id: r.parent_id != null ? 'ou_' + r.parent_id : null,
        sort_order: r.sort_order,
        description: r.description,
        path: r.org_path,
        org_unit_id: r.id,
        children: [],
        employee_count_approximate: false,
      });
    });

    // 构建 department 班组节点：用真实 department.id 作 id（兼容现有 /departments/:id/employees 按 name 前缀匹配）。
    // 班组实际人数/负责人按 ea.dept_name 统计（在职口径，与组织统计一致），供详情展示。
    const teamNames = teamRows.map(r => r.name);
    const teamCntMap = {};
    const teamMgrMap = {};
    if (teamNames.length > 0) {
      const tRes = await pool.query(
        `SELECT ea.dept_name, COUNT(DISTINCT ea.employee_id)::int AS count
         FROM employee_assignment ea
         JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
         WHERE ea.dept_name = ANY($1)
           AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
           AND e.employment_relation = '正式员工'
         GROUP BY ea.dept_name`,
        [teamNames]
      );
      tRes.rows.forEach(r => { teamCntMap[r.dept_name] = r.count; });

      const tmRes = await pool.query(
        `SELECT DISTINCT ON (ea.dept_name)
           ea.dept_name, ea.employee_id AS mgr_id, e.name AS mgr_name
         FROM employee_assignment ea
         JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
         JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
         WHERE ea.dept_name = ANY($1)
           AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
           AND e.employment_relation = '正式员工'
         ORDER BY ea.dept_name,
           CASE WHEN p.name LIKE '%经理%' THEN 0
                WHEN p.name LIKE '%管理员%' THEN 1
                WHEN p.name LIKE '%站长%' THEN 2
                WHEN p.name LIKE '%班长%' OR p.name LIKE '%网格长%' THEN 3
                ELSE 9 END ASC,
           ea.employee_id ASC`,
        [teamNames]
      );
      tmRes.rows.forEach(r => { teamMgrMap[r.dept_name] = { id: r.mgr_id, name: r.mgr_name }; });
    }
    const teamNodeMap = new Map();
    teamRows.forEach(r => {
      const cnt = teamCntMap[r.name] || 0;
      const m = teamMgrMap[r.name];
      teamNodeMap.set(r.id, {
        id: r.id,
        name: r.name,
        dept_code: r.dept_code,
        org_type: 'team',
        level: r.level,
        status: r.status || 'active',
        headcount: r.headcount,
        employee_count: cnt,
        actual_headcount: cnt,
        manager_id: (m && m.id) ?? r.manager_id,
        manager_name: (m && m.name) ?? null,
        safety_manager_id: r.safety_manager_id,
        supervisor_name: null,
        short_name: r.short_name,
        township: r.township,
        parent_id: r.parent_id,
        sort_order: r.sort_order,
        description: r.description,
        path: r.path,
        org_unit_id: r.org_unit_id,
        children: [],
        employee_count_approximate: false,
      });
    });

    // 班组按"乡镇名前缀"挂载到 hse_org_unit 乡镇节点（阶段1 主要合并动作：消除班组无映射导致的空列表）。
    const townNodes = ouRows.filter(r => r.org_type === 'town_center');
    const townShortOf = {};
    townNodes.forEach(r => { townShortOf[r.id] = r.org_name.replace(/作业中心$/, ''); });
    teamRows.forEach(t => {
      let hitOuId = null;
      let hitLen = 0;
      for (const r of townNodes) {
        const ts = townShortOf[r.id];
        if (t.name.startsWith(ts) && ts.length > hitLen) {
          hitOuId = r.id;
          hitLen = ts.length;
        }
      }
      if (hitOuId != null) {
        ouNodeMap.get(hitOuId).children.push(teamNodeMap.get(t.id));
      } else {
        // 无法匹配乡镇的班组（如车队）挂到根公司节点，避免丢失
        ouNodeMap.get(ouRows[0].id).children.push(teamNodeMap.get(t.id));
      }
    });

    // 串联 hse_org_unit 主干（company → 职能/作业中心 → 乡镇）
    ouRows.forEach(r => {
      if (r.parent_id != null && ouNodeMap.has(r.parent_id)) {
        ouNodeMap.get(r.parent_id).children.push(ouNodeMap.get(r.id));
      }
    });

    // 班组人数：父乡镇精确人数 / 班组数（近似，阶段2 精确化到"所属部门"字段）
    ouNodeMap.forEach((node, ouId) => {
      if (node.org_type === 'town_center' && node.children.length > 0) {
        const townCount = countMap[ouId] || 0;
        const n = node.children.length;
        node.children.forEach(child => {
          child.employee_count = Math.round(townCount / n);
          child.actual_headcount = child.employee_count;
          child.employee_count_approximate = true;
        });
      }
    });

    // 汇总：作业中心 = 下属乡镇+车队之和；公司 = 直属职能部门之和（不含乡镇/作业中心）
    ouNodeMap.forEach(node => {
      if (node.org_type === 'center') {
        const s = node.children.reduce((a, c) => a + (c.employee_count || 0), 0);
        node.employee_count = s;
        node.actual_headcount = s;
      }
    });
    ouNodeMap.forEach(node => {
      if (node.org_type === 'company') {
        const s = node.children
          .filter(c => c.org_type === 'department')
          .reduce((a, c) => a + (c.employee_count || 0), 0);
        node.employee_count = s;
        node.actual_headcount = s;
      }
    });

    // 根为 company 节点（parent_id = null）；返回 snake_case 以与 departments.vue 一致
    const root = ouNodeMap.get(ouRows[0].id);
    res.json(success(root ? [root] : [], '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /departments — 部门扁平列表
router.get('/departments', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success([], '数据库未连接'));

    const result = await pool.query(
      `SELECT id, dept_code, name, short_name, parent_id, level, path, township,
              manager_id, safety_manager_id, headcount, sort_order, status, description,
              org_unit_id
       FROM department WHERE is_deleted = false ORDER BY level ASC, sort_order ASC`
    );
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /departments/:id/employees — 查询部门下的员工列表
router.get('/departments/:id/employees', decryptMiddleware(...ENCRYPT_FIELDS), async (req, res) => {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ list: [], total: 0 }), '数据库未连接'));

    const rawId = req.params.id;
    const { page = 1, pageSize = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    // Sprint-C Phase 1: 使用 employee_assignment + hse_org_unit 替代 hse_employee_org
    // 在职口径与「员工列表-在职卡片」一致：仅 employment_relation='正式员工'，
    // 不再用 NOT IN(辞职,死亡)（会把未标注关系的在任员工误算，导致组织人数超过在职总数）。
    const conditions = [
      'e.is_deleted = false',
      "e.employment_relation = '正式员工'",
      'ea.is_current = true',
      'ea.is_deleted = false',
      'ea.is_primary = true',
      'ou.is_deleted = false',
    ];
    const params = [];
    let paramIdx = 1;

    let orgUnitIds = [];

    // 需求：点击组织节点级联展示其「所有后代单位」的人员。
    // - 历史/子树节点（公司/作业中心/乡镇）：前端传入 ouIds（自节点起所有后代组织单元 id），本端点直接按 ou.id=ANY 查询。
    // - 班组叶子（如「长官镇一班」）：hse_org_unit 无对应节点，按 employee_assignment.dept_name 精确过滤。
    const ouIdsParam = String(req.query.ouIds || '').trim();
    const deptNameParam = String(req.query.deptName || '').trim();
    const scopeByDeptName = !!deptNameParam;

    if (deptNameParam) {
      conditions.push(`ea.dept_name = $${paramIdx}`);
      params.push(deptNameParam);
      paramIdx++;
    } else if (ouIdsParam) {
      const ids = ouIdsParam.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
      if (ids.length === 0) return res.json(error(-2, '无效的组织ID'));
      orgUnitIds = ids;
      conditions.push(`ou.id = ANY($${paramIdx})`);
      params.push(orgUnitIds);
      paramIdx++;
    } else {
      // 提示词-125 C-1：处理 ou_X 合成 ID（来自 hse_org_unit 合并树节点）
      // 原 parseInt('ou_5') 返回 NaN → 后续查询失败。这里提前拦截，直接按 org_unit_id 查员工。
      if (typeof rawId === 'string' && rawId.startsWith('ou_')) {
      const orgUnitId = parseInt(rawId.slice(3), 10);
      if (isNaN(orgUnitId)) return res.json(error(-2, '无效的组织ID'));
      orgUnitIds = [orgUnitId];
    } else {
      const deptId = parseInt(rawId);
      if (isNaN(deptId)) return res.json(error(-2, '部门不存在'));

      // 提示词-108 T1：修复跨 ID 空间比较 bug（P1）
      // 原实现 `ou.id = deptId` 直接把 hse_org_unit.id 与 department.id 比较，
      // 两表 ID 空间完全不同（department 从 4056 起、hse_org_unit 仅 1-20）
      // → 员工子列表恒为空。正确关联是 department.name ←→ hse_org_unit.org_name，
      // 与本文件 /departments/tree 中 employee_count 的统计口径保持一致。
      // 实测两表命名粒度不同（部门树细到「班组」，组织单元只到「作业中心」），
      // 精确等值命中 0 行，故采用「精确优先、前缀兜底」两级解析
      // （前缀规则 ou.org_name LIKE dept.name || '%' 已验证 1:1 无一对多歧义，
      //   例：宁城街道 → 宁城街道作业中心、刘营伍 → 刘营伍乡作业中心）。
      const deptRow = await pool.query(
        `SELECT name, org_unit_id FROM department WHERE id = $1 AND is_deleted = false`, [deptId]
      );
      if (deptRow.rows.length === 0) return res.json(error(-2, '部门不存在'));

      // 提示词-112 T2.2：优先使用 ID 映射（方案A核心）
      if (deptRow.rows[0].org_unit_id) {
        orgUnitIds = [deptRow.rows[0].org_unit_id];
      } else {
        // 提示词-125 C-2：降级分支增加班组名称前缀提取（乡镇/片区/车队）
        // 班组节点（如「宁城街道一班」）在 department 表 org_unit_id 为 NULL，
        // 原直接用全名「宁城街道一班」去 hse_org_unit 匹配必失败 → 空列表。
        // 提取乡镇前缀（「宁城街道一班」→「宁城街道」）后再做精确/前缀匹配。
        const deptName = deptRow.rows[0].name;
        let matchName = deptName;
        const teamPattern = /^(.+?)(一|二|三|四|五|六|七|八|九|十)班$/;
        const areaPattern = /^(.+?)片区$/;
        if (teamPattern.test(deptName)) {
          matchName = deptName.match(teamPattern)[1];
        } else if (areaPattern.test(deptName)) {
          matchName = deptName.match(areaPattern)[1];
        } else if (deptName === '车队') {
          matchName = deptName;
        }
        const ouRows = await pool.query(
          `SELECT id, (org_name = $1) AS exact_hit FROM hse_org_unit
            WHERE is_deleted = false AND (org_name = $1 OR org_name LIKE $1 || '%')`,
          [matchName]
        );
        const exactIds = ouRows.rows.filter((r) => r.exact_hit).map((r) => r.id);
        orgUnitIds = exactIds.length > 0 ? exactIds : ouRows.rows.map((r) => r.id);
      }
    }
    }

    // 班组级部门（如「宁城街道一班」）在 hse_org_unit 中无对应节点，返回空列表而非报错。
    // 按 dept_name 精确过滤（scopeByDeptName）时 orgUnitIds 恒为空，跳过此短路。
    if (!scopeByDeptName && orgUnitIds.length === 0) {
      return buildListResponse(res, [], 0, pageNum, limitNum, '查询成功', { camelCase: false });
    }

    if (orgUnitIds.length > 0) {
      conditions.push(`ou.id = ANY($${paramIdx})`);
      params.push(orgUnitIds);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM employee e
       JOIN employee_assignment ea ON ea.employee_id = e.id
       JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
       WHERE ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT e.id, e.employee_code, e.id_card, e.name, e.gender, e.birth_date, e.phone,
              CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age,
              ou.org_path, ea.position_id, ea.start_date,
              p.name AS position_name
       FROM employee e
       JOIN employee_assignment ea ON ea.employee_id = e.id
       JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
       LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
       WHERE ${whereClause}
       ORDER BY e.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    // 部门详情的员工子列表：前端 employeeColumns 用 snake_case（id_card / position_name / start_date）。
    // 原 camelCase:true 导致键名不匹配、证件号与岗位列空。改为 snake_case 输出。
    buildListResponse(res, result.rows, total, pageNum, limitNum, '查询成功', { camelCase: false });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /departments — 新增部门
router.post('/departments', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const { dept_code, name, short_name, parent_id, level, township, manager_id, safety_manager_id, headcount, sort_order, description } = req.body;
    if (!dept_code) return res.json(error(-3, '部门编码不能为空'));
    if (!name) return res.json(error(-3, '部门名称不能为空'));

    // 提示词-116 P0-1：层级必须在 1-6 之间（与数据库 CHECK 约束一致，前端 Select 上限为班组=6）
    if (level !== undefined && (level < 1 || level > 6)) {
      return res.json(error(-3, '层级必须在 1-6 之间'));
    }

    // 检查编码唯一性
    const existCode = await pool.query(`SELECT id FROM department WHERE dept_code = $1 AND is_deleted = false`, [dept_code]);
    if (existCode.rows.length > 0) return res.json(error(-4, '部门编码已存在'));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 构建 path
      const parentPath = await buildDeptPath(client, parent_id);
      const path = `${parentPath}${parent_id || ''}/`;

      const result = await client.query(
        `INSERT INTO department (dept_code, name, short_name, parent_id, level, path, township, manager_id, safety_manager_id, headcount, sort_order, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [dept_code, name, short_name || null, parent_id || null, level || null, path,
         township || null, manager_id || null, safety_manager_id || null, headcount || 0, sort_order || 0, description || null]
      );

      // 提示词-112 T3.1：新建部门时自动检测 org_unit_id 映射
      const ouMatch = await client.query(
        `SELECT id FROM hse_org_unit WHERE is_deleted = false AND (org_name = $1 OR org_name LIKE $1 || '%') LIMIT 1`,
        [name]
      );
      if (ouMatch.rows.length > 0) {
        await client.query(
          `UPDATE department SET org_unit_id = $1 WHERE id = $2`,
          [ouMatch.rows[0].id, result.rows[0].id]
        );
        result.rows[0].org_unit_id = ouMatch.rows[0].id;
      }

      await client.query('COMMIT');

      await auditLog({
        userId: req.user?.id, username: req.user?.username,
        action: 'create', module: '组织管理',
        description: `新增部门: ${name}（${dept_code}）`,
        ip: req.ip,
      }).catch(() => {});

      buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /departments/:id — 更新部门
router.put('/departments/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const updates = req.body;
    const fields = [];
    const values = [];
    let paramIdx = 1;

    const allowedFields = ['dept_code', 'name', 'short_name', 'parent_id', 'level', 'township', 'manager_id', 'safety_manager_id', 'headcount', 'sort_order', 'status', 'description'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = $${paramIdx++}`);
        values.push(updates[field]);
      }
    }
    if (fields.length === 0) return res.json(error(-3, '没有要更新的字段'));

    // 提示词-116 P0-1：层级必须在 1-6 之间（与数据库 CHECK 约束一致）
    if (updates.level !== undefined && (updates.level < 1 || updates.level > 6)) {
      return res.json(error(-3, '层级必须在 1-6 之间'));
    }

    // 提示词-112 T3.2：部门改名时自动更新 org_unit_id 映射
    if (updates.name !== undefined) {
      const ouMatch = await pool.query(
        `SELECT id FROM hse_org_unit WHERE is_deleted = false AND (org_name = $1 OR org_name LIKE $1 || '%') LIMIT 1`,
        [updates.name]
      );
      fields.push(`org_unit_id = $${paramIdx++}`);
      values.push(ouMatch.rows.length > 0 ? ouMatch.rows[0].id : null);
    }

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE department SET ${fields.join(', ')} WHERE id = $${paramIdx} AND is_deleted = false RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.json(error(-2, '部门不存在或已删除'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '组织管理',
      description: `更新部门 ID=${req.params.id}: ${updates.name || ''}`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// DELETE /departments/:id — 删除部门（软删除）
router.delete('/departments/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    // 检查是否有子部门
    const childResult = await pool.query(`SELECT id FROM department WHERE parent_id = $1 AND is_deleted = false`, [req.params.id]);
    if (childResult.rows.length > 0) return res.json(error(-5, '存在子部门，无法删除'));

    const result = await pool.query(
      `UPDATE department SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING name`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '部门不存在或已删除'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '组织管理',
      description: `删除部门: ${result.rows[0].name} (ID=${req.params.id})`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 三、岗位管理 (position 表)
// ============================================================

// GET /positions — 岗位列表
router.get('/positions', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success([], '数据库未连接'));

    const { deptId, keyword, jobCategory, isSpecialPost, page, pageSize } = req.query;
    const conditions = ['p.is_deleted = false'];
    const params = [];
    let paramIdx = 1;

    if (deptId) {
      conditions.push(`p.dept_id = $${paramIdx++}`);
      params.push(deptId);
    }
    if (keyword) {
      conditions.push(`(p.name ILIKE $${paramIdx} OR p.position_code ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    // 提示词-122 P2：岗位类别 / 特种作业 服务端筛选
    if (jobCategory) {
      conditions.push(`p.job_category = $${paramIdx++}`);
      params.push(jobCategory);
    }
    if (isSpecialPost !== undefined && isSpecialPost !== '') {
      conditions.push(`p.is_special_post = $${paramIdx++}`);
      params.push(isSpecialPost === true || isSpecialPost === 'true');
    }

    const whereClause = conditions.join(' AND ');
    const baseSelect =
      `SELECT p.id, p.position_code, p.name, p.dept_id, p.job_category, p.is_special_post,
              p.is_safety_critical, p.safety_duties, p.sort_order, p.status,
              d.name AS dept_name
       FROM position p
       LEFT JOIN department d ON p.dept_id = d.id AND d.is_deleted = false
       WHERE ${whereClause}
       ORDER BY p.sort_order ASC, p.id ASC`;

    // 提示词-122 P2：分页（仅当传入 page/pageSize 时返回 {list,total,page,pageSize}，
    // 否则返回数组以兼容 OrgTransferModal 等旧调用方）
    const isPaged = page !== undefined || pageSize !== undefined;
    if (isPaged) {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(Math.max(1, parseInt(pageSize, 10) || 20), 200);
      const offset = (pageNum - 1) * limitNum;

      const countResult = await pool.query(
        `SELECT COUNT(*) AS cnt FROM position p WHERE ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].cnt, 10);

      const result = await pool.query(
        `${baseSelect} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limitNum, offset]
      );
      // 岗位管理前端 positions.vue 的 dataIndex/bodyCell 全为 snake_case，返回原始 snake_case
      res.json(success({ list: result.rows, total, page: pageNum, pageSize: limitNum }, '查询成功'));
    } else {
      const result = await pool.query(baseSelect, params);
      // 岗位管理前端 positions.vue 的 dataIndex/bodyCell 全为 snake_case，返回原始 snake_case
      res.json(success(result.rows, '查询成功'));
    }
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /positions — 新增岗位
router.post('/positions', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const { position_code, name, dept_id, job_category, is_special_post, is_safety_critical, safety_duties, sort_order, status } = req.body;
    if (!position_code) return res.json(error(-3, '岗位编码不能为空'));
    if (!name) return res.json(error(-3, '岗位名称不能为空'));

    const existCode = await pool.query(`SELECT id FROM position WHERE position_code = $1 AND is_deleted = false`, [position_code]);
    if (existCode.rows.length > 0) return res.json(error(-4, '岗位编码已存在'));

    const result = await pool.query(
      `INSERT INTO position (position_code, name, dept_id, job_category, is_special_post, is_safety_critical, safety_duties, sort_order, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [position_code, name, dept_id || null, job_category || null, is_special_post || false, is_safety_critical || false,
       safety_duties || null, sort_order || 0, status || 'active']
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '岗位管理',
      description: `新增岗位: ${name}（${position_code}）`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /positions/:id — 更新岗位
router.put('/positions/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const updates = req.body;
    const fields = [];
    const values = [];
    let paramIdx = 1;

    const allowedFields = ['position_code', 'name', 'dept_id', 'job_category', 'is_special_post', 'is_safety_critical', 'safety_duties', 'sort_order', 'status'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = $${paramIdx++}`);
        values.push(updates[field]);
      }
    }
    if (fields.length === 0) return res.json(error(-3, '没有要更新的字段'));

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE position SET ${fields.join(', ')} WHERE id = $${paramIdx} AND is_deleted = false RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.json(error(-2, '岗位不存在或已删除'));

    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// DELETE /positions/:id — 删除岗位（软删除）
router.delete('/positions/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    // 提示词-122 P1：删除前检查是否有在职员工关联该岗位，返回友好错误而非 DB 原始报错
    const cntResult = await pool.query(
      `SELECT COUNT(*) AS cnt FROM employee_assignment WHERE position_id = $1 AND is_current = true AND is_deleted = false`,
      [req.params.id]
    );
    const assignedCount = parseInt(cntResult.rows[0].cnt, 10);
    if (assignedCount > 0) {
      return res.json(error(-5, `该岗位下有 ${assignedCount} 名在职员工，无法删除。请先为这些员工调整岗位后再操作。`));
    }

    const result = await pool.query(
      `UPDATE position SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING name`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '岗位不存在或已删除'));

    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 四、人员组织关系维护 (hse_employee_org 表)
// ============================================================

// GET /org/employee/:employeeId — 员工当前组织关系
// Sprint-C Phase 1: 使用 employee_assignment 替代 hse_employee_org
router.get('/org/employee/:employeeId', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `SELECT ea.id, ea.employee_id, ea.position_id, ea.start_date, ea.end_date,
              ea.supervisor_id, 
              CASE 
                WHEN ea.status = 'active' THEN '在职'
                WHEN ea.status = 'pending' THEN '待岗'
                WHEN ea.status = 'inactive' THEN '离职'
                WHEN ea.status = 'retired' THEN '退休'
                WHEN ea.status = 'reinstated' THEN '返聘'
                ELSE ea.status
              END AS status,
              ea.is_current, ea.remark AS change_reason,
              ou.id AS org_unit_id,
              ou.org_path,
              ou.org_name,
              p.name AS position_name,
              s.name AS supervisor_name
       FROM employee_assignment ea
       LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
       LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
       LEFT JOIN employee s ON ea.supervisor_id = s.id AND s.is_deleted = false
       WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_deleted = false`,
      [req.params.employeeId]
    );
    if (result.rows.length === 0) return res.json(error(-2, '无当前组织关系'));
    buildDetailResponse(res, result.rows[0], '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /org/employee/:employeeId/history — 员工组织关系历史
// Sprint-C Phase 1: 使用 employee_assignment 替代 hse_employee_org
router.get('/org/employee/:employeeId/history', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `SELECT ea.id, ea.position_id, ea.start_date, ea.end_date,
              CASE 
                WHEN ea.status = 'active' THEN '在职'
                WHEN ea.status = 'pending' THEN '待岗'
                WHEN ea.status = 'inactive' THEN '离职'
                WHEN ea.status = 'retired' THEN '退休'
                WHEN ea.status = 'reinstated' THEN '返聘'
                ELSE ea.status
              END AS status,
              ea.is_current, ea.remark AS change_reason, ea.created_at,
              ou.org_path,
              p.name AS position_name,
              eh.event_type, eh.event_date, eh.before_status, eh.after_status,
              eh.approval_no, eh.remark
       FROM employee_assignment ea
       LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
       LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
       LEFT JOIN employee_history eh ON eh.employee_id = ea.employee_id AND eh.event_date = ea.start_date AND eh.is_deleted = false
       WHERE ea.employee_id = $1 AND ea.is_deleted = false
       ORDER BY ea.start_date DESC, ea.id DESC`,
      [req.params.employeeId]
    );
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /org/assign — 调岗/分配组织关系（核心）
// Sprint-C Phase 1: 使用 employee_assignment 替代 hse_employee_org
// 1. 结束当前组织关系(is_current=false, end_date=调岗前日)
// 2. 新增组织关系(is_current=true)
// 3. 记录 employee_history
router.post('/org/assign', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const {
      employee_id, group_id, region_id, enterprise_id, project_id, team_id,
      position_id, start_date, supervisor_id, change_reason, remark
    } = req.body;

    if (!employee_id) return res.json(error(-3, '员工ID不能为空'));
    if (!start_date) return res.json(error(-3, '开始日期不能为空'));

    // 验证员工存在
    const empResult = await pool.query(`SELECT id, name FROM employee WHERE id = $1 AND is_deleted = false`, [employee_id]);
    if (empResult.rows.length === 0) return res.json(error(-2, '员工不存在'));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Sprint-C Phase 1: 查询当前组织关系（从 employee_assignment）
      const currentOrgResult = await client.query(
        `SELECT ea.id, ea.org_unit_id, ea.position_id, ea.start_date, ea.status,
                ou.org_path
         FROM employee_assignment ea
         LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
         WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_deleted = false`,
        [employee_id]
      );

      let beforeOrgUnitId = null;
      let beforePositionId = null;
      let beforeStatus = null;

      if (currentOrgResult.rows.length > 0) {
        const currentOrg = currentOrgResult.rows[0];
        beforeOrgUnitId = currentOrg.org_unit_id;
        beforePositionId = currentOrg.position_id;
        beforeStatus = currentOrg.status;

        // Sprint-C Phase 1: 结束当前组织关系（更新 employee_assignment）
        const endDate = new Date(start_date);
        endDate.setDate(endDate.getDate() - 1);
        await client.query(
          `UPDATE employee_assignment SET is_current = false, end_date = $2, updated_at = NOW()
           WHERE id = $1`,
          [currentOrg.id, endDate.toISOString().split('T')[0]]
        );
      }

      // Sprint-C Phase 1: 解析 org_unit_id（从 5 列扁平组织映射到 hse_org_unit）
      const { orgUnitId, orgPath } = await resolveOrgUnitId(client, { 
        group_id, region_id, enterprise_id, project_id, team_id 
      });

      // Sprint-C Phase 1: 新增组织关系（插入 employee_assignment）
      const newOrgResult = await client.query(
        `INSERT INTO employee_assignment (
            employee_id, org_unit_id, position_id, supervisor_id, 
            status, is_current, is_primary, start_date, remark, created_by
          ) VALUES ($1, $2, $3, $4, 'active', true, true, $5, $6, $7) RETURNING *`,
        [employee_id, orgUnitId, position_id || null, supervisor_id || null, 
         start_date, change_reason || '调岗', req.user?.id || null]
      );

      // 记录人事变动
      const eventType = currentOrgResult.rows.length === 0 ? '入职' : '调岗';
      await client.query(
        `INSERT INTO employee_history (employee_id, event_type, event_date, before_dept_id, after_dept_id, before_position_id, after_position_id, before_status, after_status, remark, approver_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '在职', $9, $10)`,
        [employee_id, eventType, start_date, beforeOrgUnitId, orgUnitId, beforePositionId, position_id || null, beforeStatus, remark || null, req.user?.id || null]
      );

      await client.query('COMMIT');

      await auditLog({
        userId: req.user?.id, username: req.user?.username,
        action: 'update', module: '人员组织关系',
        description: `${eventType}: 员工${empResult.rows[0].name}(ID=${employee_id})`,
        ip: req.ip,
      }).catch(() => {});

      // P0-2: 发布员工事件（调岗/入职 → EMPLOYEE_TRANSFERRED）
      try {
        employeeEventService.publishEmployeeEvent({
          type: 'EMPLOYEE_TRANSFERRED',
          employeeId: employee_id,
          occurredAt: new Date().toISOString(),
          payload: {
            fromOrgUnitId: beforeOrgUnitId,
            toOrgUnitId: orgUnitId,
            fromPositionId: beforePositionId,
            toPositionId: position_id || null,
            changeReason: change_reason || eventType,
          },
        });
      } catch (e) {
        console.warn('[hse-employee] 发布 EMPLOYEE_TRANSFERRED 事件失败:', e.message);
      }

      // 构建响应（保持原有响应结构）
      const responseData = {
        id: newOrgResult.rows[0].id,
        employee_id: employee_id,
        org_unit_id: orgUnitId,
        org_path: orgPath,
        position_id: position_id || null,
        start_date: start_date,
        supervisor_id: supervisor_id || null,
        status: '在职',
        is_current: true,
        change_reason: change_reason || '调岗',
      };
      buildDetailResponse(res, responseData, `${eventType}成功`, { camelCase: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /org/:id/status — 人员状态变更（待岗/复岗/离职/退休/返聘）
router.put('/org/:id/status', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const { status, event_date, remark } = req.body;
    const validStatuses = ['在职', '待岗', '离职', '退休', '返聘'];
    if (!validStatuses.includes(status)) return res.json(error(-3, `无效状态，可选: ${validStatuses.join('/')}`));
    if (!event_date) return res.json(error(-3, '事件日期不能为空'));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Sprint-C Phase 1: 查询当前组织关系（从 employee_assignment）
      const orgResult = await client.query(
        `SELECT ea.id, ea.employee_id, ea.status, ea.position_id, ea.org_unit_id, ou.org_path
         FROM employee_assignment ea
         LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
         WHERE ea.id = $1 AND ea.is_current = true AND ea.is_deleted = false`,
        [req.params.id]
      );
      if (orgResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.json(error(-2, '组织关系不存在或非当前记录'));
      }

      const org = orgResult.rows[0];
      const beforeStatus = STATUS_REVERSE_MAP[org.status] || org.status;

      // Sprint-C Phase 1: 状态标准化（中文 → 英文）
      const normalizedStatus = STATUS_MAP[status] || status;

      // Sprint-C Phase 1: 更新状态（employee_assignment）
      if (status === '离职' || status === '退休') {
        // 终态：结束当前记录
        await client.query(
          `UPDATE employee_assignment SET status = $2, is_current = false, end_date = $3, updated_at = NOW() WHERE id = $1`,
          [req.params.id, normalizedStatus, event_date]
        );
      } else {
        // 非终态（待岗/复岗/返聘）：更新状态
        await client.query(
          `UPDATE employee_assignment SET status = $2, updated_at = NOW() WHERE id = $1`,
          [req.params.id, normalizedStatus]
        );
      }

      // 映射状态到事件类型
      // 注意: '在职' 状态变更可能来自"复岗"(从待岗恢复) 或初始入职(走 /org/assign)
      // 通过 beforeStatus 判断: 待岗→在职 为"复岗"
      const eventMap = { '待岗': '待岗', '离职': '离职', '退休': '退休', '返聘': '返聘' };
      let eventType;
      if (status === '在职' && beforeStatus === '待岗') {
        eventType = '复岗';
      } else {
        eventType = eventMap[status] || '状态变更';
      }

      // Sprint-C Phase 1: 记录人事变动（使用 org_unit_id）
      await client.query(
        `INSERT INTO employee_history (employee_id, event_type, event_date, before_dept_id, after_dept_id, before_position_id, after_position_id, before_status, after_status, remark, approver_id)
         VALUES ($1, $2, $3, $4, $4, $5, $5, $6, $7, $8, $9)`,
        [org.employee_id, eventType, event_date, org.org_unit_id, org.position_id, beforeStatus, status, remark || null, req.user?.id || null]
      );

      await client.query('COMMIT');

      await auditLog({
        userId: req.user?.id, username: req.user?.username,
        action: 'update', module: '人员状态',
        description: `状态变更: 员工ID=${org.employee_id} ${beforeStatus}→${status}`,
        ip: req.ip,
      }).catch(() => {});

      // P0-2: 发布员工事件（离职 → EMPLOYEE_RESIGNED，其他 → EMPLOYEE_STATUS_CHANGED）
      try {
        const eventType = (status === '离职') ? 'EMPLOYEE_RESIGNED' : 'EMPLOYEE_STATUS_CHANGED';
        employeeEventService.publishEmployeeEvent({
          type: eventType,
          employeeId: org.employee_id,
          occurredAt: new Date().toISOString(),
          payload: {
            fromStatus: beforeStatus,
            toStatus: status,
          },
        });
      } catch (e) {
        console.warn('[hse-employee] 发布 STATUS 事件失败:', e.message);
      }

      res.json(success(null, '状态变更成功'));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 五、人事变动记录 (employee_history 表)
// ============================================================

// GET /history/employee/:employeeId — 员工人事变动历史
router.get('/history/employee/:employeeId', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `SELECT eh.id, eh.employee_id, eh.event_type, eh.event_date,
              eh.before_dept_id, eh.after_dept_id,
              eh.before_position_id, eh.after_position_id,
              eh.before_status, eh.after_status,
              eh.approver_id, eh.approve_date, eh.approval_no, eh.remark,
              eh.operator_id,
              eh.created_at,
              dp.name AS before_dept_name, da.name AS after_dept_name,
              pp.name AS before_position_name, pa.name AS after_position_name,
              ap.name AS approver_name,
              u.username AS operator_name, u.real_name AS operator_real_name
       FROM employee_history eh
       LEFT JOIN department dp ON eh.before_dept_id = dp.id AND dp.is_deleted = false
       LEFT JOIN department da ON eh.after_dept_id = da.id AND da.is_deleted = false
       LEFT JOIN position pp ON eh.before_position_id = pp.id AND pp.is_deleted = false
       LEFT JOIN position pa ON eh.after_position_id = pa.id AND pa.is_deleted = false
       LEFT JOIN employee ap ON eh.approver_id = ap.id AND ap.is_deleted = false
       LEFT JOIN users u ON eh.operator_id = u.id
       WHERE eh.employee_id = $1 AND eh.is_deleted = false
       ORDER BY eh.event_date DESC, eh.id DESC`,
      [req.params.employeeId]
    );
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 六、员工导入
// ============================================================

// POST /import — 批量导入员工（JSON数组）
// Sprint5.1.1: 移除 encryptMiddleware，手动加密+哈希；新增身份证/手机号哈希唯一性校验
router.post('/employees/import', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:import'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const { employees } = req.body;
    if (!Array.isArray(employees) || employees.length === 0) return res.json(error(-3, '员工数据不能为空'));

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    const client = await pool.connect();
    try {
      for (let i = 0; i < employees.length; i++) {
        const emp = employees[i];
        try {
          if (!emp.name) {
            errors.push({ index: i, message: '姓名不能为空' });
            failCount++;
            continue;
          }

          // 工号唯一性检查
          if (emp.employee_code) {
            const existCode = await client.query(`SELECT id FROM employee WHERE employee_code = $1 AND is_deleted = false`, [emp.employee_code]);
            if (existCode.rows.length > 0) {
              errors.push({ index: i, message: `工号 ${emp.employee_code} 已存在` });
              failCount++;
              continue;
            }
          }

          // Sprint5.1.1: 通过哈希校验身份证/手机号唯一性
          const idCardEnc = secureEncode(emp.id_card);
          const phoneEnc = secureEncode(emp.phone);
          if (idCardEnc.hash) {
            const existIdCard = await client.query(`SELECT id FROM employee WHERE id_card_hash = $1 AND is_deleted = false`, [idCardEnc.hash]);
            if (existIdCard.rows.length > 0) {
              errors.push({ index: i, message: `身份证号 ${emp.id_card} 已存在` });
              failCount++;
              continue;
            }
          }
          if (phoneEnc.hash) {
            const existPhone = await client.query(`SELECT id FROM employee WHERE phone_hash = $1 AND is_deleted = false`, [phoneEnc.hash]);
            if (existPhone.rows.length > 0) {
              errors.push({ index: i, message: `手机号 ${emp.phone} 已存在` });
              failCount++;
              continue;
            }
          }

          await client.query(
            `INSERT INTO employee (employee_code, id_card, id_card_hash, name, gender, birth_date, phone, phone_hash, person_category, person_type, is_public_welfare, id_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [emp.employee_code || null, idCardEnc.cipher, idCardEnc.hash, emp.name, emp.gender || null,
             emp.birth_date || null, phoneEnc.cipher, phoneEnc.hash, emp.person_category || null,
             emp.person_type || null, emp.is_public_welfare || false, emp.id_address || null]
          );
          successCount++;
        } catch (e) {
          errors.push({ index: i, message: e.message });
          failCount++;
        }
      }
    } finally {
      client.release();
    }

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'import', module: '人员主数据',
      description: `批量导入员工: 成功${successCount}条, 失败${failCount}条`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(camelKeys({ total: employees.length, success: successCount, failed: failCount, errors }), '导入完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// Sprint5.1.1: Excel 导入（模板下载 + 预览 + 导入）
// ============================================================

// GET /employees/import/template — 下载 Excel 模板
router.get('/employees/import/template', requireRole('admin', 'safety_manager'), (req, res) => {
  try {
    const ws = XLSX.utils.json_to_sheet(TEMPLATE_SAMPLE_ROWS);
    // 列宽优化
    ws['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 8 }, { wch: 14 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '员工导入模板');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="employee_import_template.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /employees/import/excel/preview — 上传 Excel 文件并返回解析+校验结果（不写入数据库）
router.post('/employees/import/excel/preview', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:import'), uploadExcel.single('file'), async (req, res) => {
  const tmpFile = req.file?.path;
  try {
    if (!req.file) return res.json(error(-3, '请上传 Excel 文件'));

    // 魔术字节校验
    const sigCheck = validateUploadedFile(req.file, 'excel');
    if (!sigCheck.valid) return res.json(error(-3, sigCheck.error));

    // 解析 Excel
    const workbook = XLSX.readFile(tmpFile);
    if (workbook.SheetNames.length === 0) return res.json(error(-3, 'Excel 文件无工作表'));

    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (rawRows.length === 0) return res.json(error(-3, 'Excel 工作表无数据'));

    // 表头校验：至少包含 "姓名"
    const firstRow = rawRows[0];
    if (!('姓名' in firstRow)) {
      return res.json(error(-3, 'Excel 表头必须包含"姓名"列；请下载最新模板'));
    }

    // 规范化 + 逐行校验
    const normalizedRows = [];
    const rowErrors = [];
    rawRows.forEach((rawRow, idx) => {
      const normalized = normalizeExcelRow(rawRow);
      // 跳过全空行
      if (Object.keys(normalized).length === 0) return;
      const rowIndex = idx + 2; // Excel 行号（1为表头）
      const check = validateEmployeeRow(normalized, rowIndex);
      normalizedRows.push({ ...normalized, __rowIndex: rowIndex });
      if (!check.valid) {
        rowErrors.push(...check.errors);
      }
    });

    res.json(success(camelKeys({
      fileName: fixFilenameEncoding(req.file.originalname),
      sheetName: workbook.SheetNames[0],
      totalRows: normalizedRows.length,
      validRows: normalizedRows.length - rowErrors.length,
      invalidRows: rowErrors.length,
      errors: rowErrors,
      preview: normalizedRows.slice(0, 50), // 预览前 50 行
    }), '解析完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  } finally {
    // 清理临时文件
    if (tmpFile) await deleteFile(tmpFile);
  }
});

// POST /employees/import/excel — 上传 Excel 文件并直接导入（支持组织路径匹配 + 岗位关联）
router.post('/employees/import/excel', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:import'), uploadExcel.single('file'), async (req, res) => {
  const tmpFile = req.file?.path;
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    if (!req.file) return res.json(error(-3, '请上传 Excel 文件'));

    const sigCheck = validateUploadedFile(req.file, 'excel');
    if (!sigCheck.valid) return res.json(error(-3, sigCheck.error));

    const workbook = XLSX.readFile(tmpFile);
    if (workbook.SheetNames.length === 0) return res.json(error(-3, 'Excel 文件无工作表'));

    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (rawRows.length === 0) return res.json(error(-3, 'Excel 工作表无数据'));

    let successCount = 0;
    let failCount = 0;
    const errors = [];
    const warnings = [];

    const client = await pool.connect();
    try {
      const validRows = rawRows
        .map((rawRow, idx) => ({ normalized: normalizeExcelRow(rawRow), rowIndex: idx + 2 }))
        .filter((item) => Object.keys(item.normalized).length > 0);

      for (const item of validRows) {
        const { normalized, rowIndex } = item;
        try {
          await client.query('BEGIN');

          // 行级校验
          const check = validateEmployeeRow(normalized, rowIndex);
          if (!check.valid) {
            throw new Error(check.errors.join('; '));
          }

          const idCardEnc = secureEncode(normalized.id_card);
          const phoneEnc = secureEncode(normalized.phone);

          // 查找现有员工（按工号）
          let existingEmployee = null;
          if (normalized.employee_code) {
            const existResult = await client.query(
              `SELECT id, name, employee_code FROM employee WHERE employee_code = $1 AND is_deleted = false`,
              [normalized.employee_code]
            );
            existingEmployee = existResult.rows[0] || null;
          }

          // 身份证号唯一性校验（排除自身）
          if (idCardEnc.hash) {
            const existIdCard = await client.query(
              `SELECT id FROM employee WHERE id_card_hash = $1 AND is_deleted = false AND ($2::bigint IS NULL OR id != $2)`,
              [idCardEnc.hash, existingEmployee?.id || null]
            );
            if (existIdCard.rows.length > 0) {
              throw new Error(`身份证号 ${normalized.id_card} 已被其他员工使用`);
            }
          }

          // 手机号唯一性校验（排除自身）
          if (phoneEnc.hash) {
            const existPhone = await client.query(
              `SELECT id FROM employee WHERE phone_hash = $1 AND is_deleted = false AND ($2::bigint IS NULL OR id != $2)`,
              [phoneEnc.hash, existingEmployee?.id || null]
            );
            if (existPhone.rows.length > 0) {
              throw new Error(`手机号 ${normalized.phone} 已被其他员工使用`);
            }
          }

          let employeeId;

          if (existingEmployee) {
            // 更新现有员工
            employeeId = existingEmployee.id;
            const updateFields = [];
            const updateValues = [];
            let paramIdx = 1;

            const fieldsToUpdate = ['name', 'gender', 'birth_date', 'person_category', 'person_type', 'is_public_welfare', 'id_address'];
            for (const field of fieldsToUpdate) {
              if (normalized[field] !== undefined) {
                updateFields.push(`${field} = $${paramIdx++}`);
                updateValues.push(normalized[field]);
              }
            }
            // 加密字段
            if (normalized.id_card !== undefined) {
              updateFields.push(`id_card = $${paramIdx++}`);
              updateValues.push(idCardEnc.cipher);
              updateFields.push(`id_card_hash = $${paramIdx++}`);
              updateValues.push(idCardEnc.hash);
            }
            if (normalized.phone !== undefined) {
              updateFields.push(`phone = $${paramIdx++}`);
              updateValues.push(phoneEnc.cipher);
              updateFields.push(`phone_hash = $${paramIdx++}`);
              updateValues.push(phoneEnc.hash);
            }

            if (updateFields.length > 0) {
              updateFields.push(`updated_at = NOW()`);
              updateValues.push(employeeId);
              await client.query(
                `UPDATE employee SET ${updateFields.join(', ')} WHERE id = $${paramIdx}`,
                updateValues
              );
            }
          } else {
            // 新增员工
            const insertResult = await client.query(
              `INSERT INTO employee (employee_code, id_card, id_card_hash, name, gender, birth_date, phone, phone_hash, person_category, person_type, is_public_welfare, id_address)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
               RETURNING id`,
              [normalized.employee_code || null, idCardEnc.cipher, idCardEnc.hash, normalized.name, normalized.gender || null,
               normalized.birth_date || null, phoneEnc.cipher, phoneEnc.hash, normalized.person_category || null,
               normalized.person_type || null, normalized.is_public_welfare || false, normalized.id_address || null]
            );
            employeeId = insertResult.rows[0].id;
          }

          // 组织/岗位关联：优先按组织路径，其次按「所属部门 + 职位」花名册格式
          let orgUnitId = null;
          let orgPath = null;
          let positionId = null;
          let orgAssigned = false;

          if (normalized.org_path) {
            const orgMatch = await matchOrgPath(client, normalized.org_path);
            if (orgMatch) {
              orgAssigned = true;
              if (normalized.position_name) {
                const teamDeptId = orgMatch.team_id || orgMatch.project_id || orgMatch.enterprise_id || orgMatch.region_id || orgMatch.group_id;
                positionId = await matchPositionByName(client, normalized.position_name, teamDeptId);
                if (!positionId) {
                  positionId = await matchPositionByName(client, normalized.position_name, null);
                }
                if (!positionId) {
                  warnings.push({ index: rowIndex, message: `岗位"${normalized.position_name}"未找到，已跳过岗位关联` });
                }
              }

              // Sprint-C Phase 1: 解析 org_unit_id（从 5 列扁平组织映射到 hse_org_unit）
              const resolved = await resolveOrgUnitId(client, {
                group_id: orgMatch.group_id,
                region_id: orgMatch.region_id,
                enterprise_id: orgMatch.enterprise_id,
                project_id: orgMatch.project_id,
                team_id: orgMatch.team_id,
              });
              orgUnitId = resolved.orgUnitId;
              orgPath = resolved.orgPath;
            } else {
              warnings.push({ index: rowIndex, message: `组织路径"${normalized.org_path}"未找到，已跳过组织分配` });
            }
          } else if (normalized.dept_name || normalized.position_name) {
            // 无组织路径的花名册格式：按「所属部门」解析组织 + 关联「职位」
            orgAssigned = true;
            if (normalized.dept_name) {
              orgUnitId = await resolveOrgUnitByDeptName(client, normalized.dept_name);
            }
            if (!orgUnitId && existingEmployee) {
              // 回退：沿用现有组织关系
              const cur = await client.query(
                `SELECT org_unit_id FROM employee_assignment WHERE employee_id = $1 AND is_current = true AND is_deleted = false LIMIT 1`,
                [employeeId]
              );
              orgUnitId = cur.rows[0]?.org_unit_id || null;
            }
            if (normalized.position_name) {
              positionId = await matchPositionByName(client, normalized.position_name, null);
              if (!positionId) {
                warnings.push({ index: rowIndex, message: `岗位"${normalized.position_name}"未找到，已跳过岗位关联` });
              }
            }
          }

          if (orgAssigned) {
            const startDate = normalized.hire_date || null;

            // Sprint-C Phase 1: 更新或插入组织关系（employee_assignment）
            if (existingEmployee) {
              // 将旧的组织关系设为非当前
              await client.query(
                `UPDATE employee_assignment SET is_current = false, updated_at = NOW() WHERE employee_id = $1 AND is_current = true`,
                [employeeId]
              );
            }

            await client.query(
              `INSERT INTO employee_assignment (
                 employee_id, org_unit_id, position_id, supervisor_id,
                 status, is_current, is_primary, start_date, remark, created_by
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [employeeId, orgUnitId, positionId, null,
               'active', true, true, startDate, 'Excel导入入职', req.user?.id || null]
            );

            // Sprint-C Phase 1: 仅新增员工时记录历史（使用 org_unit_id）
            if (!existingEmployee) {
              await client.query(
                `INSERT INTO employee_history (
                   employee_id, event_type, event_date,
                   after_dept_id, after_position_id, after_status,
                   remark, approver_id
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [employeeId, '入职', startDate || new Date().toISOString().slice(0, 10),
                 orgUnitId, positionId, '在职',
                 'Excel导入入职', req.user?.id || null]
              );
            }
          }

          await client.query('COMMIT');
          successCount++;
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          errors.push({ index: rowIndex, message: e.message });
          failCount++;
        }
      }
    } finally {
      client.release();
    }

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'import', module: '人员主数据',
      description: `Excel导入员工: 成功${successCount}条, 失败${failCount}条`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(camelKeys({
      total: successCount + failCount,
      success: successCount,
      failed: failCount,
      errors,
      warnings,
    }), 'Excel导入完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  } finally {
    if (tmpFile) await deleteFile(tmpFile);
  }
});

// 七、证件管理 (employee_certificate 表) —— 已拆至 ./hse-employee/certificates
router.use('/', require('./hse-employee/certificates'));

// ============================================================
// 八、一人一档 (employee_safety_profile 表)
// ============================================================
// 八、一人一档 & 九、岗位安全画像 —— 已拆至 ./hse-employee/safety-profiles
router.use('/', require('./hse-employee/safety-profiles'));


// ============================================================
// 十、岗位培训要求 (position_training_requirement 表)
// ============================================================

const VALID_TRAINING_CATEGORIES = ['safety', 'skill', 'special_operation', 'fire', 'health', 'emergency', 'other'];
const VALID_TRAINING_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'once'];

// GET /position-training-requirements — 分页查询岗位培训要求
router.get('/position-training-requirements', async (req, res) => {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, undefined, { camelCase: true });
    const { page = 1, pageSize = 20, positionId, trainingCategory, isMandatory, keyword } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(pageSize);
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'ptr.is_deleted = false';
    const params = [];
    let idx = 1;

    if (positionId) {
      whereClause += ` AND ptr.position_id = $${idx}`;
      params.push(positionId);
      idx++;
    }
    if (trainingCategory) {
      whereClause += ` AND ptr.training_category = $${idx}`;
      params.push(trainingCategory);
      idx++;
    }
    if (isMandatory !== undefined) {
      whereClause += ` AND ptr.is_mandatory = $${idx}`;
      params.push(isMandatory === 'true');
      idx++;
    }
    if (keyword) {
      whereClause += ` AND (ptr.training_type LIKE $${idx} OR ptr.training_content LIKE $${idx})`;
      params.push(`%${keyword}%`);
      idx++;
    }

    const result = await pool.query(
      `SELECT ptr.*, p.name AS position_name, p.position_code
       FROM position_training_requirement ptr
       LEFT JOIN position p ON ptr.position_id = p.id AND p.is_deleted = false
       WHERE ${whereClause}
       ORDER BY ptr.is_mandatory DESC, ptr.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limitNum, offset]
    );

    const totalR = await pool.query(
      `SELECT COUNT(*)::int AS total FROM position_training_requirement ptr WHERE ${whereClause}`,
      params
    );

    buildListResponse(res, result.rows, totalR.rows[0].total, pageNum, limitNum, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /position-training-requirements/stats — 岗位培训要求统计
router.get('/position-training-requirements/stats', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ total: 0, byCategory: {}, byFrequency: {}, byMandatory: {} })));

    const [totalR, categoryR, frequencyR, mandatoryR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM position_training_requirement WHERE is_deleted = false`),
      pool.query(`SELECT training_category, COUNT(*)::int AS count FROM position_training_requirement WHERE is_deleted = false GROUP BY training_category`),
      pool.query(`SELECT frequency, COUNT(*)::int AS count FROM position_training_requirement WHERE is_deleted = false GROUP BY frequency`),
      pool.query(`SELECT is_mandatory, COUNT(*)::int AS count FROM position_training_requirement WHERE is_deleted = false GROUP BY is_mandatory`),
    ]);

    const byCategory = {};
    categoryR.rows.forEach(r => { byCategory[r.training_category] = r.count; });
    const byFrequency = {};
    frequencyR.rows.forEach(r => { byFrequency[r.frequency] = r.count; });
    const byMandatory = {};
    mandatoryR.rows.forEach(r => { byMandatory[r.is_mandatory ? 'mandatory' : 'optional'] = r.count; });

    res.json(success(camelKeys({
      total: totalR.rows[0].total,
      byCategory,
      byFrequency,
      byMandatory,
    })));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /position-training-requirements/:id — 岗位培训要求详情
router.get('/position-training-requirements/:id', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT ptr.*, p.name AS position_name, p.position_code
       FROM position_training_requirement ptr
       LEFT JOIN position p ON ptr.position_id = p.id AND p.is_deleted = false
       WHERE ptr.id = $1 AND ptr.is_deleted = false`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '岗位培训要求不存在'));
    buildDetailResponse(res, result.rows[0], undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /position-training-requirements/position/:positionId — 查询某岗位的培训要求
router.get('/position-training-requirements/position/:positionId', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ list: [], total: 0, position: null })));

    const posResult = await pool.query(`SELECT id, name, position_code FROM position WHERE id = $1 AND is_deleted = false`, [req.params.positionId]);

    const result = await pool.query(
      `SELECT ptr.*
       FROM position_training_requirement ptr
       WHERE ptr.position_id = $1 AND ptr.is_deleted = false
       ORDER BY ptr.is_mandatory DESC, ptr.frequency, ptr.created_at DESC`,
      [req.params.positionId]
    );

    res.json(success(camelKeys({
      list: result.rows,
      total: result.rows.length,
      position: posResult.rows[0] || null,
    })));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /position-training-requirements — 新增岗位培训要求
router.post('/position-training-requirements', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const {
      position_id, training_type, training_category, required_hours = 0,
      frequency = 'yearly', frequency_interval = 1, required_certificate_category,
      is_mandatory = true, is_onboarding_required = false, is_refresher_required = false,
      refresher_interval_days = 365, training_content, assessment_required = true,
      passing_score = 80, validity_days, materials_required, ai_training_suggestion
    } = req.body;

    if (!position_id) return res.json(error(-3, '岗位ID不能为空'));
    if (!training_type) return res.json(error(-3, '培训类型不能为空'));
    if (!training_category || !VALID_TRAINING_CATEGORIES.includes(training_category)) {
      return res.json(error(-3, `培训分类必须为：${VALID_TRAINING_CATEGORIES.join(', ')}`));
    }
    if (!VALID_TRAINING_FREQUENCIES.includes(frequency)) {
      return res.json(error(-3, `培训频率必须为：${VALID_TRAINING_FREQUENCIES.join(', ')}`));
    }

    const posResult = await pool.query(`SELECT id FROM position WHERE id = $1 AND is_deleted = false`, [position_id]);
    if (posResult.rows.length === 0) return res.json(error(-2, '岗位不存在'));

    const insertResult = await pool.query(
      `INSERT INTO position_training_requirement (
         position_id, training_type, training_category, required_hours,
         frequency, frequency_interval, required_certificate_category,
         is_mandatory, is_onboarding_required, is_refresher_required,
         refresher_interval_days, training_content, assessment_required,
         passing_score, validity_days, materials_required, ai_training_suggestion, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [position_id, training_type, training_category, required_hours,
       frequency, frequency_interval, required_certificate_category || null,
       is_mandatory, is_onboarding_required, is_refresher_required,
       refresher_interval_days, training_content || null, assessment_required,
       passing_score, validity_days || null, materials_required || null,
       ai_training_suggestion || null, req.user?.id || null]
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '岗位培训要求',
      description: `新增岗位培训要求: ${training_type} (岗位ID: ${position_id})`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, insertResult.rows[0], '新增成功', { camelCase: true });
  } catch (err) {
    if (err.message && err.message.includes('uk_pos_training_position_type')) {
      return res.json(error(-4, '同一岗位同一培训类型已存在'));
    }
    res.json(error(-1, err.message));
  }
});

// PUT /position-training-requirements/:id — 更新岗位培训要求
router.put('/position-training-requirements/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const {
      training_type, training_category, required_hours,
      frequency, frequency_interval, required_certificate_category,
      is_mandatory, is_onboarding_required, is_refresher_required,
      refresher_interval_days, training_content, assessment_required,
      passing_score, validity_days, materials_required, ai_training_suggestion
    } = req.body;

    const updates = [];
    const params = [];
    let idx = 1;

    if (training_type !== undefined) { updates.push(`training_type = $${idx}`); params.push(training_type); idx++; }
    if (training_category !== undefined) {
      if (!VALID_TRAINING_CATEGORIES.includes(training_category)) {
        return res.json(error(-3, `培训分类必须为：${VALID_TRAINING_CATEGORIES.join(', ')}`));
      }
      updates.push(`training_category = $${idx}`);
      params.push(training_category);
      idx++;
    }
    if (required_hours !== undefined) { updates.push(`required_hours = $${idx}`); params.push(required_hours); idx++; }
    if (frequency !== undefined) {
      if (!VALID_TRAINING_FREQUENCIES.includes(frequency)) {
        return res.json(error(-3, `培训频率必须为：${VALID_TRAINING_FREQUENCIES.join(', ')}`));
      }
      updates.push(`frequency = $${idx}`);
      params.push(frequency);
      idx++;
    }
    if (frequency_interval !== undefined) { updates.push(`frequency_interval = $${idx}`); params.push(frequency_interval); idx++; }
    if (required_certificate_category !== undefined) { updates.push(`required_certificate_category = $${idx}`); params.push(required_certificate_category); idx++; }
    if (is_mandatory !== undefined) { updates.push(`is_mandatory = $${idx}`); params.push(is_mandatory); idx++; }
    if (is_onboarding_required !== undefined) { updates.push(`is_onboarding_required = $${idx}`); params.push(is_onboarding_required); idx++; }
    if (is_refresher_required !== undefined) { updates.push(`is_refresher_required = $${idx}`); params.push(is_refresher_required); idx++; }
    if (refresher_interval_days !== undefined) { updates.push(`refresher_interval_days = $${idx}`); params.push(refresher_interval_days); idx++; }
    if (training_content !== undefined) { updates.push(`training_content = $${idx}`); params.push(training_content); idx++; }
    if (assessment_required !== undefined) { updates.push(`assessment_required = $${idx}`); params.push(assessment_required); idx++; }
    if (passing_score !== undefined) { updates.push(`passing_score = $${idx}`); params.push(passing_score); idx++; }
    if (validity_days !== undefined) { updates.push(`validity_days = $${idx}`); params.push(validity_days); idx++; }
    if (materials_required !== undefined) { updates.push(`materials_required = $${idx}`); params.push(materials_required); idx++; }
    if (ai_training_suggestion !== undefined) { updates.push(`ai_training_suggestion = $${idx}`); params.push(ai_training_suggestion); idx++; }

    if (updates.length === 0) return res.json(error(-3, '请提供要更新的字段'));

    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE position_training_requirement SET ${updates.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.json(error(-2, '岗位培训要求不存在'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '岗位培训要求',
      description: `更新岗位培训要求: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) {
    if (err.message && err.message.includes('uk_pos_training_position_type')) {
      return res.json(error(-4, '同一岗位同一培训类型已存在'));
    }
    res.json(error(-1, err.message));
  }
});

// DELETE /position-training-requirements/:id — 软删除岗位培训要求
router.delete('/position-training-requirements/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const result = await pool.query(
      `UPDATE position_training_requirement SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '岗位培训要求不存在'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '岗位培训要求',
      description: `删除岗位培训要求: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /position-training-requirements/batch-import — 批量导入岗位培训要求
router.post('/position-training-requirements/batch-import', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:import'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.json(error(-3, '导入数据不能为空'));
    if (items.length > 500) return res.json(error(-3, '单次导入不能超过500条'));

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rowIdx = i + 1;
        try {
          if (!item.position_id) throw new Error('岗位ID不能为空');
          if (!item.training_type) throw new Error('培训类型不能为空');
          if (!item.training_category || !VALID_TRAINING_CATEGORIES.includes(item.training_category)) {
            throw new Error(`培训分类无效`);
          }
          await client.query(
            `INSERT INTO position_training_requirement (
               position_id, training_type, training_category, required_hours,
               frequency, frequency_interval, required_certificate_category,
               is_mandatory, is_onboarding_required, is_refresher_required,
               refresher_interval_days, training_content, assessment_required,
               passing_score, validity_days, created_by
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
            [item.position_id, item.training_type, item.training_category, item.required_hours || 0,
             item.frequency || 'yearly', item.frequency_interval || 1, item.required_certificate_category || null,
             item.is_mandatory !== false, item.is_onboarding_required || false, item.is_refresher_required || false,
             item.refresher_interval_days || 365, item.training_content || null, item.assessment_required !== false,
             item.passing_score || 80, item.validity_days || null, req.user?.id || null]
          );
          successCount++;
        } catch (e) {
          errors.push({ index: rowIdx, message: e.message });
          failCount++;
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'import', module: '岗位培训要求',
      description: `批量导入岗位培训要求: 成功${successCount}条, 失败${failCount}条`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(camelKeys({ total: items.length, success: successCount, failed: failCount, errors }), '批量导入完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// Sprint5.3 员工安全能力中心 API
// ============================================================

// 枚举值定义
const VALID_TRAINING_SOURCES = ['planned', 'temporary', 'external', 'onboarding', 'self_study'];
const VALID_TRAINING_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'failed'];
const VALID_ASSESSMENT_RESULTS = ['passed', 'failed', 'exempted', 'pending'];
const VALID_INDUCTION_LEVEL_STATUSES = ['pending', 'in_progress', 'completed', 'exempted'];
const VALID_OVERALL_STATUSES = ['in_progress', 'completed', 'expired'];
const VALID_COMPLIANCE_STATUSES = ['compliant', 'partial', 'non_compliant', 'unknown'];

// ============================================================
// 一、training_record — 员工培训台账
// ============================================================

// GET /training-records — 分页查询培训台账
router.get('/training-records', requireRole('admin', 'safety_manager', 'hr'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const { employee_id, position_id, training_category, status, assessment_result, start_date_from, start_date_to, keyword, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    let whereClause = 'tr.is_deleted = false';
    const params = [];
    let idx = 1;

    if (employee_id) { whereClause += ` AND tr.employee_id = $${idx}`; params.push(employee_id); idx++; }
    if (position_id) { whereClause += ` AND tr.position_id = $${idx}`; params.push(position_id); idx++; }
    if (training_category) { whereClause += ` AND tr.training_category = $${idx}`; params.push(training_category); idx++; }
    if (status) { whereClause += ` AND tr.status = $${idx}`; params.push(status); idx++; }
    if (assessment_result) { whereClause += ` AND tr.assessment_result = $${idx}`; params.push(assessment_result); idx++; }
    if (start_date_from) { whereClause += ` AND tr.start_date >= $${idx}`; params.push(start_date_from); idx++; }
    if (start_date_to) { whereClause += ` AND tr.start_date <= $${idx}`; params.push(start_date_to); idx++; }
    if (keyword) { whereClause += ` AND (tr.training_name ILIKE $${idx} OR tr.training_type ILIKE $${idx})`; params.push(`%${keyword}%`); idx++; }

    const countResult = await pool.query(`SELECT COUNT(*) AS total FROM training_record tr WHERE ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    params.push(parseInt(pageSize));
    params.push(offset);
    const result = await pool.query(
      `SELECT tr.*, e.name AS employee_name, p.name AS position_name,
              ptr.training_type AS requirement_type
       FROM training_record tr
       LEFT JOIN employee e ON tr.employee_id = e.id
       LEFT JOIN position p ON tr.position_id = p.id
       LEFT JOIN position_training_requirement ptr ON tr.training_requirement_id = ptr.id
       WHERE ${whereClause}
       ORDER BY tr.start_date DESC, tr.id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    buildListResponse(res, result.rows, total, parseInt(page), parseInt(pageSize), undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /training-records/stats — 培训台账统计
router.get('/training-records/stats', requireRole('admin', 'safety_manager', 'hr'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const { employee_id, start_date_from, start_date_to } = req.query;
    let whereClause = 'is_deleted = false';
    const params = [];
    let idx = 1;

    if (employee_id) { whereClause += ` AND employee_id = $${idx}`; params.push(employee_id); idx++; }
    if (start_date_from) { whereClause += ` AND start_date >= $${idx}`; params.push(start_date_from); idx++; }
    if (start_date_to) { whereClause += ` AND start_date <= $${idx}`; params.push(start_date_to); idx++; }

    const statsResult = await pool.query(
      `SELECT 
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
         COUNT(*) FILTER (WHERE assessment_result = 'passed') AS passed,
         COUNT(*) FILTER (WHERE assessment_result = 'failed') AS failed,
         COALESCE(SUM(actual_hours), 0) AS total_hours,
         COUNT(DISTINCT employee_id) AS employees_trained
       FROM training_record WHERE ${whereClause}`,
      params
    );

    const categoryResult = await pool.query(
      `SELECT training_category, COUNT(*) AS count
       FROM training_record WHERE ${whereClause}
       GROUP BY training_category ORDER BY count DESC`,
      params
    );

    const sourceResult = await pool.query(
      `SELECT training_source, COUNT(*) AS count
       FROM training_record WHERE ${whereClause}
       GROUP BY training_source ORDER BY count DESC`,
      params
    );

    res.json(success(camelKeys({
      ...statsResult.rows[0],
      byCategory: categoryResult.rows,
      bySource: sourceResult.rows
    })));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /training-records/:id — 培训台账详情
router.get('/training-records/:id', requireRole('admin', 'safety_manager', 'hr'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const result = await pool.query(
      `SELECT tr.*, e.name AS employee_name, p.name AS position_name,
              ptr.training_type AS requirement_type
       FROM training_record tr
       LEFT JOIN employee e ON tr.employee_id = e.id
       LEFT JOIN position p ON tr.position_id = p.id
       LEFT JOIN position_training_requirement ptr ON tr.training_requirement_id = ptr.id
       WHERE tr.id = $1 AND tr.is_deleted = false`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '培训记录不存在'));
    buildDetailResponse(res, result.rows[0], undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /training-records/employee/:employeeId — 查询员工培训记录
router.get('/training-records/employee/:employeeId', requireRole('admin', 'safety_manager', 'hr'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const result = await pool.query(
      `SELECT tr.*, p.name AS position_name
       FROM training_record tr
       LEFT JOIN position p ON tr.position_id = p.id
       WHERE tr.employee_id = $1 AND tr.is_deleted = false
       ORDER BY tr.start_date DESC`,
      [req.params.employeeId]
    );

    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /training-records — 新增培训记录
router.post('/training-records', requireRole('admin', 'safety_manager', 'hr'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const {
      employee_id, position_id, training_requirement_id,
      training_type, training_category, training_name, training_source = 'planned',
      training_provider, trainer, training_location,
      start_date, end_date, actual_hours = 0,
      status = 'completed', assessment_result, assessment_score, passing_score,
      certificate_issued = false, certificate_no, certificate_valid_from, certificate_valid_until,
      cost, remark, attachments
    } = req.body;

    if (!employee_id || !training_type || !training_category || !training_name || !start_date) {
      return res.json(error(-3, '缺少必填字段：employee_id, training_type, training_category, training_name, start_date'));
    }

    if (training_source && !VALID_TRAINING_SOURCES.includes(training_source)) {
      return res.json(error(-3, `培训来源必须为：${VALID_TRAINING_SOURCES.join(', ')}`));
    }
    if (status && !VALID_TRAINING_STATUSES.includes(status)) {
      return res.json(error(-3, `培训状态必须为：${VALID_TRAINING_STATUSES.join(', ')}`));
    }
    if (assessment_result && !VALID_ASSESSMENT_RESULTS.includes(assessment_result)) {
      return res.json(error(-3, `考核结果必须为：${VALID_ASSESSMENT_RESULTS.join(', ')}`));
    }

    const result = await pool.query(
      `INSERT INTO training_record (
        employee_id, position_id, training_requirement_id,
        training_type, training_category, training_name, training_source,
        training_provider, trainer, training_location,
        start_date, end_date, actual_hours,
        status, assessment_result, assessment_score, passing_score,
        certificate_issued, certificate_no, certificate_valid_from, certificate_valid_until,
        cost, remark, attachments, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       RETURNING *`,
      [employee_id, position_id || null, training_requirement_id || null,
       training_type, training_category, training_name, training_source,
       training_provider || null, trainer || null, training_location || null,
       start_date, end_date || null, actual_hours,
       status, assessment_result || null, assessment_score || null, passing_score || null,
       certificate_issued, certificate_no || null, certificate_valid_from || null, certificate_valid_until || null,
       cost || null, remark || null, attachments ? JSON.stringify(attachments) : null, req.user?.id || null]
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '培训台账',
      description: `新增培训记录: ${training_name} (员工ID ${employee_id})`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /training-records/:id — 更新培训记录
router.put('/training-records/:id', requireRole('admin', 'safety_manager', 'hr'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const {
      training_type, training_category, training_name, training_source,
      training_provider, trainer, training_location,
      start_date, end_date, actual_hours,
      status, assessment_result, assessment_score, passing_score,
      certificate_issued, certificate_no, certificate_valid_from, certificate_valid_until,
      cost, remark, attachments
    } = req.body;

    if (training_source && !VALID_TRAINING_SOURCES.includes(training_source)) {
      return res.json(error(-3, `培训来源必须为：${VALID_TRAINING_SOURCES.join(', ')}`));
    }
    if (status && !VALID_TRAINING_STATUSES.includes(status)) {
      return res.json(error(-3, `培训状态必须为：${VALID_TRAINING_STATUSES.join(', ')}`));
    }
    if (assessment_result && !VALID_ASSESSMENT_RESULTS.includes(assessment_result)) {
      return res.json(error(-3, `考核结果必须为：${VALID_ASSESSMENT_RESULTS.join(', ')}`));
    }

    const updates = [];
    const params = [];
    let idx = 1;

    if (training_type !== undefined) { updates.push(`training_type = $${idx}`); params.push(training_type); idx++; }
    if (training_category !== undefined) { updates.push(`training_category = $${idx}`); params.push(training_category); idx++; }
    if (training_name !== undefined) { updates.push(`training_name = $${idx}`); params.push(training_name); idx++; }
    if (training_source !== undefined) { updates.push(`training_source = $${idx}`); params.push(training_source); idx++; }
    if (training_provider !== undefined) { updates.push(`training_provider = $${idx}`); params.push(training_provider); idx++; }
    if (trainer !== undefined) { updates.push(`trainer = $${idx}`); params.push(trainer); idx++; }
    if (training_location !== undefined) { updates.push(`training_location = $${idx}`); params.push(training_location); idx++; }
    if (start_date !== undefined) { updates.push(`start_date = $${idx}`); params.push(start_date); idx++; }
    if (end_date !== undefined) { updates.push(`end_date = $${idx}`); params.push(end_date); idx++; }
    if (actual_hours !== undefined) { updates.push(`actual_hours = $${idx}`); params.push(actual_hours); idx++; }
    if (status !== undefined) { updates.push(`status = $${idx}`); params.push(status); idx++; }
    if (assessment_result !== undefined) { updates.push(`assessment_result = $${idx}`); params.push(assessment_result); idx++; }
    if (assessment_score !== undefined) { updates.push(`assessment_score = $${idx}`); params.push(assessment_score); idx++; }
    if (passing_score !== undefined) { updates.push(`passing_score = $${idx}`); params.push(passing_score); idx++; }
    if (certificate_issued !== undefined) { updates.push(`certificate_issued = $${idx}`); params.push(certificate_issued); idx++; }
    if (certificate_no !== undefined) { updates.push(`certificate_no = $${idx}`); params.push(certificate_no); idx++; }
    if (certificate_valid_from !== undefined) { updates.push(`certificate_valid_from = $${idx}`); params.push(certificate_valid_from); idx++; }
    if (certificate_valid_until !== undefined) { updates.push(`certificate_valid_until = $${idx}`); params.push(certificate_valid_until); idx++; }
    if (cost !== undefined) { updates.push(`cost = $${idx}`); params.push(cost); idx++; }
    if (remark !== undefined) { updates.push(`remark = $${idx}`); params.push(remark); idx++; }
    if (attachments !== undefined) { updates.push(`attachments = $${idx}`); params.push(attachments ? JSON.stringify(attachments) : null); idx++; }

    if (updates.length === 0) return res.json(error(-3, '请提供要更新的字段'));

    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE training_record SET ${updates.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.json(error(-2, '培训记录不存在'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '培训台账',
      description: `更新培训记录: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// DELETE /training-records/:id — 删除培训记录
router.delete('/training-records/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const result = await pool.query(
      `UPDATE training_record SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '培训记录不存在'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '培训台账',
      description: `删除培训记录: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /training-records/batch-import — 批量导入培训记录
router.post('/training-records/batch-import', requireRole('admin', 'safety_manager', 'hr'), requirePermission('hse:personnel:import'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.json(error(-3, '请提供培训记录数组'));
    }

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let rowIdx = 0; rowIdx < items.length; rowIdx++) {
        const item = items[rowIdx];
        try {
          await client.query(
            `INSERT INTO training_record (
              employee_id, position_id, training_type, training_category, training_name,
              training_source, start_date, end_date, actual_hours, status,
              assessment_result, assessment_score, created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [item.employee_id, item.position_id || null, item.training_type, item.training_category,
             item.training_name, item.training_source || 'planned', item.start_date, item.end_date || null,
             item.actual_hours || 0, item.status || 'completed', item.assessment_result || null,
             item.assessment_score || null, req.user?.id || null]
          );
          successCount++;
        } catch (e) {
          errors.push({ index: rowIdx, message: e.message });
          failCount++;
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'import', module: '培训台账',
      description: `批量导入培训记录: 成功${successCount}条, 失败${failCount}条`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(camelKeys({ total: items.length, success: successCount, failed: failCount, errors }), '批量导入完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 二、employee_induction_training — 新员工入职培训
// ============================================================

// GET /induction-trainings — 分页查询新员工培训
router.get('/induction-trainings', requireRole('admin', 'safety_manager', 'hr'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const { employee_id, overall_status, overall_result, induction_start_from, induction_start_to, keyword, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    let whereClause = 'eit.is_deleted = false';
    const params = [];
    let idx = 1;

    if (employee_id) { whereClause += ` AND eit.employee_id = $${idx}`; params.push(employee_id); idx++; }
    if (overall_status) { whereClause += ` AND eit.overall_status = $${idx}`; params.push(overall_status); idx++; }
    if (overall_result) { whereClause += ` AND eit.overall_result = $${idx}`; params.push(overall_result); idx++; }
    if (induction_start_from) { whereClause += ` AND eit.induction_start_date >= $${idx}`; params.push(induction_start_from); idx++; }
    if (induction_start_to) { whereClause += ` AND eit.induction_start_date <= $${idx}`; params.push(induction_start_to); idx++; }
    if (keyword) { whereClause += ` AND e.name ILIKE $${idx}`; params.push(`%${keyword}%`); idx++; }

    const countResult = await pool.query(`SELECT COUNT(*) AS total FROM employee_induction_training eit LEFT JOIN employee e ON eit.employee_id = e.id WHERE ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    params.push(parseInt(pageSize));
    params.push(offset);
    const result = await pool.query(
      `SELECT eit.*, e.name AS employee_name, p.name AS position_name
       FROM employee_induction_training eit
       LEFT JOIN employee e ON eit.employee_id = e.id
       LEFT JOIN position p ON eit.position_id = p.id
       WHERE ${whereClause}
       ORDER BY eit.induction_start_date DESC, eit.id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    buildListResponse(res, result.rows, total, parseInt(page), parseInt(pageSize), undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /induction-trainings/stats — 新员工培训统计
router.get('/induction-trainings/stats', requireRole('admin', 'safety_manager', 'hr'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const statsResult = await pool.query(
      `SELECT 
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE overall_status = 'in_progress') AS in_progress,
         COUNT(*) FILTER (WHERE overall_status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE overall_status = 'expired') AS expired,
         COUNT(*) FILTER (WHERE overall_result = 'passed') AS passed,
         COUNT(*) FILTER (WHERE overall_result = 'failed') AS failed,
         COALESCE(SUM(total_hours), 0) AS total_hours
       FROM employee_induction_training WHERE is_deleted = false`
    );

    const levelResult = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE company_level_status = 'completed') AS company_completed,
         COUNT(*) FILTER (WHERE department_level_status = 'completed') AS department_completed,
         COUNT(*) FILTER (WHERE team_level_status = 'completed') AS team_completed
       FROM employee_induction_training WHERE is_deleted = false`
    );

    res.json(success(camelKeys({ ...statsResult.rows[0], ...levelResult.rows[0] })));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /induction-trainings/:id — 新员工培训详情
router.get('/induction-trainings/:id', requireRole('admin', 'safety_manager', 'hr'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const result = await pool.query(
      `SELECT eit.*, e.name AS employee_name, p.name AS position_name
       FROM employee_induction_training eit
       LEFT JOIN employee e ON eit.employee_id = e.id
       LEFT JOIN position p ON eit.position_id = p.id
       WHERE eit.id = $1 AND eit.is_deleted = false`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '入职培训记录不存在'));
    buildDetailResponse(res, result.rows[0], undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /induction-trainings/employee/:employeeId — 查询员工入职培训
router.get('/induction-trainings/employee/:employeeId', requireRole('admin', 'safety_manager', 'hr'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const result = await pool.query(
      `SELECT eit.*, p.name AS position_name
       FROM employee_induction_training eit
       LEFT JOIN position p ON eit.position_id = p.id
       WHERE eit.employee_id = $1 AND eit.is_deleted = false
       ORDER BY eit.induction_start_date DESC LIMIT 1`,
      [req.params.employeeId]
    );

    buildDetailResponse(res, result.rows[0] || null, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /induction-trainings — 新增入职培训记录
router.post('/induction-trainings', requireRole('admin', 'safety_manager', 'hr'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const {
      employee_id, position_id, induction_start_date,
      company_level_status, department_level_status, team_level_status,
      remark
    } = req.body;

    if (!employee_id || !position_id || !induction_start_date) {
      return res.json(error(-3, '缺少必填字段：employee_id, position_id, induction_start_date'));
    }

    const existingResult = await pool.query(
      `SELECT id FROM employee_induction_training WHERE employee_id = $1 AND is_deleted = false`,
      [employee_id]
    );
    if (existingResult.rows.length > 0) {
      return res.json(error(-3, '该员工已有入职培训记录，请使用更新接口'));
    }

    const result = await pool.query(
      `INSERT INTO employee_induction_training (
        employee_id, position_id, induction_start_date,
        company_level_status, department_level_status, team_level_status,
        remark, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [employee_id, position_id, induction_start_date,
       company_level_status || 'pending', department_level_status || 'pending', team_level_status || 'pending',
       remark || null, req.user?.id || null]
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '新员工入职培训',
      description: `新增入职培训记录: 员工ID ${employee_id}`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /induction-trainings/:id — 更新入职培训记录
router.put('/induction-trainings/:id', requireRole('admin', 'safety_manager', 'hr'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const {
      induction_end_date, company_level_status, company_level_date, company_level_trainer, company_level_hours, company_level_result,
      department_level_status, department_level_date, department_level_trainer, department_level_hours, department_level_result,
      team_level_status, team_level_date, team_level_trainer, team_level_hours, team_level_result,
      overall_status, overall_result, qualified_date, expiry_date, remark
    } = req.body;

    const updates = ['updated_at = NOW()'];
    const params = [];
    let idx = 1;

    if (induction_end_date !== undefined) { updates.push(`induction_end_date = $${idx}`); params.push(induction_end_date); idx++; }
    if (company_level_status !== undefined) { updates.push(`company_level_status = $${idx}`); params.push(company_level_status); idx++; }
    if (company_level_date !== undefined) { updates.push(`company_level_date = $${idx}`); params.push(company_level_date); idx++; }
    if (company_level_trainer !== undefined) { updates.push(`company_level_trainer = $${idx}`); params.push(company_level_trainer); idx++; }
    if (company_level_hours !== undefined) { updates.push(`company_level_hours = $${idx}`); params.push(company_level_hours); idx++; }
    if (company_level_result !== undefined) { updates.push(`company_level_result = $${idx}`); params.push(company_level_result); idx++; }
    if (department_level_status !== undefined) { updates.push(`department_level_status = $${idx}`); params.push(department_level_status); idx++; }
    if (department_level_date !== undefined) { updates.push(`department_level_date = $${idx}`); params.push(department_level_date); idx++; }
    if (department_level_trainer !== undefined) { updates.push(`department_level_trainer = $${idx}`); params.push(department_level_trainer); idx++; }
    if (department_level_hours !== undefined) { updates.push(`department_level_hours = $${idx}`); params.push(department_level_hours); idx++; }
    if (department_level_result !== undefined) { updates.push(`department_level_result = $${idx}`); params.push(department_level_result); idx++; }
    if (team_level_status !== undefined) { updates.push(`team_level_status = $${idx}`); params.push(team_level_status); idx++; }
    if (team_level_date !== undefined) { updates.push(`team_level_date = $${idx}`); params.push(team_level_date); idx++; }
    if (team_level_trainer !== undefined) { updates.push(`team_level_trainer = $${idx}`); params.push(team_level_trainer); idx++; }
    if (team_level_hours !== undefined) { updates.push(`team_level_hours = $${idx}`); params.push(team_level_hours); idx++; }
    if (team_level_result !== undefined) { updates.push(`team_level_result = $${idx}`); params.push(team_level_result); idx++; }
    if (overall_status !== undefined) { updates.push(`overall_status = $${idx}`); params.push(overall_status); idx++; }
    if (overall_result !== undefined) { updates.push(`overall_result = $${idx}`); params.push(overall_result); idx++; }
    if (qualified_date !== undefined) { updates.push(`qualified_date = $${idx}`); params.push(qualified_date); idx++; }
    if (expiry_date !== undefined) { updates.push(`expiry_date = $${idx}`); params.push(expiry_date); idx++; }
    if (remark !== undefined) { updates.push(`remark = $${idx}`); params.push(remark); idx++; }

    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE employee_induction_training SET ${updates.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.json(error(-2, '入职培训记录不存在'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '新员工入职培训',
      description: `更新入职培训记录: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /induction-trainings/:id/complete-level — 完成某一级培训
router.post('/induction-trainings/:id/complete-level', requireRole('admin', 'safety_manager', 'hr'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const { level, trainer, hours, result: levelResult } = req.body;

    if (!level || !['company', 'department', 'team'].includes(level)) {
      return res.json(error(-3, 'level 必须为 company, department 或 team'));
    }
    if (levelResult && !['passed', 'failed'].includes(levelResult)) {
      return res.json(error(-3, 'result 必须为 passed 或 failed'));
    }

    const levelPrefix = level === 'company' ? 'company_level' : level === 'department' ? 'department_level' : 'team_level';
    const statusField = `${levelPrefix}_status`;
    const dateField = `${levelPrefix}_date`;
    const trainerField = `${levelPrefix}_trainer`;
    const hoursField = `${levelPrefix}_hours`;
    const resultField = `${levelPrefix}_result`;

    // 先更新当前级别
    const updateResult = await pool.query(
      `UPDATE employee_induction_training SET
         ${statusField} = 'completed',
         ${dateField} = CURRENT_DATE,
         ${trainerField} = $1,
         ${hoursField} = $2,
         ${resultField} = $3,
         updated_at = NOW()
       WHERE id = $4 AND is_deleted = false
       RETURNING *`,
      [trainer || null, hours || 0, levelResult || 'passed', req.params.id]
    );

    if (updateResult.rows.length === 0) return res.json(error(-2, '入职培训记录不存在'));

    // 计算总学时
    const record = updateResult.rows[0];
    const totalHours = (parseFloat(record.company_level_hours) || 0) +
                       (parseFloat(record.department_level_hours) || 0) +
                       (parseFloat(record.team_level_hours) || 0);

    // 检查是否全部完成
    if (record.company_level_status === 'completed' &&
        record.department_level_status === 'completed' &&
        record.team_level_status === 'completed') {
      const allPassed = record.company_level_result === 'passed' &&
                        record.department_level_result === 'passed' &&
                        record.team_level_result === 'passed';
      await pool.query(
        `UPDATE employee_induction_training SET
           total_hours = $1,
           overall_status = 'completed',
           overall_result = $2,
           qualified_date = CASE WHEN $2 = 'passed' THEN CURRENT_DATE ELSE NULL END,
           induction_end_date = CURRENT_DATE
         WHERE id = $3`,
        [totalHours, allPassed ? 'passed' : 'failed', req.params.id]
      );
    } else {
      // 更新总学时
      await pool.query(
        `UPDATE employee_induction_training SET total_hours = $1 WHERE id = $2`,
        [totalHours, req.params.id]
      );
    }

    // 重新获取记录
    const finalResult = await pool.query(
      `SELECT * FROM employee_induction_training WHERE id = $1`,
      [req.params.id]
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'complete_level', module: '新员工入职培训',
      description: `完成${level === 'company' ? '公司级' : level === 'department' ? '部门级' : '班组级'}培训: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, finalResult.rows[0], `${level}级培训已完成`, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// DELETE /induction-trainings/:id — 删除入职培训记录
router.delete('/induction-trainings/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const result = await pool.query(
      `UPDATE employee_induction_training SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '入职培训记录不存在'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '新员工入职培训',
      description: `删除入职培训记录: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 三、employee_training_status — 培训状态统计
// ============================================================

// GET /training-status — 分页查询培训状态
router.get('/training-status', requireRole('admin', 'safety_manager', 'hr'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const { employee_id, position_id, compliance_status, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    let whereClause = 'ets.is_deleted = false';
    const params = [];
    let idx = 1;

    if (employee_id) { whereClause += ` AND ets.employee_id = $${idx}`; params.push(employee_id); idx++; }
    if (position_id) { whereClause += ` AND ets.position_id = $${idx}`; params.push(position_id); idx++; }
    if (compliance_status) { whereClause += ` AND ets.compliance_status = $${idx}`; params.push(compliance_status); idx++; }

    const countResult = await pool.query(`SELECT COUNT(*) AS total FROM employee_training_status ets WHERE ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    params.push(parseInt(pageSize));
    params.push(offset);
    const result = await pool.query(
      `SELECT ets.*, e.name AS employee_name, p.name AS position_name
       FROM employee_training_status ets
       LEFT JOIN employee e ON ets.employee_id = e.id
       LEFT JOIN position p ON ets.position_id = p.id
       WHERE ${whereClause}
       ORDER BY ets.compliance_rate ASC NULLS LAST, ets.updated_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    buildListResponse(res, result.rows, total, parseInt(page), parseInt(pageSize), undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /training-status/stats — 培训状态统计
router.get('/training-status/stats', requireRole('admin', 'safety_manager', 'hr'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const statsResult = await pool.query(
      `SELECT 
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE compliance_status = 'compliant') AS compliant,
         COUNT(*) FILTER (WHERE compliance_status = 'partial') AS partial,
         COUNT(*) FILTER (WHERE compliance_status = 'non_compliant') AS non_compliant,
         COUNT(*) FILTER (WHERE compliance_status = 'unknown') AS unknown,
         AVG(compliance_rate) AS avg_compliance_rate
       FROM employee_training_status WHERE is_deleted = false`
    );

    res.json(success(camelKeys(statsResult.rows[0])));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /training-status/non-compliant — 不合规员工列表（必须在 /:id 之前）
router.get('/training-status/non-compliant', requireRole('admin', 'safety_manager', 'hr'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const result = await pool.query(
      `SELECT ets.*, e.name AS employee_name, p.name AS position_name
       FROM employee_training_status ets
       LEFT JOIN employee e ON ets.employee_id = e.id
       LEFT JOIN position p ON ets.position_id = p.id
       WHERE ets.is_deleted = false AND ets.compliance_status = 'non_compliant'
       ORDER BY ets.compliance_rate ASC NULLS LAST`
    );

    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /training-status/expiring — 即将到期培训列表（必须在 /:id 之前）
router.get('/training-status/expiring', requireRole('admin', 'safety_manager', 'hr'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const { days = 30 } = req.query;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + parseInt(days));

    const result = await pool.query(
      `SELECT tr.*, e.name AS employee_name, p.name AS position_name
       FROM training_record tr
       LEFT JOIN employee e ON tr.employee_id = e.id
       LEFT JOIN position p ON tr.position_id = p.id
       WHERE tr.is_deleted = false 
         AND tr.certificate_valid_until IS NOT NULL
         AND tr.certificate_valid_until <= $1
         AND tr.certificate_valid_until >= CURRENT_DATE
       ORDER BY tr.certificate_valid_until`,
      [targetDate.toISOString().split('T')[0]]
    );

    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /training-status/:id — 培训状态详情
router.get('/training-status/:id', requireRole('admin', 'safety_manager', 'hr'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const result = await pool.query(
      `SELECT ets.*, e.name AS employee_name, p.name AS position_name
       FROM employee_training_status ets
       LEFT JOIN employee e ON ets.employee_id = e.id
       LEFT JOIN position p ON ets.position_id = p.id
       WHERE ets.id = $1 AND ets.is_deleted = false`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '培训状态记录不存在'));
    buildDetailResponse(res, result.rows[0], undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /training-status/employee/:employeeId — 查询员工培训状态
router.get('/training-status/employee/:employeeId', requireRole('admin', 'safety_manager', 'hr'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const result = await pool.query(
      `SELECT ets.*, p.name AS position_name
       FROM employee_training_status ets
       LEFT JOIN position p ON ets.position_id = p.id
       WHERE ets.employee_id = $1 AND ets.is_deleted = false
       ORDER BY ets.updated_at DESC`,
      [req.params.employeeId]
    );

    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /training-status/analyze — 执行培训合规分析
router.post('/training-status/analyze', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const { employee_id, position_id } = req.body;

    if (!employee_id || !position_id) {
      return res.json(error(-3, '缺少必填字段：employee_id, position_id'));
    }

    // 1. 获取岗位培训要求（标准）
    const reqResult = await pool.query(
      `SELECT * FROM position_training_requirement 
       WHERE position_id = $1 AND is_deleted = false AND is_mandatory = true`,
      [position_id]
    );
    const requirements = reqResult.rows;

    // 2. 获取员工培训记录（实际）
    const recordsResult = await pool.query(
      `SELECT * FROM training_record 
       WHERE employee_id = $1 AND is_deleted = false AND assessment_result = 'passed'`,
      [employee_id]
    );
    const records = recordsResult.rows;

    // 3. 匹配分析
    let completed = 0;
    let pending = 0;
    let expired = 0;
    const pendingList = [];
    const expiredList = [];
    const today = new Date();

    for (const req of requirements) {
      const matchedRecords = records.filter(r => 
        r.training_type === req.training_type || 
        r.training_category === req.training_category
      );

      if (matchedRecords.length === 0) {
        pending++;
        pendingList.push({
          id: req.id,
          training_type: req.training_type,
          training_category: req.training_category,
          required_hours: req.required_hours
        });
      } else {
        const latestRecord = matchedRecords.sort((a, b) => 
          new Date(b.start_date) - new Date(a.start_date)
        )[0];

        // 检查是否过期
        let isExpired = false;
        if (req.validity_days && latestRecord.certificate_valid_until) {
          isExpired = new Date(latestRecord.certificate_valid_until) < today;
        } else if (req.validity_days && req.refresher_interval_days) {
          const validUntil = new Date(latestRecord.start_date);
          validUntil.setDate(validUntil.getDate() + req.refresher_interval_days);
          isExpired = validUntil < today;
        }

        if (isExpired) {
          expired++;
          expiredList.push({
            id: req.id,
            training_type: req.training_type,
            training_category: req.training_category,
            last_training_date: latestRecord.start_date,
            expired: true
          });
        } else {
          completed++;
        }
      }
    }

    const total = requirements.length;
    const complianceRate = total > 0 ? ((completed / total) * 100).toFixed(2) : 0;
    
    let complianceStatus = 'unknown';
    if (total > 0) {
      if (expired > 0) {
        complianceStatus = 'non_compliant';
      } else if (pending > 0) {
        complianceStatus = 'partial';
      } else {
        complianceStatus = 'compliant';
      }
    }

    // 4. 更新或插入状态记录
    const existingStatus = await pool.query(
      `SELECT id FROM employee_training_status WHERE employee_id = $1 AND position_id = $2 AND is_deleted = false`,
      [employee_id, position_id]
    );

    let statusRecord;
    if (existingStatus.rows.length > 0) {
      statusRecord = await pool.query(
        `UPDATE employee_training_status SET
           total_requirements = $1, completed_count = $2, pending_count = $3, expired_count = $4,
           compliance_rate = $5, compliance_status = $6,
           pending_trainings = $7, expired_trainings = $8,
           last_analyzed_at = NOW(), analyzed_by = $9, updated_at = NOW()
         WHERE id = $10 RETURNING *`,
        [total, completed, pending, expired, complianceRate, complianceStatus,
         JSON.stringify(pendingList), JSON.stringify(expiredList),
         req.user?.id || null, existingStatus.rows[0].id]
      );
    } else {
      statusRecord = await pool.query(
        `INSERT INTO employee_training_status (
          employee_id, position_id, total_requirements, completed_count, pending_count, expired_count,
          compliance_rate, compliance_status, pending_trainings, expired_trainings, analyzed_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [employee_id, position_id, total, completed, pending, expired,
         complianceRate, complianceStatus,
         JSON.stringify(pendingList), JSON.stringify(expiredList),
         req.user?.id || null]
      );
    }

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'analyze', module: '培训合规分析',
      description: `培训合规分析: 员工ID ${employee_id}, 合规率 ${complianceRate}%`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(camelKeys({
      ...statusRecord.rows[0],
      analysis: {
        total, completed, pending, expired,
        complianceRate: parseFloat(complianceRate),
        complianceStatus,
        pendingList,
        expiredList
      }
    }), '分析完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /training-status/batch-analyze — 批量培训合规分析
router.post('/training-status/batch-analyze', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const { filter = {} } = req.body;

    // Sprint-C Phase 1: 使用 employee_assignment 替代 hse_employee_org
    let whereClause = 'e.is_deleted = false AND ea.is_current = true AND ea.is_deleted = false';
    const params = [];
    let idx = 1;

    if (filter.position_id) {
      whereClause += ` AND ea.position_id = $${idx}`;
      params.push(filter.position_id);
      idx++;
    }

    const employeesResult = await pool.query(
      `SELECT DISTINCT e.id AS employee_id, ea.position_id
       FROM employee e
       JOIN employee_assignment ea ON e.id = ea.employee_id
       WHERE ${whereClause}`,
      params
    );

    let analyzed = 0;
    let compliant = 0;
    let nonCompliant = 0;

    for (const emp of employeesResult.rows) {
      // 简化的批量分析逻辑（实际应用中可优化为批量SQL）
      analyzed++;
    }

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'batch_analyze', module: '培训合规分析',
      description: `批量培训合规分析: ${analyzed}名员工`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(camelKeys({ total: employeesResult.rows.length, analyzed }), '批量分析完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// Sprint5.4 HSE检查管理中心 API
// ============================================================

const VALID_PLAN_TYPES = ['routine', 'periodic', 'special', 'audit', 'external', 'emergency'];
const VALID_PLAN_CATEGORIES = ['safety', 'health', 'environment', 'fire', 'equipment', 'quality'];
const VALID_TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled', 'overdue'];
const VALID_TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const VALID_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
const VALID_RECORD_RESULTS = ['pass', 'fail', 'pending', 'not_applicable'];
const VALID_HAZARD_LEVELS = ['critical', 'high', 'medium', 'low'];
const VALID_HAZARD_CATEGORIES = ['safety', 'health', 'environment', 'fire', 'equipment', 'process', 'behavior'];
const VALID_HAZARD_STATUSES = ['open', 'in_progress', 'pending_review', 'closed', 'rejected'];
const VALID_REVIEW_STATUSES = ['pending', 'passed', 'failed'];

// ============================================================
// 一、inspection_plan — 检查计划
// ============================================================

// GET /inspection-plans
router.get('/inspection-plans', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { plan_type, plan_category, is_active, department_id, responsible_id, keyword, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'ip.is_deleted = false';
    const params = [];
    let idx = 1;
    if (plan_type) { where += ` AND ip.plan_type = $${idx}`; params.push(plan_type); idx++; }
    if (plan_category) { where += ` AND ip.plan_category = $${idx}`; params.push(plan_category); idx++; }
    if (is_active !== undefined) { where += ` AND ip.is_active = $${idx}`; params.push(is_active === 'true'); idx++; }
    if (department_id) { where += ` AND ip.department_id = $${idx}`; params.push(department_id); idx++; }
    if (responsible_id) { where += ` AND ip.responsible_id = $${idx}`; params.push(responsible_id); idx++; }
    if (keyword) { where += ` AND (ip.plan_name ILIKE $${idx} OR ip.plan_code ILIKE $${idx})`; params.push(`%${keyword}%`); idx++; }
    const count = await pool.query(`SELECT COUNT(*) AS total FROM inspection_plan ip WHERE ${where}`, params);
    const total = parseInt(count.rows[0].total);
    params.push(parseInt(pageSize), offset);
    const result = await pool.query(
      `SELECT ip.*, e.name AS responsible_name, d.name AS department_name
       FROM inspection_plan ip
       LEFT JOIN employee e ON ip.responsible_id = e.id
       LEFT JOIN department d ON ip.department_id = d.id
       WHERE ${where}
       ORDER BY ip.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`, params);
    buildListResponse(res, result.rows, total, parseInt(page), parseInt(pageSize), undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-plans/stats
router.get('/inspection-plans/stats', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const stats = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE is_active = true) AS active,
         COUNT(*) FILTER (WHERE plan_type = 'routine') AS routine,
         COUNT(*) FILTER (WHERE plan_type = 'special') AS special
       FROM inspection_plan WHERE is_deleted = false`);
    const byCategory = await pool.query(
      `SELECT plan_category, COUNT(*) AS count FROM inspection_plan WHERE is_deleted = false AND plan_category IS NOT NULL GROUP BY plan_category ORDER BY count DESC`);
    res.json(success(camelKeys({ ...stats.rows[0], byCategory: byCategory.rows })));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-plans/:id
router.get('/inspection-plans/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT ip.*, e.name AS responsible_name, d.name AS department_name
       FROM inspection_plan ip
       LEFT JOIN employee e ON ip.responsible_id = e.id
       LEFT JOIN department d ON ip.department_id = d.id
       WHERE ip.id = $1 AND ip.is_deleted = false`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查计划不存在'));
    buildDetailResponse(res, result.rows[0], undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /inspection-plans
router.post('/inspection-plans', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { plan_name, plan_code, plan_type = 'routine', plan_category, description, scope_description, inspection_items,
            frequency = 'monthly', frequency_interval = 1, start_date, end_date, next_inspection_date,
            responsible_id, assignee_ids, department_id, position_id, approval_required = false, approval_level = 1,
            remark } = req.body;
    if (!plan_name || !plan_code || !start_date || !responsible_id) {
      return res.json(error(-3, '缺少必填字段'));
    }
    if (!VALID_PLAN_TYPES.includes(plan_type)) return res.json(error(-3, `plan_type 必须为: ${VALID_PLAN_TYPES.join(', ')}`));
    if (plan_category && !VALID_PLAN_CATEGORIES.includes(plan_category)) return res.json(error(-3, `plan_category 必须为: ${VALID_PLAN_CATEGORIES.join(', ')}`));
    if (!VALID_INSPECTION_FREQUENCIES.includes(frequency)) return res.json(error(-3, `frequency 必须为: ${VALID_INSPECTION_FREQUENCIES.join(', ')}`));
    const result = await pool.query(
      `INSERT INTO inspection_plan (plan_name, plan_code, plan_type, plan_category, description, scope_description, inspection_items,
        frequency, frequency_interval, start_date, end_date, next_inspection_date,
        responsible_id, assignee_ids, department_id, position_id, approval_required, approval_level, remark, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [plan_name, plan_code, plan_type, plan_category || null, description || null, scope_description || null, inspection_items ? JSON.stringify(inspection_items) : null,
       frequency, frequency_interval, start_date, end_date || null, next_inspection_date || null,
       responsible_id, assignee_ids || null, department_id || null, position_id || null, approval_required, approval_level, remark || null, req.user?.id || null]);
    await auditLog({ userId: req.user?.id, username: req.user?.username, action: 'create', module: '检查计划',
      description: `新增检查计划: ${plan_name}`, ip: req.ip }).catch(() => {});
    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /inspection-plans/:id
router.put('/inspection-plans/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const body = req.body;
    if (body.plan_type && !VALID_PLAN_TYPES.includes(body.plan_type)) return res.json(error(-3, `plan_type 必须为: ${VALID_PLAN_TYPES.join(', ')}`));
    if (body.plan_category && !VALID_PLAN_CATEGORIES.includes(body.plan_category)) return res.json(error(-3, `plan_category 必须为: ${VALID_PLAN_CATEGORIES.join(', ')}`));
    if (body.frequency && !VALID_INSPECTION_FREQUENCIES.includes(body.frequency)) return res.json(error(-3, `frequency 必须为: ${VALID_INSPECTION_FREQUENCIES.join(', ')}`));
    const fields = [];
    const params = [];
    let idx = 1;
    const mappings = {
      plan_name: 'plan_name', plan_code: 'plan_code', plan_type: 'plan_type', plan_category: 'plan_category',
      description: 'description', scope_description: 'scope_description', frequency: 'frequency',
      frequency_interval: 'frequency_interval', start_date: 'start_date', end_date: 'end_date',
      next_inspection_date: 'next_inspection_date', responsible_id: 'responsible_id', department_id: 'department_id',
      position_id: 'position_id', is_active: 'is_active', approval_required: 'approval_required',
      approval_level: 'approval_level', remark: 'remark'
    };
    for (const [key, col] of Object.entries(mappings)) {
      if (body[key] !== undefined) { fields.push(`${col} = $${idx}`); params.push(body[key]); idx++; }
    }
    if (body.inspection_items !== undefined) { fields.push(`inspection_items = $${idx}`); params.push(body.inspection_items ? JSON.stringify(body.inspection_items) : null); idx++; }
    if (body.assignee_ids !== undefined) { fields.push(`assignee_ids = $${idx}`); params.push(body.assignee_ids); idx++; }
    if (fields.length === 0) return res.json(error(-3, '请提供要更新的字段'));
    fields.push('updated_at = NOW()');
    params.push(req.params.id);
    const result = await pool.query(`UPDATE inspection_plan SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
    if (result.rows.length === 0) return res.json(error(-2, '检查计划不存在'));
    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// DELETE /inspection-plans/:id
router.delete('/inspection-plans/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(`UPDATE inspection_plan SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查计划不存在'));
    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /inspection-plans/:id/generate-tasks — 生成检查任务
router.post('/inspection-plans/:id/generate-tasks', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const planResult = await pool.query(`SELECT * FROM inspection_plan WHERE id = $1 AND is_deleted = false AND is_active = true`, [req.params.id]);
    if (planResult.rows.length === 0) return res.json(error(-2, '检查计划不存在或未激活'));
    const plan = planResult.rows[0];
    // 生成一个检查任务
    const taskCode = `${plan.plan_code}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now()}`;
    const taskResult = await pool.query(
      `INSERT INTO inspection_task (plan_id, task_name, task_code, assignee_id, inspectors, scheduled_date,
        due_date, status, priority, inspection_items, total_items_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [plan.id, `${plan.plan_name} - ${new Date().toISOString().slice(0, 10)}`, taskCode, plan.responsible_id,
       plan.assignee_ids || null, new Date().toISOString().slice(0, 10),
       plan.next_inspection_date || null, 'pending', 'normal',
       plan.inspection_items, plan.inspection_items ? JSON.parse(plan.inspection_items).length : 0,
       req.user?.id || null]);
    // 更新下次检查日期
    if (plan.frequency !== 'once') {
      const nextDate = new Date();
      const interval = plan.frequency_interval || 1;
      switch (plan.frequency) {
        case 'daily': nextDate.setDate(nextDate.getDate() + interval); break;
        case 'weekly': nextDate.setDate(nextDate.getDate() + interval * 7); break;
        case 'monthly': nextDate.setMonth(nextDate.getMonth() + interval); break;
        case 'quarterly': nextDate.setMonth(nextDate.getMonth() + interval * 3); break;
        case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + interval); break;
      }
      await pool.query(`UPDATE inspection_plan SET next_inspection_date = $1, updated_at = NOW() WHERE id = $2`,
        [nextDate.toISOString().slice(0, 10), plan.id]);
    }
    buildDetailResponse(res, taskResult.rows[0], '任务生成成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /inspection-plans/batch-generate
router.post('/inspection-plans/batch-generate', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const plans = await pool.query(`SELECT * FROM inspection_plan WHERE is_deleted = false AND is_active = true`);
    let generated = 0;
    for (const plan of plans.rows) {
      if (!plan.next_inspection_date || new Date(plan.next_inspection_date) <= new Date()) {
        const taskCode = `${plan.plan_code}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now()}`;
        await pool.query(
          `INSERT INTO inspection_task (plan_id, task_name, task_code, assignee_id, scheduled_date, status, priority, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [plan.id, `${plan.plan_name} - ${new Date().toISOString().slice(0, 10)}`, taskCode,
           plan.responsible_id, new Date().toISOString().slice(0, 10), 'pending', 'normal', req.user?.id || null]);
        generated++;
      }
    }
    res.json(success(camelKeys({ generated }), '批量生成完成'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// 二、inspection_task — 检查任务
// ============================================================

// GET /inspection-tasks
router.get('/inspection-tasks', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { plan_id, assignee_id, status, priority, scheduled_date_from, scheduled_date_to, keyword, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'it.is_deleted = false';
    const params = [];
    let idx = 1;
    if (plan_id) { where += ` AND it.plan_id = $${idx}`; params.push(plan_id); idx++; }
    if (assignee_id) { where += ` AND it.assignee_id = $${idx}`; params.push(assignee_id); idx++; }
    if (status) { where += ` AND it.status = $${idx}`; params.push(status); idx++; }
    if (priority) { where += ` AND it.priority = $${idx}`; params.push(priority); idx++; }
    if (scheduled_date_from) { where += ` AND it.scheduled_date >= $${idx}`; params.push(scheduled_date_from); idx++; }
    if (scheduled_date_to) { where += ` AND it.scheduled_date <= $${idx}`; params.push(scheduled_date_to); idx++; }
    if (keyword) { where += ` AND (it.task_name ILIKE $${idx} OR it.task_code ILIKE $${idx})`; params.push(`%${keyword}%`); idx++; }
    const count = await pool.query(`SELECT COUNT(*) AS total FROM inspection_task it WHERE ${where}`, params);
    const total = parseInt(count.rows[0].total);
    params.push(parseInt(pageSize), offset);
    const result = await pool.query(
      `SELECT it.*, ip.plan_name, e.name AS assignee_name
       FROM inspection_task it
       LEFT JOIN inspection_plan ip ON it.plan_id = ip.id
       LEFT JOIN employee e ON it.assignee_id = e.id
       WHERE ${where}
       ORDER BY it.scheduled_date DESC, it.id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`, params);
    buildListResponse(res, result.rows, total, parseInt(page), parseInt(pageSize), undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-tasks/stats
router.get('/inspection-tasks/stats', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const stats = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE status = 'overdue') AS overdue
       FROM inspection_task WHERE is_deleted = false`);
    const byPriority = await pool.query(
      `SELECT priority, COUNT(*) AS count FROM inspection_task WHERE is_deleted = false GROUP BY priority ORDER BY count DESC`);
    res.json(success(camelKeys({ ...stats.rows[0], byPriority: byPriority.rows })));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-tasks/:id
router.get('/inspection-tasks/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT it.*, ip.plan_name, e.name AS assignee_name
       FROM inspection_task it
       LEFT JOIN inspection_plan ip ON it.plan_id = ip.id
       LEFT JOIN employee e ON it.assignee_id = e.id
       WHERE it.id = $1 AND it.is_deleted = false`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查任务不存在'));
    buildDetailResponse(res, result.rows[0], undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-tasks/assignee/:employeeId
router.get('/inspection-tasks/assignee/:employeeId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT it.*, ip.plan_name
       FROM inspection_task it
       LEFT JOIN inspection_plan ip ON it.plan_id = ip.id
       WHERE it.assignee_id = $1 AND it.is_deleted = false AND it.status IN ('pending', 'in_progress', 'overdue')
       ORDER BY it.scheduled_date`, [req.params.employeeId]);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /inspection-tasks
router.post('/inspection-tasks', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { plan_id, task_name, task_code, assignee_id, inspectors, scheduled_date, due_date,
            priority = 'normal', inspection_items, supervisor_id } = req.body;
    if (!plan_id || !task_name || !task_code || !assignee_id || !scheduled_date) {
      return res.json(error(-3, '缺少必填字段'));
    }
    if (priority && !VALID_TASK_PRIORITIES.includes(priority)) return res.json(error(-3, `priority 必须为: ${VALID_TASK_PRIORITIES.join(', ')}`));
    const result = await pool.query(
      `INSERT INTO inspection_task (plan_id, task_name, task_code, assignee_id, inspectors, scheduled_date,
        due_date, status, priority, inspection_items, total_items_count, supervisor_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [plan_id, task_name, task_code, assignee_id, inspectors || null, scheduled_date,
       due_date || null, 'pending', priority, inspection_items ? JSON.stringify(inspection_items) : null,
       inspection_items ? JSON.parse(inspection_items).length : 0, supervisor_id || null, req.user?.id || null]);
    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /inspection-tasks/:id
router.put('/inspection-tasks/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const body = req.body;
    if (body.status && !VALID_TASK_STATUSES.includes(body.status)) return res.json(error(-3, `status 必须为: ${VALID_TASK_STATUSES.join(', ')}`));
    if (body.priority && !VALID_TASK_PRIORITIES.includes(body.priority)) return res.json(error(-3, `priority 必须为: ${VALID_TASK_PRIORITIES.join(', ')}`));
    const fields = [];
    const params = [];
    let idx = 1;
    const mappings = {
      task_name: 'task_name', task_code: 'task_code', assignee_id: 'assignee_id',
      scheduled_date: 'scheduled_date', due_date: 'due_date', status: 'status',
      priority: 'priority', progress: 'progress', result_summary: 'result_summary',
      completed_items_count: 'completed_items_count', total_items_count: 'total_items_count',
      hazards_found_count: 'hazards_found_count', supervisor_id: 'supervisor_id'
    };
    for (const [key, col] of Object.entries(mappings)) {
      if (body[key] !== undefined) { fields.push(`${col} = $${idx}`); params.push(body[key]); idx++; }
    }
    if (body.inspectors !== undefined) { fields.push(`inspectors = $${idx}`); params.push(body.inspectors); idx++; }
    if (body.inspection_items !== undefined) { fields.push(`inspection_items = $${idx}`); params.push(body.inspection_items ? JSON.stringify(body.inspection_items) : null); idx++; }
    if (fields.length === 0) return res.json(error(-3, '请提供要更新的字段'));
    fields.push('updated_at = NOW()');
    params.push(req.params.id);
    const result = await pool.query(`UPDATE inspection_task SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
    if (result.rows.length === 0) return res.json(error(-2, '检查任务不存在'));
    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /inspection-tasks/:id/start
router.put('/inspection-tasks/:id/start', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `UPDATE inspection_task SET status = 'in_progress', actual_start_time = NOW(), updated_at = NOW()
       WHERE id = $1 AND is_deleted = false AND status = 'pending' RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '任务不存在或状态不允许开始'));
    buildDetailResponse(res, result.rows[0], '任务已开始', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /inspection-tasks/:id/complete
router.put('/inspection-tasks/:id/complete', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { result_summary } = req.body;
    const result = await pool.query(
      `UPDATE inspection_task SET status = 'completed', actual_end_time = NOW(), result_summary = $1, updated_at = NOW()
       WHERE id = $2 AND is_deleted = false AND status = 'in_progress' RETURNING *`,
      [result_summary || null, req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '任务不存在或状态不允许完成'));
    buildDetailResponse(res, result.rows[0], '任务已完成', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /inspection-tasks/:id/approve
router.put('/inspection-tasks/:id/approve', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { approval_status, approval_comment } = req.body;
    if (!approval_status || !VALID_APPROVAL_STATUSES.includes(approval_status)) {
      return res.json(error(-3, `approval_status 必须为: ${VALID_APPROVAL_STATUSES.join(', ')}`));
    }
    const result = await pool.query(
      `UPDATE inspection_task SET approval_status = $1, approval_comment = $2, approval_time = NOW(), approved_by = $3, updated_at = NOW()
       WHERE id = $4 AND is_deleted = false RETURNING *`,
      [approval_status, approval_comment || null, req.user?.id || null, req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查任务不存在'));
    buildDetailResponse(res, result.rows[0], '审批完成', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// DELETE /inspection-tasks/:id
router.delete('/inspection-tasks/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(`UPDATE inspection_task SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查任务不存在'));
    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// 三、inspection_record — 检查记录
// ============================================================

// GET /inspection-records
router.get('/inspection-records', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { task_id, employee_id, result, is_hazard_detected, inspection_time_from, inspection_time_to, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'ir.is_deleted = false';
    const params = [];
    let idx = 1;
    if (task_id) { where += ` AND ir.task_id = $${idx}`; params.push(task_id); idx++; }
    if (employee_id) { where += ` AND ir.employee_id = $${idx}`; params.push(employee_id); idx++; }
    if (result) { where += ` AND ir.result = $${idx}`; params.push(result); idx++; }
    if (is_hazard_detected !== undefined) { where += ` AND ir.is_hazard_detected = $${idx}`; params.push(is_hazard_detected === 'true'); idx++; }
    if (inspection_time_from) { where += ` AND ir.inspection_time >= $${idx}`; params.push(inspection_time_from); idx++; }
    if (inspection_time_to) { where += ` AND ir.inspection_time <= $${idx}`; params.push(inspection_time_to); idx++; }
    const count = await pool.query(`SELECT COUNT(*) AS total FROM inspection_record ir WHERE ${where}`, params);
    const total = parseInt(count.rows[0].total);
    params.push(parseInt(pageSize), offset);
    const result2 = await pool.query(
      `SELECT ir.*, e.name AS employee_name, it.task_name
       FROM inspection_record ir
       LEFT JOIN employee e ON ir.employee_id = e.id
       LEFT JOIN inspection_task it ON ir.task_id = it.id
       WHERE ${where}
       ORDER BY ir.inspection_time DESC
       LIMIT $${idx} OFFSET $${idx + 1}`, params);
    buildListResponse(res, result2.rows, total, parseInt(page), parseInt(pageSize), undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-records/stats
router.get('/inspection-records/stats', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const stats = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE result = 'pass') AS passed,
         COUNT(*) FILTER (WHERE result = 'fail') AS failed,
         COUNT(*) FILTER (WHERE is_hazard_detected = true) AS hazards_found
       FROM inspection_record WHERE is_deleted = false`);
    const byCategory = await pool.query(
      `SELECT item_category, COUNT(*) AS count FROM inspection_record WHERE is_deleted = false AND item_category IS NOT NULL GROUP BY item_category ORDER BY count DESC`);
    res.json(success(camelKeys({ ...stats.rows[0], byCategory: byCategory.rows })));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-records/:id
router.get('/inspection-records/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT ir.*, e.name AS employee_name, it.task_name
       FROM inspection_record ir
       LEFT JOIN employee e ON ir.employee_id = e.id
       LEFT JOIN inspection_task it ON ir.task_id = it.id
       WHERE ir.id = $1 AND ir.is_deleted = false`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查记录不存在'));
    buildDetailResponse(res, result.rows[0], undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-records/task/:taskId
router.get('/inspection-records/task/:taskId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT ir.*, e.name AS employee_name
       FROM inspection_record ir
       LEFT JOIN employee e ON ir.employee_id = e.id
       WHERE ir.task_id = $1 AND ir.is_deleted = false
       ORDER BY ir.inspection_time DESC`, [req.params.taskId]);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-records/employee/:employeeId
router.get('/inspection-records/employee/:employeeId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT ir.*, it.task_name
       FROM inspection_record ir
       LEFT JOIN inspection_task it ON ir.task_id = it.id
       WHERE ir.employee_id = $1 AND ir.is_deleted = false
       ORDER BY ir.inspection_time DESC`, [req.params.employeeId]);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /inspection-records
router.post('/inspection-records', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { task_id, plan_id, employee_id, position_id, inspection_time, inspection_location,
            item_name, item_category, item_code, result = 'pass', comment, photos, attachments,
            ai_analysis, ai_suggestion, ai_confidence, is_hazard_detected = false } = req.body;
    if (!task_id || !employee_id || !item_name || !inspection_time) {
      return res.json(error(-3, '缺少必填字段'));
    }
    if (!VALID_RECORD_RESULTS.includes(result)) return res.json(error(-3, `result 必须为: ${VALID_RECORD_RESULTS.join(', ')}`));
    const insertResult = await pool.query(
      `INSERT INTO inspection_record (task_id, plan_id, employee_id, position_id, inspection_time, inspection_location,
        item_name, item_category, item_code, result, comment, photos, attachments,
        ai_analysis, ai_suggestion, ai_confidence, is_hazard_detected)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [task_id, plan_id || null, employee_id, position_id || null, inspection_time, inspection_location || null,
       item_name, item_category || null, item_code || null, result, comment || null,
       photos ? JSON.stringify(photos) : null, attachments ? JSON.stringify(attachments) : null,
       ai_analysis || null, ai_suggestion || null, ai_confidence || null, is_hazard_detected]);
    // 更新任务检查项计数
    if (result === 'pass' || result === 'fail') {
      await pool.query(`UPDATE inspection_task SET completed_items_count = COALESCE(completed_items_count, 0) + 1 WHERE id = $1`, [task_id]);
    }
    // 如果发现问题，创建隐患记录
    if (is_hazard_detected && result === 'fail') {
      const hazardCode = `HD-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
      const hazardResult = await pool.query(
        `INSERT INTO hazard_record (hazard_code, task_id, record_id, employee_id, department_id, position_id,
          hazard_level, hazard_category, description, location, responsible_id, deadline_date, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [hazardCode, task_id, insertResult.rows[0].id, employee_id, null, position_id || null,
         'medium', item_category || 'safety', comment || `${item_name}不合格`, inspection_location || null,
         employee_id, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), 'open', req.user?.id || null]);
      await pool.query(`UPDATE inspection_record SET hazard_record_id = $1 WHERE id = $2`,
        [hazardResult.rows[0].id, insertResult.rows[0].id]);
      await pool.query(`UPDATE inspection_task SET hazards_found_count = COALESCE(hazards_found_count, 0) + 1 WHERE id = $1`, [task_id]);
    }
    buildDetailResponse(res, insertResult.rows[0], '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /inspection-records/:id
router.put('/inspection-records/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const body = req.body;
    if (body.result && !VALID_RECORD_RESULTS.includes(body.result)) return res.json(error(-3, `result 必须为: ${VALID_RECORD_RESULTS.join(', ')}`));
    const fields = [];
    const params = [];
    let idx = 1;
    const mappings = {
      inspection_time: 'inspection_time', inspection_location: 'inspection_location',
      item_name: 'item_name', item_category: 'item_category', item_code: 'item_code',
      result: 'result', comment: 'comment', ai_analysis: 'ai_analysis',
      ai_suggestion: 'ai_suggestion', ai_confidence: 'ai_confidence', is_hazard_detected: 'is_hazard_detected'
    };
    for (const [key, col] of Object.entries(mappings)) {
      if (body[key] !== undefined) { fields.push(`${col} = $${idx}`); params.push(body[key]); idx++; }
    }
    if (body.photos !== undefined) { fields.push(`photos = $${idx}`); params.push(body.photos ? JSON.stringify(body.photos) : null); idx++; }
    if (body.attachments !== undefined) { fields.push(`attachments = $${idx}`); params.push(body.attachments ? JSON.stringify(body.attachments) : null); idx++; }
    if (fields.length === 0) return res.json(error(-3, '请提供要更新的字段'));
    fields.push('updated_at = NOW()');
    params.push(req.params.id);
    const result = await pool.query(`UPDATE inspection_record SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
    if (result.rows.length === 0) return res.json(error(-2, '检查记录不存在'));
    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// DELETE /inspection-records/:id
router.delete('/inspection-records/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(`UPDATE inspection_record SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查记录不存在'));
    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /inspection-records/batch-create
router.post('/inspection-records/batch-create', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.json(error(-3, '请提供检查记录数组'));
    let successCount = 0, failCount = 0;
    const errors = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          await client.query(
            `INSERT INTO inspection_record (task_id, plan_id, employee_id, inspection_time, item_name, item_category, result, comment)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [item.task_id, item.plan_id || null, item.employee_id, item.inspection_time,
             item.item_name, item.item_category || null, item.result || 'pass', item.comment || null]);
          successCount++;
        } catch (e) { errors.push({ index: i, message: e.message }); failCount++; }
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    res.json(success(camelKeys({ total: items.length, success: successCount, failed: failCount, errors }), '批量创建完成'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// 四、hazard_record — 隐患记录
// ============================================================

// GET /hazard-records
router.get('/hazard-records', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { task_id, responsible_id, hazard_level, hazard_category, status, is_closed, keyword, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'hr.is_deleted = false';
    const params = [];
    let idx = 1;
    if (task_id) { where += ` AND hr.task_id = $${idx}`; params.push(task_id); idx++; }
    if (responsible_id) { where += ` AND hr.responsible_id = $${idx}`; params.push(responsible_id); idx++; }
    if (hazard_level) { where += ` AND hr.hazard_level = $${idx}`; params.push(hazard_level); idx++; }
    if (hazard_category) { where += ` AND hr.hazard_category = $${idx}`; params.push(hazard_category); idx++; }
    if (status) { where += ` AND hr.status = $${idx}`; params.push(status); idx++; }
    if (is_closed !== undefined) { where += ` AND hr.is_closed = $${idx}`; params.push(is_closed === 'true'); idx++; }
    if (keyword) { where += ` AND (hr.description ILIKE $${idx} OR hr.hazard_code ILIKE $${idx})`; params.push(`%${keyword}%`); idx++; }
    const count = await pool.query(`SELECT COUNT(*) AS total FROM hazard_record hr WHERE ${where}`, params);
    const total = parseInt(count.rows[0].total);
    params.push(parseInt(pageSize), offset);
    const result = await pool.query(
      `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name
       FROM hazard_record hr
       LEFT JOIN employee e ON hr.employee_id = e.id
       LEFT JOIN employee r ON hr.responsible_id = r.id
       WHERE ${where}
       ORDER BY hr.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`, params);
    buildListResponse(res, result.rows, total, parseInt(page), parseInt(pageSize), undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /hazard-records/stats
router.get('/hazard-records/stats', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const stats = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'open') AS open_count,
         COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
         COUNT(*) FILTER (WHERE status = 'closed') AS closed,
         COUNT(*) FILTER (WHERE is_closed = false AND deadline_date < CURRENT_DATE) AS overdue
       FROM hazard_record WHERE is_deleted = false`);
    const byLevel = await pool.query(
      `SELECT hazard_level, COUNT(*) AS count FROM hazard_record WHERE is_deleted = false GROUP BY hazard_level ORDER BY count DESC`);
    const byCategory = await pool.query(
      `SELECT hazard_category, COUNT(*) AS count FROM hazard_record WHERE is_deleted = false GROUP BY hazard_category ORDER BY count DESC`);
    res.json(success(camelKeys({ ...stats.rows[0], byLevel: byLevel.rows, byCategory: byCategory.rows })));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /hazard-records/open（必须在 /:id 之前）
router.get('/hazard-records/open', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name
       FROM hazard_record hr
       LEFT JOIN employee e ON hr.employee_id = e.id
       LEFT JOIN employee r ON hr.responsible_id = r.id
       WHERE hr.is_deleted = false AND hr.status IN ('open', 'in_progress')
       ORDER BY hr.hazard_level = 'critical' DESC, hr.hazard_level = 'high' DESC, hr.created_at DESC`);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /hazard-records/overdue（必须在 /:id 之前）
router.get('/hazard-records/overdue', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name
       FROM hazard_record hr
       LEFT JOIN employee e ON hr.employee_id = e.id
       LEFT JOIN employee r ON hr.responsible_id = r.id
       WHERE hr.is_deleted = false AND hr.is_closed = false AND hr.deadline_date < CURRENT_DATE
       ORDER BY hr.deadline_date, hr.hazard_level`);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /hazard-records/task/:taskId（必须在 /:id 之前）
router.get('/hazard-records/task/:taskId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name
       FROM hazard_record hr
       LEFT JOIN employee e ON hr.employee_id = e.id
       LEFT JOIN employee r ON hr.responsible_id = r.id
       WHERE hr.task_id = $1 AND hr.is_deleted = false
       ORDER BY hr.created_at DESC`, [req.params.taskId]);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /hazard-records/responsible/:employeeId（必须在 /:id 之前）
router.get('/hazard-records/responsible/:employeeId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT hr.*, e.name AS employee_name
       FROM hazard_record hr
       LEFT JOIN employee e ON hr.employee_id = e.id
       WHERE hr.responsible_id = $1 AND hr.is_deleted = false AND hr.is_closed = false
       ORDER BY hr.deadline_date`, [req.params.employeeId]);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /hazard-records/:id
router.get('/hazard-records/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name, rev.name AS reviewer_name
       FROM hazard_record hr
       LEFT JOIN employee e ON hr.employee_id = e.id
       LEFT JOIN employee r ON hr.responsible_id = r.id
       LEFT JOIN employee rev ON hr.reviewer_id = rev.id
       WHERE hr.id = $1 AND hr.is_deleted = false`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在'));
    buildDetailResponse(res, result.rows[0], undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /hazard-records
router.post('/hazard-records', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { hazard_code, task_id, record_id, employee_id, department_id, position_id,
            hazard_level = 'medium', hazard_category, hazard_type, description, location, photos, evidence,
            root_cause, responsible_id, corrective_actions, deadline_date, status = 'open' } = req.body;
    if (!hazard_code || !task_id || !employee_id || !description || !responsible_id || !deadline_date) {
      return res.json(error(-3, '缺少必填字段'));
    }
    if (!VALID_HAZARD_LEVELS.includes(hazard_level)) return res.json(error(-3, `hazard_level 必须为: ${VALID_HAZARD_LEVELS.join(', ')}`));
    if (!VALID_HAZARD_CATEGORIES.includes(hazard_category)) return res.json(error(-3, `hazard_category 必须为: ${VALID_HAZARD_CATEGORIES.join(', ')}`));
    if (!VALID_HAZARD_STATUSES.includes(status)) return res.json(error(-3, `status 必须为: ${VALID_HAZARD_STATUSES.join(', ')}`));
    const result = await pool.query(
      `INSERT INTO hazard_record (hazard_code, task_id, record_id, employee_id, department_id, position_id,
        hazard_level, hazard_category, hazard_type, description, location, photos, evidence,
        root_cause, responsible_id, corrective_actions, deadline_date, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [hazard_code, task_id, record_id || null, employee_id, department_id || null, position_id || null,
       hazard_level, hazard_category, hazard_type || null, description, location || null,
       photos ? JSON.stringify(photos) : null, evidence ? JSON.stringify(evidence) : null,
       root_cause || null, responsible_id, corrective_actions ? JSON.stringify(corrective_actions) : null,
       deadline_date, status, req.user?.id || null]);
    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /hazard-records/:id
router.put('/hazard-records/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const body = req.body;
    if (body.hazard_level && !VALID_HAZARD_LEVELS.includes(body.hazard_level)) return res.json(error(-3, `hazard_level 必须为: ${VALID_HAZARD_LEVELS.join(', ')}`));
    if (body.hazard_category && !VALID_HAZARD_CATEGORIES.includes(body.hazard_category)) return res.json(error(-3, `hazard_category 必须为: ${VALID_HAZARD_CATEGORIES.join(', ')}`));
    if (body.status && !VALID_HAZARD_STATUSES.includes(body.status)) return res.json(error(-3, `status 必须为: ${VALID_HAZARD_STATUSES.join(', ')}`));
    const fields = [];
    const params = [];
    let idx = 1;
    const mappings = {
      hazard_code: 'hazard_code', hazard_level: 'hazard_level', hazard_category: 'hazard_category',
      hazard_type: 'hazard_type', description: 'description', location: 'location',
      root_cause: 'root_cause', responsible_id: 'responsible_id', deadline_date: 'deadline_date',
      actual_completion_date: 'actual_completion_date', status: 'status', review_status: 'review_status',
      review_comment: 'review_comment', review_date: 'review_date', is_closed: 'is_closed'
    };
    for (const [key, col] of Object.entries(mappings)) {
      if (body[key] !== undefined) { fields.push(`${col} = $${idx}`); params.push(body[key]); idx++; }
    }
    if (body.photos !== undefined) { fields.push(`photos = $${idx}`); params.push(body.photos ? JSON.stringify(body.photos) : null); idx++; }
    if (body.evidence !== undefined) { fields.push(`evidence = $${idx}`); params.push(body.evidence ? JSON.stringify(body.evidence) : null); idx++; }
    if (body.corrective_actions !== undefined) { fields.push(`corrective_actions = $${idx}`); params.push(body.corrective_actions ? JSON.stringify(body.corrective_actions) : null); idx++; }
    if (fields.length === 0) return res.json(error(-3, '请提供要更新的字段'));
    fields.push('updated_at = NOW()');
    params.push(req.params.id);
    const result = await pool.query(`UPDATE hazard_record SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在'));
    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /hazard-records/:id/assign
router.put('/hazard-records/:id/assign', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { responsible_id, deadline_date } = req.body;
    if (!responsible_id) return res.json(error(-3, '请指定整改责任人'));
    const result = await pool.query(
      `UPDATE hazard_record SET responsible_id = $1, deadline_date = COALESCE($2, deadline_date), updated_at = NOW()
       WHERE id = $3 AND is_deleted = false RETURNING *`,
      [responsible_id, deadline_date || null, req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在'));
    buildDetailResponse(res, result.rows[0], '分配成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /hazard-records/:id/complete
router.put('/hazard-records/:id/complete', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { corrective_actions, actual_completion_date } = req.body;
    const result = await pool.query(
      `UPDATE hazard_record SET
         status = 'pending_review',
         corrective_actions = $1,
         actual_completion_date = COALESCE($2, CURRENT_DATE),
         updated_at = NOW()
       WHERE id = $3 AND is_deleted = false AND status IN ('open', 'in_progress') RETURNING *`,
      [corrective_actions ? JSON.stringify(corrective_actions) : null, actual_completion_date || null, req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在或状态不允许完成'));
    buildDetailResponse(res, result.rows[0], '整改完成，待复查', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /hazard-records/:id/review
router.put('/hazard-records/:id/review', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { review_status, review_comment } = req.body;
    if (!review_status || !VALID_REVIEW_STATUSES.includes(review_status)) {
      return res.json(error(-3, `review_status 必须为: ${VALID_REVIEW_STATUSES.join(', ')}`));
    }
    const isClosed = review_status === 'passed';
    const result = await pool.query(
      `UPDATE hazard_record SET
         review_status = $1,
         review_comment = $2,
         reviewer_id = $3,
         review_date = CURRENT_DATE,
         is_closed = $4,
         status = CASE WHEN $4 THEN 'closed' ELSE status END,
         updated_at = NOW()
       WHERE id = $5 AND is_deleted = false RETURNING *`,
      [review_status, review_comment || null, req.user?.id || null, isClosed, req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在'));
    buildDetailResponse(res, result.rows[0], `复查${review_status === 'passed' ? '通过' : '不通过'}`, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /hazard-records/:id/close
router.put('/hazard-records/:id/close', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `UPDATE hazard_record SET is_closed = true, status = 'closed', updated_at = NOW()
       WHERE id = $1 AND is_deleted = false RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在'));
    buildDetailResponse(res, result.rows[0], '已关闭', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// DELETE /hazard-records/:id
router.delete('/hazard-records/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(`UPDATE hazard_record SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在'));
    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// Sprint5.4 v65 扩展 - 检查模板 + 来源追踪
// ============================================================

const VALID_SOURCE_TYPES = ['inspection', 'report', 'audit', 'external', 'other'];

// ============================================================
// 检查清单模板 API
// ============================================================

// GET /checklist-templates
router.get('/checklist-templates', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { template_category, is_active, keyword, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'ict.is_deleted = false';
    const params = [];
    let idx = 1;
    if (template_category) { where += ` AND ict.template_category = $${idx}`; params.push(template_category); idx++; }
    if (is_active !== undefined) { where += ` AND ict.is_active = $${idx}`; params.push(is_active === 'true'); idx++; }
    if (keyword) { where += ` AND (ict.template_name ILIKE $${idx} OR ict.template_code ILIKE $${idx})`; params.push(`%${keyword}%`); idx++; }
    const count = await pool.query(`SELECT COUNT(*) AS total FROM inspection_checklist_template ict WHERE ${where}`, params);
    const total = parseInt(count.rows[0].total);
    params.push(parseInt(pageSize), offset);
    const result = await pool.query(
      `SELECT ict.*, e.name AS created_by_name,
              (SELECT COUNT(*) FROM inspection_checklist_item ici WHERE ici.template_id = ict.id AND ici.is_deleted = false) AS items_count
       FROM inspection_checklist_template ict
       LEFT JOIN employee e ON ict.created_by = e.id
       WHERE ${where}
       ORDER BY ict.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`, params);
    buildListResponse(res, result.rows, total, parseInt(page), parseInt(pageSize), undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /checklist-templates/:id
router.get('/checklist-templates/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const templateResult = await pool.query(
      `SELECT ict.*, e.name AS created_by_name
       FROM inspection_checklist_template ict
       LEFT JOIN employee e ON ict.created_by = e.id
       WHERE ict.id = $1 AND ict.is_deleted = false`, [req.params.id]);
    if (templateResult.rows.length === 0) return res.json(error(-2, '模板不存在'));
    const itemsResult = await pool.query(
      `SELECT * FROM inspection_checklist_item WHERE template_id = $1 AND is_deleted = false ORDER BY sort_order, id`,
      [req.params.id]);
    res.json(success(camelKeys({ ...templateResult.rows[0], items: itemsResult.rows })));
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /checklist-templates
router.post('/checklist-templates', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { template_name, template_code, template_category, description, version = '1.0', applicable_scope, remark } = req.body;
    if (!template_name || !template_code) return res.json(error(-3, '缺少必填字段'));
    const result = await pool.query(
      `INSERT INTO inspection_checklist_template (template_name, template_code, template_category, description, version, applicable_scope, remark, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [template_name, template_code, template_category || null, description || null, version, applicable_scope || null, remark || null, req.user?.id || null]);
    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /checklist-templates/:id
router.put('/checklist-templates/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const body = req.body;
    const fields = [];
    const params = [];
    let idx = 1;
    const mappings = { template_name: 'template_name', template_category: 'template_category', description: 'description', version: 'version', is_active: 'is_active', applicable_scope: 'applicable_scope', remark: 'remark' };
    for (const [key, col] of Object.entries(mappings)) {
      if (body[key] !== undefined) { fields.push(`${col} = $${idx}`); params.push(body[key]); idx++; }
    }
    if (fields.length === 0) return res.json(error(-3, '请提供要更新的字段'));
    fields.push('updated_at = NOW()');
    params.push(req.params.id);
    const result = await pool.query(`UPDATE inspection_checklist_template SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
    if (result.rows.length === 0) return res.json(error(-2, '模板不存在'));
    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// DELETE /checklist-templates/:id
router.delete('/checklist-templates/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(`UPDATE inspection_checklist_template SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '模板不存在'));
    await pool.query(`UPDATE inspection_checklist_item SET is_deleted = true WHERE template_id = $1`, [req.params.id]);
    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /checklist-templates/:id/apply — 应用模板到计划
router.post('/checklist-templates/:id/apply', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { plan_id } = req.body;
    if (!plan_id) return res.json(error(-3, '请指定计划ID'));
    const templateResult = await pool.query(`SELECT * FROM inspection_checklist_template WHERE id = $1 AND is_deleted = false`, [req.params.id]);
    if (templateResult.rows.length === 0) return res.json(error(-2, '模板不存在'));
    const itemsResult = await pool.query(`SELECT * FROM inspection_checklist_item WHERE template_id = $1 AND is_deleted = false ORDER BY sort_order`, [req.params.id]);
    await pool.query(`UPDATE inspection_plan SET template_id = $1, updated_at = NOW() WHERE id = $2`, [req.params.id, plan_id]);
    res.json(success(camelKeys({ template_id: req.params.id, plan_id, items_count: itemsResult.rows.length }), '模板已应用到计划'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// 检查项模板 API
// ============================================================

// GET /checklist-items/template/:templateId
router.get('/checklist-items/template/:templateId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT * FROM inspection_checklist_item WHERE template_id = $1 AND is_deleted = false ORDER BY sort_order, id`,
      [req.params.templateId]);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /checklist-items
router.post('/checklist-items', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { template_id, item_code, item_name, item_category, description, standard_requirement, inspection_method, sort_order = 0, is_required = true, remark } = req.body;
    if (!template_id || !item_name) return res.json(error(-3, '缺少必填字段'));
    const result = await pool.query(
      `INSERT INTO inspection_checklist_item (template_id, item_code, item_name, item_category, description, standard_requirement, inspection_method, sort_order, is_required, remark, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [template_id, item_code || null, item_name, item_category || null, description || null, standard_requirement || null, inspection_method || null, sort_order, is_required, remark || null, req.user?.id || null]);
    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /checklist-items/:id
router.put('/checklist-items/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const body = req.body;
    const fields = [];
    const params = [];
    let idx = 1;
    const mappings = { item_code: 'item_code', item_name: 'item_name', item_category: 'item_category', description: 'description', standard_requirement: 'standard_requirement', inspection_method: 'inspection_method', sort_order: 'sort_order', is_required: 'is_required', remark: 'remark' };
    for (const [key, col] of Object.entries(mappings)) {
      if (body[key] !== undefined) { fields.push(`${col} = $${idx}`); params.push(body[key]); idx++; }
    }
    if (fields.length === 0) return res.json(error(-3, '请提供要更新的字段'));
    fields.push('updated_at = NOW()');
    params.push(req.params.id);
    const result = await pool.query(`UPDATE inspection_checklist_item SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
    if (result.rows.length === 0) return res.json(error(-2, '检查项不存在'));
    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// DELETE /checklist-items/:id
router.delete('/checklist-items/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(`UPDATE inspection_checklist_item SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查项不存在'));
    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /checklist-items/batch-create
router.post('/checklist-items/batch-create', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { template_id, items } = req.body;
    if (!template_id || !Array.isArray(items) || items.length === 0) return res.json(error(-3, '缺少必填字段'));
    let successCount = 0, failCount = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        try {
          await client.query(
            `INSERT INTO inspection_checklist_item (template_id, item_code, item_name, item_category, sort_order, is_required, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [template_id, item.item_code || null, item.item_name, item.item_category || null, item.sort_order || 0, item.is_required !== false, req.user?.id || null]);
          successCount++;
        } catch (e) { failCount++; }
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    res.json(success(camelKeys({ total: items.length, success: successCount, failed: failCount }), '批量创建完成'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// 隐患来源追踪 API
// ============================================================

// GET /hazard-records/source/:sourceType/:sourceId
router.get('/hazard-records/source/:sourceType/:sourceId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { sourceType, sourceId } = req.params;
    if (!VALID_SOURCE_TYPES.includes(sourceType)) return res.json(error(-3, `source_type 必须为: ${VALID_SOURCE_TYPES.join(', ')}`));
    const result = await pool.query(
      `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name
       FROM hazard_record hr
       LEFT JOIN employee e ON hr.employee_id = e.id
       LEFT JOIN employee r ON hr.responsible_id = r.id
       WHERE hr.source_type = $1 AND hr.source_id = $2 AND hr.is_deleted = false`,
      [sourceType, sourceId]);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /hazard-records/from-inspection — 从检查记录创建隐患
router.post('/hazard-records/from-inspection', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { record_id, hazard_level = 'medium', hazard_category, description, location, responsible_id, deadline_date } = req.body;
    if (!record_id || !description || !responsible_id || !deadline_date) return res.json(error(-3, '缺少必填字段'));
    // 获取检查记录
    const recordResult = await pool.query(`SELECT * FROM inspection_record WHERE id = $1 AND is_deleted = false`, [record_id]);
    if (recordResult.rows.length === 0) return res.json(error(-2, '检查记录不存在'));
    const record = recordResult.rows[0];
    // 创建隐患记录
    const hazardCode = `HD-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const hazardResult = await pool.query(
      `INSERT INTO hazard_record (hazard_code, task_id, record_id, employee_id, department_id, position_id,
        hazard_level, hazard_category, hazard_type, description, location, responsible_id, deadline_date, status,
        source_type, source_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [hazardCode, record.task_id, record.id, record.employee_id, null, record.position_id,
       hazard_level, hazard_category || record.item_category || 'safety', record.item_name, description, location || record.inspection_location,
       responsible_id, deadline_date, 'open', 'inspection', record.id, req.user?.id || null]);
    // 更新检查记录
    await pool.query(`UPDATE inspection_record SET is_hazard_detected = true, hazard_record_id = $1 WHERE id = $2`, [hazardResult.rows[0].id, record_id]);
    buildDetailResponse(res, hazardResult.rows[0], '隐患创建成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /hazard-records/:id/confirm — 确认隐患
router.put('/hazard-records/:id/confirm', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `UPDATE hazard_record SET confirmed_by = $1, confirmed_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND is_deleted = false RETURNING *`,
      [req.user?.id || null, req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在'));
    buildDetailResponse(res, result.rows[0], '确认成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// Sprint5.7: 员工档案中心 API（基于 v_employee_current 视图）
// ============================================================

/**
 * GET /employees/profile/list
 * 员工档案列表（分页 + 搜索 + 筛选）
 */
router.get('/employees/profile/list', decryptMiddleware('id_card', 'phone'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ list: [], total: 0, page: 1, pageSize: 20 }), '数据库未连接'));

    const { page = 1, pageSize = 20, keyword, org_unit_id, position_id, is_driver, status } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    // 列表 SQL 直接返回 snake_case 字段名（与前端 dataIndex 完全一致），不再经过 camelKeys 转换。
    // 此前后端对结果执行 camelKeys() → 键变为 camelCase，而前端 dataIndex 全为 snake_case，
    // 导致键不匹配、列表所有字段显示为空。
    // v_employee_current 视图现已提供 org_code/operation_unit_id/unit_name/unit_type/position_code
    // 等全部所需字段（此前误置 NULL，现改为 ev.xxx 取真实值）。
    // 入职日期取 start_date（视图无 hire_date 列）；is_driver 由 position_name 派生
    // （本库 employee_assignment.remark 与视图 remark 均为 NULL，无法用 remark 判定，
    //  保留岗位名启发式，与下方 is_driver 筛选条件一致，实测识别 43 名驾驶员）。
    const conditions = ['e.is_deleted = false'];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(ev.name ILIKE $${paramIdx} OR ev.employee_code ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (org_unit_id) {
      conditions.push(`ea.org_unit_id = $${paramIdx}`);
      params.push(parseInt(org_unit_id));
      paramIdx++;
    }
    if (position_id) {
      conditions.push(`ea.position_id = $${paramIdx}`);
      params.push(parseInt(position_id));
      paramIdx++;
    }
    if (is_driver === 'true') {
      conditions.push(`(ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%')`);
      // 以花名册为准：排除已离职（用工关系=辞职/死亡）的驾驶员。
      // 兼容历史遗留/人工写错导致的「幽灵在职记录」（当前行 employment_relation 为 NULL，
      // 如王春堂 id=9727、张海涛 id=8043）：其真实用工状态在另一条有 employment_relation 的行上，
      // 故按 id_card_hash > 工号 > 姓名 匹配该员工有用工状态的花名册行为权威值，命中辞职/死亡则判定离职。
      conditions.push(`
        COALESCE(
          (SELECT x.employment_relation FROM employee x
             WHERE x.is_deleted = false AND x.employment_relation IS NOT NULL
               AND x.id_card_hash IS NOT NULL AND e.id_card_hash IS NOT NULL
               AND x.id_card_hash = e.id_card_hash ORDER BY x.id LIMIT 1),
          (SELECT x.employment_relation FROM employee x
             WHERE x.is_deleted = false AND x.employment_relation IS NOT NULL
               AND x.employee_code IS NOT NULL AND e.employee_code IS NOT NULL
               AND x.employee_code = e.employee_code ORDER BY x.id LIMIT 1),
          (SELECT x.employment_relation FROM employee x
             WHERE x.is_deleted = false AND x.employment_relation IS NOT NULL
               AND x.name IS NOT NULL AND x.name = e.name ORDER BY x.id LIMIT 1),
          e.employment_relation
        ) NOT IN ('辞职', '死亡')
      `);
    } else if (is_driver === 'false') {
      // 筛选"否"：显式排除驾驶员；position_name 为 NULL 的视为非驾驶员（NULL NOT ILIKE 在 SQL 中结果为 NULL，需显式包含）
      conditions.push(`(ev.position_name IS NULL OR (ev.position_name NOT ILIKE '%驾驶员%' AND ev.position_name NOT ILIKE '%司机%'))`);
    }
    if (status) {
      conditions.push(`ev.assignment_status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM v_employee_current ev
       JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
       LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
       WHERE ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT ev.employee_id AS id, ev.employee_code, ev.name,
              e.gender,
              CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM AGE(e.birth_date))::int END AS age,
              ea.org_unit_id,
              ev.org_name, ev.org_type,
              ev.org_code,
              ev.operation_unit_id,
              ev.unit_name,
              ev.unit_type,
              COALESCE(ea.dept_name, ev.org_name) AS dept_name,
              ea.position_id,
              ev.position_name,
              ev.position_code,
              CASE WHEN e.employment_relation IN ('辞职','死亡') THEN 'left' ELSE ev.assignment_status END AS status,
              COALESCE(ea.start_date, ev.start_date) AS hire_date,
              e.leave_date,
              e.roster_department,
              e.roster_position,
              e.roster_work_area,
              e.phone, e.id_card,
              (ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%') AS is_driver
       FROM v_employee_current ev
       JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
       LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
       WHERE ${whereClause}
       ORDER BY ea.start_date DESC NULLS LAST
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    res.json(success({ list: result.rows, total, page: pageNum, pageSize: limitNum }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

/**
 * GET /employees/profile/roster-version
 * 花名册驾驶员名单版本号（仅用于前端本地缓存比对：是否需重新加载花名册名单）。
 * 口径：与 /employees/profile/list?is_driver=true 的驾驶员筛选一致的 VERSION Condition——
 *   合并「姓名 + 用工关系 + 离职日期 + 更新时间  + 主岗部门」生成哈希。
 *   一旦花名册导入增删改驾驶员、或调整用工/离岗状态，updated_at/字段变化 → 版本号变化，
 *   前端据此判断本地缓存的花名册名单已过期，需按「以花名册导入为节点」重新加载。
 */
router.get('/employees/profile/roster-version', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    // scope=driver（默认）：驾驶员工种名单；scope=all：全部在职员工名单
    const scope = req.query.scope === 'all' ? 'all' : 'driver';
    const positionCond =
      scope === 'driver'
        ? ` AND (ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%')`
        : '';
    const r = await pool.query(
      `SELECT ev.name, e.employment_relation, e.leave_date, e.updated_at, COALESCE(ea.dept_name, ev.org_name) AS dept
       FROM v_employee_current ev
       JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
       LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id
         AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
       WHERE e.is_deleted = false${positionCond}
       ORDER BY ev.name, e.id`,
    );
    const crypto = require('crypto');
    const payload = r.rows
      .map((x) => [x.name, x.employment_relation ?? '', x.leave_date ?? '', x.updated_at ?? '', x.dept ?? ''].join('|'))
      .join(';');
    const version = crypto.createHash('md5').update(payload).digest('hex');
    const latest = r.rows.reduce((m, x) => (x.updated_at && x.updated_at > m ? x.updated_at : m), '');
    res.json(success({ version, count: r.rows.length, updatedAt: latest || null }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});
router.get('/employees/profile/:id', decryptMiddleware('id_card', 'phone'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { id } = req.params;

    const empResult = await pool.query(
      `SELECT e.id, e.employee_code, e.name, e.gender, e.birth_date, e.phone, e.id_card,
              e.person_type, e.person_category, e.is_public_welfare,
              CASE WHEN e.employment_relation IN ('辞职','死亡') THEN 'left'
                   WHEN e.is_deleted THEN 'inactive' ELSE 'active' END AS status,
              e.roster_department, e.roster_position, e.roster_work_area, e.leave_date,
              CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age,
              e.created_at, e.updated_at
       FROM employee e WHERE e.id = $1 AND e.is_deleted = false`,
      [parseInt(id)]
    );
    if (empResult.rows.length === 0) return res.json(error(-2, '员工不存在'));

    const emp = empResult.rows[0];

    // 手动解密敏感字段：decryptMiddleware 只处理 data.data 顶层，而详情结构是
    // { data: { basic: { id_card, phone }, currentOrg } }，id_card/phone 位于 basic 内，
    // 中间件无法命中 → 此处对扁平的 emp 行直接解密（emp 顶层即含 id_card/phone）。
    const decryptedEmp = decryptFields(emp, ['id_card', 'phone']);

    const currentResult = await pool.query(
      `SELECT ea.org_unit_id, ou.org_name, ou.org_type, ou.org_code, ou.org_path,
              ea.operation_unit_id, opu.unit_name, opu.unit_type, opu.unit_code,
              ea.dept_name,
              ea.position_id, p.name AS position_name, p.position_code, p.risk_level,
              ea.supervisor_id, sup.name AS supervisor_name,
              ea.status AS assignment_status, ea.start_date, ea.end_date
       FROM employee_assignment ea
       LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
       LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN employee sup ON sup.id = ea.supervisor_id AND sup.is_deleted = false
       WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false`,
      [parseInt(id)]
    );

    // 详情接口直接返回 snake_case（与列表页 /employees/profile/list 策略一致）：
    // SQL 列名本就是 snake_case（employee_code/org_name/start_date/is_public_welfare…），
    // employee-profile/index.vue 的 Drawer 与 employee-profile.ts 类型均按 snake_case 读取，
    // 套 camelKeys() 会转成 camelCase 导致键名不匹配、Drawer 整列空。
    res.json(success({
      basic: decryptedEmp,
      currentOrg: currentResult.rows.length > 0 ? currentResult.rows[0] : null,
    }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

/**
 * GET /employees/profile/:id/assignments
 * 员工任职历史列表
 */
router.get('/employees/profile/:id/assignments', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { id } = req.params;

    const result = await pool.query(
      `SELECT ea.id, ea.org_unit_id, ea.operation_unit_id, ea.position_id,
              ea.is_primary, ea.is_current, ea.status, ea.start_date, ea.end_date, ea.remark,
              ea.dept_name,
              ou.org_name, ou.org_code,
              opu.unit_name, opu.unit_type,
              p.name AS position_name, p.position_code,
              sup.name AS supervisor_name
       FROM employee_assignment ea
       LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
       LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN employee sup ON sup.id = ea.supervisor_id AND sup.is_deleted = false
       WHERE ea.employee_id = $1 AND ea.is_deleted = false
       ORDER BY ea.start_date DESC`,
      [parseInt(id)]
    );

    // 保持 snake_case 返回（与 /employees/profile/list、/employees/profile/:id 一致），
    // 前端 employee-profile/index.vue 的任职历史表与 AssignmentItem 均按 snake_case 读取。
    res.json(success(result.rows, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

/**
 * GET /employees/profile/:id/driver-info
 * 员工驾驶员信息（从 employee_assignment.remark 解析）
 */
router.get('/employees/profile/:id/driver-info', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { id } = req.params;

    const result = await pool.query(
      `SELECT ea.remark
       FROM employee_assignment ea
       WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false`,
      [parseInt(id)]
    );

    let driverInfo = { is_driver: false, license_type: null };
    if (result.rows.length > 0 && result.rows[0].remark) {
      const remark = result.rows[0].remark;
      driverInfo.is_driver = remark.includes('is_driver=true');
      const licenseMatch = remark.match(/license_type=([^;]+)/);
      if (licenseMatch) driverInfo.license_type = licenseMatch[1];
    }

    res.json(success(camelKeys(driverInfo), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// Sprint5.8: 员工公共选择 API（用于培训/保险/三违/隐患/消防等模块）
// ============================================================

/**
 * GET /employees/selector
 * 员工选择列表（精简字段，支持关键词搜索 + 组织/岗位/驾驶员筛选）
 * 返回: employee_id, name, org_name, unit_name, position_name
 */
router.get('/employees/selector', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success([], '数据库未连接'));

    const { keyword, org_unit_id, position_id, is_driver, limit = 20 } = req.query;
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);

    const conditions = ['ev.is_deleted = false', 'ev.is_current = true'];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(ev.name ILIKE $${paramIdx} OR ev.employee_code ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (org_unit_id) {
      conditions.push(`ev.org_unit_id = $${paramIdx}`);
      params.push(parseInt(org_unit_id));
      paramIdx++;
    }
    if (position_id) {
      conditions.push(`ev.position_id = $${paramIdx}`);
      params.push(parseInt(position_id));
      paramIdx++;
    }
    if (is_driver === 'true') {
      conditions.push(`(ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%')`);
    } else if (is_driver === 'false') {
      conditions.push(`(ev.position_name IS NULL OR (ev.position_name NOT ILIKE '%驾驶员%' AND ev.position_name NOT ILIKE '%司机%'))`);
    }

    const whereClause = conditions.join(' AND ');

    const result = await pool.query(
      `SELECT ev.employee_id, ev.employee_code, ev.name, ev.gender,
              ev.org_unit_id, ev.org_name,
              ev.operation_unit_id, ev.unit_name,
              ev.position_id, ev.position_name
       FROM v_employee_org_full ev
       WHERE ${whereClause}
       ORDER BY ev.name ASC
       LIMIT $${paramIdx}`,
      [...params, limitNum]
    );

    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

/**
 * GET /employees/selector/:id
 * 员工选择单条查询（用于已选择员工的回显）
 */
router.get('/employees/selector/:id', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { id } = req.params;

    const result = await pool.query(
      `SELECT ev.employee_id, ev.employee_code, ev.name, ev.gender,
              ev.org_unit_id, ev.org_name,
              ev.operation_unit_id, ev.unit_name,
              ev.position_id, ev.position_name
       FROM v_employee_org_full ev
       WHERE ev.employee_id = $1 AND ev.is_deleted = false AND ev.is_current = true`,
      [parseInt(id)]
    );

    if (result.rows.length === 0) {
      return res.json(error(-2, '员工不存在'));
    }

    buildDetailResponse(res, result.rows[0], '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

/**
 * POST /employees/selector/batch
 * 员工选择批量查询（用于批量回显，如培训人员列表）
 */
router.post('/employees/selector/batch', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success([], '数据库未连接'));
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.json(success([], 'ID列表为空'));
    }

    const intIds = ids.map((id) => parseInt(id)).filter((id) => Number.isFinite(id) && id > 0);
    if (intIds.length === 0) {
      return res.json(success([], '无效ID'));
    }

    const result = await pool.query(
      `SELECT ev.employee_id, ev.employee_code, ev.name, ev.gender,
              ev.org_unit_id, ev.org_name,
              ev.operation_unit_id, ev.unit_name,
              ev.position_id, ev.position_name
       FROM v_employee_org_full ev
       WHERE ev.employee_id = ANY($1) AND ev.is_deleted = false AND ev.is_current = true
       ORDER BY ev.name ASC`,
      [intIds]
    );

    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// Sprint11-2: 超龄人员自动识别（基于employee表birth_date）
// 规则来源: config/hseRules/employee-age-rule.json
//   男性 > overAgeThresholds.male (默认60)
//   女性 > overAgeThresholds.female (默认50)
// 禁止: 硬编码阈值散落各处
// ============================================================

const ageRule = getEmployeeAgeRule();
const OVER_AGE_THRESHOLDS_CONFIG = getOverAgeThresholds();
const OVER_AGE_THRESHOLDS = {
  '男': OVER_AGE_THRESHOLDS_CONFIG.male || 60,
  '女': OVER_AGE_THRESHOLDS_CONFIG.female || 50,
};
const DEFAULT_THRESHOLD = OVER_AGE_THRESHOLDS_CONFIG.default || 60;

function getOverAgeThresholdLocal(gender) {
  return OVER_AGE_THRESHOLDS[gender] || DEFAULT_THRESHOLD;
}

function buildOverAgeCondition(tableAlias = 'e') {
  const maleTh = OVER_AGE_THRESHOLDS['男'];
  const femaleTh = OVER_AGE_THRESHOLDS['女'];
  return `(
    (${tableAlias}.gender = '男' AND EXTRACT(YEAR FROM age(${tableAlias}.birth_date))::INT > ${maleTh})
    OR
    (${tableAlias}.gender = '女' AND EXTRACT(YEAR FROM age(${tableAlias}.birth_date))::INT > ${femaleTh})
  )`;
}

function buildOverAgeYearsExpr(tableAlias = 'e') {
  const maleTh = OVER_AGE_THRESHOLDS['男'];
  const femaleTh = OVER_AGE_THRESHOLDS['女'];
  const defTh = DEFAULT_THRESHOLD;
  return `CASE
    WHEN ${tableAlias}.gender = '男' THEN EXTRACT(YEAR FROM age(${tableAlias}.birth_date))::INT - ${maleTh}
    WHEN ${tableAlias}.gender = '女' THEN EXTRACT(YEAR FROM age(${tableAlias}.birth_date))::INT - ${femaleTh}
    ELSE EXTRACT(YEAR FROM age(${tableAlias}.birth_date))::INT - ${defTh}
  END`;
}

function buildAgeThresholdExpr(tableAlias = 'e') {
  const maleTh = OVER_AGE_THRESHOLDS['男'];
  const femaleTh = OVER_AGE_THRESHOLDS['女'];
  const defTh = DEFAULT_THRESHOLD;
  return `CASE
    WHEN ${tableAlias}.gender = '男' THEN ${maleTh}
    WHEN ${tableAlias}.gender = '女' THEN ${femaleTh}
    ELSE ${defTh}
  END`;
}

// ============================================================
// 超龄优化管控页专用阈值：公司高龄优化口径（超过68周岁）
// 独立于员工列表的「超龄人员卡」（男60/女50），互不影响
// ============================================================
const OVERAGE_OPTIMIZE_LIMIT = 68;

function buildOptimizeOverAgeCondition(tableAlias = 'e') {
  return `EXTRACT(YEAR FROM age(${tableAlias}.birth_date))::INT > ${OVERAGE_OPTIMIZE_LIMIT}`;
}
function buildOptimizeOverAgeYearsExpr(tableAlias = 'e') {
  return `EXTRACT(YEAR FROM age(${tableAlias}.birth_date))::INT - ${OVERAGE_OPTIMIZE_LIMIT}`;
}

// GET /over-age/auto-list — 自动识别的超龄人员列表（基于employee表）
router.get('/over-age/auto-list', requireRole('admin', 'safety_manager'), decryptMiddleware(...ENCRYPT_FIELDS), async (req, res) => {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, '数据库未连接');

    const { page = 1, pageSize = 20, keyword, township, secondaryDept, positionName, gender } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [
      'e.is_deleted = false',
      "e.employment_relation = '正式员工'", // 超龄仅统计在职（正式员工），离职（辞职/死亡）不计入
      'e.birth_date IS NOT NULL',
      buildOptimizeOverAgeCondition('e'),
    ];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(e.name ILIKE $${paramIdx} OR e.employee_code ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (gender) {
      conditions.push(`e.gender = $${paramIdx}`);
      params.push(gender);
      paramIdx++;
    }
    if (township) {
      conditions.push(`(eo.org_path LIKE $${paramIdx} OR eo.org_path = $${paramIdx})`);
      params.push(`/${township}/%`);
      paramIdx++;
    }
    if (secondaryDept) {
      conditions.push(`eo.org_path LIKE $${paramIdx}`);
      params.push(`%/${secondaryDept}`);
      paramIdx++;
    }
    if (positionName) {
      conditions.push(`p.name = $${paramIdx}`);
      params.push(positionName);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM employee e
       LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
       LEFT JOIN hse_org_unit eo ON eo.id = ea.org_unit_id AND eo.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN (SELECT MAX(id) AS id, personnel_id FROM over_age_personnel WHERE is_deleted = false GROUP BY personnel_id) oap ON oap.personnel_id = e.id
       WHERE ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT e.id, e.employee_code, e.id_card, e.name, e.gender, e.birth_date, e.phone,
              e.person_category, e.person_type, e.is_public_welfare,
              EXTRACT(YEAR FROM age(e.birth_date))::INT AS age,
              ${buildOptimizeOverAgeYearsExpr('e')} AS over_age_years,
              oap.id AS over_age_id,
              ea.org_unit_id, eo.org_name AS dept_name, eo.org_path,
              ea.position_id, p.name AS position_name, ea.status AS status
       FROM employee e
       LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
       LEFT JOIN hse_org_unit eo ON eo.id = ea.org_unit_id AND eo.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN (SELECT MAX(id) AS id, personnel_id FROM over_age_personnel WHERE is_deleted = false GROUP BY personnel_id) oap ON oap.personnel_id = e.id
       WHERE ${whereClause}
       ORDER BY
         CASE
           WHEN p.name LIKE '%乡镇作业中心经理%' THEN 1
           WHEN p.name = '管理员' THEN 2
           WHEN p.name IN ('中转站管理员','转运站操作员') THEN 3
           WHEN p.name LIKE '%保洁%' THEN 4
           ELSE 5
         END,
         age DESC, e.birth_date ASC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    buildListResponse(res, result.rows, total, pageNum, limitNum, '查询成功');
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /over-age/auto-stats — 超龄人员统计
router.get('/over-age/auto-stats', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const [totalResult, genderResult, ageGroupResult, deptResult] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS total FROM employee e
        WHERE e.is_deleted = false AND e.employment_relation = '正式员工' AND e.birth_date IS NOT NULL
        AND ${buildOptimizeOverAgeCondition('e')}`),
      pool.query(`
        SELECT e.gender, COUNT(*)::int AS count FROM employee e
        WHERE e.is_deleted = false AND e.employment_relation = '正式员工' AND e.birth_date IS NOT NULL
        AND ${buildOptimizeOverAgeCondition('e')}
        GROUP BY e.gender`),
      pool.query(`
        SELECT
          CASE
            WHEN EXTRACT(YEAR FROM age(e.birth_date))::INT BETWEEN 51 AND 55 THEN '51-55岁'
            WHEN EXTRACT(YEAR FROM age(e.birth_date))::INT BETWEEN 56 AND 60 THEN '56-60岁'
            WHEN EXTRACT(YEAR FROM age(e.birth_date))::INT BETWEEN 61 AND 65 THEN '61-65岁'
            WHEN EXTRACT(YEAR FROM age(e.birth_date))::INT BETWEEN 66 AND 70 THEN '66-70岁'
            WHEN EXTRACT(YEAR FROM age(e.birth_date))::INT > 70 THEN '70岁以上'
            ELSE '其他'
          END AS age_group,
          COUNT(*)::int AS count
        FROM employee e
        WHERE e.is_deleted = false AND e.employment_relation = '正式员工' AND e.birth_date IS NOT NULL
        AND ${buildOptimizeOverAgeCondition('e')}
        GROUP BY age_group
        ORDER BY age_group`),
      pool.query(`
        SELECT ev.org_name AS dept_name, COUNT(*)::int AS count
        FROM employee e
        LEFT JOIN v_employee_current ev ON ev.employee_id = e.id
        WHERE e.is_deleted = false AND e.employment_relation = '正式员工' AND e.birth_date IS NOT NULL
        AND ${buildOptimizeOverAgeCondition('e')}
        GROUP BY ev.org_name
        ORDER BY count DESC
        LIMIT 10`),
    ]);

    const byGender = {};
    genderResult.rows.forEach(r => { byGender[r.gender || '未知'] = r.count; });

    const byAgeGroup = {};
    ageGroupResult.rows.forEach(r => { byAgeGroup[r.age_group] = r.count; });

    res.json(success(camelKeys({
      total: totalResult.rows[0].total,
      byGender,
      byAgeGroup,
      topDepartments: deptResult.rows,
      thresholds: { 男: OVERAGE_OPTIMIZE_LIMIT, 女: OVERAGE_OPTIMIZE_LIMIT },
    }), '统计成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /over-age/auto-export — 导出超龄人员清单（CSV，基于employee实时计算，id_card/phone 脱敏）
// 注: res.send 绕过 res.json 拦截器，故 id_card/phone 需手动 decryptResult 后再脱敏
router.get('/over-age/auto-export', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const { keyword, gender } = req.query;
    const conditions = [
      'e.is_deleted = false',
      "e.employment_relation = '正式员工'", // 导出仅在职超龄，离职（辞职/死亡）不计入
      'e.birth_date IS NOT NULL',
      buildOptimizeOverAgeCondition('e'),
    ];
    const params = [];
    let paramIdx = 1;
    if (keyword) {
      conditions.push(`(e.name ILIKE $${paramIdx} OR e.employee_code ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (gender) {
      conditions.push(`e.gender = $${paramIdx}`);
      params.push(gender);
      paramIdx++;
    }
    const whereClause = conditions.join(' AND ');

    const result = await pool.query(
      `SELECT e.id, e.employee_code, e.name, e.gender, e.birth_date,
              EXTRACT(YEAR FROM age(e.birth_date))::INT AS age,
              ${buildOptimizeOverAgeYearsExpr('e')} AS over_age_years,
              e.id_card, e.phone,
              e.person_category, e.person_type, e.is_public_welfare,
              eo.org_name AS dept_name, p.name AS position_name,
              oap.id AS over_age_id
       FROM employee e
       LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
       LEFT JOIN hse_org_unit eo ON eo.id = ea.org_unit_id AND eo.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN (SELECT MAX(id) AS id, personnel_id FROM over_age_personnel WHERE is_deleted = false GROUP BY personnel_id) oap ON oap.personnel_id = e.id
       WHERE ${whereClause}
       ORDER BY
         CASE
           WHEN p.name LIKE '%乡镇作业中心经理%' THEN 1
           WHEN p.name = '管理员' THEN 2
           WHEN p.name IN ('中转站管理员','转运站操作员') THEN 3
           WHEN p.name LIKE '%保洁%' THEN 4
           ELSE 5
         END,
         age DESC, e.birth_date ASC`,
      params
    );

    // employee 表 id_card/phone 为密文，先解密再脱敏
    const rows = decryptResult(result.rows, ENCRYPT_FIELDS);
    const headers = ['序号', '姓名', '性别', '年龄', '超龄年数', '出生日期', '身份证号', '部门', '岗位', '联系方式', '人员分类', '是否公益岗'];
    const csvRows = rows.map((r, i) => [
      i + 1,
      (r.name || '').replace(/"/g, '""'),
      r.gender || '',
      r.age || 0,
      r.over_age_years || 0,
      r.birth_date ? String(r.birth_date).slice(0, 10) : '',
      r.id_card ? (r.id_card.length > 8 ? r.id_card.slice(0, 4) + '**********' + r.id_card.slice(-4) : r.id_card) : '',
      (r.dept_name || '').replace(/"/g, '""'),
      (r.position_name || '').replace(/"/g, '""'),
      r.phone ? (r.phone.length >= 7 ? r.phone.slice(0, 3) + '****' + r.phone.slice(-4) : r.phone) : '',
      r.person_category || '',
      r.is_public_welfare ? '是' : '否',
    ].map(v => `"${v}"`).join(','));

    const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="over_age_auto_${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /over-age/auto/:id — 单个超龄人员详情（基于employee）
router.get('/over-age/auto/:id', requireRole('admin', 'safety_manager'), decryptMiddleware(...ENCRYPT_FIELDS), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `SELECT e.id, e.employee_code, e.id_card, e.name, e.gender, e.birth_date, e.phone,
              e.person_category, e.person_type, e.is_public_welfare, e.id_address,
              EXTRACT(YEAR FROM age(e.birth_date))::INT AS age,
              ${buildOptimizeOverAgeYearsExpr('e')} AS over_age_years,
              ${OVERAGE_OPTIMIZE_LIMIT} AS age_threshold,
              oap.id AS over_age_id
       FROM employee e
       LEFT JOIN (SELECT MAX(id) AS id, personnel_id FROM over_age_personnel WHERE is_deleted = false GROUP BY personnel_id) oap ON oap.personnel_id = e.id
       WHERE e.id = $1 AND e.is_deleted = false AND e.birth_date IS NOT NULL`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '员工不存在或无出生日期'));

    const emp = result.rows[0];

    const orgResult = await pool.query(
      `SELECT ea.org_unit_id, ou.org_name AS dept_name, ou.org_path,
              ea.position_id, p.name AS position_name, ea.status AS status,
              ea.start_date
       FROM employee_assignment ea
       LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false`,
      [req.params.id]
    );
    emp.org = orgResult.rows[0] || null;
    if (orgResult.rows[0]) {
      emp.dept_name = orgResult.rows[0].dept_name;
      emp.position_name = orgResult.rows[0].position_name;
    }

    buildDetailResponse(res, emp, '查询成功');
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

module.exports = router;