/**
 * HSE 员工公共选择 API（用于培训/保险/三违/隐患/消防等模块）
 * 从 hse-employee.js 拆分迁移 —— 保持对外路由契约逐字节不变
 * 由父路由 router.use('/', this) 挂载，最终契约 /api/hse/employee/employees/selector(...)
 */
const express = require('express');
const router = express.Router();

const { pool, isConnected } = require('../../config/db');
const { success, error } = require('../../middleware/response');
const { buildDetailResponse, camelKeys } = require('../../utils/commonResponse');


/**
 * GET /employees/selector
 * 员工选择列表（精简字段，支持关键词搜索 + 组织/岗位/驾驶员筛选）
 * 返回: employee_id, name, org_name, unit_name, position_name
 */
router.get('/employees/selector', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success([], '数据库未连接'));

    const { keyword, org_unit_id, position_id, is_driver, limit = 20 } = req.query;
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);

    const conditions = ['ev.is_deleted = false', 'ev.is_current = true'];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(ev.name ILIKE $${paramIdx} OR ev.employee_code ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (org_unit_id) {
      conditions.push(`ev.org_unit_id = $${paramIdx}`);
      params.push(parseInt(org_unit_id));
      paramIdx++;
    }
    if (position_id) {
      conditions.push(`ev.position_id = $${paramIdx}`);
      params.push(parseInt(position_id));
      paramIdx++;
    }
    if (is_driver === 'true') {
      conditions.push(`(ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%')`);
    } else if (is_driver === 'false') {
      conditions.push(`(ev.position_name IS NULL OR (ev.position_name NOT ILIKE '%驾驶员%' AND ev.position_name NOT ILIKE '%司机%'))`);
    }

    const whereClause = conditions.join(' AND ');

    const result = await pool.query(
      `SELECT ev.employee_id, ev.employee_code, ev.name, ev.gender,
              ev.org_unit_id, ev.org_name,
              ev.operation_unit_id, ev.unit_name,
              ev.position_id, ev.position_name
       FROM v_employee_org_full ev
       WHERE ${whereClause}
       ORDER BY ev.name ASC
       LIMIT $${paramIdx}`,
      [...params, limitNum]
    );

    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

/**
 * GET /employees/selector/:id
 * 员工选择单条查询（用于已选择员工的回显）
 */
router.get('/employees/selector/:id', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { id } = req.params;

    const result = await pool.query(
      `SELECT ev.employee_id, ev.employee_code, ev.name, ev.gender,
              ev.org_unit_id, ev.org_name,
              ev.operation_unit_id, ev.unit_name,
              ev.position_id, ev.position_name
       FROM v_employee_org_full ev
       WHERE ev.employee_id = $1 AND ev.is_deleted = false AND ev.is_current = true`,
      [parseInt(id)]
    );

    if (result.rows.length === 0) {
      return res.json(error(-2, '员工不存在'));
    }

    buildDetailResponse(res, result.rows[0], '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

/**
 * POST /employees/selector/batch
 * 员工选择批量查询（用于批量回显，如培训人员列表）
 */
router.post('/employees/selector/batch', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success([], '数据库未连接'));
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.json(success([], 'ID列表为空'));
    }

    const intIds = ids.map((id) => parseInt(id)).filter((id) => Number.isFinite(id) && id > 0);
    if (intIds.length === 0) {
      return res.json(success([], '无效ID'));
    }

    const result = await pool.query(
      `SELECT ev.employee_id, ev.employee_code, ev.name, ev.gender,
              ev.org_unit_id, ev.org_name,
              ev.operation_unit_id, ev.unit_name,
              ev.position_id, ev.position_name
       FROM v_employee_org_full ev
       WHERE ev.employee_id = ANY($1) AND ev.is_deleted = false AND ev.is_current = true
       ORDER BY ev.name ASC`,
      [intIds]
    );

    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

module.exports = router;
