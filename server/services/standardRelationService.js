/**
 * 标准条款与安全资料关联管理服务 - HSE V2 Sprint4 Phase4
 *
 * 复用表: document_standard_relation（Sprint1 已建表，本阶段扩展字段）
 *
 * 状态机:
 *   pending  自动匹配生成，等待人工确认
 *   valid    人工确认有效（AI 评价只能使用 valid）
 *   invalid  人工确认无效 / 取消关联
 *
 * 匹配类型:
 *   auto     自动匹配（keywords/required_doc_types 命中）
 *   manual   人工手动关联
 */

const { pool } = require('../config/db');

// ============================================================
// 工具函数
// ============================================================

/**
 * 行数据转驼峰对象
 */
function camelRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    fileId: row.file_id,
    clauseId: row.clause_id,
    clauseCode: row.clause_code,
    clauseName: row.clause_name,
    matchType: row.match_type,
    matchConfidence: row.match_confidence != null
      ? Number(row.match_confidence) : 0,
    status: row.status,
    matchReason: row.match_reason,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    remark: row.remark,
  };
}

/**
 * 根据条款ID获取条款信息（含 keywords / required_doc_types）
 */
async function getClauseInfo(clauseId) {
  const result = await pool.query(
    `SELECT id, code, clause_title, element_name, keywords, required_doc_types
     FROM safety_standard_clauses
     WHERE id = $1 AND is_deleted = FALSE`,
    [clauseId]
  );
  return result.rows[0] || null;
}

/**
 * 根据条款编码获取条款信息
 */
async function getClauseInfoByCode(clauseCode) {
  const result = await pool.query(
    `SELECT id, code, clause_title, element_name, keywords, required_doc_types
     FROM safety_standard_clauses
     WHERE code = $1 AND is_deleted = FALSE`,
    [clauseCode]
  );
  return result.rows[0] || null;
}

/**
 * 获取文件信息（含 AI 关键词）
 */
async function getFileInfo(fileId) {
  const result = await pool.query(
    `SELECT f.id, f.original_name, f.summary, f.category_id, f.file_type,
            f.review_status, f.is_deleted,
            (SELECT ai.ai_keywords FROM document_ai_analysis ai
             WHERE ai.file_id = f.id AND ai.status = 'completed'
             ORDER BY ai.completed_at DESC LIMIT 1) as ai_keywords
     FROM document_files f
     WHERE f.id = $1`,
    [fileId]
  );
  return result.rows[0] || null;
}

// ============================================================
// 1. 查询条款关联资料
// ============================================================

/**
 * 查询某条款关联的所有资料
 * @param {number} clauseId 条款ID
 * @param {Object} options { status?: 'pending'|'valid'|'invalid', includeDeleted?: boolean }
 * @returns {Array} 关联记录列表（含文件信息）
 */
async function getRelationsByClause(clauseId, options = {}) {
  const { status, includeDeleted = false } = options;

  let sql = `
    SELECT r.*,
           f.original_name as file_name,
           f.summary as file_summary,
           f.file_type as file_type,
           f.review_status as file_review_status,
           f.file_size as file_size
    FROM document_standard_relation r
    LEFT JOIN document_files f ON f.id = r.file_id
    WHERE r.clause_id = $1
  `;
  const params = [clauseId];

  if (!includeDeleted) {
    sql += ` AND r.is_deleted = FALSE`;
  }
  if (status) {
    params.push(status);
    sql += ` AND r.status = $${params.length}`;
  }

  sql += ` ORDER BY r.match_confidence DESC, r.created_at DESC`;

  const result = await pool.query(sql, params);
  return result.rows.map((row) => ({
    ...camelRow(row),
    fileName: row.file_name,
    fileSummary: row.file_summary,
    fileType: row.file_type,
    fileReviewStatus: row.file_review_status,
    fileSize: row.file_size,
  }));
}

// ============================================================
// 2. 查询资料关联条款
// ============================================================

/**
 * 查询某资料关联的所有条款
 * @param {number} fileId 文件ID
 * @param {Object} options { status?: 'pending'|'valid'|'invalid' }
 * @returns {Array} 关联记录列表（含条款信息）
 */
async function getRelationsByFile(fileId, options = {}) {
  const { status } = options;

  let sql = `
    SELECT r.*,
           c.clause_title, c.element_name, c.level, c.keywords, c.required_doc_types
    FROM document_standard_relation r
    LEFT JOIN safety_standard_clauses c ON c.id = r.clause_id
    WHERE r.file_id = $1 AND r.is_deleted = FALSE
  `;
  const params = [fileId];

  if (status) {
    params.push(status);
    sql += ` AND r.status = $${params.length}`;
  }

  sql += ` ORDER BY r.match_confidence DESC, r.created_at DESC`;

  const result = await pool.query(sql, params);
  return result.rows.map((row) => ({
    ...camelRow(row),
    clauseTitle: row.clause_title,
    elementName: row.element_name,
    level: row.level,
    keywords: row.keywords,
    requiredDocTypes: row.required_doc_types,
  }));
}

/**
 * 查询某资料关联的有效条款（AI 评价专用）
 * 只返回 status='valid' 的关联
 */
async function getValidRelationsByFile(fileId) {
  return getRelationsByFile(fileId, { status: 'valid' });
}

// ============================================================
// 3. 创建人工关联
// ============================================================

/**
 * 创建人工关联（manual / status=valid）
 * @param {Object} data { fileId, clauseId, remark? }
 * @param {Object} user
 * @returns {Object} 新建的关联记录
 */
async function createRelation(data, user) {
  const userId = user?.userId || user?.id || 1;

  if (!data.fileId) {
    throw new Error('文件ID不能为空');
  }
  if (!data.clauseId) {
    throw new Error('条款ID不能为空');
  }

  // 校验文件存在
  const file = await getFileInfo(data.fileId);
  if (!file || file.is_deleted) {
    throw new Error('文件不存在或已删除');
  }

  // 校验条款存在
  const clause = await getClauseInfo(data.clauseId);
  if (!clause) {
    throw new Error('条款不存在');
  }

  // 检查是否已存在关联（包括软删除的，恢复即可）
  const existing = await pool.query(
    `SELECT * FROM document_standard_relation
     WHERE file_id = $1 AND clause_id = $2`,
    [data.fileId, data.clauseId]
  );

  if (existing.rows.length > 0) {
    const existingRow = existing.rows[0];
    if (!existingRow.is_deleted) {
      throw new Error('该资料与条款的关联已存在');
    }
    // 恢复软删除的记录
    const restored = await pool.query(
      `UPDATE document_standard_relation
       SET is_deleted = FALSE,
           status = 'valid',
           match_type = 'manual',
           match_confidence = 100,
           confirmed_by = $1,
           confirmed_at = NOW(),
           updated_at = NOW(),
           remark = $2
       WHERE id = $3
       RETURNING *`,
      [userId, data.remark || null, existingRow.id]
    );
    return camelRow(restored.rows[0]);
  }

  // 新建关联
  const result = await pool.query(
    `INSERT INTO document_standard_relation
       (file_id, clause_id, clause_code, clause_name,
        match_type, match_confidence, status,
        confirmed_by, confirmed_at, created_by, remark)
     VALUES ($1, $2, $3, $4, 'manual', 100, 'valid', $5, NOW(), $6, $7)
     RETURNING *`,
    [
      data.fileId,
      data.clauseId,
      clause.code,
      clause.clause_title || clause.element_name,
      userId,
      userId,
      data.remark || null,
    ]
  );

  return camelRow(result.rows[0]);
}

// ============================================================
// 4. 取消关联
// ============================================================

/**
 * 取消关联（软删除，不删除文件）
 * @param {number} relationId 关联记录ID
 * @param {Object} user
 * @returns {boolean}
 */
async function deleteRelation(relationId, user) {
  const userId = user?.userId || user?.id || 1;

  const existing = await pool.query(
    `SELECT * FROM document_standard_relation WHERE id = $1 AND is_deleted = FALSE`,
    [relationId]
  );
  if (existing.rows.length === 0) {
    throw new Error('关联记录不存在');
  }

  await pool.query(
    `UPDATE document_standard_relation
     SET is_deleted = TRUE,
         status = 'invalid',
         updated_at = NOW()
     WHERE id = $1`,
    [relationId]
  );

  return true;
}

// ============================================================
// 5. 确认关联（pending → valid）
// ============================================================

/**
 * 确认关联（将 pending 状态改为 valid）
 * @param {number} relationId 关联记录ID
 * @param {Object} user
 * @returns {Object} 更新后的关联记录
 */
async function confirmRelation(relationId, user) {
  const userId = user?.userId || user?.id || 1;

  const existing = await pool.query(
    `SELECT * FROM document_standard_relation WHERE id = $1 AND is_deleted = FALSE`,
    [relationId]
  );
  if (existing.rows.length === 0) {
    throw new Error('关联记录不存在');
  }

  if (existing.rows[0].status === 'valid') {
    return camelRow(existing.rows[0]);
  }
  if (existing.rows[0].status === 'invalid') {
    throw new Error('已失效的关联不能确认');
  }

  const result = await pool.query(
    `UPDATE document_standard_relation
     SET status = 'valid',
         confirmed_by = $1,
         confirmed_at = NOW(),
         verified_by = $2,
         verified_at = NOW(),
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [userId, String(userId), relationId]
  );

  return camelRow(result.rows[0]);
}

/**
 * 批量确认关联
 * @param {Array<number>} relationIds 关联记录ID数组
 * @param {Object} user
 * @returns {Object} { total, success, failed, errors }
 */
async function batchConfirmRelations(relationIds, user) {
  if (!Array.isArray(relationIds) || relationIds.length === 0) {
    throw new Error('关联ID列表不能为空');
  }

  const result = {
    total: relationIds.length,
    success: 0,
    failed: 0,
    errors: [],
  };

  for (const id of relationIds) {
    try {
      await confirmRelation(id, user);
      result.success++;
    } catch (err) {
      result.failed++;
      result.errors.push({ id, message: err.message });
    }
  }

  return result;
}

// ============================================================
// 6. 自动匹配建议
// ============================================================

/**
 * 计算匹配度（0-100）
 * 基于 keywords 和 required_doc_types 与文件信息匹配
 */
function calcMatchConfidence(clause, file) {
  let score = 0;
  const hits = [];

  const clauseKeywords = Array.isArray(clause.keywords)
    ? clause.keywords : [];
  const clauseDocTypes = Array.isArray(clause.required_doc_types)
    ? clause.required_doc_types : [];

  // 文件信息来源：文件名 + 摘要 + AI关键词
  const fileName = (file.original_name || '').toLowerCase();
  const fileSummary = (file.summary || '').toLowerCase();
  const aiKeywords = Array.isArray(file.ai_keywords)
    ? file.ai_keywords.map((k) => String(k).toLowerCase()) : [];

  const fileText = `${fileName} ${fileSummary} ${aiKeywords.join(' ')}`;

  // 关键词命中（每命中1个 +15分，最高60分）
  let keywordHits = 0;
  for (const kw of clauseKeywords) {
    const kwLower = String(kw).toLowerCase();
    if (fileText.includes(kwLower) || aiKeywords.includes(kwLower)) {
      keywordHits++;
      hits.push(`关键词"${kw}"`);
    }
  }
  score += Math.min(keywordHits * 15, 60);

  // required_doc_types 命中（每命中1个 +20分，最高40分）
  let docTypeHits = 0;
  for (const dt of clauseDocTypes) {
    const dtLower = String(dt).toLowerCase();
    if (fileText.includes(dtLower)) {
      docTypeHits++;
      hits.push(`资料类型"${dt}"`);
    }
  }
  score += Math.min(docTypeHits * 20, 40);

  return {
    confidence: Math.min(score, 100),
    hits,
  };
}

/**
 * 为单个条款生成自动匹配建议
 * @param {number} clauseId 条款ID
 * @param {Object} options { minConfidence?: number, limit?: number }
 * @returns {Array} 匹配建议列表（status=pending，不自动确认）
 */
async function autoMatchForClause(clauseId, options = {}) {
  const { minConfidence = 30, limit = 20 } = options;

  const clause = await getClauseInfo(clauseId);
  if (!clause) {
    throw new Error('条款不存在');
  }

  // 获取所有未删除的文件
  const filesResult = await pool.query(
    `SELECT f.id, f.original_name, f.summary, f.file_type, f.review_status,
            (SELECT ai.ai_keywords FROM document_ai_analysis ai
             WHERE ai.file_id = f.id AND ai.status = 'completed'
             ORDER BY ai.completed_at DESC LIMIT 1) as ai_keywords
     FROM document_files f
     WHERE f.is_deleted = FALSE
     ORDER BY f.created_at DESC
     LIMIT 500`
  );

  // 获取已存在关联的文件ID集合
  const existingResult = await pool.query(
    `SELECT file_id FROM document_standard_relation
     WHERE clause_id = $1 AND is_deleted = FALSE`,
    [clauseId]
  );
  const existingFileIds = new Set(existingResult.rows.map((r) => r.file_id));

  // 计算匹配度
  const matches = [];
  for (const file of filesResult.rows) {
    if (existingFileIds.has(file.id)) continue;

    const { confidence, hits } = calcMatchConfidence(clause, file);
    if (confidence >= minConfidence) {
      matches.push({
        fileId: file.id,
        fileName: file.original_name,
        fileSummary: file.summary,
        fileType: file.file_type,
        confidence,
        hits,
      });
    }
  }

  // 按匹配度排序，取前N条
  matches.sort((a, b) => b.confidence - a.confidence);
  return matches.slice(0, limit);
}

/**
 * 为所有条款生成自动匹配建议并写入数据库（status=pending）
 * @param {Object} options { minConfidence?: number, limitPerClause?: number }
 * @param {Object} user
 * @returns {Object} { totalClauses, totalMatches, created, skipped }
 */
async function generateAutoMatches(options = {}, user) {
  const { minConfidence = 30, limitPerClause = 10 } = options;
  const userId = user?.userId || user?.id || 1;

  // 获取所有三级条款（只有三级条款有 keywords）
  const clausesResult = await pool.query(
    `SELECT id, code, clause_title, element_name, keywords, required_doc_types
     FROM safety_standard_clauses
     WHERE level = 3 AND is_deleted = FALSE AND status = 'active'
     ORDER BY code`
  );

  let totalMatches = 0;
  let created = 0;
  let skipped = 0;

  for (const clause of clausesResult.rows) {
    const matches = await autoMatchForClause(clause.id, {
      minConfidence,
      limit: limitPerClause,
    });

    for (const match of matches) {
      totalMatches++;
      try {
        await pool.query(
          `INSERT INTO document_standard_relation
             (file_id, clause_id, clause_code, clause_name,
              match_type, match_confidence, status, match_reason, created_by)
           VALUES ($1, $2, $3, $4, 'auto', $5, 'pending', $6, $7)
           ON CONFLICT DO NOTHING`,
          [
            match.fileId,
            clause.id,
            clause.code,
            clause.clause_title || clause.element_name,
            match.confidence,
            match.hits.join('、'),
            userId,
          ]
        );
        created++;
      } catch {
        skipped++;
      }
    }
  }

  return {
    totalClauses: clausesResult.rows.length,
    totalMatches,
    created,
    skipped,
  };
}

/**
 * 获取所有待确认的自动匹配建议
 * @param {Object} options { minConfidence?: number, limit?: number, clauseId?: number }
 * @returns {Array} 匹配建议列表
 */
async function getPendingSuggestions(options = {}) {
  const { minConfidence = 0, limit = 50, clauseId } = options;

  let sql = `
    SELECT r.*,
           f.original_name as file_name,
           f.summary as file_summary,
           f.file_type as file_type,
           c.clause_title, c.element_name, c.code as clause_code_full
    FROM document_standard_relation r
    LEFT JOIN document_files f ON f.id = r.file_id
    LEFT JOIN safety_standard_clauses c ON c.id = r.clause_id
    WHERE r.is_deleted = FALSE
      AND r.status = 'pending'
      AND r.match_type = 'auto'
      AND r.match_confidence >= $1
  `;
  const params = [minConfidence];

  if (clauseId) {
    params.push(clauseId);
    sql += ` AND r.clause_id = $${params.length}`;
  }

  sql += ` ORDER BY r.match_confidence DESC, r.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query(sql, params);
  return result.rows.map((row) => ({
    ...camelRow(row),
    fileName: row.file_name,
    fileSummary: row.file_summary,
    fileType: row.file_type,
    clauseTitle: row.clause_title,
    elementName: row.element_name,
  }));
}

// ============================================================
// 7. 统计
// ============================================================

/**
 * 关联统计
 */
async function getRelationStats() {
  const total = await pool.query(
    `SELECT COUNT(*) as cnt FROM document_standard_relation WHERE is_deleted = FALSE`
  );
  const byStatus = await pool.query(
    `SELECT status, COUNT(*) as cnt FROM document_standard_relation
     WHERE is_deleted = FALSE GROUP BY status`
  );
  const byMatchType = await pool.query(
    `SELECT match_type, COUNT(*) as cnt FROM document_standard_relation
     WHERE is_deleted = FALSE GROUP BY match_type`
  );
  const linkedFiles = await pool.query(
    `SELECT COUNT(DISTINCT file_id) as cnt FROM document_standard_relation
     WHERE is_deleted = FALSE`
  );
  const linkedClauses = await pool.query(
    `SELECT COUNT(DISTINCT clause_id) as cnt FROM document_standard_relation
     WHERE is_deleted = FALSE`
  );

  const stats = {
    total: parseInt(total.rows[0].cnt, 10),
    byStatus: { pending: 0, valid: 0, invalid: 0 },
    byMatchType: { auto: 0, manual: 0 },
    linkedFiles: parseInt(linkedFiles.rows[0].cnt, 10),
    linkedClauses: parseInt(linkedClauses.rows[0].cnt, 10),
  };

  byStatus.rows.forEach((r) => {
    stats.byStatus[r.status] = parseInt(r.cnt, 10);
  });
  byMatchType.rows.forEach((r) => {
    stats.byMatchType[r.match_type] = parseInt(r.cnt, 10);
  });

  return stats;
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  getRelationsByClause,
  getRelationsByFile,
  getValidRelationsByFile,
  createRelation,
  deleteRelation,
  confirmRelation,
  batchConfirmRelations,
  autoMatchForClause,
  generateAutoMatches,
  getPendingSuggestions,
  getRelationStats,
};
