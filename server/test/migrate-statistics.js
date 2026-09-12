/**
 * HSE 安全数据分析中心 SQL迁移脚本
 */

const { pool } = require('../config/db');

async function executeMigration() {
  console.log('=======================================');
  console.log('  HSE 安全数据分析中心 SQL迁移');
  console.log('=======================================');
  console.log('');

  const sqlStatements = [
    // 1. 每日统计表
    `CREATE TABLE IF NOT EXISTS hse_statistics_daily (
      id BIGSERIAL PRIMARY KEY,
      stat_date DATE NOT NULL UNIQUE,
      event_count INT DEFAULT 0,
      hazard_count INT DEFAULT 0,
      accident_count INT DEFAULT 0,
      violation_count INT DEFAULT 0,
      patrol_alert_count INT DEFAULT 0,
      iot_alert_count INT DEFAULT 0,
      task_total INT DEFAULT 0,
      task_completed INT DEFAULT 0,
      task_overdue INT DEFAULT 0,
      task_pending INT DEFAULT 0,
      rectification_total INT DEFAULT 0,
      rectification_done INT DEFAULT 0,
      review_total INT DEFAULT 0,
      review_passed INT DEFAULT 0,
      high_risk_count INT DEFAULT 0,
      medium_risk_count INT DEFAULT 0,
      low_risk_count INT DEFAULT 0,
      training_rate DECIMAL(5,2) DEFAULT 0,
      completion_rate DECIMAL(5,2) DEFAULT 0,
      rectification_rate DECIMAL(5,2) DEFAULT 0,
      department_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_stats_daily_date ON hse_statistics_daily(stat_date)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_stats_daily_dept ON hse_statistics_daily(department_id)`,
    
    // 2. 每月统计表
    `CREATE TABLE IF NOT EXISTS hse_statistics_monthly (
      id BIGSERIAL PRIMARY KEY,
      stat_month VARCHAR(7) NOT NULL UNIQUE,
      stat_year INT NOT NULL,
      stat_month_num INT NOT NULL,
      event_count INT DEFAULT 0,
      hazard_count INT DEFAULT 0,
      accident_count INT DEFAULT 0,
      violation_count INT DEFAULT 0,
      patrol_alert_count INT DEFAULT 0,
      iot_alert_count INT DEFAULT 0,
      task_total INT DEFAULT 0,
      task_completed INT DEFAULT 0,
      task_overdue INT DEFAULT 0,
      task_pending INT DEFAULT 0,
      rectification_total INT DEFAULT 0,
      rectification_done INT DEFAULT 0,
      review_total INT DEFAULT 0,
      review_passed INT DEFAULT 0,
      high_risk_count INT DEFAULT 0,
      medium_risk_count INT DEFAULT 0,
      low_risk_count INT DEFAULT 0,
      training_rate DECIMAL(5,2) DEFAULT 0,
      completion_rate DECIMAL(5,2) DEFAULT 0,
      rectification_rate DECIMAL(5,2) DEFAULT 0,
      avg_response_time DECIMAL(10,2) DEFAULT 0,
      avg_rectify_time DECIMAL(10,2) DEFAULT 0,
      department_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_stats_monthly_month ON hse_statistics_monthly(stat_month)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_stats_monthly_year ON hse_statistics_monthly(stat_year)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_stats_monthly_dept ON hse_statistics_monthly(department_id)`,
    
    // 3. 每年统计表
    `CREATE TABLE IF NOT EXISTS hse_statistics_yearly (
      id BIGSERIAL PRIMARY KEY,
      stat_year INT NOT NULL UNIQUE,
      event_count INT DEFAULT 0,
      hazard_count INT DEFAULT 0,
      accident_count INT DEFAULT 0,
      violation_count INT DEFAULT 0,
      patrol_alert_count INT DEFAULT 0,
      iot_alert_count INT DEFAULT 0,
      task_total INT DEFAULT 0,
      task_completed INT DEFAULT 0,
      task_overdue INT DEFAULT 0,
      task_pending INT DEFAULT 0,
      rectification_total INT DEFAULT 0,
      rectification_done INT DEFAULT 0,
      review_total INT DEFAULT 0,
      review_passed INT DEFAULT 0,
      high_risk_count INT DEFAULT 0,
      medium_risk_count INT DEFAULT 0,
      low_risk_count INT DEFAULT 0,
      training_rate DECIMAL(5,2) DEFAULT 0,
      completion_rate DECIMAL(5,2) DEFAULT 0,
      rectification_rate DECIMAL(5,2) DEFAULT 0,
      avg_response_time DECIMAL(10,2) DEFAULT 0,
      avg_rectify_time DECIMAL(10,2) DEFAULT 0,
      accident_rate_trend DECIMAL(5,2) DEFAULT 0,
      hazard_rate_trend DECIMAL(5,2) DEFAULT 0,
      department_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_stats_yearly_year ON hse_statistics_yearly(stat_year)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_stats_yearly_dept ON hse_statistics_yearly(department_id)`,
    
    // 4. 部门统计表
    `CREATE TABLE IF NOT EXISTS hse_statistics_dept (
      id BIGSERIAL PRIMARY KEY,
      department_id BIGINT NOT NULL,
      department_name VARCHAR(128),
      stat_date DATE NOT NULL,
      stat_period VARCHAR(10) NOT NULL,
      event_count INT DEFAULT 0,
      hazard_count INT DEFAULT 0,
      accident_count INT DEFAULT 0,
      task_total INT DEFAULT 0,
      task_completed INT DEFAULT 0,
      task_overdue INT DEFAULT 0,
      completion_rate DECIMAL(5,2) DEFAULT 0,
      rectification_rate DECIMAL(5,2) DEFAULT 0,
      high_risk_count INT DEFAULT 0,
      ranking INT DEFAULT 0,
      score DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (department_id, stat_date, stat_period)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_stats_dept_date ON hse_statistics_dept(stat_date)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_stats_dept_period ON hse_statistics_dept(stat_period)`,
    
    // 5. 责任人统计表
    `CREATE TABLE IF NOT EXISTS hse_statistics_person (
      id BIGSERIAL PRIMARY KEY,
      person_id BIGINT,
      person_name VARCHAR(128) NOT NULL,
      department_id BIGINT,
      stat_date DATE NOT NULL,
      stat_period VARCHAR(10) NOT NULL,
      task_total INT DEFAULT 0,
      task_completed INT DEFAULT 0,
      task_overdue INT DEFAULT 0,
      completion_rate DECIMAL(5,2) DEFAULT 0,
      avg_completion_time DECIMAL(10,2) DEFAULT 0,
      hazard_discovered INT DEFAULT 0,
      rectification_done INT DEFAULT 0,
      ranking INT DEFAULT 0,
      score DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (person_id, stat_date, stat_period)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_stats_person_date ON hse_statistics_person(stat_date)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_stats_person_name ON hse_statistics_person(person_name)`,
  ];

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < sqlStatements.length; i++) {
    const stmt = sqlStatements[i].trim();
    try {
      await pool.query(stmt);
      successCount++;
      console.log(`✓ 语句 ${i + 1}: OK`);
    } catch (err) {
      failCount++;
      console.log(`✗ 语句 ${i + 1}: ${err.message}`);
    }
  }

  console.log('');
  console.log(`迁移完成！成功: ${successCount}, 失败: ${failCount}`);

  await runVerification();
}

async function runVerification() {
  console.log('');
  console.log('=======================================');
  console.log('  验证测试');
  console.log('=======================================');
  console.log('');

  const verifications = [
    { name: 'hse_statistics_daily 表', sql: "SELECT to_regclass('hse_statistics_daily') AS exists" },
    { name: 'hse_statistics_monthly 表', sql: "SELECT to_regclass('hse_statistics_monthly') AS exists" },
    { name: 'hse_statistics_yearly 表', sql: "SELECT to_regclass('hse_statistics_yearly') AS exists" },
    { name: 'hse_statistics_dept 表', sql: "SELECT to_regclass('hse_statistics_dept') AS exists" },
    { name: 'hse_statistics_person 表', sql: "SELECT to_regclass('hse_statistics_person') AS exists" },
  ];

  let passed = 0;
  let failed = 0;

  for (const v of verifications) {
    try {
      const result = await pool.query(v.sql);
      const exists = result.rows[0].exists !== null && result.rows[0].exists !== false;
      if (exists) {
        passed++;
        console.log(`✓ ${v.name}: 存在`);
      } else {
        failed++;
        console.log(`✗ ${v.name}: 不存在`);
      }
    } catch (err) {
      failed++;
      console.log(`✗ ${v.name}: ${err.message}`);
    }
  }

  console.log('');
  console.log(`验证完成！通过: ${passed}, 失败: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

executeMigration();