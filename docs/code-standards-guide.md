# HSE 看板前端开发标准范式

> 适用项目：`f:\hse-dashboard\安全看板vben\apps\web-antd`
> 框架：Vben Admin 5.7.0 + Ant Design Vue + Vue 3 + TypeScript
> 适用场景：**新增列表页、修改现有 CRUD 页面、添加员工姓名显示**

---

## 一、当 TRAE 要新增/修改列表页时，直接复制这段话

```
请按照以下标准范式修改/新增 [页面路径]：

1. 列表页必须使用项目公共 composable：
   - import { useSearchForm, useDataTable } from '#/composables/hse';
   - 搜索表单用 useSearchForm，表格分页用 useDataTable
   - 用 reactive() 包裹 useDataTable 返回值（模板免 .value）

2. 搜索表单 key 名必须与 API 参数名一致，用 v-model:value 绑定

3. 分页键名统一用 current（不是 page），直接绑定 table.pagination

4. 如果涉及员工姓名显示，必须使用 EmployeeName 组件：
   - import { EmployeeName } from '#/composables/hse';
   - 模板模式：<EmployeeName v-if="record.xxxId" :employee-id="record.xxxId" />
             <span v-else>{{ record.xxxName || '-' }}</span>

5. 修改后必须运行 pnpm build 验证构建通过

6. 不要修改弹窗逻辑、统计卡片、导出、样式、API 函数签名

参考文件：src/views/violations/index.vue（单列表页标准范例）
         src/views/emergency/index.vue（多 Tab 多 CRUD 范例）
```

---

## 二、核心模式速查

### 2.1 列表页标准模板（单 CRUD）

```typescript
// ===== 导入 =====
import { useSearchForm, useDataTable } from '#/composables/hse';

// ===== 搜索表单 =====
const search = useSearchForm<{
  keyword: string;
  // 下拉类字段用 undefined 初始值
  status?: string;
}>({
  defaults: { keyword: '', status: undefined },
  onSearch: () => table.handleReset(),  // 回到第 1 页重新拉取
});

// ===== 数据表格（reactive 包裹，模板免 .value）=====
const table = reactive(useDataTable<any>({
  fetchFn: async ({ page, pageSize }) => {
    await fetchStats();  // 副作用：同步刷新统计卡片
    const result = await api.getList({ ...search.form, page, pageSize });
    return { list: result.list, total: result.total };
  },
  defaultPageSize: 10,  // 保持原值
  paginationExtra: {
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (t: number) => `共 ${t} 条记录`,
  },
}));
```

```html
<!-- ===== 模板绑定 ===== -->
<!-- 搜索表单 -->
<Form layout="inline">
  <FormItem label="关键词">
    <Input v-model:value="search.form.keyword" @change="table.handleReset" />
  </FormItem>
  <FormItem label="状态">
    <Select v-model:value="search.form.status" @change="table.handleReset" />
  </FormItem>
  <FormItem>
    <Button @click="search.reset">重置</Button>
  </FormItem>
</Form>

<!-- 数据表格 -->
<Table
  :data-source="table.dataList"
  :loading="table.loading"
  :pagination="table.pagination"
  @change="table.handleTableChange"
/>
```

### 2.2 多 Tab 多 CRUD 模板（emergency 模式）

```typescript
// 两套独立实例，各自管理
const planSearch = useSearchForm({...});
const planTable = reactive(useDataTable<any>({...}));

const drillSearch = useSearchForm({...});
const drillTable = reactive(useDataTable<any>({...}));
```

### 2.3 弹窗 CRUD 模板（内联表单弹窗）

```typescript
import { useCrudModal } from '#/composables/hse';

const modal = useCrudModal<FormType>({
  saveFn: (data, isEdit) => isEdit ? api.update(data.id, data) : api.create(data),
  onSuccess: () => table.fetchData(),
  defaults: { name: '', code: '' },
  successMsg: { create: '新增成功', update: '编辑成功' },
});

// 模板中：
// 新增按钮：@click="modal.openCreate"
// 编辑按钮：@click="modal.openEdit(record)"
// 弹窗绑定：v-model:open="modal.visible" :confirm-loading="modal.loading"
// 表单绑定：v-model:value="modal.form.xxx"
// 保存按钮：@click="modal.handleSave"
```

> 注意：仅适用于「单实例内联表单」弹窗。若弹窗有多个分支操作（审批、整改、复查等）或表单委托给独立子组件，不适用此模式。

### 2.4 EmployeeName 显示模板

```html
<!-- 表格列 -->
<template v-if="column.key === 'violatorName'">
  <EmployeeName v-if="record.violatorId" :employee-id="record.violatorId" />
  <span v-else>{{ record.violatorName || '-' }}</span>
</template>

<!-- 抽屉详情 -->
<DescriptionsItem label="违规人">
  <EmployeeName v-if="current.violatorId" :employee-id="current.violatorId" />
  <span v-else>{{ current.violatorName || '-' }}</span>
</DescriptionsItem>
```

**核心规则**：有 `xxxId` → 用组件渲染（可点击跳转档案）→ 无 `xxxId` → fallback 到纯文本。

---

## 三、TypeScript 类型标注规范

### 3.1 表单字段初始化

```typescript
// ✅ 正确：用 undefined 初始化可选字段
const form = reactive({
  name: '',
  status: undefined as string | undefined,
  date: undefined as Dayjs | undefined,
});

// ❌ 错误：用 null 初始化
const form = reactive({
  status: null as string | null,       // 与 Ant Design 组件类型不兼容
  date: null as Dayjs | null,          // 与 DatePicker 类型不兼容
});
```

### 3.2 表格 bodyCell 槽位

```typescript
// ✅ 正确：用 as any 处理 record 类型
<template #bodyCell="{ column, record }">
  <Button @click="handleEdit(record as any)">编辑</Button>
</template>

// 或定义函数签名足够宽松
function handleEdit(record: any) { ... }
```

### 3.3 组件属性断言

```html
<!-- 统计卡片 color 属性 -->
<HseStatCard :color="(stat.color as any)" />

<!-- 表单 rules -->
<Form :rules="(formRules as any)" />

<!-- Button type -->
<Button :type="'link'">查看</Button>
```

### 3.4 修复后验证

```bash
cd f:\hse-dashboard\安全看板vben\apps\web-antd
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vue-tsc --noEmit --skipLibCheck
```

---

## 四、构建与验证

```bash
# 构建前清理旧 dist（避免 safe-delete 垫片拦截）
rm -rf dist

# 生产构建
pnpm build

# 类型检查
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vue-tsc --noEmit --skipLibCheck
```

---

## 五、禁止事项

| 禁止 | 说明 |
|------|------|
| 手写 `loading`/`dataList`/`total`/`pagination`/`fetchData`/`handleTableChange` | 必须用 `useDataTable` 托管 |
| 手写 `searchForm` reactive + `handleSearch`/`handleReset` | 必须用 `useSearchForm` 托管 |
| 分页用 `page` 键名 | 统一用 `current` |
| 员工姓名直接 `{{ record.name }}` | 有 `employeeId` 时用 `EmployeeName` 组件 |
| 硬编码颜色值（`#8c8c8c` 等） | 用 CSS 语义变量 |
| 修改非目标文件 | 每次只改指定的文件 |
| 修改弹窗逻辑/统计卡片/导出/样式 | 这些属于边界外，不动 |
| 直接 `echarts.init` | 用 `useEcharts` 或 `EchartsUI` |
| 用 Element Plus 组件 | 只用 Ant Design Vue |

---

## 六、参考文件索引

| 用途 | 参考文件 |
|------|---------|
| 单列表页标准范例 | `src/views/violations/index.vue` |
| 多 Tab 多 CRUD 范例 | `src/views/emergency/index.vue` |
| 弹窗 CRUD 范例 | `src/views/hse/employee/over-age/index.vue` |
| EmployeeName 用法 | `src/views/violations/index.vue`（第 175 行附近） |
| Composable 源码 | `src/composables/hse/useSearchForm.ts` |
| Composable 源码 | `src/composables/hse/useDataTable.ts` |
| Composable 源码 | `src/composables/hse/useCrudModal.ts` |
| EmployeeName 组件 | `src/composables/hse/useEmployeeLink.ts` |
| 阶段报告 | `docs/phase4-rollout-report.md` |
| 阶段报告 | `docs/phase6-rollout-report.md` |
| 最终总结 | `docs/project-final-summary.md` |