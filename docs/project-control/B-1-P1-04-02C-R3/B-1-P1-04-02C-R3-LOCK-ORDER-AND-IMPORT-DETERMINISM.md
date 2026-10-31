# B-1-P1-04-02C-R3｜任职段导入确定性与跨表锁序补强

> 节点：B-1-P1-04-02C-R3
> 仓库：ljt8825-hash/HSE ｜ 分支：feat/b02-dec-03.13-a02d-status-code
> 前置：04-02C（4463f10）｜04-02C-R1（1e5f5e0）｜04-02C-R2（65b304e）
> 性质：**只读设计**。零代码改动、零 SQL/迁移、零数据库操作、零生产连接。
> 本轮只处理两个设计问题：R3-01 V2 批次重复员工确定性；R3-02 `employee_assignment.org_unit_id` 外键与组织负责人更新之间的跨表锁序。

---

## 〇、证据来源与纪律声明

| 项 | 值 |
| --- | --- |
| 分支 | `feat/b02-dec-03.13-a02d-status-code` |
| 本地 HEAD | `65b304e`（04-02C-R2 报告） |
| cost.js 状态 | staged `A`，MD5 `e88ae2b0b275346dfc1431408aa00bff`（不变） |
| 代码改动 | 0 文件 |
| 数据库操作 | 0（全部证据来自仓库源码静态读取） |

所有行号取自当前 HEAD（`65b304e`）工作区源码。本报告**不执行**任何 DDL/DML，不连接 dev/生产库。

---

## 一、R3-01：V2 批次导入中重复员工的确定性处理

### 1.1 实际导入流程（实码取证）

主入口：`server/services/employeeImportV2Service.js`

| 步骤 | 行号 | 说明 |
| --- | --- | --- |
| `performBatchImport(batchId, ...)` | 888 | 主流程函数 |
| 批次存在/已完校验 | 891-899 | `employee_import_batch` 查询；`status='completed'` 拒绝重复导入 |
| pending 查询 | 902-913 | `SELECT ... FROM employee_import_pending WHERE batch_id=$1 AND status='approved' ORDER BY row_num ASC` |
| 取连接 + BEGIN | 919-927 | 外层单事务 `client.query('BEGIN')` |
| 主循环 | 929-1080 | `for (let i=0; i<pendingResult.rows.length; i++)` |
| 行级 SAVEPOINT | 933 | `SAVEPOINT sp_${i}`（逐行隔离） |
| 员工匹配（解析 employeeId） | 938-956 | 优先级 `employee_no` → `id_card_hash` → `phone_hash + employee_name` |
| 终态防复活闸门 | 964-971 | 读 `employee.employment_relation`，终态直接抛错（早于任何写） |
| 新建员工分支 | 973-994 | `INSERT INTO employee ... RETURNING id`（979-993） |
| 既有员工更新分支 | 995-1015 | `UPDATE employee` 补缺失字段 |
| 花名册三列同步 | 1018-1026 | `UPDATE employee` roster_* |
| **关旧段** | 1030-1035 | `UPDATE employee_assignment SET is_primary=false, is_current=false, end_date=CURRENT_DATE WHERE employee_id=$1 AND is_current=true AND is_primary=true AND is_deleted=false` |
| 上级兜底匹配 | 1038-1048 | `matchSupervisor` + 回填 pending |
| **建新段** | 1056-1062 | `INSERT INTO employee_assignment (employee_id, org_unit_id, ..., is_primary=true, is_current=true, status='active', ...)` |
| 标 pending 已导入 | 1066-1069 | `UPDATE employee_import_pending SET status='imported'` |
| RELEASE / ROLLBACK SAVEPOINT | 1071 / 1075 | 行失败 → `ROLLBACK TO SAVEPOINT sp_${i}` → `failedCount++` |
| 批次状态 | 1083-1088 | `status = failedCount>0 ? 'partial_completed' : 'completed'` |
| COMMIT | 1090 | 外层提交 |

**关键事实**：主循环逐行独立 SAVEPOINT，**循环体内没有任何"批次级 employeeId 去重集合"**。每一行的 employeeId 都是在该行内独立解析（938-956）后用于关段/建段。

`matchEmployee`（497-519，供 `createImportBatchFromWorkbook` 预匹配阶段使用，逻辑与 938-956 同构）三优先级：
1. `employee_code = $1`（employee_no）
2. `id_card_hash = $1`
3. `phone_hash = $1 AND name = $2`

### 1.2 重复员工的当前实际后果（问题 1-4 的答案）

设同一批次中第 N 行与第 N+1 行解析出**相同 employeeId**：

- 第 N 行执行到 1056-1062，建出 `is_current=true, is_primary=true` 的段。
- 第 N+1 行在 938-956 再次命中同一 employeeId（无论靠 employee_no、id_card_hash 还是 phone+name），走进关旧段 1030-1035。该查询谓词 `is_current=true AND is_primary=true` **会把第 N 行刚建的段当作"旧段"关闭**（设 `end_date=CURRENT_DATE, is_current=false`）。
- 第 N+1 行再建新段（1056-1062）。

结果是**链式连续调岗**：同一员工在该批次内被按文件行顺序连续换了 N 次归属，最终只有最后一行是 `is_current=true`，中间各段的 `start_date` 同为 `hire_date`、`end_date` 同为 `CURRENT_DATE`，存在**段时间重叠/倒置**隐患；且这些中间段无任何业务含义，纯粹是重复行副作用。

| 问题 | 现状答案 |
| --- | --- |
| 1. 同批次两行都靠 employee_no 命中同一 ID | 连续调岗，无去重保护 |
| 2. 一行 employee_no、一行 id_card_hash 命中同一 ID | 同上（代码不区分匹配来源） |
| 3. 两条原始不同、解析后同 ID | 视为同一员工，连续调岗（代码按 employeeId 处理，不区分原始行） |
| 4. 同一 ID 出现 ≥3 次 | 每次都关旧建新，链式调岗放大 |
| 5. 不同员工同时调岗 | 允许继续（各行独立 SAVEPOINT，互不影响） |
| 6. 判重必须发生在第一次写 `employee_assignment` 之前 | 是——必须在 1030（关段）之前完成；当前缺失 |
| 7. 是否需批次级 employeeId 唯一集合 | 是 |
| 8. 身份映射无法确认时如何避免错误合并 | 见 1.5 |

### 1.3 推荐方案（与任务书方向一致：整批重复员工冲突，禁止连续调岗）

**设计原则**
- 判重发生在**每个 employeeId 第一次写 `employee_assignment` 之前**（早于 1030 关段、早于 964 终态闸门之后的任何写）。
- 判重基于"已解析出的 employeeId"，**不额外做身份归并**；不修改 `matchEmployee` 优先级，不依赖 pending 表唯一约束，不假设 `batch_id` 上有约束。
- **冲突范围：仅重复员工相关行失败，其他员工继续**（保留现有 `partial_completed` 语义，不整批拒绝）。

**推荐实现（行号级，待 M0 授权后落地，本轮不执行）**

在 `performBatchImport` 主循环前新增批次级集合（约 924 之后）：
```js
const seenEmployeeIds = new Set();
```

在 956（员工匹配结束）之后、964（终态闸门）之后、973（新建/更新分支）之前，对**既有员工分支**统一处理：
```js
// 既有员工：942/948/955 已得到 employeeId
if (employeeId) {
  if (seenEmployeeIds.has(employeeId)) {
    throw new Error(
      `批次内重复员工（employee_id=${employeeId}），第${p.row_num}行与前面行指向同一员工，` +
      '禁止按文件行顺序连续调岗；请合并或删除重复行后重试'
    );
  }
  seenEmployeeIds.add(employeeId);
}
```

在 993（`INSERT INTO employee ... RETURNING id` 之后）对新员工补登记：
```js
employeeId = insertEmp.rows[0].id;
seenEmployeeIds.add(employeeId);   // 新增：新员工也纳入批次去重
insertedCount++;
```

**效果矩阵（推荐方案下）**

| 场景 | 行为 |
| --- | --- |
| 同 ID 两行（任一匹配来源） | 第一行正常写入并登记；第二行在 956 后判重命中 → 抛错 → `ROLLBACK TO SAVEPOINT` → `failedCount++`，仅该行失败 |
| 同 ID ≥3 行 | 首行成功，其余全部按重复冲突失败，互不连续调岗 |
| 不同员工调岗 | 各自 employeeId 不同，互不影响，全部继续 |
| 第一行 new（建 employee）+ 第二行靠 phone+name 命中同一新建 ID | 第二行在 956 判重命中 → 冲突拦截（确定性重复，正确） |
| 两行均 new 且完全无标识（无 employee_no/id_card/phone） | 各自建不同 employee（employeeId 不同，不命中）；属数据质量/匹配逻辑问题，由 `matchEmployee` 弱匹配与人工审核兜底，**不在本批次去重范围**，但列为风险（见 1.5） |

### 1.4 与现有 SAVEPOINT 语义的契合

- 判重抛出发生在 SAVEPOINT 之内、任何写之前 → 外层 `catch` 的 `ROLLBACK TO SAVEPOINT sp_${i}`（1075）隔离该行，符合现有"逐行隔离 + partial_completed"语义。
- 批次事务仍整体 `COMMIT`（1090）；首行已写入的段随事务提交生效，重复行被标记失败，与"其他员工继续"一致。
- 不动 `pendingResult` 查询（902-913）、不动 `matchEmployee`（497-519）、不动 pending 表结构。

### 1.5 风险观察（不在本轮修改范围，移交后续节点）

- **`matchEmployee` 第三优先级 `phone_hash + name` 是弱匹配**：理论上同手机+同名的不同自然人会被误判为同一员工。本轮批次去重**基于已解析 employeeId**，不会主动归并不同 ID；但若弱匹配把两人误合成同一 ID，批次去重会顺势拦截为"重复"——这是匹配逻辑本身的问题，非批次去重引入。建议未来在 `createImportBatchFromWorkbook` 阶段对"仅 phone+name 命中"的 pending 标记为需人工确认（与任务书"不得把未确认身份映射强行归并"一致）。本轮不强制改。
- **完全无标识的重复新建**（1.3 末行）：不产生同 ID，故批次去重不拦截；其治理依赖匹配规则与人工审核，属数据入口质量，单列观察。

---

## 二、R3-02：跨表锁序与 PostgreSQL 外键锁分析

### 2.1 实际外键定义（实码取证）

| 外键 | 定义位置 | 引用 | ON DELETE | ON UPDATE |
| --- | --- | --- | --- | --- |
| `employee_assignment.org_unit_id` → `fk_employee_assignment_org_unit` | `server/sql/hse_fk_phase2_assessment_events.sql:341-344` | `hse_org_unit(id)` | **SET NULL** | 默认 NO ACTION（主键不变） |
| `employee_assignment.employee_id` → `fk_employee_assignment_employee` | 同文件 :296（既有约束，注释 :13/294 说明已存在则跳过） | `employee(id)` | （既有，级联/限制见库） | — |
| `employee_assignment.supervisor_id` → `fk_employee_assignment_supervisor` | 同文件 :311-314 | `employee(id)` | SET NULL | — |
| `employee_assignment.position_id` → `fk_employee_assignment_position` | 同文件 :326-329 | `position(id)` | SET NULL | — |
| `hse_org_unit.manager_id` | `server/sql/hse_org_center_v68_migration.sql:27`（列定义）+ :43 注释"关联 employee.id" | **无数据库外键** | — | — |
| `hse_responsibility_chain.manager_id` → FK | `server/sql/hse_fk_phase2_assessment_events.sql:141` | `employee(id)` | SET NULL | — |

**决定性事实**：
- `employee_assignment.org_unit_id` **有 FK**（SET NULL），因此任职段写入会触发对 `hse_org_unit` 被引用行的外键检查隐式锁。
- `hse_org_unit.manager_id` **无 FK**：负责人更新**不会**触发对 `employee` 表的任何外键隐式锁；`employee` 删除也不会级联清理 `manager_id`（会留孤儿值，依赖应用层/查询 `is_deleted` 过滤）。

### 2.2 PostgreSQL 外键检查的隐式锁机制（文档事实，非本环境实测）

> 声明：本任务禁止连接数据库，以下为 PostgreSQL 官方锁语义 + 代码静态分析，**不是本环境实测**。实测需后续在 dev 用双会话验证（见 2.7）。

- 子表 `INSERT`/`UPDATE` 一个引用列时，PostgreSQL 对**父表被引用行**加 **`FOR KEY SHARE`** 锁（防止父行主键被删/改导致引用悬空）。
- 父表行被 `DELETE` 或对主键 `UPDATE` 时加 `FOR KEY SHARE`；对非键列 `UPDATE` 加 `FOR NO KEY UPDATE`。
- 锁兼容性（节选 PostgreSQL 锁矩阵）：
  - `FOR UPDATE` 与 `FOR KEY SHARE` **互斥**（互相阻塞）。
  - `FOR KEY SHARE` 与 `FOR KEY SHARE` **不互斥**（多个子表引用同一父行可共存）。
  - `FOR UPDATE` 与 `FOR UPDATE` 互斥。

### 2.3 各写事务的显式锁现状（实码取证）

| 事务 | 显式锁 employee | 显式锁 org_unit | 触发隐式锁 |
| --- | --- | --- | --- |
| `assignEmployee`（employeeAssignmentService.js） | 456 `SELECT ... WHERE id=$1 FOR UPDATE` | **无**（471 读当前段无 FOR UPDATE；解析 org_unit 仅 `resolveOrgUnitId` 只读） | INSERT ea 触发 unit `FOR KEY SHARE`（经 FK） |
| `rehireEmployee` | 670 `WHERE id=$1 AND is_deleted=false FOR UPDATE` | **无**（748 仅查 `SELECT id, org_path` 存在性，无 FOR UPDATE） | INSERT ea 触发 unit `FOR KEY SHARE` |
| V2 `performBatchImport` | **无**（R2 D-02 已指出缺口） | **无** | INSERT/UPDATE ea 触发 unit `FOR KEY SHARE` |
| `PUT /org/:id`（hse-org-center.js:188-219） | **无事务、无 FOR UPDATE**（201-211 裸 `UPDATE hse_org_unit`，:208 `COALESCE($6, manager_id)`） | 无（仅 :194 `SELECT id` 存在性） | manager_id 无 FK → 无隐式锁 |

> 备注：D-07「作业单元锁定（停用前归属核对、并发时序）」在 R1/R2 中属**设计目标**，当前代码中 assign/rehire/V2 均未对 `hse_org_unit`/`hse_operation_unit` 行加显式锁，仅依赖 FK 隐式 `FOR KEY SHARE`。跨表锁序分析基于"若按 R1/R2 设计补锁"的未来状态 + 既有 FK 隐式锁。

### 2.4 竞争场景与死锁判断（基于任务书给定事务 A/B）

设：
- **事务 A（负责人更新，按 R1/R2 设计补锁后）**：`hse_org_unit` 行 `FOR UPDATE`（status 校验）→ `employee` 行 `FOR UPDATE`（资格校验）→ `UPDATE manager_id`。
- **事务 B（任职段写入，按 D-02 设计）**：`employee` 行 `FOR UPDATE` → `INSERT employee_assignment(org_unit_id)` → FK 隐式 `hse_org_unit` 行 `FOR KEY SHARE`。

**死锁环路（当前设计锁序相反）**

```
T_A: 持 unit(X) FOR UPDATE  ──等待──>  emp(Y) FOR UPDATE
T_B: 持 emp(Y)  FOR UPDATE  ──等待──>  unit(X) FOR KEY SHARE  (与 FOR UPDATE 互斥)
```

- T_A 已持 `unit(X) FOR UPDATE`，请求 `emp(Y) FOR UPDATE`。
- T_B 已持 `emp(Y) FOR UPDATE`，INSERT ea 触发请求 `unit(X) FOR KEY SHARE`；而 `FOR KEY SHARE` 与 T_A 已持的 `FOR UPDATE` 互斥 → T_B 阻塞。
- 同时 T_A 等待 T_B 释放 `emp(Y)`。
- **环路成立 → 死锁**（PostgreSQL `deadlock_timeout` 默认 1s 后检测，回滚代价较小的事务，报 `40P01`）。

**根因**：两事务锁序相反——A 为 `unit → employee`，B 为 `employee → unit`。

### 2.5 统一锁序推荐

> **所有写事务统一 `employee → org_unit`（先锁 employee，再锁 org_unit）。**

| 事务 | 原锁序（风险） | 统一后锁序 |
| --- | --- | --- |
| 任职段写入（assign/rehire/V2） | employee →（FK 隐式）unit | 维持 employee → unit（FK KEY SHARE 在写 org_unit_id 时自然发生） |
| 负责人更新（PUT /org/:id，R2 设计补锁） | unit → employee（**反转，死锁源**） | **改为** employee（资格 FOR UPDATE）→ unit（status FOR UPDATE）→ UPDATE manager_id |
| 作业单元停用（D-07） | 仅 unit（不锁 employee） | 维持仅 unit（不锁 employee 即可，见 2.6） |

统一后两事务均为 `employee → unit`：
- unit 上 `FOR KEY SHARE`（FK，任职段写）与 `FOR UPDATE`（负责人更新）冲突，但**单向等待**（谁先持 unit 谁先得，另一个等其释放），**无反向请求 → 无环路 → 无死锁**。

### 2.6 五类竞争场景复核（统一锁序 employee→unit 后）

| 场景 | 锁序 | 结论 |
| --- | --- | --- |
| 1. 员工调岗 vs 组织负责人更换 | assign: emp→unit(KEY SHARE)；PUT: emp→unit(FOR UPDATE) | 同 emp → emp 锁串行；同 unit → 单向等待。**无死锁** |
| 2. 员工归属调整 vs 组织停用（D-07） | assign: emp→unit(KEY SHARE)；停用: 仅 unit(FOR UPDATE) | assign 持 emp 等 unit；停用持 unit 不请求 emp → 单向。**无死锁** |
| 3. V2 导入 vs 负责人更换 | V2(设计补锁后): emp→unit(KEY SHARE)；PUT: emp→unit(FOR UPDATE) | 同 emp 串行；同 unit 单向。**无死锁** |
| 4. 两个不同员工同时调整到同一组织 | 各自 emp(不同)→unit(X) KEY SHARE | `FOR KEY SHARE` 之间不互斥。**无竞争** |
| 5. 同一员工同时被人工调岗和 V2 导入 | 均先锁同一 emp(Y) FOR UPDATE | 谁先持 emp 谁执行，另一个等。**串行，无死锁** |

### 2.7 死锁后的回滚与重试策略（设计）

- PostgreSQL 自动检测死锁（默认 `deadlock_timeout=1s`），回滚代价较小的事务并抛 `40P01`。
- 应用层：在四个入口（assign/rehire/V2/PUT）捕获 `40P01`，采用**指数退避重试**（如 50ms→100ms→200ms，最多 3 次）；因 PG 已 abort 一方，重试另一方通常成功。
- 重试封装在**入口层**（与 D-02"事务只在入口层创建"一致），不在 `assignmentSegmentService.writeSegment` 内部。

**静态分析与实测的边界（明确标注）**

- 本环境禁止 DB 连接，2.2-2.6 全部为 **PostgreSQL 文档锁语义 + 代码静态分析**，非本环境实测。
- 待 M0 授权后，在 **dev 库**用双会话实测验证：
  - 会话1：`BEGIN; SELECT id FROM employee WHERE id=Y FOR UPDATE; SELECT id FROM hse_org_unit WHERE id=X FOR UPDATE;`（不提交）
  - 会话2：`BEGIN; SELECT id FROM hse_org_unit WHERE id=X FOR UPDATE; SELECT id FROM employee WHERE id=Y FOR UPDATE;`（观察是否 `40P01` 死锁——验证反转锁序风险）
  - 改为统一 `employee→unit` 后重测两会话均不互锁。
  - 另测：会话1 持 `employee(Y) FOR UPDATE` 后 `INSERT employee_assignment(...,org_unit_id=X)`（触发 unit KEY SHARE），会话2 再 `UPDATE hse_org_unit SET ... WHERE id=X FOR UPDATE` → 验证单向等待、超时前可完成。

### 2.8 对 R2 负责人 PUT 三语义的影响

- R2 已定：`undefined`=保持 / `null`=清除 / 数值=资格校验后更新；锁序 `unit→employee`。
- 本轮将负责人 PUT 锁序修正为 **`employee→unit`**（与任职段写一致），资格校验（employee FOR UPDATE）前置、status 校验（unit FOR UPDATE）后置；三语义实现（动态 SET，非 COALESCE）不变。
- 因 `manager_id` 无 FK，更新 `manager_id` 不触发对 `employee` 的隐式锁，资格校验纯靠显式 `employee FOR UPDATE` + `formalEmployeeEligibilitySql`（employment_relation 精确='正式员工'）。

---

## 三、D-08 与负责人资格边界（承接 R2，本轮不重设计）

- D-08 方案 C 维持：`production_perf_cycle` 独立周期表；`hse_assessment_cycle` 零修改；两套生命周期独立；Q-B 继续待业务确认。
- 负责人 PUT 三语义维持（undefined/null/employee ID），本轮仅在 R3-02 中确认跨表锁序修正为 `employee→unit` 不影响该设计。

---

## 四、对 D-01～D-09 的影响与依赖更新

| 批次 | 原职责 | R3 新增/变更 |
| --- | --- | --- |
| D-01 基础代码兼容 | — | **新增**：统一锁序 `employee→unit` 作为共享硬约束文档化 |
| D-02 统一任职段服务 | 四路径统一 writeSegment | **新增**：①批次内 employeeId 去重（R3-01）须在统一服务/主循环内实现；②入口层锁序统一 `employee→unit`（R3-02） |
| D-03 旧模型退出 | — | 不受影响 |
| D-04 数据映射治理 | — | 不受影响 |
| D-05 人员任职关系收敛 | — | 不受影响 |
| D-06 旧模型退役 | — | 不受影响 |
| D-07 作业单元锁定/并发 | 停用前归属核对、并发时序 | **新增依赖**：统一锁序 `employee→unit`（与 D-02 共享）；当前代码未实现 org 行显式锁，落地时须补 |
| D-08 考核周期模型 | 方案 C | 维持（本轮仅确认不受影响） |
| D-09 测试与验证 | — | **新增**：①批次内重复员工用例矩阵；②双会话死锁/单向等待并发测试 |

**依赖关系更新**
- D-02 → 新增对 R3-01（批次去重）、R3-02（锁序）的硬包含。
- D-07 → 新增对 R3-02（锁序）的硬包含。
- D-09 → 新增对 R3-01/R3-02 的测试覆盖。
- 阻断分级不变：**Q-C**（返聘作业归属）继续阻断 D-02 返聘场景；**Q-B** 继续阻断 D-08 第二步；**U05**（生产 DDL 独立核验）继续阻断全部生产 DDL。

---

## 五、事实 / 业务规则 / 技术建议 / 待确认 / 生产待核验 分类

**事实（源码实证）**
- F1：V2 主循环无批次级 employeeId 去重集合（employeeImportV2Service.js:929-1080）。
- F2：`employee_assignment.org_unit_id` 有 FK（SET NULL），`hse_org_unit.manager_id` 无 FK（全仓 `manager_id ... REFERENCES` 仅命中 `hse_responsibility_chain`）。
- F3：负责人 PUT 当前无事务、无 FOR UPDATE（hse-org-center.js:188-219）。
- F4：assign/rehire/V2 均未对 org 行加显式锁，仅 FK 隐式 KEY SHARE。

**业务规则（建议固化）**
- BR-R3-01：同一批次解析到相同 employeeId 的记录全部标记为重复员工冲突，禁止连续调岗。
- BR-R3-02：所有写事务统一锁序 `employee → org_unit`。

**技术建议**
- T1：V2 主循环新增 `seenEmployeeIds` 集合，判重早于首次写 `employee_assignment`（行号级方案见 1.3）。
- T2：负责人 PUT 改为事务 + 动态 SET + `employee→unit` 锁序（承接 R2）。
- T3：四入口统一 `40P01` 指数退避重试。

**待确认（业务）**
- Q-C：返聘作业归属来源（延续，阻断 D-02 返聘场景）。
- Q-B：班组考核指标模板与乡镇汇总口径（延续，阻断 D-08 第二步）。

**生产待核验（U05，延续）**
- U05：生产库 `fk_employee_assignment_org_unit` 是否已执行（dev 由 `hse_fk_phase2_assessment_events.sql` 定义，生产须独立核验）；生产 `hse_org_unit.manager_id` 确无 FK。
- U05-R3：生产库是否存在 `employee_assignment` 中 `org_unit_id` 指向已 `is_deleted=true` 的 org（FK 为 SET NULL，删除 org 会置空，须核对历史 orphan）。

---

## 六、总体路线图

```
OVERALL-00～06 [完成]
B-1-P0 [完成]
B-1-P1-01～03 [完成]
B-1-P1-04-01 [完成]
B-1-P1-04-02A/R1 [完成]
B-1-P1-04-02B/R1 [完成]
B-1-P1-04-02C [设计完成]
B-1-P1-04-02C-R1 [设计完成]
B-1-P1-04-02C-R2 [设计完成]
B-1-P1-04-02C-R3 [本节点：导入确定性 + 跨表锁序，设计完成]
M0 [未冻结：前置 04-02 链整体验收 + U05 生产核验 + Q-A/Q-B/Q-C 业务确认]
M1/M2 [未授权]
生产数据库变更 [未授权]
```

---

## 七、零变更证明

- 本节点**未修改**任何业务代码、前端、配置、测试。
- 本节点**未新增/修改/执行**任何 SQL/migration，未执行 DDL/DML。
- 本节点**未连接**生产或 dev 数据库（含 `pg_stat`、查询）；全部证据来自仓库源码静态读取。
- cost.js 仍为 staged `A`，MD5 `e88ae2b0b275346dfc1431408aa00bff`（不变）。
- 唯一 Git 写操作：新增本报告文件，pathspec 独立提交推送（见交付纪律）。
- 所有"推荐实现 / 行号级方案"均为**设计描述**，待 M0 授权后由对应批次（D-02/D-07/D-09）落地，本轮不执行。
