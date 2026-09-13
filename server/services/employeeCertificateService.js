/**
 * HSE 员工域 · 证件管理服务（employee_certificate 表）
 * 从 hse-employee/certificates.js route 内联 handler 迁移 —— 行为逐字节不变
 */
const { pool } = require('../config/db');

const VALID_CERT_CATEGORIES = [
  'special_operation', 'safety_qualification', 'health',
  'special_equipment', 'driver_license', 'professional', 'other'
];
const VALID_CERT_STATUS = ['valid', 'expired', 'revoked', 'pending_review', 'invalid'];

// GET /certificates — 分页查询证件
async function listCertificates(query) {
  const { page = 1, pageSize = 20, employeeId, category, status, keyword, isSpecialOperation, expiringDays } = query;
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

  return { rows: result.rows, total, pageNum, limitNum };
}

// GET /certificates/stats — 证件统计
async function getCertificateStats() {
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

  return {
    total: totalR.rows[0].total,
    byCategory,
    byStatus,
    expiring: expiringR.rows[0].count,
    expired: expiredR.rows[0].count,
  };
}

// GET /certificates/:id — 证件详情
async function getCertificate(id) {
  const result = await pool.query(
    `SELECT c.*, e.name AS employee_name, e.employee_code
     FROM employee_certificate c
     LEFT JOIN employee e ON c.employee_id = e.id AND e.is_deleted = false
     WHERE c.id = $1 AND c.is_deleted = false`,
    [id]
  );
  if (result.rows.length === 0) return { error: -2, message: '证件不存在' };
  return { row: result.rows[0] };
}

// GET /certificates/employee/:employeeId — 查询某员工的所有证件
async function listCertificatesByEmployee(employeeId) {
  const result = await pool.query(
    `SELECT * FROM employee_certificate
     WHERE employee_id = $1 AND is_deleted = false
     ORDER BY created_at DESC`,
    [employeeId]
  );
  return result.rows;
}

// POST /certificates — 新增证件
async function createCertificate(body, userId) {
  const {
    employee_id, cert_code, cert_name, cert_category, cert_type,
    issuer, issue_date, start_date, expire_date, status = 'valid',
    cert_no, verification_no, is_special_operation = false,
    is_safety_critical = false, verification_status, verification_date,
    verification_remark, remark
  } = body;

  if (!employee_id) return { error: -3, message: '员工ID不能为空' };
  if (!cert_name) return { error: -3, message: '证件名称不能为空' };
  if (!cert_category || !VALID_CERT_CATEGORIES.includes(cert_category)) {
    return { error: -3, message: `证件分类必须为：${VALID_CERT_CATEGORIES.join(', ')}` };
  }
  if (status && !VALID_CERT_STATUS.includes(status)) {
    return { error: -3, message: `状态必须为：${VALID_CERT_STATUS.join(', ')}` };
  }

  try {
    const empResult = await pool.query(`SELECT id FROM employee WHERE id = $1 AND is_deleted = false`, [employee_id]);
    if (empResult.rows.length === 0) return { error: -2, message: '员工不存在' };

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
       userId || null]
    );

    return { row: insertResult.rows[0], audit: { cert_name, employee_id } };
  } catch (err) {
    if (err.message && err.message.includes('uk_emp_cert_no_type')) {
      return { error: -4, message: '同一分类下证件号码已存在' };
    }
    if (err.message && err.message.includes('uk_emp_cert_code')) {
      return { error: -4, message: '证件业务编号已存在' };
    }
    throw err;
  }
}

// PUT /certificates/:id — 更新证件
async function updateCertificate(id, body) {
  const existing = await pool.query(`SELECT id FROM employee_certificate WHERE id = $1 AND is_deleted = false`, [id]);
  if (existing.rows.length === 0) return { error: -2, message: '证件不存在' };

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
    if (body[f] !== undefined) {
      fields.push(`${f} = $${idx}`);
      params.push(body[f]);
      idx++;
    }
  }
  if (fields.length === 0) return { noop: true, existing: existing.rows[0] };
  fields.push(`updated_at = NOW()`);
  params.push(id);

  try {
    const result = await pool.query(
      `UPDATE employee_certificate SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return { row: result.rows[0], audit: { id } };
  } catch (err) {
    if (err.message && err.message.includes('uk_emp_cert_no_type')) {
      return { error: -4, message: '同一分类下证件号码已存在' };
    }
    throw err;
  }
}

// DELETE /certificates/:id — 软删除证件
async function deleteCertificate(id) {
  const result = await pool.query(
    `UPDATE employee_certificate SET is_deleted = true, updated_at = NOW()
     WHERE id = $1 AND is_deleted = false RETURNING id`,
    [id]
  );
  if (result.rows.length === 0) return { error: -2, message: '证件不存在' };
  return { id: result.rows[0].id };
}

// GET /certificates/expiring/:days — 临期证件列表
async function listExpiringCertificates(days) {
  const safeDays = Math.max(1, parseInt(days) || 30);
  const result = await pool.query(
    `SELECT c.*, e.name AS employee_name, e.employee_code,
            (c.expire_date - CURRENT_DATE) AS days_until_expire
     FROM employee_certificate c
     LEFT JOIN employee e ON c.employee_id = e.id AND e.is_deleted = false
     WHERE c.is_deleted = false
       AND c.status = 'valid'
       AND c.expire_date IS NOT NULL
       AND c.expire_date >= CURRENT_DATE
       AND c.expire_date <= CURRENT_DATE + INTERVAL '${safeDays} days'
     ORDER BY c.expire_date ASC`
  );
  return { rows: result.rows, days: safeDays };
}

// GET /certificates/expired/list — 已过期证件列表
async function listExpiredCertificates() {
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
  return result.rows;
}

// POST /certificates/batch-import — 批量导入证件（JSON）
async function batchImportCertificates(items, userId) {
  if (!Array.isArray(items) || items.length === 0) return { error: -3, message: '导入数据不能为空' };
  if (items.length > 500) return { error: -3, message: '单次导入不能超过500条' };

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
           item.is_safety_critical || false, userId || null]
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

  return { total: items.length, success: successCount, failed: failCount, errors };
}

module.exports = {
  VALID_CERT_CATEGORIES,
  VALID_CERT_STATUS,
  listCertificates,
  getCertificateStats,
  getCertificate,
  listCertificatesByEmployee,
  createCertificate,
  updateCertificate,
  deleteCertificate,
  listExpiringCertificates,
  listExpiredCertificates,
  batchImportCertificates,
};