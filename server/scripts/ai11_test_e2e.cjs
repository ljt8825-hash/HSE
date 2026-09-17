/**
 * AI-11 人工审核 — Integration / Route / Frontend 综合验证脚本
 *
 * 覆盖（AI-11 任务书 §测试要求 Integration/Route/Frontend/并发/幂等/一致性）：
 *  - Integration：任务 + AI 管理建议记录（dev 库直建，规避真实 Ollama 耗时）→ GET 建议可用
 *                 → GET 审核历史（PENDING_REVIEW 空链）→ POST APPROVE/REJECT/MODIFY 全链路
 *                 → 审核历史追加链（previous_status 连续）→ AI 原始建议零改动校验
 *  - 幂等：重复提交完全一致 → idempotent=true 不新增历史
 *  - 一致性：当前已为目标状态（非幂等）→ AI_REVIEW_STATE_CONFLICT；
 *            请求 previousStatus 与服务器不一致 → AI_REVIEW_STATE_CONFLICT
 *  - 并发：同一任务并行不同动作（相同 previousStatus）→ 行锁串行化，恰一成功一冲突
 *  - 校验：非法 action / MODIFY 缺 humanModified / humanModified 结构非法 / 意见超长 拒绝
 *  - Route/Permission：admin / safety_manager（AI11_TEST）可写；grid_inspector 写 403、读 200；未认证 401
 *  - AI unavailable 语义：无建议记录时 GET reviews 返回 PENDING_REVIEW 空历史（不伪造审核）
 *  - Frontend：源码断言（index.vue 审核区块/权限按钮/冲突刷新/humanModified 区分；ai.ts 类型与接口）
 *
 * 数据边界：
 *  - 全部写入开发库 safety_dashboard；测试用户 ai11_test_sm（AI11_TEST 标记）测试后删除；
 *  - 测试任务/建议记录/审核记录按 id 跟踪，结束统一清理，报告创建/删除/残留数量；
 *  - 不修改 .env、不触碰生产 5876、不写生产业务表。
 *
 * 环境：dev 后端 5881 运行中（含 AI-11 新代码）；无需 worker / 无需真实 AI 调用。
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
const createdReviewIds = [];
let createdSmUserId = null;

function trackTask(id) {
  if (id != null && !createdTaskIds.includes(id)) createdTaskIds.push(id);
  return id;
}
function trackRecord(id) {
  if (id != null && !createdRecordIds.includes(id)) createdRecordIds.push(id);
  return id;
}
function trackReview(id) {
  if (id != null && !createdReviewIds.includes(id)) createdReviewIds.push(id);
  return id;
}

async function cleanTestData() {
  // 1) 审核记录（先于任务/建议记录删除，避免级联依赖混乱）
  if (createdReviewIds.length) {
    const r0 = await pool.query(`DELETE FROM ai_generation_reviews WHERE id = ANY($1::bigint[]) RETURNING id`, [createdReviewIds]);
    console.log(`[cleanup] reviews deleted=${r0.rowCount}`);
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
  // 4) 其他已跟踪 generation records
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
    `SELECT (SELECT count(*) FROM users WHERE username='ai11_test_sm') AS sm,
            (SELECT count(*) FROM ai_analysis_tasks WHERE id = ANY($1::bigint[])) AS tasks,
            (SELECT count(*) FROM ai_generation_records WHERE type='analysis' AND sub_type='management_suggestion' AND title = ANY($2::text[])) AS recs,
            (SELECT count(*) FROM ai_generation_reviews WHERE id = ANY($3::bigint[])) AS reviews`,
    [
      createdTaskIds.length ? createdTaskIds : [0],
      createdTaskIds.length ? createdTaskIds.map((id) => `管理建议:任务#${id}`) : [''],
      createdReviewIds.length ? createdReviewIds : [0],
    ]
  );
  return rem.rows[0];
}

/* ─────────────── 测试建议数据（合法六字段；不命中 AI-10 越权表述） ─────────────── */
const SUGGESTION_JSON = JSON.stringify({
  overall_assessment: '建议加强隐患整改跟踪，提升整改及时率，降低重复隐患风险。',
  priority_issues: ['部分隐患整改超期', '同类问题重复出现'],
  management_actions: ['完善整改跟踪台账', '开展高发区域专项复查'],
  monitoring_points: ['按周跟踪整改进度', '关注高发区域变化'],
  follow_up_suggestions: ['下月复核整改进度', '汇总共性问题至月度分析'],
  limitations: ['统计样本为近30天数据，可能无法完全代表全年情况'],
});

/* ─────────────── 主流程 ─────────────── */
let ADMIN_TOKEN, SM_TOKEN, READER_TOKEN;
let taskId = null;
let generationRecordId = null;

async function setupUsers() {
  ADMIN_TOKEN = generateAccessToken({ id: 1, username: 'admin', role: 'admin' });
  READER_TOKEN = generateAccessToken({ id: 75, username: 'h2660', role: 'grid_inspector' });
  await pool.query(`DELETE FROM users WHERE username = 'ai11_test_sm'`);
  const ins = await pool.query(
    `INSERT INTO users (username, password_hash, role, real_name, is_active)
     VALUES ('ai11_test_sm', '$2b$10$ai11testdummyhash00000000000000000000000000000000', 'safety_manager', 'AI11测试安全主管', true)
     RETURNING id`
  );
  createdSmUserId = Number(ins.rows[0].id);
  SM_TOKEN = generateAccessToken({ id: createdSmUserId, username: 'ai11_test_sm', role: 'safety_manager' });
  console.log(`[setup] ai11_test_sm user id=${createdSmUserId}`);
}

/** 建任务（dev 库直建，status=COMPLETED 规避 worker 拾取与真实 AI 调用；审核不依赖任务状态） */
async function seedTask() {
  const ins = await pool.query(
    `INSERT INTO ai_analysis_tasks (task_type, domain, status, priority, request_hash, request_payload, created_by, statistics_snapshot, ai_result, evidence, completed_at)
     VALUES ('DATA_ANALYSIS', 'hazard', 'COMPLETED', 5, $1, $2, NULL,
             '{"summary":{"total":3,"rectifiedCount":1,"unrectifiedCount":2,"rectificationRate":33,"overdueCount":1,"duplicateCount":1},"dataScope":{"totalAvailable":3,"analyzedRecords":3,"limit":1000,"truncated":false}}',
             '{"available":true,"analysis":{"summary":"测试分析"}}', '[]', now())
     RETURNING id`,
    [`ai11-test-${Date.now()}`, JSON.stringify({ domain: 'hazard', timeRange: null, filters: {}, analysisTypes: [], useRag: false, provider: null, model: null, limit: null })]
  );
  taskId = trackTask(ins.rows[0].id);

  const rec = await pool.query(
    `INSERT INTO ai_generation_records (user_id, type, sub_type, title, result, provider, model, prompt_key, prompt_version, status, evidence)
     VALUES (NULL, 'analysis', 'management_suggestion', $1, $2, 'ollama', 'qwen2.5:7b', 'hse.management.suggestion', 'v1.0', 'success', '[]')
     RETURNING id`,
    [`管理建议:任务#${taskId}`, SUGGESTION_JSON]
  );
  generationRecordId = trackRecord(rec.rows[0].id);
  console.log(`[setup] task id=${taskId}, suggestion record id=${generationRecordId}`);
}

async function integrationSuite() {
  // 1) 建议可读（seed 记录经真实解析链路）
  const sug = await api('GET', `/analysis-tasks/${taskId}/management-suggestions`, { token: ADMIN_TOKEN });
  record('Integration', 'GET 管理建议 → available=true（seed 记录可解析）',
    sug.status === 200 && sug.body && sug.body.success && sug.body.available === true && sug.body.structured === true && !!sug.body.suggestion,
    { available: sug.body && sug.body.available, recordId: sug.body && sug.body.recordId });

  // 2) 无审核记录 → PENDING_REVIEW 空历史
  const h0 = await api('GET', `/analysis-tasks/${taskId}/management-suggestions/reviews`, { token: ADMIN_TOKEN });
  record('Integration', 'GET 审核历史（无审核）→ currentStatus=PENDING_REVIEW + 空历史',
    h0.status === 200 && h0.body && h0.body.success === true &&
    h0.body.currentStatus === 'PENDING_REVIEW' && Array.isArray(h0.body.reviews) && h0.body.reviews.length === 0,
    { currentStatus: h0.body && h0.body.currentStatus, n: h0.body && h0.body.reviews && h0.body.reviews.length });

  // 3) APPROVE（previousStatus=PENDING_REVIEW，带人工意见）
  const a1 = await api('POST', `/analysis-tasks/${taskId}/management-suggestions/review`, {
    token: ADMIN_TOKEN,
    body: { action: 'APPROVE', humanRemark: '同意该建议，按措施落实整改跟踪', previousStatus: 'PENDING_REVIEW' },
  });
  trackReview(a1.body && a1.body.review && a1.body.review.id);
  record('Integration', 'POST APPROVE → APPROVED + 审核人/意见留痕',
    a1.status === 200 && a1.body && a1.body.success === true && a1.body.idempotent === false &&
    a1.body.review.reviewStatus === 'APPROVED' && a1.body.review.previousStatus === 'PENDING_REVIEW' &&
    a1.body.review.action === 'APPROVE' && a1.body.review.reviewedBy === 1 && a1.body.review.reviewedAt != null,
    { status: a1.body && a1.body.review && a1.body.review.reviewStatus, id: a1.body && a1.body.review && a1.body.review.id });

  // 4) 历史：1 条，latest=APPROVED，审核人姓名（join users）
  const h1 = await api('GET', `/analysis-tasks/${taskId}/management-suggestions/reviews`, { token: ADMIN_TOKEN });
  record('Integration', 'GET 审核历史（1条）→ APPROVED + reviewedByName',
    h1.status === 200 && h1.body.reviews.length === 1 && h1.body.currentStatus === 'APPROVED' &&
    h1.body.reviews[0].humanRemark != null,
    { currentStatus: h1.body.currentStatus, name: h1.body.reviews[0] && h1.body.reviews[0].reviewedByName });

  // 5) 幂等：完全一致重复提交 → idempotent=true，历史不新增
  const a1b = await api('POST', `/analysis-tasks/${taskId}/management-suggestions/review`, {
    token: ADMIN_TOKEN,
    body: { action: 'APPROVE', humanRemark: '同意该建议，按措施落实整改跟踪', previousStatus: 'APPROVED' },
  });
  const h1b = await api('GET', `/analysis-tasks/${taskId}/management-suggestions/reviews`, { token: ADMIN_TOKEN });
  record('Integration', '重复提交完全一致 → idempotent=true 且历史不新增（网络重试安全）',
    a1b.body && a1b.body.success === true && a1b.body.idempotent === true && h1b.body.reviews.length === 1,
    { idempotent: a1b.body && a1b.body.idempotent, n: h1b.body.reviews.length });

  // 6) 一致性：当前已是 APPROVED，非幂等再 APPROVE → 冲突
  const a2 = await api('POST', `/analysis-tasks/${taskId}/management-suggestions/review`, {
    token: ADMIN_TOKEN,
    body: { action: 'APPROVE', humanRemark: '再次确认', previousStatus: 'APPROVED' },
  });
  record('Integration', '当前已 APPROVED 再 APPROVE（非幂等）→ AI_REVIEW_STATE_CONFLICT',
    a2.body && a2.body.success === false && a2.body.error && a2.body.error.code === 'AI_REVIEW_STATE_CONFLICT',
    { code: a2.body && a2.body.error && a2.body.error.code });

  // 7) 乐观并发校验：previousStatus 与服务器不一致 → 冲突
  const a3 = await api('POST', `/analysis-tasks/${taskId}/management-suggestions/review`, {
    token: ADMIN_TOKEN,
    body: { action: 'REJECT', humanRemark: '基于旧视图驳回', previousStatus: 'PENDING_REVIEW' },
  });
  record('Integration', 'previousStatus 过期（PENDING_REVIEW，实际 APPROVED）→ AI_REVIEW_STATE_CONFLICT',
    a3.body && a3.body.success === false && a3.body.error && a3.body.error.code === 'AI_REVIEW_STATE_CONFLICT',
    { code: a3.body && a3.body.error && a3.body.error.code });

  // 8) REJECT（previousStatus=APPROVED，safety_manager 执行 → 审核人姓名解析）
  const r1 = await api('POST', `/analysis-tasks/${taskId}/management-suggestions/review`, {
    token: SM_TOKEN,
    body: { action: 'REJECT', humanRemark: '依据不足，暂不采纳，需补充数据', previousStatus: 'APPROVED' },
  });
  trackReview(r1.body && r1.body.review && r1.body.review.id);
  record('Integration', 'POST REJECT（safety_manager）→ REJECTED + reviewedByName 解析',
    r1.body && r1.body.success === true && r1.body.review.reviewStatus === 'REJECTED' &&
    r1.body.review.previousStatus === 'APPROVED' && r1.body.review.reviewedBy === createdSmUserId &&
    r1.body.review.reviewedByName === 'AI11测试安全主管',
    { status: r1.body && r1.body.review && r1.body.review.reviewStatus, name: r1.body && r1.body.review && r1.body.review.reviewedByName });

  // 9) 历史链：2 条，previous_status 连续（PENDING_REVIEW → APPROVED → REJECTED）
  const h2 = await api('GET', `/analysis-tasks/${taskId}/management-suggestions/reviews`, { token: ADMIN_TOKEN });
  const chain = h2.body.reviews.map((v) => `${v.previousStatus}→${v.reviewStatus}`);
  record('Integration', '审核历史追加链连续（PENDING_REVIEW→APPROVED→REJECTED）',
    h2.body.reviews.length === 2 && h2.body.currentStatus === 'REJECTED' &&
    chain.join(',') === 'PENDING_REVIEW→APPROVED,APPROVED→REJECTED',
    chain);

  // 10) 并发：REJECTED 基础上并行 MODIFY 与 APPROVE（相同 previousStatus）→ 恰一成功一冲突
  const [c1, c2] = await Promise.all([
    api('POST', `/analysis-tasks/${taskId}/management-suggestions/review`, {
      token: ADMIN_TOKEN,
      body: { action: 'MODIFY', previousStatus: 'REJECTED', humanRemark: '并发修改', humanModified: JSON.parse(SUGGESTION_JSON) },
    }),
    api('POST', `/analysis-tasks/${taskId}/management-suggestions/review`, {
      token: ADMIN_TOKEN,
      body: { action: 'APPROVE', previousStatus: 'REJECTED', humanRemark: '并发确认' },
    }),
  ]);
  const ccOk = [c1, c2].filter((x) => x.body && x.body.success === true).length;
  const ccConflict = [c1, c2].filter((x) => x.body && x.body.success === false && x.body.error && x.body.error.code === 'AI_REVIEW_STATE_CONFLICT').length;
  record('Integration', '并发不同动作（相同 previousStatus）→ 行锁串行化，恰一成功一冲突',
    ccOk === 1 && ccConflict === 1,
    { ok: ccOk, conflict: ccConflict, codes: [c1.body && c1.body.error && c1.body.error.code, c2.body && c2.body.error && c2.body.error.code] });
  for (const c of [c1, c2]) trackReview(c.body && c.body.review && c.body.review.id);

  // 11) 并发后历史：3 条，latest = 并发胜出者
  const h3 = await api('GET', `/analysis-tasks/${taskId}/management-suggestions/reviews`, { token: ADMIN_TOKEN });
  record('Integration', '并发后历史=3 条（无丢失/无重复）',
    h3.body.reviews.length === 3, { n: h3.body.reviews.length, current: h3.body.currentStatus });

  // 12) 校验：非法 action
  const bad1 = await api('POST', `/analysis-tasks/${taskId}/management-suggestions/review`, {
    token: ADMIN_TOKEN,
    body: { action: 'DELETE', previousStatus: h3.body.currentStatus },
  });
  record('Integration', '非法 action → AI_REVIEW_INVALID_ACTION（fail-closed）',
    bad1.body && bad1.body.success === false && bad1.body.error && bad1.body.error.code === 'AI_REVIEW_INVALID_ACTION',
    { code: bad1.body && bad1.body.error && bad1.body.error.code });

  // 13) 校验：MODIFY 缺 humanModified
  const bad2 = await api('POST', `/analysis-tasks/${taskId}/management-suggestions/review`, {
    token: ADMIN_TOKEN,
    body: { action: 'MODIFY', previousStatus: h3.body.currentStatus },
  });
  record('Integration', 'MODIFY 缺 humanModified → AI_REVIEW_REQUIRED',
    bad2.body && bad2.body.success === false && bad2.body.error && bad2.body.error.code === 'AI_REVIEW_REQUIRED',
    { code: bad2.body && bad2.body.error && bad2.body.error.code });

  // 14) 校验：humanModified 结构非法（缺字段）
  const bad3 = await api('POST', `/analysis-tasks/${taskId}/management-suggestions/review`, {
    token: ADMIN_TOKEN,
    body: { action: 'MODIFY', previousStatus: h3.body.currentStatus, humanModified: { overall_assessment: '缺数组字段' } },
  });
  record('Integration', 'MODIFY humanModified 缺字段 → AI_REVIEW_INVALID_MODIFIED',
    bad3.body && bad3.body.success === false && bad3.body.error && bad3.body.error.code === 'AI_REVIEW_INVALID_MODIFIED',
    { code: bad3.body && bad3.body.error && bad3.body.error.code });

  // 15) 校验：意见超长
  const bad4 = await api('POST', `/analysis-tasks/${taskId}/management-suggestions/review`, {
    token: ADMIN_TOKEN,
    body: { action: 'APPROVE', humanRemark: '长'.repeat(2001), previousStatus: h3.body.currentStatus },
  });
  record('Integration', '人工意见超长(>2000) → AI_REVIEW_OVERSIZED',
    bad4.body && bad4.body.success === false && bad4.body.error && bad4.body.error.code === 'AI_REVIEW_OVERSIZED',
    { code: bad4.body && bad4.body.error && bad4.body.error.code });

  // 16) 校验失败后历史不变（无脏写）
  const h4 = await api('GET', `/analysis-tasks/${taskId}/management-suggestions/reviews`, { token: ADMIN_TOKEN });
  record('Integration', '校验失败（12~15）后审核历史仍为 3 条（无脏写）',
    h4.body.reviews.length === 3, { n: h4.body.reviews.length });

  // 17) AI 原始建议零改动（result / evidence 未被审核覆盖）
  const rec = await pool.query(
    `SELECT result, evidence, provider, model, prompt_key, prompt_version FROM ai_generation_records WHERE id = $1`,
    [generationRecordId]
  );
  const recRow = rec.rows[0];
  record('Integration', 'AI 原始建议零改动（result/evidence/provider/prompt 与 seed 完全一致）',
    recRow.result === SUGGESTION_JSON && JSON.stringify(recRow.evidence) === '[]' &&
    recRow.provider === 'ollama' && recRow.prompt_key === 'hse.management.suggestion' && recRow.prompt_version === 'v1.0',
    { resultSame: recRow.result === SUGGESTION_JSON, evidence: recRow.evidence });

  // 18) MODIFY 人工修改独立存储（human_modified 可检索，不影响 AI 原始 result）
  const lastReview = h4.body.reviews[h4.body.reviews.length - 1];
  if (lastReview && lastReview.reviewStatus === 'MODIFIED') {
    const hmRow = await pool.query(
      `SELECT human_modified FROM ai_generation_reviews WHERE id = $1`, [lastReview.id]);
    const ori = await pool.query(`SELECT result FROM ai_generation_records WHERE id = $1`, [generationRecordId]);
    record('Integration', 'MODIFIED 人工修改存 human_modified 独立列，AI result 未变',
      hmRow.rows[0].human_modified != null && hmRow.rows[0].human_modified.overall_assessment != null &&
      ori.rows[0].result === SUGGESTION_JSON,
      { humanModified: !!hmRow.rows[0].human_modified, aiResultIntact: ori.rows[0].result === SUGGESTION_JSON });
  } else {
    record('Integration', 'MODIFIED 人工修改独立存储校验（并发胜出者为 MODIFIED）',
      false, { currentStatus: h4.body.currentStatus, note: '并发胜出者非 MODIFY，另行校验下一任务' });
  }

  // 19) AI unavailable 语义：无建议记录的任务 → GET reviews 不伪造审核（PENDING_REVIEW 空历史）
  const orphanTask = await pool.query(
    `INSERT INTO ai_analysis_tasks (task_type, domain, status, priority, request_hash, request_payload, created_by)
     VALUES ('DATA_ANALYSIS','hazard','COMPLETED',5,$1,$2,NULL) RETURNING id`,
    [`ai11-test-orphan-${Date.now()}`, JSON.stringify({ domain: 'hazard' })]
  );
  trackTask(orphanTask.rows[0].id);
  const hOrphan = await api('GET', `/analysis-tasks/${orphanTask.rows[0].id}/management-suggestions/reviews`, { token: ADMIN_TOKEN });
  record('Integration', '无建议记录任务 → GET reviews 返回空历史（不伪造审核状态）',
    hOrphan.status === 200 && hOrphan.body.success === true &&
    hOrphan.body.generationRecordId === null && hOrphan.body.reviews.length === 0,
    { generationRecordId: hOrphan.body.generationRecordId, n: hOrphan.body.reviews.length });
  const pOrphan = await api('POST', `/analysis-tasks/${orphanTask.rows[0].id}/management-suggestions/review`, {
    token: ADMIN_TOKEN,
    body: { action: 'APPROVE' },
  });
  record('Integration', '无建议记录任务 POST review → AI_REVIEW_RECORD_NOT_FOUND（不得伪造审核）',
    pOrphan.body && pOrphan.body.success === false && pOrphan.body.error && pOrphan.body.error.code === 'AI_REVIEW_RECORD_NOT_FOUND',
    { code: pOrphan.body && pOrphan.body.error && pOrphan.body.error.code });
}

async function routeSuite() {
  // 权限：写仅 admin/safety_manager；读任意登录用户；未认证 401
  const readerPost = await api('POST', `/analysis-tasks/${taskId}/management-suggestions/review`, {
    token: READER_TOKEN,
    body: { action: 'APPROVE' },
  });
  record('Route', 'grid_inspector POST review → 403（写权限仅 admin/safety_manager）',
    readerPost.status === 403, { status: readerPost.status });

  const noAuthPost = await api('POST', `/analysis-tasks/${taskId}/management-suggestions/review`, {
    body: { action: 'APPROVE' },
  });
  record('Route', '未认证 POST review → 401',
    noAuthPost.status === 401, { status: noAuthPost.status });

  const readerGet = await api('GET', `/analysis-tasks/${taskId}/management-suggestions/reviews`, { token: READER_TOKEN });
  record('Route', 'grid_inspector GET 审核历史 → 200（读任意登录用户）',
    readerGet.status === 200 && readerGet.body && readerGet.body.success === true &&
    Array.isArray(readerGet.body.reviews),
    { status: readerGet.status, n: readerGet.body && readerGet.body.reviews && readerGet.body.reviews.length });

  const noAuthGet = await api('GET', `/analysis-tasks/${taskId}/management-suggestions/reviews`);
  record('Route', '未认证 GET 审核历史 → 401',
    noAuthGet.status === 401, { status: noAuthGet.status });

  const taskNotFound = await api('POST', '/analysis-tasks/999999999/management-suggestions/review', {
    token: ADMIN_TOKEN,
    body: { action: 'APPROVE' },
  });
  record('Route', '任务不存在 POST review → AI_TASK_NOT_FOUND',
    taskNotFound.body && taskNotFound.body.success === false &&
    taskNotFound.body.error && taskNotFound.body.error.code === 'AI_TASK_NOT_FOUND',
    { code: taskNotFound.body && taskNotFound.body.error && taskNotFound.body.error.code });
}

async function frontendSuite() {
  const vuePath = path.join(__dirname, '..', '..', '安全看板vben', 'apps', 'web-naive', 'src', 'views', 'hse', 'ai-analysis', 'index.vue');
  const tsPath = path.join(__dirname, '..', '..', '安全看板vben', 'apps', 'web-naive', 'src', 'api', 'hse', 'ai.ts');
  const vue = fs.readFileSync(vuePath, 'utf8');
  const ts = fs.readFileSync(tsPath, 'utf8');

  const has = (src, s) => src.includes(s);
  record('Frontend', 'index.vue 包含人工审核区块与三操作按钮（确认采纳/驳回/修改后采纳）',
    has(vue, '人工审核') && has(vue, '确认采纳') && has(vue, '驳回') && has(vue, '修改后采纳'));

  record('Frontend', 'index.vue 展示审核状态/审核人/审核时间/人工意见',
    has(vue, 'reviewedByName') && has(vue, 'reviewedAt') && has(vue, 'humanRemark') && has(vue, 'REVIEW_STATUS_MAP'));

  record('Frontend', 'index.vue 权限控制按钮（hasAccessByRoles admin/safety_manager）',
    has(vue, 'hasAccessByRoles') && has(vue, "'admin', 'safety_manager'"));

  record('Frontend', 'index.vue 乐观并发（previousStatus + AI_REVIEW_STATE_CONFLICT 刷新重试）',
    has(vue, 'previousStatus') && has(vue, 'AI_REVIEW_STATE_CONFLICT'));

  record('Frontend', 'index.vue 人工修改建议与 AI 输出明确区分（不伪装成 AI）',
    has(vue, 'humanModified') && has(vue, '人工修改建议') && has(vue, '非 AI 原始输出'));

  record('Frontend', 'ai.ts 含 AI-11 类型（ReviewStatus/ReviewAction/AiReviewRecord）与接口（submit/get）',
    has(ts, 'ReviewStatus') && has(ts, 'ReviewAction') && has(ts, 'AiReviewRecord') &&
    has(ts, 'submitManagementSuggestionReview') && has(ts, 'getManagementSuggestionReviews'));

  record('Frontend', 'ai.ts 提交参数含 previousStatus 乐观并发字段',
    has(ts, 'previousStatus') && has(ts, 'AI_REVIEW_STATE_CONFLICT'));
}

/* ─────────────── 主入口 ─────────────── */

(async () => {
  await setupUsers();
  await seedTask();
  await integrationSuite();
  await routeSuite();
  await frontendSuite();

  const leftover = await cleanTestData();
  console.log('\n[cleanup] residual:', JSON.stringify(leftover));

  const all = Object.values(suites).flat();
  const total = all.length;
  const passed = all.filter((t) => t.ok).length;
  const failed = all.filter((t) => !t.ok).length;
  for (const [name, list] of Object.entries(suites)) {
    console.log(`Suite ${name}: Total=${list.length} Passed=${list.filter((t) => t.ok).length} Failed=${list.filter((t) => !t.ok).length}`);
  }
  console.log(`\nTotal=${total} Passed=${passed} Failed=${failed}`);
  console.log(failed === 0 ? 'RESULT: OK' : 'RESULT: FAIL');
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('FATAL', e);
  try {
    const leftover = await cleanTestData();
    console.log('[cleanup on error] residual:', JSON.stringify(leftover));
  } catch (e2) {
    console.error('cleanup failed', e2.message);
  }
  process.exit(1);
});
