# Sprint-B Dry Run 验证报告 v1.0

> **版本**: v1.0
> **编制日期**: 2026-07-28
> **执行环境**: 测试环境
> **配套文档**: 《Sprint-B 数据迁移执行 Runbook v2.1》
> **验证目的**: 在测试环境模拟完整迁移流程，验证方案可行性、数据一致性及回滚能力

---

## 一、环境信息

### 1.1 测试环境配置

| 配置项 | 配置值 | 状态 |
|--------|--------|------|
| 数据库服务器 | ____ | □ 已确认 |
| 数据库版本 | PostgreSQL 14+ | □ 已确认 |
| 应用服务器 | ____ | □ 已确认 |
| Node.js 版本 | ____ | □ 已确认 |
| 数据库名称 | safety_dashboard_test | □ 已确认 |
| 数据库连接权限 | 读写 + DDL | □ 已确认 |
| 备份目录 | F:\backup\test\ | □ 已确认 |

### 1.2 参与人员

| 角色 | 姓名 | 职责 |
|------|------|------|
| 数据迁移负责人 | ____ | 全程协调、执行迁移、操作回滚 |
| DBA | ____ | 监控数据库性能、协助备份恢复 |
| 后端开发负责人 | ____ | 迁移后验证、代码切换 |
| 前端开发负责人 | ____ | 迁移后 UI 验证、组件测试 |
| QA 负责人 | ____ | 全流程回归测试 |

### 1.3 执行时间记录

| 阶段 | 开始时间 | 结束时间 | 耗时 | 备注 |
|------|----------|----------|------|------|
| 前置检查 + 数据库备份 | ____ | ____ | ____ 分钟 | |
| Step 0 迁移前强制检查 | ____ | ____ | ____ 分钟 | |
| B-0 Employee 恢复 | ____ | ____ | ____ 分钟 | |
| B-0 验证 | ____ | ____ | ____ 分钟 | |
| B-1 组织模型验证 | ____ | ____ | ____ 分钟 | |
| B-2 数据迁移 | ____ | ____ | ____ 分钟 | |
| B-2 验证 + 数据一致性验证 | ____ | ____ | ____ 分钟 | |
| 旧模型冻结 | ____ | ____ | ____ 分钟 | |
| 启动应用 + 冒烟测试 | ____ | ____ | ____ 分钟 | |
| 回滚演练 | ____ | ____ | ____ 分钟 | |
| **总计** | ____ | ____ | ____ 分钟 | |

---

## 二、数据库版本确认

### 2.1 PostgreSQL 版本检查

```sql
SELECT version();
```

**执行结果**:

```
PostgreSQL ____ on ____ (64-bit)
```

**版本要求**: PostgreSQL 14+
**实际版本**: ____
**确认**: □ 符合要求  □ 不符合要求

### 2.2 数据库扩展检查

```sql
SELECT extname, extversion FROM pg_extension ORDER BY extname;
```

**执行结果**:

| 扩展名 | 版本 | 状态 |
|--------|------|------|
| plpgsql | ____ | □ 已安装 |
| ____ | ____ | □ 已安装 |

### 2.3 数据库参数检查

```sql
SHOW max_connections;
SHOW shared_buffers;
SHOW work_mem;
```

**执行结果**:

| 参数 | 值 | 状态 |
|------|------|------|
| max_connections | ____ | □ 已确认 |
| shared_buffers | ____ | □ 已确认 |
| work_mem | ____ | □ 已确认 |

---

## 三、79 项检查结果汇总

> **检查来源**: 《Sprint-B 迁移前最终检查清单 v2.1》

### 3.1 检查项汇总表

| 章节 | 检查项数 | 通过数 | 失败数 | 通过率 |
|------|----------|--------|--------|--------|
| 一、环境与权限 | 10 | ____ | ____ | ____% |
| 二、数据库备份 | 5 | ____ | ____ | ____% |
| 三、Step 0 强制检查 | 12 | ____ | ____ | ____% |
| 四、B-0 恢复检查 | 15 | ____ | ____ | ____% |
| 五、B-1 组织模型验证 | 4 | ____ | ____ | ____% |
| 六、B-2 迁移检查 | 15 | ____ | ____ | ____% |
| 七、冻结与回滚就绪 | 6 | ____ | ____ | ____% |
| 八、代码切换就绪 | 12 | ____ | ____ | ____% |
| **总计** | **79** | **____** | **____** | **____%** |

### 3.2 关键检查项确认

#### 3.2.1 生产前补充检查（新增）

| # | 检查项 | 检查 SQL | 目标 | 实际 | 通过 |
|---|--------|---------|------|------|------|
| S13 | employee_assignment 唯一约束存在 | `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='employee_assignment' AND constraint_name='uk_emp_assign_primary' AND constraint_type='UNIQUE'` | 1 行 | ____ | □ |
| S14 | 唯一约束定义正确 | `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='uk_emp_assign_primary' AND conrelid='employee_assignment'::regclass` | 包含 is_primary=true AND is_current=true AND is_deleted=false | ____ | □ |

#### 3.2.2 前端迁移准备检查（新增）

| # | 检查项 | 检查方式 | 目标 | 实际 | 通过 |
|---|--------|---------|------|------|------|
| C13 | team_id → org_unit_id 已完成 | 代码审查 | OrgTransferModal.vue 已修改 | ____ | □ |
| C14 | employee.ts 旧字段已清理 | TypeScript 编译 | 无旧字段残留 | ____ | □ |
| C15 | npm run type-check 通过 | 命令执行 | 0 errors | ____ | □ |
| C16 | 前端代码已提交 | Git 状态 | 已提交但未发布 | ____ | □ |

### 3.3 失败检查项清单

| # | 检查项编号 | 检查项名称 | 失败原因 | 处理措施 | 处理结果 |
|---|-----------|-----------|----------|----------|----------|
| 1 | ____ | ____ | ____ | ____ | □ 已解决 |
| 2 | ____ | ____ | ____ | ____ | □ 已解决 |
| 3 | ____ | ____ | ____ | ____ | □ 已解决 |

**负责人签字**: ______________ 日期: __________

---

## 四、Step 0 执行记录

> **来源**: Runbook v2.1 第四章

### 4.1 Check 0.1: 数据库锁检查

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

**执行时间**: ____
**预期结果**: 返回 0 行
**实际结果**: ____ 行
**确认**: □ 通过  □ 不通过

**异常处理**（如不通过）:
- 处理措施: ____
- 处理结果: ____

### 4.2 Check 0.2: 活跃连接检查

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

**执行时间**: ____
**预期结果**: 返回 0 行
**实际结果**: ____ 行
**确认**: □ 通过  □ 不通过

**异常处理**（如不通过）:
- 处理措施: ____
- 处理结果: ____

### 4.3 Check 0.3: Schema 版本检查

```sql
-- 检查 employee 表字段
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'employee'
  AND column_name IN ('id', 'is_deleted', 'updated_at')
ORDER BY column_name;

-- 检查 employee_assignment 表字段
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'employee_assignment'
  AND column_name IN ('id', 'employee_id', 'org_unit_id', 'position_id', 'is_primary', 'is_current', 'status')
ORDER BY column_name;
```

**执行时间**: ____
**预期结果**: 返回预期字段列表
**实际结果**: ____
**确认**: □ 通过  □ 不通过

### 4.4 Check 0.4: employee 表无 updated_by 字段

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'employee' AND column_name = 'updated_by';
```

**执行时间**: ____
**预期结果**: 返回 0 行
**实际结果**: ____ 行
**确认**: □ 通过  □ 不通过

### 4.5 Check 0.5: employee_assignment 表存在性验证

```sql
SELECT COUNT(*) AS table_exists
FROM information_schema.tables
WHERE table_name = 'employee_assignment';
```

**执行时间**: ____
**预期结果**: table_exists = 1
**实际结果**: table_exists = ____
**确认**: □ 通过  □ 不通过

### 4.6 Check 0.6: employee_assignment 当前数据量

```sql
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_records,
    COUNT(CASE WHEN is_current = true AND is_deleted = false THEN 1 END) AS current_active,
    COUNT(CASE WHEN created_by = 'system_migration_b2' THEN 1 END) AS previous_migration_records
FROM employee_assignment;
```

**执行时间**: ____

**记录结果**:
- total_records: ____
- active_records: ____
- current_active: ____
- previous_migration_records: ____

**决策**:
- □ 可直接迁移（current_active = 0）
- □ 需人工审核（current_active > 0 且 previous_migration_records = 0）
- □ 需先回滚（previous_migration_records > 0）

**确认**: □ 通过  □ 不通过

### 4.7 Check 0.7: uk_emp_assign_primary 唯一索引验证

```sql
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'employee_assignment'
  AND indexname = 'uk_emp_assign_primary';
```

**执行时间**: ____
**预期结果**: 返回 1 行，且 indexdef 包含 `WHERE (is_primary = true AND is_current = true AND is_deleted = false)`
**实际结果**: ____
**确认**: □ 通过  □ 不通过

### 4.8 Check 0.8: hse_employee_org 与 employee_assignment 数据差异检查

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

**执行时间**: ____

**记录基线**（填入迁移基线表）:
- heo_current_employees: ____
- ea_current_employees: ____
- her_current_employees: ____
- ea_only_count: ____

**确认**: □ 通过  □ 不通过

### 4.9 Check 0.9: hse_employee_org status 枚举分布

```sql
SELECT status, COUNT(*) AS cnt
FROM hse_employee_org
WHERE is_current = true AND is_deleted = false
GROUP BY status
ORDER BY cnt DESC;
```

**执行时间**: ____

**记录分布**:

| status | 数量 |
|--------|------|
| ____ | ____ |
| ____ | ____ |
| ____ | ____ |

**确认**: □ 通过  □ 不通过

### 4.10 Check 0.10: hse_employee_relation status 枚举分布

```sql
SELECT status, COUNT(*) AS cnt
FROM hse_employee_relation
WHERE is_deleted = false
GROUP BY status
ORDER BY cnt DESC;
```

**执行时间**: ____

**记录分布**:

| status | 数量 |
|--------|------|
| ____ | ____ |
| ____ | ____ |
| ____ | ____ |

**确认**: □ 通过  □ 不通过

### 4.11 Check 0.11: 迁移基线表创建

```sql
-- 创建迁移基线表
CREATE TABLE IF NOT EXISTS migration_baseline (
    id SERIAL PRIMARY KEY,
    migration_id VARCHAR(64) NOT NULL,
    metric_name VARCHAR(128) NOT NULL,
    metric_value NUMERIC NOT NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    recorded_by VARCHAR(64) DEFAULT current_user,
    UNIQUE (migration_id, metric_name)
);

-- 记录当前基线
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
```

**执行时间**: ____
**预期结果**: 至少记录 4 条基线
**实际结果**: ____ 条
**确认**: □ 通过  □ 不通过

### 4.12 Check 0.12: 迁移备份注册表创建

```sql
-- 创建备份注册表
CREATE TABLE IF NOT EXISTS migration_backup_registry (
    backup_id VARCHAR(64) PRIMARY KEY,
    backup_table VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    remark TEXT
);

-- 创建备份记录
INSERT INTO migration_backup_registry (backup_id, backup_table, remark)
VALUES
('B0_RECOVER_IDS_20260728', 'temp_b0_recover_ids_backup_20260728', 'B-0 恢复范围备份'),
('B2_EA_20260728', 'employee_assignment_b2_backup_20260728', 'B-2 employee_assignment 备份')
ON CONFLICT (backup_id) DO UPDATE SET created_at = NOW();
```

**执行时间**: ____
**预期结果**: 表创建成功
**实际结果**: ____
**确认**: □ 通过  □ 不通过

### 4.13 Step 0 检查结论

| # | 检查项 | 通过 |
|---|--------|------|
| 0.1 | 数据库锁检查 | □ |
| 0.2 | 活跃连接检查 | □ |
| 0.3 | Schema 版本检查 | □ |
| 0.4 | employee 表无 updated_by | □ |
| 0.5 | employee_assignment 表存在 | □ |
| 0.6 | employee_assignment 数据量评估 | □ |
| 0.7 | uk_emp_assign_primary 索引存在 | □ |
| 0.8 | 数据差异基线已记录 | □ |
| 0.9 | hse_employee_org status 分布已记录 | □ |
| 0.10 | hse_employee_relation status 分布已记录 | □ |
| 0.11 | 迁移基线表已创建 | □ |
| 0.12 | 迁移备份注册表已创建 | □ |

**Step 0 负责人签字**: ______________ 日期: __________

**Step 0 最终结论**: □ 通过  □ 不通过

---

## 五、B-0 恢复执行记录

> **来源**: Runbook v2.1 第五章

### 5.1 Step B-0-1: 恢复前数据快照

```sql
-- 1.1 employee 表总体状态
SELECT
    COUNT(*) AS total_employees,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_employees,
    COUNT(CASE WHEN is_deleted = true THEN 1 END) AS deleted_employees
FROM employee;

-- 记录到基线表
INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
VALUES
('B0_20260728', 'employee_total_before', (SELECT COUNT(*) FROM employee)),
('B0_20260728', 'employee_active_before', (SELECT COUNT(*) FROM employee WHERE is_deleted=false)),
('B0_20260728', 'employee_deleted_before', (SELECT COUNT(*) FROM employee WHERE is_deleted=true))
ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;

-- 1.2 需要恢复的员工数量（并集去重）
SELECT COUNT(DISTINCT employee_id) AS recoverable_count
FROM (
    SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
    UNION
    SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
) AS source_union
WHERE employee_id IN (SELECT id FROM employee WHERE is_deleted = true);
```

**执行时间**: ____

**实际结果记录**:
- recoverable_count: ____（动态基线，填入 migration_baseline）

**确认**: □ 通过  □ 不通过

### 5.2 Step B-0-2: 创建恢复 ID 临时表 + 持久化备份

```sql
-- 2.1 创建临时表（会话级）
CREATE TEMP TABLE IF NOT EXISTS temp_b0_recover_ids (
    employee_id BIGINT PRIMARY KEY,
    recovered_at TIMESTAMP DEFAULT NOW()
);

TRUNCATE temp_b0_recover_ids;

-- 2.2 填充临时表
INSERT INTO temp_b0_recover_ids (employee_id)
SELECT DISTINCT employee_id
FROM (
    SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
    UNION
    SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
) AS source_union
WHERE employee_id IN (SELECT id FROM employee WHERE is_deleted = true);

-- 2.3 立即创建持久化备份表（v2.1 新增）
DROP TABLE IF EXISTS temp_b0_recover_ids_backup_20260728;
CREATE TABLE temp_b0_recover_ids_backup_20260728 AS
SELECT * FROM temp_b0_recover_ids;

-- 2.4 更新备份注册表
UPDATE migration_backup_registry
SET created_at = NOW()
WHERE backup_id = 'B0_RECOVER_IDS_20260728';

-- 2.5 记录基线
INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
VALUES ('B0_20260728', 'recover_id_count', (SELECT COUNT(*) FROM temp_b0_recover_ids))
ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;

-- 2.6 验证
SELECT
    (SELECT COUNT(*) FROM temp_b0_recover_ids) AS temp_count,
    (SELECT COUNT(*) FROM temp_b0_recover_ids_backup_20260728) AS backup_count;
```

**执行时间**: ____
**预期结果**: temp_count = backup_count
**实际结果**: temp_count: ____, backup_count: ____

**确认**: □ 通过  □ 不通过

### 5.3 Step B-0-3: 执行恢复 SQL

```sql
-- ================================================================
-- B-0 Step 3: 恢复 employee 表中的软删员工（v2.1 使用 DO 块）
-- ================================================================

DO $$
DECLARE
    rec_count INTEGER;
    baseline_count NUMERIC;
BEGIN
    -- 从基线表读取预期数量
    SELECT metric_value INTO baseline_count
    FROM migration_baseline
    WHERE migration_id = 'B0_20260728' AND metric_name = 'recover_id_count';

    -- 执行恢复
    UPDATE employee
    SET is_deleted = false,
        updated_at = NOW()
    WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids)
      AND is_deleted = true;

    GET DIAGNOSTICS rec_count = ROW_COUNT;

    RAISE NOTICE '恢复记录数: % (基线: %)', rec_count, baseline_count;

    -- 动态校验（允许 2% 误差）
    IF rec_count < baseline_count * 0.98 OR rec_count > baseline_count * 1.02 THEN
        RAISE EXCEPTION '恢复行数异常: %, 预期范围 [%, %]',
            rec_count,
            FLOOR(baseline_count * 0.98),
            CEIL(baseline_count * 1.02);
    END IF;

    -- 记录结果
    INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
    VALUES ('B0_20260728', 'actual_recover_count', rec_count)
    ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;
END $$;
```

**执行时间**: ____
**影响行数**: rec_count = ____（自动记录到基线表）
**RAISE NOTICE 输出**: ____

**确认**: □ 通过  □ 不通过

**异常处理**（如失败）:
- 错误信息: ____
- 处理措施: ____
- 处理结果: ____

### 5.4 Step B-0-4: 恢复后验证 SQL

```sql
-- 4.1 临时表中的员工全部已恢复为活跃
SELECT
    COUNT(*) AS total_in_temp,
    COUNT(CASE WHEN e.is_deleted = false THEN 1 END) AS recovered_active,
    COUNT(CASE WHEN e.is_deleted = true THEN 1 END) AS still_deleted
FROM temp_b0_recover_ids t
JOIN employee e ON e.id = t.employee_id;

-- □ 验证通过: still_deleted = 0

-- 4.2 动态基线校验（v2.1 修正）
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

-- □ 验证通过: status = 'PASS'

-- 4.3 关联完整性验证（同 v2）
SELECT COUNT(*) AS missing_employee_refs
FROM hse_employee_relation her
LEFT JOIN employee e ON her.employee_id = e.id AND e.is_deleted = false
WHERE her.is_deleted = false AND e.id IS NULL;
-- □ 验证通过: missing_employee_refs = 0
```

**执行时间**: ____

**验证结果**:
- still_deleted: ____
- status: ____
- missing_employee_refs: ____

**确认**: □ 通过  □ 不通过

### 5.5 B-0 恢复结论

| 检查项 | 结果 |
|--------|------|
| 恢复前数据快照 | □ 通过 |
| 恢复 ID 临时表创建 | □ 通过 |
| 恢复 SQL 执行 | □ 通过 |
| 恢复后验证 | □ 通过 |

**B-0 负责人签字**: ______________ 日期: __________

**B-0 最终结论**: □ 通过  □ 不通过

---

## 六、B-1 验证记录

> **来源**: Runbook v2.1 第六章

### 6.1 Step 1: employee_relation → employee 关联检查

```sql
SELECT COUNT(*) AS missing_refs
FROM hse_employee_relation her
LEFT JOIN employee e ON her.employee_id = e.id AND e.is_deleted = false
WHERE her.is_deleted = false;
```

**执行时间**: ____
**目标**: `missing_refs = 0`
**实际**: ____  **通过**: □

### 6.2 Step 2: position_id 有效性检查

```sql
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN p.id IS NOT NULL THEN 1 END) AS valid_positions,
    COUNT(CASE WHEN p.id IS NULL THEN 1 END) AS invalid_positions
FROM hse_employee_relation her
LEFT JOIN position p ON her.position_id = p.id AND p.is_deleted = false
WHERE her.is_deleted = false;
```

**执行时间**: ____
**目标**: `invalid_positions = 0`
**实际**: ____ / ____  **通过**: □

### 6.3 Step 3: org_unit_id 有效性检查

```sql
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN ou.id IS NOT NULL THEN 1 END) AS valid_org_units,
    COUNT(CASE WHEN ou.id IS NULL THEN 1 END) AS invalid_org_units
FROM hse_employee_relation her
LEFT JOIN hse_org_unit ou ON her.org_unit_id = ou.id AND ou.is_deleted = false
WHERE her.is_deleted = false;
```

**执行时间**: ____
**目标**: `invalid_org_units = 0`
**实际**: ____ / ____  **通过**: □

### 6.4 Step 4: operation_unit_id 有效性检查

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

**执行时间**: ____
**目标**: `invalid_op_units = 0`（允许 NULL）
**实际**: ____ / ____ / ____  **通过**: □

### 6.5 B-1 验证结论

| 检查项 | 结果 |
|--------|------|
| employee_relation → employee 关联 | □ 通过 |
| position_id 有效性 | □ 通过 |
| org_unit_id 有效性 | □ 通过 |
| operation_unit_id 有效性 | □ 通过 |

**B-1 负责人签字**: ______________ 日期: __________

**B-1 最终结论**: □ 通过  □ 不通过

---

## 七、B-2 迁移执行记录

> **来源**: Runbook v2.1 第七章

### 7.1 Step 1: 迁移前备份 employee_assignment

```sql
-- 创建带时间戳的备份表
DROP TABLE IF EXISTS employee_assignment_b2_backup_20260728;
CREATE TABLE employee_assignment_b2_backup_20260728 AS
SELECT * FROM employee_assignment;

-- 更新备份注册表
UPDATE migration_backup_registry
SET created_at = NOW()
WHERE backup_id = 'B2_EA_20260728';

-- 记录备份前数据量
INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
VALUES
('B2_20260728', 'ea_backup_count', (SELECT COUNT(*) FROM employee_assignment_b2_backup_20260728)),
('B2_20260728', 'ea_backup_active', (SELECT COUNT(*) FROM employee_assignment_b2_backup_20260728 WHERE is_deleted=false))
ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;

-- 验证备份
SELECT
    (SELECT COUNT(*) FROM employee_assignment) AS original_count,
    (SELECT COUNT(*) FROM employee_assignment_b2_backup_20260728) AS backup_count;
```

**执行时间**: ____
**备份记录数**: ____

**确认**: □ 通过  □ 不通过

### 7.2 Step 2: 执行迁移 SQL

```sql
-- ================================================================
-- B-2 Step 2: 从 hse_employee_relation 迁移至 employee_assignment
-- v2.1 修正: ON CONFLICT ON CONSTRAINT + DO 块封装
-- ================================================================

DO $$
DECLARE
    insert_count INTEGER;
    anomaly_count INTEGER;
    baseline_count NUMERIC;
BEGIN
    -- 从基线表读取预期数量
    SELECT metric_value INTO baseline_count
    FROM migration_baseline
    WHERE migration_id = 'B2_20260728' AND metric_name = 'her_current_count';

    -- 7.5.1 主迁移: INSERT ... ON CONFLICT ON CONSTRAINT（v2.1 修正）
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
            WHEN her.status = 'active' THEN 'active'
            WHEN her.status = 'pending' THEN 'pending'
            WHEN her.status = 'inactive' THEN 'inactive'
            ELSE 'active'
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
    ON CONFLICT ON CONSTRAINT uk_emp_assign_primary  -- v2.1 修正
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

    -- 7.5.2 异常记录
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
      AND status NOT IN ('active', 'pending', 'inactive');

    GET DIAGNOSTICS anomaly_count = ROW_COUNT;

    RAISE NOTICE '迁移记录数: % (基线: %), 异常记录数: %',
        insert_count, baseline_count, anomaly_count;

    -- 动态校验（允许 2% 误差）
    IF insert_count < baseline_count * 0.98 OR insert_count > baseline_count * 1.02 THEN
        RAISE EXCEPTION '迁移行数异常: %, 预期范围 [%, %]',
            insert_count,
            FLOOR(baseline_count * 0.98),
            CEIL(baseline_count * 1.02);
    END IF;

    -- 记录结果
    INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
    VALUES
    ('B2_20260728', 'actual_migrate_count', insert_count),
    ('B2_20260728', 'anomaly_count', anomaly_count)
    ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;
END $$;
```

**执行时间**: ____
**实际迁移行数**: insert_count = ____（自动记录）
**异常记录数**: ____
**RAISE NOTICE 输出**: ____

**确认**: □ 通过  □ 不通过

**异常处理**（如失败）:
- 错误信息: ____
- 处理措施: ____
- 处理结果: ____

### 7.3 Step 3: 导出异常记录

```sql
SELECT * FROM b2_anomaly_log ORDER BY employee_id;
```

**执行时间**: ____
**异常记录数**: ____

**异常处理**: 导出为 CSV: `F:\backup\test\20260728_0300_b2_anomaly.csv`

**确认**: □ 已导出  □ 无异常

### 7.4 B-2 迁移结论

| 检查项 | 结果 |
|--------|------|
| employee_assignment 备份已创建 | □ 通过 |
| 迁移 SQL 执行 | □ 通过 |
| 异常记录已导出 | □ 通过 |

**B-2 负责人签字**: ______________ 日期: __________

**B-2 最终结论**: □ 通过  □ 不通过

---

## 八、数据一致性验证

> **来源**: Runbook v2.1 第八章

### 8.1 数据完整性验证

```sql
-- 8.1 动态基线验证
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

**执行时间**: ____

**验证结果**:

| metric_name | expected | actual | status |
|-------------|----------|--------|--------|
| ____ | ____ | ____ | ____ |

**确认**: □ 通过  □ 不通过

### 8.2 关联完整性验证

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

**执行时间**: ____

**验证结果**:
- missing_employee: ____
- missing_position: ____
- missing_org: ____

**确认**: □ 通过  □ 不通过

### 8.3 数据差异验证

```sql
-- 8.5 UPSERT 覆盖范围检查（v2.1 新增）
SELECT COUNT(*) AS overwritten_records
FROM employee_assignment ea
JOIN employee_assignment_b2_backup_20260728 bak ON ea.id = bak.id
WHERE ea.created_by = 'system_migration_b2'
  AND (ea.org_unit_id IS DISTINCT FROM bak.org_unit_id
    OR ea.operation_unit_id IS DISTINCT FROM bak.operation_unit_id
    OR ea.position_id IS DISTINCT FROM bak.position_id);
```

**执行时间**: ____
**overwritten_records**: ____

**确认**: □ 通过  □ 不通过

### 8.4 数据一致性验证结论

| 检查项 | 结果 |
|--------|------|
| 动态基线验证 | □ 通过 |
| 关联完整性验证 | □ 通过 |
| 数据差异验证 | □ 通过 |

**负责人签字**: ______________ 日期: __________

**数据一致性验证最终结论**: □ 通过  □ 不通过

---

## 九、前端切换验证

> **来源**: Runbook v2.1 第十章 + 前端迁移风险确认报告 v2.1

### 9.1 前端代码修改确认

| # | 文件 | 修改内容 | 状态 |
|---|------|---------|------|
| 1 | OrgTransferModal.vue | team_id → org_unit_id (6处) | □ 已完成 |
| 2 | employee.ts | 清理旧字段 (group_id 等 5 字段) | □ 已完成 |
| 3 | EmployeeSelector.vue | 已使用 org_unit_id（无需修改） | □ 已确认 |

### 9.2 前端编译验证

```bash
npm run type-check
```

**执行时间**: ____
**预期结果**: 0 errors
**实际结果**: ____ errors

**确认**: □ 通过  □ 不通过

**错误信息**（如有）:
```
____
```

**处理措施**（如有）:
- ____

### 9.3 前端功能验证

#### 9.3.1 员工列表查询

**测试步骤**:
1. 登录系统
2. 进入"人员管理" → "员工列表"
3. 查看员工数据是否正常显示

**执行时间**: ____
**预期结果**: 员工数据正常显示
**实际结果**: ____

**确认**: □ 通过  □ 不通过

#### 9.3.2 员工选择组件

**测试步骤**:
1. 进入调岗功能页面
2. 点击员工选择器
3. 选择员工并确认

**执行时间**: ____
**预期结果**: 员工选择器正常工作
**实际结果**: ____

**确认**: □ 通过  □ 不通过

#### 9.3.3 调岗功能

**测试步骤**:
1. 选择一个员工
2. 修改组织单元
3. 点击保存
4. 查看是否保存成功

**执行时间**: ____
**预期结果**: 调岗成功
**实际结果**: ____

**确认**: □ 通过  □ 不通过

#### 9.3.4 员工导入

**测试步骤**:
1. 下载员工导入模板
2. 填写员工数据
3. 上传文件
4. 查看导入结果

**执行时间**: ____
**预期结果**: 导入成功
**实际结果**: ____

**确认**: □ 通过  □ 不通过

### 9.4 前端控制台错误检查

**检查步骤**:
1. 打开浏览器开发者工具
2. 切换到 Console 标签
3. 遍历所有相关页面
4. 查看是否有红色错误

**执行时间**: ____
**预期结果**: 无红色错误
**实际结果**: ____ 个错误

**确认**: □ 通过  □ 不通过

**错误信息**（如有）:
```
____
```

### 9.5 前端切换验证结论

| 检查项 | 结果 |
|--------|------|
| 前端代码修改确认 | □ 通过 |
| 前端编译验证 | □ 通过 |
| 员工列表查询 | □ 通过 |
| 员工选择组件 | □ 通过 |
| 调岗功能 | □ 通过 |
| 员工导入 | □ 通过 |
| 前端控制台错误检查 | □ 通过 |

**前端负责人签字**: ______________ 日期: __________

**前端切换验证最终结论**: □ 通过  □ 不通过

---

## 十、回滚演练结果

> **目的**: 验证回滚方案的有效性

### 10.1 B-2 回滚演练

#### 10.1.1 策略 1: 仅回滚新增记录

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

**执行时间**: ____
**删除记录数**: ____
**执行结果**: □ 成功  □ 失败

#### 10.1.2 策略 2: 恢复 UPSERT 覆盖记录

```sql
DO $$
DECLARE
    deleted_count INTEGER;
    recovered_count INTEGER;
BEGIN
    -- 2.1 删除本次迁移新增记录
    DELETE FROM employee_assignment
    WHERE created_by = 'system_migration_b2';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- 2.2 恢复被覆盖的记录（从备份表）
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
        status = EXCLUDED.status,
        updated_at = NOW();

    GET DIAGNOSTICS recovered_count = ROW_COUNT;

    RAISE NOTICE '删除: %, 恢复: %', deleted_count, recovered_count;
END $$;
```

**执行时间**: ____
**删除记录数**: ____
**恢复记录数**: ____
**执行结果**: □ 成功  □ 失败

#### 10.1.3 策略 3: 全量恢复

```sql
DO $$
DECLARE
    restored_count INTEGER;
BEGIN
    TRUNCATE employee_assignment;

    INSERT INTO employee_assignment
    SELECT * FROM employee_assignment_b2_backup_20260728;

    GET DIAGNOSTICS restored_count = ROW_COUNT;

    RAISE NOTICE '全量恢复记录数: %', restored_count;
END $$;
```

**执行时间**: ____
**恢复记录数**: ____
**执行结果**: □ 成功  □ 失败

### 10.2 B-0 回滚演练

#### 10.2.1 策略 1: 从临时表精准回滚（会话未断开）

```sql
DO $$
DECLARE
    rollback_count INTEGER;
BEGIN
    UPDATE employee
    SET is_deleted = true,
        updated_at = NOW()
    WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids)
      AND is_deleted = false;

    GET DIAGNOSTICS rollback_count = ROW_COUNT;

    RAISE NOTICE '回滚记录数: %', rollback_count;
END $$;
```

**执行时间**: ____
**回滚记录数**: ____
**执行结果**: □ 成功  □ 失败

#### 10.2.2 策略 2: 从持久化备份表回滚（会话已断开）

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

**执行时间**: ____
**回滚记录数**: ____
**执行结果**: □ 成功  □ 失败

### 10.3 回滚演练结论

| 策略 | 场景 | 执行结果 |
|------|------|----------|
| B-2 策略 1 | 仅回滚新增记录 | □ 成功 |
| B-2 策略 2 | 恢复 UPSERT 覆盖记录 | □ 成功 |
| B-2 策略 3 | 全量恢复 | □ 成功 |
| B-0 策略 1 | 临时表精准回滚 | □ 成功 |
| B-0 策略 2 | 备份表回滚 | □ 成功 |

**回滚演练负责人签字**: ______________ 日期: __________

**回滚演练最终结论**: □ 通过  □ 不通过

---

## 十一、性能指标记录

### 11.1 SQL 执行性能

| SQL 类型 | 执行时间 | 影响行数 | 性能评估 |
|---------|----------|----------|----------|
| Step 0 检查 SQL | ____ 秒 | - | □ 良好 |
| B-0 恢复 SQL | ____ 秒 | ____ 行 | □ 良好 |
| B-2 迁移 SQL | ____ 秒 | ____ 行 | □ 良好 |
| 数据验证 SQL | ____ 秒 | - | □ 良好 |

### 11.2 数据库性能监控

```sql
-- 检查数据库性能指标
SELECT
    datname,
    numbackends,
    xact_commit,
    xact_rollback,
    blks_read,
    blks_hit,
    tup_returned,
    tup_fetched,
    tup_inserted,
    tup_updated,
    tup_deleted
FROM pg_stat_database
WHERE datname = 'safety_dashboard';
```

**执行时间**: ____

**监控数据**:

| 指标 | 迁移前 | 迁移后 | 变化 |
|------|--------|--------|------|
| numbackends | ____ | ____ | ____ |
| xact_commit | ____ | ____ | ____ |
| xact_rollback | ____ | ____ | ____ |
| tup_inserted | ____ | ____ | ____ |
| tup_updated | ____ | ____ | ____ |

### 11.3 应用启动性能

| 应用 | 启动时间 | 内存占用 | 状态 |
|------|----------|----------|------|
| 后端服务 | ____ 秒 | ____ MB | □ 正常 |
| 前端服务 | ____ 秒 | ____ MB | □ 正常 |

### 11.4 性能指标结论

| 检查项 | 结果 |
|--------|------|
| SQL 执行性能 | □ 良好 |
| 数据库性能监控 | □ 良好 |
| 应用启动性能 | □ 良好 |

**负责人签字**: ______________ 日期: __________

**性能指标最终结论**: □ 良好  □ 需优化

---

## 十二、72 小时观察指标

> **目的**: 迁移后持续观察系统稳定性

### 12.1 观察时间安排

- **观察期**: 迁移完成后 **72 小时**
- **观察时段**: 每 2 小时检查一次
- **开始时间**: ____ 年 __ 月 __ 日 __:__
- **结束时间**: ____ 年 __ 月 __ 日 __:__

### 12.2 核心观察指标

| # | 指标 | 目标 | 检查方式 | 告警阈值 | 实际 | 状态 |
|---|------|------|---------|---------|------|------|
| O1 | employee 查询成功率 | ≥ 99% | 后端日志分析 | < 99% | ____% | □ 正常 |
| O2 | employee_assignment 查询成功率 | ≥ 99% | 后端日志分析 | < 99% | ____% | □ 正常 |
| O3 | 调岗接口成功率 | ≥ 99% | API 监控 | < 99% | ____% | □ 正常 |
| O4 | 导入接口成功率 | ≥ 95% | API 监控 | < 95% | ____% | □ 正常 |
| O5 | 数据一致性检查 | 0 冲突 | 定时 SQL 检查 | > 0 | ____ | □ 正常 |
| O6 | 前端控制台错误 | 0 严重错误 | 浏览器 Console | > 0 | ____ | □ 正常 |
| O7 | 后端 API 错误率 | < 1% | 后端日志分析 | > 1% | ____% | □ 正常 |
| O8 | 响应时间 | < 3s | API 监控 | > 3s | ____s | □ 正常 |

### 12.3 观察记录表

| 时间 | O1 | O2 | O3 | O4 | O5 | O6 | O7 | O8 | 异常记录 | 处理结果 |
|------|----|----|----|----|----|----|----|----|---------|---------|
| T+2h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+4h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+6h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+8h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+10h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+12h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+14h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+16h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+18h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+20h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+22h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+24h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+26h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+28h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+30h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+32h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+34h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+36h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+38h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+40h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+42h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+44h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+46h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+48h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+50h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+52h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+54h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+56h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+58h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+60h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+62h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+64h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+66h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+68h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+70h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |
| T+72h | □ | □ | □ | □ | □ | □ | □ | □ | ____ | ____ |

### 12.4 观察期异常事件记录

| 时间 | 异常类型 | 影响范围 | 处理措施 | 处理结果 |
|------|---------|---------|---------|---------|
| ____ | ____ | ____ | ____ | ____ |
| ____ | ____ | ____ | ____ | ____ |

### 12.5 72 小时观察结论

| 检查项 | 结果 |
|--------|------|
| employee 查询成功率 | □ 达标 |
| employee_assignment 查询成功率 | □ 达标 |
| 调岗接口成功率 | □ 达标 |
| 导入接口成功率 | □ 达标 |
| 数据一致性检查 | □ 达标 |
| 前端控制台错误 | □ 达标 |
| 后端 API 错误率 | □ 达标 |
| 响应时间 | □ 达标 |

**观察负责人签字**: ______________ 日期: __________

**72 小时观察最终结论**: □ 通过  □ 不通过

---

## 十三、最终是否允许生产迁移结论

### 13.1 验证结果汇总

| # | 验证阶段 | 通过状态 | 负责人签字 |
|---|---------|---------|-----------|
| 1 | 环境信息确认 | □ 通过 □ 不通过 | ______________ |
| 2 | 数据库版本确认 | □ 通过 □ 不通过 | ______________ |
| 3 | 79 项检查结果 | ____/79 通过 | ______________ |
| 4 | Step 0 执行 | □ 通过 □ 不通过 | ______________ |
| 5 | B-0 恢复执行 | □ 通过 □ 不通过 | ______________ |
| 6 | B-1 验证 | □ 通过 □ 不通过 | ______________ |
| 7 | B-2 迁移执行 | □ 通过 □ 不通过 | ______________ |
| 8 | 数据一致性验证 | □ 通过 □ 不通过 | ______________ |
| 9 | 前端切换验证 | □ 通过 □ 不通过 | ______________ |
| 10 | 回滚演练结果 | □ 通过 □ 不通过 | ______________ |
| 11 | 性能指标记录 | □ 良好 □ 需优化 | ______________ |
| 12 | 72 小时观察 | □ 通过 □ 不通过 | ______________ |

### 13.2 生产前补充检查确认

| # | 检查项 | 状态 |
|---|--------|------|
| 1 | employee_assignment 唯一约束存在 | □ 已确认 |
| 2 | 唯一约束定义正确 | □ 已确认 |
| 3 | 前端 team_id → org_unit_id 已完成 | □ 已确认 |
| 4 | employee.ts 旧字段已清理 | □ 已确认 |
| 5 | npm run type-check 通过 | □ 已确认 |
| 6 | 前端代码已提交（未发布） | □ 已确认 |

### 13.3 生产迁移风险评估

| 风险项 | 风险等级 | 缓解措施 | 状态 |
|--------|---------|---------|------|
| 前端字段未同步修改 | 🟡 中 | 在迁移后立即发布前端代码 | □ 已缓解 |
| 数据库性能影响 | 🟢 低 | 迁移前已停止应用服务 | □ 已缓解 |
| 回滚时间窗口不足 | 🟡 中 | 已演练回滚流程 | □ 已缓解 |
| 数据不一致 | 🟢 低 | 已完成数据一致性验证 | □ 已缓解 |

### 13.4 最终决策

#### 13.4.1 决策依据

```
□ 全部验证阶段通过（允许生产迁移）
□ 存在非关键问题但已解决（允许生产迁移）
□ 存在关键问题未解决（不允许生产迁移）
```

#### 13.4.2 最终结论

```
============================================================
□ 允许生产迁移
□ 修改后允许生产迁移
□ 不允许生产迁移（需重新 Dry Run）
============================================================

理由：______
```

#### 13.4.3 生产迁移建议执行时间

- **建议执行窗口**: ____ 年 __ 月 __ 日 __:__ - __:__
- **预估执行时间**: ____ 小时
- **前端发布时间**: 数据库迁移完成后立即发布

### 13.5 签字确认

| 角色 | 姓名 | 签字 | 日期 |
|------|------|------|------|
| 数据迁移负责人 | | | |
| DBA | | | |
| 后端负责人 | | | |
| 前端负责人 | | | |
| QA 负责人 | | | |
| 项目负责人 | | | |

---

## 附录 A: Dry Run 执行问题记录

| # | 问题发生阶段 | 问题描述 | 影响范围 | 处理措施 | 处理结果 |
|---|-------------|---------|---------|---------|---------|
| 1 | ____ | ____ | ____ | ____ | ____ |
| 2 | ____ | ____ | ____ | ____ | ____ |
| 3 | ____ | ____ | ____ | ____ | ____ |

---

## 附录 B: 关键 SQL 执行日志

### B.1 B-0 恢复 SQL 执行日志

```
执行时间: ____
SQL: UPDATE employee SET is_deleted = false WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids)
影响行数: ____
执行状态: □ 成功 □ 失败
错误信息（如有）: ____
```

### B.2 B-2 迁移 SQL 执行日志

```
执行时间: ____
SQL: INSERT INTO employee_assignment (...) SELECT ... FROM hse_employee_relation WHERE is_deleted=false AND is_current=true ON CONFLICT ON CONSTRAINT uk_emp_assign_primary DO UPDATE SET ...
影响行数: ____
执行状态: □ 成功 □ 失败
错误信息（如有）: ____
```

---

## 附录 C: 回滚演练详细记录

### C.1 B-2 回滚演练记录

**演练时间**: ____
**演练策略**: □ 策略 1 □ 策略 2 □ 策略 3
**演练结果**: □ 成功 □ 失败
**演练备注**: ____

### C.2 B-0 回滚演练记录

**演练时间**: ____
**演练策略**: □ 策略 1 □ 策略 2
**演练结果**: □ 成功 □ 失败
**演练备注**: ____

---

> **文档结束**
>
> 本报告记录了 Sprint-B v2.1 在测试环境的 Dry Run 验证过程，为生产迁移提供决策依据。所有签字确认必须在相应阶段完成后进行。
>
> **最终建议**: □ 建议生产迁移  □ 需修改后迁移  □ 建议推迟迁移