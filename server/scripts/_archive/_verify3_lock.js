/* 第三轮验证：人工改分锁定全流程（真实写库，结束时恢复到自动口径）
 * HTTP 调用调整/解锁/执行评分接口；分数校验用 DB 直查。
 */
const { testConnection, pool } = require('../config/db');
const BASE = 'http://127.0.0.1:5800/api';
let token = '';

async function api(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}

async function targetScore(targetId) {
  const r = await pool.query(
    `SELECT score_auto, score_total, status FROM hse_assessment_target WHERE id=$1`, [targetId]
  );
  return r.rows[0] ? { scoreAuto: Number(r.rows[0].score_auto), scoreTotal: r.rows[0].score_total, status: r.rows[0].status } : null;
}

async function dedRow(id) {
  const r = await pool.query(
    `SELECT id, review_status, confirmed_score, suggested_score, is_deleted,
            source_detail->>'summary' AS summary
     FROM hse_assessment_deduction WHERE id=$1`, [id]
  );
  return r.rows[0] || null;
}

(async () => {
  await testConnection();
  const login = await api('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
  token = login.data.data.accessToken;
  console.log('登录成功');

  const deductionId = 96;  // 李忠胜 缺1次 suggested=1
  const targetId = 454;
  const cycleId = 24;

  console.log('=== 步骤0 基线 ===');
  console.log('目标分:', JSON.stringify(await targetScore(targetId)));
  console.log('明细:', JSON.stringify(await dedRow(deductionId)));

  console.log('=== 步骤1 调整 1→2 分 ===');
  const adj = await api('/hse/assessment-monthly/deductions/adjust', 'POST', {
    deduction_id: deductionId, new_score: 2, adjustment_reason: '验证人工改分锁定-临时测试',
  });
  console.log('调整响应:', adj.data.code === 0 ? 'OK' : JSON.stringify(adj.data).slice(0, 300));
  console.log('调整后目标分:', JSON.stringify(await targetScore(targetId)));
  console.log('调整后明细:', JSON.stringify(await dedRow(deductionId)));

  console.log('=== 步骤2 执行评分（应不覆盖锁定行）===');
  const ex = await api('/hse/assessment-monthly/scoring/execute', 'POST', { cycle_id: cycleId });
  const gu = ex.data.data && ex.data.data.gridUnchecked;
  console.log('gridUnchecked:', JSON.stringify(gu));
  console.log('重扫后目标分:', JSON.stringify(await targetScore(targetId)));
  console.log('重扫后明细:', JSON.stringify(await dedRow(deductionId)));

  console.log('=== 步骤3 豁免调整 2→0 ===');
  const adj0 = await api('/hse/assessment-monthly/deductions/adjust', 'POST', {
    deduction_id: deductionId, new_score: 0, adjustment_reason: '验证豁免-临时测试',
  });
  console.log('豁免响应:', adj0.data.code === 0 ? 'OK' : JSON.stringify(adj0.data).slice(0, 300));
  console.log('豁免后目标分:', JSON.stringify(await targetScore(targetId)));
  console.log('豁免后明细:', JSON.stringify(await dedRow(deductionId)));

  console.log('=== 步骤4 再次执行评分（豁免应保留）===');
  const ex2 = await api('/hse/assessment-monthly/scoring/execute', 'POST', { cycle_id: cycleId });
  const gu2 = ex2.data.data && ex2.data.data.gridUnchecked;
  console.log('gridUnchecked:', JSON.stringify(gu2));
  console.log('再次重扫目标分:', JSON.stringify(await targetScore(targetId)));
  console.log('再次重扫明细:', JSON.stringify(await dedRow(deductionId)));

  console.log('=== 步骤5 恢复自动计算（解锁）===');
  const unl = await api(`/hse/assessment-monthly/deductions/${deductionId}/unlock`, 'POST', {});
  console.log('解锁响应:', unl.data.code === 0 ? 'OK' : JSON.stringify(unl.data).slice(0, 300));
  console.log('解锁后目标分:', JSON.stringify(await targetScore(targetId)));
  console.log('解锁后明细:', JSON.stringify(await dedRow(deductionId)));

  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
