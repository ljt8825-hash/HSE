/**
 * AI Provider 注册表与统一抽象（AI-02 Capability Layer）
 *
 * 设计基线：AI-02 任务书 §7（Provider 统一抽象）。
 * 统一接口：name / type / chat / chatStream / isAvailable / healthCheck / capabilities。
 *
 * 复用策略（不建平行第二套 Provider 系统）：
 * - GrokProvider / OllamaProvider 的请求协议、SSE 解析、重试、超时均复用现有
 *   aiService.js（chat/chatStream 委托），仅在能力层补充统一对象接口与真实健康检查；
 * - OpenAICompatibleProvider 为新增协议实现（OpenAI Chat Completions 兼容），
 *   AI-02 只建接口抽象与协议代码，不要求配置真实账号（未配置 → NOT_CONFIGURED）。
 */

const { AI_ERROR_CODES, AiError } = require('./errors');
const { HEALTH_STATUS, isAiDisabled, probeUrl, mapProbeStatus } = require('./aiHealthService');
const aiService = require('../aiService');

/** 默认 Provider（AI_PROVIDER 环境变量，缺省 grok） */
function getDefaultProviderName() {
  return process.env.AI_PROVIDER || 'grok';
}

/**
 * 将底层错误归类为统一 AiError（非 AiError 时）
 * @param {Error} err
 * @param {string} providerName
 */
function classifyProviderError(err, providerName) {
  if (err && err.name === 'AiError') return err;
  const msg = (err && err.message) || '';
  if (/timeout|超时/i.test(msg)) return new AiError(AI_ERROR_CODES.AI_TIMEOUT, `Provider ${providerName} 请求超时`, { provider: providerName, cause: err });
  if (/401|403|unauthor|invalid key|api key|认证/i.test(msg)) return new AiError(AI_ERROR_CODES.AI_AUTH_ERROR, `Provider ${providerName} 认证失败`, { provider: providerName, cause: err });
  if (/429|rate.?limit/i.test(msg)) return new AiError(AI_ERROR_CODES.AI_RATE_LIMITED, `Provider ${providerName} 触发限流`, { provider: providerName, cause: err });
  if (/404|model.*not.*found|模型.*不存在/i.test(msg)) return new AiError(AI_ERROR_CODES.AI_MODEL_NOT_FOUND, `Provider ${providerName} 模型不存在`, { provider: providerName, cause: err });
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket|连接/i.test(msg)) return new AiError(AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE, `Provider ${providerName} 不可达`, { provider: providerName, cause: err });
  return new AiError(AI_ERROR_CODES.AI_INTERNAL_ERROR, `Provider ${providerName} 调用异常: ${msg}`, { provider: providerName, cause: err });
}

// ============================================================
// Grok Provider（复用 aiService 协议层）
// ============================================================
class GrokProvider {
  constructor() {
    this._config = {
      apiKey: process.env.GROK_API_KEY || '',
      model: process.env.GROK_MODEL || 'grok-2',
      baseUrl: process.env.GROK_BASE_URL || 'https://api.x.ai/v1',
    };
  }

  get name() { return 'grok'; }
  get type() { return 'grok'; }
  get capabilities() {
    return { textGeneration: true, streaming: true, structuredOutput: true, visionInput: false };
  }
  getMetadata() {
    return { name: this.name, model: this._config.model, baseUrl: this._config.baseUrl };
  }

  async chat(request = {}) {
    try {
      const result = await aiService.chat(request.prompt, { ...request.options, provider: this.name });
      return result;
    } catch (err) {
      throw classifyProviderError(err, this.name);
    }
  }

  async chatStream(request = {}, res) {
    try {
      await aiService.chatStream(request.prompt, res, { ...request.options, provider: this.name });
    } catch (err) {
      throw classifyProviderError(err, this.name);
    }
  }

  async isAvailable() {
    return isAiDisabled() ? false : !!this._config.apiKey;
  }

  /**
   * 真实健康检查：无 Key → NOT_CONFIGURED；有 Key → 探测 /models
   */
  async healthCheck() {
    if (isAiDisabled()) {
      return { status: HEALTH_STATUS.DISABLED, available: false, reason: 'AI_ENABLE=false', model: this._config.model };
    }
    if (!this._config.apiKey) {
      return { status: HEALTH_STATUS.NOT_CONFIGURED, available: false, reason: 'GROK_API_KEY is empty', model: this._config.model };
    }
    try {
      const result = await probeUrl(`${this._config.baseUrl}/models`, { token: this._config.apiKey, timeoutMs: 5000 });
      const mapped = mapProbeStatus(result);
      return { status: mapped.status, available: mapped.available, reason: mapped.reason, model: this._config.model };
    } catch (err) {
      const mapped = mapProbeStatus(err);
      return { status: mapped.status, available: false, reason: mapped.reason, model: this._config.model };
    }
  }
}

// ============================================================
// Ollama Provider（复用 aiService 协议层）
// ============================================================
class OllamaProvider {
  constructor() {
    this._config = {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
      // AI-05：独立 embedding 模型（nomic-embed-text，小尺寸；不覆盖聊天模型）
      embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
    };
  }

  get name() { return 'ollama'; }
  get type() { return 'ollama'; }
  get capabilities() {
    return { textGeneration: true, streaming: true, structuredOutput: false, visionInput: false, embedding: true };
  }
  getMetadata() {
    return { name: this.name, model: this._config.model, baseUrl: this._config.baseUrl, embeddingModel: this._config.embeddingModel };
  }

  /**
   * AI-05：文本向量化（Ollama /api/embed 真实调用）
   * @param {Object} request
   * @param {string[]} request.texts - 文本数组（非空）
   * @param {string} [request.model] - 覆盖 embedding 模型
   * @returns {Promise<{model:string, dimension:number, embeddings:number[][], durationMs:number}>}
   */
  async embed(request = {}) {
    const texts = Array.isArray(request.texts) ? request.texts : [];
    if (texts.length === 0) {
      throw new AiError(AI_ERROR_CODES.AI_INVALID_REQUEST, 'embed 至少需要 1 条文本');
    }
    const model = request.model || this._config.embeddingModel;
    const start = Date.now();
    try {
      const urlObj = new URL(`${this._config.baseUrl.replace(/\/$/, '')}/api/embed`);
      const isHttps = urlObj.protocol === 'https:';
      const lib = isHttps ? require('https') : require('http');
      const payload = JSON.stringify({ model, input: texts });
      const result = await new Promise((resolve, reject) => {
        const req = lib.request(
          {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
            timeout: 60000,
          },
          (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
              let body = data;
              try { body = JSON.parse(data); } catch (e) { /* 保持原始文本 */ }
              resolve({ status: res.statusCode, body });
            });
          }
        );
        req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')); });
        req.on('error', (err) => reject(err));
        req.write(payload);
        req.end();
      });

      if (result.status === 404 && /model/i.test(JSON.stringify(result.body))) {
        throw new AiError(AI_ERROR_CODES.AI_MODEL_NOT_FOUND, `Embedding 模型不存在: ${model}`, { provider: this.name, model });
      }
      if (result.status >= 400) {
        throw new AiError(AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE, `Ollama embed 返回 HTTP ${result.status}`, { provider: this.name });
      }
      const embeddings = result.body && Array.isArray(result.body.embeddings) ? result.body.embeddings : null;
      if (!embeddings || embeddings.length !== texts.length) {
        throw new AiError(AI_ERROR_CODES.AI_INTERNAL_ERROR, 'Ollama embed 返回结构异常（embeddings 缺失或数量不符）', { provider: this.name });
      }
      const dimension = embeddings[0] ? embeddings[0].length : 0;
      return {
        model: (result.body && result.body.model) || model,
        dimension,
        embeddings,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      throw classifyProviderError(err, this.name);
    }
  }

  async chat(request = {}) {
    try {
      return await aiService.chat(request.prompt, { ...request.options, provider: this.name });
    } catch (err) {
      throw classifyProviderError(err, this.name);
    }
  }

  async chatStream(request = {}, res) {
    try {
      await aiService.chatStream(request.prompt, res, { ...request.options, provider: this.name });
    } catch (err) {
      throw classifyProviderError(err, this.name);
    }
  }

  async isAvailable() {
    if (isAiDisabled()) return false;
    const status = await this.healthCheck();
    return status.available;
  }

  /**
   * 真实健康检查：探测 /api/tags。本机无 Ollama 必须报告 UNREACHABLE，不模拟成功。
   */
  async healthCheck() {
    if (isAiDisabled()) {
      return { status: HEALTH_STATUS.DISABLED, available: false, reason: 'AI_ENABLE=false', model: this._config.model };
    }
    try {
      const result = await probeUrl(`${this._config.baseUrl}/api/tags`, { timeoutMs: 5000 });
      const mapped = mapProbeStatus(result);
      return { status: mapped.status, available: mapped.available, reason: mapped.reason, model: this._config.model };
    } catch (err) {
      const mapped = mapProbeStatus(err);
      return { status: mapped.status, available: false, reason: mapped.reason, model: this._config.model };
    }
  }
}

// ============================================================
// OpenAI Compatible Provider（新增协议实现；AI-02 不要求真实账号）
// ============================================================
class OpenAICompatibleProvider {
  constructor() {
    this._config = {
      name: process.env.AI_OPENAI_NAME || 'openai_compatible',
      baseUrl: process.env.AI_OPENAI_BASE_URL || '',
      apiKey: process.env.AI_OPENAI_API_KEY || '',
      model: process.env.AI_OPENAI_MODEL || '',
    };
  }

  get name() { return this._config.name; }
  get type() { return 'openai_compatible'; }
  get capabilities() {
    return { textGeneration: true, streaming: true, structuredOutput: true, visionInput: false };
  }
  getMetadata() {
    return { name: this.name, model: this._config.model, baseUrl: this._config.baseUrl };
  }

  /** 是否已配置（有 baseUrl 与 model） */
  _configured() {
    return !!(this._config.baseUrl && this._config.model);
  }

  _endpoint() {
    return `${this._config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  }

  _requestBody(prompt, options = {}) {
    return {
      model: options.model || this._config.model,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
        { role: 'user', content: prompt },
      ],
      temperature: options.temperature != null ? options.temperature : 0.7,
      max_tokens: options.maxTokens || 4096,
      stream: false,
    };
  }

  /**
   * 通用 OpenAI Chat Completions 调用（http/https）
   * @param {Object} body
   * @returns {Promise<{status:number, body:Object}>}
   */
  _send(body) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(this._endpoint());
      const isHttps = urlObj.protocol === 'https:';
      const lib = isHttps ? require('https') : require('http');
      const payload = JSON.stringify(body);

      const req = lib.request(
        {
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            ...(this._config.apiKey ? { Authorization: `Bearer ${this._config.apiKey}` } : {}),
          },
          timeout: 60000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            let parsed = data;
            try { parsed = JSON.parse(data); } catch (e) { /* 保持原始文本 */ }
            resolve({ status: res.statusCode, body: parsed });
          });
        }
      );
      req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')); });
      req.on('error', (err) => reject(err));
      req.write(payload);
      req.end();
    });
  }

  async chat(request = {}) {
    if (!this._configured()) {
      throw new AiError(AI_ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED, 'OpenAI Compatible Provider 未配置（AI_OPENAI_BASE_URL/AI_OPENAI_MODEL）', { provider: this.name });
    }
    const start = Date.now();
    try {
      const body = this._requestBody(request.prompt, request.options);
      const { status, body: resp } = await this._send(body);
      if (status === 401 || status === 403) {
        throw new AiError(AI_ERROR_CODES.AI_AUTH_ERROR, `认证失败（HTTP ${status}）`, { provider: this.name });
      }
      if (status === 429) {
        throw new AiError(AI_ERROR_CODES.AI_RATE_LIMITED, '请求受限（HTTP 429）', { provider: this.name });
      }
      if (status >= 400) {
        throw new AiError(AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE, `Provider 返回 HTTP ${status}`, { provider: this.name });
      }
      const content = resp.choices && resp.choices[0] ? (resp.choices[0].message && resp.choices[0].message.content) || '' : '';
      const usage = resp.usage || {};
      return {
        content,
        model: this._config.model,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      throw classifyProviderError(err, this.name);
    }
  }

  async chatStream(request = {}, res) {
    // AI-02：OpenAI Compatible 流式协议留待 AI-03 完整接入；当前显式 NOT_SUPPORTED
    // （不伪造成功，保持能力诚实）
    throw new AiError(AI_ERROR_CODES.AI_INTERNAL_ERROR, `Provider ${this.name} 流式能力待 AI-03 接入`, { provider: this.name });
  }

  async isAvailable() {
    return isAiDisabled() ? false : this._configured();
  }

  async healthCheck() {
    if (isAiDisabled()) {
      return { status: HEALTH_STATUS.DISABLED, available: false, reason: 'AI_ENABLE=false', model: this._config.model || null };
    }
    if (!this._configured()) {
      return { status: HEALTH_STATUS.NOT_CONFIGURED, available: false, reason: 'AI_OPENAI_BASE_URL / AI_OPENAI_MODEL 未配置', model: this._config.model || null };
    }
    try {
      const result = await probeUrl(`${this._config.baseUrl.replace(/\/$/, '')}/models`, {
        token: this._config.apiKey || undefined,
        timeoutMs: 5000,
      });
      const mapped = mapProbeStatus(result);
      return { status: mapped.status, available: mapped.available, reason: mapped.reason, model: this._config.model };
    } catch (err) {
      const mapped = mapProbeStatus(err);
      return { status: mapped.status, available: false, reason: mapped.reason, model: this._config.model };
    }
  }
}

// ============================================================
// Provider 注册表
// ============================================================
const _providers = new Map();

function registerProvider(provider) {
  if (!provider || !provider.name) throw new Error('Provider 必须提供 name');
  _providers.set(provider.name, provider);
}

function getProvider(name) {
  return _providers.get(name) || null;
}

function listProviders() {
  return [..._providers.values()];
}

function hasProvider(name) {
  return _providers.has(name);
}

/** 当前活动 Provider（AI_PROVIDER 环境变量；不存在时返回 null） */
function getActiveProvider() {
  const name = getDefaultProviderName();
  return _providers.get(name) || null;
}

/** 按能力选择首个支持该能力的 Provider（vision 等未来能力路由） */
function selectProviderByCapability(capability) {
  for (const p of _providers.values()) {
    if (p.capabilities && p.capabilities[capability]) return p;
  }
  return null;
}

// 启动时注册内置 Provider（grok / ollama / openai_compatible）
registerProvider(new GrokProvider());
registerProvider(new OllamaProvider());
registerProvider(new OpenAICompatibleProvider());

module.exports = {
  GrokProvider,
  OllamaProvider,
  OpenAICompatibleProvider,
  registerProvider,
  getProvider,
  listProviders,
  hasProvider,
  getActiveProvider,
  getDefaultProviderName,
  selectProviderByCapability,
  classifyProviderError,
};
