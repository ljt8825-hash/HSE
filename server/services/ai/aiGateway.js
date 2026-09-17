/**
 * HSE AI Gateway（AI-02 Capability Layer 统一入口）
 *
 * 业务模块统一通过本 Gateway 调用 AI 能力层，不再直接调用 Grok/Ollama/具体模型。
 * 设计基线：AI-02 任务书 §10。
 *
 * 统一解决：Provider 选择 / 健康检查 / Prompt 选择 / 请求上下文 / 超时 /
 * 重试（复用 aiService）/ 错误标准化 / AI generation record / evidence metadata /
 * AI confidence / requestId / traceId。
 */

const { AI_ERROR_CODES, AiError, toErrorResponse } = require('./errors');
const { createRequestContext } = require('./aiRequestContext');
const { createEvidence, attachEvidence, validateEvidenceList } = require('./aiEvidenceService');
const promptRegistry = require('./aiPromptRegistry');
const providerRegistry = require('./aiProviderRegistry');
const { isAiDisabled, HEALTH_STATUS } = require('./aiHealthService');
const generationRecordService = require('./aiGenerationRecordService');
const aiService = require('../aiService');

/** 健康状态 → 统一错误码 */
const HEALTH_TO_ERROR = {
  [HEALTH_STATUS.DISABLED]: AI_ERROR_CODES.AI_NOT_ENABLED,
  [HEALTH_STATUS.NOT_CONFIGURED]: AI_ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
  [HEALTH_STATUS.UNREACHABLE]: AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
  [HEALTH_STATUS.ERROR]: AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
  [HEALTH_STATUS.AUTH_ERROR]: AI_ERROR_CODES.AI_AUTH_ERROR,
  [HEALTH_STATUS.MODEL_NOT_FOUND]: AI_ERROR_CODES.AI_MODEL_NOT_FOUND,
  [HEALTH_STATUS.TIMEOUT]: AI_ERROR_CODES.AI_TIMEOUT,
};

/** 全局启用检查（AI_ENABLE=false → 拒绝所有调用） */
function assertEnabled() {
  if (isAiDisabled()) {
    throw new AiError(AI_ERROR_CODES.AI_NOT_ENABLED, 'AI 能力层未启用（AI_ENABLE=false）');
  }
}

/**
 * 解析最终 prompt 文本（promptKey 优先，其次直接 prompt）
 * @returns {{prompt:string, promptKey:string|null, promptVersion:string|null}}
 */
function resolvePrompt({ prompt, promptKey, promptVersion, data, customInstructions, systemPrompt }) {
  if (promptKey) {
    const entry = promptRegistry.get(promptKey, promptVersion);
    if (!entry) {
      throw new AiError(AI_ERROR_CODES.AI_INVALID_REQUEST, `Prompt 不存在: ${promptKey}${promptVersion ? `@${promptVersion}` : ''}`);
    }
    const rendered = promptRegistry.render(entry, { data, customInstructions });
    return { prompt: rendered, promptKey: entry.prompt_key, promptVersion: entry.version };
  }
  if (!prompt) {
    throw new AiError(AI_ERROR_CODES.AI_INVALID_REQUEST, '必须提供 prompt 或 promptKey');
  }
  const finalPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  return { prompt: finalPrompt, promptKey: null, promptVersion: null };
}

/** Provider 选择：显式指定 → 活动 Provider → 报错 */
function resolveProvider(providerName) {
  if (providerName) {
    const provider = providerRegistry.getProvider(providerName);
    if (!provider) {
      throw new AiError(AI_ERROR_CODES.AI_PROVIDER_NOT_FOUND, `Provider 不存在: ${providerName}`, { provider: providerName });
    }
    return provider;
  }
  const active = providerRegistry.getActiveProvider();
  if (!active) {
    throw new AiError(AI_ERROR_CODES.AI_PROVIDER_NOT_FOUND, `当前活动 Provider 未注册: ${providerRegistry.getDefaultProviderName()}`);
  }
  return active;
}

/**
 * 调用前健康检查（可选，默认开启；skipHealthCheck=true 跳过）
 * 健康状态不通过时抛对应统一错误码。
 */
async function assertProviderReady(provider, { skipHealthCheck = false } = {}) {
  if (skipHealthCheck) return;
  const health = await provider.healthCheck();
  if (health.status !== HEALTH_STATUS.AVAILABLE) {
    const code = HEALTH_TO_ERROR[health.status] || AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE;
    throw new AiError(code, health.reason || `Provider ${provider.name} 不可用`, { provider: provider.name });
  }
}

/** 校验并规范化证据数组 */
function normalizeEvidence(evidence) {
  if (evidence == null) return [];
  if (!validateEvidenceList(evidence)) {
    throw new AiError(AI_ERROR_CODES.AI_INVALID_REQUEST, 'evidence 结构不合法，请使用 aiEvidenceService.createEvidence 创建');
  }
  return evidence;
}

/** 尝试落库（失败不阻断 AI 结果） */
async function trySaveRecord(result, input, context) {
  if (!input.record) return { recordId: null, recordSaved: false };
  try {
    const saved = await generationRecordService.saveGenerationRecord({
      userId: context.userId,
      type: (input.record && input.record.type) || 'report',
      subType: (input.record && input.record.subType) || null,
      title: (input.record && input.record.title) || null,
      prompt: result.prompt,
      result: result.content,
      provider: result.provider,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
      status: 'success',
      requestId: context.requestId,
      promptKey: result.promptKey,
      promptVersion: result.promptVersion,
      evidence: result.evidence,
    });
    return { recordId: saved.id, recordSaved: true };
  } catch (err) {
    return { recordId: null, recordSaved: false, recordError: err.message };
  }
}

/**
 * 文本生成（非流式）——统一入口
 * @param {Object} input
 * @param {string} [input.prompt] - 直接 prompt（与 promptKey 二选一）
 * @param {string} [input.promptKey] - Prompt Registry 键
 * @param {string} [input.promptVersion]
 * @param {*} [input.data] - promptKey 渲染数据
 * @param {string} [input.customInstructions]
 * @param {string} [input.systemPrompt]
 * @param {string} [input.sourceDomain]
 * @param {number|string} [input.sourceRecordId]
 * @param {number} [input.userId]
 * @param {number} [input.employeeId]
 * @param {string} [input.provider]
 * @param {Object} [input.options] - { temperature, maxTokens, model, ... }
 * @param {Array} [input.evidence] - aiEvidenceService.createEvidence 产物
 * @param {Object} [input.record] - 落库信息 { type, subType, title }（缺省不落库）
 * @param {boolean} [input.skipHealthCheck]
 * @returns {Promise<Object>}
 */
async function generate(input = {}) {
  assertEnabled();

  const context = createRequestContext({
    userId: input.userId,
    employeeId: input.employeeId,
    sourceDomain: input.sourceDomain,
    sourceRecordId: input.sourceRecordId,
    provider: input.provider || null,
    promptKey: input.promptKey || null,
  });

  const { prompt, promptKey, promptVersion } = resolvePrompt(input);
  const provider = resolveProvider(input.provider);
  context.provider = provider.name;
  context.promptKey = promptKey;
  context.promptVersion = promptVersion;

  const evidence = normalizeEvidence(input.evidence);
  await assertProviderReady(provider, input);

  const start = Date.now();
  let chatResult;
  try {
    chatResult = await provider.chat({
      prompt,
      options: { ...input.options, systemPrompt: input.systemPrompt },
    });
  } catch (err) {
    // 统一错误分类（非 AiError → AiError）
    throw err && err.name === 'AiError' ? err : providerRegistry.classifyProviderError(err, provider.name);
  }

  const result = {
    success: true,
    requestId: context.requestId,
    traceId: context.traceId,
    provider: provider.name,
    model: chatResult.model || (provider.getMetadata && provider.getMetadata().model) || null,
    content: chatResult.content,
    promptKey,
    promptVersion,
    inputTokens: chatResult.inputTokens || 0,
    outputTokens: chatResult.outputTokens || 0,
    durationMs: chatResult.durationMs || Date.now() - start,
    // AI-02：非结构化输出无法自动给出可信置信度，保持 null（结构化 analyze 由解析层提供）
    confidence: null,
    prompt: prompt,
  };

  const withEvidence = attachEvidence(result, evidence);
  const recordResult = await trySaveRecord(withEvidence, input, context);

  return {
    ...withEvidence,
    recordId: recordResult.recordId,
    recordSaved: recordResult.recordSaved,
    ...(recordResult.recordError ? { recordError: recordResult.recordError } : {}),
  };
}

/**
 * 流式生成（SSE）——统一入口（AI-03 v2 统一 SSE 信封）
 *
 * 统一协议（事件格式兼容现有 data:{content} 分块实现，补齐生命周期事件）：
 *   event:start → data: {requestId, traceId, provider, model, promptKey, promptVersion}
 *   data: {content: ...}（Provider 原样透传，多帧）
 *   data: [DONE]（Provider 结束标记）
 *   event:end   → data: {requestId, provider, model, durationMs}
 * 错误：event:error → data: {code, message, provider, retryable, requestId}
 *
 * 头部与 event:start 由本 Gateway 先行写入，随后委托 Provider.chatStream
 * （skipHeaders/skipEnd 由 aiService 最小兼容参数支持，旧调用路径行为不变）。
 * 每个请求携带 requestId/traceId（AI-03 §9）。
 *
 * 错误路径：Provider 流中错误 → 写 event:error 并结束响应（不 rethrow）；
 * 头部写入前错误（prompt/Provider/健康检查）→ 抛 AiError 交由路由层补发 error 帧。
 *
 * @param {Object} input - 同 generate
 * @param {import('express').Response} res - Express res（SSE 直接写）
 */
async function stream(input = {}, res) {
  assertEnabled();
  if (!res) throw new AiError(AI_ERROR_CODES.AI_INVALID_REQUEST, 'stream 需要 Express res 对象');

  const context = createRequestContext({
    userId: input.userId,
    employeeId: input.employeeId,
    sourceDomain: input.sourceDomain,
    sourceRecordId: input.sourceRecordId,
    provider: input.provider || null,
    promptKey: input.promptKey || null,
  });

  const { prompt, promptKey, promptVersion } = resolvePrompt(input);
  const provider = resolveProvider(input.provider);
  context.provider = provider.name;
  context.promptKey = promptKey;
  context.promptVersion = promptVersion;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const meta = (provider.getMetadata && provider.getMetadata()) || {};
  res.write(`event: start\ndata: ${JSON.stringify({
    requestId: context.requestId,
    traceId: context.traceId,
    provider: provider.name,
    model: meta.model || null,
    promptKey,
    promptVersion,
  })}\n\n`);

  // 健康检查在 start 帧之后执行：Provider 不可用时客户端仍能收到完整生命周期（start → error）
  try {
    await assertProviderReady(provider, input);
  } catch (err) {
    const unified = err && err.name === 'AiError' ? err : providerRegistry.classifyProviderError(err, provider.name);
    res.write(`event: error\ndata: ${JSON.stringify({
      code: unified.code,
      message: unified.message,
      provider: unified.provider || provider.name,
      retryable: !!unified.retryable,
      requestId: context.requestId,
    })}\n\n`);
    if (!res.writableEnded) res.end();
    return { requestId: context.requestId, traceId: context.traceId, promptKey, promptVersion, provider: provider.name, error: { code: unified.code, message: unified.message } };
  }

  const start = Date.now();
  try {
    const streamResult = await provider.chatStream(
      { prompt, options: { ...input.options, systemPrompt: input.systemPrompt, skipHeaders: true, skipEnd: true } },
      res
    );
    res.write(`event: end\ndata: ${JSON.stringify({
      requestId: context.requestId,
      provider: provider.name,
      model: (streamResult && streamResult.model) || meta.model || null,
      durationMs: (streamResult && streamResult.durationMs) || Date.now() - start,
    })}\n\n`);
    if (!res.writableEnded) res.end();
    return { requestId: context.requestId, traceId: context.traceId, promptKey, promptVersion, provider: provider.name };
  } catch (err) {
    const unified = err && err.name === 'AiError' ? err : providerRegistry.classifyProviderError(err, provider.name);
    res.write(`event: error\ndata: ${JSON.stringify({
      code: unified.code,
      message: unified.message,
      provider: unified.provider || provider.name,
      retryable: !!unified.retryable,
      requestId: context.requestId,
    })}\n\n`);
    if (!res.writableEnded) res.end();
    return { requestId: context.requestId, traceId: context.traceId, promptKey, promptVersion, provider: provider.name, error: { code: unified.code, message: unified.message } };
  }
}

/**
 * 结构化分析（统一入口）——调用文本生成并尝试解析 JSON 输出
 * @param {Object} input - 同 generate
 * @returns {Promise<Object>} 结果含 data（解析后的 JSON）与 parseError（解析失败时）
 */
async function analyze(input = {}) {
  const result = await generate({ ...input, options: { ...input.options, responseFormat: 'json' } });
  try {
    const data = JSON.parse(result.content);
    return { ...result, data, confidence: data && data.confidence != null ? data.confidence : null };
  } catch (err) {
    return { ...result, data: null, parseError: 'AI 输出不是合法 JSON，无法结构化解析' };
  }
}

/**
 * 聚合健康状态（供 /provider/status 等端点使用）
 */
async function getHealthSummary() {
  const providers = providerRegistry.listProviders();
  const results = [];
  for (const p of providers) {
    const health = await p.healthCheck();
    results.push({
      provider: p.name,
      type: p.type,
      status: health.status,
      model: health.model || null,
      configured: health.status !== HEALTH_STATUS.NOT_CONFIGURED,
      available: health.available,
      reason: health.reason || null,
    });
  }
  const active = providerRegistry.getActiveProvider();
  return {
    providers: results,
    activeProvider: active ? active.name : null,
  };
}

/**
 * Provider 明细（/api/hse/ai/v2/providers）——统一能力面，不暴露 Provider 私有格式
 * @returns {Promise<Array<{provider,type,status,model,baseUrl,configured,available,reason,capabilities}>>}
 */
async function getProvidersInfo() {
  const providers = providerRegistry.listProviders();
  const results = [];
  for (const p of providers) {
    const health = await p.healthCheck();
    const meta = (p.getMetadata && p.getMetadata()) || {};
    results.push({
      provider: p.name,
      type: p.type,
      status: health.status,
      model: health.model || meta.model || null,
      baseUrl: meta.baseUrl || null,
      configured: health.status !== HEALTH_STATUS.NOT_CONFIGURED,
      available: health.available,
      reason: health.reason || null,
      capabilities: p.capabilities || {},
    });
  }
  return results;
}

/**
 * 统一模型列表（/api/hse/ai/v2/models）
 * 无法取得模型列表时如实返回 status=NOT_CONFIGURED/UNREACHABLE，不伪造模型。
 * @returns {Promise<Array<{provider,model,available,status,capabilities}>>}
 */
async function getModelsInfo() {
  const providers = providerRegistry.listProviders();
  const results = [];
  for (const p of providers) {
    const health = await p.healthCheck();
    const meta = (p.getMetadata && p.getMetadata()) || {};
    const caps = p.capabilities || {};
    const capsList = [];
    if (caps.textGeneration) capsList.push('chat');
    if (caps.streaming) capsList.push('stream');
    if (caps.structuredOutput) capsList.push('structured');
    if (caps.visionInput) capsList.push('vision');
    if (caps.embedding) capsList.push('embed');
    results.push({
      provider: p.name,
      model: health.model || meta.model || null,
      embeddingModel: caps.embedding ? meta.embeddingModel || null : null,
      available: health.available,
      status: health.status,
      capabilities: capsList,
    });
  }
  return results;
}

/**
 * 向量化（统一入口）——AI-05 知识库 Embedding
 * 链路：RAG Service → AI Gateway → Provider Registry → Ollama /api/embed。
 * @param {Object} input
 * @param {string[]} input.texts - 文本数组
 * @param {string} [input.model] - 覆盖 embedding 模型
 * @param {string} [input.provider] - 显式 Provider（缺省活动 Provider）
 * @param {boolean} [input.skipHealthCheck]
 * @returns {Promise<{provider, model, dimension, embeddings, durationMs}>}
 */
async function embed(input = {}) {
  assertEnabled();
  const texts = Array.isArray(input.texts) ? input.texts : [];
  if (texts.length === 0) {
    throw new AiError(AI_ERROR_CODES.AI_INVALID_REQUEST, 'embed 至少需要 1 条文本');
  }
  const provider = resolveProvider(input.provider);
  // 先做健康检查：NOT_CONFIGURED / UNREACHABLE 的 Provider 如实报对应错误码，
  // 再检查 embedding 能力（避免未配置 Provider 被误报为 INVALID_REQUEST）
  await assertProviderReady(provider, input);
  if (!(provider.embed && provider.capabilities && provider.capabilities.embedding)) {
    throw new AiError(AI_ERROR_CODES.AI_INVALID_REQUEST, `Provider ${provider.name} 不支持 embedding 能力`);
  }
  const result = await provider.embed({
    texts,
    model: input.model || null,
  });
  return {
    provider: provider.name,
    model: result.model,
    dimension: result.dimension,
    embeddings: result.embeddings,
    durationMs: result.durationMs,
  };
}

module.exports = {
  generate,
  stream,
  analyze,
  embed,
  getHealthSummary,
  getProvidersInfo,
  getModelsInfo,
  resolvePrompt,
  resolveProvider,
  toErrorResponse,
  AiError,
  AI_ERROR_CODES,
  // 供测试/上层复用的底层引用
  _internal: { promptRegistry, providerRegistry },
};
