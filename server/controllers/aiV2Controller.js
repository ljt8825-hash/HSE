/**
 * AI v2 统一 API 控制器（AI-03）
 *
 * 对应路由前缀：/api/hse/ai/v2（routes/ai-v2.js）
 * 设计基线：AI-03 任务书 §7~§13、§24。
 *
 * 统一原则：
 * 1. 所有写端点（generate/stream/analyze）只经 AI Gateway，禁止 Route → Provider 直连。
 * 2. 请求/响应统一模型，不暴露 Provider 私有格式；错误统一走 errors.js 模型。
 * 3. AI 双轨制锁死（§24）：请求中出现 compliance_status/checked_by/checked_at/manual_remark
 *    一律忽略（不写入人工结果字段）。
 * 4. userId 取认证上下文 req.user.id，不推断 employeeId（AI-02 基线）。
 */
const { toErrorResponse, AiError, AI_ERROR_CODES } = require('../services/ai/errors');
const gateway = require('../services/ai/aiGateway');
const { isAiDisabled } = require('../services/ai/aiHealthService');
const analysisService = require('../services/ai/analysis/analysisService');

/** 双轨制：AI 请求中禁止出现的最终人工结果字段（出现即忽略） */
const DUAL_TRACK_FIELDS = ['compliance_status', 'checked_by', 'checked_at', 'manual_remark'];

/** 剥离双轨制字段（忽略，不写入人工结果） */
function stripDualTrackFields(body) {
  const clean = { ...body };
  for (const k of DUAL_TRACK_FIELDS) delete clean[k];
  return clean;
}

/** 统一请求解析：{ promptKey/promptVersion | prompt } + input + source + options + evidence + record */
function parseUnifiedInput(req) {
  const body = stripDualTrackFields(req.body || {});
  const {
    promptKey, promptVersion, prompt, systemPrompt, customInstructions,
    provider, options, evidence, record,
  } = body;
  const input = body.input || {};
  const source = body.source || {};
  return {
    prompt,
    promptKey,
    promptVersion,
    data: input,
    customInstructions,
    systemPrompt,
    provider,
    options,
    evidence,
    record,
    userId: req.user && req.user.id != null ? req.user.id : null,
    employeeId: null, // 身份链不在此处推断（AI-02 基线）
    sourceDomain: source.domain || null,
    sourceRecordId: source.recordId != null ? source.recordId : null,
  };
}

/** 统一成功响应（HTTP 200） */
function ok(res, payload) {
  res.json({ success: true, ...payload });
}

/** 统一错误响应（HTTP 200 + 统一错误体，兼容项目 response 约定且不暴露 Provider 私有格式） */
function fail(res, err, requestId) {
  res.json(toErrorResponse(err, requestId));
}

function requestIdOf(err) {
  return err && err.details && err.details.requestId ? err.details.requestId : null;
}

/** GET /v2/health */
async function health(req, res) {
  try {
    const summary = await gateway.getHealthSummary();
    ok(res, {
      requestId: req.requestId || null,
      aiEnabled: !isAiDisabled(),
      activeProvider: summary.activeProvider,
      providers: summary.providers,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    fail(res, err);
  }
}

/** GET /v2/providers */
async function providers(req, res) {
  try {
    const list = await gateway.getProvidersInfo();
    ok(res, { requestId: req.requestId || null, providers: list, timestamp: new Date().toISOString() });
  } catch (err) {
    fail(res, err);
  }
}

/** GET /v2/models */
async function models(req, res) {
  try {
    const list = await gateway.getModelsInfo();
    ok(res, { requestId: req.requestId || null, models: list, timestamp: new Date().toISOString() });
  } catch (err) {
    fail(res, err);
  }
}

/** POST /v2/generate */
async function generate(req, res) {
  try {
    const result = await gateway.generate(parseUnifiedInput(req));
    ok(res, {
      requestId: result.requestId,
      traceId: result.traceId,
      provider: result.provider,
      model: result.model,
      promptKey: result.promptKey,
      promptVersion: result.promptVersion,
      content: result.content,
      usage: {
        inputTokens: result.inputTokens || 0,
        outputTokens: result.outputTokens || 0,
        durationMs: result.durationMs || 0,
      },
      evidence: result.evidence || [],
      recordId: result.recordId || null,
      recordSaved: !!result.recordSaved,
      ...(result.recordError ? { recordError: result.recordError } : {}),
    });
  } catch (err) {
    fail(res, err, requestIdOf(err));
  }
}

/** POST /v2/stream（SSE）——错误在头部写入前由本层补发 event:error 帧 */
async function stream(req, res) {
  try {
    const result = await gateway.stream(parseUnifiedInput(req), res);
    if (result && result.error) {
      // Provider 流中错误已由 Gateway 写 event:error 并结束；此处仅兜底不重复写
      return;
    }
    // Gateway 已完成 start/chunk/end 全部帧
  } catch (err) {
    sendSseError(res, err);
  }
}

/** POST /v2/analyze */
async function analyze(req, res) {
  try {
    const result = await gateway.analyze(parseUnifiedInput(req));
    ok(res, {
      requestId: result.requestId,
      traceId: result.traceId,
      provider: result.provider,
      model: result.model,
      promptKey: result.promptKey,
      promptVersion: result.promptVersion,
      content: result.content,
      data: result.data,
      confidence: result.confidence,
      ...(result.parseError ? { parseError: result.parseError } : {}),
      usage: {
        inputTokens: result.inputTokens || 0,
        outputTokens: result.outputTokens || 0,
        durationMs: result.durationMs || 0,
      },
      evidence: result.evidence || [],
      recordId: result.recordId || null,
      recordSaved: !!result.recordSaved,
      ...(result.recordError ? { recordError: result.recordError } : {}),
    });
  } catch (err) {
    fail(res, err, requestIdOf(err));
  }
}

/** POST /v2/analyze/data —— AI-06 结构化数据分析（纯统计 + AI 解释双层，AI 不可用降级） */
async function analyzeData(req, res) {
  try {
    const body = stripDualTrackFields(req.body || {});
    const result = await analysisService.analyzeData({
      domain: body.domain,
      timeRange: body.timeRange,
      filters: body.filters || {},
      records: body.records,
      limit: body.limit,
      analysisTypes: body.analysisTypes,
      useRag: !!body.useRag,
      provider: body.provider,
      userId: req.user && req.user.id != null ? req.user.id : null,
    });
    ok(res, result);
  } catch (err) {
    fail(res, err, requestIdOf(err));
  }
}

/** SSE 错误帧（头部写入前错误使用；已写头则由 Gateway 内部处理） */
function sendSseError(res, err) {
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
  }
  const body = toErrorResponse(err);
  res.write(`event: error\ndata: ${JSON.stringify(body.error)}\n\n`);
  if (!res.writableEnded) res.end();
}

module.exports = {
  health,
  providers,
  models,
  generate,
  stream,
  analyze,
  analyzeData,
  stripDualTrackFields,
  parseUnifiedInput,
};
