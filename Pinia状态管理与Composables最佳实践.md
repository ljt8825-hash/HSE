# Pinia 状态管理与 Composables 最佳实践

> 本文档面向中大型 Vue 3 项目，基于 Feature-Sliced Design 目录结构，提供 Pinia Setup Store 的完整实现方案、关键 Composables 封装、与 TanStack Query 的协同策略，以及与已有 API 层、Vite 配置的整合指南。所有代码使用 TypeScript strict 模式，可直接复制使用。

---

## 目录

- [一、架构总览与职责划分](#一架构总览与职责划分)
- [二、Pinia 核心 Store 实现](#二pinia-核心-store-实现)
- [三、Composables 最佳实践](#三composables-最佳实践)
- [四、Pinia 与 TanStack Query 协同策略](#四pinia-与-tanstack-query-协同策略)
- [五、持久化插件配置](#五持久化插件配置)
- [六、与路由守卫和 Layout 的集成](#六与路由守卫和-layout-的集成)
- [七、Store 类型定义最佳实践](#七store-类型定义最佳实践)
- [八、实施步骤与整合验证](#八实施步骤与整合验证)

---

## 一、架构总览与职责划分

### 1.1 状态管理架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Vue Components / Views                    │
│              (features/*/views/*.vue)                        │
├─────────────────────────────────────────────────────────────┤
│                    Composables 层                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ useAuth  │  │useTable  │  │ useForm  │  │useLoading│    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
├──────────────────┬──────────────────────────────────────────┤
│   Pinia Stores    │        TanStack Query                   │
│  ┌──────────┐    │  ┌──────────────────────────────┐       │
│  │  auth    │    │  │  useQuery / useMutation      │       │
│  │  app     │    │  │  服务端状态缓存与异步写入     │       │
│  │  user    │    │  └──────────────────────────────┘       │
│  │  perm    │    │                                          │
│  │ workflow│    │                                          │
│  └──────────┘    │                                          │
├──────────────────┴──────────────────────────────────────────┤
│                    API 层 (api/modules/*.ts)                 │
│              业务接口函数（类型安全、拦截器）                 │
├─────────────────────────────────────────────────────────────┤
│              HTTP Client (api/client.ts)                     │
│         Axios 实例 + Token 刷新 + 请求取消                   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Pinia vs TanStack Query 职责划分

| 维度 | Pinia（客户端状态） | TanStack Query（服务端状态） |
|------|---------------------|------------------------------|
| **数据归属** | 浏览器本地生成（主题、侧边栏状态） | 服务器生成（用户列表、订单数据） |
| **生命周期** | 跟随应用运行 | 跟随组件挂载/卸载，可缓存 |
| **持久化** | pinia-plugin-persistedstate 自动持久化 | 不持久化（内存缓存，刷新即重置） |
| **更新方式** | 直接 mutation | 通过 `invalidateQueries` 触发重新请求 |
| **跨组件共享** | 全局 Store 实例 | Query Key 全局缓存 |
| **性能优化** | 响应式追踪 + computed | 请求去重 + 后台刷新 + 乐观更新 |
| **典型场景** | UI 状态、表单草稿、用户偏好、购物车 | 列表查询、详情查询、增删改操作 |

### 1.3 Store 设计原则

1. **使用 Setup Store 语法**：与 Composition API 语义一致，类型推导更友好
2. **纯函数优先**：复杂逻辑抽离到 Composables 或 utils，Store 只负责状态聚合
3. **Action 原子化**：每个 Action 只做一件事，避免"万能 Action"
4. **避免 Store 互相引用**：通过 Composables 或事件总线解耦跨 Store 通信
5. **类型导出**：每个 Store 导出 `_ReturnType`，用于外部类型引用

---

## 二、Pinia 核心 Store 实现

### 2.1 Store 类型定义

```typescript
// src/stores/types/index.ts

import type { Store } from 'pinia'

/**
 * Store 通用类型导出
 * 用于 Composables 中注入 Store 实例时的类型标注
 */

/** Auth Store 返回类型（用于延迟导入避免循环依赖） */
export type AuthStore = ReturnType<typeof import('../auth')['useAuthStore']>

/** App Store 返回类型 */
export type AppStore = ReturnType<typeof import('../app')['useAppStore']>

/** Permission Store 返回类型 */
export type PermissionStore = ReturnType<typeof import('../permission')['usePermissionStore']>

/** User Store 返回类型 */
export type UserStore = ReturnType<typeof import('../user')['useUserStore']>

/** Workflow Store 返回类型 */
export type WorkflowStore = ReturnType<typeof import('../workflow')['useWorkflowStore']>

/**
 * 通用 Store 状态接口
 */
export interface BaseState {
  /** 是否正在加载 */
  loading: boolean
  /** 错误信息 */
  error: string | null
}
```

### 2.2 Auth Store — 认证状态

```typescript
// src/stores/auth.ts

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  getAccessToken,
  setAccessToken,
  setRefreshToken,
  clearTokens,
} from '@/utils/token'
import { login, logout, getUserInfo } from '@/api/modules/auth'
import type { LoginParams, UserInfo } from '@/types/auth'

/**
 * Auth Store — 认证与用户状态管理
 *
 * 设计要点：
 * - Token 存取通过 utils/token.ts 纯函数，避免循环依赖
 * - 登录成功后同步更新 Token 和用户信息
 * - 登出时清理所有状态并跳转登录页
 */
export const useAuthStore = defineStore('auth', () => {
  // ==================== State ====================

  /** Access Token（内存镜像，持久化由 token.ts 负责） */
  const accessToken = ref<string | null>(getAccessToken())

  /** 当前用户信息 */
  const userInfo = ref<UserInfo | null>(null)

  /** 是否正在登录中 */
  const isLoggingIn = ref(false)

  /** 用户权限编码列表（用于按钮级权限 v-permission） */
  const permissions = ref<string[]>([])

  // ==================== Getters ====================

  /** 是否已登录 */
  const isLoggedIn = computed(() => !!accessToken.value)

  /** 用户姓名（优先显示 realName，回退 username） */
  const displayName = computed(() =>
    userInfo.value?.realName || userInfo.value?.username || '未知用户'
  )

  /** 用户头像 */
  const avatar = computed(() => userInfo.value?.avatar || '/default-avatar.png')

  /** 是否为管理员（roleCode 包含 admin） */
  const isAdmin = computed(() =>
    userInfo.value?.roles?.some((r) => r.code === 'admin') ?? false
  )

  // ==================== Actions ====================

  /**
   * 用户登录
   * @param params — 登录参数（username + password + captcha）
   */
  async function loginAction(params: LoginParams): Promise<void> {
    isLoggingIn.value = true
    try {
      const res = await login(params)
      const { token, refreshToken, user } = res.data

      // 同步更新 Token 到 localStorage
      setAccessToken(token)
      setRefreshToken(refreshToken)

      // 更新内存状态
      accessToken.value = token
      userInfo.value = user
      permissions.value = user.permissions ?? []

      // 记录登录时间
      userInfo.value.lastLoginAt = new Date().toISOString()
    } finally {
      isLoggingIn.value = false
    }
  }

  /**
   * 获取当前用户信息（Token 已存在时调用）
   * 用于页面刷新后恢复用户状态
   */
  async function fetchUserInfo(): Promise<void> {
    const token = getAccessToken()
    if (!token) return

    try {
      const res = await getUserInfo()
      userInfo.value = res.data
      permissions.value = res.data.permissions ?? []
      accessToken.value = token // 确保内存状态同步
    } catch {
      // Token 失效或过期，执行登出
      await logoutAction()
    }
  }

  /**
   * 用户登出
   * 清理 Token、用户信息、权限，并重定向到登录页
   */
  async function logoutAction(): Promise<void> {
    try {
      // 调用后端登出接口（可选，用于服务端清理 Session）
      await logout()
    } catch {
      // 忽略后端登出失败，强制本地清理
    } finally {
      clearTokens()
      accessToken.value = null
      userInfo.value = null
      permissions.value = []

      // 使用 router 跳转（避免 window.location 导致页面刷新）
      const router = useRouter()
      await router.replace('/auth/login')
    }
  }

  /**
   * 更新用户信息（局部更新）
   */
  function updateUserInfo(partial: Partial<UserInfo>): void {
    if (userInfo.value) {
      Object.assign(userInfo.value, partial)
    }
  }

  /**
   * 更新权限列表（角色变更后调用）
   */
  function setPermissions(newPermissions: string[]): void {
    permissions.value = newPermissions
  }

  return {
    // State
    accessToken,
    userInfo,
    isLoggingIn,
    permissions,

    // Getters
    isLoggedIn,
    displayName,
    avatar,
    isAdmin,

    // Actions
    loginAction,
    fetchUserInfo,
    logoutAction,
    updateUserInfo,
    setPermissions,
  }
})
```

### 2.3 App Store — 应用级 UI 状态

```typescript
// src/stores/app.ts

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type Language = 'zh-CN' | 'en-US'

/**
 * App Store — 应用级 UI 状态管理
 *
 * 设计要点：
 * - 纯客户端状态，不涉及服务端数据
 * - 通过 pinia-plugin-persistedstate 持久化到 localStorage
 * - 主题切换通过 CSS 变量 / Tailwind dark 模式实现
 */
export const useAppStore = defineStore('app', () => {
  // ==================== State ====================

  /** 侧边栏折叠状态 */
  const sidebarCollapsed = ref(false)

  /** 当前主题模式 */
  const themeMode = ref<ThemeMode>('light')

  /** 当前语言 */
  const language = ref<Language>('zh-CN')

  /** 是否显示全局 Loading（用于路由切换等场景） */
  const globalLoading = ref(false)

  /** 面包屑导航数据 */
  const breadcrumbs = ref<Array<{ title: string; path?: string }>>([])

  /** 已打开的页面标签页 */
  const visitedViews = ref<Array<{ name: string; path: string; title: string }>>([])

  // ==================== Getters ====================

  /** 实际生效的主题（auto 时根据系统偏好决定） */
  const effectiveTheme = computed<Exclude<ThemeMode, 'auto'>>(() => {
    if (themeMode.value !== 'auto') return themeMode.value
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  })

  /** 是否为暗色主题 */
  const isDark = computed(() => effectiveTheme.value === 'dark')

  // ==================== Actions ====================

  /** 切换侧边栏折叠状态 */
  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  /** 设置主题模式 */
  function setTheme(mode: ThemeMode): void {
    themeMode.value = mode
    applyTheme(mode)
  }

  /** 设置语言 */
  function setLanguage(lang: Language): void {
    language.value = lang
    // 同步更新 i18n 实例
    // import('@/plugins/i18n').then(({ i18n }) => { i18n.global.locale.value = lang })
  }

  /** 显示/隐藏全局 Loading */
  function setGlobalLoading(loading: boolean): void {
    globalLoading.value = loading
  }

  /** 设置面包屑 */
  function setBreadcrumbs(items: Array<{ title: string; path?: string }>): void {
    breadcrumbs.value = items
  }

  /** 添加已访问页面 */
  function addVisitedView(view: { name: string; path: string; title: string }): void {
    if (!visitedViews.value.some((v) => v.path === view.path)) {
      visitedViews.value.push(view)
    }
  }

  /** 移除已访问页面 */
  function removeVisitedView(path: string): void {
    visitedViews.value = visitedViews.value.filter((v) => v.path !== path)
  }

  /** 应用主题到 DOM */
  function applyTheme(mode: ThemeMode): void {
    const html = document.documentElement
    if (mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
  }

  return {
    sidebarCollapsed,
    themeMode,
    language,
    globalLoading,
    breadcrumbs,
    visitedViews,
    effectiveTheme,
    isDark,
    toggleSidebar,
    setTheme,
    setLanguage,
    setGlobalLoading,
    setBreadcrumbs,
    addVisitedView,
    removeVisitedView,
    applyTheme,
  }
})
```

### 2.4 Permission Store — 权限与动态路由

```typescript
// src/stores/permission.ts

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { getRolePermissions, getMenuTree } from '@/api/modules/permission'
import type { MenuItem, PermissionTree } from '@/types/permission'

/**
 * Permission Store — 权限与动态路由管理
 *
 * 设计要点：
 * - 从后端获取权限树和菜单结构
 * - 根据权限过滤路由，生成动态路由表
 * - 提供按钮级权限检查函数
 * - 与数据库 roles / permissions 表严格映射
 */
export const usePermissionStore = defineStore('permission', () => {
  // ==================== State ====================

  /** 菜单树（用于侧边栏渲染） */
  const menuTree = ref<MenuItem[]>([])

  /** 权限编码列表（扁平化，用于 v-permission 指令） */
  const permissionCodes = ref<string[]>([])

  /** 权限树（层级结构，用于角色配置界面） */
  const permissionTree = ref<PermissionTree[]>([])

  /** 动态路由是否已生成 */
  const isRoutesGenerated = ref(false)

  /** 动态路由表 */
  const dynamicRoutes = ref<RouteRecordRaw[]>([])

  // ==================== Getters ====================

  /** 扁平化的菜单列表（用于搜索、权限检查） */
  const flatMenus = computed<MenuItem[]>(() => flattenMenus(menuTree.value))

  /** 当前用户是否为超级管理员 */
  const isSuperAdmin = computed(() => permissionCodes.value.includes('*:*:*'))

  // ==================== Actions ====================

  /**
   * 获取权限数据（菜单树 + 权限树）
   * 登录成功后或页面刷新时调用
   */
  async function fetchPermissions(): Promise<void> {
    const [menuRes, permRes] = await Promise.all([
      getMenuTree(),
      getRolePermissions(),
    ])

    menuTree.value = menuRes.data
    permissionTree.value = permRes.data.tree
    permissionCodes.value = permRes.data.codes
  }

  /**
   * 检查是否拥有指定权限
   * @param code — 权限编码（如 'user:create'）
   * @returns 是否有权限
   */
  function hasPermission(code: string): boolean {
    if (isSuperAdmin.value) return true
    return permissionCodes.value.includes(code)
  }

  /**
   * 检查是否拥有任意一个权限
   */
  function hasAnyPermission(codes: string[]): boolean {
    if (isSuperAdmin.value) return true
    return codes.some((code) => permissionCodes.value.includes(code))
  }

  /**
   * 检查是否拥有所有权限
   */
  function hasAllPermissions(codes: string[]): boolean {
    if (isSuperAdmin.value) return true
    return codes.every((code) => permissionCodes.value.includes(code))
  }

  /**
   * 生成动态路由
   * @param asyncRoutes — 预定义的所有异步路由（未过滤）
   */
  function generateRoutes(asyncRoutes: RouteRecordRaw[]): RouteRecordRaw[] {
    const accessedRoutes = filterAsyncRoutes(asyncRoutes, permissionCodes.value)
    dynamicRoutes.value = accessedRoutes
    isRoutesGenerated.value = true
    return accessedRoutes
  }

  /**
   * 重置权限状态（登出时调用）
   */
  function resetPermissions(): void {
    menuTree.value = []
    permissionCodes.value = []
    permissionTree.value = []
    dynamicRoutes.value = []
    isRoutesGenerated.value = false
  }

  return {
    menuTree,
    permissionCodes,
    permissionTree,
    isRoutesGenerated,
    dynamicRoutes,
    flatMenus,
    isSuperAdmin,
    fetchPermissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    generateRoutes,
    resetPermissions,
  }
})

// ==================== 工具函数 ====================

/**
 * 递归过滤异步路由（根据权限编码）
 */
function filterAsyncRoutes(
  routes: RouteRecordRaw[],
  permissions: string[]
): RouteRecordRaw[] {
  const res: RouteRecordRaw[] = []

  for (const route of routes) {
    const tmp = { ...route }

    // 如果路由没有设置 permission 元数据，则默认允许访问
    if (!tmp.meta?.permission) {
      if (tmp.children) {
        tmp.children = filterAsyncRoutes(tmp.children, permissions)
      }
      res.push(tmp)
    } else if (hasPermission(tmp.meta.permission as string, permissions)) {
      if (tmp.children) {
        tmp.children = filterAsyncRoutes(tmp.children, permissions)
      }
      res.push(tmp)
    }
  }

  return res
}

/**
 * 扁平化菜单树
 */
function flattenMenus(menus: MenuItem[], result: MenuItem[] = []): MenuItem[] {
  for (const menu of menus) {
    result.push(menu)
    if (menu.children) {
      flattenMenus(menu.children, result)
    }
  }
  return result
}

/**
 * 权限检查辅助函数（非 computed 场景使用）
 */
function hasPermission(code: string, permissions: string[]): boolean {
  return permissions.includes('*:*:*') || permissions.includes(code)
}
```

### 2.5 User Store — 用户管理状态

```typescript
// src/stores/user.ts

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { UserEntity, UserStatus } from '@/types/user'

/**
 * User Store — 用户管理相关状态
 *
 * 设计要点：
 * - 管理"当前正在编辑的用户"等临时状态
 * - 用户列表数据由 TanStack Query 缓存，不存入 Pinia
 * - 与数据库 users 表实体映射
 */
export const useUserStore = defineStore('user', () => {
  // ==================== State ====================

  /** 当前正在编辑的用户（用于表单回填） */
  const currentEditUser = ref<UserEntity | null>(null)

  /** 用户表单草稿（未提交前的临时数据） */
  const userFormDraft = ref<Partial<UserEntity>>({})

  /** 选中的用户 ID 列表（批量操作） */
  const selectedUserIds = ref<number[]>([])

  /** 用户筛选条件缓存（返回列表页时恢复） */
  const filterCache = ref({
    keyword: '',
    status: undefined as UserStatus | undefined,
    departmentId: undefined as number | undefined,
  })

  // ==================== Actions ====================

  /** 设置当前编辑用户 */
  function setCurrentEditUser(user: UserEntity | null): void {
    currentEditUser.value = user
    // 同时初始化表单草稿
    userFormDraft.value = user ? { ...user } : {}
  }

  /** 更新表单草稿 */
  function updateFormDraft(field: keyof UserEntity, value: unknown): void {
    userFormDraft.value[field] = value as never
  }

  /** 设置选中用户 */
  function setSelectedUserIds(ids: number[]): void {
    selectedUserIds.value = ids
  }

  /** 保存筛选条件 */
  function saveFilterCache(cache: typeof filterCache.value): void {
    filterCache.value = { ...cache }
  }

  /** 清空所有临时状态 */
  function clearTempState(): void {
    currentEditUser.value = null
    userFormDraft.value = {}
    selectedUserIds.value = []
  }

  return {
    currentEditUser,
    userFormDraft,
    selectedUserIds,
    filterCache,
    setCurrentEditUser,
    updateFormDraft,
    setSelectedUserIds,
    saveFilterCache,
    clearTempState,
  }
})
```

### 2.6 Workflow Store — 工作流状态

```typescript
// src/stores/workflow.ts

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { WorkflowTemplate, WorkflowInstance } from '@/types/workflow'

/**
 * Workflow Store — 工作流相关状态
 *
 * 设计要点：
 * - 管理工作流设计器的临时状态（节点位置、连接线）
 * - 工作流实例列表由 TanStack Query 管理
 * - 设计器撤销/重做历史由独立 Composable 管理（不放入 Store）
 */
export const useWorkflowStore = defineStore('workflow', () => {
  // ==================== State ====================

  /** 当前正在设计的模板 */
  const currentTemplate = ref<WorkflowTemplate | null>(null)

  /** 设计器是否已修改（未保存提示） */
  const isDesignDirty = ref(false)

  /** 当前选中的节点 ID */
  const selectedNodeId = ref<string | null>(null)

  /** 审批意见草稿 */
  const approvalCommentDraft = ref('')

  // ==================== Actions ====================

  /** 加载模板到设计器 */
  function loadTemplate(template: WorkflowTemplate): void {
    currentTemplate.value = JSON.parse(JSON.stringify(template)) // 深拷贝
    isDesignDirty.value = false
    selectedNodeId.value = null
  }

  /** 标记设计器已修改 */
  function markAsDirty(): void {
    isDesignDirty.value = true
  }

  /** 保存设计（成功后清除 dirty 标记） */
  function markAsSaved(): void {
    isDesignDirty.value = false
  }

  /** 选择节点 */
  function selectNode(nodeId: string | null): void {
    selectedNodeId.value = nodeId
  }

  /** 更新审批意见草稿 */
  function setApprovalComment(comment: string): void {
    approvalCommentDraft.value = comment
  }

  /** 清空工作流状态 */
  function resetWorkflow(): void {
    currentTemplate.value = null
    isDesignDirty.value = false
    selectedNodeId.value = null
    approvalCommentDraft.value = ''
  }

  return {
    currentTemplate,
    isDesignDirty,
    selectedNodeId,
    approvalCommentDraft,
    loadTemplate,
    markAsDirty,
    markAsSaved,
    selectNode,
    setApprovalComment,
    resetWorkflow,
  }
})
```

### 2.7 Store 统一导出

```typescript
// src/stores/index.ts

import { createPinia } from 'pinia'
import type { App } from 'vue'

// 导出 Store
export { useAuthStore } from './auth'
export { useAppStore } from './app'
export { usePermissionStore } from './permission'
export { useUserStore } from './user'
export { useWorkflowStore } from './workflow'

// 导出类型
export type * from './types'

/**
 * 初始化 Pinia（在 main.ts 中调用）
 * @param app — Vue 应用实例
 */
export function setupPinia(app: App): void {
  const pinia = createPinia()
  app.use(pinia)
}
```

---

## 三、Composables 最佳实践

### 3.1 useAuth — 认证逻辑封装

```typescript
// src/composables/useAuth.ts

import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

/**
 * useAuth — 认证相关逻辑的组合式函数
 *
 * 作用：
 * - 为组件提供简洁的认证状态访问接口
 * - 封装登录/登出的调用逻辑
 * - 避免组件直接操作 Store 的复杂细节
 *
 * 使用场景：
 * - 页面顶部用户下拉菜单
 * - 登录表单组件
 * - 需要判断登录状态的业务组件
 */
export function useAuth() {
  const authStore = useAuthStore()

  return {
    // 状态（只读）
    isLoggedIn: computed(() => authStore.isLoggedIn),
    userInfo: computed(() => authStore.userInfo),
    displayName: computed(() => authStore.displayName),
    avatar: computed(() => authStore.avatar),
    isAdmin: computed(() => authStore.isAdmin),
    isLoggingIn: computed(() => authStore.isLoggingIn),
    permissions: computed(() => authStore.permissions),

    // 方法
    login: authStore.loginAction,
    logout: authStore.logoutAction,
    fetchUserInfo: authStore.fetchUserInfo,
  }
}
```

### 3.2 usePermission — 权限检查

```typescript
// src/composables/usePermission.ts

import { computed } from 'vue'
import { usePermissionStore } from '@/stores/permission'

/**
 * usePermission — 权限检查组合式函数
 *
 * 作用：
 * - 提供按钮级、路由级权限检查
 * - 与 v-permission 指令协同
 * - 支持单一权限、任意权限、所有权限三种模式
 */
export function usePermission() {
  const permStore = usePermissionStore()

  /**
   * 检查是否拥有指定权限
   */
  const has = computed(() => (code: string) => permStore.hasPermission(code))

  /**
   * 检查是否拥有任意一个权限
   */
  const hasAny = computed(() => (codes: string[]) => permStore.hasAnyPermission(codes))

  /**
   * 检查是否拥有所有权限
   */
  const hasAll = computed(() => (codes: string[]) => permStore.hasAllPermissions(codes))

  /**
   * 菜单树（用于侧边栏渲染）
   */
  const menus = computed(() => permStore.menuTree)

  /**
   * 是否超级管理员
   */
  const isSuperAdmin = computed(() => permStore.isSuperAdmin)

  return {
    has,
    hasAny,
    hasAll,
    menus,
    isSuperAdmin,
  }
}
```

### 3.3 useTable — 通用表格逻辑

```typescript
// src/composables/useTable.ts

import { ref, computed, watch, type Ref } from 'vue'
import type { PageQuery, PageResult } from '@/types/api'

interface UseTableOptions<T> {
  /** 初始分页参数 */
  initialQuery?: Partial<PageQuery>
  /** 获取数据的方法 */
  fetchData: (query: PageQuery) => Promise<PageResult<T>>
  /** 是否立即请求（默认 true） */
  immediate?: boolean
}

/**
 * useTable — 通用表格分页/排序/筛选逻辑
 *
 * 作用：
 * - 封装分页状态管理（当前页、每页条数）
 * - 封装排序和筛选状态
 * - 提供手动刷新、重置功能
 * - Loading 状态自动管理
 *
 * 注意：数据获取逻辑与 TanStack Query 解耦，
 * 若需要缓存请改用 useQuery + useMutation
 */
export function useTable<T>(options: UseTableOptions<T>) {
  const { initialQuery = {}, fetchData, immediate = true } = options

  // ==================== State ====================

  const query = ref<PageQuery>({
    page: 1,
    pageSize: 10,
    sortField: undefined,
    sortOrder: undefined,
    ...initialQuery,
  })

  const data = ref<T[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref<Error | null>(null)

  // ==================== Computed ====================

  const pagination = computed(() => ({
    current: query.value.page,
    pageSize: query.value.pageSize,
    total: total.value,
    showSizeChanger: true,
    showTotal: (total: number) => `共 ${total} 条`,
  }))

  // ==================== Methods ====================

  async function loadData(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result = await fetchData(query.value)
      data.value = result.list
      total.value = result.total
    } catch (err) {
      error.value = err as Error
      data.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  /** 切换页码 */
  function handlePageChange(page: number): void {
    query.value.page = page
  }

  /** 切换每页条数 */
  function handlePageSizeChange(pageSize: number): void {
    query.value.pageSize = pageSize
    query.value.page = 1
  }

  /** 切换排序 */
  function handleSortChange(field: string, order: 'asc' | 'desc' | null): void {
    query.value.sortField = order ? field : undefined
    query.value.sortOrder = order ?? undefined
    query.value.page = 1
  }

  /** 重置查询条件 */
  function resetQuery(): void {
    query.value = {
      page: 1,
      pageSize: 10,
      sortField: undefined,
      sortOrder: undefined,
      ...initialQuery,
    }
  }

  /** 刷新当前页 */
  function refresh(): void {
    loadData()
  }

  // ==================== Watch ====================

  // query 变化时自动请求数据
  watch(
    () => ({ ...query.value }),
    () => loadData(),
    { deep: true, immediate }
  )

  return {
    query,
    data,
    total,
    loading,
    error,
    pagination,
    loadData,
    handlePageChange,
    handlePageSizeChange,
    handleSortChange,
    resetQuery,
    refresh,
  }
}
```

### 3.4 useForm — 通用表单逻辑

```typescript
// src/composables/useForm.ts

import { ref, reactive, type UnwrapRef } from 'vue'
import type { ZodSchema } from 'zod'

interface UseFormOptions<T extends Record<string, unknown>> {
  /** 初始表单值 */
  initialValues: T
  /** Zod 校验 Schema（可选） */
  schema?: ZodSchema<T>
  /** 提交处理函数 */
  onSubmit: (values: T) => Promise<void> | void
  /** 提交成功后重置表单（默认 true） */
  resetOnSuccess?: boolean
}

/**
 * useForm — 通用表单状态管理
 *
 * 作用：
 * - 管理表单值、错误、提交状态
 * - 集成 Zod 校验（可选）
 * - 提供提交、重置、字段更新方法
 */
export function useForm<T extends Record<string, unknown>>(options: UseFormOptions<T>) {
  const { initialValues, schema, onSubmit, resetOnSuccess = true } = options

  const form = reactive<T>({ ...initialValues })
  const errors = ref<Record<string, string>>({})
  const isSubmitting = ref(false)
  const isDirty = ref(false)

  /**
   * 更新字段值
   */
  function setFieldValue<K extends keyof T>(field: K, value: T[K]): void {
    ;(form as UnwrapRef<T>)[field as string] = value as never
    isDirty.value = true
    // 清除该字段的错误
    if (errors.value[field as string]) {
      delete errors.value[field as string]
    }
  }

  /**
   * 校验单个字段
   */
  function validateField(field: keyof T): boolean {
    if (!schema) return true
    try {
      const fieldSchema = (schema as any).shape?.[field as string]
      if (fieldSchema) {
        fieldSchema.parse(form[field])
      }
      delete errors.value[field as string]
      return true
    } catch (err: any) {
      errors.value[field as string] = err.errors?.[0]?.message ?? '校验失败'
      return false
    }
  }

  /**
   * 校验全部字段
   */
  function validateAll(): boolean {
    if (!schema) return true
    try {
      schema.parse(form)
      errors.value = {}
      return true
    } catch (err: any) {
      const fieldErrors: Record<string, string> = {}
      err.errors?.forEach((e: any) => {
        const field = e.path[0]
        if (!fieldErrors[field]) {
          fieldErrors[field] = e.message
        }
      })
      errors.value = fieldErrors
      return false
    }
  }

  /**
   * 提交表单
   */
  async function submit(): Promise<void> {
    if (!validateAll()) return

    isSubmitting.value = true
    try {
      await onSubmit({ ...form } as T)
      if (resetOnSuccess) {
        reset()
      }
    } finally {
      isSubmitting.value = false
    }
  }

  /**
   * 重置表单
   */
  function reset(): void {
    Object.assign(form, initialValues)
    errors.value = {}
    isDirty.value = false
  }

  return {
    form,
    errors,
    isSubmitting,
    isDirty,
    setFieldValue,
    validateField,
    validateAll,
    submit,
    reset,
  }
}
```

### 3.5 useLoading — 全局 Loading 管理

```typescript
// src/composables/useLoading.ts

import { ref, computed } from 'vue'

/**
 * 全局 Loading 计数器（支持多请求并发场景）
 */
const loadingCount = ref(0)

/**
 * useLoading — 全局 Loading 状态管理
 *
 * 作用：
 * - 支持多个并发请求的 Loading 计数
 * - 自动在第一个请求开始时显示，最后一个请求结束时隐藏
 * - 与 appStore.globalLoading 协同
 *
 * 使用场景：
 * - 路由切换时的全局遮罩
 * - 多个并行 API 请求的 Loading 统一管理
 */
export function useLoading() {
  const isLoading = computed(() => loadingCount.value > 0)

  /**
   * 开始 Loading（计数 +1）
   */
  function startLoading(): void {
    loadingCount.value++
  }

  /**
   * 结束 Loading（计数 -1）
   */
  function stopLoading(): void {
    if (loadingCount.value > 0) {
      loadingCount.value--
    }
  }

  /**
   * 包裹异步函数，自动管理 Loading
   */
  async function withLoading<T>(fn: () => Promise<T>): Promise<T> {
    startLoading()
    try {
      return await fn()
    } finally {
      stopLoading()
    }
  }

  return {
    isLoading,
    startLoading,
    stopLoading,
    withLoading,
  }
}
```

### 3.6 Composables 统一导出

```typescript
// src/composables/index.ts

export { useAuth } from './useAuth'
export { usePermission } from './usePermission'
export { useTable } from './useTable'
export { useForm } from './useForm'
export { useLoading } from './useLoading'
export { useRequest } from './useRequest'
export { useFormValidation } from './useFormValidation'

// TanStack Query 业务 Composables
export { useUserList, useCreateUser, useUpdateUser, useDeleteUser } from './useUserList'
```

---

## 四、Pinia 与 TanStack Query 协同策略

### 4.1 职责边界对照表

| 数据类型 | 推荐方案 | 状态归属 | 持久化 | 示例 |
|----------|----------|----------|--------|------|
| 用户列表（分页） | TanStack Query `useQuery` | 服务端 | 否 | `useUserList()` |
| 当前登录用户 | Pinia `authStore` | 客户端 | 是（Token） | `useAuthStore()` |
| 用户详情（查看页） | TanStack Query `useQuery` | 服务端 | 否 | `useQuery({ queryKey: ['user', id] })` |
| 创建/更新/删除 | TanStack Query `useMutation` | 服务端 | 否 | `useCreateUser()` |
| 主题/语言 | Pinia `appStore` | 客户端 | 是 | `useAppStore()` |
| 表单草稿 | Pinia `userStore` | 客户端 | 是 | `useUserStore()` |
| 侧边栏折叠 | Pinia `appStore` | 客户端 | 是 | `useAppStore()` |
| 菜单/权限树 | Pinia `permissionStore` | 客户端 | 否（登录时重新获取） | `usePermissionStore()` |
| 工作流设计器状态 | Pinia `workflowStore` | 客户端 | 是 | `useWorkflowStore()` |
| 审批意见草稿 | Pinia `workflowStore` | 客户端 | 是 | `useWorkflowStore()` |

### 4.2 协同模式示例

```typescript
// src/composables/useUserList.ts（与 API 层文档一致，补充 Pinia 交互）

import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { getUserList, createUser } from '@/api/modules/user'
import { queryKeys } from '@/api/keys'
import { useUserStore } from '@/stores/user'
import type { PageQuery, CreateUserParams } from '@/types/api'
import type { Ref } from 'vue'

export function useUserList(params: Ref<PageQuery & { keyword?: string }>) {
  const userStore = useUserStore()

  const query = useQuery({
    queryKey: computed(() => queryKeys.users.list(params.value)),
    queryFn: () => getUserList(params.value),
    select: (res) => res.data,
  })

  return {
    users: computed(() => query.data.value?.list ?? []),
    total: computed(() => query.data.value?.total ?? 0),
    loading: computed(() => query.isLoading.value),
    // 恢复上次筛选条件
    restoreFilter: () => {
      params.value = { ...params.value, ...userStore.filterCache }
    },
  }
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  const userStore = useUserStore()

  return useMutation({
    mutationFn: (data: CreateUserParams) => createUser(data),
    onSuccess: () => {
      // 1. 让 TanStack Query 重新获取列表
      queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })
      // 2. 清空 Pinia 中的表单草稿
      userStore.userFormDraft = {}
    },
  })
}
```

### 4.3 避免 Store 与 Query 冲突的原则

1. **不重复缓存**：服务端数据优先使用 TanStack Query 缓存，不存入 Pinia
2. **Pinia 存"元数据"**：如筛选条件、选中项、草稿等客户端生成的状态
3. **Mutation 后双更新**：`useMutation.onSuccess` 中同时 `invalidateQueries` + 清理 Pinia 临时状态
4. **Token 不在 Query 中管理**：登录态由 Pinia + `utils/token.ts` 管理，Query 不感知认证状态

---

## 五、持久化插件配置

### 5.1 安装

```bash
npm install pinia-plugin-persistedstate@^4.0.0
```

### 5.2 插件配置

```typescript
// src/plugins/pinia.ts

import { createPinia, type Pinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import type { App } from 'vue'

/**
 * Pinia 初始化（含持久化插件）
 *
 * 持久化策略：
 * - auth.accessToken → 不持久化（由 utils/token.ts 管理 localStorage）
 * - app.sidebarCollapsed / themeMode / language → 持久化到 localStorage
 * - user.userFormDraft → 持久化（页面刷新后恢复草稿）
 * - workflow.approvalCommentDraft → 持久化
 */
export function setupPinia(app: App): void {
  const pinia = createPinia()

  pinia.use(
    piniaPluginPersistedstate({
      // 全局默认存储方式
      storage: localStorage,
      // 序列化（默认 JSON.stringify/parse）
      serializer: {
        serialize: JSON.stringify,
        deserialize: JSON.parse,
      },
    })
  )

  app.use(pinia)
}
```

### 5.3 Store 级持久化配置

```typescript
// src/stores/app.ts — 添加 persist 配置

export const useAppStore = defineStore(
  'app',
  () => {
    // ... Setup Store 实现
    return {
      sidebarCollapsed,
      themeMode,
      language,
      globalLoading,
      breadcrumbs,
      visitedViews,
      // ... actions
    }
  },
  {
    persist: {
      // 只持久化这些字段
      paths: ['sidebarCollapsed', 'themeMode', 'language', 'visitedViews'],
      // 使用 sessionStorage（标签页关闭后清除）
      // storage: sessionStorage,
    },
  }
)
```

```typescript
// src/stores/user.ts — 添加 persist 配置

export const useUserStore = defineStore(
  'user',
  () => {
    // ... Setup Store 实现
    return {
      currentEditUser,
      userFormDraft,
      selectedUserIds,
      filterCache,
      // ... actions
    }
  },
  {
    persist: {
      paths: ['userFormDraft', 'filterCache'],
    },
  }
)
```

```typescript
// src/stores/auth.ts — 不持久化 Token（由 utils/token.ts 管理）

export const useAuthStore = defineStore(
  'auth',
  () => {
    // ... Setup Store 实现
    return {
      accessToken,
      userInfo,
      permissions,
      // ... getters / actions
    }
  },
  {
    persist: {
      // 只持久化 userInfo 和 permissions（Token 不存）
      paths: ['userInfo', 'permissions'],
      // 可选：使用自定义序列化排除敏感字段
      beforeRestore: (context) => {
        // 恢复前检查 Token 是否存在，若不存在则清空用户状态
        const token = localStorage.getItem('access_token')
        if (!token) {
          context.store.$reset()
        }
      },
    },
  }
)
```

---

## 六、与路由守卫和 Layout 的集成

### 6.1 路由守卫（使用 getAccessToken 避免循环依赖）

```typescript
// src/router/guards.ts

import type { Router, NavigationGuardNext, RouteLocationNormalized } from 'vue-router'
import { getAccessToken } from '@/utils/token'
import { useAuthStore } from '@/stores/auth'
import { usePermissionStore } from '@/stores/permission'

/**
 * 设置路由导航守卫
 * @param router — Vue Router 实例
 */
export function setupRouterGuards(router: Router): void {
  // 白名单（无需登录即可访问）
  const whiteList = ['/auth/login', '/auth/register', '/auth/forget-password', '/404']

  router.beforeEach(
    async (
      to: RouteLocationNormalized,
      from: RouteLocationNormalized,
      next: NavigationGuardNext
    ) => {
      // 设置页面标题
      document.title = to.meta?.title
        ? `${to.meta.title} - Vue3 Admin`
        : 'Vue3 Admin'

      const hasToken = getAccessToken() // 使用纯函数，不依赖 Pinia

      if (hasToken) {
        // 已登录，访问登录页则重定向到首页
        if (to.path === '/auth/login') {
          next({ path: '/' })
          return
        }

        const authStore = useAuthStore()
        const permStore = usePermissionStore()

        // 如果用户信息未加载，先获取
        if (!authStore.userInfo) {
          try {
            await authStore.fetchUserInfo()
          } catch {
            next('/auth/login')
            return
          }
        }

        // 如果权限未加载，先获取
        if (!permStore.isRoutesGenerated) {
          try {
            await permStore.fetchPermissions()
            // 生成动态路由
            const accessedRoutes = permStore.generateRoutes(
              (await import('./modules')).asyncRoutes
            )
            accessedRoutes.forEach((route) => router.addRoute(route))
            next({ ...to, replace: true })
            return
          } catch {
            await authStore.logoutAction()
            next('/auth/login')
            return
          }
        }

        next()
      } else {
        // 未登录
        if (whiteList.includes(to.path)) {
          next()
        } else {
          next(`/auth/login?redirect=${encodeURIComponent(to.fullPath)}`)
        }
      }
    }
  )

  router.afterEach(() => {
    // 关闭全局 Loading
    // const appStore = useAppStore()
    // appStore.setGlobalLoading(false)
  })
}
```

### 6.2 Layout 组件集成示例

```vue
<!-- src/components/layout/LayoutDefault.vue -->

<template>
  <div class="layout-default" :class="{ collapsed: appStore.sidebarCollapsed }">
    <LayoutSidebar :menus="permStore.menuTree" :collapsed="appStore.sidebarCollapsed" />
    <div class="layout-main">
      <LayoutHeader
        :user-info="authStore.userInfo"
        :sidebar-collapsed="appStore.sidebarCollapsed"
        @toggle-sidebar="appStore.toggleSidebar"
        @logout="authStore.logoutAction"
      />
      <LayoutBreadcrumb :items="appStore.breadcrumbs" />
      <main class="layout-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { usePermissionStore } from '@/stores/permission'
import LayoutSidebar from './LayoutSidebar.vue'
import LayoutHeader from './LayoutHeader.vue'
import LayoutBreadcrumb from './LayoutBreadcrumb.vue'

const authStore = useAuthStore()
const appStore = useAppStore()
const permStore = usePermissionStore()
</script>

<style scoped lang="scss">
.layout-default {
  display: flex;
  min-height: 100vh;

  &.collapsed {
    .layout-sidebar {
      width: 64px;
    }
  }
}

.layout-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.layout-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
```

### 6.3 v-permission 指令集成

```typescript
// src/directives/permission.ts

import type { Directive, DirectiveBinding } from 'vue'
import { usePermissionStore } from '@/stores/permission'

/**
 * v-permission 权限指令
 * 用法：
 *   <button v-permission="'user:create'">创建用户</button>
 *   <button v-permission="['user:create', 'user:import']">创建或导入</button>
 */
export const permission: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string | string[]>) {
    const permStore = usePermissionStore()
    const { value } = binding

    const hasAuth = Array.isArray(value)
      ? permStore.hasAnyPermission(value)
      : permStore.hasPermission(value)

    if (!hasAuth) {
      el.parentNode?.removeChild(el)
    }
  },
}
```

---

## 七、Store 类型定义最佳实践

### 7.1 类型推导辅助

```typescript
// src/stores/types/index.ts

import type { Store, StoreDefinition } from 'pinia'

/**
 * 从 Store Definition 推导 Store 实例类型
 * 用法：const store: StoreInstance<typeof useAuthStore>
 */
export type StoreInstance<T extends StoreDefinition> = T extends StoreDefinition<
  infer Id,
  infer S,
  infer G,
  infer A
>
  ? Store<Id, S, G, A>
  : never

/**
 * Store 模块导出类型映射
 * 用于需要延迟导入 Store 的场景（避免顶层 import 导致的循环依赖）
 */
export interface StoreRegistry {
  auth: typeof import('../auth')['useAuthStore']
  app: typeof import('../app')['useAppStore']
  permission: typeof import('../permission')['usePermissionStore']
  user: typeof import('../user')['useUserStore']
  workflow: typeof import('../workflow')['useWorkflowStore']
}
```

### 7.2 类型安全的使用示例

```typescript
// Composables 中延迟导入 Store（避免循环依赖）

import type { AuthStore } from '@/stores/types'

export function useSomething() {
  // 运行时导入，避免编译时循环依赖
  const authStore = inject<AuthStore>('authStore')
  // 或者使用 Pinia 的 storeToRefs
}
```

---

## 八、实施步骤与整合验证

### 8.1 依赖安装

```bash
# Pinia（Vue 3 状态管理）
npm install pinia@^2.3.0

# 持久化插件
npm install pinia-plugin-persistedstate@^4.0.0

# 工具库（若未安装）
npm install lodash-es@^4.17.0
npm install -D @types/lodash-es
```

### 8.2 文件创建清单

| 序号 | 文件路径 | 说明 |
|------|----------|------|
| 1 | `src/plugins/pinia.ts` | Pinia + 持久化插件初始化 |
| 2 | `src/stores/types/index.ts` | Store 类型定义与导出 |
| 3 | `src/stores/auth.ts` | 认证状态管理 |
| 4 | `src/stores/app.ts` | 应用 UI 状态管理 |
| 5 | `src/stores/permission.ts` | 权限与动态路由管理 |
| 6 | `src/stores/user.ts` | 用户管理临时状态 |
| 7 | `src/stores/workflow.ts` | 工作流设计器状态 |
| 8 | `src/stores/index.ts` | Store 统一导出 |
| 9 | `src/composables/useAuth.ts` | 认证逻辑 Composable |
| 10 | `src/composables/usePermission.ts` | 权限检查 Composable |
| 11 | `src/composables/useTable.ts` | 表格分页 Composable |
| 12 | `src/composables/useForm.ts` | 表单管理 Composable |
| 13 | `src/composables/useLoading.ts` | 全局 Loading Composable |
| 14 | `src/composables/index.ts` | Composables 统一导出 |
| 15 | `src/router/guards.ts` | 路由导航守卫（集成 Store） |
| 16 | `src/directives/permission.ts` | v-permission 指令 |

### 8.3 与已有配置整合

| 配置文件 | 整合内容 |
|----------|----------|
| `src/main.ts` | 确保 `setupPinia(app)` 在 `setupVueQuery(app)` 之前调用 |
| `vite.config.ts` | `optimizeDeps.include` 添加 `pinia`、`pinia-plugin-persistedstate` |
| `tsconfig.app.json` | `include` 包含 `src/stores/**/*.ts`、`src/composables/**/*.ts` |
| `src/api/client.ts` | 确认不直接 import 任何 Store（仅使用 `utils/token.ts`） |
| `src/router/index.ts` | 导入 `setupRouterGuards` 并调用 |
| `src/App.vue` | 根组件使用 `LayoutDefault`，Layout 内部消费 Store |

### 8.4 验证命令

```bash
# 1. TypeScript 类型检查
npm run type-check

# 2. 循环依赖检测
npx madge --circular --extensions ts,vue src/

# 3. 开发服务器启动
npm run dev

# 4. ESLint 检查
npm run lint

# 5. 生产构建
npm run build
```

### 8.5 常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `useAuthStore()` 报错 `getActivePinia was called with no active Pinia` | Pinia 未在 main.ts 中 `app.use(pinia)` 之前调用了 Store | 确保 `setupPinia(app)` 在 `createApp` 后第一个调用 |
| 页面刷新后用户状态丢失 | authStore 未正确持久化或 Token 已过期 | 检查 `pinia-plugin-persistedstate` 配置；确认 `utils/token.ts` 中的 Token 已正确存储 |
| 路由守卫中 `useAuthStore()` 报错 | Pinia 初始化之前执行了导航守卫 | 使用 `getAccessToken()` 纯函数替代 Store 检查（见 guards.ts） |
| `usePermission()` 返回的 menus 为空 | permissionStore 未调用 `fetchPermissions()` | 在路由守卫或登录成功后确保调用 `fetchPermissions()` |
| 循环依赖报错（Madge） | Store 之间互相 import | 将共享逻辑抽离到 Composables 或 utils，Store 只保留状态 |
| 持久化后 state 类型错误 | 持久化存储的 JSON 中 Date 对象被转为字符串 | 在恢复后手动转换或使用自定义 serializer |
| 主题切换不生效 | `dark` class 未正确添加到 `<html>` | 检查 `appStore.applyTheme()` 是否在 `setTheme` 中调用 |

---

> **总结**：本文档以 **Setup Store** 为核心语法风格，通过 `pinia-plugin-persistedstate` 实现客户端状态的自动持久化，通过 **Composables** 封装复杂逻辑并为组件提供简洁接口，通过 **纯函数 Token 层** 彻底消除与 API 层的循环依赖，通过 **路由守卫** 实现认证与权限的集中管控。Pinia 与 TanStack Query 形成互补：Pinia 管理 UI 状态和用户偏好，TanStack Query 管理服务端数据的获取、缓存与同步。所有实现均与《项目基础配置与 Vite 插件方案》和《API 层封装与数据建模规范》严格对齐。
