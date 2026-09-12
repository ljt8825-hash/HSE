SELECT COALESCE(ev.org_name, '未分配') AS dept, COUNT(*)::int AS cnt
FROM v_employee_current ev
WHERE ev.employee_deleted = false
GROUP BY dept;
