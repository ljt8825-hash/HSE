# Sprint-B 回滚演练记录

> **模板版本**: v1.0
> **编制日期**: 2026-07-28
> **配套文档**: 《Sprint-B Dry Run 验证报告 v1.0》
> **用途**: 记录回滚演练过程，验证回滚方案有效性

---

## 一、演练基本信息

| 项目 | 内容 |
|------|------|
| 演练日期 | ____ 年 __ 月 __ 日 |
| 演练环境 | □ 测试环境 □ 预生产环境 |
| 演练人员 | ____ |
| 数据库服务器 | ____ |
| 数据库名称 | ____ |
| 演练开始时间 | ____:____ |
| 演练结束时间 | ____:____ |
| 总耗时 | ____ 分钟 |

---

## 二、演练前准备

### 2.1 数据状态确认

**确认时间**: ____:____

| 数据项 | 迁移前数量 | 迁移后数量 | 差异 |
|--------|-----------|-----------|------|
| employee 活跃数 | ____ | ____ | +____ |
| employee 软删数 | ____ | ____ | -____ |
| employee_assignment 总数 | ____ | ____ | +____ |
| employee_assignment 迁移标记数 | 0 | ____ | +____ |

### 2.2 备份状态确认

**确认时间**: ____:____

| 备份项 | 备份表名 | 记录数 | 创建时间 | 状态 |
|--------|---------|--------|----------|------|
| B-0 恢复范围 | temp_b0_recover_ids_backup_20260728 | ____ | ____ | □ 存在 |
| B-2 employee_assignment | employee_assignment_b2_backup_20260728 | ____ | ____ | □ 存在 |

### 2.3 演练目标确认

```
□ 验证 B-0 回滚策略有效性
□ 验证 B-2 回滚策略有效性
□ 验证全量恢复能力
□ 测量回滚时间
□ 评估数据一致性
```

---

## 三、B-2 回滚演练

### 3.1 演练场景说明

**演练场景**: B-2 迁移后需要回滚到迁移前状态
**演练策略**: □ 策略 1 □ 策略 2 □ 策略 3
**预期结果**: employee_assignment 恢复到迁移前状态

---

### 3.2 策略 1: 仅回滚新增记录

> **适用场景**: 迁移前 employee_assignment 为空或迁移仅新增记录

#### 3.2.1 演练执行

**执行时间**: ____:____:____

**执行 SQL**:
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
- RAISE NOTICE: 删除迁移记录数: ____
- 执行状态: □ 成功 □ 失败
- 执行耗时: ____ 毫秒

#### 3.2.2 回滚验证

**验证时间**: ____:____:____

**验证 SQL**:
```sql
-- 验证迁移标记记录已清空
SELECT COUNT(*) AS migration_records
FROM employee_assignment
WHERE created_by = 'system_migration_b2';

-- 验证 employee_assignment 总数
SELECT COUNT(*) AS total_records
FROM employee_assignment;
```

**验证结果**:
- migration_records: ____（预期：0）
- total_records: ____（预期：等于迁移前数量）
- 验证状态: □ 通过 □ 不通过

#### 3.2.3 策略 1 总结

| 项目 | 结果 |
|------|------|
| 执行状态 | □ 成功 □ 失败 |
| 数据一致性 | □ 通过 □ 不通过 |
| 执行耗时 | ____ 毫秒 |
| 是否推荐 | □ 推荐 □ 不推荐 |

---

### 3.3 策略 2: 恢复 UPSERT 覆盖记录

> **适用场景**: 迁移前 employee_assignment 已有数据，且存在 UPSERT 覆盖

#### 3.3.1 演练执行

**执行时间**: ____:____:____

**执行 SQL**:
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

**执行结果**:
- RAISE NOTICE: 删除: ____, 恢复: ____
- 执行状态: □ 成功 □ 失败
- 执行耗时: ____ 毫秒

#### 3.3.2 回滚验证

**验证时间**: ____:____:____

**验证 SQL**:
```sql
-- 验证迁移标记记录已清空
SELECT COUNT(*) AS migration_records
FROM employee_assignment
WHERE created_by = 'system_migration_b2';

-- 验证 employee_assignment 总数
SELECT COUNT(*) AS total_records
FROM employee_assignment;

-- 验证覆盖记录已恢复
SELECT COUNT(*) AS recovered_records
FROM employee_assignment ea
JOIN employee_assignment_b2_backup_20260728 bak ON ea.id = bak.id
WHERE ea.org_unit_id = bak.org_unit_id
  AND ea.operation_unit_id IS NOT DISTINCT FROM bak.operation_unit_id
  AND ea.position_id = bak.position_id;
```

**验证结果**:
- migration_records: ____（预期：0）
- total_records: ____（预期：等于迁移前数量）
- recovered_records: ____
- 验证状态: □ 通过 □ 不通过

#### 3.3.3 策略 2 总结

| 项目 | 结果 |
|------|------|
| 执行状态 | □ 成功 □ 失败 |
| 数据一致性 | □ 通过 □ 不通过 |
| 执行耗时 | ____ 毫秒 |
| 是否推荐 | □ 推荐 □ 不推荐 |

---

### 3.4 策略 3: 全量恢复

> **适用场景**: 最后手段，需要完整恢复

#### 3.4.1 演练执行

**执行时间**: ____:____:____

**执行 SQL**:
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

**执行结果**:
- RAISE NOTICE: 全量恢复记录数: ____
- 执行状态: □ 成功 □ 失败
- 执行耗时: ____ 毫秒

#### 3.4.2 回滚验证

**验证时间**: ____:____:____

**验证 SQL**:
```sql
-- 验证 employee_assignment 总数
SELECT COUNT(*) AS total_records
FROM employee_assignment;

-- 验证数据完全一致
SELECT COUNT(*) AS diff_count
FROM (
    SELECT * FROM employee_assignment
    EXCEPT
    SELECT * FROM employee_assignment_b2_backup_20260728
) AS diff;
```

**验证结果**:
- total_records: ____（预期：等于备份表数量）
- diff_count: ____（预期：0）
- 验证状态: □ 通过 □ 不通过

#### 3.4.3 策略 3 总结

| 项目 | 结果 |
|------|------|
| 执行状态 | □ 成功 □ 失败 |
| 数据一致性 | □ 通过 □ 不通过 |
| 执行耗时 | ____ 毫秒 |
| 是否推荐 | □ 推荐（最后手段） |

---

## 四、B-0 回滚演练

### 4.1 演练场景说明

**演练场景**: B-0 恢复后需要回滚到恢复前状态
**演练策略**: □ 策略 1 □ 策略 2
**预期结果**: employee 恢复到恢复前状态（软删状态）

---

### 4.2 策略 1: 从临时表精准回滚

> **适用场景**: 会话未断开，临时表仍然存在

#### 4.2.1 演练执行

**执行时间**: ____:____:____

**前提条件检查**:
```sql
-- 检查临时表是否存在
SELECT to_regclass('pg_temp.temp_b0_recover_ids');
```

**检查结果**: □ 存在 □ 不存在

**执行 SQL**:
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

**执行结果**:
- RAISE NOTICE: 回滚记录数: ____
- 执行状态: □ 成功 □ 失败
- 执行耗时: ____ 毫秒

#### 4.2.2 回滚验证

**验证时间**: ____:____:____

**验证 SQL**:
```sql
-- 验证恢复的员工已回滚为软删状态
SELECT
    COUNT(*) AS total_in_temp,
    COUNT(CASE WHEN e.is_deleted = true THEN 1 END) AS rollback_deleted,
    COUNT(CASE WHEN e.is_deleted = false THEN 1 END) AS still_active
FROM temp_b0_recover_ids t
JOIN employee e ON e.id = t.employee_id;

-- 验证 employee 活跃数
SELECT COUNT(*) AS active_count
FROM employee
WHERE is_deleted = false;
```

**验证结果**:
- rollback_deleted: ____（预期：等于临时表记录数）
- still_active: ____（预期：0）
- active_count: ____（预期：等于恢复前活跃数）
- 验证状态: □ 通过 □ 不通过

#### 4.2.3 策略 1 总结

| 项目 | 结果 |
|------|------|
| 执行状态 | □ 成功 □ 失败 |
| 数据一致性 | □ 通过 □ 不通过 |
| 执行耗时 | ____ 毫秒 |
| 前提条件 | 会话未断开，临时表存在 |
| 是否推荐 | □ 推荐 □ 不推荐 |

---

### 4.3 策略 2: 从持久化备份表回滚

> **适用场景**: 会话已断开，临时表丢失

#### 4.3.1 演练执行

**执行时间**: ____:____:____

**前提条件检查**:
```sql
-- 检查备份表是否存在
SELECT to_regclass('temp_b0_recover_ids_backup_20260728');
SELECT COUNT(*) FROM temp_b0_recover_ids_backup_20260728;
```

**检查结果**: 
- 备份表状态: □ 存在 □ 不存在
- 备份记录数: ____

**执行 SQL**:
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
- RAISE NOTICE: 从备份表回滚记录数: ____
- 执行状态: □ 成功 □ 失败
- 执行耗时: ____ 毫秒

#### 4.3.2 回滚验证

**验证时间**: ____:____:____

**验证 SQL**:
```sql
-- 验证恢复的员工已回滚为软删状态
SELECT
    COUNT(*) AS total_in_backup,
    COUNT(CASE WHEN e.is_deleted = true THEN 1 END) AS rollback_deleted,
    COUNT(CASE WHEN e.is_deleted = false THEN 1 END) AS still_active
FROM temp_b0_recover_ids_backup_20260728 b
JOIN employee e ON e.id = b.employee_id;

-- 验证 employee 活跃数
SELECT COUNT(*) AS active_count
FROM employee
WHERE is_deleted = false;

-- 验证关联完整性
SELECT COUNT(*) AS missing_refs
FROM hse_employee_relation her
LEFT JOIN employee e ON her.employee_id = e.id AND e.is_deleted = false
WHERE her.is_deleted = false AND e.id IS NULL;
```

**验证结果**:
- rollback_deleted: ____（预期：等于备份表记录数）
- still_active: ____（预期：0）
- active_count: ____（预期：等于恢复前活跃数）
- missing_refs: ____（预期：正常值）
- 验证状态: □ 通过 □ 不通过

#### 4.3.3 策略 2 总结

| 项目 | 结果 |
|------|------|
| 执行状态 | □ 成功 □ 失败 |
| 数据一致性 | □ 通过 □ 不通过 |
| 执行耗时 | ____ 毫秒 |
| 前提条件 | 备份表存在 |
| 是否推荐 | □ 推荐 □ 不推荐 |

---

## 五、组合回滚演练

### 5.1 B-2 + B-0 组合回滚

> **演练场景**: 需要完全回滚整个迁移过程

#### 5.1.1 回滚顺序

```
1. 先回滚 B-2（employee_assignment）
2. 再回滚 B-0（employee）
```

#### 5.1.2 演练执行

**B-2 回滚执行时间**: ____:____:____
**B-0 回滚执行时间**: ____:____:____

**执行步骤**:
1. 执行 B-2 策略 ____ 回滚
2. 验证 B-2 回滚结果
3. 执行 B-0 策略 ____ 回滚
4. 验证 B-0 回滚结果
5. 验证整体数据一致性

#### 5.1.3 组合验证

**验证时间**: ____:____:____

**验证 SQL**:
```sql
-- 验证 employee 状态
SELECT
    COUNT(*) AS total,
    COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active,
    COUNT(CASE WHEN is_deleted = true THEN 1 END) AS deleted
FROM employee;

-- 验证 employee_assignment 状态
SELECT COUNT(*) AS total
FROM employee_assignment;

-- 验证迁移基线
SELECT * FROM migration_baseline
WHERE migration_id IN ('B0_20260728', 'B2_20260728')
ORDER BY migration_id, metric_name;
```

**验证结果**:
- employee active: ____（预期：等于初始基线）
- employee deleted: ____（预期：等于初始基线）
- employee_assignment total: ____（预期：等于初始基线）
- 验证状态: □ 通过 □ 不通过

#### 5.1.4 组合回滚总结

| 项目 | 结果 |
|------|------|
| B-2 回滚状态 | □ 成功 □ 失败 |
| B-0 回滚状态 | □ 成功 □ 失败 |
| 整体数据一致性 | □ 通过 □ 不通过 |
| 总执行耗时 | ____ 分钟 |

---

## 六、性能测试

### 6.1 回滚时间测试

#### 6.1.1 B-2 回滚时间

| 策略 | 数据量 | 执行时间 | 平均每条记录 |
|------|--------|----------|-------------|
| 策略 1 | ____ 条 | ____ ms | ____ ms/条 |
| 策略 2 | ____ 条 | ____ ms | ____ ms/条 |
| 策略 3 | ____ 条 | ____ ms | ____ ms/条 |

#### 6.1.2 B-0 回滚时间

| 策略 | 数据量 | 执行时间 | 平均每条记录 |
|------|--------|----------|-------------|
| 策略 1 | ____ 条 | ____ ms | ____ ms/条 |
| 策略 2 | ____ 条 | ____ ms | ____ ms/条 |

#### 6.1.3 组合回滚时间

| 操作 | 执行时间 |
|------|----------|
| B-2 回滚 | ____ ms |
| 验证 | ____ ms |
| B-0 回滚 | ____ ms |
| 验证 | ____ ms |
| **总计** | ____ ms |

---

## 七、风险评估

### 7.1 回滚风险清单

| 风险项 | 风险等级 | 影响 | 缓解措施 |
|--------|---------|------|---------|
| 备份表不存在 | 🔴 高 | 无法回滚 | Dry Run 前确认备份表创建 |
| 临时表丢失 | 🟡 中 | 策略 1 失效 | 使用策略 2 从备份表回滚 |
| 数据不一致 | 🔴 高 | 业务异常 | 回滚后完整验证 |
| 回滚时间过长 | 🟡 中 | 延长停机时间 | 提前测试回滚时间 |
| 关联数据丢失 | 🔴 高 | 数据完整性破坏 | 回滚后验证关联完整性 |

### 7.2 推荐回滚策略

| 场景 | 推荐策略 | 原因 |
|------|---------|------|
| 会话未断开 | B-0 策略 1 + B-2 策略 1 | 执行速度快，精准回滚 |
| 会话已断开 | B-0 策略 2 + B-2 策略 2 | 从备份表恢复，可靠性高 |
| 数据严重异常 | B-2 策略 3 + B-0 策略 2 | 全量恢复，确保数据完整 |

---

## 八、演练结论

### 8.1 演练结果汇总

| 演练项 | 执行状态 | 数据一致性 | 执行耗时 |
|--------|----------|-----------|----------|
| B-2 策略 1 | □ 成功 □ 失败 | □ 通过 □ 不通过 | ____ ms |
| B-2 策略 2 | □ 成功 □ 失败 | □ 通过 □ 不通过 | ____ ms |
| B-2 策略 3 | □ 成功 □ 失败 | □ 通过 □ 不通过 | ____ ms |
| B-0 策略 1 | □ 成功 □ 失败 | □ 通过 □ 不通过 | ____ ms |
| B-0 策略 2 | □ 成功 □ 失败 | □ 通过 □ 不通过 | ____ ms |
| 组合回滚 | □ 成功 □ 失败 | □ 通过 □ 不通过 | ____ ms |

### 8.2 最终结论

```
□ 所有回滚策略验证通过，可以进入生产迁移
□ 部分回滚策略验证通过，需修正后进入生产迁移
□ 回滚策略验证失败，需重新设计回滚方案
```

**结论说明**: ____

### 8.3 改进建议

| # | 改进项 | 改进原因 | 优先级 | 负责人 |
|---|--------|---------|--------|--------|
| 1 | ____ | ____ | □ 高 □ 中 □ 低 | ____ |
| 2 | ____ | ____ | □ 高 □ 中 □ 低 | ____ |
| 3 | ____ | ____ | □ 高 □ 中 □ 低 | ____ |

---

## 九、签字确认

| 角色 | 姓名 | 签字 | 日期 |
|------|------|------|------|
| 演练执行人 | | | |
| 数据迁移负责人 | | | |
| DBA | | | |
| QA 负责人 | | | |

---

## 附录 A: 回滚 SQL 脚本清单

### A.1 B-2 回滚脚本

**策略 1**:
```sql
DO $$
DECLARE deleted_count INTEGER;
BEGIN
    DELETE FROM employee_assignment WHERE created_by='system_migration_b2';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '删除迁移记录数: %', deleted_count;
END $$;
```

**策略 2**:
```sql
DO $$
DECLARE deleted_count INTEGER; recovered_count INTEGER;
BEGIN
    DELETE FROM employee_assignment WHERE created_by='system_migration_b2';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    INSERT INTO employee_assignment SELECT * FROM employee_assignment_b2_backup_20260728 backup WHERE NOT EXISTS (SELECT 1 FROM employee_assignment ea WHERE ea.id = backup.id) ON CONFLICT (id) DO UPDATE SET org_unit_id=EXCLUDED.org_unit_id, operation_unit_id=EXCLUDED.operation_unit_id, position_id=EXCLUDED.position_id, status=EXCLUDED.status, updated_at=NOW();
    GET DIAGNOSTICS recovered_count = ROW_COUNT;
    RAISE NOTICE '删除: %, 恢复: %', deleted_count, recovered_count;
END $$;
```

**策略 3**:
```sql
DO $$
DECLARE restored_count INTEGER;
BEGIN
    TRUNCATE employee_assignment;
    INSERT INTO employee_assignment SELECT * FROM employee_assignment_b2_backup_20260728;
    GET DIAGNOSTICS restored_count = ROW_COUNT;
    RAISE NOTICE '全量恢复记录数: %', restored_count;
END $$;
```

### A.2 B-0 回滚脚本

**策略 1**:
```sql
DO $$
DECLARE rollback_count INTEGER;
BEGIN
    UPDATE employee SET is_deleted=true, updated_at=NOW() WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids) AND is_deleted=false;
    GET DIAGNOSTICS rollback_count = ROW_COUNT;
    RAISE NOTICE '回滚记录数: %', rollback_count;
END $$;
```

**策略 2**:
```sql
DO $$
DECLARE rollback_count INTEGER;
BEGIN
    UPDATE employee SET is_deleted=true, updated_at=NOW() WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids_backup_20260728) AND is_deleted=false;
    GET DIAGNOSTICS rollback_count = ROW_COUNT;
    RAISE NOTICE '从备份表回滚记录数: %', rollback_count;
END $$;
```

---

## 附录 B: 回滚决策树

```
需要回滚
    ↓
判断回滚范围
    ├─ 仅 B-2 问题 → 执行 B-2 回滚
    ├─ 仅 B-0 问题 → 执行 B-0 回滚
    └─ 完全回滚 → 先 B-2 后 B-0
    ↓
判断会话状态
    ├─ 会话未断开 → 使用临时表策略
    └─ 会话已断开 → 使用备份表策略
    ↓
执行回滚
    ↓
验证数据一致性
    ├─ 通过 → 记录回滚结果
    └─ 不通过 → 分析原因，必要时全量恢复
    ↓
记录回滚日志
    ↓
通知相关人员
```

---

> **文档结束**
>
> 本记录用于验证 Sprint-B v2.1 回滚方案的有效性，确保生产迁移时具备可靠的回滚能力。所有演练必须在测试环境执行，验证通过后方可进入生产迁移。