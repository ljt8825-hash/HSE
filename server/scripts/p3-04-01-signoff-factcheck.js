/**
 * P3-04-01｜历史隐患状态迁移业务签核包 —— 事实核验（只读）
 *
 * ⚠ 本脚本断言的是【迁移前】基线（已完成 60 / NULL 50 / discovered 0 / overdue 60）。
 *   P3-04-02 迁移已执行后，本脚本会按设计失败（现有 60 closed / 50 discovered）。
 *   迁移后的权威验收请跑：scripts/p3-04-02-post-verify.js（31 项）与
 *   scripts/p3-04-02-endpoint-verify.js（18 项）。
 *   保留本脚本是为了留下"迁移前基线"的可复现证据，不要据此判断当前数据库异常。
 *
 * 用途：在业务签核前，逐项复算签核包中出现的每一个数字，避免签核包自身失真。
 * 约束：
 *   1. 强制锁定 safety_dashboard_dev，并断言 current_database()，否则退出；
 *   2. 仅执行 SELECT / 元数据查询，禁止任何 INSERT / UPDATE / DELETE / DDL；
 *   3. 不做迁移模拟写入，迁移后数值用 CASE 表达式在 SELECT 内推导。
 *
 * 运行：node server/scripts/p3-04-01-signoff-factcheck.js
 */
process.env.DB_NAME = 'safety_dashboard_dev';

const db = require('../config/db');
const q = (sql, params) => db.pool.query(sql, params);

const checks = [];
function expect(label, actual, wanted) {
  const pass = JSON.stringify(actual) === JSON.stringify(wanted);
  checks.push({ label, actual, wanted, pass });
  return pass;
}

(async () => {
  try {
    const who = await q('SELECT current_database() AS db, current_user AS usr');
    if (who.rows[0].db !== 'safety_dashboard_dev') {
      throw new Error(`目标库断言失败：${who.rows[0].db}`);
    }
    console.log(`[DB] ${who.rows[0].db} / ${who.rows[0].usr}`);

    // ---------- 1. 存量规模 ----------
    const scale = (await q(`
      SELECT
        (SELECT count(*)::int FROM information_schema.tables
          WHERE table_schema='public' AND table_type='BASE TABLE') AS public_base_tables,
        (SELECT count(*)::int FROM information_schema.tables
          WHERE table_schema='public') AS public_tables_incl_views,
        (SELECT count(*)::int FROM information_schema.columns
          WHERE table_schema='public' AND table_name='hazards') AS hazard_columns,
        (SELECT count(*)::int FROM hazards WHERE is_deleted=false) AS hazard_rows,
        (SELECT max(created_at) FROM hazards) AS max_created_at
    `)).rows[0];
    console.log('[1] 存量规模', JSON.stringify(scale));

    expect('hazards 行数 = 110', scale.hazard_rows, 110);
    expect('hazards 列数 = 46', scale.hazard_columns, 46);
    expect('public 基表 = 352', scale.public_base_tables, 352);
    expect('public 含视图 = 365', scale.public_tables_incl_views, 365);
    expect('视图数 = 13', scale.public_tables_incl_views - scale.public_base_tables, 13);
    expect('max(created_at)', new Date(scale.max_created_at).toISOString(), '2026-08-24T15:36:23.420Z');

    // ---------- 2. status 分布 ----------
    const dist = (await q(`
      SELECT
        count(*) FILTER (WHERE status='已完成')::int AS done_zh,
        count(*) FILTER (WHERE status IS NULL)::int AS null_status,
        count(*) FILTER (WHERE status='closed')::int AS closed_en,
        count(*) FILTER (WHERE status='未完成')::int AS pending_zh,
        count(*) FILTER (WHERE status NOT IN ('已完成','closed','未完成') AND status IS NOT NULL)::int AS other
      FROM hazards WHERE is_deleted=false
    `)).rows[0];
    console.log('[2] status 分布', JSON.stringify(dist));
    expect('已完成 = 60', dist.done_zh, 60);
    expect('NULL = 50', dist.null_status, 50);
    expect('closed(EN) = 0', dist.closed_en, 0);
    expect('未完成 = 0', dist.pending_zh, 0);
    expect('其他状态 = 0', dist.other, 0);

    // ---------- 3. NULL 50 条特征拆分 ----------
    const nullSplit = (await q(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE fixer IS NULL AND fix_date IS NULL)::int AS no_fixer_no_date,
        count(*) FILTER (WHERE fixer IS NOT NULL AND fix_date IS NULL)::int AS fixer_only,
        count(*) FILTER (WHERE fixer IS NOT NULL AND fix_date IS NOT NULL)::int AS fixer_and_date,
        count(*) FILTER (WHERE fixer IS NULL AND fix_date IS NOT NULL)::int AS date_only,
        count(*) FILTER (WHERE verify_user IS NOT NULL)::int AS verify_user_notnull,
        count(*) FILTER (WHERE verify_date IS NOT NULL)::int AS verify_date_notnull,
        count(*) FILTER (WHERE review_date IS NOT NULL)::int AS review_date_notnull,
        count(*) FILTER (WHERE review_result IS NOT NULL)::int AS review_result_notnull,
        count(*) FILTER (WHERE rectify_date IS NOT NULL)::int AS rectify_date_notnull,
        count(*) FILTER (WHERE actual_rectify_date IS NOT NULL)::int AS actual_rectify_notnull,
        count(*) FILTER (WHERE btrim(coalesce(measure,'')) <> '')::int AS has_measure
      FROM hazards WHERE is_deleted=false AND status IS NULL
    `)).rows[0];
    console.log('[3] NULL 50 条拆分', JSON.stringify(nullSplit));
    expect('NULL 总数 = 50', nullSplit.total, 50);
    expect('无整改人无日期 = 13', nullSplit.no_fixer_no_date, 13);
    expect('有整改人无日期 = 28', nullSplit.fixer_only, 28);
    expect('有整改人有日期 = 9', nullSplit.fixer_and_date, 9);
    expect('有日期无整改人 = 0', nullSplit.date_only, 0);
    expect('NULL 行无任何验收痕迹', [
      nullSplit.verify_user_notnull, nullSplit.verify_date_notnull,
      nullSplit.review_date_notnull, nullSplit.review_result_notnull,
      nullSplit.rectify_date_notnull, nullSplit.actual_rectify_notnull,
    ], [0, 0, 0, 0, 0, 0]);

    // ---------- 4. 60 条「已完成」验收痕迹 ----------
    const doneTrace = (await q(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE verify_user IS NOT NULL)::int AS verify_user_notnull,
        count(*) FILTER (WHERE verify_date IS NOT NULL)::int AS verify_date_notnull,
        count(*) FILTER (WHERE reviewer_id IS NOT NULL)::int AS reviewer_id_notnull,
        count(*) FILTER (WHERE review_date IS NOT NULL)::int AS review_date_notnull,
        count(*) FILTER (WHERE review_result IS NOT NULL)::int AS review_result_notnull,
        count(*) FILTER (WHERE rectify_date IS NOT NULL)::int AS rectify_date_notnull,
        count(*) FILTER (WHERE actual_rectify_date IS NOT NULL)::int AS actual_rectify_notnull,
        count(*) FILTER (WHERE fixer IS NOT NULL AND fix_date IS NOT NULL)::int AS fixer_and_date
      FROM hazards WHERE is_deleted=false AND status='已完成'
    `)).rows[0];
    console.log('[4] 60 条已完成痕迹', JSON.stringify(doneTrace));
    expect('已完成 = 60', doneTrace.total, 60);
    expect('已完成全部有整改人+整改日期', doneTrace.fixer_and_date, 60);
    expect('已完成行无任何验收痕迹', [
      doneTrace.verify_user_notnull, doneTrace.verify_date_notnull,
      doneTrace.reviewer_id_notnull, doneTrace.review_date_notnull,
      doneTrace.review_result_notnull, doneTrace.rectify_date_notnull,
      doneTrace.actual_rectify_notnull,
    ], [0, 0, 0, 0, 0, 0, 0]);

    // ---------- 5. 9 条批次特征 ----------
    const nine = (await q(`
      SELECT count(*)::int AS n,
             count(DISTINCT fix_date)::int AS distinct_fix_date,
             min(fix_date)::text AS fix_date_value,
             min(id)::text AS min_id, max(id)::text AS max_id
        FROM hazards
       WHERE is_deleted=false AND status IS NULL
         AND fixer IS NOT NULL AND fix_date IS NOT NULL
    `)).rows[0];
    console.log('[5] 9 条批次特征', JSON.stringify(nine));
    expect('9 条 fix_date 唯一值 = 1', nine.distinct_fix_date, 1);
    expect('9 条 fix_date = 2026-05-27', nine.fix_date_value, '2026-05-27');

    const fixerSpread = (await q(`
      SELECT count(DISTINCT fixer)::int AS distinct_fixer,
             count(*) FILTER (WHERE fixer IS NOT NULL)::int AS with_fixer
        FROM hazards WHERE is_deleted=false
    `)).rows[0];
    console.log('[5b] fixer 覆盖', JSON.stringify(fixerSpread));

    // ---------- 6. 迁移后状态推导（纯 SELECT，不写库）----------
    const after = (await q(`
      WITH mapped AS (
        SELECT id,
               CASE
                 WHEN status='已完成' OR status='closed' THEN 'closed'
                 WHEN status IS NULL OR status='未完成' THEN 'discovered'
                 ELSE status
               END AS cs
          FROM hazards WHERE is_deleted=false
      )
      SELECT count(*) FILTER (WHERE cs='discovered')::int AS discovered,
             count(*) FILTER (WHERE cs='processing')::int AS processing,
             count(*) FILTER (WHERE cs='pending_review')::int AS pending_review,
             count(*) FILTER (WHERE cs='closed')::int AS closed,
             count(*)::int AS total
        FROM mapped
    `)).rows[0];
    console.log('[6] 迁移后状态推导', JSON.stringify(after));
    expect('迁移后 discovered = 50', after.discovered, 50);
    expect('迁移后 closed = 60', after.closed, 60);
    expect('迁移后总数 = 110', after.total, 110);

    // ---------- 7. overdueCount 迁移前后 ----------
    const odBefore = (await q(`
      SELECT count(*)::int AS total FROM hazards h
       WHERE h.is_deleted=false AND h.status <> 'closed'
         AND h.hazard_date IS NOT NULL
         AND h.hazard_date + (h.deadline_days || ' days')::interval < CURRENT_DATE
    `)).rows[0].total;
    const odAfter = (await q(`
      SELECT count(*)::int AS total FROM hazards h
       WHERE h.is_deleted=false
         AND (CASE WHEN h.status='已完成' OR h.status='closed' THEN 'closed' ELSE 'open' END) <> 'closed'
         AND h.hazard_date IS NOT NULL
         AND h.hazard_date + (h.deadline_days || ' days')::interval < CURRENT_DATE
    `)).rows[0].total;
    console.log('[7] overdueCount', { before: odBefore, after: odAfter });
    expect('overdueCount 迁移前 = 60', odBefore, 60);
    expect('overdueCount 迁移后 = 50', odAfter, 50);

    // ---------- 8. R-01 五项（复刻 hseAssessmentAnalysisService.deduction SQL）----------
    const r01 = (await q(`
      SELECT
        (SELECT COUNT(*) FROM hazards WHERE is_deleted = false)::int AS total,
        (SELECT COUNT(*) FROM hazards WHERE is_deleted = false AND status IN ('已完成','closed'))::int AS completed,
        (SELECT COUNT(*) FROM hazards WHERE is_deleted = false AND status = '未完成')::int AS pending,
        (SELECT COUNT(*) FROM hse_rectifications WHERE is_deleted = false AND is_overdue = true)::int AS overdue,
        (SELECT COUNT(*) FROM hse_rectifications WHERE is_deleted = false AND status IN ('进行中','整改中'))::int AS in_progress
    `)).rows[0];
    console.log('[8] R-01', JSON.stringify(r01));
    expect('R-01 五项', [r01.total, r01.completed, r01.pending, r01.overdue, r01.in_progress], [110, 60, 0, 0, 0]);

    // ---------- 9. 驾驶舱 byStatus / closed 迁移前后 ----------
    const cockpitBefore = (await q(`
      SELECT (SELECT count(*)::int FROM hazards WHERE is_deleted=false AND status='closed') AS closed_card,
             (SELECT count(*)::int FROM hazards WHERE is_deleted=false AND status IS NULL) AS null_bucket
    `)).rows[0];
    console.log('[9] 驾驶舱迁移前', JSON.stringify(cockpitBefore));
    expect('驾驶舱 closed 卡片迁移前 = 0', cockpitBefore.closed_card, 0);
    expect('驾驶舱 null 桶 = 50', cockpitBefore.null_bucket, 50);

    // ---------- 10. migration_review_queue 是否存在 ----------
    const mq = (await q(`SELECT to_regclass('public.migration_review_queue') AS t`)).rows[0].t;
    console.log('[10] migration_review_queue to_regclass =', mq);
    expect('migration_review_queue 表不存在', mq, null);

    // ---------- 11. status 列定义 ----------
    const col = (await q(`
      SELECT is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema='public' AND table_name='hazards' AND column_name='status'
    `)).rows[0];
    console.log('[11] hazards.status 定义', JSON.stringify(col));
    expect('status DEFAULT = discovered', /^'discovered'/.test(col.column_default || ''), true);
    expect('status 仍可 NULL', col.is_nullable, 'YES');

    // ---------- 12. rectification_task 存量 ----------
    const rt = (await q(`SELECT count(*)::int AS n FROM rectification_task`)).rows[0].n;
    console.log('[12] rectification_task 行数 =', rt);
    expect('rectification_task 行数 = 0', rt, 0);

    // ---------- 汇总 ----------
    const failed = checks.filter((c) => !c.pass);
    console.log('\n===== 核验汇总 =====');
    for (const c of checks) {
      console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.label}  (实际=${JSON.stringify(c.actual)} 期望=${JSON.stringify(c.wanted)})`);
    }
    console.log(`\nTOTAL=${checks.length}  PASS=${checks.length - failed.length}  FAIL=${failed.length}`);
    if (failed.length) process.exitCode = 1;
  } catch (e) {
    console.error('[FACTCHECK-ERROR]', e.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end().catch(() => {});
  }
})();
