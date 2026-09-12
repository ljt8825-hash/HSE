-- 检查李真真、孟祥宇的花名册完整记录
SELECT
  v.employee_id,
  v.name,
  v.org_name,
  v.position_name,
  v.position_id,
  v.assignment_status,
  v.is_current,
  v.deleted_at IS NOT NULL AS employee_deleted,
  v.assignment_deleted,
  -- 关联查 assignment 真实记录
  (SELECT position_id FROM employee_assignment ea2 WHERE ea2.person_name = v.name ORDER BY ea2.created_at DESC LIMIT 1) AS latest_position_id,
  (SELECT name FROM "position" p WHERE p.id = (SELECT position_id FROM employee_assignment ea3 WHERE ea3.person_name = v.name ORDER BY ea3.created_at DESC LIMIT 1)) AS latest_position_name
FROM v_employee_current v
WHERE v.name IN ('李真真', '孟祥宇');
