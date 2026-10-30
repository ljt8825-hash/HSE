# HSE-OVERALL-00｜数据库资产清单

> 方法：只读扫描 `server/sql/*.sql`、根目录 `sql/unified_schema.sql`、`server/init-*.js`、`server/migrate-*.js`、services/routes 内嵌 DDL。**未连接数据库、未执行 SQL**。
> 状态口径：migration-defined（迁移 SQL 定义）/ code-defined（js 运行时 DDL）/ schema-ref（统一参考 schema）/ doc-only（仅设计文档，不计入表数）。**生产库实际存在性本任务不核实**。
> 总量：**distinct 约 235 张**（业务表约 220 + 迁移框架/备份类约 15）。项目已知事实：schema 同时由迁移脚本与运行时 `ensureTables()` 双重管理（运行时 DDL 110 条，见 docs/AI智能分析/P3-05 DOMAIN-CODE-MAP 记录）。

## 一、统一主数据专项核查（任务重点）

### 1.1 人员——双主表并存 ⭐

| 表 | 角色 | 核心字段 | 状态 | 证据 |
|---|---|---|---|---|
| `employee` | 新权威主表（v59 注释明确"禁止新增其他人员表"） | employee_code, id_card(加密), name, gender, phone(加密), person_category, employment_relation 等 | migration-defined | server/sql/hse_employee_master_v59_migration.sql:112 |
| `personnel` | legacy 主表，仍被大量业务引用 | name, employee_code, id_card, dept, position, status | schema-ref | sql/unified_schema.sql:135 |
| personnel_insurance | 人员参保（同时保留 employee_id 与 personnel_id 两列=桥接断裂自证） | insurance_type, premium, policy_no | schema-ref | unified_schema.sql:196 |
| over_age_personnel | 超龄人员（引用 personnel_id） | control_type, compliance | schema-ref | unified_schema |
| employee_history | 人事变动留痕 | event_type, before/after, approver_id | migration-defined | v59:203 |
| driver_profile | 驾驶员主档 | — | **doc-only 未落地** | hse-employee-master-data-design*.md:622 |

结论：新链路用 `employee_id`、旧链路（保险/超龄/培训/事故/网格）用 `personnel_id`，无统一桥接 FK。

### 1.2 组织——三表并存

| 表 | 状态 | 证据 |
|---|---|---|
| `departments`（legacy，自引用 parent_id, township 文本列） | schema-ref | sql/unified_schema.sql:20 |
| `department`（v59，v68 已加 is_deprecated 弃用标记） | migration-defined | hse_org_center_v68_migration.sql:193 |
| `hse_org_unit`（v68 新权威，org_code UNIQUE, org_path, level） | migration-defined | hse_org_center_v68_migration.sql:15 |
| `hse_operation_unit`（作业单元，unit_type 含 transfer_station/cleaning_team） | migration-defined | 同上:59 |
| `hse_employee_org`(v59,弃) vs `hse_employee_relation`(v68) 人员-组织关系双轨 | migration-defined | v59:157 / v68:97 |

### 1.3 岗位/作业类型——多表并存

`position`(v59:77，v68/v69 扩展 safety_critical 等)、`hse_position_alias`(v69:15)、`employee_position_mapping_rule`(v69:221)、`position_alias_mapping`(旧，init-position-mapping-optimization.js:48)、`risk_work_type_dict`/`risk_work_unit_dict`(risk_m1_dict.sql:57,76)。

### 1.4 车辆——主表单一、保险三态存储

`vehicles` 主表（unified_schema.sql:51）被 `insuranceShared.js:107` 运行时 ALTER 追加 16 个保险列；`insurance_history`(legacy, unified:95) + `insurance_policies`/`other_insurance`(insuranceShared.js:742,577) 并存；`vehicle_inspection_records`(init-driver-tables.js:29)、`vehicle_check_record`(20260831 迁移)。

### 1.5 无主数据的实体

| 实体 | 现状 |
|---|---|
| 乡镇/街道 | 无主表，仅 departments/personnel/hazards/accidents/grid_areas 的自由文本列 township |
| 转运站 | 无独立主表，建模为 hse_operation_unit.unit_type='transfer_station' + transfer_station_check 检查表 |
| 设备设施 | fire_equipment 仅 doc-only；落地仅 emergency_materials |
| 作业区域 | risk_area_dict / hse_responsibility_area / risk_work_unit_dict 多处并存 |

## 二、全量 distinct 表清单（按域分组，~220 业务表）

> PK 除注明外均为 `id BIGSERIAL`；仅列定义证据位置与关键写入口。

**认证/权限/租户（8）**：users, token_blacklist, login_attempts (sql/auth_schema.sql)；roles, menus, role_menu, user_role (migrate_rbac.sql)；tenants (migrate_multi_tenant.sql)。

**核心安全运营（~18）**：hazards, accidents, accident_persons, violation_records, risk_sources (unified_schema)；hse_events/hse_event_links/hse_event_timeline/hse_risk_factors/hse_control_measures/hse_rectifications/hse_reviews (hse_core_v1_migration.sql)；hazard_attachments/versions (hazardService.js:47,67)，accident_attachments/versions，risk_attachments/versions/risk_hazard_links (riskControlService.js:158+)；transfer_station_check、vehicle_check_record (20260831 迁移×2)。

**网格/巡查（4）**：grid_areas, grid_patrol_logs (unified_schema)；grid_inspection_records (grid_inspection_records.sql:8 + init-dashboard-tables.js:72)；hse_grid_inspection_records (init-dashboard-tables.js:72，与上一张命名近似并存——**疑似重复，待核实**)。

**培训（~19）**：training_records(复数,legacy，三处重复定义 unified:302/init-tables.js:69/migrate-training-assessment.js:65)、training_record(v63 单数，**与前者是两张不同表**)、training_roster、training_plans(两处定义)、training_requirements/attachments/versions、training_signin_sessions、hse_training_ledger_monthly、assessment_records、certificates、personnel_assessment_summary、employee_induction_training、employee_training_status、employee_certificate、employee_safety_profile、position_safety_profile、position_training_requirement；driver_training_record 仅 doc-only。

**保险/超龄（7）**：insurance_history, insurance_policies, other_insurance, personnel_insurance, over_age_personnel, insurance_attachments, insurance_versions。

**应急（8）**：emergency_plans, emergency_supplies (migrate_emergency_objectives.sql)；emergency_materials/teams/team_members/events + attachments (emergencyService.js 运行时)。

**目标职责/责任制（~10）**：hse_target_contracts, hse_safety_committee, hse_responsibility_assessment, hse_objectives_attachments, safety_goals, hse_responsibility_unmatched, hse_safety_committee_activity (objectiveService.js 运行时)；hse_responsibility(+config/area) (hse_base_data_v69)；hse_responsibility_chain (sprint10d2:334)；safety_responsibility_forms, meeting_records (sprint_resp_meeting_tables.sql)。

**风险库（14+9）**：risk_scene, risk_scene_version, risk_library_version, risk_lec_scale (m2)；risk_scene_applicability, risk_library_import_batch/item (m3)；risk_area_dict, risk_work_type_dict, risk_work_unit_dict, risk_level_thresholds, risk_assessment_rule (m1)；project_risk_record (m4)；risk_scene_violation_links (m5)；position_risk_mapping, risk_type_dict, hse_incident_records, hse_driver_inspection_records, management_execution (init-risk-model-cleanup.js 运行时)。

**风险评分/画像/预测（~12）**：risk_score_records, risk_level_records (init-risk-score-tables.js)；risk_score_history, risk_level_config (init-dashboard-tables.js)；hse_risk_score_config, hse_employee_risk_snapshot (sprint61)；hse_risk_prediction, hse_analysis_snapshot (sprint8a)；hse_prediction_model_version (sprint8a1)；hse_sanwei_score_monthly, hse_safety_culture_monthly, hse_untrained_log。

**文档/法规/知识/AI（~18）**：document_categories/tags/files/tag_relation/versions/standard_relation (v2_document_tables.sql)；regulations, hse_regulations, hse_document_library/reviews, hse_clause_relations, hse_match_suggestions, hse_standards_attachments (standardsService 运行时)；regulation_attachments/versions (regulations_v2)；document_ai_analysis；knowledge_sources/documents/chunks/embeddings (ai05)；ai_prompt_registry, ai_generation_records (ai_capability_layer_v1)；ai_generation_reviews (ai11)；hse_business_help (sprint11_1)。

**预警（6）**：hse_warning_rule/record/task/rule_version (sprint7)；hse_warning_scheduler, hse_rectification_evaluation (sprint7c)。

**统计/报告（7）**：hse_statistics_daily/monthly/yearly/dept/person (hse_statistics_v50)；hse_report_templates, hse_reports (hse_report_v52)。

**工作流/检查计划（~12）**：workflows, workflow_instances, workflow_tasks, workflow_history (migrate_workflow)；hse_inspection_plans, hse_risk_objects (hse_chain_v42)；hse_inspection_tasks, hse_tasks, hse_inspection_executions, hse_task_reminders (hse_workflow_v43)；inspection_plan/task/record, hazard_record (v64)；inspection_checklist_template/item (v65)；rectification_task/action, review_record (v66)。

**考核规则/月度考核（~17）**：hse_assessment_rule, hse_rule_detail, hse_rule_condition, hse_assessment_veto_rule, hse_bonus_rule, hse_assessment_score_detail (sprint_assessment_rule_engine_tables.sql)；assessment_rule, assessment_rule_detail (**裸名，hse-dynamic-capability.js:42 运行时建，与 hse_ 前缀双套**)；hse_assessment_standard (_131)，hse_assessment_metric_rule (_132)，hse_assessment_metric_source，hse_assessment_category_limit；hse_assessment_plan(+item)；hse_assessment_cycle/target/metric/score/deduction, hse_deduction_adjustment, hse_assessment_audit_log (sprint10d2)；备份表 ×2（rule_bak_phase2/3，不计）。

**费用/预算（10）**：hse_cost_biz_domain/op_type/invest_category, hse_budget_item, hse_cost_request/commitment/actual/allocation, hse_cost_import_batch (20261023_hse_safety_cost_domain.sql)；hse_safety_budget (**objectiveService 运行时建，与 cost 域口径冲突——已审计 OBJECTIVES_BUDGET_SCHEMA_DRIFT_AUDIT_V1.md**)。

**导入/系统支撑（~15）**：import_logs, field_mapping_config (unified_schema)；import_batch, import_error_log, audit_record (sprint11_1)；file_records (routes/file-records.js:52)；employee_import_batch/pending/mapping_rule(+version), employee_position_mapping_rule (v69)；hse_batch_import_tasks/items (v58)；system_settings (demo-data.js 运行时)；sys_operation_log (**两处定义字段口径冲突**：server/sql/sys_operation_log.sql vs unified_schema.sql:648)；migration_baseline, migration_backup_registry (v68 框架表)；wps_account_employee_map (20260912 桥)；hse_todo_sources；refresh_log (performance)；hse_sanwei_ledger_config, hse_filter_config, hse_dashboard_card_config, hse_material_price, license_demerit_records (各路由运行时)。

**员工关系/花名册（2）**：employee_assignment (sprint5_6:17)，hse_employee_org/hse_employee_relation（见 1.2）。

## 三、跨模块重复/冲突发现（9 项，均含证据）

1. 人员双主表（employee vs personnel，§1.1）。
2. 组织三表 + 关系双轨（§1.2）。
3. 车辆保险三态存储（§1.4）。
4. 培训命名冲突：training_records ≠ training_record（两张真实不同表）。
5. 考核规则双名：hse_assessment_rule vs 裸 assessment_rule。
6. 网格记录双名：grid_inspection_records vs hse_grid_inspection_records（**待核实是否同为一张**）。
7. sys_operation_log 两处定义字段口径冲突。
8. hse_safety_budget 双持有（objectiveService 运行时 vs cost 域迁移）。
9. 乡镇/转运站/设备设施/驾驶员四类实体无权威主表。

## 四、口径声明

- 以上为**代码/迁移定义**清单；"生产库哪些表真实存在、字段是否漂移"本任务不核实。项目既有大量 schema drift 审计（OBJECTIVES_BUDGET_SCHEMA_DRIFT_AUDIT_V1.md、P3-05-03-02 等）可作为后续 DB-INT 节点输入。
- doc-only（未落地）设计：driver_profile、driver_training_record、fire_equipment、hse_ai_log/hse_ai_trace_record/hse_auto_report/hse_ai_model_config 等 AI 运营表。
