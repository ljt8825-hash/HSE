-- ============================================================
-- 提示词-79：修复花名册导入「未知岗位」(unknown_position) 匹配
-- 目标：为 7 个去重 unknown_position 原始值建立显式映射规则，
--       使其在 matchPosition() 的 L2（无条件匹配）中命中。
-- 说明：
--   - 本数据集 position 表 30 行全部 is_deleted=t，但现有 29 条
--     mapping 规则与 employee_assignment 实际引用的就是这些 id，
--     属"软删除实则活跃"的既有状态；红线禁止修改 position 数据，
--     故映射目标沿用同一批 id（与现有规则一致）。
--   - 7 个原始岗位在现有 position 表中无精确同名词，按语义映射到
--     最接近的现有岗位（映射假设已在验证报告中说明，可由业务调整）。
--   - condition_dept = NULL（无条件规则），走 L2 命中；不与其他
--     部门产生交叉冲突。
--   - 幂等：NOT EXISTS 保证可重复执行不重复插入。
-- ============================================================

INSERT INTO employee_position_mapping_rule
  (source_position, target_position_id, target_position_name, condition_dept, rule_version, status, match_priority, remark)
SELECT v.source_position, v.target_position_id, v.target_position_name, NULL, 'v1.0', 'active', 70, '提示词-79 公司职能岗位→现有岗位 显式映射'
FROM (VALUES
  -- 部门经理类（生产管理部 / 人力综合部 的经理 → 部门经理）
  ('人力综合部经理', 1391, '部门经理'),
  ('生产管理部经理', 1391, '部门经理'),
  -- 专员/主管/管理类（生产管理部、人力综合部 的职能岗 → 最接近的现有管理/职能岗）
  ('标准化专员',     1395, '管理员'),   -- 生产管理部：标准化归口综合管理岗
  ('库管专员',       1395, '管理员'),   -- 人力综合部：仓储管理归口管理员
  ('维保管理专员',   1395, '管理员'),   -- 生产管理部：维修保养管理归口管理员
  ('行政综合主管',   1395, '管理员'),   -- 人力综合部：行政综合归口管理员
  ('作业质量管理主管', 1389, '安环副经理') -- 生产管理部：作业质量管理归口安环/质量一体化管理岗
) AS v(source_position, target_position_id, target_position_name)
WHERE NOT EXISTS (
  SELECT 1 FROM employee_position_mapping_rule r
  WHERE r.source_position = v.source_position
    AND r.condition_dept IS NULL
    AND r.target_position_id = v.target_position_id
    AND r.is_deleted = false
);
