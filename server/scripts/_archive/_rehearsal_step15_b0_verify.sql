-- ================================================================
-- TRAE-Step15 回归验证: B-0-1.5 备份登记 (修订后版本)
-- ================================================================
-- 验证 migration_backup_registry (backup_id, backup_table, remark) 字段名修订生效
-- ================================================================

SELECT '=== B-0-1.5 回归: 备份表创建 + 登记INSERT ===' AS section;

-- 备份表已存在（Step14 创建），这里只验证 INSERT 不再报字段错误
INSERT INTO migration_backup_registry (backup_id, backup_table, remark)
VALUES ('B0_EMPLOYEE_BACKUP', 'employee_b0_backup_20260728', 'B-0 Employee 全量备份（v1.2-fix 回归验证）')
ON CONFLICT (backup_id) DO UPDATE SET created_at = NOW();

SELECT '=== B-2-1 回归: 备份登记INSERT ===' AS section;

INSERT INTO migration_backup_registry (backup_id, backup_table, remark)
VALUES ('B2_EA_PROD', 'employee_assignment_b2_backup_prod', 'B-2 employee_assignment 备份（v1.2-fix 回归验证）')
ON CONFLICT (backup_id) DO UPDATE SET created_at = NOW();

SELECT '=== 验证登记结果 ===' AS section;

SELECT backup_id, backup_table, remark, created_at
FROM migration_backup_registry
ORDER BY created_at DESC
LIMIT 5;
