/**
 * 保险模块 · 其他保险服务（other_insurance 表）—— PostgreSQL + 内存降级双模式
 * 从 routes/insurance.js /other 及 /other/import-pdf 子域迁移，业务逻辑 + SQL，无 express 依赖
 * （req.file 元信息由 controller 层解析传入）。
 * 跨域共享辅助取自 services/insuranceShared（ensureOtherInsuranceTable / formatOtherInsurance / extractOtherInsuranceFields / memoryStores / memoryCounters 等）。
 */

const fs = require('fs');
const { pool, isConnected } = require('../config/db');
const logger = require('../utils/logger');
const { paginateMemory, buildMemoryRecord } = require('../utils/commonResponse');
const { validateUploadedFile } = require('../middleware/upload');
const {
  ensureOtherInsuranceTable,
  memoryStores,
  memoryCounters,
  formatOtherInsurance,
  calcExpiryStatus,
  extractOtherInsuranceFields,
} = require('./insuranceShared');

// GET /other — 其他保险列表
async function listOther(query) {
  await ensureOtherInsuranceTable();
  const { page = 1, pageSize = 20, keyword, insuranceType, expiryStatus } = query;

  if (!isConnected()) {
    let data = memoryStores.other.filter(r => !r.is_deleted);
    if (keyword) {
      const kw = keyword.toLowerCase();
      data = data.filter(r => (r.insured_subject && r.insured_subject.toLowerCase().includes(kw)) || (r.policy_no && r.policy_no.toLowerCase().includes(kw)));
    }
    if (insuranceType) data = data.filter(r => r.insurance_type === insuranceType);
    if (expiryStatus) {
      data = data.filter(r => calcExpiryStatus(r.expire_date) === expiryStatus);
    }
    const { list, total } = paginateMemory(data, page, pageSize);
    return { __t: 'list', list: list.map(formatOtherInsurance), total, page, pageSize, message: '查询成功(内存模式)' };
  }

  let whereSql = ' WHERE is_deleted = false';
  const params = [];
  let paramIdx = 0;
  if (keyword) {
    paramIdx++;
    whereSql += ` AND (insured_subject ILIKE $${paramIdx} OR policy_no ILIKE $${paramIdx})`;
    params.push(`%${keyword}%`);
  }
  if (insuranceType) {
    paramIdx++;
    whereSql += ` AND insurance_type = $${paramIdx}`;
    params.push(insuranceType);
  }

  const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM other_insurance${whereSql}`, params);
  const total = countR.rows[0].total;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  paramIdx++; params.push(parseInt(pageSize));
  paramIdx++; params.push(offset);

  const result = await pool.query(
    `SELECT * FROM other_insurance${whereSql} ORDER BY id ASC LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`,
    params
  );
  let list = result.rows.map(formatOtherInsurance);
  if (expiryStatus) list = list.filter(r => r.expiryStatus === expiryStatus);

  return { __t: 'list', list, total, page: parseInt(page), pageSize: parseInt(pageSize), message: '查询成功' };
}

// GET /other/stats — 其他保险统计
async function otherStats() {
  await ensureOtherInsuranceTable();
  const stats = { total: 0, normal: 0, expiring: 0, expired: 0, totalPremium: 0, totalCoverage: 0 };
  let byType = {};

  if (isConnected()) {
    const r1 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false");
    stats.total = r1.rows[0].v;
    const r2 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false AND expire_date > CURRENT_DATE + INTERVAL '30 days'");
    stats.normal = r2.rows[0].v;
    const r3 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false AND expire_date >= CURRENT_DATE AND expire_date <= CURRENT_DATE + INTERVAL '30 days'");
    stats.expiring = r3.rows[0].v;
    const r4 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false AND expire_date < CURRENT_DATE");
    stats.expired = r4.rows[0].v;
    const r5 = await pool.query("SELECT COALESCE(SUM(premium),0)::float AS p, COALESCE(SUM(coverage_amount),0)::float AS c FROM other_insurance WHERE is_deleted = false");
    stats.totalPremium = r5.rows[0].p;
    stats.totalCoverage = r5.rows[0].c;
    const r6 = await pool.query("SELECT insurance_type, COUNT(*)::int AS cnt FROM other_insurance WHERE is_deleted = false GROUP BY insurance_type");
    r6.rows.forEach(r => { byType[r.insurance_type] = r.cnt; });
  } else {
    const all = memoryStores.other.filter(r => !r.is_deleted);
    stats.total = all.length;
    all.forEach(r => {
      const s = calcExpiryStatus(r.expire_date);
      if (s === 'normal') stats.normal++;
      else if (s === 'expiring') stats.expiring++;
      else if (s === 'expired') stats.expired++;
      stats.totalPremium += parseFloat(r.premium) || 0;
      stats.totalCoverage += parseFloat(r.coverage_amount) || 0;
      byType[r.insurance_type] = (byType[r.insurance_type] || 0) + 1;
    });
  }
  return { __t: 'json', payload: { stats, byType }, message: '查询成功' };
}

// POST /other — 新增其他保险
async function createOther(body) {
  await ensureOtherInsuranceTable();
  const b = body;
  if (!isConnected()) {
    const record = buildMemoryRecord(memoryCounters.other++, b);
    memoryStores.other.push(record);
    return { __t: 'json', payload: record, message: '创建成功(内存模式)' };
  }
  const result = await pool.query(`
    INSERT INTO other_insurance (insurance_type, policy_no, insured_subject, coverage_amount, premium, start_date, expire_date, insurance_company, department, contact_person, contact_phone, status, remark, pdf_file)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *
  `, [b.insuranceType || '', b.policyNo || '', b.insuredSubject || '', b.coverageAmount || 0, b.premium || 0, b.startDate || null, b.expireDate || null, b.insuranceCompany || '', b.department || '', b.contactPerson || '', b.contactPhone || '', b.status || '有效', b.remark || '', b.pdfFile || '']);
  return { __t: 'json', payload: formatOtherInsurance(result.rows[0]), message: '创建成功' };
}

// PUT /other/:id — 更新其他保险
async function updateOther(id, body) {
  await ensureOtherInsuranceTable();
  const b = body;
  if (!isConnected()) {
    const idx = memoryStores.other.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
    if (idx === -1) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
    Object.assign(memoryStores.other[idx], b, { updated_at: new Date().toISOString() });
    return { __t: 'json', payload: memoryStores.other[idx], message: '更新成功(内存模式)' };
  }
  const result = await pool.query(`
    UPDATE other_insurance SET insurance_type=COALESCE($1,insurance_type), policy_no=COALESCE($2,policy_no),
      insured_subject=COALESCE($3,insured_subject), coverage_amount=COALESCE($4,coverage_amount),
      premium=COALESCE($5,premium), start_date=COALESCE($6,start_date), expire_date=COALESCE($7,expire_date),
      insurance_company=COALESCE($8,insurance_company), department=COALESCE($9,department),
      contact_person=COALESCE($10,contact_person), contact_phone=COALESCE($11,contact_phone),
      status=COALESCE($12,status), remark=COALESCE($13,remark), pdf_file=COALESCE($15,pdf_file), updated_at=CURRENT_TIMESTAMP
    WHERE id=$14 AND is_deleted=false RETURNING *
  `, [b.insuranceType, b.policyNo, b.insuredSubject, b.coverageAmount, b.premium, b.startDate, b.expireDate, b.insuranceCompany, b.department, b.contactPerson, b.contactPhone, b.status, b.remark, id, b.pdfFile || null]);
  if (result.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
  return { __t: 'json', payload: formatOtherInsurance(result.rows[0]), message: '更新成功' };
}

// DELETE /other/:id — 删除其他保险
async function deleteOther(id) {
  await ensureOtherInsuranceTable();
  if (!isConnected()) {
    const r = memoryStores.other.find(r => r.id === parseInt(id) && !r.is_deleted);
    if (!r) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
    r.is_deleted = true;
    return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
  }
  const result = await pool.query('UPDATE other_insurance SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id', [id]);
  if (result.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
  return { __t: 'json', payload: null, message: '删除成功' };
}

// POST /other/import-pdf — 其他保险 PDF 保单导入识别
async function importOtherPdf(file) {
  let parser = null;
  try {
    if (!file) {
      return { __t: 'json', payload: null, message: '', error: { code: -1, message: '请上传 PDF 保单文件' } };
    }

    const validation = validateUploadedFile(file, 'pdf');
    if (!validation.valid) {
      return { __t: 'json', payload: null, message: '', error: { code: -1, message: validation.error } };
    }

    const dataBuffer = fs.readFileSync(file.path);
    const { PDFParse } = require('pdf-parse');
    parser = new PDFParse({ data: dataBuffer });
    const textResult = await parser.getText({ first: 5 });
    const text = (textResult.text || '').trim();

    const extracted = extractOtherInsuranceFields(text);
    const totalPages = textResult.total || 0;
    const pagesRead = Math.min(totalPages, 5);

    // 可信度：按已识别字段数简单计算
    const fields = [extracted.policyNo, extracted.startDate, extracted.expireDate, extracted.insuranceCompany];
    const confidence = Math.round((fields.filter(Boolean).length / fields.length) * 100);

    // 保留识别失败的临时文件以便人工核对，但限制大小
    const keepFile = file.size <= 10 * 1024 * 1024;
    if (!keepFile) {
      try { fs.unlinkSync(file.path); } catch (e) {}
    }

    return {
      __t: 'json',
      payload: {
        fileName: file.originalname,
        storedName: file.filename,
        fileSize: file.size,
        totalPages,
        pagesRead,
        textPreview: text.slice(0, 800),
        extracted,
        confidence,
        tempPath: keepFile ? file.path : undefined,
      },
      message: 'PDF 识别完成',
    };
  } catch (err) {
    // 清理失败时上传的临时文件
    if (file && file.path) {
      try { fs.unlinkSync(file.path); } catch (e) {}
    }
    logger.error('[Insurance] PDF 导入识别失败:', { error: err, stack: err && err.stack });
    return { __t: 'json', payload: null, message: '', error: { code: -1, message: `PDF 识别失败: ${err.message}` } };
  } finally {
    if (parser && typeof parser.destroy === 'function') {
      try { await parser.destroy(); } catch (e) {}
    }
  }
}

module.exports = {
  listOther,
  otherStats,
  createOther,
  updateOther,
  deleteOther,
  importOtherPdf,
};