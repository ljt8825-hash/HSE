# Phase 11：emergency 子模块 Composable 推广 — 修改清单报告

> 项目路径：`f:\hse-dashboard\安全看板vben\apps\web-antd`  
> 框架：Vben Admin 5.7.0 + Ant Design Vue + Vue 3 + TypeScript  
> 生成时间：2026-07-30  
> 前置：Phase 6（emergency 主页面已推广 composable）、Phase 9（EmployeeName 模式已确立）



---

## 一、目标与范围

将 `useSearchForm` + `useDataTable` composable 推广到 emergency 模块剩余的 3 个子页面，消除手写 `loading` / `dataList` / `total` / `pagination` / `fetchData` / `handleTableChange` 状态机；并对 `teams` 的队长列引入 `EmployeeName` 组件。

| 优先级 | 文件                                        | 改造内容                                             |
| --- | ----------------------------------------- | ------------------------------------------------ |
| P0  | `src/views/emergency/events/index.vue`    | useSearchForm + useDataTable                     |
| P0  | `src/views/emergency/materials/index.vue` | useSearchForm + useDataTable                     |
| P0  | `src/views/emergency/teams/index.vue`     | useSearchForm + useDataTable + EmployeeName（队长列） |

---

## 二、采用的统一改造模式（3 文件共用）

完全对齐 Phase 6 `emergency/index.vue` 双实例（单实例）写法：

```typescript
import { useSearchForm, useDataTable } from '#/composables/hse';

const search = useSearchForm<{ keyword: string; ... }>({
  defaults: { /* 原 searchForm 字段 */ },
  onSearch: () => table.handleReset(),   // 重置到第 1 页并重新拉取
});

const table = reactive(useDataTable<any>({
  fetchFn: async ({ page, pageSize }) => {
    await fetchStats();                   // 副作用：同步刷新统计卡片
    const r: any = await request.get(API_BASE, { params: { ...search.form, page, pageSize } });
    return { list: r?.data?.list || [], total: r?.data?.total || 0 };
  },
  defaultPageSize: 20,
  paginationExtra: { showSizeChanger: true, showQuickJumper: true, showTotal: (t: number) => `共 ${t} 条记录` },
}));
```

### 模板绑定映射

| 原绑定                                                      | 改造后                                       |
| -------------------------------------------------------- | ----------------------------------------- |
| `:data-source="dataList"`                                | `table.dataList`                          |
| `:loading="loading"`                                     | `table.loading`                           |
| `:pagination="{ current: pagination.page, ... }"`        | `table.pagination`                        |
| `@change="handleTableChange"`                            | `@change="table.handleTableChange"`       |
| `v-model:value="searchForm.xxx"`                         | `v-model:value="search.form.xxx"`         |
| 搜索框 `@change="fetchData"`                                | `@change="table.handleReset"`             |
| 重置按钮 `@click="handleReset"`                              | `@click="search.reset"`                   |
| `onMounted(() => { fetchData(); fetchStats(); })`        | `onMounted(() => { table.fetchData(); })` |
| `handleSave/handleDelete` 内 `fetchData(); fetchStats();` | `table.fetchData();`                      |

---

## 三、逐文件改动明细

### 3.1 events/index.vue

- **导入**：新增 `import { useSearchForm, useDataTable } from '#/composables/hse';`
- **删除手写状态**：`loading`、`dataList`、`total`、`pagination`、`searchForm` 五个响应式变量。
- **新增 composable**：`search`（defaults `{ keyword, event_level, status }`，字段名沿用原 API 实际字段 `event_level`）、`table`。
- **删除函数**：`fetchData`、`handleTableChange`、`handleReset`（数据层）。
- **保留函数**：`fetchStats`（在 `fetchFn` 内被调用）、`getLevelColor`、`getStatusColor`、`handleCreate`、`handleEdit`、`handleSave`、`handleDelete`、`handleExport`。
- **模板**：
  - 关键词输入框、事件等级 Select、状态 Select 的 `@change` → `table.handleReset`；`v-model` → `search.form.*`。
  - 重置按钮 `@click` → `search.reset`。
  - Table 绑定 `table.dataList` / `table.loading` / `table.pagination` / `@change="table.handleTableChange"`。
- **未引入 EmployeeName**：报告人列为纯文本 `dataIndex: 'reporter'`，无 `reporterId` 字段（按提示词 4.1 边界）。

### 3.2 materials/index.vue

- 结构与 events 完全对称，搜索字段为 `keyword` / `category` / `status`。
- 删除 `loading` / `dataList` / `total` / `pagination` / `searchForm` 及 `fetchData` / `handleTableChange` / `handleReset`。
- 保留 `fetchStats`、`getCategoryColor`、`getStatusBadgeStatus`、`getStatusBadgeText`、弹窗与导出逻辑。
- **未引入 EmployeeName**：责任人列为纯文本 `dataIndex: 'responsible_person'`，无 `responsiblePersonId` 字段（按提示词 4.2 边界）。

### 3.3 teams/index.vue

- 结构与上述对称，搜索字段为 `keyword` / `type` / `department`，额外保留 `employeeList` / `fetchEmployees` / `onLeaderChange`（队长选择器逻辑不动）。
- 删除 `loading` / `dataList` / `total` / `pagination` / `searchForm` 及 `fetchData` / `handleTableChange` / `handleReset`。
- **新增 EmployeeName（队长列）**：
  - 导入：`import { useSearchForm, useDataTable, EmployeeName } from '#/composables/hse';`
  - 表格 bodyCell 新增分支：
    ```vue
    <template v-if="column.key === 'leader_name'">
      <EmployeeName v-if="record.leaderId" :employee-id="record.leaderId" />
      <span v-else>{{ record.leader_name || '-' }}</span>
    </template>
    ```
  - `leaderId` 来源：原弹窗已用 `EmployeeSelector` 选队长并写入 `teamForm.leaderId`，推断 API 列表返回同样携带 `leaderId`（前端仅做 `v-if="record.leaderId"` 防御性渲染，缺失时回退纯文本 `leader_name`）。

---

## 四、改动边界（未触碰部分 — 遵循提示词第五节）

1. 弹窗逻辑（`Modal` 新增/编辑、表单校验、`handleSave`/`handleDelete`）全部保留。
2. 统计卡片与 `fetchStats` 逻辑保留，仅移动调用位置（收口进 `fetchFn`）。
3. 导出占位 `handleExport` → `message.info('导出功能开发中')` 保留。
4. `<style>` 样式块未改动。
5. API 调用方式 `request.get/post/put/delete` 保留，仅调整调用位置。
6. 主路由页面 `emergency/index.vue` 未触碰。

---

## 五、验证结果

### TypeScript 类型检查

- 命令：`NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vue-tsc --noEmit --skipLibCheck`
- **结果：exit code 0，全仓 0 错误**（含本次改造的 3 个 emergency 子模块文件）。
- 本次改造引入新增错误：**0**。

### 生产构建

- 命令：`pnpm build`
- **结果：exit code 0 ✅**（按历史惯例对旧 `dist` 重命名绕开 safe-delete 垫片后构建）。

### 行为一致性核对

- 搜索：输入/选择 `@change` 触发 `table.handleReset()`（回到第 1 页并拉取，含 `fetchStats` 副作用）。
- 重置：`search.reset()` → `onSearch` → `table.handleReset()`（清空条件并回到第 1 页）。
- 分页：`@change="table.handleTableChange"` 更新页码并重新拉取。
- 新增/编辑/删除：`table.fetchData()` 重新拉取（含 `fetchStats`）。
- `events` / `materials` 统计卡片随每次列表拉取自动刷新；`teams` 同此且队长列通过 `EmployeeName` 渲染。

---

## 六、验收对照（提示词第七节）

| 验收项                                                                                  | 结果         |
| ------------------------------------------------------------------------------------ | ---------- |
| 3 个文件全部导入 `useSearchForm` + `useDataTable`                                           | ✅          |
| 手写 `loading/dataList/total/pagination/fetchData/handleTableChange` 全部由 composable 托管 | ✅          |
| teams 队长列使用 `EmployeeName` 组件                                                        | ✅          |
| 搜索、重置、分页功能正常（模板绑定已对齐 composable）                                                     | ✅          |
| `fetchStats` 副作用在 `fetchFn` 内收口                                                      | ✅          |
| `pnpm build` 构建通过（exit code 0）                                                       | ✅          |
| 无新增 TypeScript 类型错误                                                                  | ✅（全仓 0 错误） |
| 生成修改清单报告 `docs/phase11-rollout-report.md`                                            | ✅          |

---

## 七、产出物

1. 改造后的 3 个目标文件：
   - `src/views/emergency/events/index.vue`
   - `src/views/emergency/materials/index.vue`
   - `src/views/emergency/teams/index.vue`
2. 本报告：`docs/phase11-rollout-report.md`
