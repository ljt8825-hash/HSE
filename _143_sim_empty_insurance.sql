-- 模拟 personnel_insurance 为空（pivot 子查询 WHERE 1=0），验证 GET /personnel DB 模式回退
WITH emp_piv AS (
  SELECT p.* FROM (
    SELECT p.*, ROW_NUMBER() OVER (PARTITION BY p.employee_id ORDER BY p.id DESC) AS rn
    FROM personnel_insurance p
    WHERE p.insurance_type = '雇主责任险' AND p.is_deleted = false AND 1=0
  ) p WHERE p.rn = 1
),
inj_piv AS (
  SELECT p.* FROM (
    SELECT p.*, ROW_NUMBER() OVER (PARTITION BY p.employee_id ORDER BY p.id DESC) AS rn
    FROM personnel_insurance p
    WHERE p.insurance_type = '工伤保险' AND p.is_deleted = false AND 1=0
  ) p WHERE p.rn = 1
)
SELECT
  COUNT(*) AS total_roster,
  COUNT(*) FILTER (WHERE emp.id IS NULL AND inj.id IS NULL) AS no_insurance_rows,
  COUNT(*) FILTER (WHERE emp.id IS NOT NULL) AS with_emp,
  COUNT(*) FILTER (WHERE inj.id IS NOT NULL) AS with_inj,
  COUNT(*) FILTER (WHERE ev.name IS NULL OR ev.name = '') AS blank_name
FROM v_employee_current ev
LEFT JOIN emp_piv emp ON emp.employee_id = ev.employee_id
LEFT JOIN inj_piv inj ON inj.employee_id = ev.employee_id
WHERE ev.employee_deleted = false;
