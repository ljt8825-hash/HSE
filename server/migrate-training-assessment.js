const { pool, testConnection } = require('./config/db');

async function migrate() {
  await testConnection();
  console.log('[DBMigrate] 开始培训考核模块数据库迁移...\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ========== 1. training_plans 培训计划表 ==========
    console.log('1. 培训计划表 training_plans');
    await client.query(`
      CREATE TABLE IF NOT EXISTS training_plans (
        id BIGSERIAL PRIMARY KEY,
        plan_no VARCHAR(64) UNIQUE,
        plan_name VARCHAR(255) NOT NULL,
        plan_type VARCHAR(64),
        training_type VARCHAR(64),
        target_dept_id BIGINT,
        target_dept VARCHAR(128),
        target_position VARCHAR(128),
        target_employee_ids JSONB DEFAULT '[]'::jsonb,
        plan_start_date DATE,
        plan_end_date DATE,
        plan_hours DECIMAL(8,2),
        trainer_id BIGINT,
        trainer VARCHAR(128),
        location VARCHAR(255),
        status VARCHAR(32) DEFAULT 'draft',
        description TEXT,
        objective TEXT,
        syllabus TEXT,
        assessment_method VARCHAR(64),
        approval_by_id BIGINT,
        approved_by VARCHAR(128),
        approval_date DATE,
        created_by_id BIGINT,
        created_by VARCHAR(128),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);
    const planFields = [
      ['target_employee_ids', "JSONB DEFAULT '[]'::jsonb"],
      ['plan_type', 'VARCHAR(64)'],
      ['approval_by_id', 'BIGINT'],
      ['approved_by', 'VARCHAR(128)'],
      ['approval_date', 'DATE'],
      ['created_by_id', 'BIGINT'],
      ['created_by', 'VARCHAR(128)'],
      ['is_deleted', 'BOOLEAN DEFAULT FALSE'],
    ];
    for (const [name, type] of planFields) {
      try { await client.query(`ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS ${name} ${type}`); } catch(e) {}
    }
    await client.query('CREATE INDEX IF NOT EXISTS idx_training_plans_status ON training_plans(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_training_plans_type ON training_plans(plan_type)');
    console.log('   ✅ training_plans 就绪\n');

    // ========== 2. training_records 培训记录表 ==========
    console.log('2. 培训记录表 training_records');
    await client.query(`
      CREATE TABLE IF NOT EXISTS training_records (
        id BIGSERIAL PRIMARY KEY,
        training_plan_id BIGINT,
        record_no VARCHAR(64) UNIQUE,
        training_title VARCHAR(255) NOT NULL,
        training_type VARCHAR(64),
        training_date DATE,
        start_time TIME,
        end_time TIME,
        hours_planned DECIMAL(8,2),
        hours_actual DECIMAL(8,2),
        location VARCHAR(255),
        trainer_id BIGINT,
        trainer_name VARCHAR(128),
        employee_id BIGINT,
        employee_name VARCHAR(128),
        employee_no VARCHAR(64),
        dept_id BIGINT,
        dept_name VARCHAR(128),
        position VARCHAR(128),
        has_checkin BOOLEAN DEFAULT FALSE,
        checkin_time TIMESTAMPTZ,
        assessment_result VARCHAR(32),
        assessment_score DECIMAL(8,2),
        certificate_no VARCHAR(64),
        status VARCHAR(32) DEFAULT 'completed',
        remark TEXT,
        created_by_id BIGINT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);
    const recFields = [
      ['record_no', 'VARCHAR(64)'],
      ['training_title', 'VARCHAR(255)'],
      ['training_type', 'VARCHAR(64)'],
      ['start_time', 'TIME'],
      ['end_time', 'TIME'],
      ['hours_planned', 'DECIMAL(8,2)'],
      ['hours_actual', 'DECIMAL(8,2)'],
      ['trainer_id', 'BIGINT'],
      ['trainer_name', 'VARCHAR(128)'],
      ['employee_no', 'VARCHAR(64)'],
      ['dept_id', 'BIGINT'],
      ['dept_name', 'VARCHAR(128)'],
      ['position', 'VARCHAR(128)'],
      ['has_checkin', 'BOOLEAN DEFAULT FALSE'],
      ['checkin_time', 'TIMESTAMPTZ'],
      ['assessment_result', 'VARCHAR(32)'],
      ['assessment_score', 'DECIMAL(8,2)'],
      ['certificate_no', 'VARCHAR(64)'],
      ['created_by_id', 'BIGINT'],
      ['is_deleted', 'BOOLEAN DEFAULT FALSE'],
    ];
    for (const [name, type] of recFields) {
      try { await client.query(`ALTER TABLE training_records ADD COLUMN IF NOT EXISTS ${name} ${type}`); } catch(e) {}
    }
    await client.query('CREATE INDEX IF NOT EXISTS idx_training_records_emp ON training_records(employee_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_training_records_plan ON training_records(training_plan_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_training_records_date ON training_records(training_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_training_records_dept ON training_records(dept_id)');
    console.log('   ✅ training_records 就绪\n');

    // ========== 3. assessment_records 考核记录表 ==========
    console.log('3. 考核记录表 assessment_records');
    await client.query(`
      CREATE TABLE IF NOT EXISTS assessment_records (
        id BIGSERIAL PRIMARY KEY,
        assessment_no VARCHAR(64) UNIQUE,
        assessment_title VARCHAR(255) NOT NULL,
        assessment_type VARCHAR(32) DEFAULT 'theory',
        training_plan_id BIGINT,
        training_record_id BIGINT,
        assessment_date DATE,
        employee_id BIGINT,
        employee_name VARCHAR(128),
        employee_no VARCHAR(64),
        dept_id BIGINT,
        dept_name VARCHAR(128),
        position VARCHAR(128),
        score DECIMAL(8,2),
        pass_score DECIMAL(8,2) DEFAULT 60,
        is_pass BOOLEAN,
        grade VARCHAR(16),
        assessor_id BIGINT,
        assessor_name VARCHAR(128),
        retake_count INTEGER DEFAULT 0,
        is_retake BOOLEAN DEFAULT FALSE,
        status VARCHAR(32) DEFAULT 'completed',
        remark TEXT,
        violation_deduct_score DECIMAL(8,2) DEFAULT 0,
        hazard_bonus_score DECIMAL(8,2) DEFAULT 0,
        risk_implementation_score DECIMAL(8,2) DEFAULT 0,
        created_by_id BIGINT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_assessment_emp ON assessment_records(employee_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_assessment_date ON assessment_records(assessment_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_assessment_type ON assessment_records(assessment_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_assessment_dept ON assessment_records(dept_id)');
    console.log('   ✅ assessment_records 就绪\n');

    // ========== 4. certificates 证书表 ==========
    console.log('4. 证书表 certificates');
    await client.query(`
      CREATE TABLE IF NOT EXISTS certificates (
        id BIGSERIAL PRIMARY KEY,
        cert_no VARCHAR(128) UNIQUE,
        cert_type VARCHAR(64),
        cert_name VARCHAR(255),
        employee_id BIGINT,
        employee_name VARCHAR(128),
        employee_no VARCHAR(64),
        dept_id BIGINT,
        dept_name VARCHAR(128),
        position VARCHAR(128),
        issuing_authority VARCHAR(255),
        issue_date DATE,
        valid_from DATE,
        valid_to DATE,
        validity_years INTEGER,
        review_date DATE,
        status VARCHAR(32) DEFAULT 'valid',
        is_permanent BOOLEAN DEFAULT FALSE,
        has_attachment BOOLEAN DEFAULT FALSE,
        remark TEXT,
        created_by_id BIGINT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_cert_emp ON certificates(employee_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_cert_status ON certificates(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_cert_valid ON certificates(valid_to)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_cert_type ON certificates(cert_type)');
    console.log('   ✅ certificates 就绪\n');

    // ========== 5. personnel_assessment_summary 综合考核结果表 ==========
    console.log('5. 综合考核结果表 personnel_assessment_summary');
    await client.query(`
      CREATE TABLE IF NOT EXISTS personnel_assessment_summary (
        id BIGSERIAL PRIMARY KEY,
        summary_no VARCHAR(64) UNIQUE,
        period_type VARCHAR(32) DEFAULT 'quarterly',
        period_year INTEGER,
        period_label VARCHAR(32),
        employee_id BIGINT,
        employee_name VARCHAR(128),
        employee_no VARCHAR(64),
        dept_id BIGINT,
        dept_name VARCHAR(128),
        position VARCHAR(128),
        total_training_hours DECIMAL(8,2) DEFAULT 0,
        avg_assessment_score DECIMAL(8,2) DEFAULT 0,
        training_score DECIMAL(8,2) DEFAULT 0,
        assessment_score_value DECIMAL(8,2) DEFAULT 0,
        violation_score DECIMAL(8,2) DEFAULT 0,
        hazard_score DECIMAL(8,2) DEFAULT 0,
        risk_score DECIMAL(8,2) DEFAULT 0,
        total_score DECIMAL(8,2) DEFAULT 0,
        grade VARCHAR(16),
        training_records_count INTEGER DEFAULT 0,
        assessment_records_count INTEGER DEFAULT 0,
        violation_count INTEGER DEFAULT 0,
        hazard_rectify_count INTEGER DEFAULT 0,
        risk_impl_count INTEGER DEFAULT 0,
        data_sources JSONB DEFAULT '{}'::jsonb,
        calculation_details JSONB DEFAULT '{}'::jsonb,
        status VARCHAR(32) DEFAULT 'draft',
        approved_by_id BIGINT,
        approved_at TIMESTAMPTZ,
        remark TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_pas_emp ON personnel_assessment_summary(employee_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pas_period ON personnel_assessment_summary(period_year, period_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pas_dept ON personnel_assessment_summary(dept_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pas_grade ON personnel_assessment_summary(grade)');
    console.log('   ✅ personnel_assessment_summary 就绪\n');

    // ========== 6. 培训附件表 ==========
    console.log('6. 培训附件与版本表');
    await client.query(`
      CREATE TABLE IF NOT EXISTS training_attachments (
        id BIGSERIAL PRIMARY KEY,
        record_id BIGINT NOT NULL,
        module_type VARCHAR(32) DEFAULT 'training_record',
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(64) DEFAULT 'document',
        file_size BIGINT DEFAULT 0,
        file_url VARCHAR(512),
        version VARCHAR(32) DEFAULT '1.0',
        uploaded_by VARCHAR(128),
        is_latest BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS training_versions (
        id BIGSERIAL PRIMARY KEY,
        record_id BIGINT NOT NULL,
        module_type VARCHAR(32) DEFAULT 'training_plan',
        version VARCHAR(32) NOT NULL,
        change_type VARCHAR(32) DEFAULT 'update',
        change_summary TEXT,
        changed_by VARCHAR(128),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const attFields = [['module_type', "VARCHAR(32) DEFAULT 'training_record'"]];
    for (const [name, type] of attFields) {
      try { await client.query(`ALTER TABLE training_attachments ADD COLUMN IF NOT EXISTS ${name} ${type}`); } catch(e) {}
    }
    try { await client.query(`ALTER TABLE training_versions ADD COLUMN IF NOT EXISTS module_type VARCHAR(32) DEFAULT 'training_plan'`); } catch(e) {}
    console.log('   ✅ 附件/版本表就绪\n');

    await client.query('COMMIT');
    console.log('[DBMigrate] ✅ 培训考核模块数据库迁移全部完成！');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DBMigrate] ❌ 迁移失败:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
}

migrate().catch(err => { console.error(err); process.exit(1); });
