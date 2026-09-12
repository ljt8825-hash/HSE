# R1 Phase 1 后端协作 — v1.1 修正报告

> 生成日期: 2026-07-29
> 对应提示词: `提示词-30-R1-Phase1-规格文档v1.1修正.md`
> 前置: `R1-Phase1-后端协作需求规格.md`（v1.0 已交付，后端代码已落地）
> 性质: 代码核验 → 修正（后端代码修正 + 规格文档升级 v1.0→v1.1）
> 红线: 不修改前端 Q3/Q4/Q5 / 路由菜单 / `employee-selector.ts` / `employee_assignment` 基础层；不修改 `employeeEventService.js` 与 `wsServer.js`

---

## 一、代码核验过程（10 个文件逐一核实）

| # | 文件 | 核验结论 | 发现问题 |
|---|------|----------|----------|
| 1 | `server/routes/hse-employee.js` | 4 处事件注入点 type 值**未加 `EMPLOYEE_` 前缀** | P0-1 |
| 2 | `server/services/employeeEventService.js` | 事件服务本身正确（仅透传 type） | 无需改（禁止项） |
| 3 | `server/services/wsServer.js` | `broadcastNotification` 对外层包裹 `NOTIFICATION` | P0-4（文档补全） |
| 4 | `server/routes/hazards.js` | PUT 更新 `setClauses` 仅检查 `b.checkerId`，不兼容 `b.checker_id` | P1-1 |
| 5 | `server/routes/accidents.js` | 字段落库已完整（handler_id） | 无问题 |
| 6 | `server/routes/emergency.js` | 字段落库已完整（responsible_person_id） | 无问题 |
| 7 | `server/sql/hse_employee_master_v68_extension.sql` | 回填仅做姓名精确匹配；缺 baseline/registry | P0-2 / P0-3 |
| 8 | `安全看板vben/.../composables/hse/types.ts` | `EmployeeEventType` **已含 `EMPLOYEE_` 前缀**（4 枚举值正确） | 无问题（前端正确） |
| 9 | `安全看板vben/.../composables/hse/useEmployeeEvent.ts` | 去重键 `${type}:${employeeId}:${occurredAt}` | 无问题（前端正确） |
| 10 | `安全看板vben/.../composables/hse/useEmployeeData.ts` | 事件订阅/兜底逻辑 | 无问题（前端正确） |

**核验要点**：前端 `types.ts` 的 `EmployeeEventType` 枚举已为 `EMPLOYEE_TRANSFERRED` / `EMPLOYEE_RESIGNED` / `EMPLOYEE_STATUS_CHANGED` / `EMPLOYEE_INFO_UPDATED`，后端注入点原为无前缀值（`TRANSFERRED` 等），导致前后端去重键失配 → 触发 P0-1。

---

## 二、P0 级修正（4 项，含代码 diff）

### P0-1 · 前后端事件类型统一加 `EMPLOYEE_` 前缀

**文件**：`server/routes/hse-employee.js`（4 处注入点）+ 规格文档

**代码 diff**：
```js
// POST /org/assign（调岗/入职）
- type: 'TRANSFERRED',
+ type: 'EMPLOYEE_TRANSFERRED',

// PUT /employees/:id（信息变更）
- type: 'INFO_UPDATED',
+ type: 'EMPLOYEE_INFO_UPDATED',

// PUT /org/:id/status（离职 / 其他状态）
- const eventType = (status === '离职') ? 'RESIGNED' : 'STATUS_CHANGED';
+ const eventType = (status === '离职') ? 'EMPLOYEE_RESIGNED' : 'EMPLOYEE_STATUS_CHANGED';
```
> 同步更新了对应注释与 `console.warn` 日志字符串，保持可读一致。

**规格文档同步**：§3.2 事件类型表、§3.4 信封示例（`"type": "EMPLOYEE_TRANSFERRED"`）、§3.4 去重键示例、§5.2 测试用例全部加前缀；§七 新增风险 #8（禁止后续去前缀）。

---

### P0-2 · 历史回填改为四级容错策略

**文件**：`server/sql/hse_employee_master_v68_extension.sql`（§四 重写）+ 规格文档 §4.3

**背景**：原回填仅 `TRIM(文本) = employee.name` 精确匹配，违反项目硬约束「人员关联必须优先使用员工编号」。

**修正后逻辑**（每级仅填充上一轮仍为 NULL 的行，高优先级优先）：
```
级别1: 文本中提取员工编号（如 "张三(E0001)"）→ 匹配 employee.employee_code
级别2: 文本中提取纯数字编号（如 "张三(12345)"）→ 匹配 employee.id
级别3: TRIM(文本) 精确匹配 employee.name
级别4: 模糊匹配（去除所有括号后缀，如 "张三(安全员)" → 张三）→ 匹配 employee.name
```
**代码 diff（节选 hazards.checker_id）**：
```sql
-- 修正前（单一姓名匹配）
UPDATE hazards h SET checker_id = (
  SELECT e.id FROM employee e WHERE e.is_deleted = false AND e.name = TRIM(h.checker) LIMIT 1
) WHERE h.checker_id IS NULL AND h.checker IS NOT NULL AND TRIM(h.checker) <> '';

-- 修正后（四级容错，DO $$ 包裹并记录命中数）
DO $$
DECLARE v_before INTEGER; v_l1 INTEGER; v_l2 INTEGER; v_l3 INTEGER; v_l4 INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_before FROM hazards WHERE checker_id IS NULL AND checker IS NOT NULL AND TRIM(checker) <> '';
  UPDATE hazards h SET checker_id = e.id FROM employee e
    WHERE h.checker_id IS NULL AND h.checker IS NOT NULL AND TRIM(h.checker) <> ''
      AND h.checker LIKE '%(' || e.employee_code || ')%' AND e.is_deleted = false;
  GET DIAGNOSTICS v_l1 = ROW_COUNT;
  UPDATE hazards h SET checker_id = e.id FROM employee e
    WHERE h.checker_id IS NULL AND h.checker IS NOT NULL AND TRIM(h.checker) <> ''
      AND e.id::text = substring(h.checker FROM '\((\d+)\)') AND e.is_deleted = false;
  GET DIAGNOSTICS v_l2 = ROW_COUNT;
  UPDATE hazards h SET checker_id = e.id FROM employee e
    WHERE h.checker_id IS NULL AND h.checker IS NOT NULL AND TRIM(h.checker) <> ''
      AND e.name = TRIM(h.checker) AND e.is_deleted = false;
  GET DIAGNOSTICS v_l3 = ROW_COUNT;
  UPDATE hazards h SET checker_id = e.id FROM employee e
    WHERE h.checker_id IS NULL AND h.checker IS NOT NULL AND TRIM(h.checker) <> ''
      AND e.name = TRIM(regexp_replace(h.checker, '\([^)]*\)', '', 'g')) AND e.is_deleted = false;
  GET DIAGNOSTICS v_l4 = ROW_COUNT;
  RAISE NOTICE 'hazards.checker_id 回填: 候选=% L1=% L2=% L3=% L4=%', v_before, v_l1, v_l2, v_l3, v_l4;
END $$;
```
> 四个目标列（hazards.checker_id / fixer_id、accidents.handler_id、emergency_plans.responsible_person_id）均按此模式重写；§五 验证块同步增强，输出「已回填数 / 未匹配数」用于命中率统计。

---

### P0-3 · 迁移脚本增加 baseline 与 backup_registry

**文件**：`server/sql/hse_employee_master_v68_extension.sql`（DDL 之前新增 Step 0 / Step 0.5）+ 规格文档 §4.4

**代码 diff（脚本开头插入）**：
```sql
-- Step 0: migration_baseline（记录迁移前状态）
CREATE TABLE IF NOT EXISTS migration_baseline (
  id SERIAL PRIMARY KEY, migration_name VARCHAR(200) NOT NULL, table_name VARCHAR(200) NOT NULL,
  row_count INTEGER, baseline_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(migration_name, table_name)
);
INSERT INTO migration_baseline (migration_name, table_name, row_count)
VALUES
  ('v68_extension', 'hazards', (SELECT COUNT(*) FROM hazards)),
  ('v68_extension', 'accidents', (SELECT COUNT(*) FROM accidents)),
  ('v68_extension', 'emergency_plans', (SELECT COUNT(*) FROM emergency_plans)),
  ('v68_extension', 'employee', (SELECT COUNT(*) FROM employee WHERE is_deleted = false));

-- Step 0.5: migration_backup_registry（登记备份文件）
CREATE TABLE IF NOT EXISTS migration_backup_registry (
  id SERIAL PRIMARY KEY, migration_name VARCHAR(200) NOT NULL, backup_file VARCHAR(500) NOT NULL,
  checksum VARCHAR(64), created_at TIMESTAMPTZ DEFAULT NOW()
);
```
> 规格文档 §4.4 执行顺序新增「baseline 采集」与「registry 登记」步骤；§七 新增风险 #9。

---

### P0-4 · 补充 WS 双层包裹说明

**文件**：规格文档（无后端代码改动，符合禁止项）

**内容**：§3.1 明确 `broadcastNotification` 在传入信封外层再包裹 `{ type:'NOTIFICATION', timestamp, payload }`，前端实际收到 `{ type:'NOTIFICATION', payload:{ type:'EMPLOYEE_EVENT', event } }`，须从 `payload.event` 提取 `EmployeeEventEnvelope`；§六「缓存刷新」行同步补充解析逻辑。

---

## 三、P1 级修正（3 项，含代码 diff）

### P1-1 · hazards.js UPDATE 入参兼容 snake_case

**文件**：`server/routes/hazards.js`（L712-713）+ 规格文档 §4.2

**代码 diff**：
```js
// 修正前
if (b.checkerId !== undefined) { setClauses.push(`checker_id = $${i++}`); params.push(b.checkerId || null); }
if (b.fixerId !== undefined) { setClauses.push(`fixer_id = $${i++}`); params.push(b.fixerId || null); }

// 修正后（与 POST 提取逻辑 b.checkerId || b.checker_id 对齐）
if (b.checkerId !== undefined || b.checker_id !== undefined) { setClauses.push(`checker_id = $${i++}`); params.push(b.checkerId || b.checker_id || null); }
if (b.fixerId !== undefined || b.fixer_id !== undefined) { setClauses.push(`fixer_id = $${i++}`); params.push(b.fixerId || b.fixer_id || null); }
```

---

### P1-2 · 实施顺序增加 Dry Run 阶段

**文件**：规格文档 §八

**内容**：在「阶段 0（数据库）」与「阶段 1（后端部署，灰度）」之间插入「阶段 0.5（Dry Run，测试环境）」：执行完整迁移脚本 → 生成 Dry Run 报告（各步耗时、影响行数、回填命中率 L1~L4）→ 复审 → 通过后进入阶段 1。

---

### P1-3 · 执行顺序增加锁检查和活跃连接检查

**文件**：规格文档 §4.4

**内容**：在「步骤 1（备份）」之前新增步骤 0（锁检查 + 活跃连接检查 SQL）：
```sql
SELECT pid, state, query FROM pg_stat_activity WHERE datname='hse_dashboard' AND state='active';
SELECT relation::regclass, mode, granted FROM pg_locks WHERE relation IN ('hazards'::regclass, 'accidents'::regclass, 'emergency_plans'::regclass, 'employee'::regclass);
```

---

## 四、修正前后对比

| 维度 | 修正前（v1.0） | 修正后（v1.1） |
|------|---------------|---------------|
| 事件类型 | `TRANSFERRED` / `RESIGNED` / `STATUS_CHANGED` / `INFO_UPDATED` | `EMPLOYEE_TRANSFERRED` / `EMPLOYEE_RESIGNED` / `EMPLOYEE_STATUS_CHANGED` / `EMPLOYEE_INFO_UPDATED`（与前端对齐） |
| 历史回填 | 单一姓名精确匹配 | 四级容错（编号→数字ID→姓名→模糊），每级记录命中数 |
| 迁移可追溯 | 无 baseline/registry | 新增 `migration_baseline` + `migration_backup_registry` |
| WS 推送格式 | 仅描述 `{type:'EMPLOYEE_EVENT',event}` | 明确双层包裹，前端从 `payload.event` 提取 |
| hazards UPDATE 入参 | 仅 camelCase | camelCase + snake_case 兼容 |
| 实施流程 | 阶段 0→1→2→3 | 阶段 0→0.5(Dry Run)→1→2→3，备份前加锁检查 |

---

## 五、验收确认单

| 验收项 | 结果 |
|--------|------|
| 后端 `hse-employee.js` 4 处事件 type 值与前端 `types.ts` 的 `EmployeeEventType` 完全一致 | ✅ 已核验（4 处均加 `EMPLOYEE_` 前缀） |
| `hse_employee_master_v68_extension.sql` 回填 SQL 包含四级容错策略 | ✅ 4 列均重写，含 L1~L4 命中统计 |
| `hse_employee_master_v68_extension.sql` 包含 baseline 和 backup_registry 创建 | ✅ Step 0 / Step 0.5 已插入 |
| `hazards.js` UPDATE 入参兼容 camelCase 和 snake_case | ✅ L712-713 已兼容 |
| 规格文档 v1.1 包含修正清单（附录） | ✅ §九 修正记录 + 附录清单（7 项） |
| 所有修改文件通过 `node --check` 语法校验 | ✅ `hse-employee.js` / `hazards.js` 均 OK |
| 前端代码（Q3/Q4/Q5 / 路由 / `employee-selector.ts`）未被修改 | ✅ 红线遵守 |
| `employeeEventService.js` / `wsServer.js` 未被修改 | ✅ 红线遵守 |
| 版本号 v1.0 → v1.1，状态更新为「代码核验修正完成」 | ✅ 已升级 |

**结论**：7 项修正（4 P0 + 3 P1）全部完成并通过代码核验与语法校验，规格文档升级至 v1.1，可进入灰度部署前置的 Dry Run 阶段。
