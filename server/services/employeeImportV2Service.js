/**
 * HSE Sprint5.6 员工花名册导入 V2 —— 业务层
 * 原 routes/hse-employee-import-v2.js（1731 行）全部业务 + SQL + 私有辅助函数 + 文件/XLSX/加密/审计调用收敛于此。
 * 每个 HTTP 端点对应一个 service 函数，返回统一描述符（__t:'json'），由 controllers/employeeImportV2Controller.js 的 respond() 统一
 * 解释为对外 JSON 契约，行为与原路由逐字节一致。
 *
 * 描述符语义（与原路由错误语义对齐）：
 *  - 成功：{ __t:'json', payload, message }（= res.json(success(payload, message))）
 *  - 数据库未连接 / 业务校验：{ __t:'json', error:{code,message} }（无 httpStatus → controller res.json(error(...)) = HTTP 200）
 *  - 原路由各 handler 的 catch 分支均为 res.json(error(-1, formatDbError(e)))（HTTP 200），此处用用无 httpStatus 的错误描述符表达；
 *    故本文所有错误统一不带 httpStatus，controller respond() 不会覆写 200，保证对外契约与原路由逐字节不变。
 *
 * 约束（原文件文件头保留）：禁止直接写 employee（必须经过审核流程）；禁止硬编码组织和岗位规则（使用配置表）；
 * 复用现有加密/哈希、上传中间件。文件复选框/上传中间件（multer）留在 routes/hse-employee-import-v2/main.js 绑定层。
 *
 * require 路径说明（为容纳 services/ 目录层级已按 server 上层相对路径书写）：
 *  - require('../routes/audit')         → routes/audit（从 services 上行）
 *  - require('../utils/encryption')     → server/utils/encryption（上行正确）
 *  - require('../middleware/upload')    → server/middleware/upload（上行正确；仅取 validateUploadedFile/deleteFile/fixFilenameEncoding，
 *                                          uploadExcel 中间件本身留在 main.js 绑定层）
 *  - require('../config/db')            → server/config/db（上行正确）
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { pool, isConnected } = require('../config/db');
const { auditLog } = require('../routes/audit');
const { encrypt, hashSensitive } = require('../utils/encryption');
const { validateUploadedFile, deleteFile, fixFilenameEncoding } = require('../middleware/upload');

// ============================================================
// 常量与配置
// ============================================================

/**
 * 花名册来源目录：默认 G:\safety_vault\08_保险及人员管理\花名册，
 * 可用环境变量 ROSTER_SOURCE_DIR 覆盖（沿用安全文化建设/三违分析目录扫描惯例）。
 * 「目录导入」路由从此目录读取 Excel，按修改时间由近到远排序。
 */
const SOURCE_DIR = process.env.ROSTER_SOURCE_DIR
  || 'G:/safety_vault/08_保险及人员管理/花名册';

/** 花名册Excel标准表头映射（13个字段） */
const ROSTER_HEADER_MAP = {
  '员工编号': 'employee_no',
  '姓名': 'name',
  '身份证号': 'id_card',
  '性别': 'gender',
  '出生日期': 'birth_date',
  '所属部门': 'raw_dept',
  '班组': 'raw_team',
  '职位': 'raw_position',
  '入职日期': 'hire_date',
  '联系电话': 'phone',
  '是否驾驶员': 'is_driver',
  '驾驶证类型': 'license_type',
  '直接上级': 'raw_supervisor',
  '负责区域（在职）': 'raw_work_area',
  '是否公益岗': 'is_public_welfare',
};

/** 表头别名兼容映射（非标准表头 → 标准表头） */
const HEADER_ALIASES = {
  '员工编码': '员工编号',
  '工号': '员工编号',
  '人员编号': '员工编号',
  '身份证号码': '身份证号',
  '身份证件号': '身份证号',
  '身份证': '身份证号',
  '部门': '所属部门',
  '所属乡镇': '所属部门',
  '二级乡镇': '班组',
  '二级部门': '所属部门',
  '组织': '所属部门',
  '片区': '班组',
  '负责区域': '班组',
  '所属部门名称': '所属部门',
  '岗位': '职位',
  '职务': '职位',
  '电话': '联系电话',
  '手机号': '联系电话',
  '手机号码': '联系电话',
  '手机': '联系电话',
  '出生年月': '出生日期',
  '生日': '出生日期',
  '入职时间': '入职日期',
  '上级': '直接上级',
  '上级姓名': '直接上级',
  '在职区域': '负责区域（在职）',
  '所在区域': '负责区域（在职）',
  '公益岗': '是否公益岗',
  '公益岗位': '是否公益岗',
};

const VALID_GENDERS = ['男', '女'];

// ============================================================
// 描述符快捷构造
// ============================================================
const ok = (payload, message) => ({ __t: 'json', payload, message });
const err = (code, message, httpStatus) => ({ __t: 'json', error: { code, message }, ...(httpStatus ? { httpStatus } : {}) });

/**
 * 「所属部门」显示名归一化：乡镇/街道中心后缀「片区」统一改为「乡镇作业中心」。
 * 例：大柳镇片区 → 大柳镇乡镇作业中心；长官镇一班 等班组名不命中，原样保留。
 * 仅用于落库展示（roster_department），不影响 raw_dept 的部门匹配逻辑。
 */
function normalizeRosterDept(dept) {
  const s = String(dept || '').trim();
  if (!s) return null;
  return s.replace(/片区$/, '乡镇作业中心');
}

// ============================================================
// 辅助函数
// ============================================================

function secureEncode(plaintext) {
  if (!plaintext) return { cipher: null, hash: null };
  return { cipher: encrypt(plaintext), hash: hashSensitive(plaintext) };
}

function normalizeDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{4})[.\/\-](\d{1,2})[.\/\-](\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  return s;
}

function parseExcelRow(rawRow) {
  const normalizedRow = {};
  for (const [key, value] of Object.entries(rawRow)) {
    const standardKey = HEADER_ALIASES[key] || key;
    if (normalizedRow[standardKey] === undefined || normalizedRow[standardKey] === '') {
      normalizedRow[standardKey] = value;
    }
  }
  const result = {};
  for (const [cnHeader, dbField] of Object.entries(ROSTER_HEADER_MAP)) {
    if (normalizedRow[cnHeader] !== undefined && normalizedRow[cnHeader] !== '') {
      result[dbField] = normalizedRow[cnHeader];
    }
  }
  if (result.birth_date) result.birth_date = normalizeDate(result.birth_date);
  if (result.hire_date) result.hire_date = normalizeDate(result.hire_date);
  if (result.phone !== undefined) result.phone = String(result.phone).trim();
  if (result.employee_no !== undefined) result.employee_no = String(result.employee_no).trim();
  if (result.name) result.name = String(result.name).trim();
  if (result.id_card) result.id_card = String(result.id_card).trim();
  if (result.gender) result.gender = String(result.gender).trim();
  if (result.raw_dept) result.raw_dept = String(result.raw_dept).trim();
  if (result.raw_team) result.raw_team = String(result.raw_team).trim();
  if (result.raw_position) result.raw_position = String(result.raw_position).trim();
  if (result.raw_supervisor) result.raw_supervisor = String(result.raw_supervisor).trim();
  if (result.raw_work_area) result.raw_work_area = String(result.raw_work_area).trim();
  if (result.is_driver !== undefined) {
    const v = String(result.is_driver).trim().toLowerCase();
    result.is_driver = ['是', 'true', '1', 'yes', 'y'].includes(v);
  }
  if (result.is_public_welfare !== undefined) {
    const v = String(result.is_public_welfare).trim().toLowerCase();
    result.is_public_welfare = ['是', 'true', '1', 'yes', 'y'].includes(v);
  }
  // 从身份证推导性别和出生日期
  if (result.id_card && /^\d{17}[\dXx]$/.test(result.id_card)) {
    if (!result.birth_date) {
      result.birth_date = `${result.id_card.substring(6, 10)}-${result.id_card.substring(10, 12)}-${result.id_card.substring(12, 14)}`;
    }
    if (!result.gender) {
      const sexCode = parseInt(result.id_card.substring(16, 17));
      result.gender = sexCode % 2 === 0 ? '女' : '男';
    }
  }
  return result;
}

function validateRow(row, rowIndex) {
  const errors = [];
  if (!row.name) errors.push(`第${rowIndex}行：姓名不能为空`);
  if (row.id_card && !/^\d{17}[\dXx]$/.test(row.id_card)) errors.push(`第${rowIndex}行：身份证号格式错误`);
  if (row.phone && !/^1\d{10}$/.test(row.phone)) errors.push(`第${rowIndex}行：手机号格式错误`);
  if (row.gender && !VALID_GENDERS.includes(row.gender)) errors.push(`第${rowIndex}行：性别必须是"男"或"女"`);
  return { valid: errors.length === 0, errors };
}

function generateBatchNo() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `BATCH-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${String(Math.random()).slice(2,6)}`;
}

/**
 * 根据部门/岗位推断 person_type（不硬编码规则，仅作 fallback）
 */
function inferPersonType(rawDept, rawPosition) {
  if (!rawDept && !rawPosition) return '辅助人员';
  const combined = `${rawDept || ''} ${rawPosition || ''}`;
  if (combined.includes('管理') || combined.includes('经理') || combined.includes('区长') || combined.includes('班长')) return '管理人员';
  if (combined.includes('安全') || combined.includes('专员') || combined.includes('会计') || combined.includes('人事')) return '技术人员';
  if (combined.includes('保洁') || combined.includes('司机') || combined.includes('驾驶员') || combined.includes('中转站') || combined.includes('挂桶')) return '生产人员';
  return '辅助人员';
}

/**
 * 将 PostgreSQL 原始错误转换为用户可读的中文提示
 */
function formatDbError(err) {
  const msg = err.message || '';
  if (msg.includes('current transaction is aborted')) {
    return '数据入库异常：部分数据格式不符合数据库要求，请联系管理员检查数据完整性';
  }
  if (msg.includes('duplicate key')) {
    return '数据冲突：员工编号或身份证号已存在，请检查重复数据';
  }
  if (msg.includes('violates not-null constraint')) {
    return '必填字段缺失：请检查员工姓名、身份证号等必填字段是否填写完整';
  }
  if (msg.includes('value too long')) {
    return '字段超长：部分文本字段超过了数据库允许的最大长度';
  }
  return `数据库错误：${msg}`;
}

// ============================================================
// 匹配逻辑
// ============================================================

/**
 * 组织匹配：通过 employee_import_mapping_rule 查找 org_unit_id
 */
async function matchOrgUnit(client, rawDept, ruleVersion) {
  if (!rawDept) return null;
  const dept = String(rawDept).trim();
  if (!dept) return null;

  // 1. 精确匹配（映射规则表）
  const result = await client.query(
    `SELECT target_id, target_name FROM employee_import_mapping_rule
     WHERE source_value = $1 AND source_type = 'excel_department' AND target_type = 'org_unit'
       AND rule_version = $2 AND status = 'active' AND is_deleted = false
     ORDER BY match_priority DESC, id DESC LIMIT 1`,
    [dept, ruleVersion]
  );
  if (result.rows.length > 0) return result.rows[0];

  // 2. 直接在组织架构表中精确匹配
  const direct = await client.query(
    `SELECT id AS target_id, org_name AS target_name FROM hse_org_unit
     WHERE org_name = $1 AND is_deleted = false LIMIT 1`,
    [dept]
  );
  if (direct.rows.length > 0) return direct.rows[0];

  // 3. 模糊匹配：包含关系（部门名称包含 org_name 或 org_name 包含部门名称）
  const fuzzy = await client.query(
    `SELECT id AS target_id, org_name AS target_name
     FROM hse_org_unit WHERE is_deleted = false
       AND (org_name = $1 OR org_name LIKE $2 OR $1 LIKE '%' || org_name || '%')
     ORDER BY CASE WHEN org_name = $1 THEN 3
                   WHEN org_name LIKE $2 THEN 2
                   ELSE 1 END DESC, id
     LIMIT 1`,
    [dept, '%' + dept + '%']
  );
  if (fuzzy.rows.length > 0) return { target_id: fuzzy.rows[0].target_id, target_name: fuzzy.rows[0].target_name };

  // 4. 部门名称关键字匹配（处理"安环管理部"→"安环品质部"这类差异）
  const deptKeywords = dept.replace(/[部中心室办组]/g, '').replace(/[\s\-_]/g, '');
  if (deptKeywords.length >= 2) {
    const keywordMatch = await client.query(
      `SELECT id AS target_id, org_name AS target_name
       FROM hse_org_unit WHERE is_deleted = false
         AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(org_name, '部', ''), '中', ''), '心', ''), '室', ''), '办', '') 
             LIKE '%' || $1 || '%'
       ORDER BY id LIMIT 1`,
      [deptKeywords]
    );
    if (keywordMatch.rows.length > 0) return { target_id: keywordMatch.rows[0].target_id, target_name: keywordMatch.rows[0].target_name };
  }

  // 5. 乡镇前缀匹配（兜底）：处理「XX镇/XX乡/XX街道 + 班组/片区」→「XX镇/乡/街道作业中心」模式
  //    例如「时集镇四班」「长官镇片区」「宁城街道二班」→ 提取「时集镇/长官镇/宁城街道」前缀，
  //    匹配 hse_org_unit 中以该前缀开头的组织单元。仅在前 4 级全部未命中时触发。
  const townshipPrefix = dept.match(/^(.+?[镇乡街道])/);
  if (townshipPrefix) {
    const prefix = townshipPrefix[1];
    const townshipMatch = await client.query(
      `SELECT id AS target_id, org_name AS target_name
       FROM hse_org_unit WHERE is_deleted = false
         AND org_name LIKE $1 || '%'
       ORDER BY id LIMIT 1`,
      [prefix]
    );
    if (townshipMatch.rows.length > 0) {
      return { target_id: townshipMatch.rows[0].target_id, target_name: townshipMatch.rows[0].target_name };
    }
  }

  return null;
}

/**
 * 作业单元匹配：通过 employee_import_mapping_rule 查找 operation_unit_id
 * 或根据部门和岗位动态推断
 */
// 中文数字 → 阿拉伯数字（班组序号：一班→1）
function cnNumeralToDigit(s) {
  const map = { '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  let out = '';
  for (const ch of s) out += (map[ch] != null ? map[ch] : ch);
  return out;
}

async function matchOperationUnit(client, rawDept, rawTeam, rawPosition, orgUnitId, ruleVersion) {
  if (!rawDept) return null;
  // 1. 先查映射规则中的 operation_unit
  const result = await client.query(
    `SELECT target_id, target_name FROM employee_import_mapping_rule
     WHERE source_value = $1 AND source_type = 'excel_department' AND target_type = 'operation_unit'
       AND rule_version = $2 AND status = 'active' AND is_deleted = false
     ORDER BY match_priority DESC, id DESC LIMIT 1`,
    [rawDept, ruleVersion]
  );
  if (result.rows.length > 0) return result.rows[0];

  // 2. 根据班组动态推断作业单元
  //    支持：数字班组（"一班"→"第1保洁组"）、纯中文班组（"保洁组"→"柴胡店镇保洁组"）
  if (rawTeam && orgUnitId) {
    const orgResult = await client.query(
      `SELECT org_name FROM hse_org_unit WHERE id = $1 AND is_deleted = false`, [orgUnitId]
    );
    if (orgResult.rows.length > 0) {
      const townName = orgResult.rows[0].org_name.replace('作业中心', '');
      // 班组序号：优先阿拉伯数字（"1班"），否则中文数字（"一班"→1）
      const digitMatch = rawTeam.match(/(\d+)/);
      let teamSeq = digitMatch ? digitMatch[1] : null;
      if (!teamSeq) {
        const cnMatch = rawTeam.match(/([零一二三四五六七八九十]+)/);
        if (cnMatch) teamSeq = String(cnNumeralToDigit(cnMatch[1]));
      }
      const unitName = teamSeq
        ? `${townName}第${teamSeq}保洁组`
        : `${townName}${rawTeam}`;
      // 查询是否已存在该作业单元（getOrCreate 模式）
      const exist = await client.query(
        `SELECT id, unit_name FROM hse_operation_unit
         WHERE org_unit_id = $1 AND unit_type = 'cleaning_team' AND unit_name = $2 AND is_deleted = false`,
        [orgUnitId, unitName]
      );
      if (exist.rows.length > 0) {
        return { target_id: exist.rows[0].id, target_name: exist.rows[0].unit_name };
      }
      // 动态创建
      const unitCode = `UNIT-${orgUnitId}-${rawTeam.replace(/[^a-zA-Z0-9一-龥]/g, '').substring(0, 10)}`;
      const insert = await client.query(
        `INSERT INTO hse_operation_unit (org_unit_id, unit_name, unit_type, unit_code, status)
         VALUES ($1, $2, 'cleaning_team', $3, 'active') RETURNING id, unit_name`,
        [orgUnitId, unitName, unitCode]
      );
      return { target_id: insert.rows[0].id, target_name: insert.rows[0].unit_name };
    }
  }

  // 3. 根据岗位推断：司机→收运车组，中转站管理员→转运站
  if (rawPosition && orgUnitId) {
    const orgResult = await client.query(
      `SELECT org_name FROM hse_org_unit WHERE id = $1 AND is_deleted = false`, [orgUnitId]
    );
    const townName = orgResult.rows.length > 0 ? orgResult.rows[0].org_name.replace('作业中心', '') : '';

    const posLower = rawPosition.toLowerCase();
    if (posLower.includes('司机') || posLower.includes('驾驶员')) {
      const unitName = `${townName}收运车组`;
      const exist = await client.query(
        `SELECT id FROM hse_operation_unit WHERE org_unit_id = $1 AND unit_type = 'collection_team' AND unit_name = $2 AND is_deleted = false`,
        [orgUnitId, unitName]
      );
      if (exist.rows.length > 0) return { target_id: exist.rows[0].id, target_name: unitName };
      const insert = await client.query(
        `INSERT INTO hse_operation_unit (org_unit_id, unit_name, unit_type, unit_code, status)
         VALUES ($1, $2, 'collection_team', $3, 'active') RETURNING id, unit_name`,
        [orgUnitId, unitName, `UNIT-${orgUnitId}-COLLECT-001`]
      );
      return { target_id: insert.rows[0].id, target_name: insert.rows[0].unit_name };
    }
    if (posLower.includes('转运站') || posLower.includes('中转站')) {
      const unitName = `${townName}转运站`;
      const exist = await client.query(
        `SELECT id FROM hse_operation_unit WHERE org_unit_id = $1 AND unit_type = 'transfer_station' AND unit_name = $2 AND is_deleted = false`,
        [orgUnitId, unitName]
      );
      if (exist.rows.length > 0) return { target_id: exist.rows[0].id, target_name: unitName };
      const insert = await client.query(
        `INSERT INTO hse_operation_unit (org_unit_id, unit_name, unit_type, unit_code, status)
         VALUES ($1, $2, 'transfer_station', $3, 'active') RETURNING id, unit_name`,
        [orgUnitId, unitName, `UNIT-${orgUnitId}-STATION-001`]
      );
      return { target_id: insert.rows[0].id, target_name: insert.rows[0].unit_name };
    }
  }

  return null;
}

/**
 * 岗位匹配：通过 employee_position_mapping_rule 查找 position_id
 * 支持司机细分（condition_dept）
 */
async function matchPosition(client, rawPosition, rawDept, ruleVersion) {
  if (!rawPosition) return null;

  // 1. 条件匹配（精确：source_position + condition_dept）
  let cond = rawDept;
  if (rawDept && rawDept.includes('片区')) cond = '片区';

  const condResult = await client.query(
    `SELECT target_position_id, target_position_name FROM employee_position_mapping_rule
     WHERE source_position = $1 AND condition_dept = $2
       AND rule_version = $3 AND status = 'active' AND is_deleted = false
       AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)
       AND EXISTS (
         SELECT 1 FROM position p WHERE p.id = employee_position_mapping_rule.target_position_id AND p.is_deleted = false
       )
     ORDER BY effective_date DESC LIMIT 1`,
    [rawPosition, cond, ruleVersion]
  );
  if (condResult.rows.length > 0) return condResult.rows[0];

  // 2. 无条件匹配（condition_dept IS NULL）
  const result = await client.query(
    `SELECT target_position_id, target_position_name FROM employee_position_mapping_rule
     WHERE source_position = $1 AND condition_dept IS NULL
       AND rule_version = $2 AND status = 'active' AND is_deleted = false
       AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)
       AND EXISTS (
         SELECT 1 FROM position p WHERE p.id = employee_position_mapping_rule.target_position_id AND p.is_deleted = false
       )
     ORDER BY effective_date DESC LIMIT 1`,
    [rawPosition, ruleVersion]
  );
  if (result.rows.length > 0) return result.rows[0];

  // 3. 模糊匹配（兜底）：防止未来出现新的未知岗位。
  //    仅当 L1（条件匹配）+ L2（无条件匹配）均未命中时触发；
  //    按 名称精确 > 前缀包含 > 被包含 优先级取最匹配项。
  const fuzzyResult = await client.query(
    `SELECT id AS target_position_id, name AS target_position_name
     FROM position WHERE is_deleted = false
       AND (name = $1 OR name LIKE $2 OR $1 LIKE '%' || name || '%')
     ORDER BY CASE WHEN name = $1 THEN 3
                   WHEN name LIKE $2 THEN 2
                   ELSE 1 END DESC
     LIMIT 1`,
    [rawPosition, '%' + rawPosition + '%']
  );
  if (fuzzyResult.rows.length > 0) {
    return { target_position_id: fuzzyResult.rows[0].target_position_id, target_position_name: fuzzyResult.rows[0].target_position_name };
  }

  return null;
}

/**
 * 员工匹配：优先级 employee_no → id_card_hash → phone_hash + name
 */
async function matchEmployee(client, row) {
  // 优先级1: employee_no
  if (row.employee_no) {
    const r = await client.query(`SELECT id, name FROM employee WHERE employee_code = $1 AND is_deleted = false`, [row.employee_no]);
    if (r.rows.length > 0) return { type: 'existing', employee: r.rows[0], matchBy: 'employee_no' };
  }
  // 优先级2: id_card_hash
  if (row.id_card) {
    const hash = hashSensitive(row.id_card);
    const r = await client.query(`SELECT id, name FROM employee WHERE id_card_hash = $1 AND is_deleted = false`, [hash]);
    if (r.rows.length > 0) return { type: 'existing', employee: r.rows[0], matchBy: 'id_card_hash' };
  }
  // 优先级3: phone_hash + name
  if (row.phone && row.name) {
    const hash = hashSensitive(row.phone);
    const r = await client.query(
      `SELECT id, name FROM employee WHERE phone_hash = $1 AND name = $2 AND is_deleted = false`,
      [hash, row.name]
    );
    if (r.rows.length > 0) return { type: 'existing', employee: r.rows[0], matchBy: 'phone_hash_name' };
  }
  return { type: 'new' };
}

/**
 * 加载「非考核·跳过大名单」：命中的部门/岗位在导入时整行跳过，不进入异常待审。
 * 规则来自配置表 employee_import_skip_rule（禁止硬编码），按当前规则版本过滤。
 */
async function loadSkipSets(client, ruleVersion) {
  const res = await client.query(
    `SELECT source_type, source_value FROM employee_import_skip_rule
     WHERE rule_version = $1 AND status = 'active' AND is_deleted = false`,
    [ruleVersion]
  );
  const deps = new Set();
  const poss = new Set();
  for (const r of res.rows) {
    const v = String(r.source_value).trim();
    if (!v) continue;
    if (r.source_type === 'excel_department') deps.add(v);
    else if (r.source_type === 'excel_position') poss.add(v);
  }
  return { deps, poss };
}

/**
 * 加载「泛称部门」名单：此类部门无具体乡镇归属（如"乡镇作业中心"/"中转站"），
 * 导入时优先按直接上级反推具体乡镇作业中心；反推不到则兜底匹配（环卫作业中心）。
 */
async function loadGenericDepts(client, ruleVersion) {
  const res = await client.query(
    `SELECT source_value FROM employee_import_mapping_rule
     WHERE source_type = 'generic_dept' AND rule_version = $1 AND status = 'active' AND is_deleted = false`,
    [ruleVersion]
  );
  return new Set(res.rows.map((r) => String(r.source_value).trim()).filter(Boolean));
}

/**
 * 上级 → 乡镇作业中心 反推：
 *   1) 显式映射配置表（source_type='excel_supervisor'，覆盖离职等无法从当前视图取到的上级）
 *   2) v_employee_current 中上级的乡镇作业中心（town_center）任职
 * 均未命中返回 null，交由调用方兜底。
 */
async function resolveOrgBySupervisor(client, supervisorName, ruleVersion) {
  if (!supervisorName) return null;
  const name = String(supervisorName).trim();
  if (!name) return null;

  const cfg = await client.query(
    `SELECT target_id, target_name FROM employee_import_mapping_rule
     WHERE source_value = $1 AND source_type = 'excel_supervisor' AND target_type = 'org_unit'
       AND rule_version = $2 AND status = 'active' AND is_deleted = false
     ORDER BY match_priority DESC, id DESC LIMIT 1`,
    [name, ruleVersion]
  );
  if (cfg.rows.length > 0) return cfg.rows[0];

  const v = await client.query(
    `SELECT org_unit_id, org_name FROM v_employee_current
     WHERE name = $1 AND employee_deleted = false AND org_type = 'town_center'
     ORDER BY assigned_at DESC NULLS LAST LIMIT 1`,
    [name]
  );
  if (v.rows.length > 0) {
    return { target_id: v.rows[0].org_unit_id, target_name: v.rows[0].org_name };
  }
  return null;
}

/**
 * 组织匹配入口：泛称部门先按直接上级反推具体乡镇作业中心，反推失败再走常规匹配（兜底）。
 */
async function resolveOrg(client, rawDept, rawSupervisor, genericDepts, ruleVersion) {
  if (rawDept && genericDepts.has(String(rawDept).trim())) {
    const bySupervisor = await resolveOrgBySupervisor(client, rawSupervisor, ruleVersion);
    if (bySupervisor) return bySupervisor;
  }
  return matchOrgUnit(client, rawDept, ruleVersion);
}

/**
 * 上级匹配：按姓名在 employee 表中查找，返回 employee_id；匹配不到则保留原始文本
 * 说明：黄殿兴、曹周平的上级（如马鑫）为区域层领导，不在系统内，返回 null 保留纯文本
 */
async function matchSupervisor(client, supervisorName) {
  if (!supervisorName) return null;
  const name = String(supervisorName).trim();
  if (!name) return null;

  const r = await client.query(
    `SELECT id, name FROM employee WHERE name = $1 AND is_deleted = false LIMIT 1`,
    [name]
  );
  if (r.rows.length > 0) return { supervisor_id: r.rows[0].id, supervisor_name: r.rows[0].name };
  return null; // 外部领导，保留纯文本
}

// ============================================================
// 事务 / 工作流业务
// ============================================================

/** 自动扩展 pending 表字段 */
let pendingColumnsReady = false;
async function ensurePendingColumns() {
  if (pendingColumnsReady) return;
  if (!isConnected()) return;
  const columns = [
    { name: 'gender', type: 'VARCHAR(8)' },
    { name: 'birth_date', type: 'DATE' },
    { name: 'id_card_encrypted', type: 'TEXT' },
    { name: 'phone_encrypted', type: 'TEXT' },
    { name: 'person_type', type: 'VARCHAR(32)' },
    { name: 'raw_supervisor', type: 'VARCHAR(100)' },
    { name: 'supervisor_id', type: 'BIGINT' },
  ];
  for (const col of columns) {
    try {
      await pool.query(`ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
    } catch (e) { /* 已存在 */ }
  }
  pendingColumnsReady = true;
}

/** 更新 v_employee_current 视图，补全 id_card / is_public_welfare / id_address */
let viewUpdated = false;
async function ensureViewFields() {
  if (viewUpdated) return;
  if (!isConnected()) return;
  try {
    await pool.query(`DROP VIEW IF EXISTS v_employee_current`);
    await pool.query(`
      CREATE VIEW v_employee_current AS
      SELECT DISTINCT ON (e.id)
          e.id AS employee_id,
          e.employee_code,
          e.name,
          e.gender,
          e.birth_date,
          e.phone,
          e.id_card,
          e.person_category,
          e.person_type,
          e.is_public_welfare,
          e.id_address,
          CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age,
          a.id AS assignment_id,
          a.org_unit_id,
          ou.org_name,
          ou.org_type,
          ou.org_code,
          ou.org_path,
          a.operation_unit_id,
          opu.unit_name,
          opu.unit_type,
          opu.unit_code,
          a.position_id,
          p.name AS position_name,
          p.position_code,
          p.job_category AS position_type,
          p.risk_level,
          p.is_safety_critical,
          a.supervisor_id,
          sup.name AS supervisor_name,
          a.status AS assignment_status,
          a.is_current,
          a.is_primary,
          a.start_date,
          a.end_date,
          a.remark,
          a.created_at AS assigned_at,
          e.is_deleted AS employee_deleted
      FROM employee e
      LEFT JOIN employee_assignment a
          ON a.employee_id = e.id
          AND a.is_current = true
          AND a.is_primary = true
          AND a.is_deleted = false
      LEFT JOIN hse_org_unit ou ON ou.id = a.org_unit_id AND ou.is_deleted = false
      LEFT JOIN hse_operation_unit opu ON opu.id = a.operation_unit_id AND opu.is_deleted = false
      LEFT JOIN position p ON p.id = a.position_id AND p.is_deleted = false
      LEFT JOIN employee sup ON sup.id = a.supervisor_id AND sup.is_deleted = false
      WHERE e.is_deleted = false
      ORDER BY e.id, a.start_date DESC NULLS LAST
    `);
    viewUpdated = true;
    console.log('[ImportV2] v_employee_current 视图已更新（补全 id_card/is_public_welfare/id_address）');
  } catch (e) {
    console.warn('[ImportV2] 视图更新失败:', e.message.substring(0, 100));
  }
}

/**
 * 解析花名册工作簿并创建导入批次 + pending 记录（上传 / 目录导入共用同一口径）
 * - 匹配成功行 → pending 状态 approved（可直接入库）
 * - 异常行（缺字段/未知组织/未知岗位/冲突）→ pending 状态 pending（待审）
 * - 全空行 → 跳过并计数
 */
async function createImportBatchFromWorkbook({ filePath, fileName, username, ip, importSource = 'web' }) {
  if (!isConnected()) throw new Error('数据库未连接');

  await ensurePendingColumns();
  await ensureViewFields();

  const workbook = XLSX.readFile(filePath);
  if (workbook.SheetNames.length === 0) throw new Error('Excel 文件无工作表');

  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (rawRows.length === 0) throw new Error('Excel 工作表无数据');

  // 表头校验
  const firstRow = rawRows[0];
  if (!('姓名' in firstRow)) {
    throw new Error('Excel 表头必须包含"姓名"列；请下载最新模板');
  }

  const client = await pool.connect();
  let batchId;
  let batchNo;
  let successCount = 0;
  let pendingCount = 0;
  let skippedCount = 0;
  let ruleVersion = 'v1.0';
  try {
    // 获取当前生效的规则版本
    const verResult = await client.query(
      `SELECT version FROM employee_import_mapping_rule_version
       WHERE status = 'active' AND is_deleted = false
         AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)
       ORDER BY effective_date DESC LIMIT 1`
    );
    if (verResult.rows.length > 0) ruleVersion = verResult.rows[0].version;

    // 加载「非考核·跳过大名单」（部门/岗位命中则整行跳过，不计异常）
    const skipSets = await loadSkipSets(client, ruleVersion);

    // 加载「泛称部门」名单（乡镇作业中心/中转站，按直接上级反推具体乡镇）
    const genericDepts = await loadGenericDepts(client, ruleVersion);

    // 创建批次
    batchNo = generateBatchNo();
    const batchResult = await client.query(
      `INSERT INTO employee_import_batch
       (batch_no, file_name, rule_version, total_count, status, uploaded_by, uploaded_at, operator, import_source, client_ip)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8, $9) RETURNING id`,
      [batchNo, fileName, ruleVersion, rawRows.length, 'parsing',
       username || null, username || null, importSource, ip || null]
    );
    batchId = batchResult.rows[0].id;

    for (let idx = 0; idx < rawRows.length; idx++) {
      const rawRow = rawRows[idx];
      const row = parseExcelRow(rawRow);
      const rowIndex = idx + 2;

      // 跳过全空行
      if (!row.name && !row.employee_no && !row.id_card) {
        skippedCount++;
        continue;
      }

      // 跳过大名单命中：部门或岗位在「非考核·跳过」名单内 → 整行跳过，不计异常
      if ((row.raw_dept && skipSets.deps.has(String(row.raw_dept).trim()))
          || (row.raw_position && skipSets.poss.has(String(row.raw_position).trim()))) {
        skippedCount++;
        continue;
      }

      // 基础校验
      const check = validateRow(row, rowIndex);
      if (!check.valid) {
        pendingCount++;
        await client.query(
          `INSERT INTO employee_import_pending
           (batch_id, row_num, employee_no, employee_name, pending_type, pending_desc, rule_version, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [batchId, rowIndex, row.employee_no || null, row.name, 'missing_field',
           check.errors.join('; '), ruleVersion, 'pending']
        );
        continue;
      }

      // 组织匹配（泛称部门按直接上级反推具体乡镇作业中心，反推失败再兜底）
      const orgMatch = await resolveOrg(client, row.raw_dept, row.raw_supervisor, genericDepts, ruleVersion);
      if (!orgMatch) {
        pendingCount++;
        await client.query(
          `INSERT INTO employee_import_pending
           (batch_id, row_num, employee_no, employee_name, raw_dept, raw_position, raw_supervisor, pending_type, pending_desc, rule_version, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [batchId, rowIndex, row.employee_no || null, row.name, row.raw_dept || null,
           row.raw_position || null, row.raw_supervisor || null, 'unknown_dept', `未知部门: ${row.raw_dept}`, ruleVersion, 'pending']
        );
        continue;
      }

      // 岗位匹配（岗位为空时跳过匹配，不报错）
      let posMatch = null;
      if (row.raw_position && String(row.raw_position).trim()) {
        posMatch = await matchPosition(client, row.raw_position, row.raw_dept, ruleVersion);
        if (!posMatch) {
          pendingCount++;
          await client.query(
            `INSERT INTO employee_import_pending
             (batch_id, row_num, employee_no, employee_name, raw_dept, raw_position, raw_supervisor, pending_type, pending_desc, rule_version, status, target_org_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [batchId, rowIndex, row.employee_no || null, row.name, row.raw_dept || null,
             row.raw_position || null, row.raw_supervisor || null, 'unknown_position', `未知岗位: ${row.raw_position}`, ruleVersion, 'pending',
             orgMatch.target_id]
          );
          continue;
        }
      }

      // 作业单元匹配
      const unitMatch = await matchOperationUnit(client, row.raw_dept, row.raw_team, row.raw_position, orgMatch.target_id, ruleVersion);

      // 员工匹配（系统内是否已存在）
      const empMatch = await matchEmployee(client, row);

      // 上级匹配（按姓名→员工编码，匹配不到如马鑫等区域层领导保留纯文本）
      const supervisorMatch = await matchSupervisor(client, row.raw_supervisor);

      // 唯一性校验：身份证号/手机号冲突
      let pendingDesc = null;
      if (row.id_card) {
        const hash = hashSensitive(row.id_card);
        const exist = await client.query(`SELECT id, name FROM employee WHERE id_card_hash = $1 AND is_deleted = false`, [hash]);
        if (exist.rows.length > 0 && empMatch.type === 'new') {
          pendingDesc = `身份证冲突: 系统中已存在员工 ${exist.rows[0].name}`;
        }
      }
      if (!pendingDesc && row.phone) {
        const hash = hashSensitive(row.phone);
        const exist = await client.query(`SELECT id, name FROM employee WHERE phone_hash = $1 AND is_deleted = false`, [hash]);
        if (exist.rows.length > 0 && empMatch.type === 'new') {
          pendingDesc = `手机号冲突: 系统中已存在员工 ${exist.rows[0].name}`;
        }
      }

      if (pendingDesc) {
        pendingCount++;
        await client.query(
          `INSERT INTO employee_import_pending
           (batch_id, row_num, employee_no, employee_name, raw_dept, raw_position, raw_supervisor, pending_type, pending_desc, rule_version, status,
            target_org_id, target_unit_id, target_pos_id, id_card_hash, phone_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [batchId, rowIndex, row.employee_no || null, row.name, row.raw_dept || null, row.raw_position || null,
           row.raw_supervisor || null, 'id_card_conflict', pendingDesc, ruleVersion, 'pending',
           orgMatch.target_id, unitMatch?.target_id || null, posMatch?.target_position_id || null,
           row.id_card ? hashSensitive(row.id_card) : null,
           row.phone ? hashSensitive(row.phone) : null]
        );
        continue;
      }

      // 通过全部校验和匹配，保存为 approved（可直接入库）
      successCount++;
      const idCardHash = row.id_card ? hashSensitive(row.id_card) : null;
      const phoneHash = row.phone ? hashSensitive(row.phone) : null;
      const idCardCipher = row.id_card ? encrypt(row.id_card) : null;
      const phoneCipher = row.phone ? encrypt(row.phone) : null;
      const personType = inferPersonType(row.raw_dept, row.raw_position);
      const personCategory = row.birth_date
        ? (parseInt(row.birth_date.substring(0, 4)) <= (new Date().getFullYear() - 60) ? '超龄人员' : '适龄人员')
        : null;
      await client.query(
        `INSERT INTO employee_import_pending
         (batch_id, row_num, employee_no, employee_name, raw_dept, raw_position, raw_team, raw_supervisor, supervisor_id,
          raw_work_area,
          hire_date, is_driver, license_type,
          pending_type, pending_desc, rule_version, status,
          target_org_id, target_unit_id, target_pos_id, id_card_hash, phone_hash,
          gender, birth_date, id_card_encrypted, phone_encrypted, person_type, is_public_welfare)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
        [batchId, rowIndex, row.employee_no || null, row.name, row.raw_dept || null,
         row.raw_position || null, row.raw_team || null, row.raw_supervisor || null,
         supervisorMatch?.supervisor_id || null,
         row.raw_work_area || null,
         row.hire_date || null, row.is_driver === true, row.license_type || null,
         'auto_matched', '自动匹配成功', ruleVersion, 'approved',
         orgMatch.target_id, unitMatch?.target_id || null, posMatch?.target_position_id || null,
         idCardHash, phoneHash,
         row.gender || null, row.birth_date || null, idCardCipher, phoneCipher, personType,
         row.is_public_welfare === true]
      );
    }

    // 更新批次状态
    await client.query(
      `UPDATE employee_import_batch SET status = $1, success_count = $2, pending_count = $3, skipped_count = $4 WHERE id = $5`,
      ['pending_review', successCount, pendingCount, skippedCount, batchId]
    );
  } finally {
    client.release();
  }

  return { batchId, batchNo, totalRows: rawRows.length, successCount, pendingCount, skippedCount, ruleVersion };
}

/**
 * 正式入库：将批次中所有 approved 记录写入 employee + employee_assignment。
 * 供「手动入库」路由与「目录自动入库」共用同一份写库逻辑。
 */
async function performBatchImport(batchId, { userId, username, ip } = {}) {
  if (!isConnected()) throw new Error('数据库未连接');

  const batchResult = await pool.query(
    `SELECT batch_no, rule_version, status FROM employee_import_batch WHERE id = $1 AND is_deleted = false`, [batchId]
  );
  if (batchResult.rows.length === 0) {
    const e = new Error('批次不存在'); e.code = 'NOT_FOUND'; throw e;
  }
  if (batchResult.rows[0].status === 'completed') {
    const e = new Error('该批次已入库完成，禁止重复导入'); e.code = 'DONE'; throw e;
  }

  // 查询所有 approved 状态的 pending 记录（含自动匹配成功 + 人工审核通过）
  const pendingResult = await pool.query(
    `SELECT id, row_num, employee_no, employee_name, raw_dept, raw_position, raw_team,
            raw_work_area,
            hire_date, is_driver, license_type,
            target_org_id, target_unit_id, target_pos_id, id_card_hash, phone_hash,
            gender, birth_date, id_card_encrypted, phone_encrypted, person_type,
            supervisor_id, raw_supervisor, is_public_welfare
     FROM employee_import_pending
     WHERE batch_id = $1 AND status = 'approved' AND is_deleted = false
     ORDER BY row_num ASC`,
    [batchId]
  );

  if (pendingResult.rows.length === 0) {
    const e = new Error('没有可入库的记录，请先上传并审核通过'); e.code = 'EMPTY'; throw e;
  }

  const client = await pool.connect();
  let insertedCount = 0;
  let updatedCount = 0;
  let assignmentCount = 0;
  let failedCount = 0;
  const errors = [];

  try {
    await client.query('BEGIN');

    for (let i = 0; i < pendingResult.rows.length; i++) {
      const p = pendingResult.rows[i];
      const spName = `sp_${i}`;
      try {
        await client.query(`SAVEPOINT ${spName}`);
        // 员工匹配
        let employeeId = null;

        if (p.employee_no) {
          const r = await client.query(
            `SELECT id FROM employee WHERE employee_code = $1 AND is_deleted = false`, [p.employee_no]
          );
          if (r.rows.length > 0) employeeId = r.rows[0].id;
        }
        if (!employeeId && p.id_card_hash) {
          const r = await client.query(
            `SELECT id FROM employee WHERE id_card_hash = $1 AND is_deleted = false`, [p.id_card_hash]
          );
          if (r.rows.length > 0) employeeId = r.rows[0].id;
        }
        if (!employeeId && p.phone_hash && p.employee_name) {
          const r = await client.query(
            `SELECT id FROM employee WHERE phone_hash = $1 AND name = $2 AND is_deleted = false`,
            [p.phone_hash, p.employee_name]
          );
          if (r.rows.length > 0) employeeId = r.rows[0].id;
        }

        if (!employeeId) {
          // 创建新员工
          const personType = p.person_type || inferPersonType(p.raw_dept, p.raw_position);
          const personCategory = p.birth_date
            ? (parseInt(String(p.birth_date).substring(0, 4)) <= (new Date().getFullYear() - 60) ? '超龄人员' : '适龄人员')
            : null;
          const insertEmp = await client.query(
            `INSERT INTO employee
             (employee_code, id_card, id_card_hash, name, gender, birth_date, phone, phone_hash,
              person_category, person_type, is_public_welfare, id_address, direct_supervisor,
              roster_department, roster_position, roster_work_area, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
            [p.employee_no || null, p.id_card_encrypted || null, p.id_card_hash || null,
             p.employee_name, p.gender || null, p.birth_date || null,
             p.phone_encrypted || null, p.phone_hash || null,
             personCategory, personType,
             p.is_public_welfare || false, null,
             p.raw_supervisor || null,
             normalizeRosterDept(p.raw_dept), p.raw_position || null, p.raw_work_area || null]
          );
          employeeId = insertEmp.rows[0].id;
          insertedCount++;
        } else {
          // 已有员工，更新缺失字段
          await client.query(
            `UPDATE employee SET
               gender = COALESCE(gender, $2),
               birth_date = COALESCE(birth_date, $3),
               id_card = COALESCE(id_card, $4),
               phone = COALESCE(phone, $5),
               person_type = COALESCE(person_type, $6),
               person_category = COALESCE(person_category, $7),
               direct_supervisor = COALESCE($8::varchar, direct_supervisor),
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND (gender IS NULL OR birth_date IS NULL OR id_card IS NULL OR phone IS NULL OR $8::varchar IS NOT NULL)`,
            [employeeId, p.gender || null, p.birth_date || null,
             p.id_card_encrypted || null, p.phone_encrypted || null,
             p.person_type || null,
             p.birth_date ? (parseInt(String(p.birth_date).substring(0, 4)) <= (new Date().getFullYear() - 60) ? '超龄人员' : '适龄人员') : null,
             p.raw_supervisor || null]
          );
          updatedCount++;
        }

        // 花名册三列同步（roster_department/roster_position/roster_work_area）：导入即有值即联动刷新
        await client.query(
          `UPDATE employee SET
             roster_department = COALESCE($2::varchar, roster_department),
             roster_position = COALESCE($3::varchar, roster_position),
             roster_work_area = COALESCE($4::varchar, roster_work_area),
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND ($2::varchar IS NOT NULL OR $3::varchar IS NOT NULL OR $4::varchar IS NOT NULL)`,
          [employeeId, normalizeRosterDept(p.raw_dept), p.raw_position || null, p.raw_work_area || null]
        );

        // 处理 employee_assignment
        // 1. 如果已有当前主岗，标记为非当前（调岗场景）
        await client.query(
          `UPDATE employee_assignment
           SET is_primary = false, is_current = false, end_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
           WHERE employee_id = $1 AND is_current = true AND is_primary = true AND is_deleted = false`,
          [employeeId]
        );

        // 2. 上级兜底：若上传时未匹配到（supervisor_id 为空），导入时基于原始文本再次匹配写入
        let finalSupervisorId = p.supervisor_id || null;
        if (!finalSupervisorId && p.raw_supervisor) {
          const fbMatch = await matchSupervisor(client, p.raw_supervisor);
          if (fbMatch && fbMatch.supervisor_id) {
            finalSupervisorId = fbMatch.supervisor_id;
            await client.query(
              `UPDATE employee_import_pending SET supervisor_id = $1 WHERE id = $2`,
              [finalSupervisorId, p.id]
            );
          }
        }

        // 3. 创建新的任职关系
        // start_date 优先使用 hire_date；remark 记录 driver/license_type 元信息
        const remarkParts = [];
        if (p.is_driver === true) remarkParts.push('is_driver=true');
        if (p.license_type) remarkParts.push(`license_type=${p.license_type}`);
        const remarkStr = remarkParts.length > 0 ? remarkParts.join(';') : null;
        await client.query(
          `INSERT INTO employee_assignment
           (employee_id, org_unit_id, operation_unit_id, position_id, supervisor_id, dept_name, is_primary, is_current, status, start_date, remark, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, CURRENT_DATE), $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [employeeId, p.target_org_id, p.target_unit_id, p.target_pos_id, finalSupervisorId || null,
           p.raw_dept || null, true, true, 'active', p.hire_date || null, remarkStr]
        );
        assignmentCount++;

        // 3. 标记 pending 记录为已导入
        await client.query(
          `UPDATE employee_import_pending SET status = 'imported', resolved_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [p.id]
        );

        await client.query(`RELEASE SAVEPOINT ${spName}`);
      } catch (rowErr) {
        // 回滚到保存点，隔离该行失败对后续行的影响（PostgreSQL 约束错误会使整个事务 abort）
        try {
          await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
        } catch (spErr) { /* 保存点回滚失败时由外层事务 ROLLBACK 兜底 */ }
        failedCount++;
        errors.push(`第${p.row_num}行: ${rowErr.message}`);
      }
    }

    // 更新批次状态
    await client.query(
      `UPDATE employee_import_batch
       SET status = $1, completed_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [failedCount > 0 ? 'partial_completed' : 'completed', batchId]
    );

    await client.query('COMMIT');

    // 记录审计日志
    try {
      await auditLog({
        userId: userId || null,
        username: username || null,
        module: 'employee_import_v2',
        action: 'import',
        description: '员工花名册正式入库',
        ip: ip || null,
        statusCode: failedCount > 0 ? 207 : 200,
        detail: {
          batchId,
          total: pendingResult.rows.length,
          insertedCount,
          updatedCount,
          assignmentCount,
          failedCount,
          errors: errors.slice(0, 20),
        },
      });
    } catch (e) { /* 审计失败不影响主流程 */ }

    return {
      batchId,
      total: pendingResult.rows.length,
      insertedCount,
      updatedCount,
      assignmentCount,
      failedCount,
      errors: errors.slice(0, 20),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** 将文件名安全地限定在来源目录内（禁止路径穿越），非法时返回 null */
function safeSourcePath(fileName) {
  if (!fileName || typeof fileName !== 'string') return null;
  const base = path.basename(String(fileName).trim().replace(/\\/g, '/'));
  if (!base) return null;
  const abs = path.resolve(SOURCE_DIR, base);
  const root = path.resolve(SOURCE_DIR);
  if (abs !== path.join(root, base)) return null;
  return abs;
}

// ============================================================
// HTTP 端点业务（每一条对应原路由 handler，返回 __t:'json' 描述符）
// ============================================================

/** POST /upload 上传Excel → 解析 → 校验 → 匹配 → 创建批次 + pending记录 */
async function upload(file, body, user, ip) {
  const tmpFile = file?.path;
  try {
    if (!file) return err(-3, '请上传 Excel 文件');

    const sigCheck = validateUploadedFile(file, 'excel');
    if (!sigCheck.valid) return err(-3, sigCheck.error);

    const fileName = fixFilenameEncoding(file.originalname);
    const result = await createImportBatchFromWorkbook({
      filePath: tmpFile,
      fileName,
      username: user?.username,
      ip,
      importSource: 'web',
    });

    // 记录审计日志
    try {
      await auditLog({
        userId: user?.id,
        username: user?.username,
        module: 'employee_import_v2',
        action: 'upload',
        description: '员工花名册导入',
        ip,
        detail: {
          fileName,
          batchNo: result.batchNo,
          batchId: result.batchId,
          totalCount: result.totalRows,
          successCount: result.successCount,
          pendingCount: result.pendingCount,
          skippedCount: result.skippedCount,
          ruleVersion: result.ruleVersion,
        },
      });
    } catch (e) { /* 审计失败不影响主流程 */ }

    return ok({
      batchId: result.batchId,
      batchNo: result.batchNo,
      fileName,
      totalRows: result.totalRows,
      successCount: result.successCount,
      pendingCount: result.pendingCount,
      skippedCount: result.skippedCount,
      ruleVersion: result.ruleVersion,
      preview: [],
    }, '上传解析完成，请审核异常数据后执行入库');
  } catch (ex) {
    return err(-1, formatDbError(ex));
  } finally {
    if (tmpFile) await deleteFile(tmpFile);
  }
}

/** GET /batches 查询导入批次列表 */
async function batches(query) {
  try {
    if (!isConnected()) return ok([], '数据库未连接');
    const { page = 1, pageSize = 20, status } = query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const conditions = ['is_deleted = false'];
    const params = [];
    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }
    const where = conditions.join(' AND ');

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM employee_import_batch WHERE ${where}`, params);
    const total = countResult.rows[0].total;

    const result = await pool.query(
      `SELECT id, batch_no, file_name, rule_version, total_count, success_count, pending_count, skipped_count,
              status, uploaded_by, uploaded_at, completed_at, operator, created_at
       FROM employee_import_batch WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(pageSize), offset]
    );

    return ok({ list: result.rows, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功');
  } catch (ex) {
    return err(-1, formatDbError(ex));
  }
}

/** GET /batch/:batchId/preview 查询批次解析结果预览 */
async function batchPreview(batchId) {
  try {
    if (!isConnected()) return err(-1, '数据库未连接');

    const batchResult = await pool.query(
      `SELECT id, batch_no, file_name, rule_version, total_count, success_count, pending_count, skipped_count, status
       FROM employee_import_batch WHERE id = $1 AND is_deleted = false`, [batchId]
    );
    if (batchResult.rows.length === 0) return err(-2, '批次不存在');

    const pendingResult = await pool.query(
      `SELECT id, row_num, employee_no, employee_name, raw_dept, raw_position, pending_type, pending_desc, status,
              target_org_id, target_unit_id, target_pos_id, resolution, resolved_by, resolved_at
       FROM employee_import_pending WHERE batch_id = $1 AND is_deleted = false ORDER BY row_num ASC`, [batchId]
    );

    return ok({
      batch: batchResult.rows[0],
      pendingList: pendingResult.rows,
    }, '查询成功');
  } catch (ex) {
    return err(-1, formatDbError(ex));
  }
}

/** GET /batch/:batchId/pending 查询批次的待确认记录 */
async function batchPending(batchId, query) {
  try {
    if (!isConnected()) return err(-1, '数据库未连接');
    const { status, pending_type } = query;

    const conditions = ['batch_id = $1 AND is_deleted = false'];
    const params = [batchId];
    if (status) { conditions.push(`status = $${params.length + 1}`); params.push(status); }
    if (pending_type) { conditions.push(`pending_type = $${params.length + 1}`); params.push(pending_type); }

    const result = await pool.query(
      `SELECT id, row_num, employee_no, employee_name, raw_dept, raw_position, raw_team, pending_type, pending_desc,
              resolution, resolved_by, resolved_at, target_org_id, target_unit_id, target_pos_id, status, created_at
       FROM employee_import_pending WHERE ${conditions.join(' AND ')} ORDER BY row_num ASC`,
      params
    );
    return ok(result.rows, '查询成功');
  } catch (ex) {
    return err(-1, formatDbError(ex));
  }
}

/** POST /pending/:id/resolve 审核单条待确认记录（approved / rejected） */
async function pendingResolve(id, body, user, ip) {
  try {
    if (!isConnected()) return err(-1, '数据库未连接');
    const { resolution, target_org_id, target_unit_id, target_pos_id, remark } = body;

    if (!resolution || !['approved', 'rejected'].includes(resolution)) {
      return err(-3, 'resolution 必须为 approved 或 rejected');
    }

    const pendingResult = await pool.query(
      `SELECT status, batch_id FROM employee_import_pending WHERE id = $1 AND is_deleted = false`, [id]
    );
    if (pendingResult.rows.length === 0) return err(-2, '待确认记录不存在');
    if (pendingResult.rows[0].status !== 'pending') {
      return err(-3, `当前状态为 ${pendingResult.rows[0].status}，无法修改`);
    }

    const result = await pool.query(
      `UPDATE employee_import_pending
       SET status = $1, resolution = $2, resolved_by = $3, resolved_at = CURRENT_TIMESTAMP,
           target_org_id = $4, target_unit_id = $5, target_pos_id = $6, pending_desc = COALESCE($7, pending_desc)
       WHERE id = $8 RETURNING *`,
      [resolution, resolution, user?.username, target_org_id || null, target_unit_id || null,
       target_pos_id || null, remark || null, id]
    );

    // 更新批次计数
    const batchId = pendingResult.rows[0].batch_id;
    if (resolution === 'approved') {
      await pool.query(
        `UPDATE employee_import_batch SET success_count = success_count + 1, pending_count = pending_count - 1 WHERE id = $1`,
        [batchId]
      );
    } else {
      await pool.query(
        `UPDATE employee_import_batch SET skipped_count = skipped_count + 1, pending_count = pending_count - 1 WHERE id = $1`,
        [batchId]
      );
    }

    // 记录审计日志
    try {
      await auditLog({
        userId: user?.id,
        username: user?.username,
        module: 'employee_import_v2',
        action: 'resolve_pending',
        description: '员工导入异常审核',
        ip,
        detail: {
          pendingId: id,
          batchId,
          resolution,
          targetOrgId: target_org_id || null,
          targetUnitId: target_unit_id || null,
          targetPosId: target_pos_id || null,
          remark: remark || null,
        },
      });
    } catch (e) { /* 审计失败不影响主流程 */ }

    return ok(result.rows[0], '审核完成');
  } catch (ex) {
    return err(-1, formatDbError(ex));
  }
}

/** POST /batch/:batchId/import 正式入库 */
async function batchImport(batchId, user, ip) {
  try {
    const result = await performBatchImport(batchId, {
      userId: user?.id,
      username: user?.username,
      ip,
    });
    return ok(result, result.failedCount > 0 ? '部分入库完成，存在失败记录' : '入库完成');
  } catch (ex) {
    if (ex.code === 'NOT_FOUND') return err(-2, ex.message);
    if (ex.code === 'DONE' || ex.code === 'EMPTY') return err(-3, ex.message);
    return err(-1, formatDbError(ex));
  }
}

/** DELETE /batch/:batchId 删除导入批次（软删除批次及其 pending 记录） */
async function deleteBatch(batchId) {
  try {
    if (!isConnected()) return err(-1, '数据库未连接');
    if (!batchId) return err(-2, '批次ID不能为空');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE employee_import_pending SET is_deleted = true WHERE batch_id = $1 AND is_deleted = false',
        [batchId]
      );
      const result = await client.query(
        'UPDATE employee_import_batch SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING id',
        [batchId]
      );
      await client.query('COMMIT');
      if (result.rows.length === 0) {
        return err(-3, '批次不存在或已删除');
      }
      return ok({ deleted: true }, '批次删除成功');
    } catch (ex) {
      await client.query('ROLLBACK');
      throw ex;
    } finally {
      client.release();
    }
  } catch (ex) {
    return err(-1, formatDbError(ex));
  }
}

/** POST /clear-all 清空所有人员信息（危险操作，仅 admin） */
async function clearAll() {
  try {
    if (!isConnected()) return err(-1, '数据库未连接');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ⚠️ 高危操作：物理删除（非软删）。删除前请确保已执行全量备份。
      // 说明：employee 被 40 张业务表以 NO ACTION 外键引用；若业务表存在引用当前员工的记录，
      //      物理删除 employee 会被外键约束拦截并整体回滚（保证不残留半删状态）。
      //      故本操作仅在业务数据已清空（如独立测试 / staging 库）时可完整清空。
      console.warn('[ImportV2][clear-all] 执行物理清空：employee / employee_assignment / employee_import_pending / employee_import_batch');

      // 1. 物理删除所有任职关系（employee_assignment 无业务表外键引用，可先行删除）
      const delAssign = await client.query(
        'DELETE FROM employee_assignment'
      );

      // 2. 物理删除所有员工（若存在业务表 NO ACTION 外键引用则触发约束回滚）
      const delEmployee = await client.query(
        'DELETE FROM employee'
      );

      // 3. 物理删除所有导入 pending 记录
      const delPending = await client.query(
        'DELETE FROM employee_import_pending'
      );

      // 4. 物理删除所有导入批次
      const delBatch = await client.query(
        'DELETE FROM employee_import_batch'
      );

      await client.query('COMMIT');
      return ok({
        employeeCount: delEmployee.rowCount,
        assignmentCount: delAssign.rowCount,
        pendingCount: delPending.rowCount,
        batchCount: delBatch.rowCount,
      }, '人员信息已物理清空（如被外键拦截请先清理业务表引用）');
    } catch (ex) {
      await client.query('ROLLBACK');
      const msg = String(ex.message || ex);
      // 兼容中英文 PG 外键约束错误（本库 locale 为中文：在 "X" 上的...违反了在 "Y" 上的外键约束）
      if (msg.includes('foreign key') || msg.includes('violates foreign key constraint') || msg.includes('外键约束') || msg.includes('违反')) {
        const m = msg.match(/(?:违反了在|violates) "([^"]+)" 上的外键约束|on table "([^"]+)"/i);
        const tbl = (m && (m[1] || m[2])) || '';
        const detail = tbl ? `（被表 ${tbl} 引用）` : '';
        throw new Error(`清空失败：员工数据被其他业务表引用${detail}，请先清理相关业务数据后再执行清空`);
      }
      throw ex;
    } finally {
      client.release();
    }
  } catch (ex) {
    return err(-1, formatDbError(ex));
  }
}

/** GET /clear-all-preview 级联清空预检查（只读，仅 admin） */
async function clearAllPreview() {
  try {
    if (!isConnected()) return err(-1, '数据库未连接');

    const client = await pool.connect();
    try {
      // 动态获取 employee 的所有子表（FK 审计，禁止硬编码不存在表名）
      const fkRes = await client.query(`
        SELECT DISTINCT c.relname AS tbl,
          CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'n' THEN 'SET NULL' ELSE con.confdeltype::text END AS del_rule
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        WHERE con.contype = 'f'
          AND con.confrelid = (SELECT oid FROM pg_class WHERE relname='employee' AND relnamespace='public'::regnamespace)
      `);

      // 按表去重：同一张表若同时有 NO ACTION 与 SET NULL 外键（如 employee_assignment），
      // 归为 NO ACTION 一类（因其必须在删除 employee 前清空），避免重复计数。
      const tblRule = new Map();
      for (const row of fkRes.rows) {
        const cur = tblRule.get(row.tbl);
        if (!cur || (cur === 'SET NULL' && row.del_rule === 'NO ACTION')) {
          tblRule.set(row.tbl, row.del_rule);
        }
      }

      const noAction = {};
      const setNull = {};
      let noActionTotal = 0;
      let noActionCount = 0;
      let setNullTotal = 0;
      let setNullCount = 0;

      for (const [tbl, rule] of tblRule) {
        const cnt = parseInt((await client.query(`SELECT COUNT(*) AS c FROM ${tbl}`)).rows[0].c, 10);
        if (rule === 'NO ACTION') {
          noAction[tbl] = cnt;
          noActionTotal += cnt;
          noActionCount += 1;
        } else {
          setNull[tbl] = cnt;
          setNullTotal += cnt;
          setNullCount += 1;
        }
      }

      // core 仅含非 employee 子表的3张核心表（employee_assignment 属子表，已在子表层统计）
      const core = {
        employee: parseInt((await client.query('SELECT COUNT(*) AS c FROM employee')).rows[0].c, 10),
        employee_import_pending: parseInt((await client.query('SELECT COUNT(*) AS c FROM employee_import_pending')).rows[0].c, 10),
        employee_import_batch: parseInt((await client.query('SELECT COUNT(*) AS c FROM employee_import_batch')).rows[0].c, 10),
      };
      const coreTotal = core.employee + core.employee_import_pending + core.employee_import_batch;

      return ok({
        layers: { noAction, setNull, core },
        summary: {
          noActionTableCount: noActionCount,
          setNullTableCount: setNullCount,
          noActionTotal,
          setNullTotal,
          coreTotal,
          grandTotal: noActionTotal + setNullTotal + coreTotal,
        },
      }, '预检查完成');
    } finally {
      client.release();
    }
  } catch (ex) {
    return err(-1, formatDbError(ex));
  }
}

/** POST /clear-all-cascade 级联清空所有人员信息（危险操作，仅 admin） */
async function clearAllCascade() {
  try {
    if (!isConnected()) return err(-1, '数据库未连接');

    const client = await pool.connect();
    try {
      // 备份保护：强制要求已存在 backup_97_* 或 backup_98_* 逻辑备份表
      const bk97 = parseInt((await client.query("SELECT COUNT(*) AS c FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'backup_97_%'")).rows[0].c, 10);
      const bk98 = parseInt((await client.query("SELECT COUNT(*) AS c FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'backup_98_%'")).rows[0].c, 10);
      if (bk97 === 0 && bk98 === 0) {
        return err(-1, '未检测到逻辑备份表（backup_97_* / backup_98_*），请先执行诊断备份后再清空');
      }

      await client.query('BEGIN');

      // 动态获取 employee 的全部子表（FK 审计，禁止硬编码不存在表名）
      const fkRes = await client.query(`
        SELECT DISTINCT c.relname AS tbl,
          CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'n' THEN 'SET NULL' ELSE con.confdeltype::text END AS del_rule
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        WHERE con.contype = 'f'
          AND con.confrelid = (SELECT oid FROM pg_class WHERE relname='employee' AND relnamespace='public'::regnamespace)
      `);
      // 按表去重：同一张表若存在多个指向 employee 的外键，只删除一次
      const childTables = [...new Map(fkRes.rows.map((r) => [r.tbl, r])).values()];

      const stats = {};

      // 第1层：清除所有被 employee 引用的子表（解除硬引用）。
      // hse_deduction_adjustment / hse_assessment_audit_log 有防改触发器，需先禁用再删除再启用。
      const protectedTriggers = ['hse_deduction_adjustment', 'hse_assessment_audit_log'];
      for (const t of protectedTriggers) {
        await client.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
      }
      for (const row of childTables) {
        const r = await client.query(`DELETE FROM ${row.tbl}`);
        stats[row.tbl] = r.rowCount;
      }
      for (const t of protectedTriggers) {
        await client.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
      }

      // 第2层：清除人员核心表（employee 此时已无 NO ACTION 引用，可删除）
      const rEmp = await client.query('DELETE FROM employee');
      stats.employee = rEmp.rowCount;

      // 第3层：清除导入 pending / batch（pending 引用 batch，先删 pending）
      const rPending = await client.query('DELETE FROM employee_import_pending');
      stats.employee_import_pending = rPending.rowCount;
      const rBatch = await client.query('DELETE FROM employee_import_batch');
      stats.employee_import_batch = rBatch.rowCount;

      await client.query('COMMIT');
      console.warn('[ImportV2][clear-all-cascade] 级联清空完成', stats);
      return ok(stats, '人员信息已级联清空（含全部业务引用数据，不可逆，请确认已备份）');
    } catch (ex) {
      await client.query('ROLLBACK');
      const msg = String(ex.message || ex);
      if (msg.includes('foreign key') || msg.includes('外键约束') || msg.includes('违反') || msg.includes('violates')) {
        const m = msg.match(/(?:违反了在|violates) "([^"]+)" 上的外键约束|on table "([^"]+)"/i);
        const tbl = (m && (m[1] || m[2])) || '';
        throw new Error(`级联清空失败（已回滚）：仍有业务表 ${tbl || '未知'} 引用员工数据，请检查更深层级的外键`);
      }
      throw new Error(`级联清空失败（已回滚）：${msg}`);
    } finally {
      client.release();
    }
  } catch (ex) {
    return err(-1, `级联清空失败：${ex.message || ex}`);
  }
}

/** GET /source-files 列出来源目录 Excel 文件，按修改时间由近到远排序 */
async function sourceFiles() {
  try {
    let files = [];
    try {
      files = fs.readdirSync(SOURCE_DIR, { withFileTypes: true }).filter((d) => d.isFile());
    } catch (e) {
      return err(-1, `来源目录不存在或不可读：${e.message}`);
    }

    // 查询已导入的文件名（一次查全，避免循环）
    const importedRows = await pool.query(
      `SELECT DISTINCT file_name, MAX(id) AS batch_id FROM employee_import_batch
       WHERE file_name = ANY($1) AND is_deleted = false
       GROUP BY file_name`,
      [files.map((f) => f.name)]
    );
    const importedMap = new Map(importedRows.rows.map((r) => [r.file_name, r.batch_id]));

    const list = files
      .filter((f) => /\.(xlsx|xls)$/i.test(f.name))
      .map((f) => {
        try {
          const st = fs.statSync(path.join(SOURCE_DIR, f.name));
          return {
            fileName: f.name,
            size: st.size,
            mtime: st.mtime,
            imported: importedMap.has(f.name),
            batchId: importedMap.get(f.name) || null,
          };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

    return ok({ directory: SOURCE_DIR, list }, '来源目录文件列表获取成功');
  } catch (ex) {
    return err(-1, `获取来源目录失败：${ex.message}`);
  }
}

/** POST /source/import 从来源目录导入指定 Excel，并自动「确认入库」 */
async function sourceImport(body, user, ip) {
  const { fileName } = body || {};
  const filePath = safeSourcePath(fileName);
  if (!filePath) return err(-3, '非法文件名');
  if (!fs.existsSync(filePath)) return err(-3, `来源目录中不存在该文件：${fileName}`);

  // 若该文件已导入过，禁止重复覆盖
  const exists = await pool.query(
    `SELECT id FROM employee_import_batch WHERE file_name = $1 AND is_deleted = false LIMIT 1`,
    [path.basename(filePath)]
  );
  if (exists.rows.length > 0) {
    return err(-3, `该文件已导入过（批次ID：${exists.rows[0].id}），如需重新导入请先删除对应批次`);
  }

  try {
    const created = await createImportBatchFromWorkbook({
      filePath,
      fileName: path.basename(filePath),
      username: user?.username,
      ip,
      importSource: 'source_dir',
    });

    // 自动确认入库（仅入库 approved 行；异常行保留待审）
    const imported = await performBatchImport(created.batchId, {
      username: user?.username,
      ip,
    });

    return ok({
      ...created,
      import: imported,
    }, imported.failedCount > 0 ? '导入并入库完成（含失败行，异常行待审）' : '导入并自动入库完成');
  } catch (ex) {
    if (ex.code === 'DONE' || ex.code === 'EMPTY' || ex.code === 'NOT_FOUND') {
      return err(-3, ex.message);
    }
    return err(-1, `导入失败：${ex.message}`);
  }
}

module.exports = {
  upload,
  batches,
  batchPreview,
  batchPending,
  pendingResolve,
  batchImport,
  deleteBatch,
  clearAll,
  clearAllPreview,
  clearAllCascade,
  sourceFiles,
  sourceImport,
};