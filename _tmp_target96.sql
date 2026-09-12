SELECT d.target_id, t.employee_name, t.status
FROM hse_assessment_deduction d
LEFT JOIN hse_assessment_target t ON t.id=d.target_id
WHERE d.id=96;
