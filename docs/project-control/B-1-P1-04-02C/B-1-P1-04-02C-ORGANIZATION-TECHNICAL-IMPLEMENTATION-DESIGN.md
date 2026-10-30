# B-1-P1-04-02C｜组织模型技术实施设计与实施边界冻结预审报告

> 性质：只读审计 + 技术设计。零代码/零 DDL/零 DML/零生产查询。
> 设计基线：04-02A（aa4c11d）→ R1（3b80e69）→ 04-02B（3aae62f）→ 04-02B-R1（8ab49b8）。
> 本节点不是 M0/M1/M2，不实施任何变更。

---

## 一、实际执行基线

| 项 | 值 |
|---|---|
| 分支 / 起始 HEAD | `feat/b02-dec-03.13-a02d-status-code` / `8ab49b8`（04-02B-R1，`git log` 实测） |
| cost.js | staged `A` + MD5 `e88ae2b0b275346dfc1431408aa00bff`（全程不变）✅ |
| 目标报告目录 | 上传前不存在 ✅ |
| 冻结目录 | grid-mobile-cloudflare / WPS / H5 / 飞书：未触碰 |
| dev 只读核验 | 3 轮 READ ONLY 事务，`current_database()` 断言 = `safety_dashboard_dev`，COMMIT 收尾；探针存档 `.workbuddy/tmp/c-baseline-check{,2}.sql`（不进版本库） |

### 1.1 实态漂移记录（任务书 §二"不得沿用旧报告结论"）

| # | 漂移 | 实测证据 | 对既有结论影响 |
|---|---|---|---|
| DR-01 | `cleaning_team` 由 51 → **52** 条 | `id=78 测试单元_119_改 / TEST-U-119`，created 2026-08-01 17:02，**测试残留**（其余最新真实记录 CT-051 时集镇四班 2026-07-22） | R1「51:51 双射」结论不推翻（51 条真实班组无变化）；M2 对拍须排除 TEST- 前缀残留，残留处置列入 D-01 数据迁移需求 |

其余核对（ea 索引/约束、org_type 分布、146 有效作业段、ea 零触发器）与 R1/04-02B-R1 一致，见 §二。

---

## 二、代码与数据库证据（本节点实测）

### 2.1 数据库实态（dev READ ONLY，2026-10-30）

**employee_assignment**（R1 已证 + 本节点重核）：
- 索引 7 个：`pkey(id)`、`uk_emp_assign_primary` = **UNIQUE btree(employee_id) WHERE is_primary AND is_current AND NOT is_deleted**、普通索引 `employee_id`/`org_unit_id`/`operation_unit_id`/`position_id`/`(is_current,is_deleted)`。
- 约束 5 个：PK + FK employee / org_unit(ON DELETE SET NULL) / position(SET NULL) / supervisor(SET NULL)。**operation_unit_id 无 FK、无 CHECK、无唯一约束**。
- **触发器：0 个**（本节点实测 pg_trigger——三向只读触发器全在 hse_employee_org，ea 本体无触发器）。关段新建设计无触发器干扰。
- 现态：current+未删+operation_unit_id 非空 = **146 段，每员工恰 1 段，0 冲突；invalid_op（指向不存在作业单元）= 0**。

**hse_operation_unit**（13 列）：`org_unit_id bigint NOT NULL`（**无 FK**）、`unit_name/unit_type/unit_code NOT NULL`、`status NOT NULL`、`supervisor_id`（无 FK）、`headcount/location/description`、`is_deleted NOT NULL`。实态分布：**cleaning_team 52（51 真实+1 测试）/ collection_team 13 / operation_center 12 / transfer_station 11 / center_vehicle_team 1，全部 active**。

**hse_org_unit / employee**：表级约束均仅 PK（本节点实测 pg_constraint）；org_type 四值 town_center 12 / department 5 / center 2 / company 1、无 CHECK（04-02A §E1 维持）。employee 表约束仅 PK + 既有唯一键（花名册匹配链依赖，B-1 系列已证）。

**考核域**：
- `hse_assessment_target`：**921 条 active，无 org_unit_id / operation_unit_id 列**（查询列不存在报错实证）；组织关联 = `township VARCHAR(50)` + `department VARCHAR(50)` 文本列，distinct 16/16。
- `hse_assessment_score`：按 `target_id + cycle_id + metric_id` 记分（sprint10d2_assessment_init.sql:198+），即分数挂在**人**（target=employee）上。
- `hse_assessment_metric`：`category VARCHAR(30)` + `weight_manager/weight_admin`（:150-168）——分权重体系存在，但无考核体系类型字段。

### 2.2 is_primary 全仓实码语义（§七 专项分析的事实基础）

| 证据 | 位置 | 语义 |
|---|---|---|
| orgTreeService 6 处 | :49/:65/:89/:145/:159/:290 | 管理组织人数统计过滤：`ea.is_current=true AND ea.is_primary=true AND ea.is_deleted=false` |
| employeeProfileService 6 处 | :87/:118/:139/:174/:188/:211 | 一人一档任职段查询：同上过滤 |
| overAgeService 4 处 / employeeService 3 处 / riskScoreService / employeeResolver 等 | （grep 清单） | 同口径：is_primary 与 is_current 成对出现 |
| 写入侧 | assignEmployee :508、rehireEmployee :790（`is_primary: true` :855）、V2 导入 :1057 | **所有现行写入均 is_primary=true 硬编码** |

**实码结论**：`is_primary` 在全部活代码中是**管理组织主段标记**（is_primary+is_current 成对 = "唯一有效管理归属段"），与作业班组无任何代码关联。**这不是技术未决，是实码可证**；但"作业归属段是否必然 is_primary=true"的**业务语义**仍按任务书 §5.5 标记为待业务确认（Q-A，§十五）——技术层面不需要依赖它（见 §六.3）。

### 2.3 调用链现状（R1 定局维持，本节点复核关键点）

- `employee_assignment` 写入：V2 导入 `employeeImportV2Service.js:1057`（唯一写 operation_unit_id 处）；`assignEmployee` :470-530 INSERT（无 operation_unit_id 列）、`rehireEmployee` :788（同）、`terminateEmployee` :1060（**不新建段**：FOR UPDATE 锁 employee :1093 + 关 current 段 :1138-1140 区间，终态处理）。并发防护先例：`assignEmployee:450-453` 注释明确 FOR UPDATE 锁序（先员工后段）。
- 组织 CRUD：hse-org-center.js 未挂载（app.js:515-517 注释）；活的组织写入口 = orgTreeService create/update/delete + 导入域 matchOrgPath（employeeImportService.js:236-278）。
- 组织树前端消费：04-01 explore-fe2 定局（4 类 P0/P1 双 ID 混用点）维持。
- 考核域消费组织：assessmentService 按 `org_type IN ('department','operation_center','center')` 聚合（'operation_center' 死值 5 处）；hseAssessmentAnalysisService 按 org_unit_id 读乡镇（:316-404）。

---

## 三、目标数据模型（§四 设计）

> 业务依据：BR-01/BR-02（用户已确认）；架构依据：04-02A 方案 B（有条件推荐 → R1 条件已由本报告承接）。

### 3.1 职责与关联

| 模型 | 职责 | 关联 |
|---|---|---|
| `hse_org_unit` | 唯一管理组织模型：公司→环卫作业中心→12 乡镇作业中心→职能部门等；**不承载班组** | parent_id 自关联（现态断链 0） |
| `hse_operation_unit` | 唯一生产作业单元模型：基层班组（cleaning_team）、转运站（transfer_station）、收集队（collection_team）、车队、作业中心作业面 | `org_unit_id → hse_org_unit.id`（现 NOT NULL 无 FK） |
| `employee_assignment` | 唯一权威任职历史段（BR-09），双列承载两维 | org_unit_id + operation_unit_id |

- **一个管理组织对应多个作业单元：允许且是常态**（1 乡镇 → N 班组/转运站）——org_unit_id 非唯一，现态已如此（12 乡镇 → 78 个作业单元）。
- **12 个乡镇中心双登记处理**（operation_center 12 条 vs town_center 12 条）：作业面 operation_center 12 条**保留**（乡镇中心的作业面登记，BR-01 框架下的管理面/作业面双载体），M2 补 FK 时与其 town_center 的 org_unit_id 精确对拍；不合并、不删除。
- **市政绿化分支**（center 2 条）：不套用环卫乡镇模板；其直属队伍暂不入 hse_operation_unit 模板化（既有业务架构处理，BR-02）；org_type='center' 保留。

### 3.2 ID 契约（维持 04-02A §5 方案 3 + 三禁令）

- DB 主键 bigint 原样；API 节点 ID 类型化 `{ nodeType, refId }`（nodeType ∈ `org_unit` / `operation_unit`）；
- 禁 `Number('ou_X')`、禁名称反查 ID、禁无序 LIMIT 1；
- 旧 `ou_` 合成串仅在 orgTreeService 内部生成/解析（listDepartmentEmployees :315 已支持），目标 API 不再输出 `ou_` 字符串，前端拿 `{nodeType, refId}`。

### 3.3 组织树与 API 区分

- 树结构：管理组织树骨架（hse_org_unit，nodeType=org_unit）→ 乡镇节点下挂作业单元子节点（nodeType=operation_unit，按 hse_operation_unit.org_unit_id 精确挂载，**废除** orgTreeService :202-222 名称前缀挂载与 :232-242 人数均摊）。
- API：`GET /hse/employee/org/tree` 返回统一节点 `{ nodeType, refId, name, orgType?, unitType?, headcount }`；写操作按 nodeType 路由到对应服务（org_unit → 组织 CRUD；operation_unit → 作业单元 CRUD）。
- 前端防混用：NTreeSelect/OrgTransferModal key 改为 `${nodeType}:${refId}` 复合串，提交时结构化传参（修复 04-01 fe2 的 4 类混用点的目标形态）。
- **51 班组映射成果继承**：R1 CSV（51 行 EXACT 双射）直接作为 M2 `operation_unit_id` 补填映射表源；DR-01 测试残留（id=78）在补填脚本中按 `unit_code LIKE 'TEST-%'` 排除并登记处置。

### 3.4 旧 department 兼容退出

保留表与历史数据；`department.org_unit_id` 桥接列维持只读；树/列表/员工查询改源后 department 降级为"历史快照读取"（§十一 退出策略总表）。

---

## 四、任职段状态模型与关段新建事务（§五 设计）

### 4.1 状态模型

单段双列：每段同时记录管理维（org_unit_id）与作业维（operation_unit_id），任一维变化 = **关段 + 建段**（BR-04，禁止原地覆盖）。段生命周期：`active(current)` → `closed(is_current=false, end_date=新段 start-1)`；历史段零改写（保留原 operation_unit_id / org_unit_id / dept_name 快照）。

### 4.2 事务时序设计（7 场景）

统一骨架（同单事务，锁序沿用 assignEmployee:453 先例）：

```
BEGIN;
  1. SELECT ... FROM employee WHERE id=$1 FOR UPDATE          -- 串行化同员工全部操作
  2. SELECT current 段 FOR UPDATE                              -- 锁旧段
  3. 校验终态闸门（辞职/死亡/退休 → 业务错误，B-1 既有规则）
  4. UPDATE 旧段: is_current=false, end_date=$start-1          -- 先关旧段
  5. INSERT 新段: is_current=true, is_primary=true, start_date=$start,
     org_unit_id=按场景, operation_unit_id=按场景              -- 后建新段
  6. INSERT employee_history（变动留痕）
COMMIT;
```

| 场景 | org_unit_id（新段） | operation_unit_id（新段） | BR-05 交互 |
|---|---|---|---|
| S1 同乡镇换班组 | 抄旧段 | **新班组 ID** | 先关后建：旧段已退出谓词，INSERT 不触发唯一冲突 ✅ |
| S2 跨乡镇换班组、管理不变 | 抄旧段 | 新班组 ID | 同 S1（BR-03：两维独立，管理段不动即抄旧） |
| S3 双维同时变化 | 新组织 | 新班组 | 同 S1 |
| S4 仅管理变化、作业不变 | 新组织 | 抄旧段（作业连续）或 NULL（脱离作业） | 抄旧→参与约束（正常，先关后建）；NULL→不参与 |
| S5 重复提交（同参数二次） | — | — | 第 1 次已关旧段；第 2 次"当前段"已是新段 → 应用层幂等预检（同 op+同 org+同日）返回幂等成功，不建第二段 |
| S6 两并发请求调整同一员工 | — | — | 步骤 1 FOR UPDATE 行锁串行化：后到者等锁→拿到锁后重读 current 段（已非其预检所见）→ 按最新段复核参数，参数失配返回 409 业务错误（沿用 :450-453 注释的锁序设计） |
| S7 事务中途失败 | — | — | 单事务回滚，旧段未关、新段未建、历史未写——零副作用 |

**PG partial unique index 事务内/并发行为核验**（任务书 §5.4 要求非理论推断）：
- **事务内**：唯一性对**语句级可见行版本**即时判定——步骤 4 UPDATE 后，旧段在本事务内即不满足谓词（is_current=false），步骤 5 INSERT 同 employee_id 不冲突。这是 PG 索引谓词的标准求值行为，且可由**既有实证**佐证：V2 导入同事务批量建段（:1057）与 B-1-P1-02-D 关段补 end_date 逻辑在同库运行无伪冲突报告。
- **并发**：两个事务同时"关同一段"时，步骤 2 的 FOR UPDATE 行锁使第二个事务阻塞至第一个提交；提交后第二个事务读到的新行快照中旧段已 is_current=false，其步骤 4 的 UPDATE 影响行数=0 → **rowCount=0 检测点**（沿用 B-1-P1-02-D 引入的 rowCount 检查模式）→ 返回 409，不盲目建段。
- **残余风险**：若未来有旁路写入绕过 FOR UPDATE（如直接 SQL），唯一索引是最后防线（§五 BR-05）。

### 4.3 服务与接口改造点

`assignEmployee`（:470 INSERT 补 operation_unit_id 列 + 场景参数）、`rehireEmployee`（:788 同）、新增 `changeOperationUnit`（S1/S2 核心，或并入 assignEmployee 参数化）；controller 传参增加 `operationUnitId`（结构化 refId，非名称）。

---

## 五、BR-05 班组唯一归属约束完整设计（§六 设计）

**方向锁定**（04-02B-R1 §4.2，本节点不更改）：

```sql
CREATE UNIQUE INDEX uk_emp_assign_operation_unique
  ON employee_assignment (employee_id)
  WHERE operation_unit_id IS NOT NULL AND is_current = TRUE AND is_deleted = FALSE;
```

十项要点逐条：

1. **唯一键 = employee_id**；operation_unit_id 仅出现在谓词（筛选参与约束的段）。
2. 同一班组允许多员工（键不含 operation_unit_id）。
3. 历史段（is_current=false）与已删段不参与。
4. **不约束 org_unit_id**（管理维多段 = U02 未决，不借道扩大）。
5. **is_primary 不入谓词**——02B-R1 已证：若含 `is_primary=true`，is_primary=false 的作业段绕过约束。本约束谓词与 is_primary 完全解耦。
6. **生产存量多段**：U05 未核验（零生产查询纪律）；**不得以 dev 146/0 冲突代替生产证据**。索引建立前必须先在生产跑同谓词存量检测（检测 SQL 归 D-03 迁移文件的前置步骤，非本节点执行）。
7. **唯一冲突的业务错误处理**：捕获 23505 + 约束名 `uk_emp_assign_operation_unique` → 转业务错误「该员工已存在有效作业班组归属」（非 500）；并发路径下优先由 FOR UPDATE + rowCount=0 检测拦截（§4.2-S6），索引为兜底。
8. **先关旧段再建新段**：§4.2 骨架顺序固定，顺序颠倒会在同事务内自触发唯一冲突。
9. **索引命名**：`uk_emp_assign_operation_unique`（与既有 `uk_emp_assign_primary` 命名族一致）。
10. **与 idx_assignment_employee_id 冗余取舍**：新唯一索引键同为 (employee_id)，谓词过滤后不能完全替代普通索引（普通索引服务无谓词查询）——**两者并存**；idx_assignment_employee_id 不删除（避免回归未知读路径）。

**独立迁移文件**：是（D-03 专属迁移，`CREATE UNIQUE INDEX ... CONCURRENTLY` 生产模式 + 前置存量检测步骤 + 回滚 = `DROP INDEX uk_emp_assign_operation_unique`）。**本节点不创建、不执行**。

---

## 六、负责人资格 / 花名册差异 / 作业单元停用（§七、§八 设计）

### 6.1 乡镇负责人（BR-07）

- **字段**：`hse_org_unit.manager_id` 现状无 FK、无活消费者（04-01 实证）。目标：manager_id 补 `REFERENCES employee(id)` FK（D-05 迁移），**禁姓名文本**（现态无姓名列，维持）。
- **资格校验落点：服务层**（orgTreeService 或恢复后的组织写服务）——`formalEmployeeEligibilitySql('e')` 生成器（employeeStatusDict，B-1-P1-03-02 已验证）作 EXISTS 校验：`employment_relation='正式员工'`，NULL/辞职/死亡一律拒绝；前端仅做提示，不承担校验（防绕过）。
- **适用面**：仅 12 个 town_center 节点写入 manager_id 时强制；市政绿化（center）及其他节点**不自动扩展**（U03）。
- **与写入口唯一化合并**：D-05 恢复 hse-org-center 路由前置 6 项必查（R1 :123 5 项 + 本节点负责人校验项）全部通过后才挂载。

### 6.2 花名册差异待核实（BR-09）

- **差异清单设计**：以「正式花名册归属 vs ea current 段」按身份匹配链（phone→employee_code→name→fail-closed，禁姓名自动匹配）比对，输出三类差异：①花名册有/系统无段 ②系统 current 段/花名册不一致 ③花名册终态/系统 current 段仍 active（关联 B-1 已知终态复活存量 1,806）。
- **承载机制**：**复用 V2 导入审核机制**（import_batch + 审核流），差异记录作为 batch 附属明细表（D-06 迁移），差异处置=人工核实后按 §4.2 关段新建执行，**不自动覆盖任何一方**。
- 不新增平行人员主数据；employee/employee_assignment 职责边界维持 BR-09。

### 6.3 作业单元停用（BR-08）

服务端停用流程（新端点，D-07）：

```
1. 校验 is_deleted=false
2. 统计 current+未删+operation_unit_id=$1 的段数 → >0 则生成「归属人员清单」
3. 该清单与花名册比对 → 差异待核实清单（6.2 机制）→ 存在未核实差异则拒绝停用
4. 人员转移：逐人执行 §4.2 S1/S2（关段+建段）
5. 复查步骤 2 = 0 → status='inactive' 软停用
6. 全程禁物理删除、禁级联改写历史段/考核记录
```

- **并发防护**：停用事务与人员分配事务竞争同作业单元——分配侧 FOR UPDATE 锁员工行（§4.2），停用侧步骤 2→5 在单事务内重读段数；残余窗口由 BR-05 唯一索引兜底（停用后新分配因 org 校验拒绝）。
- **历史考核/业务档案保留**：transfer_station_check、考核 target 等以 unit_name/org 快照引用，停用仅改 status，不动历史行。

---

## 七、月度生产绩效考核关联设计（§九 设计）

### 7.1 现状事实（本节点实测，非表名推断）

| 事实 | 证据 |
|---|---|
| 考核对象=人 | hse_assessment_target：employee_id/employee_name/position + **township/department VARCHAR 文本**（sprint10d2:62-90），921 条 active，distinct 16/16，无任何结构化组织列 |
| 分数挂人 | hse_assessment_score: target_id+cycle_id+metric_id（:198+） |
| 权重双体系痕迹 | metric.weight_manager/weight_admin（:150-168）→ 现表已隐含"经理线/安环线"两类权重，**无显式考核体系类型字段** |
| 乡镇月度回填表 | transfer_station_check 26 列：`area_team VARCHAR` 文本 + 六子项 numeric 扣分（ledger/sign/electricity/fire/item 等），**无结构化组织 ID** |
| HSE 专项考核聚合 | assessmentService org_type 过滤（死值 5 处）+ hseAssessmentAnalysisService 按 org_unit_id 读乡镇（:316-404） |
| 存量混用风险 | 考核域 6 套并行路由/3 套扣分算法/2728 僵尸指标行（B-1 链路定局） |

### 7.2 设计（不把 12 乡镇纳入 HSE 专项考核统计——维持 U06 未决）

1. **生产绩效与 HSE 专项的体系区分**：新增体系标识列 `assessment_system`（'production_perf' / 'hse_special'）于 cycle 或独立字段，**在数据模型层面显式分体系**；历史 921 条 target 默认标 'hse_special'（现状即安环专项口径），零行为变化。
2. **乡镇月度评分承载**：新增乡镇考核对象维度——方案：`hse_assessment_target` 增加 `org_unit_id BIGINT NULL` + `target_level`（'employee'/'org'/'operation_unit'），**而非另建平行考核表**（避免第二套考核域）。乡镇评分 = target_level='org' + org_unit_id 精确关联；**历史 921 条 employee 级 target 不迁移不改写**。
3. **班组评分承载**：transfer_station_check 增加 `operation_unit_id BIGINT NULL`（按 area_team 文本映射回填，51 班组 CSV 为映射源），月度班组明细可追溯到班组（BR-06.6）；area_team 文本列保留为历史快照。
4. **排名**：乡镇月度排名按 org_unit_id 聚合 score（视图或查询层），禁名称聚合。
5. **历史数据保护**：全部为**加列+回填**，零 UPDATE 既有分值/扣分行；回填映射失败进待核实（不猜测）。
6. **未决**：班组考核明细的指标模板（六子项之外是否扩展）、乡镇评分与班组明细的汇总口径——**04-02C 后业务确认**，不阻塞 D-08 的列结构落地。

---

## 八、旧模型兼容退出策略（§十 设计，13 对象逐个标记）

| 对象 | 标记 | 说明 |
|---|---|---|
| department（表） | **兼容读取 → 迁移后退役** | 历史快照保留；org_unit_id 桥接列只读；树/列表改源后零新写 |
| hse_employee_org（表） | **暂时冻结（维持）** | 三向触发器只读归档；退役评估须生产核验触发器在位性（U05） |
| departments（复数表） | **需要生产核验** | 生产存在性未证（U05）；7 处活引用改源（M2）前不得动 |
| 旧组织树接口（getOrgTree 混合读取） | **停止新增依赖 → 改造** | 名称前缀挂载/均摊废除（§3.3），接口路径保留平滑过渡 |
| 旧班组名称匹配逻辑（14 处，04-02A §E8） | **停止新增写入 → 逐点改 ID** | ruleEngine 四 adapter/培训签到/两中心 description.includes 最高危先行 |
| V1 人员导入 | **停止新增写入**（部门自动创建 :255-259 废除）→ **迁移后退役** | 与 V1 既有终态闸门衔接 |
| V2 人员导入 | **保留 + 补差异清单** | 映射规则表白名单化（04-02A :244）+ 6.2 差异机制 |
| assignEmployee | **保留 + 改造** | 补 operation_unit_id 列 + §4.2 事务骨架 |
| rehireEmployee | **保留 + 改造** | 同上（:788 INSERT 补列） |
| terminateEmployee | **保留（现状已正确）** | :1060 关段不改写 op/org 原值，历史保全符合 BR-04 |
| 员工详情与选择器 | **保留** | is_primary+is_current 读口径维持（§2.2）；选择器资格门 B-1-P1-03 已收敛 |
| 组织管理 CRUD | **迁移后恢复** | hse-org-center 恢复挂载前置 6 项（§6.1）+ orgTreeService 双轨 CRUD 收敛为单入口 |
| 现有考核模块 | **保留 + 加列扩展** | §7.2 加列不改历史行；6 套并行路由收敛属 C5 后续阶段 |

**禁双写**：所有"改造"均为单写入路径切换（cut-over），无新旧并行写入期；过渡期只读兼容。

---

## 九、后续实施批次（§十一 设计）

| 批次 | 范围 | 前置 | 迁移需求 | 业务确认 |
|---|---|---|---|---|
| **D-01** 组织与作业单元模型 | ou FK 补齐（hse_operation_unit.org_unit_id、hse_org_unit.manager_id）；org_type CHECK；TEST 残留处置；51 班组 CSV 固化为映射表 | M0 冻结 | 1 迁移文件（纯 DDL+数据对拍） | 否 |
| **D-02** 任职段服务与关段新建 | assignEmployee/rehireEmployee 补列+§4.2 骨架；新增 changeOperationUnit；controller 结构化参数 | D-01 | 无（纯代码） | 否 |
| **D-03** BR-05 唯一约束 | uk_emp_assign_operation_unique（生产 CONCURRENTLY+存量检测先行） | **D-02**（写入路径先收敛再上锁）+ 生产存量核验 | 1 迁移文件 | 否 |
| **D-04** 组织树与前端类型化 | tree API {nodeType,refId}；前端 4 类混用点修复；名称挂载/均摊废除 | D-01 | 无 | 否 |
| **D-05** 负责人资格与组织写入口唯一化 | 服务层正式员工校验；org-center 恢复前置 6 项；orgTreeService 双轨收敛 | D-01 | FK（并入 D-01 或独立） | 否（适用面 U03 默认 12 乡镇） |
| **D-06** 花名册差异待核实 | 差异明细表 + V2 审核流衔接 + 差异三分类 | D-02 | 1 迁移文件（差异表） | 否 |
| **D-07** 作业单元停用闭环 | 停用端点 + 花名册核对 + 差异拦截 | D-02+D-06 | 无 | 否 |
| **D-08** 月度生产绩效两级关联 | assessment_system 标识 + target 加列 + transfer_station_check 加列回填 | D-01；**班组指标模板待业务确认** | 1 迁移文件（加列+回填） | **是（明细口径）** |
| **D-09** 旧模型兼容退出 | department 改源收尾/复数表改源/名称匹配 14 点清零 | D-01~D-04 全部完成 | 无新迁移 | 否 |

**合并/拆分理由**：D-01+D-05 的 FK 同表可合并为一个迁移文件（但代码改造分批）；D-02 是 D-03/D-06/D-07 的共同前置（写入路径先唯一，约束与差异才有意义）；D-08 因班组指标模板需业务确认，列结构与模板扩展分两步实施；D-09 必须最后（所有读路径改源完成才退役依赖）。每批均含：自动化测试（jest，域内全绿+全量基线零劣化）、手工验收清单、回滚（DDL 反向脚本/代码 cut-back）、**生产变更单独授权**（D-01/D-03/D-06/D-08 涉及生产 DDL）。

---

## 十、未决问题清单

| # | 问题 | 类型 | 阻塞 |
|---|---|---|---|
| U05 | 生产存量：多作业段员工 / departments 复数表 / hse_employee_org 触发器 / 51 班组对拍 / org_type 分布 | **生产核验** | D-01/D-03 实施（不阻塞本设计与 M0 文档冻结） |
| Q-A | 作业归属段 is_primary 的业务语义（技术层无需依赖，§2.2 实码已证现写入全 true） | 业务确认 | 否（约束设计已解耦） |
| Q-B | D-08 班组考核明细指标模板与汇总口径 | 业务确认 | D-08 第二步 |
| U01/U02/U03/U04/U06 | 04-02B §七 维持不变 | 业务确认 | 各批次注明的范围 |

**停止条件执行记录**（任务书 §十四）：本节点未触发任何停止条件——代码/库结构与历史报告一致（除 DR-01 已记录）；is_primary 技术语义可实码确定（业务语义标记 Q-A）；考核模型可区分两体系（§7.2）；生产数据非本设计必要前提（全部标注 U05）。

---

## 十一、风险与回滚设计

| 风险 | 缓解 | 回滚 |
|---|---|---|
| BR-05 索引生产建立失败（存量多段） | 前置检测步骤硬门禁（检测不过不建） | DROP INDEX（秒级，无数据变更） |
| 关段新建切换期双写 | 单路径 cut-over，无并行写 | 代码 cut-back（旧逻辑保留一个版本周期） |
| 考核加列回填映射错误 | 映射失败进待核实，不猜测；零 UPDATE 历史分值 | 加列可整体置 NULL 回退 |
| 组织树改造前端回归 | 04-01 fe2 四类混用点清单为回归用例 | API 双输出过渡（{nodeType,refId} + 旧字段只读）一个版本 |
| org-center 恢复引发权限旁路 | 前置 6 项必查（R1 :123 + 负责人校验）逐项实证后才挂载 | 保持注释停挂（现态） |

---

## 十二、实施授权边界

- 生产数据库变更：**未授权**（D-01/D-03/D-06/D-08 的生产 DDL 届时单独申请）。
- M0：**未冻结**（本报告 + 04-02B/R1 齐备后，M0 冻结动作 = 文档化确认，仍待独立审查）。
- M1/M2：**未授权、未开始**。
- 本节点交付 = 本报告；无任何代码/迁移文件/数据库变更。

## 十三、本节点验收结论（自评，待独立审查）

- §一～§二：基线与证据全部实测，含 1 项实态漂移（DR-01）如实记录；
- §三～§九：18 项要求全覆盖，每项设计均有 文件:行号 或 SQL 证据支撑；
- 五类信息区分贯穿全文：**事实（实测）/ 业务规则（BR 引用）/ 技术设计（建议）/ 业务待确认（Q-*）/ 生产待核验（U05）**。

---

## 十四、路线图

```
OVERALL-00～06      [完成]
B-1-P0              [完成]
B-1-P1-01～03       [完成]
B-1-P1-04-01        [完成]
B-1-P1-04-02A/R1    [完成]
B-1-P1-04-02B/R1    [完成]
B-1-P1-04-02C       [本节点：技术实施设计已完成，待独立审查]
M0                  [未冻结]
M1/M2               [未授权]
生产数据库变更       [未授权]
B-1-P2～P4 / C3～C6 [未开始]
Z H5                [继续冻结]
```

---

## 附：交付信息

| 项 | 值 |
|---|---|
| 报告路径 | `docs/project-control/B-1-P1-04-02C/B-1-P1-04-02C-ORGANIZATION-TECHNICAL-IMPLEMENTATION-DESIGN.md` |
| 起始 HEAD | `8ab49b8` |
| 报告 commit | 见交付消息 |
| cost.js | staged `A` / MD5 `e88ae2b0b275346dfc1431408aa00bff`（不变） |
