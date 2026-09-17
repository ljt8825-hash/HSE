/**
 * 规则引擎 · 三违扣分对象传递解析（P2-B1-E-08-04 / R2→R2-FIX→R4→R4-FIX 责任人解析）
 *
 * 业务冻结口径（R4 冻结，2026-09-14；R4-FIX 增补确认责任人优先级）：
 *   公司检查发现三违后，按「被检查人岗位」确定扣分对象：
 *     A. 保洁员           → 实际责任管理员 + 实际责任乡镇作业中心经理
 *     B. 管理员           → 管理员本人 + 实际责任乡镇作业中心经理
 *     C. 乡镇作业中心经理 → 仅本人
 *     D.【R4-FIX 优先；R4-FIX-SCOPE 收敛】违规者直接上级 = 某条确认责任关系的
 *       responsible_employee_id 且违规者本人 ∈ 该条关系 subordinate_employee_ids
 *       （system_settings assessment.confirmed_responsibility_targets.
 *       confirmed_relations，双重匹配）且为有效人员 → 该上级即唯一实际责任人
 *       （单一目标，跳过默认模板）。确认的是「责任关系事实」而非人员全局资格：
 *       不满足双重匹配者一律走默认模板。
 *       配置驱动（如：津城街道作业中心 16 名保洁员 → 于鑫宁），代码零硬编码。
 *
 * R4 责任人解析规则（本轮业务正式确认，2026-09-14）：
 *   - 「实际责任管理员」= 被检查人在 employee_assignment.supervisor_id 中的直接上级
 *     （经 v_employee_org_full.supervisor_id 暴露），且该上级为当前有效人员。
 *   - 【R4 §二.1】经理直接管理保洁员 = 正式责任关系：保洁员直接上级为同组织有效
 *     乡镇作业中心经理时，该经理即实际责任人（原 R2-FIX 的 MANAGER_DIRECT_SUPERVISOR
 *     待确认终态经业务确认转为正式 RESOLVED）。同一经理同时填充「管理员」与「经理」
 *     两个 wanted 槽位时，按 employee_id 去重 → 一个实际责任人 = 一个责任目标。
 *   - 【R4 §四】津城街道 16 名保洁员 → 于鑫宁：经业务确认的正式 supervisor 关系。
 *     直接上级为有效人员但跨组织时（管理员槽位），按正式 supervisor_id 关系解析
 *     （evidence 显式标记 crossOrg，可审计）；经理槽位仍要求同组织（两跳链不变）。
 *   - 【R4 §七 第一层】人员有效状态（冻结口径，R3 确认）：
 *       有效 ⇔ employment_relation = '正式员工'；
 *       辞职 / 死亡 / 其他（含 NULL，如已确认的 119 名非在册人员）均不属于当前
 *       在职责任人员候选池 → INVALID_TARGET。leave_date / person_type 不参与判定、
 *       不得覆盖本规则。
 *   - 四态结果（fail-closed，绝不自动选人/全量扣分）：
 *       RESOLVED       唯一确定
 *       AMBIGUOUS      多候选无法唯一
 *       UNRESOLVED     无可靠责任关系
 *       INVALID_TARGET 候选人员不属于当前在职责任池（辞职/死亡/非正式员工）
 *   - 每个 wanted 岗位独立解析（部分成功允许：管理员解析失败不影响已唯一确定的经理），
 *     任何纳入扣分的对象都必须有唯一、正式身份依据。
 *   - supervisor 链经理槽位要求同组织（两跳：保洁员→管理员→经理）；
 *     org-unique-valid 仍为 FALLBACK 证据（R2-FIX 降级语义保持），
 *     环卫作业中心 2 名在职经理 → 多候选 AMBIGUOUS（R4 §五：不自动归属）。
 *
 * 硬性约束：
 *   - 岗位从正式人员/组织数据解析，禁止按姓名猜测、禁止 area_team 推导、禁止系统角色替代。
 *   - transmission_config 存于规则行（现有列），规则变化改数据库配置、不改代码。
 *   - 未配置 transmission_config 的规则 → 完全回退历史行为（扣违规者本人），零漂移。
 *
 * 配置结构（transmission_config JSONB）：
 *   {
 *     "only_check_source": "company",
 *     "by_violator_position": { "保洁员": ["管理员","乡镇作业中心经理"], ... },
 *     "fallback": "skip"
 *   }
 */

const { pool } = require('../../config/db');
const { loadConfirmedResponsibilityRelations } = require('../assessmentTargetEligibility');

// ---------------------------------------------------------------------------
// P2-B1-E-08-11 目标层级角色（helmet 分层扣分依据；配置驱动，不改责任解析本身）：
//   self_violator     违规者本人（wanted=self 槽位解析）
//   direct_supervisor 违规者直接上级（supervisor 链一跳 / managerDirect / 跨组织一跳 /
//                     confirmed responsibility 单一责任人）
//   escalated         更高一级责任人（两跳 / org-unique-valid 兜底）
// 层级仅描述「目标相对违规者的关系」，不改变 RESOLVED/PARTIAL 等状态语义；
// 扣分分值由 adapter 按规则行 transmission_config.helmet_layer_scores 配置取用
// （如 helmet: direct=5/self=5/escalated=1），resolver 不含任何分值。
const LAYER_RANK = { self_violator: 2, direct_supervisor: 2, escalated: 1 };

function layerFromEvidence(ev) {
  if (!ev || typeof ev !== 'object') return null;
  if (ev.method === 'self') return 'self_violator';
  if (ev.hop === 2 || ev.evidenceSource === 'org-unique-valid/fallback') return 'escalated';
  return 'direct_supervisor';
}

// 人员有效状态 SQL 片段（别名 e = employee 表行）
// R4 冻结口径：有效 ⇔ employment_relation='正式员工'（辞职/死亡/NULL 一律排除；
// leave_date、person_type 不参与判定，不得覆盖本规则）。
const VALID_PERSON_SQL = (alias) =>
  `(${alias}.employment_relation = '正式员工')`;

/**
 * 视图行探查（单人）：基础信息 + supervisor 链一跳 + 有效状态
 * 返回 undefined 表示视图无此人（非现职/非在职 assignment）。
 */
async function fetchOrgRow(executor, employeeId) {
  const r = await executor.query(
    `SELECT v.employee_id, v.name, v.position_name, v.org_name, v.org_unit_id,
            v.supervisor_id, v.supervisor_name,
            e.employment_relation, e.leave_date,
            ${VALID_PERSON_SQL('e')} AS is_valid_person
       FROM v_employee_org_full v
       JOIN employee e ON e.id = v.employee_id
      WHERE v.employee_id = $1 AND v.is_current = TRUE AND v.relation_status = 'active' AND v.is_deleted = FALSE
      LIMIT 1`,
    [employeeId]
  );
  return r.rows[0];
}

/**
 * 找考核对象（cycle 内 target 行）
 */
async function findTarget(executor, cycleId, employeeId) {
  const r = await executor.query(
    `SELECT id FROM hse_assessment_target
      WHERE employee_id = $1 AND cycle_id = $2 AND is_deleted = FALSE
      LIMIT 1`,
    [employeeId, cycleId]
  );
  return r.rows.length ? Number(r.rows[0].id) : null;
}

/**
 * 单个 wanted 岗位解析（核心）
 *
 * R4 证据优先级（2026-09-14 业务冻结）：
 *   PRIMARY   = supervisor 链（employee_assignment.supervisor_id）
 *               ① 同组织有效 wanted 岗位（一跳/两跳）
 *               ② 同组织有效乡镇作业中心经理（保洁员经理直管，R4 §二.1 正式确认）
 *               ③ 跨组织有效直接上级（管理员槽位；R4 §四 业务确认的正式 supervisor
 *                  关系，evidence.crossOrg=true 可审计。经理槽位不适用）
 *   FALLBACK  = org-unique-valid（supervisor 链无法形成唯一责任关系时的兜底证据，
 *               evidence_source 显式标记 fallback；不得覆盖明确的 supervisor_id）
 *   终态（fail-closed）：
 *     UNRESOLVED(supervisor-cross-org)  经理槽位 supervisor 跨组织（关系不可靠）
 *     INVALID_TARGET                    supervisor 非当前在职责任池（非正式员工）
 *
 * @returns {Promise<object>} { status, reason, target, evidence }
 *   status ∈ RESOLVED / AMBIGUOUS / UNRESOLVED / INVALID_TARGET
 */
async function resolveWantedPosition(executor, cycleId, violator, wanted, evidence) {
  const out = (o) => ({ ...o });

  // 0) 被检查人本人即目标岗位 → 自身（含管理员扣本人 / 经理扣本人）
  if (violator.position_name === wanted) {
    if (!violator.is_valid_person) {
      return out({ status: 'INVALID_TARGET', reason: 'violator-invalid', target: null,
        evidence: { wanted, method: 'self', evidenceSource: 'self/primary', violatorValid: false } });
    }
    const targetId = await findTarget(executor, cycleId, violator.employee_id);
    if (!targetId) {
      return out({ status: 'UNRESOLVED', reason: 'no-assessment-target', target: null,
        evidence: { wanted, method: 'self', evidenceSource: 'self/primary', candidateEmployeeId: violator.employee_id } });
    }
    return out({ status: 'RESOLVED', reason: null, target: {
      employeeId: Number(violator.employee_id), name: violator.name, targetId, position: wanted,
    }, evidence: { wanted, method: 'self', evidenceSource: 'self/primary', candidateEmployeeId: violator.employee_id } });
  }

  // 1) supervisor 链（PRIMARY EVIDENCE）
  //    一跳：被检查人直接上级即 wanted 岗位（有效、同组织）
  //    两跳：仅当直接上级是有效「管理员」且 wanted=经理类岗位时，向上再跳一跳
  //          （保洁员 → 管理员 → 经理；管理员的上级=经理是实测主链 42/48）
  const hop1 = violator.supervisor_id ? await fetchOrgRow(executor, violator.supervisor_id) : null;

  if (violator.supervisor_id && !hop1) {
    // supervisor_id 指向的人不在现职视图（记录缺失/历史残留）
    return out({ status: 'UNRESOLVED', reason: 'supervisor-not-in-active-org', target: null,
      evidence: { wanted, method: 'supervisor-chain', evidenceSource: 'supervisor-chain/broken',
        supervisorId: violator.supervisor_id } });
  }

  if (hop1) {
    evidence.supervisor = { id: Number(hop1.employee_id), name: hop1.name,
      position: hop1.position_name, valid: hop1.is_valid_person, org: hop1.org_name };

    if (!hop1.is_valid_person) {
      // R4：supervisor 不属于当前在职责任池（辞职/死亡/非正式员工）→ INVALID_TARGET
      return out({ status: 'INVALID_TARGET', reason: 'supervisor-invalid', target: null,
        evidence: { wanted, method: 'supervisor-chain', evidenceSource: 'supervisor-chain/broken',
          supervisor: { id: Number(hop1.employee_id), name: hop1.name, position: hop1.position_name },
          invalidMarker: hop1.employment_relation || 'non-formal-employment' } });
    }

    const hop1SameOrg = hop1.org_name === violator.org_name;

    if (!hop1SameOrg) {
      // R4 §四：直接上级为有效人员但跨组织 —— 业务确认的正式 supervisor 关系
      // （津城街道 16 名保洁员 → 于鑫宁）。管理员槽位按正式 supervisor_id 解析，
      // evidence 显式标记 crossOrg；经理槽位仍要求同组织（跨组织经理关系不可靠）。
      if (wanted === '管理员') {
        const targetId = await findTarget(executor, cycleId, hop1.employee_id);
        if (!targetId) {
          return out({ status: 'UNRESOLVED', reason: 'no-assessment-target', target: null,
            evidence: { wanted, method: 'supervisor-chain', evidenceSource: 'supervisor-chain/primary',
              crossOrg: true, supervisorOrg: hop1.org_name, candidateEmployeeId: Number(hop1.employee_id) } });
        }
        return out({ status: 'RESOLVED', reason: null, target: {
          employeeId: Number(hop1.employee_id), name: hop1.name, targetId, position: wanted,
        }, evidence: { wanted, method: 'supervisor-chain', evidenceSource: 'supervisor-chain/primary',
          crossOrg: true, supervisorOrg: hop1.org_name,
          candidateEmployeeId: Number(hop1.employee_id) } });
      }
      // 经理槽位跨组织 → 终态 fail-closed（不落组织兜底，避免用组织唯一性覆盖
      // 一条虽存在但指向异常的正式关系）
      return out({ status: 'UNRESOLVED', reason: 'supervisor-cross-org', target: null,
        evidence: { wanted, method: 'supervisor-chain', evidenceSource: 'supervisor-chain/broken',
          supervisor: evidence.supervisor, violatorOrg: violator.org_name } });
    }

    if (hop1.position_name === wanted) {
      const targetId = await findTarget(executor, cycleId, hop1.employee_id);
      if (!targetId) {
        return out({ status: 'UNRESOLVED', reason: 'no-assessment-target', target: null,
          evidence: { wanted, method: 'supervisor-chain', evidenceSource: 'supervisor-chain/primary',
            hop: 1, candidateEmployeeId: Number(hop1.employee_id) } });
      }
      return out({ status: 'RESOLVED', reason: null, target: {
        employeeId: Number(hop1.employee_id), name: hop1.name, targetId, position: wanted,
      }, evidence: { wanted, method: 'supervisor-chain', evidenceSource: 'supervisor-chain/primary',
        hop: 1, candidateEmployeeId: Number(hop1.employee_id) } });
    }

    // R4 §二.1：在岗保洁员直接上级 = 同组织有效乡镇作业中心经理（wanted=管理员时）
    // → 「经理直接管理保洁员」= 业务正式确认的责任关系（原 R2-FIX 待确认终态
    //   MANAGER_DIRECT_SUPERVISOR 经 2026-09-14 业务确认转为正式 RESOLVED）。
    //   同一经理在「管理员」「乡镇作业中心经理」两个 wanted 槽位解析为同一 employee_id
    //   时，由上层 targets 去重 → 一个实际责任人 = 一个责任目标（禁止重复扣分）。
    if (wanted === '管理员' && hop1.position_name === '乡镇作业中心经理') {
      const targetId = await findTarget(executor, cycleId, hop1.employee_id);
      if (!targetId) {
        return out({ status: 'UNRESOLVED', reason: 'no-assessment-target', target: null,
          evidence: { wanted, method: 'supervisor-chain', evidenceSource: 'supervisor-chain/primary',
            managerDirect: true, candidateEmployeeId: Number(hop1.employee_id) } });
      }
      return out({ status: 'RESOLVED', reason: null, target: {
        employeeId: Number(hop1.employee_id), name: hop1.name, targetId, position: wanted,
      }, evidence: { wanted, method: 'supervisor-chain', evidenceSource: 'supervisor-chain/primary',
        managerDirect: true, candidateEmployeeId: Number(hop1.employee_id) } });
    }

    // 两跳：直接上级是有效管理员（同组织）且 wanted 是经理 → 管理员的上级
    if (hop1.position_name === '管理员' && wanted === '乡镇作业中心经理' && hop1.supervisor_id) {
      const hop2 = await fetchOrgRow(executor, hop1.supervisor_id);
      if (hop2) {
        evidence.supervisorChain = [{ id: Number(hop2.employee_id), name: hop2.name,
          position: hop2.position_name, valid: hop2.is_valid_person, org: hop2.org_name }];
        if (!hop2.is_valid_person) {
          return out({ status: 'INVALID_TARGET', reason: 'supervisor-chain-invalid', target: null,
            evidence: { wanted, method: 'supervisor-chain', evidenceSource: 'supervisor-chain/broken', hop: 2,
              invalid: { id: Number(hop2.employee_id), name: hop2.name, position: hop2.position_name } } });
        }
        if (hop2.position_name === wanted && hop2.org_name === violator.org_name) {
          const targetId = await findTarget(executor, cycleId, hop2.employee_id);
          if (!targetId) {
            return out({ status: 'UNRESOLVED', reason: 'no-assessment-target', target: null,
              evidence: { wanted, method: 'supervisor-chain', evidenceSource: 'supervisor-chain/primary',
                hop: 2, candidateEmployeeId: Number(hop2.employee_id) } });
          }
          return out({ status: 'RESOLVED', reason: null, target: {
            employeeId: Number(hop2.employee_id), name: hop2.name, targetId, position: wanted,
          }, evidence: { wanted, method: 'supervisor-chain', evidenceSource: 'supervisor-chain/primary',
            hop: 2, candidateEmployeeId: Number(hop2.employee_id) } });
        }
      }
    }
  }

  // 2) org-unique-valid 兜底（FALLBACK EVIDENCE）：
  //    supervisor 链无法形成唯一责任关系时，检查同组织有效 wanted 岗位唯一性。
  //    恰 1 人 → RESOLVED（evidence_source 显式标记 fallback）；0 人 → UNRESOLVED；
  //    ≥2 人 → AMBIGUOUS。绝不自动在多候选中选择
  //    （R4 §五：环卫作业中心 2 名在职经理 → AMBIGUOUS，不自动归属）。
  if (violator.org_name) {
    const orgR = await executor.query(
      `SELECT v.employee_id, v.name, v.org_name
         FROM v_employee_org_full v
         JOIN employee e ON e.id = v.employee_id
        WHERE v.position_name = $1
          AND v.is_current = TRUE AND v.relation_status = 'active' AND v.is_deleted = FALSE
          AND v.org_name = $2
          AND ${VALID_PERSON_SQL('e')}`,
      [wanted, violator.org_name]
    );
    evidence.orgCandidates = orgR.rows.map((r) => ({ id: Number(r.employee_id), name: r.name }));
    if (orgR.rows.length === 1) {
      const c = orgR.rows[0];
      const targetId = await findTarget(executor, cycleId, c.employee_id);
      if (!targetId) {
        return out({ status: 'UNRESOLVED', reason: 'no-assessment-target', target: null,
          evidence: { wanted, method: 'org-unique-valid', evidenceSource: 'org-unique-valid/fallback',
            candidateEmployeeId: Number(c.employee_id) } });
      }
      return out({ status: 'RESOLVED', reason: null, target: {
        employeeId: Number(c.employee_id), name: c.name, targetId, position: wanted,
      }, evidence: { wanted, method: 'org-unique-valid', evidenceSource: 'org-unique-valid/fallback',
        candidateEmployeeId: Number(c.employee_id) } });
    }
    if (orgR.rows.length === 0) {
      return out({ status: 'UNRESOLVED', reason: 'no-valid-candidate-in-org', target: null,
        evidence: { wanted, method: 'org-unique-valid', evidenceSource: 'org-unique-valid/fallback' } });
    }
    return out({ status: 'AMBIGUOUS', reason: 'multiple-valid-candidates-in-org', target: null,
      evidence: { wanted, method: 'org-unique-valid', evidenceSource: 'org-unique-valid/fallback',
        candidates: orgR.rows.map((r) => ({ id: Number(r.employee_id), name: r.name })) } });
  }

  // 3) 无组织信息 → fail-closed
  return out({ status: 'UNRESOLVED', reason: 'no-org-info', target: null,
    evidence: { wanted, method: 'supervisor-chain', evidenceSource: 'supervisor-chain/broken',
      supervisor: evidence.supervisor || null } });
}

/**
 * 解析一条三违记录的扣分对象集合
 *
 * @param {object} p
 * @param {number} p.cycleId                 考核周期 id
 * @param {number|string} p.violatorId       违规者 employee_id
 * @param {string|null} p.checkSource        检查来源（company/township/self/null）
 * @param {object|null} p.transmissionConfig 规则行 transmission_config
 * @param {object} [p.executor]              查询执行器（默认 pool）
 * @returns {Promise<object>}
 *   { mode: 'self' }                                  无配置 / 来源不匹配 → 扣违规者本人（历史行为）
 *   { mode: 'transmitted', status:'RESOLVED', targets, ... }   全部 wanted 岗位唯一确定
 *   { mode: 'transmitted', status:'PARTIAL', ... }             部分岗位唯一确定（其余 fail-closed 记 skipped）
 *   { mode: 'none', status, reason, skipped, evidence }        全部 fail-closed
 *
 * status ∈ RESOLVED / PARTIAL / AMBIGUOUS / UNRESOLVED / INVALID_TARGET
 *   （顶层 status 取所有 wanted 的最坏态；每岗位明细在 evidence.positions[].status）
 * 同一 employee_id 在同一事件中至多出现一次（seen 去重 → 一个实际责任人 = 一个责任目标）。
 */
async function resolveTransmissionTargets({ cycleId, violatorId, checkSource, transmissionConfig, executor = pool }) {
  const cfg = transmissionConfig && typeof transmissionConfig === 'object' ? transmissionConfig : null;
  const map = cfg && cfg.by_violator_position && typeof cfg.by_violator_position === 'object'
    ? cfg.by_violator_position
    : null;

  // 1) 未配置传递 → 历史行为（扣本人）
  if (!map || !Object.keys(map).length) return { mode: 'self' };

  // 2) 配置限定检查来源：不匹配 → 历史行为（扣本人）
  if (cfg.only_check_source && String(checkSource || '') !== String(cfg.only_check_source)) {
    return { mode: 'self' };
  }

  // 3) 解析违规者岗位/组织（正式人员-组织视图，现职+在职）
  const violator = await fetchOrgRow(executor, violatorId);
  if (!violator) {
    return { mode: 'none', status: 'UNRESOLVED', reason: 'violator-org-not-found', skipped: [], evidence: {} };
  }
  if (!violator.is_valid_person) {
    // R4 §六/§七：非「正式员工」（辞职/死亡/NULL，含 119 名已确认非在册人员）
    // 不属于当前在职责任人员候选池 → INVALID_TARGET
    return { mode: 'none', status: 'INVALID_TARGET', reason: 'violator-invalid', skipped: [], evidence: {
      violator: { id: Number(violator.employee_id), name: violator.name, position: violator.position_name },
      invalidMarker: violator.employment_relation || 'non-formal-employment',
    } };
  }

  const violatorPosition = violator.position_name || '';
  const violatorOrg = violator.org_name || '';

  // 4) 岗位未配置 → fail-closed 不扣分
  const wantedPositions = map[violatorPosition];
  if (!Array.isArray(wantedPositions) || !wantedPositions.length) {
    return {
      mode: 'none',
      status: 'UNRESOLVED',
      reason: 'position-not-configured',
      skipped: [{ position: violatorPosition, reason: 'position-not-configured' }],
      violatorPosition,
      violatorOrg,
      evidence: { violatorPosition, violatorOrg },
    };
  }

  // 4.5)【R4-FIX 优先级最高；R4-FIX-SCOPE 收敛】经正式责任关系确认的实际责任人（配置驱动）：
  //      确认的是「责任关系事实」（具体下属 → 具体实际责任人），不是人员全局资格。
  //      仅当 违规者直接上级 = 某条确认关系的 responsible_employee_id
  //        且 违规者本人 ∈ 该条关系 subordinate_employee_ids（双重匹配）
  //        且该责任人为有效人员 → 该上级即唯一责任目标（target_count=1），
  //      跳过「管理员+经理」默认模板；不满足双重匹配 → 落回默认责任解析规则（第 5 步）。
  //      津城街道作业中心 16 名保洁员 → 于鑫宁 场景；禁止代码级 id/姓名/组织硬编码。
  //      fail-closed：上级不在现职视图 → UNRESOLVED；非有效人员 → INVALID_TARGET；
  //      无考核对象行 → UNRESOLVED(no-assessment-target)。
  const confirmedRelations = await loadConfirmedResponsibilityRelations(executor);
  const violatorConfirmedRel = (violator.supervisor_id && confirmedRelations.size)
    ? confirmedRelations.get(Number(violator.supervisor_id)) : null;
  if (violatorConfirmedRel
    && violatorConfirmedRel.subordinateIds.has(Number(violator.employee_id))) {
    const hop = await fetchOrgRow(executor, violator.supervisor_id);
    const confEvidence = {
      method: 'confirmed-responsibility', evidenceSource: 'confirmed-responsibility/primary',
      confirmedResponsibility: true, supervisorId: Number(violator.supervisor_id),
      relationScope: 'confirmed-subordinate-list',
    };
    if (!hop) {
      return { mode: 'none', status: 'UNRESOLVED', reason: 'supervisor-not-in-active-org',
        skipped: [], violatorPosition, violatorOrg,
        evidence: { ...confEvidence } };
    }
    if (!hop.is_valid_person) {
      return { mode: 'none', status: 'INVALID_TARGET', reason: 'supervisor-invalid',
        skipped: [], violatorPosition, violatorOrg,
        evidence: { ...confEvidence, invalidMarker: hop.employment_relation || 'non-formal-employment' } };
    }
    const targetId = await findTarget(executor, cycleId, hop.employee_id);
    if (!targetId) {
      return { mode: 'none', status: 'UNRESOLVED', reason: 'no-assessment-target',
        skipped: [], violatorPosition, violatorOrg,
        evidence: { ...confEvidence, candidateEmployeeId: Number(hop.employee_id) } };
    }
    return {
      mode: 'transmitted',
      status: 'RESOLVED',
      targets: [{ employeeId: Number(hop.employee_id), name: hop.name, targetId,
        position: hop.position_name,
        // E-08-11：确认责任关系 = 违规者直接上级 → direct_supervisor（分层分值依据）
        resolutionLayer: 'direct_supervisor',
        layerEvidence: { hop: 1, method: 'confirmed-responsibility' } }],
      skipped: [],
      violatorPosition,
      violatorOrg,
      evidence: {
        ...confEvidence,
        supervisor: { id: Number(hop.employee_id), name: hop.name, position: hop.position_name, org: hop.org_name },
        positions: [{ wantedPosition: 'confirmed_responsibility', status: 'RESOLVED', reason: null, evidence: { ...confEvidence } }],
      },
    };
  }

  // 5) 逐 wanted 岗位独立解析（唯一责任人；部分成功允许；同 employee_id 去重）
  const targets = [];
  const skipped = [];
  const positions = [];
  const seen = new Set();
  const STATUS_RANK = { INVALID_TARGET: 0, AMBIGUOUS: 1, UNRESOLVED: 2, RESOLVED: 3 };
  let worstStatus = 'RESOLVED';
  let failReason = null;

  for (const posName of wantedPositions) {
    const wanted = String(posName || '').trim();
    if (!wanted) continue;
    const evidence = {};
    const r = await resolveWantedPosition(executor, cycleId, violator, wanted, evidence);
    positions.push({ wantedPosition: wanted, status: r.status, reason: r.reason, evidence: r.evidence });

    if (r.status === 'RESOLVED' && r.target) {
      // R4 §二.1：同一实际责任人（同 employee_id）在同一事件中只能形成一次有效责任扣分
      const layer = layerFromEvidence(r.evidence);
      if (!seen.has(r.target.employeeId)) {
        seen.add(r.target.employeeId);
        targets.push({ ...r.target, resolutionLayer: layer || 'direct_supervisor' });
      } else {
        // 同一人在多个 wanted 槽位解析成功：层级取更强者（direct/self > escalated）
        const existing = targets.find((t) => t.employeeId === r.target.employeeId);
        if (existing && layer
          && (LAYER_RANK[layer] || 0) > (LAYER_RANK[existing.resolutionLayer] || 0)) {
          existing.resolutionLayer = layer;
        }
      }
    } else {
      skipped.push({ position: wanted, reason: r.reason || r.status.toLowerCase(),
        status: r.status, evidence });
      if (STATUS_RANK[r.status] < STATUS_RANK[worstStatus]) {
        worstStatus = r.status;
        failReason = r.reason || r.status.toLowerCase();
      }
    }
  }

  const resolvedAll = positions.length > 0 && positions.every((p) => p.status === 'RESOLVED');
  const topStatus = resolvedAll ? 'RESOLVED' : (targets.length > 0 ? 'PARTIAL' : worstStatus);

  if (!targets.length) {
    return {
      mode: 'none',
      status: topStatus,
      reason: failReason || 'no-target-resolved',
      skipped,
      violatorPosition,
      violatorOrg,
      evidence: { violatorPosition, violatorOrg, positions },
    };
  }

  return {
    mode: 'transmitted',
    status: topStatus,
    targets,
    skipped,
    violatorPosition,
    violatorOrg,
    evidence: { violatorPosition, violatorOrg, positions },
    reason: failReason || undefined,
  };
}

module.exports = { resolveTransmissionTargets };
