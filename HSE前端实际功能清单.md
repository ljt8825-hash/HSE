# HSE 前端实际功能清单

> **文档性质**：前端资产审计报告（只读扫描，未修改任何文件）
> **扫描范围**：F:\deploy\hse-dashboard\安全看板vben\apps\web-antd\src\
> **审计日期**：2026-07-24
> **任务编号**：Sprint10-D-1-3

---

## 一、审计概览

本次审计扫描前端 Vben Admin（apps/web-antd）的全部路由模块、视图组件、API 层、Store 和公共组件。

| 维度 | 数量 |
|------|------|
| 路由模块文件 | 21 个（hse-*.ts + dashboard.ts） |
| 一级菜单 | 23 个 |
| 二级菜单 | 50+ 个 |
| Vue 页面组件 | 110+ 个 |
| HSE 公共组件 | 7 个 |
| API 模块 | 17 个（src/api/hse/） |
| Store 模块 | 3 个（alerts/auth/workflow） |

---

## 二、路由菜单树完整清单

### 2.1 仪表盘（dashboard.ts）
- **路径**：/dashboard
- **图标**：lucide:layout-dashboard
- **order**：-1
- **权限**：无（公开访问）

| 二级菜单 | 路径 | 组件 | 图标 |
|---------|------|------|------|
| 数据分析 | /analytics | views/dashboard/analytics/index.vue | lucide:area-chart |
| 工作空间 | /workspace | views/dashboard/workspace/index.vue | carbon:workspace |

---

### 2.2 告警中心（hse-center.ts）
- **路径**：/hse/alerts
- **图标**：lucide:bell
- **order**：1
- **权限**：['admin']
- **组件**：views/hse/alerts/index.vue
- **状态**：keepAlive: true

---

### 2.3 工作流引擎（hse-center.ts）
- **路径**：/hse/workflow
- **图标**：lucide:git-branch
- **order**：2
- **权限**：['admin']
- **组件**：views/hse/workflow/index.vue
- **状态**：keepAlive: true

---

### 2.4 目标职责管理（hse-objectives.ts）
- **路径**：/objectives
- **图标**：lucide:target
- **order**：3
- **权限**：['admin']

| 二级菜单 | 路径 | 组件 | 图标 |
|---------|------|------|------|
| 目标责任书管理 | /objectives/responsibility | views/goals/index.vue | lucide:file-check |
| 安全人员及安委会 | /objectives/committee | views/objectives/committee/index.vue | lucide:users-round |
| 责任制及考核 | /objectives/assessment | views/objectives/assessment/index.vue | lucide:clipboard-check |
| 安全费用预算及支出 | /objectives/budget | views/objectives/budget/index.vue | lucide:banknote |

---

### 2.5 规章制度（hse-regulations.ts）
- **路径**：/regulations
- **图标**：lucide:book-open
- **order**：4
- **权限**：['admin']
- **组件**：views/regulations/index.vue
- **状态**：keepAlive: true（单页菜单，无子菜单）

---

### 2.6 培训管理（hse-training.ts）
- **路径**：/training
- **图标**：lucide:graduation-cap
- **order**：5
- **权限**：['admin']

| 二级菜单 | 路径 | 组件 | 图标 |
|---------|------|------|------|
| 培训计划 | /training/plan | views/training/index.vue | lucide:calendar-check |
| 培训要求 | /training/requirements | views/training/requirements/index.vue | lucide:list-checks |
| 年度计划 | /training/plans | views/training/plans/index.vue | lucide:calendar-days |
| 培训台账 | /training/ledger | views/training/ledger/index.vue | lucide:book-text |
| 新员工培训 | /training/new-employee | views/training/new-employee/index.vue | lucide:user-plus |
| 驾驶员实操 | /training/driver | views/training/driver/index.vue | lucide:car |
| 培训统计 | /training/stats | views/training/stats/index.vue | lucide:bar-chart-3 |
| 培训分析 | /training/analysis | views/training/analysis/index.vue | lucide:pie-chart |
| 培训提醒 | /training/reminders | views/training/reminders/index.vue | lucide:bell-ring |
| 计划执行 | /training/execute | views/training/execute/index.vue | lucide:play-circle |

---

### 2.7 三违管理（hse-violations.ts）
- **路径**：/violations
- **图标**：lucide:alert-triangle
- **order**：6
- **权限**：['admin']
- **组件**：views/violations/index.vue
- **状态**：keepAlive: true（单页菜单，无子菜单）

---

### 2.8 现场管理（hse-inspection.ts）
- **路径**：/inspection
- **图标**：lucide:clipboard-check
- **order**：6
- **权限**：['admin']

| 二级菜单 | 路径 | 组件 | 图标 |
|---------|------|------|------|
| "三违"管理 | /inspection/violation | views/inspection/index.vue | lucide:shield-alert |
| 消防设施管理 | /inspection/fire-facility | views/inspection/fire-facility/index.vue | lucide:flame |
| 网格管理 | /inspection/grid | views/inspection/grid/index.vue | lucide:layout-grid |

---

### 2.9 人员主数据（hse-employee.ts）
- **路径**：/hse/employee
- **图标**：lucide:users
- **order**：5
- **权限**：['admin', 'safety_manager']

| 二级菜单 | 路径 | 组件 | 图标 |
|---------|------|------|------|
| 员工列表 | /hse/employee/list | views/hse/employee/index.vue | lucide:user-list |
| 组织管理 | /hse/employee/departments | views/hse/employee/departments.vue | lucide:git-fork |
| 岗位管理 | /hse/employee/positions | views/hse/employee/positions.vue | lucide:briefcase |

---

### 2.10 员工花名册导入（hse-employee-import-v2.ts）
- **路径**：/hse/employee-import-v2
- **图标**：lucide:file-spreadsheet
- **order**：6
- **权限**：['admin', 'safety_manager']

| 二级菜单 | 路径 | 组件 | 图标 |
|---------|------|------|------|
| 批次管理 | /hse/employee-import-v2/list | views/hse/employee-import-v2/index.vue | lucide:list |

---

### 2.11 员工档案中心（hse-employee-profile.ts）
- **路径**：/hse/employee-profile
- **图标**：lucide:user-circle
- **order**：7
- **权限**：['admin', 'safety_manager', 'employee']

| 二级菜单 | 路径 | 组件 | 图标 |
|---------|------|------|------|
| 员工档案 | /hse/employee-profile/list | views/hse/employee-profile/index.vue | lucide:users |

---

### 2.12 安全风险管控（hse-risk-control.ts）
- **路径**：/risk-control
- **图标**：lucide:shield
- **order**：7
- **权限**：['admin']
- **组件**：views/risk-control/index.vue
- **状态**：keepAlive: true（单页菜单，无子菜单）

---

### 2.13 隐患排查治理（hse-hazards.ts）
- **路径**：/hazards
- **图标**：lucide:shield-alert
- **order**：8
- **权限**：['admin']
- **组件**：views/hazards/index.vue
- **状态**：keepAlive: true（单页菜单，无子菜单）

---

### 2.14 应急管理（hse-emergency.ts）
- **路径**：/emergency
- **图标**：lucide:siren
- **order**：9
- **权限**：['admin']
- **组件**：views/emergency/index.vue
- **状态**：keepAlive: true（单页菜单，无子菜单）

---

### 2.15 事故管理（hse-accidents.ts）
- **路径**：/accidents
- **图标**：lucide:alert-circle
- **order**：10
- **权限**：['admin']
- **组件**：views/accidents/index.vue
- **状态**：keepAlive: true（单页菜单，无子菜单）

---

### 2.16 保险及人员管理（hse-insurance.ts）
- **路径**：/insurance
- **图标**：lucide:shield-check
- **order**：11
- **权限**：['admin']

| 二级菜单 | 路径 | 组件 | 图标 |
|---------|------|------|------|
| 车辆保险管理 | /insurance/vehicle | views/insurance/vehicle/index.vue | lucide:truck |
| 人员保险管理 | /insurance/personnel | views/insurance/personnel/index.vue | lucide:user-check |
| 超龄人员管理 | /insurance/over-age | views/insurance/over-age/index.vue | lucide:timer |

---

### 2.17 系统管理（hse-system.ts）
- **路径**：/system
- **图标**：lucide:settings
- **order**：12
- **权限**：['admin']

| 二级菜单 | 路径 | 组件 | 图标 |
|---------|------|------|------|
| 用户管理 | /system/users | views/system/users/index.vue | lucide:users |
| 角色管理 | /system/roles | views/system/roles/index.vue | lucide:shield |

---

### 2.18 安全审计（hse-security.ts）
- **路径**：/security
- **图标**：lucide:file-text
- **order**：13
- **权限**：['admin']

| 二级菜单 | 路径 | 组件 | 图标 |
|---------|------|------|------|
| 审计日志 | /security/audit | views/security/audit/index.vue | lucide:clipboard-list |

---

### 2.19 通知中心（hse-center.ts）
- **路径**：/hse/notifications
- **图标**：lucide:bell-ring
- **order**：14
- **权限**：['admin']
- **组件**：views/hse/notifications/index.vue
- **状态**：keepAlive: true

---

### 2.20 高级分析（hse-advanced.ts）
- **路径**：/hse-advanced
- **图标**：lucide:sparkles
- **order**：15
- **权限**：['admin', 'safety_manager', 'group_leader', 'department_manager', 'township_manager', 'area_manager']

| 二级菜单 | 路径 | 组件 | 图标 |
|---------|------|------|------|
| HSE驾驶舱 | /hse-advanced/cockpit | views/hse/cockpit/index.vue | lucide:layout-dashboard |
| 驾驶员风险中心 | /hse-advanced/driver-risk-center | views/hse/driver-risk-center/index.vue | lucide:car |
| 事故分析中心 | /hse-advanced/accident-analysis | views/hse/accident-analysis/index.vue | lucide:flame |
| 考核分析中心 | /hse-advanced/assessment-analysis | views/hse/assessment-analysis/index.vue | lucide:clipboard-list |
| 集团智能驾驶舱 | /hse-advanced/executive-cockpit | views/hse/executive-cockpit/index.vue | lucide:monitor-dot |
| 预警与整改中心 | /hse-advanced/warning-center | views/hse/warning-center/index.vue | lucide:shield-alert |
| BI数据看板 | /hse-advanced/bi | views/hse/bi/index.vue | lucide:bar-chart-3 |
| AI智能分析 | /hse-advanced/ai-analysis | views/hse/ai-analysis/index.vue | lucide:brain-circuit |
| IoT物联网 | /hse-advanced/iot | views/hse/iot/index.vue | lucide:radio |
| 供应链安全 | /hse-advanced/supply-chain | views/hse/supply-chain/index.vue | lucide:truck |
| 员工风险画像详情 | /hse-advanced/risk-profile/:employeeId | views/hse/risk-profile-detail/index.vue | lucide:user-circle |

> **注**：员工风险画像详情为动态参数路由，配置 hideInMenu: true，菜单中不显示

---

### 2.21 安全资料中心（hse-documents.ts）
- **路径**：/hse-documents
- **图标**：lucide:folder-open
- **order**：20
- **权限**：['admin']

| 二级菜单 | 路径 | 组件 | 图标 |
|---------|------|------|------|
| 文件库 | /hse-documents/library | views/hse/documents/library/index.vue | lucide:file-text |
| 文件审核 | /hse-documents/review | views/hse/documents/review/index.vue | lucide:check-square |

---

### 2.22 标准化评价（hse-standard.ts）
- **路径**：/hse/standard
- **图标**：lucide:clipboard-check
- **order**：25
- **权限**：['admin', 'safety_manager']

| 二级菜单 | 路径 | 组件 | 图标 |
|---------|------|------|------|
| 标准条款库 | /hse/standard/clauses | views/hse/standard/index.vue | lucide:list-tree |
| 条款资料关联 | /hse/standard/relation | views/hse/standard/relation/index.vue | lucide:link |
| 匹配建议 | /hse/standard/suggestions | views/hse/standard/relation/suggestions.vue | lucide:sparkles |

---

### 2.23 批量导入（hse-batch-import.ts）
- **路径**：/hse/batch-import
- **图标**：lucide:upload-cloud
- **order**：26
- **权限**：['admin', 'safety_manager', 'safety_officer']

| 二级菜单 | 路径 | 组件 | 图标 |
|---------|------|------|------|
| 导入任务 | /hse/batch-import/tasks | views/hse/batch-import/index.vue | lucide:list |

---

## 三、前端 API 层清单

### 3.1 API 模块目录

扫描目录：`src/api/hse/`

| API 文件 | 对应业务模块 | 主要接口 |
|---------|-------------|---------|
| accidents.ts | 事故管理 | 事故列表、详情、统计 |
| alerts.ts | 告警中心 | 告警列表、处理、统计 |
| assessment.ts | 考核管理 | 考核分析、指标、排名 |
| audit.ts | 安全审计 | 审计日志查询 |
| cockpit.ts | 驾驶舱 | 驾驶舱指标、风险概览 |
| documents.ts | 安全资料中心 | 文件上传、审核、分类 |
| emergency.ts | 应急管理 | 应急预案、演练 |
| employee.ts | 人员主数据 | 员工CRUD、组织、岗位 |
| goals.ts | 目标职责 | 目标责任书、安委会 |
| inspection.ts | 现场管理 | 三违、消防、网格 |
| insurance.ts | 保险管理 | 车辆保险、人员保险、超龄 |
| reports.ts | 智能报告 | 报告生成、预览、导出 |
| site.ts | 现场管理 | 现场检查 |
| system.ts | 系统管理 | 用户、角色、菜单 |
| training.ts | 培训管理 | 培训计划、台账、统计 |
| violations.ts | 三违管理 | 三违记录、统计 |
| workflow.ts | 工作流 | 工作流定义、实例、任务 |

### 3.2 核心 API 层

| API 文件 | 用途 |
|---------|------|
| src/api/core/auth.ts | 认证登录 |
| src/api/core/index.ts | 核心 API 入口 |
| src/api/core/menu.ts | 菜单获取 |
| src/api/core/user.ts | 用户信息 |
| src/api/index.ts | API 总入口 |
| src/api/request.ts | Axios 请求封装 |

---

## 四、前端 Store 清单

扫描目录：`src/store/`

| Store 文件 | 用途 | 关键状态 |
|-----------|------|---------|
| alerts.ts | 告警状态管理 | 告警列表、未读数量、WebSocket 实时推送 |
| auth.ts | 认证状态管理 | 登录状态、用户信息、Token |
| workflow.ts | 工作流状态管理 | 工作流实例、待办任务 |

---

## 五、前端公共组件清单

扫描目录：`src/components/hse/`

| 组件文件 | 用途 |
|---------|------|
| EmployeeSelector.vue | 员工选择器（通用人员选择组件） |
| ImportModal.vue | 通用导入弹窗 |
| ComponentVisibilitySettings.vue | 组件显示隐藏配置（驾驶舱拖拽配套） |
| ImportButtonGroup.vue | 导入按钮组 |
| StatCard.vue | 统计卡片（驾驶舱指标卡） |
| SortableStatRow.vue | 可拖拽排序的统计行 |
| RiskMapDrawer.vue | 风险地图抽屉 |

---

## 六、页面组件详情

### 6.1 驾驶舱页面组件（views/hse/cockpit/）

| 组件 | 用途 |
|------|------|
| index.vue | HSE 驾驶舱主页面 |
| ManagementExecution.vue | 管理执行概览 |
| RiskTop.vue | 风险 TOP 排行 |
| RiskTrend.vue | 风险趋势图 |
| RiskTypeAnalysis.vue | 风险类型分析 |
| LevelDistribution.vue | 风险等级分布 |
| RiskOverview.vue | 风险概览 |

### 6.2 考核分析页面组件（views/hse/assessment-analysis/）

| 组件 | 用途 |
|------|------|
| index.vue | 考核分析主页 |
| AssessmentOverview.vue | 考核概览 |
| DeductionDetail.vue | 扣分明细 |
| DeductionAnalysis.vue | 扣分分析 |
| TargetProgress.vue | 目标进度 |
| IndicatorAnalysis.vue | 指标分析 |
| DepartmentRanking.vue | 部门排名 |
| TownshipRanking.vue | 乡镇排名 |
| GoalsAssociation.vue | 目标关联 |

### 6.3 事故分析页面组件（views/hse/accident-analysis/）

| 组件 | 用途 |
|------|------|
| index.vue | 事故分析主页 |
| AccidentOverview.vue | 事故概览 |
| AccidentClassification.vue | 事故分类 |
| AccidentTrend.vue | 事故趋势 |
| ResponsibleAnalysis.vue | 责任分析 |

### 6.4 驾驶员风险中心页面组件（views/hse/driver-risk-center/）

| 组件 | 用途 |
|------|------|
| index.vue | 驾驶员风险中心主页 |
| RiskOverview.vue | 风险概览 |
| TopRanking.vue | 风险排名 |
| LevelDistribution.vue | 等级分布 |
| RiskComposition.vue | 风险构成 |
| AccidentAnalysis.vue | 事故分析 |
| DemeritAnalysis.vue | 扣分分析 |

### 6.5 员工风险画像详情页面组件（views/hse/risk-profile-detail/）

| 组件 | 用途 |
|------|------|
| index.vue | 风险画像详情主页 |
| BasicInfo.vue | 基础信息 |
| RiskOverview.vue | 风险概览 |
| RiskComposition.vue | 风险构成 |
| RiskTrend.vue | 风险趋势 |
| RiskEvents.vue | 风险事件 |

### 6.6 员工管理页面组件（views/hse/employee/）

| 组件 | 用途 |
|------|------|
| index.vue | 员工列表 |
| departments.vue | 组织管理 |
| positions.vue | 岗位管理 |
| components/EmployeeImportModal.vue | 员工导入弹窗 |
| components/EmployeeEditModal.vue | 员工编辑弹窗 |
| components/OrgTransferModal.vue | 组织调转弹窗 |
| components/EmployeeHistoryDrawer.vue | 人事变动抽屉 |

### 6.7 其他关键页面组件

| 路径 | 用途 |
|------|------|
| views/hse/standard/index.vue | 标准条款库 |
| views/hse/standard/relation/index.vue | 条款资料关联 |
| views/hse/standard/components/ClauseEditModal.vue | 条款编辑弹窗 |
| views/hse/standard/components/ImportModal.vue | 标准导入弹窗 |
| views/hse/documents/library/index.vue | 文件库 |
| views/hse/documents/library/components/UploadModal.vue | 文件上传弹窗 |
| views/hse/documents/library/components/DocumentAiAnalysis.vue | 文档AI分析 |
| views/hse/documents/review/index.vue | 文件审核 |
| views/hse/reports/index.vue | 智能报告 |
| views/hse/reports/components/ReportGeneratorCard.vue | 报告生成卡片 |
| views/hse/reports/components/ReportViewerDrawer.vue | 报告预览抽屉 |
| views/hse/reports/components/ReportListTable.vue | 报告列表 |
| views/hse/reports/components/ExportDropdown.vue | 导出下拉 |
| views/hse/batch-import/index.vue | 批量导入 |
| views/hse/batch-import/components/BatchImportDrawer.vue | 批量导入抽屉 |
| views/hse/employee-import-v2/index.vue | 花名册导入V2 |
| views/hse/employee-profile/index.vue | 员工档案 |
| views/hse/warning-center/index.vue | 预警与整改中心 |
| views/hse/executive-cockpit/index.vue | 集团智能驾驶舱 |
| views/hse/ai-analysis/index.vue | AI智能分析 |
| views/hse/bi/index.vue | BI数据看板 |
| views/hse/iot/index.vue | IoT物联网 |
| views/hse/supply-chain/index.vue | 供应链安全 |

---

## 七、关键审计发现

### 7.1 菜单结构问题

1. **一级菜单过多**：23 个一级菜单，远超企业级系统推荐的 5-8 个
2. **order 排序冲突**：
   - order:6 被 3 个菜单共用（三违管理、现场管理、员工花名册导入）
   - order:7 被 2 个菜单共用（员工档案中心、安全风险管控）
   - order:5 被 2 个菜单共用（培训管理、人员主数据）
3. **功能重复**：
   - 三违管理独立菜单 vs 现场管理→三违管理（严重重复）
   - 人员主数据 vs 员工档案中心 vs 员工花名册导入 vs 保险及人员管理（4 处人员相关菜单）
   - 高级分析下 10 个子功能分散，应拆分至各业务域

### 7.2 权限配置问题

1. **仪表盘未配置权限**：dashboard.ts 未设置 authority，理论上公开访问
2. **权限码单一**：大部分菜单仅配置 ['admin']，多角色菜单仅限高级分析和人员相关模块
3. **未使用 i18n**：仅 dashboard.ts 使用 `$t()` 国际化，其余全部硬编码中文

### 7.3 组件复用情况

1. **公共组件仅 7 个**：对于 110+ 页面的系统，公共组件复用率偏低
2. **驾驶舱类组件重复**：cockpit、executive-cockpit、bi 各有独立组件，存在重复实现风险
3. **风险分析组件重复**：driver-risk-center 和 risk-profile-detail 各有独立的 RiskOverview/RiskComposition/RiskTrend 组件

---

## 八、审计说明

1. 本文档为**只读审计**产物，未修改任何源文件
2. 路由模块扫描覆盖 21 个 .ts 文件，提取 23 个一级菜单和 50+ 个二级菜单
3. 页面组件扫描覆盖 110+ 个 .vue 文件
4. 组件路径别名 `#/views/` 对应实际目录 `src/views/`

---

*文档生成时间：2026-07-24*
*审计任务：Sprint10-D-1-3 HSE系统全量资产审计*
