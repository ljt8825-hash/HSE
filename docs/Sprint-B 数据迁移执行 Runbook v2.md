# Sprint-B 数据迁移执行 Runbook v2（修订版）

> **版本**：v2.0
> **修订日期**：2026-07-28
> **修订依据**：《Sprint-B 数据迁移执行前最终技术审计报告》
> **修订要点**：
> 1. 修复 employee 表无 `updated_by` 字段导致的 P0 级 SQL 错误
> 2. 引入 `temp_b0_recover_ids` 临时表方案，实现恢复/回滚精准定位
> 3. B-2 增加 status 枚举映射表、UPSERT 覆盖风险说明、已有数据检查
> 4. 新增 Step 0 迁移前强制检查（employee_assignment 数据量、唯一索引、数据差异）
> 5. 补充前端字段残留扫描结果（OrgTransferModal.vue 仍使用 team_id）

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
- [ ] **已确认 employee 表无 `updated_by` 字段**（v2 新增）

---

## 二、数据库备份方案

### 2.1 备份策略

执行任何迁移操作前，**必须完成以下全量备份**。备份文件按 `日期_时间_库名_操作类型.dump` 格式命名。

### 2.2 备份脚本

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

### 2.3 备份完整性验证

| 备份项 | 预期大小 | 实际大小 | 校验通过 |
|--------|----------|----------|----------|
| 全量数据库 | > 100MB | ____MB | □ |
| 关键表集合 | > 1MB | ____MB | □ |

---

## 三、Step 0 迁移前强制检查（v2 新增）

> **本章节为 v2 修订新增**。在执行 B-0 恢复前，必须完成以下 7 项强制检查，全部通过方可进入 B-0 阶段。

### 3.1 Check 0.1：employee 表字段结构验证

**目的**：确认 employee 表无 `updated_by` 字段，避免 B-0 SQL 执行失败。

```sql
-- 预期：返回 0 行（无 updated_by 字段）
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'employee' AND column_name = 'updated_by';
```

**目标**：返回 0 行
**实际**：____  **通过**：□

> ⚠️ 若返回 1 行，说明 employee 表已添加 updated_by 字段，需重新评估 Runbook SQL。

### 3.2 Check 0.2：employee_assignment 表存在性验证

**目的**：确认 employee_assignment 表已创建。

```sql
SELECT COUNT(*) AS table_exists
FROM information_schema.tables
WHERE table_name = 'employee_assignment';
```

**目标**：table_exists = 1
**实际**：____  **通过**：□

### 3.3 Check 0.3：employee_assignment 当前数据量

**目的**：评估 UPSERT 覆盖风险。若已有数据，需确认是否允许覆盖。

```sql
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_records,
    COUNT(CASE WHEN is_current = true AND is_deleted = false THEN 1 END) AS current_active,
    COUNT(CASE WHEN created_by = 'system_migration_b2' THEN 1 END) AS previous_migration_records
FROM employee_assignment;
```

**记录结果**：
- total_records: ____
- active_records: ____
- current_active: ____
- previous_migration_records: ____

**决策**：
- 若 `previous_migration_records > 0`：说明此前已执行过 B-2 迁移，需先执行 B-2 回滚或确认覆盖策略
- 若 `current_active > 0` 且 `previous_migration_records = 0`：说明有非本 Runbook 写入的数据，**必须人工审核**是否允许覆盖

**通过**：□

### 3.4 Check 0.4：uk_emp_assign_primary 唯一索引验证

**目的**：确认 ON CONFLICT 子句能够命中唯一索引。

```sql
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'employee_assignment'
  AND indexname = 'uk_emp_assign_primary';
```

**目标**：返回 1 行，且 indexdef 包含 `WHERE (is_primary = true AND is_current = true AND is_deleted = false)`
**实际**：____  **通过**：□

### 3.5 Check 0.5：hse_employee_org 与 employee_assignment 数据差异检查

**目的**：迁移前建立基线，便于迁移后对比。

```sql
-- 5.1 hse_employee_org 当前在职员工数（按 employee_id 去重）
SELECT COUNT(DISTINCT employee_id) AS heo_current_employees
FROM hse_employee_org
WHERE is_current = true AND is_deleted = false;

-- 5.2 employee_assignment 当前在职员工数（按 employee_id 去重）
SELECT COUNT(DISTINCT employee_id) AS ea_current_employees
FROM employee_assignment
WHERE is_current = true AND is_deleted = false;

-- 5.3 hse_employee_relation 当前员工数（按 employee_id 去重）
SELECT COUNT(DISTINCT employee_id) AS her_current_employees
FROM hse_employee_relation
WHERE is_current = true AND is_deleted = false;

-- 5.4 已在 employee_assignment 但不在 hse_employee_relation 的员工（迁移后不应存在差异）
SELECT COUNT(DISTINCT ea.employee_id) AS ea_only_count
FROM employee_assignment ea
LEFT JOIN hse_employee_relation her
  ON ea.employee_id = her.employee_id
  AND her.is_deleted = false
WHERE ea.is_deleted = false
  AND her.employee_id IS NULL;
```

**记录基线**：
- heo_current_employees: ____
- ea_current_employees: ____
- her_current_employees: ____
- ea_only_count（迁移前差异）: ____

**通过**：□

### 3.6 Check 0.6：hse_employee_org status 枚举分布

**目的**：确认 status 枚举值范围，为枚举映射做准备。

```sql
SELECT status, COUNT(*) AS cnt
FROM hse_employee_org
WHERE is_current = true AND is_deleted = false
GROUP BY status
ORDER BY cnt DESC;
```

**记录分布**：
| status | 数量 |
|--------|------|
| ____ | ____ |
| ____ | ____ |

**通过**：□

### 3.7 Check 0.7：hse_employee_relation status 枚举分布

**目的**：确认迁移源 status 枚举值范围。

```sql
SELECT status, COUNT(*) AS cnt
FROM hse_employee_relation
WHERE is_deleted = false
GROUP BY status
ORDER BY cnt DESC;
```

**记录分布**：
| status | 数量 |
|--------|------|
| ____ | ____ |

**通过**：□

### 3.8 Step 0 检查结论

| # | 检查项 | 通过 |
|---|--------|------|
| 0.1 | employee 表无 updated_by | □ |
| 0.2 | employee_assignment 表存在 | □ |
| 0.3 | employee_assignment 数据量评估 | □ |
| 0.4 | uk_emp_assign_primary 索引存在 | □ |
| 0.5 | 数据差异基线已记录 | □ |
| 0.6 | hse_employee_org status 分布已记录 | □ |
| 0.7 | hse_employee_relation status 分布已记录 | □ |

**Step 0 负责人签字**：______________ 日期：__________

---

## 四、B-0 Employee 恢复执行步骤（v2 修订）

### 4.1 修订说明

| 修订项 | v1.0 | v2.0 |
|--------|------|------|
| 恢复 SQL | `SET updated_by='system_migration_b0'` | **移除 updated_by**，改用临时表 `temp_b0_recover_ids` 记录恢复范围 |
| 回滚 SQL | `WHERE updated_by='system_migration_b0'` | **从 `temp_b0_recover_ids` 读取 ID 列表**精准定位 |
| 恢复范围标记 | updated_by 字段（不可用） | 临时表 + `updated_at` 时间戳双重标记 |

### 4.2 目标

恢复 `employee` 表中被软删除（`is_deleted = true`）但被旧模型引用的员工记录。

### 4.3 恢复来源（并集策略）

1. **来源 A**：`hse_employee_relation.employee_id`
2. **来源 B**：`hse_employee_org.employee_id`（is_current=true）

### 4.4 Step B-0-1：恢复前数据快照

```sql
-- ================================================================
-- B-0 Step 1: 恢复前数据快照（只读查询）
-- ================================================================

-- 1.1 employee 表总体状态
SELECT
    COUNT(*) AS total_employees,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_employees,
    COUNT(CASE WHEN is_deleted = true THEN 1 END) AS deleted_employees
FROM employee;

-- 1.2 需要恢复的员工数量（并集去重，仅 is_deleted=true 的）
SELECT COUNT(DISTINCT employee_id) AS recoverable_count
FROM (
    SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
    UNION
    SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
) AS source_union
WHERE employee_id IN (SELECT id FROM employee WHERE is_deleted = true);

-- 1.3 已活跃员工（无需恢复）
SELECT COUNT(DISTINCT employee_id) AS already_active
FROM (
    SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
    UNION
    SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
) AS source_union
WHERE employee_id IN (SELECT id FROM employee WHERE is_deleted = false);
```

**预期结果**：
- `recoverable_count` ≈ 1304
- `already_active` ≈ 0

**实际结果记录**：
- recoverable_count: ____
- already_active: ____

### 4.5 Step B-0-2：创建恢复 ID 临时表（v2 新增）

**目的**：在执行恢复前，先将待恢复的 employee_id 列表持久化到临时表，作为回滚的精准定位依据。

```sql
-- ================================================================
-- B-0 Step 2: 创建恢复 ID 临时表（v2 关键修订）
-- 注意：此临时表在整个迁移会话中保留，不可提前关闭会话
-- ================================================================

-- 创建临时表（生命周期：当前会话）
CREATE TEMP TABLE IF NOT EXISTS temp_b0_recover_ids (
    employee_id BIGINT PRIMARY KEY,
    recovered_at TIMESTAMP DEFAULT NOW()
);

-- 清空临时表（防止重复执行残留）
TRUNCATE temp_b0_recover_ids;

-- 填充待恢复的 employee_id（并集去重，仅 is_deleted=true 的）
INSERT INTO temp_b0_recover_ids (employee_id)
SELECT DISTINCT employee_id
FROM (
    SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
    UNION
    SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
) AS source_union
WHERE employee_id IN (SELECT id FROM employee WHERE is_deleted = true);

-- 验证临时表记录数
SELECT COUNT(*) AS recover_id_count FROM temp_b0_recover_ids;
```

**预期**：recover_id_count ≈ 1304
**实际**：____

> ⚠️ **重要提示**：
> 1. `TEMP TABLE` 仅在当前数据库会话中存在。若会话断开，临时表将丢失，回滚将无法精准定位。
> 2. **迁移全程必须使用同一数据库连接**，不可中途断开重连。
> 3. 若中途会话断开，需从 B-0 Step 2 重新开始（包括重新评估已恢复的记录）。
> 4. 建议在 DBeaver/pgAdmin 中使用"单一 SQL 编辑器窗口"完成全部迁移步骤。

### 4.6 Step B-0-3：执行恢复 SQL（v2 修订）

```sql
-- ================================================================
-- B-0 Step 3: 恢复 employee 表中的软删员工（v2 修订）
-- 修订点：移除 updated_by 字段引用
-- ================================================================

BEGIN;

-- 记录恢复前时间戳（用于辅助验证）
-- 注意：employee 表无 updated_by 字段，仅通过 updated_at + 临时表双重标记

UPDATE employee
SET is_deleted = false,
    updated_at = NOW()
WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids)
  AND is_deleted = true;

-- 检查影响行数
GET DIAGNOSTICS rec_count = ROW_COUNT;

COMMIT;

-- 若 rec_count 不在 [1285, 1310] 范围内，则立即执行 B-0 回滚
```

**影响行数校验**：
- 最小预期：1285
- 最大预期：1310
- **实际影响行数**：rec_count = ____

> ⚠️ 若 rec_count = 0：可能 employee_id 已全部为活跃状态（already_active > 0），需检查 B-0 Step 1 的 already_active 值，确认是否真的需要恢复。

### 4.7 Step B-0-4：恢复后验证 SQL

```sql
-- ================================================================
-- B-0 Step 4: 恢复后验证（必须全部通过）
-- ================================================================

-- 4.1 临时表中的员工全部已恢复为活跃
SELECT
    COUNT(*) AS total_in_temp,
    COUNT(CASE WHEN e.is_deleted = false THEN 1 END) AS recovered_active,
    COUNT(CASE WHEN e.is_deleted = true THEN 1 END) AS still_deleted
FROM temp_b0_recover_ids t
JOIN employee e ON e.id = t.employee_id;

-- □ 验证通过：still_deleted = 0

-- 4.2 employee 表活跃数量变化
SELECT
    COUNT(*) AS total_employees,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_employees
FROM employee;

-- □ 验证通过：active_employees 应比恢复前增加 ≈1304

-- 4.3 hse_employee_relation → employee 关联完整性
SELECT COUNT(*) AS missing_employee_refs
FROM hse_employee_relation her
LEFT JOIN employee e ON her.employee_id = e.id AND e.is_deleted = false
WHERE her.is_deleted = false AND e.id IS NULL;

-- □ 验证通过：missing_employee_refs = 0

-- 4.4 hse_employee_org → employee 关联完整性
SELECT COUNT(*) AS missing_org_refs
FROM hse_employee_org heo
LEFT JOIN employee e ON heo.employee_id = e.id AND e.is_deleted = false
WHERE heo.is_deleted = false AND heo.is_current = true AND e.id IS NULL;

-- □ 验证通过：missing_org_refs = 0

-- 4.5 employee_code 唯一性检查
SELECT employee_code, COUNT(*) AS dup_count
FROM employee
WHERE is_deleted = false AND employee_code IS NOT NULL
GROUP BY employee_code
HAVING COUNT(*) > 1;

-- □ 验证通过：查询结果为空集

-- 4.6 加密字段格式抽样检查
SELECT id, id_card, phone FROM employee
WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids LIMIT 10);
-- □ 验证通过：id_card 和 phone 字段以 "ENC:" 开头
```

**验证结果记录表**：

| 验证项 | 预期 | 实际 | 通过 |
|--------|------|------|------|
| 临时表员工全部恢复 | still_deleted=0 | ____ | □ |
| employee 活跃数量 | ≈1304+ | ____ | □ |
| relation→employee 完整性 | 0 | ____ | □ |
| org→employee 完整性 | 0 | ____ | □ |
| employee_code 唯一性 | 无重复 | ____ | □ |
| 加密字段格式 | ENC: 开头 | ____ | □ |

### 4.8 Step B-0-5：B-0 回滚 SQL（v2 修订）

**触发条件**：B-0 验证失败、影响行数超出范围、或后续步骤失败需回滚至 B-0 前。

```sql
-- ================================================================
-- B-0 回滚脚本（v2 修订）
-- 修订点：从 temp_b0_recover_ids 读取 ID 列表，精准回滚
-- ================================================================

BEGIN;

-- 仅回滚临时表中记录的 employee_id（精准定位）
UPDATE employee
SET is_deleted = true,
    updated_at = NOW()
WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids)
  AND is_deleted = false;

GET DIAGNOSTICS rollback_count = ROW_COUNT;

COMMIT;

-- 验证回滚结果
SELECT
    COUNT(*) AS total_in_temp,
    COUNT(CASE WHEN e.is_deleted = true THEN 1 END) AS re_deleted,
    COUNT(CASE WHEN e.is_deleted = false THEN 1 END) AS still_active
FROM temp_b0_recover_ids t
JOIN employee e ON e.id = t.employee_id;

-- □ 验证通过：re_deleted = total_in_temp，still_active = 0
```

**回滚影响行数**：rollback_count = ____

> ⚠️ **回滚注意事项**：
> 1. 回滚必须在**同一数据库会话**中执行，否则 `temp_b0_recover_ids` 不存在。
> 2. 若会话已断开且临时表丢失，需执行**全量恢复**：从备份恢复 employee 表，或使用 `pg_restore` 恢复 `20260728_0200_sprint_b_tables.dump`。
> 3. 回滚仅将 `is_deleted` 改回 true，不会删除 employee 记录，数据安全性高。

### 4.9 会话断开应急方案（v2 新增）

若迁移过程中数据库会话意外断开，`temp_b0_recover_ids` 丢失，按以下步骤恢复：

```sql
-- ================================================================
-- 应急方案：重建 temp_b0_recover_ids（基于 updated_at 时间戳推断）
-- ================================================================

-- 1. 确认 B-0 是否已执行（检查 employee 表是否有大量 updated_at 接近迁移时间）
SELECT COUNT(*) AS recently_updated
FROM employee
WHERE is_deleted = false
  AND updated_at >= '2026-07-28 02:15:00'  -- 替换为实际 B-0 执行时间
  AND updated_at < '2026-07-28 02:30:00';

-- 2. 重建临时表（基于时间窗口）
CREATE TEMP TABLE temp_b0_recover_ids AS
SELECT id AS employee_id, updated_at AS recovered_at
FROM employee
WHERE is_deleted = false
  AND updated_at >= '2026-07-28 02:15:00'
  AND updated_at < '2026-07-28 02:30:00';

-- 3. 验证重建的临时表记录数
SELECT COUNT(*) FROM temp_b0_recover_ids;
```

> ⚠️ 此方案为应急备用，准确性低于原始临时表（可能包含非 B-0 操作的记录）。**强烈建议迁移全程使用单一会话**。

---

## 五、B-0 验证清单（v2 修订）

| # | 验证项 | 验证方式 | 目标 | 通过 |
|---|--------|----------|------|------|
| V1 | 临时表已创建并填充 | `SELECT COUNT(*) FROM temp_b0_recover_ids` | ≈1304 | □ |
| V2 | 临时表员工全部恢复 | `still_deleted=0` | 0 | □ |
| V3 | employee 活跃员工数 | `SELECT COUNT(*) FROM employee WHERE is_deleted=false` | > 恢复前 + 1285 | □ |
| V4 | hse_employee_relation 引用完整性 | LEFT JOIN employee | 0 | □ |
| V5 | hse_employee_org 引用完整性 | LEFT JOIN employee | 0 | □ |
| V6 | employee_code 唯一性 | GROUP BY HAVING | 空结果 | □ |
| V7 | id_card 加密格式 | `NOT LIKE 'ENC:%'` | 空结果 | □ |
| V8 | phone 加密格式 | `NOT LIKE 'ENC:%'` | 空结果 | □ |
| V9 | 回滚脚本就绪（临时表存在） | `SELECT to_regclass('pg_temp.temp_b0_recover_ids')` | 非 NULL | □ |

**验证负责人签字**：______________ 日期：__________

---

## 六、B-1 组织模型验证

> 在执行 B-2 迁移前，必须完成组织模型关联有效性验证。此步骤为**只读检查**。

### 6.1 Step 1：employee_relation → employee 关联检查

```sql
SELECT COUNT(*) AS missing_refs
FROM hse_employee_relation her
LEFT JOIN employee e
  ON her.employee_id = e.id
  AND e.is_deleted = false
WHERE her.is_deleted = false;
```

**目标**：`missing_refs = 0`
**实际**：____  **通过**：□

### 6.2 Step 2：position_id 有效性检查

```sql
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN p.id IS NOT NULL THEN 1 END) AS valid_positions,
    COUNT(CASE WHEN p.id IS NULL THEN 1 END) AS invalid_positions
FROM hse_employee_relation her
LEFT JOIN position p
  ON her.position_id = p.id
  AND p.is_deleted = false
WHERE her.is_deleted = false;
```

**目标**：`invalid_positions = 0`
**实际**：____ / ____  **通过**：□

### 6.3 Step 3：org_unit_id 有效性检查

```sql
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN ou.id IS NOT NULL THEN 1 END) AS valid_org_units,
    COUNT(CASE WHEN ou.id IS NULL THEN 1 END) AS invalid_org_units
FROM hse_employee_relation her
LEFT JOIN hse_org_unit ou
  ON her.org_unit_id = ou.id
  AND ou.is_deleted = false
WHERE her.is_deleted = false;
```

**目标**：`invalid_org_units = 0`
**实际**：____ / ____  **通过**：□

### 6.4 Step 4：operation_unit_id 有效性检查

```sql
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN her.operation_unit_id IS NULL THEN 1 END) AS null_op_units,
    COUNT(CASE WHEN her.operation_unit_id IS NOT NULL AND opu.id IS NOT NULL THEN 1 END) AS valid_op_units,
    COUNT(CASE WHEN her.operation_unit_id IS NOT NULL AND opu.id IS NULL THEN 1 END) AS invalid_op_units
FROM hse_employee_relation her
LEFT JOIN hse_operation_unit opu
  ON her.operation_unit_id = opu.id
  AND opu.is_deleted = false
WHERE her.is_deleted = false;
```

**目标**：`invalid_op_units = 0`（允许 NULL）
**实际**：____ / ____ / ____  **通过**：□

### 6.5 B-1 验证结论

| # | 检查项 | 结果 | 通过 |
|---|--------|------|------|
| 1 | employee 关联完整性 | ____ | □ |
| 2 | position_id 有效性 | ____ | □ |
| 3 | org_unit_id 有效性 | ____ | □ |
| 4 | operation_unit_id 有效性 | ____ | □ |

---

## 七、B-2 employee_assignment 迁移执行步骤（v2 修订）

### 7.1 修订说明

| 修订项 | v1.0 | v2.0 |
|--------|------|------|
| status 映射 | 仅列出 active/pending/inactive | **新增完整映射表**，包含 hse_employee_org 中文枚举 |
| UPSERT 风险 | 未说明 | **新增 UPSERT 覆盖风险说明** + 备份强制要求 |
| 已有数据检查 | 未包含 | **Step 0 已包含** employee_assignment 数据量检查 |
| 异常记录 | TEMP TABLE | 保留，增加会话保留提示 |

### 7.2 迁移概述

| 项 | 说明 |
|----|------|
| 来源表 | `hse_employee_relation` |
| 目标表 | `employee_assignment` |
| 迁移记录数 | ≈ 1304 |
| 迁移标记 | `created_by = 'system_migration_b2'` |
| 前置条件 | Step 0 检查通过、B-0 恢复完成、B-1 验证通过 |
| 冲突处理 | UPSERT（重复记录覆盖更新） |

### 7.3 字段映射表

| 序号 | 目标字段 | 来源字段 | 转换规则 | 备注 |
|------|----------|----------|----------|------|
| 1 | employee_id | employee_id | 直接映射 | |
| 2 | org_unit_id | org_unit_id | 直接映射 | NOT NULL |
| 3 | operation_unit_id | operation_unit_id | 直接映射 | 允许 NULL |
| 4 | position_id | position_id | 直接映射 | NOT NULL |
| 5 | supervisor_id | supervisor_id | 直接映射 | 允许 NULL |
| 6 | status | status | 转换（见 7.4） | 枚举映射 |
| 7 | is_current | is_current | 直接映射 | boolean |
| 8 | is_primary | is_primary | 直接映射 | boolean |
| 9 | start_date | start_date | 直接映射 | date |
| 10 | end_date | end_date | 直接映射 | 允许 NULL |
| 11 | remark | remark | 直接映射 | 允许 NULL |
| 12 | created_by | 常量 | 'system_migration_b2' | 迁移标记 |
| 13 | created_at | created_at | 直接映射 | 保留原始时间 |
| 14 | updated_at | 常量 | NOW() | |
| 15 | is_deleted | 常量 | false | |

### 7.4 status 转换规则（v2 完整版）

#### 7.4.1 hse_employee_relation.status → employee_assignment.status 映射

| 源值（hse_employee_relation.status） | 目标值（employee_assignment.status） | 说明 |
|--------------------------------------|--------------------------------------|------|
| 'active' | 'active' | 在职：保持不变 |
| 'pending' | 'pending' | 待入职：保持不变 |
| 'inactive' | 'inactive' | 已停用：保持不变 |
| NULL / 空值 | 'active' | 默认值兜底，记录异常日志 |
| 其他未知值 | 'active' | 默认值兜底，**记录到 b2_anomaly_log** |

#### 7.4.2 hse_employee_org.status → employee_assignment.status 映射（参考用）

> ⚠️ 本表仅供参考。B-2 迁移源是 hse_employee_relation，不直接使用 hse_employee_org.status。但代码切换阶段（第八章）需要将 hse-employee.js 中的中文 status 转换为英文枚举。

| 源值（hse_employee_org.status） | 目标值（employee_assignment.status） | 说明 |
|------|------|------|
| '在职' | 'active' | 在职 |
| '待岗' | 'pending' | 待岗/待分配 |
| '离职' | 'inactive' | 已离职 |
| '退休' | 'inactive' | 已退休 |
| '返聘' | 'active' | 返聘在职 |
| NULL / 空值 | 'active' | 默认值 |
| 其他未知值 | 'active' | 默认值，记录异常 |

#### 7.4.3 迁移前 status 分布检查

```sql
-- 迁移前确认 hse_employee_relation.status 实际分布
SELECT status, COUNT(*) AS cnt
FROM hse_employee_relation
WHERE is_deleted = false
GROUP BY status
ORDER BY cnt DESC;
```

**预期分布**：全部为 `active`（根据审计结果）
**实际分布**：____（来自 Step 0 Check 0.7）

### 7.5 UPSERT 覆盖风险说明（v2 新增）

> ⚠️ **重要风险提示**

#### 7.5.1 风险描述

B-2 迁移使用 `INSERT ... ON CONFLICT DO UPDATE`，当 employee_assignment 中已存在同一 employee_id 的主岗记录时，**将覆盖原有记录的所有字段**（org_unit_id, operation_unit_id, position_id 等）。

#### 7.5.2 风险场景

| 场景 | 描述 | 影响 |
|------|------|------|
| 场景 A | employee_assignment 已有非本 Runbook 写入的数据（如业务系统已在使用） | 原有 org_unit_id/position_id 等被 hse_employee_relation 数据覆盖 |
| 场景 B | 此前已执行过 B-2 迁移（previous_migration_records > 0） | 重复执行将再次覆盖，数据无变化（幂等） |
| 场景 C | employee_assignment 有业务系统实时写入的调岗记录 | 调岗记录被覆盖，可能丢失最新调岗信息 |

#### 7.5.3 风险控制措施

1. **Step 0 Check 0.3 已强制检查**：若 `current_active > 0` 且 `previous_migration_records = 0`，必须人工审核
2. **B-2 Step 1 强制备份**：迁移前将 employee_assignment 当前数据备份至 `employee_assignment_b2_backup`
3. **迁移后对比**：B-2 完成后执行数据对比，确认覆盖范围
4. **回滚预案**：可通过 `DELETE FROM employee_assignment WHERE created_by='system_migration_b2'` + 恢复备份回滚

### 7.6 Step 1：迁移前备份 employee_assignment（v2 强制）

```sql
-- ================================================================
-- B-2 Step 1: 备份 employee_assignment 当前数据（v2 强制执行）
-- ================================================================

-- 创建备份表（持久表，非临时表，便于跨会话恢复）
DROP TABLE IF EXISTS employee_assignment_b2_backup;
CREATE TABLE employee_assignment_b2_backup AS
SELECT * FROM employee_assignment;

-- 记录备份数量
SELECT
    COUNT(*) AS backup_count,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS backup_active
FROM employee_assignment_b2_backup;
```

**备份记录数**：____（来自 Step 0 Check 0.3 的 total_records）

> ⚠️ 使用 `DROP TABLE IF EXISTS` + `CREATE TABLE` 确保备份表为最新快照。若此前执行过 B-2 备份，将覆盖旧备份。

### 7.7 Step 2：执行迁移 SQL

```sql
-- ================================================================
-- B-2 Step 2: 从 hse_employee_relation 迁移至 employee_assignment
-- ================================================================

BEGIN;

-- 7.7.1 主迁移：INSERT ... ON CONFLICT DO UPDATE
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
ON CONFLICT (employee_id)
WHERE is_primary = true AND is_current = true AND is_deleted = false
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

-- 7.7.2 异常记录：status 为未知值的记录
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

COMMIT;
```

**实际迁移行数**：insert_count = ____
**异常记录数**：____

### 7.8 Step 3：重复处理策略

| 场景 | 处理方式 | SQL 实现 |
|------|----------|----------|
| employee_assignment 中已存在同一 employee_id 的主岗记录 | 覆盖更新（UPSERT） | `ON CONFLICT (employee_id) WHERE is_primary=true AND is_current=true` |
| hse_employee_relation 中同一 employee_id 有多条记录 | 仅迁移 `is_current=true` 的记录 | WHERE 子句过滤 |
| employee_assignment 中存在软删记录 | 恢复为活跃记录 | DO UPDATE SET is_deleted=false |

### 7.9 Step 4：异常记录策略

```sql
-- 导出异常记录（必须在同一会话中执行，b2_anomaly_log 为 TEMP TABLE）
SELECT * FROM b2_anomaly_log ORDER BY employee_id;
```

**异常处理**：
1. 导出异常记录为 CSV 文件：`F:\backup\20260728_0200_b2_anomaly.csv`
2. 逐条审核异常记录
3. 未知 status 标记为 `active` 的记录，需业务方确认合理性
4. 所有异常记录必须在迁移报告中详细说明

### 7.10 B-2 回滚 SQL

```sql
-- ================================================================
-- B-2 回滚脚本
-- ================================================================

BEGIN;

-- 方式 1：删除本次迁移写入的记录（推荐）
DELETE FROM employee_assignment
WHERE created_by = 'system_migration_b2';

GET DIAGNOSTICS rollback_count = ROW_COUNT;

COMMIT;

-- 方式 2：从备份恢复（若需恢复迁移前的非本次迁移数据）
-- DROP TABLE IF EXISTS employee_assignment;
-- CREATE TABLE employee_assignment AS SELECT * FROM employee_assignment_b2_backup;
```

**回滚影响行数**：rollback_count = ____

---

## 八、迁移后数据一致性验证

### 8.1 数据完整性验证

```sql
-- 8.1 employee_assignment 总记录数
SELECT
    COUNT(*) AS total,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active,
    COUNT(CASE WHEN is_current = true AND is_deleted = false THEN 1 END) AS current_active,
    COUNT(CASE WHEN created_by = 'system_migration_b2' THEN 1 END) AS migrated_records
FROM employee_assignment;
```

**预期**：total ≈ 1304, migrated_records ≈ 1304
**实际**：____ / ____ / ____

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

-- 8.5 employee_assignment → hse_operation_unit 完整性（允许 NULL）
SELECT COUNT(*) AS missing_op_unit
FROM employee_assignment ea
LEFT JOIN hse_operation_unit opu ON ea.operation_unit_id = opu.id AND opu.is_deleted = false
WHERE ea.is_deleted = false AND ea.operation_unit_id IS NOT NULL AND opu.id IS NULL;
```

### 8.3 数据差异验证（v2 新增）

```sql
-- 8.6 hse_employee_relation 与 employee_assignment 数据差异
-- 迁移后两表 employee_id 应完全一致（差异 = 0）
SELECT
    (SELECT COUNT(DISTINCT employee_id) FROM hse_employee_relation WHERE is_deleted=false AND is_current=true) AS her_count,
    (SELECT COUNT(DISTINCT employee_id) FROM employee_assignment WHERE is_deleted=false AND is_current=true) AS ea_count;

-- 8.7 详细差异：在 hse_employee_relation 但不在 employee_assignment 的员工
SELECT COUNT(DISTINCT her.employee_id) AS her_only_count
FROM hse_employee_relation her
LEFT JOIN employee_assignment ea
  ON her.employee_id = ea.employee_id
  AND ea.is_deleted = false
  AND ea.is_current = true
WHERE her.is_deleted = false
  AND her.is_current = true
  AND ea.employee_id IS NULL;

-- □ 通过：her_only_count = 0（无遗漏）

-- 8.8 UPSERT 覆盖范围检查
-- 对比迁移前后 employee_assignment 中 org_unit_id 发生变化的记录数
SELECT COUNT(*) AS overwritten_records
FROM employee_assignment ea
JOIN employee_assignment_b2_backup bak ON ea.id = bak.id
WHERE ea.created_by = 'system_migration_b2'
  AND (ea.org_unit_id IS DISTINCT FROM bak.org_unit_id
    OR ea.operation_unit_id IS DISTINCT FROM bak.operation_unit_id
    OR ea.position_id IS DISTINCT FROM bak.position_id);
```

### 8.4 一致性验证清单

| # | 验证项 | 目标 | 通过 |
|---|--------|------|------|
| C1 | employee_assignment 总记录 | ≈1304 | □ |
| C2 | 迁移标记记录数 | ≈1304 | □ |
| C3 | employee 关联完整性 | 0 | □ |
| C4 | position 关联完整性 | 0 | □ |
| C5 | org_unit 关联完整性 | 0 | □ |
| C6 | op_unit 关联完整性 | 0 | □ |
| C7 | hse_employee_relation vs employee_assignment 差异 | 0 | □ |
| C8 | UPSERT 覆盖范围已记录 | 数值已记录 | □ |
| C9 | status 分布合理 | 与源一致 | □ |
| C10 | employee_code 唯一性 | 无重复 | □ |

---

## 九、代码切换准备清单（v2 修订）

### 9.1 后端代码改造清单

#### 文件：[server/routes/hse-employee.js](file:///F:/hse-dashboard/server/routes/hse-employee.js)

> **重要发现（v2）**：经全项目扫描，**hse_employee_org 仅在 hse-employee.js 中被业务代码使用**。其他业务模块（hazards.js, hse-assessment.js, hse-dashboard.js, hse-driver-risk-center.js, hse-accident-analysis.js, hse-assessment-analysis.js）已全部使用 employee_assignment。

| # | 行号 | 接口 | 当前数据源 | 目标数据源 | 风险 | 修改方式 |
|---|------|------|-----------|-----------|------|----------|
| 1 | 504 | GET /employees/stats | hse_employee_org | employee_assignment | 🔴 高 | status 枚举转换（在职→active） |
| 2 | 542 | GET /employees 列表 | hse_employee_org | employee_assignment | 🟡 中 | JOIN + 字段映射 |
| 3 | 693 | PUT /employees/:id/transfer | hse_employee_org | employee_assignment | 🔴 高 | UPDATE 目标+字段 |
| 4 | 734-742 | GET /employees/dept-ids | hse_employee_org | employee_assignment | 🔴 高 | 5处 SELECT 改两级 |
| 5 | 820 | GET /employees 列表 | hse_employee_org | employee_assignment | 🟡 中 | JOIN 变更 |
| 6 | 833 | GET /employees 列表 | hse_employee_org | employee_assignment | 🟡 中 | JOIN 变更 |
| 7 | 1106 | GET /employees/:id/assignments | hse_employee_org | employee_assignment | 🟡 中 | 字段映射 |
| 8 | 1135 | GET /employees/:id/assignments | hse_employee_org | employee_assignment | 🟡 中 | 字段映射 |
| 9 | 1175 | GET /employees/:id/current-org | hse_employee_org | employee_assignment | 🟡 中 | WHERE 条件 |
| 10 | 1193 | PUT /employees/:id/transfer | hse_employee_org | employee_assignment | 🔴 高 | UPDATE 目标 |
| 11 | 1205 | POST /employees 新增组织关系 | hse_employee_org | employee_assignment | 🔴 高 | INSERT 字段映射 |
| 12 | 1257 | GET /employees/assignments/:id | hse_employee_org | employee_assignment | 🟡 中 | 字段映射 |
| 13 | 1272 | PUT /employees/assignments/:id/status | hse_employee_org | employee_assignment | 🟡 中 | UPDATE 目标 |
| 14 | 1278 | PUT /employees/assignments/:id/status | hse_employee_org | employee_assignment | 🟡 中 | UPDATE 目标 |
| 15 | 1677 | POST /employees/import | hse_employee_org | employee_assignment | 🔴 高 | UPDATE 目标 |
| 16 | 1683 | POST /employees/import | hse_employee_org | employee_assignment | 🔴 高 | INSERT 字段映射 |
| 17 | 4297 | GET /employees 列表 | hse_employee_org | employee_assignment | 🟡 中 | JOIN 变更 |

#### 其他后端文件（v2 新增扫描结果）

| 文件 | 数据源 | 状态 | 是否需迁移 |
|------|--------|------|-----------|
| [hse-accident-analysis.js](file:///F:/hse-dashboard/server/routes/hse-accident-analysis.js) | employee_assignment | ✅ 已迁移 | 否 |
| [hse-assessment-analysis.js](file:///F:/hse-dashboard/server/routes/hse-assessment-analysis.js) | employee_assignment | ✅ 已迁移 | 否 |
| [hse-assessment.js](file:///F:/hse-dashboard/server/routes/hse-assessment.js) | employee_assignment | ✅ 已迁移 | 否 |
| [hse-dashboard.js](file:///F:/hse-dashboard/server/routes/hse-dashboard.js) | employee_assignment | ✅ 已迁移 | 否 |
| [hse-driver-risk-center.js](file:///F:/hse-dashboard/server/routes/hse-driver-risk-center.js) | employee_assignment | ✅ 已迁移 | 否 |
| [hazards.js](file:///F:/hse-dashboard/server/routes/hazards.js) | employee_assignment | ✅ 已迁移 | 否 |
| [emergency.js](file:///F:/hse-dashboard/server/routes/emergency.js) | emergency_team_members（无关） | ✅ 无需迁移 | 否 |

### 9.2 前端代码改造清单（v2 修订）

#### v2 扫描结果

| # | 文件 | 检查结果 | 风险 | 修改方式 |
|---|------|----------|------|----------|
| 1 | [EmployeeSelector.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/components/hse/EmployeeSelector.vue#L113) | ✅ 仅使用 org_unit_id | 无 | 无需修改 |
| 2 | [employee-selector.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/employee-selector.ts#L18-L29) | ✅ 使用 org_unit_id / operation_unit_id | 无 | 无需修改 |
| 3 | [OrgTransferModal.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/employee/components/OrgTransferModal.vue#L116) | ⚠️ **仍使用 team_id** | 🟡 中 | 字段映射调整 |
| 4 | [employee.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/employee.ts#L55-L64) | ⚠️ **类型定义含 group_id 等 5 字段** | 🟡 中 | 类型定义清理 |
| 5 | employee/index.vue | ✅ 无 group_id/region_id | 无 | 无需修改 |
| 6 | employee/departments.vue | ✅ 无 group_id/region_id | 无 | 无需修改 |

#### 重点确认项（v2 修订）

```
□ EmployeeSelector.vue：✅ 已使用 org_unit_id，无需修改

□ OrgTransferModal.vue：⚠️ 需修改
  - L116: form.team_id → 需改为 org_unit_id 或 operation_unit_id
  - L200: form.value.team_id → 同步修改
  - L213: payload.team_id → 同步修改
  - 注意：调岗逻辑当前仅传 team_id（最末级部门），需确认迁移后应传 org_unit_id 还是 operation_unit_id

□ employee.ts：⚠️ 需修改
  - L55-64: EmployeeDetail.org 接口含 group_id/region_id/enterprise_id/project_id/team_id
  - L169-173: OrgAssignFormData 接口含 5 个旧字段
  - 需替换为 org_unit_id / operation_unit_id

□ employee-selector.ts：✅ 已使用新字段，无需修改
```

---

## 十、旧模型冻结方案

### 10.1 hse_employee_org 冻结策略

**原则**：不删除表，通过**权限控制 + 迁移记录表**实现逻辑冻结。

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
    ('B2_20260728_0200', 'hse_employee_relation', 'employee_assignment', 1304, 'completed', NOW(), 'system_migration', 'Sprint-B B-2 数据迁移');
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
    ('FREEZE_20260728_0300', 'hse_employee_org', 'FROZEN', 0, 'completed', NOW(), 'system_freeze', 'Sprint-B 冻结 hse_employee_org：撤销写入权限，保留只读');
```

### 10.2 personnel.js 冻结策略

| 项 | 方案 |
|----|------|
| 路由注册 | 保留 `/api/personnel` 路由注册 |
| 路由标记 | 添加 `@deprecated` 标注 |
| 数据表处理 | personnel 表冻结，撤销写入权限 |
| 调用监控 | 每个接口添加调用日志 |
| 下线计划 | 观察 2 周后下线 |

---

## 十一、完整回滚方案

### 11.1 回滚触发条件

| # | 触发条件 | 严重等级 |
|---|----------|----------|
| R1 | Step 0 检查任一不通过 | **P0** |
| R2 | B-0 恢复影响行数不在 [1285, 1310] 范围 | **P0** |
| R3 | B-1 前置检查任一不通过 | **P0** |
| R4 | B-2 迁移后验证任一不通过 | **P0** |
| R5 | 迁移后应用启动失败或核心功能异常 | **P0** |
| R6 | 业务方反馈数据明显异常 | **P1** |

### 11.2 回滚步骤

#### Rollback Phase 1：应用层回滚

```bash
pm2 stop all
cd F:\hse-dashboard\安全看板vben
git checkout sprint-b-migration-pre
pm2 start
```

#### Rollback Phase 2：数据层回滚

```sql
-- Phase 2-A: 回滚 B-2（删除迁移写入的数据）
DELETE FROM employee_assignment WHERE created_by = 'system_migration_b2';

-- 或从备份恢复（若需恢复迁移前的非本次迁移数据）
-- DROP TABLE IF EXISTS employee_assignment;
-- CREATE TABLE employee_assignment AS SELECT * FROM employee_assignment_b2_backup;

-- Phase 2-B: 回滚 B-0（从 temp_b0_recover_ids 精准定位）
-- 注意：必须在同一会话中执行
UPDATE employee
SET is_deleted = true, updated_at = NOW()
WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids)
  AND is_deleted = false;

-- Phase 2-C: 验证回滚结果
SELECT COUNT(*) AS remaining_migrations
FROM employee_assignment WHERE created_by = 'system_migration_b2';
-- 预期：0

SELECT
    COUNT(*) AS total_in_temp,
    COUNT(CASE WHEN e.is_deleted = true THEN 1 END) AS re_deleted
FROM temp_b0_recover_ids t
JOIN employee e ON e.id = t.employee_id;
-- 预期：re_deleted = total_in_temp
```

#### Rollback Phase 3：权限回滚

```sql
GRANT INSERT, UPDATE, DELETE ON hse_employee_org TO hse_app_user;
GRANT USAGE, SELECT ON SEQUENCE hse_employee_org_id_seq TO hse_app_user;
GRANT INSERT, UPDATE, DELETE ON personnel TO hse_app_user;
GRANT USAGE, SELECT ON SEQUENCE personnel_id_seq TO hse_app_user;
DROP TABLE IF EXISTS employee_assignment_migration_log;
```

### 11.3 回滚验证

| # | 验证项 | 目标 | 通过 |
|---|--------|------|------|
| RB1 | employee_assignment 中无迁移数据 | 0 | □ |
| RB2 | 临时表员工已回滚 | re_deleted=total | □ |
| RB3 | hse_employee_org 写入权限已恢复 | INSERT 测试通过 | □ |
| RB4 | personnel 写入权限已恢复 | INSERT 测试通过 | □ |
| RB5 | 应用功能正常 | 核心接口测试通过 | □ |

---

## 十二、上线观察指标

### 12.1 观察窗口

- **观察期**：迁移完成后 **72 小时**
- **观察时段**：每 2 小时检查一次

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

## 附录 A：v1.0 → v2.0 修订记录

| # | 章节 | 修订内容 | 修订原因 |
|---|------|----------|----------|
| 1 | 第三章 | **新增 Step 0 迁移前强制检查**（7 项） | 审计报告建议新增检查项 |
| 2 | 第四章 | **B-0 修复 updated_by 问题**，新增临时表方案 | employee 表无 updated_by 字段（P0） |
| 3 | 第四章 | **B-0 回滚改为从临时表读取 ID** | 精准定位回滚范围（P1） |
| 4 | 第四章 | **新增会话断开应急方案** | 临时表丢失的应急恢复 |
| 5 | 第五章 | B-0 验证清单新增 V1（临时表）、V2（恢复验证）、V9（临时表存在性） | 适配临时表方案 |
| 6 | 第七章 | **B-2 新增 status 完整映射表**（含中文枚举） | 审计报告建议补充 |
| 7 | 第七章 | **B-2 新增 UPSERT 覆盖风险说明** | 审计报告 P1 风险 |
| 8 | 第七章 | **B-2 Step 1 备份改为强制** | 配合 UPSERT 风险控制 |
| 9 | 第八章 | **新增数据差异验证**（C7、C8） | 验证迁移完整性和覆盖范围 |
| 10 | 第九章 | **后端清单新增其他文件扫描结果** | 确认仅 hse-employee.js 需迁移 |
| 11 | 第九章 | **前端清单新增 employee.ts 和 OrgTransferModal.vue 详细分析** | 发现 team_id 残留 |

---

## 附录 B：执行时间线（v2 修订）

| 阶段 | 内容 | 预估时间 | 执行窗口 |
|------|------|----------|----------|
| T-1 | 前置检查 + 数据库备份 | 30 分钟 | D-1 下午 |
| T-0 | 停机 + 确认无活跃连接 | 15 分钟 | D 日 02:00 |
| T-1 | **Step 0 迁移前强制检查**（v2 新增） | 15 分钟 | D 日 02:15 |
| T-2 | B-0 Employee 恢复（含临时表创建） | 20 分钟 | D 日 02:30 |
| T-3 | B-0 验证 | 10 分钟 | D 日 02:50 |
| T-4 | B-1 前置强制检查 | 10 分钟 | D 日 03:00 |
| T-5 | B-2 数据迁移（含备份） | 20 分钟 | D 日 03:10 |
| T-6 | B-2 验证 + 数据一致性验证 | 25 分钟 | D 日 03:30 |
| T-7 | 旧模型冻结 | 10 分钟 | D 日 03:55 |
| T-8 | 启动应用 + 冒烟测试 | 20 分钟 | D 日 04:05 |
| T-9 | 上线观察 | 72 小时 | D 日 04:25 起 |
| **总计** | | **≈ 2.75 小时** | |

---

> **文档结束**
> 本 Runbook v2 已修复 v1.0 的所有 P0/P1 级问题，需经数据迁移负责人、后端负责人、前端负责人三方签字确认后方可执行。
