# FK 约束补全 Phase2 收尾与数据治理闭环 — 治理跟踪文档

> 对应提示词：`22-提示词-59-FK约束补全-Phase2收尾与数据治理闭环.md`
> 生成时间：2026-07-30 19:08
> 执行范围：仅数据库数据治理（**无后端/前端代码改动**）

---

## 0. 一页结论

| 项 | 结果 |
|---|---|
| 本次应补建 FK | 2 条（`fk_deduction_adjust_adjusted_by` / `fk_assessment_audit_operator`） |
| 实际补建 | **0 条（全部跳过，按提示词 §3 门控）** |
| 数据修改 | **0 行（门控只读，未强制置空）** |
| 前置全库备份 | ✅ `_backup_before_fk59_20260730_190551.dump`（2.6 MB） |
| 相关表 FK 终态 | 17 条（16 新建 + 1 既有 `fk_assignment_employee`） |
| 待人工介入 | 53 条活跃 NOT NULL 孤儿 + 2 处缺失列（见 §5） |

**核心判断**：提示词 §1/§2 清洗脚本的前提（「软删除置 NULL」）与实际 schema 不符——`hse_deduction_adjustment` 与 `hse_assessment_audit_log` **均无 `is_deleted` 列**，且两列均为 `NOT NULL`。53 条孤儿全部指向 `employee id=1`（测试种子写入的「管理员」），该 id 在 `employee` 表中**完全不存在**。按红线「不得强制置空活跃 NOT NULL 列」，本轮仅做探查与门控，不做破坏性修改。

---

## 1. 实勘偏差（执行铁律校验结果）

> 落地前已用 psql `information_schema` 与 `pg_constraint` 核验，发现提示词 6 处假设与实际不符。

| # | 提示词假设 | 实况 | 影响 |
|---|---|---|---|
| 1 | `hse_deduction_adjustment` 有 `is_deleted` | **无该列** | 清洗脚本 `SET ... WHERE is_deleted=true` 直接报错，前提不成立 |
| 2 | `hse_assessment_audit_log` 有 `is_deleted` | **无该列** | 同上 |
| 3 | `adjusted_by` 可空，孤儿可 SET NULL | **NOT NULL** | 不得强制置空，须人工介入 |
| 4 | `operator_id` 可空，孤儿可 SET NULL | **NOT NULL** | 同上 |
| 5 | `hse_events.personnel_id` 存在，FK-03 可建 | **列不存在**（仅 `id` + `impacted_persons` 整数计数） | FK-03 确属列缺失，无法建 |
| 6 | `hse_reviews.reviewer_id` 存在，FK-04 可建 | **列不存在**（仅 `reviewer_name` 文本） | FK-04 确属列缺失，无法建 |

---

## 2. 孤儿探查明细（`hse_fk_orphan_detail_phase2.sql` 只读）

### 2.1 `hse_deduction_adjustment.adjusted_by` — 4 条孤儿

全部 `NOT NULL`、活跃、引用 `employee id=1`（name=管理员），无 `is_deleted` 列可判软删。

| adjustment_id | orphan_emp_id | name | reason | adjusted_at |
|---|---|---|---|---|
| 9 | 1 | 管理员 | 场景4测试-调整扣分（5分→3分） | 2026-07-24 09:13:05 |
| 4 | 1 | 管理员 | 全流程测试-调整扣分 | 2026-07-24 08:44:51 |
| 3 | 1 | 管理员 | 全流程测试-调整扣分 | 2026-07-24 08:41:40 |
| 1 | 1 | 管理员 | 全流程测试-调整扣分 | 2026-07-24 08:33:17 |

### 2.2 `hse_assessment_audit_log.operator_id` — 49 条孤儿

全部 `NOT NULL`、活跃、引用 `employee id=1`（name=管理员 / admin），`module` 为 `assessment`/`assessment_monthly`，时间集中在 **2026-07-23 22:39 ~ 2026-07-24 09:13**（测试全流程跑批）。示例：

| log_id | orphan_emp_id | name | module | operation_type | operation_time |
|---|---|---|---|---|---|
| 49 | 1 | 管理员 | assessment_monthly | FREEZE | 2026-07-24 09:13:06 |
| 48 | 1 | 管理员 | assessment_monthly | REVIEW_ADJUST | 2026-07-24 09:13:05 |
| 2 | 1 | admin | assessment | UPDATE | 2026-07-23 22:39:43 |
| 1 | 1 | admin | assessment | CREATE | 2026-07-23 22:39:42 |

### 2.3 孤儿引用 id 溯源（A5）

| 源列 | emp_id | 状态 |
|---|---|---|
| `adjusted_by` 引用 | 1 | `employee` 表**完全不存在**该 id（含软删除行均查无） |
| `operator_id` 引用 | 1 | 同上 |

→ 53 条孤儿均为 **2026-07-23/24 测试种子数据**，指向一个从未入库的管理员 `id=1`。

---

## 3. 清洗执行记录（`hse_fk_orphan_cleanup_phase2.sql` 门控）

**策略修正**：原提示词 §1/§2 清洗脚本引用了不存在的 `is_deleted` 列且试图 `SET NULL` 活跃 NOT NULL 孤儿——已重写为**门控只读**版本，仅核查与提示，不修改数据。

门控输出（2026-07-30 19:05 执行）：

```
=== 清洗门控结果（两表均无 is_deleted 列，所有孤儿均为活跃 NOT NULL）===
hse_deduction_adjustment.adjusted_by 活跃孤儿数 = 4（NOT NULL，需人工介入，未修改数据）
hse_assessment_audit_log.operator_id 活跃孤儿数 = 49（NOT NULL，需人工介入，未修改数据）
本脚本未执行任何 UPDATE：NOT NULL 活跃孤儿不得强制 SET NULL（红线约束）。
FK 补建（fk_deduction_adjust_adjusted_by / fk_assessment_audit_operator）本轮跳过，待人工决策后执行。
DO
```

**数据修改量：0 行。**

---

## 4. FK 补建决策（§3 条件补建）

提示词 §3：「若清洗后仍有活跃孤儿，继续跳过，不建 FK」。

- 活跃孤儿数 = 4 + 49 = **53 > 0** → 触发跳过条件。
- `fk_deduction_adjust_adjusted_by`、`fk_assessment_audit_operator` **均未创建**。
- FK 终态核验：相关表共 **17 条 FK**（16 条为提示词-58 新建 + 1 条既有 `fk_assignment_employee`），全部 intact。

---

## 5. 待人工介入项（跟踪表）

| 编号 | 对象 | 问题 | 建议处置 | 状态 |
|---|---|---|---|---|
| TK-01 | `hse_deduction_adjustment.adjusted_by` ×4 | 活跃 NOT NULL 孤儿，引用不存在的 `employee id=1` | 业务补录真实操作员 / 或确认测试数据后整体清理（`DELETE` 或补建对应 `employee` 行） | 🟡 待决策 |
| TK-02 | `hse_assessment_audit_log.operator_id` ×49 | 同上，测试跑批日志 | 同上；若为纯测试数据可整体清理 | 🟡 待决策 |
| TK-03 | `hse_events`（FK-03） | `personnel_id` 列缺失，无任何人员外键列（`impacted_persons` 为整数计数） | 若需关联人员，先 `ALTER TABLE` 加列 + 回填，再建 FK | 🔴 列缺失 |
| TK-04 | `hse_reviews`（FK-04） | `reviewer_id` 列缺失，仅有 `reviewer_name` 文本 | 同上；建议加 `reviewer_id` + 由 `reviewer_name` 反查回填 | 🔴 列缺失 |

> 备注：TK-01/TK-02 的 53 条均为测试种子，若生产环境无此类数据则可忽略；但当前 dev 库需人工确认处置方式后方可补建对应 FK。

---

## 6. 产物清单（均保留于 `server/sql/`）

| 文件 | 类型 | 说明 |
|---|---|---|
| `_backup_before_fk59_20260730_190551.dump` | 全库备份 | 迁移前 `pg_dump -F c`，2.6 MB |
| `hse_fk_orphan_detail_phase2.sql` | 只读探查脚本 | A1–A5 五段探查，含列存在性确认 |
| `hse_fk_orphan_cleanup_phase2.sql` | 清洗门控脚本 | DO 块门控，0 行修改，未建 FK |
| `_probe_fk59_result.txt` | 探查原始输出 | 完整孤儿样本 + 列确认 |
| `_cleanup_fk59_result.txt` | 清洗门控输出 | NOTICE 提示全量 |

---

## 7. 复用范式（提示词-58/59 沉淀）

1. **FK 迁移铁律**：落地前必用 `information_schema` + `pg_constraint` 核验列存在性/类型/可空性/已有约束；提示词清单常含不存在的列或冗余约束。
2. **孤儿清理门控**：NOT NULL 活跃孤儿**不得强制 SET NULL**（破坏数据完整性红线）；改为门控只读 + 人工介入跟踪。
3. **「软删除置 NULL」前提须核验**：非所有表都含 `is_deleted`，缺失时脚本直接报错。
4. **迁移前必 `pg_dump` 全备**；幂等 `DO $$` 块包裹，可重跑。
5. 测试种子数据（`employee id=1` 影子引用）是常见的孤儿来源，治理时先溯源再处置。
