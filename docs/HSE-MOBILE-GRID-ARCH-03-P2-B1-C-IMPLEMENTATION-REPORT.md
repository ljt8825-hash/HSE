# HSE-MOBILE-GRID-ARCH-03-P2-B1-C 实现报告

**阶段**：P2-B1-C · WPS 云端缓冲身份捕获与可信归属解决
**性质**：IMPLEMENTATION READINESS + MINIMAL IDENTITY CAPABILITY VERIFICATION（仅 dev 库；生产零触碰）
**时间**：2026-09-12
**前置**：P2-B0 / P2-B0-CONT（基础设施落 dev）、P2-B1-A（审计）、P2-B1-B（enrichment + 探针）

---

## 0. ⚠️ 对 P2-B1-A / P2-B1-B 结论的重要更正

前两阶段的结论「`list_by_page` 无 creator / Creator 不可得」**不准确，本阶段实测更正**：

- `list_by_page` 在 `show_record_extra_info:true`（**项目现有调用已带此参数**）时，原始记录**确实包含**：
  ```
  { id, fields, created_time, creator, last_modified_by, last_modified_time }
  ```
- 实测原始样本：`creator = "1901573333"`、`last_modified_by = "1901573333"`。
- 之所以此前判定「无 creator」，是因为 `wpsClient.buildRecord()` 只挑 `{ id, fields, lastModifiedTime, createdTime }`，
  **把 `creator` / `last_modified_by` 丢弃了** —— 信息可**得**，只是被归一化层丢掉。
  （`list_by_page` 早前「挂起」亦复现为网络环境偶发；本阶段实测 HTTP 200 / 196ms。）

**⇒ CASE 判定修正：CASE A（返回稳定 WPS account ID）成立。** 但见 §3：该 ID 是**共享账号**，不是提交者。

---

## 1. Creator 能力真实结果

| 项 | 结果 |
|---|---|
| 原始返回是否含 creator | **是**（`record.creator`，稳定数值串） |
| 是否含 last_modified_by | 是（与 creator 恒等） |
| 项目 client 是否暴露 | **否** —— `buildRecord()` 丢弃（未冻结文件，但本阶段按 §十三 未改它） |
| 本阶段取用方式 | 新增只读提取器 `server/services/wps/wpsCreatorExtractor.js`，直接经 `wpsClient.request` 取**原始** `data.records`，绕开 `buildRecord` 的归一化丢弃 |
| 200 条样本 distinct creator | **1**（`1901573333`） |
| 200 条样本 distinct 姓名 | **58** |
| creator === last_modified_by | 200/200 恒真 |
| `巡查人员ID` 列 | schema 存在，但 **200/200 记录为空**（该列从未被写入） |

**结论**：字段**存在且稳定**，但**指向单一共享账号**，不区分提交者 → **不能作为逐条提交者身份**。

## 2. Form Creator 能力结果

- `GET /v7/coop/dbsheet/cn229thwalDs/schema` 实测：该 sheet **仅 1 个视图** —— `{ id:'C', name:'表格视图', type:'Grid' }`，**没有表单视图（Form）注册**。
- 29 个字段全名扫描：`patternHit = false`（无 creator / 创建人 / submitter / account / operator / 用户ID 类字段）。
- 候选只读端点（`/sheets/{id}`、`/sheets/{id}/views`、`/sheets/{id}/fields`、`/files/{fileId}`、`/records`）实测**全部 HTTP 404**。
- ⇒ 无法从 API 侧观察「表单视图/创建人」高级字段配置。

**结构化判定**：
- CASE A（返稳定 account ID）：**成立**（§1），但仅限「共享账号」，非提交者。
- CASE B（表单元数据提供提交用户）：**UNVERIFIED** —— 当前 sheet 无 Form 视图、API 不暴露表单元数据。
- CASE C（「创建人」仅 UI 可见）：**CREATOR_VISIBLE_ONLY_IN_UI**（在表单视图存在时适用；当前无表单视图，故无从验证）。
- CASE D（可写业务字段伪装身份）：`巡查人员ID` 属**可自由填写的业务字段**且当前为空 ⇒ 若未来用它承载身份，必须判定 **UNTRUSTED_BUSINESS_FIELD**，**严禁**据此写 `inspector_employee_id`。

## 3. 是否存在可信 WPS Account ID

**当前数据下：不存在「可信逐条身份」。** 依据（实测）：

```
sampled=200  distinctCreators=1  distinctNames=58
creatorToManyNames = [{ creator:"1901573333", nameCount:58 }]
creatorEqualsLastModifiedAll = true
```

单一账号覆盖 58 个不同提交人 ⇒ 该 creator 是**应用/数据属主账号**（与「手机→HSE Backend→WPS 用应用凭证写入」的解释一致），
**不是**提交者本人 ⇒ 对身份归属**不可用**。

> 提取器据此内置数据集级判定 `assessCreatorTrust()`：
> `distinctCreators==1 && distinctNames>1` ⇒ `shared_account`（⇒ 状态 UNTRUSTED）；
> `distinctCreators>1` ⇒ `per_submitter_candidate`（候选，仍**必须**人工核验桥接）。

## 4. 是否可以与 Record 一一对应

- creator **随 Record 返回**，是**逐条**属性（`record.creator`），形式上与 Record 一一对应。
- 但语义上对应的是「写入该 Record 的账号」（共享），**不**对应「业务提交人」。
- ⇒ **字段级一一对应成立；身份语义级一一对应不成立**（当前数据）。

## 5. 是否存在可信 Form→Record 关系

**UNVERIFIED_FORM_RECORD_BINDING**（§十）。
理由：当前 sheet 无 Form 视图、无历史表单来源记录；无法证明「某次表单提交 ↔ 某条 WPS Record」。
在生产表单启用并通过一次真实提交取得**不同 creator**之前，**不得**建立 creator→PG inspector 的自动链路。

## 6. bridge 结果

- 表 `wps_account_employee_map` 存在，**当前 0 行**（从未插入任何推测/姓名映射）。
- 本阶段最小修正（§七.3 要求「多 mapping → pending」）：
  `lookupEmployeeByWpsAccount()` 由 `LIMIT 1` 改为取 2 条，**仅在恰好 1 条 active 映射时**返回；0 条或 >1 条一律返回 null（**绝不任选其一**）。
- 测试（C）：注入 `c_acct_C → employee 7707 (active)` → 正确解析 `employee_id=7707`。
- 测试（H）：`status='pending'` 映射 → 忽略 → PENDING_BRIDGE。
- 测试（H2）：同账号 2 条 active 映射 → 拒绝 → PENDING_BRIDGE。
- 测试（F/G）：以**姓名** `张运志`、**昵称** `柴胡店一区李春福` 作为 wps_account_id → 均无命中 → PENDING_BRIDGE（**姓名/昵称匹配被证伪**）。
- 测试（X1）：bridge → 不存在员工 `7787886` → PENDING_EMPLOYEE。

## 7. gridScope 结果

- `employee.id → gridScope.deriveGridIdForEmployee()` 未改动（冻结文件）。
- 测试（C）：employee 7707 精确 1 live grid → `ok` → `grid_id=19` 写入（仅补 NULL）。
- 测试（D）：employee 6693（active、0 grid）→ `no_grid` → PENDING_GRID，**不写** inspector/grid。
- 测试（E）：≥2 live grid → `multiple` → PENDING_GRID（dev 无 ≥2 网格的 active 员工，故以 stub client 精确验证 `multiple` 分支）。
- **新增**：`employeeResolvable()`（`SELECT id FROM public.employee WHERE id=$1 AND is_deleted=false`）用于区分
  **PENDING_EMPLOYEE**（员工不存在/已删）与 **PENDING_GRID**（员工在但 grid 不唯一）。

## 8. identity 状态机（§十一）

已在 `gridEnrichmentService.js` **新增**（additive、不改既有 status/reason 语义）：

| 状态 | 触发 |
|---|---|
| `PENDING_CREATOR` | 无 Creator 来源 |
| `PENDING_BRIDGE` | 有 Creator，但无 active bridge（含 0 条 / >1 条 / 非 active） |
| `PENDING_EMPLOYEE` | bridge 指向 employee 不存在或已删除 |
| `PENDING_GRID` | employee 可解析但 live grid 非唯一（0 或 >1） |
| `ATTRIBUTED` | WPS Account → employee.id → **唯一** live grid（或已有 inspector_employee_id） |
| `UNTRUSTED` | creator 为共享/应用账号（或仅有姓名/昵称/业务字段）→ 无可信账号身份 |

**重要**：该 6 态用于**决策与报告**，**不新增 DB 列**；持久化仍只有 `attribution_status: pending|attributed`（§十三「能不改就不改」+ §十七「生产无 P2-B0 新列」）。
`UNTRUSTED` / `PENDING_*` 一律**不写** `inspector_employee_id`。

## 9. source_channel 规则

- `client_token` 非空（可靠 Channel A 证据）→ `mobile_h5`；
- **绝不**因 `wps_record_id IS NOT NULL` 推断 `wps_form`（测试 L 规则级证伪：`resolveSourceChannel({wps_record_id:'EE', client_token:null}) === null`）；
- 其余保持原值（`unknown`/NULL）；测试 K：无 client_token → 写后 `source_channel` 仍为 NULL（**不改动**）；
- `wps_record_id` 只在 `sync_map`（gir 无该列，测试 L 已证），故该规则落在 DTO 层；
- 历史 2061 条**不批量回填**。

## 10. fail-safe

- `enrichAfterInsert` 全局 try/catch：测试 O 用**抛异常的 stub db** ⇒ 不抛错、回落 `pending/PENDING_CREATOR` + `fingerprint NULL`。
- 归属写入 SQL 守卫强化为 `AND inspector_employee_id IS NULL AND grid_id IS NULL`（§八：二者任一已存在即**不覆盖**）。
- 测试 I（已有 inspector=6693、grid=1）→ 运行后被 `acct_C`（→7707）归属流程命中，但**未被覆盖**（仍 6693/1）。
- 测试 J（已有 grid=1、inspector NULL）→ **未写** inspector、**未覆盖** grid。
- 附件：仍只做「PG 已有 http(s) URL → resolved」，否则 pending；**未**调用 404 端点、**未**伪造 URL。

## 11. 测试结果

```
=== P2-B1-C TESTS A–O (+X1/X2/H2/Y) ===
TOTAL=32  PASS=32  FAIL=0
```
覆盖：A PENDING_CREATOR / B PENDING_BRIDGE / C ATTRIBUTED+grid 写入 / D PENDING_GRID 不写 /
E multiple→PENDING_GRID(stub) / F 姓名禁止 / G 昵称禁止 / H 非 active 禁止 / H2 多重映射禁止 /
I 已有 inspector 不覆盖 / J 已有 grid 不覆盖 / K source 无证据保持原值 / L wps_record_id≠wps_form /
M 指纹 NULL / N 指纹正常(64hex) / O adapter 异常 fail-safe / X1 PENDING_EMPLOYEE /
X2 共享 creator→UNTRUSTED 且不写 / Y WPS 只读实测(CASE A + shared_account 检出) / worker `--from-wps` 接线。

**回归**：P2-B1-B 的 A–L 套件在本次最小修改后 **仍 30/30 PASS**（既有 status/reason 语义未变）。
**清理**：gir 测试行 residual=0、bridge residual=0（表回到 **0 行**）。

## 12. 生产只读回归（§十七）

仅 SELECT 连接 `safety_dashboard`：

| 指标 | 值 | 基线 | 结论 |
|---|---|---|---|
| gir 行数 | 2061 | 2061 | ✓ |
| sync_map 行数 | 2061 | 2061 | ✓ |
| max(gir.id) | 7192 | 7192 | ✓ |
| conflict | 0 | 0 | ✓ |
| 生产 gir 列数 | **28** | 28 | ✓ |
| 生产含 P2-B0 新列 | 无 | 无 | ✓ |

- `.env` mtime 未变（`2026-09-11 22:22:50`）；`WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=true` / `SCHEDULER_ENABLED=true` 未改；
- `:5876 → PID 23396` LISTENING 未碰；无任何生产 DML。

## 13. Git 状态（§十八）

- **冻结 8 文件：NONE_MODIFIED**。证据双层：
  ① `git status` 无 `M` 标记；
  ② **mtime（权威写入证据）全部早于本阶段**：`wpsGridPullEngine.js` 09-11 08:39、`wpsFieldMap.js` 09-11 08:14、
  `gridInspectionRepository.js` 09-08 20:29、`authenticatedEmployeeResolver.js` 09-10 14:49、`gridScope.js` 09-10 19:19、
  `site-mgmt.js` 09-12 16:41（早于本阶段的 GRID-03-B 修复）、`app.js` 09-09 22:38、`wpsGridSyncScheduler.js` 09-11 16:29。
- ⚠️ **本阶段期间仓库新增了 git 基线提交**（`c22c1113 chore: baseline snapshot of HSE system`，6571 files；`9ed95f18 chore: include wpsCreatorExtractor service in baseline`；`817970c2 docs: archive first git baseline commit`，均 2026-09-12 22:56，**由用户侧创建，非本阶段所为**）。
  因基线提交会把既有源码首次纳入版本控制，**git-status 的「未改」证据在本阶段被削弱** ⇒ 冻结判定以 **mtime** 为准（上条）。
- 本阶段文件清单：
  - **修改**：`server/services/wps/gridEnrichmentService.js`（identity 状态机 + employeeResolvable + §六唯一映射 + §八 grid 守卫）
  - **新增**：`server/services/wps/wpsCreatorExtractor.js`（只读 creator 提取 + 可信度评估；已被基线提交 `9ed95f18` 纳入）
  - **新增（gitignored，不入库；`.gitignore` 规则 `_*.cjs`）**：`server/scripts/_p2b1c_wps_probe.cjs`、`_p2b1c_records_probe.cjs`、`_p2b1c_creator_corr.cjs`、`_p2b1c_tests.cjs`
  - **新增报告**：`docs/HSE-MOBILE-GRID-ARCH-03-P2-B1-C-IMPLEMENTATION-REPORT.md`
  - **删除**：NONE
- 未新增任何 DB 列、未新增 npm 依赖、未改 package.json。

## 14. 未解决外部依赖

1. **表单通道 creator 语义 UNVERIFIED**：WPS Form 视图提交时，`creator` 是否为**提交者本人**（而非共享账号）——需在生产表单视图启用 + 一次真实提交后复测 `distinctCreators>1`。
2. 当前 sheet **无 Form 视图**、API 不暴露表单元数据 ⇒ 无法程序化确认「创建人」高级字段配置。
3. `wps_account_employee_map` 仍 **0 行** ⇒ 即使拿到 per-submitter creator，也**必须人工核验**录入映射（禁姓名/昵称/手机号/realName 匹配）。
4. `巡查人员ID` 列 200/200 为空 ⇒ 若拟用作身份载体，需先证明其**不可篡改**（否则恒 UNTRUSTED_BUSINESS_FIELD）。
5. Attachment 解析仍按 P2-B1-B 结论保持 `pending`（`attachment/urls` 实测 404，本阶段不处理，§十五）。

## 15. 正式启用条件（NOT_READY）

正式启用「WPS 通道身份归属」需**同时**满足：
1. 生产 WPS **表单视图**启用且经一次真实提交实测 `creator` 逐人不同（per_submitter）；
2. 取得该 creator → 真实员工的**人工核验**映射并录入 `wps_account_employee_map`（status='active'，且**一账号一映射**）；
3. 重跑只读门禁（生产边界 + 冻结层 + 桥接表非空）；
4. 常驻/受控 enrichment 运行方案（cursor + 幂等 + 失败隔离）落地（**本阶段禁止**，§十四）。

---

## 能力分层结论（§十二）

| 维度 | 判定 |
|---|---|
| 系统实现能力 | **READY** —— 状态机 / 提取器 / 桥接查询 / fail-safe 守卫均已实现并 32/32 通过 |
| WPS 外部能力 | **PARTIALLY_UNVERIFIED** —— 稳定 account id **可得**（CASE A），但当前为**共享账号**；per-submitter 语义与表单元数据 **UNVERIFIED** |
| 正式启用条件 | **NOT_READY**（见 §15） |

> `IDENTITY_CAPABILITY_BLOCKED_BY_EXTERNAL_WPS_API` **不适用于整体架构**：身份**捕获机制**已可用、fail-safe 完备；
> 阻塞点仅在「当前 WPS 数据无 per-submitter 身份 + 桥接表无经核验映射」这一**外部数据/配置**前提。

---

## 最终状态

**`PHASE_HSE_MOBILE_GRID_ARCH_03_P2_B1_C_NEEDS_REVIEW`**

判定依据（§二十）：技术路径**基本成立且实现完成**（状态机、提取器、守卫、测试全过、生产边界 PASS），
但存在**需人工确认的外部 WPS 能力/配置**：① 表单通道 creator 是否 per-submitter；② 桥接表经核验映射录入。
**不满足 BLOCKED**（存在可信身份来源路径，且可在当前架构约束下继续）。

## 最终输出摘要

- **报告路径**：`docs/HSE-MOBILE-GRID-ARCH-03-P2-B1-C-IMPLEMENTATION-REPORT.md`
- **最终状态**：`PHASE_HSE_MOBILE_GRID_ARCH_03_P2_B1_C_NEEDS_REVIEW`
- **测试统计**：本阶段 **32/32 PASS**；P2-B1-B 回归 **30/30 PASS**；生产只读回归 PASS；清理 residual=0
- **Creator 结论**：字段**存在**（推翻此前「无 creator」结论——被 `buildRecord` 丢弃）；但当前为**单一共享账号**（1 creator / 58 姓名）⇒ **不可用于逐条身份**
- **Form 结论**：sheet **无 Form 视图**、API 不暴露表单元数据 ⇒ 表单通道身份 **UNVERIFIED_FORM_RECORD_BINDING**
- **bridge/gridScope 结论**：桥接 0 行（禁姓名匹配）；单映射才生效；仅有唯一 live grid 才 ATTRIBUTED；已有 inspector/grid 一律不覆盖
- **生产边界结论**：gir=2061 / sync=2061 / max(id)=7192 / conflict=0 / 28 列 / `.env` 三开关不变 / 5876·PID 23396 正常 / 无 DML
- **Git 结论**：冻结 8 文件 NONE_MODIFIED（mtime 权威）；改 1（gridEnrichmentService）+ 增 1（wpsCreatorExtractor）+ 4 个 gitignored 脚本；删除 0；**期间用户侧新增 3 个 git 基线提交**
- **未解决**：见 §14（表单 creator 语义 / 表单元数据不可观测 / 桥接表 0 行 / 巡查人员ID 可用性）
- **下一阶段建议**：先做**最小外部验证**——在生产 WPS 建一个表单视图，提交 1 条测试记录，复测 `creator` 是否逐人不同；若 per_submitter 成立，再由人工录入 1 条经核验 bridge 映射并跑 dry-run 归属。**按 §二十一，本阶段完成后立即停止，不自动进入 P2-B1-D / Attachment / 常驻 Enrichment / P2-C / P2-D。**
