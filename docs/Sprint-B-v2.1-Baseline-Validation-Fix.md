# Sprint-B v2.1 Baseline Validation Fix Report

> **报告版本**: v1.0
> **编制日期**: 2026-07-28
> **修复目标**: 修复 `baseline_count` 为 NULL 时动态校验失效的问题
> **影响范围**: B-0 Step 3、B-2 Step 2

---

## 审计状态（回填审计 · P0-2 · 2026-07-28）

> 本小节由 P0-2 回填审计任务添加，记录文档填写完整度与待办。
> 红线：禁止伪造 PASS / 执行结果；禁止代签任何角色。

| 维度 | 状态 | 说明 |
|------|------|------|
| 文档完整度 | 约 65% | 测试环境数据已据 Dry Run R2 回填；生产环境数据合法待回填；签字栏禁代签 |
| §4.1 基线存在场景 | ☑ 已填（测试环境） | B-0 / B-2 基线=实际、偏差 0%，数据来源 Dry Run R2 §3.2 / §3.4 |
| §4.2 基线不存在场景 | ☐ 待生产回填 | Dry Run R2 中基线已存在，未单独触发；待生产 Step 0 回填 |
| §4.3 行数异常场景 | ☐ 待生产回填 | Dry Run R2 未发生异常，未触发；待生产 Step 0 回填 |
| §5 修复确认 | ◐ 部分已填 | SQL 修复 / Runbook 同步已确认；日志模板同步待核查；Dry Run 通过依报告声明 |
| 签字栏（§五） | 🔒 禁代签 | 修复人 / 审核人 / 日期保持空白，禁止代签 |

**图例**：☑ 已填 ｜ ☐ 待填（合法待生产回填） ｜ ◐ 部分已填 ｜ 🔒 禁代签

> 📌 **数据来源标注**：本章节回填的 `1287` / `3156` / `偏差 0%` 均来自《Sprint-B-v2.1-DryRun-Round2-Report.md》（测试环境），**不代表生产环境真实值**。生产环境须在 Step 0 重新基线化（Check 0.12）后回填，禁止直接沿用测试环境数值作为生产结论。

---

## 一、问题描述

### 1.1 原 SQL 逻辑

在 B-0 Step 3 和 B-2 Step 2 的 `DO $$` 块中，原逻辑如下：

```sql
SELECT metric_value INTO baseline_count
FROM migration_baseline
WHERE migration_id = 'B0_20260728' AND metric_name = 'recover_id_count';

-- ... 执行 UPDATE/INSERT ...

IF rec_count < baseline_count * 0.98 OR rec_count > baseline_count * 1.02 THEN
    RAISE EXCEPTION '...';
END IF;
```

### 1.2 风险

当 `migration_baseline` 表中不存在对应的基线记录时，`SELECT INTO` 会将 `baseline_count` 设置为 `NULL`。

在 PostgreSQL 中，任何数值与 `NULL` 的比较结果都是 `NULL`，而 `IF NULL THEN ... END IF` 不会执行 `THEN` 分支。

这意味着：
- 动态校验会**静默失效**。
- 即使 `rec_count` 严重偏离预期，也不会触发 `RAISE EXCEPTION`。

### 1.3 严重级别

🟡 **P1 级必须修复**

---

## 二、修复方案

### 2.1 修复原则

1. 保持原有的异常机制（`RAISE EXCEPTION`）不变。
2. 当基线不存在时，明确跳过校验并发出 `NOTICE` 提醒，而不是静默失效。
3. 不隐藏问题，便于后续排查。

### 2.2 修改后 SQL（B-0 Step 3）

```sql
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
    IF baseline_count IS NULL THEN
        RAISE NOTICE '基线不存在，跳过动态校验';
    ELSIF rec_count < baseline_count * 0.98 OR rec_count > baseline_count * 1.02 THEN
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

### 2.3 修改后 SQL（B-2 Step 2）

```sql
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

    -- 7.5.1 主迁移（status 映射与 Runbook-Final §7.7 / 04_B2_Assignment_Migration.sql L140-151 完全一致）
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

    -- 异常记录
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
        'unknown_status_blocked' AS anomaly_type
    FROM hse_employee_relation
    WHERE is_deleted = false
      AND status NOT IN ('active', 'pending', 'inactive', 'leave', 'resigned', 'retired', 'dismissed', 'returned');

    GET DIAGNOSTICS anomaly_count = ROW_COUNT;

    RAISE NOTICE '迁移记录数: % (基线: %), 异常记录数: %',
        insert_count, baseline_count, anomaly_count;

    -- 动态校验（允许 2% 误差）
    IF baseline_count IS NULL THEN
        RAISE NOTICE '基线不存在，跳过动态校验';
    ELSIF insert_count < baseline_count * 0.98 OR insert_count > baseline_count * 1.02 THEN
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

---

## 三、影响范围

| 文档 | 章节 | 影响 |
|------|------|------|
| Sprint-B 数据迁移执行 Runbook v2.1 | 第五章 5.5 B-0 Step 3 | 需更新 SQL |
| Sprint-B 数据迁移执行 Runbook v2.1 | 第七章 7.5 B-2 Step 2 | 需更新 SQL |
| Sprint-B SQL执行日志模板 | 二、2.3 和 四、4.2 | 需记录新的 RAISE NOTICE 输出 |
| Sprint-B Dry Run 验证报告 | 五、5.3 和 七、7.2 | 需使用更新后的 SQL |

---

## 四、测试结果

### 4.1 测试场景 1：基线存在

**输入**: `migration_baseline` 中存在 `recover_id_count` / `her_current_count`
**预期**: 正常执行动态校验
**实际**: B-0：基线 recover_id_count=1287，实际 actual_recover_count=1287，偏差 0%；B-2：基线 her_current_count=3156，实际 actual_migrate_count=3156，偏差 0%，anomaly_count=0（数据来源：Dry Run R2 §3.2 / §3.4，**测试环境**）
**结果**: □ PASS（依据 Dry Run R2 测试环境执行结果） □ FAIL
> ⚠️ 生产环境须 Step 0 重新基线化（Check 0.12）后复核，禁止直接沿用测试环境数值。

### 4.2 测试场景 2：基线不存在

**输入**: `migration_baseline` 中不存在对应基线
**预期**: 输出 `RAISE NOTICE '基线不存在，跳过动态校验'`，不抛出异常
**实际**: 待生产 Step 0 回填（Dry Run R2 中基线已存在，此分支未单独触发执行）
**结果**: □ PASS □ FAIL（待生产验证）

### 4.3 测试场景 3：行数异常

**输入**: `rec_count` 偏离基线 > 2%
**预期**: 抛出 `RAISE EXCEPTION`
**实际**: 待生产 Step 0 回填（Dry Run R2 中未发生行数异常，未触发 RAISE EXCEPTION）
**结果**: □ PASS □ FAIL（待生产验证）

---

## 五、修复确认

| 检查项 | 状态 | 说明 |
|--------|------|------|
| B-0 Step 3 已修复 | ☑ 是 | SQL 已含 `IF baseline_count IS NULL` 分支（§2.2），与 Runbook-Final §5.5 一致 |
| B-2 Step 2 已修复 | ☑ 是 | SQL 已含 `IF baseline_count IS NULL` 分支（§2.3），与 Runbook-Final §7.7 一致 |
| Runbook 已同步更新 | ☑ 是 | Runbook-Final §5.5 / §7.7 已含修复分支 |
| SQL 执行日志模板已同步更新 | ◐ 待确认 | 需核查《Sprint-B SQL执行日志模板.md》是否含新 RAISE NOTICE 输出 |
| Dry Run 第二轮测试通过 | ☑ 是（依报告声明） | Dry Run R2 §二整体结论 PASS；但该报告签字空白、未附执行 SQL 文本，生产前须复核 |

**修复人**: ______________  🔒 禁代签
**审核人**: ______________  🔒 禁代签
**日期**: ____ 年 __ 月 __ 日

> 🔒 **禁止代签**：修复人 / 审核人 / 日期保持空白，须由实际执行与审核人员人工签字。TRAE 不代签任何角色。

---

## 六、变更记录

| # | 变更项 | 原内容 | 修改后内容 | 修改原因 |
|---|--------|--------|-----------|---------|
| 1 | B-0 Step 3 动态校验 | `IF rec_count < baseline_count * 0.98 ...` | 增加 `IF baseline_count IS NULL THEN RAISE NOTICE '基线不存在，跳过动态校验'; ELSIF ...` | 避免基线不存在时校验静默失效 |
| 2 | B-2 Step 2 动态校验 | `IF insert_count < baseline_count * 0.98 ...` | 增加 `IF baseline_count IS NULL THEN RAISE NOTICE '基线不存在，跳过动态校验'; ELSIF ...` | 避免基线不存在时校验静默失效 |

---

> **文档结束**
>
> 本报告记录 Sprint-B v2.1 基线校验逻辑的修复过程。修复后的 SQL 在基线不存在时会明确提示并跳过校验，避免静默失效；在基线存在时仍保持原有的异常校验机制。