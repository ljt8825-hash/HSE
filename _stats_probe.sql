-- Reproduce buildPersonnelStatsPivotSql() exactly against real DB
WITH emp_piv AS (
  SELECT p.* FROM (
    SELECT p.*, ROW_NUMBER() OVER (
      PARTITION BY p.employee_id
      ORDER BY
        CASE WHEN (p.is_current = true AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL AND p.start_date <= p.expire_date AND p.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AND p.expire_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date) THEN 0
             WHEN (p.is_current = true AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL AND p.start_date <= p.expire_date AND p.start_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date) THEN 1
             WHEN (p.is_current = true AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL AND p.start_date <= p.expire_date AND p.expire_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date) THEN 2
             ELSE 3
        END ASC,
        p.is_current DESC, p.expire_date DESC NULLS LAST,
        p.start_date DESC NULLS LAST, p.id DESC
    ) AS rn
    FROM personnel_insurance p
    WHERE p.insurance_type = '雇主责任险' AND p.is_deleted = false
  ) p WHERE p.rn = 1
),
inj_piv AS (
  SELECT p.* FROM (
    SELECT p.*, ROW_NUMBER() OVER (
      PARTITION BY p.employee_id
      ORDER BY
        CASE WHEN (p.is_current = true AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL AND p.start_date <= p.expire_date AND p.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AND p.expire_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date) THEN 0
             WHEN (p.is_current = true AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL AND p.start_date <= p.expire_date AND p.start_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date) THEN 1
             WHEN (p.is_current = true AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL AND p.start_date <= p.expire_date AND p.expire_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date) THEN 2
             ELSE 3
        END ASC,
        p.is_current DESC, p.expire_date DESC NULLS LAST,
        p.start_date DESC NULLS LAST, p.id DESC
    ) AS rn
    FROM personnel_insurance p
    WHERE p.insurance_type = '工伤保险' AND p.is_deleted = false
  ) p WHERE p.rn = 1
)
SELECT
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE ((emp_piv.is_current = true AND emp_piv.start_date IS NOT NULL AND emp_piv.expire_date IS NOT NULL AND emp_piv.start_date <= emp_piv.expire_date AND emp_piv.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AND emp_piv.expire_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date) OR (inj_piv.is_current = true AND inj_piv.start_date IS NOT NULL AND inj_piv.expire_date IS NOT NULL AND inj_piv.start_date <= inj_piv.expire_date AND inj_piv.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AND inj_piv.expire_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date)))::int AS covered,
  COUNT(*) FILTER (WHERE NOT ((emp_piv.is_current = true AND emp_piv.start_date IS NOT NULL AND emp_piv.expire_date IS NOT NULL AND emp_piv.start_date <= emp_piv.expire_date AND emp_piv.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AND emp_piv.expire_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date) OR (inj_piv.is_current = true AND inj_piv.start_date IS NOT NULL AND inj_piv.expire_date IS NOT NULL AND inj_piv.start_date <= inj_piv.expire_date AND inj_piv.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AND inj_piv.expire_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date)) AND ((emp_piv.id IS NOT NULL AND emp_piv.is_current = true AND emp_piv.start_date IS NOT NULL AND emp_piv.expire_date IS NOT NULL AND emp_piv.start_date <= emp_piv.expire_date AND emp_piv.expire_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date) OR (inj_piv.id IS NOT NULL AND inj_piv.is_current = true AND inj_piv.start_date IS NOT NULL AND inj_piv.expire_date IS NOT NULL AND inj_piv.start_date <= inj_piv.expire_date AND inj_piv.expire_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date)))::int AS expired,
  COUNT(*) FILTER (WHERE NOT ((emp_piv.is_current = true AND emp_piv.start_date IS NOT NULL AND emp_piv.expire_date IS NOT NULL AND emp_piv.start_date <= emp_piv.expire_date AND emp_piv.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AND emp_piv.expire_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date) OR (inj_piv.is_current = true AND inj_piv.start_date IS NOT NULL AND inj_piv.expire_date IS NOT NULL AND inj_piv.start_date <= inj_piv.expire_date AND inj_piv.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AND inj_piv.expire_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date)) AND NOT ((emp_piv.id IS NOT NULL AND emp_piv.is_current = true AND emp_piv.start_date IS NOT NULL AND emp_piv.expire_date IS NOT NULL AND emp_piv.start_date <= emp_piv.expire_date AND emp_piv.expire_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date) OR (inj_piv.id IS NOT NULL AND inj_piv.is_current = true AND inj_piv.start_date IS NOT NULL AND inj_piv.expire_date IS NOT NULL AND inj_piv.start_date <= inj_piv.expire_date AND inj_piv.expire_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date)))::int AS pending,
  COUNT(*) FILTER (WHERE ((emp_piv.id IS NOT NULL AND emp_piv.is_current = true AND emp_piv.start_date IS NOT NULL AND emp_piv.expire_date IS NOT NULL AND emp_piv.start_date <= emp_piv.expire_date AND emp_piv.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AND emp_piv.expire_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AND emp_piv.expire_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date + INTERVAL '30 days') OR (inj_piv.id IS NOT NULL AND inj_piv.is_current = true AND inj_piv.start_date IS NOT NULL AND inj_piv.expire_date IS NOT NULL AND inj_piv.start_date <= inj_piv.expire_date AND inj_piv.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AND inj_piv.expire_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AND inj_piv.expire_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date + INTERVAL '30 days')))::int AS expiring
FROM v_employee_current ev
LEFT JOIN emp_piv ON emp_piv.employee_id = ev.employee_id
LEFT JOIN inj_piv ON inj_piv.employee_id = ev.employee_id
WHERE ev.employee_deleted = false;
