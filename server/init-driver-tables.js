const { pool } = require('./config/db');

async function init() {
  try {
    // 1. 驾驶证扣分记录表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS license_demerit_records (
        id BIGSERIAL PRIMARY KEY,
        employee_id BIGINT NOT NULL,
        employee_name VARCHAR(64),
        license_no VARCHAR(32),
        demerit_date DATE NOT NULL,
        demerit_points INT NOT NULL,
        reason VARCHAR(255) NOT NULL,
        law_article VARCHAR(64),
        penalty_type VARCHAR(64),
        penalty_amount DECIMAL(10,2),
        processing_status VARCHAR(32) DEFAULT '已处理',
        remark TEXT,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('license_demerit_records table created');

    // 2. 三检记录表（车辆三检，关联员工）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vehicle_inspection_records (
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
    console.log('vehicle_inspection_records table created');

    await pool.end();
    console.log('All driver-related tables created successfully');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

init();