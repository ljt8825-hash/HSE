/**
 * 阶段1：正式认证用户 → 员工 身份解析链（唯一权威身份入口）
 *
 * 链路（严禁旁路）：
 *   req.user.id
 *     → public.users.id
 *     → public.users.employee_id
 *     → public.employee.id
 *
 * 设计红线：
 *   1. 严禁姓名兜底。禁止 realName → employee.name、模糊匹配、姓名+部门、姓名+手机、
 *      同名任选其一等一切猜测行为。users.employee_id 为 NULL 即失败，不做任何回退。
 *   2. Fail-Closed：任一步失败立即返回失败结果，不得返回"部分身份"或"疑似身份"。
 *   3. 不改 JWT / 不改 auth / 不改 login：employee_id 不进 JWT，每次实时查库解析，
 *      保证账号与员工的绑定关系变更可即时生效。
 *   4. 显式 schema（public.users / public.employee），不依赖 search_path，避免 schema 歧义。
 *   5. 不修改任何数据：本模块只有 SELECT。
 *
 * 与既有解析器的关系：
 *   - services/employeeResolver.js（工号/姓名解析，供人员保险等旧业务）
 *   - services/currentEmployeeContext.js（姓名兜底，供 WPS 网格巡查既有链路）
 *   两者均为既有业务，本模块不替代、不修改、不复用其姓名逻辑；
 *   阶段2 起新建的「当前登录用户 → 巡查人员」链路必须走本模块。
 *
 * 返回约定（与 currentEmployeeContext 同风格，避免 throw 打断业务路由）：
 *   成功：{ ok: true, userId, employeeId, employeeName }
 *   失败：{ ok: false, code, httpStatus, message }  // message 为安全中文提示，不含技术细节
 */
const { pool } = require('../config/db');

/** 失败码 → HTTP 状态码 + 安全中文提示（对外不暴露 SQL / 内部细节） */
const FAIL_CODES = {
  AUTH_USER_REQUIRED: {
    code: 'AUTH_USER_REQUIRED',
    httpStatus: 401,
    message: '未获取到登录身份，请重新登录后再操作。',
  },
  AUTH_USER_NOT_FOUND: {
    code: 'AUTH_USER_NOT_FOUND',
    httpStatus: 401,
    message: '当前登录账号不存在或已停用，请联系管理员处理。',
  },
  EMPLOYEE_NOT_BOUND: {
    code: 'EMPLOYEE_NOT_BOUND',
    httpStatus: 403,
    message: '当前登录账号未绑定员工档案，请联系管理员完成绑定。',
  },
  EMPLOYEE_NOT_FOUND: {
    code: 'EMPLOYEE_NOT_FOUND',
    httpStatus: 409,
    message: '当前登录账号绑定的员工档案不存在，请联系管理员处理。',
  },
  EMPLOYEE_DELETED: {
    code: 'EMPLOYEE_DELETED',
    httpStatus: 409,
    message: '当前登录账号绑定的员工档案已失效，请联系管理员处理。',
  },
  IDENTITY_LOOKUP_FAILED: {
    code: 'IDENTITY_LOOKUP_FAILED',
    httpStatus: 503,
    message: '身份解析服务暂不可用，请稍后重试。',
  },
};

function fail(code, extra) {
  const spec = FAIL_CODES[code] || FAIL_CODES.IDENTITY_LOOKUP_FAILED;
  return Object.assign({ ok: false, code: spec.code, httpStatus: spec.httpStatus, message: spec.message }, extra || {});
}

/** 归一化并校验 userId：必须是正整数（users.id 为 integer） */
function normalizeUserId(raw) {
  if (raw == null || raw === '') return null;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * 核心：按认证用户 ID 解析员工身份。
 *
 * @param {number|string} userId 认证用户 ID（来自 req.user.id）
 * @param {{ client?: object, logger?: object }} [opts]
 *   client：外部事务连接（测试用；传入后所有查询走该连接，便于 ROLLBACK）
 *   logger：默认 console；异常详情仅写服务端日志，不回传客户端
 * @returns {Promise<object>} 见文件头返回约定
 */
async function resolveAuthenticatedEmployee(userId, { client, logger = console } = {}) {
  const db = client || pool;

  // Step 1：必须有认证用户 ID
  const uid = normalizeUserId(userId);
  if (uid == null) return fail('AUTH_USER_REQUIRED');

  // Step 2/3：public.users.employee_id（显式 schema，必须 is_active）
  let userRow;
  try {
    const r = await db.query(
      'SELECT id, employee_id FROM public.users WHERE id = $1 AND is_active = true',
      [uid]
    );
    userRow = r.rows[0];
  } catch (e) {
    if (logger && typeof logger.error === 'function') {
      logger.error('[authenticatedEmployeeResolver] 用户查询失败:', e && e.message);
    }
    return fail('IDENTITY_LOOKUP_FAILED');
  }
  if (!userRow) return fail('AUTH_USER_NOT_FOUND');
  if (userRow.employee_id == null) return fail('EMPLOYEE_NOT_BOUND');

  // Step 4：校验 employee.id 确实存在（且未失效）
  const empId = normalizeUserId(userRow.employee_id);
  if (empId == null) return fail('EMPLOYEE_NOT_BOUND');

  let empRow;
  try {
    const r = await db.query(
      'SELECT id, name, is_deleted FROM public.employee WHERE id = $1',
      [empId]
    );
    empRow = r.rows[0];
  } catch (e) {
    if (logger && typeof logger.error === 'function') {
      logger.error('[authenticatedEmployeeResolver] 员工查询失败:', e && e.message);
    }
    return fail('IDENTITY_LOOKUP_FAILED');
  }
  if (!empRow) return fail('EMPLOYEE_NOT_FOUND');
  if (empRow.is_deleted === true) return fail('EMPLOYEE_DELETED');

  return {
    ok: true,
    userId: uid,
    employeeId: Number(empRow.id),
    employeeName: empRow.name || '',
  };
}

/**
 * 从 Express 请求解析（阶段2 起 grid-records 等路由的推荐入口）。
 * 只读取 req.user.id，不触碰 auth/JWT。
 *
 * @param {object} req Express Request（authMiddleware 注入 req.user）
 * @param {{ client?: object, logger?: object }} [opts]
 */
async function resolveAuthenticatedEmployeeFromRequest(req, opts = {}) {
  const userId = req && req.user ? req.user.id : null;
  return resolveAuthenticatedEmployee(userId, opts);
}

module.exports = {
  FAIL_CODES,
  resolveAuthenticatedEmployee,
  resolveAuthenticatedEmployeeFromRequest,
};
