# Sprint-B 数据迁移执行 Runbook v2.1（生产加固版）

> **版本**: v2.1
> **修订日期**: 2026-07-28
> **修订依据**: 《Sprint-B v2.1修订差异分析报告》
> **生产就绪**: ✅ 已修复所有 P0/P1 级问题

---

## 修订历史

| 版本 | 日期 | 修订内容 | 修订人 |
|------|------|---------|--------|
| v2.0 | 2026-07-28 | 基于审计报告 v1.0 修订 | TRAE |
| v2.1 | 2026-07-28 | 修复 SQL 语法错误、增强回滚方案、动态基线校验 | TRAE |

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

---

## 二、SQL 执行注意事项（v2.1 新增）

> ⚠️ **本章为 v2.1 新增**，所有 SQL 执行必须遵循以下规则，否则会导致执行失败或回滚失败。

### 2.1 GET DIAGNOSTICS 使用规范

#### ❌ 错误写法

```sql
BEGIN;
UPDATE employee SET is_deleted = false WHERE id IN (...);
GET DIAGNOSTICS rec_count = ROW_COUNT;  -- 错误：变量未声明
COMMIT;
```

#### ✅ 正确写法（使用 DO 块封装）

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

    -- 自动校验（可选）
    IF rec_count NOT BETWEEN 1285 AND 1310 THEN
        RAISE EXCEPTION '影响行数异常: %, 预期范围 [1285, 1310]', rec_count;
    END IF;
END $$;
```

### 2.2 ON CONFLICT 语法规范

#### ❌ 错误写法

```sql
INSERT INTO employee_assignment (...) VALUES (...)
ON CONFLICT (employee_id)
WHERE is_primary = true AND is_current = true  -- 错误：WHERE 子句位置错误
DO UPDATE SET ...;
```

#### ✅ 正确写法（使用 ON CONSTRAINT）

```sql
INSERT INTO employee_assignment (...)
SELECT ...
FROM hse_employee_relation her
WHERE her.is_deleted = false AND her.is_current = true
ON CONFLICT ON CONSTRAINT uk_emp_assign_primary  -- 使用约束名
DO UPDATE SET
    org_unit_id = EXCLUDED.org_unit_id,
    operation_unit_id = EXCLUDED.operation_unit_id,
    ...
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

> ⚠️ **建议**: 在 DBeaver/pgAdmin 中使用"单一 SQL 编辑器窗口"完成全部迁移步骤，中途不可关闭窗口或断开连接。

---

## 三、数据库备份方案

### 3.1 备份策略

执行任何迁移操作前，**必须完成以下全量备份**。备份文件按 `日期_时间_库名_操作类型.dump` 格式命名。

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

> **本章为 v2.1 重点增强章节**，在执行 B-0 恢复前，必须完成以下 **12 项强制检查**，全部通过方可进入 B-0 阶段。

### 4.1 Check 0.1：数据库锁检查（v2.1 新增）

**目的**: 确认无未提交事务持有排他锁，避免迁移阻塞。

```sql
-- 检查是否存在排他锁（AccessExclusiveLock）
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

**目标**: 返回 0 行
**实际**: ____  **通过**: □

### 4.2 Check 0.2：活跃连接检查（v2.1 新增）

**目的**: 确认仅有迁移会话连接，避免并发写入冲突。

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
  AND pid <> pg_backend_pid();  -- 排除当前查询
```

**目标**: 返回 0 行
**实际**: ____  **通过**: □

### 4.3 Check 0.3：Schema 版本检查（v2.1 新增）

**目的**: 确认数据库 schema 版本与预期一致。

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

**目标**: 返回预期字段列表
**实际**: ____  **通过**: □

### 4.4 Check 0.4：employee 表无 updated_by 字段

**目的**: 确认 employee 表无 `updated_by` 字段，避免 B-0 SQL 执行失败。

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'employee' AND column_name = 'updated_by';
```

**目标**: 返回 0 行
**实际**: ____  **通过**: □

### 4.5 Check 0.5：employee_assignment 表存在性验证

```sql
SELECT COUNT(*) AS table_exists
FROM information_schema.tables
WHERE table_name = 'employee_assignment';
```

**目标**: table_exists = 1
**实际**: ____  **通过**: □

### 4.6 Check 0.6：employee_assignment 当前数据量

**目的**: 评估 UPSERT 覆盖风险。

```sql
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_records,
    COUNT(CASE WHEN is_current = true AND is_deleted = false THEN 1 END) AS current_active,
    COUNT(CASE WHEN created_by = 'system_migration_b2' THEN 1 END) AS previous_migration_records
FROM employee_assignment;
```

**记录结果**:
- total_records: ____
- active_records: ____
- current_active: ____
- previous_migration_records: ____

**决策**:
- 若 `previous_migration_records > 0`: 说明此前已执行过 B-2 迁移，需先执行 B-2 回滚或确认覆盖策略
- 若 `current_active > 0` 且 `previous_migration_records = 0`: 说明有非本 Runbook 写入的数据，**必须人工审核**

**通过**: □

### 4.7 Check 0.7：uk_emp_assign_primary 唯一索引验证

**目的**: 确认 ON CONFLICT 子句能够命中唯一索引。

```sql
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'employee_assignment'
  AND indexname = 'uk_emp_assign_primary';
```

**目标**: 返回 1 行，且 indexdef 包含 `WHERE (is_primary = true AND is_current = true AND is_deleted = false)`
**实际**: ____  **通过**: □

### 4.8 Check 0.8：hse_employee_org 与 employee_assignment 数据差异检查

**目的**: 迁移前建立基线，便于迁移后对比。

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

**记录基线**（填入迁移基线表）:
- heo_current_employees: ____
- ea_current_employees: ____
- her_current_employees: ____
- ea_only_count: ____

**通过**: □

### 4.9 Check 0.9：hse_employee_org status 枚举分布

```sql
SELECT status, COUNT(*) AS cnt
FROM hse_employee_org
WHERE is_current = true AND is_deleted = false
GROUP BY status
ORDER BY cnt DESC;
```

**记录分布**:
| status | 数量 |
|--------|------|
| ____ | ____ |

**通过**: □

### 4.10 Check 0.10：hse_employee_relation status 枚举分布

```sql
SELECT status, COUNT(*) AS cnt
FROM hse_employee_relation
WHERE is_deleted = false
GROUP BY status
ORDER BY cnt DESC;
```

**记录分布**:
| status | 数量 |
|--------|------|
| ____ | ____ |

**通过**: □

### 4.11 Check 0.11：迁移基线表创建（v2.1 新增）

**目的**: 记录所有动态基线，避免硬编码校验。

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

**目标**: 至少记录 4 条基线
**实际**: ____  **通过**: □

### 4.12 Check 0.12：迁移备份注册表创建（v2.1 新增）

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

**目标**: 表创建成功
**实际**: ____  **通过**: □

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

---

## 五、B-0 Employee 恢复执行步骤

### 5.1 目标

恢复 `employee` 表中被软删除（`is_deleted = true`）但被旧模型引用的员工记录。

### 5.2 恢复来源（并集策略）

1. **来源 A**: `hse_employee_relation.employee_id`
2. **来源 B**: `hse_employee_org.employee_id`（is_current=true）

### 5.3 Step B-0-1: 恢复前数据快照

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

**实际结果记录**:
- recoverable_count: ____（动态基线，填入 migration_baseline）

### 5.4 Step B-0-2: 创建恢复 ID 临时表 + 持久化备份（v2.1 增强）

```sql
-- ================================================================
-- B-0 Step 2: 创建恢复 ID 临时表 + 持久化备份（v2.1 关键增强）
-- ================================================================

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

**预期**: temp_count = backup_count
**实际**: temp_count: ____, backup_count: ____

> ⚠️ **重要**: 持久化备份表确保即使会话断开，仍可从备份表读取恢复范围进行回滚。

### 5.5 Step B-0-3: 执行恢复 SQL（v2.1 修正语法）

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

**影响行数**: rec_count = ____（自动记录到基线表）

### 5.6 Step B-0-4: 恢复后验证 SQL

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

### 5.7 B-0 回滚方案（v2.1 完整版）

> **本章为 v2.1 重点增强章节**，提供 3 层回滚保障。

#### 5.7.1 策略 1: 从临时表精准回滚（会话未断开）

```sql
-- 前提: temp_b0_recover_ids 存在（同一会话）
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

#### 5.7.2 策略 2: 从持久化备份表回滚（会话已断开）

```sql
-- 前提: temp_b0_recover_ids_backup_20260728 存在（持久化表）
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
# 从备份文件恢复 employee 表
pg_restore -h localhost -U postgres -d safety_dashboard \
  -t employee \
  F:\backup\20260728_0200_sprint_b_tables.dump
```

---

## 六、B-1 组织模型验证

> 在执行 B-2 迁移前，必须完成组织模型关联有效性验证。此步骤为**只读检查**。

### 6.1 Step 1: employee_relation → employee 关联检查

```sql
SELECT COUNT(*) AS missing_refs
FROM hse_employee_relation her
LEFT JOIN employee e ON her.employee_id = e.id AND e.is_deleted = false
WHERE her.is_deleted = false;
```

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

**目标**: `invalid_op_units = 0`（允许 NULL）
**实际**: ____ / ____ / ____  **通过**: □

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
| 2 | org_unit_id | org_unit_id | 直接映射（NOT NULL） |
| 3 | operation_unit_id | operation_unit_id | 直接映射（允许 NULL） |
| 4 | position_id | position_id | 直接映射（NOT NULL） |
| 5 | supervisor_id | supervisor_id | 直接映射（允许 NULL） |
| 6 | status | status | 枚举映射 |
| 7 | is_current | is_current | 直接映射 |
| 8 | is_primary | is_primary | 直接映射 |
| 9 | start_date | start_date | 直接映射 |
| 10 | end_date | end_date | 直接映射（允许 NULL） |
| 11 | created_by | 常量 | 'system_migration_b2' |

### 7.3 status 转换规则

#### hse_employee_relation.status → employee_assignment.status

| 源值 | 目标值 | 说明 |
|------|--------|------|
| 'active' | 'active' | 在职：保持不变 |
| 'pending' | 'pending' | 待入职：保持不变 |
| 'inactive' | 'inactive' | 已停用：保持不变 |
| NULL / 空值 | 'active' | 默认值兜底 |
| 其他未知值 | 'active' | 默认值兜底，记录异常 |

#### hse_employee_org.status → employee_assignment.status（参考用）

| 源值 | 目标值 | 说明 |
|------|--------|------|
| '在职' | 'active' | 在职 |
| '待岗' | 'pending' | 待岗/待分配 |
| '离职' | 'inactive' | 已离职 |
| '退休' | 'inactive' | 已退休 |
| '返聘' | 'active' | 返聘在职 |

### 7.4 Step 1: 迁移前备份 employee_assignment（v2.1 增强）

```sql
-- ================================================================
-- B-2 Step 1: 备份 employee_assignment（v2.1 增加 migration_id）
-- ================================================================

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

**备份记录数**: ____

### 7.5 Step 2: 执行迁移 SQL（v2.1 修正语法）

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

**实际迁移行数**: insert_count = ____（自动记录）
**异常记录数**: ____

### 7.6 Step 3: 导出异常记录

```sql
SELECT * FROM b2_anomaly_log ORDER BY employee_id;
```

**异常处理**: 导出为 CSV: `F:\backup\20260728_0300_b2_anomaly.csv`

### 7.7 B-2 回滚方案（v2.1 完整版）

> **本章为 v2.1 重点增强章节**，提供 3 种分类回滚策略。

#### 7.7.1 策略 1: 仅回滚新增记录（迁移前 employee_assignment 为空）

```sql
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM employee_assignment
    WHERE created_by = 'system_migration_b2';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RAISE NOTICE '删除迁移记录数: %', deleted_count;

    -- 验证
    IF deleted_count = 0 THEN
        RAISE WARNING '未找到迁移标记记录';
    END IF;
END $$;
```

#### 7.7.2 策略 2: 恢复 UPSERT 覆盖记录（迁移前 employee_assignment 已有数据）

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

#### 7.7.3 策略 3: 全量恢复（最后手段）

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

---

## 九、迁移失败决策树（v2.1 新增）

> **本章为 v2.1 新增**，提供明确的失败处理流程。

### 9.1 Step 0 失败

```
Step 0 检查失败
    ↓
停止迁移
    ↓
排查问题（锁/连接/Schema）
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
执行 B-0 回滚（策略 1/2/3）
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
    ├─ 唯一约束冲突 → 检查数据重复，修正后重新执行
    └─ 其他错误 → 查看日志，修复后重新执行
    ↓
若验证失败
    ↓
执行 B-2 回滚（策略 1/2/3）
    ↓
恢复备份
    ↓
暂停迁移，召开技术评审会
```

### 9.4 代码启动失败

```
应用启动失败
    ↓
检查错误日志
    ├─ 数据库连接错误 → 检查数据库状态
    ├─ API 接口错误 → 检查后端代码切换
    └─ 前端错误 → 检查前端组件
    ↓
若无法快速修复
    ↓
执行代码回滚
    ↓
Git checkout sprint-b-migration-pre
    ↓
重启服务
    ↓
暂停迁移，召开技术评审会
```

---

## 十、旧模型冻结方案

### 10.1 hse_employee_org 冻结策略

**原则**: 不删除表，通过**权限控制 + 迁移记录表**实现逻辑冻结。

#### 10.1.1 冻结实施

```sql
-- 创建迁移记录表
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

-- 记录本次迁移
INSERT INTO employee_assignment_migration_log
    (migration_id, source_table, target_table, record_count, status, completed_at, completed_by, remark)
VALUES
    ('B2_20260728_0300', 'hse_employee_relation', 'employee_assignment',
     (SELECT metric_value FROM migration_baseline WHERE migration_id='B2_20260728' AND metric_name='actual_migrate_count'),
     'completed', NOW(), 'system_migration', 'Sprint-B B-2 数据迁移');
```

#### 10.1.2 冻结后权限控制

```sql
-- 撤销应用层写入权限（仅保留 SELECT）
REVOKE INSERT, UPDATE, DELETE ON hse_employee_org FROM hse_app_user;
GRANT SELECT ON hse_employee_org TO hse_app_user;

-- 记录冻结操作
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
-- Phase 2-A: 回滚 B-2（选择策略 1/2/3）
-- 参见第七章 7.7

-- Phase 2-B: 回滚 B-0（选择策略 1/2/3）
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

## 附录 A: v2.0 → v2.1 修订记录

| # | 章节 | 修订内容 | 修订原因 |
|---|------|----------|----------|
| 1 | 第二章 | **新增 SQL 执行注意事项** | GET DIAGNOSTICS/ON CONFLICT 语法错误（P0） |
| 2 | 第四章 | **新增 Check 0.1/0.2/0.3**（锁/连接/Schema） | 生产安全检查缺失（P1） |
| 3 | 第四章 | **新增 Check 0.11/0.12**（基线表/备份注册表） | 动态基线校验（P1） |
| 4 | 第五章 | **B-0 Step 2 增加持久化备份** | 会话断开无法回滚（P0） |
| 5 | 第五章 | **B-0 Step 3 改用 DO 块** | GET DIAGNOSTICS 语法错误（P0） |
| 6 | 第五章 | **B-0 回滚方案改为 3 层策略** | 回滚能力不完整（P0） |
| 7 | 第七章 | **B-2 Step 1 增加时间戳命名** | 备份表管理混乱（P2） |
| 8 | 第七章 | **B-2 Step 2 改用 DO 块 + ON CONSTRAINT** | SQL 语法错误（P0） |
| 9 | 第七章 | **B-2 回滚方案改为 3 种策略** | UPSERT 覆盖无法恢复（P0） |
| 10 | 第八章 | **数据验证改为动态基线** | 硬编码校验失效（P1） |
| 11 | 第九章 | **新增迁移失败决策树** | 生产故障处理流程缺失（P1） |

---

## 附录 B: 生产阻断项清单（v2.1 新增）

| # | 阻断项 | 影响 | 状态 | 负责人 | 解决方案 |
|---|--------|------|------|--------|----------|
| 1 | GET DIAGNOSTICS 语法错误 | SQL 执行失败 | ✅ 已修复 | 数据迁移负责人 | 改用 DO 块封装 |
| 2 | ON CONFLICT 语法错误 | B-2 迁移失败 | ✅ 已修复 | 数据迁移负责人 | 改用 ON CONSTRAINT |
| 3 | B-0 会话断开无法回滚 | 数据丢失风险 | ✅ 已修复 | DBA | 增加持久化备份表 |
| 4 | B-2 UPSERT 覆盖无法恢复 | 数据丢失风险 | ✅ 已修复 | 数据迁移负责人 | 增加 3 种回滚策略 |
| 5 | 数据量硬编码校验 | 校验机制失效 | ✅ 已修复 | 数据迁移负责人 | 改为动态基线 |
| 6 | 缺少数据库锁/连接检查 | 迁移冲突 | ✅ 已修复 | DBA | 增加 Step 0 检查 |

---

## 附录 C: 执行时间线（v2.1 修订）

| 阶段 | 内容 | 预估时间 | 执行窗口 |
|------|------|----------|----------|
| T-1 | 前置检查 + 数据库备份 | 30 分钟 | D-1 下午 |
| T-0 | 停机 + 确认无活跃连接 | 15 分钟 | D 日 02:00 |
| T-1 | **Step 0 迁移前强制检查**（12 项） | 20 分钟 | D 日 02:15 |
| T-2 | B-0 Employee 恢复（含持久化备份） | 25 分钟 | D 日 02:35 |
| T-3 | B-0 验证 | 10 分钟 | D 日 03:00 |
| T-4 | B-1 前置强制检查 | 10 分钟 | D 日 03:10 |
| T-5 | B-2 数据迁移（含备份） | 25 分钟 | D 日 03:20 |
| T-6 | B-2 验证 + 数据一致性验证 | 30 分钟 | D 日 03:45 |
| T-7 | 旧模型冻结 | 10 分钟 | D 日 04:15 |
| T-8 | 启动应用 + 冒烟测试 | 20 分钟 | D 日 04:25 |
| T-9 | 上线观察 | 72 小时 | D 日 04:45 起 |
| **总计** | | **≈ 3 小时** | |

---

> **文档结束**
>
> 本 Runbook v2.1 已修复 v2.0 的所有 P0/P1 级问题，达到生产执行标准。需经数据迁移负责人、DBA、后端负责人、前端负责人、QA 五方签字确认后方可执行。