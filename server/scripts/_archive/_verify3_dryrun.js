/* 第三轮验证：dryRun 验证（只算不写库）
 * 1) cycle 28 (2026-06) 应返回 no-ledger-data
 * 2) cycle 24 (2026-08) 应正常扫描，输出 affected/details 摘要
 */
const { testConnection } = require('../config/db');
const svc = require('../services/gridUncheckedDeductionService');

(async () => {
  await testConnection();
  // 历史周期守卫：cycle 28 (2026-06，无台账)
  const r28 = await svc.syncGridUncheckedDeductions(28, { dryRun: true });
  console.log('=== cycle28 (2026-06) dryRun ===');
  console.log(JSON.stringify({ ok: r28.ok, reason: r28.reason, scanned: r28.scanned, affected: r28.affected, dryRun: r28.dryRun }, null, 2));

  // 8月 dryRun：cycle 24
  const r24 = await svc.syncGridUncheckedDeductions(24, { dryRun: true });
  console.log('=== cycle24 (2026-08) dryRun ===');
  console.log(JSON.stringify({ ok: r24.ok, scanned: r24.scanned, affected: r24.affected, dryRun: r24.dryRun }, null, 2));
  const byAction = {};
  r24.details.forEach((d) => { byAction[d.action] = (byAction[d.action] || 0) + 1; });
  console.log('action 分布:', JSON.stringify(byAction));
  const scored = r24.details.filter((d) => d.cappedScore > 0);
  scored.sort((a, b) => b.cappedScore - a.cappedScore);
  console.log(`应扣分 ${scored.length} 人，cappedScore 分布:`);
  const dist = {};
  scored.forEach((d) => { dist[`${d.missing}缺/${d.cappedScore}分`] = (dist[`${d.missing}缺/${d.cappedScore}分`] || 0) + 1; });
  console.log(JSON.stringify(dist, null, 2));
  console.log('前5高分:', scored.slice(0, 5).map((d) => `${d.employeeName}:缺${d.missing}→${d.cappedScore}分`).join(' | '));
  const noMiss = r24.details.filter((d) => d.missing <= 0);
  console.log(`无缺次 ${noMiss.length} 人`);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
