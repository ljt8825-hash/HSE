const { pool } = require('../config/db');
(async () => {
  const cats = ['目标职责', 'HSE教育培训', '\u201c三违\u201d管理', '否决项'];
  const cols = [
    'rule_code', 'rule_name', 'category', 'source_table', 'source_route',
    'trigger_type', 'adapter_key', 'integration_status', 'integration_note',
    'last_run_at', 'deduct_type', 'status'
  ];
  for (const cat of cats) {
    const r = await pool.query(
      `SELECT ${cols.join(',')} FROM hse_assessment_rule
        WHERE is_deleted = FALSE AND status <> 'disabled' AND category = $1 ORDER BY id`,
      [cat]
    );
    const rows = r.rows || [];
    console.log('===== 类别:', cat, '（启用规则', rows.length, '条）=====');
    for (const x of rows) {
      console.log('  [' + (x.rule_code || '-') + '] ' + (x.rule_name || '') +
        ' | 触发=' + x.trigger_type +
        ' | 表=' + (x.source_table || '-') +
        ' | 适配器=' + (x.adapter_key || '-') +
        ' | 接入=' + (x.integration_status || '-') +
        ' | 说明=' + (x.integration_note || '-') +
        ' | 最近运行=' + (x.last_run_at || '-'));
    }
  }

  // 管理员对象在各周期是否有扣分（看 deductions 按 category 汇总）
  console.log('\n===== 各周期 管理员(position=管理员) 扣分明细按类别汇总 =====');
  const ded = await pool.query(
    `SELECT d.cycle_id, d.category, COUNT(*)::int AS n, ROUND(SUM(COALESCE(d.current_score, d.suggested_score, 0))::numeric,2) AS sum
       FROM hse_assessment_deduction d
       WHERE d.category IS NOT NULL AND d.category <> '' AND d.is_deleted = FALSE
       GROUP BY d.cycle_id, d.category
       ORDER BY d.cycle_id, d.category`
  );
  const cycleInfo = {};
  try {
    const c = await pool.query('SELECT id, cycle_name, status FROM hse_assessment_cycle ORDER BY id');
    for (const x of c.rows) cycleInfo[x.id] = x.cycle_name + ' [' + x.status + ']';
  } catch (_) {}
  for (const x of (ded.rows || [])) {
    console.log('  周期' + x.cycle_id + ' (' + (cycleInfo[x.cycle_id] || '?' ) + ') 类别[' + x.category + ']: ' + x.n + '条/合计' + x.sum);
  }
  process.exit(0);
})().catch((e) => { console.log('DB ERR', e.message); process.exit(1); });