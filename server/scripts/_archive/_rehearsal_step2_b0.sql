-- ================================================================
-- TRAE-Step14 步骤 2: B-0 Employee 恢复演练
-- ================================================================
-- 完全遵循 Runbook §3.1 B-0-1.5 + B-0-2..B-0-4 的 SQL
-- 仅 dev 演练, 不改业务数据状态; 只验证 SQL 可执行
-- ================================================================

SELECT '=== B-0-1: 恢复前数据快照 ===' AS section;

SELECT
    COUNT(*) AS total_employees,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_employees,
    COUNT(CASE WHEN is_deleted = true THEN 1 END) AS deleted_employees
FROM employee;

SELECT '=== B-0-1.5: 创建全量备份表 employee_b0_backup_20260728 ===' AS section;

DROP TABLE IF EXISTS employee_b0_backup_20260728;
CREATE TABLE employee_b0_backup_20260728 AS
SELECT * FROM employee
WHERE id IN (
    SELECT DISTINCT her.employee_id
    FROM hse_employee_relation her
    JOIN employee e ON e.id = her.employee_id
    WHERE her.is_deleted = false
      AND her.is_current = true
      AND e.is_deleted = true
);

INSERT INTO migration_backup_registry (backup_id, backup_table, description)
VALUES ('B0_EMPLOYEE_BACKUP', 'employee_b0_backup_20260728', 'B-0 Employee 全量备份（彩排用）')
ON CONFLICT (backup_id) DO UPDATE SET created_at = NOW();

SELECT COUNT(*) AS backup_record_count FROM employee_b0_backup_20260728;

SELECT '=== B-0-2: 创建恢复 ID 临时表 ===' AS section;

CREATE TEMP TABLE IF NOT EXISTS temp_b0_recover_ids (
    employee_id BIGINT PRIMARY KEY,
    recovered_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO temp_b0_recover_ids (employee_id)
SELECT DISTINCT her.employee_id
FROM hse_employee_relation her
JOIN employee e ON e.id = her.employee_id
WHERE her.is_deleted = false
  AND her.is_current = true
  AND e.is_deleted = true
ON CONFLICT (employee_id) DO NOTHING;

SELECT COUNT(*) AS temp_recover_ids FROM temp_b0_recover_ids;

SELECT '=== B-0-3 预演: 显示将被恢复的员工数 (不实际执行 UPDATE) ===' AS section;

SELECT
    COUNT(*) AS would_recover_count
FROM temp_b0_recover_ids t
JOIN employee e ON e.id = t.employee_id
WHERE e.is_deleted = true;

SELECT '=== B-0-4 验证: 当前员工状态分布 ===' AS section;

SELECT
    COUNT(*) AS total_in_temp,
    COUNT(CASE WHEN e.is_deleted = false THEN 1 END) AS already_active,
    COUNT(CASE WHEN e.is_deleted = true THEN 1 END) AS still_deleted
FROM temp_b0_recover_ids t
JOIN employee e ON e.id = t.employee_id;

-- 注: 彩排不实际执行 UPDATE, 以保持 dev 业务数据状态不变
-- 真实生产环境执行时, 此处会执行 UPDATE employee SET is_deleted=false WHERE id IN (...)
SELECT '=== B-0 演练完成: SQL 全部可执行 ===' AS section;
