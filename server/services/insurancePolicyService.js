/**
 * 保险模块 · 保单管理服务（insurance_policies 表）—— PostgreSQL + 内存降级双模式
 * 从 routes/insurance.js /policies 子域迁移，业务逻辑 + SQL，无 express 依赖（req.file 由 controller 解析传入）。
 * 跨域共享辅助取自 services/insuranceShared（ensurePolicyTable / memoryStores / memoryCounters）。
 */

const fs = require('fs');
const { pool, isConnected } = require('../config/db');
const logger = require('../utils/logger');
const { validateUploadedFile } = require('../middleware/upload');
const { ensurePolicyTable, memoryStores, memoryCounters } = require('./insuranceShared');

// GET /policies — 保单列表
async function listPolicies(query) {
  await ensurePolicyTable();
  const { type } = query;
  if (!isConnected()) {
    let data = memoryStores.policies.filter((r) => !r.is_deleted);
    if (type) data = data.filter((r) => r.type === type);
    const list = data.map((r) => ({
      id: r.id, name: r.name, type: r.type,
      fileName: r.fileName, originalName: r.originalName, createdAt: r.created_at,
    }));
    return { __t: 'list', list, total: list.length, page: 1, pageSize: list.length, message: '查询成功(内存模式)' };
  }
  let where = '';
  const params = [];
  let idx = 0;
  if (type) {
    idx++;
    where = ` WHERE type = $${idx}`;
    params.push(type);
  }
  const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM insurance_policies${where}`, params);
  const total = countR.rows[0].total;
  const result = await pool.query(
    `SELECT * FROM insurance_policies${where} ORDER BY id DESC`,
    params,
  );
  const list = result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    policyNo: r.policy_no || '',
    year: r.year || '',
    fileName: r.file_name,
    originalName: r.original_name,
    createdAt: r.created_at,
  }));
  return { __t: 'list', list, total, page: 1, pageSize: total, message: '查询成功' };
}

// POST /policies/import-pdf — 上传人员保单（雇主责任险/工伤保险 主保单文档）
async function importPolicyPdf(file, body) {
  try {
    if (!file) {
      return { __t: 'json', payload: null, message: '', error: { code: -1, message: '请上传 PDF 保单文件' } };
    }
    const validation = validateUploadedFile(file, 'pdf');
    if (!validation.valid) {
      return { __t: 'json', payload: null, message: '', error: { code: -1, message: validation.error } };
    }

    const name = (body.name || '').trim() || file.originalname;
    const type = (body.type || '雇主责任险').trim();
    const policyNo = (body.policyNo || '').trim();
    const year = (body.year || '').trim();

    if (!isConnected()) {
      const record = {
        id: memoryCounters.policies++,
        name, type, policyNo, year,
        fileName: file.filename,
        originalName: file.originalname,
        is_deleted: false,
        created_at: new Date().toISOString(),
      };
      memoryStores.policies.push(record);
      return {
        __t: 'json',
        payload: { id: record.id, name, type, policyNo, year, fileName: record.fileName, originalName: file.originalname },
        message: '上传成功(内存模式)',
      };
    }

    const result = await pool.query(
      `INSERT INTO insurance_policies (name, type, policy_no, year, file_name, original_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, type, policyNo, year, file.filename, file.originalname],
    );
    return {
      __t: 'json',
      payload: {
        id: result.rows[0].id,
        name,
        type,
        policyNo: result.rows[0].policy_no || '',
        year: result.rows[0].year || '',
        fileName: result.rows[0].file_name,
        originalName: result.rows[0].original_name,
      },
      message: '上传成功',
    };
  } catch (err) {
    if (file && file.path) {
      try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
    }
    logger.error('[Insurance] 保单上传失败:', { error: err, stack: err && err.stack });
    return { __t: 'json', payload: null, message: '', error: { code: -1, message: `上传失败: ${err.message}` } };
  }
}

// DELETE /policies/:id — 删除保单
async function deletePolicy(id) {
  await ensurePolicyTable();
  if (!isConnected()) {
    const r = memoryStores.policies.find((x) => x.id === parseInt(id));
    if (r) r.is_deleted = true;
    return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
  }
  const result = await pool.query('DELETE FROM insurance_policies WHERE id=$1 RETURNING id', [id]);
  if (result.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
  return { __t: 'json', payload: null, message: '删除成功' };
}

// PUT /policies/:id — 编辑保单信息（保单号/年份/名称/类型；不更换文件）
async function updatePolicy(id, body) {
  await ensurePolicyTable();
  const idNum = parseInt(id, 10);
  if (!idNum) return { __t: 'json', payload: null, message: '', error: { code: -1, message: '无效的保单ID' } };
  const { name, type, policyNo, year } = body || {};

  if (!isConnected()) {
    const r = memoryStores.policies.find((x) => x.id === idNum && !x.is_deleted);
    if (!r) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
    if (name != null) r.name = String(name).trim();
    if (type != null) r.type = String(type).trim();
    if (policyNo != null) r.policyNo = String(policyNo).trim();
    if (year != null) r.year = String(year).trim();
    return {
      __t: 'json',
      payload: { id: r.id, name: r.name, type: r.type, policyNo: r.policyNo, year: r.year, fileName: r.fileName, originalName: r.originalName },
      message: '更新成功(内存模式)',
    };
  }

  const result = await pool.query(
    `UPDATE insurance_policies
       SET name = COALESCE(NULLIF($2,''), name),
           type = COALESCE(NULLIF($3,''), type),
           policy_no = NULLIF($4, ''),
           year = NULLIF($5, '')
     WHERE id = $1 RETURNING *`,
    [idNum, name != null ? String(name) : null, type != null ? String(type) : null, policyNo != null ? String(policyNo) : null, year != null ? String(year) : null],
  );
  if (result.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
  const r = result.rows[0];
  return {
    __t: 'json',
    payload: {
      id: r.id, name: r.name, type: r.type,
      policyNo: r.policy_no || '', year: r.year || '',
      fileName: r.file_name, originalName: r.original_name, createdAt: r.created_at,
    },
    message: '更新成功',
  };
}

module.exports = {
  listPolicies,
  importPolicyPdf,
  deletePolicy,
  updatePolicy,
};