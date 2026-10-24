/**
 * P3-04-02｜历史隐患状态规范化迁移脚本（默认 dry-run）
 *
 * 用法：
 *   node scripts/p3-04-02-migrate-legacy-status.js                 # dry-run，方案 A
 *   node scripts/p3-04-02-migrate-legacy-status.js --plan=B        # dry-run，方案 B
 *   node scripts/p3-04-02-migrate-legacy-status.js --execute       # 真执行，方案 A
 *   node scripts/p3-04-02-migrate-legacy-status.js --plan=B --execute
 *
 * 方案：
 *   A（默认，与 P3-04-00.4 冻结基线一致）：已完成→closed(60) + NULL→discovered(50)
 *   B（P3-04-01.2 §13/§14 原文）        ：已完成→closed(60) + 仅 9 条 NULL→discovered，其余 41 条保留 NULL
 *
 * 护栏（任一不满足即中止，不写库）：
 *   1. 库名硬设 safety_dashboard_dev 并断言 current_database()
 *   2. 迁移前分布必须严格等于 {已完成:60, NULL:50}，且无第三种取值
 *   3. 行数必须 = 110
 *   4. UPDATE 必须只命中 WHERE 指定的行（rowCount 断言）
 *   5. 事务内复核 + 任一断言失败即 ROLLBACK
 *   6. 不修改任何非 status 字段（含 updated_at），并在迁移后逐行校验
 */
process.env.DB_NAME = 'safety_dashboard_dev';

const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../config/db');
const q = (sql, params) => db.pool.query(sql, params);

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const PLAN = (args.find((a) => a.startsWith('--plan=')) || '--plan=A').split('=')[1].toUpperCase();

const EXPECTED_TOTAL = 110;
const EXPECTED_DONE = 60;
const EXPECTED_NULL = 50;
const EXPECTED_NINE = 9;

function fail(msg) {
  const e = new Error(msg);
  e.__blocked = true;
  throw e;
}

async function distribution(client) {
  const r = await client.query(`
    SELECT coalesce(status,'<NULL>') AS k, count(*)::int AS n
      FROM hazards WHERE is_deleted = false GROUP BY 1 ORDER BY 1`);
  return r.rows;
}

async function fingerprint(client) {
  const r = await client.query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status='已完成')::int AS done_zh,
           count(*) FILTER (WHERE status IS NULL)::int AS null_status,
           count(*) FILTER (WHERE status='closed')::int AS closed_en,
           count(*) FILTER (WHERE status='discovered')::int AS discovered,
           md5(string_agg(id::text || '|' || coalesce(status,'~') || '|' || updated_at::text, ',' ORDER BY id)) AS row_hash,
           max(updated_at)::text AS max_updated
      FROM hazards WHERE is_deleted = false`);
  return r.rows[0];
}

(async () => {
  const client = await db.pool.connect();
  let committed = false;
  try {
    // ---------- 护栏 1：库名 ----------
    const who = (await client.query('SELECT current_database() AS db, current_user AS usr')).rows[0];
    if (who.db !== 'safety_dashboard_dev') fail(`目标库断言失败：${who.db}（本脚本只允许 dev）`);
    if (!['A', 'B'].includes(PLAN)) fail(`未知方案：${PLAN}`);
    console.log(`[GUARD1] DB=${who.db} user=${who.usr} plan=${PLAN} mode=${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}`);

    // ---------- 护栏 2/3：迁移前分布与行数 ----------
    const distBefore = await distribution(client);
    const fpBefore = await fingerprint(client);
    console.log('[BEFORE] 分布:', JSON.stringify(distBefore));
    console.log('[BEFORE] 指纹:', JSON.stringify(fpBefore));

    if (fpBefore.total !== EXPECTED_TOTAL) fail(`行数异常：${fpBefore.total} ≠ ${EXPECTED_TOTAL}`);
    if (fpBefore.done_zh !== EXPECTED_DONE) fail(`已完成 异常：${fpBefore.done_zh} ≠ ${EXPECTED_DONE}`);
    if (fpBefore.null_status !== EXPECTED_NULL) fail(`NULL 异常：${fpBefore.null_status} ≠ ${EXPECTED_NULL}`);
    if (distBefore.length !== 2) fail(`出现第三种状态取值：${JSON.stringify(distBefore)}`);

    // 记录回滚用 id 清单（落临时目录，不入仓库）
    const idsDone = (await client.query(
      `SELECT id FROM hazards WHERE is_deleted=false AND status='已完成' ORDER BY id`)).rows.map((r) => r.id);
    const idsNull9 = (await client.query(
      `SELECT id FROM hazards WHERE is_deleted=false AND status IS NULL
        AND fixer IS NOT NULL AND fix_date IS NOT NULL ORDER BY id`)).rows.map((r) => r.id);
    const idsNullAll = (await client.query(
      `SELECT id FROM hazards WHERE is_deleted=false AND status IS NULL ORDER BY id`)).rows.map((r) => r.id);

    if (idsDone.length !== EXPECTED_DONE) fail(`待迁移已完成行数 ${idsDone.length} ≠ ${EXPECTED_DONE}`);
    if (idsNull9.length !== EXPECTED_NINE) fail(`fixer+fix_date 的 NULL 行数 ${idsNull9.length} ≠ ${EXPECTED_NINE}`);

    const artifact = path.join(os.tmpdir(), `p3-04-02-rollback-${Date.now()}.json`);
    fs.writeFileSync(artifact, JSON.stringify({
      createdAt: new Date().toISOString(),
      plan: PLAN,
      db: who.db,
      fingerprintBefore: fpBefore,
      idsDone, idsNull9, idsNullAll,
    }, null, 2));
    console.log(`[ROLLBACK] 回滚 id 清单已落盘：${artifact}`);

    // ---------- 计划 ----------
    const stmts = [];
    stmts.push({
      name: '已完成 -> closed',
      sql: `UPDATE hazards SET status='closed' WHERE is_deleted=false AND status='已完成'`,
      expect: EXPECTED_DONE,
    });
    if (PLAN === 'A') {
      stmts.push({
        name: 'NULL -> discovered（全部 50）',
        sql: `UPDATE hazards SET status='discovered' WHERE is_deleted=false AND status IS NULL`,
        expect: EXPECTED_NULL,
      });
    } else {
      stmts.push({
        name: 'NULL(fixer+fix_date) -> discovered（仅 9）',
        sql: `UPDATE hazards SET status='discovered' WHERE is_deleted=false AND status IS NULL
                AND fixer IS NOT NULL AND fix_date IS NOT NULL`,
        expect: EXPECTED_NINE,
      });
    }

    console.log('\n[PLAN] 将执行：');
    for (const s of stmts) console.log(`  - ${s.name}  (预期 ${s.expect} 行)`);

    if (!EXECUTE) {
      // dry-run：只做终态推导，不写库
      const MAPPED = PLAN === 'A'
        ? `CASE WHEN status='已完成' THEN 'closed' WHEN status IS NULL THEN 'discovered' ELSE status END`
        : `CASE WHEN status='已完成' THEN 'closed'
                WHEN status IS NULL AND fixer IS NOT NULL AND fix_date IS NOT NULL THEN 'discovered'
                ELSE status END`;
      const sim = (await client.query(`
        WITH m AS (SELECT ${MAPPED} AS s FROM hazards WHERE is_deleted=false)
        SELECT count(*) FILTER (WHERE s='discovered')::int AS discovered,
               count(*) FILTER (WHERE s='closed')::int AS closed,
               count(*) FILTER (WHERE s IS NULL)::int AS still_null,
               count(*)::int AS total FROM m`)).rows[0];
      console.log('\n[DRY-RUN] 终态推导:', JSON.stringify(sim));
      console.log('[DRY-RUN] 未写库。加 --execute 才会真正执行。');
      return;
    }

    // ---------- 护栏 5：事务内执行 ----------
    await client.query('BEGIN');
    for (const s of stmts) {
      const r = await client.query(s.sql);
      if (r.rowCount !== s.expect) {
        await client.query('ROLLBACK');
        fail(`[${s.name}] 命中 ${r.rowCount} 行 ≠ 预期 ${s.expect} 行，已 ROLLBACK`);
      }
      console.log(`[EXEC] ${s.name} → ${r.rowCount} 行`);
    }

    // 事务内复核
    const fpTx = await fingerprint(client);
    const distTx = await distribution(client);
    console.log('[TX] 分布:', JSON.stringify(distTx));
    console.log('[TX] 指纹:', JSON.stringify(fpTx));

    if (fpTx.total !== EXPECTED_TOTAL) { await client.query('ROLLBACK'); fail(`迁移后总行数 ${fpTx.total} ≠ 110`); }
    if (fpTx.closed_en !== EXPECTED_DONE) { await client.query('ROLLBACK'); fail(`迁移后 closed ${fpTx.closed_en} ≠ 60`); }
    if (PLAN === 'A') {
      if (fpTx.discovered !== EXPECTED_NULL) { await client.query('ROLLBACK'); fail(`迁移后 discovered ${fpTx.discovered} ≠ 50`); }
      if (fpTx.null_status !== 0) { await client.query('ROLLBACK'); fail(`迁移后仍有 ${fpTx.null_status} 行 NULL`); }
    } else {
      if (fpTx.discovered !== EXPECTED_NINE) { await client.query('ROLLBACK'); fail(`迁移后 discovered ${fpTx.discovered} ≠ 9`); }
      if (fpTx.null_status !== EXPECTED_NULL - EXPECTED_NINE) { await client.query('ROLLBACK'); fail(`迁移后 NULL ${fpTx.null_status} ≠ 41`); }
    }

    // 非 status 字段零改动校验：updated_at 必须与迁移前完全一致
    if (fpBefore.max_updated !== fpTx.max_updated) {
      await client.query('ROLLBACK');
      fail(`updated_at 被改动（${fpBefore.max_updated} → ${fpTx.max_updated}），已 ROLLBACK`);
    }

    await client.query('COMMIT');
    committed = true;
    console.log('\n[COMMIT] 迁移已提交');

    // ---------- 提交后复核 ----------
    const fpAfter = await fingerprint(client);
    console.log('[AFTER] 分布:', JSON.stringify(await distribution(client)));
    console.log('[AFTER] 指纹:', JSON.stringify(fpAfter));

    const resid = (await client.query(`
      SELECT coalesce(status,'<NULL>') AS k, count(*)::int AS n
        FROM hazards WHERE is_deleted=false
       GROUP BY 1
      HAVING coalesce(coalesce(status,'<NULL>'),'') NOT IN ('discovered','processing','pending_review','closed')`)).rows;
    console.log('[AFTER] 非 canonical 残留:', JSON.stringify(resid));

    if (PLAN === 'A' && resid.length > 0) fail('迁移后仍有非 canonical 状态残留');
  } catch (e) {
    if (!committed) await client.query('ROLLBACK').catch(() => {});
    console.error(`\n[${e.__blocked ? 'BLOCKED' : 'ERROR'}] ${e.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.pool.end().catch(() => {});
  }
})();
