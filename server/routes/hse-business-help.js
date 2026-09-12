const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { auditLog } = require('./audit');

router.get('/list', async (req, res, next) => {
  try {
    const { menuCode, keyword, status = 'active' } = req.query;

    let sql = `SELECT id, menu_code, title, content, field_description,
                      calculate_rule, generate_rule, relation_rule, permission_rule,
                      version, status, sort_order, remark, created_at, updated_at
               FROM hse_business_help WHERE is_deleted = false`;
    const params = [];
    let idx = 1;

    if (menuCode) {
      sql += ` AND menu_code = $${idx++}`;
      params.push(menuCode);
    }
    if (keyword) {
      sql += ` AND (title ILIKE $${idx} OR content ILIKE $${idx})`;
      params.push(`%${keyword}%`);
      idx++;
    }
    if (status && status !== 'all') {
      sql += ` AND status = $${idx++}`;
      params.push(status);
    }

    sql += ` ORDER BY sort_order, id`;

    const result = await pool.query(sql, params);
    res.json(success({ list: result.rows, total: result.rows.length }, '业务知识库获取成功'));
  } catch (err) {
    next(err);
  }
});

router.get('/:menuCode', async (req, res, next) => {
  try {
    const { menuCode } = req.params;
    const result = await pool.query(
      `SELECT id, menu_code, title, content, field_description,
              calculate_rule, generate_rule, relation_rule, permission_rule,
              version, status, sort_order, remark, created_at, updated_at
       FROM hse_business_help
       WHERE menu_code = $1 AND is_deleted = false
       ORDER BY version DESC
       LIMIT 1`,
      [menuCode]
    );
    if (result.rows.length === 0) {
      return res.json(success(null, '暂无帮助内容'));
    }
    res.json(success(result.rows[0], '帮助内容获取成功'));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      menu_code, title, content, field_description,
      calculate_rule, generate_rule, relation_rule, permission_rule,
      version = '1.0', status = 'active', sort_order = 0, remark
    } = req.body;

    if (!menu_code || !title) {
      return res.status(400).json(error(400, '菜单编码和标题不能为空'));
    }

    const result = await pool.query(
      `INSERT INTO hse_business_help
        (menu_code, title, content, field_description, calculate_rule, generate_rule,
         relation_rule, permission_rule, version, status, sort_order, remark,
         created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, menu_code, title, version`,
      [menu_code, title, content, field_description, calculate_rule, generate_rule,
        relation_rule, permission_rule, version, status, sort_order, remark,
        req.user?.id, req.user?.id]
    );

    auditLog({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'create',
      module: 'business_help',
      description: `创建帮助内容: ${title} (${menu_code})`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    }).catch(() => { });

    res.json(success(result.rows[0], '帮助内容创建成功'));
  } catch (err) {
    if (err.message && err.message.includes('uk_hse_help_menu_unique')) {
      return res.status(400).json(error(400, '该菜单编码的帮助内容已存在'));
    }
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title, content, field_description,
      calculate_rule, generate_rule, relation_rule, permission_rule,
      version, status, sort_order, remark
    } = req.body;

    const result = await pool.query(
      `UPDATE hse_business_help SET
         title = COALESCE($1, title),
         content = COALESCE($2, content),
         field_description = COALESCE($3, field_description),
         calculate_rule = COALESCE($4, calculate_rule),
         generate_rule = COALESCE($5, generate_rule),
         relation_rule = COALESCE($6, relation_rule),
         permission_rule = COALESCE($7, permission_rule),
         version = COALESCE($8, version),
         status = COALESCE($9, status),
         sort_order = COALESCE($10, sort_order),
         remark = COALESCE($11, remark),
         updated_by = $12,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $13 AND is_deleted = false
       RETURNING id, menu_code, title, version`,
      [title, content, field_description, calculate_rule, generate_rule,
        relation_rule, permission_rule, version, status, sort_order, remark,
        req.user?.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '帮助内容不存在'));
    }

    auditLog({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'update',
      module: 'business_help',
      description: `更新帮助内容: ${id}`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    }).catch(() => { });

    res.json(success(result.rows[0], '帮助内容更新成功'));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE hse_business_help
       SET is_deleted = true, updated_by = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND is_deleted = false
       RETURNING id, menu_code, title`,
      [req.user?.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '帮助内容不存在'));
    }

    auditLog({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'delete',
      module: 'business_help',
      description: `删除帮助内容: ${result.rows[0].title}`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    }).catch(() => { });

    res.json(success(result.rows[0], '帮助内容删除成功'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
