/**
 * 目标责任书台账支撑 · 新增「用工关系状态」列（生产库 safety_dashboard）
 *
 * ⚠️ 生产写库 — 用户已显式授权（2026-10-23），且 dev 演练已完成。
 * 护栏：本脚本硬编码目标库为 safety_dashboard 并断言 current_database()，
 *       绝不触碰其它库；同时要求 --apply 与 --prod-authorized 双标志，
 *       任何单标志或库名不符都会立即终止（尊重红线「默认硬拒生产库」）。
 *
 * 变更内容（与 dev 一致）：
 *   1. employee 人员主表新增列 employment_relationship_status VARCHAR(50)
 *   2. v_employee_current 视图 DROP+CREATE 暴露该列（视图无法 ALTER ADD COLUMN）
 *
 * 运行：
 *   node scripts/objresp_add_relation_col_prod.cjs                                  # dry-run：只读检查
 *   node scripts/objresp_add_relation_col_prod.cjs --apply --prod-authorized        # 实际执行（生产）
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const PROD_DB = 'safety_dashboard';
const COL = 'employment_relationship_status';
const APPLY = process.argv.includes('--apply');
const PROD_AUTH = process.argv.includes('--prod-authorized');

const env = {};
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}

const cfg = {
  host: env.DB_HOST || '127.0.0.1',
  port: +(env.DB_PORT || 5432),
  user: env.DB_USER || 'postgres',
  password: env.DB_PASSWORD || '',
  database: PROD_DB,
  connectionTimeoutMillis: 15000,
};

(async () => {
  if (APPLY && !PROD_AUTH) {
    console.error('[护栏拒绝] 执行生产变更必须同时带 --apply 与 --prod-authorized 两个标志。已终止。');
    process.exit(2);
  }

  const c = new Client(cfg);
  await c.connect();
  try {
    const cur = await c.query('SELECT current_database() AS db');
    const db = cur.rows[0].db;
    if (db !== PROD_DB) {
      console.error(`[护栏拒绝] current_database()= ${db}，并非 ${PROD_DB}，已终止。`);
      process.exit(2);
    }
    console.log(`[护栏 OK] 已连接数据库：${db}（生产）`);

    // 1) employee 是否已有该列
    const colChk = await c.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='employee' AND column_name=$1`,
      [COL]
    );
    const colExists = colChk.rows.length > 0;
    console.log(`employee.${COL} 是否已存在 :`, colExists ? '是（将跳过加列）' : '否（将新增）');

    // 2) 视图依赖检查（生产必须先确认无依赖对象，避免 DROP 级联破坏）
    const dep = await c.query(
      `SELECT dependent_ns.nspname AS sch, dependent_view.relname AS obj
         FROM pg_depend
         JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
         JOIN pg_class AS dependent_view ON pg_rewrite.ev_class = dependent_view.oid
         JOIN pg_class AS src ON pg_depend.refobjid = src.oid
         JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
        WHERE src.relname = 'v_employee_current'
          AND pg_depend.deptype <> 'i'        -- 排除内部依赖
          AND dependent_view.relname <> 'v_employee_current'`
    );
    if (dep.rows.length > 0) {
      console.error('[中止] v_employee_current 存在依赖对象，DROP 会破坏它们：');
      for (const r of dep.rows) console.error(`   - ${r.sch}.${r.obj}`);
      await c.end();
      process.exit(3);
    }
    console.log('v_employee_current 依赖对象 : 无（DROP 安全）');

    // 3) 当前视图体
    const vd = await c.query(`SELECT pg_get_viewdef('v_employee_current', true) AS def`);
    const viewDef = vd.rows[0] ? vd.rows[0].def : '';
    const viewHasCol = new RegExp(COL).test(viewDef);
    console.log('v_employee_current 是否已含该列 :', viewHasCol ? '是' : '否');
    console.log('\n--- 当前 v_employee_current 视图体 ---');
    console.log(viewDef);

    if (!APPLY) {
      console.log('\n[DRY-RUN] 未执行任何 DDL。加 --apply --prod-authorized 才会实际修改生产库。');
      await c.end();
      return;
    }

    // === APPLY（生产）===
    await c.query('BEGIN');

    if (!colExists) {
      await c.query(`ALTER TABLE employee ADD COLUMN ${COL} VARCHAR(50)`);
      await c.query(
        `COMMENT ON COLUMN employee.${COL} IS '用工关系状态：正式工/劳务派遣/业务外包/实习/退休返聘/临时用工/其他（NULL=未登记）'`
      );
      console.log(`[APPLY] employee 已新增列 ${COL}（VARCHAR(50)）`);
    } else {
      console.log(`[APPLY] employee.${COL} 已存在，跳过加列`);
    }

    if (!viewHasCol) {
      const anchor = 'e.id_address';
      if (!viewDef.includes(anchor)) {
        throw new Error('视图锚点 e.id_address 未找到，视图结构可能已变更，已中止以避免破坏视图');
      }
      const newDef = viewDef.replace(anchor, `${anchor},\n    e.${COL}`);
      await c.query(`DROP VIEW IF EXISTS v_employee_current`);
      await c.query(`CREATE VIEW v_employee_current AS ${newDef}`);
      console.log('[APPLY] v_employee_current 已 DROP+CREATE 并暴露新列');
    } else {
      console.log('[APPLY] 视图已含该列，跳过重建');
    }

    const chk = await c.query(`SELECT COUNT(*)::int AS total, COUNT(${COL})::int AS filled FROM v_employee_current`);
    console.log(`[校验] v_employee_current 总行数=${chk.rows[0].total}，已填用工关系状态=${chk.rows[0].filled}（应为 0，待回填）`);

    await c.query('COMMIT');
    console.log('[APPLY OK] 生产库已提交。');
    await c.end();
  } catch (e) {
    console.error('[失败]', e.message);
    try { await c.query('ROLLBACK'); } catch (_) {}
    await c.end();
    process.exit(1);
  }
})();
