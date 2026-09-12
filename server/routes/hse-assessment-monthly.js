/**
 * Sprint10-D-2-1 HSE月度安全履职考核模块 - 后端路由
 * 路由前缀: /api/hse/assessment-monthly
 * 数据库: PostgreSQL 15，10张核心表
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { buildListResponse, buildDetailResponse, camelKeys } = require('../utils/commonResponse');
const { authMiddleware, optionalAuthMiddleware, requirePermission } = require('../middleware/auth');
const { logger } = require('../middleware/requestLogger');
const { auditLog, auditMiddleware } = require('./audit');
const engine = require('../services/assessmentScoringEngine');
const gridUncheckedDeduction = require('../services/gridUncheckedDeductionService');
const categoryCap = require('../services/ruleEngine/categoryCap');
// 复用「自动创建考核周期 + 同步对象」：与 monthlyLedgerImportScheduler 同源的月度自动生成逻辑
const { autoCreateAndSyncCycle } = require('../services/assessmentScheduler');

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
// 扣分明细与「扣分规则库」以规则名（rule_name）作为唯一稳定关联：
//   规则库表 hse_assessment_rule（含 rule_name + category），
//   扣分明细携带 ruleHit.ruleName 或明细名 deduction_item，
//   两者按规则名精确匹配以归属类别。规则名加载带 30s 缓存。
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

// 解析单条扣分明细的规则名与类别；未命中返回 { ruleName, category:null }（仍保留 ruleName 供展示）
async function resolveDeductionRule(d) {
  let ruleName = null;
  if (d.source_detail && d.source_detail.ruleHit && d.source_detail.ruleHit.ruleName) {
    ruleName = String(d.source_detail.ruleHit.ruleName);
  }
  if (!ruleName && d.deduction_item) ruleName = String(d.deduction_item);
  // 规则库按规则名精确命中 → 类别
  const map = await getRuleCategoryMap();
  let category = null;
  if (ruleName && map[ruleName]) category = map[ruleName].category;
  // 兜底：source_detail 顶层显式标定的 category（适配器/三违映射写入，如「三违管理」）
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
    // 兜底：source_detail 顶层显式标定的 category（适配器/三违映射写入，如「三违管理」）
    if (!category && d.source_detail && d.source_detail.category) {
      category = String(d.source_detail.category);
    }
    out.push({ deduction: d, ruleName, category });
  }
  return out;
}

// 汇总某对象/某批对象在指定周期内各「类别」的有效扣分合计
// targets: 当前页考核对象行（含 id、cycle_id）；返回 Map<targetId, { category:sum }>
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
    // 生效分：approved/adjusted 用 confirmed_score，pending 用 suggested_score
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

async function recordAudit(operatorId, operatorName, operatorRole, operationType, targetType, targetId, targetDesc, detail, reason, ip) {
  try {
    // operator_id 外键引用 employee(id)，而操作者可能是系统用户（users 表）而非员工；
    // 操作者不在 employee 表中时置 NULL（该列已可空），避免外键冲突导致审计写入失败。
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

function getUserInfo(req) {
  return {
    id: req.user?.id || 1,
    name: req.user?.name || req.user?.realName || req.user?.username || '系统管理员',
    role: req.user?.role || 'admin',
    ip: req.ip || req.socket?.remoteAddress || '127.0.0.1',
  };
}

// hse_deduction_adjustment.adjusted_by 外键引用 employee(id)，而操作者可能是 users 表系统用户；
// 不在 employee 表中时置 NULL（该列可空），避免外键冲突导致调整/解锁写入失败。
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

// ==================== 1. 考核周期接口 ====================

// 1.1 创建考核周期
router.post('/cycles', authMiddleware, requirePermission('hse:training:create'), async (req, res) => {
  try {
    const { assessment_year, assessment_month, cycle_name, cycle_type, remark } = req.body;
    if (!assessment_year || !assessment_month) {
      return res.json(error(400, '考核年份和月份不能为空'));
    }

    const cycleCode = `HSE-CYCLE-${assessment_year}${String(assessment_month).padStart(2, '0')}`;
    const user = getUserInfo(req);

    const startDate = new Date(assessment_year, assessment_month - 1, 1);
    const endDate = new Date(assessment_year, assessment_month, 0, 23, 59, 59);

    const result = await pool.query(
      `INSERT INTO ${TABLES.cycle} 
        (cycle_code, cycle_name, cycle_type, assessment_year, assessment_month, start_time, end_time, created_by, created_by_name, remark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [cycleCode, cycle_name || `${assessment_year}年${assessment_month}月月度考核`, cycle_type || 'monthly', assessment_year, assessment_month, startDate, endDate, user.id, user.name, remark || '']
    );

    await recordAudit(user.id, user.name, user.role, 'CREATE', 'CYCLE', result.rows[0].id, cycleCode, null, '创建考核周期', user.ip);

    buildDetailResponse(res, result.rows[0], '考核周期创建成功', { camelCase: true });
  } catch (e) {
    if ((e.message.includes('duplicate key') || e.message.includes('重复键')) && e.message.includes('cycle_code')) {
      return res.json(error(409, '该月度考核周期已存在'));
    }
    logger.error(`[assessment-cycle] 创建失败: ${e.message}`);
    res.json(error(500, '创建考核周期失败'));
  }
});

// 1.1.5 自动生成最近考核周期 + 同步对象（幂等，供「考核周期」页手工兜底）
// 复用 assessmentScheduler.autoCreateAndSyncCycle：日程已在每月1日00:30自动跑，
// 此处是前端打开页面时若当月周期缺失的一键补齐，避免靠 Excel 导入。
// body 可选 { year, month }，缺省为当月；周期已存在则跳过（不重复建）。
router.post('/cycles/auto-generate', authMiddleware, requirePermission('hse:training:create'), async (req, res) => {
  try {
    const now = new Date();
    const year = req.body?.year != null ? Number(req.body.year) : now.getFullYear();
    const month = req.body?.month != null ? Number(req.body.month) : now.getMonth() + 1;
    if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.json(error(400, '考核年份/月份无效'));
    }
    const r = await autoCreateAndSyncCycle(year, month, { operatorName: getUserInfo(req).name || 'admin' });
    if (!r.ok) {
      return res.json(error(500, r.reason === 'memory-mode' ? '数据库未连接，无法自动生成' : '自动生成失败'));
    }
    const cycleRes = await pool.query(
      `SELECT target_count FROM hse_assessment_cycle WHERE id = $1`,
      [r.cycleId]
    );
    return res.json(
      success(
        camelKeys({
          created: !r.skipped,
          cycleId: r.cycleId,
          synced: r.synced || { inserted: 0, removed: 0 },
          targetCount: cycleRes.rows[0]?.target_count ?? 0,
        }),
        r.skipped
          ? `${year}年${month}月考核周期已存在，无需重复生成`
          : `已自动生成 ${year}年${month}月考核周期（同步对象 ${r.synced?.inserted ?? 0} 人）`,
      )
    );
  } catch (e) {
    logger.error(`[assessment-cycle] auto-generate 失败: ${e.message}`);
    res.json(error(500, '自动生成考核周期失败'));
  }
});

// 1.2 查询考核周期列表
router.get('/cycles', authMiddleware, async (req, res) => {
  try {
    const { page, pageSize, offset } = getPagination(req.query);
    const { status, year, month, cycle_type, keyword } = req.query;

    const conditions = ['is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (year) {
      conditions.push(`assessment_year = $${idx++}`);
      params.push(year);
    }
    if (month) {
      conditions.push(`assessment_month = $${idx++}`);
      params.push(month);
    }
    if (cycle_type) {
      conditions.push(`cycle_type = $${idx++}`);
      params.push(cycle_type);
    }
    if (keyword) {
      conditions.push(`(cycle_name LIKE $${idx} OR cycle_code LIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT count(*) as cnt FROM ${TABLES.cycle} ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].cnt);

    const result = await pool.query(
      // 周期列表固定按考核年月倒序（最近→最远），供「自动评分」下拉筛选器使用
      `SELECT * FROM ${TABLES.cycle} ${where} ORDER BY assessment_year DESC, assessment_month DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    );

    buildListResponse(res, result.rows, total, page, pageSize, '查询成功', { camelCase: true });
  } catch (e) {
    logger.error(`[assessment-cycle] 列表查询失败: ${e.message}`);
    res.json(error(500, '查询考核周期列表失败'));
  }
});

// 1.3 获取考核周期详情
router.get('/cycles/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }

    buildDetailResponse(res, result.rows[0], '查询成功', { camelCase: true });
  } catch (e) {
    logger.error(`[assessment-cycle] 详情查询失败: ${e.message}`);
    res.json(error(500, '查询考核周期详情失败'));
  }
});

// 1.4 更新考核周期
router.put('/cycles/:id', authMiddleware, requirePermission('hse:training:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { cycle_name, cycle_type, remark, status } = req.body;
    const user = getUserInfo(req);

    const oldResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (oldResult.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }

    if (oldResult.rows[0].status === CYCLE_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的周期不可修改'));
    }

    const updateFields = [];
    const params = [];
    let idx = 1;

    if (cycle_name !== undefined) {
      updateFields.push(`cycle_name = $${idx++}`);
      params.push(cycle_name);
    }
    if (cycle_type !== undefined) {
      updateFields.push(`cycle_type = $${idx++}`);
      params.push(cycle_type);
    }
    if (remark !== undefined) {
      updateFields.push(`remark = $${idx++}`);
      params.push(remark);
    }
    if (status !== undefined) {
      updateFields.push(`status = $${idx++}`);
      params.push(status);
    }

    if (updateFields.length === 0) {
      return buildDetailResponse(res, oldResult.rows[0], '无需更新', { camelCase: true });
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE ${TABLES.cycle} SET ${updateFields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await recordAudit(user.id, user.name, user.role, 'UPDATE', 'CYCLE', parseInt(id), result.rows[0].cycle_code,
      { old: oldResult.rows[0], new: result.rows[0] }, '更新考核周期', user.ip);

    buildDetailResponse(res, result.rows[0], '考核周期更新成功', { camelCase: true });
  } catch (e) {
    logger.error(`[assessment-cycle] 更新失败: ${e.message}`);
    res.json(error(500, '更新考核周期失败'));
  }
});

// 1.5 删除考核周期（软删除）
router.delete('/cycles/:id', authMiddleware, requirePermission('hse:training:delete'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = getUserInfo(req);

    const oldResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (oldResult.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }

    if (oldResult.rows[0].status === CYCLE_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的周期不可删除'));
    }

    await pool.query(
      `UPDATE ${TABLES.cycle} SET is_deleted = TRUE WHERE id = $1`,
      [id]
    );

    await recordAudit(user.id, user.name, user.role, 'DELETE', 'CYCLE', parseInt(id), oldResult.rows[0].cycle_code,
      null, '删除考核周期', user.ip);

    res.json(success(null, '考核周期已删除'));
  } catch (e) {
    logger.error(`[assessment-cycle] 删除失败: ${e.message}`);
    res.json(error(500, '删除考核周期失败'));
  }
});

// 1.6 启动考核周期（同步对象）
router.post('/cycles/:id/start', authMiddleware, requirePermission('hse:training:create'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = getUserInfo(req);

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (cycleResult.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }

    const cycle = cycleResult.rows[0];
    if (cycle.status !== CYCLE_STATUS.NOT_STARTED) {
      return res.json(error(409, `周期状态为${cycle.status}，不可启动`));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insertResult = await client.query(
        `INSERT INTO ${TABLES.target} (cycle_id, employee_id, employee_code, employee_name, position, township, department)
         SELECT $1, v.employee_id, v.employee_code, v.name, v.position_name,
                COALESCE((SELECT t.org_name FROM hse_org_unit t WHERE t.org_type = 'town_center' AND t.is_deleted = false AND (v.org_path = t.org_path OR v.org_path LIKE t.org_path || '/%') ORDER BY length(t.org_path) DESC LIMIT 1), v.org_name) as township,
                COALESCE(v.org_name, '')
         FROM v_employee_org_full v
         WHERE v.relation_status = 'active'
           AND (
             v.position_name = '乡镇作业中心经理'
             OR (v.position_name = '管理员' AND v.org_type = 'town_center')
             OR v.employee_id IN (SELECT ga.personnel_id FROM grid_areas ga WHERE ga.personnel_id IS NOT NULL AND COALESCE(ga.is_deleted, FALSE) = FALSE)
             -- TODO 市政绿化作业中心公园负责人：花名册录入后在此处追加 OR 分支
           )
           AND v.employee_id NOT IN (SELECT employee_id FROM ${TABLES.target} WHERE cycle_id = $1)

         RETURNING id`,
        [id]
      );

      const targetCount = insertResult.rows.length;

      await client.query(
        `UPDATE ${TABLES.cycle} SET status = $1, target_count = $2 WHERE id = $3`,
        [CYCLE_STATUS.IN_PROGRESS, targetCount, id]
      );

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'START', 'CYCLE', parseInt(id), cycle.cycle_code,
        { target_count: targetCount }, '启动考核周期', user.ip);

      res.json(success(camelKeys({
        cycle_id: parseInt(id),
        status: CYCLE_STATUS.IN_PROGRESS,
        target_count: targetCount,
      }), '考核周期已启动，考核对象已生成'));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-cycle] 启动失败: ${e.message}`);
    res.json(error(500, '启动考核周期失败'));
  }
});

// ==================== 2. 考核对象接口 ====================

// 2.1 查询考核对象列表
router.get('/cycles/:id/targets', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    // 自动评分列表前端一次性全量展示（不分页），page_size 上限放宽到 10000
    const { page, pageSize, offset } = getPagination(req.query, 10000);
    const { sortBy, sortOrder } = getSort(req.query, 'created_at', 'desc');
    const { township, position, status, keyword, review_status, grade, grid_level } = req.query;

    const conditions = ['t.is_deleted = FALSE', 't.cycle_id = $1'];
    const params = [id];
    let idx = 2;

    if (township) {
      conditions.push(`t.township = $${idx++}`);
      params.push(township);
    }
    if (position) {
      conditions.push(`t.position = $${idx++}`);
      params.push(position);
    }
    if (status) {
      conditions.push(`t.status = $${idx++}`);
      params.push(status);
    }
    if (review_status) {
      conditions.push(`t.review_status = $${idx++}`);
      params.push(review_status);
    }
    if (grade) {
      conditions.push(`t.grade = $${idx++}`);
      params.push(grade);
    }
    if (keyword) {
      conditions.push(`(t.employee_name LIKE $${idx} OR t.employee_code LIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }
    // 按网格级别筛选（取该员工绑定的任一网格级别；用于「自动评分」仅展示二级/三级网格长）
    if (grid_level) {
      const levels = String(grid_level)
        .split(',')
        .map((s) => (s || '').trim())
        .filter(Boolean);
      if (levels.length > 0) {
        conditions.push(`t.employee_id IN (
          SELECT ga.personnel_id FROM grid_areas ga
          WHERE ga.personnel_id IS NOT NULL
            AND COALESCE(ga.is_deleted, FALSE) = FALSE
            AND ga.grid_level IN (${levels.map(() => `$${idx++}`).join(',')})
        )`);
        params.push(...levels);
      }
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT count(*) as cnt FROM ${TABLES.target} t ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].cnt);

    const result = await pool.query(
      `SELECT t.*,
              (SELECT ga.grid_level FROM grid_areas ga
               WHERE ga.personnel_id = t.employee_id
                 AND COALESCE(ga.is_deleted, FALSE) = FALSE
                 AND COALESCE(ga.grid_level, '') <> ''
               ORDER BY ga.id LIMIT 1) AS grid_level
       FROM ${TABLES.target} t ${where} ORDER BY t.${sortBy} ${sortOrder} LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    );

    // 按类别汇总每行的有效扣分（key 为「类别扣分上限」的类别名，供动态维度列取值）
    const catAgg = await sumDeductionsByCategory(id, result.rows.map((r) => r.id));
    for (const row of result.rows) {
      row.category_deductions = catAgg[row.id] || {};
    }

    // 管理员岗位：「HSE教育培训」维度列数据源 = 二级菜单「培训记录」当月「培训考核分数」
    // （口径与 views/training/ledger 一致：缺失数 + 资料不完整数，取自 hse_training_ledger_monthly）。
    // 仅「管理员」岗位行生效；当月该员工无培训台账数据时不覆盖（回落引擎扣分汇总）。
    try {
      const cycR = await pool.query(
        `SELECT assessment_year, assessment_month FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
        [id]
      );
      if (cycR.rows.length) {
        const month = `${cycR.rows[0].assessment_year}-${String(cycR.rows[0].assessment_month).padStart(2, '0')}`;
        const tr = await pool.query(
          `SELECT trainer_id, COALESCE(missing_count, 0) + COALESCE(incomplete_count, 0) AS score
           FROM hse_training_ledger_monthly WHERE month = $1`,
          [month]
        );
        const scoreByEmp = new Map(tr.rows.map((r) => [String(r.trainer_id), Number(r.score)]));
        for (const row of result.rows) {
          if (row.position !== '管理员') continue;
          const sc = scoreByEmp.get(String(row.employee_id));
          if (sc != null) {
            row.category_deductions = { ...(row.category_deductions || {}), 'HSE教育培训': sc };
          }
        }
      }
    } catch (e) {
      // 培训台账读取失败不阻断列表（该列回落引擎扣分汇总）
      logger.warn(`[assessment-target] 培训考核分数映射失败: ${e.message}`);
    }

    buildListResponse(res, result.rows, total, page, pageSize, '查询成功', { camelCase: true });
  } catch (e) {
    logger.error(`[assessment-target] 列表查询失败: ${e.message}`);
    res.json(error(500, '查询考核对象列表失败'));
  }
});

// 2.2 获取考核对象详情
router.get('/targets/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM ${TABLES.target} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.json(error(404, '考核对象不存在'));
    }

    buildDetailResponse(res, result.rows[0], '查询成功', { camelCase: true });
  } catch (e) {
    logger.error(`[assessment-target] 详情查询失败: ${e.message}`);
    res.json(error(500, '查询考核对象详情失败'));
  }
});

// 2.3 从员工表同步考核对象
router.post('/cycles/:id/targets/sync', authMiddleware, requirePermission('hse:training:create'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = getUserInfo(req);

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (cycleResult.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }
    if (cycleResult.rows[0].status === CYCLE_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的周期不可同步'));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const beforeResult = await client.query(
        `SELECT count(*) as cnt FROM ${TABLES.target} WHERE cycle_id = $1 AND is_deleted = FALSE`,
        [id]
      );
      const beforeCount = parseInt(beforeResult.rows[0].cnt);

      // 反向清理：把已存在但不再符合白名单的考核对象物理删除
      // （覆盖「白名单从宽到窄」场景，例如之前误纳入了人力综合部/生产管理部的管理员）
      // 日期拟合：指派期 [start_date,end_date] 须与周期 [start_time,end_time] 相交，
      // 避免把已离任人员纳入其离任之后的周期（end_date 为 NULL 视为仍在职）。
      const deleteResult = await client.query(
        `DELETE FROM ${TABLES.target} t
         WHERE t.cycle_id = $1 AND t.is_deleted = FALSE
           AND NOT EXISTS (
             SELECT 1 FROM v_employee_org_full v
             WHERE v.employee_id = t.employee_id
               AND v.relation_status = 'active'
               AND (
                 v.position_name = '乡镇作业中心经理'
                 OR (v.position_name = '管理员' AND v.org_type = 'town_center')
                 OR v.employee_id IN (SELECT ga.personnel_id FROM grid_areas ga WHERE ga.personnel_id IS NOT NULL AND COALESCE(ga.is_deleted, FALSE) = FALSE)
               )
               AND (v.start_date IS NULL OR v.start_date <= (SELECT end_time FROM ${TABLES.cycle} WHERE id = $1))
               AND (v.end_date IS NULL OR v.end_date >= (SELECT start_time FROM ${TABLES.cycle} WHERE id = $1))
           )`,
        [id]
      );
      const removed = deleteResult.rowCount;

      const insertResult = await client.query(
        `INSERT INTO ${TABLES.target} (cycle_id, employee_id, employee_code, employee_name, position, township, department)
         SELECT $1, v.employee_id, v.employee_code, v.name, v.position_name,
                COALESCE((SELECT t.org_name FROM hse_org_unit t WHERE t.org_type = 'town_center' AND t.is_deleted = false AND (v.org_path = t.org_path OR v.org_path LIKE t.org_path || '/%') ORDER BY length(t.org_path) DESC LIMIT 1), v.org_name) as township,
                COALESCE(v.org_name, '')
         FROM v_employee_org_full v
         WHERE v.relation_status = 'active'
           AND (
             v.position_name = '乡镇作业中心经理'
             OR (v.position_name = '管理员' AND v.org_type = 'town_center')
             OR v.employee_id IN (SELECT ga.personnel_id FROM grid_areas ga WHERE ga.personnel_id IS NOT NULL AND COALESCE(ga.is_deleted, FALSE) = FALSE)
             -- TODO 市政绿化作业中心公园负责人：花名册录入后在此处追加 OR 分支
           )
           AND (v.start_date IS NULL OR v.start_date <= (SELECT end_time FROM ${TABLES.cycle} WHERE id = $1))
           AND (v.end_date IS NULL OR v.end_date >= (SELECT start_time FROM ${TABLES.cycle} WHERE id = $1))
           AND v.employee_id NOT IN (SELECT employee_id FROM ${TABLES.target} WHERE cycle_id = $1)

         RETURNING id`,
        [id]
      );
      const added = insertResult.rows.length;

      const afterResult = await client.query(
        `SELECT count(*) as cnt FROM ${TABLES.target} WHERE cycle_id = $1 AND is_deleted = FALSE`,
        [id]
      );
      const total = parseInt(afterResult.rows[0].cnt);

      await client.query(
        `UPDATE ${TABLES.cycle} SET target_count = $1 WHERE id = $2`,
        [total, id]
      );

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'SYNC', 'TARGET', parseInt(id), cycleResult.rows[0].cycle_code,
        { before_count: beforeCount, removed, added, total }, '同步考核对象', user.ip);

      res.json(success(camelKeys({
        added,
        removed,
        total,
      }), removed > 0 || added > 0 ? `同步完成：移除 ${removed} 人，新增 ${added} 人，合计 ${total} 人` : '同步完成，无变化'));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-target] 同步失败: ${e.message}`);
    res.json(error(500, '同步考核对象失败'));
  }
});

// 2.4 手动添加考核对象
router.post('/cycles/:id/targets', authMiddleware, requirePermission('hse:training:create'), async (req, res) => {
  try {
    const { id } = req.params;
    const { employee_ids } = req.body;
    const user = getUserInfo(req);

    if (!employee_ids || !Array.isArray(employee_ids) || employee_ids.length === 0) {
      return res.json(error(400, '员工ID列表不能为空'));
    }

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (cycleResult.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }
    if (cycleResult.rows[0].status === CYCLE_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的周期不可添加对象'));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let added = 0;
      for (const empId of employee_ids) {
        const empResult = await client.query(
          `SELECT employee_id as id, name, employee_code, position_name,
                  COALESCE((SELECT t.org_name FROM hse_org_unit t WHERE t.org_type = 'town_center' AND t.is_deleted = false AND (v_employee_org_full.org_path = t.org_path OR v_employee_org_full.org_path LIKE t.org_path || '/%') ORDER BY length(t.org_path) DESC LIMIT 1), v_employee_org_full.org_name) as township,
                  COALESCE(org_name, '') as department
           FROM v_employee_org_full
           WHERE employee_id = $1 AND relation_status = 'active'
           LIMIT 1`,
          [empId]
        );
        if (empResult.rows.length === 0) continue;
        const emp = empResult.rows[0];

        try {
          await client.query(
            `INSERT INTO ${TABLES.target} (cycle_id, employee_id, employee_code, employee_name, position, township, department)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
            [id, emp.id, emp.employee_code, emp.name, emp.position_name, emp.township, emp.department]
          );
          added++;
        } catch (e) {
          // 跳过重复
        }
      }

      await client.query(
        `UPDATE ${TABLES.cycle} SET target_count = (SELECT count(*) FROM ${TABLES.target} WHERE cycle_id = $1 AND is_deleted = FALSE) WHERE id = $1`,
        [id]
      );

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'CREATE', 'TARGET', parseInt(id), cycleResult.rows[0].cycle_code,
        { added_count: added, employee_ids }, '添加考核对象', user.ip);

      res.json(success(camelKeys({ added, total: employee_ids.length }), `已添加${added}名考核对象`));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-target] 添加失败: ${e.message}`);
    res.json(error(500, '添加考核对象失败'));
  }
});

// 2.5 移除考核对象
router.delete('/targets/:id', authMiddleware, requirePermission('hse:training:delete'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = getUserInfo(req);

    const targetResult = await pool.query(
      `SELECT * FROM ${TABLES.target} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (targetResult.rows.length === 0) {
      return res.json(error(404, '考核对象不存在'));
    }

    const target = targetResult.rows[0];
    const cycleResult = await pool.query(
      `SELECT status FROM ${TABLES.cycle} WHERE id = $1`,
      [target.cycle_id]
    );
    if (cycleResult.rows[0]?.status === CYCLE_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的周期不可移除对象'));
    }

    await pool.query(
      `UPDATE ${TABLES.target} SET is_deleted = TRUE WHERE id = $1`,
      [id]
    );

    await pool.query(
      `UPDATE ${TABLES.cycle} SET target_count = (SELECT count(*) FROM ${TABLES.target} WHERE cycle_id = $1 AND is_deleted = FALSE) WHERE id = $1`,
      [target.cycle_id]
    );

    await recordAudit(user.id, user.name, user.role, 'DELETE', 'TARGET', parseInt(id), target.employee_name,
      null, '移除考核对象', user.ip);

    res.json(success(null, '考核对象已移除'));
  } catch (e) {
    logger.error(`[assessment-target] 移除失败: ${e.message}`);
    res.json(error(500, '移除考核对象失败'));
  }
});

// ==================== 3. 考核指标接口 ====================

// 3.1 查询指标列表
router.get('/metrics', authMiddleware, async (req, res) => {
  try {
    const { category, target_post, status } = req.query;

    const conditions = ['is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    if (category) {
      conditions.push(`category = $${idx++}`);
      params.push(category);
    }
    if (target_post) {
      conditions.push(`(target_post = $${idx} OR target_post = 'all')`);
      params.push(target_post);
      idx++;
    }
    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    } else {
      conditions.push(`status = 'active'`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await pool.query(
      `SELECT * FROM ${TABLES.metric} ${where} ORDER BY sort_order ASC, id ASC`,
      params
    );

    res.json(success({
      list: result.rows.map(camelKeys),
      total: result.rows.length,
    }));
  } catch (e) {
    logger.error(`[assessment-metric] 列表查询失败: ${e.message}`);
    res.json(error(500, '查询指标列表失败'));
  }
});

// 3.2 获取指标详情
router.get('/metrics/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM ${TABLES.metric} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.json(error(404, '考核指标不存在'));
    }

    buildDetailResponse(res, result.rows[0], '查询成功', { camelCase: true });
  } catch (e) {
    logger.error(`[assessment-metric] 详情查询失败: ${e.message}`);
    res.json(error(500, '查询考核指标详情失败'));
  }
});

// ==================== 4. 评分引擎接口 ====================

// 4.1 执行自动评分
router.post('/scoring/execute', authMiddleware, requirePermission('hse:training:create'), async (req, res) => {
  try {
    const { cycle_id } = req.body;
    const user = getUserInfo(req);

    if (!cycle_id) {
      return res.json(error(400, '周期ID不能为空'));
    }

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycle_id]
    );
    if (cycleResult.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }

    const cycle = cycleResult.rows[0];
    if (cycle.status === CYCLE_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的周期不可评分'));
    }
    if (cycle.status === CYCLE_STATUS.NOT_STARTED) {
      return res.json(error(409, '未启动的周期不可评分，请先启动周期'));
    }

    // ===== 当场扫描「网格长未巡查」缺次扣分（幂等 upsert，随后统一重算） =====
    let uncheckedSync = null;
    try {
      uncheckedSync = await gridUncheckedDeduction.syncGridUncheckedDeductions(cycle_id);
    } catch (e) {
      logger.warn(`[assessment-scoring] 网格未巡查扫描失败（不阻断评分）: ${e.message}`);
    }

    // ===== 切换到事件引擎口径：以扣分明细表(hse_assessment_deduction)有效扣分为准重算全周期 =====
    // score_auto = max(0, 100 - Σ(去除 rejected 的 auto + chain_transmission 扣分建议分))，
    // 由 engine.recalculateTarget 更新 target / 写 AUTO_TOTAL_SNAPSHOT 快照。
    const results = await engine.recalculateCycle(cycle_id);
    const okResults = results.filter((r) => r && r.ok === true);
    const failed = results
      .filter((r) => !(r && r.ok === true))
      .map((r) => `#${r.targetId}:${r.reason || r.error || 'fail'}`);

    // 能出分的对象标记为已评分（未出分的保持原状态，便于后续补扣后重算）
    await pool.query(
      `UPDATE ${TABLES.target}
       SET status = $1, updated_at = NOW()
       WHERE cycle_id = $2 AND is_deleted = FALSE
         AND score_auto IS NOT NULL AND status <> $1`,
      [TARGET_STATUS.SCORED, cycle_id]
    );

    const scoredCountResult = await pool.query(
      `SELECT count(*)::int AS cnt FROM ${TABLES.target}
       WHERE cycle_id = $1 AND is_deleted = FALSE AND status = $2`,
      [cycle_id, TARGET_STATUS.SCORED]
    );
    const scoredCount = scoredCountResult.rows[0].cnt;

    await pool.query(
      `UPDATE ${TABLES.cycle}
       SET status = $1, scored_count = $2
       WHERE id = $3`,
      [CYCLE_STATUS.PENDING_REVIEW, scoredCount, cycle_id]
    );

    const newVersionResult = await pool.query(
      `SELECT COALESCE(MAX(score_version),0)::int AS v FROM ${TABLES.target} WHERE cycle_id = $1`,
      [cycle_id]
    );
    const newVersion = newVersionResult.rows[0].v;

    // 网格未巡查扫描摘要（含 reason：如 no-ledger-data 视为正常不阻断）
    const gridUncheckedInfo = uncheckedSync
      ? {
          ok: !!uncheckedSync.ok,
          reason: uncheckedSync.ok ? null : (uncheckedSync.reason || 'unknown'),
          scanned: uncheckedSync.scanned || 0,
          affected: uncheckedSync.affected || 0,
          dryRun: !!uncheckedSync.dryRun,
        }
      : null;

    await recordAudit(user.id, user.name, user.role, 'CALCULATE', 'SCORE', cycle_id, cycle.cycle_code,
      { scored_count: scoredCount, version: newVersion, engine: 'event-driven', recalculated: okResults.length, failed,
        grid_unchecked: gridUncheckedInfo },
      '执行自动评分（事件引擎口径）', user.ip);

      res.json(success(camelKeys({
      cycle_id,
      scored_count: scoredCount,
      score_version: newVersion,
      status: CYCLE_STATUS.PENDING_REVIEW,
      grid_unchecked: gridUncheckedInfo,
    }), '自动评分执行完成'));
  } catch (e) {
    logger.error(`[assessment-scoring] 执行失败: ${e.message}`);
    res.json(error(500, '执行自动评分失败'));
  }
});

// 4.2 查询评分进度
router.get('/scoring/progress/:cycleId', authMiddleware, async (req, res) => {
  try {
    const { cycleId } = req.params;

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycleId]
    );
    if (cycleResult.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }

    const cycle = cycleResult.rows[0];
    const progress = cycle.target_count > 0
      ? Math.round((cycle.scored_count / cycle.target_count) * 100)
      : 0;

    res.json(success(camelKeys({
      cycle_id: cycle.id,
      total_targets: cycle.target_count,
      scored_count: cycle.scored_count,
      reviewed_count: cycle.reviewed_count,
      frozen_count: cycle.frozen_count,
      progress_percent: progress,
      cycle_status: cycle.status,
    })));
  } catch (e) {
    logger.error(`[assessment-scoring] 进度查询失败: ${e.message}`);
    res.json(error(500, '查询评分进度失败'));
  }
});

// 4.3 重新计算评分
router.post('/scoring/recalculate', authMiddleware, requirePermission('hse:training:create'), async (req, res) => {
  try {
    const { cycle_id } = req.body;
    const user = getUserInfo(req);

    if (!cycle_id) {
      return res.json(error(400, '周期ID不能为空'));
    }

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycle_id]
    );
    if (cycleResult.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }

    const cycle = cycleResult.rows[0];
    if (cycle.status === CYCLE_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的周期不可重新评分'));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE ${TABLES.target} 
         SET status = $1, score_auto = NULL, score_total = NULL, 
             grade = NULL, rank_township = NULL, rank_all = NULL,
             review_status = 'pending', review_progress = 0
         WHERE cycle_id = $2 AND is_deleted = FALSE`,
        [TARGET_STATUS.PENDING, cycle_id]
      );

      await client.query(
        `DELETE FROM ${TABLES.score} 
         WHERE cycle_id = $1 AND is_deleted = FALSE`,
        [cycle_id]
      );

      await client.query(
        `DELETE FROM ${TABLES.deduction} 
         WHERE cycle_id = $1 AND is_deleted = FALSE AND deduction_source = $2`,
        [cycle_id, DEDUCTION_SOURCE.AUTO]
      );

      await client.query(
        `UPDATE ${TABLES.cycle} 
         SET status = $1, scored_count = 0, reviewed_count = 0
         WHERE id = $2`,
        [CYCLE_STATUS.IN_PROGRESS, cycle_id]
      );

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'RECALCULATE', 'SCORE', cycle_id, cycle.cycle_code,
        null, '重新计算评分（清空旧数据）', user.ip);

      res.json(success(camelKeys({
        cycle_id,
        status: CYCLE_STATUS.IN_PROGRESS,
        message: '已清空旧评分数据，请重新执行评分',
      }), '重新计算初始化完成'));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-scoring] 重算失败: ${e.message}`);
    res.json(error(500, '重新计算评分失败'));
  }
});

// ==================== 5. 扣分明细接口 ====================

// 5.1 查询扣分明细列表
router.get('/deductions', authMiddleware, async (req, res) => {
  try {
    const { cycle_id, target_id, metric_id, review_status, deduction_type, deduction_source, is_transmission, keyword } = req.query;
    const { page, pageSize, offset } = getPagination(req.query);
    const { sortBy, sortOrder } = getSort(req.query, 'created_at', 'desc');

    const conditions = ['d.is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    if (cycle_id) {
      conditions.push(`d.cycle_id = $${idx++}`);
      params.push(cycle_id);
    }
    if (target_id) {
      conditions.push(`d.target_id = $${idx++}`);
      params.push(target_id);
    }
    if (metric_id) {
      conditions.push(`d.metric_id = $${idx++}`);
      params.push(metric_id);
    }
    if (review_status) {
      conditions.push(`d.review_status = $${idx++}`);
      params.push(review_status);
    }
    if (deduction_type) {
      conditions.push(`d.deduction_type = $${idx++}`);
      params.push(deduction_type);
    }
    if (deduction_source) {
      conditions.push(`d.deduction_source = $${idx++}`);
      params.push(deduction_source);
    }
    if (is_transmission !== undefined) {
      conditions.push(`d.is_transmission = $${idx++}`);
      params.push(is_transmission === 'true' || is_transmission === true);
    }
    if (keyword) {
      conditions.push(`(d.deduction_item LIKE $${idx} OR d.violator_name LIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT count(*) as cnt FROM ${TABLES.deduction} d ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].cnt);

    const result = await pool.query(
      `SELECT d.*, t.employee_name, t.employee_code, t.status AS target_status, m.metric_name, m.category
       FROM ${TABLES.deduction} d
       LEFT JOIN ${TABLES.target} t ON d.target_id = t.id
       LEFT JOIN ${TABLES.metric} m ON d.metric_id = m.id
       ${where} 
       ORDER BY d.${sortBy} ${sortOrder} 
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    );

    buildListResponse(res, result.rows, total, page, pageSize, '查询成功', { camelCase: true });
  } catch (e) {
    logger.error(`[assessment-deduction] 列表查询失败: ${e.message}`);
    res.json(error(500, '查询扣分明细失败'));
  }
});

// 5.2 获取扣分明细详情
router.get('/deductions/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT d.*, t.employee_name, t.employee_code, m.metric_name, m.category
       FROM ${TABLES.deduction} d
       LEFT JOIN ${TABLES.target} t ON d.target_id = t.id
       LEFT JOIN ${TABLES.metric} m ON d.metric_id = m.id
       WHERE d.id = $1 AND d.is_deleted = FALSE`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.json(error(404, '扣分明细不存在'));
    }

    buildDetailResponse(res, result.rows[0], '查询成功', { camelCase: true });
  } catch (e) {
    logger.error(`[assessment-deduction] 详情查询失败: ${e.message}`);
    res.json(error(500, '查询扣分明细详情失败'));
  }
});

// 5.3 手动添加扣分
router.post('/deductions', authMiddleware, requirePermission('hse:training:create'), async (req, res) => {
  try {
    const {
      target_id, cycle_id, metric_id, deduction_item, deduction_type,
      suggested_score, violation_level, violation_date, violator_id,
      violator_name, remark
    } = req.body;
    const user = getUserInfo(req);

    if (!target_id || !metric_id || !deduction_item || !deduction_type || suggested_score === undefined) {
      return res.json(error(400, '必填字段不能为空'));
    }

    const targetResult = await pool.query(
      `SELECT * FROM ${TABLES.target} WHERE id = $1 AND is_deleted = FALSE`,
      [target_id]
    );
    if (targetResult.rows.length === 0) {
      return res.json(error(404, '考核对象不存在'));
    }
    if (targetResult.rows[0].status === TARGET_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的对象不可添加扣分'));
    }

    // 评分联动：考核项命中考核标准配置（按岗位+考核项）时，以配置分值为准，
    // 管理员在「扣分调整」页修改标准后，新添加的扣分按修改后的分值计算。
    // 考核对象 position 存中文名（如"管理员"），标准表 position 存编码（如"manager"），
    // 故同时匹配 position 与 position_name。
    let finalScore = suggested_score;
    if (deduction_item) {
      const stdResult = await pool.query(
        `SELECT deduction_score, rule_type FROM ${TABLES.standard}
         WHERE (position = $1 OR position_name = $1) AND item_name = $2 AND is_deleted = FALSE AND is_active = TRUE
         ORDER BY id DESC LIMIT 1`,
        [targetResult.rows[0].position, deduction_item]
      );
      if (stdResult.rows.length > 0) {
        const std = stdResult.rows[0];
        if (std.rule_type === 'deduction' && std.deduction_score != null) {
          finalScore = Math.abs(Number(std.deduction_score));
        } else if (std.rule_type === 'veto' && std.deduction_score != null) {
          finalScore = Math.abs(Number(std.deduction_score));
        }
      }
    }
    if (finalScore === undefined || finalScore === null) {
      return res.json(error(400, '必填字段不能为空'));
    }

    const metricResult = await pool.query(
      `SELECT * FROM ${TABLES.metric} WHERE id = $1 AND is_deleted = FALSE`,
      [metric_id]
    );
    if (metricResult.rows.length === 0) {
      return res.json(error(404, '考核指标不存在'));
    }

    const scoreResult = await pool.query(
      `SELECT id FROM ${TABLES.score} 
       WHERE target_id = $1 AND metric_id = $2 AND is_deleted = FALSE
       LIMIT 1`,
      [target_id, metric_id]
    );

    let scoreId = scoreResult.rows[0]?.id;

    if (!scoreId) {
      const insertScoreResult = await pool.query(
        `INSERT INTO ${TABLES.score} 
          (target_id, cycle_id, metric_id, metric_code, raw_value, raw_value_desc,
           deduction_total, original_score, final_score, is_auto, is_manual,
           review_status, calc_time)
         VALUES ($1, $2, $3, $4, 0, '手动添加', 0, $5, $5, FALSE, TRUE, 'pending', NOW())
         RETURNING id`,
        [target_id, cycle_id || targetResult.rows[0].cycle_id, metric_id,
         metricResult.rows[0].metric_code, metricResult.rows[0].base_score]
      );
      scoreId = insertScoreResult.rows[0].id;
    }

    // ===== 任务A：人工扣分上限提示（纯 advisory，照常保存不拦截）=====
    // 复用 categoryCap.computeManualCapWarning（归类口径与自动钳制一致），
    // 超类别上限时响应携带 capWarning，由前端提示；任何异常都不阻断保存。
    let capWarning = null;
    try {
      capWarning = await categoryCap.computeManualCapWarning({
        cycleId: cycle_id || targetResult.rows[0].cycle_id,
        targetId: target_id,
        deductionItem: deduction_item,
        sourceDetail: null,
        adding: finalScore,
        role: targetResult.rows[0].position === '管理员' ? 'admin' : 'manager',
      });
    } catch (e) {
      logger.warn(`[assessment-deduction] 上限提示计算失败(忽略): ${e.message}`);
    }

    const result = await pool.query(
      `INSERT INTO ${TABLES.deduction} 
        (score_id, target_id, cycle_id, metric_id, metric_code, deduction_item,
         deduction_type, deduction_source, suggested_score, review_status,
         violation_level, violation_date, violator_id, violator_name,
         is_transmission, remark, current_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending',
               $10, $11, $12, $13, FALSE, $14, 1)
       RETURNING *`,
      [scoreId, target_id, cycle_id || targetResult.rows[0].cycle_id, metric_id,
       metricResult.rows[0].metric_code, deduction_item, deduction_type,
       DEDUCTION_SOURCE.MANUAL, finalScore, violation_level || null,
       violation_date || null, violator_id || null, violator_name || null,
       remark || null]
    );

    await recordAudit(user.id, user.name, user.role, 'CREATE', 'DEDUCTION', result.rows[0].id, deduction_item,
      { suggested_score: finalScore, deduction_type }, '手动添加扣分', user.ip);

    const resp = success(camelKeys(result.rows[0]), '扣分明细添加成功');
    if (capWarning) resp.capWarning = capWarning;
    return res.json(resp);
  } catch (e) {
    logger.error(`[assessment-deduction] 添加失败: ${e.message}`);
    res.json(error(500, '添加扣分明细失败'));
  }
});

// 5.4 更新扣分（仅草稿状态）
router.put('/deductions/:id', authMiddleware, requirePermission('hse:training:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { deduction_item, deduction_type, suggested_score, violation_level, violation_date, remark } = req.body;
    const user = getUserInfo(req);

    const deductionResult = await pool.query(
      `SELECT * FROM ${TABLES.deduction} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (deductionResult.rows.length === 0) {
      return res.json(error(404, '扣分明细不存在'));
    }

    const deduction = deductionResult.rows[0];
    if (deduction.review_status !== REVIEW_STATUS.PENDING) {
      return res.json(error(409, '仅待审核状态的扣分明细可修改'));
    }
    if (deduction.deduction_source === DEDUCTION_SOURCE.AUTO) {
      return res.json(error(409, '自动生成的扣分明细不可直接修改，请使用调整功能'));
    }

    const targetResult = await pool.query(
      `SELECT status, position FROM ${TABLES.target} WHERE id = $1`,
      [deduction.target_id]
    );
    if (targetResult.rows[0]?.status === TARGET_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的对象不可修改扣分'));
    }

    const updateFields = [];
    const params = [];
    let idx = 1;

    if (deduction_item !== undefined) {
      updateFields.push(`deduction_item = $${idx++}`);
      params.push(deduction_item);
    }
    if (deduction_type !== undefined) {
      updateFields.push(`deduction_type = $${idx++}`);
      params.push(deduction_type);
    }
    if (suggested_score !== undefined) {
      updateFields.push(`suggested_score = $${idx++}`);
      params.push(suggested_score);
    }
    if (violation_level !== undefined) {
      updateFields.push(`violation_level = $${idx++}`);
      params.push(violation_level);
    }
    if (violation_date !== undefined) {
      updateFields.push(`violation_date = $${idx++}`);
      params.push(violation_date);
    }
    if (remark !== undefined) {
      updateFields.push(`remark = $${idx++}`);
      params.push(remark);
    }

    if (updateFields.length === 0) {
      return buildDetailResponse(res, deduction, '无需更新', { camelCase: true });
    }

    // ===== 任务A：人工扣分上限提示（编辑场景，纯 advisory，照常保存不拦截）=====
    // 编辑时排除本行（excludeId=id），新增分值取本次 suggested_score（未改则沿用现值）。
    let capWarning = null;
    try {
      capWarning = await categoryCap.computeManualCapWarning({
        cycleId: deduction.cycle_id,
        targetId: deduction.target_id,
        deductionItem: deduction_item !== undefined ? deduction_item : deduction.deduction_item,
        sourceDetail: deduction.source_detail || null,
        adding: suggested_score !== undefined ? suggested_score : deduction.suggested_score,
        excludeId: id,
        role: targetResult.rows[0]?.position === '管理员' ? 'admin' : 'manager',
      });
    } catch (e) {
      logger.warn(`[assessment-deduction] 上限提示计算失败(忽略): ${e.message}`);
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE ${TABLES.deduction} SET ${updateFields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await recordAudit(user.id, user.name, user.role, 'UPDATE', 'DEDUCTION', parseInt(id), deduction.deduction_item,
      { old: deduction, new: result.rows[0] }, '更新扣分明细', user.ip);

    const resp = success(camelKeys(result.rows[0]), '扣分明细更新成功');
    if (capWarning) resp.capWarning = capWarning;
    return res.json(resp);
  } catch (e) {
    logger.error(`[assessment-deduction] 更新失败: ${e.message}`);
    res.json(error(500, '更新扣分明细失败'));
  }
});

// 5.5 删除扣分（仅草稿状态）
router.delete('/deductions/:id', authMiddleware, requirePermission('hse:training:delete'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = getUserInfo(req);

    const deductionResult = await pool.query(
      `SELECT * FROM ${TABLES.deduction} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (deductionResult.rows.length === 0) {
      return res.json(error(404, '扣分明细不存在'));
    }

    const deduction = deductionResult.rows[0];
    if (deduction.review_status === REVIEW_STATUS.APPROVED) {
      return res.json(error(409, '已审核通过的扣分明细不可删除'));
    }

    const targetResult = await pool.query(
      `SELECT status FROM ${TABLES.target} WHERE id = $1`,
      [deduction.target_id]
    );
    if (targetResult.rows[0]?.status === TARGET_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的对象不可删除扣分'));
    }

    await pool.query(
      `UPDATE ${TABLES.deduction} SET is_deleted = TRUE WHERE id = $1`,
      [id]
    );

    await recordAudit(user.id, user.name, user.role, 'DELETE', 'DEDUCTION', parseInt(id), deduction.deduction_item,
      null, '删除扣分明细', user.ip);

    res.json(success(null, '扣分明细已删除'));
  } catch (e) {
    logger.error(`[assessment-deduction] 删除失败: ${e.message}`);
    res.json(error(500, '删除扣分明细失败'));
  }
});

// ==================== 6. 扣分审核接口 ====================

// 6.1 审核通过
router.post('/deductions/review/approve', authMiddleware, auditMiddleware('assessment-monthly', 'audit'), requirePermission('hse:training:audit'), async (req, res) => {
  try {
    const { deduction_id, confirmed_score, review_comment } = req.body;
    const user = getUserInfo(req);

    if (!deduction_id) {
      return res.json(error(400, '扣分明细ID不能为空'));
    }

    const deductionResult = await pool.query(
      `SELECT * FROM ${TABLES.deduction} WHERE id = $1 AND is_deleted = FALSE`,
      [deduction_id]
    );
    if (deductionResult.rows.length === 0) {
      return res.json(error(404, '扣分明细不存在'));
    }

    const deduction = deductionResult.rows[0];
    if (deduction.review_status === REVIEW_STATUS.APPROVED) {
      return res.json(error(409, '该扣分明细已审核通过'));
    }

    const targetResult = await pool.query(
      `SELECT status FROM ${TABLES.target} WHERE id = $1`,
      [deduction.target_id]
    );
    if (targetResult.rows[0]?.status === TARGET_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的对象不可审核'));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 生效分统一口径：确认分缺省回退建议分（人工确认值优先，与 adjust 一致）
      const finalConfirmed = confirmed_score != null && confirmed_score !== '' ? Number(confirmed_score) : deduction.suggested_score;

      await client.query(
        `UPDATE ${TABLES.deduction} 
         SET review_status = 'approved',
             confirmed_score = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [finalConfirmed, deduction_id]
      );

      await client.query('COMMIT');

      // 统一生效分口径重算目标分（pending 用 suggested，approved/adjusted 用 confirmed）
      await engine.recalculateTarget(deduction.cycle_id, deduction.target_id);

      await recordAudit(user.id, user.name, user.role, 'REVIEW_APPROVE', 'DEDUCTION', deduction.id, deduction.deduction_item,
        { confirmed_score: finalConfirmed, review_comment }, '审核扣分明细通过', user.ip);

      res.json(success(null, '扣分明细审核通过'));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-deduction] 审核通过失败: ${e.message}`);
    res.json(error(500, '审核扣分明细失败'));
  }
});

// 6.2 审核驳回
router.post('/deductions/review/reject', authMiddleware, auditMiddleware('assessment-monthly', 'audit'), requirePermission('hse:training:audit'), async (req, res) => {
  try {
    const { deduction_id, reject_reason } = req.body;
    const user = getUserInfo(req);

    if (!deduction_id || !reject_reason) {
      return res.json(error(400, '扣分明细ID和驳回原因不能为空'));
    }

    const deductionResult = await pool.query(
      `SELECT * FROM ${TABLES.deduction} WHERE id = $1 AND is_deleted = FALSE`,
      [deduction_id]
    );
    if (deductionResult.rows.length === 0) {
      return res.json(error(404, '扣分明细不存在'));
    }

    const deduction = deductionResult.rows[0];
    const targetResult = await pool.query(
      `SELECT status FROM ${TABLES.target} WHERE id = $1`,
      [deduction.target_id]
    );
    if (targetResult.rows[0]?.status === TARGET_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的对象不可驳回'));
    }

    await pool.query(
      `UPDATE ${TABLES.deduction} 
       SET review_status = 'rejected', remark = COALESCE(remark, '') || $1, updated_at = NOW()
       WHERE id = $2`,
      [`\n驳回原因: ${reject_reason}`, deduction_id]
    );

    // 统一生效分口径重算目标分（rejected 不计入）
    await engine.recalculateTarget(deduction.cycle_id, deduction.target_id);

    await recordAudit(user.id, user.name, user.role, 'REVIEW_REJECT', 'DEDUCTION', deduction.id, deduction.deduction_item,
      { reject_reason }, '驳回扣分明细', user.ip);

    res.json(success(null, '扣分明细已驳回'));
  } catch (e) {
    logger.error(`[assessment-deduction] 驳回失败: ${e.message}`);
    res.json(error(500, '驳回扣分明细失败'));
  }
});

// 6.3 批量审核通过
router.post('/deductions/batch-approve', authMiddleware, auditMiddleware('assessment-monthly', 'audit'), requirePermission('hse:training:audit'), async (req, res) => {
  try {
    const { deduction_ids } = req.body;
    const user = getUserInfo(req);

    if (!deduction_ids || !Array.isArray(deduction_ids) || deduction_ids.length === 0) {
      return res.json(error(400, '扣分明细ID列表不能为空'));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let approved = 0;
      let skipped = 0;
      const recalcTargets = new Set(); // "cycleId:targetId" 去重

      for (const deductionId of deduction_ids) {
        const deductionResult = await client.query(
          `SELECT * FROM ${TABLES.deduction} WHERE id = $1 AND is_deleted = FALSE`,
          [deductionId]
        );
        if (deductionResult.rows.length === 0) {
          skipped++;
          continue;
        }

        const deduction = deductionResult.rows[0];
        if (deduction.review_status === REVIEW_STATUS.APPROVED) {
          skipped++;
          continue;
        }

        const targetResult = await client.query(
          `SELECT status FROM ${TABLES.target} WHERE id = $1`,
          [deduction.target_id]
        );
        if (targetResult.rows[0]?.status === TARGET_STATUS.FROZEN) {
          skipped++;
          continue;
        }

        await client.query(
          `UPDATE ${TABLES.deduction} 
           SET review_status = 'approved', confirmed_score = suggested_score, updated_at = NOW()
           WHERE id = $1`,
          [deductionId]
        );

        recalcTargets.add(`${deduction.cycle_id}:${deduction.target_id}`);
        approved++;
      }

      await client.query('COMMIT');

      // 统一生效分口径重算目标分（去重后逐个重算）
      for (const key of recalcTargets) {
        const [cid, tid] = key.split(':').map(Number);
        try {
          await engine.recalculateTarget(cid, tid);
        } catch (e2) {
          logger.warn(`[assessment-deduction] 批量审核后重算失败 cycle=${cid} target=${tid}: ${e2.message}`);
        }
      }

      await recordAudit(user.id, user.name, user.role, 'BATCH_APPROVE', 'DEDUCTION', null, `批量${deduction_ids.length}条`,
        { approved, skipped, total: deduction_ids.length }, '批量审核通过扣分', user.ip);

      res.json(success(camelKeys({
        approved,
        skipped,
        total: deduction_ids.length,
      }), `批量审核完成，通过${approved}条，跳过${skipped}条`));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-deduction] 批量审核失败: ${e.message}`);
    res.json(error(500, '批量审核扣分失败'));
  }
});

// ==================== 7. 扣分调整接口 ====================

// 7.1 调整扣分（生成新版本）
router.post('/deductions/adjust', authMiddleware, auditMiddleware('assessment-monthly', 'audit'), requirePermission('hse:training:audit'), async (req, res) => {
  try {
    const { deduction_id, new_score, adjustment_reason } = req.body;
    const user = getUserInfo(req);

    if (!deduction_id || new_score === undefined || !adjustment_reason) {
      return res.json(error(400, '扣分明细ID、调整后分值、调整原因不能为空'));
    }

    const deductionResult = await pool.query(
      `SELECT * FROM ${TABLES.deduction} WHERE id = $1 AND is_deleted = FALSE`,
      [deduction_id]
    );
    if (deductionResult.rows.length === 0) {
      return res.json(error(404, '扣分明细不存在'));
    }

    const deduction = deductionResult.rows[0];
    const targetResult = await pool.query(
      `SELECT status FROM ${TABLES.target} WHERE id = $1`,
      [deduction.target_id]
    );
    if (targetResult.rows[0]?.status === TARGET_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的对象不可调整'));
    }

    const oldScore = deduction.confirmed_score !== null ? deduction.confirmed_score : deduction.suggested_score;
    const newVersion = deduction.current_version + 1;
    const operatorEmployeeId = await resolveOperatorEmployeeId(user.id);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 版本链：先置同 deduction 旧记录为非当前，保证仅一条 is_current=TRUE
      await client.query(
        `UPDATE ${TABLES.adjustment} SET is_current = FALSE WHERE deduction_id = $1`,
        [deduction_id]
      );
      const adjustmentResult = await client.query(
        `INSERT INTO ${TABLES.adjustment} 
          (deduction_id, target_id, version_no, old_score, new_score, operation_type, 
           adjustment_reason, adjusted_by, adjusted_by_name, is_current)
         VALUES ($1, $2, $3, $4, $5, 'ADJUST', $6, $7, $8, TRUE)
         RETURNING *`,
        [deduction_id, deduction.target_id, newVersion, oldScore, new_score,
         adjustment_reason, operatorEmployeeId, user.name]
      );

      await client.query(
        `UPDATE ${TABLES.deduction} 
         SET current_version = $1, confirmed_score = $2, review_status = 'adjusted', updated_at = NOW()
         WHERE id = $3`,
        [newVersion, new_score, deduction_id]
      );

      await client.query('COMMIT');

      // 统一生效分口径重算目标分（approved/adjusted 用 confirmed_score）
      await engine.recalculateTarget(deduction.cycle_id, deduction.target_id);

      await recordAudit(user.id, user.name, user.role, 'REVIEW_ADJUST', 'DEDUCTION', deduction.id, deduction.deduction_item,
        { old_score: oldScore, new_score, version: newVersion, adjustment_reason }, '调整扣分值', user.ip);

      buildDetailResponse(res, adjustmentResult.rows[0], '扣分调整成功', { camelCase: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-adjustment] 调整失败: ${e.message}`);
    res.json(error(500, '扣分调整失败'));
  }
});

// 7.2 恢复自动计算（解锁）——仅本通路（kind=grid_unchecked_monthly）且已人工锁定（approved/adjusted）的明细
router.post('/deductions/:id/unlock', authMiddleware, auditMiddleware('assessment-monthly', 'audit'), requirePermission('hse:training:audit'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = getUserInfo(req);

    const deductionResult = await pool.query(
      `SELECT * FROM ${TABLES.deduction} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (deductionResult.rows.length === 0) {
      return res.json(error(404, '扣分明细不存在'));
    }
    const deduction = deductionResult.rows[0];
    if (!(deduction.review_status === REVIEW_STATUS.APPROVED || deduction.review_status === REVIEW_STATUS.ADJUSTED)) {
      return res.json(error(409, '仅已锁定（已审核/已调整）的明细可恢复自动计算'));
    }
    if (!(deduction.source_detail && deduction.source_detail.kind === 'grid_unchecked_monthly')) {
      return res.json(error(409, '仅「网格未巡查（未检查）」自动明细支持恢复自动计算'));
    }
    const targetResult = await pool.query(
      `SELECT status FROM ${TABLES.target} WHERE id = $1`,
      [deduction.target_id]
    );
    if (targetResult.rows[0]?.status === TARGET_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的对象不可解锁'));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE ${TABLES.deduction}
         SET review_status = 'pending', confirmed_score = NULL, current_version = current_version + 1, updated_at = NOW()
         WHERE id = $1`,
        [deduction.id]
      );

      const operatorEmployeeId = await resolveOperatorEmployeeId(user.id);
      // 版本链：先置同 deduction 旧记录为非当前，保证仅一条 is_current=TRUE
      await client.query(
        `UPDATE ${TABLES.adjustment} SET is_current = FALSE WHERE deduction_id = $1`,
        [deduction.id]
      );
      await client.query(
        `INSERT INTO ${TABLES.adjustment}
          (deduction_id, target_id, version_no, old_score, new_score, operation_type,
           adjustment_reason, adjusted_by, adjusted_by_name, is_current)
         VALUES ($1, $2, $3, $4, $5, 'UNLOCK', $6, $7, $8, TRUE)`,
        [deduction.id, deduction.target_id, deduction.current_version + 1,
         deduction.confirmed_score, deduction.suggested_score, '恢复自动计算',
         operatorEmployeeId, user.name]
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // 解锁后让自动值立即接管，再统一重算
    try {
      await gridUncheckedDeduction.syncGridUncheckedDeductions(deduction.cycle_id);
    } catch (e2) {
      logger.warn(`[assessment-unlock] 解锁后重扫失败 cycle=${deduction.cycle_id}: ${e2.message}`);
    }
    await engine.recalculateTarget(deduction.cycle_id, deduction.target_id);

    await recordAudit(user.id, user.name, user.role, 'REVIEW_ADJUST', 'DEDUCTION', deduction.id, deduction.deduction_item,
      { unlock: true, old_confirmed_score: deduction.confirmed_score }, '恢复自动计算（解锁）', user.ip);

    res.json(success(null, '已恢复自动计算'));
  } catch (e) {
    logger.error(`[assessment-unlock] 解锁失败: ${e.message}`);
    res.json(error(500, '恢复自动计算失败'));
  }
});

// 7.3 查询扣分调整历史
router.get('/deductions/:id/adjustments', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM ${TABLES.adjustment} WHERE deduction_id = $1 ORDER BY version_no DESC`,
      [id]
    );

    res.json(success({
      list: result.rows.map(camelKeys),
      total: result.rows.length,
    }));
  } catch (e) {
    logger.error(`[assessment-adjustment] 历史查询失败: ${e.message}`);
    res.json(error(500, '查询调整历史失败'));
  }
});

// ==================== 8. 三违责任传导接口 ====================

// 8.1 生成三违责任传导扣分
router.post('/chain/generate', authMiddleware, requirePermission('hse:training:create'), async (req, res) => {
  try {
    const { cycle_id } = req.body;
    const user = getUserInfo(req);

    if (!cycle_id) {
      return res.json(error(400, '周期ID不能为空'));
    }

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycle_id]
    );
    if (cycleResult.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }

    const cycle = cycleResult.rows[0];
    if (cycle.status === CYCLE_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的周期不可生成责任传导'));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 清除旧的传导扣分
      await client.query(
        `DELETE FROM ${TABLES.deduction}
         WHERE cycle_id = $1 AND deduction_source = $2 AND is_transmission = TRUE AND is_deleted = FALSE`,
        [cycle_id, DEDUCTION_SOURCE.CHAIN_TRANSMISSION]
      );

      // 查询周期内的三违记录（关联考核对象）
      const violationsResult = await client.query(
        `SELECT v.*, t.id as target_id, t.employee_name, t.position, t.township
         FROM ${TABLES.violation} v
         INNER JOIN ${TABLES.target} t ON v.violator_id = t.employee_id AND t.cycle_id = $1
         WHERE v.violation_date >= $2
           AND v.violation_date <= $3
           AND v.is_deleted = FALSE
           AND t.is_deleted = FALSE`,
        [cycle_id, cycle.start_time, cycle.end_time]
      );

      let generatedCount = 0;
      let skippedCount = 0;

      const metricResult = await client.query(
        `SELECT * FROM ${TABLES.metric}
         WHERE data_source = 'violation_records' AND status = 'active' AND is_deleted = FALSE
         LIMIT 1`
      );
      const metric = metricResult.rows[0];

      if (metric) {
        for (const violation of violationsResult.rows) {
          // 查询直属上级（仅一级，使用 supervisor_id = direct_manager_id）
          const supervisorResult = await client.query(
            `SELECT supervisor_id, supervisor_name, position_name as supervisor_position
             FROM v_employee_org_full
             WHERE employee_id = $1 AND relation_status = 'active'
             LIMIT 1`,
            [violation.violator_id]
          );

          if (supervisorResult.rows.length === 0 || !supervisorResult.rows[0].supervisor_id) {
            skippedCount++;
            continue;
          }

          const supervisor = supervisorResult.rows[0];

          // 直属上级必须是本周期考核对象
          const managerTargetResult = await client.query(
            `SELECT * FROM ${TABLES.target}
             WHERE employee_id = $1 AND cycle_id = $2 AND is_deleted = FALSE
             LIMIT 1`,
            [supervisor.supervisor_id, cycle_id]
          );

          if (managerTargetResult.rows.length === 0) {
            skippedCount++;
            continue;
          }

          const managerTarget = managerTargetResult.rows[0];

          // 统一扣分标准：每次三违固定扣分，传导比例100%
          const personalDeduction = VIOLATION_DEDUCTION;
          const transmissionDeduction = Math.round(personalDeduction * TRANSMISSION_RATIO * 100) / 100;

          // 1. 写入责任传导关系表（chain_level=1，仅一级）
          await client.query(
            `INSERT INTO ${TABLES.chain}
              (subordinate_id, subordinate_name, subordinate_post,
               manager_id, manager_name, manager_post, township,
               relation_type, chain_level, effective_date, is_active, is_deleted)
             SELECT $1, $2, $3, $4, $5, $6, $7, 'direct_supervisor', $8, $9, TRUE, FALSE
             WHERE NOT EXISTS (
               SELECT 1 FROM ${TABLES.chain}
               WHERE subordinate_id = $1 AND manager_id = $4 AND is_active = TRUE AND is_deleted = FALSE
             )`,
            [violation.violator_id, violation.violator_name, violation.position,
             supervisor.supervisor_id, supervisor.supervisor_name, supervisor.supervisor_position,
             violation.township || managerTarget.township,
             CHAIN_LEVEL, violation.violation_date]
          );

          // 2. 确保管理者有评分记录
          let scoreResult = await client.query(
            `SELECT id FROM ${TABLES.score}
             WHERE target_id = $1 AND metric_id = $2 AND is_deleted = FALSE
             LIMIT 1`,
            [managerTarget.id, metric.id]
          );

          let scoreId = scoreResult.rows[0]?.id;

          if (!scoreId) {
            const insertScoreResult = await client.query(
              `INSERT INTO ${TABLES.score}
                (target_id, cycle_id, metric_id, metric_code, raw_value, raw_value_desc,
                 deduction_total, original_score, final_score, is_auto, is_manual,
                 review_status, calc_time)
               VALUES ($1, $2, $3, $4, 0, '责任传导扣分', 0, $5, $5, TRUE, FALSE, 'pending', NOW())
               RETURNING id`,
              [managerTarget.id, cycle_id, metric.id, metric.metric_code, metric.base_score]
            );
            scoreId = insertScoreResult.rows[0].id;
          }

          // 3. 写入传导扣分明细
          await client.query(
            `INSERT INTO ${TABLES.deduction}
              (score_id, target_id, cycle_id, metric_id, metric_code, deduction_item,
               deduction_type, deduction_source, source_table, source_id, source_detail,
               suggested_score, review_status, violation_level, violation_date,
               violator_id, violator_name, is_transmission, remark, current_version)
             VALUES ($1, $2, $3, $4, $5, $6,
                     $7, $8, $9, $10, $11::jsonb,
                     $12, 'pending', $13, $14,
                     $15, $16, TRUE, $17, 1)`,
            [scoreId, managerTarget.id, cycle_id, metric.id, metric.metric_code,
             `责任传导-${violation.violator_name}-三违`,
             'responsibility_transmission',
             DEDUCTION_SOURCE.CHAIN_TRANSMISSION,
             'violation_records',
             violation.id,
             JSON.stringify({
               violation_id: violation.id,
               violation_no: violation.no,
               violation_type: violation.violation_type,
               violation_level: violation.violation_level,
               subordinate_id: violation.violator_id,
               subordinate_name: violation.violator_name,
               manager_id: supervisor.supervisor_id,
               manager_name: supervisor.supervisor_name,
               personal_deduction: personalDeduction,
               transmission_ratio: TRANSMISSION_RATIO,
               chain_level: CHAIN_LEVEL,
             }),
             transmissionDeduction,
             violation.violation_level,
             violation.violation_date,
             violation.violator_id,
             violation.violator_name,
             `责任传导：下属${violation.violator_name}三违，直属上级传导100%责任（chain_level=1）`]
          );

          generatedCount++;
        }
      }

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'GENERATE_CHAIN', 'DEDUCTION', cycle_id, cycle.cycle_code,
        { generated: generatedCount, skipped: skippedCount }, '生成三违责任传导扣分', user.ip);

      res.json(success(camelKeys({
        cycle_id,
        generated: generatedCount,
        skipped: skippedCount,
      }), `责任传导扣分项生成完成，共生成${generatedCount}条`));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-chain] 生成失败: ${e.message}`);
    res.json(error(500, '生成三违责任传导失败'));
  }
});

// 8.2 责任链关系列表
router.get('/chain/relations', authMiddleware, async (req, res) => {
  try {
    const { township, manager_id, subordinate_id, is_active, keyword } = req.query;
    const { page, pageSize, offset } = getPagination(req.query);
    const { sortBy, sortOrder } = getSort(req.query, 'created_at', 'desc');

    const conditions = ['is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    if (township) {
      conditions.push(`township = $${idx++}`);
      params.push(township);
    }
    if (manager_id) {
      conditions.push(`manager_id = $${idx++}`);
      params.push(manager_id);
    }
    if (subordinate_id) {
      conditions.push(`subordinate_id = $${idx++}`);
      params.push(subordinate_id);
    }
    if (is_active !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      params.push(is_active === 'true' || is_active === true);
    }
    if (keyword) {
      conditions.push(`(subordinate_name LIKE $${idx} OR manager_name LIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT count(*) as cnt FROM ${TABLES.chain} ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].cnt);

    const result = await pool.query(
      `SELECT * FROM ${TABLES.chain} ${where} ORDER BY ${sortBy} ${sortOrder} LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    );

    buildListResponse(res, result.rows, total, page, pageSize, '查询成功', { camelCase: true });
  } catch (e) {
    logger.error(`[assessment-chain] 关系列表查询失败: ${e.message}`);
    res.json(error(500, '查询责任链关系失败'));
  }
});

// ==================== 9. 冻结管理接口 ====================

// 9.1 冻结周期
router.post('/freeze/cycle/:id', authMiddleware, auditMiddleware('assessment-monthly', 'freeze'), requirePermission('hse:training:audit'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = getUserInfo(req);

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (cycleResult.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }

    const cycle = cycleResult.rows[0];
    if (cycle.status === CYCLE_STATUS.FROZEN) {
      return res.json(error(409, '该周期已冻结'));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const pendingResult = await client.query(
        `SELECT count(*) as cnt FROM ${TABLES.target} 
         WHERE cycle_id = $1 AND is_deleted = FALSE 
           AND review_status != 'approved'`,
        [id]
      );
      if (parseInt(pendingResult.rows[0].cnt) > 0) {
        await client.query('ROLLBACK');
        return res.json(error(409, `还有${pendingResult.rows[0].cnt}个对象未完成审核，不可冻结`));
      }

      // 1. 先计算排名（此时对象还未冻结，可以更新）
      const townshipsResult = await client.query(
        `SELECT DISTINCT township FROM ${TABLES.target} 
         WHERE cycle_id = $1 AND is_deleted = FALSE AND township IS NOT NULL`,
        [id]
      );

      for (const row of townshipsResult.rows) {
        const township = row.township;
        await client.query(
          `UPDATE ${TABLES.target} t
           SET rank_township = sub.rn
           FROM (
             SELECT id, ROW_NUMBER() OVER (ORDER BY score_total DESC, id ASC) as rn
             FROM ${TABLES.target}
             WHERE cycle_id = $1 AND is_deleted = FALSE AND township = $2
           ) sub
           WHERE t.id = sub.id AND t.cycle_id = $1`,
          [id, township]
        );
      }

      await client.query(
        `UPDATE ${TABLES.target} t
         SET rank_all = sub.rn
         FROM (
           SELECT id, ROW_NUMBER() OVER (ORDER BY score_total DESC, id ASC) as rn
           FROM ${TABLES.target}
           WHERE cycle_id = $1 AND is_deleted = FALSE
         ) sub
         WHERE t.id = sub.id AND t.cycle_id = $1`,
        [id]
      );

      // 2. 再设置冻结状态（排名完成后才冻结，避免触发器阻止排名更新）
      await client.query(
        `UPDATE ${TABLES.cycle} 
         SET status = 'frozen', frozen_by = $1, frozen_by_name = $2, frozen_at = NOW()
         WHERE id = $3`,
        [user.id, user.name, id]
      );

      await client.query(
        `UPDATE ${TABLES.target} SET status = 'frozen' 
         WHERE cycle_id = $1 AND is_deleted = FALSE`,
        [id]
      );

      const frozenResult = await client.query(
        `SELECT count(*) as cnt FROM ${TABLES.target} 
         WHERE cycle_id = $1 AND is_deleted = FALSE AND status = 'frozen'`,
        [id]
      );

      await client.query(
        `UPDATE ${TABLES.cycle} SET frozen_count = $1 WHERE id = $2`,
        [parseInt(frozenResult.rows[0].cnt), id]
      );

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'FREEZE', 'CYCLE', parseInt(id), cycle.cycle_code,
        { frozen_count: parseInt(frozenResult.rows[0].cnt) }, '冻结考核周期', user.ip);

      res.json(success(camelKeys({
        cycle_id: parseInt(id),
        status: CYCLE_STATUS.FROZEN,
        frozen_count: parseInt(frozenResult.rows[0].cnt),
      }), '考核周期已冻结'));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-freeze] 冻结失败: ${e.message}`);
    res.json(error(500, '冻结考核周期失败'));
  }
});

// 9.2 解冻周期
router.post('/freeze/unfreeze', authMiddleware, requirePermission('hse:training:audit'), async (req, res) => {
  try {
    const { cycle_id, unfreeze_reason } = req.body;
    const user = getUserInfo(req);

    if (!cycle_id || !unfreeze_reason) {
      return res.json(error(400, '周期ID和解冻原因不能为空'));
    }

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycle_id]
    );
    if (cycleResult.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }

    const cycle = cycleResult.rows[0];
    if (cycle.status !== CYCLE_STATUS.FROZEN) {
      return res.json(error(409, '该周期未冻结，不可解冻'));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE ${TABLES.cycle} 
         SET status = 'reviewed', frozen_by = NULL, frozen_by_name = NULL, frozen_at = NULL
         WHERE id = $1`,
        [cycle_id]
      );

      await client.query(
        `UPDATE ${TABLES.target} SET status = 'scored' 
         WHERE cycle_id = $1 AND is_deleted = FALSE AND status = 'frozen'`,
        [cycle_id]
      );

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'UNFREEZE', 'CYCLE', cycle_id, cycle.cycle_code,
        null, unfreeze_reason, user.ip);

      res.json(success(camelKeys({
        cycle_id,
        status: CYCLE_STATUS.REVIEWED,
      }), '考核周期已解冻'));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-freeze] 解冻失败: ${e.message}`);
    res.json(error(500, '解冻考核周期失败'));
  }
});

// ==================== 10. 结果查询接口 ====================

// 10.1 考核结果列表（分页+筛选+排序）
router.get('/results', authMiddleware, async (req, res) => {
  try {
    const { cycle_id, township, position, grade, status, keyword } = req.query;
    const { page, pageSize, offset } = getPagination(req.query);
    const { sortBy, sortOrder } = getSort(req.query, 'score_total', 'desc');

    const conditions = ['t.is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    if (cycle_id) {
      conditions.push(`t.cycle_id = $${idx++}`);
      params.push(cycle_id);
    }
    if (township) {
      conditions.push(`t.township = $${idx++}`);
      params.push(township);
    }
    if (position) {
      conditions.push(`t.position = $${idx++}`);
      params.push(position);
    }
    if (grade) {
      conditions.push(`t.grade = $${idx++}`);
      params.push(grade);
    }
    if (status) {
      conditions.push(`t.status = $${idx++}`);
      params.push(status);
    }
    if (keyword) {
      conditions.push(`(t.employee_name LIKE $${idx} OR t.employee_code LIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT count(*) as cnt FROM ${TABLES.target} t ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].cnt);

    const result = await pool.query(
      `SELECT t.id, t.cycle_id, t.employee_id, t.employee_code, t.employee_name, 
              t.position, t.township, t.department,
              t.score_auto, t.score_manual, t.score_bonus, t.score_total, 
              t.grade, t.rank_township, t.rank_all,
              t.status, t.review_status, t.score_version
       FROM ${TABLES.target} t ${where} 
       ORDER BY t.${sortBy} ${sortOrder} 
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    );

    buildListResponse(res, result.rows, total, page, pageSize, '查询成功', { camelCase: true });
  } catch (e) {
    logger.error(`[assessment-result] 列表查询失败: ${e.message}`);
    res.json(error(500, '查询考核结果失败'));
  }
});

// 10.2 考核结果详情
router.get('/results/:targetId', authMiddleware, async (req, res) => {
  try {
    const { targetId } = req.params;

    const targetResult = await pool.query(
      `SELECT * FROM ${TABLES.target} WHERE id = $1 AND is_deleted = FALSE`,
      [targetId]
    );
    if (targetResult.rows.length === 0) {
      return res.json(error(404, '考核对象不存在'));
    }

    const scoresResult = await pool.query(
      `SELECT s.*, m.metric_name, m.category, m.base_score, m.metric_type
       FROM ${TABLES.score} s
       JOIN ${TABLES.metric} m ON s.metric_id = m.id
       WHERE s.target_id = $1 AND s.is_deleted = FALSE
       ORDER BY m.sort_order ASC`,
      [targetId]
    );

    const deductionsResult = await pool.query(
      `SELECT d.*, m.metric_name, m.category
       FROM ${TABLES.deduction} d
       LEFT JOIN ${TABLES.metric} m ON d.metric_id = m.id
       WHERE d.target_id = $1 AND d.is_deleted = FALSE 
       ORDER BY d.created_at DESC`,
      [targetId]
    );

    const approvedDeduction = deductionsResult.rows.filter(d => 
      d.review_status === REVIEW_STATUS.APPROVED || d.review_status === REVIEW_STATUS.ADJUSTED
    );
    const totalApprovedDeduction = approvedDeduction.reduce((sum, d) => {
      // 生效分：approved/adjusted 用 confirmed_score（0 分豁免也生效）
      const eff = d.confirmed_score != null ? Number(d.confirmed_score) : (Number(d.suggested_score) || 0);
      return sum + eff;
    }, 0);

    res.json(success({
      target: camelKeys(targetResult.rows[0]),
      scores: scoresResult.rows.map(camelKeys),
      deductions: deductionsResult.rows.map(camelKeys),
      summary: camelKeys({
        total_deductions: deductionsResult.rows.length,
        approved_deductions: approvedDeduction.length,
        total_approved_deduction: Math.round(totalApprovedDeduction * 100) / 100,
      })
    }));
  } catch (e) {
    logger.error(`[assessment-result] 详情查询失败: ${e.message}`);
    res.json(error(500, '查询考核结果详情失败'));
  }
});

// 10.3 排名查询
router.get('/results/ranking', authMiddleware, async (req, res) => {
  try {
    const { cycle_id, township, scope = 'all', limit = 10 } = req.query;

    if (!cycle_id) {
      return res.json(error(400, '周期ID不能为空'));
    }

    let query = `
      SELECT id, employee_id, employee_code, employee_name, position,
             township, department, score_total, grade,
             rank_all, rank_township
      FROM ${TABLES.target}
      WHERE cycle_id = $1 AND is_deleted = FALSE AND score_total IS NOT NULL
    `;
    const params = [cycle_id];
    let idx = 2;

    if (scope === 'township' && township) {
      query += ` AND township = $${idx++}`;
      params.push(township);
      query += ` ORDER BY rank_township ASC`;
    } else {
      query += ` ORDER BY rank_all ASC`;
    }

    query += ` LIMIT $${idx}`;
    params.push(Math.min(100, parseInt(limit) || 10));

    const result = await pool.query(query, params);

    res.json(success({
      list: result.rows.map(camelKeys),
      total: result.rows.length,
      scope,
    }));
  } catch (e) {
    logger.error(`[assessment-result] 排名查询失败: ${e.message}`);
    res.json(error(500, '查询排名失败'));
  }
});

// ==================== 11. Excel导入导出接口 ====================

// 11.1 导出考核结果
router.get('/export/results/:cycleId', authMiddleware, requirePermission('hse:training:export'), async (req, res) => {
  try {
    const { cycleId } = req.params;

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycleId]
    );
    if (cycleResult.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }

    const results = await pool.query(
      `SELECT employee_name, employee_code, position, township, department,
              score_auto, score_manual, score_bonus, score_total, grade, 
              rank_township, rank_all, status, review_status
       FROM ${TABLES.target}
       WHERE cycle_id = $1 AND is_deleted = FALSE
       ORDER BY rank_all ASC, score_total DESC`,
      [cycleId]
    );

    const gradeStats = await pool.query(
      `SELECT grade, count(*) as count
       FROM ${TABLES.target}
       WHERE cycle_id = $1 AND is_deleted = FALSE AND grade IS NOT NULL
       GROUP BY grade
       ORDER BY grade`,
      [cycleId]
    );

    res.json(success({
      cycle: camelKeys(cycleResult.rows[0]),
      total: results.rows.length,
      data: results.rows.map(camelKeys),
      grade_stats: gradeStats.rows.map(camelKeys),
      columns: [
        { key: 'employee_name', label: '姓名' },
        { key: 'employee_code', label: '工号' },
        { key: 'position', label: '岗位' },
        { key: 'township', label: '乡镇' },
        { key: 'department', label: '部门' },
        { key: 'score_auto', label: '自动分' },
        { key: 'score_manual', label: '人工分' },
        { key: 'score_bonus', label: '加分' },
        { key: 'score_total', label: '总分' },
        { key: 'grade', label: '等级' },
        { key: 'rank_township', label: '乡镇排名' },
        { key: 'rank_all', label: '全员排名' },
        { key: 'status', label: '状态' },
      ],
    }, '导出数据获取成功'));
  } catch (e) {
    logger.error(`[assessment-export] 导出失败: ${e.message}`);
    res.json(error(500, '导出考核结果失败'));
  }
});

// 11.1.1 考核对象扣分明细（自动评分「查看」用；细化到规则名称，归属类别）
// GET /api/hse/assessment-monthly/cycles/:cycleId/targets/:targetId/deductions
router.get('/cycles/:cycleId/targets/:targetId/deductions', authMiddleware, async (req, res) => {
  try {
    const { cycleId, targetId } = req.params;
    const r = await pool.query(
      `SELECT d.id, d.metric_code, d.deduction_item, d.deduction_type, d.deduction_source,
              d.source_table, d.source_detail, d.suggested_score, d.confirmed_score,
              d.review_status, d.violation_date, d.created_at,
              t.employee_id, t.employee_name, t.position, t.township
       FROM ${TABLES.deduction} d
       JOIN ${TABLES.target} t ON t.id = d.target_id AND t.is_deleted = FALSE
       WHERE d.cycle_id = $1 AND d.target_id = $2 AND d.is_deleted = FALSE
       ORDER BY d.id DESC`,
      [cycleId, targetId]
    );
    const resolved = await resolveRuleForDeductionRows(r.rows.map((x) => ({ ...x })));
    const list = resolved.map(({ deduction: d, ruleName, category }, i) => ({
      id: d.id,
      deductionItem: d.deduction_item,
      deductionType: d.deduction_type,
      deductionSource: d.deduction_source,
      category: category || null,
      ruleName: ruleName || null,
      suggestedScore: Number(d.suggested_score),
      confirmedScore: d.confirmed_score == null ? null : Number(d.confirmed_score),
      reviewStatus: d.review_status,
      violationDate: d.violation_date || null,
      createdAt: d.created_at || null,
      sourceTable: d.source_table || null,
      summary: (d.source_detail && d.source_detail.summary) || null,
    }));
    const gridLevelRow = await pool.query(
      `SELECT ga.grid_level FROM grid_areas ga
       WHERE ga.personnel_id = $1 AND COALESCE(ga.is_deleted, FALSE) = FALSE
         AND COALESCE(ga.grid_level, '') <> '' ORDER BY ga.id LIMIT 1`,
      [(r.rows[0] || {}).employee_id]
    );
    res.json(success({
      cycleId: Number(cycleId),
      targetId: Number(targetId),
      employeeName: (r.rows[0] || {}).employee_name || null,
      gridLevel: gridLevelRow.rows.length ? gridLevelRow.rows[0].grid_level : null,
      list,
    }, '查询成功'));
  } catch (e) {
    logger.error(`[assessment-target-deductions] 查询失败: ${e.message}`);
    res.json(error(500, '查询扣分明细失败'));
  }
});

// 11.1.2 自动评分导出 xlsx（序号/姓名/岗位/乡镇/网格级别/扣分类型/扣分规则名称/扣分）
// GET /api/hse/assessment-monthly/cycles/:cycleId/export-scoring
router.get('/cycles/:cycleId/export-scoring', authMiddleware, requirePermission('hse:training:export'), async (req, res) => {
  try {
    const { cycleId } = req.params;
    const cycleResult = await pool.query(
      `SELECT id, cycle_code, cycle_name FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycleId]
    );
    if (cycleResult.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }

    // 仅导出二级/三级网格长（与自动评分列表口径一致），并带出每人对全部扣分明细
    const targets = await pool.query(
      `SELECT t.id, t.employee_id, t.employee_name, t.position, t.township, t.score_total,
              (SELECT ga.grid_level FROM grid_areas ga
               WHERE ga.personnel_id = t.employee_id AND COALESCE(ga.is_deleted, FALSE) = FALSE
                 AND COALESCE(ga.grid_level, '') <> '' ORDER BY ga.id LIMIT 1) AS grid_level
       FROM ${TABLES.target} t
       WHERE t.cycle_id = $1 AND t.is_deleted = FALSE
         AND t.employee_id IN (
              SELECT ga.personnel_id FROM grid_areas ga
              WHERE ga.personnel_id IS NOT NULL AND COALESCE(ga.is_deleted, FALSE) = FALSE
                AND ga.grid_level IN ('二级网格长','三级网格长')
            )
       ORDER BY t.score_total DESC NULLS LAST, t.employee_name`,
      [cycleId]
    );
    const tMap = {};
    for (const t of targets.rows) tMap[t.id] = t;

    const ded = targets.rows.length
      ? await pool.query(
          `SELECT id, target_id, deduction_item, source_detail, suggested_score, confirmed_score, review_status
           FROM hse_assessment_deduction
           WHERE cycle_id = $1 AND target_id = ANY($2::bigint[]) AND is_deleted = FALSE
             AND review_status <> 'rejected'`,
          [cycleId, targets.rows.map((t) => t.id)]
        )
      : { rows: [] };
    const resolved = await resolveRuleForDeductionRows(ded.rows);

    // 一条扣分一条记录；无扣分对象也输出一行（扣分类型/规则名为空）
    const aoa = [['序号', '姓名', '岗位', '乡镇', '网格级别', '扣分类型', '扣分规则名称', '扣分']];
    const pushRow = (no, t, c, rName, score) => {
      aoa.push([no, t.employee_name, t.position, t.township, t.grid_level || '', c || '', rName || '', score == null ? '' : Number(score)]);
    };
    let no = 0;
    for (const t of targets.rows) {
      const rows = resolved.filter((x) => x.deduction.target_id === t.id);
      if (!rows.length) {
        no += 1;
        pushRow(no, t, null, null, null);
        continue;
      }
      for (const { deduction: d, ruleName, category } of rows) {
        no += 1;
        // 生效分：approved/adjusted 用 confirmed_score，pending 用 suggested_score
        const eff = (d.review_status === REVIEW_STATUS.APPROVED || d.review_status === REVIEW_STATUS.ADJUSTED)
          ? (d.confirmed_score != null ? Number(d.confirmed_score) : Number(d.suggested_score))
          : Number(d.suggested_score);
        pushRow(no, t, d.deduction_type, ruleName, eff);
      }
    }

    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // 表格内容居中、简易美观：设置列宽与居中样式
    ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 8 }];
    for (let c = 0; c < 8; c++) {
      const col = XLSX.utils.encode_col(c);
      ws[`${col}1`].s = { font: { bold: true }, alignment: { horizontal: 'center' } };
    }
    for (let r = 1; r < aoa.length; r++) {
      for (let c = 0; c < 8; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (!ws[ref]) continue;
        ws[ref].s = { alignment: { horizontal: 'center' } };
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, '自动评分扣分明细');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const cycle = cycleResult.rows[0];
    const fname = encodeURIComponent(`自动评分扣分明细_${cycle.cycle_code || 'cycle'}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fname}`);
    res.send(Buffer.from(buf));
  } catch (e) {
    logger.error(`[assessment-scoring-export] 导出失败: ${e.message}`);
    if (!res.headersSent) {
      res.json(error(500, '导出自动评分扣分明细失败'));
    }
  }
});

// 11.2 导入扣分明细
router.post('/import/deductions', authMiddleware, requirePermission('hse:training:create'), async (req, res) => {
  try {
    const { cycle_id, items } = req.body;
    const user = getUserInfo(req);

    if (!cycle_id || !items || !Array.isArray(items)) {
      return res.json(error(400, '周期ID和扣分明细列表不能为空'));
    }

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycle_id]
    );
    if (cycleResult.rows.length === 0) {
      return res.json(error(404, '考核周期不存在'));
    }
    if (cycleResult.rows[0].status === CYCLE_STATUS.FROZEN) {
      return res.json(error(409, '已冻结的周期不可导入扣分'));
    }

    const metricMap = {};
    const metricsResult = await pool.query(
      `SELECT id, metric_code, metric_name FROM ${TABLES.metric} WHERE status = 'active' AND is_deleted = FALSE`
    );
    for (const m of metricsResult.rows) {
      metricMap[m.metric_code] = m;
      metricMap[m.metric_name] = m;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let imported = 0;
      let failed = 0;
      const errors = [];
      const capWarnings = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          if (!item.employee_code && !item.employee_name) {
            failed++;
            errors.push({ row: i + 1, error: '员工工号或姓名不能为空' });
            continue;
          }
          if (!item.deduction_item || !item.suggested_score) {
            failed++;
            errors.push({ row: i + 1, error: '扣分项名称和建议扣分值不能为空' });
            continue;
          }

          let targetQuery = `SELECT id, employee_id, position FROM ${TABLES.target} WHERE cycle_id = $1 AND is_deleted = FALSE`;
          let targetParams = [cycle_id];
          let paramIdx = 2;

          if (item.employee_code) {
            targetQuery += ` AND employee_code = $${paramIdx++}`;
            targetParams.push(item.employee_code);
          }
          if (item.employee_name) {
            targetQuery += ` AND employee_name = $${paramIdx++}`;
            targetParams.push(item.employee_name);
          }

          const targetResult = await client.query(targetQuery + ' LIMIT 1', targetParams);
          if (targetResult.rows.length === 0) {
            failed++;
            errors.push({ row: i + 1, error: '未找到对应的考核对象' });
            continue;
          }
          const target = targetResult.rows[0];

          if (target.status === TARGET_STATUS.FROZEN) {
            failed++;
            errors.push({ row: i + 1, error: '考核对象已冻结，不可导入' });
            continue;
          }

          let metricId = null;
          let metricCode = null;
          if (item.metric_code && metricMap[item.metric_code]) {
            metricId = metricMap[item.metric_code].id;
            metricCode = item.metric_code;
          } else if (item.metric_name && metricMap[item.metric_name]) {
            metricId = metricMap[item.metric_name].id;
            metricCode = metricMap[item.metric_name].metric_code;
          } else {
            const defaultMetricResult = await client.query(
              `SELECT id, metric_code FROM ${TABLES.metric} 
               WHERE status = 'active' AND is_deleted = FALSE
               ORDER BY id ASC LIMIT 1`
            );
            if (defaultMetricResult.rows.length > 0) {
              metricId = defaultMetricResult.rows[0].id;
              metricCode = defaultMetricResult.rows[0].metric_code;
            }
          }

          if (!metricId) {
            failed++;
            errors.push({ row: i + 1, error: '未找到有效的考核指标' });
            continue;
          }

          // 评分联动：考核项命中考核标准配置（按岗位+考核项）时，以配置分值为准
          // （考核对象 position 为中文名，标准表 position 为编码，故同时匹配 position 与 position_name）
          let finalScore = item.suggested_score;
          if (item.deduction_item) {
            const stdResult = await client.query(
              `SELECT deduction_score, rule_type FROM ${TABLES.standard}
               WHERE (position = $1 OR position_name = $1) AND item_name = $2 AND is_deleted = FALSE AND is_active = TRUE
               ORDER BY id DESC LIMIT 1`,
              [target.position, item.deduction_item]
            );
            if (stdResult.rows.length > 0) {
              const std = stdResult.rows[0];
              if (std.rule_type === 'deduction' && std.deduction_score != null) {
                finalScore = Math.abs(Number(std.deduction_score));
              } else if (std.rule_type === 'veto' && std.deduction_score != null) {
                finalScore = Math.abs(Number(std.deduction_score));
              }
            }
          }

          let scoreResult = await client.query(
            `SELECT id FROM ${TABLES.score} 
             WHERE target_id = $1 AND metric_id = $2 AND is_deleted = FALSE
             LIMIT 1`,
            [target.id, metricId]
          );

          let scoreId = scoreResult.rows[0]?.id;
          if (!scoreId) {
            const baseScore = metricsResult.rows.find(m => m.id === metricId)?.base_score || 100;
            const insertScoreResult = await client.query(
              `INSERT INTO ${TABLES.score} 
                (target_id, cycle_id, metric_id, metric_code, raw_value, raw_value_desc,
                 deduction_total, original_score, final_score, is_auto, is_manual,
                 review_status, calc_time)
               VALUES ($1, $2, $3, $4, 0, '导入扣分', 0, $5, $5, FALSE, TRUE, 'pending', NOW())
               RETURNING id`,
              [target.id, cycle_id, metricId, metricCode, baseScore]
            );
            scoreId = insertScoreResult.rows[0].id;
          }

          const ins = await client.query(
            `INSERT INTO ${TABLES.deduction} 
              (score_id, target_id, cycle_id, metric_id, metric_code, deduction_item,
               deduction_type, deduction_source, suggested_score, review_status,
               violation_level, violation_date, violator_id, violator_name,
               is_transmission, remark, current_version)
             VALUES ($1, $2, $3, $4, $5, $6,
                     $7, $8, $9, 'pending',
                     $10, $11, $12, $13,
                     FALSE, $14, 1)
             RETURNING id`,
            [scoreId, target.id, cycle_id, metricId, metricCode,
             item.deduction_item,
             item.deduction_type || 'import',
             DEDUCTION_SOURCE.IMPORT,
             finalScore,
             item.violation_level || null,
             item.violation_date || null,
             item.violator_id || null,
             item.violator_name || null,
             item.remark || `导入批次: ${new Date().toISOString()}`]
          );

          // 任务A：人工扣分上限提示（导入场景，纯 advisory）——事务内用 client 读未提交行，
          // 排除刚插入的本行（RETURNING id），同批其他行计入合计，收集 capWarnings 返回前端提示。
          try {
            const rowWarning = await categoryCap.computeManualCapWarning({
              cycleId: cycle_id,
              targetId: target.id,
              deductionItem: item.deduction_item,
              sourceDetail: null,
              adding: finalScore,
              excludeId: ins.rows[0].id,
              role: target.position === '管理员' ? 'admin' : 'manager',
              executor: client,
            });
            if (rowWarning) {
              capWarnings.push({ row: i + 1, employee: item.employee_code || item.employee_name, ...rowWarning });
            }
          } catch (warnErr) {
            logger.warn(`[assessment-import] 上限提示计算失败(忽略): ${warnErr.message}`);
          }

          imported++;
        } catch (e) {
          failed++;
          errors.push({ row: i + 1, error: e.message });
        }
      }

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'IMPORT', 'DEDUCTION', cycle_id, `周期${cycle_id}`,
        { imported, failed, total: items.length, errors }, '导入扣分明细', user.ip);

      res.json(success(camelKeys({
        imported,
        failed,
        total: items.length,
        errors: errors.slice(0, 50),
        capWarnings,
      }), `导入完成，成功${imported}条，失败${failed}条`));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-import] 导入失败: ${e.message}`);
    res.json(error(500, '导入扣分明细失败'));
  }
});

// ==================== 12. 考核标准配置接口 ====================

// 12.1 查询考核标准列表（按岗位）
router.get('/standards', authMiddleware, async (req, res) => {
  try {
    const { position, keyword, rule_type } = req.query;
    const conditions = ['s.is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    if (position) {
      conditions.push(`s.position = $${idx++}`);
      params.push(position);
    }
    if (rule_type) {
      conditions.push(`s.rule_type = $${idx++}`);
      params.push(rule_type);
    }
    if (keyword) {
      conditions.push(`(s.item_name LIKE $${idx} OR s.deduction_rule LIKE $${idx} OR s.category LIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await pool.query(
      `SELECT s.* FROM ${TABLES.standard} s ${where} ORDER BY s.position ASC, s.sort_order ASC, s.id ASC`,
      params
    );

    // 按岗位分组返回
    const grouped = {};
    for (const row of result.rows) {
      const key = row.position;
      if (!grouped[key]) {
        grouped[key] = { position: row.position, positionName: row.position_name, items: [] };
      }
      grouped[key].items.push(camelKeys(row));
    }

    res.json(success({
      positions: Object.values(grouped),
      total: result.rows.length,
    }, '查询成功'));
  } catch (e) {
    logger.error(`[assessment-standard] 列表查询失败: ${e.message}`);
    res.json(error(500, '查询考核标准失败'));
  }
});

// 12.2 更新考核标准（可编辑扣分分值/标准/启用状态）
router.put('/standards/:id', authMiddleware, requirePermission('hse:training:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { item_name, deduction_rule, deduction_score, rule_type, remark, is_active } = req.body;
    const user = getUserInfo(req);

    const existResult = await pool.query(
      `SELECT * FROM ${TABLES.standard} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (existResult.rows.length === 0) {
      return res.json(error(404, '考核标准不存在'));
    }

    const fields = [];
    const params = [];
    let idx = 1;
    if (item_name !== undefined) { fields.push(`item_name = $${idx++}`); params.push(item_name); }
    if (deduction_rule !== undefined) { fields.push(`deduction_rule = $${idx++}`); params.push(deduction_rule); }
    if (deduction_score !== undefined) { fields.push(`deduction_score = $${idx++}`); params.push(deduction_score); }
    if (rule_type !== undefined) { fields.push(`rule_type = $${idx++}`); params.push(rule_type); }
    if (remark !== undefined) { fields.push(`remark = $${idx++}`); params.push(remark); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); params.push(is_active); }

    if (fields.length === 0) {
      return res.json(error(400, '没有需要更新的字段'));
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE ${TABLES.standard} SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await recordAudit(user.id, user.name, user.role, 'UPDATE', 'STANDARD', result.rows[0].id,
      result.rows[0].item_name, { deduction_score: result.rows[0].deduction_score }, '更新考核标准', user.ip);

    buildDetailResponse(res, result.rows[0], '考核标准更新成功', { camelCase: true });
  } catch (e) {
    logger.error(`[assessment-standard] 更新失败: ${e.message}`);
    res.json(error(500, '更新考核标准失败'));
  }
});

// ==================== 13. 健康检查接口 ====================

router.get('/health', optionalAuthMiddleware, async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT 1 as ok');
    res.json(success({
      status: 'ok',
      module: 'assessment-monthly',
      version: '2.0.0',
      database: dbResult.rows[0].ok === 1 ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      features: [
        'cycle_management',
        'target_management',
        'metric_management',
        'scoring_engine',
        'deduction_management',
        'deduction_review',
        'deduction_adjustment',
        'responsibility_chain',
        'freeze_management',
        'result_query',
        'export_import',
      ]
    }));
  } catch (e) {
    res.json(error(500, '服务不可用', { error: e.message }));
  }
});

module.exports = router;
