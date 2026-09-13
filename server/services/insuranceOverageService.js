/**
 * 保险模块 · 超龄人员服务（over_age_personnel 表）—— PostgreSQL + 内存降级双模式
 * 从 routes/insurance.js /overage 子域迁移，业务逻辑 + SQL，无 express 依赖。
 * 返回统一描述符供 controller 包装（__t: list / json / csv / not-found）。
 * 跨域共享辅助取自 services/insuranceShared（formatOverage / maskIdCard / memoryStores / memoryCounters 等）。
 */

const { pool, isConnected } = require('../config/db');
const logger = require('../utils/logger');
const { paginateMemory, buildMemoryRecord } = require('../utils/commonResponse');
const { decryptResult } = require('../middleware/encryption');
const { initMemoryData, memoryStores, memoryCounters, formatOverage, maskIdCard } = require('./insuranceShared');

// GET /overage — 超龄人员列表
async function listOverage(query) {
  if (!isConnected()) {
    initMemoryData();
    let data = memoryStores.overage.filter(r => !r.is_deleted);
    const { page = 1, pageSize = 20, keyword } = query;
    if (keyword) {
      const kw = keyword.toLowerCase();
      data = data.filter(r => (r.name && r.name.toLowerCase().includes(kw)));
    }
    const { list, total } = paginateMemory(data, page, pageSize);
    return { __t: 'list', list: list.map(formatOverage), total, page, pageSize, message: '查询成功(内存模式)' };
  }

  let whereSql = ' WHERE is_deleted = false';
  const params = [];
  let paramIdx = 0;
  const { page = 1, pageSize = 20, keyword } = query;
  if (keyword) {
    paramIdx++;
    whereSql += ` AND (name ILIKE $${paramIdx} OR id_card ILIKE $${paramIdx})`;
    params.push(`%${keyword}%`);
  }

  const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM over_age_personnel${whereSql}`, params);
  const total = countR.rows[0].total;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  paramIdx++;
  const lp = paramIdx; params.push(parseInt(pageSize));
  paramIdx++;
  const op = paramIdx; params.push(offset);

  const result = await pool.query(`SELECT * FROM over_age_personnel${whereSql} ORDER BY id ASC LIMIT $${lp} OFFSET $${op}`, params);
  return { __t: 'list', list: result.rows.map(formatOverage), total, page: parseInt(page), pageSize: parseInt(pageSize), message: '查询成功' };
}

// GET /overage/export — 导出超龄人员清单（CSV，UTF-8 BOM；id_card 解密后脱敏）
async function exportOverage() {
  let data = [];
  if (isConnected()) {
    const r = await pool.query('SELECT * FROM over_age_personnel WHERE is_deleted = false ORDER BY id ASC');
    // id_card 在库中可能为密文，手动解密（res.send 绕过 res.json 拦截器）
    data = decryptResult(r.rows, ['id_card']).map(formatOverage);
  } else {
    data = memoryStores.overage.filter(r => !r.is_deleted).map(formatOverage);
  }
  const headers = ['ID', '姓名', '身份证号', '性别', '出生日期', '年龄', '部门', '岗位', '入职日期', '人员类型', '管控类型', '实际保险', '工伤险', '雇主险', '合规情况', '到期日期', '时效状态', '优化状态', '优化日期', '优化备注'];
  const expiryMap = { normal: '正常', expiring: '临期', expired: '过期', unknown: '未知' };
  const rows = data.map(r => [
    r.id || '',
    (r.name || '').replace(/"/g, '""'),
    // R2（提示词-132）：身份证号脱敏，保留前4后4
    maskIdCard(r.id_card).replace(/"/g, '""'),
    r.gender || '',
    r.birth_date || '',
    r.age || 0,
    (r.dept || '').replace(/"/g, '""'),
    (r.position || '').replace(/"/g, '""'),
    r.hire_date || '',
    r.person_type || '',
    (r.control_type || '').replace(/"/g, '""'),
    (r.actual_insurance || '').replace(/"/g, '""'),
    r.has_injury ? '有' : '无',
    r.has_employer ? '有' : '无',
    (r.compliance || '').replace(/"/g, '""'),
    r.expire_date || '',
    expiryMap[r.expiryStatus] || r.expiryStatus || '',
    r.optimize_status || '',
    r.optimize_date || '',
    (r.optimize_remark || '').replace(/"/g, '""'),
  ].map(v => `"${v}"`).join(','));
  const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
  return { __t: 'csv', csv, writeHeaders: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="over_age_personnel_${new Date().toISOString().slice(0, 10)}.csv"` } };
}

// GET /overage/:id — 超龄人员详情
async function getOverage(id) {
  if (!isConnected()) {
    const r = memoryStores.overage.find(r => r.id === parseInt(id) && !r.is_deleted);
    if (!r) return { __t: 'not-found' };
    return { __t: 'json', payload: r, message: '查询成功' };
  }
  const result = await pool.query('SELECT * FROM over_age_personnel WHERE id = $1 AND is_deleted = false', [id]);
  if (result.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
  return { __t: 'json', payload: formatOverage(result.rows[0]), message: '查询成功' };
}

// POST /overage — 新增超龄人员
async function createOverage(body) {
  if (!isConnected()) {
    const record = buildMemoryRecord(memoryCounters.overage++, body);
    memoryStores.overage.push(record);
    return { __t: 'json', payload: record, message: '创建成功(内存模式)' };
  }
  const b = body;
  const result = await pool.query(`
    INSERT INTO over_age_personnel (personnel_id, name, id_card, gender, birth_date, age, dept, position, hire_date, person_type, control_type, is_to_optimize, actual_insurance, has_injury, has_employer, compliance, expire_date, optimize_status, optimize_date, optimize_remark)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *
  `, [b.personnel_id || null, b.name || '', b.id_card || '', b.gender || '', b.birth_date || null, b.age || 0, b.dept || '', b.position || '', b.hire_date || null, b.person_type || '', b.control_type || '', b.is_to_optimize || false, b.actual_insurance || '', b.has_injury || false, b.has_employer || false, b.compliance || '', b.expire_date || null, b.optimize_status || '待处理', b.optimize_date || null, b.optimize_remark || '']);
  return { __t: 'json', payload: formatOverage(result.rows[0]), message: '创建成功' };
}

// PUT /overage/:id — 更新超龄人员
async function updateOverage(id, body) {
  if (!isConnected()) {
    const idx = memoryStores.overage.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
    if (idx === -1) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
    Object.assign(memoryStores.overage[idx], body, { updated_at: new Date().toISOString() });
    return { __t: 'json', payload: memoryStores.overage[idx], message: '更新成功(内存模式)' };
  }
  const b = body;
  const result = await pool.query(`
    UPDATE over_age_personnel SET personnel_id=COALESCE($1,personnel_id), name=COALESCE($2,name),
      id_card=COALESCE($3,id_card), gender=COALESCE($4,gender), birth_date=COALESCE($5,birth_date),
      age=COALESCE($6,age), dept=COALESCE($7,dept), position=COALESCE($8,position),
      hire_date=COALESCE($9,hire_date), person_type=COALESCE($10,person_type),
      control_type=COALESCE($11,control_type), is_to_optimize=COALESCE($12,is_to_optimize),
      actual_insurance=COALESCE($13,actual_insurance), has_injury=COALESCE($14,has_injury),
      has_employer=COALESCE($15,has_employer), compliance=COALESCE($16,compliance),
      expire_date=COALESCE($17,expire_date), optimize_status=COALESCE($18,optimize_status),
      optimize_date=COALESCE($19,optimize_date), optimize_remark=COALESCE($20,optimize_remark),
      updated_at=CURRENT_TIMESTAMP
    WHERE id=$21 AND is_deleted=false RETURNING *
  `, [b.personnel_id, b.name, b.id_card, b.gender, b.birth_date, b.age, b.dept, b.position, b.hire_date, b.person_type, b.control_type, b.is_to_optimize, b.actual_insurance, b.has_injury, b.has_employer, b.compliance, b.expire_date, b.optimize_status, b.optimize_date, b.optimize_remark, id]);
  if (result.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
  return { __t: 'json', payload: formatOverage(result.rows[0]), message: '更新成功' };
}

// DELETE /overage/:id — 删除超龄人员
async function deleteOverage(id) {
  if (!isConnected()) {
    const r = memoryStores.overage.find(r => r.id === parseInt(id) && !r.is_deleted);
    if (!r) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
    r.is_deleted = true;
    return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
  }
  const result = await pool.query('UPDATE over_age_personnel SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id', [id]);
  if (result.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
  return { __t: 'json', payload: null, message: '删除成功' };
}

module.exports = {
  listOverage,
  exportOverage,
  getOverage,
  createOverage,
  updateOverage,
  deleteOverage,
};