# 提示词-13-Naive-HSE列对齐复查与命名统一批

> 任务来源：Phase 11 Codex 审核非阻塞建议 —— 统一 API 排序参数命名 `sortBy` → `sortField`；Phase 11 列对齐规范仅抽查 5 页，需全量复查。
> 批次性质：**阶段 13 —— 列对齐复查与命名统一批**。改动量小、风险低，闭环 Phase 11 遗留项。
> 执行环境：web-naive (`apps/web-naive`)，后端 **不改**（`server/` 零改动）。
> 前置条件：Phase 12 Codex 审核通过。

---

## 一、Part 1 —— API 排序参数命名统一

### 1.1 现状

Phase 11 中不同 Agent 使用了不一致的排序参数命名：

| 命名 | API 文件 |
|---|---|
| `sortField?` | training, hazard, accident, audit, system, goals, regulations |
| `sortBy?` | emergency, insurance, site, violations, risk-control, employee |

### 1.2 统一目标

**全部统一为 `sortField?`**（与 Phase 11 试点 `training/ledger` 保持一致）。

### 1.3 实施步骤

**Step 1：修改 API 类型文件（`sortBy?` → `sortField?`）**

| 文件 | 变更 |
|---|---|
| `api/hse/emergency.ts` | `DrillListParams`, `MaterialListParams`, `TeamListParams`, `EventListParams`, `EmergencyListParams` 中 `sortBy?` → `sortField?` |
| `api/hse/insurance.ts` | `PersonnelListParams`, `VehicleListParams`, `OtherListParams` 中 `sortBy?` → `sortField?` |
| `api/hse/site.ts` | `FireEquipmentListParams`, `GridAreaListParams` 中 `sortBy?` → `sortField?` |
| `api/hse/violations.ts` | `ViolationListParams` 中 `sortBy?` → `sortField?` |
| `api/risk-control/index.ts` | `RiskListParams` 中 `sortBy?` → `sortField?` |
| `api/hse/employee.ts` | `EmployeeListParams` 中 `sortBy?` → `sortField?`（如存在） |

**Step 2：修改对应 Vue 视图文件（`sortBy:` → `sortField:`）**

每个 API 参数名变更后，需要同步修改对应 Vue 文件中的 API 调用。查找方式：

```
rg "sortBy:" apps/web-naive/src/views/emergency/
rg "sortBy:" apps/web-naive/src/views/insurance/
rg "sortBy:" apps/web-naive/src/views/site/
rg "sortBy:" apps/web-naive/src/views/risk-control/
```

将每个 `sortBy: sortBy.value` 改为 `sortField: sortBy.value`（注意：变量名 `sortBy` 不变，仅 API 参数名改为 `sortField`）。

**Step 3：验证**

- `rg "sortBy\?" apps/web-naive/src/api` → 0 结果（API 类型全部统一）
- `rg "sortBy: sortBy" apps/web-naive/src/views` → 0 结果（视图调用全部统一）
- typecheck + build 通过

---

## 二、Part 2 —— 列对齐规范全量复查

### 2.1 复查范围

Phase 11 排序列的所有 **28 个业务页面**（不含 `demos/`、只读分析页）。

### 2.2 复查标准（`01-强制设计约束.md` §5）

| 内容类型 | 应对齐 | 应设 `showOverflow` |
|---|---|---|
| 长文本（名称、描述、地址、标题、内容） | `align: 'left'` | `showOverflow: 'tooltip'` |
| 日期、数值、状态、风险等级、操作列 | `align: 'center'` | 可选 |
| 含 `sortable: true` 的列 | 表头居中（`align: 'center'`） | — |

### 2.3 实施方式

逐页扫描列定义中的 `align` 和 `showOverflow` 属性，发现违规立即修正。

**常见违规模式：**
- 长文本列（如 `description`、`content`、`name`、`address`）误设为 `align: 'center'` → 改 `align: 'left'`
- 长文本列缺少 `showOverflow: 'tooltip'` → 补充
- 日期/数值列误设为 `align: 'left'` → 改 `align: 'center'`

### 2.4 验收

- 逐页列对齐核查清单（记录于 `_verify/13/alignment-check.md`）
- 违规列已修正
- typecheck + build 通过

---

## 三、Part 3 —— 列定义 `slot` 命名一致性检查

### 3.1 检查内容

扫描所有 28 个排序页面，确认：

- 使用 `slots: { default: 'status' }` 的列，模板中 `<template #status>` 应使用 `HseStatusTag` 组件
- 日期格式化 slot（如 `expiryDate`、`checkDate`、`createdAt`）应使用 `formatDate` 函数
- 无孤立的 slot 定义（定义了 `slots: { default: 'xxx' }` 但模板中无对应 `<template #xxx>`）

### 3.2 验收

- 无孤立 slot 定义
- 状态类 slot 统一使用 `HseStatusTag`

---

## 四、实施顺序

### 13A —— 命名统一（1 个文件试点 → 全量）
- 先改 `api/hse/emergency.ts` + 对应 5 个 Vue 视图，验证 typecheck
- 通过后改其余 5 个 API 文件 + 对应视图

### 13B —— 列对齐全量复查
- 逐页扫描 28 个排序页面，生成对齐核查清单
- 修正违规列

### 13C —— Slot 一致性检查
- 扫描孤 slot + status slot 统一

---

## 五、本批明确不实施

- **不改后端 `server/`、SQL、`package.json`、锁文件**
- **不改 `web-antd`**
- **不改路由 path/name/authority**
- **不改 API 接口契约**（仅前端 TypeScript 类型命名）
- **不改 `views/demos/`**
- **不改 `HseDataGrid` 组件本身**
- **不改行编辑功能**（Phase 12 已闭环）

---

## 六、红线

1. 命名统一仅改前端 TS 类型和 Vue 调用，**不改后端 API 出入参**（后端不感知参数名）
2. 列对齐修正仅改 `align` 和 `showOverflow`，**不改列宽/列顺序/字段名**
3. typecheck 必须显式 EXIT=0
4. build 必须 EXIT=0
5. 每次改动独立段落描述

---

## 七、交付物

1. `docs/Naive UI/_verify/13/`：命名统一前后 rg 证据、列对齐核查清单、typecheck/build 日志
2. `docs/Naive UI/阶段13-列对齐与命名统一-执行总结.md`：逐文件变更清单、验证结果、红线合规声明
3. 完成后 **STOP**，静候 Codex 审核