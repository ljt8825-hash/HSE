# 页面统一化推广修改清单（第四阶段）

> 配套提示词：`docs/phase4-rollout-prompt.md`
> 执行时间：2026-07-30
> 范围：`apps/web-antd` 下 4 个目标页面 + 验证

## 改动概览

| 项 | 数量 | 说明 |
|----|------|------|
| `useCrudModal` 试点 | 1 个页面 | `employee/over-age/index.vue` — 3 个 composable 全覆盖 |
| `useSearchForm` + `useDataTable` 推广 | 3 个页面 | `violations` / `hazards` / `training` |
| 部分改造 | 0 | 4 个目标页面均按提示词要求完成；复杂多弹窗页（violations/hazards/training）按步骤 2-4「备注」未强套 `useCrudModal`（属预期，非缺陷） |
| 待确认项 | 1 类 | 4 个文件共 80 处 TS 错误，全部为**既有历史错误**（属全仓 576 处范围），非本次引入 |

## 详细清单

| 文件 | 改动类型 | 改动说明 |
|------|---------|---------|
| `src/views/hse/employee/over-age/index.vue` | useCrudModal 试点（P0） | 接入全部 3 个 composable：<br>① `useSearchForm` 替换 `searchForm` reactive；<br>② `useDataTable` 替换 `pagination`/`handleTableChange`/`loading`/`dataList`/`total` 手动管理；<br>③ `useCrudModal` 替换 `formModalVisible`/`editingRecord`/`formLoading`/`formData` 手动管理。<br>保留：演示模式 `saveFn`（`Promise.resolve({code:0})`，name 为空返回 `code:-1`）、统计卡片、详情 Drawer、附件上传/下载/删除、版本履历、导出、导入 `@refresh`。<br>`handleEdit` 内保留 `dept_name→dept` 字段映射。模板变量名映射（`formModalVisible→visible`、`editingRecord→editingRecord`、`formData→form`、`handleCreate→openCreate`、`handleEdit(record)→handleEdit(record)`、`handleSave→crudHandleSave`、`handleReset→resetSearch`、`:data-source`、`pagination.current`、序号列），HTML 结构不变。 |
| `src/views/violations/index.vue` | useSearchForm + useDataTable 推广（P1） | 删除手动 `loading`/`violationList`/`total`/`searchForm`/`pagination` 声明与 `fetchData`/`handleTableChange` 实现，改为 `useDataTable` + `useSearchForm` 解构；<br>`fetchFn` 内合并列表拉取 + `selectedRowKeys.value=[]` + `void fetchStats()` 副作用（原 `fetchData` 多处调用点的副作用统一收口）；<br>`handleSearch→tableHandleReset()`、`handleReset→dateRange 清空 + resetSearch()`、`handleStatCardClick` 内 `pagination.current=1` 后 `fetchData()`（沿用 composable 读取外部 current 的约定，已核验 `useDataTable.fetchData` 读 `pagination.current`）；<br>import 合并 `useSearchForm, useDataTable`；模板 `:data-source="violationList"→dataList`、`current:pagination.page→pagination.current`、序号列 `pagination.page→pagination.current`。 |
| `src/views/hazards/index.vue` | useSearchForm + useDataTable 推广（P1） | 同 violations 模式；`pagination.page→pagination.current` 键名修正（共 6+ 处：声明、fetchFn、`handleSearch`/`handleReset`/状态筛选 handler、`handleTableChange`、`current:pagination.page`、序号列 customRender）；`fetchStats()` 副作用保留在 `fetchFn`；模板 `:data-source="hazardList"→dataList`。文件较大（1614 行），分 2 批（单行进 + 6 处多行结构）增量编辑，编辑后逐次重新 Read 规避 linter 格式化导致的 hash 不一致。 |
| `src/views/training/index.vue` | useSearchForm + useDataTable 推广（P1） + Bug 修复 | 同模式推广；并修复提示词步骤 4 要求的 `message.success` 误报 Bug：`handleSave`/`handleDelete` 的 `catch` 块中 `message.success('保存成功'/'删除成功')` 改为 `message.error`（try 块内成功 toast 保持不变）；模板 `:data-source="trainingList"→dataList`、`current:pagination.page→pagination.current`。新增 `#/composables/hse` import（该文件原无此导入）。 |

## 关键技术决策（可复用）

1. **列表页「fetch + 副作用」收口模式**：violations / hazards / training 原 `fetchData()` 被 `handleSearch` / `handleReset` / `handleStatCardClick` / `handleTableChange` / `onMounted` 等多处调用，且含 `fetchStats()`、清空 `selectedRowKeys` 等副作用。改造后将这些副作用整体移入 `useDataTable` 的 `fetchFn`，解构为顶层 `loading`/`dataList`/`total`/`pagination`/`fetchData`/`handleTableChange`，模板几乎零改动。这是本次推广的「标准范式」。

2. **复杂多弹窗页不套 `useCrudModal`**：violations / hazards / training 存在 `formRef.validate()` + 多个独立 Modal/Drawer（整改、复查、审批等分支弹窗），与 `useCrudModal` 的「单实例内联表单」设计不匹配。按提示词步骤 2-4 备注只推广 `useSearchForm` + `useDataTable`，避免强行套用引入类型/逻辑噪音。

3. **`searchForm` 类型安全**：`useSearchForm` 的泛型默认值显式标注 `string | undefined`（如 `violationType: string | undefined`），`fetchFn` 内 `keyword: searchForm.keyword || undefined` 兜底，确保与 API 参数类型（`string | undefined`）兼容，typecheck 在 fetchFn / 搜索表单区域零新增错误。

## 代码行数变化（改造后文件总行数）

> 说明：本次改造跨会话进行，未单独基线化「改造前」精确行数；下表为改造后文件总行数。逻辑层面的收益来自「移除手写状态机」（loading/dataList/total/pagination/fetchData/handleTableChange 各页约 -30~50 行重复逻辑），替换为 ~8 行 composable 解构；over-age 额外移除 3 套手写弹窗状态管理。

| 文件 | 改造后总行数 | 备注 |
|------|-------------|------|
| `over-age/index.vue` | 693 行 | 3 套手写状态机 → 3 个 composable；模板变量名映射 |
| `violations/index.vue` | 1122 行 | 手写列表逻辑 → useDataTable+useSearchForm（净增约 15 行，因 fetchFn 内收口了副作用，逻辑更聚合） |
| `hazards/index.vue` | 1614 行 | 同上；含 `pagination.page→current` 键修正 |
| `training/index.vue` | 1153 行 | 同上 + message.success→message.error Bug 修复 |

## 构建结果

- [x] **typecheck 无新增错误**：`pnpm typecheck`（vue-tsc --noEmit --skipLibCheck）已复跑。本次改造的 4 个页面共报告 80 处 TS 错误，经逐行核验**全部为既有历史错误**（属全仓 576 处范围），**非本次引入**：
  - `over-age`（5 处）：附件上传 `Record<string,any>→InsuranceAttachment`、未使用导入 `Badge`/`getOverAgeAutoDetail` —— 均不在本次改造代码中。
  - `violations`（23 处）：保存/整改表单 handler 的 `number|null`、表单 rules 对象、`a-date-picker` Dayjs 绑定、`Record<string,any>→ViolationItem`、未使用 `record` 参数、模板 button `type` 字面量 —— 均位于保存/整改弹窗与模板，本次改造未触碰（`fetchFn` 与搜索表单区域零错误）。
  - `hazards`（40 处）：整改/复查表单 handler、`checkerId/fixerId` 字段名、表单 rules、`a-date-picker`、附件、未使用 `record`/`closeFormRef`、模板 button `type` —— 均为既有。
  - `training`（12 处）：模板 button `type`、`Record<string,any>→TrainingPlan`、表单 rules、`a-date-picker`、`expiryStatus` 字段、附件 —— 均为既有。
  - **本次改造引入的新错误：0 处。**

- [x] **构建验证通过**：`pnpm build`（vite build --mode production，`NODE_OPTIONS=--max-old-space-size=8192`）已执行，**`BUILD_EXIT=0`**，产物生成于 `apps/web-antd/dist/`（已 zip 至 `dist.zip`，约 3.79 MB）。输出清单含本次改造页面的分包：`js/violations-BgIoQfgZ.js.gz`（31.69kb / gzip 8.31kb）等，确认 4 个文件的改动已被正常打包。vite build 不执行类型检查，仅做打包；既有类型/组件错误不阻断打包，符合预期。

## 与提示词假设的偏差（落地前已实时核验真实代码）

- **over-age 实际为 693 行**（非提示词「约 200 行 script」的估算；提示词数字指 script 块规模，含模板后总行数更大），但改造目标（3 个 composable 全覆盖）已完整达成。
- **violations 实际路径** `src/views/violations/index.vue`（提示词已标注「实际路径需确认」），与假设一致。
- **training 实际路径** `src/views/training/index.vue`（提示词写 `src/views/hse/training/index.vue`，已核验真实路径为 `src/views/training/index.vue`）。
- **training 的 `message.success` Bug 真实存在**（提示词步骤 4 所述），位于 `handleSave`/`handleDelete` 的 `catch` 块（原第 1071/1086 行附近），已修复为 `message.error`，try 块成功 toast 保留。

## 待确认项（建议后续专项清理，不在本阶段范围）

| 类别 | 说明 |
|------|------|
| 表单 reactive 类型 | `violations`/`hazards`/`training` 的保存/整改表单 `reactive({...})` 推入 API 时 `Record<string,any>` 与强类型参数不兼容（`number|null`、字段名不匹配等）。建议给表单 reactive 显式泛型或 `as X` 断言，可一次性消掉绝大多数历史错误。 |
| 模板 button `type` 字面量 | 多页 `<Button type="link">` 触发 `'string' is not assignable to ... \| undefined`，属 Vben/antd 类型声明与模板字面量的既有冲突。 |
| 未使用变量 | `record` 参数、`closeFormRef`、`Badge` 等 TS6133，可批量清理或加 eslint 豁免。 |

## 预期产出达成情况

1. ✅ `employee/over-age/index.vue` — 完成 `useCrudModal` 试点接入（3 个 composable 全覆盖），`useCrudModal` 从「零试点」变为「已验证」。
2. ✅ 3 个列表页（violations / hazards / training）— 完成 `useSearchForm` + `useDataTable` 推广。
3. ✅ typecheck 无新增错误（0 处新错误；既有错误标注并跳过）。
4. ⏳ `pnpm build` 后台执行中，完成后补充结果。
5. ✅ 修改清单已保存至 `f:\hse-dashboard\docs\phase4-rollout-report.md`。
6. ✅ `pnpm build` 构建通过（`BUILD_EXIT=0`），4 个改造页面均已被打包。

## 后续影响

- `useSearchForm` + `useDataTable` 覆盖范围从 Phase 3 的 2 个页面扩展到本阶段后的 6 个页面（employee / workflow + over-age / violations / hazards / training）。
- `useCrudModal` 已有可复制模板（over-age），可为后续 5-8 个「内联表单弹窗」页面提供参考。
- 搜索 / 分页 / 弹窗 CRUD 逻辑统一，降低后续维护成本。
