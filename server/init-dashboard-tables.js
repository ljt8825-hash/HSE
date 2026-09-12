/**
 * Sprint6.3-A 驾驶舱数据模型初始化脚本
 * 
 * 创建表：
 *   - risk_score_history: 风险评分历史表（趋势分析）
 *   - risk_level_config: 风险等级配置表（参数化）
 *   - hse_grid_inspection_records: 网格巡查记录表（管理履职扩展）
 * 
 * 使用方式：node server/init-dashboard-tables.js
 */

const { pool } = require('./config/db');

const createTables = async () => {
  try {
    console.log('[Sprint6.3-A] 开始创建驾驶舱数据模型表...');

    // 1. 创建 risk_score_history 表（风险评分历史表 - 趋势分析）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS risk_score_history (
        id BIGSERIAL PRIMARY KEY,
        employee_id BIGINT NOT NULL,
        employee_code VARCHAR(64),
        employee_name VARCHAR(128),
        position_id BIGINT,
        position_name VARCHAR(128),
        risk_category VARCHAR(32),
        management_level VARCHAR(32),
        org_id BIGINT,
        org_name VARCHAR(256),
        violation_score NUMERIC(5,2) DEFAULT 0,
        driver_compliance_score NUMERIC(5,2) DEFAULT 0,
        training_compliance_score NUMERIC(5,2) DEFAULT 0,
        incident_score NUMERIC(5,2) DEFAULT 0,
        management_execution_score NUMERIC(5,2) DEFAULT 0,
        total_score NUMERIC(5,2) DEFAULT 0,
        risk_level VARCHAR(32),
        risk_level_code VARCHAR(32),
        special_rules_triggered TEXT[],
        calculate_date DATE NOT NULL,
        calculate_period VARCHAR(32) DEFAULT 'daily',
        data_source VARCHAR(64) DEFAULT 'auto',
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_score_history_employee FOREIGN KEY (employee_id) REFERENCES employee(id)
      );
    `);
    console.log('[Sprint6.3-A] 创建 risk_score_history 表成功');

    // 2. 创建 risk_level_config 表（风险等级配置表 - 参数化）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS risk_level_config (
        id BIGSERIAL PRIMARY KEY,
        level_code VARCHAR(32) NOT NULL UNIQUE,
        level_name VARCHAR(32) NOT NULL,
        level_order INTEGER NOT NULL,
        min_score NUMERIC(5,2) NOT NULL,
        max_score NUMERIC(5,2) NOT NULL,
        color_code VARCHAR(16),
        description TEXT,
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('[Sprint6.3-A] 创建 risk_level_config 表成功');

    // 3. 创建 hse_grid_inspection_records 表（网格巡查记录表 - 管理履职扩展）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hse_grid_inspection_records (
        id BIGSERIAL PRIMARY KEY,
        employee_id BIGINT NOT NULL,
        employee_code VARCHAR(64),
        employee_name VARCHAR(128),
        grid_level VARCHAR(32) NOT NULL,
        grid_role VARCHAR(64),
        inspection_date DATE NOT NULL,
        inspection_type VARCHAR(32) DEFAULT 'routine',
        inspection_area VARCHAR(256),
        inspection_content TEXT,
        problems_found TEXT,
        rectification_status VARCHAR(32) DEFAULT 'pending',
        rectification_deadline DATE,
        rectification_result TEXT,
        inspector_id BIGINT,
        inspector_name VARCHAR(128),
        org_id BIGINT,
        org_name VARCHAR(256),
        remark TEXT,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_grid_inspection_employee FOREIGN KEY (employee_id) REFERENCES employee(id)
      );
    `);
    console.log('[Sprint6.3-A] 创建 hse_grid_inspection_records 表成功');

    // 4. 创建索引
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_score_history_employee_id ON risk_score_history(employee_id);
      CREATE INDEX IF NOT EXISTS idx_score_history_calculate_date ON risk_score_history(calculate_date);
      CREATE INDEX IF NOT EXISTS idx_score_history_employee_date ON risk_score_history(employee_id, calculate_date);
      CREATE INDEX IF NOT EXISTS idx_score_history_org_id ON risk_score_history(org_id);
      CREATE INDEX IF NOT EXISTS idx_score_history_risk_level ON risk_score_history(risk_level_code);
      CREATE INDEX IF NOT EXISTS idx_risk_level_config_level_code ON risk_level_config(level_code);
      CREATE INDEX IF NOT EXISTS idx_grid_inspection_employee_id ON hse_grid_inspection_records(employee_id);
      CREATE INDEX IF NOT EXISTS idx_grid_inspection_date ON hse_grid_inspection_records(inspection_date);
      CREATE INDEX IF NOT EXISTS idx_grid_inspection_grid_level ON hse_grid_inspection_records(grid_level);
      CREATE INDEX IF NOT EXISTS idx_grid_inspection_org_id ON hse_grid_inspection_records(org_id);
    `);
    console.log('[Sprint6.3-A] 创建索引成功');

    // 5. 初始化 risk_level_config 默认配置
    await pool.query(`
      INSERT INTO risk_level_config (level_code, level_name, level_order, min_score, max_score, color_code, description) VALUES
        ('low', '低风险', 1, 0, 25, '#52c41a', '风险处于可控范围，常规管理即可'),
        ('medium', '一般风险', 2, 26, 50, '#faad14', '存在一定风险因素，需要关注和跟踪'),
        ('high', '较高风险', 3, 51, 75, '#fa8c16', '风险较高，需要重点管控和干预'),
        ('critical', '重大风险', 4, 76, 100, '#f5222d', '风险极高，需要立即采取管控措施')
      ON CONFLICT (level_code) DO NOTHING;
    `);
    console.log('[Sprint6.3-A] 初始化 risk_level_config 默认配置成功');

    // 6. 验证创建结果
    const historyCols = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'risk_score_history' ORDER BY ordinal_position
    `);
    console.log('\n=== risk_score_history 表结构 ===');
    historyCols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

    const configCols = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'risk_level_config' ORDER BY ordinal_position
    `);
    console.log('\n=== risk_level_config 表结构 ===');
    configCols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

    const gridCols = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'hse_grid_inspection_records' ORDER BY ordinal_position
    `);
    console.log('\n=== hse_grid_inspection_records 表结构 ===');
    gridCols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

    const configData = await pool.query('SELECT level_code, level_name, min_score, max_score, color_code FROM risk_level_config ORDER BY level_order');
    console.log('\n=== risk_level_config 默认配置 ===');
    configData.rows.forEach(r => console.log(`  ${r.level_name} (${r.level_code}): ${r.min_score}-${r.max_score} 颜色:${r.color_code}`));

    console.log('\n[Sprint6.3-A] 驾驶舱数据模型初始化完成！');
    process.exit(0);
  } catch (e) {
    console.error('[Sprint6.3-A] 创建表失败:', e.message);
    process.exit(1);
  }
};

createTables();
