-- ============================================================
-- [生成时间] 2026-08-27
-- 用途: 员工档案列表中「所属部门」列显示花名册导入时的原始部门文本
-- 说明: 花名册「所属部门」原始文本此前仅被解析为组织(org_unit_id)，并未持久化。
--       新增 employee_assignment.dept_name 用于保存原始部门文本，
--       导入时写入(raw_dept)，并对历史数据做尽力回填。
-- ============================================================

-- 1. 新增字段（幂等）
ALTER TABLE employee_assignment ADD COLUMN IF NOT EXISTS dept_name VARCHAR(128);
COMMENT ON COLUMN employee_assignment.dept_name IS '花名册原始所属部门文本';

-- 2. 回填历史数据（尽力重建，仅处理为空的行）：
--    - 若某组织在映射规则中仅有唯一来源文本 → 直接采用该文本；
--    - 否则若组织为「XX镇/乡/街道作业中心」→ 取去掉「作业中心」后的乡镇名；
--    - 其余回退为组织名。
UPDATE employee_assignment ea
SET dept_name = d.dept
FROM (
  SELECT
    ea2.id AS assignment_id,
    CASE
      WHEN u.cnt = 1 THEN u.src
      WHEN ou.org_name ~ '^.+[镇乡街道]作业中心$' THEN substring(ou.org_name, 1, char_length(ou.org_name) - 4)
      ELSE ou.org_name
    END AS dept
  FROM employee_assignment ea2
  LEFT JOIN hse_org_unit ou ON ou.id = ea2.org_unit_id AND ou.is_deleted = false
  LEFT JOIN (
    SELECT target_id, COUNT(DISTINCT source_value) AS cnt, MIN(source_value) AS src
    FROM employee_import_mapping_rule
    WHERE source_type = 'excel_department' AND target_type = 'org_unit' AND is_deleted = false
    GROUP BY target_id
  ) u ON u.target_id = ea2.org_unit_id
  WHERE ea2.is_deleted = false
) d
WHERE ea.id = d.assignment_id AND ea.dept_name IS NULL;