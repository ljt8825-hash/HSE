\echo '=== A. department 与 hse_org_unit 名称匹配情况 ==='
SELECT COUNT(*) AS dept_total,
       COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM hse_org_unit ou WHERE ou.org_name = d.name AND ou.is_deleted = false)) AS matched_org_unit
FROM department d WHERE d.is_deleted = false;

\echo '=== B. 可匹配的部门及其在岗员工数（Top 25） ==='
SELECT d.id AS dept_id, d.name AS dept_name, ou.id AS org_unit_id,
       (SELECT COUNT(*) FROM employee e
          JOIN employee_assignment ea ON ea.employee_id = e.id
         WHERE ea.org_unit_id = ou.id AND ea.is_current = true AND ea.is_primary = true
           AND ea.is_deleted = false AND e.is_deleted = false) AS emp_cnt
FROM department d
JOIN hse_org_unit ou ON ou.org_name = d.name AND ou.is_deleted = false
WHERE d.is_deleted = false
ORDER BY emp_cnt DESC, d.id ASC
LIMIT 25;

\echo '=== C. hse_org_unit 全量（含在岗员工数） ==='
SELECT ou.id, ou.org_name, ou.org_type,
       (SELECT COUNT(*) FROM employee_assignment ea WHERE ea.org_unit_id = ou.id AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false) AS emp_cnt
FROM hse_org_unit ou WHERE ou.is_deleted = false ORDER BY emp_cnt DESC, ou.id;

\echo '=== D. 岗位 job_category IS NULL 清单（Task 3.1） ==='
SELECT id, name, position_code, risk_level, is_special_post FROM position
WHERE job_category IS NULL AND is_deleted = false ORDER BY id;

\echo '=== E. 岗位 job_category 实际值集（Task 3.2） ==='
SELECT COALESCE(job_category, '(NULL)') AS job_category, COUNT(*) AS cnt
FROM position WHERE is_deleted = false GROUP BY job_category ORDER BY cnt DESC;

\echo '=== F. employee 花名册基线（一致性核对 E6） ==='
SELECT COUNT(*) AS employee_active FROM employee WHERE is_deleted = false;
SELECT COUNT(*) AS assignment_current FROM employee_assignment WHERE is_current = true AND is_primary = true AND is_deleted = false;
SELECT COUNT(*) FILTER (WHERE is_public_welfare = true) AS public_welfare_true,
       COUNT(*) FILTER (WHERE is_public_welfare = false) AS public_welfare_false,
       COUNT(*) FILTER (WHERE is_public_welfare IS NULL) AS public_welfare_null
FROM employee WHERE is_deleted = false;
