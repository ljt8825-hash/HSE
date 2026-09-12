-- ============================================================
-- Sprint6.0-C 作业单元映射规则表 + 岗位映射修正
-- ============================================================

-- 1. 创建作业单元映射规则表
CREATE TABLE IF NOT EXISTS employee_operation_unit_mapping_rule (
  id BIGSERIAL PRIMARY KEY,
  source_dept VARCHAR(255),
  source_position VARCHAR(255),
  target_unit_id BIGINT,
  target_unit_name VARCHAR(255),
  target_unit_type VARCHAR(50),
  match_priority INT DEFAULT 50,
  status VARCHAR(20) DEFAULT 'active',
  remark VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT false
);

COMMENT ON TABLE employee_operation_unit_mapping_rule IS '作业单元映射规则表';

-- 2. 修正司机岗位映射规则
-- 原规则16: 司机+车队 → 垃圾收运车驾驶员（错误）
-- 修正为: 司机+车队 → 垃圾转运车驾驶员
UPDATE employee_position_mapping_rule
SET target_position_id = 1397,
    target_position_name = '垃圾转运车驾驶员',
    updated_at = CURRENT_TIMESTAMP
WHERE source_position = '司机' AND condition_dept = '车队' AND is_deleted = false;

-- 3. 新增: 司机+片区 → 垃圾收运车驾驶员
INSERT INTO employee_position_mapping_rule
  (source_position, target_position_id, target_position_name, target_position_alias,
   condition_dept, grid_level, grid_role, rule_version, match_priority, status)
SELECT '司机', 1398, '垃圾收运车驾驶员', '司机',
       '片区', NULL, NULL, 'v1.0', 29, 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM employee_position_mapping_rule
  WHERE source_position = '司机' AND condition_dept = '片区' AND is_deleted = false
);

-- 4. 新增: 中转站管理员 → 转运站操作员
INSERT INTO employee_position_mapping_rule
  (source_position, target_position_id, target_position_name, target_position_alias,
   condition_dept, grid_level, grid_role, rule_version, match_priority, status)
SELECT '中转站管理员', 1400, '转运站操作员', '中转站管理员',
       NULL, NULL, NULL, 'v1.0', 35, 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM employee_position_mapping_rule
  WHERE source_position = '中转站管理员' AND is_deleted = false
)
AND EXISTS (SELECT 1 FROM position WHERE name = '转运站操作员' AND id = 1400);

-- 如果转运站操作员position id不是1400，尝试按名称查找
INSERT INTO employee_position_mapping_rule
  (source_position, target_position_id, target_position_name, target_position_alias,
   condition_dept, grid_level, grid_role, rule_version, match_priority, status)
SELECT '中转站管理员', p.id, '转运站操作员', '中转站管理员',
       NULL, NULL, NULL, 'v1.0', 35, 'active'
FROM position p
WHERE p.name = '转运站操作员' AND p.is_deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM employee_position_mapping_rule
    WHERE source_position = '中转站管理员' AND is_deleted = false
  )
ON CONFLICT DO NOTHING;
