/**
 * 风险快照重建 CLI（薄封装，逻辑在 services/riskSnapshotService.js）
 *   node scripts/rebuildRiskSnapshot.js            # dry-run：只读计算预览，不写表
 *   node scripts/rebuildRiskSnapshot.js --write     # 落库：upsert 写入 hse_employee_risk_snapshot（授权生产操作）
 * 等价管理接口：POST /api/hse/risk-snapshot-admin/rebuild  {action:'dry'|'write'}
 */
const { rebuildSnapshot } = require('../services/riskSnapshotService');
const WRITE = process.argv.includes('--write');

(async () => {
  const r = await rebuildSnapshot({ write: WRITE });
  console.log(`[${r.mode}] snapshotDate=${r.snapshotDate}`);
  console.log(`明细: 违章${r.counts.violation}(近12月${r.counts.violation12m}) / 三违${r.counts.threeViolation}(近12月${r.counts.threeViolation12m}) / 月度${r.counts.monthly} / 事故${r.counts.accident} / 隐患${r.counts.hazard} / 培训行${r.counts.trainingRows} / 网格${r.counts.grid}`);
  console.log(`身份: 硬关联${r.identity.hard}/姓名唯一${r.identity.unique}/重名跳过${r.identity.dup}/未命中${r.identity.missing}`);
  console.log(`待关联(重名): ${r.identity.dupNames.join(', ') || '无'}  待关联(未命中): ${r.identity.missNames.join(', ') || '无'}`);
  console.log(`评级员工 ${r.ratedEmployees} 人  等级 low${r.levelDistribution.low}/medium${r.levelDistribution.medium}/high${r.levelDistribution.high}/critical${r.levelDistribution.critical}`);
  if (r.wroteRows) { console.log(`落库 ${r.wroteRows} 行（落库前快照 ${r.beforeTotal} 行）  回滚: ${r.rollbackHint}`); }
  else { console.log('[dry-run] 未写入任何表。确认口径后请用 POST /rebuild {action:"write"} 或 --write 触发落库。'); }
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });