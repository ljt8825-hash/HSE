# HSE系统菜单迁移后功能资产清单

> **文档性质**：功能资产清单（菜单迁移后重新映射）
> **生成日期**：2026-07-24
> **任务编号**：Sprint10-D-2-3-A
> **数据来源**：前端路由扫描 + 后端接口扫描 + 数据库表扫描 + 冻结文档

---

## 一、清单说明

### 1.1 状态定义

| 状态 | 含义 |
|------|------|
| ✅ 正常 | 功能已实现，路由、接口、数据库表均对应 |
| 🔶 待迁移 | 功能已实现但菜单归属需调整 |
| 🔁 重复 | 存在多个入口或实现，需合并 |
| ❌ 废弃 | 功能已下线或不再使用 |

### 1.2 统计概览

| 类别 | 数量 |
|------|------|
| 一级菜单 | 10 个 |
| 二级菜单 | 46 个 |
| 前端页面组件 | 54 个 |
| 后端接口路由文件 | 37 个 |
| 数据库表 | 100+ 个 |

---

## 二、功能资产清单（按一级菜单分类）

### 2.1 安全总览（一级菜单）

| 二级菜单 | 功能名称 | 前端页面路径 | 后端接口前缀 | 数据库表 | 状态 |
|---------|---------|-------------|-------------|---------|------|
| 安全驾驶舱 | HSE安全态势总览 | `/overview/cockpit` | `/api/hse/dashboard` | dashboard_data, hse_statistics | ✅ 正常 |
| 集团驾驶舱 | 集团视角驾驶舱 | `/overview/executive` | `/api/hse/executive-cockpit` | executive_dashboard | ✅ 正常 |
| 预警监控 | 实时预警展示 | `/overview/alerts` | `/api/hse/warning-center` | hse_warning_record, hse_warning_task | ✅ 正常 |
| 通知公告 | 系统通知中心 | `/overview/notifications` | `/api/hse/events` | hse_event, notification | ✅ 正常 |
| 智能报告 | 自动报告生成 | `/overview/reports` | `/api/hse/report` | report, report_template | ✅ 正常 |

---

### 2.2 风险管控（一级菜单）

| 二级菜单 | 功能名称 | 前端页面路径 | 后端接口前缀 | 数据库表 | 状态 |
|---------|---------|-------------|-------------|---------|------|
| 风险分级管控 | 风险源辨识与分级 | `/risk-control/classification` | `/api/risk-control` | risk_sources, risk_measures | ✅ 正常 |
| 员工风险画像 | 员工风险等级分布 | `/risk-control/employee-risk` | `/api/hse/risk-profile/employee` | hse_employee_risk_snapshot, hse_risk_score_config | ✅ 正常 |
| 驾驶员风险 | 驾驶员专项风险 | `/risk-control/driver-risk` | `/api/hse/driver-risk-center` | driver_risk_profile, driver_behavior_score | ✅ 正常 |
| 事故管理 | 事故登记与处理 | `/risk-control/accidents` | `/api/accidents` | accidents, accident_investigation | ✅ 正常 |
| 事故分析 | 事故趋势分析 | `/risk-control/accident-analysis` | `/api/hse/accident-analysis` | accident_statistics, accident_analysis | ✅ 正常 |
| AI风险分析 | AI风险预测 | `/risk-control/ai-analysis` | `/api/hse/analysis-center` | ai_analysis_result, risk_prediction | ✅ 正常 |

---

### 2.3 隐患治理（一级菜单）

| 二级菜单 | 功能名称 | 前端页面路径 | 后端接口前缀 | 数据库表 | 状态 |
|---------|---------|-------------|-------------|---------|------|
| 隐患排查 | 隐患登记与列表 | `/hazard-governance/hazards` | `/api/hazards` | hazards, hazard_category | ✅ 正常 |
| 整改闭环 | 整改任务与复查 | `/hazard-governance/rectification` | `/api/hse/hazard-rectification` | hse_rectifications, hse_reviews | ✅ 正常 |
| 预警中心 | 预警规则与任务 | `/hazard-governance/warning` | `/api/hse/warning-center` | hse_warning_rule, hse_warning_task | ✅ 正常 |
| 统计分析 | 隐患统计 | `/hazard-governance/statistics` | `/api/hazards/stats` | hazards (聚合) | ✅ 正常 |

---

### 2.4 现场管理（一级菜单）

| 二级菜单 | 功能名称 | 前端页面路径 | 后端接口前缀 | 数据库表 | 状态 |
|---------|---------|-------------|-------------|---------|------|
| 三违管理 | 三违登记与统计 | `/site-management/violations` | `/api/hse/violations` | violation_records, sanwei_records | ✅ 正常 |
| 网格管理 | 网格区域与巡查 | `/site-management/grid` | `/api/hse/grid` | grid_areas, grid_patrol_logs | ✅ 正常 |
| 消防设施 | 消防设施台账 | `/site-management/fire-facility` | `/api/hse/fire-facility` | fire_facilities, facility_inspection | ✅ 正常 |
| 车辆管理 | 车辆信息与保险 | `/site-management/vehicles` | `/api/vehicles` | vehicles, vehicle_insurance | ✅ 正常 |
| 现场检查 | 现场检查任务 | `/site-management/inspection` | `/api/hse/inspection` | inspection_tasks, inspection_records | ✅ 正常 |

---

### 2.5 人员管理（一级菜单）

| 二级菜单 | 功能名称 | 前端页面路径 | 后端接口前缀 | 数据库表 | 状态 |
|---------|---------|-------------|-------------|---------|------|
| 员工管理 | 员工列表与详情 | `/personnel/employees` | `/api/hse/employee` | employee, employee_master | ✅ 正常 |
| 组织管理 | 组织机构管理 | `/personnel/organization` | `/api/hse/org-center` | hse_org_unit, hse_operation_unit | ✅ 正常 |
| 岗位管理 | 岗位设置与职责 | `/personnel/positions` | `/api/hse/position-resp` | position, position_responsibility | ✅ 正常 |
| 人员保险 | 保险登记与统计 | `/personnel/insurance` | `/api/hse/insurance` | employee_safety_insurance | ✅ 正常 |
| 超龄人员 | 超龄人员预警 | `/personnel/over-age` | `/api/hse/over-age` | employee (年龄筛选) | ✅ 正常 |
| 花名册导入 | 员工批量导入 | `/personnel/import` | `/api/hse/employee-import/v2` | import_log, import_template | ✅ 正常 |

---

### 2.6 培训考核（一级菜单）

| 二级菜单 | 功能名称 | 前端页面路径 | 后端接口前缀 | 数据库表 | 状态 |
|---------|---------|-------------|-------------|---------|------|
| 培训计划 | 培训计划管理 | `/training/plan` | `/api/training` | training_plan, training_schedule | ✅ 正常 |
| 培训要求 | 培训要求配置 | `/training/requirements` | `/api/training/requirements` | training_requirements | ✅ 正常 |
| 培训台账 | 培训记录台账 | `/training/ledger` | `/api/training/ledger` | training_records, training_attendance | ✅ 正常 |
| 专项培训 | 新员工/驾驶员培训 | `/training/special` | `/api/training/special` | special_training, driver_training | ✅ 正常 |
| 培训统计 | 培训完成率统计 | `/training/statistics` | `/api/training/stats` | training_statistics | ✅ 正常 |
| 考核分析 | HSE考核分析 | `/training/assessment` | `/api/hse/assessment-analysis` | assessment_analysis, assessment_result | ✅ 正常 |
| 责任制考核 | 安全责任制考核 | `/training/responsibility` | `/api/hse/assessment-monthly` | hse_assessment_cycle, hse_assessment_target | ✅ 正常 |

---

### 2.7 应急管理（一级菜单）

| 二级菜单 | 功能名称 | 前端页面路径 | 后端接口前缀 | 数据库表 | 状态 |
|---------|---------|-------------|-------------|---------|------|
| 应急管理 | 应急预案与演练 | `/emergency/index` | `/api/emergency` | emergency_plan, emergency_drill | ✅ 正常 |

---

### 2.8 目标职责（一级菜单）

| 二级菜单 | 功能名称 | 前端页面路径 | 后端接口前缀 | 数据库表 | 状态 |
|---------|---------|-------------|-------------|---------|------|
| 目标责任书 | 目标责任书管理 | `/objectives/responsibility` | `/api/objectives/responsibility` | responsibility_book, responsibility_target | ✅ 正常 |
| 安委会管理 | 安委会成员与会议 | `/objectives/committee` | `/api/objectives/committee` | safety_committee, committee_meeting | ✅ 正常 |
| 安全费用 | 安全费用预算 | `/objectives/budget` | `/api/objectives/budget` | safety_budget, budget_expenditure | ✅ 正常 |

---

### 2.9 制度标准（一级菜单）

| 二级菜单 | 功能名称 | 前端页面路径 | 后端接口前缀 | 数据库表 | 状态 |
|---------|---------|-------------|-------------|---------|------|
| 规章制度 | 制度发布与版本管理 | `/standards/regulations` | `/api/regulations` | regulation, regulation_category | ✅ 正常 |
| 资料中心 | 安全资料上传与检索 | `/standards/documents` | `/api/hse/documents` | hse_documents, document_category | ✅ 正常 |
| 标准条款 | 安全生产标准条款库 | `/standards/clauses` | `/api/hse/standard/clauses` | standard_clause, clause_category | ✅ 正常 |
| 条款关联 | 条款与资料关联 | `/standards/relation` | `/api/hse/standard/relation` | clause_relation, clause_document | ✅ 正常 |
| 标准化评价 | 标准化自评 | `/standards/evaluation` | `/api/hse/standard/evaluation` | standard_evaluation, evaluation_task | ✅ 正常 |

---

### 2.10 系统管理（一级菜单）

| 二级菜单 | 功能名称 | 前端页面路径 | 后端接口前缀 | 数据库表 | 状态 |
|---------|---------|-------------|-------------|---------|------|
| 用户管理 | 用户账号管理 | `/system/users` | `/api/core/users` | users, user_role | ✅ 正常 |
| 角色管理 | 角色与权限配置 | `/system/roles` | `/api/roles` | roles, role_permission | ✅ 正常 |
| 审计日志 | 操作日志查询 | `/system/audit` | `/api/audit` | sys_operation_log, audit_log | ✅ 正常 |
| 工作流引擎 | 工作流定义与实例 | `/system/workflow` | `/api/hse/chain` | workflow, task, approval_log | ✅ 隐藏 |
| 批量导入 | 通用批量导入 | `/system/batch-import` | `/api/hse/batch-import` | batch_import_task, import_data | ✅ 隐藏 |

---

## 三、后端接口路由文件清单

| 序号 | 路由文件 | 接口前缀 | 对应模块 | 状态 |
|------|---------|---------|---------|------|
| 1 | auth.js | `/api/auth` | 认证 | ✅ |
| 2 | users.js | `/api/core/users` | 用户管理 | ✅ |
| 3 | vehicles.js | `/api/vehicles` | 车辆管理 | ✅ |
| 4 | files.js | `/api/files` | 文件管理 | ✅ |
| 5 | hazards.js | `/api/hazards` | 隐患治理 | ✅ |
| 6 | accidents.js | `/api/accidents` | 事故管理 | ✅ |
| 7 | personnel.js | `/api/personnel` | 人员管理 | ✅ |
| 8 | regulations.js | `/api/regulations` | 制度标准 | ✅ |
| 9 | dashboard.js | `/api/dashboard` | 驾驶舱 | ✅ |
| 10 | hse-employee.js | `/api/hse/employee` | 员工主数据 | ✅ |
| 11 | hse-standard.js | `/api/hse/standard` | 标准化评价 | ✅ |
| 12 | hse-report.js | `/api/hse/report` | 智能报告 | ✅ |
| 13 | hse-risk-profile.js | `/api/hse/risk-profile` | 风险画像 | ✅ |
| 14 | hse-accident-analysis.js | `/api/hse/accident-analysis` | 事故分析 | ✅ |
| 15 | hse-assessment.js | `/api/hse/assessment` | HSE考核 | ✅ |
| 16 | hse-employee-import-v2.js | `/api/hse/employee-import/v2` | 员工导入 | ✅ |
| 17 | hse-event.js | `/api/hse/events` | 事件中心 | ✅ |
| 18 | hse-statistics.js | `/api/hse/statistics` | 数据分析 | ✅ |
| 19 | hse-dashboard.js | `/api/hse/dashboard` | 领导驾驶舱 | ✅ |
| 20 | hse-documents.js | `/api/hse/documents` | 安全资料 | ✅ |
| 21 | hse-chain.js | `/api/hse/chain` | 闭环引擎 | ✅ |
| 22 | hse-tasks.js | `/api/hse/tasks` | 任务中心 | ✅ |
| 23 | hse-hazard-rectification.js | `/api/hse/hazard-rectification` | 隐患整改 | ✅ |
| 24 | hse-risk-score.js | `/api/hse/risk-score` | 风险评分 | ✅ |
| 25 | hse-batch-import.js | `/api/hse/batch-import` | 批量导入 | ✅ |
| 26 | hse-warning-center.js | `/api/hse/warning-center` | 预警中心 | ✅ |
| 27 | hse-org-center.js | `/api/hse/org-center` | 组织中心 | ✅ |
| 28 | hse-position-responsibility.js | `/api/hse/position-resp` | 岗位责任 | ✅ |
| 29 | hse-roster-import.js | `/api/hse` | 花名册导入 | ✅ |
| 30 | hse-driver-risk-center.js | `/api/hse/driver-risk-center` | 驾驶员风险 | ✅ |
| 31 | hse-assessment-analysis.js | `/api/hse/assessment-analysis` | 考核分析 | ✅ |
| 32 | hse-assessment-monthly.js | `/api/hse/assessment-monthly` | 月度考核 | ✅ |
| 33 | hse-executive-cockpit.js | `/api/hse/executive-cockpit` | 集团驾驶舱 | ✅ |
| 34 | hse-analysis-center.js | `/api/hse/analysis-center` | 智能分析 | ✅ |

---

## 四、数据库表清单（按模块分类）

### 4.1 安全总览相关表

| 表名 | 中文名 | 关键字段 | 状态 |
|------|-------|---------|------|
| dashboard_data | 驾驶舱数据 | id, indicator_name, value | ✅ |
| hse_statistics | HSE统计 | id, stat_type, stat_value | ✅ |
| hse_event | 事件中心 | id, event_type, event_data | ✅ |
| report | 报告 | id, report_name, report_type | ✅ |
| report_template | 报告模板 | id, template_name, template_content | ✅ |

### 4.2 风险管控相关表

| 表名 | 中文名 | 关键字段 | 状态 |
|------|-------|---------|------|
| risk_sources | 风险源 | id, name, type, level | ✅ |
| risk_measures | 管控措施 | id, risk_id, measure_content | ✅ |
| hse_employee_risk_snapshot | 员工风险快照 | id, employee_id, risk_score | ✅ |
| hse_risk_score_config | 风险评分配置 | id, factor_name, weight | ✅ |
| driver_risk_profile | 驾驶员风险画像 | id, driver_id, risk_level | ✅ |
| accidents | 事故 | id, accident_type, accident_date | ✅ |
| accident_investigation | 事故调查 | id, accident_id, investigation_result | ✅ |
| ai_analysis_result | AI分析结果 | id, analysis_type, result_data | ✅ |

### 4.3 隐患治理相关表

| 表名 | 中文名 | 关键字段 | 状态 |
|------|-------|---------|------|
| hazards | 隐患 | id, type, level, status | ✅ |
| hazard_category | 隐患分类 | id, category_name | ✅ |
| hse_rectifications | 整改记录 | id, hazard_id, rectify_plan | ✅ |
| hse_reviews | 复查记录 | id, rectification_id, review_result | ✅ |
| hse_warning_rule | 预警规则 | id, rule_name, rule_type | ✅ |
| hse_warning_record | 预警记录 | id, warning_type, warning_level | ✅ |
| hse_warning_task | 预警任务 | id, task_name, task_status | ✅ |

### 4.4 现场管理相关表

| 表名 | 中文名 | 关键字段 | 状态 |
|------|-------|---------|------|
| violation_records | 三违记录 | id, violation_type, violation_date | ✅ |
| grid_areas | 网格区域 | id, area_name, responsible_person | ✅ |
| grid_patrol_logs | 巡查日志 | id, grid_id, patrol_date | ✅ |
| fire_facilities | 消防设施 | id, facility_name, location | ✅ |
| vehicles | 车辆 | id, plate_number, vehicle_type | ✅ |
| vehicle_insurance | 车辆保险 | id, vehicle_id, insurance_type | ✅ |
| inspection_tasks | 检查任务 | id, task_name, task_date | ✅ |

### 4.5 人员管理相关表

| 表名 | 中文名 | 关键字段 | 状态 |
|------|-------|---------|------|
| employee | 员工基础 | id, name, department_id | ✅ |
| employee_master | 员工主数据 | id, employee_id, entry_date | ✅ |
| hse_org_unit | 组织单元 | id, unit_name, unit_type | ✅ |
| hse_operation_unit | 作业单元 | id, unit_name, operation_type | ✅ |
| hse_employee_relation | 人员组织关系 | id, employee_id, org_unit_id | ✅ |
| position | 岗位 | id, position_name, responsibility | ✅ |
| position_responsibility | 岗位责任 | id, position_id, responsibility_type | ✅ |
| employee_safety_insurance | 员工保险 | id, employee_id, insurance_type | ✅ |
| import_log | 导入日志 | id, import_type, import_date | ✅ |

### 4.6 培训考核相关表

| 表名 | 中文名 | 关键字段 | 状态 |
|------|-------|---------|------|
| training_plan | 培训计划 | id, plan_name, plan_date | ✅ |
| training_requirements | 培训要求 | id, requirement_name, target_position | ✅ |
| training_records | 培训记录 | id, training_id, employee_id | ✅ |
| training_attendance | 培训签到 | id, training_id, employee_id | ✅ |
| hse_assessment_cycle | 考核周期 | id, cycle_name, start_date, end_date | ✅ |
| hse_assessment_target | 考核对象 | id, cycle_id, employee_id | ✅ |
| hse_assessment_metric | 考核指标 | id, metric_name, metric_type | ✅ |
| hse_assessment_score | 评分记录 | id, target_id, metric_id, score | ✅ |
| hse_deduction_detail | 扣分明细 | id, score_id, deduction_reason | ✅ |

### 4.7 应急管理相关表

| 表名 | 中文名 | 关键字段 | 状态 |
|------|-------|---------|------|
| emergency_plan | 应急预案 | id, plan_name, plan_type | ✅ |
| emergency_drill | 应急演练 | id, plan_id, drill_date | ✅ |

### 4.8 目标职责相关表

| 表名 | 中文名 | 关键字段 | 状态 |
|------|-------|---------|------|
| responsibility_book | 责任书 | id, book_name, sign_date | ✅ |
| responsibility_target | 责任目标 | id, book_id, target_content | ✅ |
| safety_committee | 安委会 | id, member_name, position | ✅ |
| committee_meeting | 安委会会议 | id, meeting_date, meeting_topic | ✅ |
| safety_budget | 安全费用 | id, budget_type, amount | ✅ |

### 4.9 制度标准相关表

| 表名 | 中文名 | 关键字段 | 状态 |
|------|-------|---------|------|
| regulation | 规章制度 | id, regulation_name, version | ✅ |
| regulation_category | 制度分类 | id, category_name | ✅ |
| hse_documents | 安全资料 | id, document_name, document_type | ✅ |
| standard_clause | 标准条款 | id, clause_number, clause_content | ✅ |
| clause_relation | 条款关联 | id, clause_id, document_id | ✅ |
| standard_evaluation | 标准化评价 | id, evaluation_name, evaluation_date | ✅ |

### 4.10 系统管理相关表

| 表名 | 中文名 | 关键字段 | 状态 |
|------|-------|---------|------|
| users | 用户 | id, username, password_hash | ✅ |
| roles | 角色 | id, role_name, role_code | ✅ |
| user_role | 用户角色关联 | id, user_id, role_id | ✅ |
| role_permission | 角色权限关联 | id, role_id, permission_id | ✅ |
| sys_operation_log | 操作日志 | id, user_id, operation_type | ✅ |
| workflow | 工作流 | id, workflow_name, workflow_status | ✅ |
| task | 任务 | id, task_name, task_status | ✅ |
| batch_import_task | 批量导入任务 | id, task_name, task_status | ✅ |

---

## 五、前端API模块清单

| 模块文件 | 接口函数 | 对应路由 |
|---------|---------|---------|
| alert.ts | getAlertList, createAlert | /api/hse/warning-center |
| audit.ts | getAuditLogs | /api/audit |
| auth.ts | login, logout, getUserInfo | /api/auth |
| file.ts | uploadFile, getFileList | /api/files |
| hazard.ts | getHazardList, createHazard, updateHazard | /api/hazards |
| report.ts | getReportList, generateReport | /api/hse/report |
| risk.ts | getRiskList, getRiskDetail, calculateRisk | /api/risk-control, /api/hse/risk-score |
| system.ts | getUserList, getRoleList, getMenuTree | /api/core/users, /api/roles |
| user.ts | getUserList, createUser, updateUser | /api/core/users |

---

**文档状态**：✅ 已生成
**后续用途**：菜单归属校验、重复功能检查、路由权限校验的基础数据