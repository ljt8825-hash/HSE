/**
 * 安全资料中心 - 文件管理服务层
 *
 * 职责: 文件CRUD、分类管理、标签管理、审核管理、统计
 * 复用: config/db(pool)、middleware/upload、services/notificationService
 * 不修改: 任何现有中间件、旧数据库表
 *
 * 数据库表（见 sql/v2_document_tables.sql）:
 *   document_categories        文件分类
 *   document_tags              文件标签
 *   document_files             文件主表
 *   document_tag_relation      文件标签关联
 *   document_versions          文件版本（Sprint1仅预留）
 *   document_standard_relation 资料标准关联（Sprint1仅预留）
 */

const path = require('path');
const fs = require('fs');
const { pool, isConnected } = require('../config/db');
const { getFileUrl, deleteFile, fixFilenameEncoding } = require('../middleware/upload');
const { createNotification } = require('../services/notificationService');

// ============================================================
// 辅助函数
// ============================================================

/**
 * 将数据库行转换为前端驼峰格式
 */
function camelRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    fileUuid: row.file_uuid,
    originalName: row.original_name,
    storageName: row.storage_name,
    filePath: row.file_path,
    fileUrl: row.file_url,
    fileSize: row.file_size,
    fileType: row.file_type,
    mimeType: row.mime_type,
    categoryId: row.category_id,
    summary: row.summary,
    analysisStatus: row.analysis_status,
    completenessScore: row.completeness_score,
    riskLevel: row.risk_level,
    // 审查意见字段
    sourceType: row.source_type,
    sourceId: row.source_id,
    reviewStatus: row.review_status,
    aiSummary: row.ai_summary,
    aiScore: row.ai_score,
    reviewUser: row.review_user,
    reviewTime: row.review_time,
    // 有效期字段
    validStartDate: row.valid_start_date,
    validEndDate: row.valid_end_date,
    remindDays: row.remind_days,
    status: row.status,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata,
  };
}

/**
 * 计算有效期状态
 * @returns 'valid' | 'expiring' | 'expired' | 'none'
 */
function calcValidStatus(validEndDate, remindDays) {
  if (!validEndDate) return 'none';
  const end = new Date(validEndDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= (remindDays || 30)) return 'expiring';
  return 'valid';
}

/**
 * 文件大小格式化
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

// ============================================================
// 文件管理
// ============================================================

/**
 * 文件上传 - 保存文件记录到数据库
 * @param {Object} file multer文件对象
 * @param {Object} extra 附加字段 { categoryId, validStartDate, validEndDate, remindDays, summary }
 * @param {Object} user 当前登录用户 { id, username }
 * @param {Object} req Express请求对象（用于生成fileUrl）
 */
async function uploadFile(file, extra, user, req) {
  // 修复Windows中文文件名编码
  const originalName = fixFilenameEncoding(file.originalname || file.original_name || 'unknown');
  const fileUuid = require('uuid').v4();
  const fileUrl = getFileUrl(req, file.filename, 'documents');

  // 根据扩展名推断文件类型
  const ext = path.extname(originalName).toLowerCase();
  let fileType = 'other';
  if (['.pdf'].includes(ext)) fileType = 'pdf';
  else if (['.doc', '.docx'].includes(ext)) fileType = 'word';
  else if (['.xls', '.xlsx'].includes(ext)) fileType = 'excel';
  else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) fileType = 'image';
  else if (['.mp4', '.avi', '.mov', '.wmv'].includes(ext)) fileType = 'video';

  const result = await pool.query(
    `INSERT INTO document_files
      (file_uuid, original_name, storage_name, file_path, file_url,
       file_size, file_type, mime_type, category_id, summary,
       source_type, review_status, analysis_status,
       valid_start_date, valid_end_date, remind_days,
       status, uploaded_by, uploaded_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), $19)
     RETURNING *`,
    [
      fileUuid,
      originalName,
      file.filename,
      file.path,
      fileUrl,
      file.size,
      fileType,
      file.mimetype,
      extra.categoryId || null,
      extra.summary || null,
      'upload',
      'pending',
      'pending',
      extra.validStartDate || null,
      extra.validEndDate || null,
      extra.remindDays || 30,
      'active',
      user.username,
      extra.metadata || {},
    ]
  );

  return camelRow(result.rows[0]);
}

/**
 * 文件列表查询（分页 + 多条件筛选）
 * @param {Object} params { page, pageSize, categoryId, fileType, reviewStatus, keyword, validStatus, uploadedBy }
 */
async function getFileList(params) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(params.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;

  const conditions = ['df.is_deleted = false'];
  const values = [];
  let idx = 1;

  if (params.categoryId) {
    conditions.push(`df.category_id = $${idx++}`);
    values.push(params.categoryId);
  }
  if (params.fileType) {
    conditions.push(`df.file_type = $${idx++}`);
    values.push(params.fileType);
  }
  if (params.reviewStatus) {
    conditions.push(`df.review_status = $${idx++}`);
    values.push(params.reviewStatus);
  }
  if (params.uploadedBy) {
    conditions.push(`df.uploaded_by = $${idx++}`);
    values.push(params.uploadedBy);
  }
  if (params.keyword) {
    conditions.push(`(df.original_name ILIKE $${idx} OR df.summary ILIKE $${idx})`);
    values.push(`%${params.keyword}%`);
    idx++;
  }
  // 有效期状态筛选（在应用层过滤更稳妥，避免SQL日期边界问题）
  // validStatus 留到获取后在内存中过滤

  const where = conditions.join(' AND ');
  const listSql = `
    SELECT df.*, dc.name AS category_name
    FROM document_files df
    LEFT JOIN document_categories dc ON df.category_id = dc.id AND dc.is_deleted = false
    WHERE ${where}
    ORDER BY df.created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;
  values.push(pageSize, offset);

  const countSql = `SELECT COUNT(*) AS total FROM document_files df WHERE ${where}`;

  const [listResult, countResult] = await Promise.all([
    pool.query(listSql, values),
    pool.query(countSql, values.slice(0, -2)),
  ]);

  let list = listResult.rows.map((row) => {
    const item = camelRow(row);
    item.categoryName = row.category_name;
    item.validStatus = calcValidStatus(row.valid_end_date, row.remind_days);
    item.fileSizeText = formatFileSize(row.file_size);
    return item;
  });

  // 有效期状态内存过滤
  if (params.validStatus && params.validStatus !== 'all') {
    list = list.filter((item) => item.validStatus === params.validStatus);
  }

  return {
    list,
    total: parseInt(countResult.rows[0].total, 10),
    page,
    pageSize,
  };
}

/**
 * 文件详情
 */
async function getFileDetail(id) {
  const result = await pool.query(
    `SELECT df.*, dc.name AS category_name
     FROM document_files df
     LEFT JOIN document_categories dc ON df.category_id = dc.id AND dc.is_deleted = false
     WHERE df.id = $1 AND df.is_deleted = false`,
    [id]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const item = camelRow(row);
  item.categoryName = row.category_name;
  item.validStatus = calcValidStatus(row.valid_end_date, row.remind_days);
  item.fileSizeText = formatFileSize(row.file_size);

  // 查询关联标签
  const tagsResult = await pool.query(
    `SELECT t.id, t.name, t.color FROM document_tag_relation r
     JOIN document_tags t ON r.tag_id = t.id AND t.is_deleted = false
     WHERE r.file_id = $1`,
    [id]
  );
  item.tags = tagsResult.rows.map((t) => ({ id: t.id, name: t.name, color: t.color }));

  return item;
}

/**
 * 文件软删除（仅数据库标记，不物理删除服务器文件）
 */
async function softDeleteFile(id) {
  const result = await pool.query(
    `UPDATE document_files SET is_deleted = true, updated_at = NOW()
     WHERE id = $1 AND is_deleted = false RETURNING id`,
    [id]
  );
  return result.rows.length > 0;
}

/**
 * 更新文件信息（分类、有效期、摘要等）
 */
async function updateFile(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (data.categoryId !== undefined) { fields.push(`category_id = $${idx++}`); values.push(data.categoryId); }
  if (data.summary !== undefined) { fields.push(`summary = $${idx++}`); values.push(data.summary); }
  if (data.validStartDate !== undefined) { fields.push(`valid_start_date = $${idx++}`); values.push(data.validStartDate); }
  if (data.validEndDate !== undefined) { fields.push(`valid_end_date = $${idx++}`); values.push(data.validEndDate); }
  if (data.remindDays !== undefined) { fields.push(`remind_days = $${idx++}`); values.push(data.remindDays); }

  if (fields.length === 0) return await getFileDetail(id);

  fields.push(`updated_at = NOW()`);
  values.push(id);

  await pool.query(
    `UPDATE document_files SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false`,
    values
  );

  // 更新标签关联
  if (Array.isArray(data.tagIds)) {
    await pool.query('DELETE FROM document_tag_relation WHERE file_id = $1', [id]);
    if (data.tagIds.length > 0) {
      const placeholders = data.tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await pool.query(
        `INSERT INTO document_tag_relation (file_id, tag_id) VALUES ${placeholders}`,
        [id, ...data.tagIds]
      );
    }
  }

  return await getFileDetail(id);
}

/**
 * 文件下载（流式响应）
 */
async function downloadFile(req, res, id) {
  const result = await pool.query(
    'SELECT * FROM document_files WHERE id = $1 AND is_deleted = false',
    [id]
  );
  if (result.rows.length === 0) return null;

  const file = result.rows[0];
  const filePath = file.file_path;
  if (!fs.existsSync(filePath)) return null;

  // 设置下载头（支持中文文件名）
  const encodedName = encodeURIComponent(file.original_name);
  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="UTF-8''${encodedName}"`);
  res.setHeader('Content-Length', file.file_size);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  return true;
}

/**
 * 文件审核（状态流转: pending -> approved/rejected）
 * @param {number} id 文件ID
 * @param {Object} data { reviewStatus, reviewComment }
 * @param {Object} user 审核人 { id, username }
 */
async function reviewFile(id, data, user) {
  const { reviewStatus, reviewComment } = data;
  if (!['approved', 'rejected'].includes(reviewStatus)) {
    throw new Error('无效的审核状态');
  }

  const result = await pool.query(
    `UPDATE document_files
     SET review_status = $1, review_user = $2, review_time = NOW(),
         status = CASE WHEN $1 = 'approved' THEN 'active' ELSE 'pending' END,
         updated_at = NOW()
     WHERE id = $3 AND is_deleted = false
     RETURNING *`,
    [reviewStatus, user.username, id]
  );

  if (result.rows.length === 0) return null;
  const file = result.rows[0];

  // 推送审核结果通知给上传人（仅调用notificationService，不修改）
  try {
    await createNotification({
      userId: file.uploaded_by,
      title: `文件审核结果：${reviewStatus === 'approved' ? '已通过' : '已驳回'}`,
      content: `文件《${file.original_name}》的审核状态已更新为「${reviewStatus === 'approved' ? '已通过' : '已驳回'}」${reviewComment ? '，意见：' + reviewComment : ''}`,
      type: 'document_review',
      bizType: 'document',
      bizId: String(file.id),
    });
  } catch (err) {
    console.warn('[Document] 审核通知推送失败:', err.message);
  }

  return camelRow(file);
}

// ============================================================
// 分类管理
// ============================================================

/**
 * 获取分类树（内存构建，支持多级）
 */
async function getCategoryTree() {
  const result = await pool.query(
    `SELECT * FROM document_categories WHERE is_deleted = false ORDER BY sort_order, id`
  );

  const map = {};
  const roots = [];
  result.rows.forEach((row) => {
    map[row.id] = {
      id: row.id,
      parentId: row.parent_id,
      code: row.code,
      name: row.name,
      description: row.description,
      icon: row.icon,
      sortOrder: row.sort_order,
      children: [],
    };
  });
  result.rows.forEach((row) => {
    const node = map[row.id];
    if (row.parent_id && map[row.parent_id]) {
      map[row.parent_id].children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

/**
 * 创建分类
 */
async function createCategory(data, user) {
  const result = await pool.query(
    `INSERT INTO document_categories (parent_id, code, name, description, icon, sort_order, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.parentId || null, data.code, data.name, data.description || null, data.icon || null, data.sortOrder || 0, user.username]
  );
  return result.rows[0];
}

/**
 * 更新分类
 */
async function updateCategory(id, data, user) {
  const fields = [];
  const values = [];
  let idx = 1;
  if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
  if (data.description !== undefined) { fields.push(`description = $${idx++}`); values.push(data.description); }
  if (data.icon !== undefined) { fields.push(`icon = $${idx++}`); values.push(data.icon); }
  if (data.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(data.sortOrder); }
  if (fields.length === 0) return null;
  fields.push(`updated_by = $${idx++}`);
  values.push(user.username);
  fields.push(`updated_at = NOW()`);
  values.push(id);
  const result = await pool.query(
    `UPDATE document_categories SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * 删除分类（软删除，检查是否有子分类或关联文件）
 */
async function deleteCategory(id) {
  // 检查子分类
  const childCheck = await pool.query(
    'SELECT COUNT(*) AS cnt FROM document_categories WHERE parent_id = $1 AND is_deleted = false',
    [id]
  );
  if (parseInt(childCheck.rows[0].cnt, 10) > 0) {
    throw new Error('存在子分类，无法删除');
  }
  // 检查关联文件
  const fileCheck = await pool.query(
    'SELECT COUNT(*) AS cnt FROM document_files WHERE category_id = $1 AND is_deleted = false',
    [id]
  );
  if (parseInt(fileCheck.rows[0].cnt, 10) > 0) {
    throw new Error('分类下存在文件，无法删除');
  }
  await pool.query('UPDATE document_categories SET is_deleted = true WHERE id = $1', [id]);
  return true;
}

// ============================================================
// 标签管理
// ============================================================

/**
 * 标签列表
 */
async function getTagList() {
  const result = await pool.query(
    'SELECT * FROM document_tags WHERE is_deleted = false ORDER BY usage_count DESC, id'
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    type: row.type,
    usageCount: row.usage_count,
  }));
}

/**
 * 创建标签
 */
async function createTag(data, user) {
  const result = await pool.query(
    `INSERT INTO document_tags (name, color, type, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.name, data.color || '#1890ff', data.type || 'manual', user.username]
  );
  return result.rows[0];
}

/**
 * 更新标签使用次数（+1）
 */
async function incrementTagUsage(tagIds) {
  if (!tagIds || tagIds.length === 0) return;
  await pool.query(
    `UPDATE document_tags SET usage_count = usage_count + 1 WHERE id = ANY($1)`,
    [tagIds]
  );
}

// ============================================================
// 统计
// ============================================================

/**
 * 文件统计（按分类/类型/审核状态/有效期状态）
 */
async function getFileStats() {
  const [totalRes, reviewRes, typeRes, validRes] = await Promise.all([
    pool.query('SELECT COUNT(*) AS cnt FROM document_files WHERE is_deleted = false'),
    pool.query(
      `SELECT review_status, COUNT(*) AS cnt FROM document_files
       WHERE is_deleted = false GROUP BY review_status`
    ),
    pool.query(
      `SELECT file_type, COUNT(*) AS cnt FROM document_files
       WHERE is_deleted = false GROUP BY file_type`
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE valid_end_date IS NULL) AS no_valid,
         COUNT(*) FILTER (WHERE valid_end_date IS NOT NULL AND valid_end_date < CURRENT_DATE) AS expired,
         COUNT(*) FILTER (WHERE valid_end_date IS NOT NULL AND valid_end_date >= CURRENT_DATE AND valid_end_date <= CURRENT_DATE + (remind_days || ' days')::INTERVAL) AS expiring,
         COUNT(*) FILTER (WHERE valid_end_date IS NOT NULL AND valid_end_date > CURRENT_DATE + (remind_days || ' days')::INTERVAL) AS valid
       FROM document_files WHERE is_deleted = false`
    ),
  ]);

  return {
    total: parseInt(totalRes.rows[0].cnt, 10),
    byReviewStatus: reviewRes.rows.reduce((acc, r) => {
      acc[r.review_status] = parseInt(r.cnt, 10);
      return acc;
    }, {}),
    byFileType: typeRes.rows.reduce((acc, r) => {
      acc[r.file_type] = parseInt(r.cnt, 10);
      return acc;
    }, {}),
    byValidStatus: {
      valid: parseInt(validRes.rows[0].valid, 10),
      expiring: parseInt(validRes.rows[0].expiring, 10),
      expired: parseInt(validRes.rows[0].expired, 10),
      none: parseInt(validRes.rows[0].no_valid, 10),
    },
  };
}

// ============================================================
// AI 分析结果缓存同步
// ============================================================

/**
 * 同步最新 AI 分析结果到 document_files 缓存字段
 * @param {number} fileId 文件ID
 * @param {Object} analysis 分析结果对象
 */
async function syncLatestAnalysis(fileId, analysis) {
  if (!analysis || analysis.status !== 'completed') return;

  const aiScore = analysis.ai_score ?? analysis.aiScore;
  const aiSummary = analysis.ai_summary ?? analysis.aiSummary;
  const aiRiskLevel = analysis.ai_risk_level ?? analysis.aiRiskLevel;

  await pool.query(
    `UPDATE document_files
     SET latest_ai_analysis_id = $1,
         analysis_status = $2,
         ai_summary = $3,
         ai_score = $4,
         risk_level = $5,
         completeness_score = $6,
         updated_at = NOW()
     WHERE id = $7 AND is_deleted = false`,
    [
      analysis.id,
      analysis.status,
      aiSummary || null,
      aiScore || null,
      aiRiskLevel || null,
      aiScore || null,
      fileId,
    ]
  );
}

module.exports = {
  uploadFile,
  getFileList,
  getFileDetail,
  softDeleteFile,
  updateFile,
  downloadFile,
  reviewFile,
  getCategoryTree,
  createCategory,
  updateCategory,
  deleteCategory,
  getTagList,
  createTag,
  incrementTagUsage,
  getFileStats,
  syncLatestAnalysis,
};
