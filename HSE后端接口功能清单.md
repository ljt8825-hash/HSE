# HSE 后端接口功能清单

> **文档性质**：后端资产审计报告（只读扫描，未修改任何文件）
> **扫描范围**：F:\deploy\hse-dashboard\server\routes\
> **审计日期**：2026-07-24
> **任务编号**：Sprint10-D-1-3

---

## 一、审计概览

本次审计扫描后端 Node.js/Express 应用的全部路由文件，提取 API 接口清单。

| 维度 | 数量 |
|------|------|
| 路由文件 | 64 个 |
| API 接口总数 | ~530 个 |
| 挂载前缀 | 50+ 个 |
| 中间件 | 3 层（authMiddleware + requireRole + verifyToken） |
| WebSocket | 1 个（wsServer） |
| 限流策略 | 3 级（全局/BI/IoT） |

---

## 二、接口模块清单

### 2.1 内联路由（app.js）

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | /api/health | 健康检查（数据库、内存、AI状态） |
| GET | /api/postgres/status | PostgreSQL 状态检测 |
| GET | /metrics | Prometheus 指标暴露 |

---

### 2.2 认证模块（auth.js）
- **挂载路径**：/api/auth
- **接口数**：~12 个
- **业务功能**：登录、登出、刷新Token、获取用户信息、修改密码
- **涉及表**：users, token_blacklist, login_attempts

---

### 2.3 车辆管理模块（vehicles.js）
- **挂载路径**：/api/vehicles
- **接口数**：~10 个
- **业务功能**：车辆CRUD、保险信息、保险历史
- **涉及表**：vehicles, insurance_history

---

### 2.4 文件管理模块（files.js / file-records.js）
- **挂载路径**：/api/files、/api/hse/file-records
- **接口数**：~12 个
- **业务功能**：文件上传、下载、文件记录管理
- **涉及表**：file_records

---

### 2.5 风险管控模块（risk-control.js）
- **挂载路径**：/api/risk-control
- **接口数**：~15 个
- **业务功能**：风险源管理、风险等级、管控措施
- **涉及表**：risk_sources

---

### 2.6 数据导入模块（import.js）
- **挂载路径**：/api/import
- **接口数**：~20 个
- **业务功能**：批量数据导入（车辆/人员/培训/隐患/事故/三违/网格）
- **涉及表**：import_logs, field_mapping_config, 各业务表

---

### 2.7 概览模块（overview.js）
- **挂载路径**：/api/overview
- **接口数**：~8 个
- **业务功能**：首页概览统计数据
- **涉及表**：vehicles, personnel, hazards, accidents, training_records

---

### 2.8 规章制度模块（regulations.js）
- **挂载路径**：/api/regulations
- **接口数**：~15 个
- **业务功能**：制度CRUD、附件管理、版本管理
- **涉及表**：regulation_attachments, regulation_versions

---

### 2.9 培训管理模块（training.js）
- **挂载路径**：/api/training
- **接口数**：~40 个（含动态路由展开）
- **业务功能**：培训计划、培训要求、年度计划、培训台账、新员工培训、驾驶员实操、培训统计、培训分析、培训提醒、计划执行
- **涉及表**：training_records, training_roster, personnel
- **特点**：通过 createTrainingSubRoute 工厂函数为 4 个子路径动态生成 16 个路由

---

### 2.10 三违管理模块（violations.js）
- **挂载路径**：/api/violations
- **接口数**：~12 个
- **业务功能**：三违记录CRUD、统计、导出
- **涉及表**：violations（内存或动态表）

---

### 2.11 事故管理模块（accidents.js）
- **挂载路径**：/api/accidents
- **接口数**：~15 个
- **业务功能**：事故记录CRUD、涉事人员、统计
- **涉及表**：accidents, accident_persons

---

### 2.12 隐患排查模块（hazards.js）
- **挂载路径**：/api/hazards
- **接口数**：~15 个
- **业务功能**：隐患登记、整改、复查、统计
- **涉及表**：hazards

---

### 2.13 应急管理模块（emergency.js）
- **挂载路径**：/api/emergency
- **接口数**：~10 个
- **业务功能**：应急预案、演练记录
- **涉及表**：emergency相关表

---

### 2.14 保险管理模块（insurance.js / personnel.js / over-age-personnel.js）
- **挂载路径**：/api/insurance、/api/personnel、/api/over-age-personnel
- **接口数**：~25 个
- **业务功能**：车辆保险、人员保险、超龄人员管控
- **涉及表**：personnel_insurance, over_age_personnel, personnel, vehicles

---

### 2.15 现场管理模块（site-mgmt.js）
- **挂载路径**：/api/site-mgmt
- **接口数**：~12 个
- **业务功能**：现场检查、网格管理
- **涉及表**：grid_areas, grid_patrol_logs

---

### 2.16 目标职责模块（objectives.js）
- **挂载路径**：/api/objectives
- **接口数**：~25 个（含动态路由展开）
- **业务功能**：目标责任书、安委会、责任制考核、安全费用预算
- **涉及表**：objectives相关表
- **特点**：通过 createMemoryCrud 工厂函数为 4 个模块生成 20 个内存 CRUD 路由

---

### 2.17 驾驶舱模块（dashboard.js）
- **挂载路径**：/api/dashboard
- **接口数**：~10 个
- **业务功能**：驾驶舱数据汇总
- **涉及表**：多表联合查询

---

### 2.18 告警模块（alerts.js）
- **挂载路径**：/api/hse/alerts
- **接口数**：~12 个
- **业务功能**：告警列表、处理、统计
- **涉及表**：alerts相关表

---

### 2.19 审计日志模块（audit.js）
- **挂载路径**：/api/hse/audit
- **接口数**：~8 个
- **业务功能**：操作日志查询、筛选
- **涉及表**：sys_operation_log

---

### 2.20 用户管理模块（users.js）
- **挂载路径**：/api/core/users
- **接口数**：~15 个
- **业务功能**：用户CRUD、密码重置、状态管理
- **涉及表**：users, user_role

---

### 2.21 角色管理模块（roles.js）
- **挂载路径**：/api/core/roles
- **接口数**：~10 个
- **业务功能**：角色CRUD、权限分配
- **涉及表**：roles, role_menu

---

### 2.22 菜单管理模块（menus.js）
- **挂载路径**：/api/core/menus
- **接口数**：~10 个
- **业务功能**：菜单树查询、CRUD、排序
- **涉及表**：menus, role_menu

---

### 2.23 工作流模块（workflow.js）
- **挂载路径**：/api/hse/workflow
- **接口数**：~15 个
- **业务功能**：工作流定义、实例、任务、历史
- **涉及表**：workflows, workflow_instances, workflow_tasks, workflow_history

---

### 2.24 通知模块（notifications.js）
- **挂载路径**：/api/hse/notifications
- **接口数**：~10 个
- **业务功能**：通知列表、已读标记、推送
- **涉及表**：notifications相关表

---

### 2.25 可视化布局模块（visual-layout.js）
- **挂载路径**：/api/user/visual-layout
- **接口数**：~5 个
- **业务功能**：用户工作台拖拽布局保存/读取
- **涉及表**：users.visual_layout字段

---

### 2.26 菜单排序模块（menu-order.js）
- **挂载路径**：/api/user/menu-order
- **接口数**：~5 个
- **业务功能**：用户自定义菜单排序
- **涉及表**：users相关字段

---

### 2.27 HSE事件中心（hse-events.js）— v4.2
- **挂载路径**：/api/hse/events
- **接口数**：~12 个
- **业务功能**：统一安全事件流水（隐患/事故/三违/巡检/IoT/培训/风险7类）
- **涉及表**：hse_events, hse_event_links, hse_event_timeline

---

### 2.28 HSE闭环引擎（hse-chain.js）— v4.2
- **挂载路径**：/api/hse/chain
- **接口数**：~10 个
- **业务功能**：标准化闭环引擎（检查计划/风险对象）
- **涉及表**：hse_inspection_plans, hse_risk_objects

---

### 2.29 HSE任务中心（hse-tasks.js）— v4.3
- **挂载路径**：/api/hse/tasks
- **接口数**：~12 个
- **业务功能**：统一任务中心（检查任务/执行记录/任务提醒）
- **涉及表**：hse_tasks, hse_inspection_tasks, hse_inspection_executions, hse_task_reminders

---

### 2.30 HSE数据分析中心（hse-statistics.js）— v5.0
- **挂载路径**：/api/hse/statistics
- **接口数**：~12 个
- **业务功能**：安全数据统计（日/月/年/部门/责任人）
- **涉及表**：hse_statistics_daily, hse_statistics_monthly, hse_statistics_yearly, hse_statistics_dept, hse_statistics_person

---

### 2.31 HSE领导驾驶舱（hse-dashboard.js）— v5.1
- **挂载路径**：/api/hse/dashboard
- **接口数**：~10 个
- **业务功能**：领导驾驶舱数据聚合
- **涉及表**：多表联合（统计表+业务表）

---

### 2.32 HSE智能报告中心（hse-report.js）— v5.2
- **挂载路径**：/api/hse/report
- **接口数**：~11 个
- **业务功能**：报告生成（日/周/月/年）、预览、历史、删除
- **涉及表**：hse_report_templates, hse_reports

---

### 2.33 BI大屏模块（bi.js）— v4.0
- **挂载路径**：/api/hse/bi
- **接口数**：~10 个
- **业务功能**：BI 大屏数据接口
- **限流**：独立限流（1000次/15分钟）

---

### 2.34 AI辅助模块（ai.js / ai-enhanced.js）— v4.0
- **挂载路径**：/api/hse/ai
- **接口数**：~15 个
- **业务功能**：AI 对话、风险分析、报告生成
- **涉及表**：ai_generation_records

---

### 2.35 IoT物联网模块（iot.js）— v4.0
- **挂载路径**：/api/hse/iot
- **接口数**：~8 个
- **业务功能**：IoT 设备数据接入
- **限流**：独立限流（2000次/15分钟）

---

### 2.36 安全资料中心（hse-documents.js）— V2 Sprint 1
- **挂载路径**：/api/hse/documents
- **接口数**：~20 个
- **业务功能**：文件上传、审核、分类、标签、版本
- **涉及表**：document_files, document_categories, document_tags, document_tag_relation, document_versions

---

### 2.37 标准化评价中心（hse-standard.js）— V2 Sprint 4
- **挂载路径**：/api/hse/standard
- **接口数**：~15 个
- **业务功能**：标准条款库CRUD、评价任务
- **涉及表**：safety_standard_clauses, standard_evaluation_tasks, standard_evaluation_items

---

### 2.38 标准条款关联（hse-standard-relation.js）— V2 Sprint 4 Phase4
- **挂载路径**：/api/hse/standard/relation
- **接口数**：~10 个
- **业务功能**：条款-资料关联管理
- **涉及表**：document_standard_relation

---

### 2.39 标准化评价AI辅助（hse-standard-evaluation.js）— V2 Sprint 4 Phase5
- **挂载路径**：/api/hse/standard/evaluation
- **接口数**：~8 个
- **业务功能**：AI辅助标准化评价
- **涉及表**：standard_evaluation_tasks, standard_evaluation_items

---

### 2.40 批量导入中心（hse-batch-import.js）— V2 Sprint 5
- **挂载路径**：/api/hse/batch-import
- **接口数**：~10 个
- **业务功能**：批量导入任务管理
- **涉及表**：hse_batch_import_tasks, hse_batch_import_items

---

### 2.41 人员主数据中心（hse-employee.js）— Sprint 5.1
- **挂载路径**：/api/hse/employee
- **接口数**：~80 个
- **业务功能**：员工CRUD、组织管理、岗位管理、人事变动、导入导出
- **涉及表**：employee, department, position, hse_employee_org, employee_history

---

### 2.42 员工花名册导入V2（hse-employee-import-v2.js）— Sprint 5.6
- **挂载路径**：/api/hse/employee-import/v2
- **接口数**：~15 个
- **业务功能**：花名册批次导入、映射规则、校验
- **涉及表**：employee_import_batch, employee_import_mapping_rule

---

### 2.43 隐患整改闭环中心（hse-hazard-rectification.js）— Sprint 5.5
- **挂载路径**：/api/hse/hazard-rectification
- **接口数**：~12 个
- **业务功能**：隐患整改闭环管理
- **涉及表**：hse_rectifications, hse_reviews

---

### 2.44 占位路由 — 通知模块（hse-notice.js）
- **挂载路径**：/api/hse/notice
- **接口数**：6 个（占位，返回空数据）
- **状态**：未实现

---

### 2.45 占位路由 — 隐患基线模块（hse-hazard-baseline.js）
- **挂载路径**：/api/hse/hazard-baseline
- **接口数**：5 个（占位，返回空数据）
- **状态**：未实现

---

### 2.46 组织中心（hse-org-center.js）— Sprint 6.0
- **挂载路径**：/api/hse/org-center
- **接口数**：~15 个
- **业务功能**：管理组织、作业单元、人员关系
- **涉及表**：hse_org_unit, hse_operation_unit, hse_employee_relation

---

### 2.47 岗位责任体系（hse-position-responsibility.js）— Sprint 6.0
- **挂载路径**：/api/hse/position-resp
- **接口数**：~12 个
- **业务功能**：岗位体系、责任配置
- **涉及表**：position, hse_responsibility, hse_responsibility_config

---

### 2.48 花名册导入基础（hse-roster-import.js）— Sprint 6.0
- **挂载路径**：/api/hse
- **接口数**：~10 个
- **业务功能**：花名册导入基础能力
- **涉及表**：employee_import_batch

---

### 2.49 员工风险画像基础（hse-risk-profile-base.js）— Sprint 6.1-A
- **挂载路径**：/api/hse/risk-profile/employee
- **接口数**：~8 个
- **业务功能**：员工风险画像基础框架
- **涉及表**：hse_employee_risk_snapshot
- **注意**：必须优先注册，避免被 hse-risk-profile.js 的 /:id 捕获

---

### 2.50 驾驶员专项风险画像（hse-driver-risk.js）— Sprint 6.1-D
- **挂载路径**：/api/hse/risk-profile/employee
- **接口数**：~8 个
- **业务功能**：驾驶员专项风险画像
- **涉及表**：hse_employee_risk_snapshot

---

### 2.51 员工风险画像中心（hse-risk-profile.js）— Sprint 6.1
- **挂载路径**：/api/hse/risk-profile
- **接口数**：~10 个
- **业务功能**：员工风险画像完整版
- **涉及表**：hse_employee_risk_snapshot, hse_risk_score_config

---

### 2.52 风险等级计算（hse-risk-score.js）— Sprint 6.2
- **挂载路径**：/api/hse/risk-score
- **接口数**：~8 个
- **业务功能**：风险评分计算、配置管理
- **涉及表**：hse_risk_score_config, hse_employee_risk_snapshot

---

### 2.53 员工风险画像详情（hse-risk-profile-detail.js）— Sprint 6.4-A
- **挂载路径**：/api/hse/risk/profile
- **接口数**：~8 个
- **业务功能**：员工风险画像详情页数据
- **涉及表**：hse_employee_risk_snapshot

---

### 2.54 驾驶员专项风险中心（hse-driver-risk-center.js）— Sprint 6.4-B
- **挂载路径**：/api/hse/driver-risk-center
- **接口数**：~8 个
- **业务功能**：驾驶员风险中心数据
- **涉及表**：hse_employee_risk_snapshot

---

### 2.55 事故分析中心（hse-accident-analysis.js）— Sprint 6.4-C
- **挂载路径**：/api/hse/accident-analysis
- **接口数**：~8 个
- **业务功能**：事故分析中心数据
- **涉及表**：accidents, accident_persons

---

### 2.56 集团HSE考核分析中心（hse-assessment-analysis.js）— Sprint 6.5
- **挂载路径**：/api/hse/assessment-analysis
- **接口数**：~8 个
- **业务功能**：考核分析中心
- **涉及表**：多表联合

---

### 2.57 集团HSE考核分析系统（hse-assessment.js）— Sprint 6.5-B
- **挂载路径**：/api/hse/assessment
- **接口数**：~8 个
- **业务功能**：考核分析系统
- **涉及表**：多表联合

---

### 2.58 集团HSE智能驾驶舱（hse-executive-cockpit.js）— Sprint 6.5-C
- **挂载路径**：/api/hse/executive-cockpit
- **接口数**：~8 个
- **业务功能**：集团智能驾驶舱数据
- **涉及表**：多表联合

---

### 2.59 HSE智能预警与整改闭环中心（hse-warning-center.js）— Sprint 7
- **挂载路径**：/api/hse/warning-center
- **接口数**：28 个
- **业务功能**：预警规则、预警记录、整改任务、规则版本
- **涉及表**：hse_warning_rule, hse_warning_record, hse_warning_task, hse_warning_rule_version, hse_warning_scheduler, hse_rectification_evaluation

---

### 2.60 HSE智能分析中心（hse-analysis-center.js）— Sprint 8-A
- **挂载路径**：/api/hse/analysis-center
- **接口数**：21 个
- **业务功能**：风险分析快照、风险预测、模型版本管理
- **涉及表**：hse_analysis_snapshot, hse_risk_prediction, hse_prediction_model_version

---

### 2.61 Vben前端兼容路由（vben-compat.js）
- **挂载路径**：/api
- **接口数**：3 个
- **业务功能**：/api/user/info、/api/access/codes、/api/menu/all
- **说明**：对齐 Vben Admin 前端接口契约，最后注册以避免覆盖

---

## 三、接口模块统计汇总

| 模块分类 | 文件数 | 接口数 | Sprint版本 |
|---------|-------|-------|-----------|
| 内联路由 | 1 | 3 | - |
| 基础业务模块 | 20 | ~280 | V1.0-V2.0 |
| HSE核心事件中心 | 6 | ~56 | v4.2-v4.3 |
| BI/AI/IoT模块 | 5 | ~25 | v4.0 |
| V2安全资料与标准化 | 5 | ~58 | V2 Sprint 1-5 |
| 员工主数据与花名册 | 3 | ~167 | Sprint 5.1-5.6 |
| 隐患整改闭环 | 3 | ~29 | Sprint 5.5 |
| 组织中心与岗位责任 | 3 | ~42 | Sprint 6.0 |
| 风险画像与评分 | 5 | ~23 | Sprint 6.1-6.2 |
| Sprint6.4+分析中心 | 5 | ~24 | Sprint 6.4-6.5 |
| Sprint7预警与整改 | 1 | 28 | Sprint 7 |
| Sprint8智能分析 | 1 | 21 | Sprint 8-A |
| Vben兼容路由 | 1 | 3 | - |
| 占位路由 | 2 | 11 | 未实现 |
| **合计** | **~64** | **~530** | |

---

## 四、关键审计发现

### 4.1 路由注册问题

1. **同前缀共享路由**：4 处路由模块共享同一挂载前缀
   - `/api/hse/ai` 同时挂载 ai.js 和 ai-enhanced.js
   - `/api/hse/risk-profile/employee` 同时挂载 hse-risk-profile-base.js 和 hse-driver-risk.js
2. **路由注册顺序敏感**：hse-risk-profile-base.js 必须在 hse-driver-risk.js 之前注册
3. **vben-compat.js 最后注册**：避免覆盖业务路由

### 4.2 占位接口

| 模块 | 接口数 | 状态 |
|------|-------|------|
| hse-notice.js | 6 个 | 占位，返回空数据 |
| hse-hazard-baseline.js | 5 个 | 占位，返回空数据 |

### 4.3 动态路由展开

| 模块 | 工厂函数 | 生成路由数 |
|------|---------|-----------|
| training.js | createTrainingSubRoute | 16 个（4子路径×4方法） |
| objectives.js | createMemoryCrud | 20 个（4模块×5方法） |

### 4.4 安全机制

- **权限中间件三层体系**：authMiddleware（全局）+ requireRole（角色级）+ verifyToken（JWT验证）
- **限流策略**：全局 500次/15分钟、BI 1000次/15分钟、IoT 2000次/15分钟
- **安全头**：Helmet（CSP/XSS/点击劫持/HSTS）
- **CORS**：白名单机制，支持环境变量配置

---

## 五、审计说明

1. 本文档为**只读审计**产物，未修改任何源文件
2. 接口数量为基于路由定义的估算值（~530），实际可能因动态路由展开而略有出入
3. 涉及表名从 SQL 查询语句和文件命名推断，部分动态表（如内存表）未列出
4. 占位路由（hse-notice / hse-hazard-baseline）标注为"未实现"

---

*文档生成时间：2026-07-24*
*审计任务：Sprint10-D-1-3 HSE系统全量资产审计*
