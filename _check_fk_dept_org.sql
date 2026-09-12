-- Check if department and hse_org_unit have any FK relationship
SELECT
  tc.constraint_name,
  kcu.table_name AS fk_table,
  kcu.column_name AS fk_column,
  ccu.table_name AS ref_table,
  ccu.column_name AS ref_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND (kcu.table_name IN ('department', 'hse_org_unit', 'employee_assignment')
       OR ccu.table_name IN ('department', 'hse_org_unit'));
