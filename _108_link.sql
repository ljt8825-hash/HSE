\echo '=== L. employee_assignment 列定义 ==='
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'employee_assignment' ORDER BY ordinal_position;

\echo '=== M. department.township 取值分布 ==='
SELECT COALESCE(township,'(NULL)') AS township, COUNT(*) FROM department WHERE is_deleted=false GROUP BY township ORDER BY 2 DESC LIMIT 20;

\echo '=== N. 前缀匹配方案验证：ou.org_name LIKE dept.name || %  ==='
SELECT d.id AS dept_id, d.level, d.name AS dept_name, ou.id AS ou_id, ou.org_name,
       (SELECT COUNT(*) FROM employee e JOIN employee_assignment ea ON ea.employee_id=e.id
         WHERE ea.org_unit_id=ou.id AND ea.is_current=true AND ea.is_primary=true AND ea.is_deleted=false AND e.is_deleted=false) AS emp_cnt
FROM department d
JOIN hse_org_unit ou ON ou.org_name LIKE d.name || '%' AND ou.is_deleted=false
WHERE d.is_deleted=false ORDER BY d.level, d.id;

\echo '=== O. 前缀匹配是否有一对多（同一 dept 命中多个 org_unit） ==='
SELECT d.id, d.name, COUNT(ou.id) AS ou_hits
FROM department d JOIN hse_org_unit ou ON ou.org_name LIKE d.name || '%' AND ou.is_deleted=false
WHERE d.is_deleted=false GROUP BY d.id, d.name HAVING COUNT(ou.id) > 1;

\echo '=== P. employee_assignment 中 org_unit_id 的分布是否只到作业中心 ==='
SELECT COUNT(DISTINCT org_unit_id) AS distinct_org_units FROM employee_assignment WHERE is_current=true AND is_deleted=false;
