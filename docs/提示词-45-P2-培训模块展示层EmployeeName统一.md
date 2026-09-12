# 提示词 45：P2 培训模块 — 展示层 EmployeeName 统一

> 编号：提示词-45
> 日期：2026-07-30
> 状态：待执行
> 前置：提示词-44 执行报告 ✅（P1 三件套展示层统一完成）
> 关联：`跨模块-人员字段模式统一审计报告.md`（§2.4、§3）、`提示词-44-执行报告.md`

---

## 0. 背景

审计报告（§2.4）标明培训模块当前状态：

| 维度 | 状态 |
|------|------|
| 数据库 | 🟢 `training_records.employee_id` 列存在 |
| 后端 formatRow | 🟢 `training.js:196` 返回 `employeeId: row.employee_id \|\| null` |
| 后端 INSERT/UPDATE | 🟢 全链路写入 `employee_id` |
| 前端 API 类型 | 🟢 `training.ts:126` 含 `employeeId?: number` |
| 前端展示 | 🔴 列表/详情用 `traineeName` 文本，未用 EmployeeName |

**后端全链路已就绪，仅前端展示层待统一。** 与三违/目标完全同模式——后端零改动，仅加 `<EmployeeName>` + 文本兜底。

---

## 1. 现状分析

### 1.1 培训模块结构

培训模块通常包含多个子页面（台账/执行/统计等），需确认实际活动文件路径。审计报告 Grep 结果指向 `training/index.vue`。

### 1.2 当前展示方式

```
列表列：{{ record.traineeName || '-' }}
详情：{{ currentRecord.traineeName || '-' }}
```

### 1.3 目标展示方式

```
列表列：<EmployeeName v-if="record.employeeId" :employee-id="record.employeeId" />
        <span v-else>{{ record.traineeName || '-' }}</span>

详情：<EmployeeName v-if="currentRecord.employeeId" :employee-id="currentRecord.employeeId" />
      <span v-else>{{ currentRecord.traineeName || '-' }}</span>
```

---

## 2. 修改内容

### 2.1 修改文件

以实际 Grep 定位的活动文件为准。以下按 `src/views/training/index.vue` 为参考（请以实际文件路径为准）。

### 2.2 步骤

#### Step 1：确认活动文件路径

```bash
# 确认实际路由注册的文件
grep -n "training" src/router/routes/modules/*.ts
grep -rn "training" src/router/routes/index.ts
```

#### Step 2：导入 EmployeeName

```typescript
// 在 <script setup> 顶部 import 区域新增
import { EmployeeName } from '#/composables/hse';
```

> 若该文件已有其他 `#/composables/hse` 的导入，合并到同一行。

#### Step 3：列表列切换

在当前 `traineeName` 列表列的 `bodyCell` 模板中：

```diff
  <template v-else-if="column.key === 'traineeName'">
-   {{ record.traineeName || '-' }}
+   <EmployeeName v-if="record.employeeId" :employee-id="record.employeeId" />
+   <span v-else>{{ record.traineeName || '-' }}</span>
  </template>
```

> 若列表列 key 为 `trainee` / `employeeName` / `personName` 等，以实际 Grep 结果为准。

#### Step 4：详情展示切换

在详情模态框/抽屉中：

```diff
- <DescriptionsItem label="培训人员">{{ currentRecord.traineeName || '-' }}</DescriptionsItem>
+ <DescriptionsItem label="培训人员">
+   <EmployeeName v-if="currentRecord.employeeId" :employee-id="currentRecord.employeeId" />
+   <span v-else>{{ currentRecord.traineeName || '-' }}</span>
+ </DescriptionsItem>
```

---

## 3. 验证清单

### 3.1 培训模块

- [ ] T-1 列表列培训人员显示为 EmployeeName（有 `employeeId` 时可点击）
- [ ] T-2 列表列无 `employeeId` 时显示文本兜底（`traineeName` 或 `-`）
- [ ] T-3 详情中培训人员显示为 EmployeeName（有 `employeeId` 时可点击）
- [ ] T-4 详情中无 `employeeId` 时显示文本兜底
- [ ] T-5 创建/编辑/删除培训记录功能不受影响（回归）
- [ ] T-6 培训台账/执行/统计等子页面不受影响（回归）
- [ ] T-7 批量导入培训记录功能不受影响（回归）

### 3.2 红线

- [ ] 不修改路由定义
- [ ] 不修改菜单配置
- [ ] 不修改组件库
- [ ] 不修改后端代码
- [ ] 不修改数据库结构
- [ ] 不修改其他模块代码
- [ ] 不修改登录代码

---

## 4. 注意事项

1. **活动文件确认**：培训模块可能有多页面（台账 `ledger`、执行 `execute`、统计等），需 Grep 路由注册确认实际活动文件，避免改到遗留文件（与提示词-44 的 emergency 文件识别教训一致）。

2. **字段名确认**：培训模块的文本字段名可能是 `traineeName` / `trainee` / `employeeName` / `personName`，以实际 Grep 结果为准。同理 `employeeId` 字段名也可能为 `traineeId`。

3. **EmployeeName 导入**：确认 `EmployeeName` 是否已在该文件中导入。若未导入，从 `#/composables/hse` 导入。

4. **批量导入场景**：培训模块的批量导入走 `id_card → employee_id` 自动解析（`resolveEmployeeId`），新记录导入后 `employee_id` 已有值，EmployeeName 可直接展示。旧记录（`employee_id` 为 NULL）以文本兜底。

5. **单条录入表单**：审计报告提到培训师用 `trainer` 文本（`line 198`），学员多为批量导入。本次仅改展示层，单条表单的 EmployeeSelector 接入为可选增强，不在本次范围。

---

## 5. 范围外（后续独立任务）

| # | 内容 | 优先级 |
|---|------|--------|
| 1 | 考核 assessment 语义确认（个人 vs 组织）+ employeeId 链路补全 | P2 |
| 2 | 保险 over-age personnel↔employee 映射评估 | P2 |
| 3 | FK 补全（training/violations/goals/assessment 缺 FK 约束） | P2 |
| 4 | 全项目 TS 存量错误清零（576 处） | P2 |
| 5 | 回填策略增强 v1.2 | P2 |

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`跨模块-人员字段模式统一审计报告.md`、`提示词-44-执行报告.md`