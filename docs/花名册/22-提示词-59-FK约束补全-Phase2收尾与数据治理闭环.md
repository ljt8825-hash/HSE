# 提示词-59：FK 约束补全 Phase 2 收尾 — 数据治理闭环

> 编号：提示词-59
> 日期：2026-07-30
> 性质：**数据治理收尾（P2）**
> 前置：提示词-58 执行报告（FK Phase 2 已完成 16 条新建，4 条跳过）
> 关联：提示词-53（FK Phase 1）、提示词-58（FK Phase 2）
> 改动文件：3 个（1 个审计增强 + 1 个清洗脚本 + 1 个治理跟踪文档）

---

## 0. 背景

提示词-58（FK Phase 2）已为 12 张表新建 16 条 FK 约束，数据库 FK 总数从 1 条增至 17 条。但执行过程中发现 **4 条 FK 无法创建**，原因分两类：

| 类别 | 表.列 | 跳过原因 | 影响 |
|------|-------|---------|------|
| NOT NULL 孤儿 | `hse_deduction_adjustment.adjusted_by` | 4 条孤儿引用，列 NOT NULL，无法 SET NULL | 扣分调整记录引用了不存在的 employee |
| NOT NULL 孤儿 | `hse_assessment_audit_log.operator_id` | 49 条孤儿引用，列 NOT NULL，无法 SET NULL | 审计日志操作人引用了不存在的 employee |
| 列缺失 | `hse_events.personnel_id` | 表中不存在该列 | 事件表缺少人员关联字段 |
| 列缺失 | `hse_reviews.reviewer_id` | 表中不存在该列（仅有 `reviewer_name`） | 复核表仅存姓名文本，无结构化关联 |

本轮任务：对这 4 条遗留项生成数据治理方案，将人工决策点收敛为可追踪的闭环。

---

## 1. 任务 A：孤儿数据探查与清洗脚本

### 1.1 创建增强审计脚本

创建文件 `server/sql/hse_fk_orphan_detail_phase2.sql`：

```sql
-- ============================================================
-- FK Phase 2 遗留孤儿数据详细探查
-- 目的：输出每条孤儿记录的完整上下文，供业务方决策
-- 执行方式：只读查询，不修改任何数据
-- ============================================================

-- ========================
-- A1. hse_deduction_adjustment.adjusted_by 孤儿
-- ========================
\echo '=== A1. hse_deduction_adjustment.adjusted_by 孤儿记录 ==='
SELECT
    a.id AS adjustment_id,
    a.adjusted_by AS orphan_employee_id,
    a.adjustment_type,
    a.adjustment_amount,
    a.reason,
    a.created_at,
    a.is_deleted,
    CASE WHEN a.is_deleted = true THEN '已软删除（可忽略）' ELSE '活跃记录（需处理）' END AS action_note
FROM hse_deduction_adjustment a
LEFT JOIN employee e ON a.adjusted_by = e.id AND e.is_deleted = false
WHERE a.adjusted_by IS NOT NULL
  AND e.id IS NULL
ORDER BY a.is_deleted, a.created_at DESC;

-- 仅活跃记录的孤儿
\echo '--- 活跃孤儿（is_deleted=false）---'
SELECT count(*) AS active_orphan_count
FROM hse_deduction_adjustment a
LEFT JOIN employee e ON a.adjusted_by = e.id AND e.is_deleted = false
WHERE a.adjusted_by IS NOT NULL
  AND e.id IS NULL
  AND a.is_deleted = false;

-- ========================
-- A2. hse_assessment_audit_log.operator_id 孤儿
-- ========================
\echo '=== A2. hse_assessment_audit_log.operator_id 孤儿记录 ==='
SELECT
    l.id AS log_id,
    l.operator_id AS orphan_employee_id,
    l.action_type,
    l.target_type,
    l.target_id,
    l.created_at,
    l.is_deleted,
    CASE WHEN l.is_deleted = true THEN '已软删除（可忽略）' ELSE '活跃记录（需处理）' END AS action_note
FROM hse_assessment_audit_log l
LEFT JOIN employee e ON l.operator_id = e.id AND e.is_deleted = false
WHERE l.operator_id IS NOT NULL
  AND e.id IS NULL
ORDER BY l.is_deleted, l.created_at DESC;

-- 仅活跃记录的孤儿
\echo '--- 活跃孤儿（is_deleted=false）---'
SELECT count(*) AS active_orphan_count
FROM hse_assessment_audit_log l
LEFT JOIN employee e ON l.operator_id = e.id AND e.is_deleted = false
WHERE l.operator_id IS NOT NULL
  AND e.id IS NULL
  AND l.is_deleted = false;

-- ========================
-- A3. hse_events 列存在性确认
-- ========================
\echo '=== A3. hse_events 列清单 ==='
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'hse_events'
  AND column_name IN ('personnel_id', 'reporter_id', 'handler_id', 'responsible_person_id')
ORDER BY ordinal_position;

-- ========================
-- A4. hse_reviews 列存在性确认
-- ========================
\echo '=== A4. hse_reviews 列清单 ==='
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'hse_reviews'
  AND column_name IN ('reviewer_id', 'reviewer_name', 'reviewed_by')
ORDER BY ordinal_position;
```

### 1.2 创建清洗脚本

创建文件 `server/sql/hse_fk_orphan_cleanup_phase2.sql`：

```sql
-- ============================================================
-- FK Phase 2 遗留孤儿清洗脚本
-- 日期：2026-07-30
-- 前置：hse_fk_orphan_detail_phase2.sql 探查完成
-- ⚠️ 执行前必须 pg_dump 全库备份
-- ⚠️ 清洗后需业务方确认，再补建 FK
-- ============================================================

BEGIN;

-- ========================
-- B1. hse_deduction_adjustment.adjusted_by 清洗
-- ========================
-- 策略：软删除记录（is_deleted=true）置 NULL；活跃记录保留待人工确认
-- 如 4 条全部为 is_deleted=true，则清洗后可直接建 FK

UPDATE hse_deduction_adjustment
SET adjusted_by = NULL
WHERE adjusted_by IS NOT NULL
  AND is_deleted = true
  AND adjusted_by NOT IN (SELECT id FROM employee WHERE is_deleted = false);

-- 检查活跃孤儿（如仍有记录，需人工介入）
DO $$
DECLARE
    active_count INTEGER;
BEGIN
    SELECT count(*) INTO active_count
    FROM hse_deduction_adjustment
    WHERE adjusted_by IS NOT NULL
      AND is_deleted = false
      AND adjusted_by NOT IN (SELECT id FROM employee WHERE is_deleted = false);

    IF active_count > 0 THEN
        RAISE NOTICE '⚠️ 仍有 % 条活跃孤儿，无法建 FK，需人工介入', active_count;
    ELSE
        RAISE NOTICE '✅ 无活跃孤儿，可建 FK';
    END IF;
END $$;

-- ========================
-- B2. hse_assessment_audit_log.operator_id 清洗
-- ========================
-- 策略：同上，软删除置 NULL；活跃待人工

UPDATE hse_assessment_audit_log
SET operator_id = NULL
WHERE operator_id IS NOT NULL
  AND is_deleted = true
  AND operator_id NOT IN (SELECT id FROM employee WHERE is_deleted = false);

DO $$
DECLARE
    active_count INTEGER;
BEGIN
    SELECT count(*) INTO active_count
    FROM hse_assessment_audit_log
    WHERE operator_id IS NOT NULL
      AND is_deleted = false
      AND operator_id NOT IN (SELECT id FROM employee WHERE is_deleted = false);

    IF active_count > 0 THEN
        RAISE NOTICE '⚠️ 仍有 % 条活跃孤儿，无法建 FK，需人工介入', active_count;
    ELSE
        RAISE NOTICE '✅ 无活跃孤儿，可建 FK';
    END IF;
END $$;

COMMIT;
```

---

## 2. 任务 B：列缺失项的 DDL 方案

### 2.1 hse_events 人员关联列

当前 `hse_events` 表的列清单需通过探查确认。若 `personnel_id` 确实不存在，不创建该列 —— 提示词-58 给出的该列名可能为**提示词假设偏差**，需以 `information_schema` 实际列清单为准。

**执行规则**：
- 若探查发现 `hse_events` 已有其他人员关联列（如 `reporter_id`、`handler_id`），则仅记录现状，不新增列
- 若确实需要新增人员关联列，需业务方提出明确需求后再 `ALTER TABLE`，本轮不主动加列

### 2.2 hse_reviews 结构化复核人

当前 `hse_reviews` 仅有 `reviewer_name`（文本），无 `reviewer_id`（结构化关联）。若后续需关联员工表，方案为：

```sql
-- 仅在业务方确认需要时执行，本轮不执行
ALTER TABLE hse_reviews ADD COLUMN reviewer_id BIGINT;
-- 回填逻辑：通过 reviewer_name 匹配 employee.name（需去重策略）
-- 回填完成后建 FK：
-- ALTER TABLE hse_reviews ADD CONSTRAINT fk_reviews_reviewer
--   FOREIGN KEY (reviewer_id) REFERENCES employee(id) ON DELETE SET NULL;
```

**本轮不执行上述 DDL**，仅记录为治理跟踪项。

---

## 3. 任务 C：FK 遗留补建

在任务 A 清洗完成且业务方确认后，执行以下补建：

```sql
-- 仅当清洗后无活跃孤儿时执行
BEGIN;

-- adjusted_by（清洗后）
ALTER TABLE hse_deduction_adjustment
  ADD CONSTRAINT IF NOT EXISTS fk_deduction_adjust_adjusted_by
    FOREIGN KEY (adjusted_by) REFERENCES employee(id)
    ON DELETE SET NULL;

-- operator_id（清洗后）
ALTER TABLE hse_assessment_audit_log
  ADD CONSTRAINT IF NOT EXISTS fk_assessment_audit_operator
    FOREIGN KEY (operator_id) REFERENCES employee(id)
    ON DELETE SET NULL;

COMMIT;
```

> **注意**：上述 FK 创建受清洗结果制约。若清洗后仍有活跃孤儿，继续跳过，不建 FK。

---

## 4. 任务 D：生成治理跟踪文档

创建文件 `docs/花名册/23-FK-Phase2-遗留项治理跟踪.md`，包含以下内容：

### 4.1 跟踪表

| 编号 | 表.列 | 类型 | 当前状态 | 阻塞条件 | 负责人 | 预计闭环 |
|------|-------|------|---------|---------|--------|---------|
| FK-01 | `hse_deduction_adjustment.adjusted_by` | NOT NULL 孤儿 | 待清洗 | 活跃孤儿需业务方确认 | (待指定) | (待指定) |
| FK-02 | `hse_assessment_audit_log.operator_id` | NOT NULL 孤儿 | 待清洗 | 活跃孤儿需业务方确认 | (待指定) | (待指定) |
| FK-03 | `hse_events.personnel_id` | 列缺失 | 待确认 | 需确认是否为真需求 | (待指定) | (待指定) |
| FK-04 | `hse_reviews.reviewer_id` | 列缺失 | 待确认 | 需业务方提出结构化关联需求 | (待指定) | (待指定) |

### 4.2 清洗执行记录模板

```markdown
| 步骤 | 执行时间 | 执行人 | 结果 | 备注 |
|------|---------|--------|------|------|
| 全库备份 | | | | |
| 孤儿探查 | | | | |
| 软删除清洗 | | | | |
| 活跃孤儿确认 | | | | |
| FK 补建 | | | | |
| 验证 | | | | |
```

### 4.3 决策记录模板

```markdown
| 编号 | 决策日期 | 决策人 | 决策 | 依据 |
|------|---------|--------|------|------|
| FK-01 | | | | |
| FK-02 | | | | |
| FK-03 | | | | |
| FK-04 | | | | |
```

---

## 5. 改动范围

| 文件 | 改动 | 类型 |
|------|------|------|
| `server/sql/hse_fk_orphan_detail_phase2.sql` | 新建：孤儿详细探查脚本 | SQL |
| `server/sql/hse_fk_orphan_cleanup_phase2.sql` | 新建：孤儿清洗脚本（含活跃孤儿门控） | SQL |
| `docs/花名册/23-FK-Phase2-遗留项治理跟踪.md` | 新建：治理跟踪文档 | 文档 |

---

## 6. 执行步骤

### Step 1：孤儿探查
```bash
psql -U postgres -d safety_dashboard -f server/sql/hse_fk_orphan_detail_phase2.sql
```
记录探查结果，区分活跃孤儿 vs 软删除孤儿。

### Step 2：清洗执行
```bash
# 先备份
pg_dump -U postgres -d safety_dashboard -Fc -f server/sql/_backup_before_fk59_$(date +%Y%m%d_%H%M%S).dump

# 清洗
psql -U postgres -d safety_dashboard -f server/sql/hse_fk_orphan_cleanup_phase2.sql
```

### Step 3：FK 补建（条件执行）
仅当清洗后无活跃孤儿时执行 FK 补建 SQL（见 §3）。

### Step 4：生成治理跟踪文档
填充 `23-FK-Phase2-遗留项治理跟踪.md` 中的探查结果和清洗结果。

### Step 5：验证
```sql
-- FK 总数验证
SELECT count(*) AS total_fk FROM pg_constraint WHERE contype = 'f';

-- 确认遗留项状态
SELECT
    'hse_deduction_adjustment' AS tbl,
    count(*) AS orphan_count
FROM hse_deduction_adjustment
WHERE adjusted_by IS NOT NULL
  AND is_deleted = false
  AND adjusted_by NOT IN (SELECT id FROM employee WHERE is_deleted = false)
UNION ALL
SELECT
    'hse_assessment_audit_log',
    count(*)
FROM hse_assessment_audit_log
WHERE operator_id IS NOT NULL
  AND is_deleted = false
  AND operator_id NOT IN (SELECT id FROM employee WHERE is_deleted = false);
```

---

## 7. 验证清单

- [ ] 孤儿探查脚本执行完成，输出每条孤儿记录的完整上下文
- [ ] 区分活跃孤儿 vs 软删除孤儿数量
- [ ] 软删除孤儿已清洗（SET NULL）
- [ ] 活跃孤儿已记录到治理跟踪文档，标注需人工确认
- [ ] 若清洗后无活跃孤儿，FK 补建执行成功
- [ ] `pg_constraint` 查询确认 FK 总数变化
- [ ] 治理跟踪文档已生成，包含探查结果和清洗记录
- [ ] 列缺失项（FK-03、FK-04）已记录到跟踪文档，待业务方确认

---

## 8. 红线约束

- 仅操作 FK 遗留项相关表，不触碰其他表
- 不修改业务代码、路由、菜单、组件库
- 清洗脚本必须先探查再执行，不得盲洗
- NOT NULL 活跃孤儿不得强制 SET NULL，必须标记人工介入
- 列缺失项（FK-03、FK-04）本轮不执行 DDL，仅记录跟踪
- 所有清洗操作必须有 `pg_dump` 前置备份

---

## 9. FK 补全终态总览

| Phase | 提示词 | 新建 FK | 跳过 | 最终状态 |
|-------|--------|:------:|:----:|---------|
| Phase 1 | 53 | 22 | 0 | ✅ 已生成（待执行） |
| Phase 2 | 58 | 16 | 5 | ✅ 16 已建，1 已有 FK |
| **收尾** | **59** | **0~2** | **2~4** | **待执行** |
| **合计** | — | **38~40** | **2~4** | — |

> 注：收尾阶段最多补建 2 条 FK（adjusted_by + operator_id），取决于清洗结果。列缺失 2 项留待业务方决策。

---

> 编制：Senior Developer（高级开发工程师）
> 关联：`20-提示词-58-FK约束补全-Phase2.md`、`21-会话总结-提示词57与58-supervisor与FK补全.md`