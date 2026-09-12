-- 提示词-65 B-1 审计（只读）：列出待删孤儿行供人工复核
-- 仅查询，不修改数据

-- B-1a: hse_deduction_adjustment 孤儿详情
SELECT da.id,
       da.adjusted_by,
       da.adjusted_at,
       da.operation_type,
       da.adjustment_reason,
       da.created_at
FROM hse_deduction_adjustment da
LEFT JOIN employee e ON e.id = da.adjusted_by
WHERE da.adjusted_by IS NOT NULL
  AND e.id IS NULL
ORDER BY da.adjusted_at;

-- B-1b: hse_assessment_audit_log 孤儿详情
SELECT al.id,
       al.operator_id,
       al.operation_time,
       al.module,
       al.operation_type,
       al.operation_reason
FROM hse_assessment_audit_log al
LEFT JOIN employee e ON e.id = al.operator_id
WHERE al.operator_id IS NOT NULL
  AND e.id IS NULL
ORDER BY al.operation_time DESC;

-- B-1c: 汇总计数（门控：应为 4 + 49 = 53）
SELECT 'hse_deduction_adjustment' AS tbl, COUNT(*) AS orphans
FROM hse_deduction_adjustment da
LEFT JOIN employee e ON e.id = da.adjusted_by
WHERE da.adjusted_by IS NOT NULL AND e.id IS NULL
UNION ALL
SELECT 'hse_assessment_audit_log', COUNT(*)
FROM hse_assessment_audit_log al
LEFT JOIN employee e ON e.id = al.operator_id
WHERE al.operator_id IS NOT NULL AND e.id IS NULL;
