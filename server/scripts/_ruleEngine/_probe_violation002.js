// 提示词-07 任务 C.1：VIOLATION002（violation_unrectified）备建适配器 dryRun 验证
// 全程 dryRun 零写入；验证「备建可用、当前零命中」（历史 128 条候选因 violator_id 全 NULL → scanned=0/intents=0）。
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { pool, testConnection, isConnected } = require('../../config/db');
const engine = require('../../services/ruleEngine/engine');

(async () => {
  await testConnection();
  if (!isConnected()) { console.error('DB 未连接'); process.exit(1); }
  engine.ensureAdaptersRegistered();

  // 诊断：候选集规模（仅统计，不写库）
  const raw = await pool.query(
    `SELECT COUNT(*)::int n FROM violation_records
      WHERE is_deleted=FALSE AND need_rectification='是'
        AND (rectification IS NULL OR btrim(rectification)='' OR rectification_time IS NULL)`);
  const rawWithKey = await pool.query(
    `SELECT COUNT(*)::int n FROM violation_records
      WHERE is_deleted=FALSE AND need_rectification='是'
        AND (rectification IS NULL OR btrim(rectification)='' OR rectification_time IS NULL)
        AND violator_id IS NOT NULL`);
  console.log('RAW_CANDIDATE(需整改未整改): ', JSON.stringify(raw.rows[0]));
  console.log('RAW_CANDIDATE_WITH_VIOLATOR_KEY: ', JSON.stringify(rawWithKey.rows[0]));

  // 显式以 violation_unrectified 适配器 dryRun 跑 cycle 24
  const res = await engine.runCycleAdapters(24, { adapterKeys: ['violation_unrectified'], dryRun: true });
  console.log('ADAPTER_RUN ok=%s dryRun=%s', res.ok, res.dryRun);
  for (const a of res.adapters) {
    console.log(`adapter=${a.key} ok=${a.ok} reason=${a.reason} scanned=${a.scanned} assessed=${a.assessed} affected=${a.affected} deducted=${a.deducted}`);
  }
  console.log('SCANNED=%s ASSESSED=%s INTENTS=%s REVOCATIONS=%s SKIPPED=%s',
    res.scanned, res.assessed, (res.details || []).length, 0, (res.skipped || []).length);
  console.log('SKIPPED_SAMPLE=', JSON.stringify((res.skipped || []).slice(0, 3)));
  console.log('VIOLATION002_DRYRUN_ZERO_WRITE_OK: ', res.ok && res.affected === 0 && res.scanned === 0);

  process.exit(res.ok && res.affected === 0 ? 0 : 2);
})().catch((e) => { console.error('PROBE ERROR', e && e.stack || e); process.exit(2); });
