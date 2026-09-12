const { pool } = require('./config/db');

async function init() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS violation_records (
        id BIGSERIAL PRIMARY KEY,
        no VARCHAR(64),
        violation_type VARCHAR(64) NOT NULL,
        violation_level VARCHAR(32) NOT NULL,
        risk_level VARCHAR(32) DEFAULT '中',
        description TEXT NOT NULL,
        location VARCHAR(255),
        violation_date DATE NOT NULL,
        occur_time TIME,
        violator_name VARCHAR(64),
        violator_id BIGINT,
        inspector_name VARCHAR(64),
        inspector_id BIGINT,
        handler_name VARCHAR(64),
        handler_id BIGINT,
        punisher_name VARCHAR(64),
        punisher_id BIGINT,
        punishment_type VARCHAR(64),
        punishment_amount DECIMAL(10,2),
        rectification TEXT,
        rectification_time TIMESTAMPTZ,
        review_result VARCHAR(32),
        review_time TIMESTAMPTZ,
        need_retraining BOOLEAN DEFAULT FALSE,
        training_plan_id BIGINT,
        status VARCHAR(32) DEFAULT '待处理',
        remark TEXT,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('violation_records table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS accidents (
        id BIGSERIAL PRIMARY KEY,
        no VARCHAR(64),
        accident_type VARCHAR(64) NOT NULL,
        level VARCHAR(32),
        description TEXT,
        accident_date DATE NOT NULL,
        occur_time TIME,
        location VARCHAR(255),
        personnel_id BIGINT,
        vehicle_id BIGINT,
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
    console.log('accidents table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS training_records (
        id BIGSERIAL PRIMARY KEY,
        employee_id BIGINT,
        employee_name VARCHAR(64),
        training_type VARCHAR(64),
        content TEXT,
        training_date DATE,
        trainer_name VARCHAR(64),
        result VARCHAR(32),
        score INT,
        certificate_no VARCHAR(128),
        certificate_expire_date DATE,
        status VARCHAR(32) DEFAULT '待培训',
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('training_records table created');

    await pool.end();
    console.log('All tables created successfully');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

init();