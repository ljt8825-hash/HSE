/**
 * AI-10 管理建议 — Unit 测试（不连库、不联网）
 *
 * 覆盖（AI-10 任务书 §17 Unit 要求）：
 *  - Prompt Builder：固定协议字段、数量上限、边界约束、上下文序列化
 *  - 解析：合法 JSON / 围栏 JSON / 非法 JSON / 空内容（fail-closed）
 *  - 校验：正常 / 缺字段 / 类型错误 / 空数组（合法）/ 超长内容（拒绝）
 *  - 边界：责任认定 / 扣分 / 处罚 / 整改指令 / 风险等级 / 考核结果变更 → 拒绝；正常措辞不误伤
 *  - 降级：任务状态非 COMPLETED / aiResult 不可用 → available=false 不伪造成功、统计保留
 *  - Gateway 结果：成功 / Provider 不可达 / 非法 JSON / 越权内容 → 正确映射
 *  - 缓存解析：有效缓存 / 无效缓存（不伪装成功）
 *  - Provider 路由回归（AI-09 options.provider 修复）：显式指定 / 未指定默认 / 不存在 → 统一错误
 */
'use strict';

const assert = require('assert');

const suites = { Unit: [] };
function record(suite, name, ok, detail) {
  suites[suite].push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${suite}] ${name}${detail != null ? '  ' + JSON.stringify(detail) : ''}`);
}

/* ─────────────── 受控模块替换（不连库不联网） ─────────────── */
const taskService = require('../services/ai/tasks/aiAnalysisTaskService');
const gateway = require('../services/ai/aiGateway');
const svc = require('../services/ai/analysis/managementSuggestionService');
const { AiError } = require('../services/ai/errors');

const origGetTask = taskService.getTask;
const origGenerate = gateway.generate;

function mockTask(fake) {
  taskService.getTask = async () => fake;
}
function mockGateway(fn) {
  gateway.generate = fn;
}
function restoreMocks() {
  taskService.getTask = origGetTask;
  gateway.generate = origGenerate;
}

/* ─────────────── 样例数据 ─────────────── */
const VALID_SUGGESTION = {
  overall_assessment: '近三个月隐患整改率有所下滑，需关注整改闭环。',
  priority_issues: ['未整改问题数量上升', '重复问题集中在同一区域'],
  management_actions: ['建议管理人员核查未整改问题闭环流程', '建议加强重点区域巡查频次'],
  monitoring_points: ['整改率月度变化', '重复问题数量'],
  follow_up_suggestions: ['建议进一步核查未整改原因分布', '建议对比上月同类数据'],
  limitations: ['样本时间范围有限', '统计基于已采集记录'],
};

const CLEAN_ANALYSIS = {
  summary: '隐患总量平稳，整改率 82%。',
  key_findings: ['高频类别为安全设施'],
  trend_analysis: ['3 月数量上升'],
  anomalies: [],
  high_frequency_issues: ['安全设施类占 40%'],
  possible_causes: ['可能原因是检查频次不足'],
  management_suggestions: ['建议关注安全设施类问题'],
  limitations: [],
};

const FAKE_STATS = { summary: { total: 30, rectifiedCount: 24, unrectifiedCount: 6, rectificationRate: 80, overdueCount: 2, duplicateCount: 3 }, dataScope: { truncated: false } };

function makeAiError(code, message) {
  return new AiError(code, message);
}

/* ─────────────── 1. Prompt Builder ─────────────── */
function unitPromptBuilder() {
  const { buildSuggestionPrompt, SUGGESTION_OUTPUT_SCHEMA } = require('../services/ai/analysis/managementSuggestionPromptBuilder');
  const p = buildSuggestionPrompt(CLEAN_ANALYSIS, FAKE_STATS, { ragEvidence: [] });
  const keys = Object.keys(SUGGESTION_OUTPUT_SCHEMA);
  const pass1 = ['overall_assessment', 'priority_issues', 'management_actions', 'monitoring_points', 'follow_up_suggestions', 'limitations'].every((k) => keys.includes(k) && p.includes(k));
  record('Unit', 'PromptBuilder: 固定协议 6 字段全部在 Schema 与 Prompt 中', pass1, keys);

  const bounded = /2~5 条/.test(p) && /1~4 条/.test(p) && /不超过 100 字/.test(p);
  record('Unit', 'PromptBuilder: 数量/长度上限约束存在', bounded);

  const boundary = ['禁止认定', '责任', '扣分', '处罚', '整改任务', '风险等级', '考核结果'].every((w) => p.includes(w));
  record('Unit', 'PromptBuilder: 人机边界约束在 Prompt 中', boundary);

  const jsonOnly = p.includes('合法 JSON 对象') && p.includes('不要输出 markdown 代码块');
  record('Unit', 'PromptBuilder: 输出协议 JSON-only 约束', jsonOnly);

  const ser = JSON.stringify(buildSuggestionPrompt(CLEAN_ANALYSIS, FAKE_STATS));
  record('Unit', 'PromptBuilder: 上下文含分析结果与统计快照', ser.includes('analysis') && ser.includes('statistics'));

  const withRag = buildSuggestionPrompt(CLEAN_ANALYSIS, FAKE_STATS, {
    ragEvidence: [{ source_field: '安全管理制度', evidence_text: '隐患排查治理制度要求闭环管理' }],
  });
  record('Unit', 'PromptBuilder: RAG 制度依据注入（[来源:] 引用）', withRag.includes('制度依据') && withRag.includes('[安全管理制度]'));
}

/* ─────────────── 2. 解析（fail-closed） ─────────────── */
function unitParse() {
  const ok1 = svc.parseSuggestionOutput(JSON.stringify(VALID_SUGGESTION));
  record('Unit', '解析: 合法 JSON', !!ok1 && ok1.overall_assessment === VALID_SUGGESTION.overall_assessment);

  const fenced = `\`\`\`json\n${JSON.stringify(VALID_SUGGESTION)}\n\`\`\``;
  const ok2 = svc.parseSuggestionOutput(fenced);
  record('Unit', '解析: ```json 围栏剥离', !!ok2 && Array.isArray(ok2.priority_issues));

  let threw = null;
  try { svc.parseSuggestionOutput('这不是 JSON'); } catch (e) { threw = e; }
  record('Unit', '解析: 非 JSON → 抛 AI_STRUCTURED_OUTPUT_INVALID', threw && threw.code === 'AI_STRUCTURED_OUTPUT_INVALID');

  threw = null;
  try { svc.parseSuggestionOutput(''); } catch (e) { threw = e; }
  record('Unit', '解析: 空内容 → 抛 AI_STRUCTURED_OUTPUT_INVALID', threw && threw.code === 'AI_STRUCTURED_OUTPUT_INVALID');
}

/* ─────────────── 3. 校验 ─────────────── */
function unitValidate() {
  const ok = svc.validateSuggestion({ ...VALID_SUGGESTION });
  record('Unit', '校验: 正常结构通过', !!ok && ok.overall_assessment.length > 0);

  let threw = null;
  try { svc.validateSuggestion({ ...VALID_SUGGESTION, overall_assessment: undefined }); } catch (e) { threw = e; }
  record('Unit', '校验: 缺 overall_assessment → 拒绝', threw && threw.code === 'AI_STRUCTURED_OUTPUT_INVALID');

  threw = null;
  try { svc.validateSuggestion({ ...VALID_SUGGESTION, management_actions: undefined }); } catch (e) { threw = e; }
  record('Unit', '校验: 缺 management_actions → 拒绝', threw && threw.code === 'AI_STRUCTURED_OUTPUT_INVALID');

  threw = null;
  try { svc.validateSuggestion({ ...VALID_SUGGESTION, priority_issues: 'not-array' }); } catch (e) { threw = e; }
  record('Unit', '校验: 数组字段类型错误 → 拒绝', threw && threw.code === 'AI_STRUCTURED_OUTPUT_INVALID');

  const emptyArrays = svc.validateSuggestion({
    overall_assessment: '总体判断',
    priority_issues: [],
    management_actions: [],
    monitoring_points: [],
    follow_up_suggestions: [],
    limitations: [],
  });
  record('Unit', '校验: 空数组 → 结构合法（允许）', !!emptyArrays);

  threw = null;
  try { svc.validateSuggestion({ ...VALID_SUGGESTION, overall_assessment: '字'.repeat(201) }); } catch (e) { threw = e; }
  record('Unit', '校验: 总体判断超长(>200) → 拒绝', threw && threw.code === 'AI_STRUCTURED_OUTPUT_INVALID');

  threw = null;
  try { svc.validateSuggestion({ ...VALID_SUGGESTION, priority_issues: ['字'.repeat(121)] }); } catch (e) { threw = e; }
  record('Unit', '校验: 数组元素超长(>120) → 拒绝', threw && threw.code === 'AI_STRUCTURED_OUTPUT_INVALID');
}

/* ─────────────── 4. 边界（fail-closed） ─────────────── */
function unitBoundary() {
  record('Unit', '边界: 正常建议通过', !!svc.assertBoundary({ ...VALID_SUGGESTION }));

  const cases = [
    ['责任认定: 认定张某违规', { priority_issues: ['认定张某违规，应严肃处理'] }],
    ['扣分: 王某应扣5分', { management_actions: ['对王某应扣5分'] }],
    ['责任人: 责任人是李某', { management_actions: ['核查确认责任人是李某'] }],
    ['处罚: 建议对责任部门进行处罚', { management_actions: ['建议对责任部门进行处罚'] }],
    ['整改指令: 责令限期整改', { management_actions: ['责令相关单位限期整改'] }],
    ['风险等级: 风险等级调整为高', { follow_up_suggestions: ['将风险等级调整为高'] }],
    ['考核结果: 考核结果判定为不合格', { management_actions: ['考核结果判定为不合格'] }],
  ];
  for (const [name, patch] of cases) {
    let threw = null;
    try { svc.assertBoundary({ ...VALID_SUGGESTION, ...patch }); } catch (e) { threw = e; }
    record('Unit', `边界拒绝 ${name}`, threw && threw.code === 'AI_BOUNDARY_VIOLATION', threw && threw.message);
  }

  const noFalse = svc.assertBoundary({
    ...VALID_SUGGESTION,
    management_actions: ['建议关注逾期未整改问题的闭环情况', '建议核查可能原因，如检查频次不足'],
    priority_issues: ['整改率下滑需关注'],
  });
  record('Unit', '边界 不误伤正常措辞（整改/未整改/可能原因）', !!noFalse);
}

/* ─────────────── 5. 生成降级（AI 不可用） ─────────────── */
async function unitDegraded() {
  // 任务非终态
  mockTask({ id: 1, status: 'PENDING' });
  let threw = null;
  try { await svc.generateSuggestion(1, { force: true }); } catch (e) { threw = e; }
  record('Unit', '降级 非 COMPLETED 任务 → 抛 AI_TASK_INVALID_STATE', threw && threw.code === 'AI_TASK_INVALID_STATE');

  // aiResult 缺失
  mockTask({ id: 2, status: 'COMPLETED', aiResult: null, statisticsSnapshot: FAKE_STATS, evidence: [] });
  const r1 = await svc.generateSuggestion(2, { force: true });
  record('Unit', '降级 aiResult=null → available=false + AI_UNAVAILABLE + 统计保留',
    r1.available === false && r1.code === 'AI_UNAVAILABLE' && r1.statistics === FAKE_STATS && r1.degraded === true);

  // aiResult 不可用（Provider 不可达）
  mockTask({ id: 3, status: 'COMPLETED', aiResult: { available: false, code: 'AI_PROVIDER_UNREACHABLE', message: '连接失败' }, statisticsSnapshot: FAKE_STATS, evidence: [] });
  const r2 = await svc.generateSuggestion(3, { force: true });
  record('Unit', '降级 aiResult.available=false → 保留错误码 + 统计保留',
    r2.available === false && r2.code === 'AI_PROVIDER_UNREACHABLE' && r2.statistics === FAKE_STATS);
}

/* ─────────────── 6. Gateway 结果映射 ─────────────── */
async function unitGatewayResult() {
  const task = { id: 10, status: 'COMPLETED', aiResult: { available: true, analysis: CLEAN_ANALYSIS }, statisticsSnapshot: FAKE_STATS, evidence: [{ source_type: 'business_record', source_id: 'hazard', source_domain: 'hazard', source_field: 'statistics', evidence_text: '统计数据', evidence_strength: 'high' }] };
  mockTask(task);

  // 成功
  mockGateway(async () => ({
    content: JSON.stringify(VALID_SUGGESTION),
    provider: 'ollama', model: 'qwen2.5:7b', promptKey: 'hse.management.suggestion', promptVersion: 'v1.0',
    durationMs: 1234, recordId: 999, recordSaved: true, evidence: [],
  }));
  const okR = await svc.generateSuggestion(10, { userId: 1, provider: 'ollama', force: true });
  record('Unit', 'Gateway 成功 → available + 结构化 + recordId + 协议字段',
    okR.available === true && okR.structured === true && okR.recordId === 999 && okR.suggestion && okR.suggestion.priority_issues.length === 2 && okR.provider === 'ollama');

  // Provider 不可达
  mockGateway(async () => { throw makeAiError('AI_PROVIDER_UNREACHABLE', '连接失败'); });
  const unR = await svc.generateSuggestion(10, { force: true });
  record('Unit', 'Gateway Provider 不可达 → available=false + 不 500 + 统计保留',
    unR.available === false && unR.code === 'AI_PROVIDER_UNREACHABLE' && unR.statistics === FAKE_STATS);

  // 非法 JSON
  mockGateway(async () => ({ content: '不是JSON', provider: 'ollama', model: 'm', durationMs: 1, recordId: 1, recordSaved: false, evidence: [] }));
  const badR = await svc.generateSuggestion(10, { force: true });
  record('Unit', 'Gateway 非法 JSON → available=false + structured=false + AI_STRUCTURED_OUTPUT_INVALID',
    badR.available === false && badR.structured === false && badR.code === 'AI_STRUCTURED_OUTPUT_INVALID');

  // 越权内容
  mockGateway(async () => ({ content: JSON.stringify({ ...VALID_SUGGESTION, management_actions: ['对王某应扣5分'] }), provider: 'ollama', model: 'm', durationMs: 1, recordId: 1, recordSaved: false, evidence: [] }));
  const bdR = await svc.generateSuggestion(10, { force: true });
  record('Unit', 'Gateway 越权内容 → available=false + AI_BOUNDARY_VIOLATION',
    bdR.available === false && bdR.code === 'AI_BOUNDARY_VIOLATION');
}

/* ─────────────── 7. 缓存解析 ─────────────── */
function unitCache() {
  const validRecord = {
    id: 5, result: JSON.stringify(VALID_SUGGESTION), provider: 'ollama', model: 'qwen2.5:7b',
    prompt_key: 'hse.management.suggestion', prompt_version: 'v1.0', duration_ms: 100, evidence: [], created_at: '2026-09-15T00:00:00Z',
  };
  const okR = svc.toSuggestionResult(validRecord, 10);
  record('Unit', '缓存 有效记录 → cached + available + suggestion', okR.cached === true && okR.available === true && okR.suggestion && okR.recordId === 5);

  const badRecord = { ...validRecord, id: 6, result: 'broken json' };
  const badR = svc.toSuggestionResult(badRecord, 10);
  record('Unit', '缓存 无效记录 → cached + available=false + 不伪装成功', badR.cached === true && badR.available === false && badR.suggestion === null && !!badR.code);
}

/* ─────────────── 8. Evidence 拆分 ─────────────── */
function unitEvidenceSplit() {
  const { business, knowledge } = svc.splitEvidence([
    { source_type: 'business_record', source_id: 'hazard' },
    { source_type: 'knowledge_base', source_id: 'chunk-1' },
    { source_type: 'business_record', source_id: 'x' },
  ]);
  record('Unit', 'Evidence 拆分 统计/知识 两分', business.length === 2 && knowledge.length === 1);
}

/* ─────────────── 9. Provider 路由回归（AI-09 修复） ─────────────── */
function unitProviderRegression() {
  const gatewayMod = require('../services/ai/aiGateway');
  const p1 = gatewayMod.resolveProvider('ollama');
  const p2 = gatewayMod.resolveProvider('grok');
  record('Unit', 'Provider 显式 ollama → ollama', p1 && p1.name === 'ollama', p1 && p1.name);
  record('Unit', 'Provider 显式 grok → grok', p2 && p2.name === 'grok', p2 && p2.name);

  const active = gatewayMod.resolveProvider(undefined);
  record('Unit', 'Provider 未指定 → 活动 Provider（默认 grok）', !!active && active.name === 'grok', active && active.name);

  let threw = null;
  try { gatewayMod.resolveProvider('not-exist-provider'); } catch (e) { threw = e; }
  record('Unit', 'Provider 不存在 → AI_PROVIDER_NOT_FOUND', threw && threw.code === 'AI_PROVIDER_NOT_FOUND');

  const openai = gatewayMod.resolveProvider('openai_compatible');
  record('Unit', 'Provider openai_compatible 可解析', !!openai && openai.name === 'openai_compatible');
}

/* ─────────────── 汇总 ─────────────── */
async function main() {
  process.env.AI_PROVIDER = 'grok'; // 默认 Provider 基线（与 .env 一致）
  unitPromptBuilder();
  unitParse();
  unitValidate();
  unitBoundary();
  await unitDegraded();
  await unitGatewayResult();
  unitCache();
  unitEvidenceSplit();
  unitProviderRegression();
  restoreMocks();

  const total = suites.Unit.length;
  const passed = suites.Unit.filter((t) => t.ok).length;
  console.log(`\nUnit: ${passed}/${total}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => { console.error('UNIT_ABORT', e); process.exit(1); });
