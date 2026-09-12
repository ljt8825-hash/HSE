-- 模拟 personnel_insurance 为空时 /personnel/stats 的行为
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
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE ((emp_piv.id IS NOT NULL AND emp_piv.is_current = true AND emp_piv.expire_date >= CURRENT_DATE) OR (inj_piv.id IS NOT NULL AND inj_piv.is_current = true AND inj_piv.expire_date >= CURRENT_DATE)))::int AS covered,
  COUNT(*) FILTER (WHERE NOT ((emp_piv.id IS NOT NULL AND emp_piv.is_current = true AND emp_piv.expire_date >= CURRENT_DATE) OR (inj_piv.id IS NOT NULL AND inj_piv.is_current = true AND inj_piv.expire_date >= CURRENT_DATE)) AND ((emp_piv.id IS NOT NULL AND emp_piv.is_current = true AND emp_piv.start_date IS NOT NULL AND emp_piv.expire_date IS NOT NULL AND emp_piv.start_date <= emp_piv.expire_date AND emp_piv.expire_date < CURRENT_DATE) OR (inj_piv.id IS NOT NULL AND inj_piv.is_current = true AND inj_piv.start_date IS NOT NULL AND inj_piv.expire_date IS NOT NULL AND inj_piv.start_date <= inj_piv.expire_date AND inj_piv.expire_date < CURRENT_DATE)))::int AS expired,
  COUNT(*) FILTER (WHERE NOT ((emp_piv.id IS NOT NULL AND emp_piv.is_current = true AND emp_piv.expire_date >= CURRENT_DATE) OR (inj_piv.id IS NOT NULL AND inj_piv.is_current = true AND inj_piv.expire_date >= CURRENT_DATE)) AND NOT ((emp_piv.id IS NOT NULL AND emp_piv.is_current = true AND emp_piv.start_date IS NOT NULL AND emp_piv.expire_date IS NOT NULL AND emp_piv.start_date <= emp_piv.expire_date AND emp_piv.expire_date < CURRENT_DATE) OR (inj_piv.id IS NOT NULL AND inj_piv.is_current = true AND inj_piv.start_date IS NOT NULL AND inj_piv.expire_date IS NOT NULL AND inj_piv.start_date <= inj_piv.expire_date AND inj_piv.expire_date < CURRENT_DATE)))::int AS pending
FROM v_employee_current ev
LEFT JOIN emp_piv ON emp_piv.employee_id = ev.employee_id
LEFT JOIN inj_piv ON inj_piv.employee_id = ev.employee_id
WHERE ev.employee_deleted = false;
