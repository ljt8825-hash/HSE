-- 批量补齐 employee_assignment.operation_unit_id
-- 规则：根据 org_unit_id + position_name 推断 unit_type，再按 employee_id 哈希均匀分配到该组织下同类型作业单元
UPDATE employee_assignment ea
SET operation_unit_id = inferred.id
FROM (
  SELECT ea2.id AS assignment_id, opu.id
  FROM employee_assignment ea2
  LEFT JOIN position p ON p.id = ea2.position_id
  LEFT JOIN LATERAL (
    SELECT u.id
    FROM (
      SELECT opu.id,
             ROW_NUMBER() OVER (ORDER BY opu.id) AS rn,
             COUNT(*) OVER () AS total
      FROM hse_operation_unit opu
      WHERE opu.org_unit_id = ea2.org_unit_id
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
    WHERE u.total > 0 AND u.rn = (ea2.employee_id % u.total) + 1
  ) opu ON true
  WHERE ea2.is_current = true
    AND ea2.is_primary = true
    AND ea2.is_deleted = false
    AND ea2.operation_unit_id IS NULL
    AND ea2.org_unit_id IS NOT NULL
    AND opu.id IS NOT NULL
) inferred
WHERE ea.id = inferred.assignment_id;
