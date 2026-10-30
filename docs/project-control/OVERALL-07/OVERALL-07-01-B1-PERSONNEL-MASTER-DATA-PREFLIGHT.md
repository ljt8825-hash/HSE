# OVERALL-07｜B-1 人员主数据改造前置核验报告

- 报告编号：OVERALL-07-01
- 节点：OVERALL-07 / 业务子节点 B-1（人员主数据改造前置核验）
- 执行性质：只读审计 + 架构核验 + 改造方案准备（本轮零代码修改、零数据库写操作、零数据修改）
- 执行日期：2026-10-30
- 执行环境：Windows / Git Bash / PostgreSQL（仅 safety_dashboard_dev 只读查询）
- 上位文档：`docs/架构基线/`（DECISION-006 等）、`docs/project-control/OVERALL-04/`（预审清单）、C1/C2 固化报告

---

## 1. 执行摘要

本轮核验回答任务书十项核心问题，核心结论：

1. **系统事实上只有一套活的人员主数据：`employee`。** 数据库 39 个外键全部指向 `employee`，0 个指向 `personnel`；`personnel` 表 dev 库 0 行、无外键引用、web-naive 前端无调用，已是一座"孤岛"（代码层面仍残留一条活的 CRUD 路由 `/api/personnel`）。
2. **`personnel` 的历史职责已被 `employee` 完全接管**：`sql/unified_schema.sql:135` 的 22 列旧表（文本 dept/position、status 在职/离职）对应 v59 之前的旧模型；v59（`server/sql/hse_employee_master_v59_migration.sql`）起确立"employee 为唯一人员表"。
3. **事实权威写入路径已形成**：employeeService / employeeAssignmentService / employeeImportV1V2 / rehireEmployee 全部写 `employee` + `employee_assignment`；保险域还有 fail-closed 的 `employeeResolver`（`employee.id` 唯一关联键）。
4. **真正的 B-1 改造焦点不是 employee vs personnel，而是四个次级双轨**：
   - `employee_assignment`（活，22,295 行）vs `hse_employee_relation`（v68 新模型，1,304 行）两套任职段模型，且两个视图分别站在两边（`v_employee_current` 用 assignment，`v_employee_org_full` 用 relation）；
   - `personnel_id` 命名遗留列三种状态（实存 employee.id / 全部失配 / 全空）；
   - 文本姓名关联（快照列 + 4 个解析器模式）；
   - v59 旧组织模型（department / hse_employee_org，已标 is_deprecated 但数据未清）。
5. **一处 P1 级数据语义断裂**：`over_age_personnel.personnel_id` 1,300 行 0% 命中 `employee.id`，而 `overAgeService.js:108,127` 已把它当 `employee.id` JOIN——超龄人员台账关联事实失效。
6. C2 六项遗留问题逐项核验：全部仍处于登记时状态，无一被顺手修复（符合纪律）。
7. 结论：**employee 为权威底座的目标架构与现状相容**，迁移主战场是 personnel_id 遗留列数据回填、任职段模型二选一裁决、以及补齐缺失外键；不需要"两张人员表合并"级别的迁移。

---

## 2. 执行前 Git 基线（实测）

| 项目 | 实测值 | 判定 |
|---|---|---|
| 仓库 | `ljt8825-hash/HSE`（origin） | ✔ |
| 分支 | `feat/b02-dec-03.13-a02d-status-code` | ✔ |
| 本地 HEAD | `7e492c3ff9b6460c88a3a519c477f09774414818` | ✔ 与远端一致 |
| 远端 origin SHA | `7e492c3ff9b6460c88a3a519c477f09774414818` | ✔ 无漂移 |
| C1 业务提交在历史中 | `2407c10`（merge-base --is-ancestor PASS） | ✔ |
| C1 报告提交 | `bdc33f1` | ✔ |
| C2 业务提交 | `27f6f11`（在历史中） | ✔ |
| C2 报告提交 | `7e492c3`（=HEAD） | ✔ |
| 工作区 | 145 untracked / 1 staged / 50 modified | ✔ 与 C2 收尾态一致 |
| `server/routes/cost.js` | staged `A` | ✔ 保护态不变 |
| cost.js MD5 | `e88ae2b0b275346dfc1431408aa00bff` | ✔ 一字未动 |
| 人员域并行编辑 | 50 个 modified 文件中 employee/personnel/assignment/relation 相关 **0 个** | ✔ 无并行编辑 |
| untracked 中人员域文件 | 仅 2 份历史报告 md（03.3 / 03.6 只读审计报告），非代码 | ✔ |

判定：基线干净，无分支漂移，无保护对象变化，核验可以继续。

---

## 3. 人员核心数据表清单

证据来源：migration SQL（`server/sql/hse_employee_master_v59_migration.sql`、`server/sql/hse_org_center_v68_migration.sql`、`sql/unified_schema.sql`）+ dev 库 information_schema / pg_constraint 只读查询（查询时间 2026-10-30）。

### 3.1 employee（权威人员主表，v59）

- 定义：`server/sql/hse_employee_master_v59_migration.sql:112-133`
- 主键：`id BIGSERIAL`
- 业务唯一标识：`employee_code`（部分唯一索引 `uk_employee_code`，`WHERE employee_code IS NOT NULL AND is_deleted = false`，:136-137）
- 敏感字段：`id_card VARCHAR(128)` / `phone VARCHAR(64)` AES-256-GCM 加密存储；v60 增加 `id_card_hash` / `phone_hash`（HMAC-SHA256 确定性哈希，供等值查询）
- 权威状态字段：`employment_relation`（辞职/正式员工/死亡/退休/NULL=待核实）——B02-DEC-03.22 附录 C/D 定案的唯一权威
- 审计字段：created_at / updated_at / is_deleted（软删）
- 外键：**39 个外键的引用目标**（见 3.10）
- dev 数据量：**3,401 行**（未软删）
- employment_relation 分布（dev 实测）：辞职 1,951 / 正式员工 1,291 / NULL 152 / 死亡 7（无"退休"值——退休以 inactive 段+历史事件表达）
- 重复性实测：employee_code 重复 0；id_card_hash 重复 0
- 主要读写服务：employeeService.js、employeeAssignmentService.js、employeeImportService.js、employeeImportV2Service.js、employeeStatusDict.js、authenticatedEmployeeResolver.js、currentEmployeeContext.js
- 权威性判断：**已确证的权威人员身份底座**（结构、约束、数据、写入路径四重证据一致）

### 3.2 personnel（旧人员表，孤岛）

- 定义：`sql/unified_schema.sql:135-157`（同构副本 `scripts/import_schema.sql:135`）
- 主键：`id BIGSERIAL`；业务标识：`employee_code`（普通索引非唯一）、`id_card`（唯一索引 `uk_person_idcard`）
- 组织/岗位：**文本列** `dept VARCHAR(64)` / `position VARCHAR(64)`（无外键）
- 状态：`status VARCHAR(16) DEFAULT '在职'`（在职/离职，与 employment_relation 语义不同）
- 审计：created_at / updated_at / is_deleted
- dev 数据量：**0 行**
- 外键：**0 个表引用它**（pg_constraint confrelid='personnel' 实测 0 行）
- 残留活代码：`server/routes/personnel.js`（239 行完整 CRUD，挂载 `app.js:441` → `/api/personnel`）；`routes/over-age-personnel.js`（255 行）
- 前端：web-naive（`安全看板vben/apps/web-naive`）grep `api/personnel|over-age-personnel|personnel` **零命中**（注：仅核验了 web-naive，其他前端变体未逐一核验，见 §13）
- 权威性判断：**已无数据、无外键、无前端调用的孤岛**；其"表"仍在，但职责已 100% 转移到 employee

### 3.3 employee_assignment（事实任职段表）

- dev 数据量：**22,295 行**（未软删）
- 现状实测：is_current=true 的段 **3,238 人各恰好 1 条**（`uk_emp_assign_primary` 部分唯一索引生效后的健康态）；非 current 段 19,057 行，其中 **16,826 行 status 仍为 'active'**（历史段未改 former，语义混杂）；status 分布 active 20,064 / former 2,221 / inactive 10；同 employee 同 start_date 的重复对 **3,239** 个
- 外键：`fk_assignment_employee`（REFERENCES employee(id)）、`fk_employee_assignment_supervisor`
- 权威性：**当前唯一活的任职段模型**（`v_employee_current`、employeeService、assignEmployee、rehireEmployee、全部读侧均基于它）
- 关联问题：B-01~B-05 约 12,955 行重复语义待裁（OVERALL-04 登记），本轮 dev 实测的 16,826 active 非 current 行是其主要构成之一，精确口径裁决归 B-3

### 3.4 hse_employee_relation（v68 新任职段模型，半启用）

- 定义：`server/sql/hse_org_center_v68_migration.sql:97-138`
- 结构：employee_id NOT NULL、org_unit_id NOT NULL、operation_unit_id/position_id/supervisor_id 可空、is_current/is_primary、status(active/leave/transfer/pending)
- 唯一约束：`uk_hse_emp_rel_primary`（部分唯一索引：employee_id WHERE is_deleted=false AND is_current AND is_primary）
- dev 数据量：1,304 行（其中 current+primary 1,304 行=全部）
- 外键：**建表时未声明 REFERENCES**（仅注释"关联employee.id"），实际无 DB 外键
- 权威性：**双轨中的"新轨"**——只有 `v_employee_org_full` 视图和少数新代码使用；`v_employee_current`（保险、考核、培训解析器的落点）用的是 employee_assignment
- 两份 DDL 的 `org_unit_id/position_id` 可空性冲突（C2 遗留⑤/DB-INT）即指此表：v68 定义 org_unit_id NOT NULL，后续迁移稿允许可空，未最终定版

### 3.5 hse_org_unit / hse_operation_unit（v68 组织中心）

- 定义：`server/sql/hse_org_center_v68_migration.sql:15-91`
- hse_org_unit：org_code 部分唯一索引；manager_id 注释关联 employee.id（无 FK）。dev 20 行
- hse_operation_unit：unit_code 唯一；org_unit_id NOT NULL（无 FK）；supervisor_id 注释关联 employee.id。dev 88 行
- 权威性判断：**管理组织权威底座**（与架构基线 DECISION-006 一致），数据量小且健康

### 3.6 department / hse_employee_org（v59 旧组织模型，已废弃未清）

- 定义：`server/sql/hse_employee_master_v59_migration.sql:36-194`（五级树 department + hse_employee_org）
- v68 明确"旧表标记 deprecated"：`department.is_deprecated` / `hse_employee_org.is_deprecated`（v68:189-208）
- dev 数据量：department 92 行、hse_employee_org 1,285 行（数据仍在，标记已加，读写代码大部分残留）
- 权威性判断：**已废弃、待退役**；B-1 须防止新代码再引用，迁移期作为历史只读保留

### 3.7 position（岗位）

- v59 定义（:77-95），v68 扩展 risk_level/is_safety_critical/job_category/position_code
- `position_code` 在 v68 才补加且**无唯一索引**（v59 注释称 UNIQUE 但 v68 补列时未建索引）
- 权威性：岗位权威底座，personnel 表的文本 `position` 列是其旧对应物

### 3.8 employee_history（人事变动记录）

- v59 定义（:203-229），employee_id NOT NULL REFERENCES employee(id)
- dev 1,300 行；返聘（B2.2）已写入该表
- 权威性：生命周期历史权威记录（只增不改）

### 3.9 关键视图

- `v_employee_current`：DISTINCT ON (e.id)，**employee LEFT JOIN employee_assignment**（is_current+is_primary）+ hse_org_unit + hse_operation_unit + position（dev 实测 pg_get_viewdef）。**基于旧任职段模型**。
- `v_employee_org_full`：employee LEFT JOIN **hse_employee_relation**（v68:214-255）。**基于新任职段模型**。
- `v_employee_with_age`：纯 employee。
- 判定：**两个"当前任职"视图分属两套模型，是 B-1 必须裁决的结构性双轨**（保险解析器、overAgeService、培训解析器等读 v_employee_current；考核对象同步等读 v_employee_org_full——两个世界各自自洽但互不相通）。

### 3.10 外键全景（dev 实测 pg_constraint）

指向 employee 的外键共 **39 个**，覆盖：accidents(2)、emergency_events(1)、emergency_plans(1)、employee_assignment(2)、employee_induction_training(1)、employee_training_status(1)、hazards(2)、hse_assessment_audit_log(1)、hse_assessment_deduction(1)、hse_assessment_target(1)、hse_control_measures(1)、hse_deduction_adjustment(2)、hse_events(1)、hse_event_timeline(1)、hse_grid_inspection_records(1)、hse_responsibility(1)、hse_rectifications(1)、hse_responsibility_assessment(1)、hse_responsibility_chain(2)、hse_reviews(1)、hse_safety_budget(1)、hse_safety_committee(1)、hse_target_contracts(2)、personnel_insurance(1, ON DELETE RESTRICT)、risk_level_records(1)、risk_score_history(1)、risk_score_records(1)、safety_goals(1)、training_record(1)、violation_records(4)、project_risk_record(1)。

指向 personnel 的外键：**0 个**。

---

## 4. 人员主数据权威性判断

| 问题 | 结论 | 证据 |
|---|---|---|
| 存在几套人员主数据？ | **1 套活（employee）+ 1 套死数据壳（personnel）+ 1 套废弃组织附属（department/hse_employee_org）** | §3.1/3.2/3.6 |
| employee 承担什么？ | 人员身份唯一底座：身份标识（code/加密证件/哈希）、用工关系（employment_relation 权威）、被 39 个外键引用 | §3.1/3.10 |
| personnel 承担什么？ | 曾经的全能人员表（含文本组织岗位），现 0 行；仅剩 `/api/personnel` 死路由与 `personnel_id` 历史列名 | §3.2、§6 |
| 未来权威底座？ | **employee（无需换轨）**；组织=hse_org_unit、岗位=position；任职段=employee_assignment 或 hse_employee_relation 二选一（待裁决，§12-D3） | §5/§12 |
| 事实权威写入路径？ | 已形成：employeeService（增改）、employeeAssignmentService（调岗/终态/返聘）、employeeImportV1V2（导入）；无任何活代码写 personnel 数据 | §6 |

---

## 5. 全业务人员引用关系矩阵

逐域核验结果（证据=文件:行号 + dev 库实测；标注：**[FK]**=数据库外键、**[ID]**=应用层 ID 引用、**[TXT]**=文本快照/关联、**[RES]**=存在解析器）：

| 业务域 | 人员引用方式 | 引用的人员表/视图 | 数据佐证（dev） | 迁移风险 | 结论 |
|---|---|---|---|---|---|
| 人员档案 | employee.id **[ID]** | employee | 3,401 行 | 低 | 强ID |
| 人员分配 | employee_assignment.employee_id **[FK]** | employee + hse_org_unit | 22,295 行；每人 1 current | 中（16,826 active 非当前段语义） | 强ID |
| 导入 V1/V2 | employee_code/id_card_hash/phone_hash 解析 **[ID]** | employee | — | 中（V2 审核阶段缺口） | 强ID |
| 培训（/api/training，training_records 复数） | employee_id/trainer_id **[ID]**、personnel_id 遗留列、name/id_card **[TXT]** | employee、v_employee_org_full；**无 FK** | 5 行；personnel_id 5/5 命中 employee.id | 中：ID 列为 ALTER 后加，文本列并存 | 混合 |
| 培训（HSE 员工域，training_record 单数） | employee_id **[FK]** | employee | fk_training_record_employee 已建 | 低 | 强ID |
| 入职培训/培训状态 | employee_id **[FK 计划内]** | employee | 两个 FK 因孤儿数据**跳过未建** | 中 | 强ID（FK 待补） |
| 考核（新栈 hse_assessment_*） | employee_id/violator_id **[FK]** + employee_name/employee_code **[TXT快照]** | employee、v_employee_org_full | FK 已建（hse_fk_phase2_assessment_events.sql:65-67） | 低 | 强ID |
| 考核（旧栈 assessment_records） | id+文本混合，无 FK | employee | — | 中 | 混合 |
| 三违归因 | violator_name **[TXT]**→解析 **[RES]** | employee + hse_violator_name_resolution 人工映射表 | violatorResolver 未命中走人工映射 | 中 | 混合（解析器已 fail-closed） |
| 三违/违规记录（violation_records） | violator_id/inspector_id/handler_id/punisher_id **[FK]** | employee | 4 个 FK 已建 | 低 | 强ID |
| 隐患 | checker_id/fixer_id **[FK]** | employee | fk_hazards_checker_id / fk_hazards_fixer_id | 低 | 强ID |
| 事故 | reporter_id/handler_id **[FK]**；personnel_id **[ID遗留列名]**；involved_person **[TXT]** | employee | 56 行：personnel_id 4/56 且 100% 命中 employee.id；accident_persons 0 行 | 中（列名误导） | 强ID+快照 |
| 保险 | employee_id **[FK RESTRICT]** | employee（employeeResolver fail-closed） | 2,474 行：2,320 有 employee_id、0 孤儿、0 用 personnel_id | 低 | 强ID（全系统最严） |
| 超龄人员 | over_age_personnel.personnel_id **[ID，语义已切换]** | overAgeService.js:108,127 按 employee.id JOIN | 1,300 行 **0% 命中** employee.id | **高（P1）** | 断裂 |
| 车辆/驾驶员（driver_monthly） | personnel_id **[ID遗留列名]** | employee | 489/489 行 100% 命中 employee.id | 低（改名即可） | 强ID |
| 驾驶员新表（license_demerit_records / vehicle_inspection_records） | employee_id **[ID]** + employee_name **[TXT快照]**，无 FK | employee | init-driver-tables.js:7-32 | 低 | 强ID+快照 |
| 网格区域（grid_areas） | personnel_id **[ID遗留列名]** | employee | 63/63 行 100% 命中 employee.id | 低（改名即可） | 强ID |
| 巡查（grid_inspection_records / hse_grid_inspection_records） | inspector_employee_id **[FK]** | employee（gridEmployeeCodeResolver 唯一解析出口） | fk_grid_inspection_employee 已建；解析器 :57,:76 严禁 code 直赋 | 低 | 强ID |
| 应急（emergency_events / emergency_plans） | personnel_id **[FK→employee]**；emergencyService 内 31 处文本快照 | employee | emergency_events 0 行；FK 已建 | 低 | 强ID（空表） |
| 费用（hse_safety_budget 等） | responsible_employee_id **[FK]** + responsible_person **[TXT快照]** | employee | fk_safety_budget_responsible 已建 | 低 | 强ID |
| 证书（employee_certificate） | employee_id NOT NULL，**无 FK**，应用层校验 **[ID]** | employee（读取一律 JOIN 实时取名，无文本存储） | employeeCertificateService.js:144-145 | 中（FK 待补） | 强ID（FK 缺失） |
| 事件（hse_events） | personnel_id **[FK→employee]** | employee | 16 行，2 行有 pid 且命中 | 低 | 强ID |

要点提炼：

1. **没有任何域"仍在依赖 personnel 表数据"**——所有名为 personnel_id 的活数据实际存的都是 employee.id。
2. 文本姓名关联全部呈现"**快照列 + 解析器**"形态（employeeResolver / violatorResolver / resolveTrainingPersonId / gridEmployeeCodeResolver / authenticatedEmployeeResolver），且主流解析器均 fail-closed（重名拒绝、不自动取第一条）。
3. 待回填/修复的数据断点只有一个实质热点：over_age_personnel 的 1,300 行。

---

## 6. 人员写入通道清单

### 6.1 主写入服务（employee 域）

| 通道 | 文件:位置 | 写入目标 | 状态 |
|---|---|---|---|
| 新增/编辑人员 | employeeService.js | employee | 活；W1 收口：`updates.employment_relation !== undefined` 直接 `error:-4`（:489-494 区域，C2 已固化） |
| 调岗/分配 | employeeAssignmentService.assignEmployee（:419 起） | employee_assignment + employee_history | 活；事务内 FOR UPDATE 复核（C2 固化）+ B1 终态闸门 checkRelationAllowsAssignment（:399-410，只读 employment_relation） |
| 终态登记 | employeeAssignmentService（:1100 起事务） | employee.employment_relation + assignment 关段 + history | 活；三重闸门（软删/关系为空/重复终态，:1101-1132） |
| 返聘 | employeeAssignmentService.rehireEmployee（:648-852） | 关系重置正式员工 + 新段 reinstated + history('返聘') | 活；资格仅 `employment_relation='退休'` |
| 导入 V1 | employeeImportService.js | employee + employee_assignment | 活；C1 终态闸门 :549 |
| 导入 V2 | employeeImportV2Service.js | employee + employee_assignment | 活；执行阶段闸门 :974-998（解析键 employee_code→id_card_hash→phone_hash+name） |
| 保险人员 | insurancePersonnelService 等 | personnel_insurance（employee_id FK RESTRICT） | 活；employeeResolver fail-closed（employeeResolver.js:31-94，多键冲突拒绝 :85-92） |
| 状态字典 | employeeStatusDict.js | （只读字典）isTerminalRelation :287；ACTION_ONLY_STATUS_CODES :102 | 活 |

### 6.2 任务书 4.3 的七个问题逐答

1. **新增人员由哪个服务写入？** employeeService（单笔）+ employeeImportService（V1 Excel）+ employeeImportV2Service（V2 两阶段）。无第四个新增入口。
2. **人员编辑由哪个服务写入？** employeeService.updateEmployee；用工关系字段硬拒（W1）。
3. **离职、退休、返聘分别由谁写入？** 全部经 employeeAssignmentService：终态登记事务（:1100 起）办离职/退休；rehireEmployee（:648）办返聘；通用状态变更接口已封堵「返聘」入参（:892-900）。
4. **V1/V2 导入是否都经过统一校验？** 终态判定统一引用 employeeStatusDict.isTerminalRelation（V1 :11/:549，V2 :31/:998）；但 **V2 审核阶段不读关系**（见 §9-②），校验尚未全程统一。
5. **人员关系是否与人员状态保持事务一致？** 终态/返聘/调岗主事务内一致（同事务写关系+段+历史）；例外=V1 导入关段与建段分离的既有缺口（§9-③）。
6. **是否存在绕过人员服务直接写表的路径？** 发现两处：(a) `server/routes/personnel.js` 直接 pool.query CRUD 写 personnel 表（数据已空，属死路由但代码活）；(b) 培训域 trainingRegisterService 等直接 INSERT training_records 并携带自解析的 employee_id（经 resolveTrainingPersonId，解析器合规但写路径不经人员服务）。
7. **是否存在多个服务各自维护人员状态？** 无并行关系写入者；但**终态判定逻辑有两份**（checkRelationAllowsAssignment 与 isTerminalRelation，语义同源、实现未合并，§9-④）。

---

## 7. 数据质量风险清单（dev 只读实测）

| 编号 | 风险 | 量化 | 等级 | 可自动修复性 |
|---|---|---|---|---|
| DQ-1 | over_age_personnel.personnel_id 全部失配 | 1,300/1,300 行 0% 命中 employee.id；而 overAgeService.js:108,127 按 employee.id JOIN | **P1** | 部分：可用 id_card（明文列）哈希匹配 employee.id_card_hash 自动解析，命中率待测；未命中须人工裁决。同名/同证不直接认定同一人（任务书纪律） |
| DQ-2 | employee_assignment 历史段 status 语义混杂 | 16,826 行 active 且非 current（former 仅 2,221） | P2（B-3 裁决范围） | 需 B-01~B-05 口径裁决后批量修正 |
| DQ-3 | 重复任职段（同 employee 同 start_date） | 3,239 对 | P2（B-3） | 需裁决 |
| DQ-4 | employment_relation=NULL 待核实 | 152 人 | P2 | 禁止补值（既定规则），须人事核实 |
| DQ-5 | employee_certificate / employee_induction_training / employee_training_status 外键缺失 | FK 未建（后者两个因孤儿数据跳过） | P2 | 先清孤儿再补 FK，可自动+人工复核 |
| DQ-6 | training_records 文本与 ID 并存 | 5 行（量小） | P3 | 低 |
| DQ-7 | hse_events 仅 2/16 行有 personnel_id | 16 行 | P3 | 低 |
| DQ-8 | position_code 无唯一索引（v68 补列未建） | — | P3 | 可自动（建唯一索引前需查重） |
| DQ-9 | accidents.personnel_id 填充率 4/56 | 列名误导，实际值全命中 employee.id | P3 | 改名/注释 |
| DQ-10 | 事故人员子表 accident_persons 0 行、emergency_events 0 行 | 结构就绪无数据 | 信息 | — |

**未发现（核验范围内）**：employee 重复工号 0；id_card_hash 重复 0；personnel_insurance 孤儿 employee_id 0；保险域 personnel_id 使用 0。上述"未发现"均在 dev 库+已列查询范围内成立（生产库未核验，见 §13）。

---

## 8. employee 与 personnel 差异分析

| 维度 | employee | personnel |
|---|---|---|
| 定义版本 | v59（Sprint5.1 主数据中心） | unified_schema（v59 之前旧模型） |
| 行数（dev） | 3,401 | **0** |
| 组织/岗位 | 无内嵌（经 assignment/relation 关联 hse_org_unit/position） | 文本列 dept/position |
| 用工状态 | employment_relation（权威，B02-DEC 定案） | status 在职/离职（简化） |
| 敏感字段 | AES-256-GCM + HMAC 哈希（可查询） | id_card/phone 明文列（uk_person_idcard 唯一） |
| 被外键引用 | 39 个 | 0 个 |
| 写入代码 | 5 个服务（全部经闸门） | routes/personnel.js 死路由 CRUD |
| 前端调用 | 员工管理全链路 | web-naive 零命中 |
| 历史数据迁移 | V1/V2 导入链已收编 | 数据已清空（0 行） |

**直接映射能力**：两者字段高度同构（name/employee_code/id_card/gender/birth_date/phone/person_category/person_type/is_public_welfare 逐列对应），但由于 personnel 0 行，**不存在需要映射的数据**。任务书"不能直接假定 employee.id 和 personnel.id 可以互换"——事实上 dev 库已无 personnel.id 存活，唯一需要处理的是历史表列中遗留的 personnel_id 值（§7 DQ-1/DQ-9 及 driver_monthly/grid_areas 的命中行）。

---

## 9. 六项 C2 遗留问题核验结果

| # | 遗留项 | 现状核验 | 证据 | 建议 |
|---|---|---|---|---|
| ① | 返聘撤销路径缺失 | **仍缺失**。rehireEmployee（ASG:648）为唯一返聘入口，全仓无 revoke/撤销返聘实现；误返聘只能人工改关系（该路径无事务/无 history） | 全仓 grep rehire/revoke 仅命中正向流程 | B-2 立项：补 revokeRehire 事务（对称于 rehire） |
| ② | V2 审核阶段不读关系 | **仍存在**。employment_relation 仅出现在执行阶段 :974-998；审核阶段（预检/确认函数群）零读取 | grep employeeImportV2Service.js 全文 | B-2 立项：审核阶段增加终态行提示/拦截（不改数据） |
| ③ | V1 关段缺 is_deleted/end_date | **仍存在**。employeeImportService.js:694 `UPDATE employee_assignment SET is_current=false, updated_at=NOW() WHERE employee_id=$1 AND is_current=true`——既不设 end_date 也不管 is_deleted，且会关掉所有 current 段 | :694 原文 | B-2 立项：与 assignEmployee 的关段范式对齐 |
| ④ | B1/C1 终态判定函数未合并 | **仍两份**。B1 用本地 checkRelationAllowsAssignment（ASG:399-410，基于 TERMINAL_RELATION_VALUES）；C1/终态/导入用 isTerminalRelation（DICT:287）。语义同源但实现独立 | §6.1 | B-2 低优先级：合并到 employeeStatusDict 单一出口 |
| ⑤ | DB-INT 集成核验未完成 | **未做**。两份 DDL 冲突仍开放：hse_employee_relation.org_unit_id NOT NULL（v68:100）vs 后续迁移稿可空；本表与 employee_assignment 的模型二选一未裁 | v68:97-138 + dev 实测 | 与 §12-D3 一并裁决 |
| ⑥ | B-01~B-05 12,955 行重复语义待裁 | **未裁**。dev 实测佐证其规模构成：22,295 行中 16,826 行为 active+非 current、3,239 对同日重复段 | §3.3 | 归 B-3（数据裁决），B-1 只需保证不再新增污染（闸门已就位） |

---

## 10. 目标架构建议

### 10.1 目标结构与现状相容性判定

任务书提议的目标（employee=身份权威、hse_org_unit=组织权威、hse_employee_relation=任职关系）逐项验证：

1. **employee 为身份权威：与现状完全相容**（39 FK + 全部活写入 + 数据健康）。无需迁移，只需"确认+封堵死路由"。
2. **hse_org_unit 为组织权威：相容**（20 行健康；v59 department 已标 is_deprecated）。风险点：残留代码仍读 department/hse_employee_org（1,285 行旧数据），须冻结禁写。
3. **hse_employee_relation 为唯一任职关系：与现状相容但代价高**——因为 v_employee_current、全部员工域服务、22,295 行 assignment 数据都站在 employee_assignment 一边。**建议反其道而行：确认 employee_assignment 为唯一任职段权威，将 hse_employee_relation 降级为"v68 实验轨"封存**（或反向，但须迁移 22,295 行 + 重写全部服务，代价不成比例）。此为**业务裁决事项 D3**，本轮仅给出成本对比，不替总控拍板。
4. **业务模块通过稳定身份引用人员：已基本实现**（快照列+解析器模式成熟），补齐证书/入职培训 FK 即可。

### 10.2 权威身份主键选择依据

- 主键：`employee.id`（BIGSERIAL 代理键）。依据：39 个外键已锁定；employee_code 是业务键但可变/可空（外部人员）；gridEmployeeCodeResolver.js:10-14 已把"业务身份键 employee_code ≠ 内部代理键 employee.id"写成铁律。
- 唯一性：employee_code 部分唯一（排除软删）；自然人消重靠 id_card_hash（HMAC 确定性），**同名/同手机号不认定同一人**（任务书纪律，且 employeeResolver 对多候选 fail-closed）。

### 10.3 personnel 处置策略

推荐**三步归档**：
1. 数据层：表已 0 行，无需迁移；保留表结构一个观察期（或由总控授权后改名 `personnel_retired`——DDL 属 B-1 实施阶段）。
2. 代码层：`/api/personnel` 路由降级（只读 410/404 或直接摘除挂载 app.js:441）；over-age-personnel 路由改为读 employee。
3. 文档层：在架构基线标注 personnel 为 RETIRED（对应 B-0 审计的 RETIRE 分类）。

### 10.4 personnel_id 遗留列三态处置

| 态 | 表 | 处置 |
|---|---|---|
| A：值实为 employee.id（100% 命中） | driver_monthly(489)、grid_areas(63)、accidents(4/56)、training_records(5)、hse_events(2) | 低风险改名/加注释（新增 employee_id 列→回填→切读→弃旧列），可全自动 |
| B：值失配 | over_age_personnel(1,300) | 先用明文 id_card→hash 匹配 employee.id_card_hash 试回填；命中部分可自动，未命中列清单交业务裁决（不合并、不猜测） |
| C：全空 | training_roster(58)、personnel_insurance(已双列过渡完成) | 弃用列，零风险 |

### 10.5 文本姓名关联兼容策略

维持既有"快照列 + fail-closed 解析器"范式并收敛到统一入口：新建共享 personResolver 门面（内部委托 employeeResolver/violatorResolver/resolveTrainingPersonId/gridEmployeeCodeResolver 已有实现），新模块禁止裸 `WHERE name=`。历史快照列保留（展示/审计用途），不清洗。

### 10.6 避免双写与身份分叉

- 单写原则：所有关系/状态写路径已在 employeeAssignmentService 单点（V1/V2 导入闸门已收口）；B-1 实施时把 routes/personnel.js 死路由摘除即消除最后一处"绕过服务直写"。
- 身份分叉防护：不新建任何人员 ID 体系；personnel_id 类列一律映射到 employee.id；冻结 department/hse_employee_org 写入。

### 10.7 分阶段迁移与回滚方案（B-1 实施期使用）

- 阶段 P0（只读）：生产库数据质量复核（本轮仅 dev，生产凭据未动用）。
- 阶段 P1（零数据变更）：摘除 /api/personnel 死路由；personnel/department/hse_employee_org 冻结注释；统一解析器门面。
- 阶段 P2（数据回填，dev 先行）：DQ-1 over_age_personnel 回填（id_card hash 自动 + 人工清单）；A 态列改名三步走。
- 阶段 P3（约束补齐）：employee_certificate 等 FK 补建（先孤儿清查）。
- 阶段 P4（视图统一）：v_employee_current / v_employee_org_full 按 D3 裁决结果收敛为单一任职段视图。
- 回滚设计：每阶段前置快照表（`_bak_` 前缀，兼容既有排除规则）；DDL 全部包裹事务；P2 回填保存 beforeSnapshot + 影响行数断言；任一阶段失败按 OVERALL-03 备份（G:\HSE_BACKUPS\…b02dec…）恢复流程回退；阶段间设硬门禁（上阶段验收报告未通过不进入下阶段）。

---

## 11. 尚未核实事项（如实区分证据等级）

| 事项 | 状态 | 原因 |
|---|---|---|
| 生产库数据质量（personnel_id 列、employee 重复、孤儿引用） | **未核实** | 任务书纪律：未经授权不动生产库；本轮仅 dev（safety_dashboard_dev，current_database() 断言通过） |
| 其他前端变体（web-antd/web-antdv-next/web-tdesign 等）对 /api/personnel 的调用 | 仅 web-naive 核验（零命中） | 多前端变体为演示镜像，非生产路由真源；如需全量核验列入 B-1 P0 |
| 每个业务域 SQL 的逐行穷举 | 域级+代表点核验（三路并行审计：培训/考核/证书、隐患/事故/三违/巡查/车辆、保险/费用/档案/超龄/画像） | medium 深度审计；结论以"未发现"表述处均标注了核验范围 |
| hse_violator_name_resolution 人工映射表内容质量 | 未核验数据 | 属三违域数据治理，非 B-1 主线 |
| over_age_personnel id_card→employee 可自动回填命中率 | 未试算 | 回填试算涉及批量比对，留待 B-1 P2 授权后执行 |

证据等级图例：已通过实际代码证据确认（§3/§4/§5/§6/§9 全部文件行号）｜已通过 dev 库只读查询确认（§3 数据量、§3.10 FK、§7 DQ）｜仅从 migration/代码推断（§10 方案、hse_employee_relation 无 FK 判断基于 v68 原文）｜未核实（本表）。

---

## 12. 业务裁决事项（需用户/总控拍板）

| 编号 | 裁决事项 | 选项与影响 |
|---|---|---|
| D1 | personnel 表与 /api/personnel 死路由的退役方式 | a) 摘除路由保留空表（最小动作）；b) 表改名归档+路由摘除（彻底）；c) 维持现状（不推荐：留下绕过闸门的写入通道） |
| D2 | over_age_personnel 1,300 行的映射授权 | 授权 B-1 P2 用 id_card hash 试回填；未命中清单交人事核对（同名同证不自动认定同一人） |
| D3 | 任职段唯一模型二选一 | a) employee_assignment 为权威（推荐：22,295 行+全部服务+主视图在其上）；b) 迁移到 hse_employee_relation（重写面大）。裁决后 v_employee_org_full 或 v_employee_current 之一退役 |
| D4 | v59 旧组织模型（department 92 行/hse_employee_org 1,285 行）退役节奏 | 已标 is_deprecated；是否允许 B-1 冻结其残留写入点 |
| D5 | A 态 personnel_id 列（driver_monthly/grid_areas/accidents）改名迁移的批次授权 | 三步走（加新列→回填→切读）为推荐方案 |
| D6 | 培训双表体系（training_records 复数 vs training_record 单数）归并方向 | 属 C5 培训考核域固化与 B-1 交界，建议 C5 前先裁决 |

---

## 13. 风险分级与后续建议

- **P1（进入 B-1 前必须处置）**：DQ-1 超龄台账断裂（代码已按 employee.id 读，数据全失配——当前页面展示的关联字段事实上不可信）。
- **P2（B-1 实施期内）**：死路由摘除（D1）、FK 补齐（DQ-5）、任职段模型裁决（D3）、V2 审核缺口（§9-②）。
- **P3（可延后）**：列改名批次（D5）、position_code 唯一索引、培训双表归并（D6）。
- **提示**：本轮所有结论基于 dev 库；B-1 实施启动前建议补一次生产库同口径只读盘点（P0 阶段，需授权）。

## 14. 本轮实际执行命令与证据（摘要）

- Git：`git rev-parse HEAD`/`git status --porcelain` 统计/`git merge-base --is-ancestor 2407c10|27f6f11 HEAD`/`md5sum server/routes/cost.js`——输出见 §2。
- 结构核验：Read `hse_employee_master_v59_migration.sql`、`hse_org_center_v68_migration.sql`、`sql/unified_schema.sql:135-220`、employeeResolver.js、employeeAssignmentService(:355-432/:1100-1140)、employeeImportService(:685-714)、employeeImportV2Service(:465-490)、routes/personnel.js 头部、gridEmployeeCodeResolver、overAgeService、init-driver-tables、app.js 路由挂载；Grep rehire/isTerminalRelation/employment_relation(FULL-TEXT)/personnel_id 清单/inspector_name 等文本字段清单；三路 Explore 只读子审计（培训/考核/证书、隐患/事故/三违/巡查/车辆、保险/费用/档案/超龄/画像）。
- dev 库只读查询（DB_NAME=safety_dashboard_dev 硬设 + `current_database()` 断言 + 纯 SELECT，零 DML/DDL）：核心表行数 10 表、employment_relation 分布、重复工号/证件 4 项、personnel 重叠、保险孤儿、12 张 personnel_id 表清单、employee_id 列 60 表计数、9 张表 personnel_id 填充率、39 FK 全景、0 FK→personnel、v_employee_current 视图定义、assignment 重复语义 4 项统计。

## 15. 最终 Git 工作区状态及保护对象核验（报告撰写后、提交前）

- 本报告新增文件：`docs/project-control/OVERALL-07/OVERALL-07-01-B1-PERSONNEL-MASTER-DATA-PREFLIGHT.md`（唯一交付物）。
- 代码与数据库：**零修改**（本轮未编辑任何业务/前端文件，未执行任何 DML/DDL；唯一文件写操作即本报告）。
- cost.js：预期保持 staged `A` + MD5 `e88ae2b0b275346dfc1431408aa00bff`（提交将采用 pathspec 显式路径，确保零卷入；提交后复核）。
- 上传方式：Git 写操作与本轮只读核验分离处理——报告以 pathspec 单独提交至 `docs/project-control/OVERALL-07/` 并推送，不携带任何其他工作区文件。

## 16. 结论

B-1 的真实现状比任务书预设的"employee vs personnel 双主数据"乐观得多：**人员身份权威已经事实统一到 employee**，personnel 已空壳化。B-1 实际工作量集中在：①一个 P1 数据断点（超龄台账 1,300 行）；②任职段模型二选一（D3，影响面最大的架构裁决）；③死路由与缺 FK 的卫生清理；④personnel_id 命名遗留列的三态处置。建议按 §10.7 阶段化推进，每阶段设门禁与回滚，先 dev 后生产。

（本报告结束；等待总控审查后确定 B-1 实施任务书。）
