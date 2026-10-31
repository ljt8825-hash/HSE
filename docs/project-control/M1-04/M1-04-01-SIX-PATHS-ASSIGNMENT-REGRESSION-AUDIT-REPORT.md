# M1-04-01｜六条任职关系写入路径整体回归核验报告

> 子节点：M1-04-01（六路径静态审计与测试证据核验）
> 阶段：B-1-P1｜员工主数据与任职关系收敛 → M1｜任职段写入路径统一
> 分支：`feat/b02-dec-03.13-a02d-status-code`
> 审计基线 HEAD：`5477022c20f3a157168e45fdf9fb9e2bf3ff3a10`
> 报告日期：2026-10-31
> 性质：**只读静态审计 + 测试证据核验**（本轮不修改任何业务代码，仅产出本报告）

---

## 〇、审计方法声明（诚实边界）

- 本报告的结论**全部基于源码静态走读 + 纯 mock 单元测试结果**，未连接任何真实 PostgreSQL 实例。
- 凡是涉及并发、真实行锁竞争、数据库约束的行为，一律标注为「未验证（DB-INT 待核验）」，**不伪称已通过真实数据库验证**。
- 全部六条路径的 `FOR UPDATE`、事务顺序、A/B/C 处理均为**代码路径**事实；真实执行效果需 DB-INT 授权专用测试库后另行验证。

---

## 一、实施前核验（§三 审计基线）

| 核验项 | 实测结果 |
|---|---|
| 当前分支 | `feat/b02-dec-03.13-a02d-status-code` ✅ 与任务基线一致 |
| 当前 HEAD | `5477022c20f3a157168e45fdf9fb9e2bf3ff3a10` ✅ 与审计基线一致 |
| 远端 `ls-remote` | `5477022c20f3a157168e45fdf9fb9e2bf3ff3a10`（ahead 0 / behind 0）✅ |
| 工作区 | 存在 200 项不相关改动（文档/P2-F/ruleEngine/前端等）；**本轮未触碰其中任何一项** |
| `cost.js` 暂存状态 | `A`（staged）✅ |
| `cost.js` MD5 | `e88ae2b0b275346dfc1431408aa00bff` ✅ 与红线要求完全一致 |

基线成立，开始审计。

---

## 二、审计对象与代码事实

统一服务：`server/services/assignmentSegmentService.js`（`writeSegment`，M1-01 落地，M1-02/03 扩展）

| 编号 | 路径 | 代码位置 | 入口事务持有方 |
|---|---|---|---|
| P1 | `assignEmployee`（调岗/入职） | `employeeAssignmentService.js:421` | 自身 `pool.connect` + BEGIN(448) |
| P2 | `rehireEmployee`（返聘） | `employeeAssignmentService.js:667` | 自身 `pool.connect` + BEGIN(682) |
| P3 | `terminateEmployee`（终态登记） | `employeeAssignmentService.js:1085` | 自身 `pool.connect` + BEGIN(1112) |
| P4 | V1 Excel 导入 | `employeeImportService.js`（循环内 525起） | 逐行 BEGIN(528) |
| P5 | V2 花名册导入 | `employeeImportV2Service.js`（循环内 934起） | 外层 BEGIN(928)+逐行 SAVEPOINT(938) |
| P6 | `deleteEmployee`（软删除） | `employeeService.js:616` | 自身 `pool.connect` + BEGIN(619) |

统一服务关键事实（已逐行核对 `assignmentSegmentService.js`）：
- `writeSegment(client, params)` 第 115 行硬性断言 `client.query` 存在 → **禁止内部 `pool.connect`/BEGIN/COMMIT/ROLLBACK**（硬约束 #1）。
- 当前段数量保护 A/B/C 在 `:138-159`：`n===0` 放行 / `n===1` 关闭并 `rowCount!==1` 抛 `SegmentCloseFailedError`（`:145`）/ `n>1` 抛 `SegmentConflictError`。
- 关闭谓词按 scenario 收敛（`buildCloseStatement` `:58`）：`DELETE`(`:60`) 仅改 `is_current/end_date/updated_at` 且 `end_date=CURRENT_DATE`（`:67-68`）、不改 `status`；`TERMINATE`(`:71`) 带 `status=inactive`；`ASSIGN`/`REHIRE`(`:80`) 仅按 id 关闭。
- 建段双形态 INSERT（`:175-227`）：无 V2 扩展列时字节级等价于 M1-01；有 `operation_unit_id`/`dept_name` 时切全参数化形态。

---

## 三、六路径调用链事实（逐条）

### P1 assignEmployee（employeeAssignmentService.js:421-582）
- **锁前快拒（零副作用）**：`:431` `SELECT...WHERE id=$1 AND is_deleted=false`（**无 FOR UPDATE**）读关系，终态则 `:441-444` 直接返回 `-4`，不取连接、不开事务。
- **事务内二次锁定复核**：`:457` `SELECT...FOR UPDATE` 重锁员工并 `:465` 用锁后 `employment_relation` 再判一次（闭合「闸门→BEGIN」竞争窗口，与 terminateEmployee 锁序一致）。
- **当前段读取**：`:472-479` `WHERE employee_id=$1 AND is_current=true AND is_deleted=false`（**不过滤 is_primary，无 FOR UPDATE**）。
- **writeSegment**：`:505` `scenario:'ASSIGN'`，`currentSegments: currentOrgResult.rows`（`:508`，原样传入）。
- **日期**：`:499-501` `endDate = start_date - 1`（JS `toISOString()` UTC 计算）作为关闭 `end_date`。
- **事件**：`:543-560` 在 COMMIT(541) 之后发布 `EMPLOYEE_TRANSFERRED`。
- **释放**：`:579-581` `finally client.release()`。

### P2 rehireEmployee（employeeAssignmentService.js:667-905）
- **锁**：`:687` `SELECT...FOR UPDATE`（首查即锁，无锁前快拒）。
- **关系闸门**：`:697-699` 锁后读关系，`:702` 仅 `RELATION.RETIRED` 可返聘（其余拒绝）。
- **当前段读取**：`:708-712` `WHERE is_current=true AND is_deleted=false`（不过滤 is_primary）；若 `rows.length>0` 直接 `:713-721` 拒绝（数据异常，不自动关闭）。
- **业务必须写关系**：`:794-798` `UPDATE employee SET employment_relation='正式员工'`（返聘正向出口语义，B-02e.5-B2.2；非 DELETE 场景，与 §4.1 不冲突）。
- **writeSegment**：`:808` `scenario:'REHIRE'`，`currentSegments: []`（`:811`，因入口已拒绝存在当前段 → 恒为 A 场景仅建段）。
- **日期**：`:675` `start_date` 为业务显式日期（DT-02 禁 `CURRENT_DATE/NOW` 兜底），`:818` 写入新段。
- **事件**：`:846-867` COMMIT(843) 后发布 `EMPLOYEE_REHIRED`。
- **释放**：`:902-904`。

### P3 terminateEmployee（employeeAssignmentService.js:1085-1315）
- **锁**：`:1117` `SELECT...FOR UPDATE`（含 `is_deleted`）。
- **关系闸门**：`:1135-1157` 锁后读关系，仅 `RELATION.FORMAL` 可终态；null/终态拒绝。
- **当前段读取**：`:1160-1166` `WHERE is_current=true AND is_deleted=false` **且带 `FOR UPDATE`**（六路径中唯一对段读取加锁者）。`:1167-1183` 0 段/多段均拒绝 → 进入 writeSegment 时恒为恰好 1 段。
- **业务必须写关系**：`:1199-1203` `UPDATE employee SET employment_relation=terminalRelation, leave_date=effectiveDate`（终态登记语义）。
- **writeSegment**：`:1214` `scenario:'TERMINATE'`，`currentSegments: curResult.rows`，`closeStatus: TERMINATION_SEGMENT_STATUS`，`endDate: effectiveDate`（业务事件日）。
- **事件**：`:1277-1296` COMMIT(1274) 后发布。
- **释放**：外层 `finally client.release()`。

### P4 V1 Excel 导入（employeeImportService.js:525-777 循环）
- **锁**：既有员工 `:543` `SELECT...employee_code...FOR UPDATE`（带出 `employment_relation`）；新员工 `:635` INSERT 后 `:649` `SELECT id, employment_relation...FOR UPDATE` 补锁。
- **关系闸门**：`:564` 仅对既有员工 `isTerminalRelation(existingEmployee.employment_relation)`（锁后值）判定；新员工无关系跳过。
- **批次去重**：`:523`/`551`/`771` 以稳定 `employee.id` 为键，`COMMIT` 成功后才登记。
- **当前段读取**：`:714-719` `WHERE is_current=true AND is_deleted=false`（不过滤 is_primary，无 FOR UPDATE）。
- **writeSegment**：`:727` `scenario:'ASSIGN'`，`currentSegments: existingEmployee ? curSegRes.rows : []`（`:721`）。
- **日期**：`:723-725` 有 `hire_date` 则 `start-1`，否则 JS UTC `CURRENT_DATE`（**DB-INT 待核验**）。
- **事务边界**：逐行 `BEGIN(528)/COMMIT(768)/ROLLBACK(773)`；函数级 `finally client.release()`（`:778-779`）。

### P5 V2 花名册导入（employeeImportV2Service.js:934-1131 循环）
- **锁**：三条匹配路径 `:946`/`952`/`958` 均 `FOR UPDATE`（带出 `employment_relation`）；新员工 `:985` INSERT 后 `:1035` `SELECT id, employment_relation...FOR UPDATE` 补锁。
- **关系闸门**：`:970` 仅对既有员工 `isTerminalRelation(existingRelation)`（锁后值）。
- **批次去重 + SAVEPOINT 时机**：`:932`/`1038`/`1110-1112` `RELEASE SAVEPOINT` 成功后才将 `employee.id` 登记入 `seenEmployeeIds`（解决 JS 集合无事务回滚能力）。
- **当前段读取**：`:1044-1049` `WHERE is_current=true AND is_primary=true AND is_deleted=false`（**含 `is_primary=true` 过滤——六路径唯一**）。
- **writeSegment**：`:1073` `scenario:'ASSIGN'`，`currentSegments: curSegRes.rows`，`newSegment` 带 `operation_unit_id`/`dept_name`（触发双形态 INSERT）。
- **日期（R1-01 已恢复）**：`:1092` `start_date: p.hire_date || v2EndDate`（`:1071` JS UTC）；`:1096` `endDate: v2EndDate`（JS UTC）。
- **事务边界**：外层 `BEGIN(928)` + 逐行 `SAVEPOINT sp_i(938)`，`ROLLBACK TO SAVEPOINT(1116)` 隔离行失败，外层 `COMMIT(1131)`；`finally client.release()`。

### P6 deleteEmployee（employeeService.js:616-693）
- **锁**：`:622` `SELECT...FOR UPDATE`（含 `is_deleted`）。
- **存在性/未删判定**：`:628-636` 锁后确认；沿用原返回语义 `{error:-2}`。
- **关系读取但不拦截**：`:642` 锁后 `employment_relation` 仅捕获不作闸门（删除不区分 relation，§4.1 守住）。
- **当前段读取**：`:645-651` `WHERE is_current=true AND is_deleted=false`（不过滤 is_primary，无 FOR UPDATE）。
- **writeSegment**：`:659` `scenario:'DELETE'`，`currentSegments: segRes.rows`；`SegmentConflictError`（C 场景）→ `:665-669` 转 `{error:-3}` 业务拒绝 + 回滚。
- **软删**：`:675-683` 在段关闭成功后才执行；`delRes.rowCount===0` → 回滚不提交。
- **日期**：关闭 `end_date=CURRENT_DATE`（DB 语义，由 writeSegment DELETE 场景 `:67-68` 保证）；删除当天为任职终点，不改 `status`。
- **释放**：`:690-692`。

---

## 四、六路径统一审计矩阵（§六）

> 单元格：✅=符合 / ⚠️=存在分歧或待核验 / ❌=不符合 / N/A=不适用。行号为上文引用。

| 审计项 | P1 assign | P2 rehire | P3 terminate | P4 V1 | P5 V2 | P6 delete |
|---|---|---|---|---|---|---|
| 1. 员工行 `FOR UPDATE`（事务内） | ✅ :457 | ✅ :687 | ✅ :1117 | ✅ :543/:649 | ✅ :946/:1035 | ✅ :622 |
| 2. 锁前快拒（零副作用） | ✅ :431/:441 | ❌ 无（首查即锁） | ❌ 无（参数校验在外） | ❌ 无 | ❌ 无 | ❌ 无 |
| 3. `employment_relation` 来自锁后查询 | ✅ :457→:465 | ✅ :687→:697 | ✅ :1117→:1130 | ✅ :543→:564 | ✅ :946→:970 | ✅ :622→:642 |
| 4. 锁后关系闸门复核 | ✅ :465 | ✅ :702 | ✅ :1135 | ✅ :564 | ✅ :970 | ❌ 不拦截（设计如此 §4.1） |
| 5. 当前段 WHERE（is_current+is_deleted） | ✅ :472 | ✅ :708 | ✅ :1160 | ✅ :714 | ✅ :1044 | ✅ :645 |
| 6. 当前段 `is_primary` 过滤 | ❌ 不过滤 | ❌ 不过滤 | ❌ 不过滤 | ❌ 不过滤 | ⚠️ **过滤=true（唯一）** | ❌ 不过滤 |
| 7. 当前段读取 `FOR UPDATE` | ❌ 无 | ❌ 无（仅存在性判拒） | ✅ :1160 | ❌ 无 | ❌ 无 | ❌ 无 |
| 8. `currentSegments` 原样传入 writeSegment | ✅ :508 | ✅ :811([]) | ✅ :1217 | ✅ :721 | ✅ :1076 | ✅ :662 |
| 9. 调用 writeSegment scenario | ASSIGN :507 | REHIRE :810 | TERMINATE :1216 | ASSIGN :729 | ASSIGN :1075 | DELETE :661 |
| 10. A/B/C 处理 | writeSegment 统一 | 入口预拒>0→恒A | 入口预筛0/>1→恒B | writeSegment 统一 | writeSegment 统一（**仅主岗子集**） | writeSegment 统一 |
| 11. 关闭 `rowCount===1` 校验 | ✅ | N/A（不关） | ✅ | ✅ | ✅ | ✅ |
| 12. BEGIN/COMMIT/ROLLBACK 归属 | 本函数 | 本函数 | 本函数 | 逐行本函数 | 外层+SAVEPOINT | 本函数 |
| 13. writeSegment 仅用调用方 client | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 14. 关闭失败阻止新段/软删 | ✅ :521 | N/A | N/A | ✅ :743 | ✅ :1098 | ✅ :659 先于 :675 |
| 15. 新段/段失败回滚旧段关闭 | ✅ 同事务 | ✅ :900 | ✅ catch | ✅ 同事务 | ✅ ROLLBACK TO SP | ✅ |
| 16. 关系/软删写入失败回滚 | N/A | ✅ :799 | ✅ :1204 | N/A | N/A | ✅ :679 |
| 17. 事件在 COMMIT 后 | ✅ :543 | ✅ :846 | ✅ :1277 | ❌ 无事件 | ❌ 无事件 | ❌ 无事件 |
| 18. `finally` 释放连接 | ✅ :579 | ✅ :902 | ✅ | ✅ :778 | ✅ :1167 | ✅ :690 |
| 19. 批次隔离 | 单员工 | 单员工 | 单员工 | 逐行事务 | SAVEPOINT 逐行 | 单员工 |
| 20. 日期语义（关闭 end_date / 新段 start） | start-1(UTC) / 上传 | N/A / 业务日 | 业务日 / N/A | start-1 或 UTC / 上传 | UTC / hire∨UTC | CURRENT_DATE / N/A |
| 21. 不改 `employment_relation`（除非业务必须） | ✅ | ⚠️ **必须改**（返聘语义） | ⚠️ **必须改**（终态语义） | ✅ | ✅ | ✅ |
| 22. DELETE 不改 `status` | N/A | N/A | N/A | N/A | N/A | ✅ :61-70 |
| 23. 测试证据性质 | mock | mock | mock | mock | mock | mock |

---

## 五、审计发现（F-01 ~ F-08）

### F-01 ⚠️【分歧·待评估】V2 当前段读取 `is_primary=true` 过滤与其他五路径不一致
- **事实**：仅 P5（`:1044-1049`）过滤 `is_primary=true`；P1/P2/P3/P4/P6 均读「全部当前段」。
- **潜在后果**：若某员工存在「非主岗当前段」但无「主岗当前段」，V2 视 `currentSegments=0` → 走 A 场景直接新建主岗段，**遗留非主岗当前段未关闭**；而 P1/P3/P4/P6 读全部当前段会进入 B/C（P6 在 C>1 时拒删，P1/P3 在 C 时拒）。
- **判定**：属 V2 既有业务设计（花名册导入侧重主岗维护），但与管理组织主岗唯一性/当前段口径存在潜在冲突。
- **处置**：本轮为**审计**，不修改。登记为待 M1-05 或专门节点评估是否统一；不得自行把 `is_primary` 删除或 reinterpret 为作业单元唯一性标志（遵守任务 §4.2）。

### F-02 ⚠️【minor·待评估】当前段读取 `FOR UPDATE` 仅 P3 持有
- **事实**：仅 `terminateEmployee:1160` 对当前段读取加 `FOR UPDATE`；其余路径靠「员工行 FOR UPDATE 串行化同员工全部操作 + writeSegment 按 id 关闭 + `rowCount===1` 守卫」实现乐观并发安全。
- **评估**：员工行锁已消除同员工跨路径的段读取竞争窗口；`rowCount` 守卫兜底并发修改 → 功能安全，但风格不一致。
- **处置**：登记，不在本轮修改；如需强化可于 DB-INT 验证后统一。

### F-03 ⚠️【已知 DB-INT·待验证】JS UTC 日期替代 DB `CURRENT_DATE`
- **事实**：P1（`:501`）、P4（`:725`）、P5（`:1071/:1092/:1096`）在缺失业务日期时使用 `new Date().toISOString().split('T')[0]`（JS UTC 日期）作为关闭 `end_date` 或新段 `start_date`。
- **对比**：P6 DELETE 已正确使用 DB `CURRENT_DATE`（`:67-68`）；P3 用业务显式事件日。
- **判定**：UTC 与 DB `CURRENT_DATE` 存在时区差异风险，M1-02-R1 已登记为 DB-INT 待核验项。本轮**不擅自修复**，仅确认现状。

### F-04 ✅【一致】六路径 scenario 映射全部正确
ASSIGN(P1)/REHIRE(P2)/TERMINATE(P3)/ASSIGN(P4)/ASSIGN(P5)/DELETE(P6) 与任务 §4.3 预期表完全一致，无代码偏离。

### F-05 ✅【一致】六路径均在事务内锁员工行，且无 writeSegment 之外的任职段直接 UPDATE/INSERT
全局检索确认：六路径任职段写入**唯一**出口为 `writeSegment`；无散落 `UPDATE employee_assignment`/`INSERT INTO employee_assignment`（P6 旧代码的直接 UPDATE 已在 M1-03 移除）。

### F-06 ✅【一致】关系闸门全部基于锁后权威 `employment_relation`
P1 两道闸门（`:441` 锁前快拒 + `:465` 锁后复核）、P2/P3 锁后判定、P4/P5 锁后 `existingRelation`、P6 锁后读取（不拦截，符合 §4.1）。

### F-07 ✅【一致】事件发布均在 COMMIT 之后；P4/P5/P6 无 EMPLOYEE_* 业务事件
P1/P2/P3 事件在 COMMIT 后（`:543/:846/:1277`）；P4/P5/P6 仅写历史/审计，不发布内存事件（与导入/删除语义一致）。

### F-08 ✅【一致】`finally` 释放连接、writeSegment 仅用调用方 client、无内连/嵌套事务
六路径均 `pool.connect` 自持事务、`finally client.release()`；`writeSegment:115` 硬性拒绝内部连接。

---

## 六、测试证据审计（§五）

### 6.1 实际测试文件清单（员工/任职域）
| 文件 | 覆盖路径 |
|---|---|
| `assignmentSegmentService.unit.test.js` | 统一服务 A/B/C、双形态 INSERT、四 scenario |
| `employee-assignment-terminal-guard.unit.test.js` | P1 关系闸门（锁前/锁后、并发栅栏） |
| `employee-rehire.unit.test.js` | P2 返聘资格/段/关系 |
| `employee-terminate.unit.test.js` | P3 终态登记/段关闭 |
| `employee-import-v1-terminal-guard.unit.test.js` | P4 终态防复活闸门 |
| `employee-import-v2-terminal-guard.unit.test.js` | P5 三匹配路径/SAVEPOINT |
| `employee-delete-transaction.unit.test.js` | P6 事务边界（扩展于 M1-03） |
| `m1-02-import-segment-unification.unit.test.js` | P4/P5 锁+批次去重+SAVEPOINT（含 R1 日期） |
| `m1-03-delete-employee-segment-unification.unit.test.js` | P6 A/B/C/锁/原子性（28 例） |
| `employee-status-code/relation-d1/selection-formal-gate/import-v2-purge-guard` 等 | 关系字典/选择器/清理守卫 |

### 6.2 测试命令与结果
**员工域回归命令**：
```
cd server && npx jest --testPathPatterns="(employee-|assignmentSegmentService|m1-0)"
```
**结果**：`Test Suites: 13 passed, 13 total` / `Tests: 336 passed, 336 total`（与 M1-03 基线 336 一致，**零回退**）。

**整仓基线命令**：
```
cd server && npx jest
```
**结果**：`Test Suites: 8 failed, 40 passed, 48 total` / `Tests: 3 failed, 845 passed, 848 total` / `Time: 31.37s`。

### 6.3 失败套件/用例区分（§五 要求）
| 失败项 | 性质 | 是否本轮新增 |
|---|---|---|
| `services/ruleEngine/__tests__/violationAdapter.unit.test.js`（1 例失败） | 已知基线（ruleEngine 域，与任职无关） | 否 |
| `services/ai/aiCapabilityLayer.unit.test.js`（2 例失败） | 已知基线（AI 域，与任职无关） | 否 |
| `routes/vehicles`、`routes/import`、`auth-gate`、`import-personnel-behavior`、`personnel-insurance`、`insurance-file`（6 套件 "failed to run"） | 已知基线（Jest worker OOM / babel transform 崩溃，与任职无关） | 否 |

**结论**：本轮未改动任何业务代码，**整仓失败数与 M1-03 已知基线逐字节一致（8 套件 / 3 用例），0 新增失败**。

### 6.4 测试性质分层（诚实声明）
- **纯 mock 单元测试**：上述全部员工域测试均为 mock `client.query`，断言 SQL 文本与参数，**不连接真实数据库**。
- **真实 PostgreSQL 集成测试**：**未找到**（本仓库员工域无 DB 集成测试）。
- **真实并发测试**：**未做**（行锁 `FOR UPDATE` 的真实并发串行化、多事务竞争关闭等仅以代码路径+rowCount 守卫证明，**未验证**）。

---

## 七、事务顺序与锁定证据（§要求）

六路径事务顺序均满足「锁员工 → 锁后读关系 → 锁后读当前段 → writeSegment → 业务写（软删/关系/历史）→ COMMIT → 事件」骨架（P2/P3 在 writeSegment 前还有关系/历史前置写，但均在锁内）。DELETE 场景（P6）证据：
- 锁员工 `:622` → 锁后关系 `:642`（不拦截）→ 读当前段 `:645` → `writeSegment(DELETE)` `:659` → 软删 `:675` → COMMIT `:685` → `finally` `:690`。
- DELETE 关闭由统一服务 `buildCloseStatement` 的 `DELETE` 分支（`:60-70`）执行，仅改 `is_current/end_date/updated_at`，`end_date=CURRENT_DATE`，**不改 `status`、不改 `employment_relation`**。

---

## 八、A/B/C 当前段处理证据（§要求）

| 路径 | A=0 | B=1 | C>1 |
|---|---|---|---|
| P1 | writeSegment 放行（建段） | 关闭+rowCount 校验 | `SegmentConflictError`→`:523` 转 `-4` 回滚 |
| P2 | 恒 A（入口已拒>0，传 `[]`） | N/A | 入口 `:713` 直接拒（数据异常） |
| P3 | 入口 `:1167` 拒 | 入口保 1 段→writeSegment B | 入口 `:1175` 拒 |
| P4 | 新员工传 `[]` | writeSegment B | writeSegment C→抛→ROLLBACK |
| P5 | 主岗子集 0→A | 主岗子集 1→B | 主岗子集>1→C（**仅主岗口径**，见 F-01） |
| P6 | 不关闭 | 关闭+rowCount | `SegmentConflictError`→`:665` 转 `-3` 回滚 |

统一服务 `:138-159` 为唯一 A/B/C 裁决点；各路径仅做"业务前置筛选"（P2/P3 拒绝异常段），不自行绕过统一服务。

---

## 九、删除日期语义保持证据（§要求）

- P6 软删除：`:675` `UPDATE employee SET is_deleted=true ... WHERE id=$1 AND is_deleted=false RETURNING id,name`（保留原返回结构 `{audit:{id,name}}`/`{error:-2}`）。
- 关闭 `end_date`：由 `writeSegment` DELETE 场景 `:67` `end_date = CURRENT_DATE`（**数据库语义，非 JS UTC**），与任务 §4.2「删除当天作为任职段终止日期、不得改 `start_date-1`、不得用 JS UTC 替代」完全一致。
- 删除**不改**任职段 `status`（`:61-70` 仅 `is_current/end_date/updated_at`），满足 §4.2 与 §4.4。

---

## 十、回滚路径与异常处理（§要求）

- **任职段关闭失败**：B 场景 `rowCount!==1` → `SegmentCloseFailedError`；P1 `:521`、P6 `:670` 交由外层 `catch` → `ROLLBACK`；P4 `:743`、P5 `:1098` 原样上抛至行级 `catch` → `ROLLBACK`/`ROLLBACK TO SAVEPOINT`。
- **关闭成功但业务写失败**：软删/关系/历史任一 `rowCount===0` 或抛异常 → 同事务整体 `ROLLBACK`（P6 `:679`、P2 `:799`、P3 `:1204`、P1 历史在 COMMIT 前抛 → `:577` ROLLBACK）。
- **C 场景（多当前段）**：`SegmentConflictError` → P1/P4/P5 转业务冲突返回；P6 `:665` 转 `{error:-3}`；均先 `ROLLBACK` 不提交。
- **事件发布失败**：`:558/:865/:1294` 仅 `console.warn`，**不回滚已完成事务**（事件与 DB 事务解耦，符合 §4.4）。
- **连接释放**：六路径均在 `finally` `client.release()`（P4/P5 在函数级 `finally`）。

---

## 十一、cost.js 保护核对（§要求）

| 项 | 审计前 | 审计后 |
|---|---|---|
| 暂存状态 | `A`（staged） | `A`（staged，未变） |
| MD5 | `e88ae2b0b275346dfc1431408aa00bff` | `e88ae2b0b275346dfc1431408aa00bff` ✅ 一致 |
| 是否提交/推送 | 否 | 否 |

本轮只读审计，**未修改、未暂存、未提交、未推送 `cost.js`**。

---

## 十二、Git 提交与远端推送证据（§要求）

- 本轮**未修改任何业务代码** → 无业务提交。
- 仅新增本报告文件 `docs/project-control/M1-04/M1-04-01-SIX-PATHS-ASSIGNMENT-REGRESSION-AUDIT-REPORT.md`（单独提交，见下）。
- 基线 HEAD：`5477022c20f3a157168e45fdf9fb9e2bf3ff3a10`
- 报告提交 SHA：`<REPORT_SHA>`
- 远端 `ls-remote`：`5477022...` → 推送后远端 = 本地 HEAD（ahead/behind 视提交而定）。
- 工作区其余 200 项不相关改动原样保留，未清理、未覆盖。

---

## 十三、未解决问题与风险（§要求）

1. **F-01 V2 `is_primary` 过滤分歧**：需 M1-05 或专门节点评估是否统一当前段口径；当前不影响单路径正确性，但跨路径语义不一致。
2. **F-02 段读取锁不一致**：功能安全（员工行锁+rowCount 守卫），可于 DB-INT 后统一。
3. **F-03 JS UTC 日期（DB-INT）**：P1/P4/P5 缺失业务日期时用 JS UTC 替代 DB `CURRENT_DATE`，时区风险待真实库验证。
4. **真实并发验证缺失**：六路径 `FOR UPDATE` 真实串行化、多事务竞争关闭效果**未验证**，属 DB-INT 范畴。
5. **C 场景根因未治理**：多 `is_current=true` 段的数据异常来源（导入重复/复活路径）不在本节点范围，仅拒绝+回滚。

---

## 十四、自检结论（Trae 自检，不替代独立验收）

- 六路径**全部**在事务内锁定员工行，关系闸门均基于锁后权威 `employment_relation`（P6 按 §4.1 不拦截）。
- 当前段读取五路径一致（不过滤 is_primary），**唯一分歧为 V2 的 `is_primary=true` 过滤（F-01）**，已登记待评估。
- A/B/C 裁决统一收敛于 `writeSegment:138-159`，各路径仅做业务前置筛选，无绕过。
- scenario 映射与任务 §4.3 完全一致；DELETE 场景正确复用统一服务且不改 `status`/`employment_relation`。
- 删除日期语义保持 DB `CURRENT_DATE`，符合 §4.2。
- 测试：员工域 13 套件 / 336 用例全绿（零回退）；整仓 8 失败套件 / 3 失败用例 = 已知基线，0 新增。
- **所有结论均为静态审计 + mock 测试，真实 PG 并发未验证。**

---

## 十五、停止声明

本轮为 M1-04-01 只读审计，已按任务完成六路径静态审计与测试证据核验，业务代码零修改，`cost.js` 红线严守。业务+报告分别提交（本报告单独提交）并推送后立即停止，**不自行进入 M1-04 后续子节点或 M1-05**。等待独立审查实际代码、提交差异与本报告。
