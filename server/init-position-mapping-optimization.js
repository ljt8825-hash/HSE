const { pool } = require('./config/db');

async function optimize() {
  try {
    // ============================================
    // 1. 为position_risk_mapping增加position_id字段
    // ============================================
    await pool.query(`
      ALTER TABLE position_risk_mapping 
      ADD COLUMN IF NOT EXISTS position_id BIGINT
    `);
    console.log('position_id column added');

    // ============================================
    // 2. 调整管理员岗位分类（normal → management）
    // ============================================
    await pool.query(`
      UPDATE position_risk_mapping 
      SET risk_category = 'management',
          applicable_risk_types = '["violation","training_compliance","incident","management_execution"]',
          description = '管理员（人工班长），属于三级网格长，需要支持管理履职风险'
      WHERE position_name = '管理员'
    `);
    console.log('管理员岗位分类已调整为management');

    // ============================================
    // 3. 新增管理岗位映射数据
    // ============================================
    
    // 删除可能存在的旧数据
    await pool.query(`DELETE FROM position_risk_mapping WHERE position_name IN ('总经理', '部门经理', '乡镇作业中心经理', '环卫作业中心片区长')`);
    
    // 插入新的管理岗位映射
    await pool.query(`
      INSERT INTO position_risk_mapping (position_name, position_code, risk_category, is_driver, applicable_risk_types, description)
      VALUES
      ('总经理', 'GM', 'management', false, '["violation","training_compliance","incident","management_execution"]', '总经理，高层管理岗位'),
      ('部门经理', 'DM', 'management', false, '["violation","training_compliance","incident","management_execution"]', '部门经理，中层管理岗位'),
      ('乡镇作业中心经理', 'TOWM_MGR', 'management', false, '["violation","training_compliance","incident","management_execution"]', '乡镇作业中心经理（人工片区长），基层管理岗位'),
      ('环卫作业中心片区长', 'AREA_MGR', 'management', false, '["violation","training_compliance","incident","management_execution"]', '环卫作业中心片区长，基层管理岗位')
    `);
    console.log('管理岗位映射数据已新增');

    // ============================================
    // 4. 创建岗位别名兼容表
    // ============================================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS position_alias_mapping (
        id BIGSERIAL PRIMARY KEY,
        standard_position_name VARCHAR(128) NOT NULL,
        alias_position_name VARCHAR(128) NOT NULL,
        position_id BIGINT,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(standard_position_name, alias_position_name)
      )
    `);
    console.log('position_alias_mapping table created');

    // 插入岗位别名映射
    await pool.query(`
      INSERT INTO position_alias_mapping (standard_position_name, alias_position_name, description)
      VALUES
      ('乡镇作业中心经理', '人工片区长', '乡镇作业中心经理的岗位别名'),
      ('管理员', '人工班长', '管理员作为三级网格长的别名'),
      ('环卫作业中心片区长', '片区长', '环卫作业中心片区长的简称')
      ON CONFLICT (standard_position_name, alias_position_name) DO NOTHING
    `);
    console.log('岗位别名映射已插入');

    // ============================================
    // 5. 更新position_id关联
    // ============================================
    
    // 查询position表中的岗位ID并更新
    const positionMappings = [
      { name: '垃圾转运车驾驶员', code: null },
      { name: '垃圾收运车驾驶员', code: null },
      { name: '管理员', code: null },
      { name: '保洁员', code: null },
      { name: '片区长', code: null }
    ];
    
    for (const mapping of positionMappings) {
      const posResult = await pool.query(
        'SELECT id FROM position WHERE name = $1 AND is_deleted = false LIMIT 1',
        [mapping.name]
      );
      if (posResult.rows.length > 0) {
        await pool.query(
          'UPDATE position_risk_mapping SET position_id = $1 WHERE position_name = $2',
          [posResult.rows[0].id, mapping.name]
        );
        console.log(`position_id updated for ${mapping.name}: ${posResult.rows[0].id}`);
      }
    }

    // ============================================
    // 6. 新增驾驶员岗位别名
    // ============================================
    await pool.query(`
      INSERT INTO position_risk_mapping (position_name, position_code, risk_category, is_driver, applicable_risk_types, description)
      VALUES
      ('勾臂车司机', 'HOOK_TRUCK_DRV', 'driver', true, '["violation","driver_compliance","training_compliance","incident"]', '勾臂车驾驶员岗位')
      ON CONFLICT DO NOTHING
    `);
    console.log('勾臂车司机岗位映射已新增');

    await pool.end();
    console.log('\nAll position risk mapping optimization tasks completed successfully');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

optimize();