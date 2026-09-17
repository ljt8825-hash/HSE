/**
 * 考核责任目标资格 · 确认责任关系配置模块（P2-B1-E-08-04-R4-FIX → R4-FIX-SCOPE 收敛版）
 *
 * 单一事实源：system_settings 表
 *   setting_key   = 'assessment.confirmed_responsibility_targets'
 *   setting_value = JSON 字符串
 *     {
 *       "confirmed_relations": [
 *         {
 *           "responsible_employee_id": <实际责任人 employee_id>,
 *           "subordinate_employee_ids": [<已确认的具体下属 employee_id>, ...],
 *           "mode": "sole_target"
 *         }, ...
 *       ],
 *       "remark": "业务确认记录（谁确认、范围、日期）"
 *     }
 *
 * 业务语义（R4-FIX-SCOPE 冻结，2026-09-14）：
 *   确认的是「责任关系事实」（具体下属 → 具体实际责任人），不是「人员全局资格」：
 *   1. 【责任解析】仅当违规者同时满足
 *        a) 其直接上级（employee_assignment.supervisor_id）= 某条确认关系的
 *           responsible_employee_id；且
 *        b) 违规者本人 employee_id ∈ 该条关系的 subordinate_employee_ids
 *      且该责任人为当前有效人员（正式员工）时，该上级即唯一实际责任人
 *      → 单一责任目标（target_count=1），不再套用「管理员 + 乡镇作业中心经理」
 *      默认岗位责任模板。不满足 a+b 的人员一律走默认责任解析规则。
 *      （津城街道作业中心 16 名保洁员 → 于鑫宁(6702) 业务确认场景；
 *        未来新增人员须通过正式责任关系确认并更新本配置后才能进入 confirmed
 *        responsibility —— 不存在「被安排给某责任人即自动继承」的隐式规则。）
 *   2. 【考核目标资格】默认岗位白名单（乡镇作业中心经理 / 管理员@town_center /
 *      网格长）保持不变；作为确认责任关系中的 responsible_employee_id（mode=sole_target）
 *      的有效人员，即使岗位不在白名单内，也具备考核责任目标资格
 *      （evidence：confirmed responsibility target，而非 job whitelist match）。
 *      注意：资格仅由「确认责任关系」产生，不是全局无条件资格。
 *
 * fail-safe：配置缺失/结构不符/解析失败 → 关系集视为空 → 完全回退默认行为
 *            （责任解析走默认模板、考核目标走岗位白名单），绝不因配置异常
 *            扩大或缩小责任面。
 */

const CONFIRMED_SETTING_KEY = 'assessment.confirmed_responsibility_targets';

/**
 * 解析配置行 → 确认责任关系列表。
 * 结构守卫：非数组/缺字段/类型错误的条目跳过（fail-safe，部分坏条目不影响其他条目）。
 * @returns {Array<{responsibleId:number, subordinateIds:Set<number>, mode:string}>}
 */
function parseConfirmedRelations(cfg) {
  const list = cfg && Array.isArray(cfg.confirmed_relations) ? cfg.confirmed_relations : [];
  const out = [];
  for (const rel of list) {
    if (!rel || typeof rel !== 'object') continue;
    const responsibleId = Number(rel.responsible_employee_id);
    if (!Number.isFinite(responsibleId) || responsibleId <= 0) continue;
    if (!Array.isArray(rel.subordinate_employee_ids)) continue;
    const subordinateIds = new Set(
      rel.subordinate_employee_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    );
    if (!subordinateIds.size) continue;
    out.push({ responsibleId, subordinateIds, mode: String(rel.mode || 'sole_target') });
  }
  return out;
}

/**
 * 【P2-B1-E-08-04-R4-FIX-SYNC-EMPLOYMENT-GATE】考核对象在职资格门禁（R4 冻结口径统一）
 *
 * 背景（2026-09-14 生产 CHECKPOINT-6 事故）：v_employee_org_full.relation_status 来自
 * employee_assignment.status（组织关系状态），与雇佣状态脱钩 —— 辞职/死亡人员的当前
 * 任职行仍为 'active'，导致考核对象同步层把非在职人员误判为在职并批量纳入。
 *
 * R4 冻结口径（不新建口径，与 violationTargetResolver 有效人员判定完全一致）：
 *   employee.employment_relation = '正式员工' ⇔ 在职 / 具备考核对象资格；
 *   辞职 / 死亡 / NULL / 其他任何值 → 不具备资格。
 *
 * 用法：在别名 v = v_employee_org_full 的同步 SQL 中，与 relation_status='active'
 * 并列追加 `AND ${FORMAL_EMPLOYEE_ELIGIBILITY_SQL}`。
 * 作用域限定：仅「新进入考核对象」的资格判定路径（正向插入 / 手动添加）。
 * 反向清理分支的保留语义不使用本门禁（历史周期既有行的移除属独立业务决策，
 * 且 hse_assessment_deduction.target_id 外键无级联，强删有扣分引用的历史对象会硬失败）。
 */
const FORMAL_EMPLOYEE_ELIGIBILITY_SQL = `
    EXISTS (
      SELECT 1 FROM employee fe
       WHERE fe.id = v.employee_id
         AND fe.is_deleted = FALSE
         AND fe.employment_relation = '正式员工'
    )`;

/**
 * SQL 片段（别名 v = v_employee_org_full）：
 * 判定「v.employee_id 是某条确认责任关系（mode=sole_target）的实际责任人」。
 * 供三处考核对象同步 SQL 复用（assessmentScheduler.syncAssessmentTargets 正/反向、
 * assessmentMonthlyTargetService.syncTargets 正/反向、
 * assessmentMonthlyCycleService.startCycle 正向）。
 * NULLIF 守卫空串；配置行缺失 → COALESCE 空对象 → 无确认关系（默认行为）。
 */
const CONFIRMED_TARGET_ELIGIBILITY_SQL = `
    v.employee_id IN (
      SELECT (rel ->> 'responsible_employee_id')::bigint
        FROM jsonb_array_elements(
          COALESCE(
            NULLIF((SELECT setting_value FROM system_settings
                    WHERE setting_key = '${CONFIRMED_SETTING_KEY}' LIMIT 1), '')::jsonb,
            '{}'::jsonb
          ) -> 'confirmed_relations'
        ) rel
       WHERE COALESCE(rel ->> 'mode', 'sole_target') = 'sole_target'
         AND rel ->> 'responsible_employee_id' ~ '^[0-9]+$'
    )`;

/**
 * JS 侧加载确认责任关系（violationTargetResolver 使用）。
 * @param {object} executor 查询执行器（pool 或事务 client）
 * @returns {Promise<Map<number, {subordinateIds:Set<number>, mode:string}>>}
 *          responsible_employee_id → 关系（异常/缺失/结构不符 → 空映射）
 */
async function loadConfirmedResponsibilityRelations(executor) {
  try {
    const r = await executor.query(
      `SELECT setting_value FROM system_settings WHERE setting_key = $1 LIMIT 1`,
      [CONFIRMED_SETTING_KEY]
    );
    if (!r.rows.length || !r.rows[0].setting_value) return new Map();
    const cfg = JSON.parse(r.rows[0].setting_value);
    const map = new Map();
    for (const rel of parseConfirmedRelations(cfg)) {
      // 同一 responsible_employee_id 多条关系时合并下属范围（业务上不应出现，防御性合并）
      const existing = map.get(rel.responsibleId);
      if (existing) {
        for (const id of rel.subordinateIds) existing.subordinateIds.add(id);
      } else {
        map.set(rel.responsibleId, rel);
      }
    }
    return map;
  } catch (e) {
    console.warn('[confirmed-responsibility] 配置加载失败，回退默认责任模板:', e.message);
    return new Map();
  }
}

module.exports = {
  CONFIRMED_SETTING_KEY,
  CONFIRMED_TARGET_ELIGIBILITY_SQL,
  FORMAL_EMPLOYEE_ELIGIBILITY_SQL,
  parseConfirmedRelations,
  loadConfirmedResponsibilityRelations,
};
