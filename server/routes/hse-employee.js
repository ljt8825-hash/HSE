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
router.use('/', require('./hse-employee/employee'));
router.use('/', require('./hse-employee/org-tree'));
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

