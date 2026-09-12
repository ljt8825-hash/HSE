# HSE 网格巡查身份链 · WPS-PG-SYNC-03 首次受控生产 Pull 与生产运行态验收报告

- 项目：`G:\hse-dashboard`
- 后端：`G:\hse-dashboard\server`（端口 5876）
- 执行日期：2026-09-11
- 前置阶段：`PHASE_WPS_PG_SYNC_02_COMPLETED_READY_FOR_SYNC_03`（已确认）
- **终态：`PHASE_WPS_PG_SYNC_03_BLOCKED`**
  （受控 Pull 链 **100% PASS**；阻塞项仅为 §4「SYNC-02 未部署到生产运行态」，按 §4/§5 未获人工授权故选定不重启）

---

## 0. §20 终态声明（任务书要求格式）

```text
STATUS : PHASE_WPS_PG_SYNC_03_BLOCKED

STOP_REASON :
  §4 门禁未满足 —— 生产 5876 运行进程（PID 27316）加载的是 **pre-SYNC-01 原版代码**，
  SYNC-02 单向 Pull Engine **尚未部署到生产运行态**。
  按 §4「如果当前运行态仍然是 SYNC-01：必须先停止并等待人工授权重启」
  与 §5「没有明确授权重启：停止，不自行重启」，本阶段未重启 5876、未修改 .env。
  注：受控 Pull 本身已按 §5 许可的「一次性进程级参数/脚本调用」方式完成，三阶段全 PASS、零数据变更。

EVIDENCE :
  server/scripts/output/wpssync03-runtime-probe.json      （§4 运行态行为取证）
  server/scripts/output/wpssync03-production-pull.json    （§16 26 项最终一致性审计，97 KB）
  server/scripts/output/wpssync03-wps-readonly.json       （§11/§14 独立核验）
  server/scripts/_wpssync03_runtime_probe.cjs             （探针脚本）
  server/scripts/_wpssync03_pull.cjs                      （受控 Pull 脚本，三 mode）
  server/scripts/_wpssync03_finalize.cjs                  （收尾/终态判定）
  server/scripts/_wpssync03_wpsreadonly.cjs               （只读与反向 facade 核验）

AFFECTED_DATA : 无。
  三阶段 Pull（dry-run 全量 2063 / limit=50 / 全量 2063）全部零变更：
  inserted=0、updated=0、pgDeleted=0、WPS write=0（create/update/delete）、DDL=0。
  PG 12 项基线前后 diff 为空；327 条 NULL grid_id 集合摘要一致；
  10 条人工记录零漂移；BT/EA 未进入 sync_map；WPS 仍 2063 条。

ROLLBACK_STATUS : 无需回滚。
  未修改 .env（mtime 仍 2026-09-11 07:13:11 +08，WPS_GRID_DATA_SOURCE=false / WPS_GRID_SYNC=false）；
  未重启 5876（PID 仍 27316）；
  未新增 DDL、未删除任何 PG 记录、未删除任何 sync_map 行、未调用任何 WPS 写 API。
```

---

## 1. 实施摘要

本阶段唯一目标是**把 SYNC-02 新代码以受控方式部署到生产运行态，并完成第一次 WPS → PG 生产 Pull 验证**。

实际达成情况：

| 目标 | 结果 |
|---|---|
| 完成第一次 WPS → PG 生产 Pull 验证 | ✅ **达成**（dry-run → limit=50 → 全量，三阶段全 PASS） |
| 证明 WPS → 单向 Pull → PG → HSE 业务系统 成立 | ✅ **达成**（全链路真机执行，零副作用） |
| 将 SYNC-02 新代码部署到生产运行态 | ❌ **未达成**（未获重启授权，按 §4/§5 停止） |

关键结论：

1. **单向 Pull Engine 在真实生产库上被完整验证**：`pulled=2063 / alreadyExists=2061 / excluded=2(BT,EA) / inserted=0 / updated=0 / conflicts=0 / pgDeleted=0 / errors=0`。
2. **PG 与 WPS 当前已完全对齐**，因此首次真实 Pull 的预期就是「零业务新增」——实测与预期逐项一致。
3. **六条硬门禁全部成立**：PG→WPS = 禁止、WPS DELETE→PG DELETE = 禁止、PG DELETE = 0、WPS WRITE = 0、DDL = 0。
4. **唯一阻塞项是部署**：生产 5876 进程运行的是 **pre-SYNC-01 原版双向代码**（比 SYNC-01 更早），SYNC-01/02 的磁盘改动均未生效。

---

## 2. 前置门禁核对（§1）

| 阶段 | 报告终态 | 判定 |
|---|---|---|
| SYNC-00 | `PHASE_WPS_PG_SYNC_00_READY_FOR_IMPLEMENTATION` | ✅ 通过 |
| SYNC-01 | `PHASE_WPS_PG_SYNC_01_COMPLETED_READY_FOR_SYNC_02`（门禁 44/44 ALL_PASS） | ✅ 通过 |
| SYNC-02 | `PHASE_WPS_PG_SYNC_02_COMPLETED_READY_FOR_SYNC_03`（门禁 112/112 ALL_PASS） | ✅ 通过 |

三阶段均无 STOP 条件遗留 → 允许进入本阶段。

---

## 3. 生产运行态确认（§4）★ 本阶段关键发现

### 3.1 环境取证

| 项 | 实测值 |
|---|---|
| 5876 监听 | ✅ `0.0.0.0:5876` / `[::]:5876` LISTENING |
| PID | **27316** |
| 进程启动时刻（由 `/api/health` uptime 反推） | **2026-09-11 07:22:21 +08** |
| `/api/health` | `{"code":0,"data":{"status":"ok",...}}` ✅ |
| `WPS_GRID_DATA_SOURCE` | `false` ✅ |
| `WPS_GRID_SYNC` | `false` ✅ |
| `WPS_SYNC_DELETE` | 未设置（等效关闭）✅ |
| `.env` mtime | `2026-09-11 07:13:11.963 +08`（与本阶段开始时一致，本阶段零改动） |

### 3.2 运行态代码版本判定（行为取证，非磁盘检查）

| 判据 | 结果 | 含义 |
|---|---|---|
| `POST /api/wps-grid-sync/push` | HTTP **200** `{code:-2,"同步未启用…"}` | **原版**语义：先判 `isEnabled()` → false 才早退；SYNC-01/02 版应为 **HTTP 410** `REVERSE_WRITE_DISABLED` |
| `GET /api/wps-grid-sync/status` 字段 | `enabled,configured,syncEnabledByEnv,deleteSyncEnabled,fileId,sheetId,mappingCount,conflicts,lastPullAt,lastReconcileAt,pushCutoffAt` | **无** `reverseWriteEnabled` / **无** `exclusions` → 非 SYNC-02 status 契约 |
| 磁盘 mtime 交叉验证 | `wpsGridPullEngine.js` 创建于 **08:39:40**、`wpsGridSyncService.js` **08:15:42**、`site-mgmt.js` **07:52:36** —— 全部**晚于**进程启动 07:22:21 | Node 不可能 require 尚不存在的文件 → 运行态必为旧版 |

**结论：`PRE_SYNC_01_ORIGINAL_LOADED`** —— 生产 5876 加载的是 **SYNC-01 之前的原版双向同步代码**。

### 3.3 ⚠ 由此识别的潜在风险（本阶段只记录，不处理）

运行中的原版代码使用 **默认开启** 的开关语义：

```js
const SYNC_ENABLED = process.env.WPS_GRID_SYNC !== 'false';   // 原版：非 'false' 即启用
```

即：当前生产安全**完全依赖 `.env` 中那行字面量 `WPS_GRID_SYNC=false`**。
一旦该行被**删除**、写成 `0`、`False`、`no`、空值等任意非字面 `false` 的值，**运行中的原版进程会立刻把双向同步视为启用**，从而具备：

- PG 写入 → `pushRow` → **WPS 写**
- PG 删除 → `onPgRowsDeleted` → **WPS 删除 + 删 sync_map**
- `reconcile()` → **上行 + 下行清扫 + 删除追平**

这正是 SYNC-01 要修掉、且**已在磁盘上修好**（`=== 'true'` fail-closed）但**尚未在运行态生效**的缺陷。

> **风险等级：高（潜伏）**，当前未触发（`.env` 明确为 `false`）。
> **处置：必须通过一次人工授权的重启把 SYNC-01/02 部署上线**，否则该进程长期处于「靠一行 env 兜底」的状态。

---

## 4. 生产重启规则遵从（§5）

| 规则 | 遵从情况 |
|---|---|
| 不允许自行修改 `.env` | ✅ 未修改（mtime 与内容均未变） |
| 保持 `WPS_GRID_DATA_SOURCE=false` | ✅ |
| 生产 Pull 开关保持 `WPS_GRID_SYNC=false` | ✅（真实 Pull 用**进程级** `process.env` 临时打开，不改文件） |
| 首次受控 Pull 优先用一次性进程级脚本 | ✅ **本阶段即采用此路径** |
| 不把生产 Scheduler 长期开启 | ✅ 未开启、未触发 |
| 无明确授权 → 停止，不自行重启 | ✅ **已停止，未重启（重启 0 次）** |

因此本阶段的真实 Pull **完全绕开 5876 端点**，由独立 Node 进程直接加载磁盘上的 SYNC-02 引擎执行，对生产服务零干扰。

---

## 5. 生产 Dry Run（§6）

命令：`node scripts/_wpssync03_pull.cjs --mode=dry-run`（进程级 `WPS_GRID_SYNC=true`，`.env` 不动）

| 指标 | 期望 | 实测 | 判定 |
|---|---|---|---|
| `pulled` | 2063 | **2063** | ✅ |
| `alreadyExists` | 2061 | **2061** | ✅ |
| `excluded` | 2 | **2** | ✅ |
| `bt` | 1 | **1** | ✅ |
| `ea` | 1 | **1** | ✅ |
| `newCandidates` | 0 | **0** | ✅ |
| `changedCandidates` | 0 | **0** | ✅ |
| `inserted` | 0 | **0** | ✅ |
| `updated` | 0 | **0** | ✅ |
| `pgDeleted` | 0 | **0** | ✅ |
| `errors` | 0 | **0** | ✅ |
| WPS writes | 0 | **0** | ✅ |
| PG DML / DDL | 0 | **0 / 0** | ✅ |

**Dry Run 全 PASS** → 允许进入 §7。

---

## 6. limit=50 首次真实 Pull（§7）

命令：`node scripts/_wpssync03_pull.cjs --mode=limit50`（`dryRun=false, limit=50`）

```text
direction = wps->pg     dryRun = false     limit = 50
pulled = 50   alreadyExists = 50   newCandidates = 0   changedCandidates = 0
inserted = 0  updated = 0  skippedUnchanged = 50  conflicts = 0
pgDeleted = 0  pgDeletedCatchUp = 0  hashRebaselined = 0  errors = 0
WPS writes: create=0 update=0 delete=0        PG DML: insert=0 update=0 delete=0  DDL=0
```

| §7 要求 | 实测 |
|---|---|
| 1. 只能 WPS → PG | ✅ `direction = wps->pg`，`REVERSE_WRITE_ENABLED=false` |
| 2. 不允许 WPS 写入 | ✅ create/update/delete 全 0 |
| 3. 不允许 PG DELETE | ✅ delete=0，`pgDeleted=0` |
| 4. 不允许 DDL | ✅ ddl=0 |
| 5. 不允许修改 `grid_id` / `inspector_employee_id` | ✅ 两列不在投影中 + `assertNoProtectedColumns()`；UPDATE 语句计数 0 |
| 6. 不允许修改 BT / EA | ✅ `sync_map` 中仍无 BT/EA；`inserted=0` |

> `limit=50` 只取 WPS 前 50 条，BT/EA 位于板尾，故本 mode 的 `bt/ea/skippedExcluded` 天然为 0；BT/EA 的排除计数在 §7（Dry Run）与 §11（全量）中均为 `bt=1 / ea=1 / skippedExcluded=2`。

---

## 7. limit=50 后基线审计（§8）

| 指标 | 冻结基线 | Pull 前 | Pull 后 | diff |
|---|---|---|---|---|
| `grid_inspection_records` | 2061 | 2061 | 2061 | — |
| `grid_record_sync_map` | 2061 | 2061 | 2061 | — |
| `grid_id IS NULL` | 327 | 327 | 327 | — |
| `grid_id IS NOT NULL` | 1734 | 1734 | 1734 | — |
| `inspector_employee_id IS NOT NULL` | 10 | 10 | 10 | — |
| live `grid_areas` | 62 | 62 | 62 | — |
| active `users` | 63 | 63 | 63 | — |
| `grid_inspector` | 62 | 62 | 62 | — |
| `admin` | 1 | 1 | 1 | — |
| `sync_map conflict` | 0 | 0 | 0 | — |
| `grid_record_sync_state` | 空(0) | 0 | 0 | — |
| `MAX(grid_inspection_records.id)` | 7192 | 7192 | 7192 | — |
| WPS 总记录 | 2063 | 2063 | 2063 | — |
| WPS-only | BT / EA | BT / EA | BT / EA | — |

**`baselineDiff = {}`（零漂移）**，与「当前 WPS 与 PG 已完全对齐 → limit=50 不产生业务新增」的预期一致。

---

## 8. 人工数据保护（§9）

`PG id 7183~7192` 逐条核对（Pull 前后完全一致，`drift = 0`）：

| PG id | 姓名 | `grid_id` | `inspector_employee_id` | 期望 | 判定 |
|---|---|---|---|---|---|
| 7183 | 王铁民 | 60 | 6789 | 60 / 6789 | ✅ |
| 7184 | 谢俊章 | 14 | 7437 | 14 / 7437 | ✅ |
| 7185 | 刘金涛 | 6 | 6698 | 6 / 6698 | ✅ |
| 7186 | 刘金涛 | 6 | 6698 | 6 / 6698 | ✅ |
| 7187 | 刘金涛 | 6 | 6698 | 6 / 6698 | ✅ |
| 7188 | 刘金涛 | 6 | 6698 | 6 / 6698 | ✅ |
| 7189 | 刘金涛 | 6 | 6698 | 6 / 6698 | ✅ |
| 7190 | 刘金涛 | 6 | 6698 | 6 / 6698 | ✅ |
| 7191 | 黄殿兴 | 1 | 6692 | 1 / 6692 | ✅ |
| 7192 | 黄殿兴 | 1 | 6692 | 1 / 6692 | ✅ |

结构保障：`PROTECTED_COLUMNS = ['grid_id','inspector_employee_id']` **不在投影中**，且写前有 `assertNoProtectedColumns()` 硬断言 → 引擎**结构性不可写**这两列。

---

## 9. 327 条 NULL grid_id（§10）

| 项 | 前 | 后 |
|---|---|---|
| 计数 | 327 | 327 |
| 集合摘要 `md5(string_agg(id ORDER BY id))` | 一致 | 一致 |

✅ 同步后 **327 条仍然 NULL**。未出现任何 `WPS分组/姓名/乡镇名称/公司管理/模糊匹配 → grid` 的推导路径（引擎无此类代码，`grid_id` 恒不写）。

---

## 10. BT / EA 硬排除（§11）

| 检查 | 结果 |
|---|---|
| WPS 中 BT / EA 仍存在 | ✅ WPS 总 2063，`bt=1`、`ea=1`（读 `listAllRecords` 独立复核 `hasBT=true / hasEA=true`） |
| PG `sync_map` 中 BT / EA 映射 | ✅ 均**不存在**（before/after 均为 `[]`） |
| `skippedExcluded` | ✅ Dry Run 与全量均为 **2** |
| 是否因首次 Pull 被重新插入 | ✅ **否**（`inserted=0`） |

排除机制：`FROZEN_EXCLUSIONS = [{recordId:'BT'},{recordId:'EA'}]`，判定依据 **`wps_record_id`**（非姓名/日期），检查**先于**幂等判定，`WPS_SYNC_EXCLUDE_EXTRA` 只能追加、无法移除冻结项。

---

## 11. 全量 Pull（§12 / §13）

前置条件逐项满足后才执行：Dry Run PASS ＋ limit=50 PASS ＋ 人工数据 PASS ＋ 327 NULL PASS ＋ BT/EA PASS ＋ PG DELETE=0 ＋ WPS WRITE=0 ＋ DDL=0 → ✅ 放行。

命令：`node scripts/_wpssync03_pull.cjs --mode=full`

| 指标 | 期望 | 实测 | 判定 |
|---|---|---|---|
| `pulled` | 2063 | **2063** | ✅ |
| `alreadyExists` | 2061 | **2061** | ✅ |
| `excluded` | 2 | **2** | ✅ |
| `bt` / `ea` | 1 / 1 | **1 / 1** | ✅ |
| `inserted` | 0 | **0** | ✅ |
| `updated` | 0 | **0** | ✅ |
| `errors` | 0 | **0** | ✅ |
| `conflicts` | 0 | **0** | ✅ |
| `pgDeleted` | 0 | **0** | ✅ |
| `hashRebaselined` | 允许（需说明） | **0** | ✅（无需说明） |

**未出现 `inserted > 0` / `updated > 0` / `pgDeleted > 0` → 无需暂停 Scheduler（Scheduler 本就未开启）。**

---

## 12. WPS 写入硬门禁（§14）

| 项 | 结果 |
|---|---|
| WPS `createRecords` | **0** |
| WPS `updateRecords` | **0** |
| WPS `deleteRecords` | **0** |
| `pushRow()` | `{disabled:true, reason:'REVERSE_WRITE_DISABLED'}` ✅ |
| `onPgRowChanged()` | no-op（`undefined`）✅ |
| `onPgRowsDeleted([1,2,3])` | no-op（`undefined`）✅ |
| `REVERSE_WRITE_ENABLED` | **false**（硬锁常量）✅ |

三阶段全程拦截，`wpsWriteCalls = []`（零调用记录）。

---

## 13. PG 删除硬门禁（§15）

| 项 | 结果 |
|---|---|
| `DELETE FROM grid_inspection_records` | **0** |
| `DELETE FROM grid_record_sync_map` | **0** |
| `pgDeleted` | **0** |
| `pgDeletedCatchUp` | **0** |
| WPS 中 Record 消失时的处理 | 仅 `wpsDeleted++`（本阶段 `wpsDeleted=0`，WPS 与 PG 完全对齐，无缺失记录）；**绝不 DELETE PG** |

引擎内 `assertNoPgDelete()`：一旦 `pgDeleted !== 0` 立即抛 `PG_DELETE_FORBIDDEN`。

---

## 14. 最终一致性审计 JSON（§16）

产物：`server/scripts/output/wpssync03-production-pull.json`（97 KB，含 `phases.{dry-run,limit50,full}` 三段全量明细）

26 项齐全：

| # | 项 | 值 |
|---|---|---|
| 1 | Pull 参数 | `{dryRun:false, limit:0, fileId:'cn229thwalDs', sheetId:3}` |
| 2 | 开始/结束时间 | `2026-09-11T01:0x:xxZ` → `…`（含 `elapsedMs`） |
| 3 | PID | `pullProcess` / `productionService5876 = 27316` |
| 4 | 配置状态 | 进程级 `WPS_GRID_SYNC=true`（临时）；`.env` 未改；`REVERSE_WRITE_ENABLED=false`；exclusions `[BT,EA]`；hash 列数 18 |
| 5 | WPS 总记录 | 2063 |
| 6 | PG 总记录 | 2061 |
| 7 | sync_map 总记录 | 2061 |
| 8 | inserted | 0 |
| 9 | updated | 0 |
| 10 | unchanged | 2061 |
| 11 | excluded | 2 |
| 12 | BT | 1 |
| 13 | EA | 1 |
| 14 | conflicts | 0 |
| 15 | errors | 0 |
| 16 | wpsDeleted | 0 |
| 17 | pgDeleted | 0 |
| 18 | WPS write count | `{create:0, update:0, delete:0}` |
| 19 | PG delete count | 0 |
| 20 | DDL count | 0 |
| 21 | 327 NULL 前后 | 327 → 327（摘要一致） |
| 22 | 10 条人工记录前后 | 完全一致，`drift=[]` |
| 23 | BT/EA 映射状态 | before `[]` / after `[]` |
| 24 | sync_hash 状态 | `mapRows=2061, hashNull=0`，聚合摘要前后一致 |
| 25 | 数据基线 diff | `{}` |
| 26 | 最终 PASS/FAIL | **PASS** |

---

## 15. Scheduler 保持关闭（§17）

| 项 | 状态 |
|---|---|
| `.env` `WPS_GRID_SYNC` | **`false`**（保持） |
| 15 分钟自动同步 | **未开启** |
| `initWpsGridSyncScheduler()` 行为 | 生产中确实已挂载，但 `isEnabled()` 为 false → 每次 tick 直接早退，**不执行 Pull** |
| 本阶段是否触发过 scheduler | 否（`grid_record_sync_state` 仍为空 = 系统从未真正自动同步过） |

即便全量 Pull 成功，仍按 §17 保持关闭，等待「人工受控 Pull → 数据审计 → 人工确认 → 单独评审」。

---

## 16. STOP 条件逐项复核（§18）

| STOP 条件 | 是否触发 |
|---|---|
| PG DELETE > 0 | ❌ 否（0） |
| WPS WRITE > 0 | ❌ 否（0） |
| DDL > 0 | ❌ 否（0） |
| BT / EA 被插入 PG | ❌ 否 |
| `grid_id` 被自动修改 | ❌ 否 |
| `inspector_employee_id` 被自动修改 | ❌ 否 |
| 327 NULL grid_id 数量下降 | ❌ 否（327 → 327） |
| 10 条人工记录发生漂移 | ❌ 否（drift=0） |
| sync_map 被重新绑定 | ❌ 否（行数与摘要均不变） |
| natural key 被使用 | ❌ 否（引擎无自然键路径，SYNC-02 §21 已证 0 处） |
| 出现 PG → WPS 调用 | ❌ 否（`REVERSE_WRITE_ENABLED=false`，WPS 写调用 0 次） |
| 出现 WPS DELETE → PG DELETE | ❌ 否 |
| 出现未经授权的 `.env` 修改 | ❌ 否（mtime 与内容未变） |
| 出现未经授权的生产重启 | ❌ 否（PID 27316 未变，重启 0 次） |
| 出现错误记录 | ❌ 否（errors=0） |
| 出现重复新增 | ❌ 否（inserted=0） |

**§18 的 16 项数据安全类 STOP 条件——零触发。**

> 本次 `BLOCKED` 并非上述任一条件触发，而是 §4 的**部署门禁未满足 + 无重启授权**（流程性阻塞，非数据性失败）。

---

## 17. 未顺手治理项（§19，仅记录）

以下问题本阶段**发现后只记录、未处理**，全部独立立项：

1. `/uploads/...` 站内相对路径图片（`image_content` 约 1698 行 / `rectified_photo` 约 471 行）—— 引擎按 fail-safe 键省略，存量值保留。
2. 历史 `'--'` 占位符（`violator_name/gender/age` 约 1238 行）—— 未清洗。
3. 327 条历史 `grid_id IS NULL` —— 未回填、未归类。
4. Excel import 姓名模糊匹配 `grid_id` —— 未治理。
5. 前端删除/清空/导入按钮未按角色隐藏（后端已 403 兜底）—— 未改前端。
6. WPS `own_grid` 模式 —— 未启用（生产走 PG）。
7. `admin` 的 `employee_id` 绑定 —— 未调整。
8. `township` / `org_grid` 归属 —— 未调整。
9. WPS Schema 治理（原生附件 4 列不搬运、DISPIMG 禁解析）—— 维持现状。
10. **【本阶段新增观察】** 生产 5876 运行 pre-SYNC-01 原版代码、开关为默认开启语义（见 §3.3）—— 属部署缺口，需人工授权重启解决，不在「治理项」范畴。

---

## 18. 终态与判定依据（§20）

任务书给出三种状态，与实际情形的映射：

| 任务书状态 | 适用条件 | 本阶段 |
|---|---|---|
| `PHASE_WPS_PG_SYNC_03_COMPLETED_READY_FOR_SCHEDULER_REVIEW` | 全部通过（含部署） | ❌ 不适用——§2 目标含「部署到生产运行态」，该部分未达成 |
| `PHASE_WPS_PG_SYNC_03_DEPLOYED_READY_FOR_CONTROLLED_PULL` | 已完成部署但未执行全量 Pull | ❌ 不适用——本阶段情形恰好相反（Pull 已完成，部署未完成） |
| `PHASE_WPS_PG_SYNC_03_BLOCKED` | 任意 STOP 条件触发 | ✅ **选定此项**——§4 部署门禁未满足且无重启授权 |

**选定 `BLOCKED` 的理由与安全考量：**

1. §4 的条件（「运行态仍是 SYNC-01（或更早）」）**已满足**，§4 明文要求「必须先停止并等待人工授权重启」。
2. 若改判为 `COMPLETED_READY_FOR_SCHEDULER_REVIEW`，将向后续环节传递「可以进入 Scheduler 评审」的信号；但当前运行进程**根本没有 SYNC-02 引擎**，一旦有人据此把 `WPS_GRID_SYNC` 打开，实际执行的将是**原版双向 `reconcile()`**（PG→WPS 写 + WPS 删除回删 PG）——**后果严重且被 §3 明令禁止**。为避免误导，必须报 `BLOCKED`。
3. 同时**如实记录**：受控 Pull 链本身已按 §5 许可方式完整执行并 100% PASS，阻塞项仅为部署与授权。

---

## 19. 风险与遗留项

| # | 项 | 等级 | 说明 |
|---|---|---|---|
| R1 | **生产运行态未部署 SYNC-01/02** | **高** | 需要一次人工授权的重启；不重启则 SYNC-01 的反向写入隔离只存在于磁盘 |
| R2 | **运行中进程开关为默认开启语义** | **高（潜伏）** | `WPS_GRID_SYNC !== 'false'`；任何人删改该 `.env` 行即可能激活双向同步。必须靠 R1 解决 |
| R3 | SYNC-01/02 尚未经生产真实流量验证 | 中 | 磁盘代码已过 112/112 + 44/44 门禁，但未在 5876 上跑过真实请求 |
| R4 | `imageWarnings`（相对路径图片） | 低 | 已 fail-safe 键省略，不污染数据 |
| R5 | 327 NULL `grid_id` | 低 | 按裁定保持 NULL（fail-closed，仅 admin 可见） |
| R6 | Scheduler 尚未评审 | 低 | 按 §17 保持关闭 |

---

## 20. 下一阶段建议（SYNC-04）

唯一关键动作是**解除 R1/R2**，建议最小步骤：

1. 申请**人工授权重启窗口**（生产 5876）。
2. 重启前记录：PID 27316、`/api/health`、12 项基线、`.env` mtime（**本报告 §7 表格可直接复用为对照基线**）。
3. 重启后确认：新 PID、`/api/health` ok、`GET /api/wps-grid-sync/status` **出现 `reverseWriteEnabled:false` 与 `exclusions:['BT','EA']`**（即 SYNC-02 契约生效）。
4. 用真实 HTTP 端点复跑一次 `POST /api/wps-grid-sync/pull {dryRun:true}`，核对与 `wpssync03-production-pull.json` 的 `phases['dry-run']` 逐项一致。
5. 部署验证通过后，**再单独评审**是否开启 Scheduler（15 分钟），并明确定义 `WPS_GRID_SYNC=true` 的审批与回滚流程。

在 R1 解除前，**不得**开启 Scheduler、**不得**把 `WPS_GRID_SYNC` 置为 `true`。

---

## 21. 最终原则对照（§21）

> 本阶段不是追求"同步成功"，而是证明：**第一次真实生产 Pull，在不修改 WPS、不删除 PG、不污染身份、不改变网格归属、不重新导入 BT/EA、不破坏历史数据的前提下，可以安全执行。**

| 原则 | 实测证明 |
|---|---|
| 不修改 WPS | WPS write = 0（三阶段 + 独立核验），WPS 仍 2063 条 |
| 不删除 PG | PG delete = 0，`pgDeleted=0`，`pgDeletedCatchUp=0` |
| 不污染身份 | `inspector_employee_id` 结构不可写；10 条人工记录零漂移；`inspector NOT NULL` 仍 10 |
| 不改变网格归属 | `grid_id` 结构不可写；327 NULL → 327 NULL；10 条人工 `grid_id` 零漂移 |
| 不重新导入 BT/EA | `sync_map` 中 BT/EA 仍不存在；`inserted=0`；`skippedExcluded=2` |
| 不破坏历史数据 | 12 项基线 diff 为空；327 NULL 集合摘要一致；sync_hash 聚合摘要一致 |
| 先小规模再全量 | Dry Run(2063) → limit=50 → 全量(2063)，逐级放行 |
| 不自行开启长期 Scheduler | `WPS_GRID_SYNC=false` 保持，未开启、未触发 |
| 完成后停止 | 已停止，未重启、未改 `.env`，输出本报告等待人工确认 |

**验证结论成立：受控 Pull 在真实生产库上安全执行且零副作用。**

---

## 附录 A：验收签字

| 项 | 值 |
|---|---|
| 阶段 | WPS-PG-SYNC-03 首次受控生产 Pull |
| 执行时间 | 2026-09-11 09:0x +08 |
| 受控 Pull 链 | dry-run → limit50 → full，**三阶段全 PASS** |
| 数据变更 | **零**（inserted=0 / updated=0 / pgDeleted=0 / WPS write=0 / DDL=0） |
| 生产服务 | 未重启（PID 27316 未变），未改 `.env` |
| §18 STOP | 16 项零触发 |
| 终态 | **`PHASE_WPS_PG_SYNC_03_BLOCKED`**（唯一阻塞：§4 部署门禁 + 无重启授权） |
| 解除阻塞所需 | 人工授权的 5876 重启窗口 |

## 附录 B：真机证据索引

| 证据 | 路径 |
|---|---|
| §4 运行态行为探针 | `server/scripts/output/wpssync03-runtime-probe.json` |
| §16 最终一致性审计（26 项，97 KB） | `server/scripts/output/wpssync03-production-pull.json` |
| §11/§14 WPS 只读性与反向 facade 核验 | `server/scripts/output/wpssync03-wps-readonly.json` |
| 探针脚本 | `server/scripts/_wpssync03_runtime_probe.cjs` |
| 受控 Pull 脚本（dry-run / limit50 / full） | `server/scripts/_wpssync03_pull.cjs` |
| 收尾与终态判定 | `server/scripts/_wpssync03_finalize.cjs` |
| 只读/反向核验脚本 | `server/scripts/_wpssync03_wpsreadonly.cjs` |
| SYNC-02 引擎 | `server/services/wpsGridPullEngine.js` |
| SYNC-02 门禁 | `server/scripts/output/wpssync02-gate.json`（112/112） |
