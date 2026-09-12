/**
 * Sprint6.3-A-2 员工关系模型统一脚本
 * 
 * 1. 创建 employee_assignment 表（最终员工关系模型）
 * 2. 从 hse_employee_relation 迁移数据
 * 3. 验证数据完整性
 */

const { pool } = require('./config/db');

const migrate = async () => {
  try {
    console.log('[Sprint6.3-A-2] 开始员工关系模型统一...\n');

    // 1. 创建 employee_assignment 表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_assignment (
        id BIGSERIAL PRIMARY KEY,
        employee_id BIGINT NOT NULL,
        org_unit_id BIGINT,
        operation_unit_id BIGINT,
        position_id BIGINT,
        supervisor_id BIGINT,
        is_current BOOLEAN NOT NULL DEFAULT TRUE,
        status VARCHAR(32) DEFAULT 'active',
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        start_date DATE,
        end_date DATE,
        remark TEXT,
        created_by VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        CONSTRAINT fk_assignment_employee FOREIGN KEY (employee_id) REFERENCES employee(id)
      );
    `);
    console.log('[Sprint6.3-A-2] 创建 employee_assignment 表成功');

    // 2. 创建索引
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_assignment_employee_id ON employee_assignment(employee_id);
      CREATE INDEX IF NOT EXISTS idx_assignment_position_id ON employee_assignment(position_id);
      CREATE INDEX IF NOT EXISTS idx_assignment_org_unit_id ON employee_assignment(org_unit_id);
      CREATE INDEX IF NOT EXISTS idx_assignment_operation_unit_id ON employee_assignment(operation_unit_id);
      CREATE INDEX IF NOT EXISTS idx_assignment_current ON employee_assignment(is_current, is_deleted);
    `);
    console.log('[Sprint6.3-A-2] 创建索引成功');

    // 3. 从 hse_employee_relation 迁移数据
    const migrateResult = await pool.query(`
      INSERT INTO employee_assignment (
        employee_id, org_unit_id, operation_unit_id, position_id, supervisor_id,
        is_current, status, is_primary, start_date, end_date, remark,
        created_by, created_at, updated_at, is_deleted
      )
      SELECT 
        employee_id, org_unit_id, operation_unit_id, position_id, supervisor_id,
        is_current, status, is_primary, start_date, end_date, remark,
        created_by, created_at, updated_at, is_deleted
      FROM hse_employee_relation
      ON CONFLICT DO NOTHING;
    `);
    console.log(`[Sprint6.3-A-2] 数据迁移完成，迁移 ${migrateResult.rowCount} 条记录`);

    // 4. 验证数据完整性
    const eaCount = await pool.query('SELECT COUNT(*) as cnt FROM employee_assignment WHERE is_deleted = false');
    const herCount = await pool.query('SELECT COUNT(*) as cnt FROM hse_employee_relation WHERE is_deleted = false');
    console.log(`\n=== 数据验证 ===`);
    console.log(`employee_assignment 有效记录: ${eaCount.rows[0].cnt} 条`);
    console.log(`hse_employee_relation 有效记录: ${herCount.rows[0].cnt} 条`);

    const eaEmployees = await pool.query('SELECT COUNT(DISTINCT employee_id) as cnt FROM employee_assignment WHERE is_current = true AND is_deleted = false');
    const herEmployees = await pool.query('SELECT COUNT(DISTINCT employee_id) as cnt FROM hse_employee_relation WHERE is_current = true AND is_deleted = false');
    console.log(`employee_assignment 当前在职员工: ${eaEmployees.rows[0].cnt} 人`);
    console.log(`hse_employee_relation 当前在职员工: ${herEmployees.rows[0].cnt} 人`);

    // 5. 验证字段一致性
    const eaCols = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'employee_assignment' ORDER BY ordinal_position
    `);
    console.log(`\n=== employee_assignment 表结构 ===`);
    eaCols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

    // 6. 验证样例数据
    const sample = await pool.query(`
      SELECT ea.employee_id, ea.position_id, p.name as position_name,
             ea.org_unit_id, ou.org_name, ea.is_current, ea.is_primary
      FROM employee_assignment ea
      LEFT JOIN position p ON ea.position_id = p.id
      LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
      WHERE ea.is_current = true AND ea.is_deleted = false
      LIMIT 5
    `);
    console.log(`\n=== 样例数据 ===`);
    sample.rows.forEach(r => console.log(`  员工ID:${r.employee_id} 岗位:${r.position_name} 组织:${r.org_name} 当前:${r.is_current} 主岗:${r.is_primary}`));

    // 7. 驾驶员人数验证（通过employee_assignment统计）
    const driverCount = await pool.query(`
      SELECT COUNT(DISTINCT ea.employee_id) as cnt
      FROM employee_assignment ea
      JOIN position p ON ea.position_id = p.id
      WHERE (p.name LIKE '%驾驶员%' OR p.name LIKE '%司机%')
        AND ea.is_current = true AND ea.is_deleted = false
    `);
    console.log(`\n=== 驾驶员人数验证 ===`);
    console.log(`通过 employee_assignment 统计: ${driverCount.rows[0].cnt} 人`);

    console.log('\n[Sprint6.3-A-2] 员工关系模型统一完成！');
    process.exit(0);
  } catch (e) {
    console.error('[Sprint6.3-A-2] 失败:', e.message);
    process.exit(1);
  }
};

migrate();
