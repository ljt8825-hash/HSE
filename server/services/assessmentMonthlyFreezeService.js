/**
 * HSE月度安全履职考核模块 · 冻结管理服务（第9节 /freeze）
 * 从 routes/hse-assessment-monthly.js 迁移，业务规则 + SQL，无 express 依赖。
 * 返回统一描述符供 controller 包装（__t: json / error）。
 * 复用共享：TABLES / CYCLE_STATUS / recordAudit。
 */

const { camelKeys } = require('../utils/commonResponse');
const {
  pool,
  logger,
  TABLES,
  CYCLE_STATUS,
  recordAudit,
} = require('./assessmentMonthlyShared');

// 9.1 冻结周期
async function freezeCycle(user, id) {
  try {
    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (cycleResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核周期不存在' };
    }

    const cycle = cycleResult.rows[0];
    if (cycle.status === CYCLE_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '该周期已冻结' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const pendingResult = await client.query(
        `SELECT count(*) as cnt FROM ${TABLES.target} 
         WHERE cycle_id = $1 AND is_deleted = FALSE 
           AND review_status != 'approved'`,
        [id]
      );
      if (parseInt(pendingResult.rows[0].cnt) > 0) {
        await client.query('ROLLBACK');
        return { __t: 'error', code: 409, message: `还有${pendingResult.rows[0].cnt}个对象未完成审核，不可冻结` };
      }

      const townshipsResult = await client.query(
        `SELECT DISTINCT township FROM ${TABLES.target} 
         WHERE cycle_id = $1 AND is_deleted = FALSE AND township IS NOT NULL`,
        [id]
      );

      for (const row of townshipsResult.rows) {
        const township = row.township;
        await client.query(
          `UPDATE ${TABLES.target} t
           SET rank_township = sub.rn
           FROM (
             SELECT id, ROW_NUMBER() OVER (ORDER BY score_total DESC, id ASC) as rn
             FROM ${TABLES.target}
             WHERE cycle_id = $1 AND is_deleted = FALSE AND township = $2
           ) sub
           WHERE t.id = sub.id AND t.cycle_id = $1`,
          [id, township]
        );
      }

      await client.query(
        `UPDATE ${TABLES.target} t
         SET rank_all = sub.rn
         FROM (
           SELECT id, ROW_NUMBER() OVER (ORDER BY score_total DESC, id ASC) as rn
           FROM ${TABLES.target}
           WHERE cycle_id = $1 AND is_deleted = FALSE
         ) sub
         WHERE t.id = sub.id AND t.cycle_id = $1`,
        [id]
      );

      await client.query(
        `UPDATE ${TABLES.cycle} 
         SET status = 'frozen', frozen_by = $1, frozen_by_name = $2, frozen_at = NOW()
         WHERE id = $3`,
        [user.id, user.name, id]
      );

      await client.query(
        `UPDATE ${TABLES.target} SET status = 'frozen' 
         WHERE cycle_id = $1 AND is_deleted = FALSE`,
        [id]
      );

      const frozenResult = await client.query(
        `SELECT count(*) as cnt FROM ${TABLES.target} 
         WHERE cycle_id = $1 AND is_deleted = FALSE AND status = 'frozen'`,
        [id]
      );

      await client.query(
        `UPDATE ${TABLES.cycle} SET frozen_count = $1 WHERE id = $2`,
        [parseInt(frozenResult.rows[0].cnt), id]
      );

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'FREEZE', 'CYCLE', parseInt(id), cycle.cycle_code,
        { frozen_count: parseInt(frozenResult.rows[0].cnt) }, '冻结考核周期', user.ip);

      return {
        __t: 'json',
        payload: camelKeys({
          cycle_id: parseInt(id),
          status: CYCLE_STATUS.FROZEN,
          frozen_count: parseInt(frozenResult.rows[0].cnt),
        }),
        message: '考核周期已冻结',
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-freeze] 冻结失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '冻结考核周期失败' };
  }
}

// 9.2 解冻周期
async function unfreezeCycle(user, body) {
  try {
    const { cycle_id, unfreeze_reason } = body;

    if (!cycle_id || !unfreeze_reason) {
      return { __t: 'error', code: 400, message: '周期ID和解冻原因不能为空' };
    }

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycle_id]
    );
    if (cycleResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核周期不存在' };
    }

    const cycle = cycleResult.rows[0];
    if (cycle.status !== CYCLE_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '该周期未冻结，不可解冻' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE ${TABLES.cycle} 
         SET status = 'reviewed', frozen_by = NULL, frozen_by_name = NULL, frozen_at = NULL
         WHERE id = $1`,
        [cycle_id]
      );

      await client.query(
        `UPDATE ${TABLES.target} SET status = 'scored' 
         WHERE cycle_id = $1 AND is_deleted = FALSE AND status = 'frozen'`,
        [cycle_id]
      );

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'UNFREEZE', 'CYCLE', cycle_id, cycle.cycle_code,
        null, unfreeze_reason, user.ip);

      return {
        __t: 'json',
        payload: camelKeys({ cycle_id, status: CYCLE_STATUS.REVIEWED }),
        message: '考核周期已解冻',
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-freeze] 解冻失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '解冻考核周期失败' };
  }
}

module.exports = { freezeCycle, unfreezeCycle };