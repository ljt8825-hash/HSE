-- ================================================================
-- Sprint-B v2.1 Production Migration
-- Script 05: Data Consistency Check
-- ================================================================
-- 执行顺序: 第 5 个执行（B-2 迁移完成后）
-- 依赖: 04_B2_Assignment_Migration.sql 已执行成功
-- 风险等级: Low (只读检查)
-- 阻断级别: P1 (失败需评估影响范围)
-- ================================================================
-- 注意: 本脚本为只读验证，不修改任何数据
-- ================================================================

-- ================================================================
-- 8.1 数据完整性验证 (动态基线对比)
-- ================================================================
SELECT
    mb.metric_name,
    mb.metric_value AS expected,
    CASE mb.metric_name
        WHEN 'employee_active_before' THEN
            (SELECT COUNT(*) FROM employee WHERE is_deleted=false) -
            (SELECT metric_value FROM migration_baseline WHERE migration_id='B0_20260728' AND metric_name='recover_id_count')
        WHEN 'actual_migrate_count' THEN
            (SELECT COUNT(*) FROM employee_assignment WHERE created_by='system_migration_b2')
    END AS actual,
    CASE
        WHEN mb.metric_value = 0 THEN 'PASS'
        WHEN ABS(
            CASE mb.metric_name
                WHEN 'employee_active_before' THEN
                    (SELECT COUNT(*) FROM employee WHERE is_deleted=false) -
                    (SELECT metric_value FROM migration_baseline WHERE migration_id='B0_20260728' AND metric_name='recover_id_count')
                WHEN 'actual_migrate_count' THEN
                    (SELECT COUNT(*) FROM employee_assignment WHERE created_by='system_migration_b2')
            END - mb.metric_value
        ) <= mb.metric_value * 0.02 THEN 'PASS'
        ELSE 'FAIL'
    END AS status
FROM migration_baseline mb
WHERE mb.migration_id IN ('B0_20260728', 'B2_20260728')
  AND mb.metric_name IN ('employee_active_before', 'actual_migrate_count')
ORDER BY mb.migration_id, mb.metric_name;

-- 目标: 所有行 status = 'PASS'

-- ================================================================
-- 8.2 关联完整性验证
-- ================================================================
-- employee_assignment -> employee
SELECT COUNT(*) AS missing_employee
FROM employee_assignment ea
LEFT JOIN employee e ON ea.employee_id = e.id AND e.is_deleted = false
WHERE ea.is_deleted = false AND e.id IS NULL;

-- 目标: missing_employee = 0

-- employee_assignment -> position
SELECT COUNT(*) AS missing_position
FROM employee_assignment ea
LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
WHERE ea.is_deleted = false AND p.id IS NULL;

-- 目标: missing_position = 0

-- employee_assignment -> hse_org_unit
SELECT COUNT(*) AS missing_org
FROM employee_assignment ea
LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
WHERE ea.is_deleted = false AND ou.id IS NULL;

-- 目标: missing_org = 0

-- ================================================================
-- 8.3 数据差异验证 (UPSERT 覆盖范围)
-- ================================================================
SELECT COUNT(*) AS overwritten_records
FROM employee_assignment ea
JOIN employee_assignment_b2_backup_20260728 bak ON ea.id = bak.id
WHERE ea.created_by = 'system_migration_b2'
  AND (ea.org_unit_id IS DISTINCT FROM bak.org_unit_id
    OR ea.operation_unit_id IS DISTINCT FROM bak.operation_unit_id
    OR ea.position_id IS DISTINCT FROM bak.position_id);

-- 记录覆盖范围，供业务确认

-- ================================================================
-- 8.4 status 分布一致性检查
-- ================================================================
SELECT
    target.status,
    target.cnt AS target_count,
    source.cnt AS source_count,
    CASE
        WHEN target.cnt = source.cnt THEN 'PASS'
        ELSE 'CHECK'
    END AS status_match
FROM (
    SELECT status, COUNT(*) AS cnt
    FROM employee_assignment
    WHERE is_deleted = false AND created_by = 'system_migration_b2'
    GROUP BY status
) target
LEFT JOIN (
    SELECT
        CASE
            WHEN status IS NULL THEN 'active'
            WHEN status IN ('leave', 'resigned', 'retired', 'dismissed') THEN 'inactive'
            WHEN status = 'returned' THEN 'active'
            ELSE status
        END AS status,
        COUNT(*) AS cnt
    FROM hse_employee_relation
    WHERE is_deleted = false AND is_current = true
    GROUP BY
        CASE
            WHEN status IS NULL THEN 'active'
            WHEN status IN ('leave', 'resigned', 'retired', 'dismissed') THEN 'inactive'
            WHEN status = 'returned' THEN 'active'
            ELSE status
        END
) source ON target.status = source.status
ORDER BY target.status;

-- 目标: 所有行 status_match = 'PASS'

-- ================================================================
-- 数据一致性结论
-- ================================================================
-- 所有检查 PASS 后，可进入应用启动和冒烟测试阶段
-- 若存在 FAIL 项，评估影响范围，必要时执行回滚
-- ================================================================
