# HSE 数据库业务对象清单

> **文档性质**：数据库资产审计报告（只读扫描，未修改任何文件）
> **扫描范围**：F:\deploy\hse-dashboard\sql\ + F:\deploy\hse-dashboard\server\sql\
> **数据库类型**：PostgreSQL 15（已冻结）
> **审计日期**：2026-07-24
> **任务编号**：Sprint10-D-1-3

---

## 一、审计概览

本次审计扫描全部 SQL schema 和迁移文件，提取数据库表结构清单。

| 维度 | 数量 |
|------|------|
| 扫描 SQL 文件 | 29 个 |
| 数据表总数 | 82 张 |
| 视图 | 3 个 |
| 真实外键约束 | 10 处 |
| 逻辑外键（无FK约束） | 30+ 处 |
| 迁移文件覆盖 Sprint | Sprint5.6 ~ Sprint8-A-1 |

---

## 二、数据库表清单（按业务模块分组）

### 模块一：基础数据 / 字典

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| departments | 部门表（旧） | id, name, parent_id, township | parent_id 自引用 | unified_schema.sql |
| department | 组织模型（五级树形） | id, name, parent_id, type | parent_id 自引用 | hse_employee_master_v59 |
| position | 岗位模型 | id, name, code | - | hse_employee_master_v59 |

---

### 模块二：员工主数据

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| personnel | 人员基础信息表（旧） | id, name, employee_code, dept_id | dept_id→departments.id | unified_schema.sql |
| employee | 员工主表（唯一人员表） | id, name, employee_code, id_card | - | hse_employee_master_v59 |
| hse_employee_org | 人员组织关系 | id, employee_id, org_id, is_current | employee_id→employee.id | hse_employee_master_v59 |
| employee_history | 人事变动记录 | id, employee_id, action, change_date | employee_id→employee.id | hse_employee_master_v59 |
| employee_assignment | 员工任职关系 | id, employee_id, org_id, position_id | employee_id→employee.id | 基础数据模型设计 |

---

### 模块三：组织中心

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| hse_org_unit | 管理组织单元（公司/部门/中心/乡镇） | id, name, type, parent_id | parent_id 自引用 | hse_org_center_v68 |
| hse_operation_unit | 生产作业单元（7类） | id, name, type, org_unit_id | org_unit_id→hse_org_unit.id | hse_org_center_v68 |
| hse_employee_relation | 人员-组织-作业单元关系 | id, employee_id, org_id, operation_id | 多向关联 | hse_org_center_v68 |

---

### 模块四：车辆管理

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| vehicles | 车辆基础信息表 | id, plate, vin, model, vehicle_type | - | unified_schema.sql |
| insurance_history | 车辆保险历史表 | id, vehicle_id, plate, insurance_type | vehicle_id→vehicles.id（逻辑） | unified_schema.sql |

---

### 模块五：人员保险

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| personnel_insurance | 人员参保记录表 | id, personnel_id, insurance_type, coverage_amount | personnel_id→personnel.id（逻辑） | unified_schema.sql |
| over_age_personnel | 超龄人员管控表 | id, personnel_id, age, control_type, optimize_status | personnel_id→personnel.id（逻辑） | unified_schema.sql |

---

### 模块六：培训管理

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| training_records | 培训记录表 | id, personnel_id, training_type, training_date, score | personnel_id→personnel.id（逻辑） | unified_schema.sql |
| training_roster | 培训花名册表 | id, name, level, position, personnel_id | personnel_id→personnel.id（逻辑） | unified_schema.sql |

---

### 模块七：隐患排查治理

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| hazards | 隐患排查治理表 | id, no, hazard_date, category, level, status | responsible_dept→departments.name（文本） | unified_schema.sql |
| hse_rectifications | 整改记录表 | id, hazard_id, rectify_type, deadline, status | hazard_id→hazards.id（逻辑） | hse_core_v1_migration |
| hse_reviews | 复查记录表 | id, rectification_id, result, reviewer | rectification_id→hse_rectifications.id（逻辑） | hse_core_v1_migration |

---

### 模块八：事故管理

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| accidents | 事故记录表 | id, no, accident_date, vehicle_id, personnel_id, level | vehicle_id→vehicles.id, personnel_id→personnel.id（逻辑） | unified_schema.sql |
| accident_persons | 事故涉事人员多对多表 | id, accident_id, personnel_id, injury_level | accident_id→accidents.id, personnel_id→personnel.id（逻辑） | unified_schema.sql |

---

### 模块九：网格管理

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| grid_areas | 网格管理人员表 | id, grid_code, grid_level, personnel_id, risk_level | personnel_id→personnel.id（逻辑） | unified_schema.sql |
| grid_patrol_logs | 网格巡查日志表 | id, grid_id, patrol_date, patrol_user | grid_id→grid_areas.id（逻辑） | unified_schema.sql |

---

### 模块十：风险源管控

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| risk_sources | 风险源管控表 | id, source_id, name, type, level, lat, lng | source_file_id→file_records.id（逻辑） | unified_schema.sql |

---

### 模块十一：HSE核心数据层

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| hse_events | 统一安全事件表（7类事件） | id, event_type, event_source, event_date | 按年分区 | hse_core_v1_migration |
| hse_event_links | 事件关联关系表 | id, event_id, linked_type, linked_id | event_id→hse_events.id（逻辑） | hse_core_v1_migration |
| hse_event_timeline | 事件处置时间线 | id, event_id, action, operator | event_id→hse_events.id（逻辑） | hse_core_v1_migration |
| hse_risk_factors | 危险因素表 | id, name, category, risk_level | - | hse_core_v1_migration |
| hse_control_measures | 控制措施表 | id, risk_factor_id, measure_type | risk_factor_id→hse_risk_factors.id（逻辑） | hse_core_v1_migration |

---

### 模块十二：风险画像与评分

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| hse_risk_score_config | 风险评分配置表 | id, dimension, weight, position_code | - | sprint61_risk_profile |
| hse_employee_risk_snapshot | 员工风险评分快照 | id, employee_id, total_score, risk_level, snapshot_date | employee_id→employee.id（逻辑） | sprint61_risk_profile |

---

### 模块十三：预警与整改闭环

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| hse_warning_rule | 预警规则表 | id, code, name, type, threshold, is_active | - | sprint7_warning_center |
| hse_warning_record | 预警记录表 | id, rule_id, warning_level, status, target_id | rule_id→hse_warning_rule.id（逻辑） | sprint7_warning_center |
| hse_warning_task | 预警整改任务表 | id, warning_id, assignee_id, status, deadline | warning_id→hse_warning_record.id（逻辑） | sprint7_warning_center |
| hse_warning_rule_version | 预警规则版本管理表 | id, rule_id, version, definition, effective_date | rule_id→hse_warning_rule.id（逻辑） | sprint7_warning_center |
| hse_warning_scheduler | 预警调度管理表 | id, rule_id, cron_expression, last_run, next_run | rule_id→hse_warning_rule.id（逻辑） | sprint7c_warning_optimization |
| hse_rectification_evaluation | 整改效果评价表 | id, rectification_id, before_score, after_score, effect_rating | rectification_id→hse_rectifications.id（逻辑） | sprint7c_warning_optimization |

---

### 模块十四：智能分析中心

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| hse_analysis_snapshot | 分析快照表 | id, analysis_type, period, data_json, created_at | - | sprint8a_analysis_center |
| hse_risk_prediction | 风险预测表 | id, target_type, target_id, prediction_date, predicted_value, confidence | - | sprint8a_analysis_center |
| hse_prediction_model_version | 预测模型版本管理表 | id, model_name, version, is_active, config_json | - | sprint8a1_model_freeze |

---

### 模块十五：安全数据统计

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| hse_statistics_daily | 每日安全统计表 | id, stat_date, metrics_json | - | hse_statistics_v50 |
| hse_statistics_monthly | 每月安全统计表 | id, stat_month, metrics_json | - | hse_statistics_v50 |
| hse_statistics_yearly | 每年安全统计表 | id, stat_year, metrics_json | - | hse_statistics_v50 |
| hse_statistics_dept | 部门安全统计表 | id, dept_id, stat_date, metrics_json | dept_id→department.id（逻辑） | hse_statistics_v50 |
| hse_statistics_person | 责任人安全统计表 | id, person_id, stat_date, metrics_json | person_id→employee.id（逻辑） | hse_statistics_v50 |

---

### 模块十六：智能报告中心

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| hse_report_templates | 报告模板表 | id, template_code, report_type, content_config | - | hse_report_v52 |
| hse_reports | 报告记录表 | id, template_id, report_type, report_period, report_data, report_html | template_id→hse_report_templates.id（逻辑） | hse_report_v52 |

---

### 模块十七：智能闭环工作流

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| hse_inspection_plans | 检查计划表 | id, plan_name, plan_type, frequency, target_type | - | hse_chain_v42 |
| hse_risk_objects | 风险对象表 | id, object_type, object_id, risk_level | - | hse_chain_v42 |
| hse_inspection_tasks | 检查任务表 | id, plan_id, task_name, assignee_id, status | plan_id→hse_inspection_plans.id（逻辑） | hse_workflow_v43 |
| hse_tasks | HSE统一任务中心表 | id, task_type, business_key, status, assignee_id | - | hse_workflow_v43 |
| hse_inspection_executions | 检查任务执行记录表 | id, task_id, execution_date, result, findings | task_id→hse_inspection_tasks.id（逻辑） | hse_workflow_v43 |
| hse_task_reminders | 任务提醒记录表 | id, task_id, reminder_type, reminder_time | task_id→hse_tasks.id（逻辑） | hse_workflow_v43 |

---

### 模块十八：安全生产标准化评价

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| safety_standard_clauses | 安全生产标准条款主表 | id, clause_code, title, parent_id, level | parent_id 自引用（三级层级） | hse_standard_v54 |
| standard_evaluation_tasks | 标准化评价任务表 | id, task_name, status, ai_started_at, ai_completed_at | - | hse_standard_v54 |
| standard_evaluation_items | 标准化评价明细表 | id, task_id, clause_id, result, ai_findings | task_id→standard_evaluation_tasks.id, clause_id→safety_standard_clauses.id（逻辑） | hse_standard_v54 |

---

### 模块十九：批量导入

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| hse_batch_import_tasks | 批量导入任务主表 | id, task_name, module_type, status, total_rows | - | hse_batch_import_v58 |
| hse_batch_import_items | 批量导入明细表 | id, task_id, row_data, status, error_message | task_id→hse_batch_import_tasks.id（逻辑） | hse_batch_import_v58 |

---

### 模块二十：安全资料中心

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| document_files | 文件主表 | id, title, file_path, category_id, source, status, expire_date | category_id→document_categories.id（逻辑） | v2_document_tables |
| document_categories | 文件分类表 | id, name, parent_id, sort_order | parent_id 自引用 | v2_document_tables |
| document_tags | 文件标签表 | id, name, tag_type（人工/AI） | - | v2_document_tables |
| document_tag_relation | 文件标签关联表 | id, file_id, tag_id | file_id→document_files.id, tag_id→document_tags.id（逻辑） | v2_document_tables |
| document_versions | 文件版本表 | id, file_id, version, file_path | file_id→document_files.id（逻辑） | v2_document_tables |
| document_standard_relation | 资料-标准关联表 | id, file_id, clause_id, match_reason, confirmed_by | file_id→document_files.id, clause_id→safety_standard_clauses.id（逻辑） | v2_document_tables + hse_standard_relation_v55 |

---

### 模块二十一：规章制度

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| regulation_attachments | 规章制度附件表 | id, regulation_id, file_path, file_name | regulation_id→regulations.id（逻辑） | regulations_v2_migration |
| regulation_versions | 规章制度版本履历表 | id, regulation_id, version, effective_date, content | regulation_id→regulations.id（逻辑） | regulations_v2_migration |

---

### 模块二十二：数据导入系统

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| file_records | 文件记录表 | id, module_type, data_period, file_hash, status, import_job_id | 被import_logs引用（FK） | unified_schema.sql（ALTER增强） |
| import_logs | 数据导入日志表 | id, file_record_id, job_id, module_type, target_table, total_rows, status | file_record_id→file_records.id（FK: ON DELETE SET NULL） | unified_schema.sql |
| field_mapping_config | 字段映射配置表 | id, module_type, table_name, column_mapping, conflict_keys | UNIQUE(module_type, table_name) | unified_schema.sql |

---

### 模块二十三：认证系统

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| users | 系统用户表 | id, username, password_hash, real_name, role, is_active | role→roles.code（逻辑） | auth_schema.sql |
| token_blacklist | JWT Token黑名单 | id, token_jti, user_id, expires_at | user_id→users.id（FK: CASCADE） | auth_schema.sql |
| login_attempts | 登录失败尝试记录 | id, username, ip_address, success, attempt_time | username→users.username（文本） | auth_schema.sql |

---

### 模块二十四：RBAC权限体系

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| roles | 角色表 | id, code, name, sort_order, is_active | code唯一 | migrate_rbac.sql |
| menus | 菜单表（树形） | id, parent_id, name, path, component, permission, type | parent_id 自引用 | migrate_rbac.sql |
| role_menu | 角色-菜单关联表 | id, role_id, menu_id | role_id→roles.id（FK: CASCADE）, menu_id→menus.id（FK: CASCADE） | migrate_rbac.sql |
| user_role | 用户-角色关联表 | id, user_id, role_id | user_id→users.id（FK: CASCADE）, role_id→roles.id（FK: CASCADE） | migrate_rbac.sql |

---

### 模块二十五：工作流引擎

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| workflows | 工作流定义表 | id, code, name, definition, is_active | code唯一 | migrate_workflow.sql |
| workflow_instances | 工作流实例表 | id, workflow_id, business_key, status, current_node | workflow_id→workflows.id（FK: CASCADE） | migrate_workflow.sql |
| workflow_tasks | 工作流任务表 | id, instance_id, assignee_id, status, priority | instance_id→workflow_instances.id（FK: CASCADE） | migrate_workflow.sql |
| workflow_history | 工作流历史记录表 | id, instance_id, node_name, action, operator_id | instance_id→workflow_instances.id（FK: CASCADE） | migrate_workflow.sql |

---

### 模块二十六：AI辅助

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| ai_generation_records | AI生成记录主表 | id, user_id, type, sub_type, title, prompt, result, provider, model | user_id→users.id（FK） | ai_tables.sql |

---

### 模块二十七：系统操作日志

| 表名 | 中文名 | 关键字段 | 关联关系 | 来源文件 |
|------|--------|---------|---------|---------|
| sys_operation_log | 系统操作日志表 | id, module, action, target_id, target_type, operator, ip, detail | target_id+target_type 多态关联 | unified_schema.sql + sys_operation_log.sql |

---

## 三、视图清单

| 视图名 | 中文名 | 依赖表 | 来源文件 |
|--------|--------|-------|---------|
| v_vehicle_insurance_expiring | 车辆保险即将到期视图（60天内） | vehicles | unified_schema.sql |
| v_hazard_pending | 隐患未完成视图 | hazards | unified_schema.sql |
| v_personnel_insurance_anomaly | 人员参保异常视图 | over_age_personnel, personnel | unified_schema.sql |

---

## 四、外键约束统计

### 4.1 真实外键约束（10处）

| 子表 | 外键字段 | 父表 | 级联策略 | 来源文件 |
|------|---------|------|---------|---------|
| token_blacklist | user_id | users | CASCADE | auth_schema.sql |
| import_logs | file_record_id | file_records | SET NULL | unified_schema.sql |
| role_menu | role_id | roles | CASCADE | migrate_rbac.sql |
| role_menu | menu_id | menus | CASCADE | migrate_rbac.sql |
| user_role | user_id | users | CASCADE | migrate_rbac.sql |
| user_role | role_id | roles | CASCADE | migrate_rbac.sql |
| workflow_instances | workflow_id | workflows | CASCADE | migrate_workflow.sql |
| workflow_tasks | instance_id | workflow_instances | CASCADE | migrate_workflow.sql |
| workflow_history | instance_id | workflow_instances | CASCADE | migrate_workflow.sql |
| ai_generation_records | user_id | users | - | ai_tables.sql |

### 4.2 逻辑外键（无FK约束，30+处）

业务表之间（如 vehicles↔insurance_history、personnel↔personnel_insurance、accidents↔vehicles、hazards↔hse_rectifications 等）几乎全部为逻辑外键，无 FK 约束，依赖应用层维护数据完整性。

---

## 五、表清单统计汇总

| 业务模块 | 表数 | 主要Sprint版本 |
|---------|------|--------------|
| 基础数据/字典 | 3 | V1.0 + Sprint5.6 |
| 员工主数据 | 5 | Sprint5.6 |
| 组织中心 | 3 | Sprint6.0 |
| 车辆管理 | 2 | V1.0 |
| 人员保险 | 2 | V1.0 |
| 培训管理 | 2 | V1.0 |
| 隐患排查治理 | 3 | V1.0 + v4.2 |
| 事故管理 | 2 | V1.0 |
| 网格管理 | 2 | V1.0 |
| 风险源管控 | 1 | V1.0 |
| HSE核心数据层 | 5 | v4.2 |
| 风险画像与评分 | 2 | Sprint6.1-6.2 |
| 预警与整改闭环 | 6 | Sprint7 |
| 智能分析中心 | 3 | Sprint8-A |
| 安全数据统计 | 5 | v5.0 |
| 智能报告中心 | 2 | v5.2 |
| 智能闭环工作流 | 6 | v4.2-v4.3 |
| 标准化评价 | 3 | V2 Sprint4 |
| 批量导入 | 2 | V2 Sprint5 |
| 安全资料中心 | 6 | V2 Sprint1 |
| 规章制度 | 2 | V2 |
| 数据导入系统 | 3 | V1.0 |
| 认证系统 | 3 | V1.0 |
| RBAC权限 | 4 | V1.0 |
| 工作流引擎 | 4 | V1.0 |
| AI辅助 | 1 | v4.0 |
| 系统操作日志 | 1 | V1.0 |
| **合计** | **82** | |

---

## 六、关键审计发现

### 6.1 双重人员表问题
- `personnel`（旧表，unified_schema.sql）和 `employee`（新表，hse_employee_master_v59）并存
- 旧业务表（training_records/accidents/grid_areas等）引用 personnel.id
- 新HSE表（hse_employee_risk_snapshot等）引用 employee.id
- 存在数据一致性风险，需通过映射或迁移解决

### 6.2 双重组织表问题
- `departments`（旧表）和 `department`（新表）+ `hse_org_unit`（V2.1）并存
- 旧业务表引用 departments，新HSE表引用 hse_org_unit

### 6.3 外键约束缺失
- 业务表之间几乎全部为逻辑外键，无 FK 约束
- 依赖应用层维护数据完整性，存在数据一致性风险

### 6.4 文件重复
- `scripts/import_schema.sql` 与 `sql/unified_schema.sql` 内容完全相同（副本）

### 6.5 缺失文件
- `server/sql/import_schema.sql` 文件不存在（file_records 表 CREATE TABLE 缺失）

---

## 七、审计说明

1. 本文档为**只读审计**产物，未修改任何文件
2. 数据库已正式冻结为 PostgreSQL 15
3. 表结构信息从 SQL 文件的 CREATE TABLE 语句和注释提取
4. 部分表可能通过后续 ALTER TABLE 补充字段，未完全反映在本次审计中
5. 禁止修改 employee、employee_assignment、hse_responsibility 表

---

*文档生成时间：2026-07-24*
*审计任务：Sprint10-D-1-3 HSE系统全量资产审计*
