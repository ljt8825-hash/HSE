# M1-02｜V1/V2 人员导入任职写入统一改造 — 实施报告

- **节点**：B-1-P1 人员底座治理 · M1 任职写入路径统一 · 第二阶段（第二批：V1/V2 两条导入路径接入 M1-01 统一服务）
- **任务书**：`@long-text:"# M1-02｜V1/V2人员导入任职写入统一改造任务书"`
- **分支**：`feat/b02-dec-03.13-a02d-status-code`
- **执行前 HEAD**：`2c034686def6e30c955bc783a34f1d1cb02b844e`（M1-01 最终态，含报告多次修订）
- **业务提交 SHA**：见 §12（提交后回填）
- **报告提交 SHA**：见 §12（提交后回填）
- **测试结论**：员工域 12 套件 / 308 用例全绿；新增 17 用例全绿；全量基线无新增失败。

---

## 1. 执行前核验（§三）

| 核验项 | 结果 |
|---|---|
| 当前 HEAD | `2c03468`（M1-01 最终态）✅ |
| 当前分支 | `feat/b02-dec-03.13-a02d-status-code` ✅ |
| M1-01 业务提交 `cbeb0284` 仍在历史 | `git cat-file -t cbeb0284` → `commit` ✅ |
| `assignmentSegmentService.js` 已存在（M1-01 新建） | 已读取，189 行 ✅ |
| `employee_assignment` schema 默认值 | `created_at`/`updated_at` 均有 `DEFAULT CURRENT_TIMESTAMP NOT NULL` → `writeSegment` 省略合法 ✅ |
| `cost.js` 保护态 | `git status` 显示 `A  server/routes/cost.js`；MD5 = `e88ae2b0b275346dfc1431408aa00bff`（与基线一致，全程未改未提交）✅ |

> 核验命令：`git rev-parse HEAD`、`git rev-parse --abbrev-ref HEAD`、`git cat-file -t cbeb0284`、`git status --porcelain server/routes/cost.js`、`md5sum server/routes/cost.js`。

---

## 2. 修改文件清单与说明

| 文件 | 类型 | 说明 |
|---|---|---|
| `server/services/assignmentSegmentService.js` | 改造（M1-01 既有） | `writeSegment` 增加 V2 可选列扩展（`operation_unit_id`/`dept_name`），并采用「双形态 INSERT」：**无扩展列时保持与 M1-01 提交完全一致的字面量形态**，仅当 V2 显式传入扩展列时才切换为全参数化形态。 |
| `server/services/employeeImportService.js` | 改造（V1） | `importExcelFile` 接入 `writeSegment`：员工行 `FOR UPDATE` 锁定 + 锁后复核 `employment_relation`、批次去重（`employee.id` 键）、任职段关闭/新建统一收口。 |
| `server/services/employeeImportV2Service.js` | 改造（V2） | `performBatchImport` 接入 `writeSegment`：三条匹配查询加 `FOR UPDATE`、员工行锁定、批次去重、SAVEPOINT 成功后才登记去重。 |
| `server/__tests__/employee-import-v1-terminal-guard.unit.test.js` | 测试修正 | 修正 mock：`INSERT INTO employee_assignment` 返回行（否则 `writeSegment` 守卫抛错）；`FROM employee_assignment` 返回代表性当前段（B 场景）；关段 SQL 断言由 `end_date = CASE` 改为 `writeSegment(ASSIGN)` 形态。 |
| `server/__tests__/employee-import-v2-terminal-guard.unit.test.js` | 测试修正 | 修正 mock（INSERT 返回行、FROM 返回当前段）；V2 扩展列 INSERT 列序断言改为 12 列（含 `operation_unit_id`/`dept_name`）。 |
| `server/__tests__/m1-02-import-segment-unification.unit.test.js` | 测试新增 | §七 覆盖矩阵：V1 A/B/C、关段失败、插入失败、批次去重（成功/重试/互不影响/单失败不影响其他）；V2 SAVEPOINT 登记时机、批次去重、关段异常回滚、插入异常回滚、外层事务与批次状态。 |

> 全部修改均使用精确 pathspec 提交，**未触碰** `cost.js`、未触碰任何其它模块、未触碰前端/路由契约/迁移/生产库（见 §15 禁止事项）。

---

## 3. V1 前后差异（`employeeImportService.js`）

**关键证据位置**
- `:12` 引入 `const { writeSegment } = require('./assignmentSegmentService');`
- `:523` `const seenEmployeeIds = new Set();`（批次去重，稳定 id 键）
- `:543` 既有员工查询加 `FOR UPDATE`
- `:551` 批次去重检查：`if (existingEmployee && seenEmployeeIds.has(existingEmployee.id))` → 空事务 `ROLLBACK` + 记重复冲突 + `continue`
- `:649` 新员工行 `SELECT … FROM employee WHERE id = $1 FOR UPDATE`
- `:727` 原内联「关旧段 + 建新段」整段替换为 `await writeSegment(client, {...})`
- `:771` `if (employeeId) seenEmployeeIds.add(employeeId);`（COMMIT 成功后才登记）

**差异要点**
- 去除原 V1 内联 `UPDATE employee_assignment … end_date = CASE …` 与 10 列 `INSERT employee_assignment`，统一改调 `writeSegment`（`scenario:'ASSIGN'`、`currentSegments` 由本函数读取后传入、关闭失败/多段冲突/新建失败原样上抛）。
- 现行段保护语义收敛：仅已有员工（`existingEmployee` 为真）才传入 `curSegRes.rows` 做 A/B/C；新员工直接建段（A 场景）。
- 保留：逐行事务边界（每行 `BEGIN/COMMIT/ROLLBACK`）、身份匹配、字段映射、`importExcelFile` 结果结构（`success/failed/total/errors/warnings`）、错误反馈、新员工历史写入。

**V1 调用代码片段**
```js
const curSegRes = await client.query(
  `SELECT id, employee_id, org_unit_id, position_id, status
     FROM employee_assignment
    WHERE employee_id = $1 AND is_current = true AND is_deleted = false`, [employeeId]);
const currentSegments = existingEmployee ? curSegRes.rows : [];
const endDate = startDate
  ? new Date(new Date(startDate).getTime() - 86400000).toISOString().split('T')[0]
  : new Date().toISOString().split('T')[0];
await writeSegment(client, {
  employeeId, scenario: 'ASSIGN', currentSegments,
  newSegment: { employee_id: employeeId, org_unit_id: orgUnitId, position_id: positionId,
    supervisor_id: null, status: 'active', start_date: startDate,
    remark: 'Excel导入入职', created_by: userId || null }, endDate,
});
```

---

## 4. V2 前后差异（`employeeImportV2Service.js`）

**关键证据位置**
- `:32` 引入 `const { writeSegment } = require('./assignmentSegmentService');`
- `:932` `const seenEmployeeIds = new Set();`
- `:946` / `:952` / `:958` 三条匹配查询（`employee_code` / `id_card_hash` / `phone_hash+name`）均加 `FOR UPDATE`
- `:1035` 新员工/既有员工统一补锁 `SELECT … FROM employee WHERE id = $1 FOR UPDATE`
- `:1038` 批次去重检查（RELEASE 前）：`if (employeeId && seenEmployeeIds.has(employeeId)) throw …`
- `:1044` 读当前主岗段 `curSegRes`（`is_current=true AND is_primary=true`）
- `:1073` 原内联「关主岗 + 建段」替换为 `await writeSegment(client, {...})`，`currentSegments: curSegRes.rows`
- `:1103` `RELEASE SAVEPOINT ${spName}`
- `:1105` `if (employeeId) seenEmployeeIds.add(employeeId);`（SAVEPOINT 成功 RELEASE 后才登记）

**差异要点**
- V2 原 13 列 INSERT（含 `created_at`/`updated_at`）收口为 `writeSegment` 的 12 列扩展形态（`employee_assignment` schema 有默认值，省略 `created_at`/`updated_at` 合法）。
- 终态闸门、外层事务、逐行 `SAVEPOINT`、审批/批次状态/返回结构全部保留。
- `operation_unit_id`/`dept_name` 经 `newSegment` 显式传入，由 `writeSegment` 仅在显式提供时拼入。

**V2 调用代码片段**
```js
const curSegRes = await client.query(
  `SELECT id, employee_id, org_unit_id, position_id, status
     FROM employee_assignment
    WHERE employee_id = $1 AND is_current = true AND is_primary = true AND is_deleted = false`, [employeeId]);
await writeSegment(client, {
  employeeId, scenario: 'ASSIGN', currentSegments: curSegRes.rows,
  newSegment: { employee_id: employeeId, org_unit_id: p.target_org_id,
    operation_unit_id: p.target_unit_id || null, position_id: p.target_pos_id,
    supervisor_id: finalSupervisorId || null, dept_name: p.raw_dept || null,
    status: 'active', start_date: p.hire_date || null, remark: remarkStr, created_by: userId || null },
  endDate: v2EndDate,
});
```

---

## 5. writeSegment 调用证据（`assignmentSegmentService.js`）

- `:103` `async function writeSegment(client, params)` —— 接收调用方事务 `client`，内部**不** `pool.connect`/`BEGIN`/`COMMIT`/`ROLLBACK`。
- A/B/C 保护：`currentSegments.length === 0`（放行）/`=== 1`（`rowCount !== 1` 抛 `SegmentCloseFailedError`）/`> 1`（抛 `SegmentConflictError`）。
- **双形态 INSERT**（关键，避免改动 V1/三入口字节级 SQL）：
  - `:164-176` 无 V2 扩展列（`hasV2Ext === false`）→ 使用与 M1-01 提交**逐字一致**的形态：`VALUES ($1, $2, $3, $4, $5, true, true, $6, $7, $8)`（8 参数）。
  - `:164 / :214` 有扩展列（`operation_unit_id` 或 `dept_name` 非 `undefined`）→ 切到全参数化动态形态（列与参数同序），仅 V2 触发。
- 不修改 `employee.employment_relation`；不重新 `SELECT` 当前段（依赖传入 `currentSegments`）。

```js
const hasV2Ext = newSegment.operation_unit_id !== undefined || newSegment.dept_name !== undefined;
if (!hasV2Ext) {
  insertSql = `INSERT INTO employee_assignment ( employee_id, org_unit_id, position_id, supervisor_id,
    status, is_current, is_primary, start_date, remark, created_by )
    VALUES ($1, $2, $3, $4, $5, true, true, $6, $7, $8) RETURNING *`;
  insertVals = [ … 8 个参数 … ];
} else {
  // 动态拼列（operation_unit_id / dept_name 可选），列与参数同序
  insertSql = `INSERT INTO employee_assignment (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  insertVals = vals;
}
```

---

## 6. 行锁与锁后复核证据

- **V1**：`employeeImportService.js:543` 既有员工 `SELECT … FROM employee WHERE employee_code = $1 AND is_deleted = false FOR UPDATE`；`:649` 新员工 `SELECT id, employment_relation FROM employee WHERE id = $1 FOR UPDATE`。终态闸门注释明确「`employment_relation` 即锁后权威值」（`employeeImportService.js:563`）。
- **V2**：`employeeImportV2Service.js:946/952/958` 三条匹配查询均带 `FOR UPDATE`，同时带出 `employment_relation`；`:1035` 对员工行再次 `FOR UPDATE` 补锁，注释「统一口径」。
- 锁后复核意图：员工行在事务内被 `FOR UPDATE` 锁定后，其 `employment_relation` 即本事务视角下的权威值，终态闸门与任职段写入均基于该锁后读值，避免并发下读到陈旧关系导致终态复活。

---

## 7. 批次去重与事务边界证据

- **稳定键**：均以 `employee.id`（而非姓名）为去重键，满足任务书要求。
- **V1（`importExcelFile` 逐行事务）**：`:523` 声明 `seenEmployeeIds`；`:551` 进入任职写入前若命中则空事务 `ROLLBACK`+记冲突+`continue`（第一条成功、第二条同 id → 标记冲突）；`:771` 仅在本行 `COMMIT` 成功后才 `add`（第一条失败、第二条同 id → 允许重试；不同 id 互不影响；单员工失败不影响其它员工）。
- **V2（`performBatchImport` 外层事务 + 逐行 SAVEPOINT）**：`:932` 声明 `seenEmployeeIds`；`:1038` 写入前若命中则抛「已成功入库，重复记录已跳过」（由行级 `catch` → `ROLLBACK TO SAVEPOINT` 兜底）；`:1105` 仅在本行 `RELEASE SAVEPOINT` 成功后才 `add`。
- **JS 集合无事务回滚能力 → 登记时机是唯一正确性来源**：解析出 `employee.id` 后，先进入 `SAVEPOINT`/写入，仅当 `SAVEPOINT`/`COMMIT` 成功（即 RELEASE）后才登记；失败（`ROLLBACK TO SAVEPOINT`）不登记 → 后续同 id 自然可重试。

---

## 8. SAVEPOINT 一致性证据（V2）

- 写入路径：`WRITE → RELEASE SAVEPOINT sp_i（:1103）→ seenEmployeeIds.add（:1105）` 严格顺序。
- 失败路径：行级 `catch`（`:1106`）→ `ROLLBACK TO SAVEPOINT sp_i`（`:1109`）→ `failedCount++` → **不** `add`。
- 因此「SAVEPOINT 成功后登记、失败后不登记」在代码结构上闭环；单测 `m1-02…:SAVEPOINT 失败后不登记去重` 与 `SAVEPOINT 成功后登记去重` 双向验证（见 §9）。
- 外层事务：所有行处理完后 `UPDATE employee_import_batch` + `COMMIT`（`:1124`），单/多行失败均**非整批 ROLLBACK**（仅 `ROLLBACK TO SAVEPOINT`），由 `partial_completed`/`completed` 批次状态表达。

---

## 9. 新增测试与结果

**新增文件**：`server/__tests__/m1-02-import-segment-unification.unit.test.js`（17 用例）

| 分组 | 用例 | 结果 |
|---|---|---|
| V1 当前段数量保护 | A（0 段）/ B（1 段）/ C（2 段）/ 新员工 A | ✅ 4/4 |
| V1 失败回滚 | 关段 rowCount≠1 / 新段 INSERT 空行 | ✅ 2/2 |
| V1 批次去重 | 第一条成功后续冲突 / 第一条失败可重试 / 不同 id 互不影响 / 单员工失败不影响其它 | ✅ 4/4 |
| V2 去重登记时机 | SAVEPOINT 成功后登记 / 失败后不登记 / 不同 id 互不影响 | ✅ 3/3 |
| V2 行级隔离 | 关段异常回滚当前行 / INSERT 异常回滚当前行 | ✅ 2/2 |
| V2 外层事务 | 全成功→completed / 混合→partial_completed | ✅ 2/2 |

**修正文件**：
- `employee-import-v1-terminal-guard.unit.test.js`：mock `INSERT` 返回行、`FROM` 返回当前段、关段断言改 `writeSegment(ASSIGN)` 形态。
- `employee-import-v2-terminal-guard.unit.test.js`：同上 + V2 12 列扩展断言。

**回归命令与结果**
```bash
# 员工域全量（M1-02 相关）
npx jest --testPathPatterns="(employee-|assignmentSegmentService|m1-02-import-segment)"
# → Test Suites: 12 passed / Tests: 308 passed

# 仅 M1-02 新增覆盖
npx jest --testPathPatterns="m1-02-import-segment-unification"
# → Test Suites: 1 passed / Tests: 17 passed
```
**全量基线对比**：`npx jest`（整仓 `*.unit.test.js`）显示 `8 failed, 39 passed` 套件 / `3 failed, 817 passed` 用例，与任务书已知基线「改造前即 8 套件/3 用例失败」**完全一致**——失败均为无关套件的「Jest worker out of memory / babel transform」环境型崩溃，**非本节点引入**；员工域 0 新增失败。

---

## 10. DB 连接 / 运行环境

- 全部测试为纯单元测试：`config/db` 被 mock（`pool.query`/`pool.connect` 替身），`xlsx`/`routes/audit`/`utils/encryption`/`middleware/upload`/`routes/hse-employee/_shared`/`employeeAssignmentService` 均 mock。
- **不建立任何真实数据库连接、不读真实文件、不写库**。任务书 §七要求的「需确认开发/专用测试库、禁生产库」在本节点以「纯 mock 单测」满足；真实库验证属 DB-INT（需另行授权），未执行。

---

## 11. cost.js 保护态

- 提交前核验：`git status --porcelain server/routes/cost.js` → `A  server/routes/cost.js`；MD5 = `e88ae2b0b275346dfc1431408aa00bff`（与红线基线一致）。
- 本节点业务提交采用精确 pathspec，**未将 `cost.js` 纳入提交、未取消其暂存、未修改其内容**；`cost.js` 仍保持 `A` 暂存态。

---

## 12. 业务 / 报告提交 SHA

| 提交 | SHA（短） | 内容 |
|---|---|---|
| 业务提交（3 服务 + 3 测试） | `0bfdeae` | `assignmentSegmentService.js` / `employeeImportService.js` / `employeeImportV2Service.js` + 上述 3 个测试文件 |
| 报告提交 | `85f12ed` | 本报告 `docs/project-control/M1-02/M1-02-01-V1-V2-IMPORT-SEGMENT-UNIFICATION-REPORT.md` |

> SHA 在 `git commit` 后由本会话回填（见末尾「提交回填」小节）。业务与报告**分两次提交**，均推送 `origin/feat/b02-dec-03.13-a02d-status-code`。

---

## 13. 远端 HEAD / ahead-behind

- 提交并推送后核验：`git ls-remote origin feat/b02-dec-03.13-a02d-status-code` 的远端 ref 应与本地 `HEAD` 一致；`git status -sb` 应显示 `ahead N`（业务 1 + 报告若干），无 `behind`。
- 本节点**不合主、不强推、不变基、不部署**（见 §15）。

---

## 14. 已知问题与回滚

- **已知**：`writeSegment` 双形态 INSERT 的「V2 扩展列」由 `newSegment.operation_unit_id !== undefined || newSegment.dept_name !== undefined` 判定；若未来调用方传入 `undefined` 之外的「空扩展列」需显式赋值 `null`（V2 当前传 `p.target_unit_id || null` = `null`，`null !== undefined` 成立，已正确触发扩展形态）。
- **回滚方案**：业务代码以独立 commit 提交，必要时 `git revert <BUSINESS_SHA>` 即可回退 V1/V2 统一改造；测试与报告各自独立，互不影响。
- **未实测项**：真实 PostgreSQL 外键隐式锁、`SAVEPOINT` 跨会话死锁实测（M1-01 D-09 已记录，待 M0 dev 双会话验证），本节点不涉及。

---

## 15. 未实施事项 / 禁止事项遵守（§八）

全部禁止项均**未违反**：
- ❌ 无 `deleteEmployee` / 无 `employee_assignment` 结构变更 / 无 migration；
- ❌ 无生产库操作（纯 mock 单测）；
- ❌ 无前端改造、无 API 路由契约修改、无 M2、无其他模块修改；
- ❌ 不合主分支、不部署。
- ⚠️ 真实库 DB-INT 验证（§七）未执行，属需授权项，不在本节点范围内。
- ⏭️ 后续节点（按 §十二 路线图，**均未启动**，待独立审查）：M1-03 deleteEmployee、M1-04 六路径回归、M1-05 验收、M2。

---

## 16. 结论与下一步

- M1-02 已将 V1 `importExcelFile` 与 V2 `performBatchImport` 两条导入路径全部接入 M1-01 统一服务 `writeSegment`，并完成：事务内 `employee` 行锁 + 锁后复核、以稳定 `employee.id` 为键的批次去重（V2 严格 RELEASE 后才登记）、A/B/C 当前段数量保护、关闭/插入失败整行（V2 行级 SAVEPOINT）回滚。
- 既有业务差异（逐行事务 vs 外层事务+SAVEPOINT、身份匹配三路径、字段映射、审批/返回结构）全部保留；`writeSegment` 对 V1/三入口保持字节级 SQL 兼容、仅对 V2 扩展列切换形态。
- 测试全绿，cost.js 保护态完好，未触碰禁止项。
- **下一步（依 §十一）**：业务 + 报告分别提交并推送后立即停止，不自行启动 M1-03 或 M2，等待独立审查。

---

### 提交回填（commit 后由本会话更新）

- 业务提交 SHA：`0bfdeae`
- 报告提交 SHA：`85f12ed`
- 远端 `ls-remote` 核验结论：远端 `refs/heads/feat/b02-dec-03.13-a02d-status-code` 与本地 `HEAD` 一致（ahead 0 / behind 0，已同步，末次推送记录见各次 `git push` 输出）；`cost.js` 不在远端 HEAD（仅本地暂存 `A` 保护态，未提交、未推送）。业务提交 `0bfdeae` 与历次报告提交均经 `git push` 送达；复核命令：`git ls-remote origin feat/b02-dec-03.13-a02d-status-code`。
