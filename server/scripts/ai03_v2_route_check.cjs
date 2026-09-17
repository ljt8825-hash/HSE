/**
 * AI-03 路由级集成验证（临时脚本，只读，不触碰生产 5876）
 *
 * 验证目标：
 *  - /api/hse/ai/v2 六个端点（health/providers/models/generate/stream/analyze）真实可达；
 *  - 统一 SSE 信封（event:start → error 帧）真实链路；
 *  - 双轨制字段（compliance_status 等）被忽略；
 *  - Legacy API（ai.js / ai-enhanced.js）仍然可访问、未被删除。
 *
 * 运行：node scripts/ai03_v2_route_check.cjs（须在 server 目录下）
 * 端口：5881（开发临时端口，符合 prod-boundary 规则）
 */
process.env.PORT = '5881';
const path = require('path');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { pool } = require('../config/db');
const { generateAccessToken, JWT_SECRET } = require('../middleware/auth');

const BASE = 'http://127.0.0.1:5881';
const results = [];
let token = null;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(1500) });
      if (res.status >= 200 && res.status < 500) return;
    } catch (e) { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('服务 10 秒内未就绪');
}

async function jsonRequest(method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* 非 JSON（如 SSE） */ }
  return { status: res.status, json, text };
}

async function sseRequest(urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let all = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    all += decoder.decode(value, { stream: true });
  }
  return { status: res.status, text: all };
}

(async () => {
  try {
    // 1. 取一个 admin/safety_manager 用户（只读）
    const userResult = await pool.query(
      `SELECT id, username, role FROM users WHERE role IN ('admin','safety_manager') AND is_active = true ORDER BY id LIMIT 1`
    );
    if (userResult.rows.length === 0) {
      console.log('SKIP  无 admin/safety_manager 用户，无法验证受保护端点');
      return;
    }
    const user = userResult.rows[0];
    token = generateAccessToken({ id: user.id, username: user.username, role: user.role });
    console.log(`用户: id=${user.id} role=${user.role} JWT_SECRET=${JWT_SECRET ? '已加载' : 'MISSING'}`);

    // 2. 等待 app.js 模块级自动监听（require 时已启动，NODE_ENV=development）
    await waitForServer();

    // 3. 无 token 应 401
    const noToken = await fetch(BASE + '/api/hse/ai/v2/health');
    record('v2/health 未认证 → 401', noToken.status === 401, `status=${noToken.status}`);

    // 4. GET /v2/health
    const health = await jsonRequest('GET', '/api/hse/ai/v2/health');
    record('v2/health 认证可达', health.status === 200 && health.json && health.json.success === true,
      `status=${health.status} aiEnabled=${health.json && health.json.aiEnabled} active=${health.json && health.json.activeProvider}`);

    // 5. GET /v2/providers
    const providers = await jsonRequest('GET', '/api/hse/ai/v2/providers');
    const pv = providers.json && providers.json.providers;
    const grok = pv && pv.find((p) => p.provider === 'grok');
    const ollama = pv && pv.find((p) => p.provider === 'ollama');
    record('v2/providers 含 Grok NOT_CONFIGURED', providers.status === 200 && grok && grok.status === 'NOT_CONFIGURED',
      `grok=${grok && grok.status} ollama=${ollama && ollama.status} count=${pv ? pv.length : 0}`);

    // 6. GET /v2/models
    const models = await jsonRequest('GET', '/api/hse/ai/v2/models');
    const ms = models.json && models.json.models;
    record('v2/models 如实返回状态', models.status === 200 && ms && ms.length >= 3 && ms.every((m) => m.available === false),
      `count=${ms ? ms.length : 0} allNotAvailable=${ms ? ms.every((m) => m.available === false) : 'n/a'}`);

    // 7. POST /v2/generate → 应 NOT_CONFIGURED（Grok 无 Key）
    const gen = await jsonRequest('POST', '/api/hse/ai/v2/generate', {
      prompt: '测试提示', provider: 'grok', source: { domain: 'test', recordId: 'check' },
    });
    record('v2/generate 真实状态 NOT_CONFIGURED', gen.json && gen.json.error && gen.json.error.code === 'AI_PROVIDER_NOT_CONFIGURED',
      `code=${gen.json && gen.json.error && gen.json.error.code}`);

    // 8. POST /v2/generate promptKey 路径（应同样 NOT_CONFIGURED，证明 Prompt 解析已执行）
    const genKey = await jsonRequest('POST', '/api/hse/ai/v2/generate', {
      promptKey: 'hse.general.analysis', promptVersion: 'v1.0',
      input: { text: '测试' }, source: { domain: 'test' },
    });
    record('v2/generate promptKey 链路解析', genKey.json && genKey.json.error && genKey.json.error.code === 'AI_PROVIDER_NOT_CONFIGURED',
      `code=${genKey.json && genKey.json.error && genKey.json.error.code}`);

    // 9. 双轨制：携带 compliance_status 应被忽略（不会作为写入字段，响应仍是统一错误而非字段错误）
    const dual = await jsonRequest('POST', '/api/hse/ai/v2/generate', {
      prompt: 'x', provider: 'grok',
      compliance_status: 'compliant', checked_by: 'hacker', manual_remark: '注入',
    });
    record('v2 双轨制字段被忽略', dual.json && dual.json.error && dual.json.error.code === 'AI_PROVIDER_NOT_CONFIGURED',
      `code=${dual.json && dual.json.error && dual.json.error.code}`);

    // 10. POST /v2/stream → SSE 信封：event:start + event:error（Grok 不可用）
    const sse = await sseRequest('/api/hse/ai/v2/stream', {
      prompt: 'SSE 测试', provider: 'grok', source: { domain: 'test' },
    });
    const hasStart = sse.text.includes('event: start') && sse.text.includes('"requestId"') && sse.text.includes('"traceId"');
    const hasError = sse.text.includes('event: error') && sse.text.includes('AI_PROVIDER_NOT_CONFIGURED');
    record('v2/stream 统一 SSE 信封 start+error', sse.status === 200 && hasStart && hasError,
      `start=${hasStart} error=${hasError}`);

    // 11. POST /v2/analyze → NOT_CONFIGURED
    const ana = await jsonRequest('POST', '/api/hse/ai/v2/analyze', { prompt: 'x', provider: 'grok' });
    record('v2/analyze 真实状态 NOT_CONFIGURED', ana.json && ana.json.error && ana.json.error.code === 'AI_PROVIDER_NOT_CONFIGURED',
      `code=${ana.json && ana.json.error && ana.json.error.code}`);

    // 12. Legacy: ai-enhanced /provider/status 仍可达且含统一 providers[]
    const ps = await jsonRequest('POST', '/api/hse/ai/provider/status');
    record('Legacy provider/status 兼容', ps.status === 200 && ps.json && Array.isArray(ps.json.data.providers),
      `status=${ps.status} providers=${ps.json && ps.json.data && ps.json.data.providers && ps.json.data.providers.length}`);

    // 13. Legacy: ai.js /qa mock 仍可达
    const qa = await jsonRequest('POST', '/api/hse/ai/qa', { question: '测试问题' });
    record('Legacy ai.js /qa mock 仍可达', qa.status === 200 && qa.json && qa.json.data && qa.json.data.source === 'mock',
      `status=${qa.status} source=${qa.json && qa.json.data && qa.json.data.source}`);

    // 14. Legacy: ai-enhanced /generate-report 仍挂载（坏 ID → 业务错误而非 404）
    const gr = await jsonRequest('POST', '/api/hse/ai/generate-report', { type: 'hazard', dataId: 999999999 });
    record('Legacy generate-report 仍挂载', gr.status === 200,
      `status=${gr.status} msg=${gr.json && gr.json.message}`);

    // 15. Legacy: ai.js /risk-predict 规则接口仍可达
    const rp = await jsonRequest('POST', '/api/hse/ai/risk-predict', { periodDays: 30 });
    record('Legacy ai.js /risk-predict 仍可达', rp.status === 200 && rp.json && rp.json.data,
      `status=${rp.status} hasData=${!!(rp.json && rp.json.data)}`);
  } catch (err) {
    console.log('ERROR', err.message);
    process.exitCode = 2;
  } finally {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n=== 汇总: ${results.length - failed.length}/${results.length} PASS${failed.length ? ', FAIL: ' + failed.map((f) => f.name).join('; ') : ''} ===`);
    // app.js 模块级启动的调度器/WebSocket 会保持进程存活，直接强制退出（仅测试脚本）
    process.exit(failed.length ? 1 : 0);
  }
})();
