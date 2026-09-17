/**
 * AI-04 路由级集成验证（临时脚本，只读，不触碰生产 5876）
 *
 * 验证目标（AI-04 任务书 §十四~§二十六）：
 *  - 真实 Ollama Provider 闭环：/v2/health → ollama AVAILABLE
 *  - /v2/models 真实模型列表（来自 Ollama /api/tags）
 *  - /v2/generate 真实模型输出（hse.general.analysis v1.0 + 纯测试文本）
 *  - /v2/stream 真实 SSE（event:start → 真实分块 → event:end）
 *  - 错误路径保留：grok NOT_CONFIGURED、unknown provider NOT_FOUND
 *  - Legacy 兼容：provider/status、generate-report、qa、risk-predict 仍可达
 *  - Generation Record：recordSaved/recordId/recordError 如实（表不存在 → NOT_PERSISTED）
 *
 * 运行：node scripts/ai04_ollama_route_check.cjs（须在 server 目录下）
 * 端口：5881（开发临时端口，符合 prod-boundary 规则）
 */
process.env.PORT = '5881';
const app = require('../app');
const jwt = require('jsonwebtoken');
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

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  return res;
}

async function main() {
  await waitForServer();
  token = generateAccessToken({ id: 1, username: 'ai04-test', role: 'admin' });

  // 1. 未认证 → 401
  {
    const res = await api('/api/hse/ai/v2/health', { auth: false });
    record('v2/health 未认证 → 401', res.status === 401, `status=${res.status}`);
  }

  // 2. v2/health 认证可达（ollama 应 AVAILABLE）
  {
    const res = await api('/api/hse/ai/v2/health');
    const j = await res.json();
    const ollama = (j.providers || []).find((p) => p.provider === 'ollama');
    record('v2/health 认证可达 + ollama 状态',
      res.status === 200 && j.aiEnabled === true && ollama && ollama.status === 'AVAILABLE',
      `status=${res.status} aiEnabled=${j.aiEnabled} active=${j.activeProvider} ollama=${ollama && ollama.status} grok=${(j.providers || []).find((p) => p.provider === 'grok') && (j.providers || []).find((p) => p.provider === 'grok').status}`);
  }

  // 3. v2/providers 真实状态
  {
    const res = await api('/api/hse/ai/v2/providers');
    const j = await res.json();
    const by = Object.fromEntries((j.providers || []).map((p) => [p.provider, p.status]));
    record('v2/providers 真实状态（ollama AVAILABLE / grok+openai NOT_CONFIGURED）',
      res.status === 200 && by.ollama === 'AVAILABLE' && by.grok === 'NOT_CONFIGURED' && by.openai_compatible === 'NOT_CONFIGURED',
      `ollama=${by.ollama} grok=${by.grok} openai=${by.openai_compatible}`);
  }

  // 4. v2/models 真实模型（来自 /api/tags）
  {
    const res = await api('/api/hse/ai/v2/models');
    const j = await res.json();
    const ollamaModels = (j.models || []).filter((m) => m.provider === 'ollama');
    const hasQwen = ollamaModels.some((m) => m.model && m.model.includes('qwen2.5:7b'));
    record('v2/models 真实模型列表', res.status === 200 && hasQwen,
      `count=${(j.models || []).length} ollamaModels=[${ollamaModels.map((m) => m.model).join(', ')}]`);
  }

  // 5. v2/generate 真实闭环（纯测试文本）
  {
    const res = await api('/api/hse/ai/v2/generate', {
      method: 'POST',
      body: {
        promptKey: 'hse.general.analysis',
        promptVersion: 'v1.0',
        input: { text: '这是 AI-04 本地模型 Provider 连通性测试，请输出简短测试结果。' },
        source: { domain: 'ai04-route-test', recordId: 'ai04-1' },
      },
    });
    const j = await res.json();
    record('v2/generate 真实模型输出（hse.general.analysis v1.0）',
      res.status === 200 && j.success === true && j.content && j.content.length > 0 && j.provider === 'ollama',
      `success=${j.success} provider=${j.provider} model=${j.model} contentLen=${(j.content || '').length} promptKey=${j.promptKey} recordId=${j.recordId} recordSaved=${j.recordSaved} ${j.recordError ? 'recordError=' + j.recordError : ''}`);
  }

  // 6. v2/stream 真实 SSE（start → 真实分块 → end）
  {
    const res = await fetch(BASE + '/api/hse/ai/v2/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        promptKey: 'hse.general.analysis',
        promptVersion: 'v1.0',
        input: { text: '这是 AI-04 流式测试，请输出一句话测试结果。' },
      }),
      signal: AbortSignal.timeout(120000),
    });
    const text = await res.text();
    const hasStart = /event: start/.test(text);
    const hasEnd = /event: end/.test(text);
    const chunkCount = (text.match(/data: \{"content"/g) || []).length;
    record('v2/stream 真实 SSE（start+真实分块+end）',
      res.status === 200 && hasStart && hasEnd && chunkCount > 0,
      `chunkCount=${chunkCount} start=${hasStart} end=${hasEnd}`);
  }

  // 7. 错误路径：grok 显式请求 → NOT_CONFIGURED
  {
    const res = await api('/api/hse/ai/v2/generate', {
      method: 'POST',
      body: { provider: 'grok', prompt: '测试', input: { text: 'x' } },
    });
    const j = await res.json();
    record('错误路径 grok → AI_PROVIDER_NOT_CONFIGURED',
      j.success === false && j.error && j.error.code === 'AI_PROVIDER_NOT_CONFIGURED',
      `code=${j.error && j.error.code}`);
  }

  // 8. 错误路径：unknown provider → AI_PROVIDER_NOT_FOUND
  {
    const res = await api('/api/hse/ai/v2/generate', {
      method: 'POST',
      body: { provider: 'unknown', prompt: '测试', input: { text: 'x' } },
    });
    const j = await res.json();
    record('错误路径 unknown → AI_PROVIDER_NOT_FOUND',
      j.success === false && j.error && j.error.code === 'AI_PROVIDER_NOT_FOUND',
      `code=${j.error && j.error.code}`);
  }

  // 9. Legacy provider/status 兼容
  {
    const res = await api('/api/hse/ai/provider/status', { method: 'POST', body: {} });
    const j = await res.json();
    record('Legacy provider/status 兼容', res.status === 200 && j.success === true,
      `status=${res.status} providers=${(j.providers || []).length}`);
  }

  // 10. Legacy generate-report 仍挂载（真实链路，走 aiEnhancedService → aiService）
  {
    const res = await api('/api/hse/ai/generate-report', {
      method: 'POST',
      body: { reportType: 'report_hazard', data: { text: 'AI-04 legacy 兼容测试文本' } },
    });
    const j = await res.json();
    record('Legacy generate-report 仍可达', res.status === 200,
      `status=${res.status} success=${j.success} hasContent=${!!j.content || !!j.result}`);
  }

  // 11. Legacy ai.js qa mock 仍可达
  {
    const res = await api('/api/hse/ai/qa', { method: 'POST', body: { question: '测试' } });
    const j = await res.json();
    record('Legacy ai.js /qa mock 仍可达', res.status === 200,
      `status=${res.status} source=${j.source || j.data && j.data.source}`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== 汇总: ${passed}/${results.length} PASS ===`);
  if (passed < results.length) {
    results.filter((r) => !r.ok).forEach((r) => console.log(`FAILED: ${r.name} — ${r.detail}`));
  }
  // 脚本内嵌 HTTP server 会保持事件循环，打印汇总后显式退出，避免僵尸进程
  setTimeout(() => process.exit(passed < results.length ? 1 : 0), 300);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
