SELECT d.id, t.employee_name, d.suggested_score, d.confirmed_score, d.review_status, d.current_version,
       d.source_detail->>'summary' AS summary,
       (SELECT COUNT(*) FROM hse_deduction_adjustment a WHERE a.deduction_id=d.id AND a.adjustment_reason LIKE '%测试%') AS test_adj_cnt
FROM hse_assessment_deduction d
LEFT JOIN hse_assessment_target t ON t.id=d.target_id
WHERE d.cycle_id=24 AND d.id IN (96,97) AND d.is_deleted=FALSE
ORDER BY d.id;
