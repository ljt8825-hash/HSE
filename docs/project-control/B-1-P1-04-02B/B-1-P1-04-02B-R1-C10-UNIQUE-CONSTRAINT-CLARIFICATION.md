# B-1-P1-04-02B-R1｜C10 班组唯一归属约束表达修正（补充报告）

> 性质：针对 04-02B 主报告 §4-C10 的约束表达修正，只读核查 + 设计方向澄清。
> 不重做业务规则审计、不修改主报告、不进入 04-02C、零代码/零 DDL/零 DML/零生产查询。

---

## 一、执行基线

| 项 | 值 |
|---|---|
| 分支 / 起始 HEAD | `feat/b02-dec-03.13-a02d-status-code` / `3aae62f6719fb350f17b70eca25debf4fe72410a`（04-02B 主报告提交） |
| 主报告 | `docs/project-control/B-1-P1-04-02B/B-1-P1-04-02B-ORGANIZATION-BUSINESS-RULE-BASELINE.md`（未修改） |
| cost.js | staged `A` + MD5 `e88ae2b0b275346dfc1431408aa00bff`（不变） |
| 核查方式 | dev 库 READ ONLY 事务单次查询（`current_database()` 断言 = `safety_dashboard_dev`，COMMIT 收尾）；探针 SQL 存档 `.workbuddy/tmp/r1-c10-index-check.sql`（不进版本库） |

---

## 二、问题确认（审查意见采纳）

主报告 C10（§4-C10 / §五）仅写出约束谓词方向：

> 「候选形态：partial unique index（类比 uk_emp_assign_primary）——`WHERE operation_unit_id IS NOT NULL AND is_current AND NOT is_deleted`」

**该表达不完整**：只给了谓词、未给索引键列。按字面若把键列误设为 `operation_unit_id`，语义将变成"全库同一时段每班组至多 1 人"，与 BR-05（同一员工唯一班组；**同一班组可以有多名员工**）完全相反。本补充报告予以修正。

---

## 三、employee_assignment 实态证据（dev READ ONLY 实测）

### 3.1 全部索引（7 个）与表级约束（5 个）

| 名称 | 类型 | 定义摘要 |
|---|---|---|
| `employee_assignment_pkey` | UNIQUE INDEX | `(id)` |
| **`uk_emp_assign_primary`** | **UNIQUE INDEX（partial）** | **`USING btree (employee_id) WHERE ((is_primary = true) AND (is_current = true) AND (is_deleted = false))`** |
| `idx_assignment_current` | INDEX | `(is_current, is_deleted)` |
| `idx_assignment_employee_id` | INDEX | `(employee_id)` |
| `idx_assignment_operation_unit_id` | INDEX | `(operation_unit_id)`（**普通索引，非唯一**） |
| `idx_assignment_org_unit_id` | INDEX | `(org_unit_id)`（普通） |
| `idx_assignment_position_id` | INDEX | `(position_id)`（普通） |

表级 CONSTRAINT：`employee_assignment_pkey (p)`、`fk_assignment_employee`、`fk_employee_assignment_org_unit (ON DELETE SET NULL)`、`fk_employee_assignment_position`、`fk_employee_assignment_supervisor`。**operation_unit_id 无任何 FK/CHECK/唯一约束**（与 R1 实证一致）。

### 3.2 关键字段类型与可空性

| 字段 | 类型 | NULL |
|---|---|---|
| `employee_id` | bigint | NOT NULL |
| `operation_unit_id` | bigint | 可空 |
| `org_unit_id` | bigint | 可空 |
| `is_current` / `is_deleted` / `is_primary` | boolean | NOT NULL |
| `start_date` / `end_date` | date | 可空 |

### 3.3 BR-05 冲突预演（dev 现存数据）

- 谓词 `is_current=TRUE AND NOT is_deleted AND operation_unit_id IS NOT NULL` 下：**146 名员工，每名恰好 1 段**（`segs_per_employee=1, employees=146`），**0 名员工多段**。
- 含义：目标唯一性约束在 dev 现存数据上**零违反**——若未来实施该索引，建索引不会因存量数据失败（仅 dev 实态；生产未核验，维持 U05）。

---

## 四、C10 约束方向修正

### 4.1 被约束的主体

BR-05 的语义主体是**同一 employee_id 的有效基层作业班组归属数量**——约束"一个人"，不是"一个班组"。`operation_unit_id` 只出现在**谓词**（限定哪些段参与唯一性），**绝不作为索引键**。

### 4.2 目标约束方向（规范表达）

```
CREATE UNIQUE INDEX <名称待 04-02C 定>
  ON employee_assignment (employee_id)
  WHERE (operation_unit_id IS NOT NULL
         AND is_current = TRUE
         AND is_deleted = FALSE);
```

逐条对照审查要求：

| # | 要求 | 表达 |
|---|---|---|
| 1 | 唯一索引键围绕 employee_id | 键列 = `(employee_id)`（与 uk_emp_assign_primary 同键模式） |
| 2 | 仅适用于有效、当前、未删除且 operation_unit_id 非空的作业归属段 | 谓词 = `operation_unit_id IS NOT NULL AND is_current AND NOT is_deleted` |
| 3 | 历史段不参与 | 历史段 `is_current=FALSE`，天然退出谓词；关段新建（C01 修订）后旧段自动豁免 |
| 4 | 不限制同一 operation_unit_id 关联多名员工 | 键不含 operation_unit_id——同班组 N 名员工 = N 条不同 employee_id 键值，互不冲突 |
| 5 | 不扩大到 org_unit_id 管理组织关系 | 谓词仅锚定 operation_unit_id；org_unit_id 维度的多段问题维持主报告 U02 未决 |

### 4.3 现有结构适配性说明（如实）

1. **无直接采用障碍**：PG 支持同表多个 partial unique index；字段均为 NOT NULL/可空组合无技术障碍；键列 `(employee_id)` 上已有普通索引 `idx_assignment_employee_id`（新唯一索引可兼作该查询路径，但索引冗余取舍归 04-02C）。
2. **与 uk_emp_assign_primary 的谓词差异（须 04-02C 设计确认）**：既有约束谓词含 `is_primary = true`（管理组织主段语义）；BR-05 约束**不应**含 `is_primary`——若误含，`is_primary=false` 的 current 作业段将绕过唯一性。这引出待确认问题 A（见 4.4）。
3. **dev 现存数据零冲突**（3.3），但**生产未核验**——若生产存在多段员工，直接建索引会失败；列为待 04-02C 问题 B。
4. **重复操作/并发的另一通道**：BR-05 还要求防"重复操作"。DB 约束只保证最终不落两条；同事务内二次写入会触发唯一冲突报错（业务侧需转为友好提示）——应用层处理归 04-02C/M1，本节点不展开。

### 4.4 待 04-02C 设计的问题（本节点不裁定）

| # | 问题 |
|---|---|
| A | 作业归属段（operation_unit_id 非空）与 `is_primary` 语义的关系：作业段是否必然 is_primary=true？若允许 false，谓词须排除 is_primary（按 4.2 表达）并明确两索引谓词的交集行为 |
| B | 生产库同谓词下的存量多段情况（U05 生产核验项之一，本节点零生产查询） |
| C | 索引命名、与 idx_assignment_employee_id 的冗余取舍、以及 04-02B 主报告 C01「关段新建」事务内先关旧段后建新段的写入顺序保证（同 employee_id 在事务内切换班组时，两段并存瞬间是否触发自冲突——PG partial unique 对同事务内先 UPDATE 旧段 is_current=false 再 INSERT 新段的顺序不冲突，但实现须保证该顺序） |

---

## 五、状态区分声明

- **目标约束方向**（§4.2）＝设计意图表达，**尚未实施的数据库约束**——本节点未创建、未修改、未删除任何索引或约束（零 DDL）。
- 04-02B 主报告 §4-C10 的"候选形态"表述由本报告 §4.2 修正取代；主报告原文按纪律不改动。
- 实施归 04-02C 设计 + M2 范围（主报告 §八 M0 条件、U05 生产核验维持不变）。

---

## 六、交付信息

| 项 | 值 |
|---|---|
| 补充报告路径 | `docs/project-control/B-1-P1-04-02B/B-1-P1-04-02B-R1-C10-UNIQUE-CONSTRAINT-CLARIFICATION.md` |
| 索引证据 | §3.1（7 索引全清单 + uk_emp_assign_primary 完整 indexdef）、§3.2（字段类型）、§3.3（146 员工/0 冲突） |
| 变更声明 | 零代码、零 SQL 文件、零 DDL/DML、零生产查询、零索引变更；主报告与历史报告未改动 |
| 停止条件 | 提交推送核验后立即停止，等待独立审查；不启动 04-02C / M1 / M2 |
