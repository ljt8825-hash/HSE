/**
 * AI-02 HSE AI 统一能力层 — 核心单元测试（不连库）
 *
 * 覆盖：统一错误模型 / Request Context / Evidence Chain / Prompt Registry /
 * Provider 注册表与统一抽象 / Health 真实状态 / Gateway（generate/stream/analyze）/
 * SSE 流式链路 / 生成记录落库（pool mock）。
 *
 * 隔离策略：
 * - jest.mock('../../config/db')：pool 全部 mock，绝不触达真实数据库；
 * - jest.mock('../aiService')：协议层 mock，Provider 委托路径可确定性验证；
 * - http/https mock：健康检查探测与 OpenAI Compatible 协议不走真实网络。
 */

jest.mock('../../config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../aiService', () => ({
  chat: jest.fn(),
  chatStream: jest.fn(),
  buildReportPrompt: jest.fn(),
  buildRCAPrompt: jest.fn(),
  buildDocumentAnalysisPrompt: jest.fn(),
  buildMonthlyReportPrompt: jest.fn(),
  buildGroupReportPrompt: jest.fn(),
  buildStandardEvaluationPrompt: jest.fn(),
}));

jest.mock('http', () => ({ request: jest.fn() }));
jest.mock('https', () => ({ request: jest.fn() }));
// uuid@14 为 ESM-only，Jest 无法解析真实包；mock 为确定性 UUID
jest.mock('uuid', () => ({ v4: jest.fn(() => '123e4567-e89b-12d3-a456-426614174000') }));

const errors = require('./errors');
const { createRequestContext } = require('./aiRequestContext');
const evidenceService = require('./aiEvidenceService');
const promptRegistry = require('./aiPromptRegistry');
const healthService = require('./aiHealthService');
const providerRegistry = require('./aiProviderRegistry');
const gateway = require('./aiGateway');
const aiService = require('../aiService');
const http = require('http');
const https = require('https');
const { pool } = require('../../config/db');

const { AI_ERROR_CODES, AiError, toErrorResponse } = errors;
const { HEALTH_STATUS } = healthService;

/** 默认失败请求：触发 error 事件（模拟 ECONNREFUSED），供健康检查探测使用 */
function makeFailReq() {
  const req = {
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    setTimeout: jest.fn(),
    on: jest.fn((event, handler) => {
      if (event === 'error') handler(new Error('ECONNREFUSED'));
    }),
  };
  return req;
}

/** HTTP 200 成功响应（OpenAI Compatible 协议测试用） */
function httpOkOnce(body) {
  http.request.mockImplementationOnce((options, callback) => {
    const req = {
      write: jest.fn(),
      end: jest.fn(() => {
        callback({
          statusCode: 200,
          on: jest.fn((event, handler) => {
            if (event === 'data') handler(JSON.stringify(body));
            if (event === 'end') handler();
          }),
        });
      }),
      on: jest.fn((event, handler) => { if (event === 'error') req._onError = handler; }),
      destroy: jest.fn(),
      setTimeout: jest.fn(),
    };
    return req;
  });
}

/** HTTP 指定状态码错误响应 */
function httpStatusOnce(statusCode, bodyText) {
  http.request.mockImplementationOnce((options, callback) => {
    const req = {
      write: jest.fn(),
      end: jest.fn(() => {
        callback({
          statusCode,
          on: jest.fn((event, handler) => {
            if (event === 'data') handler(bodyText || '');
            if (event === 'end') handler();
          }),
        });
      }),
      on: jest.fn((event, handler) => { if (event === 'error') req._onError = handler; }),
      destroy: jest.fn(),
      setTimeout: jest.fn(),
    };
    return req;
  });
}

/** 构造可用 Fake Provider（注册表测试用；可覆盖任意方法） */
function makeFakeProvider(overrides = {}) {
  return {
    name: 'fake-test',
    type: 'fake',
    capabilities: { textGeneration: true, streaming: true, structuredOutput: false, visionInput: false },
    getMetadata: () => ({ name: 'fake-test', model: 'fake-model', baseUrl: 'http://fake.local' }),
    healthCheck: async () => ({ status: HEALTH_STATUS.AVAILABLE, available: true, reason: '正常', model: 'fake-model' }),
    chat: async ({ prompt }) => ({ content: `结果:${prompt}`, model: 'fake-model', inputTokens: 10, outputTokens: 5, durationMs: 8 }),
    chatStream: async ({ prompt }, res) => {
      res.write('data: {"content":"流式内容"}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    },
    ...overrides,
  };
}

/** 成功落库的默认 pool 实现：information_schema 探测 → 无扩展列；INSERT → id=42 */
function implPoolSuccess(sql) {
  if (sql.includes('information_schema')) return Promise.resolve({ rows: [] });
  return Promise.resolve({ rows: [{ id: 42 }] });
}

const ENV_KEYS = ['AI_ENABLE', 'AI_PROVIDER', 'GROK_API_KEY', 'GROK_MODEL', 'GROK_BASE_URL',
  'OLLAMA_BASE_URL', 'OLLAMA_MODEL', 'AI_OPENAI_NAME', 'AI_OPENAI_BASE_URL', 'AI_OPENAI_API_KEY', 'AI_OPENAI_MODEL'];

beforeEach(() => {
  // 环境基线
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.AI_ENABLE = 'true';
  process.env.AI_PROVIDER = 'grok';
  process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
  process.env.OLLAMA_MODEL = 'qwen2.5:7b';

  // 网络基线：默认失败
  http.request.mockReset();
  https.request.mockReset();
  http.request.mockImplementation(() => makeFailReq());
  https.request.mockImplementation(() => makeFailReq());

  // aiService mock 默认行为
  aiService.chat.mockReset();
  aiService.chatStream.mockReset();
  aiService.chat.mockResolvedValue({ content: '默认结果', model: 'm', inputTokens: 1, outputTokens: 1 });
  aiService.chatStream.mockResolvedValue(undefined);
  aiService.buildReportPrompt.mockReset();
  aiService.buildReportPrompt.mockImplementation((key, data, custom) => `mock:${key}:${custom || ''}`);
  aiService.buildRCAPrompt.mockReset();
  aiService.buildRCAPrompt.mockImplementation((data, custom) => `mock:rca:${custom || ''}`);
  aiService.buildDocumentAnalysisPrompt.mockReset();
  aiService.buildDocumentAnalysisPrompt.mockImplementation((data, custom) => `mock:doc:${custom || ''}`);
  aiService.buildMonthlyReportPrompt.mockReset();
  aiService.buildMonthlyReportPrompt.mockImplementation((data, custom) => `mock:monthly:${custom || ''}`);
  aiService.buildGroupReportPrompt.mockReset();
  aiService.buildGroupReportPrompt.mockImplementation((data, custom) => `mock:group:${custom || ''}`);
  aiService.buildStandardEvaluationPrompt.mockReset();
  aiService.buildStandardEvaluationPrompt.mockImplementation((clause, docs, custom) => `mock:std:${custom || ''}`);

  // 落库默认成功
  pool.query.mockReset();
  pool.query.mockImplementation(implPoolSuccess);
});

// ============================================================
// 1. 统一错误模型
// ============================================================
describe('统一错误模型（errors）', () => {
  test('AiError 应携带 code/message/provider/retryable', () => {
    const err = new AiError(AI_ERROR_CODES.AI_TIMEOUT, '请求超时', { provider: 'grok' });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AiError');
    expect(err.code).toBe('AI_TIMEOUT');
    expect(err.message).toBe('请求超时');
    expect(err.provider).toBe('grok');
    expect(err.retryable).toBe(true);
  });

  test('不可重试错误码 retryable 应为 false', () => {
    const err = new AiError(AI_ERROR_CODES.AI_INVALID_REQUEST, '参数不合法');
    expect(err.retryable).toBe(false);
    const auth = new AiError(AI_ERROR_CODES.AI_AUTH_ERROR, '认证失败');
    expect(auth.retryable).toBe(false);
  });

  test('toJSON 应输出统一对外结构', () => {
    const json = new AiError(AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE, '不可达', { provider: 'ollama' }).toJSON();
    expect(json).toEqual({
      success: false,
      error: {
        code: 'AI_PROVIDER_UNAVAILABLE',
        message: '不可达',
        provider: 'ollama',
        retryable: true,
      },
    });
  });

  test('toErrorResponse：AiError 透传并附加 requestId', () => {
    const resp = toErrorResponse(new AiError(AI_ERROR_CODES.AI_NOT_ENABLED, '未启用'), 'req-123');
    expect(resp.error.code).toBe('AI_NOT_ENABLED');
    expect(resp.error.requestId).toBe('req-123');
  });

  test('toErrorResponse：普通 Error 兜底为 AI_INTERNAL_ERROR', () => {
    const resp = toErrorResponse(new Error('boom'));
    expect(resp.success).toBe(false);
    expect(resp.error.code).toBe('AI_INTERNAL_ERROR');
    expect(resp.error.retryable).toBe(true);
  });
});

// ============================================================
// 2. AI Request Context
// ============================================================
describe('AI Request Context', () => {
  test('应生成 requestId/traceId 并透传来源元数据', () => {
    const ctx = createRequestContext({
      userId: 5,
      employeeId: 7,
      sourceDomain: 'hazard',
      sourceRecordId: 3,
      provider: 'grok',
      model: 'grok-2',
      promptKey: 'hse.general.analysis',
      promptVersion: 'v1.0',
    });
    expect(ctx.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ctx.traceId).toBe(`ai-${ctx.requestId.slice(0, 8)}`);
    expect(ctx.userId).toBe(5);
    expect(ctx.employeeId).toBe(7);
    expect(ctx.sourceDomain).toBe('hazard');
    expect(ctx.sourceRecordId).toBe(3);
    expect(ctx.promptKey).toBe('hse.general.analysis');
    expect(ctx.createdAt).toBeTruthy();
  });

  test('非整数 userId/employeeId 应规范化为 null，sourceRecordId=0 保留', () => {
    const ctx = createRequestContext({ userId: 'abc', employeeId: 'x', sourceRecordId: 0 });
    expect(ctx.userId).toBeNull();
    expect(ctx.employeeId).toBeNull();
    expect(ctx.sourceRecordId).toBe(0);
  });
});

// ============================================================
// 3. Evidence Chain
// ============================================================
describe('Evidence Chain（aiEvidenceService）', () => {
  test('createEvidence 应生成统一证据结构', () => {
    const ev = evidenceService.createEvidence({
      sourceType: 'business_record',
      sourceId: 12,
      sourceDomain: 'hazards',
      sourceField: 'description',
      evidenceText: '电线老化，存在漏电风险',
      evidenceStrength: 'high',
    });
    expect(ev.source_type).toBe('business_record');
    expect(ev.source_id).toBe(12);
    expect(ev.source_field).toBe('description');
    expect(ev.evidence_strength).toBe('high');
    expect(ev.created_at).toBeTruthy();
  });

  test('非法参数应抛错', () => {
    expect(() => evidenceService.createEvidence({ sourceType: 'unknown', sourceId: 1, sourceDomain: 'd', evidenceText: 't' })).toThrow('不支持的证据来源类型');
    expect(() => evidenceService.createEvidence({ sourceType: 'business_record', sourceDomain: 'd', evidenceText: 't' })).toThrow('sourceId');
    expect(() => evidenceService.createEvidence({ sourceType: 'business_record', sourceId: 1, sourceDomain: '', evidenceText: 't' })).toThrow('sourceDomain');
    expect(() => evidenceService.createEvidence({ sourceType: 'business_record', sourceId: 1, sourceDomain: 'd', evidenceText: 't', evidenceStrength: 'super' })).toThrow('证据强度');
  });

  test('attachEvidence 应返回新对象并复制证据数组', () => {
    const target = { success: true };
    const ev = evidenceService.createEvidence({ sourceType: 'document', sourceId: 1, sourceDomain: 'documents', evidenceText: 't' });
    const result = evidenceService.attachEvidence(target, [ev]);
    expect(result).not.toBe(target);
    expect(result.evidence).toHaveLength(1);
    expect(target.evidence).toBeUndefined();
  });

  test('validateEvidenceList 应区分合法/非法结构', () => {
    const valid = evidenceService.createEvidence({ sourceType: 'rule', sourceId: 1, sourceDomain: 'rules', evidenceText: 't' });
    expect(evidenceService.validateEvidenceList([valid])).toBe(true);
    expect(evidenceService.validateEvidenceList([])).toBe(true);
    expect(evidenceService.validateEvidenceList('not-array')).toBe(false);
    expect(evidenceService.validateEvidenceList([{ source_type: 'rule' }])).toBe(false);
    expect(evidenceService.validateEvidenceList([{ ...valid, evidence_strength: 'nope' }])).toBe(false);
  });
});

// ============================================================
// 4. Prompt Registry
// ============================================================
describe('Prompt Registry（aiPromptRegistry）', () => {
  test('基础 Prompt hse.general.analysis v1.0 应已注册且 ACTIVE', () => {
    const entry = promptRegistry.get('hse.general.analysis');
    expect(entry).toBeTruthy();
    expect(entry.version).toBe('v1.0');
    expect(entry.status).toBe('ACTIVE');
    expect(entry.name).toBe('HSE 通用安全数据分析');
    expect(entry.system_prompt).toContain('宁津环卫');
  });

  test('aiService 9 个模板引用应已注册', () => {
    expect(promptRegistry.has('hse.risk.hazard')).toBe(true);
    expect(promptRegistry.has('hse.risk.accident')).toBe(true);
    expect(promptRegistry.has('hse.training.analysis')).toBe(true);
    expect(promptRegistry.has('hse.patrol.analysis')).toBe(true);
    expect(promptRegistry.has('hse.rca.analysis')).toBe(true);
    expect(promptRegistry.has('hse.document.analysis')).toBe(true);
    expect(promptRegistry.has('hse.report.monthly')).toBe(true);
    expect(promptRegistry.has('hse.report.group')).toBe(true);
    expect(promptRegistry.has('hse.standard.evaluation')).toBe(true);
    const groups = promptRegistry.list();
    expect(groups.length).toBe(10); // 基础 1 + aiService 引用 9
  });

  test('get 不传 version 应返回 ACTIVE 版本，未知 key 返回 null', () => {
    const entry = promptRegistry.get('hse.general.analysis');
    expect(entry.status).toBe('ACTIVE');
    expect(promptRegistry.get('nonexistent.key')).toBeNull();
  });

  test('register 支持 camelCase 与 snake_case 两种入参', () => {
    const a = promptRegistry.register({ promptKey: 'test.camel', version: 'v1.0', systemPrompt: 'sys', userPromptTemplate: '{data}' });
    expect(a.prompt_key).toBe('test.camel');
    expect(a.system_prompt).toBe('sys');
    const b = promptRegistry.register({ prompt_key: 'test.snake', version: 'v1.0', system_prompt: 'sys2', user_prompt_template: '{data}' });
    expect(b.prompt_key).toBe('test.snake');
    expect(b.system_prompt).toBe('sys2');
    expect(promptRegistry.get('test.camel').version).toBe('v1.0');
  });

  test('render 应替换 {data}/{custom_instructions} 占位符', () => {
    const entry = promptRegistry.register({
      promptKey: 'test.render',
      version: 'v1.0',
      systemPrompt: '系统要求',
      userPromptTemplate: '数据：{data}\n要求：{custom_instructions}',
    });
    const rendered = promptRegistry.render(entry, { data: { a: 1 }, customInstructions: '重点分析' });
    expect(rendered).toContain('系统要求');
    expect(rendered).toContain('数据：');
    expect(rendered).toContain('"a": 1');
    expect(rendered).toContain('重点分析');
  });

  test('render 无 customInstructions 应使用默认文本', () => {
    const entry = promptRegistry.register({ promptKey: 'test.render2', version: 'v1.0', userPromptTemplate: '数据：{data}\n要求：{custom_instructions}' });
    const rendered = promptRegistry.render(entry, { data: 'x' });
    expect(rendered).toContain('无额外要求，按标准格式输出。');
  });

  test('render 委托 aiService 模板引用（不复制文本）', () => {
    const entry = promptRegistry.get('hse.risk.hazard');
    const rendered = promptRegistry.render(entry, { data: { id: 1 }, customInstructions: '请分析' });
    expect(rendered).toBe('mock:report_hazard:请分析');
    expect(aiService.buildReportPrompt).toHaveBeenCalledWith('report_hazard', { id: 1 }, '请分析');
  });

  test('render rca 引用应委托 buildRCAPrompt', () => {
    const rendered = promptRegistry.render(promptRegistry.get('hse.rca.analysis'), { data: {}, customInstructions: '深挖' });
    expect(rendered).toBe('mock:rca:深挖');
  });

  test('render 空条目应抛错', () => {
    expect(() => promptRegistry.render(null)).toThrow('Prompt 条目不存在');
  });
});

// ============================================================
// 5. Provider 健康状态（真实映射，不伪造成功）
// ============================================================
describe('Provider 健康状态（aiHealthService + Provider healthCheck）', () => {
  test('isAiDisabled 应读取 AI_ENABLE', () => {
    process.env.AI_ENABLE = 'false';
    expect(healthService.isAiDisabled()).toBe(true);
    process.env.AI_ENABLE = 'true';
    expect(healthService.isAiDisabled()).toBe(false);
  });

  test('mapProbeStatus 应完整映射各状态', () => {
    expect(healthService.mapProbeStatus({ status: 200 })).toMatchObject({ status: 'AVAILABLE', available: true });
    expect(healthService.mapProbeStatus({ status: 401 }).status).toBe('AUTH_ERROR');
    expect(healthService.mapProbeStatus({ status: 403 }).status).toBe('AUTH_ERROR');
    expect(healthService.mapProbeStatus({ status: 404 }).status).toBe('MODEL_NOT_FOUND');
    expect(healthService.mapProbeStatus({ status: 429 }).status).toBe('TIMEOUT');
    expect(healthService.mapProbeStatus({ status: 500 }).status).toBe('ERROR');
    expect(healthService.mapProbeStatus(new Error('TIMEOUT')).status).toBe('TIMEOUT');
    expect(healthService.mapProbeStatus(new Error('UNREACHABLE: ECONNREFUSED')).status).toBe('UNREACHABLE');
    expect(healthService.mapProbeStatus(new Error('INVALID_URL: x')).status).toBe('ERROR');
  });

  test('GrokProvider 无 API Key 应报 NOT_CONFIGURED（不模拟成功）', async () => {
    delete process.env.GROK_API_KEY;
    const gp = new providerRegistry.GrokProvider();
    const health = await gp.healthCheck();
    expect(health.status).toBe('NOT_CONFIGURED');
    expect(health.available).toBe(false);
    expect(health.reason).toContain('GROK_API_KEY');
    expect(await gp.isAvailable()).toBe(false);
  });

  test('AI_ENABLE=false 时所有 Provider 应报 DISABLED', async () => {
    process.env.AI_ENABLE = 'false';
    const gp = new providerRegistry.GrokProvider();
    const op = new providerRegistry.OllamaProvider();
    const oc = new providerRegistry.OpenAICompatibleProvider();
    expect((await gp.healthCheck()).status).toBe('DISABLED');
    expect((await op.healthCheck()).status).toBe('DISABLED');
    expect((await oc.healthCheck()).status).toBe('DISABLED');
    expect(await gp.isAvailable()).toBe(false);
  });

  test('GrokProvider 有 Key 但服务不可达应报 UNREACHABLE', async () => {
    process.env.GROK_API_KEY = 'sk-test';
    const gp = new providerRegistry.GrokProvider();
    const health = await gp.healthCheck(); // https 探测默认失败 → UNREACHABLE
    expect(health.status).toBe('UNREACHABLE');
    expect(health.available).toBe(false);
  });

  test('OllamaProvider 本机无服务应报 UNREACHABLE', async () => {
    const op = new providerRegistry.OllamaProvider();
    const health = await op.healthCheck(); // http 探测默认失败 → UNREACHABLE
    expect(health.status).toBe('UNREACHABLE');
    expect(await op.isAvailable()).toBe(false);
  });

  test('OpenAICompatibleProvider 未配置应报 NOT_CONFIGURED 且 chat 抛统一错误', async () => {
    const oc = new providerRegistry.OpenAICompatibleProvider();
    expect((await oc.healthCheck()).status).toBe('NOT_CONFIGURED');
    expect(await oc.isAvailable()).toBe(false);
    await expect(oc.chat({ prompt: 'x' })).rejects.toMatchObject({ code: 'AI_PROVIDER_NOT_CONFIGURED' });
  });

  test('OpenAICompatibleProvider 配置后 chat 应解析 OpenAI 协议响应', async () => {
    process.env.AI_OPENAI_BASE_URL = 'http://fake.local/v1';
    process.env.AI_OPENAI_MODEL = 'qwen-max';
    process.env.AI_OPENAI_API_KEY = 'sk-1';
    const oc = new providerRegistry.OpenAICompatibleProvider();
    httpOkOnce({
      choices: [{ message: { content: '兼容协议结果' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    });
    const result = await oc.chat({ prompt: '测试', options: { systemPrompt: 'sys' } });
    expect(result.content).toBe('兼容协议结果');
    expect(result.model).toBe('qwen-max');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(20);
  });

  test('OpenAICompatibleProvider HTTP 401 应报 AI_AUTH_ERROR', async () => {
    process.env.AI_OPENAI_BASE_URL = 'http://fake.local/v1';
    process.env.AI_OPENAI_MODEL = 'qwen-max';
    const oc = new providerRegistry.OpenAICompatibleProvider();
    httpStatusOnce(401, 'unauthorized');
    await expect(oc.chat({ prompt: 'x' })).rejects.toMatchObject({ code: 'AI_AUTH_ERROR' });
  });

  test('checkProviderHealth 应输出归一化健康结构', async () => {
    const result = await healthService.checkProviderHealth(makeFakeProvider());
    expect(result.provider).toBe('fake-test');
    expect(result.status).toBe('AVAILABLE');
    expect(result.available).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeTruthy();
  });
});

// ============================================================
// 6. Provider 注册表与统一抽象
// ============================================================
describe('Provider 注册表（aiProviderRegistry）', () => {
  test('内置 Provider 应注册：grok / ollama / openai_compatible', () => {
    const names = providerRegistry.listProviders().map((p) => p.name);
    expect(names).toContain('grok');
    expect(names).toContain('ollama');
    expect(names.some((n) => /openai/i.test(n))).toBe(true);
    expect(providerRegistry.getProvider('grok')).toBeTruthy();
    expect(providerRegistry.hasProvider('nonexistent')).toBe(false);
  });

  test('getDefaultProviderName / getActiveProvider 应遵循 AI_PROVIDER', () => {
    expect(providerRegistry.getDefaultProviderName()).toBe('grok');
    expect(providerRegistry.getActiveProvider().name).toBe('grok');
    process.env.AI_PROVIDER = 'ollama';
    expect(providerRegistry.getActiveProvider().name).toBe('ollama');
    process.env.AI_PROVIDER = 'unknown';
    expect(providerRegistry.getActiveProvider()).toBeNull();
  });

  test('selectProviderByCapability：visionInput 当前无 Provider 支持，textGeneration 可选到 grok', () => {
    expect(providerRegistry.selectProviderByCapability('visionInput')).toBeNull();
    const p = providerRegistry.selectProviderByCapability('textGeneration');
    expect(p).toBeTruthy();
    expect(p.name).toBe('grok');
  });

  test('registerProvider 应可注册并覆盖自定义 Provider', () => {
    providerRegistry.registerProvider(makeFakeProvider());
    expect(providerRegistry.getProvider('fake-test')).toBeTruthy();
    expect(providerRegistry.listProviders().some((p) => p.name === 'fake-test')).toBe(true);
    expect(() => providerRegistry.registerProvider({ type: 'no-name' })).toThrow('name');
  });

  test('classifyProviderError 应映射各类底层错误为统一错误码', () => {
    expect(providerRegistry.classifyProviderError(new Error('request timeout'), 'grok').code).toBe('AI_TIMEOUT');
    expect(providerRegistry.classifyProviderError(new Error('401 unauthorized'), 'grok').code).toBe('AI_AUTH_ERROR');
    expect(providerRegistry.classifyProviderError(new Error('429 rate limit'), 'grok').code).toBe('AI_RATE_LIMITED');
    expect(providerRegistry.classifyProviderError(new Error('model not found'), 'grok').code).toBe('AI_MODEL_NOT_FOUND');
    expect(providerRegistry.classifyProviderError(new Error('ECONNREFUSED'), 'grok').code).toBe('AI_PROVIDER_UNAVAILABLE');
    expect(providerRegistry.classifyProviderError(new Error('其他错误'), 'grok').code).toBe('AI_INTERNAL_ERROR');
    const ai = new AiError(AI_ERROR_CODES.AI_TIMEOUT, 't');
    expect(providerRegistry.classifyProviderError(ai, 'grok')).toBe(ai);
  });

  test('GrokProvider 统一接口契约：name/type/capabilities/getMetadata/chat 委托 aiService', async () => {
    const gp = new providerRegistry.GrokProvider();
    expect(gp.name).toBe('grok');
    expect(gp.type).toBe('grok');
    expect(gp.capabilities).toMatchObject({ textGeneration: true, streaming: true });
    expect(gp.getMetadata().model).toBeTruthy();
    aiService.chat.mockResolvedValue({ content: '委托结果' });
    const result = await gp.chat({ prompt: 'hi' });
    expect(result.content).toBe('委托结果');
    expect(aiService.chat).toHaveBeenCalledWith('hi', undefined);
    await gp.chatStream({ prompt: 'hi' }, {});
    expect(aiService.chatStream).toHaveBeenCalledWith('hi', {}, undefined);
  });
});

// ============================================================
// 7. AI Gateway — generate
// ============================================================
describe('AI Gateway（aiGateway.generate）', () => {
  test('直接 prompt 生成应返回统一结果结构（含 requestId/traceId）', async () => {
    providerRegistry.registerProvider(makeFakeProvider());
    const result = await gateway.generate({
      prompt: '分析隐患',
      provider: 'fake-test',
      userId: 1,
      sourceDomain: 'hazard',
      sourceRecordId: 9,
      skipHealthCheck: true,
    });
    expect(result.success).toBe(true);
    expect(result.content).toContain('分析隐患');
    expect(result.provider).toBe('fake-test');
    expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.traceId).toContain('ai-');
    expect(result.promptKey).toBeNull();
    expect(result.recordSaved).toBe(false);
  });

  test('promptKey 应经 Prompt Registry 渲染并返回版本', async () => {
    providerRegistry.registerProvider(makeFakeProvider());
    const result = await gateway.generate({
      promptKey: 'hse.general.analysis',
      data: { level: '严重', count: 3 },
      provider: 'fake-test',
      skipHealthCheck: true,
    });
    expect(result.promptKey).toBe('hse.general.analysis');
    expect(result.promptVersion).toBe('v1.0');
    expect(result.prompt).toContain('宁津环卫');
    expect(result.prompt).toContain('严重');
    expect(result.content).toContain('结果:');
  });

  test('未提供 prompt 与 promptKey 应抛 AI_INVALID_REQUEST', async () => {
    providerRegistry.registerProvider(makeFakeProvider());
    await expect(gateway.generate({ provider: 'fake-test', skipHealthCheck: true }))
      .rejects.toMatchObject({ code: 'AI_INVALID_REQUEST' });
  });

  test('AI_ENABLE=false 应抛 AI_NOT_ENABLED', async () => {
    process.env.AI_ENABLE = 'false';
    await expect(gateway.generate({ prompt: 'x', provider: 'fake-test', skipHealthCheck: true }))
      .rejects.toMatchObject({ code: 'AI_NOT_ENABLED' });
  });

  test('Provider 未注册应抛 AI_PROVIDER_NOT_FOUND', async () => {
    await expect(gateway.generate({ prompt: 'x', provider: 'no-such-provider', skipHealthCheck: true }))
      .rejects.toMatchObject({ code: 'AI_PROVIDER_NOT_FOUND' });
  });

  test('健康检查未通过（NOT_CONFIGURED）应抛对应统一错误码', async () => {
    providerRegistry.registerProvider(makeFakeProvider({
      healthCheck: async () => ({ status: HEALTH_STATUS.NOT_CONFIGURED, available: false, reason: '未配置', model: null }),
    }));
    await expect(gateway.generate({ prompt: 'x', provider: 'fake-test' }))
      .rejects.toMatchObject({ code: 'AI_PROVIDER_NOT_CONFIGURED' });
  });

  test('证据链应附加到结果', async () => {
    providerRegistry.registerProvider(makeFakeProvider());
    const ev = evidenceService.createEvidence({ sourceType: 'business_record', sourceId: 7, sourceDomain: 'hazards', evidenceText: '依据' });
    const result = await gateway.generate({ prompt: 'x', provider: 'fake-test', skipHealthCheck: true, evidence: [ev] });
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].source_id).toBe(7);
  });

  test('非法证据结构应抛 AI_INVALID_REQUEST', async () => {
    providerRegistry.registerProvider(makeFakeProvider());
    await expect(gateway.generate({ prompt: 'x', provider: 'fake-test', skipHealthCheck: true, evidence: [{ bad: true }] }))
      .rejects.toMatchObject({ code: 'AI_INVALID_REQUEST' });
  });

  test('请求 record 落库应写入 ai_generation_records 并返回 recordId', async () => {
    providerRegistry.registerProvider(makeFakeProvider());
    const result = await gateway.generate({
      prompt: 'x',
      provider: 'fake-test',
      userId: 3,
      skipHealthCheck: true,
      record: { type: 'report', subType: 'hazard', title: '单测报告' },
    });
    expect(result.recordSaved).toBe(true);
    expect(result.recordId).toBe(42);
    const insertCall = pool.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO ai_generation_records'));
    expect(insertCall).toBeTruthy();
    expect(insertCall[1]).toContain(3); // user_id
  });

  test('落库失败不应阻断 AI 结果（recordSaved=false + recordError）', async () => {
    providerRegistry.registerProvider(makeFakeProvider());
    pool.query.mockImplementation((sql) => {
      if (sql.includes('information_schema')) return Promise.resolve({ rows: [] });
      return Promise.reject(new Error('db down'));
    });
    const result = await gateway.generate({ prompt: 'x', provider: 'fake-test', skipHealthCheck: true, record: { type: 'report' } });
    expect(result.recordSaved).toBe(false);
    expect(result.recordError).toBe('db down');
    expect(result.success).toBe(true);
    expect(result.content).toBeTruthy();
  });
});

// ============================================================
// 8. AI Gateway — stream（SSE）
// ============================================================
describe('AI Gateway（aiGateway.stream / SSE）', () => {
  test('流式生成应透传 SSE 帧到 res', async () => {
    providerRegistry.registerProvider(makeFakeProvider());
    const mockRes = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn() };
    await gateway.stream({ prompt: 'SSE测试', provider: 'fake-test', skipHealthCheck: true }, mockRes);
    expect(mockRes.write).toHaveBeenCalledWith('data: {"content":"流式内容"}\n\n');
    expect(mockRes.write).toHaveBeenCalledWith('data: [DONE]\n\n');
    expect(mockRes.end).toHaveBeenCalled();
  });

  test('流式生成缺失 res 应抛 AI_INVALID_REQUEST', async () => {
    await expect(gateway.stream({ prompt: 'x', provider: 'fake-test', skipHealthCheck: true }))
      .rejects.toMatchObject({ code: 'AI_INVALID_REQUEST' });
  });

  test('流式应委托已选 Provider 的 chatStream', async () => {
    const chatStream = jest.fn(async () => {});
    providerRegistry.registerProvider(makeFakeProvider({ chatStream }));
    const mockRes = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn() };
    const result = await gateway.stream({ prompt: 'x', provider: 'fake-test', skipHealthCheck: true }, mockRes);
    expect(chatStream).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('fake-test');
    expect(result.promptKey).toBeNull();
  });

  test('统一 SSE 信封：先写 event:start（含 requestId/traceId）再透传 chunk 后写 event:end', async () => {
    providerRegistry.registerProvider(makeFakeProvider());
    const mockRes = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn() };
    await gateway.stream({ prompt: 'SSE信封', provider: 'fake-test', skipHealthCheck: true }, mockRes);

    const writes = mockRes.write.mock.calls.map(([s]) => s).join('');
    expect(writes).toMatch(/^event: start\ndata: \{"requestId":".+","traceId":".+","provider":"fake-test"/);
    expect(writes).toContain('data: {"content":"流式内容"}\n\n');
    expect(writes).toContain('data: [DONE]\n\n');
    expect(writes).toMatch(/event: end\ndata: \{"requestId":".+","provider":"fake-test","model":"fake-model"/);
    expect(mockRes.end).toHaveBeenCalled();
  });

  test('统一 SSE 信封：Provider 流中错误应写 event:error 并结束响应', async () => {
    const chatStream = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    providerRegistry.registerProvider(makeFakeProvider({ chatStream }));
    const mockRes = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn() };
    const result = await gateway.stream({ prompt: 'x', provider: 'fake-test', skipHealthCheck: true }, mockRes);

    const writes = mockRes.write.mock.calls.map(([s]) => s).join('');
    expect(writes).toContain('event: start');
    expect(writes).toMatch(/event: error\ndata: \{"code":"AI_PROVIDER_UNAVAILABLE".*"retryable":true/);
    expect(mockRes.end).toHaveBeenCalled();
    expect(result.error).toBeTruthy();
    expect(result.error.code).toBe('AI_PROVIDER_UNAVAILABLE');
  });
});

// ============================================================
// 9. AI Gateway — analyze（结构化输出）
// ============================================================
describe('AI Gateway（aiGateway.analyze）', () => {
  test('合法 JSON 输出应解析为 data 并提取 confidence', async () => {
    providerRegistry.registerProvider(makeFakeProvider({
      chat: async () => ({ content: JSON.stringify({ summary: '总结', confidence: 0.82 }), model: 'm', inputTokens: 1, outputTokens: 1, durationMs: 1 }),
    }));
    const result = await gateway.analyze({ prompt: '结构化分析', provider: 'fake-test', skipHealthCheck: true });
    expect(result.data).toEqual({ summary: '总结', confidence: 0.82 });
    expect(result.confidence).toBe(0.82);
  });

  test('非 JSON 输出应标记 parseError 且 data=null', async () => {
    providerRegistry.registerProvider(makeFakeProvider({
      chat: async () => ({ content: '这不是 JSON', model: 'm', inputTokens: 1, outputTokens: 1, durationMs: 1 }),
    }));
    const result = await gateway.analyze({ prompt: 'x', provider: 'fake-test', skipHealthCheck: true });
    expect(result.data).toBeNull();
    expect(result.parseError).toContain('JSON');
  });
});

// ============================================================
// 10. AI Gateway — 健康汇总
// ============================================================
describe('AI Gateway（aiGateway.getHealthSummary）', () => {
  test('应聚合全部 Provider 健康状态并给出活动 Provider', async () => {
    const summary = await gateway.getHealthSummary();
    const names = summary.providers.map((p) => p.provider);
    expect(names).toContain('grok');
    expect(names).toContain('ollama');
    expect(summary.activeProvider).toBe('grok');
    for (const p of summary.providers) {
      expect(['AVAILABLE', 'NOT_CONFIGURED', 'UNREACHABLE', 'DISABLED', 'AUTH_ERROR', 'ERROR', 'TIMEOUT', 'MODEL_NOT_FOUND']).toContain(p.status);
      expect(typeof p.available).toBe('boolean');
    }
  });
});

// ============================================================
// 11. Gateway 底层引用可访问性
// ============================================================
describe('AI Gateway 底层引用', () => {
  test('_internal 应暴露 promptRegistry 与 providerRegistry', () => {
    expect(gateway._internal.promptRegistry).toBeTruthy();
    expect(gateway._internal.providerRegistry).toBeTruthy();
  });
});
