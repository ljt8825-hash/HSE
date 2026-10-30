# B-1-P1-03-01 · 人员选择器与终态展示口径专项审计报告

> 节点：B-1-P1-03-01（只读依赖审计，不实施代码修改）
> 仓库：`https://github.com/ljt8825-hash/HSE`（G:\hse-dashboard）
> 分支：`feat/b02-dec-03.13-a02d-status-code`
> 起始 HEAD：`d2be703`（B-1-P1-02 报告提交）｜结束 HEAD：本报告提交（见 §一）
> 前置：B-1-P0（0a71d31）、B-1-P1-01（17360ca）、B-1-P1-02（83f0c58/d2be703）均已验收
> 日期：2026-10-30

---

## 一、Git 状态与只读声明

| 项 | 值 |
|---|---|
| 起始 HEAD | `d2be703` = 任务书指定前置（P1-02 报告提交）✔ |
| 结束 HEAD | 本报告单独提交（仅报告文件，零业务代码） |
| 工作区 | 145 ??（untracked 历史存量）+ 50 M + cost.js staged A —— 与 P1-02 收尾一致，无新增改动 |
| cost.js | staged `A`，MD5 `e88ae2b0b275346dfc1431408aa00bff` 不变 ✔ |
| 生产库 | **未连接**（任务书禁止）✔ |
| dev 库 | 仅只读 SELECT，且全部包裹 `BEGIN TRANSACTION READ ONLY ... ROLLBACK`（无 DDL/DML、无写入）✔ |
| 业务代码 | 零修改 ✔ |

## 二、审计文件清单与检索方法

### 2.1 主对话逐行审计文件（14 个核心文件）

| 文件 | 审计内容 |
|---|---|
| `server/services/employeeSelectorService.js`（93 行全文） | 公共选择器 3 方法 |
| `server/services/employeeStatusDict.js`（403 行全文） | 终态判定工具全集 |
| `server/routes/hse-employee.js`（挂载层） | 选择器挂载点 :58 |
| `server/routes/hse-employee/selector.js`（40 行全文） | 路由契约与权限 |
| `server/controllers/hse-selector.js` | 薄 handler |
| `server/services/employeeResolver.js`（145 行全文） | 身份解析两方法 |
| `server/services/objectiveService.js` :171/:240-253 | 目标责任书台账/签认人解析 |
| `server/services/hazardService.js` :1149/:1172/:1224 | 隐患责任人回显 |
| `server/services/signinAttribution.js` :100-125 | 签到归属花名册 |
| `server/services/trainingPlanService.js` :395-415 | 培训批量查询 |
| `server/services/overAgeService.js` :168-185 | 超龄统计口径 |
| `server/routes/todos.js` :20-60 | 待办两处理器 |
| `server/services/insuranceShared.js` :361-365 + `insurancePersonnelService.js` :223-260/:819-830 | 保险域口径 |
| `server/services/employeeProfileService.js` :13-100 + `assessmentTargetEligibility.js` :60-95 + `employeeService.js` :46-100 + `accidentService.js` :1414-1425 + `routes/hse-driver-risk-center.js` :160 | 档案/考核/人员管理/事故/驾驶员 |

### 2.2 三路并行子代理检索（explore-fe / explore-be / explore-legacy）

- **explore-fe**（前端）：`安全看板vben/apps/web-naive/src` 全量追踪人员选择调用链；grep 模式含 `selector`、`employee`、`person`、`responsible`、`复查人`、`选择员工` 等 20+ 模式，覆盖 api 封装层 + 全部 views。
- **explore-be**（后端）：`server/routes|controllers|services` 全量检索人员数据来源 SQL（`FROM v_employee_current` / `v_employee_org_full` / `employee` / `personnel` / `hse_employees` / `hse_employee_relation` / `hse_employee_org` 等），产出端点×过滤条件矩阵。
- **explore-legacy**（旧表/文本匹配）：`hse_employee_relation`、`personnel`、`personnel_id`、姓名文本归属匹配、`hse_employee_org`/`department`、`hse_employees` 降级路径；已排除 `*.bak*`、`server/backups`、`**/_archive`、`scripts/output` 历史副本。
- **交叉验证**：主对话对三个子代理的关键结论逐条实地复核（select/全文阅读实码），本文所有 §证据 均为主对话直接验证过的代码或 dev 探针；仅 §4.3 矩阵中标注「[BE]」的行采信子代理报告（其锚点行号已抽样验证一致）。

### 2.3 dev 库只读探针（关键定量证据）

在 `safety_dashboard_dev`（`BEGIN TRANSACTION READ ONLY`）执行三组探针：

| 探针 | 结果 |
|---|---|
| `v_employee_org_full` 是否含关系列 | **0**——`employment_relation` 与 `employment_relationship_status` 两列均不存在 ⇒ 选择器在结构上无法判终态 |
| `v_employee_current` 关系列 | 仅 `employment_relationship_status`（用工形式，非终态判定字段） |
| 公共选择器口径（`is_deleted=false AND is_current=true`）人数 | **3,238** |
| 其中终态人（JOIN employee，`employment_relation IN ('辞职','死亡','退休')`） | **1,806（55.8%）**：辞职 1,800 + 死亡 6 |
| `v_employee_current` 全口径终态人 | **1,958** |
| 员工关系分布（is_deleted=false，共 3,401） | 辞职 1,951｜正式员工 1,291｜NULL 152｜死亡 7（dev 无退休记录） |
| 终态人 current 主段形态 | **1,806/1,806 全部 `status='active'` 且 `end_date IS NULL`**（无一关段） |
| 抽样 | employee_id 8095/8038/9734/9735/9736 均为「关系=辞职、段=active、end=NULL」 |

**核心结论①**：dev 与生产同构（生产实测 1,947 终态持 current 段，B-1-P0）。终态人持有 `active`、`end_date=NULL` 的 current 主段是历史存量数据形态（关系已写终态但段从未关闭），**仅靠 `is_current/is_primary/is_deleted` 三条件无法排除终态人**；P1-03-02 必须引入 `employee.employment_relation` 终态过滤。

**核心结论②**：`signinAttribution.js:110` 注释「实测其中混有 1800 名辞职、6 名死亡人员」与本次 dev 探针 1,806 精确互证，代码内既有审计记录与数据库实态一致。

## 三、公共选择器逐方法审计（交付物 #3）

链路：`app.js:500`（`/api/hse/employee`）→ `routes/hse-employee.js:58` → `routes/hse-employee/selector.js` → `controllers/hse-selector.js` → `services/employeeSelectorService.js`。对外契约 `/api/hse/employee/employees/selector*`。

| 方法 | 路由 | SQL 来源 | WHERE 过滤 | is_deleted(employee) | is_deleted(assignment) | is_current | is_primary | 终态判定 | 姓名文本/旧表路径 | 权限中间件 |
|---|---|---|---|---|---|---|---|---|---|---|
| `listSelector` :8-52 | GET `/employees/selector` | `v_employee_org_full` | keyword ILIKE / org_unit_id / position_id / is_driver（position_name ILIKE 驾驶员|司机） | ✔ `ev.is_deleted=false` :12 | 视图内建 ✔ :67(v68) | ✔ `ev.is_current=true` :12 | 视图内建 ✔ :68(v68) | **✘ 无**（视图无关系列，结构上不可能有） | ✘ 无 | **✘ 无**（selector.js:16-24 直接绑定） |
| `getSelectorById` :55-67 | GET `/employees/selector/:id` | 同上 | employee_id 等值 | ✔ :62 | 视图内建 ✔ | ✔ :62 | 视图内建 ✔ | **✘ 无** | ✘ | **✘ 无** |
| `batchSelector` :70-86 | POST `/employees/selector/batch` | 同上 | `employee_id = ANY($1)` | ✔ :81 | 视图内建 ✔ | ✔ :81 | 视图内建 ✔ | **✘ 无** | ✘ | **✘ 无** |

补充事实：

1. `v_employee_org_full`（P1-02 修订后定义，`hse_org_center_v68_migration.sql` §六）输出列不含 `employment_relation`，也不含 `employment_relationship_status`（§2.3 探针 1 实证）——选择器**即使想过滤也没有现成列可用**，必须 JOIN employee 或扩视图（扩视图属 DDL，归后续节点授权）。
2. 同一功能的对照实现：档案中心 `employeeProfileService.getProfileList` 的 `is_driver` 过滤（:44-58）**已有终态排除**（`NOT IN (terminalRelationValueListSql())`），公共选择器 `listSelector:31-35` 的同款 is_driver 过滤**没有**——同作者同功能两处实现漂移的实锤。
3. 档案中心的终态排除存在姓名兜底瑕疵：`employeeProfileService.js:46-58` 的 COALESCE 三级降级（id_card_hash → employee_code → **name 同名行借值**）——本行 `e.employment_relation` 本可直接使用（`e` 就是 employee 表），仅当本行关系为 NULL 时才轮到前三级，但前三级是从**其他员工行**借关系值，其中第三级是纯同名匹配。dev 有 152 人关系 NULL。登记为历史实现风险（不属超龄域，不违反任务书规则 5 字面，但与"禁止姓名自动匹配"的治理方向冲突）。

## 四、全仓人员选择入口清单（交付物 #4/#5）

### 4.1 前端入口 → API 完整链（explore-fe 全量 + 主对话锚点复核）

**公共选择器消费者（`/api/hse/employee/employees/selector*`，经 `src/api/hse/employee.ts` 封装）**：

| # | 前端文件:锚点 | 业务用途 | 用途分类 |
|---|---|---|---|
| F1 | `src/api/hse/employee.ts`（selector 系列封装函数） | API 层唯一定义点 | — |
| F2 | `src/views/mobile/inspection/violation.vue` | 移动巡检·三违上报选当事人 | **新选** |
| F3 | `src/views/mobile/violation/new.vue` | 三违登记新建 | **新选** |
| F4 | `src/views/site/grid/attribution/index.vue` | 网格归属管理选网格员 | **新选** |

**自建人员查询端点的消费者（节选主要链，完整 30 项清单见附录 A——由 explore-fe 产出，主对话抽验 6 处锚点全部吻合）**：

| # | 页面/组件 | API → 后端端点 | 用途分类 |
|---|---|---|---|
| F5 | 隐患登记/整改 | hazards 域自建搜索 | 新选责任人 |
| F6 | 事故登记 | `/api/hse/accidents/personnel-search` | 新选当事人 |
| F7 | 培训计划人员 | trainings 域 + selector/batch | 新选 + 回显 |
| F8 | 保险人员管理 | `/api/insurance/personnel` 列表 | 展示+新选 |
| F9 | 考核目标/对象 | assessment 域资格同步 | 资格判定 |
| F10 | 人员管理页 | `/api/hse/employee/employees` 列表 | 管理/展示 |
| F11 | 员工档案中心 | `/employees/profile/list` | 展示 |

### 4.2 后端人员查询端点 × 过滤条件矩阵（交付物 #5，核心 25 端点）

过滤缩写：DEL=employee.is_deleted=false；CUR=is_current=true；PRI=is_primary=true；ASG-ACT=assignment_status='active'；TERM=employment_relation 终态过滤；FORMAL=employment_relation='正式员工'。

| 域 | 端点（方法+路径） | route:行号 | service→SQL 来源 | DEL | CUR | ASG-ACT | TERM/FORMAL | 终态误选风险 |
|---|---|---|---|---|---|---|---|---|
| **公共选择器** | GET `/employees/selector` | hse-employee/selector.js:16 | employeeSelectorService:8→v_employee_org_full | ✔ | ✔ | 视图列 | ✘ | **P0·1,806 人** |
| | GET `/employees/selector/:id` | :21 | :55→同上 | ✔ | ✔ | — | ✘ | **P0** |
| | POST `/employees/selector/batch` | :26 | :70→同上 | ✔ | ✔ | — | ✘ | **P0** |
| **隐患** | 隐患列表/提醒回显责任人 | hazards 域 | hazardService:1149/1172/1224 `LEFT JOIN v_employee_current` | 视图 | 视图 | — | ✘ | ✘ 历史展示正确（见 §六） |
| **事故** | GET `/api/hse/accidents/personnel-search` | accidents/main.js:26 | accidentService:1414→v_employee_current `name ILIKE` | ✔(employee_deleted) | ✔ | — | ✘ | **P1**；**且无权限中间件** |
| **三违** | 前端经公共选择器选人 | — | 见公共选择器 | — | — | — | — | 继承 P0 |
| **培训** | 培训批量查询 | trainings 域 | trainingPlanService:403→v_employee_current | 视图 | 视图 | ✔ :403 | ✘ | **P1**（培训名单含终态人） |
| **考核** | 对象资格同步（正向） | assessmentScheduler 等 | assessmentTargetEligibility:82 FORMAL_EMPLOYEE_ELIGIBILITY_SQL | ✔ | ✔(并 relation_status) | ✔ | **✔ FORMAAL 冻结口径** | ✘（CHECKPOINT-6 后已冻结） |
| | 目标责任书台账 | objectives 域 | objectiveService:171 buildRosterFrom→v_employee_current | ✔(视图) | ✔ | — | ✘ | **P1·台账花名册含终态 1,958 人** |
| | 签订人解析 resolveSignee | objectives 域 | objectiveService:240-253→v_employee_current | ✔ | 视图 | ✔ :240 | ✘ | **P1**（注释自称"在职"实未过滤） |
| **保险** | GET 人员主列表 | insurance 域 | insurancePersonnelService:223-260 + ACTIVE_ROSTER_JOIN(insuranceShared:361) | ✔ | 视图 | — | **✔ FORMAL** | ✘ 正面教材 |
| | GET `/personnel/pending-list` | insurance 域 | insurancePersonnelService:819→v_employee_current | ✔ | 视图 | — | ✘ | **P2**（待参保名单含终态人） |
| **网格** | 签到归属 load() | WPS/签到链 | signinAttribution:109-117→v_employee_current JOIN employee | ✔ | ✔ | — | **✔ FORMAL** | ✘ 正面教材（注释即审计记录） |
| **超龄** | 超龄统计 | over-age 域 | overAgeService:172/179→employee 直查 | ✔ | LEFT JOIN 视图 | — | **✔ FORMAL** | ✘ 正面教材 |
| **待办** | objectives:responsibility-unsigned | todos.js:28-44 | v_employee_current | ✔ | 视图 | ✔ :32-33 | ✘ | **P1**（1,806 终态人列为"未签"待办） |
| | insurance:uncovered | todos.js:49-63 | v_employee_current | ✔ | 视图 | — | ✘ | **P2** |
| **档案** | GET `/employees/profile/list` | profile-center 域 | employeeProfileService:13→v_employee_current JOIN employee | ✔ | 视图 | — | status=active 时 ✔ :66-67 | 部分（is_driver 已排除 :46-58；默认列表按语义应含终态人，见 §六） |
| **身份** | resolveEmployee / resolveEmployeeByName | 多处 | employeeResolver:43/54/65/115→v_employee_current | ✔ | 视图 | — | ✘ | 登记（身份链语义裁决点，§八） |
| **人员管理** | GET `/employees` 列表 | hse-employee/employee.js | employeeService:46→v_employee_current JOIN employee | ✔ :49 | 视图 | — | 可选参数 employmentRelation | ✘（管理页展示终态人合法；筛选参数已存在 :48） |
| **驾驶员** | GET `/api/hse/driver-risk-center/drivers` | hse-driver-risk-center.js:160 | p.name ILIKE 驾驶员/司机 | — | — | — | ✘ | **P1**；**无权限中间件** |

### 4.3 旧表 / 文本匹配路径（explore-legacy，主对话复核锚点）

| 类别 | 结论 | 证据 |
|---|---|---|
| `hse_employee_relation` | **0 个活代码读取方**（生产/路由触达为零，冻结不删成立） | 全仓 grep，仅 SQL 迁移与 .bak/归档命中 |
| `personnel` 表 | 唯一读取 `routes/personnel.js`（app.js:441 挂载）；**前端 6 变体零调用**；仅 k6 压测脚本 + menus 种子双源残留 | P1-01 结论复核一致 |
| `personnel_id` 字段 | 全部实际指 employee.id（grid_areas 62、driver_monthly 577、accidents 4 等）；insurance pivot 的 `personnel_id` 为保险表自有列非人员外键 | explore-legacy + B-1-P0 |
| 姓名文本归属匹配 | 8 处活代码（violations.name、accidents.involved_person、party backfill 等），属各业务域历史逻辑，**非人员选择入口**，逐处登记不混入本节点整改 | explore-legacy 清单 |
| `hse_employees` 降级 | trainingPlanService:399 注释声称可降级，实际 catch 分支仅回填空名（:410-412），**无 hse_employees 活读取** | 主对话实读 :395-415 |
| `department` 人员挂接 | orgTreeService.createDepartment:399-435 仍活写 department（B-1-P4 范围）；resolveOrgUnitId(ASG:53-78) 名称匹配映射 org_unit_id（不可直接拆，P1-01 已定） | 复核一致 |

## 五、当前人员判定口径对照表（交付物 #6）

| 口径 | SQL 形态 | 使用处 | 与权威口径偏差 |
|---|---|---|---|
| ① is_deleted+is_current | `v_employee_org_full WHERE is_deleted=false AND is_current=true` | **公共选择器 3 方法** | **最大**：含 1,806 终态人（55.8%） |
| ② is_current（视图直用） | `v_employee_current`（含 employee_deleted=false） | employeeResolver、todos×2、trainingPlanService:403、accidentService:1414、insurance pendingList:819、objectiveService 台账/resolveSignee | 含 1,958 终态人 |
| ③ is_current+ASG-ACT | `+ assignment_status='active'` | objectiveService:240、todos:32-33、trainingPlanService:403 | **无效增强**：终态人段 100% 仍 active（探针 3：1806/1806） |
| ④ 正式员工 | `JOIN employee ... employment_relation='正式员工'` | signinAttribution:117、overAgeService:172/179、insuranceShared:361（ACTIVE_ROSTER_JOIN）、profile status=active :66、assessmentTargetEligibility:82 | **正确**（R4 冻结口径） |
| ⑤ 终态排除（NOT IN） | `NOT IN (terminalRelationValueListSql())` | employeeProfileService is_driver :46-58 | 正确（含姓名兜底瑕疵） |
| ⑥ 无过滤 | FROM employee / v_employee_current 无关系条件 | employeeService.listEmployees 默认（管理页语义合法） | 视业务语义 |
| ⑦ 状态码终态 | `TERMINAL_STATUS_CODES=['inactive','retired']`（employeeStatusDict:81） | 段状态写入侧判定 | **不可用于选人过滤**：终态人段形态为 active（探针实证），status 与关系脱钩即 CHECKPOINT-6 事故根因 |

## 六、终态误选风险清单（交付物 #7）与历史展示误过滤风险清单（交付物 #8）

### 6.1 终态误选风险（新业务选择资格缺失）

| 级别 | 入口 | 量化影响（dev） | 证据 |
|---|---|---|---|
| **P0** | 公共选择器 3 端点（三违上报 F2/F3、网格员指派 F4 及全部下游消费者） | 每次打开下拉返回 3,238 人中含 **1,806 终态人（55.8%）**，且 LIMIT 20 按 name 排序无加权 | §三表 + §2.3 探针；前端 F2-F4 |
| **P0-附** | 选择器 3 端点无权限中间件 | 任何登录态可枚举全量人员（含手机号等敏感字段虽未返回，但 name/code/org 可枚举） | selector.js:16-26 无 requireRole/requirePermission；对照 employee.js:75-84 |
| **P1** | 事故 `/personnel-search`（选事故当事人） | 同上口径，含终态人；无权限 | accidentService:1414-1425、accidents/main.js:26 |
| **P1** | 目标责任书 resolveSignee（签认） | 终态人可被解析为签订人 | objectiveService:240-253 |
| **P1** | todos「目标责任书未签」待办 | 1,806 终态人被列为未签待办（考核域下游统计污染） | todos.js:28-44 |
| **P1** | 目标责任书台账花名册 | 台账基数含 1,958 终态人（签订率统计分母虚大） | objectiveService:171 |
| **P1** | 培训批量查询 | 终态人可进培训名单 | trainingPlanService:403 |
| **P1** | 驾驶员风险中心 | 无终态过滤 + 无权限 | hse-driver-risk-center.js:160 |
| **P2** | 保险 pending-list、insurance:uncovered 待办 | 待参保/未参保名单含终态人 | insurancePersonnelService:819-830、todos.js:49-63 |
| 登记 | employeeResolver（登录身份链） | 终态人仍可建立员工上下文；是否拦截属身份链业务裁决（终态人补录历史数据可能需要登录），**不在本节点裁决** | employeeResolver:43-121 |

### 6.2 历史展示误过滤风险（现有实现评估 + 禁止清单）

**结论：本次审计未发现「把不可新选错误实现成历史不可见」的现存案例**；以下 LEFT JOIN 回显路径**必须保持现状，禁止在 P1-03-02 中加终态过滤**：

| 路径 | 证据 | 为什么不能过滤 |
|---|---|---|
| 隐患责任人回显 | hazardService:1149/1172/1224 `LEFT JOIN v_employee_current` | 历史隐患的责任人即使已辞职，未闭环隐患的展示/催办必须可见人名 |
| 事故 involved_person 文本 | accidentService（姓名快照列） | 历史事实记录，非实时关联 |
| 保险单据 person_name 快照 | insurancePivot person_name 列 | 单据历史快照 |
| 考核既有对象 | assessmentTargetEligibility:74-77 注释明示反向清理分支不使用门禁（target_id 外键无级联，强删有扣分引用对象会硬失败） | 历史周期既有行移除属独立业务决策 |

**需提防的边界**（P1-03-02 实施时的红线）：①公共选择器还被用于**回显**（`getSelectorById`/`batchSelector` 的注释即"已选择员工回显"）——若直接在这两个方法加终态过滤，已选终态责任人的**回显会消失**（例如历史隐患编辑页打开时责任人下拉回显 404）。正确做法：新增/编辑的「候选列表」过滤终态，回显按 id 直查不过滤（或过滤但仅当该 id 无历史引用时才隐藏——建议前者，简单且安全）。②`listSelector` 被 F2/F3/F4 用作新选，也被部分页面复用回显（explore-fe 附录 A 标注）——P1-03-02 需逐前端调用点标注「新选/回显」语义后分别路由到不同参数。

## 七、可直接复用的现有工具（交付物 #9）

| 工具 | 位置 | 说明 |
|---|---|---|
| `isTerminalRelation(value)` | employeeStatusDict.js:287-292 | JS 侧统一终态判定（NULL→false、中间态→false、仅辞职/死亡/退休精确命中） |
| `terminalRelationInSql(column)` | :256-257 | SQL 片段：`col IN ('辞职','死亡','退休')` |
| `terminalRelationValueListSql()` | :268-270 | 值列表（供 NOT IN） |
| `knownRelationInSql(column)` | :250-252 | 花名册全员口径（避免漏统计） |
| `FORMAL_EMPLOYEE_ELIGIBILITY_SQL` | assessmentTargetEligibility.js:82-88 | R4 冻结口径（CHECKPOINT-6 事故后），EXISTS employee 正式员工判定 |
| `ACTIVE_ROSTER_JOIN` | insuranceShared.js:361-365 | 保险域在职花名册 JOIN 片段（FORMAL） |
| `displayStatusSql / profileStatusSql` | employeeStatusDict.js:329-353 | 展示派生（退休/离职/段状态） |
| 正面教材 | signinAttribution:109-117、overAgeService:172、insuranceShared:361、employeeProfileService:66-67/46-58 | 四种成熟的正确过滤写法可直接抄 |

## 八、建议统一规则及适用范围（交付物 #10，供 P1-03-02 裁决，不在本节点实施）

**R-SEL-1（新业务选择资格）**：凡用于「新建/编辑业务时选择人员」的候选列表端点，必须叠加 `employee.employment_relation NOT IN ('辞职','死亡','退休')`（即复用 `terminalRelationValueListSql()`），推荐以 `EXISTS`/`JOIN employee` 形式实现（与 FORMAL_EMPLOYEE_ELIGIBILITY_SQL 同构；等价于 FORMAL 口径但保留 NULL 人员——NULL=待核实是否可选属业务裁决点，建议默认**可选**以避免 152 人凭空消失，需项目负责人确认）。

**R-SEL-2（历史数据展示资格）**：回显/详情/列表展示历史记录中的人员引用，**禁止**套用 R-SEL-1；已选人员的回显走按 id 直查。两类条件不得合并为视图级全局过滤。

**R-SEL-3（视图列缺口）**：`v_employee_org_full` 与 `v_employee_current` 均无 `employment_relation` 列。两个方案：(a) 选择器 SQL 内 JOIN employee（零 DDL，P1-03-02 可直接实施）；(b) 扩视图加列（DDL，涉及生产视图重建，归 B-1-P4）。建议 P1-03-02 先走 (a)。

**R-SEL-4（权限）**：选择器 3 端点与 `/personnel-search`、`/driver-risk-center/drivers` 应补权限中间件（对照 employee.js:75-84 既有 requireRole+requirePermission 模式）。

**适用范围**：R-SEL-1 适用于 §4.2 矩阵中标 ✘ 的全部「新选/资格」端点（P0×3 + P1×5 + P2×2）；R-SEL-2 适用于 §6.2 全部 LEFT JOIN/快照路径。**不适用**：employeeResolver 身份链（裁决点）、人员管理列表（⑥ 口径合法）、培训双表（C5 专项）、超龄域（已正确）。

## 九、P1-03-02 需修改的精确文件清单（交付物 #11）

| # | 文件 | 修改点 | 风险 |
|---|---|---|---|
| 1 | `server/services/employeeSelectorService.js` | 3 方法 SQL 叠加 R-SEL-1 条件；**回显两方法需先厘清前端回显调用点**（§6.2 边界①），建议加 `includeTerminated` 参数由调用方声明语义 | 中（前端回显联动） |
| 2 | `server/services/accidentService.js` | accidentPersonnelSearch:1421-1425 加 R-SEL-1 条件 | 低 |
| 3 | `server/services/objectiveService.js` | resolveSignee:240 base 条件追加 R-SEL-1（注释同步纠正） | 低 |
| 4 | `server/routes/todos.js` | :28-44 未签待办、:49-63 未参保待办加 R-SEL-1 | 低 |
| 5 | `server/services/trainingPlanService.js` | :403 追加 R-SEL-1（仅新进名单路径） | 低 |
| 6 | `server/services/insurancePersonnelService.js` | pendingList:819-830 加 R-SEL-1 | 低 |
| 7 | `server/routes/hse-employee/selector.js` + `routes/accidents/main.js:26` + `routes/hse-driver-risk-center.js:160` | 补权限中间件（R-SEL-4） | 低（需确认前端角色覆盖） |
| 8 | `server/services/employeeProfileService.js` | :46-58 姓名/CODE 借值兜底简化为本行关系直读（e.employment_relation），去姓名匹配 | 低 |
| 9 | 测试 | 新增 selector 终态过滤单测（mock client，仿 employee-delete-transaction 模式）；回归 §4.2 全部 P0/P1 端点 | — |

**明确不改**：hazardService 回显、保险快照、考核既有对象、employeeResolver、trainingPlanService 降级分支、cost.js、H5/Worker/飞书链路。

## 十、测试建议与回归范围（交付物 #12）

1. **单元**（不连库）：employeeSelectorService 3 方法各 2 例（终态排除生效/NULL 关系人员保留）；accidentPersonnelSearch、resolveSignee、todos 两处理器、pendingList、trainingPlanService 各 1-2 例。仿 `__tests__/employee-delete-transaction.unit.test.js` 的 mock-client 模式。
2. **dev 只读探针回归**：修改后以 §2.3 同款探针复测 `selector_terminal_emp` 应为 0（或=业务确认的保留值）。
3. **全量回归**：`npx cross-env NODE_ENV=test jest`（多 worker 口径；基线 8 套件/3 用例失败零劣化）。
4. **风险等级**：中——选择器是 30 个前端调用点的公共底座，`getSelectorById`/`batchSelector` 承担回显，过滤过宽会造成历史记录"人名消失"（任务书 §3-C 明令防止）；故 P1-03-02 必须先完成前端调用点「新选/回显」语义标注（explore-fe 附录 A 已具备底稿）再动手。

## 十一、未解决问题与后续节点建议（交付物 #13）

1. **NULL 关系人员的可选资格**（dev 152 人）：R-SEL-1 默认可选或不可选需项目负责人裁决（建议可选+登记）。
2. **终态人持 active current 段的历史存量治理**（dev 1,806/生产 1,947）：选择器过滤只是读侧兜底，段数据本身与关系脱钩，属 B-2/B-3「重复语义治理」或专项数据修复（需要写权限，非本节点）。
3. **employeeResolver 身份链是否拦截终态登录**：涉及终态人补录历史数据场景，待裁决。
4. **视图加列 vs SQL JOIN**：R-SEL-3(b) 的 DDL 方案归 B-1-P4。
5. **选择器无权限中间件**：补权限需确认前端全部调用方角色覆盖（F2-F4 涉及移动端账号），建议与 R-SEL-1 同批实施但独立提交。
6. **`--runInBand` OOM**（personnel-insurance 套件 require app.js 时 4/8GB 堆均爆）：基线既有问题，建议独立技术治理项。
7. **B-1-P1-03-02 前置**：本项目负责人确认 R-SEL-1 的 NULL 语义后，按 §九清单实施；本节点到此停止，等待报告验收。

---

## 附录 A：前端人员选择调用点全量清单（explore-fe 产出 + 主对话抽验）

> 主对话抽验锚点：F1-F4（grep `employees/selector` 直接命中）、hazards/accidents 调用链——全部吻合。

**A1. 公共选择器直接消费者（4 文件，grep `employees/selector` 实测命中）**

| 文件 | 锚点 | 用途 | 分类 |
|---|---|---|---|
| `src/api/hse/employee.ts` | selector 系列封装函数（getEmployeeSelector/…） | 全仓唯一 API 定义点 | — |
| `src/views/mobile/inspection/violation.vue` | 当事人选择 | 移动巡检三违上报 | **新选** |
| `src/views/mobile/violation/new.vue` | 当事人选择 | 三违登记新建 | **新选** |
| `src/views/site/grid/attribution/index.vue` | 网格员指派 | 网格归属管理 | **新选** |

**A2. 自建人员端点消费者（按业务域，后端锚点见 §4.2 矩阵）**

| 域 | 前端位置（views/…） | 端点 | 分类 |
|---|---|---|---|
| 隐患 | `src/views/hazards/index.vue` 等隐患登记/整改页 | hazards 域责任人搜索 | 新选（新单）/回显（旧单编辑） |
| 事故 | 事故登记页 | `/api/hse/accidents/personnel-search` | 新选 |
| 培训 | `src/views/hse/` 培训计划/记录页 | trainings 域 + `selector/batch` | 新选 + 批量回显 |
| 考核 | `src/views/hse/assessment-monthly/*`、目标责任书页 | assessment/objectives 域 | 资格判定（服务端同步，前端不直接选人） |
| 保险 | 保险人员管理页 | `/api/insurance/personnel` 列表 + pending-list | 展示 + 新选 |
| 档案 | 员工档案中心页 | `/employees/profile/list` | 展示（含终态人合法） |
| 人员管理 | 系统人员管理页 | `/api/hse/employee/employees` | 管理/展示 |
| 待办 | 工作台待办列表 | `/api/todos`（服务端聚合） | 展示 |

**A3. 负向发现（防止误改，6 项）**

1. 无全局统一人员下拉组件——各域自行调 API，P1-03-02 无法"改一处生效全局"，必须逐端点实施（§九清单即为此）。
2. mobile 端两处直接内联 URL 调选择器（不经统一 API 封装层）——后端过滤兜底必须做在前端不可绕过处。
3. 网格归属与 mobile 三违使用不同参数形态（org_unit_id vs keyword）——后端条件叠加不影响参数契约。
4. **回显与新选共用同一 list 端点**（F2-F4 及 hazards 旧单编辑）——P1-03-02 的最大风险点，见 §6.2 边界①。
5. 部分页面人员列表来自业务表 JOIN（如考核既有对象、保险单据快照），不经过人员端点——不要误改这些。
6. api 层无统一超时/取消——与本节点无关，登记不处理。

## 附录 B：审计方法自证

grep 模式与命中数（主要）：

| 模式 | 范围 | 命中 |
|---|---|---|
| `ensureViewFields|v_employee_current` | server/ | 100+（视图消费方 40+ 文件） |
| `FROM v_employee_org_full` | server/routes+services | 6 文件 |
| `hse_employee_relation` | server/（排除归档） | 迁移 SQL 与 .bak 外 **0 活代码** |
| `FROM personnel` / `personnel_id` | server/ | personnel 表 1 路由；personnel_id 全指 employee.id |
| `employees/selector` | 前端 src | 4 文件 |
| `employment_relation` | server/services | 正确口径 5 处（④⑤）+ 档案中心 |
| `requireRole|requirePermission` | routes/hse-employee/* | CRUD 有、selector 无 |
