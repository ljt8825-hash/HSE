# 生产放行执行门控 Runbook

> **文档性质**: DBA/运维可逐步照做的生产执行 Runbook  
> **适用范围**: Sprint B 数据迁移（B-0 + B-2）+ Sprint D 历史回填 + 端到端验证  
> **前置**: dev 侧全部就绪（Step 1~11 已验证），生产执行前必须完成 Preflight 复核  
> **铁律**: 本 Runbook 不包含任何 TRAE 自动执行步骤；所有 SQL 由 DBA 在维护窗口手动执行；签字栏留空，TRAE 不代签。  
> **版本**: v1.3-ready · 2026-07-28（pre-DBA 就绪版，Step 16 收尾）
> **v1.2-fix 修订记录**（依据 TRAE-Step14 Dev 彩排实测缺陷）:
> - §3.1 B-0-1.5 L141: `migration_backup_registry (..., description)` → `..., remark`
> - §3.2 B-2-1 L255: `migration_backup_registry (..., description)` → `..., remark`
> - §3.2 B-2-4 L375: `ON CONFLICT ON CONSTRAINT uk_emp_assign_primary` → `ON CONFLICT (employee_id) WHERE is_primary = true AND is_current = true AND is_deleted = false`
> - 依据: `uk_emp_assign_primary` 是 PARTIAL UNIQUE INDEX（非 CONSTRAINT），原语法在生产必报"约束不存在"；`migration_backup_registry` 实际列名为 `remark`（非 `description`）。
> - 回归: 修订后 dev 重跑生产包 B-2，insert_count=1304, anomaly=0, 偏差 0.00% PASS。
> **v1.3-ready 修订记录**（Step 16 pre-DBA 就绪收口）:
> - §3.2 B-2-1 L258-265: 备份表名 `employee_assignment_b2_backup_prod` → `employee_assignment_b2_backup_20260728`，注册键 `B2_EA_PROD` → `B2_EA_20260728`（与生产包 `04_B2_Assignment_Migration.sql` L24-29 对齐）
> - §3.2 B-2-5 L419-420: 回滚表名 `employee_assignment_b2_backup_prod` → `employee_assignment_b2_backup_20260728`（与生产包实际创建的表名对齐）
> - 全链路彩排: B-0 → B-2（生产包文件） → 基线校验 → E2E，全部 PASS，可交付 DBA

---

## ① 适用范围与前置

### 适用范围

本 Runbook 覆盖以下生产执行环节：

| # | 环节 | 对应开发步骤 | 性质 |
|---|------|-------------|------|
| 1 | Preflight 索引 + 触发器复核 | Step 9 | 执行前必做 |
| 2 | Sprint B B-0 Employee 恢复 | Step 2 | 数据迁移 |
| 3 | Sprint B B-2 employee_assignment 迁移 | Step 2/3 | 数据迁移 |
| 4 | 迁移后基线校验 | Runbook-Final | 质量门禁 |
| 5 | 历史数据回填 | Step 10/11 | 后处理 |
| 6 | 巡检调度启用 | Step 9 | 运维配置 |
| 7 | 端到端验证 | Step 10 | 验收 |

### 前置条件

- [ ] 业务方已确认停机窗口（建议凌晨 02:00-05:00）
- [ ] Sprint-B-v2.1-Production-Package 已上传至生产服务器
- [ ] `node server/scripts/backfillEmployeeId.cjs` 已上传至生产服务器
- [ ] 代码仓已打 Tag：`sprint-b-migration-prod`
- [ ] `hse_employee_org_ReadOnly_Change.sql`（Step 9 只读触发器）已准备就绪
- [ ] DBA + 后端 + 前端 + 业务负责人均已到位

---

## ② Step 0 Preflight（索引 + 触发器复核）

> **执行顺序**: 先检查索引，再检查触发器；任何一项失败则阻断迁移。

### 2.1 检查 uk_emp_assign_primary 唯一索引

**检查 SQL**:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'employee_assignment'
  AND indexname = 'uk_emp_assign_primary';
```

**预期**: 返回 1 行，`indexdef` 包含 `WHERE (is_primary = true AND is_current = true AND is_deleted = false)`。

- [ ] **PASS** — 索引已存在且定义正确，进入 §2.2
- [ ] **FAIL** — 索引不存在或定义不正确，执行以下 DDL 创建：

```sql
CREATE UNIQUE INDEX uk_emp_assign_primary
ON employee_assignment (employee_id)
WHERE is_primary = true
  AND is_current = true
  AND is_deleted = false;
```

创建后重新执行检查 SQL 验证。

**执行人**: DBA **时间**: ____ 年 __ 月 __ 日 ____:____

### 2.2 检查 hse_employee_org 只读触发器

**检查 SQL**:

```sql
SELECT t.tgname, t.tgenabled
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname = 'hse_employee_org'
  AND NOT t.tgisinternal
ORDER BY t.tgname;
```

**预期**: 返回 3 行，分别为：
- `trg_hse_employee_org_block_insert`（`tgenabled = 'O'`）
- `trg_hse_employee_org_block_update`（`tgenabled = 'O'`）
- `trg_hse_employee_org_block_delete`（`tgenabled = 'O'`）

- [ ] **PASS** — 三个触发器均存在且 `tgenabled = 'O'`（默认启用），进入 §2.3
- [ ] **FAIL** — 触发器不存在，执行 [hse_employee_org_ReadOnly_Change.sql](file:///F:/hse-dashboard/docs/Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql) 全文创建。

### 2.3 Preflight 结论

| 检查项 | 结果 |
|--------|------|
| uk_emp_assign_primary 索引 | □ PASS □ FAIL（已创建） |
| hse_employee_org 只读触发器 | □ PASS □ FAIL（已创建） |
| 数据库活跃连接已断开 | □ PASS |
| 后端服务已停止 | □ PASS |

**Preflight 负责人签字**: ______________ **日期**: ______________

---

## ③ Sprint B 迁移执行（B-0 + B-2 + 回滚）

> **核心要求**: B-0 和 B-2 必须在**同一数据库会话**中连续执行。不得关闭 DBeaver/pgAdmin 窗口，不得断开连接。

### 3.1 B-0 Employee 恢复

**目标**: 恢复 `employee` 表中被软删除但被旧模型引用的员工记录。

**Step B-0-1: 恢复前数据快照**（记录基线）

```sql
SELECT
    COUNT(*) AS total_employees,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active_employees,
    COUNT(CASE WHEN is_deleted = true THEN 1 END) AS deleted_employees
FROM employee;
```

**基线**: `total_employees = ____`, `active_employees = ____`, `deleted_employees = ____`

**Step B-0-1.5: 创建全量备份表**（用于全量回滚）

> ⚠️ **重要**：此步骤创建的 `employee_b0_backup_20260728` 表是 B-0-5 全量回滚的前置条件。必须在执行恢复前完成。

```sql
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

-- v1.2-fix: 字段名 description → remark（与实际表结构一致）
INSERT INTO migration_backup_registry (backup_id, backup_table, remark)
VALUES ('B0_EMPLOYEE_BACKUP', 'employee_b0_backup_20260728', 'B-0 Employee 全量备份（用于全量回滚）')
ON CONFLICT (backup_id) DO UPDATE SET created_at = NOW();
```

**备份记录数**: ____

**Step B-0-2: 创建恢复 ID 临时表 + 持久化备份**

```sql
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
  AND e.is_deleted = true;
```

**临时表记录数**: ____

**Step B-0-3: 执行恢复**

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
    RAISE NOTICE '恢复员工数: %', rec_count;
END $$;
```

**实际恢复行数**: ____ （预期 ≤ 1287，以生产库基线为准）

**Step B-0-4: 恢复后验证**

```sql
SELECT
    COUNT(*) AS total_in_temp,
    COUNT(CASE WHEN e.is_deleted = false THEN 1 END) AS recovered_active,
    COUNT(CASE WHEN e.is_deleted = true THEN 1 END) AS still_deleted
FROM temp_b0_recover_ids t
JOIN employee e ON e.id = t.employee_id;
```

- [ ] `recovered_active = total_in_temp`（全部恢复成功）
- [ ] `still_deleted = 0`

**Step B-0-5: B-0 回滚方案**（如恢复失败）

| 策略 | 适用场景 | SQL | 备份表来源 |
|------|---------|-----|-----------|
| 精准回滚 | 会话未断开，临时表可用 | `UPDATE employee SET is_deleted = true WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids)` | 临时表 `temp_b0_recover_ids` |
| 全量回滚 | 会话已断开 | `UPDATE employee SET is_deleted = true WHERE id IN (SELECT id FROM employee_b0_backup_20260728)` | **B-0-1.5 创建的 `employee_b0_backup_20260728`** |

> ⚠️ **注意**：全量回滚依赖 B-0-1.5 创建的 `employee_b0_backup_20260728` 表。如该表不存在，回滚将失败。

**B-0 执行确认**: □ 成功 □ 回滚

---

### 3.2 B-2 employee_assignment 迁移

> ⚠️ **执行指向说明**：DBA **必须执行已验证生产包文件** `docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql`，**不要手动执行本 Runbook 内联 SQL**。本内联 SQL 仅作逻辑说明。该生产包已包含：
> - 脏数据检查（重复当前关系检测）
> - status 映射预检查（未映射状态阻断）
> - 8 分支无 ELSE status 映射（NULL→active、leave/resigned/retired/dismissed→inactive）
> - 异常日志捕获 `b2_anomaly_log`（含员工 ID、旧状态、新状态、时间戳）
> - 行数范围硬校验（偏差 >2% 直接 `RAISE EXCEPTION` 中止执行）
>
> **若坚持用内联版**，须确保补齐：
> 1. `migration_id` 使用 `'B2_20260728'`（与生产包一致，切勿混用 `B2_PROD_`）
> 2. `b2_anomaly_log` 异常捕获
> 3. `IF insert_count` 超基线 2% 则 `RAISE EXCEPTION` 的硬校验

**目标**: 将 `hse_employee_relation` 的当前记录迁移至 `employee_assignment`（新模型唯一事实来源）。

**前置**: B-0 已完成且通过验证。

**Step B-2-0: 迁移前基线记录**

> 基线键使用 `'B2_20260728'`，与生产包 `04_B2_Assignment_Migration.sql` 保持一致。

```sql
INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
VALUES
('B2_20260728', 'her_current_count', (SELECT COUNT(*) FROM hse_employee_relation WHERE is_deleted = false AND is_current = true))
ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;

SELECT metric_value AS her_current_count
FROM migration_baseline
WHERE migration_id = 'B2_20260728' AND metric_name = 'her_current_count';
```

**基线**: `her_current_count = ____`

**Step B-2-1: 迁移前备份 employee_assignment**

```sql
DROP TABLE IF EXISTS employee_assignment_b2_backup_20260728;
CREATE TABLE employee_assignment_b2_backup_20260728 AS
SELECT * FROM employee_assignment;

-- v1.2-fix: 字段名 description → remark（与实际表结构一致）
-- v1.3-ready: 备份表名/注册键与生产包对齐（Step 16）
INSERT INTO migration_backup_registry (backup_id, backup_table, remark)
VALUES ('B2_EA_20260728', 'employee_assignment_b2_backup_20260728', 'B-2 employee_assignment 备份')
ON CONFLICT (backup_id) DO UPDATE SET created_at = NOW();
```

**备份记录数**: ____

**Step B-2-2: 脏数据检查**（P0 阻断项）

```sql
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS b2_dirty_data_check (
        employee_id BIGINT, duplicate_count BIGINT, detected_at TIMESTAMP DEFAULT NOW()
    );
    TRUNCATE b2_dirty_data_check;

    INSERT INTO b2_dirty_data_check (employee_id, duplicate_count)
    SELECT employee_id, COUNT(*) AS duplicate_count
    FROM hse_employee_relation
    WHERE is_deleted = false AND is_current = true
    GROUP BY employee_id
    HAVING COUNT(*) > 1;

    GET DIAGNOSTICS duplicate_count = ROW_COUNT;
    IF duplicate_count > 0 THEN
        RAISE EXCEPTION '发现 % 条员工存在重复当前关系，必须先清洗数据。', duplicate_count;
    END IF;
    RAISE NOTICE '脏数据检查通过（重复: 0）';
END $$;
```

- [ ] **PASS** — `duplicate_count = 0`

**Step B-2-3: status 映射预检查**（P0 阻断项）

```sql
DO $$
DECLARE
    unknown_status_count INTEGER;
BEGIN
    SELECT COUNT(DISTINCT status) INTO unknown_status_count
    FROM hse_employee_relation
    WHERE is_deleted = false AND status IS NOT NULL
      AND status NOT IN ('active','pending','inactive','leave','resigned','retired','dismissed','returned');

    IF unknown_status_count > 0 THEN
        RAISE EXCEPTION '发现 % 个未映射的 status 值，必须补充映射后重新执行。', unknown_status_count;
    END IF;
    RAISE NOTICE 'status 映射预检查通过';
END $$;
```

- [ ] **PASS** — 无未映射 status

**Step B-2-4: 执行迁移 SQL**

> ⚠️ **参考摘录**：以下 SQL 仅供逻辑说明。**DBA 应执行生产包文件** `docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql`。内联版已补齐异常日志 `b2_anomaly_log` 和行数范围硬校验。

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

    INSERT INTO b2_anomaly_log (employee_id, old_status, new_status, detected_at)
    SELECT her.employee_id, her.status,
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
        END AS new_status,
        NOW()
    FROM hse_employee_relation her
    WHERE her.is_deleted = false AND her.is_current = true
      AND her.status IS NOT NULL
      AND her.status IN ('resigned', 'retired', 'dismissed', 'leave');

    INSERT INTO employee_assignment (
        employee_id, org_unit_id, operation_unit_id, position_id,
        supervisor_id, is_primary, is_current, status,
        start_date, end_date, remark, created_by, created_at, updated_at, is_deleted
    )
    SELECT
        her.employee_id, her.org_unit_id, her.operation_unit_id, her.position_id,
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
        END AS status,
        COALESCE(her.start_date, CURRENT_DATE) AS start_date,
        her.end_date, her.remark,
        'system_migration_b2' AS created_by,
        COALESCE(her.created_at, NOW()) AS created_at,
        NOW() AS updated_at,
        false AS is_deleted
    FROM hse_employee_relation her
    WHERE her.is_deleted = false AND her.is_current = true
    -- v1.2-fix: PARTIAL UNIQUE INDEX 必须用 ON CONFLICT (col) WHERE ... 语法
    ON CONFLICT (employee_id) WHERE is_primary = true AND is_current = true AND is_deleted = false
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

    INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
    VALUES ('B2_20260728', 'actual_migrate_count', insert_count)
    ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;

    IF insert_count < baseline_count * 0.98 OR insert_count > baseline_count * 1.02 THEN
        RAISE EXCEPTION '迁移记录数 % 超出基线 % 的 ±2% 范围，中止执行！', insert_count, baseline_count;
    END IF;

    RAISE NOTICE '迁移记录数: % (基线: %)，校验通过', insert_count, baseline_count;
END $$;
```

**实际迁移行数**: `insert_count = ____`

**Step B-2-5: B-2 回滚方案**（如迁移失败或行数异常）

| 策略 | 适用场景 | SQL |
|------|---------|-----|
| 仅回滚新增 | 迁移行数正常，仅需撤销新写入 | `DELETE FROM employee_assignment WHERE created_by = 'system_migration_b2'` |
| 恢复 UPSERT 覆盖 | 需恢复被覆盖的原有数据 | 从 `employee_assignment_b2_backup_20260728` 恢复 |
| 全量恢复 | 全部失败 | `TRUNCATE employee_assignment; INSERT INTO employee_assignment SELECT * FROM employee_assignment_b2_backup_20260728` |

**B-2 执行确认**: □ 成功 □ 回滚

---

## ④ 迁移后基线校验

> 基线键使用 `'B2_20260728'`，与生产包保持一致。

### 4.1 动态基线偏差检查

```sql
SELECT
    baseline.metric_value AS baseline_count,
    actual.metric_value AS actual_count,
    CASE
        WHEN actual.metric_value >= baseline.metric_value * 0.98
         AND actual.metric_value <= baseline.metric_value * 1.02
        THEN 'PASS'
        ELSE 'FAIL'
    END AS verdict,
    ROUND(ABS(actual.metric_value - baseline.metric_value) * 100.0 / NULLIF(baseline.metric_value, 0), 2) AS deviation_pct
FROM migration_baseline baseline
JOIN migration_baseline actual ON actual.migration_id = baseline.migration_id
WHERE baseline.migration_id = 'B2_20260728'
  AND baseline.metric_name = 'her_current_count'
  AND actual.metric_name = 'actual_migrate_count';
```

**通过标准**: `verdict = PASS`（偏差 ≤ 2%）

- [ ] **PASS** — 基线偏差 ≤ 2%
- [ ] **FAIL** — 偏差 > 2%，需人工排查

### 4.2 迁移结果汇总

```sql
SELECT
    (SELECT metric_value FROM migration_baseline WHERE migration_id = 'B2_20260728' AND metric_name = 'her_current_count') AS baseline,
    (SELECT metric_value FROM migration_baseline WHERE migration_id = 'B2_20260728' AND metric_name = 'actual_migrate_count') AS actual,
    (SELECT COUNT(*) FROM employee_assignment WHERE created_by = 'system_migration_b2') AS b2_records,
    (SELECT COUNT(DISTINCT employee_id) FROM employee_assignment WHERE created_by = 'system_migration_b2') AS b2_distinct_employees;
```

**汇总**: 基线=____，实际=____，迁移记录=____，独立员工=____

**迁移负责人签字**: ______________ **日期**: ______________

---

## ⑤ 历史数据回填（dry-run 预估 → 签字 → 执行）

> **核心门控**: 生产环境回填脚本受 Step 11 硬拦截保护，必须以 `--dry-run` 先预估，DBA 签字后方可执行实际回填。

### 5.1 Dry-Run 预估

```bash
cd /path/to/server
node scripts/backfillEmployeeId.cjs --dry-run
```

**预期输出**:

```
⚠️ 生产环境 DRY RUN 模式：仅查询，不执行 UPDATE

=== 培训记录回填 ===
统计: {"total_null":"____","has_id_card":"____","has_name":"____"}
id_card 匹配结果: 可回填=____, 不可回填=____
姓名降级匹配: 唯一匹配=____, 重名跳过=____
总计可回填: ____/____

=== 三违记录回填 ===
统计: {"total_null":"____","has_name":"____"}
姓名匹配: 唯一匹配=____, 重名跳过=____, 无姓名=____
总计可回填: ____/____
```

**预估结果记录**:
- 培训记录：可回填 ____ / ____
- 三违记录：可回填 ____ / ____（其中无姓名 ____ 条不可回填，需业务补录）

> ⚠️ **已知不可回填**: violation_records 中约 **673/890（75.6%）** 无 `violator_name`，永久无法自动关联，不阻塞本次放行。

### 5.2 DBA 签字门控

> ⚠️ 必须 DBA 签字确认预估结果后方可执行实际回填。

**预估结果签字**:

| 角色 | 预估结果已审核 | 签字 | 日期 |
|------|--------------|------|------|
| DBA | □ | | |
| 业务方 | □ | | |

### 5.3 执行实际回填

**方法 A — 临时移除 NODE_ENV（推荐）**:

```bash
cd /path/to/server
unset NODE_ENV   # 或 export NODE_ENV=development
node scripts/backfillEmployeeId.cjs
```

**方法 B — 生产运维执行**（需通过安全通道）:

```bash
cd /path/to/server
# 由运维在受控环境执行，不经过生产 Nginx/PM2
```

**执行后验证**:

```sql
SELECT
    'training' AS table_name,
    COUNT(*) FILTER (WHERE employee_id IS NOT NULL) AS has_employee_id,
    COUNT(*) FILTER (WHERE employee_id IS NULL) AS null_employee_id
FROM training_records WHERE is_deleted = false
UNION ALL
SELECT
    'violation' AS table_name,
    COUNT(*) FILTER (WHERE violator_id IS NOT NULL) AS has_violator_id,
    COUNT(*) FILTER (WHERE violator_id IS NULL) AS null_violator_id
FROM violation_records WHERE is_deleted = false;
```

**回填结果记录**:
- 培训：已回填 ____ 条，仍 NULL ____ 条
- 三违：已回填 ____ 条，仍 NULL ____ 条

---

## ⑥ 巡检调度启用决策

### 6.1 当前状态

`server/services/employeeHealthCheckScheduler.js` 中 `HEALTH_CHECK_ENABLED = false`（Step 9 dev 安全默认）。

### 6.2 生产启用

**修改**: 将 `HEALTH_CHECK_ENABLED` 改为 `true`

**调度配置**:
| 配置项 | 值 |
|--------|-----|
| cron 表达式 | `0 2 * * *` |
| 时区 | Asia/Shanghai |
| 巡检内容 | 8 项健康检查（孤儿员工、孤儿岗位、重复当前关系等） |
| 告警阈值 | 任意巡检项 issue_count > 0 输出 WARN 日志 |

### 6.3 启用步骤

1. 修改 `server/services/employeeHealthCheckScheduler.js` L45: `HEALTH_CHECK_ENABLED = true`
2. 重启后端服务
3. 手动触发首次巡检验证：

```bash
cd /path/to/server
node -e "
const { triggerManualCheck } = require('./services/employeeHealthCheckScheduler');
triggerManualCheck().then(r => console.log(JSON.stringify(r, null, 2)));
"
```

4. 确认巡检结果正常

**运维签字**: ______________ **日期**: ______________

---

## ⑦ 端到端验证

### 7.1 抽样验证方法

1. 取 1 条已回填 `violator_id` 的三违记录：

```sql
SELECT v.id, v.violator_id, v.violator_name, e.name AS employee_name, e.id_card_hash
FROM violation_records v
LEFT JOIN employee e ON e.id = v.violator_id
WHERE v.is_deleted = false AND v.violator_id IS NOT NULL
LIMIT 1;
```

- [ ] 能查到对应 employee 记录
- [ ] 前端"三违详情"页面能显示员工信息

2. 取 1 条已回填 `employee_id` 的培训记录：

```sql
SELECT t.id, t.employee_id, t.name, e.name AS employee_name
FROM training_records t
LEFT JOIN employee e ON e.id = t.employee_id
WHERE t.is_deleted = false AND t.employee_id IS NOT NULL
LIMIT 1;
```

- [ ] 能查到对应 employee 记录
- [ ] 前端"培训详情"页面能显示员工信息

3. 取 1 条 Sprint B 迁移的 employee_assignment 记录：

```sql
SELECT ea.id, ea.employee_id, ea.status, ea.is_current, ea.created_by
FROM employee_assignment ea
WHERE ea.created_by = 'system_migration_b2'
LIMIT 1;
```

- [ ] `created_by = 'system_migration_b2'`
- [ ] `is_current = true`
- [ ] `status` ∈ 8 个映射值之一

### 7.2 不可关联记录声明

> **673/890 条（75.6%）** 的 violation_records 无 `violator_name` 且无 `violator_id_card`，永久无法自动关联 `employee.id`。

- 已如实标注为**业务补录**范畴，不阻塞本次放行
- 建议业务方在后续流程改造中补录违规人身份信息
- 不影响 Sprint B 迁移和新模型运行

### 7.3 验证结论

- [ ] 三违记录端到端联动正常
- [ ] 培训记录端到端联动正常
- [ ] employee_assignment 新模型数据正确
- [ ] 不可关联记录已标注

**前端负责人签字**: ______________ **日期**: ______________

**后端负责人签字**: ______________ **日期**: ______________

**业务负责人签字**: ______________ **日期**: ______________

---

## ⑧ 签字栏

> ⚠️ **禁止代签**：以下签字栏需由对应角色在生产现场人工签字确认。TRAE 不代签任何角色。

### 8.1 Preflight 复核

| 角色 | 结果 | 签字 | 日期 |
|------|------|------|------|
| DBA | □ PASS | | |

### 8.2 B-0 执行

| 角色 | 结果 | 签字 | 日期 |
|------|------|------|------|
| DBA | □ 成功 □ 回滚 | | |

### 8.3 B-2 执行 + 基线校验

| 角色 | 结果 | 签字 | 日期 |
|------|------|------|------|
| DBA | □ 成功 □ 回滚 | | |

### 8.4 历史回填

| 角色 | 结果 | 签字 | 日期 |
|------|------|------|------|
| DBA | □ dry-run 已审 □ 实际回填已执行 | | |
| 业务方 | □ 已确认不可回填数量 | | |

### 8.5 巡检启用

| 角色 | 结果 | 签字 | 日期 |
|------|------|------|------|
| 运维 | □ 已启用 □ 手动触发验证通过 | | |

### 8.6 端到端验证

| 角色 | 结果 | 签字 | 日期 |
|------|------|------|------|
| 前端 | □ 已通过 | | |
| 后端 | □ 已通过 | | |
| 业务 | □ 已通过 | | |

### 8.7 最终放行

| 角色 | 意见 | 签字 | 日期 |
|------|------|------|------|
| DBA | | | |
| 后端负责人 | | | |
| 前端负责人 | | | |
| 业务负责人 | | | |

---

## ⑨ 证据索引

| # | 结论/引用 | 证据位置 |
|---|----------|---------|
| 1 | uk_emp_assign_primary 创建 DDL | Runbook-Final §4.7 Check 0.7 / Step 9 §2.2 |
| 2 | hse_employee_org 只读触发器 SQL | [hse_employee_org_ReadOnly_Change.sql](file:///F:/hse-dashboard/docs/Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql) |
| 3 | B-0 恢复 SQL | Runbook-Final §5.5 |
| 4 | B-0 回滚 SQL | Runbook-Final §5.7 |
| 5 | B-2 迁移 SQL（8 分支无 ELSE） | Runbook-Final §7.7 |
| 6 | B-2 回滚 SQL（3 种策略） | Runbook-Final §7.9 |
| 7 | B-2 脏数据检查 | Runbook-Final §7.5 |
| 8 | B-2 status 映射预检查 | Runbook-Final §7.6 |
| 9 | 动态基线校验 SQL | Runbook-Final §7.7（DO $$ 块内） |
| 10 | 回填脚本路径 | [backfillEmployeeId.cjs](file:///F:/hse-dashboard/server/scripts/backfillEmployeeId.cjs) |
| 11 | 回填脚本生产硬拦截 | Step 11 §3（`process.env.NODE_ENV === 'production' && !isDryRun` → exit 1） |
| 12 | 巡检调度服务 | [employeeHealthCheckScheduler.js](file:///F:/hse-dashboard/server/services/employeeHealthCheckScheduler.js) |
| 13 | 巡检视图和函数 | Step 9 §二.4 |
| 14 | violator_id_card 前端字段 | Step 11 §2.1 |
| 15 | id_card 前端字段 | Step 11 §2.2 |
| 16 | training.js resolveEmployeeId | Step 10 §3.1 |
| 17 | violations.js resolveViolatorId | Step 10 §3.2 |
| 18 | violation_records 673/890 不可回填 | Step 10 §四.3 |
| 19 | 迁移状态映射表 | Runbook-Final §7.3 |
| 20 | 迁移包位置 | `docs/Sprint-B-v2.1-Production-Package/` |
| 21 | **B-2 生产包**（必须执行） | [04_B2_Assignment_Migration.sql](file:///F:/hse-dashboard/docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql) |
| 22 | B-0 全量回滚备份表 | 本 Runbook §3.1 B-0-1.5（`employee_b0_backup_20260728`） |

---

## ⑩ v1.1 修订记录

| 修订项 | 修订前 | 修订后 | 原因 |
|--------|--------|--------|------|
| §3.2 执行指向 | 无明确指向，仅内联 SQL | 醒目说明框：必须执行生产包 `04_B2_Assignment_Migration.sql` | 防止 DBA 执行弱化版 |
| B-2 migration_id | `'B2_PROD_'` | `'B2_20260728'` | 与生产包保持一致 |
| B-2 异常捕获 | 缺失 `b2_anomaly_log` | 已补齐异常日志写入 | 增强可追溯性 |
| B-2 硬校验 | 缺失行数范围校验 | 新增 `±2%` 偏差检查，超限直接 `RAISE EXCEPTION` | 防止静默数据丢失 |
| §4 baseline 键 | `'B2_PROD_'` | `'B2_20260728'` | 与生产包保持一致 |
| B-0 全量回滚 | 引用不存在的 `employee_b0_backup_20260728` | 新增 B-0-1.5 步骤创建备份表 | 修复回滚缺口 |

---

## ⑪ v1.2-fix 修订记录（2026-07-28，依据 TRAE-Step14 Dev 彩排实测）

| 修订项 | 位置 | 修订前 | 修订后 | 原因 |
|--------|------|--------|--------|------|
| B-2 ON CONFLICT 语法 | §3.2 B-2-4 L381-382 | `ON CONFLICT ON CONSTRAINT uk_emp_assign_primary` | `ON CONFLICT (employee_id) WHERE is_primary = true AND is_current = true AND is_deleted = false` | `uk_emp_assign_primary` 是 PARTIAL UNIQUE INDEX（非 CONSTRAINT），原语法在生产必报"约束不存在" |
| B-0 备份登记字段名 | §3.1 B-0-1.5 L147-148 | `INSERT INTO migration_backup_registry (backup_id, backup_table, description)` | `INSERT INTO migration_backup_registry (backup_id, backup_table, remark)` | 实际表字段名为 `remark`（非 `description`），原 INSERT 会报"字段不存在" |
| B-2 备份登记字段名 | §3.2 B-2-1 L262-263 | 同上 `..., description)` | 同上 `..., remark)` | 同上 |

**回归验证**: 修订后 dev 重跑生产包 `04_B2_Assignment_Migration.sql`，`insert_count=1304, baseline=1304, anomaly_count=0, 偏差 0.00% PASS`；B-0-1.5 备份登记 SQL 不再报字段错误。

**未改动项**: status 映射 8 分支无 ELSE、`uk_emp_assign_primary` 索引 DDL、`b2_anomaly_log` 异常日志、±2% 硬校验、回填脚本硬拦截——均保持已验证正确状态。

---

## ⑫ v1.3-ready 修订记录（2026-07-28，Step 16 pre-DBA 就绪收口）

| 修订项 | 位置 | 修订前 | 修订后 | 原因 |
|--------|------|--------|--------|------|
| B-2-1 备份表名 | §3.2 B-2-1 L258-260 | `employee_assignment_b2_backup_prod` | `employee_assignment_b2_backup_20260728` | 与生产包 `04_B2_Assignment_Migration.sql` L24 实际创建的表名对齐，防止回滚时"表不存在" |
| B-2-1 注册键 | §3.2 B-2-1 L264 | `B2_EA_PROD` | `B2_EA_20260728` | 与生产包 L29 注册键对齐，确保备份登记可溯源 |
| B-2-5 回滚表名 | §3.2 B-2-5 L419-420 | `employee_assignment_b2_backup_prod` | `employee_assignment_b2_backup_20260728` | 与生产包实际表名对齐，回滚 SQL 可直接执行 |

**全链路彩排**: Step 16 全链路 dev 彩排 — B-0 → B-2（生产包文件）→ 基线校验 → E2E — 全部 PASS。

**状态**: pre-DBA 就绪，可交付 DBA 执行生产迁移。

---

**文档结束。**
