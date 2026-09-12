/**
 * HSE 证件管理 (employee_certificate 表)
 * 从 hse-employee.js 拆分迁移 —— 保持对外路由契约逐字节不变
 * 由父路由 router.use('/', this) 挂载，最终契约 /api/hse/employee/certificates(...)
 */
const express = require('express');
const router = express.Router();

const { pool, isConnected } = require('../../config/db');
const { success, error } = require('../../middleware/response');
const { buildListResponse, buildDetailResponse, camelKeys } = require('../../utils/commonResponse');
const { auditLog } = require('../audit');
const { requireRole, requirePermission } = require('../../middleware/auth');

const VALID_CERT_CATEGORIES = [
  'special_operation', 'safety_qualification', 'health',
  'special_equipment', 'driver_license', 'professional', 'other'
];
const VALID_CERT_STATUS = ['valid', 'expired', 'revoked', 'pending_review', 'invalid'];

// GET /certificates — 分页查询证件
router.get('/certificates', async (req, res) => {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, undefined, { camelCase: true });

    const { page = 1, pageSize = 20, employeeId, category, status, keyword, isSpecialOperation, expiringDays } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['c.is_deleted = false'];
    const params = [];
    let paramIdx = 1;

    if (employeeId) {
      conditions.push(`c.employee_id = $${paramIdx}`);
      params.push(parseInt(employeeId));
      paramIdx++;
    }
    if (category && VALID_CERT_CATEGORIES.includes(category)) {
      conditions.push(`c.cert_category = $${paramIdx}`);
      params.push(category);
      paramIdx++;
    }
    if (status && VALID_CERT_STATUS.includes(status)) {
      conditions.push(`c.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }
    if (keyword) {
      conditions.push(`(c.cert_name ILIKE $${paramIdx} OR c.cert_code ILIKE $${paramIdx} OR e.name ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (isSpecialOperation === 'true') {
      conditions.push(`c.is_special_operation = true`);
    }
    if (expiringDays && parseInt(expiringDays) > 0) {
      const days = parseInt(expiringDays);
      conditions.push(`c.expire_date IS NOT NULL AND c.expire_date >= CURRENT_DATE AND c.expire_date <= CURRENT_DATE + INTERVAL '${days} days'`);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM employee_certificate c
       LEFT JOIN employee e ON c.employee_id = e.id
       WHERE ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT c.*, e.name AS employee_name, e.employee_code
       FROM employee_certificate c
       LEFT JOIN employee e ON c.employee_id = e.id AND e.is_deleted = false
       WHERE ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    buildListResponse(res, result.rows, total, pageNum, limitNum, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /certificates/stats — 证件统计
router.get('/certificates/stats', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ total: 0, byCategory: {}, byStatus: {}, expiring: 0, expired: 0 })));

    const [totalR, catR, statusR, expiringR, expiredR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM employee_certificate WHERE is_deleted = false`),
      pool.query(`SELECT cert_category, COUNT(*)::int AS count FROM employee_certificate WHERE is_deleted = false GROUP BY cert_category`),
      pool.query(`SELECT status, COUNT(*)::int AS count FROM employee_certificate WHERE is_deleted = false GROUP BY status`),
      pool.query(`SELECT COUNT(*)::int AS count FROM employee_certificate WHERE is_deleted = false AND status = 'valid' AND expire_date IS NOT NULL AND expire_date >= CURRENT_DATE AND expire_date <= CURRENT_DATE + INTERVAL '30 days'`),
      pool.query(`SELECT COUNT(*)::int AS count FROM employee_certificate WHERE is_deleted = false AND status = 'valid' AND expire_date IS NOT NULL AND expire_date < CURRENT_DATE`),
    ]);

    const byCategory = {};
    catR.rows.forEach(r => { byCategory[r.cert_category] = r.count; });
    const byStatus = {};
    statusR.rows.forEach(r => { byStatus[r.status] = r.count; });

    res.json(success(camelKeys({
      total: totalR.rows[0].total,
      byCategory,
      byStatus,
      expiring: expiringR.rows[0].count,
      expired: expiredR.rows[0].count,
    })));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /certificates/:id — 证件详情
router.get('/certificates/:id', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT c.*, e.name AS employee_name, e.employee_code
       FROM employee_certificate c
       LEFT JOIN employee e ON c.employee_id = e.id AND e.is_deleted = false
       WHERE c.id = $1 AND c.is_deleted = false`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '证件不存在'));
    buildDetailResponse(res, result.rows[0], undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /certificates/employee/:employeeId — 查询某员工的所有证件
router.get('/certificates/employee/:employeeId', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ list: [] })));
    const result = await pool.query(
      `SELECT * FROM employee_certificate
       WHERE employee_id = $1 AND is_deleted = false
       ORDER BY created_at DESC`,
      [req.params.employeeId]
    );
    res.json(success({ list: result.rows.map(camelKeys), total: result.rows.length }));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /certificates — 新增证件
router.post('/certificates', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const {
      employee_id, cert_code, cert_name, cert_category, cert_type,
      issuer, issue_date, start_date, expire_date, status = 'valid',
      cert_no, verification_no, is_special_operation = false,
      is_safety_critical = false, verification_status, verification_date,
      verification_remark, remark
    } = req.body;

    if (!employee_id) return res.json(error(-3, '员工ID不能为空'));
    if (!cert_name) return res.json(error(-3, '证件名称不能为空'));
    if (!cert_category || !VALID_CERT_CATEGORIES.includes(cert_category)) {
      return res.json(error(-3, `证件分类必须为：${VALID_CERT_CATEGORIES.join(', ')}`));
    }
    if (status && !VALID_CERT_STATUS.includes(status)) {
      return res.json(error(-3, `状态必须为：${VALID_CERT_STATUS.join(', ')}`));
    }

    const empResult = await pool.query(`SELECT id FROM employee WHERE id = $1 AND is_deleted = false`, [employee_id]);
    if (empResult.rows.length === 0) return res.json(error(-2, '员工不存在'));

    const insertResult = await pool.query(
      `INSERT INTO employee_certificate (
        employee_id, cert_code, cert_name, cert_category, cert_type,
        issuer, issue_date, start_date, expire_date, status,
        cert_no, verification_no, is_special_operation, is_safety_critical,
        verification_status, verification_date, verification_remark, remark, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [employee_id, cert_code || null, cert_name, cert_category, cert_type || null,
       issuer || null, issue_date || null, start_date || null, expire_date || null, status,
       cert_no || null, verification_no || null, is_special_operation, is_safety_critical,
       verification_status || null, verification_date || null, verification_remark || null, remark || null,
       req.user?.id || null]
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '证件管理',
      description: `新增证件: ${cert_name} (员工ID: ${employee_id})`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, insertResult.rows[0], '新增成功', { camelCase: true });
  } catch (err) {
    if (err.message && err.message.includes('uk_emp_cert_no_type')) {
      return res.json(error(-4, '同一分类下证件号码已存在'));
    }
    if (err.message && err.message.includes('uk_emp_cert_code')) {
      return res.json(error(-4, '证件业务编号已存在'));
    }
    res.json(error(-1, err.message));
  }
});

// PUT /certificates/:id — 更新证件
router.put('/certificates/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));

    const existing = await pool.query(`SELECT id FROM employee_certificate WHERE id = $1 AND is_deleted = false`, [req.params.id]);
    if (existing.rows.length === 0) return res.json(error(-2, '证件不存在'));

    const fields = [];
    const params = [];
    let idx = 1;

    const updatable = [
      'cert_code', 'cert_name', 'cert_category', 'cert_type',
      'issuer', 'issue_date', 'start_date', 'expire_date', 'status',
      'cert_no', 'verification_no', 'is_special_operation', 'is_safety_critical',
      'verification_status', 'verification_date', 'verification_remark', 'remark'
    ];
    for (const f of updatable) {
      if (req.body[f] !== undefined) {
        fields.push(`${f} = $${idx}`);
        params.push(req.body[f]);
        idx++;
      }
    }
    if (fields.length === 0) return res.json(success(camelKeys(existing.rows[0]), '无更新'));
    fields.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE employee_certificate SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '证件管理',
      description: `更新证件 ID: ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) {
    if (err.message && err.message.includes('uk_emp_cert_no_type')) {
      return res.json(error(-4, '同一分类下证件号码已存在'));
    }
    res.json(error(-1, err.message));
  }
});

// DELETE /certificates/:id — 软删除证件
router.delete('/certificates/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `UPDATE employee_certificate SET is_deleted = true, updated_at = NOW()
       WHERE id = $1 AND is_deleted = false RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '证件不存在'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '证件管理',
      description: `删除证件 ID: ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(camelKeys({ id: result.rows[0].id }), '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /certificates/expiring/:days — 临期证件列表
router.get('/certificates/expiring/:days', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ list: [] })));
    const days = Math.max(1, parseInt(req.params.days) || 30);
    const result = await pool.query(
      `SELECT c.*, e.name AS employee_name, e.employee_code,
              (c.expire_date - CURRENT_DATE) AS days_until_expire
       FROM employee_certificate c
       LEFT JOIN employee e ON c.employee_id = e.id AND e.is_deleted = false
       WHERE c.is_deleted = false
         AND c.status = 'valid'
         AND c.expire_date IS NOT NULL
         AND c.expire_date >= CURRENT_DATE
         AND c.expire_date <= CURRENT_DATE + INTERVAL '${days} days'
       ORDER BY c.expire_date ASC`
    );
    res.json(success({ list: result.rows.map(camelKeys), total: result.rows.length, days }));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /certificates/expired/list — 已过期证件列表
router.get('/certificates/expired/list', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ list: [] })));
    const result = await pool.query(
      `SELECT c.*, e.name AS employee_name, e.employee_code,
              (CURRENT_DATE - c.expire_date) AS days_expired
       FROM employee_certificate c
       LEFT JOIN employee e ON c.employee_id = e.id AND e.is_deleted = false
       WHERE c.is_deleted = false
         AND c.expire_date IS NOT NULL
         AND c.expire_date < CURRENT_DATE
       ORDER BY c.expire_date ASC`
    );
    res.json(success({ list: result.rows.map(camelKeys), total: result.rows.length }));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /certificates/batch-import — 批量导入证件（JSON）
router.post('/certificates/batch-import', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:import'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.json(error(-3, '导入数据不能为空'));
    if (items.length > 500) return res.json(error(-3, '单次导入不能超过500条'));

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rowIdx = i + 1;
        try {
          if (!item.employee_id) throw new Error('员工ID不能为空');
          if (!item.cert_name) throw new Error('证件名称不能为空');
          if (!item.cert_category || !VALID_CERT_CATEGORIES.includes(item.cert_category)) {
            throw new Error(`证件分类无效`);
          }
          await client.query(
            `INSERT INTO employee_certificate (
              employee_id, cert_code, cert_name, cert_category, cert_type,
              issuer, issue_date, start_date, expire_date, status,
              cert_no, is_special_operation, is_safety_critical, created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [item.employee_id, item.cert_code || null, item.cert_name, item.cert_category,
             item.cert_type || null, item.issuer || null, item.issue_date || null,
             item.start_date || null, item.expire_date || null, item.status || 'valid',
             item.cert_no || null, item.is_special_operation || false,
             item.is_safety_critical || false, req.user?.id || null]
          );
          successCount++;
        } catch (e) {
          errors.push({ index: rowIdx, message: e.message });
          failCount++;
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'import', module: '证件管理',
      description: `批量导入证件: 成功${successCount}条, 失败${failCount}条`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(camelKeys({ total: items.length, success: successCount, failed: failCount, errors }), '批量导入完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

module.exports = router;
