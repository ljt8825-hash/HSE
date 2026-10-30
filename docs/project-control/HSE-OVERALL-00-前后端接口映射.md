# HSE-OVERALL-00｜前后端接口映射

> 方法：只读扫描 `server/routes/`（约 170 文件、**1,864 条路由定义**，grep `router.(get|post|put|delete|patch)` 实测）与前端 `web-naive/src/api/`（79 个 .ts 模块）、`web-antd/src/api/`。
> 本文档给出**模块级映射**（前端页面 → API 模块 → 路由文件 → Controller → Service → 数据表）与异常清单。1,864 条路由不逐条罗列，逐条明细可在对应路由文件中按行号取证。

## 一、模块级映射总表

| 业务模块 | 前端 API（web-naive/src/api） | 后端路由文件 | Controller | Service | 主要数据表 |
|---|---|---|---|---|---|
| 人员底座 | hse/employee.ts, employee-status.ts, employee-rehire.ts, employee-terminate.ts, employee-profile.ts, employee-import-v2.ts | hse-employee.js + hse-employee/*(15) + hse-roster-import/ + hse-employee-import-v2/ | hse-employee.js, hse-assignment.js, hse-history.js, hse-selector.js, employeeImportV2Controller, rosterImportController | employeeService, employeeAssignmentService, employeeStatusDict, employeeImportV1/V2Service, employeeProfileService | employee, employee_assignment, employee_history, hse_employee_org(弃), hse_employee_relation, employee_import_* |
| 组织区域 | hse/system.ts, hse/site.ts(部分) | hse-org-center.js, hse-position-responsibility/, menus.js, menu-order.js | hse-org-tree.js, positionResponsibilityController | orgCenter 系 | hse_org_unit, department(弃), departments(legacy), position, hse_operation_unit |
| 隐患 | hse/hazard.ts | hazards.js, hazards/main.js, hse-hazard-baseline.js, hse-hazard-rectification/ | hazardController, hazardRectificationController | hazardService, hazardRectificationService | hazards(110条legacy), hse_events, hse_rectifications, hse_reviews, hazard_record 等 8 表并行栈 |
| 风险库 | risk-library/* | risk-library.js, risk-control.js + main | riskLibraryController, riskControlController | riskLibraryService, riskControlService | risk_scene, risk_scene_applicability, project_risk_record, risk_*_dict 5 表, risk_m* 系列 14 表 |
| 月度考核 | hse/assessment-monthly.ts, assessment-rule.ts, violation-assessment.ts | hse-assessment-monthly/ + hse-assessment-monthly.js, hse-assessment-rule.js, hse-assessment.js + main, hse-violation-assessment.js | assessmentMonthlyController, assessmentController | assessmentMonthly*Service 5 件套, assessmentScheduler | sprint10d2 7 表 + 规则引擎 6 表 + hse_assessment_rule/assessment_rule 双套 |
| 安全费用 | hse/cost.ts, goals.ts, materialPrice.ts | cost.js(保护态) + cost/main.js, objectives/main.js, hse-material-price.js | costController, objectiveController | costService, objectiveService | hse_cost_* 9 表, hse_safety_budget(双持有), hse_budget_item |
| 培训 | hse/training.ts, trainingOcr | training/ + training.js, training-ocr/, training-assessment.js | trainingController, trainingOcrController | trainingShared, trainingPlanService, trainingPlanStatusMachine | training_records(复数), training_record(v63), training_plans, employee_training_status, hse_training_ledger_monthly |
| 事故 | hse/accident.ts, accident-analysis.ts | accidents.js + accidents/main.js, hse-accident-analysis.js | accidentController, analysisCenter 部分 | accidentService | accidents, accident_persons, accident_attachments/versions |
| 三违 | hse/violations.ts, mw 系 | violations.js + violations/main.js, hse-violation-assessment.js | siteMgmt 部分 | violationService | violations(无写入), violation_records(活), hse_sanwei_score_monthly |
| 网格/巡查 | hse/grid-upload.ts, grid-attribution.ts, grid-violation-candidates.ts, checkLedger.ts | wps-grid-sync.js, hse-grid-attribution.js, hse-grid-violation-candidates.js | siteMgmt 部分 | wpsGridPullEngine, wpsGridSyncScheduler | grid_inspection_records, grid_record_sync_map, grid_areas, grid_patrol_logs |
| 检查/现场 | hse/site.ts | site-mgmt.js + main.js, transfer-stations.js, vehicle-checks.js, overview.js(残留) | siteMgmtController, transferStations, vehicleChecks | siteMgmtService | transfer_station_check, vehicle_check_record, t_08/t_05 Excel 残留表(overview.js:44,49 直读) |
| 保险 | hse/insurance.ts | insurance.js + insurance/*(9) | hse-insurance.js | insuranceShared | insurance_history, insurance_policies, other_insurance, personnel_insurance, over_age_personnel |
| 应急 | hse/emergency.ts | emergency.js + main.js | emergencyController | emergencyService | emergency_plans/supplies/materials/teams/events + attachments |
| 目标职责 | hse/goals.ts, responsibility-forms.ts | objectives.js + main.js, hse-responsibility-forms.js, hse-position-responsibility/ | objectiveController, positionResponsibilityController | objectiveService | hse_target_contracts, hse_safety_committee, hse_responsibility(+config/area/chain), safety_responsibility_forms, meeting_records |
| 驾驶舱 | hse/cockpit.ts, leader-dashboard.ts, executive-cockpit.ts, bi.ts | hse-leader-dashboard.js, hse-executive-cockpit/, dashboard.js, hse-dashboard/, bi.js, overview.js | leaderDashboardController, executiveCockpitController, hseDashboardController, biController | statisticsService 等 | hse_statistics_daily/monthly/yearly/dept/person, 各业务表读侧 |
| 预警告警 | hse/alerts.ts, warning-center.ts | alerts.js, hse-warning-center.js + main.js | — | warningCenterService | hse_warning_rule/record/task/rule_version, hse_rectification_evaluation |
| 标准法规 | hse/standard.ts, standard-relation.ts, regulations.ts | standards.js + main.js, hse-standard*.js, regulations/ | standardsController, regulationsController | standardsService | hse_regulations, hse_document_library, hse_clause_relations, regulations_v2 |
| 文档/知识 | hse/documents.ts, company-ai.ts | hse-documents.js, company-ai.js, ai-knowledge.js, ai.js, ai-v2.js, ai-enhanced/ | companyAiController, knowledgeController | ai 系 | knowledge_sources/documents/chunks/embeddings, ai_prompt_registry, ai_generation_records |
| 系统管理 | hse/system.ts, audit.ts | users.js, roles.js, menus.js, audit.js, hse-audit-records.js, system-mgmt.js | — | — | users, roles, user_role, role_menu, menus, sys_operation_log, audit_record |
| 移动端 | mobile-transport.ts, mw 系 | mobileAuth.js, wps-dbsheet.js, wps-grid-sync.js | — | wps 系 | 生产走飞书 Bitable（app_token WX9TbTqJKa7sywsgrU4cVoKdnXb），PG 零接收 |
| 认证 | api/core | auth.js, mobileAuth.js, current-employee.js | — | — | users, token_blacklist, login_attempts, tenants |

## 二、异常清单（重点标注项）

1. **页面有入口但无接口/接口无页面**：
   - `/overview/driver-risk-center` 等 7 个 driver-risk-center 页面 ↔ `hse-driver-risk-center.js`（映射存在，深度待核实）；
   - `routes/hse-tasks.js` 存在但 `hse_tasks` 表 0 行 → 入口永不触发（B02 定局）；`routes/todo-plans.js`/`todos.js` 待核实页面引用；
   - `routes/vben-compat.js`、`routes/visual-layout.js`、`routes/demo-data.js`、`routes/iot.js` 为兼容/演示类，无真实业务闭环。
2. **旧接口与新接口并存**：employee(新) vs personnel(legacy) 两套路由均挂载；hazards vs hse_events 双轨；training_records vs training_record；hse_assessment_rule vs 裸 assessment_rule（`routes/hse-dynamic-capability.js:42` 运行时建表）。
3. **重复挂载/双 Router 疑点**：`routes/<mod>.js` 与 `routes/<mod>/main.js` 成对出现约 20 组（hazards/cost/emergency/training/accidents 等），挂载关系在 `app.js`，需逐一确认旧壳文件是否仍被 use（本次未逐条核实，**待核实**）；`routes/__orig_*.js` 3 个为明显残留副本。
4. **业务逻辑放错层**：`overview.js:44,49` 直读 Excel 迁移残留表（P0-2）；`routes/hse-dynamic-capability.js` 在路由层运行时建表（assessment_rule 等）；`routes/demo-data.js` 建表 system_settings。
5. **同一数据多写入入口**：hse_safety_budget（objectiveService 与 cost 域双持有）；employee 关系字段（W1 已收口，仅剩 terminate/rehire 两专用口）；vehicles 表被 insuranceShared 运行时 ALTER。
6. **前端实现、后端无保障**：镜像页 mirror/* 8 个纯前端复刻；`/mw` 三违闭环依赖前端步骤流，后端校验深度待核实（**待核实**）。
7. **权限**：RBAC 中间件 `middleware/auth.js` + requireRole；权限串样例 `hse:personnel:update`、`hse:hazard:review`；26 端点复用 `hse:training:*` 权限串（B02-DEC 定局，待专项治理）。

## 三、量化小结

- 后端路由定义 1,864 条 / 路由文件约 170 个（含 3 个 `__orig_` 残留、若干 `*.unit.test.js` 混入 routes 目录）。
- 前端 web-naive API 模块 79 个；web-antd 另有一套平行 API（重复实现）。
- 成对 `X.js`+`X/main.js` 拆分约 20 组，说明经历过一轮路由拆分但旧壳未全部清理。
