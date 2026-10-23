/**
 * SK-005 企业知识问答 Skill（公司级标准 AI Skill — 样板工程）
 *
 * 定位（AI-Phase-01-02 任务书 §六）：
 *   Skill ID     SK-005
 *   Skill Name   企业知识问答
 *   技术标识      company.knowledge.answer
 *   Version      v1.0.0
 *   Domain       company
 *   Type         knowledge_qa
 *
 * 强制链路（禁止绕过 AI Gateway，§四）：
 *   SK-005 → 权限检查 → Retriever（现有 RAG）→ Evidence → Prompt Registry
 *          → AI Gateway → Provider Registry → Model → Answer → Evidence + Record
 *
 * 复用原则（§三 / §二十四）：
 *   - 不重建 RAG：复用 retriever / ragContextBuilder / vectorStore / knowledge_* 表；
 *   - 不直连模型：只调用 aiGateway；
 *   - 复用 aiPromptRegistry / aiEvidenceService / ai_generation_records。
 *
 * 模型不写死（§十六）：通过 MODEL_POLICIES[knowledge_qa] 交给 Gateway/Provider Registry 决定。
 */

const { AI_ERROR_CODES, AiError } = require('../errors');
const gateway = require('../aiGateway');
const { createRequestContext } = require('../aiRequestContext');
const retriever = require('../knowledge/retriever');
const ragContextBuilder = require('../knowledge/ragContextBuilder');
const sourceService = require('../knowledge/knowledgeSourceService');
const generationRecordService = require('../aiGenerationRecordService');

// ============================================================
// Skill 元数据（标准定义）
// ============================================================
const SKILL_ID = 'SK-005';
const SKILL_NAME = '企业知识问答';
const SKILL_KEY = 'company.knowledge.answer';
const SKILL_VERSION = 'v1.0.0';
const SKILL_DOMAIN = 'company';
const SKILL_TYPE = 'knowledge_qa';

/** 允许调用 SK-005 的角色（fail-closed：不在清单内一律拒绝，§九） */
const SKILL_ALLOWED_ROLES = [
  'system_admin',
  'admin',
  'safety_manager',
  'hse_manager',
  'manager',
  'township_manager',
  'viewer',
  'grid_inspector',
];

/**
 * Model Policy（§十六：模型不得写死）
 * 任务类型 → 策略。具体 Provider / Model 由 AI Gateway + Provider Registry 决定。
 * provider=null 表示交给 Gateway 的「当前活动 Provider」，不在 Skill 中写死 qwen/grok/deepseek。
 */
const MODEL_POLICIES = {
  knowledge_qa: {
    provider: null,
    promptKey: SKILL_KEY,
    promptVersion: SKILL_VERSION,
    options: { temperature: 0.2, maxTokens: 1024 },
  },
};

/** 输入边界 */
const INPUT_LIMITS = {
  questionMaxLength: 1000,
  topKMin: 1,
  topKMax: 10,
  conversationIdMaxLength: 128,
};

/** 最低相关性阈值：低于该值视为「未检索到足够的企业知识依据」（§十一 防幻觉） */
const MIN_RELEVANCE_SCORE = 0.3;

/** 人机边界声明（§十八） */
const DISCLAIMER =
  '本回答由 AI 基于企业知识库检索结果生成，仅为 AI 辅助信息获取，' +
  '不构成正式制度解释、法律意见或管理决定；涉及高风险业务时请以正式制度文件和人工审核为准。';

const NO_ANSWER_TEXT =
  '未检索到足够的企业知识依据，无法确认该问题。\n' +
  '为避免提供不准确信息，本次不作推测性回答，建议补充相关制度/文件后再查询。';

// ============================================================
// 权限错误（与 AI 错误模型区分：属访问控制层）
// ============================================================
function permissionError(message) {
  const err = new Error(message);
  err.name = 'SkillPermissionError';
  err.code = 'SKILL_PERMISSION_DENIED';
  return err;
}

// ============================================================
// 输入校验（§七 / §八）
// ============================================================

/** 归一化输入（补齐默认值；不做语义判断） */
function normalizeInput(raw = {}) {
  return {
    question: typeof raw.question === 'string' ? raw.question : (raw.query != null ? String(raw.query) : ''),
    knowledge_scope: raw.knowledge_scope != null ? raw.knowledge_scope : (raw.knowledgeScope != null ? raw.knowledgeScope : []),
    conversation_id: raw.conversation_id != null ? raw.conversation_id : (raw.conversationId != null ? raw.conversationId : null),
    top_k: raw.top_k != null ? raw.top_k : (raw.topK != null ? raw.topK : 5),
    require_citation: raw.require_citation != null ? raw.require_citation : (raw.requireCitation != null ? raw.requireCitation : true),
  };
}

/**
 * 校验输入合法性
 * @returns {{valid:boolean, errors:Array<{field:string, code:string, message:string}>, input:Object}}
 */
function validateInput(input) {
  const errors = [];

  // question
  const q = String(input.question || '').trim();
  if (!q) {
    errors.push({ field: 'question', code: 'REQUIRED', message: 'question 不能为空' });
  } else if (q.length > INPUT_LIMITS.questionMaxLength) {
    errors.push({
      field: 'question',
      code: 'TOO_LONG',
      message: `question 长度不得超过 ${INPUT_LIMITS.questionMaxLength} 字（当前 ${q.length}）`,
    });
  }

  // top_k
  const topK = Number(input.top_k);
  if (!Number.isInteger(topK) || topK < INPUT_LIMITS.topKMin || topK > INPUT_LIMITS.topKMax) {
    errors.push({
      field: 'top_k',
      code: 'OUT_OF_RANGE',
      message: `top_k 必须是 ${INPUT_LIMITS.topKMin}~${INPUT_LIMITS.topKMax} 之间的整数`,
    });
  }

  // require_citation
  if (typeof input.require_citation !== 'boolean') {
    errors.push({ field: 'require_citation', code: 'INVALID_TYPE', message: 'require_citation 必须是布尔值' });
  }

  // conversation_id
  if (input.conversation_id != null && String(input.conversation_id).length > INPUT_LIMITS.conversationIdMaxLength) {
    errors.push({
      field: 'conversation_id',
      code: 'TOO_LONG',
      message: `conversation_id 长度不得超过 ${INPUT_LIMITS.conversationIdMaxLength}`,
    });
  }

  // knowledge_scope
  if (!Array.isArray(input.knowledge_scope)) {
    errors.push({ field: 'knowledge_scope', code: 'INVALID_TYPE', message: 'knowledge_scope 必须是数组' });
  } else {
    const tokens = input.knowledge_scope.map((s) => String(s).trim()).filter(Boolean);
    const hasAll = tokens.includes('all');
    const sourceTypes = [];
    const sourceIds = [];
    for (const t of tokens) {
      if (t === 'all') continue;
      if (t.startsWith('sourceType:')) {
        sourceTypes.push(t.slice('sourceType:'.length));
      } else if (t.startsWith('sourceId:')) {
        const idStr = t.slice('sourceId:'.length);
        if (!/^\d+$/.test(idStr)) {
          errors.push({ field: 'knowledge_scope', code: 'INVALID_TOKEN', message: `非法知识范围标识: ${t}` });
        } else {
          sourceIds.push(Number(idStr));
        }
      } else {
        errors.push({
          field: 'knowledge_scope',
          code: 'INVALID_TOKEN',
          message: `非法知识范围标识: ${t}（支持 all | sourceType:<类型> | sourceId:<数字ID>）`,
        });
      }
    }
    if (hasAll && tokens.length > 1) {
      errors.push({ field: 'knowledge_scope', code: 'CONFLICT', message: 'knowledge_scope 中 all 不能与其他范围同时出现' });
    }
    if (sourceTypes.length > 1) {
      errors.push({
        field: 'knowledge_scope',
        code: 'NOT_SUPPORTED',
        message: '当前检索层仅支持单一 sourceType 过滤（不支持多类型 OR），请只指定一个 sourceType',
      });
    }
    if (sourceIds.length > 0 && sourceTypes.length > 0) {
      errors.push({
        field: 'knowledge_scope',
        code: 'NOT_SUPPORTED',
        message: '当前检索层不支持 sourceId 与 sourceType 组合过滤，请只指定其中之一',
      });
    }
    if (sourceTypes.length === 1 && !sourceService.SOURCE_TYPES.includes(sourceTypes[0])) {
      errors.push({
        field: 'knowledge_scope',
        code: 'UNKNOWN_SOURCE_TYPE',
        message: `未知知识源类型: ${sourceTypes[0]}（可选: ${sourceService.SOURCE_TYPES.join('/')}）`,
      });
    }
    input.knowledge_scope = tokens;
  }

  return { valid: errors.length === 0, errors, input };
}

// ============================================================
// 权限与范围解析（§九）
// ============================================================
/**
 * 解析调用者权限 → 有效检索过滤条件
 *
 * 现状（如实标注，不假装已支持）：
 * - 现有知识库表 knowledge_sources 无 owner/role/部门字段 → 无「用户 ↔ 知识源」ACL；
 * - 因此当前权限模型 = 角色级准入（allowlist，fail-closed）+ 输入范围收敛（只能收窄，不能越权扩大）
 *   + 强制「源 ACTIVE & 文档 READY」。
 * - 部门级/知识源级数据权限为缺口（设计见实施报告 §权限，不执行 migration）。
 *
 * @param {{userId:number|null, role:string|null}} actor
 * @param {Object} input - 已归一化输入
 * @returns {Promise<{filters:Object, scope:Object, warnings:string[]}>}
 */
async function resolvePermission(actor, input) {
  if (!actor || actor.userId == null) {
    throw permissionError('无法识别用户身份，禁止调用 SK-005');
  }
  if (!actor.role || !SKILL_ALLOWED_ROLES.includes(actor.role)) {
    throw permissionError(`当前角色（${actor.role || '未知'}）无权使用 SK-005 企业知识问答`);
  }

  const warnings = [];
  const filters = {};
  const scope = { requested: input.knowledge_scope || [], applied: 'all', acl: false };

  for (const token of input.knowledge_scope || []) {
    if (token === 'all') continue;
    if (token.startsWith('sourceType:')) {
      filters.sourceType = token.slice('sourceType:'.length);
      scope.applied = token;
    } else if (token.startsWith('sourceId:')) {
      const id = Number(token.slice('sourceId:'.length));
      // 不能引用不存在或已停用的知识源（防止越权访问已下线内容）
      const source = await sourceService.getSource(id);
      if (!source || source.status !== 'ACTIVE') {
        throw new AiError(
          AI_ERROR_CODES.AI_INVALID_REQUEST,
          `知识范围不可用：sourceId=${id} 不存在或已停用`,
          { validationErrors: [{ field: 'knowledge_scope', code: 'SOURCE_UNAVAILABLE', message: `sourceId=${id} 不存在或已停用` }] }
        );
      }
      filters.sourceId = id;
      scope.applied = token;
    }
  }

  if (scope.applied !== 'all') {
    warnings.push('已按 knowledge_scope 收敛检索范围；检索层强制仅返回「启用知识源 + READY 文档」。');
  }
  return { filters, scope, warnings };
}

// ============================================================
// 输出组装（§十三 / §十四）
// ============================================================
/** 检索结果 + evidence → 可追溯引用列表（字段缺失保留 null，不伪造） */
function buildTraceableEvidence(contextItems, citations) {
  return contextItems.map((it, i) => ({
    citation_id: it.citationId,
    chunk_id: it.chunkId,
    document_id: it.documentId,
    document_name: it.documentTitle,
    source_id: it.sourceId,
    source_name: it.sourceName,
    source_type: it.sourceType,
    page: it.page != null ? it.page : null,
    section: it.section != null ? it.section : null,
    content: it.content,
    score: it.score,
    evidence_strength: citations[i] ? citations[i].evidence_strength : null,
  }));
}

/** 依据证据强度计算置信度（§十三 confidence） */
function deriveConfidence(bestScore) {
  if (bestScore == null) return 'low';
  if (bestScore >= 0.6) return 'high';
  if (bestScore >= 0.4) return 'medium';
  return 'low';
}

/**
 * 判定模型回答是否为「资料不足」（§十一 第二道防线）
 * 检索层虽返回了候选资料，但模型判定其不足以回答时，统一降级为 low，
 * 避免把「资料不足」的拒答误报为高置信度。
 */
function isInsufficientAnswer(text) {
  const t = String(text || '');
  return /不足以回答|资料不足|知识库中未找到|未检索到|无法回答(该|此)?问题|未涉及相关|未提供相关|没有相关(内容|资料)/.test(t);
}

/** 统一 skill 标识块 */
function skillBlock() {
  return { id: SKILL_ID, name: SKILL_NAME, key: SKILL_KEY, version: SKILL_VERSION, domain: SKILL_DOMAIN, type: SKILL_TYPE };
}

/** Skill 清单（供 GET /skills） */
function manifest() {
  return {
    ...skillBlock(),
    allowed_roles: SKILL_ALLOWED_ROLES,
    model_policy: SKILL_TYPE,
    prompt_key: MODEL_POLICIES[SKILL_TYPE].promptKey,
    prompt_version: MODEL_POLICIES[SKILL_TYPE].promptVersion,
    input_schema: {
      question: { type: 'string', required: true, maxLength: INPUT_LIMITS.questionMaxLength },
      knowledge_scope: { type: 'array<string>', default: [], note: 'all | sourceType:<类型> | sourceId:<ID>' },
      conversation_id: { type: 'string|null', default: null },
      top_k: { type: 'integer', min: INPUT_LIMITS.topKMin, max: INPUT_LIMITS.topKMax, default: 5 },
      require_citation: { type: 'boolean', default: true },
    },
    output_schema: {
      success: 'boolean',
      skill: 'object',
      request_id: 'string',
      answer: 'string',
      evidence: 'array<object>',
      confidence: 'high|medium|low',
      warnings: 'array<string>',
      suggestions: 'array<string>',
      metadata: 'object',
    },
  };
}

// ============================================================
// 主流程
// ============================================================
/**
 * SK-005 企业知识问答
 * @param {Object} rawInput - { question, knowledge_scope, conversation_id, top_k, require_citation }
 * @param {{userId:number|null, role:string|null}} actor - 认证上下文（req.user 派生的最小字段）
 * @returns {Promise<Object>} 统一输出协议（§十三）
 */
async function answer(rawInput = {}, actor = {}) {
  const startAt = Date.now();
  const input = normalizeInput(rawInput);

  // 1) 输入校验 → 结构化错误
  const { valid, errors } = validateInput(input);
  if (!valid) {
    throw new AiError(
      AI_ERROR_CODES.AI_INVALID_REQUEST,
      `SK-005 输入校验失败：${errors.map((e) => e.message).join('；')}`,
      { validationErrors: errors }
    );
  }

  // 2) 权限与范围
  const perm = await resolvePermission(actor, input);
  const warnings = [...perm.warnings];
  const suggestions = [];

  // 3) 检索（复用现有 RAG retriever，不重建）
  const ret = await retriever.retrieve(input.question.trim(), {
    topK: Number(input.top_k),
    filters: perm.filters,
  });
  const retrievalMeta = {
    mode: 'vector(pgvector_cosine)',
    available: !!ret.available,
    top_k: Number(input.top_k),
    filters: perm.filters,
    scope: perm.scope,
    count: 0,
    best_score: null,
    embedding_model: ret.embeddingModel || null,
    embedding_dimension: ret.embeddingDimension || null,
  };

  // 3a) 检索能力不可用 → 结构化错误（属基础设施/Provider 异常，不是「无知识」）
  if (!ret.available) {
    const err = new AiError(
      AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
      `知识检索能力不可用：${ret.reason || '未知原因'}`,
      { provider: null }
    );
    await _saveSkillRecord({
      actor, input, status: 'failed', errorMessage: `检索不可用: ${ret.reason || ''}`,
      requestId: createRequestContext({ userId: actor.userId }).requestId,
      provider: null, model: null, durationMs: Date.now() - startAt, result: null, evidence: [],
    });
    throw err;
  }

  const results = ret.results || [];
  retrievalMeta.count = results.length;
  const bestScore = results.length ? Math.max(...results.map((r) => Number(r.score) || 0)) : null;
  retrievalMeta.best_score = bestScore;

  const metadataBase = {
    skill_key: SKILL_KEY,
    skill_id: SKILL_ID,
    skill_version: SKILL_VERSION,
    model_policy: SKILL_TYPE,
    prompt_key: MODEL_POLICIES[SKILL_TYPE].promptKey,
    prompt_version: MODEL_POLICIES[SKILL_TYPE].promptVersion,
    provider: null,
    model: null,
    duration_ms: 0,
    retrieval: retrievalMeta,
    record_id: null,
    record_saved: false,
    gateway_request_id: null,
    trace_id: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    citation_required: input.require_citation,
    conversation_id: input.conversation_id,
    permission_model: 'role_allowlist + scope_narrowing（无知识源级 ACL）',
    disclaimer: DISCLAIMER,
  };

  // 4) 无检索结果 / 相关性不足 → 安全处理（§十一：禁止凭常识回答）
  if (results.length === 0 || bestScore == null || bestScore < MIN_RELEVANCE_SCORE) {
    warnings.push('知识库中未检索到与该问题相关的有效资料。');
    if (results.length > 0) {
      warnings.push(`检索到的最相关资料相关性偏低（最高分 ${bestScore}），未作为回答依据。`);
    }
    suggestions.push('请补充或上传与该问题相关的制度/文件后再试');
    suggestions.push('可尝试换用更具体的关键词重新提问');
    if (!input.require_citation) {
      warnings.push('当前为非强制引用模式，仍返回可追溯证据字段。');
    }

    const requestId = createRequestContext({ userId: actor.userId }).requestId;
    const rec = await _saveSkillRecord({
      actor, input, status: 'success', requestId,
      provider: null, model: null, durationMs: Date.now() - startAt,
      result: NO_ANSWER_TEXT, evidence: [],
    });

    return {
      success: true,
      skill: skillBlock(),
      request_id: requestId,
      answer: NO_ANSWER_TEXT,
      evidence: [],
      confidence: 'low',
      warnings,
      suggestions,
      metadata: {
        ...metadataBase,
        duration_ms: Date.now() - startAt,
        record_id: rec.recordId,
        record_saved: rec.recordSaved,
      },
    };
  }

  // 5) 上下文 + Evidence 组装（复用现有 ragContextBuilder）
  const ctx = ragContextBuilder.buildContext(input.question.trim(), results);
  const dataText = ragContextBuilder.formatContextText(ctx.contextItems);
  const evidence = buildTraceableEvidence(ctx.contextItems, ctx.citations);
  let confidence = deriveConfidence(bestScore);

  if (confidence === 'low') {
    warnings.push('检索资料与问题的相关性较弱，回答仅供参考。');
  }
  if (!input.require_citation) {
    warnings.push('当前为非强制引用模式，仍返回可追溯证据字段。');
  }

  // 6) AI Gateway 生成（禁止直连模型；Prompt Registry + Evidence + Generation Record 统一收敛）
  const policy = MODEL_POLICIES[SKILL_TYPE];
  let gatewayResult;
  try {
    gatewayResult = await gateway.generate({
      promptKey: policy.promptKey,
      promptVersion: policy.promptVersion,
      data: dataText,
      customInstructions: input.question.trim(),
      evidence: ctx.citations,
      provider: policy.provider,
      options: policy.options,
      userId: actor.userId,
      sourceDomain: 'knowledge_base',
      record: { type: SKILL_TYPE, subType: SKILL_ID, title: input.question.trim().slice(0, 200) },
    });
  } catch (err) {
    // Provider / Gateway 异常：结构化错误 + 失败记录（§十七 success/error；§二十七 T07）
    await _saveSkillRecord({
      actor, input, status: 'failed',
      errorMessage: err && err.message ? err.message : String(err),
      requestId: err && err.details && err.details.requestId ? err.details.requestId : createRequestContext({ userId: actor.userId }).requestId,
      provider: err && err.provider ? err.provider : null,
      model: null,
      durationMs: Date.now() - startAt,
      result: null,
      evidence: ctx.citations,
    });
    throw err;
  }

  if (input.require_citation && evidence.length === 0) {
    warnings.push('要求引用但未生成可追溯证据，请复核检索配置。');
  }

  // 模型判定「资料不足」→ 降级为 low（§十一 第二道防线，避免误报高置信度）
  if (isInsufficientAnswer(gatewayResult.content)) {
    confidence = 'low';
    warnings.push('模型判定现有企业知识资料不足以回答该问题，回答仅为资料线索，请以正式制度文件为准。');
    suggestions.push('建议补充与该问题直接相关的制度/文件后再查询');
  }

  return {
    success: true,
    skill: skillBlock(),
    request_id: gatewayResult.requestId,
    answer: gatewayResult.content,
    evidence,
    confidence,
    warnings,
    suggestions,
    metadata: {
      ...metadataBase,
      provider: gatewayResult.provider,
      model: gatewayResult.model,
      duration_ms: gatewayResult.durationMs || Date.now() - startAt,
      record_id: gatewayResult.recordId || null,
      record_saved: !!gatewayResult.recordSaved,
      gateway_request_id: gatewayResult.requestId,
      trace_id: gatewayResult.traceId || null,
      usage: { input_tokens: gatewayResult.inputTokens || 0, output_tokens: gatewayResult.outputTokens || 0 },
    },
  };
}

/** 直接写 SK-005 执行记录（无模型调用 / 失败路径；复用 ai_generation_records，不新增表） */
async function _saveSkillRecord({ actor, input, status, requestId, provider, model, durationMs, result, evidence, errorMessage }) {
  try {
    const saved = await generationRecordService.saveGenerationRecord({
      userId: actor.userId,
      type: SKILL_TYPE,
      subType: SKILL_ID,
      title: String(input.question || '').slice(0, 200),
      prompt: '', // 无模型调用时不保存完整 prompt；有模型调用时由 Gateway 落库
      result,
      provider,
      model,
      inputTokens: 0,
      outputTokens: 0,
      durationMs,
      status,
      errorMessage: errorMessage || null,
      requestId,
      promptKey: MODEL_POLICIES[SKILL_TYPE].promptKey,
      promptVersion: MODEL_POLICIES[SKILL_TYPE].promptVersion,
      evidence,
    });
    return { recordId: saved.id, recordSaved: true };
  } catch (err) {
    return { recordId: null, recordSaved: false, recordError: err.message };
  }
}

module.exports = {
  SKILL_ID,
  SKILL_NAME,
  SKILL_KEY,
  SKILL_VERSION,
  SKILL_DOMAIN,
  SKILL_TYPE,
  SKILL_ALLOWED_ROLES,
  MODEL_POLICIES,
  INPUT_LIMITS,
  MIN_RELEVANCE_SCORE,
  DISCLAIMER,
  normalizeInput,
  validateInput,
  resolvePermission,
  deriveConfidence,
  isInsufficientAnswer,
  manifest,
  answer,
};