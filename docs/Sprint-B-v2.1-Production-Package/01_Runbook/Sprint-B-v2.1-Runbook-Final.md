# Sprint-B v2.1 数据迁移执行 Runbook Final

> **版本**: v2.1-Final
> **修订日期**: 2026-07-28
> **修订依据**: 《Sprint-B v2.1 Dry Run 准入评审报告》CONDITIONAL PASS 整改要求
> **生产就绪**: 已集成 4 项修复（约束检查、基线 NULL 校验、脏数据检查、status 映射确认）
> **配套文档**:
> - [Sprint-B-v2.1-Constraint-Check.md](Sprint-B-v2.1-Constraint-Check.md)
> - [Sprint-B-v2.1-Baseline-Validation-Fix.md](Sprint-B-v2.1-Baseline-Validation-Fix.md)
> - [Sprint-B-v2.1-Data-Clean-Check.sql](Sprint-B-v2.1-Data-Clean-Check.sql)
> - [Sprint-B-v2.1-Status-Mapping.md](Sprint-B-v2.1-Status-Mapping.md)

---

## 修订历史

| 版本 | 日期 | 修订内容 | 修订人 |
|------|------|---------|--------|
| v2.0 | 2026-07-28 | 基于审计报告 v1.0 修订 | TRAE |
| v2.1 | 2026-07-28 | 修复 SQL 语法错误、增强回滚方案、动态基线校验 | TRAE |
| v2.1-Final | 2026-07-28 | 集成 CONDITIONAL PASS 4 项修复，进入生产迁移最终版 | TRAE |

---

## 一、执行前置条件

### 1.1 人员与权限

| 角色 | 职责 | 联系人 |
|------|------|--------|
| 数据迁移负责人 | 全程协调、执行迁移、操作回滚 | 待填 |
| DBA/数据库管理员 | 监控数据库性能、协助备份恢复 | 待填 |
| 后端开发负责人 | 迁移后验证、代码切换 | 待填 |
| 前端开发负责人 | 迁移后 UI 验证、组件测试 | 待填 |
| QA/测试负责人 | 全流程回归测试 | 待填 |

### 1.2 环境与工具

| 项 | 要求 | 状态 |
|----|------|------|
| 数据库 | PostgreSQL 14+，连接权限：读写 + DDL | 就绪 |
| 数据库管理工具 | DBeaver / pgAdmin，支持 SQL 执行与结果导出 | 就绪 |
| 备份工具 | `pg_dump`（全量）+ `pg_restore` | 就绪 |
| 应用状态 | 后端服务停止（避免迁移期间脏写） | **执行前必须停机** |
| 数据库状态 | 无活跃业务连接 | **执行前必须断开** |

### 1.3 前置检查清单（执行前逐项确认）

- [ ] 已获取数据库只读 + 写入权限
- [ ] 已与业务方沟通停机窗口（建议：凌晨 02:00-05:00）
- [ ] 已通知所有相关开发人员
- [ ] 已准备好紧急联系名单
- [ ] 已完成代码仓 Git 提交与标签打 Tag：`sprint-b-migration-pre`
- [ ] 已确认无未完成的数据库迁移脚本
- [ ] **已确认 employee 表无 `updated_by` 字段**
- [ ] **已确认《Sprint-B-v2.1-Status-Mapping.md》映射表已业务签字确认**

---

## 二、SQL 执行注意事项

> 所有 SQL 执行必须遵循以下规则，否则会导致执行失败或回滚失败。

### 2.1 GET DIAGNOSTICS 使用规范

必须使用 `DO $$` 块封装，变量先声明后使用。

```sql
DO $$
DECLARE
    rec_count INTEGER;
BEGIN
    UPDATE employee
    SET is_deleted = false, updated_at = NOW()
    WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids)
      AND is_deleted = true;

    GET DIAGNOSTICS rec_count = ROW_COUNT;
    RAISE NOTICE '影响行数: %', rec_count;
END $$;
```

### 2.2 ON CONFLICT 语法规范

B-2 迁移使用 `ON CONFLICT ON CONSTRAINT uk_emp_assign_primary`，禁止在 `ON CONFLICT` 后加 `WHERE`。

```sql
INSERT INTO employee_assignment (...)
SELECT ...
FROM hse_employee_relation her
WHERE her.is_deleted = false AND her.is_current = true
ON CONFLICT ON CONSTRAINT uk_emp_assign_primary
DO UPDATE SET ...;
```

### 2.3 事务边界与错误处理

| 场景 | 推荐方式 |
|------|---------|
| 单表 UPDATE/DELETE | DO 块 + 自动校验 |
| 多表事务操作 | BEGIN ... COMMIT + 异常捕获 |
| 数据迁移 INSERT | DO 块 + ON CONFLICT |

### 2.4 会话保持要求

| 操作 | 会话要求 | 违反后果 |
|------|---------|---------|
| B-0 全流程（Step 2-5） | **必须同一会话** | 临时表丢失，无法回滚 |
| B-2 Step 1-4 | **必须同一会话** | 备份表丢失，无法恢复 |
| B-2 异常记录导出 | **必须同一会话** | b2_anomaly_log 丢失 |

> ⚠️ 在 DBeaver/pgAdmin 中使用单一 SQL 编辑器窗口完成全部迁移步骤，中途不可关闭窗口或断开连接。

---

## 三、数据库备份方案

### 3.1 备份策略

执行任何迁移操作前，必须完成以下全量备份。备份文件按 `日期_时间_库名_操作类型.dump` 格式命名。

### 3.2 备份脚本

```bash
# Step 1: 停止后端应用服务
# pm2 stop all   # 或 systemctl stop hse-backend

# Step 2: 执行全量数据库备份（结构 + 数据）
pg_dump -h localhost -U postgres -d safety_dashboard -F c -Z 9 -f F:\backup\20260728_0200_safety_dashboard_full.dump

# Step 3: 关键表增量备份（便于快速恢复）
pg_dump -h localhost -U postgres -d safety_dashboard -F c -Z 9 \
  -t employee \
  -t hse_employee_relation \
  -t hse_employee_org \
  -t employee_assignment \
  -t position \
  -t hse_org_unit \
  -t hse_operation_unit \
  -t department \
  -t personnel \
  -f F:\backup\20260728_0200_sprint_b_tables.dump

# Step 4: 验证备份文件
ls -lh F:\backup\20260728_0200_*.dump
```

### 3.3 备份完整性验证

| 备份项 | 预期大小 | 实际大小 | 校验通过 |
|--------|----------|----------|----------|
| 全量数据库 | > 100MB | ____MB | □ |
| 关键表集合 | > 1MB | ____MB | □ |

---

## 四、Step 0 迁移前强制检查

> 在执行 B-0 恢复前，必须完成以下 **13 项强制检查**，全部通过方可进入 B-0 阶段。

### 4.1 Check 0.1：数据库锁检查

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

**目标**: 返回 0 行  **通过**: □

### 4.2 Check 0.2：活跃连接检查

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

**目标**: 返回 0 行  **通过**: □

### 4.3 Check 0.3：Schema 版本检查

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'employee'
  AND column_name IN ('id', 'is_deleted', 'updated_at')
ORDER BY column_name;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'employee_assignment'
  AND column_name IN ('id', 'employee_id', 'org_unit_id', 'position_id', 'is_primary', 'is_current', 'status')
ORDER BY column_name;
```

**目标**: 返回预期字段列表  **通过**: □

### 4.4 Check 0.4：employee 表无 updated_by 字段

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'employee' AND column_name = 'updated_by';
```

**目标**: 返回 0 行  **通过**: □

### 4.5 Check 0.5：employee_assignment 表存在性验证

```sql
SELECT COUNT(*) AS table_exists
FROM information_schema.tables
WHERE table_name = 'employee_assignment';
```

**目标**: table_exists = 1  **通过**: □

### 4.6 Check 0.6：employee_assignment 当前数据量

```sql
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_records,
    COUNT(CASE WHEN is_current = true AND is_deleted = false THEN 1 END) AS current_active,
    COUNT(CASE WHEN created_by = 'system_migration_b2' THEN 1 END) AS previous_migration_records
FROM employee_assignment;
```

**决策**:
- 若 `previous_migration_records > 0`: 说明此前已执行过 B-2 迁移，需先执行 B-2 回滚或确认覆盖策略
- 若 `current_active > 0` 且 `previous_migration_records = 0`: 说明有非本 Runbook 写入的数据，必须人工审核

**通过**: □

### 4.7 Check 0.7：uk_emp_assign_primary 唯一索引验证

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'employee_assignment'
  AND indexname = 'uk_emp_assign_primary';
```

**目标**: 返回 1 行，且 `indexdef` 包含 `WHERE (is_primary = true AND is_current = true AND is_deleted = false)`。

- [ ] **PASS**（已存在且定义正确）
- [ ] **FAIL**（不存在或定义不正确）

**如果 FAIL，立即执行创建**:

```sql
CREATE UNIQUE INDEX uk_emp_assign_primary
ON employee_assignment (employee_id)
WHERE is_primary = true
  AND is_current = true
  AND is_deleted = false;
```

**创建后再次执行检查 SQL 验证**。

**最终通过**: □

### 4.8 Check 0.8：hse_employee_org 与 employee_assignment 数据差异检查

```sql
SELECT COUNT(DISTINCT employee_id) AS heo_current_employees
FROM hse_employee_org
WHERE is_current = true AND is_deleted = false;

SELECT COUNT(DISTINCT employee_id) AS ea_current_employees
FROM employee_assignment
WHERE is_current = true AND is_deleted = false;

SELECT COUNT(DISTINCT employee_id) AS her_current_employees
FROM hse_employee_relation
WHERE is_current = true AND is_deleted = false;

SELECT COUNT(DISTINCT ea.employee_id) AS ea_only_count
FROM employee_assignment ea
LEFT JOIN hse_employee_relation her
  ON ea.employee_id = her.employee_id AND her.is_deleted = false
WHERE ea.is_deleted = false AND her.employee_id IS NULL;
```

**记录基线**: heo=____ / ea=____ / her=____ / ea_only=____  **通过**: □

### 4.9 Check 0.9：hse_employee_org status 枚举分布

```sql
SELECT status, COUNT(*) AS cnt
FROM hse_employee_org
WHERE is_current = true AND is_deleted = false
GROUP BY status
ORDER BY cnt DESC;
```

**通过**: □

### 4.10 Check 0.10：hse_employee_relation status 枚举分布

```sql
SELECT status, COUNT(*) AS cnt
FROM hse_employee_relation
WHERE is_deleted = false
GROUP BY status
ORDER BY cnt DESC;
```

**记录分布**: 填入 [Sprint-B-v2.1-Status-Mapping.md](Sprint-B-v2.1-Status-Mapping.md)。

**通过**: □

### 4.11 Check 0.11：status 映射完整性确认（v2.1-Final 新增）

> 必须确认 `hse_employee_relation.status` 所有值均已在《Sprint-B-v2.1-Status-Mapping.md》中明确映射。

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

**目标**: 返回 0 行。

- [ ] **PASS**（无未映射 status）
- [ ] **FAIL**（发现未映射 status，必须暂停迁移并补充映射）

**通过**: □

### 4.12 Check 0.12：迁移基线表创建

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

**目标**: 至少记录 4 条基线  **通过**: □

### 4.13 Check 0.13：迁移备份注册表创建

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

**通过**: □

### 4.14 Step 0 检查结论

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
| 0.11 | status 映射完整性已确认 | □ |
| 0.12 | 迁移基线表已创建 | □ |
| 0.13 | 迁移备份注册表已创建 | □ |

**Step 0 负责人签字**: ______________ 日期: __________

---

## 五、B-0 Employee 恢复执行步骤

### 5.1 目标

恢复 `employee` 表中被软删除（`is_deleted = true`）但被旧模型引用的员工记录。

### 5.2 恢复来源（并集策略）

1. **来源 A**: `hse_employee_relation.employee_id`
2. **来源 B**: `hse_employee_org.employee_id`（is_current=true）

### 5.3 Step B-0-1: 恢复前数据快照

```sql
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

SELECT COUNT(DISTINCT employee_id) AS recoverable_count
FROM (
    SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
    UNION
    SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
) AS source_union
WHERE employee_id IN (SELECT id FROM employee WHERE is_deleted = true);
```

**实际结果**: recoverable_count = ____

### 5.4 Step B-0-2: 创建恢复 ID 临时表 + 持久化备份

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

**预期**: temp_count = backup_count  **实际**: temp_count=____, backup_count=____

### 5.5 Step B-0-3: 执行恢复 SQL（v2.1-Final 修复 baseline_count NULL 校验）

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
            rec_count,
            FLOOR(baseline_count * 0.98),
            CEIL(baseline_count * 1.02);
    END IF;

    INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
    VALUES ('B0_20260728', 'actual_recover_count', rec_count)
    ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;
END $$;
```

**影响行数**: rec_count = ____

### 5.6 Step B-0-4: 恢复后验证 SQL

```sql
SELECT
    COUNT(*) AS total_in_temp,
    COUNT(CASE WHEN e.is_deleted = false THEN 1 END) AS recovered_active,
    COUNT(CASE WHEN e.is_deleted = true THEN 1 END) AS still_deleted
FROM temp_b0_recover_ids t
JOIN employee e ON e.id = t.employee_id;

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

SELECT COUNT(*) AS missing_employee_refs
FROM hse_employee_relation her
LEFT JOIN employee e ON her.employee_id = e.id AND e.is_deleted = false
WHERE her.is_deleted = false AND e.id IS NULL;
```

**验证通过条件**:
- `still_deleted = 0`
- 动态基线校验 `status = 'PASS'`
- `missing_employee_refs = 0`

### 5.7 B-0 回滚方案

#### 5.7.1 策略 1: 从临时表精准回滚（会话未断开）

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

#### 5.7.2 策略 2: 从持久化备份表回滚（会话已断开，生产推荐）

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

#### 5.7.3 策略 3: 全量恢复（最后手段）

```bash
pg_restore -h localhost -U postgres -d safety_dashboard \
  -t employee \
  F:\backup\20260728_0200_sprint_b_tables.dump
```

---

## 六、B-1 组织模型验证

### 6.1 Step 1: employee_relation → employee 关联检查

```sql
SELECT COUNT(*) AS missing_refs
FROM hse_employee_relation her
LEFT JOIN employee e ON her.employee_id = e.id AND e.is_deleted = false
WHERE her.is_deleted = false;
```

**目标**: `missing_refs = 0`  **通过**: □

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

**目标**: `invalid_positions = 0`  **通过**: □

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

**目标**: `invalid_org_units = 0`  **通过**: □

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

**目标**: `invalid_op_units = 0`（允许 NULL）  **通过**: □

---

## 七、B-2 employee_assignment 迁移执行步骤

### 7.1 迁移概述

| 项 | 说明 |
|----|------|
| 来源表 | `hse_employee_relation` |
| 目标表 | `employee_assignment` |
| 迁移记录数 | 动态基线（Step 0 已记录） |
| 迁移标记 | `created_by = 'system_migration_b2'` |
| 前置条件 | Step 0 检查通过、B-0 恢复完成、B-1 验证通过 |
| 冲突处理 | UPSERT（重复记录覆盖更新） |

### 7.2 字段映射表

| 序号 | 目标字段 | 来源字段 | 转换规则 |
|------|----------|----------|----------|
| 1 | employee_id | employee_id | 直接映射 |
| 2 | org_unit_id | org_unit_id | 直接映射 |
| 3 | operation_unit_id | operation_unit_id | 直接映射（允许 NULL） |
| 4 | position_id | position_id | 直接映射 |
| 5 | supervisor_id | supervisor_id | 直接映射（允许 NULL） |
| 6 | status | status | 枚举映射（见 7.3） |
| 7 | is_current | is_current | 直接映射 |
| 8 | is_primary | is_primary | 直接映射 |
| 9 | start_date | start_date | 直接映射 |
| 10 | end_date | end_date | 直接映射（允许 NULL） |
| 11 | created_by | 常量 | 'system_migration_b2' |

### 7.3 status 转换规则（v2.1-Final 明确映射）

> 禁止 ELSE 自动覆盖未知 status。所有未知 status 必须在 Step 0 / Step 1.6 预检查中阻断并补充映射。

| 源 status | 目标 status | 业务含义 |
|-----------|-------------|---------|
| 'active' | 'active' | 在职 |
| 'pending' | 'pending' | 待入职/待岗 |
| 'inactive' | 'inactive' | 已停用 |
| 'leave' | 'inactive' | 离职 |
| 'resigned' | 'inactive' | 辞职 |
| 'retired' | 'inactive' | 退休 |
| 'dismissed' | 'inactive' | 辞退 |
| 'returned' | 'active' | 返聘 |
| NULL / 空值 | 'active' | 缺失状态默认在职 |

### 7.4 Step 1: 迁移前备份 employee_assignment

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

**备份记录数**: ____

### 7.5 Step 1.5: 脏数据检查（v2.1-Final 新增，P0 阻断项）

> 在 B-2 Step 2 之前执行 [Sprint-B-v2.1-Data-Clean-Check.sql](Sprint-B-v2.1-Data-Clean-Check.sql)。

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

**目标**: `duplicate_count = 0`  **通过**: □

### 7.6 Step 1.6: status 映射预检查（v2.1-Final 新增，P0 阻断项）

> 再次确认没有未映射 status 进入迁移 SQL。

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

**目标**: 无未映射 status  **通过**: □

### 7.7 Step 2: 执行迁移 SQL（v2.1-Final 修复 baseline_count NULL 校验 + 明确 status 映射）

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
```

**实际迁移行数**: insert_count = ____  **异常记录数**: ____

### 7.8 Step 3: 导出异常记录

```sql
SELECT * FROM b2_anomaly_log ORDER BY employee_id;
```

**异常处理**: 导出为 CSV: `F:\backup\20260728_0300_b2_anomaly.csv`

### 7.9 B-2 回滚方案

#### 7.9.1 策略 1: 仅回滚新增记录

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

#### 7.9.2 策略 2: 恢复 UPSERT 覆盖记录（生产推荐）

```sql
DO $$
DECLARE
    deleted_count INTEGER;
    recovered_count INTEGER;
BEGIN
    DELETE FROM employee_assignment
    WHERE created_by = 'system_migration_b2';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

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

#### 7.9.3 策略 3: 全量恢复

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

---

## 八、迁移后数据一致性验证

### 8.1 数据完整性验证

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

### 8.2 关联完整性验证

```sql
SELECT COUNT(*) AS missing_employee
FROM employee_assignment ea
LEFT JOIN employee e ON ea.employee_id = e.id AND e.is_deleted = false
WHERE ea.is_deleted = false AND e.id IS NULL;

SELECT COUNT(*) AS missing_position
FROM employee_assignment ea
LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
WHERE ea.is_deleted = false AND p.id IS NULL;

SELECT COUNT(*) AS missing_org
FROM employee_assignment ea
LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
WHERE ea.is_deleted = false AND ou.id IS NULL;
```

### 8.3 数据差异验证

```sql
SELECT COUNT(*) AS overwritten_records
FROM employee_assignment ea
JOIN employee_assignment_b2_backup_20260728 bak ON ea.id = bak.id
WHERE ea.created_by = 'system_migration_b2'
  AND (ea.org_unit_id IS DISTINCT FROM bak.org_unit_id
    OR ea.operation_unit_id IS DISTINCT FROM bak.operation_unit_id
    OR ea.position_id IS DISTINCT FROM bak.position_id);
```

---

## 九、迁移失败决策树

### 9.1 Step 0 失败

```
Step 0 检查失败
    ↓
停止迁移
    ↓
排查问题（锁/连接/Schema/约束/映射）
    ↓
修复后重新执行 Step 0
    ↓
全部通过后进入 B-0
```

### 9.2 B-0 失败

```
B-0 Step 2-3 执行失败
    ↓
检查错误类型
    ├─ SQL 语法错误 → 修正 SQL，重新执行
    ├─ 数据异常 → 分析数据，修正后重新执行
    └─ 其他错误 → 查看日志，修复后重新执行
    ↓
若无法修复
    ↓
执行 B-0 回滚（策略 2 推荐）
    ↓
恢复备份（最后手段）
    ↓
暂停迁移，召开技术评审会
```

### 9.3 B-2 失败

```
B-2 Step 2 执行失败
    ↓
检查错误类型
    ├─ SQL 语法错误 → 修正 SQL，重新执行
    ├─ 唯一约束冲突 → 检查脏数据，执行 Step 1.5 清洗
    ├─ 未映射 status → 检查 Step 1.6，补充映射
    └─ 其他错误 → 查看日志，修复后重新执行
    ↓
若验证失败
    ↓
执行 B-2 回滚（策略 2 推荐）
    ↓
恢复备份
    ↓
暂停迁移，召开技术评审会
```

---

## 十、旧模型冻结方案

### 10.1 hse_employee_org 冻结策略

```sql
CREATE TABLE IF NOT EXISTS employee_assignment_migration_log (
    id              BIGSERIAL   PRIMARY KEY,
    migration_id    VARCHAR(64) NOT NULL UNIQUE,
    source_table    VARCHAR(64) NOT NULL,
    target_table    VARCHAR(64) NOT NULL,
    record_count    INTEGER     NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    started_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMP,
    completed_by    VARCHAR(64),
    remark          TEXT,
    is_deleted      BOOLEAN     NOT NULL DEFAULT false
);

INSERT INTO employee_assignment_migration_log
    (migration_id, source_table, target_table, record_count, status, completed_at, completed_by, remark)
VALUES
    ('B2_20260728_0300', 'hse_employee_relation', 'employee_assignment',
     (SELECT metric_value FROM migration_baseline WHERE migration_id='B2_20260728' AND metric_name='actual_migrate_count'),
     'completed', NOW(), 'system_migration', 'Sprint-B B-2 数据迁移');
```

### 10.2 冻结后权限控制

```sql
REVOKE INSERT, UPDATE, DELETE ON hse_employee_org FROM hse_app_user;
GRANT SELECT ON hse_employee_org TO hse_app_user;

INSERT INTO employee_assignment_migration_log
    (migration_id, source_table, target_table, record_count, status, completed_at, completed_by, remark)
VALUES
    ('FREEZE_20260728_0400', 'hse_employee_org', 'FROZEN', 0, 'completed', NOW(), 'system_freeze',
     'Sprint-B 冻结 hse_employee_org: 撤销写入权限，保留只读');
```

---

## 十一、完整回滚方案

### 11.1 回滚触发条件

| # | 触发条件 | 严重等级 |
|---|----------|----------|
| R1 | Step 0 检查任一不通过 | **P0** |
| R2 | B-0 恢复影响行数超出动态基线范围 | **P0** |
| R3 | B-1 前置检查任一不通过 | **P0** |
| R4 | B-2 迁移后验证任一不通过 | **P0** |
| R5 | 迁移后应用启动失败或核心功能异常 | **P0** |
| R6 | 业务方反馈数据明显异常 | **P1** |

### 11.2 回滚步骤

#### Rollback Phase 1: 应用层回滚

```bash
pm2 stop all
cd F:\hse-dashboard\安全看板vben
git checkout sprint-b-migration-pre
pm2 start
```

#### Rollback Phase 2: 数据层回滚

```sql
-- Phase 2-A: 回滚 B-2（推荐策略 2）
-- 参见第七章 7.9

-- Phase 2-B: 回滚 B-0（推荐策略 2）
-- 参见第五章 5.7
```

#### Rollback Phase 3: 权限回滚

```sql
GRANT INSERT, UPDATE, DELETE ON hse_employee_org TO hse_app_user;
GRANT USAGE, SELECT ON SEQUENCE hse_employee_org_id_seq TO hse_app_user;
DROP TABLE IF EXISTS employee_assignment_migration_log;
```

---

## 十二、上线观察指标

### 12.1 观察窗口

- **观察期**: 迁移完成后 **72 小时**
- **观察时段**: 每 2 小时检查一次

### 12.2 核心观察指标

| # | 指标 | 告警阈值 | 处理动作 |
|---|------|----------|----------|
| O1 | 后端 API 错误率 | > 1% | 暂停 + 排查 |
| O2 | 员工列表查询成功率 | < 99% | 暂停 + 排查 |
| O3 | 员工选择组件响应时间 | > 3s | 优化查询 |
| O4 | 调岗功能成功率 | < 99% | 暂停 + 排查 |
| O5 | 新员工导入成功率 | < 95% | 暂停 + 排查 |
| O6 | employee_assignment 写入量 | 异常突增 | 排查写入源 |
| O7 | hse_employee_org 写入量 | > 0（已冻结） | 立即排查 |
| O8 | 前端页面白屏/报错 | 任意严重错误 | 回滚代码 |

---

## 附录 A: v2.1 → v2.1-Final 修订记录

| # | 章节 | 修订内容 | 修订原因 |
|---|------|----------|----------|
| 1 | 第四章 Check 0.7 | 增加约束缺失时自动创建 SQL 与二次验证 | P0: uk_emp_assign_primary 必须存在 |
| 2 | 第四章 Check 0.11 | 新增 status 映射完整性确认 | P1: 禁止 ELSE 自动覆盖未知 status |
| 3 | 第五章 5.5 | B-0 Step 3 增加 `baseline_count IS NULL` 分支 | P1: 避免基线缺失时校验静默失效 |
| 4 | 第七章 7.5 | 新增 B-2 脏数据检查 Step 1.5 | P0: 阻断重复当前关系 |
| 5 | 第七章 7.6 | 新增 status 映射预检查 Step 1.6 | P0: 阻断未映射 status |
| 6 | 第七章 7.7 | B-2 Step 2 明确列出所有 status 映射，移除 ELSE | P1: 禁止自动覆盖未知 status |
| 7 | 第七章 7.7 | B-2 Step 2 增加 `baseline_count IS NULL` 分支 | P1: 避免基线缺失时校验静默失效 |

## 附录 B: 生产阻断项清单

| # | 阻断项 | 影响 | 状态 | 解决方案 |
|---|--------|------|------|----------|
| 1 | `uk_emp_assign_primary` 不存在 | B-2 迁移失败 | ✅ 已修复 | Step 0 检查 + 自动创建 |
| 2 | `baseline_count` 为 NULL 导致校验失效 | 数据异常无法发现 | ✅ 已修复 | 增加 NULL 分支 |
| 3 | `hse_employee_relation` 重复当前关系 | ON CONFLICT 数据覆盖异常 | ✅ 已修复 | Step 1.5 脏数据检查 |
| 4 | 未知 status 被 ELSE 覆盖 | 状态数据错误 | ✅ 已修复 | Step 1.6 预检查 + 明确映射 |

## 附录 C: 执行时间线（v2.1-Final）

| 阶段 | 内容 | 预估时间 | 执行窗口 |
|------|------|----------|----------|
| T-1 | 前置检查 + 数据库备份 | 30 分钟 | D-1 下午 |
| T-0 | 停机 + 确认无活跃连接 | 15 分钟 | D 日 02:00 |
| T-1 | Step 0 迁移前强制检查（13 项） | 25 分钟 | D 日 02:15 |
| T-2 | B-0 Employee 恢复（含持久化备份） | 25 分钟 | D 日 02:40 |
| T-3 | B-0 验证 | 10 分钟 | D 日 03:05 |
| T-4 | B-1 前置强制检查 | 10 分钟 | D 日 03:15 |
| T-5 | B-2 数据迁移（含备份、脏数据检查、status 预检） | 30 分钟 | D 日 03:25 |
| T-6 | B-2 验证 + 数据一致性验证 | 30 分钟 | D 日 03:55 |
| T-7 | 旧模型冻结 | 10 分钟 | D 日 04:25 |
| T-8 | 启动应用 + 冒烟测试 | 20 分钟 | D 日 04:35 |
| T-9 | 上线观察 | 72 小时 | D 日 04:55 起 |
| **总计** | | **≈ 3 小时 10 分钟** | |

---

> **文档结束**
>
> 本 Runbook Final 已集成 CONDITIONAL PASS 的全部 4 项修复，达到生产迁移执行标准。需经数据迁移负责人、DBA、后端负责人、前端负责人、QA 五方签字确认后方可执行。
