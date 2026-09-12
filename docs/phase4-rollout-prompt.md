# 第四阶段：页面统一化推广 — useCrudModal 试点 + composable 规模化

## 任务目标

Phase 3 已交付 3 个公共 composable（`useSearchForm` / `useDataTable` / `useCrudModal`）并在 `employee` 和 `workflow` 两个页面试点接入前两个。本阶段解决 Phase 3 遗留的两个问题：

1. **`useCrudModal` 零试点** — 前两个试点页面均不匹配（employee 编辑走子组件，workflow 审批走分支逻辑），需找到合适的"内联表单弹窗"页面完成试点验证
2. **推广 `useSearchForm` + `useDataTable`** — 将已验证的模式推广到 3-4 个具备标准列表+搜索+分页结构的页面

## 背景信息

- **项目路径**：`f:\hse-dashboard\安全看板vben\apps\web-antd`
- **框架**：Vben Admin 5.7.0 + Ant Design Vue + Vue 3 + TypeScript
- **已有 composable**：`src/composables/hse/useSearchForm.ts`、`useDataTable.ts`、`useCrudModal.ts`（含完整 JSDoc）
- **Phase 1/2/3 已完成**：CSS 变量统一、gzip 压缩、API 并行化、3 个 composable 交付、2 个页面试点

### Phase 3 遗留问题

| 问题 | 现状 | 本阶段处理 |
|------|------|-----------|
| `useCrudModal` 零试点 | 已交付但未在任何页面验证 | 在 `employee/over-age/index.vue` 试点 |
| 推广范围不足 | 仅 2 个页面接入 composable | 推广到 3-4 个符合条件的列表页 |
| 既有类型警告 | 全仓 576 处历史类型错误 | 仅清理本阶段改造页面引入的新警告 |

---

## 执行步骤

### 步骤 1：useCrudModal 试点 — `employee/over-age/index.vue`（P0，30 分钟）

**为何选这个页面**：它是整个 `views/hse` 目录下唯一同时满足以下四个条件的页面：

| 条件 | 详情 |
|------|------|
| 内联 `<Modal>` + `<Form>` | 第 113-166 行，`<Modal v-model:open="formModalVisible">` 内嵌 8 个字段 |
| `editingRecord` 区分新增/编辑 | 第 376 行 `const editingRecord = ref<any>(null)` |
| 标准 `handleCreate`/`handleEdit`/`handleSave` | 第 504/512/526 行 |
| 搜索表单 + 分页 | 第 44-63 行搜索 + 第 77-86 行分页 |

**文件**：`f:\hse-dashboard\安全看板vben\apps\web-antd\src\views\hse\employee\over-age\index.vue`

**改造目标**：

1. **接入 `useSearchForm`**：替换 `searchForm` reactive 对象
2. **接入 `useDataTable`**：替换 `pagination` + `handleTableChange` + `loading` 手动管理
3. **接入 `useCrudModal`**：替换 `formModalVisible` + `editingRecord` + `formLoading` + `formData` 手动管理

**改造前（约 200 行 script）**：
```typescript
const loading = ref(false);
const formLoading = ref(false);
const formModalVisible = ref(false);
const editingRecord = ref<any>(null);
const dataList = ref<any[]>([]);
const total = ref(0);
const pagination = reactive({ page: 1, pageSize: 20 });
const searchForm = reactive({ keyword: '', gender: '' });
const formData = reactive({ name: '', gender: '', birthDate: '', idCard: '', phone: '', department: '', position: '' });

async function fetchData() { /* loading = true, try/catch, loading = false */ }
function handleTableChange(pg: any) { /* pagination.page = pg.current */ }
function handleReset() { /* searchForm 重置 */ }
function handleCreate() { /* editingRecord = null, formModalVisible = true */ }
function handleEdit(record: any) { /* editingRecord = record, formModalVisible = true */ }
async function handleSave() { /* formLoading = true, try/catch, message.success */ }
```

**改造后（约 150 行 script）**：
```typescript
import { useSearchForm, useDataTable, useCrudModal } from '#/composables/hse';

// 搜索表单
const { form: searchForm } = useSearchForm({
  defaults: { keyword: '', gender: '' },
  onSearch: () => table.handleReset(),
});

// 数据表格
const table = useDataTable({
  fetchFn: ({ page, pageSize }) => overAgeApi.getList({ ...searchForm, page, pageSize }),
  defaultPageSize: 20,
});

// 编辑弹窗
const modal = useCrudModal({
  saveFn: (data, isEdit) => {
    const payload = { ...data };
    if (payload.birthDate) payload.birthDate = dayjs(payload.birthDate).format('YYYY-MM-DD');
    return isEdit
      ? overAgeApi.update(data.id, payload)
      : overAgeApi.create(payload);
  },
  onSuccess: () => table.fetchData(),
  defaults: { name: '', gender: '', birthDate: '', idCard: '', phone: '', department: '', position: '' },
  successMsg: { create: '新增成功', update: '编辑成功' },
});

// onMounted 简化
onMounted(() => table.fetchData());
```

**模板改动**（最小化）：
- `v-model:open="formModalVisible"` → `v-model:open="modal.visible"`
- `:confirm-loading="formLoading"` → `:confirm-loading="modal.loading"`
- `editingRecord ? '编辑' : '新增'` → `modal.editingRecord ? '编辑' : '新增'`
- `formData` → `modal.form`（各处 v-model 绑定）
- `@click="handleCreate"` → `@click="modal.openCreate"`
- `@click="handleEdit(record)"` → `@click="modal.openEdit(record)"`
- `@ok="handleSave"` → `@ok="modal.handleSave"`

**注意**：
- 保留原有业务逻辑（删除、导出、日期格式化等）
- 如果 `saveFn` 内的日期转换逻辑与 composable 设计不完全匹配，使用包装函数
- 模板变量名通过上述映射逐一替换，不改变 HTML 结构

---

### 步骤 2：推广 useSearchForm + useDataTable 到 `violations/index.vue`（P1，20 分钟）

**文件**：`f:\hse-dashboard\安全看板vben\apps\web-antd\src\views\hse\violations\index.vue`（实际路径需确认，可能在 `src/views/violations/index.vue`）

**改造要点**：
- 接入 `useSearchForm` 替换搜索表单状态
- 接入 `useDataTable` 替换表格分页+loading
- 模板中变量名通过别名映射，尽量不改 HTML 结构

**注意**：
- 如果该页面有复杂的筛选逻辑（如嵌套 store 或组合筛选），仅改造基础搜索+分页部分
- 新增/编辑弹窗如果使用子组件，不强行套用 `useCrudModal`

---

### 步骤 3：推广 useSearchForm + useDataTable 到 `hazards/index.vue`（P1，20 分钟）

**文件**：`f:\hse-dashboard\安全看板vben\apps\web-antd\src\views\hazards\index.vue`

**改造要点**：同步骤 2，标准列表页改造。

**注意**：
- 检查该页面是否有 `onMounted` 中的多个 API 调用，如有串行调用，改为 `Promise.all`（参考 Phase 2 步骤 2）

---

### 步骤 4：推广 useSearchForm + useDataTable 到 `training/index.vue`（P1，20 分钟）

**文件**：`f:\hse-dashboard\安全看板vben\apps\web-antd\src\views\hse\training\index.vue`（实际路径需确认）

**改造要点**：同步骤 2，标准列表页改造。

**注意**：
- 检查该页面是否有 Phase 3 报告提到的"错误处理使用 `message.success` 导致失败时显示成功"的 Bug，如有则一并修复

---

### 步骤 5：TypeScript 类型检查（15 分钟）

```bash
cd f:\hse-dashboard\安全看板vben\apps\web-antd
pnpm typecheck
```

**门控标准**：
- [ ] 本次改造的 4 个页面（over-age / violations / hazards / training）无新增类型错误
- [ ] 全仓既有类型错误（如 `Record<string, any>` 行类型推断问题）**不计入本次任务失败条件**

**说明**：Phase 3 报告已确认全仓 576 处历史类型错误（`violations` 的 `number|null`、`Record<string, any>` 行类型、`@core`/`effects` 基础组件等），这些不在本次任务清理范围内。如果 typecheck 报错且确认是本次改造引入的，则修复；否则标注"既有问题"跳过。

---

### 步骤 6：构建验证（15 分钟）

```bash
cd f:\hse-dashboard\安全看板vben\apps\web-antd
pnpm build
```

**检查项**：
- [ ] 构建成功（exit code 0）
- [ ] 无新增构建警告
- [ ] 如有构建失败，且确认是本次改造引入，修复后重试；如为既有问题，记录并跳过

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
- `src/composables/hse/useSearchForm.ts`、`useDataTable.ts`、`useCrudModal.ts`（Phase 3 已交付，无需修改）
- 除 4 个目标页面外的其他业务页面

### 改动规范
- 模板结构尽量保持不变，仅改变量名映射
- 保留原有业务逻辑完整性（增删改查、导入导出、批量操作）
- 如果某页面功能与 composable 设计不完全匹配，保留原实现并标注"部分改造"
- 改动完成后，生成一份修改清单，保存到 `f:\hse-dashboard\docs\phase4-rollout-report.md`

---

## 修改清单模板

```markdown
# 页面统一化推广修改清单（第四阶段）

## 改动概览
- useCrudModal 试点：1 个页面
- useSearchForm + useDataTable 推广：X 个页面
- 部分改造（标注原因）：X 个页面
- 待确认项：X 处

## 详细清单

| 文件 | 改动类型 | 改动说明 |
|------|---------|---------|
| src/views/hse/employee/over-age/index.vue | useCrudModal 试点 | 接入 3 个 composable，代码量 ~200→~150 行 |

## 代码行数变化

| 文件 | 改造前 | 改造后 | 减少 |
|------|--------|--------|------|
| over-age/index.vue | ~200 行 | ~150 行 | ~50 行 |

## 构建结果
- [ ] 构建成功
- [ ] typecheck 无新增错误
- [ ] 无新增构建警告

## 待确认项

| 文件 | 问题描述 |
|------|---------|
| xxx | xxx |
```

---

## 预期产出

1. `employee/over-age/index.vue` — 完成 `useCrudModal` 试点接入（3 个 composable 全覆盖）
2. 3-4 个列表页 — 完成 `useSearchForm` + `useDataTable` 推广
3. 构建成功，typecheck 无新增错误
4. 修改清单文件已保存到 `f:\hse-dashboard\docs\phase4-rollout-report.md`

## 预期效果

- `useCrudModal` 从"零试点"到"已验证"，为后续 5-8 个内联表单弹窗页面提供可复制模板
- `useSearchForm` + `useDataTable` 覆盖范围从 2 个扩展到 5-6 个页面
- 每个改造页面减少 30-50 行重复代码
- 搜索/分页/弹窗 CRUD 逻辑统一，降低后续维护成本