/**
 * 当前登录员工上下文（Sprint-WPS-02 · 目标 A）
 *
 * 职责：把「当前登录用户」（JWT req.user）解析为「当前员工身份」及其当前业务快照，
 * 供网格长巡查业务（POST /api/site/grid-records 等）在写入 WPS 前确定巡查人员身份。
 *
 * 设计约束（Sprint 硬约束）：
 *   - 登录与 JWT 一律不改；本模块只“读” req.user，不触碰 auth。
 *   - 明确禁止 users.id === employee.id；employeeId 必须来自员工主数据解析。
 *   - users 表无 employeeId / employeeCode 绑定字段 → 走到「姓名兜底」：
 *     真实姓名 → v_employee_current 严格一对一匹配（复用 employeeResolver.resolveEmployeeByName）。
 *   - 姓名不是最终人员键，仅作解析候选；解析成功后才得到真实 employeeId。
 *   - Fail-Closed：无法唯一解析 employeeId，或员工无当前有效任职，一律返回失败，
 *     上层禁止继续创建巡查记录。
 *
 * 外部响应只返回安全中文提示（safeMessage），不得暴露 SQL / 内部路径 / 技术细节。
 */
const employeeResolver = require('./employeeResolver');

const MESSAGES = {
  not_authenticated: '当前登录用户未绑定有效员工档案，请联系管理员处理。',
  missing_employee_id: '当前登录用户未绑定有效员工档案，请联系管理员处理。',
  employee_not_found: '当前登录用户未绑定有效员工档案，请联系管理员处理。',
  employee_multiple_candidates: '当前登录用户名下匹配到多名员工，无法确定唯一身份，请联系管理员处理。',
  no_current_assignment: '当前员工没有有效任职关系，暂不能提交网格长巡查记录。',
  lookup_failed: '身份解析服务暂不可用，请稍后重试。',
};

/** 把内部 reason 映射为安全、稳定的中文提示（未知 reason 一律按“未绑定”处理） */
function safeMessage(reason) {
  return MESSAGES[reason] || MESSAGES.employee_not_found;
}

/**
 * 解析当前登录用户 → 当前员工上下文。
 *
 * @param {object} user  JWT req.user（须含 id 与 realName；由 authMiddleware 注入）
 * @param {{ resolver?: object, logger?: object }} [opts]
 *   resolver：默认 employeeResolver；可注入，便于单元测试模拟。
 * @returns {Promise<{ok:boolean, context?:object, reason?:string, message?:string}>}
 *   ok=true 时 context = {
 *     userId, employeeId, employeeCode, employeeName, organization,
 *     operationUnit, position, gridLevel, assignmentStatus
 *   }
 */
async function resolveCurrentEmployee(user, { resolver = employeeResolver, logger = console } = {}) {
  if (!user || !user.realName || !String(user.realName).trim()) {
    return { ok: false, reason: 'not_authenticated', message: safeMessage('not_authenticated') };
  }
  let res;
  try {
    res = await resolver.resolveEmployeeByName(user.realName, { logger });
  } catch (e) {
    if (logger && typeof logger.error === 'function') {
      logger.error('[currentEmployeeContext] 解析异常:', e && e.message);
    }
    return { ok: false, reason: 'lookup_failed', message: safeMessage('lookup_failed') };
  }
  if (!res || !res.employee) {
    const reason = (res && res.reason) || 'employee_not_found';
    return { ok: false, reason, message: safeMessage(reason) };
  }

  const emp = res.employee;
  // v_employee_current 已按 is_current/is_primary/未删除过滤；若仍是空任职，说明无当前有效任职
  if (emp.assignment_id == null) {
    return { ok: false, reason: 'no_current_assignment', message: safeMessage('no_current_assignment') };
  }

  return {
    ok: true,
    context: {
      userId: user.id,
      employeeId: emp.employee_id,
      employeeCode: emp.employee_code || '',
      employeeName: emp.name || '',
      organization: emp.org_name || '',
      operationUnit: emp.unit_name || '',
      position: emp.position_name || '',
      gridLevel: null, // v_employee_current 无网格等级列；网格等级属巡查快照，由巡查业务另记
      assignmentStatus: emp.assignment_status || '',
    },
  };
}

module.exports = { resolveCurrentEmployee, safeMessage };