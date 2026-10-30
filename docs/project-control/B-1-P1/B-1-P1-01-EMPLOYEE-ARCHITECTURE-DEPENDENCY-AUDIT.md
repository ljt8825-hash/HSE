# B-1-P1-01｜人员架构收敛实施前代码依赖审计报告

- 报告编号：B-1-P1-01
- 节点：B-1-P1-01（实施前代码依赖审计，纯只读）
- 执行日期：2026-10-30
- 前置：B-1-P0 生产只读复核（commit `0a71d31`，已验收）、D3 已确认（employee_assignment 为唯一权威任职段模型）
- 证据规则：全部结论附 文件:行号+关键代码摘录；三路并行只读探查 + 主对话交叉验证

---

## 1. Git 基线（实测）

| 项 | 值 |
|---|---|
| 本地 HEAD / 远端 HEAD | `0a71d3196a23baba57728e7cdc8c349a8ac4df41`（一致） |
| 分支 | `feat/b02-dec-03.13-a02d-status-code` |
| B-1-P0 报告提交 `0a71d31` | 在历史中（merge-base 验证） |
| 工作区 | 145 untracked / 1 staged / 50 modified（与 P0 收尾一致） |
| `server/routes/cost.js` | staged `A` + MD5 `e88ae2b0b275346dfc1431408aa00bff` ✔（本节点全程未触碰） |

## 2. 审计范围与文件清单

- 后端：server/（routes 47、services 100+、controllers、scripts、sql、__tests__）全量 grep：`personnel`、`employee_assignment`、`hse_employee_relation`、`v_employee_org_full`、`v_employee_current`、`department(s)`、`hse_employee_org`、`is_deprecated`、`/api/personnel`。
- 前端：安全看板vben/apps/ 全部 6 个变体（web-naive、web-antd、web-antdv-next、web-tdesign、web-ele、backend-mock）+ grid-mobile-cloudflare、safety-check-h5。
- 配置：server/app.js 挂载表、migrate-menus.js、deploy/、nginx/。
- 数据库佐证：引用 B-1-P0 生产实测（39 FK / relation 100% 断链 / relation 与 employee.id 区间不相交）。

---

## 3. P1-01-A：personnel 路由全部消费者

### 3.1 代码事实

| 消费者类别 | 结果 | 证据 |
|---|---|---|
| 前端 6 变体 + H5 | **全部零命中** `api/personnel`/`over-age-personnel`/`stats/summary` | 全变体 grep（主对话独立复核 2 轮 + 探查代理复核） |
| 后端模块 require/routes 引用 | **仅 app.js:441 挂载** `app.use('/api/personnel', personnelRoutes)` | grep `require('./routes/personnel')` 唯一命中 |
| 后端 HTTP 自调用 | 零命中（`localhost…api/personnel` / `fetch(…personnel` 均无） | grep |
| personnel 表读写代码 | **server/routes/personnel.js 唯一独占**（:60/:68 列表、:88 详情、:114 INSERT、:170 UPDATE、:197 软删、:224 统计，全部直连 pool.query） | 读文件确认 |
| 其他 services 中 `personnel` 字样 | 均为 `personnel_insurance`（保险表）、`over_age_personnel`（超龄表）或 `/api/import/confirm` 的 personnel 模块预处理（走 employeeResolver 写 insurance，不写 personnel 表） | insurancePersonnelService.js、importExcelService.js、employeeResolver.js:8-10 注释 |
| 定时任务/调度器 | 零依赖 | grep assessmentScheduler 等无 personnel 表引用 |
| 菜单/权限种子 | **migrate-menus.js:53-54 存在旧页面注册**：`{name:'人员列表', path:'/hse/personnel', component:'#/views/personnel/index.vue', permission:'hse:personnel:list'}` 与 over-age-personnel 同款 | 读文件确认；web-naive 无该组件文件 → 菜单注册为"组件不存在的死配置" |
| deploy/nginx/monitoring | 未发现 /api/personnel 转发或监控规则（nginx.conf、nginx/、deploy/、monitoring/、logstash/、docker-compose、ecosystem.config.js 均零命中） | grep |
| 动态拼接 API | 未发现 personnel 相关模板串拼接（vite 配置/.env 零命中） | grep |
| **压测脚本（非业务，可真实调用）** | **k6 三件套**：`performance/k6/tests/05-personnel-query.js:15`（API_BASE='/api/personnel'，且引用**不存在的 /export 端点**）、`08-search-performance.js`、`smoke/smoke-test.js`（'人员列表' GET /api/personnel）——手动触发，误在生产执行会真实打接口 | 读文件确认 |
| **历史运维脚本** | `server/scripts/migrate_encrypt_sensitive_data.js` 配置 `{table:'personnel', fields:['id_card','phone']}`——**唯一在 personnel.js 之外直接写 personnel 表的代码**，一次性加密迁移，已执行完（死代码） | 读文件确认 |
| 权限/配置残留 | `server/config/hseRules/menu-codes.json`（"personnel"）、`permissions.json`（"personnel":"人员管理"）、`audit-config.json`；`middleware/auth.js:354-452` 的 `hse:personnel:*` 权限码实际服务于新员工模块（/api/hse/employee），与 /api/personnel 无关 | grep+读文件 |
| 页面路由（非 API） | web-naive `router/routes/modules/hse-personnel.ts`、web-antd `hse-07-personnel.ts` 定义 '/personnel/*' 页面路由，但组件全部指向 views/hse/employee/*，实际走 /api/hse/employee（employee 表） | 读文件确认 |
| 鉴权 | app.js:253 全局 JWT 覆盖 /api/personnel；personnel.js 内部无自带鉴权 | 读文件确认 |

### 3.2 判定与无法确认项

- **仓库证据内：/api/personnel 无业务消费者**（前端零调用、后端零自调用、业务脚本零依赖）；非业务残留消费者=**k6 压测脚本 3 个**（手动触发）与历史加密迁移脚本 1 个（已死）。
- **无法通过仓库证据确认（3 项，下线前必须补查）**：
  1. 生产 `menus` 表是否仍有 `is_active=true` 的 `/hse/personnel` 记录（种子脚本双源：migrate-menus.js:53-54 与 sql/migrate_hse_menus.sql:12,55，但生产库实际菜单行未核验——只读 SELECT 可查，归 P1-02 实施前检查）；
  2. 仓库外的外部系统调用（如第三方报表抓取 /api/personnel）——只能靠 Nginx 访问日志确认，建议摘除路由前先观察一段生产 access log；
  3. k6 压测是否有 CI/定时任务自动触发（仓库内未发现，需运维侧确认）。

## 4. P1-01-B：employee_assignment 读写全景

### 4.1 全部写入入口（生产代码 5 处 + 迁移脚本 1 处）

| # | 入口 | 位置 | 路径性质 |
|---|---|---|---|
| W1 | createAssignment | employeeAssignmentService.js:236 | 服务内（终态闸门覆盖） |
| W2 | assignEmployee（调岗/入职） | ASG:506（INSERT，status='active',is_current=true,is_primary=true :509） | 服务主路径 |
| W3 | rehireEmployee（返聘） | ASG:788（INSERT 'reinstated'） | 服务主路径 |
| W4 | **V1 导入** | employeeImportService.js:700 | **绕开服务直写**；其关段 :694 `SET is_current=false, updated_at=NOW()` **不设 end_date、不筛 is_deleted**（C2 遗留③，仍存在） |
| W5 | **V2 导入** | employeeImportV2Service.js:1091 | 绕开服务直写；关段与建段为两条独立 await 且不读 rowCount（既登记缺口） |
| W6 | **deleteEmployee（员工删除）** | employeeService.js:610-626 | **绕开服务且无事务**：:612 软删 employee 与 :620 关段（`SET is_current=false`，不设 end_date）为两次独立提交，中途失败即产生"关系已删但段仍 current"的中间态；与 terminateEmployee 的事务化删人路径并存 |
| W7 | changeAssignmentStatus（通用状态变更） | ASG:889-1002 | 服务内第 4 个写入口：复核 relation+当前段 → UPDATE 段 status/end_date（终态时 status='inactive'+end_date=event_date，TERMINATION_SEGMENT_STATUS:1029）→ history → 事件；「返聘」入参已封堵（:892-900） |
| W8 | migrate-employee-assignment.js:51 | 一次性迁移脚本（非业务代码） | 标注隔离 |
| W9 | clearAll | ASG:1442-1503 | `DELETE FROM employee_assignment`——已被 `PURGE_ALL_PERMANENTLY_DISABLED` 常量短路（不可达） |

**除上述外无其他 INSERT/DELETE**（全仓 grep `INSERT INTO employee_assignment` 仅命中以上 + 测试桩；`DELETE FROM employee_assignment` 仅 clearAll 一处且已永久禁用）。读取侧 `FROM employee_assignment` 共 **49 个业务文件**（见 §4.6）。

### 4.2 事务边界（服务主路径）

- assignEmployee（ASG:419-522）：闸门在校验阶段零副作用（:435-442，拒绝时不取连接不开事务）→ `BEGIN`（:446）→ **FOR UPDATE 锁员工行复核关系**（:448-467，A-02B 并发栅栏，与 terminateEmployee 锁序一致）→ 关旧段（end_date=start-1，:490-496）→ INSERT 新段（:505-512）→ INSERT employee_history（:516-520）→ `COMMIT`（:522）→ COMMIT 后发 EMPLOYEE_TRANSFERRED 事件（:524-541）。
- 终态登记事务（ASG:1100 起）与 rehire（ASG:648 起）同为"锁行→闸门→写关系+段+history→COMMIT"结构。
- **缺口**：V1/V2 导入的关段+建段不在同一受锁保护的结构中（V1 :694 与 :700 分离；V2 关段/建段双 await 不读 rowCount）。

### 4.3 生命周期动作 → 代码入口

| 动作 | 入口 | 关段行为 | 关系写入 |
|---|---|---|---|
| 调岗/入职 | assignEmployee ASG:419 | end_date=start-1 ✔ | 不改 employment_relation |
| 离职/退休（终态登记） | 终态事务 ASG:1100+ | 关 current 段 | employment_relation=辞职/死亡/退休（仅 '正式员工' 可发起 :1125-1132） |
| 返聘 | rehireEmployee ASG:648 | 校验无 current 段，新建 'reinstated' 段 | employment_relation='正式员工'（:776）+ history('返聘') |
| 复岗 | ACTION_ONLY_STATUS_CODES=['reinstated']（DICT:102）；通用状态接口已拒绝「返聘」入参（ASG:892-900） | — | — |
| 死亡 | 同终态登记 | 同上 | employment_relation='死亡' |
| **撤销返聘** | **不存在**（全仓无 revoke 实现，B-2 遗留①） | — | — |

### 4.4 is_current / end_date / status 实际组合（代码写入侧）

| 组合 | 写入处 | 评价 |
|---|---|---|
| current=true + primary=true + active | W2:509、W1、W3 | 规范 |
| current=false + end_date=start-1 | W2:493-496 | 规范 |
| current=false + end_date=event_date + status='inactive' | 终态/通用状态变更（ASG:1186、TERMINATION_SEGMENT_STATUS:1029） | 规范（终态段语义） |
| **current=false + end_date=CURRENT_DATE** | W5（V2 导入关段 :1065-1069，带 `AND is_primary` 筛选） | SQL 本身规范，但**不读 rowCount**（UPDATE 0 行仍继续 INSERT，存在旧段未关仍新建的可能）且额外写 dept_name 冗余列 |
| **current=false + end_date 不变** | W4（V1 导入 :694）、W6（deleteEmployee :620） | **缺 end_date**——`end_date IS NULL` 仍会被误判在职（见 §4.5 口径 G） |
| **active + is_current=false（历史段滞留）** | 生产 19,922 行的来源：早期关段只翻 is_current 不改 status | status 语义修正属 B-3 |

### 4.5 读取入口（按口径分组，"当前人员"口径矩阵）

| 口径 | 消费者 | 过滤条件 | 终态人员是否可见 |
|---|---|---|---|
| A. is_current 视图 | v_employee_current（_93_view_hardening_run.sql:7-55；**另 3 处定义**：sprint5_6:262、alter_employee_relation_status.sql:22、**employeeImportV2Service.js:649 运行时重建**） | e.is_deleted=false + a.is_current+is_primary | **可见**（1947 名终态持段者全部进入该视图） |
| B. 员工选择器 | employeeSelectorService.js:12,62,81 | `ev.is_deleted=false AND ev.is_current=true`，**无 employment_relation 过滤** | **可见**（直接代码原因） |
| C. 保险在职口径 | insuranceShared.js:361-364 `ACTIVE_ROSTER_JOIN` | `employment_relation='正式员工'` | 不可见 |
| D. 考核资格 | assessmentTargetEligibility.js:68-87 | `employment_relation='正式员工'`（**2026-09-14 生产 CHECKPOINT-6 事故教训代码化**：v_employee_org_full.relation_status 来自 assignment.status 与雇佣状态脱钩，辞职/死亡人员曾被列为考核对象） | 不可见 |
| E. 超龄识别 | overAgeService.js:68,104-127 | `employment_relation='正式员工'` + is_current+is_primary | 不可见 |
| F. SQL 终态工具 | employeeStatusDict.js:145 TERMINAL_RELATION_VALUES / :256 terminalRelationInSql / :287 isTerminalRelation；状态字典另含 STATUS_MAP（:32-53）、TERMINAL=['inactive','retired']（:81，段态终值）、WRITABLE/ACTION_ONLY（:73/:102） | 供 SQL/JS 过滤 | **B 口径未使用**（现成工具闲置） |
| G. end_date 口径 | **warningCenterService.js:114 用 `end_date IS NULL` 作在职谓词** | 与 V1 半关段（缺 end_date）/deleteEmployee :620 叠加时语义错位 | **误报风险**（半关段者被判在职） |

**结论**：系统没有统一"当前在职"谓词（至少 7 种口径并存）；A/B 口径（is_current）与 C/D/E 口径（employment_relation）并存，1,947 终态持段人员正是两类口径的交集暴露；`end_date IS NULL` 口径（G）则受 V1/deleteEmployee 半关段污染。DICT 已有统一工具，P1-02 改造 B/G 类消费者时可直接复用（无需新造判定）。签到归因 signinAttribution.js 注释自证视图混有"~1800 辞职 + 6 死亡"人员。

### 4.6 直接 SQL 读取面（规模）

全仓 49 个业务文件引用 employee_assignment（清单：services 27、routes 7、tests 12、scripts 3），主要读侧：employeeProfileService、orgTreeService、hseDashboardService、executiveCockpitService、hseAssessmentAnalysisService、assessmentService、hazardService、accidentService、trainingShared/trainingRecord/trainingLedger/trainingRegister/trainingService、warningCenterService、emergencyService、hseRiskProfileService、gridCompletionService、overAgeService、ruleEngine/violationTargetResolver、signinAttribution、positionService、riskScoreService、employeeHealthCheckScheduler、assessmentTargetEligibility、hse-driver-risk-center、hse-risk-profile-base/detail、hse-accident-analysis、hse-employee 路由组。全部为 SELECT（写入仅 §4.1 清单）。

## 5. P1-01-C：hse_employee_relation 读写及视图依赖

| 问题 | 结论 | 证据 |
|---|---|---|
| 写入 | **零业务写入**（全仓无 INSERT/UPDATE/DELETE INTO hse_employee_relation；仅 v68 migration 建表与验证查询） | 全仓 grep |
| SELECT 读取 | **1 处活跃视图依赖：`v_employee_risk_profile`（sprint61_risk_profile_migration.sql:113-117 `JOIN hse_employee_relation er ON er.employee_id=e.id AND is_current…`，INNER JOIN）**，消费方 hseRiskProfileService.js:116,244,419 | 读文件确认 |
| **风险画像生产后果** | INNER JOIN 一张 100% 孤儿表（B-1-P0：relation.employee_id 3866~5363 vs employee.id 6692~10240 区间不相交）→ **v_employee_risk_profile 生产恒为 0 行，风险画像单查接口事实上返回空**（继考核 CHECKPOINT-6 之后 relation 断链的第二处活业务影响，本轮新发现，P1 级） | B-1-P0 §5 + sprint61:114 |
| v_employee_org_full | **已于 2026-08-27 修复为基于 employee_assignment**（hse_fix_v_employee_org_full.sql:1-9 明确记载：原 relation 版因 1304 行旧 ID 全部不存在导致"考核周期 targetCount=0、评分冻结空转"；现定义 :31-71 LEFT JOIN employee_assignment） | 读文件确认 |
| **迁移脚本回放风险** | `hse_org_center_v68_migration.sql:214` 仍含旧 relation 版视图定义（CREATE OR REPLACE）——**若在新环境/重建环境重放 v68，会把已修复的视图改回断链版**。P4 必须同步修订 v68 脚本或加守卫 | 读文件确认 |
| 其他视图依赖 | 除上述两视图外无其他数据库对象依赖 relation（grep 全部 CREATE VIEW） | grep |
| 运行时 DDL | **employeeImportV2Service.ensureViewFields（:643-707）每次 V2 导入首次触发即 `DROP VIEW IF EXISTS v_employee_current`+重建**（:647-701）；重建版列集**缺 `employment_relationship_status`**（B-1-P0 实测生产现行视图含该列）→ 一旦触发会破坏依赖该列的消费者。ensurePendingColumns（:621-639）另有 employee_import_pending 运行时 ALTER | 读文件确认 |
| 定时任务 | 无 relation 依赖 | grep |
| 前端 | 6 变体零引用 `employee_relation` 相关 API | grep |
| **冻结写入影响** | 无影响（本就无人写）；退役依赖清单：① 改 sprint61 视图 JOIN→assignment（修复画像恒空）；② 防御 v68 回放；③ v_employee_org_full 已不依赖，随 P4 归档 | 综合 |

## 6. P1-01-D：department / hse_employee_org 旧组织模型读写全景

### 6.1 is_deprecated

- 定义：仅存在于 `hse_org_center_v68_migration.sql:189-208`（ALTER TABLE ADD COLUMN department.is_deprecated / hse_employee_org.is_deprecated + COMMENT）。
- **全仓代码零读取、零写入**（grep `is_deprecated` 仅命中该 migration 与本项目文档）——"打标退役"从未被任何代码执行或感知。B-1-P0 生产实测：department 98 行 / hse_employee_org 1,285 行，is_deprecated=0。

### 6.2 department（五级树，v59 旧组织）

| 操作 | 位置 | 性质 |
|---|---|---|
| 读（组织树/列表/员工） | orgTreeService.js:31,273,325,410,496 | 活跃 |
| **写（创建/更新/软删）** | **orgTreeService.createDepartment:399-435（INSERT INTO department :422；并回填 `UPDATE department SET org_unit_id=$1` :435 与新模型挂钩）、updateDepartment:486、deleteDepartment:500** | **旧模型存在活跃写入路径**（P1-01-D 问题 4/8 的答案：双模型通过 org_unit_id 回填共存） |
| **被权威分配路径读取** | **ASG.resolveOrgUnitId:53-78：分配入参的 group/region/enterprise/project/team_id 实为 department.id，经 `department d LEFT JOIN hse_org_unit ou ON ou.org_name=d.name` 名称匹配换算 org_unit_id** | **department→hse_org_unit 的运行时名称映射仍是分配链路的必需环节**（名称不一致即映射失败） |
| 其他业务读取 | statisticsService.js:601、hseTasksService.js:52,80,326,409,434（该服务 :144 恒早退=事实死代码）、hse-chain.js:199、test/migrate2.js:170、test/migrate-full.js:302（`departments` 复数表，生产是否存在该表未核验） | 混合 |

### 6.3 hse_employee_org（v59 人员组织关系）

- 读取：orgTreeService 及个别统计服务（1,285 行存量）；**无写入**（全仓 grep 无 INSERT/UPDATE）。
- 结论：hse_employee_org 已天然冻结（只读遗留）；department 仍有活写入（orgTreeService.createDepartment/updateDepartment）+ 分配链路的读取依赖（resolveOrgUnitId）。

### 6.4 employeeAssignmentService 中的映射必要性

`resolveOrgUnitId` 的 department 名称映射**目前不可拆除**：前端/调用方仍传 department.id 体系参数；P1-02 收敛方向是"调用方直接传 org_unit_id"或"映射函数保留但 department 冻结写入"（逐文件建议见 §10）。

## 7. 终态人员展示口径差异（特别关注）

1. `v_employee_current` 仅以 `is_current=true`（+is_primary）判断，不看 employment_relation（_93:45-54）→ 1,947 名终态持段者全部出现在"当前员工"视图。
2. 员工选择器 employeeSelectorService **不过滤终态**（:12）→ 调岗/分配/保险等 UI 下拉仍可选到辞职人员（选后再经服务层闸门拦截，属"可选但不可提交"的体验缺陷而非数据风险）。
3. 保险（insuranceShared '正式员工'）、考核资格（assessmentTargetEligibility '正式员工'）、超龄（overAgeService '正式员工'）采用关系口径 → 终态不可见。
4. employment_relation 与 assignment.status 无代码级联动：关段只动 is_current/end_date，status 多数滞留 'active'（19,922 行）。
5. 统一终态判定函数**已存在**：employeeStatusDict.isTerminalRelation(:287)/terminalRelationInSql(:256)，C2 固化产物，B1/C1/导入已用；仅 B 类读取面未接入。
6. 页面口径需求（供总控裁决，不擅定）：员工管理/历史任职页需要显示终态人（含历史段）；调岗分配、保险参保、考核对象、超龄台账四类页面只需在职口径 → 建议 P1-02 在选择器增加"仅在职"开关（复用 terminalRelationInSql），而非删历史展示。

## 8. 组织映射路径（现状图）

```
前端调岗表单（传 department.id 体系的 group/region/enterprise/project/team_id）
  → POST /org/assign（controllers/hse-assignment.js 薄透传）
  → employeeAssignmentService.assignEmployee
      ├─ checkRelationAllowsAssignment（B1 闸门，读 employee.employment_relation）
      ├─ FOR UPDATE 锁员工复核（A-02B）
      ├─ resolveOrgUnitId（ASG:53-78）：
      │    department.id --名称匹配--> hse_org_unit.org_name ⇒ org_unit_id  ←★仍依赖旧表 department
      ├─ 关旧段（is_current=false, end_date=start-1）
      ├─ INSERT employee_assignment（status='active',is_current,is_primary）
      ├─ INSERT employee_history（after_status 硬编码'在职'，:518，B2.2 已登记 GAP⑦）
      └─ COMMIT → EMPLOYEE_TRANSFERRED 事件
```

## 9. 旧模型与新模型并存风险清单

| # | 风险 | 等级 |
|---|---|---|
| R1 | `v_employee_risk_profile` INNER JOIN 断链 relation → 风险画像生产恒空 | **P1（活功能受损）** |
| R2 | V2 导入运行时 DROP+重建 v_employee_current，列集落后于生产现行（缺 employment_relationship_status 等） | **P1（潜在线上中断）** |
| R3 | v68 migration 重放会将 v_employee_org_full 改回 relation 断链版 | P2（重建场景） |
| R4 | V1 导入关段不设 end_date（:694）持续制造不一致段 | P2 |
| R5 | resolveOrgUnitId 依赖 department 名称匹配，名称漂移即分配失败 | P2 |
| R6 | orgTreeService 仍写 department（与 hse_org_unit 双模型并存） | P2 |
| R7 | 选择器不过滤终态（体验缺陷）+ warningCenter `end_date IS NULL` 口径被半关段污染 | P3 |
| R8 | menus 种子双源残留 /hse/personnel 旧菜单注册（组件不存在）；hseRules 配置三件套（menu-codes/permissions/audit-config）残留 | P3 |
| R9 | deleteEmployee（employeeService:610-626）删人无事务、与 terminateEmployee 事务化路径并存 | P2 |

## 10. 逐文件修改建议（仅建议，本节点不实施）

| 文件 | 建议 | 归属阶段 |
|---|---|---|
| server/routes/personnel.js + app.js:441 | 观察 Nginx 日志+核验生产 menus 表后摘除挂载（保留文件一个版本周期） | P1-02 |
| server/services/hseRiskProfileService.js / sprint61 视图 | 视图重建为 JOIN employee_assignment（对齐 hse_fix_v_employee_org_full 范式） | P1-02 |
| employeeImportV2Service.ensureViewFields(:643-707) | **移除运行时 DROP/CREATE VIEW**，视图变更收归 SQL 迁移脚本（并补齐列集） | P1-02（最高优先） |
| employeeImportService.js:694 | 关段补 end_date+is_deleted 语义（B-2 遗留③一并闭合） | P1-02/B-2 |
| employeeService.deleteEmployee:610-626 | 删人路径事务化或统一收口到 terminateEmployee（消除 W6 无事务写入） | P1-02 |
| employeeImportV2Service.js:1065-1069 | 关段 UPDATE 增加 rowCount 校验/旧段存在性复核（"不读 rowCount"缺口） | P1-02 |
| warningCenterService.js:114 | 在职谓词从 `end_date IS NULL` 改为 is_current 口径或接入 terminalRelationInSql | P1-02 |
| employeeStatusDict / employeeSelectorService | 选择器接入 terminalRelationInSql 增加"仅在职"过滤开关 | P1-02 |
| orgTreeService.createDepartment/updateDepartment | 冻结 department 写入（改造为读写 hse_org_unit 或只读降级） | P1-02 |
| employeeAssignmentService.resolveOrgUnitId | 保留映射但加 department 写入冻结前置；中期改前端直传 org_unit_id | P1-02/P4 |
| hse_org_center_v68_migration.sql:214 | 修订视图定义为 assignment 版（防回放回归） | P1-02 |
| menus 种子/生产 menus 表 | 移除 /hse/personnel 死菜单（生产 DML 需授权） | P1-02 |

## 11. 分阶段实施顺序与回滚边界（P1-02 建议）

1. **前置核查**（零修改）：生产 menus 表 SELECT、Nginx access log 观察 /api/personnel、生产 `v_employee_risk_profile`/`v_employee_current` 现行定义取证。
2. **第一批（低风险）**：V2 运行时 DDL 移除 + v68 视图定义修订 + V1 关段补 end_date —— 均有明确单点回滚（还原代码/还原 SQL）。
3. **第二批（功能修复）**：v_employee_risk_profile 切 assignment（修复画像恒空）——回滚=还原视图 SQL。
4. **第三批（口径收敛）**：选择器终态过滤开关 —— 回滚=开关关闭。
5. **第四批（路由/菜单退役）**：摘 /api/personnel + menus 清理 —— 回滚=恢复挂载/菜单行；前置=第 1 步核查通过。
6. **不在本批**：relation 表 DROP、department 数据清理、超龄回填（P2）、H5/WPS/飞书链路（冻结）。

## 12. 未核实事项

- 生产 menus 表实际行、生产两视图现行定义、Nginx 日志（均需 P1-02 前置只读核查/日志观察）。
- `departments` 复数表是否存在于生产库（hseTasksService/statisticsService 引用；B-1-P0 未查该表）。
- Explore 代理对 grid-mobile-cloudflare/safety-check-h5 的 H5 侧全量扫描（已 grep 零命中，但 H5 属冻结区未逐文件复核）。
- resolveOrgUnitId 名称映射的实际命中率（生产有多少 department.name 与 org_name 不一致）未测算。

## 13. 不应在本阶段处理的事项

- relation/department 表的 DROP、TRUNCATE、数据清理（P4/总控授权）；
- 超龄 1,300 行回填（P2）；
- 19,922 active 非 current 段与 3,239 同日重复段的语义修正（B-3）；
- 返聘撤销、V2 审核读关系（B-2）；
- 培训双表（C5）、H5/WPS/飞书链路（Z 冻结）。

## 14. 关键代码位置索引（证据快查）

- personnel 路由：app.js:441（挂载）/253（全局 JWT）；routes/personnel.js:60,88,114,170,197,224；菜单种子 migrate-menus.js:53-54 + sql/migrate_hse_menus.sql:12,55（双源）；k6 压测 performance/k6/tests/05-personnel-query.js:15、08-search-performance.js、smoke/smoke-test.js；权限码 auth.js:354-452（实属新模块）。
- assignment 写入：ASG:236/506/788/889-1002/1442-1503（clearAll 已禁用）；ImportV1:694,700；ImportV2:1065-1069（关段）与 1091（建段）；employeeService.deleteEmployee:610-626（无事务）；migrate-employee-assignment.js:51。
- 事务/闸门：ASG:435-442（零副作用闸门）、:448-467（FOR UPDATE 栅栏）、:493-496（关段范式）、:1100+（终态）、:648-852（返聘）、:892-900（返聘入参封堵）。
- 组织映射：ASG:53-78（resolveOrgUnitId department 名称匹配）。
- 视图：_93_view_hardening_run.sql:7-55（current 基准版）；hse_fix_v_employee_org_full.sql:29-71（org_full 修复版+事故记载）；hse_org_center_v68_migration.sql:214（旧版回放风险）；employeeImportV2Service.js:643-707（运行时 DDL）；sprint61_risk_profile_migration.sql:113-117（画像断链 JOIN）。
- 口径：employeeSelectorService.js:12,62,81；insuranceShared.js:361-364；assessmentTargetEligibility.js:68-87（CHECKPOINT-6）；overAgeService.js:68；warningCenterService.js:114（end_date IS NULL）；employeeStatusDict.js:32-53,73,81,102,145,256,287；signinAttribution.js 注释（视图混有 ~1800 辞职+6 死亡）。
- 旧组织：orgTreeService.js:22,31,273,325,399-435,486,500；hse_org_center_v68_migration.sql:189-208（is_deprecated 定义，代码零使用）；departments 复数表引用 statisticsService.js:601、hseTasksService.js:52,80,326,409,434（该服务 :144 恒早退）、hse-chain.js:199。

## 15. 结论

- `/api/personnel` 仓库内零业务消费者，但存在 k6 压测（3 个脚本）与 menus 种子（双源）残留；下线前须补三项外部核查（生产 menus 行、Nginx 日志、k6 是否有自动触发）；
- employee_assignment 写入入口共 9 处（服务 4 + 导入 2 + 删除 1 + 禁用 1 + 迁移脚本 1）：服务主路径事务完备（零副作用闸门+FOR UPDATE 栅栏），缺口集中在 **deleteEmployee 无事务、V1 半关段、V2 不读 rowCount** 三处；
- hse_employee_relation 已无写入、视图依赖仅剩风险画像一处（且该视图因此生产恒空，修复反而紧迫）；v_employee_org_full 已修复，但要防 v68 回放回归；
- department 是唯一仍有活写入的旧模型，且权威分配链路仍经它做名称映射——P1-02 应"冻结写入、保留映射、中期换参"，而非直接拆链；
- 终态口径已具备统一工具（DICT），改造是"接入"而非"新造"。

（本节点为纯只读审计，零代码/零数据/零 Git 业务变更；报告按 pathspec 单独上传。）
