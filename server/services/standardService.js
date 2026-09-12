/**
 * 安全生产标准化评价中心 - 标准条款管理服务
 *
 * 职责: 标准条款CRUD、树构建、导入导出基础能力
 * 数据库表:
 *   safety_standard_clauses   标准条款主表（三级层级）
 *
 * 不修改: 任何现有服务、现有表
 */

const { pool } = require('../config/db');

// ============================================================
// 辅助函数
// ============================================================

/**
 * 数据库行转前端驼峰格式
 */
function camelRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    parentId: row.parent_id,
    level: row.level,
    elementName: row.element_name,
    clauseTitle: row.clause_title,
    clauseContent: row.clause_content,
    checkMethod: row.check_method,
    scoreWeight: row.score_weight,
    requiredDocTypes: row.required_doc_types,
    keywords: row.keywords,
    sortOrder: row.sort_order,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 构建树形结构（通用）
 */
function buildTree(rows, opts = {}) {
  const map = {};
  const roots = [];
  rows.forEach((row) => {
    map[row.id] = { ...row, children: [] };
  });
  rows.forEach((row) => {
    const node = map[row.id];
    if (row.parentId && map[row.parentId]) {
      map[row.parentId].children.push(node);
    } else {
      roots.push(node);
    }
  });
  if (opts.sortBy) {
    const sortFn = (a, b) => (a[opts.sortBy] || 0) - (b[opts.sortBy] || 0);
    const sortTree = (nodes) => {
      nodes.sort(sortFn);
      nodes.forEach((n) => {
        if (n.children && n.children.length) sortTree(n.children);
      });
    };
    sortTree(roots);
  }
  return roots;
}

// ============================================================
// 1. 条款树查询
// ============================================================

/**
 * 获取完整条款树（三级）
 * @param {Object} options
 * @param {boolean} options.includeInactive 是否包含停用的条款
 */
async function getClauseTree(options = {}) {
  const { includeInactive = false } = options;

  let sql = `
    SELECT * FROM safety_standard_clauses
    WHERE is_deleted = FALSE
  `;
  const params = [];

  if (!includeInactive) {
    sql += ` AND status = 'active'`;
  }

  sql += ` ORDER BY sort_order, id`;

  const result = await pool.query(sql, params);
  const rows = result.rows.map(camelRow);
  return buildTree(rows, { sortBy: 'sortOrder' });
}

// ============================================================
// 2. 条款详情查询
// ============================================================

/**
 * 根据ID获取条款详情
 */
async function getClauseById(id) {
  const result = await pool.query(
    `SELECT * FROM safety_standard_clauses
     WHERE id = $1 AND is_deleted = FALSE`,
    [id]
  );
  return camelRow(result.rows[0]);
}

/**
 * 根据编码获取条款详情
 */
async function getClauseByCode(code) {
  const result = await pool.query(
    `SELECT * FROM safety_standard_clauses
     WHERE code = $1 AND is_deleted = FALSE`,
    [code]
  );
  return camelRow(result.rows[0]);
}

/**
 * 获取子条款列表
 */
async function getChildClauses(parentId) {
  const result = await pool.query(
    `SELECT * FROM safety_standard_clauses
     WHERE parent_id = $1 AND is_deleted = FALSE
     ORDER BY sort_order, id`,
    [parentId]
  );
  return result.rows.map(camelRow);
}

// ============================================================
// 3. 新增条款
// ============================================================

/**
 * 新增条款
 * @param {Object} data
 * @param {string} data.code 条款编码（唯一）
 * @param {number} data.parentId 父级ID
 * @param {number} data.level 层级
 * @param {string} data.elementName 要素名称
 * @param {string} data.clauseTitle 条款标题
 * @param {string} data.clauseContent 条款要求
 * @param {string} data.checkMethod 检查方法
 * @param {number} data.scoreWeight 分值权重
 * @param {Array} data.requiredDocTypes 要求资料类型
 * @param {Array} data.keywords 关键词
 * @param {number} data.sortOrder 排序
 * @param {Object} user 当前用户
 */
async function createClause(data, user) {
  const userId = user?.userId || user?.id || 1;

  if (!data.code) {
    throw new Error('条款编码不能为空');
  }
  if (!data.level || ![1, 2, 3].includes(data.level)) {
    throw new Error('条款层级不正确，必须是 1/2/3');
  }

  const existing = await getClauseByCode(data.code);
  if (existing) {
    throw new Error(`条款编码 ${data.code} 已存在`);
  }

  if (data.parentId) {
    const parent = await getClauseById(data.parentId);
    if (!parent) {
      throw new Error('父级条款不存在');
    }
    if (parent.level !== data.level - 1) {
      throw new Error('层级关系不正确，子级层级必须为父级+1');
    }
  }

  const result = await pool.query(
    `INSERT INTO safety_standard_clauses
       (code, parent_id, level, element_name, clause_title, clause_content,
        check_method, score_weight, required_doc_types, keywords, sort_order,
        status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12)
     RETURNING *`,
    [
      data.code,
      data.parentId || null,
      data.level,
      data.elementName || null,
      data.clauseTitle || null,
      data.clauseContent || null,
      data.checkMethod || null,
      data.scoreWeight != null ? data.scoreWeight : 0,
      JSON.stringify(data.requiredDocTypes || []),
      JSON.stringify(data.keywords || []),
      data.sortOrder != null ? data.sortOrder : 0,
      userId,
    ]
  );

  return camelRow(result.rows[0]);
}

// ============================================================
// 4. 编辑条款
// ============================================================

/**
 * 更新条款
 * @param {number} id 条款ID
 * @param {Object} data 可更新字段
 * @param {Object} user 当前用户
 */
async function updateClause(id, data, user) {
  const existing = await getClauseById(id);
  if (!existing) {
    throw new Error('条款不存在');
  }

  const updatableFields = [
    'code', 'parentId', 'level',
    'elementName', 'clauseTitle', 'clauseContent',
    'checkMethod', 'scoreWeight',
    'requiredDocTypes', 'keywords',
    'sortOrder', 'status',
  ];

  const sets = [];
  const params = [];
  let idx = 1;

  const jsonbFields = ['requiredDocTypes', 'keywords'];

  for (const field of updatableFields) {
    if (data[field] !== undefined) {
      const dbField = field.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
      sets.push(`${dbField} = $${idx}`);
      const val = jsonbFields.includes(field) ? JSON.stringify(data[field]) : data[field];
      params.push(val);
      idx++;
    }
  }

  if (sets.length === 0) {
    return existing;
  }

  sets.push(`updated_at = NOW()`);
  params.push(id);

  const result = await pool.query(
    `UPDATE safety_standard_clauses SET ${sets.join(', ')}
     WHERE id = $${idx} AND is_deleted = FALSE
     RETURNING *`,
    params
  );

  return camelRow(result.rows[0]);
}

// ============================================================
// 5. 启用/停用条款
// ============================================================

/**
 * 更新条款状态（启用/停用）
 * 不做物理删除，使用 status 控制
 */
async function setClauseStatus(id, status) {
  if (!['active', 'inactive'].includes(status)) {
    throw new Error('状态值不正确');
  }

  const existing = await getClauseById(id);
  if (!existing) {
    throw new Error('条款不存在');
  }

  const result = await pool.query(
    `UPDATE safety_standard_clauses
     SET status = $1, updated_at = NOW()
     WHERE id = $2 AND is_deleted = FALSE
     RETURNING *`,
    [status, id]
  );

  return camelRow(result.rows[0]);
}

/**
 * 软删除条款（标记 is_deleted = TRUE）
 * 注：根据冻结规则，优先使用 status=inactive 停用，
 * 此方法保留用于管理后台硬删除场景
 */
async function softDeleteClause(id) {
  const existing = await getClauseById(id);
  if (!existing) {
    throw new Error('条款不存在');
  }

  const children = await getChildClauses(id);
  if (children.length > 0) {
    throw new Error('存在子级条款，无法删除，请先删除子级');
  }

  await pool.query(
    `UPDATE safety_standard_clauses
     SET is_deleted = TRUE, updated_at = NOW()
     WHERE id = $1`,
    [id]
  );

  return true;
}

// ============================================================
// 6. 条款导入基础能力
// ============================================================

/**
 * 批量导入条款（JSON 数组格式）
 * @param {Array} clauses 条款数组
 * @param {Object} user 当前用户
 * @returns {Object} { total, success, failed, errors }
 */
async function batchImportClauses(clauses, user) {
  if (!Array.isArray(clauses) || clauses.length === 0) {
    throw new Error('导入数据不能为空');
  }

  const result = {
    total: clauses.length,
    success: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < clauses.length; i++) {
    try {
      await createClause(clauses[i], user);
      result.success++;
    } catch (err) {
      result.failed++;
      result.errors.push({
        index: i,
        code: clauses[i].code,
        message: err.message,
      });
    }
  }

  return result;
}

/**
 * 导出所有条款（JSON 格式，用于备份/迁移）
 */
async function exportClauses() {
  const result = await pool.query(
    `SELECT * FROM safety_standard_clauses
     WHERE is_deleted = FALSE
     ORDER BY code`
  );
  return result.rows.map(camelRow);
}

// ============================================================
// 7. 统计信息
// ============================================================

/**
 * 获取条款统计（按层级统计数量）
 */
async function getClauseStats() {
  const result = await pool.query(
    `SELECT level, status, COUNT(*) as count
     FROM safety_standard_clauses
     WHERE is_deleted = FALSE
     GROUP BY level, status
     ORDER BY level, status`
  );

  const stats = {
    total: 0,
    byLevel: { 1: 0, 2: 0, 3: 0 },
    active: 0,
    inactive: 0,
  };

  for (const row of result.rows) {
    stats.total += parseInt(row.count, 10);
    stats.byLevel[row.level] = (stats.byLevel[row.level] || 0) + parseInt(row.count, 10);
    if (row.status === 'active') {
      stats.active += parseInt(row.count, 10);
    } else {
      stats.inactive += parseInt(row.count, 10);
    }
  }

  return stats;
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  getClauseTree,
  getClauseById,
  getClauseByCode,
  getChildClauses,
  createClause,
  updateClause,
  setClauseStatus,
  softDeleteClause,
  batchImportClauses,
  exportClauses,
  getClauseStats,
};
