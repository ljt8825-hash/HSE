# B-1-P1-04-02C-R1｜组织模型技术实施设计返修报告

> 性质：只读核验 + 定向设计返修（R1-01～R1-05）。零代码/零 DDL/零 DML/零生产查询。
> 返修对象：`docs/project-control/B-1-P1-04-02C/B-1-P1-04-02C-ORGANIZATION-TECHNICAL-IMPLEMENTATION-DESIGN.md`（`4463f10`，未改动）。
> 全部代码路径/行号以当前 HEAD 实码重取。

---

## 一、任务背景与核验范围

- 分支 `feat/b02-dec-03.13-a02d-status-code`，起始 HEAD `4463f10`；cost.js staged `A` + MD5 `e88ae2b0b275346dfc1431408aa00bff`（不变）。
- 本轮实码重读：`employeeAssignmentService.js`（assignEmployee :419 / rehireEmployee :648 / terminateEmployee :1060）、`employeeImportV2Service.js`（关段 :1025-1034 / 建段 :1056-1064 / 作业单元创建 :387 :411）、`hseAssessmentAnalysisService.js`（townshipRanking :550-620+）、`hse-org-center.js`（manager_id 读写 :140 :171 :208）、app.js 挂载表（`_tmp/baseline_import_route.js` **未挂载**，临时基线产物非活代码）。
- dev 只读 4 轮（`current_database()` 断言通过）：TEST-U-119 本体/引用面、operation_unit_id 全仓引用表清单、作业单元实态复计。

---

## 二、R1-04（先记录）：DR-01 修正——测试残留实态与处置边界

### 2.1 首次报告结论修正（自我勘误）

首次报告 DR-01 称「cleaning_team 由 51→52，52 条全部 active」。**该统计 SQL 未过滤 is_deleted，属误计**。dev 实测（本轮）：

| 事实 | 证据 |
|---|---|
| `id=78 测试单元_119_改 / TEST-U-119` **is_deleted = true（已软删）** | 本轮本体查询（status 列残留 'active' 但 is_deleted=t） |
| **任职段引用 = 0**（`ea_refs=0`，无 current/历史段） | `employee_assignment WHERE operation_unit_id=78` |
| 其余引用面全 0 | `hse_import_pending` / `hse_employee_relation` / `hse_import_mapping_rule` 各 0（唯一含 operation_unit_id 列的活表清单经 information_schema 实证：ea + 备份表 4 + 视图 3 + 上述 3 表） |
| **真实班组 = 51 条 active**，与 R1 CSV 完全一致 | `51 active + 1 软删 = 52` 总数复计 |

**R1（04-02A-R1）「51:51 EXACT 双射」结论完全成立，无漂移。**

### 2.2 处置边界（按任务书 §六 七条要求）

1. **正式映射集合** = R1 CSV 51 条（`is_deleted=false AND unit_type='cleaning_team'`）。
2. **排除规则**（M2 对拍与补填脚本统一采用）：`is_deleted = true OR unit_code LIKE 'TEST-%'`。
3. **引用核查清单已核**（上表三表 + ea 全 0）；考核/业务档案表（transfer_station_check 等）无 operation_unit_id 列（结构实证），无引用可能。
4. **处置建议：保持现状（无需任何动作）**——记录已软删、零引用，无孤儿风险；不删除、不归档、不改 status（避免无意义写操作）。
5. 授权边界：任何物理删除未授权；dev 与生产**分别核验**（U05 追加子项：生产是否存在 TEST-* 记录及其 is_deleted 状态）。
6. **首次报告 DR-01 段落以本节修正为准**（原报告不改）。

---

## 三、R1-01：D-07 作业单元停用 × 人员分配并发控制

### 3.1 实态前提（本轮重核）

- `hse_operation_unit` 活代码写入口**仅 V2 导入 INSERT 两处**（`employeeImportV2Service.js:387` cleaning_team / `:411` collection_team，均 `RETURNING id`）；hse-org-center.js 的作业单元 CRUD 未挂载（app.js 注释）；migrate_employee_v2.js 为一次性脚本。**现系统不存在任何作业单元更新/停用入口**——D-07 为全新端点，无存量行为兼容负担。
- 写 `ea.operation_unit_id` 入口：V2 导入 :1056-1064（唯一）；assignEmployee INSERT :508 / rehireEmployee :790 **不含该列**。
- 现有锁序先例：assignEmployee :456 员工 `FOR UPDATE`；rehire :670 同；terminate :1093 + :1139（先员工后段）；V2 关段 :1027-1033 **无员工 FOR UPDATE**（逐员工 client 事务但未先行锁员工行）。

### 3.2 统一锁序与两类事务设计

**全局锁序（两事务一致，死锁免环）**：`employee 行 → hse_operation_unit 行 → employee_assignment current 段行`。

**A. 分配事务**（统一任职段服务内，见 §五）：

```
BEGIN;
 1. SELECT ... FROM employee WHERE id=$1 FOR UPDATE;                     -- 员工锁
 2. SELECT id,status,is_deleted FROM hse_operation_unit WHERE id=$2 FOR UPDATE;  -- 目标作业单元锁
 3. 校验：unit 存在 AND is_deleted=false AND status='active'
    → 否则业务错误 OP_UNIT_INACTIVE / OP_UNIT_NOT_FOUND / OP_UNIT_DELETED
 4. 员工资格/终态闸门校验（B-1 既有规则）
 5. 关旧作业归属段（WHERE is_current AND NOT is_deleted，rowCount 检测）
 6. INSERT 新段（RETURNING id 判空）
 7. employee_history + 审计
COMMIT;  -- 任一步失败整体 ROLLBACK
```

关键点：**status 校验必须在 unit 行锁之内**（步骤 2→3 顺序不可倒置）——若先校验后加锁，存在「校验通过→停用事务提交→再加锁写段」的 TOCTOU 窗口。

**B. 停用事务**（D-07 新端点，唯一停用入口）：

```
BEGIN;
 1. SELECT ... FROM hse_operation_unit WHERE id=$1 FOR UPDATE;           -- 单元锁（与分配事务同一行）
 2. 校验 status='active' AND is_deleted=false（重复停用→幂等成功或明确错误）
 3. 花名册 × 系统任职段差异核对（差异未核实 → 拒绝，错误码 ROSTER_DIFF_PENDING）
 4. SELECT COUNT(*) FROM employee_assignment
    WHERE operation_unit_id=$1 AND is_current AND NOT is_deleted;        -- 锁内重读
 5. COUNT>0 → 业务错误 OP_UNIT_HAS_ACTIVE_MEMBERS（附人员清单）
 6. status='inactive' 软停用
COMMIT;
```

### 3.3 并发时序分析（6 场景）

| # | 场景 | 时序与结果 |
|---|---|---|
| 1 | 分配先取得锁，停用后进 | 分配持 unit 行锁提交（新 current 段已插入）→ 停用获得锁后**步骤 4 锁内重读**计数含新段 → >0 拒绝停用。**无窗口** ✅ |
| 2 | 停用先取得锁，分配后进 | 停用持 unit 行锁至提交（status=inactive）→ 分配步骤 2 等锁 → 获锁后步骤 3 校验 status≠active → 业务错误 OP_UNIT_INACTIVE。**无窗口** ✅ |
| 3 | 两操作人同时向同一 unit 分配 | 员工行不同 → 步骤 2 unit 行锁互斥串行；后至者锁内重校验 status。无数据竞争 ✅ |
| 4 | 同一员工同时分到两个不同 unit | 步骤 1 员工行锁互斥 → 串行；后至者重读 current 段复核，参数失配 409；BR-05 唯一索引兜底（即使锁序被旁路） ✅ |
| 5 | V2 导入与人工调岗并发 | V2 经统一任职段服务（§五）后同样先取员工锁 → 与人工调岗在员工行上串行化；批次内逐员工独立事务（见 §5.4），单员工失败不扩散 ✅ |
| 6 | 失败/超时/死锁 | 统一锁序 → 无锁环路，死锁理论不可达；防御性设置 `lock_timeout`（如 5s）→ 超时转 409 可重试错误；事务任何步骤异常整体 ROLLBACK，历史段零改写 ✅ |

**BR-05 的角色**：唯一索引只保证「同员工不出现两个有效作业段」，**不参与停用互斥**（本方案以 unit 行锁 + 锁内重读承担）；不依赖索引替代状态检查（任务书 3.4 要求）。

### 3.4 业务错误语义（23505 不裸露）

| 错误码 | 触发 | HTTP |
|---|---|---|
| OP_UNIT_NOT_FOUND / OP_UNIT_DELETED / OP_UNIT_INACTIVE | 目标单元不存在/软删/停用 | 404/410/409 |
| OP_UNIT_HAS_ACTIVE_MEMBERS | 停用时存在有效归属 | 409 |
| ROSTER_DIFF_PENDING | 花名册差异未核实 | 409 |
| EMP_OPERATION_CONFLICT | 员工 current 段 rowCount=0 或并发参数失配 | 409 |
| EMP_OPERATION_DUPLICATE | **任何** 23505（含 uk_emp_assign_operation_unique / uk_emp_assign_primary）捕获后统一转换 | 409 |
| LOCK_TIMEOUT | lock_timeout 超时 | 409（可重试） |

### 3.5 并发测试设计（可执行）

jest 集成（双 pg Client 模拟）：T1 分配→T2 停用（断言拒绝+计数含新段）；T1 停用→T2 分配（断言 OP_UNIT_INACTIVE）；双 client 同员工并发分配（断言一成功一 409）；关段 UPDATE 后人为 rowCount=0 注入；lock_timeout 注入重试。全部列入 D-02/D-07 验收。

---

## 四、R1-02：D-08 考核体系边界重新设计

### 4.1 现有调用链实态（本轮重读，非表名推断）

| 调用链 | 证据 |
|---|---|
| 乡镇排名 | `hseAssessmentAnalysisService.townshipRanking(:550)`：读 `hse_assessment_cycle`（:556/:564）→ `hse_assessment_target` 的 **`township` 文本列**（:596-601 ORDER BY township）→ 与 `hse_org_unit` org_name **名称匹配**建 Map（:614-620 targetByTown）→ 聚合排名 |
| 组织聚合入口 | 同文件 :299-355 三段查询：org_type IN ('department','center') + 子级员工聚合（名称关联） |
| 经理/管理员对象 | target.township/department 文本 + weight_manager/weight_admin 双权重（metric 表 :150-168）；管理员平均分兜底逻辑在 ranking 尾段（:620+） |
| 审核确认 | target.review_status/appeal_status/status（sprint10d2:72-90） |
| 前端/API | 考核域 6 套并行路由（B-1 存量定局） |

**结论**：现表对象=人 + township/department 文本名称关联；体系边界仅靠 metric 双权重隐式表达，无显式体系字段。

### 4.2 三方案比较

| 维度 | 方案 1：独立建模 | **方案 2：共用周期+对象/指标/结果分离（推荐）** | 方案 3：扩展现表加体系字段（首次方案） |
|---|---|---|---|
| 与现码兼容 | 新表新服务，零冲突；但排名/审核 UI 全新建 | cycle 表复用（月度天然对齐）；target/score 新表；服务层新模块复用评分工具 | 零新表；但 6 套路由+3 算法**每个查询都须记得加体系 WHERE**，一次遗漏即混数 |
| 数据隔离 | 最强 | 强（物理分表） | 弱（逻辑隔离） |
| 历史数据影响 | 零 | **零**（921 条 target 零触碰） | 需默认值回填——与「零 UPDATE 历史」自相矛盾（首次报告缺陷） |
| 统计/排名隔离 | 天然 | 天然（新表不进 townshipRanking） | 依赖查询纪律 |
| 权限隔离 | 独立权限码 | 独立权限码 | 共用权限码易混 |
| 迁移复杂度 | 高（两套体系） | 中（新表+回填 operation_unit_id） | 低 |
| 回滚 | DROP 新表 | **DROP 新表（零历史影响）** | 加列可置 NULL，但已混入数据难清 |
| 长期维护 | 双入口 | 单周期入口+分体系模块 | 隐性耦合持续累积 |

### 4.3 推荐架构：方案 2

- **共用**：`hse_assessment_cycle`（月度周期两体系共用，加 `assessment_system` 可空列区分周期归属，历史 cycle 不回填、查询按体系过滤时 NULL 视为 'hse_special'——**存量解释规则，非数据改写**）。
- **分离**：新建 `production_perf_target`（org_unit_id 乡镇级 + operation_unit_id 班组级 + target_level）与 `production_perf_score`/明细；班组明细以 `transfer_station_check` 为数据源按 51 班组 CSV 映射回填 operation_unit_id（加列，文本列保留为快照）。
- **历史保护**：`hse_assessment_target`（921 条）、`hse_assessment_score`、`hse_assessment_deduction` **零加列、零 UPDATE、零迁移**——首次报告「加列+默认值」方案废除；旧排名/评分/报表读路径不变（townshipRanking 不感知新表）。
- **边界**：体系 A（生产绩效）对象=乡镇+班组（组织/作业单元）；体系 B（HSE 专项）维持现状边界；**一个乡镇是体系 A 对象不自动成为体系 B 对象**（U06 未决维持）。
- **待确认**：Q-B 班组指标模板与乡镇评分汇总口径；新表指标是否复用 metric 表（倾向独立 production_perf_metric，避免双权重语义污染）——04-02D/M0 前业务确认。

---

## 五、R1-03：D-02 任职段统一写入路径

### 5.1 三路径现状实态（本轮重核行号）

| 路径 | 关段 | 建段 | 缺陷 |
|---|---|---|---|
| assignEmployee（:419） | 既有段关闭逻辑（事务内） | INSERT :508-530，**无 operation_unit_id 列** | 作业维缺失 |
| rehireEmployee（:648） | :670 员工锁 + 关段 | INSERT :790，**无 operation_unit_id 列** | 同上 |
| V2 导入（:1025-1064） | :1027-1033 `UPDATE ... WHERE employee_id=$1 AND is_current=true AND **is_primary=true** AND is_deleted=false` | :1056-1064 INSERT **含 operation_unit_id**（全仓唯一） | **is_primary=true 限制：is_primary=false 的 current 段漏关 → 残留双 current**；且无员工 FOR UPDATE 前置锁 |

### 5.2 统一任职段写入服务（设计）

新服务 `assignmentSegmentService.writeSegment(tx, { employeeId, orgUnitId, operationUnitId, source, ... })`，唯一职责=「关旧段+建新段」，固定内部步骤：

```
1. employee FOR UPDATE（锁序第 1，调用方不得先行写 ea）
2. 读 current 段 FOR UPDATE（is_current AND NOT is_deleted，**谓词不含 is_primary**）
3. 终态闸门复核（B-1 既有）
4. 时间轴校验（新 start_date ≥ 旧 start_date；end_date = start-1）
5. 关旧段：UPDATE ... WHERE employee_id AND is_current AND NOT is_deleted
   （**谓词去掉 is_primary=true**——修复 V2 :1033 漏关缺陷）
   rowCount!==1 → EMP_OPERATION_CONFLICT
6. INSERT 新段（org_unit_id / operation_unit_id 独立传参，互不推断；
   RETURNING 判空）→ 23505 捕获转 EMP_OPERATION_DUPLICATE
7. employee_history + 审计（source: assign/rehire/import_v2/transfer）
8. 提交/回滚由调用方事务边界决定（服务强制要求在调用方事务内）
```

**两维独立**（BR-03）：org_unit_id 与 operation_unit_id 为独立参数；仅作业变化=org 抄旧；仅管理变化=op 抄旧或 NULL（调用方按场景决定，服务不默认联动）。

### 5.3 三入口调用关系图（目标态）

```
POST /org/assign        ─┐
POST /org/rehire         ├─→ 参数校验/资格闸门 → assignmentSegmentService.writeSegment
V2 导入正式导入           ┘   （V2：审核批次→变更计划→逐员工单事务调用；同一 employee 行锁串行化人工并发）
```

- **assign/rehire 适配**：controller 增 `operationUnitId`（结构化 refId）；服务内部改调 writeSegment；原 :508/:790 INSERT 抽除。
- **V2 适配**：审核通过产生变更计划（含 roster 侧归属）；正式导入批次=逐员工独立事务（单员工失败标记该行失败，批次其余员工不受影响——批次级不原子、员工级原子，防「部分变更」扩散为全批回滚争议）；同批次重复员工以 employee_code 去重（首条生效，余条记 SKIP_DUP）；导入来源/批次号入审计；**V2 不再自带关段/建段 SQL**（:1027-1064 废除），消除第二写入通道。
- **返聘作业归属来源**（任务书 5.3）：目标态默认**操作人重新选择**（结构化 refId）；历史段恢复/允许置空=**待业务确认 Q-C**；防停用班组复用=writeSegment 内 unit status 锁内校验（§3.2-A 步骤 3）；返聘前后归属差异记入 employee_history before/after（既有 before/after_dept_name 模式扩展）。

### 5.4 验收

关系图 + 三路径 jest（含 V2 关段 is_primary=false 场景回归——现缺陷的可复现用例）；D-02 验收新增「三条路径 SQL 出口唯一」静态检查（grep 无其他 `INSERT INTO employee_assignment`）。

---

## 六、R1-05：组织负责人资格校验补齐

### 6.1 现状

`hse_org_unit.manager_id` 无 FK、无 CHECK；唯一读写代码在未挂载的 hse-org-center.js（:140 读、:171 POST 写、:208 PUT 写），无资格校验。恢复路由前无活写入面。

### 6.2 九场景设计（服务层，恢复后入口）

| # | 场景 | 处理 |
|---|---|---|
| 1 | 创建组织传入负责人 | 服务层校验（见 6.3）通过后写入 manager_id |
| 2 | 更新更换负责人 | 同上（PUT 带 manager_id 时） |
| 3 | 显式 `manager_id=null` | 允许（清除负责人），跳过资格校验，但记录审计 |
| 4 | 不存在的 employee ID | 业务错误 MANAGER_NOT_FOUND（FK 兜底 23503 亦转此码） |
| 5 | 软删除员工 | MANAGER_EMPLOYEE_DELETED（校验含 is_deleted=false） |
| 6 | 非正式员工（含 NULL 关系） | MANAGER_NOT_FORMAL（`formalEmployeeEligibilitySql` EXISTS 校验：`employment_relation='正式员工'` 精确匹配，NULL 不通过） |
| 7 | 校验与写入间关系变化 | **校验与写入同一事务 + employee FOR UPDATE**：资格查询在员工行锁内执行，关系变更事务在锁上串行化——消除 TOCTOU |
| 8 | 并发修改负责人 | hse_org_unit 行 FOR UPDATE（组织写事务统一锁序：org_unit 行 → employee 行——**注意与 §3.2 全局锁序的 employee→unit 相反**；负责人写入不触 ea/作业单元，两锁序族不相交，无死锁环路；文档化两族互斥说明） |
| 9 | 历史负责人不符合新规则 | **兼容展示**（回显禁改，B-1 既有原则）；仅新写入/变更强制校验；展示层不标红不改写 |

### 6.3 分层职责

- **FK（D-01 迁移：manager_id REFERENCES employee(id)）**：只保证 ID 存在。
- **服务层**：正式员工资格（6.3 生成器复用）+ is_deleted + 事务内锁——**唯一强制点，前端仅提示**。
- **适用面**：仅 12 个 town_center 写入 manager_id 时强制（org_type 锁内校验）；center/company/department 不扩展（U03）。

---

## 七、D-01～D-09 依赖更新

| 批次 | 变化 | 新前置/依赖 | 关键更新 |
|---|---|---|---|
| D-01 | 范围微调 | — | TEST-U-119 无需处置（§二）；追加 U05 子项：生产 TEST-* 与 is_deleted 状态核验 |
| **D-02** | **范围扩大** | D-01 | 新增 assignmentSegmentService 统一服务；**纳入 V2 :1033 漏关缺陷修复**（谓词去 is_primary）；V2 改造为调用方 |
| D-03 | 不变 | D-02 | 23505 统一转 EMP_OPERATION_DUPLICATE |
| D-04 | 不变 | D-01 | — |
| D-05 | 场景补齐 | D-01 | 六.2 九场景 + 两锁序族说明（§6.2-8） |
| D-06 | 不变 | D-02 | 差异清单与 V2 审核流衔接点 = 变更计划 |
| **D-07** | **设计重构** | **D-02（writeSegment）+ D-06（差异核对）** | 全新端点（现系统无停用入口）；§3.2-B 事务 + §3.3 六场景测试 |
| **D-08** | **架构更换** | D-01 | 方案 3 废除 → **方案 2**（cycle 共用 + production_perf_target/score 新表）；hse_assessment_target 零触碰 |
| D-09 | 不变 | D-01~D-04+D-08 | 最后执行维持 |

新增依赖声明：D-07 对 D-06 的依赖为本轮新发现（花名册差异核对是停用步骤 3 的硬前置）；无其他隐藏依赖。

---

## 八、分类清单与未决问题

- **事实**：§3.1/§4.1/§5.1/§二 实测项。
- **业务规则（已确认）**：BR-01～09 引用。
- **技术设计（建议）**：§3.2/§3.3/§4.3/§5.2/§5.3/§6.2 全部。
- **待业务确认**：Q-A（is_primary 语义，维持）；Q-B（班组指标模板/乡镇评分口径）；**Q-C（新增：返聘作业归属来源——重选/历史恢复/允许置空）**；U01/U02/U03/U04/U06 维持。
- **生产待核验（U05 扩充）**：存量多段 / departments 复数表 / hse_employee_org 触发器 / 51 班组对拍 / org_type 分布 / **+ TEST-* 记录存在性与 is_deleted 状态 / V2 生产导入路径与 dev 是否同版**。
- **阻断等级**：Q-C 阻断 D-02 返聘场景实施（不阻塞其余场景）；Q-B 阻断 D-08 第二步；U05 阻断全部生产 DDL；其余不阻断设计冻结。

## 九、零变更证明

- `git status`：仅既有基线工作区改动；本轮新增文件仅本报告；`git show --stat` 提交内容 = 单报告文件。
- 无 SQL/迁移文件新增；dev 仅 READ ONLY 事务（4 轮，`current_database()` 断言，COMMIT 收尾）；零生产连接；首次报告与历史报告未改动；cost.js staged `A` + MD5 `e88ae2b0b275346dfc1431408aa00bff` 不变。

## 十、路线图

```
OVERALL-00～06      [已完成]
B-1-P0              [已完成]
B-1-P1-01～03       [已完成]
B-1-P1-04-01        [已完成]
B-1-P1-04-02A/R1    [已完成]
B-1-P1-04-02B/R1    [已完成]
B-1-P1-04-02C       [首次审查完成]
B-1-P1-04-02C-R1    [本轮：返修报告已交付，待 ChatGPT 独立验收]
M0                  [未冻结（待 R1 验收后评估）]
M1/M2               [未授权]
生产数据库变更       [未授权]
B-1-P2～P4 / C3～C6 [未开始]
Z H5                [继续冻结]
```
