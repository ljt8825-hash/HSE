# Phase 9：训练模块 EmployeeName 显示层统一 — 修改清单报告

> 生成时间：2026-07-30
> 项目路径：`f:\hse-dashboard\安全看板vben\apps\web-antd`
> 框架：Vben Admin 5.7.0 + Ant Design Vue + Vue 3 + TypeScript
> 依据提示词：`docs/phase9-employee-name-prompt.md`

## 一、任务目标

将训练模块 6 个目标文件中的「员工姓名 / 培训师 / 讲师」显示统一为 `<EmployeeName>` 组件，遵循 established 模式：**优先用 `employeeId` 渲染 `EmployeeName`，无 `employeeId` 时 fallback 到纯文本**。

组件来源：`EmployeeName` 由 `src/composables/hse/useEmployeeLink.ts` 导出（prop：`employeeId: number`，必填），经 `src/composables/hse/index.ts` re-export，统一以 `import { EmployeeName } from '#/composables/hse'` 引入。组件渲染可点击姓名（跳转档案页 + Tooltip 卡片）。

## 二、改造文件清单（6 个，全部完成）

| 优先级 | 文件 | 改造位置 | ID 字段 | 改造点 |
|--------|------|---------|--------|--------|
| P0 | `src/views/training/plans/index.vue` | 表格 `trainerName` 列 + 抽屉「培训师」 | `trainerId` | 导入 + 2 处 EmployeeName |
| P0 | `src/views/training/ledger/index.vue` | 表格「姓名」列 + 抽屉「姓名」+ 抽屉「讲师」 | `employeeId` / `trainerId` | 导入 + 3 处 EmployeeName |
| P0 | `src/views/training/reminders/index.vue` | 3 个到期 Tab 表格 + 新员工表格的「姓名」列 | `employeeId`(必填) | 导入 + 4 处 EmployeeName |
| P1 | `src/views/training/execute/index.vue` | 执行结果表格「姓名」列 | `employeeId` | 导入 + 1 处 EmployeeName |
| P1 | `src/views/training/new-employee/index.vue` | 表格「姓名」列 + 抽屉「姓名」 | `employeeId` | 导入 + 2 处 EmployeeName |
| P1 | `src/views/training/driver/index.vue` | 表格「姓名」列 + 抽屉「姓名」 | `employeeId` | 导入 + 2 处 EmployeeName |

### 各文件精确改动

**1. plans/index.vue**
- 导入：`import { EmployeeName } from '#/composables/hse';`（接在 `EmployeeSelector` 导入之后）
- 表格列（bodyCell 新增分支）：
  ```vue
  <template v-else-if="column.key === 'trainerName'">
    <EmployeeName v-if="record.trainerId" :employee-id="record.trainerId" />
    <span v-else>{{ record.trainerName || '-' }}</span>
  </template>
  ```
- 抽屉详情「培训师」（原 `{{ currentPlan.trainerName }}`）：
  ```vue
  <DescriptionsItem label="培训师">
    <EmployeeName v-if="currentPlan.trainerId" :employee-id="currentPlan.trainerId" />
    <span v-else>{{ currentPlan.trainerName || '-' }}</span>
  </DescriptionsItem>
  ```
- 列定义 / `dataIndex` 未改动。

**2. ledger/index.vue**
- 导入：`import { EmployeeName } from '#/composables/hse';`（接在 `EmployeeSelector` 导入之后）
- 表格「姓名」列（`column.key === 'name'`）：EmployeeName + `record.employeeId` 兜底 `record.name`
- 抽屉「姓名」：`currentRecord.employeeId` 兜底 `currentRecord.name`
- 抽屉「讲师」（原 `{{ currentRecord.trainer }}`，保留 `v-if="currentRecord.trainer"` 包裹）：
  ```vue
  <DescriptionsItem v-if="currentRecord.trainer" label="讲师">
    <EmployeeName v-if="currentRecord.trainerId" :employee-id="currentRecord.trainerId" />
    <span v-else>{{ currentRecord.trainer || '-' }}</span>
  </DescriptionsItem>
  ```

**3. reminders/index.vue**
- 导入：`import { EmployeeName } from '#/composables/hse';`（接在 `Page` 导入之后）
- 4 个表格（即将到期 / 已逾期 / 从未培训 / 新员工未完成）的「姓名」列统一：
  ```vue
  <template v-if="column.key === 'name'">
    <EmployeeName :employee-id="record.employeeId" />
    <span v-if="!record.employeeId">{{ record.name || '-' }}</span>
  </template>
  ```
  > 说明：`ExpiryReminderItem.employeeId` / `NewEmployeeIncompleteItem.employeeId` 为必填 `number`，按提示词采用无 `v-if` 的直接渲染 + 防御性 fallback。

**4. execute/index.vue**
- 导入：`import { EmployeeName } from '#/composables/hse';`（接在 `EmployeeSelector` 导入之后）
- 执行结果表格「姓名」列（`column.key === 'name'`，数据源 `ExecutePlanResult.created: LedgerApi.LedgerItem[]`）：EmployeeName + `record.employeeId` 兜底 `record.name`

**5. new-employee/index.vue**
- 导入：`import { EmployeeName } from '#/composables/hse';`（接在 `ImportButtonGroup` 导入之后）
- 表格「姓名」列：EmployeeName + `record.employeeId` 兜底 `record.name`
- 抽屉「姓名」：`currentRecord.employeeId` 兜底 `currentRecord.name`

**6. driver/index.vue**
- 导入：`import { EmployeeName } from '#/composables/hse';`（接在 `ImportButtonGroup` 导入之后）
- 表格「姓名」列：EmployeeName + `record.employeeId` 兜底 `record.name`
- 抽屉「姓名」：`currentRecord.employeeId` 兜底 `currentRecord.name`

## 三、明确未改动（遵循提示词 §六 边界）

- 未改 `training/index.vue`（主表格 `TrainingApi.TrainingPlan` 无 `trainerId`）。
- 未改 `stats/index.vue`（`overdueEmployees` 仅有 `employeeCode`）、`analysis/index.vue`（无姓名显示）、`requirements/index.vue`（`positionName` 为岗位名）。
- **未改任何 API 调用、数据结构、表单逻辑、`<style>`、列定义 `dataIndex/key/title`**。
- **未改 `EmployeeName` 组件本身**。
- 注：`training/index.vue` 此前已在其他字段使用 `EmployeeName`，本次未触碰。

## 四、构建与类型检查验证

### 4.1 生产构建（pnpm build）
- **首次构建失败（exit 1）**：报错位于 `src/views/hse/batch-import/components/BatchImportDrawer.vue:38` —— `SyntaxError: [vue/compiler-sfc] Did not expect a type annotation here`，根因为该行 `defineEmits<{...}()` 缺少泛型闭合 `>`（正确应为 `}>()`）。此文件与本次 Phase 9 任务无关，属于**既有的、会导致整个构建失败的语法笔误**。
- **修复**：将该行 `}();` 改为 `}>();`（单字符级别修正，仅补回缺失的 `>`），重新构建。
- **二次构建通过（exit 0）**，构建产物 `dist/` 已正常生成。

### 4.2 TypeScript 类型检查（vue-tsc --noEmit --skipLibCheck）
- **结论：本次 6 文件改造未引入任何新的 TS 错误。**
- 首次 typecheck（修复 BatchImportDrawer 前）因该文件解析失败，输出被截断，仅报 3 条 `BatchImportDrawer.vue` 错误，训练文件 0 条。
- 修复后完整 typecheck 共 17 条错误，**全部位于本次 6 文件之外**的既有问题上（含 `packages/` 框架层、`store/`、`inspection/`、`insurance/` 等），与 EmployeeName 改造无关。
- 本次 6 个目标文件中：
  - `plans / ledger / reminders / new-employee / driver`：**0 条 TS 错误**。
  - `execute`：**1 条既存错误**（见下），非本次改动引入。

#### 唯一训练文件相关 TS 错误（既存，非本次引入）
```
src/views/training/execute/index.vue(296,3): error TS2322:
  Type 'null' is not assignable to type 'Dayjs | undefined'.
```
- 根因：`executeForm` 声明为 `trainingDate: undefined as Dayjs | undefined`（line 184），而 `handleReset()` 中 `executeForm.trainingDate = null;`（line 296）赋了 `null`。
- 该代码位于 `handleReset` 业务逻辑，**不在本次模板改造范围内**（本次仅新增 `EmployeeName` 导入与结果表格 bodyCell 分支）。属于既存类型瑕疵，建议在后续专项中将其与 `undefined` 对齐（如改为 `trainingDate = undefined` 或声明为 `Dayjs | null`）以消除告警。
- 该错误不影响 `pnpm build`（构建脚本不跑 typecheck），且不因 Phase 9 改动而变化。

## 五、验收对照（提示词 §七）

- [x] 6 个目标文件全部导入 `EmployeeName`
- [x] 所有表格「姓名 / 培训师」列使用 `EmployeeName + fallback`
- [x] 所有抽屉/详情「姓名 / 培训师 / 讲师」使用 `EmployeeName + fallback`
- [x] `v-if` 正确判断 `record.xxxId` 存在性
- [x] `v-else` fallback 显示 `record.xxxName || '-'`
- [x] `pnpm build` 构建通过（exit 0，前提：修复既存的 `BatchImportDrawer.vue` 语法笔误）
- [x] 无新增 TypeScript 类型错误（唯一 execute TS2322 为既存、非本次引入）
- [x] 已生成本修改清单报告 `docs/phase9-employee-name-report.md`

## 六、附：本次实际改动文件列表

1. `apps/web-antd/src/views/training/plans/index.vue`
2. `apps/web-antd/src/views/training/ledger/index.vue`
3. `apps/web-antd/src/views/training/reminders/index.vue`
4. `apps/web-antd/src/views/training/execute/index.vue`
5. `apps/web-antd/src/views/training/new-employee/index.vue`
6. `apps/web-antd/src/views/training/driver/index.vue`
7. `apps/web-antd/src/views/hse/batch-import/components/BatchImportDrawer.vue`（**仅 1 字符语法修复**，使构建可通行，不在 6 目标文件内）
