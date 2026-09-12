/**
 * 标准化评价服务 - HSE V2 Sprint4 Phase5
 *
 * 职责: 评价任务管理 + AI 辅助评价流程
 * 复用:
 *   - config/db(pool)
 *   - services/aiService (buildStandardEvaluationPrompt + chat)
 *   - 表: standard_evaluation_tasks, standard_evaluation_items,
 *        safety_standard_clauses, document_standard_relation,
 *        document_ai_analysis, document_files
 *
 * 状态机:
 *   任务: draft → pending → processing → completed / failed
 *   AI:  none → pending → processing → completed / failed
 *   明细: pending → (AI处理后) ai_verdict 设置, compliance_status 保持 pending
 *
 * 约束:
 *   - AI 只能辅助判断，禁止自动生成达标结论
 *   - 禁止自动评分、自动认证、最终等级
 *   - verdict=compliant 但 evidence 为空 → 自动降级为 unknown
 *   - 异步执行，不阻塞 HTTP 请求
 */

const { pool } = require('../config/db');
const aiService = require('./aiService');
const { logger } = require('../middleware/requestLogger');

const PROMPT_VERSION = 'v1.0';

// ============================================================
// 辅助函数
// ============================================================

function camelTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskName: row.task_name,
    evaluationScope: row.evaluation_scope,
    evaluationPeriod: row.evaluation_period,
    currentRound: row.current_round,
    totalClauses: row.total_clauses,
    taskStatus: row.task_status,
    aiEnabled: row.ai_enabled,
    aiStatus: row.ai_status,
    aiOverallScore: row.ai_overall_score,
    aiOverallLevel: row.ai_overall_level,
    finalOverallScore: row.final_overall_score,
    finalOverallLevel: row.final_overall_level,
    aiTotalItems: row.ai_total_items,
    aiCompletedItems: row.ai_completed_items,
    aiFailedItems: row.ai_failed_items,
    aiErrorMessage: row.ai_error_message,
    aiStartedAt: row.ai_started_at,
    aiCompletedAt: row.ai_completed_at,
    aiSummary: row.ai_summary,
    promptVersion: row.prompt_version,
    errorMessage: row.error_message,
    createdBy: row.created_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function camelItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    clauseId: row.clause_id,
    evaluationRound: row.evaluation_round,
    clauseCode: row.clause_code,
    clauseTitle: row.clause_title,
    clauseContent: row.clause_content,
    scoreWeight: row.score_weight,
    aiVerdict: row.ai_verdict,
    complianceStatus: row.compliance_status,
    matchedFileIds: row.matched_file_ids || [],
    matchedFileSummary: row.matched_file_summary || [],
    aiCheckResult: row.ai_check_result,
    aiEvidence: row.ai_evidence,
    aiSuggestion: row.ai_suggestion,
    aiConfidence: row.ai_confidence,
    aiFindings: row.ai_findings || [],
    aiMissingItems: row.ai_missing_items || [],
    aiEvidenceFiles: row.ai_evidence_files || [],
    aiProcessedAt: row.ai_processed_at,
    aiError: row.ai_error,
    manualRemark: row.manual_remark,
    checkedBy: row.checked_by,
    checkedAt: row.checked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 从 AI 响应中提取 JSON
 */
function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch { /* ignore */ }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch { /* ignore */ }
  }

  const match2 = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match2) {
    try {
      return JSON.parse(match2[1].trim());
    } catch { /* ignore */ }
  }

  return null;
}

// ============================================================
// 1. 任务管理
// ============================================================

/** 获取任务列表 */
async function getTaskList(options = {}) {
  const { page = 1, pageSize = 20, status, keyword, createdBy } = options;
  const offset = (page - 1) * pageSize;
  const params = [];
  const where = ['is_deleted = FALSE'];
  let idx = 1;

  if (status) {
    where.push(`task_status = $${idx++}`);
    params.push(status);
  }
  if (keyword) {
    where.push(`task_name ILIKE $${idx++}`);
    params.push(`%${keyword}%`);
  }
  if (createdBy) {
    where.push(`created_by = $${idx++}`);
    params.push(createdBy);
  }

  const whereSql = where.join(' AND ');

  const countRes = await pool.query(
    `SELECT COUNT(*) as total FROM standard_evaluation_tasks WHERE ${whereSql}`,
    params
  );

  const listRes = await pool.query(
    `SELECT * FROM standard_evaluation_tasks
     WHERE ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, pageSize, offset]
  );

  return {
    list: listRes.rows.map(camelTask),
    total: parseInt(countRes.rows[0].total, 10),
    page: parseInt(page, 10),
    pageSize: parseInt(pageSize, 10),
  };
}

/** 获取任务详情 */
async function getTaskById(taskId) {
  const res = await pool.query(
    `SELECT * FROM standard_evaluation_tasks WHERE id = $1 AND is_deleted = FALSE`,
    [taskId]
  );
  return camelTask(res.rows[0]);
}

/**
 * 创建评价任务
 * 同时生成所有三级条款的评价明细（compliance_status=pending, ai_verdict=unknown）
 */
async function createTask(data, user) {
  const { taskName, evaluationPeriod, evaluationScope } = data;
  if (!taskName) throw new Error('任务名称不能为空');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. 获取所有三级条款
    const clausesRes = await client.query(
      `SELECT id, code, clause_title, clause_content, check_method, score_weight, keywords, required_doc_types
       FROM safety_standard_clauses
       WHERE level = 3 AND status = 'active' AND is_deleted = FALSE
       ORDER BY sort_order, code`
    );
    const clauses = clausesRes.rows;
    const totalClauses = clauses.length;

    // 2. 创建任务
    const taskRes = await client.query(
      `INSERT INTO standard_evaluation_tasks
       (task_name, evaluation_period, evaluation_scope, total_clauses,
        task_status, ai_status, current_round, created_by, prompt_version)
       VALUES ($1, $2, $3, $4, 'draft', 'none', 0, $5, $6)
       RETURNING *`,
      [
        taskName,
        evaluationPeriod || null,
        JSON.stringify(evaluationScope || { all: true }),
        totalClauses,
        user?.userId || user?.id || 1,
        PROMPT_VERSION,
      ]
    );
    const task = camelTask(taskRes.rows[0]);

    // 3. 批量插入评价明细（round=0, 人工字段 pending）
    if (clauses.length > 0) {
      const values = [];
      const placeholders = [];
      let idx = 1;
      for (const c of clauses) {
        placeholders.push(
          `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
        );
        values.push(
          task.id,
          c.id,
          0,
          c.code,
          c.clause_title,
          c.clause_content,
          c.score_weight,
          JSON.stringify([])
        );
      }
      await client.query(
        `INSERT INTO standard_evaluation_items
         (task_id, clause_id, evaluation_round, clause_code, clause_title,
          clause_content, score_weight, matched_file_ids)
         VALUES ${placeholders.join(', ')}`,
        values
      );
    }

    await client.query('COMMIT');
    return task;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** 删除任务（软删除） */
async function deleteTask(taskId, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE standard_evaluation_tasks
       SET is_deleted = TRUE, updated_at = NOW()
       WHERE id = $1 AND is_deleted = FALSE`,
      [taskId]
    );
    await client.query(
      `UPDATE standard_evaluation_items
       SET is_deleted = TRUE, updated_at = NOW()
       WHERE task_id = $1 AND is_deleted = FALSE`,
      [taskId]
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// 2. 评价明细查询
// ============================================================

/** 查询任务的评价明细列表 */
async function getEvaluationItems(taskId, options = {}) {
  const { round = 0, aiVerdict, complianceStatus, keyword, page = 1, pageSize = 50 } = options;
  const offset = (page - 1) * pageSize;
  const params = [taskId, round];
  const where = ['task_id = $1', 'evaluation_round = $2', 'is_deleted = FALSE'];
  let idx = 3;

  if (aiVerdict) {
    where.push(`ai_verdict = $${idx++}`);
    params.push(aiVerdict);
  }
  if (complianceStatus) {
    where.push(`compliance_status = $${idx++}`);
    params.push(complianceStatus);
  }
  if (keyword) {
    where.push(`(clause_title ILIKE $${idx} OR clause_code ILIKE $${idx})`);
    params.push(`%${keyword}%`);
    idx++;
  }

  const whereSql = where.join(' AND ');

  const countRes = await pool.query(
    `SELECT COUNT(*) as total FROM standard_evaluation_items WHERE ${whereSql}`,
    params
  );

  const listRes = await pool.query(
    `SELECT * FROM standard_evaluation_items
     WHERE ${whereSql}
     ORDER BY clause_code
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, pageSize, offset]
  );

  return {
    list: listRes.rows.map(camelItem),
    total: parseInt(countRes.rows[0].total, 10),
    page: parseInt(page, 10),
    pageSize: parseInt(pageSize, 10),
  };
}

/** 获取单条评价明细 */
async function getEvaluationItem(itemId) {
  const res = await pool.query(
    `SELECT * FROM standard_evaluation_items WHERE id = $1 AND is_deleted = FALSE`,
    [itemId]
  );
  return camelItem(res.rows[0]);
}

/** 获取任务评价统计（按 AI verdict 分组） */
async function getTaskStats(taskId, round = 0) {
  const res = await pool.query(
    `SELECT ai_verdict, COUNT(*) as count
     FROM standard_evaluation_items
     WHERE task_id = $1 AND evaluation_round = $2 AND is_deleted = FALSE
     GROUP BY ai_verdict`,
    [taskId, round]
  );
  const stats = {
    total: 0,
    compliant: 0,
    partial: 0,
    nonCompliant: 0,
    missing: 0,
    unknown: 0,
  };
  for (const row of res.rows) {
    const count = parseInt(row.count, 10);
    stats.total += count;
    if (row.ai_verdict === 'compliant') stats.compliant = count;
    else if (row.ai_verdict === 'partial') stats.partial = count;
    else if (row.ai_verdict === 'non_compliant') stats.nonCompliant = count;
    else if (row.ai_verdict === 'missing') stats.missing = count;
    else stats.unknown = count;
  }
  return stats;
}

// ============================================================
// 3. AI 评价流程（异步）
// ============================================================

/**
 * 启动 AI 评价（异步执行）
 * - 更新任务状态为 processing
 * - 异步遍历所有三级条款，逐一调用 AI 评价
 * - 每条评价完成后更新明细
 * - 全部完成后更新任务状态为 completed
 */
function startAiEvaluation(taskId, user) {
  // 异步执行，不阻塞
  setImmediate(() => {
    runAiEvaluation(taskId, user).catch((err) => {
      logger.error(`[AI-Evaluation] 任务 ${taskId} AI 评价异常: ${err.message}`);
      // 标记任务失败
      pool.query(
        `UPDATE standard_evaluation_tasks
         SET ai_status = 'failed', task_status = 'failed',
             ai_error_message = $1, completed_at = NOW()
         WHERE id = $2`,
        [err.message, taskId]
      ).catch((e) => {
        logger.error(`[AI-Evaluation] 更新任务失败状态失败: ${e.message}`);
      });
    });
  });
}

/**
 * 执行 AI 评价核心流程
 */
async function runAiEvaluation(taskId, user) {
  logger.info(`[AI-Evaluation] 任务 ${taskId} AI 评价开始`);

  // 1. 更新任务状态 + 轮次+1
  const taskRes = await pool.query(
    `UPDATE standard_evaluation_tasks
     SET task_status = 'in_progress',
         ai_status = 'processing',
         ai_started_at = NOW(),
         current_round = current_round + 1,
         started_at = CASE WHEN started_at IS NULL THEN NOW() ELSE started_at END
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING current_round`,
    [taskId]
  );
  if (taskRes.rows.length === 0) {
    throw new Error('任务不存在');
  }
  const currentRound = taskRes.rows[0].current_round;

  // 2. 获取所有三级条款明细（当前轮次）
  const itemsRes = await pool.query(
    `SELECT * FROM standard_evaluation_items
     WHERE task_id = $1 AND evaluation_round = 0 AND is_deleted = FALSE
     ORDER BY clause_code`,
    [taskId]
  );
  const items = itemsRes.rows;
  const totalItems = items.length;

  // 更新总数
  await pool.query(
    `UPDATE standard_evaluation_tasks
     SET ai_total_items = $1, ai_completed_items = 0, ai_failed_items = 0
     WHERE id = $2`,
    [totalItems, taskId]
  );

  logger.info(`[AI-Evaluation] 任务 ${taskId} 共 ${totalItems} 条条款待评价`);

  let completed = 0;
  let failed = 0;

  // 3. 遍历每条条款，逐一评价
  for (const item of items) {
    try {
      await evaluateSingleClause(taskId, item, currentRound);
      completed++;
    } catch (err) {
      failed++;
      logger.error(`[AI-Evaluation] 条款 ${item.clause_code} 评价失败: ${err.message}`);
      // 标记单条失败
      await pool.query(
        `INSERT INTO standard_evaluation_items
         (task_id, clause_id, evaluation_round, clause_code, clause_title,
          clause_content, score_weight, ai_verdict, ai_error, ai_processed_at,
          matched_file_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'unknown', $8, NOW(), $9)
         ON CONFLICT (task_id, clause_id, evaluation_round) WHERE is_deleted = FALSE
         DO UPDATE SET ai_verdict = 'unknown', ai_error = $8,
                        ai_processed_at = NOW(), updated_at = NOW()`,
        [
          taskId,
          item.clause_id,
          currentRound,
          item.clause_code,
          item.clause_title,
          item.clause_content,
          item.score_weight,
          err.message.substring(0, 500),
          JSON.stringify([]),
        ]
      );
    } finally {
      // 更新进度
      await pool.query(
        `UPDATE standard_evaluation_tasks
         SET ai_completed_items = $1, ai_failed_items = $2
         WHERE id = $3`,
        [completed, failed, taskId]
      );
    }
  }

  // 4. 更新任务完成状态
  await pool.query(
    `UPDATE standard_evaluation_tasks
     SET ai_status = $1,
         task_status = $2,
         ai_completed_at = NOW(),
         completed_at = NOW()
     WHERE id = $3`,
    [
      failed > 0 && completed === 0 ? 'failed' : 'completed',
      failed > 0 && completed === 0 ? 'failed' : 'completed',
      taskId,
    ]
  );

  logger.info(
    `[AI-Evaluation] 任务 ${taskId} AI 评价完成: 成功 ${completed}, 失败 ${failed}`
  );
}

/**
 * 评价单条条款
 * 流程: 查关联资料(valid) → 查 AI 分析 → 调用 AI → 保存结果
 */
async function evaluateSingleClause(taskId, item, round) {
  const clauseId = item.clause_id;
  const clauseCode = item.clause_code;

  // 1. 查询该条款的有效关联资料（status = valid）
  const relationRes = await pool.query(
    `SELECT dsr.file_id, dsr.match_reason,
            df.original_name, df.summary, df.file_type
     FROM document_standard_relation dsr
     JOIN document_files df ON df.id = dsr.file_id
     WHERE dsr.clause_id = $1
       AND dsr.status = 'valid'
       AND dsr.is_deleted = FALSE
       AND df.is_deleted = FALSE
     ORDER BY dsr.match_confidence DESC NULLS LAST
     LIMIT 10`,
    [clauseId]
  );
  const relations = relationRes.rows;

  // 2. 查询每个关联文件的 AI 分析结果（取最新 completed）
  const relatedDocs = [];
  for (const rel of relations) {
    const aiRes = await pool.query(
      `SELECT ai_summary, ai_keywords, ai_suggestions, ai_score, status
       FROM document_ai_analysis
       WHERE file_id = $1 AND status = 'completed' AND is_deleted = FALSE
       ORDER BY created_at DESC
       LIMIT 1`,
      [rel.file_id]
    );
    const aiRow = aiRes.rows[0];
    relatedDocs.push({
      fileId: rel.file_id,
      fileName: rel.original_name,
      fileType: rel.file_type,
      summary: rel.summary,
      aiSummary: aiRow?.ai_summary || null,
      aiKeywords: aiRow?.ai_keywords || [],
      aiScore: aiRow?.ai_score || null,
      matchReason: rel.match_reason,
    });
  }

  // 3. 如果没有关联资料，直接标记为 unknown + missing
  if (relatedDocs.length === 0) {
    await saveEvaluationResult(taskId, clauseId, round, item, {
      verdict: 'missing',
      findings: [],
      missingItems: ['无关联的安全资料，无法进行评价'],
      evidence: '',
      suggestion: '请先上传并关联相关的安全资料，再进行评价。',
    }, []);
    return;
  }

  // 4. 调用 AI 评价
  if (!aiService.isAvailable()) {
    // AI 不可用时，标记为 unknown 但保留关联资料
    await saveEvaluationResult(taskId, clauseId, round, item, {
      verdict: 'unknown',
      findings: [],
      missingItems: ['AI 服务不可用，无法自动评价'],
      evidence: '',
      suggestion: 'AI 服务当前不可用，请稍后重试或进行人工评价。',
    }, relatedDocs);
    return;
  }

  const prompt = aiService.buildStandardEvaluationPrompt(
    {
      code: clauseCode,
      title: item.clause_title,
      content: item.clause_content,
      checkMethod: item.check_method,
      keywords: item.keywords || [],
    },
    relatedDocs
  );

  const aiResponse = await aiService.chat(prompt, {
    temperature: 0.1,
  });

  // 5. 解析 AI 响应
  let result = extractJson(aiResponse);
  if (!result) {
    result = {
      verdict: 'unknown',
      findings: [],
      missingItems: ['AI 返回格式异常，无法解析'],
      evidence: '',
      suggestion: 'AI 返回内容无法解析，请人工复核。',
    };
  }

  // 6. 强制规则：verdict=compliant 但 evidence 为空 → 降级为 unknown
  if (result.verdict === 'compliant' && (!result.evidence || result.evidence.trim() === '')) {
    result.verdict = 'unknown';
    result.findings = result.findings || [];
    result.missingItems = (result.missingItems || []).concat(['证据不足，无法确认合规性']);
    result.suggestion = (result.suggestion || '') + ' 因缺少明确证据，系统自动降级为未知状态，请人工复核。';
  }

  // 7. 验证 verdict 合法性
  const validVerdicts = ['compliant', 'partial', 'non_compliant', 'missing', 'unknown'];
  if (!validVerdicts.includes(result.verdict)) {
    result.verdict = 'unknown';
  }

  // 8. 保存结果
  await saveEvaluationResult(taskId, clauseId, round, item, result, relatedDocs);
}

/**
 * 保存评价结果到明细
 * - 若当前轮次已存在则更新，否则插入
 * - compliance_status 始终保持 pending（人工确认后才改）
 * - 只更新 ai_* 字段
 */
async function saveEvaluationResult(taskId, clauseId, round, item, result, relatedDocs) {
  const matchedFileIds = relatedDocs.map((d) => d.fileId);
  const matchedFileSummary = relatedDocs.map((d) => ({
    fileId: d.fileId,
    fileName: d.fileName,
    aiSummary: d.aiSummary,
  }));

  const aiCheckResult = {
    findings: result.findings || [],
    missingItems: result.missingItems || [],
  };

  await pool.query(
    `INSERT INTO standard_evaluation_items
     (task_id, clause_id, evaluation_round, clause_code, clause_title,
      clause_content, score_weight,
      ai_verdict, ai_check_result, ai_evidence, ai_suggestion,
      ai_findings, ai_missing_items, ai_evidence_files, ai_processed_at,
      matched_file_ids, matched_file_summary,
      compliance_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15, $16, 'pending')
     ON CONFLICT (task_id, clause_id, evaluation_round) WHERE is_deleted = FALSE
     DO UPDATE SET
       ai_verdict = $8,
       ai_check_result = $9,
       ai_evidence = $10,
       ai_suggestion = $11,
       ai_findings = $12,
       ai_missing_items = $13,
       ai_evidence_files = $14,
       ai_processed_at = NOW(),
       matched_file_ids = $15,
       matched_file_summary = $16,
       updated_at = NOW()`,
    [
      taskId,
      clauseId,
      round,
      item.clause_code,
      item.clause_title,
      item.clause_content,
      item.score_weight,
      result.verdict,
      JSON.stringify(aiCheckResult),
      result.evidence || '',
      result.suggestion || '',
      JSON.stringify(result.findings || []),
      JSON.stringify(result.missingItems || []),
      JSON.stringify(matchedFileIds),
      JSON.stringify(matchedFileIds),
      JSON.stringify(matchedFileSummary),
    ]
  );
}

// ============================================================
// 4. 重新评价单条条款
// ============================================================

/**
 * 重新评价单条条款（同步，用于单条重试）
 */
async function reEvaluateSingle(taskId, itemId, user) {
  const itemRes = await pool.query(
    `SELECT * FROM standard_evaluation_items WHERE id = $1 AND is_deleted = FALSE`,
    [itemId]
  );
  if (itemRes.rows.length === 0) throw new Error('评价明细不存在');
  const item = itemRes.rows[0];

  const task = await getTaskById(taskId);
  if (!task) throw new Error('任务不存在');

  const newRound = (task.currentRound || 0) + 1;
  await evaluateSingleClause(taskId, item, newRound);

  return await getEvaluationItem(itemId);
}

module.exports = {
  // 任务管理
  getTaskList,
  getTaskById,
  createTask,
  deleteTask,
  // 明细查询
  getEvaluationItems,
  getEvaluationItem,
  getTaskStats,
  // AI 评价
  startAiEvaluation,
  runAiEvaluation,
  reEvaluateSingle,
};
