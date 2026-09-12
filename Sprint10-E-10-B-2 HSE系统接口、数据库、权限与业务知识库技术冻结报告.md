# Sprint10-E-10-B-2 HSE系统接口、数据库、权限与业务知识库技术冻结报告

> **文档性质**：开发前技术冻结
> **版本**：v1.0（冻结版）
> **生成日期**：2026-07-25
> **前置报告**：Sprint10-E-8/E-9/E-10-A/E-10-B-1
> **适用系统**：宁津环卫 HSE 安全管理系统

---

## 一、API接口清单

### 1.1 接口设计统一规范

| 规范项 | 约定 |
|--------|------|
| 路由前缀 | `/api/hse/{module}` |
| 请求方式 | 查询GET、新增POST、编辑PUT、删除DELETE、导入POST、导出GET、审核POST、冻结POST、统计GET |
| 统一响应 | `{ code: 0, message: 'success', data: {...}, total?: number }` |
| 分页参数 | `page`, `pageSize`（默认page=1, pageSize=20） |
| 鉴权 | Header `Authorization: Bearer {token}` |
| 权限校验 | 接口层校验 `func_perm` + 数据范围校验 `data_scope` |
| 接口版本 | URL中不体现，后端内部管理 |

### 1.2 模块1：人员管理（employee）

路由前缀：`/api/hse/employee`

| 接口 | 方法 | 路径 | 参数 | 返回 | 权限 |
|------|------|------|------|------|------|
| 员工列表 | GET | `/list` | page, pageSize, keyword, dept_id, position_id, org_status, is_over_age | { list: EmployeeItem[], total } | 管理员+ |
| 员工详情 | GET | `/:id` | id | EmployeeDetail | 管理员+（本人可看） |
| 新增员工 | POST | `/` | EmployeeForm | { id } | 管理员+ |
| 编辑员工 | PUT | `/:id` | EmployeeForm | { success } | 管理员+ |
| 删除员工 | DELETE | `/:id` | id | { success } | 部门经理+ |
| 花名册导入-上传 | POST | `/import/upload` | file(FormData) | { batch_id, total, valid, errors } | 部门经理+ |
| 花名册导入-预览 | GET | `/import/preview` | batch_id | { list, stats } | 部门经理+ |
| 花名册导入-确认 | POST | `/import/confirm` | batch_id | { success, imported_count } | 部门经理+ |
| 花名册导入-模板 | GET | `/import/template` | - | File(xlsx) | 部门经理+ |
| 员工导出 | GET | `/export` | 同筛选参数 | File(xlsx) | 管理员+ |
| 超龄人员列表 | GET | `/over-age` | page, pageSize, dept_id | { list, total } | 管理员+ |
| 员工选择器 | GET | `/selector` | keyword, dept_id | { list: EmployeeSimple[] } | 所有登录用户 |
| 直属上级查询 | GET | `/:id/supervisor-chain` | id | { supervisors: EmployeeSimple[] } | 管理员+ |
| 人员统计 | GET | `/stats` | dept_id, township_id | { total, by_type, by_status, over_age_count } | 管理员+ |

### 1.3 模块2：现场管理-三违（violations）

路由前缀：`/api/hse/violations`

| 接口 | 方法 | 路径 | 参数 | 返回 | 权限 |
|------|------|------|------|------|------|
| 三违列表 | GET | `/list` | page, pageSize, keyword, violation_type, violation_level, status, start_date, end_date | { list, total } | 管理员+ |
| 三违详情 | GET | `/:id` | id | ViolationDetail | 管理员+ |
| 新增三违 | POST | `/` | ViolationForm | { id } | 管理员+ |
| 编辑三违 | PUT | `/:id` | ViolationForm | { success } | 管理员+ |
| 删除三违 | DELETE | `/:id` | id | { success } | 部门经理+ |
| 三违处理 | POST | `/:id/handle` | handle_measure, rectification_measure, penalty_type | { success } | 管理员+ |
| 三违复查 | POST | `/:id/review` | review_result, review_remark | { success } | 部门经理+ |
| 三违导入 | POST | `/import` | file | { batch_id, stats } | 管理员+ |
| 三违导入-确认 | POST | `/import/confirm` | batch_id | { success } | 管理员+ |
| 三违导出 | GET | `/export` | 同筛选 | File(xlsx) | 管理员+ |
| 三违统计 | GET | `/stats` | start_date, end_date, township_id | { total, by_type, by_level, trend, top_employees } | 管理员+ |
| 传导明细查询 | GET | `/:id/transmission` | id | { deductions: DeductionItem[] } | 管理员+ |

### 1.4 模块3：目标职责-月度考核（assessment-monthly）

路由前缀：`/api/hse/assessment-monthly`

| 接口 | 方法 | 路径 | 参数 | 返回 | 权限 |
|------|------|------|------|------|------|
| 周期列表 | GET | `/cycles` | page, pageSize, year, status | { list, total } | 管理员+ |
| 创建周期 | POST | `/cycles` | year, month, start_time, end_time | { cycle_id } | 部门经理+ |
| 周期详情 | GET | `/cycles/:id` | id | CycleDetail | 管理员+ |
| 周期状态流转 | POST | `/cycles/:id/status` | target_status | { success } | 按权限：审核（部门经理+）、冻结（总经理） |
| 对象列表 | GET | `/cycles/:cycle_id/targets` | page, pageSize, township_id, position, status | { list: AssessmentTarget[], total } | 管理员+ |
| 对象详情 | GET | `/targets/:id` | id | TargetDetail（含扣分明细） | 管理员+ |
| 自动评分 | POST | `/cycles/:cycle_id/auto-score` | cycle_id | { scored_count, total_deductions } | 部门经理+ |
| 新增扣分项 | POST | `/targets/:id/deductions` | rule_code, amount, reason, source_type | { deduction_id } | 部门经理+ |
| 编辑扣分（人工调整） | PUT | `/deductions/:id` | adjusted_amount, adjust_reason | { success, original, adjusted } | 部门经理+ |
| 扣分项审核 | POST | `/deductions/:id/review` | review_result (approve/reject), review_remark | { success } | 部门经理+ |
| 考核规则列表 | GET | `/rules` | source_module, is_active | { list: AssessmentRule[] } | 部门经理+ |
| 考核规则启停 | POST | `/rules/:id/toggle` | is_active | { success } | 总经理 |
| 考核结果导出 | GET | `/cycles/:cycle_id/export` | cycle_id, format(xlsx/pdf) | File | 管理员+ |
| 扣分明细导出 | GET | `/cycles/:cycle_id/deductions/export` | cycle_id | File(xlsx) | 管理员+ |
| 考核排名 | GET | `/cycles/:cycle_id/rank` | cycle_id, scope(all/township) | { ranked_list } | 管理员+ |
| 考核统计 | GET | `/stats` | cycle_id | { overview, grade_distribution, deduction_source, trend } | 管理员+ |

### 1.5 模块4：风险管控（risk-control）

路由前缀：`/api/hse/risk`

| 接口 | 方法 | 路径 | 参数 | 返回 | 权限 |
|------|------|------|------|------|------|
| 风险清单 | GET | `/list` | page, pageSize, keyword, risk_type, risk_level, status, area | { list, total } | 所有登录用户 |
| 风险详情 | GET | `/:id` | id | RiskDetail | 所有登录用户 |
| 新增风险 | POST | `/` | RiskForm | { id } | 管理员+ |
| 编辑风险 | PUT | `/:id` | RiskForm | { success } | 管理员+ |
| 删除风险 | DELETE | `/:id` | id | { success } | 部门经理+ |
| LEC计算 | POST | `/lec-calc` | l_value, e_value, c_value | { d_value, level, color } | 所有登录用户 |
| 风险评审 | POST | `/:id/review` | review_result, review_remark, adjusted_level | { success } | 部门经理+ |
| 风险关闭 | POST | `/:id/close` | close_reason | { success } | 部门经理+ |
| 风险导入 | POST | `/import` | file | { batch_id, stats } | 管理员+ |
| 风险导出 | GET | `/export` | 同筛选 | File(xlsx) | 管理员+ |
| 风险地图 | GET | `/map` | area, level | { points: RiskMapPoint[] } | 所有登录用户 |
| 风险统计 | GET | `/stats` | start_date, end_date | { by_level, by_type, trend, top_areas, top_employees } | 管理员+ |
| 员工风险画像 | GET | `/employee/:employee_id/profile` | employee_id | RiskProfileDetail | 管理员+（本人可看） |
| 风险评分快照 | GET | `/snapshot` | date | { snapshot_list } | 管理员+ |

### 1.6 模块5：隐患治理（hazards）

路由前缀：`/api/hse/hazards`

| 接口 | 方法 | 路径 | 参数 | 返回 | 权限 |
|------|------|------|------|------|------|
| 隐患清单 | GET | `/list` | page, pageSize, keyword, category, level, status, is_overdue, start_date | { list, total } | 所有登录用户 |
| 隐患详情 | GET | `/:id` | id | HazardDetail（含整改/复查记录） | 所有登录用户 |
| 新增隐患 | POST | `/` | HazardForm | { id } | 管理员+ |
| 编辑隐患 | PUT | `/:id` | HazardForm | { success } | 管理员+ |
| 删除隐患 | DELETE | `/:id` | id | { success } | 部门经理+ |
| 整改指派 | POST | `/:id/assign` | responsible_id, deadline, requirement | { success } | 管理员+ |
| 提交整改 | POST | `/:id/rectify` | rectification_measure, rectification_photos, rectification_date | { success } | 责任人 |
| 复查验收 | POST | `/:id/review` | review_result (pass/reject), review_remark, reviewer_id | { success } | 部门经理+ |
| 隐患导入 | POST | `/import` | file | { batch_id, stats } | 管理员+ |
| 隐患导出 | GET | `/export` | 同筛选 | File(xlsx) | 管理员+ |
| 超期清单 | GET | `/overdue` | page, pageSize, township_id | { list, total } | 管理员+ |
| 隐患统计 | GET | `/stats` | start_date, end_date | { total, by_status, by_level, by_category, close_rate, overdue_count, trend } | 管理员+ |
| 整改时间线 | GET | `/:id/timeline` | id | { timeline: TimelineItem[] } | 所有登录用户 |

### 1.7 模块6：培训考核（training）

路由前缀：`/api/hse/training`

| 接口 | 方法 | 路径 | 参数 | 返回 | 权限 |
|------|------|------|------|------|------|
| 培训计划列表 | GET | `/plans` | page, pageSize, year, type, status | { list, total } | 管理员+ |
| 计划详情 | GET | `/plans/:id` | id | PlanDetail | 管理员+ |
| 新增计划 | POST | `/plans` | PlanForm | { id } | 管理员+ |
| 编辑计划 | PUT | `/plans/:id` | PlanForm | { success } | 管理员+ |
| 计划审批 | POST | `/plans/:id/approve` | approve_result, remark | { success } | 部门经理+ |
| 培训记录列表 | GET | `/records` | page, pageSize, plan_id, type, start_date | { list, total } | 管理员+ |
| 登记培训记录 | POST | `/records` | TrainingRecordForm（含参训人员列表） | { id } | 管理员+ |
| 培训导入 | POST | `/import` | file | { batch_id, stats } | 管理员+ |
| 培训导出 | GET | `/export` | 同筛选 | File(xlsx) | 管理员+ |
| 考试管理 | GET | `/exams` | page, pageSize, training_id | { list, total } | 管理员+ |
| 录入成绩 | POST | `/exams/:id/scores` | scores: {employee_id, score}[] | { success } | 管理员+ |
| 证书列表 | GET | `/certificates` | page, pageSize, employee_id, cert_type, expire_status | { list, total } | 管理员+（本人可看自己） |
| 证书登记 | POST | `/certificates` | CertificateForm | { id } | 管理员+ |
| 证书到期提醒 | GET | `/certificates/expiring` | days(30/60/90) | { list: ExpiringCert[] } | 管理员+ |
| 培训统计 | GET | `/stats` | year | { plan_rate, coverage_rate, pass_rate, by_type, by_month } | 管理员+ |

### 1.8 模块7：安全总览（overview）

路由前缀：`/api/hse/overview`

| 接口 | 方法 | 路径 | 参数 | 返回 | 权限 |
|------|------|------|------|------|------|
| 驾驶舱-综合态势 | GET | `/cockpit/situation` | year, org_scope_id, period(day/week/month/year) | { kpis: KpiItem[] } | 所有登录用户（按范围） |
| 驾驶舱-风险指标 | GET | `/cockpit/risk` | 同上 | { level_distribution, trend, map_data, top_employees, by_type } | 所有登录用户 |
| 驾驶舱-隐患指标 | GET | `/cockpit/hazard` | 同上 | { total, status_distribution, close_rate_trend, overdue_list, by_category } | 所有登录用户 |
| 驾驶舱-三违指标 | GET | `/cockpit/violation` | 同上 | { trend, top_employees, type_distribution, level_distribution, transmission_stats } | 所有登录用户 |
| 驾驶舱-考核指标 | GET | `/cockpit/assessment` | 同上 | { overview, deduction_stats, rank, grade_distribution } | 管理员+ |
| 专项分析-驾驶员风险 | GET | `/analysis/driver-risk` | year, scope | { profiles, five_dimension_radar, trend } | 管理员+ |
| 专项分析-事故分析 | GET | `/analysis/accident` | year, scope | { by_type, by_level, trend, map } | 管理员+ |
| 专项分析-考核分析 | GET | `/analysis/assessment` | cycle_id, scope | { overview, deduction_source_analysis, rank, grade_distribution, trend } | 管理员+ |
| 预警列表 | GET | `/warnings` | page, pageSize, level, status, module_type | { list, total } | 管理员+ |
| 预警处置 | POST | `/warnings/:id/handle` | handle_type, handle_remark, create_hazard_flag | { success } | 管理员+ |
| 告警列表 | GET | `/alerts` | page, pageSize, status | { list, total } | 管理员+ |
| 通知列表 | GET | `/notifications` | page, pageSize, is_read | { list, total, unread_count } | 所有登录用户 |
| 标记已读 | POST | `/notifications/:id/read` | id | { success } | 所有登录用户 |

### 1.9 模块8：制度标准（regulations）

路由前缀：`/api/hse/regulations`

| 接口 | 方法 | 路径 | 参数 | 返回 | 权限 |
|------|------|------|------|------|------|
| 制度列表 | GET | `/list` | page, pageSize, keyword, category, doc_type, status | { list, total } | 所有登录用户（已发布） |
| 制度详情 | GET | `/:id` | id | RegulationDetail | 所有登录用户 |
| 新增制度 | POST | `/` | RegulationForm | { id } | 管理员+ |
| 编辑制度 | PUT | `/:id` | RegulationForm | { success } | 管理员+ |
| 提交审核 | POST | `/:id/submit` | id | { success } | 管理员+ |
| 审核发布 | POST | `/:id/approve` | approve_result, remark, is_publish | { success } | 部门经理+ |
| 新版本 | POST | `/:id/new-version` | new_version, change_log | { new_id } | 管理员+ |
| 条款列表 | GET | `/clauses` | page, pageSize, regulation_id, keyword | { list, total } | 所有登录用户 |
| 条款录入 | POST | `/clauses` | ClauseForm | { id } | 管理员+ |
| 条款关联匹配 | POST | `/clauses/:id/match` | business_type (risk/hazard/violation), business_ids | { success } | 管理员+ |
| 文件库列表 | GET | `/files` | page, pageSize, category | { list, total } | 所有登录用户 |
| 文件上传 | POST | `/files/upload` | file, category, tags | { file_id } | 管理员+ |
| 制度导入 | POST | `/import` | file | { batch_id, stats } | 管理员+ |
| 制度导出 | GET | `/export` | 同筛选 | File(xlsx) | 管理员+ |

### 1.10 模块9：应急管理（emergency）

路由前缀：`/api/hse/emergency`

| 接口 | 方法 | 路径 | 参数 | 返回 | 权限 |
|------|------|------|------|------|------|
| 预案列表 | GET | `/plans` | page, pageSize, type, level, status | { list, total } | 所有登录用户（已发布） |
| 预案详情 | GET | `/plans/:id` | id | PlanDetail（含版本、演练） | 所有登录用户 |
| 新增预案 | POST | `/plans` | EmergencyPlanForm | { id } | 管理员+ |
| 预案审核发布 | POST | `/plans/:id/approve` | approve_result, is_publish | { success } | 部门经理+ |
| 演练列表 | GET | `/drills` | page, pageSize, plan_id, year, status | { list, total } | 管理员+ |
| 新增演练 | POST | `/drills` | DrillForm | { id } | 管理员+ |
| 演练评估 | POST | `/drills/:id/evaluate` | result, improved_measures, evaluation_report | { success } | 部门经理+ |
| 事故列表 | GET | `/accidents` | page, pageSize, level, type, status, start_date | { list, total } | 管理员+ |
| 事故详情 | GET | `/accidents/:id` | id | AccidentDetail（含调查、处理） | 管理员+ |
| 事故上报 | POST | `/accidents` | AccidentForm | { id } | 管理员+ |
| 事故调查 | POST | `/accidents/:id/investigate` | investigation_report, causes, responsibility | { success } | 部门经理+ |
| 事故处理 | POST | `/accidents/:id/handle` | handling_measures, penalties, rectification | { success } | 部门经理+ |
| 事故结案 | POST | `/accidents/:id/close` | close_report | { success } | 总经理 |
| 事故导入 | POST | `/accidents/import` | file | { batch_id, stats } | 管理员+ |
| 应急统计 | GET | `/stats` | year | { plans_count, drills_count, accidents_count, by_type, trend } | 管理员+ |

### 1.11 模块10：保险管理（insurance）

路由前缀：`/api/hse/insurance`

| 接口 | 方法 | 路径 | 参数 | 返回 | 权限 |
|------|------|------|------|------|------|
| 车辆保险列表 | GET | `/vehicle` | page, pageSize, plate_no, insurance_type, expire_status | { list, total } | 管理员+ |
| 新增车辆保险 | POST | `/vehicle` | VehicleInsuranceForm | { id } | 管理员+ |
| 编辑车辆保险 | PUT | `/vehicle/:id` | VehicleInsuranceForm | { success } | 管理员+ |
| 批量续保 | POST | `/vehicle/batch-renew` | ids: [], start_date, end_date, premium | { success, renewed_count } | 管理员+ |
| 车辆保险导入 | POST | `/vehicle/import` | file | { batch_id, stats } | 管理员+ |
| 车辆保险导出 | GET | `/vehicle/export` | 同筛选 | File(xlsx) | 管理员+ |
| 人员保险列表 | GET | `/personnel` | page, pageSize, employee_name, insurance_type, expire_status, high_risk_category | { list, total } | 管理员+ |
| 新增人员保险 | POST | `/personnel` | PersonnelInsuranceForm | { id } | 管理员+ |
| 编辑人员保险 | PUT | `/personnel/:id` | PersonnelInsuranceForm | { success } | 管理员+ |
| 批量续保（人员） | POST | `/personnel/batch-renew` | ids: [], start_date, end_date, premium | { success, renewed_count } | 管理员+ |
| 到期提醒列表 | GET | `/expiring` | type(vehicle/personnel/all), days(30/60/90) | { list, total } | 管理员+ |
| 保险导入 | POST | `/personnel/import` | file | { batch_id, stats } | 管理员+ |
| 保险统计 | GET | `/stats` | year | { vehicle_count, personnel_count, by_type, expire_stats, premium_total, coverage_rate } | 管理员+ |

### 1.12 模块11：系统管理（system）

路由前缀：`/api/hse/system`

| 接口 | 方法 | 路径 | 参数 | 返回 | 权限 |
|------|------|------|------|------|------|
| 用户列表 | GET | `/users` | page, pageSize, keyword, role_id, dept_id, status | { list, total } | 系统管理员 |
| 新增用户 | POST | `/users` | UserForm | { id } | 系统管理员 |
| 编辑用户 | PUT | `/users/:id` | UserForm | { success } | 系统管理员 |
| 重置密码 | POST | `/users/:id/reset-password` | new_password | { success } | 系统管理员 |
| 启用/停用 | POST | `/users/:id/toggle-status` | status | { success } | 系统管理员 |
| 角色列表 | GET | `/roles` | page, pageSize, keyword | { list, total } | 系统管理员 |
| 新增角色 | POST | `/roles` | role_code, role_name, description | { id } | 系统管理员+总经理 |
| 角色权限配置 | POST | `/roles/:id/permissions` | menu_perms: [], button_perms: [], data_scope_rule | { success } | 系统管理员+总经理 |
| 权限树 | GET | `/permissions/tree` | - | { tree: PermissionNode[] } | 系统管理员 |
| 组织列表 | GET | `/org/list` | parent_id | { tree: OrgNode[] } | 管理员+ |
| 新增组织 | POST | `/org` | OrgForm | { id } | 系统管理员+总经理 |
| 岗位列表 | GET | `/positions` | page, pageSize, keyword, is_assessment_target | { list, total } | 管理员+ |
| 岗位配置 | POST | `/positions` | PositionForm | { id } | 系统管理员+总经理 |
| 操作日志 | GET | `/audit-logs` | page, pageSize, operator, module, action, start_date | { list, total } | 系统管理员+总经理 |
| 操作日志导出 | GET | `/audit-logs/export` | 同筛选 | File(xlsx) | 系统管理员+总经理 |
| 字典项列表 | GET | `/dict/:dict_code` | dict_code | { items: DictItem[] } | 所有登录用户 |
| 业务帮助 | GET | `/help/:menu_code` | menu_code | { help: BusinessHelp } | 所有登录用户 |

---

## 二、数据库最终模型

### 2.1 数据表分类总览

| 类别 | 表名 | 核心用途 | 状态 |
|------|------|---------|------|
| **基础表** | organization | 五级组织架构树 | ✅ 冻结 |
| | position | 岗位配置（含考核对象标记） | ✅ 冻结 |
| | employee | 员工档案（人员数据唯一来源） | ✅ 冻结 |
| **业务表** | risk_sources | 风险点清单（LEC评价） | ✅ 冻结 |
| | hse_employee_risk_snapshot | 员工风险评分每日快照 | ✅ 冻结 |
| | hazards | 隐患主表 | ✅ 冻结 |
| | hse_rectifications | 整改/复查记录表 | ✅ 冻结 |
| | violations | 三违记录表 | ✅ 冻结 |
| | training_plans | 培训计划表 | ✅ 冻结 |
| | training_records | 培训记录表 | ✅ 冻结 |
| | certificates | 员工证书表 | ✅ 冻结 |
| | assessment_cycles | 考核周期表 | ✅ 冻结 |
| | assessment_targets | 考核对象表 | ✅ 冻结 |
| | assessment_deductions | 扣分明细表 | ✅ 冻结 |
| | regulations | 制度标准主表 | ✅ 冻结 |
| | regulation_clauses | 标准条款表 | ✅ 冻结 |
| | emergency_plans | 应急预案表 | ✅ 冻结 |
| | emergency_drills | 应急演练表 | ✅ 冻结 |
| | accidents | 事故记录表 | ✅ 冻结 |
| | vehicle_insurance | 车辆保险表 | ✅ 冻结 |
| | personnel_insurance | 人员保险表 | ✅ 冻结 |
| **规则表** | assessment_rule | 考核动态规则配置表 | ✅ 冻结 |
| **支撑表** | import_batch | 批量导入批次表 | ✅ 冻结 |
| | import_error_log | 导入错误日志表 | ✅ 冻结 |
| | audit_record | 审核记录表 | ✅ 冻结 |
| | operation_log | 操作审计日志表 | ✅ 冻结 |
| | version_snapshot | 版本快照表 | ✅ 冻结 |
| | hse_business_help | 业务知识库帮助表 | ✅ 冻结（新增） |
| | sys_dict | 系统字典表 | ✅ 冻结 |
| | sys_notifications | 通知消息表 | ✅ 冻结 |
| **统计表** | hse_statistics_daily | 每日业务统计表 | ✅ 冻结 |
| | hse_statistics_monthly | 每月业务统计表 | ✅ 冻结 |
| | hse_statistics_yearly | 每年业务统计表 | ✅ 冻结 |

### 2.2 核心表结构

#### 2.2.1 employee（员工主表）

```sql
CREATE TABLE employee (
    id              BIGSERIAL PRIMARY KEY,
    employee_no     VARCHAR(64) UNIQUE NOT NULL,        -- 员工编号
    name            VARCHAR(64) NOT NULL,                 -- 姓名
    id_card         VARCHAR(18) UNIQUE NOT NULL,          -- 身份证号
    id_card_hash    VARCHAR(64) NOT NULL,                 -- 身份证SHA256+盐
    gender          VARCHAR(10),                           -- 男/女（身份证推算）
    birth_date      DATE,                                   -- 出生日期（身份证推算）
    age             INT,                                    -- 年龄（自动计算）
    phone           VARCHAR(20),                            -- 联系电话
    phone_hash      VARCHAR(64),                            -- 电话哈希
    org_unit_id     BIGINT NOT NULL,                       -- 组织ID
    position_id     BIGINT NOT NULL,                        -- 岗位ID
    direct_manager_id BIGINT,                               -- 直属上级ID（责任传导用）
    source_department VARCHAR(128),                        -- 源部门（导入用）
    source_position  VARCHAR(128),                         -- 源职位（导入用）
    is_driver       BOOLEAN DEFAULT FALSE,                  -- 是否驾驶员
    license_type    VARCHAR(10),                            -- 驾驶证类型
    is_over_age     BOOLEAN DEFAULT FALSE,                  -- 是否超龄（age>60自动标记）
    hire_date       DATE,                                    -- 入职日期
    org_status      VARCHAR(20) DEFAULT '在职',            -- 在职/离职/退休/返聘
    employee_source VARCHAR(20) DEFAULT 'manual_create',  -- 来源标记
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    is_deleted      BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_employee_org ON employee(org_unit_id);
CREATE INDEX idx_employee_status ON employee(org_status);
CREATE INDEX idx_employee_supervisor ON employee(direct_manager_id);
```

#### 2.2.2 assessment_cycles / assessment_targets / assessment_deductions

```sql
-- 考核周期
CREATE TABLE assessment_cycles (
    id                  BIGSERIAL PRIMARY KEY,
    cycle_code          VARCHAR(32) UNIQUE NOT NULL,      -- A-2026-07
    cycle_name          VARCHAR(64) NOT NULL,              -- 2026年7月
    assessment_year     INT NOT NULL,
    assessment_month    INT NOT NULL,
    start_time          TIMESTAMPTZ NOT NULL,
    end_time            TIMESTAMPTZ NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'not_started',
    target_count        INT DEFAULT 0,
    scored_count        INT DEFAULT 0,
    reviewed_count      INT DEFAULT 0,
    frozen_count        INT DEFAULT 0,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    remark              TEXT
);

-- 考核对象
CREATE TABLE assessment_targets (
    id                  BIGSERIAL PRIMARY KEY,
    cycle_id            BIGINT NOT NULL REFERENCES assessment_cycles(id),
    employee_id         BIGINT NOT NULL REFERENCES employee(id),
    employee_code       VARCHAR(64),
    employee_name       VARCHAR(64),
    position            VARCHAR(64),
    township            VARCHAR(64),
    department          VARCHAR(64),
    status              VARCHAR(20) DEFAULT 'pending',     -- pending/scored/reviewed/frozen
    review_status       VARCHAR(20) DEFAULT 'pending',     -- pending/approved/rejected
    score_base          DECIMAL(5,1) DEFAULT 100,
    score_auto          DECIMAL(5,1) DEFAULT 0,            -- 自动扣分（负值）
    score_manual        DECIMAL(5,1) DEFAULT 0,            -- 人工调整（可正可负）
    score_total         DECIMAL(5,1) DEFAULT 100,          -- = base + auto + manual
    grade               VARCHAR(10),                          -- 优秀/良好/合格/不合格
    rank_township       INT,
    rank_all            INT,
    current_version     INT DEFAULT 1,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 扣分明细
CREATE TABLE assessment_deductions (
    id                  BIGSERIAL PRIMARY KEY,
    target_id           BIGINT NOT NULL REFERENCES assessment_targets(id),
    cycle_id            BIGINT NOT NULL REFERENCES assessment_cycles(id),
    rule_code           VARCHAR(32),                          -- 规则编码
    rule_name           VARCHAR(128),                         -- 规则名称
    source_module       VARCHAR(32),                          -- 来源模块
    source_id           BIGINT,                                -- 来源记录ID
    original_amount     DECIMAL(5,1),                         -- 原始扣分
    adjusted_amount     DECIMAL(5,1),                         -- 调整后扣分
    is_adjusted         BOOLEAN DEFAULT FALSE,                 -- 是否人工调整
    adjust_reason       TEXT,                                  -- 调整原因
    adjust_by           BIGINT,                                -- 调整人
    adjust_at           TIMESTAMPTZ,                           -- 调整时间
    is_transmission     BOOLEAN DEFAULT FALSE,                 -- 是否传导扣分
    transmission_from   BIGINT,                                -- 传导来源员工ID
    review_status       VARCHAR(20) DEFAULT 'pending',
    reviewed_by         BIGINT,
    reviewed_at         TIMESTAMPTZ,
    review_remark       TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2.2.3 assessment_rule（考核动态规则配置表）

```sql
CREATE TABLE assessment_rule (
    id                  BIGSERIAL PRIMARY KEY,
    rule_code           VARCHAR(32) UNIQUE NOT NULL,          -- VIOLATION_001
    rule_name           VARCHAR(128) NOT NULL,                 -- 三违个人扣分
    source_module       VARCHAR(32) NOT NULL,                  -- violations/training/hazards/...
    trigger_condition   JSONB NOT NULL,                         -- 触发条件表达式
    deduction_per_unit  DECIMAL(5,1) NOT NULL,                 -- 每单位扣分值
    max_deduction       DECIMAL(5,1),                           -- 最大扣分
    calculation_formula VARCHAR(255),                           -- 计算公式说明
    target_posts        JSONB,                                   -- 适用岗位（为空=全部）
    target_scope        VARCHAR(20) DEFAULT 'all',              -- all/township/department
    effective_start     DATE,
    effective_end       DATE,
    is_active           BOOLEAN DEFAULT TRUE,
    priority            INT DEFAULT 100,
    version             VARCHAR(20) DEFAULT 'v1.0',
    created_by          BIGINT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    remark              TEXT
);
-- 预设6条规则
INSERT INTO assessment_rule (rule_code, rule_name, source_module, trigger_condition, deduction_per_unit, target_scope) VALUES
('VIOLATION_001', '三违个人扣分', 'violations', '{"field":"status","op":"eq","value":"completed"}', -5, 'all'),
('VIOLATION_002', '三违责任传导扣分', 'violations', '{"field":"is_transmission","op":"eq","value":true}', -5, 'all'),
('TRAINING_001', '培训未完成扣分', 'training', '{"field":"completion_status","op":"eq","value":"incomplete"}', -2, 'all'),
('HAZARD_001', '隐患超期扣分', 'hazards', '{"field":"is_overdue","op":"eq","value":true}', -3, 'all'),
('INSPECT_001', '检查不合格扣分', 'inspection', '{"field":"result","op":"eq","value":"failed"}', -2, 'all'),
('RESPBOOK_001', '责任书缺失扣分', 'responsibility', '{"field":"signed_status","op":"eq","value":"unsigned"}', -20, 'all');
```

#### 2.2.4 hse_business_help（业务知识库）

```sql
CREATE TABLE hse_business_help (
    id                  BIGSERIAL PRIMARY KEY,
    menu_code           VARCHAR(64) UNIQUE NOT NULL,          -- 菜单编码（唯一）
    module_type         VARCHAR(32),                            -- 所属一级模块
    title               VARCHAR(128) NOT NULL,                  -- 帮助标题
    -- 一级菜单内容（4项）
    module_positioning  TEXT,                                    -- 模块定位
    management_goal     TEXT,                                    -- 管理目标
    data_source_summary TEXT,                                    -- 数据来源总览
    data_output_summary TEXT,                                    -- 数据输出总览
    -- 二级菜单内容（8项标准）
    function_description    TEXT,                                -- 功能说明
    usage_instruction     TEXT,                                  -- 使用方式
    field_description     TEXT,                                  -- 字段说明（JSON格式或表格HTML）
    calculate_rule        TEXT,                                  -- 计算逻辑
    generate_rule         TEXT,                                  -- 自动生成规则
    data_source           TEXT,                                  -- 数据来源
    data_destination      TEXT,                                  -- 数据去向
    permission_rule       TEXT,                                  -- 权限说明
    -- 管理字段
    version               VARCHAR(20) DEFAULT 'v1.0',
    status                VARCHAR(20) DEFAULT 'active',         -- active/inactive
    created_by            BIGINT,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_help_module ON hse_business_help(module_type);
CREATE INDEX idx_help_status ON hse_business_help(status);
```

---

## 三、权限模型冻结

### 3.1 权限模型三维度

```
功能权限（9项）        数据权限（3层）        组织层级（5级）
├── 查看 (read)        ├── 本人             L1 公司总经理
├── 新增 (create)      ├── 本组织           L2 部门/中心经理
├── 编辑 (update)      └── 管理范围         L3 乡镇作业中心经理
├── 删除 (delete)                                  L4 管理员
├── 审核 (audit)                                    L5 员工
├── 导入 (import)
├── 导出 (export)
├── 配置 (config)
└── 冻结 (freeze)
```

### 3.2 角色-功能权限矩阵（完整）

| 模块 | 功能 | 总经理L1 | 部门经理L2 | 乡镇经理L3 | 管理员L4 | 员工L5 |
|------|------|----------|-----------|-----------|---------|--------|
| **安全总览** | 查看（全范围） | ✅ | ❌ | ❌ | ❌ | ❌ |
| | 查看（本部门） | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 查看（本乡镇） | ✅ | ✅ | ✅ | ❌ | ❌ |
| | 查看（本人） | ✅ | ✅ | ✅ | ✅ | ✅ |
| | 导出报表 | ✅ | ✅ | ✅ | ✅ | ❌ |
| **人员管理** | 查看 | ✅ | ✅ | ✅ | ✅ | 仅本人 |
| | 新增/编辑 | ✅ | ✅ | ✅ | ✅ | ❌ |
| | 删除 | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 导入 | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 导出 | ✅ | ✅ | ✅ | ✅ | ❌ |
| | 配置（组织/岗位） | ✅ | ❌ | ❌ | ❌ | ❌ |
| **现场管理（三违）** | 查看 | ✅ | ✅ | ✅ | ✅ | 仅本人 |
| | 新增/编辑 | ✅ | ✅ | ✅ | ✅ | ❌ |
| | 删除 | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 复查 | ✅ | ✅ | ✅ | ❌ | ❌ |
| | 导入/导出 | ✅ | ✅ | ✅ | ✅ | ❌ |
| **隐患治理** | 查看 | ✅ | ✅ | ✅ | ✅ | 仅本人 |
| | 登记/整改 | ✅ | ✅ | ✅ | ✅ | ❌ |
| | 复查验收 | ✅ | ✅ | ✅ | ❌ | ❌ |
| | 关闭审批 | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 导入/导出 | ✅ | ✅ | ✅ | ✅ | ❌ |
| **风险管控** | 查看 | ✅ | ✅ | ✅ | ✅ | 仅本人 |
| | 新增/编辑 | ✅ | ✅ | ✅ | ✅ | ❌ |
| | 评审（重大） | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 关闭 | ✅ | ✅ | ✅ | ❌ | ❌ |
| | 导入/导出 | ✅ | ✅ | ✅ | ✅ | ❌ |
| **月度考核** | 查看 | ✅ | ✅ | ✅ | ✅ | 仅本人 |
| | 自动评分 | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 人工调整 | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 审核 | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 冻结 | ✅ | ❌ | ❌ | ❌ | ❌ |
| | 规则配置 | ✅ | ❌ | ❌ | ❌ | ❌ |
| | 导入/导出 | ✅ | ✅ | ✅ | ✅ | ❌ |
| **培训考核** | 查看 | ✅ | ✅ | ✅ | ✅ | 仅本人 |
| | 新增/编辑 | ✅ | ✅ | ✅ | ✅ | ❌ |
| | 计划审批 | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 导入/导出 | ✅ | ✅ | ✅ | ✅ | ❌ |
| **制度标准** | 查看（已发布） | ✅ | ✅ | ✅ | ✅ | ✅ |
| | 新增/编辑 | ✅ | ✅ | ❌ | ✅ | ❌ |
| | 审核发布 | ✅ | ✅ | ❌ | ❌ | ❌ |
| **应急管理** | 查看（已发布） | ✅ | ✅ | ✅ | ✅ | ❌ |
| | 新增/编辑 | ✅ | ✅ | ✅ | ✅ | ❌ |
| | 审核/审批 | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 事故结案 | ✅ | ❌ | ❌ | ❌ | ❌ |
| **保险管理** | 查看 | ✅ | ✅ | ✅ | ✅ | 仅本人 |
| | 新增/编辑 | ✅ | ✅ | ✅ | ✅ | ❌ |
| | 批量续保 | ✅ | ✅ | ✅ | ✅ | ❌ |
| | 导入/导出 | ✅ | ✅ | ✅ | ✅ | ❌ |
| **系统管理** | 所有操作 | ✅（仅系统管理员） | ❌ | ❌ | ❌ | ❌ |

> 数据范围叠加：所有"查看/编辑"均同时应用组织层级的数据范围过滤（L1全公司、L2本部门、L3本乡镇、L4管理范围、L5仅本人）。

### 3.3 数据范围规则

```sql
-- 各角色的WHERE条件自动追加
L1 总经理：    -- 无过滤（全公司）
L2 部门经理：  WHERE org_path LIKE 'L1/L2/%'（本部门及子节点）
L3 乡镇经理：  WHERE org_path LIKE 'L1/L2/L3/%'（本乡镇及子节点）
L4 管理员：    WHERE org_path = 'L1/L2/L3/L4/%'（本管理范围）
L5 员工：      WHERE employee_id = 当前用户ID（仅本人）
```

---

## 四、页面-接口-数据库映射关系

### 4.1 核心模块映射总览

| 页面（路由） | 主要接口 | 主要数据表 |
|-------------|---------|-----------|
| `/personnel/employee-list` | employee/list, /stats, /export | employee, organization, position |
| `/personnel/employee-import` | employee/import/* | employee, import_batch, import_error_log |
| `/site/violations` | violations/list, /stats, /export | violations, employee, assessment_deductions |
| `/hazards/hazard-list` | hazards/list, /stats, /timeline | hazards, hse_rectifications, employee |
| `/risk-control/risk-list` | risk/list, /lec-calc, /map, /stats | risk_sources, hse_employee_risk_snapshot |
| `/objectives/monthly-assessment` | assessment-monthly/cycles, /targets, /rules, /auto-score | assessment_cycles, assessment_targets, assessment_deductions, assessment_rule |
| `/training/plans` + `/training/records` | training/plans, /records, /stats | training_plans, training_records, certificates |
| `/regulations` + `/regulations/clauses` | regulations/list, /clauses, /files | regulations, regulation_clauses, regulation_files |
| `/emergency/plans` + `/accidents` | emergency/* | emergency_plans, emergency_drills, accidents |
| `/insurance/vehicle` + `/insurance/personnel` | insurance/* | vehicle_insurance, personnel_insurance |
| `/overview/cockpit` | overview/cockpit/* | hse_statistics_daily/monthly/yearly, 各业务表COUNT |
| `/system/*` | system/* | sys_user, sys_role, sys_permission, sys_operation_log |

### 4.2 关键数据流路径

**月度考核数据流**：
```
三违(violations) ──┐
培训(training_records) ─┤
隐患(hazards) ────────┼──> assessment_rule匹配 ──> assessment_deductions
现场检查(inspection) ──┤                                     │
责任书(rbooks) ───────┘                                     ▼
                                                      assessment_targets
                                                      (score_total = 100 + Σdeductions)
                                                               │
                                                               ▼
                                                      安全总览-考核指标区域
```

**三违传导数据流**：
```
三违登记(violations)
    │
    ├── violator_id → 本人扣5分
    └── direct_manager_id（查employee表） → 直属上级传导5分
              │
              ▼
    assessment_deductions（两条记录，is_transmission标记）
```

---

## 五、业务知识库实现方案

### 5.1 帮助入口设计

```
前端交互：
┌─────────────────────────────────────────┐
│ 页面标题                          [? 帮助] │  ← 每个页面右上角统一帮助按钮
└─────────────────────────────────────────┘
点击后弹出帮助抽屉（Drawer）：
┌──────────────────────────────────────────┐
│ 「风险管控 - 风险清单」帮助                │
├──────────────────────────────────────────┤
│ 1. 功能说明                                │
│ 2. 使用方式                                │
│ 3. 字段说明（可展开表格）                    │
│ 4. 计算逻辑（LEC公式展示）                  │
│ 5. 自动生成规则                             │
│ 6. 数据来源                                │
│ 7. 数据去向                                │
│ 8. 权限说明                                │
└──────────────────────────────────────────┘
```

### 5.2 前端实现要点

1. **统一帮助组件**：`<BusinessHelp menuCode="risk-list" />`，接收菜单编码
2. **调用接口**：`GET /api/hse/system/help/:menu_code`
3. **缓存策略**：帮助内容变更不频繁，前端localStorage缓存24小时
4. **渲染方式**：content字段支持Markdown渲染（使用marked库）
5. **一级菜单帮助**：点击一级菜单标题旁的帮助图标，展示模块定位/管理目标等4项

### 5.3 数据初始化

将《Sprint10-E-10-B-1》报告中的全部二级菜单8项标准说明，通过初始化SQL写入`hse_business_help`表。

---

## 六、开发约束

### 6.1 严格执行

| 约束项 | 说明 |
|--------|------|
| 左侧菜单 | 禁止修改，严格按照已冻结的菜单结构 |
| 主题 | 禁止修改，使用现有Vben默认主题 |
| Vben架构 | 禁止更换，在现有架构下开发 |
| 自定义组件 | 禁止新增独立的自定义组件库，使用Vben内置组件 |
| 数据模型 | 以本报告的数据库模型为准，核心字段禁止变更 |
| 接口命名 | 以本报告的接口清单为准，统一前缀和命名规范 |
| 权限校验 | 所有接口必须经过func_perm + data_scope两层校验 |

### 6.2 开发顺序建议（技术依赖）

```
P0 基础层：
  1. 数据库表创建（所有20+张表）
  2. 基础数据初始化（组织、岗位、评估规则、帮助内容）
  3. 权限系统联调（5角色权限矩阵落地）

P1 核心闭环：
  4. 人员管理模块（员工+组织+岗位）
  5. 三违管理（含传导逻辑）
  6. 隐患治理（含整改闭环）
  7. 月度考核（含规则引擎）

P2 数据消费：
  8. 安全总览（5大区域全部指标）
  9. 风险管控（含LEC计算+地图）

P3 支撑模块：
  10. 培训考核
  11. 制度标准
  12. 应急管理
  13. 保险管理
  14. 业务知识库（帮助入口）
```

### 6.3 版本管理

- 所有接口变更必须递增版本号（内部管理，URL不体现）
- 所有数据库变更必须编写独立的migration脚本（`sprint10e_XYZ.sql`）
- 所有规则变更必须记录在assessment_rule表，禁止硬编码

---

## 七、冻结确认

本报告包含的以下内容已确认为最终冻结版本：

- ✅ API接口清单（11个模块、120+接口）
- ✅ 数据库模型（20+张表、核心字段）
- ✅ 权限模型（5角色×11模块×9功能×3数据范围）
- ✅ 页面-接口-数据库映射关系
- ✅ 业务知识库实现方案（hse_business_help表+帮助入口）
- ✅ 开发约束

**从本报告签署之日起，上述内容禁止任何未经审批的变更。**

---

**报告生成时间**：2026-07-25
**技术审核**：_________（待填写）
**业务审核**：_________（待填写）
