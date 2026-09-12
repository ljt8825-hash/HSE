# 项目公司 HSE 系统 V1.0 功能基线

> **文档性质**：系统功能基线（最终冻结版）
> **依据**：全量资产审计 + 设计与实现差异分析 + 业务模块重新归属
> **审计日期**：2026-07-24
> **任务编号**：Sprint10-D-1-3
> **适用范围**：后续左侧菜单调整、模块完善、接口联调、数据导入、系统正式运行的**唯一依据**

---

## 一、基线总则

### 1.1 基线定位

本文件是项目公司HSE智能运营管理系统V1.0的**功能基线冻结文档**。后续所有开发工作（菜单调整、模块完善、接口联调、数据导入、系统运行）均以本文件为唯一依据。

### 1.2 基线原则

1. **双控突出**：风险管控和隐患治理作为独立一级模块，体现双重预防机制
2. **业务闭环**：功能按业务闭环组织，不按技术分层
3. **取消"三检管理"概念**：避免与驾驶员"三检表"混淆，检查功能归入现场管理
4. **操作降级**：导入/导出等操作功能降为模块内按钮，不独立成菜单
5. **技术隐藏**：工作流引擎、AI等技术能力嵌入业务模块，不独立成菜单
6. **数据库冻结**：PostgreSQL 15，禁止修改 employee/employee_assignment/hse_responsibility 表

### 1.3 基线统计

| 维度 | 数量 |
|------|------|
| 一级业务模块 | 10 个 |
| 功能总数 | 60 项 |
| 已实现功能 | 50 项 |
| 部分实现功能 | 4 项 |
| 设计完成待实现 | 6 项 |
| 数据库表 | 82 张 |
| 后端接口 | ~530 个 |
| 前端页面 | 110+ 个 |

---

## 二、最终业务模块（10个一级模块）

| 序号 | 模块名称 | 模块定位 | 功能数 | 核心数据表 |
|------|---------|---------|-------|-----------|
| 1 | 安全总览 | 安全态势感知、驾驶舱、预警监控 | 7 | hse_statistics_*, hse_reports |
| 2 | 风险管控 | 双控体系之一，风险全生命周期管理 | 9 | hse_employee_risk_snapshot, risk_sources |
| 3 | 隐患治理 | 双控体系之二，隐患排查整改闭环 | 4 | hazards, hse_rectifications, hse_warning_* |
| 4 | 现场管理 | 现场业务管理（三违/网格/消防/车辆） | 6 | grid_areas, vehicles, violations |
| 5 | 人员管理 | 人员主数据全生命周期 | 8 | employee, department, position, personnel_insurance |
| 6 | 培训考核 | 培训管理+考核分析 | 9 | training_records, training_roster |
| 7 | 应急管理 | 应急预案与演练 | 1 | emergency相关 |
| 8 | 目标职责 | 目标责任与安委会管理 | 3 | objectives相关 |
| 9 | 制度标准 | 规章制度+安全资料+标准化评价 | 6 | document_files, safety_standard_clauses, regulation_* |
| 10 | 系统管理 | 系统配置与运维 | 5 | users, roles, menus, sys_operation_log |
| | **合计** | | **60** | |

---

## 三、最终功能列表

### 3.1 安全总览（7项功能）

| 序号 | 功能名称 | 功能来源 | 功能状态 | 对应页面 | 对应接口 | 对应数据库 |
|------|---------|---------|---------|---------|---------|-----------|
| 1.1 | HSE安全驾驶舱 | Sprint6.5/前端路由 | ✅ 已实现 | views/hse/cockpit/ | /api/hse/dashboard | hse_statistics_daily/monthly/yearly |
| 1.2 | 集团智能驾驶舱 | Sprint6.5-C | ✅ 已实现 | views/hse/executive-cockpit/ | /api/hse/executive-cockpit | hse_statistics_* |
| 1.3 | BI数据看板 | v4.0 | 🔶 部分实现 | views/hse/bi/ | /api/hse/bi | - |
| 1.4 | 告警中心 | 前端路由 | ✅ 已实现 | views/hse/alerts/ | /api/hse/alerts | - |
| 1.5 | 通知中心 | 前端路由 | ✅ 已实现 | views/hse/notifications/ | /api/hse/notifications | - |
| 1.6 | HSE数据分析中心 | v5.0 | ✅ 已实现（接口层） | 嵌入驾驶舱 | /api/hse/statistics | hse_statistics_* |
| 1.7 | 智能报告中心 | v5.2 | ✅ 已实现（接口层） | 嵌入驾驶舱 | /api/hse/report | hse_reports, hse_report_templates |

---

### 3.2 风险管控（9项功能）

| 序号 | 功能名称 | 功能来源 | 功能状态 | 对应页面 | 对应接口 | 对应数据库 |
|------|---------|---------|---------|---------|---------|-----------|
| 2.1 | 风险分级管控 | 风险分级管控设计.md | 🔶 部分实现 | views/risk-control/ | /api/risk-control | risk_sources |
| 2.2 | 事故管理 | 前端路由 | ✅ 已实现 | views/accidents/ | /api/accidents | accidents, accident_persons |
| 2.3 | 事故分析中心 | Sprint6.4-C | ✅ 已实现 | views/hse/accident-analysis/ | /api/hse/accident-analysis | accidents, accident_persons |
| 2.4 | 驾驶员风险中心 | Sprint6.4-B | ✅ 已实现 | views/hse/driver-risk-center/ | /api/hse/driver-risk-center | hse_employee_risk_snapshot |
| 2.5 | 员工风险画像 | Sprint6.1/6.4-A | ✅ 已实现 | views/hse/risk-profile-detail/ | /api/hse/risk-profile, /api/hse/risk/profile | hse_employee_risk_snapshot |
| 2.6 | 风险等级计算 | Sprint6.2 | ✅ 已实现（接口层） | 嵌入风险画像 | /api/hse/risk-score | hse_risk_score_config |
| 2.7 | AI风险智能分析 | 风险智能分析模型设计.md | ✅ 已实现 | views/hse/ai-analysis/ | /api/hse/ai | hse_analysis_snapshot, hse_risk_prediction |
| 2.8 | 风险趋势与预测 | Sprint8-A | ✅ 已实现（接口层） | 嵌入驾驶舱/风险分析 | /api/hse/analysis-center | hse_analysis_snapshot, hse_risk_prediction |
| 2.9 | 管理责任画像 | HSE管理责任画像设计.md | 📋 设计完成待实现 | - | - | - |

---

### 3.3 隐患治理（4项功能）

| 序号 | 功能名称 | 功能来源 | 功能状态 | 对应页面 | 对应接口 | 对应数据库 |
|------|---------|---------|---------|---------|---------|-----------|
| 3.1 | 隐患排查治理 | 前端路由 | ✅ 已实现 | views/hazards/ | /api/hazards | hazards |
| 3.2 | 隐患整改闭环 | Sprint5.5 | ✅ 已实现（接口层） | 嵌入隐患管理 | /api/hse/hazard-rectification | hse_rectifications, hse_reviews |
| 3.3 | 预警与整改中心 | Sprint7 | ✅ 已实现 | views/hse/warning-center/ | /api/hse/warning-center | hse_warning_rule/record/task/version |
| 3.4 | 整改效果评价 | Sprint7-C | ✅ 已实现（接口层） | 嵌入预警中心 | /api/hse/warning-center | hse_rectification_evaluation |

---

### 3.4 现场管理（6项功能）

| 序号 | 功能名称 | 功能来源 | 功能状态 | 对应页面 | 对应接口 | 对应数据库 |
|------|---------|---------|---------|---------|---------|-----------|
| 4.1 | 三违管理 | 前端路由（合并） | ✅ 已实现 | views/inspection/index.vue | /api/violations | violations |
| 4.2 | 网格管理 | 前端路由 | ✅ 已实现 | views/inspection/grid/ | /api/site-mgmt | grid_areas, grid_patrol_logs |
| 4.3 | 消防设施管理 | 前端路由 | ✅ 已实现 | views/inspection/fire-facility/ | /api/site-mgmt | - |
| 4.4 | 车辆保险管理 | 前端路由（迁移） | ✅ 已实现 | views/insurance/vehicle/ | /api/insurance | vehicles, insurance_history |
| 4.5 | 现场检查任务 | v4.2/v4.3 | ✅ 已实现（接口层） | 嵌入现场管理 | /api/hse/chain, /api/hse/tasks | hse_inspection_plans, hse_inspection_tasks |
| 4.6 | IoT物联网 | v4.0 | 🔶 部分实现 | views/hse/iot/ | /api/hse/iot | - |

---

### 3.5 人员管理（8项功能）

| 序号 | 功能名称 | 功能来源 | 功能状态 | 对应页面 | 对应接口 | 对应数据库 |
|------|---------|---------|---------|---------|---------|-----------|
| 5.1 | 员工列表 | Sprint5.1 | ✅ 已实现 | views/hse/employee/index.vue | /api/hse/employee | employee |
| 5.2 | 员工档案 | 前端路由（合并） | ✅ 已实现 | views/hse/employee-profile/ | /api/hse/employee | employee |
| 5.3 | 组织管理 | Sprint5.1/6.0 | ✅ 已实现 | views/hse/employee/departments.vue | /api/hse/employee, /api/hse/org-center | department, hse_org_unit, hse_operation_unit |
| 5.4 | 岗位管理 | Sprint5.1/6.0 | ✅ 已实现 | views/hse/employee/positions.vue | /api/hse/employee, /api/hse/position-resp | position, hse_responsibility |
| 5.5 | 花名册导入 | Sprint5.6 | ✅ 已实现（降为按钮） | views/hse/employee-import-v2/ | /api/hse/employee-import/v2 | employee_import_batch |
| 5.6 | 人员保险管理 | 前端路由（迁移） | ✅ 已实现 | views/insurance/personnel/ | /api/personnel | personnel_insurance |
| 5.7 | 超龄人员管理 | 前端路由（迁移） | ✅ 已实现 | views/insurance/over-age/ | /api/over-age-personnel | over_age_personnel |
| 5.8 | 人事变动管理 | Sprint5.6 | ✅ 已实现 | 嵌入员工列表 | /api/hse/employee | employee_history |

---

### 3.6 培训考核（9项功能）

| 序号 | 功能名称 | 功能来源 | 功能状态 | 对应页面 | 对应接口 | 对应数据库 |
|------|---------|---------|---------|---------|---------|-----------|
| 6.1 | 培训计划 | 前端路由 | ✅ 已实现 | views/training/index.vue | /api/training | training_records |
| 6.2 | 培训要求 | 前端路由 | ✅ 已实现 | views/training/requirements/ | /api/training | training_records |
| 6.3 | 培训台账 | 前端路由 | ✅ 已实现 | views/training/ledger/ | /api/training | training_records |
| 6.4 | 新员工培训 | 前端路由 | ✅ 已实现 | views/training/new-employee/ | /api/training | training_records |
| 6.5 | 驾驶员实操 | 前端路由 | ✅ 已实现 | views/training/driver/ | /api/training | training_records |
| 6.6 | 培训统计与分析 | 前端路由 | ✅ 已实现 | views/training/stats/, analysis/ | /api/training | training_records |
| 6.7 | 考核分析中心 | Sprint6.5 | ✅ 已实现 | views/hse/assessment-analysis/ | /api/hse/assessment-analysis | 多表联合 |
| 6.8 | 集团HSE考核系统 | Sprint6.5-B | ✅ 已实现（接口层） | 嵌入考核分析 | /api/hse/assessment | 多表联合 |
| 6.9 | 责任制及考核 | 前端路由（迁移） | ✅ 已实现 | views/objectives/assessment/ | /api/objectives | - |

---

### 3.7 应急管理（1项功能）

| 序号 | 功能名称 | 功能来源 | 功能状态 | 对应页面 | 对应接口 | 对应数据库 |
|------|---------|---------|---------|---------|---------|-----------|
| 7.1 | 应急管理 | 前端路由 | ✅ 已实现 | views/emergency/index.vue | /api/emergency | emergency相关 |

---

### 3.8 目标职责（3项功能）

| 序号 | 功能名称 | 功能来源 | 功能状态 | 对应页面 | 对应接口 | 对应数据库 |
|------|---------|---------|---------|---------|---------|-----------|
| 8.1 | 目标责任书管理 | 前端路由 | ✅ 已实现 | views/goals/index.vue | /api/objectives | - |
| 8.2 | 安全人员及安委会 | 前端路由 | ✅ 已实现 | views/objectives/committee/ | /api/objectives | - |
| 8.3 | 安全费用预算 | 前端路由 | ✅ 已实现 | views/objectives/budget/ | /api/objectives | - |

---

### 3.9 制度标准（6项功能）

| 序号 | 功能名称 | 功能来源 | 功能状态 | 对应页面 | 对应接口 | 对应数据库 |
|------|---------|---------|---------|---------|---------|-----------|
| 9.1 | 规章制度 | 前端路由 | ✅ 已实现 | views/regulations/index.vue | /api/regulations | regulation_attachments, regulation_versions |
| 9.2 | 安全资料中心-文件库 | V2 Sprint1 | ✅ 已实现 | views/hse/documents/library/ | /api/hse/documents | document_files, document_categories, document_tags |
| 9.3 | 安全资料中心-文件审核 | V2 Sprint1 | ✅ 已实现 | views/hse/documents/review/ | /api/hse/documents | document_files |
| 9.4 | 标准条款库 | V2 Sprint4 | ✅ 已实现 | views/hse/standard/index.vue | /api/hse/standard | safety_standard_clauses |
| 9.5 | 条款资料关联 | V2 Sprint4 | ✅ 已实现 | views/hse/standard/relation/ | /api/hse/standard/relation | document_standard_relation |
| 9.6 | 标准化评价-AI辅助 | V2 Sprint4 Phase5 | ✅ 已实现（接口层） | 嵌入标准化评价 | /api/hse/standard/evaluation | standard_evaluation_tasks, standard_evaluation_items |

---

### 3.10 系统管理（5项功能）

| 序号 | 功能名称 | 功能来源 | 功能状态 | 对应页面 | 对应接口 | 对应数据库 |
|------|---------|---------|---------|---------|---------|-----------|
| 10.1 | 用户管理 | 前端路由 | ✅ 已实现 | views/system/users/ | /api/core/users | users, user_role |
| 10.2 | 角色管理 | 前端路由 | ✅ 已实现 | views/system/roles/ | /api/core/roles | roles, role_menu |
| 10.3 | 审计日志 | 前端路由 | ✅ 已实现 | views/security/audit/ | /api/hse/audit | sys_operation_log |
| 10.4 | 工作流引擎 | 前端路由（可隐藏） | ✅ 已实现 | views/hse/workflow/ | /api/hse/workflow | workflows, workflow_instances, workflow_tasks |
| 10.5 | 批量导入 | V2 Sprint5（降为按钮） | ✅ 已实现 | views/hse/batch-import/ | /api/hse/batch-import | hse_batch_import_tasks, hse_batch_import_items |

---

### 3.11 底层支撑能力（不独立成菜单）

| 序号 | 功能名称 | 功能来源 | 功能状态 | 对应接口 | 对应数据库 | 说明 |
|------|---------|---------|---------|---------|-----------|------|
| 11.1 | HSE事件中心 | v4.2 | ✅ 已实现 | /api/hse/events | hse_events, hse_event_links | 统一安全事件流水 |
| 11.2 | HSE闭环引擎 | v4.2 | ✅ 已实现 | /api/hse/chain | hse_inspection_plans | 标准化闭环 |
| 11.3 | HSE任务中心 | v4.3 | ✅ 已实现 | /api/hse/tasks | hse_tasks | 统一任务调度 |
| 11.4 | HSE数据分析中心 | v5.0 | ✅ 已实现 | /api/hse/statistics | hse_statistics_* | 安全数据统计 |
| 11.5 | 数据导入系统 | V1.0 | ✅ 已实现 | /api/import | import_logs, field_mapping_config | 批量数据导入 |
| 11.6 | 可视化布局 | 设计文档 | ✅ 已实现 | /api/user/visual-layout | users.visual_layout | 拖拽布局配置 |
| 11.7 | 菜单排序 | 设计文档 | ✅ 已实现 | /api/user/menu-order | - | 自定义菜单排序 |
| 11.8 | 认证系统 | V1.0 | ✅ 已实现 | /api/auth | users, token_blacklist | JWT认证 |
| 11.9 | RBAC权限 | V1.0 | ✅ 已实现 | /api/core/menus, /api/core/roles | roles, menus, role_menu, user_role | 角色权限控制 |

---

### 3.12 待评估功能（设计完成，V1.0暂不实现）

| 序号 | 功能名称 | 设计来源 | 状态 | 建议版本 |
|------|---------|---------|------|---------|
| 12.1 | HSE规则中心 | HSE规则中心设计文档.md | 📋 设计完成 | V2.0 |
| 12.2 | HSE知识库 | HSE知识库设计方案.md | 📋 设计完成 | V2.0 |
| 12.3 | HSE帮助体系 | HSE帮助体系v1.0设计报告.md | 📋 设计完成 | V1.5 |
| 12.4 | HSE运营评价模型 | 项目公司HSE运营评价模型设计.md | 📋 设计完成 | V2.0 |
| 12.5 | HSE成熟度模型 | HSE成熟度模型设计方案.md | 📋 设计完成 | V2.0 |
| 12.6 | HSE统一工作台 | HSE统一工作台设计.md | 📋 设计完成 | V2.0 |

---

## 四、功能状态统计

| 状态 | 数量 | 占比 | 说明 |
|------|------|------|------|
| ✅ 已实现 | 50 | 83.3% | 前端+后端+数据库完整或接口层完整 |
| 🔶 部分实现 | 4 | 6.7% | 功能不完整或仅有页面无接口 |
| 📋 设计完成待实现 | 6 | 10.0% | 仅有设计文档，V2.0实现 |
| **合计** | **60** | 100% | 不含底层支撑能力9项 |

---

## 五、数据库表与模块对应关系

| 业务模块 | 数据表数 | 核心表 |
|---------|---------|-------|
| 安全总览 | 7 | hse_statistics_daily/monthly/yearly/dept/person, hse_reports, hse_report_templates |
| 风险管控 | 5 | risk_sources, hse_employee_risk_snapshot, hse_risk_score_config, hse_analysis_snapshot, hse_risk_prediction |
| 隐患治理 | 8 | hazards, hse_rectifications, hse_reviews, hse_warning_rule/record/task/version/scheduler, hse_rectification_evaluation |
| 现场管理 | 4 | grid_areas, grid_patrol_logs, vehicles, insurance_history |
| 人员管理 | 10 | employee, department, position, hse_employee_org, employee_history, hse_org_unit, hse_operation_unit, personnel_insurance, over_age_personnel, personnel |
| 培训考核 | 2 | training_records, training_roster |
| 应急管理 | - | emergency相关（表结构待确认） |
| 目标职责 | - | objectives相关（内存CRUD） |
| 制度标准 | 10 | document_files/categories/tags/tag_relation/versions/standard_relation, safety_standard_clauses, standard_evaluation_tasks/items, regulation_attachments/versions |
| 系统管理 | 10 | users, token_blacklist, login_attempts, roles, menus, role_menu, user_role, sys_operation_log, workflows/instances/tasks/history |
| 底层支撑 | 8 | hse_events/links/timeline, hse_risk_factors, hse_control_measures, hse_inspection_plans, hse_tasks |
| AI辅助 | 1 | ai_generation_records |
| 数据导入 | 3 | file_records, import_logs, field_mapping_config |
| 预测模型 | 1 | hse_prediction_model_version |
| **合计** | **82** | |

---

## 六、硬约束（不可违反）

1. **绝不修改 Vben 核心目录**（packages/@core/、packages/effects/、packages/themes/）
2. **绝不创建新自定义组件**（仅使用现有 components/hse/ 内组件）
3. **绝不触碰登录相关代码**（auth middleware/routes/store/JWT/登录页面）
4. **绝不引入新依赖**（使用 Node.js 原生 ws 或现有 express 生态）
5. **禁止修改 employee、employee_assignment、hse_responsibility 表**
6. **禁止建立车辆绑定主表或新增固定车辆关系**
7. **驾驶员风险画像风险主体必须为 employee_id**
8. **禁止重新设计风险模型**
9. **禁止修改岗位权重**
10. **禁止修改考核模型v1.1、指标字典v1.1、预警规则v1.1**
11. **所有规则读取 hse_warning_rule_version 表**
12. **数据库已冻结为 PostgreSQL 15**
13. **不修改现有业务数据，评价数据为独立计算结果**
14. **Route meta.authority 必须为数组类型 string[]**
15. **所有 HSE 代码必须放在 src/api/hse/、src/views/hse/、src/components/hse/、src/store/hse/、src/router/routes/modules/hse.ts**
16. **主题风格全局统一，禁止对单个组件写覆盖样式**

---

## 七、后续工作指引

### 7.1 左侧菜单调整

按本基线"二、最终业务模块"的10个一级模块进行调整：
- 23个旧菜单 → 10个新菜单
- 参照《旧功能到新业务模块映射表》执行
- order 排序：安全总览→风险管控→隐患治理→现场管理→人员管理→培训考核→应急管理→目标职责→制度标准→系统管理

### 7.2 模块完善

- 风险分级管控：补建 hse_risk_controls、hse_risk_rules、hse_risk_inspections 表
- BI数据看板：明确数据边界或合并至驾驶舱
- IoT物联网：评估是否保留
- 管理责任画像：评估是否纳入V1.5

### 7.3 接口联调

- 双重人员表（personnel vs employee）需建立兼容视图
- 双重组织表（departments vs hse_org_unit）需建立兼容视图
- 占位路由（hse-notice、hse-hazard-baseline）需移除或实现

### 7.4 数据导入

- 员工花名册导入：通过 /api/hse/employee-import/v2
- 批量导入：通过 /api/hse/batch-import
- 各业务模块数据：通过 /api/import

### 7.5 系统正式运行

- 后端端口：5666（生产环境）
- 前端端口：5173（开发环境）
- 数据库：PostgreSQL 15
- WebSocket：ws://localhost:5666/ws
- 健康检查：http://localhost:5666/api/health

---

## 八、基线冻结声明

本文件自发布之日起冻结，作为项目公司HSE系统V1.0的**唯一功能基线**。

- 后续所有开发工作必须以本文件为依据
- 任何功能变更需经过基线变更评审
- 新增功能须明确标注来源和状态
- 废弃功能须标注废弃原因和替代方案

---

*文档生成时间：2026-07-24*
*审计任务：Sprint10-D-1-3 HSE系统全量资产审计*
*基线版本：V1.0（冻结版）*
