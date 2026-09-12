# HSE系统PC端左侧导航菜单骨架冻结清单

> 文档版本：v1.0
> 生成日期：2026-07-24
> 适用系统：宁津环卫 HSE 安全管理系统（`F:\deploy\hse-dashboard\安全看板vben`）

---

## 一、冻结说明

本清单用于冻结 HSE 系统 PC 端左侧导航菜单骨架。冻结后：

- 一级菜单名称、顺序、层级 **不做修改**；
- 二级菜单内容如需调整，须在后续规划中单独确认；
- 所有菜单入口的路由地址与页面文件映射 **保持不变**。

---

## 二、菜单来源

| 项目 | 内容 |
|------|------|
| **加载方式** | 前端静态路由（accessMode: 'frontend'） |
| **路由目录** | [apps/web-antd/src/router/routes/modules/](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules) |
| **加载机制** | `import.meta.glob('./modules/**/*.ts', { eager: true })` 自动加载 |
| **权限控制** | 前端静态权限（meta.authority: ['admin']） |
| **菜单UI组件** | @vben/menu-ui（Vben Admin 原生，未修改） |
| **Layout组件** | BasicLayout（Vben Admin 原生，未修改） |

---

## 三、一级菜单（10个，冻结）

| 序号 | 菜单名称 | 路由文件 | order | 图标 | 路由path | 状态 |
|------|---------|---------|-------|------|---------|------|
| 1 | 安全总览 | [hse-01-overview.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-01-overview.ts) | 1 | `lucide:layout-dashboard` | `/overview` | ✅ 冻结 |
| 2 | 风险管控 | [hse-02-risk.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-02-risk.ts) | 2 | `lucide:shield-alert` | `/risk` | ✅ 冻结 |
| 3 | 隐患治理 | [hse-03-hazards.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-03-hazards.ts) | 3 | `lucide:search-check` | `/hazards` | ✅ 冻结 |
| 4 | 现场管理 | [hse-04-site.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-04-site.ts) | 4 | `lucide:map-pin` | `/site` | ✅ 冻结 |
| 5 | 人员管理 | [hse-05-personnel.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-05-personnel.ts) | 5 | `lucide:users` | `/personnel` | ✅ 冻结 |
| 6 | 培训考核 | [hse-06-training.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-06-training.ts) | 6 | `lucide:graduation-cap` | `/training` | ✅ 冻结 |
| 7 | 应急管理 | [hse-07-emergency.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-07-emergency.ts) | 7 | `lucide:siren` | `/emergency` | ✅ 冻结 |
| 8 | 目标职责 | [hse-08-objectives.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-08-objectives.ts) | 8 | `lucide:target` | `/objectives` | ✅ 冻结 |
| 9 | 制度标准 | [hse-09-standards.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-09-standards.ts) | 9 | `lucide:book-open-check` | `/standards` | ✅ 冻结 |
| 10 | 系统管理 | [hse-10-system.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-10-system.ts) | 10 | `lucide:settings` | `/system` | ✅ 冻结 |

---

## 四、二级菜单明细（51个显示菜单 + 8个隐藏菜单）

### 4.1 安全总览（12个）

| 序号 | 二级菜单 | 路由path | 页面文件 | 图标 | 状态 |
|------|---------|---------|---------|------|------|
| 1 | HSE驾驶舱 | `/overview/cockpit` | [hse/cockpit/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/cockpit/index.vue) | `lucide:gauge` | ✅ 正常 |
| 2 | 集团智能驾驶舱 | `/overview/executive-cockpit` | [hse/executive-cockpit/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/executive-cockpit/index.vue) | `lucide:building-2` | ✅ 正常 |
| 3 | BI数据看板 | `/overview/bi` | [hse/bi/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/bi/index.vue) | `lucide:bar-chart-3` | ✅ 正常 |
| 4 | AI智能分析 | `/overview/ai-analysis` | [hse/ai-analysis/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/ai-analysis/index.vue) | `lucide:brain-circuit` | ✅ 正常 |
| 5 | 驾驶员风险中心 | `/overview/driver-risk-center` | [hse/driver-risk-center/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/driver-risk-center/index.vue) | `lucide:car` | ✅ 正常 |
| 6 | 事故分析中心 | `/overview/accident-analysis` | [hse/accident-analysis/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/accident-analysis/index.vue) | `lucide:alert-triangle` | ✅ 正常 |
| 7 | 考核分析中心 | `/overview/assessment-analysis` | [hse/assessment-analysis/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-analysis/index.vue) | `lucide:pie-chart` | ✅ 正常 |
| 8 | 预警与整改中心 | `/overview/warning-center` | [hse/warning-center/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/warning-center/index.vue) | `lucide:bell-alert` | ✅ 正常 |
| 9 | IoT物联网 | `/overview/iot` | [hse/iot/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/iot/index.vue) | `lucide:radio` | ✅ 正常 |
| 10 | 供应链安全 | `/overview/supply-chain` | [hse/supply-chain/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/supply-chain/index.vue) | `lucide:truck` | ✅ 正常 |
| 11 | 告警中心 | `/overview/alerts` | [hse/alerts/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/alerts/index.vue) | `lucide:bell` | ✅ 正常 |
| 12 | 通知中心 | `/overview/notifications` | [hse/notifications/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/notifications/index.vue) | `lucide:bell-ring` | ✅ 正常 |

### 4.2 风险管控（1个）

| 序号 | 二级菜单 | 路由path | 页面文件 | 图标 | 状态 |
|------|---------|---------|---------|------|------|
| 1 | 风险清单 | `/risk/list` | [risk-control/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/risk-control/index.vue) | `lucide:list-checks` | ✅ 正常 |

### 4.3 隐患治理（1个）

| 序号 | 二级菜单 | 路由path | 页面文件 | 图标 | 状态 |
|------|---------|---------|---------|------|------|
| 1 | 隐患清单 | `/hazards/list` | [hazards/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hazards/index.vue) | `lucide:clipboard-list` | ✅ 正常 |

### 4.4 现场管理（3个）

| 序号 | 二级菜单 | 路由path | 页面文件 | 图标 | 状态 |
|------|---------|---------|---------|------|------|
| 1 | 三违管理 | `/site/violation` | [inspection/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/inspection/index.vue) | `lucide:octagon-alert` | ✅ 正常 |
| 2 | 消防设施管理 | `/site/fire-facility` | [inspection/fire-facility/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/inspection/fire-facility/index.vue) | `lucide:flame` | ✅ 正常 |
| 3 | 网格管理 | `/site/grid` | [inspection/grid/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/inspection/grid/index.vue) | `lucide:grid-3x3` | ✅ 正常 |

### 4.5 人员管理（9个）

| 序号 | 二级菜单 | 路由path | 页面文件 | 图标 | 状态 |
|------|---------|---------|---------|------|------|
| 1 | 员工列表 | `/personnel/employee` | [hse/employee/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/employee/index.vue) | `lucide:user-round` | ✅ 正常 |
| 2 | 组织管理 | `/personnel/departments` | [hse/employee/departments.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/employee/departments.vue) | `lucide:building` | ✅ 正常 |
| 3 | 岗位管理 | `/personnel/positions` | [hse/employee/positions.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/employee/positions.vue) | `lucide:briefcase` | ✅ 正常 |
| 4 | 员工档案 | `/personnel/profile` | [hse/employee-profile/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/employee-profile/index.vue) | `lucide:file-user` | ✅ 正常 |
| 5 | 花名册导入 | `/personnel/import` | [hse/employee-import-v2/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/employee-import-v2/index.vue) | `lucide:upload` | ✅ 正常 |
| 6 | 批量导入 | `/personnel/batch-import` | [hse/batch-import/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/batch-import/index.vue) | `lucide:database-upload` | ✅ 正常 |
| 7 | 车辆保险 | `/personnel/vehicle-insurance` | [insurance/vehicle/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/insurance/vehicle/index.vue) | `lucide:car-front` | ✅ 正常 |
| 8 | 人员保险 | `/personnel/insurance` | [insurance/personnel/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/insurance/personnel/index.vue) | `lucide:shield-plus` | ✅ 正常 |
| 9 | 超龄人员 | `/personnel/over-age` | [insurance/over-age/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/insurance/over-age/index.vue) | `lucide:user-round-x` | ✅ 正常 |

### 4.6 培训考核（11个显示 + 8个隐藏）

**显示菜单：**

| 序号 | 二级菜单 | 路由path | 页面文件 | 图标 | 状态 |
|------|---------|---------|---------|------|------|
| 1 | 年度计划 | `/training/plans` | [training/plans/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/plans/index.vue) | `lucide:calendar-days` | ✅ 正常 |
| 2 | 培训要求 | `/training/requirements` | [training/requirements/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/requirements/index.vue) | `lucide:clipboard-check` | ✅ 正常 |
| 3 | 培训计划 | `/training/plan` | [training/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/index.vue) | `lucide:calendar-check` | ✅ 正常 |
| 4 | 计划执行 | `/training/execute` | [training/execute/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/execute/index.vue) | `lucide:play-circle` | ✅ 正常 |
| 5 | 培训台账 | `/training/ledger` | [training/ledger/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/ledger/index.vue) | `lucide:book-open` | ✅ 正常 |
| 6 | 新员工培训 | `/training/new-employee` | [training/new-employee/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/new-employee/index.vue) | `lucide:user-plus` | ✅ 正常 |
| 7 | 驾驶员实操 | `/training/driver` | [training/driver/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/driver/index.vue) | `lucide:car` | ✅ 正常 |
| 8 | 培训统计 | `/training/stats` | [training/stats/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/stats/index.vue) | `lucide:bar-chart-2` | ✅ 正常 |
| 9 | 培训分析 | `/training/analysis` | [training/analysis/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/analysis/index.vue) | `lucide:trending-up` | ✅ 正常 |
| 10 | 培训提醒 | `/training/reminders` | [training/reminders/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/training/reminders/index.vue) | `lucide:alarm-clock` | ✅ 正常 |
| 11 | 月度考核 | `/training/assessment-monthly` | [hse/assessment-monthly/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/index.vue) | `lucide:file-check-2` | ✅ 正常 |

**隐藏菜单（hideInMenu，仅通过工作台内部导航访问）：**

| 序号 | 二级菜单 | 路由path | 页面文件 | 状态 |
|------|---------|---------|---------|------|
| H1 | 考核周期 | `/training/assessment-cycles` | [hse/assessment-monthly/cycles.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/cycles.vue) | ✅ 隐藏 |
| H2 | 考核对象 | `/training/assessment-targets` | [hse/assessment-monthly/targets.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/targets.vue) | ✅ 隐藏 |
| H3 | 自动评分 | `/training/assessment-scoring` | [hse/assessment-monthly/scoring.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/scoring.vue) | ✅ 隐藏 |
| H4 | 扣分审核 | `/training/assessment-deduction-review` | [hse/assessment-monthly/deduction-review.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/deduction-review.vue) | ✅ 隐藏 |
| H5 | 扣分调整 | `/training/assessment-deduction-adjust` | [hse/assessment-monthly/deduction-adjust.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/deduction-adjust.vue) | ✅ 隐藏 |
| H6 | 结果冻结 | `/training/assessment-freeze` | [hse/assessment-monthly/freeze.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/freeze.vue) | ✅ 隐藏 |
| H7 | Excel导入导出 | `/training/assessment-excel` | [hse/assessment-monthly/excel.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/assessment-monthly/excel.vue) | ✅ 隐藏 |

### 4.7 应急管理（2个）

| 序号 | 二级菜单 | 路由path | 页面文件 | 图标 | 状态 |
|------|---------|---------|---------|------|------|
| 1 | 应急预案 | `/emergency/plans` | [emergency/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/emergency/index.vue) | `lucide:file-warning` | ✅ 正常 |
| 2 | 事故管理 | `/emergency/accidents` | [accidents/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/accidents/index.vue) | `lucide:alert-octagon` | ✅ 正常 |

### 4.8 目标职责（4个）

| 序号 | 二级菜单 | 路由path | 页面文件 | 图标 | 状态 |
|------|---------|---------|---------|------|------|
| 1 | 目标责任书管理 | `/objectives/responsibility` | [goals/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/goals/index.vue) | `lucide:file-signature` | ✅ 正常 |
| 2 | 安全人员及安委会 | `/objectives/committee` | [objectives/committee/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/objectives/committee/index.vue) | `lucide:users-round` | ✅ 正常 |
| 3 | 责任制及考核 | `/objectives/assessment` | [objectives/assessment/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/objectives/assessment/index.vue) | `lucide:award` | ✅ 正常 |
| 4 | 安全费用预算及支出 | `/objectives/budget` | [objectives/budget/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/objectives/budget/index.vue) | `lucide:wallet` | ✅ 正常 |

### 4.9 制度标准（6个）

| 序号 | 二级菜单 | 路由path | 页面文件 | 图标 | 状态 |
|------|---------|---------|---------|------|------|
| 1 | 规章制度 | `/standards/regulations` | [regulations/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/regulations/index.vue) | `lucide:scroll-text` | ✅ 正常 |
| 2 | 文件库 | `/standards/library` | [hse/documents/library/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/documents/library/index.vue) | `lucide:folder-open` | ✅ 正常 |
| 3 | 文件审核 | `/standards/review` | [hse/documents/review/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/documents/review/index.vue) | `lucide:file-check` | ✅ 正常 |
| 4 | 标准条款库 | `/standards/clauses` | [hse/standard/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/standard/index.vue) | `lucide:list-tree` | ✅ 正常 |
| 5 | 条款资料关联 | `/standards/relation` | [hse/standard/relation/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/standard/relation/index.vue) | `lucide:link` | ✅ 正常 |
| 6 | 匹配建议 | `/standards/suggestions` | [hse/standard/relation/suggestions.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/hse/standard/relation/suggestions.vue) | `lucide:lightbulb` | ✅ 正常 |

### 4.10 系统管理（3个）

| 序号 | 二级菜单 | 路由path | 页面文件 | 图标 | 状态 |
|------|---------|---------|---------|------|------|
| 1 | 用户管理 | `/system/users` | [system/users/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/system/users/index.vue) | `lucide:user-cog` | ✅ 正常 |
| 2 | 角色管理 | `/system/roles` | [system/roles/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/system/roles/index.vue) | `lucide:shield-check` | ✅ 正常 |
| 3 | 审计日志 | `/system/audit` | [security/audit/index.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views/security/audit/index.vue) | `lucide:clipboard-list` | ✅ 正常 |

---

## 五、统计汇总

| 统计项 | 数量 |
|-------|------|
| 一级菜单 | 10 |
| 二级菜单（显示） | 51 |
| 二级菜单（隐藏，hideInMenu） | 8 |
| 二级菜单合计 | 59 |
| 页面文件存在 | 61（含隐藏菜单页面） |
| 页面文件缺失 | 0 |
| 待开发页面 | 0 |

---

## 六、视觉效果确认

| 项目 | 说明 | 状态 |
|------|------|------|
| 图标体系 | 全部使用 lucide icons（`lucide:` 前缀），统一规范 | ✅ 统一 |
| 一级菜单顺序 | 按 order 1-10 严格排序，无错位 | ✅ 正确 |
| 二级菜单缩进 | Vben Admin 原生缩进效果 | ✅ 正常 |
| 展开/折叠交互 | Vben Admin 原生手风琴效果 | ✅ 正常 |
| 选中高亮 | Vben Admin 原生选中状态 | ✅ 正常 |
| Hover 效果 | Vben Admin 原生悬停反馈 | ✅ 正常 |
| 主题一致性 | 未修改任何主题，保持 Vben Admin 原生 | ✅ 一致 |
| 整体视觉风格 | 与 Vben Admin 5.7.0 设计风格完全一致 | ✅ 符合 |

---

## 七、冻结结论

**本菜单骨架已达到冻结条件。**

冻结范围：
- ✅ 一级菜单名称（10个）
- ✅ 一级菜单顺序（order 1-10）
- ✅ 一级菜单图标
- ✅ 二级菜单结构与路由映射
- ✅ 菜单视觉效果（Vben Admin 原生）

未冻结（后续可规划）：
- ⚠️ 各业务模块的功能实现
- ⚠️ 二级菜单内容的增删调整（须单独确认）

---

*清单结束。冻结后，任何调整须经书面确认。*
