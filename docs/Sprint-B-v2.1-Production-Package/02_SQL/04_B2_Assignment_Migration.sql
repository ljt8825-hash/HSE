-- ================================================================
-- Sprint-B v2.1 Production Migration (v1.2-fix)
-- Script 04: B-2 Assignment Migration
-- ================================================================
-- 执行顺序: 第 4 个执行（B-1 验证全部通过后）
-- 依赖: 03_B1_Organization_Verify.sql 已执行成功
-- 风险等级: High (核心数据迁移)
-- 阻断级别: P0 (失败需立即回滚)
-- 会话要求: 必须与 B-2 全流程在同一会话中执行
-- ================================================================
-- 注意: 本脚本包含备份+检查+迁移+验证，执行失败必须立即回滚
-- ================================================================
-- v1.2-fix 修订记录 (2026-07-28, TRAE-Step15):
--   L162: ON CONFLICT ON CONSTRAINT uk_emp_assign_primary
--         → ON CONFLICT (employee_id) WHERE is_primary = true AND is_current = true AND is_deleted = false
--   原因: uk_emp_assign_primary 是 PostgreSQL PARTIAL UNIQUE INDEX（非 CONSTRAINT），
--         必须用 ON CONFLICT (col) WHERE ... 语法匹配部分索引谓词。
--   依据: TRAE-Step14 Dev 彩排实测，原语法报"约束不存在"；修订后 dev 重跑 insert_count=1304, anomaly=0。
-- ================================================================

-- ================================================================
-- Step 1: 迁移前备份 employee_assignment
-- ================================================================
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

-- 目标: original_count = backup_count

-- ================================================================
-- Step 1.5: 脏数据检查 (P0 阻断项, v2.1-Final 新增)
-- ================================================================
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
    SELECT
        employee_id,
        COUNT(*) AS duplicate_count
    FROM hse_employee_relation
    WHERE is_deleted = false
      AND is_current = true
    GROUP BY employee_id
    HAVING COUNT(*) > 1;

    GET DIAGNOSTICS duplicate_count = ROW_COUNT;

    RAISE NOTICE '发现重复当前关系记录数: %', duplicate_count;

    IF duplicate_count > 0 THEN
        RAISE EXCEPTION 'B-2 迁移前发现 % 条员工存在重复当前关系，必须先清洗数据。查询 b2_dirty_data_check 获取详情。', duplicate_count;
    END IF;
END $$;

-- 目标: duplicate_count = 0
-- 若失败: 暂停迁移，清洗数据后重新执行

-- ================================================================
-- Step 1.6: status 映射预检查 (P0 阻断项, v2.1-Final 新增)
-- ================================================================
DO $$
DECLARE
    unknown_status_count INTEGER;
BEGIN
    SELECT COUNT(DISTINCT status) INTO unknown_status_count
    FROM hse_employee_relation
    WHERE is_deleted = false
      AND status IS NOT NULL
      AND status NOT IN (
          'active', 'pending', 'inactive',
          'leave', 'resigned', 'retired',
          'dismissed', 'returned'
      );

    IF unknown_status_count > 0 THEN
        RAISE EXCEPTION '发现 % 个未映射的 status 值，必须补充映射后重新执行。', unknown_status_count;
    END IF;

    RAISE NOTICE 'status 映射预检查通过';
END $$;

-- 目标: 无未映射 status
-- 若失败: 暂停迁移，补充映射后重新执行

-- ================================================================
-- Step 2: 执行迁移 SQL (v2.1-Final)
-- 修复: baseline_count NULL 校验 + 明确 status 映射(无 ELSE)
-- ================================================================
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
        employee_id,
        org_unit_id,
        operation_unit_id,
        position_id,
        supervisor_id,
        is_primary,
        is_current,
        status,
        start_date,
        end_date,
        remark,
        created_by,
        created_at,
        updated_at,
        is_deleted
    )
    SELECT
        her.employee_id,
        her.org_unit_id,
        her.operation_unit_id,
        her.position_id,
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
            -- 无 ELSE；未知 status 由 Step 1.6 预检查阻断
        END AS status,
        COALESCE(her.start_date, CURRENT_DATE) AS start_date,
        her.end_date,
        her.remark,
        'system_migration_b2' AS created_by,
        COALESCE(her.created_at, NOW()) AS created_at,
        NOW() AS updated_at,
        false AS is_deleted
    FROM hse_employee_relation her
    WHERE her.is_deleted = false
      AND her.is_current = true
    -- v1.2-fix: PARTIAL UNIQUE INDEX 必须用 ON CONFLICT (col) WHERE ... 语法
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

    -- 异常日志表
    CREATE TEMP TABLE IF NOT EXISTS b2_anomaly_log (
        employee_id BIGINT,
        old_status VARCHAR(50),
        old_position_id BIGINT,
        anomaly_type VARCHAR(50),
        detected_at TIMESTAMP DEFAULT NOW()
    );

    INSERT INTO b2_anomaly_log (employee_id, old_status, old_position_id, anomaly_type)
    SELECT
        employee_id,
        status AS old_status,
        position_id,
        'unknown_status_fallback_to_active' AS anomaly_type
    FROM hse_employee_relation
    WHERE is_deleted = false
      AND (
          status IS NOT NULL
          AND status NOT IN (
              'active', 'pending', 'inactive',
              'leave', 'resigned', 'retired',
              'dismissed', 'returned'
          )
      );

    GET DIAGNOSTICS anomaly_count = ROW_COUNT;

    RAISE NOTICE '迁移记录数: % (基线: %), 异常记录数: %',
        insert_count, baseline_count, anomaly_count;

    IF baseline_count IS NULL THEN
        RAISE NOTICE '基线不存在，跳过动态校验';
    ELSIF insert_count < baseline_count * 0.98 OR insert_count > baseline_count * 1.02 THEN
        RAISE EXCEPTION '迁移行数异常: %, 预期范围 [%, %]',
            insert_count,
            FLOOR(baseline_count * 0.98),
            CEIL(baseline_count * 1.02);
    END IF;

    INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
    VALUES
    ('B2_20260728', 'actual_migrate_count', insert_count),
    ('B2_20260728', 'anomaly_count', anomaly_count)
    ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;
END $$;

-- ================================================================
-- Step 3: 导出异常记录
-- ================================================================
SELECT * FROM b2_anomaly_log ORDER BY employee_id;

-- 异常处理: 导出为 CSV 并人工审核

-- ================================================================
-- B-2 完成确认
-- ================================================================
-- 迁移成功 + 异常审核通过后，继续执行 05_Data_Consistency_Check.sql
-- 若迁移失败或异常不可接受，立即执行 06_Rollback.sql
-- ================================================================
