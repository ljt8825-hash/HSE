-- ================================================================
-- DEV REHEARSAL ONLY - Modified copy of 04_B2_Assignment_Migration.sql
-- ================================================================
-- 唯一修改: Line 162 ON CONFLICT ON CONSTRAINT uk_emp_assign_primary
--        ->  ON CONFLICT (employee_id) WHERE is_primary = true AND is_current = true AND is_deleted = false
-- 原因: PostgreSQL 部分唯一索引(PARTIAL UNIQUE INDEX)不能用 ON CONSTRAINT 语法
--       必须用 ON CONFLICT (column) WHERE ... 语法匹配部分索引
-- ================================================================

-- Step 1: Backup
DROP TABLE IF EXISTS employee_assignment_b2_backup_20260728;
CREATE TABLE employee_assignment_b2_backup_20260728 AS
SELECT * FROM employee_assignment;

UPDATE migration_backup_registry
SET created_at = NOW()
WHERE backup_id = 'B2_EA_20260728';

INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
VALUES
('B2_20260728', 'ea_backup_count', (SELECT COUNT(*) FROM employee_assignment_b2_backup_20260728)),
('B2_20260728', 'ea_backup_active', (SELECT COUNT(*) FROM employee_assignment_b2_backup_20260728 WHERE is_deleted=false))
ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;

SELECT
    (SELECT COUNT(*) FROM employee_assignment) AS original_count,
    (SELECT COUNT(*) FROM employee_assignment_b2_backup_20260728) AS backup_count;

-- Step 1.5: Dirty data check
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS b2_dirty_data_check (
        employee_id BIGINT,
        duplicate_count BIGINT,
        detected_at TIMESTAMP DEFAULT NOW()
    );
    TRUNCATE b2_dirty_data_check;
    INSERT INTO b2_dirty_data_check (employee_id, duplicate_count)
    SELECT employee_id, COUNT(*) AS duplicate_count
    FROM hse_employee_relation
    WHERE is_deleted = false AND is_current = true
    GROUP BY employee_id HAVING COUNT(*) > 1;
    GET DIAGNOSTICS duplicate_count = ROW_COUNT;
    RAISE NOTICE 'duplicate_count: %', duplicate_count;
    IF duplicate_count > 0 THEN
        RAISE EXCEPTION 'B-2 duplicate: %', duplicate_count;
    END IF;
END $$;

-- Step 1.6: Status pre-check
DO $$
DECLARE
    unknown_status_count INTEGER;
BEGIN
    SELECT COUNT(DISTINCT status) INTO unknown_status_count
    FROM hse_employee_relation
    WHERE is_deleted = false AND status IS NOT NULL
      AND status NOT IN ('active', 'pending', 'inactive', 'leave', 'resigned', 'retired', 'dismissed', 'returned');
    IF unknown_status_count > 0 THEN
        RAISE EXCEPTION 'unknown status: %', unknown_status_count;
    END IF;
    RAISE NOTICE 'status pre-check passed';
END $$;

-- Step 2: Execute migration (FIXED ON CONFLICT syntax)
DO $$
DECLARE
    insert_count INTEGER;
    anomaly_count INTEGER;
    baseline_count NUMERIC;
BEGIN
    SELECT metric_value INTO baseline_count
    FROM migration_baseline
    WHERE migration_id = 'B2_20260728' AND metric_name = 'her_current_count';

    INSERT INTO employee_assignment (
        employee_id, org_unit_id, operation_unit_id, position_id,
        supervisor_id, is_primary, is_current, status,
        start_date, end_date, remark, created_by, created_at, updated_at, is_deleted
    )
    SELECT
        her.employee_id, her.org_unit_id, her.operation_unit_id, her.position_id,
        her.supervisor_id,
        COALESCE(her.is_primary, true) AS is_primary,
        COALESCE(her.is_current, true) AS is_current,
        CASE
            WHEN her.status IS NULL      THEN 'active'
            WHEN her.status = 'active'   THEN 'active'
            WHEN her.status = 'pending'  THEN 'pending'
            WHEN her.status = 'inactive' THEN 'inactive'
            WHEN her.status = 'leave'    THEN 'inactive'
            WHEN her.status = 'resigned' THEN 'inactive'
            WHEN her.status = 'retired'  THEN 'inactive'
            WHEN her.status = 'dismissed' THEN 'inactive'
            WHEN her.status = 'returned' THEN 'active'
        END AS status,
        COALESCE(her.start_date, CURRENT_DATE) AS start_date,
        her.end_date, her.remark,
        'system_migration_b2' AS created_by,
        COALESCE(her.created_at, NOW()) AS created_at,
        NOW() AS updated_at,
        false AS is_deleted
    FROM hse_employee_relation her
    WHERE her.is_deleted = false AND her.is_current = true
    -- FIX: partial unique index requires ON CONFLICT (col) WHERE ... syntax
    ON CONFLICT (employee_id) WHERE is_primary = true AND is_current = true AND is_deleted = false
    DO UPDATE SET
        org_unit_id = EXCLUDED.org_unit_id,
        operation_unit_id = EXCLUDED.operation_unit_id,
        position_id = EXCLUDED.position_id,
        supervisor_id = EXCLUDED.supervisor_id,
        status = EXCLUDED.status,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        remark = EXCLUDED.remark,
        updated_at = NOW(),
        is_deleted = false;

    GET DIAGNOSTICS insert_count = ROW_COUNT;

    CREATE TEMP TABLE IF NOT EXISTS b2_anomaly_log (
        employee_id BIGINT,
        old_status VARCHAR(50),
        old_position_id BIGINT,
        anomaly_type VARCHAR(50),
        detected_at TIMESTAMP DEFAULT NOW()
    );

    INSERT INTO b2_anomaly_log (employee_id, old_status, old_position_id, anomaly_type)
    SELECT employee_id, status AS old_status, position_id, 'unknown_status_fallback_to_active' AS anomaly_type
    FROM hse_employee_relation
    WHERE is_deleted = false
      AND status IS NOT NULL
      AND status NOT IN ('active', 'pending', 'inactive', 'leave', 'resigned', 'retired', 'dismissed', 'returned');

    GET DIAGNOSTICS anomaly_count = ROW_COUNT;

    RAISE NOTICE 'insert_count: %, baseline: %, anomaly_count: %', insert_count, baseline_count, anomaly_count;

    IF baseline_count IS NULL THEN
        RAISE NOTICE 'baseline not found, skip dynamic check';
    ELSIF insert_count < baseline_count * 0.98 OR insert_count > baseline_count * 1.02 THEN
        RAISE EXCEPTION 'row count out of range: %, expected [%, %]',
            insert_count, FLOOR(baseline_count * 0.98), CEIL(baseline_count * 1.02);
    END IF;

    INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
    VALUES
    ('B2_20260728', 'actual_migrate_count', insert_count),
    ('B2_20260728', 'anomaly_count', anomaly_count)
    ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;
END $$;

-- Step 3: Export anomalies
SELECT * FROM b2_anomaly_log ORDER BY employee_id;
