SELECT d.id, t.employee_name, d.review_status, d.created_at
FROM hse_assessment_deduction d
LEFT JOIN hse_assessment_target t ON t.id=d.target_id
WHERE d.cycle_id=24 AND d.is_deleted=FALSE AND d.review_status='pending'
ORDER BY d.created_at DESC
LIMIT 24;
