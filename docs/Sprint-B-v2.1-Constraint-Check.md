# Sprint-B v2.1 Constraint Check Report

> **报告版本**: v1.0
> **编制日期**: 2026-07-28
> **检查目标**: 确认 `employee_assignment` 表上的 `uk_emp_assign_primary` 唯一约束存在且定义正确
> **检查环境**: 测试环境

---

## 审计状态（回填审计 · P0-2 · 2026-07-28）

> 本小节由 P0-2 回填审计任务添加，记录文档填写完整度与待办。
> 红线：禁止伪造 PASS / 执行结果；禁止代签任何角色。

| 维度 | 状态 | 说明 |
|------|------|------|
| 文档完整度 | 约 60% | 开发环境结果已如实填写；生产环境验证项与签字栏为合法待回填 / 禁代签项，不计入"缺失" |
| 开发环境检查（§二） | ☑ 已填 | FAIL（约束不存在，仅 1 条记录，不影响功能） |
| 生产环境约束检查（§二 PASS/FAIL 选项） | ☐ 待生产回填 | 待生产 Step 0 Check 0.7 实测，禁止代签 |
| 生产环境创建 SQL 执行（§三） | ☐ 待生产回填 | 待生产 Step 0 Check 0.7（已写明"仅生产/准生产执行"） |
| 生产环境创建后验证（§四） | ☐ 待生产回填 | 待生产 Step 0 Check 0.7 |
| 签字栏（§五） | 🔒 禁代签 | 保持空白，待 DBA 在生产环境验证后签字 |

**图例**：☑ 已填 ｜ ☐ 待填（合法待生产回填） ｜ 🔒 禁代签（须人工签字）

> ⚠️ **编号说明**：用户指令原文为 "Step 0 Check 0.5"，但经核对 Runbook-Final §4.7，`uk_emp_assign_primary` 唯一索引验证对应 **Check 0.7**（Check 0.5 为 `employee_assignment` 表存在性检查）。为避免引入编号矛盾，本回填统一采用 **Check 0.7**。如用户确指其他含义，请告知修正。

---

## 一、检查 SQL

```sql
-- 检查 uk_emp_assign_primary 是否存在
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'employee_assignment'
  AND indexname = 'uk_emp_assign_primary';
```

## 二、检查结果

**执行时间**: 2026-07-28 14:05:00（开发环境实测）

**执行结果**:

| indexname | indexdef |
|-----------|----------|
| （无记录） | （无记录） |

**检查结论**:

- [x] **FAIL**（开发环境）: `uk_emp_assign_primary` 在当前开发环境**不存在**，`employee_assignment` 仅 1 条记录（TEST001），暂不需要此约束
- [ ] **PASS**: `uk_emp_assign_primary` 存在，且 `indexdef` 包含 `WHERE (is_primary = true AND is_current = true AND is_deleted = false)`（生产环境待 Step 0 Check 0.7 回填）
- [ ] **FAIL**: `uk_emp_assign_primary` 不存在或定义不正确（生产环境待 Step 0 Check 0.7 回填）

> ⚠️ **重要**：开发环境仅有 1 条 `employee_assignment` 记录，不影响功能。**生产环境 Step 0 Check 0.7 必须实测此约束**，若不存在需在 Step 0 阶段创建。

---

## 三、创建 SQL（如不存在）

> ⚠️ **开发环境不执行此 SQL**。仅在生产迁移 Step 0 Check 0.7 阶段，若约束不存在时执行。

如果检查结果为 FAIL，执行以下 SQL 创建约束（**仅在生产/准生产环境执行**）：

```sql
-- 创建部分唯一索引，确保每个员工在当前主岗位(is_primary=true AND is_current=true AND is_deleted=false)上只有一条记录
CREATE UNIQUE INDEX uk_emp_assign_primary
ON employee_assignment (employee_id)
WHERE is_primary = true
  AND is_current = true
  AND is_deleted = false;
```

**执行时间**: 待生产 Step 0 Check 0.7 回填

**执行结果**: 待生产 Step 0 Check 0.7 回填

```
CREATE INDEX
```

## 四、创建后验证

```sql
-- 再次检查 uk_emp_assign_primary 是否存在
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'employee_assignment'
  AND indexname = 'uk_emp_assign_primary';
```

**执行时间**: 待生产 Step 0 Check 0.7 回填

**执行结果**: 待生产 Step 0 Check 0.7 回填

| indexname | indexdef |
|-----------|----------|
| （待回填） | （待回填） |

**验证结论**:

- [ ] **PASS**: 约束创建成功且定义正确
- [ ] **FAIL**: 约束创建失败或定义不正确

---

## 五、总结

| 检查项 | 结果 |
|--------|------|
| 初始检查 | ⚠️ 开发环境 FAIL（约束不存在，仅 1 条记录，不影响）；生产待回填 |
| 创建操作 | □ 无需创建 □ 成功 □ 失败（待生产回填） |
| 最终验证 | □ PASS □ FAIL（待生产回填） |

> ⚠️ **禁止代签**：以下签字栏需人工签字，TRAE 不代签。

**负责人签字**: ______________
**日期**: ____ 年 __ 月 __ 日

> 🔒 **禁止代签 — 待 DBA 在生产环境验证后签字**：本栏保持空白，禁止任何自动化脚本或第三方代签。生产环境 Step 0 Check 0.7 实测 `uk_emp_assign_primary` 存在且定义正确后，方由 DBA 人工签字确认。

---

> **文档结束**
>
> 本报告记录 `uk_emp_assign_primary` 唯一约束的检查、创建和验证过程。该约束是 B-2 迁移 SQL 中 `ON CONFLICT ON CONSTRAINT` 子句的必要条件，必须确保其存在且定义正确。