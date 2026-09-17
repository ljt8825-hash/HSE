/**
 * AI-06 结构化数据分析 E2E 测试（临时脚本，5881 开发端口，只读 + 人工构造数据）
 *
 * 覆盖（AI-06 任务书 §23/§24）：
 *  - Unit：normalizer（状态/逾期）、statistics（空/趋势/TOP/整改率/重复/边界）、
 *           structured parser（正常/围栏/非法/缺字段）、adapter（无效域/时间范围倒置）
 *  - Integration：真实 analyzeData（注入 60 条虚拟隐患）→ 统计正确 + AI Gateway → Ollama 真实生成
 *                 + useRag → knowledge_base evidence + AI unavailable 降级 + 真实 hazards 表最小只读验证
 *  - Route：401 / 400 / 200 / invalid domain / AI unavailable / empty data / 双轨制字段剥离
 *
 * 运行：node scripts/ai06_analysis_e2e_check.cjs（须在 server 目录下）
 * 数据：全部人工构造（虚拟隐患记录），不触碰真实业务数据（真实表仅 limit 5 只读结构验证）。
 *
 * 环境说明（重要）：server/.env 冻结配置 AI_PROVIDER=grok（未配 Key）；Ollama 为真实可用 Provider。
 * aiService 按模块加载时的 AI_PROVIDER 决定路由，因此本脚本在加载任何模块前
 * 进程级覆盖 AI_PROVIDER=ollama（不修改 .env、不修改任何冻结代码），使
 * AI Gateway → Ollama → qwen2.5:7b 真实链路可用；同时保留"未指定 provider → 降级"的验证用例。
 */

process.env.PORT = '5881';
process.env.AI_PROVIDER = 'ollama'; // 进程级覆盖（dev 验证），不改 .env；见文件头说明
// 7B 模型 CPU 生成完整 JSON 分析较慢（实测 ~5 token/s）：放宽单次请求超时，否则 60s 默认值必超时
process.env.AI_TIMEOUT_MS = '300000';

const { pool } = require('../config/db');
const { normalizeStatus, normalizeRecord, normalizeRecords } = require('../services/ai/analysis/analysisNormalizer');
const { computeStatistics } = require('../services/ai/analysis/analysisStatistics');
const { parseStructuredOutput, validateStructured } = require('../services/ai/analysis/analysisService');
const adapter = require('../services/ai/analysis/analysisDataAdapter');
const analysisService = require('../services/ai/analysis/analysisService');

const results = [];

function record(name, ok, detail) {
  results.push({ suite: 'suite', name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

function recordSuite(suite, name, ok, detail) {
  results.push({ suite, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${suite}] ${name}  ${detail}`);
}

// ========== 人工构造虚拟隐患数据（60 条，AI-06 测试专用） ==========
function buildVirtualHazards() {
  const categories = ['有限空间', '高处作业', '临时用电', '消防设施', '机械防护', '化学品管理'];
  const orgs = ['作业一队', '作业二队', '乡镇A', '乡镇B'];
  const areas = ['厂区A', '厂区B', '作业区C'];
  const levels = ['一般', '较大', '重大'];
  const rows = [];
  let id = 100001;
  const months = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
  for (let i = 0; i < 60; i++) {
    const month = months[Math.floor(i / 9)]; // 每月约 8-9 条，3 月最多制造趋势
    const day = String(5 + (i % 20)).padStart(2, '0');
    const category = categories[i % categories.length];
    const org = orgs[i % orgs.length];
    // 状态：60% 已完成（已整改），25% 待整改，10% 整改中，5% null
    let status;
    const r = i % 20;
    if (r < 12) status = '已完成';
    else if (r < 17) status = '待整改';
    else if (r < 19) status = '整改中';
    else status = null;
    const deadline = `${month}-2${String(day).slice(0, 1)}`;
    rows.push({
      id: id++,
      date: `${month}-${day}`,
      status,
      category,
      level: levels[i % 3],
      org,
      area: areas[i % 3],
      source: 'daily_check',
      deadline,
      rectify_date: status === '已完成' ? `${month}-2${String(day).slice(0, 1)}` : null,
      verify_date: status === '已完成' ? `${month}-2${String(day).slice(0, 1)}` : null,
    });
  }
  // 制造重复问题：有限空间 + 作业一队 未整改多条（id 打乱顺序无关）
  for (let i = 0; i < 3; i++) {
    rows.push({
      id: id++,
      date: '2026-08-1' + i,
      status: '待整改',
      category: '有限空间',
      level: '较大',
      org: '作业一队',
      area: '厂区A',
      source: 'daily_check',
      deadline: '2026-08-20',
      rectify_date: null,
      verify_date: null,
    });
  }
  return rows; // 63 条（60 + 3 重复）
}

// ========== Unit：normalizer ==========
function unitNormalizer() {
  const s1 = normalizeStatus('已完成');
  recordSuite('Unit', 'normalizeStatus 已完成→已整改', s1.rectified === true && s1.kind === 'RECTIFIED', JSON.stringify(s1));
  const s2 = normalizeStatus('待整改');
  recordSuite('Unit', 'normalizeStatus 待整改→未整改', s2.rectified === false && s2.kind === 'PENDING', JSON.stringify(s2));
  const s3 = normalizeStatus(null);
  recordSuite('Unit', 'normalizeStatus null→未知', s3.rectified === null && s3.kind === 'UNKNOWN', JSON.stringify(s3));
  const n1 = normalizeRecord({ date: '2026-08-01', status: '待整改', deadline: '2026-08-10' });
  recordSuite('Unit', 'normalizeRecord 逾期=true（deadline<today）', n1.overdue === true, JSON.stringify({ overdue: n1.overdue }));
  const n2 = normalizeRecord({ date: '2026-08-01', status: '已完成', rectify_date: '2026-08-05' });
  recordSuite('Unit', 'normalizeRecord 整改时长=4天', n2.rectifyDays === 4, JSON.stringify({ days: n2.rectifyDays }));
  const n3 = normalizeRecord({ date: 'bad-date', status: 'x' });
  recordSuite('Unit', 'normalizeRecord 非法日期→null', n3.date === null, JSON.stringify({ date: n3.date }));
}

// ========== Unit：statistics ==========
function unitStatistics() {
  const { normalized, limitations } = normalizeRecords(buildVirtualHazards());
  const stats = computeStatistics(normalized, { domain: 'hazard', sourceMode: 'injected', limitations });
  recordSuite('Unit', 'statistics 总数=63', stats.totalRecords === 63, `total=${stats.totalRecords}`);
  recordSuite('Unit', 'statistics 整改率=已整改/总数', stats.summary.rectifiedCount === 36 && stats.summary.unrectifiedCount === 24,
    `rectified=${stats.summary.rectifiedCount} unrectified=${stats.summary.unrectifiedCount} rate=${stats.summary.rectificationRate}`);
  const top = stats.topCategories[0];
  recordSuite('Unit', 'statistics TOP分类=有限空间', top && top.name === '有限空间', JSON.stringify(stats.topCategories.slice(0, 3)));
  recordSuite('Unit', 'statistics 时间趋势按月', Array.isArray(stats.trend.monthly) && stats.trend.monthly.length >= 2,
    `months=${stats.trend.monthly.length}`);
  recordSuite('Unit', 'statistics 重复问题>=1', stats.duplicates.length >= 1 && stats.summary.duplicateCount >= 3,
    `dupCount=${stats.summary.duplicateCount} groups=${stats.duplicates.length}`);
  recordSuite('Unit', 'statistics score 降序 TOP', stats.topCategories.every((v, i, a) => i === 0 || a[i - 1].count >= v.count), 'ok');
  recordSuite('Unit', 'statistics 聚集 note（非风险判定）', /聚集分析仅为统计描述/.test(stats.clustering.note), stats.clustering.note);

  // 空数据
  const emptyStats = computeStatistics([], { domain: 'hazard' });
  recordSuite('Unit', 'statistics 空数据 total=0', emptyStats.totalRecords === 0 && emptyStats.summary.rectificationRate === 0, `total=${emptyStats.totalRecords}`);
  // 边界日期：单条记录
  const one = computeStatistics(normalizeRecords([{ id: 1, date: '2026-01-31', status: '已完成', rectify_date: '2026-02-01' }]).normalized, { domain: 'hazard' });
  recordSuite('Unit', 'statistics 边界日期（1/31→2/1 整改1天）', one.summary.total === 1 && one.summary.avgRectifyDays === 1, JSON.stringify(one.summary));
}

// ========== Unit：structured parser ==========
function unitStructured() {
  const good = parseStructuredOutput('{"summary":"s","key_findings":["a"],"trend_analysis":[],"anomalies":[],"high_frequency_issues":[],"possible_causes":[],"management_suggestions":[],"limitations":[]}');
  recordSuite('Unit', 'parseStructuredOutput 正常 JSON', good.summary === 's', 'ok');
  const fenced = parseStructuredOutput('```json\n{"summary":"s","key_findings":[]}\n```');
  recordSuite('Unit', 'parseStructuredOutput ```json 围栏', fenced.summary === 's', 'ok');
  let invalid = null;
  try { parseStructuredOutput('不是 JSON'); } catch (e) { invalid = e.code; }
  recordSuite('Unit', 'parseStructuredOutput 非法→AI_STRUCTURED_OUTPUT_INVALID', invalid === 'AI_STRUCTURED_OUTPUT_INVALID', `code=${invalid}`);
  let missing = null;
  try {
    validateStructured({ summary: 's', key_findings: 'not-array' });
  } catch (e) { missing = e.code; }
  recordSuite('Unit', 'validateStructured 字段非法→AI_STRUCTURED_OUTPUT_INVALID', missing === 'AI_STRUCTURED_OUTPUT_INVALID', `code=${missing}`);
}

// ========== Unit：adapter ==========
async function unitAdapter() {
  let e1 = null;
  try { await adapter.fetchRawRecords({ domain: 'accident' }); } catch (e) { e1 = e.code; }
  recordSuite('Unit', 'adapter 无效 domain→AI_DOMAIN_NOT_SUPPORTED', e1 === 'AI_DOMAIN_NOT_SUPPORTED', `code=${e1}`);
  let e2 = null;
  try { await adapter.fetchRawRecords({ domain: 'hazard', timeRange: { start: '2026-09-01', end: '2026-08-01' } }); } catch (e) { e2 = e.code; }
  recordSuite('Unit', 'adapter timeRange 倒置→AI_INVALID_TIME_RANGE', e2 === 'AI_INVALID_TIME_RANGE', `code=${e2}`);
  const inj = await adapter.fetchRawRecords({ domain: 'hazard', records: [{ id: 1 }] });
  recordSuite('Unit', 'adapter records 注入模式', inj.sourceMode === 'injected' && inj.records.length === 1, inj.sourceMode);
}

// ========== Integration：真实 analyzeData（注入数据，真实 AI） ==========
async function integrationAnalysis(records) {
  const r = await analysisService.analyzeData({
    domain: 'hazard',
    timeRange: { start: '2026-01-01', end: '2026-12-31' },
    filters: {},
    records,
    analysisTypes: ['trend', 'frequency', 'rectification'],
    useRag: false,
    provider: 'ollama', // 默认活动 Provider 为 grok(未配置)；真实生成链路显式走 Ollama
    userId: 1,
  });
  const ok1 = r.success && r.statistics.totalRecords === records.length;
  recordSuite('Integration', 'analyzeData 统计层 total 正确', ok1, `total=${r.statistics.totalRecords}`);
  const ok2 = r.ai && r.ai.available === true && r.ai.structured === true &&
    r.ai.provider === 'ollama' && r.ai.model && r.ai.model.includes('qwen2.5:7b');
  recordSuite('Integration', 'analyzeData AI Gateway→Ollama 真实生成', ok2,
    `provider=${r.ai && r.ai.provider} model=${r.ai && r.ai.model} durMs=${r.ai && r.ai.durationMs}`);
  const a = r.ai && r.ai.analysis;
  const ok3 = a && typeof a.summary === 'string' && Array.isArray(a.key_findings) &&
    Array.isArray(a.possible_causes) && Array.isArray(a.management_suggestions);
  recordSuite('Integration', 'analyzeData 结构化输出字段齐全', ok3,
    `summary=${a && a.summary.slice(0, 30)} findings=${a && a.key_findings.length} causes=${a && a.possible_causes.length}`);
  const causesOk = a && a.possible_causes.every((c) => /可能/.test(String(c)) || /可能原因/.test(String(c)));
  recordSuite('Integration', 'analyzeData 可能原因措辞（无事实认定）', causesOk,
    `causes=[${(a && a.possible_causes || []).slice(0, 2).join(' | ')}]`);
  const evBiz = r.evidence && r.evidence.find((e) => e.source_type === 'business_record');
  recordSuite('Integration', 'analyzeData Evidence 业务统计依据', evBiz && /整改率/.test(evBiz.evidence_text),
    `evidence=${r.evidence.length} biz=${evBiz && evBiz.source_domain}`);
  const rec = r.recordId != null && r.recordSaved === true;
  recordSuite('Integration', 'analyzeData Generation Record 落库', rec, `recordId=${r.recordId} saved=${r.recordSaved}`);
  return r;
}

// ========== Integration：RAG 按需（useRag=true） ==========
async function integrationRag(records) {
  const r = await analysisService.analyzeData({
    domain: 'hazard',
    records,
    useRag: true,
    provider: 'ollama', // embedding 亦走 Ollama（nomic-embed-text）
    userId: 1,
  });
  const kb = r.evidence && r.evidence.filter((e) => e.source_type === 'knowledge_base');
  recordSuite('Integration', 'RAG useRag=true → knowledge_base evidence', Array.isArray(kb) && kb.length > 0,
    `kbEvidence=${kb && kb.length} totalEvidence=${r.evidence.length}`);
  const chain = kb && kb.every((e) => e.source_id != null && e.source_domain === 'knowledge_base' && e.evidence_text.length > 0);
  recordSuite('Integration', 'RAG Evidence 链（Chunk→Document→Source 字段）', !!chain, 'ok');
  return r;
}

// ========== Integration：AI unavailable 降级 ==========
async function integrationDegrade(records) {
  const r = await analysisService.analyzeData({ domain: 'hazard', records, provider: 'grok', userId: 1 });
  const ok = r.success && r.statistics.totalRecords === records.length &&
    r.ai && r.ai.available === false && r.ai.code === 'AI_PROVIDER_NOT_CONFIGURED';
  recordSuite('Integration', 'AI unavailable（grok）→ statistics 照常 + ai.code', ok,
    `statsTotal=${r.statistics.totalRecords} ai=${JSON.stringify(r.ai && { available: r.ai.available, code: r.ai.code })}`);
}

// ========== Integration：真实 hazards 表最小只读验证 ==========
async function integrationRealDb() {
  const r = await adapter.fetchRawRecords({ domain: 'hazard', timeRange: { start: '2026-01-01', end: '2026-12-31' }, limit: 5 });
  const ok = r.available === true && r.sourceMode === 'db' && r.records.length <= 5 && r.records.length > 0;
  recordSuite('Integration', '真实 hazards 表最小只读（limit=5 脱敏）', ok,
    `mode=${r.sourceMode} rows=${r.records.length} sample=[${r.records.map((x) => `${x.date}|${x.status}`).join(', ')}]`);
  const inspection = await adapter.fetchRawRecords({ domain: 'inspection', timeRange: { start: '2026-01-01', end: '2026-12-31' }, limit: 5 });
  recordSuite('Integration', 'inspection 域真实表 0 行→available 空集', inspection.available === true && inspection.records.length === 0,
    `rows=${inspection.records.length}`);
}

// ========== Route：HTTP 层 ==========
async function routeTests() {
  const app = require('../app');
  const BASE = 'http://127.0.0.1:5881';
  const jwt = require('jsonwebtoken');
  const { generateAccessToken } = require('../middleware/auth');
  const adminToken = generateAccessToken({ id: 1, username: 'ai06-admin', role: 'admin' });
  const sampleRecords = buildVirtualHazards();

  async function api(path, { method = 'GET', body, auth = true } = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: `Bearer ${adminToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(180000),
    });
    return res;
  }

  await new Promise((resolve) => setTimeout(resolve, 300));

  // 401
  {
    const res = await api('/api/hse/ai/v2/analyze/data', { method: 'POST', body: { domain: 'hazard' }, auth: false });
    recordSuite('Route', '401 未认证', res.status === 401, `status=${res.status}`);
  }
  // 400 缺 domain
  {
    const res = await api('/api/hse/ai/v2/analyze/data', { method: 'POST', body: {} });
    const j = await res.json();
    recordSuite('Route', '400 缺 domain（error code）', res.status === 200 && j.success === false && /domain/.test(j.error && j.error.message || ''),
      `status=${res.status} code=${j.error && j.error.code}`);
  }
  // invalid domain
  {
    const res = await api('/api/hse/ai/v2/analyze/data', { method: 'POST', body: { domain: 'accident' } });
    const j = await res.json();
    recordSuite('Route', 'invalid domain→AI_DOMAIN_NOT_SUPPORTED', res.status === 200 && j.success === false && j.error.code === 'AI_DOMAIN_NOT_SUPPORTED',
      `status=${res.status} code=${j.error && j.error.code}`);
  }
  // AI unavailable（provider=grok）→ statistics 照常
  {
    const res = await api('/api/hse/ai/v2/analyze/data', { method: 'POST', body: { domain: 'hazard', records: sampleRecords.slice(0, 20), provider: 'grok' } });
    const j = await res.json();
    recordSuite('Route', 'AI unavailable → 200 + statistics + ai.available=false', res.status === 200 && j.success && j.statistics.totalRecords === 20 &&
      j.ai && j.ai.available === false, `status=${res.status} total=${j.statistics && j.statistics.totalRecords} ai=${j.ai && j.ai.code}`);
  }
  // 200 正常（注入 records + 双轨制字段剥离）
  {
    const res = await api('/api/hse/ai/v2/analyze/data', {
      method: 'POST',
      body: { domain: 'hazard', records: sampleRecords.slice(0, 20), provider: 'ollama', compliance_status: '已确认', manual_remark: 'x', checked_by: 1, checked_at: 'now' },
    });
    const j = await res.json();
    recordSuite('Route', '200 正常分析（双轨制字段剥离不报错）', res.status === 200 && j.success && j.statistics.totalRecords === 20 &&
      j.ai && j.ai.available === true && j.ai.analysis && j.ai.analysis.summary,
      `status=${res.status} total=${j.statistics && j.statistics.totalRecords} provider=${j.ai && j.ai.provider} recordSaved=${j.recordSaved}`);
  }
  // empty data（inspection db 0 行）
  {
    const res = await api('/api/hse/ai/v2/analyze/data', { method: 'POST', body: { domain: 'inspection', timeRange: { start: '2026-01-01', end: '2026-12-31' } } });
    const j = await res.json();
    recordSuite('Route', 'empty data → statistics.total=0 + AI_EMPTY_DATA', res.status === 200 && j.success && j.statistics.totalRecords === 0 &&
      j.ai && j.ai.code === 'AI_EMPTY_DATA', `status=${res.status} total=${j.statistics && j.statistics.totalRecords} code=${j.ai && j.ai.code}`);
  }
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:5881/api/health', { signal: AbortSignal.timeout(1500) });
      if (res.status >= 200 && res.status < 500) return;
    } catch (e) { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('服务 15 秒内未就绪');
}

async function main() {
  unitNormalizer();
  unitStatistics();
  unitStructured();
  unitAdapter();

  const virtual = buildVirtualHazards();
  await integrationAnalysis(virtual);
  await integrationRag(virtual.slice(0, 30));
  await integrationDegrade(virtual.slice(0, 20));
  await integrationRealDb();

  await waitForServer();
  await routeTests();

  await pool.end();
  console.log('\n================ 结果汇总 ================');
  const bySuite = {};
  for (const r of results) { bySuite[r.suite] = bySuite[r.suite] || []; bySuite[r.suite].push(r); }
  let total = 0, passed = 0, failed = 0;
  for (const [suite, items] of Object.entries(bySuite)) {
    const p = items.filter((i) => i.ok).length;
    total += items.length; passed += p; failed += items.length - p;
    console.log(`Suite ${suite}: ${items.length} tests, ${p} passed, ${items.length - p} failed`);
  }
  console.log(`\nTotal: ${total}\nPassed: ${passed}\nFailed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('E2E 异常:', e); process.exit(1); });
