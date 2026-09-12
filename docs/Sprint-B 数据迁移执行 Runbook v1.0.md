# Sprint-B 数据迁移执行 Runbook v1.0

> **编制人**：Sprint-B 实施负责人
> **审核人**：数据库架构师、后端负责人、前端负责人
> **编制日期**：2026-07-28
> **版本**：v1.0
> **状态**：待审核

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

---

## 二、数据库备份方案

### 2.1 备份策略

执行任何迁移操作前，**必须完成以下全量备份**。备份文件按 `日期_时间_库名_操作类型.dump` 格式命名。

### 2.2 备份脚本

```bash
# Step 1: 停止后端应用服务
# 在服务器上执行：
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
# 预期：完整备份 > 100MB，关键表备份 > 1MB

# Step 5: 记录备份校验值
# 保存文件列表、大小、MD5/SHA256 到 F:\backup\20260728_0200_backup_manifest.txt
```

### 2.3 备份完整性验证

| 备份项 | 预期大小 | 实际大小 | 校验通过 |
|--------|----------|----------|----------|
| 全量数据库 | > 100MB | ____MB | □ |
| 关键表集合 | > 1MB | ____MB | □ |
| 备份清单 | 完整 | - | □ |

> **校验不通过则暂停，重新执行备份。**

---

## 三、B-0 Employee 恢复执行步骤

### 3.1 目标

恢复 `employee` 表中被软删除（`is_deleted = true`）但被旧模型引用的员工记录，使其可作为 `employee_assignment` 的有效外键。

### 3.2 恢复来源（并集策略）

从以下两个来源的 `employee_id` 并集确定恢复范围：

1. **来源 A**：`hse_employee_relation.employee_id`（1304 条记录）
2. **来源 B**：`hse_employee_org.employee_id`（1285 条当前记录）

### 3.3 Step 0-1：恢复前数据快照

```sql
-- ================================================================
-- B-0 Step 1: 恢复前数据快照（只读查询，不修改数据）
-- ================================================================

-- 1.1 employee 表总体状态
SELECT
    COUNT(*) AS total_employees,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_employees,
    COUNT(CASE WHEN is_deleted = true THEN 1 END) AS deleted_employees
FROM employee;

-- 1.2 需要恢复的员工 ID 清单（并集去重）
SELECT DISTINCT employee_id
FROM (
    SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
    UNION
    SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
) AS source_union
ORDER BY employee_id;

-- 1.3 需要恢复的员工数量
SELECT COUNT(DISTINCT employee_id) AS recoverable_count
FROM (
    SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
    UNION
    SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
) AS source_union
WHERE employee_id IN (SELECT id FROM employee WHERE is_deleted = true);

-- 1.4 已活跃员工（无需恢复）
SELECT COUNT(DISTINCT employee_id) AS already_active
FROM (
    SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
    UNION
    SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
) AS source_union
WHERE employee_id IN (SELECT id FROM employee WHERE is_deleted = false);
```

**预期结果**：
- `recoverable_count` ≈ 1304（取 A∪B 并集中 is_deleted=true 的数量）
- `already_active` ≈ 0（根据审计结果，所有被引用的员工均已软删）

**实际结果记录**：
- recoverable_count: ____
- already_active: ____
- 差异说明: ____

### 3.4 Step 0-2：执行恢复 SQL

```sql
-- ================================================================
-- B-0 Step 2: 恢复 employee 表中的软删员工
-- 前置条件：已完成数据库全量备份
-- ================================================================

BEGIN;

UPDATE employee
SET is_deleted = false,
    updated_at = NOW(),
    updated_by = 'system_migration_b0'
WHERE id IN (
    SELECT DISTINCT employee_id
    FROM (
        SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
        UNION
        SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
    ) AS source_union
    AND is_deleted = true
);

-- 检查影响行数
GET DIAGNOSTICS rec_count = ROW_COUNT;

COMMIT;
-- 若 rec_count 不在 [1285, 1310] 范围内，则 ROLLBACK 并排查
```

**影响行数校验**：
- 最小预期：1285（hse_employee_org 独立员工数）
- 最大预期：1310（hse_employee_relation + hse_employee_org 并集，含少量新增）
- **超出范围则立即 ROLLBACK**

**实际影响行数**：____

### 3.5 Step 0-3：恢复后验证 SQL

```sql
-- ================================================================
-- B-0 Step 3: 恢复后验证（必须全部通过）
-- ================================================================

-- 3.1 employee 活跃数量验证
SELECT
    COUNT(*) AS total_employees,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_employees,
    COUNT(CASE WHEN is_deleted = true THEN 1 END) AS deleted_employees
FROM employee;

-- □ 验证通过：active_employees 应比恢复前增加 ≈1304

-- 3.2 hse_employee_relation → employee 关联完整性
SELECT COUNT(*) AS missing_employee_refs
FROM hse_employee_relation her
LEFT JOIN employee e ON her.employee_id = e.id AND e.is_deleted = false
WHERE her.is_deleted = false AND e.id IS NULL;

-- □ 验证通过：missing_employee_refs = 0

-- 3.3 hse_employee_org → employee 关联完整性
SELECT COUNT(*) AS missing_org_refs
FROM hse_employee_org heo
LEFT JOIN employee e ON heo.employee_id = e.id AND e.is_deleted = false
WHERE heo.is_deleted = false AND heo.is_current = true AND e.id IS NULL;

-- □ 验证通过：missing_org_refs = 0

-- 3.4 employee_code 唯一性检查（确保无重复工号）
SELECT employee_code, COUNT(*) AS dup_count
FROM employee
WHERE is_deleted = false AND employee_code IS NOT NULL
GROUP BY employee_code
HAVING COUNT(*) > 1;

-- □ 验证通过：查询结果为空集

-- 3.5 加密字段可解密性检查（抽样）
SELECT id, id_card, phone FROM employee WHERE is_deleted = false LIMIT 10;
-- □ 验证通过：id_card 和 phone 字段以 "ENC:" 开头，格式可识别
```

**验证结果记录表**：

| 验证项 | 预期 | 实际 | 通过 |
|--------|------|------|------|
| employee 活跃数量 | ≈1304+ | ____ | □ |
| relation→employee 完整性 | 0 | ____ | □ |
| org→employee 完整性 | 0 | ____ | □ |
| employee_code 唯一性 | 无重复 | ____ | □ |
| 加密字段格式 | ENC: 开头 | ____ | □ |

### 3.6 Step 0-4：B-0 回滚 SQL

如果恢复验证失败，执行以下回滚：

```sql
-- ================================================================
-- B-0 回滚脚本
-- ================================================================

BEGIN;

UPDATE employee
SET is_deleted = true,
    updated_at = NOW(),
    updated_by = 'system_migration_b0_rollback'
WHERE id IN (
    SELECT DISTINCT employee_id
    FROM (
        SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
        UNION
        SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
    ) AS source_union
    AND is_deleted = false
    AND updated_by = 'system_migration_b0'
);

COMMIT;

-- 验证回滚
SELECT COUNT(*) AS re_deleted
FROM employee
WHERE updated_by = 'system_migration_b0_rollback';
-- □ 验证通过：re_deleted > 0
```

---

## 四、B-0 验证清单

> B-0 恢复完成后，必须逐项确认以下清单。全部通过方可进入 B-1 / B-2。

| # | 验证项 | 验证 SQL | 目标 | 通过 |
|---|--------|----------|------|------|
| V1 | employee 活跃员工数 | `SELECT COUNT(*) FROM employee WHERE is_deleted=false` | > 恢复前 + 1285 | □ |
| V2 | hse_employee_relation 引用完整性 | `SELECT COUNT(*) FROM hse_employee_relation her LEFT JOIN employee e ON her.employee_id=e.id AND e.is_deleted=false WHERE her.is_deleted=false AND e.id IS NULL` | 0 | □ |
| V3 | hse_employee_org 引用完整性 | `SELECT COUNT(*) FROM hse_employee_org heo LEFT JOIN employee e ON heo.employee_id=e.id AND e.is_deleted=false WHERE heo.is_deleted=false AND heo.is_current=true AND e.id IS NULL` | 0 | □ |
| V4 | employee_code 唯一性 | `SELECT employee_code FROM employee WHERE is_deleted=false AND employee_code IS NOT NULL GROUP BY employee_code HAVING COUNT(*)>1` | 空结果 | □ |
| V5 | id_card 加密格式 | `SELECT id FROM employee WHERE is_deleted=false AND id_card IS NOT NULL AND id_card NOT LIKE 'ENC:%'` | 空结果 | □ |
| V6 | phone 加密格式 | `SELECT id FROM employee WHERE is_deleted=false AND phone IS NOT NULL AND phone NOT LIKE 'ENC:%'` | 空结果 | □ |
| V7 | 回滚脚本就绪 | 3.6 节回滚 SQL 已保存至单独文件 | 文件存在 | □ |

**验证负责人签字**：______________ 日期：__________

---

## 五、B-1 组织模型验证

> 在执行 B-2 迁移前，必须完成组织模型关联有效性验证。此步骤为**只读检查**，不修改数据。

### 5.1 Step 1：employee_relation → employee 关联检查

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

### 5.2 Step 2：position_id 有效性检查

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

**目标**：`invalid_positions = 0`（所有 position_id 在 position 表中有效）

**实际**：____ / ____  **通过**：□

### 5.3 Step 3：org_unit_id 有效性检查

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

**目标**：`invalid_org_units = 0`（所有 org_unit_id 在 hse_org_unit 中有效）

**实际**：____ / ____  **通过**：□

### 5.4 Step 4：operation_unit_id 有效性检查

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

**目标**：`invalid_op_units = 0`（非 NULL 的 operation_unit_id 必须全部有效；允许 NULL）

**实际**：____ / ____ / ____  **通过**：□

### 5.5 B-1 验证结论

| # | 检查项 | 结果 | 通过 |
|---|--------|------|------|
| 1 | employee 关联完整性 | ____ | □ |
| 2 | position_id 有效性 | ____ | □ |
| 3 | org_unit_id 有效性 | ____ | □ |
| 4 | operation_unit_id 有效性 | ____ | □ |

**B-1 负责人签字**：______________ 日期：__________

---

## 六、B-2 employee_assignment 迁移执行步骤

### 6.1 迁移概述

| 项 | 说明 |
|----|------|
| 来源表 | `hse_employee_relation` |
| 目标表 | `employee_assignment` |
| 迁移记录数 | ≈ 1304 |
| 迁移标记 | `created_by = 'system_migration_b2'` |
| 前置条件 | B-0 恢复完成、B-1 验证通过 |
| 冲突处理 | upsert（重复记录覆盖更新） |

### 6.2 字段映射表

| 序号 | 目标字段（employee_assignment） | 来源字段（hse_employee_relation） | 转换规则 | 备注 |
|------|----------------------------------|-----------------------------------|----------|------|
| 1 | employee_id | employee_id | 直接映射 | |
| 2 | org_unit_id | org_unit_id | 直接映射 | 必须 NOT NULL |
| 3 | operation_unit_id | operation_unit_id | 直接映射 | 允许 NULL |
| 4 | position_id | position_id | 直接映射 | 必须 NOT NULL |
| 5 | supervisor_id | supervisor_id | 直接映射 | 允许 NULL |
| 6 | status | status | 转换（见 6.3） | 枚举映射 |
| 7 | is_current | is_current | 直接映射 | boolean |
| 8 | is_primary | is_primary | 直接映射 | boolean |
| 9 | start_date | start_date | 直接映射 | date |
| 10 | end_date | end_date | 直接映射 | date，允许 NULL |
| 11 | remark | remark | 直接映射 | varchar，允许 NULL |
| 12 | created_by | 常量 | 'system_migration_b2' | 迁移标记 |
| 13 | created_at | created_at | 直接映射 | 保留原始时间 |
| 14 | updated_at | 常量 | NOW() | |
| 15 | is_deleted | 常量 | false | |

### 6.3 status 转换规则

| 源值（hse_employee_relation.status） | 目标值（employee_assignment.status） | 说明 |
|--------------------------------------|--------------------------------------|------|
| 'active' | 'active' | 在职：保持不变 |
| 'pending' | 'pending' | 待入职：保持不变 |
| 'inactive' | 'inactive' | 已停用：保持不变 |
| NULL / 空值 | 'active' | 默认值兜底 |
| 其他未知值 | 'active' | 默认值兜底，**需记录到异常日志** |

```sql
-- status 分布检查（迁移前执行，确认分布）
SELECT status, COUNT(*) AS cnt
FROM hse_employee_relation
WHERE is_deleted = false
GROUP BY status
ORDER BY cnt DESC;
```

**预期分布**：全部为 `active`（根据审计结果）

**实际分布**：____

### 6.4 Step 1：迁移前备份 employee_assignment

```sql
-- 备份目标表当前数据（如存在）
CREATE TABLE IF NOT EXISTS employee_assignment_b2_backup AS
SELECT * FROM employee_assignment WHERE 1 = 0;

INSERT INTO employee_assignment_b2_backup
SELECT * FROM employee_assignment;

-- 记录备份数量
SELECT COUNT(*) AS backup_count FROM employee_assignment_b2_backup;
```

**备份记录数**：____

### 6.5 Step 2：执行迁移 SQL

```sql
-- ================================================================
-- B-2 Step 2: 从 hse_employee_relation 迁移至 employee_assignment
-- 冲突策略：upsert（基于 employee_id + org_unit_id + is_current 唯一判定）
-- ================================================================

BEGIN;

-- 6.5.1 主迁移：INSERT ... ON CONFLICT DO UPDATE
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

-- 6.5.2 异常记录：status 为未知值的记录
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

### 6.6 Step 3：重复处理策略

| 场景 | 处理方式 | SQL 实现 |
|------|----------|----------|
| employee_assignment 中已存在同一 employee_id 的主岗记录 | 覆盖更新（UPSERT） | `ON CONFLICT (employee_id) WHERE is_primary=true AND is_current=true` |
| hse_employee_relation 中同一 employee_id 有多条记录 | 仅迁移 `is_current=true` 的记录 | WHERE 子句过滤 |
| employee_assignment 中存在软删记录 | 恢复为活跃记录 | DO UPDATE SET is_deleted=false |

### 6.7 Step 4：异常记录策略

异常记录写入 `b2_anomaly_log` 临时表，迁移完成后导出保存。

**异常记录导出 SQL**：
```sql
SELECT * FROM b2_anomaly_log ORDER BY employee_id;
```

**异常处理**：
1. 导出异常记录为 CSV 文件：`F:\backup\20260728_0200_b2_anomaly.csv`
2. 逐条审核异常记录
3. 未知 status 标记为 `active` 的记录，需业务方确认合理性
4. 所有异常记录必须在迁移报告中详细说明

### 6.8 B-2 回滚 SQL

```sql
-- ================================================================
-- B-2 回滚脚本：删除本次迁移写入的所有记录
-- ================================================================

BEGIN;

DELETE FROM employee_assignment
WHERE created_by = 'system_migration_b2';

-- 验证删除行数
GET DIAGNOSTICS rollback_count = ROW_COUNT;

COMMIT;

-- 若需恢复迁移前数据：
-- INSERT INTO employee_assignment
-- SELECT * FROM employee_assignment_b2_backup;
```

**回滚影响行数**：____

---

## 七、迁移后数据一致性验证

> B-2 迁移完成后，执行以下全量验证。

### 7.1 数据完整性验证

```sql
-- 7.1 employee_assignment 总记录数
SELECT
    COUNT(*) AS total,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active,
    COUNT(CASE WHEN is_current = true AND is_deleted = false THEN 1 END) AS current_active
FROM employee_assignment;
```

**预期**：total ≈ 1304, current_active ≈ 1304
**实际**：____ / ____

### 7.2 关联完整性验证

```sql
-- 7.2 employee_assignment → employee 完整性
SELECT COUNT(*) AS missing_employee
FROM employee_assignment ea
LEFT JOIN employee e ON ea.employee_id = e.id AND e.is_deleted = false
WHERE ea.is_deleted = false AND e.id IS NULL;

-- □ 通过：0

-- 7.3 employee_assignment → position 完整性
SELECT COUNT(*) AS missing_position
FROM employee_assignment ea
LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
WHERE ea.is_deleted = false AND p.id IS NULL;

-- □ 通过：0

-- 7.4 employee_assignment → hse_org_unit 完整性
SELECT COUNT(*) AS missing_org
FROM employee_assignment ea
LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
WHERE ea.is_deleted = false AND ou.id IS NULL;

-- □ 通过：0

-- 7.5 employee_assignment → hse_operation_unit 完整性（允许 NULL）
SELECT COUNT(*) AS missing_op_unit
FROM employee_assignment ea
LEFT JOIN hse_operation_unit opu ON ea.operation_unit_id = opu.id AND opu.is_deleted = false
WHERE ea.is_deleted = false AND ea.operation_unit_id IS NOT NULL AND opu.id IS NULL;

-- □ 通过：0
```

### 7.3 数据分布验证

```sql
-- 7.6 status 分布
SELECT status, COUNT(*) AS cnt
FROM employee_assignment WHERE is_deleted = false GROUP BY status;

-- 7.7 is_primary 分布
SELECT is_primary, COUNT(*) AS cnt
FROM employee_assignment WHERE is_deleted = false GROUP BY is_primary;

-- 7.8 is_current 分布
SELECT is_current, COUNT(*) AS cnt
FROM employee_assignment WHERE is_deleted = false GROUP BY is_current;

-- 7.9 org_unit_id 覆盖度（与 hse_employee_relation 对比）
SELECT
    (SELECT COUNT(DISTINCT org_unit_id) FROM hse_employee_relation WHERE is_deleted=false) AS src_org_units,
    (SELECT COUNT(DISTINCT org_unit_id) FROM employee_assignment WHERE is_deleted=false) AS tgt_org_units;

-- 7.10 operation_unit_id 覆盖度
SELECT
    (SELECT COUNT(DISTINCT operation_unit_id) FROM hse_employee_relation WHERE is_deleted=false AND operation_unit_id IS NOT NULL) AS src_op_units,
    (SELECT COUNT(DISTINCT operation_unit_id) FROM employee_assignment WHERE is_deleted=false AND operation_unit_id IS NOT NULL) AS tgt_op_units;
```

### 7.4 一致性验证清单

| # | 验证项 | SQL | 目标 | 通过 |
|---|--------|-----|------|------|
| C1 | employee_assignment 总记录 | COUNT(\*) | ≈1304 | □ |
| C2 | employee 关联完整性 | LEFT JOIN employee | 0 | □ |
| C3 | position 关联完整性 | LEFT JOIN position | 0 | □ |
| C4 | org_unit 关联完整性 | LEFT JOIN hse_org_unit | 0 | □ |
| C5 | op_unit 关联完整性 | LEFT JOIN hse_operation_unit | 0 | □ |
| C6 | org_unit 覆盖度 | COUNT DISTINCT | 与源一致 | □ |
| C7 | op_unit 覆盖度 | COUNT DISTINCT | 与源一致 | □ |
| C8 | status 分布 | GROUP BY | 合理 | □ |
| C9 | 迁移标记 | created_by | 全部为 system_migration_b2 | □ |
| C10 | employee_code 唯一性 | GROUP BY HAVING | 无重复 | □ |

**验证负责人签字**：______________ 日期：__________

---

## 八、代码切换准备清单

> 本章节仅描述代码需要修改的位置与风险点，**不执行代码修改**。代码切换应在数据迁移验证通过后的独立 Sprint 内完成。

### 8.1 后端代码改造清单

#### 文件：`server/routes/hse-employee.js`

| # | 行号 | 当前用途 | 目标表 | 修改目的 | 风险点 |
|---|------|----------|--------|----------|--------|
| 1 | 504 | 员工状态统计（`FROM hse_employee_org eo`） | employee_assignment | 切换状态统计来源 | status 枚举需对齐（旧：在职/离职，新：active/inactive） |
| 2 | 542 | 员工列表查询（`JOIN hse_employee_org eo`） | employee_assignment | 切换列表数据源 | 字段名变更：group_id→org_unit_id，region_id→operation_unit_id |
| 3 | 693 | 调岗关闭旧记录（`UPDATE hse_employee_org SET is_current=false`） | employee_assignment | 切换调岗逻辑 | 需同步修改 WHERE 条件和字段名 |
| 4 | 734-742 | 按组织层级查询（5处 SELECT eo.group_id/region_id 等） | employee_assignment | 切换组织查询 | 五级组织→两级组织，需调整查询逻辑 |
| 5 | 820 | 员工列表查询（`JOIN hse_employee_org eo`） | employee_assignment | 切换列表数据源 | 字段对齐 |
| 6 | 833 | 员工列表查询（`JOIN hse_employee_org eo`） | employee_assignment | 切换列表数据源 | 字段对齐 |
| 7 | 1106 | 组织关系列表查询 | employee_assignment | 切换数据源 | 字段对齐 |
| 8 | 1135 | 组织关系列表查询 | employee_assignment | 切换数据源 | 字段对齐 |
| 9 | 1175 | 查询当前组织关系 | employee_assignment | 切换数据源 | 字段对齐 |
| 10 | 1193 | 调岗关闭旧记录（UPDATE） | employee_assignment | 切换操作目标 | 字段对齐 |
| 11 | 1205 | 新增组织关系（INSERT） | employee_assignment | 切换写入目标 | 字段名映射：group_id→org_unit_id, region_id→operation_unit_id |
| 12 | 1257 | 查询组织关系详情 | employee_assignment | 切换数据源 | 字段对齐 |
| 13 | 1272 | 更新状态（UPDATE） | employee_assignment | 切换操作目标 | 字段对齐 |
| 14 | 1278 | 更新状态（UPDATE） | employee_assignment | 切换操作目标 | 字段对齐 |
| 15 | 1677 | 导入关闭旧记录（UPDATE） | employee_assignment | 切换操作目标 | 字段对齐 |
| 16 | 1683 | 导入新增记录（INSERT） | employee_assignment | 切换写入目标 | 字段映射 |
| 17 | 4297 | 员工列表查询（JOIN） | employee_assignment | 切换数据源 | 字段对齐 |

**后端风险评估**：
- **高风险**：#3, #10, #15（UPDATE 操作）：调岗/导入逻辑，需确保并发安全
- **高风险**：#4（5处 SELECT）：组织层级查询逻辑变更，影响所有组织筛选功能
- **中风险**：#11, #16（INSERT 操作）：写入逻辑变更，需确保字段映射正确
- **中风险**：#2, #5, #6, #7, #8, #9, #12, #17（SELECT 查询）：列表展示功能，影响 UI 渲染

### 8.2 前端代码改造清单

| # | 文件路径 | 需要检查 | 修改类型 | 风险点 |
|---|----------|----------|----------|--------|
| 1 | `components/hse/EmployeeSelector.vue` | 确认 API 返回字段是否包含 `group_id`/`region_id`，或已全部切换为 `org_unit_id`/`operation_unit_id` | 可能需调整字段映射 | 高：影响 7 个业务页面的员工选择 |
| 2 | `api/hse/employee-selector.ts` | 确认 TypeScript 类型定义与后端 API 返回一致 | 类型定义调整 | 中：TypeScript 编译错误 |
| 3 | `views/hse/employee/components/OrgTransferModal.vue` | 确认调岗提交字段（`group_id`/`region_id` → `org_unit_id`/`operation_unit_id`） | 字段映射调整 | 高：调岗功能核心 |
| 4 | `views/hse/employee/index.vue` | 确认列表展示字段 | 可能需调整 | 低：展示层 |
| 5 | `views/hse/employee/departments.vue` | 确认部门管理页字段 | 可能需调整 | 低：展示层 |

**前端重点确认项**：

```
□ EmployeeSelector.vue 是否使用 group_id / region_id ？
  → 是：需修改为 org_unit_id / operation_unit_id
  → 否：无需修改

□ OrgTransferModal.vue 提交字段是否为 group_id / region_id ？
  → 是：需修改为 org_unit_id / operation_unit_id
  → 否：无需修改

□ employee-selector.ts 类型定义是否包含旧字段？
  → 是：需同步更新
  → 否：无需修改
```

### 8.3 代码切换前置条件

| # | 条件 | 状态 |
|---|------|------|
| 1 | B-2 迁移数据验证全部通过 | □ |
| 2 | employee_assignment 数据与 hse_employee_relation 一致 | □ |
| 3 | 后端 API 已就绪（需新建 employee_assignment 查询接口） | □ |
| 4 | 前端类型定义已同步 | □ |
| 5 | 单元测试已通过 | □ |
| 6 | 联调测试已通过 | □ |

---

## 九、旧模型冻结方案

### 9.1 hse_employee_org 冻结策略

**原则**：不删除表，通过**权限控制 + 迁移记录表**实现逻辑冻结。

#### 9.1.1 冻结实施

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

COMMENT ON TABLE employee_assignment_migration_log IS '员工任职关系迁移记录表（用于旧模型冻结与审计）';

-- 记录本次迁移
INSERT INTO employee_assignment_migration_log
    (migration_id, source_table, target_table, record_count, status, completed_at, completed_by, remark)
VALUES
    ('B2_20260728_0200', 'hse_employee_relation', 'employee_assignment', 1304, 'completed', NOW(), 'system_migration', 'Sprint-B B-2 数据迁移');
```

#### 9.1.2 冻结后权限控制

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

#### 9.1.3 冻结后业务规则

| 规则 | 说明 |
|------|------|
| 禁止 INSERT | 应用层禁止向 hse_employee_org 写入新记录 |
| 禁止 UPDATE | 应用层禁止修改 hse_employee_org 现有记录 |
| 禁止 DELETE | 应用层禁止删除 hse_employee_org 记录 |
| 允许 SELECT | 保留查询权限，供历史数据追溯 |
| 数据保留 | 表结构和数据完整保留，不做任何 DDL 变更 |
| 回滚依据 | 若需回滚，以 hse_employee_org 为数据源反向迁移 |

#### 9.1.4 代码层冻结标记

在 `server/routes/hse-employee.js` 文件头添加：
```
 * @deprecated hse_employee_org 表已于 Sprint-B 迁移至 employee_assignment
 * 冻结日期：2026-07-28
 * 迁移记录：B2_20260728_0200
 * 回滚方案：参见 docs/Sprint-B 数据迁移执行 Runbook v1.0.md
```

### 9.2 personnel.js 冻结策略

| 项 | 方案 |
|----|------|
| 路由注册 | 保留 `/api/personnel` 路由注册 |
| 路由标记 | 在 personnel.js 文件头添加 `@deprecated` 标注 |
| 数据表处理 | personnel 表标记为冻结，撤销 INSERT/UPDATE/DELETE 权限 |
| 调用监控 | 在 personnel.js 每个接口添加调用日志，记录到 access log |
| 下线计划 | Sprint-B 完成后观察 2 周，无调用则移除路由 |

### 9.3 冻结验证

| # | 验证项 | 方式 | 通过 |
|---|--------|------|------|
| F1 | hse_employee_org 写入权限已撤销 | `\dp hse_employee_org` 检查权限 | □ |
| F2 | personnel 表写入权限已撤销 | `\dp personnel` 检查权限 | □ |
| F3 | hse_employee_org 只读查询正常 | `SELECT COUNT(*) FROM hse_employee_org` | □ |
| F4 | 迁移记录表已创建 | `SELECT * FROM employee_assignment_migration_log` | □ |
| F5 | 冻结记录已写入 | 检查 FREEZE 记录存在 | □ |

**冻结负责人签字**：______________ 日期：__________

---

## 十、完整回滚方案

### 10.1 回滚触发条件

以下任一条件满足时，**必须**触发回滚：

| # | 触发条件 | 严重等级 |
|---|----------|----------|
| R1 | B-0 恢复影响行数不在 [1285, 1310] 范围 | **P0** |
| R2 | B-1 前置检查任一不通过 | **P0** |
| R3 | B-2 迁移后验证任一不通过 | **P0** |
| R4 | 迁移后应用启动失败或核心功能异常 | **P0** |
| R5 | 业务方反馈数据明显异常 | **P1** |

### 10.2 回滚步骤

#### Rollback Phase 1：应用层回滚

```bash
# 1. 停止所有后端服务
pm2 stop all

# 2. 恢复代码到迁移前版本
cd F:\hse-dashboard\安全看板vben
git checkout sprint-b-migration-pre  # 迁移前打 Tag 的版本

# 3. 重启后端服务
pm2 start
```

#### Rollback Phase 2：数据层回滚

```sql
-- Phase 2-A: 回滚 B-2（删除 employee_assignment 中迁移写入的数据）
DELETE FROM employee_assignment WHERE created_by = 'system_migration_b2';

-- Phase 2-B: 回滚 B-0（将恢复的员工重新标记为软删）
-- 仅在 Phase 2-A 之后执行，确保 employee_assignment 已清空
UPDATE employee
SET is_deleted = true,
    updated_at = NOW(),
    updated_by = 'system_migration_b0_rollback'
WHERE updated_by = 'system_migration_b0'
  AND is_deleted = false;

-- Phase 2-C: 验证回滚结果
SELECT COUNT(*) AS remaining_migrations
FROM employee_assignment
WHERE created_by = 'system_migration_b2';
-- 预期：0

SELECT COUNT(*) AS rolled_back_employees
FROM employee
WHERE updated_by = 'system_migration_b0_rollback';
-- 预期：≈1304
```

#### Rollback Phase 3：权限回滚

```sql
-- 恢复 hse_employee_org 写入权限
GRANT INSERT, UPDATE, DELETE ON hse_employee_org TO hse_app_user;
GRANT USAGE, SELECT ON SEQUENCE hse_employee_org_id_seq TO hse_app_user;

-- 恢复 personnel 表写入权限
GRANT INSERT, UPDATE, DELETE ON personnel TO hse_app_user;
GRANT USAGE, SELECT ON SEQUENCE personnel_id_seq TO hse_app_user;

-- 删除迁移记录表
DROP TABLE IF EXISTS employee_assignment_migration_log;
```

### 10.3 回滚验证

| # | 验证项 | 目标 | 通过 |
|---|--------|------|------|
| RB1 | employee_assignment 中无迁移数据 | COUNT(created_by='system_migration_b2') = 0 | □ |
| RB2 | employee 表已回滚 | COUNT(updated_by='system_migration_b0') = 0 | □ |
| RB3 | hse_employee_org 写入权限已恢复 | INSERT 测试通过 | □ |
| RB4 | personnel 写入权限已恢复 | INSERT 测试通过 | □ |
| RB5 | 应用功能正常 | 核心接口测试通过 | □ |
| RB6 | 迁移日志已清理 | employee_assignment_migration_log 已删除 | □ |

### 10.4 回滚时间预估

| 阶段 | 预估时间 |
|------|----------|
| 应用层回滚 | 5 分钟 |
| 数据层回滚（B-2 删除） | 2 分钟 |
| 数据层回滚（B-0 回滚） | 5 分钟 |
| 权限回滚 | 1 分钟 |
| 验证 | 10 分钟 |
| **总计** | **≈ 23 分钟** |

---

## 十一、上线观察指标

### 11.1 观察窗口

- **观察期**：迁移完成后 **72 小时**
- **观察时段**：每 2 小时检查一次
- **负责人**：Sprint-B 实施负责人

### 11.2 核心观察指标

| # | 指标 | 监控方式 | 告警阈值 | 处理动作 |
|---|------|----------|----------|----------|
| O1 | 后端 API 错误率 | 监控 `/api/hse-employee/` 路由 | > 1% | 暂停 + 排查 |
| O2 | 员工列表查询成功率 | 监控 `GET /api/hse-employee/` | < 99% | 暂停 + 排查 |
| O3 | 员工选择组件响应时间 | 监控 `EmployeeSelector` 加载 | > 3s | 优化查询 |
| O4 | 调岗功能成功率 | 监控 `PUT /api/hse-employee/transfer` | < 99% | 暂停 + 排查 |
| O5 | 新员工导入成功率 | 监控导入接口 | < 95% | 暂停 + 排查 |
| O6 | employee_assignment 写入量 | 监控 INSERT 速率 | 异常突增 | 排查写入源 |
| O7 | hse_employee_org 写入量 | 监控 INSERT/UPDATE 速率 | > 0（已冻结） | 立即排查未冻结 |
| O8 | 前端页面白屏/报错 | 浏览器监控 | 任意严重错误 | 回滚代码 |

### 11.3 观察报告模板

```
观察周期：2026-07-28 至 2026-07-31
观察人：____

| 指标 | 最高值 | 最低值 | 平均值 | 是否告警 | 备注 |
|------|--------|--------|--------|----------|------|
| O1 错误率 | | | | | |
| O2 查询成功率 | | | | | |
| O3 响应时间 | | | | | |
| O4 调岗成功率 | | | | | |
| O5 导入成功率 | | | | | |
| O6 写入量 | | | | | |
| O7 冻结违规 | | | | | |
| O8 前端错误 | | | | | |

结论：□ 观察通过，进入长期运行   □ 观察未通过，需排查
```

### 11.4 长期监控建议

| # | 监控项 | 频率 | 说明 |
|---|--------|------|------|
| L1 | employee_assignment vs hse_employee_org 数据差异 | 每周 | 确保两表数据一致性 |
| L2 | hse_employee_org 冻结状态检查 | 每天 | 确保无违规写入 |
| L3 | personnel 表调用量监控 | 每周 | 评估下线时机 |
| L4 | employee_assignment 主岗唯一性检查 | 每周 | 确保业务约束 |

---

## 附录 A：执行时间线

| 阶段 | 内容 | 预估时间 | 执行窗口 |
|------|------|----------|----------|
| T-1 | 前置检查 + 数据库备份 | 30 分钟 | D-1 下午 |
| T-0 | 停机 + 确认无活跃连接 | 15 分钟 | D 日 02:00 |
| T-1 | B-0 Employee 恢复 | 15 分钟 | D 日 02:15 |
| T-2 | B-0 验证 | 10 分钟 | D 日 02:30 |
| T-3 | B-1 前置强制检查 | 10 分钟 | D 日 02:40 |
| T-4 | B-2 数据迁移 | 15 分钟 | D 日 02:50 |
| T-5 | B-2 验证 | 20 分钟 | D 日 03:05 |
| T-6 | 数据一致性全量验证 | 15 分钟 | D 日 03:25 |
| T-7 | 旧模型冻结 | 10 分钟 | D 日 03:40 |
| T-8 | 启动应用 + 冒烟测试 | 20 分钟 | D 日 03:50 |
| T-9 | 上线观察 | 72 小时 | D 日 04:00 起 |
| **总计** | | **≈ 2.5 小时** | |

---

## 附录 B：迁移数据字典

### B.1 employee_assignment 表结构

参考：[sprint5_6_employee_master_migration.sql](file:///F:/hse-dashboard/server/sql/sprint5_6_employee_master_migration.sql)

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | BIGSERIAL | 主键 | PRIMARY KEY |
| employee_id | BIGINT | 员工 ID | NOT NULL, REFERENCES employee(id) |
| org_unit_id | BIGINT | 管理组织 ID | NOT NULL, REFERENCES hse_org_unit(id) |
| operation_unit_id | BIGINT | 生产作业单元 ID | REFERENCES hse_operation_unit(id), NULLABLE |
| position_id | BIGINT | 岗位 ID | NOT NULL, REFERENCES position(id) |
| supervisor_id | BIGINT | 直接上级 ID | REFERENCES employee(id), NULLABLE |
| is_primary | BOOLEAN | 是否主岗 | NOT NULL, DEFAULT true |
| is_current | BOOLEAN | 是否当前有效 | NOT NULL, DEFAULT true |
| status | VARCHAR(20) | 状态 | NOT NULL, DEFAULT 'active', CHECK (active/inactive/pending) |
| start_date | DATE | 开始日期 | NOT NULL, DEFAULT CURRENT_DATE |
| end_date | DATE | 结束日期 | NULLABLE |
| remark | VARCHAR(256) | 备注 | NULLABLE |
| created_by | VARCHAR(64) | 创建人 | NULLABLE |
| updated_by | VARCHAR(64) | 更新人 | NULLABLE |
| created_at | TIMESTAMP | 创建时间 | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMP | 更新时间 | NOT NULL, DEFAULT NOW() |
| is_deleted | BOOLEAN | 软删除 | NOT NULL, DEFAULT false |

### B.2 状态枚举映射

| employee_assignment.status | 含义 | 对应业务场景 |
|---------------------------|------|-------------|
| 'active' | 在职 | 员工当前任职 |
| 'pending' | 待入职 | 已导入但尚未生效 |
| 'inactive' | 已停用 | 离职/调岗旧记录 |

### B.3 迁移标记规范

| created_by 值 | 含义 |
|---------------|------|
| 'system_migration_b0' | B-0 Employee 恢复操作 |
| 'system_migration_b2' | B-2 employee_assignment 迁移操作 |
| 'system_migration_b0_rollback' | B-0 回滚操作 |
| 'system_migration_b2_rollback' | B-2 回滚操作 |
| 'system_freeze' | 旧模型冻结操作 |

---

## 附录 C：问题排查手册

### C.1 常见问题

| # | 问题 | 可能原因 | 排查方式 | 解决方案 |
|---|------|----------|----------|----------|
| Q1 | B-0 恢复影响行数为 0 | employee_id 关联的 employee 已全部活跃 | 检查 employee.is_deleted 状态 | 无需恢复，跳过 B-0 |
| Q2 | B-0 恢复影响行数 > 1310 | 存在重复 employee_id 或异常记录 | 查询 DISTINCT 数量 | 手动确认，超出范围回滚 |
| Q3 | B-2 position_id 关联缺失 | position 表缺少对应岗位数据 | 查询缺失的 position_id | 补充 position 数据或标记为异常 |
| Q4 | B-2 org_unit_id 关联缺失 | hse_org_unit 表缺少对应组织 | 查询缺失的 org_unit_id | 补充 hse_org_unit 数据或标记为异常 |
| Q5 | employee_code 唯一性冲突 | 恢复的 employee 存在重复工号 | 按 employee_code 分组查询 | 保留 is_deleted=false 记录，软删重复项 |
| Q6 | 迁移后查询性能下降 | employee_assignment 缺少索引 | 检查索引状态 | 补充索引：`CREATE INDEX ...` |
| Q7 | 前端组件查询异常 | 字段名未对齐（group_id→org_unit_id） | 检查 API 返回字段 | 同步修改前端类型定义 |

### C.2 紧急联系

| 角色 | 联系人 | 手机 | 邮箱 |
|------|--------|------|------|
| 数据迁移负责人 | | | |
| DBA | | | |
| 后端负责人 | | | |
| 前端负责人 | | | |
| QA 负责人 | | | |

---

> **文档结束**
> 本 Runbook 需经数据迁移负责人、后端负责人、前端负责人三方签字确认后方可执行。
