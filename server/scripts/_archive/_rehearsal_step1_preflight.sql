-- ================================================================
-- TRAE-Step14 步骤 1: Preflight 索引 + 触发器复核
-- ================================================================

SELECT '=== 1.1 uk_emp_assign_primary 索引检查 ===' AS section;

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'employee_assignment'
  AND indexname = 'uk_emp_assign_primary';

SELECT '=== 1.2 hse_employee_org 触发器检查 ===' AS section;

SELECT t.tgname, t.tgenabled
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname = 'hse_employee_org'
  AND NOT t.tgisinternal
ORDER BY t.tgname;

SELECT '=== 1.3 hse_employee_org 表是否存在 ===' AS section;

SELECT relname, relkind
FROM pg_class
WHERE relname = 'hse_employee_org';

SELECT '=== 1.4 employee_assignment 表结构 (top 5 columns) ===' AS section;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'employee_assignment'
ORDER BY ordinal_position
LIMIT 5;
