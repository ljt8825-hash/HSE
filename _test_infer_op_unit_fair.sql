SELECT
  ea.id,
  e.employee_code,
  e.name,
  p.name AS position_name,
  ou.org_name,
  opu.id AS inferred_op_id,
  opu.unit_name AS inferred_unit_name,
  opu.unit_type AS inferred_unit_type
FROM employee_assignment ea
JOIN employee e ON e.id = ea.employee_id
LEFT JOIN position p ON p.id = ea.position_id
LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id
LEFT JOIN LATERAL (
  SELECT u.id, u.unit_name, u.unit_type
  FROM (
    SELECT opu.id, opu.unit_name, opu.unit_type,
           ROW_NUMBER() OVER (ORDER BY opu.id) AS rn,
           COUNT(*) OVER () AS total
    FROM hse_operation_unit opu
    WHERE opu.org_unit_id = ea.org_unit_id
      AND opu.is_deleted = false
      AND opu.status = 'active'
      AND opu.unit_type = CASE
        WHEN p.name ILIKE '%驾驶员%' OR p.name ILIKE '%司机%' THEN 'collection_team'
        WHEN p.name ILIKE '%保洁%' THEN 'cleaning_team'
        WHEN p.name ILIKE '%转运%' OR p.name ILIKE '%中转%' THEN 'transfer_station'
        WHEN p.name ILIKE '%收运%' THEN 'collection_team'
        WHEN p.name ILIKE '%挂桶%' THEN 'barrel_team'
        WHEN p.name ILIKE '%绿化%' THEN 'greening_team'
        WHEN p.name ILIKE '%维修%' THEN 'maintenance_team'
        ELSE NULL
      END
  ) u
  WHERE u.total > 0 AND u.rn = (ea.employee_id % u.total) + 1
) opu ON true
WHERE ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
  AND ea.operation_unit_id IS NULL
  AND opu.id IS NOT NULL
ORDER BY ou.org_name, opu.unit_name, e.employee_code
LIMIT 40;
