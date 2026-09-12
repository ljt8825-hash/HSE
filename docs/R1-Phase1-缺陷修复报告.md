# R1-Phase1 缺陷修复报告（P0-1 缺陷修复与重跑 Dry Run）

> 生成日期：2026-07-29
> 阶段：R1 Phase 1 后端协作 — 修复 提示词-32 定义的 5 项缺陷
> 前置：提示词-31 Dry Run = NO-GO（P0-1 阻断性缺陷）
> 性质：后端代码修正 + 迁移脚本修正（**不修改前端**、不改 `wsServer.js` / `employeeEventService.js` / `employee_assignment` 基础层 / `v_employee_current` 视图定义）
> 关联交付：`R1-Phase1-DryRun-R2执行报告.md`（门控结论 = **Go**）

---

## 一、缺陷背景

提示词-31 Dry Run 暴露 1 项阻断性缺陷（P0-1）：`fetchEmployeeInfosByIds` 在 `v_employee_current` 视图上执行 `SELECT ... ev.id_card ...`，但**线上视图不含 `id_card`** 列，导致所有批量查询返回 `code:-1`，功能不可用。提示词-32 据此定义 5 项修复（Fix #1~#5）。

## 二、关键发现（直接影响修复范围）

在执行修复前，对**线上真实数据库**做了 `information_schema.columns` 核查，确认当前部署的 `v_employee_current` 视图**仅含 10 列**：

```
employee_id, employee_code, name, assignment_status, is_current, hire_date, org_name, org_type, position_name, is_driver
```

> ⚠️ 这与代码（及 `server/sql/sprint5_6_employee_master_migration.sql` 中的视图定义）假设**不一致**——源码视图定义含 `phone / employee_deleted / id_card / is_public_welfare / id_address / gender / person_type / person_category / age` 等列，但**该富视图定义未实际部署**到本库。

因此提示词-32 中"仅把 `ev.id_card / ev.is_public_welfare / ev.id_address` 三列改为 `e.*`"的假设不成立：批量端点与列表端点实际还引用了 `ev.phone`、`ev.employee_deleted` 等**同样不存在于视图**的列。修复必须把这些列改为从 `employee` 基表（及 `employee_assignment`）获取，才能彻底消除报错。

本修复据此**扩展了 Fix #1 / Fix #2 的实际改动范围**（仍属后端路由层 SELECT 改写，未触碰视图定义，符合红线）。

## 三、修复清单

### Fix #1 — `fetchEmployeeInfosByIds`（P0-1 批量端点，`server/routes/hse-employee.js` L143-151）

- `FROM v_employee_current ev` 增加 `JOIN employee e ON e.id = ev.employee_id`
- `ev.id_card` → `e.id_card`；`ev.phone` → `e.phone`（`phone` 同样不在视图中）
- `WHERE ev.employee_deleted = false` → `WHERE e.is_deleted = false`（视图无 `employee_deleted`）
- `decryptFields(r, ['id_card','phone'])` 保持不变（`id_card`/`phone` 来自 `employee` 基表密文，由函数/中间件解密）

### Fix #2 — `GET /employees` 列表端点（`server/routes/hse-employee.js` L509-583，扩展修复）

该端点在修复前因视图缺列**同样会报错**，扩展修复如下：

- 增加 `JOIN employee e ON e.id = ev.employee_id` 与 `LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true`
- 源字段改从基表获取：
  - `ev.phone → e.phone`、`ev.gender → e.gender`、`ev.birth_date → e.birth_date`
  - `ev.person_category → e.person_category`、`ev.person_type → e.person_type`
  - `ev.id_card → e.id_card`、`ev.is_public_welfare → e.is_public_welfare`、`ev.id_address → e.id_address`
- `age` 由 `e.birth_date` 计算：`CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM AGE(e.birth_date))::int END AS age`
- 组织字段：`ev.org_unit_id → ea.org_unit_id`、`ev.position_id → ea.position_id`、`ev.start_date → ea.start_date`；`org_path` 暂置 `NULL`（视图/基表均无此列，列为后续视图对齐任务）
- 过滤条件：`ev.employee_deleted = false → e.is_deleted = false`；`ev.phone ILIKE → e.phone ILIKE`；`ev.person_type / ev.person_category / ev.gender → e.*`
- 计数 SQL 同步 `JOIN employee e`；排序 `ev.assigned_at DESC → ea.start_date DESC NULLS LAST`

### Fix #3 — `parseIdList` 空串边界（`server/routes/hse-employee.js` L110-112）

- 新增：`if (typeof input === 'string' && input.trim() === '') return [];`
- 效果：`GET /employees/batch?ids=` 返回 `[]`（原逻辑对空串返回 `null`，导致端点误报 `-3 格式错误`）

### Fix #4 — 迁移 baseline INSERT 幂等（`server/sql/hse_employee_master_v68_extension.sql`）

- `INSERT INTO migration_baseline (migration_name, table_name, row_count) VALUES (...)` 增加 `ON CONFLICT (migration_name, table_name) DO NOTHING`
- 重跑迁移时不再因唯一约束冲突而整事务回滚

### Fix #5 — baseline/registry 与主迁移事务分离（`server/sql/hse_employee_master_v68_extension.sql`）

- Step 0 `migration_baseline` 与 Step 0.5 `migration_backup_registry` 从主 `BEGIN; … COMMIT;` 移出，各自封装为独立
  `DO $$ BEGIN … EXCEPTION WHEN OTHERS THEN RAISE NOTICE '…跳过(异常: %)', SQLERRM; END $$;`
- 线上 `migration_baseline` 表存在 schema 漂移（真实列为 `id, migration_id, metric_name, metric_value …`，与脚本期望的 `migration_name/table_name/row_count` 不符）时，INSERT 异常被捕获，主迁移不受影响、正常提交

## 四、验证

- `node --check server/routes/hse-employee.js` → **SYNTAX_OK**
- 迁移重跑：`psql … -f hse_employee_master_v68_extension.sql` → **EXIT=0，主事务 COMMIT 成功**（详见 R2 执行报告第二节）
- 冒烟重跑：P0-1 五用例全绿、P0-2 轮询/信封正常、P0-3 落库正常（详见 R2 执行报告第四节）

## 五、范围外但需跟进的残留问题（非本次引入）

- **`GET /employees/profile/list`（`server/routes/hse-employee.js` L5733）** 同样依赖未部署的富视图（引用 `ev.gender / ev.age / ev.org_unit_id / ev.org_code / ev.position_code / ev.phone / ev.id_card / ev.assigned_at / ev.org_path …` 等大量不存在列），当前在线上会报错。建议作为独立任务：要么部署源码中定义的富视图，要么将其改写为基表 JOIN（与本次 Fix #2 同法）。**本次未改**（超出 提示词-32 范围，且涉及多张 org 维度表，需单独评估）。
- 迁移 `migration_baseline` 真实表 schema 漂移属其他 R1 脚本（B0/B2/REHEARSAL）遗留，本次以 Fix #5 的 `EXCEPTION` 兜底，但**真实 baseline 行级追踪仍缺失**，建议后续统一 schema。

---

> 修复人：Senior Developer（高级开发工程师）
> 验证环境：`safety_dashboard`（NODE_ENV=development，127.0.0.1:5432）
