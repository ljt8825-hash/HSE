/**
 * HSE AI 统一错误模型（AI-02 Capability Layer）
 *
 * 所有 Provider 错误在能力层统一映射为 AI_ERROR_CODES 中的一个错误码，
 * 对外响应统一为 { success:false, error: { code, message, provider, retryable, requestId } }，
 * 避免不同 Provider 返回完全不同的错误格式。
 *
 * 设计基线：AI-02 任务书 §17（统一 AI 错误模型）
 */

/** 统一 AI 错误码 */
const AI_ERROR_CODES = {
  /** AI 能力层整体未启用（AI_ENABLE=false / AI_NOT_ENABLED） */
  AI_NOT_ENABLED: 'AI_NOT_ENABLED',
  /** Provider 未在注册表中找到 */
  AI_PROVIDER_NOT_FOUND: 'AI_PROVIDER_NOT_FOUND',
  /** Provider 缺少必要配置（如 API Key 为空） */
  AI_PROVIDER_NOT_CONFIGURED: 'AI_PROVIDER_NOT_CONFIGURED',
  /** Provider 已配置但不可达/服务不可用 */
  AI_PROVIDER_UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE',
  /** 认证失败（401 / 403 / 密钥无效） */
  AI_AUTH_ERROR: 'AI_AUTH_ERROR',
  /** 模型不存在 */
  AI_MODEL_NOT_FOUND: 'AI_MODEL_NOT_FOUND',
  /** 请求超时 */
  AI_TIMEOUT: 'AI_TIMEOUT',
  /** 触发限流（429） */
  AI_RATE_LIMITED: 'AI_RATE_LIMITED',
  /** 请求参数不合法 */
  AI_INVALID_REQUEST: 'AI_INVALID_REQUEST',
  /** 其他内部错误 */
  AI_INTERNAL_ERROR: 'AI_INTERNAL_ERROR',
};

/** 错误码 → 是否可重试 */
const RETRYABLE_CODES = new Set([
  AI_ERROR_CODES.AI_TIMEOUT,
  AI_ERROR_CODES.AI_RATE_LIMITED,
  AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
  AI_ERROR_CODES.AI_INTERNAL_ERROR,
]);

/**
 * AI 统一错误类
 * @param {string} code - AI_ERROR_CODES 中的错误码
 * @param {string} message - 人类可读信息
 * @param {Object} [details] - 附加信息 { provider, cause, ... }
 */
class AiError extends Error {
  constructor(code, message, details = {}) {
    super(message || code);
    this.name = 'AiError';
    this.code = code || AI_ERROR_CODES.AI_INTERNAL_ERROR;
    this.provider = details.provider || null;
    this.cause = details.cause || null;
    this.retryable = RETRYABLE_CODES.has(this.code);
    this.details = details;
  }

  /** 转换为对外统一错误结构 */
  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        provider: this.provider,
        retryable: this.retryable,
      },
    };
  }
}

/** 是否 AiError */
function isAiError(err) {
  return err instanceof AiError;
}

/**
 * 任意错误 → 统一错误响应结构（含 requestId）
 * @param {Error} err
 * @param {string} [requestId]
 */
function toErrorResponse(err, requestId) {
  if (isAiError(err)) {
    const json = err.toJSON();
    if (requestId) json.error.requestId = requestId;
    return json;
  }
  // 非 AiError：按内部错误兜底，不回显内部堆栈
  return {
    success: false,
    error: {
      code: AI_ERROR_CODES.AI_INTERNAL_ERROR,
      message: err && err.message ? err.message : 'AI 内部错误',
      provider: null,
      retryable: true,
      requestId: requestId || undefined,
    },
  };
}

module.exports = {
  AI_ERROR_CODES,
  RETRYABLE_CODES,
  AiError,
  isAiError,
  toErrorResponse,
};
