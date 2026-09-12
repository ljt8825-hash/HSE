-- ================================================================
-- TRAE-Step14 步骤 4: 迁移后基线校验
-- ================================================================

SELECT '=== 4.1 动态基线偏差检查 ===' AS section;

SELECT
    baseline.metric_value AS baseline_count,
    actual.metric_value AS actual_count,
    CASE
        WHEN actual.metric_value >= baseline.metric_value * 0.98
         AND actual.metric_value <= baseline.metric_value * 1.02
        THEN 'PASS'
        ELSE 'FAIL'
    END AS verdict,
    ROUND(ABS(actual.metric_value - baseline.metric_value) * 100.0 / NULLIF(baseline.metric_value, 0), 2) AS deviation_pct
FROM migration_baseline baseline
JOIN migration_baseline actual ON actual.migration_id = baseline.migration_id
WHERE baseline.migration_id = 'B2_20260728'
  AND baseline.metric_name = 'her_current_count'
  AND actual.metric_name = 'actual_migrate_count';

SELECT '=== 4.2 迁移结果汇总 ===' AS section;

SELECT
    (SELECT metric_value FROM migration_baseline WHERE migration_id = 'B2_20260728' AND metric_name = 'her_current_count') AS baseline,
    (SELECT metric_value FROM migration_baseline WHERE migration_id = 'B2_20260728' AND metric_name = 'actual_migrate_count') AS actual,
    (SELECT COUNT(*) FROM employee_assignment WHERE created_by = 'system_migration_b2') AS b2_records,
    (SELECT COUNT(DISTINCT employee_id) FROM employee_assignment WHERE created_by = 'system_migration_b2') AS b2_distinct_employees;

SELECT '=== 4.3 异常日志检查 ===' AS section;

SELECT
    (SELECT metric_value FROM migration_baseline WHERE migration_id = 'B2_20260728' AND metric_name = 'anomaly_count') AS anomaly_count;

SELECT '=== 4.4 status 分布检查 (无 ELSE 验证) ===' AS section;

SELECT status, COUNT(*) AS cnt
FROM employee_assignment
WHERE created_by = 'system_migration_b2'
GROUP BY status
ORDER BY cnt DESC;

SELECT '=== 4.5 当前 employee_assignment 行数 (与基线对比) ===' AS section;

SELECT
  (SELECT COUNT(*) FROM employee_assignment) AS ea_total_after,
  (SELECT COUNT(*) FROM employee_assignment WHERE is_deleted=false) AS ea_active_after,
  (SELECT metric_value FROM migration_baseline WHERE migration_id='REHEARSAL_STEP0' AND metric_name='ea_total') AS ea_total_before,
  (SELECT metric_value FROM migration_baseline WHERE migration_id='REHEARSAL_STEP0' AND metric_name='ea_active') AS ea_active_before;
