# 第三阶段：页面统一化 — 抽取公共 Composable，消除重复代码

## 任务目标

消除 HSE-Dashboard 中 12 个类 CRUD 页面的重复实现模式。Phase 1（设计系统对齐）和 Phase 2（性能优化）已完成，本阶段聚焦于代码架构统一：抽取 `useSearchForm`、`useDataTable`、`useCrudModal` 三个公共 composable，并在 2 个试点页面中应用，验证模式可行性。

## 背景信息

- **项目路径**：`f:\hse-dashboard\安全看板vben\apps\web-antd`
- **框架**：Vben Admin 5.7.0 + Ant Design Vue + Vue 3 + TypeScript
- **composable 存放位置**：`src/composables/hse/`（已有 `useEmployeeData.ts`、`useEmployeeSearch.ts` 等）
- **已有通用 composable**：`src/composables/useTableColumnSettings.ts`、`src/composables/useComponentVisibility.ts`（零引用，暂不修复）
- **Phase 1/2 已完成**：CSS 变量统一、gzip 压缩、API 并行化、ECharts 导入统一

### 当前问题

73 个 Vue 文件中，12 个页面实现了列表+搜索+弹窗编辑的类 CRUD 模式，但每个页面独立实现：

| 重复模式 | 现状 | 问题 |
|---------|------|------|
| 搜索表单 | 8 个文件各自实现 `searchForm` + `Form inline` | 无统一重置/防抖/持久化 |
| 分页+表格 | 35 个文件各自管理 `pagination` + `handleTableChange` | 命名不一致（`pagination`/`handleTableChange`/`pageSize`） |
| 编辑弹窗 | 19 个文件各自管理 `visible` + `editingRecord` | 打开/关闭/提交/loading 逻辑重复 |
| loading 状态 | 23 个文件手动赋值 `loading.value = true/false` | 无统一 `useLoading` |
| 错误处理 | 39 个文件直接调用 `message.error()` | 无统一错误处理策略 |

---

## 执行步骤

### 步骤 1：创建 `useSearchForm` Composable（20 分钟）

**目标**：封装搜索表单的初始化、重置、防抖、持久化逻辑。

**文件**：`f:\hse-dashboard\安全看板vben\apps\web-antd\src\composables\hse\useSearchForm.ts`

**接口设计**：

```typescript
import { reactive, watch } from 'vue';
import { useDebounceFn } from '@vueuse/core';

interface UseSearchFormOptions<T extends Record<string, any>> {
  /** 初始值 */
  defaults: T;
  /** 搜索回调 */
  onSearch: () => void;
  /** 防抖延迟（毫秒），默认 300 */
  debounceMs?: number;
  /** 是否启用 localStorage 持久化，默认 false */
  persist?: boolean;
  /** 持久化 key（启用 persist 时必填） */
  storageKey?: string;
}

export function useSearchForm<T extends Record<string, any>>(options: UseSearchFormOptions<T>) {
  const { defaults, onSearch, debounceMs = 300, persist = false, storageKey } = options;

  // 从 localStorage 恢复（如果启用）
  const initial = persist && storageKey
    ? { ...defaults, ...JSON.parse(localStorage.getItem(storageKey) || '{}') }
    : { ...defaults };

  const form = reactive<T>(initial as T);

  // 防抖搜索
  const debouncedSearch = useDebounceFn(onSearch, debounceMs);

  // 重置
  function reset() {
    Object.assign(form, defaults);
    onSearch();
  }

  // 持久化（如果启用）
  if (persist && storageKey) {
    watch(
      () => ({ ...form }),
      (val) => localStorage.setItem(storageKey, JSON.stringify(val)),
      { deep: true },
    );
  }

  return { form, reset, debouncedSearch };
}
```

**注意**：
- 依赖 `@vueuse/core` 的 `useDebounceFn`（项目已安装 `@vueuse/core`）
- TypeScript 泛型确保类型安全
- 可选的 localStorage 持久化（搜索条件跨页面刷新保留）

---

### 步骤 2：创建 `useDataTable` Composable（20 分钟）

**目标**：封装表格分页、loading、数据获取的统一管理。

**文件**：`f:\hse-dashboard\安全看板vben\apps\web-antd\src\composables\hse\useDataTable.ts`

**接口设计**：

```typescript
import { ref, reactive } from 'vue';

interface UseDataTableOptions<T> {
  /** 数据获取函数 */
  fetchFn: (params: { page: number; pageSize: number }) => Promise<{ list: T[]; total: number }>;
  /** 默认每页条数 */
  defaultPageSize?: number;
}

export function useDataTable<T>(options: UseDataTableOptions<T>) {
  const { fetchFn, defaultPageSize = 20 } = options;

  const loading = ref(false);
  const dataList = ref<T[]>([]);
  const total = ref(0);
  const pagination = reactive({ page: 1, pageSize: defaultPageSize });

  async function fetchData() {
    loading.value = true;
    try {
      const result = await fetchFn({ page: pagination.page, pageSize: pagination.pageSize });
      dataList.value = result.list;
      total.value = result.total;
    } finally {
      loading.value = false;
    }
  }

  function handleTableChange(pg: { current: number; pageSize: number }) {
    pagination.page = pg.current;
    pagination.pageSize = pg.pageSize;
    fetchData();
  }

  function handleReset() {
    pagination.page = 1;
    fetchData();
  }

  return {
    loading,
    dataList,
    total,
    pagination,
    fetchData,
    handleTableChange,
    handleReset,
  };
}
```

**注意**：
- `fetchFn` 接收 `{ page, pageSize }` 参数，返回 `{ list, total }`
- 使用方只需提供数据获取函数，其余由 composable 管理
- `handleTableChange` 适配 Ant Design Vue Table 的 `@change` 事件参数格式

---

### 步骤 3：创建 `useCrudModal` Composable（15 分钟）

**目标**：封装 Modal/Drawer 的打开/关闭/提交/loading 状态管理。

**文件**：`f:\hse-dashboard\安全看板vben\apps\web-antd\src\composables\hse\useCrudModal.ts`

**接口设计**：

```typescript
import { ref, reactive } from 'vue';
import { message } from 'ant-design-vue';

interface UseCrudModalOptions<T> {
  /** 创建/更新 API 函数 */
  saveFn: (data: T, isEdit: boolean) => Promise<{ code: number; message?: string }>;
  /** 保存成功后的回调（如刷新列表） */
  onSuccess: () => void;
  /** 表单默认值 */
  defaults: T;
  /** 成功提示文本 */
  successMsg?: { create: string; update: string };
}

export function useCrudModal<T extends Record<string, any>>(options: UseCrudModalOptions<T>) {
  const { saveFn, onSuccess, defaults, successMsg } = options;

  const visible = ref(false);
  const loading = ref(false);
  const editingRecord = ref<T | null>(null);
  const form = reactive<T>({ ...defaults } as T);

  function openCreate() {
    editingRecord.value = null;
    Object.assign(form, defaults);
    visible.value = true;
  }

  function openEdit(record: T) {
    editingRecord.value = record;
    Object.assign(form, record);
    visible.value = true;
  }

  async function handleSave() {
    loading.value = true;
    try {
      const result = await saveFn({ ...form } as T, !!editingRecord.value);
      if (result.code === 0) {
        message.success(
          editingRecord.value
            ? (successMsg?.update || '编辑成功')
            : (successMsg?.create || '新增成功'),
        );
        visible.value = false;
        onSuccess();
      } else {
        message.error(result.message || '操作失败');
      }
    } catch {
      message.error('操作失败，请重试');
    } finally {
      loading.value = false;
    }
  }

  function close() {
    visible.value = false;
  }

  return {
    visible,
    loading,
    editingRecord,
    form,
    openCreate,
    openEdit,
    handleSave,
    close,
  };
}
```

**注意**：
- `saveFn` 接收数据副本和 `isEdit` 标志，返回 `{ code: 0, message?: string }` 格式
- 统一了 `message.success/error` 调用，避免各页面散落
- `onSuccess` 回调由调用方传入（通常是刷新列表）

---

### 步骤 4：更新 `src/composables/hse/index.ts` 统一导出（5 分钟）

**文件**：`f:\hse-dashboard\安全看板vben\apps\web-antd\src\composables\hse\index.ts`

在现有导出基础上追加：

```typescript
export { useSearchForm } from './useSearchForm';
export type { UseSearchFormOptions } from './useSearchForm';
export { useDataTable } from './useDataTable';
export type { UseDataTableOptions } from './useDataTable';
export { useCrudModal } from './useCrudModal';
export type { UseCrudModalOptions } from './useCrudModal';
```

---

### 步骤 5：试点应用 — `employee/index.vue`（P0，30 分钟）

**目标**：将员工管理页面改造为使用三个 composable，验证模式可行性。

**文件**：`f:\hse-dashboard\安全看板vben\apps\web-antd\src\views\hse\employee\index.vue`

**改造要点**：

1. 搜索表单：用 `useSearchForm` 替换 `searchForm` reactive 对象
2. 表格分页：用 `useDataTable` 替换 `pagination` + `handleTableChange` + `loading` 手动管理
3. 编辑弹窗：用 `useCrudModal` 替换 `formModalVisible` + `editingRecord` + `formLoading` 手动管理

**改造前（约 400 行 script）**：
```typescript
// 分散的状态管理
const loading = ref(false);
const formLoading = ref(false);
const dataList = ref<any[]>([]);
const total = ref(0);
const pagination = reactive({ page: 1, pageSize: 20 });
const searchForm = reactive({ keyword: '', department: '', position: '' });
const formModalVisible = ref(false);
const editingRecord = ref<any>(null);
const employeeForm = reactive<any>({});

// 分散的函数
async function fetchData() { /* loading = true, try/catch, loading = false */ }
function handleTableChange(pg: any) { /* pagination.page = pg.current */ }
function handleReset() { /* searchForm 重置 */ }
function handleCreate() { /* editingRecord = null, formModalVisible = true */ }
function handleEdit(record: any) { /* editingRecord = record, formModalVisible = true */ }
async function handleSave() { /* formLoading = true, try/catch, message.success */ }
```

**改造后（约 250 行 script）**：
```typescript
import { useSearchForm, useDataTable, useCrudModal } from '#/composables/hse';

// 搜索表单
const { form: searchForm, reset: resetSearch } = useSearchForm({
  defaults: { keyword: '', department: '', position: '' },
  onSearch: () => table.handleReset(),
  debounceMs: 300,
});

// 数据表格
const table = useDataTable({
  fetchFn: (params) => employeeApi.getList({ ...searchForm, ...params }),
  defaultPageSize: 20,
});

// 编辑弹窗
const modal = useCrudModal({
  saveFn: (data, isEdit) => isEdit
    ? employeeApi.update(data.id, data)
    : employeeApi.create(data),
  onSuccess: () => table.fetchData(),
  defaults: { name: '', employeeCode: '', department: '', position: '' },
  successMsg: { create: '新增员工成功', update: '编辑员工成功' },
});

// onMounted 简化
onMounted(() => table.fetchData());
```

**注意**：
- 保留原有模板结构不变（`<template>` 部分仅改绑定变量名）
- 保留原有业务逻辑（如导入导出、批量操作、删除等）
- 如果某功能与 composable 设计不完全匹配，保留原实现并标注"待下阶段适配"

---

### 步骤 6：试点应用 — `workflow/index.vue`（P1，20 分钟）

**目标**：验证 composable 在第二个页面中的适用性，确认模式可推广。

**文件**：`f:\hse-dashboard\安全看板vben\apps\web-antd\src\views\hse\workflow\index.vue`

**改造要点**：同步骤 5，但 workflow 有审批 Drawer 和 Modal 两种弹窗，仅改造主列表相关逻辑。

---

### 步骤 7：TypeScript 类型检查 + 构建验证（15 分钟）

```bash
cd f:\hse-dashboard\安全看板vben\apps\web-antd
pnpm typecheck
pnpm build
```

**检查项**：
- [ ] composable 文件无类型错误
- [ ] `employee/index.vue` 无类型错误
- [ ] `workflow/index.vue` 无类型错误
- [ ] 构建成功，无新增警告

---

## 约束条件

### 禁止修改的文件/目录
- `packages/` 目录下任何文件
- `src/router/` 目录下任何文件
- `src/api/` 目录下任何文件
- `src/store/` 目录下任何文件
- `src/views/_core/` 目录下任何文件
- `src/adapter/` 目录下任何文件
- `src/bootstrap.ts`
- `src/app.vue`
- `vite.config.ts`
- 除 `employee/index.vue` 和 `workflow/index.vue` 外的其他业务页面

### 改动规范
- composable 文件必须包含完整的 JSDoc 注释
- 改造后的页面必须保持原有功能完整性（增删改查、导入导出、批量操作）
- 模板结构尽量保持不变，仅改 `<script>` 部分的变量绑定
- 如果遇到不确定的改动，跳过该处并在清单中标注"待确认"
- 改动完成后，生成一份修改清单，保存到 `f:\hse-dashboard\docs\phase3-page-unification-report.md`

---

## 修改清单模板

```markdown
# 页面统一化修改清单（第三阶段）

## 改动概览
- 新增 composable：3 个
- 改造试点页面：2 个
- 待确认项：X 处

## 新增文件

| 文件 | 用途 |
|------|------|
| src/composables/hse/useSearchForm.ts | 搜索表单状态管理 |
| src/composables/hse/useDataTable.ts | 表格分页+数据获取 |
| src/composables/hse/useCrudModal.ts | 弹窗增删改查 |

## 改造文件

| 文件 | 改动类型 | 改动说明 |
|------|---------|---------|
| src/composables/hse/index.ts | 导出追加 | 新增 3 个 composable 导出 |
| src/views/hse/employee/index.vue | 重构 | 搜索表单/表格/弹窗改为 composable |
| src/views/hse/workflow/index.vue | 重构 | 搜索表单/表格改为 composable |

## 代码行数变化

| 文件 | 改造前 | 改造后 | 减少 |
|------|--------|--------|------|
| employee/index.vue | ~400 行 | ~250 行 | ~150 行 |
| workflow/index.vue | ~300 行 | ~200 行 | ~100 行 |

## 构建结果
- [ ] 构建成功
- [ ] typecheck 通过
- [ ] 无新增警告

## 待确认项

| 文件 | 问题描述 |
|------|---------|
| xxx | xxx |
```

---

## 预期产出

1. `src/composables/hse/useSearchForm.ts` — 搜索表单 composable（含完整 JSDoc）
2. `src/composables/hse/useDataTable.ts` — 数据表格 composable（含完整 JSDoc）
3. `src/composables/hse/useCrudModal.ts` — 弹窗增删改查 composable（含完整 JSDoc）
4. `src/composables/hse/index.ts` — 更新导出
5. `src/views/hse/employee/index.vue` — 试点改造完成
6. `src/views/hse/workflow/index.vue` — 试点改造完成
7. 构建成功，typecheck 通过
8. 修改清单文件已保存到 `f:\hse-dashboard\docs\phase3-page-unification-report.md`

## 预期效果

- 试点页面代码量减少 30%-40%
- 后续 10 个类 CRUD 页面可复用相同 composable，每个改造预计 10-15 分钟
- 搜索/分页/弹窗逻辑统一，降低维护成本和 Bug 率