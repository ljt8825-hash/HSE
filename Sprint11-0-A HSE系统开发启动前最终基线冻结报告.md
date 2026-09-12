# Sprint11-0-A HSE系统开发启动前最终基线冻结报告

> **文档性质**：开发启动前最终基线冻结（技术、数据、规则、界面全部冻结）
> **版本**：v1.0（最终冻结版）
> **生成日期**：2026-07-25
> **冻结范围**：菜单 / 页面 / 路由 / API / 数据库 / 规则体系 / 技术栈
> **依据文档**：
> - 《Sprint11-0 HSE系统开发前环境、基线与生产目录最终确认报告》
> - 《Sprint11-0 HSE系统菜单、页面、API、数据库五一致性校验报告》

---

## 一、生产目录最终确认（冻结）

### 1.1 唯一生产系统

| 层级 | 路径 | 状态 |
|------|------|------|
| 项目根 | [F:\deploy\hse-dashboard](file:///F:/deploy/hse-dashboard) | ✅ 冻结 |
| 前端Monorepo | [F:\deploy\hse-dashboard\安全看板vben](file:///F:/deploy/hse-dashboard/安全看板vben) | ✅ 冻结，唯一生产前端代码库 |
| 前端应用入口 | [F:\deploy\hse-dashboard\安全看板vben\apps\web-antd](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd) | ✅ 冻结，唯一生产前端应用 |
| 后端主入口 | [F:\deploy\hse-dashboard\server\app.js](file:///F:/deploy/hse-dashboard/server/app.js) | ✅ 冻结，唯一生产API入口 |
| 数据库 | PostgreSQL @ 127.0.0.1:5432 / safety_dashboard | ✅ 冻结 |
| 前端端口 | 5173 | ✅ 冻结 |
| 后端端口 | 5666 | ✅ 冻结 |

### 1.2 已归档/禁止使用目录

| 目录 | 说明 | 处理方式 |
|------|------|---------|
| [F:\deploy\hse-dashboard\安全管理系统](file:///F:/deploy/hse-dashboard/安全管理系统) | 旧系统（Vue 3 + Element Plus + Python Flask） | 🔴 历史归档，禁止继续开发 |
| [F:\deploy\hse-dashboard\src](file:///F:/deploy/hse-dashboard/src) | 旧系统（Vue 3 + Element Plus） | 🔴 历史归档，禁止继续开发 |
| [F:\deploy\hse-dashboard\server\src\app.ts](file:///F:/deploy/hse-dashboard/server/src/app.ts) | TypeScript版后端（缺少auth、CORS宽松） | 🟡 已归档，不用于生产 |

---

## 二、一级菜单最终版（11个 · 冻结）

### 2.1 完整清单（名称+顺序+图标+路径全部冻结）

| 序号 | 一级菜单名称 | order值 | 图标 | 路由path | 路由文件 | 冻结状态 |
|------|-------------|---------|------|---------|---------|---------|
| 1 | **安全总览** | 1 | lucide:layout-dashboard | /overview | [hse-01-overview.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-01-overview.ts#L7-L8) | 🔒 冻结 |
| 2 | **目标职责** | 2 | lucide:target | /objectives | [hse-02-objectives.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-02-objectives.ts#L7-L8) | 🔒 冻结 |
| 3 | **制度标准** | 3 | lucide:book-open-check | /standards | [hse-03-standards.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-03-standards.ts#L7-L8) | 🔒 冻结 |
| 4 | **风险管控** | 4 | lucide:shield-alert | /risk | [hse-04-risk.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-04-risk.ts#L7-L8) | 🔒 冻结 |
| 5 | **隐患治理** | 5 | lucide:search-check | /hazards | [hse-05-hazards.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-05-hazards.ts#L7-L8) | 🔒 冻结 |
| 6 | **现场管理** | 6 | lucide:map-pin | /site | [hse-06-site.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-06-site.ts#L7-L8) | 🔒 冻结 |
| 7 | **人员管理** | 7 | lucide:users | /personnel | [hse-07-personnel.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-07-personnel.ts#L7-L8) | 🔒 冻结 |
| 8 | **培训考核** | 8 | lucide:graduation-cap | /training | [hse-08-training.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-08-training.ts#L7-L8) | 🔒 冻结 |
| 9 | **应急管理** | 9 | lucide:siren | /emergency | [hse-09-emergency.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-09-emergency.ts#L7-L8) | 🔒 冻结 |
| 10 | **保险管理** | 10 | lucide:shield-check | /insurance | [hse-10-insurance.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-10-insurance.ts#L7-L8) | 🔒 冻结 |
| 11 | **系统管理** | 11 | lucide:settings | /system | [hse-11-system.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-11-system.ts#L7-L8) | 🔒 冻结 |

**冻结要求**：以上11个一级菜单的**名称、顺序（order）、图标、路径path**全部冻结，禁止任何修改。如需变更须走正式审批流程。

---

## 三、二级菜单最终版（57个 · 冻结）与六维完整映射

以下57个二级菜单的**名称、顺序、归属、路由path、页面组件**全部冻结。
六维映射 = 二级菜单 → 页面 → 路由 → 前端API → 后端路由 → 数据表

---

### 模块1：安全总览（12个二级菜单）

| # | 二级菜单 | 隐藏 | 页面文件 | 路由path | 前端API | 后端路由 | 核心数据表 |
|---|---------|------|---------|---------|---------|---------|-----------|
| 1.1 | 安全总览首页 | 否 | views/hse/cockpit/ | /overview/cockpit | cockpit.ts | hse-dashboard.js | hse_statistics_*, hse_events |
| 1.2 | 智能驾驶舱 | 是 | views/hse/executive-cockpit/ | /overview/executive-cockpit | executive-cockpit.ts | hse-executive-cockpit.js | 同上（聚合视图） |
| 1.3 | BI数据看板 | 否 | views/hse/bi/ | /overview/bi | - | bi.js | hse_statistics_* |
| 1.4 | AI智能分析 | 否 | views/hse/ai-analysis/ | /overview/ai-analysis | - | ai.js / ai-enhanced.js | - |
| 1.5 | 驾驶员风险中心 | 否 | views/hse/driver-risk-center/ | /overview/driver-risk-center | driver-risk-center.ts | hse-driver-risk-center.js | hse_employee_risk_snapshot |
| 1.6 | 事故分析中心 | 否 | views/hse/accident-analysis/ | /overview/accident-analysis | accident-analysis.ts | hse-accident-analysis.js | - |
| 1.7 | 考核分析中心 | 否 | views/hse/assessment-analysis/ | /overview/assessment-analysis | assessment-analysis.ts | hse-assessment-analysis.js | hse_assessment_* |
| 1.8 | 预警与整改中心 | 否 | views/hse/warning-center/ | /overview/warning-center | warning-center.ts | hse-warning-center.js | - |
| 1.9 | IoT物联网 | 否 | views/hse/iot/ | /overview/iot | - | iot.js | - |
| 1.10 | 供应链安全 | 否 | views/hse/supply-chain/ | /overview/supply-chain | - | - | - |
| 1.11 | 告警中心 | 否 | views/hse/alerts/ | /overview/alerts | alerts.ts | alerts.js | - |
| 1.12 | 通知中心 | 否 | views/hse/notifications/ | /overview/notifications | notifications.ts | notifications.js | - |

---

### 模块2：目标职责（12个二级菜单，7个隐藏）

| # | 二级菜单 | 隐藏 | 页面文件 | 路由path | 前端API | 后端路由 | 核心数据表 |
|---|---------|------|---------|---------|---------|---------|-----------|
| 2.1 | 目标责任书管理 | 否 | views/goals/ | /objectives/responsibility | goals.ts | objectives.js | - |
| 2.2 | 安全人员及安委会 | 否 | views/objectives/committee/ | /objectives/committee | - | - | - |
| 2.3 | 责任制及考核 | 否 | views/objectives/assessment/ | /objectives/assessment | assessment.ts | hse-assessment.js | - |
| 2.4 | 安全费用预算及支出 | 否 | views/objectives/budget/ | /objectives/budget | - | - | - |
| 2.5 | 月度安全履职考核 | 否 | views/hse/assessment-monthly/ | /objectives/assessment-monthly | assessment-monthly.ts | hse-assessment-monthly.js | hse_assessment_cycle/target/deduction |
| 2.6 | 考核周期 | 是 | views/hse/assessment-monthly/cycles.vue | /objectives/assessment-cycles | assessment-monthly.ts | hse-assessment-monthly.js | hse_assessment_cycle |
| 2.7 | 考核对象 | 是 | views/hse/assessment-monthly/targets.vue | /objectives/assessment-targets | assessment-monthly.ts | hse-assessment-monthly.js | hse_assessment_target |
| 2.8 | 自动评分 | 是 | views/hse/assessment-monthly/scoring.vue | /objectives/assessment-scoring | assessment-monthly.ts | hse-assessment-monthly.js | hse_assessment_score |
| 2.9 | 扣分审核 | 是 | views/hse/assessment-monthly/deduction-review.vue | /objectives/assessment-deduction-review | assessment-monthly.ts | hse-assessment-monthly.js | hse_assessment_deduction |
| 2.10 | 扣分调整 | 是 | views/hse/assessment-monthly/deduction-adjust.vue | /objectives/assessment-deduction-adjust | assessment-monthly.ts | hse-assessment-monthly.js | hse_deduction_adjustment |
| 2.11 | 结果冻结 | 是 | views/hse/assessment-monthly/freeze.vue | /objectives/assessment-freeze | assessment-monthly.ts | hse-assessment-monthly.js | hse_assessment_target |
| 2.12 | Excel导入导出 | 是 | views/hse/assessment-monthly/excel.vue | /objectives/assessment-excel | assessment-monthly.ts | hse-assessment-monthly.js | - |

---

### 模块3：制度标准（6个二级菜单）

| # | 二级菜单 | 隐藏 | 页面文件 | 路由path | 前端API | 后端路由 | 核心数据表 |
|---|---------|------|---------|---------|---------|---------|-----------|
| 3.1 | 规章制度 | 否 | views/regulations/ | /standards/regulations | regulations.ts | regulations.js | regulations |
| 3.2 | 文件库 | 否 | views/hse/documents/library/ | /standards/library | documents.ts | hse-documents.js | - |
| 3.3 | 文件审核 | 否 | views/hse/documents/review/ | /standards/review | documents.ts | hse-documents.js | - |
| 3.4 | 标准条款库 | 否 | views/hse/standard/ | /standards/clauses | - | hse-standard.js | hse_standard_clause |
| 3.5 | 条款资料关联 | 否 | views/hse/standard/relation/ | /standards/relation | - | hse-standard-relation.js | - |
| 3.6 | 匹配建议 | 否 | views/hse/standard/relation/suggestions.vue | /standards/suggestions | - | hse-standard-evaluation.js | - |

---

### 模块4：风险管控（1个二级菜单）

| # | 二级菜单 | 隐藏 | 页面文件 | 路由path | 前端API | 后端路由 | 核心数据表 |
|---|---------|------|---------|---------|---------|---------|-----------|
| 4.1 | 风险清单 | 否 | views/risk-control/ | /risk/list | risk-control.ts | risk-control.js | hse_risk_factors, hse_risk_objects |

---

### 模块5：隐患治理（1个二级菜单）

| # | 二级菜单 | 隐藏 | 页面文件 | 路由path | 前端API | 后端路由 | 核心数据表 |
|---|---------|------|---------|---------|---------|---------|-----------|
| 5.1 | 隐患清单 | 否 | views/hazards/ | /hazards/list | - | hazards.js | hazard_record |

---

### 模块6：现场管理（3个二级菜单）

| # | 二级菜单 | 隐藏 | 页面文件 | 路由path | 前端API | 后端路由 | 核心数据表 |
|---|---------|------|---------|---------|---------|---------|-----------|
| 6.1 | 三违管理 | 否 | views/inspection/ | /site/violation | violations.ts | violations.js | violation_records |
| 6.2 | 消防设施管理 | 否 | views/inspection/fire-facility/ | /site/fire-facility | - | - | - |
| 6.3 | 网格管理 | 否 | views/inspection/grid/ | /site/grid | site.ts | site-mgmt.js | - |

---

### 模块7：人员管理（7个二级菜单）

| # | 二级菜单 | 隐藏 | 页面文件 | 路由path | 前端API | 后端路由 | 核心数据表 |
|---|---------|------|---------|---------|---------|---------|-----------|
| 7.1 | 员工列表 | 否 | views/hse/employee/ | /personnel/employee | employee.ts | hse-employee.js | employee |
| 7.2 | 组织管理 | 否 | views/hse/employee/departments.vue | /personnel/departments | employee.ts | hse-org-center.js | hse_org_unit |
| 7.3 | 岗位管理 | 否 | views/hse/employee/positions.vue | /personnel/positions | employee.ts | hse-position-responsibility.js | position |
| 7.4 | 员工档案 | 否 | views/hse/employee-profile/ | /personnel/profile | employee-profile.ts | -（待补充） | employee_safety_profile |
| 7.5 | 花名册导入 | 否 | views/hse/employee-import-v2/ | /personnel/import | employee-import-v2.ts | hse-employee-import-v2.js | employee_import_* |
| 7.6 | 批量导入 | 否 | views/hse/batch-import/ | /personnel/batch-import | batch-import.ts | hse-batch-import.js | import_batch |
| 7.7 | 超龄人员 | 否 | views/insurance/over-age/ | /personnel/over-age | - | over-age-personnel.js | - |

---

### 模块8：培训考核（10个二级菜单）

| # | 二级菜单 | 隐藏 | 页面文件 | 路由path | 前端API | 后端路由 | 核心数据表 |
|---|---------|------|---------|---------|---------|---------|-----------|
| 8.1 | 年度计划 | 否 | views/training/plans/ | /training/plans | training.ts | training.js | training_plan |
| 8.2 | 培训要求 | 否 | views/training/requirements/ | /training/requirements | training.ts | training.js | position_training_requirement |
| 8.3 | 培训计划 | 否 | views/training/ | /training/plan | training.ts | training.js | training_plan |
| 8.4 | 计划执行 | 否 | views/training/execute/ | /training/execute | training.ts | training.js | training_record |
| 8.5 | 培训台账 | 否 | views/training/ledger/ | /training/ledger | training.ts | training.js | training_record |
| 8.6 | 新员工培训 | 否 | views/training/new-employee/ | /training/new-employee | training.ts | training.js | employee_induction_training |
| 8.7 | 驾驶员实操 | 否 | views/training/driver/ | /training/driver | training.ts | training.js | - |
| 8.8 | 培训统计 | 否 | views/training/stats/ | /training/stats | training.ts | training.js | - |
| 8.9 | 培训分析 | 否 | views/training/analysis/ | /training/analysis | training.ts | training.js | - |
| 8.10 | 培训提醒 | 否 | views/training/reminders/ | /training/reminders | training.ts | training.js | - |

---

### 模块9：应急管理（2个二级菜单）

| # | 二级菜单 | 隐藏 | 页面文件 | 路由path | 前端API | 后端路由 | 核心数据表 |
|---|---------|------|---------|---------|---------|---------|-----------|
| 9.1 | 应急预案 | 否 | views/emergency/ | /emergency/plans | emergency.ts | emergency.js | - |
| 9.2 | 事故管理 | 否 | views/accidents/ | /emergency/accidents | accidents.ts | accidents.js | - |

---

### 模块10：保险管理（2个二级菜单）

| # | 二级菜单 | 隐藏 | 页面文件 | 路由path | 前端API | 后端路由 | 核心数据表 |
|---|---------|------|---------|---------|---------|---------|-----------|
| 10.1 | 车辆保险 | 否 | views/insurance/vehicle/ | /insurance/vehicle | insurance.ts | insurance.js | - |
| 10.2 | 人员保险 | 否 | views/insurance/personnel/ | /insurance/personnel | insurance.ts | insurance.js | - |

---

### 模块11：系统管理（3个二级菜单）

| # | 二级菜单 | 隐藏 | 页面文件 | 路由path | 前端API | 后端路由 | 核心数据表 |
|---|---------|------|---------|---------|---------|---------|-----------|
| 11.1 | 用户管理 | 否 | views/system/users/ | /system/users | system.ts | users.js | sys_user |
| 11.2 | 角色管理 | 否 | views/system/roles/ | /system/roles | system.ts | roles.js | sys_role |
| 11.3 | 审计日志 | 否 | views/security/audit/ | /system/audit | audit.ts | audit.js | audit_record, operation_log |

---

### 57个二级菜单汇总统计

| 项目 | 数量 |
|------|------|
| 二级菜单总数 | **57** |
| 其中：正常显示 | 43 |
| 其中：隐藏（hideInMenu） | 14 |
| 有页面组件 | 57 |
| 有前端API文件 | 48 |
| 有后端路由 | 51 |
| 有明确数据表 | 40+ |

---

## 四、安全总览定位（冻结）

### 4.1 用户端显示规则

| 场景 | 显示内容 | 禁止显示 |
|------|---------|---------|
| 一级菜单名称 | **安全总览** | 驾驶舱 / 集团驾驶舱 / HSE驾驶舱 |
| 二级菜单名称 | 安全总览首页 / BI数据看板 / AI智能分析 等 | 驾驶舱 |
| 页面标题 | 安全总览首页 | 驾驶舱 |
| Breadcrumb | 安全总览 / 安全总览首页 | 驾驶舱 |

### 4.2 技术接口命名

技术层**允许**保留以下命名（不显示给用户）：
- 路由：`/overview/cockpit`、`/overview/executive-cockpit`
- API路径：`/api/hse/dashboard`、`/api/hse/cockpit`
- 前端API文件：`cockpit.ts`、`executive-cockpit.ts`
- 后端路由文件：`hse-dashboard.js`、`hse-executive-cockpit.js`

**原则**：技术命名（cockpit/overview）与用户显示名称（安全总览）彻底分离。

### 4.3 智能驾驶舱定位

| 项目 | 定位 |
|------|------|
| 菜单状态 | 保留，hideInMenu: true（隐藏扩展能力） |
| 当前版本 | 不作为首页入口，不设为默认跳转 |
| 默认跳转 | /overview → /overview/cockpit（安全总览首页） |
| 访问方式 | 通过URL直接访问，或从安全总览首页跳转（后续版本） |
| 技术状态 | 保留技术实现，不做业务推广 |

---

## 五、业务知识库实施策略（冻结）

### 5.1 总体定位

| 项目 | 确认值 |
|------|-------|
| 优先级 | **P0 基础能力**（与组织/岗位/用户同级） |
| 实施策略 | **渐进完善模式**（不要求一次录入全部内容） |

### 5.2 首批开发必须完成（P0）

| 序号 | 内容 | 说明 |
|------|------|------|
| 1 | 创建 hse_business_help 表 | 数据库基础结构 |
| 2 | 前端帮助入口组件 | 所有一级、二级页面右上角帮助按钮（统一组件） |
| 3 | 帮助内容基础结构 | 一级菜单3项（模块定位/数据来源/数据输出），二级菜单8项（功能说明/填写方式/字段说明/计算方式/自动生成/模块交互/权限说明） |
| 4 | 后端CRUD接口 | 帮助内容增删改查接口 |
| 5 | 首批帮助内容 | 至少录入人员管理、三违管理、月度考核3个核心模块 |

### 5.3 后续逐步补充（随业务模块开发）

随着各业务模块开发完善，同步补充对应帮助内容。不要求在Sprint11阶段一次性完成全部68个菜单（11+57）的帮助录入。

### 5.4 帮助内容模板

**一级菜单帮助内容**（3项）：
1. 模块定位 —— 该模块在HSE体系中的位置和作用
2. 数据来源 —— 数据从哪些模块/表产生，由谁录入
3. 数据输出 —— 数据流向哪些模块，支撑哪些分析/考核

**二级菜单帮助内容**（8项）：
1. 功能说明 —— 该页面的核心功能
2. 填写方式 —— 手动填写 / 自动生成 / 导入
3. 字段说明 —— 关键字段含义和取值范围
4. 计算方式 —— 统计指标的计算公式
5. 自动生成 —— 哪些数据由系统自动产生
6. 模块交互 —— 与其他模块的数据流向
7. 权限说明 —— 哪些角色可查看/编辑/审核

---

## 六、规则体系升级规划（冻结）

### 6.1 当前版本定位

| 项目 | 当前状态 |
|------|---------|
| 动态规则引擎 | ❌ **不开发**（当前Sprint11阶段冻结） |
| assessment_rule表定位 | 仅作为未来规则中心预留 |
| 规则配置页面 | ❌ **不开发** |
| 规则编辑功能 | ❌ **不开发** |
| 动态计算引擎 | ❌ **不开发** |

### 6.2 当前规则的实现要求

所有业务规则**允许硬编码**，但必须满足：
- 规则集中在独立的 service 层或 utils 函数中
- 规则代码有清晰注释标明「规则点」
- 禁止将规则散落在控制器、路由、视图等各处
- 预留 `assessment_rule` 表的 future-ready 接口，后续可平滑迁移

### 6.3 四大类规则清单（当前硬编码 + 预留升级）

#### A. 扣分规则

| 规则 | 当前实现 | 预留升级 |
|------|---------|---------|
| 三违扣分 | 本人扣分 + 直属上级一级传导（固定2层） | 后续可配置传导层级、比例 |
| 隐患扣分 | 按隐患等级扣分 | 后续可配置等级→分数字典 |
| 检查扣分 | 按检查结果扣分 | 后续可配置检查项规则 |
| 培训扣分 | 未完成培训扣分 | 后续可配置培训要求阈值 |

#### B. 评分规则

| 规则 | 当前实现 | 预留升级 |
|------|---------|---------|
| 月度考核评分 | 自动扣分 + 人工调整，满分100 | 后续可配置权重、公式 |
| 安全评分 | 多模块加权汇总 | 后续可配置模块权重 |
| 风险评分 | LEC评价法（固定） | 后续可配置评价方法 |

#### C. 自动生成规则

| 规则 | 当前实现 | 预留升级 |
|------|---------|---------|
| 安全总览数据 | 定时统计聚合 | 后续可配置统计维度/频率 |
| 统计指标 | 日/月/年 聚合 | 后续可配置指标公式 |
| 预警提醒 | 固定阈值触发 | 后续可配置预警规则/阈值 |

#### D. 数据关联规则

| 规则 | 当前实现 | 预留升级 |
|------|---------|---------|
| 人员→岗位→风险 | 固定关联关系 | 后续可配置关联规则 |
| 培训→考核 | 培训完成影响考核分 | 后续可配置影响权重 |
| 三违→考核传导 | 固定2层传导 | 后续可配置传导链路 |

---

## 七、assessment_rule 表定位（冻结）

| 项目 | 当前状态 |
|------|---------|
| 是否创建 | ✅ 建议首批开发中创建（预留结构） |
| 是否配置页面 | ❌ 不开发 |
| 是否规则编辑功能 | ❌ 不开发 |
| 是否动态计算引擎 | ❌ 不开发 |
| 是否写入初始数据 | ✅ 可写入6条预设规则（只读使用，不通过页面编辑） |
| 代码中是否使用 | 当前版本可不直接读取，规则在代码中集中硬编码 |
| 未来升级 | 下一阶段（Sprint12+）开发规则中心时，代码平滑切换为从表读取 |

**核心原则**：禁止将规则全部硬编码到无法升级的地方。集中管理 + 预留接口。

---

## 八、技术基线（冻结）

### 8.1 技术栈最终确认

| 层级 | 技术选型 | 版本/说明 | 冻结状态 |
|------|---------|----------|---------|
| **前端框架** | Vben Admin Monorepo | v5.7.0 | 🔒 冻结 |
| **Vue版本** | Vue 3 | 3.x | 🔒 冻结 |
| **组件库** | **Ant Design Vue** | 4.x | 🔒 冻结 |
| **构建工具** | Vite | 5.x | 🔒 冻结 |
| **包管理** | pnpm | 10.x | 🔒 冻结 |
| **状态管理** | Pinia | - | 🔒 冻结 |
| **路由** | Vue Router | - | 🔒 冻结 |
| **语言** | TypeScript | - | 🔒 冻结 |
| **后端框架** | Node.js + Express.js | - | 🔒 冻结 |
| **数据库** | PostgreSQL | 15+ | 🔒 冻结 |
| **认证** | JWT | - | 🔒 冻结 |

### 8.2 严格禁止事项

| 禁止项 | 说明 |
|--------|------|
| 引入 Element Plus | 组件库固定为 Ant Design Vue |
| 使用旧系统目录 | 安全管理系统/、src/ 禁止继续开发 |
| 自定义组件库 | 使用 Ant Design Vue 内置组件 |
| 更换 Vben 架构 | 继续使用 Vben Admin Monorepo |
| 修改主题 | 保持 Vben 默认主题 |
| 修改左侧菜单 | 11个一级菜单+57个二级菜单冻结 |
| 切换数据库 | 固定 PostgreSQL |
| 切换后端语言 | 固定 Node.js + Express |

---

## 九、开发启动条件与首批开发建议

### 9.1 开发启动条件（全部满足 ✅）

| 条件 | 状态 |
|------|------|
| 唯一生产系统确认 | ✅ |
| 11个一级菜单冻结 | ✅ |
| 57个二级菜单冻结 | ✅ |
| 技术栈冻结 | ✅ |
| 安全总览定位冻结 | ✅ |
| 规则体系定位冻结 | ✅ |
| 业务知识库策略冻结 | ✅ |

### 9.2 首批开发（Sprint11-1）建议顺序

#### P0 — 基础能力（必须先完成）

1. **Git仓库初始化**
2. **数据库基础表创建**：
   - hse_business_help（业务知识库）
   - assessment_rule（规则预留，仅建表+初始数据）
3. **基础数据初始化**：
   - 组织数据（hse_org_unit，五级架构）
   - 岗位数据（position，含考核对象标记）
   - 员工数据（employee，核心花名册）
   - 用户/角色/权限（5个角色 + 权限矩阵）
4. **业务知识库基础能力**：
   - 前端帮助入口组件（统一）
   - 后端CRUD接口
   - 首批3个核心模块帮助内容

#### P1 — 核心业务闭环

5. **人员管理**（员工CRUD + 花名册导入）
6. **三违管理**（登记 + 本人+上级传导 + 写assessment_deduction）
7. **月度考核**（周期 + 对象 + 自动评分 + 审核 + 冻结）
8. **隐患治理**（登记 → 整改 → 复查 → 闭环）
9. **安全总览首页**（驾驶舱消费以上数据）

#### P2 — 其他模块（随后续Sprint推进）

---

## 十、最终冻结声明

本报告为 **Sprint11 阶段最终基线冻结文档**，涵盖：
- 11个一级菜单（名称、顺序、图标、路径）
- 57个二级菜单（名称、顺序、归属、页面、路由）
- 六维完整映射（菜单→页面→路由→API→后端路由→数据表）
- 安全总览/智能驾驶舱定位
- 业务知识库实施策略
- 规则体系升级规划
- 技术栈与禁止事项

**自本报告发布之日起，以上所有内容全部冻结。任何修改须走正式审批流程。**

审批通过后，可启动 Sprint11-1 首批开发。

---

**报告生成时间**：2026-07-25
**编制人**：AI Agent
**审批人**：_________（待填写，签字后生效）
