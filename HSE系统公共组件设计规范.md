# HSE系统公共组件设计规范

> 版本：v1.0.0
> 技术栈：Vue 3.4 + TypeScript + Element Plus 2.7
> 适用范围：HSE安全管理系统前端工程

---

## 一、组件库概述

### 1.1 设计目标

本组件库旨在为HSE系统提供统一、高效、可复用的业务组件体系，核心目标包括：

- **统一交互体验**：确保全系统页面视觉风格、交互模式一致，降低用户学习成本
- **减少重复开发**：沉淀通用业务模式，避免各模块重复造轮子
- **提升开发效率**：通过配置化组件，快速搭建业务页面，缩短开发周期
- **保持代码一致性**：统一组件API设计和编码规范，降低维护成本

### 1.2 组件分类

HSE系统组件分为以下两个层级：

| 分类 | 说明 | 来源 | 使用场景 |
|------|------|------|----------|
| **基础组件** | 通用UI原子组件 | Element Plus 2.7 原生 | 按钮、输入框、弹窗、表格等基础交互 |
| **业务组件** | HSE领域定制封装 | 自研（`src/components/hse/`） | 页面容器、查询表单、数据表格、状态标签等业务模式 |

> **原则**：优先使用 Element Plus 原生组件，仅在出现重复业务模式时进行封装。

### 1.3 存放位置

```
src/
├── components/
│   ├── layout/              # 布局组件（现有）
│   │   ├── LayoutDefault.vue
│   │   ├── LayoutHeader.vue
│   │   └── ...
│   └── hse/                 # HSE业务公共组件（新增）
│       ├── HSEPageContainer/
│       │   ├── HSEPageContainer.vue
│       │   └── types.ts
│       ├── HSESearchForm/
│       │   ├── HSESearchForm.vue
│       │   └── types.ts
│       ├── HSETable/
│       │   ├── HSETable.vue
│       │   └── types.ts
│       ├── HSEModal/
│       │   └── HSEModal.vue
│       ├── HSEDetail/
│       │   ├── HSEDetail.vue
│       │   └── types.ts
│       ├── HSEStatusTag/
│       │   ├── HSEStatusTag.vue
│       │   └── types.ts
│       └── HSEAuditFlow/
│           ├── HSEAuditFlow.vue
│           └── types.ts
└── features/
    └── hazard/
        ├── components/      # 模块内复用组件
        └── views/
```

### 1.4 命名规范

- **组件文件名**：`HSE`前缀 + 功能名，大驼峰命名，如 `HSEPageContainer.vue`
- **组件目录名**：与组件名一致，如 `HSEPageContainer/`
- **组件注册名**：与文件名一致，在模板中使用 `<HSEPageContainer />`
- **Props/Events**：小驼峰命名，如 `modelValue`、`pageSize`
- **自定义事件**：使用 kebab-case 触发，如 `@search`、`@page-change`

### 1.5 设计原则

1. **最小可用原则**：先满足核心场景，不追求大而全，逐步迭代完善
2. **可扩展原则**：通过 slots、作用域插槽、formatter 回调等方式支持定制
3. **可配置原则**：优先通过配置数组驱动 UI，减少模板代码量
4. **不造轮子原则**：底层基于 Element Plus 封装，不重复实现基础能力
5. **类型安全原则**：全面使用 TypeScript 类型定义，提供良好的 IDE 提示
6. **单向数据流原则**：遵循 Vue 单向数据流，使用 `v-model` 约定

---

## 二、HSEPageContainer 页面容器组件

### 2.1 功能说明

统一的页面卡片容器组件，用于包装业务页面内容，提供一致的页面结构：

- 统一的页面标题和操作按钮区域布局
- 可选的返回按钮（用于详情页、编辑页等二级页面）
- 标准化的内边距和卡片样式
- 支持通过 slot 扩展标题栏和操作区

### 2.2 Props 定义

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `title` | `string` | `''` | 页面标题 |
| `showBack` | `boolean` | `false` | 是否显示返回按钮 |
| `extra` | `VNode \| string` | `undefined` | 右侧操作区内容（props方式） |
| `border` | `boolean` | `true` | 是否显示卡片边框 |
| `bodyClass` | `string` | `''` | 内容区自定义类名 |

### 2.3 Slots

| 插槽名 | 说明 | 作用域参数 |
|--------|------|------------|
| `default` | 页面主内容区 | - |
| `title` | 自定义标题区域 | - |
| `extra` | 右侧操作按钮区域 | - |

### 2.4 使用示例代码

```vue
<template>
  <HSEPageContainer title="隐患管理">
    <template #extra>
      <el-button type="primary" @click="handleAdd">新增隐患</el-button>
    </template>

    <!-- 页面内容 -->
    <HSESearchForm :fields="searchFields" v-model="filterForm" @search="handleSearch" />
    <HSETable :columns="columns" :data="tableData" :pagination="pagination" />
  </HSEPageContainer>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import HSEPageContainer from '@/components/hse/HSEPageContainer/HSEPageContainer.vue'
import HSESearchForm from '@/components/hse/HSESearchForm/HSESearchForm.vue'
import HSETable from '@/components/hse/HSETable/HSETable.vue'

const filterForm = reactive({ keyword: '', level: '' })
const tableData = ref<any[]>([])
const pagination = reactive({ currentPage: 1, pageSize: 10, total: 0 })

const searchFields = [
  { type: 'input', label: '关键字', prop: 'keyword', placeholder: '请输入关键字' },
  { type: 'select', label: '级别', prop: 'level', options: [
    { label: '重大', value: 'major' },
    { label: '一般', value: 'general' },
  ]}
]

const columns = [
  { prop: 'id', label: '编号', width: 80 },
  { prop: 'title', label: '标题', minWidth: 180 },
]

const handleAdd = () => {}
const handleSearch = () => {}
</script>
```

**详情页示例（带返回按钮）：**

```vue
<template>
  <HSEPageContainer title="隐患详情" show-back @back="goBack">
    <HSEDetail :data="detailData" :fields="detailFields" />
  </HSEPageContainer>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import HSEPageContainer from '@/components/hse/HSEPageContainer/HSEPageContainer.vue'
import HSEDetail from '@/components/hse/HSEDetail/HSEDetail.vue'

const router = useRouter()
const detailData = ref({})
const detailFields = [...]

const goBack = () => router.back()
</script>
```

---

## 三、HSESearchForm 查询表单组件

### 3.1 功能说明

统一的查询表单组件，通过配置化方式快速构建查询条件：

- 支持多种字段类型：输入框、下拉选择、日期选择、日期范围等
- 支持折叠/展开，字段较多时默认折叠显示
- 统一的查询、重置按钮布局
- 支持自定义列数和栅格布局
- 响应式布局，自适应不同屏幕宽度

### 3.2 Props 定义

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `modelValue` | `Record<string, any>` | - | 表单数据对象（v-model） |
| `fields` | `SearchField[]` | `[]` | 字段配置数组 |
| `defaultCols` | `number` | `3` | 默认显示列数 |
| `showCollapse` | `boolean` | `true` | 是否显示折叠/展开按钮 |
| `showSearch` | `boolean` | `true` | 是否显示查询按钮 |
| `showReset` | `boolean` | `true` | 是否显示重置按钮 |
| `labelWidth` | `string \| number` | `'80px'` | 标签宽度 |
| `inline` | `boolean` | `true` | 是否行内模式 |

### 3.3 字段配置（SearchField）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `type` | `'input' \| 'select' \| 'date' \| 'daterange' \| 'select-multiple' \| 'number'` | 是 | 字段类型 |
| `label` | `string` | 是 | 标签文字 |
| `prop` | `string` | 是 | 绑定的属性名 |
| `placeholder` | `string` | 否 | 占位提示文字 |
| `options` | `Array<{ label: string, value: any }>` | 否 | select 类型的选项 |
| `colSpan` | `number` | 否 | 占用列数，默认 1 |
| `width` | `string \| number` | 否 | 控件宽度 |
| `disabled` | `boolean` | 否 | 是否禁用 |
| `clearable` | `boolean` | 否 | 是否可清空，默认 true |
| `formatter` | `(value: any) => any` | 否 | 值格式化函数 |

### 3.4 Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:modelValue` | `form: Record<string, any>` | 表单数据变化 |
| `search` | `form: Record<string, any>` | 点击查询按钮 |
| `reset` | - | 点击重置按钮 |

### 3.5 使用示例代码

```vue
<template>
  <HSESearchForm
    v-model="filterForm"
    :fields="searchFields"
    :default-cols="3"
    @search="handleSearch"
    @reset="handleReset"
  />
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import HSESearchForm from '@/components/hse/HSESearchForm/HSESearchForm.vue'
import type { SearchField } from '@/components/hse/HSESearchForm/types'

const filterForm = reactive({
  keyword: '',
  level: '',
  status: '',
  type: '',
  dateRange: [],
  department: ''
})

const searchFields: SearchField[] = [
  {
    type: 'input',
    label: '关键字',
    prop: 'keyword',
    placeholder: '请输入关键字'
  },
  {
    type: 'select',
    label: '级别',
    prop: 'level',
    placeholder: '请选择级别',
    options: [
      { label: '重大', value: 'major' },
      { label: '一般', value: 'general' },
      { label: '轻微', value: 'minor' }
    ]
  },
  {
    type: 'select',
    label: '状态',
    prop: 'status',
    placeholder: '请选择状态',
    options: [
      { label: '待处理', value: 'pending' },
      { label: '处理中', value: 'processing' },
      { label: '已解决', value: 'resolved' }
    ]
  },
  {
    type: 'select',
    label: '类型',
    prop: 'type',
    placeholder: '请选择类型',
    options: [
      { label: '设备', value: 'equipment' },
      { label: '行为', value: 'behavior' },
      { label: '管理', value: 'management' }
    ]
  },
  {
    type: 'daterange',
    label: '上报时间',
    prop: 'dateRange',
    placeholder: ['开始日期', '结束日期']
  },
  {
    type: 'select',
    label: '责任部门',
    prop: 'department',
    placeholder: '请选择部门',
    options: []
  }
]

const handleSearch = (form: typeof filterForm) => {
  console.log('查询条件：', form)
  // 调用查询接口
}

const handleReset = () => {
  // 重置后自动回到第一页
}
</script>
```

---

## 四、HSETable 数据表格组件

### 4.1 功能说明

统一的数据表格组件，封装 Element Plus Table + Pagination：

- 配置化列定义，减少模板代码
- 内置分页组件，统一分页交互
- 支持选择列、序号列、操作列等常用列类型
- 支持自定义列渲染（slot 或 formatter）
- 统一加载状态、空数据样式

### 4.2 Props 定义

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `columns` | `TableColumn[]` | `[]` | 列配置数组 |
| `data` | `any[]` | `[]` | 表格数据 |
| `loading` | `boolean` | `false` | 是否加载中 |
| `pagination` | `PaginationConfig \| false` | `false` | 分页配置，传 false 不显示 |
| `border` | `boolean` | `true` | 是否显示边框 |
| `stripe` | `boolean` | `false` | 是否斑马纹 |
| `height` | `string \| number` | `undefined` | 表格高度 |
| `rowKey` | `string` | `'id'` | 行数据唯一标识 |
| `selectable` | `(row: any) => boolean` | `undefined` | 选择项是否可选 |

**PaginationConfig：**

| 字段名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `total` | `number` | `0` | 总条数 |
| `page` | `number` | `1` | 当前页 |
| `pageSize` | `number` | `10` | 每页条数 |
| `pageSizes` | `number[]` | `[10, 20, 50, 100]` | 每页条数选项 |
| `layout` | `string` | `'total, sizes, prev, pager, next, jumper'` | 分页布局 |

### 4.3 列配置（TableColumn）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `prop` | `string` | 否 | 数据属性名（type 为普通列时必填） |
| `label` | `string` | 是 | 列标题 |
| `width` | `number \| string` | 否 | 列宽 |
| `minWidth` | `number \| string` | 否 | 最小列宽 |
| `align` | `'left' \| 'center' \| 'right'` | `'left'` | 对齐方式 |
| `type` | `'index' \| 'selection' \| 'action'` | 否 | 列类型，不填为普通列 |
| `formatter` | `(row: any, value: any) => string \| VNode` | 否 | 格式化函数 |
| `slot` | `string` | 否 | 自定义插槽名 |
| `fixed` | `'left' \| 'right' \| boolean` | 否 | 固定列 |
| `showOverflowTooltip` | `boolean` | 否 | 超出显示 tooltip |
| `index` | `number \| ((index: number) => number)` | 否 | 序号列起始值或计算函数 |

### 4.4 Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `row-click` | `row: any` | 行点击事件 |
| `selection-change` | `selection: any[]` | 选中项变化 |
| `page-change` | `page: number` | 页码变化 |
| `size-change` | `pageSize: number` | 每页条数变化 |

### 4.5 使用示例代码

```vue
<template>
  <HSETable
    :columns="columns"
    :data="tableData"
    :loading="loading"
    :pagination="pagination"
    @page-change="handlePageChange"
    @size-change="handleSizeChange"
    @row-click="handleRowClick"
    @selection-change="handleSelectionChange"
  >
    <template #status="{ row }">
      <HSEStatusTag status="hazard-status" :value="row.status" />
    </template>

    <template #level="{ row }">
      <HSEStatusTag status="hazard-level" :value="row.level" />
    </template>

    <template #action="{ row }">
      <el-button size="small" type="primary" link @click.stop="handleDetail(row)">详情</el-button>
      <el-button size="small" type="warning" link @click.stop="handleEdit(row)">编辑</el-button>
      <el-button size="small" type="danger" link @click.stop="handleDelete(row)">删除</el-button>
    </template>
  </HSETable>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import HSETable from '@/components/hse/HSETable/HSETable.vue'
import HSEStatusTag from '@/components/hse/HSEStatusTag/HSEStatusTag.vue'
import type { TableColumn } from '@/components/hse/HSETable/types'

const loading = ref(false)
const tableData = ref<any[]>([])
const pagination = reactive({
  total: 0,
  page: 1,
  pageSize: 10,
  pageSizes: [10, 20, 50, 100]
})

const columns: TableColumn[] = [
  { type: 'selection', width: 50, align: 'center' },
  { type: 'index', label: '序号', width: 60, align: 'center' },
  { prop: 'id', label: '编号', width: 80 },
  { prop: 'title', label: '标题', minWidth: 180, showOverflowTooltip: true },
  { prop: 'level', label: '级别', width: 100, slot: 'level', align: 'center' },
  { prop: 'status', label: '状态', width: 100, slot: 'status', align: 'center' },
  { prop: 'location', label: '位置', width: 140, showOverflowTooltip: true },
  { prop: 'reporter', label: '上报人', width: 100 },
  { prop: 'reportedAt', label: '上报时间', width: 160 },
  {
    type: 'action',
    label: '操作',
    width: 200,
    fixed: 'right',
    slot: 'action',
    align: 'center'
  }
]

const handlePageChange = (page: number) => {
  pagination.page = page
  // 重新查询
}

const handleSizeChange = (pageSize: number) => {
  pagination.pageSize = pageSize
  pagination.page = 1
  // 重新查询
}

const handleRowClick = (row: any) => {}
const handleSelectionChange = (selection: any[]) => {}
const handleDetail = (row: any) => {}
const handleEdit = (row: any) => {}
const handleDelete = (row: any) => {}
</script>
```

---

## 五、HSEModal 弹窗组件

### 5.1 功能说明

统一的弹窗组件，基于 `el-dialog` 封装：

- 统一样式和交互行为
- 内置确认、取消按钮，支持加载状态
- 支持拖拽调整大小（可选）
- 统一的 footer 布局

### 5.2 Props 定义

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `modelValue` | `boolean` | `false` | 是否显示（v-model） |
| `title` | `string` | `''` | 弹窗标题 |
| `width` | `string \| number` | `'600px'` | 弹窗宽度 |
| `footer` | `boolean` | `true` | 是否显示底部按钮 |
| `confirmText` | `string` | `'确定'` | 确认按钮文字 |
| `cancelText` | `string` | `'取消'` | 取消按钮文字 |
| `confirmLoading` | `boolean` | `false` | 确认按钮加载状态 |
| `confirmDisabled` | `boolean` | `false` | 确认按钮禁用状态 |
| `showClose` | `boolean` | `true` | 是否显示关闭按钮 |
| `closeOnClickModal` | `boolean` | `true` | 点击遮罩是否关闭 |
| `closeOnPressEscape` | `boolean` | `true` | 按 ESC 是否关闭 |
| `destroyOnClose` | `boolean` | `false` | 关闭时销毁内容 |
| `center` | `boolean` | `false` | 标题和底部居中 |
| `fullscreen` | `boolean` | `false` | 是否全屏 |
| `top` | `string` | `'15vh'` | 距离顶部距离 |

### 5.3 Slots

| 插槽名 | 说明 | 作用域参数 |
|--------|------|------------|
| `default` | 弹窗内容区 | - |
| `title` | 自定义标题 | - |
| `footer` | 自定义底部按钮区 | - |

### 5.4 Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:modelValue` | `visible: boolean` | 显示状态变化 |
| `confirm` | - | 点击确认按钮 |
| `cancel` | - | 点击取消按钮 |
| `open` | - | 弹窗打开 |
| `close` | - | 弹窗关闭 |

### 5.5 使用示例代码

```vue
<template>
  <div>
    <el-button type="primary" @click="dialogVisible = true">新增隐患</el-button>

    <HSEModal
      v-model="dialogVisible"
      title="新增隐患"
      width="700px"
      :confirm-loading="submitLoading"
      @confirm="handleSubmit"
      @close="handleClose"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="隐患标题">
          <el-input v-model="form.title" placeholder="请输入隐患标题" />
        </el-form-item>
        <el-form-item label="隐患级别">
          <el-select v-model="form.level" placeholder="请选择级别">
            <el-option label="重大" value="major" />
            <el-option label="一般" value="general" />
            <el-option label="轻微" value="minor" />
          </el-select>
        </el-form-item>
      </el-form>
    </HSEModal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import HSEModal from '@/components/hse/HSEModal/HSEModal.vue'

const dialogVisible = ref(false)
const submitLoading = ref(false)

const form = reactive({
  title: '',
  level: ''
})

const handleSubmit = async () => {
  submitLoading.value = true
  try {
    // 调用提交接口
    await new Promise(resolve => setTimeout(resolve, 1000))
    ElMessage.success('提交成功')
    dialogVisible.value = false
  } finally {
    submitLoading.value = false
  }
}

const handleClose = () => {
  // 重置表单
  form.title = ''
  form.level = ''
}
</script>
```

**自定义 footer 示例：**

```vue
<template>
  <HSEModal v-model="visible" title="详情" width="600px" :footer="false">
    <p>详情内容...</p>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" @click="handlePrint">打印</el-button>
    </template>
  </HSEModal>
</template>
```

---

## 六、HSEDetail 详情展示组件

### 6.1 功能说明

统一的详情展示组件，基于 `el-descriptions` 封装：

- 配置化字段定义，快速构建详情页
- 支持自定义渲染（slot 或 formatter）
- 统一的标签列和内容列样式
- 支持多列布局

### 6.2 Props 定义

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `data` | `Record<string, any>` | `{}` | 详情数据对象 |
| `fields` | `DetailField[]` | `[]` | 字段配置数组 |
| `column` | `number` | `2` | 列数 |
| `border` | `boolean` | `true` | 是否显示边框 |
| `labelWidth` | `string \| number` | `'120px'` | 标签宽度 |
| `size` | `'large' \| 'default' \| 'small'` | `'default'` | 尺寸 |

### 6.3 字段配置（DetailField）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `prop` | `string` | 是 | 数据属性名 |
| `label` | `string` | 是 | 标签文字 |
| `span` | `number` | 否 | 占用列数，默认 1 |
| `formatter` | `(value: any, data: any) => string \| VNode` | 否 | 格式化函数 |
| `slot` | `string` | 否 | 自定义插槽名 |
| `labelWidth` | `string \| number` | 否 | 当前项标签宽度 |

### 6.4 Slots

| 插槽名 | 说明 | 作用域参数 |
|--------|------|------------|
| `[field.slot]` | 自定义字段内容 | `{ value, data }` |
| `extra` | 操作栏（标题右侧） | - |

### 6.5 使用示例代码

```vue
<template>
  <HSEDetail :data="detailData" :fields="detailFields" :column="2">
    <template #level="{ value }">
      <HSEStatusTag status="hazard-level" :value="value" />
    </template>

    <template #status="{ value }">
      <HSEStatusTag status="hazard-status" :value="value" />
    </template>

    <template #images="{ value }">
      <div class="image-list">
        <el-image
          v-for="(img, i) in value"
          :key="i"
          :src="img"
          :preview-src-list="value"
          :initial-index="i"
          fit="cover"
          style="width: 100px; height: 100px; margin-right: 8px"
        />
      </div>
    </template>
  </HSEDetail>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import HSEDetail from '@/components/hse/HSEDetail/HSEDetail.vue'
import HSEStatusTag from '@/components/hse/HSEStatusTag/HSEStatusTag.vue'
import type { DetailField } from '@/components/hse/HSEDetail/types'

const detailData = ref({
  id: 'HZ202401001',
  title: '消防通道堵塞',
  level: 'major',
  status: 'pending',
  location: '办公楼东侧',
  department: '安全环保部',
  reporter: '张三',
  reportedAt: '2024-01-15 10:30:00',
  deadline: '2024-01-25',
  description: '消防通道被杂物堵塞，存在安全隐患...',
  images: ['url1.jpg', 'url2.jpg']
})

const detailFields: DetailField[] = [
  { prop: 'id', label: '隐患编号' },
  { prop: 'title', label: '隐患标题', span: 1 },
  { prop: 'level', label: '隐患级别', slot: 'level' },
  { prop: 'status', label: '状态', slot: 'status' },
  { prop: 'location', label: '位置' },
  { prop: 'department', label: '责任部门' },
  { prop: 'reporter', label: '上报人' },
  { prop: 'reportedAt', label: '上报时间' },
  { prop: 'deadline', label: '整改期限' },
  { prop: 'description', label: '隐患描述', span: 2 },
  { prop: 'images', label: '现场照片', span: 2, slot: 'images' }
]
</script>
```

---

## 七、HSEStatusTag 状态标签组件

### 7.1 功能说明

统一的状态标签组件，封装 HSE 业务领域常见状态：

- 预设 HSE 业务状态映射（隐患状态、风险等级、考核状态等）
- 统一的颜色和样式规范
- 支持自定义状态类型和颜色
- 基于 `el-tag` 封装

### 7.2 支持的状态类型

**基础类型：**

| 类型 | 颜色 | 说明 |
|------|------|------|
| `success` | 绿色 | 成功/通过/已完成 |
| `info` | 灰色 | 默认/待处理/进行中 |
| `warning` | 橙色 | 警告/一般/处理中 |
| `danger` | 红色 | 危险/严重/未通过 |
| `default` | 默认 | 默认状态 |

**业务状态映射：**

使用 `status` + `value` 方式自动匹配预设的业务状态样式。

### 7.3 Props 定义

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `status` | `string` | - | 业务状态类型（如 `hazard-status`、`risk-level`） |
| `value` | `string \| number` | - | 状态值 |
| `text` | `string` | - | 显示文本（不填则根据 value 自动映射） |
| `type` | `TagType` | - | 自定义标签类型，优先级高于 status |
| `color` | `string` | - | 自定义背景色 |
| `size` | `'large' \| 'default' \| 'small'` | `'default'` | 标签尺寸 |
| `effect` | `'dark' \| 'light' \| 'plain'` | `'light'` | 标签效果 |
| `round` | `boolean` | `false` | 是否圆角 |

### 7.4 HSE 业务状态映射

#### 7.4.1 隐患状态（hazard-status）

| 值 | 文本 | 类型 |
|----|------|------|
| `pending` | 待处理 | `info` |
| `processing` | 处理中 | `warning` |
| `resolved` | 已整改 | `success` |
| `verified` | 已验收 | `success` |
| `closed` | 已闭环 | `success` |
| `overdue` | 已逾期 | `danger` |

#### 7.4.2 隐患级别（hazard-level）

| 值 | 文本 | 类型 |
|----|------|------|
| `major` | 重大隐患 | `danger` |
| `general` | 一般隐患 | `warning` |
| `minor` | 轻微隐患 | `info` |

#### 7.4.3 风险等级（risk-level）

| 值 | 文本 | 类型 |
|----|------|------|
| `red` | 重大风险 | `danger` |
| `orange` | 较大风险 | `warning` |
| `yellow` | 一般风险 | `warning` |
| `blue` | 低风险 | `info` |

#### 7.4.4 考核状态（evaluation-status）

| 值 | 文本 | 类型 |
|----|------|------|
| `draft` | 草稿 | `info` |
| `pending` | 待考核 | `info` |
| `ongoing` | 考核中 | `warning` |
| `completed` | 已完成 | `success` |
| `approved` | 已审核 | `success` |
| `rejected` | 已驳回 | `danger` |

#### 7.4.5 三违级别（violation-level）

| 值 | 文本 | 类型 |
|----|------|------|
| `serious` | 严重三违 | `danger` |
| `general` | 一般三违 | `warning` |
| `minor` | 轻微三违 | `info` |

#### 7.4.6 审核状态（audit-status）

| 值 | 文本 | 类型 |
|----|------|------|
| `pending` | 待审核 | `info` |
| `approved` | 已通过 | `success` |
| `rejected` | 已驳回 | `danger` |
| `reviewing` | 审核中 | `warning` |

### 7.5 使用示例代码

```vue
<template>
  <div class="demo">
    <!-- 使用预设业务状态 -->
    <HSEStatusTag status="hazard-status" value="pending" />
    <HSEStatusTag status="hazard-status" value="processing" />
    <HSEStatusTag status="hazard-status" value="resolved" />
    <HSEStatusTag status="hazard-status" value="overdue" />

    <HSEStatusTag status="hazard-level" value="major" />
    <HSEStatusTag status="hazard-level" value="general" />
    <HSEStatusTag status="hazard-level" value="minor" />

    <HSEStatusTag status="risk-level" value="red" />
    <HSEStatusTag status="risk-level" value="orange" />
    <HSEStatusTag status="risk-level" value="blue" />

    <!-- 自定义文本 -->
    <HSEStatusTag status="hazard-status" value="pending" text="待处理中..." />

    <!-- 自定义类型和颜色 -->
    <HSEStatusTag type="success" text="自定义成功" />
    <HSEStatusTag color="#10b981" text="自定义颜色" />

    <!-- 不同尺寸 -->
    <HSEStatusTag status="hazard-status" value="pending" size="small" />
    <HSEStatusTag status="hazard-status" value="pending" size="default" />
    <HSEStatusTag status="hazard-status" value="pending" size="large" />
  </div>
</template>

<script setup lang="ts">
import HSEStatusTag from '@/components/hse/HSEStatusTag/HSEStatusTag.vue'
</script>
```

**在表格列中使用：**

```vue
<template>
  <HSETable :columns="columns" :data="tableData">
    <template #status="{ row }">
      <HSEStatusTag status="hazard-status" :value="row.status" />
    </template>
    <template #level="{ row }">
      <HSEStatusTag status="hazard-level" :value="row.level" />
    </template>
  </HSETable>
</template>
```

---

## 八、HSEAuditFlow 审核流程组件

### 8.1 功能说明

统一的审核流程展示组件，用于展示审批记录、操作日志等时间线数据：

- 基于时间线样式展示审核记录
- 支持多种审核状态（待审核、已通过、已驳回等）
- 统一的左右布局样式
- 显示操作人、操作时间、操作意见、操作类型

### 8.2 Props 定义

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `records` | `AuditRecord[]` | `[]` | 审核记录数组 |
| `reverse` | `boolean` | `false` | 是否倒序显示 |
| `size` | `'large' \| 'default' \| 'small'` | `'default'` | 尺寸 |

### 8.3 记录项结构（AuditRecord）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | `string \| number` | 是 | 记录唯一标识 |
| `status` | `'pending' \| 'approved' \| 'rejected' \| 'reviewing' \| 'withdraw'` | 是 | 审核状态 |
| `action` | `string` | 否 | 操作名称（如"提交"、"审核通过"） |
| `operator` | `string` | 是 | 操作人 |
| `avatar` | `string` | 否 | 操作人头像 |
| `time` | `string` | 是 | 操作时间 |
| `opinion` | `string` | 否 | 审核意见 |
| `extra` | `VNode \| string` | 否 | 额外信息 |

### 8.4 展示样式

- 时间线样式，左侧为时间节点，右侧为内容
- 不同状态使用不同颜色的节点图标
- 审核意见使用引用块样式
- 支持自定义内容扩展

### 8.5 使用示例代码

```vue
<template>
  <HSEAuditFlow :records="auditRecords" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import HSEAuditFlow from '@/components/hse/HSEAuditFlow/HSEAuditFlow.vue'
import type { AuditRecord } from '@/components/hse/HSEAuditFlow/types'

const auditRecords = ref<AuditRecord[]>([
  {
    id: 1,
    status: 'pending',
    action: '提交申请',
    operator: '张三',
    time: '2024-01-15 10:30:00',
    opinion: '申请隐患整改验收，请相关领导审批。'
  },
  {
    id: 2,
    status: 'reviewing',
    action: '部门审核中',
    operator: '李四（安全环保部）',
    time: '2024-01-15 14:20:00',
    opinion: '正在核实整改情况...'
  },
  {
    id: 3,
    status: 'approved',
    action: '部门审核通过',
    operator: '李四（安全环保部）',
    time: '2024-01-16 09:15:00',
    opinion: '整改到位，同意通过，请分管领导审批。'
  },
  {
    id: 4,
    status: 'approved',
    action: '分管领导审批通过',
    operator: '王五（分管副总）',
    time: '2024-01-16 15:40:00',
    opinion: '同意，闭环管理。'
  }
])
</script>
```

**在详情页中使用：**

```vue
<template>
  <HSEPageContainer title="隐患详情" show-back>
    <el-tabs v-model="activeTab">
      <el-tab-pane label="基本信息" name="basic">
        <HSEDetail :data="detailData" :fields="detailFields" />
      </el-tab-pane>
      <el-tab-pane label="审核记录" name="audit">
        <HSEAuditFlow :records="auditRecords" />
      </el-tab-pane>
    </el-tabs>
  </HSEPageContainer>
</template>
```

---

## 九、组件开发规范

### 9.1 组件文件结构

每个组件独立目录，遵循以下结构：

```
HSEComponentName/
├── HSEComponentName.vue    # 主组件文件（必需）
├── types.ts               # 类型定义（可选，类型复杂时单独拆出）
└── index.ts               # 导出文件（可选，用于统一导出）
```

**简单组件**（类型定义较少）可直接在 `.vue` 文件中定义类型，无需单独 `types.ts`。

**文件命名规范：**
- 组件文件名与组件名一致，使用大驼峰
- 类型文件使用 `types.ts`
- 导出文件使用 `index.ts`

### 9.2 Props 定义规范

使用 `withDefaults` + TypeScript 类型定义：

```vue
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  title: string
  showBack?: boolean
  extra?: string
  border?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showBack: false,
  extra: '',
  border: true
})
</script>
```

**规范要点：**
- 使用 TypeScript 接口定义 Props 类型
- 使用 `withDefaults` 设置默认值
- 必选属性不加 `?`，可选属性加 `?`
- 布尔类型默认值明确设置，不要依赖 `undefined`
- 复杂类型（如配置数组）单独定义类型接口

### 9.3 Emits 定义规范

使用 `defineEmits` + 类型：

```vue
<script setup lang="ts">
interface Emits {
  (e: 'update:modelValue', value: any): void
  (e: 'search', form: Record<string, any>): void
  (e: 'reset'): void
  (e: 'back'): void
}

const emit = defineEmits<Emits>()

// 使用
const handleSearch = () => {
  emit('search', form)
}
</script>
```

**规范要点：**
- 使用 TypeScript 函数签名定义事件类型
- 事件名使用 kebab-case（触发时）
- v-model 事件使用 `update:modelValue` 命名约定
- 每个事件明确参数类型，无参数时写 `void`

### 9.4 Slots 使用规范

**具名 slot：**

```vue
<template>
  <div class="hse-page-container">
    <div class="header">
      <div class="title">
        <slot name="title">
          {{ title }}
        </slot>
      </div>
      <div class="extra">
        <slot name="extra" />
      </div>
    </div>
    <div class="body">
      <slot />
    </div>
  </div>
</template>
```

**作用域 slot：**

```vue
<template>
  <el-table :data="data">
    <el-table-column
      v-for="col in columns"
      :key="col.prop || col.type"
      :prop="col.prop"
      :label="col.label"
      :width="col.width"
    >
      <template #default="scope">
        <slot v-if="col.slot" :name="col.slot" :row="scope.row" :value="scope.row[col.prop]" />
        <template v-else-if="col.formatter">
          {{ col.formatter(scope.row, scope.row[col.prop]) }}
        </template>
        <template v-else>
          {{ scope.row[col.prop] }}
        </template>
      </template>
    </el-table-column>
  </el-table>
</template>
```

**规范要点：**
- 默认内容使用 `default` slot
- 扩展区域使用具名 slot
- 需要传递数据时使用作用域 slot
- slot 命名使用小驼峰或 kebab-case
- 表格列等动态 slot 使用配置项的 `slot` 字段指定

### 9.5 样式规范

```vue
<style scoped lang="scss">
.hse-page-container {
  background: var(--el-bg-color);
  border-radius: 4px;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  &__body {
    padding: 20px;
  }
}
</style>
```

**规范要点：**
- 使用 `scoped` 样式，避免样式污染
- 使用 SCSS 预处理器
- 类名使用 BEM 命名规范（`block__element--modifier`）
- 优先使用 Element Plus CSS 变量（`--el-*`），保持主题一致性
- 不使用 `!important`
- 颜色、间距等设计变量优先从主题变量获取
- 组件根类名与组件名一致（小写 kebab-case）

### 9.6 文档要求

每个组件应包含：

1. **组件说明**：功能简介、适用场景
2. **Props 文档**：属性名、类型、默认值、说明
3. **Events 文档**：事件名、参数、说明
4. **Slots 文档**：插槽名、说明、作用域参数
5. **使用示例**：至少一个完整的使用示例代码
6. **类型定义**：公共类型导出，便于业务方使用

**示例文档结构（在组件文件顶部注释）：**

```vue
<!--
HSEPageContainer - 页面容器组件

@description
统一的页面卡片容器，提供标题、操作区、内容区的标准布局。

@props
- title {string} 页面标题
- showBack {boolean} 是否显示返回按钮，默认 false
- extra {VNode|string} 右侧操作区内容

@events
- back 点击返回按钮

@slots
- default 页面主内容
- title 自定义标题
- extra 自定义操作区

@example
<HSEPageContainer title="列表页">
  <template #extra>
    <el-button type="primary">新增</el-button>
  </template>
  内容
</HSEPageContainer>
-->
```

---

## 十、组件使用优先级

### 10.1 优先使用 Element Plus 原生组件

对于基础UI交互，**优先使用 Element Plus 原生组件**：

- 按钮、输入框、下拉选择、日期选择等基础表单控件
- 标签页、面包屑、进度条等基础UI组件
- 提示框、消息、通知等反馈组件

**原因：**
- Element Plus 组件经过充分测试，稳定性高
- 主题统一，无需额外适配
- 文档完善，团队学习成本低

### 10.2 通用模式沉淀为 HSE 业务组件

当出现以下情况时，考虑沉淀为 HSE 业务公共组件：

- **重复出现 3 次以上**的业务模式
- 跨模块复用的业务组件
- 统一的业务交互规范（如状态标签、审核流程）

**沉淀标准：**
- 有明确的业务语义
- API 设计稳定，不易频繁变动
- 配置化程度高，适用多种场景
- 有完整的类型定义和文档

### 10.3 模块内复用的放在 features/xxx/components/

仅在**单个 feature 模块内复用**的组件，放在模块内的 `components` 目录：

```
src/features/hazard/
├── components/          # 隐患模块内复用组件
│   ├── HazardStatusSelect.vue
│   └── HazardLevelTag.vue
└── views/
    ├── HazardListView.vue
    └── HazardDetailView.vue
```

**判断标准：**
- 仅在当前 feature 内使用
- 与当前业务强耦合
- 其他模块不太可能复用

### 10.4 单次使用的不抽离组件

仅在**单个页面/组件内使用**，且逻辑简单的，直接写在当前文件中：

- 简单的展示型子组件
- 拆分的逻辑块但不复用
- 仅为代码可读性而拆分

**原则：**
- 不过度设计，不为了"组件化"而组件化
- YAGNI（You Aren't Gonna Need It）原则
- 等出现复用需求时再抽离

---

## 附录：组件演进路线

### 第一阶段：基础组件搭建
- HSEPageContainer 页面容器
- HSESearchForm 查询表单
- HSETable 数据表格
- HSEModal 弹窗

### 第二阶段：业务状态组件
- HSEStatusTag 状态标签
- HSEDetail 详情展示
- HSEAuditFlow 审核流程

### 第三阶段：高级业务组件
- HSEForm 表单组件（配置化表单）
- HSEUpload 文件上传
- HSEImport 导入组件
- HSEExport 导出组件
- HSEChart 图表组件封装

---

> **文档维护说明**：本规范随组件库迭代更新，新增组件时请同步更新本文档，保持文档与代码一致。
