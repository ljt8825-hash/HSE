/**
 * AI-07 Analysis Task E2E Check
 *
 * 覆盖（任务书 §28~§33）：
 *  - Unit：任务状态机（合法/非法转换）、request_hash 幂等键、参数校验、序列化、错误映射
 *  - Integration：创建→PENDING→worker 领取→RUNNING→AI-06→COMPLETED（真实 Ollama qwen2.5:7b 一次闭环）、
 *                 AI 不可用降级（grok，统计先完成语义）、并发锁（同时 RUNNING≤1）、幂等复用、
 *                 取消（PENDING→CANCELLED；RUNNING 仅记录取消请求）、无效 domain FAILED、
 *                 真实 hazards 表最小读取（db 模式，不注入 records）、列表/详情查询
 *  - Route：HTTP 全链路（依赖 5881 dev 服务器在跑，否则跳过并报错）
 *
 * 数据边界：测试任务 created_by=7777777（AI-07 测试专用标记）；任务表为 AI-07 自建新表，
 *           测试前后仅清理该标记数据；真实业务表零写入（hazards 等仅 SELECT 最小读取）。
 * 并发：真实 AI 仅 1 次（ollama，~74s）；其余秒级。
 *
 * 环境：进程级 AI_PROVIDER=ollama + AI_TIMEOUT_MS=300000（不改 .env）
 * 输出：Suite Unit/Integration/Route + Total/Passed/Failed（报告数字与本脚本输出逐项对应）
 */

process.env.PORT = '5881';
process.env.AI_PROVIDER = 'ollama';
process.env.AI_TIMEOUT_MS = '300000';

const { pool } = require('../config/db');
const taskService = require('../services/ai/tasks/aiAnalysisTaskService');
const worker = require('../services/ai/tasks/aiAnalysisWorker');
const { AiError } = require('../services/ai/errors');
const { generateAccessToken } = require('../middleware/auth');

const TEST_CREATED_BY = 7777777; // AI-07 测试专用标记（清理/识别，service 层）
const API_BASE = 'http://127.0.0.1:5881/api/hse/ai/v2';
const TEST_TOKEN = generateAccessToken({ id: 1, username: 'ai07-test', role: 'admin' }); // id=1 为 users 表真实用户（authMiddleware 校验存在性）

const suites = { Unit: [], Integration: [], Route: [] };
const suiteNames = ['Unit', 'Integration', 'Route'];

function record(suite, name, ok, detail) {
  suites[suite].push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${suite}] ${name}  ${detail != null ? JSON.stringify(detail) : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 清理测试标记残留 + 额外 id（仅 AI-07 自建任务表；Route 层任务 created_by=1 由额外 id 清理） */
async function cleanTestTasks(extraIds = []) {
  await pool.query('DELETE FROM ai_analysis_tasks WHERE created_by = $1', [TEST_CREATED_BY]);
  if (extraIds.length) {
    await pool.query(`DELETE FROM ai_analysis_tasks WHERE id = ANY($1::bigint[])`, [extraIds]);
  }
}

const REQ_BASE = {
  taskType: 'DATA_ANALYSIS',
  domain: 'hazard',
  timeRange: { start: '2026-02-01', end: '2026-07-31' },
  filters: {},
  analysisTypes: ['trend', 'frequency', 'rectification'],
  useRag: false,
  provider: 'ollama',
};

async function unitSuite() {
  const { canTransition, assertTransition, buildRequestHash, validateCreateRequest, toApiTask, TASK_ERROR } = taskService;

  // 状态机
  record('Unit', '状态机 PENDING→RUNNING 合法', canTransition('PENDING', 'RUNNING'));
  record('Unit', '状态机 RUNNING→COMPLETED 合法', canTransition('RUNNING', 'COMPLETED'));
  let t1 = null;
  try { assertTransition('COMPLETED', 'RUNNING'); } catch (e) { t1 = e; }
  record('Unit', '状态机 COMPLETED→RUNNING 非法', t1 && t1.code === TASK_ERROR.AI_TASK_INVALID_STATE, t1 && t1.code);
  let t2 = null;
  try { assertTransition('FAILED', 'COMPLETED'); } catch (e) { t2 = e; }
  record('Unit', '状态机 FAILED→COMPLETED 非法', t2 && t2.code === TASK_ERROR.AI_TASK_INVALID_STATE, t2 && t2.code);
  let t3 = null;
  try { assertTransition('CANCELLED', 'RUNNING'); } catch (e) { t3 = e; }
  record('Unit', '状态机 CANCELLED→RUNNING 非法', t3 && t3.code === TASK_ERROR.AI_TASK_INVALID_STATE, t3 && t3.code);
  record('Unit', '状态机 FAILED→RETRYING→RUNNING 合法',
    canTransition('FAILED', 'RETRYING') && canTransition('RETRYING', 'RUNNING'));

  // request_hash
  const h1 = buildRequestHash(REQ_BASE);
  const h2 = buildRequestHash({ ...REQ_BASE });
  record('Unit', 'request_hash 相同请求稳定', h1 === h2 && h1.length === 64, h1);
  const h3 = buildRequestHash({ ...REQ_BASE, domain: 'inspection' });
  record('Unit', 'request_hash 不同 domain 不同', h1 !== h3);
  const h4 = buildRequestHash({ ...REQ_BASE, analysisTypes: ['frequency', 'trend', 'rectification'] });
  record('Unit', 'request_hash analysisTypes 顺序无关', h1 === h4);

  // 参数校验
  let c1 = null;
  try { validateCreateRequest({ ...REQ_BASE, domain: '' }); } catch (e) { c1 = e; }
  record('Unit', '参数校验 缺 domain → AI_INVALID_REQUEST', c1 && c1.code === 'AI_INVALID_REQUEST', c1 && c1.code);
  let c2 = null;
  try { validateCreateRequest({ ...REQ_BASE, taskType: 'VISION' }); } catch (e) { c2 = e; }
  record('Unit', '参数校验 非法 taskType → AI_INVALID_REQUEST', c2 && c2.code === 'AI_INVALID_REQUEST', c2 && c2.code);
  let c3 = null;
  try { validateCreateRequest({ ...REQ_BASE, timeRange: { start: '2026-08-31', end: '2026-08-01' } }); } catch (e) { c3 = e; }
  record('Unit', '参数校验 timeRange 倒置 → AI_INVALID_REQUEST', c3 && c3.code === 'AI_INVALID_REQUEST', c3 && c3.code);
  let c4 = null;
  try { validateCreateRequest({ ...REQ_BASE, analysisTypes: ['vision'] }); } catch (e) { c4 = e; }
  record('Unit', '参数校验 非法 analysisTypes → AI_INVALID_REQUEST', c4 && c4.code === 'AI_INVALID_REQUEST', c4 && c4.code);
  let c5 = null;
  try { validateCreateRequest({ ...REQ_BASE, records: [{ id: 1 }] }); } catch (e) { c5 = e; }
  record('Unit', '参数校验 records 注入被拒（业务数据不入任务表）', c5 && c5.code === 'AI_INVALID_REQUEST', c5 && c5.code);

  // 序列化
  const fakeRow = {
    id: 1, task_type: 'DATA_ANALYSIS', domain: 'hazard', status: 'PENDING', priority: 5,
    request_hash: h1, request_payload: { domain: 'hazard', timeRange: { start: '2026-08-01', end: '2026-08-31' }, analysisTypes: ['trend'] },
    statistics_snapshot: null, ai_result: null, evidence: null, generation_record_id: null,
    provider: 'ollama', model: null, degraded: false, error_code: null, error_message: null,
    error_retryable: false, cancel_requested_at: null, created_by: 1, created_at: new Date(),
    started_at: null, completed_at: null, updated_at: new Date(),
  };
  const api = toApiTask(fakeRow);
  record('Unit', '序列化 toApiTask 字段齐全且不含 records',
    api.id === 1 && api.status === 'PENDING' && api.requestPayload && !('records' in api.requestPayload) && api.evidence.length === 0,
    { keys: Object.keys(api).length });

  // 错误映射
  const errTimeout = new AiError('AI_TIMEOUT', 'timeout');
  record('Unit', '错误映射 AI_TIMEOUT → retryable=true', errTimeout.retryable === true, errTimeout.retryable);
  const errDomain = new AiError('AI_DOMAIN_NOT_SUPPORTED', 'bad domain');
  record('Unit', '错误映射 AI_DOMAIN_NOT_SUPPORTED → retryable=false', errDomain.retryable === false, errDomain.retryable);
}

async function integrationSuite() {
  // 1) 真实创建 → PENDING + 快照
  const { task: t1, reused: r1 } = await taskService.createTask(REQ_BASE, { createdBy: TEST_CREATED_BY });
  record('Integration', 'createTask 真实插入 → PENDING + request_hash + 快照',
    t1.status === 'PENDING' && r1 === false && t1.requestHash && t1.requestHash.length === 64 &&
    t1.requestPayload.domain === 'hazard' && t1.requestPayload.analysisTypes.length === 3 &&
    t1.requestPayload.timeRange.start === '2026-02-01' && !('records' in t1.requestPayload),
    { id: t1.id, hash: t1.requestHash.slice(0, 8) });

  // 2) worker 领取 → RUNNING + started_at
  const claimed = await worker.claimNextTask(1);
  record('Integration', 'claimNextTask 领取 → RUNNING + started_at',
    claimed && claimed.id === t1.id && claimed.status === 'RUNNING' && !!claimed.started_at,
    { id: claimed && claimed.id, status: claimed && claimed.status });

  // 3) 执行 → 真实 AI 闭环（ollama qwen2.5:7b，~74s）
  const execT1 = await worker.executeTask(claimed);
  const t1After = await taskService.getTask(t1.id);
  record('Integration', 'executeTask 真实 AI → COMPLETED + 统计快照 + AI 结构化 + Evidence + GenerationRecord',
    execT1.status === 'COMPLETED' && t1After.status === 'COMPLETED' &&
    t1After.statisticsSnapshot && t1After.statisticsSnapshot.totalRecords >= 1 &&
    t1After.aiResult && t1After.aiResult.available === true && t1After.aiResult.structured === true &&
    t1After.aiResult.model && String(t1After.aiResult.model).includes('qwen') &&
    Array.isArray(t1After.evidence) && t1After.evidence.length >= 1 &&
    t1After.generationRecordId != null,
    {
      durationMs: execT1.durationMs,
      totalRecords: t1After.statisticsSnapshot && t1After.statisticsSnapshot.totalRecords,
      model: t1After.aiResult && t1After.aiResult.model,
      evidence: t1After.evidence && t1After.evidence.length,
      generationRecordId: t1After.generationRecordId,
    });

  // 4) AI 不可用（grok 未配置）→ COMPLETED + degraded + 统计先完成
  const { task: t2 } = await taskService.createTask(
    { ...REQ_BASE, provider: 'grok', timeRange: { start: '2026-02-01', end: '2026-07-31' } },
    { createdBy: TEST_CREATED_BY }
  );
  const claimed2 = await worker.claimNextTask(1);
  const execT2 = await worker.executeTask(claimed2);
  const t2After = await taskService.getTask(t2.id);
  record('Integration', 'AI 不可用（grok）→ COMPLETED + degraded + ai.available=false + 统计快照正常',
    execT2.status === 'COMPLETED' && t2After.status === 'COMPLETED' && t2After.degraded === true &&
    t2After.aiResult && t2After.aiResult.available === false &&
    t2After.statisticsSnapshot && t2After.statisticsSnapshot.totalRecords >= 1,
    {
      degraded: t2After.degraded,
      aiCode: t2After.aiResult && t2After.aiResult.code,
      totalRecords: t2After.statisticsSnapshot && t2After.statisticsSnapshot.totalRecords,
    });

  // 5) 并发锁：同时 RUNNING ≤ 1（ta/tb/tc 必须互不相同，避免幂等复用为同一任务）
  const ta = await taskService.createTask({ ...REQ_BASE, provider: 'grok', timeRange: { start: '2026-02-01', end: '2026-02-28' } }, { createdBy: TEST_CREATED_BY });
  const tb = await taskService.createTask({ ...REQ_BASE, provider: 'grok', timeRange: { start: '2026-03-01', end: '2026-03-31' } }, { createdBy: TEST_CREATED_BY });
  const tc = await taskService.createTask({ ...REQ_BASE, provider: 'grok', timeRange: { start: '2026-04-01', end: '2026-04-30' } }, { createdBy: TEST_CREATED_BY });
  record('Integration', '并发前置：A/B/C 为独立任务', ta.task.id !== tb.task.id && tb.task.id !== tc.task.id, { A: ta.task.id, B: tb.task.id, C: tc.task.id });
  const claimA = await worker.claimNextTask(1);
  const claimBWhileARunning = await worker.claimNextTask(1); // A RUNNING → B 必须拿不到
  const bStatus = await taskService.getTask(tb.task.id);
  const cStatus = await taskService.getTask(tc.task.id);
  record('Integration', '并发锁：A=RUNNING 时 B/C 保持 PENDING（同时 RUNNING≤1）',
    claimA && claimA.id === ta.task.id && claimA.status === 'RUNNING' &&
    claimBWhileARunning === null && bStatus.status === 'PENDING' && cStatus.status === 'PENDING',
    { A: claimA && claimA.id, B: bStatus.status, C: cStatus.status });
  await worker.executeTask(claimA); // A 完成（grok 秒级）
  const claimB = await worker.claimNextTask(1);
  const claimCWhileBRunning = await worker.claimNextTask(1);
  const cStatus2 = await taskService.getTask(tc.task.id);
  record('Integration', '并发锁：A 完成后 B=RUNNING，C 仍 PENDING',
    claimB && claimB.id === tb.task.id && claimCWhileBRunning === null && cStatus2.status === 'PENDING',
    { B: claimB && claimB.id, C: cStatus2.status });
  await worker.executeTask(claimB);
  const claimC = await worker.claimNextTask(1);
  record('Integration', '并发锁：B 完成后 C=RUNNING', claimC && claimC.id === tc.task.id, claimC && claimC.id);
  await worker.executeTask(claimC);

  // 6) 幂等：连续相同请求 → 复用
  const i1 = await taskService.createTask({ ...REQ_BASE, provider: 'grok' }, { createdBy: TEST_CREATED_BY });
  const i2 = await taskService.createTask({ ...REQ_BASE, provider: 'grok' }, { createdBy: TEST_CREATED_BY });
  const i3 = await taskService.createTask({ ...REQ_BASE, provider: 'grok' }, { createdBy: TEST_CREATED_BY });
  record('Integration', '幂等：连续 3 次相同请求 → 仅 1 新建 + 2 复用（同 id）',
    i1.reused === false && i2.reused === true && i3.reused === true && i1.task.id === i2.task.id && i1.task.id === i3.task.id,
    { ids: [i1.task.id, i2.task.id, i3.task.id], reused: [i1.reused, i2.reused, i3.reused] });

  // 7) 取消：PENDING → CANCELLED，worker 不执行
  const c1 = await taskService.createTask({ ...REQ_BASE, provider: 'grok' }, { createdBy: TEST_CREATED_BY });
  const cancel1 = await taskService.cancelTask(c1.task.id);
  const claimCancel = await worker.claimNextTask(1);
  const c1After = await taskService.getTask(c1.task.id);
  record('Integration', '取消：PENDING→CANCELLED 且不被 worker 领取',
    cancel1.cancelled === true && c1After.status === 'CANCELLED' &&
    (!claimCancel || claimCancel.id !== c1.task.id),
    { status: c1After.status, claimGot: claimCancel ? claimCancel.id : null });

  // 8) RUNNING 取消：仅记录 cancel_requested_at（不假取消）
  const c2 = await taskService.createTask({ ...REQ_BASE, provider: 'grok' }, { createdBy: TEST_CREATED_BY });
  const claimC2 = await worker.claimNextTask(1);
  const cancel2 = await taskService.cancelTask(c2.task.id);
  const c2After = await taskService.getTask(c2.task.id);
  record('Integration', '取消：RUNNING 仅记录 cancel_requested_at（禁止假取消）',
    cancel2.cancelled === false && cancel2.cancelRequested === true &&
    c2After.status === 'RUNNING' && !!c2After.cancelRequestedAt,
    { status: c2After.status, cancelRequestedAt: c2After.cancelRequestedAt });
  await worker.executeTask(claimC2); // 完成并清理

  // 9) 无效 domain → FAILED + 错误码 + retryable=false
  const f1 = await taskService.createTask(
    { ...REQ_BASE, domain: 'accident', provider: 'grok' },
    { createdBy: TEST_CREATED_BY }
  );
  const claimF = await worker.claimNextTask(1);
  const execF = await worker.executeTask(claimF);
  const f1After = await taskService.getTask(f1.task.id);
  record('Integration', '无效 domain → FAILED + AI_DOMAIN_NOT_SUPPORTED + retryable=false',
    execF.status === 'FAILED' && f1After.status === 'FAILED' &&
    f1After.errorCode === 'AI_DOMAIN_NOT_SUPPORTED' && f1After.errorRetryable === false,
    { errorCode: f1After.errorCode, retryable: f1After.errorRetryable });

  // 10) 列表/详情
  const list = await taskService.listTasks({ page: 1, pageSize: 5, createdBy: TEST_CREATED_BY });
  const det = await taskService.getTask(t1.id);
  record('Integration', 'listTasks/getTask 查询正常',
    list.list.length >= 1 && list.total >= 1 && det.id === t1.id && det.status === 'COMPLETED',
    { total: list.total, listLen: list.list.length });
}

async function routeSuite() {
  const routeTaskIds = [];
  // 前置：5881 服务器健康检查
  try {
    const h = await fetch(`${API_BASE}/health`, { headers: { Authorization: 'Bearer ' + TEST_TOKEN } });
    if (!h.ok) throw new Error('health http ' + h.status);
  } catch (e) {
    console.log('SKIP  [Route] 5881 dev 服务器未就绪，Route 套件跳过（需先启动 server）');
    return routeTaskIds;
  }

  const post = async (path, body, token = TEST_TOKEN) => {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    return r.json();
  };
  const get = async (path) => {
    const r = await fetch(`${API_BASE}${path}`, { headers: { Authorization: 'Bearer ' + TEST_TOKEN } });
    return r.json();
  };

  // 1) 401 未认证
  const r1 = await fetch(`${API_BASE}/analysis-tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(REQ_BASE),
  });
  record('Route', 'POST /analysis-tasks 未认证 → 401', r1.status === 401, r1.status);

  // 2) 缺 domain
  const r2 = await post('/analysis-tasks', { taskType: 'DATA_ANALYSIS', timeRange: {} });
  record('Route', 'POST /analysis-tasks 缺 domain → AI_INVALID_REQUEST',
    r2.success === false && r2.error && r2.error.code === 'AI_INVALID_REQUEST',
    r2.error && r2.error.code);

  // 3) 合法创建 → PENDING（不等待 AI）；timeRange 独立，避免与 Integration 幂等请求复用
  const body3 = { ...REQ_BASE, provider: 'grok', timeRange: { start: '2026-05-01', end: '2026-05-31' } };
  const r3 = await post('/analysis-tasks', body3);
  record('Route', 'POST /analysis-tasks 合法 → 200 + task.status=PENDING + reused=false',
    r3.success === true && r3.task && r3.task.status === 'PENDING' && r3.reused === false,
    { id: r3.task && r3.task.id, status: r3.task && r3.task.status });

  // 4) 重复提交 → reused=true 同 id
  const r4 = await post('/analysis-tasks', body3);
  record('Route', 'POST /analysis-tasks 重复提交 → reused=true 同 id',
    r4.success === true && r4.reused === true && r4.task.id === r3.task.id,
    { id: r4.task && r4.task.id, reused: r4.reused });

  // 5) 详情
  const r5 = await get(`/analysis-tasks/${r3.task.id}`);
  record('Route', 'GET /analysis-tasks/:id → 200 + task 字段齐全',
    r5.success === true && r5.task && r5.task.id === r3.task.id && r5.task.status === 'PENDING' &&
    r5.task.requestPayload && r5.task.taskType === 'DATA_ANALYSIS',
    { status: r5.task && r5.task.status });

  // 6) 列表
  const r6 = await get('/analysis-tasks');
  record('Route', 'GET /analysis-tasks → 200 + list + total>=1',
    r6.success === true && Array.isArray(r6.list) && r6.total >= 1 && r6.list.length >= 1,
    { total: r6.total });

  // 7) records 注入被拒
  const r7 = await post('/analysis-tasks', { ...body3, records: [{ id: 1 }] });
  record('Route', 'POST records 注入 → AI_INVALID_REQUEST（业务数据不入任务表）',
    r7.success === false && r7.error && r7.error.code === 'AI_INVALID_REQUEST',
    r7.error && r7.error.code);

  // 8) 取消 PENDING
  const r8 = await post(`/analysis-tasks/${r3.task.id}/cancel`, {});
  record('Route', 'POST /analysis-tasks/:id/cancel（PENDING）→ CANCELLED',
    r8.success === true && r8.cancelled === true && r8.task.status === 'CANCELLED',
    { status: r8.task && r8.task.status });

  // 9) 取消不存在的任务
  const r9 = await post('/analysis-tasks/999999999/cancel', {});
  record('Route', 'POST cancel 不存在任务 → AI_TASK_NOT_FOUND',
    r9.success === false && r9.error && r9.error.code === 'AI_TASK_NOT_FOUND',
    r9.error && r9.error.code);
}

(async () => {
  try {
    await cleanTestTasks();
    await unitSuite();
    await integrationSuite();
    await routeSuite();
  } catch (e) {
    console.error('TOP-LEVEL ERROR:', e && e.stack || e);
  } finally {
    await cleanTestTasks();

    const total = { t: 0, p: 0, f: 0 };
    for (const name of suiteNames) {
      const s = suites[name];
      const p = s.filter((x) => x.ok).length;
      const f = s.length - p;
      total.t += s.length; total.p += p; total.f += f;
      console.log(`Suite ${name}: ${s.length} tests, ${p} passed, ${f} failed`);
    }
    console.log('');
    console.log(`Total: ${total.t}`);
    console.log(`Passed: ${total.p}`);
    console.log(`Failed: ${total.f}`);
    await pool.end();
    process.exit(total.f > 0 ? 1 : 0);
  }
})();
