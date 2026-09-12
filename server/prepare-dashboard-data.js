/**
 * Sprint6.3-B-1 驾驶舱数据准备脚本
 * 
 * 1. 创建 v_training_records 视图（统一 employee_id 输出）
 * 2. 初始化 risk_score_history 历史数据
 */

const { pool } = require('./config/db');

const prepare = async () => {
  try {
    console.log('[Sprint6.3-B-1] 开始驾驶舱数据准备...\n');

    // 1. 创建 v_training_records 视图
    await pool.query('DROP VIEW IF EXISTS v_training_records');
    await pool.query(`
      CREATE VIEW v_training_records AS
      SELECT 
        t.id,
        t.personnel_id AS employee_id,
        e.employee_code,
        e.name AS employee_name,
        t.name,
        t.id_card,
        t.dept,
        t.position,
        t.grid_level,
        t.frequency,
        t.training_type,
        t.training_date,
        t.duration_minutes,
        t.content,
        t.result,
        t.score,
        t.trainer,
        t.remark,
        t.created_at,
        t.updated_at,
        t.is_deleted
      FROM training_records t
      LEFT JOIN employee e ON t.personnel_id = e.id
      WHERE t.is_deleted = false;
    `);
    console.log('[Sprint6.3-B-1] 创建 v_training_records 视图成功');

    // 验证视图
    const viewCheck = await pool.query('SELECT COUNT(*) as cnt FROM v_training_records');
    console.log(`  视图数据量: ${viewCheck.rows[0].cnt} 条`);

    const viewSample = await pool.query('SELECT employee_id, employee_name, training_type, result FROM v_training_records LIMIT 3');
    console.log('  样例数据:');
    viewSample.rows.forEach(r => console.log(`    employee_id=${r.employee_id}, name=${r.employee_name}, type=${r.training_type}, result=${r.result}`));

    // 2. 初始化 risk_score_history 历史数据
    console.log('\n[Sprint6.3-B-1] 开始初始化 risk_score_history...');

    // 从 risk_score_records 生成历史快照
    const scoreRecords = await pool.query(`
      SELECT DISTINCT ON (employee_id)
        employee_id, employee_code, employee_name, position_id, position_name,
        risk_category, management_level, violation_score, driver_compliance_score,
        training_compliance_score, incident_score, management_execution_score,
        final_score, risk_level, risk_level_code, special_rules_triggered, calculated_at
      FROM risk_score_records
      WHERE is_deleted = false
      ORDER BY employee_id, calculated_at DESC
    `);

    console.log(`  找到 ${scoreRecords.rows.length} 名员工的评分记录`);

    // 获取组织信息
    let inserted = 0;
    for (const record of scoreRecords.rows) {
      const orgInfo = await pool.query(`
        SELECT ea.org_unit_id, ou.org_name
        FROM employee_assignment ea
        LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
        WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_deleted = false
        LIMIT 1
      `, [record.employee_id]);

      const org = orgInfo.rows[0] || { org_unit_id: null, org_name: null };

      await pool.query(`
        INSERT INTO risk_score_history (
          employee_id, employee_code, employee_name, position_id, position_name,
          risk_category, management_level, org_id, org_name,
          violation_score, driver_compliance_score, training_compliance_score,
          incident_score, management_execution_score, total_score,
          risk_level, risk_level_code, special_rules_triggered,
          calculate_date, calculate_period, data_source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'daily', 'auto')
        ON CONFLICT DO NOTHING
      `, [
        record.employee_id, record.employee_code, record.employee_name,
        record.position_id, record.position_name, record.risk_category,
        record.management_level, org.org_unit_id, org.org_name,
        record.violation_score, record.driver_compliance_score,
        record.training_compliance_score, record.incident_score,
        record.management_execution_score, record.final_score,
        record.risk_level, record.risk_level_code, record.special_rules_triggered,
        new Date(record.calculated_at).toISOString().split('T')[0]
      ]);
      inserted++;
    }

    console.log(`  初始化 ${inserted} 条历史记录`);

    // 3. 验证历史数据
    const historyCount = await pool.query('SELECT COUNT(*) as cnt FROM risk_score_history WHERE is_deleted = false');
    console.log(`  risk_score_history 总数据量: ${historyCount.rows[0].cnt} 条`);

    const levelDist = await pool.query(`
      SELECT risk_level, risk_level_code, COUNT(*) as cnt
      FROM risk_score_history WHERE is_deleted = false
      GROUP BY risk_level, risk_level_code ORDER BY risk_level_code
    `);
    console.log('  历史等级分布:');
    levelDist.rows.forEach(r => console.log(`    ${r.risk_level} (${r.risk_level_code}): ${r.cnt}人`));

    console.log('\n[Sprint6.3-B-1] 驾驶舱数据准备完成！');
    process.exit(0);
  } catch (e) {
    console.error('[Sprint6.3-B-1] 失败:', e.message);
    process.exit(1);
  }
};

prepare();
