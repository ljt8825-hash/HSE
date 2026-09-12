const { pool, testConnection } = require('../config/db');
const { runCycleAdapters, ensureAdaptersRegistered } = require('../services/ruleEngine/engine');
(async () => {
  await testConnection();
  ensureAdaptersRegistered();
  const r = await pool.query(`SELECT id, assessment_year, assessment_month FROM hse_assessment_cycle WHERE is_deleted=FALSE ORDER BY assessment_year, assessment_month`);
  for (const c of r.rows) {
    const m = `${c.assessment_year}-${String(c.assessment_month).padStart(2,'0')}`;
    if (!(m === '2026-06' || m === '2026-07')) continue;
    const res = await runCycleAdapters(Number(c.id), { adapterKeys: ['training_ledger'], dryRun: false });
    const ad = (res.adapters || []).find(a => a.key === 'training_ledger');
    const byAct = {};
    for (const d of res.details) { const k = d.action || 'none'; byAct[k] = (byAct[k] || 0) + 1; }
    const written = res.details.filter(d => (d.rawScore > 0) && !d.cappedOut).map(d => `${d.employeeName}:${d.rawScore}`);
    console.log(`cycle${c.id} (${m})  ok=${res.ok} scanned=${ad ? ad.scanned : 0} assessed=${ad ? ad.assessed : 0} affected=${ad ? ad.affected : 0} actions=${JSON.stringify(byAct)}`);
    console.log('  扣分:', written.join(', ') || '(无)');
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });