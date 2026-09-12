# 提示词 32：R1-Phase1 P0-1 缺陷修复 + 重跑 Dry Run

> 创建日期：2026-07-29
> 前置条件：提示词 31 已完成（Dry Run 执行报告已生成，发现 1 项阻断性缺陷）
> 所属阶段：R1 Phase 1 后端协作 — 阶段 0.5 缺陷修复
> 用途：修复 Dry Run 中发现的 P0-1 阻断性缺陷 + 迁移脚本幂等性缺陷 + 空参数边界 Bug，修复后重跑 Dry Run
> 性质：**后端代码修正 + 迁移脚本修正 + 重新验证**（不修改前端）

---

## 背景

提示词 31 Dry Run 执行报告发现：

| 发现 | 严重度 | 状态 |
|------|--------|------|
| P0-1 批量端点返回 `字段 ev.id_card 不存在` | **阻断** | 所有正常查询失败 |
| 迁移脚本 baseline INSERT 与既有表 schema 不兼容 | 中 | 整事务回滚，DDL 也不生效 |
| 空参数 `ids=` 返回 `error(-3)` 而非 `[]` | 低 | 边界行为偏差 |
| P0-2 事件信封契约 + 轮询端点 | — | ✅ 验证通过 |
| P0-3 字段落库 + 外键约束 | — | ✅ 验证通过 |
| 回填命中率 0%（数据格式不匹配，非脚本 Bug） | — | ✅ 已知风险，前端文本兜底 |

**根因分析**：

`fetchEmployeeInfosByIds()`（`hse-employee.js` L143-166）执行：
```sql
SELECT ev.employee_id AS id, ev.employee_code, ev.id_card, ev.name,
       ev.org_name AS dept_name, ev.position_name,
       ev.assignment_status AS org_status, ev.phone
FROM v_employee_current ev
WHERE ev.employee_deleted = false AND ev.employee_id = ANY($1::bigint[])
```

但 `v_employee_current` 视图（`sprint5_6_employee_master_migration.sql` L262-309）**不含 `id_card` 列**。视图从 `employee` 表提取了 `phone`（L269）、`person_category`、`person_type`，但遗漏了 `id_card`、`is_public_welfare`、`id_address`。

> 注意：`GET /employees` 列表端点（L567）同样引用了 `ev.id_card`，但被 `decryptMiddleware` 包装可能掩盖了错误（中间件可能静默跳过不存在的字段）。**本次修复需同时覆盖列表端点**。

---

## 要求

### 1. 读取所有基线文档

**必须读取**：
- `F:\hse-dashboard\docs\R1-Phase1-DryRun执行报告.md`（本次修正依据）
- `F:\hse-dashboard\server\sql\sprint5_6_employee_master_migration.sql`（L258-309 视图定义，确认缺少哪些列）
- `F:\hse-dashboard\server\routes\hse-employee.js`（L143-166 `fetchEmployeeInfosByIds` + L565-580 列表端点 SELECT）

### 2. Fix #1（阻断）：修复 `fetchEmployeeInfosByIds` 查询 `id_card` 缺失

**问题**：`v_employee_current` 视图不含 `id_card` 列，导致 `SELECT ev.id_card` 报错。

**方案选择**：

**方案 A（推荐 — 最小改动）**：在 `fetchEmployeeInfosByIds` 中 JOIN `employee` 基表获取 `id_card`：

```sql
SELECT ev.employee_id AS id, ev.employee_code, e.id_card, ev.name,
       ev.org_name AS dept_name, ev.position_name,
       ev.assignment_status AS org_status, ev.phone
FROM v_employee_current ev
JOIN employee e ON e.id = ev.employee_id
WHERE ev.employee_deleted = false AND ev.employee_id = ANY($1::bigint[])
```

优点：不改视图（避免影响其他依赖视图的查询），仅改批量端点查询
缺点：多一次 JOIN（employee 表很小，无性能影响）

**方案 B**：直接查 `employee` 基表 + LEFT JOIN `employee_assignment` / `hse_org_unit` / `position`：

```sql
SELECT e.id AS employee_id, e.employee_code, e.id_card, e.name, e.phone,
       ou.org_name AS dept_name, p.name AS position_name,
       ea.status AS org_status
FROM employee e
LEFT JOIN employee_assignment ea ON ea.employee_id = e.id
  AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
WHERE e.is_deleted = false AND e.id = ANY($1::bigint[])
```

优点：不依赖视图，完全自包含
缺点：代码较长，但消除了视图依赖

**推荐方案 A**（JOIN employee 基表），改动最小。实现时注意：
- `decryptFields(r, ['id_card', 'phone'])` 保持不变（`id_card` 从 `e.id_card` 获取，`phone` 从 `ev.phone` 获取）
- 返回的 camelCase 映射保持不变

### 3. Fix #2（关联修复）：修复 `GET /employees` 列表端点同样引用 `ev.id_card` 的问题

**问题**：`GET /employees` 列表端点（L567）的 SELECT 同样引用了 `ev.id_card`、`ev.is_public_welfare`、`ev.id_address`，这些列在视图中不存在。

**修复**：同样在列表端点的 SELECT 中 JOIN `employee` 基表：

```sql
SELECT ev.employee_id AS id, ev.employee_code, e.id_card, ev.name, ev.gender,
       ev.birth_date, ev.phone, ev.person_category, ev.person_type,
       e.is_public_welfare, e.id_address, ev.age,
       ...
FROM v_employee_current ev
JOIN employee e ON e.id = ev.employee_id
WHERE ...
```

注意：`decryptMiddleware` 在列表端点仍然生效（它解密 `data.data.list[].id_card` 和 `data.data.list[].phone`），但实际情况是 `decryptMiddleware` 可能因为字段不存在而静默失败。修复后 JOIN 了 `employee` 表，`id_card` 将正确返回。

### 4. Fix #3：修复 `parseIdList` 空字符串边界问题

**问题**：`parseIdList("")` → `"".split(',')` → `[""]` → `parseInt("")` → `NaN` → 返回 `null` → 触发 `error(-3)`

**期望**：`parseIdList("")` 应返回 `[]`（空数组），触发 `success([], '查询成功')`

**修复**：在 `parseIdList` 函数开头增加空字符串判断：

```js
function parseIdList(input) {
  if (input === undefined || input === null) return [];
  if (typeof input === 'string' && input.trim() === '') return [];  // 新增
  // ... 其余逻辑不变
}
```

### 5. Fix #4：修复迁移脚本 `migration_baseline` INSERT 幂等性

**问题**：Dry Run 发现既有 `migration_baseline` 表 schema 与官方脚本不兼容（`migration_id` vs `migration_name`），导致 INSERT 失败 → 整事务回滚。

**修复**：在 `hse_employee_master_v68_extension.sql` 的 INSERT 语句（L29-34）增加 `ON CONFLICT DO NOTHING`：

```sql
INSERT INTO migration_baseline (migration_name, table_name, row_count)
VALUES
  ('v68_extension', 'hazards', (SELECT COUNT(*) FROM hazards)),
  ('v68_extension', 'accidents', (SELECT COUNT(*) FROM accidents)),
  ('v68_extension', 'emergency_plans', (SELECT COUNT(*) FROM emergency_plans)),
  ('v68_extension', 'employee', (SELECT COUNT(*) FROM employee WHERE is_deleted = false))
ON CONFLICT (migration_name, table_name) DO NOTHING;
```

同时在脚本注释中标注：**如果 `migration_baseline` 表不存在或 schema 不兼容，baseline 采集将静默跳过（不影响 DDL 执行）**。

### 6. Fix #5：将 Step 0 / Step 0.5（baseline + registry）从主事务中分离

**问题**：当前脚本将 baseline/registry 的 CREATE TABLE + INSERT 与 DDL 放在同一个 `BEGIN; ... COMMIT;` 事务中。如果 baseline INSERT 失败（如 schema 不兼容），整个事务回滚，DDL 也全部丢失。

**修复**：将 baseline/registry 的 CREATE TABLE 和 INSERT 移到 `BEGIN;` 之前独立执行（或包裹在独立的 `DO $$` 块中，异常被捕获不抛出）：

```sql
-- Step 0 & 0.5 独立执行（失败不影响主迁移）
DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS migration_baseline (...);
  BEGIN
    INSERT INTO migration_baseline (...) VALUES (...) ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'migration_baseline INSERT 跳过（schema 不兼容）: %', SQLERRM;
  END;
END $$;

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS migration_backup_registry (...);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'migration_backup_registry 创建跳过: %', SQLERRM;
END $$;

-- 主迁移事务
BEGIN;
  -- DDL + FK + 索引 + 回填 + 验证
COMMIT;
```

### 7. 修复后重跑 Dry Run

修复完成后，按以下顺序重跑验证：

（A）执行 `node --check server/routes/hse-employee.js` 确认语法通过

（B）在测试环境重新执行迁移脚本（使用适配执行文件，但内容与修正后的官方脚本一致）

（C）重跑 P0-1 冒烟测试 5 用例，全部通过：

| # | 用例 | 期望 |
|---|------|------|
| 1 | `ids=1,2,3` | `EmployeeInfo[]`，含 `phone`/`idCard` 明文 |
| 2 | POST `{"ids":[1,2]}` | 同上 |
| 3 | `ids=1,99999` | 仅返回存在的 1 条 |
| 4 | `ids=`（空） | `[]`（修复后应返回空数组） |
| 5 | 201 个 ID | `error(-4)` |

（D）重跑 P0-2 轮询端点验证（确认事件信封格式正确）

（E）重跑 P0-3 字段落库验证（确认外键约束生效）

（F）生成 **R1-Phase1-DryRun-R2执行报告.md**，包含：
- 修复内容摘要（5 项修复）
- 重跑迁移执行记录
- 冒烟测试结果（P0-1/P0-2/P0-3）
- 门控决策（Go/No-Go）
- 如 Go，列出进入阶段 1（灰度部署）的前置条件

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/routes/hse-employee.js` | 修改 | Fix #1: `fetchEmployeeInfosByIds` JOIN employee 获取 id_card；Fix #2: 列表端点 JOIN employee；Fix #3: `parseIdList` 空字符串处理 |
| `server/sql/hse_employee_master_v68_extension.sql` | 修改 | Fix #4: baseline INSERT 加 ON CONFLICT DO NOTHING；Fix #5: Step 0/0.5 从主事务分离 |
| `docs/R1-Phase1-DryRun-R2执行报告.md` | 新增 | 修复后重跑 Dry Run 报告 |

## 禁止事项

- 禁止修改前端 Q3/Q4/Q5 代码
- 禁止修改前端路由、菜单、配置
- 禁止修改 `employeeEventService.js` / `wsServer.js`
- 禁止修改 `employee_assignment` 基础层
- 禁止修改 `v_employee_current` 视图定义（避免影响其他模块）

## 验收标准

- `fetchEmployeeInfosByIds` 查询从 `employee` 基表获取 `id_card`，不再依赖视图
- `GET /employees` 列表端点同样从 `employee` 基表获取 `id_card`/`is_public_welfare`/`id_address`
- `parseIdList("")` 和 `parseIdList("  ")` 返回 `[]` 而非 `null`
- 迁移脚本 baseline INSERT 失败不导致事务回滚
- Step 0/0.5 独立于主迁移事务
- 所有修改文件通过 `node --check` 语法校验
- P0-1 冒烟 5 用例全部通过（含 `idCard`/`phone` 明文解密）
- P0-2 轮询端点 + P0-3 字段落库验证通过
- Dry Run R2 报告门控决策为 Go

## 输出格式

- 生成修正报告，保存到 `F:\hse-dashboard\docs\R1-Phase1-缺陷修复报告.md`
- 报告结构：
  - 一、修复清单（5 项，含代码 diff）
  - 二、语法校验结果
  - 三、重跑 Dry Run 执行记录
  - 四、冒烟测试结果（P0-1/P0-2/P0-3）
  - 五、门控决策
- 重跑 Dry Run 报告保存到 `F:\hse-dashboard\docs\R1-Phase1-DryRun-R2执行报告.md`