/**
 * HSE 闭环引擎 SQL迁移脚本
 */

const { pool } = require('../config/db');

async function executeMigration() {
  console.log('=======================================');
  console.log('  HSE 闭环引擎 SQL迁移');
  console.log('=======================================');
  console.log('');

  const sqlStatements = [
    // 1. hse_events 增加字段
    `ALTER TABLE IF EXISTS hse_events ADD COLUMN IF NOT EXISTS business_area VARCHAR(64)`,
    `ALTER TABLE IF EXISTS hse_events ADD COLUMN IF NOT EXISTS risk_level_snapshot VARCHAR(16)`,
    
    // 2. 创建检查计划表
    `CREATE TABLE IF NOT EXISTS hse_inspection_plans (
      id BIGSERIAL PRIMARY KEY,
      plan_code VARCHAR(64) UNIQUE NOT NULL,
      plan_name VARCHAR(255) NOT NULL,
      risk_source_id BIGINT,
      department_id BIGINT,
      cycle_type VARCHAR(32) NOT NULL DEFAULT 'monthly',
      start_date DATE NOT NULL,
      end_date DATE,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_inspection_plans_source ON hse_inspection_plans(risk_source_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_inspection_plans_dept ON hse_inspection_plans(department_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_inspection_plans_status ON hse_inspection_plans(status)`,
    
    // 3. 创建风险对象表
    `CREATE TABLE IF NOT EXISTS hse_risk_objects (
      id BIGSERIAL PRIMARY KEY,
      object_name VARCHAR(255) NOT NULL,
      object_type VARCHAR(64) NOT NULL,
      department_id BIGINT,
      location VARCHAR(255),
      description TEXT,
      risk_level VARCHAR(16),
      is_active BOOLEAN DEFAULT TRUE,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_risk_objects_type ON hse_risk_objects(object_type)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_risk_objects_dept ON hse_risk_objects(department_id)`,
    
    // 4. 更新已有表的关联字段
    `ALTER TABLE IF EXISTS hse_risk_factors ADD COLUMN IF NOT EXISTS risk_object_id BIGINT`,
    `CREATE INDEX IF NOT EXISTS idx_hse_risk_factors_object ON hse_risk_factors(risk_object_id)`,
    
    `ALTER TABLE IF EXISTS hse_control_measures ADD COLUMN IF NOT EXISTS inspection_plan_id BIGINT`,
    `CREATE INDEX IF NOT EXISTS idx_hse_control_measures_plan ON hse_control_measures(inspection_plan_id)`,
    
    `ALTER TABLE IF EXISTS hse_rectifications ADD COLUMN IF NOT EXISTS inspection_plan_id BIGINT`,
    `CREATE INDEX IF NOT EXISTS idx_hse_rectifications_plan ON hse_rectifications(inspection_plan_id)`,
    
    `ALTER TABLE IF EXISTS hse_reviews ADD COLUMN IF NOT EXISTS risk_source_id BIGINT`,
    `CREATE INDEX IF NOT EXISTS idx_hse_reviews_risk ON hse_reviews(risk_source_id)`,
    
    // 5. 创建闭环查询视图
    `CREATE OR REPLACE VIEW hse_event_chain_view AS
      WITH recursive event_chain AS (
        SELECT
          e.id AS event_id,
          e.event_code,
          e.event_type,
          e.title,
          e.severity,
          e.status,
          e.occurred_at,
          e.source_table,
          e.source_id,
          e.risk_source_id,
          e.parent_event_id,
          e.department_id,
          e.created_at,
          0 AS depth,
          ARRAY[e.id] AS path,
          JSONB_BUILD_OBJECT(
            'type', e.event_type,
            'code', e.event_code,
            'title', e.title,
            'severity', e.severity,
            'status', e.status,
            'occurred_at', e.occurred_at,
            'source_table', e.source_table,
            'source_id', e.source_id
          ) AS node_data
        FROM hse_events e
        WHERE e.is_deleted = FALSE
        
        UNION ALL
        
        SELECT
          e.id AS event_id,
          e.event_code,
          e.event_type,
          e.title,
          e.severity,
          e.status,
          e.occurred_at,
          e.source_table,
          e.source_id,
          e.risk_source_id,
          e.parent_event_id,
          e.department_id,
          e.created_at,
          ec.depth + 1 AS depth,
          ec.path || e.id AS path,
          JSONB_BUILD_OBJECT(
            'type', e.event_type,
            'code', e.event_code,
            'title', e.title,
            'severity', e.severity,
            'status', e.status,
            'occurred_at', e.occurred_at,
            'source_table', e.source_table,
            'source_id', e.source_id
          ) AS node_data
        FROM hse_events e
        JOIN event_chain ec ON e.parent_event_id = ec.event_id
        WHERE e.is_deleted = FALSE AND e.id <> ALL(ec.path)
      )
      SELECT
        ec.event_id,
        ec.event_code,
        ec.event_type,
        ec.title,
        ec.severity,
        ec.status,
        ec.occurred_at,
        ec.source_table,
        ec.source_id,
        ec.risk_source_id,
        ec.parent_event_id,
        ec.department_id,
        ec.depth,
        ec.path,
        ec.node_data,
        rf.factor_code,
        rf.name AS risk_factor_name,
        rf.risk_level AS factor_risk_level,
        cm.measure_code,
        cm.name AS measure_name,
        cm.type AS measure_type,
        ip.plan_code,
        ip.plan_name,
        ip.cycle_type,
        ro.object_name,
        ro.object_type,
        r.source_id AS risk_source_code,
        r.name AS risk_source_name,
        r.level AS risk_source_level,
        d.name AS department_name
      FROM event_chain ec
      LEFT JOIN hse_risk_factors rf ON ec.risk_source_id = rf.risk_source_id
      LEFT JOIN hse_control_measures cm ON rf.id = cm.risk_factor_id
      LEFT JOIN hse_inspection_plans ip ON cm.inspection_plan_id = ip.id OR ec.source_id = ip.id
      LEFT JOIN hse_risk_objects ro ON rf.risk_object_id = ro.id
      LEFT JOIN risk_sources r ON ec.risk_source_id = r.id
      LEFT JOIN departments d ON ec.department_id = d.id
      ORDER BY ec.depth ASC, ec.occurred_at ASC`,
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

  // 验证测试
  await runVerification();
}

async function runVerification() {
  console.log('');
  console.log('=======================================');
  console.log('  验证测试');
  console.log('=======================================');
  console.log('');

  const verifications = [
    { name: 'hse_inspection_plans 表', sql: "SELECT to_regclass('hse_inspection_plans') AS exists" },
    { name: 'hse_risk_objects 表', sql: "SELECT to_regclass('hse_risk_objects') AS exists" },
    { name: 'hse_event_chain_view 视图', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'hse_event_chain_view') AS exists" },
    { name: 'hse_events.business_area', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hse_events' AND column_name = 'business_area') AS exists" },
    { name: 'hse_events.risk_level_snapshot', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hse_events' AND column_name = 'risk_level_snapshot') AS exists" },
    { name: 'hse_risk_factors.risk_object_id', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hse_risk_factors' AND column_name = 'risk_object_id') AS exists" },
    { name: 'hse_control_measures.inspection_plan_id', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hse_control_measures' AND column_name = 'inspection_plan_id') AS exists" },
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