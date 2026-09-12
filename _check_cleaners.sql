SELECT ea.id, e.employee_code, e.name, p.name AS position_name, ou.org_name
FROM employee_assignment ea
JOIN employee e ON e.id = ea.employee_id
LEFT JOIN position p ON p.id = ea.position_id
LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id
WHERE ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
  AND ea.operation_unit_id IS NULL
  AND p.name ILIKE '%保洁%'
LIMIT 15;
