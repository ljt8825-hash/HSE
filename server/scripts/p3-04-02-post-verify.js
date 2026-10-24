/**
 * P3-04-02｜迁移后验收（只读，调用真实 service + 真实 SQL）
 *
 * 对照 P3-04-01.2 §18 验收标准：
 *   hazards total=110 / closed=60 / discovered=50 / NULL=0
 *   非法状态=0 / 中文生命周期状态=0
 *   核心读路径（stats / overview / todos / reminders / AI）数值符合冻结基线
 */
process.env.DB_NAME = 'safety_dashboard_dev';

const db = require('../config/db');
const q = (sql, params) => db.pool.query(sql, params);
const hazardService = require('../services/hazardService');

const checks = [];
function expect(label, actual, wanted) {
  const pass = JSON.stringify(actual) === JSON.stringify(wanted);
  checks.push({ label, actual, wanted, pass });
}

(async () => {
  try {
    const who = (await q('SELECT current_database() AS db, current_user AS usr')).rows[0];
    if (who.db !== 'safety_dashboard_dev') throw new Error(`库断言失败：${who.db}`);
    console.log(`[DB] ${who.db} / ${who.usr}\n`);

    // ⚠ 必须先建连：hazardService 内部走 isConnected() 判定，
    // 未调用 testConnection() 时会静默降级为「内存模式」返回全 0（HTTP 200 + 空数据），
    // 极易被误判为「迁移把数据清了」。
    await db.testConnection();

    // ---------- 1. 存量与状态分布 ----------
    const dist = (await q(`
      SELECT coalesce(status,'<NULL>') AS k, count(*)::int AS n
        FROM hazards WHERE is_deleted=false GROUP BY 1 ORDER BY 1`)).rows;
    console.log('[1] 状态分布:', JSON.stringify(dist));

    const agg = (await q(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE status='discovered')::int AS discovered,
             count(*) FILTER (WHERE status='closed')::int AS closed,
             count(*) FILTER (WHERE status IS NULL)::int AS null_status,
             count(*) FILTER (WHERE status NOT IN ('discovered','processing','pending_review','closed'))::int AS non_canonical,
             count(*) FILTER (WHERE status IN ('已完成','未完成','处理中','已整改','已验收','已关闭','CLOSED'))::int AS chinese_or_upper
        FROM hazards WHERE is_deleted=false`)).rows[0];
    console.log('[1b] 汇总:', JSON.stringify(agg));

    expect('total = 110', agg.total, 110);
    expect('closed = 60', agg.closed, 60);
    expect('discovered = 50', agg.discovered, 50);
    expect('NULL 残留 = 0', agg.null_status, 0);
    expect('非 canonical = 0', agg.non_canonical, 0);
    expect('中文/大写生命周期值 = 0', agg.chinese_or_upper, 0);

    // ---------- 2. 非 status 字段零改动 ----------
    const ts = (await q(`
      SELECT min(updated_at)::text AS min_u, max(updated_at)::text AS max_u,
             max(created_at)::text AS max_c
        FROM hazards WHERE is_deleted=false`)).rows[0];
    console.log('[2] 时间字段:', JSON.stringify(ts));
    expect('max(created_at) 未变', ts.max_c, '2026-08-24 23:36:23.420706');
    expect('max(updated_at) 未变', ts.max_u, '2026-08-25 07:58:27.198297');
    expect('min(updated_at) 未变', ts.min_u, '2026-08-24 23:36:23.249943');

    // 迁移前后「业务内容字段」抽样守恒：90 天内 fixer 覆盖与 fix_date 去重数不应变化
    const biz = (await q(`
      SELECT count(*) FILTER (WHERE fixer IS NOT NULL)::int AS with_fixer,
             count(DISTINCT fix_date)::int AS distinct_fix_date,
             count(*) FILTER (WHERE verify_user IS NOT NULL)::int AS verify_user_notnull,
             count(*) FILTER (WHERE review_result IS NOT NULL)::int AS review_result_notnull
        FROM hazards WHERE is_deleted=false`)).rows[0];
    console.log('[2b] 业务字段:', JSON.stringify(biz));
    expect('fixer 覆盖未变 = 97', biz.with_fixer, 97);
    expect('fix_date 去重未变 = 20', biz.distinct_fix_date, 20);
    expect('verify_user 仍为 0', biz.verify_user_notnull, 0);
    expect('review_result 仍为 0', biz.review_result_notnull, 0);

    // ---------- 3. 真实 service：hazards.stats() ----------
    const st = await hazardService.stats();
    const p = st && st.payload ? st.payload : st;
    console.log('\n[3] hazardService.stats():', JSON.stringify({
      total: p.total, discovered: p.discovered, processing: p.processing,
      pendingReview: p.pendingReview, closed: p.closed, overdueCount: p.overdueCount,
    }));
    expect('stats.total = 110', p.total, 110);
    expect('stats.discovered = 50', p.discovered, 50);
    expect('stats.closed = 60', p.closed, 60);
    expect('stats.processing = 0', p.processing, 0);
    expect('stats.pendingReview = 0', p.pendingReview, 0);
    expect('stats.overdueCount = 50', p.overdueCount, 50);

    // ---------- 4. 真实 service：remindersOverdue ----------
    const ro = await hazardService.remindersOverdue();
    const rop = ro && ro.payload ? ro.payload : ro;
    console.log('[4] remindersOverdue.total =', rop.total);
    expect('remindersOverdue = 50', rop.total, 50);

    // ---------- 5. overview.byStatus / hazard.closed ----------
    const byStatus = (await q(`
      SELECT coalesce(status,'<NULL>') AS k, count(*)::int AS n
        FROM hazards WHERE is_deleted=false GROUP BY 1 ORDER BY 1`)).rows;
    const closedCard = (await q(`
      SELECT count(*)::int AS n FROM hazards WHERE is_deleted=false AND status='closed'`)).rows[0].n;
    console.log('[5] overview.byStatus =', JSON.stringify(byStatus), '| hazard.closed =', closedCard);
    expect('byStatus 仅两个键', byStatus.map((r) => r.k), ['closed', 'discovered']);
    expect('byStatus.closed = 60', byStatus.find((r) => r.k === 'closed').n, 60);
    expect('byStatus.discovered = 50', byStatus.find((r) => r.k === 'discovered').n, 50);
    expect('hazard.closed = 60', closedCard, 60);

    // ---------- 6. todos hazard:overdue（sqlStatusOpen，NULL 视为未闭环）----------
    const todoOverdue = (await q(`
      SELECT count(*)::int AS n FROM hazards h
       WHERE h.is_deleted=false
         AND (h.status IS NULL OR h.status NOT IN ('closed','已完成'))
         AND h.hazard_date IS NOT NULL
         AND h.hazard_date + (h.deadline_days || ' days')::interval < CURRENT_DATE`)).rows[0].n;
    console.log('[6] todos hazard:overdue =', todoOverdue);
    expect('todos hazard:overdue = 50', todoOverdue, 50);

    // ---------- 7. AI 未整改 / 未知状态 ----------
    const ai = (await q(`
      SELECT count(*) FILTER (WHERE status NOT IN ('closed','已完成'))::int AS unrectified,
             count(*) FILTER (WHERE status IS NULL OR status NOT IN
               ('discovered','processing','pending_review','closed','已完成','未完成'))::int AS unknown_status
        FROM hazards WHERE is_deleted=false`)).rows[0];
    console.log('[7] AI unrectified =', ai.unrectified, '| unknown_status =', ai.unknown_status);
    expect('AI 未整改 = 50', ai.unrectified, 50);
    expect('AI 未知状态 = 0', ai.unknown_status, 0);

    // ---------- 8. R-01 ----------
    const r01 = (await q(`
      SELECT (SELECT COUNT(*) FROM hazards WHERE is_deleted=false)::int AS total,
             (SELECT COUNT(*) FROM hazards WHERE is_deleted=false AND status IN ('已完成','closed'))::int AS completed,
             (SELECT COUNT(*) FROM hazards WHERE is_deleted=false AND status='未完成')::int AS pending,
             (SELECT COUNT(*) FROM hse_rectifications WHERE is_deleted=false AND is_overdue=true)::int AS overdue,
             (SELECT COUNT(*) FROM hse_rectifications WHERE is_deleted=false AND status IN ('进行中','整改中'))::int AS in_progress`)).rows[0];
    console.log('[8] R-01 =', JSON.stringify(r01));
    expect('R-01 五项', [r01.total, r01.completed, r01.pending, r01.overdue, r01.in_progress], [110, 60, 0, 0, 0]);

    // ---------- 9. 未被本次迁移牵连的域 ----------
    const others = (await q(`
      SELECT (SELECT count(*)::int FROM rectification_task) AS rectification_task,
             (SELECT count(*)::int FROM review_record) AS review_record,
             (SELECT count(*)::int FROM hse_reviews) AS hse_reviews`)).rows[0];
    console.log('[9] 未牵连域:', JSON.stringify(others));
    expect('rectification_task 仍 0', others.rectification_task, 0);
    expect('review_record 仍 1', others.review_record, 1);
    expect('hse_reviews 仍 0', others.hse_reviews, 0);

    // ---------- 汇总 ----------
    const failed = checks.filter((c) => !c.pass);
    console.log('\n===== 验收汇总 =====');
    for (const c of checks) {
      console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.label}  (实际=${JSON.stringify(c.actual)} 期望=${JSON.stringify(c.wanted)})`);
    }
    console.log(`\nTOTAL=${checks.length}  PASS=${checks.length - failed.length}  FAIL=${failed.length}`);
    if (failed.length) process.exitCode = 1;
  } catch (e) {
    console.error('[VERIFY-ERROR]', e.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end().catch(() => {});
  }
})();
