# TRAE Step 9 提示词 — 只读保护 + 巡检部署 + 索引复核（生产前必做）

> **对应阶段**：Phase 2 · Step 9
> **前置**：Step 8 文档补正收尾已完成（签字栏保持空白 + 禁代签）
> **性质**：生产迁移（Sprint B 数据迁移）**执行前必做的环境与防护动作**
> **铁律**：只读触发器、索引创建均需在维护窗口/预发环境执行；生产 Step 0 的现场复核结论必须由 DBA 确认，TRAE 不代签。

---

## 目标

1. **复核 `uk_emp_assign_primary` 唯一索引**：B-2 迁移 SQL 依赖 `ON CONFLICT ON CONSTRAINT uk_emp_assign_primary`，该索引必须在迁移前存在。
2. **落地 `hse_employee_org` 只读保护**：创建 BEFORE 触发器，阻断对旧表的 INSERT/UPDATE/DELETE（防误写）。
3. **部署 Sprint C 巡检 SQL 为定时任务**：数据迁移完成后首次全量执行（当前仅配置调度，不实际跑全量）。

---

## 执行动作

### 1. 索引复核（最高优先级）
- 在当前或预发环境执行 Runbook §4.7 Check 0.7 查询：
  ```sql
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'employee_assignment'
    AND indexname = 'uk_emp_assign_primary';
  ```
- 若**不存在**：确认 Runbook Step 0 自动创建逻辑（`CREATE UNIQUE INDEX ... WHERE is_primary=true AND is_current=true AND is_deleted=false`）可成功执行；或手动预创建，记录创建前后证据（before/after 行数）。
- 输出：索引存在性结论 + 创建证据（如适用）。**此结论必须在生产 Step 0 现场由 DBA 二次确认。**

### 2. 只读保护触发器
- 预校验 `docs/Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql` 语法；结合 Step 3 结论（代码层 0 处写旧表）确认无代码路径会被误阻断。
- 在维护窗口（或 dev 环境验证）执行；用一条测试 `INSERT INTO hse_employee_org ...` 验证被触发器拒绝。
- 输出：触发器创建证据 + 测试 INSERT 被阻断的证据。

### 3. 巡检调度部署
- 将 `docs/Sprint-C-v1.0/02_SQL/Employee_Model_Check.sql` 配置为定时任务（cron / node scheduler）。
- **暂不实际跑全量**（等 Sprint B 迁移完成后首次执行）。
- 输出：调度配置文件 + 首次全量执行计划说明。

---

## 输入

- `docs/Sprint-B-v2.1-Runbook-Final.md` §4.7（Check 0.7 索引查询与自动创建）
- `docs/Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql`
- `docs/Sprint-C-v1.0/02_SQL/Employee_Model_Check.sql`
- `server/routes/hse-employee.js`（确认 0 处写入旧表，来自 Step 3 证据）

---

## 产出

`docs/TRAE-Step9-只读保护与巡检部署.md`，含：
1. 索引复核证据（存在性 + 创建前后，如适用）
2. 只读触发器执行证据（创建 + 测试 INSERT 被阻断）
3. 巡检调度配置与"等 Sprint B 迁移后首次全量"说明

---

## 验收点（验证者核对）

- [ ] `uk_emp_assign_primary` 存在性已确认 + 创建证据（如适用）
- [ ] 只读触发器已创建且写入被阻断（有测试证据）
- [ ] 巡检调度已配置，明确"等 Sprint B 迁移后首次全量"
- [ ] 无代签、无伪 PASS；DBA 复核结论留痕

---

> **注意**：Step 9 是生产迁移的"放行前提"之一。索引缺失 + 无只读保护 + 巡检未部署，任一未闭环都不应进入 Sprint B 数据迁移执行。
