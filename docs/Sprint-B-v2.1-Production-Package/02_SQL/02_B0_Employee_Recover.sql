-- ================================================================
-- Sprint-B v2.1 Production Migration
-- Script 02: B-0 Employee Recover
-- ================================================================
-- 执行顺序: 第 2 个执行（Step 0 检查全部通过后）
-- 依赖: 01_Pre_Check.sql 已执行成功
-- 风险等级: Medium (修改 employee 表 is_deleted 字段)
-- 阻断级别: P0 (失败需立即回滚)
-- 会话要求: 必须与 B-0 全流程在同一会话中执行
-- ================================================================
-- 注意: 本脚本包含恢复+验证，执行失败必须立即执行回滚
-- ================================================================

-- ================================================================
-- Step B-0-1: 恢复前数据快照
-- ================================================================
SELECT
    COUNT(*) AS total_employees,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_employees,
    COUNT(CASE WHEN is_deleted = true THEN 1 END) AS deleted_employees
FROM employee;

INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
VALUES
('B0_20260728', 'employee_total_before', (SELECT COUNT(*) FROM employee)),
('B0_20260728', 'employee_active_before', (SELECT COUNT(*) FROM employee WHERE is_deleted=false)),
('B0_20260728', 'employee_deleted_before', (SELECT COUNT(*) FROM employee WHERE is_deleted=true))
ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;

-- 计算可恢复数量
SELECT COUNT(DISTINCT employee_id) AS recoverable_count
FROM (
    SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
    UNION
    SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
) AS source_union
WHERE employee_id IN (SELECT id FROM employee WHERE is_deleted = true);

-- ================================================================
-- Step B-0-2: 创建恢复 ID 临时表 + 持久化备份
-- ================================================================
CREATE TEMP TABLE IF NOT EXISTS temp_b0_recover_ids (
    employee_id BIGINT PRIMARY KEY,
    recovered_at TIMESTAMP DEFAULT NOW()
);

TRUNCATE temp_b0_recover_ids;

INSERT INTO temp_b0_recover_ids (employee_id)
SELECT DISTINCT employee_id
FROM (
    SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
    UNION
    SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
) AS source_union
WHERE employee_id IN (SELECT id FROM employee WHERE is_deleted = true);

-- 持久化备份（会话断开也可恢复）
DROP TABLE IF EXISTS temp_b0_recover_ids_backup_20260728;
CREATE TABLE temp_b0_recover_ids_backup_20260728 AS
SELECT * FROM temp_b0_recover_ids;

UPDATE migration_backup_registry
SET created_at = NOW()
WHERE backup_id = 'B0_RECOVER_IDS_20260728';

INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
VALUES ('B0_20260728', 'recover_id_count', (SELECT COUNT(*) FROM temp_b0_recover_ids))
ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;

-- 验证
SELECT
    (SELECT COUNT(*) FROM temp_b0_recover_ids) AS temp_count,
    (SELECT COUNT(*) FROM temp_b0_recover_ids_backup_20260728) AS backup_count;

-- 目标: temp_count = backup_count

-- ================================================================
-- Step B-0-3: 执行恢复 SQL (v2.1-Final)
-- 修复: baseline_count IS NULL 时明确输出 NOTICE，避免静默失效
-- ================================================================
DO $$
DECLARE
    rec_count INTEGER;
    baseline_count NUMERIC;
BEGIN
    SELECT metric_value INTO baseline_count
    FROM migration_baseline
    WHERE migration_id = 'B0_20260728' AND metric_name = 'recover_id_count';

    UPDATE employee
    SET is_deleted = false,
        updated_at = NOW()
    WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids)
      AND is_deleted = true;

    GET DIAGNOSTICS rec_count = ROW_COUNT;

    RAISE NOTICE '恢复记录数: % (基线: %)', rec_count, baseline_count;

    IF baseline_count IS NULL THEN
        RAISE NOTICE '基线不存在，跳过动态校验';
    ELSIF rec_count < baseline_count * 0.98 OR rec_count > baseline_count * 1.02 THEN
        RAISE EXCEPTION '恢复行数异常: %, 预期范围 [%, %]',
            rec_count,
            FLOOR(baseline_count * 0.98),
            CEIL(baseline_count * 1.02);
    END IF;

    INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
    VALUES ('B0_20260728', 'actual_recover_count', rec_count)
    ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;
END $$;

-- ================================================================
-- Step B-0-4: 恢复后验证
-- ================================================================
-- 4.1 验证所有恢复的员工已激活
SELECT
    COUNT(*) AS total_in_temp,
    COUNT(CASE WHEN e.is_deleted = false THEN 1 END) AS recovered_active,
    COUNT(CASE WHEN e.is_deleted = true THEN 1 END) AS still_deleted
FROM temp_b0_recover_ids t
JOIN employee e ON e.id = t.employee_id;

-- 目标: still_deleted = 0

-- 4.2 动态基线校验
SELECT
    baseline.metric_value AS expected_active_before,
    (SELECT metric_value FROM migration_baseline WHERE migration_id='B0_20260728' AND metric_name='recover_id_count') AS expected_increase,
    (SELECT COUNT(*) FROM employee WHERE is_deleted=false) AS actual_active,
    CASE
        WHEN (SELECT COUNT(*) FROM employee WHERE is_deleted=false)
             >= baseline.metric_value + (SELECT metric_value FROM migration_baseline WHERE migration_id='B0_20260728' AND metric_name='recover_id_count') * 0.98
        THEN 'PASS'
        ELSE 'FAIL'
    END AS status
FROM migration_baseline baseline
WHERE baseline.migration_id = 'B0_20260728'
  AND baseline.metric_name = 'employee_active_before';

-- 目标: status = 'PASS'

-- 4.3 关联完整性验证
SELECT COUNT(*) AS missing_employee_refs
FROM hse_employee_relation her
LEFT JOIN employee e ON her.employee_id = e.id AND e.is_deleted = false
WHERE her.is_deleted = false AND e.id IS NULL;

-- 目标: missing_employee_refs = 0

-- ================================================================
-- B-0 完成确认
-- ================================================================
-- 验证全部通过后，继续执行 03_B1_Organization_Verify.sql
-- 若任何验证失败，立即执行 06_Rollback.sql 中的 B-0 回滚
-- ================================================================
