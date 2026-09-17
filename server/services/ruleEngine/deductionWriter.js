/**
 * 规则引擎 · 通用幂等扣分明细写入器
 *
 * 由 gridUncheckedDeductionService 的 findExisting / stableStringify / upsertDeduction /
 * revokeDeduction 泛化而来，供各自动扣分通路复用。语义与迁移前逐条保持一致：
 *   - 月度模式（grid_unchecked）：幂等键 = target_id + cycle_id + deduction_source='auto'
 *             + source_table + source_detail->>'kind' + source_detail->>'deductKey'
 *   - 事件模式（violation_record）：幂等键 = target_id + cycle_id + deduction_source='auto'
 *             + source_table + source_id（一条源记录 = 一条扣分，按真实 source_id 匹配）
 *   - 人工锁定（review_status ∈ approved/adjusted）：不覆盖、不软删，返回 'locked'
 *   - 软删行复活：命中 is_deleted=TRUE 的既有行时复用并重置为 pending
 *   - 分数与 detail 均无变化：返回 'noop'
 *   - 撤销：缺次归零或被类别上限钳制为 0 时软删既有行
 *
 * 本模块只写 hse_assessment_deduction；分数汇总由调用方触发 assessmentScoringEngine.recalculateTarget()。
 * 阶段2 新增：idempotency: 'event' 模式（按 source_id 幂等），支撑三违「一条违规记录=一条扣分」。
 */

const { pool } = require('../../config/db');
const engine = require('../assessmentScoringEngine');

// 人工锁定态：自动扫描不得覆盖
const LOCKED_STATUSES = new Set(['approved', 'adjusted']);

// source_detail 中随数据集演化而变、不应用于「是否变更」判定的派生字段
// （每次重跑，otherCatScore/cappedScore 会因其他行累积而变化，若纳入比较会导致幂等重跑误判为 updated）
const VOLATILE_DETAIL_KEYS = new Set(['cap', 'cappedScore', 'otherCatScore']);

// 取用于变更比对的稳定子集（剔除派生字段，键序已由 stableStringify 统一）
function stableDetailSubset(detail) {
  if (detail == null || typeof detail !== 'object') return detail;
  const out = {};
  for (const k of Object.keys(detail).sort()) {
    if (VOLATILE_DETAIL_KEYS.has(k)) continue;
    out[k] = detail[k];
  }
  return out;
}

// jsonb 会重排键序，字符串比较前需稳定化（键按字典序递归排序）
function stableStringify(obj) {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  if (typeof obj === 'object') {
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(obj);
}

/**
 * 月度模式：按 kind + deductKey 幂等查找
 */
async function findMonthlyExisting({ sourceTable, kind }, cycleId, targetId, deductKey) {
  const r = await pool.query(
    `SELECT id, source_id, suggested_score, confirmed_score, review_status, is_deleted, source_detail
       FROM hse_assessment_deduction
      WHERE target_id = $1 AND cycle_id = $2 AND deduction_source = 'auto'
        AND source_table = $3
        AND source_detail ->> 'kind' = $4
        AND source_detail ->> 'deductKey' = $5
      ORDER BY id DESC LIMIT 1`,
    [targetId, cycleId, sourceTable, kind, deductKey]
  );
  return r.rows[0] || null;
}

/**
 * 事件模式：按 source_id + kind 幂等查找
 * （source_id 与 intent.sourceId 比较，类型统一为字符串；kind 隔离不同事件适配器，
 *  避免共用 violation_records 的两个适配器互相误判「已存在」）
 */
async function findEventExisting(sourceTable, cycleId, targetId, sourceId, kind) {
  if (sourceId === undefined || sourceId === null || sourceId === '') return null;
  const r = await pool.query(
    `SELECT id, source_id, suggested_score, confirmed_score, review_status, is_deleted, source_detail
       FROM hse_assessment_deduction
      WHERE target_id = $1 AND cycle_id = $2 AND deduction_source = 'auto'
        AND source_table = $3 AND source_id = $4
        AND source_detail ->> 'kind' = $5
      ORDER BY id DESC LIMIT 1`,
    [targetId, cycleId, sourceTable, String(sourceId), String(kind)]
  );
  return r.rows[0] || null;
}

/**
 * 创建写入器实例
 * @param {object} config
 * @param {string} config.sourceTable  写入扣分行的 source_table
 * @param {string} config.kind         source_detail.kind
 * @param {(ctx:{cycleId:number, employeeId:number|string}) => string} config.deductKeyFn 幂等键生成函数
 * @param {'monthly'|'event'} [config.idempotency='monthly'] 幂等模式，默认月度（网格通路行为不变）
 */
function createDeductionWriter(config) {
  const { sourceTable, kind, deductKeyFn, idempotency = 'monthly' } = config;
  if (!sourceTable || !kind || typeof deductKeyFn !== 'function') {
    throw new Error('createDeductionWriter: sourceTable / kind / deductKeyFn 必填');
  }
  const isEvent = idempotency === 'event';

  // 统一按模式选择查找方式；revoke/upsert 均透传 sourceId（月度模式忽略之）
  async function findByIdempotency(cycleId, targetId, { employeeId, sourceId }) {
    if (isEvent) return findEventExisting(sourceTable, cycleId, targetId, sourceId, kind);
    const deductKey = deductKeyFn({ cycleId, employeeId });
    return findMonthlyExisting({ sourceTable, kind }, cycleId, targetId, deductKey);
  }

  /**
   * 写入/更新扣分明细（幂等 upsert）
   * @returns {'inserted'|'revived'|'updated'|'noop'|'locked'}
   */
  async function upsert(
    { cycleId, targetId, employeeId, metricId, metricCode, score, item, detail, sourceId, isTransmission },
    { dryRun = false } = {}
  ) {
    // 事件模式适配器（如 violation）的 buildDeductKey 依赖 sourceId，月度模式忽略之
    const deductKey = deductKeyFn({ cycleId, employeeId, sourceId });
    const fullDetail = { kind, deductKey, ...(detail || {}) };
    if (dryRun) return 'noop';

    const existing = await findByIdempotency(cycleId, targetId, { employeeId, sourceId });

    // 人工锁定：自动扫描不得覆盖/软删
    if (existing && LOCKED_STATUSES.has(existing.review_status)) return 'locked';

    const scoreId = await engine.ensureTargetScoreRecord(targetId, cycleId);
    // 事件模式写入真实 source_id；月度模式写 NULL
    const realSourceId = isEvent ? String(sourceId) : null;

    if (!existing) {
      await pool.query(
        `INSERT INTO hse_assessment_deduction
           (score_id, target_id, cycle_id, metric_id, metric_code, deduction_item,
            deduction_type, deduction_source, source_table, source_id, source_detail,
            suggested_score, current_version, review_status, is_transmission, is_deleted)
         VALUES ($1,$2,$3,$4,$5,$6,'auto_deduction','auto',$7,$8,$9,$10,1,'pending',$11,FALSE)`,
        [scoreId, targetId, cycleId, metricId, metricCode, item, sourceTable, realSourceId, fullDetail, score, isTransmission === true]
      );
      return 'inserted';
    }

    if (existing.is_deleted) {
      // 软删行复活：复用原行，重置为自动口径（含 source_id 校准）
      await pool.query(
        `UPDATE hse_assessment_deduction
            SET is_deleted = FALSE, suggested_score = $1, source_detail = $2,
                source_id = $3, review_status = 'pending', confirmed_score = NULL, updated_at = NOW()
          WHERE id = $4`,
        [score, fullDetail, realSourceId, existing.id]
      );
      return 'revived';
    }

    // 事件模式下，source_id 列变化（记录换挂他人）也视为变更
    const scoreChanged = Math.abs(Number(existing.suggested_score) - score) > 0.001;
    const detailChanged =
      stableStringify(stableDetailSubset(existing.source_detail || null)) !== stableStringify(stableDetailSubset(fullDetail)) ||
      (isEvent && String(existing.source_id) !== String(sourceId));
    if (scoreChanged || detailChanged) {
      await pool.query(
        `UPDATE hse_assessment_deduction
            SET suggested_score = $1, source_detail = $2, updated_at = NOW()
          WHERE id = $3`,
        [score, fullDetail, existing.id]
      );
      return 'updated';
    }
    return 'noop';
  }

  /**
   * 撤销扣分明细（软删）
   * @returns {'removed'|'none'|'locked'}
   */
  async function revoke({ cycleId, targetId, employeeId, sourceId }, { dryRun = false } = {}) {
    const existing = await findByIdempotency(cycleId, targetId, { employeeId, sourceId });
    if (!existing) return 'none';
    if (LOCKED_STATUSES.has(existing.review_status)) return 'locked';
    if (dryRun) return 'removed';
    await pool.query(
      `UPDATE hse_assessment_deduction SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`,
      [existing.id]
    );
    return 'removed';
  }

  return {
    upsert,
    revoke,
    // 对外暴露查找（月度语义，按 employeeId 解析 deductKey；事件模式忽略 employeeId 用 sourceId）
    findExisting: (cycleId, targetId, employeeId, sourceId) =>
      findByIdempotency(cycleId, targetId, { employeeId, sourceId }),
  };
}

module.exports = {
  createDeductionWriter,
  findMonthlyExisting,
  findEventExisting,
  stableStringify,
  LOCKED_STATUSES,
};
