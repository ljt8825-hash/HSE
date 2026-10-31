# B-1-P1-04-03-R1-R1-R2｜V1/V2 任职导入并发保护事实修正报告

> 节点类型：只读源码核验 + 报告定向修订（事实记录修正）
> 前置节点：B-1-P1-04-03-R1-R1（锁序证据与阶段门槛修正）
> 本节点不实施任何业务代码、数据库或配置变更。
> 本报告是**事实记录修正**，不代表业务代码验收，不代表 M0 正式冻结，也不代表 M1/M2 授权。

---

## 1. 任务背景及修正原因

R1-R1（B-1-P1-04-03-R1-R1）已完成三项修正，但其六路径并发保护总结存在一处遗漏：

- **V1 导入路径 `importExcelFile`** 同样**没有员工行 `SELECT ... FOR UPDATE`**，也**没有在锁定员工后重新复核 `employment_relation`**。
- R1-R1 报告中 V1 多数字段曾标为「待上下文」，未给出确定结论。若不修正，后续 M1 可能只治理 V2 和 `deleteEmployee`，**遗漏 V1 导入的并发保护缺口**。

本节点依据「助手对 R1-R1 报告及 GitHub 实际源码的独立审查结果」制定，仅修正事实描述与 M1 范围记录，不重新审计整个人员底座，不实施代码。

---

## 2. 本轮核验的仓库、分支、HEAD

| 项 | 值 |
|---|---|
| 仓库 | `ljt8825-hash/HSE` |
| 分支 | `feat/b02-dec-03.13-a02d-status-code` |
| 基底 HEAD（执行前） | `0ed00813b6af673b16aee0902696800b6bae3524` |
| 基底 HEAD 远端一致性 | 执行前 `git ls-remote` 因代理瞬断返回空响应；本地 HEAD 可信，推送后重新核验（见 §10） |
| cost.js 保护态 | `A`（staged）+ MD5 `e88ae2b0b275346dfc1431408aa00bff`（未触碰） |
| 工作区既有无关修改 | 存在大量其他会话遗留修改（docs/191副、grid-mobile-cloudflare、server/*、安全看板vben/* 等）；**均不纳入本节点 pathspec** |

> 所有行号以**当前分支真实源码**为准，未沿用历史报告。

---

## 3. 六条路径的实际代码定位

| 路径 | 文件 | 函数 | 关键行号 |
|---|---|---|---|
| 1. assignEmployee | `server/services/employeeAssignmentService.js` | `assignEmployee` | `:419` 入口；`:446` BEGIN；`:455-458` 员工 `FOR UPDATE`；`:492-496` 关段；`:505-512` 插段 |
| 2. rehireEmployee | `server/services/employeeAssignmentService.js` | `rehireEmployee` | `:648` 入口；`:665` BEGIN；`:668-672` 员工 `FOR UPDATE`；`:694-702` 现有段则拒（不关段）；`:787-797` 插段 |
| 3. terminateEmployee | `server/services/employeeAssignmentService.js` | `terminateEmployee` | `:1060` 入口；`:1089` BEGIN；`:1092-1095` 员工 `FOR UPDATE`；`:1185-1194` 关段（含 rowCount 检查） |
| 4. V2 导入 | `server/services/employeeImportV2Service.js` | `performBatchImport`（执行 approved pending 入库） | `:927` BEGIN；`:933` 逐行 SAVEPOINT；`:939-956` 员工匹配读 `employment_relation`；`:1030-1035` 关段；`:1056-1062` 插段；`:1071` 释放/`:1075` 回滚 |
| 5. V1 导入 | `server/services/employeeImportService.js` | `importExcelFile` | `:501` 入口；`:523` 逐行 BEGIN；`:538` 员工查询（**无 FOR UPDATE**）；`:549` 终态判定；`:702-717` 关段（含 rowCount 仅 warning）；`:721-727` 插段；`:744` COMMIT |
| 6. deleteEmployee | `server/services/employeeService.js` | `deleteEmployee` | `:615` 入口；`:618` BEGIN；`:620-623` 软删员工（隐式行锁，非 `FOR UPDATE`）；`:631-635` 关段（**无 rowCount 检查**） |

---

## 4. V1、V2 完整核验结论

### 4.1 V1 `importExcelFile`（R2-01 修正）

逐项核实（依据 `employeeImportService.js:501-747` 全文）：

- **是否开启事务及事务范围**：✅ 开启。`:523` `BEGIN` 位于 `for (const item of validRows)` **循环内部**，即**逐行独立事务**；`:744` `COMMIT`、`:747` `ROLLBACK`。
- **是否对 employee 执行 `SELECT ... FOR UPDATE`**：❌ **否**。`employeeImportService.js:538` 为
  ```sql
  SELECT id, name, employee_code, employment_relation FROM employee
  WHERE employee_code = $1 AND is_deleted = false
  ```
  **无任何行锁**；同一批次两条同 `employee_code` 行各自独立查询、各自关段插段，无互斥。
- **`employment_relation` 是否在锁定员工后重新读取**：❌ **否**。关系值取自 `:538` 锁前查询（`existingEmployee.employment_relation`），`:549` 据此做终态闸门（`isTerminalRelation`）。**不存在「先锁员工行、再重读关系复核」的步骤**，因此并发窗口内关系变更不会被本路径感知。
- **是否执行终态判断**：✅ `:549` `isTerminalRelation(existingEmployee.employment_relation)` 闸门；拒绝时零副作用（位于任何写操作之前）。
- **是否直接写入 `employee_assignment`**：✅ `:702-713` `UPDATE`（关闭旧段）+ `:720-727` `INSERT`（新建段）。
- **是否关闭旧任职段**：✅ 仅当 `existingEmployee` 存在时 `:701-717` 关闭 `is_current=true` 段。
- **是否检查关闭旧段的 rowCount**：✅ **有检查但不拒绝**。`employeeImportService.js:714` `if (closeResult.rowCount === 0)` 仅 `warnings.push(...)` 留痕，**不阻断、仍继续插新段**。
- **是否有行级 SAVEPOINT**：❌ 无显式 SAVEPOINT；失败靠逐行 `ROLLBACK`（`:747`）整事务回滚。
- **是否有批次级员工去重**：❌ **无去重集合**。同批次出现相同 `employee_code` 的两条记录：第 1 行关旧段+插新段（新段 `is_current=true`），第 2 行再次关「刚刚插入的段」+ 再插一段 → **产生两条 `is_current=true` 的当前任职段**（与 V2 同源缺陷）。
- **是否调用统一 `writeSegment`**：❌ 全仓 `assignmentSegmentService.writeSegment` 零引用，V1 直写。

### 4.2 V2 入库（R2-02 修正）

逐项核实（依据 `employeeImportV2Service.js:927-1080`）：

- **已在事务中使用逐行 SAVEPOINT**：✅ `:927` 单 `BEGIN`，`:933` `SAVEPOINT sp_${i}`，`:1071` `RELEASE`，`:1075` `ROLLBACK TO SAVEPOINT`；行级失败隔离，批次 `partial_completed`。
- **读取 `employment_relation` 并执行终态判断**：✅ `:939-956` 员工匹配时一并 `SELECT ... employment_relation`，`:964` `isTerminalRelation(existingRelation)` 闸门。
- **没有员工行 `FOR UPDATE`**：❌ `:939-956` 三处查询**均无 `FOR UPDATE`**；员工行未被显式锁定，并发写竞争窗口存在。
- **没有锁定后重新读取 `employment_relation`**：❌ 关系值取自 `:939-956` 锁前查询，事务内无「`FOR UPDATE` 重锁 + 重读复核」步骤（对比 `assignEmployee:455-467`）。
- **没有批次级 `employeeId` 去重**：❌ 无 `seenEmployeeIds` 之类集合；`:1030-1035` 关段谓词按 `employee_id` 关闭 `is_current=true` 段，同批次同 `employee_id` 多行会链式连续关段+建段（见 R2-01 同源缺陷）。
- **仍直接关闭旧段、插入新段**：✅ `:1030-1035` 关段 + `:1056-1062` 插段。
- **没有调用 `writeSegment`**：❌ 直写。

> **特别澄清（R2-02 核心）**：V2「读取并判断 `employment_relation`」**仅用于终态闸门**，不等于「已具备员工级并发保护」。员工级并发保护 = **`SELECT ... FOR UPDATE` 显式锁员工行 + 锁后重读复核关系**，V2 二者皆缺。不得把「读关系判断」表述为「已有并发保护」。

---

## 5. 修正后的六路径事实表

列约定：`✅`=具备/`❌`=不具备/`N/A`=不适用/`-`=未确认。

| 路径 | 事务 | 员工行 FOR UPDATE | employment_relation 复核 | 直接写任职段 | 关闭旧段 | 关段 rowCount | SAVEPOINT | 批次去重 | writeSegment 调用 |
|---|---|---|---|---|---|---|---|---|---|
| 1. assignEmployee | ✅ | ✅（`:455-458`） | ✅（锁前 `:429-439` + 锁后 `:455-467`） | ✅（`:493`/`:505`） | ✅（`:492-496`） | ❌（靠 `:470-477` 先查后关，UPDATE 自身无 rowCount 判定） | ❌ | N/A | ❌ |
| 2. rehireEmployee | ✅ | ✅（`:668-672`） | ✅（锁 + `:683` 仅退休；`:780` 关系写 rowCount） | ✅（`:787` 插段） | ❌（有段则拒 `:694-702`，不关段） | N/A | ❌ | N/A | ❌ |
| 3. terminateEmployee | ✅ | ✅（`:1092-1095`） | ✅（`:1092-1132`） | ✅（`:1185` 关段，无新段） | ✅（`:1185-1190`） | ✅（`:1191-1194` 显式判定，0 行抛错） | ❌ | N/A | ❌ |
| 4. V2 导入 | ✅（单 BEGIN + 逐行 SP） | ❌（`:939-956` 无锁） | ❌（锁前读 `:939-956`，无锁后复核） | ✅（`:1030`/`:1056`） | ✅（`:1030-1035`） | ❌（`:1030-1035` 无 rowCount 判定） | ✅（`:933`/`:1071`/`:1075`） | ❌（无去重集合） | ❌ |
| 5. V1 导入 | ✅（逐行 BEGIN/COMMIT） | ❌（`:538` 无锁） | ❌（锁前读 `:538`，无锁后复核） | ✅（`:702`/`:721`） | ✅（`:702-717`） | ✅（`:714` 仅 warning，不拒绝） | ❌（逐行整事务回滚） | ❌（无去重集合） | ❌ |
| 6. deleteEmployee | ✅ | ❌（`:620-623` UPDATE 隐式锁被改行，非 `FOR UPDATE`；无关系复核） | ❌（全程无关系读取/判断） | ✅（`:631-635` 关段） | ✅（`:631-635`） | ❌（`:631-635` 无 rowCount 判定） | ❌ | N/A | ❌ |

> 标注要点（R2-03 强制要求）：
> - **assignEmployee** 已具备事务内员工行 `FOR UPDATE` 与 `employment_relation` 复核，**不得错误描述为没有锁**（R1-R1 已正确，本次保持并明确）。
> - **rehireEmployee / terminateEmployee** 已具备员工行 `FOR UPDATE` + 关系复核；rehire 不关旧段（有段即拒），terminate 关段且有 rowCount 强校验。
> - **deleteEmployee** 的 `:620-623` 软删 `UPDATE` 会锁定被修改的员工行（隐式行级排他锁），但这**不等于先锁定并校验任职段**——它不读取、不校验 `employment_relation`，关段 `:631-635` 也无 rowCount 检查，属已知缺口（归 M1）。
> - **V1 / V2** 已补齐，二者均无员工行 `FOR UPDATE`、无锁后关系复核、无批次去重。
> - **writeSegment** 全仓零引用，仍属目标设计，未落地。

---

## 6. M1 范围修订（R2-04）

M1（人员任职写入路径统一）实施与验收范围**必须明确覆盖全部六条路径**：

1. `assignEmployee` — 已具备员工锁+关系复核，**保持**并纳入回归测试，不推倒重写；缺口仅「关段 UPDATE 无 rowCount 判定」（`:493` 靠先查后关，可补强）。
2. `rehireEmployee` — 已具备员工锁+关系复核，**保持**；不关旧段属设计（有段即拒），M1 仅需回归。
3. `terminateEmployee` — 已具备员工锁+关系复核+关段 rowCount 强校验，**保持**并回归。
4. `V2 导入` — 缺口：员工行 `FOR UPDATE` ❌、锁后关系复核 ❌、批次去重 ❌ → 纳入 M1 实施项。
5. `V1 导入` — 缺口：员工行 `FOR UPDATE` ❌、锁后关系复核 ❌、批次去重 ❌ → 纳入 M1 实施项（R2 核心修正点）。
6. `deleteEmployee` — 缺口：关段无 rowCount 检查、无 `employment_relation` 复核、隐式锁非显式 `FOR UPDATE` → 纳入 M1 实施项。

M1 目标：**统一任职段写入规则与事务边界**（收编至 `assignmentSegmentService.writeSegment` 目标设计），**不代表所有现有函数必须机械合并为同一个大函数**。已具备锁与复核的路径以「保持+回归」为主，缺口路径以「补齐锁/复核/去重/rowCount」为主。具体架构仍以已通过的技术设计（D-02 事务边界九问、统一锁序 `employee→org_unit`）为依据。

---

## 7. 与 R1-R1 原报告的差异

| 项 | R1-R1 原报告 | 本 R2 报告 |
|---|---|---|
| V1 `importExcelFile` 并发保护 | 多数字段标「待上下文」 | **全字段确定**：无 `FOR UPDATE`、无锁后关系复核、有关段 rowCount（仅 warning）、无批次去重、无 SAVEPOINT |
| V2 事实措辞 | 已正确 | 强化澄清「读关系判断 ≠ 员工级并发保护」，明确缺 `FOR UPDATE`/锁后复核/批次去重 |
| M1 范围 | 已覆盖 assign/rehire/terminate/V2/deleteEmployee | **补充 V1 导入至 M1 实施与验收范围**（R2 核心纠偏） |
| 六路径事实表 | 含 V1 待核实行 | 替换 V1 为确定结论行 |

原 R1-R1 报告及更早的 R1 / 04-03 报告**均不覆盖、不删除、不改写**；本节点为独立新增报告。

---

## 8. 未解决事项

1. **V1 / V2 批次去重 + 员工行 `FOR UPDATE` + 锁后关系复核**：已知缺口，归 M1 实施与验收（本次仅记录）。
2. **`deleteEmployee` 关段无 rowCount 检查 + 无关系复核**：归 M1。
3. **D-07 `hse_org_unit` 负责人更新锁序**：目标设计，PostgreSQL 双会话实测缺失 → 标记「尚未实测」（继承自 R1-R1）。
4. **D-07 `hse_operation_unit` 停用**：须独立立项，不得借用管理组织锁证据（继承自 R1-R1）。
5. **任务书 3.x 截断域超域项**：待补发，另出补充评估（继承自 R1-R1）。
6. **`writeSegment` 落地**：仍属目标设计，全路径零使用，待 M1 实施。

---

## 9. 本轮零代码、零 SQL、零数据库操作证明

- **业务代码零修改**：本节点仅新增报告文档 `docs/project-control/B-1-P1-04-03-R1-R1-R2/`；`server/` 下任何 `.js` 均无改动（现有工作区修改来自其他会话，未纳入 pathspec）。
- **SQL/migration 零修改**：未新增或修改任何 `.sql` 或迁移脚本；仅**读取**既有 SQL（`hse_fk_phase2_assessment_events.sql` 等）以核实约束（读取不构成修改）。
- **数据库零连接**：无任何 `pool.query`/psql/SQL 执行，未连接 dev 或生产库；源码证据通过**静态读取文件**获得。
- **配置/环境变量零修改**：未触碰 `.env`、配置或 `server/routes/cost.js`。
- **cost.js 保护态**：`A`（staged）+ MD5 `e88ae2b0b275346dfc1431408aa00bff`（两次核验未变，未取消暂存、未覆盖、未提交）。

---

## 10. Git 提交与远端核验信息

- 基底 HEAD：`0ed00813b6af673b16aee0902696800b6bae3524`；新 HEAD（推送成功后回填）：`__________`（占位，待执行）。
- 提交策略：仅 `git add docs/project-control/B-1-P1-04-03-R1-R1-R2/` 后单独提交，不与业务代码混合。
- 推送分支：`feat/b02-dec-03.13-a02d-status-code`（禁止 `--force`、rebase、merge）。
- 远端核验：`git ls-remote origin` 比对 SHA；确认无业务代码/SQL/migration/配置文件混入 diff。
- 历史保留：原 R1-R1 报告及全部历史提交均保留。

> 本节点不授权 M0/M1/M2，不启动后续业务代码实施。推送后立即停止，等待助手通过 GitHub 独立读取报告、实际代码与提交 diff 进行审查。
