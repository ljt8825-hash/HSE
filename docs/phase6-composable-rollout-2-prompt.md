# Phase 6：Composable 推广（第二批）提示词

> 项目路径：`f:\hse-dashboard\安全看板vben\apps\web-antd`
> 框架：Vben Admin 5.7.0 + Ant Design Vue + Vue 3 + TypeScript
> 前置：Phase 3（composable 创建）+ Phase 4（4 页推广）+ Phase 5（TS 清理已完成）

---

## 一、任务目标

将 `useSearchForm` + `useDataTable` composable 推广到剩余高优先级列表页，消除手写 `loading` / `dataList` / `total` / `pagination` / `fetchData` / `handleTableChange` 状态机，统一列表页数据管理范式。

## 二、目标页面（按优先级）

| 优先级 | 文件路径 | 行数 | 改造难度 | 说明 |
|--------|---------|------|---------|------|
| P0 | `src/views/emergency/index.vue` | ~1507 | 高 | 单文件含 2 套完整 CRUD（plans + drills），Tab 切换架构 |
| P1 | `src/views/accidents/index.vue` | 待确认 | 中 | 标准列表页，预计含统计卡片 + 筛选 + 表格 |
| P2 | `src/views/goals/index.vue` | 待确认 | 低 | 单文件无子目录，最简单的列表页 |

> 本次只做 **emergency**（P0），accidents 和 goals 留待 Phase 7。

## 三、emergency/index.vue 改造要点

### 3.1 当前架构分析

emergency/index.vue 是一个 **Tab 容器页**，包含两个子模块：

```
<Tabs v-model:activeKey="activeTab">
  <TabPane key="plans" tab="应急预案">   ← 独立 CRUD 1
  <TabPane key="drills" tab="应急演练">   ← 独立 CRUD 2
</Tabs>
```

每个 Tab 内部有：
- 独立的 `searchForm`（关键词、类型、级别、状态等）
- 独立的 `loading` / `dataList` / `total` / `pagination`
- 独立的 `fetchData()` / `handleSearch()` / `handleReset()` / `handleTableChange()`
- 独立的弹窗（新增/编辑/详情）
- 独立的导出逻辑

### 3.2 改造策略（关键：两套 composable 实例）

由于 plans 和 drills 是**完全独立的数据流**（不同的 API、不同的 searchForm、不同的 pagination），需要创建**两套独立的 composable 实例**：

```typescript
// ===== 应急预案 =====
const planSearch = useSearchForm({
  defaults: { keyword: '', type: '', level: '', status: '' },
  onSearch: () => planTable.handleReset(),
});

const planTable = useDataTable<PlanItem>({
  fetchFn: ({ page, pageSize }) => getPlanList({
    ...planSearch.form,
    page,
    pageSize,
  }),
  defaultPageSize: 20,
  paginationExtra: { showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` },
});

// ===== 应急演练 =====
const drillSearch = useSearchForm({
  defaults: { keyword: '', type: '', startDate: '', endDate: '' },
  onSearch: () => drillTable.handleReset(),
});

const drillTable = useDataTable<DrillItem>({
  fetchFn: ({ page, pageSize }) => getDrillList({
    ...drillSearch.form,
    page,
    pageSize,
  }),
  defaultPageSize: 20,
  paginationExtra: { showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` },
});
```

### 3.3 具体改造步骤

#### Step 1：导入 composable

```typescript
import { useSearchForm, useDataTable } from '#/composables/hse';
```

#### Step 2：替换 plans 模块的手写状态

删除以下手写声明（搜索并替换）：
- `const planLoading = ref(false)` → 使用 `planTable.loading`
- `const planList = ref<PlanItem[]>([])` → 使用 `planTable.dataList`
- `const planTotal = ref(0)` → 使用 `planTable.total`
- `const planPagination = reactive({...})` → 使用 `planTable.pagination`
- `const planSearchForm = reactive({...})` → 使用 `planSearch.form`
- `async function fetchPlanData()` → 使用 `planTable.fetchData`
- `function handlePlanSearch()` → 使用 `planSearch.reset()` 或 `planTable.handleReset()`
- `function handlePlanReset()` → 同上
- `function handlePlanTableChange(pag)` → 使用 `planTable.handleTableChange`

模板中对应的变量名映射：
- `planLoading` → `planTable.loading.value`
- `planList` → `planTable.dataList`
- `planTotal` → `planTable.total`
- `planPagination.current` → `planTable.pagination.current`
- `planPagination.pageSize` → `planTable.pagination.pageSize`
- `planPagination.total` → `planTable.pagination.total`
- `planSearchForm.keyword` → `planSearch.form.keyword`
- `@change="handlePlanTableChange"` → `@change="planTable.handleTableChange"`

#### Step 3：替换 drills 模块的手写状态（同 Step 2 模式）

变量名映射：
- `drillLoading` → `drillTable.loading.value`
- `drillList` → `drillTable.dataList`
- 其他同 plans 模式（将 `plan` 前缀换为 `drill`）

#### Step 4：同步副作用

如果原 `fetchPlanData()` / `fetchDrillData()` 内部有副作用（如 `selectedRowKeys.value = []`、`void fetchStats()`），需将这些副作用移入 `useDataTable` 的 `fetchFn` 回调中：

```typescript
const planTable = useDataTable<PlanItem>({
  fetchFn: async ({ page, pageSize }) => {
    // 副作用：清空选中行
    selectedPlanKeys.value = [];
    // 拉取数据
    const result = await getPlanList({ ...planSearch.form, page, pageSize });
    return result;
  },
});
```

#### Step 5：onMounted 调整

原代码：
```typescript
onMounted(() => {
  fetchPlanData();
  fetchDrillData();
});
```

改造后：
```typescript
onMounted(() => {
  planTable.fetchData();
  drillTable.fetchData();
});
```

#### Step 6：TypeScript 类型标注

- `useDataTable<PlanItem>` 和 `useDataTable<DrillItem>` 需要从 API 层导入或内联定义行类型
- 如果 API 未导出类型，从 `fetchFn` 的返回值推断，或定义为 `Record<string, any>`（后续 Phase 再清理）
- 模板中 `record` 参数如需强类型访问，使用 `(record as any).fieldName`

#### Step 7：构建验证

```bash
cd f:\hse-dashboard\安全看板vben\apps\web-antd
pnpm build
```

## 四、不改动的部分（明确边界）

1. **不改弹窗逻辑**：emergency 的 plans/drills 弹窗（新增/编辑/详情/删除）涉及表单校验、附件上传、字段映射等复杂逻辑，**不套 `useCrudModal`**，保留原实现。
2. **不改统计卡片**：`statItems`、`isStatVisible`、`fetchStats` 等统计逻辑保持不变。
3. **不改导出**：`handleExportPlans`、`handleExportDrills` 保留原实现。
4. **不改 Tab 切换**：`<Tabs>` 架构和 `activeTab` 逻辑不变。
5. **不改 API 调用**：仅调整调用位置（从手写 `fetchData` 移入 `fetchFn`），不修改 API 函数签名。
6. **不改样式**：`<style>` 块完全不触碰。
7. **不改其他模块**：`emergency/plans/`、`emergency/drills/`、`emergency/events/`、`emergency/materials/`、`emergency/teams/` 子目录文件不做任何修改。

## 五、验收标准

- [ ] `emergency/index.vue` 中 plans 和 drills 的 `loading` / `dataList` / `total` / `pagination` / `fetchData` / `handleTableChange` / `handleReset` 均由 composable 托管
- [ ] 两套 composable 实例（`planTable` + `drillTable`，`planSearch` + `drillSearch`）各自独立，互不干扰
- [ ] Tab 切换时数据正确（切换到 drills Tab 时，plans 数据不丢失；反之亦然）
- [ ] 搜索、重置、分页切换功能正常
- [ ] 副作用（如 `selectedRowKeys` 清空）在 `fetchFn` 内正确收口
- [ ] `pnpm build` 构建通过（exit code 0）
- [ ] 无新增 TypeScript 类型错误（`vue-tsc --noEmit --skipLibCheck` 4 个目标文件错误数不增加）
- [ ] 生成修改清单报告 `docs/phase6-rollout-report.md`

## 六、风险提示

1. **emergency/index.vue 文件很大（1507 行）**，改造时需逐段替换，每次替换后 `Read` 确认，避免累积偏移。
2. **两套 composable 的变量命名**必须清晰区分（`planTable` vs `drillTable`），否则模板中容易混淆。
3. **fetchFn 中引用 searchForm**会产生闭包，确保 `useDataTable` 的 `fetchFn` 内直接读取 `planSearch.form` / `drillSearch.form` 的当前值（composable 已保证 `reactive` 响应式）。
4. 如果原代码有 `watch` 监听 searchForm 变化自动触发搜索，改造后需改为在筛选控件 `@change` 事件中显式调用 `planTable.handleReset()`。

## 七、产出物

1. 改造后的 `src/views/emergency/index.vue`
2. 修改清单报告 `docs/phase6-rollout-report.md`（含改动点明细、构建结果、TS 错误对比）