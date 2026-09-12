# TRAE Step 9：只读保护 + 巡检部署 + 索引复核

> **对应阶段**: Phase 2 · Step 9  
> **执行时间**: 2026-07-28  
> **执行环境**: 开发环境（dev）  
> **性质**: Sprint B 数据迁移执行前的"放行前提"  
> **铁律**: 只读触发器、索引创建均需在维护窗口/预发环境执行；生产 Step 0 的现场复核结论必须由 DBA 确认，TRAE 不代签。

---

## 一、索引复核（Check 0.7：uk_emp_assign_primary）

### 1.1 复核背景

B-2 迁移 SQL 依赖 `ON CONFLICT ON CONSTRAINT uk_emp_assign_primary` 实现幂等 upsert。该唯一索引必须在迁移前存在，否则 B-2 迁移将直接失败（附录 B 生产阻断项 #1）。

**检查 SQL**（来自 Runbook §4.7）：

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'employee_assignment'
  AND indexname = 'uk_emp_assign_primary';
```

### 1.2 执行结果

**执行前（before）**:

```
[1.1] 索引检查 (before): []
```

结论：索引**不存在**。

**创建操作**：

```sql
CREATE UNIQUE INDEX uk_emp_assign_primary
ON employee_assignment (employee_id)
WHERE is_primary = true
  AND is_current = true
  AND is_deleted = false;
```

执行结果：`CREATE INDEX` — 成功

**执行后（after）**:

```json
[
  {
    "indexname": "uk_emp_assign_primary",
    "indexdef": "CREATE UNIQUE INDEX uk_emp_assign_primary ON public.employee_assignment USING btree (employee_id) WHERE ((is_primary = true) AND (is_current = true) AND (is_deleted = false))"
  }
]
```

**employee_assignment 记录数**: 1（仅 TEST001 测试数据）

### 1.3 结论

| 检查项 | 结果 |
|--------|------|
| 索引存在性 | ✅ 已创建（开发环境） |
| 索引定义正确性 | ✅ `WHERE (is_primary = true AND is_current = true AND is_deleted = false)` 符合预期 |
| 索引列 | ✅ `employee_id` |
| 索引类型 | ✅ UNIQUE INDEX |

> ⚠️ **生产环境要求**：生产 Step 0 Check 0.7 必须由 DBA 现场二次确认此索引存在且定义正确。开发环境仅验证创建逻辑可行。

---

## 二、只读保护触发器

### 2.1 前置验证：代码层 0 处写入旧表

**来源**: Step 3 证据 + 本次复核

| 检查项 | 结果 | 证据 |
|--------|------|------|
| hse-employee.js 中 INSERT INTO hse_employee_org | 0 处 | Grep 检索无匹配 |
| hse-employee.js 中 UPDATE hse_employee_org | 0 处 | Grep 检索无匹配 |
| hse-employee.js 中 DELETE FROM hse_employee_org | 0 处 | Grep 检索无匹配 |
| hse-employee.js 中 SELECT FROM hse_employee_org | 0 处 | Grep 检索无匹配（连读也已迁移） |

**结论**: 代码层已完全迁移至 `employee_assignment`，创建只读触发器不会阻断任何现有代码路径。

### 2.2 触发器 SQL 来源

[hse_employee_org_ReadOnly_Change.sql](file:///F:/hse-dashboard/docs/Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql)

**语法预校验**: ✅ 通过（PostgreSQL PL/pgSQL 标准语法）

### 2.3 执行结果

**Step 0: 前置检查**

| 检查项 | 结果 |
|--------|------|
| hse_employee_org 表存在 | ✅ true |
| 当前记录数 | 1285 |
| 已有用户触发器 | 0 个（无冲突） |

**Step 1: 创建保护函数与触发器**

| 操作 | 结果 |
|------|------|
| CREATE FUNCTION fn_hse_employee_org_read_only() | ✅ 成功 |
| DROP TRIGGER IF EXISTS (3 个，幂等清理) | ✅ 完成 |
| CREATE TRIGGER trg_hse_employee_org_block_insert | ✅ 成功 |
| CREATE TRIGGER trg_hse_employee_org_block_update | ✅ 成功 |
| CREATE TRIGGER trg_hse_employee_org_block_delete | ✅ 成功 |

**触发器验证**:

```json
[
  { "tgname": "trg_hse_employee_org_block_insert", "tgenabled": "O" },
  { "tgname": "trg_hse_employee_org_block_update", "tgenabled": "O" },
  { "tgname": "trg_hse_employee_org_block_delete", "tgenabled": "O" }
]
```

> `tgenabled = 'O'` 表示触发器为 origin 模式（默认启用）

### 2.4 阻断验证测试

| # | 测试操作 | 预期 | 实际 | 结果 |
|---|---------|------|------|------|
| 3.1 | `SELECT COUNT(*) FROM hse_employee_org` | 成功 | count=1285 | ✅ SELECT 正常 |
| 3.2 | `INSERT INTO hse_employee_org (employee_id, status, is_current) VALUES (0, 'TEST_BLOCKED', true)` | 被阻断 | `ERROR: hse_employee_org 已冻结为只读表（Sprint-C Step 4）。禁止 INSERT 操作。请使用 employee_assignment 新模型。` | ✅ INSERT 被阻断 |
| 3.3 | `UPDATE hse_employee_org SET updated_at = NOW() WHERE id = 1`（真实 ID） | 被阻断 | `ERROR: hse_employee_org 已冻结为只读表（Sprint-C Step 4）。禁止 UPDATE 操作。请使用 employee_assignment 新模型。` | ✅ UPDATE 被阻断 |
| 3.4 | `DELETE FROM hse_employee_org WHERE id = 1`（真实 ID） | 被阻断 | `ERROR: hse_employee_org 已冻结为只读表（Sprint-C Step 4）。禁止 DELETE 操作。请使用 employee_assignment 新模型。` | ✅ DELETE 被阻断 |

> **注**: 3.3/3.4 初次使用 `WHERE id = 0`（不存在）测试时未触发，因 PostgreSQL BEFORE ROW 触发器仅在存在匹配行时触发。改用真实 ID=1 后正确阻断。测试后验证记录数仍为 1285，未受影响。

### 2.5 结论

| 检查项 | 结果 |
|--------|------|
| 保护函数已创建 | ✅ fn_hse_employee_org_read_only() |
| INSERT 触发器已创建且生效 | ✅ 被阻断 |
| UPDATE 触发器已创建且生效 | ✅ 被阻断 |
| DELETE 触发器已创建且生效 | ✅ 被阻断 |
| SELECT 正常 | ✅ 不受影响 |
| 数据完整性 | ✅ 1285 条记录未变 |

> ⚠️ **生产环境要求**：生产环境需在维护窗口执行 [hse_employee_org_ReadOnly_Change.sql](file:///F:/hse-dashboard/docs/Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql) 全文。DBA 需确认触发器创建成功并执行阻断测试。

---

## 三、巡检调度部署

### 3.1 巡检 SQL 来源

[Employee_Model_Check.sql](file:///F:/hse-dashboard/docs/Sprint-C-v1.0/02_SQL/Employee_Model_Check.sql)

### 3.2 数据库对象创建

已在开发环境创建以下对象（支持巡检调度执行）：

| 对象 | 类型 | 状态 |
|------|------|------|
| v_employee_assignment_health | VIEW | ✅ 已创建 |
| fn_run_assignment_health_check() | FUNCTION | ✅ 已创建 |

**试运行结果**（当前仅 1 条 employee_assignment 记录，仅验证 SQL 可执行）：

```
check_type          | issue_count
--------------------|------------
ORPHAN_EMPLOYEE     | 0
ORPHAN_POSITION     | 0
ORPHAN_ORG_UNIT     | 0
DUPLICATE_CURRENT   | 0
INVALID_STATUS      | 0
ORPHAN_SUPERVISOR   | 0
INVALID_DATE_RANGE  | 0
LEAVED_BUT_CURRENT  | 0
```

> 当前数据量太少（1 条），巡检结果无实际诊断意义。Sprint B 迁移完成后首次全量执行才有价值。

### 3.3 调度配置

**调度文件**: [server/services/employeeHealthCheckScheduler.js](file:///F:/hse-dashboard/server/services/employeeHealthCheckScheduler.js)

**注册位置**: [server/app.js](file:///F:/hse-dashboard/server/app.js) L76（import）、L520（init 调用）

| 配置项 | 值 |
|--------|-----|
| cron 表达式 | `0 2 * * *`（每日凌晨 02:00） |
| 时区 | Asia/Shanghai |
| 当前状态 | **DISABLED**（`HEALTH_CHECK_ENABLED = false`） |
| 启用条件 | Sprint B B-2 迁移完成后，将 `HEALTH_CHECK_ENABLED` 改为 `true` |
| 巡检函数 | `SELECT * FROM fn_run_assignment_health_check()` |
| 告警阈值 | 任意巡检项 `issue_count > 0` 输出 WARN 日志 |

### 3.4 首次全量执行计划

**执行时机**: Sprint B B-2 数据迁移完成后的首个 02:00（自动触发），或在迁移完成后手动调用 `triggerManualCheck()` 立即执行。

**启用步骤**：

1. Sprint B B-2 迁移完成并验证
2. 将 [employeeHealthCheckScheduler.js](file:///F:/hse-dashboard/server/services/employeeHealthCheckScheduler.js) L45 的 `HEALTH_CHECK_ENABLED` 改为 `true`
3. 重启后端服务
4. 手动触发首次巡检：`await require('./services/employeeHealthCheckScheduler').triggerManualCheck()`
5. 确认巡检结果全部 `issue_count = 0`

> ⚠️ **当前不跑全量**：等 Sprint B 迁移完成后首次执行。当前 employee_assignment 仅 1 条测试记录，全量巡检无诊断意义。

---

## 四、总结

### 4.1 放行前提检查

| # | 放行前提 | 状态 | 备注 |
|---|---------|------|------|
| 1 | uk_emp_assign_primary 索引存在 | ✅ 已创建（dev） | 生产 Step 0 需 DBA 确认 |
| 2 | hse_employee_org 只读保护已部署 | ✅ 已创建（dev） | 生产需在维护窗口执行 |
| 3 | 巡检调度已配置 | ✅ 已配置（DISABLED） | 等 Sprint B 迁移后启用 |

### 4.2 生产环境待办

| # | 待办项 | 执行人 | 时机 |
|---|--------|--------|------|
| 1 | 生产环境创建 uk_emp_assign_primary 索引 | DBA | Step 0 Check 0.7 |
| 2 | 生产环境执行 hse_employee_org_ReadOnly_Change.sql | DBA | Step 0 维护窗口 |
| 3 | 确认触发器阻断测试通过 | DBA | Step 0 |
| 4 | 将 HEALTH_CHECK_ENABLED 改为 true 并重启 | 运维 | Sprint B B-2 迁移后 |
| 5 | 首次全量巡检执行并确认 | 运维/DBA | Sprint B B-2 迁移后 |

### 4.3 修改的文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| docs/TRAE-Step9-只读保护与巡检部署.md | 新建 | 本文档 |
| server/services/employeeHealthCheckScheduler.js | 新建 | 巡检调度服务（DISABLED） |
| server/app.js | 修改（+3 行） | 注册巡检调度器 import + init |

> ⚠️ 本次未触碰任何 SQL 执行入口、路由、接口逻辑（仅新增调度服务 + app.js 注册调用）。

---

## 五、DBA 签字栏

> ⚠️ **禁止代签**：以下签字栏需由 DBA 在生产 Step 0 现场复核后人工签字。TRAE 不代签任何角色。

| 角色 | 姓名 | 签字 | 日期 | 意见 |
|------|------|------|------|------|
| DBA | | | | |
| 运维负责人 | | | | |
| 数据迁移负责人 | | | | |

---

**文档结束。**
