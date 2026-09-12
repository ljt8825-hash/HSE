# Vue 3 中大型项目目录结构规范

> 技术栈：Vite + Vue 3 + TypeScript + Pinia + Vue Router  
> 设计思想：Feature-Sliced Design + 组件化分层

---

## 目录树

```
vue3-admin-pro/
├── .env                          # 环境变量基础配置
├── .env.development              # 开发环境配置
├── .env.production               # 生产环境配置
├── .env.staging                  # 预发布环境配置
├── .eslintrc.cjs                 # ESLint 配置
├── .prettierrc.cjs               # Prettier 代码格式化配置
├── .stylelintrc.cjs              # Stylelint CSS 规范配置
├── index.html                    # 入口 HTML 文件
├── package.json                  # 项目依赖与脚本
├── tsconfig.json                 # TypeScript 编译配置（启用 strict 模式）
├── tsconfig.app.json             # 应用级 TS 配置
├── tsconfig.node.json            # Node 环境 TS 配置
├── vite.config.ts                # Vite 构建配置
├── tailwind.config.js            # Tailwind CSS 配置
├── postcss.config.js             # PostCSS 配置
├── README.md                     # 项目说明文档
├── public/                       # 静态公共资源（不经过构建）
│   ├── favicon.ico
│   └── assets/
│       └── images/
└── src/
    ├── main.ts                   # 应用入口文件，初始化 Vue 实例
    ├── App.vue                   # 根组件
    ├── vite-env.d.ts             # Vite 环境类型声明
    │
    ├── api/                      # API 请求层：按业务模块拆分，类型安全
    │   ├── client.ts             # Axios 实例封装（拦截器、错误处理）
    │   ├── types.ts              # 通用 API 响应类型定义
    │   ├── interceptors/
    │   │   ├── request.ts        # 请求拦截器（Token 注入、日志）
    │   │   └── response.ts       # 响应拦截器（错误码处理、重试）
    │   ├── modules/
    │   │   ├── auth.ts           # 认证模块 API（登录、登出、刷新 Token）
    │   │   ├── user.ts           # 用户管理 API（CRUD、分页查询）
    │   │   ├── role.ts           # 角色权限 API
    │   │   ├── permission.ts     # 权限点 API
    │   │   ├── dashboard.ts      # 仪表盘数据 API
    │   │   ├── workflow.ts       # 表单工作流 API（发起、审批、流转）
    │   │   └── system.ts         # 系统设置 API（日志、字典）
    │   └── index.ts              # API 模块统一导出
    │
    ├── assets/                   # 静态资源（图片、字体、样式变量）
    │   ├── styles/
    │   │   ├── variables.scss    # SCSS 全局变量（颜色、尺寸）
    │   │   ├── mixins.scss       # SCSS 混合宏
    │   │   ├── tailwind.css      # Tailwind 基础引入
    │   │   └── global.scss       # 全局样式覆盖
    │   ├── images/
    │   │   ├── logo.svg
    │   │   └── default-avatar.png
    │   └── fonts/
    │       └── iconfont.js       # 图标字体
    │
    ├── components/               # 组件层：按职责分层，避免跨层引用
    │   ├── base/                 # 基础组件：原子级，无业务逻辑
    │   │   ├── BaseButton.vue
    │   │   ├── BaseInput.vue
    │   │   ├── BaseTable.vue
    │   │   ├── BaseModal.vue
    │   │   ├── BasePagination.vue
    │   │   ├── BaseFormItem.vue
    │   │   └── BaseIcon.vue
    │   ├── common/               # 通用组件：跨页面复用，弱业务
    │   │   ├── CommonSearchForm.vue
    │   │   ├── CommonPageHeader.vue
    │   │   ├── CommonFileUpload.vue
    │   │   ├── CommonImagePreview.vue
    │   │   ├── CommonStatusTag.vue
    │   │   └── CommonEmptyState.vue
    │   ├── business/             # 业务组件：强业务逻辑，特定域复用
    │   │   ├── BusinessUserSelect.vue
    │   │   ├── BusinessRoleTree.vue
    │   │   ├── BusinessWorkflowTimeline.vue
    │   │   ├── BusinessApprovalActions.vue
    │   │   ├── BusinessChartCard.vue
    │   │   └── BusinessDataFilter.vue
    │   └── layout/               # 布局组件：页面级骨架
    │       ├── LayoutDefault.vue
    │       ├── LayoutSidebar.vue
    │       ├── LayoutHeader.vue
    │       ├── LayoutBreadcrumb.vue
    │       ├── LayoutTabs.vue
    │       └── LayoutFooter.vue
    │
    ├── composables/              # 组合式函数：可复用逻辑（优于 mixin）
    │   ├── useAuth.ts            # 认证逻辑（登录状态、Token 管理）
    │   ├── usePermission.ts      # 权限检查逻辑（按钮级、路由级）
    │   ├── useTable.ts           # 通用表格逻辑（分页、排序、筛选）
    │   ├── useForm.ts            # 通用表单逻辑（校验、提交、重置）
    │   ├── useModal.ts           # 弹窗控制逻辑
    │   ├── useLoading.ts         # 全局 Loading 状态管理
    │   ├── useI18n.ts            # 国际化辅助组合式函数
    │   └── index.ts              # Composables 统一导出
    │
    ├── directives/               # 自定义指令
    │   ├── permission.ts         # v-permission 权限指令
    │   ├── loading.ts            # v-loading 加载指令
    │   ├── debounce.ts           # v-debounce 防抖指令
    │   └── index.ts              # 指令统一注册
    │
    ├── features/                 # 业务特性层（Feature-Sliced Design）
    │   ├── auth/                 # 认证特性：登录、注册、找回密码
    │   │   ├── components/
    │   │   │   ├── LoginForm.vue
    │   │   │   └── RegisterForm.vue
    │   │   ├── views/
    │   │   │   ├── LoginView.vue
    │   │   │   └── ForgetPasswordView.vue
    │   │   └── index.ts
    │   ├── dashboard/            # 仪表盘特性：数据可视化、统计卡片
    │   │   ├── components/
    │   │   │   ├── StatCard.vue
    │   │   │   ├── TrendChart.vue
    │   │   │   └── QuickActions.vue
    │   │   ├── views/
    │   │   │   └── DashboardView.vue
    │   │   └── index.ts
    │   ├── user/                 # 用户管理特性
    │   │   ├── components/
    │   │   │   ├── UserTable.vue
    │   │   │   ├── UserForm.vue
    │   │   │   └── UserDetailDrawer.vue
    │   │   ├── views/
    │   │   │   ├── UserListView.vue
    │   │   │   └── UserProfileView.vue
    │   │   └── index.ts
    │   ├── workflow/             # 表单工作流特性
    │   │   ├── components/
    │   │   │   ├── WorkflowDesigner.vue
    │   │   │   ├── ApprovalNode.vue
    │   │   │   └── FormRender.vue
    │   │   ├── views/
    │   │   │   ├── WorkflowListView.vue
    │   │   │   ├── WorkflowDetailView.vue
    │   │   │   └── WorkflowCreateView.vue
    │   │   └── index.ts
    │   └── system/               # 系统管理特性：角色、菜单、日志
    │       ├── components/
    │       │   ├── RoleForm.vue
    │       │   ├── MenuTree.vue
    │       │   └── SystemLogTable.vue
    │       ├── views/
    │       │   ├── RoleManageView.vue
    │       │   ├── MenuManageView.vue
    │       │   └── SystemLogView.vue
    │       └── index.ts
    │
    ├── locales/                  # 国际化资源文件
    │   ├── index.ts              # i18n 实例初始化
    │   ├── zh-CN.ts              # 简体中文
    │   ├── en-US.ts              # 英文
    │   └── messages/             # 按模块拆分的翻译文件
    │       ├── common.ts
    │       ├── auth.ts
    │       └── system.ts
    │
    ├── plugins/                  # 插件注册
    │   ├── pinia.ts              # Pinia 状态管理初始化
    │   ├── router.ts             # Vue Router 初始化与守卫
    │   ├── i18n.ts               # Vue I18n 初始化
    │   └── element-plus.ts       # Element Plus 按需引入配置
    │
    ├── router/                   # 路由配置：按模块拆分，动态加载
    │   ├── index.ts              # 路由实例导出
    │   ├── routes.ts             # 根路由与路由合并
    │   ├── guards.ts             # 全局导航守卫（权限校验、标题设置）
    │   └── modules/
    │       ├── auth.ts           # 认证路由
    │       ├── dashboard.ts      # 仪表盘路由
    │       ├── user.ts           # 用户管理路由
    │       ├── workflow.ts       # 工作流路由
    │       └── system.ts         # 系统管理路由
    │
    ├── stores/                   # Pinia 状态管理：按模块拆分
    │   ├── index.ts              # Store 统一导出与类型导出
    │   ├── auth.ts               # 认证状态（用户信息、Token）
    │   ├── user.ts               # 用户管理状态
    │   ├── permission.ts         # 权限状态（路由、按钮权限树）
    │   ├── app.ts                # 应用级状态（侧边栏、主题、语言）
    │   ├── workflow.ts           # 工作流状态
    │   └── types/                # Store 类型定义
    │       └── index.ts
    │
    ├── types/                    # 全局类型定义：接口、枚举、工具类型
    │   ├── global.d.ts           # 全局类型扩展（Window、import.meta.env）
    │   ├── api.ts                # API 通用类型（分页、响应结构）
    │   ├── auth.ts               # 认证相关类型
    │   ├── user.ts               # 用户实体类型
    │   ├── role.ts               # 角色权限类型
    │   ├── workflow.ts           # 工作流类型
    │   ├── common.ts             # 通用工具类型（Nullable、Recordable）
    │   └── enums/                # 枚举常量（避免魔法值）
    │       ├── httpStatus.ts
    │       ├── userStatus.ts
    │       └── workflowStatus.ts
    │
    ├── utils/                    # 工具函数：纯函数，无副作用
    │   ├── index.ts              # 工具函数统一导出
    │   ├── request.ts            # 基于 Axios 的请求封装（与 api/client.ts 协同）
    │   ├── storage.ts            # localStorage / sessionStorage 封装
    │   ├── token.ts              # Token 读写与过期检查
    │   ├── validate.ts           # 表单校验规则（手机号、邮箱、身份证）
    │   ├── date.ts               # 日期格式化与计算
    │   ├── format.ts             # 数字、金额、文本格式化
    │   ├── dom.ts                # DOM 操作工具
    │   └── tree.ts               # 树形结构处理（拍平、查找、过滤）
    │
    └── views/                    # 页面视图：仅作为特性入口，保持轻薄
        ├── NotFoundView.vue      # 404 页面
        ├── ForbiddenView.vue     # 403 无权限页面
        └── redirect/             # 重定向页面（用于路由刷新）
            └── index.vue
```

---

## 目录设计说明

| 文件夹 | 职责与设计理念 |
|--------|----------------|
| `api/` | **API 通信层**。独立维护所有后端接口调用，`client.ts` 集中管理 Axios 实例、拦截器与错误处理策略；`modules/` 按业务域拆分，确保接口与类型一一对应，实现端到端类型安全。 |
| `components/` | **组件分层架构**。`base` 为原子组件（无业务逻辑），`common` 为跨页面复用组件，`business` 绑定特定业务域，`layout` 负责页面骨架。严格禁止跨层引用，保持单向依赖。 |
| `composables/` | **组合式函数层**。替代 Vue 2 时代的 mixin，将可复用逻辑（表格、表单、权限、Loading）封装为函数，支持在任意组件中通过 `useXxx()` 调用，逻辑清晰且类型友好。 |
| `features/` | **业务特性层（FSD 核心）**。每个特性是一个自包含的域（auth、user、workflow 等），内部包含专有的 components 与 views，实现高内聚、低耦合，便于团队协作与代码分割。 |
| `stores/` | **Pinia 状态管理**。按业务模块拆分 Store，避免单一巨型 Store；`types/` 集中存放 Store 专用类型，确保状态结构与组件 Props 可联动推导。 |
| `router/` | **路由配置中心**。`guards.ts` 集中处理导航守卫（权限校验、动态标题），`modules/` 按业务模块拆分路由配置，支持路由懒加载与动态权限过滤。 |
| `types/` | **全局类型中心**。集中管理接口定义、枚举与工具类型，避免类型散落在各文件中；`enums/` 统一维护业务常量，杜绝魔法值。 |
| `utils/` | **工具函数库**。纯函数集合，无副作用，覆盖存储、校验、格式化、树形处理等高频场景，与业务逻辑解耦。 |
| `locales/` | **国际化资源**。按语言与模块双维度拆分翻译文件，配合 `useI18n` 组合式函数，支持运行时语言切换。 |
| `views/` | **薄页面层**。仅作为 `features/` 中各特性的入口容器，自身不包含复杂逻辑，复杂 UI 下沉到 `features/xxx/components/` 中。 |

---

## 关键文件代码框架

### `src/main.ts` — 应用入口

```ts
import { createApp } from 'vue'
import App from './App.vue'
import { setupRouter } from './plugins/router'
import { setupPinia } from './plugins/pinia'
import { setupI18n } from './plugins/i18n'

const app = createApp(App)

setupPinia(app)
setupRouter(app)
setupI18n(app)

app.mount('#app')
```

### `src/api/client.ts` — Axios 实例封装

```ts
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

const client: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
})

// 请求拦截器：注入 Token
client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截器：统一错误处理
client.interceptors.response.use(
  (res) => res.data,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore().logout()
    }
    ElMessage.error((error.response?.data as any)?.message || '请求失败')
    return Promise.reject(error)
  }
)

export default client
```

### `src/stores/auth.ts` — 认证状态管理

```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '@/api/modules/auth'
import type { LoginParams, UserInfo } from '@/types/auth'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string>(localStorage.getItem('token') || '')
  const userInfo = ref<UserInfo | null>(null)

  const isLoggedIn = computed(() => !!accessToken.value)

  async function login(params: LoginParams) {
    const res = await authApi.login(params)
    accessToken.value = res.token
    localStorage.setItem('token', res.token)
    userInfo.value = res.userInfo
  }

  function logout() {
    accessToken.value = ''
    userInfo.value = null
    localStorage.removeItem('token')
  }

  return { accessToken, userInfo, isLoggedIn, login, logout }
})
```

### `src/features/dashboard/views/DashboardView.vue` — 仪表盘视图示例（`<script setup>` + TypeScript）

```vue
<template>
  <div class="dashboard-view">
    <StatCard
      v-for="item in statList"
      :key="item.key"
      :title="item.title"
      :value="item.value"
      :trend="item.trend"
    />
    <TrendChart :data="chartData" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import StatCard from '@/features/dashboard/components/StatCard.vue'
import TrendChart from '@/features/dashboard/components/TrendChart.vue'
import { fetchDashboardStats } from '@/api/modules/dashboard'
import type { DashboardStats } from '@/types/workflow'

const statList = ref<DashboardStats[]>([])
const chartData = ref<number[]>([])

onMounted(async () => {
  const res = await fetchDashboardStats()
  statList.value = res.stats
  chartData.value = res.trend
})
</script>
```
