# B-1-P1-04-02C-R3-R1｜批次去重回滚语义与 D-07 锁边界补强

> 阶段：B-1-P1 人员与组织架构收敛
> 节点：B-1-P1-04-02C-R3-R1（只读设计返修）
> 承接：04-02C(4463f10) → R1(1e5f5e0) → R2(65b304e) → R3(3b092ba) → **R3-R1（本报告）**
> 分支：feat/b02-dec-03.13-a02d-status-code
> 性质：**只读设计报告，零代码改动、零 SQL、零数据库操作**
> 纪律：报告独立 pathspec 提交推送后停止，等待 ChatGPT 独立验收；不进入 M0/M1/M2。

---

## 〇、变更摘要（承接 R3，本次两处定向修正）

| 项 | R3 原结论 | R3-R1 修正 |
|---|---|---|
| R3-R1-01 批次去重 | 仅指出"主循环无去重集合 + 关段谓词链式连续调岗" | 给出 **Set/SAVEPOINT 一致性方案（行级 reserve/release，add-on-success）**，含状态机、SAVEPOINT 成功/失败矩阵、首行失败/后续重复/三行重复场景，消除"全部失败"与"首条成功后续失败"表述冲突 |
| R3-R1-02 作业单元锁边界 | R3:205 把"作业单元停用 D-07"与 org_unit 锁混为一谈（"仅 unit"） | 明确区分 `hse_org_unit`（管理组织，有 FK）与 `hse_operation_unit`（生产作业单元，**无 FK、无显式锁**）；operation_unit 不在锁图内，**不会形成新死锁环路** |

保持不变：D-08 方案 C；负责人 PUT 三语义；`employee→org_unit` 统一锁序；Q-C/Q-B/U05 阻断状态。

---

## 一、R3-R1-01：批次去重状态与 SAVEPOINT 回滚一致性

### 1.1 当前代码实码（server/services/employeeImportV2Service.js）

| 行号 | 代码事实 |
|---|---|
| `:888-900` | `performBatchImport(batchId,...)`：批次存在性 + `status='completed'` 拒绝 |
| `:902-913` | `pendingResult`：`approved` 且 `is_deleted=false`，`ORDER BY row_num ASC`（稳定顺序） |
| `:919-924` | `client = pool.connect()`；计数变量 `insertedCount/updatedCount/assignmentCount/failedCount/errors`（**无 `seenEmployeeIds` 集合**） |
| `:927` | `BEGIN` 外层事务 |
| `:929-930` | `for` 循环逐行 `p = pendingResult.rows[i]` |
| `:933` | 每行 `SAVEPOINT sp_i`（与 :1071 RELEASE / :1075 ROLLBACK TO 配对） |
| `:935-956` | 员工解析（行内，非 `matchEmployee` 函数）：`employee_no`(:939) → `id_card_hash`(:944) → `phone_hash+name`(:950)；`let employeeId = null` 每行重置 |
| `:964-971` | 终态防复活闸门（`isTerminalRelation`）：在任何写之前抛错，零副作用 |
| `:973-994` | 无 employeeId → `INSERT employee`(:979) → `employeeId = insertEmp.rows[0].id`（新 id） |
| `:995-1015` | 有 employeeId → `UPDATE employee` 补缺失字段 |
| `:1017-1026` | 花名册三列同步 |
| `:1030-1035` | **关旧当前主岗**：`UPDATE employee_assignment SET is_primary=false,is_current=false,end_date=CURRENT_DATE WHERE employee_id=$1 AND is_current=true AND is_primary=true AND is_deleted=false` |
| `:1056-1062` | **建新段**：`INSERT employee_assignment (...,operation_unit_id,...)`（`operation_unit_id = p.target_unit_id`） |
| `:1066-1069` | 标记 pending `status='imported'` |
| `:1071` | `RELEASE SAVEPOINT sp_i` |
| `:1072-1079` | catch：`ROLLBACK TO SAVEPOINT`（:1075）；`failedCount++`；`errors.push` |
| `:1083-1090` | 批次 `status = failedCount>0 ? 'partial_completed' : 'completed'`；`COMMIT` |

### 1.2 现状缺陷（R3 已指出，本次精确定位）

1. **无内存去重集合**：`:919-924` 只声明计数变量，无 `seenEmployeeIds`。每行独立解析 + 独立关段建段。
2. **关段谓词自伤**：`:1030-1035` 的 `WHERE employee_id=$1 AND is_current=true AND is_primary=true`。当同一 employee 在本批次出现两次（行 i 与 行 j，j>i），行 i 在 `:1056-1062` 刚 INSERT 一个 `is_current=true AND is_primary=true` 的新段；轮到行 j 时，`:1030-1035` 会把**行 i 刚建的新段**当成"旧段"关掉（`is_current=false`），再 `:1056` 建行 j 的新段。结果：同一员工链式连续调岗，最终仅有行 j 的段为 current，行 i 的段被静默关闭。
3. **SAVEPOINT 与 JS Set 不同步**（本次核心问题）：即便补一个 `Set`，PostgreSQL 的 `ROLLBACK TO SAVEPOINT` **只回滚数据库状态，不回滚 Node 进程内存的 `Set`**。若 `Set.add` 发生在写操作之前，则某行写失败回滚后，`Set` 仍残留该 id → 后续同 id 行被错误永久阻塞（违反任务书第 2、3、4 项）。

### 1.3 去重状态机（推荐方案：行级 reserve/release，add-on-success）

**核心规则**：`Set` 只在"本行写操作已 `RELEASE SAVEPOINT`（即已提交进外层事务）之后"才 `add`；`catch` 中**不做任何 `delete`**。这样 `Set` 永远只映射"已成功写入的 employeeId"，天然与 SAVEPOINT 回滚一致——失败行的 id 从未进入 `Set`，无需回滚 `Set`。

```
// :919-920 区域（BEGIN 之前）新增：
const seenEmployeeIds = new Set();

// 每行循环内（:956 解析得到 employeeId 之后，:1028 首次 employee_assignment 写之前）：
const dedupKey = String(employeeId);            // 解析后统一用 resolved employeeId（见 1.4）
if (seenEmployeeIds.has(dedupKey)) {
  throw new Error(`同批次员工重复（employeeId=${dedupKey} 已在本批次前序行处理），禁止连续调岗`);
}

// :1071 RELEASE SAVEPOINT 之后、try 块末尾（COMMIT 之前）：
await client.query(`RELEASE SAVEPOINT ${spName}`);
seenEmployeeIds.add(dedupKey);                  // 仅成功提交后登记

// :1072-1079 catch（保持不变，无需 delete）：
} catch (rowErr) {
  await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);   // Set 未 add，无副作用
  failedCount++; errors.push(...);
}
```

- **DUP 判定早于首次 `employee_assignment` 写**（任务书第 8 项）：检查点置于 `:1028` 注释之前，早于 `:1030` 关段与 `:1056` 建段。
- **终态闸门（:964）在前、DUP 检查在后**：两者都是"本行零写即抛错"，互不冲突。
- **不同员工独立继续**（任务书第 7 项）：`dedupKey` 按 employeeId 区分，Y≠X 互不影响。

### 1.4 去重键的选择（任务书第 9 项：禁止按姓名判重 / 禁止强行合并未确认身份）

- **统一键 = 解析后的 `employeeId`**（`:942/:948/:955` 命中 → 用该 id；`:993` 新 INSERT → 用新 id）。
- 新员工的自洽性：行 i 无 id → INSERT 得 A，add(A)。行 j 若 `employee_no`/`id_card_hash` 相同，解析到 `:939/:944` 时 A 已存在（行 i 已 `RELEASE SAVEPOINT` 提交于本事务内），走 existing 分支得 A → 命中 `has(A)` → DUP。故新、旧员工统一用 resolved employeeId 即可，无需按源键双轨。
- **`phone_hash+name` 弱匹配（:950-955）不纳入去重键**：该路径属 `matchEmployee` 既有行为，可能把两名不同真人误并为一 id；按任务书第 9 项，本次**不新增按姓名/弱匹配的合并或判重**，仅记录为已知局限（见 §四 待确认）。DUP 判定建立在 resolved employeeId 之上，若弱匹配已把两人并为一 id，则后续同 id 行被 DUP 拒绝——此乃"同一真实员工"的正确行为；若弱匹配误并，则属数据质量风险，非本节点处置范围。

### 1.5 SAVEPOINT 成功/失败状态矩阵（消除表述冲突）

设批次内某 employeeId=X 出现 N(≥2) 次，行序 i1<i2<…<iN。下表以首行失败/成功、后续重复、三行重复覆盖任务书第 1–6 项：

| 场景 | 行 | `seenEmployeeIds`（执行前） | 数据库动作 | 结果 | `seenEmployeeIds`（执行后） |
|---|---|---|---|---|---|
| 1. 首行成功 | X@i1 | `{}` | INSERT emp+seg，RELEASE | 成功，`assignmentCount++` | `{X}` |
| 2. 首行成功→后续重复 | X@i2 | `{X}` | `has(X)`→DUP 抛错（写前），ROLLBACK 无副作用 | 失败（DUPLICATE） | `{X}`（不被删除） |
| 3. 首行失败（段插入 FK 违例） | X@i1 | `{}` | INSERT emp 成功→seg 插入失败→ROLLBACK；add 未达 | 失败（写错误） | `{}`（X 未占用） |
| 4. 首行失败后后续重试 | X@i2（接场景3） | `{}` | 重新解析/写入，可成功 | 允许重试（不被永久阻塞） | `{X}`（若成功） |
| 5. 三行同员工 | X@i1/i2/i3 | i1 `{X}`；i2/i3 `{X}` | i1 成功；i2/i3 均 `has(X)`→DUP | **1 成功 + 2 DUP 失败**（非"全失败"、非"静默"） | `{X}` |
| 6. 不同员工并行 | X@i1, Y@i2 | `{X}` | Y≠X，`has(Y)`=false | Y 独立继续 | `{X,Y}` |

**BR-R3-01 业务规则与实现效果矩阵（统一表述，替代旧歧义）**：

> 同一批次内某 employeeId 出现 ≥2 次时：
> - 仅**第一条成功处理的行**写入任职段；
> - 其余同 id 行在首次 `employee_assignment` 写之前被 `DUPLICATE_EMPLOYEE_IN_BATCH` 拒绝，**不写段、不链式连续调岗**；
> - 若第一条本身失败（写错误），其 id **不进入 `Set`**，后续同 id 行**允许重试**（不被永久阻塞）；
> - 不同 employeeId 之间互不影响，独立继续。

此矩阵**同时否定**旧报告中"全部记录失败"与"首条成功、后续失败（但语义含糊）"两种不精确表述。

### 1.6 方案比较：预解析（两遍）vs 行级 reserve/release

| 维度 | 预解析（两遍） | 行级 reserve/release（推荐） |
|---|---|---|
| 结构改动 | 重写 `performBatchImport`：BEGIN 前加只读解析遍，构建 `Map<key,firstRow>` | 仅 4 处定点：声明 `Set`（~:920）、算 `dedupKey`（~:957）、检查（~:1028）、`add`（~:1071） |
| Set/SAVEPOINT 分歧 | 由构造消除（判定在事务外，纯内存只读） | 由"add-on-success、catch 不 delete"规则消除 |
| 重复行冗余查询 | 可短路（dup 行不进写循环，省解析查询） | dup 行仍执行解析查询后才抛错（轻微开销） |
| 新员工去重 | 写前遍无法解析新 id，须改用源键（employee_no/id_card_hash）去重，再处理"新建后变 existing"连续性 | 统一用 resolved employeeId（见 1.4），天然自洽 |
| 与现有逐行 SAVEPOINT/partial_completed 语义 | 需重新对接 | 完全保留（catch 块不动） |
| 风险 | 结构与 matchEmployee 重复、新员工的双模去重易错 | 依赖 add 放置位置正确（已钉在 RELEASE 后） |

**结论**：推荐**行级 reserve/release**。在现有"逐行 SAVEPOINT + partial_completed"架构下改动最小、风险最低；"add 仅成功提交后、catch 不 delete"规则完整解决任务书第 1–3 项（Set 不随 SAVEPOINT 回滚、失败 id 不残留、新 INSERT 回滚不留无效 id）。预解析作为未来重构备选（若追求"构造即无分歧"）单列记录，本次不采用。

---

## 二、R3-R1-02：D-07 作业单元并发锁边界

### 2.1 四种对象精确区分（任务书强制要求）

| 对象 | 定义来源 | 有无外键 | 备注 |
|---|---|---|---|
| `hse_org_unit`（管理组织） | v68:59 表；`employee_assignment.org_unit_id`（`sprint5_6:20` `NOT NULL`） | **有**：`fk_employee_assignment_org_unit REFERENCES hse_org_unit(id) ON DELETE SET NULL`（`hse_fk_phase2_assessment_events.sql:343`） | D-07 锁分析的真实对象 |
| `hse_operation_unit`（生产作业单元） | v68:59-73 | **无**：`org_unit_id`（`v68:61` `NOT NULL BIGINT`）**无 REFERENCES**；全仓 `ALTER ADD FK ... operation_unit_id` 仅在 `.dump` 历史备份命中，无活动迁移 | 不在锁图内 |
| `employee_assignment.org_unit_id` | `sprint5_6:20` | 有（见上） | 写段时触发 org_unit 隐式 `FOR KEY SHARE` |
| `employee_assignment.operation_unit_id` | `sprint5_6:21` `BIGINT`（**无 `NOT NULL`**） | **无**：全仓 `REFERENCES ... operation_unit_id` 零命中（除 `.dump` 备份） | 写段时**无 FK 隐式锁** |

### 2.2 `hse_operation_unit` 约束实码（v68:59-73）

- 列：`id, org_unit_id(NOT NULL BIGINT), unit_name, unit_type, unit_code, headcount, location, status(VARCHAR DEFAULT 'active'), description, supervisor_id, ...`
- 约束：**仅 `uk_hse_op_unit_code` 唯一索引（:87）**；`status` 无 CHECK/枚举约束；`org_unit_id` 无 FK；**无**任何指向 `employee_assignment` 的反向引用约束。
- 即：作业单元"停用"与否在数据库层无强制保证，也没有任何机制阻止其被引用。

### 2.3 任职段写入是否显式锁定目标作业单元

- V2 建段 `:1056-1062`：`INSERT employee_assignment (...,operation_unit_id,...)`，无 `SELECT ... FOR UPDATE` 命中 `hse_operation_unit`。
- `employeeAssignmentService.js`（assign/rehire/terminate）：全仓 grep `operation_unit_id ... FOR UPDATE|select` 零命中；即任职段写入**既不显式锁 `hse_operation_unit`，也无 FK 隐式锁**（因无 FK）。
- 结论：当前/设计态下，`employee_assignment.operation_unit_id` 写入对 `hse_operation_unit` **零锁**。

### 2.4 作业单元停用是否检查有效任职引用

- 运行时对 `hse_operation_unit` 的写：**仅 `hse-org-center.js:442`（PUT 更新，含 `status` 字段）/`:471`（DELETE 软删）**。
- 但 R1/R3 已定论：该 CRUD 路由**已停挂（app.js 未挂载）**，非活动代码。
- 即便挂载，`:442`/`471` 只做 `UPDATE/DELETE`，**不查询 `employee_assignment` 任职引用、不加 `FOR UPDATE` 锁 employee**，即"停用"与"任职引用"之间无一致性校验。
- 结论：当前**无作业单元停用路径**（已停挂），"停用与调岗并发穿透"在活动代码中**不成立（moot）**；若未来挂载停用路径，因无 FK、无显式锁，也不会经由 FK 隐式锁产生与 R3 中 org_unit 同构的死锁。

### 2.5 D-07 锁序与 `employee→org_unit` 统一锁序是否形成新死锁环路

- R3-R2（即 R3 的 R3-02）死锁根因：事务 A（负责人更新 R1/R2 设计）= `unit→employee` FOR UPDATE；事务 B（任职段写 D-02）= `employee→unit`（FK 隐式 `org_unit FOR KEY SHARE`）；锁序相反 → 环路。统一为 `employee→org_unit` 消除。
- 该环路**完全发生在 `employee` 与 `hse_org_unit` 之间**（因 `org_unit_id` 有 FK）。
- `hse_operation_unit`：既无 FK 指向 employee，也无 FK 被 `employee_assignment.operation_unit_id` 引用 → **锁图中无 `operation_unit` 节点**。`employee→org_unit` 统一锁序**不涉及 operation_unit**。
- 因此：把 D-07 的锁边界从 org_unit 推广到 operation_unit **不成立**——operation_unit 不参与该死锁环路，**不会形成新死锁**。R3:205"作业单元停用（D-07）｜仅 unit（不锁 employee）"中的"unit"应精确读作 `hse_org_unit`；对 `hse_operation_unit` 须单列结论（见 2.6）。

### 2.6 operation_unit 锁边界定论（与 R3 差异）

| 维度 | `hse_org_unit`（管理组织，D-07 真实对象） | `hse_operation_unit`（生产作业单元） |
|---|---|---|
| 写段时 FK 隐式锁 | 有：`org_unit FOR KEY SHARE`（`org_unit_id` 有 FK） | **无**（`operation_unit_id` 无 FK） |
| 写段时显式锁 | R1/R2 设计补 `unit FOR UPDATE`（在 employee 锁之后） | **无**（当前代码与设计均未锁） |
| 停用/更新路径 | D-07 设计：停用前在 unit 行锁内核对有效任职引用 | 仅 `hse-org-center.js:442/471`（已停挂），无任职引用核对 |
| 死锁参与 | 参与 `employee↔org_unit` 环路，由 `employee→org_unit` 锁序解决 | **不参与**（无 FK、无显式锁），死锁中性 |
| 统一锁序影响 | `employee→org_unit` 直接约束 | 不受影响；若未来新增停用路径须独立定锁序 |

> **差异声明**：R3 报告 §2.6/§3（如 `:205`）将"作业单元停用 D-07"与 `hse_org_unit` 锁混写。本报告纠正：`hse_operation_unit` 因无 FK、无显式锁、无活动停用路径，独立于 D-07 的 `employee↔org_unit` 死锁分析；R3 的"仅 unit（不锁 employee）"结论**只适用于 `hse_org_unit`**，不得套用于 `hse_operation_unit`。

---

## 三、与 R3 原报告的差异清单

1. **R3-R1-01（新增）**：R3 仅指出"无去重集合 + 链式连续调岗"；本报告补完 Set/SAVEPOINT 一致性方案（状态机 + 成功失败矩阵 + 首行失败/后续重复/三行重复场景 + 预解析 vs 行级方案比较），消除 R3 未决的"全部失败/首条成功后续失败"表述冲突。
2. **R3-R1-02（纠正）**：R3:205 把"作业单元停用 D-07"与 org_unit 锁混为一谈；本报告基于 DDL 实码（`operation_unit_id` 无 FK、`hse_operation_unit.org_unit_id` 无 FK）区分 `hse_org_unit` 与 `hse_operation_unit`，结论为 operation_unit 不在锁图内、不形成新死锁环路。
3. **新增证据点**：`employee_assignment.operation_unit_id` 无活动 FK（R3 未单独确认）；`hse_operation_unit.org_unit_id` 无 FK；`hse-org-center.js:442/471` 属已停挂 CRUD（R3 未点名）。
4. **D-01~D-09 依赖**：D-02 维持含 R3-R1-01 去重；D-07 维持含 `employee→org_unit` 锁序（且明确其边界仅限 `hse_org_unit`）；D-09 维持含批次重复 + 死锁并发测试。其他不变。

---

## 四、分类清单

### 事实（源码实证）
- F1 `employeeImportV2Service.js:888-1080` 主循环无内存去重集合；关段谓词 `:1030-1035` 含 `is_current=true AND is_primary=true`，会关闭前序行刚建段。
- F2 `sprint5_6:21` `employee_assignment.operation_unit_id BIGINT` 无 `REFERENCES`；`hse_fk_phase2_assessment_events.sql:343` 仅 `org_unit_id` 有 FK。
- F3 `v68:61` `hse_operation_unit.org_unit_id NOT NULL BIGINT` 无 FK；`v68:59-73` 仅 `uk_hse_op_unit_code` 唯一索引，`status` 无约束。
- F4 `hse-org-center.js:442/471` 对 `hse_operation_unit` 的更新/软删属已停挂 CRUD（app.js 未挂载）。
- F5 任职段写入（V2 `:1056`、assign/rehire）对 `hse_operation_unit` 无 `FOR UPDATE`、无 FK 隐式锁。

### 业务规则
- BR-R3-01（见 §1.5）：同批次同 employeeId 仅首条成功行写段，余者 DUP 拒绝；首条失败不占 id、后续可重试；不同员工独立。
- BR 维持：D-08 方案 C；负责人 PUT 三语义（undefined 保持 / null 清除 / id 校验后更新）；`employee→org_unit` 统一锁序。

### 技术建议
- T1 采用行级 reserve/release（add-on-success、catch 不 delete），定点改造 `performBatchImport` 4 处。
- T2 `hse_operation_unit` 锁边界独立于 D-07；若未来挂载停用路径，须独立定锁序（建议 `employee→operation_unit` 同族），但当前无活动路径、无 FK，不构成死锁。

### 待确认事项
- Q-A `is_primary` 业务语义（R1 遗留，与 D-02 解耦）。
- Q-B 班组考核指标模板与乡镇汇总口径（D-08 第二步阻断）。
- Q-C 返聘作业归属来源（D-02 返聘场景阻断）。
- **W1（本次新增观察，不移交修改）**：`phone_hash+name` 弱匹配（:950-955）可能误并不同真人为同一 employeeId；本次不新增按姓名判重/合并，仅记录。

### 未实施声明（明确）
- **本报告为只读设计，未改动 `employeeImportV2Service.js`、`employeeAssignmentService.js`、`hse-org-center.js` 或任何 SQL/migration。**
- `seenEmployeeIds` 集合、`employee→org_unit` 显式 `FOR UPDATE`、D-07 org_unit 停用锁、operation_unit 停用路径 —— **均未在代码中实现**，仅作为 R3/R3-R1 设计结论，落地须待 M0 冻结且 U05 生产授权后。
- PostgreSQL 外键隐式锁（`FOR KEY SHARE` 等）为**文档语义 + 静态分析**，非本环境实测；死锁结论待 M0 后 dev 双会话验证（R3 已附验证脚本）。

---

## 五、生产授权边界
- U05（生产数据库变更授权）继续阻断全部生产 DDL/DML；本节点零数据库操作。
- Q-C / Q-B 继续阻断 D-02 返聘场景、D-08 第二步。
- 不进入 M0/M1/M2。

---

## 六、更新后的总体路线图

```
OVERALL-00～06        [完成]
B-1-P0                [完成]
B-1-P1-01～03         [完成]
B-1-P1-04-01          [完成]
B-1-P1-04-02A/R1      [完成]
B-1-P1-04-02B/R1      [完成]
B-1-P1-04-02C         [设计完成]
B-1-P1-04-02C-R1      [设计完成]
B-1-P1-04-02C-R2      [设计完成]
B-1-P1-04-02C-R3      [设计完成]
B-1-P1-04-02C-R3-R1   [本节点：去重回滚语义 + operation_unit 锁边界，待验收]
M0                    [未冻结]
M1/M2                 [未授权]
生产数据库变更         [未授权]
```

> 交付后停止，等待 ChatGPT 独立读取本报告与源码证据验收；不自行进入 M0。
