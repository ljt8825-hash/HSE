/**
 * HSE月度安全履职考核模块 · 考核对象服务（第2节 /targets）
 * 从 routes/hse-assessment-monthly.js 迁移，业务规则 + SQL，无 express 依赖。
 * 返回统一描述符供 controller 包装（__t: list / detail / error / json）。
 * 复用共享：TABLES / TARGET_STATUS / CYCLE_STATUS / getPagination / getSort /
 *           sumDeductionsByCategory / recordAudit。
 */

const { camelKeys } = require('../utils/commonResponse');
const { CONFIRMED_TARGET_ELIGIBILITY_SQL, FORMAL_EMPLOYEE_ELIGIBILITY_SQL } = require('./assessmentTargetEligibility');
const {
  pool,
  logger,
  TABLES,
  TARGET_STATUS,
  CYCLE_STATUS,
  getPagination,
  getSort,
  sumDeductionsByCategory,
  recordAudit,
} = require('./assessmentMonthlyShared');

// 2.1 查询考核对象列表
async function listTargets(id, query) {
  try {
    const { page, pageSize, offset } = getPagination(query, 10000);
    const { sortBy, sortOrder } = getSort(query, 'created_at', 'desc');
    const { township, position, status, keyword, review_status, grade, grid_level } = query;

    const conditions = ['t.is_deleted = FALSE', 't.cycle_id = $1'];
    const params = [id];
    let idx = 2;

    if (township) {
      conditions.push(`t.township = $${idx++}`);
      params.push(township);
    }
    if (position) {
      conditions.push(`t.position = $${idx++}`);
      params.push(position);
    }
    if (status) {
      conditions.push(`t.status = $${idx++}`);
      params.push(status);
    }
    if (review_status) {
      conditions.push(`t.review_status = $${idx++}`);
      params.push(review_status);
    }
    if (grade) {
      conditions.push(`t.grade = $${idx++}`);
      params.push(grade);
    }
    if (keyword) {
      conditions.push(`(t.employee_name LIKE $${idx} OR t.employee_code LIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }
    if (grid_level) {
      const levels = String(grid_level)
        .split(',')
        .map((s) => (s || '').trim())
        .filter(Boolean);
      if (levels.length > 0) {
        conditions.push(`t.employee_id IN (
          SELECT ga.personnel_id FROM grid_areas ga
          WHERE ga.personnel_id IS NOT NULL
            AND COALESCE(ga.is_deleted, FALSE) = FALSE
            AND ga.grid_level IN (${levels.map(() => `$${idx++}`).join(',')})
        )`);
        params.push(...levels);
      }
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT count(*) as cnt FROM ${TABLES.target} t ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].cnt);

    const result = await pool.query(
      `SELECT t.*,
              (SELECT ga.grid_level FROM grid_areas ga
               WHERE ga.personnel_id = t.employee_id
                 AND COALESCE(ga.is_deleted, FALSE) = FALSE
                 AND COALESCE(ga.grid_level, '') <> ''
               ORDER BY ga.id LIMIT 1) AS grid_level
       FROM ${TABLES.target} t ${where} ORDER BY t.${sortBy} ${sortOrder} LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    );

    const catAgg = await sumDeductionsByCategory(id, result.rows.map((r) => r.id));
    for (const row of result.rows) {
      row.category_deductions = catAgg[row.id] || {};
    }

    try {
      const cycR = await pool.query(
        `SELECT assessment_year, assessment_month FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
        [id]
      );
      if (cycR.rows.length) {
        const month = `${cycR.rows[0].assessment_year}-${String(cycR.rows[0].assessment_month).padStart(2, '0')}`;
        const tr = await pool.query(
          `SELECT trainer_id, COALESCE(missing_count, 0) + COALESCE(incomplete_count, 0) AS score
           FROM hse_training_ledger_monthly WHERE month = $1`,
          [month]
        );
        const scoreByEmp = new Map(tr.rows.map((r) => [String(r.trainer_id), Number(r.score)]));
        for (const row of result.rows) {
          if (row.position !== '管理员') continue;
          const sc = scoreByEmp.get(String(row.employee_id));
          if (sc != null) {
            row.category_deductions = { ...(row.category_deductions || {}), 'HSE教育培训': sc };
          }
        }
      }
    } catch (e) {
      logger.warn(`[assessment-target] 培训考核分数映射失败: ${e.message}`);
    }

    return { __t: 'list', list: result.rows, total, page, pageSize, message: '查询成功', camelCase: true };
  } catch (e) {
    logger.error(`[assessment-target] 列表查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询考核对象列表失败' };
  }
}

// 2.2 获取考核对象详情
async function getTarget(id) {
  try {
    const result = await pool.query(
      `SELECT * FROM ${TABLES.target} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (result.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核对象不存在' };
    }
    return { __t: 'detail', data: result.rows[0], message: '查询成功', camelCase: true };
  } catch (e) {
    logger.error(`[assessment-target] 详情查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询考核对象详情失败' };
  }
}

// 2.3 从员工表同步考核对象
async function syncTargets(user, id) {
  try {
    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (cycleResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核周期不存在' };
    }
    if (cycleResult.rows[0].status === CYCLE_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的周期不可同步' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const beforeResult = await client.query(
        `SELECT count(*) as cnt FROM ${TABLES.target} WHERE cycle_id = $1 AND is_deleted = FALSE`,
        [id]
      );
      const beforeCount = parseInt(beforeResult.rows[0].cnt);

      const deleteResult = await client.query(
        `DELETE FROM ${TABLES.target} t
         WHERE t.cycle_id = $1 AND t.is_deleted = FALSE
           AND NOT EXISTS (
             SELECT 1 FROM v_employee_org_full v
             WHERE v.employee_id = t.employee_id
               AND v.relation_status = 'active'
               AND (
                 v.position_name = '乡镇作业中心经理'
                 OR (v.position_name = '管理员' AND v.org_type = 'town_center')
                 OR v.employee_id IN (SELECT ga.personnel_id FROM grid_areas ga WHERE ga.personnel_id IS NOT NULL AND COALESCE(ga.is_deleted, FALSE) = FALSE)
                 OR ${CONFIRMED_TARGET_ELIGIBILITY_SQL}
               )
               AND (v.start_date IS NULL OR v.start_date <= (SELECT end_time FROM ${TABLES.cycle} WHERE id = $1))
               AND (v.end_date IS NULL OR v.end_date >= (SELECT start_time FROM ${TABLES.cycle} WHERE id = $1))
           )`,
        [id]
      );
      const removed = deleteResult.rowCount;

      const insertResult = await client.query(
        `INSERT INTO ${TABLES.target} (cycle_id, employee_id, employee_code, employee_name, position, township, department)
         SELECT $1, v.employee_id, v.employee_code, v.name, v.position_name,
                COALESCE((SELECT t.org_name FROM hse_org_unit t WHERE t.org_type = 'town_center' AND t.is_deleted = false AND (v.org_path = t.org_path OR v.org_path LIKE t.org_path || '/%') ORDER BY length(t.org_path) DESC LIMIT 1), v.org_name) as township,
                COALESCE(v.org_name, '')
         FROM v_employee_org_full v
         WHERE v.relation_status = 'active'
           AND ${FORMAL_EMPLOYEE_ELIGIBILITY_SQL}
           AND (
             v.position_name = '乡镇作业中心经理'
             OR (v.position_name = '管理员' AND v.org_type = 'town_center')
             OR v.employee_id IN (SELECT ga.personnel_id FROM grid_areas ga WHERE ga.personnel_id IS NOT NULL AND COALESCE(ga.is_deleted, FALSE) = FALSE)
             OR ${CONFIRMED_TARGET_ELIGIBILITY_SQL}
             -- TODO 市政绿化作业中心公园负责人：花名册录入后在此处追加 OR 分支
           )
           AND (v.start_date IS NULL OR v.start_date <= (SELECT end_time FROM ${TABLES.cycle} WHERE id = $1))
           AND (v.end_date IS NULL OR v.end_date >= (SELECT start_time FROM ${TABLES.cycle} WHERE id = $1))
           AND v.employee_id NOT IN (SELECT employee_id FROM ${TABLES.target} WHERE cycle_id = $1)

         RETURNING id`,
        [id]
      );
      const added = insertResult.rows.length;

      const afterResult = await client.query(
        `SELECT count(*) as cnt FROM ${TABLES.target} WHERE cycle_id = $1 AND is_deleted = FALSE`,
        [id]
      );
      const total = parseInt(afterResult.rows[0].cnt);

      await client.query(
        `UPDATE ${TABLES.cycle} SET target_count = $1 WHERE id = $2`,
        [total, id]
      );

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'SYNC', 'TARGET', parseInt(id), cycleResult.rows[0].cycle_code,
        { before_count: beforeCount, removed, added, total }, '同步考核对象', user.ip);

      return {
        __t: 'json',
        payload: camelKeys({ added, removed, total }),
        message: removed > 0 || added > 0 ? `同步完成：移除 ${removed} 人，新增 ${added} 人，合计 ${total} 人` : '同步完成，无变化',
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-target] 同步失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '同步考核对象失败' };
  }
}

// 2.4 手动添加考核对象
async function addTargets(user, id, body) {
  try {
    const { employee_ids } = body;

    if (!employee_ids || !Array.isArray(employee_ids) || employee_ids.length === 0) {
      return { __t: 'error', code: 400, message: '员工ID列表不能为空' };
    }

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (cycleResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核周期不存在' };
    }
    if (cycleResult.rows[0].status === CYCLE_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的周期不可添加对象' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let added = 0;
      for (const empId of employee_ids) {
        const empResult = await client.query(
          `SELECT v.employee_id as id, v.name, v.employee_code, v.position_name,
                  COALESCE((SELECT t.org_name FROM hse_org_unit t WHERE t.org_type = 'town_center' AND t.is_deleted = false AND (v.org_path = t.org_path OR v.org_path LIKE t.org_path || '/%') ORDER BY length(t.org_path) DESC LIMIT 1), v.org_name) as township,
                  COALESCE(v.org_name, '') as department
           FROM v_employee_org_full v
           WHERE v.employee_id = $1 AND v.relation_status = 'active'
             AND ${FORMAL_EMPLOYEE_ELIGIBILITY_SQL}
           LIMIT 1`,
          [empId]
        );
        if (empResult.rows.length === 0) continue;
        const emp = empResult.rows[0];

        try {
          await client.query(
            `INSERT INTO ${TABLES.target} (cycle_id, employee_id, employee_code, employee_name, position, township, department)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
            [id, emp.id, emp.employee_code, emp.name, emp.position_name, emp.township, emp.department]
          );
          added++;
        } catch (e) {
          // 跳过重复
        }
      }

      await client.query(
        `UPDATE ${TABLES.cycle} SET target_count = (SELECT count(*) FROM ${TABLES.target} WHERE cycle_id = $1 AND is_deleted = FALSE) WHERE id = $1`,
        [id]
      );

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'CREATE', 'TARGET', parseInt(id), cycleResult.rows[0].cycle_code,
        { added_count: added, employee_ids }, '添加考核对象', user.ip);

      return { __t: 'json', payload: camelKeys({ added, total: employee_ids.length }), message: `已添加${added}名考核对象` };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-target] 添加失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '添加考核对象失败' };
  }
}

// 2.5 移除考核对象
async function removeTarget(user, id) {
  try {
    const targetResult = await pool.query(
      `SELECT * FROM ${TABLES.target} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (targetResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核对象不存在' };
    }

    const target = targetResult.rows[0];
    const cycleResult = await pool.query(
      `SELECT status FROM ${TABLES.cycle} WHERE id = $1`,
      [target.cycle_id]
    );
    if (cycleResult.rows[0]?.status === CYCLE_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的周期不可移除对象' };
    }

    await pool.query(
      `UPDATE ${TABLES.target} SET is_deleted = TRUE WHERE id = $1`,
      [id]
    );

    await pool.query(
      `UPDATE ${TABLES.cycle} SET target_count = (SELECT count(*) FROM ${TABLES.target} WHERE cycle_id = $1 AND is_deleted = FALSE) WHERE id = $1`,
      [target.cycle_id]
    );

    await recordAudit(user.id, user.name, user.role, 'DELETE', 'TARGET', parseInt(id), target.employee_name,
      null, '移除考核对象', user.ip);

    return { __t: 'json', payload: null, message: '考核对象已移除' };
  } catch (e) {
    logger.error(`[assessment-target] 移除失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '移除考核对象失败' };
  }
}

module.exports = {
  listTargets,
  getTarget,
  syncTargets,
  addTargets,
  removeTarget,
};