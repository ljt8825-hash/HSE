/**
 * 三违候选识别与人工确认服务（P2-B1-E-06-IMPLEMENT）
 *
 * 数据流（唯一合法链路）：
 *   gir.violation_behavior 原文
 *     → sanweiBehaviorDict 匹配（精确等值 + aliases + 组合拆分）
 *     → grid_violation_candidates（pending，幂等：uq_gvc_active 部分唯一索引）
 *     → 人工确认（本服务 confirmCandidate，事务）
 *     → violation_records（source_type='grid_candidate' + candidate_id 一对一）
 *     → 规则引擎 GRIDVIOL001（仅 check_source='company' → 5 分/次）
 *
 * 硬性边界：
 *   - 永不自动确认/自动写 vr（唯一写 vr 的路径 = confirmCandidate，且必须人工触发）；
 *   - serial/person+date/行为文本均不作唯一业务身份（唯一性 = grid_record_id + behavior_id）；
 *   - inspection_source 由巡查人组织推导（fail-closed → 'unknown'），确认人可修正；
 *   - punishment 等历史字段只保留；历史 gir/vr 行零改写（vr 仅追加确认产生的增量行）；
 *   - 审计走当前事务 client 直写 audit_record（禁 auditLog()，非原子）；
 *   - 不接 scheduler，不后台跑批（生成 = 管理端显式调用）。
 */
const { pool, isConnected } = require('../config/db');
const dictSvc = require('./sanweiBehaviorDict');
// P2-B1-E-08-04：撤销即时回滚需在同一业务事务内重算考核对象得分
const scoringEngine = require('./assessmentScoringEngine');

class ApiError extends Error {
  constructor(httpStatus, code, message) {
    super(message);
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

function normalizeInt(v) {
  if (v == null) return null;
  const n = Number.parseInt(String(v), 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

// ===================== inspection_source 推导（fail-closed） =====================
/**
 * 由巡查人组织推导检查来源：
 *   org 含 '作业中心' → 'self'（乡镇作业中心网格人员自查）
 *   org 含 '乡镇'     → 'township'
 *   其余（无巡查人 / 无组织 / 公司部门等一切无法可靠判定的情形）→ 'unknown'
 * 禁止猜测：'company' 只能由人工在确认时显式标定（业务确认口径：公司级检查
 * 由确认人依据事实标定），杜绝把 area_team='公司管理' 之类历史分类当来源。
 */
const SELF_ORG_KEYWORD = '作业中心';
const TOWNSHIP_ORG_KEYWORD = '乡镇';

async function deriveInspectionSource(client, inspectorEmployeeId) {
  if (inspectorEmployeeId == null) return 'unknown';
  const r = await (client || pool).query(
    `SELECT v.org_name
       FROM v_employee_org_full v
      WHERE v.employee_id = $1 AND v.is_deleted = FALSE AND v.is_current = TRUE`,
    [inspectorEmployeeId]
  );
  if (r.rows.length !== 1) return 'unknown'; // 无组织 / 多组织 → fail-closed
  const orgName = String(r.rows[0].org_name || '');
  if (orgName.includes(SELF_ORG_KEYWORD)) return 'self';
  if (orgName.includes(TOWNSHIP_ORG_KEYWORD)) return 'township';
  return 'unknown';
}

/** GRIDVIOL001 规则（enabled）→ { id, deductScore } | null */
async function getGridViol001Rule(client) {
  const r = await (client || pool).query(
    `SELECT id, deduct_score FROM hse_assessment_rule
      WHERE rule_code = 'GRIDVIOL001' AND is_deleted = FALSE AND status = 'enabled'
      ORDER BY id DESC LIMIT 1`
  );
  if (!r.rows.length) return null;
  return { id: r.rows[0].id, deductScore: r.rows[0].deduct_score != null ? Number(r.rows[0].deduct_score) : 0 };
}

function suggestedScoreFor(source, rule) {
  return source === 'company' && rule ? rule.deductScore : 0;
}

// ===================== 候选生成 =====================
/**
 * 单条 gir 行的候选生成（调用方保证事务/client；幂等：活候选唯一索引 DO NOTHING）
 * @returns {Array} 新插入候选行
 */
async function generateForRecord(client, gir, { rule, dict }) {
  const res = dictSvc.matchBehaviorText(dict, gir.violation_behavior);
  if (res.isEmpty || res.matched.length === 0) return [];

  const source = await deriveInspectionSource(client, gir.inspector_employee_id);
  const inserted = [];

  for (const m of res.matched) {
    const reasonParts = [];
    if (res.isContradiction) reasonParts.push('CONTRADICTION_WITH_NO_VIOLATION');
    if (gir.__isCombination) reasonParts.push('COMBINATION_SPLIT');
    reasonParts.push(`MATCH:${m.behaviorCode}`);

    const ins = await client.query(
      `INSERT INTO grid_violation_candidates
         (grid_record_id, behavior_id, behavior_text, raw_violation_behavior,
          candidate_type, candidate_reason, inspection_source,
          suggested_score, suggested_rule_id, evidence_snapshot, candidate_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
       ON CONFLICT (grid_record_id, behavior_id)
            WHERE candidate_status IN ('pending','confirmed')
       DO NOTHING
       RETURNING id`,
      [
        gir.id,
        m.behaviorId,
        m.atomText,
        gir.violation_behavior,
        m.behaviorType,
        reasonParts.join('|'),
        source,
        suggestedScoreFor(source, rule),
        source === 'company' && rule ? rule.id : null,
        JSON.stringify({
          violator_name: gir.violator_name || null,
          inspection_date: gir.inspection_date || null,
          personnel_name: gir.personnel_name || null,
          grid_id: gir.grid_id || null,
          grid_level: gir.grid_level || null,
          position: gir.position || null,
          area_team: gir.area_team || null,
          serial_no: gir.serial_no || null,
          has_image: !!(gir.image_content && String(gir.image_content).trim() !== ''),
          contradiction: res.isContradiction,
          combination: !!gir.__isCombination,
          unmatched_atoms: res.unmatched,
        }),
      ]
    );
    if (ins.rows.length) inserted.push({ id: ins.rows[0].id, behaviorCode: m.behaviorCode });
  }
  return inserted;
}

/**
 * 批量候选生成（管理端显式触发；无 scheduler）
 * @param {object} opts
 *   - gridRecordIds: 指定 gir id 列表（测试/补扫）；缺省全量扫描
 *   - batchSize: 分批大小
 * @returns {{ scanned, matchedRecords, inserted, byBehavior, unmatchedRecords }}
 */
async function generateCandidates({ gridRecordIds, batchSize = 200 } = {}) {
  if (!isConnected()) throw new ApiError(503, 'DB_UNAVAILABLE', '数据库不可用');
  const rule = await getGridViol001Rule();
  const dict = await dictSvc.loadDict();

  const stats = { scanned: 0, matchedRecords: 0, inserted: 0, byBehavior: {}, unmatchedRecords: 0 };
  const unmatchedSamples = [];

  let ids;
  const client = await pool.connect();
  try {
    if (Array.isArray(gridRecordIds) && gridRecordIds.length) {
      ids = gridRecordIds.map(normalizeInt).filter((v) => v != null);
    } else {
      const all = await client.query(`SELECT id FROM grid_inspection_records ORDER BY id`);
      ids = all.rows.map((r) => r.id);
    }

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      await client.query('BEGIN');
      try {
        const rows = await client.query(
          `SELECT id, violation_behavior, violator_name, inspection_date, personnel_name,
                  grid_id, grid_level, position, area_team, serial_no, image_content,
                  inspector_employee_id
             FROM grid_inspection_records
            WHERE id = ANY($1::bigint[])
            ORDER BY id`,
          [batch]
        );
        for (const gir of rows.rows) {
          stats.scanned++;
          // 组合行标记（供 candidate_reason / evidence）
          const text = String(gir.violation_behavior || '').trim();
          gir.__isCombination = text !== '' && dictSvc.ATOM_SPLIT_RE.test(text);
          const ins = await generateForRecord(client, gir, { rule, dict });
          if (ins.length) {
            stats.matchedRecords++;
            stats.inserted += ins.length;
            for (const x of ins) {
              stats.byBehavior[x.behaviorCode] = (stats.byBehavior[x.behaviorCode] || 0) + 1;
            }
          }
          const res = dictSvc.matchBehaviorText(dict, gir.violation_behavior);
          if ((!res.isEmpty && res.unmatched.length > 0)) {
            stats.unmatchedRecords++;
            if (unmatchedSamples.length < 50) {
              unmatchedSamples.push({ grid_record_id: gir.id, raw: gir.violation_behavior, unmatched: res.unmatched });
            }
          }
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    client.release();
  }
  stats.unmatchedSamples = unmatchedSamples;
  return stats;
}

// ===================== 事务内审计直写 =====================
async function insertAudit(client, { userId, username, module, table_name, record_id, action, old_value, new_value, changed_fields, ip_address }) {
  const r = await client.query(
    `INSERT INTO audit_record
       (operation_log_id, user_id, username, module, table_name, record_id, action, old_value, new_value, changed_fields, ip_address)
     VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      userId,
      username || 'unknown',
      module || 'grid-violation-candidates',
      table_name,
      String(record_id),
      action,
      old_value != null ? old_value : null,
      new_value != null ? new_value : null,
      changed_fields != null ? changed_fields : null,
      ip_address || null,
    ]
  );
  return r.rows[0].id;
}

/** violator 姓名唯一匹配落键（重名不落键，沿用 importExcel 阶段2 模式；fail-closed） */
async function resolveViolatorIdByName(client, violatorName) {
  const name = String(violatorName || '').trim();
  if (name === '') return null;
  const r = await client.query(
    `SELECT id FROM employee WHERE name = $1 AND is_deleted = FALSE`,
    [name]
  );
  if (r.rows.length === 1) return r.rows[0].id;
  return null; // 0 或多个匹配 → 不落键
}

// ===================== 人工确认 =====================
const CONFIRMABLE_SOURCE = new Set(['company', 'township', 'self']);

/**
 * 候选确认（唯一合法的 vr 增量行写入口，人工触发）：
 *   BEGIN → FOR UPDATE 候选 → 状态守卫(pending) → 插 vr（5 新列+复用列）→
 *   回填候选 confirmed_* → audit_record → COMMIT
 * 幂等：vr.uq_vr_candidate_id 一对一唯一索引 + 状态机守卫（并发第二确认 23505/409）。
 *
 * 人工修正（E-07 §五）：inspection_source 可修正；behavior_id 必要时可修正
 * （必须为字典 enabled 且 behavior_type='违反劳动纪律' 的行，禁止修正为
 *  「无三违行为」登记行），所有修正的最终值写入候选/vr 并在 audit_record 记录 old/new。
 *
 * @param {object} p
 *   - candidate_id
 *   - inspection_source: 可选修正（company/township/self；缺省用候选推导值）
 *   - behavior_id: 可选修正（标准行为字典 id）
 *   - operator: { userId, username }
 *   - ip
 */
async function confirmCandidate({ candidate_id, inspection_source, behavior_id, operator, ip }) {
  const cid = normalizeInt(candidate_id);
  if (cid == null) throw new ApiError(400, 'INVALID_CANDIDATE_ID', 'candidate_id 无效');
  if (inspection_source !== undefined && inspection_source !== null && !CONFIRMABLE_SOURCE.has(inspection_source)) {
    throw new ApiError(400, 'INVALID_INSPECTION_SOURCE', 'inspection_source 仅允许 company/township/self');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. FOR UPDATE 取候选（串行化并发确认）
    const cur = await client.query(
      `SELECT c.*, g.violator_name, g.inspection_date, g.personnel_name, g.area_team,
              g.grid_level, g.position, g.image_content, g.upload_time, g.serial_no,
              g.grid_id, g.inspector_employee_id,
              d.behavior_code, d.behavior_name, d.behavior_type
         FROM grid_violation_candidates c
         JOIN grid_inspection_records g ON g.id = c.grid_record_id
         JOIN sanwei_behavior_dict d    ON d.id = c.behavior_id
        WHERE c.id = $1
        FOR UPDATE OF c`,
      [cid]
    );
    if (!cur.rows.length) throw new ApiError(404, 'CANDIDATE_NOT_FOUND', '候选不存在');
    const cand = cur.rows[0];
    if (cand.candidate_status !== 'pending') {
      throw new ApiError(409, 'CANDIDATE_NOT_PENDING', '该候选当前状态不可确认（非 pending）');
    }

    // 2. 标准行为修正（E-07 §五）：仅允许字典 enabled 且 behavior_type='违反劳动纪律'
    let finalBehaviorId = cand.behavior_id;
    let finalBehaviorCode = cand.behavior_code;
    let finalBehaviorName = cand.behavior_name;
    let finalBehaviorType = cand.behavior_type;
    let behaviorCorrected = false;
    if (behavior_id !== undefined && behavior_id !== null && behavior_id !== '') {
      const nb = normalizeInt(behavior_id);
      if (nb == null) throw new ApiError(400, 'INVALID_BEHAVIOR_ID', 'behavior_id 无效');
      if (nb !== cand.behavior_id) {
        const dRow = await client.query(
          `SELECT id, behavior_code, behavior_name, behavior_type
             FROM sanwei_behavior_dict
            WHERE id = $1 AND enabled = TRUE`,
          [nb]
        );
        if (!dRow.rows.length) throw new ApiError(400, 'BEHAVIOR_NOT_IN_DICT', '修正的标准行为不在字典中或已停用');
        const d = dRow.rows[0];
        if (d.behavior_type !== '违反劳动纪律') {
          throw new ApiError(400, 'BEHAVIOR_NOT_VIOLATION', '不得将候选修正为非三违标准行为（如「无三违行为」登记行）');
        }
        behaviorCorrected = true;
        finalBehaviorId = d.id;
        finalBehaviorCode = d.behavior_code;
        finalBehaviorName = d.behavior_name;
        finalBehaviorType = d.behavior_type;
      }
    }

    // 3. 检查来源：客户端显式修正 > 候选推导值；unknown → vr.check_source = NULL（未标注）
    const finalSource = inspection_source || cand.inspection_source;
    const vrCheckSource = CONFIRMABLE_SOURCE.has(finalSource) ? finalSource : null;

    // 4. violator 落键（唯一匹配才落）
    const violatorId = await resolveViolatorIdByName(client, cand.violator_name);

    // 5. 插正式 vr（punishment 等历史字段一律不写；violator_id_card 不写）
    const vrR = await client.query(
      `INSERT INTO violation_records
         (violation_type, risk_level, description, violation_date, violator_name, violator_id,
          inspector_name, status, remark, area_team, upload_time, grid_level, position,
          image_content, violation_behavior, violation_type_result, check_source,
          source_type, source_record_id, candidate_id, confirmed_by, confirmed_at)
       VALUES ($1,'中',$2,$3,$4,$5,$6,'待处理',$7,$8,$9,$10,$11,$12,$13,$14,$15,
               'grid_candidate',$16,$17,$18,NOW())
       RETURNING id`,
      [
        finalBehaviorType || '违反劳动纪律',                                   // violation_type（业务确认统一类型）
        `三违候选确认：${cand.behavior_text}（${finalBehaviorCode}）`,          // description
        cand.inspection_date || null,                                       // violation_date
        cand.violator_name || null,
        violatorId,
        cand.personnel_name || null,                                        // inspector_name = 巡查人
        `来源：网格巡查候选人工确认；原文：${cand.raw_violation_behavior}` +   // remark（含原文与编号快照，原文永不在 vr 改写）
          (cand.serial_no ? `；台账编号：${cand.serial_no}` : ''),
        cand.area_team || null,
        cand.upload_time || null,
        cand.grid_level || null,
        cand.position || null,
        cand.image_content || null,                                         // 证据快照
        cand.raw_violation_behavior,                                        // violation_behavior = 原文
        finalBehaviorType || '违反劳动纪律',                                   // violation_type_result
        vrCheckSource,                                                      // check_source（unknown→NULL 未标注）
        cand.grid_record_id,
        cand.id,
        operator.userId,
      ]
    );
    const vrId = vrR.rows[0].id;

    // 6. 回填候选确认字段（含 behavior_id 修正的最终值）
    const upd = await client.query(
      `UPDATE grid_violation_candidates
          SET candidate_status = 'confirmed',
              confirmed_violation_id = $2,
              confirmed_by = $3,
              confirmed_at = NOW(),
              inspection_source = $4,
              behavior_id = $5,
              behavior_text = $6,
              candidate_type = $7,
              updated_at = NOW()
        WHERE id = $1 AND candidate_status = 'pending'`,
      [cid, vrId, operator.userId, finalSource, finalBehaviorId,
        behaviorCorrected ? finalBehaviorName : cand.behavior_text,
        behaviorCorrected ? finalBehaviorType : cand.candidate_type]
    );
    if (upd.rowCount !== 1) throw new ApiError(409, 'CONFIRM_CONFLICT', '确认失败：候选状态已被并发修改');

    // 7. 审计（同事务；修正项记录 old→new 最终值）
    const changedFields = ['candidate_status', 'inspection_source', 'confirmed_violation_id', 'confirmed_by', 'confirmed_at'];
    if (behaviorCorrected) changedFields.push('behavior_id', 'behavior_text', 'candidate_type');
    await insertAudit(client, {
      userId: operator.userId,
      username: operator.username,
      module: 'grid-violation-candidates',
      table_name: 'grid_violation_candidates',
      record_id: cid,
      action: 'confirm',
      old_value: { candidate_status: 'pending', inspection_source: cand.inspection_source, confirmed_violation_id: null, behavior_id: cand.behavior_id, behavior_text: cand.behavior_text, candidate_type: cand.candidate_type },
      new_value: { candidate_status: 'confirmed', inspection_source: finalSource, confirmed_violation_id: vrId, violation_record_id: vrId, behavior_id: finalBehaviorId, behavior_text: behaviorCorrected ? finalBehaviorName : cand.behavior_text, candidate_type: finalBehaviorType },
      changed_fields: changedFields,
      ip_address: ip,
    });
    await insertAudit(client, {
      userId: operator.userId,
      username: operator.username,
      module: 'grid-violation-candidates',
      table_name: 'violation_records',
      record_id: vrId,
      action: 'create_from_candidate',
      old_value: null,
      new_value: { source_type: 'grid_candidate', source_record_id: cand.grid_record_id, candidate_id: cand.id, check_source: vrCheckSource, violation_type: finalBehaviorType, behavior_corrected: behaviorCorrected, original_behavior_id: cand.behavior_id },
      changed_fields: null,
      ip_address: ip,
    });

    await client.query('COMMIT');
    return {
      ok: true, candidate_id: cid, violation_record_id: vrId, inspection_source: finalSource,
      violator_id: violatorId, behavior_id: finalBehaviorId, behavior_code: finalBehaviorCode,
      behavior_name: finalBehaviorName, behavior_corrected: behaviorCorrected,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    // 一对一唯一索引冲突（并发双确认）→ 业务码
    if (err && err.code === '23505') {
      return { httpStatus: 409, code: 'ALREADY_CONFIRMED', message: '该候选已确认过正式记录（一对一唯一约束）' };
    }
    if (err instanceof ApiError) return { httpStatus: err.httpStatus, code: err.code, message: err.message };
    return { httpStatus: 500, code: 'CONFIRM_FAILED', message: err && err.message ? err.message : '确认失败' };
  } finally {
    client.release();
  }
}

// ===================== 驳回 =====================
/**
 * 驳回候选：pending → rejected（不生成 vr；rejected 后允许未来重新产生候选）
 */
async function rejectCandidate({ candidate_id, rejection_reason, operator, ip }) {
  const cid = normalizeInt(candidate_id);
  if (cid == null) throw new ApiError(400, 'INVALID_CANDIDATE_ID', 'candidate_id 无效');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT id, candidate_status, behavior_text, raw_violation_behavior
         FROM grid_violation_candidates WHERE id = $1 FOR UPDATE`,
      [cid]
    );
    if (!cur.rows.length) throw new ApiError(404, 'CANDIDATE_NOT_FOUND', '候选不存在');
    if (cur.rows[0].candidate_status !== 'pending') {
      throw new ApiError(409, 'CANDIDATE_NOT_PENDING', '该候选当前状态不可驳回（非 pending）');
    }
    const upd = await client.query(
      `UPDATE grid_violation_candidates
          SET candidate_status = 'rejected',
              rejected_by = $2,
              rejected_at = NOW(),
              rejection_reason = $3,
              updated_at = NOW()
        WHERE id = $1 AND candidate_status = 'pending'`,
      [cid, operator.userId, typeof rejection_reason === 'string' ? rejection_reason : null]
    );
    if (upd.rowCount !== 1) throw new ApiError(409, 'REJECT_CONFLICT', '驳回失败：候选状态已被并发修改');

    await insertAudit(client, {
      userId: operator.userId,
      username: operator.username,
      module: 'grid-violation-candidates',
      table_name: 'grid_violation_candidates',
      record_id: cid,
      action: 'reject',
      old_value: { candidate_status: 'pending' },
      new_value: { candidate_status: 'rejected', rejection_reason: typeof rejection_reason === 'string' ? rejection_reason : null },
      changed_fields: ['candidate_status', 'rejected_by', 'rejected_at', 'rejection_reason'],
      ip_address: ip,
    });
    await client.query('COMMIT');
    return { ok: true, candidate_id: cid, candidate_status: 'rejected' };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof ApiError) return { httpStatus: err.httpStatus, code: err.code, message: err.message };
    return { httpStatus: 500, code: 'REJECT_FAILED', message: err && err.message ? err.message : '驳回失败' };
  } finally {
    client.release();
  }
}

// ===================== 撤销确认 =====================
/**
 * 撤销确认：confirmed → revoked；正式 vr 软删（is_deleted=true，历史可追溯）；
 * revoked 后该 (grid_record, behavior) 允许未来重新产生候选（部分唯一索引只锁 pending/confirmed）。
 *
 * P2-B1-E-08-04 撤销即时回滚（同一业务事务内完成，不等 daily scheduler）：
 *   1) vr 标记撤销（软删）
 *   2) 立即回滚该 vr 产生的全部有效扣分（source_table='violation_records' AND source_id=vr.id，
 *      含岗位传递产生的多对象扣分行；含 approved/adjusted 锁定行——底层三违已撤销，
 *      保留其扣分将与事实不符，一并回滚并在审计中留痕）
 *   3) 事务内（client）重算受影响考核对象的当前有效得分
 *   4) 审计记录回滚明细
 * 幂等：仅 confirmed 可撤销（状态守卫 + FOR UPDATE + rowCount 双保险），重复/并发撤销 → 409。
 */
async function revokeConfirmation({ candidate_id, reason, operator, ip }) {
  const cid = normalizeInt(candidate_id);
  if (cid == null) throw new ApiError(400, 'INVALID_CANDIDATE_ID', 'candidate_id 无效');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT id, candidate_status, confirmed_violation_id
         FROM grid_violation_candidates WHERE id = $1 FOR UPDATE`,
      [cid]
    );
    if (!cur.rows.length) throw new ApiError(404, 'CANDIDATE_NOT_FOUND', '候选不存在');
    const cand = cur.rows[0];
    if (cand.candidate_status !== 'confirmed') {
      throw new ApiError(409, 'NOT_REVOCABLE', '仅 confirmed 状态可撤销');
    }

    // 1) vr 软删（保留行，可追溯） + 2) 同事务回滚该 vr 的全部有效扣分
    let rollback = { deductionsRemoved: 0, deductionsLockedRemoved: 0, targetsRecalculated: [], recalculated: 0, skippedReasons: [] };
    if (cand.confirmed_violation_id != null) {
      const vrId = cand.confirmed_violation_id;
      await client.query(
        `UPDATE violation_records SET is_deleted = TRUE, updated_at = NOW()
          WHERE id = $1 AND source_type = 'grid_candidate' AND candidate_id = $2`,
        [vrId, cid]
      );

      // 回滚扣分：该记录产生的全部有效行（多对象传递行一并回滚）
      const dedR = await client.query(
        `UPDATE hse_assessment_deduction
            SET is_deleted = TRUE, updated_at = NOW()
          WHERE source_table = 'violation_records'
            AND source_id = $1
            AND is_deleted = FALSE
          RETURNING id, cycle_id, target_id,
                    (review_status IN ('approved','adjusted')) AS was_locked`,
        [String(vrId)]
      );
      rollback.deductionsRemoved = dedR.rows.length;
      rollback.deductionsLockedRemoved = dedR.rows.filter((r) => r.was_locked).length;

      // 3) 事务内重算受影响考核对象（同 cycle 同 target 去重）
      const pairSet = new Map();
      for (const r of dedR.rows) {
        pairSet.set(`${r.cycle_id}|${r.target_id}`, { cycleId: r.cycle_id, targetId: r.target_id });
      }
      for (const p of pairSet.values()) {
        try {
          // R2：force=true —— 撤销即时恢复必须刷新分数快照，即使周期 frozen/not_started
          //（仍走正式评分链全链；target 行级冻结由 DB 触发器兜底，触发即整体回滚，fail-closed）
          const rr = await scoringEngine.recalculateTarget(p.cycleId, p.targetId, client, { force: true });
          if (rr && rr.ok) {
            rollback.recalculated++;
            rollback.targetsRecalculated.push({
              cycleId: Number(p.cycleId),
              targetId: Number(p.targetId),
              scoreAuto: rr.scoreAuto,
              totalDeduction: rr.totalDeduction,
            });
          } else {
            // force 后仅剩 target-not-found（对象已删，无分数可恢复）
            rollback.skippedReasons.push({ targetId: Number(p.targetId), reason: rr && rr.reason ? rr.reason : 'recalc-skipped' });
          }
        } catch (e) {
          // 重算失败（含 target 行级冻结触发器拦截）= 整体回滚（撤销与回滚原子，
          // 禁止出现「已撤销但分数未恢复」的中间态）
          throw new Error(`ROLLBACK_RECALC_FAILED: target=${p.targetId} ${e.message}`);
        }
      }
    }

    const upd = await client.query(
      `UPDATE grid_violation_candidates
          SET candidate_status = 'revoked',
              revoked_by = $2,
              revoked_at = NOW(),
              revoke_reason = $3,
              updated_at = NOW()
        WHERE id = $1 AND candidate_status = 'confirmed'`,
      [cid, operator.userId, typeof reason === 'string' ? reason : null]
    );
    if (upd.rowCount !== 1) throw new ApiError(409, 'REVOKE_CONFLICT', '撤销失败：候选状态已被并发修改');

    await insertAudit(client, {
      userId: operator.userId,
      username: operator.username,
      module: 'grid-violation-candidates',
      table_name: 'grid_violation_candidates',
      record_id: cid,
      action: 'revoke',
      old_value: { candidate_status: 'confirmed', confirmed_violation_id: cand.confirmed_violation_id },
      new_value: {
        candidate_status: 'revoked',
        violation_record_soft_deleted: cand.confirmed_violation_id,
        deduction_rollback: {
          removed: rollback.deductionsRemoved,
          lockedRemoved: rollback.deductionsLockedRemoved,
          recalculatedTargets: rollback.targetsRecalculated,
        },
      },
      changed_fields: ['candidate_status', 'revoked_by', 'revoked_at', 'revoke_reason', 'deduction_rollback'],
      ip_address: ip,
    });
    await client.query('COMMIT');
    return {
      ok: true,
      candidate_id: cid,
      candidate_status: 'revoked',
      rollback,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof ApiError) return { httpStatus: err.httpStatus, code: err.code, message: err.message };
    return { httpStatus: 500, code: 'REVOKE_FAILED', message: err && err.message ? err.message : '撤销失败' };
  } finally {
    client.release();
  }
}

// ===================== 列表查询 =====================
function escapeLike(s) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

const LISTABLE_STATUS = new Set(['pending', 'confirmed', 'rejected', 'revoked']);

async function listCandidates({ page = 1, pageSize = 20, keyword, status } = {}) {
  const p = normalizeInt(page) || 1;
  let ps = normalizeInt(pageSize) || 20;
  if (ps > 200) ps = 200;

  const params = [];
  const conds = [];
  const st = typeof status === 'string' && LISTABLE_STATUS.has(status) ? status : null;
  if (st) {
    conds.push(`c.candidate_status = $${params.push(st)}`);
  } else {
    conds.push(`c.candidate_status IN ('pending','confirmed')`);
  }
  const kwRaw = keyword == null ? '' : String(keyword).trim();
  if (kwRaw !== '') {
    const like = `%${escapeLike(kwRaw)}%`;
    const idx = params.push(like);
    const textCond =
      `(c.raw_violation_behavior ILIKE $${idx} ESCAPE '\\'` +
      ` OR g.violator_name ILIKE $${idx} ESCAPE '\\'` +
      ` OR g.personnel_name ILIKE $${idx} ESCAPE '\\'` +
      ` OR d.behavior_name ILIKE $${idx} ESCAPE '\\')`;
    const asId = normalizeInt(kwRaw);
    if (asId != null) {
      const idIdx = params.push(asId);
      conds.push(`(${textCond} OR c.grid_record_id = $${idIdx} OR c.id = $${idIdx})`);
    } else {
      conds.push(textCond);
    }
  }
  const where = conds.join(' AND ');

  const baseSql = `
    FROM grid_violation_candidates c
    JOIN grid_inspection_records g ON g.id = c.grid_record_id
    JOIN sanwei_behavior_dict d    ON d.id = c.behavior_id`;

  const totalR = await pool.query(`SELECT count(*)::int AS c ${baseSql} WHERE ${where}`, params);
  const p2 = params.slice();
  p2.push(ps, (p - 1) * ps);
  const rows = await pool.query(
    `SELECT c.id, c.grid_record_id, c.behavior_id, c.behavior_text, c.raw_violation_behavior,
            c.candidate_type, c.candidate_reason, c.inspection_source, c.candidate_status,
            c.suggested_score, c.suggested_rule_id, c.evidence_snapshot,
            c.confirmed_violation_id, c.confirmed_at,
            c.rejected_at, c.rejection_reason,
            c.created_at, c.updated_at,
            g.inspection_date, g.violator_name, g.personnel_name, g.area_team,
            g.grid_level, g.position, g.serial_no,
            d.behavior_code, d.behavior_name AS dict_behavior_name
     ${baseSql}
     WHERE ${where}
     ORDER BY c.id DESC
     LIMIT $${p2.length - 1} OFFSET $${p2.length}`,
    p2
  );
  return { total: totalR.rows[0].c, page: p, pageSize: ps, list: rows.rows };
}

// ===================== 详情 + 证据链（E-07 §十二） =====================
/**
 * 候选详情与完整证据链（只读）：
 *   candidate → gir（原始检查记录）→ vr（正式记录，若已产生）→ audit 轨迹
 * 不受候选状态限制（rejected/revoked 亦可追溯）。
 */
async function getCandidateDetail(candidate_id) {
  const cid = normalizeInt(candidate_id);
  if (cid == null) throw new ApiError(400, 'INVALID_CANDIDATE_ID', 'candidate_id 无效');

  const candR = await pool.query(
    `SELECT c.*,
            g.inspection_date, g.violator_name, g.personnel_name, g.area_team,
            g.grid_level, g.position, g.serial_no, g.upload_time,
            g.image_content, g.violation_behavior AS gir_violation_behavior,
            g.inspector_employee_id,
            d.behavior_code, d.behavior_name AS dict_behavior_name,
            d.behavior_type AS dict_behavior_type, d.aliases AS dict_aliases
       FROM grid_violation_candidates c
       JOIN grid_inspection_records g ON g.id = c.grid_record_id
       JOIN sanwei_behavior_dict d    ON d.id = c.behavior_id
      WHERE c.id = $1`,
    [cid]
  );
  if (!candR.rows.length) throw new ApiError(404, 'CANDIDATE_NOT_FOUND', '候选不存在');
  const candidate = candR.rows[0];

  // 正式记录（含软删，可追溯撤销历史）
  const vrR = await pool.query(
    `SELECT id, violation_type, violation_date, violator_name, violator_id, inspector_name,
            status, check_source, source_type, source_record_id, candidate_id,
            confirmed_by, confirmed_at, is_deleted, image_content,
            violation_behavior, remark, created_at
       FROM violation_records
      WHERE candidate_id = $1`,
    [cid]
  );

  // 审计轨迹（确认/驳回/撤销全过程）
  const auditR = await pool.query(
    `SELECT id, user_id, username, module, table_name, record_id, action,
            old_value, new_value, changed_fields, ip_address, created_at
       FROM audit_record
      WHERE table_name = 'grid_violation_candidates' AND record_id = $1
      ORDER BY id`,
    [cid]
  );

  return {
    candidate,
    violation_record: vrR.rows[0] || null,
    violation_records: vrR.rows,
    audit_trail: auditR.rows,
    evidence_chain: {
      grid_inspection_record_id: candidate.grid_record_id,
      candidate_id: candidate.id,
      violation_record_id: candidate.confirmed_violation_id || null,
      raw_violation_behavior: candidate.raw_violation_behavior,
      gir_violation_behavior: candidate.gir_violation_behavior,
      evidence_image: candidate.image_content || null,
    },
  };
}

/**
 * 可选修正的标准行为列表（确认弹窗下拉数据源；来自字典，无前端硬编码）。
 * 仅返回 enabled 且 behavior_type='违反劳动纪律'（禁止修正为「无三违行为」登记行）。
 */
async function listCorrectableBehaviors() {
  const r = await pool.query(
    `SELECT id, behavior_code, behavior_name, behavior_type, aliases
       FROM sanwei_behavior_dict
      WHERE enabled = TRUE AND behavior_type = '违反劳动纪律'
      ORDER BY behavior_code`
  );
  return r.rows;
}

// ===================== dry-run（只读统计，不写任何表） =====================
/**
 * 候选识别 dry-run：全量 gir 只读扫描，输出识别统计。
 * 不写候选表、不写 gir/vr。
 */
async function dryRunScan() {
  if (!isConnected()) throw new ApiError(503, 'DB_UNAVAILABLE', '数据库不可用');
  const dict = await dictSvc.loadDict();

  const girR = await pool.query(
    `SELECT id, violation_behavior, violator_name, inspection_date, personnel_name,
            grid_id, grid_level, position, area_team, serial_no, image_content,
            inspector_employee_id
       FROM grid_inspection_records
      ORDER BY id`
  );

  // 已有活候选集合（潜在重复判定）
  const existR = await pool.query(
    `SELECT grid_record_id, behavior_id FROM grid_violation_candidates
      WHERE candidate_status IN ('pending','confirmed')`
  );
  const existSet = new Set(existR.rows.map((r) => `${r.grid_record_id}:${r.behavior_id}`));

  // inspection_source 推导所需的巡查人组织（批量预载）
  const orgR = await pool.query(
    `SELECT DISTINCT v.employee_id, v.org_name
       FROM v_employee_org_full v
      WHERE v.is_deleted = FALSE AND v.is_current = TRUE`
  );
  const orgMap = new Map(); // employee_id -> org_name[]（同人多组织 → fail-closed）
  for (const row of orgR.rows) {
    if (!orgMap.has(row.employee_id)) orgMap.set(row.employee_id, []);
    orgMap.get(row.employee_id).push(String(row.org_name || ''));
  }
  function deriveSource(inspectorId) {
    if (inspectorId == null) return 'unknown';
    const orgs = orgMap.get(inspectorId);
    if (!orgs || orgs.length !== 1) return 'unknown';
    const orgName = orgs[0];
    if (orgName.includes('作业中心')) return 'self';
    if (orgName.includes('乡镇')) return 'township';
    return 'unknown';
  }

  const stats = {
    totalScanned: 0,
    emptyBehavior: 0,
    noViolationOnly: 0,        // 纯'无三违行为'（非组合）
    matchedRecords: 0,         // 至少命中一个违规原子的记录数
    matchedAtoms: 0,           // 命中的候选原子总数（= 预期新增候选数，若零重复）
    combinationRecords: 0,
    synonymHits: 0,            // 经 aliases（非规范名）命中的原子数
    contradictionRecords: 0,
    unmatchedRecords: 0,
    unmatchedSamples: [],
    byBehavior: {},
    sourceDistribution: { company: 0, township: 0, self: 0, unknown: 0 },
    needHumanConfirmation: 0,  // 矛盾组合行 + 含未匹配原子的记录
    potentialDuplicates: 0,    // 与现有活候选 (grid_record,behavior) 重复
    existingActiveCandidates: existSet.size,
  };

  for (const gir of girR.rows) {
    stats.totalScanned++;
    const res = dictSvc.matchBehaviorText(dict, gir.violation_behavior);
    if (res.isEmpty) { stats.emptyBehavior++; continue; }
    if (!res.isEmpty && res.matched.length === 0 && !res.hasNoViolationToken && res.unmatched.length > 0) {
      stats.unmatchedRecords++;
      if (stats.unmatchedSamples.length < 50) {
        stats.unmatchedSamples.push({ grid_record_id: gir.id, raw: gir.violation_behavior, unmatched: res.unmatched });
      }
      continue;
    }
    if (res.matched.length === 0 && res.hasNoViolationToken) { stats.noViolationOnly++; continue; }

    stats.matchedRecords++;
    stats.matchedAtoms += res.matched.length;
    if (res.isContradiction) stats.contradictionRecords++;
    const text = String(gir.violation_behavior || '').trim();
    if (dictSvc.ATOM_SPLIT_RE.test(text)) stats.combinationRecords++;

    // 同义词命中：命中的原子文本 ≠ 规范名
    for (const m of res.matched) {
      if (m.atomText !== m.behaviorName) stats.synonymHits++;
      stats.byBehavior[m.behaviorCode] = (stats.byBehavior[m.behaviorCode] || 0) + 1;
      const src = deriveSource(gir.inspector_employee_id);
      stats.sourceDistribution[src]++;
      if (existSet.has(`${gir.id}:${m.behaviorId}`)) stats.potentialDuplicates++;
    }
    if (res.isContradiction || res.unmatched.length > 0) stats.needHumanConfirmation++;
  }
  return stats;
}

module.exports = {
  ApiError,
  deriveInspectionSource,
  generateCandidates,
  generateForRecord,
  confirmCandidate,
  rejectCandidate,
  revokeConfirmation,
  listCandidates,
  getCandidateDetail,
  listCorrectableBehaviors,
  dryRunScan,
  getGridViol001Rule,
  suggestedScoreFor,
  CONFIRMABLE_SOURCE,
};
