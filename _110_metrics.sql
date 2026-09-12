SELECT 'employee_active' AS metric, COUNT(*) AS val FROM employee WHERE is_deleted=false
UNION ALL SELECT 'position_active', COUNT(*) FROM position WHERE is_deleted=false
UNION ALL SELECT 'department_active', COUNT(*) FROM department WHERE is_deleted=false
UNION ALL SELECT 'hse_org_unit', COUNT(*) FROM hse_org_unit WHERE is_deleted=false
UNION ALL SELECT 'hse_operation_unit', COUNT(*) FROM hse_operation_unit
UNION ALL SELECT 'dept_with_emp', COUNT(DISTINCT ou.id) FROM employee_assignment ea JOIN hse_org_unit ou ON ea.org_unit_id=ou.id WHERE ea.is_primary=true AND ou.is_deleted=false;
