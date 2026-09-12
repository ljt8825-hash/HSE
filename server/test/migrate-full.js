/**
 * HSE 闭环引擎完整迁移脚本
 * 创建所有必要的表结构
 */

const { pool } = require('../config/db');

async function executeMigration() {
  console.log('=======================================');
  console.log('  HSE 闭环引擎完整迁移');
  console.log('=======================================');
  console.log('');

  const sqlStatements = [
    // ==================== 基础表创建 ====================
    
    // hse_events（事件中心表）
    `CREATE TABLE IF NOT EXISTS hse_events (
      id BIGSERIAL PRIMARY KEY,
      event_code VARCHAR(64) UNIQUE NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      severity VARCHAR(32) DEFAULT 'info',
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      occurred_at TIMESTAMPTZ,
      source_table VARCHAR(64),
      source_id BIGINT,
      risk_source_id BIGINT,
      parent_event_id BIGINT,
      department_id BIGINT,
      business_area VARCHAR(64),
      risk_level_snapshot VARCHAR(16),
      location VARCHAR(255),
      impacted_persons INT DEFAULT 0,
      property_damage DECIMAL(12,2),
      root_cause TEXT,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_events_type ON hse_events(event_type)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_events_risk ON hse_events(risk_source_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_events_parent ON hse_events(parent_event_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_events_dept ON hse_events(department_id)`,
    
    // hse_event_links（事件关联表）
    `CREATE TABLE IF NOT EXISTS hse_event_links (
      id BIGSERIAL PRIMARY KEY,
      from_event_id BIGINT NOT NULL,
      to_event_id BIGINT NOT NULL,
      link_type VARCHAR(64) NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_event_links_from ON hse_event_links(from_event_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_event_links_to ON hse_event_links(to_event_id)`,
    
    // hse_event_timeline（事件时间线表）
    `CREATE TABLE IF NOT EXISTS hse_event_timeline (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status_from VARCHAR(32),
      status_to VARCHAR(32),
      action VARCHAR(128),
      actor_id BIGINT,
      actor_name VARCHAR(128),
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_event_timeline_event ON hse_event_timeline(event_id)`,
    
    // hse_risk_factors（危险因素表）
    `CREATE TABLE IF NOT EXISTS hse_risk_factors (
      id BIGSERIAL PRIMARY KEY,
      factor_code VARCHAR(64) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(64),
      risk_level VARCHAR(16),
      risk_value INT,
      is_controlled BOOLEAN DEFAULT FALSE,
      risk_source_id BIGINT,
      risk_object_id BIGINT,
      description TEXT,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_risk_factors_source ON hse_risk_factors(risk_source_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_risk_factors_object ON hse_risk_factors(risk_object_id)`,
    
    // hse_control_measures（控制措施表）
    `CREATE TABLE IF NOT EXISTS hse_control_measures (
      id BIGSERIAL PRIMARY KEY,
      measure_code VARCHAR(64) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(64),
      content TEXT,
      risk_factor_id BIGINT,
      inspection_plan_id BIGINT,
      responsible_person_id BIGINT,
      responsible_person_name VARCHAR(128),
      department_id BIGINT,
      frequency VARCHAR(32),
      is_active BOOLEAN DEFAULT TRUE,
      effectiveness_score INT,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_control_measures_factor ON hse_control_measures(risk_factor_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_control_measures_plan ON hse_control_measures(inspection_plan_id)`,
    
    // hse_rectifications（整改记录表）
    `CREATE TABLE IF NOT EXISTS hse_rectifications (
      id BIGSERIAL PRIMARY KEY,
      rect_code VARCHAR(64) UNIQUE NOT NULL,
      hazard_id BIGINT,
      measure TEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      deadline DATE,
      responsible_person_id BIGINT,
      responsible_person_name VARCHAR(128),
      department_id BIGINT,
      inspection_plan_id BIGINT,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      is_overdue BOOLEAN DEFAULT FALSE,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_rectifications_hazard ON hse_rectifications(hazard_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_rectifications_plan ON hse_rectifications(inspection_plan_id)`,
    
    // hse_reviews（复查记录表）
    `CREATE TABLE IF NOT EXISTS hse_reviews (
      id BIGSERIAL PRIMARY KEY,
      review_code VARCHAR(64) UNIQUE NOT NULL,
      rectification_id BIGINT,
      result VARCHAR(32),
      score INT,
      comment TEXT,
      review_date TIMESTAMPTZ,
      reviewer_name VARCHAR(128),
      is_recurred BOOLEAN DEFAULT FALSE,
      new_hazard_id BIGINT,
      risk_source_id BIGINT,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hse_reviews_rect ON hse_reviews(rectification_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hse_reviews_risk ON hse_reviews(risk_source_id)`,
    
    // ==================== 闭环引擎新增表 ====================
    
    // hse_inspection_plans（检查计划表）
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
    
    // hse_risk_objects（风险对象表）
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
    
    // ==================== 闭环查询视图 ====================
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

  await runVerification();
}

async function runVerification() {
  console.log('');
  console.log('=======================================');
  console.log('  验证测试');
  console.log('=======================================');
  console.log('');

  const verifications = [
    { name: 'hse_events 表', sql: "SELECT to_regclass('hse_events') AS exists" },
    { name: 'hse_event_links 表', sql: "SELECT to_regclass('hse_event_links') AS exists" },
    { name: 'hse_event_timeline 表', sql: "SELECT to_regclass('hse_event_timeline') AS exists" },
    { name: 'hse_risk_factors 表', sql: "SELECT to_regclass('hse_risk_factors') AS exists" },
    { name: 'hse_control_measures 表', sql: "SELECT to_regclass('hse_control_measures') AS exists" },
    { name: 'hse_rectifications 表', sql: "SELECT to_regclass('hse_rectifications') AS exists" },
    { name: 'hse_reviews 表', sql: "SELECT to_regclass('hse_reviews') AS exists" },
    { name: 'hse_inspection_plans 表', sql: "SELECT to_regclass('hse_inspection_plans') AS exists" },
    { name: 'hse_risk_objects 表', sql: "SELECT to_regclass('hse_risk_objects') AS exists" },
    { name: 'hse_event_chain_view 视图', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'hse_event_chain_view') AS exists" },
    { name: 'hse_events.business_area', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hse_events' AND column_name = 'business_area') AS exists" },
    { name: 'hse_events.risk_level_snapshot', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hse_events' AND column_name = 'risk_level_snapshot') AS exists" },
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