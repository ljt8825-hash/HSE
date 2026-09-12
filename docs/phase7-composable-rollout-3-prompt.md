# Phase 7：Composable 推广（第三批 · 收尾）提示词

> 项目路径：`f:\hse-dashboard\安全看板vben\apps\web-antd`
> 框架：Vben Admin 5.7.0 + Ant Design Vue + Vue 3 + TypeScript
> 前置：Phase 6（emergency 已完成），Phase 4（violations/hazards/training 已完成）

---

## 一、任务目标

将 `useSearchForm` + `useDataTable` composable 推广到最后两个列表页，完成 composable 推广的全量覆盖。

## 二、目标页面

| 优先级 | 文件路径 | 行数 | 结构 | 说明 |
|--------|---------|------|------|------|
| P0 | `src/views/accidents/index.vue` | ~1283 | 单列表页 + 详情抽屉（含附件/版本子 Tab） | 统计卡片点击联动过滤、导出、列设置 |
| P1 | `src/views/goals/index.vue` | ~769 | 纯单列表页 | 无附件/版本/导出，最简单的 CRUD 页 |

## 三、accidents/index.vue 改造要点

### 3.1 当前架构

单列表页，含：
- 5 个统计卡片（`HseStatCard`），支持点击联动过滤（`handleStatCardClick`）
- 筛选表单（keyword、year、month、level、type、status、expiryStatus）
- 主数据表格（分页 + 排序）
- 新增/编辑弹窗（Modal）
- 详情抽屉（Drawer）内含 Tabs（附件管理 + 历史版本）
- 导出功能

### 3.2 改造策略

单列表页，直接使用 Phase 4 确立的「解构模式」（与 `violations`/`hazards`/`training` 一致）：

```typescript
import { useSearchForm, useDataTable } from '#/composables/hse';

const search = useSearchForm({
  defaults: {
    keyword: '',
    level: undefined,
    type: undefined,
    status: undefined,
    year: undefined,
    month: undefined,
    expiryStatus: undefined,
  },
  onSearch: () => table.handleReset(),
});

const table = useDataTable<AccidentItem>({
  fetchFn: async ({ page, pageSize }) => {
    await fetchStats();  // 副作用：同步刷新统计卡片
    return getAccidentList({
      ...search.form,
      page,
      pageSize,
    });
  },
  defaultPageSize: 保持原值,
  paginationExtra: { showSizeChanger: true, showQuickJumper: true, showTotal: (t: number) => `共 ${t} 条记录` },
});
```

### 3.3 具体步骤

#### Step 1：导入 composable

```typescript
import { useSearchForm, useDataTable } from '#/composables/hse';
```

#### Step 2：替换手写状态

删除：
- `const loading = ref(false)`
- `const accidentList = ref<AccidentItem[]>([])`
- `const total = ref(0)`
- `const searchForm = reactive({...})`
- `const pagination = reactive({ page: 1, pageSize: N })`
- `async function fetchData()`（逻辑并入 `fetchFn`）
- `function handleTableChange(pag)`

替换为上述 `useSearchForm` + `useDataTable` 实例。

#### Step 3：模板绑定映射

| 原模板绑定 | 改造后 |
|-----------|--------|
| `:data-source="accidentList"` | `table.dataList` |
| `:loading="loading"` | `table.loading` |
| `:pagination="{ current: pagination.page, pageSize: pagination.pageSize, total, ... }"` | `table.pagination` |
| `@change="handleTableChange"` | `@change="table.handleTableChange"` |
| `v-model:value="searchForm.keyword"` | `search.form.keyword` |
| `ImportButtonGroup @refresh="fetchData"` | `@refresh="table.fetchData"` |

#### Step 4：副作用收口

原 `fetchData()` 内可能有：
- `await fetchStats()` — 移入 `fetchFn`
- `selectedRowKeys.value = []` — 移入 `fetchFn`

#### Step 5：统计卡片点击联动

`handleStatCardClick` 内部如果直接修改 `searchForm` 并调用 `fetchData()`，改造后逻辑不变，只需将 `fetchData()` 替换为 `table.fetchData()`：

```typescript
function handleStatCardClick(field: string, value: string) {
  // 设置筛选条件
  search.form.keyword = '';
  search.form[field] = value;
  // 重置到第 1 页并重新拉取
  table.handleReset();
}
```

#### Step 6：其余调用点收敛

- `handleSave` / `handleDelete` 内的 `fetchData()` → `table.fetchData()`
- `onMounted` 内的 `fetchData()` → `table.fetchData()`
- 导出后的 `fetchData()` → `table.fetchData()`

#### Step 7：不改动的部分

1. **不改弹窗**：`modalVisible`、`modalLoading`、`editingAccident`、`accidentForm`、`formRules`、表单校验逻辑全保留。
2. **不改详情抽屉**：`detailDrawerVisible`、`currentAccident`、`detailTab`、附件管理、版本历史全保留。
3. **不改统计卡片**：`statsData`、`statsLoading`、`fetchStats`、`handleStatCardClick` 逻辑保留（仅替换其内部调用的 `fetchData`）。
4. **不改导出**：`handleExport`、`exportLoading` 保留。
5. **不改列设置**：`useTableColumnSettings`、`useComponentVisibility` 保留。
6. **不改样式**：`<style>` 块不触碰。

## 四、goals/index.vue 改造要点

### 4.1 当前架构

纯单列表页，无附件/版本/导出：
- 5 个统计卡片
- 筛选表单（keyword、year、status、department）
- 主数据表格（分页）
- 新增/编辑弹窗
- 详情抽屉（纯展示，无 Tabs）

### 4.2 改造策略

与 accidents 完全相同的解构模式，但更简单：

```typescript
const search = useSearchForm({
  defaults: {
    keyword: '',
    year: undefined,
    status: undefined,
    department: undefined,
  },
  onSearch: () => table.handleReset(),
});

const table = useDataTable<GoalItem>({
  fetchFn: async ({ page, pageSize }) => {
    await fetchStats();
    return getGoalList({ ...search.form, page, pageSize });
  },
  defaultPageSize: 保持原值,
  paginationExtra: { showSizeChanger: true, showQuickJumper: true, showTotal: (t: number) => `共 ${t} 条记录` },
});
```

### 4.3 模板绑定映射

| 原模板绑定 | 改造后 |
|-----------|--------|
| `:data-source="goalList"` | `table.dataList` |
| `:loading="loading"` | `table.loading` |
| `:pagination="{ current: pagination.page, ... }"` | `table.pagination` |
| `@change="handleTableChange"` | `@change="table.handleTableChange"` |
| `v-model:value="searchForm.xxx"` | `search.form.xxx` |

### 4.4 不改动部分

1. **不改弹窗**：`modalVisible`、`goalForm`、表单校验全保留。
2. **不改详情抽屉**：`detailDrawerVisible`、`currentGoal` 全保留。
3. **不改统计卡片**：`statsData`、`fetchStats` 保留。
4. **不改样式**。

## 五、通用执行规范

### 5.1 分步渐进

每个文件改造完成后：
1. `Read` 确认改造内容完整、无遗漏
2. 运行 `pnpm build` 确认构建通过
3. 运行 `vue-tsc --noEmit --skipLibCheck` 确认无新增 TS 错误

### 5.2 分页键名注意

**关键**：Phase 4 确立的 `useDataTable` 分页键名为 `current`（Ant Design Vue 约定），而原代码可能使用 `page`。改造时模板中 `pagination.page` 必须全部替换为 `pagination.current`：

```diff
- :pagination="{ current: pagination.page, pageSize: pagination.pageSize, total, ... }"
+ :pagination="table.pagination"
```

### 5.3 序号列修正

如果模板有 `customRender` 序号列使用 `pagination.page`，需改为 `pagination.current`：

```diff
- {{ (pagination.page - 1) * pagination.pageSize + index + 1 }}
+ {{ (table.pagination.current - 1) * table.pagination.pageSize + index + 1 }}
```

### 5.4 TypeScript 类型标注

- `useDataTable<AccidentItem>` / `useDataTable<GoalItem>` 从 API 层导入或内联定义
- 模板中 `record` 参数如需强类型，使用 `(record as any).fieldName`
- `search.form` 的 `Select` 字段值用 `undefined` 而非 `null`（与 composable 默认值一致）

## 六、先后顺序

**先做 accidents（P0），再做 goals（P1）**。accidents 更复杂（统计卡片联动、导出、附件/版本），是本次的主要挑战；goals 是简单推广，不应有意外。

## 七、验收标准

- [ ] `accidents/index.vue` 的 `loading` / `dataList` / `total` / `pagination` / `fetchData` / `handleTableChange` 均由 composable 托管
- [ ] `goals/index.vue` 同上
- [ ] 统计卡片点击联动过滤功能正常（accidents）
- [ ] 导出后列表刷新正常（accidents）
- [ ] 搜索、重置、分页切换功能正常（两个页面）
- [ ] `pnpm build` 构建通过（exit code 0）
- [ ] 无新增 TypeScript 类型错误
- [ ] 生成修改清单报告 `docs/phase7-rollout-report.md`

## 八、风险提示

1. **accidents 的 `handleStatCardClick`** 可能直接操作 `pagination.page` 并调用 `fetchData()`，改造时需确保 `table.handleReset()` 正确重置到第 1 页。
2. **accidents 的列设置**（`useTableColumnSettings`）可能与 `useDataTable` 的数据流耦合，确认 `columns` 定义不依赖手写 `accidentList`/`total`。
3. **goals 的 `defaultPageSize`** 需从原代码确认（可能是 10 或 20），保持原值不变。
4. 两个文件改造后，全量列表页 composable 覆盖即告完成，后续应聚焦 emergency 既有 TS 错误清理和全仓 TS 错误收敛。

## 九、产出物

1. 改造后的 `src/views/accidents/index.vue`
2. 改造后的 `src/views/goals/index.vue`
3. 修改清单报告 `docs/phase7-rollout-report.md`（含两个文件的改动明细、构建结果、TS 错误对比）