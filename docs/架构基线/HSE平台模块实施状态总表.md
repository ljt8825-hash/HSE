# HSE平台模块实施状态总表

| 项 | 内容 |
|---|---|
| 文档编号 | HSE-ARCH-MODULE-STATUS |
| 建立日期 | 2026-10-27 |
| 版本 | V1.0 |
| 数据基线 | DEV 库 `safety_dashboard_dev`（**非生产**，见下方声明） |
| 代码基线 | `feat/hse-business-closure` @ `a02aab01ed5ab8bf5fb1fecad1f4d23e510bf28b` |
| 上位文档 | `HSE平台总体业务架构基线_V1.0.md` |
| 维护方式 | 每个模块状态变化时更新对应行，不改表结构 |

---

## 0. 三条判定声明

1. **表中"行数"全部是 DEV 库精确 `COUNT(*)`。** 生产库本次未读取（任务禁止生产环境操作）。DEV 行数只能证明"该表有真实业务数据流入"，**不能**等价于生产数据量。
2. **零行 ≠ 没做。** 三种情况分别标注：`建表未启用`（有 service 无数据）、`空壳`（有表无 service）、`走实时计算`（统计不落表）。
3. **`FROZEN` 必须有报告编号。** 无报告编号的一律不给 FROZEN，最高 `BACKEND`。

---

## 1. 状态定义（与基线 §16 一致）

| 状态 | 判定门槛 |
|---|---|
| `PLANNED` | 只有文档/需求，无代码无表 |
| `ARCHITECTURE` | 边界与归属已定，可开工 |
| `FRONTEND` | 有页面，后端或数据未就绪 |
| `DATA_MODEL` | 有 DDL，**无真实数据或未接 service** |
| `BACKEND` | 有 service + API + **真实数据** |
| `INTEGRATION` | 前后端联调中 |
| `ACCEPTANCE` | 已提交验收，未出结论 |
| `FROZEN` | 有独立审计/验收报告且 PASS |
| `BLOCKED` | 有明确阻塞原因 |
| `DEFERRED` | 主动后置 |

---

## 2. 统计概览

| 状态 | 数量 | 占比 |
|---|---|---|
| `BACKEND` | 67 | 53.2% |
| `DATA_MODEL` | 32 | 25.4% |
| `FROZEN` | 8 | 6.3% |
| `DEFERRED` | 6 | 4.8% |
| `PLANNED` | 6 | 4.8% |
| `BLOCKED` | 5 | 4.0% |
| `FRONTEND` | 2 | 1.6% |
| `ARCHITECTURE` | 0 | 0% |
| `INTEGRATION` | 0 | 0% |
| `ACCEPTANCE` | 0 | 0% |
| **合计** | **126** | 100% |

### 2.1 分域分布

| 层级 | 模块数 |
|---|---|
| L0 平台支撑 | 9 |
| L1 基础主数据 | 10 |
| L2 风险管理 | 8 |
| L2 检查管理 | 10 |
| L2 隐患治理 | 6 |
| L2 三违管理 | 7 |
| L2 事故管理 | 6 |
| L2 培训管理 | 8 |
| L2 安全生产费 | 10 |
| L3 专项安全管理 | 14 |
| L4 保障/经营管理 | 14 |
| L5 责任与考核 | 10 |
| L6 综合分析与智能 | 14 |
| **合计** | **126** |

### 2.2 三个必须正视的数字

1. **`INTEGRATION` / `ACCEPTANCE` / `ARCHITECTURE` 全为 0**。本平台**没有对"联调中/验收中/已定架构未开工"做过登记**——一旦页面接上真接口就直接当"完成"。这是流程缺失，不是真的没有中间态。`FROZEN` 之所以只有 8 个，恰恰是因为只有它被迫要求"有报告编号"。
2. **`DATA_MODEL` 占 25.4%（32 个模块）**。这是最大的沉没成本区：有 DDL、有 service 骨架，但没有真实业务数据。其中 8 张检查域表、5 张费用表、4 张工作流表是纯空壳。
3. **`BACKEND` 的 67 个里有 61 个从未验收**（"验收"列写"未验收"）。剩下的 6 个是 FROZEN/有报告支撑的例外。也就是说"有数据在跑"≠"验证过是对的"。这一点必须写进基线，否则后续重构会把未验证的行为当既定契约来兼容。

---

## 3. 模块实施状态总表

### L0 平台支撑层

| 一级域 | 模块 | 当前状态 | 前端 | 数据模型 | 后端 | 联调 | 验收 | 证据 | 下一步 |
|---|---|---|---|---|---|---|---|---|---|
| L0 平台支撑 | 认证与登录 | FROZEN | ✅ `_core/authentication` | ✅ `users`(64)/`login_attempts`(6)/`token_blacklist`(13) | ✅ `routes/auth.js`、`mobileAuth.js`、`middleware/auth.js` | ✅ | ✅ 权限 P0 缺陷已修 | `routes/auth.js:170,290`；`middleware/auth.js:175-181` | 不改（改动需单独授权） |
| L0 平台支撑 | 角色与权限 | FROZEN | ✅ `system/roles`、`system/users` | ✅ `roles`(5)/`user_role`(1)/`role_menu`(98)/`menus`(80) | ✅ `requireRole`/`requirePermission` | ✅ | ✅ | `router/routes/index.ts` 注释记录"全量展开绕过 meta.authority"缺陷已修 | 不改 |
| L0 平台支撑 | 审计日志 | BACKEND | ✅ `security/audit` | ✅ `sys_operation_log`(**4929**)；`audit_record`(0) 停用 | ✅ `routes/audit.js`、`hse-audit-records.js` | ✅ | 未验收 | `sys_operation_log` 4929 行 | 旧表 `audit_record` 标注 deprecated |
| L0 平台支撑 | 通知中心 | BACKEND | ✅ `hse/notifications` | ⚠️ `notifications`(9) 数据极少 | ✅ `notificationService.js` | ✅ | 未验收 | 9 行 | 核查是否走其他通道（微信/短信）未落库 |
| L0 平台支撑 | 工作流引擎 | DATA_MODEL | ✅ `hse/workflow` | ❌ `workflows`/`workflow_instances`/`workflow_tasks`/`workflow_history` **全 0** | ✅ `workflowService.js` 存在 | ❌ | ❌ | 4 表全 0 行 | 决定"启用"或"正式下线"，不允许长期空转 |
| L0 平台支撑 | 文件中心 | BACKEND | 分散 | ✅ `file_records`(**396**) ← **被 42 张表外键引用** | ✅ `routes/files.js`、`file-records.js`、`documentService.js` | ✅ | 未验收 | 42 条入向外键 | 确立为唯一文件中枢；`document_files`/`file_attachments` 收敛 |
| L0 平台支撑 | 导入框架 | BACKEND | ✅ `hse/batch-import`、`hse/employee-import-v2` | ✅ `employee_import_batch`(7)/`employee_import_pending`(**13642**)/`field_mapping_config`(20)/`hse_batch_import_tasks`(1) | ✅ `importExcelService.js`、`batchImportService.js`、`employeeImportV2Service.js`、`rosterImportService.js` | ✅ | 未验收 | 见基线 §15 | 按 §15 的 8 问清单规范新增 Excel |
| L0 平台支撑 | 待办中心 | BLOCKED | ✅ `hse/todos` | ⚠️ `hse_tasks`(0)/`hse_todo_sources`(10) | ⚠️ `hseTasksService.js:144` **恒早退** | ❌ | ❌ | 代码缺陷 + 0 行 | 修 `hseTasksService:144`（需授权） |
| L0 平台支撑 | 事件总线 | DATA_MODEL | 部分 | ⚠️ `hse_events`(16)/`hse_event_timeline`(0)/`hse_event_links`(0) | ✅ `hse-events.js`、`hse-chain.js` | ❌ | ❌ | 时间线/关联表 0 行 | 决定是否补时间线写入 |

### L1 基础主数据层

| 一级域 | 模块 | 当前状态 | 前端 | 数据模型 | 后端 | 联调 | 验收 | 证据 | 下一步 |
|---|---|---|---|---|---|---|---|---|---|
| L1 主数据 | 人员主数据 | BACKEND | ✅ `personnel/employee` | ✅ `employee`(**3417**) | ✅ `employeeService.js`、`employeeImportV2Service.js` | ✅ | 未验收 | **31 张表外键引用** | 确立唯一业务键（phone→employee_code→name，fail-closed） |
| L1 主数据 | 组织主数据 | BACKEND | ✅ `personnel/departments` | ✅ `hse_org_unit`(21)、`department`(98)、`departments`(0) | ✅ `orgTreeService.js` | ✅ | 未验收 | **13 张表外键引用** | 明确 `department`=下级视图；`departments`(0) 下线 |
| L1 主数据 | 岗位主数据 | BACKEND | ✅ `personnel/positions` | ✅ `position`(50)、`hse_position_alias`(16) | ✅ `positionService.js` | ✅ | 未验收 | **7 张表外键引用** | 保留 |
| L1 主数据 | 任职管理 | BACKEND | 分散在人员页 | ⚠️ `employee_assignment`(**28864**)、`hse_employee_org`(1285)、`employee_history`(1300) | ✅ `employeeAssignmentService.js`、`employeeHistoryService.js` | ✅ | 未验收 | 28864 行 = 8.4×人员数，**无"当前任职"唯一约束** | 设计与 `hse_employee_org` 的职责边界 |
| L1 主数据 | 作业单元/工作类型 | DATA_MODEL | ⚠️ 无独立页面（在风险台账内） | ✅ `hse_operation_unit`(89)、`risk_work_type_dict`(9)、`risk_work_unit_dict`(43) | ⚠️ 仅风险域使用 | ❌ | ❌ | 仅 `project_risk_record` 引用 | 提升为主数据（若检查/隐患需按作业类型归集） |
| L1 主数据 | 网格区域 | FROZEN | ✅ `site/grid`、`ledger/grid`、`mobile/grid` | ✅ `grid_areas`(63) ← `grid_inspection_records.grid_id` 外键 | ✅ `gridScope.js`、`gridAttributionService.js`、`gridCompletionService.js` | ✅ | ✅ WPS-PG-SYNC-05-A~E | 幂等性 2063/2061 条 0 变更 | 不改；与 `risk_area_dict` 建映射（C5） |
| L1 主数据 | 车辆主数据 | DATA_MODEL | ✅ `site/vehicle-checks` | ❌ `vehicles`(55)，**入向外键 0 条**，内嵌 20 个保险/保费列 | ⚠️ `routes/vehicles.js` | ❌ | ❌ | 见基线 §7.1 | **剥离保险列 + 补外键**（P0-3，需授权） |
| L1 主数据 | 基础字典 | DATA_MODEL | 分散 | ✅ `sanwei_behavior_dict`(15)、`risk_type_dict`(5)、`risk_sources`(61)、`risk_lec_scale`(12)、`risk_level_config`(4)、`risk_level_thresholds`(6) | ❌ 无统一字典服务 | ❌ | ❌ | 6 张独立字典表 | 建统一 code→name 服务（P1-5） |
| L1 主数据 | 资格/证书 | DATA_MODEL | ✅ `training/certificates`（页面已建） | ❌ `employee_certificate`(0)、`certificates`(0) | ⚠️ `employeeCertificateService.js` 存在但无数据 | ❌ | ❌ | 两表全 0 行 | 前端优先范式重做：先出台账 |
| L1 主数据 | 超龄人员 | BACKEND | ✅ `personnel/over-age`、`insurance/over-age` | ⚠️ `over_age_personnel`(1304) + 孤儿 `overage_personnels`(1108) | ✅ `overAgeService.js` | ✅ | 未验收 | 后者 **0 代码引用** | 后者标注只读（C6） |

### L2 HSE 核心业务域

#### L2-1 风险管理

| 一级域 | 模块 | 当前状态 | 前端 | 数据模型 | 后端 | 联调 | 验收 | 证据 | 下一步 |
|---|---|---|---|---|---|---|---|---|---|
| L2 风险 | 风险场景库 | FROZEN | ✅ `risk-library/scenes` | ✅ `risk_scene`(164)/`risk_scene_version`(164)/`risk_scene_applicability`(**1500**) | ✅ `riskLibraryService.js` | ✅ | ✅ 04-00 / 04-01 系列 | 164 场景 / 1500 矩阵（仅公园） | 不改规则源（02 冻结） |
| L2 风险 | 项目风险块（矩阵） | FROZEN | ✅ `risk-library/project-risks`、`risk-library/blocks` | ✅ `project_risk_record`(714) | ✅ `riskControlService.js` | ✅ | ✅ 03-04 / 04-01-R2 PASS | 块键冻结 `(project_id,area_id,work_type_id,work_link)`；14 表/57 索引/84 约束 | 不改 |
| L2 风险 | 风险管控清单 | BACKEND | ✅ `risk/list` | ✅ `project_risk_record` 派生 | ✅ `riskControlService.js` | ✅ | 未验收 | 714 行 | 保留 |
| L2 风险 | 风险地图 | BACKEND | ✅ `risk/map` | ⚠️ 无独立表（读风险块汇总） | ✅ | ✅ | 未验收 | — | 确认 1500 矩阵仅公园是否可接受 |
| L2 风险 | 风险评分/画像 | BACKEND | ✅ `hse/risk-profile-detail`、`hse/driver-risk-center` | ⚠️ `risk_score_history`(0)/`risk_score_records`(0)/`hse_employee_risk_snapshot`(0) | ✅ `riskScoreService.js`、`riskSnapshotService.js`、`hseRiskProfileService.js` | ⚠️ | ❌ | 三表全 0，但页面有数据 → **走实时计算** | 确认评分是否需要留痕（原则 6） |
| L2 风险 | 风险区域字典 | DATA_MODEL | 内嵌 | ⚠️ `risk_area_dict`(17)，FK→`hse_org_unit` | ✅ 内嵌 `riskControlService` | ❌ | ❌ | 与 `grid_areas`(63) 两套（C5） | 建映射（OPEN-002） |
| L2 风险 | 控制措施 | DATA_MODEL | 无 | ❌ `hse_control_measures`(0) | ⚠️ | ❌ | ❌ | 0 行 | 决定并入风险块字段还是启用独立表 |
| L2 风险 | 风险-隐患关联 | DATA_MODEL | 无 | ❌ `risk_hazard_links`(0)；`hazards.related_risk_ids`(jsonb) 在用 | ⚠️ | ❌ | ❌ | 关联表 0 行，实际走 jsonb | 统一为表或明确 jsonb 为唯一源 |

#### L2-2 检查管理

| 一级域 | 模块 | 当前状态 | 前端 | 数据模型 | 后端 | 联调 | 验收 | 证据 | 下一步 |
|---|---|---|---|---|---|---|---|---|---|
| L2 检查 | 检查计划（新版） | DATA_MODEL | ❌ 无独立页面 | ❌ `hse_inspection_plans`(**0**) | ✅ `inspectionCenterService.js` | ❌ | ❌ | 0 行 | OPEN-003 决策后重设计 |
| L2 检查 | 检查任务（新版） | DATA_MODEL | ❌ | ❌ `hse_inspection_tasks`(**0**) | ✅ 同上 | ❌ | ❌ | 0 行 | 同上 |
| L2 检查 | 检查执行（新版） | DATA_MODEL | ❌ | ❌ `hse_inspection_executions`(**0**) | ✅ 同上 | ❌ | ❌ | 0 行 | 同上 |
| L2 检查 | 检查计划/任务/记录（旧版） | DEFERRED | ⚠️ 仅遗留前端 `web-antd/inspection` | ❌ `inspection_plan`/`inspection_task`/`inspection_record` 全 **0** | ⚠️ 零星引用 | ❌ | ❌ | 3 表 0 行 | 正式标注 deprecated |
| L2 检查 | 检查模板/清单 | DEFERRED | ⚠️ | ❌ `inspection_checklist_template`/`inspection_checklist_item` 全 **0** | ⚠️ | ❌ | ❌ | 0 行 | 同上 |
| L2 检查 | **网格巡查（真在跑）** | FROZEN | ✅ `mobile/{grid,inspection}`、`ledger/grid`、`site/grid` | ✅ `grid_inspection_records`(**2069**) | ✅ `wpsGridSyncService.js`、`gridAttributionService.js` | ✅ | ✅ WPS-PG-SYNC-05-A~E | 2063/2061 条幂等；327 条 NULL grid_id 受保护 | 不改（反向写入被隔离） |
| L2 检查 | 转运站管理检查 | BACKEND | ✅ `site/transfer-stations` | ✅ `transfer_station_check`(**130**) | ✅ 转运站链路 | ✅ | 未验收 | 130 行 | 保留；确认 4+2 子项求和口径 |
| L2 检查 | 车辆检查 | DATA_MODEL | ✅ `site/vehicle-checks` | ⚠️ `vehicle_check_record`(1)/`hse_driver_inspection_records`(3)/`vehicle_inspection_records`(3) | ⚠️ `routes/vehicle-checks.js` | ⚠️ | ❌ | **三表并存**（C7） | 定权威表 |
| L2 检查 | 驾驶员月度检查 | BACKEND | ✅ `assessment-monthly/mirror/driver-monthly` | ✅ `driver_monthly`(**612**) | ✅ `ruleEngine/adapters/driverMonthlyAdapter.js` | ✅ | 未验收 | 612 行 | 保留；镜像页改真实只读视图 |
| L2 检查 | 检查中心 API 入口 | BACKEND | ❌ | — | ⚠️ 挂 `/api/hse/employee/inspection-*`，权限码复用 `hse:personnel:*` | ❌ | ❌ | `routes/hse-employee.js:52` | **语义归位**（P1-6） |

#### L2-3 隐患治理

| 一级域 | 模块 | 当前状态 | 前端 | 数据模型 | 后端 | 联调 | 验收 | 证据 | 下一步 |
|---|---|---|---|---|---|---|---|---|---|
| L2 隐患 | 隐患登记 | FROZEN | ✅ `hazards`、`mobile/inspection/issue` | ✅ `hazards`(**110**；closed 60 / discovered 50) | ✅ `hazardService.js` | ✅ | ✅ 隐患 C1 = FROZEN / N-02/G-7 PASS | `hse_reviews.writer=1`，canonical=`hazard_id` | 不改关闭语义 |
| L2 隐患 | 隐患派生（检查中心） | BACKEND | ❌ | ⚠️ `hazard_record`(9) | ✅ `inspectionCenterService.js:448,639,931` | ❌ | ❌ | 两套隐患事实（C9） | 合并或明确"检查派生"定位 |
| L2 隐患 | 整改任务 | DATA_MODEL | ✅（隐患详情内） | ❌ `hse_rectifications`(0)、`rectification_action`(1) | ⚠️ `hazardRectificationService.js` | ❌ | ❌ | 整改实际走 `hazards` 内联字段 | 决定内联 or 独立事实 |
| L2 隐患 | 复查验收 | DATA_MODEL | ✅（隐患详情内） | ❌ `hse_reviews`(**0**)、`review_record`(1) | ⚠️ | ❌ | ❌ | 复查实际走 `hazards.review_result` 内联 | 同上 |
| L2 隐患 | 隐患版本/附件 | DATA_MODEL | 无 | ❌ `hazard_versions`(0)/`hazard_attachments`(0) | ⚠️ | ❌ | ❌ | 0 行 | 决定是否启用 |
| L2 隐患 | 隐患统计 | BACKEND | ✅ 驾驶舱 | 走实时计算 | ✅ | ✅ | 未验收 | 110 行 | 保留 |

#### L2-4 三违管理

| 一级域 | 模块 | 当前状态 | 前端 | 数据模型 | 后端 | 联调 | 验收 | 证据 | 下一步 |
|---|---|---|---|---|---|---|---|---|---|
| L2 三违 | 三违记录 | BACKEND | ✅ `site/violation/records`、`mobile/violation/new`、`mw/**` | ✅ `violation_records`(**2645**) | ✅ `violationService.js`（27+ 处 SQL） | ✅ | 未验收 | 2645 行 | 保留 |
| L2 三违 | 三违候选池 | BACKEND | ✅ `site/violation/candidates` | ✅ `grid_violation_candidates`(**439**) | ✅ `gridViolationCandidateService.js` | ✅ | 未验收 | 439 行 | 保留 |
| L2 三违 | 三违台账 | BACKEND | ✅ `ledger/violation`、`site/violation/ledger` | ✅ `hse_sanwei_ledger_config`(4)、`hse_sanwei_score_monthly`(170) | ✅ `sanweiLedgerDerive.js` | ✅ | 未验收 | 170 行 | 保留 |
| L2 三违 | 三违分析 | BACKEND | ✅ `site/violation/analysis`、`analysis/violation` | 走实时计算 | ✅ | ✅ | 未验收 | — | 确认不读死表 `violations` |
| L2 三违 | 三违管理考核 | BACKEND | ✅ `site/violation/assessment`、`hse/violation-assessment` | ✅ `hse_assessment_deduction`(940) | ✅ `violationAssessmentService.js`、`companyViolationDeduct.js` | ✅ | 未验收 | 940 行 | 保留 |
| L2 三违 | **历史只读表 `violations`** | DEFERRED | 无 | ⚠️ `violations`(**1451**)，**零 INSERT/UPDATE** | ⚠️ 25 个文件仍在读 | — | — | 代码全仓无写入语句 | **冻结只读**，报表口径统一到 `violation_records`（C4） |
| L2 三违 | 违章人员解析 | BACKEND | — | — | ✅ `violatorResolver.js`、`violationCheckerScope.js` | ✅ | 未验收 | — | 保留 |

#### L2-5 事故管理

| 一级域 | 模块 | 当前状态 | 前端 | 数据模型 | 后端 | 联调 | 验收 | 证据 | 下一步 |
|---|---|---|---|---|---|---|---|---|---|
| L2 事故 | 事故登记 | BLOCKED | ✅ `accidents` | ⚠️ `accidents`(**110**)，`status` 无 CHECK/ENUM/FK，6 套词表 | ✅ `accidentService.js` | ✅ | ❌ RC-1 BLOCKED | P3-13/P3-14 | 需生产 `status` 分布 + 业务签字（OPEN-007） |
| L2 事故 | 事故版本 | BACKEND | 内嵌 | ✅ `accident_versions`(**436**) | ✅ | ✅ | 未验收 | 436 行 | 保留 |
| L2 事故 | 事故分析中心 | BACKEND | ✅ `analysis/accident` | 读 `accidents` | ✅ `routes/hse-accident-analysis.js` | ✅ | 未验收 | — | 保留 |
| L2 事故 | 事故事件统一库 | DATA_MODEL | 无 | ⚠️ `hse_incident_records`(44) | ⚠️ | ❌ | ❌ | 44 行，与 `accidents` 关系未明 | **明确与 accidents 的关系** |
| L2 事故 | 事故人员/附件 | DATA_MODEL | 无 | ❌ `accident_persons`(0)/`accident_attachments`(0) | ⚠️ | ❌ | ❌ | 0 行 | 决定是否启用 |
| L2 事故 | 事故→保险理赔 | PLANNED | 无 | ❌ 无表无代码 | ❌ | ❌ | ❌ | `accidents.compensation` 单字段无人写 | 随保险域一起设计 |

#### L2-6 培训管理

| 一级域 | 模块 | 当前状态 | 前端 | 数据模型 | 后端 | 联调 | 验收 | 证据 | 下一步 |
|---|---|---|---|---|---|---|---|---|---|
| L2 培训 | 培训计划 + 状态机 | FROZEN | ✅ `training/plans` | ✅ `training_plans`(35) | ✅ `trainingPlanService.js` + `trainingPlanStatusMachine.js` | ✅ | ✅ P3-16 S1/S1.5/S1.6 COMPLETE | 6 态 6 转换后端化；`FOR UPDATE`；`createPlan` 已覆盖；WARN-ONLY | 两周期观察（自 2026-10-27 11:45），**期内不改规则 JSON** |
| L2 培训 | 培训记录（明细） | BACKEND | ✅ `training/records` | ⚠️ `training_records`(**19** 行，`is_deleted=false` 仅 **5** 行) | ✅ `trainingRecordService.js` | ✅ | 未验收 | 有效 5 行 vs 台账 598 行 | S2 需业务定权威（OPEN-004） |
| L2 培训 | 培训台账（月度汇总） | BLOCKED | ✅ `ledger/training` | ✅ `hse_training_ledger_monthly`(**598**；应培 14165 / 实际 14027 / 缺培 188 / 不完整 85；`source` 全为 `excel-import`) | ✅ `trainingLedgerService.js`、`trainingLedgerAutoInitScheduler.js` | ✅ | ❌ S2 BLOCKED | 14027:5 = 2805:1；**唯一来源是 Excel 导入** | 业务签字；`AutoInit` 写死 0,0,0,0 需纠正（OPEN-009） |
| L2 培训 | 培训需求 | DATA_MODEL | ✅ `training/assessments` | ❌ `training_requirements`(0)、`position_training_requirement`(0) | ✅ `trainingRequirementService.js` | ❌ | ❌ | 0 行 | 决定启用或下线 |
| L2 培训 | 培训证书 | DATA_MODEL | ✅ `training/certificates` | ❌ `employee_certificate`(0)/`certificates`(0) | ⚠️ `employeeCertificateService.js` 无数据链路 | ❌ | ❌ | 0 行 | 前端优先重做 |
| L2 培训 | 培训统计 | BACKEND | ✅ `training/comprehensive`、`training/stats` | 走实时计算 | ✅ `trainingStatsService.js` | ✅ | 未验收 | — | 保留 |
| L2 培训 | 培训花名册/附件/版本 | DATA_MODEL | 内嵌 | ⚠️ `training_roster`(58)/`training_attachments`(12)/`training_versions`(12) | ⚠️ | ❌ | ❌ | 有数据但无独立页面 | 确认是否停用 |
| L2 培训 | 遗留培训表 | DEFERRED | 无 | ❌ `training_record`(**0**)、`taihang_trainings`(**0**) | ⚠️ 4 个文件引用 `training_record` | ❌ | ❌ | 0 行 / 0 引用 | 标注 deprecated（C10） |

#### L2-7 安全生产费

| 一级域 | 模块 | 当前状态 | 前端 | 数据模型 | 后端 | 联调 | 验收 | 证据 | 下一步 |
|---|---|---|---|---|---|---|---|---|---|
| L2 费用 | 年度预算 | BACKEND | ✅ `objectives/budget/annual` | ✅ `hse_safety_budget`(**342**) | ✅ `costService.js` | ✅ | 未验收 | 342 行；另有 3 张 `*_backup_*` | 备份表移出 schema |
| L2 费用 | 月度购买计划 | BACKEND | ✅ `objectives/budget/monthly-plan` | ⚠️ 复用 `hse_safety_budget` | ✅ | ✅ | 未验收 | — | 确认是否需独立表 |
| L2 费用 | 物资价格库 | BACKEND | ✅ `objectives/budget/material-price` | ✅ `hse_material_price`(78) | ✅ `routes/hse-material-price.js` | ✅ | 未验收 | 78 行 | 保留 |
| L2 费用 | 费用申请 | DATA_MODEL | ✅ `objectives/budget/expenditure` | ❌ `hse_cost_request`(**0**) | ✅ `costService.js` | ❌ | ❌ | 0 行 | 前端优先：先出申请台账 |
| L2 费用 | 承诺（承诺额） | DATA_MODEL | ⚠️ | ❌ `hse_cost_commitment`(**0**) | ✅ | ❌ | ❌ | 0 行 | 同上 |
| L2 费用 | 实际支出 | DATA_MODEL | ✅ `objectives/budget/cost` | ❌ `hse_cost_actual`(**0**) | ✅ | ❌ | ❌ | 0 行 | 同上 |
| L2 费用 | 分摊 | DATA_MODEL | ⚠️ | ❌ `hse_cost_allocation`(**0**) | ✅ | ❌ | ❌ | 0 行 | 同上 |
| L2 费用 | 费用导入批次 | DATA_MODEL | 无 | ❌ `hse_cost_import_batch`(0) | ⚠️ | ❌ | ❌ | 0 行 | 随导入模板一起设计 |
| L2 费用 | 费用字典 | DATA_MODEL | ⚠️ | ✅ `hse_cost_biz_domain`(3)/`invest_category`(7)/`op_type`(7) | ⚠️ | ❌ | ❌ | 有字典无事实 | 保留字典 |
| L2 费用 | 历史预算表 `safety_budgets` | DEFERRED | 无 | ❌ `safety_budgets`(0) | ❌ | ❌ | ❌ | 0 行 | 标注 deprecated（C13） |

### L3 专项安全管理域

| 一级域 | 模块 | 当前状态 | 前端 | 数据模型 | 后端 | 联调 | 验收 | 证据 | 下一步 |
|---|---|---|---|---|---|---|---|---|---|
| L3 专项 | 交通安全（驾驶员） | BACKEND | ✅ `site/driver`、`training/driver`、`hse/driver-risk-center`(7 组件) | ✅ `driver_monthly`(**612**)/`driver_violation`(194)/`driver_three_violation`(8)/`driver_assessment`(88)/`license_demerit_records`(3) | ✅ `driverMonthlyAdapter.js`、`hse-driver-risk*.js` | ✅ | 未验收 | 612+194+88 行 | 保留；最完整的专项 |
| L3 专项 | 消防安全 | FRONTEND | ✅ `site/fire-facility` | ❌ `fire_equipment`(**0**) | ❌ 无 service；`importShared.js:493` 只指内存表 | ❌ | ❌ | `/api/overview` 消防统计**读 Excel 残留表** `t_08_...` | **P0-2**：先修统计口径，再用前端优先范式重做 |
| L3 专项 | 职业健康 | BACKEND | ⚠️ 寄居 `hse/employee-profile`、`risk-profile-detail` | ⚠️ `employee_safety_profile`(30)、`position_safety_profile`(0) | ✅ `employeeHealthCheckScheduler.js`、`hseRiskProfileService.js` | ⚠️ | ❌ | 30 行 | 决定是否独立成域 |
| L3 专项 | 特种设备 | PLANNED | ❌ 无 | ❌ 无表 | ❌ 无 service/route | ❌ | ❌ | `grep 特种设备` 仅命中证书关键字 | 前端优先范式新建（无历史包袱） |
| L3 专项 | 应急预案 | BACKEND | ✅ `emergency/plans` | ✅ `emergency_plans`(5)/`emergency_plan_versions`(0)/`emergency_plan_attachments`(0) | ✅ `emergencyService.js` | ✅ | 未验收 | 5 行 | 版本/附件表 0 行待启用 |
| L3 专项 | 应急演练 | BACKEND | ✅ `emergency/drills` | ✅ `emergency_drills`(48) | ✅ | ✅ | 未验收 | 48 行 | 保留 |
| L3 专项 | 应急队伍 | BACKEND | ✅ `emergency/teams` | ✅ `emergency_teams`(65)/`emergency_team_members`(401) | ✅ | ✅ | 未验收 | 65+401 行 | 保留 |
| L3 专项 | 应急物资 | BACKEND | ✅ `emergency/materials` | ⚠️ `emergency_materials`(5)/`emergency_supplies`(0) | ✅ | ✅ | 未验收 | 5 行 | 两表合并 |
| L3 专项 | 应急事件 | DATA_MODEL | ✅ `emergency/events` | ❌ `emergency_events`(**0**) | ✅ | ❌ | ❌ | 0 行 | 决定启用或下线 |
| L3 专项 | 标准化条款 | BACKEND | ✅ `hse/standard/clauses` | ✅ `hse_assessment_standard`(26)/`safety_standard_clauses`(59) | ✅ `standardService.js`、`standardsService.js` | ✅ | 未验收 | 26+59 行 | 保留 |
| L3 专项 | 标准化关系 | BACKEND | ✅ `hse/standard/relation`、`suggestions` | ✅ `hse_clause_relations`(1)、`document_standard_relation`(2) | ✅ `standardRelationService.js` | ✅ | 未验收 | 仅 1+2 行 | 数据极少，需核查导入链路 |
| L3 专项 | 标准化评价 | DATA_MODEL | ⚠️ | ❌ `standard_evaluation_items`(0)/`standard_evaluation_tasks`(0) | ✅ `standardEvaluationService.js` | ❌ | ❌ | 0 行 | 决定启用或下线 |
| L3 专项 | 制度规章 | BACKEND | ✅ `regulations`、`standards/regulations` | ⚠️ `regulations`(25) + `hse_regulations`(1)；版本/附件表 0/2 | ✅ `regulationsService.js` | ✅ | 未验收 | 25+1 行（双表 C8） | 定权威表 |
| L3 专项 | 文档库/评审 | DATA_MODEL | ✅ `hse/documents/{library,review}` | ⚠️ `hse_document_library`(1)/`hse_document_reviews`(1)/`document_files`(2) | ✅ `documentService.js`、`documentAiService.js` | ❌ | ❌ | 1+1+2 行 | 数据极少，需核查是试点还是废弃 |

### L4 保障/经营管理域

| 一级域 | 模块 | 当前状态 | 前端 | 数据模型 | 后端 | 联调 | 验收 | 证据 | 下一步 |
|---|---|---|---|---|---|---|---|---|---|
| L4 保障 | 人员保险 | BACKEND | ✅ `insurance/personnel` | ✅ `personnel_insurance`(**2474**)；孤儿 `personnel_insurances`(1330) | ✅ `insurancePersonnelService.js`、`personnelInsurancePolicyService.js` | ✅ | 未验收 | 2474 行；孤儿表 **0 引用**（C12） | 孤儿表标注只读 |
| L4 保障 | 车辆保险 | PLANNED | ✅ `insurance/vehicle` | ❌ `vehicle_insurances`(**0**)；实际数据在 `vehicles` 的 20 个保险/保费列 | ❌ 0 引用 | ❌ | ❌ | 见基线 §7.1 | **P0-3**：剥离 + 迁移（OPEN-005） |
| L4 保障 | 其他保险 | BACKEND | ✅ `insurance/other` | ✅ `other_insurance`(16) | ✅ `insuranceOtherService.js` | ✅ | 未验收 | 16 行 | 保留 |
| L4 保障 | 保单管理 | DATA_MODEL | ⚠️ 内嵌 | ⚠️ `insurance_policies`(2)，字段只有 `name/type/file_name/policy_no/year` | ✅ `insurancePolicyService.js`、`insurancePolicyReadService.js` | ❌ | ❌ | 仅 2 行，无起止日期字段 | 需重新设计（保单应有期限/保额/保费） |
| L4 保障 | 保单版本/历史/附件 | DATA_MODEL | 无 | ❌ `insurance_versions`(0)/`insurance_history`(0)/`insurance_attachments`(0) | ⚠️ | ❌ | ❌ | 0 行 | 随保单重设计 |
| L4 保障 | 超龄人员保障 | BACKEND | ✅ `insurance/over-age` | ✅ `over_age_personnel`(1304) | ✅ `insuranceOverageService.js` | ✅ | 未验收 | 1304 行 | 保留 |
| L4 保障 | 五险 | PLANNED | ❌ | ❌ 未建模（仅在 `insurance_type` 字符串区分） | ❌ | ❌ | ❌ | 表结构实证 | 若要统计需建模 |
| L4 保障 | 出险与理赔 | PLANNED | ❌ | ❌ 无表无代码 | ❌ | ❌ | ❌ | `accidents.compensation` 无人写 | 新建 |
| L4 保障 | 目标责任书 | BACKEND | ✅ `objectives/responsibility`、`hse/responsibility-forms` | ✅ `hse_target_contracts`(**2433**) | ✅ `objectiveService.js` | ✅ | 未验收 | 2433 行 | 保留 |
| L4 保障 | 安委会 | BACKEND | ✅ `objectives/committee` | ✅ `hse_safety_committee`(1)/`hse_safety_committee_activity`(19) | ✅ | ✅ | 未验收 | 1+19 行 | 保留 |
| L4 保障 | 会务管理 | BACKEND | ✅ `hse/meeting-records` | ⚠️ `meeting_records`(4) | ✅ | ✅ | 未验收 | 4 行 | 数据极少，确认是否在用 |
| L4 保障 | 安全文化 | BACKEND | ✅ `objectives/safety-culture`、`hse/safety-culture` | ✅ `hse_safety_culture_monthly`(122) | ✅ `safetyCultureImport.js` | ✅ | 未验收 | 122 行 | 保留 |
| L4 保障 | 供应链安全 | FRONTEND | ✅ `hse/supply-chain` | ❌ 无表 | ❌ 无 service | ❌ | ❌ | 仅一个页面，无接口 | 前端优先：先出台账 |
| L4 保障 | 岗位责任清单 | BACKEND | ✅ `hse/position-resp` | ✅ `hse_responsibility_config`(18)/`hse_responsibility_unmatched`(77) | ✅ `positionResponsibilityService.js` | ✅ | 未验收 | 18+77 行 | 保留 |

### L5 责任与考核域

| 一级域 | 模块 | 当前状态 | 前端 | 数据模型 | 后端 | 联调 | 验收 | 证据 | 下一步 |
|---|---|---|---|---|---|---|---|---|---|
| L5 考核 | 考核周期 | BACKEND | ✅ `objectives/assessment-cycles` | ✅ `hse_assessment_cycle`(15) | ✅ `assessmentMonthlyCycleService.js` + `assessmentScheduler.js` | ✅ | 未验收 | 15 行；cron 每日校验 + 网格校验 | 保留 |
| L5 考核 | 考核对象 | BACKEND | ✅ `objectives/assessment-targets` | ✅ `hse_assessment_target`(**925**) | ✅ `assessmentMonthlyTargetService.js` | ✅ | 未验收 | 925 行 | 保留 |
| L5 考核 | 自动评分引擎 | BACKEND | ✅ `objectives/assessment-monthly/scoring` | ✅ `hse_assessment_score`(**3670**)/`hse_assessment_score_detail`(0) | ✅ `assessmentScoringEngine.js`、`assessmentMonthlyScoringService.js` | ✅ | 未验收 | 3670 行；**存在硬编码跨模块查询**（既有结论） | 重构前需专业方案对比 |
| L5 考核 | 扣分明细 | BACKEND | ✅ `objectives/assessment-monthly` | ✅ `hse_assessment_deduction`(**940**)/`deduction_adjustment`(1) | ✅ `assessmentMonthlyDeductionService.js` | ✅ | 未验收 | 940 行 | 保留 |
| L5 考核 | 指标与规则 | BACKEND | ✅ `hse/assessment-rule` | ✅ `hse_assessment_metric`(29)/`rule`(22)/`rule_detail`(12)/`rule_condition`(6)/`metric_source`(2)/`metric_rule`(0) | ✅ `assessmentRuleCategoryService.js` | ✅ | 未验收 | 29+22+12+6 行 | `metric_rule` 0 行待核查 |
| L5 考核 | 一票否决/加分 | BACKEND | ⚠️ | ✅ `hse_assessment_veto_rule`(3)/`hse_bonus_rule`(3)/`category_limit`(12) | ✅ | ⚠️ | 未验收 | 3+3+12 行 | 保留 |
| L5 考核 | 冻结与导出 | BACKEND | ✅ `assessment-monthly/freeze`、`excel` | ✅ `hse_assessment_audit_log`(232)/`event_log`(**717**) | ✅ `assessmentMonthlyFreezeService.js`、`ExportService.js` | ✅ | 未验收 | 232+717 行 | 保留 |
| L5 考核 | 考核门户 + 镜像页 | BACKEND | ✅ `assessment-portal` + 10 个 `mirror/*` | 只读派生 | ⚠️ 镜像是**复制业务口径** | ✅ | ❌ | 10 个 mirror 页 | **P1-3**：改为真实只读视图 |
| L5 考核 | 健康度检查 | BACKEND | ⚠️ | 走实时 | ✅ `assessmentMonthlyHealthService.js` | ⚠️ | 未验收 | — | 保留 |
| L5 考核 | 旧考核表 | DEFERRED | 无 | ❌ `assessment_records`(5)/`assessment_rule`(1)/`assessment_rule_detail`(3) | ⚠️ | ❌ | ❌ | C14 | 标注 deprecated |

### L6 综合分析与智能层

| 一级域 | 模块 | 当前状态 | 前端 | 数据模型 | 后端 | 联调 | 验收 | 证据 | 下一步 |
|---|---|---|---|---|---|---|---|---|---|
| L6 分析 | 安全总览 | BLOCKED | ✅ `hse/overview` | ⚠️ **直接查 Excel 残留表** | ✅ `routes/overview.js` | ✅ | ❌ | `overview.js:44,49` 查 `t_08_*`、`t_05_*` | **P0-2 修复**：改读 `fire_equipment`/`accidents` |
| L6 分析 | 领导驾驶舱 | BACKEND | ✅ `hse/leader-dashboard` | 走实时计算 | ✅ `leaderDashboardService.js` | ✅ | 未验收 | — | 保留 |
| L6 分析 | 高管驾驶舱 | BACKEND | ✅ `analysis/cockpit`、`cockpit-dashboard` | 走实时计算 | ✅ `executiveCockpitService.js` | ✅ | 未验收 | — | 保留 |
| L6 分析 | BI 大屏 | BACKEND | ✅ `hse/bi` | 走实时计算 | ✅ `biService.js`、`routes/bi.js` | ✅ | 未验收 | — | 保留 |
| L6 分析 | 统计分析 | BACKEND | ✅ `hse/reports` | ⚠️ `hse_statistics_daily`(1)/`_dept`(0)/`_monthly`(0)/`_person`(0)/`_yearly`(0) | ✅ `statisticsService.js` | ✅ | 未验收 | 物化表 1/0/0/0/0 → **走实时** | 明确"实时"为唯一口径，物化表下线 |
| L6 分析 | 预警中心 | BLOCKED | ✅ `hse/warning-center`、`hse/alerts` | ⚠️ `hse_warning_rule`(10)/`scheduler`(7)/**`record`(0)**/`task`(0) | ✅ `warningCenterService.js`（S1.6 已结构化日志） | ✅ | ❌ | 规则在跑，**从未产出预警记录** | 核查 cron 是否真触发/生成是否失败（P1-8） |
| L6 分析 | 报表中心 | BACKEND | ✅ `hse/reports` | ✅ `hse_reports`(7)/`hse_report_templates`(7) | ✅ `reportService.js` | ✅ | 未验收 | 7+7 行 | 保留 |
| L6 分析 | 事故分析 | BACKEND | ✅ `analysis/accident` | 读 `accidents`(110) | ✅ | ✅ | 未验收 | — | 阻塞于事故状态（RC-1） |
| L6 分析 | 三违分析 | BACKEND | ✅ `analysis/violation` | 读 `violation_records`(2645) | ✅ | ✅ | 未验收 | — | 确认不读死表 |
| L6 分析 | 考核分析 | BACKEND | ✅ `analysis/assessment` | 读 `hse_assessment_*` | ✅ `hseAssessmentAnalysisService.js` | ✅ | 未验收 | — | 保留 |
| L6 分析 | AI 能力层 | BACKEND | ✅ `analysis/ai`、`company/**`(5 页) | ⚠️ 无独立业务表（`document_ai_analysis` 1 行） | ✅ `services/ai/*`、`aiService.js`、`aiEnhancedService.js`、`aiV2`、`aiKnowledge` | ✅ | AI-02/AI-05 有架构基线 | — | 保留 |
| L6 分析 | 仪表盘/筛选配置 | BACKEND | — | ✅ `hse_dashboard_card_config`(47)/`hse_filter_config`(48) | ✅ | — | 未验收 | 47+48 行 | 保留 |
| L6 分析 | 数据质量 | PLANNED | ❌ | ❌ | ❌ | ❌ | ❌ | 仅 `hse_business_help`(63) 业务帮助 | 新建（建议在基线稳定后做） |
| L6 分析 | 业务帮助 | BACKEND | ⚠️ | ✅ `hse_business_help`(63) | ✅ `routes/hse-business-help.js` | ⚠️ | 未验收 | 63 行 | 保留 |

---

## 4. 附：103 张零行表全量清单

> 来自 DEV 库精确 `COUNT(*)`，排除 42 张 `backup_9x_*` + 48 张 `t_0X_*` + 6 张 `*_bak_*` + 7 张 `*_backup_*`。以下为**精确全量**，不抽样。

### 4.1 按前缀分组计数（便于定位归属域）

| 前缀 | 零行表数 | 说明 |
|---|---|---|
| `hse_` | 39 | 最大一块，横跨检查/费用/隐患/考核/统计/预警/导入 |
| `risk_` | 6 | 风险域派生表 |
| `inspection_` | 5 | 旧版检查域全空 |
| `emergency_` | 5 | 应急版本/附件/物资/事件 |
| `workflow*` | 4 | 工作流引擎全空 |
| `training_` | 3 | 需求/旧记录/签到 |
| `insurance_` | 3 | 版本/历史/附件 |
| `employee_` | 3 | 证书/入职培训/培训状态 |
| `standard_` | 2 | 标准化评价 |
| `safety_` | 2 | `safety_budgets`、`safety_goals` |
| `position_` | 2 | 岗位画像/岗位培训要求 |
| `personnel_` | 2 | `personnel`、`personnel_assessment_summary` |
| `org_` | 2 | `org_personnel`、`org_personnels` |
| `import_` | 2 | 导入框架旧表 |
| `hazard_` | 2 | 版本/附件 |
| `grid_` | 2 | 巡查日志/同步状态 |
| `document_` | 2 | 版本/标签关系 |
| `accident_` | 2 | 人员/附件 |
| 其他单张 | 18 | 见 4.2 全量清单 |

### 4.2 全量清单（103 张）

```text
accident_attachments, accident_persons, audit_record, backfill_log,
certificates, contract_signs, departments, document_tag_relation,
document_versions, emergency_attachments, emergency_events,
emergency_plan_attachments, emergency_plan_versions, emergency_supplies,
employee_certificate, employee_induction_training, employee_training_status,
file_attachments, fire_equipment, grid_patrol_logs, grid_record_sync_state,
hazard_attachments, hazard_versions, hazardous_work,
hse_assessment_metric_rule, hse_assessment_score_detail, hse_budget_item,
hse_control_measures, hse_cost_actual, hse_cost_allocation,
hse_cost_commitment, hse_cost_import_batch, hse_cost_request,
hse_employee_risk_snapshot, hse_event_links, hse_event_timeline,
hse_grid_inspection_records, hse_import_batch, hse_import_mapping_rule,
hse_import_pending, hse_inspection_executions, hse_inspection_plans,
hse_inspection_tasks, hse_match_suggestions, hse_rectification_evaluation,
hse_rectifications, hse_responsibility, hse_responsibility_area,
hse_responsibility_assessment, hse_responsibility_chain, hse_reviews,
hse_risk_factors, hse_risk_objects, hse_statistics_dept,
hse_statistics_monthly, hse_statistics_person, hse_statistics_yearly,
hse_task_reminders, hse_tasks, hse_untrained_log, hse_warning_record,
hse_warning_rule_version, hse_warning_task, import_batch, import_error_log,
inspection_checklist_item, inspection_checklist_template, inspection_plan,
inspection_record, inspection_task, insurance_attachments, insurance_history,
insurance_versions, org_personnel, org_personnels, outbox, personnel,
personnel_assessment_summary, position_safety_profile,
position_training_requirement, rectification_task, regulation_versions,
responsibilities, risk_attachments, risk_hazard_links, risk_level_records,
risk_scene_violation_links, risk_score_history, risk_score_records,
safety_budgets, safety_goals, standard_evaluation_items,
standard_evaluation_tasks, taihang_trainings, training_record,
training_requirements, training_signin_sessions, vehicle_insurances,
workflow_history, workflow_instances, workflow_tasks, workflows,
wps_account_employee_map
```

### 4.3 已确认可判 deprecated（建议优先处理，有据可依）— 9 张

| 表 | 理由 |
|---|---|
| `inspection_plan` / `inspection_task` / `inspection_record` / `inspection_checklist_template` / `inspection_checklist_item` | 0 行 + 仅遗留前端 `web-antd` 引用 |
| `training_record` | 0 行 + 与 `training_records` 重复（C10） |
| `taihang_trainings` | 0 行 + **0 代码引用** |
| `safety_budgets` | 0 行 + 与 `hse_safety_budget` 重复（C13） |
| `personnel_insurances` | **1330 行但 0 代码引用**（不是零行，但同样应下线，C12） |

### 4.4 其中"必须尽快定生死"的 12 张

这些表既有 service 引用又长期零行，属于"代码以为在用、业务从没用过"的灰区：

```text
hse_inspection_plans / hse_inspection_tasks / hse_inspection_executions   ← 检查域新版
hse_rectifications / hse_reviews                                          ← 隐患整改/复查
hse_control_measures                                                      ← 风险控制措施
hse_cost_request / hse_cost_commitment / hse_cost_actual / hse_cost_allocation  ← 费用四段
hse_warning_record                                                        ← 预警产出（规则在跑却从无产出）
hse_tasks                                                                 ← 待办（service 有恒早退缺陷）
```


---

## 5. 附：有真实数据但零代码引用的"孤儿表"（4 张）

| 表 | 行数 | 代码引用 | 判断 |
|---|---|---|---|
| `personnel_insurances` | **1330** | **0** | 历史导入残留（保险表的前身） |
| `overage_personnels` | **1108** | **0** | 历史导入残留（超龄人员表的前身） |
| `vehicle_insurances` | 0 | **0** | 建了未用 |
| `taihang_trainings` | 0 | **0** | 建了未用 |

> 这 4 张是"C1 级重复主数据"的物理根源：**有数据但没人读，说明数据曾经进过系统又从没被业务使用**。

---

## 6. 附：FROZEN 的 8 个模块行 / 7 项冻结成果及其证据报告

> 表中有 8 行状态为 `FROZEN`，对应 7 项独立冻结成果（"风险 03/04"由 2 行——风险场景库、项目风险块——共同构成 1 项）。

| 模块 | 冻结内容 | 证据来源 |
|---|---|---|
| 网格巡查 WPS-PG 同步 | 单向 WPS→PG，禁反向写入 | `docs/HSE网格巡查身份链_WPS-PG-SYNC-05-A ~ 05-E` 系列报告 |
| 隐患 C1 关闭语义 | `review(pass)` 唯一正式关闭；`close()` 非正式收尾；`update()` 禁写复查字段 | N-02 / G-7 = PASS |
| 风险 02 规则源 | 规则为可版本化数据源，禁硬编码 | 「02 冻结 = PASS」 |
| 风险 03-01~03-04 | 14 表 / 57 索引 / 84 约束 / 视图；块键冻结 | `03-04 实施 = PASS（DEV）`、`04-01-R2 = PASS` |
| 培训状态机 S1 | 状态机 WARN-ONLY + 审批字段 + `createPlan` 覆盖 | `docs/AI智能分析/P3-16/P3-16-*-REPORT.md`（S1 / S1.5 / S1.6） |
| 权限模型 | `requireRole`/`requirePermission` + 前端 `meta.authority` 过滤 | 前端路由注释记录 P0 越权缺陷已修 |
| 认证与会话 | 不改登录/JWT/锁定机制 | 本任务明确禁止修改 |

---

## 7. 更新规则

1. **状态只能按 §1 的十档取值**，禁止自造 `已完成`、`基本完成`、`可用` 等描述。
2. **升级到 `BACKEND` 的条件**：表里有真实数据 + 有 service + 有 API。三者缺一不可。
3. **升级到 `FROZEN` 的条件**：有独立报告编号 + PASS 结论。缺一不可。
4. **降级必须写原因**。例如某表被清空，则从 `BACKEND` 降到 `DATA_MODEL`，并在"下一步"写清原因。
5. 每次变更同步更新 §2 统计概览的数字。
6. 本文件不改表结构、不改代码，只改状态与证据。
