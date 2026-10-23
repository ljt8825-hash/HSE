/**
 * 目标责任书台账支撑 · 新增「用工关系状态」列（仅 safety_dashboard_dev）
 *
 * 决策（用户确认）：
 *   - 列加在 employee（人员主表，每人一条）
 *   - 同步暴露到 v_employee_current 视图（台账/花名册查询依赖此视图）
 *
 * 护栏：DML/DDL 只允许 safety_dashboard_dev；硬编码该库并断言 current_database()，绝不触碰生产。
 *
 * 注意：视图无法 ALTER ADD COLUMN，必须 CREATE OR REPLACE VIEW 重建。
 *       重建以「数据库当前视图体」为基准（而非迁移文件），用锚点 e.id_address 注入新列，
 *       避免覆盖线上视图已存在的其它调整。
 *
 * 运行：
 *   node scripts/objresp_add_relation_col_dev.cjs            # dry-run：只读检查 + 打印视图体
 *   node scripts/objresp_add_relation_col_dev.cjs --apply    # 实际执行
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DRY_RUN = !process.argv.includes('--apply');
const DEV_DB = 'safety_dashboard_dev';
const COL = 'employment_relationship_status';

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
  database: DEV_DB,
  connectionTimeoutMillis: 15000,
};

(async () => {
  const c = new Client(cfg);
  await c.connect();
  try {
    const cur = await c.query('SELECT current_database() AS db');
    const db = cur.rows[0].db;
    if (db !== DEV_DB) {
      console.error(`[护栏拒绝] current_database()= ${db}，并非 ${DEV_DB}，已终止。`);
      process.exit(2);
    }
    console.log(`[护栏 OK] 已连接数据库：${db}`);

    // 1) employee 是否已有该列
    const colChk = await c.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='employee' AND column_name=$1`,
      [COL]
    );
    const colExists = colChk.rows.length > 0;
    console.log(`employee.${COL} 是否已存在 :`, colExists ? '是（将跳过加列）' : '否（将新增）');

    // 2) 当前视图体
    const vd = await c.query(
      `SELECT pg_get_viewdef('v_employee_current', true) AS def`
    );
    const viewDef = vd.rows[0] ? vd.rows[0].def : '';
    const viewHasCol = /employment_relationship_status/.test(viewDef);
    console.log('v_employee_current 是否已含该列 :', viewHasCol ? '是' : '否');
    console.log('\n--- 当前 v_employee_current 视图体 ---');
    console.log(viewDef);

    if (DRY_RUN) {
      console.log('\n[DRY-RUN] 未执行任何 DDL。加 --apply 才会实际修改 dev 库。');
      await c.end();
      return;
    }

    // === APPLY ===
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

    // 重建视图：以线上视图体为基准注入新列
    if (!viewHasCol) {
      const anchor = 'e.id_address';
      if (!viewDef.includes(anchor)) {
        throw new Error('视图锚点 e.id_address 未找到，视图结构可能已变更，已中止以避免破坏视图');
      }
      // 在 id_address 之后注入新列（仅替换首个锚点）
      const newDef = viewDef.replace(anchor, `${anchor},\n    e.${COL}`);
      // PostgreSQL 不允许用 OR REPLACE 改变视图列集合，必须 DROP 后 CREATE。
      // 已确认无依赖对象（deptype=n 为空），DROP 不会级联破坏其它对象。
      await c.query(`DROP VIEW IF EXISTS v_employee_current`);
      await c.query(`CREATE VIEW v_employee_current AS ${newDef}`);
      console.log('[APPLY] v_employee_current 已 DROP+CREATE 并暴露新列');
    } else {
      console.log('[APPLY] 视图已含该列，跳过重建');
    }

    // 校验：从视图读取新列（抽样非空 + 计数）
    const chk = await c.query(`SELECT COUNT(*)::int AS total, COUNT(${COL})::int AS filled FROM v_employee_current`);
    console.log(`[校验] v_employee_current 总行数=${chk.rows[0].total}，已填用工关系状态=${chk.rows[0].filled}（初始应为 0，待后续回填）`);

    await c.query('COMMIT');
    console.log('[APPLY OK] 已提交。');
    await c.end();
  } catch (e) {
    console.error('[失败]', e.message);
    try { await c.query('ROLLBACK'); } catch (_) {}
    await c.end();
    process.exit(1);
  }
})();
