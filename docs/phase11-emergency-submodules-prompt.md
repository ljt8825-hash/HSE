# Phase 11：emergency 子模块 Composable 推广提示词

> 项目路径：`f:\hse-dashboard\安全看板vben\apps\web-antd`
> 框架：Vben Admin 5.7.0 + Ant Design Vue + Vue 3 + TypeScript
> 前置：Phase 6（emergency 主页面已推广 composable）、Phase 9（EmployeeName 模式已确立）

---

## 一、任务目标

将 `useSearchForm` + `useDataTable` composable 推广到 emergency 模块剩余的 3 个子页面，消除手写 `loading` / `dataList` / `total` / `pagination` / `fetchData` / `handleTableChange` 状态机。同时对 `teams` 的队长列引入 `EmployeeName` 组件。

## 二、目标页面

| 优先级 | 文件路径 | 行数 | 当前模式 | 改造内容 |
|--------|---------|------|---------|---------|
| P0 | `src/views/emergency/events/index.vue` | ~378 | 全手写 | useSearchForm + useDataTable |
| P0 | `src/views/emergency/materials/index.vue` | ~357 | 全手写 | useSearchForm + useDataTable |
| P0 | `src/views/emergency/teams/index.vue` | ~344 | 全手写 | useSearchForm + useDataTable + EmployeeName |

## 三、通用改造模式（3 个文件共用）

### 3.1 当前架构

三个文件结构高度一致：
- 4 个统计卡片（`Statistic`）
- 搜索表单（`Form` inline + `@change` 触发搜索）
- 数据表格（`Table` + 分页 + 操作列）
- 新增/编辑弹窗（`Modal` + 表单）
- 导出按钮（占位，`message.info('导出功能开发中')`）

### 3.2 改造模板

```typescript
import { useSearchForm, useDataTable } from '#/composables/hse';

// 搜索表单
const search = useSearchForm({
  defaults: { /* 从原 searchForm 提取 */ },
  onSearch: () => table.handleReset(),
});

// 数据表格
const table = reactive(useDataTable<any>({
  fetchFn: async ({ page, pageSize }) => {
    await fetchStats();  // 副作用：同步刷新统计卡片
    return request.get(API_BASE, { params: { ...search.form, page, pageSize } });
  },
  defaultPageSize: 保持原值,
  paginationExtra: { showSizeChanger: true, showQuickJumper: true, showTotal: (t: number) => `共 ${t} 条记录` },
}));
```

### 3.3 模板绑定映射

| 原模板绑定 | 改造后 |
|-----------|--------|
| `:data-source="dataList"` | `table.dataList` |
| `:loading="loading"` | `table.loading` |
| `:pagination="{ current: pagination.page, ... }"` | `table.pagination` |
| `@change="handleTableChange"` | `@change="table.handleTableChange"` |
| `v-model:value="searchForm.xxx"` | `search.form.xxx` |
| `@click="handleReset"` | `@click="search.reset"` |
| 序号列 `(pagination.page - 1) * pagination.pageSize` | `(table.pagination.current - 1) * table.pagination.pageSize` |

### 3.4 调用点收敛

- `handleSearch()` → `table.handleReset()`
- `handleReset()` → `search.reset()`
- `handleSave` / `handleDelete` 内的 `fetchData()` → `table.fetchData()`
- `onMounted` 内的 `fetchData()` / `fetchStats()` → `table.fetchData()`（`fetchFn` 已含 `fetchStats`）

## 四、逐文件差异化要点

### 4.1 events/index.vue

**searchForm 字段**：`keyword`、`level`、`status`

**columns 列**：eventName、level、location、occurredAt、reporter（报告人）、status、handledAt、action

**注意**：报告人字段使用纯文本 `dataIndex: 'reporter'`，当前无 `reporterId` 字段，暂不引入 EmployeeName。

**统计接口**：`request.get('/api/hse/emergency/events/stats')` 或类似路径（需从原 `fetchStats` 确认）

### 4.2 materials/index.vue

**searchForm 字段**：`keyword`、`category`、`status`

**columns 列**：name、category、quantity、unit、location、expiryDate、status、responsiblePerson（责任人）、action

**注意**：责任人字段使用纯文本 `dataIndex: 'responsiblePerson'`，当前无 `responsiblePersonId` 字段，暂不引入 EmployeeName。

### 4.3 teams/index.vue

**searchForm 字段**：`keyword`、`type`、`department`

**columns 列**：name、type、leader_name（队长）、memberCount、department、contact、action

**额外改造：队长列引入 EmployeeName**

数据中 `leader_name` 和 `leaderId` 字段（弹窗中已使用 `EmployeeSelector` 选择队长，`leaderId` 存于表单数据），表格列从纯文本改为 EmployeeName：

```vue
<template v-if="column.key === 'leader_name'">
  <EmployeeName v-if="record.leaderId" :employee-id="record.leaderId" />
  <span v-else>{{ record.leader_name || '-' }}</span>
</template>
```

**导入**：
```typescript
import { useSearchForm, useDataTable, EmployeeName } from '#/composables/hse';
```

## 五、改动边界（不改动部分）

1. **不改弹窗逻辑**：`Modal` 新增/编辑、表单校验、`handleSave`/`handleDelete` 全保留
2. **不改统计卡片**：`fetchStats` 逻辑保留，仅改调用位置（移入 `fetchFn`）
3. **不改导出**：`handleExport` 占位保留
4. **不改样式**：`<style>` 块不触碰
5. **不改 API 调用方式**：`request.get/post` 调用保留，仅调整调用位置
6. **不改 master 路由**：`emergency/index.vue` 主页面不触碰

## 六、执行顺序

**events → materials → teams**（从简单到复杂，teams 额外有 EmployeeName 改造）

每个文件完成后：
1. `Read` 确认改动完整
2. `vue-tsc --noEmit --skipLibCheck` 确认无新增 TS 错误
3. 继续下一个文件

全部完成后：
```bash
cd f:\hse-dashboard\安全看板vben\apps\web-antd
pnpm build
```

## 七、验收标准

- [ ] 3 个文件全部导入 `useSearchForm` + `useDataTable`
- [ ] 所有 `loading` / `dataList` / `total` / `pagination` / `fetchData` / `handleTableChange` 均由 composable 托管
- [ ] teams 队长列使用 `EmployeeName` 组件
- [ ] 搜索、重置、分页功能正常
- [ ] `fetchStats` 副作用在 `fetchFn` 内正确收口
- [ ] `pnpm build` 构建通过（exit code 0）
- [ ] 无新增 TypeScript 类型错误
- [ ] 生成修改清单报告 `docs/phase11-rollout-report.md`

## 八、风险提示

1. **三个文件的 API 调用方式**使用 `request.get/post`（直接从 `#/utils/request` 导入），而非分模块的 API 层函数。`fetchFn` 中需保持此调用方式不变。
2. **teams 的 `leaderId` 字段**需确认 API 返回数据中是否包含（弹窗表单已使用 `leaderId` 存队长，推断 API 返回数据也包含此字段）。
3. **统计 API 路径**（`fetchStats` 中的 `request.get` 路径）需从原代码确认，`fetchFn` 中直接调用 `fetchStats()` 即可。
4. 三个文件均较小（350-380 行），改造成本低，如果遇到类型问题统一用 `as any` 兜底。

## 九、产出物

1. 改造后的 3 个目标文件
2. 修改清单报告 `docs/phase11-rollout-report.md`