/**
 * HSE月度安全履职考核模块 · 评分引擎服务（第4节 /scoring）
 * 从 routes/hse-assessment-monthly.js 迁移，业务规则 + SQL，无 express 依赖。
 * 返回统一描述符供 controller 包装（__t: json / error）。
 * 复用既有服务：assessmentScoringEngine（recalculateCycle / recalculateTarget）、
 *               gridUncheckedDeductionService（syncGridUncheckedDeductions）。
 * 复用共享：TABLES / CYCLE_STATUS / TARGET_STATUS / DEDUCTION_SOURCE / recordAudit。
 */

const { camelKeys } = require('../utils/commonResponse');
const {
  pool,
  logger,
  TABLES,
  CYCLE_STATUS,
  TARGET_STATUS,
  DEDUCTION_SOURCE,
  recordAudit,
} = require('./assessmentMonthlyShared');
const engine = require('./assessmentScoringEngine');
const gridUncheckedDeduction = require('./gridUncheckedDeductionService');

// 4.1 执行自动评分
async function executeScoring(user, body) {
  try {
    const { cycle_id } = body;

    if (!cycle_id) {
      return { __t: 'error', code: 400, message: '周期ID不能为空' };
    }

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycle_id]
    );
    if (cycleResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核周期不存在' };
    }

    const cycle = cycleResult.rows[0];
    if (cycle.status === CYCLE_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的周期不可评分' };
    }
    if (cycle.status === CYCLE_STATUS.NOT_STARTED) {
      return { __t: 'error', code: 409, message: '未启动的周期不可评分，请先启动周期' };
    }

    // 当场扫描「网格长未巡查」缺次扣分（幂等 upsert，随后统一重算）
    let uncheckedSync = null;
    try {
      uncheckedSync = await gridUncheckedDeduction.syncGridUncheckedDeductions(cycle_id);
    } catch (e) {
      logger.warn(`[assessment-scoring] 网格未巡查扫描失败（不阻断评分）: ${e.message}`);
    }

    const results = await engine.recalculateCycle(cycle_id);
    const okResults = results.filter((r) => r && r.ok === true);
    const failed = results
      .filter((r) => !(r && r.ok === true))
      .map((r) => `#${r.targetId}:${r.reason || r.error || 'fail'}`);

    await pool.query(
      `UPDATE ${TABLES.target}
       SET status = $1, updated_at = NOW()
       WHERE cycle_id = $2 AND is_deleted = FALSE
         AND score_auto IS NOT NULL AND status <> $1`,
      [TARGET_STATUS.SCORED, cycle_id]
    );

    const scoredCountResult = await pool.query(
      `SELECT count(*)::int AS cnt FROM ${TABLES.target}
       WHERE cycle_id = $1 AND is_deleted = FALSE AND status = $2`,
      [cycle_id, TARGET_STATUS.SCORED]
    );
    const scoredCount = scoredCountResult.rows[0].cnt;

    await pool.query(
      `UPDATE ${TABLES.cycle}
       SET status = $1, scored_count = $2
       WHERE id = $3`,
      [CYCLE_STATUS.PENDING_REVIEW, scoredCount, cycle_id]
    );

    const newVersionResult = await pool.query(
      `SELECT COALESCE(MAX(score_version),0)::int AS v FROM ${TABLES.target} WHERE cycle_id = $1`,
      [cycle_id]
    );
    const newVersion = newVersionResult.rows[0].v;

    const gridUncheckedInfo = uncheckedSync
      ? {
          ok: !!uncheckedSync.ok,
          reason: uncheckedSync.ok ? null : (uncheckedSync.reason || 'unknown'),
          scanned: uncheckedSync.scanned || 0,
          affected: uncheckedSync.affected || 0,
          dryRun: !!uncheckedSync.dryRun,
        }
      : null;

    await recordAudit(user.id, user.name, user.role, 'CALCULATE', 'SCORE', cycle_id, cycle.cycle_code,
      { scored_count: scoredCount, version: newVersion, engine: 'event-driven', recalculated: okResults.length, failed,
        grid_unchecked: gridUncheckedInfo },
      '执行自动评分（事件引擎口径）', user.ip);

    return {
      __t: 'json',
      payload: camelKeys({
        cycle_id,
        scored_count: scoredCount,
        score_version: newVersion,
        status: CYCLE_STATUS.PENDING_REVIEW,
        grid_unchecked: gridUncheckedInfo,
      }),
      message: '自动评分执行完成',
    };
  } catch (e) {
    logger.error(`[assessment-scoring] 执行失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '执行自动评分失败' };
  }
}

// 4.2 查询评分进度
async function getScoringProgress(cycleId) {
  try {
    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycleId]
    );
    if (cycleResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核周期不存在' };
    }

    const cycle = cycleResult.rows[0];
    const progress = cycle.target_count > 0
      ? Math.round((cycle.scored_count / cycle.target_count) * 100)
      : 0;

    return {
      __t: 'json',
      payload: camelKeys({
        cycle_id: cycle.id,
        total_targets: cycle.target_count,
        scored_count: cycle.scored_count,
        reviewed_count: cycle.reviewed_count,
        frozen_count: cycle.frozen_count,
        progress_percent: progress,
        cycle_status: cycle.status,
      }),
    };
  } catch (e) {
    logger.error(`[assessment-scoring] 进度查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询评分进度失败' };
  }
}

// 4.3 重新计算评分
async function recalculateScoring(user, body) {
  try {
    const { cycle_id } = body;

    if (!cycle_id) {
      return { __t: 'error', code: 400, message: '周期ID不能为空' };
    }

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycle_id]
    );
    if (cycleResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核周期不存在' };
    }

    const cycle = cycleResult.rows[0];
    if (cycle.status === CYCLE_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的周期不可重新评分' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE ${TABLES.target} 
         SET status = $1, score_auto = NULL, score_total = NULL, 
             grade = NULL, rank_township = NULL, rank_all = NULL,
             review_status = 'pending', review_progress = 0
         WHERE cycle_id = $2 AND is_deleted = FALSE`,
        [TARGET_STATUS.PENDING, cycle_id]
      );

      await client.query(
        `DELETE FROM ${TABLES.score} 
         WHERE cycle_id = $1 AND is_deleted = FALSE`,
        [cycle_id]
      );

      await client.query(
        `DELETE FROM ${TABLES.deduction} 
         WHERE cycle_id = $1 AND is_deleted = FALSE AND deduction_source = $2`,
        [cycle_id, DEDUCTION_SOURCE.AUTO]
      );

      await client.query(
        `UPDATE ${TABLES.cycle} 
         SET status = $1, scored_count = 0, reviewed_count = 0
         WHERE id = $2`,
        [CYCLE_STATUS.IN_PROGRESS, cycle_id]
      );

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'RECALCULATE', 'SCORE', cycle_id, cycle.cycle_code,
        null, '重新计算评分（清空旧数据）', user.ip);

      return {
        __t: 'json',
        payload: camelKeys({
          cycle_id,
          status: CYCLE_STATUS.IN_PROGRESS,
          message: '已清空旧评分数据，请重新执行评分',
        }),
        message: '重新计算初始化完成',
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-scoring] 重算失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '重新计算评分失败' };
  }
}

module.exports = {
  executeScoring,
  getScoringProgress,
  recalculateScoring,
};