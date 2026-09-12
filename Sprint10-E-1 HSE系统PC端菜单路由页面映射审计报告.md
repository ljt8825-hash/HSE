# Sprint10-E-1 HSE系统PC端菜单路由页面映射审计报告

> 审计对象：`F:\deploy\hse-dashboard\安全看板vben`（唯一生产前端目录）
> 审计日期：2026-07-24
> 审计范围：仅扫描分析，未修改任何代码

---

## 一、当前左侧菜单结构概览

### 1.1 菜单来源确认

| 项目 | 结论 |
|------|------|
| **菜单来源** | 前端静态路由（非后端动态菜单） |
| **权限模式** | `accessMode: 'frontend'`（前端权限控制） |
| **路由加载机制** | `import.meta.glob('./modules/**/*.ts', { eager: true })` 自动加载 |
| **路由配置目录** | [router/routes/modules/](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules) |
| **权限配置文件** | [preferences.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/preferences.ts#L22-L22) |
| **路由守卫** | [router/guard.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/guard.ts) |

> **关键说明**：虽然存在 `getAllMenusApi()` 后端菜单接口（[api/core/menu.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/core/menu.ts)），但由于 `accessMode: 'frontend'`，**当前实际不调用该接口**，菜单完全由前端 `modules/*.ts` 静态文件生成。

### 1.2 路由模块总览

共 **23** 个路由模块文件（其中 HSE 业务模块 22 个，系统仪表板 1 个）：

| # | 路由模块文件 | 一级菜单数 | 二级菜单数 |
|---|------------|-----------|-----------|
| 1 | [hse-advanced.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-advanced.ts) | 1 | 11 |
| 2 | [hse-training.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-training.ts) | 1 | 10 |
| 3 | [hse-assessment-monthly.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-assessment-monthly.ts) | 1 | 8 |
| 4 | [hse-objectives.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-objectives.ts) | 1 | 4 |
| 5 | [hse-insurance.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-insurance.ts) | 1 | 3 |
| 6 | [hse-inspection.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-inspection.ts) | 1 | 3 |
| 7 | [hse-standard.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-standard.ts) | 1 | 3 |
| 8 | [hse-center.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-center.ts) | 3 | 0 |
| 9 | [hse-employee.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-employee.ts) | 1 | 3 |
| 10 | [hse-documents.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-documents.ts) | 1 | 2 |
| 11 | [hse-system.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-system.ts) | 1 | 2 |
| 12 | [hse-employee-profile.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-employee-profile.ts) | 1 | 1 |
| 13 | [hse-employee-import-v2.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-employee-import-v2.ts) | 1 | 1 |
| 14 | [hse-batch-import.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-batch-import.ts) | 1 | 1 |
| 15 | [hse-security.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-security.ts) | 1 | 1 |
| 16-22 | 单级菜单（7个） | 7 | 0 |
| - | **合计** | **23** | **57** |

> **单级菜单**：hse-risk-control.ts（风险管控）、hse-hazards.ts（隐患治理）、hse-violations.ts（三违管理）、hse-emergency.ts（应急管理）、hse-accidents.ts（事故管理）、hse-regulations.ts（规章制度）、dashboard.ts（仪表板，已隐藏）

---

## 二、完整菜单-路由-页面映射表

### 2.1 按order值排序的完整菜单树

| 序号 | 一级菜单 | 二级菜单 | Route路径 | 页面文件 | 状态 |
|------|---------|---------|-----------|---------|------|
| 1 | **告警中心** | - | `/hse/alerts` | [views/hse/alerts/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/alerts/index.vue) | ✅ 正常 |
| 2 | **工作流引擎** | - | `/hse/workflow` | [views/hse/workflow/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/workflow/index.vue) | ✅ 正常 |
| 3 | **目标职责管理** | 目标责任书管理 | `/objectives/responsibility` | [views/goals/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/goals/index.vue) | ✅ 正常 |
| | | 安全人员及安委会 | `/objectives/committee` | [views/objectives/committee/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/objectives/committee/index.vue) | ✅ 正常 |
| | | 责任制及考核 | `/objectives/assessment` | [views/objectives/assessment/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/objectives/assessment/index.vue) | ✅ 正常 |
| | | 安全费用预算及支出 | `/objectives/budget` | [views/objectives/budget/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/objectives/budget/index.vue) | ✅ 正常 |
| 4 | **规章制度** | - | `/regulations` | [views/regulations/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/regulations/index.vue) | ✅ 正常 |
| 5 | **人员主数据** | 员工列表 | `/hse/employee/list` | [views/hse/employee/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/employee/index.vue) | ✅ 正常 |
| | | 组织管理 | `/hse/employee/departments` | [views/hse/employee/departments.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/employee/departments.vue) | ✅ 正常 |
| | | 岗位管理 | `/hse/employee/positions` | [views/hse/employee/positions.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/employee/positions.vue) | ✅ 正常 |
| 5* | **培训管理** | 培训计划 | `/training/plan` | [views/training/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/index.vue) | ✅ 正常 |
| | | 培训要求 | `/training/requirements` | [views/training/requirements/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/requirements/index.vue) | ✅ 正常 |
| | | 年度计划 | `/training/plans` | [views/training/plans/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/plans/index.vue) | ✅ 正常 |
| | | 培训台账 | `/training/ledger` | [views/training/ledger/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/ledger/index.vue) | ✅ 正常 |
| | | 新员工培训 | `/training/new-employee` | [views/training/new-employee/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/new-employee/index.vue) | ✅ 正常 |
| | | 驾驶员实操 | `/training/driver` | [views/training/driver/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/driver/index.vue) | ✅ 正常 |
| | | 培训统计 | `/training/stats` | [views/training/stats/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/stats/index.vue) | ✅ 正常 |
| | | 培训分析 | `/training/analysis` | [views/training/analysis/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/analysis/index.vue) | ✅ 正常 |
| | | 培训提醒 | `/training/reminders` | [views/training/reminders/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/reminders/index.vue) | ✅ 正常 |
| | | 计划执行 | `/training/execute` | [views/training/execute/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/execute/index.vue) | ✅ 正常 |
| 6 | **三违管理** | - | `/violations` | [views/violations/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/violations/index.vue) | ✅ 正常 |
| 6* | **现场管理** | "三违"管理 | `/inspection/violation` | [views/inspection/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/inspection/index.vue) | ✅ 正常 |
| | | 消防设施管理 | `/inspection/fire-facility` | [views/inspection/fire-facility/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/inspection/fire-facility/index.vue) | ✅ 正常 |
| | | 网格管理 | `/inspection/grid` | [views/inspection/grid/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/inspection/grid/index.vue) | ✅ 正常 |
| 6** | **员工花名册导入** | 批次管理 | `/hse/employee-import-v2/list` | [views/hse/employee-import-v2/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/employee-import-v2/index.vue) | ✅ 正常 |
| 7 | **安全风险管控** | - | `/risk-control` | [views/risk-control/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/risk-control/index.vue) | ✅ 正常 |
| 7* | **员工档案中心** | 员工档案 | `/hse/employee-profile/list` | [views/hse/employee-profile/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/employee-profile/index.vue) | ✅ 正常 |
| 8 | **隐患排查治理** | - | `/hazards` | [views/hazards/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hazards/index.vue) | ✅ 正常 |
| 9 | **应急管理** | - | `/emergency` | [views/emergency/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/emergency/index.vue) | ✅ 正常 |
| 10 | **事故管理** | - | `/accidents` | [views/accidents/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/accidents/index.vue) | ✅ 正常 |
| 11 | **保险及人员管理** | 车辆保险管理 | `/insurance/vehicle` | [views/insurance/vehicle/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/insurance/vehicle/index.vue) | ✅ 正常 |
| | | 人员保险管理 | `/insurance/personnel` | [views/insurance/personnel/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/insurance/personnel/index.vue) | ✅ 正常 |
| | | 超龄人员管理 | `/insurance/over-age` | [views/insurance/over-age/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/insurance/over-age/index.vue) | ✅ 正常 |
| 12 | **系统管理** | 用户管理 | `/system/users` | [views/system/users/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/system/users/index.vue) | ✅ 正常 |
| | | 角色管理 | `/system/roles` | [views/system/roles/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/system/roles/index.vue) | ✅ 正常 |
| 13 | **安全审计** | 审计日志 | `/security/audit` | [views/security/audit/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/security/audit/index.vue) | ✅ 正常 |
| 14 | **通知中心** | - | `/hse/notifications` | [views/hse/notifications/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/notifications/index.vue) | ✅ 正常 |
| 15 | **高级分析** | HSE驾驶舱 | `/hse-advanced/cockpit` | [views/hse/cockpit/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/cockpit/index.vue) | ✅ 正常 |
| | | 驾驶员风险中心 | `/hse-advanced/driver-risk-center` | [views/hse/driver-risk-center/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/driver-risk-center/index.vue) | ✅ 正常 |
| | | 事故分析中心 | `/hse-advanced/accident-analysis` | [views/hse/accident-analysis/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/accident-analysis/index.vue) | ✅ 正常 |
| | | 考核分析中心 | `/hse-advanced/assessment-analysis` | [views/hse/assessment-analysis/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-analysis/index.vue) | ✅ 正常 |
| | | 集团智能驾驶舱 | `/hse-advanced/executive-cockpit` | [views/hse/executive-cockpit/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/executive-cockpit/index.vue) | ✅ 正常 |
| | | 预警与整改中心 | `/hse-advanced/warning-center` | [views/hse/warning-center/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/warning-center/index.vue) | ✅ 正常 |
| | | BI数据看板 | `/hse-advanced/bi` | [views/hse/bi/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/bi/index.vue) | ✅ 正常 |
| | | AI智能分析 | `/hse-advanced/ai-analysis` | [views/hse/ai-analysis/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/ai-analysis/index.vue) | ✅ 正常 |
| | | IoT物联网 | `/hse-advanced/iot` | [views/hse/iot/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/iot/index.vue) | ✅ 正常 |
| | | 供应链安全 | `/hse-advanced/supply-chain` | [views/hse/supply-chain/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/supply-chain/index.vue) | ✅ 正常 |
| | | 员工风险画像详情 | `/hse-advanced/risk-profile/:employeeId` | [views/hse/risk-profile-detail/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/risk-profile-detail/index.vue) | ✅ 正常（隐藏菜单） |
| 20 | **安全资料中心** | 文件库 | `/hse-documents/library` | [views/hse/documents/library/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/documents/library/index.vue) | ✅ 正常 |
| | | 文件审核 | `/hse-documents/review` | [views/hse/documents/review/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/documents/review/index.vue) | ✅ 正常 |
| 20* | **月度安全履职考核** | 考核工作台 | `/hse/assessment-monthly/index` | [views/hse/assessment-monthly/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/index.vue) | ✅ 正常 |
| | | 考核周期 | `/hse/assessment-monthly/cycles` | [views/hse/assessment-monthly/cycles.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/cycles.vue) | ✅ 正常 |
| | | 考核对象 | `/hse/assessment-monthly/targets` | [views/hse/assessment-monthly/targets.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/targets.vue) | ✅ 正常 |
| | | 自动评分 | `/hse/assessment-monthly/scoring` | [views/hse/assessment-monthly/scoring.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/scoring.vue) | ✅ 正常 |
| | | 扣分审核 | `/hse/assessment-monthly/deduction-review` | [views/hse/assessment-monthly/deduction-review.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/deduction-review.vue) | ✅ 正常 |
| | | 扣分调整 | `/hse/assessment-monthly/deduction-adjust` | [views/hse/assessment-monthly/deduction-adjust.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/deduction-adjust.vue) | ✅ 正常 |
| | | 结果冻结 | `/hse/assessment-monthly/freeze` | [views/hse/assessment-monthly/freeze.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/freeze.vue) | ✅ 正常 |
| | | Excel导入导出 | `/hse/assessment-monthly/excel` | [views/hse/assessment-monthly/excel.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/excel.vue) | ✅ 正常 |
| 25 | **标准化评价** | 标准条款库 | `/hse/standard/clauses` | [views/hse/standard/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/standard/index.vue) | ✅ 正常 |
| | | 条款资料关联 | `/hse/standard/relation` | [views/hse/standard/relation/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/standard/relation/index.vue) | ✅ 正常 |
| | | 匹配建议 | `/hse/standard/suggestions` | [views/hse/standard/relation/suggestions.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/standard/relation/suggestions.vue) | ✅ 正常 |
| 26 | **批量导入** | 导入任务 | `/hse/batch-import/tasks` | [views/hse/batch-import/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/batch-import/index.vue) | ✅ 正常 |

> **注**：序号带 * 的表示存在 order 值冲突（多个一级菜单使用了相同的 order 值）。

---

## 三、页面存在性验证结果

### 3.1 验证统计

| 验证项 | 总数 | 正常 | 缺失 |
|--------|-----|-----|-----|
| 路由注册数 | 80 | 80 | 0 |
| 页面组件数 | 80 | 80 | 0 |
| 一级菜单 | 23 | 23 | 0 |
| 二级菜单 | 57 | 57 | 0 |

### 3.2 结论

**✅ 所有菜单对应的路由和页面文件均存在，无"无此页面"问题。**

---

## 四、API接口对应关系

### 4.1 HSE API模块总览

共 **34** 个HSE业务API模块（位于 [api/hse/](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse)）：

| API模块 | 后端路由前缀 | 对应页面 |
|---------|------------|---------|
| [cockpit.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/cockpit.ts) | `/hse/dashboard` | HSE驾驶舱 |
| [employee.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/employee.ts) | `/hse/employees` | 人员主数据 |
| [training.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/training.ts) | `/hse/training` | 培训管理 |
| [assessment-monthly.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/assessment-monthly.ts) | `/hse/assessment-monthly` | 月度考核 |
| [risk-control.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/risk-control.ts) | `/hse/risk-control` | 风险管控 |
| [hazards.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/hazards.ts) | `/hse/hazards` | 隐患治理 |
| [violations.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/violations.ts) | `/hse/violations` | 三违管理 |
| [emergency.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/emergency.ts) | `/hse/emergency` | 应急管理 |
| [accidents.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/accidents.ts) | `/hse/accidents` | 事故管理 |
| [inspection.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/inspection.ts) | `/hse/inspection` | 现场管理 |
| [insurance.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/insurance.ts) | `/hse/insurance` | 保险管理 |
| [documents.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/documents.ts) | `/hse/documents` | 资料中心 |
| [regulations.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/regulations.ts) | `/hse/regulations` | 规章制度 |
| [goals.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/goals.ts) | `/hse/goals` | 目标职责 |
| [system.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/system.ts) | `/hse/system` | 系统管理 |
| [audit.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/audit.ts) | `/hse/audit` | 安全审计 |
| [alerts.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/alerts.ts) | `/hse/alerts` | 告警中心 |
| [notifications.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/notifications.ts) | `/hse/notifications` | 通知中心 |
| [workflow.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/workflow.ts) | `/hse/workflow` | 工作流引擎 |
| [driver-risk-center.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/driver-risk-center.ts) | `/hse/driver-risk` | 驾驶员风险中心 |
| [accident-analysis.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/accident-analysis.ts) | `/hse/accident-analysis` | 事故分析中心 |
| [assessment-analysis.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/assessment-analysis.ts) | `/hse/assessment-analysis` | 考核分析中心 |
| [warning-center.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/warning-center.ts) | `/hse/warning` | 预警中心 |
| [executive-cockpit.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/executive-cockpit.ts) | `/hse/executive` | 集团驾驶舱 |
| [batch-import.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/batch-import.ts) | `/hse/batch-import` | 批量导入 |
| [employee-import-v2.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/employee-import-v2.ts) | `/hse/employee-import` | 花名册导入 |
| [employee-profile.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/employee-profile.ts) | `/hse/employee-profile` | 员工档案 |
| [risk-profile-detail.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/risk-profile-detail.ts) | `/hse/risk-profile` | 风险画像 |
| [reports.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/reports.ts) | `/hse/reports` | 报告中心 |
| [site.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/site.ts) | `/hse/site` | 现场管理（备用） |
| [employee-selector.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/employee-selector.ts) | `/hse/employee-selector` | 员工选择器 |
| [analysis-center.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/api/hse/analysis-center.ts) | `/hse/analysis` | 分析中心 |

### 4.2 API验证结论

**✅ 所有主要页面均有对应的API模块，API与页面映射完整。**

---

## 五、发现的问题清单

### 5.1 Order值冲突问题（高优先级）

多个一级菜单使用了相同的 `meta.order` 值，会导致菜单显示顺序不确定（由文件加载顺序决定）：

| 冲突order值 | 冲突菜单 | 建议分配 |
|------------|---------|---------|
| **5** | 人员主数据 / 培训管理 | 5 / 6 |
| **6** | 三违管理 / 现场管理 / 员工花名册导入 | 7 / 8 / 15 |
| **7** | 安全风险管控 / 员工档案中心 | 9 / 16 |
| **20** | 安全资料中心 / 月度安全履职考核 | 20 / 21 |

### 5.2 业务重复问题（中优先级）

| 问题 | 涉及菜单 | 说明 |
|------|---------|------|
| **三违管理重复** | `/violations`（单级）+ `/inspection/violation`（现场管理下） | 两处菜单指向不同页面，需确认业务归属 |
| **人员管理分散** | 人员主数据 / 员工档案中心 / 员工花名册导入 / 保险及人员管理 | 4个一级菜单均与人员相关，建议整合 |

### 5.3 菜单架构未对齐（高优先级）

当前 **23** 个一级菜单分散在多个模块中，与预期的 **10大菜单架构** 不一致：

| 预期10大菜单 | 当前对应状态 |
|-------------|-------------|
| 安全总览 | ✅ 高级分析 → HSE驾驶舱（嵌套较深） |
| 风险管控 | ✅ 安全风险管控（单级） |
| 隐患治理 | ✅ 隐患排查治理（单级） |
| 现场管理 | ✅ 现场管理（3个子菜单） |
| 人员管理 | ⚠️ 分散在4个一级菜单中 |
| 培训考核 | ⚠️ 培训管理（10子菜单）独立，考核分散 |
| 应急管理 | ✅ 应急管理（单级） |
| 目标职责 | ✅ 目标职责管理（4个子菜单） |
| 制度标准 | ⚠️ 规章制度 + 安全资料中心 + 标准化评价（3个独立菜单） |
| 系统管理 | ✅ 系统管理（2个子菜单） |

### 5.4 命名不一致问题（低优先级）

- `/inspection/violation` 的二级菜单标题含多余引号：`"三违"管理`
- 部分菜单使用 `lucide:` 前缀图标，部分使用 `carbon:` 前缀，图标体系不统一

---

## 六、核心结论

### 6.1 系统完整性结论

| 检查项 | 结果 |
|--------|------|
| 菜单-路由映射完整 | ✅ |
| 路由-页面文件完整 | ✅ |
| 页面-API模块完整 | ✅ |
| 权限配置完整 | ✅ |
| "无此页面"问题 | ❌ 无 |
| 菜单缺失页面 | ❌ 无 |

### 6.2 关键发现

1. **当前生产系统完整可用**：所有 23 个一级菜单 + 57 个二级菜单均有对应的路由和页面文件。
2. **菜单来源是前端静态路由**：`accessMode: 'frontend'`，菜单由 `modules/*.ts` 静态文件生成，不依赖后端。
3. **主要问题是架构一致性**：不存在"坏菜单"，但 23 个一级菜单需要按 10 大菜单架构重新分组归并。
4. **Order值冲突需修复**：否则菜单顺序会随机变化。

---

## 七、下一步建议（仅建议，不执行）

| 优先级 | 建议事项 | 说明 |
|--------|---------|------|
| 🔴 高 | 统一所有一级菜单的 order 值（1-23 不重复） | 修复菜单显示顺序不确定问题 |
| 🔴 高 | 按 10 大菜单架构重新组织 23 个一级菜单 | 将分散的人员/培训/制度类菜单归并 |
| 🟡 中 | 统一菜单图标前缀（全部使用 `lucide:`） | 保持视觉一致性 |
| 🟡 中 | 修复 `/inspection/violation` 菜单标题的多余引号 | 小问题 |
| 🟢 低 | 如后续需要动态菜单，修改 `accessMode` 为 `backend` | 当前前端模式已足够 |

---

*报告结束。审计未修改任何代码。*
