\echo '=== G. department 全量名称（77 行） ==='
SELECT id, dept_code, name, parent_id, level, status FROM department WHERE is_deleted = false ORDER BY level, sort_order, id;

\echo '=== H. 模糊匹配尝试：trim / 去括号后是否能对上 ==='
SELECT d.id, d.name AS dept_name, ou.id AS ou_id, ou.org_name
FROM department d JOIN hse_org_unit ou ON btrim(ou.org_name) = btrim(d.name) AND ou.is_deleted = false
WHERE d.is_deleted = false;

\echo '=== I. 包含匹配尝试（dept_name 含 org_name 或反之） ==='
SELECT d.id, d.name AS dept_name, ou.id AS ou_id, ou.org_name
FROM department d JOIN hse_org_unit ou ON (d.name LIKE '%' || ou.org_name || '%' OR ou.org_name LIKE '%' || d.name || '%')
WHERE d.is_deleted = false AND ou.is_deleted = false ORDER BY d.id LIMIT 40;

\echo '=== J. department 是否有 org_unit_id 之类的关联列 ==='
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'department' ORDER BY ordinal_position;

\echo '=== K. hse_org_unit 列定义 ==='
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'hse_org_unit' ORDER BY ordinal_position;
