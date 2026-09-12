-- 1107 个新导入的人里 41 人有工伤险记录的真实状态
SELECT p.employee_id, e.name, p.start_date, p.expire_date, p.is_current, p.coverage_amount, p.created_at
FROM personnel_insurance p
LEFT JOIN v_employee_current e ON e.employee_id = p.employee_id
WHERE p.is_deleted = false AND p.insurance_type = '工伤保险'
  AND p.employee_id IN (
    SELECT DISTINCT employee_id FROM personnel_insurance
    WHERE is_deleted=false AND insurance_type='雇主责任险'
      AND coverage_amount IN (800000,100000)
      AND created_at > NOW() - INTERVAL '2 hours'
  )
ORDER BY p.employee_id LIMIT 10;
