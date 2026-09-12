require('dotenv').config({ path: 'g:/hse-dashboard/server/.env' });
const { pool } = require('g:/hse-dashboard/server/config/db');
(async () => {
  // 乡镇作业中心经理的完整组织信息，看 org_path / org_name 是否含「乡镇作业中心」层级
  const t1 = await pool.query(
    `SELECT DISTINCT org_unit_id, org_name, org_path, org_type
       FROM v_employee_org_full
      WHERE relation_status = 'active' AND position_name = '乡镇作业中心经理'
      ORDER BY org_name`
  );
  console.log('--- active 乡镇作业中心经理 org 信息 ---');
  console.log(JSON.stringify(t1.rows, null, 1));
  // 组织路径里是否出现「乡镇作业中心」
  const t2 = await pool.query(
    `SELECT DISTINCT org_name FROM v_employee_org_full
      WHERE org_name LIKE '%乡镇作业中心%' AND relation_status='active' ORDER BY org_name`
  );
  console.log('--- distinct org_name 含「乡镇作业中心」---');
  console.log(t2.rows.map((r) => r.org_name).join('\n') || '(无)');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });