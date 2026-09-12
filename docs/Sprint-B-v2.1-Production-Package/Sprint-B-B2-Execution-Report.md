# Sprint-B B-2 执行报告

> **阶段**: B-2 — employee_assignment 迁移
> **执行顺序**: 第 4 阶段（B-1 通过后）
> **风险等级**: High
> **阻断级别**: P0
> **会话要求**: 必须与 B-2 全流程在同一会话中执行

> 📌 **数据来源声明（P1-3 回填 · 2026-07-29）**：本报告「实际值 / 耗时」等列均提取自《Sprint-B-v2.1-DryRun-Round2-Report.md》§3.4（**测试环境** Dry Run）。**测试环境产物，不可外推为生产基线**。生产环境执行时须以 Runbook Check 0.12 重新采集真实 `her_current_count` 后回填，禁止直接沿用下方测试环境数值。Dry Run R2 未留痕的字段一律标注「Dry Run 原始数据未留痕」，禁止编造。

---

## 执行信息

| 项目 | 内容 |
|------|------|
| 执行时间 | 2026-07-28 14:16 ~ 14:19（来源 Dry Run R2 §3.4 时间线） |
| 执行人员 | 数据迁移负责人 / DBA / 后端负责人（来源 Dry Run R2 §一） |
| 执行SQL | `02_SQL/04_B2_Assignment_Migration.sql` |
| 迁移方向 | hse_employee_relation → employee_assignment |
| 数据环境 | 测试环境（模拟生产配置） |

---

## 迁移前检查

### Step 1.5: 脏数据检查（P0 阻断项）

| 指标 | 目标 | 实际值 | 状态 |
|------|------|--------|------|
| 重复当前关系数 | 0 | 0（duplicate_count=0，来源 Dry Run R2 §3.4 Step 1.5 / 95 ms） | ☑ PASS □ FAIL |

**检查SQL**:
```sql
SELECT employee_id, COUNT(*) as cnt
FROM hse_employee_relation
WHERE is_deleted = false
  AND is_current = true
GROUP BY employee_id
HAVING COUNT(*) > 1;
```

### Step 1.6: status 映射预检查（P0 阻断项）

| 指标 | 目标 | 实际值 | 状态 |
|------|------|--------|------|
| 未知 status 数 | 0 | 0（unknown_status_count=0，来源 Dry Run R2 §3.4 Step 1.6 / 88 ms） | ☑ PASS □ FAIL |

**检查SQL**:
```sql
SELECT DISTINCT status
FROM hse_employee_relation
WHERE is_deleted = false
  AND status NOT IN (
      'active', 'pending', 'inactive',
      'leave', 'resigned', 'retired',
      'dismissed', 'returned'
  );
```

---

## 执行结果

### Step 1: 迁移前备份

| 指标 | 值 |
|------|-----|
| 备份表创建 | ☑ 成功 □ 失败 |
| 备份记录数 | 0（ea_backup_count=0，来源 Dry Run R2 §3.4 Step 1 / 210 ms；employee_assignment 迁移前为空表） |

### Step 2: 创建 assignment 记录

| 指标 | 值 |
|------|-----|
| 插入记录数 | 3156（actual_migrate_count=3156，来源 Dry Run R2 §3.4 Step 2） |
| 耗时 | 1250 ms（来源 Dry Run R2 §3.4 Step 2，最大单 SQL 执行耗时） |

### Step 3: 异常记录检查

| 指标 | 目标 | 实际值 | 状态 |
|------|------|--------|------|
| 异常记录数 | 0 | 0（anomaly_count=0，来源 Dry Run R2 §3.4 Step 3 / 60 ms） | ☑ PASS □ FAIL |

**异常记录导出**:

| 异常类型 | 记录数 | 是否已导出 |
|---------|--------|-----------|
| 无 employee 匹配 | 0 | ☑ 是 □ 否 |
| 无 position 匹配 | 0 | ☑ 是 □ 否 |
| 无 org_unit 匹配 | 0 | ☑ 是 □ 否 |
| status 映射异常 | 0 | ☑ 是 □ 否 |

> 说明：Dry Run R2 §3.4 Step 3 结论为「0 条异常」。上表各子类型均为 0，由总异常数 0 推导；Dry Run R2 未单独列出各子类型明细，属「Dry Run 原始数据未留痕」。

### Step 4: 动态基线校验

| 指标 | 目标 | 实际值 | 状态 |
|------|------|--------|------|
| baseline_count | 等于预期 | 3156（her_current_count 基线，来源 Dry Run R2 §3.4 动态基线校验） | ☑ PASS □ FAIL |
| migration_count | 等于 baseline | 3156（actual_migrate_count，来源 Dry Run R2 §3.4） | ☑ PASS □ FAIL |
| 偏差 | <= 5% | 0%（来源 Dry Run R2 §3.4 动态基线校验结果） | ☑ PASS □ FAIL |
| baseline NULL 处理 | 正常跳过 | 正常（基线存在，未触发 NULL 分支） | ☑ 正常 □ 异常 |

---

## 验证结果

| 验证项 | 结果 |
|--------|------|
| 脏数据检查通过（P0） | ☑ PASS □ FAIL |
| status 映射检查通过（P0） | ☑ PASS □ FAIL |
| 迁移记录数符合基线 | ☑ PASS □ FAIL |
| 无异常记录 | ☑ PASS □ FAIL |
| 动态基线校验通过 | ☑ PASS □ FAIL |

---

## 风险记录

| # | 风险描述 | 级别 | 处理措施 | 处理结果 |
|---|---------|------|---------|---------|
| | Dry Run 原始数据未留痕：风险记录表在 Dry Run R2 §3.4 中无对应明细，本环境未触发风险项 | - | - | 无 |

---

## 异常与问题

| # | 问题描述 | 级别 | 处理措施 | 处理结果 |
|---|---------|------|---------|---------|
| | 无 | - | - | - |

---

## 回滚准备

| 回滚项 | 状态 |
|--------|------|
| 备份表存在 | ☑ 是 □ 否（employee_assignment_b2_backup_20260728，ea_backup_count=0） |
| 回滚 SQL 已就绪（06_Rollback.sql） | ☑ 是 □ 否 |
| 可回滚范围确认 | ☑ 是 □ 否（Dry Run R2 §3.6 回滚演练删除 3156 条通过） |

---

## 下一步

- ☑ B-2 验证全部通过，继续执行 **05_Data_Consistency_Check.sql**
- □ B-2 验证失败，立即执行 **06_Rollback.sql** 中的 B-2 回滚
- □ 严重异常，执行完整回滚流程

---

## 签字确认

| 角色 | 姓名 | 签字 | 日期 | 确认 |
|------|------|------|------|------|
| 数据迁移负责人 | | | | □ 通过 □ 不通过 |
| DBA | | | | □ 通过 □ 不通过 |

---

> **文档结束**
>
> 本报告记录 B-2 执行结果。验证全部通过后方可进入数据一致性验证。
>
> ⚠️ 注：上述数值均为 Dry Run R2 测试环境回填，非生产执行结果；生产迁移完成后须以真实执行数据重填并由相关角色签字。
