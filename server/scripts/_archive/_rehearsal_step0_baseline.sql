-- ================================================================
-- TRAE-Step14 步骤 0: Dev 行数基线快照
-- ================================================================
-- 目的: 记录彩排开始前各关键表的行数, 用于后续对比与回溯
-- ================================================================

SELECT 'step0_baseline' AS section;

SELECT
  (SELECT COUNT(*) FROM employee) AS employee_total,
  (SELECT COUNT(*) FROM employee WHERE is_deleted=false) AS employee_active,
  (SELECT COUNT(*) FROM employee_assignment) AS ea_total,
  (SELECT COUNT(*) FROM employee_assignment WHERE is_deleted=false) AS ea_active,
  (SELECT COUNT(*) FROM violation_records) AS violation_total,
  (SELECT COUNT(*) FROM violation_records WHERE is_deleted=false) AS violation_active,
  (SELECT COUNT(*) FROM training_records) AS training_total,
  (SELECT COUNT(*) FROM training_records WHERE is_deleted=false) AS training_active,
  (SELECT COUNT(*) FROM violation_records WHERE is_deleted=false AND violator_id IS NULL) AS viol_null_id,
  (SELECT COUNT(*) FROM training_records WHERE is_deleted=false AND employee_id IS NULL) AS train_null_id;

-- 同时记录到 migration_baseline, 便于彩排后回溯
INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
VALUES
  ('REHEARSAL_STEP0', 'employee_total', (SELECT COUNT(*) FROM employee)),
  ('REHEARSAL_STEP0', 'employee_active', (SELECT COUNT(*) FROM employee WHERE is_deleted=false)),
  ('REHEARSAL_STEP0', 'ea_total', (SELECT COUNT(*) FROM employee_assignment)),
  ('REHEARSAL_STEP0', 'ea_active', (SELECT COUNT(*) FROM employee_assignment WHERE is_deleted=false)),
  ('REHEARSAL_STEP0', 'violation_total', (SELECT COUNT(*) FROM violation_records)),
  ('REHEARSAL_STEP0', 'violation_active', (SELECT COUNT(*) FROM violation_records WHERE is_deleted=false)),
  ('REHEARSAL_STEP0', 'training_total', (SELECT COUNT(*) FROM training_records)),
  ('REHEARSAL_STEP0', 'training_active', (SELECT COUNT(*) FROM training_records WHERE is_deleted=false)),
  ('REHEARSAL_STEP0', 'viol_null_id', (SELECT COUNT(*) FROM violation_records WHERE is_deleted=false AND violator_id IS NULL)),
  ('REHEARSAL_STEP0', 'train_null_id', (SELECT COUNT(*) FROM training_records WHERE is_deleted=false AND employee_id IS NULL))
ON CONFLICT (migration_id, metric_name) DO UPDATE SET
  metric_value = EXCLUDED.metric_value,
  recorded_at = NOW();

SELECT migration_id, metric_name, metric_value
FROM migration_baseline
WHERE migration_id = 'REHEARSAL_STEP0'
ORDER BY metric_name;
