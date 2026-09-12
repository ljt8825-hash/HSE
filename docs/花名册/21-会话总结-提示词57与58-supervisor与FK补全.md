# 会话工作总结（2026-07-30）

> 范围：提示词-57（supervisor_id 读取补全 v1 + v2 实勘修正）、提示词-58（FK 约束补全 Phase2）
> 项目：HSE Dashboard（`F:\hse-dashboard`）
> 数据库：`safety_dashboard@127.0.0.1:5432`（用户 `hse_app`）
> 前端：Vben Admin 单体 `安全看板vben/apps/web-antd`（Vue3.5 + TS + ant-design-vue）

---

## 一、提示词-57：supervisor_id 读取补全（v1 + v2）

### 1.1 目标
打通「花名册为基石」的人员上级链路：在各列表接口的返回中补全 **直接上级姓名/ID**，前端相应模块增加「直接上级」列。

### 1.2 v1 改动（初版）
| 层 | 文件 | 改动 |
|---|---|---|
| 后端 | `server/routes/hse-employee.js` | 员工列表 SQL 增加 `sup.name AS supervisor_name`（经 `employee_assignment ea_sup` 主职 JOIN） |
| 后端 | `server/routes/accidents.js` | 列表 `SELECT accidents.*` + `sup.name AS handler_supervisor_name`；`formatRow` 输出 `handlerSupervisorId/Name`；修复 `WHERE is_deleted` → `WHERE accidents.is_deleted` 歧义 |
| 后端 | `server/routes/training.js` | `/records` 列表 `SELECT tr.*` + `sup.name AS supervisor_name`；`formatRow` 输出 `supervisorName` |
| 后端 | `server/routes/violations.js` | LATERAL 子查询 + 外层 `SELECT v.*, emp.supervisor_name`；`formatRow` 输出 `supervisorName` |
| 前端 | `src/views/hse/employee/index.vue` | 列 `直接上级`（snake_case `supervisor_name`） |
| 前端 | `src/views/accidents/index.vue` | 详情 `DescriptionsItem` 处理人上级（`handlerSupervisorId` → EmployeeName 组件） |
| 前端 | `src/views/violations/index.vue` | 列 `直接上级`（`supervisorName`） |
| 前端 | `src/views/training/index.vue` | 列 `直接上级`（`supervisorName`） |
| 前端 | `src/api/hse/accidents.ts` | `AccidentItem` 增 `handlerSupervisorId/handlerSupervisorName` 可选字段（修 3 处 TS2339） |

### 1.3 v2 实勘修正（关键发现）
v2 在 v1 基础上增量补 `supervisor_id`（上级员工 ID），但**实勘推翻了提示词的多处假设**：

1. **台账页真实数据源不是 `/records`，而是 `/training/ledger`**
   前端 `views/training/ledger/index.vue` 调 `getLedgerList()` → 后端 `createTrainingSubRoute` 工厂生成的 `/ledger` 端点，其原查询 `SELECT * FROM training_records` **完全没有 supervisor JOIN**。v1 改的 `views/training/index.vue` 实际对应的是 `/training/certificates` 页面，非台账页。→ **已为 `/ledger` 端点补 LEFT JOIN + `supervisor_id/supervisor_name` + whereSql 表别名限定**。
2. **`hse-accidents.ts` 不在路由白名单**：按提示词要求，事故模块前端改动维持 v1 状态、未引入白名单外的挂载。

| 层 | 文件 | v2 改动 |
|---|---|---|
| 后端 | `hse-employee.js` | SELECT 增 `ea_sup.supervisor_id AS supervisor_id` |
| 后端 | `training.js` | `/records` 增 `sup.id AS supervisor_id`；`/ledger` 端点补 supervisor JOIN；`formatRecordRow` 增 `supervisorId` 输出 |
| 后端 | `violations.js` | LATERAL 与外层 SELECT 增 `emp.supervisor_id`；`formatRow` 增 `supervisorId` |
| 前端 | `views/training/ledger/index.vue` | 列 `直接上级`（`supervisorName`，NULL 显 `-`） |
| 前端 | `src/api/hse/training.ts` | `LedgerItem` 增 `supervisorId/supervisorName` 可选字段 |

### 1.4 验证结果（v2）
- 4 个后端端点全部 `HTTP 200`，supervisor 字段就位：
  - `/api/hse/employee/employees` → `supervisor_id / supervisor_name`
  - `/api/training/records`、`/api/training/ledger` → `supervisorId / supervisorName`
  - `/api/violations` → `supervisorId / supervisorName`
- 端到端非空验证：员工搜「马金华」→ `supervisor_id=3866, supervisor_name=张万恒` ✅
- 三违 `supervisorName=NULL` 属数据稀疏（违章人姓名在 `v_employee_org_full` 匹配不到），非代码缺陷。
- `pnpm build` 成功，**0 TS 错误**。
- 执行报告：`docs/花名册/19-提示词-57-执行报告-supervisor_id读取补全v2.md`

---

## 二、提示词-58：FK 约束补全 Phase2

### 2.1 目标
为考核核心表、HSE 核心事件表、`employee_assignment` 共 12 张表的 21 条外键引用补全 FK 约束，强化数据完整性。

### 2.2 实勘先行（执行铁律）
未盲信提示词，先用 `information_schema` + `pg_constraint` 核验：

- **12 张表 / 26 个 FK 列的引用列全部真实存在**，类型均为 `bigint`，与被引用主键（`employee.id`/`position.id`/`hse_org_unit.id`，均 bigint）**完全匹配，无类型冲突**。
- **仅 1 条既有 FK**：`employee_assignment.employee_id` 已被 `fk_assignment_employee`（ON DELETE CASCADE）覆盖。

### 2.3 审计结果（提示词假设 vs 实库，5 处偏差）
只读审计脚本：`server/sql/hse_fk_audit_phase2.sql`（22 条 `SELECT COUNT` 孤儿统计）

| 偏差 | 提示词假设 | 实库情况 | 处置 |
|---|---|---|---|
| `hse_events.personnel_id` | 存在，建 `fk_hse_events_personnel` | **列不存在** | **跳过**（无法建） |
| `hse_reviews.reviewer_id` | 存在，建 `fk_reviews_reviewer` | **列不存在**（仅有 `reviewer_name`） | **跳过** |
| `hse_deduction_adjustment.adjusted_by` | 建 FK | NOT NULL + **4 条孤儿**（is_deleted=false 引用失效） | **跳过，人工介入** |
| `hse_assessment_audit_log.operator_id` | 建 FK | NOT NULL + **49 条孤儿** | **跳过，人工介入** |
| `employee_assignment.employee_id` | 新建 `fk_employee_assignment_employee` | 已有 `fk_assignment_employee` 覆盖 | **跳过**（防重复） |
| `hse_assessment_cycle.created_by / frozen_by` | 建 FK | 可空 + 4/1 条孤儿 | **清理（SET NULL）后建** |
| 其余 16 列 | 建 FK | 孤儿=0 | **直接建** |

### 2.4 迁移执行
- **前置全备**：`pg_dump` custom 格式 → `server/sql/_backup_before_fk58_20260730_182647.dump`（2.5 MB）
- **迁移脚本**：`server/sql/hse_fk_phase2_assessment_events.sql`（全部 `DO $$` 块包裹；先判列存在性/约束存在性；可重跑幂等；孤儿按可空性 SET NULL 或跳过）
- **执行结果**：退出码 0，FK 约束由 **1 → 17**（**新建 16 条**）

新建清单（16 条，全部 `ON DELETE SET NULL`，除标注外）：
```
hse_assessment_cycle.created_by / frozen_by
hse_assessment_target.employee_id
hse_assessment_deduction.violator_id
hse_deduction_adjustment.reviewed_by
hse_responsibility_chain.subordinate_id / manager_id
hse_events.department_id            → hse_org_unit
hse_event_timeline.actor_id
hse_control_measures.responsible_person_id / department_id → hse_org_unit
hse_rectifications.responsible_person_id / department_id  → hse_org_unit
employee_assignment.supervisor_id / position_id / org_unit_id → position / hse_org_unit
```
跳过的 5 条：`hse_events.personnel_id`、`hse_reviews.reviewer_id`、`hse_deduction_adjustment.adjusted_by`、`hse_assessment_audit_log.operator_id`、`employee_assignment.employee_id`（既有）。

### 2.5 验证
- `pg_constraint` 复核：17 条约束，命名/引用表/引用列与设计一致（`fk_assignment_employee` 为既有，其余 16 为本次新建）。
- FK 为纯数据完整性层，不影响既有读查询；后端无需重启。
- 完整审计原始输出留存：`server/sql/_audit_phase2_result.txt`

### 2.6 风险与待办（人工介入项）
- `hse_deduction_adjustment.adjusted_by`（4 条）、`hse_assessment_audit_log.operator_id`（49 条）为 NOT NULL 孤儿引用，需业务方**补全对应 employee 记录（或置空）后**再补 FK。
- `hse_events.personnel_id` / `hse_reviews.reviewer_id` 列缺失：若后续需关联，应先 `ALTER TABLE` 加列并回填，再建 FK。

---

## 三、本会话文件清单

### 新增/修改（业务代码）
- `server/routes/hse-employee.js`（v1/v2 supervisor 补全）
- `server/routes/accidents/*`（v1/v2 + is_deleted 歧义修复）
- `server/routes/training.js`（v1 `/records` + v2 `/records`+`/ledger`）
- `server/routes/violations.js`（v1/v2 LATERAL 补全）
- `安全看板vben/apps/web-antd/src/views/hse/employee/index.vue`
- `安全看板vben/apps/web-antd/src/views/accidents/index.vue`
- `安全看板vben/apps/web-antd/src/views/violations/index.vue`
- `安全看板vben/apps/web-antd/src/views/training/index.vue`、`.../training/ledger/index.vue`
- `安全看板vben/apps/web-antd/src/api/hse/accidents.ts`、`.../training.ts`

### 数据库脚本（server/sql/）
- `hse_fk_audit_phase2.sql` — 只读审计（22 条）
- `hse_fk_phase2_assessment_events.sql` — 幂等迁移（16 新建 + 5 跳过）
- `_audit_phase2_result.txt` — 审计原始输出
- `_backup_before_fk58_20260730_182647.dump` — 迁移前全库备份

### 文档
- `docs/花名册/19-提示词-57-执行报告-supervisor_id读取补全v2.md`
- `docs/花名册/21-会话总结-提示词57与58-supervisor与FK补全.md`（本文件）

---

## 四、可复用经验（已沉淀至工作记忆）
1. **执行铁律**：提示词给的列名/路径/端点常与实际不符 → 落地前必 `Grep`/读源码/`information_schema` 实时核验。本次 FK 任务即靠核验发现 2 列不存在、2 列 NOT NULL 孤儿、1 列已有 FK，避免盲目执行报错。
2. **`SELECT *` → `table.*` 陷阱**：后端 `formatRow` 多为显式枚举字段，仅改 SQL `SELECT` 不够，必须同步在 `formatRow` 增映射。
3. **SQL 多表 JOIN 歧义**：新增 `LEFT JOIN employee sup ... AND sup.is_deleted=false` 会引入第二列 `is_deleted`/`id`，须把 `WHERE is_deleted/false`、`ORDER BY id` 限定表别名（accidents/training 已修）。
4. **FK 迁移安全范式**：`pg_dump` 全备 → 只读审计 → 孤儿按可空性 SET NULL / NOT NULL 跳过 → `DO $$` 块幂等建约束（`IF NOT EXISTS` 双重判列/判约束）→ `pg_constraint` 复核计数。
5. **前端验证基线**：后端 `/api/*` 用 `:5666` 验证；前端静态资源/模板以 Vite `:5173` 为基准（`:5666` 非 `/api` 请求会被 dev 代理 `:7890` 拦截伪造成 HTML）。

---

*生成时间：2026-07-30 18:40 (GMT+8)*
