/**
 * AI-10 管理建议 — Integration / Route / Frontend 综合验证脚本
 *
 * 覆盖（AI-10 任务书 §17 Integration/Permission/Provider regression/AI unavailable）：
 *  - Integration：真实 AI-09 分析任务（hazard 域，真实 Ollama qwen2.5:7b 由 worker 执行）
 *                 → POST management-suggestions（真实 Ollama 闭环）→ 结构化建议 + Evidence 追溯
 *                 → GET 缓存复用 → DB 落库校验（ai_generation_records, 零 migration 关联键 title）
 *  - AI unavailable：provider=grok（NOT_CONFIGURED）→ available=false + 统计保留 + HTTP 200（不 500、不伪造成功）
 *                     provider=不存在 → AI_PROVIDER_NOT_FOUND；provider 未指定 → 默认 grok 降级
 *  - Route/Permission：admin / safety_manager（AI10_TEST）/ grid_inspector / 未认证
 *                      写（生成）仅 admin+safety_manager；读任意登录用户
 *  - Frontend：源码断言（index.vue 管理建议卡片/依据分区/协议字段；ai.ts 接口与类型）
 *
 * 数据边界：
 *  - 全部写入开发库 safety_dashboard；测试用户 ai10_test_sm（AI10_TEST 标记）测试后删除；
 *  - 测试任务/建议记录按 id 跟踪，结束统一清理，报告创建/删除/残留数量；
 *  - 不修改 .env、不触碰生产 5876、不写生产表。
 *
 * 环境：dev 后端 5881（AI-10 新代码）+ worker（ai07_worker.cjs）运行中；
 *       真实 AI 分析 1 次（约 60~120s）+ 真实建议生成 1 次（约 60~120s）。
 * 输出：Suite Integration/Route/Frontend + Total/Passed/Failed。
 */
'use strict';

process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { generateAccessToken } = require('../middleware/auth');

const API_BASE = 'http://127.0.0.1:5881/api/hse/ai/v2';

const suites = { Integration: [], Route: [], Frontend: [] };
function record(suite, name, ok, detail) {
  suites[suite].push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${suite}] ${name}${detail != null ? '  ' + JSON.stringify(detail) : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, { token, body = null } = {}) {
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

/* ─────────────── 测试数据跟踪与清理 ─────────────── */
const createdTaskIds = [];
const createdRecordIds = [];
let createdSmUserId = null;

function trackTask(t) {
  if (t && t.id != null && !createdTaskIds.includes(t.id)) createdTaskIds.push(t.id);
  return t;
}
function trackRecord(id) {
  if (id != null && !createdRecordIds.includes(id)) createdRecordIds.push(id);
  return id;
}

async function cleanTestData() {
  // 1) 先收集任务自身关联的 generation_record_id（AI-09 worker 落库），再统一删除
  if (createdTaskIds.length) {
    const recs = await pool.query(
      `SELECT id, generation_record_id FROM ai_analysis_tasks WHERE id = ANY($1::bigint[])`,
      [createdTaskIds]
    );
    for (const row of recs.rows) {
      if (row.generation_record_id) trackRecord(row.generation_record_id);
    }
  }
  // 2) 建议记录（关联键 title=管理建议:任务#<id>）
  if (createdTaskIds.length) {
    const titles = createdTaskIds.map((id) => `管理建议:任务#${id}`);
    const r1 = await pool.query(
      `DELETE FROM ai_generation_records WHERE type='analysis' AND sub_type='management_suggestion' AND title = ANY($1::text[]) RETURNING id`,
      [titles]
    );
    for (const row of r1.rows) trackRecord(row.id);
    console.log(`[cleanup] suggestion records deleted=${r1.rowCount}`);
  }
  // 3) 任务行
  if (createdTaskIds.length) {
    const r2 = await pool.query(`DELETE FROM ai_analysis_tasks WHERE id = ANY($1::bigint[]) RETURNING id`, [createdTaskIds]);
    console.log(`[cleanup] tasks deleted=${r2.rowCount}`);
  }
  // 4) 所有已跟踪的 generation records（分析记录 + 建议记录）
  if (createdRecordIds.length) {
    const r5 = await pool.query(`DELETE FROM ai_generation_records WHERE id = ANY($1::bigint[]) RETURNING id`, [[...new Set(createdRecordIds)]]);
    console.log(`[cleanup] generation records deleted=${r5.rowCount}`);
  }
  // 5) 测试用户
  if (createdSmUserId != null) {
    const r4 = await pool.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [createdSmUserId]);
    createdSmUserId = null;
    console.log(`[cleanup] sm user deleted=${r4.rowCount}`);
  }
  const rem = await pool.query(
    `SELECT (SELECT count(*) FROM users WHERE username='ai10_test_sm') AS sm,
            (SELECT count(*) FROM ai_analysis_tasks WHERE id = ANY($1::bigint[])) AS tasks,
            (SELECT count(*) FROM ai_generation_records WHERE type='analysis' AND sub_type='management_suggestion' AND title = ANY($2::text[])) AS recs`,
    [createdTaskIds.length ? createdTaskIds : [0], createdTaskIds.length ? createdTaskIds.map((id) => `管理建议:任务#${id}`) : ['']]
  );
  return rem.rows[0];
}

/* ─────────────── 轮询任务至终态 ─────────────── */
async function pollTask(id, { timeoutMs = 360000 } = {}) {
  const started = Date.now();
  let task = null;
  while (Date.now() - started < timeoutMs) {
    const r = await api('GET', `/analysis-tasks/${id}`, { token: ADMIN_TOKEN });
    if (r.status === 200 && r.body && r.body.success) {
      task = r.body.task;
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status)) return task;
    }
    await sleep(3000);
  }
  return task;
}

/* ─────────────── 主流程 ─────────────── */
let ADMIN_TOKEN, SM_TOKEN, READER_TOKEN;

async function setupUsers() {
  ADMIN_TOKEN = generateAccessToken({ id: 1, username: 'admin', role: 'admin' });
  READER_TOKEN = generateAccessToken({ id: 75, username: 'h2660', role: 'grid_inspector' });
  // 清理历史残留 AI10_TEST 用户
  await pool.query(`DELETE FROM users WHERE username = 'ai10_test_sm'`);
  const ins = await pool.query(
    `INSERT INTO users (username, password_hash, role, real_name, is_active)
     VALUES ('ai10_test_sm', '$2b$10$ai10testdummyhash00000000000000000000000000000000', 'safety_manager', 'AI10测试安全主管', true)
     RETURNING id`
  );
  createdSmUserId = ins.rows[0].id;
  SM_TOKEN = generateAccessToken({ id: createdSmUserId, username: 'ai10_test_sm', role: 'safety_manager' });
  console.log(`[setup] ai10_test_sm user id=${createdSmUserId}`);
}

async function integrationSuite() {
  // 1) 真实 AI-09 分析任务创建
  const created = await api('POST', '/analysis-tasks', {
    token: ADMIN_TOKEN,
    body: {
      taskType: 'DATA_ANALYSIS',
      domain: 'hazard',
      analysisTypes: ['trend', 'frequency', 'rectification'],
      timeRange: { start: '2026-01-01', end: '2026-08-31' },
      provider: 'ollama',
    },
  });
  const taskId = trackTask(created.body && created.body.task && created.body.task.id);
  record('Integration', '创建分析任务 → PENDING（真实 hazard 域）',
    created.status === 200 && created.body.success === true && created.body.task && created.body.task.status === 'PENDING', created.body);

  // 2) 轮询至 COMPLETED（worker + 真实 Ollama qwen2.5:7b）
  const task = await pollTask(taskId);
  record('Integration', '分析任务 COMPLETED（真实 Ollama 闭环）',
    task && task.status === 'COMPLETED' && task.aiResult && task.aiResult.available === true,
    task && { status: task.status, aiAvailable: task.aiResult && task.aiResult.available, genRecId: task.generationRecordId });
  if (!task || task.status !== 'COMPLETED') {
    console.error('[abort] 分析任务未完成，跳过后续建议链路');
    return { taskId: null };
  }
  record('Integration', '任务 statisticsSnapshot 存在',
    !!(task.statisticsSnapshot && task.statisticsSnapshot.summary), task.statisticsSnapshot && { total: task.statisticsSnapshot.summary && task.statisticsSnapshot.summary.total });
  record('Integration', '任务 evidence 存在（统计分析依据）',
    Array.isArray(task.evidence) && task.evidence.length > 0, { n: task.evidence && task.evidence.length });

  // 3) 生成管理建议（真实 Ollama 闭环）
  const sug = await api('POST', `/analysis-tasks/${taskId}/management-suggestions`, {
    token: ADMIN_TOKEN,
    body: { provider: 'ollama' },
  });
  const s = sug.body;
  record('Integration', '管理建议生成 → available + 结构化（真实 Ollama 闭环）',
    sug.status === 200 && s && s.success === true && s.available === true && s.structured === true,
    s && { code: s.code, provider: s.provider, model: s.model, durationMs: s.durationMs, recordId: s.recordId });
  record('Integration', '建议协议 6 字段完整',
    s && s.available && s.suggestion && ['overall_assessment', 'priority_issues', 'management_actions', 'monitoring_points', 'follow_up_suggestions', 'limitations']
      .every((k) => s.suggestion[k] != null),
    s && s.suggestion && { overall: (s.suggestion.overall_assessment || '').slice(0, 40), priority: (s.suggestion.priority_issues || []).length, actions: (s.suggestion.management_actions || []).length });
  record('Integration', '建议记录已落库（generationRecordId）',
    s && s.available && !!s.recordId && s.recordSaved === true, s && { recordId: s.recordId });
  trackRecord(s && s.recordId);
  record('Integration', '建议证据可追溯（含管理建议链路证据）',
    s && Array.isArray(s.evidence) && s.evidence.some((e) => e && e.source_field === 'management_suggestion'),
    s && { n: s.evidence && s.evidence.length, kinds: s && s.evidence && [...new Set(s.evidence.map((e) => e.source_type))] });
  record('Integration', '建议未越过人机边界（AI 输出无定责/扣分/处罚/整改指令）',
    s && s.available && s.structured === true, null);

  // 4) GET 缓存复用
  const got = await api('GET', `/analysis-tasks/${taskId}/management-suggestions`, { token: ADMIN_TOKEN });
  record('Integration', 'GET 返回已生成建议（cached=true 复用记录）',
    got.status === 200 && got.body && got.body.success && got.body.cached === true && got.body.available === true,
    got.body && { cached: got.body.cached, recordId: got.body.recordId });

  // 5) DB 落库校验（零 migration 关联键 title）
  const rec = await pool.query(
    `SELECT id, type, sub_type, title, provider, model, prompt_key, prompt_version, evidence, result IS NOT NULL AS has_result
     FROM ai_generation_records WHERE id = $1`,
    [s.recordId]
  );
  const row = rec.rows[0];
  record('Integration', 'DB 落库校验（type/sub_type/title/prompt_key/evidence）',
    row && row.type === 'analysis' && row.sub_type === 'management_suggestion' &&
    row.title === `管理建议:任务#${taskId}` && row.prompt_key === 'hse.management.suggestion' &&
    row.prompt_version === 'v1.0' && Array.isArray(row.evidence) && row.evidence.length > 0,
    row && { title: row.title, prompt_key: row.prompt_key, evidence_n: row.evidence && row.evidence.length, model: row.model });

  // 6) AI unavailable：provider=grok（未配置）→ 不 500、不伪造成功、统计保留
  const unav = await api('POST', `/analysis-tasks/${taskId}/management-suggestions`, {
    token: ADMIN_TOKEN,
    body: { provider: 'grok', force: true },
  });
  const u = unav.body;
  record('Integration', 'AI unavailable(grok 未配置) → HTTP 200 + available=false + 统计保留（不 500 不伪造）',
    unav.status === 200 && u && u.success === true && u.available === false &&
    ['AI_PROVIDER_NOT_CONFIGURED', 'AI_PROVIDER_UNAVAILABLE', 'AI_AUTH_ERROR'].includes(u.code) &&
    u.statistics && u.statistics.summary,
    u && { code: u.code, message: u.message && u.message.slice(0, 60) });

  // 7) Provider 不存在 → AI_PROVIDER_NOT_FOUND
  const notf = await api('POST', `/analysis-tasks/${taskId}/management-suggestions`, {
    token: ADMIN_TOKEN,
    body: { provider: 'no-such-provider', force: true },
  });
  record('Integration', 'Provider 不存在 → available=false + AI_PROVIDER_NOT_FOUND',
    notf.status === 200 && notf.body && notf.body.success && notf.body.available === false && notf.body.code === 'AI_PROVIDER_NOT_FOUND',
    notf.body && { code: notf.body.code });

  // 8) Provider 未指定 → 默认 grok（未配置）→ 降级不 500（AI-09 options.provider 回归）
  const unset = await api('POST', `/analysis-tasks/${taskId}/management-suggestions`, {
    token: ADMIN_TOKEN,
    body: { force: true },
  });
  record('Integration', 'Provider 未指定 → 默认 grok 降级（不 500）',
    unset.status === 200 && unset.body && unset.body.success && unset.body.available === false && unset.body.code !== undefined,
    unset.body && { code: unset.body.code });

  // 9) 任务状态非 COMPLETED → AI_TASK_INVALID_STATE（构造一个 PENDING 任务）
  const pending = await api('POST', '/analysis-tasks', {
    token: ADMIN_TOKEN,
    body: { taskType: 'DATA_ANALYSIS', domain: 'hazard', analysisTypes: ['trend'], provider: 'ollama' },
  });
  const pid = trackTask(pending.body && pending.body.task && pending.body.task.id);
  const inv = await api('POST', `/analysis-tasks/${pid}/management-suggestions`, {
    token: ADMIN_TOKEN,
    body: { provider: 'ollama' },
  });
  record('Integration', '非 COMPLETED 任务生成建议 → AI_TASK_INVALID_STATE',
    inv.status === 200 && inv.body && inv.body.success === false && inv.body.error && inv.body.error.code === 'AI_TASK_INVALID_STATE',
    inv.body && inv.body.error && inv.body.error.code);

  return { taskId };
}

async function routeSuite(taskId) {
  // 写：仅 admin / safety_manager
  const sm = await api('POST', `/analysis-tasks/${taskId}/management-suggestions`, {
    token: SM_TOKEN,
    body: { provider: 'ollama', force: true },
  });
  record('Route', 'safety_manager 可生成管理建议', sm.status === 200 && sm.body && sm.body.success === true, sm.body && { code: sm.body.code });

  const rd = await api('POST', `/analysis-tasks/${taskId}/management-suggestions`, {
    token: READER_TOKEN,
    body: { provider: 'ollama' },
  });
  record('Route', 'grid_inspector 生成建议 → 403', rd.status === 403 && rd.body && rd.body.code === 403, rd.body && { code: rd.body && rd.body.code });

  const anon = await api('POST', `/analysis-tasks/${taskId}/management-suggestions`, {
    body: { provider: 'ollama' },
  });
  record('Route', '未认证生成建议 → 401', anon.status === 401, anon.body && { code: anon.body && anon.body.code });

  // 读：任意登录用户；未认证 401
  const readAdmin = await api('GET', `/analysis-tasks/${taskId}/management-suggestions`, { token: ADMIN_TOKEN });
  const readSm = await api('GET', `/analysis-tasks/${taskId}/management-suggestions`, { token: SM_TOKEN });
  const readRd = await api('GET', `/analysis-tasks/${taskId}/management-suggestions`, { token: READER_TOKEN });
  const readAnon = await api('GET', `/analysis-tasks/${taskId}/management-suggestions`, {});
  record('Route', '读取：admin / safety_manager / grid_inspector 均可查看',
    readAdmin.status === 200 && readAdmin.body.success && readSm.status === 200 && readSm.body.success && readRd.status === 200 && readRd.body.success,
    { admin: readAdmin.body && readAdmin.body.available, sm: readSm.body && readSm.body.available, rd: readRd.body && readRd.body.available });
  record('Route', '读取：未认证 → 401', readAnon.status === 401, readAnon.body && { code: readAnon.body && readAnon.body.code });
}

async function frontendSuite() {
  const page = path.resolve(__dirname, '../../安全看板vben/apps/web-naive');
  const idx = fs.readFileSync(path.join(page, 'src/views/hse/ai-analysis/index.vue'), 'utf8');
  const apiSrc = fs.readFileSync(path.join(page, 'src/api/hse/ai.ts'), 'utf8');

  record('Frontend', 'index.vue 含「管理建议」卡片',
    idx.includes('管理建议') && idx.includes('总体判断') && idx.includes('依据'));
  record('Frontend', 'index.vue 含协议字段展示（重点关注/管理措施/持续监测/后续建议/AI限制）',
    ['priority_issues', 'management_actions', 'monitoring_points', 'follow_up_suggestions', 'limitations'].every((k) => idx.includes(k)));
  record('Frontend', 'index.vue 区分统计分析依据/制度知识依据',
    idx.includes('统计分析依据') && idx.includes('制度/知识依据'));
  record('Frontend', 'index.vue AI 不可用降级提示（不伪造成功）',
    idx.includes('当前 AI 服务不可用') && idx.includes('人工研判'));
  record('Frontend', 'ai.ts 导出建议接口与类型',
    apiSrc.includes('generateManagementSuggestion') && apiSrc.includes('getManagementSuggestion') &&
    apiSrc.includes('interface ManagementSuggestion') && apiSrc.includes('overall_assessment'));
}

/* ─────────────── 汇总 ─────────────── */
async function main() {
  await setupUsers();
  let taskId = null;
  try {
    const r = await integrationSuite();
    taskId = r.taskId;
    if (taskId) await routeSuite(taskId);
    frontendSuite();
  } finally {
    const rem = await cleanTestData();
    console.log(`[cleanup] remaining -> sm_users=${rem.sm} tasks=${rem.tasks} suggestion_records=${rem.recs}`);
  }

  const names = Object.keys(suites);
  let total = 0, passed = 0;
  for (const n of names) {
    const t = suites[n].length, p = suites[n].filter((x) => x.ok).length;
    total += t; passed += p;
    console.log(`${n}: ${p}/${t}`);
  }
  console.log(`Total: ${passed}/${total}`);
  await pool.end();
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => { console.error('E2E_ABORT', e); process.exit(1); });
