-- 员工主数据表确认（只读）
-- 目的：确认 hse_assessment_target.employee_id 实际指向的员工主数据表与姓名列
\pset pager off

SELECT 'employee' AS tbl, count(*) AS rows_all,
       count(*) FILTER (WHERE is_deleted = FALSE OR is_deleted IS NULL) AS rows_alive
  FROM employee;

SELECT 'v_employee_org_full' AS tbl, count(*) AS rows_all,
       count(*) FILTER (WHERE is_current) AS rows_current
  FROM v_employee_org_full;

-- 考核对象 employee_id 能否在 v_employee_org_full 中找到
SELECT count(DISTINCT t.employee_id) AS target_emp_ids,
       count(DISTINCT e.employee_id) AS matched_in_view
  FROM hse_assessment_target t
  LEFT JOIN v_employee_org_full e ON e.employee_id = t.employee_id
 WHERE t.is_deleted = FALSE;

-- 近 3 个周期
SELECT id, assessment_year, assessment_month, status
  FROM hse_assessment_cycle
 WHERE is_deleted = FALSE
 ORDER BY assessment_year DESC, assessment_month DESC
 LIMIT 5;
