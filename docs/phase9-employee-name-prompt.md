# Phase 9：训练模块 EmployeeName 显示层统一提示词

> 项目路径：`f:\hse-dashboard\安全看板vben\apps\web-antd`
> 框架：Vben Admin 5.7.0 + Ant Design Vue + Vue 3 + TypeScript
> 前置：Phase 1-8 已完成（composable 全量覆盖 + TS 清理闭环）
> 参考：violations、goals 模块已使用 EmployeeName 组件模式

---

## 一、任务目标

将训练模块的「员工姓名」和「培训师」显示统一为 `<EmployeeName>` 组件，遵循 violations / goals 已确立的模式：**优先使用 employeeId 渲染 EmployeeName 组件，无 employeeId 时 fallback 到纯文本**。

## 二、目标文件（6 个，按优先级）

| 优先级 | 文件 | 改造位置 | 涉及的 ID 字段 | API 类型确认 |
|--------|------|---------|---------------|-------------|
| P0 | `src/views/training/plans/index.vue` | 表格列 + 抽屉详情 | `trainerId` | ✅ `TrainingPlanApi.TrainingPlanItem.trainerId` |
| P0 | `src/views/training/ledger/index.vue` | 表格列 + 抽屉详情（姓名+讲师） | `employeeId`、`trainerId` | ✅ `LedgerApi.LedgerItem` |
| P0 | `src/views/training/reminders/index.vue` | 到期检查表格 + 新员工表格 | `employeeId` | ✅ `ExpiryReminderItem` / `NewEmployeeIncompleteItem` |
| P1 | `src/views/training/execute/index.vue` | 执行结果表格 | `employeeId` | ✅ `LedgerApi.LedgerItem`（`created` 数组） |
| P1 | `src/views/training/new-employee/index.vue` | 表格列 + 抽屉详情 | `employeeId` | ✅ `LedgerApi.LedgerItem` |
| P1 | `src/views/training/driver/index.vue` | 表格列 + 抽屉详情 | `employeeId` | ✅ `LedgerApi.LedgerItem` |

> 不改造的文件：`training/index.vue`（`TrainingApi.TrainingPlan` 无 `trainerId`，仅 `trainer: string`）、`stats/index.vue`（`overdueEmployees` 仅有 `employeeCode` 无 `employeeId`）、`analysis/index.vue`（无员工姓名显示）、`requirements/index.vue`（`positionName` 为岗位名非员工名）。

## 三、参考模式（violations / goals 已确立）

```vue
<!-- 表格列 bodyCell 中的 EmployeeName 用法 -->
<template v-if="column.key === 'violatorName'">
  <EmployeeName v-if="record.violatorId" :employee-id="record.violatorId" />
  <span v-else>{{ record.violatorName || '-' }}</span>
</template>

<!-- 抽屉详情中的 EmployeeName 用法 -->
<DescriptionsItem label="违规人">
  <EmployeeName v-if="currentViolation.violatorId" :employee-id="currentViolation.violatorId" />
  <span v-else>{{ currentViolation.violatorName || '-' }}</span>
</DescriptionsItem>
```

**核心规则**：`v-if="record.xxxId"` 判断是否存在 ID → 有则用组件渲染 → 无则 fallback 到 `record.xxxName || '-'`。

## 四、逐文件改造详情

### 4.1 plans/index.vue（P0）

**当前状态**：使用 `TrainingPlanApi.TrainingPlanItem`，有 `trainerId?: number` 和 `trainerName?: string`。表格列和抽屉详情均直接渲染 `trainerName` 文本。

**改造步骤**：

1. **导入 EmployeeName**：
```typescript
import { EmployeeName } from '#/composables/hse';
```

2. **表格列定义保持不变**（列定义 `dataIndex: 'trainerName'` 保留），在 `<template #bodyCell>` 中新增分支：
```vue
<template v-if="column.key === 'trainerName'">
  <EmployeeName v-if="record.trainerId" :employee-id="record.trainerId" />
  <span v-else>{{ record.trainerName || '-' }}</span>
</template>
```

3. **抽屉详情**（`DescriptionsItem label="培训师"`）：
```vue
<DescriptionsItem label="培训师">
  <EmployeeName v-if="currentPlan.trainerId" :employee-id="currentPlan.trainerId" />
  <span v-else>{{ currentPlan.trainerName || '-' }}</span>
</DescriptionsItem>
```

### 4.2 ledger/index.vue（P0）

**当前状态**：使用 `LedgerApi.LedgerItem`，有 `employeeId?: number` 和 `trainerId?: number`。表单已用 `EmployeeSelector` 选择员工，但表格和抽屉中姓名仍为纯文本。

**改造步骤**：

1. **导入 EmployeeName**：
```typescript
import { EmployeeName } from '#/composables/hse';
```

2. **表格列 "姓名"**（`column.key === 'name'`）：
```vue
<template v-if="column.key === 'name'">
  <EmployeeName v-if="record.employeeId" :employee-id="record.employeeId" />
  <span v-else>{{ record.name || '-' }}</span>
</template>
```

3. **抽屉详情 "姓名"**：
```vue
<DescriptionsItem label="姓名">
  <EmployeeName v-if="currentRecord.employeeId" :employee-id="currentRecord.employeeId" />
  <span v-else>{{ currentRecord.name || '-' }}</span>
</DescriptionsItem>
```

4. **抽屉详情 "讲师"**（`currentRecord.trainer`）：
```vue
<DescriptionsItem label="讲师">
  <EmployeeName v-if="currentRecord.trainerId" :employee-id="currentRecord.trainerId" />
  <span v-else>{{ currentRecord.trainer || '-' }}</span>
</DescriptionsItem>
```

### 4.3 reminders/index.vue（P0）

**当前状态**：三个到期检查表格（即将到期/已逾期/从未培训）共用 `expiryColumns`，新员工表格使用 `newEmployeeColumns`。数据类型 `ExpiryReminderItem` 和 `NewEmployeeIncompleteItem` 均有 `employeeId: number`（必填，非可选）。`row-key` 已使用 `record.employeeId`。

**改造步骤**：

1. **导入 EmployeeName**：
```typescript
import { EmployeeName } from '#/composables/hse';
```

2. **到期检查表格**（三个 Tab 共用同一套列定义，`column.key === 'name'`）：
```vue
<template v-if="column.key === 'name'">
  <EmployeeName :employee-id="record.employeeId" />
  <span v-if="!record.employeeId">{{ record.name || '-' }}</span>
</template>
```
> 注意：`ExpiryReminderItem.employeeId` 是必填 `number`（非可选），但防御性保留 fallback。

3. **新员工表格**（同上模式）：
```vue
<template v-if="column.key === 'name'">
  <EmployeeName :employee-id="record.employeeId" />
  <span v-if="!record.employeeId">{{ record.name || '-' }}</span>
</template>
```

### 4.4 execute/index.vue（P1）

**当前状态**：执行结果表格使用 `ExecutePlanResult.created: LedgerApi.LedgerItem[]`，`LedgerItem` 有 `employeeId?: number`。

**改造步骤**：

1. **导入 EmployeeName**：
```typescript
import { EmployeeName } from '#/composables/hse';
```

2. **结果表格 "姓名" 列**（`column.key === 'name'`）：
```vue
<template v-if="column.key === 'name'">
  <EmployeeName v-if="record.employeeId" :employee-id="record.employeeId" />
  <span v-else>{{ record.name || '-' }}</span>
</template>
```

### 4.5 new-employee/index.vue（P1）

**当前状态**：使用 `LedgerApi.LedgerItem`，有 `employeeId?: number`。表单使用纯文本 `<Input>` 输入姓名（非 EmployeeSelector）。

**改造步骤**：

1. **导入 EmployeeName**：
```typescript
import { EmployeeName } from '#/composables/hse';
```

2. **表格列 "姓名"**（`column.key === 'name'`）：
```vue
<template v-if="column.key === 'name'">
  <EmployeeName v-if="record.employeeId" :employee-id="record.employeeId" />
  <span v-else>{{ record.name || '-' }}</span>
</template>
```

3. **抽屉详情 "姓名"**：
```vue
<DescriptionsItem label="姓名">
  <EmployeeName v-if="currentRecord.employeeId" :employee-id="currentRecord.employeeId" />
  <span v-else>{{ currentRecord.name || '-' }}</span>
</DescriptionsItem>
```

### 4.6 driver/index.vue（P1）

**当前状态**：与 new-employee 同模式，使用 `LedgerApi.LedgerItem`。

**改造步骤**：

1. **导入 EmployeeName**：
```typescript
import { EmployeeName } from '#/composables/hse';
```

2. **表格列 "姓名"**（`column.key === 'name'`）：
```vue
<template v-if="column.key === 'name'">
  <EmployeeName v-if="record.employeeId" :employee-id="record.employeeId" />
  <span v-else>{{ record.name || '-' }}</span>
</template>
```

3. **抽屉详情 "姓名"**：
```vue
<DescriptionsItem label="姓名">
  <EmployeeName v-if="currentRecord.employeeId" :employee-id="currentRecord.employeeId" />
  <span v-else>{{ currentRecord.name || '-' }}</span>
</DescriptionsItem>
```

## 五、执行顺序

**先做 P0（plans → ledger → reminders），再做 P1（execute → new-employee → driver）**。

每个文件改造后：
1. `Read` 确认改动完整
2. `vue-tsc --noEmit --skipLibCheck` 确认无新增 TS 错误
3. 继续下一个文件

全部完成后执行 `pnpm build` 最终验证。

## 六、不改动的部分（明确边界）

1. **不改 API 调用、数据结构、表单逻辑**：仅修改模板中的渲染方式。
2. **不改样式**：`<style>` 块不触碰。
3. **不改列定义**：`columns` 数组中的 `dataIndex` / `key` / `title` 保持不变。
4. **不改 training/index.vue**：主表格和抽屉的"培训师"列因 `TrainingApi.TrainingPlan` 无 `trainerId` 字段，无法改造。
5. **不改 stats/index.vue**：`overdueEmployees` 仅有 `employeeCode` 无 `employeeId`，无法改造。
6. **不改 analysis/index.vue**：无员工姓名显示。
7. **不改 requirements/index.vue**：`positionName` 是岗位名称，非员工姓名。
8. **不改 EmployeeName 组件本身**：该组件已在 `#/composables/hse` 中导出，无需修改。

## 七、验收标准

- [ ] 6 个目标文件全部导入 `EmployeeName`
- [ ] 所有表格的"姓名"/"培训师"列使用 `EmployeeName` + fallback 模式
- [ ] 所有抽屉/详情的"姓名"/"培训师"/"讲师"字段使用 `EmployeeName` + fallback 模式
- [ ] `v-if` 条件正确判断 `record.xxxId` 存在性
- [ ] `v-else` fallback 显示 `record.xxxName || '-'`
- [ ] `pnpm build` 构建通过（exit code 0）
- [ ] 无新增 TypeScript 类型错误
- [ ] 生成修改清单报告 `docs/phase9-employee-name-report.md`

## 八、产出物

1. 改造后的 6 个目标文件
2. 修改清单报告 `docs/phase9-employee-name-report.md`（含改动明细、构建结果、TS 错误对比）