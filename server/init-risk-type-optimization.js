const { pool } = require('./config/db');

async function optimize() {
  try {
    // ============================================
    // 1. 为risk_type_dict增加applicable_scope字段
    // ============================================
    await pool.query(`
      ALTER TABLE risk_type_dict 
      ADD COLUMN IF NOT EXISTS applicable_scope VARCHAR(255)
    `);
    console.log('applicable_scope column added');

    // ============================================
    // 2. 创建management_execution表（管理履职记录表）
    // ============================================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS management_execution (
        id BIGSERIAL PRIMARY KEY,
        employee_id BIGINT NOT NULL,
        employee_name VARCHAR(64),
        position_name VARCHAR(128),
        execution_type VARCHAR(64) NOT NULL,
        execution_date DATE NOT NULL,
        execution_content TEXT,
        target_scope VARCHAR(255),
        result VARCHAR(32),
        problems_found VARCHAR(512),
        rectification_status VARCHAR(32) DEFAULT '未整改',
        rectification_desc TEXT,
        evidence_attachment VARCHAR(255),
        remark TEXT,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('management_execution table created');

    // ============================================
    // 3. 更新风险类型字典数据（按新体系）
    // ============================================
    
    // 先删除旧数据
    await pool.query(`DELETE FROM risk_type_dict`);
    console.log('Old risk_type_dict data deleted');

    // 插入新的风险类型体系
    await pool.query(`
      INSERT INTO risk_type_dict (risk_code, risk_name, risk_category, description, data_source, stat_period, applicable_scope, display_order)
      VALUES
      ('violation', '三违风险', 'behavior', '违章指挥、违章操作、违反劳动纪律', 'violation_records', '近12个月', 'all', 1),
      ('driver_compliance', '驾驶合规风险', 'behavior', '驾驶证扣分、三检执行等驾驶行为合规情况', 'license_demerit_records,hse_driver_inspection_records', '近5年', 'driver', 2),
      ('training_compliance', '培训合规风险', 'capability', '培训完成情况、证书有效性', 'training_records', '全部历史', 'all', 3),
      ('incident', '事故风险', 'event', '生产安全事故、交通事故、环境污染事故', 'hse_incident_records', '全部历史', 'all', 4),
      ('management_execution', '管理履职风险', 'management', '管理职责履行、巡查执行情况', 'management_execution', '全部历史', 'management', 5)
    `);
    console.log('New risk_type_dict data inserted');

    // ============================================
    // 4. 更新岗位风险映射表
    // ============================================
    
    // 更新驾驶员岗位
    await pool.query(`
      UPDATE position_risk_mapping 
      SET applicable_risk_types = '["violation","driver_compliance","training_compliance","incident"]'
      WHERE risk_category = 'driver'
    `);
    console.log('Driver position mappings updated');

    // 更新普通员工岗位
    await pool.query(`
      UPDATE position_risk_mapping 
      SET applicable_risk_types = '["violation","training_compliance","incident"]'
      WHERE risk_category = 'normal'
    `);
    console.log('Normal position mappings updated');

    // 更新管理岗位
    await pool.query(`
      UPDATE position_risk_mapping 
      SET applicable_risk_types = '["violation","training_compliance","incident","management_execution"]'
      WHERE risk_category = 'management'
    `);
    console.log('Management position mappings updated');

    // ============================================
    // 5. 插入管理履职测试数据
    // ============================================
    await pool.query(`
      INSERT INTO management_execution 
      (employee_id, employee_name, position_name, execution_type, execution_date, 
       execution_content, target_scope, result, problems_found, rectification_status)
      VALUES
      (3867, '管理员张三', '管理员', '安全巡查', '2026-06-28', '检查车间安全隐患', '车间A区', '合格', NULL, '无需整改'),
      (3867, '管理员张三', '管理员', '安全检查', '2026-06-15', '月度安全检查', '全厂区', '合格', NULL, '无需整改')
      ON CONFLICT DO NOTHING
    `);
    console.log('Management execution test data inserted');

    await pool.end();
    console.log('\nAll risk type optimization tasks completed successfully');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

optimize();
