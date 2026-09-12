/**
 * HSE 智能报告中心 SQL迁移脚本
 */

const { pool } = require('../config/db');

async function executeMigration() {
  console.log('=======================================');
  console.log('  HSE 智能报告中心 SQL迁移');
  console.log('=======================================');
  console.log('');

  const sqlStatements = [
    // 1. 报告模板表
    `CREATE TABLE IF NOT EXISTS hse_report_templates (
      id BIGSERIAL PRIMARY KEY,
      template_name VARCHAR(128) NOT NULL,
      report_type VARCHAR(20) NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly', 'yearly')),
      content_config JSONB NOT NULL,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    
    // 2. 报告记录表
    `CREATE TABLE IF NOT EXISTS hse_reports (
      id BIGSERIAL PRIMARY KEY,
      report_name VARCHAR(256) NOT NULL,
      report_type VARCHAR(20) NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly', 'yearly')),
      report_period VARCHAR(20) NOT NULL,
      report_date DATE NOT NULL,
      report_data JSONB NOT NULL,
      report_html TEXT,
      generated_by BIGINT,
      status VARCHAR(20) DEFAULT 'generated' CHECK (status IN ('generated', 'exported', 'archived')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    
    // 3. 创建索引
    `CREATE INDEX IF NOT EXISTS idx_hse_report_templates_type ON hse_report_templates(report_type)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_report_templates_status ON hse_report_templates(status)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_reports_type ON hse_reports(report_type)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_reports_period ON hse_reports(report_period)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_reports_date ON hse_reports(report_date)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_reports_status ON hse_reports(status)`,
    
    // 4. 日报模板
    `INSERT INTO hse_report_templates (template_name, report_type, content_config, status) VALUES (
      '安全日报模板',
      'daily',
      '{"sections": [{"name": "安全总体情况", "enabled": true}, {"name": "事件情况", "enabled": true}, {"name": "隐患情况", "enabled": true}, {"name": "任务完成情况", "enabled": true}, {"name": "风险情况", "enabled": true}, {"name": "重点关注", "enabled": true}], "format": {"header": true, "footer": true, "watermark": "安全日报"}}',
      'active'
    ) ON CONFLICT DO NOTHING`,
    
    // 5. 周报模板
    `INSERT INTO hse_report_templates (template_name, report_type, content_config, status) VALUES (
      '安全周报模板',
      'weekly',
      '{"sections": [{"name": "安全总体情况", "enabled": true}, {"name": "事故情况", "enabled": true}, {"name": "隐患分析", "enabled": true}, {"name": "风险变化", "enabled": true}, {"name": "整改情况", "enabled": true}, {"name": "重点关注问题", "enabled": true}, {"name": "改进建议", "enabled": true}], "format": {"header": true, "footer": true, "watermark": "安全周报", "summary": true}}',
      'active'
    ) ON CONFLICT DO NOTHING`,
    
    // 6. 月报模板
    `INSERT INTO hse_report_templates (template_name, report_type, content_config, status) VALUES (
      '安全月报模板',
      'monthly',
      '{"sections": [{"name": "安全总体情况", "enabled": true}, {"name": "事故情况", "enabled": true}, {"name": "隐患分析", "enabled": true}, {"name": "风险变化", "enabled": true}, {"name": "整改情况", "enabled": true}, {"name": "重点关注问题", "enabled": true}, {"name": "改进建议", "enabled": true}], "format": {"header": true, "footer": true, "watermark": "安全月报", "summary": true, "comparison": true}}',
      'active'
    ) ON CONFLICT DO NOTHING`,
    
    // 7. 年度报告模板
    `INSERT INTO hse_report_templates (template_name, report_type, content_config, status) VALUES (
      '年度安全总结模板',
      'yearly',
      '{"sections": [{"name": "安全总体情况", "enabled": true}, {"name": "事故情况", "enabled": true}, {"name": "隐患分析", "enabled": true}, {"name": "风险变化", "enabled": true}, {"name": "整改情况", "enabled": true}, {"name": "重点关注问题", "enabled": true}, {"name": "改进建议", "enabled": true}, {"name": "年度总结", "enabled": true}, {"name": "下年度计划", "enabled": true}], "format": {"header": true, "footer": true, "watermark": "年度安全总结", "summary": true, "comparison": true, "charts": true}}',
      'active'
    ) ON CONFLICT DO NOTHING`,
    
    // 8. 月度报告汇总视图
    `CREATE OR REPLACE VIEW v_hse_monthly_report_summary AS
    SELECT
      stat_month,
      SUM(event_count) AS total_events,
      SUM(hazard_count) AS total_hazards,
      SUM(accident_count) AS total_accidents,
      SUM(task_total) AS total_tasks,
      SUM(task_completed) AS completed_tasks,
      SUM(task_overdue) AS overdue_tasks,
      AVG(completion_rate) AS avg_completion_rate,
      AVG(rectification_rate) AS avg_rectification_rate,
      SUM(high_risk_count) AS total_high_risks,
      SUM(medium_risk_count) AS total_medium_risks,
      SUM(low_risk_count) AS total_low_risks
    FROM hse_statistics_monthly
    GROUP BY stat_month
    ORDER BY stat_month DESC`,
    
    // 9. 年度报告汇总视图
    `CREATE OR REPLACE VIEW v_hse_yearly_report_summary AS
    SELECT
      stat_year,
      SUM(event_count) AS total_events,
      SUM(hazard_count) AS total_hazards,
      SUM(accident_count) AS total_accidents,
      SUM(task_total) AS total_tasks,
      SUM(task_completed) AS completed_tasks,
      SUM(task_overdue) AS overdue_tasks,
      AVG(completion_rate) AS avg_completion_rate,
      AVG(rectification_rate) AS avg_rectification_rate,
      SUM(high_risk_count) AS total_high_risks,
      SUM(medium_risk_count) AS total_medium_risks,
      SUM(low_risk_count) AS total_low_risks
    FROM hse_statistics_yearly
    GROUP BY stat_year
    ORDER BY stat_year DESC`,
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
    { name: 'hse_report_templates 表', sql: "SELECT to_regclass('hse_report_templates') AS exists" },
    { name: 'hse_reports 表', sql: "SELECT to_regclass('hse_reports') AS exists" },
    { name: 'v_hse_monthly_report_summary 视图', sql: "SELECT to_regclass('v_hse_monthly_report_summary') AS exists" },
    { name: 'v_hse_yearly_report_summary 视图', sql: "SELECT to_regclass('v_hse_yearly_report_summary') AS exists" },
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