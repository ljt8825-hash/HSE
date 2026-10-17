// CF-WPS-103：隐患排查 AI 识别填单 —— 回归测试。
//   A 静态接线（前端表单元素 + Worker 路由 + 白名单 + 常量）
//   B 纯函数单测（loadAiProviders / callAiVision / handleHazardAiFill 校验与降级）
// 不含真实模型调用（无密钥）；用 mock fetch 验证强约束 JSON 解析 + 枚举 fail-closed。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(path.join(root, 'frontend', 'check.html'), 'utf8');
const workerSrc = readFileSync(path.join(root, 'worker', 'index.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  => ' + JSON.stringify(extra ?? '')));
  cond ? pass++ : fail++;
};

// 真实逻辑（B 段直接 import，不复制实现）
import { pathToFileURL } from 'node:url';
const mod = await import(pathToFileURL(path.join(root, 'worker', 'index.js')).href);
const { loadAiProviders, callAiVision, handleHazardAiFill, HAZARD_AI_FIELDS, FEISHU_FIELD_WHITELIST,
        HAZARD_CATEGORIES, HAZARD_THREE_VIOLATION, HAZARD_MAJOR, HAZARD_RISK_LEVELS } = mod;

console.log('=== A. 静态接线 ===');
ck('Worker 路由注册 /api/mobile/hazard/ai-fill', workerSrc.includes("'/api/mobile/hazard/ai-fill'"));
ck('Worker 有 handleHazardAiFill', workerSrc.includes('async function handleHazardAiFill('));
ck('前端有 AI 识别按钮 btn-hz-ai', html.includes('id="btn-hz-ai"'));
ck('前端有整改依据/建议 textarea', html.includes('id="hz-basis"') && html.includes('id="hz-suggestion"'));
ck('前端有三违/重大/风险等级网格', html.includes('id="hz-tv-grid"') && html.includes('id="hz-mj-grid"') && html.includes('id="hz-rl-grid"'));
ck('前端有 AI 角标 hz-ai-badge', html.includes('id="hz-ai-badge"'));
ck('前端常量 HAZARD_THREE_VIOLATION', html.includes('const HAZARD_THREE_VIOLATION = ["是","否"]'));
ck('前端常量 HAZARD_RISK_LEVELS 4 档', html.includes('const HAZARD_RISK_LEVELS = ["重大风险","较大风险","一般风险","低风险"]'));
ck('前端提交携带 6 新字段', /body\.rectify_basis = hazardForm\.basis/.test(html) && /body\.ai_raw = hazardForm\.aiRaw/.test(html));
ck('mapHazardRecord 含 6 AI 字段', workerSrc.includes('basis: fieldText(f[HAZARD_AI_FIELDS.basis])') && workerSrc.includes('aiRaw: fieldText(f[HAZARD_AI_FIELDS.aiRaw])'));
ck('FEISHU_FIELD_WHITELIST 含 6 列', ['整改依据','整改建议','三违判定','重大事故隐患判定','风险等级','AI识别原始输出'].every((n) => FEISHU_FIELD_WHITELIST.has(n)));
ck('HAZARD_AI_FIELDS 值为 6 列', Object.values(HAZARD_AI_FIELDS).length === 6);
ck('风险等级枚举 4 档（国标）', HAZARD_RISK_LEVELS.length === 4 && HAZARD_RISK_LEVELS[0] === '重大风险');

console.log('=== B. 纯函数单测 ===');
// loadAiProviders
ck('loadAiProviders: 空 env → []', loadAiProviders({}).length === 0);
ck('loadAiProviders: 仅 DEEPSEEK_API_KEY → 自动构造 deepseek provider', (() => {
  const a = loadAiProviders({ DEEPSEEK_API_KEY: 'x' });
  return a.length === 1 && a[0].id === 'deepseek' && a[0].model === 'deepseek-v4-flash-vision-exp';
})());
ck('loadAiProviders: AI_PROVIDERS JSON 解析 + 按优先级排序', (() => {
  const a = loadAiProviders({ AI_PROVIDERS: JSON.stringify([
    { id: 'b', apiBase: 'https://b', model: 'bm', apiKeySecret: 'BK', enabled: true, priority: 5 },
    { id: 'a', apiBase: 'https://a', model: 'am', apiKeySecret: 'AK', enabled: true, priority: 10 },
    { id: 'off', apiBase: 'https://o', model: 'om', apiKeySecret: 'OK', enabled: false },
  ]) });
  return a.length === 2 && a[0].id === 'a' && a[1].id === 'b';
})());
ck('loadAiProviders: 缺 apiKeySecret 的 provider 被过滤', (() => {
  const a = loadAiProviders({ AI_PROVIDERS: JSON.stringify([{ id: 'x', apiBase: 'https://x', model: 'm', enabled: true }]) });
  return a.length === 0;
})());

// callAiVision（mock fetch）
const realFetch = globalThis.fetch;
const setMockFetch = (payload) => { globalThis.fetch = async () => ({ ok: true, json: async () => payload }); };
const restoreFetch = () => { globalThis.fetch = realFetch; };
const modelGood = { description: '通道堆物', category: '消防安全', threeViolation: '是', majorHazard: '否', riskLevel: '较大风险', basis: '安全生产法', suggestion: '清理通道' };
try {
  setMockFetch({ choices: [{ message: { content: JSON.stringify(modelGood) } }] });
  const r = await callAiVision({ apiBase: 'https://api.deepseek.com/v1', model: 'm', apiKeySecret: 'X' }, 'data:image/jpeg;base64,AAA', 'p', { X: 'key' });
  ck('callAiVision: 解析模型 JSON 成功', r && r.description === '通道堆物' && r.category === '消防安全');
  setMockFetch({ choices: [{ message: { content: 'not json' } }] });
  let threw = false; try { await callAiVision({ apiBase: 'https://x', model: 'm', apiKeySecret: 'X' }, 'data:image/jpeg;base64,AAA', 'p', { X: 'k' }); } catch { threw = true; }
  ck('callAiVision: 非法 JSON 抛错（交由上层降级）', threw);
} finally { restoreFetch(); }

// handleHazardAiFill：构造合法 session + mock fetch
const SECRET = 'test-session-secret-cfwps103';
const tok = await mod.signJwtHs256({ sub: '13800000001', name: '测试员', department: '安环管理部', position: '安全员', iss: 'hse-worker-mobile', aud: 'hse-mobile-h5' }, SECRET);
function mkReq(image) {
  return new Request('https://x/api/mobile/hazard/ai-fill', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok, 'content-length': '100' },
    body: JSON.stringify({ image }),
  });
}
// 1) 无 provider → 静默降级 ai_disabled
{
  const r = await handleHazardAiFill(mkReq('data:image/jpeg;base64,AAA'), { WORKER_SESSION_SECRET: SECRET }, {});
  const j = await r.json();
  console.log('DEBUG no-provider:', r.status, JSON.stringify(j));
  ck('handleHazardAiFill: 无 provider → ai_disabled:true（不阻断）', j.ai_disabled === true);
}
// 2) 合法 provider + 模型返回合规 → 字段校验回填
try {
  const modelOk = { description: '灭火器过期', category: '消防安全', threeViolation: '否', majorHazard: '否', riskLevel: '一般风险', basis: '消防法', suggestion: '更换灭火器' };
  setMockFetch({ choices: [{ message: { content: JSON.stringify(modelOk) } }] });
  const env = { WORKER_SESSION_SECRET: SECRET, AI_PROVIDERS: JSON.stringify([{ id: 'deepseek', apiBase: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash-vision-exp', apiKeySecret: 'DK', enabled: true, priority: 10, timeoutMs: 5000 }]), DK: 'k' };
  const r = await handleHazardAiFill(mkReq('data:image/jpeg;base64,AAA'), env, {});
  const j = await r.json();
  ck('handleHazardAiFill: 合规返回 → ai_disabled:false 且字段校验通过', j.ai_disabled === false && j.category === '消防安全' && j.threeViolation === '否' && j.riskLevel === '一般风险');
  ck('handleHazardAiFill: 返回原始输出留痕 raw', typeof j.raw === 'string' && j.raw.length > 0);
} finally { restoreFetch(); }
// 3) 模型返回非法枚举 → 该字段丢弃（不污染统计）
try {
  const modelBadEnum = { description: 'x', category: '不存在的类别', threeViolation: '也许', majorHazard: '是', riskLevel: '爆表风险', basis: 'b', suggestion: 's' };
  setMockFetch({ choices: [{ message: { content: JSON.stringify(modelBadEnum) } }] });
  const env = { WORKER_SESSION_SECRET: SECRET, AI_PROVIDERS: JSON.stringify([{ id: 'd', apiBase: 'https://api.deepseek.com/v1', model: 'm', apiKeySecret: 'DK', enabled: true, priority: 10, timeoutMs: 5000 }]), DK: 'k' };
  const r = await handleHazardAiFill(mkReq('data:image/jpeg;base64,AAA'), env, {});
  const j = await r.json();
  ck('handleHazardAiFill: 非法 category 被丢弃', j.category === '');
  ck('handleHazardAiFill: 非法 threeViolation/riskLevel 被丢弃', j.threeViolation === '' && j.riskLevel === '');
  ck('handleHazardAiFill: majorHazard=是 合法保留', j.majorHazard === '是');
} finally { restoreFetch(); }
// 4) 非法 image 格式 → 400
{
  const r = await handleHazardAiFill(mkReq('not-a-data-url'), { WORKER_SESSION_SECRET: SECRET }, {});
  ck('handleHazardAiFill: 非法 image → 400', r.status === 400);
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
