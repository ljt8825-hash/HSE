/**
 * AI-07 Analysis Task Service —— HSE AI 分析任务编排（任务模型/状态机/幂等/CRUD）
 *
 * 职责边界（任务书 §16）：任务层只负责 调度/状态/生命周期/错误/结果保存；
 * 分析本身完全复用 AI-06 analysisService（不复制 statistics/normalizer/RAG/structured parser/Evidence）。
 *
 * 状态机（任务书 §6）：
 *   PENDING → RUNNING → COMPLETED
 *   PENDING → RUNNING → FAILED
 *   PENDING → CANCELLED
 *   FAILED → RETRYING → RUNNING（重试走显式转换，禁止直接改状态）
 *   禁止 COMPLETED→RUNNING / FAILED→COMPLETED / CANCELLED→RUNNING
 *
 * 幂等（任务书 §12/§31）：request_hash = sha256(规范化请求)。
 *   同 hash 存在 PENDING/RUNNING → 复用已有任务（reused=true），防止连续点击瞬间启动多个相同 AI 任务。
 *
 * 任务表只保存 请求参数/统计快照/分析结果/Evidence/状态/错误（任务书 §9），
 * 业务数据库仍是唯一事实来源；API 层禁止 records 注入（防业务数据入库）。
 */

const crypto = require('crypto');
const { pool } = require('../../../config/db');
const { AiError } = require('../errors');
const { SUPPORTED_ANALYSIS_TYPES } = require('../analysis/analysisService');

const TASK_STATUS = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  RETRYING: 'RETRYING',
});

/** 允许的状态转换表（PENDING→RUNNING 由 worker 领取完成；PENDING→FAILED 保留给创建时校验失败的场景） */
const ALLOWED_TRANSITIONS = Object.freeze({
  PENDING: ['RUNNING', 'CANCELLED', 'FAILED'],
  RUNNING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['RETRYING'],
  CANCELLED: [],
  RETRYING: ['RUNNING', 'FAILED'],
});

const TASK_TYPE = Object.freeze({
  DATA_ANALYSIS: 'DATA_ANALYSIS',
});

/** AI-07 任务层错误码（沿用统一 AI 错误模型 errors.js 的 AiError） */
const TASK_ERROR = Object.freeze({
  AI_TASK_NOT_FOUND: 'AI_TASK_NOT_FOUND',
  AI_TASK_INVALID_STATE: 'AI_TASK_INVALID_STATE',
});

const TASK_TYPE_SET = new Set(Object.values(TASK_TYPE));

/** 状态机：校验状态转换是否合法 */
function canTransition(from, to) {
  return Boolean(ALLOWED_TRANSITIONS[from] && ALLOWED_TRANSITIONS[from].includes(to));
}

/** 状态机：执行转换校验（非法抛 AI_TASK_INVALID_STATE） */
function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new AiError(TASK_ERROR.AI_TASK_INVALID_STATE, `非法任务状态转换: ${from} → ${to}`);
  }
}

/**
 * 规范化 + 校验创建请求
 * 返回可安全持久化的请求快照（不含 records —— 任务表禁止业务记录）
 */
function validateCreateRequest(req = {}) {
  if (!req || typeof req !== 'object') throw new AiError('AI_INVALID_REQUEST', '请求体必须是 JSON 对象');

  const taskType = String(req.taskType || TASK_TYPE.DATA_ANALYSIS).toUpperCase();
  if (!TASK_TYPE_SET.has(taskType)) {
    throw new AiError('AI_INVALID_REQUEST', `不支持的 taskType: ${req.taskType}（当前仅支持 ${Object.values(TASK_TYPE).join(', ')}）`);
  }

  const domain = String(req.domain || '').trim();
  if (!domain) throw new AiError('AI_INVALID_REQUEST', '缺少 domain（如 hazard）');

  const timeRange = req.timeRange || null;
  if (timeRange != null) {
    if (typeof timeRange !== 'object' || Array.isArray(timeRange)) {
      throw new AiError('AI_INVALID_REQUEST', 'timeRange 必须是 { start, end } 对象');
    }
    const { start, end } = timeRange;
    if (start && isNaN(Date.parse(start))) throw new AiError('AI_INVALID_REQUEST', `timeRange.start 不是合法日期: ${start}`);
    if (end && isNaN(Date.parse(end))) throw new AiError('AI_INVALID_REQUEST', `timeRange.end 不是合法日期: ${end}`);
    if (start && end && new Date(start) > new Date(end)) {
      throw new AiError('AI_INVALID_REQUEST', `timeRange.start 不能晚于 end: ${start} > ${end}`);
    }
  }

  const filters = req.filters || {};
  if (typeof filters !== 'object' || Array.isArray(filters)) throw new AiError('AI_INVALID_REQUEST', 'filters 必须是对象');

  const analysisTypes = Array.isArray(req.analysisTypes) ? req.analysisTypes.slice() : [];
  const bad = analysisTypes.filter((t) => !SUPPORTED_ANALYSIS_TYPES.includes(t));
  if (bad.length > 0) {
    throw new AiError('AI_INVALID_REQUEST', `不支持的 analysisTypes: ${bad.join(', ')}（支持: ${SUPPORTED_ANALYSIS_TYPES.join(', ')}）`);
  }

  if (req.records != null) {
    throw new AiError('AI_INVALID_REQUEST', '任务接口禁止 records 注入（业务数据库为唯一事实来源）');
  }

  const useRag = Boolean(req.useRag);
  const provider = req.provider ? String(req.provider).trim() || null : null;
  const model = req.model ? String(req.model).trim() || null : null;
  const limit = req.limit == null ? null : Math.min(Math.max(parseInt(req.limit, 10) || 1000, 1), 2000);

  return {
    taskType,
    domain,
    timeRange: timeRange
      ? {
          start: timeRange.start ? String(timeRange.start) : null,
          end: timeRange.end ? String(timeRange.end) : null,
        }
      : null,
    filters,
    analysisTypes,
    useRag,
    provider,
    model,
    limit,
  };
}

/**
 * 请求哈希（幂等键）：taskType/domain/timeRange/filters/analysisTypes/useRag/provider/model 规范化后 sha256。
 * analysisTypes 排序后参与哈希（顺序无关）。
 */
function buildRequestHash(req) {
  const canonical = {
    taskType: String(req.taskType || TASK_TYPE.DATA_ANALYSIS).toUpperCase(),
    domain: req.domain,
    timeRange: req.timeRange || null,
    filters: req.filters || {},
    analysisTypes: (req.analysisTypes || []).slice().sort(),
    useRag: Boolean(req.useRag),
    provider: req.provider || null,
    model: req.model || null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/** 查询同 hash 的活跃任务（PENDING/RUNNING），用于幂等复用 */
async function findActiveByHash(hash) {
  const r = await pool.query(
    `SELECT * FROM ai_analysis_tasks
     WHERE request_hash = $1 AND status IN ('PENDING', 'RUNNING')
     ORDER BY id ASC LIMIT 1`,
    [hash]
  );
  return r.rows[0] || null;
}

/** 创建任务（不等待 AI 执行；同步返回 PENDING） */
async function createTask(req, { createdBy = null } = {}) {
  const clean = validateCreateRequest(req);
  const hash = buildRequestHash(clean);

  const existing = await findActiveByHash(hash);
  if (existing) {
    return { task: toApiTask(existing), reused: true };
  }

  const payload = {
    domain: clean.domain,
    timeRange: clean.timeRange,
    filters: clean.filters,
    analysisTypes: clean.analysisTypes,
    useRag: clean.useRag,
    provider: clean.provider,
    model: clean.model,
    limit: clean.limit,
  };

  const r = await pool.query(
    `INSERT INTO ai_analysis_tasks
       (task_type, domain, status, request_hash, request_payload, provider, model, created_by)
     VALUES ($1, $2, 'PENDING', $3, $4, $5, $6, $7)
     RETURNING *`,
    [clean.taskType, clean.domain, hash, JSON.stringify(payload), clean.provider, clean.model, createdBy]
  );
  return { task: toApiTask(r.rows[0]), reused: false };
}

/** 查询单个任务 */
async function getTask(id) {
  const r = await pool.query('SELECT * FROM ai_analysis_tasks WHERE id = $1', [id]);
  if (!r.rows.length) throw new AiError(TASK_ERROR.AI_TASK_NOT_FOUND, `分析任务不存在: ${id}`);
  return toApiTask(r.rows[0]);
}

/** 任务列表（分页 + 状态/域/创建人过滤） */
async function listTasks({ page = 1, pageSize = 20, status = null, domain = null, createdBy = null } = {}) {
  const p = Math.max(parseInt(page, 10) || 1, 1);
  const ps = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
  const conds = [];
  const vals = [];
  if (status) {
    const st = String(status).toUpperCase();
    if (!Object.values(TASK_STATUS).includes(st)) throw new AiError('AI_INVALID_REQUEST', `非法 status 过滤: ${status}`);
    conds.push(`status = $${vals.length + 1}`);
    vals.push(st);
  }
  if (domain) {
    conds.push(`domain = $${vals.length + 1}`);
    vals.push(String(domain));
  }
  if (createdBy != null) {
    conds.push(`created_by = $${vals.length + 1}`);
    vals.push(createdBy);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const cnt = await pool.query(`SELECT COUNT(*) c FROM ai_analysis_tasks ${where}`, vals);
  const total = parseInt(cnt.rows[0].c, 10);

  const r = await pool.query(
    `SELECT * FROM ai_analysis_tasks ${where}
     ORDER BY id DESC
     LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
    [...vals, ps, (p - 1) * ps]
  );

  return {
    list: r.rows.map(toApiTask),
    total,
    page: p,
    pageSize: ps,
  };
}

/**
 * 取消任务（任务书 §21）：
 *  - PENDING → CANCELLED（worker 不再领取，天然不被执行）
 *  - RUNNING → 只记录 cancel_requested_at（AI Gateway/Ollama 调用不可可靠中断，禁止假取消），
 *              任务继续执行，完成后状态为 COMPLETED 且结果带 cancelRequested 标记
 *  - 终态（COMPLETED/FAILED/CANCELLED）→ 不可取消
 */
async function cancelTask(id) {
  const r = await pool.query('SELECT * FROM ai_analysis_tasks WHERE id = $1', [id]);
  if (!r.rows.length) throw new AiError(TASK_ERROR.AI_TASK_NOT_FOUND, `分析任务不存在: ${id}`);
  const task = r.rows[0];

  if (task.status === TASK_STATUS.PENDING) {
    const u = await pool.query(
      `UPDATE ai_analysis_tasks SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1 AND status = 'PENDING' RETURNING *`,
      [id]
    );
    if (!u.rows.length) throw new AiError(TASK_ERROR.AI_TASK_INVALID_STATE, `任务状态已变化，无法取消: ${id}`);
    return { task: toApiTask(u.rows[0]), cancelled: true, note: '任务已取消' };
  }

  if (task.status === TASK_STATUS.RUNNING) {
    const u = await pool.query(
      `UPDATE ai_analysis_tasks SET cancel_requested_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'RUNNING' RETURNING *`,
      [id]
    );
    return {
      task: toApiTask(u.rows[0]),
      cancelled: false,
      cancelRequested: true,
      note: '运行中任务暂不支持强制取消（AI Gateway 调用不可可靠中断）；已记录取消请求，AI 执行完成后仍会落结果',
    };
  }

  return {
    task: toApiTask(task),
    cancelled: false,
    note: `任务已处于终态(${task.status})，不可取消`,
  };
}

/** 数据库行 → API 安全任务对象（仅暴露任务元数据与结果快照，不含敏感业务记录） */
function toApiTask(row) {
  return {
    id: row.id,
    taskType: row.task_type,
    domain: row.domain,
    status: row.status,
    priority: row.priority,
    requestHash: row.request_hash,
    requestPayload: row.request_payload || null,
    statisticsSnapshot: row.statistics_snapshot || null,
    aiResult: row.ai_result || null,
    evidence: row.evidence || [],
    generationRecordId: row.generation_record_id != null ? row.generation_record_id : null,
    provider: row.provider || null,
    model: row.model || null,
    degraded: Boolean(row.degraded),
    errorCode: row.error_code || null,
    errorMessage: row.error_message || null,
    errorRetryable: Boolean(row.error_retryable),
    cancelRequestedAt: row.cancel_requested_at || null,
    createdBy: row.created_by != null ? row.created_by : null,
    createdAt: row.created_at || null,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    updatedAt: row.updated_at || null,
  };
}

module.exports = {
  TASK_STATUS,
  ALLOWED_TRANSITIONS,
  TASK_TYPE,
  TASK_ERROR,
  canTransition,
  assertTransition,
  validateCreateRequest,
  buildRequestHash,
  createTask,
  getTask,
  listTasks,
  cancelTask,
  toApiTask,
};
