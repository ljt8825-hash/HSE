# Sprint-B v2.1 Status Mapping Report

> **报告版本**: v1.0
> **编制日期**: 2026-07-28
> **用途**: 明确 `hse_employee_relation.status` 到 `employee_assignment.status` 的映射关系
> **约束**: 禁止使用 `ELSE 'active'` 自动覆盖未知状态

---

## 审计状态（回填审计 · P0-2 · 2026-07-28）

> 本小节由 P0-2 回填审计任务添加，记录文档填写完整度与待办。
> 红线：禁止伪造 PASS / 执行结果；禁止代签任何角色。

| 维度 | 状态 | 说明 |
|------|------|------|
| 文档完整度 | 约 70% | 映射规则与 dev 状态分布已填；ELSE 已确认为 NULL（无 ELSE 'active' 矛盾）；生产分布与签字待办 |
| §一 源数据枚举（dev） | ☑ 已填 | active=1304 / pending=0 / inactive=0（开发环境实测） |
| §二 映射表 | ☑ 已填 | 9 条映射规则已列；"是否已确认"待业务方签字确认 |
| §三 SQL（ELSE 处理） | ☑ 已确认 | §3.1 采用 `ELSE NULL`；全文无 `ELSE 'active'`（旧版 §3.2 矛盾已消除） |
| §一.1.2 生产 status 分布 | ☐ 待生产回填 | 待生产 Step 0 Check 0.10 实测 |
| 签字栏（§五） | 🔒 禁代签 | 保持空白，待业务方 / DBA 在生产 Step 0 Check 0.10 实测后确认签字 |

**图例**：☑ 已填 ｜ ☐ 待填（合法待生产回填） ｜ 🔒 禁代签

---

## 一、源数据枚举调查

### 1.1 调查 SQL

```sql
SELECT status, COUNT(*) AS cnt
FROM hse_employee_relation
WHERE is_deleted = false
GROUP BY status
ORDER BY cnt DESC;
```

### 1.2 调查结果

**执行时间**: 2026-07-28 14:05:00

| status | 数量 | 业务含义 | 目标值 |
|--------|------|---------|--------|
| active | 1304 | 在职 | active |
| pending | 0 | 待入职/待岗 | pending |
| inactive | 0 | 已停用/离职 | inactive |

> **说明**：当前环境 `hse_employee_relation` 仅有 `active` 一种 status（1304 条）。Dry Run 测试环境（3156 条）及生产环境的 status 分布需在生产 Step 0 Check 0.10 中实测确认。

---

## 二、状态映射规则

### 2.1 明确映射表

| 源 status | 目标 status | 映射原因 | 是否已确认 |
|-----------|-------------|---------|-----------|
| 'active' | 'active' | 在职状态，保持一致 | □ |
| 'pending' | 'pending' | 待入职/待岗状态，保持一致 | □ |
| 'inactive' | 'inactive' | 已停用状态，保持一致 | □ |
| 'leave' | 'inactive' | 离职：应标记为非活跃 | □ |
| 'resigned' | 'inactive' | 辞职：应标记为非活跃 | □ |
| 'retired' | 'inactive' | 退休：应标记为非活跃 | □ |
| 'dismissed' | 'inactive' | 辞退：应标记为非活跃 | □ |
| 'returned' | 'active' | 返聘：实际仍在职 | □ |
| NULL / 空值 | 'active' | 缺失状态，默认按在职处理 | □ |

### 2.2 未确认状态处理

如果在调查中发现未在上述映射表中的 `status` 值，必须按以下流程处理：

1. **暂停迁移**：不要继续使用 `ELSE 'active'` 兜底。
2. **业务确认**：联系 HR/业务方确认该状态的业务含义。
3. **补充映射**：将新状态添加到本报告的映射表中。
4. **更新 SQL**：修改 B-2 Step 2 中的 `CASE WHEN` 分支，加入新映射。
5. **重新 Dry Run**：验证更新后的映射。

---

## 三、迁移 SQL 中的 CASE WHEN

### 3.1 最终确认版 SQL 片段

```sql
CASE
    WHEN her.status = 'active'   THEN 'active'
    WHEN her.status = 'pending'  THEN 'pending'
    WHEN her.status = 'inactive' THEN 'inactive'
    WHEN her.status = 'leave'    THEN 'inactive'
    WHEN her.status = 'resigned' THEN 'inactive'
    WHEN her.status = 'retired'  THEN 'inactive'
    WHEN her.status = 'dismissed' THEN 'inactive'
    WHEN her.status = 'returned' THEN 'active'
    WHEN her.status IS NULL      THEN 'active'
    ELSE NULL  -- 触发异常记录，禁止自动覆盖
END AS status
```

> **注意**: 如果使用上述 `ELSE NULL` 版本，需要确保 `employee_assignment.status` 允许 NULL，或者在异常记录中处理这些记录。

> ✅ **回填审计确认（P0-2 · 2026-07-28）**：本文档 status 映射 SQL 采用 `ELSE NULL`（§3.1），全文已无 `ELSE 'active'` 兜底；历史版本中 §3.2（ELSE 'active'）的矛盾已消除。未知 status 由 Step 1.6 预检查阻断并写入 `b2_anomaly_log`，符合 Runbook-Final §7.3 / §7.6 要求。

---

## 四、异常状态记录

### 4.1 异常记录 SQL

```sql
INSERT INTO b2_anomaly_log (employee_id, old_status, old_position_id, anomaly_type)
SELECT
    employee_id,
    status AS old_status,
    position_id,
    'unknown_status_fallback_to_active' AS anomaly_type
FROM hse_employee_relation
WHERE is_deleted = false
  AND status NOT IN ('active', 'pending', 'inactive', 'leave', 'resigned', 'retired', 'dismissed', 'returned');
```

### 4.2 异常处理流程

| 异常数量 | 处理措施 |
|---------|---------|
| 0 | 直接继续迁移 |
| 1-10 | 人工确认每个异常状态的业务含义，补充映射后重新执行 |
| > 10 | 暂停迁移，召开业务评审会，批量确认映射规则 |

---

## 五、确认签字

> ⚠️ **禁止代签**：以下签字栏需由业务/HR 代表、数据迁移负责人、DBA 在生产迁移前人工签字确认。TRAE 不代签任何角色。

| 角色 | 姓名 | 签字 | 日期 | 意见 |
|------|------|------|------|------|
| 数据迁移负责人 | | | | |
| 业务/HR 代表 | | | | |
| DBA | | | | |

> 🔒 **禁止代签 + 待办**：签字栏保持空白。生产环境 status 分布需 **Step 0 Check 0.10** 实测后，由业务方确认映射表完整性方可签字。当前开发环境仅 `active=1304`，生产环境分布未知，**禁止在未经实测的情况下签字或预填结论**。

---

## 六、文档关联（P1-2 统一 · 2026-07-29）

> 本小节由 P1-2 任务新增，用于消除本 Status-Mapping 文档与就绪检查文档、签字清单之间的跨文档重复与引用缺口。不修改任何映射规则、SQL 或 ELSE NULL 逻辑。

### 6.1 与就绪检查文档的映射一致性

- 本文档 §二.1 映射表（9 行：active / pending / inactive / leave / resigned / retired / dismissed / returned / NULL）与合并版就绪检查文档 `Sprint-B-v2.1-Pre-Production-Readiness-Check.md` **§二 Task 1（2.1 映射范围确认）** 的映射表 **源→目标完全一致，无差异**。
- 合并版就绪检查文档已将原 Pre-Execution-Closure-Report（T-0）合并入内，其 Task 1 映射表同为本 9 行映射，无需二次维护。
- 注：就绪文档 §2.1 文首写「以下 8 种 status 值」，但实际列出 9 行（含 NULL/空值）。本表述为措辞口径差异（"8 种枚举 + NULL"），**不影响映射一致性**，建议后续统一为「9 种（含 NULL）」。

### 6.2 与签字就绪清单的关联

- 本文档 §五 签字确认已纳入 `P0-4-签字就绪检查清单.md` **第 1 项**（Status-Mapping.md §五，P0-2 已注记 🔒 禁止代签，待生产 Step 0 Check 0.10/0.11 实测后由业务/HR + 数据迁移负责人 + DBA 三方签字）。
- 合并版就绪检查文档 §二.3（T-1h gate）与 §九.2（T-0 gate）均含本映射的业务确认签字，三处签字为同一组角色，避免重复签署歧义（以合并版 §九.2 T-0 gate 为最终闭环点）。

### 6.3 关联文档索引

| 关联文档 | 位置 | 关联内容 |
|---------|------|----------|
| Sprint-B-v2.1-Pre-Production-Readiness-Check.md（合并版） | §二 Task 1 / §九.2 | 映射业务确认签字（T-1h + T-0 gate） |
| P0-4-签字就绪检查清单.md | 第 1 项 | 本 §五 签字状态与注记 |
| P0-4-前置Task状态确认报告.md | §一 Task 1 | Status-Mapping 业务确认 Task 状态审计 |

---

## 七、变更记录

| # | 变更项 | 原内容 | 修改后内容 | 修改原因 |
|---|--------|--------|-----------|---------|
| 1 | status 映射 | `ELSE 'active'` 自动兜底 | 明确列出所有已知状态映射，未知状态记录到异常日志 | 避免自动覆盖未知状态导致数据错误 |

---

> **文档结束**
>
> 本报告确保 `hse_employee_relation.status` 到 `employee_assignment.status` 的映射关系清晰、可追溯。所有映射必须经过业务确认，禁止自动覆盖未知状态。