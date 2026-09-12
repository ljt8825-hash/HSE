# Sprint-B SQL执行日志模板

> **模板版本**: v1.1
> **编制日期**: 2026-07-28
> **配套文档**: 《Sprint-B-v2.1-DryRun-Round2-Report.md》
> **用途**: 记录SQL执行过程中的详细日志，便于问题排查和审计
> **修订说明**: v2.1 整改项完成后新增 Check 0.13 / 0.14、B-2 Step 1.5 / 1.6 检查记录区域

---

## 执行环境信息

| 项目 | 内容 |
|------|------|
| 数据库服务器 | ____ |
| 数据库名称 | ____ |
| 数据库版本 | ____ |
| 执行用户 | ____ |
| 执行日期 | ____ 年 __ 月 __ 日 |
| 执行开始时间 | ____:____ |

---

## 一、Step 0 检查 SQL 执行日志

### 1.1 Check 0.1: 数据库锁检查

**执行时间**: ____:____:____
**SQL**: 
```sql
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
```

**执行结果**: 
```
____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 1.2 Check 0.2: 活跃连接检查

**执行时间**: ____:____:____
**SQL**: 
```sql
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
```

**执行结果**: 
```
____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 1.3 Check 0.3: Schema 版本检查

**执行时间**: ____:____:____
**SQL**: 
```sql
-- 检查 employee 表字段
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'employee'
  AND column_name IN ('id', 'is_deleted', 'updated_at')
ORDER BY column_name;
```

**执行结果**: 
```
____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 1.4 Check 0.4: employee 表无 updated_by 字段

**执行时间**: ____:____:____
**SQL**: 
```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'employee' AND column_name = 'updated_by';
```

**执行结果**: 
```
____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 1.5 Check 0.5: employee_assignment 表存在性验证

**执行时间**: ____:____:____
**SQL**: 
```sql
SELECT COUNT(*) AS table_exists
FROM information_schema.tables
WHERE table_name = 'employee_assignment';
```

**执行结果**: 
```
table_exists
____________
____
```

**影响行数**: 1 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 1.6 Check 0.6: employee_assignment 当前数据量

**执行时间**: ____:____:____
**SQL**: 
```sql
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_records,
    COUNT(CASE WHEN is_current = true AND is_deleted = false THEN 1 END) AS current_active,
    COUNT(CASE WHEN created_by = 'system_migration_b2' THEN 1 END) AS previous_migration_records
FROM employee_assignment;
```

**执行结果**: 
```
total_records | active_records | current_active | previous_migration_records
______________|________________|________________|__________________________
____          | ____           | ____           | ____
```

**影响行数**: 1 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 1.7 Check 0.7: uk_emp_assign_primary 唯一索引验证

**执行时间**: ____:____:____
**SQL**: 
```sql
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'employee_assignment'
  AND indexname = 'uk_emp_assign_primary';
```

**执行结果**: 
```
____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 1.8 Check 0.8: 数据差异基线检查

**执行时间**: ____:____:____
**SQL**: 
```sql
-- 8.1 hse_employee_org 当前在职员工数
SELECT COUNT(DISTINCT employee_id) AS heo_current_employees
FROM hse_employee_org
WHERE is_current = true AND is_deleted = false;

-- 8.2 employee_assignment 当前在职员工数
SELECT COUNT(DISTINCT employee_id) AS ea_current_employees
FROM employee_assignment
WHERE is_current = true AND is_deleted = false;

-- 8.3 hse_employee_relation 当前员工数
SELECT COUNT(DISTINCT employee_id) AS her_current_employees
FROM hse_employee_relation
WHERE is_current = true AND is_deleted = false;

-- 8.4 数据差异
SELECT COUNT(DISTINCT ea.employee_id) AS ea_only_count
FROM employee_assignment ea
LEFT JOIN hse_employee_relation her
  ON ea.employee_id = her.employee_id AND her.is_deleted = false
WHERE ea.is_deleted = false AND her.employee_id IS NULL;
```

**执行结果**: 
```
heo_current_employees: ____
ea_current_employees: ____
her_current_employees: ____
ea_only_count: ____
```

**影响行数**: 4 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 1.9 Check 0.11: 迁移基线表创建

**执行时间**: ____:____:____
**SQL**: 
```sql
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

SELECT * FROM migration_baseline WHERE migration_id LIKE 'B%_20260728' ORDER BY migration_id, metric_name;
```

**执行结果**: 
```
____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 1.10 Check 0.12: 迁移备份注册表创建

**执行时间**: ____:____:____
**SQL**: 
```sql
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
```

**执行结果**: 
```
____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 1.11 Check 0.13: status 映射完整性确认（v2.1 新增）

**执行时间**: ____:____:____
**SQL**: 
```sql
SELECT DISTINCT status
FROM hse_employee_relation
WHERE is_deleted = false
  AND status IS NOT NULL
  AND status NOT IN (
      'active', 'pending', 'inactive',
      'leave', 'resigned', 'retired',
      'dismissed', 'returned'
  );
```

**执行结果**: 
```
____
```

**影响行数**: ____ 行（目标：0 行）
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 1.12 Check 0.14: uk_emp_assign_primary 缺失时创建（v2.1 新增）

> 仅在 Check 0.7 结果为空时执行。

**执行时间**: ____:____:____
**SQL**: 
```sql
CREATE UNIQUE INDEX uk_emp_assign_primary
ON employee_assignment (employee_id)
WHERE is_primary = true
  AND is_current = true
  AND is_deleted = false;
```

**执行结果**: 
```
CREATE INDEX
```

**影响行数**: 0 行
**执行状态**: □ 成功 □ 失败（□ 无需执行）
**执行耗时**: ____ 毫秒

---

## 二、B-0 恢复 SQL 执行日志

### 2.1 Step B-0-1: 恢复前数据快照

**执行时间**: ____:____:____
**SQL**: 
```sql
SELECT
    COUNT(*) AS total_employees,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_employees,
    COUNT(CASE WHEN is_deleted = true THEN 1 END) AS deleted_employees
FROM employee;
```

**执行结果**: 
```
total_employees | active_employees | deleted_employees
________________|__________________|___________________
____            | ____             | ____
```

**影响行数**: 1 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 2.2 Step B-0-2: 创建恢复 ID 临时表 + 持久化备份

**执行时间**: ____:____:____
**SQL**: 
```sql
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

DROP TABLE IF EXISTS temp_b0_recover_ids_backup_20260728;
CREATE TABLE temp_b0_recover_ids_backup_20260728 AS
SELECT * FROM temp_b0_recover_ids;

UPDATE migration_backup_registry
SET created_at = NOW()
WHERE backup_id = 'B0_RECOVER_IDS_20260728';

INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
VALUES ('B0_20260728', 'recover_id_count', (SELECT COUNT(*) FROM temp_b0_recover_ids))
ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;

SELECT
    (SELECT COUNT(*) FROM temp_b0_recover_ids) AS temp_count,
    (SELECT COUNT(*) FROM temp_b0_recover_ids_backup_20260728) AS backup_count;
```

**执行结果**: 
```
temp_count | backup_count
___________|_____________
____       | ____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 2.3 Step B-0-3: 执行恢复 SQL

**执行时间**: ____:____:____
**SQL**: 
```sql
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
            rec_count, FLOOR(baseline_count * 0.98), CEIL(baseline_count * 1.02);
    END IF;

    INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
    VALUES ('B0_20260728', 'actual_recover_count', rec_count)
    ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;
END $$;
```

**执行结果**: 
```
RAISE NOTICE: 恢复记录数: ____ (基线: ____)
RAISE NOTICE: 基线不存在，跳过动态校验  -- 或校验通过
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

**错误信息**（如有）:
```
____
```

---

### 2.4 Step B-0-4: 恢复后验证 SQL

**执行时间**: ____:____:____
**SQL**: 
```sql
-- 4.1 临时表中的员工全部已恢复为活跃
SELECT
    COUNT(*) AS total_in_temp,
    COUNT(CASE WHEN e.is_deleted = false THEN 1 END) AS recovered_active,
    COUNT(CASE WHEN e.is_deleted = true THEN 1 END) AS still_deleted
FROM temp_b0_recover_ids t
JOIN employee e ON e.id = t.employee_id;

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

-- 4.3 关联完整性验证
SELECT COUNT(*) AS missing_employee_refs
FROM hse_employee_relation her
LEFT JOIN employee e ON her.employee_id = e.id AND e.is_deleted = false
WHERE her.is_deleted = false AND e.id IS NULL;
```

**执行结果**: 
```
total_in_temp | recovered_active | still_deleted
______________|__________________|_______________
____          | ____             | ____

expected_active_before | expected_increase | actual_active | status
_______________________|___________________|_______________|________
____                   | ____              | ____          | ____

missing_employee_refs
______________________
____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

## 三、B-1 验证 SQL 执行日志

### 3.1 Step 1: employee_relation → employee 关联检查

**执行时间**: ____:____:____
**SQL**: 
```sql
SELECT COUNT(*) AS missing_refs
FROM hse_employee_relation her
LEFT JOIN employee e ON her.employee_id = e.id AND e.is_deleted = false
WHERE her.is_deleted = false;
```

**执行结果**: 
```
missing_refs
____________
____
```

**影响行数**: 1 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 3.2 Step 2: position_id 有效性检查

**执行时间**: ____:____:____
**SQL**: 
```sql
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN p.id IS NOT NULL THEN 1 END) AS valid_positions,
    COUNT(CASE WHEN p.id IS NULL THEN 1 END) AS invalid_positions
FROM hse_employee_relation her
LEFT JOIN position p ON her.position_id = p.id AND p.is_deleted = false
WHERE her.is_deleted = false;
```

**执行结果**: 
```
total_records | valid_positions | invalid_positions
______________|_________________|___________________
____          | ____            | ____
```

**影响行数**: 1 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 3.3 Step 3: org_unit_id 有效性检查

**执行时间**: ____:____:____
**SQL**: 
```sql
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN ou.id IS NOT NULL THEN 1 END) AS valid_org_units,
    COUNT(CASE WHEN ou.id IS NULL THEN 1 END) AS invalid_org_units
FROM hse_employee_relation her
LEFT JOIN hse_org_unit ou ON her.org_unit_id = ou.id AND ou.is_deleted = false
WHERE her.is_deleted = false;
```

**执行结果**: 
```
total_records | valid_org_units | invalid_org_units
______________|_________________|___________________
____          | ____            | ____
```

**影响行数**: 1 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 3.4 Step 4: operation_unit_id 有效性检查

**执行时间**: ____:____:____
**SQL**: 
```sql
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN her.operation_unit_id IS NULL THEN 1 END) AS null_op_units,
    COUNT(CASE WHEN her.operation_unit_id IS NOT NULL AND opu.id IS NOT NULL THEN 1 END) AS valid_op_units,
    COUNT(CASE WHEN her.operation_unit_id IS NOT NULL AND opu.id IS NULL THEN 1 END) AS invalid_op_units
FROM hse_employee_relation her
LEFT JOIN hse_operation_unit opu ON her.operation_unit_id = opu.id AND opu.is_deleted = false
WHERE her.is_deleted = false;
```

**执行结果**: 
```
total_records | null_op_units | valid_op_units | invalid_op_units
______________|_______________|________________|___________________
____          | ____          | ____           | ____
```

**影响行数**: 1 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

## 四、B-2 迁移 SQL 执行日志

### 4.1 Step 1: 迁移前备份 employee_assignment

**执行时间**: ____:____:____
**SQL**: 
```sql
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
```

**执行结果**: 
```
original_count | backup_count
_______________|_____________
____           | ____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 4.1.5 Step 1.5: B-2 脏数据检查（v2.1 新增）

**执行时间**: ____:____:____
**SQL**: 
```sql
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
```

**执行结果**: 
```
RAISE NOTICE: 发现重复当前关系记录数: ____
```

**影响行数**: ____ 行（目标：0 行）
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 4.1.6 Step 1.6: status 映射预检查（v2.1 新增）

**执行时间**: ____:____:____
**SQL**: 
```sql
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
```

**执行结果**: 
```
RAISE NOTICE: status 映射预检查通过
```

**影响行数**: 0 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 4.2 Step 2: 执行迁移 SQL

**执行时间**: ____:____:____
**SQL**: 
```sql
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
    ON CONFLICT ON CONSTRAINT uk_emp_assign_primary
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
            insert_count, FLOOR(baseline_count * 0.98), CEIL(baseline_count * 1.02);
    END IF;

    INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
    VALUES
    ('B2_20260728', 'actual_migrate_count', insert_count),
    ('B2_20260728', 'anomaly_count', anomaly_count)
    ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;
END $$;
```

**执行结果**: 
```
RAISE NOTICE: 迁移记录数: ____ (基线: ____), 异常记录数: ____
RAISE NOTICE: 基线不存在，跳过动态校验  -- 或校验通过
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

**错误信息**（如有）:
```
____
```

---

### 4.3 Step 3: 导出异常记录

**执行时间**: ____:____:____
**SQL**: 
```sql
SELECT * FROM b2_anomaly_log ORDER BY employee_id;
```

**执行结果**: 
```
____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

## 五、数据一致性验证 SQL 执行日志

### 5.1 数据完整性验证

**执行时间**: ____:____:____
**SQL**: 
```sql
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
        WHEN ABS(actual - expected) <= expected * 0.02 THEN 'PASS'
        ELSE 'FAIL'
    END AS status
FROM migration_baseline mb
WHERE mb.migration_id IN ('B0_20260728', 'B2_20260728')
ORDER BY mb.migration_id, mb.metric_name;
```

**执行结果**: 
```
metric_name | expected | actual | status
____________|__________|________|________
____        | ____     | ____   | ____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 5.2 关联完整性验证

**执行时间**: ____:____:____
**SQL**: 
```sql
-- 8.2 employee_assignment → employee 完整性
SELECT COUNT(*) AS missing_employee
FROM employee_assignment ea
LEFT JOIN employee e ON ea.employee_id = e.id AND e.is_deleted = false
WHERE ea.is_deleted = false AND e.id IS NULL;

-- 8.3 employee_assignment → position 完整性
SELECT COUNT(*) AS missing_position
FROM employee_assignment ea
LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
WHERE ea.is_deleted = false AND p.id IS NULL;

-- 8.4 employee_assignment → hse_org_unit 完整性
SELECT COUNT(*) AS missing_org
FROM employee_assignment ea
LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
WHERE ea.is_deleted = false AND ou.id IS NULL;
```

**执行结果**: 
```
missing_employee: ____
missing_position: ____
missing_org: ____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 5.3 数据差异验证

**执行时间**: ____:____:____
**SQL**: 
```sql
SELECT COUNT(*) AS overwritten_records
FROM employee_assignment ea
JOIN employee_assignment_b2_backup_20260728 bak ON ea.id = bak.id
WHERE ea.created_by = 'system_migration_b2'
  AND (ea.org_unit_id IS DISTINCT FROM bak.org_unit_id
    OR ea.operation_unit_id IS DISTINCT FROM bak.operation_unit_id
    OR ea.position_id IS DISTINCT FROM bak.position_id);
```

**执行结果**: 
```
overwritten_records
___________________
____
```

**影响行数**: 1 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

## 六、回滚演练 SQL 执行日志

### 6.1 B-2 回滚演练 - 策略 1

**执行时间**: ____:____:____
**SQL**: 
```sql
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM employee_assignment
    WHERE created_by = 'system_migration_b2';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RAISE NOTICE '删除迁移记录数: %', deleted_count;
END $$;
```

**执行结果**: 
```
RAISE NOTICE: 删除迁移记录数: ____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

### 6.2 B-0 回滚演练 - 策略 2

**执行时间**: ____:____:____
**SQL**: 
```sql
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

    RAISE NOTICE '从备份表回滚记录数: %', rollback_count;
END $$;
```

**执行结果**: 
```
RAISE NOTICE: 从备份表回滚记录数: ____
```

**影响行数**: ____ 行
**执行状态**: □ 成功 □ 失败
**执行耗时**: ____ 毫秒

---

## 七、SQL 执行统计汇总

### 7.1 按类型统计

| SQL 类型 | 执行次数 | 成功次数 | 失败次数 | 平均耗时 | 总耗时 |
|---------|---------|---------|---------|---------|--------|
| SELECT | ____ | ____ | ____ | ____ ms | ____ ms |
| INSERT | ____ | ____ | ____ | ____ ms | ____ ms |
| UPDATE | ____ | ____ | ____ | ____ ms | ____ ms |
| DELETE | ____ | ____ | ____ | ____ ms | ____ ms |
| CREATE | ____ | ____ | ____ | ____ ms | ____ ms |
| DO 块 | ____ | ____ | ____ | ____ ms | ____ ms |

### 7.2 按阶段统计

| 阶段 | SQL 数量 | 总耗时 | 备注 |
|------|----------|--------|------|
| Step 0 检查 | ____ | ____ ms | ____ |
| B-0 恢复 | ____ | ____ ms | ____ |
| B-1 验证 | ____ | ____ ms | ____ |
| B-2 迁移 | ____ | ____ ms | ____ |
| 数据验证 | ____ | ____ ms | ____ |
| 回滚演练 | ____ | ____ ms | ____ |

---

## 八、错误日志汇总

### 8.1 错误清单

| # | SQL 编号 | 错误时间 | 错误类型 | 错误信息 | 处理措施 | 处理结果 |
|---|---------|----------|----------|----------|----------|----------|
| 1 | ____ | ____:____ | ____ | ____ | ____ | ____ |
| 2 | ____ | ____:____ | ____ | ____ | ____ | ____ |
| 3 | ____ | ____:____ | ____ | ____ | ____ | ____ |

### 8.2 错误详细信息

#### 错误 1

**SQL 编号**: ____
**错误时间**: ____:____:____
**SQL 语句**: 
```sql
____
```

**错误信息**: 
```
____
```

**处理措施**: ____
**处理结果**: ____

---

## 九、执行日志归档

### 9.1 日志文件信息

| 项目 | 内容 |
|------|------|
| 日志文件名 | Sprint-B_SQL_Execution_Log_YYYYMMDD_HHMMSS.log |
| 日志文件路径 | F:\backup\logs\ |
| 日志文件大小 | ____ KB |
| 归档时间 | ____ 年 __ 月 __ 日 ____:____ |

### 9.2 日志确认

**日志记录人**: ______________
**日志审核人**: ______________
**审核日期**: ____ 年 __ 月 __ 日

---

> **文档结束**
>
> 本日志模板用于记录 Sprint-B v2.1 Dry Run 执行过程中所有 SQL 的详细执行信息，包括执行时间、执行结果、影响行数、执行状态和执行耗时等。所有日志必须在执行时实时填写，不得事后补录。