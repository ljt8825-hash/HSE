# M1-01-01｜任职段统一写入服务建立及三个核心入口接入 · 实施报告

> 节点：M1 任职写入路径统一实施 · 第一阶段（M1-01）
> 分支：`feat/b02-dec-03.13-a02d-status-code`
> 基线 HEAD（任务书签发时）：`618a4dfdd0e6ba5cb73e2e4fe56a88782abce888`
> 业务提交 SHA：`cbeb0284d06b53e6d415310bfdd1bbd9fe9f6553`
> 报告提交 SHA：见文末「提交指纹与远端核验」（本报告所在提交）

---

## 一、执行前检查（§八-1）

| 项 | 结果 |
|----|------|
| 当前分支 | `feat/b02-dec-03.13-a02d-status-code` ✓ |
| 工作区基线 HEAD | `618a4dfdd0e6ba5cb73e2e4fe56a88782abce888`（= 任务书基线）✓ |
| `cost.js` 状态 | `A`（暂存）✓，MD5 `e88ae2b0b275346dfc1431408aa00bff` ✓（未触碰、未纳入本节点任何提交） |
| 生产库操作 | 无；本节点所有写入均为源码与测试，DB 操作红线未触发 |
| 其他会话遗留改动 | 工作区存在大量无关改动（docs/191副、grid-mobile-cloudflare、server/app.js、P3-xx 脚本等），本节点 `git add` 严格限定 5 个授权文件，未夹带任何无关文件 |

---

## 二、修改清单（§八-2）

| 文件 | 动作 | 说明 |
|------|------|------|
| `server/services/assignmentSegmentService.js` | **新增** | 统一任职段写入服务，导出 `writeSegment` / `SegmentConflictError` / `SegmentCloseFailedError` |
| `server/services/employeeAssignmentService.js` | 修改 | 顶部 `require('./assignmentSegmentService')`；`assignEmployee` / `rehireEmployee` / `terminateEmployee` 三段写入迁移到 `writeSegment` |
| `server/__tests__/assignmentSegmentService.unit.test.js` | **新增** | `writeSegment` 纯单测（jest.mock config/db，不连库） |
| `server/__tests__/employee-assignment-terminal-guard.unit.test.js` | 修改 | T6 将 `ins[0]` 含 `'active'` 字面量断言改为 `ins[1][4] === 'active'`（status 现参数化写入） |
| `server/__tests__/employee-relation-d1.unit.test.js` | 修改 | G8 两处 `'active'` 字面量断言改为 `ins[1][4] === 'active'`（同因） |

**未触及**（遵守禁止事项）：`employee_assignment` 表结构、migration、V1/V2/deleteEmployee、前端/路由契约、`employee.employment_relation`/身份/组织主数据/考核数据、生产库。

---

## 三、接口设计（§八-3 / M1-01-A）

```js
async function writeSegment(client, params)
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `client` | Object | **调用方传入的、已 BEGIN 的事务连接**；内部绝不 `pool.connect` / `BEGIN` / `COMMIT` / `ROLLBACK` |
| `params.employeeId` | number\|string | 仅用于错误文案，不参与写入 |
| `params.scenario` | `'ASSIGN'\|'REHIRE'\|'TERMINATE'` | 决定关闭谓词（不强行统一 SQL） |
| `params.currentSegments` | Array | 调用方已锁定的「当前有效任职段」读取结果（**本函数不再 SELECT**，由入口传入） |
| `params.newSegment` | Object? | 待建新段；`TERMINATE` 不传（仅关闭） |
| `params.closeStatus` | string? | 关闭时写入的段状态（`TERMINATE` 用 `inactive`；`ASSIGN` 不写 status 列） |
| `params.endDate` | string? | 关闭段写入的 `end_date`（`ASSIGN`=新段生效日-1；`TERMINATE`=业务事件日） |

**返回**：`{ closed: Object|null, inserted: Object|null }`

**错误类**：
- `SegmentConflictError`（C 场景，多条当前段）→ 调用方转化为业务冲突 `-4`
- `SegmentCloseFailedError`（B 场景 rowCount≠1）→ 交由调用方外层 catch 回滚

**硬约束（违反即违反任务书）**：内部禁止建连/启事务、不修改 `employment_relation`、不反向锁 `employee`、入口保留权限校验/资格/终态规则/事件/历史/审计/提交顺序。

---

## 四、迁移差异（§八-4 / M1-01-D）：三个入口逐个保留业务差异

| 入口 | 迁移内容 | 保留的业务差异 |
|------|----------|----------------|
| `assignEmployee` | 关旧段+建 active 段 → `writeSegment(scenario:'ASSIGN', currentSegments: currentOrgResult.rows)` | 预事务零副作用终态闸门（`checkRelationAllowsAssignment`）、事务内 `FOR UPDATE` 锁员工+锁后复核、`beforeOrg/beforeStatus` 取当前段、事件 `EMPLOYEE_TRANSFERRED`、响应结构 `status:'在职'` 不变；C 场景（>1 当前段）新增转化为 `-4` 业务冲突返回 |
| `rehireEmployee` | 建 reinstated 段 → `writeSegment(scenario:'REHIRE', currentSegments:[])` | 资格闸门（仅退休）、锁后复核、时间轴校验、`UPDATE employee` 重置关系为正式员工、历史 `返聘` 关联、事件 `EMPLOYEE_REHIRED`；rehire **不关闭既有段**（入口已先行拒绝「存在当前段」），故 `currentSegments=[]`（A 场景仅新建） |
| `terminateEmployee` | 关段 → `writeSegment(scenario:'TERMINATE', currentSegments: curResult.rows)` | 资格/关系闸门、`FOR UPDATE` 锁员工+锁段、时间轴校验、`UPDATE employee`（关系+离职日期）、历史、持久审计 `sys_operation_log`、事件；terminate 已保证当前段存在且唯一，故必为 B 场景 |

**关键设计**：`writeSegment` **不重新 SELECT 当前段**，完全依赖入口传入的 `currentSegments`，从而精确保留各入口既有事务顺序与 SQL 断言（rehire 9 步序列、terminate 顺序断言均未被破坏，见 §八-8 回归）。

---

## 五、关键 diff（§八-5）

详见 `git show cbeb0284`（`git diff` 已逐行复核，仅 4 处意图变更）：
1. `employeeAssignmentService.js:15` 新增 `require('./assignmentSegmentService')`
2. `assignEmployee`：删除内联「关旧段 UPDATE + 建段 INSERT」，改为 `writeSegment` 调用 + `SegmentConflictError`→`-4` 处理；保留 `beforeOrg/eventType/history`
3. `rehireEmployee`：删除内联建段 INSERT，改为 `writeSegment`（status=`REHIRE_SEGMENT_STATUS`）
4. `terminateEmployee`：删除内联关段 UPDATE + rowCount 校验，改为 `writeSegment`

---

## 六、SQL 关闭谓词（§八-6 / M1-01-B：不强行统一）

按 `scenario` 收敛，保留历史差异：

**ASSIGN（沿用 assignEmployee 历史口径，仅按 id 关闭）**
```sql
UPDATE employee_assignment
  SET is_current = false, end_date = $2, updated_at = NOW()
  WHERE id = $1
-- params: [segmentId, endDate(=新段生效日-1)]
```

**TERMINATE（沿用 terminateEmployee 历史口径，status + 幂等谓词）**
```sql
UPDATE employee_assignment
  SET status = $2, is_current = false, end_date = $3, updated_at = NOW()
  WHERE id = $1 AND is_current = true AND is_deleted = false
-- params: [segmentId, 'inactive', eventDate]
```

> REHIRE 场景 `currentSegments=[]` 不会到达关闭分支（入口已拒绝存在当前段）。

---

## 七、A/B/C 当前段数量保护证据（§八-7 / M1-01-B）

`writeSegment` 内部：
```js
const n = currentSegments.length;
if (n === 0) { /* A：放行，是否建段由 newSegment 决定 */ }
else if (n === 1) {
  const res = await client.query(closeSql, closeParams);
  if (!res || res.rowCount !== 1) throw new SegmentCloseFailedError(...);  // B：rowCount 强校验
} else {
  throw new SegmentConflictError(...);  // C：>1 拒绝，不猜测关闭哪条
}
```

| 场景 | 行为 | 证据（测试） |
|------|------|--------------|
| A（0 条） | 放行；按业务决定是否建段 | `assignmentSegmentService.unit.test.js` T3 / T8 |
| B（1 条） | 按 id 关闭并校验 `rowCount===1`；不符抛 `SegmentCloseFailedError` | T4（ASSIGN）/ T5（TERMINATE）/ T6（rowCount=0 → 拒绝且不再 INSERT） |
| C（>1 条） | 抛 `SegmentConflictError`，零写入 | T7 |

`assignEmployee` 额外将 `SegmentConflictError` 转化为 `{ error: BIZ_CONFLICT(-4), message }` 返回（不抛 500）；`terminate`/`rehire` 因上游已拒 >1，该分支为防御性兜底。

---

## 八、测试清单与结果（§八-8 / §五）

### 8.1 新增 `assignmentSegmentService.unit.test.js`（纯单测，jest.mock config/db，不连库）
- T1 client 传入校验（缺 client / 无 query / 未知 scenario）
- T2 不建连：`pool.connect` 不被调用；无 BEGIN/COMMIT/ROLLBACK
- T3 A 场景：仅 INSERT、不 UPDATE；INSERT 参数化 status（$5）
- T4 B 场景 ASSIGN：先 UPDATE 关闭（WHERE id=$1、endDate）再 INSERT，顺序固定
- T5 B 场景 TERMINATE：仅 UPDATE（status=inactive+幂等谓词），无 INSERT
- T6 B rowCount≠1 → `SegmentCloseFailedError`，且不继续 INSERT
- T7 C 场景（2 条）→ `SegmentConflictError`，零写入
- T8 不碰 `employment_relation`（无 `UPDATE employee`、无 `employment_relation` 字样）
- T9 INSERT 失败向上抛（不吞）

### 8.2 入口回归（既有测试，未删未改无关断言）
- `employee-assignment-terminal-guard.unit.test.js`：T1~T8 / T11 / T12 全部通过（仅 T6 字面量断言改为参数校验）
- `employee-rehire.unit.test.js`：A~E 全序列断言通过（A1 九步序列 `BEGIN→LOCK_EMPLOYEE→CHECK_CURRENT→READ_PREV→READ_ORG→UPDATE_RELATION→INSERT_SEGMENT→INSERT_HISTORY→COMMIT` 未被破坏）
- `employee-terminate.unit.test.js`：T4~T9 通过（T9 关系 UPDATE=0 仍抛错、ROLLBACK、段/历史/审计不写）
- `employee-relation-d1.unit.test.js`：G7/G8 通过（G8 两处字面量断言改为参数校验）

**运行命令**：`NODE_ENV=test HSE_LOG_DIR=./logs/test npx jest --testPathPatterns="(employee-|assignmentSegmentService)"`
**结果**：`Test Suites: 11 passed, 11 total`｜`Tests: 291 passed, 291 total`

---

## 九、回归结果（§八-9）

员工域既存 11 个 `*.unit.test.js` 套件、291 个用例**全部通过**。本节点未修改无关断言、未删除历史测试。

---

## 十、失败测试（§八-10）

无。首次运行曾出现 4 个失败，均已定位修复：
- `assignmentSegmentService.unit.test.js` T2/T3 第二用例：测试自身解构笔误（`client` 未解构）→ 已修正测试
- `employee-relation-d1.unit.test.js` G8：与原 assign T6 同源的 `'active'` 字面量断言 → 已改为参数校验（属 §五 明示允许的直接相关修正）

修复后复跑：**291/291 通过**。

---

## 十一、DB 连接情况（§八-11）

- 全部测试为纯单元测试（`jest.config.js` 仅收集 `*.unit.test.js`，默认不连库）；`config/db` 被 mock。
- 运行期间**未发生任何真实数据库连接**，更无生产库 `safety_dashboard` 写入/DDL。
- 符合 §五红线：无生产库操作、无 DDL、无写入。

---

## 十二、cost.js 状态（§八-12）

- `git status --short server/routes/cost.js` → `A  server/routes/cost.js`（保持既有暂存态）
- MD5 `e88ae2b0b275346dfc1431408aa00bff`（未变）
- 本节点两个提交均未将其纳入（`git add` 严格 pathspec；业务提交文件清单不含 cost.js）

---

## 十三、业务 / 报告 commit SHA（§八-13）

- 业务代码提交：`cbeb0284d06b53e6d415310bfdd1bbd9fe9f6553`
- 报告提交：见文末「提交指纹与远端核验」（本报告所在提交）

---

## 十四、远端核验（§八-14）

推送后由 `git ls-remote origin` 与本地 `git rev-parse HEAD` 比对，确认远端分支 tip = 本地 HEAD（含业务提交 + 报告提交）。详见文末核验结果。

---

## 十五、ahead / behind（§八-15）

- 推送前：本地较 `origin/<branch>` **ahead N**（业务+报告两提交），**behind 0**（未改历史、未 rebase）。
- 推送后：ahead 0 / behind 0（远端 tip == 本地 HEAD）。

---

## 十六、已知问题 / 回滚 / 未实施事项（§八-16）

### 已知问题
1. **assign 新增 C 场景 `-4` 返回**：原 assign 对 >1 当前段是「关闭第一条」的潜在隐患行为；本节点按 M1-01-B 改为拒绝返回 `-4`。这是对 latent bug 的纠正，非回归（既存测试无 >1 段用例，不受影响）。若业务方确认「>1 当前段时按某条关闭」属预期，需另行裁决，不在本节点范围。
2. **CRLF 行尾提示**：Git 检出时提示 LF→CRLF（Windows 默认），为工作区已有约定，不影响内容与测试。

### 回滚
- 本节点为新增独立服务 + 三入口内部迁移，回滚即 `git revert cbeb0284` 与报告提交；`employeeAssignmentService.js` 的三处可独立 revert，互不耦合。`cost.js` 不受影响。

### 未实施（遵守禁止事项，留待后续节点）
- V1 / V2 / deleteEmployee 改造（归 M1 后续或独立任务）
- `employee_assignment` 结构变更、任何 migration
- M2 数据映射、前端/路由契约变更、任何其他模块修改
- 生产库操作（一律禁止）

---

## 十七、停止条件（§九）

本节点推送完成后即停止，交由独立审查。**不自行启动 M1-02 / M1-03 / M2**，亦不主动合并主分支或部署。

---

## 附：提交指纹与远端核验（推送后回填）

- 业务提交（稳定）：`cbeb0284d06b53e6d415310bfdd1bbd9fe9f6553`
- 报告提交：报告文件历经多次修订提交（初版 `b85db37`、核验回填 `ac3b69d`、附录校正 `cbe77fe`），**以交付时远端 tip / 本地 HEAD 为准 = `cbe77fe8a01d819f276f44a6ec57ff299aa97f5f`**
- `git ls-remote origin feat/b02-dec-03.13-a02d-status-code` 返回 tip：`cbe77fe8a01d819f276f44a6ec57ff299aa97f5f`
- 本地 HEAD：`cbe77fe8a01d819f276f44a6ec57ff299aa97f5f`
- 核验结论：远端 tip == 本地 HEAD ✓；ahead/behind = 0 / 0 ✓
- 推送范围：`618a4df..cbe77fe`（业务提交 cbeb0284 + 报告三次修订 b85db37/ac3b69d/cbe77fe，共 4 个提交）；`cost.js` 始终维持 `A` 暂存态，未纳入任一提交
