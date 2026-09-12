/**
 * WPS 接入层统一错误模型（Sprint-WPS-01）
 *
 * 职责：
 *   - 把 WPS OpenAPI 的不同失败形态归类为稳定的错误类别，供上层精确判断；
 *   - 保证「前端/业务层拿到的 message 不泄露 Token / Secret / 内部路径 / 请求头」；
 *   - 详细诊断信息只进入服务端日志（本模块不写日志，由调用方 logger 决定）。
 *
 * 错误类别（kind）：
 *   AUTH            认证失败（access_token 无效/过期/凭据错误）
 *   PERMISSION      权限失败（无表/字段/视图访问权限，或超出数据权限）
 *   PARAMETER       参数错误（字段 ID / 请求参数不合法）
 *   NETWORK         网络异常（连接失败、超时、DNS 等）
 *   SERVICE         WPS 服务异常（5xx / 平台内部错误）
 *   DATA_STRUCTURE  数据结构异常（返回结构变化、JSON 解析失败）
 */
const WPS_KIND_ORDER = ['AUTH', 'PERMISSION', 'PARAMETER', 'NETWORK', 'SERVICE', 'DATA_STRUCTURE'];

// 给前端的统一安全提示（不含任何敏感信息）
const SAFE_MESSAGE = {
  AUTH: 'WPS 认证失败，请联系管理员检查 WPS 应用配置',
  PERMISSION: 'WPS 权限不足，无法访问多维表数据',
  PARAMETER: 'WPS 请求参数错误（可能为字段配置或表配置问题）',
  NETWORK: '连接 WPS 服务网络异常，请稍后重试',
  SERVICE: 'WPS 服务异常，请稍后重试',
  DATA_STRUCTURE: 'WPS 数据返回结构异常',
};

class WpsError extends Error {
  /**
   * @param {string} kind      错误类别，见 WPS_KIND_ORDER
   * @param {string} message   完整诊断信息（仅用于服务端日志，不直接回前端）
   * @param {object} [opts]    { code, status, detail }
   */
  constructor(kind, message, opts = {}) {
    super(message || 'WPS 未知错误');
    this.name = 'WpsError';
    this.kind = WPS_KIND_ORDER.includes(kind) ? kind : 'SERVICE';
    this.code = opts.code != null ? opts.code : -1;   // WPS 业务错误码（result/code）
    this.status = opts.status || 0;                    // HTTP 状态码
    this.detail = opts.detail;
    this.safeMessage = SAFE_MESSAGE[this.kind];
    // 标识由分类器生成，避免二次包装
    this.isWpsError = true;
  }
}

/** 已知 WPS token 失效/认证类业务码 */
const TOKEN_INVALID_CODES = new Set([401, 401000001]);
/** 已知 WPS 权限类业务码（位数与范围会在 Sprint-WPS-02 实测后收敛） */
const PERMISSION_CODES = new Set([403, 403000001, 4031]);

function classify(err) {
  if (err && err.isWpsError) return err;

  const status = err && err.statusCode ? err.statusCode : (err && err.code);
  const httpStatus = typeof status === 'number' ? status : 0;

  // 1) 明确的 WPS 业务码
  if (err && err.code != null) {
    const code = err.code;
    if (TOKEN_INVALID_CODES.has(code)) {
      return new WpsError('AUTH', err.message, { code, status: httpStatus, detail: err.detail });
    }
    if (PERMISSION_CODES.has(code)) {
      return new WpsError('PERMISSION', err.message, { code, status: httpStatus, detail: err.detail });
    }
  }

  // 2) 网络层异常（fetch TypeError：连接失败 / AbortError：超时 / ECONN 等）
  if (err instanceof TypeError || err.name === 'AbortError' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
    return new WpsError('NETWORK', err.message, { code: -1, status: 0, detail: err.cause || err.name });
  }

  // 3) 按 HTTP 状态分类
  if (httpStatus === 401) return new WpsError('AUTH', err.message, { code: -1, status: httpStatus });
  if (httpStatus === 403) return new WpsError('PERMISSION', err.message, { code: -1, status: httpStatus });
  if (httpStatus === 400 || httpStatus === 404 || httpStatus === 405) {
    return new WpsError('PARAMETER', err.message, { code: -1, status: httpStatus });
  }
  if (httpStatus >= 500) return new WpsError('SERVICE', err.message, { code: -1, status: httpStatus });

  // 4) JSON / 结构解析异常
  if (err instanceof SyntaxError || err && err.isParseError) {
    return new WpsError('DATA_STRUCTURE', err.message, { code: -1, status: httpStatus });
  }

  // 5) 兜底
  return new WpsError('SERVICE', err.message || String(err), { code: -1, status: httpStatus });
}

/** 便捷：抛出一个已分类的 WpsError */
function toWpsError(kind, message, opts) {
  return classify(new WpsError(kind, message, opts));
}

module.exports = { WpsError, classify, toWpsError, WPS_KIND_ORDER, SAFE_MESSAGE };