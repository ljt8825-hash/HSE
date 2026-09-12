-- 查 艾炳升/艾凤英 的雇主险记录真实字段（为什么 uninsured）
SELECT p.employee_id, e.name, p.insurance_type, p.is_current, p.start_date, p.expire_date, p.coverage_amount, p.policy_no, p.created_at
FROM personnel_insurance p
LEFT JOIN v_employee_current e ON e.employee_id = p.employee_id
WHERE p.is_deleted = false
  AND p.insurance_type = '雇主责任险'
  AND (e.name = '艾炳升' OR e.name = '艾凤英')
ORDER BY p.id;
