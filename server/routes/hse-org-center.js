/**
 * HSE 组织中心 + 作业单元管理 API - Sprint6.0
 *
 * 对应表: hse_org_unit / hse_operation_unit
 *
 * 功能模块:
 *   1. 管理组织 CRUD + 树结构查询
 *   2. 作业单元 CRUD + 列表查询
 *   3. 组织-作业单元关联查询
 *
 * 权限: admin / safety_manager 可写；其他角色只读
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { requireRole } = require('../middleware/auth');

// ============================================================
// 一、管理组织（hse_org_unit）
// ============================================================

/**
 * GET /api/hse/org/tree
 * 获取组织树（完整层级结构）
 */
router.get('/org/tree', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, parent_id, org_name, org_type, org_code, org_path, level, sort_order, headcount, status, description, manager_id, created_at
       FROM hse_org_unit
       WHERE is_deleted = false
       ORDER BY level, sort_order, id`
    );

    const list = result.rows;
    const map = new Map();
    const roots = [];

    list.forEach(item => {
      map.set(item.id, { ...item, children: [] });
    });

    list.forEach(item => {
      const node = map.get(item.id);
      if (item.parent_id && map.has(item.parent_id)) {
        map.get(item.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    });

    res.json(success(roots, '组织树获取成功'));
  } catch (err) {
    console.error('[Org Tree] Error:', err.message);
    res.json(error('获取组织树失败: ' + err.message));
  }
});

/**
 * GET /api/hse/org/list
 * 获取组织列表（扁平化）
 */
router.get('/org/list', async (req, res) => {
  try {
    const { org_type, keyword, status = 'active' } = req.query;

    let sql = `SELECT id, parent_id, org_name, org_type, org_code, org_path, level, sort_order, headcount, status, description, manager_id, created_at
               FROM hse_org_unit
               WHERE is_deleted = false`;
    const params = [];
    let idx = 1;

    if (org_type) {
      sql += ` AND org_type = $${idx++}`;
      params.push(org_type);
    }
    if (keyword) {
      sql += ` AND (org_name ILIKE $${idx} OR org_code ILIKE $${idx})`;
      params.push(`%${keyword}%`);
      idx++;
    }
    if (status && status !== 'all') {
      sql += ` AND status = $${idx++}`;
      params.push(status);
    }

    sql += ` ORDER BY level, sort_order, id`;

    const result = await pool.query(sql, params);
    res.json(success({ list: result.rows, total: result.rows.length }, '组织列表获取成功'));
  } catch (err) {
    console.error('[Org List] Error:', err.message);
    res.json(error('获取组织列表失败: ' + err.message));
  }
});

/**
 * GET /api/hse/org/types
 * 获取组织类型枚举
 */
router.get('/org/types', async (req, res) => {
  const types = [
    { value: 'company', label: '公司' },
    { value: 'department', label: '职能部门' },
    { value: 'center', label: '作业中心' },
    { value: 'town_center', label: '乡镇作业中心' }
  ];
  res.json(success(types, '组织类型获取成功'));
});

/**
 * GET /api/hse/org/:id
 * 获取组织详情
 */
router.get('/org/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM hse_org_unit WHERE id = $1 AND is_deleted = false`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.json(error('组织不存在', 404));
    }
    res.json(success(result.rows[0], '组织详情获取成功'));
  } catch (err) {
    console.error('[Org Detail] Error:', err.message);
    res.json(error('获取组织详情失败: ' + err.message));
  }
});

/**
 * POST /api/hse/org
 * 新增组织
 */
router.post('/org', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { parent_id, org_name, org_type, org_code, sort_order = 0, description, manager_id } = req.body;

    if (!org_name || !org_type || !org_code) {
      return res.json(error('组织名称、类型、编码不能为空'));
    }

    // 检查编码是否重复
    const existResult = await pool.query(
      `SELECT id FROM hse_org_unit WHERE org_code = $1 AND is_deleted = false`,
      [org_code]
    );
    if (existResult.rows.length > 0) {
      return res.json(error('组织编码已存在'));
    }

    // 计算 level 和 org_path
    let level = 1;
    let org_path = '/' + org_name;
    if (parent_id) {
      const parentResult = await pool.query(
        `SELECT level, org_path FROM hse_org_unit WHERE id = $1 AND is_deleted = false`,
        [parent_id]
      );
      if (parentResult.rows.length === 0) {
        return res.json(error('父组织不存在'));
      }
      level = parentResult.rows[0].level + 1;
      org_path = parentResult.rows[0].org_path + '/' + org_name;
    }

    const result = await pool.query(
      `INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, description, manager_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
       RETURNING id`,
      [parent_id || null, org_name, org_type, org_code, org_path, level, sort_order, description || null, manager_id || null]
    );

    res.json(success({ id: result.rows[0].id }, '组织创建成功'));
  } catch (err) {
    console.error('[Org Create] Error:', err.message);
    res.json(error('创建组织失败: ' + err.message));
  }
});

/**
 * PUT /api/hse/org/:id
 * 更新组织
 */
router.put('/org/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { org_name, org_type, sort_order, status, description, manager_id } = req.body;

    const existResult = await pool.query(
      `SELECT id FROM hse_org_unit WHERE id = $1 AND is_deleted = false`,
      [id]
    );
    if (existResult.rows.length === 0) {
      return res.json(error('组织不存在', 404));
    }

    await pool.query(
      `UPDATE hse_org_unit
       SET org_name = COALESCE($1, org_name),
           org_type = COALESCE($2, org_type),
           sort_order = COALESCE($3, sort_order),
           status = COALESCE($4, status),
           description = COALESCE($5, description),
           manager_id = COALESCE($6, manager_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [org_name || null, org_type || null, sort_order !== undefined ? sort_order : null, status || null, description !== undefined ? description : null, manager_id !== undefined ? manager_id : null, id]
    );

    res.json(success(null, '组织更新成功'));
  } catch (err) {
    console.error('[Org Update] Error:', err.message);
    res.json(error('更新组织失败: ' + err.message));
  }
});

/**
 * DELETE /api/hse/org/:id
 * 删除组织（软删除）
 */
router.delete('/org/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { id } = req.params;

    // 检查是否有子组织
    const childResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM hse_org_unit WHERE parent_id = $1 AND is_deleted = false`,
      [id]
    );
    if (parseInt(childResult.rows[0].cnt) > 0) {
      return res.json(error('该组织下存在子组织，无法删除'));
    }

    await pool.query(
      `UPDATE hse_org_unit SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    res.json(success(null, '组织删除成功'));
  } catch (err) {
    console.error('[Org Delete] Error:', err.message);
    res.json(error('删除组织失败: ' + err.message));
  }
});

// ============================================================
// 二、作业单元（hse_operation_unit）
// ============================================================

/**
 * GET /api/hse/operation-unit/list
 * 获取作业单元列表
 */
router.get('/operation-unit/list', async (req, res) => {
  try {
    const { org_unit_id, unit_type, keyword, status = 'active', page = 1, pageSize = 20 } = req.query;

    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);
    const offset = (pageNum - 1) * pageSizeNum;

    let countSql = `SELECT COUNT(*) as total FROM hse_operation_unit WHERE is_deleted = false`;
    let listSql = `SELECT id, org_unit_id, unit_name, unit_type, unit_code, headcount, location, status, description, supervisor_id, created_at
                   FROM hse_operation_unit
                   WHERE is_deleted = false`;

    const params = [];
    let idx = 1;

    if (org_unit_id) {
      const cond = ` AND org_unit_id = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(org_unit_id);
    }
    if (unit_type) {
      const cond = ` AND unit_type = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(unit_type);
    }
    if (keyword) {
      const cond = ` AND (unit_name ILIKE $${idx} OR unit_code ILIKE $${idx})`;
      countSql += cond;
      listSql += cond;
      params.push(`%${keyword}%`);
      idx++;
    }
    if (status && status !== 'all') {
      const cond = ` AND status = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(status);
    }

    listSql += ` ORDER BY id DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSizeNum, offset);

    const countResult = await pool.query(countSql, params.slice(0, params.length - 2));
    const listResult = await pool.query(listSql, params);

    res.json(success({
      list: listResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: pageNum,
      pageSize: pageSizeNum
    }, '作业单元列表获取成功'));
  } catch (err) {
    console.error('[Operation Unit List] Error:', err.message);
    res.json(error('获取作业单元列表失败: ' + err.message));
  }
});

/**
 * GET /api/hse/operation-unit/all
 * 获取所有作业单元（下拉用）
 */
router.get('/operation-unit/all', async (req, res) => {
  try {
    const { org_unit_id, unit_type } = req.query;

    let sql = `SELECT id, org_unit_id, unit_name, unit_type, unit_code
               FROM hse_operation_unit
               WHERE is_deleted = false AND status = 'active'`;
    const params = [];
    let idx = 1;

    if (org_unit_id) {
      sql += ` AND org_unit_id = $${idx++}`;
      params.push(org_unit_id);
    }
    if (unit_type) {
      sql += ` AND unit_type = $${idx++}`;
      params.push(unit_type);
    }

    sql += ` ORDER BY unit_name`;

    const result = await pool.query(sql, params);
    res.json(success(result.rows, '作业单元获取成功'));
  } catch (err) {
    console.error('[Operation Unit All] Error:', err.message);
    res.json(error('获取作业单元失败: ' + err.message));
  }
});

/**
 * GET /api/hse/operation-unit/types
 * 获取作业单元类型枚举
 */
router.get('/operation-unit/types', async (req, res) => {
  const types = [
    { value: 'cleaning_team', label: '保洁组' },
    { value: 'collection_team', label: '收运车组' },
    { value: 'vehicle_team', label: '车辆作业组' },
    { value: 'transfer_station', label: '转运站' },
    { value: 'greening_team', label: '绿化组' },
    { value: 'maintenance_team', label: '维修组' },
    { value: 'barrel_team', label: '挂桶组' }
  ];
  res.json(success(types, '作业单元类型获取成功'));
});

/**
 * GET /api/hse/operation-unit/:id
 * 获取作业单元详情
 */
router.get('/operation-unit/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM hse_operation_unit WHERE id = $1 AND is_deleted = false`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.json(error('作业单元不存在', 404));
    }
    res.json(success(result.rows[0], '作业单元详情获取成功'));
  } catch (err) {
    console.error('[Operation Unit Detail] Error:', err.message);
    res.json(error('获取作业单元详情失败: ' + err.message));
  }
});

/**
 * POST /api/hse/operation-unit
 * 新增作业单元
 */
router.post('/operation-unit', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { org_unit_id, unit_name, unit_type, unit_code, headcount = 0, location, description, supervisor_id } = req.body;

    if (!org_unit_id || !unit_name || !unit_type || !unit_code) {
      return res.json(error('所属组织、单元名称、单元类型、单元编码不能为空'));
    }

    // 检查编码是否重复
    const existResult = await pool.query(
      `SELECT id FROM hse_operation_unit WHERE unit_code = $1 AND is_deleted = false`,
      [unit_code]
    );
    if (existResult.rows.length > 0) {
      return res.json(error('单元编码已存在'));
    }

    const result = await pool.query(
      `INSERT INTO hse_operation_unit (org_unit_id, unit_name, unit_type, unit_code, headcount, location, description, supervisor_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
       RETURNING id`,
      [org_unit_id, unit_name, unit_type, unit_code, headcount, location || null, description || null, supervisor_id || null]
    );

    res.json(success({ id: result.rows[0].id }, '作业单元创建成功'));
  } catch (err) {
    console.error('[Operation Unit Create] Error:', err.message);
    res.json(error('创建作业单元失败: ' + err.message));
  }
});

/**
 * PUT /api/hse/operation-unit/:id
 * 更新作业单元
 */
router.put('/operation-unit/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { unit_name, unit_type, headcount, location, status, description, supervisor_id } = req.body;

    const existResult = await pool.query(
      `SELECT id FROM hse_operation_unit WHERE id = $1 AND is_deleted = false`,
      [id]
    );
    if (existResult.rows.length === 0) {
      return res.json(error('作业单元不存在', 404));
    }

    await pool.query(
      `UPDATE hse_operation_unit
       SET unit_name = COALESCE($1, unit_name),
           unit_type = COALESCE($2, unit_type),
           headcount = COALESCE($3, headcount),
           location = COALESCE($4, location),
           status = COALESCE($5, status),
           description = COALESCE($6, description),
           supervisor_id = COALESCE($7, supervisor_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8`,
      [unit_name || null, unit_type || null, headcount !== undefined ? headcount : null, location !== undefined ? location : null, status || null, description !== undefined ? description : null, supervisor_id !== undefined ? supervisor_id : null, id]
    );

    res.json(success(null, '作业单元更新成功'));
  } catch (err) {
    console.error('[Operation Unit Update] Error:', err.message);
    res.json(error('更新作业单元失败: ' + err.message));
  }
});

/**
 * DELETE /api/hse/operation-unit/:id
 * 删除作业单元（软删除）
 */
router.delete('/operation-unit/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      `UPDATE hse_operation_unit SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    res.json(success(null, '作业单元删除成功'));
  } catch (err) {
    console.error('[Operation Unit Delete] Error:', err.message);
    res.json(error('删除作业单元失败: ' + err.message));
  }
});

module.exports = router;
