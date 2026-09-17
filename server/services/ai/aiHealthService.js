/**
 * AI Provider Health（AI-02 Capability Layer）
 *
 * 统一 Provider 健康状态判断。设计基线：AI-02 任务书 §8。
 * 铁律：不伪造成功——没有 API Key 必须报告 NOT_CONFIGURED，本机无 Ollama 必须报告
 * NOT_CONFIGURED/UNREACHABLE，绝不返回 { available: true } 冒充可用。
 */

const http = require('http');
const https = require('https');

/** Provider 健康状态枚举 */
const HEALTH_STATUS = {
  AVAILABLE: 'AVAILABLE',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  UNREACHABLE: 'UNREACHABLE',
  AUTH_ERROR: 'AUTH_ERROR',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  ERROR: 'ERROR',
  DISABLED: 'DISABLED',
};

/** 是否处于禁用状态（AI_ENABLE=false 时全部 Provider 视为 DISABLED） */
function isAiDisabled() {
  return String(process.env.AI_ENABLE || 'true').toLowerCase() === 'false';
}

/**
 * 对指定 URL 发起一次探测请求（仅用于健康检查）
 * @param {string} url
 * @param {string} [token] - Bearer token（可选）
 * @param {number} [timeoutMs]
 * @returns {Promise<{status:number, body:string}>} 成功解析的响应
 * @throws {Error} 网络/超时/非 2xx 抛错（错误信息含可分类关键词）
 */
function probeUrl(url, { token, timeoutMs = 5000, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (e) {
      return reject(new Error(`INVALID_URL: ${url}`));
    }
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: 'application/json',
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')); });
    req.on('error', (err) => reject(new Error(`UNREACHABLE: ${err.message}`)));
    req.end();
  });
}

/**
 * 根据 HTTP 探测结果映射健康状态
 * @param {Error|{status:number}} result - probeUrl 结果或抛出的错误
 */
function mapProbeStatus(result) {
  if (result instanceof Error) {
    const msg = result.message;
    if (msg.startsWith('TIMEOUT')) return { status: HEALTH_STATUS.TIMEOUT, available: false, reason: '请求超时' };
    if (msg.startsWith('INVALID_URL')) return { status: HEALTH_STATUS.ERROR, available: false, reason: `无效地址: ${msg.slice(11)}` };
    if (msg.startsWith('UNREACHABLE')) return { status: HEALTH_STATUS.UNREACHABLE, available: false, reason: `服务不可达: ${msg.slice(11)}` };
    return { status: HEALTH_STATUS.ERROR, available: false, reason: msg };
  }
  if (result.status === 200) return { status: HEALTH_STATUS.AVAILABLE, available: true, reason: '正常' };
  if (result.status === 401 || result.status === 403) return { status: HEALTH_STATUS.AUTH_ERROR, available: false, reason: `认证失败（HTTP ${result.status}）` };
  if (result.status === 404) return { status: HEALTH_STATUS.MODEL_NOT_FOUND, available: false, reason: '资源不存在（HTTP 404）' };
  if (result.status === 429) return { status: HEALTH_STATUS.TIMEOUT, available: false, reason: '请求受限（HTTP 429）' };
  return { status: HEALTH_STATUS.ERROR, available: false, reason: `异常响应（HTTP ${result.status}）` };
}

/**
 * 对单个 Provider 执行健康检查
 * @param {Object} provider - 已注册的 Provider 实例（含 name/type/healthCheck）
 * @returns {Promise<{provider:string, type:string, status:string, available:boolean,
 *                    reason:string|null, model:string|null, latencyMs:number, timestamp:string}>}
 */
async function checkProviderHealth(provider) {
  const start = Date.now();
  try {
    const result = await provider.healthCheck();
    return {
      provider: provider.name,
      type: provider.type,
      status: result.status || HEALTH_STATUS.ERROR,
      available: !!result.available,
      reason: result.reason || null,
      model: result.model || null,
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      provider: provider.name,
      type: provider.type,
      status: HEALTH_STATUS.ERROR,
      available: false,
      reason: err.message || '健康检查异常',
      model: null,
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 对注册表中全部 Provider 执行健康检查
 * @param {Array} providers - registry.list() 结果
 */
async function checkAllProviders(providers) {
  const results = await Promise.all(providers.map((p) => checkProviderHealth(p)));
  return results;
}

module.exports = {
  HEALTH_STATUS,
  isAiDisabled,
  probeUrl,
  mapProbeStatus,
  checkProviderHealth,
  checkAllProviders,
};
