# HSE 网格巡查身份链 · WPS-PG-SYNC-04-A 生产部署前置门禁审计报告

- **阶段**：`WPS-PG-SYNC-04-A` —— 生产部署前置门禁审计与重启授权等待
- **项目**：`G:\hse-dashboard`　**后端**：`G:\hse-dashboard\server`　**生产端口**：`5876`
- **执行时间**：2026-09-11 09:17–09:26（GMT+8）
- **执行模式**：**只读（read-only）** —— 未重启、未改 `.env`、未写 PG、未写 WPS、未建 DDL、未执行生产 Pull
- **审计脚本**：`server/scripts/_wpssync04a_audit.cjs`（一次性进程级，零副作用）
- **证据文件**：`server/scripts/output/wpssync04a-preflight.json`

---

## 0. 四门禁分列（本报告核心，严格区分、不得混写）

| 门禁 | 结论 | 依据 |
|---|---|---|
| **DATA_SAFETY_GATE** | ✅ **PASS**（8/8） | 基线 12/12 吻合、人工 10 条零漂移、BT/EA 未入 sync_map、327 条 NULL 保持、`.env` 安全、WPS 写 0、DDL 0、WPS 侧 BT/EA 均在 |
| **DEPLOYMENT_GATE** | ✅ **PASS**（磁盘就绪；运行态未部署） | §5 十三点清单 13/13；`diskComplete=true`；`runtimeVersion=PRE_SYNC_01_ORIGINAL_LOADED` |
| **RESTART_AUTHORIZATION** | ⛔ **NOT GRANTED** | 本阶段无人工重启授权；按 §五/§十二 **立即停止** |
| **FINAL_STATUS** | **`PHASE_WPS_PG_SYNC_04A_READY_FOR_MANUAL_RESTART`** | 四门禁合成结论 |

> 说明：**数据侧无任何 STOP 条件触发**；本阶段唯一的"未完成项"是**部署动作未被授权**。二者性质不同，故分列。

---

## 1. §一 前置门禁：上游四份报告终态核对

| 阶段 | 报告终态 | 是否含 STOP |
|---|---|---|
| SYNC-00 | `PHASE_WPS_PG_SYNC_00_READY_FOR_IMPLEMENTATION` | 否（0 处） |
| SYNC-01 | `PHASE_WPS_PG_SYNC_01_COMPLETED_READY_FOR_SYNC_02` | 否（0 处） |
| SYNC-02 | `PHASE_WPS_PG_SYNC_02_COMPLETED_READY_FOR_SYNC_03` | 否（0 处） |
| SYNC-03 | `PHASE_WPS_PG_SYNC_03_BLOCKED` | 是（8 处，**全部是"部署未授权"这一条**，非数据 STOP） |

**结论**：SYNC-00/01/02 均无 STOP 条件；SYNC-03 的 BLOCKED **唯一原因**是 §4 部署门禁未满足（生产运行态未加载新代码）——这正是本阶段（04-A）要处理的命题。⇒ **前置门禁通过，允许继续。**

---

## 2. §三 第一步：`PROD_RUNTIME_BASELINE`（只读取证）

```
监听状态        : LISTENING（0.0.0.0:5876 / [::]:5876）
当前 PID        : 27316
进程启动时间    : 2026-09-11 07:22:21（GMT+8）   ← 由 /api/health uptime 反推 + Win32_Process 双证
父进程          : PPID 25784（已退出，一次性启动器）
进程命令行      : "C:\Program Files\nodejs\node.exe" app.js
/api/health     : HTTP 200  {"code":0,"data":{"status":"ok","uptime":7013.3s,"environment":"development"}}
.env 路径       : G:\hse-dashboard\server\.env
.env mtime      : 2026-09-11 07:13:11.963  (4225 bytes)
WPS_GRID_DATA_SOURCE = false
WPS_GRID_SYNC        = false
WPS_SYNC_DELETE      = （该行不存在）
DELETE_SYNC_ENABLED  = （该行不存在）
PORT                 = 5876
```

**关键推论**：`.env` mtime（07:13:11）**早于**进程启动（07:22:21）⇒ 当前运行进程已加载当前 `.env`，即 `WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=false` **在运行态真实生效**。

本阶段未改动上述任何一项。

---

## 3. §四 第二步：当前运行代码版本（真实 HTTP 行为判定，非磁盘）

### 3.1 行为探针结果

| 探针 | 实测 | 原版（pre-SYNC-01）语义 | SYNC-01+ 语义 | 判定 |
|---|---|---|---|---|
| `POST /api/wps-grid-sync/push` | **HTTP 200**，body `{"code":-2,"success":false,"message":"同步未启用（检查 WPS 凭证配置与 WPS_GRID_SYNC 开关）"}` | ✔ 200 + `-2` 未启用 | 应为 **410** `data.code='REVERSE_WRITE_DISABLED'` | **原版** |
| `GET /api/wps-grid-sync/status` 字段集 | `enabled, configured, syncEnabledByEnv, deleteSyncEnabled, fileId, sheetId, mappingCount, conflicts, lastPullAt, lastReconcileAt, pushCutoffAt` | ✔ 旧契约 | 应含 `reverseWriteEnabled` / `exclusions` / `hashScopeColumns` | **原版** |
| `reverseWriteEnabled` 是否存在 | **不存在**（`hasReverseWriteFlag=false`） | ✔ | 应存在且 = `false` | **原版** |
| `exclusions`（BT/EA）是否存在 | **不存在**（`hasExclusions=false`） | ✔ | 应存在且 = `['BT','EA']` | **原版** |

### 3.2 部署必要性证明（进程启动时刻 × 文件 mtime 交叉验证）

| 文件 | 归属 | mtime | 是否晚于 07:22:21 |
|---|---|---|---|
| `.env` | — | 07:13:11 | 否（进程启动前，已被加载） |
| `routes/site-mgmt.js` | SYNC-01 | 07:52:36 | **是** |
| `services/wps/wpsFieldMap.js` | SYNC-02 | 08:14:02 | **是** |
| `services/wpsGridSyncService.js` | SYNC-02 | 08:15:42 | **是** |
| `services/wpsGridSyncScheduler.js` | SYNC-02 | 08:15:50 | **是** |
| `routes/wps-grid-sync.js` | SYNC-02 | 08:16:03 | **是** |
| `services/wpsGridPullEngine.js` | SYNC-02 | 08:39:40 | **是** |
| `app.js`（bootstrap） | — | 2026-09-09 22:38 | 否（未变，启动路径无变化） |

**判定：`PRE_SYNC_01_ORIGINAL_LOADED`** —— 进程启动于**全部** SYNC-01/02 文件写入之前，Node 在启动时 `require()` 加载模块 ⇒ **运行态必然未加载新代码**。行为探针与时间线**双向互证**，结论唯一。

### 3.3 运行中旧进程的即时安全边界（重要）

旧进程当前处于**惰性**状态，未构成现实风险：

- `WPS_GRID_SYNC=false` ⇒ 原版 `SYNC_ENABLED`（`!== 'false'` 语义）判定为 **disabled**
- `/status` 实测 `enabled:false, syncEnabledByEnv:false, deleteSyncEnabled:false`
- `POST /push` 实测返回 `code:-2`「同步未启用」，**未发生任何 WPS 写入**

> ⚠ **但旧进程的开关语义是"默认开"**：`SYNC_ENABLED = WPS_GRID_SYNC !== 'false'`。当前安全**100% 依赖 `.env` 中那行字面量 `false`**。该行一旦被删除 / 写成 `0` / `False` / 空值，**运行中的旧进程会立刻启用双向同步**（PG→WPS 写、PG 删除→WPS 删除、`reconcile` 全量对账）。磁盘版已改为 fail-closed `=== 'true'`，但**尚未部署**。⇒ 部署前**禁止以任何理由改动该 env 行**（本阶段未改，mtime 保持 07:13:11）。

---

## 4. §五 第三步：磁盘 SYNC-02 代码完整性（十三点清单，逐条可核）

| # | 检查项 | 结果 | 证据 |
|---|---|---|---|
| 1 | `wpsGridPullEngine.js` 存在 | ✅ | 556 行 / 24,146 bytes / mtime 08:39:40 |
| 2 | Pull Engine 完整（pull API + dryRun + 硬断言） | ✅ | `function pullWpsToPg(`、`dryRun`、`assertNoPgDelete`、`assertNoProtectedColumns` |
| 3 | `PROTECTED_COLUMNS` 含 `grid_id` + `inspector_employee_id` | ✅ | `wpsFieldMap.js:127` = `['grid_id','inspector_employee_id']`；引擎 import 使用且**不自带字面量**（真源唯一） |
| 4 | BT / EA 冻结排除仍存在 | ✅ | `FROZEN_EXCLUSIONS = [{recordId:'BT'},{recordId:'EA'}]` |
| 5 | `REVERSE_WRITE_ENABLED = false` | ✅ | `wpsGridPullEngine.js:40` 硬锁，任何环境变量无法开启 |
| 6 | `WPS_SYNC_DELETE` 不具备重新开启 PG 删除能力 | ✅ | 三证：①`DELETE_SYNC_ENABLED` 常量全项目**已不存在**；②引擎/服务内**无任何** `DELETE FROM grid_inspection_records\|grid_record_sync_map`；③`pgDeleted: 0` 硬编码 + `assertNoPgDelete()` 抛 `PG_DELETE_FORBIDDEN` |
| 7 | scheduler 只调用 WPS → PG Pull | ✅ | 去注释后 `pullWpsToPg` 命中、`reconcile(` **0 命中** |
| 8 | 没有恢复 PG → WPS 写入 | ✅ | 引擎内无 `pushRow(`/`createRecord(`/`updateRecord(`/`deleteRecord(`/`wps.*Record` |
| 9 | 没有 WPS DELETE → PG DELETE | ✅ | 同 #6 ②③ |
| 10 | 没有 natural key 路径 | ✅ | `findPgIdByNaturalKey` / `matchedByNaturalKey` 全项目 **0 处** |
| 11 | 没有 `grid_id` 自动推导 | ✅ | `PROTECTED_COLUMNS` 不在 `SYNC_PROJECTION`；`toCanonicalDto` 内 `for (col of PROTECTED_COLUMNS) delete dto[col]` |
| 12 | 没有 `inspector_employee_id` 自动回填 | ✅ | 同 #11 + `assertNoProtectedColumns()` 违规即抛 |
| 13 | 没有修改 10 条人工记录的逻辑 | ✅ | 引擎内 **0 处** 出现 `7183`–`7192` 任一 id |

**§5 清单：13/13 ALL_PASS**

### 4.1 旧代码残留扫描（§21 同源）

| 关键字 | services/ | routes/ | 判定 |
|---|---|---|---|
| `pushRow` | 3 | 3 | **全部为 fail-closed 门面**：`svc.pushRow()` 恒返回 `{disabled:true, reason:'REVERSE_WRITE_DISABLED'}` + `console.warn`；route 侧 `/push` 恒 **410** |
| `onPgRowChanged` | 4 | — | 全部由 `if (REVERSE_WRITE_ENABLED) return;`（恒 false）短路 → no-op |
| `onPgRowsDeleted` | 4 | — | 同上，no-op |
| `reconcile` | 5 | 3 | `svc.reconcile()` 已单向化：`direction:'wps->pg'`、`pull = engine.pullWpsToPg(opts)`、`push` 恒 `{disabled:true}`；route `/reconcile` 语义等价 `/pull` |
| `pushFromPg` | **0** | — | 已彻底移除 |
| `ensureTables` | 3 | — | 语义已改为**只读断言** `engine.assertSchemaReady()`（`to_regclass` + `pg_indexes`），**零 DDL** |

**结论**：磁盘版不存在任何 **PG→WPS 生产调用路径**、不存在 **PG DELETE→WPS**、不存在 **WPS DELETE→PG DELETE**、不存在**自动 DDL**、不存在**自然键作为正式幂等键**。

---

## 5. §六 第四步：`.env` 状态（只读，未修改）

```env
WPS_GRID_DATA_SOURCE=false     ✅ 符合
WPS_GRID_SYNC=false            ✅ 符合
WPS_SYNC_DELETE                ✅ 该行不存在（不具备危险开启状态）
DELETE_SYNC_ENABLED            ✅ 该行不存在
PORT=5876                      ✅
```

`.env` mtime **2026-09-11 07:13:11.963 / 4225 bytes** —— 与 SYNC-03 归档时一致，**本阶段零写入**。

---

## 6. §七 第五步：数据库生产基线（只读）

| 指标 | 期望 | 实测 | 结果 |
|---|---|---|---|
| `grid_inspection_records` | 2061 | **2061** | ✅ |
| `grid_record_sync_map` | 2061 | **2061** | ✅ |
| `grid_id IS NULL` | 327 | **327** | ✅ |
| `grid_id IS NOT NULL` | 1734 | **1734** | ✅ |
| `inspector_employee_id IS NOT NULL` | 10 | **10** | ✅ |
| live `grid_areas`（`is_deleted=false`） | 62 | **62** | ✅ |
| active `users` | 63 | **63** | ✅ |
| `grid_inspector` | 62 | **62** | ✅ |
| `admin` | 1 | **1** | ✅ |
| `sync_map` conflicts | 0 | **0** | ✅ |
| `grid_record_sync_state` | 空 | **0 行** | ✅ |
| `MAX(grid_inspection_records.id)` | 7192 | **7192** | ✅ |

**基线 12/12 全吻合（`baselineAllMatch=true`）。**

外部数据源侧：**WPS = 2063 条**，`BT` 存在、`EA` 存在（WPS-only = BT / EA）。

### 6.1 只读性硬证明

本次审计对生产库发出的全部语句：`statementCount = 4`，**`writeCount = 0`**（4 条全为 `SELECT`），`writes = []`。

---

## 7. §八 第六步：10 条人工迁移记录（只读核验，零漂移）

| PG id | 人员 | 期望 `grid_id`/`inspector_employee_id` | 实测 | 结果 |
|---|---|---|---|---|
| 7183 | 王铁民 | `60/6789` | `60/6789` | ✅ |
| 7184 | 谢俊章 | `14/7437` | `14/7437` | ✅ |
| 7185 | 刘金涛 | `6/6698` | `6/6698` | ✅ |
| 7186 | 刘金涛 | `6/6698` | `6/6698` | ✅ |
| 7187 | 刘金涛 | `6/6698` | `6/6698` | ✅ |
| 7188 | 刘金涛 | `6/6698` | `6/6698` | ✅ |
| 7189 | 刘金涛 | `6/6698` | `6/6698` | ✅ |
| 7190 | 刘金涛 | `6/6698` | `6/6698` | ✅ |
| 7191 | 黄殿兴 | `1/6692` | `1/6692` | ✅ |
| 7192 | 黄殿兴 | `1/6692` | `1/6692` | ✅ |

**指纹**（供重启后逐字节比对）：
```
7183:60/6789|7184:14/7437|7185:6/6698|7186:6/6698|7187:6/6698|7188:6/6698|7189:6/6698|7190:6/6698|7191:1/6692|7192:1/6692
```
`mismatches = []`，`missing = []`，**10/10 零漂移**。

---

## 8. §九 第七步：BT / EA 状态

| 检查 | 实测 | 结果 |
|---|---|---|
| WPS 中 `BT` 存在 | `hasBT = true` | ✅ |
| WPS 中 `EA` 存在 | `hasEA = true` | ✅ |
| PG `sync_map` 中 `BT` 映射 | **不存在**（`inPgSyncMap = []`） | ✅ |
| PG `sync_map` 中 `EA` 映射 | **不存在** | ✅ |

`pgMapClean = true` —— 冻结排除生效，BT/EA 从未进入 PG 映射。本阶段未删除、未修改 WPS 中 BT/EA。

---

## 9. §十 第八步：327 条 NULL `grid_id`

```
COUNT(grid_id IS NULL)            = 327          ✅
集合摘要（重启后须逐值一致）
  SUM(id) = 2275920
  COUNT   = 327
  MIN(id) = 6797
  MAX(id) = 7123
```

未执行任何 `WPS 分组 → grid` / `姓名 → grid` / `乡镇名称 → grid` / `公司管理 → grid` / 模糊匹配 `→ grid` 的动作；**未回填**。

---

## 10. §十一 第九步：`DEPLOYMENT_PREFLIGHT` 判定

```
DEPLOYMENT_PREFLIGHT = READY_FOR_MANUAL_RESTART
```

**判定依据（三类结论对照）**：

| 结论 | 适用条件 | 本阶段是否适用 |
|---|---|---|
| `ALREADY_DEPLOYED` | 生产 5876 已确认加载 SYNC-02 | ❌ 运行态 `/status` 无 `reverseWriteEnabled`/`exclusions`，`/push` 返回 200 |
| `BLOCKED` | 发现任何异常 | ❌ 无异常（数据安全 8/8、磁盘 13/13、`.env` 合规、基线 12/12） |
| **`READY_FOR_MANUAL_RESTART`** | 磁盘 SYNC-02 完整 + 数据基线正常 + `.env` 正常 + 当前确为旧代码 + 无新阻塞 | ✅ **全部满足** |

**四要素逐项确认**：
1. ✅ 磁盘 SYNC-02 完整（§5 十三点 13/13）
2. ✅ 数据基线正常（§6 十二项 12/12、人工 10 条零漂移、327 保持、BT/EA 未入映射）
3. ✅ `.env` 正常（`WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=false`，无危险项）
4. ✅ 当前生产确实为旧代码（`PRE_SYNC_01_ORIGINAL_LOADED`，行为 + 时间线双证）
5. ✅ 未发现新的阻塞问题

---

## 11. §十二 停止点声明（严格执行）

```
RESTART_AUTHORIZATION = NOT GRANTED
```

判定为 `READY_FOR_MANUAL_RESTART` 后**立即停止**。本阶段**未**执行且**不会**执行：

- ❌ restart / stop / start 5876
- ❌ kill 生产 PID 27316
- ❌ 修改 `.env`（含 `WPS_GRID_DATA_SOURCE` / `WPS_GRID_SYNC`）
- ❌ 开启 Scheduler
- ❌ 执行生产 Pull（`/pull` 真实写入模式、`/reconcile`）
- ❌ 修改 PostgreSQL / WPS 数据
- ❌ 回滚 SYNC-02
- ❌ 修改 JWT / 认证 / 登录代码

**等待人工明确授权。**

---

## 12. 重启前快照（已冻结，供重启后逐项比对）

| 项 | 冻结值 |
|---|---|
| PID | `27316` |
| 进程启动 | `2026-09-11 07:22:21` |
| `/api/health` | `{"code":0,"data":{"status":"ok",...}}` |
| `.env` mtime / size | `2026-09-11 07:13:11.963` / `4225 B` |
| `gir / sm` | `2061 / 2061` |
| `grid_id IS NULL / NOT NULL` | `327 / 1734` |
| NULL 集合摘要 | `SUM(id)=2275920, COUNT=327, MIN=6797, MAX=7123` |
| `inspector_employee_id` 非空 | `10` |
| live `grid_areas` / users / gi / adm | `62 / 63 / 62 / 1` |
| `conflict / sync_state / MAX(id)` | `0 / 0 行 / 7192` |
| 人工 10 条指纹 | 见 §7 |
| WPS 总记录 | `2063`（含 BT、EA） |

---

## 13. 重启后验收清单（授权后执行，本阶段不执行）

### 13.1 前置条件
1. 已获得**人工明确授权**
2. 确认 `.env` **未被修改**（`WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=false`）
3. §12 快照已留存

### 13.2 HTTP 契约验收（重启后必须全部成立）

| # | 请求 | 期望 |
|---|---|---|
| 1 | `GET /api/health` | HTTP 200，`data.status='ok'` |
| 2 | `GET /api/wps-grid-sync/status` | **`data.reverseWriteEnabled === false`** |
| 3 | `GET /api/wps-grid-sync/status` | **`data.exclusions` 深等于 `['BT','EA']`** |
| 4 | `GET /api/wps-grid-sync/status` | `data.syncEnabledByEnv === false` |
| 5 | `GET /api/wps-grid-sync/status` | `data.hashScopeColumns === 18` |
| 6 | `GET /api/wps-grid-sync/status` | `data.mappingCount === 2061`、`data.conflicts === 0` |
| 7 | `POST /api/wps-grid-sync/push` | **HTTP 410，`data.code === 'REVERSE_WRITE_DISABLED'`** |
| 8 | `POST /api/wps-grid-sync/pull {dryRun:true}` | `inserted=0 / updated=0 / pgDeleted=0 / errors=0`，WPS 写=0 |

### 13.3 数据不变量验收
§12 快照**逐项零变化**；人工 10 条指纹逐字节一致；327 条 NULL 集合摘要一致；新 PID ≠ 27316。

### 13.4 Scheduler
`WPS_GRID_SYNC=false` ⇒ 调度器**休眠**、`runPull()` 首行早退。**不得**置 `true`；开启 15 分钟自动同步须**另行评审**。

### 13.5 回滚
还原 `server/backups/wpssync02_20260911/*.bak` 与 `server/backups/wpssync01_20260911/*.bak` 后重启即可；**数据层无需回滚**（本阶段零 DML）。

---

## 14. §十九 遗留问题（本阶段仅记录，一律不动）

`/uploads/...` 相对路径图片、历史 `'--'` 占位符（1238 行）、327 条 NULL `grid_id` 归属、Excel import 姓名模糊匹配、前端按钮角色隐藏、WPS `own_grid`、admin `employee_id`、`township/org_grid`、WPS Schema 治理。

以上全部**独立立项**，本阶段未触碰。

---

## 15. §十三 报告状态

```
PHASE_WPS_PG_SYNC_04A_READY_FOR_MANUAL_RESTART
```

| 字段 | 值 |
|---|---|
| `DATA_SAFETY_GATE` | **PASS**（8/8） |
| `DEPLOYMENT_GATE` | **PASS**（磁盘就绪 13/13；运行态未部署，`needRestart=true`） |
| `RESTART_AUTHORIZATION` | **NOT GRANTED** |
| `FINAL_STATUS` | **`PHASE_WPS_PG_SYNC_04A_READY_FOR_MANUAL_RESTART`** |

**下一阶段**：`WPS-PG-SYNC-04-B` —— 取得人工重启授权 → 按 §13 执行部署与验收。

---

## 附录 A　证据索引

| 证据 | 路径 |
|---|---|
| 前置门禁审计 JSON | `server/scripts/output/wpssync04a-preflight.json` |
| 审计脚本 | `server/scripts/_wpssync04a_audit.cjs` |
| SYNC-00 报告 | `docs/HSE网格巡查身份链_WPS-PG-SYNC-00_WPS转PG同步机制审计与设计冻结报告_20260911.md` |
| SYNC-01 报告 | `docs/HSE网格巡查身份链_WPS-PG-SYNC-01_WPS反向写入隔离与单向同步安全改造报告_20260911.md` |
| SYNC-02 报告 | `docs/HSE网格巡查身份链_WPS-PG-SYNC-02_WPS到PG单向Pull引擎实施报告_20260911.md` |
| SYNC-03 报告 | `docs/HSE网格巡查身份链_WPS-PG-SYNC-03_首次受控生产Pull与生产运行态验收报告_20260911.md` |
| 备份（回滚用） | `server/backups/wpssync02_20260911/*.bak`、`server/backups/wpssync01_20260911/*.bak` |

## 附录 B　审计只读性自证

- 生产库语句：`4 条，全部 SELECT`，`writeCount = 0`
- WPS 侧：`2063` 条读取，`create/update/delete` 调用 **0 次**（写方法已被审计包装为抛错拦截，`writeAttempts = []`）
- `.env`：`mtime 07:13:11.963` 未变、`size 4225` 未变
- 5876：`PID 27316` 未变、`uptime` 单调递增（无重启）
- DDL：`0`

---

**执行人**：AI 审计（WorkBuddy / Agent 模式）
**审计性质**：只读前置门禁
**签署**：本报告不构成任何部署授权，部署须另行人工批准。
