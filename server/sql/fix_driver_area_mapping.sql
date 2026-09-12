-- 提示词-80：花名册导入「司机+片区」条件匹配修复
-- 仅新增一条 condition_dept IS NULL 的司机兜底规则，不修改任何现有规则/代码/position 表。
-- 目标取 id29(司机|片区→垃圾收运车驾驶员) 意图一致的 1398，使片区司机行为与原设计一致。
-- 说明：本数据集 position 表全部 is_deleted=t（软删除实则活跃，既有规则与 employee_assignment 均引用这些 id），
--       故不走 prompt 原文的 `FROM position WHERE name='驾驶员'`（该名义岗位不存在），
--       直接复用既有 司机 规则已验证有效的 target_position_id=1398。

INSERT INTO employee_position_mapping_rule
  (source_position, condition_dept, target_position_id, target_position_name,
   rule_version, match_priority, status, remark)
SELECT '司机', NULL, 1398, '垃圾收运车驾驶员', 'v1.0', 50, 'active',
       '提示词-80：司机无条件兜底规则（片区司机映射到垃圾收运车驾驶员）'
WHERE NOT EXISTS (
    SELECT 1 FROM employee_position_mapping_rule
    WHERE source_position = '司机' AND condition_dept IS NULL AND is_deleted = false
  );
