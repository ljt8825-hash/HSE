/**
 * HSE 智能闭环工作流迁移脚本
 */

const { pool } = require('../config/db');

async function executeMigration() {
  console.log('=======================================');
  console.log('  HSE 智能闭环工作流 SQL迁移');
  console.log('=======================================');
  console.log('');

  const sqlStatements = [
    // 1. 创建检查任务表
    `CREATE TABLE IF NOT EXISTS hse_inspection_tasks (
      id BIGSERIAL PRIMARY KEY,
      plan_id BIGINT NOT NULL,
      task_code VARCHAR(64) UNIQUE NOT NULL,
      executor_id BIGINT,
      executor_name VARCHAR(128),
      department_id BIGINT,
      scheduled_date DATE NOT NULL,
      completed_date DATE,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      result VARCHAR(64),
      findings_count INT DEFAULT 0,
      remark TEXT,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_inspection_tasks_plan ON hse_inspection_tasks(plan_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_inspection_tasks_executor ON hse_inspection_tasks(executor_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_inspection_tasks_dept ON hse_inspection_tasks(department_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_inspection_tasks_status ON hse_inspection_tasks(status)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_inspection_tasks_date ON hse_inspection_tasks(scheduled_date)`,
    
    // 2. 创建统一任务中心表
    `CREATE TABLE IF NOT EXISTS hse_tasks (
      id BIGSERIAL PRIMARY KEY,
      task_code VARCHAR(64) UNIQUE NOT NULL,
      task_type VARCHAR(32) NOT NULL,
      source_event_id BIGINT,
      source_table VARCHAR(64),
      source_id BIGINT,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      responsible_person_id BIGINT,
      responsible_person VARCHAR(128),
      department_id BIGINT,
      priority VARCHAR(16) DEFAULT 'normal',
      deadline DATE,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      completed_at TIMESTAMPTZ,
      overdue_days INT DEFAULT 0,
      is_overdue BOOLEAN DEFAULT FALSE,
      reminder_sent BOOLEAN DEFAULT FALSE,
      escalation_level INT DEFAULT 0,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_tasks_type ON hse_tasks(task_type)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_tasks_source_event ON hse_tasks(source_event_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_tasks_responsible ON hse_tasks(responsible_person_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_tasks_dept ON hse_tasks(department_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_tasks_status ON hse_tasks(status)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_tasks_deadline ON hse_tasks(deadline)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_tasks_overdue ON hse_tasks(is_overdue)`,
    
    // 3. 更新已有表字段
    `ALTER TABLE IF EXISTS hse_events ADD COLUMN IF NOT EXISTS task_id BIGINT`,
    `ALTER TABLE IF EXISTS hse_events ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE IF EXISTS hse_rectifications ADD COLUMN IF NOT EXISTS task_id BIGINT`,
    `ALTER TABLE IF EXISTS hse_reviews ADD COLUMN IF NOT EXISTS task_id BIGINT`,
    
    // 4. 检查任务执行记录表
    `CREATE TABLE IF NOT EXISTS hse_inspection_executions (
      id BIGSERIAL PRIMARY KEY,
      task_id BIGINT NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      executor_id BIGINT,
      executor_name VARCHAR(128),
      items JSONB,
      findings JSONB,
      photos JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_inspection_executions_task ON hse_inspection_executions(task_id)`,
    
    // 5. 提醒记录表
    `CREATE TABLE IF NOT EXISTS hse_task_reminders (
      id BIGSERIAL PRIMARY KEY,
      task_id BIGINT NOT NULL,
      reminder_type VARCHAR(32) NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      channel VARCHAR(32),
      recipients JSONB,
      content TEXT,
      status VARCHAR(32) DEFAULT 'sent',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_task_reminders_task ON hse_task_reminders(task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_task_reminders_type ON hse_task_reminders(reminder_type)`,
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
    { name: 'hse_inspection_tasks 表', sql: "SELECT to_regclass('hse_inspection_tasks') AS exists" },
    { name: 'hse_tasks 表', sql: "SELECT to_regclass('hse_tasks') AS exists" },
    { name: 'hse_inspection_executions 表', sql: "SELECT to_regclass('hse_inspection_executions') AS exists" },
    { name: 'hse_task_reminders 表', sql: "SELECT to_regclass('hse_task_reminders') AS exists" },
    { name: 'hse_events.task_id', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hse_events' AND column_name = 'task_id') AS exists" },
    { name: 'hse_events.auto_generated', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hse_events' AND column_name = 'auto_generated') AS exists" },
    { name: 'hse_rectifications.task_id', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hse_rectifications' AND column_name = 'task_id') AS exists" },
    { name: 'hse_reviews.task_id', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hse_reviews' AND column_name = 'task_id') AS exists" },
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