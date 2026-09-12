const { runCycleAdapters } = require('../services/ruleEngine/engine');
const { testConnection, pool } = require('../config/db');
async function main() {
  await testConnection(); // 先连数据库，置 dbConnected=true，否则引擎返回 memory-mode
  const res = await runCycleAdapters(28, {
    adapterKeys: ['training_ledger', 'driver_monthly', 'transfer_check'],
    dryRun: true,
  });
  console.log(JSON.stringify({
    ok: res.ok, reason: res.reason, cycleId: res.cycleId,
    scanned: res.scanned, assessed: res.assessed, affected: res.affected,
    adapters: (res.adapters || []).map((a) => ({
      key: a.key, ok: a.ok, reason: a.reason, scanned: a.scanned,
      assessed: a.assessed, affected: a.affected, deducted: a.deducted,
    })),
    details: (res.details || []).slice(0, 40).map((d) => ({
      key: d.key, employee: d.employeeName, category: d.category,
      rawScore: d.rawScore, cappedScore: d.cappedScore, action: d.action,
      summary: d.summary,
    })),
  }, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });