-- 1) 两表行数（仅未删除）
SELECT 'department'   AS tbl, COUNT(*) AS active_rows FROM department   WHERE is_deleted = false;
SELECT 'hse_org_unit' AS tbl, COUNT(*) AS active_rows FROM hse_org_unit WHERE is_deleted = false;

-- 2) department 被哪些表外键引用（应为 0）
SELECT conname, conrelid::regclass AS child_table
FROM pg_constraint
WHERE confrelid = 'department'::regclass AND contype = 'f';

-- 3) hse_org_unit 被哪些表外键引用
SELECT conname, conrelid::regclass AS child_table
FROM pg_constraint
WHERE confrelid = 'hse_org_unit'::regclass AND contype = 'f';

-- 4) 两表上是否存在同步触发器（排除系统内部触发器 tgisinternal）
SELECT tgname, tgrelid::regclass AS tbl
FROM pg_trigger
WHERE tgrelid IN ('department'::regclass, 'hse_org_unit'::regclass)
  AND NOT tgisinternal;

-- 5) 顶层节点对比：部门树 vs 组织单元（层级粒度差异）
SELECT id, name AS dept_name, level FROM department WHERE parent_id IS NULL ORDER BY id LIMIT 6;
SELECT id, org_name AS org_name, level FROM hse_org_unit WHERE parent_id IS NULL ORDER BY id LIMIT 6;

-- 6) 名称精确匹配命中率（验证"绑定"是否真实存在）
SELECT
  (SELECT COUNT(*) FROM department d WHERE is_deleted=false
     AND EXISTS (SELECT 1 FROM hse_org_unit ou WHERE ou.is_deleted=false AND ou.org_name = d.name)) AS exact_name_matches,
  (SELECT COUNT(*) FROM department d WHERE is_deleted=false) AS total_dept;

-- 7) 员工归属只走 hse_org_unit 的证据
SELECT COUNT(*) AS assignment_rows FROM employee_assignment WHERE is_deleted=false AND org_unit_id IS NOT NULL;
SELECT COUNT(*) AS dept_ref_in_assignment FROM employee_assignment WHERE is_deleted=false AND department_id IS NOT NULL;
