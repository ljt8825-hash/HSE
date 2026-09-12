# 提示词-57 v2：业务模块 supervisor_id 读取补全 — 实勘修正版

> 编号：提示词-57 v2
> 日期：2026-07-30
> 性质：**功能补全（P2）**
> 前置：提示词-56 执行报告（回填策略增强 v1.2 ✅）
> 改动文件：4 个（3 后端 + 1 前端）

---

## 0. 实勘纠正（v1 提示词错误汇总）

### 0.1 路由白名单确认

| 模块 | v1 假设 | 实勘结果 |
|------|---------|---------|
| 事故 | 有活跃路由，可改 | `hse-accidents.ts` 不在白名单 → **无活跃路由，整个任务移除** |
| 培训 | 视图路径 `views/hse/training/index.vue` | 实际活跃路由 `/training/records` → `views/training/ledger/index.vue` |
| 三违 | 视图路径 `views/hse/violations/index.vue` | 实际活跃路由 `/site/violation` → `views/violations/index.vue` |
| 员工列表 | `views/hse/employee/index.vue` | ✅ 路径正确（`/personnel/employee`） |

### 0.2 后端 JOIN 现状

| 文件 | 已有 supervisor JOIN | 已有 supervisor_name 列 | 仅缺 supervisor_id |
|------|:--:|:--:|:--:|
| `hse-employee.js` | ✅ `ea_sup` JOIN | ✅ `sup.name AS supervisor_name` | ✅ 仅缺 `ea_sup.supervisor_id` |
| `training.js` | ✅ `ea` + `sup` JOIN | ✅ `sup.name AS supervisor_name` | ✅ 仅缺 `sup.id AS supervisor_id` |
| `violations.js` | ✅ `v_employee_org_full` LATERAL | ✅ `emp.supervisor_name` | ✅ 仅缺 `emp.supervisor_id` |

### 0.3 前端列定义现状

| 视图 | 已有 supervisor_name | 已有 supervisor_id | 需加列 |
|------|:--:|:--:|:--:|
| `views/hse/employee/index.vue` | ✅ `supervisor_name` | ❌ | ❌ 无需加列 |
| `views/training/ledger/index.vue` | ❌ 完全无 | ❌ | ✅ 需加列 |
| `views/violations/index.vue` | ✅ `supervisorName` | ❌ | ❌ 无需加列 |

> **结论**：所有模块的 JOIN 链早已存在、supervisor_name 也已输出，缺口仅在后端 SELECT 缺少 `supervisor_id` + 培训模块前端缺少展示列。员工列表和三违列表前端列已就绪，无需前端改动。

---

## 1. 任务 A：员工列表 — 补 supervisor_id（仅后端）

### 1.1 后端

**文件**：`server/routes/hse-employee.js`，`GET /employees`（约 L573-593）

当前 SELECT 已有 `sup.name AS supervisor_name`，仅需增加 `supervisor_id`：

```sql
-- 在 SELECT 中增加一行（ea_sup JOIN 已存在）
ea_sup.supervisor_id AS supervisor_id,
```

> 无需新增 JOIN（`ea_sup` 已存在：`LEFT JOIN employee_assignment ea_sup ON ev.employee_id = ea_sup.employee_id AND ea_sup.is_primary = true AND ea_sup.is_current = true AND ea_sup.is_deleted = false`）。

### 1.2 前端

**无需改动**。`views/hse/employee/index.vue` 已存在 `supervisor_name` 列（第 282 行，dataIndex: `supervisor_name`）。

---

## 2. 任务 B：培训模块 — 补 supervisor_id + 前端列

### 2.1 后端

**文件**：`server/routes/training.js`，`GET /`（约 L273-277）

当前 SELECT 已有 `sup.name AS supervisor_name`，仅需增加 `supervisor_id`：

```sql
-- 在 SELECT 中增加一行（ea + sup JOIN 已存在）
sup.id AS supervisor_id,
```

当前 JOIN 链（已存在，无需改动）：
```sql
LEFT JOIN employee_assignment ea ON tr.employee_id = ea.employee_id
  AND ea.is_primary = true AND ea.is_current = true AND ea.is_deleted = false
LEFT JOIN employee sup ON ea.supervisor_id = sup.id AND sup.is_deleted = false
```

### 2.2 前端

**文件**：`views/training/ledger/index.vue`（hse-08-training.ts 白名单内，路由 `/training/records`）

当前表格列定义（约 L511-522）**完全无 supervisor 列**，需增加：

```ts
{
  title: '直接上级',
  dataIndex: 'supervisor_name',
  width: 100,
  ellipsis: true,
  customRender: ({ record }: any) => record.supervisor_name || '-',
}
```

---

## 3. 任务 C：三违模块 — 补 supervisor_id（仅后端）

### 3.1 后端

**文件**：`server/routes/violations.js`，`GET /`（约 L351-378）

当前 LATERAL 子查询仅取 `position_name` + `supervisor_name`，需增加 `supervisor_id`：

```sql
-- LATERAL 子查询中增加 supervisor_id
SELECT emp.position_name, emp.supervisor_id, emp.supervisor_name
```

> `v_employee_org_full` 视图已含 `supervisor_id` 列。无需新增 JOIN。

### 3.2 前端

**无需改动**。`views/violations/index.vue` 已存在 `supervisorName` 列（第 685 行，dataIndex: `supervisorName`）。

> 注意：三违前端使用驼峰命名 `supervisorName`，后端返回 `supervisor_name`（snake_case）。需确认 API 响应层是否有 snake_case → camelCase 自动转换，如无则后端 alias 改为 `supervisorName`。

---

## 4. 改动范围（修正后）

| 文件 | 改动 | 类型 |
|------|------|------|
| `server/routes/hse-employee.js` | SELECT 增加 `ea_sup.supervisor_id AS supervisor_id` | 后端 |
| `server/routes/training.js` | SELECT 增加 `sup.id AS supervisor_id` | 后端 |
| `server/routes/violations.js` | LATERAL SELECT 增加 `emp.supervisor_id` | 后端 |
| `views/training/ledger/index.vue` | 表格增加"直接上级"列 | 前端 |

> **事故模块移除**：`hse-accidents.ts` 不在白名单，且后端已完备（`handler_supervisor_id` + `handler_supervisor_name` 均已存在），无需任何改动。
> **员工列表前端移除**：已有 `supervisor_name` 列，无需加列。
> **三违列表前端移除**：已有 `supervisorName` 列，无需加列。

---

## 5. 验证清单

### 任务 A
- [ ] `GET /api/hse/employees` 返回数据含 `supervisor_id` 字段
- [ ] 员工列表页"直接上级"列正常显示（已有列，仅验证数据完整性）

### 任务 B
- [ ] `GET /api/hse/training/records` 返回数据含 `supervisor_id` 字段
- [ ] 培训记录页表格显示"直接上级"列
- [ ] 无 supervisor 的培训记录显示 `-`

### 任务 C
- [ ] `GET /api/hse/violations` 返回数据含 `supervisor_id` 字段
- [ ] 三违列表页"直接上级"列正常显示（已有列，仅验证数据完整性）

### 回归
- [ ] 后端重启后 `/api/health` 正常
- [ ] 前端构建成功（`pnpm build`，当前 0 TS 错误）
- [ ] 各模块页面渲染正常，无白屏

---

## 6. 红线约束

- 仅 SELECT 增加字段 + 前端增加展示列，不修改 JOIN 链
- 不修改路由定义、菜单配置、组件库
- 不修改数据库表结构
- 不修改登录相关代码
- 不修改导入/入库流程
- 事故模块不修改（路由未激活 + 后端已完备）
- 员工列表和三违列表前端不动（列已存在）

---

## 7. 当前 P2 任务面板

| 提示词 | 内容 | 状态 |
|--------|------|------|
| 53 | FK 约束补全 Phase 1 | 📋 已生成 |
| 54-55 | TS 错误清零 | ✅ 已闭环 |
| 56 | 回填策略增强 v1.2 | ✅ 已闭环 |
| **57 v2** | **supervisor_id 读取补全（实勘修正）** | 📋 本提示词 |
| - | FK 补全 Phase 2 | 待规划 |

---

> 编制：Senior Developer（高级开发工程师）
> 关联：`17-提示词-56-执行报告-回填策略增强v1.2.md`、`10-提示词-53-FK约束补全-Phase1.md`、`18-提示词-57-supervisor_id读取补全.md`