/* 第三轮验证：审核列表接口字段核对 + 调整历史 + 解锁审计（只读为主） */
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

(async () => {
  await testConnection();
  const login = await api('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
  token = login.data.data.accessToken;
  console.log('登录成功');

  // 1. 扣分明细列表（cycle 24, 未检查）
  const list = await api('/hse/assessment-monthly/deductions?cycle_id=24&keyword=未检查&page_size=5');
  const d = list.data && list.data.data;
  const rows = (d && (d.list || d.records || d.items)) || [];
  console.log('=== 审核列表（未检查）===');
  rows.forEach((r) => {
    console.log(JSON.stringify({
      id: r.id, deductionItem: r.deductionItem, suggestedScore: r.suggestedScore,
      confirmedScore: r.confirmedScore, reviewStatus: r.reviewStatus,
      effectiveScore: r.effectiveScore, summary: r.summary,
      sourceDetailKind: r.sourceDetail && r.sourceDetail.kind,
      sourceDetailSummary: r.sourceDetail && r.sourceDetail.summary,
    }));
  });

  // 2. 调整历史（明细 96 应有 UNLOCK 记录）
  const adjHist = await api('/hse/assessment-monthly/deductions/96/adjustments');
  console.log('=== 明细96 调整历史 ===');
  const ah = adjHist.data && adjHist.data.data;
  (ah && (ah.list || [])) && ah.list.forEach((r) =>
    console.log(JSON.stringify({ versionNo: r.versionNo, operationType: r.operationType, oldScore: r.oldScore, newScore: r.newScore, reason: r.adjustmentReason }))
  );

  // 3. 审计记录（最近几条 assessment-monthly 审计，应含 UNLOCK）
  const audit = await api('/hse/audit?page_size=5');
  console.log('=== 最近审计 ===');
  const ad = audit.data && audit.data.data;
  const ar = (ad && (ad.list || ad.records)) || [];
  ar.forEach((r) => console.log(JSON.stringify({ action: r.action, entity: r.entity, target: r.target, detail: (r.detail && typeof r.detail === 'object') ? JSON.stringify(r.detail).slice(0, 160) : r.detail })));

  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
