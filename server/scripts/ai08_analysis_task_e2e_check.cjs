/**
 * AI-08 Analysis Task PC Integration E2E Check
 *
 * 覆盖（任务书 §29 页面测试十项 + §30 真实数字）：
 *  - Integration：创建→PENDING→RUNNING→COMPLETED（真实 Ollama qwen2.5:7b 一次闭环）、
 *                 幂等复用（同 hash 活跃任务 reused=true）、统计结果/真实 AI 结果/Evidence/generationRecordId 可读、
 *                 AI 不可用降级（grok NOT_CONFIGURED → degraded=true、统计照常）、空数据（AI_EMPTY_DATA 合理降级）、
 *                 取消（PENDING→CANCELLED；RUNNING 仅记录 cancel_requested_at，不伪装取消）、历史列表/详情/分页/状态过滤
 *  - Route：401（无 token / 无效 token）、403（非写角色 grid_inspector 创建/取消）、读者角色可读、
 *           404（任务不存在）、非法参数（缺 domain / records 注入禁止）→ AI 错误信封
 *  - Frontend：路由注册断言、页面源码轮询/取消/降级/空态断言、vue-tsc --noEmit 类型检查（真实执行）
 *
 * 数据边界（沿 AI-07 已授权模式）：
 *  - 仅操作 AI-07 自建任务表 ai_analysis_tasks；只读查询 hazards（SELECT 最小范围）。
 *  - 测试任务 created_by=1（admin 真实用户，与页面登录用户一致）；脚本记录本次创建的任务 id，
 *    结束（含失败路径）按 id 清理，绝不触碰他人任务；hazards 等业务表零写入。
 *  - 不修改 .env、不修改生产配置、不触碰 5876。
 *
 * 环境：依赖 dev 后端 5881 正在运行（AI-07 路由 + worker）。真实 AI 仅 1 次（ollama，约 60~120s）。
 * 输出：Suite Integration/Route/Frontend + Total/Passed/Failed（报告数字与本脚本输出逐项对应）。
 */

process.env.NODE_ENV = 'test';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { generateAccessToken } = require('../middleware/auth');

const API_BASE = 'http://127.0.0.1:5881/api/hse/ai/v2';
const ADMIN_TOKEN = generateAccessToken({ id: 1, username: 'admin', role: 'admin' }); // users 表真实 admin
const READER_TOKEN = generateAccessToken({ id: 75, username: 'h2660', role: 'grid_inspector' }); // 真实非写角色

const suites = { Integration: [], Route: [], Frontend: [] };

function record(suite, name, ok, detail) {
  suites[suite].push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${suite}] ${name}  ${detail != null ? JSON.stringify(detail) : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, { token = ADMIN_TOKEN, body = null } = {}) {
  const res = await fetch(`${API_BASE}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  return { status: res.status, body: json };
}

/** 轮询任务直到终态（镜像页面 2.5s 轮询） */
async function pollUntilTerminal(id, { timeoutMs = 200000, log = false } = {}) {
  const started = Date.now();
  const seen = [];
  let task = null;
  while (Date.now() - started < timeoutMs) {
    const r = await api('GET', `/analysis-tasks/${id}`);
    if (r.status === 200 && r.body && r.body.success) {
      task = r.body.task;
      if (!seen.includes(task.status)) {
        seen.push(task.status);
        if (log) console.log(`    [poll] task ${id} → ${task.status}`);
      }
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status)) return task;
    }
    await sleep(2500);
  }
  return task;
}

/** 记录本次创建的任务 id，结束统一按 id 清理 */
const createdTaskIds = [];
function track(task) {
  if (task && task.id != null && !createdTaskIds.includes(task.id)) createdTaskIds.push(task.id);
  return task;
}

async function cleanTestTasks() {
  if (!createdTaskIds.length) return;
  const ids = [...new Set(createdTaskIds)];
  await pool.query(`DELETE FROM ai_analysis_tasks WHERE id = ANY($1::bigint[])`, [ids]);
}

const PAGE = path.resolve(__dirname, '../../安全看板vben/apps/web-naive');
const PAGE_SRC = path.join(PAGE, 'src/views/hse/ai-analysis/index.vue');
const ROUTER_SRC = path.join(PAGE, 'src/router/routes/modules/hse.ts');
const API_SRC = path.join(PAGE, 'src/api/hse/ai.ts');

function readOrNull(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

async function integrationSuite() {
  // 前提：确认 A 范围确有真实 hazard 数据（只读）
  const rangeA = { start: '2026-06-01', end: '2026-07-31' };
  const dataCheck = await pool.query(
    `SELECT COUNT(*) c FROM hazards WHERE hazard_date BETWEEN $1 AND $2`,
    [rangeA.start, rangeA.end]
  );
  record('Integration', '前提：分析范围存在真实 hazard 数据（只读 SELECT）',
    parseInt(dataCheck.rows[0].c, 10) > 0,
    { range: rangeA, count: parseInt(dataCheck.rows[0].c, 10) });

  // 1) 创建任务 → PENDING（同步返回，不等待 AI）
  const baseA = {
    taskType: 'DATA_ANALYSIS',
    domain: 'hazard',
    timeRange: rangeA,
    filters: {},
    analysisTypes: ['trend', 'frequency', 'rectification'],
    useRag: false,
    provider: 'ollama',
  };
  const c1 = await api('POST', '/analysis-tasks', { body: baseA });
  const t1 = track(c1.body && c1.body.success ? c1.body.task : null);
  record('Integration', '创建任务立即返回 PENDING（页面主流程）',
    c1.status === 200 && c1.body && c1.body.success === true && t1 && t1.status === 'PENDING' && t1.id > 0,
    { id: t1 && t1.id, status: t1 && t1.status, reused: c1.body && c1.body.reused });

  // 2) 幂等复用：相同请求在活跃期复用（reused=true，同一任务 id）
  const c2 = await api('POST', '/analysis-tasks', { body: baseA });
  record('Integration', '幂等复用（PENDING/RUNNING 同 hash → reused=true）',
    c2.status === 200 && c2.body && c2.body.success === true && c2.body.reused === true &&
    c2.body.task && c2.body.task.id === t1.id,
    { id: c2.body && c2.body.task && c2.body.task.id, reused: c2.body && c2.body.reused });

  // 3) 轮询 → RUNNING（worker 领取）
  let t1Running = null;
  for (let i = 0; i < 12; i++) {
    const r = await api('GET', `/analysis-tasks/${t1.id}`);
    if (r.body && r.body.success && r.body.task.status === 'RUNNING') { t1Running = r.body.task; break; }
    await sleep(2500);
  }
  record('Integration', '轮询到达 RUNNING（worker 领取）', t1Running != null,
    { id: t1.id, status: t1Running && t1Running.status });

  // 4) 创建 B（不同时间范围，worker 忙时排队 PENDING）→ 取消 PENDING
  const tB = track((await api('POST', '/analysis-tasks', { body: {
    domain: 'hazard', timeRange: { start: '2026-04-01', end: '2026-04-30' },
    analysisTypes: ['trend'], useRag: false, provider: 'ollama',
  } })).body.task);
  record('Integration', '并发任务 B 创建为 PENDING（排队）', tB && tB.status === 'PENDING', { id: tB && tB.id, status: tB && tB.status });

  const cb = await api('POST', `/analysis-tasks/${tB.id}/cancel`, { body: {} });
  record('Integration', '取消 PENDING → CANCELLED（真取消）',
    cb.status === 200 && cb.body && cb.body.success === true && cb.body.cancelled === true &&
    cb.body.task && cb.body.task.status === 'CANCELLED',
    { id: tB.id, status: cb.body && cb.body.task && cb.body.task.status, note: cb.body && cb.body.note });

  // 5) 取消 RUNNING（任务 A）→ 仅记录 cancel_requested_at，不伪装取消
  const ca = await api('POST', `/analysis-tasks/${t1.id}/cancel`, { body: {} });
  record('Integration', '取消 RUNNING → 仅记录取消请求（不伪装已取消）',
    ca.status === 200 && ca.body && ca.body.success === true && ca.body.cancelled === false &&
    ca.body.cancelRequested === true && ca.body.task && ca.body.task.status === 'RUNNING' &&
    !!ca.body.task.cancelRequestedAt,
    { id: t1.id, status: ca.body && ca.body.task && ca.body.task.status, cancelRequestedAt: ca.body && ca.body.task && ca.body.task.cancelRequestedAt });

  // 6) 轮询 → COMPLETED（真实 Ollama AI；RUNNING 取消请求保留）
  const t1Done = await pollUntilTerminal(t1.id, { timeoutMs: 200000, log: true });
  record('Integration', '轮询到达 COMPLETED（真实 AI 分析闭环）',
    t1Done && t1Done.status === 'COMPLETED',
    { id: t1.id, status: t1Done && t1Done.status, degraded: t1Done && t1Done.degraded });

  // 7) 统计结果（确定性层）真实可读
  const stats = t1Done && t1Done.statisticsSnapshot;
  record('Integration', '统计结果完整（summary/trend/top/duplicates/unrectified）',
    stats && typeof stats.summary === 'object' && stats.summary.total > 0 &&
    stats.summary.rectifiedCount != null &&
    Array.isArray(stats.trend.daily) && Array.isArray(stats.topCategories) &&
    Array.isArray(stats.duplicates) && Array.isArray(stats.unrectifiedList) && Array.isArray(stats.limitations),
    { total: stats && stats.summary && stats.summary.total, rate: stats && stats.summary && stats.summary.rectificationRate,
      trendGranularity: stats && stats.trend && stats.trend.granularity });

  // 8) 真实 AI 结果可读（aiResult.analysis 各段 + provider/model + generationRecordId）
  const ai = t1Done && t1Done.aiResult;
  const aiKeysOk = ai && ai.available === true && ai.structured === true && ai.analysis &&
    ['summary', 'key_findings', 'trend_analysis', 'anomalies', 'high_frequency_issues', 'possible_causes', 'management_suggestions', 'limitations']
      .every((k) => ai.analysis[k] != null);
  record('Integration', '真实 AI 结果完整（analysis 八段齐全）', !!aiKeysOk,
    { provider: ai && ai.provider, model: ai && ai.model, available: ai && ai.available });

  // 9) Evidence（business_record 数据依据）真实可读
  const evidence = t1Done && t1Done.evidence;
  const bizEv = Array.isArray(evidence) ? evidence.filter((e) => e.source_type === 'business_record') : [];
  record('Integration', 'Evidence 展示（business_record 数据依据）',
    Array.isArray(evidence) && evidence.length > 0 && bizEv.length > 0 &&
    bizEv[0].evidence_text && bizEv[0].evidence_strength,
    { total: evidence && evidence.length, business: bizEv.length });

  // 10) generationRecordId（AI-06 落库记录）可读
  record('Integration', 'generationRecordId 可读（AI 生成记录已落库）',
    t1Done && t1Done.generationRecordId != null && t1Done.generationRecordId > 0,
    { generationRecordId: t1Done && t1Done.generationRecordId });

  // 11) RUNNING 取消请求在 COMPLETED 后保留（不伪装取消，结果照常落库）
  record('Integration', 'RUNNING 取消请求保留且结果完成（cancelRequestedAt 不丢）',
    t1Done && t1Done.status === 'COMPLETED' && !!t1Done.cancelRequestedAt && aiKeysOk,
    { cancelRequestedAt: t1Done && t1Done.cancelRequestedAt });

  // 12) AI 不可用降级（grok NOT_CONFIGURED）→ COMPLETED + degraded=true + 统计照常
  const tC = track((await api('POST', '/analysis-tasks', { body: {
    domain: 'hazard', timeRange: { start: '2026-01-01', end: '2026-01-31' },
    analysisTypes: ['frequency'], useRag: false, provider: 'grok',
  } })).body.task);
  const tCDone = await pollUntilTerminal(tC.id, { timeoutMs: 120000 });
  record('Integration', 'AI 不可用降级（grok）→ degraded=true、统计照常、AI 明确不可用',
    tCDone && tCDone.status === 'COMPLETED' && tCDone.degraded === true &&
    tCDone.statisticsSnapshot && typeof tCDone.statisticsSnapshot.summary === 'object' &&
    tCDone.aiResult && tCDone.aiResult.available === false && !!tCDone.aiResult.code &&
    /降级/.test(tCDone.errorMessage || ''),
    { status: tCDone && tCDone.status, degraded: tCDone && tCDone.degraded, aiCode: tCDone && tCDone.aiResult && tCDone.aiResult.code,
      statsTotal: tCDone && tCDone.statisticsSnapshot && tCDone.statisticsSnapshot.totalRecords });

  // 13) 空数据 → 统计为空 + AI 合理降级（AI_EMPTY_DATA），无 NaN/undefined/Infinity
  const tD = track((await api('POST', '/analysis-tasks', { body: {
    domain: 'hazard', timeRange: { start: '2000-01-01', end: '2000-12-31' },
    analysisTypes: ['trend'], useRag: false, provider: 'ollama',
  } })).body.task);
  const tDDone = await pollUntilTerminal(tD.id, { timeoutMs: 120000 });
  const statsD = tDDone && tDDone.statisticsSnapshot;
  const badValue = (o) => {
    if (o == null) return false;
    if (typeof o === 'number') return !Number.isFinite(o);
    if (typeof o === 'object') return Object.keys(o).some((k) => badValue(o[k]));
    return false;
  };
  record('Integration', '空数据 → 统计为空 + AI 合理降级，无 NaN/undefined/Infinity',
    tDDone && tDDone.status === 'COMPLETED' && tDDone.degraded === true &&
    statsD && statsD.totalRecords === 0 &&
    tDDone.aiResult && tDDone.aiResult.code === 'AI_EMPTY_DATA' && !badValue(statsD) && !badValue(tDDone.aiResult),
    { status: tDDone && tDDone.status, aiCode: tDDone && tDDone.aiResult && tDDone.aiResult.code, totalRecords: statsD && statsD.totalRecords });

  // 14) 历史任务：列表 → 查看 → 详情（数据正确）
  const lst = await api('GET', `/analysis-tasks?page=1&pageSize=10`, {});
  const listOk = lst.status === 200 && lst.body && lst.body.success === true &&
    Array.isArray(lst.body.list) && lst.body.list.some((t) => t.id === t1.id) &&
    lst.body.total > 0;
  record('Integration', '历史任务列表（分页 + 当前用户）可读', listOk,
    { total: lst.body && lst.body.total, page: lst.body && lst.body.page, pageSize: lst.body && lst.body.pageSize });

  const lstDone = await api('GET', `/analysis-tasks?status=COMPLETED&page=1&pageSize=20`, {});
  record('Integration', '状态过滤（COMPLETED）正确',
    lstDone.status === 200 && lstDone.body && lstDone.body.success === true &&
    lstDone.body.list.every((t) => t.status === 'COMPLETED') &&
    lstDone.body.list.some((t) => t.id === t1.id),
    { total: lstDone.body && lstDone.body.total });

  const det = await api('GET', `/analysis-tasks/${t1.id}`, {});
  record('Integration', '任务详情（与列表一致）可读',
    det.status === 200 && det.body && det.body.success === true && det.body.task &&
    det.body.task.id === t1.id && det.body.task.status === 'COMPLETED' &&
    JSON.stringify(det.body.task.statisticsSnapshot) === JSON.stringify(stats),
    { id: det.body && det.body.task && det.body.task.id, status: det.body && det.body.task && det.body.task.status });

  // 15) 非法参数（缺 domain）→ AI 错误信封（success:false），不 500
  const bad = await api('POST', '/analysis-tasks', { body: { domain: '', analysisTypes: ['trend'] } });
  record('Integration', '非法参数（缺 domain）→ 错误信封 + AI_INVALID_REQUEST',
    bad.status === 200 && bad.body && bad.body.success === false && bad.body.error && bad.body.error.code === 'AI_INVALID_REQUEST',
    { code: bad.body && bad.body.error && bad.body.error.code });

  // 16) records 注入禁止（任务表数据边界）
  const inj = await api('POST', '/analysis-tasks', { body: {
    domain: 'hazard', timeRange: { start: '2026-01-01', end: '2026-01-31' },
    records: [{ id: 1, date: '2026-01-01', status: '已整改', category: 'x' }],
  } });
  record('Integration', 'records 注入禁止（任务表不存业务记录）',
    inj.status === 200 && inj.body && inj.body.success === false && inj.body.error && inj.body.error.code === 'AI_INVALID_REQUEST',
    { code: inj.body && inj.body.error && inj.body.error.code, message: inj.body && inj.body.error && inj.body.error.message });
}

async function routeSuite() {
  // 1) 401 无 token
  const r1 = await api('GET', '/analysis-tasks', { token: null });
  record('Route', '401：未提供认证令牌', r1.status === 401, { http: r1.status });

  // 2) 401 无效 token
  const r2 = await api('GET', '/analysis-tasks', { token: 'Bearer invalid.token.garbage' });
  record('Route', '401：无效令牌', r2.status === 401, { http: r2.status });

  // 3) 403 非写角色（grid_inspector）创建
  const r3 = await api('POST', '/analysis-tasks', {
    token: READER_TOKEN,
    body: { domain: 'hazard', timeRange: { start: '2026-01-01', end: '2026-01-31' }, analysisTypes: ['trend'] },
  });
  record('Route', '403：非写角色创建被拒', r3.status === 403, { http: r3.status });

  // 4) 403 非写角色取消
  const anyId = createdTaskIds.length ? createdTaskIds[0] : 1;
  const r4 = await api('POST', `/analysis-tasks/${anyId}/cancel`, { token: READER_TOKEN, body: {} });
  record('Route', '403：非写角色取消被拒', r4.status === 403, { http: r4.status, id: anyId });

  // 5) 读角色可读（任意登录用户可读）
  const r5 = await api('GET', '/analysis-tasks?page=1&pageSize=5', { token: READER_TOKEN });
  record('Route', '200：读者角色可访问列表（认证用户读权限）',
    r5.status === 200 && r5.body && r5.body.success === true && Array.isArray(r5.body.list),
    { http: r5.status });

  // 6) 404 任务不存在
  const r6 = await api('GET', '/analysis-tasks/999999999', {});
  record('Route', '404 语义：任务不存在 → AI_TASK_NOT_FOUND',
    r6.status === 200 && r6.body && r6.body.success === false && r6.body.error && r6.body.error.code === 'AI_TASK_NOT_FOUND',
    { code: r6.body && r6.body.error && r6.body.error.code });
}

async function frontendSuite() {
  const pageSrc = readOrNull(PAGE_SRC);
  const routerSrc = readOrNull(ROUTER_SRC);
  const apiSrc = readOrNull(API_SRC);

  // 1) 路由注册：/overview/ai-analysis → views/hse/ai-analysis/index.vue（未新增一级菜单）
  const routeOk = routerSrc && /path:\s*'\/overview\/ai-analysis'/.test(routerSrc) &&
    /import\('#\/views\/hse\/ai-analysis\/index\.vue'\)/.test(routerSrc) &&
    /name:\s*'HseAiAnalysis'/.test(routerSrc);
  record('Frontend', '路由注册：/overview/ai-analysis 指向真实页面（复用占位路由）', !!routeOk);

  // 2) 页面使用 AI-07 analysis-tasks API（非同步 analyze 主流程）
  const apiUseOk = pageSrc && /createAnalysisTask\(/.test(pageSrc) && /listAnalysisTasks\(/.test(pageSrc) &&
    /getAnalysisTask\(/.test(pageSrc) && /cancelAnalysisTask\(/.test(pageSrc);
  record('Frontend', '页面调用 analysis-tasks 四接口（AI-07 异步主流程）', !!apiUseOk);

  // 3) 轮询：单 timer 守卫 + 终态停止 + 离开清理
  const pollOk = pageSrc && /if \(pollTimer\) return;/.test(pageSrc) &&
    /syncPolling\(\)/.test(pageSrc) && /anyActiveTask\(\)/.test(pageSrc) &&
    /onUnmounted\(\(\) => \{\s*stopPolling\(\);\s*\}\)/.test(pageSrc);
  record('Frontend', '轮询机制：单 timer 守卫 / 终态停止 / onUnmounted 清理', !!pollOk);

  // 4) RUNNING 取消不伪装（cancelRequested 分支提示）
  const cancelOk = pageSrc && /cancelRequested/.test(pageSrc) &&
    /已提交取消请求/.test(pageSrc) && /TERMINAL_STATUS\.includes\(row\.status\)/.test(pageSrc);
  record('Frontend', '取消行为：RUNNING 仅提示已提交取消请求（不显示已取消）', !!cancelOk);

  // 5) AI 降级提示 + 统计前置（比较「统计结果」与「AI 分析」两个区域标题位置；
  //    页面顶部另有「AI 分析结果仅作为…」辅助定位文案，不能作为顺序判定依据）
  const statTitlePos = pageSrc ? pageSrc.indexOf('title="统计结果"') : -1;
  const aiTitlePos = pageSrc ? pageSrc.indexOf('title="AI 分析"') : -1;
  const degradeOk = pageSrc && /当前 AI 分析服务暂不可用/.test(pageSrc) &&
    statTitlePos !== -1 && aiTitlePos !== -1 && statTitlePos < aiTitlePos;
  record('Frontend', '降级提示存在且统计（确定性）在 AI 之前展示', !!degradeOk, {
    statTitlePos,
    aiTitlePos,
  });

  // 6) Evidence 按 source_type 分类展示（business_record / knowledge_base）
  const evOk = pageSrc && /source_type\s*===\s*'business_record'/.test(pageSrc) &&
    /source_type\s*===\s*'knowledge_base'/.test(pageSrc) &&
    /evidence_text/.test(pageSrc);
  record('Frontend', 'Evidence：数据依据/知识依据按 source_type 分类展示', !!evOk);

  // 7) 空数据兜底（0 条不触发 AI + 无 NaN 渲染）
  const emptyOk = pageSrc && /stats\?\.totalRecords === 0/.test(pageSrc) && /NEmpty/.test(pageSrc);
  record('Frontend', '空数据：统计空态 + AI 不执行提示', !!emptyOk);

  // 8) API 层类型与信封解包（vue-tsc 将单独验证编译）
  const apiOk = apiSrc && /unwrapAiEnvelope/.test(apiSrc) && /responseReturn:\s*'body'/.test(apiSrc);
  record('Frontend', 'API 层：AI v2 信封解包（success=false 抛错误码）', !!apiOk);

  // 9) vue-tsc --noEmit 真实类型检查（web-naive 全量；AI-08 变更文件 0 错误。
  //    项目存在既有类型错误（assessment-* 等其他模块，非 AI-08 引入），单独记数并在报告中列为治理遗留）
  const vueTsc = await new Promise((resolve) => {
    const cmd = path.join(PAGE, '../../node_modules/.bin/vue-tsc.cmd');
    const child = spawn(cmd, ['--noEmit', '-p', path.join(PAGE, 'tsconfig.json')], {
      cwd: PAGE,
      shell: true,
      windowsHide: true,
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { child.kill(); resolve({ ok: false, detail: 'vue-tsc 超时（>600s）' }); }, 600000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const errLines = (out.match(/error TS\d+/g) || []);
      const totalErr = errLines.length;
      const ai08Err =
        (out.match(/src[\\/]views[\\/]hse[\\/]ai-analysis[\\/]index\.vue\(\d+,\d+\): error TS/g) || []).length +
        (out.match(/src[\\/]api[\\/]hse[\\/]ai\.ts\(\d+,\d+\): error TS/g) || []).length;
      resolve({
        ok: ai08Err === 0,
        detail: `exit=${code}, totalErrors=${totalErr}, ai08Errors=${ai08Err}`,
      });
    });
  });
  record('Frontend', 'vue-tsc --noEmit：AI-08 变更文件 0 错误（既有错误记治理遗留）', vueTsc.ok, vueTsc.detail);
}

(async () => {
  console.log('[AI08] 开始：analysis-tasks PC 接入 E2E（5881 dev 后端）');
  try {
    await integrationSuite();
    await routeSuite();
    await frontendSuite();
  } catch (e) {
    console.log(`[AI08] 异常: ${e && e.stack || e}`);
  } finally {
    await cleanTestTasks();
    console.log(`[AI08] 已按 id 清理本次测试任务: ${createdTaskIds.join(', ') || '(无)'}`);
  }

  const names = ['Integration', 'Route', 'Frontend'];
  let total = 0, passed = 0;
  for (const s of names) {
    const list = suites[s];
    const ok = list.filter((x) => x.ok).length;
    total += list.length; passed += ok;
    console.log(`\n${s}: ${ok}/${list.length}`);
  }
  console.log(`Total: ${passed}/${total}`);
  console.log(`Result: ${passed === total ? 'ALL PASS' : 'HAS FAILURE'}`);
  await pool.end();
  process.exit(passed === total ? 0 : 1);
})();
