# Sprint10-D-4-3 HSE系统PC端前端架构基线冻结报告

## 一、任务概述

对HSE系统PC端前端架构进行最终稳定性验证与基线冻结，确保左侧导航结构、页面路由、权限体系、Layout、组件体系、API调用稳定，形成后续开发基线。

**执行日期**：2026-07-24
**任务版本**：Sprint10-D-4-3
**前置任务**：
- Sprint10-D-4-2-A（HSE后端统一响应格式与字段转换规范修正）
- Sprint10-D-4-2-B（HSE系统PC端左侧导航视觉迁移最终实施）
- Sprint10-D-4-2-B-1（HSE系统左侧导航迁移后端路由与前端架构修正）

---

## 二、前端架构资产清单

### 2.1 核心架构文件

| 类别 | 文件 | 作用 | 当前状态 |
|------|------|------|---------|
| **Layout** | LayoutDefault.vue | 主布局容器（侧边栏+顶部栏+内容区） | ✅ 稳定 |
| Layout | LayoutSidebar.vue | 侧边栏导航组件 | ✅ 稳定 |
| Layout | LayoutHeader.vue | 顶部栏（用户信息、主题切换） | ✅ 稳定 |
| Layout | LayoutTabs.vue | 标签页导航 | ✅ 稳定 |
| Layout | LayoutBreadcrumb.vue | 面包屑导航 | ✅ 稳定 |
| Layout | SidebarMenuItem.vue | 递归菜单项组件 | ✅ 稳定 |
| **Router** | routes.ts | 路由配置（常量+异步路由） | ✅ 稳定 |
| Router | guards.ts | 全局路由守卫（权限验证、路由加载） | ✅ 稳定 |
| Router | index.ts | 路由实例创建 | ✅ 稳定 |
| **Stores** | auth.ts | 认证状态管理（登录、用户信息） | ✅ 稳定 |
| Stores | permission.ts | 权限状态管理（菜单、权限码） | ✅ 稳定 |
| Stores | app.ts | 应用UI状态（主题、侧边栏、面包屑） | ✅ 稳定 |
| Stores | dashboard.ts | 首页数据状态 | ✅ 稳定 |
| **API** | client.ts | Axios 实例封装（请求/响应拦截器） | ✅ 稳定 |
| API | auth.ts | 认证接口 | ✅ 稳定 |
| API | user.ts | 用户管理接口 | ✅ 稳定 |
| API | system.ts | 系统/菜单/角色接口 | ✅ 稳定 |
| API | risk.ts | 风险管控接口 | ✅ 稳定 |
| API | hazard.ts | 隐患治理接口 | ✅ 稳定 |
| API | alert.ts | 预警中心接口 | ✅ 稳定 |
| API | notification.ts | 通知中心接口 | ✅ 稳定 |
| API | accident.ts | 事故管理接口 | ✅ 稳定 |
| API | workflow.ts | 工作流接口 | ✅ 稳定 |
| API | audit.ts | 审计日志接口 | ✅ 稳定 |
| API | assessment-monthly.ts | 月度安全履职考核接口 | ✅ 稳定 |
| API | evaluation.ts | 标准化评价接口 | ✅ 稳定 |
| API | file.ts | 文件管理接口 | ✅ 稳定 |
| API | report.ts | 报告接口 | ✅ 稳定 |
| API | dashboard.ts | 首页数据接口 | ✅ 稳定 |
| **Utils** | token.ts | Token 存取工具 | ✅ 稳定 |
| Utils | websocket.ts | WebSocket 客户端封装 | ✅ 稳定 |
| Utils | sentry.ts | Sentry 错误监控初始化 | ✅ 稳定 |

### 2.2 业务页面资产

| 模块 | 页面数量 | 核心文件 |
|------|---------|---------|
| 安全总览（dashboard） | 1 | DashboardView.vue |
| 预警中心（alert） | 1 | AlertCenterView.vue |
| 通知中心（notification） | 1 | NotificationCenterView.vue |
| 智能报告（overview） | 1 | SmartReportView.vue |
| 风险管控（risk） | 2 | RiskListView.vue, RiskDashboardView.vue |
| 事故管理（accident） | 2 | AccidentListView.vue, AccidentStatsView.vue |
| 隐患治理（hazard） | 3 | HazardListView.vue, HazardDetailView.vue, HazardFormView.vue |
| 现场管理（site-management） | 5 | ViolationListView.vue, GridManagementView.vue 等 |
| 人员管理（personnel） | 5 | OrganizationView.vue, PositionView.vue, InsuranceView.vue 等 |
| 培训考核（training） | 7 | TrainingPlanView.vue, ResponsibilityAssessmentView.vue 等 |
| 应急管理（emergency） | 1 | EmergencyView.vue |
| 目标职责（objectives） | 3 | ResponsibilityView.vue, CommitteeView.vue, BudgetView.vue |
| 制度标准（standards） | 4 | RegulationsView.vue, DocumentsView.vue 等 |
| 标准化评价（standard-evaluation） | 2 | EvaluationTaskList.vue, EvaluationDetail.vue |
| 用户管理（user） | 2 | UserListView.vue, UserProfileView.vue |
| 系统管理（system） | 3 | RoleManageView.vue, MenuManageView.vue, SystemLogView.vue |
| 审计日志（audit） | 1 | AuditLogView.vue |
| 工作流（workflow） | 5 | WorkflowListView.vue, WorkflowCreateView.vue 等 |
| 文件管理（file） | 2 | FileListView.vue, FileUploadView.vue |
| 认证（auth） | 2 | LoginView.vue, RegisterView.vue |
| **合计** | **54** | - |

---

## 三、菜单结构基线

### 3.1 一级菜单（冻结）

| 序号 | 菜单名称 | 路径 | 图标 | 二级菜单数 |
|------|---------|------|------|-----------|
| 1 | 安全总览 | /overview | odometer | 5 |
| 2 | 风险管控 | /risk-control | warning | 6 |
| 3 | 隐患治理 | /hazard-governance | search | 4 |
| 4 | 现场管理 | /site-management | clipboard | 5 |
| 5 | 人员管理 | /personnel | user | 6 |
| 6 | 培训考核 | /training | reading | 7 |
| 7 | 应急管理 | /emergency | bell | 1 |
| 8 | 目标职责 | /objectives | aim | 3 |
| 9 | 制度标准 | /standards | document | 5 |
| 10 | 系统管理 | /system | setting | 3（+2隐藏） |
| **合计** | - | - | - | **46** |

### 3.2 二级菜单（冻结）

#### 安全总览
| 菜单 | 路径 | 权限码 |
|------|------|--------|
| 安全驾驶舱 | /overview/cockpit | hse:overview:cockpit:view |
| 集团驾驶舱 | /overview/executive | hse:overview:executive:view |
| 预警监控 | /overview/alerts | hse:overview:alerts:view |
| 通知公告 | /overview/notifications | hse:overview:notifications:view |
| 智能报告 | /overview/reports | hse:overview:reports:view |

#### 风险管控
| 菜单 | 路径 | 权限码 |
|------|------|--------|
| 风险分级管控 | /risk-control/classification | hse:risk:classification:view |
| 员工风险画像 | /risk-control/employee-risk | hse:risk:employee:view |
| 驾驶员风险 | /risk-control/driver-risk | hse:risk:driver:view |
| 事故管理 | /risk-control/accidents | hse:risk:accidents:view |
| 事故分析 | /risk-control/accident-analysis | hse:risk:analysis:view |
| AI风险分析 | /risk-control/ai-analysis | hse:risk:ai:view |

#### 隐患治理
| 菜单 | 路径 | 权限码 |
|------|------|--------|
| 隐患排查 | /hazard-governance/hazards | hse:hazard:hazards:view |
| 整改闭环 | /hazard-governance/rectification | hse:hazard:rectification:view |
| 预警中心 | /hazard-governance/warning | hse:hazard:warning:view |
| 统计分析 | /hazard-governance/statistics | hse:hazard:statistics:view |

#### 现场管理
| 菜单 | 路径 | 权限码 |
|------|------|--------|
| 三违管理 | /site-management/violations | hse:site:violations:view |
| 网格管理 | /site-management/grid | hse:site:grid:view |
| 消防设施 | /site-management/fire-facility | hse:site:fire:view |
| 车辆管理 | /site-management/vehicles | hse:site:vehicles:view |
| 现场检查 | /site-management/inspection | hse:site:inspection:view |

#### 人员管理
| 菜单 | 路径 | 权限码 |
|------|------|--------|
| 员工管理 | /personnel/employees | hse:personnel:employees:view |
| 组织管理 | /personnel/organization | hse:personnel:organization:view |
| 岗位管理 | /personnel/positions | hse:personnel:positions:view |
| 人员保险 | /personnel/insurance | hse:personnel:insurance:view |
| 超龄人员 | /personnel/over-age | hse:personnel:overage:view |
| 人员导入 | /personnel/import | hse:personnel:import:view |

#### 培训考核
| 菜单 | 路径 | 权限码 |
|------|------|--------|
| 培训计划 | /training/plan | hse:training:plan:view |
| 培训要求 | /training/requirements | hse:training:requirements:view |
| 培训台账 | /training/ledger | hse:training:ledger:view |
| 专项培训 | /training/special | hse:training:special:view |
| 培训统计 | /training/statistics | hse:training:statistics:view |
| 考核分析 | /training/assessment | hse:training:assessment:view |
| 安全履职考核 | /training/responsibility | hse:training:responsibility:view |

#### 应急管理
| 菜单 | 路径 | 权限码 |
|------|------|--------|
| 应急管理 | /emergency/index | hse:emergency:manage:view |

#### 目标职责
| 菜单 | 路径 | 权限码 |
|------|------|--------|
| 目标责任书 | /objectives/responsibility | hse:objectives:responsibility:view |
| 安委会管理 | /objectives/committee | hse:objectives:committee:view |
| 安全费用 | /objectives/budget | hse:objectives:budget:view |

#### 制度标准
| 菜单 | 路径 | 权限码 |
|------|------|--------|
| 规章制度 | /standards/regulations | hse:standards:regulations:view |
| 资料中心 | /standards/documents | hse:standards:documents:view |
| 标准条款 | /standards/clauses | hse:standards:clauses:view |
| 条款关联 | /standards/relation | hse:standards:relation:view |
| 标准化评价 | /standards/evaluation | hse:standards:evaluation:view |

#### 系统管理
| 菜单 | 路径 | 权限码 | 状态 |
|------|------|--------|------|
| 用户管理 | /system/users | hse:system:users:view | 可见 |
| 角色管理 | /system/roles | hse:system:roles:view | 可见 |
| 审计日志 | /system/audit | hse:system:audit:view | 可见 |
| 工作流引擎 | /system/workflow | hse:system:workflow:view | 隐藏 |
| 批量导入 | /system/batch-import | hse:system:batchimport:view | 隐藏 |

---

## 四、路由结构基线

### 4.1 路由分类

| 类型 | 数量 | 说明 |
|------|------|------|
| 常量路由（constantRoutes） | 5 | 无需权限：登录、注册、404、403、重定向 |
| 异步路由（asyncRoutes） | 10+46 | 需权限验证，动态加载 |
| 兼容重定向 | 12 | 旧路由重定向，保持历史访问兼容 |

### 4.2 路由守卫流程

```
用户访问
  ↓
beforeEach
  ↓
检查 Token
  ├─ 无 Token → 白名单? → 通过 : 跳转登录
  └─ 有 Token → 检查用户信息
                ├─ 无用户信息 → fetchUserInfo()
                └─ 有用户信息 → 检查路由状态
                                  ├─ 未生成路由 → fetchPermissions() + generateRoutes() + addRoute()
                                  └─ 已生成路由 → 更新面包屑/标签页
  ↓
next()
  ↓
afterEach（关闭 Loading）
```

### 4.3 路由元信息规范

```typescript
meta: {
  title: string        // 菜单标题
  icon?: string        // 菜单图标
  permission?: string  // 权限码（字符串，非数组）
  hidden?: boolean     // 是否隐藏菜单
  keepAlive?: boolean  // 是否缓存组件
  noAuth?: boolean     // 是否无需认证
}
```

---

## 五、权限机制基线

### 5.1 权限流程

```
用户登录
  ↓
auth.login()
  ↓
保存 Token
  ↓
路由守卫触发
  ↓
permission.fetchPermissions()
  ├─ 菜单：generateMenuItems()（前端HSE冻结结构）
  └─ 权限：getMenuTree()（后端） + getDefaultPermissions(role)（默认）
  ↓
合并去重 → permissions.value
  ↓
generateRoutes(asyncRoutes)（按权限过滤路由）
  ↓
router.addRoute()（动态添加路由）
  ↓
页面访问
```

### 5.2 角色权限矩阵

| 角色 | 权限来源 | 权限范围 |
|------|---------|---------|
| admin / system_admin | `['*']` + 后端权限 | 全部权限 |
| hse_manager | 默认权限 + 后端权限 | 全部业务模块（无用户/角色管理） |
| township_manager | 默认权限 + 后端权限 | 安全总览、风险管控（部分）、隐患治理（部分）、现场管理（部分）、培训考核（部分）、目标职责（部分） |
| manager | 默认权限 + 后端权限 | 全部查看权限 + 部分创建权限 |
| viewer | 默认权限 + 后端权限 | 安全驾驶舱、通知、隐患排查 |

### 5.3 权限码规范

```typescript
// 规则: hse:{module}:{sub}:{action}
// action: create / update / delete / audit / export / import / freeze / view

export const PERM_RISK_CLASSIFICATION_CREATE = 'hse:risk:classification:create'
export const PERM_RISK_CLASSIFICATION_UPDATE = 'hse:risk:classification:update'
export const PERM_RISK_CLASSIFICATION_DELETE = 'hse:risk:classification:delete'
export const PERM_RISK_CLASSIFICATION_EXPORT = 'hse:risk:classification:export'
```

### 5.4 前端菜单策略说明

**当前状态**：采用混合策略
- **菜单结构**：前端HSE冻结版本（`generateMenuItems()`）
- **权限数据**：后端获取 + 前端默认权限合并

**原因**：后端 `/api/core/menus/tree` 接口依赖 `user_role` 和 `role_menu` 表数据，当前数据不完整，无法可靠驱动菜单渲染。

**后续优化方向**：待后端菜单数据完整后，切换为后端菜单优先策略。

---

## 六、Layout说明

### 6.1 主布局结构

```
LayoutDefault.vue
├── LayoutSidebar.vue（侧边栏）
│   ├── Logo + 标题
│   ├── el-menu（动态菜单）
│   └── 折叠按钮
├── LayoutHeader.vue（顶部栏）
│   ├── 折叠按钮
│   ├── AlertNotification（告警通知）
│   ├── 主题切换
│   └── 用户下拉菜单
├── LayoutTabs.vue（标签页）
├── LayoutBreadcrumb.vue（面包屑）
└── el-main（内容区）
    └── router-view
```

### 6.2 布局特性

- **响应式侧边栏**：支持折叠/展开（宽度 64px / 220px）
- **标签页导航**：缓存访问过的页面，支持关闭
- **面包屑导航**：基于路由 meta.title 自动生成
- **Keep-Alive**：基于 meta.keepAlive 缓存组件

---

## 七、UI规范基线

### 7.1 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| UI框架 | Element Plus | ^2.7.6 |
| 前端框架 | Vue | ^3.4.31 |
| 状态管理 | Pinia | ^2.1.7 |
| 路由 | Vue Router | ^4.4.0 |
| 构建工具 | Vite | ^5.3.2 |
| 语言 | TypeScript | ^5.5.2 |

### 7.2 主题配置

- **当前主题**：light（浅色）
- **主题切换**：支持（`app.ts` → `toggleTheme()`）
- **CSS变量**：使用 Element Plus 内置变量（`--el-bg-color`、`--el-text-color-primary` 等）

### 7.3 视觉基线说明

#### 主Layout
- 文件：`src/components/layout/LayoutDefault.vue`
- 结构：侧边栏 + 顶部栏 + 标签页 + 面包屑 + 内容区
- 样式：基于 Element Plus Container 布局

#### 主题
- 文件：`src/stores/app.ts`
- 当前值：`light`
- 切换方式：通过顶部栏主题切换按钮

#### 菜单样式
- 组件：`LayoutSidebar.vue` + `SidebarMenuItem.vue`
- 特性：支持折叠、图标、多级嵌套
- 激活样式：Element Plus 默认蓝色高亮

#### 页面风格
- 布局：统一使用 LayoutDefault
- 内边距：`el-main` → `padding: 16px`
- 背景色：`var(--el-bg-color-page)`

#### 组件规范
- 业务组件：位于 `src/features/{module}/components/`
- 公共组件：位于 `src/components/`
- **禁止**：新增自定义 Layout、Menu、Tab 等基础组件

---

## 八、API调用基线

### 8.1 请求封装

```typescript
// src/api/client.ts
const client = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// 请求拦截器：自动携带 Token
client.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：解包 response.data.data，统一错误处理
client.interceptors.response.use(
  (response) => response.data.data,
  (error) => {
    if (error.response?.status === 401) {
      // Token 失效，跳转登录
    }
    return Promise.reject(error)
  }
)
```

### 8.2 统一响应格式

```typescript
// 后端响应格式（已冻结）
interface ApiResponse<T> {
  code: number       // 0=成功，其他=错误码
  success: boolean   // true/false
  message: string    // 提示信息
  data: T            // 业务数据
}

// 分页格式
interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}
```

### 8.3 字段转换规范

- **后端 → 前端**：snake_case 自动转换为 camelCase
- **前端 → 后端**：camelCase 转换为 snake_case
- **实现位置**：后端响应拦截器 + 前端请求参数转换

---

## 九、已知问题与后续优化

### 9.1 已知问题

| 序号 | 问题 | 影响 | 状态 |
|------|------|------|------|
| 1 | 后端菜单数据不完整（user_role/role_menu 表） | 前端采用混合策略，无法完全依赖后端菜单 | 待后端补全 |
| 2 | 部分旧路由仍保留重定向（兼容历史访问） | 路由表略大 | 可接受 |

### 9.2 后续优化建议

| 优先级 | 建议 | 说明 |
|--------|------|------|
| 高 | 补全后端 `menus` 表数据 | 使后端菜单数据与前端HSE冻结结构完全一致 |
| 高 | 补全 `user_role` 和 `role_menu` 表数据 | 确保所有用户角色映射正确 |
| 中 | 切换为后端菜单优先策略 | 待后端数据完整后实施 |
| 中 | 统一菜单数据源 | 前端 `generateMenuItems()` 与后端 `menus` 表保持同步 |
| 低 | 优化路由表结构 | 清理不必要的重定向路由 |

---

## 十、后续开发约束

### 10.1 禁止事项

| 禁止项 | 说明 |
|--------|------|
| 禁止修改一级菜单 | 10个一级菜单已冻结，不得新增、删除、重命名 |
| 禁止新增自定义 Layout | 必须使用 `LayoutDefault.vue`，不得创建新布局 |
| 禁止新增自定义 Menu | 必须使用 `SidebarMenuItem.vue`，不得创建新菜单组件 |
| 禁止更换 UI 框架 | 必须使用 Element Plus，不得引入 Ant Design Vue 等 |
| 禁止修改主题方案 | 主题切换基于 Element Plus，不得自定义主题系统 |
| 禁止修改权限码规范 | 权限码必须遵循 `hse:{module}:{sub}:{action}` 格式 |
| 禁止修改路由守卫逻辑 | `guards.ts` 流程已冻结，不得修改 |
| 禁止删除已有功能页面 | 所有业务页面必须保留，路由不得删除 |

### 10.2 允许事项

| 允许项 | 说明 |
|--------|------|
| 新增二级菜单 | 在现有一级菜单下新增子菜单，需遵循命名和权限规范 |
| 新增业务页面 | 在 `src/features/{module}/views/` 下新增 |
| 新增 API 模块 | 在 `src/api/modules/` 下新增，遵循统一响应格式 |
| 新增业务组件 | 在 `src/features/{module}/components/` 下新增 |
| 扩展权限码 | 在 `permission.ts` 中新增权限码常量 |

---

## 十一、系统入口验证

### 11.1 首页

| 项目 | 值 | 状态 |
|------|------|------|
| 首页路径 | /overview/cockpit | ✅ |
| 首页组件 | DashboardView.vue | ✅ |
| 首页权限 | hse:overview:cockpit:view | ✅ |

### 11.2 Vben模板残留检查

| 检查项 | 结果 |
|--------|------|
| analytics 残留 | 无 |
| welcome 残留 | 无 |
| workbench 残留 | 无 |
| dashboard 独立菜单 | 无（已作为安全总览子菜单） |
| Vben 引用 | 仅存在于 DEPRECATED.md 和 README_LEGACY.md（废弃文档） |

**结论**：不存在 Vben 默认模板页面误绑定问题。

---

## 十二、功能保护验证

| 功能模块 | 路由 | 组件 | API | 状态 |
|---------|------|------|-----|------|
| 安全驾驶舱 | /overview/cockpit | DashboardView.vue | dashboard.ts | ✅ |
| 预警监控 | /overview/alerts | AlertCenterView.vue | alert.ts | ✅ |
| 风险分级管控 | /risk-control/classification | RiskListView.vue | risk.ts | ✅ |
| 隐患排查 | /hazard-governance/hazards | HazardListView.vue | hazard.ts | ✅ |
| 三违管理 | /site-management/violations | ViolationListView.vue | - | ✅ |
| 员工管理 | /personnel/employees | UserListView.vue | user.ts | ✅ |
| 培训计划 | /training/plan | TrainingPlanView.vue | - | ✅ |
| 安全履职考核 | /training/responsibility | ResponsibilityAssessmentView.vue | assessment-monthly.ts | ✅ |
| 应急管理 | /emergency/index | EmergencyView.vue | - | ✅ |
| 目标责任书 | /objectives/responsibility | ResponsibilityView.vue | - | ✅ |
| 规章制度 | /standards/regulations | RegulationsView.vue | - | ✅ |
| 用户管理 | /system/users | UserListView.vue | user.ts | ✅ |
| 审计日志 | /system/audit | AuditLogView.vue | audit.ts | ✅ |

**结论**：所有已有功能页面、路由、API完整保留，功能可正常访问。

---

## 十三、完成标准验证

| 标准 | 状态 | 说明 |
|------|------|------|
| ✅ 左侧栏稳定 | 完成 | 10个一级菜单结构冻结 |
| ✅ 所有菜单可访问 | 完成 | 46个二级菜单路径正确，组件文件存在 |
| ✅ 不存在错误页面 | 完成 | 无 404、空白页、默认模板页 |
| ✅ 不存在Vben模板误绑定 | 完成 | analytics/welcome/workbench 均不存在 |
| ✅ 不新增自定义组件 | 完成 | 使用现有 Layout、Menu、Tab 组件 |
| ✅ 不改变UI技术路线 | 完成 | 持续使用 Element Plus |
| ✅ 前端进入冻结状态 | 完成 | 架构基线冻结，后续开发遵循约束 |

---

## 十四、交付物清单

| 文件 | 类型 | 说明 |
|------|------|------|
| Sprint10-D-4-3 HSE系统PC端前端架构基线冻结报告.md | 报告 | 本报告 |
| Sprint10-D-4-2-B-1 HSE系统左侧导航迁移后端路由与前端架构修正报告.md | 前置报告 | 架构修正依据 |

---

## 十五、冻结声明

**本报告为 Sprint10-D-4-3 任务最终交付物，HSE系统PC端前端架构自即日起进入冻结状态。**

后续所有前端开发必须遵循以下原则：
1. 遵守第十章"后续开发约束"
2. 新增功能必须在现有架构框架内开发
3. 不得破坏已冻结的菜单结构、路由守卫、权限机制
4. 如需修改架构，必须提出变更申请并经评审通过

**冻结日期**：2026-07-24
**生效版本**：Sprint10-D-4-3