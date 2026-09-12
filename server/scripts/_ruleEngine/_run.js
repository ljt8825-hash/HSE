/**
 * 规则引擎阶段1 · 手动触发扫描（验收用）
 * 用法：node server/scripts/_ruleEngine/_run.js <cycleId> [dryRun=true|false]
 */

const path = require('path');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { pool, testConnection } = require('../../config/db');
const svc = require('../../services/gridUncheckedDeductionService');

async function main() {
  await testConnection();
  const cycleId = Number(process.argv[2] || 24);
  const dryRun = String(process.argv[3] || 'true') === 'true';
  const r = await svc.syncGridUncheckedDeductions(cycleId, { dryRun });
  console.log(JSON.stringify({
    ok: r.ok, reason: r.reason, cycleId: r.cycleId,
    scanned: r.scanned, affected: r.affected, dryRun: r.dryRun,
    skipped: r.skipped,
    details: (r.details || []).map((d) => ({
      employeeId: d.employeeId, employeeName: d.employeeName,
      expected: d.expected, actual: d.actual, missing: d.missing,
      rawScore: d.rawScore, cappedScore: d.cappedScore, action: d.action,
    })),
  }, null, 2));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
