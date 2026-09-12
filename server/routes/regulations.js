/**
 * 规章制度路由 - PostgreSQL + 内存降级双模式
 * DB 在线时使用 PG 查询，离线时自动降级到内存存储
 */

const express = require('express');
const router = express.Router();
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { paginateMemory, buildListResponse, sendNotFound, sendValidationError, buildMemoryRecord, camelKeys } = require('../utils/commonResponse');
const { uploadDocument, getFileUrl, fixFilenameEncoding } = require('../middleware/upload');

// ========== 数据库表初始化（IF NOT EXISTS，可重复执行） ==========
// 延迟到连接池就绪后执行（模块加载时连接可能尚未建立）
let tablesInitialized = false;

async function ensureTables() {
  if (tablesInitialized) return;
  if (!isConnected()) return;
  try {
    // 1. 附件表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regulation_attachments (
        id            BIGSERIAL PRIMARY KEY,
        regulation_id BIGINT NOT NULL,
        filename      VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_type     VARCHAR(64) NOT NULL DEFAULT 'document',
        file_size     BIGINT NOT NULL DEFAULT 0,
        file_url      VARCHAR(512) NOT NULL,
        version       VARCHAR(32) NOT NULL DEFAULT '1.0',
        uploaded_by   VARCHAR(64),
        is_latest     BOOLEAN NOT NULL DEFAULT TRUE,
        is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_reg_attachments_reg ON regulation_attachments(regulation_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_reg_attachments_latest ON regulation_attachments(regulation_id, is_latest) WHERE is_deleted = FALSE');

    // 2. 版本履历表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regulation_versions (
        id             BIGSERIAL PRIMARY KEY,
        regulation_id  BIGINT NOT NULL,
        version        VARCHAR(32) NOT NULL,
        change_type    VARCHAR(32) NOT NULL DEFAULT 'update',
        change_summary TEXT,
        changed_by     VARCHAR(64),
        snapshot       JSONB,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_reg_versions_reg ON regulation_versions(regulation_id)');

    tablesInitialized = true;
    console.log('[Regulations] 数据库表 attachments/versions 已就绪');
  } catch (err) {
    console.warn('[Regulations] 数据库表初始化失败:', err.message);
  }
}

// ========== 内存降级存储 ==========
let memoryRecords = [];
let memoryIdCounter = 1;
let memoryAttachments = []; // 附件内存存储
let memoryAttachmentIdCounter = 1;
let memoryVersions = [];    // 版本履历内存存储
let memoryVersionIdCounter = 1;

function initMemoryData() {
  if (memoryRecords.length > 0) return;
  // 种子数据已移除，内存模式仅用于 API 兼容性（空数据）
  memoryRecords = [];
  memoryIdCounter = 1;
  memoryAttachments = [];
  memoryAttachmentIdCounter = 1;
  memoryVersions = [];
  memoryVersionIdCounter = 1;
}

// ========== 时效状态计算（临期/过期/正常） ==========
// 规则：基于 effective_date + validity_period(月) 计算到期日
// - 过期：当前日期 > 到期日
// - 临期：距到期日 ≤ 30 天（含已过期）
// - 正常：距到期日 > 30 天 或 长期有效（validity_period 为空）
function calcExpiryStatus(effectiveDate, validityPeriod) {
  if (!effectiveDate || !validityPeriod || validityPeriod <= 0) {
    return 'permanent'; // 长期有效
  }
  const eff = new Date(effectiveDate);
  if (isNaN(eff.getTime())) return 'unknown';
  const expiry = new Date(eff);
  expiry.setMonth(expiry.getMonth() + parseInt(validityPeriod));
  const now = new Date();
  const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';   // 已过期
  if (diffDays <= 30) return 'expiring'; // 临期（30天内）
  return 'normal';
}

// ========== GET / — 列表（支持分页、搜索、过滤） ==========
router.get('/', async (req, res, next) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      let data = memoryRecords.filter(r => !r.is_deleted);
      const { page = 1, pageSize = 20, keyword = '', status = '' } = req.query;

      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.name && r.name.toLowerCase().includes(kw)) ||
          (r.category && r.category.toLowerCase().includes(kw))
        );
      }
      if (status) data = data.filter(r => r.status === status);

      const { list: rawList, total } = paginateMemory(data, page, pageSize);
      // 内存模式：附加时效状态字段 + camelCase 转换
      const list = rawList.map(r => camelKeys({
        ...r,
        expiry_status: calcExpiryStatus(r.effective_date, r.validity_period),
      }));
      return buildListResponse(res, list, total, page, pageSize, '查询成功(内存模式)');
    }

    const { page = 1, pageSize = 20, keyword = '', status = '' } = req.query;

    let whereSql = ' WHERE is_deleted = false';
    const params = [];
    let paramIdx = 0;

    if (keyword) {
      paramIdx++;
      whereSql += ` AND (name ILIKE $${paramIdx} OR category ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
    }
    if (status) {
      paramIdx++;
      whereSql += ` AND status = $${paramIdx}`;
      params.push(status);
    }

    const countSql = `SELECT COUNT(*) as total FROM regulations ${whereSql}`;
    const countResult = await pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].total);

    const offset = (page - 1) * pageSize;
    paramIdx++;
    params.push(parseInt(pageSize));
    paramIdx++;
    params.push(offset);

    const listSql = `
      SELECT id, name, title, category, type, version, status, effective_date, issue_date,
             validity_period, document_no, issuer, department, summary, content, remark,
             created_at, updated_at
      FROM regulations
      ${whereSql}
      ORDER BY id DESC
      LIMIT $${paramIdx - 1} OFFSET $${paramIdx}
    `;
    const result = await pool.query(listSql, params);

    // 数据库模式：附加时效状态字段 + camelCase 转换
    const list = result.rows.map(r => camelKeys({
      ...r,
      expiry_status: calcExpiryStatus(r.effective_date, r.validity_period),
    }));

    res.json(success({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
  } catch (err) {
    next(err);
  }
});

// ========== GET /stats — 统计 ==========
router.get('/stats', async (req, res, next) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryRecords.filter(r => !r.is_deleted);
      return res.json(success({
        total: data.length,
        byStatus: {},
        byCategory: {}
      }, '统计成功(内存模式)'));
    }

    const [totalResult, statusResult, categoryResult] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM regulations WHERE is_deleted = false'),
      pool.query(`SELECT status, COUNT(*) AS count FROM regulations WHERE is_deleted = false GROUP BY status`),
      pool.query(`SELECT category, COUNT(*) AS count FROM regulations WHERE is_deleted = false GROUP BY category`)
    ]);

    const byStatus = {};
    statusResult.rows.forEach(r => { byStatus[r.status] = parseInt(r.count); });

    const byCategory = {};
    categoryResult.rows.forEach(r => { byCategory[r.category] = parseInt(r.count); });

    res.json(success({
      total: parseInt(totalResult.rows[0].total),
      byStatus,
      byCategory
    }, '统计成功'));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 报表导出端点（必须定义在 /:id 之前，避免被参数路由遮蔽）
// ============================================================

// ========== GET /export — 导出制度清单（CSV 格式，兼容 xlsx 工具） ==========
router.get('/export', async (req, res, next) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryRecords.filter(r => !r.is_deleted).map(r => ({
        ...r,
        expiry_status: calcExpiryStatus(r.effective_date, r.validity_period),
      }));
      return sendCsvExport(res, data);
    }

    const result = await pool.query(`
      SELECT id, name, title, category, type, version, status, effective_date, issue_date,
             validity_period, document_no, issuer, department, summary
      FROM regulations WHERE is_deleted = FALSE ORDER BY id DESC
    `);
    const list = result.rows.map(r => ({
      ...r,
      expiry_status: calcExpiryStatus(r.effective_date, r.validity_period),
    }));
    sendCsvExport(res, list);
  } catch (err) {
    next(err);
  }
});

// ========== GET /:id — 详情 ==========
router.get('/:id', async (req, res, next) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const { id } = req.params;
      const record = memoryRecords.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return sendNotFound(res);
      return res.json(success(record, '查询成功(内存模式)'));
    }

    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM regulations WHERE id = $1 AND is_deleted = false', [id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    const row = result.rows[0];
    res.json(success(camelKeys({
      ...row,
      expiry_status: calcExpiryStatus(row.effective_date, row.validity_period),
    }), '查询成功'));
  } catch (err) {
    next(err);
  }
});

// ========== POST / — 创建 ==========
router.post('/', async (req, res, next) => {
  try {
    // 兼容前端 camelCase 与 DB snake_case 字段命名
    const body = req.body;
    const title = body.title || body.name || '';
    const name = body.name || body.title || '';
    const category = body.category || '';
    const type = body.type || '';
    const version = body.version || '';
    const status = body.status || 'active';
    const documentNo = body.documentNo || body.document_no || '';
    const issueDate = body.issueDate || body.issue_date || null;
    const effectiveDate = body.effectiveDate || body.effective_date || null;
    const validityPeriod = body.validityPeriod || body.validity_period || null;
    const issuer = body.issuer || '';
    const department = body.department || '';
    const summary = body.summary || '';
    const content = body.content || '';
    const remark = body.remark || '';

    if (!title && !name) return sendValidationError(res, '制度标题不能为空');

    if (!isConnected()) {
      initMemoryData();
      const record = buildMemoryRecord(memoryIdCounter++, {
        name, title, category, type, version, status,
        document_no: documentNo, issue_date: issueDate, effective_date: effectiveDate,
        validity_period: validityPeriod, issuer, department, summary, content, remark,
      });
      memoryRecords.push(record);
      // 自动生成版本履历（创建类型）
      memoryVersions.push(buildMemoryRecord(memoryVersionIdCounter++, {
        regulation_id: record.id,
        version: version || '1.0',
        change_type: 'create',
        change_summary: '制度创建',
        changed_by: body.uploadedBy || body.uploaded_by || 'admin',
      }));
      return res.json(success(camelKeys(record), '创建成功(内存模式)'));
    }

    const result = await pool.query(`
      INSERT INTO regulations (name, title, category, type, version, status, document_no,
                               issue_date, effective_date, validity_period, issuer, department, summary, content, remark)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [name, title, category, type, version, status, documentNo, issueDate, effectiveDate, validityPeriod, issuer, department, summary, content, remark]);

    const newRecord = result.rows[0];

    res.json(success(camelKeys(newRecord), '创建成功'));
  } catch (err) {
    next(err);
  }
});

// ========== PUT /:id — 更新 ==========
router.put('/:id', async (req, res, next) => {
  try {
    const body = req.body;
    // 兼容 camelCase 与 snake_case
    const title = body.title !== undefined ? body.title : undefined;
    const name = body.name !== undefined ? body.name : (title !== undefined ? title : undefined);
    const category = body.category;
    const type = body.type;
    const version = body.version;
    const status = body.status;
    const documentNo = body.documentNo !== undefined ? body.documentNo : body.document_no;
    const issueDate = body.issueDate !== undefined ? body.issueDate : body.issue_date;
    const effectiveDate = body.effectiveDate !== undefined ? body.effectiveDate : body.effective_date;
    const validityPeriod = body.validityPeriod !== undefined ? body.validityPeriod : body.validity_period;
    const issuer = body.issuer;
    const department = body.department;
    const summary = body.summary;
    const content = body.content;
    const remark = body.remark;

    if (!isConnected()) {
      initMemoryData();
      const { id } = req.params;
      const idx = memoryRecords.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
      if (idx === -1) return res.json(error(-2, '记录不存在'));
      Object.assign(memoryRecords[idx], {
        ...(name !== undefined && { name }),
        ...(title !== undefined && { title }),
        ...(category !== undefined && { category }),
        ...(type !== undefined && { type }),
        ...(version !== undefined && { version }),
        ...(status !== undefined && { status }),
        ...(documentNo !== undefined && { document_no: documentNo }),
        ...(issueDate !== undefined && { issue_date: issueDate }),
        ...(effectiveDate !== undefined && { effective_date: effectiveDate }),
        ...(validityPeriod !== undefined && { validity_period: validityPeriod }),
        ...(issuer !== undefined && { issuer }),
        ...(department !== undefined && { department }),
        ...(summary !== undefined && { summary }),
        ...(content !== undefined && { content }),
        ...(remark !== undefined && { remark }),
        updated_at: new Date().toISOString(),
      });
      // 自动生成版本履历（更新类型）
      memoryVersions.push(buildMemoryRecord(memoryVersionIdCounter++, {
        regulation_id: memoryRecords[idx].id,
        version: version || memoryRecords[idx].version || '1.0',
        change_type: 'update',
        change_summary: body.changeSummary || body.change_summary || '制度更新',
        changed_by: body.uploadedBy || body.uploaded_by || 'admin',
      }));
      return res.json(success(camelKeys(memoryRecords[idx]), '更新成功(内存模式)'));
    }

    const { id } = req.params;
    const result = await pool.query(`
      UPDATE regulations SET
        name = COALESCE($1, name),
        title = COALESCE($2, title),
        category = COALESCE($3, category),
        type = COALESCE($4, type),
        version = COALESCE($5, version),
        status = COALESCE($6, status),
        document_no = COALESCE($7, document_no),
        issue_date = COALESCE($8, issue_date),
        effective_date = COALESCE($9, effective_date),
        validity_period = COALESCE($10, validity_period),
        issuer = COALESCE($11, issuer),
        department = COALESCE($12, department),
        summary = COALESCE($13, summary),
        content = COALESCE($14, content),
        remark = COALESCE($15, remark),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $16 AND is_deleted = false
      RETURNING *
    `, [name, title, category, type, version, status, documentNo, issueDate, effectiveDate,
        validityPeriod, issuer, department, summary, content, remark, id]);

    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    const updated = result.rows[0];

    res.json(success(camelKeys(updated), '更新成功'));
  } catch (err) {
    next(err);
  }
});

// ========== DELETE /:id — 软删除 ==========
router.delete('/:id', async (req, res, next) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const { id } = req.params;
      const record = memoryRecords.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return res.json(error(-2, '记录不存在'));
      record.is_deleted = true;
      return res.json(success(null, '删除成功(内存模式)'));
    }

    const { id } = req.params;
    const result = await pool.query(
      'UPDATE regulations SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id',
      [id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(null, '删除成功'));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 附件管理端点（复用 files.js 的 upload middleware）
// ============================================================

// ========== GET /:id/attachments — 附件列表 ==========
router.get('/:id/attachments', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { version = '' } = req.query; // 可按版本过滤

    if (!isConnected()) {
      initMemoryData();
      let data = memoryAttachments.filter(a => a.regulation_id === parseInt(id) && !a.is_deleted);
      if (version) data = data.filter(a => a.version === version);
      return res.json(success(data, '查询成功(内存模式)'));
    }

    await ensureTables();

    let sql = 'SELECT * FROM regulation_attachments WHERE regulation_id = $1 AND is_deleted = FALSE';
    const params = [id];
    if (version) {
      sql += ' AND version = $2';
      params.push(version);
    }
    sql += ' ORDER BY is_latest DESC, created_at DESC';

    const result = await pool.query(sql, params);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    next(err);
  }
});

// ========== POST /:id/attachments — 上传附件 ==========
router.post('/:id/attachments', uploadDocument.single('file'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!req.file) return sendValidationError(res, '请上传文件');

    const { version = '1.0', uploaded_by = 'admin' } = req.body;
    const fileUrl = getFileUrl(req, req.file.filename, 'documents');
    const originalName = fixFilenameEncoding(req.file.originalname);

    if (!isConnected()) {
      initMemoryData();
      // 旧版本标记为非最新
      memoryAttachments.forEach(a => {
        if (a.regulation_id === parseInt(id) && a.is_latest) a.is_latest = false;
      });
      const record = buildMemoryRecord(memoryAttachmentIdCounter++, {
        regulation_id: parseInt(id),
        filename: req.file.filename,
        original_name: originalName,
        file_type: 'document',
        file_size: req.file.size,
        file_url: fileUrl,
        version,
        uploaded_by,
        is_latest: true,
      });
      memoryAttachments.push(record);
      return res.json(success(camelKeys(record), '上传成功(内存模式)'));
    }

    await ensureTables();

    // 数据库模式：旧版本标记为非最新
    await pool.query(
      'UPDATE regulation_attachments SET is_latest = FALSE WHERE regulation_id = $1 AND is_latest = TRUE',
      [id]
    );

    const result = await pool.query(`
      INSERT INTO regulation_attachments (regulation_id, filename, original_name, file_type, file_size, file_url, version, uploaded_by, is_latest)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
      RETURNING *
    `, [id, req.file.filename, originalName, 'document', req.file.size, fileUrl, version, uploaded_by]);

    res.json(success(camelKeys(result.rows[0]), '上传成功'));
  } catch (err) {
    next(err);
  }
});

// ========== DELETE /:id/attachments/:aid — 删除附件 ==========
router.delete('/:id/attachments/:aid', async (req, res, next) => {
  try {
    const { id, aid } = req.params;

    if (!isConnected()) {
      initMemoryData();
      const att = memoryAttachments.find(a => a.id === parseInt(aid) && a.regulation_id === parseInt(id) && !a.is_deleted);
      if (!att) return sendNotFound(res, '附件不存在');
      att.is_deleted = true;
      return res.json(success(null, '删除成功(内存模式)'));
    }

    await ensureTables();

    const result = await pool.query(
      'UPDATE regulation_attachments SET is_deleted = TRUE WHERE id = $1 AND regulation_id = $2 RETURNING id',
      [aid, id]
    );
    if (result.rows.length === 0) return sendNotFound(res, '附件不存在');
    res.json(success(null, '删除成功'));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 版本管理端点
// ============================================================

// ========== GET /:id/versions — 历史版本履历 ==========
router.get('/:id/versions', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isConnected()) {
      initMemoryData();
      const data = memoryVersions.filter(v => v.regulation_id === parseInt(id));
      return res.json(success(data, '查询成功(内存模式)'));
    }

    await ensureTables();

    const result = await pool.query(
      'SELECT * FROM regulation_versions WHERE regulation_id = $1 ORDER BY created_at DESC',
      [id]
    );
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 报表导出辅助函数
// ============================================================

// CSV 导出辅助函数（复用现有 xlsx 能力，CSV 兼容 Excel 打开）
function sendCsvExport(res, data) {
  const headers = ['ID', '标题', '分类', '版本', '状态', '文号', '发布机构', '生效日期', '有效期(月)', '时效状态', '归口部门'];
  const rows = data.map(r => [
    r.id || '',
    (r.title || r.name || '').replace(/"/g, '""'),
    r.category || '',
    r.version || '',
    r.status || '',
    r.document_no || '',
    r.issuer || '',
    r.effective_date ? new Date(r.effective_date).toISOString().slice(0, 10) : '',
    r.validity_period || '',
    r.expiry_status || '',
    r.department || ''
  ].map(v => `"${v}"`).join(','));
  const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="regulations_${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
}

module.exports = router;
