SELECT d.id, t.employee_name, d.suggested_score, d.confirmed_score, d.review_status, d.current_version
FROM hse_assessment_deduction d
LEFT JOIN hse_assessment_target t ON t.id=d.target_id
WHERE d.cycle_id=24 AND d.id=97;
SELECT a.id, a.deduction_id, a.version_no, a.old_score, a.new_score, a.operation_type, a.is_current, a.adjustment_reason
FROM hse_deduction_adjustment a
WHERE a.deduction_id=97
ORDER BY a.id;
