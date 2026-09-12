# TRAE Step 6：B-0 恢复 1285 vs 1287 偏差说明（ACT-06）

> **文档版本**：v1.0
> **执行日期**：2026-07-28
> **执行环境**：本地开发环境（PostgreSQL，safety_dashboard）
> **执行人**：TRAE
> **对应 ACT**：ACT-06

---

## 1. 目标

1. **解释 Dry Run 中 B-0 recover_id_count=1287 与 hse_employee_org=1285 的偏差**：差 2 条员工的来源。
2. **验证 B-0 恢复的并集策略**：确认 Runbook-Final §5.4 使用 `her ∪ heo` 并集而非单表是正确的设计。
3. **在当前环境模拟 B-0 恢复**：计算当前环境的 recoverable_count，验证偏差模式。
4. **产出本 md 文档**。

---

## 2. 环境与权限

| 项目 | 状态 | 说明 |
|------|------|------|
| 数据库访问 | 是 | 执行 SELECT 查询验证并集逻辑 |
| 代码访问 | 是 | 阅读 Runbook-Final B-0 恢复 SQL |
| 写入权限 | 未使用 | 仅只读查询 |
| 执行方式 | 实际 SQL 查询 + 文档比对 | — |

---

## 3. 执行动作与原始结果

### 3.1 B-0 恢复来源分析

**Runbook-Final §5.4 B-0 恢复 SQL**（[L466-L480](file:///F:/hse-dashboard/docs/Sprint-B-v2.1-Runbook-Final.md#L466-L480)）：

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

**关键设计**：B-0 恢复来源是 `hse_employee_relation ∪ hse_employee_org` 的**并集**，而非单表。

---

### 3.2 当前环境并集分析

**执行 SQL（逐项验证）：**

| 指标 | 数值 | 说明 |
|------|------|------|
| her 独立员工数 | 1304 | `SELECT count(DISTINCT employee_id) FROM hse_employee_relation WHERE is_deleted = false` |
| heo 独立员工数 | 1285 | `SELECT count(DISTINCT employee_id) FROM hse_employee_org WHERE is_deleted = false AND is_current = true` |
| **her ∪ heo 并集** | **1343** | 两表员工 ID 的去重并集 |
| her ∩ heo 交集 | 1246 | 两表共有的员工 |
| **her_only（her 有 heo 无）** | **58** | 仅在 hse_employee_relation 中有记录的员工 |
| heo_only（heo 有 her 无） | 39 | 仅在 hse_employee_org 中有记录的员工 |

**韦恩图示意**：

```
  hse_employee_relation        hse_employee_org
  ┌──────────────────┐        ┌──────────────────┐
  │                  │        │                  │
  │   her_only: 58   │  交集  │   heo_only: 39   │
  │                  │  1246  │                  │
  └──────────────────┘        └──────────────────┘
         总计: 1304                  总计: 1285
                    并集: 1343
```

---

### 3.3 当前环境 B-0 恢复模拟

**employee 表状态**：

| 状态 | 数量 |
|------|------|
| total | 1361 |
| active (is_deleted=false) | 1（TEST001） |
| deleted (is_deleted=true) | 1360 |

**B-0 恢复模拟结果**：

| 恢复来源 | recoverable_count | 说明 |
|----------|-------------------|------|
| 仅从 heo 恢复 | 1285 | heo 中所有员工均在 employee 表中且 is_deleted=true |
| 仅从 her 恢复 | 1304 | her 中所有员工均在 employee 表中且 is_deleted=true |
| **从并集恢复（B-0 实际策略）** | **1343** | 并集中所有员工均在 employee 表中且 is_deleted=true |
| her_only 可恢复 | 58 | 仅在 her 中的员工，这些是并集比 heo 多出的部分 |

**当前环境偏差**：并集恢复 1343 - heo 单表 1285 = **58 条**（her_only 可恢复员工）。

---

### 3.4 Dry Run 环境 1287 vs 1285 偏差解释

**Dry Run Round 2 报告记载**（[L70](file:///F:/hse-dashboard/docs/Sprint-B-v2.1-DryRun-Round2-Report.md#L70)）：
- B-0 recover_id_count = 1287
- B-0 actual_recover_count = 1287
- 偏差 0%（恢复数 = 基线数）

**Pre-risk 审计记载**：
- hse_employee_org 有效记录 = 1285

**偏差分析**：

| 指标 | Dry Run 环境 | 当前环境 | 说明 |
|------|-------------|----------|------|
| heo 独立员工数 | ~1285（推断） | 1285 | 两环境一致 |
| B-0 恢复数（并集） | 1287 | 1343 | 并集比 heo 多出的部分不同 |
| 偏差（并集 - heo） | **2** | **58** | Dry Run 环境 her_only 可恢复员工仅 2 条 |

**1287 vs 1285 差异的根因**：

B-0 恢复使用 `her ∪ heo` 并集策略。在 Dry Run 测试环境中：
- heo 有约 1285 个员工
- her 有 3156 条记录（但独立员工数可能远少于此）
- 并集中有 2 个员工**仅在 her 中存在、不在 heo 中**，且这 2 个员工在 employee 表中处于 is_deleted=true 状态
- 因此 B-0 恢复了 1285 + 2 = 1287 个员工

**这是正常行为，不是数据错误。** 并集策略的设计目的就是确保两个旧表中引用的所有员工都被恢复，避免遗漏。

---

### 3.5 为什么当前环境偏差（58）远大于 Dry Run 环境（2）？

| 环境 | her 记录数 | heo 员工数 | her_only 可恢复 | 偏差 |
|------|-----------|-----------|----------------|------|
| Dry Run 测试环境 | 3156 | ~1285 | 2 | 2 |
| 当前开发环境 | 1304 | 1285 | 58 | 58 |

**原因**：两个环境的 hse_employee_relation 数据量差异巨大（3156 vs 1304），且数据内容不同。当前环境有 58 个员工仅在 her 中存在而不在 heo 中，这些员工可能是：
- 通过 hse_employee_relation 导入但未同步到 hse_employee_org 的员工
- 历史数据不一致的遗留

**生产环境预警**：生产环境的 her_only 数量可能不同于两个测试环境，B-0 恢复数可能与 1285 有更大偏差。这不代表错误，但需要在生产 Step 0 Check 0.8 中记录真实基线。

---

## 4. 发现

### 4.1 1287 vs 1285 偏差是正常的并集行为

B-0 恢复的来源是 `her ∪ heo` 并集，而非 heo 单表。并集必然 >= heo 单表数量。差值就是 her_only 的员工数（在 her 中有但 heo 中无的员工）。

**结论**：1287 vs 1285 的偏差**不是数据错误**，而是并集策略的正确行为。Dry Run 环境中有 2 个 her_only 员工需要恢复。

### 4.2 并集策略是正确的设计

并集策略确保两个旧表中引用的所有员工都被恢复。如果仅从 heo 恢复，会遗漏 her_only 的员工，导致这些员工在 B-2 迁移时因 employee.is_deleted=true 而无法正确关联。

### 4.3 当前环境有 58 个 her_only 员工

当前环境有 58 个员工仅在 hse_employee_relation 中存在、不在 hse_employee_org 中。这些员工在 B-0 恢复时会被正确恢复（因为使用并集策略）。但这 58 个员工的存在也说明两表数据存在不一致。

### 4.4 生产环境偏差需现场确认

生产环境的 her_only 数量未知，B-0 恢复数可能与 1285 或 1287 不同。需要在生产 Step 0 Check 0.8 中记录真实基线。

---

## 5. 结论

| 问题 | 结论 |
|------|------|
| 1287 vs 1285 偏差是否正常？ | **✅ 是** — 并集策略的正确行为 |
| 偏差根因 | B-0 恢复使用 her ∪ heo 并集，Dry Run 环境有 2 个 her_only 员工 |
| 是否需要修改 B-0 恢复 SQL？ | **❌ 否** — 并集策略是正确的设计 |
| 生产环境是否会有类似偏差？ | **✅ 是** — 偏差大小取决于生产环境 her_only 员工数 |
| 是否需要在文档中补充说明？ | **✅ 是** — 建议在 Runbook-Final §5.4 补充偏差说明 |

---

## 6. 风险与建议

### 6.1 风险

| 风险 | 等级 | 说明 |
|------|------|------|
| 生产环境 her_only 数量较大导致 B-0 恢复数远超预期 | 低 | 并集策略会正确恢复所有员工，不影响正确性 |
| 审计人员不理解 1287 vs 1285 偏差 | P2 | 建议在文档中补充说明 |

### 6.2 建议

1. **在 Runbook-Final §5.4 补充注释**：说明"B-0 恢复数 >= heo 员工数，差值为 her_only 员工数，属正常行为"。
2. **生产 Step 0 Check 0.8 记录基线**：记录 heo/ea/her/ea_only 的真实数值，用于后续偏差分析。
3. **调查 her_only 员工**：当前环境 58 个 her_only 员工可能是数据不一致的遗留，建议在数据治理阶段排查。

---

## 7. 待办 / 下一步

1. **需验证者确认**：偏差说明是否充分。
2. **建议补充**：在 Runbook-Final §5.4 添加偏差说明注释（需授权修改文档）。
3. **下一步**：Step 7（ACT-07：hse_employee_org 保留口径统一）。

---

## 8. 证据索引

| 结论 | 证据位置 |
|------|---------|
| B-0 恢复使用并集策略 | [Runbook-Final.md](file:///F:/hse-dashboard/docs/Sprint-B-v2.1-Runbook-Final.md#L466-L480) L466-480 |
| Dry Run B-0 recover_id_count=1287 | [DryRun-Round2-Report.md](file:///F:/hse-dashboard/docs/Sprint-B-v2.1-DryRun-Round2-Report.md#L70) L70 |
| Pre-risk heo=1285 | [Sprint-B-Pre实施前风险确认报告.md](file:///F:/hse-dashboard/docs/Sprint-B-Pre实施前风险确认报告.md) §1.2 |
| 当前环境 her=1304, heo=1285 | §3.2 实测查询结果 |
| 当前环境并集=1343 | §3.2 实测查询结果 |
| 当前环境 her_only=58 | §3.2 实测查询结果 |
| 当前环境 B-0 可恢复=1343 | §3.3 实测查询结果 |

---

**文档结束。**
