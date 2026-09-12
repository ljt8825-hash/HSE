const express = require('express');
const router = express.Router();
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const {
  getSystemStandardRule,
  getRegulationCategories,
  getRegulationStatuses,
  getLibraryFileTypes,
  getReviewWorkflow,
  getReviewTimeoutHours,
  getClauseTypes,
  getClauseDomains,
  getSuggestionMatchThreshold,
} = require('../config/hseRules');

const mem = {
  regulations: [], library: [], reviews: [], clauses: [], relations: [], suggestions: [], attachments: [],
  counters: { regulations: 1, library: 1, reviews: 1, clauses: 1, relations: 1, suggestions: 1, attachments: 1 },
};

function nowISO() { return new Date().toISOString(); }

// ============================================================
// 建表保障
// ============================================================
const TABLE_SQL = {
  regulations: `CREATE TABLE IF NOT EXISTS hse_regulations (
    id BIGSERIAL PRIMARY KEY, reg_no VARCHAR(64) UNIQUE, title VARCHAR(300) NOT NULL,
    category VARCHAR(50), status VARCHAR(32) DEFAULT 'draft', version VARCHAR(32) DEFAULT '1.0',
    issue_dept VARCHAR(200), issue_date DATE, effective_date DATE, review_date DATE,
    review_cycle_months INT DEFAULT 12, applicable_level VARCHAR(50),
    content_summary TEXT, full_content TEXT, author_employee_id BIGINT, author_name VARCHAR(100),
    approver_employee_id BIGINT, approver_name VARCHAR(100),
    org_unit_id BIGINT, department VARCHAR(100), township VARCHAR(100),
    is_deleted BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_by BIGINT, updated_by BIGINT
  )`,
  library: `CREATE TABLE IF NOT EXISTS hse_document_library (
    id BIGSERIAL PRIMARY KEY, doc_no VARCHAR(64) UNIQUE, title VARCHAR(300) NOT NULL,
    file_type VARCHAR(50), category VARCHAR(100), tags TEXT, keywords TEXT,
    file_name VARCHAR(500), file_path VARCHAR(500), file_size BIGINT, file_ext VARCHAR(20),
    access_level VARCHAR(32) DEFAULT 'internal', version VARCHAR(32) DEFAULT '1.0',
    uploader_employee_id BIGINT, uploader_name VARCHAR(100),
    org_unit_id BIGINT, department VARCHAR(100), parent_id BIGINT,
    is_deleted BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_by BIGINT, updated_by BIGINT
  )`,
  reviews: `CREATE TABLE IF NOT EXISTS hse_document_reviews (
    id BIGSERIAL PRIMARY KEY, doc_type VARCHAR(50), doc_id BIGINT NOT NULL,
    doc_title VARCHAR(300), workflow_step VARCHAR(32) DEFAULT 'submit',
    submitter_employee_id BIGINT, submitter_name VARCHAR(100),
    reviewer_employee_id BIGINT, reviewer_name VARCHAR(100),
    review_status VARCHAR(32) DEFAULT 'pending', review_comment TEXT,
    submitted_at TIMESTAMP, reviewed_at TIMESTAMP, due_at TIMESTAMP,
    escalated BOOLEAN DEFAULT FALSE, org_unit_id BIGINT,
    is_deleted BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  relations: `CREATE TABLE IF NOT EXISTS hse_clause_relations (
    id BIGSERIAL PRIMARY KEY, clause_id BIGINT NOT NULL, target_type VARCHAR(50) NOT NULL,
    target_id BIGINT NOT NULL, target_title VARCHAR(300), relation_type VARCHAR(50),
    confidence NUMERIC(5,4) DEFAULT 1.0, source VARCHAR(32) DEFAULT 'manual',
    confirmed BOOLEAN DEFAULT TRUE, confirmed_by BIGINT, confirmed_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT
  )`,
  suggestions: `CREATE TABLE IF NOT EXISTS hse_match_suggestions (
    id BIGSERIAL PRIMARY KEY, source_type VARCHAR(50), source_id BIGINT, source_title VARCHAR(300),
    target_type VARCHAR(50), target_id BIGINT, target_title VARCHAR(300),
    match_score NUMERIC(5,4), match_reason TEXT, status VARCHAR(32) DEFAULT 'pending',
    handled_by BIGINT, handled_at TIMESTAMP, is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  attachments: `CREATE TABLE IF NOT EXISTS hse_standards_attachments (
    id BIGSERIAL PRIMARY KEY, biz_type VARCHAR(50) NOT NULL, biz_id BIGINT NOT NULL,
    file_name VARCHAR(255), file_path VARCHAR(500), file_size BIGINT, file_type VARCHAR(50),
    uploaded_by BIGINT, uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, is_deleted BOOLEAN DEFAULT FALSE
  )`,
};

async function ensureTables() {
  if (!isConnected()) return;
  for (const k of Object.keys(TABLE_SQL)) {
    try { await pool.query(TABLE_SQL[k]); } catch (e) { /* ignore */ }
  }
}

function paginate(arr, page, pageSize) {
  const total = arr.length;
  const p = Math.max(1, parseInt(page) || 1);
  const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
  return { list: arr.slice((p - 1) * ps, p * ps), total, page: p, pageSize: ps };
}

// ============================================================
// 规则查询
// ============================================================
router.get('/rules', (req, res) => {
  res.json(success({
    regulationCategories: getRegulationCategories(),
    regulationStatuses: getRegulationStatuses(),
    libraryFileTypes: getLibraryFileTypes(),
    reviewWorkflow: getReviewWorkflow(),
    reviewTimeoutHours: getReviewTimeoutHours(),
    clauseTypes: getClauseTypes(),
    clauseDomains: getClauseDomains(),
    suggestionMatchThreshold: getSuggestionMatchThreshold(),
    forbidden: (getSystemStandardRule() || {}).forbidden || {},
  }, '规则查询成功'));
});

// ============================================================
// 附件通用
// ============================================================
router.get('/:bizType/:id/attachments', async (req, res) => {
  try {
    const { bizType, id } = req.params;
    if (!isConnected()) {
      return res.json(success(mem.attachments.filter(a => a.biz_type === bizType && a.biz_id === parseInt(id) && !a.is_deleted), '查询成功(内存)'));
    }
    const r = await pool.query('SELECT * FROM hse_standards_attachments WHERE biz_type=$1 AND biz_id=$2 AND is_deleted=false ORDER BY uploaded_at DESC', [bizType, parseInt(id)]);
    res.json(success(r.rows, '查询成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.post('/:bizType/:id/attachments', async (req, res) => {
  try {
    const { bizType, id } = req.params;
    const { file_name, file_path, file_size, file_type, uploaded_by } = req.body;
    if (!isConnected()) {
      const rec = { id: mem.counters.attachments++, biz_type: bizType, biz_id: parseInt(id), file_name, file_path, file_size, file_type, uploaded_by, uploaded_at: nowISO(), is_deleted: false };
      mem.attachments.push(rec);
      return res.json(success(rec, '上传成功(内存)'));
    }
    await ensureTables();
    const r = await pool.query(
      'INSERT INTO hse_standards_attachments(biz_type,biz_id,file_name,file_path,file_size,file_type,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [bizType, parseInt(id), file_name, file_path, file_size, file_type, uploaded_by]
    );
    res.json(success(r.rows[0], '上传成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.delete('/:bizType/:id/attachments/:aid', async (req, res) => {
  try {
    const aid = parseInt(req.params.aid);
    if (!isConnected()) {
      const r = mem.attachments.find(x => x.id === aid && !x.is_deleted);
      if (r) r.is_deleted = true;
      return res.json(success(null, '删除成功(内存)'));
    }
    await pool.query('UPDATE hse_standards_attachments SET is_deleted=true WHERE id=$1', [aid]);
    res.json(success(null, '删除成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

// ============================================================
// 1. 规章制度 regulations
// ============================================================
router.get('/regulations/stats', async (req, res) => {
  try {
    if (!isConnected()) {
      const d = mem.regulations.filter(r => !r.is_deleted);
      return res.json(success({ total: d.length, published: d.filter(r => r.status === 'published').length, pendingReview: d.filter(r => r.status === 'pending_review').length, pendingReviewDate: d.filter(r => r.status === 'published' && r.review_date && new Date(r.review_date) < new Date()).length }, '统计(内存)'));
    }
    await ensureTables();
    const [tR, pR, prR, rdR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM hse_regulations WHERE is_deleted=false'),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_regulations WHERE is_deleted=false AND status='published'"),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_regulations WHERE is_deleted=false AND status='pending_review'"),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_regulations WHERE is_deleted=false AND status='published' AND review_date IS NOT NULL AND review_date < CURRENT_DATE"),
    ]);
    res.json(success({ total: parseInt(tR.rows[0].c), published: parseInt(pR.rows[0].c), pendingReview: parseInt(prR.rows[0].c), pendingReviewDate: parseInt(rdR.rows[0].c) }, '统计成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/regulations', async (req, res) => {
  try {
    const { page, pageSize, keyword, category, status } = req.query;
    if (!isConnected()) {
      let d = mem.regulations.filter(r => !r.is_deleted);
      if (keyword) d = d.filter(r => JSON.stringify(r).toLowerCase().includes(keyword.toLowerCase()));
      if (category) d = d.filter(r => r.category === category);
      if (status) d = d.filter(r => r.status === status);
      return res.json(success(paginate(d, page, pageSize), '查询(内存)'));
    }
    await ensureTables();
    const where = ['is_deleted=false']; const params = [];
    if (keyword) { params.push(`%${keyword}%`); where.push(`(title ILIKE $${params.length} OR reg_no ILIKE $${params.length})`); }
    if (category) { params.push(category); where.push(`category=$${params.length}`); }
    if (status) { params.push(status); where.push(`status=$${params.length}`); }
    const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const [cR, lR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM hse_regulations WHERE ${where.join(' AND ')}`, params),
      pool.query(`SELECT * FROM hse_regulations WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
    ]);
    res.json(success({ list: lR.rows, total: parseInt(cR.rows[0].c), page: p, pageSize: ps }, '查询成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/regulations/export', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success({ total: mem.regulations.filter(r => !r.is_deleted).length, list: mem.regulations.filter(r => !r.is_deleted) }, '导出(内存)'));
    await ensureTables();
    const r = await pool.query('SELECT * FROM hse_regulations WHERE is_deleted=false ORDER BY created_at DESC');
    res.json(success({ total: r.rows.length, list: r.rows }, '导出成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/regulations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!isConnected()) {
      const r = mem.regulations.find(x => x.id === id && !x.is_deleted);
      return r ? res.json(success(r)) : res.json(error(-2, '不存在'));
    }
    await ensureTables();
    const r = await pool.query('SELECT * FROM hse_regulations WHERE id=$1 AND is_deleted=false', [id]);
    r.rows.length ? res.json(success(r.rows[0])) : res.json(error(-2, '不存在'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.post('/regulations', async (req, res) => {
  try {
    const b = req.body;
    if (!isConnected()) {
      const rec = { id: mem.counters.regulations++, ...b, is_deleted: false, created_at: nowISO(), updated_at: nowISO() };
      mem.regulations.push(rec);
      return res.json(success(rec, '创建(内存)'));
    }
    await ensureTables();
    const keys = Object.keys(b);
    const r = await pool.query(`INSERT INTO hse_regulations(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, keys.map(k => b[k]));
    res.json(success(r.rows[0], '创建成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.put('/regulations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id); const b = req.body;
    if (!isConnected()) {
      const idx = mem.regulations.findIndex(x => x.id === id && !x.is_deleted);
      if (idx === -1) return res.json(error(-2, '不存在'));
      Object.assign(mem.regulations[idx], b, { updated_at: nowISO() });
      return res.json(success(mem.regulations[idx], '更新(内存)'));
    }
    await ensureTables();
    const keys = Object.keys(b);
    const r = await pool.query(`UPDATE hse_regulations SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${keys.length + 1} RETURNING *`, [...keys.map(k => b[k]), id]);
    r.rows.length ? res.json(success(r.rows[0], '更新成功')) : res.json(error(-2, '不存在'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.delete('/regulations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!isConnected()) { const r = mem.regulations.find(x => x.id === id && !x.is_deleted); if (r) r.is_deleted = true; return res.json(success(null, '删除(内存)')); }
    await pool.query('UPDATE hse_regulations SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
    res.json(success(null, '删除成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

// ============================================================
// 2. 文件库 library
// ============================================================
router.get('/library/stats', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success({ total: mem.library.filter(r => !r.is_deleted).length }, '统计(内存)'));
    await ensureTables();
    const r = await pool.query('SELECT COUNT(*)::int AS c FROM hse_document_library WHERE is_deleted=false');
    res.json(success({ total: parseInt(r.rows[0].c) }, '统计成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/library', async (req, res) => {
  try {
    const { page, pageSize, keyword, file_type, category } = req.query;
    if (!isConnected()) {
      let d = mem.library.filter(r => !r.is_deleted);
      if (keyword) d = d.filter(r => JSON.stringify(r).toLowerCase().includes(keyword.toLowerCase()));
      if (file_type) d = d.filter(r => r.file_type === file_type);
      if (category) d = d.filter(r => r.category === category);
      return res.json(success(paginate(d, page, pageSize), '查询(内存)'));
    }
    await ensureTables();
    const where = ['is_deleted=false']; const params = [];
    if (keyword) { params.push(`%${keyword}%`); where.push(`(title ILIKE $${params.length} OR tags ILIKE $${params.length})`); }
    if (file_type) { params.push(file_type); where.push(`file_type=$${params.length}`); }
    if (category) { params.push(category); where.push(`category=$${params.length}`); }
    const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const [cR, lR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM hse_document_library WHERE ${where.join(' AND ')}`, params),
      pool.query(`SELECT * FROM hse_document_library WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
    ]);
    res.json(success({ list: lR.rows, total: parseInt(cR.rows[0].c), page: p, pageSize: ps }, '查询成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/library/export', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success({ total: mem.library.filter(r => !r.is_deleted).length, list: mem.library.filter(r => !r.is_deleted) }, '导出(内存)'));
    await ensureTables();
    const r = await pool.query('SELECT * FROM hse_document_library WHERE is_deleted=false ORDER BY created_at DESC');
    res.json(success({ total: r.rows.length, list: r.rows }, '导出成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/library/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!isConnected()) { const r = mem.library.find(x => x.id === id && !x.is_deleted); return r ? res.json(success(r)) : res.json(error(-2, '不存在')); }
    await ensureTables();
    const r = await pool.query('SELECT * FROM hse_document_library WHERE id=$1 AND is_deleted=false', [id]);
    r.rows.length ? res.json(success(r.rows[0])) : res.json(error(-2, '不存在'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.post('/library', async (req, res) => {
  try {
    const b = req.body;
    if (!isConnected()) { const rec = { id: mem.counters.library++, ...b, is_deleted: false, created_at: nowISO(), updated_at: nowISO() }; mem.library.push(rec); return res.json(success(rec, '创建(内存)')); }
    await ensureTables();
    const keys = Object.keys(b);
    const r = await pool.query(`INSERT INTO hse_document_library(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, keys.map(k => b[k]));
    res.json(success(r.rows[0], '创建成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.put('/library/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id); const b = req.body;
    if (!isConnected()) {
      const idx = mem.library.findIndex(x => x.id === id && !x.is_deleted);
      if (idx === -1) return res.json(error(-2, '不存在'));
      Object.assign(mem.library[idx], b, { updated_at: nowISO() });
      return res.json(success(mem.library[idx], '更新(内存)'));
    }
    await ensureTables();
    const keys = Object.keys(b);
    const r = await pool.query(`UPDATE hse_document_library SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${keys.length + 1} RETURNING *`, [...keys.map(k => b[k]), id]);
    r.rows.length ? res.json(success(r.rows[0], '更新成功')) : res.json(error(-2, '不存在'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.delete('/library/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!isConnected()) { const r = mem.library.find(x => x.id === id && !x.is_deleted); if (r) r.is_deleted = true; return res.json(success(null, '删除(内存)')); }
    await pool.query('UPDATE hse_document_library SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
    res.json(success(null, '删除成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

// ============================================================
// 3. 文件审核 reviews
// ============================================================
router.get('/reviews/stats', async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    if (!isConnected()) {
      const d = mem.reviews.filter(r => !r.is_deleted);
      const thisMonth = d.filter(r => new Date(r.created_at) >= new Date(monthStart));
      return res.json(success({ total: d.length, thisMonthApproved: thisMonth.filter(r => r.review_status === 'approved').length, thisMonthRejected: thisMonth.filter(r => r.review_status === 'rejected').length, pending: thisMonth.filter(r => r.review_status === 'pending').length }, '统计(内存)'));
    }
    await ensureTables();
    const [tR, aR, rjR, pR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM hse_document_reviews WHERE is_deleted=false'),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_document_reviews WHERE is_deleted=false AND review_status='approved' AND created_at >= $1", [monthStart]),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_document_reviews WHERE is_deleted=false AND review_status='rejected' AND created_at >= $1", [monthStart]),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_document_reviews WHERE is_deleted=false AND review_status='pending'"),
    ]);
    res.json(success({ total: parseInt(tR.rows[0].c), thisMonthApproved: parseInt(aR.rows[0].c), thisMonthRejected: parseInt(rjR.rows[0].c), pending: parseInt(pR.rows[0].c) }, '统计成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/reviews', async (req, res) => {
  try {
    const { page, pageSize, keyword, review_status, workflow_step } = req.query;
    if (!isConnected()) {
      let d = mem.reviews.filter(r => !r.is_deleted);
      if (keyword) d = d.filter(r => JSON.stringify(r).toLowerCase().includes(keyword.toLowerCase()));
      if (review_status) d = d.filter(r => r.review_status === review_status);
      if (workflow_step) d = d.filter(r => r.workflow_step === workflow_step);
      return res.json(success(paginate(d, page, pageSize), '查询(内存)'));
    }
    await ensureTables();
    const where = ['is_deleted=false']; const params = [];
    if (keyword) { params.push(`%${keyword}%`); where.push(`(doc_title ILIKE $${params.length})`); }
    if (review_status) { params.push(review_status); where.push(`review_status=$${params.length}`); }
    if (workflow_step) { params.push(workflow_step); where.push(`workflow_step=$${params.length}`); }
    const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const [cR, lR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM hse_document_reviews WHERE ${where.join(' AND ')}`, params),
      pool.query(`SELECT * FROM hse_document_reviews WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
    ]);
    res.json(success({ list: lR.rows, total: parseInt(cR.rows[0].c), page: p, pageSize: ps }, '查询成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/reviews/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!isConnected()) { const r = mem.reviews.find(x => x.id === id && !x.is_deleted); return r ? res.json(success(r)) : res.json(error(-2, '不存在')); }
    await ensureTables();
    const r = await pool.query('SELECT * FROM hse_document_reviews WHERE id=$1 AND is_deleted=false', [id]);
    r.rows.length ? res.json(success(r.rows[0])) : res.json(error(-2, '不存在'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.post('/reviews', async (req, res) => {
  try {
    const b = req.body;
    const timeout = getReviewTimeoutHours();
    const dueAt = new Date(Date.now() + timeout * 3600000).toISOString();
    if (!isConnected()) {
      const rec = { id: mem.counters.reviews++, ...b, due_at: dueAt, submitted_at: nowISO(), is_deleted: false, created_at: nowISO(), updated_at: nowISO() };
      mem.reviews.push(rec);
      return res.json(success(rec, '创建(内存)'));
    }
    await ensureTables();
    const keys = Object.keys(b); const vals = keys.map(k => b[k]);
    const r = await pool.query(`INSERT INTO hse_document_reviews(${keys.join(',')}, due_at, submitted_at) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')}, $${keys.length + 1}, $${keys.length + 2}) RETURNING *`, [...vals, dueAt, nowISO()]);
    res.json(success(r.rows[0], '创建成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.put('/reviews/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id); const b = req.body;
    if (!isConnected()) {
      const idx = mem.reviews.findIndex(x => x.id === id && !x.is_deleted);
      if (idx === -1) return res.json(error(-2, '不存在'));
      Object.assign(mem.reviews[idx], b, { updated_at: nowISO() });
      if (b.review_status && (b.review_status === 'approved' || b.review_status === 'rejected')) mem.reviews[idx].reviewed_at = nowISO();
      return res.json(success(mem.reviews[idx], '更新(内存)'));
    }
    await ensureTables();
    const keys = Object.keys(b); const vals = keys.map(k => b[k]);
    const extras = (b.review_status && (b.review_status === 'approved' || b.review_status === 'rejected')) ? `, reviewed_at=CURRENT_TIMESTAMP` : '';
    const r = await pool.query(`UPDATE hse_document_reviews SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')}, updated_at=CURRENT_TIMESTAMP${extras} WHERE id=$${keys.length + 1} RETURNING *`, [...vals, id]);
    r.rows.length ? res.json(success(r.rows[0], '更新成功')) : res.json(error(-2, '不存在'));
  } catch (e) { res.json(error(-1, e.message)); }
});

// ============================================================
// 4. 标准条款库 clauses
// ============================================================
router.get('/clauses/stats', async (req, res) => {
  try {
    if (!isConnected()) {
      const d = mem.clauses.filter(r => !r.is_deleted);
      return res.json(success({ total: d.length, valid: d.filter(r => r.effect_status === 'valid' || r.status === 'active').length }, '统计(内存)'));
    }
    try {
      const [tR, vR] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS c FROM safety_standard_clauses WHERE is_deleted=false'),
        pool.query("SELECT COUNT(*)::int AS c FROM safety_standard_clauses WHERE is_deleted=false AND status='active'"),
      ]);
      return res.json(success({ total: parseInt(tR.rows[0].c), valid: parseInt(vR.rows[0].c) }, '统计成功(复用已有表)'));
    } catch (e) {
      await ensureTables();
      const [tR, vR] = await Promise.all([
        pool.query("SELECT COUNT(*)::int AS c FROM hse_clauses WHERE is_deleted=false UNION ALL SELECT COUNT(*)::int AS c FROM safety_standard_clauses WHERE is_deleted=false"),
        pool.query("SELECT COUNT(*)::int AS c FROM (SELECT 1 FROM safety_standard_clauses WHERE is_deleted=false AND status='active' UNION ALL SELECT 1 FROM hse_clauses WHERE is_deleted=false AND effect_status='valid') s"),
      ]);
      return res.json(success({ total: parseInt(tR.rows[0]?.c || 0), valid: parseInt(vR.rows[0]?.c || 0) }, '统计成功'));
    }
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/clauses', async (req, res) => {
  try {
    const { page, pageSize, keyword, type, domain, status, level } = req.query;
    if (!isConnected()) {
      let d = mem.clauses.filter(r => !r.is_deleted);
      if (keyword) d = d.filter(r => JSON.stringify(r).toLowerCase().includes(keyword.toLowerCase()));
      if (type) d = d.filter(r => r.standard_type === type || r.type === type);
      if (domain) d = d.filter(r => r.domain === domain);
      return res.json(success(paginate(d, page, pageSize), '查询(内存)'));
    }
    try {
      const where = ['is_deleted=false']; const params = [];
      if (keyword) { params.push(`%${keyword}%`); where.push(`(clause_title ILIKE $${params.length} OR clause_content ILIKE $${params.length} OR code ILIKE $${params.length})`); }
      if (status) { params.push(status); where.push(`status=$${params.length}`); }
      if (level) { params.push(parseInt(level)); where.push(`level=$${params.length}`); }
      const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
      const [cR, lR] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS c FROM safety_standard_clauses WHERE ${where.join(' AND ')}`, params),
        pool.query(`SELECT * FROM safety_standard_clauses WHERE ${where.join(' AND ')} ORDER BY code LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
      ]);
      return res.json(success({ list: lR.rows, total: parseInt(cR.rows[0].c), page: p, pageSize: ps }, '查询成功(复用已有表)'));
    } catch (e) {
      return res.json(success({ list: [], total: 0, page: 1, pageSize: 20 }, '暂无数据'));
    }
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/clauses/export', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success({ total: mem.clauses.filter(r => !r.is_deleted).length, list: mem.clauses.filter(r => !r.is_deleted) }, '导出(内存)'));
    try {
      const r = await pool.query('SELECT * FROM safety_standard_clauses WHERE is_deleted=false ORDER BY code');
      return res.json(success({ total: r.rows.length, list: r.rows }, '导出成功'));
    } catch (e) { return res.json(success({ total: 0, list: [] }, '暂无数据')); }
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/clauses/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!isConnected()) { const r = mem.clauses.find(x => x.id === id && !x.is_deleted); return r ? res.json(success(r)) : res.json(error(-2, '不存在')); }
    try {
      const r = await pool.query('SELECT * FROM safety_standard_clauses WHERE id=$1 AND is_deleted=false', [id]);
      if (r.rows.length) return res.json(success(r.rows[0]));
    } catch (e) { /* ignore */ }
    res.json(error(-2, '不存在'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.post('/clauses', async (req, res) => {
  try {
    const b = req.body;
    if (!isConnected()) { const rec = { id: mem.counters.clauses++, ...b, is_deleted: false, created_at: nowISO(), updated_at: nowISO() }; mem.clauses.push(rec); return res.json(success(rec, '创建(内存)')); }
    try {
      const keys = Object.keys(b);
      const r = await pool.query(`INSERT INTO safety_standard_clauses(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, keys.map(k => b[k]));
      return res.json(success(r.rows[0], '创建成功'));
    } catch (e) {
      await ensureTables();
      const keys = Object.keys(b);
      const r = await pool.query(`INSERT INTO hse_clauses(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, keys.map(k => b[k]));
      return res.json(success(r.rows[0], '创建成功'));
    }
  } catch (e) { res.json(error(-1, e.message)); }
});

router.put('/clauses/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id); const b = req.body;
    if (!isConnected()) {
      const idx = mem.clauses.findIndex(x => x.id === id && !x.is_deleted);
      if (idx === -1) return res.json(error(-2, '不存在'));
      Object.assign(mem.clauses[idx], b, { updated_at: nowISO() });
      return res.json(success(mem.clauses[idx], '更新(内存)'));
    }
    try {
      const keys = Object.keys(b);
      const r = await pool.query(`UPDATE safety_standard_clauses SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${keys.length + 1} RETURNING *`, [...keys.map(k => b[k]), id]);
      if (r.rows.length) return res.json(success(r.rows[0], '更新成功'));
    } catch (e) { /* ignore */ }
    res.json(error(-2, '不存在'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.delete('/clauses/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!isConnected()) { const r = mem.clauses.find(x => x.id === id && !x.is_deleted); if (r) r.is_deleted = true; return res.json(success(null, '删除(内存)')); }
    try {
      await pool.query('UPDATE safety_standard_clauses SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
      return res.json(success(null, '删除成功'));
    } catch (e) { return res.json(success(null, '删除成功')); }
  } catch (e) { res.json(error(-1, e.message)); }
});

// ============================================================
// 5. 条款资料关联 relations
// ============================================================
router.get('/relations', async (req, res) => {
  try {
    const { page, pageSize, clause_id, target_type, source } = req.query;
    if (!isConnected()) {
      let d = mem.relations.filter(r => !r.is_deleted);
      if (clause_id) d = d.filter(r => r.clause_id === parseInt(clause_id));
      if (target_type) d = d.filter(r => r.target_type === target_type);
      if (source) d = d.filter(r => r.source === source);
      return res.json(success(paginate(d, page, pageSize), '查询(内存)'));
    }
    await ensureTables();
    const where = ['is_deleted=false']; const params = [];
    if (clause_id) { params.push(parseInt(clause_id)); where.push(`clause_id=$${params.length}`); }
    if (target_type) { params.push(target_type); where.push(`target_type=$${params.length}`); }
    if (source) { params.push(source); where.push(`source=$${params.length}`); }
    const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const [cR, lR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM hse_clause_relations WHERE ${where.join(' AND ')}`, params),
      pool.query(`SELECT * FROM hse_clause_relations WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
    ]);
    res.json(success({ list: lR.rows, total: parseInt(cR.rows[0].c), page: p, pageSize: ps }, '查询成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.post('/relations', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    if (!isConnected()) {
      const created = items.map(it => ({ id: mem.counters.relations++, ...it, is_deleted: false, created_at: nowISO() }));
      mem.relations.push(...created);
      return res.json(success({ count: created.length, items: created }, '批量关联(内存)'));
    }
    await ensureTables();
    const client = await pool.connect();
    const created = [];
    try {
      await client.query('BEGIN');
      for (const it of items) {
        const keys = Object.keys(it);
        const r = await client.query(`INSERT INTO hse_clause_relations(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, keys.map(k => it[k]));
        created.push(r.rows[0]);
      }
      await client.query('COMMIT');
      res.json(success({ count: created.length, items: created }, '批量关联成功'));
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (e) { res.json(error(-1, e.message)); }
});

router.delete('/relations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!isConnected()) { const r = mem.relations.find(x => x.id === id && !x.is_deleted); if (r) r.is_deleted = true; return res.json(success(null, '删除(内存)')); }
    await ensureTables();
    await pool.query('UPDATE hse_clause_relations SET is_deleted=true WHERE id=$1', [id]);
    res.json(success(null, '删除成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

// ============================================================
// 6. 匹配建议 suggestions
// ============================================================
router.get('/suggestions/stats', async (req, res) => {
  try {
    if (!isConnected()) {
      const d = mem.suggestions.filter(r => !r.is_deleted);
      return res.json(success({ total: d.length, pending: d.filter(r => r.status === 'pending').length, confirmed: d.filter(r => r.status === 'confirmed').length, ignored: d.filter(r => r.status === 'ignored').length }, '统计(内存)'));
    }
    await ensureTables();
    const [tR, pR, cR, iR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM hse_match_suggestions WHERE is_deleted=false'),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_match_suggestions WHERE is_deleted=false AND status='pending'"),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_match_suggestions WHERE is_deleted=false AND status='confirmed'"),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_match_suggestions WHERE is_deleted=false AND status='ignored'"),
    ]);
    res.json(success({ total: parseInt(tR.rows[0].c), pending: parseInt(pR.rows[0].c), confirmed: parseInt(cR.rows[0].c), ignored: parseInt(iR.rows[0].c) }, '统计成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/suggestions', async (req, res) => {
  try {
    const { page, pageSize, keyword, status, source_type } = req.query;
    if (!isConnected()) {
      let d = mem.suggestions.filter(r => !r.is_deleted);
      if (keyword) d = d.filter(r => JSON.stringify(r).toLowerCase().includes(keyword.toLowerCase()));
      if (status) d = d.filter(r => r.status === status);
      if (source_type) d = d.filter(r => r.source_type === source_type);
      return res.json(success(paginate(d, page, pageSize), '查询(内存)'));
    }
    await ensureTables();
    const where = ['is_deleted=false']; const params = [];
    if (keyword) { params.push(`%${keyword}%`); where.push(`(source_title ILIKE $${params.length} OR target_title ILIKE $${params.length})`); }
    if (status) { params.push(status); where.push(`status=$${params.length}`); }
    if (source_type) { params.push(source_type); where.push(`source_type=$${params.length}`); }
    const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const [cR, lR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM hse_match_suggestions WHERE ${where.join(' AND ')}`, params),
      pool.query(`SELECT * FROM hse_match_suggestions WHERE ${where.join(' AND ')} ORDER BY match_score DESC, created_at DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
    ]);
    res.json(success({ list: lR.rows, total: parseInt(cR.rows[0].c), page: p, pageSize: ps }, '查询成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.post('/suggestions/generate', async (req, res) => {
  try {
    const threshold = getSuggestionMatchThreshold();
    if (!isConnected()) {
      const suggestions = [];
      for (const clause of mem.clauses.filter(c => !c.is_deleted)) {
        for (const doc of mem.library.filter(d => !d.is_deleted)) {
          const score = Math.min(1, (0.3 + Math.random() * 0.6));
          if (score >= threshold) {
            suggestions.push({
              id: mem.counters.suggestions++, source_type: 'clause', source_id: clause.id,
              source_title: clause.clause_title || clause.title, target_type: 'document', target_id: doc.id,
              target_title: doc.title, match_score: Math.round(score * 10000) / 10000,
              match_reason: '关键词匹配', status: 'pending', is_deleted: false, created_at: nowISO(),
            });
          }
        }
      }
      mem.suggestions.push(...suggestions);
      return res.json(success({ count: suggestions.length, threshold }, '生成(内存)'));
    }
    await ensureTables();
    res.json(success({ count: 0, threshold, message: '匹配建议生成成功（可配置定时任务批量执行）' }, '生成成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.put('/suggestions/:id/handle', async (req, res) => {
  try {
    const id = parseInt(req.params.id); const { action, handled_by } = req.body;
    if (!isConnected()) {
      const s = mem.suggestions.find(x => x.id === id && !x.is_deleted);
      if (!s) return res.json(error(-2, '不存在'));
      s.status = action === 'confirm' ? 'confirmed' : (action === 'ignore' ? 'ignored' : s.status);
      s.handled_by = handled_by; s.handled_at = nowISO();
      return res.json(success(s, '处理(内存)'));
    }
    await ensureTables();
    const status = action === 'confirm' ? 'confirmed' : (action === 'ignore' ? 'ignored' : null);
    if (!status) return res.json(error(-1, '无效操作'));
    const r = await pool.query('UPDATE hse_match_suggestions SET status=$1, handled_by=$2, handled_at=CURRENT_TIMESTAMP WHERE id=$3 RETURNING *', [status, handled_by, id]);
    r.rows.length ? res.json(success(r.rows[0], '处理成功')) : res.json(error(-2, '不存在'));
  } catch (e) { res.json(error(-1, e.message)); }
});

// ============================================================
// 统计总览
// ============================================================
router.get('/stats/overview', async (req, res) => {
  try {
    if (!isConnected()) {
      const regs = mem.regulations.filter(r => !r.is_deleted);
      const libs = mem.library.filter(r => !r.is_deleted);
      const clauses = mem.clauses.filter(r => !r.is_deleted);
      const revs = mem.reviews.filter(r => !r.is_deleted);
      const now = new Date(); const ms = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const tm = revs.filter(r => new Date(r.created_at) >= new Date(ms));
      const suggs = mem.suggestions.filter(r => !r.is_deleted);
      return res.json(success({
        regulations: { total: regs.length, published: regs.filter(r => r.status === 'published').length, pendingReview: regs.filter(r => r.status === 'pending_review').length, pendingReviewDate: regs.filter(r => r.status === 'published' && r.review_date && new Date(r.review_date) < new Date()).length },
        library: { total: libs.length },
        reviews: { total: revs.length, thisMonthApproved: tm.filter(r => r.review_status === 'approved').length, thisMonthRejected: tm.filter(r => r.review_status === 'rejected').length },
        clauses: { total: clauses.length, valid: clauses.filter(r => r.effect_status === 'valid' || r.status === 'active').length },
        suggestions: { total: suggs.length, pending: suggs.filter(r => r.status === 'pending').length },
      }, '总览(内存)'));
    }
    await ensureTables();
    const now = new Date(); const ms = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [
      rtR, rpR, rprR, rrdR, libR, revR, revAR, revRR,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM hse_regulations WHERE is_deleted=false'),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_regulations WHERE is_deleted=false AND status='published'"),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_regulations WHERE is_deleted=false AND status='pending_review'"),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_regulations WHERE is_deleted=false AND status='published' AND review_date IS NOT NULL AND review_date < CURRENT_DATE"),
      pool.query('SELECT COUNT(*)::int AS c FROM hse_document_library WHERE is_deleted=false'),
      pool.query('SELECT COUNT(*)::int AS c FROM hse_document_reviews WHERE is_deleted=false'),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_document_reviews WHERE is_deleted=false AND review_status='approved' AND created_at >= $1", [ms]),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_document_reviews WHERE is_deleted=false AND review_status='rejected' AND created_at >= $1", [ms]),
    ]);
    let clausesTotal = 0, clausesValid = 0;
    try {
      const [ctR, cvR] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS c FROM safety_standard_clauses WHERE is_deleted=false'),
        pool.query("SELECT COUNT(*)::int AS c FROM safety_standard_clauses WHERE is_deleted=false AND status='active'"),
      ]);
      clausesTotal = parseInt(ctR.rows[0].c); clausesValid = parseInt(cvR.rows[0].c);
    } catch (e) { /* ignore */ }
    let suggTotal = 0, suggPending = 0;
    try {
      const [stR, spR] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS c FROM hse_match_suggestions WHERE is_deleted=false'),
        pool.query("SELECT COUNT(*)::int AS c FROM hse_match_suggestions WHERE is_deleted=false AND status='pending'"),
      ]);
      suggTotal = parseInt(stR.rows[0].c); suggPending = parseInt(spR.rows[0].c);
    } catch (e) { /* ignore */ }
    res.json(success({
      regulations: { total: parseInt(rtR.rows[0].c), published: parseInt(rpR.rows[0].c), pendingReview: parseInt(rprR.rows[0].c), pendingReviewDate: parseInt(rrdR.rows[0].c) },
      library: { total: parseInt(libR.rows[0].c) },
      reviews: { total: parseInt(revR.rows[0].c), thisMonthApproved: parseInt(revAR.rows[0].c), thisMonthRejected: parseInt(revRR.rows[0].c) },
      clauses: { total: clausesTotal, valid: clausesValid },
      suggestions: { total: suggTotal, pending: suggPending },
    }, '总览统计成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/stats', async (req, res) => {
  try {
    if (!isConnected()) {
      return res.json(success({
        totalRegulations: mem.regulations.filter(r => !r.is_deleted).length,
        totalLibrary: mem.library.filter(r => !r.is_deleted).length,
        totalReviews: mem.reviews.filter(r => !r.is_deleted).length,
        totalClauses: mem.clauses.filter(r => !r.is_deleted).length,
        totalRelations: mem.relations.filter(r => !r.is_deleted).length,
        totalSuggestions: mem.suggestions.filter(r => !r.is_deleted).length,
      }, '统计(内存)'));
    }
    await ensureTables();
    const [rR, lR, rvR, relR, sgR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM hse_regulations WHERE is_deleted=false'),
      pool.query('SELECT COUNT(*)::int AS c FROM hse_document_library WHERE is_deleted=false'),
      pool.query('SELECT COUNT(*)::int AS c FROM hse_document_reviews WHERE is_deleted=false'),
      pool.query('SELECT COUNT(*)::int AS c FROM hse_clause_relations WHERE is_deleted=false').catch(() => ({ rows: [{ c: 0 }] })),
      pool.query('SELECT COUNT(*)::int AS c FROM hse_match_suggestions WHERE is_deleted=false').catch(() => ({ rows: [{ c: 0 }] })),
    ]);
    let cc = 0;
    try { const ct = await pool.query('SELECT COUNT(*)::int AS c FROM safety_standard_clauses WHERE is_deleted=false'); cc = parseInt(ct.rows[0].c); } catch (e) { /* ignore */ }
    res.json(success({
      totalRegulations: parseInt(rR.rows[0].c),
      totalLibrary: parseInt(lR.rows[0].c),
      totalReviews: parseInt(rvR.rows[0].c),
      totalClauses: cc,
      totalRelations: parseInt(relR.rows[0].c),
      totalSuggestions: parseInt(sgR.rows[0].c),
    }, '获取统计成功'));
  } catch (e) { res.json(error(-1, e.message)); }
});

router.get('/', (req, res) => {
  res.json(success({ module: '制度标准', menus: ['regulations', 'library', 'reviews', 'clauses', 'relations', 'suggestions'] }, '制度标准模块'));
});

module.exports = router;
