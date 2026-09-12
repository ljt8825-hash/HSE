-- ================================================================
-- Sprint-B v2.1 Production Migration
-- Script 06: Rollback
-- ================================================================
-- 执行顺序: 按需执行（迁移失败或回滚演练时）
-- 依赖: 01_Pre_Check.sql 已执行（备份表已创建）
-- 风险等级: High (回滚操作)
-- 阻断级别: P0 (必须严格按顺序执行)
-- ================================================================
-- 注意: 本脚本包含 B-2 回滚和 B-0 回滚，必须按逆序执行
--       先回滚 B-2，再回滚 B-0
-- ================================================================

-- ================================================================
-- Rollback B-2: 回滚 employee_assignment 迁移
-- ================================================================
-- 策略 2: 恢复 UPSERT 覆盖记录（生产推荐）
-- 适用: B-2 迁移失败或需要撤销 B-2 迁移
-- ================================================================

DO $$
DECLARE
    deleted_count INTEGER;
    recovered_count INTEGER;
BEGIN
    -- 第一步: 删除所有迁移新增的记录
    DELETE FROM employee_assignment
    WHERE created_by = 'system_migration_b2';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- 第二步: 恢复备份中被 UPSERT 覆盖的记录
    INSERT INTO employee_assignment
    SELECT *
    FROM employee_assignment_b2_backup_20260728 backup
    WHERE NOT EXISTS (
        SELECT 1 FROM employee_assignment ea
        WHERE ea.id = backup.id
    )
    ON CONFLICT (id) DO UPDATE SET
        org_unit_id = EXCLUDED.org_unit_id,
        operation_unit_id = EXCLUDED.operation_unit_id,
        position_id = EXCLUDED.position_id,
        supervisor_id = EXCLUDED.supervisor_id,
        status = EXCLUDED.status,
        is_primary = EXCLUDED.is_primary,
        is_current = EXCLUDED.is_current,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        remark = EXCLUDED.remark,
        created_by = EXCLUDED.created_by,
        created_at = EXCLUDED.created_at,
        updated_at = NOW(),
        is_deleted = EXCLUDED.is_deleted;

    GET DIAGNOSTICS recovered_count = ROW_COUNT;

    RAISE NOTICE 'B-2 回滚完成: 删除 %, 恢复 %', deleted_count, recovered_count;
END $$;

-- 验证 B-2 回滚
SELECT
    (SELECT COUNT(*) FROM employee_assignment) AS current_count,
    (SELECT COUNT(*) FROM employee_assignment_b2_backup_20260728) AS backup_count,
    (SELECT COUNT(*) FROM employee_assignment WHERE created_by = 'system_migration_b2') AS migration_remaining;

-- 目标: migration_remaining = 0

-- ================================================================
-- Rollback B-0: 回滚 employee 恢复
-- ================================================================
-- 策略 2: 从持久化备份表回滚（生产推荐）
-- 适用: B-0 恢复失败或需要撤销 B-0 恢复
-- 注意: 必须先完成 B-2 回滚，再执行 B-0 回滚
-- ================================================================

DO $$
DECLARE
    rollback_count INTEGER;
BEGIN
    UPDATE employee
    SET is_deleted = true,
        updated_at = NOW()
    WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids_backup_20260728)
      AND is_deleted = false;

    GET DIAGNOSTICS rollback_count = ROW_COUNT;
    RAISE NOTICE 'B-0 回滚记录数: %', rollback_count;
END $$;

-- 验证 B-0 回滚
SELECT
    (SELECT COUNT(*) FROM employee WHERE is_deleted = false) AS active_after_rollback,
    (SELECT metric_value FROM migration_baseline WHERE migration_id='B0_20260728' AND metric_name='employee_active_before') AS active_before,
    (SELECT COUNT(*) FROM temp_b0_recover_ids_backup_20260728) AS backup_recover_ids;

-- 目标: active_after_rollback 应接近 active_before（误差 <= 2%）

-- ================================================================
-- 全量恢复（最后手段）
-- ================================================================
-- 如上述策略均失败，使用 pg_restore 从全量备份恢复
--
-- bash:
-- pg_restore -h localhost -U postgres -d safety_dashboard \
--   -t employee \
--   -t employee_assignment \
--   -t hse_employee_relation \
--   F:\backup\20260728_0200_sprint_b_tables.dump
-- ================================================================

-- ================================================================
-- 回滚完成确认
-- ================================================================
-- 回滚后需验证:
-- 1. employee 活跃数恢复至迁移前水平
-- 2. employee_assignment 恢复至备份状态
-- 3. 所有迁移标记记录已清除
-- ================================================================
