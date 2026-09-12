# 提示词-57：业务模块 supervisor_id 读取补全 — 事故/培训/三违/员工列表

> 编号：提示词-57
> 日期：2026-07-30
> 性质：**功能补全（P2）**
> 前置：提示词-56 执行报告（回填策略增强 v1.2 ✅）
> 改动文件：7 个（4 后端 + 3 前端）

---

## 0. 背景

`supervisor_id`（直接上级）已通过花名册导入流程写入 `employee_assignment` 表，索引 `idx_emp_assign_supervisor` 已建，视图 `v_employee_current` 已包含 `supervisor_id` + `supervisor_name`。但**业务模块读取侧几乎空白**：

| 模块 | 当前状态 | 缺口 |
|------|---------|------|
| 员工列表 | 无 supervisor 列 | 后端查询不含 `supervisor_name`，前端无列 |
| 事故模块 | 0 处 supervisor 引用 | 事故责任人上级无法追溯 |
| 培训模块 | 0 处 supervisor 引用 | 受训人上级无法关联 |
| 三违模块 | JOIN 了 `v_employee_org_full` 但未取 supervisor | 三违人员上级无法展示 |

**数据已就绪，缺口仅在查询和展示层。**

---

## 1. 任务 A：员工列表增加"直接上级"列

### 1.1 后端

**文件**：`server/routes/hse-employee.js`，`GET /employees` 路由

在员工列表查询的 JOIN 链中增加 `employee_assignment` 关联：

```sql
-- 在现有 FROM employee e 的 JOIN 链末尾增加
LEFT JOIN employee_assignment ea 
  ON e.id = ea.employee_id AND ea.is_primary = true AND ea.is_current = true AND ea.is_deleted = false
LEFT JOIN employee sup ON ea.supervisor_id = sup.id AND sup.is_deleted = false
```

在 SELECT 中增加：
```sql
sup.name AS supervisor_name
```

### 1.2 前端

**文件**：`views/hse/employee/index.vue`

在表格列定义中增加"直接上级"列：

```ts
{
  title: '直接上级',
  dataIndex: 'supervisor_name',
  width: 100,
  ellipsis: true,
}
```

> 如果已有 `<EmployeeName>` 组件且希望 supervisor 也支持点击跳转，可返回 `supervisor_id` 并在列中使用 `<EmployeeName :id="record.supervisor_id" :name="record.supervisor_name" />`。

---

## 2. 任务 B：事故模块增加 supervisor 展示

### 2.1 后端

**文件**：`server/routes/accidents.js`

在事故列表/详情查询中增加 `employee_assignment` JOIN：

```sql
-- 在现有事故查询的 JOIN 链末尾增加
LEFT JOIN employee_assignment ea 
  ON a.handler_id = ea.employee_id AND ea.is_primary = true AND ea.is_current = true AND ea.is_deleted = false
LEFT JOIN employee sup ON ea.supervisor_id = sup.id AND sup.is_deleted = false
```

> 事故的责任人字段为 `handler_id`（处理人），通过 `handler_id` → `employee_assignment.employee_id` 获取 `supervisor_id`。

在 SELECT 中增加：
```sql
sup.name AS handler_supervisor_name
```

### 2.2 前端

**文件**：`views/hse/accidents/index.vue`

在事故详情抽屉/列表中增加"处理人上级"字段展示（可选，按需放在详情区域）：

```ts
// 详情中增加
{ label: '处理人上级', value: record.handler_supervisor_name || '-' }
```

---

## 3. 任务 C：培训模块增加 supervisor 展示

### 3.1 后端

**文件**：`server/routes/training.js`

在培训记录列表/详情查询中增加 `employee_assignment` JOIN：

```sql
LEFT JOIN employee_assignment ea 
  ON tr.employee_id = ea.employee_id AND ea.is_primary = true AND ea.is_current = true AND ea.is_deleted = false
LEFT JOIN employee sup ON ea.supervisor_id = sup.id AND sup.is_deleted = false
```

在 SELECT 中增加：
```sql
sup.name AS supervisor_name
```

### 3.2 前端

**文件**：`views/hse/training/index.vue`

在培训记录表格列中增加"直接上级"列（可选，按需）：

```ts
{
  title: '直接上级',
  dataIndex: 'supervisor_name',
  width: 100,
  ellipsis: true,
}
```

---

## 4. 任务 D：三违模块增加 supervisor 展示

### 4.1 后端

**文件**：`server/routes/violations.js`

当前三违查询已 JOIN `v_employee_org_full`，仅取 `position_name`。在现有 SELECT 中增加：

```sql
v_employee_org_full.supervisor_name AS supervisor_name
```

> 无需新增 JOIN（`v_employee_org_full` 视图已含 `supervisor_id` + `supervisor_name`）。

### 4.2 前端

**文件**：`views/hse/violations/index.vue`

在三违记录表格或详情中增加"直接上级"列：

```ts
{
  title: '直接上级',
  dataIndex: 'supervisor_name',
  width: 100,
  ellipsis: true,
}
```

---

## 5. 改动范围

| 文件 | 改动 | 类型 |
|------|------|------|
| `server/routes/hse-employee.js` | 员工列表查询增加 `employee_assignment` JOIN + `supervisor_name` | 后端 |
| `server/routes/accidents.js` | 事故查询增加 `employee_assignment` JOIN + `handler_supervisor_name` | 后端 |
| `server/routes/training.js` | 培训查询增加 `employee_assignment` JOIN + `supervisor_name` | 后端 |
| `server/routes/violations.js` | 三违查询 SELECT 增加 `supervisor_name`（已有 JOIN） | 后端 |
| `views/hse/employee/index.vue` | 表格增加"直接上级"列 | 前端 |
| `views/hse/accidents/index.vue` | 事故详情增加"处理人上级"字段 | 前端 |
| `views/hse/violations/index.vue` | 三违表格增加"直接上级"列 | 前端 |

> 培训模块前端改动为可选（按需），不影响核心交付。

---

## 6. 验证清单

### 任务 A
- [ ] `GET /api/hse/employees` 返回数据含 `supervisor_name` 字段
- [ ] 员工列表页表格显示"直接上级"列
- [ ] 无 supervisor 的员工显示 `-`

### 任务 B
- [ ] `GET /api/hse/accidents` 返回数据含 `handler_supervisor_name`
- [ ] 事故详情中显示"处理人上级"

### 任务 C
- [ ] `GET /api/hse/training` 返回数据含 `supervisor_name`

### 任务 D
- [ ] `GET /api/hse/violations` 返回数据含 `supervisor_name`
- [ ] 三违列表表格显示"直接上级"列

### 回归
- [ ] 后端重启后 `/api/health` 正常
- [ ] 前端构建成功（`pnpm build`，当前 0 TS 错误）
- [ ] 各模块页面渲染正常，无白屏

---

## 7. 红线约束

- 仅增加 SQL JOIN + SELECT 字段 + 前端展示列，不修改业务逻辑
- 不修改路由定义、菜单配置、组件库
- 不修改数据库表结构（仅读取已有数据）
- 不修改登录相关代码
- 不修改导入/入库流程
- 所有 JOIN 使用 `LEFT JOIN`（避免因无 supervisor 导致记录丢失）
- 所有 supervisor 引用需检查 `is_deleted = false`

---

## 8. 当前 P2 任务面板

| 提示词 | 内容 | 状态 |
|--------|------|------|
| 53 | FK 约束补全 Phase 1（培训 + 三违 + 目标责任） | 📋 已生成，待执行 |
| 54-55 | TS 错误清零 | ✅ 已闭环 |
| 56 | 回填策略增强 v1.2 | ✅ 已闭环 |
| **57** | **supervisor_id 读取补全** | 📋 本提示词 |
| - | FK 补全 Phase 2（考核 + HSE 核心事件） | 待规划 |

---

> 编制：Senior Developer（高级开发工程师）
> 关联：`17-提示词-56-执行报告-回填策略增强v1.2.md`、`10-提示词-53-FK约束补全-Phase1.md`