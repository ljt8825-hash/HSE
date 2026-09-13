/**
 * HSE月度安全履职考核模块 · 考核周期服务（第1节 /cycles）
 * 从 routes/hse-assessment-monthly.js 迁移，业务规则 + SQL，无 express 依赖。
 * 返回统一描述符供 controller 包装（__t: detail / json / list / error）。
 * 复用共享：TABLES / CYCLE_STATUS / getPagination / getSort / recordAudit / getUserInfo。
 * 复用既有服务：assessmentScheduler.autoCreateAndSyncCycle（自动生成周期+同步对象）。
 */

const { camelKeys } = require('../utils/commonResponse');
const {
  pool,
  logger,
  TABLES,
  CYCLE_STATUS,
  getPagination,
  recordAudit,
} = require('./assessmentMonthlyShared');
const { autoCreateAndSyncCycle } = require('./assessmentScheduler');

// 1.1 创建考核周期
async function createCycle(user, body) {
  try {
    const { assessment_year, assessment_month, cycle_name, cycle_type, remark } = body;
    if (!assessment_year || !assessment_month) {
      return { __t: 'error', code: 400, message: '考核年份和月份不能为空' };
    }

    const cycleCode = `HSE-CYCLE-${assessment_year}${String(assessment_month).padStart(2, '0')}`;

    const startDate = new Date(assessment_year, assessment_month - 1, 1);
    const endDate = new Date(assessment_year, assessment_month, 0, 23, 59, 59);

    const result = await pool.query(
      `INSERT INTO ${TABLES.cycle} 
        (cycle_code, cycle_name, cycle_type, assessment_year, assessment_month, start_time, end_time, created_by, created_by_name, remark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [cycleCode, cycle_name || `${assessment_year}年${assessment_month}月月度考核`, cycle_type || 'monthly', assessment_year, assessment_month, startDate, endDate, user.id, user.name, remark || '']
    );

    await recordAudit(user.id, user.name, user.role, 'CREATE', 'CYCLE', result.rows[0].id, cycleCode, null, '创建考核周期', user.ip);

    return { __t: 'detail', data: result.rows[0], message: '考核周期创建成功', camelCase: true };
  } catch (e) {
    if ((e.message.includes('duplicate key') || e.message.includes('重复键')) && e.message.includes('cycle_code')) {
      return { __t: 'error', code: 409, message: '该月度考核周期已存在' };
    }
    logger.error(`[assessment-cycle] 创建失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '创建考核周期失败' };
  }
}

// 1.1.5 自动生成最近考核周期 + 同步对象（幂等）
async function autoGenerateCycle(user, body) {
  try {
    const now = new Date();
    const year = body && body.year != null ? Number(body.year) : now.getFullYear();
    const month = body && body.month != null ? Number(body.month) : now.getMonth() + 1;
    if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return { __t: 'error', code: 400, message: '考核年份/月份无效' };
    }
    const r = await autoCreateAndSyncCycle(year, month, { operatorName: user.name || 'admin' });
    if (!r.ok) {
      return { __t: 'error', code: 500, message: r.reason === 'memory-mode' ? '数据库未连接，无法自动生成' : '自动生成失败' };
    }
    const cycleRes = await pool.query(
      `SELECT target_count FROM hse_assessment_cycle WHERE id = $1`,
      [r.cycleId]
    );
    return {
      __t: 'json',
      payload: camelKeys({
        created: !r.skipped,
        cycleId: r.cycleId,
        synced: r.synced || { inserted: 0, removed: 0 },
        targetCount: cycleRes.rows[0]?.target_count ?? 0,
      }),
      message: r.skipped
        ? `${year}年${month}月考核周期已存在，无需重复生成`
        : `已自动生成 ${year}年${month}月考核周期（同步对象 ${r.synced?.inserted ?? 0} 人）`,
    };
  } catch (e) {
    logger.error(`[assessment-cycle] auto-generate 失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '自动生成考核周期失败' };
  }
}

// 1.2 查询考核周期列表
async function listCycles(query) {
  try {
    const { page, pageSize, offset } = getPagination(query);
    const { status, year, month, cycle_type, keyword } = query;

    const conditions = ['is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (year) {
      conditions.push(`assessment_year = $${idx++}`);
      params.push(year);
    }
    if (month) {
      conditions.push(`assessment_month = $${idx++}`);
      params.push(month);
    }
    if (cycle_type) {
      conditions.push(`cycle_type = $${idx++}`);
      params.push(cycle_type);
    }
    if (keyword) {
      conditions.push(`(cycle_name LIKE $${idx} OR cycle_code LIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT count(*) as cnt FROM ${TABLES.cycle} ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].cnt);

    const result = await pool.query(
      `SELECT * FROM ${TABLES.cycle} ${where} ORDER BY assessment_year DESC, assessment_month DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    );

    return { __t: 'list', list: result.rows, total, page, pageSize, message: '查询成功', camelCase: true };
  } catch (e) {
    logger.error(`[assessment-cycle] 列表查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询考核周期列表失败' };
  }
}

// 1.3 获取考核周期详情
async function getCycle(id) {
  try {
    const result = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (result.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核周期不存在' };
    }
    return { __t: 'detail', data: result.rows[0], message: '查询成功', camelCase: true };
  } catch (e) {
    logger.error(`[assessment-cycle] 详情查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询考核周期详情失败' };
  }
}

// 1.4 更新考核周期
async function updateCycle(user, id, body) {
  try {
    const { cycle_name, cycle_type, remark, status } = body;

    const oldResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (oldResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核周期不存在' };
    }
    if (oldResult.rows[0].status === CYCLE_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的周期不可修改' };
    }

    const updateFields = [];
    const params = [];
    let idx = 1;

    if (cycle_name !== undefined) {
      updateFields.push(`cycle_name = $${idx++}`);
      params.push(cycle_name);
    }
    if (cycle_type !== undefined) {
      updateFields.push(`cycle_type = $${idx++}`);
      params.push(cycle_type);
    }
    if (remark !== undefined) {
      updateFields.push(`remark = $${idx++}`);
      params.push(remark);
    }
    if (status !== undefined) {
      updateFields.push(`status = $${idx++}`);
      params.push(status);
    }

    if (updateFields.length === 0) {
      return { __t: 'detail', data: oldResult.rows[0], message: '无需更新', camelCase: true };
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE ${TABLES.cycle} SET ${updateFields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await recordAudit(user.id, user.name, user.role, 'UPDATE', 'CYCLE', parseInt(id), result.rows[0].cycle_code,
      { old: oldResult.rows[0], new: result.rows[0] }, '更新考核周期', user.ip);

    return { __t: 'detail', data: result.rows[0], message: '考核周期更新成功', camelCase: true };
  } catch (e) {
    logger.error(`[assessment-cycle] 更新失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '更新考核周期失败' };
  }
}

// 1.5 删除考核周期（软删除）
async function deleteCycle(user, id) {
  try {
    const oldResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (oldResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核周期不存在' };
    }
    if (oldResult.rows[0].status === CYCLE_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的周期不可删除' };
    }

    await pool.query(
      `UPDATE ${TABLES.cycle} SET is_deleted = TRUE WHERE id = $1`,
      [id]
    );

    await recordAudit(user.id, user.name, user.role, 'DELETE', 'CYCLE', parseInt(id), oldResult.rows[0].cycle_code,
      null, '删除考核周期', user.ip);

    return { __t: 'json', payload: null, message: '考核周期已删除' };
  } catch (e) {
    logger.error(`[assessment-cycle] 删除失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '删除考核周期失败' };
  }
}

// 1.6 启动考核周期（同步对象）
async function startCycle(user, id) {
  try {
    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (cycleResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核周期不存在' };
    }

    const cycle = cycleResult.rows[0];
    if (cycle.status !== CYCLE_STATUS.NOT_STARTED) {
      return { __t: 'error', code: 409, message: `周期状态为${cycle.status}，不可启动` };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insertResult = await client.query(
        `INSERT INTO ${TABLES.target} (cycle_id, employee_id, employee_code, employee_name, position, township, department)
         SELECT $1, v.employee_id, v.employee_code, v.name, v.position_name,
                COALESCE((SELECT t.org_name FROM hse_org_unit t WHERE t.org_type = 'town_center' AND t.is_deleted = false AND (v.org_path = t.org_path OR v.org_path LIKE t.org_path || '/%') ORDER BY length(t.org_path) DESC LIMIT 1), v.org_name) as township,
                COALESCE(v.org_name, '')
         FROM v_employee_org_full v
         WHERE v.relation_status = 'active'
           AND (
             v.position_name = '乡镇作业中心经理'
             OR (v.position_name = '管理员' AND v.org_type = 'town_center')
             OR v.employee_id IN (SELECT ga.personnel_id FROM grid_areas ga WHERE ga.personnel_id IS NOT NULL AND COALESCE(ga.is_deleted, FALSE) = FALSE)
             -- TODO 市政绿化作业中心公园负责人：花名册录入后在此处追加 OR 分支
           )
           AND v.employee_id NOT IN (SELECT employee_id FROM ${TABLES.target} WHERE cycle_id = $1)

         RETURNING id`,
        [id]
      );

      const targetCount = insertResult.rows.length;

      await client.query(
        `UPDATE ${TABLES.cycle} SET status = $1, target_count = $2 WHERE id = $3`,
        [CYCLE_STATUS.IN_PROGRESS, targetCount, id]
      );

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'START', 'CYCLE', parseInt(id), cycle.cycle_code,
        { target_count: targetCount }, '启动考核周期', user.ip);

      return {
        __t: 'json',
        payload: camelKeys({
          cycle_id: parseInt(id),
          status: CYCLE_STATUS.IN_PROGRESS,
          target_count: targetCount,
        }),
        message: '考核周期已启动，考核对象已生成',
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-cycle] 启动失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '启动考核周期失败' };
  }
}

module.exports = {
  createCycle,
  autoGenerateCycle,
  listCycles,
  getCycle,
  updateCycle,
  deleteCycle,
  startCycle,
};