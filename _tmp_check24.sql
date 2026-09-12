SELECT d.id, t.employee_name, d.suggested_score, d.confirmed_score, d.review_status, d.current_version, d.remark
FROM hse_assessment_deduction d
LEFT JOIN hse_assessment_target t ON t.id=d.target_id
WHERE d.cycle_id=24 AND d.is_deleted=FALSE
  AND d.review_status <> 'pending'
ORDER BY d.id;
