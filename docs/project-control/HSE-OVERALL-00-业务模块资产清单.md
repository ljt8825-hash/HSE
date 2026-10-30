# HSE-OVERALL-00｜业务模块资产清单

> 判定标准（任务书第八部分 14 项）：入口 / 前端页面 / 后端 API / Service / DB 设计 / 权限 / 基本增删改查 / 状态流转 / 操作留痕 / 自动化测试 / 实施报告 / 独立验收 / 阻断问题 / 跨模块关联。
> 闭环等级：A=14 项基本齐备；A-/B+ 有单项缺口；B=主链路通但有并行栈；C=有页面或接口无闭环证据。
> 证据来源为 2026-10-30 只读盘点（HEAD 67245d1）+ 历史审计文档；"报告可信度"列说明历史 PASS 是否仍可信。

## A 级（具备完整闭环证据）

### 1. 人员底座（employee 域）
- 入口：`/personnel/employee|profile|import|over-age`（web-naive `router/routes/modules/hse-personnel.ts`）
- API：`server/routes/hse-employee/`（employee/assignment/terminate/rehire/history/import/selector/org-tree/position/certificates/trainings/over-age/profile-center/inspection-center/safety-profiles 共 15 子文件）
- Service：`employeeService.js` `employeeAssignmentService.js` `employeeStatusDict.js` `employeeImportV1/V2Service.js` `employeeProfileService.js`
- DB：`employee` `employee_assignment` `employee_history` `hse_responsibility` 等（v59~v69 迁移）
- 状态流转：`employment_relation` 三层权威（L1 关系→L2 任职段→L3 派生展示）；终态唯一出口 A-02A `/org/terminate`、正向出口 B2.2 `/org/rehire`、普通编辑 W1 已收口（A-02B，-4 硬拒）
- 测试：employee-terminate(15)/rehire/relation-d1+terminal-guard(73)/import-v1-v2-terminal-guard/status-code；全绿（EXIT=0）
- 报告：B02-DEC-03.13~03.35 全链（docs/AI智能分析/），含 03.34-R 独立验收
- 遗留 GAP：终态人无当前段时 V2 审核页仍可显示入库、A（编辑关系事务化）未做、DB-INT 未连库核验
- 报告可信度：高（最新节点 03.35 自带方法学纠正）

### 2. 安全生产费用（cost 域，P2）
- 入口：`/objectives/budget/cost`（hse-objectives.ts）
- API：`server/routes/cost.js` + `cost/main.js`；Service `costService`
- DB：`hse_cost_*` 9 张（20261023_hse_safety_cost_domain.sql）+ `hse_safety_budget`
- 修复：5e8b052（禁运行时 DDL/分摊总额校验/导入防重/金额严解析）+ 299d9ab（事务原子性）
- 测试：cost.service.test 37 用例连库全绿
- 保护态：`server/routes/cost.js` 唯一 staged A、md5 `e88ae2b0…`（冻结）
- 报告可信度：高

### 3. 隐患排查治理（canonical 层，P3-04）
- 入口：`/hazards/list`；API `routes/hazards/main.js`、`hse-hazard-rectification/`；Service `hazardService`
- DB：canonical = `hse_events/hse_rectifications/hse_reviews`（hse_core_v1）；legacy `hazards` 110 条
- 已落地：canonical 状态封口（d0066c4）、复查权限 `hse:hazard:review`（G-8 实测 admin 403/l0822 放行）、状态写路径 16 点治理
- 断裂：四通道 11 表并行栈未合并、110 条无业务主键、closed 零复查证据（B02 定局）
- 报告可信度：中高（P2-F 复审已纠偏）

### 4. 风险分级管控（risk-library，P3-05）
- 入口：`/risk-library/scenes|project-risks|blocks`、`/risk/list|map`
- DB：14 张风险库表已迁 dev（M0-M6，`20261025_p3_05_03_04_risk_*.sql`），块级模型 R1-R4 修复完毕
- 缺口：业务回填 P3B-C blocker 链未清、Risk02 Excel 导入确认流未执行
- 报告可信度：高（全套审计链 51 份）

### 5. 月度安全履职考核（引擎层）
- 入口：`/objectives/assessment-monthly/*`（workbench/portal/freeze/scoring/targets + 8 镜像页）
- DB：sprint10d2 7 表 + 规则引擎 6 表 + 双套规则表并存（`hse_assessment_rule` vs 裸 `assessment_rule`）
- 已落地：规则版本快照/扣分复原/责任链稳定/导出一致（P1-A 4 项）+ 历史保护 P0 5 项（287 用例）
- 结构缺陷：总分上限设计失效（67 人 E 档）、排名结构性不存在（B02-DEC 定局，待业务裁决）
- 报告可信度：中（引擎改造已验证，总分缺陷未修）

### 6. WPS 三违闭环（mw，H5 移动 HSE）
- 入口：`/mw/violation/capture→person→behavior→dispose→rectify/transfer`（5 步已投产）
- 后端：wps 系 service + `routes/wps-grid-sync.js`
- 报告可信度：高（东部案例唯一采信来源；OCR/隐患分析明确标注建设中）

### 7. 网格巡查同步（WPS→PG）
- 引擎：`wpsGridPullEngine.js` 只写 `grid_inspection_records`+`grid_record_sync_map`，反向写硬锁 false
- 验证：WPS-PG-SYNC-05-B 二次真实 Pull 幂等 PASS（2063/2061 条 0 变更）
- 报告可信度：高（引擎自报+埋点+pg_stat+指纹四重证据）

### 8. 公司级 AI（AI-Phase-01/02）
- 入口：`/company/knowledge-qa|excel-analysis|document-parse|inspection-analysis|report-generate`
- 后端：company-ai/ai-knowledge/ai-v2；DB：ai05_knowledge_base_v1（4 表）+ ai_capability_layer_v1
- 验收：AI-Phase-01-08 整体验收 + Phase-02-01 转正报告（docs/AI智能分析/）
- 报告可信度：高

### 9. 培训管理（状态机层，P3-16）
- 入口：`/training/plans|records|assessments|certificates|comprehensive`
- 已落地：trainingPlanStatusMachine WARN-ONLY 状态机 + createPlan/updatePlan 覆盖（T1-T8）
- 缺口：`training_records`(复数) 与 `training_record`(v63 单数) 双表并存未合并
- 报告可信度：中高

## B 级（主链路通、存在并行栈或缺口）

| 模块 | 页面 | API/Service | 主要缺口（证据） |
|---|---|---|---|
| 组织与区域主数据 | /personnel/departments,positions | hse-org-center | departments→department(已弃用标记)→hse_org_unit 三表并存；乡镇无主表仅文本列 |
| 保险与理赔 | /insurance/personnel,vehicle,other | insurance/ 9 子路由 | insurance_history / insurance_policies+other_insurance / vehicles 运行时 ALTER 16 列，三套存储并存 |
| 目标职责/责任制 | /objectives/responsibility,committee,assessment | objectives/main, hse-responsibility-forms | hse_safety_budget 双持有（objectiveService 运行时建表 vs cost 域） |
| 预警/告警中心 | /hse/alerts, /hse/warning-center | hse-warning-center, alerts | alerts 缺 is_deleted 过滤（P2）；调度器 2 处 |
| 驾驶员/交通安全 | /site/driver/*, /overview/driver-risk-center | hse-driver-risk-center | driver_profile 仅 doc-only；license_demerit_records 单表支撑 |
| 系统管理 | /system/users,roles,audit | users,roles,menus,audit | menus 表不是菜单真源（前端静态路由才是） |
| 标准法规 | /standards/* 6 页 | standards/main, hse-standard-* | 关联关系 hse_clause_relations 覆盖待核实 |
| 台账中心 | /ledger/training,violation,grid | checkLedger 工厂 | 口径与各源表对齐待核实 |
| 事故管理 | /accidents | accidents/main | status 5 值混存；accidentService:153 双向映射缺 pending |
| 三违管理（Web 侧） | /site/violation/* | violations/main | violations(1451 无写入) vs violation_records(2514 活) 双表并存 |

## C 级（有页面/接口、无闭环证据）

| 模块 | 证据 |
|---|---|
| 检查管理（日常/专项） | hse_inspection_*/inspection_* 8 张表全 0 行；真检查在 grid_inspection_records(2069)；页面 /site/transfer-stations、/site/fire-facility 有 API 无流转 |
| IoT 物联网 | /hse-advanced/iot 单页，无数据源接入证据 |
| 供应链安全 | /hse-advanced/supply-chain 单页 |
| BI 报表 | /overview/bi + hse/bi 页面，取数口径未与统计同源原则对齐 |
| 文档/知识库 | /hse/documents/library,review；hse_document_* 6 表写入低频待核实 |
| 应急管理 | /emergency/* 5 页；emergencyService 运行时建 8 表，演练/事件闭环无验收证据 |
| 批量导入平台 | /hse/batch-import；hse_batch_import_* 2 表，与 employee_import_v2 并行 |
| 镜像展示页 ×8 | /objectives/assessment-monthly/mirror/*（violation-analysis/ledger/assessment/driver-monthly/transfer-stations/grid-mgmt/grid-ledger/training-records）为只读复刻页 |

## 冻结域（不参与重构排期，另行授权）

- **移动端 H5 网格巡查**（/mobile/*）：生产链路 grid-mobile-cloudflare 全链冻结（frontend→Pages Functions→Worker→feishuAdapter→飞书 Bitable）；PG 侧零接收（B00 四重验证 NOT FOUND）。
- **返聘功能**：B2.2 已交付但按 03.35 任务书保持冻结。
- **cost.js**：发布完整性保护态。

## 汇总

| 等级 | 数量 | 模块 |
|---|---|---|
| A/A- | 9 | 人员底座、费用、隐患(canonical)、风险库、月度考核(引擎)、WPS三违闭环、网格同步、公司AI、培训(状态机) |
| B | 10 | 组织区域、保险、目标职责、预警、驾驶员交通、系统管理、标准法规、台账中心、事故、三违(Web) |
| C | 8+ | 检查管理、IoT、供应链、BI、文档知识库、应急、批量导入、镜像页组 |
| 冻结 | 3 | H5 生产链路、返聘、cost.js |
