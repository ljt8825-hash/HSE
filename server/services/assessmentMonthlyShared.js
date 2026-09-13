/**
 * HSE月度安全履职考核模块 —— 共享基础（常量 + 工具 + 审计）
 *
 * 从 routes/hse-assessment-monthly.js 抽取，供 assessmentMonthly*Service 全量复用。
 * 仅承载 PostgreSQL + 内存降级双模式所需的共享常量与幂等工具，无 express 依赖
 * （getUserInfo 仅读取 req 上的纯字段，由 controller 传入解析结果）。
 *
 * 与原文件逐字节一致，口径不动：
 *   - 表名 / 状态机 / 扣分来源 / 三违统一扣分标准（Sprint10-D-2-2-A 冻结）
 *   - 扣分→类别/规则名解析（带 30s 缓存）、按类别汇总有效扣分
 *   - 分页 / 排序 / 审计 / operator_id 回落 NULL（防外键冲突）
 */

const { pool, isConnected } = require('../config/db');
const { logger } = require('../middleware/requestLogger');

const TABLES = {
  cycle: 'hse_assessment_cycle',
  target: 'hse_assessment_target',
  metric: 'hse_assessment_metric',
  score: 'hse_assessment_score',
  deduction: 'hse_assessment_deduction',
  adjustment: 'hse_deduction_adjustment',
  chain: 'hse_responsibility_chain',
  audit: 'hse_assessment_audit_log',
  violation: 'violation_records',
  employee: 'employee',
  standard: 'hse_assessment_standard',
};

const CYCLE_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  PENDING_REVIEW: 'pending_review',
  REVIEWED: 'reviewed',
  FROZEN: 'frozen',
};

const TARGET_STATUS = {
  PENDING: 'pending',
  SCORED: 'scored',
  REVIEWED: 'reviewed',
  FROZEN: 'frozen',
};

const REVIEW_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ADJUSTED: 'adjusted',
};

const DEDUCTION_SOURCE = {
  AUTO: 'auto',
  MANUAL: 'manual',
  IMPORT: 'import',
  CHAIN_TRANSMISSION: 'chain_transmission',
};

// 三违扣分统一标准（Sprint10-D-2-2-A 冻结）
const VIOLATION_DEDUCTION = 5;           // 每次三违固定扣5分（个人）
const TRANSMISSION_RATIO = 1.0;          // 直属上级传导比例100%
const CHAIN_LEVEL = 1;                   // 仅一级传导，禁止多级

// ==================== 扣分→类别/规则名 解析 ====================
// 扣分明细与「扣分规则库」以规则名（rule_name）作为唯一稳定关联。
// 规则名加载带 30s 缓存。
let _ruleCategoryMap = null;
let _ruleCategoryLoadedAt = 0;
async function getRuleCategoryMap() {
  if (_ruleCategoryMap && Date.now() - _ruleCategoryLoadedAt < 30000) return _ruleCategoryMap;
  const r = await pool.query(
    `SELECT id, rule_name, category FROM hse_assessment_rule WHERE is_deleted = FALSE`
  );
  const map = {};
  for (const row of r.rows) {
    if (!row.rule_name) continue;
    if (!map[row.rule_name]) {
      map[row.rule_name] = { category: row.category, ruleId: row.id };
    }
  }
  _ruleCategoryMap = map;
  _ruleCategoryLoadedAt = Date.now();
  return map;
}

// 解析单条扣分明细的规则名与类别；未命中返回 { ruleName, category:null }
async function resolveDeductionRule(d) {
  let ruleName = null;
  if (d.source_detail && d.source_detail.ruleHit && d.source_detail.ruleHit.ruleName) {
    ruleName = String(d.source_detail.ruleHit.ruleName);
  }
  if (!ruleName && d.deduction_item) ruleName = String(d.deduction_item);
  const map = await getRuleCategoryMap();
  let category = null;
  if (ruleName && map[ruleName]) category = map[ruleName].category;
  if (!category && d.source_detail && d.source_detail.category) {
    category = String(d.source_detail.category);
  }
  return { ruleName, category };
}

async function resolveRuleForDeductionRows(rows) {
  const map = await getRuleCategoryMap();
  const out = [];
  for (const d of rows) {
    let ruleName = null;
    if (d.source_detail && d.source_detail.ruleHit && d.source_detail.ruleHit.ruleName) {
      ruleName = String(d.source_detail.ruleHit.ruleName);
    }
    if (!ruleName && d.deduction_item) ruleName = String(d.deduction_item);
    let category = null;
    if (ruleName && map[ruleName]) category = map[ruleName].category;
    if (!category && d.source_detail && d.source_detail.category) {
      category = String(d.source_detail.category);
    }
    out.push({ deduction: d, ruleName, category });
  }
  return out;
}

// 汇总某对象/某批对象在指定周期内各「类别」的有效扣分合计
async function sumDeductionsByCategory(cycleId, targetIds) {
  const agg = {};
  if (!targetIds.length) return agg;
  const ids = targetIds.map((x) => (typeof x === 'object' ? x.id : x));
  const ded = await pool.query(
    `SELECT id, target_id, deduction_item, source_detail, suggested_score, confirmed_score, review_status
     FROM hse_assessment_deduction
     WHERE cycle_id = $1 AND target_id = ANY($2::bigint[]) AND is_deleted = FALSE
       AND review_status <> 'rejected'
       AND deduction_type IN ('auto','chain_transmission','auto_deduction')`,
    [cycleId, ids]
  );
  if (!ded.rows.length) return agg;
  const resolved = await resolveRuleForDeductionRows(ded.rows);
  for (const { deduction: d, category } of resolved) {
    if (!category) continue;
    const key = d.target_id;
    if (!agg[key]) agg[key] = {};
    const eff = (d.review_status === REVIEW_STATUS.APPROVED || d.review_status === REVIEW_STATUS.ADJUSTED)
      ? (d.confirmed_score != null ? Number(d.confirmed_score) : Number(d.suggested_score))
      : Number(d.suggested_score);
    agg[key][category] = (agg[key][category] || 0) + (eff || 0);
  }
  return agg;
}

// ==================== 工具函数 ====================

function getPagination(query, maxPageSize = 200) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, parseInt(query.page_size) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function getSort(query, defaultSort = 'created_at', defaultOrder = 'desc') {
  const sortBy = query.sort_by || defaultSort;
  const sortOrder = (query.sort_order || defaultOrder).toLowerCase();
  const allowedOrders = ['asc', 'desc'];
  return {
    sortBy: sortBy.replace(/[^a-zA-Z0-9_]/g, ''),
    sortOrder: allowedOrders.includes(sortOrder) ? sortOrder : 'desc',
  };
}

// 审计写入（operator_id 外键引用 employee(id)，非员工置 NULL 防冲突）
async function recordAudit(operatorId, operatorName, operatorRole, operationType, targetType, targetId, targetDesc, detail, reason, ip) {
  try {
    let opId = operatorId;
    if (opId != null) {
      const emp = await pool.query('SELECT id FROM employee WHERE id = $1 AND is_deleted = false', [opId]);
      if (emp.rows.length === 0) opId = null;
    }
    await pool.query(
      `INSERT INTO ${TABLES.audit} 
        (module, operation_type, target_type, target_id, target_desc, operator_id, operator_name, operator_role, operation_detail, operation_reason, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      ['assessment_monthly', operationType, targetType, targetId || null, targetDesc || null, opId, operatorName, operatorRole || null, detail || null, reason || null, ip || null]
    );
  } catch (e) {
    logger.warn(`[assessment-audit] 审计日志写入失败: ${e.message}`);
  }
}

// 读取 req 上的纯字段（无 express 依赖）
function getUserInfo(req) {
  return {
    id: req.user?.id || 1,
    name: req.user?.name || req.user?.realName || req.user?.username || '系统管理员',
    role: req.user?.role || 'admin',
    ip: req.ip || req.socket?.remoteAddress || '127.0.0.1',
  };
}

// hse_deduction_adjustment.adjusted_by 外键引用 employee(id)，非员工置 NULL（防外键冲突）
async function resolveOperatorEmployeeId(userId) {
  if (userId == null) return null;
  const emp = await pool.query('SELECT id FROM employee WHERE id = $1 AND is_deleted = false', [userId]);
  return emp.rows.length > 0 ? userId : null;
}

function calculateGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}

module.exports = {
  pool,
  isConnected,
  logger,
  TABLES,
  CYCLE_STATUS,
  TARGET_STATUS,
  REVIEW_STATUS,
  DEDUCTION_SOURCE,
  VIOLATION_DEDUCTION,
  TRANSMISSION_RATIO,
  CHAIN_LEVEL,
  getRuleCategoryMap,
  resolveDeductionRule,
  resolveRuleForDeductionRows,
  sumDeductionsByCategory,
  getPagination,
  getSort,
  recordAudit,
  getUserInfo,
  resolveOperatorEmployeeId,
  calculateGrade,
};