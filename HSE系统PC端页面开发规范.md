# HSE系统PC端页面开发规范

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | HSE系统PC端页面开发规范 |
| 技术栈 | Vue 3.4 + TypeScript + Element Plus 2.7 + Pinia 2.1 |
| UI组件库 | Element Plus |
| 架构模式 | Feature-based（按业务模块划分） |
| 路由规模 | 10个一级菜单 / 57个二级菜单 |
| 版本 | v1.0 |

---

## 一、页面布局规范

### 1.1 整体布局

系统采用**左侧导航 + 顶部栏 + 内容区**的经典后台管理布局，统一使用 `LayoutDefault` 作为根布局组件。

```
┌─────────────────────────────────────────────────────────────┐
│  顶部栏（TopBar）：Logo、系统名称、面包屑、用户信息、消息     │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│ 左侧导航 │              内容区（Content）                    │
│ （Menu） │                                                  │
│          │                                                  │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

**布局要求：**

- 左侧导航宽度固定为 `240px`，支持折叠（折叠后 `64px`）
- 顶部栏高度固定为 `56px`
- 内容区采用弹性布局，自适应剩余空间
- 路由组件统一渲染在 `<router-view>` 中，配合 `<transition>` 实现页面切换动画
- 路由 meta 中配置 `permission` 控制访问权限，配置 `keepAlive` 控制页面缓存

### 1.2 页面容器

所有业务页面的最外层统一使用 `el-card` 组件包装，确保视觉一致性。

**容器规范：**

```vue
<template>
  <el-card class="hse-page-container" shadow="never">
    <!-- 页面内容 -->
  </el-card>
</template>

<style scoped>
.hse-page-container {
  height: 100%;
  border-radius: 8px;
}
</style>
```

**内边距规范：**

| 区域 | 内边距 | 说明 |
|------|--------|------|
| el-card body 默认 | `20px` | Element Plus 默认值，不做修改 |
| 紧凑模式 | `16px` | 适用于信息密度较高的页面 |
| 宽松模式 | `24px` | 适用于详情页、仪表盘等展示型页面 |

### 1.3 页面标题规范

页面标题放置在 `el-card` 的 `header` 具名插槽中，左侧为标题文字，右侧为操作按钮组。

```vue
<template>
  <el-card class="hse-page-container" shadow="never">
    <template #header>
      <div class="hse-page-header">
        <span class="hse-page-title">隐患排查列表</span>
        <div class="hse-page-actions">
          <el-button type="primary" @click="handleCreate">
            <el-icon><Plus /></el-icon>
            <span>新增隐患</span>
          </el-button>
          <el-button @click="handleExport">
            <el-icon><Download /></el-icon>
            <span>导出</span>
          </el-button>
        </div>
      </div>
    </template>
    <!-- 页面内容 -->
  </el-card>
</template>

<style scoped>
.hse-page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hse-page-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.hse-page-actions {
  display: flex;
  gap: 8px;
}
</style>
```

### 1.4 间距规范

统一使用 Element Plus 的间距体系，通过 CSS 变量或类名保持一致性。

**间距尺度：**

| 间距值 | 适用场景 |
|--------|----------|
| `4px` / `--el-spacing-xs` | 图标与文字间距、紧凑列表项间距 |
| `8px` / `--el-spacing-sm` | 按钮组间距、表单项垂直间距 |
| `12px` / `--el-spacing-md` | 卡片内区块间距 |
| `16px` / `--el-spacing-base` | 模块间距、查询区与表格间距 |
| `20px` / `--el-spacing-lg` | 大区块间距、页面默认内边距 |
| `24px` / `--el-spacing-xl` | 页面分区间距 |
| `32px` / `--el-spacing-xxl` | 详情页大分组间距 |

---

## 二、查询区域规范

### 2.1 查询表单结构

查询区域使用 `el-form` 的内联布局（`inline` 模式），放置在独立的 `el-card` 或页面顶部。

```vue
<el-form
  ref="queryFormRef"
  :model="queryParams"
  inline
  class="hse-query-form"
  @submit.prevent
>
  <el-form-item label="隐患名称" prop="hazardName">
    <el-input
      v-model="queryParams.hazardName"
      placeholder="请输入隐患名称"
      clearable
      style="width: 200px"
    />
  </el-form-item>

  <el-form-item label="隐患等级" prop="level">
    <el-select
      v-model="queryParams.level"
      placeholder="请选择"
      clearable
      style="width: 180px"
    >
      <el-option label="一般" value="general" />
      <el-option label="较大" value="major" />
      <el-option label="重大" value="critical" />
    </el-select>
  </el-form-item>

  <el-form-item label="排查日期" prop="dateRange">
    <el-date-picker
      v-model="queryParams.dateRange"
      type="daterange"
      range-separator="至"
      start-placeholder="开始日期"
      end-placeholder="结束日期"
      value-format="YYYY-MM-DD"
      style="width: 280px"
    />
  </el-form-item>

  <el-form-item class="hse-query-actions">
    <el-button type="primary" :icon="Search" @click="handleSearch">
      查询
    </el-button>
    <el-button :icon="RefreshRight" @click="handleReset">
      重置
    </el-button>
  </el-form-item>
</el-form>
```

### 2.2 查询条件布局

**布局规则：**

- 每行展示 **3-4 个** 查询条件，保证视觉平衡
- 查询条件超过 4 个时，第 5 个起默认折叠，点击「更多筛选」展开
- 展开/折叠按钮始终在查询按钮左侧
- 所有输入框、下拉框宽度统一为 `180px` ~ `220px`
- 日期范围选择器宽度为 `280px`

**折叠示例结构：**

```vue
<el-form-item v-if="showMoreFilters" label="责任部门" prop="deptId">
  <el-tree-select v-model="queryParams.deptId" ... />
</el-form-item>

<el-form-item v-if="showMoreFilters" label="整改状态" prop="status">
  <el-select v-model="queryParams.status" ... />
</el-form-item>

<el-form-item>
  <el-button type="primary" @click="handleSearch">查询</el-button>
  <el-button @click="handleReset">重置</el-button>
  <el-button link type="primary" @click="showMoreFilters = !showMoreFilters">
    {{ showMoreFilters ? '收起' : '更多筛选' }}
    <el-icon>
      <ArrowDown v-if="!showMoreFilters" />
      <ArrowUp v-else />
    </el-icon>
  </el-button>
</el-form-item>
```

### 2.3 常用查询组件

| 组件 | 适用场景 | 关键属性 |
|------|----------|----------|
| `el-input` | 文本搜索（名称、编号等） | `clearable`、`placeholder` |
| `el-input-number` | 数字范围输入 | `controls-position="right"` |
| `el-select` | 单选下拉（状态、类型、等级） | `clearable`、`filterable` |
| `el-select` + `multiple` | 多选下拉 | `multiple`、`collapse-tags` |
| `el-date-picker` | 单日期选择 | `type="date"`、`value-format` |
| `el-date-picker` | 日期范围 | `type="daterange"` |
| `el-tree-select` | 树形选择（组织、分类） | `check-strictly`、`render-after-expand` |
| `el-radio-group` | 少量选项的切换（≤4个） | 内联模式 |

### 2.4 查询/重置按钮规范

**位置：** 查询按钮组始终**右对齐**，位于查询表单最后一个 `el-form-item` 中。

**按钮顺序：** 查询 → 重置 → 更多筛选

**样式规范：**

| 按钮 | type | 图标 | 说明 |
|------|------|------|------|
| 查询 | `primary` | `Search` | 主按钮，回车触发 |
| 重置 | `default` | `RefreshRight` | 默认按钮 |
| 更多筛选 | `text` / `link` | 箭头图标 | 文字链接样式 |

**交互逻辑：**

- 点击「查询」：触发列表刷新，页码重置为第 1 页
- 点击「重置」：清空所有查询条件为默认值，自动触发一次查询
- 回车：在输入框中按回车等同于点击查询按钮

### 2.5 查询条件命名规范

**查询参数对象：**

```typescript
interface IQueryParams {
  pageNum: number
  pageSize: number
  hazardName?: string
  level?: string
  deptId?: string
  dateRange?: [string, string]
  status?: string
}

const queryParams = reactive<IQueryParams>({
  pageNum: 1,
  pageSize: 10,
  hazardName: '',
  level: '',
  deptId: '',
  dateRange: [],
  status: '',
})
```

**命名规则：**

- 统一使用 `queryParams` 作为查询参数对象名
- 字段采用 `camelCase` 命名
- 分页字段固定为 `pageNum` 和 `pageSize`
- 日期范围字段命名为 `xxxRange`（如 `dateRange`、`createTimeRange`）
- 与后端接口字段保持一致，通过 TypeScript 接口约束

---

## 三、表格区域规范

### 3.1 表格容器

数据列表使用 `el-table` 组件，启用斑马纹和边框，配合分页器使用。

```vue
<el-table
  v-loading="loading"
  :data="tableData"
  stripe
  border
  class="hse-data-table"
  @selection-change="handleSelectionChange"
>
  <!-- 列定义 -->
</el-table>
```

**容器间距：**

- 查询区与表格之间间距为 `16px`
- 表格与分页器之间间距为 `16px`

### 3.2 列定义规范

**列顺序规范：**

1. **序号列** / 复选框列（最左侧）
2. **业务主键列**（编号、名称等）
3. **状态列**
4. **主要信息列**（按重要性排序）
5. **时间列**（创建时间、更新时间等）
6. **操作列**（最右侧，固定）

**列宽建议：**

| 列类型 | 建议宽度 | 说明 |
|--------|----------|------|
| 序号列 | `60px` | type="index" |
| 复选框列 | `50px` | type="selection" |
| 状态/标签列 | `100px` | el-tag 展示 |
| 编号/编码列 | `140px ~ 180px` | 固定宽度 |
| 名称/标题列 | `200px ~ 280px` | `show-overflow-tooltip` |
| 时间列 | `180px` | 日期时间格式 |
| 操作列 | `180px ~ 240px` | `fixed="right"` |

**示例：**

```vue
<el-table-column type="index" label="序号" width="60" align="center" />

<el-table-column prop="hazardCode" label="隐患编号" width="160" />

<el-table-column prop="hazardName" label="隐患名称" min-width="220" show-overflow-tooltip />

<el-table-column prop="level" label="隐患等级" width="100" align="center">
  <template #default="{ row }">
    <el-tag :type="getLevelTagType(row.level)">
      {{ getLevelLabel(row.level) }}
    </el-tag>
  </template>
</el-table-column>

<el-table-column prop="createTime" label="创建时间" width="180" />

<el-table-column label="操作" width="200" fixed="right" align="center">
  <template #default="{ row }">
    <el-button link type="primary" @click="handleView(row)">查看</el-button>
    <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
    <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
  </template>
</el-table-column>
```

### 3.3 状态列展示

状态列统一使用 `el-tag` 组件，根据状态值映射不同颜色类型。

**颜色映射规范：**

| 状态类型 | Tag type | 颜色 | 适用场景 |
|----------|----------|------|----------|
| 成功/正常/通过 | `success` | 绿色 | 已完成、已通过、正常运行 |
| 警告/待处理 | `warning` | 橙色 | 待审核、整改中、即将到期 |
| 危险/异常/驳回 | `danger` | 红色 | 已逾期、已驳回、重大风险 |
| 信息/进行中 | `info` | 灰色 | 草稿、已取消、已关闭 |
| 主要/新的 | `primary` | 蓝色 | 新建、进行中 |

**封装示例：**

```typescript
const statusTagMap: Record<string, { label: string; type: TagType }> = {
  pending: { label: '待整改', type: 'warning' },
  processing: { label: '整改中', type: 'primary' },
  completed: { label: '已完成', type: 'success' },
  overdue: { label: '已逾期', type: 'danger' },
  closed: { label: '已关闭', type: 'info' },
}
```

### 3.4 操作列规范

**操作按钮类型：**

- **主要操作**（查看、编辑）：使用 `link` 模式，`type="primary"`
- **危险操作**（删除）：使用 `link` 模式，`type="danger"`
- **更多操作**（≥4个操作时）：使用 `el-dropdown` 下拉菜单

**操作数量与展示方式：**

| 操作数量 | 展示方式 |
|----------|----------|
| 1 ~ 3 个 | 全部直接展示为文字按钮 |
| 4 ~ 6 个 | 展示前 2 个主操作 + 「更多」下拉 |
| 6 个以上 | 展示前 2 个主操作 + 「更多」下拉，下拉中分组 |

**示例代码：**

```vue
<el-table-column label="操作" width="200" fixed="right" align="center">
  <template #default="{ row }">
    <el-button link type="primary" @click="handleView(row)">查看</el-button>
    <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
    <el-dropdown @command="(cmd) => handleAction(cmd, row)">
      <el-button link type="primary">
        更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="submit">提交审核</el-dropdown-item>
          <el-dropdown-item command="export">导出详情</el-dropdown-item>
          <el-dropdown-item divided command="delete">删除</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </template>
</el-table-column>
```

### 3.5 分页器

使用 `el-pagination` 组件，位于表格底部，右对齐。

**配置规范：**

```vue
<el-pagination
  v-model:current-page="queryParams.pageNum"
  v-model:page-size="queryParams.pageSize"
  :total="total"
  :page-sizes="[10, 20, 50, 100]"
  layout="total, sizes, prev, pager, next, jumper"
  background
  class="hse-pagination"
  @size-change="handleSizeChange"
  @current-change="handlePageChange"
/>
```

**布局配置：**

- `layout`：`total, sizes, prev, pager, next, jumper`
- `page-sizes`：默认 `[10, 20, 50, 100]`
- 分页器与表格间距：`16px`
- 对齐方式：右对齐

**注意事项：**

- 切换页码时保持当前查询条件
- 切换 pageSize 时重置为第 1 页
- 删除数据后当前页无数据时自动回退上一页

### 3.6 空数据展示

表格无数据时，使用 Element Plus 内置的空状态或自定义 `empty` 插槽。

```vue
<el-table ...>
  <template #empty>
    <el-empty description="暂无数据" :image-size="80">
      <el-button v-if="permissionStore.hasPermission('hazard:create')" type="primary" @click="handleCreate">
        去创建
      </el-button>
    </el-empty>
  </template>
</el-table>
```

---

## 四、操作按钮规范

### 4.1 按钮位置

**三处主要按钮位置：**

| 位置 | 说明 | 示例 |
|------|------|------|
| 卡片 header 右侧 | 全局性操作 | 新增、导入、导出、批量删除 |
| 表格操作列 | 单条数据操作 | 查看、编辑、删除、审核 |
| 详情页操作栏 | 详情/表单页底部 | 保存、取消、提交、返回 |

### 4.2 按钮类型

| 类型 | 视觉 | 适用场景 |
|------|------|----------|
| 主按钮（`primary`） | 蓝色实心 | 主要行动点：新增、保存、提交审核、查询 |
| 默认按钮（`default`） | 白底灰边 | 次要行动：重置、导入、导出、返回 |
| 成功按钮（`success`） | 绿色实心 | 通过、确认完成 |
| 警告按钮（`warning`） | 橙色实心 | 暂停、驳回（谨慎使用） |
| 危险按钮（`danger`） | 红色实心 | 删除、作废、终止 |
| 文字按钮（`text` / `link`） | 纯文字链接 | 表格操作列、次要操作 |

**使用原则：**

- 同一区域内主按钮不超过 **1 个**
- 操作列统一使用 `link` 文字按钮
- 破坏性操作前必须有二次确认弹窗

### 4.3 按钮排序

**卡片 header 操作按钮顺序（从左到右）：**

```
新增 → 导入 → 导出 → 批量操作 → 更多 ▼
```

**排序规则：**

1. 正向操作（新增）在前，负向操作（删除）在后
2. 高频操作在前，低频操作在后
3. 主按钮在前，次要按钮在后
4. 「更多」下拉菜单始终在最右侧

**更多下拉菜单内排序：**

```
常用操作
─────────
设置
─────────
删除 / 作废 / 归档
```

### 4.4 按钮权限控制

使用 `permissionStore.hasPermission(permissionCode)` 进行按钮级别权限控制。

**权限码命名规范：**

```
模块:实体:操作

示例：
hazard:hazard:list       隐患列表查询
hazard:hazard:create     新增隐患
hazard:hazard:edit       编辑隐患
hazard:hazard:delete     删除隐患
hazard:hazard:export     导出隐患
hazard:hazard:audit      审核隐患
```

**使用方式：**

```vue
<script setup lang="ts">
import { usePermissionStore } from '@/stores/permission'

const permissionStore = usePermissionStore()
</script>

<template>
  <el-button
    v-if="permissionStore.hasPermission('hazard:hazard:create')"
    type="primary"
    @click="handleCreate"
  >
    新增隐患
  </el-button>
</template>
```

**推荐封装：**

```vue
<!-- HsePermButton.vue -->
<script setup lang="ts">
import { usePermissionStore } from '@/stores/permission'

const props = defineProps<{
  permission: string
}>()

const permissionStore = usePermissionStore()
</script>

<template>
  <el-button v-if="permissionStore.hasPermission(permission)" v-bind="$attrs">
    <slot />
  </el-button>
</template>
```

### 4.5 禁用状态

**禁用场景：**

| 场景 | 说明 |
|------|------|
| Loading 中 | 提交请求时按钮 loading，防止重复提交 |
| 无权限 | 权限不足时隐藏或禁用按钮（优先隐藏） |
| 数据状态不允许 | 如「已审核」的数据不可编辑 |
| 未满足前置条件 | 如未选中数据时「批量删除」禁用 |

**示例：**

```vue
<el-button
  type="primary"
  :loading="submitting"
  :disabled="!canEdit"
  @click="handleSubmit"
>
  提交
</el-button>
```

---

## 五、弹窗/抽屉规范

### 5.1 适用场景

| 组件 | 适用场景 | 推荐使用 |
|------|----------|----------|
| `el-dialog`（弹窗） | 表单字段少（≤8项）、简单操作确认 | 新增/编辑简单表单、确认弹窗 |
| `el-drawer`（抽屉） | 表单字段多（>8项）、详情信息展示 | 新增/编辑复杂表单、详情页 |
| 独立页面 | 表单极复杂、步骤多（分步表单） | 向导式流程、复杂配置 |

**优先选择：**

- 详情页 → **抽屉**（从右侧滑出，不打断上下文）
- 新增/编辑表单 → **抽屉**或弹窗，根据字段量决定
- 删除确认、简单提示 → **弹窗**（居中对话框）

### 5.2 弹窗尺寸

**Dialog 尺寸规范：**

| 尺寸 | 宽度 | 适用场景 |
|------|------|----------|
| 小型 | `500px` | 简单表单（≤5项）、确认对话框 |
| 中型 | `600px` | 标准表单（5-8项）、详情预览 |
| 大型 | `800px` | 复杂表单（8-15项）、含表格的弹窗 |
| 超大型 | `90%` / `1200px` | 非常复杂的内容展示 |

**Drawer 尺寸规范：**

| 尺寸 | 宽度 | 适用场景 |
|------|------|----------|
| 小型 | `400px` | 简单详情、快捷操作 |
| 中型 | `600px` | 标准表单、详情页 |
| 大型 | `800px` | 复杂表单、带关联信息 |
| 超大型 | `60%` / `960px` | 详情页含多个分组 |

### 5.3 弹窗结构

```
┌─────────────────────────────────────┐
│  标题           [关闭✕]              │  ← header
├─────────────────────────────────────┤
│                                     │
│         内容区（body）               │  ← 主体内容
│                                     │
├─────────────────────────────────────┤
│  [取消]        [确定/保存]           │  ← footer（右对齐）
└─────────────────────────────────────┘
```

**Dialog 示例：**

```vue
<el-dialog
  v-model="visible"
  title="新增隐患"
  width="600px"
  :close-on-click-modal="false"
  @close="handleClose"
>
  <el-form ref="formRef" :model="formData" :rules="rules" label-width="100px">
    <!-- 表单项 -->
  </el-form>

  <template #footer>
    <el-button @click="handleCancel">取消</el-button>
    <el-button type="primary" :loading="submitting" @click="handleSubmit">
      确定
    </el-button>
  </template>
</el-dialog>
```

### 5.4 表单弹窗规范

**表单项布局：**

- 标签宽度统一为 `100px`
- 标签对齐方式：`right`（右对齐）
- 必填项标签前加红色 `*`
- 表单项垂直间距使用默认值

**校验规则：**

```typescript
const rules = reactive<FormRules<IFormData>>({
  hazardName: [
    { required: true, message: '请输入隐患名称', trigger: 'blur' },
    { max: 100, message: '长度不能超过100个字符', trigger: 'blur' },
  ],
  level: [
    { required: true, message: '请选择隐患等级', trigger: 'change' },
  ],
  deadline: [
    { required: true, message: '请选择整改期限', trigger: 'change' },
  ],
})
```

**提交逻辑：**

1. 点击提交按钮 → 触发 `formRef.validate()`
2. 校验通过 → 调用 API（按钮进入 loading 状态）
3. 成功 → `ElMessage.success()` 提示，关闭弹窗，刷新列表
4. 失败 → `ElMessage.error()` 提示错误信息，按钮恢复可点击

### 5.5 关闭确认

当弹窗内有未保存的表单内容时，关闭前需弹出确认提示。

```typescript
const handleClose = () => {
  if (formDirty.value && !submitting.value) {
    ElMessageBox.confirm(
      '当前内容尚未保存，确定要关闭吗？',
      '提示',
      {
        confirmButtonText: '确定关闭',
        cancelButtonText: '继续编辑',
        type: 'warning',
      }
    )
      .then(() => {
        visible.value = false
        emit('close')
      })
      .catch(() => {
        // 用户取消，不关闭
      })
  } else {
    visible.value = false
    emit('close')
  }
}
```

---

## 六、详情页规范

### 6.1 布局模式

详情页推荐使用 **卡片式布局 + 描述列表（el-descriptions）** 的组合。

**布局结构：**

```
┌─────────────────────────────────────────┐
│  详情标题        [操作按钮组]            │  ← header
├─────────────────────────────────────────┤
│  状态标签（可选，右上角）                │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  基本信息（el-descriptions）     │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  详细信息（el-descriptions）     │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  操作记录 / 审核流程（时间线）    │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**el-descriptions 示例：**

```vue
<el-descriptions title="基本信息" :column="2" border>
  <el-descriptions-item label="隐患编号">{{ detail.hazardCode }}</el-descriptions-item>
  <el-descriptions-item label="隐患等级">
    <el-tag :type="getLevelTagType(detail.level)">{{ getLevelLabel(detail.level) }}</el-tag>
  </el-descriptions-item>
  <el-descriptions-item label="隐患地点">{{ detail.location }}</el-descriptions-item>
  <el-descriptions-item label="责任部门">{{ detail.deptName }}</el-descriptions-item>
  <el-descriptions-item label="整改期限">{{ detail.deadline }}</el-descriptions-item>
  <el-descriptions-item label="创建时间">{{ detail.createTime }}</el-descriptions-item>
  <el-descriptions-item label="隐患描述" :span="2">{{ detail.description }}</el-descriptions-item>
</el-descriptions>
```

### 6.2 信息分组

**分组方式：**

| 方式 | 组件 | 适用场景 |
|------|------|----------|
| 分隔线分组 | `el-divider` | 简单分组，内容较少 |
| 卡片分组 | 多个 `el-card` | 中等复杂度 |
| 标签页分组 | `el-tabs` | 信息量大、分组多（≥3组） |
| 折叠面板 | `el-collapse` | 次要信息，按需展开 |

**分组命名规范：**

- 基本信息 / 基础信息
- 详细信息 / 详情描述
- 关联信息 / 关联数据
- 操作记录 / 变更日志
- 审核流程 / 审批记录

### 6.3 状态展示

详情页顶部展示当前状态标签，位于标题右侧。

```vue
<div class="hse-detail-header">
  <div class="hse-detail-title">
    <span class="title-text">{{ detail.hazardName }}</span>
    <el-tag :type="statusTag.type" size="large" class="status-tag">
      {{ statusTag.label }}
    </el-tag>
  </div>
  <div class="hse-detail-actions">
    <!-- 操作按钮 -->
  </div>
</div>
```

### 6.4 操作栏

详情页操作栏位于页面底部或卡片 header 右侧。

**操作按钮顺序：**

```
返回 → 编辑 → 提交审核 → 更多 ▼
                              ↳ 导出
                              ↳ 打印
                              ─────────
                              ↳ 删除 / 作废
```

**底部操作栏（固定）：**

对于长详情页，操作栏建议固定在页面底部：

```vue
<div class="hse-detail-footer">
  <el-button @click="handleBack">返回</el-button>
  <el-button type="primary" @click="handleEdit">编辑</el-button>
</div>

<style scoped>
.hse-detail-footer {
  position: sticky;
  bottom: 0;
  z-index: 10;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  background: #fff;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
```

---

## 七、页面类型规范

### 7.1 列表页

列表页是最常见的页面类型，由**查询区 + 操作栏 + 表格 + 分页**组成。

**标准结构：**

```vue
<template>
  <el-card class="hse-page-container" shadow="never">
    <template #header>
      <div class="hse-page-header">
        <span class="hse-page-title">隐患排查列表</span>
        <div class="hse-page-actions">
          <el-button
            v-if="permissionStore.hasPermission('hazard:create')"
            type="primary"
            :icon="Plus"
            @click="handleCreate"
          >
            新增隐患
          </el-button>
          <el-button
            v-if="permissionStore.hasPermission('hazard:import')"
            :icon="Upload"
            @click="handleImport"
          >
            导入
          </el-button>
          <el-button
            v-if="permissionStore.hasPermission('hazard:export')"
            :icon="Download"
            @click="handleExport"
          >
            导出
          </el-button>
        </div>
      </div>
    </template>

    <!-- 查询区 -->
    <el-form :model="queryParams" inline class="hse-query-form">
      <!-- 查询条件 -->
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="fetchList">查询</el-button>
        <el-button :icon="RefreshRight" @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>

    <!-- 表格区 -->
    <el-table v-loading="loading" :data="tableData" stripe border class="hse-data-table">
      <!-- 列定义 -->
    </el-table>

    <!-- 分页 -->
    <el-pagination
      v-model:current-page="queryParams.pageNum"
      v-model:page-size="queryParams.pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      background
      class="hse-pagination"
      @size-change="handleSizeChange"
      @current-change="fetchList"
    />
  </el-card>

  <!-- 新增/编辑抽屉 -->
  <HazardFormDrawer v-model="formVisible" :id="currentId" @success="fetchList" />
</template>
```

### 7.2 新增页

新增操作使用**弹窗或抽屉**形式，不使用独立页面。

**流程规范：**

1. 点击「新增」按钮 → 打开表单弹窗/抽屉
2. 表单初始化（默认值、字典数据加载）
3. 用户填写并提交
4. 校验 → 调用 API → 成功提示 → 关闭弹窗 → 刷新列表

### 7.3 编辑页

编辑操作同样使用弹窗或抽屉，与新增共用表单组件。

**流程规范：**

1. 点击「编辑」按钮 → 获取数据详情 → 打开表单，预填充数据
2. 用户修改并提交
3. 校验 → 调用更新 API → 成功提示 → 关闭弹窗 → 刷新列表

**编辑权限判断：**

```typescript
const canEdit = (row: IHazardItem) => {
  return (
    permissionStore.hasPermission('hazard:edit') &&
    row.status === 'draft' // 仅草稿状态可编辑
  )
}
```

### 7.4 审核页

审核操作使用独立的审核弹窗，包含审核意见输入和审核操作按钮。

```vue
<el-dialog title="审核" width="500px" v-model="visible">
  <el-form :model="auditForm" label-width="80px">
    <el-form-item label="审核结果">
      <el-radio-group v-model="auditForm.result">
        <el-radio value="pass">通过</el-radio>
        <el-radio value="reject">驳回</el-radio>
      </el-radio-group>
    </el-form-item>
    <el-form-item label="审核意见" prop="comment">
      <el-input
        v-model="auditForm.comment"
        type="textarea"
        :rows="4"
        placeholder="请输入审核意见"
        :maxlength="500"
        show-word-limit
      />
    </el-form-item>
  </el-form>

  <template #footer>
    <el-button @click="visible = false">取消</el-button>
    <el-button type="danger" :loading="submitting" @click="handleAudit('reject')">
      驳回
    </el-button>
    <el-button type="success" :loading="submitting" @click="handleAudit('pass')">
      通过
    </el-button>
  </template>
</el-dialog>
```

### 7.5 详情页

详情页用于展示完整信息，可通过**抽屉**或**独立页面**展示。

**详情页必备模块：**

1. 基本信息区
2. 状态展示
3. 详细描述
4. 操作记录 / 审核流程时间线
5. 操作按钮栏（根据状态动态显示）

**操作记录时间线示例：**

```vue
<el-timeline>
  <el-timeline-item
    v-for="record in auditLogs"
    :key="record.id"
    :timestamp="record.createTime"
    :type="getTimelineType(record.action)"
  >
    <div class="audit-record">
      <span class="action-text">{{ record.actionLabel }}</span>
      <span class="operator">操作人：{{ record.operatorName }}</span>
      <p v-if="record.comment" class="comment">{{ record.comment }}</p>
    </div>
  </el-timeline-item>
</el-timeline>
```

---

## 八、命名规范

### 8.1 文件命名

**组件文件（.vue）：**

使用 **PascalCase**（大驼峰）命名，前缀为模块名或业务域。

```
HazardListView.vue          隐患列表页
HazardFormDrawer.vue        隐患表单抽屉
HazardDetailDrawer.vue      隐患详情抽屉
RiskLevelTag.vue            风险等级标签组件
AuditTimeline.vue           审核时间线组件
```

**命名结构：**

```
[模块名/业务域] + [功能描述] + [组件类型]

组件类型后缀：
List / View       列表页/视图
Form              表单组件
Detail            详情组件
Drawer            抽屉组件
Dialog / Modal    弹窗组件
Button            按钮组件
Card              卡片组件
Tag / Badge       标签/徽章组件
```

**其他文件：**

| 文件类型 | 命名规范 | 示例 |
|----------|----------|------|
| TypeScript 工具 | camelCase | `dateUtils.ts`、`format.ts` |
| 类型定义文件 | camelCase + `.d.ts` 或 `.ts` | `hazard.types.ts` |
| 样式文件 | kebab-case | `hazard-list.scss` |
| Hook / Composable | use + camelCase | `useHazardList.ts` |
| 测试文件 | 原名 + `.test.ts` | `useHazardList.test.ts` |

### 8.2 变量命名

**基本原则：** 统一使用 **camelCase**（小驼峰）。

**响应式数据：**

```typescript
const tableData = ref<IHazardItem[]>([])
const loading = ref(false)
const total = ref(0)
const queryParams = reactive<IQueryParams>({ ... })
const formData = reactive<IFormData>({ ... })
```

**布尔值命名：** 以 `is` / `has` / `can` / `should` 开头

```typescript
const visible = ref(false)       // 弹窗可见性（通用简写）
const isLoading = ref(false)
const hasPermission = ref(false)
const canEdit = ref(false)
const shouldConfirm = ref(false)
```

**函数返回值：**

```typescript
const list = ref([])             // 列表数据
const detail = ref(null)         // 详情数据
const currentRow = ref(null)     // 当前选中行
```

### 8.3 类型命名

**接口（interface）：** `I` 前缀 + PascalCase

```typescript
interface IHazardItem {
  id: string
  hazardName: string
  level: string
  status: string
  createTime: string
}

interface IQueryParams {
  pageNum: number
  pageSize: number
  keyword?: string
}
```

**类型别名（type）：** `T` 前缀 + PascalCase

```typescript
type THazardLevel = 'general' | 'major' | 'critical'
type THazardStatus = 'draft' | 'pending' | 'processing' | 'completed'
type TTableData = IHazardItem[]
```

**枚举（enum）：** PascalCase，成员全大写

```typescript
enum HazardLevel {
  GENERAL = 'general',
  MAJOR = 'major',
  CRITICAL = 'critical',
}
```

**Props 类型：** 组件 Props 接口命名为 `I[ComponentName]Props`

```typescript
interface IHazardFormDrawerProps {
  modelValue: boolean
  id?: string
}
```

### 8.4 函数命名

**基本原则：** 动词开头，camelCase，语义清晰。

**事件处理函数：** `handle` + 名词 + 动词

```typescript
const handleSearch = () => { ... }       // 处理查询
const handleCreate = () => { ... }       // 处理新增
const handleEdit = (row: IHazardItem) => { ... }  // 处理编辑
const handleDelete = (row: IHazardItem) => { ... } // 处理删除
const handleSubmit = () => { ... }       // 处理提交
const handleReset = () => { ... }        // 处理重置
const handleClose = () => { ... }        // 处理关闭
const handleSizeChange = (size: number) => { ... }
const handleSelectionChange = (rows: IHazardItem[]) => { ... }
```

**数据获取函数：** `fetch` / `get` + 名词

```typescript
const fetchList = async () => { ... }    // 获取列表
const fetchDetail = async (id: string) => { ... } // 获取详情
const getLevelLabel = (level: string) => { ... }  // 获取等级标签
```

**工具函数：** 动词开头，描述功能

```typescript
const formatDate = (date: string) => { ... }
const downloadFile = (url: string) => { ... }
```

### 8.5 CSS 类名

使用 **BEM** 命名规范，块名以 `hse-` 前缀开头，避免与 Element Plus 样式冲突。

**BEM 结构：**

```
hse-[block]__[element]--[modifier]
```

**示例：**

```css
/* Block：页面容器 */
.hse-page-container { ... }

/* Block + Element：页面标题 */
.hse-page-header__title { ... }

/* Block + Element + Modifier：活跃状态的菜单项 */
.hse-menu__item--active { ... }

/* 表格区域 */
.hse-data-table { ... }
.hse-data-table__header { ... }
.hse-data-table__row--warning { ... }

/* 查询表单 */
.hse-query-form { ... }
.hse-query-form__actions { ... }

/* 详情页 */
.hse-detail { ... }
.hse-detail__header { ... }
.hse-detail__section { ... }
.hse-detail__section--bordered { ... }
```

**常用 Block 命名：**

| Block 名 | 含义 |
|----------|------|
| `hse-page-container` | 页面外层容器 |
| `hse-page-header` | 页面头部（标题+操作栏） |
| `hse-query-form` | 查询表单 |
| `hse-data-table` | 数据表格 |
| `hse-pagination` | 分页器 |
| `hse-detail` | 详情页 |
| `hse-detail-header` | 详情页头部 |
| `hse-card` | 自定义卡片 |
| `hse-tag` | 自定义标签 |

---

## 九、代码结构规范

### 9.1 组件结构

Vue 单文件组件（SFC）统一使用以下顺序：

```vue
<template>
  <!-- 模板内容 -->
</template>

<script setup lang="ts">
// 逻辑代码
</script>

<style scoped lang="scss">
/* 样式代码 */
</style>
```

**注意事项：**

- 必须使用 `<script setup>` 语法
- 必须指定 `lang="ts"`
- 样式必须使用 `scoped` 防止污染（全局样式除外）
- 推荐使用 SCSS（`lang="scss"`）

### 9.2 script setup 结构顺序

`<script setup>` 内的代码按以下顺序组织，便于阅读和维护：

```typescript
// ==========================================
// 1. 导入（Imports）
// ==========================================
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Search, Edit, Delete, View } from '@element-plus/icons-vue'

import { usePermissionStore } from '@/stores/permission'
import {
  getHazardList,
  getHazardDetail,
  createHazard,
  updateHazard,
  deleteHazard,
} from '@/api/modules/hazard'
import type { IHazardItem, IQueryParams } from '@/api/modules/hazard'

// ==========================================
// 2. 类型定义（Types）
// ==========================================
interface IFormData {
  id?: string
  hazardName: string
  level: string
  description: string
}

type TSortOrder = 'asc' | 'desc'

// ==========================================
// 3. Props & Emits
// ==========================================
const props = defineProps<{
  visible: boolean
  id?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'success'): void
}>()

// ==========================================
// 4. Store & Hooks
// ==========================================
const permissionStore = usePermissionStore()
const route = useRoute()
const router = useRouter()

// ==========================================
// 5. 响应式数据（Reactive Data）
// ==========================================
const loading = ref(false)
const submitting = ref(false)
const tableData = ref<IHazardItem[]>([])
const total = ref(0)

const queryParams = reactive<IQueryParams>({
  pageNum: 1,
  pageSize: 10,
  keyword: '',
  level: '',
})

const formRef = ref<FormInstance>()
const formData = reactive<IFormData>({
  hazardName: '',
  level: '',
  description: '',
})

// ==========================================
// 6. 计算属性（Computed）
// ==========================================
const isEdit = computed(() => !!props.id)
const dialogTitle = computed(() => isEdit.value ? '编辑隐患' : '新增隐患')
const canSubmit = computed(() => formData.hazardName && formData.level)

// ==========================================
// 7. 方法（Methods）
// ==========================================
const fetchList = async () => {
  loading.value = true
  try {
    const res = await getHazardList(queryParams)
    tableData.value = res.data.list
    total.value = res.data.total
  } catch (error) {
    console.error('获取列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  queryParams.pageNum = 1
  fetchList()
}

const handleReset = () => {
  Object.assign(queryParams, {
    pageNum: 1,
    pageSize: 10,
    keyword: '',
    level: '',
  })
  fetchList()
}

// ==========================================
// 8. 生命周期（Lifecycle）
// ==========================================
onMounted(() => {
  fetchList()
})

// ==========================================
// 9. Watch（如有需要）
// ==========================================
// watch(() => props.visible, (val) => { ... })
```

### 9.3 API 调用模式

**API 层架构：**

```
src/
  api/
    client.ts          # Axios 实例封装
    index.ts           # 统一导出
    keys.ts            # API 缓存 key 定义（vue-query）
    modules/
      auth.ts          # 认证模块
      user.ts          # 用户模块
      hazard.ts        # 隐患模块
      risk.ts          # 风险模块
      system.ts        # 系统模块
      ...
```

**API 模块示例（hazard.ts）：**

```typescript
import request from '../client'

// ==================== 类型定义 ====================

export interface IHazardItem {
  id: string
  hazardCode: string
  hazardName: string
  level: string
  status: string
  location: string
  deptId: string
  deptName: string
  description: string
  deadline: string
  createTime: string
  updateTime: string
}

export interface IHazardListParams {
  pageNum: number
  pageSize: number
  keyword?: string
  level?: string
  status?: string
  deptId?: string
  dateRange?: [string, string]
}

export interface IHazardListResponse {
  list: IHazardItem[]
  total: number
}

export interface IHazardCreateData {
  hazardName: string
  level: string
  location: string
  deptId: string
  description: string
  deadline: string
}

// ==================== API 方法 ====================

/** 获取隐患列表 */
export const getHazardList = (params: IHazardListParams) => {
  return request.get<IHazardListResponse>('/hazard/list', { params })
}

/** 获取隐患详情 */
export const getHazardDetail = (id: string) => {
  return request.get<IHazardItem>(`/hazard/${id}`)
}

/** 新增隐患 */
export const createHazard = (data: IHazardCreateData) => {
  return request.post<{ id: string }>('/hazard', data)
}

/** 更新隐患 */
export const updateHazard = (id: string, data: Partial<IHazardCreateData>) => {
  return request.put(`/hazard/${id}`, data)
}

/** 删除隐患 */
export const deleteHazard = (id: string) => {
  return request.delete(`/hazard/${id}`)
}
```

**组件内调用：**

```typescript
import { getHazardList, createHazard } from '@/api/modules/hazard'

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getHazardList(queryParams)
    tableData.value = res.data.list
    total.value = res.data.total
  } catch (error) {
    ElMessage.error('获取列表失败')
  } finally {
    loading.value = false
  }
}
```

### 9.4 错误处理

**统一错误处理层级：**

1. **Axios 响应拦截器**：统一处理 HTTP 错误（401、403、500 等）
2. **业务状态码判断**：API 返回结构中 code 判断
3. **组件内 try-catch**：页面级错误提示和状态恢复

**Axios 拦截器示例：**

```typescript
// src/api/client.ts
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30000,
})

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    const { code, message, data } = response.data

    if (code === 200 || code === 0) {
      return response.data
    }

    ElMessage.error(message || '请求失败')
    return Promise.reject(new Error(message || '请求失败'))
  },
  (error) => {
    const status = error.response?.status
    const authStore = useAuthStore()

    switch (status) {
      case 401:
        ElMessageBox.confirm('登录已过期，请重新登录', '提示', {
          confirmButtonText: '重新登录',
          cancelButtonText: '取消',
          type: 'warning',
        }).then(() => {
          authStore.logout()
          window.location.href = '/login'
        })
        break
      case 403:
        ElMessage.error('没有权限访问')
        break
      case 404:
        ElMessage.error('请求的资源不存在')
        break
      case 500:
        ElMessage.error('服务器内部错误')
        break
      default:
        ElMessage.error(error.message || '网络错误')
    }

    return Promise.reject(error)
  }
)

export default request
```

**组件内错误处理模式：**

```typescript
const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    ElMessage.warning('请完善表单信息')
    return
  }

  submitting.value = true
  try {
    if (props.id) {
      await updateHazard(props.id, formData)
      ElMessage.success('更新成功')
    } else {
      await createHazard(formData)
      ElMessage.success('创建成功')
    }
    emit('success')
    emit('update:visible', false)
  } catch (error) {
    // 拦截器已统一提示，此处仅做状态恢复
    console.error('提交失败:', error)
  } finally {
    submitting.value = false
  }
}
```

**错误处理原则：**

- 所有异步操作必须有 `try-catch`
- 网络错误统一由拦截器处理，组件内无需重复提示
- `finally` 块中恢复 loading 状态
- 错误信息需输出到 `console.error` 便于调试

---

## 附录：Feature-based 目录结构参考

```
src/
├── api/
│   ├── client.ts              # Axios 实例
│   ├── index.ts               # 统一导出
│   └── modules/               # 按业务模块划分
│       ├── auth.ts
│       ├── user.ts
│       ├── hazard.ts
│       ├── risk.ts
│       └── ...
├── features/                  # 业务模块（核心）
│   ├── hazard/                # 隐患管理模块
│   │   ├── components/        # 模块内组件
│   │   │   ├── HazardFormDrawer.vue
│   │   │   ├── HazardDetailDrawer.vue
│   │   │   └── HazardLevelTag.vue
│   │   ├── composables/       # 模块内组合式函数
│   │   │   └── useHazardList.ts
│   │   ├── views/             # 页面视图
│   │   │   ├── HazardListView.vue
│   │   │   └── HazardDetailView.vue
│   │   └── types.ts           # 模块内类型
│   ├── risk/                  # 风险管理模块
│   ├── training/              # 培训管理模块
│   └── ...
├── components/                # 全局公共组件
│   ├── HsePageContainer.vue
│   ├── HseQueryForm.vue
│   ├── HsePermButton.vue
│   └── ...
├── stores/                    # Pinia 全局状态
│   ├── app.ts
│   ├── auth.ts
│   ├── permission.ts
│   └── ...
├── router/                    # 路由
│   ├── index.ts
│   ├── routes.ts              # 路由定义（含权限 meta）
│   └── guards.ts              # 路由守卫
├── utils/                     # 工具函数
│   ├── date.ts
│   ├── format.ts
│   └── ...
├── types/                     # 全局类型定义
│   ├── api.ts
│   ├── auth.ts
│   └── ...
├── styles/                    # 全局样式
│   ├── index.scss
│   ├── variables.scss
│   └── ...
├── plugins/                   # 插件
│   ├── pinia.ts
│   ├── router.ts
│   └── ...
├── App.vue
└── main.ts
```

---

**文档结束**

> 本规范为 HSE 系统 PC 端页面开发的指导性文件，所有前端开发人员应严格遵守。如遇特殊场景需调整，应与团队沟通确认后执行，并同步更新本文档。
