/**
 * HSE 安全会议出席记录路由（RESP-004 缺席×2，交由每日扫描兜底）
 *
 * 功能：
 *   1. 会议记录列表 / 统计
 *   2. 会议创建（一次登记多人出席状态）
 *   3. 出席状态更新（absent→attend 补参）
 *   4. 删除会议出席记录
 *
 * 对应表：meeting_records（一行 = 某会议下某员工的一条出席记录）
 * 说明：本路由仅维护出席状态，缺席扣分由 assessmentScheduler 每日扫描统一发布
 *       MEETING_ABSENT 事件（幂等）。免于在创建时期刊量缺席判定。
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
// 一、列表 + 统计
// ============================================================

// GET / — 会议出席记录列表
router.get('/', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { meeting_code, meeting_name, meeting_date, attendance_status, employee_id, keyword, page = 1, size = 20 } = req.query;

    const where = ['m.is_deleted = FALSE'];
    const params = [];
    let i = 1;
    if (meeting_code) { where.push(`m.meeting_code = $${i++}`); params.push(meeting_code); }
    if (meeting_name) { where.push(`m.meeting_name ILIKE $${i++}`); params.push(`%${meeting_name}%`); }
    if (meeting_date) { where.push(`m.meeting_date = $${i++}`); params.push(meeting_date); }
    if (attendance_status) { where.push(`m.attendance_status = $${i++}`); params.push(attendance_status); }
    if (employee_id) { where.push(`m.employee_id = $${i++}`); params.push(parseInt(employee_id)); }
    if (keyword) {
      where.push(`(m.employee_name ILIKE $${i++} OR m.employee_code ILIKE $${i++} OR m.meeting_code ILIKE $${i++})`);
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw);
    }

    const whereSql = where.join(' AND ');
    const offset = (page - 1) * size;
    const list = await pool.query(
      `SELECT m.* FROM meeting_records m
       WHERE ${whereSql}
       ORDER BY m.meeting_date DESC, m.meeting_code ASC, m.employee_name ASC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, parseInt(size), offset]
    );
    const total = await pool.query(
      `SELECT COUNT(*) AS c FROM meeting_records m WHERE ${whereSql}`,
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

// GET /stats — 统计
router.get('/stats', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { meeting_date, meeting_code } = req.query;
    const w = ['is_deleted = FALSE'];
    const p = [];
    let i = 1;
    if (meeting_date) { w.push(`meeting_date = $${i++}`); p.push(meeting_date); }
    if (meeting_code) { w.push(`meeting_code = $${i++}`); p.push(meeting_code); }
    const whereSql = w.join(' AND ');
    const r = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE attendance_status='attend')::int AS attend,
         COUNT(*) FILTER (WHERE attendance_status='absent')::int AS absent,
         COUNT(DISTINCT meeting_code)::int AS meetings
       FROM meeting_records WHERE ${whereSql}`,
      p
    );
    res.json(success(camelKeys(r.rows[0] || {}), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /meetings — 会议聚合列表（按会议分组，含各状态人数）
router.get('/meetings', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { meeting_code, keyword, page = 1, size = 20 } = req.query;
    const where = ['m.is_deleted = FALSE'];
    const params = [];
    let i = 1;
    if (meeting_code) { where.push(`m.meeting_code = $${i++}`); params.push(meeting_code); }
    if (keyword) { where.push(`(m.meeting_name ILIKE $${i++} OR m.meeting_code ILIKE $${i++})`); const kw = `%${keyword}%`; params.push(kw, kw); }
    const whereSql = where.join(' AND ');
    const offset = (page - 1) * size;
    const list = await pool.query(
      `SELECT m.meeting_code, MAX(m.meeting_name) AS meeting_name, MAX(m.meeting_date) AS meeting_date,
              MIN(m.created_at)::date AS created_date,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE m.attendance_status='attend')::int AS attend,
              COUNT(*) FILTER (WHERE m.attendance_status='absent')::int AS absent,
              COUNT(*) FILTER (WHERE m.attendance_status='not_required')::int AS not_required
       FROM meeting_records m
       WHERE ${whereSql}
       GROUP BY m.meeting_code
       ORDER BY MAX(m.meeting_date) DESC, m.meeting_code DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, parseInt(size), offset]
    );
    const total = await pool.query(
      `SELECT COUNT(DISTINCT meeting_code)::int AS c FROM meeting_records m WHERE ${whereSql}`,
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

// GET /meetings/:code — 某会议下的出席明细
router.get('/meetings/:code', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const rows = await pool.query(
      `SELECT * FROM meeting_records WHERE meeting_code=$1 AND is_deleted=FALSE
       ORDER BY attendance_status ASC, employee_name ASC`,
      [req.params.code]
    );
    res.json(success(rows.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 二、会议创建 / 出席更新 / 删除
// ============================================================

// POST / — 创建会议并登记出席名单
router.post('/', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const b = req.body || {};
    // 兼容 camelCase（web-naive）与 snake_case 两种提交契约
    const meeting_name = b.meeting_name ?? b.meetingName;
    const meeting_date = b.meeting_date ?? b.meetingDate;
    const meeting_type = b.meeting_type ?? b.meetingType ?? '安全会议';
    const organizer = b.organizer;
    const attendees = Array.isArray(b.attendees) ? b.attendees : [];
    if (!meeting_name) return res.json(error(-3, '会议名称不能为空'));
    if (!meeting_date) return res.json(error(-3, '会议日期不能为空'));
    if (!Array.isArray(attendees) || attendees.length === 0) return res.json(error(-3, '请至少登记一名参会人员'));

    const code = generateCode('MEET');
    const created = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const a of attendees) {
        // 同时兼容 camelCase（web-naive）与 snake_case 两种提交契约
        const employee_id = a.employee_id ?? a.employeeId;
        const employee_name = a.employee_name ?? a.employeeName ?? '';
        const employee_code = a.employee_code ?? a.employeeCode ?? null;
        const position = a.position;
        const attendance_status = a.attendance_status ?? a.attendanceStatus ?? 'attend';
        const remark = a.remark;
        if (!employee_id) continue;
        const ins = await client.query(
          `INSERT INTO meeting_records
            (meeting_code, meeting_name, meeting_date, meeting_type, organizer,
             employee_id, employee_code, employee_name, position, attendance_status, remark, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING *`,
          [code, meeting_name, meeting_date, meeting_type, organizer || null,
           employee_id, employee_code || null, employee_name || '', position || null,
           attendance_status, remark || null, req.user?.id || null]
        );
        created.push(ins.rows[0]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json(success({
      meetingCode: code,
      meetingName: meeting_name,
      meetingDate: meeting_date,
      list: created.map(camelKeys),
    }, `会议创建成功（登记 ${created.length} 人）`));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /:id — 更新出席状态（absent→attend 补参自动撤销，由扫描幂等不重复扣）
router.put('/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const id = parseInt(req.params.id);
    const b = req.body || {};
    const attendance_status = b.attendance_status ?? b.attendanceStatus;
    const remark = b.remark;
    if (!attendance_status || !['attend', 'absent', 'not_required'].includes(attendance_status)) {
      return res.json(error(-3, '无效的出席状态'));
    }
    const markSign = attendance_status === 'attend';
    const upd = await pool.query(
      `UPDATE meeting_records SET attendance_status=$1,
         sign_time=CASE WHEN $2 THEN COALESCE(sign_time, NOW()) ELSE sign_time END,
         remark=COALESCE($3, remark), updated_at=NOW()
       WHERE id=$4 AND is_deleted=FALSE RETURNING *`,
      [attendance_status, markSign, remark || null, id]
    );
    if (!upd.rows.length) return res.json(error(-2, '记录不存在'));
    res.json(success(camelKeys(upd.rows[0]), '更新成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// DELETE /:id — 删除出席记录
router.delete('/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const id = parseInt(req.params.id);
    const row = await pool.query(
      `SELECT * FROM meeting_records WHERE id=$1 AND is_deleted=FALSE`, [id]
    );
    if (!row.rows.length) return res.json(error(-2, '记录不存在'));
    await pool.query(
      `UPDATE meeting_records SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1`, [id]
    );
    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

module.exports = router;