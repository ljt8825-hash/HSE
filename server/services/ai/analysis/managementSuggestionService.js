/**
 * AI-10 Management Suggestion Service —— 「AI 分析结果 → 管理建议」最小能力
 *
 * 复用（AI-10 任务书 §4/§9/§13）：
 *  - AI Gateway / Prompt Registry / aiService Provider 路由：全部复用，不新建第二套；
 *  - AI-09 任务结果（aiResult.analysis + statistics_snapshot + evidence）作为唯一输入；
 *  - Evidence 复用 aiEvidenceService，不新建 Evidence 表；
 *  - 持久化复用 ai_generation_records（type='analysis', sub_type='management_suggestion',
 *    title=`管理建议:任务#${taskId}` 作为与任务的关联键），不新建结果表（零 migration）。
 *
 * 人机边界（§7/§8）：
 *  - 只输出建议性内容，供 HSE 管理人员阅读/确认/引用；
 *  - 禁止责任认定 / 扣分 / 处罚 / 整改指令 / 风险等级与考核结果变更（fail-closed 拒绝）；
 *  - 事实、统计、证据、AI 解释、AI 建议、人工决定分层分离，本服务不写任何业务最终字段。
 *
 * 降级（§14）：AI 不可用 → 返回 available=false + 明确 message，保留统计结果，不 500、不伪造成功。
 */

const { pool } = require('../../../config/db');
const gateway = require('../aiGateway');
const { AiError } = require('../errors');
const taskService = require('../tasks/aiAnalysisTaskService');
const analysisService = require('./analysisService');
const { buildSuggestionPrompt } = require('./managementSuggestionPromptBuilder');
const { createEvidence } = require('../aiEvidenceService');

const ERROR = {
  AI_STRUCTURED_OUTPUT_INVALID: 'AI_STRUCTURED_OUTPUT_INVALID',
  AI_BOUNDARY_VIOLATION: 'AI_BOUNDARY_VIOLATION',
  AI_SUGGESTION_NOT_GENERATED: 'AI_SUGGESTION_NOT_GENERATED',
};

const PROMPT_KEY = 'hse.management.suggestion';
const PROMPT_VERSION = 'v1.0';
const RECORD_TYPE = 'analysis';
const RECORD_SUB_TYPE = 'management_suggestion';

/** 与任务的关联键（ai_generation_records.title，零 migration 关联） */
function recordTitle(taskId) {
  return `管理建议:任务#${taskId}`;
}

/** 分离 evidence：统计分析依据 vs 制度/知识依据 */
function splitEvidence(evidence = []) {
  const business = [];
  const knowledge = [];
  for (const e of evidence || []) {
    if (e && e.source_type === 'knowledge_base') knowledge.push(e);
    else if (e) business.push(e);
  }
  return { business, knowledge };
}

/**
 * 校验管理建议结构化协议（AI-10 任务书 §6）
 * - 必需字段缺失 → 拒绝（fail-closed）
 * - 字段类型错误 → 拒绝
 * - 空数组 → 结构合法（允许；语义由人工研判）
 * - 超长内容 → 拒绝（AI_STRUCTURED_OUTPUT_INVALID）
 */
function validateSuggestion(parsed) {
  const required = [
    'overall_assessment',
    'priority_issues',
    'management_actions',
    'monitoring_points',
    'follow_up_suggestions',
    'limitations',
  ];
  const missing = required.filter((k) => parsed[k] == null);
  if (missing.length > 0) {
    throw new AiError(ERROR.AI_STRUCTURED_OUTPUT_INVALID, `管理建议结构化输出缺少字段: ${missing.join(', ')}`);
  }
  for (const arrKey of ['priority_issues', 'management_actions', 'monitoring_points', 'follow_up_suggestions', 'limitations']) {
    if (!Array.isArray(parsed[arrKey])) {
      throw new AiError(ERROR.AI_STRUCTURED_OUTPUT_INVALID, `管理建议字段 ${arrKey} 必须是数组`);
    }
  }
  if (typeof parsed.overall_assessment !== 'string') {
    throw new AiError(ERROR.AI_STRUCTURED_OUTPUT_INVALID, '管理建议字段 overall_assessment 必须是字符串');
  }
  if (parsed.overall_assessment.length > 200) {
    throw new AiError(ERROR.AI_STRUCTURED_OUTPUT_INVALID, '管理建议总体判断超长（>200字），拒绝采用');
  }
  for (const arrKey of ['priority_issues', 'management_actions', 'monitoring_points', 'follow_up_suggestions', 'limitations']) {
    for (const item of parsed[arrKey]) {
      if (typeof item !== 'string') {
        throw new AiError(ERROR.AI_STRUCTURED_OUTPUT_INVALID, `管理建议字段 ${arrKey} 元素必须是字符串`);
      }
      if (item.length > 120) {
        throw new AiError(ERROR.AI_STRUCTURED_OUTPUT_INVALID, `管理建议字段 ${arrKey} 存在超长元素（>120字），拒绝采用`);
      }
    }
  }
  return parsed;
}

/** 越权表述检测（fail-closed）：责任认定 / 扣分 / 处罚 / 整改指令 / 风险与考核结果变更 */
const BOUNDARY_PATTERNS = [
  { label: '责任认定', re: /(认定|判定|确认|确系|就是)[^。；，,]{0,8}(违规|责任|事故)|(责任人|责任主体|责任部门|肇事者)[^。；，,]{0,6}(是|为|：|:)|(事故|隐患|三违)[^。；，,]{0,4}(责任|责任人)/ },
  { label: '扣分/罚款', re: /(扣|罚)[^。；，,]{0,6}\d+\s*分|(应|应当|应该|必须)[^。；，,]{0,6}(扣|罚)/ },
  { label: '处罚/处分', re: /(处罚|处分|追责|问责|停职|降职|开除|通报批评|记过|警告处分)/ },
  { label: '整改指令', re: /(责令|下达|强制|部署)\s*(限期)?\s*整改|限期整改(通知|令|指令|任务)|责令[^。；，,]{0,10}(限期)?整改/ },
  { label: '风险等级变更', re: /风险等级[^。；，,]{0,6}(调整|改变|升级|降级|变更为)/ },
  { label: '考核结果变更', re: /考核结果[^。；，,]{0,6}(调整|改变|判定|不合格)|考核[^。；，,]{0,4}(扣分|扣减)/ },
];

function findBoundaryViolation(suggestion) {
  const texts = [suggestion.overall_assessment,
    ...(suggestion.priority_issues || []),
    ...(suggestion.management_actions || []),
    ...(suggestion.follow_up_suggestions || [])];
  for (const { label, re } of BOUNDARY_PATTERNS) {
    for (const t of texts) {
      const m = t && re.exec(t);
      if (m) return { label, matched: m[0] };
    }
  }
  return null;
}

/** 边界校验（fail-closed）：命中禁止表述 → 拒绝采用 */
function assertBoundary(suggestion) {
  const hit = findBoundaryViolation(suggestion);
  if (hit) {
    throw new AiError(
      ERROR.AI_BOUNDARY_VIOLATION,
      `AI 输出包含禁止的最终结论表述（${hit.label}：「${hit.matched}」），已拒绝采用；请由管理人员根据统计结果与 AI 建议人工研判`
    );
  }
  return suggestion;
}

/** 解析 AI 输出 JSON（复用 AI-06 fail-closed 解析器） */
function parseSuggestionOutput(content) {
  return analysisService.parseStructuredOutput(content);
}

/**
 * 查询已生成的管理建议（缓存：ai_generation_records 关联键 title）
 * @returns {Promise<Object|null>} null = 未生成过
 */
async function findCachedSuggestion(taskId) {
  const r = await pool.query(
    `SELECT * FROM ai_generation_records
     WHERE type = $1 AND sub_type = $2 AND title = $3
     ORDER BY id DESC LIMIT 1`,
    [RECORD_TYPE, RECORD_SUB_TYPE, recordTitle(taskId)]
  );
  return r.rows[0] || null;
}

/** 记录行 → API 建议结果（解析 + 校验；无效缓存如实报错，不伪装成功） */
function toSuggestionResult(record, taskId) {
  const base = {
    taskId,
    cached: true,
    recordId: record.id,
    provider: record.provider || null,
    model: record.model || null,
    promptKey: record.prompt_key || PROMPT_KEY,
    promptVersion: record.prompt_version || PROMPT_VERSION,
    durationMs: record.duration_ms != null ? record.duration_ms : null,
    evidence: record.evidence || [],
    createdAt: record.created_at || null,
  };
  try {
    const parsed = validateSuggestion(parseSuggestionOutput(record.result));
    assertBoundary(parsed);
    return { ...base, available: true, structured: true, suggestion: parsed };
  } catch (e) {
    return {
      ...base,
      available: false,
      structured: false,
      suggestion: null,
      code: e && e.code ? e.code : ERROR.AI_STRUCTURED_OUTPUT_INVALID,
      message: `已存在的管理建议记录无效（${(e && e.message) || '解析失败'}）；可重新生成`,
    };
  }
}

/**
 * 生成管理建议（AI-09 任务结果 → 建议上下文 → AI Gateway → 结构化管理建议）
 * @param {number|string} taskId - 分析任务 ID（须 COMPLETED 且 aiResult 可用）
 * @param {Object} [opts]
 * @param {number} [opts.userId]
 * @param {string} [opts.provider] - 显式 Provider（缺省活动 Provider）
 * @param {boolean} [opts.force] - true 时忽略已有缓存，重新生成
 * @returns {Promise<Object>} 结构同 toSuggestionResult（degraded 时 available=false）
 */
async function generateSuggestion(taskId, { userId = null, provider = null, force = false } = {}) {
  const task = await taskService.getTask(taskId);
  if (task.status !== 'COMPLETED') {
    throw new AiError('AI_TASK_INVALID_STATE', `仅 COMPLETED 任务可生成管理建议（当前: ${task.status}）`);
  }

  const aiResult = task.aiResult || null;
  const statistics = task.statisticsSnapshot || null;

  // AI 分析不可用 → 不生成、不伪造成功，保留统计结果
  if (!aiResult || aiResult.available !== true || !aiResult.analysis) {
    return {
      taskId,
      available: false,
      structured: false,
      suggestion: null,
      code: (aiResult && aiResult.code) || 'AI_UNAVAILABLE',
      message:
        (aiResult && aiResult.message) ||
        'AI 分析不可用或未生成结构化结果，无法生成管理建议；请根据统计结果由管理人员人工研判。',
      statistics,
      degraded: true,
    };
  }

  // 缓存复用（force=true 跳过）
  if (!force) {
    const cached = await findCachedSuggestion(taskId);
    if (cached) return toSuggestionResult(cached, taskId);
  }

  // 建议上下文：AI-09 分析结果 + 统计快照 + 制度依据（复用任务 evidence 中的知识库项）
  const { knowledge } = splitEvidence(task.evidence || []);
  const prompt = buildSuggestionPrompt(aiResult.analysis, statistics, { ragEvidence: knowledge });

  // 依据：复用任务 evidence（统计分析依据 + 制度/知识依据）+ 与任务的追溯链
  const linkageEvidence = createEvidence({
    sourceType: 'business_record',
    sourceId: taskId,
    sourceDomain: 'analysis_task',
    sourceField: 'management_suggestion',
    evidenceText: `管理建议基于 AI 分析任务 #${taskId} 的结构化分析结果与统计快照生成，可追溯至该任务的 statistics_snapshot 与 evidence`,
    evidenceStrength: 'high',
  });
  const evidence = [...(task.evidence || []), linkageEvidence];

  try {
    const result = await gateway.generate({
      promptKey: PROMPT_KEY,
      promptVersion: PROMPT_VERSION,
      data: {},
      customInstructions: prompt,
      evidence,
      provider,
      userId,
      sourceDomain: 'analysis',
      sourceRecordId: taskId,
      record: {
        type: RECORD_TYPE,
        subType: RECORD_SUB_TYPE,
        title: recordTitle(taskId),
      },
    });

    const parsed = validateSuggestion(parseSuggestionOutput(result.content));
    assertBoundary(parsed);

    return {
      taskId,
      available: true,
      structured: true,
      suggestion: parsed,
      provider: result.provider,
      model: result.model,
      promptKey: result.promptKey,
      promptVersion: result.promptVersion,
      durationMs: result.durationMs,
      recordId: result.recordId,
      recordSaved: !!result.recordSaved,
      ...(result.recordError ? { recordError: result.recordError } : {}),
      evidence: result.evidence || [],
      statistics,
      cached: false,
    };
  } catch (e) {
    // 降级语义与 AI-06 一致：不 500、不伪造成功；结构化/边界失败标记 structured=false
    return {
      taskId,
      available: false,
      structured: e && e.name === 'AiError' && e.code === ERROR.AI_STRUCTURED_OUTPUT_INVALID ? false : null,
      suggestion: null,
      code: e && e.code ? e.code : 'AI_PROVIDER_UNREACHABLE',
      message: (e && e.message) || 'AI 调用失败',
      statistics,
      degraded: true,
    };
  }
}

/**
 * 查询管理建议（不触发生成）
 * @returns {Promise<Object>} 未生成过 → available=false + AI_SUGGESTION_NOT_GENERATED
 */
async function getSuggestion(taskId) {
  const task = await taskService.getTask(taskId);
  const cached = await findCachedSuggestion(taskId);
  if (cached) return toSuggestionResult(cached, taskId);
  return {
    taskId,
    available: false,
    structured: null,
    suggestion: null,
    code: ERROR.AI_SUGGESTION_NOT_GENERATED,
    message: '尚未生成管理建议，可点击「生成管理建议」由 AI 基于本任务分析结果生成。',
    statistics: task.statisticsSnapshot || null,
    cached: false,
  };
}

module.exports = {
  ERROR,
  PROMPT_KEY,
  PROMPT_VERSION,
  RECORD_TYPE,
  RECORD_SUB_TYPE,
  recordTitle,
  splitEvidence,
  validateSuggestion,
  assertBoundary,
  findBoundaryViolation,
  BOUNDARY_PATTERNS,
  parseSuggestionOutput,
  findCachedSuggestion,
  toSuggestionResult,
  generateSuggestion,
  getSuggestion,
};
