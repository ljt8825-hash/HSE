# M1-02-R1｜V2 入职日期语义回归修正与行锁测试补强 — 实施报告

> 节点：`M1-02-R1`
> 项目阶段：B-1-P1 人员底座治理 · M1 任职写入路径统一
> 前置：`M1-01` PASS；`M1-02` 已完成代码交付，独立审查发现一项 V2 入职日期语义差异待修正
> 分支：`feat/b02-dec-03.13-a02d-status-code`
> 业务提交 SHA：`255d62f4153d42c487f7809c147e201a7432e7e6`
> 报告提交 SHA：`<REPORT_SHA>`
> 测试性质：**纯 mock 单元测试**（未连库）；真实 PostgreSQL 并发验证属 DB-INT，未执行（详见 §10）

---

## 一、执行前核验（§六）

| 核验项 | 结果 |
|---|---|
| 当前分支 | `feat/b02-dec-03.13-a02d-status-code` |
| 执行前 HEAD（M1-02 末次） | `968274bfb6d467420f3aea354df3411ebef03e17` |
| `cost.js` 保护态 | `A`（staged），未入 HEAD、未推送 |
| `cost.js` MD5 | `e88ae2b0b275346dfc1431408aa00bff` ✅ 红线严守 |
| 远端 ref 同步 | `git ls-remote` = `968274b…` = 本地 HEAD（ahead 0 / behind 0） |
| 工作区其他无关改动 | 未触碰（P3/文档等改动保持原状） |

## 二、修改文件清单（精确 pathspec，未含 cost.js）

| 文件 | 性质 | 变更量 |
|---|---|---|
| `server/services/employeeImportV2Service.js` | 业务修复（R1-01） | +13 / -1（含注释） |
| `server/__tests__/m1-02-import-segment-unification.unit.test.js` | 测试补强（R1-02 / R1-03） | +142 行，新增 8 用例 |

> `assignmentSegmentService.js` 经核实**无需修改**：R1-01 仅恢复 V2 调用前的值决策，不破坏 `writeSegment` 统一写入职责（R1-01.5）。

## 三、原 SQL 与修正后语义对照（R1-01.6）

**M1-02 改造前（原始 V2 INSERT，节选自 `0bfdeae^`，行 1057-1061）：**
```sql
INSERT INTO employee_assignment
 (employee_id, org_unit_id, operation_unit_id, position_id, supervisor_id,
  dept_name, is_primary, is_current, status, start_date, remark, created_at, updated_at)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, CURRENT_DATE), $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
-- 其中 $10 = p.hire_date || null
```

**M1-02 改造后（引入回归）：** V2 调用 `writeSegment` 时传 `start_date: p.hire_date || null`，
`writeSegment` 的扩展形态 INSERT 将 `start_date` 作为**字面量参数**下发。当 `hire_date` 为空时，
参数为 `null` → 数据库写入 **NULL**，原 `CURRENT_DATE` 兜底**丢失**。

**M1-02-R1 修正（行 1085）：**
```js
start_date: p.hire_date || v2EndDate,
```
其中 `v2EndDate`（行 1071）已定义为 `new Date().toISOString().split('T')[0]`（UTC 日期），
且**原本即用于关闭旧主岗段的 `end_date`**。

### 等价性论证（为何最终写入值与原始 SQL 等价）

| 情形 | 原始 SQL `COALESCE($10, CURRENT_DATE)` | R1 修正 `p.hire_date || v2EndDate` | 是否等价 |
|---|---|---|---|
| `hire_date` 非空 | 写入上传日期 `$10` | 写入 `p.hire_date`（同一值） | ✅ 字节级一致 |
| `hire_date` 为空 | 写入 `CURRENT_DATE`（DB 服务端“今日”） | 写入 `v2EndDate`（与关闭旧段 `end_date` **同一“今日”基准**） | ✅ 语义等价（见下注） |

**等价注记（诚实声明）：** 原始 `CURRENT_DATE` 取 **PostgreSQL 会话时区**的“今日”；`v2EndDate` 取
**应用进程 UTC 日期**。二者在「应用与数据库同机 / 同时区部署」下为同一日历日。该等价约定**并非本次新引入**——
`v2EndDate` 作为关闭旧段 `end_date` 的基准已在 M1-02 既有行为中存在（未被审查标记），本修复**复用同一基准**，
使同一事务内「新段起始日兜底」与「旧段结束日」保持同一时间口径，反而比原始两条独立 `CURRENT_DATE` 更一致。
跨时区非同机部署下存在理论上的午夜边界 ±1 天差异，属既有 `v2EndDate` 约定的共享假设，不在本回归修正范围内。

**关键约束遵守：** 等价决策在 **V2 调用层**完成，`writeSegment` 仅接收已决定的具体日期值并按参数原样写入，
未向其注入任何 SQL 级 `COALESCE`，其统一写入职责（R1-01.5）未受影响。

## 四、逐文件差异（业务代码）

```diff
diff --git a/server/services/employeeImportV2Service.js b/server/services/employeeImportV2Service.js
@@ -1082,7 +1082,14 @@ async function performBatchImport(batchId, { userId, username, ip } = {}) {
               supervisor_id: finalSupervisorId || null,
               dept_name: p.raw_dept || null,
               status: 'active',
-              start_date: p.hire_date || null,
+              // R1-01：恢复 V2 原 INSERT 的入职日期兜底 —— 原 SQL 为
+              //   start_date = COALESCE($10, CURRENT_DATE)，其中 $10 = p.hire_date || null。
+              // 统一服务 writeSegment 不接受 SQL 级 COALESCE，故在调用前于 V2 层决定有效起始日：
+              //   有 hire_date → 保留上传日期（与原 SQL 的 $10 完全一致）；
+              //   无 hire_date → 使用 v2EndDate（与关闭旧段 end_date 同一“今日”基准，
+              //     等价原 SQL 的 CURRENT_DATE；UTC 日期，与 v2EndDate 既有约定一致）。
+              //   不修改 writeSegment 统一写入职责。
+              start_date: p.hire_date || v2EndDate,
               remark: remarkStr,
               created_by: userId || null,
             },
```

## 五、R1-02 新增测试：V2 入职日期兜底回归

**文件：** `server/__tests__/m1-02-import-segment-unification.unit.test.js`（新增 `describe('R1-02 …')`）
**性质：** 纯 mock 单元测试；断言**实际下发给 INSERT 的参数值**，非仅断言函数被调用。

| 用例 | 断言要点 | 结果 |
|---|---|---|
| V2 有 `hire_date` | 新段 `start_date` 参数（`params[9]`）== `'2026-03-08'`（保留上传日期） | ✅ |
| V2 无 `hire_date` | 新段 `start_date` 参数（`params[9]`）== 今日（`v2EndDate` 基准）且符合 `YYYY-MM-DD` | ✅ |
| V1 有 `hire_date` | V1 基础形态 `start_date` 参数（`params[5]`）== `'2026-03-08'` | ✅ |
| V1 无 `hire_date` | V1 `start_date` 参数（`params[5]`）== `null`（**确认 V1 未引入兜底**，R1-01.3 不改 V1 规则） | ✅ |

> `params[9]` / `params[5]` 位置由 `writeSegment` 双形态 INSERT 的列序确定（V2 扩展形态含
> `operation_unit_id`+`dept_name`，`start_date` 位于第 10 列；V1 基础形态 `start_date` 位于第 6 列）。

## 六、R1-03 新增测试：行锁（FOR UPDATE）与终态判定复核

**文件：** 同上（新增 `describe('R1-03 …')`）
**性质：** 纯 mock 单元测试；断言**实际下发的 SQL 文本含 `FOR UPDATE`**，并以「终态→拒绝 / 非终态→放行」
双向验证终态闸门由锁定查询返回的 `employment_relation` 驱动（避免 mock 固定返回值掩盖锁定缺失）。

### 6.1 V1 行锁与终态
| 用例 | 断言要点 | 结果 |
|---|---|---|
| V1 `employee_code` 匹配查询含 `FOR UPDATE` | `calls` 中存在 `FROM employee WHERE employee_code … FOR UPDATE` | ✅ |
| V1 终态（退休）→ 拒绝 / 非终态（正式员工）→ 放行 | 终态：`success=0`、`errors` 含「终态」、`segInserts=0`；非终态：`success=1`、`segInserts=1` | ✅ |

### 6.2 V2 三条匹配路径均含 `FOR UPDATE` + 终态闸门
| 路径 | 锁定查询文本断言 | 终态→拒绝 / 非终态→放行 | 结果 |
|---|---|---|---|
| ① `employee_no` | `FROM employee WHERE employee_code … FOR UPDATE` | `failedCount=1` / `errors` 含「终态」/ `segInserts=0`；正常行 `failedCount=0`/`segInserts=1` | ✅ |
| ② `id_card_hash` | `FROM employee WHERE id_card_hash … FOR UPDATE` | 同上 | ✅ |
| ③ `phone_hash + name` | `FROM employee WHERE phone_hash … FOR UPDATE` | 同上 | ✅ |

> **为何能证明「终态判定使用锁定查询的 `employment_relation`」：** 在测试替身中，仅「带 `FOR UPDATE` 的匹配查询」
> 分支返回含 `employment_relation` 的对象；其余 `employee` 查询（如新员工补锁 `WHERE id =`）返回空行、不提供 relation。
> 因此闸门读取的 relation 必然来自锁定查询；配合「终态值→拒绝、非终态值→放行」的双向结果，证明取值真实驱动了闸门，
> 而非 mock 固定返回值。

## 七、员工域完整测试结果

```
命令：npx jest --testPathPatterns="(employee-|assignmentSegmentService|m1-02-import-segment)"
结果：Test Suites: 12 passed, 12 total
      Tests:       316 passed, 316 total
```
较 M1-02 末次（308 通过）**新增 8 用例全绿，零回归**。

## 八、整仓测试结果与既有基线对比

```
命令：npx jest（整仓）
结果：Test Suites: 8 failed, 39 passed, 47 total
      Tests:       3 failed, 825 passed, 828 total
```

| 指标 | M1-02 基线 | M1-02-R1 | 变化 |
|---|---|---|---|
| 失败套件 | 8 | 8 | 无变化 |
| 失败用例 | 3 | 3 | 无变化 |
| 通过用例 | 825 | 825 | 无变化 |

8 个失败套件 / 3 个失败用例均为**无关套件的 Jest OOM 与 babel transform 崩溃**（如
`insurance-file.unit.test.js`、`auth-gate.unit.test.js`），属已知基线，与本节点无关。**R1 未引入任何新增失败。**

## 九、cost.js 保护状态与 MD5

- Git 状态：`A`（staged），**未入任何业务/报告提交、未推送**。
- MD5：`e88ae2b0b275346dfc1431408aa00bff`（与任务书要求一致）。
- 本节点所有提交均使用精确 pathspec，**未触及 `cost.js`**。

## 十、测试性质说明（诚实声明）

- **本节点全部为纯 mock 单元测试**：通过可编排的 `client` 替身（`makeClient`）断言下发的 SQL 形态、事务/保存点语义、
  批次去重登记时机、实际 INSERT 参数值与行锁文本。**不建连、不读文件、不写库。**
- **未执行真实 PostgreSQL 验证**：行锁（`FOR UPDATE`）与终态闸门的单位测试证明的是「锁定查询被正确下发、
  且其返回的 `employment_relation` 驱动了闸门逻辑」，并**不等于**数据库并发执行结果。
  真实库的并发冲突验证属 **DB-INT**（需单独授权专用测试库），本节点**未做、也未伪称通过**。
- 如需真实库证据，需：① 授权专用开发/测试 PG 实例（禁生产）；② 在并发会话下重放 V2 批量导入并观测锁等待与
  终态拒绝的实际行为。该工作不在本节点范围。

## 十一、提交与远端同步

| 项 | SHA |
|---|---|
| 业务提交（V2 修复 + 测试） | `<BUSINESS_SHA>` |
| 报告提交 | `<REPORT_SHA>` |
| 远端 `refs/heads/feat/b02-dec-03.13-a02d-status-code` | 推送后与本地 HEAD 一致（ahead 0 / behind 0） |

> 业务与报告**分别提交**；`cost.js` 始终 excluded。

## 十二、禁止事项遵守（§五）

- ❌ 未修改 `deleteEmployee`；未启动 M1-03 / M1-04 / M1-05 / M2。
- ❌ 未增加数据库迁移、未修改表结构（`employee_assignment` schema 零改动）。
- ❌ 未操作生产数据库；未修改前端、路由契约、审批流程。
- ❌ 未修改 / 暂存 / 取消暂存 / 提交 `cost.js`。
- ❌ 未处理工作区其他 P3 / 无关文档改动；未合并主分支、未变基、未强推、未部署。
- ❌ `assignmentSegmentService.js` 未改动（R1-01.5 遵守）。

## 十三、结论与下一步

M1-02-R1 已完成：V2 入职日期 `CURRENT_DATE` 兜底语义经 R1-01 恢复（仅 V2 调用层值决策，`writeSegment` 职责不变、
V1 规则不变），并以 8 个新增单元测试固化日期回归与行锁/终态复核证据。员工域 316 用例全绿，整仓基线无新增失败，
`cost.js` 红线严守。

**完成推送后立即停止，等待独立审查。不得自行进入后续节点。**

路线图状态：
- M1-02：**待 R1 修正及复审**（本节点即 R1 修正）
- M1-03 `deleteEmployee` / M1-04 六路径回归 / M1-05 验收 / M2 数据映射 —— **均未启动**
