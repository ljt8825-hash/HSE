const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const {
  getSystemManagementRule,
  getPasswordPolicy,
  getLoginSecurity,
  getMaxFailedAttempts,
  getLockDurationMinutes,
  getAuditRetentionDays,
  getDefaultRoles,
  getDataScopeLevels,
} = require('../config/hseRules');

const mem = {
  users: [], roles: [], audits: [],
  counters: { users: 1, roles: 1, audits: 1 },
  failedAttempts: {},
};

function nowISO() { return new Date().toISOString(); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

// ============================================================
// 密码策略校验（读配置，零硬编码）
// ============================================================
function validatePassword(password) {
  const p = getPasswordPolicy();
  if (!password || password.length < (p.minLength || 8)) return { valid: false, message: `密码长度不能少于 ${p.minLength || 8} 位` };
  if (password.length > (p.maxLength || 32)) return { valid: false, message: `密码长度不能超过 ${p.maxLength || 32} 位` };
  if (p.requireUppercase && !/[A-Z]/.test(password)) return { valid: false, message: '密码必须包含大写字母' };
  if (p.requireLowercase && !/[a-z]/.test(password)) return { valid: false, message: '密码必须包含小写字母' };
  if (p.requireNumber && !/[0-9]/.test(password)) return { valid: false, message: '密码必须包含数字' };
  if (p.requireSpecial && !(new RegExp(`[${(p.specialChars || '!@#$%^&*').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(password))) return { valid: false, message: '密码必须包含特殊字符' };
  return { valid: true };
}

// ============================================================
// 规则查询
// ============================================================
router.get('/rules', (req, res) => {
  res.json(success({
    passwordPolicy: getPasswordPolicy(),
    loginSecurity: getLoginSecurity(),
    maxFailedAttempts: getMaxFailedAttempts(),
    lockDurationMinutes: getLockDurationMinutes(),
    auditRetentionDays: getAuditRetentionDays(),
    defaultRoles: getDefaultRoles(),
    dataScopeLevels: getDataScopeLevels(),
    forbidden: (getSystemManagementRule() || {}).forbidden || {},
  }, '规则查询成功'));
});

// ============================================================
// 密码策略校验接口
// ============================================================
router.post('/password/validate', (req, res) => {
  const { password } = req.body;
  const result = validatePassword(password);
  res.json(success(result, '校验完成'));
});

// ============================================================
// 用户统计
// ============================================================
router.get('/users/stats', async (req, res) => {
  try {
    if (!isConnected()) {
      const u = mem.users.filter(r => !r.is_deleted);
      return res.json(success({ total: u.length, active: u.filter(r => r.is_active).length, inactive: u.filter(r => !r.is_active).length, locked: u.filter(r => r.is_locked).length }, '统计(内存)'));
    }
    const [tR, aR, iR, lR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM users WHERE is_deleted=false'),
      pool.query('SELECT COUNT(*)::int AS c FROM users WHERE is_deleted=false AND is_active=true'),
      pool.query('SELECT COUNT(*)::int AS c FROM users WHERE is_deleted=false AND is_active=false'),
      pool.query('SELECT COUNT(*)::int AS c FROM users WHERE is_deleted=false AND is_locked=true'),
    ]).catch(async () => {
      const all = await pool.query("SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_name='users'");
      if (parseInt(all.rows[0]?.c || 0) === 0) return [{ rows: [{ c: 0 }] }, { rows: [{ c: 0 }] }, { rows: [{ c: 0 }] }, { rows: [{ c: 0 }] }];
      throw new Error('users表查询失败');
    });
    res.json(success({ total: parseInt(tR.rows[0].c), active: parseInt(aR.rows[0].c), inactive: parseInt(iR.rows[0].c), locked: parseInt(lR.rows[0].c) }, '统计成功'));
  } catch (e) {
    res.json(success({ total: 0, active: 0, inactive: 0, locked: 0 }, '暂无数据'));
  }
});

// ============================================================
// 用户管理 CRUD（内存模式兜底）
// ============================================================
router.get('/users', async (req, res) => {
  try {
    const { page, pageSize, keyword, isActive } = req.query;
    if (!isConnected()) {
      let d = mem.users.filter(r => !r.is_deleted);
      if (keyword) d = d.filter(r => JSON.stringify(r).toLowerCase().includes(keyword.toLowerCase()));
      if (isActive !== undefined && isActive !== '') d = d.filter(r => String(r.is_active) === String(isActive));
      const total = d.length; const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
      return res.json(success({ list: d.slice((p - 1) * ps, p * ps), total, page: p, pageSize: ps }, '查询(内存)'));
    }
    const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const where = ['is_deleted=false']; const params = [];
    if (keyword) { params.push(`%${keyword}%`); where.push(`(username ILIKE $${params.length} OR real_name ILIKE $${params.length})`); }
    if (isActive !== undefined && isActive !== '') { params.push(isActive === 'true'); where.push(`is_active=$${params.length}`); }
    const [cR, lR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM users WHERE ${where.join(' AND ')}`, params).catch(() => ({ rows: [{ c: 0 }] })),
      pool.query(`SELECT id, username, real_name, email, phone, department, role, is_active, is_locked, last_login_at, created_at FROM users WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params).catch(() => ({ rows: [] })),
    ]);
    res.json(success({ list: lR.rows, total: parseInt(cR.rows[0].c), page: p, pageSize: ps }, '查询成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.post('/users', async (req, res) => {
  try {
    const b = req.body;
    const pv = validatePassword(b.password);
    if (!pv.valid) return res.json(error(-1, pv.message));
    if (!isConnected()) {
      const rec = { id: mem.counters.users++, username: b.username, real_name: b.real_name, password: bcrypt.hashSync(b.password, 10), email: b.email, phone: b.phone, department: b.department, role: b.role, is_active: true, is_locked: false, employee_id: b.employee_id, employee_no: b.employee_no, failed_attempts: 0, last_login_at: null, is_deleted: false, created_at: nowISO(), updated_at: nowISO() };
      mem.users.push(rec);
      return res.json(success({ ...rec, password: undefined }, '创建(内存)'));
    }
    const hash = bcrypt.hashSync(b.password, 10);
    const r = await pool.query(
      'INSERT INTO users(username, real_name, password, email, phone, department, role, employee_id, employee_no) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, username, real_name, email, phone, department, role, is_active, created_at',
      [b.username, b.real_name, hash, b.email, b.phone, b.department, b.role, b.employee_id, b.employee_no]
    );
    res.json(success(r.rows[0], '创建成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.put('/users/:id/active', async (req, res) => {
  try {
    const id = parseInt(req.params.id); const { is_active } = req.body;
    if (!isConnected()) {
      const u = mem.users.find(x => x.id === id && !x.is_deleted);
      if (u) { u.is_active = is_active; u.updated_at = nowISO(); }
      return res.json(success(null, '更新(内存)'));
    }
    await pool.query('UPDATE users SET is_active=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [is_active, id]);
    res.json(success(null, '更新成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.put('/users/:id/reset-password', async (req, res) => {
  try {
    const id = parseInt(req.params.id); const { password } = req.body;
    const pv = validatePassword(password);
    if (!pv.valid) return res.json(error(-1, pv.message));
    const hash = bcrypt.hashSync(password, 10);
    if (!isConnected()) {
      const u = mem.users.find(x => x.id === id && !x.is_deleted);
      if (u) { u.password = hash; u.updated_at = nowISO(); }
      return res.json(success(null, '重置密码(内存)'));
    }
    await pool.query('UPDATE users SET password=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [hash, id]);
    res.json(success(null, '重置密码成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.put('/users/:id/lock', async (req, res) => {
  try {
    const id = parseInt(req.params.id); const { is_locked } = req.body;
    if (!isConnected()) {
      const u = mem.users.find(x => x.id === id && !x.is_deleted);
      if (u) { u.is_locked = is_locked; if (!is_locked) u.failed_attempts = 0; u.updated_at = nowISO(); }
      return res.json(success(null, '更新(内存)'));
    }
    const extra = !is_locked ? ', failed_attempts=0' : '';
    await pool.query(`UPDATE users SET is_locked=$1${extra}, updated_at=CURRENT_TIMESTAMP WHERE id=$2`, [is_locked, id]);
    res.json(success(null, '更新成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

// ============================================================
// 角色统计
// ============================================================
router.get('/roles/stats', async (req, res) => {
  try {
    if (!isConnected()) {
      const d = mem.roles.filter(r => !r.is_deleted);
      return res.json(success({ total: d.length }, '统计(内存)'));
    }
    const r = await pool.query('SELECT COUNT(*)::int AS c FROM roles WHERE is_deleted=false').catch(() => ({ rows: [{ c: 0 }] }));
    res.json(success({ total: parseInt(r.rows[0].c) }, '统计成功'));
  } catch (e) { res.json(success({ total: 0 }, '暂无数据')); }
});

// ============================================================
// 角色管理（内存兜底）
// ============================================================
router.get('/roles', async (req, res) => {
  try {
    const { page, pageSize, keyword } = req.query;
    if (!isConnected()) {
      let d = mem.roles.filter(r => !r.is_deleted);
      if (keyword) d = d.filter(r => JSON.stringify(r).toLowerCase().includes(keyword.toLowerCase()));
      const total = d.length; const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
      return res.json(success({ list: d.slice((p - 1) * ps, p * ps), total, page: p, pageSize: ps }, '查询(内存)'));
    }
    const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const where = ['is_deleted=false']; const params = [];
    if (keyword) { params.push(`%${keyword}%`); where.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length})`); }
    const [cR, lR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM roles WHERE ${where.join(' AND ')}`, params).catch(() => ({ rows: [{ c: 0 }] })),
      pool.query(`SELECT id, code, name, description, sort_order, is_active, created_at FROM roles WHERE ${where.join(' AND ')} ORDER BY sort_order, created_at DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params).catch(() => ({ rows: [] })),
    ]);
    res.json(success({ list: lR.rows, total: parseInt(cR.rows[0].c), page: p, pageSize: ps }, '查询成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.post('/roles', async (req, res) => {
  try {
    const b = req.body;
    if (!isConnected()) {
      const rec = { id: mem.counters.roles++, code: b.code, name: b.name, description: b.description, sort_order: b.sort_order || 0, is_active: true, is_deleted: false, created_at: nowISO(), updated_at: nowISO() };
      mem.roles.push(rec);
      return res.json(success(rec, '创建(内存)'));
    }
    const r = await pool.query(
      'INSERT INTO roles(code, name, description, sort_order) VALUES($1,$2,$3,$4) RETURNING *',
      [b.code, b.name, b.description, b.sort_order || 0]
    );
    res.json(success(r.rows[0], '创建成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

// ============================================================
// 审计日志统计
// ============================================================
router.get('/audit/stats', async (req, res) => {
  try {
    const now = new Date(); const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
    if (!isConnected()) {
      const d = mem.audits;
      return res.json(success({ today: d.filter(r => r.created_at >= todayStart).length, todayFailed: d.filter(r => r.created_at >= todayStart && r.action === 'login' && r.result === 'fail').length, weekCritical: d.filter(r => r.created_at >= weekStart && ['delete', 'permission_change', 'password_reset'].includes(r.action)).length, retentionDays: getAuditRetentionDays() }, '统计(内存)'));
    }
    const retention = getAuditRetentionDays();
    const [tR, tfR, wcR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM audit_record WHERE created_at >= $1', [todayStart]).catch(() => ({ rows: [{ c: 0 }] })),
      pool.query("SELECT COUNT(*)::int AS c FROM audit_record WHERE created_at >= $1 AND action='login' AND result='fail'", [todayStart]).catch(() => ({ rows: [{ c: 0 }] })),
      pool.query("SELECT COUNT(*)::int AS c FROM audit_record WHERE created_at >= $1 AND action IN ('delete','permission_change','password_reset','export')", [weekStart]).catch(() => ({ rows: [{ c: 0 }] })),
    ]);
    res.json(success({ today: parseInt(tR.rows[0].c), todayFailed: parseInt(tfR.rows[0].c), weekCritical: parseInt(wcR.rows[0].c), retentionDays: retention }, '统计成功'));
  } catch (e) { res.json(success({ today: 0, todayFailed: 0, weekCritical: 0, retentionDays: getAuditRetentionDays() }, '暂无数据')); }
});

// ============================================================
// 审计日志（只读，禁止删除）
// ============================================================
router.get('/audit', async (req, res) => {
  try {
    const { page, pageSize, keyword, user_id, action, start_date, end_date } = req.query;
    if (!isConnected()) {
      let d = [...mem.audits].reverse();
      if (keyword) d = d.filter(r => JSON.stringify(r).toLowerCase().includes(keyword.toLowerCase()));
      if (user_id) d = d.filter(r => r.user_id === parseInt(user_id));
      if (action) d = d.filter(r => r.action === action);
      if (start_date) d = d.filter(r => r.created_at >= start_date);
      if (end_date) d = d.filter(r => r.created_at <= end_date + 'T23:59:59');
      const total = d.length; const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
      return res.json(success({ list: d.slice((p - 1) * ps, p * ps), total, page: p, pageSize: ps }, '查询(内存)'));
    }
    const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const where = ['1=1']; const params = [];
    if (user_id) { params.push(parseInt(user_id)); where.push(`user_id=$${params.length}`); }
    if (action) { params.push(action); where.push(`action=$${params.length}`); }
    if (start_date) { params.push(start_date); where.push(`created_at >= $${params.length}`); }
    if (end_date) { params.push(end_date + 'T23:59:59'); where.push(`created_at <= $${params.length}`); }
    const [cR, lR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM audit_record WHERE ${where.join(' AND ')}`, params).catch(() => ({ rows: [{ c: 0 }] })),
      pool.query(`SELECT id, user_id, username, action, module, ip_address, result, detail, created_at FROM audit_record WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params).catch(() => ({ rows: [] })),
    ]);
    res.json(success({ list: lR.rows, total: parseInt(cR.rows[0].c), page: p, pageSize: ps }, '查询成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

// ============================================================
// 总览统计
// ============================================================
router.get('/stats/overview', async (req, res) => {
  try {
    const now = new Date(); const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
    if (!isConnected()) {
      const u = mem.users.filter(r => !r.is_deleted);
      return res.json(success({
        users: { total: u.length, active: u.filter(r => r.is_active).length, inactive: u.filter(r => !r.is_active).length, locked: u.filter(r => r.is_locked).length },
        roles: { total: mem.roles.filter(r => !r.is_deleted).length },
        audit: { todayLogin: mem.audits.filter(r => r.created_at >= todayStart && r.action === 'login').length, todayFailed: mem.audits.filter(r => r.created_at >= todayStart && r.action === 'login' && r.result === 'fail').length, weekCritical: mem.audits.filter(r => r.created_at >= weekStart && ['delete', 'permission_change'].includes(r.action)).length },
      }, '总览(内存)'));
    }
    const [uT, uA, uI, uL, rT, aLogin, aFail, aCrit] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM users WHERE is_deleted=false').catch(() => ({ rows: [{ c: 0 }] })),
      pool.query('SELECT COUNT(*)::int AS c FROM users WHERE is_deleted=false AND is_active=true').catch(() => ({ rows: [{ c: 0 }] })),
      pool.query('SELECT COUNT(*)::int AS c FROM users WHERE is_deleted=false AND is_active=false').catch(() => ({ rows: [{ c: 0 }] })),
      pool.query('SELECT COUNT(*)::int AS c FROM users WHERE is_deleted=false AND is_locked=true').catch(() => ({ rows: [{ c: 0 }] })),
      pool.query('SELECT COUNT(*)::int AS c FROM roles WHERE is_deleted=false').catch(() => ({ rows: [{ c: 0 }] })),
      pool.query('SELECT COUNT(*)::int AS c FROM audit_record WHERE created_at >= $1 AND action=\'login\'', [todayStart]).catch(() => ({ rows: [{ c: 0 }] })),
      pool.query("SELECT COUNT(*)::int AS c FROM audit_record WHERE created_at >= $1 AND action='login' AND result='fail'", [todayStart]).catch(() => ({ rows: [{ c: 0 }] })),
      pool.query("SELECT COUNT(*)::int AS c FROM audit_record WHERE created_at >= $1 AND action IN ('delete','permission_change','password_reset','export')", [weekStart]).catch(() => ({ rows: [{ c: 0 }] })),
    ]);
    res.json(success({
      users: { total: parseInt(uT.rows[0].c), active: parseInt(uA.rows[0].c), inactive: parseInt(uI.rows[0].c), locked: parseInt(uL.rows[0].c) },
      roles: { total: parseInt(rT.rows[0].c) },
      audit: { todayLogin: parseInt(aLogin.rows[0].c), todayFailed: parseInt(aFail.rows[0].c), weekCritical: parseInt(aCrit.rows[0].c) },
    }, '总览统计成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/stats', async (req, res) => {
  try {
    if (!isConnected()) {
      return res.json(success({
        totalUsers: mem.users.filter(r => !r.is_deleted).length,
        totalRoles: mem.roles.filter(r => !r.is_deleted).length,
        totalAudits: mem.audits.length,
      }, '统计(内存)'));
    }
    const [u, r, a] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM users WHERE is_deleted=false').catch(() => ({ rows: [{ c: 0 }] })),
      pool.query('SELECT COUNT(*)::int AS c FROM roles WHERE is_deleted=false').catch(() => ({ rows: [{ c: 0 }] })),
      pool.query('SELECT COUNT(*)::int AS c FROM audit_record').catch(() => ({ rows: [{ c: 0 }] })),
    ]);
    res.json(success({ totalUsers: parseInt(u.rows[0].c), totalRoles: parseInt(r.rows[0].c), totalAudits: parseInt(a.rows[0].c) }, '统计成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/', (req, res) => {
  res.json(success({ module: '系统管理', menus: ['users', 'roles', 'audit'] }, '系统管理模块'));
});

module.exports = router;
