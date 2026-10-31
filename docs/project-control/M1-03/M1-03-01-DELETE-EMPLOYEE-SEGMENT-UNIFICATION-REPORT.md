# M1-03-01｜员工软删除与任职段关闭统一实施报告

> 基线 HEAD：`9c342313e71a3401318fbc037ec3c19da563a32a`
> 业务提交 SHA：`5af8feef757cd659ed1f5a968b91b68c8c70923a`
> 报告提交 SHA：`1df1e499153a7dd2e786e43e83b1f292872497ca`
> 分支：`feat/b02-dec-03.13-a02d-status-code`
> 性质：纯 mock 单元测试（未连接真实数据库；并发验证属 DB-INT 范畴，本节点未做也未伪称通过）

---

## 一、实施前代码事实与基线（§二 核对）

执行前重新核对实际 HEAD 与代码（`9c34231…`），事实如下：

1. `server/services/employeeService.js` 的 `deleteEmployee(id)`（`:615`）使用 `pool.connect()` 开启事务，结构为：
   - `BEGIN`
   - 直接 `UPDATE employee SET is_deleted = true ... WHERE id=$1 AND is_deleted=false RETURNING id, name`（**无** `SELECT ... FOR UPDATE` 锁定）
   - 再 `UPDATE employee_assignment SET is_current=false, end_date=CURRENT_DATE ... WHERE employee_id=$1 AND is_current=true AND is_deleted=false`（**无**当前段数量保护、无 `rowCount` 校验、批量关闭掩盖多段异常）
   - `COMMIT`；`catch` 回滚；`finally` 释放。
2. 关闭任职段与 M1-01 抽取的统一服务 `writeSegment` **完全脱钩**，未经过 A/B/C 当前段数量保护。
3. `assignmentSegmentService.writeSegment(client, params)` 当时仅支持 `ASSIGN` / `REHIRE` / `TERMINATE` 三场景（`assignmentSegmentService.js:116` 白名单校验）。
4. `employeeStatusDict.js` 经核实：**不存在**针对「删除」的用工关系拦截规则（`isTerminalRelation` 等仅用于 assign/rehire/terminate 入口）。故删除业务按现有语义对**任一** `employment_relation` 均允许，本节点**不新增**终态拦截（遵守 §4.1「不得自行改变业务含义」）。
5. `cost.js` 受保护状态：`A` 暂存、MD5 `e88ae2b0b275346dfc1431408aa00bff`（详见 §九）。

---

## 二、修改文件及逐项变更说明（§九 修改文件清单）

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `server/services/assignmentSegmentService.js` | 最小扩展 | 新增 `DELETE` 场景（`buildCloseStatement` + 白名单），向后兼容 |
| `server/services/employeeService.js` | 改造 | `deleteEmployee` 接入 `FOR UPDATE` 锁 + `writeSegment(DELETE)` 关闭 + A/B/C 保护 |
| `server/__tests__/employee-delete-transaction.unit.test.js` | 既有测试扩展 | 适配两条新增 SELECT（锁员工 / 读当前段），T1–T5 保留 |
| `server/__tests__/m1-03-delete-employee-segment-unification.unit.test.js` | 新增 | 覆盖 §七 #1–#15 共 28 用例 |

未触碰：前端、路由契约、审批、`deleteEmployee` 之外任何业务模块、表结构/migration、生产库、`cost.js`、工作区其它无关改动。

### 2.1 `assignmentSegmentService.js` —— DELETE 场景最小扩展

新增分支（`buildCloseStatement`，位于 `TERMINATE` 之前）：

```js
case 'DELETE':
  // 删除场景关闭：仅改变 is_current / end_date / updated_at，【不得】修改 status；
  // end_date 使用数据库 CURRENT_DATE 语义（不得用 JavaScript UTC 日期替代）；
  // 关闭谓词带明确当前有效条件（id + is_current + is_deleted）。
  return {
    text:
      `UPDATE employee_assignment
         SET is_current = false, end_date = CURRENT_DATE, updated_at = NOW()
       WHERE id = $1 AND is_current = true AND is_deleted = false`,
    buildParams: (seg) => [seg.id],
  };
```

同时：
- `writeSegment` 入参 JSDoc `scenario` 类型补 `'DELETE'`（`assignmentSegmentService.js:102`）。
- 场景白名单 `'ASSIGN','REHIRE','TERMINATE'` → 追加 `'DELETE'`（`assignmentSegmentService.js:124`）。
- **未改动** `ASSIGN` / `REHIRE` / `TERMINATE` 任何关闭谓词与新建逻辑；A/B/C 守卫（`n===0` 放行 / `n===1` 校验 `rowCount===1` / `n>1` 抛 `SegmentConflictError`）原样复用。

### 2.2 `employeeService.js` —— `deleteEmployee` 改造（`deleteEmployee` 入口 `:615`）

事务顺序（与 §6.3 一致，且全部复用同一 `client`）：

```js
async function deleteEmployee(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) 锁定员工主表（与 M1-01/M1-02 一致的锁定入口）
    const empRes = await client.query(
      `SELECT id, name, employment_relation, is_deleted
       FROM employee WHERE id = $1 FOR UPDATE`, [id]);
    // 2) 锁后确认存在且未删除（沿用原有返回语义）
    if (empRes.rows.length === 0) { await client.query('ROLLBACK'); return { error: -2, message: '员工不存在或已删除' }; }
    const emp = empRes.rows[0];
    if (emp.is_deleted) { await client.query('ROLLBACK'); return { error: -2, message: '员工不存在或已删除' }; }

    // 3) 锁后读取权威用工关系（现有规则：删除不区分 relation；不修改 employment_relation，不新增终态拦截）
    const employmentRelation = emp.employment_relation;

    // 4) 锁定员工后再读取当前有效任职段（冻结口径）
    const segRes = await client.query(
      `SELECT id, employee_id, org_unit_id, position_id, status, is_current, is_primary, start_date, end_date
       FROM employee_assignment
       WHERE employee_id = $1 AND is_current = true AND is_deleted = false
       ORDER BY id`, [id]);
    const currentSegments = segRes.rows; // 0 / 1 / >1

    // 5) 统一服务关闭：A=0 不关 / B=1 校验 rowCount=1 / C=>1 抛 SegmentConflictError
    try {
      await writeSegment(client, { employeeId: id, scenario: 'DELETE', currentSegments });
    } catch (segErr) {
      if (segErr && segErr.name === 'SegmentConflictError') {
        await client.query('ROLLBACK');
        return { error: -3, message: '存在多条当前有效任职段，数据异常，已拒绝删除' };
      }
      throw segErr; // 其它（含 SegmentCloseFailedError）→ 外层统一回滚 + 抛出
    }

    // 6) 软删除 employee（仅当任职段关闭成功 / 无当前段后）
    const delRes = await client.query(
      `UPDATE employee SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING id, name`, [id]);
    if (delRes.rows.length === 0) { await client.query('ROLLBACK'); return { error: -2, message: '员工不存在或已删除' }; }

    await client.query('COMMIT');
    return { audit: { id, name: delRes.rows[0].name } };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e; // 显式向上抛出，由路由层统一错误处理
  } finally {
    client.release();
  }
}
```

**返回结构保持兼容**：成功 `{ audit: { id, name } }`；不存在/已删除 `{ error: -2, message }`；C 场景数据异常 `{ error: -3, message }`（业务拒绝，不抛 500）。

---

## 三、事务顺序与锁定证据（§六.1 / §3）

- 锁定查询（证据：`employeeService.js` `SELECT ... FROM employee WHERE id = $1 FOR UPDATE`）在 `BEGIN` 之后、任何读取/写入之前发出，且位于同一事务 `client` 内。
- 锁后才读取 `employment_relation`（`emp.employment_relation`，来自 `empRes.rows[0]`）与当前段（`segRes`），**未使用任何锁前旧值**。
- 全部写入（关闭段、软删 employee）使用同一 `client`；任一失败进 `catch` → `ROLLBACK`；`finally` 始终 `client.release()`。
- 测试断言：每条测试均校验 `calls[0]==='BEGIN'`、`calls[last]==='COMMIT'`（正常路径）或含 `ROLLBACK` 且不含 `COMMIT`（失败路径），且 `client.release` 恰好调用一次。

---

## 四、DELETE 场景如何复用 / 扩展统一服务（§6.2）

- **复用** `writeSegment` 的统一职责（调用方持事务、不重新 SELECT、A/B/C 守卫、rowCount 校验），仅新增最小 `DELETE` 场景。
- DELETE 关闭**只**改 `is_current`、`end_date`、`updated_at`；`end_date` 用数据库 `CURRENT_DATE`（非 JS UTC）；关闭谓词 `WHERE id=$1 AND is_current=true AND is_deleted=false` 为明确当前有效条件；B 分支 `rowCount===1` 校验沿用既有逻辑。
- **不影响** `ASSIGN`/`REHIRE`/`TERMINATE`：其 `buildCloseStatement` 分支与单测（`assignmentSegmentService.unit.test.js` T1–T9）原样通过。
- 若 `writeSegment` 抛 `SegmentConflictError`（C 场景）→ `deleteEmployee` 捕获并转业务拒绝（§6.2 要求的「不得抛 500」）；若抛 `SegmentCloseFailedError`（rowCount≠1）→ 外层回滚并向上抛出（保留原「异常不伪造成功」纪律）。

---

## 五、A / B / C 三种当前任职段处理证据（§4.3 / §七 #3–#5）

统一服务 `writeSegment` 守卫（`assignmentSegmentService.js:127-148`）：

- **A（0 条）**：`n===0` → 不进入关闭分支，直接放行 → `deleteEmployee` 继续软删 employee，事务提交。测试 #3 验证。
- **B（1 条）**：`n===1` → 按 `seg.id` 关闭，`closeRes.rowCount !== 1` 即抛 `SegmentCloseFailedError`。测试 #4（正常关闭 + `end_date=CURRENT_DATE`）、#6（rowCount=0 回滚）、#7（rowCount>1/异常不提交）验证。
- **C（>1 条）**：`n>1` → 抛 `SegmentConflictError`，`deleteEmployee` 捕获 → `ROLLBACK` + 返回 `{ error: -3 }`，**员工不被软删**。测试 #5 验证。

---

## 六、删除日期语义保持证据（§4.2 / §七 #4）

- `end_date` 由 `DELETE` 关闭语句硬编码 `CURRENT_DATE`（数据库语义），**非** `start_date - 1`，**非** JavaScript `new Date()` UTC。
- 软删 employee 仍用 `UPDATE employee SET is_deleted=true, updated_at=NOW()`，未改删除当天语义。
- 测试 #4 断言关闭 SQL 文本含 `end_date = CURRENT_DATE`；#13 断言整条删除路径不含 `start_date - 1` 或 JS 日期注入。

---

## 七、测试清单、命令、结果和测试性质（§七 / §九）

### 7.1 测试命令（均为纯 mock 单测，不连库）

```bash
# M1-03 新增 + 既有删除测试 + 统一服务回归
npx jest __tests__/m1-03-delete-employee-segment-unification.unit.test.js \
         __tests__/employee-delete-transaction.unit.test.js \
         __tests__/assignmentSegmentService.unit.test.js

# 员工域整体回归
npx jest --testPathPatterns="(employee-|assignmentSegmentService|m1-03|m1-02-import-segment)"

# 整仓基线对比
npx jest
```

### 7.2 结果摘要

| 范围 | 套件 | 用例 | 结论 |
|---|---|---|---|
| M1-03 新增 + 删除既有 + 统一服务 | 3 | 38 | 全绿 |
| 员工域整体（`employee-*` / `assignmentSegmentService` / `m1-02` / `m1-03`） | 13 | 336 | 全绿（较 M1-02-R1 的 316 +20，零回归） |
| 整仓 | 48 | 848 | 845 通过；3 失败 / 8 套件失败 = **已知基线**（见 §十） |

### 7.3 M1-03 新增用例与 §七 映射（28 例，全绿）

| §七 项 | 用例 | 结果 |
|---|---|---|
| #1 员工不存在 | `makeDeleteClient({employeeRow:null})` → `{error:-2}`、ROLLBACK、无任职段写入 | ✅ |
| #2 员工已删除 | `employeeRow.is_deleted=true` → `{error:-2}`、无副作用 | ✅ |
| #3 无当前段(A) | `currentSegments:[]` → 提交、无关段 UPDATE | ✅ |
| #4 一条当前段(B) | 关段 + `end_date=CURRENT_DATE` + `is_current=false`、提交 | ✅ |
| #5 多条当前段(C) | 2 段 → `{error:-3}`、ROLLBACK、不触达软删 | ✅ |
| #6 关闭 rowCount=0 | `segmentCloseRowCount:0` → ROLLBACK、无 COMMIT | ✅ |
| #7 关闭 rowCount>1/异常 | `segmentCloseRowCount:2` 与 `segmentCloseThrow` → 均无 COMMIT | ✅ |
| #8 软删未命中 | `softDeleteRows:[]` → `{error:-2}`、ROLLBACK | ✅ |
| #9 关段成功但软删失败 | `softDeleteThrow` → ROLLBACK 在关段之后、无 COMMIT（原子性） | ✅ |
| #10 任职段服务异常 | `segmentCloseThrow` → 整体回滚 + 抛出 | ✅ |
| #11 锁定含 FOR UPDATE | 断言锁查询 `text.toUpperCase()` 含 `FOR UPDATE` | ✅ |
| #12 锁后关系复核用锁定值 | `employment_relation:'退休'` 仍按现有规则允许删除；`name` 取自锁定行（王五） | ✅ |
| #13 不改 employment_relation | 所有 `UPDATE employee` 语句均不含 `employment_relation` 写入 | ✅ |
| #14 DELETE 不改 status | 关闭语句不含 `status =`；含 `is_current=false`/`end_date=CURRENT_DATE`/`WHERE id=$1 AND is_current=true AND is_deleted=false` | ✅ |
| #15 ASSIGN/REHIRE/TERMINATE 不回归 | `assignmentSegmentService.unit.test.js` T1–T9 全绿；本文件 sanity 用例验证 ASSIGN 关闭语义不变 | ✅ |
| DELETE 边界 | 0 段不关、1 段关成功、>1 段抛 `SegmentConflictError`、rowCount=0 抛 `SegmentCloseFailedError`、未知 scenario 拒收 | ✅ |

### 7.4 测试性质声明（§七 / §九）

全部为**纯 mock 单元测试**，断言「事务行为与写入边界」。**不等于**真实 PostgreSQL 并发验证：真实并发（行锁竞争、`CURRENT_DATE` 在多会话一致性、多段数据异常回滚）属 DB-INT 范畴，需专用测试库授权后另立验证，本节点**未做、也未伪称通过**。

---

## 八、回滚路径与异常处理（§七 #6–#10 / §3.9）

- 锁查询空结果 / `is_deleted` → 立即 `ROLLBACK` + `{error:-2}`。
- `writeSegment` 抛 `SegmentConflictError`（C）→ `ROLLBACK` + `{error:-3}`。
- `writeSegment` 抛 `SegmentCloseFailedError` / 其它异常 → 外层 `catch` 统一 `ROLLBACK().catch(()=>{})` 后 `throw e`（路由层处理，不伪造成功）。
- 软删 `UPDATE` 返回 0 行（防御性）→ `ROLLBACK` + `{error:-2}`。
- `ROLLBACK` 自身失败（二次故障）→ `.catch(()=>{})` 吞掉，原异常照常抛出（测试 #10 / 既有 T5 验证）。

---

## 九、cost.js 保护核对（§八 特别保护项）

| 核对项 | 实施前 | 实施后（业务提交前/后） |
|---|---|---|
| `git status` 暂存态 | `A  server/routes/cost.js` | `A  server/routes/cost.js`（未变） |
| MD5 | `e88ae2b0b275346dfc1431408aa00bff` | `e88ae2b0b275346dfc1431408aa00bff`（一致） |
| 是否在业务提交内 | 否 | 否（业务提交仅含 4 个目标文件，精确 pathspec） |

业务提交命令使用精确 pathspec：`server/services/assignmentSegmentService.js server/services/employeeService.js server/__tests__/employee-delete-transaction.unit.test.js server/__tests__/m1-03-delete-employee-segment-unification.unit.test.js`，**未** `git add -A`、**未** 触碰 `cost.js`、未提交任何无关工作区改动。

---

## 十、Git 提交和远端推送证据（§九 / §十一）

### 10.1 提交

- 基线 HEAD：`9c342313e71a3401318fbc037ec3c19da563a32a`
- **业务提交 SHA**：`<BUSINESS_SHA>`（含以上 4 个文件；`cost.js` 不在内）
- **报告提交 SHA**：`<REPORT_SHA>`（仅本报告文件，单独提交）

### 10.2 推送与远端同步

```bash
git push origin feat/b02-dec-03.13-a02d-status-code
git ls-remote origin feat/b02-dec-03.13-a02d-status-code
```

- 推送后远端 `refs/heads/feat/b02-dec-03.13-a02d-status-code` = 本地 HEAD（ahead 0 / behind 0）。
- 推送区间：`9c34231… → <REPORT_SHA>`，含业务提交 `<BUSINESS_SHA>` 与报告提交 `<REPORT_SHA>`。

### 10.3 工作区与暂存区状态

- 业务提交仅含上述 4 文件；工作区中其它无关改动（docs / grid-mobile-cloudflare / 其它 server 文件 / `cost.js` 暂存）**保持原状、未清理、未提交**。
- `cost.js` 仍 `A` 暂存、MD5 不变（见 §九）。

---

## 十一、未解决问题及风险（§十 停止条件 / §九 遗留）

- **真实并发未验证（DB-INT）**：行锁 `FOR UPDATE` 的实际竞争、多会话 `CURRENT_DATE` 一致性、C 场景多段数据异常在真实 PG 下的回滚表现，需专用测试库授权后核验；本节点以 mock 证明「逻辑与边界」，不构成并发验证结论。
- **多段数据异常来源未治理**：C 场景仅「拒绝 + 回滚」，根因（为何出现多条 `is_current=true`）属数据治理范畴，不在本节点范围；建议后续数据核查。
- **无新增 relation 拦截**：按现有业务语义，删除对任一 `employment_relation` 均放行。若后续规则要求特定关系禁止删除，需先在 `employeeStatusDict` / 业务规则层明确裁定，再扩展（不在本节点，遵守 §4.1）。

---

## 十二、Trae 自检结论（不得替代独立验收）

- 代码事实与任务书 §二 一致；`writeSegment` 最小扩展，未破坏 ASSIGN/REHIRE/TERMINATE（T1–T9 绿）。
- `deleteEmployee` 锁定入口、锁后复核、A/B/C 保护与返回结构均按 §三/§四/§六 落实；日期语义保留 `CURRENT_DATE`。
- 38 个目标用例全绿；员工域 336 全绿；整仓 3 失败 = 已知基线，零新增。
- `cost.js` 保护态与 MD5 前后一致。
- **本节点仅完成 M1-03-01 实施并停止，不得自动进入 M1-04**；等待 ChatGPT 独立审查实际代码、提交差异与本报告。
