/**
 * P3-04-02｜迁移前最终门禁：双方案影响对撞（只读）
 *
 * 目的：在写库之前，把「方案 A（50 条 NULL 全部 → discovered）」与
 *       「方案 B（仅 9 条 → discovered，41 条保持 NULL）」两种终态的
 *       关键指标同时算出来，用同一套 SQL 对撞，避免用推断代替实测。
 *
 * 约束：仅 SELECT（含 CTE 内的 CASE 投影），零 DML、零 DDL。
 */
process.env.DB_NAME = 'safety_dashboard_dev';

const db = require('../config/db');
const q = (sql, params) => db.pool.query(sql, params);

// 方案 A：已完成 -> closed；NULL(全部) -> discovered
const MAP_A = `CASE WHEN status='已完成' THEN 'closed'
                    WHEN status IS NULL THEN 'discovered'
                    ELSE status END`;
// 方案 B：已完成 -> closed；仅 fixer+fix_date 的 NULL -> discovered；其余 NULL 保留
const MAP_B = `CASE WHEN status='已完成' THEN 'closed'
                    WHEN status IS NULL AND fixer IS NOT NULL AND fix_date IS NOT NULL THEN 'discovered'
                    ELSE status END`;

async function snapshot(mapExpr, label) {
  const out = { label };

  // 1) 生命周期四桶
  const buckets = (await q(`
    WITH m AS (SELECT ${mapExpr} AS s FROM hazards WHERE is_deleted = false)
    SELECT
      count(*) FILTER (WHERE s='discovered')::int AS discovered,
      count(*) FILTER (WHERE s='processing')::int AS processing,
      count(*) FILTER (WHERE s='pending_review')::int AS pending_review,
      count(*) FILTER (WHERE s='closed')::int AS closed,
      count(*) FILTER (WHERE s IS NULL)::int AS still_null,
      count(*) FILTER (WHERE s NOT IN ('discovered','processing','pending_review','closed'))::int AS non_canonical,
      count(*)::int AS total
    FROM m
  `)).rows[0];
  out.buckets = buckets;
  out.bucket_sum = buckets.discovered + buckets.processing + buckets.pending_review + buckets.closed;

  // 2) hazards.stats().overdueCount（复制 service 原 SQL 的谓词：status != 'closed'，NULL 会被丢弃）
  out.overdueCount = (await q(`
    WITH m AS (
      SELECT ${mapExpr} AS s, hazard_date, deadline_days
      FROM hazards WHERE is_deleted = false
    )
    SELECT count(*)::int AS n FROM m
     WHERE s <> 'closed'
       AND hazard_date IS NOT NULL
       AND hazard_date + (deadline_days || ' days')::interval < CURRENT_DATE
  `)).rows[0].n;

  // 3) overview.byStatus（GROUP BY 直出）
  out.byStatus = (await q(`
    WITH m AS (SELECT ${mapExpr} AS s FROM hazards WHERE is_deleted = false)
    SELECT coalesce(s,'<NULL>') AS k, count(*)::int AS n FROM m GROUP BY 1 ORDER BY 1
  `)).rows;

  // 4) overview.hazard.closed（status='closed'）
  out.hazard_closed = (await q(`
    WITH m AS (SELECT ${mapExpr} AS s FROM hazards WHERE is_deleted = false)
    SELECT count(*)::int AS n FROM m WHERE s='closed'
  `)).rows[0].n;

  // 5) todos hazard:overdue（sqlStatusOpen：NULL 视为未闭环）
  out.todos_overdue = (await q(`
    WITH m AS (
      SELECT ${mapExpr} AS s, hazard_date, deadline_days
      FROM hazards WHERE is_deleted = false
    )
    SELECT count(*)::int AS n FROM m
     WHERE (s IS NULL OR s NOT IN ('closed','已完成'))
       AND hazard_date IS NOT NULL
       AND hazard_date + (deadline_days || ' days')::interval < CURRENT_DATE
  `)).rows[0].n;

  // 6) R-01 rectificationStatus（hazards 部分；overdue/inProgress 来自 hse_rectifications，与迁移无关）
  out.r01 = (await q(`
    WITH m AS (SELECT ${mapExpr} AS s FROM hazards WHERE is_deleted = false)
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE s IN ('已完成','closed'))::int AS completed,
      count(*) FILTER (WHERE s = '未完成')::int AS pending
    FROM m
  `)).rows[0];

  // 7) AI 未整改 / 未知状态（analysisStatistics 口径：已闭环=closed/已完成，其余计未整改）
  out.ai = (await q(`
    WITH m AS (SELECT ${mapExpr} AS s FROM hazards WHERE is_deleted = false)
    SELECT
      count(*) FILTER (WHERE s NOT IN ('closed','已完成'))::int AS unrectified,
      count(*) FILTER (WHERE s IS NULL OR s NOT IN ('discovered','processing','pending_review','closed','已完成','未完成'))::int AS unknown_status
    FROM m
  `)).rows[0];

  return out;
}

(async () => {
  try {
    const who = await q('SELECT current_database() AS db, current_user AS usr, current_setting(\'TimeZone\') AS tz');
    if (who.rows[0].db !== 'safety_dashboard_dev') throw new Error(`目标库断言失败：${who.rows[0].db}`);
    console.log(`[DB] ${who.rows[0].db} / ${who.rows[0].usr} / TZ=${who.rows[0].tz}`);

    // 0) 文档断言核验
    const assert = {};
    assert.hazard_reviews_exists = (await q(`SELECT to_regclass('public.hazard_reviews') AS t`)).rows[0].t;
    assert.tables_like_review = (await q(`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND (table_name ILIKE '%review%' OR table_name ILIKE '%verify%')
       ORDER BY 1`)).rows.map((r) => r.table_name);
    for (const t of assert.tables_like_review) {
      const n = (await q(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n;
      assert[`rows_${t}`] = n;
    }
    assert.migration_review_queue = (await q(`SELECT to_regclass('public.migration_review_queue') AS t`)).rows[0].t;
    assert.rectification_task_rows = (await q(`SELECT count(*)::int AS n FROM rectification_task`)).rows[0].n;
    console.log('\n=== 文档断言核验 ===');
    console.log(JSON.stringify(assert, null, 2));

    // 1) 当前（未迁移）
    const now = await snapshot(`status`, '当前（未迁移）');
    // 2) 方案 A
    const A = await snapshot(MAP_A, '方案A：60 closed + 50 discovered');
    // 3) 方案 B（文档 §13/§14 目标）
    const B = await snapshot(MAP_B, '方案B：60 closed + 9 discovered + 41 NULL');

    const rows = [
      ['生命周期四桶合计', now.bucket_sum, A.bucket_sum, B.bucket_sum],
      ['  discovered', now.buckets.discovered, A.buckets.discovered, B.buckets.discovered],
      ['  processing', now.buckets.processing, A.buckets.processing, B.buckets.processing],
      ['  pending_review', now.buckets.pending_review, A.buckets.pending_review, B.buckets.pending_review],
      ['  closed', now.buckets.closed, A.buckets.closed, B.buckets.closed],
      ['  仍为 NULL', now.buckets.still_null, A.buckets.still_null, B.buckets.still_null],
      ['  非 canonical', now.buckets.non_canonical, A.buckets.non_canonical, B.buckets.non_canonical],
      ['total（应恒 110）', now.buckets.total, A.buckets.total, B.buckets.total],
      ['overdueCount（stats）', now.overdueCount, A.overdueCount, B.overdueCount],
      ['todos hazard:overdue', now.todos_overdue, A.todos_overdue, B.todos_overdue],
      ['overview hazard.closed', now.hazard_closed, A.hazard_closed, B.hazard_closed],
      ['R-01 completed', now.r01.completed, A.r01.completed, B.r01.completed],
      ['R-01 pending', now.r01.pending, A.r01.pending, B.r01.pending],
      ['AI unrectified', now.ai.unrectified, A.ai.unrectified, B.ai.unrectified],
      ['AI unknown_status', now.ai.unknown_status, A.ai.unknown_status, B.ai.unknown_status],
    ];

    console.log('\n=== 指标对撞（当前 / 方案A / 方案B）===');
    console.log('项目'.padEnd(28) + '当前'.padStart(8) + '方案A'.padStart(8) + '方案B'.padStart(8));
    for (const [k, a, b, c] of rows) {
      console.log(String(k).padEnd(28) + String(a).padStart(8) + String(b).padStart(8) + String(c).padStart(8));
    }

    console.log('\n=== byStatus 键 ===');
    console.log('当前 :', JSON.stringify(now.byStatus));
    console.log('方案A:', JSON.stringify(A.byStatus));
    console.log('方案B:', JSON.stringify(B.byStatus));

    // 4) 方案 B 的三项硬性矛盾自查
    const contradictions = {
      'B: 四桶合计 = total ?': B.bucket_sum === B.buckets.total,
      'B: 无 NULL 残留 ?': B.buckets.still_null === 0,
      'B: overdueCount 命中冻结基线 50 ?': B.overdueCount === 50,
      'A: 四桶合计 = total ?': A.bucket_sum === A.buckets.total,
      'A: 无 NULL 残留 ?': A.buckets.still_null === 0,
      'A: overdueCount 命中冻结基线 50 ?': A.overdueCount === 50,
    };
    console.log('\n=== 终态自洽检查 ===');
    for (const [k, v] of Object.entries(contradictions)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
  } catch (e) {
    console.error('[PREFLIGHT-ERROR]', e.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end().catch(() => {});
  }
})();
