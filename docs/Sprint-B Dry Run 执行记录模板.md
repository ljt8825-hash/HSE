# Sprint-B Dry Run 执行记录模板

> **模板版本**: v1.0
> **编制日期**: 2026-07-28
> **配套文档**: 《Sprint-B Dry Run 验证报告 v1.0》
> **用途**: 记录Dry Run执行过程中的关键步骤和数据

---

## 执行基本信息

| 项目 | 内容 |
|------|------|
| 执行日期 | ____ 年 __ 月 __ 日 |
| 执行环境 | □ 测试环境 □ 预生产环境 |
| 执行人员 | ____ |
| 数据库服务器 | ____ |
| 数据库名称 | ____ |
| 执行开始时间 | ____:____ |
| 执行结束时间 | ____:____ |
| 总耗时 | ____ 分钟 |

---

## 一、前置检查记录

### 1.1 环境检查

| 检查项 | 检查时间 | 检查结果 | 备注 |
|--------|----------|----------|------|
| 数据库连接 | ____ | □ 通过 □ 不通过 | ____ |
| 数据库权限 | ____ | □ 通过 □ 不通过 | ____ |
| 后端服务状态 | ____ | □ 已停止 □ 未停止 | ____ |
| 活跃连接数 | ____ | ____ 个 | ____ |
| 备份目录可写 | ____ | □ 通过 □ 不通过 | ____ |

### 1.2 数据库锁检查

**检查时间**: ____

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

**检查结果**: ____ 行
**处理措施**（如有锁）: ____

---

## 二、Step 0 执行记录

### 2.1 迁移基线表创建

**执行时间**: ____:____

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
```

**执行状态**: □ 成功 □ 失败
**失败原因**（如有）: ____

### 2.2 基线数据记录

**执行时间**: ____:____

```sql
INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
VALUES
('B0_20260728', 'employee_active_before', (SELECT COUNT(*) FROM employee WHERE is_deleted=false)),
('B0_20260728', 'employee_deleted_before', (SELECT COUNT(*) FROM employee WHERE is_deleted=true)),
('B2_20260728', 'her_current_count', (SELECT COUNT(*) FROM hse_employee_relation WHERE is_current=true AND is_deleted=false)),
('B2_20260728', 'ea_before_count', (SELECT COUNT(*) FROM employee_assignment))
ON CONFLICT (migration_id, metric_name) DO UPDATE SET
    metric_value = EXCLUDED.metric_value,
    recorded_at = NOW();
```

**基线数据**:

| metric_name | metric_value | 备注 |
|-------------|--------------|------|
| employee_active_before | ____ | 迁移前活跃员工数 |
| employee_deleted_before | ____ | 迁移前软删员工数 |
| her_current_count | ____ | hse_employee_relation 当前员工数 |
| ea_before_count | ____ | employee_assignment 迁移前记录数 |

**执行状态**: □ 成功 □ 失败

### 2.3 备份注册表创建

**执行时间**: ____:____

```sql
CREATE TABLE IF NOT EXISTS migration_backup_registry (
    backup_id VARCHAR(64) PRIMARY KEY,
    backup_table VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    remark TEXT
);
```

**执行状态**: □ 成功 □ 失败

---

## 三、B-0 恢复执行记录

### 3.1 恢复前数据快照

**执行时间**: ____:____

| 数据项 | 数量 |
|--------|------|
| employee 总数 | ____ |
| 活跃员工数 | ____ |
| 软删员工数 | ____ |
| 可恢复员工数（并集） | ____ |

### 3.2 临时表创建

**执行时间**: ____:____

```sql
CREATE TEMP TABLE IF NOT EXISTS temp_b0_recover_ids (
    employee_id BIGINT PRIMARY KEY,
    recovered_at TIMESTAMP DEFAULT NOW()
);
```

**执行状态**: □ 成功 □ 失败

### 3.3 临时表填充

**执行时间**: ____:____

```sql
INSERT INTO temp_b0_recover_ids (employee_id)
SELECT DISTINCT employee_id
FROM (
    SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
    UNION
    SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
) AS source_union
WHERE employee_id IN (SELECT id FROM employee WHERE is_deleted = true);
```

**填充记录数**: ____

### 3.4 持久化备份表创建

**执行时间**: ____:____

```sql
DROP TABLE IF EXISTS temp_b0_recover_ids_backup_20260728;
CREATE TABLE temp_b0_recover_ids_backup_20260728 AS
SELECT * FROM temp_b0_recover_ids;
```

**备份记录数**: ____
**执行状态**: □ 成功 □ 失败

### 3.5 恢复 SQL 执行

**执行时间**: ____:____

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

    IF rec_count < baseline_count * 0.98 OR rec_count > baseline_count * 1.02 THEN
        RAISE EXCEPTION '恢复行数异常: %, 预期范围 [%, %]',
            rec_count, FLOOR(baseline_count * 0.98), CEIL(baseline_count * 1.02);
    END IF;

    INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
    VALUES ('B0_20260728', 'actual_recover_count', rec_count)
    ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;
END $$;
```

**恢复记录数**: ____
**RAISE NOTICE 输出**: ____
**执行状态**: □ 成功 □ 失败

**失败详情**（如有）:
```
____
```

### 3.6 恢复后验证

**执行时间**: ____:____

| 验证项 | 预期结果 | 实际结果 | 状态 |
|--------|----------|----------|------|
| still_deleted | 0 | ____ | □ 通过 |
| status | PASS | ____ | □ 通过 |
| missing_employee_refs | 0 | ____ | □ 通过 |

---

## 四、B-1 验证记录

### 4.1 关联完整性验证

**执行时间**: ____:____

| 验证项 | 目标 | 实际 | 状态 |
|--------|------|------|------|
| employee_relation → employee 关联 | 0 | ____ | □ 通过 |
| position_id 有效性 | 0 | ____ | □ 通过 |
| org_unit_id 有效性 | 0 | ____ | □ 通过 |
| operation_unit_id 有效性 | 0 | ____ | □ 通过 |

---

## 五、B-2 迁移执行记录

### 5.1 employee_assignment 备份

**执行时间**: ____:____

```sql
DROP TABLE IF EXISTS employee_assignment_b2_backup_20260728;
CREATE TABLE employee_assignment_b2_backup_20260728 AS
SELECT * FROM employee_assignment;
```

**备份记录数**: ____
**执行状态**: □ 成功 □ 失败

### 5.2 迁移 SQL 执行

**执行时间**: ____:____

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

    INSERT INTO employee_assignment (...)
    SELECT ... FROM hse_employee_relation her WHERE her.is_deleted = false AND her.is_current = true
    ON CONFLICT ON CONSTRAINT uk_emp_assign_primary
    DO UPDATE SET ...;

    GET DIAGNOSTICS insert_count = ROW_COUNT;

    RAISE NOTICE '迁移记录数: % (基线: %), 异常记录数: %',
        insert_count, baseline_count, anomaly_count;

    IF insert_count < baseline_count * 0.98 OR insert_count > baseline_count * 1.02 THEN
        RAISE EXCEPTION '迁移行数异常: %, 预期范围 [%, %]',
            insert_count, FLOOR(baseline_count * 0.98), CEIL(baseline_count * 1.02);
    END IF;

    INSERT INTO migration_baseline (migration_id, metric_name, metric_value)
    VALUES ('B2_20260728', 'actual_migrate_count', insert_count)
    ON CONFLICT (migration_id, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value;
END $$;
```

**迁移记录数**: ____
**异常记录数**: ____
**RAISE NOTICE 输出**: ____
**执行状态**: □ 成功 □ 失败

**失败详情**（如有）:
```
____
```

### 5.3 数据一致性验证

**执行时间**: ____:____

| 验证项 | 预期结果 | 实际结果 | 状态 |
|--------|----------|----------|------|
| missing_employee | 0 | ____ | □ 通过 |
| missing_position | 0 | ____ | □ 通过 |
| missing_org | 0 | ____ | □ 通过 |
| overwritten_records | 记录数值 | ____ | □ 已记录 |

---

## 六、前端切换验证记录

### 6.1 前端代码修改确认

**确认时间**: ____:____

| 文件 | 修改内容 | 状态 |
|------|---------|------|
| OrgTransferModal.vue | team_id → org_unit_id (6处) | □ 已完成 |
| employee.ts | 清理旧字段 (5字段) | □ 已完成 |

### 6.2 前端编译验证

**执行时间**: ____:____

```bash
npm run type-check
```

**执行结果**: ____ errors
**执行状态**: □ 通过 □ 不通过

**错误信息**（如有）:
```
____
```

### 6.3 前端功能验证

**验证时间**: ____:____

| 功能 | 预期结果 | 实际结果 | 状态 |
|------|----------|----------|------|
| 员工列表查询 | 正常显示 | ____ | □ 通过 |
| 员工选择组件 | 正常工作 | ____ | □ 通过 |
| 调岗功能 | 调岗成功 | ____ | □ 通过 |
| 员工导入 | 导入成功 | ____ | □ 通过 |

### 6.4 前端控制台错误检查

**检查时间**: ____:____
**错误数量**: ____ 个
**执行状态**: □ 通过 □ 不通过

---

## 七、回滚演练记录

### 7.1 B-2 回滚演练

**演练时间**: ____:____
**演练策略**: □ 策略 1 □ 策略 2 □ 策略 3

| 操作 | 预期结果 | 实际结果 | 状态 |
|------|----------|----------|------|
| 删除迁移记录 | 删除 ____ 条 | 删除 ____ 条 | □ 成功 |
| 恢复覆盖记录 | 恢复 ____ 条 | 恢复 ____ 条 | □ 成功 |
| 全量恢复 | 恢复 ____ 条 | 恢复 ____ 条 | □ 成功 |

### 7.2 B-0 回滚演练

**演练时间**: ____:____
**演练策略**: □ 策略 1 □ 策略 2

| 操作 | 预期结果 | 实际结果 | 状态 |
|------|----------|----------|------|
| 临时表回滚 | 回滚 ____ 条 | 回滚 ____ 条 | □ 成功 |
| 备份表回滚 | 回滚 ____ 条 | 回滚 ____ 条 | □ 成功 |

---

## 八、性能指标记录

### 8.1 SQL 执行性能

**记录时间**: ____:____

| SQL 类型 | 执行时间 | 影响行数 | 性能评估 |
|---------|----------|----------|----------|
| Step 0 检查 SQL | ____ 秒 | - | □ 良好 |
| B-0 恢复 SQL | ____ 秒 | ____ 行 | □ 良好 |
| B-2 迁移 SQL | ____ 秒 | ____ 行 | □ 良好 |
| 数据验证 SQL | ____ 秒 | - | □ 良好 |

### 8.2 数据库性能监控

**记录时间**: ____:____

| 指标 | 迁移前 | 迁移后 | 变化 |
|------|--------|--------|------|
| numbackends | ____ | ____ | ____ |
| xact_commit | ____ | ____ | ____ |
| xact_rollback | ____ | ____ | ____ |
| tup_inserted | ____ | ____ | ____ |
| tup_updated | ____ | ____ | ____ |

### 8.3 应用启动性能

**记录时间**: ____:____

| 应用 | 启动时间 | 内存占用 | 状态 |
|------|----------|----------|------|
| 后端服务 | ____ 秒 | ____ MB | □ 正常 |
| 前端服务 | ____ 秒 | ____ MB | □ 正常 |

---

## 九、异常问题记录

### 9.1 问题清单

| # | 问题发生阶段 | 问题描述 | 影响范围 | 处理措施 | 处理结果 |
|---|-------------|---------|---------|---------|---------|
| 1 | ____ | ____ | ____ | ____ | ____ |
| 2 | ____ | ____ | ____ | ____ | ____ |
| 3 | ____ | ____ | ____ | ____ | ____ |

### 9.2 问题处理详情

#### 问题 1

**发生时间**: ____:____
**问题描述**: ____
**影响范围**: ____
**处理措施**: ____
**处理时间**: ____ 分钟
**处理结果**: ____

#### 问题 2

**发生时间**: ____:____
**问题描述**: ____
**影响范围**: ____
**处理措施**: ____
**处理时间**: ____ 分钟
**处理结果**: ____

---

## 十、执行总结

### 10.1 执行结果

| 阶段 | 执行状态 | 耗时 | 备注 |
|------|----------|------|------|
| 前置检查 | □ 通过 □ 不通过 | ____ 分钟 | ____ |
| Step 0 执行 | □ 通过 □ 不通过 | ____ 分钟 | ____ |
| B-0 恢复执行 | □ 通过 □ 不通过 | ____ 分钟 | ____ |
| B-1 验证 | □ 通过 □ 不通过 | ____ 分钟 | ____ |
| B-2 迁移执行 | □ 通过 □ 不通过 | ____ 分钟 | ____ |
| 数据一致性验证 | □ 通过 □ 不通过 | ____ 分钟 | ____ |
| 前端切换验证 | □ 通过 □ 不通过 | ____ 分钟 | ____ |
| 回滚演练 | □ 通过 □ 不通过 | ____ 分钟 | ____ |

### 10.2 最终结论

```
□ Dry Run 成功（可以进入生产迁移）
□ Dry Run 部分成功（需要修正后进入生产迁移）
□ Dry Run 失败（需要重新执行）
```

**结论说明**: ____

### 10.3 改进建议

| # | 改进项 | 改进原因 | 优先级 | 负责人 |
|---|--------|---------|--------|--------|
| 1 | ____ | ____ | □ 高 □ 中 □ 低 | ____ |
| 2 | ____ | ____ | □ 高 □ 中 □ 低 | ____ |
| 3 | ____ | ____ | □ 高 □ 中 □ 低 | ____ |

---

## 十一、签字确认

| 角色 | 姓名 | 签字 | 日期 |
|------|------|------|------|
| 数据迁移负责人 | | | |
| DBA | | | |
| 后端负责人 | | | |
| 前端负责人 | | | |
| QA 负责人 | | | |

---

> **文档结束**
>
> 本模板用于记录 Sprint-B v2.1 Dry Run 执行过程中的关键步骤和数据，所有记录必须在执行时实时填写，不得事后补录。