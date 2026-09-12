# API 层封装与数据建模规范（含后端数据库映射）

> 本文档面向中大型 Vue 3 项目的数据层工程化，覆盖 HTTP 客户端封装、类型安全、TanStack Query 集成、OpenAPI 自动代码生成、表单校验及安全策略。所有代码使用 TypeScript strict 模式，可直接复制到 Feature-Sliced Design 项目中使用。

---

## 目录

- [一、架构总览与分层原则](#一架构总览与分层原则)
- [二、通用 API 类型体系](#二通用-api-类型体系)
- [三、Token 服务与循环依赖解耦](#三token-服务与循环依赖解耦)
- [四、HTTP 客户端核心 `api/client.ts`](#四http-客户端核心-apiclientts)
- [五、业务 API 模块封装](#五业务-api-模块封装)
- [六、TanStack Query 集成与 Pinia 协同](#六tanstack-query-集成与-pinia-协同)
- [七、composables/useRequest 封装](#七composablesuserequest-封装)
- [八、表单校验策略（Zod）](#八表单校验策略zod)
- [九、OpenAPI 自动代码生成方案](#九openapi-自动代码生成方案)
- [十、前后端数据模型映射](#十前后端数据模型映射)
- [十一、安全考虑](#十一安全考虑)
- [十二、实施步骤与验证命令](#十二实施步骤与验证命令)

---

## 一、架构总览与分层原则

```
┌─────────────────────────────────────────────────────┐
│                  Vue Components / Views             │
│  (features/*/views/*.vue, components/business/*.vue)│
├─────────────────────────────────────────────────────┤
│           Composables (useRequest / useQuery)        │
│         组合式函数层：封装请求逻辑、Loading 状态      │
├─────────────────────────────────────────────────────┤
│           Pinia Stores (stores/*.ts)                 │
│         客户端状态层：UI 状态、缓存、用户偏好          │
├──────────────────┬──────────────────────────────────┤
│  TanStack Query   │         Pinia                    │
│  服务端状态缓存    │     客户端状态管理                 │
├──────────────────┴──────────────────────────────────┤
│           API Modules (api/modules/*.ts)            │
│         业务接口层：按模块拆分的 API 调用函数          │
├─────────────────────────────────────────────────────┤
│        HTTP Client (api/client.ts)                   │
│     Axios 实例：拦截器、Token 刷新、请求取消、错误处理  │
├─────────────────────────────────────────────────────┤
│        Token Service (utils/token.ts)                │
│     Token 存取：独立于 Pinia，避免循环依赖             │
├─────────────────────────────────────────────────────┤
│              Axios / Fetch → 后端 API                │
└─────────────────────────────────────────────────────┘
```

**分层原则**：

| 层 | 职责 | 可引用 |
|----|------|--------|
| `utils/token.ts` | Token 纯函数存取（localStorage） | 无依赖 |
| `api/client.ts` | Axios 实例 + 拦截器 | `utils/token.ts` |
| `api/modules/*.ts` | 业务接口函数 | `api/client.ts`、`types/*` |
| `composables/useRequest.ts` | 请求组合式函数 | `api/modules/*` |
| `composables/useQuery.ts` | TanStack Query 封装 | `api/modules/*` |
| `stores/*.ts` | Pinia 客户端状态 | `composables/*` |

**核心约束**：`api/client.ts` **禁止**直接 `import { useAuthStore }`，否则在 Pinia 初始化之前加载 API 模块时会触发循环依赖。Token 存取通过 `utils/token.ts` 纯函数解耦。

---

## 二、通用 API 类型体系

```typescript
// src/types/api.ts

/**
 * 通用 API 响应包装
 * 所有后端接口统一返回此结构，T 为业务数据类型
 */
export interface ApiResponse<T = unknown> {
  code: number       // 业务状态码（0 = 成功）
  message: string    // 提示信息
  data: T           // 业务数据载荷
  timestamp: number // 服务端时间戳
}

/**
 * 分页请求参数
 */
export interface PageQuery {
  page: number      // 当前页码（从 1 开始）
  pageSize: number  // 每页条数
  sortField?: string   // 排序字段
  sortOrder?: 'asc' | 'desc' // 排序方向
}

/**
 * 分页响应结果
 */
export interface PageResult<T> {
  list: T[]          // 数据列表
  total: number      // 总条数
  page: number       // 当前页
  pageSize: number   // 每页条数
  totalPages: number // 总页数
}

/**
 * 分页 API 响应（ApiResponse + PageResult 组合）
 */
export type PageResponse<T> = ApiResponse<PageResult<T>>

/**
 * 请求配置扩展（用于覆盖默认行为）
 */
export interface RequestOptions {
  /** 是否跳过全局错误提示（默认 false） */
  silent?: boolean
  /** 是否跳过 Token 注入（默认 false） */
  skipAuth?: boolean
  /** 自定义 AbortSignal（用于组件卸载时取消请求） */
  signal?: AbortSignal
  /** 请求超时时间（毫秒），覆盖全局配置 */
  timeout?: number
  /** 自定义错误处理器 */
  onError?: (error: ApiError) => void
}

/**
 * 标准化 API 错误
 */
export interface ApiError {
  code: number       // 业务错误码
  message: string    // 错误信息
  detail?: string    // 详细错误描述
  status: number     // HTTP 状态码
  isCanceled: boolean // 是否为用户主动取消
}

/**
 * ID 类型（根据后端数据库主键类型决定）
 */
export type ID = number | string

/**
 * 时间戳类型（统一使用 ISO 8601 字符串）
 */
export type ISODateString = string

/**
 * 空响应（用于 DELETE / PUT 等无返回体的接口）
 */
export type EmptyResponse = ApiResponse<null>
```

---

## 三、Token 服务与循环依赖解耦

### 3.1 问题分析

```
循环依赖链：
  main.ts → api/modules/auth.ts → api/client.ts → useAuthStore() → stores/auth.ts → api/modules/auth.ts
                                                                     ↑
                                                        Pinia 未初始化，报错！
```

`api/client.ts` 在拦截器中需要读取 Token，如果直接 `import { useAuthStore }`，则在 Pinia 尚未 `app.use(pinia)` 之前就会触发 Store 实例化，导致运行时报错。

### 3.2 解决方案：`utils/token.ts` 纯函数层

```typescript
// src/utils/token.ts

/** Token 在 localStorage 中的键名 */
const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'

/**
 * 获取 Access Token（纯函数，无副作用，不依赖 Pinia）
 * @returns Token 字符串，若不存在或已过期返回 null
 */
export function getAccessToken(): string | null {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (!token) return null

  // 可选：检查 Token 是否过期（JWT payload 解析）
  try {
    const payload = parseJwtPayload(token)
    // 提前 60 秒视为过期，避免临界状态
    if (payload.exp && payload.exp * 1000 - 60000 < Date.now()) {
      removeAccessToken()
      return null
    }
  } catch {
    // 非 JWT 格式，跳过过期检查
  }
  return token
}

/**
 * 设置 Access Token
 */
export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token)
}

/**
 * 移除 Access Token
 */
export function removeAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
}

/**
 * 获取 Refresh Token
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

/**
 * 设置 Refresh Token
 */
export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

/**
 * 清除所有 Token（登出时调用）
 */
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

/**
 * 解析 JWT payload（不验证签名，仅解码）
 */
function parseJwtPayload(token: string): { exp?: number; [key: string]: unknown } {
  const base64 = token.split('.')[1]
  if (!base64) throw new Error('Invalid JWT format')
  const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'))
  return JSON.parse(json)
}
```

**关键设计**：`utils/token.ts` 是纯函数，不 import 任何项目模块，`api/client.ts` 的拦截器直接调用 `getAccessToken()` 而非访问 Pinia Store，彻底切断循环依赖。Pinia `authStore` 的 `login()` / `logout()` 在执行自身逻辑后同步调用 `setAccessToken()` / `clearTokens()`，保持两边状态一致。

---

## 四、HTTP 客户端核心 `api/client.ts`

```typescript
// src/api/client.ts

import axios, {
  type AxiosInstance,
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { getAccessToken, getRefreshToken, setAccessToken, clearTokens } from '@/utils/token'
import type { ApiResponse, ApiError, RequestOptions } from '@/types/api'

// ========================
// Token 刷新锁（防止并发刷新）
// ========================
let isRefreshing = false
let pendingRequests: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

/**
 * Token 刷新成功后，将新 Token 分发给所有等待中的请求
 */
function onTokenRefreshed(newToken: string): void {
  pendingRequests.forEach(({ resolve }) => resolve(newToken))
  pendingRequests = []
}

/**
 * Token 刷新失败后，拒绝所有等待中的请求
 */
function onRefreshFailed(error: unknown): void {
  pendingRequests.forEach(({ reject }) => reject(error))
  pendingRequests = []
}

/**
 * 尝试使用 Refresh Token 获取新的 Access Token
 */
async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    throw new Error('No refresh token available')
  }

  // 使用独立的 axios 实例发送刷新请求，避免触发拦截器递归
  const res = await axios.post<ApiResponse<{ token: string }>>(
    '/api/auth/refresh',
    { refreshToken },
    { baseURL: import.meta.env.VITE_API_BASE_URL || '' }
  )

  if (res.data.code !== 0 || !res.data.data?.token) {
    throw new Error('Token refresh failed')
  }

  const newToken = res.data.data.token
  setAccessToken(newToken)
  return newToken
}

// ========================
// 创建 Axios 实例
// ========================
const client: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  // 不跟随重定向（401 等状态码需要手动处理）
  maxRedirects: 0,
})

// ========================
// 请求拦截器
// ========================
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 从元数据中读取跳过认证标志
    const skipAuth = (config as RequestOptions & InternalAxiosRequestConfig).skipAuth
    if (!skipAuth) {
      const token = getAccessToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }

    // 注入请求开始时间（用于性能监控）
    ;(config as any)._startTime = Date.now()

    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

// ========================
// 响应拦截器
// ========================
client.interceptors.response.use(
  (response: AxiosResponse) => {
    // 性能日志（开发环境）
    if (import.meta.env.DEV) {
      const duration = Date.now() - (response.config as any)?._startTime
      if (duration > 3000) {
        console.warn(`[API Slow] ${response.config.url} took ${duration}ms`)
      }
    }

    // 直接返回 data，解包 axios 响应
    return response.data as AxiosResponse
  },
  async (error: AxiosError<ApiResponse>) => {
    const originalConfig = error.config as AxiosRequestConfig & RequestOptions
    const status = error.response?.status ?? 0

    // 用户主动取消请求（AbortController），静默处理
    if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
      const apiError: ApiError = {
        code: -1,
        message: '请求已取消',
        status: 0,
        isCanceled: true,
      }
      return Promise.reject(apiError)
    }

    // 401 未授权 → 尝试 Token 无感刷新
    if (status === 401 && originalConfig && !originalConfig._retry) {
      originalConfig._retry = true

      // 如果正在刷新 Token，将当前请求加入等待队列
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingRequests.push({
            resolve: (newToken: string) => {
              originalConfig.headers = originalConfig.headers || {}
              originalConfig.headers.Authorization = `Bearer ${newToken}`
              resolve(client(originalConfig))
            },
            reject,
          })
        })
      }

      isRefreshing = true
      try {
        const newToken = await refreshAccessToken()
        onTokenRefreshed(newToken)
        // 用新 Token 重试原请求
        originalConfig.headers = originalConfig.headers || {}
        originalConfig.headers.Authorization = `Bearer ${newToken}`
        return client(originalConfig)
      } catch (refreshError) {
        onRefreshFailed(refreshError)
        // 刷新失败 → 清除 Token，跳转登录页
        clearTokens()
        window.location.href = '/auth/login?redirect=' + encodeURIComponent(location.href)
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    // 403 无权限
    if (status === 403) {
      const apiError: ApiError = {
        code: error.response?.data?.code ?? 403,
        message: error.response?.data?.message ?? '无权限访问',
        status: 403,
        isCanceled: false,
      }
      return Promise.reject(apiError)
    }

    // 408 请求超时
    if (error.code === 'ECONNABORTED' || status === 408) {
      const apiError: ApiError = {
        code: 408,
        message: '请求超时，请检查网络后重试',
        status: 408,
        isCanceled: false,
      }
      return Promise.reject(apiError)
    }

    // 500+ 服务端错误
    if (status >= 500) {
      const apiError: ApiError = {
        code: error.response?.data?.code ?? status,
        message: error.response?.data?.message ?? '服务器异常，请稍后重试',
        detail: error.response?.data?.detail,
        status,
        isCanceled: false,
      }
      return Promise.reject(apiError)
    }

    // 网络断开
    if (!error.response) {
      const apiError: ApiError = {
        code: 0,
        message: '网络连接失败，请检查网络设置',
        status: 0,
        isCanceled: false,
      }
      return Promise.reject(apiError)
    }

    // 其他错误
    const apiError: ApiError = {
      code: error.response?.data?.code ?? -1,
      message: error.response?.data?.message ?? error.message,
      status,
      isCanceled: false,
    }
    return Promise.reject(apiError)
  }
)

// ========================
// 类型安全的请求封装
// ========================

/**
 * 发起 GET 请求
 */
export async function get<T>(
  url: string,
  params?: Record<string, unknown>,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return client.get<any, ApiResponse<T>>(url, {
    params,
    ...options,
  })
}

/**
 * 发起 POST 请求
 */
export async function post<T>(
  url: string,
  data?: unknown,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return client.post<any, ApiResponse<T>>(url, data, options)
}

/**
 * 发起 PUT 请求
 */
export async function put<T>(
  url: string,
  data?: unknown,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return client.put<any, ApiResponse<T>>(url, data, options)
}

/**
 * 发起 PATCH 请求
 */
export async function patch<T>(
  url: string,
  data?: unknown,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return client.patch<any, ApiResponse<T>>(url, data, options)
}

/**
 * 发起 DELETE 请求
 */
export async function del<T>(
  url: string,
  params?: Record<string, unknown>,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return client.delete<any, ApiResponse<T>>(url, {
    params,
    ...options,
  })
}

/**
 * 创建 AbortController（用于组件卸载时取消请求）
 * @returns 包含 signal 的对象，传入 RequestOptions.signal
 */
export function createAbortController(): AbortController & { signal: AbortSignal } {
  return new AbortController() as AbortController & { signal: AbortSignal }
}

/**
 * 创建自定义 Axios 实例（多实例场景）
 * 用于需要不同 baseURL / timeout 的场景（如文件上传、第三方 API 代理）
 */
export function createCustomClient(config?: AxiosRequestConfig): AxiosInstance {
  return axios.create({
    ...config,
    headers: {
      'Content-Type': 'application/json',
      ...config?.headers,
    },
  })
}

export default client
```

---

## 五、业务 API 模块封装

### 5.1 类型定义示例

```typescript
// src/types/user.ts

import type { ID, ISODateString } from './api'

/** 用户实体（对应后端 users 表） */
export interface UserEntity {
  id: ID
  username: string
  email: string
  phone: string
  realName: string
  avatar: string | null
  status: UserStatus
  roleIds: ID[]
  departmentId: ID | null
  lastLoginAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}

/** 用户状态枚举（与后端数据库枚举值严格对应） */
export enum UserStatus {
  ACTIVE = 1,   // 正常
  DISABLED = 0, // 禁用
  PENDING = 2,  // 待审核
}

/** 创建用户参数 */
export interface CreateUserParams {
  username: string
  email: string
  phone: string
  realName: string
  password: string
  roleIds: ID[]
  departmentId?: ID
}

/** 更新用户参数（所有字段可选） */
export type UpdateUserParams = Partial<Omit<CreateUserParams, 'password'>>
```

### 5.2 API 模块示例

```typescript
// src/api/modules/user.ts

import { get, post, put, del } from '@/api/client'
import type {
  ApiResponse,
  PageQuery,
  PageResult,
  RequestOptions,
} from '@/types/api'
import type { UserEntity, CreateUserParams, UpdateUserParams } from '@/types/user'

const BASE_URL = '/users'

/**
 * 获取用户列表（分页）
 */
export function getUserList(
  params: PageQuery & { keyword?: string; status?: number },
  options?: RequestOptions
): Promise<ApiResponse<PageResult<UserEntity>>> {
  return get<PageResult<UserEntity>>(BASE_URL, params, options)
}

/**
 * 获取用户详情
 */
export function getUserDetail(
  id: number,
  options?: RequestOptions
): Promise<ApiResponse<UserEntity>> {
  return get<UserEntity>(`${BASE_URL}/${id}`, undefined, options)
}

/**
 * 创建用户
 */
export function createUser(
  data: CreateUserParams,
  options?: RequestOptions
): Promise<ApiResponse<UserEntity>> {
  return post<UserEntity>(BASE_URL, data, options)
}

/**
 * 更新用户
 */
export function updateUser(
  id: number,
  data: UpdateUserParams,
  options?: RequestOptions
): Promise<ApiResponse<UserEntity>> {
  return put<UserEntity>(`${BASE_URL}/${id}`, data, options)
}

/**
 * 删除用户
 */
export function deleteUser(
  id: number,
  options?: RequestOptions
): Promise<ApiResponse<null>> {
  return del<null>(`${BASE_URL}/${id}`, undefined, options)
}

/**
 * 批量删除用户
 */
export function batchDeleteUsers(
  ids: number[],
  options?: RequestOptions
): Promise<ApiResponse<null>> {
  return del<null>(BASE_URL, { ids: ids.join(',') }, options)
}
```

### 5.3 API 模块统一导出

```typescript
// src/api/index.ts

export { get, post, put, patch, del, createAbortController, createCustomClient } from './client'
export * as authApi from './modules/auth'
export * as userApi from './modules/user'
export * as roleApi from './modules/role'
export * as permissionApi from './modules/permission'
export * as dashboardApi from './modules/dashboard'
export * as workflowApi from './modules/workflow'
export * as systemApi from './modules/system'
```

---

## 六、TanStack Query 集成与 Pinia 协同

### 6.1 安装与配置

```bash
npm install @tanstack/vue-query@^5.0.0
```

```typescript
// src/plugins/vue-query.ts

import { VueQueryPlugin, type QueryClient } from '@tanstack/vue-query'
import type { App } from 'vue'

/**
 * 创建 QueryClient 实例
 * - staleTime: 数据被视为"新鲜"的时间（5 分钟内不会自动重新请求）
 * - gcTime: 未使用数据在缓存中保留的时间
 * - retry: 失败重试次数
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,    // 5 分钟
        gcTime: 10 * 60 * 1000,      // 10 分钟
        retry: 1,                      // 失败重试 1 次
        refetchOnWindowFocus: false,   // 窗口聚焦时不自动重新请求（避免打断用户操作）
        refetchOnReconnect: true,      // 网络重连时自动重新请求
      },
      mutations: {
        retry: 0, // mutation 不自动重试
      },
    },
  })
}

export function setupVueQuery(app: App) {
  app.use(VueQueryPlugin, {
    queryClient: createQueryClient(),
  })
}
```

在 `main.ts` 中注册：

```typescript
// src/main.ts
import { createApp } from 'vue'
import App from './App.vue'
import { setupPinia } from './plugins/pinia'
import { setupRouter } from './plugins/router'
import { setupI18n } from './plugins/i18n'
import { setupVueQuery } from './plugins/vue-query'

const app = createApp(App)
setupPinia(app)
setupVueQuery(app) // 必须在 Pinia 之后
setupRouter(app)
setupI18n(app)
app.mount('#app')
```

### 6.2 Query Keys 管理

```typescript
// src/api/keys.ts

/**
 * Query Key 工厂函数
 * 统一管理所有 TanStack Query 的缓存键，保证类型安全与一致性
 *
 * 设计原则：
 * - 按 [模块, 操作, 参数] 三级结构组织
 * - 列表查询用数组参数，详情查询用单值参数
 * - 参数变化自动触发重新请求
 */
export const queryKeys = {
  // 用户模块
  users: {
    all: ['users'] as const,
    lists: () => [...queryKeys.users.all, 'list'] as const,
    list: (params: Record<string, unknown>) =>
      [...queryKeys.users.lists(), params] as const,
    details: () => [...queryKeys.users.all, 'detail'] as const,
    detail: (id: number) => [...queryKeys.users.details(), id] as const,
  },

  // 权限模块
  roles: {
    all: ['roles'] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.roles.all, 'list', params] as const,
    detail: (id: number) => [...queryKeys.roles.all, 'detail', id] as const,
  },

  // 仪表盘模块
  dashboard: {
    all: ['dashboard'] as const,
    stats: () => [...queryKeys.dashboard.all, 'stats'] as const,
    trends: (range: string) =>
      [...queryKeys.dashboard.all, 'trends', range] as const,
  },

  // 工作流模块
  workflows: {
    all: ['workflows'] as const,
    list: (params: Record<string, unknown>) =>
      [...queryKeys.workflows.all, 'list', params] as const,
    detail: (id: number) => [...queryKeys.workflows.all, 'detail', id] as const,
  },
} as const
```

### 6.3 TanStack Query + Pinia 协同模式

```typescript
// src/composables/useUserList.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { getUserList, createUser, updateUser, deleteUser } from '@/api/modules/user'
import { queryKeys } from '@/api/keys'
import type { PageQuery, CreateUserParams, UpdateUserParams } from '@/types/api'
import { ElMessage } from 'element-plus'

/**
 * 用户列表查询（TanStack Query 管理服务端缓存状态）
 * @param params - 分页与筛选参数（响应式）
 */
export function useUserList(params: Ref<PageQuery & { keyword?: string }>) {
  const query = useQuery({
    queryKey: computed(() => queryKeys.users.list(params.value)),
    queryFn: () => getUserList(params.value),
    // 选择器：仅提取需要的字段，减少响应式追踪开销
    select: (res) => res.data,
  })

  return {
    /** 用户列表数据 */
    users: computed(() => query.data.value?.list ?? []),
    /** 总条数 */
    total: computed(() => query.data.value?.total ?? 0),
    /** 当前页 */
    page: computed(() => query.data.value?.page ?? 1),
    /** 是否正在加载 */
    loading: computed(() => query.isLoading.value),
    /** 是否有错误 */
    error: query.error,
    /** 手动刷新 */
    refetch: query.refetch,
  }
}

/**
 * 创建用户（useMutation 管理异步写入操作）
 */
export function useCreateUser() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data: CreateUserParams) => createUser(data),
    onSuccess: () => {
      // 创建成功后，让用户列表缓存失效，自动重新请求
      queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })
      ElMessage.success('用户创建成功')
    },
    onError: () => {
      ElMessage.error('用户创建失败')
    },
  })

  return {
    /** 提交创建请求 */
    create: mutation.mutateAsync,
    /** 是否正在提交 */
    creating: mutation.isPending,
  }
}

/**
 * 更新用户
 */
export function useUpdateUser() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUserParams }) =>
      updateUser(id, data),
    onSuccess: (_data, { id }) => {
      // 更新成功后，同时失效列表和详情缓存
      queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(id) })
      ElMessage.success('用户更新成功')
    },
    onError: () => {
      ElMessage.error('用户更新失败')
    },
  })

  return {
    update: mutation.mutateAsync,
    updating: mutation.isPending,
  }
}

/**
 * 删除用户
 */
export function useDeleteUser() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })
      ElMessage.success('用户删除成功')
    },
    onError: () => {
      ElMessage.error('用户删除失败')
    },
  })

  return {
    remove: mutation.mutateAsync,
    removing: mutation.isPending,
  }
}
```

### 6.4 Pinia 与 TanStack Query 职责划分

| 场景 | 使用 | 理由 |
|------|------|------|
| 服务端数据缓存（列表、详情） | TanStack Query `useQuery` | 自动管理 stale / refetch / dedup |
| 异步写入（创建、更新、删除） | TanStack Query `useMutation` | 自动乐观更新 / 失效缓存 |
| UI 状态（侧边栏展开、暗色模式） | Pinia | 纯客户端状态，与服务端无关 |
| 表单临时数据（草稿） | Pinia | 跨页面保持，不涉及缓存策略 |
| 用户登录态 | Pinia + `utils/token.ts` | 需要在路由守卫中同步读取 |
| 复杂跨模块状态（购物车） | Pinia | 需要复杂的客户端计算逻辑 |

---

## 七、composables/useRequest 封装

```typescript
// src/composables/useRequest.ts

import { ref, onUnmounted, type Ref } from 'vue'
import { createAbortController } from '@/api/client'
import type { ApiError } from '@/types/api'

interface UseRequestOptions<TData, TParams extends unknown[] = []> {
  /** 异步请求函数 */
  request: (...args: TParams) => Promise<TData>
  /** 初始数据 */
  initialData?: TData
  /** 是否在 mounted 时自动执行（默认 false） */
  immediate?: boolean
  /** 是否在组件卸载时自动取消请求（默认 true） */
  abortOnUnmount?: boolean
  /** 成功回调 */
  onSuccess?: (data: TData) => void
  /** 失败回调 */
  onError?: (error: ApiError) => void
  /** 完成回调（无论成功失败） */
  onFinally?: () => void
}

/**
 * 通用请求组合式函数（非 TanStack Query 场景使用）
 *
 * 适用场景：
 * - 不需要缓存的临时请求
 * - 与 TanStack Query 模式不兼容的遗留接口
 * - 需要更细粒度控制 AbortController 的场景
 */
export function useRequest<TData, TParams extends unknown[] = []>(
  options: UseRequestOptions<TData, TParams>
) {
  const {
    request,
    initialData = undefined as TData,
    immediate = false,
    abortOnUnmount = true,
    onSuccess,
    onError,
    onFinally,
  } = options

  const data = ref<TData | undefined>(initialData) as Ref<TData | undefined>
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  let abortController: AbortController | null = null

  async function run(...args: TParams): Promise<TData | undefined> {
    loading.value = true
    error.value = null

    // 创建新的 AbortController
    if (abortOnUnmount) {
      abortController?.abort()
      abortController = createAbortController()
    }

    try {
      const result = await request(...args)
      data.value = result
      onSuccess?.(result)
      return result
    } catch (err: unknown) {
      const apiError = err as ApiError
      error.value = apiError
      onError?.(apiError)
      throw apiError
    } finally {
      loading.value = false
      onFinally?.()
    }
  }

  // 组件卸载时取消进行中的请求
  if (abortOnUnmount) {
    onUnmounted(() => {
      abortController?.abort()
    })
  }

  // 自动执行
  if (immediate) {
    run(...([] as unknown as TParams))
  }

  return {
    data,
    loading,
    error,
    run,
  }
}
```

**使用示例**：

```vue
<script setup lang="ts">
import { useRequest } from '@/composables/useRequest'
import { getUserDetail } from '@/api/modules/user'

const userId = ref(1)

const { data: user, loading, error, run: fetchUser } = useRequest({
  request: (id: number) => getUserDetail(id),
  initialData: undefined,
})

// 手动触发
watch(userId, (newId) => fetchUser(newId))
</script>

<template>
  <div v-if="loading">加载中...</div>
  <div v-else-if="error">加载失败：{{ error.message }}</div>
  <div v-else-if="user?.data">{{ user.data.realName }}</div>
</template>
```

---

## 八、表单校验策略（Zod）

### 8.1 安装

```bash
npm install zod
```

### 8.2 Schema 定义（与类型联动）

```typescript
// src/types/schemas/user.ts

import { z } from 'zod'

/**
 * 用户创建表单校验 Schema
 * 同时作为 TypeScript 类型和运行时校验规则
 */
export const createUserSchema = z.object({
  username: z
    .string()
    .min(3, '用户名至少 3 个字符')
    .max(20, '用户名最多 20 个字符')
    .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线'),

  email: z
    .string()
    .email('请输入有效的邮箱地址')
    .max(100, '邮箱最多 100 个字符'),

  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/, '请输入有效的手机号码'),

  realName: z
    .string()
    .min(2, '姓名至少 2 个字符')
    .max(30, '姓名最多 30 个字符'),

  password: z
    .string()
    .min(8, '密码至少 8 个字符')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, '密码必须包含大小写字母和数字'),

  roleIds: z
    .array(z.number().int().positive())
    .min(1, '请至少选择一个角色'),

  departmentId: z
    .number()
    .int()
    .positive()
    .optional()
    .nullable(),
})

/**
 * 从 Zod Schema 推导 TypeScript 类型
 * 与 CreateUserParams 保持一致，无需重复定义
 */
export type CreateUserSchema = z.infer<typeof createUserSchema>
```

### 8.3 表单校验组合式函数

```typescript
// src/composables/useFormValidation.ts

import { ref, reactive, type Ref } from 'vue'
import type { ZodSchema, ZodError } from 'zod'

interface FormErrors {
  [field: string]: string
}

/**
 * 通用表单校验组合式函数
 * @param schema - Zod 校验 Schema
 * @param initialValues - 表单初始值
 */
export function useFormValidation<T extends Record<string, unknown>>(
  schema: ZodSchema<T>,
  initialValues: T
) {
  const form = reactive<T>({ ...initialValues })
  const errors = ref<FormErrors>({})
  const isValidating = ref(false)

  /**
   * 校验指定字段
   */
  function validateField(field: keyof T): boolean {
    try {
      schema.shape[field as string].parse(form[field])
      delete errors.value[field as string]
      return true
    } catch (err) {
      const zodError = err as ZodError
      errors.value[field as string] = zodError.errors[0]?.message ?? '校验失败'
      return false
    }
  }

  /**
   * 校验全部字段
   */
  function validateAll(): boolean {
    try {
      schema.parse(form)
      errors.value = {}
      return true
    } catch (err) {
      const zodError = err as ZodError
      const fieldErrors: FormErrors = {}
      zodError.errors.forEach((e) => {
        const field = e.path[0] as string
        if (!fieldErrors[field]) {
          fieldErrors[field] = e.message
        }
      })
      errors.value = fieldErrors
      return false
    }
  }

  /**
   * 重置表单
   */
  function resetForm(): void {
    Object.assign(form, initialValues)
    errors.value = {}
  }

  return {
    form,
    errors,
    isValidating,
    validateField,
    validateAll,
    resetForm,
  }
}
```

**使用示例**：

```vue
<script setup lang="ts">
import { useFormValidation } from '@/composables/useFormValidation'
import { createUserSchema } from '@/types/schemas/user'
import { useCreateUser } from '@/composables/useUserList'

const { form, errors, validateAll, resetForm } = useFormValidation(
  createUserSchema,
  {
    username: '',
    email: '',
    phone: '',
    realName: '',
    password: '',
    roleIds: [],
    departmentId: null,
  }
)

const { create, creating } = useCreateUser()

async function handleSubmit() {
  if (!validateAll()) return
  await create(form)
  resetForm()
}
</script>
```

---

## 九、OpenAPI 自动代码生成方案

### 9.1 工具选型

原 `openapi-typescript-codegen` 已停止维护，推荐迁移到其社区继承项目 `@hey-api/openapi-ts`（活跃维护，支持 Axios / Fetch 客户端）。[$TRAE_REF](https://github.com/ferdikoomen/openapi-typescript-codegen)

### 9.2 安装

```bash
# 核心代码生成器
npm install -D @hey-api/openapi-ts@^0.60.0

# Axios 客户端（若使用 Axios）
npm install @hey-api/client-axios

# 或 Fetch 客户端（更轻量，浏览器原生）
npm install @hey-api/client-fetch

# 日期转换器（自动将日期字符串转为 Date 对象）
npm install @hey-api/transformers
```

### 9.3 配置文件

```typescript
// openapi-ts.config.ts（项目根目录）

import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  // 输入：后端 Swagger/OpenAPI JSON/YAML 地址
  input: {
    // 开发环境从本地文件读取（也可配置为远程 URL）
    path: 'http://localhost:8080/api-docs/json',
    // 格式转换（将 Swagger 2.0 转为 OpenAPI 3.x）
    converter: 'swagger2openapi',
  },

  // 输出目录
  output: {
    path: 'src/api/generated',
    // 每次生成前清空输出目录
    clean: true,
    // 生成结果的格式
    format: 'prettier',
  },

  // 客户端类型
  client: '@hey-api/client-axios',

  // TypeScript 配置
  typescript: {
    // 枚举样式
    enums: 'union',
    // 时间戳类型转为 Date 对象
    dates: true,
  },

  // 插件配置
  plugins: [
    // 类型定义插件
    {
      name: '@hey-api/typescript',
    },
    // SDK 生成插件（生成可直接调用的函数）
    {
      name: '@hey-api/sdk',
      // 启用数据转换器
      transformer: true,
    },
    // Schema 生成（用于表单校验联动）
    '@hey-api/schemas',
  ],
})
```

### 9.4 生成命令

```json
// package.json scripts 新增
{
  "scripts": {
    "generate:api": "openapi-ts",
    "generate:api:watch": "openapi-ts --watch"
  }
}
```

```bash
# 手动执行一次生成
npm run generate:api

# 开发环境监听后端 API 变更，自动重新生成
npm run generate:api:watch
```

### 9.5 生成产物整合

```
src/api/
├── generated/              # 自动生成，勿手动修改
│   ├── types.gen.ts        # 后端实体类型（与 Prisma/TypeORM 实体映射）
│   ├── sdk.gen.ts          # 可直接调用的 API 函数
│   ├── schemas.gen.ts      # JSON Schema（可与 Zod 联动）
│   └── client.gen.ts       # 自动配置的 HTTP 客户端实例
├── client.ts               # 手写：核心 Axios 实例（拦截器、Token 刷新）
├── modules/                # 手写：业务 API 封装（可选，若使用 generated/sdk 则可省略）
└── keys.ts                 # TanStack Query Key 管理
```

**与手写 API 的整合策略**：

| 场景 | 方案 |
|------|------|
| 后端有完整 OpenAPI 文档 | 直接使用 `generated/sdk.gen.ts` 中的函数，无需手写 `modules/` |
| 后端文档不完整或需要额外封装 | 手写 `modules/` 引用 `generated/types.gen.ts` 中的类型 |
| 混合场景 | 公共接口用 generated SDK，特殊接口手写，类型统一从 generated 导入 |

---

## 十、前后端数据模型映射

### 10.1 ORM 实体 → TypeScript 类型映射规则

| PostgreSQL 列类型 | Prisma/TypeORM 类型 | TypeScript 类型 | 说明 |
|-------------------|---------------------|-----------------|------|
| `serial` / `bigint` | `Int` / `Int64` | `number` | 自增主键 |
| `varchar(n)` | `String` | `string` | 定长字符串 |
| `text` | `String` | `string` | 无限长字符串 |
| `boolean` | `Boolean` | `boolean` | 布尔值 |
| `timestamp` / `timestamptz` | `DateTime` | `ISODateString` | ISO 8601 字符串 |
| `integer` (枚举) | `Enum` | `Enum` (TS union) | 与后端枚举值严格对应 |
| `jsonb` | `Json` | `Record<string, unknown>` | JSON 对象 |
| `numeric(p,s)` | `Decimal` | `number` | 精确数值 |
| `uuid` | `String` (uuid) | `string` | UUID 格式字符串 |
| `integer[]` | `Int[]` | `number[]` | 整数数组 |

### 10.2 命名映射约定

```
后端（snake_case）           前端（camelCase）
─────────────────────       ─────────────────
user_name          →         userName
created_at         →         createdAt
role_id            →         roleId
is_active          →         isActive
```

建议在 `@hey-api/openapi-ts` 中配置 `typescript.identifierCase: 'camelCase'`（默认行为），或使用后端中间件自动转换。OpenAPI spec 本身推荐 `camelCase`，若后端使用 `snake_case`，需在 spec 层面转换。

### 10.3 实体映射示例

```typescript
// 后端 Prisma Schema（参考）
// model User {
//   id           Int       @id @default(autoincrement())
//   username     String    @unique @db.VarChar(20)
//   email        String    @unique @db.VarChar(100)
//   phone        String?   @db.VarChar(11)
//   real_name    String    @db.VarChar(30)
//   avatar       String?   @db.VarChar(500)
//   status       Int       @default(1)  // 0=禁用 1=正常 2=待审核
//   role_ids     Int[]
//   department_id Int?
//   last_login_at DateTime?
//   created_at   DateTime  @default(now())
//   updated_at   DateTime  @updatedAt()
// }

// 前端 TypeScript 类型（通过 openapi-ts 自动生成或手写）
// src/api/generated/types.gen.ts（自动生成）
export interface User {
  id: number
  username: string
  email: string
  phone?: string | null
  realName: string
  avatar?: string | null
  status: UserStatus
  roleIds: number[]
  departmentId?: number | null
  lastLoginAt?: string | null
  createdAt: string
  updatedAt: string
}

export type UserStatus = 0 | 1 | 2
```

---

## 十一、安全考虑

### 11.1 CSRF 防护

| 策略 | 实现方式 |
|------|----------|
| SameSite Cookie | 后端设置 `SameSite=Strict` 或 `SameSite=Lax` |
| CSRF Token | 若使用 Cookie 认证，后端返回 CSRF Token，前端在每个非 GET 请求的 Header 中携带 `X-CSRF-Token` |
| Bearer Token | 本方案采用 `Authorization: Bearer` Header，天然不受 CSRF 影响（CSRF 无法跨域读取 Header） |

**推荐**：本方案使用 JWT Bearer Token（localStorage + Authorization Header），已天然免疫 CSRF 攻击。若未来切换为 Cookie 认证，需补充 CSRF Token 机制。

### 11.2 敏感数据保护

```typescript
// src/utils/token.ts 中的安全增强

/**
 * 使用 sessionStorage 替代 localStorage（可选，适用于更高安全要求的场景）
 * - sessionStorage 在标签页关闭后自动清除
 * - localStorage 跨标签页持久存在，易受 XSS 窃取
 */
const TOKEN_KEY = import.meta.env.VITE_USE_SESSION_STORAGE === 'true'
  ? 'access_token_session'
  : 'access_token'

function getTokenStorage(): Storage {
  return import.meta.env.VITE_USE_SESSION_STORAGE === 'true'
    ? sessionStorage
    : localStorage
}
```

| 安全措施 | 说明 |
|----------|------|
| Token 存储 | 默认 localStorage，高安全场景可切换 sessionStorage |
| HTTPS 强制 | 生产环境 `VITE_API_BASE_URL` 必须为 `https://`，Vite proxy 仅限开发环境 |
| Token 过期 | Access Token 有效期 ≤ 15 分钟，Refresh Token ≤ 7 天；`utils/token.ts` 中已实现 JWT exp 检查 |
| XSS 防护 | Vue 默认转义模板内容；`v-html` 使用处必须消毒（DOMPurify） |
| 敏感字段 | 密码、身份证等字段在 API 响应中不返回原值，仅返回掩码 |
| 权限校验 | 前端路由守卫 + 按钮级 `v-permission` 指令；后端接口必须独立校验（不信任前端） |

### 11.3 请求安全配置

```typescript
// api/client.ts 补充安全相关配置

const client = axios.create({
  // ...其他配置
  headers: {
    // 禁止浏览器自动缓存带 Token 的响应
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
  },
  // 禁止发送凭证（Cookies），仅使用 Bearer Token
  withCredentials: false,
})
```

---

## 十二、实施步骤与验证命令

### 12.1 依赖安装

```bash
# HTTP 客户端
npm install axios@^1.7.0

# TanStack Query
npm install @tanstack/vue-query@^5.0.0

# 表单校验
npm install zod@^3.23.0

# OpenAPI 代码生成（可选，后端有 Swagger 文档时使用）
npm install -D @hey-api/openapi-ts@^0.60.0 @hey-api/client-axios
```

### 12.2 文件创建清单

按以下顺序创建文件，确保依赖关系正确：

| 序号 | 文件路径 | 说明 |
|------|----------|------|
| 1 | `src/utils/token.ts` | Token 存取纯函数（零依赖） |
| 2 | `src/types/api.ts` | 通用 API 类型定义 |
| 3 | `src/types/user.ts` | 业务实体类型 |
| 4 | `src/types/schemas/user.ts` | Zod 表单校验 Schema |
| 5 | `src/api/client.ts` | Axios 实例 + 拦截器 + Token 刷新 |
| 6 | `src/api/keys.ts` | TanStack Query Key 工厂 |
| 7 | `src/api/modules/user.ts` | 业务 API 模块 |
| 8 | `src/api/index.ts` | API 统一导出 |
| 9 | `src/composables/useRequest.ts` | 通用请求组合式函数 |
| 10 | `src/composables/useFormValidation.ts` | 表单校验组合式函数 |
| 11 | `src/composables/useUserList.ts` | 用户管理业务组合式函数（TanStack Query） |
| 12 | `src/plugins/vue-query.ts` | TanStack Query 初始化 |
| 13 | `openapi-ts.config.ts` | OpenAPI 代码生成配置（可选） |

### 12.3 与现有配置整合

| 配置文件 | 整合内容 |
|----------|----------|
| `vite.config.ts` | `optimizeDeps.include` 添加 `@tanstack/vue-query`、`zod` |
| `tsconfig.app.json` | `include` 无需修改（`src/**/*.ts` 已覆盖） |
| `.eslintrc.cjs` | `parserOptions.project` 保持 `tsconfig.app.json` 不变 |
| `src/stores/auth.ts` | `login()` 中添加 `setAccessToken()` 调用，`logout()` 中添加 `clearTokens()` 调用 |
| `src/main.ts` | 在 `setupPinia(app)` 之后添加 `setupVueQuery(app)` |
| `src/router/guards.ts` | 使用 `getAccessToken()` 替代 `useAuthStore()` 进行 Token 检查（避免 Pinia 未初始化问题） |

### 12.4 验证命令

```bash
# 1. TypeScript 类型检查
npm run type-check

# 2. ESLint 检查
npm run lint

# 3. 开发服务器启动（验证无循环依赖报错）
npm run dev

# 4. OpenAPI 代码生成（可选，需后端 Swagger 运行中）
npm run generate:api

# 5. 生产构建
npm run build
```

### 12.5 循环依赖验证

```bash
# 使用 Madge 检测循环依赖
npx madge --circular --extensions ts src/
```

预期输出应为空（无循环依赖）。若 `api/client.ts` 直接 import 了 Pinia Store，此处会报错。

---

> **总结**：本文档以 **消除循环依赖** 为核心设计约束，通过 `utils/token.ts` 纯函数层解耦 Token 存取与 Pinia Store；以 **TanStack Query** 管理服务端状态缓存与异步写入，与 Pinia 的客户端状态形成互补；以 **Zod Schema** 实现运行时校验与 TypeScript 类型推导的统一；以 **@hey-api/openapi-ts** 实现后端 API 文档到前端类型与调用代码的自动化生成。所有配置均与《项目基础配置与 Vite 插件方案》中的 `vite.config.ts` 和 `tsconfig.json` 严格对齐。
