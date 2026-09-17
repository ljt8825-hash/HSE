/**
 * E-08-08 检查人身份与「公司检查 / 乡镇自查」权威判定
 *
 * 业务规则（E-08-08 规格 §三/§七，2026-09-14）：
 *   一次三违事件的责任扣分首先判断「谁发现的」：
 *     - 公司管理层检查（公司检查范围人员）→ company：进入责任扣分规则
 *       （普通三违 1 分 / 仅「不戴安全头盔」5 分，按被检查人岗位传递）；
 *     - 乡镇作业中心经理 / 管理员自查（其自身作业管理范围内）→ 自查：不产生责任扣分。
 *
 * 身份链（严禁旁路，复用现有正式身份体系，不新建身份设计）：
 *   req.user.id → public.users.id → public.users.employee_id → public.employee.id
 *   （authenticatedEmployeeResolver，fail-closed、禁姓名兜底）
 *   → v_employee_org_full（现职 active 组织行）+ employee.employment_relation（冻结口径：
 *     仅「正式员工」参与范围判定）
 *
 * 判定口径（全部由规则库 VIOLATION003 scope_config.checker_scope 配置驱动，
 * 代码零硬编码人员 id / 姓名 / 组织名 / 岗位名 —— 改库不改码）：
 *   1. 检查人组织 ∈ company_org_names            → company
 *   2. 检查人岗位 ∈ township_self_positions      → township_self（自查）
 *   3. 检查人岗位 ∈ company_position_names       → company
 *   4. 其余（无法可靠判定）                        → unknown
 *
 * 权威 check_source（authoritativeCheckSource，E-08-09 §四 fail-closed 收紧）：
 *   - scope=company      → 恒为 'company'（公司人员检查即公司查处，防止前端标注规避责任扣分）
 *   - scope=township_self→ 前端已选 'township'/'self' 时保留；前端误标 'company' 时改为 'self'
 *     （乡镇经理/管理员自查不得触发公司检查责任扣分，规格 §七）
 *   - scope=unknown / 未登录身份 → **fail-closed：有效值置 null**（前端提交值仅进审计留痕，
 *     绝不作为扣分依据；引擎侧非 company → 责任传递扣分 = 0）
 *
 * 三个概念严格区分（E-08-09 §四C，落库 check_source = effective，三值均入审计）：
 *   requested_check_source（前端提交值） / resolved_checker_scope（检查人实际身份范围） /
 *   effective_check_source（最终有效值，即本函数返回 value）
 *
 * 本模块只读（SELECT），不写任何表；不改登录 / JWT / auth / gridScope。
 */

const { pool } = require('../config/db');
const { resolveAuthenticatedEmployeeFromRequest } = require('./authenticatedEmployeeResolver');
const { getRuleByCode } = require('./ruleEngine/ruleLoader');

// 权威配置所在规则行（E-08-08：公司检查判定规则的唯一权威载体）
const RULE_CODE = 'VIOLATION003';

/**
 * 读取 checker_scope 配置（仅取规则行 scope_config.checker_scope；未配置 → null）
 * @param {object} [executor] 查询执行器（默认 pool）
 */
async function loadCheckerScopeConfig(executor = pool) {
  try {
    const rule = await getRuleByCode(RULE_CODE);
    const cfg = rule && rule.scopeConfig && rule.scopeConfig.checker_scope;
    return cfg && typeof cfg === 'object' ? cfg : null;
  } catch (e) {
    console.warn('[violation-checker-scope] checker_scope 配置读取失败，按未配置处理:', e.message);
    return null;
  }
}

/**
 * 检查人现职组织行（复用 v_employee_org_full 正式视图 + 冻结口径）。
 * 返回 undefined = 无现职 active 组织关系（非现职人员）。
 */
async function fetchCheckerOrgRow(executor, employeeId) {
  const r = await executor.query(
    `SELECT v.employee_id, v.name, v.position_name, v.org_name,
            e.employment_relation
       FROM v_employee_org_full v
       JOIN employee e ON e.id = v.employee_id
      WHERE v.employee_id = $1
        AND v.is_current = TRUE AND v.relation_status = 'active' AND v.is_deleted = FALSE
      LIMIT 1`,
    [employeeId]
  );
  return r.rows[0];
}

/**
 * 按 checker_scope 配置分类检查人范围（纯函数）
 * @returns {'company'|'township_self'|'unknown'}
 */
function classifyCheckerScope(cfg, orgRow) {
  if (!cfg || !orgRow) return 'unknown';
  // 冻结口径：仅「正式员工」属于检查人候选池（辞职/死亡/其他不参与判定）
  if (String(orgRow.employment_relation || '') !== '正式员工') return 'unknown';
  const pos = String(orgRow.position_name || '').trim();
  const org = String(orgRow.org_name || '').trim();
  if (!pos && !org) return 'unknown';
  if (Array.isArray(cfg.company_org_names) && org && cfg.company_org_names.includes(org)) {
    return 'company';
  }
  if (Array.isArray(cfg.township_self_positions) && pos && cfg.township_self_positions.includes(pos)) {
    return 'township_self';
  }
  if (Array.isArray(cfg.company_position_names) && pos && cfg.company_position_names.includes(pos)) {
    return 'company';
  }
  return 'unknown';
}

/**
 * 从 Express 请求解析检查人身份并分类（E-08-08 权威入口）
 *
 * @param {object} req Express Request（authMiddleware 注入 req.user）
 * @param {{ executor?: object }} [opts]
 * @returns {Promise<object>}
 *   ok=true:  { ok, employeeId, employeeName, positionName, orgName, scope, scopeReason }
 *   ok=false: { ok:false, scope:'unknown', reason }  —— req.user 缺失 / 未绑定员工 / 查询失败
 *   scope ∈ 'company' | 'township_self' | 'unknown'
 */
async function resolveCheckerScopeFromRequest(req, opts = {}) {
  const executor = opts.executor || pool;

  // 1) 正式身份链（fail-closed，禁姓名兜底）
  const identity = await resolveAuthenticatedEmployeeFromRequest(req);
  if (!identity.ok) {
    return { ok: false, scope: 'unknown', reason: identity.code || 'identity-unresolved' };
  }

  // 2) 现职组织行 + 范围分类
  let orgRow = null;
  try {
    orgRow = (await fetchCheckerOrgRow(executor, identity.employeeId)) || null;
  } catch (e) {
    console.warn('[violation-checker-scope] 检查人组织行查询失败:', e.message);
    return {
      ok: true, employeeId: identity.employeeId, employeeName: identity.employeeName,
      positionName: null, orgName: null, scope: 'unknown', scopeReason: 'org-lookup-failed',
    };
  }
  if (!orgRow) {
    return {
      ok: true, employeeId: identity.employeeId, employeeName: identity.employeeName,
      positionName: null, orgName: null, scope: 'unknown', scopeReason: 'checker-org-not-found',
    };
  }

  const cfg = await loadCheckerScopeConfig(executor);
  const scope = classifyCheckerScope(cfg, orgRow);
  return {
    ok: true,
    employeeId: Number(orgRow.employee_id),
    employeeName: orgRow.name || identity.employeeName,
    positionName: orgRow.position_name || null,
    orgName: orgRow.org_name || null,
    scope,
    scopeReason: scope === 'unknown' ? 'scope-not-configured-or-unmatched' : 'matched',
  };
}

/**
 * 由检查人范围推导权威 check_source（E-08-08 规格 §三/§七）
 *
 * @param {object|null} checkerRes resolveCheckerScopeFromRequest 结果
 * @param {string|null} frontendValue 前端提交的 check_source（company/township/self/null）
 * @returns {{ value: string|null, scope: string, overridden: boolean, reason: string }}
 */
function authoritativeCheckSource(checkerRes, frontendValue) {
  const fv = frontendValue || null;
  const scope = (checkerRes && checkerRes.scope) || 'unknown';

  if (checkerRes && checkerRes.ok && scope === 'company') {
    return {
      value: 'company', scope,
      overridden: fv !== 'company',
      reason: fv !== 'company'
        ? `checker-is-company-scope(frontend=${fv || 'null'})`
        : 'checker-is-company-scope',
    };
  }
  if (checkerRes && checkerRes.ok && scope === 'township_self') {
    // 乡镇经理/管理员自查：保留 township/self 标注；误标 company 一律纠正为 self
    if (fv === 'township' || fv === 'self') {
      return { value: fv, scope, overridden: false, reason: 'checker-is-township-self(kept)' };
    }
    return { value: 'self', scope, overridden: true, reason: `checker-is-township-self(frontend=${fv || 'null'}-corrected)` };
  }
  // unknown / 身份不可解析：fail-closed（E-08-09 §四B）——
  // 有效检查来源置 null（引擎侧：非 company → 不进入责任传递扣分 → responsibility deduction = 0），
  // 前端提交值仅保留在 reason 供审计留痕，绝不作为扣分计算依据。
  return {
    value: null,
    scope,
    overridden: fv !== null,
    reason: `${(checkerRes && checkerRes.reason) || (checkerRes && checkerRes.scopeReason) || 'checker-unknown'}(requested=${fv || 'null'}-fail-closed)`,
  };
}

module.exports = {
  RULE_CODE,
  loadCheckerScopeConfig,
  classifyCheckerScope,
  resolveCheckerScopeFromRequest,
  authoritativeCheckSource,
};
