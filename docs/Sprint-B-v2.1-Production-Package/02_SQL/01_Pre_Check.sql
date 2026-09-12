-- ================================================================
-- Sprint-B v2.1 Production Migration
-- Script 01: Pre-Check (Step 0)
-- ================================================================
-- 执行顺序: 第 1 个执行
-- 依赖: 无
-- 风险等级: Low (只读检查 + 基础设施创建)
-- 阻断级别: P0 (任一失败禁止进入 B-0)
-- ================================================================
-- 注意: 本脚本所有检查必须全部通过，方可继续执行 02_B0_Employee_Recover.sql
-- ================================================================

-- ================================================================
-- Check 0.1: 数据库锁检查
-- ================================================================
SELECT
    pid,
    state,
    locktype,
    mode,
    relation::regclass AS table_name,
    query_start,
    query
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE l.mode = 'AccessExclusiveLock'
  AND a.datname = 'safety_dashboard';

-- 目标: 返回 0 行
-- 若失败: 排查持有锁的会话，终止后重新检查

-- ================================================================
-- Check 0.2: 活跃连接检查
-- ================================================================
SELECT
    pid,
    usename,
    application_name,
    client_addr,
    state,
    query_start,
    query
FROM pg_stat_activity
WHERE datname = 'safety_dashboard'
  AND state = 'active'
  AND pid <> pg_backend_pid();

-- 目标: 返回 0 行
-- 若失败: 确认应用已停止，终止残留连接后重新检查

-- ================================================================
-- Check 0.3: Schema 版本检查
-- ================================================================
-- 检查 employee 表关键字段
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'employee'
  AND column_name IN ('id', 'is_deleted', 'updated_at')
ORDER BY column_name;

-- 检查 employee_assignment 表关键字段
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'employee_assignment'
  AND column_name IN ('id', 'employee_id', 'org_unit_id', 'position_id', 'is_primary', 'is_current', 'status')
ORDER BY column_name;

-- 目标: 返回预期字段列表
-- 若失败: 确认表结构是否符合迁移要求

-- ================================================================
-- Check 0.4: employee 表无 updated_by 字段
-- ================================================================
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'employee' AND column_name = 'updated_by';

-- 目标: 返回 0 行
-- 说明: 确认不依赖此字段，避免迁移 SQL 报错

-- ================================================================
-- Check 0.5: employee_assignment 表存在性验证
-- ================================================================
SELECT COUNT(*) AS table_exists
FROM information_schema.tables
WHERE table_name = 'employee_assignment';

-- 目标: table_exists = 1
-- 若失败: employee_assignment 表不存在，需先建表

-- ================================================================
-- Check 0.6: employee_assignment 当前数据量评估
-- ================================================================
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_records,
    COUNT(CASE WHEN is_current = true AND is_deleted = false THEN 1 END) AS current_active,
    COUNT(CASE WHEN created_by = 'system_migration_b2' THEN 1 END) AS previous_migration_records
FROM employee_assignment;

-- 决策:
-- - previous_migration_records > 0: 已执行过 B-2，需先回滚或确认覆盖
-- - current_active > 0 且 previous_migration_records = 0: 有非迁移写入的数据，必须人工审核

-- ================================================================
-- Check 0.7: uk_emp_assign_primary 唯一索引验证 (P0)
-- ================================================================
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'employee_assignment'
  AND indexname = 'uk_emp_assign_primary';

-- 目标: 返回 1 行，且 indexdef 包含 WHERE (is_primary = true AND is_current = true AND is_deleted = false)
-- 若不存在，执行以下创建语句:

-- CREATE UNIQUE INDEX uk_emp_assign_primary
-- ON employee_assignment (employee_id)
-- WHERE is_primary = true
--   AND is_current = true
--   AND is_deleted = false;

-- 创建后必须重新执行本检查验证

-- ================================================================
-- Check 0.8: 数据差异基线检查
-- ================================================================
-- hse_employee_org 当前在职员工数
SELECT COUNT(DISTINCT employee_id) AS heo_current_employees
FROM hse_employee_org
WHERE is_current = true AND is_deleted = false;

-- employee_assignment 当前在职员工数
SELECT COUNT(DISTINCT employee_id) AS ea_current_employees
FROM employee_assignment
WHERE is_current = true AND is_deleted = false;

-- hse_employee_relation 当前员工数
SELECT COUNT(DISTINCT employee_id) AS her_current_employees
FROM hse_employee_relation
WHERE is_current = true AND is_deleted = false;

-- employee_assignment 中存在但 hse_employee_relation 中不存在的记录
SELECT COUNT(DISTINCT ea.employee_id) AS ea_only_count
FROM employee_assignment ea
LEFT JOIN hse_employee_relation her
  ON ea.employee_id = her.employee_id AND her.is_deleted = false
WHERE ea.is_deleted = false AND her.employee_id IS NULL;

-- 记录基线值，用于后续对比

-- ================================================================
-- Check 0.9: hse_employee_org status 枚举分布
-- ================================================================
SELECT status, COUNT(*) AS cnt
FROM hse_employee_org
WHERE is_current = true AND is_deleted = false
GROUP BY status
ORDER BY cnt DESC;

-- 记录分布，供参考

-- ================================================================
-- Check 0.10: hse_employee_relation status 枚举分布
-- ================================================================
SELECT status, COUNT(*) AS cnt
FROM hse_employee_relation
WHERE is_deleted = false
GROUP BY status
ORDER BY cnt DESC;

-- 记录分布，填入 Sprint-B-v2.1-Status-Mapping.md

-- ================================================================
-- Check 0.11: status 映射完整性确认 (P0 阻断项)
-- ================================================================
SELECT DISTINCT status
FROM hse_employee_relation
WHERE is_deleted = false
  AND status IS NOT NULL
  AND status NOT IN (
      'active', 'pending', 'inactive',
      'leave', 'resigned', 'retired',
      'dismissed', 'returned'
  );

-- 目标: 返回 0 行
-- 若 FAIL: 发现未映射 status，必须暂停迁移，联系业务方确认后补充映射

-- ================================================================
-- Check 0.12: 迁移基线表创建
-- ================================================================
CREATE TABLE IF NOT EXISTS migration_baseline (
    id SERIAL PRIMARY KEY,
    migration_id VARCHAR(64) NOT NULL,
    metric_name VARCHAR(128) NOT NULL,
    metric_value NUMERIC NOT NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    recorded_by VARCHAR(64) DEFAULT current_user,
    UNIQUE (migration_id, metric_name)
);

INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
VALUES
('B0_20260728', 'employee_active_before', (SELECT COUNT(*) FROM employee WHERE is_deleted=false)),
('B0_20260728', 'employee_deleted_before', (SELECT COUNT(*) FROM employee WHERE is_deleted=true)),
('B2_20260728', 'her_current_count', (SELECT COUNT(*) FROM hse_employee_relation WHERE is_current=true AND is_deleted=false)),
('B2_20260728', 'ea_before_count', (SELECT COUNT(*) FROM employee_assignment))
ON CONFLICT (migration_id, metric_name) DO UPDATE SET
    metric_value = EXCLUDED.metric_value,
    recorded_at = NOW();

-- 验证基线记录
SELECT * FROM migration_baseline WHERE migration_id LIKE 'B%_20260728' ORDER BY migration_id, metric_name;

-- 目标: 至少 4 条基线记录

-- ================================================================
-- Check 0.13: 迁移备份注册表创建
-- ================================================================
CREATE TABLE IF NOT EXISTS migration_backup_registry (
    backup_id VARCHAR(64) PRIMARY KEY,
    backup_table VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    remark TEXT
);

INSERT INTO migration_backup_registry (backup_id, backup_table, remark)
VALUES
('B0_RECOVER_IDS_20260728', 'temp_b0_recover_ids_backup_20260728', 'B-0 恢复范围备份'),
('B2_EA_20260728', 'employee_assignment_b2_backup_20260728', 'B-2 employee_assignment 备份')
ON CONFLICT (backup_id) DO UPDATE SET created_at = NOW();

-- ================================================================
-- Step 0 完成确认
-- ================================================================
-- 上述 13 项检查全部通过后，方可继续执行 02_B0_Employee_Recover.sql
-- ================================================================
