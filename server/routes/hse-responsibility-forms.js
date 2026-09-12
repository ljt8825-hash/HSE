/**
 * HSE 责任书管理路由（RESP-002 缺签×1）
 *
 * 功能：
 *   1. 责任书列表 / 统计
 *   2. 责任书创建（默认 unsigned，实况发布 RESP_MISSING 缺签扣分）
 *   3. 责任书签核（unsigned→signed，实况发布 RESP_SIGNED 撤销扣分）
 *   4. 责任书删除（撤销缺签扣分）
 *
 * 对应表：safety_responsibility_forms
 * 事件：RESP_MISSING / RESP_SIGNED（幂等，仅考核对象扣分）
 */

const express = require('express');
const router = express.Router();
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { requireRole } = require('../middleware/auth');
const assessmentEvent = require('../services/assessmentEventService');

// ============================================================
// 辅助
// ============================================================

function camelKeys(obj) {
  if (!obj) return obj;
  const result = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

function generateCode(prefix) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${prefix}-${dateStr}-${random}`;
}

// ============================================================
// 一、责任书列表 + 统计
// ============================================================

// GET / — 责任书列表（分页 + 筛选）
router.get('/', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { year, sign_status, form_type, township, keyword, employee_id, page = 1, size = 20 } = req.query;

    const where = ['f.is_deleted = FALSE'];
    const params = [];
    let i = 1;
    if (year) { where.push(`f.year = $${i++}`); params.push(parseInt(year)); }
    if (sign_status) { where.push(`f.sign_status = $${i++}`); params.push(sign_status); }
    if (form_type) { where.push(`f.form_type = $${i++}`); params.push(form_type); }
    if (township) { where.push(`f.township = $${i++}`); params.push(township); }
    if (employee_id) { where.push(`f.employee_id = $${i++}`); params.push(parseInt(employee_id)); }
    if (keyword) {
      where.push(`(f.employee_name ILIKE $${i++} OR f.employee_code ILIKE $${i++} OR f.form_code ILIKE $${i++})`);
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw);
    }

    const whereSql = where.join(' AND ');
    const offset = (page - 1) * size;
    const list = await pool.query(
      `SELECT f.* FROM safety_responsibility_forms f
       WHERE ${whereSql}
       ORDER BY f.year DESC, f.employee_name ASC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, parseInt(size), offset]
    );
    const total = await pool.query(
      `SELECT COUNT(*) AS c FROM safety_responsibility_forms f WHERE ${whereSql}`,
      params
    );

    res.json(success({
      list: list.rows.map(camelKeys),
      total: parseInt(total.rows[0].c),
      page: parseInt(page),
      size: parseInt(size),
    }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /stats — 统计（缺签数 / 缺签对象数）
router.get('/stats', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { year } = req.query;
    const w = ['is_deleted = FALSE'];
    const p = [];
    let i = 1;
    if (year) { w.push(`year = $${i++}`); p.push(parseInt(year)); }
    const whereSql = w.join(' AND ');
    const r = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE sign_status='signed')::int AS signed,
         COUNT(*) FILTER (WHERE sign_status='unsigned')::int AS unsigned,
         COUNT(DISTINCT employee_id) FILTER (WHERE sign_status='unsigned')::int AS unsigned_employees
       FROM safety_responsibility_forms WHERE ${whereSql}`,
      p
    );
    res.json(success(camelKeys(r.rows[0] || {}), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 二、责任书创建 / 签核 / 删除
// ============================================================

// POST / — 创建责任书（可提交单条或多条）
router.post('/', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const created = [];

    for (const it of items) {
      // 同时兼容 camelCase（web-naive）与 snake_case 两种提交契约
      const employee_id = it.employee_id ?? it.employeeId;
      const employee_name = it.employee_name ?? it.employeeName ?? '';
      const employee_code = it.employee_code ?? it.employeeCode ?? null;
      const form_type = it.form_type ?? it.formType ?? '安全生产责任书';
      const year = it.year;
      const sign_status = it.sign_status ?? it.signStatus ?? 'unsigned';
      const township = it.township;
      const department = it.department;
      const position = it.position;
      const remark = it.remark;
      if (!employee_id) return res.json(error(-3, '员工不能为空'));
      const y = year || new Date().getFullYear();

      // 同年同类型已存在则跳过（幂等）
      const dup = await pool.query(
        `SELECT id FROM safety_responsibility_forms
         WHERE year=$1 AND form_type=$2 AND employee_id=$3 AND is_deleted=FALSE`,
        [y, form_type, employee_id]
      );
      if (dup.rows.length) continue;

      const formCode = generateCode('RESP');
      const signDate = sign_status === 'signed' ? new Date().toISOString().slice(0, 10) : null;
      const ins = await pool.query(
        `INSERT INTO safety_responsibility_forms
          (form_code, form_type, year, employee_id, employee_code, employee_name,
           position, township, department, sign_status, sign_date, remark, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [formCode, form_type, y, employee_id, employee_code || null, employee_name || '',
         position || null, township || null, department || null, sign_status,
         signDate, remark || null, req.user?.id || null]
      );
      const row = ins.rows[0];
      created.push(row);

      // 实况发布：缺签即扣当月对象（未签才发）
      if (row.sign_status === 'unsigned') {
        assessmentEvent.publish(assessmentEvent.EVENT_TYPES.RESP_MISSING, {
          formId: row.id,
          formType: row.form_type,
          employeeId: row.employee_id,
          eventDate: new Date().toISOString(),
        });
      }
    }

    res.json(success(created.map(camelKeys), `成功创建 ${created.length} 份责任书`));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /:id/sign — 签核责任书（unsigned→signed，撤销缺签扣分）
router.put('/:id/sign', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const id = parseInt(req.params.id);
    const upd = await pool.query(
      `UPDATE safety_responsibility_forms SET sign_status='signed', sign_date=CURRENT_DATE, updated_at=NOW()
       WHERE id=$1 AND is_deleted=FALSE RETURNING *`,
      [id]
    );
    if (!upd.rows.length) return res.json(error(-2, '责任书不存在'));

    const row = upd.rows[0];
    assessmentEvent.publish(assessmentEvent.EVENT_TYPES.RESP_SIGNED, {
      formId: row.id,
      formType: row.form_type,
      employeeId: row.employee_id,
      eventDate: new Date().toISOString(),
    });

    res.json(success(camelKeys(row), '签核成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /:id — 更新责任书信息（非签核字段）
router.put('/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const id = parseInt(req.params.id);
    const b = req.body || {};
    const form_type = b.form_type ?? b.formType ?? null;
    const year = b.year;
    const township = b.township;
    const department = b.department;
    const position = b.position;
    const remark = b.remark;
    const upd = await pool.query(
      `UPDATE safety_responsibility_forms
       SET form_type=COALESCE($1, form_type), year=COALESCE($2, year),
           township=COALESCE($3, township), department=COALESCE($4, department),
           position=COALESCE($5, position),
           remark=COALESCE($6, remark), updated_at=NOW()
       WHERE id=$7 AND is_deleted=FALSE RETURNING *`,
      [form_type || null, year || null, township || null, department || null, position || null, remark || null, id]
    );
    if (!upd.rows.length) return res.json(error(-2, '责任书不存在'));
    res.json(success(camelKeys(upd.rows[0]), '更新成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// DELETE /:id — 删除责任书（撤销缺签扣分）
router.delete('/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const id = parseInt(req.params.id);
    const row = await pool.query(
      `SELECT * FROM safety_responsibility_forms WHERE id=$1 AND is_deleted=FALSE`,
      [id]
    );
    if (!row.rows.length) return res.json(error(-2, '责任书不存在'));
    const f = row.rows[0];

    await pool.query(
      `UPDATE safety_responsibility_forms SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1`,
      [id]
    );

    // 删除未签责任书 → 撤销缺签扣分；删除已签责任书不涉及扣分
    if (f.sign_status === 'unsigned') {
      assessmentEvent.publish(assessmentEvent.EVENT_TYPES.RESP_SIGNED, {
        formId: f.id,
        formType: f.form_type,
        employeeId: f.employee_id,
        eventDate: new Date().toISOString(),
      });
    }
    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

module.exports = router;