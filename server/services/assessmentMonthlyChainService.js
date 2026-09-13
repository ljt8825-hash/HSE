/**
 * HSE月度安全履职考核模块 · 三违责任传导服务（第8节 /chain）
 * 从 routes/hse-assessment-monthly.js 迁移，业务规则 + SQL，无 express 依赖。
 * 返回统一描述符供 controller 包装（__t: json / list / error）。
 * 复用共享：TABLES / CYCLE_STATUS / DEDUCTION_SOURCE / VIOLATION_DEDUCTION /
 *           TRANSMISSION_RATIO / CHAIN_LEVEL / getPagination / getSort / recordAudit。
 */

const { camelKeys } = require('../utils/commonResponse');
const {
  pool,
  logger,
  TABLES,
  CYCLE_STATUS,
  DEDUCTION_SOURCE,
  VIOLATION_DEDUCTION,
  TRANSMISSION_RATIO,
  CHAIN_LEVEL,
  getPagination,
  getSort,
  recordAudit,
} = require('./assessmentMonthlyShared');

// 8.1 生成三违责任传导扣分
async function generateChain(user, body) {
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
      return { __t: 'error', code: 409, message: '已冻结的周期不可生成责任传导' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `DELETE FROM ${TABLES.deduction}
         WHERE cycle_id = $1 AND deduction_source = $2 AND is_transmission = TRUE AND is_deleted = FALSE`,
        [cycle_id, DEDUCTION_SOURCE.CHAIN_TRANSMISSION]
      );

      const violationsResult = await client.query(
        `SELECT v.*, t.id as target_id, t.employee_name, t.position, t.township
         FROM ${TABLES.violation} v
         INNER JOIN ${TABLES.target} t ON v.violator_id = t.employee_id AND t.cycle_id = $1
         WHERE v.violation_date >= $2
           AND v.violation_date <= $3
           AND v.is_deleted = FALSE
           AND t.is_deleted = FALSE`,
        [cycle_id, cycle.start_time, cycle.end_time]
      );

      let generatedCount = 0;
      let skippedCount = 0;

      const metricResult = await client.query(
        `SELECT * FROM ${TABLES.metric}
         WHERE data_source = 'violation_records' AND status = 'active' AND is_deleted = FALSE
         LIMIT 1`
      );
      const metric = metricResult.rows[0];

      if (metric) {
        for (const violation of violationsResult.rows) {
          const supervisorResult = await client.query(
            `SELECT supervisor_id, supervisor_name, position_name as supervisor_position
             FROM v_employee_org_full
             WHERE employee_id = $1 AND relation_status = 'active'
             LIMIT 1`,
            [violation.violator_id]
          );

          if (supervisorResult.rows.length === 0 || !supervisorResult.rows[0].supervisor_id) {
            skippedCount++;
            continue;
          }

          const supervisor = supervisorResult.rows[0];

          const managerTargetResult = await client.query(
            `SELECT * FROM ${TABLES.target}
             WHERE employee_id = $1 AND cycle_id = $2 AND is_deleted = FALSE
             LIMIT 1`,
            [supervisor.supervisor_id, cycle_id]
          );

          if (managerTargetResult.rows.length === 0) {
            skippedCount++;
            continue;
          }

          const managerTarget = managerTargetResult.rows[0];

          const personalDeduction = VIOLATION_DEDUCTION;
          const transmissionDeduction = Math.round(personalDeduction * TRANSMISSION_RATIO * 100) / 100;

          await client.query(
            `INSERT INTO ${TABLES.chain}
              (subordinate_id, subordinate_name, subordinate_post,
               manager_id, manager_name, manager_post, township,
               relation_type, chain_level, effective_date, is_active, is_deleted)
             SELECT $1, $2, $3, $4, $5, $6, $7, 'direct_supervisor', $8, $9, TRUE, FALSE
             WHERE NOT EXISTS (
               SELECT 1 FROM ${TABLES.chain}
               WHERE subordinate_id = $1 AND manager_id = $4 AND is_active = TRUE AND is_deleted = FALSE
             )`,
            [violation.violator_id, violation.violator_name, violation.position,
             supervisor.supervisor_id, supervisor.supervisor_name, supervisor.supervisor_position,
             violation.township || managerTarget.township,
             CHAIN_LEVEL, violation.violation_date]
          );

          let scoreResult = await client.query(
            `SELECT id FROM ${TABLES.score}
             WHERE target_id = $1 AND metric_id = $2 AND is_deleted = FALSE
             LIMIT 1`,
            [managerTarget.id, metric.id]
          );

          let scoreId = scoreResult.rows[0]?.id;

          if (!scoreId) {
            const insertScoreResult = await client.query(
              `INSERT INTO ${TABLES.score}
                (target_id, cycle_id, metric_id, metric_code, raw_value, raw_value_desc,
                 deduction_total, original_score, final_score, is_auto, is_manual,
                 review_status, calc_time)
               VALUES ($1, $2, $3, $4, 0, '责任传导扣分', 0, $5, $5, TRUE, FALSE, 'pending', NOW())
               RETURNING id`,
              [managerTarget.id, cycle_id, metric.id, metric.metric_code, metric.base_score]
            );
            scoreId = insertScoreResult.rows[0].id;
          }

          await client.query(
            `INSERT INTO ${TABLES.deduction}
              (score_id, target_id, cycle_id, metric_id, metric_code, deduction_item,
               deduction_type, deduction_source, source_table, source_id, source_detail,
               suggested_score, review_status, violation_level, violation_date,
               violator_id, violator_name, is_transmission, remark, current_version)
             VALUES ($1, $2, $3, $4, $5, $6,
                     $7, $8, $9, $10, $11::jsonb,
                     $12, 'pending', $13, $14,
                     $15, $16, TRUE, $17, 1)`,
            [scoreId, managerTarget.id, cycle_id, metric.id, metric.metric_code,
             `责任传导-${violation.violator_name}-三违`,
             'responsibility_transmission',
             DEDUCTION_SOURCE.CHAIN_TRANSMISSION,
             'violation_records',
             violation.id,
             JSON.stringify({
               violation_id: violation.id,
               violation_no: violation.no,
               violation_type: violation.violation_type,
               violation_level: violation.violation_level,
               subordinate_id: violation.violator_id,
               subordinate_name: violation.violator_name,
               manager_id: supervisor.supervisor_id,
               manager_name: supervisor.supervisor_name,
               personal_deduction: personalDeduction,
               transmission_ratio: TRANSMISSION_RATIO,
               chain_level: CHAIN_LEVEL,
             }),
             transmissionDeduction,
             violation.violation_level,
             violation.violation_date,
             violation.violator_id,
             violation.violator_name,
             `责任传导：下属${violation.violator_name}三违，直属上级传导100%责任（chain_level=1）`]
          );

          generatedCount++;
        }
      }

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'GENERATE_CHAIN', 'DEDUCTION', cycle_id, cycle.cycle_code,
        { generated: generatedCount, skipped: skippedCount }, '生成三违责任传导扣分', user.ip);

      return {
        __t: 'json',
        payload: camelKeys({ cycle_id, generated: generatedCount, skipped: skippedCount }),
        message: `责任传导扣分项生成完成，共生成${generatedCount}条`,
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-chain] 生成失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '生成三违责任传导失败' };
  }
}

// 8.2 责任链关系列表
async function listChainRelations(query) {
  try {
    const { township, manager_id, subordinate_id, is_active, keyword } = query;
    const { page, pageSize, offset } = getPagination(query);
    const { sortBy, sortOrder } = getSort(query, 'created_at', 'desc');

    const conditions = ['is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    if (township) {
      conditions.push(`township = $${idx++}`);
      params.push(township);
    }
    if (manager_id) {
      conditions.push(`manager_id = $${idx++}`);
      params.push(manager_id);
    }
    if (subordinate_id) {
      conditions.push(`subordinate_id = $${idx++}`);
      params.push(subordinate_id);
    }
    if (is_active !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      params.push(is_active === 'true' || is_active === true);
    }
    if (keyword) {
      conditions.push(`(subordinate_name LIKE $${idx} OR manager_name LIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT count(*) as cnt FROM ${TABLES.chain} ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].cnt);

    const result = await pool.query(
      `SELECT * FROM ${TABLES.chain} ${where} ORDER BY ${sortBy} ${sortOrder} LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    );

    return { __t: 'list', list: result.rows, total, page, pageSize, message: '查询成功', camelCase: true };
  } catch (e) {
    logger.error(`[assessment-chain] 关系列表查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询责任链关系失败' };
  }
}

module.exports = { generateChain, listChainRelations };