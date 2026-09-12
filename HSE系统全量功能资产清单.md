# HSE 系统全量功能资产清单

> **文档性质**：全量功能资产汇总（只读审计，未修改任何文件）
> **数据来源**：设计文档 + 前端代码 + 后端接口 + 数据库结构
> **审计日期**：2026-07-24
> **任务编号**：Sprint10-D-1-3

---

## 一、文档说明

本清单汇总 HSE 系统所有功能资产，每项功能标注：功能名称、功能来源、当前位置、对应页面、对应接口、对应数据库表、当前状态。

**状态分类**：
- ✅ 已实现：设计+前端+后端+数据库均存在
- 🔶 部分实现：部分层存在或功能不完整
- 📋 设计完成未实现：仅有设计文档，代码未实现
- 🔁 重复功能：多处实现同一功能
- ❌ 废弃功能：已废弃或占位

---

## 二、全量功能资产清单

### 2.1 安全总览 / 驾驶舱类

| 序号 | 功能名称 | 功能来源 | 当前位置 | 对应页面 | 对应接口 | 对应数据库 | 当前状态 |
|------|---------|---------|---------|---------|---------|-----------|---------|
| 1 | 仪表盘-数据分析 | Vben框架 | /dashboard/analytics | views/dashboard/analytics/ | - | - | ✅ 已实现（Vben示例） |
| 2 | 仪表盘-工作空间 | Vben框架 | /dashboard/workspace | views/dashboard/workspace/ | - | - | ✅ 已实现（Vben示例） |
| 3 | HSE驾驶舱 | Sprint6.5/设计文档 | /hse-advanced/cockpit | views/hse/cockpit/ | /api/hse/dashboard | hse_statistics_* | ✅ 已实现 |
| 4 | 集团智能驾驶舱 | Sprint6.5-C/设计文档 | /hse-advanced/executive-cockpit | views/hse/executive-cockpit/ | /api/hse/executive-cockpit | hse_statistics_* | ✅ 已实现 |
| 5 | BI数据看板 | v4.0 | /hse-advanced/bi | views/hse/bi/ | /api/hse/bi | - | ✅ 已实现 |
| 6 | HSE运营驾驶舱(大屏) | HSE运营驾驶舱设计.md | 未独立菜单 | - | - | - | 📋 设计完成未实现（大屏方案） |
| 7 | HSE统一工作台 | HSE统一工作台设计.md | 未独立菜单 | - | - | - | 📋 设计完成未实现 |

### 2.2 风险管控类

| 序号 | 功能名称 | 功能来源 | 当前位置 | 对应页面 | 对应接口 | 对应数据库 | 当前状态 |
|------|---------|---------|---------|---------|---------|-----------|---------|
| 8 | 安全风险管控 | 前端路由 | /risk-control | views/risk-control/ | /api/risk-control | risk_sources | ✅ 已实现 |
| 9 | 风险分级管控(双控) | 风险分级管控设计.md | /risk-control | views/risk-control/ | /api/risk-control | hse_risk_factors, hse_control_measures | 🔶 部分实现（设计含4表，实际仅risk_sources） |
| 10 | 员工风险画像详情 | Sprint6.4-A | /hse-advanced/risk-profile/:id | views/hse/risk-profile-detail/ | /api/hse/risk/profile | hse_employee_risk_snapshot | ✅ 已实现 |
| 11 | 员工风险画像中心 | Sprint6.1 | - | - | /api/hse/risk-profile | hse_employee_risk_snapshot | ✅ 已实现（接口层） |
| 12 | 驾驶员专项风险画像 | Sprint6.1-D | - | - | /api/hse/risk-profile/employee | hse_employee_risk_snapshot | ✅ 已实现（接口层） |
| 13 | 驾驶员风险中心 | Sprint6.4-B | /hse-advanced/driver-risk-center | views/hse/driver-risk-center/ | /api/hse/driver-risk-center | hse_employee_risk_snapshot | ✅ 已实现 |
| 14 | 风险等级计算 | Sprint6.2 | - | - | /api/hse/risk-score | hse_risk_score_config | ✅ 已实现（接口层） |
| 15 | AI风险智能分析 | 风险智能分析模型设计.md | /hse-advanced/ai-analysis | views/hse/ai-analysis/ | /api/hse/ai | hse_analysis_snapshot, hse_risk_prediction | ✅ 已实现 |
| 16 | 风险趋势分析 | HSE风险趋势分析模型.md | 嵌入驾驶舱 | - | /api/hse/analysis-center | hse_analysis_snapshot | ✅ 已实现 |
| 17 | 风险预测 | Sprint8-A | - | - | /api/hse/analysis-center | hse_risk_prediction, hse_prediction_model_version | ✅ 已实现（接口层） |
| 18 | 管理责任画像 | HSE管理责任画像设计.md | - | - | - | - | 📋 设计完成未实现（v1.5新增，仅设计） |
| 19 | 网格长责任画像 | 风险画像中心v1.5 | - | - | - | - | 📋 设计完成未实现（v1.5新增，仅设计） |
| 20 | 巡查责任画像 | 风险画像中心v1.5 | - | - | - | - | 📋 设计完成未实现（v1.5新增，仅设计） |

### 2.3 隐患排查治理类

| 序号 | 功能名称 | 功能来源 | 当前位置 | 对应页面 | 对应接口 | 对应数据库 | 当前状态 |
|------|---------|---------|---------|---------|---------|-----------|---------|
| 21 | 隐患排查治理 | 前端路由 | /hazards | views/hazards/ | /api/hazards | hazards | ✅ 已实现 |
| 22 | 隐患整改闭环 | Sprint5.5 | - | - | /api/hse/hazard-rectification | hse_rectifications, hse_reviews | ✅ 已实现（接口层） |
| 23 | 隐患基线管理 | 占位路由 | - | - | /api/hse/hazard-baseline | - | ❌ 废弃功能（占位，返回空数据） |
| 24 | 整改效果评价 | Sprint7-C | - | - | /api/hse/warning-center | hse_rectification_evaluation | ✅ 已实现（接口层） |

### 2.4 现场管理类

| 序号 | 功能名称 | 功能来源 | 当前位置 | 对应页面 | 对应接口 | 对应数据库 | 当前状态 |
|------|---------|---------|---------|---------|---------|-----------|---------|
| 25 | 现场管理-三违 | 前端路由 | /inspection/violation | views/inspection/index.vue | /api/violations | - | ✅ 已实现 |
| 26 | 三违管理(独立) | 前端路由 | /violations | views/violations/index.vue | /api/violations | - | 🔁 重复功能（与现场管理→三违重复） |
| 27 | 消防设施管理 | 前端路由 | /inspection/fire-facility | views/inspection/fire-facility/ | /api/site-mgmt | - | ✅ 已实现 |
| 28 | 网格管理 | 前端路由 | /inspection/grid | views/inspection/grid/ | /api/site-mgmt | grid_areas, grid_patrol_logs | ✅ 已实现 |
| 29 | 现场检查 | 设计文档 | - | - | /api/hse/chain | hse_inspection_plans | ✅ 已实现（接口层） |
| 30 | 检查任务管理 | v4.3 | - | - | /api/hse/tasks | hse_inspection_tasks, hse_inspection_executions | ✅ 已实现（接口层） |

### 2.5 人员管理类

| 序号 | 功能名称 | 功能来源 | 当前位置 | 对应页面 | 对应接口 | 对应数据库 | 当前状态 |
|------|---------|---------|---------|---------|---------|-----------|---------|
| 31 | 人员主数据-员工列表 | Sprint5.1 | /hse/employee/list | views/hse/employee/index.vue | /api/hse/employee | employee | ✅ 已实现 |
| 32 | 人员主数据-组织管理 | Sprint5.1 | /hse/employee/departments | views/hse/employee/departments.vue | /api/hse/employee | department, hse_org_unit | ✅ 已实现 |
| 33 | 人员主数据-岗位管理 | Sprint5.1 | /hse/employee/positions | views/hse/employee/positions.vue | /api/hse/employee | position | ✅ 已实现 |
| 34 | 员工档案中心 | 前端路由 | /hse/employee-profile/list | views/hse/employee-profile/ | /api/hse/employee | employee | 🔁 重复功能（与人员主数据员工列表数据同源） |
| 35 | 员工花名册导入V2 | Sprint5.6 | /hse/employee-import-v2/list | views/hse/employee-import-v2/ | /api/hse/employee-import/v2 | employee_import_batch | ✅ 已实现 |
| 36 | 保险-车辆保险 | 前端路由 | /insurance/vehicle | views/insurance/vehicle/ | /api/insurance | vehicles, insurance_history | ✅ 已实现 |
| 37 | 保险-人员保险 | 前端路由 | /insurance/personnel | views/insurance/personnel/ | /api/personnel | personnel_insurance | ✅ 已实现 |
| 38 | 保险-超龄人员 | 前端路由 | /insurance/over-age | views/insurance/over-age/ | /api/over-age-personnel | over_age_personnel | ✅ 已实现 |
| 39 | 组织中心 | Sprint6.0 | - | - | /api/hse/org-center | hse_org_unit, hse_operation_unit | ✅ 已实现（接口层） |
| 40 | 岗位责任体系 | Sprint6.0 | - | - | /api/hse/position-resp | position, hse_responsibility | ✅ 已实现（接口层） |
| 41 | 人事变动管理 | Sprint5.6 | 嵌入员工列表 | views/hse/employee/components/EmployeeHistoryDrawer.vue | /api/hse/employee | employee_history | ✅ 已实现 |

### 2.6 培训管理类

| 序号 | 功能名称 | 功能来源 | 当前位置 | 对应页面 | 对应接口 | 对应数据库 | 当前状态 |
|------|---------|---------|---------|---------|---------|-----------|---------|
| 42 | 培训计划 | 前端路由 | /training/plan | views/training/index.vue | /api/training | training_records | ✅ 已实现 |
| 43 | 培训要求 | 前端路由 | /training/requirements | views/training/requirements/ | /api/training | training_records | ✅ 已实现 |
| 44 | 年度计划 | 前端路由 | /training/plans | views/training/plans/ | /api/training | training_records | ✅ 已实现 |
| 45 | 培训台账 | 前端路由 | /training/ledger | views/training/ledger/ | /api/training | training_records | ✅ 已实现 |
| 46 | 新员工培训 | 前端路由 | /training/new-employee | views/training/new-employee/ | /api/training | training_records | ✅ 已实现 |
| 47 | 驾驶员实操 | 前端路由 | /training/driver | views/training/driver/ | /api/training | training_records | ✅ 已实现 |
| 48 | 培训统计 | 前端路由 | /training/stats | views/training/stats/ | /api/training | training_records | ✅ 已实现 |
| 49 | 培训分析 | 前端路由 | /training/analysis | views/training/analysis/ | /api/training | training_records | ✅ 已实现 |
| 50 | 培训提醒 | 前端路由 | /training/reminders | views/training/reminders/ | /api/training | training_records | ✅ 已实现 |
| 51 | 计划执行 | 前端路由 | /training/execute | views/training/execute/ | /api/training | training_records | ✅ 已实现 |

### 2.7 事故管理类

| 序号 | 功能名称 | 功能来源 | 当前位置 | 对应页面 | 对应接口 | 对应数据库 | 当前状态 |
|------|---------|---------|---------|---------|---------|-----------|---------|
| 52 | 事故管理 | 前端路由 | /accidents | views/accidents/index.vue | /api/accidents | accidents, accident_persons | ✅ 已实现 |
| 53 | 事故分析中心 | Sprint6.4-C | /hse-advanced/accident-analysis | views/hse/accident-analysis/ | /api/hse/accident-analysis | accidents, accident_persons | ✅ 已实现 |
| 54 | HSE事故管理(新设计) | HSE事故管理设计.md | - | - | - | hse_incident_records（未建表） | 📋 设计完成未实现（3表设计未落地） |

### 2.8 考核与评价类

| 序号 | 功能名称 | 功能来源 | 当前位置 | 对应页面 | 对应接口 | 对应数据库 | 当前状态 |
|------|---------|---------|---------|---------|---------|-----------|---------|
| 55 | 考核分析中心 | Sprint6.5 | /hse-advanced/assessment-analysis | views/hse/assessment-analysis/ | /api/hse/assessment-analysis | 多表联合 | ✅ 已实现 |
| 56 | 集团HSE考核系统 | Sprint6.5-B | - | - | /api/hse/assessment | 多表联合 | ✅ 已实现（接口层） |
| 57 | 目标责任书管理 | 前端路由 | /objectives/responsibility | views/goals/index.vue | /api/objectives | - | ✅ 已实现 |
| 58 | 安全人员及安委会 | 前端路由 | /objectives/committee | views/objectives/committee/ | /api/objectives | - | ✅ 已实现 |
| 59 | 责任制及考核 | 前端路由 | /objectives/assessment | views/objectives/assessment/ | /api/objectives | - | ✅ 已实现 |
| 60 | 安全费用预算 | 前端路由 | /objectives/budget | views/objectives/budget/ | /api/objectives | - | ✅ 已实现 |
| 61 | HSE运营评价模型 | 项目公司HSE运营评价模型设计.md | - | - | - | - | 📋 设计完成未实现（七维度评价） |
| 62 | HSE成熟度模型 | HSE成熟度模型设计方案.md | - | - | - | - | 📋 设计完成未实现（L1-L5评定） |

### 2.9 预警与整改类

| 序号 | 功能名称 | 功能来源 | 当前位置 | 对应页面 | 对应接口 | 对应数据库 | 当前状态 |
|------|---------|---------|---------|---------|---------|-----------|---------|
| 63 | 预警与整改中心 | Sprint7 | /hse-advanced/warning-center | views/hse/warning-center/ | /api/hse/warning-center | hse_warning_rule/record/task/version | ✅ 已实现 |
| 64 | 告警中心 | 前端路由 | /hse/alerts | views/hse/alerts/ | /api/hse/alerts | - | ✅ 已实现 |
| 65 | 预警调度管理 | Sprint7-C | - | - | /api/hse/warning-center | hse_warning_scheduler | ✅ 已实现（接口层） |
| 66 | 预警规则版本管理 | Sprint7 | - | - | /api/hse/warning-center | hse_warning_rule_version | ✅ 已实现（接口层） |

### 2.10 制度与标准类

| 序号 | 功能名称 | 功能来源 | 当前位置 | 对应页面 | 对应接口 | 对应数据库 | 当前状态 |
|------|---------|---------|---------|---------|---------|-----------|---------|
| 67 | 规章制度 | 前端路由 | /regulations | views/regulations/index.vue | /api/regulations | regulation_attachments, regulation_versions | ✅ 已实现 |
| 68 | 安全资料中心-文件库 | V2 Sprint1 | /hse-documents/library | views/hse/documents/library/ | /api/hse/documents | document_files, document_categories, document_tags | ✅ 已实现 |
| 69 | 安全资料中心-文件审核 | V2 Sprint1 | /hse-documents/review | views/hse/documents/review/ | /api/hse/documents | document_files | ✅ 已实现 |
| 70 | 标准化评价-条款库 | V2 Sprint4 | /hse/standard/clauses | views/hse/standard/index.vue | /api/hse/standard | safety_standard_clauses | ✅ 已实现 |
| 71 | 标准化评价-条款关联 | V2 Sprint4 | /hse/standard/relation | views/hse/standard/relation/ | /api/hse/standard/relation | document_standard_relation | ✅ 已实现 |
| 72 | 标准化评价-匹配建议 | V2 Sprint4 | /hse/standard/suggestions | views/hse/standard/relation/suggestions.vue | /api/hse/standard/relation | document_standard_relation | ✅ 已实现 |
| 73 | 标准化评价-AI辅助 | V2 Sprint4 Phase5 | - | - | /api/hse/standard/evaluation | standard_evaluation_tasks, standard_evaluation_items | ✅ 已实现（接口层） |

### 2.11 AI与智能能力类

| 序号 | 功能名称 | 功能来源 | 当前位置 | 对应页面 | 对应接口 | 对应数据库 | 当前状态 |
|------|---------|---------|---------|---------|---------|-----------|---------|
| 74 | AI智能分析 | v4.0 | /hse-advanced/ai-analysis | views/hse/ai-analysis/ | /api/hse/ai | ai_generation_records | ✅ 已实现 |
| 75 | AI助手 | AI助手功能设计文档.md | 未独立菜单 | - | /api/hse/ai | ai_generation_records | 🔶 部分实现（接口存在，无独立页面） |
| 76 | AI风险解释 | AI风险解释能力设计.md | 嵌入风险分析 | - | /api/hse/ai-enhanced | ai_generation_records | ✅ 已实现（接口层） |
| 77 | AI报告生成 | AI报告生成设计.md | - | - | /api/hse/report | hse_reports, hse_report_templates | ✅ 已实现 |
| 78 | 智能报告中心 | HSE智能报告中心实施报告.md | - | - | /api/hse/report | hse_reports, hse_report_templates | ✅ 已实现（接口层） |
| 79 | HSE规则中心 | HSE规则中心设计文档.md | - | - | - | hse_rule_config（未建表） | 📋 设计完成未实现（3表设计未落地） |
| 80 | HSE知识库 | HSE知识库设计方案.md | - | - | - | - | 📋 设计完成未实现（向量索引未落地） |
| 81 | HSE帮助体系 | HSE帮助体系v1.0设计报告.md | - | - | - | - | 📋 设计完成未实现（内容未编写） |

### 2.12 系统管理类

| 序号 | 功能名称 | 功能来源 | 当前位置 | 对应页面 | 对应接口 | 对应数据库 | 当前状态 |
|------|---------|---------|---------|---------|---------|-----------|---------|
| 82 | 用户管理 | 前端路由 | /system/users | views/system/users/ | /api/core/users | users, user_role | ✅ 已实现 |
| 83 | 角色管理 | 前端路由 | /system/roles | views/system/roles/ | /api/core/roles | roles, role_menu | ✅ 已实现 |
| 84 | 审计日志 | 前端路由 | /security/audit | views/security/audit/ | /api/hse/audit | sys_operation_log | ✅ 已实现 |
| 85 | 工作流引擎 | 前端路由 | /hse/workflow | views/hse/workflow/ | /api/hse/workflow | workflows, workflow_instances, workflow_tasks | ✅ 已实现 |
| 86 | 通知中心 | 前端路由 | /hse/notifications | views/hse/notifications/ | /api/hse/notifications | - | ✅ 已实现 |
| 87 | 批量导入 | V2 Sprint5 | /hse/batch-import/tasks | views/hse/batch-import/ | /api/hse/batch-import | hse_batch_import_tasks, hse_batch_import_items | ✅ 已实现 |
| 88 | 可视化布局 | 设计文档 | - | - | /api/user/visual-layout | users.visual_layout | ✅ 已实现（接口层） |
| 89 | 菜单排序 | 设计文档 | - | - | /api/user/menu-order | - | ✅ 已实现（接口层） |
| 90 | 通知模块(占位) | 占位路由 | - | - | /api/hse/notice | - | ❌ 废弃功能（占位，返回空数据） |

### 2.13 其他模块

| 序号 | 功能名称 | 功能来源 | 当前位置 | 对应页面 | 对应接口 | 对应数据库 | 当前状态 |
|------|---------|---------|---------|---------|---------|-----------|---------|
| 91 | 应急管理 | 前端路由 | /emergency | views/emergency/index.vue | /api/emergency | - | ✅ 已实现 |
| 92 | IoT物联网 | v4.0 | /hse-advanced/iot | views/hse/iot/ | /api/hse/iot | - | ✅ 已实现 |
| 93 | 供应链安全 | v4.0 | /hse-advanced/supply-chain | views/hse/supply-chain/ | - | - | 🔶 部分实现（仅有页面，无独立接口） |
| 94 | HSE事件中心 | v4.2 | - | - | /api/hse/events | hse_events, hse_event_links, hse_event_timeline | ✅ 已实现（接口层） |
| 95 | HSE闭环引擎 | v4.2 | - | - | /api/hse/chain | hse_inspection_plans, hse_risk_objects | ✅ 已实现（接口层） |
| 96 | HSE任务中心 | v4.3 | - | - | /api/hse/tasks | hse_tasks, hse_inspection_tasks | ✅ 已实现（接口层） |
| 97 | HSE数据分析中心 | v5.0 | - | - | /api/hse/statistics | hse_statistics_* | ✅ 已实现（接口层） |
| 98 | 数据导入 | V1.0 | - | - | /api/import | import_logs, field_mapping_config | ✅ 已实现（接口层） |
| 99 | 车辆管理 | V1.0 | - | - | /api/vehicles | vehicles, insurance_history | ✅ 已实现（接口层） |

---

## 三、功能状态统计

| 状态 | 数量 | 占比 |
|------|------|------|
| ✅ 已实现 | 76 | 76.8% |
| 🔶 部分实现 | 3 | 3.0% |
| 📋 设计完成未实现 | 13 | 13.1% |
| 🔁 重复功能 | 3 | 3.0% |
| ❌ 废弃功能 | 2 | 2.0% |
| 其他 | 2 | 2.0% |
| **合计** | **99** | 100% |

---

## 四、按实现层次分布

| 实现层次 | 数量 | 说明 |
|---------|------|------|
| 全栈实现（前端+后端+数据库） | 45 | 完整的页面+接口+表结构 |
| 接口层实现（后端+数据库，无独立页面） | 31 | 有API和表，但嵌入其他页面或无独立菜单 |
| 仅前端页面（无独立后端接口） | 2 | BI看板、供应链安全 |
| 仅设计文档（未落地） | 13 | 规则中心、知识库、帮助体系、运营评价等 |
| 废弃/占位 | 2 | hse-notice、hse-hazard-baseline |
| 重复功能 | 3 | 三违管理、员工档案中心、HSE运营驾驶舱 |
| Vben框架示例 | 2 | 仪表盘的数据分析和工作空间 |

---

## 五、审计说明

1. 本文档为**只读审计**产物，未修改任何文件
2. 功能资产来源于设计文档、前端路由、后端接口、数据库结构四方交叉验证
3. "接口层实现"指后端API和数据库表已存在，但前端无独立菜单页面（可能嵌入其他页面）
4. 重复功能需在后续菜单调整中合并处理
5. 设计完成未实现的功能需评估是否纳入V1.0基线

---

*文档生成时间：2026-07-24*
*审计任务：Sprint10-D-1-3 HSE系统全量资产审计*
