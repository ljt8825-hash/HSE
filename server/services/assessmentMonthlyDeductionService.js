/**
 * HSE月度安全履职考核模块 · 扣分服务（第5、6、7节 /deductions）
 * 从 routes/hse-assessment-monthly.js 迁移，业务规则 + SQL，无 express 依赖。
 * 返回统一描述符供 controller 包装（__t: list / detail / json / raw / error）。
 * 说明：5.3/5.4 原 handler 在 success(...) 后追加顶层 capWarning 字段（非标准响应），
 *       以 __t:'raw' 携带完整 body 保序（capWarning 未命中则不追加）。
 * 复用既有服务：assessmentScoringEngine / ruleEngine.categoryCap。
 * 复用共享：TABLES / REVIEW_STATUS / DEDUCTION_SOURCE / TARGET_STATUS / getPagination /
 *           getSort / recordAudit / resolveOperatorEmployeeId。
 */

const { success } = require('../middleware/response');
const { camelKeys } = require('../utils/commonResponse');
const {
  pool,
  logger,
  TABLES,
  REVIEW_STATUS,
  DEDUCTION_SOURCE,
  TARGET_STATUS,
  getPagination,
  getSort,
  recordAudit,
  resolveOperatorEmployeeId,
} = require('./assessmentMonthlyShared');
const engine = require('./assessmentScoringEngine');
const categoryCap = require('./ruleEngine/categoryCap');
const gridUncheckedDeduction = require('./gridUncheckedDeductionService');

// 5.1 查询扣分明细列表
async function listDeductions(query) {
  try {
    const { cycle_id, target_id, metric_id, review_status, deduction_type, deduction_source, is_transmission, keyword } = query;
    const { page, pageSize, offset } = getPagination(query);
    const { sortBy, sortOrder } = getSort(query, 'created_at', 'desc');

    const conditions = ['d.is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    if (cycle_id) {
      conditions.push(`d.cycle_id = $${idx++}`);
      params.push(cycle_id);
    }
    if (target_id) {
      conditions.push(`d.target_id = $${idx++}`);
      params.push(target_id);
    }
    if (metric_id) {
      conditions.push(`d.metric_id = $${idx++}`);
      params.push(metric_id);
    }
    if (review_status) {
      conditions.push(`d.review_status = $${idx++}`);
      params.push(review_status);
    }
    if (deduction_type) {
      conditions.push(`d.deduction_type = $${idx++}`);
      params.push(deduction_type);
    }
    if (deduction_source) {
      conditions.push(`d.deduction_source = $${idx++}`);
      params.push(deduction_source);
    }
    if (is_transmission !== undefined) {
      conditions.push(`d.is_transmission = $${idx++}`);
      params.push(is_transmission === 'true' || is_transmission === true);
    }
    if (keyword) {
      conditions.push(`(d.deduction_item LIKE $${idx} OR d.violator_name LIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT count(*) as cnt FROM ${TABLES.deduction} d ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].cnt);

    const result = await pool.query(
      `SELECT d.*, t.employee_name, t.employee_code, t.status AS target_status, m.metric_name, m.category
       FROM ${TABLES.deduction} d
       LEFT JOIN ${TABLES.target} t ON d.target_id = t.id
       LEFT JOIN ${TABLES.metric} m ON d.metric_id = m.id
       ${where} 
       ORDER BY d.${sortBy} ${sortOrder} 
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    );

    return { __t: 'list', list: result.rows, total, page, pageSize, message: '查询成功', camelCase: true };
  } catch (e) {
    logger.error(`[assessment-deduction] 列表查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询扣分明细失败' };
  }
}

// 5.2 获取扣分明细详情
async function getDeduction(id) {
  try {
    const result = await pool.query(
      `SELECT d.*, t.employee_name, t.employee_code, m.metric_name, m.category
       FROM ${TABLES.deduction} d
       LEFT JOIN ${TABLES.target} t ON d.target_id = t.id
       LEFT JOIN ${TABLES.metric} m ON d.metric_id = m.id
       WHERE d.id = $1 AND d.is_deleted = FALSE`,
      [id]
    );
    if (result.rows.length === 0) {
      return { __t: 'error', code: 404, message: '扣分明细不存在' };
    }
    return { __t: 'detail', data: result.rows[0], message: '查询成功', camelCase: true };
  } catch (e) {
    logger.error(`[assessment-deduction] 详情查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询扣分明细详情失败' };
  }
}

// 5.3 手动添加扣分
async function createDeduction(user, body) {
  try {
    const {
      target_id, cycle_id, metric_id, deduction_item, deduction_type,
      suggested_score, violation_level, violation_date, violator_id,
      violator_name, remark
    } = body;

    if (!target_id || !metric_id || !deduction_item || !deduction_type || suggested_score === undefined) {
      return { __t: 'error', code: 400, message: '必填字段不能为空' };
    }

    const targetResult = await pool.query(
      `SELECT * FROM ${TABLES.target} WHERE id = $1 AND is_deleted = FALSE`,
      [target_id]
    );
    if (targetResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核对象不存在' };
    }
    if (targetResult.rows[0].status === TARGET_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的对象不可添加扣分' };
    }

    let finalScore = suggested_score;
    if (deduction_item) {
      const stdResult = await pool.query(
        `SELECT deduction_score, rule_type FROM ${TABLES.standard}
         WHERE (position = $1 OR position_name = $1) AND item_name = $2 AND is_deleted = FALSE AND is_active = TRUE
         ORDER BY id DESC LIMIT 1`,
        [targetResult.rows[0].position, deduction_item]
      );
      if (stdResult.rows.length > 0) {
        const std = stdResult.rows[0];
        if (std.rule_type === 'deduction' && std.deduction_score != null) {
          finalScore = Math.abs(Number(std.deduction_score));
        } else if (std.rule_type === 'veto' && std.deduction_score != null) {
          finalScore = Math.abs(Number(std.deduction_score));
        }
      }
    }
    if (finalScore === undefined || finalScore === null) {
      return { __t: 'error', code: 400, message: '必填字段不能为空' };
    }

    const metricResult = await pool.query(
      `SELECT * FROM ${TABLES.metric} WHERE id = $1 AND is_deleted = FALSE`,
      [metric_id]
    );
    if (metricResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核指标不存在' };
    }

    const scoreResult = await pool.query(
      `SELECT id FROM ${TABLES.score} 
       WHERE target_id = $1 AND metric_id = $2 AND is_deleted = FALSE
       LIMIT 1`,
      [target_id, metric_id]
    );

    let scoreId = scoreResult.rows[0]?.id;

    if (!scoreId) {
      const insertScoreResult = await pool.query(
        `INSERT INTO ${TABLES.score} 
          (target_id, cycle_id, metric_id, metric_code, raw_value, raw_value_desc,
           deduction_total, original_score, final_score, is_auto, is_manual,
           review_status, calc_time)
         VALUES ($1, $2, $3, $4, 0, '手动添加', 0, $5, $5, FALSE, TRUE, 'pending', NOW())
         RETURNING id`,
        [target_id, cycle_id || targetResult.rows[0].cycle_id, metric_id,
         metricResult.rows[0].metric_code, metricResult.rows[0].base_score]
      );
      scoreId = insertScoreResult.rows[0].id;
    }

    let capWarning = null;
    try {
      capWarning = await categoryCap.computeManualCapWarning({
        cycleId: cycle_id || targetResult.rows[0].cycle_id,
        targetId: target_id,
        deductionItem: deduction_item,
        sourceDetail: null,
        adding: finalScore,
        role: targetResult.rows[0].position === '管理员' ? 'admin' : 'manager',
      });
    } catch (e) {
      logger.warn(`[assessment-deduction] 上限提示计算失败(忽略): ${e.message}`);
    }

    const result = await pool.query(
      `INSERT INTO ${TABLES.deduction} 
        (score_id, target_id, cycle_id, metric_id, metric_code, deduction_item,
         deduction_type, deduction_source, suggested_score, review_status,
         violation_level, violation_date, violator_id, violator_name,
         is_transmission, remark, current_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending',
               $10, $11, $12, $13, FALSE, $14, 1)
       RETURNING *`,
      [scoreId, target_id, cycle_id || targetResult.rows[0].cycle_id, metric_id,
       metricResult.rows[0].metric_code, deduction_item, deduction_type,
       DEDUCTION_SOURCE.MANUAL, finalScore, violation_level || null,
       violation_date || null, violator_id || null, violator_name || null,
       remark || null]
    );

    await recordAudit(user.id, user.name, user.role, 'CREATE', 'DEDUCTION', result.rows[0].id, deduction_item,
      { suggested_score: finalScore, deduction_type }, '手动添加扣分', user.ip);

    const resp = success(camelKeys(result.rows[0]), '扣分明细添加成功');
    if (capWarning) resp.capWarning = capWarning;
    return { __t: 'raw', body: resp };
  } catch (e) {
    logger.error(`[assessment-deduction] 添加失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '添加扣分明细失败' };
  }
}

// 5.4 更新扣分（仅草稿状态）
async function updateDeduction(user, id, body) {
  try {
    const { deduction_item, deduction_type, suggested_score, violation_level, violation_date, remark } = body;

    const deductionResult = await pool.query(
      `SELECT * FROM ${TABLES.deduction} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (deductionResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '扣分明细不存在' };
    }

    const deduction = deductionResult.rows[0];
    if (deduction.review_status !== REVIEW_STATUS.PENDING) {
      return { __t: 'error', code: 409, message: '仅待审核状态的扣分明细可修改' };
    }
    if (deduction.deduction_source === DEDUCTION_SOURCE.AUTO) {
      return { __t: 'error', code: 409, message: '自动生成的扣分明细不可直接修改，请使用调整功能' };
    }

    const targetResult = await pool.query(
      `SELECT status, position FROM ${TABLES.target} WHERE id = $1`,
      [deduction.target_id]
    );
    if (targetResult.rows[0]?.status === TARGET_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的对象不可修改扣分' };
    }

    const updateFields = [];
    const params = [];
    let idx = 1;

    if (deduction_item !== undefined) {
      updateFields.push(`deduction_item = $${idx++}`);
      params.push(deduction_item);
    }
    if (deduction_type !== undefined) {
      updateFields.push(`deduction_type = $${idx++}`);
      params.push(deduction_type);
    }
    if (suggested_score !== undefined) {
      updateFields.push(`suggested_score = $${idx++}`);
      params.push(suggested_score);
    }
    if (violation_level !== undefined) {
      updateFields.push(`violation_level = $${idx++}`);
      params.push(violation_level);
    }
    if (violation_date !== undefined) {
      updateFields.push(`violation_date = $${idx++}`);
      params.push(violation_date);
    }
    if (remark !== undefined) {
      updateFields.push(`remark = $${idx++}`);
      params.push(remark);
    }

    if (updateFields.length === 0) {
      return { __t: 'detail', data: deduction, message: '无需更新', camelCase: true };
    }

    let capWarning = null;
    try {
      capWarning = await categoryCap.computeManualCapWarning({
        cycleId: deduction.cycle_id,
        targetId: deduction.target_id,
        deductionItem: deduction_item !== undefined ? deduction_item : deduction.deduction_item,
        sourceDetail: deduction.source_detail || null,
        adding: suggested_score !== undefined ? suggested_score : deduction.suggested_score,
        excludeId: id,
        role: targetResult.rows[0]?.position === '管理员' ? 'admin' : 'manager',
      });
    } catch (e) {
      logger.warn(`[assessment-deduction] 上限提示计算失败(忽略): ${e.message}`);
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE ${TABLES.deduction} SET ${updateFields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await recordAudit(user.id, user.name, user.role, 'UPDATE', 'DEDUCTION', parseInt(id), deduction.deduction_item,
      { old: deduction, new: result.rows[0] }, '更新扣分明细', user.ip);

    const resp = success(camelKeys(result.rows[0]), '扣分明细更新成功');
    if (capWarning) resp.capWarning = capWarning;
    return { __t: 'raw', body: resp };
  } catch (e) {
    logger.error(`[assessment-deduction] 更新失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '更新扣分明细失败' };
  }
}

// 5.5 删除扣分（仅草稿状态）
async function deleteDeduction(user, id) {
  try {
    const deductionResult = await pool.query(
      `SELECT * FROM ${TABLES.deduction} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (deductionResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '扣分明细不存在' };
    }

    const deduction = deductionResult.rows[0];
    if (deduction.review_status === REVIEW_STATUS.APPROVED) {
      return { __t: 'error', code: 409, message: '已审核通过的扣分明细不可删除' };
    }

    const targetResult = await pool.query(
      `SELECT status FROM ${TABLES.target} WHERE id = $1`,
      [deduction.target_id]
    );
    if (targetResult.rows[0]?.status === TARGET_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的对象不可删除扣分' };
    }

    await pool.query(
      `UPDATE ${TABLES.deduction} SET is_deleted = TRUE WHERE id = $1`,
      [id]
    );

    await recordAudit(user.id, user.name, user.role, 'DELETE', 'DEDUCTION', parseInt(id), deduction.deduction_item,
      null, '删除扣分明细', user.ip);

    return { __t: 'json', payload: null, message: '扣分明细已删除' };
  } catch (e) {
    logger.error(`[assessment-deduction] 删除失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '删除扣分明细失败' };
  }
}

// 6.1 审核通过
async function approveDeduction(user, body) {
  try {
    const { deduction_id, confirmed_score, review_comment } = body;

    if (!deduction_id) {
      return { __t: 'error', code: 400, message: '扣分明细ID不能为空' };
    }

    const deductionResult = await pool.query(
      `SELECT * FROM ${TABLES.deduction} WHERE id = $1 AND is_deleted = FALSE`,
      [deduction_id]
    );
    if (deductionResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '扣分明细不存在' };
    }

    const deduction = deductionResult.rows[0];
    if (deduction.review_status === REVIEW_STATUS.APPROVED) {
      return { __t: 'error', code: 409, message: '该扣分明细已审核通过' };
    }

    const targetResult = await pool.query(
      `SELECT status FROM ${TABLES.target} WHERE id = $1`,
      [deduction.target_id]
    );
    if (targetResult.rows[0]?.status === TARGET_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的对象不可审核' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const finalConfirmed = confirmed_score != null && confirmed_score !== '' ? Number(confirmed_score) : deduction.suggested_score;

      await client.query(
        `UPDATE ${TABLES.deduction} 
         SET review_status = 'approved',
             confirmed_score = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [finalConfirmed, deduction_id]
      );

      await client.query('COMMIT');

      await engine.recalculateTarget(deduction.cycle_id, deduction.target_id);

      await recordAudit(user.id, user.name, user.role, 'REVIEW_APPROVE', 'DEDUCTION', deduction.id, deduction.deduction_item,
        { confirmed_score: finalConfirmed, review_comment }, '审核扣分明细通过', user.ip);

      return { __t: 'json', payload: null, message: '扣分明细审核通过' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-deduction] 审核通过失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '审核扣分明细失败' };
  }
}

// 6.2 审核驳回
async function rejectDeduction(user, body) {
  try {
    const { deduction_id, reject_reason } = body;

    if (!deduction_id || !reject_reason) {
      return { __t: 'error', code: 400, message: '扣分明细ID和驳回原因不能为空' };
    }

    const deductionResult = await pool.query(
      `SELECT * FROM ${TABLES.deduction} WHERE id = $1 AND is_deleted = FALSE`,
      [deduction_id]
    );
    if (deductionResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '扣分明细不存在' };
    }

    const deduction = deductionResult.rows[0];
    const targetResult = await pool.query(
      `SELECT status FROM ${TABLES.target} WHERE id = $1`,
      [deduction.target_id]
    );
    if (targetResult.rows[0]?.status === TARGET_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的对象不可驳回' };
    }

    await pool.query(
      `UPDATE ${TABLES.deduction} 
       SET review_status = 'rejected', remark = COALESCE(remark, '') || $1, updated_at = NOW()
       WHERE id = $2`,
      [`\n驳回原因: ${reject_reason}`, deduction_id]
    );

    await engine.recalculateTarget(deduction.cycle_id, deduction.target_id);

    await recordAudit(user.id, user.name, user.role, 'REVIEW_REJECT', 'DEDUCTION', deduction.id, deduction.deduction_item,
      { reject_reason }, '驳回扣分明细', user.ip);

    return { __t: 'json', payload: null, message: '扣分明细已驳回' };
  } catch (e) {
    logger.error(`[assessment-deduction] 驳回失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '驳回扣分明细失败' };
  }
}

// 6.3 批量审核通过
async function batchApproveDeductions(user, body) {
  try {
    const { deduction_ids } = body;

    if (!deduction_ids || !Array.isArray(deduction_ids) || deduction_ids.length === 0) {
      return { __t: 'error', code: 400, message: '扣分明细ID列表不能为空' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let approved = 0;
      let skipped = 0;
      const recalcTargets = new Set();

      for (const deductionId of deduction_ids) {
        const deductionResult = await client.query(
          `SELECT * FROM ${TABLES.deduction} WHERE id = $1 AND is_deleted = FALSE`,
          [deductionId]
        );
        if (deductionResult.rows.length === 0) {
          skipped++;
          continue;
        }

        const deduction = deductionResult.rows[0];
        if (deduction.review_status === REVIEW_STATUS.APPROVED) {
          skipped++;
          continue;
        }

        const targetResult = await client.query(
          `SELECT status FROM ${TABLES.target} WHERE id = $1`,
          [deduction.target_id]
        );
        if (targetResult.rows[0]?.status === TARGET_STATUS.FROZEN) {
          skipped++;
          continue;
        }

        await client.query(
          `UPDATE ${TABLES.deduction} 
           SET review_status = 'approved', confirmed_score = suggested_score, updated_at = NOW()
           WHERE id = $1`,
          [deductionId]
        );

        recalcTargets.add(`${deduction.cycle_id}:${deduction.target_id}`);
        approved++;
      }

      await client.query('COMMIT');

      for (const key of recalcTargets) {
        const [cid, tid] = key.split(':').map(Number);
        try {
          await engine.recalculateTarget(cid, tid);
        } catch (e2) {
          logger.warn(`[assessment-deduction] 批量审核后重算失败 cycle=${cid} target=${tid}: ${e2.message}`);
        }
      }

      await recordAudit(user.id, user.name, user.role, 'BATCH_APPROVE', 'DEDUCTION', null, `批量${deduction_ids.length}条`,
        { approved, skipped, total: deduction_ids.length }, '批量审核通过扣分', user.ip);

      return {
        __t: 'json',
        payload: camelKeys({ approved, skipped, total: deduction_ids.length }),
        message: `批量审核完成，通过${approved}条，跳过${skipped}条`,
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-deduction] 批量审核失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '批量审核扣分失败' };
  }
}

// 7.1 调整扣分（生成新版本）
async function adjustDeduction(user, body) {
  try {
    const { deduction_id, new_score, adjustment_reason } = body;

    if (!deduction_id || new_score === undefined || !adjustment_reason) {
      return { __t: 'error', code: 400, message: '扣分明细ID、调整后分值、调整原因不能为空' };
    }

    const deductionResult = await pool.query(
      `SELECT * FROM ${TABLES.deduction} WHERE id = $1 AND is_deleted = FALSE`,
      [deduction_id]
    );
    if (deductionResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '扣分明细不存在' };
    }

    const deduction = deductionResult.rows[0];
    const targetResult = await pool.query(
      `SELECT status FROM ${TABLES.target} WHERE id = $1`,
      [deduction.target_id]
    );
    if (targetResult.rows[0]?.status === TARGET_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的对象不可调整' };
    }

    const oldScore = deduction.confirmed_score !== null ? deduction.confirmed_score : deduction.suggested_score;
    const newVersion = deduction.current_version + 1;
    const operatorEmployeeId = await resolveOperatorEmployeeId(user.id);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE ${TABLES.adjustment} SET is_current = FALSE WHERE deduction_id = $1`,
        [deduction_id]
      );
      const adjustmentResult = await client.query(
        `INSERT INTO ${TABLES.adjustment} 
          (deduction_id, target_id, version_no, old_score, new_score, operation_type, 
           adjustment_reason, adjusted_by, adjusted_by_name, is_current)
         VALUES ($1, $2, $3, $4, $5, 'ADJUST', $6, $7, $8, TRUE)
         RETURNING *`,
        [deduction_id, deduction.target_id, newVersion, oldScore, new_score,
         adjustment_reason, operatorEmployeeId, user.name]
      );

      await client.query(
        `UPDATE ${TABLES.deduction} 
         SET current_version = $1, confirmed_score = $2, review_status = 'adjusted', updated_at = NOW()
         WHERE id = $3`,
        [newVersion, new_score, deduction_id]
      );

      await client.query('COMMIT');

      await engine.recalculateTarget(deduction.cycle_id, deduction.target_id);

      await recordAudit(user.id, user.name, user.role, 'REVIEW_ADJUST', 'DEDUCTION', deduction.id, deduction.deduction_item,
        { old_score: oldScore, new_score, version: newVersion, adjustment_reason }, '调整扣分值', user.ip);

      return { __t: 'detail', data: adjustmentResult.rows[0], message: '扣分调整成功', camelCase: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-adjustment] 调整失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '扣分调整失败' };
  }
}

// 7.2 恢复自动计算（解锁）
async function unlockDeduction(user, id) {
  try {
    const deductionResult = await pool.query(
      `SELECT * FROM ${TABLES.deduction} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (deductionResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '扣分明细不存在' };
    }
    const deduction = deductionResult.rows[0];
    if (!(deduction.review_status === REVIEW_STATUS.APPROVED || deduction.review_status === REVIEW_STATUS.ADJUSTED)) {
      return { __t: 'error', code: 409, message: '仅已锁定（已审核/已调整）的明细可恢复自动计算' };
    }
    if (!(deduction.source_detail && deduction.source_detail.kind === 'grid_unchecked_monthly')) {
      return { __t: 'error', code: 409, message: '仅「网格未巡查（未检查）」自动明细支持恢复自动计算' };
    }
    const targetResult = await pool.query(
      `SELECT status FROM ${TABLES.target} WHERE id = $1`,
      [deduction.target_id]
    );
    if (targetResult.rows[0]?.status === TARGET_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的对象不可解锁' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE ${TABLES.deduction}
         SET review_status = 'pending', confirmed_score = NULL, current_version = current_version + 1, updated_at = NOW()
         WHERE id = $1`,
        [deduction.id]
      );

      const operatorEmployeeId = await resolveOperatorEmployeeId(user.id);
      await client.query(
        `UPDATE ${TABLES.adjustment} SET is_current = FALSE WHERE deduction_id = $1`,
        [deduction.id]
      );
      await client.query(
        `INSERT INTO ${TABLES.adjustment}
          (deduction_id, target_id, version_no, old_score, new_score, operation_type,
           adjustment_reason, adjusted_by, adjusted_by_name, is_current)
         VALUES ($1, $2, $3, $4, $5, 'UNLOCK', $6, $7, $8, TRUE)`,
        [deduction.id, deduction.target_id, deduction.current_version + 1,
         deduction.confirmed_score, deduction.suggested_score, '恢复自动计算',
         operatorEmployeeId, user.name]
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    try {
      await gridUncheckedDeduction.syncGridUncheckedDeductions(deduction.cycle_id);
    } catch (e2) {
      logger.warn(`[assessment-unlock] 解锁后重扫失败 cycle=${deduction.cycle_id}: ${e2.message}`);
    }
    await engine.recalculateTarget(deduction.cycle_id, deduction.target_id);

    await recordAudit(user.id, user.name, user.role, 'REVIEW_ADJUST', 'DEDUCTION', deduction.id, deduction.deduction_item,
      { unlock: true, old_confirmed_score: deduction.confirmed_score }, '恢复自动计算（解锁）', user.ip);

    return { __t: 'json', payload: null, message: '已恢复自动计算' };
  } catch (e) {
    logger.error(`[assessment-unlock] 解锁失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '恢复自动计算失败' };
  }
}

// 7.3 查询扣分调整历史
async function listAdjustments(id) {
  try {
    const result = await pool.query(
      `SELECT * FROM ${TABLES.adjustment} WHERE deduction_id = $1 ORDER BY version_no DESC`,
      [id]
    );
    return {
      __t: 'json',
      payload: { list: result.rows.map(camelKeys), total: result.rows.length },
    };
  } catch (e) {
    logger.error(`[assessment-adjustment] 历史查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询调整历史失败' };
  }
}

module.exports = {
  listDeductions,
  getDeduction,
  createDeduction,
  updateDeduction,
  deleteDeduction,
  approveDeduction,
  rejectDeduction,
  batchApproveDeductions,
  adjustDeduction,
  unlockDeduction,
  listAdjustments,
};