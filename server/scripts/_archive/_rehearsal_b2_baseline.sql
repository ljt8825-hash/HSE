-- Set her_current_count baseline before B-2 migration
INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
VALUES
('B2_20260728', 'her_current_count', (SELECT COUNT(*) FROM hse_employee_relation WHERE is_deleted = false AND is_current = true))
ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;

SELECT metric_value AS her_current_count
FROM migration_baseline
WHERE migration_id = 'B2_20260728' AND metric_name = 'her_current_count';
