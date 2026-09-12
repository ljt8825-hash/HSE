/**
 * Sprint6.2 风险评分表初始化脚本
 * 
 * 创建表：
 *   - risk_score_records: 风险评分记录表
 *   - risk_level_records: 风险等级记录表
 * 
 * 使用方式：node server/init-risk-score-tables.js
 */

const { pool } = require('./config/db');

const createTables = async () => {
  try {
    console.log('[Sprint6.2] 开始创建风险评分表...');

    // 1. 创建 risk_score_records 表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS risk_score_records (
        id BIGSERIAL PRIMARY KEY,
        employee_id BIGINT NOT NULL,
        employee_code VARCHAR(64),
        employee_name VARCHAR(128),
        position_id BIGINT,
        position_name VARCHAR(128),
        risk_category VARCHAR(32),
        management_level VARCHAR(32),
        violation_score NUMERIC(5,2) DEFAULT 0,
        driver_compliance_score NUMERIC(5,2) DEFAULT 0,
        training_compliance_score NUMERIC(5,2) DEFAULT 0,
        incident_score NUMERIC(5,2) DEFAULT 0,
        management_execution_score NUMERIC(5,2) DEFAULT 0,
        base_total_score NUMERIC(5,2) DEFAULT 0,
        special_weighted_score NUMERIC(5,2) DEFAULT 0,
        final_score NUMERIC(5,2) DEFAULT 0,
        risk_level VARCHAR(32),
        risk_level_code VARCHAR(32),
        special_rules_triggered TEXT[],
        special_weightings TEXT[],
        calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_risk_score_employee FOREIGN KEY (employee_id) REFERENCES employee(id)
      );
    `);

    console.log('[Sprint6.2] 创建 risk_score_records 表成功');

    // 2. 创建 risk_level_records 表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS risk_level_records (
        id BIGSERIAL PRIMARY KEY,
        employee_id BIGINT NOT NULL,
        employee_code VARCHAR(64),
        employee_name VARCHAR(128),
        position_id BIGINT,
        position_name VARCHAR(128),
        risk_level VARCHAR(32),
        risk_level_code VARCHAR(32),
        risk_score NUMERIC(5,2) DEFAULT 0,
        previous_risk_level VARCHAR(32),
        previous_risk_score NUMERIC(5,2),
        level_change VARCHAR(32),
        change_reason TEXT,
        valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        valid_to TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_risk_level_employee FOREIGN KEY (employee_id) REFERENCES employee(id)
      );
    `);

    console.log('[Sprint6.2] 创建 risk_level_records 表成功');

    // 3. 创建索引
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_risk_score_employee_id ON risk_score_records(employee_id);
      CREATE INDEX IF NOT EXISTS idx_risk_score_calculated_at ON risk_score_records(calculated_at);
      CREATE INDEX IF NOT EXISTS idx_risk_level_employee_id ON risk_level_records(employee_id);
      CREATE INDEX IF NOT EXISTS idx_risk_level_valid_from ON risk_level_records(valid_from);
    `);

    console.log('[Sprint6.2] 创建索引成功');

    console.log('[Sprint6.2] 风险评分表初始化完成！');
    process.exit(0);
  } catch (e) {
    console.error('[Sprint6.2] 创建风险评分表失败:', e.message);
    process.exit(1);
  }
};

createTables();
