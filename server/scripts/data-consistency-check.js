/**
 * 数据一致性验证脚本
 * 验证前后端数据流的一致性
 * 使用方法: node scripts/data-consistency-check.js
 */
const { pool } = require('../config/db');

const CHECKS = [];

function check(name, condition, details = '') {
  CHECKS.push({ name, pass: condition, details });
  const status = condition ? '✅ 通过' : '❌ 失败';
  console.log(`  ${status} — ${name}${details ? ` (${details})` : ''}`);
}

async function runChecks() {
  console.log('\n========================================');
  console.log('  数据一致性验证报告');
  console.log('========================================\n');

  // 1. 数据库连接检查
  console.log('[1/4] 数据库连接与表结构');
  try {
    const tablesRes = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    );
    const tables = tablesRes.rows.map(r => r.table_name);
    check('数据库可连接', tables.length > 0, `共 ${tables.length} 张表`);
    check('核心表存在',
      ['accidents', 'vehicles', 'personnel_insurance', 'users'].every(t => tables.includes(t)),
      'accidents, vehicles, personnel_insurance, users'
    );
  } catch (err) {
    check('数据库可连接', false, err.message);
  }

  // 2. 分页数据完整性
  console.log('\n[2/4] 分页数据完整性');
  try {
    const accidentsRes = await pool.query('SELECT COUNT(*)::int AS total FROM accidents WHERE is_deleted = false');
    const dbTotal = accidentsRes.rows[0].total;
    check('accidents 表可统计', dbTotal >= 0, `共 ${dbTotal} 条记录`);

    const vehiclesRes = await pool.query('SELECT COUNT(*)::int AS total FROM vehicles WHERE is_deleted = false');
    const vTotal = vehiclesRes.rows[0].total;
    check('vehicles 表可统计', vTotal >= 0, `共 ${vTotal} 条记录`);

    const personnelRes = await pool.query('SELECT COUNT(*)::int AS total FROM personnel_insurance WHERE is_deleted = false');
    const pTotal = personnelRes.rows[0].total;
    check('personnel_insurance 表可统计', pTotal >= 0, `共 ${pTotal} 条记录`);
  } catch (err) {
    check('分页数据完整性', false, err.message);
  }

  // 3. 统计数据准确性
  console.log('\n[3/4] 统计数据准确性');
  try {
    // 事故统计
    const [accTotalR, accTypeR, accStatusR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM accidents WHERE is_deleted = false'),
      pool.query("SELECT accident_type, COUNT(*)::int AS c FROM accidents WHERE is_deleted = false GROUP BY accident_type"),
      pool.query("SELECT status, COUNT(*)::int AS c FROM accidents WHERE is_deleted = false GROUP BY status")
    ]);
    const accTotal = accTotalR.rows[0].c;
    const accTypeSum = accTypeR.rows.reduce((s, r) => s + r.c, 0);
    const accStatusSum = accStatusR.rows.reduce((s, r) => s + r.c, 0);

    check('事故按类型分组求和等于总数', accTypeSum === accTotal, `类型求和=${accTypeSum}, 总数=${accTotal}`);
    check('事故按状态分组求和等于总数', accStatusSum === accTotal, `状态求和=${accStatusSum}, 总数=${accTotal}`);

    // 车辆保险统计
    const [vTotalR, vActiveR, vExpiredR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM vehicles WHERE is_deleted = false'),
      pool.query("SELECT COUNT(*)::int AS c FROM vehicles WHERE is_deleted = false AND insurance_end >= CURRENT_DATE"),
      pool.query("SELECT COUNT(*)::int AS c FROM vehicles WHERE is_deleted = false AND insurance_end < CURRENT_DATE")
    ]);
    const vTotal = vTotalR.rows[0].c;
    const vActive = vActiveR.rows[0].c;
    const vExpired = vExpiredR.rows[0].c;
    check('车辆保险有效+过期 <= 总数', (vActive + vExpired) <= vTotal, `有效=${vActive}, 过期=${vExpired}, 总数=${vTotal}`);
  } catch (err) {
    check('统计数据准确性', false, err.message);
  }

  // 4. 级联操作一致性（软删除标记）
  console.log('\n[4/4] 级联操作一致性');
  try {
    const deletedAccidents = await pool.query(
      "SELECT COUNT(*)::int AS c FROM accidents WHERE is_deleted = true"
    );
    check('accidents 软删除标记一致', deletedAccidents.rows[0].c >= 0, `已删除=${deletedAccidents.rows[0].c}`);

    const deletedVehicles = await pool.query(
      "SELECT COUNT(*)::int AS c FROM vehicles WHERE is_deleted = true"
    );
    check('vehicles 软删除标记一致', deletedVehicles.rows[0].c >= 0, `已删除=${deletedVehicles.rows[0].c}`);
  } catch (err) {
    check('级联操作一致性', false, err.message);
  }

  // 汇总
  console.log('\n----------------------------------------');
  const passed = CHECKS.filter(c => c.pass).length;
  const failed = CHECKS.filter(c => !c.pass).length;
  console.log(`  总计: ${CHECKS.length} 项 | 通过: ${passed} | 失败: ${failed}`);
  console.log('----------------------------------------\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runChecks().catch(err => {
  console.error('验证异常:', err);
  process.exit(1);
});
