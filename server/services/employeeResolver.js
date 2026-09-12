/**
 * 共享人员主数据解析器（任务2，提示词08）。
 *
 * 人员保险的唯一关联键是 employee.id（对外 employeeId，库字段 employee_id）。
 * 姓名/部门/岗位只作快照与附加一致性校验，禁止按姓名自动关联。
 *
 * 调用入口（必须复用本模块，禁止复制查询逻辑）：
 *   - 单条创建 POST /api/insurance/personnel
 *   - 直接导入 POST /api/insurance/personnel/import
 *   - 通用导入 /api/import/confirm（personnel 模块预处理）
 *
 * 稳定返回：{ employee } 或 { reason }。reason 取值见下表：
 *   missing_employee_id      缺少 employeeId/employeeCode/idCard
 *   employee_not_found       零候选（不存在或已离职/删除）
 *   employee_multiple_candidates  工号多候选
 *   id_code_conflict         employeeId 与 employeeCode/idCard 指向不同员工
 *   lookup_failed            查询异常（fail-closed，禁止吞异常继续写库）
 *
 * 查询失败必须 fail-closed：当前行不得继续 INSERT/UPDATE；详细异常只写服务端日志，
 * 外部响应只返回稳定 reason 与安全中文提示（由调用方映射）。
 */
const { pool } = require('../config/db');
const { hashSensitive } = require('../utils/encryption');

/**
 * 解析 employeeId/employeeCode/idCard 为当前员工；
 * 多个键同时提供时必须指向同一员工。
 * idCard 为明文身份证号：id_card 密文无法等值查询（AES-GCM 随机 IV），
 * 故按 HMAC-SHA256 确定性哈希匹配 employee.id_card_hash（见 utils/encryption.hashSensitive）。
 */
async function resolveEmployee({ employeeId, employeeCode, idCard } = {}, { logger = console } = {}) {
  const hasCode = employeeCode != null && String(employeeCode).trim() !== '';
  const hasId = employeeId != null && employeeId !== '';
  const hasCard = idCard != null && String(idCard).trim() !== '';
  if (!hasCode && !hasId && !hasCard) return { reason: 'missing_employee_id' };

  let byCode = null;
  let byId = null;
  let byCard = null;
  try {
    if (hasCode) {
      const r = await pool.query(
        'SELECT employee_id, employee_code, name, org_name, position_name FROM v_employee_current WHERE employee_code = $1 AND employee_deleted = false',
        [String(employeeCode).trim()]
      );
      if (r.rows.length === 0) return { reason: 'employee_not_found' };
      if (r.rows.length > 1) return { reason: 'employee_multiple_candidates' };
      byCode = r.rows[0];
    }
    if (hasId) {
      const id = parseInt(employeeId, 10);
      if (!Number.isInteger(id) || id <= 0) return { reason: 'employee_not_found' };
      const r = await pool.query(
        'SELECT employee_id, employee_code, name, org_name, position_name FROM v_employee_current WHERE employee_id = $1 AND employee_deleted = false',
        [id]
      );
      if (r.rows.length === 0) return { reason: 'employee_not_found' };
      byId = r.rows[0];
    }
    if (hasCard) {
      const cardHash = hashSensitive(String(idCard).trim());
      if (!cardHash) return { reason: 'employee_not_found' };
      // id_card 为 ENC 密文（AES-GCM 随机 IV），只能走确定性哈希等值匹配
      const r = await pool.query(
        `SELECT ev.employee_id, ev.employee_code, ev.name, ev.org_name, ev.position_name
         FROM v_employee_current ev
         JOIN employee em ON em.id = ev.employee_id
         WHERE em.id_card_hash = $1 AND em.is_deleted = false AND ev.employee_deleted = false`,
        [cardHash]
      );
      if (r.rows.length === 0) return { reason: 'employee_not_found' };
      if (r.rows.length > 1) return { reason: 'employee_multiple_candidates' };
      byCard = r.rows[0];
    }
  } catch (e) {
    // fail-closed：查询异常不得放行该行写库；异常详情仅服务端日志
    if (logger && typeof logger.error === 'function') {
      logger.error('[employeeResolver] 人员查询失败:', e && e.message);
    } else {
      console.error('[employeeResolver] 人员查询失败:', e && e.message);
    }
    return { reason: 'lookup_failed' };
  }

  // 同时提供多个键：必须指向同一员工，否则拒绝（不静默优先其一）
  const candidates = [byCode, byId, byCard].filter(Boolean);
  if (candidates.length > 1) {
    const distinctIds = new Set(candidates.map((c) => c.employee_id));
    if (distinctIds.size > 1) {
      return { reason: 'id_code_conflict' };
    }
  }
  return { employee: candidates[0] || null };
}

/**
 * 按登录用户真实姓名解析员工（Sprint-WPS-02 身份链路 · 姓名兜底）。
 *
 * 前提：users 表没有 employeeId / employeeCode 等稳定绑定字段，故身份链走到
 * 「姓名兜底」这一级。本方法只在 v_employee_current 上做「严格一对一」匹配：
 *   0 条 → employee_not_found；>1 条 → employee_multiple_candidates；仅 1 条 → 命中。
 * 绝不自动取第一条（fail-closed）。
 *
 * 注意：v_employee_current 本身 DISTINCT ON (e.id)（每位员工至多一行，且仅当前
 * 主任职），因此「>1 条」的含义是「同名的多位员工」，而不是同一员工的多条任职。
 *
 * 返回 { employee }：employee 为 v_employee_current 的完整当前行（含 assignment_id /
 * org_name / unit_name / position_name 等，供上层组装当前员工上下文）或 null；
 * 失败时返回 { reason }，reason 复用 resolveEmployee 同款取值。
 */
async function resolveEmployeeByName(name, { logger = console } = {}) {
  const n = name == null ? '' : String(name).trim();
  if (!n) return { reason: 'missing_employee_id' };
  try {
    const r = await pool.query(
      `SELECT employee_id, employee_code, name, gender, phone, person_category,
              assignment_id, org_name, org_code, unit_name, unit_code,
              position_name, position_code, assignment_status, supervisor_name,
              is_current, is_primary, start_date, end_date, employee_deleted
       FROM v_employee_current
       WHERE BTRIM(name) = BTRIM($1) AND employee_deleted = false`,
      [n]
    );
    if (r.rows.length === 0) return { reason: 'employee_not_found' };
    if (r.rows.length > 1) return { reason: 'employee_multiple_candidates' };
    return { employee: r.rows[0] };
  } catch (e) {
    // fail-closed：查询异常不得放行；异常详情仅服务端日志
    if (logger && typeof logger.error === 'function') {
      logger.error('[employeeResolver] 姓名解析失败:', e && e.message);
    } else {
      console.error('[employeeResolver] 姓名解析失败:', e && e.message);
    }
    return { reason: 'lookup_failed' };
  }
}

/** 姓名附加一致性校验（不单独命中；提供姓名且与主数据不一致才拒绝） */
function isNameConsistent(providedName, employee) {
  if (!providedName || !employee || !employee.name) return true; // 未提供姓名 → 不校验
  return String(providedName).trim() === String(employee.name).trim();
}

module.exports = { resolveEmployee, resolveEmployeeByName, isNameConsistent };
