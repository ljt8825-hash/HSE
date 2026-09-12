-- ============================================================
-- FK Phase 1 列存在性探针（任务 A）
-- 目的：核对 22 个候选 FK 列在 11 张目标表中真实存在
-- 只读查询，不修改任何数据
-- 日期：2026-07-30
-- ============================================================

SELECT
    c.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable,
    CASE
        WHEN c.column_name IN ('employee_id','violator_id','inspector_id','handler_id',
                               'punisher_id','responsible_person_id','signer_employee_id',
                               'signee_employee_id','responsible_employee_id')
             THEN 'employee(id)'
        WHEN c.column_name = 'position_id'
             THEN 'position(id)'
        WHEN c.column_name = 'org_unit_id'
             THEN 'hse_org_unit(id)'
        ELSE 'unknown'
    END AS referenced_parent
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'training_record', 'employee_induction_training', 'employee_training_status',
    'position_training_requirement', 'position_safety_profile',
    'violation_records',
    'safety_goals', 'hse_target_contracts', 'hse_safety_committee',
    'hse_responsibility_assessment', 'hse_safety_budget'
  )
  AND c.column_name IN (
    'employee_id', 'position_id',
    'violator_id', 'inspector_id', 'handler_id', 'punisher_id',
    'responsible_person_id', 'signer_employee_id', 'signee_employee_id',
    'org_unit_id', 'responsible_employee_id'
  )
ORDER BY c.table_name, c.ordinal_position;

-- ============================
-- 反向核对：期望存在但缺失的列
-- （列出 22 个期望列，左连接实际列，缺失者 is_missing=YES）
-- ============================

WITH expect(table_name, column_name) AS (
    VALUES
        ('training_record','employee_id'),
        ('training_record','position_id'),
        ('employee_induction_training','employee_id'),
        ('employee_induction_training','position_id'),
        ('employee_training_status','employee_id'),
        ('employee_training_status','position_id'),
        ('position_training_requirement','position_id'),
        ('position_safety_profile','position_id'),
        ('violation_records','violator_id'),
        ('violation_records','inspector_id'),
        ('violation_records','handler_id'),
        ('violation_records','punisher_id'),
        ('safety_goals','responsible_person_id'),
        ('hse_target_contracts','signer_employee_id'),
        ('hse_target_contracts','signee_employee_id'),
        ('hse_target_contracts','org_unit_id'),
        ('hse_safety_committee','employee_id'),
        ('hse_safety_committee','org_unit_id'),
        ('hse_responsibility_assessment','employee_id'),
        ('hse_responsibility_assessment','org_unit_id'),
        ('hse_safety_budget','org_unit_id'),
        ('hse_safety_budget','responsible_employee_id')
)
SELECT
    e.table_name,
    e.column_name,
    CASE WHEN c.column_name IS NULL THEN 'YES' ELSE 'NO' END AS is_missing
FROM expect e
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public'
      AND c.table_name = e.table_name
      AND c.column_name = e.column_name
ORDER BY e.table_name, e.column_name;
