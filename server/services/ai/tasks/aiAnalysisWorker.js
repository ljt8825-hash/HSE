/**
 * AI-07 Analysis Task Worker —— 最小可靠异步执行器
 *
 * 任务书 §10/§11/§16/§17/§22：
 *  - 复用 AI-06 analysisService（不复制 statistics/normalizer/RAG/structured parser/Evidence）
 *  - 默认并发 ≤ 1（CPU Ollama qwen2.5:7b ≈74s/次，禁止同时多个 RUNNING）
 *  - 统计先完成语义：即使 AI 不可用，Statistics 照常生成并落 statistics_snapshot，
 *    任务状态 COMPLETED + degraded=true + ai_result.available=false（不伪装 AI 成功）
 *  - 超时保护：任务层超时 → FAILED + AI_TASK_TIMEOUT（retryable）
 *  - 错误码沿用统一 AI 错误模型（AiError.code/retryable）
 *  - 日志脱敏：只记 taskId/taskType/domain/status/durationMs/provider/model/errorCode，
 *    禁止输出完整 Prompt / 业务记录 / 员工信息
 *
 * 并发控制（多 worker 实例安全）：领取任务事务内
 *   SELECT pg_advisory_xact_lock(固定key) → COUNT(RUNNING) >= maxConcurrent 则放弃
 *   → UPDATE ... WHERE id=(SELECT ... PENDING ... ORDER BY priority,id LIMIT 1 FOR UPDATE SKIP LOCKED)
 * 保证同一时间 RUNNING 任务数 ≤ maxConcurrent。
 */

const { pool } = require('../../../config/db');
const analysisService = require('../analysis/analysisService');
const { AiError, isAiError } = require('../errors');

const WORKER_ADVISORY_LOCK_KEY = 78007;
const DEFAULT_TIMEOUT_MS = 300000; // 与 AI-06 测试基线 AI_TIMEOUT_MS=300000 一致
const TASK_TYPE_DATA_ANALYSIS = 'DATA_ANALYSIS';

/** 任务层超时错误码（AiError，retryable=true，区分 provider timeout） */
const AI_TASK_TIMEOUT = 'AI_TASK_TIMEOUT';

/** 防泄漏 timeout 包装 */
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new AiError(AI_TASK_TIMEOUT, `任务执行超时(${ms}ms)`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 领取下一个任务（原子，全局并发 ≤ maxConcurrent）
 * @param {number} [maxConcurrent] 默认 1
 * @returns {Promise<Object|null>} 任务行或 null（无可领取/并发已满）
 */
async function claimNextTask(maxConcurrent = 1) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [WORKER_ADVISORY_LOCK_KEY]);

    const cnt = await client.query(
      `SELECT COUNT(*) c FROM ai_analysis_tasks
       WHERE task_type = $1 AND status = 'RUNNING'`,
      [TASK_TYPE_DATA_ANALYSIS]
    );
    if (parseInt(cnt.rows[0].c, 10) >= maxConcurrent) {
      await client.query('ROLLBACK');
      return null;
    }

    const r = await client.query(
      `UPDATE ai_analysis_tasks
       SET status = 'RUNNING', started_at = NOW(), updated_at = NOW()
       WHERE id = (
         SELECT id FROM ai_analysis_tasks
         WHERE task_type = $1 AND status = 'PENDING' AND cancel_requested_at IS NULL
         ORDER BY priority ASC, id ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [TASK_TYPE_DATA_ANALYSIS]
    );
    await client.query('COMMIT');
    return r.rows[0] || null;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * 执行单个任务（复用 AI-06 analysisService.analyzeData）
 * @param {Object} task - 任务行（含 request_payload）
 * @returns {Promise<{status:string, degraded?:boolean, code?:string, durationMs:number}>}
 */
async function executeTask(task) {
  const startedAt = Date.now();
  const payload = task.request_payload || {};
  const timeoutMs = parseInt(process.env.AI_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT_MS;

  try {
    const result = await withTimeout(
      analysisService.analyzeData({
        domain: payload.domain,
        timeRange: payload.timeRange,
        filters: payload.filters || {},
        analysisTypes: payload.analysisTypes,
        useRag: Boolean(payload.useRag),
        provider: payload.provider || undefined,
        limit: payload.limit,
        userId: task.created_by != null ? task.created_by : undefined,
      }),
      timeoutMs
    );

    const ai = result.ai || { available: false };
    const degraded = ai.available === false;

    await pool.query(
      `UPDATE ai_analysis_tasks SET
         status = 'COMPLETED',
         statistics_snapshot = $2,
         ai_result = $3,
         evidence = $4,
         generation_record_id = $5,
         provider = $6,
         model = $7,
         degraded = $8,
         error_code = NULL,
         error_message = $9,
         error_retryable = FALSE,
         completed_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [
        task.id,
        JSON.stringify(result.statistics || null),
        JSON.stringify(ai),
        JSON.stringify(result.evidence || []),
        result.recordId != null ? result.recordId : null,
        ai.provider || null,
        ai.model || null,
        degraded,
        degraded && ai.message ? `AI 分析降级（AI 不可用）：${ai.message}` : null,
      ]
    );
    return { status: 'COMPLETED', degraded, durationMs: Date.now() - startedAt };
  } catch (e) {
    const isAi = isAiError(e) || (e && e.name === 'AiError');
    const code = isAi ? e.code : 'AI_TASK_INTERNAL';
    const retryable = isAi ? Boolean(e.retryable) : true;

    await pool.query(
      `UPDATE ai_analysis_tasks SET
         status = 'FAILED',
         error_code = $2,
         error_message = $3,
         error_retryable = $4,
         completed_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [task.id, code, (e && e.message) || code, retryable]
    );
    return { status: 'FAILED', code, durationMs: Date.now() - startedAt };
  }
}

/** 日志：仅任务元数据（脱敏，任务书 §24/§25） */
function logTask(taskId, taskType, domain, status, durationMs, provider, model, errorCode) {
  const line = {
    msg: 'ai-task-worker',
    taskId,
    taskType,
    domain,
    status,
    ...(durationMs != null ? { durationMs } : {}),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(errorCode ? { errorCode } : {}),
  };
  // 仅输出脱敏元数据（不输出 request/records/prompt）
  console.log(`[AI07-TASK] ${JSON.stringify(line)}`);
}

/**
 * worker 主循环（轮询）
 * @param {Object} [opts]
 * @param {number} [opts.intervalMs] 轮询间隔
 * @param {number} [opts.maxConcurrent] 默认 1
 * @param {AbortSignal} [opts.signal] 停止信号
 */
async function runWorker({ intervalMs = 2000, maxConcurrent = 1, signal = null } = {}) {
  logTask('*', 'worker', null, 'STARTED', null, null, null, null);
  while (!signal || !signal.aborted) {
    try {
      const task = await claimNextTask(maxConcurrent);
      if (task) {
        const r = await executeTask(task);
        logTask(
          task.id,
          task.task_type,
          task.domain,
          r.status,
          r.durationMs,
          task.provider,
          task.model,
          r.code || null
        );
      } else {
        await sleep(intervalMs);
      }
    } catch (e) {
      console.error(`[AI07-TASK] worker loop error: ${e && e.message}`);
      await sleep(intervalMs);
    }
  }
  logTask('*', 'worker', null, 'STOPPED', null, null, null, null);
}

module.exports = {
  WORKER_ADVISORY_LOCK_KEY,
  DEFAULT_TIMEOUT_MS,
  AI_TASK_TIMEOUT,
  withTimeout,
  claimNextTask,
  executeTask,
  runWorker,
  logTask,
};
