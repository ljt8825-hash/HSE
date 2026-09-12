# Phase 7：Composable 推广（第三批 · 收尾）报告

> 项目路径：`f:\hse-dashboard\安全看板vben\apps\web-antd`
> 框架：Vben Admin 5.7.0 + Ant Design Vue + Vue 3 + TypeScript
> 日期：2026-07-30
> 范围：最后两个列表页 `accidents/index.vue`（P0）、`goals/index.vue`（P1）推广 `useSearchForm` + `useDataTable`

## 一、改动概览

| 文件 | 优先级 | 改造前 | 改造后 | 采用范式 |
|------|--------|--------|--------|----------|
| `src/views/accidents/index.vue` | P0 | 手写 `loading`/`accidentList`/`total`/`searchForm`/`pagination` + `fetchData`/`handleTableChange` | `search`(`useSearchForm`) + `table`(`useDataTable`，`reactive()` 包裹) | 单实例 `reactive()` 包裹（同 Phase 6） |
| `src/views/goals/index.vue` | P1 | 手写 `loading`/`goalList`/`total`/`searchForm`/`pagination` + `fetchData`/`handleTableChange` | `search`(`useSearchForm`) + `table`(`useDataTable`，`reactive()` 包裹) | 单实例 `reactive()` 包裹 |

**Composable 全量覆盖完成**：over-age、violations、hazards、training（Phase 5/4）+ emergency（Phase 6）+ accidents、goals（Phase 7）全部列表页均已由 composable 托管。

## 二、accidents/index.vue 详细清单

### 2.1 删除的手写状态 / 函数
- `const loading = ref(false)`
- `const accidentList = ref<AccidentsApi.AccidentItem[]>([])`
- `const total = ref(0)`
- `const searchForm = reactive({...})`
- `const pagination = reactive({ page: 1, pageSize: 10 })`
- `async function fetchData()`（逻辑并入 `fetchFn`）
- `function handleTableChange(pag)`（由 `table.handleTableChange` 接管）
- `function handleRefresh()`（模板改为 `@refresh="table.fetchData"` 内联）

### 2.2 新增 composable 实例
```typescript
const search = useSearchForm({
  defaults: { keyword:'', level: undefined, type: undefined, status: undefined,
              year: undefined, month: undefined, expiryStatus: undefined },
  onSearch: () => table.handleReset(),
});

const table = reactive(useDataTable<AccidentsApi.AccidentItem>({
  fetchFn: async ({ page, pageSize }) => {
    await fetchStats();                       // 副作用：同步刷新统计卡片
    return getAccidentList({ page, pageSize, ...search.form });
  },
  defaultPageSize: 10,
  paginationExtra: { showSizeChanger: true, showQuickJumper: true,
                     showTotal: (t: number) => $t('hse.accidents.totalRecords', { total: t }) },
}));
```

### 2.3 模板绑定映射
| 原绑定 | 改造后 |
|--------|--------|
| `:data-source="accidentList"` | `table.dataList` |
| `:loading="loading"` | `table.loading` |
| `:pagination="{ current: pagination.page, ... }"` | `table.pagination` |
| `@change="handleTableChange"` | `@change="table.handleTableChange"` |
| `v-model:value="searchForm.*"` | `search.form.*` |
| `ImportButtonGroup @refresh="handleRefresh"` | `@refresh="table.fetchData"` |

### 2.4 收敛的调用点
- `handleSearch()` → `table.handleReset()`
- `handleReset()` → `search.reset()`
- `handleStatCardClick(key)` → 改 `search.form.*` + `table.handleReset()`（统计卡点击联动过滤保持）
- `handleStatusChange` / `handleSave` / `handleDelete` 内 `fetchData()` → `table.fetchData()`
- `onMounted` 内 `fetchData()` → `await table.fetchData()`

### 2.5 严格保留（未改动）
弹窗（`modalVisible`/`modalLoading`/`editingAccident`/`accidentForm`/`formRules`）、详情抽屉（含附件/版本 Tabs）、统计卡片（`statsData`/`statsLoading`/`fetchStats`/`handleStatCardClick` 逻辑）、导出（`handleExport`/`exportLoading`）、列设置（`useTableColumnSettings`/`useComponentVisibility`）、`<style>` 块。

## 三、goals/index.vue 详细清单

### 3.1 删除的手写状态 / 函数
- `const loading = ref(false)`（注意：`statsLoading` 保留，独立）
- `const goalList = ref<GoalsApi.SafetyGoal[]>([])`
- `const total = ref(0)`
- `const searchForm = reactive({...})`
- `const pagination = reactive({ page: 1, pageSize: 10 })`
- `async function fetchData()`、`function handleTableChange(pag)`

### 3.2 新增 composable 实例
```typescript
const search = useSearchForm({
  defaults: { keyword:'', year: undefined, status: undefined, department: undefined },
  onSearch: () => table.handleReset(),
});

const table = reactive(useDataTable<GoalsApi.SafetyGoal>({
  fetchFn: async ({ page, pageSize }) => {
    await fetchStats();
    return getGoalList({ page, pageSize, ...search.form });
  },
  defaultPageSize: 10,
  paginationExtra: { showSizeChanger: true, showQuickJumper: true,
                     showTotal: (t: number) => `共 ${t} 条记录` },
}));
```

### 3.3 模板绑定映射
| 原绑定 | 改造后 |
|--------|--------|
| `:data-source="goalList"` | `table.dataList` |
| `:loading="loading"` | `table.loading` |
| `:pagination="{ current: pagination.page, ... }"` | `table.pagination` |
| `@change="handleTableChange"` | `@change="table.handleTableChange"` |
| `v-model:value="searchForm.*"` | `search.form.*` |
| 序号列 `customRender` `(pagination.page - 1) * pagination.pageSize` | `(table.pagination.current - 1) * table.pagination.pageSize` |
| `ImportButtonGroup @refresh="fetchData"` | `@refresh="table.fetchData"` |

### 3.4 收敛的调用点
- `handleSearch()` → `table.handleReset()`；`handleReset()` → `search.reset()`
- `handleSave` / `handleDelete` 内 `fetchData(); fetchStats();` → `table.fetchData()`（fetchFn 已含 fetchStats，去冗余双调用）
- `onMounted` → `await table.fetchData()`

### 3.5 严格保留（未改动）
弹窗、`detailDrawerVisible`/`currentGoal`、统计卡片、`<style>` 块。

## 四、未修复项（均为 Phase 7 范围外既有 TS 错误）

两文件经本次改造**净新增错误 = 0**。剩余 13 处 TS 错误全部位于提示词明确「不改动」的区域，属历史存量（与 Phase 5/6 同类）：

| 文件 | 行号 | 错误 | 区域 | 是否本次引入 |
|------|------|------|------|--------------|
| accidents | 16 | `:color="stat.color"` string 不兼容 Badge 联合类型 | 统计卡片 | 否 |
| accidents | 192/195/202 | bodyCell `record: Record<string,any>` 不兼容 `AccidentItem` | 表格槽位 | 否 |
| accidents | 222 | `:rules="formRules"` 类型不匹配 | 弹窗表单 | 否 |
| accidents | 278 | DatePicker `v-model` Dayjs\|null 不兼容 string\|Dayjs | 弹窗表单 | 否 |
| accidents | 505 | bodyCell `record` 不兼容 `Attachment` | 附件子表槽位 | 否 |
| goals | 16 | `:color="stat.color"` | 统计卡片 | 否 |
| goals | 132/133/138 | bodyCell `record` 不兼容 `SafetyGoal` | 表格槽位 | 否 |
| goals | 155 | `:rules="formRules"` | 弹窗表单 | 否 |
| goals | 637 | `responsiblePersonId: number\|null` 不兼容 `number\|undefined` | 弹窗保存 | 否 |

> 上述区域按提示词 §3.7 / §4.4 明确不在本次改造范围，建议另立独立 TS 清理 Pass。

## 五、构建结果

- `pnpm build`（vite，production）：**EXIT 0**，`dist/` 与 `dist.zip` 正常产出。
- 执行方式：`rm -rf dist` 后 `CODEBUDDY_SAFE_DELETE_BULK_STATE_DIR= CODEBUDDY_TOOL_CALL_ID= pnpm build`（规避 WorkBuddy 回收站二进制 `win32-x64.exe` 超时 ETIMEDOUT，详见 Phase 6 记录）。

## 六、TypeScript 校验

- 命令：`NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vue-tsc --noEmit --skipLibCheck`
- 两目标文件错误数：改造前 13（既有）→ 改造后 13（既有），**净新增 0**。
- 本次改造过程中一度引入 2 处 `showTotal` 回调参数 `t` 隐式 `any`（TS7006）——因 `paginationExtra` 类型为 `Record<string, unknown>`，回调失去 a-table 的上下文类型推断；已通过显式标注 `(t: number)` 修复。全仓总错误数 487 → 485（即这 2 处修复）。

## 七、约束遵循

- ✅ 仅改动两目标文件，未触碰 `packages/`、`src/api/`、`src/router/`、`src/store/` 等只读区。
- ✅ 弹窗、详情抽屉、统计卡片、导出、列设置、`<style>` 均未改动。
- ✅ `fetchStats()` 副作用收口进 `fetchFn`；统计卡点击联动、导出后刷新、搜索/重置/分页均收敛到 composable。
- ✅ 双文件 `defaultPageSize` 保持原值 10。
- ✅ 分页键名统一为 `current`（goals 序号列 `pagination.page` → `table.pagination.current`）。

## 八、结论

Phase 7 顺利完成，composable 列表页统一化全量覆盖达成。`accidents` 与 `goals` 的 loading / dataList / total / pagination / fetchData / handleTableChange / handleReset 现已完全由 `useSearchForm` + `useDataTable` 托管，构建通过、零新增 TS 错误。后续建议聚焦 emergency 既有 12 处 TS 错误与全仓 TS 错误收敛（独立清理 Pass）。
