const { pool } = require('./config/db');

async function cleanup() {
  try {
    // ============================================
    // 1. 创建 hse_incident_records 表（统一事故表）
    // ============================================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hse_incident_records (
        id BIGSERIAL PRIMARY KEY,
        no VARCHAR(64),
        accident_type VARCHAR(64) NOT NULL,
        level VARCHAR(32),
        description TEXT,
        accident_date DATE NOT NULL,
        occur_time TIME,
        location VARCHAR(255),
        employee_id BIGINT,
        involved_person VARCHAR(255),
        responsibility VARCHAR(32),
        responsibility_level VARCHAR(32),
        loss_amount DECIMAL(15,2),
        casualties INT DEFAULT 0,
        injuries INT DEFAULT 0,
        status VARCHAR(32) DEFAULT '待处理',
        remark TEXT,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('hse_incident_records table created');

    // 迁移 accidents 数据到 hse_incident_records
    await pool.query(`
      INSERT INTO hse_incident_records 
      (id, no, accident_type, level, description, accident_date, location, 
       employee_id, involved_person, responsibility, responsibility_level,
       loss_amount, casualties, injuries, status, remark, is_deleted, created_at, updated_at)
      SELECT 
        id, 
        CASE WHEN no IS NOT NULL THEN no::varchar ELSE NULL END,
        accident_type, level, description, accident_date, location,
        personnel_id, involved_person, responsibility, responsibility_level,
        loss_amount, casualties, injuries, status, remark, is_deleted, created_at, updated_at
      FROM accidents
      WHERE NOT EXISTS (SELECT 1 FROM hse_incident_records WHERE hse_incident_records.id = accidents.id)
    `);
    console.log('accidents data migrated to hse_incident_records');

    // ============================================
    // 2. 创建 hse_driver_inspection_records 表（统一三检表）
    // ============================================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hse_driver_inspection_records (
        id BIGSERIAL PRIMARY KEY,
        employee_id BIGINT NOT NULL,
        employee_name VARCHAR(64),
        vehicle_no VARCHAR(32),
        inspection_date DATE NOT NULL,
        inspection_type VARCHAR(64) NOT NULL,
        inspection_items TEXT,
        result VARCHAR(32) NOT NULL,
        problems_found VARCHAR(512),
        rectification_status VARCHAR(32) DEFAULT '未整改',
        rectification_desc TEXT,
        inspector_name VARCHAR(64),
        remark TEXT,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('hse_driver_inspection_records table created');

    // 迁移 vehicle_inspection_records 数据到 hse_driver_inspection_records
    await pool.query(`
      INSERT INTO hse_driver_inspection_records 
      (id, employee_id, employee_name, vehicle_no, inspection_date, inspection_type,
       inspection_items, result, problems_found, rectification_status, rectification_desc,
       inspector_name, remark, is_deleted, created_at, updated_at)
      SELECT 
        id, employee_id, employee_name, vehicle_no, inspection_date, inspection_type,
        inspection_items, result, problems_found, rectification_status, rectification_desc,
        inspector_name, remark, is_deleted, created_at, updated_at
      FROM vehicle_inspection_records
      WHERE NOT EXISTS (SELECT 1 FROM hse_driver_inspection_records WHERE hse_driver_inspection_records.id = vehicle_inspection_records.id)
    `);
    console.log('vehicle_inspection_records data migrated to hse_driver_inspection_records');

    // ============================================
    // 3. 创建岗位风险映射表
    // ============================================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS position_risk_mapping (
        id BIGSERIAL PRIMARY KEY,
        position_name VARCHAR(128) NOT NULL,
        position_code VARCHAR(64),
        risk_category VARCHAR(32) NOT NULL,
        is_driver BOOLEAN NOT NULL DEFAULT FALSE,
        applicable_risk_types JSONB,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(position_name, risk_category)
      )
    `);
    console.log('position_risk_mapping table created');

    // 插入默认岗位风险映射数据
    await pool.query(`
      INSERT INTO position_risk_mapping (position_name, risk_category, is_driver, applicable_risk_types, description)
      VALUES
      ('垃圾转运车驾驶员', 'driver', true, '["violation","incident","training","license","traffic_accident","inspection"]', '垃圾转运车驾驶岗位'),
      ('垃圾收运车驾驶员', 'driver', true, '["violation","incident","training","license","traffic_accident","inspection"]', '垃圾收运车驾驶岗位'),
      ('吸污车驾驶员', 'driver', true, '["violation","incident","training","license","traffic_accident","inspection"]', '吸污车驾驶岗位'),
      ('保洁员', 'normal', false, '["violation","incident","training"]', '普通保洁岗位'),
      ('管理员', 'normal', false, '["violation","incident","training"]', '管理岗位'),
      ('网格长', 'management', false, '["violation","incident","training","management_responsibility"]', '网格管理岗位'),
      ('片区长', 'management', false, '["violation","incident","training","management_responsibility"]', '片区管理岗位')
      ON CONFLICT (position_name, risk_category) DO NOTHING
    `);
    console.log('position_risk_mapping default data inserted');

    // ============================================
    // 4. 创建风险类型字典表
    // ============================================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS risk_type_dict (
        id BIGSERIAL PRIMARY KEY,
        risk_code VARCHAR(32) NOT NULL UNIQUE,
        risk_name VARCHAR(64) NOT NULL,
        risk_category VARCHAR(32) NOT NULL,
        description TEXT,
        data_source VARCHAR(128),
        stat_period VARCHAR(32),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        display_order INT DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('risk_type_dict table created');

    // 插入风险类型字典数据
    await pool.query(`
      INSERT INTO risk_type_dict (risk_code, risk_name, risk_category, description, data_source, stat_period, display_order)
      VALUES
      ('violation', '三违风险', 'behavior', '违章指挥、违章操作、违反劳动纪律', 'violation_records', '近12个月', 1),
      ('training', '培训风险', 'capability', '培训完成情况、证书状态', 'training_records', '全部历史', 2),
      ('incident', '事故风险', 'event', '生产安全事故、交通事故、环境污染事故', 'hse_incident_records', '全部历史', 3),
      ('traffic_accident', '交通风险', 'event', '交通事故专项统计', 'hse_incident_records', '全部历史', 4),
      ('license_demerit', '驾驶行为风险', 'behavior', '驾驶证扣分记录', 'license_demerit_records', '近5年', 5),
      ('inspection', '三检风险', 'behavior', '车辆三检完成情况', 'hse_driver_inspection_records', '全部历史', 6),
      ('management_responsibility', '管理责任风险', 'management', '管理责任履行情况', 'hse_responsibility', '全部历史', 7)
      ON CONFLICT (risk_code) DO NOTHING
    `);
    console.log('risk_type_dict default data inserted');

    await pool.end();
    console.log('\nAll risk model cleanup tasks completed successfully');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

cleanup();
