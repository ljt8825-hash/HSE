/**
 * AI-11 Human Review Service —— 「AI 管理建议 → 人工审核与确认闭环」
 *
 * 设计基线（AI-11 任务书 §四/§五/§六/§七/§九/§十/§十一/§十二/§十三）：
 *  - 持久化：独立表 ai_generation_reviews（migration ai11_generation_reviews_v1.sql，开发库执行）；
 *  - 追加式历史：每次审核一条新记录，latest 行 = 当前有效审核状态；
 *  - 并发一致性：事务内对任务行 SELECT ... FOR UPDATE 串行化同一任务的审核提交；
 *    后到请求重读最新状态，状态已变化 → AI_REVIEW_STATE_CONFLICT（禁止最后写入覆盖）；
 *  - 重复提交：与最新记录（action + reviewed_by + human_remark + human_modified）完全一致
 *    → 幂等返回，不新增历史（网络重试安全）；
 *  - PENDING_REVIEW 按需创建（最小方案）：不修改 AI-10 生成流程；无审核记录时当前状态即
 *    PENDING_REVIEW，首次审核 previous_status='PENDING_REVIEW'；
 *  - 关联一致性：generation_record 通过 AI-10 title 关联键定位（title=管理建议:任务#{taskId}），
 *    与服务校验函数 assertGenerationTaskMatch 双重保证 generation_record ↔ task 不漂移；
 *  - 硬性不变量：永不修改 ai_generation_records.result / evidence / prompt_key / prompt_version；
 *  - human_modified 独立 JSONB 存储，仅作人工参考建议，不进入任何业务最终字段；
 *  - 审核 API 不经过 AI Gateway，不受 AI 生成超时影响。
 */

const { pool } = require('../../../config/db');
const { AiError } = require('../errors');

const REVIEW_STATUS = Object.freeze({
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  MODIFIED: 'MODIFIED',
});

const REVIEW_ACTION = Object.freeze({
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  MODIFY: 'MODIFY',
});

/** action → 目标审核状态 */
const ACTION_TO_STATUS = Object.freeze({
  APPROVE: REVIEW_STATUS.APPROVED,
  REJECT: REVIEW_STATUS.REJECTED,
  MODIFY: REVIEW_STATUS.MODIFIED,
});

/** AI-11 审核错误码（沿用统一 AI 错误模型 errors.js） */
const REVIEW_ERROR = Object.freeze({
  AI_REVIEW_INVALID_ACTION: 'AI_REVIEW_INVALID_ACTION',
  AI_REVIEW_STATE_CONFLICT: 'AI_REVIEW_STATE_CONFLICT',
  AI_REVIEW_GENERATION_TASK_MISMATCH: 'AI_REVIEW_GENERATION_TASK_MISMATCH',
  AI_REVIEW_RECORD_NOT_FOUND: 'AI_REVIEW_RECORD_NOT_FOUND',
  AI_REVIEW_REQUIRED: 'AI_REVIEW_REQUIRED',
  AI_REVIEW_INVALID_MODIFIED: 'AI_REVIEW_INVALID_MODIFIED',
  AI_REVIEW_OVERSIZED: 'AI_REVIEW_OVERSIZED',
});

/** 管理建议协议字段（与 AI-10 六字段一致） */
const SUGGESTION_FIELDS = [
  'overall_assessment',
  'priority_issues',
  'management_actions',
  'monitoring_points',
  'follow_up_suggestions',
  'limitations',
];

/** 与任务的关联键（同 AI-10 managementSuggestionService.recordTitle） */
function recordTitle(taskId) {
  return `管理建议:任务#${taskId}`;
}

const REMARK_MAX = 2000;
const MODIFIED_TEXT_MAX = 1000;
const MODIFIED_ARRAY_MAX = 500;

/**
 * 校验人工修改后的六字段建议（结构 fail-closed；长度宽于 AI 输出限制，不限制人工表达）
 */
function validateHumanModified(hm) {
  if (!hm || typeof hm !== 'object' || Array.isArray(hm)) {
    throw new AiError(REVIEW_ERROR.AI_REVIEW_INVALID_MODIFIED, 'humanModified 必须是六字段 JSON 对象');
  }
  const missing = SUGGESTION_FIELDS.filter((k) => hm[k] == null);
  if (missing.length > 0) {
    throw new AiError(REVIEW_ERROR.AI_REVIEW_INVALID_MODIFIED, `人工修改建议缺少字段: ${missing.join(', ')}`);
  }
  if (typeof hm.overall_assessment !== 'string') {
    throw new AiError(REVIEW_ERROR.AI_REVIEW_INVALID_MODIFIED, '人工修改建议 overall_assessment 必须是字符串');
  }
  if (hm.overall_assessment.length > MODIFIED_TEXT_MAX) {
    throw new AiError(REVIEW_ERROR.AI_REVIEW_INVALID_MODIFIED, `人工修改建议总体判断超长（>${MODIFIED_TEXT_MAX}字）`);
  }
  for (const arrKey of ['priority_issues', 'management_actions', 'monitoring_points', 'follow_up_suggestions', 'limitations']) {
    if (!Array.isArray(hm[arrKey])) {
      throw new AiError(REVIEW_ERROR.AI_REVIEW_INVALID_MODIFIED, `人工修改建议字段 ${arrKey} 必须是数组`);
    }
    if (hm[arrKey].length > MODIFIED_ARRAY_MAX) {
      throw new AiError(REVIEW_ERROR.AI_REVIEW_INVALID_MODIFIED, `人工修改建议字段 ${arrKey} 元素过多（>${MODIFIED_ARRAY_MAX}条）`);
    }
    for (const item of hm[arrKey]) {
      if (typeof item !== 'string') {
        throw new AiError(REVIEW_ERROR.AI_REVIEW_INVALID_MODIFIED, `人工修改建议字段 ${arrKey} 元素必须是字符串`);
      }
      if (item.length > MODIFIED_TEXT_MAX) {
        throw new AiError(REVIEW_ERROR.AI_REVIEW_INVALID_MODIFIED, `人工修改建议字段 ${arrKey} 存在超长元素（>${MODIFIED_TEXT_MAX}字）`);
      }
    }
  }
  return hm;
}

/** 校验人工意见长度（可空；超长拒绝） */
function assertRemarkSize(remark) {
  if (remark == null || remark === '') return null;
  if (typeof remark !== 'string') {
    throw new AiError(REVIEW_ERROR.AI_REVIEW_INVALID_ACTION, 'humanRemark 必须是字符串');
  }
  if (remark.length > REMARK_MAX) {
    throw new AiError(REVIEW_ERROR.AI_REVIEW_OVERSIZED, `人工意见超长（>${REMARK_MAX}字），拒绝提交`);
  }
  return remark;
}

/**
 * 关联一致性校验：generation_record 必须属于指定 task（通过 title 关联键校验）
 * @param {number} generationRecordId - ai_generation_records.id
 * @param {number} taskId - ai_analysis_tasks.id
 */
async function assertGenerationTaskMatch(generationRecordId, taskId) {
  if (generationRecordId == null || taskId == null) {
    throw new AiError(REVIEW_ERROR.AI_REVIEW_GENERATION_TASK_MISMATCH, 'generation_record_id 与 task_id 均不能为空');
  }
  const r = await pool.query(
    `SELECT id FROM ai_generation_records
     WHERE id = $1 AND type = 'analysis' AND sub_type = 'management_suggestion' AND title = $2`,
    [generationRecordId, recordTitle(taskId)]
  );
  if (!r.rows.length) {
    throw new AiError(
      REVIEW_ERROR.AI_REVIEW_GENERATION_TASK_MISMATCH,
      `generation_record #${generationRecordId} 不属于任务 #${taskId}（关联不一致），拒绝写入审核记录`
    );
  }
  return true;
}

/** 审核人姓名（users 只读；用户不存在/已删除 → null，不阻塞审核链路） */
async function fetchReviewerName(userId) {
  if (userId == null) return null;
  const r = await pool.query(`SELECT real_name FROM users WHERE id = $1`, [userId]);
  return r.rows.length ? r.rows[0].real_name : null;
}

/** 记录行 → API 审核项（reviewed_by 附带审核人姓名，join users 只读；数值列统一转为 Number，避免 bigint 字符串） */
function toApiReview(row, reviewerName = null) {
  return {
    id: row.id != null ? Number(row.id) : null,
    generationRecordId: row.generation_record_id != null ? Number(row.generation_record_id) : null,
    taskId: row.task_id != null ? Number(row.task_id) : null,
    reviewStatus: row.review_status,
    previousStatus: row.previous_status || null,
    action: row.action || null,
    reviewedBy: row.reviewed_by != null ? Number(row.reviewed_by) : null,
    reviewedByName: reviewerName || null,
    reviewedAt: row.reviewed_at || null,
    humanRemark: row.human_remark || null,
    humanModified: row.human_modified || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

/** 查询审核历史（created_at ASC 完整链；无建议记录 → 空历史 + currentStatus=null） */
async function getReviewHistory(taskId) {
  const task = await pool.query(`SELECT id FROM ai_analysis_tasks WHERE id = $1`, [taskId]);
  if (!task.rows.length) {
    throw new AiError('AI_TASK_NOT_FOUND', `分析任务 #${taskId} 不存在`);
  }

  const rec = await pool.query(
    `SELECT id FROM ai_generation_records
     WHERE type = 'analysis' AND sub_type = 'management_suggestion' AND title = $1
     ORDER BY id DESC LIMIT 1`,
    [recordTitle(taskId)]
  );
  const generationRecordId = rec.rows.length ? rec.rows[0].id : null;

  if (generationRecordId == null) {
    return { taskId, generationRecordId: null, currentStatus: null, reviews: [] };
  }

  const rows = await pool.query(
    `SELECT r.*, u.real_name AS reviewer_name
     FROM ai_generation_reviews r
     LEFT JOIN users u ON u.id = r.reviewed_by
     WHERE r.generation_record_id = $1
     ORDER BY r.created_at ASC, r.id ASC`,
    [generationRecordId]
  );

  const reviews = rows.rows.map((row) => toApiReview(row, row.reviewer_name || null));
  const currentStatus = reviews.length ? reviews[reviews.length - 1].reviewStatus : REVIEW_STATUS.PENDING_REVIEW;
  return { taskId, generationRecordId, currentStatus, reviews };
}

/**
 * 提交人工审核（APPROVE / REJECT / MODIFY）
 *
 * 事务流程（任务书 §十；请求形状校验在 BEGIN 之前完成，与数据库状态无关）：
 *   0. action/remark 校验；MODIFY 必带结构合法 humanModified（fail-closed，状态无关）
 *   BEGIN
 *   1. SELECT task FOR UPDATE（串行化同一任务的人工审核）
 *   2. 定位该任务的 AI 管理建议 generation record（AI-10 title 关联键）
 *   3. 读取最新审核记录 → 当前有效状态
 *   4. 重复提交（与最新记录完全一致）→ 幂等返回，不新增
 *   5. 当前状态已等于目标状态（且非幂等）→ AI_REVIEW_STATE_CONFLICT
 *   6. 插入新审核记录（previous_status = 当前状态）
 *   COMMIT
 *
 * @param {number} taskId
 * @param {Object} opts
 * @param {string} opts.action - APPROVE | REJECT | MODIFY
 * @param {string|null} [opts.humanRemark] - 人工意见（可空）
 * @param {Object|null} [opts.humanModified] - MODIFY 时人工修改后的六字段建议
 * @param {string|null} [opts.previousStatus] - 客户端看到的当前状态（乐观并发；与服务器当前状态不一致 → AI_REVIEW_STATE_CONFLICT）
 * @param {number|null} [opts.userId] - req.user.id（审核人，不做身份推断）
 * @returns {Promise<{idempotent:boolean, review:Object, taskId:number, generationRecordId:number}>}
 */
async function submitReview(taskId, { action = null, humanRemark = null, humanModified = null, previousStatus = null, userId = null } = {}) {
  const normalizedAction = String(action || '').toUpperCase();
  const targetStatus = ACTION_TO_STATUS[normalizedAction];
  if (!targetStatus) {
    throw new AiError(
      REVIEW_ERROR.AI_REVIEW_INVALID_ACTION,
      `非法审核动作: ${action}（仅支持 ${Object.values(REVIEW_ACTION).join(' / ')}）`
    );
  }
  const remark = assertRemarkSize(humanRemark);

  // 请求形状校验前置（fail-closed，与数据库状态无关）：
  // MODIFY 必须携带结构合法的人工修改建议；避免在状态已变化时把形状错误误报为状态冲突。
  if (normalizedAction === REVIEW_ACTION.MODIFY) {
    if (humanModified == null) {
      throw new AiError(REVIEW_ERROR.AI_REVIEW_REQUIRED, 'MODIFY 必须提供 humanModified（人工修改后的六字段建议）');
    }
    validateHumanModified(humanModified);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) 锁定任务行（串行化同一任务的人工审核提交）
    const tRes = await client.query(
      `SELECT id FROM ai_analysis_tasks WHERE id = $1 FOR UPDATE`,
      [taskId]
    );
    if (!tRes.rows.length) {
      throw new AiError('AI_TASK_NOT_FOUND', `分析任务 #${taskId} 不存在`);
    }

    // 2) 定位该任务的 AI 管理建议记录（AI-10 零 migration 关联键）
    const recRes = await client.query(
      `SELECT id FROM ai_generation_records
       WHERE type = 'analysis' AND sub_type = 'management_suggestion' AND title = $1
       ORDER BY id DESC LIMIT 1`,
      [recordTitle(taskId)]
    );
    if (!recRes.rows.length) {
      throw new AiError(
        REVIEW_ERROR.AI_REVIEW_RECORD_NOT_FOUND,
        '该任务尚未生成可用的 AI 管理建议，无法进行人工审核（AI 建议不存在时不得伪造审核记录）'
      );
    }
    const generationRecordId = recRes.rows[0].id;

    // 3) 读取最新审核记录 → 当前有效状态（任务行已锁，无并发写者）
    const lastRes = await client.query(
      `SELECT * FROM ai_generation_reviews
       WHERE generation_record_id = $1
       ORDER BY id DESC LIMIT 1`,
      [generationRecordId]
    );
    const last = lastRes.rows[0] || null;
    const currentStatus = last ? last.review_status : REVIEW_STATUS.PENDING_REVIEW;

    // 4) 重复提交（网络重试）→ 幂等返回第一次审核结果，不新增历史
    if (
      last &&
      last.action === normalizedAction &&
      last.review_status === targetStatus &&
      (last.reviewed_by == null ? null : Number(last.reviewed_by)) === (userId == null ? null : Number(userId)) &&
      (last.human_remark || null) === (remark || null) &&
      JSON.stringify(last.human_modified || null) === JSON.stringify(humanModified || null)
    ) {
      await client.query('COMMIT');
      const reviewerName = await fetchReviewerName(userId);
      return {
        idempotent: true,
        review: toApiReview(last, reviewerName),
        taskId,
        generationRecordId,
      };
    }

    // 5) 乐观并发校验：请求携带 previousStatus 时，必须与服务器当前状态一致
    //    （防止并发场景中基于旧视图提交产生错误的审核链，如 PENDING_REVIEW 已被 APPROVED 后仍提交 REJECT）
    if (previousStatus != null && currentStatus !== String(previousStatus)) {
      throw new AiError(
        REVIEW_ERROR.AI_REVIEW_STATE_CONFLICT,
        `审核状态已发生变化（当前 ${currentStatus}，请求基于 ${previousStatus}），请刷新后重新提交`
      );
    }

    // 6) 状态冲突：当前已是目标状态且非幂等 → 拒绝（禁止最后写入覆盖前一个审核结论）
    if (currentStatus === targetStatus) {
      throw new AiError(
        REVIEW_ERROR.AI_REVIEW_STATE_CONFLICT,
        `当前审核状态已是 ${targetStatus}，不允许重复提交相同的审核动作；如需改变结论，请提交其他审核动作`
      );
    }

    // 7) 插入新审核记录（追加式历史；MODIFY 人工建议已在事务外完成结构校验）
    const ins = await client.query(
      `INSERT INTO ai_generation_reviews
         (generation_record_id, task_id, review_status, previous_status, action, reviewed_by, human_remark, human_modified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        generationRecordId,
        taskId,
        targetStatus,
        currentStatus,
        normalizedAction,
        userId != null ? userId : null,
        remark,
        humanModified != null ? JSON.stringify(humanModified) : null,
      ]
    );

    await client.query('COMMIT');
    const reviewerName = await fetchReviewerName(userId);
    return {
      idempotent: false,
      review: toApiReview(ins.rows[0], reviewerName),
      taskId,
      generationRecordId,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  REVIEW_STATUS,
  REVIEW_ACTION,
  ACTION_TO_STATUS,
  REVIEW_ERROR,
  SUGGESTION_FIELDS,
  recordTitle,
  validateHumanModified,
  assertRemarkSize,
  assertGenerationTaskMatch,
  toApiReview,
  getReviewHistory,
  submitReview,
};
