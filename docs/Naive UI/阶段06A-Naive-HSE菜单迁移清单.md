# 阶段 06A - Naive HSE 全量菜单迁移清单（修复版）

> 生成日期：2026-08-17（修复版，依据 `提示词-06A-修复-Naive-HSE菜单迁移盘点.md`）
> 初版日期：2026-08-17
> 依据：`01-强制设计约束.md`、`00-Naive-UI-HSE总体实施计划.md`、`阶段06A-Codex审核.md`、`阶段05-Codex最终复验审核.md`、web-antd 11 个 hse-XX 路由模块逐文件统计、web-naive 现状只读盘点
> 性质：**纯盘点，未修改任何应用源码/后端/数据库**；作为阶段 06 各子批次唯一范围依据

---

## 〇、盘点统计（修复版，逐模块可复核）

### 0.1 总统计（Codex 审核确认值）

| 项 | 数量 |
|----|------|
| 旧版一级菜单（hse-01~hse-11 模块） | **11** |
| 11 个菜单内子路由 | **60** |
| 11 个菜单内 hideInMenu 隐藏路由 | **17** |
| 其中：安全总览 1 / 目标职责 8 / 制度标准 5 / 人员管理 1 / 培训考核 2 / 其余 0 | = 17 |
| 60 条路由中带 component 的 | 59（组件文件全部存在，0 缺失） |
| 60 条路由中纯 redirect 的 | 1（PersonnelOrgCenter → /personnel/departments） |
| web-naive 已迁移并已验收 | **5**（员工列表、应急预案、风险清单、组织管理、条款资料关联） |
| web-naive 仅占位 | **1**（/hse/overview 安全总览占位页） |
| web-naive `ant-design-vue` 命中 | **0** |
| 阶段 04/05 遗留 name 差异（web-naive） | 2（HseEmergencyPlans / HseRiskControl，见 §一.9/§一.4 备注） |

> **逐模块统计表（来源：`apps/web-antd/src/router/routes/modules/hse-0X-*.ts` 逐文件读取）**

| 模块文件 | 子路由数 | hideInMenu | 隐藏路由 name 明细 |
|---|---|---|---|
| hse-01-overview.ts | 12 | 1 | HseExecutiveCockpit |
| hse-02-objectives.ts | 12 | 8 | ObjectivesAssessment、AssessmentMonthlyCycles、AssessmentMonthlyTargets、AssessmentMonthlyScoring、AssessmentMonthlyReview、AssessmentMonthlyAdjust、AssessmentMonthlyFreeze、AssessmentMonthlyExcel |
| hse-03-standards.ts | 6 | 5 | StandardsLibrary、StandardsReview、StandardsClauses、StandardsRelation、StandardsSuggestions |
| hse-04-risk.ts | 2 | 0 | — |
| hse-05-hazards.ts | 1 | 0 | — |
| hse-06-site.ts | 3 | 0 | — |
| hse-07-personnel.ts | 8 | 1 | PersonnelOrgCenter |
| hse-08-training.ts | 5 | 2 | AssessmentManagement、ComprehensiveAssessment |
| hse-09-emergency.ts | 5 | 0 | — |
| hse-10-insurance.ts | 3 | 0 | — |
| hse-11-system.ts | 3 | 0 | — |
| **合计** | **60** | **17** | 分布 = 安全总览1 / 目标职责8 / 制度标准5 / 人员管理1 / 培训考核2 |

> 菜单外路由（hse-accidents/hse-advanced/hse-center/hse-workflow/hse-employee-profile/todos 等 27 个非 hse-01~11 模块）**不混入**上述 60/17 统计，见 §一.12「菜单外业务视图」。

---

## 一、完整路由与功能对照表（60 条逐行核对）

> 列含义见任务书；"Naive 当前状态"取值：`已迁移并已验收` / `未迁移` / `仅占位` / `路由缺失`。
> 旧版组件路径均为 `apps/web-antd/src/` 下相对路径；"API 来源（已核实）"= 本轮**只读文件检查**（逐页 grep 旧版页面 import 引用）确认的旧版契约来源文件，**不代表 web-naive 已具备该 API 文件**——除已标注"web-naive 已有"外，各批次均需在 `web-naive/src/api/hse/` 新增同名适配文件（对照旧版契约创建，不改服务端接口）。

### 1. 安全总览（order 1，authority admin，keepAlive，redirect /overview/cockpit）— 12 路由 / 1 隐藏

| 二级名称 | route name | 路径 | authority/hideInMenu | 旧版组件 | 核心功能 | API 来源（已核实） | Naive 当前状态 | 复杂度 | 建议批次 |
|---|---|---|---|---|---|---|---|---|---|
| 安全总览首页 | HseCockpit | /overview/cockpit | admin | views/hse/cockpit/index.vue | 仪表盘/图表统计 | api/hse/cockpit.ts（存在）；页面另以 `#/api/request` 直连 | 仅占位（/hse/overview 占位页，路径不同） | 高 | 06E-1 |
| 智能分析面板 | HseExecutiveCockpit | /overview/executive-cockpit | admin/hide | views/hse/executive-cockpit/index.vue | 图表分析面板 | api/hse/executive-cockpit.ts | 未迁移 | 高 | 06E-1 |
| BI数据看板 | HseBi | /overview/bi | admin | views/hse/bi/index.vue | BI 图表 | api/hse/cockpit.ts | 未迁移 | 高 | 06E-1 |
| AI智能分析 | HseAiAnalysis | /overview/ai-analysis | admin | views/hse/ai-analysis/index.vue | AI 分析 | api/hse/accident-analysis.ts 等 | 未迁移 | 高 | 06E-1 |
| 驾驶员风险中心 | HseDriverRiskCenter | /overview/driver-risk-center | admin | views/hse/driver-risk-center/index.vue | 风险驾驶分析 | api/hse/driver-risk-center.ts | 未迁移 | 高 | 06E-1 |
| 事故分析中心 | HseAccidentAnalysis | /overview/accident-analysis | admin | views/hse/accident-analysis/index.vue | 事故分析图表 | api/hse/accident-analysis.ts | 未迁移 | 高 | 06E-2 |
| 考核分析中心 | HseAssessmentAnalysis | /overview/assessment-analysis | admin | views/hse/assessment-analysis/index.vue | 考核图表 | api/hse/assessment-analysis.ts | 未迁移 | 高 | 06E-2 |
| 预警与整改中心 | HseWarningCenter | /overview/warning-center | admin | views/hse/warning-center/index.vue | 预警/整改看板 | api/hse/warning-center.ts | 未迁移 | 中 | 06E-2 |
| IoT物联网 | HseIot | /overview/iot | admin | views/hse/iot/index.vue | IoT 监控 | 待核实（页面 import 未解析到 api/hse 文件，见 §三.2） | 未迁移 | 高 | 06E-3 |
| 供应链安全 | HseSupplyChain | /overview/supply-chain | admin | views/hse/supply-chain/index.vue | 供应链安全 | api/hse/reports.ts 等 | 未迁移 | 高 | 06E-3 |
| 告警中心 | HseAlerts | /overview/alerts | admin | views/hse/alerts/index.vue | 告警列表 | api/hse/alerts.ts | 未迁移 | 中 | 06E-2 |
| 通知中心 | HseNotifications | /overview/notifications | admin | views/hse/notifications/index.vue | 通知列表 | api/hse/notifications.ts | 未迁移 | 中 | 06E-2 |

### 2. 目标职责（order 2，admin，redirect /objectives/responsibility）— 12 路由 / 8 隐藏

| 二级名称 | route name | 路径 | authority/hide | 旧版组件 | 核心功能 | API 来源（已核实） | Naive 状态 | 复杂度 | 批次 |
|---|---|---|---|---|---|---|---|---|---|
| 目标责任书管理 | ObjectivesResponsibility | /objectives/responsibility | admin | views/goals/index.vue | 责任书列表/CRUD/导入 | `#/api/hse/goals`（api/hse/goals.ts） | 未迁移 | 中 | 06B-2 |
| 安全人员及安委会 | ObjectivesCommittee | /objectives/committee | admin | views/objectives/committee/index.vue | 安委会成员列表 | `#/api/hse/goals` + `#/api/hse/employee` | 未迁移 | 中 | 06B-2 |
| 责任制及考核 | ObjectivesAssessment | /objectives/assessment | admin/hide | views/objectives/assessment/index.vue | 责任制考核 | `#/api/hse/goals` | 未迁移 | 中 | 06B-2 |
| 安全费用预算及支出 | ObjectivesBudget | /objectives/budget | admin | views/objectives/budget/index.vue | 预算表 | `#/api/hse/goals` | 未迁移 | 中 | 06B-2 |
| 月度安全履职考核 | AssessmentMonthlyIndex | /objectives/assessment-monthly | admin | views/hse/assessment-monthly/index.vue | 月度考核列表 | api/hse/assessment-monthly.ts（存在）；页面以 `#/api/request` 直连 `/assessment-monthly/*` | 未迁移 | **高** | 06B-3 |
| 考核周期 | AssessmentMonthlyCycles | /objectives/assessment-cycles | admin/hide | views/hse/assessment-monthly/cycles.vue | 周期配置 | 同上 | 未迁移 | 低 | 06B-3 |
| 考核对象 | AssessmentMonthlyTargets | /objectives/assessment-targets | admin/hide | views/hse/assessment-monthly/targets.vue | 对象配置 | 同上 | 未迁移 | 低 | 06B-3 |
| 自动评分 | AssessmentMonthlyScoring | /objectives/assessment-scoring | admin/hide | views/hse/assessment-monthly/scoring.vue | 自动评分 | 同上 | 未迁移 | 低 | 06B-3 |
| 扣分审核 | AssessmentMonthlyReview | /objectives/assessment-deduction-review | admin/hide | views/hse/assessment-monthly/deduction-review.vue | 扣分审核 | 同上 | 未迁移 | 中 | 06B-3 |
| 扣分调整 | AssessmentMonthlyAdjust | /objectives/assessment-deduction-adjust | admin/hide | views/hse/assessment-monthly/deduction-adjust.vue | 扣分调整 | 同上 | 未迁移 | 中 | 06B-3 |
| 结果冻结 | AssessmentMonthlyFreeze | /objectives/assessment-freeze | admin/hide | views/hse/assessment-monthly/freeze.vue | 结果冻结 | 同上 | 未迁移 | 低 | 06B-3 |
| Excel导入导出 | AssessmentMonthlyExcel | /objectives/assessment-excel | admin/hide | views/hse/assessment-monthly/excel.vue | 导入导出 | 同上 | 未迁移 | 中 | 06B-3 |

### 3. 制度标准（order 3，admin，redirect /standards/regulations）— 6 路由 / 5 隐藏

| 二级名称 | route name | 路径 | authority/hide | 旧版组件 | 核心功能 | API 来源（已核实） | Naive 状态 | 复杂度 | 批次 |
|---|---|---|---|---|---|---|---|---|---|
| 规章制度 | StandardsRegulations | /standards/regulations | admin | views/regulations/index.vue | 制度列表/CRUD/导入导出 | `#/api/hse/regulations`（api/hse/regulations.ts） | 未迁移（web-naive redirect 临时指向 relation） | 中 | 06C-1 |
| 文件库 | StandardsLibrary | /standards/library | admin/hide | views/hse/documents/library/index.vue | 文件库 | `#/api/hse/documents` | 未迁移 | 中 | 06C-1 |
| 文件审核 | StandardsReview | /standards/review | admin/hide | views/hse/documents/review/index.vue | 文件审核 | `#/api/hse/documents` | 未迁移 | 中 | 06C-1 |
| 标准条款库 | StandardsClauses | /standards/clauses | admin/hide | views/hse/standard/index.vue | 条款库 CRUD | 视图内联 `views/hse/standard/api.ts`（**web-antd 无 src/api/hse/standard.ts**） | 未迁移 | 中 | 06C-1 |
| **条款资料关联** | StandardsRelation | /standards/relation | admin/**hide（旧版基线）** | views/hse/standard/relation/index.vue | 条款-文件关联 | 视图内联 `views/hse/standard/relation/api.ts` + `views/hse/standard/api.ts`(getClauseTree) + `#/api/hse/documents` | **已迁移并已验收**（web-naive views/hse/standard/relation/index.vue；web-naive 临时改为可见+redirect，待决策恢复基线） | — | 排除（回归） |
| 匹配建议 | StandardsSuggestions | /standards/suggestions | admin/hide | views/hse/standard/relation/suggestions.vue | 匹配建议 | 视图内联 `views/hse/standard/relation/api.ts` | 未迁移 | 中 | 06C-1 |

### 4. 风险管控（order 4，admin，redirect /risk/list）— 2 路由 / 0 隐藏

| 二级名称 | route name | 路径 | authority/hide | 旧版组件 | 核心功能 | API 来源（已核实） | Naive 状态 | 复杂度 | 批次 |
|---|---|---|---|---|---|---|---|---|---|
| **风险清单** | RiskControlList | /risk/list | admin | views/risk-control/index.vue | 风险列表/地图/评估/导入 | `#/api/hse/risk-control`（api/hse/risk-control.ts） | **已迁移并已验收**（web-naive views/risk-control/index.vue；name 为 HseRiskControl） | — | 排除（回归） |
| 风险地图 | RiskControlMap | /risk/map | admin | views/risk-control/map.vue | 地图渲染 | 同上（risk-control.ts） | 未迁移（web-naive 风险清单内嵌地图已验收，独立地图路由未建） | 高 | 06E-4 |

### 5. 隐患治理（order 5，admin，redirect /hazards/list）— 1 路由 / 0 隐藏

| 二级名称 | route name | 路径 | authority/hide | 旧版组件 | 核心功能 | API 来源（已核实） | Naive 状态 | 复杂度 | 批次 |
|---|---|---|---|---|---|---|---|---|---|
| 隐患清单 | HazardsList | /hazards/list | admin | views/hazards/index.vue | 隐患列表/CRUD/导入导出 | `#/api/hse/insurance`（**已核实：views/hazards/index.vue 引用 api/hse/insurance.ts**） | 未迁移 | 高 | 06D-4 |

### 6. 现场管理（order 6，admin，redirect /site/violation）— 3 路由 / 0 隐藏

| 二级名称 | route name | 路径 | authority/hide | 旧版组件 | 核心功能 | API 来源（已核实） | Naive 状态 | 复杂度 | 批次 |
|---|---|---|---|---|---|---|---|---|---|
| 三违管理 | SiteViolation | /site/violation | admin | views/violations/index.vue | 三违列表/CRUD/导入 | `#/api/hse/violations`（**旧版契约来源** `apps/web-antd/src/api/hse/violations.ts`；web-naive 需新增适配文件） | 未迁移 | 中 | **06B-1（首实施批）** |
| 消防设施管理 | SiteFireFacility | /site/fire-facility | admin | views/inspection/fire-facility/index.vue | 消防设施列表 | `#/api/hse/site` + `#/api/hse/employee`（**旧版契约来源** `apps/web-antd/src/api/hse/site.ts`；web-naive 需新增适配文件） | 未迁移 | 中 | **06B-1** |
| 网格管理 | SiteGrid | /site/grid | admin | views/inspection/grid/index.vue | 网格列表/完成率；**含"三违记录"操作入口 + 抽屉（现有数据源为 mock）** | `#/api/hse/site` + `api/violations/by-grid`（**旧版契约来源**；web-naive 需新增适配文件；`GET /violations/by-grid` 为后端未实现 TODO，**不是现有接口**） | 未迁移 | 中 | **06B-1** |

### 7. 人员管理（order 7，父 authority admin+safety_manager（阶段05 修复），redirect /personnel/employee）— 8 路由 / 1 隐藏

| 二级名称 | route name | 路径 | authority/hide | 旧版组件 | 核心功能 | API 来源（已核实） | Naive 状态 | 复杂度 | 批次 |
|---|---|---|---|---|---|---|---|---|---|
| **员工列表** | PersonnelEmployee | /personnel/employee | admin | views/hse/employee/index.vue | 员工列表/导入/调岗/历史 | `#/api/hse/employee`（web-naive 已有 employee.ts） | **已迁移并已验收**（web-naive views/hse/employee/index.vue；name 为 HseEmployeeList） | — | 排除（回归） |
| **组织管理** | PersonnelDepartments | /personnel/departments | admin+safety_manager | views/hse/employee/departments.vue | 部门树/详情/员工 | `#/api/hse/employee` | **已迁移并已验收**（web-naive views/hse/employee/departments.vue） | — | 排除（回归） |
| 岗位管理 | PersonnelPositions | /personnel/positions | admin+safety_manager | views/hse/employee/positions.vue | 岗位列表/CRUD | `#/api/hse/employee` | 未迁移 | 中 | 06D-1 |
| 员工档案 | PersonnelProfile | /personnel/profile | admin | views/hse/employee-profile/index.vue | 员工档案详情 | api/hse/employee-profile.ts | 未迁移 | 中 | 06D-1 |
| 花名册导入 | PersonnelImport | /personnel/import | admin | views/hse/employee-import-v2/index.vue | 花名册导入 | api/hse/employee-import-v2.ts | 未迁移 | 高 | 06D-2 |
| 批量导入 | PersonnelBatchImport | /personnel/batch-import | admin | views/hse/batch-import/index.vue | 批量导入 | api/hse/batch-import.ts | 未迁移 | 中 | 06D-2 |
| 超龄人员 | PersonnelOverAge | /personnel/over-age | admin | views/hse/employee/over-age/index.vue | 超龄列表 | `#/api/hse/employee`（以页面引用为准） | 未迁移 | 中 | 06D-1 |
| 作业中心（隐藏重定向） | PersonnelOrgCenter | /personnel/org-center | admin+safety_manager/hide | **无组件（纯 redirect）** | redirect → /personnel/departments | — | 未迁移（阶段05 未建，保持基线） | 低 | 06D-3 |

### 8. 培训考核（order 8，admin，redirect /training/plans）— 5 路由 / 2 隐藏

| 二级名称 | route name | 路径 | authority/hide | 旧版组件 | 核心功能 | API 来源（已核实） | Naive 状态 | 复杂度 | 批次 |
|---|---|---|---|---|---|---|---|---|---|
| 培训计划 | TrainingPlans | /training/plans | admin | views/training/plans/index.vue | 培训计划列表 | `#/api/hse/training` | 未迁移 | 中 | 06C-2 |
| 培训记录 | TrainingRecords | /training/records | admin | views/training/ledger/index.vue | 培训台账 | `#/api/hse/training` | 未迁移 | 中 | 06C-2 |
| 考核管理 | AssessmentManagement | /training/assessments | admin/hide | views/training/requirements/index.vue | 考核要求 | `#/api/hse/training` | 未迁移 | 中 | 06C-2 |
| 证书管理 | CertificateManagement | /training/certificates | admin | views/training/index.vue | 证书管理 | `#/api/hse/training` | 未迁移 | 中 | 06C-2 |
| 综合考核 | ComprehensiveAssessment | /training/comprehensive | admin/hide | views/training/stats/index.vue | 综合考核统计 | `#/api/hse/training` | 未迁移 | 中 | 06C-2 |

### 9. 应急管理（order 9，admin，redirect /emergency/plans）— 5 路由 / 0 隐藏

| 二级名称 | route name | 路径 | authority/hide | 旧版组件 | 核心功能 | API 来源（已核实） | Naive 状态 | 复杂度 | 批次 |
|---|---|---|---|---|---|---|---|---|---|
| **应急预案** | EmergencyPlans | /emergency/plans | admin | views/emergency/plans/index.vue | 预案列表/导入 | `#/api/request`（web-naive 已建 api/emergency/plans.ts） | **已迁移并已验收**（web-naive views/emergency/plans/index.vue；name 为 HseEmergencyPlans） | — | 排除（回归） |
| 应急演练 | EmergencyDrills | /emergency/drills | admin | views/emergency/drills/index.vue | 演练列表 | `#/api/request` 直连；**已核实页面 URL：`/emergency/drills`（GET/POST/PUT/DELETE/export/stats）** | 未迁移 | 中 | 06C-3 |
| 应急物资 | EmergencyMaterials | /emergency/materials | admin | views/emergency/materials/index.vue | 物资列表 | `#/api/request` + `#/api/hse/employee-selector`；具体端点以页面代码为准 | 未迁移 | 中 | 06C-3 |
| 应急队伍 | EmergencyTeams | /emergency/teams | admin | views/emergency/teams/index.vue | 队伍列表 | `#/api/request` + `#/api/hse/employee-selector` | 未迁移 | 中 | 06C-3 |
| 应急事件 | EmergencyEvents | /emergency/events | admin | views/emergency/events/index.vue | 事件列表 | `#/api/request` 直连 | 未迁移 | 中 | 06C-3 |

### 10. 保险管理（order 10，admin，redirect /insurance/personnel）— 3 路由 / 0 隐藏

| 二级名称 | route name | 路径 | authority/hide | 旧版组件 | 核心功能 | API 来源（已核实） | Naive 状态 | 复杂度 | 批次 |
|---|---|---|---|---|---|---|---|---|---|
| 人员保险 | InsurancePersonnel | /insurance/personnel | admin | views/insurance/personnel/index.vue | 人员保险列表/导入 | `#/api/hse/insurance` + `#/api/hse/personnel-status` | 未迁移 | 高 | 06D-4 |
| 车辆保险 | InsuranceVehicle | /insurance/vehicle | admin | views/insurance/vehicle/index.vue | 车辆保险 | `#/api/hse/insurance` | 未迁移 | 中 | 06D-4 |
| 其他保险 | InsuranceOther | /insurance/other | admin | views/insurance/other/index.vue | 其他保险 | `#/api/hse/insurance` + `#/api/request` | 未迁移 | 中 | 06D-4 |

### 11. 系统管理（order 11，admin，redirect /system/users）— 3 路由 / 0 隐藏

| 二级名称 | route name | 路径 | authority/hide | 旧版组件 | 核心功能 | API 来源（已核实） | Naive 状态 | 复杂度 | 批次 |
|---|---|---|---|---|---|---|---|---|---|
| 用户管理 | SystemUsers | /system/users | admin | views/system/users/index.vue | 用户 CRUD | `#/api/hse/system` | 未迁移 | 中 | 06D-5 |
| 角色管理 | SystemRoles | /system/roles | admin | views/system/roles/index.vue | 角色 CRUD | `#/api/hse/system` | 未迁移 | 中 | 06D-5 |
| 审计日志 | SystemAudit | /system/audit | admin | views/security/audit/index.vue | 审计日志 | `#/api/hse/audit` | 未迁移 | 中 | 06D-5 |

### 12. 菜单外业务视图（不在 11 个菜单树内，路由基线已逐项核实）

> 处置（按修复任务书 §四）：**以下视图已完成旧版路由基线映射，但统一标注为「菜单外待确认范围」，从 06B-06E 实施批次中移除，等待 Codex 与用户决定是否纳入**。其中"员工档案/风险详情/告警/通知/工作流"等存在与 11 菜单内路由**同名重复**定义（旧版遗留），纳入前须先决策去重规则。

| 视图 | 旧版路由模块（已核实） | route name | path | authority | hideInMenu | 组件 | 备注 |
|---|---|---|---|---|---|---|---|
| 事故管理 | `router/routes/modules/hse-accidents.ts` | Accidents | /accidents | admin | ✅（独立一级，无父级） | views/accidents/index.vue | API `#/api/hse/accidents` |
| 待办事项 | `router/routes/modules/todos.ts` | HseTodos | /hse/todos | **无 authority 字段（旧版基线）** | ❌（order 1.5） | redirect /hse/todos/my | 子：HseTodosMy /hse/todos/my、HseTodosPlan /hse/todos/plan；**登录 homePath 指向此处（web-naive 未注册 → 404）** |
| 员工档案中心 | `router/routes/modules/hse-employee-profile.ts` | HseEmployeeProfile | /hse/employee-profile | admin/safety_manager/employee | ✅ | redirect /hse/employee-profile/list | 子：HseEmployeeProfileList /hse/employee-profile/list（views/hse/employee-profile/index.vue）；**与 hse-07 的 /personnel/profile 使用同一视图** |
| 员工主档案（内部跳转） | `router/routes/modules/hse-employee-profile-detail.ts` | EmployeeProfile | /hse/employee/:id(\\d+) | 无（纯内部） | ✅+hideInTab | views/hse/employee/ProfilePage.vue | 由员工姓名组件点击跳转（R1-Phase1 收尾） |
| 工作流引擎 | `router/routes/modules/hse-center.ts` + `hse-workflow.ts`（**重复定义**） | HseWorkflow | /hse/workflow | admin | ✅ | views/hse/workflow/index.vue | API api/hse/workflow.ts |
| 告警中心（旧版隐藏版） | `router/routes/modules/hse-center.ts` | HseAlerts | /hse/alerts | admin | ✅ | views/hse/alerts/index.vue | **与 hse-01 的 HseAlerts(/overview/alerts) 同名重复** |
| 通知中心（旧版隐藏版） | `router/routes/modules/hse-center.ts` | HseNotifications | /hse/notifications | admin | ✅ | views/hse/notifications/index.vue | **与 hse-01 的 HseNotifications(/overview/notifications) 同名重复** |
| 高级分析（含风险详情） | `router/routes/modules/hse-advanced.ts` | HseAdvanced | /hse-advanced | admin/safety_manager/group_leader/department_manager/township_manager/area_manager | ✅ | redirect /hse-advanced/cockpit | 10 子路由：cockpit/driver-risk/accident-analysis/assessment-analysis/executive-cockpit/warning-center/bi/ai-analysis/iot/supply-chain（**与 hse-01 overview 大部分同名重复**）；其中 **HseRiskProfileDetail /hse-advanced/risk-profile/:employeeId**（hideInMenu 参数路由）即"风险详情"视图 views/hse/risk-profile-detail/index.vue |
| 报表 | **无任何路由模块引用**（`views/hse/reports/` 为孤儿视图） | — | — | — | — | views/hse/reports/ | **无路由基线，无法映射 → 标「菜单外待确认范围」** |

---

## 二、页面能力与统一组件适配矩阵

> 判定依据：本次只读 grep（table/import/export/sort/map 计数）与 §一 API 引用核实。标注"待核实"的项给出核实路径（§三）。

### 2.1 已验收页面（阶段 04/05，不重做，仅回归）

| 页面 | 采用组件 | 已实现能力 | 备注 |
|---|---|---|---|
| 员工列表 | HsePageLayout + HseSearchPanel + HseActionBar + HseDataGrid + HseImportDialog | 服务端分页/三态排序/导入/调岗/历史 | 阶段04 验收 |
| 应急预案 | 同上 | 服务端分页/模板导入/导出 | 阶段04 验收 |
| 风险清单 | 同上 + 内嵌地图 | 服务端分页/地图/评估/附件/导入/导出 | 阶段04 验收（独立 /risk/map 路由未建） |
| 组织管理 | HsePageLayout + HseSplitPane + HseDataGrid | 树/详情双列/服务端分页/CRUD | 阶段05 验收（SM 只读） |
| 条款资料关联 | HsePageLayout + HseSplitPane + HseDataGrid | 树/关联列表/新增/确认/取消 | 阶段05 验收（严格 admin） |

### 2.2 待迁移页面适配判定（部分）

| 页面 | 标准列表页？ | 导入/导出/新增/编辑/删除 | 服务端分页+排序 | HseSplitPane？ | 需 Naive 组件/公共组件 | 风险 / 依赖 |
|---|---|---|---|---|---|---|
| 目标责任书管理 | ✅ | 导入/新增/编辑/删除（import 计数30） | 待核实（api/hse/goals.ts 分页契约） | 否 | HseDataGrid/HseImportDialog/NModal | 实施前读 api/hse/goals.ts |
| 安全人员及安委会 | ✅ | 新增/编辑/删除 | 待核实 | 否 | HseDataGrid | 依赖 api/hse/employee 选择器 |
| 月度安全履职考核 | ✅ | 导入/导出/编辑 | 待核实 | 否 | HseDataGrid | **8 路由高复杂度独立批（06B-3）**；防改触发器见 §三.4 |
| 三违管理 | ✅ | 导入/新增/编辑/删除 | 待核实（`apps/web-antd/src/api/hse/violations.ts` 分页契约） | 否 | HseDataGrid/HseImportDialog | **web-naive 需新增 violations.ts 适配**（对照旧版契约创建）；网格三违集成 TODO（预留接口，非本任务范围） |
| 消防设施管理 | ✅ | 新增/编辑/删除 | 待核实 | 否 | HseDataGrid | **web-naive 需新增 site.ts 适配**；employee.ts 契约核对后复用 |
| 网格管理 | ✅ | 查看/统计 | 是（完成率统计） | 否 | HseDataGrid/HseStatusTag | **web-naive 需新增 site.ts 适配**；`server/routes/site-mgmt.js`、`server/services/gridCompletionService.js` 仅文件存在，接口联通性待核实 |
| 培训计划/记录/证书 | ✅ | 新增/编辑/删除 | 待核实（api/hse/training.ts） | 否 | HseDataGrid | training.ts 契约 |
| 应急演练/物资/队伍/事件 | ✅ | 新增/编辑/删除/导入导出 | 待核实（页面 `#/api/request` 直连） | 否 | HseDataGrid | 端点以各页面代码为准（drills 已核实 `/emergency/drills`；materials/teams 另用 employee-selector） |
| 人员/车辆/其他保险 | ✅ | 导入/导出/编辑 | 待核实（api/hse/insurance.ts） | 否 | HseDataGrid/HseImportDialog | 保险-花名册关联基线见 §三.5 |
| 隐患清单 | ✅ | 导入/导出/新增/编辑/删除 | 待核实 | 否 | HseDataGrid/HseImportDialog | import 计数22 高复杂度；API 实为 api/hse/insurance（已核实） |
| 事故管理 | ✅ | 导入导出/CRUD（export12） | 待核实 | 否 | HseDataGrid/HseImportDialog | map19 可能含地图；**菜单外待确认** |
| 规章制度 | ✅ | 导入导出/CRUD（export12） | 待核实 | 否 | HseDataGrid/HseImportDialog | api/hse/regulations.ts |
| 标准条款库 | ✅（树/列表混合） | 新增/编辑/删除/导入导出 | 待核实 | 是（树+详情） | HseSplitPane/HseDataGrid | API 在 `views/hse/standard/api.ts`（视图内联） |
| 文件库/文件审核 | ✅ | 上传/审核 | 待核实 | 否 | HseDataGrid/NUpload | api/hse/documents.ts（web-naive 已有 documents.ts） |
| 用户/角色管理 | ✅ | 新增/编辑/删除 | 待核实（api/hse/system.ts） | 否 | HseDataGrid/NModal | 角色管理 sort12 含排序 |
| 审计日志 | ✅ | 只读/导出 | 待核实 | 否 | HseDataGrid | api/hse/audit.ts |
| 安全总览系列（12 页） | ❌（看板型） | 无 | 不适用 | 否 | NCard/图表组件（**图表方案待决策**） | 看板/图表页不适用 HseDataGrid 标准栈 |
| 待办/工作流/报表/风险详情 | 混合 | 混合 | 待核实 | 部分 | 待核实 | 菜单外待确认 |

---

## 三、待核实项清单（修复版：无"记忆"表述，逐项给文件路径）

| # | 待核实项 | 下一步应阅读的精确文件 |
|---|---|---|
| 1 | 各列表 API 的分页/排序参数契约（goals/violations/site/training/insurance/regulations/system/audit/accidents/documents/employee-import-v2/batch-import/employee-profile） | `apps/web-antd/src/api/hse/<对应文件>.ts`（实施各批次前逐一阅读） |
| 2 | 安全总览 12 页是否依赖图表库（echarts 等）及统计端点 | `apps/web-antd/src/views/hse/<页面>/index.vue` + `apps/web-antd/src/api/hse/<页面>.ts`（06E 前必须决策图表方案） |
| 3 | IoT 页面的 API 来源（grep 未解析到 api/hse 文件） | `apps/web-antd/src/views/hse/iot/index.vue` 的 import 段 |
| 4 | 月度考核防改触发器（**已核实存在，非"记忆"**）：`server/sql/sprint10d2_assessment_init.sql` L326 `CREATE TRIGGER trg_prevent_adjustment_update`、L404 `CREATE TRIGGER trg_prevent_audit_update`；另见 `server/sql/hse_fk65_cleanup.sql` L7/L20（DISABLE/ENABLE）。06B-3 实施时须确认写操作是否受触发器拦截 | 上述两个 SQL 文件 + `server/routes/hse-assessment-monthly.js` |
| 5 | 保险-花名册关联基线：`server/sql/personnel_insurance_employee_id_migration.sql` **脚本存在**；**执行状态与回填数量待核实**（本轮未获数据库执行/核验授权与证据，不得据此断言已执行） | 上述 SQL 文件 + `apps/web-antd/src/views/insurance/personnel/index.vue`（实施前核对） |
| 6 | 网格后端基线：`server/routes/site-mgmt.js`、`server/services/gridCompletionService.js` **文件存在**；**接口联通性与契约验证状态待核实**（不得据此断言接口已联通、契约已验证或无需后端授权） | 上述两个文件 + `apps/web-antd/src/views/inspection/grid/index.vue` |
| 7 | 应急 drills/materials/teams/events 具体端点（drills 已核实 `/emergency/drills`；其余以页面代码为准） | `apps/web-antd/src/views/emergency/{drills,materials,teams,events}/index.vue` + `server/routes/emergency.js` |
| 8 | 报表视图（`views/hse/reports/`）无任何路由模块引用——孤儿视图，路由归属待确认 | `apps/web-antd/src/router/routes/modules/` 全量 grep（本次已 grep 无结果） |
| 9 | 通用导入（import.js）对 regulations 等模块的支持范围 | `server/routes/import.js` 的 NATIVE_IMPORT_MODULES（06C-1 规章制度导入前核实） |

---

## 四、分批实施方案（修复版）

> 排序理由：**功能依赖 + 风险**优先，非菜单编号。已验收页面（§二.1 的 5 页）排除在迁移范围外，仅纳入回归清单。
> **默认边界（每批适用）**：已验收页面只回归不重做；不改 `server` / SQL / 数据库 / 账号 / 依赖 / 锁文件；潜在后端需求一律标注「需另行授权」，不得自行放宽。
> **每批约束**：一级菜单 ≤3；每批页面 ≤5；一个菜单内待迁移页面 >5 时拆子批次。**唯一例外**：06B-3 月度安全履职考核 8 路由（含 7 隐藏）为任务书明确要求的「高复杂度独立批」——同一模块的 8 个子页面（周期/对象/评分/审核/调整/冻结/导入导出），数据链路单一，不属"打包多个不同数据链路"。
> **API 适配统一原则（各批次适用）**：`apps/web-antd/src/api/hse/<file>.ts` 仅作为**接口契约来源**；除已标注"web-naive 已有"的文件（employee/documents/standard/standard-relation/emergency-plans/risk-control）外，各批次须在 `web-naive/src/api/hse/` **新增同名适配文件**，逐个对照旧版请求方法/URL/参数/返回结构后创建，不改服务端接口；已存在的文件也须实施前逐项核对契约后复用。

### 批次汇总表（重新编号，全表与各节一致；每批 ≤5 页且无重叠）

| 批次 | 一级菜单 | 路由数 | route name / path 一览 |
|---|---|---|---|
| **06B-1**（首实施） | 现场管理 | 3 | SiteViolation /site/violation；SiteFireFacility /site/fire-facility；SiteGrid /site/grid |
| 06B-2 | 目标职责 | 4 | ObjectivesResponsibility /objectives/responsibility；ObjectivesCommittee /objectives/committee；ObjectivesAssessment /objectives/assessment(hide)；ObjectivesBudget /objectives/budget |
| 06B-3 | 目标职责-月度（**高复杂度独立批**） | 8 | AssessmentMonthlyIndex /objectives/assessment-monthly + AssessmentMonthlyCycles/Targets/Scoring/Review/Adjust/Freeze/Excel（7 隐藏） |
| 06C-1 | 制度标准 | 5 | StandardsRegulations /standards/regulations；StandardsLibrary /standards/library(hide)；StandardsReview /standards/review(hide)；StandardsClauses /standards/clauses(hide)；StandardsSuggestions /standards/suggestions(hide) |
| 06C-2 | 培训考核 | 5 | TrainingPlans /training/plans；TrainingRecords /training/records；AssessmentManagement /training/assessments(hide)；CertificateManagement /training/certificates；ComprehensiveAssessment /training/comprehensive(hide) |
| 06C-3 | 应急管理 | 4 | EmergencyDrills /emergency/drills；EmergencyMaterials /emergency/materials；EmergencyTeams /emergency/teams；EmergencyEvents /emergency/events |
| 06D-1 | 人员管理·常规 | 3 | PersonnelPositions /personnel/positions；PersonnelProfile /personnel/profile；PersonnelOverAge /personnel/over-age |
| 06D-2 | 人员管理·导入 | 2 | PersonnelImport /personnel/import；PersonnelBatchImport /personnel/batch-import |
| 06D-3 | 人员管理·redirect | 1 | PersonnelOrgCenter /personnel/org-center(hide, 纯 redirect) |
| 06D-4 | 隐患+保险 | 4 | HazardsList /hazards/list；InsurancePersonnel /insurance/personnel；InsuranceVehicle /insurance/vehicle；InsuranceOther /insurance/other |
| 06D-5 | 系统管理 | 3 | SystemUsers /system/users；SystemRoles /system/roles；SystemAudit /system/audit |
| 06E-1 | 安全总览 A | 5 | HseCockpit /overview/cockpit；HseExecutiveCockpit /overview/executive-cockpit(hide)；HseBi /overview/bi；HseAiAnalysis /overview/ai-analysis；HseDriverRiskCenter /overview/driver-risk-center |
| 06E-2 | 安全总览 B | 5 | HseAccidentAnalysis /overview/accident-analysis；HseAssessmentAnalysis /overview/assessment-analysis；HseWarningCenter /overview/warning-center；HseAlerts /overview/alerts；HseNotifications /overview/notifications |
| 06E-3 | 安全总览 C（前置待核实） | 2 | HseIot /overview/iot；HseSupplyChain /overview/supply-chain |
| 06E-4 | 风险管控 | 1 | RiskControlMap /risk/map |
| **合计** | — | **55** | 覆盖 60 − 5（已验收仅回归）；菜单外视图不计入 |

### 06B-1 —— 现场管理（**首个实际实施批次**，1 个一级菜单 / 3 页 / 全中复杂度）

| 项 | 内容 |
|---|---|
| 精确范围（route name / path / 旧版组件 / API 契约来源 / 预计新增 Naive 文件） | ① `SiteViolation` `/site/violation` ← 旧版 `views/violations/index.vue`，**契约来源** `apps/web-antd/src/api/hse/violations.ts` → 新增 `web-naive/src/api/hse/violations.ts`（API 适配）+ `web-naive/src/views/site/violation/index.vue`；② `SiteFireFacility` `/site/fire-facility` ← 旧版 `views/inspection/fire-facility/index.vue`，**契约来源** `apps/web-antd/src/api/hse/site.ts` + `employee.ts` → 新增 `web-naive/src/api/hse/site.ts`（API 适配）+ `web-naive/src/views/site/fire-facility/index.vue`；③ `SiteGrid` `/site/grid` ← 旧版 `views/inspection/grid/index.vue`，**契约来源** `apps/web-antd/src/api/hse/site.ts` → 新增 `web-naive/src/views/site/grid/index.vue` |
| **API 适配任务** | **逐个对照旧版请求方法、URL、参数、返回结构后在 Naive 内创建** `web-naive/src/api/hse/violations.ts` 与 `site.ts`（本轮盘点已核实 web-naive 现无这两个文件）；**不改服务端接口**。`web-naive/src/api/hse/employee.ts` 已存在，但**仅实施前逐项核对接口契约后复用**，不得默认其与旧版页面完全一致 |
| 新增路由 | 仅新增 `web-naive/src/router/routes/modules/hse-site.ts`：父 `/site`（order 6，authority admin，redirect /site/violation）+ 3 子路由。**路由经 `src/router/routes/index.ts` 的 `import.meta.glob('./modules/**/*.ts')` 自动发现**：不得修改 `routes/index.ts`、不得使用 `meta.ignoreAccess`、不得把 admin 路由纳入 `publicRoutes`；路由继续由 `accessRoutes` 依 `authority: ['admin']` 登录后过滤 |
| 预期复用 | HsePageLayout/HseSearchPanel/HseActionBar/HseDataGrid/HseImportDialog/HseStatusTag（均已在 `apps/web-naive/src/components/hse/` 存在） |
| 边界 | 不改 server/SQL/数据库；**网格页"三违记录"交互保留边界**：旧版 `views/inspection/grid/index.vue` 已有"三违记录"操作入口和抽屉（`loadGridViolations` 使用 mock 数据）；06B-1 须**保留该操作入口与 mock 抽屉展示**（UI 改版不删除既有用户交互），**不得请求不存在的 `GET /violations/by-grid`、不得修改或新增后端接口**；`server/routes/violations.js` 的 `TODO[GRID_VIOLATION_INTEGRATION]` 为未实现标记，**真实网格-三违数据接入须作为单独后端任务并先取得用户授权**（不在本批范围） |
| 完成标志 | 3 页 CRUD/导入闭环；typecheck/build 通过；控制台 0 应用级错误 |
| 后端授权 | 无本批内后端改动；如验收发现端点缺失（待核实项 §三.1/§三.6），**需另行授权** |

### 06B-2 —— 目标职责（非月度部分，1 个一级菜单 / **4 个子路由** / 中复杂度）

| 项 | 内容 |
|---|---|
| 精确范围 | ① `ObjectivesResponsibility` `/objectives/responsibility`（views/goals/index.vue，`#/api/hse/goals`）；② `ObjectivesCommittee` `/objectives/committee`（views/objectives/committee/index.vue，`#/api/hse/goals`+`#/api/hse/employee`）；③ `ObjectivesAssessment` `/objectives/assessment`（hide，views/objectives/assessment/index.vue）；④ `ObjectivesBudget` `/objectives/budget`（views/objectives/budget/index.vue）。**共 4 个子路由**（父路由 redirect 不计入路由数） |
| 新增路由 | `web-naive/src/router/routes/modules/hse-objectives.ts`：父 `/objectives`（order 2，admin，redirect /objectives/responsibility）+ 4 子路由（自动发现，机制同 06B-1） |
| 边界 | 同 06B-1 默认边界；goals 分页契约实施前读 `api/hse/goals.ts`（待核实项 §三.1） |
| 完成标志 | 4 路由可达（含 1 隐藏）；CRUD 闭环；typecheck/build 通过 |
| 后端授权 | 无本批内后端改动；端点缺失需另行授权 |

### 06B-3 —— 月度安全履职考核（**高复杂度独立批**，1 个一级菜单 / 8 路由）

| 项 | 内容 |
|---|---|
| 范围 | `AssessmentMonthlyIndex` `/objectives/assessment-monthly` + **7 个隐藏子路由**：`AssessmentMonthlyCycles` `/objectives/assessment-cycles`、`AssessmentMonthlyTargets` `/objectives/assessment-targets`、`AssessmentMonthlyScoring` `/objectives/assessment-scoring`、`AssessmentMonthlyReview` `/objectives/assessment-deduction-review`、`AssessmentMonthlyAdjust` `/objectives/assessment-deduction-adjust`、`AssessmentMonthlyFreeze` `/objectives/assessment-freeze`、`AssessmentMonthlyExcel` `/objectives/assessment-excel` |
| 组件 | views/hse/assessment-monthly/{index,cycles,targets,scoring,deduction-review,deduction-adjust,freeze,excel}.vue（8 个） |
| 边界 | 同默认边界；**防改触发器**（§三.4：trg_prevent_adjustment_update / trg_prevent_audit_update）约束扣分调整/审核写操作，实施时须先确认写链路是否被拦截 |
| 完成标志 | 8 路由可达；周期/对象/评分/审核/调整/冻结/导入导出闭环；typecheck/build 通过 |
| 后端授权 | 后端 `server/routes/hse-assessment-monthly.js` 已存在（文件核实）；若写操作受触发器约束需调整，**需另行授权** |

### 06C-1 —— 制度标准（1 个一级菜单 / 5 路由 / 中复杂度）

| 项 | 内容 |
|---|---|
| 范围 | `StandardsRegulations` `/standards/regulations`（views/regulations/index.vue）、`StandardsLibrary` `/standards/library`（hide）、`StandardsReview` `/standards/review`（hide）、`StandardsClauses` `/standards/clauses`（hide，views/hse/standard/index.vue）、`StandardsSuggestions` `/standards/suggestions`（hide） |
| 前置决策 | `/standards` redirect 恢复基线 `/standards/regulations` + relation 恢复 hideInMenu（待用户决策，见 §五.1） |
| API | `#/api/hse/regulations`、`#/api/hse/documents`、视图内联 `views/hse/standard/api.ts` + `views/hse/standard/relation/api.ts` |
| 边界 | 同默认边界；web-naive 已存在 `api/hse/documents.ts`（阶段05 建）与 `components/hse/HseImportDialog.vue`（阶段04 建）——**HseImportDialog 为本项目已存在的公共组件，直接复用，不构成新依赖**（删除初版"06C 依赖 06B 的 HseImportDialog 基础"表述） |
| 完成标志 | 5 路由可达；规章制度导入闭环（导入支持范围见待核实项 §三.9）；typecheck/build 通过 |
| 后端授权 | 规章制度导入是否走通用导入（`server/routes/import.js` NATIVE_IMPORT_MODULES）**待核实**；如需扩展授权范围，需另行授权 |

### 06C-2 —— 培训考核（1 个一级菜单 / 5 路由 / 中复杂度）

| 项 | 内容 |
|---|---|
| 范围 | `TrainingPlans` `/training/plans`、`TrainingRecords` `/training/records`、`AssessmentManagement` `/training/assessments`（hide）、`CertificateManagement` `/training/certificates`、`ComprehensiveAssessment` `/training/comprehensive`（hide） |
| API | 全部 `#/api/hse/training`（api/hse/training.ts 存在） |
| 边界 | 同默认边界 |
| 完成标志 | 5 路由可达；typecheck/build 通过 |
| 后端授权 | 无本批内后端改动；端点缺失需另行授权 |

### 06C-3 —— 应急管理剩余（1 个一级菜单 / 4 路由 / 中复杂度）

| 项 | 内容 |
|---|---|
| 范围 | `EmergencyDrills` `/emergency/drills`、`EmergencyMaterials` `/emergency/materials`、`EmergencyTeams` `/emergency/teams`、`EmergencyEvents` `/emergency/events`（应急预案已验收排除） |
| API | `#/api/request` 直连（drills 已核实 `/emergency/drills`）；materials/teams 另用 `#/api/hse/employee-selector`；web-naive 已有 `api/emergency/plans.ts`（阶段04 建，预案页用） |
| 边界 | 同默认边界；**name 差异决策**：web-naive 现有 `HseEmergencyPlans`（阶段04），本批新增 drills 等子路由是否恢复基线名（EmergencyPlans 等）待决策（§五.5） |
| 完成标志 | 4 路由可达；typecheck/build 通过 |
| 后端授权 | 端点以 `server/routes/emergency.js` 为准（文件核实存在）；如需扩展需另行授权 |

### 06D-1 —— 人员管理·常规页面（1 个一级菜单 / 3 路由 / 中复杂度）

| 项 | 内容 |
|---|---|
| 范围 | `PersonnelPositions` `/personnel/positions`（views/hse/employee/positions.vue，`#/api/hse/employee`）、`PersonnelProfile` `/personnel/profile`（views/hse/employee-profile/index.vue，api/hse/employee-profile.ts）、`PersonnelOverAge` `/personnel/over-age`（views/hse/employee/over-age/index.vue） |
| 边界 | 同默认边界；`web-naive/src/api/hse/employee.ts` 已存在，**实施前逐项核对接口契约后复用**（不得默认与旧版完全一致）；部门树展示全部 department 的后端调整**当前未授权**（§五.2） |
| 完成标志 | 3 路由可达；typecheck/build 通过 |
| 后端授权 | 无本批内后端改动；端点缺失需另行授权 |

### 06D-2 —— 人员管理·导入页面（1 个一级菜单 / 2 路由 / 中高复杂度）

| 项 | 内容 |
|---|---|
| 范围 | `PersonnelImport` `/personnel/import`（高，views/hse/employee-import-v2/index.vue，api/hse/employee-import-v2.ts）、`PersonnelBatchImport` `/personnel/batch-import`（views/hse/batch-import/index.vue，api/hse/batch-import.ts） |
| 边界 | 同默认边界；花名册导入与员工列表联动（employee-import-v2/batch-import 契约待核实 §三.1） |
| 完成标志 | 2 路由可达；导入闭环；typecheck/build 通过 |
| 后端授权 | 花名册导入新端点（如有）需另行授权 |

### 06D-3 —— 人员管理·纯 redirect（1 个一级菜单 / 1 路由 / 低复杂度）

| 项 | 内容 |
|---|---|
| 范围 | `PersonnelOrgCenter` `/personnel/org-center`（hide 纯 redirect → /personnel/departments，**无组件**，保留旧书签/链接 404 兜底语义） |
| 边界 | 同默认边界 |
| 完成标志 | 1 路由注册且 redirect 生效；typecheck/build 通过 |
| 后端授权 | 无 |

### 06D-4 —— 隐患 + 保险（2 个一级菜单 / 4 路由 / 中高复杂度）

| 项 | 内容 |
|---|---|
| 范围 | `HazardsList` `/hazards/list`（高，views/hazards/index.vue）、`InsurancePersonnel` `/insurance/personnel`（高）、`InsuranceVehicle` `/insurance/vehicle`、`InsuranceOther` `/insurance/other` |
| API | `#/api/hse/insurance`（隐患复用，旧版契约来源已核实）+ `#/api/hse/personnel-status` + `#/api/request`；**web-naive 需新增 insurance.ts 适配文件**（对照旧版契约） |
| 边界 | 同默认边界；保险-花名册关联基线见 §三.5（**迁移脚本存在，执行状态待核实**） |
| 完成标志 | 4 路由可达；typecheck/build 通过 |
| 后端授权 | 无本批内后端改动；端点缺失需另行授权 |

### 06D-5 —— 系统管理（1 个一级菜单 / 3 路由 / 中复杂度）

| 项 | 内容 |
|---|---|
| 范围 | `SystemUsers` `/system/users`、`SystemRoles` `/system/roles`、`SystemAudit` `/system/audit` |
| API | `#/api/hse/system`、`#/api/hse/audit`（旧版契约来源；web-naive 需新增适配文件） |
| 边界 | 同默认边界 |
| 完成标志 | 3 路由可达；typecheck/build 通过 |
| 后端授权 | 无本批内后端改动；端点缺失需另行授权 |

### 06E-1 —— 安全总览 A（1 个一级菜单 / 5 路由 / 高复杂度·需图表决策）

| 项 | 内容 |
|---|---|
| 范围 | `HseCockpit` `/overview/cockpit`、`HseExecutiveCockpit` `/overview/executive-cockpit`(hide)、`HseBi` `/overview/bi`、`HseAiAnalysis` `/overview/ai-analysis`、`HseDriverRiskCenter` `/overview/driver-risk-center` |
| 前置决策 | **图表方案必须先行决策**（§五.4）：复用旧版图表依赖或 Naive/Vben 图表；各页统计端点契约实施前核实（待核实 §三.2） |
| 边界 | 同默认边界 |
| 完成标志 | 5 路由可达；看板渲染 + 图表数据链路；typecheck/build 通过 |
| 后端授权 | 看板统计端点缺失（待核实 §三.2）需另行授权 |

### 06E-2 —— 安全总览 B（1 个一级菜单 / 5 路由 / 高复杂度·需图表决策）

| 项 | 内容 |
|---|---|
| 范围 | `HseAccidentAnalysis` `/overview/accident-analysis`、`HseAssessmentAnalysis` `/overview/assessment-analysis`、`HseWarningCenter` `/overview/warning-center`、`HseAlerts` `/overview/alerts`、`HseNotifications` `/overview/notifications` |
| 前置决策 | 同 06E-1：图表方案先决策；统计端点契约实施前核实 |
| 边界 | 同默认边界 |
| 完成标志 | 5 路由可达；typecheck/build 通过 |
| 后端授权 | 看板统计端点缺失需另行授权 |

### 06E-3 —— 安全总览 C（1 个一级菜单 / 2 路由 / 高复杂度·前置待核实）

| 项 | 内容 |
|---|---|
| 范围 | `HseIot` `/overview/iot`、`HseSupplyChain` `/overview/supply-chain` |
| 前置待核实 | IoT 页面 API 来源未解析（§三.3，读 `views/hse/iot/index.vue`）；供应链 API 依赖 `api/hse/reports.ts` 等（§三.2）。**两项前置确认完成后才实施本批** |
| 边界 | 同默认边界 |
| 完成标志 | 2 路由可达；typecheck/build 通过 |
| 后端授权 | 端点缺失（待核实）需另行授权 |

### 06E-4 —— 风险地图（1 个一级菜单 / 1 路由 / 高复杂度）

| 项 | 内容 |
|---|---|
| 范围 | `RiskControlMap` `/risk/map`（views/risk-control/map.vue，高复杂度地图；web-naive 风险清单内嵌地图已验收，独立地图路由未建） |
| 菜单外视图 | 事故/待办/员工档案中心/工作流/告警·通知（旧版隐藏版）/高级分析/报表 —— **均属「菜单外待确认范围」**（§一.12 已补全路由基线），**不在 06B-06E 实施批次内**，等待 Codex 与用户决定 |
| 完成标志 | 风险地图路由可达；typecheck/build 通过 |

---

## 五、待用户/架构决策项（本任务不实施）

1. **`/standards` redirect 与 relation 菜单语义**：基线 redirect `/standards/regulations` + relation 隐藏（hideInMenu: true，本次已核实旧版 hse-03-standards.ts）；当前 web-naive 临时 `/standards/relation` + 可见。06C-1 迁移规章制度后需恢复基线——待 06C-1 前用户确认。
2. **部门树展示全部 department**：**当前未授权**；若迁移验收确需该后端语义变更，须另行向用户申请授权。
3. **`/hse/todos` homePath 404**：后端写死 homePath `/hse/todos`，web-naive 未注册该路由（登录后 404）。旧版路由基线已核实（todos.ts：HseTodos → redirect /hse/todos/my）。**本项属菜单外待确认范围**，纳入与否由用户决定。
4. **看板/图表方案**：06E-1~06E-3 安全总览系列需决定图表库（复用旧版或 Naive 生态），避免引入第二套重量级依赖。
5. **web-naive 遗留 name 差异**：`HseEmergencyPlans`/`HseRiskControl` 与基线 `EmergencyPlans`/`RiskControlList` 不一致（阶段04 遗留，Codex 已通过未要求恢复）。06C-3 扩展 emergency、06E-4 建 /risk/map 时是否一并恢复基线 name 需用户确认（可能影响按 name 导航引用）。
6. **菜单外视图去重规则**：告警/通知/工作流/高级分析等存在**同名重复路由**（overview vs center vs advanced），纳入菜单外范围前须先决策以哪套为准。

---

## 六、阶段 06 总回归清单（阶段 07 验收项，本任务不执行）

| 类别 | 验收项 |
|------|--------|
| 菜单可见性 | 11 个一级菜单全部可见可达；17 个隐藏路由不可见但可直达；顺序/图标/名称与基线一致 |
| 权限 | 未登录访问全部受保护路由 → 跳登录；admin 全量；safety_manager 仅组织管理可见只读、条款关联严格 admin（阶段05 修复项不回归） |
| 主流程 | 各页面 CRUD / 导入（下载模板→上传→预览→确认→结果）/ 导出闭环 |
| 服务端排序 | 可比较字段三态排序（升→降→取消），只排序服务端数据 |
| 双列移动端 | HseSplitPane 页面移动端转 NDrawer、无横向溢出、键盘操作 |
| 亮暗主题 | 全页面亮/暗一致（HSE 语义色） |
| 控制台 | 无应用级 error/warn/pageerror（原始日志分类） |
| 构建 | typecheck / production build / ant-design-vue 0 命中 / modules 无新增 ignoreAccess |

---

> 本清单为阶段 06 唯一范围依据（修复版）；阶段 04/05 已验收页面仅纳入回归，不重做。**等待 Codex 审核，未开始 06B。**
