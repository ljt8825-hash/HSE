# Sprint9.5 PC端系统架构设计报告

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint9.5
> 关联文档：
> - 《Sprint9.5 前后端接口联调报告》
> - 《Sprint9.5 数据库初始化报告》
> - 《Sprint9.5 系统贯通测试报告》

---

## 一、项目概述

### 1.1 建设背景

经过 Sprint6 至 Sprint9 的业务设计，HSE 智能运营平台已完成了风险体系、考核体系、智能预警、整改闭环、智能分析、AI 辅助决策和智能运营平台的业务设计工作，形成了完整的业务蓝图。当前进入 **Sprint9.5 PC 端系统工程化贯通阶段**，需要将所有业务设计转化为可运行的系统版本，完成前端、后端、数据库、接口的全链路打通。

### 1.2 建设目标

**完成 PC 端前端、后端服务、数据库、接口的完整打通，形成可运行的 HSE 平台版本。**

#### 1.2.1 技术目标

| 目标 | 技术栈 | 说明 |
|------|--------|------|
| 前端 | Vue 3 + TypeScript + Vite | PC 端单页应用 |
| 后端 | Spring Boot 3.2 + Java 17 | RESTful API 服务 |
| 数据库 | MySQL 8.0 | 数据持久化 |
| 接口 | REST API (JSON) | 前后端通信协议 |

#### 1.2.2 业务目标

| 链路 | 说明 |
|------|------|
| 员工风险链路 | Excel 员工数据 → 员工档案 → 风险计算 → 风险画像 |
| 预警整改链路 | 风险数据 → 预警生成 → 整改任务 → 处理 → 关闭 |
| 考核链路 | 指标数据 → 评分 → 排名 → 驾驶舱展示 |
| AI 接口预留 | AI 接口层预留，暂不接入模型 |

### 1.3 建设范围

| 模块 | 说明 |
|------|------|
| 认证权限 | 登录、权限、菜单、页面访问 |
| 员工风险 | 员工档案、风险计算、风险画像 |
| 预警整改 | 预警生成、整改任务、处理关闭 |
| 考核体系 | 指标评分、排名展示 |
| AI 接口 | 接口层预留 |

### 1.4 约束条件

| 约束 | 说明 |
|------|------|
| 禁止修改业务模型 | 不得修改已冻结的业务模型定义 |
| 只建设 AI 接口层 | AI 模块只建设接口层，不接入模型 |
| 技术栈确定 | 前端 Vue，后端 Spring Boot，数据库 MySQL |

---

## 二、技术架构

### 2.1 技术选型

#### 2.1.1 前端技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Vue | 3.x | 渐进式 JavaScript 框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 5.x | 前端构建工具 |
| Vue Router | 4.x | 路由管理 |
| Pinia | 2.x | 状态管理 |
| Element Plus | 2.x | UI 组件库 |
| ECharts | 5.x | 图表库 |
| Axios | 1.x | HTTP 请求 |

#### 2.1.2 后端技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Java | 17 | LTS 版本 |
| Spring Boot | 3.2.x | 应用框架 |
| Spring Security | 6.2.x | 安全框架 |
| Spring Data JPA | 3.2.x | 数据访问 |
| MySQL | 8.0.x | 关系型数据库 |
| Redis | 7.x | 缓存 |
| JWT | 0.12.x | Token 认证 |
| Lombok | 1.18.x | 简化代码 |
| MapStruct | 1.5.x | 对象映射 |
| SpringDoc OpenAPI | 2.3.x | API 文档 |

#### 2.1.3 数据库技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| MySQL | 8.0.x | 主数据库 |
| Redis | 7.x | 缓存/会话 |
| Nginx | 1.24.x | 反向代理/静态服务 |

### 2.2 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           客户端                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        Vue 3 SPA                                 │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │   │
│  │  │ 路由层   │ │ 状态层   │ │ 视图层   │ │ 组件层   │           │   │
│  │  │  (Vue   │ │ (Pinia)  │ │ (Views)  │ │ (Common) │           │   │
│  │  │  Router)│ │          │ │          │ │          │           │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │                     API 层 (Axios)                       │   │   │
│  │  │  请求拦截 | 响应拦截 | Token 管理 | 错误处理             │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS / REST API
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Nginx 反向代理                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  静态资源 → Vue 构建产物                                         │   │
│  │  /api/*  → Spring Boot 后端                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Spring Boot 后端服务                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Controller 层 (REST API 入口)                                   │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │   │
│  │  │ AuthController│ │ RiskController│ │ WarningController│        │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │   │
│  │  │ RectifyController│ │ AssessmentController│ │ AIController│     │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Service 层 (业务逻辑)                                          │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │   │
│  │  │ AuthService  │ │ RiskService  │ │ WarningService│             │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │   │
│  │  │ RectifyService│ │ AssessmentService│ │ AIService│           │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Repository 层 (数据访问)                                       │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │   │
│  │  │ UserRepo     │ │ EmployeeRepo │ │ RiskRepo      │             │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │   │
│  │  │ WarningRepo  │ │ RectifyRepo  │ │ AssessmentRepo│             │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  通用组件层                                                      │   │
│  │  SecurityConfig | GlobalExceptionHandler | CorsConfig           │   │
│  │  JwtTokenProvider | AuditLog                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          数据存储层                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     MySQL 8.0                                   │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │   │
│  │  │ 用户表       │ │ 员工表       │ │ 风险表       │             │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │   │
│  │  │ 预警表       │ │ 整改表       │ │ 考核表       │             │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Redis 7                                     │   │
│  │  会话缓存 | 数据缓存 | 限流                                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 三、前端架构

### 3.1 前端目录结构

```
hse-dashboard-web/
├── src/
│   ├── api/                          # API 接口层
│   │   ├── auth/                     # 认证接口
│   │   │   ├── login.ts
│   │   │   └── permission.ts
│   │   ├── risk/                     # 风险接口
│   │   │   ├── employee.ts
│   │   │   └── risk.ts
│   │   ├── warning/                  # 预警接口
│   │   │   └── warning.ts
│   │   ├── rectify/                  # 整改接口
│   │   │   └── rectify.ts
│   │   ├── assessment/               # 考核接口
│   │   │   └── assessment.ts
│   │   └── ai/                       # AI 接口
│   │       └── analysis.ts
│   │
│   ├── assets/                       # 静态资源
│   │   ├── images/
│   │   └── styles/
│   │
│   ├── components/                   # 公共组件
│   │   ├── common/
│   │   │   ├── PageContainer.vue
│   │   │   ├── SearchForm.vue
│   │   │   └── DataTable.vue
│   │   ├── charts/
│   │   │   ├── RiskGauge.vue
│   │   │   ├── TrendLine.vue
│   │   │   └── RankingBar.vue
│   │   └── business/
│   │       ├── RiskCard.vue
│   │       └── WarningBadge.vue
│   │
│   ├── composables/                  # 组合式函数
│   │   ├── useAuth.ts
│   │   ├── usePermission.ts
│   │   └── useNotification.ts
│   │
│   ├── layouts/                      # 布局组件
│   │   ├── MainLayout.vue            # 主布局
│   │   ├── BasicLayout.vue           # 基础布局（登录页等）
│   │   ├── components/
│   │   │   ├── Sidebar.vue
│   │   │   ├── Header.vue
│   │   │   └── TabsView.vue
│   │   └── index.ts
│   │
│   ├── router/                       # 路由配置
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── index.ts
│   │   │   ├── modules/
│   │   │   │   ├── risk.ts
│   │   │   │   ├── warning.ts
│   │   │   │   ├── rectify.ts
│   │   │   │   ├── assessment.ts
│   │   │   │   └── ai.ts
│   │   │   └── basic.ts
│   │   └── guard.ts
│   │
│   ├── stores/                       # Pinia 状态管理
│   │   ├── index.ts
│   │   ├── user.ts
│   │   ├── permission.ts
│   │   ├── app.ts
│   │   └── dict.ts
│   │
│   ├── utils/                        # 工具函数
│   │   ├── request.ts                # Axios 封装
│   │   ├── auth.ts                   # Token 管理
│   │   ├── format.ts                 # 格式化工具
│   │   └── validate.ts               # 校验工具
│   │
│   ├── views/                        # 页面视图
│   │   ├── login/
│   │   │   └── LoginView.vue
│   │   ├── dashboard/
│   │   │   └── DashboardView.vue
│   │   ├── risk/
│   │   │   ├── employee/
│   │   │   │   └── EmployeeList.vue
│   │   │   ├── profile/
│   │   │   │   └── RiskProfile.vue
│   │   │   └── calculation/
│   │   │       └── RiskCalc.vue
│   │   ├── warning/
│   │   │   ├── list/
│   │   │   │   └── WarningList.vue
│   │   │   └── detail/
│   │   │       └── WarningDetail.vue
│   │   ├── rectify/
│   │   │   ├── task/
│   │   │   │   └── RectifyTask.vue
│   │   │   └── process/
│   │   │       └── RectifyProcess.vue
│   │   ├── assessment/
│   │   │   ├── score/
│   │   │   │   └── ScoreView.vue
│   │   │   ├── ranking/
│   │   │   │   └── RankingView.vue
│   │   │   └── cockpit/
│   │   │       └── CockpitView.vue
│   │   └── ai/
│   │       └── analysis/
│   │           └── AIAnalysis.vue
│   │
│   ├── App.vue
│   └── main.ts
│
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

### 3.2 前端核心模块

| 模块 | 说明 | 核心功能 |
|------|------|----------|
| 路由层 | Vue Router | 路由配置、守卫、动态路由 |
| 状态层 | Pinia | 用户状态、权限状态、应用状态 |
| API 层 | Axios 封装 | 请求拦截、响应拦截、错误处理 |
| 视图层 | Views | 业务页面组件 |
| 组件层 | Components | 公共组件、业务组件 |

### 3.3 前端状态管理

```typescript
// stores/user.ts
export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    userInfo: null,
    roles: [],
    permissions: []
  }),
  actions: {
    async login(loginForm) { /* ... */ },
    async logout() { /* ... */ },
    async getUserInfo() { /* ... */ }
  }
})

// stores/permission.ts
export const usePermissionStore = defineStore('permission', {
  state: () => ({
    routes: [],
    dynamicRoutes: []
  }),
  actions: {
    async generateRoutes(roles) { /* ... */ }
  }
})
```

### 3.4 前端路由设计

```typescript
// router/routes/modules/risk.ts
const riskRoutes = {
  path: '/risk',
  component: MainLayout,
  redirect: '/risk/employee',
  meta: { title: '员工风险', icon: 'user', roles: ['admin', 'manager', 'user'] },
  children: [
    {
      path: 'employee',
      component: () => import('@/views/risk/employee/EmployeeList.vue'),
      meta: { title: '员工档案', icon: 'list' }
    },
    {
      path: 'profile/:id',
      component: () => import('@/views/risk/profile/RiskProfile.vue'),
      meta: { title: '风险画像', hidden: true }
    },
    {
      path: 'calculation',
      component: () => import('@/views/risk/calculation/RiskCalc.vue'),
      meta: { title: '风险计算', icon: 'calculator' }
    }
  ]
}
```

---

## 四、后端架构

### 4.1 后端目录结构

```
hse-dashboard-server/
├── src/
│   ├── main/
│   │   ├── java/com/hse/
│   │   │   ├── HseApplication.java        # 启动类
│   │   │   │
│   │   │   ├── common/                     # 通用模块
│   │   │   │   ├── config/
│   │   │   │   │   ├── SecurityConfig.java
│   │   │   │   │   ├── CorsConfig.java
│   │   │   │   │   ├── WebMvcConfig.java
│   │   │   │   │   └── OpenApiConfig.java
│   │   │   │   ├── exception/
│   │   │   │   │   ├── GlobalExceptionHandler.java
│   │   │   │   │   ├── BusinessException.java
│   │   │   │   │   └── UnauthorizedException.java
│   │   │   │   ├── response/
│   │   │   │   │   ├── Result.java
│   │   │   │   │   └── PageResult.java
│   │   │   │   ├── security/
│   │   │   │   │   ├── JwtTokenProvider.java
│   │   │   │   │   ├── JwtAuthenticationFilter.java
│   │   │   │   │   └── CustomUserDetailsService.java
│   │   │   │   ├── audit/
│   │   │   │   │   ├── AuditLog.java
│   │   │   │   │   └── AuditLogAspect.java
│   │   │   │   └── utils/
│   │   │   │       ├── SecurityUtils.java
│   │   │   │       └── DateUtils.java
│   │   │   │
│   │   │   ├── auth/                       # 认证模块
│   │   │   │   ├── controller/
│   │   │   │   │   └── AuthController.java
│   │   │   │   ├── service/
│   │   │   │   │   └── AuthService.java
│   │   │   │   ├── dto/
│   │   │   │   │   ├── request/
│   │   │   │   │   │   ├── LoginRequest.java
│   │   │   │   │   │   └── RefreshTokenRequest.java
│   │   │   │   │   └── response/
│   │   │   │   │       ├── LoginResponse.java
│   │   │   │   │       ├── UserInfoResponse.java
│   │   │   │   │       └── MenuResponse.java
│   │   │   │   └── vo/
│   │   │   │       └── UserVO.java
│   │   │   │
│   │   │   ├── risk/                       # 风险模块
│   │   │   │   ├── controller/
│   │   │   │   │   ├── EmployeeController.java
│   │   │   │   │   └── RiskController.java
│   │   │   │   ├── service/
│   │   │   │   │   ├── EmployeeService.java
│   │   │   │   │   └── RiskCalculationService.java
│   │   │   │   ├── repository/
│   │   │   │   │   └── EmployeeRepository.java
│   │   │   │   ├── entity/
│   │   │   │   │   └── Employee.java
│   │   │   │   ├── dto/
│   │   │   │   │   ├── request/
│   │   │   │   │   │   ├── EmployeeCreateRequest.java
│   │   │   │   │   │   └── EmployeeImportRequest.java
│   │   │   │   │   └── response/
│   │   │   │   │       ├── EmployeeResponse.java
│   │   │   │   │       └── RiskProfileResponse.java
│   │   │   │   └── mapper/
│   │   │   │       └── EmployeeMapper.java
│   │   │   │
│   │   │   ├── warning/                    # 预警模块
│   │   │   │   ├── controller/
│   │   │   │   │   └── WarningController.java
│   │   │   │   ├── service/
│   │   │   │   │   └── WarningService.java
│   │   │   │   ├── repository/
│   │   │   │   │   └── WarningRepository.java
│   │   │   │   ├── entity/
│   │   │   │   │   └── Warning.java
│   │   │   │   └── dto/
│   │   │   │       ├── request/
│   │   │   │       │   └── WarningQueryRequest.java
│   │   │   │       └── response/
│   │   │   │           └── WarningResponse.java
│   │   │   │
│   │   │   ├── rectify/                    # 整改模块
│   │   │   │   ├── controller/
│   │   │   │   │   └── RectifyController.java
│   │   │   │   ├── service/
│   │   │   │   │   └── RectifyService.java
│   │   │   │   ├── repository/
│   │   │   │   │   └── RectifyRepository.java
│   │   │   │   ├── entity/
│   │   │   │   │   └── Rectify.java
│   │   │   │   └── dto/
│   │   │   │       ├── request/
│   │   │   │       │   ├── RectifyCreateRequest.java
│   │   │   │       │   └── RectifyProcessRequest.java
│   │   │   │       └── response/
│   │   │   │           └── RectifyResponse.java
│   │   │   │
│   │   │   ├── assessment/                 # 考核模块
│   │   │   │   ├── controller/
│   │   │   │   │   ├── AssessmentController.java
│   │   │   │   │   └── CockpitController.java
│   │   │   │   ├── service/
│   │   │   │   │   ├── AssessmentService.java
│   │   │   │   │   └── CockpitService.java
│   │   │   │   ├── repository/
│   │   │   │   │   └── AssessmentRepository.java
│   │   │   │   ├── entity/
│   │   │   │   │   └── Assessment.java
│   │   │   │   └── dto/
│   │   │   │       ├── request/
│   │   │   │       │   └── ScoreCalculateRequest.java
│   │   │   │       └── response/
│   │   │   │           ├── AssessmentResponse.java
│   │   │   │           └── CockpitDataResponse.java
│   │   │   │
│   │   │   └── ai/                         # AI 模块（接口预留）
│   │   │       ├── controller/
│   │   │       │   └── AIAnalysisController.java
│   │   │       ├── service/
│   │   │       │   └── AIAnalysisService.java
│   │   │       └── dto/
│   │   │           ├── request/
│   │   │           │   └── AIAnalysisRequest.java
│   │   │           └── response/
│   │   │               └── AIAnalysisResponse.java
│   │   │
│   │   └── resources/
│   │       ├── application.yml
│   │       ├── application-dev.yml
│   │       ├── application-test.yml
│   │       └── application-prod.yml
│   │
│   └── test/
│       └── java/com/hse/
│           └── HseApplicationTests.java
│
├── mvnw
├── mvnw.cmd
├── pom.xml
└── README.md
```

### 4.2 后端分层架构

| 层次 | 包 | 说明 |
|------|-----|------|
| Controller | controller | REST API 入口，处理 HTTP 请求 |
| Service | service | 业务逻辑处理 |
| Repository | repository | 数据访问（继承 JpaRepository） |
| Entity | entity | 数据库实体映射 |
| DTO-Request | dto.request | 请求数据传输对象 |
| DTO-Response | dto.response | 响应数据传输对象 |
| Mapper | mapper | 对象转换（MapStruct） |

### 4.3 核心实体设计

#### 4.3.1 用户与权限

```java
// entity/User.java
@Entity
@Table(name = "sys_user")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false, unique = true)
    private String username;
    
    @Column(nullable = false)
    private String password;
    
    private String realName;
    private String phone;
    private String email;
    
    @Column(nullable = false)
    private Integer status = 1;
    
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(name = "sys_user_role",
        joinColumns = @JoinColumn(name = "user_id"),
        inverseJoinColumns = @JoinColumn(name = "role_id"))
    private List<Role> roles;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}

// entity/Role.java
@Entity
@Table(name = "sys_role")
public class Role {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false, unique = true)
    private String code;
    
    private String name;
    
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(name = "sys_role_permission",
        joinColumns = @JoinColumn(name = "role_id"),
        inverseJoinColumns = @JoinColumn(name = "permission_id"))
    private List<Permission> permissions;
}

// entity/Permission.java
@Entity
@Table(name = "sys_permission")
public class Permission {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    private String code;
    private String name;
    private String type; // menu / button / api
    private String path;
    private String icon;
}
```

#### 4.3.2 员工与风险

```java
// entity/Employee.java
@Entity
@Table(name = "hse_employee")
public class Employee {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "employee_code", unique = true)
    private String employeeCode;
    
    private String name;
    private String idCard;
    private String phone;
    
    @Column(name = "org_id")
    private Long orgId;
    
    @Column(name = "org_name")
    private String orgName;
    
    @Column(name = "position_id")
    private Long positionId;
    
    @Column(name = "position_name")
    private String positionName;
    
    @Column(name = "risk_score")
    private BigDecimal riskScore;
    
    @Column(name = "risk_level")
    private String riskLevel;
    
    @Column(name = "last_risk_calc_at")
    private LocalDateTime lastRiskCalcAt;
    
    private Integer status = 1;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
```

#### 4.3.3 预警与整改

```java
// entity/Warning.java
@Entity
@Table(name = "hse_warning")
public class Warning {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "warning_code", unique = true)
    private String warningCode;
    
    @Column(name = "warning_type")
    private String warningType;
    
    @Column(name = "warning_level")
    private String warningLevel;
    
    private String title;
    private String description;
    
    @Column(name = "source_id")
    private Long sourceId;
    
    @Column(name = "source_type")
    private String sourceType;
    
    @Column(name = "target_id")
    private Long targetId;
    
    @Column(name = "target_type")
    private String targetType;
    
    private String status;
    
    @Column(name = "assigned_to")
    private Long assignedTo;
    
    @Column(name = "deadline")
    private LocalDateTime deadline;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
}

// entity/Rectify.java
@Entity
@Table(name = "hse_rectify")
public class Rectify {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "rectify_code", unique = true)
    private String rectifyCode;
    
    @Column(name = "warning_id")
    private Long warningId;
    
    @Column(name = "employee_id")
    private Long employeeId;
    
    private String requirement;
    private String status;
    
    @Column(name = "handler_id")
    private Long handlerId;
    
    @Column(name = "deadline")
    private LocalDateTime deadline;
    
    @Column(name = "completed_at")
    private LocalDateTime completedAt;
    
    @Column(name = "effect_score")
    private BigDecimal effectScore;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
```

### 4.4 核心 Service 设计

#### 4.4.1 认证服务

```java
// service/AuthService.java
@Service
public class AuthService {
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private JwtTokenProvider jwtTokenProvider;
    
    public LoginResponse login(LoginRequest request) {
        // 验证用户名密码
        User user = userRepository.findByUsername(request.getUsername())
            .orElseThrow(() -> new BusinessException("用户不存在"));
        
        // 生成 Token
        String token = jwtTokenProvider.generateToken(user);
        
        // 返回登录信息
        return LoginResponse.builder()
            .token(token)
            .userInfo(getUserInfo(user))
            .build();
    }
    
    public UserInfoResponse getUserInfo(Long userId) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new BusinessException("用户不存在"));
        
        List<MenuResponse> menus = getMenus(user.getRoles());
        
        return UserInfoResponse.builder()
            .userId(user.getId())
            .username(user.getUsername())
            .realName(user.getRealName())
            .roles(user.getRoles().stream().map(Role::getCode).collect(Collectors.toList()))
            .menus(menus)
            .build();
    }
}
```

#### 4.4.2 风险计算服务

```java
// service/RiskCalculationService.java
@Service
public class RiskCalculationService {
    
    @Autowired
    private EmployeeRepository employeeRepository;
    
    /**
     * 计算单个员工的风险评分
     * 风险评分 = Σ(风险因素评分 × 权重)
     */
    public RiskProfileResponse calculateEmployeeRisk(Long employeeId) {
        Employee employee = employeeRepository.findById(employeeId)
            .orElseThrow(() -> new BusinessException("员工不存在"));
        
        // 1. 获取员工风险因素数据
        Map<String, BigDecimal> riskFactors = getRiskFactors(employee);
        
        // 2. 计算加权评分
        BigDecimal riskScore = calculateWeightedScore(riskFactors);
        
        // 3. 划分风险等级
        String riskLevel = determineRiskLevel(riskScore);
        
        // 4. 更新员工风险信息
        employee.setRiskScore(riskScore);
        employee.setRiskLevel(riskLevel);
        employee.setLastRiskCalcAt(LocalDateTime.now());
        employeeRepository.save(employee);
        
        // 5. 返回风险画像
        return RiskProfileResponse.builder()
            .employeeId(employeeId)
            .employeeName(employee.getName())
            .riskScore(riskScore)
            .riskLevel(riskLevel)
            .riskFactors(riskFactors)
            .calculatedAt(LocalDateTime.now())
            .build();
    }
    
    /**
     * 批量计算风险
     */
    public List<RiskProfileResponse> batchCalculateRisk(List<Long> employeeIds) {
        return employeeIds.stream()
            .map(this::calculateEmployeeRisk)
            .collect(Collectors.toList());
    }
    
    private BigDecimal calculateWeightedScore(Map<String, BigDecimal> factors) {
        // 权重分配：考勤 30%、违章 25%、培训 20%、绩效 15%、其他 10%
        Map<String, BigDecimal> weights = Map.of(
            "attendance", new BigDecimal("0.30"),
            "violation", new BigDecimal("0.25"),
            "training", new BigDecimal("0.20"),
            "performance", new BigDecimal("0.15"),
            "other", new BigDecimal("0.10")
        );
        
        return factors.entrySet().stream()
            .map(e -> {
                BigDecimal weight = weights.getOrDefault(e.getKey(), BigDecimal.ZERO);
                return e.getValue().multiply(weight);
            })
            .reduce(BigDecimal.ZERO, BigDecimal::add)
            .setScale(2, RoundingMode.HALF_UP);
    }
    
    private String determineRiskLevel(BigDecimal score) {
        if (score.compareTo(new BigDecimal("80")) >= 0) return "CRITICAL";
        if (score.compareTo(new BigDecimal("60")) >= 0) return "HIGH";
        if (score.compareTo(new BigDecimal("40")) >= 0) return "MEDIUM";
        return "LOW";
    }
}
```

#### 4.4.3 预警服务

```java
// service/WarningService.java
@Service
public class WarningService {
    
    @Autowired
    private WarningRepository warningRepository;
    
    @Autowired
    private RiskCalculationService riskCalculationService;
    
    /**
     * 根据风险数据自动生成预警
     */
    public Warning generateWarning(Long employeeId) {
        // 1. 获取员工风险信息
        RiskProfileResponse profile = riskCalculationService.calculateEmployeeRisk(employeeId);
        
        // 2. 检查是否触发预警规则
        if (shouldWarn(profile)) {
            Warning warning = Warning.builder()
                .warningCode(generateWarningCode())
                .warningType("RISK_SCORE")
                .warningLevel(profile.getRiskLevel())
                .title("员工风险评分异常")
                .description(buildDescription(profile))
                .sourceId(employeeId)
                .sourceType("EMPLOYEE")
                .targetId(employeeId)
                .targetType("EMPLOYEE")
                .status("PENDING")
                .deadline(calculateDeadline(profile.getRiskLevel()))
                .build();
            
            return warningRepository.save(warning);
        }
        return null;
    }
    
    /**
     * 处理预警
     */
    public Warning processWarning(Long warningId, String action) {
        Warning warning = warningRepository.findById(warningId)
            .orElseThrow(() -> new BusinessException("预警不存在"));
        
        // 处理预警状态流转
        switch (action) {
            case "ACCEPT":
                warning.setStatus("PROCESSING");
                break;
            case "IGNORE":
                warning.setStatus("IGNORED");
                break;
            case "ESCALATE":
                warning.setStatus("ESCALATED");
                warning.setWarningLevel("CRITICAL");
                break;
            default:
                throw new BusinessException("无效的操作类型");
        }
        
        return warningRepository.save(warning);
    }
    
    private boolean shouldWarn(RiskProfileResponse profile) {
        return profile.getRiskScore().compareTo(new BigDecimal("60")) >= 0;
    }
    
    private LocalDateTime calculateDeadline(String level) {
        return switch (level) {
            case "CRITICAL" -> LocalDateTime.now().plusHours(1);
            case "HIGH" -> LocalDateTime.now().plusHours(24);
            case "MEDIUM" -> LocalDateTime.now().plusDays(3);
            default -> LocalDateTime.now().plusDays(7);
        };
    }
}
```

#### 4.4.4 整改服务

```java
// service/RectifyService.java
@Service
public class RectifyService {
    
    @Autowired
    private RectifyRepository rectifyRepository;
    
    @Autowired
    private WarningRepository warningRepository;
    
    /**
     * 根据预警创建整改任务
     */
    public Rectify createFromWarning(Long warningId, RectifyCreateRequest request) {
        Warning warning = warningRepository.findById(warningId)
            .orElseThrow(() -> new BusinessException("预警不存在"));
        
        Rectify rectify = Rectify.builder()
            .rectifyCode(generateRectifyCode())
            .warningId(warningId)
            .employeeId(warning.getTargetId())
            .requirement(request.getRequirement())
            .status("PENDING")
            .handlerId(request.getHandlerId())
            .deadline(request.getDeadline())
            .build();
        
        return rectifyRepository.save(rectify);
    }
    
    /**
     * 处理整改任务
     */
    public Rectify processRectify(Long rectifyId, RectifyProcessRequest request) {
        Rectify rectify = rectifyRepository.findById(rectifyId)
            .orElseThrow(() -> new BusinessException("整改任务不存在"));
        
        switch (request.getAction()) {
            case "ACCEPT":
                rectify.setStatus("PROCESSING");
                break;
            case "COMPLETE":
                rectify.setStatus("COMPLETED");
                rectify.setCompletedAt(LocalDateTime.now());
                if (request.getEffectScore() != null) {
                    rectify.setEffectScore(request.getEffectScore());
                }
                break;
            case "CLOSE":
                rectify.setStatus("CLOSED");
                rectify.setCompletedAt(LocalDateTime.now());
                break;
            case "REJECT":
                rectify.setStatus("REJECTED");
                break;
            default:
                throw new BusinessException("无效的操作类型");
        }
        
        return rectifyRepository.save(rectify);
    }
}
```

### 4.5 AI 接口层（预留）

```java
// controller/AIAnalysisController.java
@RestController
@RequestMapping("/api/ai")
@Tag(name = "AI 分析")
public class AIAnalysisController {
    
    @Autowired
    private AIAnalysisService aiAnalysisService;
    
    @PostMapping("/risk-analysis")
    @Operation(summary = "AI 风险分析")
    public Result<AIAnalysisResponse> riskAnalysis(@RequestBody AIAnalysisRequest request) {
        return Result.success(aiAnalysisService.analyzeRisk(request));
    }
    
    @PostMapping("/rectify-suggestion")
    @Operation(summary = "AI 整改建议")
    public Result<AIAnalysisResponse> rectifySuggestion(@RequestBody AIAnalysisRequest request) {
        return Result.success(aiAnalysisService.suggestRectify(request));
    }
}

// service/AIAnalysisService.java
@Service
public class AIAnalysisService {
    
    /**
     * AI 分析接口（预留）
     * 后续接入 AI 模型后实现
     */
    public AIAnalysisResponse analyzeRisk(AIAnalysisRequest request) {
        // TODO: 接入 AI 模型
        return AIAnalysisResponse.builder()
            .analysisType("RISK_ANALYSIS")
            .targetId(request.getTargetId())
            .targetType(request.getTargetType())
            .suggestion("AI 分析接口已预留，待模型接入")
            .confidence(BigDecimal.ZERO)
            .analyzedAt(LocalDateTime.now())
            .build();
    }
}
```

---

## 五、安全架构

### 5.1 认证流程

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 客户端   │ →  │ 服务器   │ →  │ 认证服务 │ →  │ 签发 JWT │
│ 登录请求 │    │ 验证用户 │    │ 验证密码 │    │ 返回 Token│
└──────────┘    └──────────┘    └──────────┘    └──────────┘
      │                                                  │
      │ ← Token                                         │ ← 用户信息
      ▼                                                  │
┌──────────┐    ┌──────────┐    ┌──────────┐            │
│ 客户端   │ →  │ 每次请求 │ →  │ JwtFilter│            │
│ 带 Token │    │ 带 Token │    │ 解析验证 │←───────────┘
└──────────┘    └──────────┘    └──────────┘
                                      │
                                      ▼
                                 ┌──────────┐
                                 │ 权限校验 │
                                 └──────────┘
```

### 5.2 安全配置

```java
// config/SecurityConfig.java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/public/**").permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class);
        
        return http.build();
    }
    
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
    
    @Bean
    public JwtAuthenticationFilter jwtAuthenticationFilter() {
        return new JwtAuthenticationFilter();
    }
}
```

### 5.3 权限模型

| 角色 | 权限范围 | 说明 |
|------|----------|------|
| admin | 全部权限 | 系统管理员 |
| safety_manager | 风险、预警、整改、考核 | 安全管理员 |
| department_manager | 本部门权限 | 部门经理 |
| grid_leader | 网格权限 | 网格长 |
| user | 基础权限 | 普通用户 |

---

## 六、部署架构

### 6.1 开发环境

```
开发机（Windows/Mac）
├── 前端开发：VS Code + Node.js
├── 后端开发：IDEA + JDK 17
├── 数据库：Docker Compose 启动 MySQL + Redis
└── 接口调试：Postman / Swagger UI
```

### 6.2 本地运行

```bash
# 1. 启动数据库
cd docker
docker-compose up -d

# 2. 启动后端
cd hse-dashboard-server
mvn spring-boot:run

# 3. 启动前端
cd hse-dashboard-web
npm install
npm run dev
```

### 6.3 生产部署

```
┌─────────────────────────────────────────────────────────────┐
│                      生产服务器                              │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Docker Compose                                      │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐             │   │
│  │  │ Nginx   │  │ Spring  │  │ MySQL   │             │   │
│  │  │ (80/443)│  │ Boot    │  │ 8.0     │             │   │
│  │  └─────────┘  │ (8080)  │  └─────────┘             │   │
│  │               └─────────┘                           │   │
│  │  ┌─────────┐                                        │   │
│  │  │ Redis   │                                        │   │
│  │  │ (6379)  │                                        │   │
│  │  └─────────┘                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Nginx → 前端静态资源                                       │
│  Nginx → /api/* → Spring Boot                              │
│  Spring Boot → MySQL + Redis                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 Docker Compose 配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: hse_dashboard
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./init/sql:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/conf:/etc/nginx/conf.d
      - ./hse-dashboard-web/dist:/usr/share/nginx/html

  app:
    image: hse-dashboard:latest
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=prod
      - MYSQL_HOST=mysql
      - MYSQL_PORT=3306
      - MYSQL_DATABASE=hse_dashboard
      - MYSQL_USER=${MYSQL_USER}
      - MYSQL_PASSWORD=${MYSQL_PASSWORD}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_started

volumes:
  mysql_data:
  redis_data:
```

---

## 七、配置说明

### 7.1 后端配置

```yaml
# application.yml
server:
  port: 8080

spring:
  application:
    name: hse-dashboard
  
  datasource:
    url: jdbc:mysql://localhost:3306/hse_dashboard?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai
    username: root
    password: ${DB_PASSWORD}
    driver-class-name: com.mysql.cj.jdbc.Driver
  
  data:
    redis:
      host: localhost
      port: 6379
  
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
    properties:
      hibernate:
        format_sql: true
        dialect: org.hibernate.dialect.MySQLDialect

jwt:
  secret: ${JWT_SECRET}
  expiration: 86400000
  header: Authorization
  prefix: "Bearer "

logging:
  level:
    com.hse: DEBUG
    org.hibernate.SQL: DEBUG
```

### 7.2 前端配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
})
```

---

## 八、工程规范

### 8.1 代码规范

| 规范 | 说明 |
|------|------|
| 命名规范 | 类名大驼峰、方法小驼峰、常量全大写 |
| 注释规范 | 类、方法、字段添加 Javadoc |
| 异常处理 | 不捕获异常，向上抛出统一处理 |
| 日志规范 | SLF4J 打印关键业务日志 |
| DTO 规范 | 请求和响应分离，不暴露 Entity |

### 8.2 Git 规范

| 规范 | 说明 |
|------|------|
| 分支命名 | feature/xxx、bugfix/xxx、hotfix/xxx |
| 提交信息 | feat: xxx、fix: xxx、docs: xxx |
| 代码审查 | 合并前需 Code Review |

### 8.3 接口规范

| 规范 | 说明 |
|------|------|
| URL 规范 | /api/{模块}/{资源}，小写+中划线 |
| 方法规范 | GET 查询、POST 创建、PUT 更新、DELETE 删除 |
| 返回规范 | Result<T> 统一响应包装 |
| 分页规范 | PageResult<T> 分页响应包装 |

---

## 九、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | Sprint9.5 初始版本 |