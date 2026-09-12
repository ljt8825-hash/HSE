/**
 * HSE 员工域共享辅助（从 hse-employee.js 顶部迁移）
 * 供 employee / org-tree / assignment / import 等子路由复用
 * 行为与原内联定义逐字节一致；不可在此存放路由 handler
 */
const { pool } = require('../../config/db');
const { decryptFields } = require('../../middleware/encryption');
const { encrypt, hashSensitive } = require('../../utils/encryption');
const { getOverAgeThresholds } = require('../../config/hseRules');

// 加密字段常量
const ENCRYPT_FIELDS = ['id_card', 'phone'];

// 超龄判定阈值（男60/女50，默认60；来源 config/hseRules，禁止硬编码散落各处）
const OVER_AGE_THRESHOLDS = {
  '男': getOverAgeThresholds().male || 60,
  '女': getOverAgeThresholds().female || 50,
};
const DEFAULT_THRESHOLD = getOverAgeThresholds().default || 60;

/**
 * 构建超龄判定 SQL 条件（员工列表 / 统计卡 / 超龄识别共用）
 * 从 over-age 域收敛为唯一实现源，供 employee / over-age 两个子路由复用
 * @param {string} tableAlias - 表别名（默认 e）
 * @returns {string}
 */
function buildOverAgeCondition(tableAlias = 'e') {
  const maleTh = OVER_AGE_THRESHOLDS['男'];
  const femaleTh = OVER_AGE_THRESHOLDS['女'];
  return `(
    (${tableAlias}.gender = '男' AND EXTRACT(YEAR FROM age(${tableAlias}.birth_date))::INT > ${maleTh})
    OR
    (${tableAlias}.gender = '女' AND EXTRACT(YEAR FROM age(${tableAlias}.birth_date))::INT > ${femaleTh})
  )`;
}

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


module.exports = {
  ENCRYPT_FIELDS,
  computeHash,
  secureEncode,
  buildOrgPath,
  buildDeptPath,
  fetchEmployeeInfosByIds,
  parseIdList,
  buildOverAgeCondition,
};
