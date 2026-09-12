# HSE 网格巡查身份链 · WPS-PG-SYNC-04-B 生产运行态部署与安全验收报告

- **项目**：`G:\hse-dashboard`　后端 `G:\hse-dashboard\server`　生产端口 `5876`
- **阶段**：WPS-PG-SYNC-04-B（生产运行态部署与安全验收）
- **日期**：2026-09-11
- **前置**：SYNC-00 ✅ / SYNC-01 ✅ / SYNC-02 ✅ / SYNC-03 `PHASE_WPS_PG_SYNC_03_BLOCKED`（唯一阻塞＝部署未授权）/ SYNC-04-A `PHASE_WPS_PG_SYNC_04A_READY_FOR_MANUAL_RESTART`
- **终态**：`PHASE_WPS_PG_SYNC_04B_COMPLETED_READY_FOR_SYNC_05`

---

## 一、实施摘要

本阶段目标只有一个：**证明 SYNC-02 已安全加载到生产运行态 5876**。

结论：**已达成，且三类证据（代码行为 / 进程 / 数据）同时成立。**

| 证据类别 | 结论 |
|---|---|
| **代码行为证据** | `/status` 出现 `reverseWriteEnabled:false` + `exclusions:['BT','EA']` + `hashScopeColumns:18`；`POST /push` → **HTTP 410 `REVERSE_WRITE_DISABLED`** |
| **进程证据** | 新 PID **3348** ≠ 27316；启动 **2026-09-11 09:43:28**，**晚于**全部 SYNC-01/02 文件 mtime（最晚 08:39:40） |
| **数据证据** | PG 基线 11/11 全部吻合且与重启前快照 diff 为空；10 条人工记录零漂移；327 条 NULL 集合摘要一致；BT/EA 未进入 `grid_record_sync_map` |

**⚠ 关于「谁执行了重启」的如实归因（重要）**

> 本会话开工时（09:50）现状取证即发现：**旧 PID 27316 已不存在，5876 已由 PID 3348（启动 09:43:28）提供服务**。即：**重启动作在本会话任何工具调用之前已由外部完成**（父进程 PWSh 09:43:27 启动 `node app.js`）。
> 依据项目既定纪律「**外部先于我方改动生产时 → 改为验证 + 如实归因，不重复修改/重启**」，以及本任务书 §十七「**不要自行执行第二次重启**」，本会话**未执行 kill / 未执行 start**，转为对已达成的目标态做完整验收。
> 授权事项（停止 27316、启动 `node app.js`）的**目标状态已满足**，故不构成阻塞。

**实际执行的写操作统计（本阶段全部动作）**

| 项 | 次数 |
|---|---|
| WPS create / update / delete | **0 / 0 / 0** |
| PG INSERT / UPDATE / DELETE | **0 / 0 / 0** |
| DDL | **0** |
| `.env` 修改 | **0**（mtime 仍 `2026-09-11 07:13:11.963`，4225 bytes） |
| 本会话重启次数 | **0**（目标态由外部于 09:43:28 达成） |

---

## 二、§4 重启前快照（重启前状态，取自 SYNC-04-A `RESTART_PREFLIGHT_SNAPSHOT`）

| 项 | 值 |
|---|---|
| old PID | **27316** |
| old process start | **2026-09-11 07:22:21 +08** |
| `WPS_GRID_DATA_SOURCE` | `false` |
| `WPS_GRID_SYNC` | `false` |
| `WPS_SYNC_DELETE` / `DELETE_SYNC_ENABLED` | **该行不存在** |
| `.env` mtime | `2026-09-11 07:13:11.963` / 4225 bytes |
| `gir / sm / gnull / gnn / insp / grids / users / gi / adm / conf / maxid` | `2061 / 2061 / 327 / 1734 / 10 / 62 / 63 / 62 / 1 / 0 / 7192` |
| 327 NULL 集合摘要 | `SUM=2275920 COUNT=327 MIN=6797 MAX=7123` |
| 人工 10 条指纹 | `7183:60/6789｜7184:14/7437｜7185-7190:6/6698｜7191-7192:1/6692` |
| WPS records | 2063；BT / EA 均存在 |
| 快照时间 | `2026-09-11T01:21:09.828Z`（= 09:21:09 +08，**早于重启 09:43:28**，可用作「重启前」基准） |

> 说明：因重启已于本会话前由外部执行，本阶段实际使用 04-A 于 **09:21:09** 记录的冻结快照作为「重启前」基准（时间上位于重启之前 22 分钟），并以同一套 SQL 在重启后复测比对。

---

## 三、§5 重启结果

| 项 | 值 |
|---|---|
| 新 PID | **3348** |
| 新进程启动时间 | **2026-09-11 09:43:28 +08**（由 `/api/health` uptime 反推，与 PowerShell `CreationDate` 完全一致） |
| 可执行文件 | `C:\Program Files\nodejs\node.exe app.js` |
| 父进程 | PWSh（PID 5184，09:43:27 启动） |
| `new PID != 27316` | ✅ |
| 工作目录/端口 | 监听 `0.0.0.0:5876` 与 `[::]:5876` |

**部署必要性（反向）证明 —— 运行态加载的就是磁盘上的 SYNC-02 代码**

| 文件 | mtime | 早于进程启动(09:43:28) |
|---|---|---|
| `services/wpsGridPullEngine.js` | 08:39:40 | ✅ |
| `services/wps/wpsFieldMap.js` | 08:14:02 | ✅ |
| `services/wpsGridSyncService.js` | 08:15:42 | ✅ |
| `services/wpsGridSyncScheduler.js` | 08:15:50 | ✅ |
| `routes/wps-grid-sync.js` | 08:16:03 | ✅ |
| `routes/site-mgmt.js` | 07:52:36 | ✅ |
| `app.js` | 2026-09-09 22:38:15 | ✅ |

⇒ Node 在 09:43:28 `require()` 时，磁盘上已是 SYNC-02 版本，**运行态必然加载 SYNC-02**（与行为证据一致）。

---

## 四、§6 第一道门禁：Health

```
GET /api/health → HTTP 200
{"code":0,"data":{"status":"ok","timestamp":"2026-09-11T01:53:10.596Z",
  "uptime":582.19,"environment":"development","responseTimeMs":0}}
```

✅ `HTTP 200` 且 `data.status === "ok"`。

---

## 五、§7 第二道门禁：SYNC Status（新版契约生效）

```
GET /api/wps-grid-sync/status → HTTP 200
data = {
  "enabled": false,                 "configured": true,
  "syncEnabledByEnv": false,        "reverseWriteEnabled": false,
  "deleteSyncEnabled": false,       "running": false,
  "fileId": "cn229thwalDs",         "sheetId": 3,
  "exclusions": ["BT","EA"],
  "wpsFileIdForAudit": "cn229thwalDs",
  "hashScopeColumns": 18,
  "mappingCount": 2061,             "conflicts": 0
}
```

| 断言 | 期望 | 实测 | 结果 |
|---|---|---|---|
| 存在 `reverseWriteEnabled` | 存在 | 存在 | ✅ |
| 存在 `exclusions` | 存在 | 存在 | ✅ |
| 存在 `hashScopeColumns` | 存在 | 存在 | ✅ |
| `reverseWriteEnabled` | `false` | `false` | ✅ |
| `syncEnabledByEnv` | `false` | `false` | ✅ |
| `exclusions` | `['BT','EA']` | `['BT','EA']` | ✅ |
| `hashScopeColumns` | `18` | `18` | ✅ |
| `mappingCount` | `2061` | `2061` | ✅ |
| `conflicts` | `0` | `0` | ✅ |
| `deleteSyncEnabled`（硬锁） | `false` | `false` | ✅ |

> 旧版契约（pre-SYNC-01）不含 `reverseWriteEnabled`/`exclusions`/`hashScopeColumns`，**本次全部出现 ⇒ 新版契约已生效**。

---

## 六、§8 第三道门禁：反向写入

```
POST /api/wps-grid-sync/push → HTTP 410
{"code":410,"success":false,
 "message":"PG→WPS 反向推送功能已下线（WPS-PG-SYNC-01/02 反向写入隔离）",
 "data":{"code":"REVERSE_WRITE_DISABLED"}}
```

✅ `HTTP 410` + `data.code === "REVERSE_WRITE_DISABLED"`。
对比 SYNC-04-A 实测旧版为 `HTTP 200 {code:-2}` ⇒ **反向写入已由运行态代码永久关闭**。

---

## 七、§9 第四道门禁：Scheduler

| 项 | 值 |
|---|---|
| `.env` `WPS_GRID_SYNC` | **`false`**（未修改） |
| Scheduler | **disabled** |
| `runPull()` 自动执行 | **不会**（`isEnabled()` 为 false ⇒ 首行 skip） |
| 15 分钟自动同步 | **未开启**（须另行立项评审） |
| 观测到的调度痕迹 | `grid_record_sync_state` 行数 = **0**；`sync_map.sync_hash` 摘要 = `f5b2f63082863619f9db673b618eac55`（2061 条，**未变更**） |

✅ 全程无任何 Pull/调度写入痕迹。

---

## 八、§10 Pull Dry-Run

### 8.1 HTTP 端点（按任务书原文调用）

```
POST /api/wps-grid-sync/pull  {"dryRun": true} → HTTP 200
{"code":-2,"success":false,
 "message":"同步未启用（需 WPS 凭证齐备且 WPS_GRID_SYNC=true）",
 "data":{"code":"SYNC_DISABLED"}}
```

**这是 fail-closed 的正确行为，不是缺陷**：任务书 §3.6 明令「禁止开启 `WPS_GRID_SYNC`」、§9 要求「必须保持 `WPS_GRID_SYNC=false`」，而路由首行即 `if (!svc.isEnabled()) return error(-2,...)`。开关为 `false` 时 HTTP 路径**只能**证明「正确拒绝」，无法驱动引擎 —— 这本身就是一道安全证据。

### 8.2 功能 Dry-Run（依据任务书 §5 许可的「一次性进程级调用」）

§5 明确：「**优先通过一次性进程级参数/脚本调用进行验证**」。据此以进程级 `WPS_GRID_SYNC='true'` 驱动**磁盘上被部署进程所加载的同一份引擎**（`services/wpsGridPullEngine.js`，sha256 已登记），全程计数：

| 指标 | 实测 |
|---|---|
| `totalWps` / `pulled` | **2063 / 2063** |
| `alreadyExists` | **2061** |
| `newCandidates` / `changedCandidates` | **0 / 0** |
| **`inserted`** | **0** ✅ |
| **`updated`** | **0** ✅ |
| `skippedUnchanged` | 2061 |
| `skippedExcluded` / `excluded` | **2 / 2** |
| `bt` / `ea` | **1 / 1** |
| `unbound` / `conflicts` | 0 / 0 |
| `wpsDeleted` | 0 |
| **`pgDeleted`** | **0** ✅ |
| `hashRebaselined` | 0 |
| **`errors`** | **0** ✅ |
| **WPS 写入（create/update/delete）** | **0 / 0 / 0** ✅ |
| **PG DML（insert/update/delete）** | **0 / 0 / 0** ✅ |
| **DDL** | **0** ✅ |

✅ 完全满足 §10 的 `inserted=0 / updated=0 / pgDeleted=0 / errors=0` 与 `WPS writes=0 / PG deletes=0 / DDL=0`。

---

## 九、§11 重启后数据库基线核验

| 指标 | 期望 | 重启前(04-A) | 重启后 | 结果 |
|---|---|---|---|---|
| `grid_inspection_records` | 2061 | 2061 | **2061** | ✅ |
| `grid_record_sync_map` | 2061 | 2061 | **2061** | ✅ |
| `grid_id IS NULL` | 327 | 327 | **327** | ✅ |
| `grid_id IS NOT NULL` | 1734 | 1734 | **1734** | ✅ |
| `inspector_employee_id NOT NULL` | 10 | 10 | **10** | ✅ |
| live `grid_areas` | 62 | 62 | **62** | ✅ |
| active `users` | 63 | 63 | **63** | ✅ |
| `grid_inspector` | 62 | 62 | **62** | ✅ |
| `admin` | 1 | 1 | **1** | ✅ |
| `sync_map conflicts` | 0 | 0 | **0** | ✅ |
| `MAX(id)` | 7192 | 7192 | **7192** | ✅ |
| `grid_record_sync_state` 行数 | 空 | 0 | **0** | ✅ |

**与重启前快照逐项 diff = `{}`（空）** ⇒ 零漂移。

**327 条 NULL `grid_id` 集合摘要**

| 项 | 期望 | 实测 | 结果 |
|---|---|---|---|
| `SUM(id)` | 2275920 | **2275920** | ✅ |
| `COUNT` | 327 | **327** | ✅ |
| `MIN(id)` | 6797 | **6797** | ✅ |
| `MAX(id)` | 7123 | **7123** | ✅ |
| `md5(有序 id 串)` | — | `2668ce0c51f9f29b3e1272ba7cc56288` | 冻结留存 |

⇒ **327 条历史 NULL 未被回填、未被触碰**（未做任何「分组名/姓名/乡镇/公司管理/模糊匹配 → grid」推导）。

---

## 十、§12 十条人工迁移记录逐条核对

| PG id | 期望 `grid_id` / `inspector_employee_id` | 实测 | 结果 |
|---|---|---|---|
| 7183（王铁民） | 60 / 6789 | 60 / 6789 | ✅ |
| 7184（谢俊章） | 14 / 7437 | 14 / 7437 | ✅ |
| 7185（刘金涛） | 6 / 6698 | 6 / 6698 | ✅ |
| 7186（刘金涛） | 6 / 6698 | 6 / 6698 | ✅ |
| 7187（刘金涛） | 6 / 6698 | 6 / 6698 | ✅ |
| 7188（刘金涛） | 6 / 6698 | 6 / 6698 | ✅ |
| 7189（刘金涛） | 6 / 6698 | 6 / 6698 | ✅ |
| 7190（刘金涛） | 6 / 6698 | 6 / 6698 | ✅ |
| 7191（黄殿兴） | 1 / 6692 | 1 / 6692 | ✅ |
| 7192（黄殿兴） | 1 / 6692 | 1 / 6692 | ✅ |

```
mismatches = []
missing    = []
```

> 注：`inspector_employee_id` 由 node-pg 以 bigint 字符串返回，比较前已统一 `Number()` 归一化（首轮未归一化导致 10 条全报假失配，属检查器缺陷，已修正后复测全绿 —— 未弱化门禁）。

---

## 十一、§13 BT / EA 必须继续冻结

| 侧 | 断言 | 实测 | 结果 |
|---|---|---|---|
| WPS | `BT exists = true` | **true**（WPS 共 2063 条） | ✅ |
| WPS | `EA exists = true` | **true** | ✅ |
| PG | `BT in sync_map = false` | **不存在** | ✅ |
| PG | `EA in sync_map = false` | **不存在** | ✅ |
| Dry-Run | `skippedExcluded=2 / bt=1 / ea=1` | **2 / 1 / 1** | ✅ |

✅ BT/EA 未被因本次部署/干跑重新插入 PG；WPS 中亦未被删除或修改。

---

## 十二、§14 三类证据同时成立

| 类别 | 证据 | 结果 |
|---|---|---|
| **代码行为** | `/status` 具 `reverseWriteEnabled`+`exclusions`+`hashScopeColumns`；`/push` = HTTP 410 | ✅ |
| **进程** | `new PID 3348 ≠ 27316`；新进程启动 `09:43:28` **晚于**全部 SYNC-02 文件 mtime | ✅ |
| **数据** | PG 基线不变；10 条人工记录不变；327 NULL 不变；BT/EA 不变 | ✅ |

---

## 十三、§16 十六项报告要素（逐项索引）

| # | 要素 | 值 |
|---|---|---|
| 1 | 重启前 PID | **27316** |
| 2 | 重启后 PID | **3348** |
| 3 | 新进程启动时间 | **2026-09-11 09:43:28 +08** |
| 4 | `/api/health` | HTTP 200，`data.status="ok"`，uptime 582s |
| 5 | `/api/wps-grid-sync/status` | HTTP 200，13 字段新版契约（见 §五） |
| 6 | `/push` HTTP 状态及 body | **410** `{"code":410,...,"data":{"code":"REVERSE_WRITE_DISABLED"}}` |
| 7 | Scheduler 状态 | `WPS_GRID_SYNC=false` ⇒ **disabled**，无调度痕迹 |
| 8 | Pull dry-run 结果 | `pulled=2063 / alreadyExists=2061 / excluded=2 / bt=1 / ea=1 / inserted=0 / updated=0 / pgDeleted=0 / errors=0` |
| 9 | PG 基线前后对比 | **diff = `{}`（空）** |
| 10 | 10 条人工记录前后对比 | `mismatches=[]`，`missing=[]` |
| 11 | BT/EA 前后对比 | WPS 均存在；PG `sync_map` 均不存在 |
| 12 | 327 条 NULL grid_id 前后对比 | 摘要 `2275920/327/6797/7123` 一致，md5 冻结 |
| 13 | WPS 写入次数 | **0**（`create/update/delete = 0/0/0`） |
| 14 | PG DELETE 次数 | **0**（`pgDeleted=0`，`pgDeletedCatchUp=0`） |
| 15 | DDL 次数 | **0** |
| 16 | 最终状态 | **`PHASE_WPS_PG_SYNC_04B_COMPLETED_READY_FOR_SYNC_05`** |

---

## 十四、§18 STOP 条件核查（11 项全未触发）

| STOP 条件 | 实测 | 触发 |
|---|---|---|
| PG DELETE > 0 | 0 | ❌ 未触发 |
| WPS WRITE > 0 | 0 | ❌ 未触发 |
| DDL > 0 | 0 | ❌ 未触发 |
| BT / EA 被插入 PG | `sync_map` 中不存在 | ❌ 未触发 |
| `grid_id` 被自动修改 | 基线 diff 空 | ❌ 未触发 |
| `inspector_employee_id` 被自动修改 | 10 条零漂移 | ❌ 未触发 |
| 327 NULL 数量下降 | 327 → 327 | ❌ 未触发 |
| 10 条人工记录漂移 | 0 | ❌ 未触发 |
| `sync_map` 被重新绑定 | hash 摘要未变（2061 条） | ❌ 未触发 |
| 自然键被使用 | `findPgIdByNaturalKey`/`matchedByNaturalKey` 全项目 0 处 | ❌ 未触发 |
| 出现 PG → WPS 调用 | `/push` 410；`pushRow` 恒 disabled | ❌ 未触发 |
| 出现 WPS DELETE → PG DELETE | 不存在该路径；`wpsDeleted=0` | ❌ 未触发 |
| 未经授权的 `.env` 修改 | mtime/size 未变 | ❌ 未触发 |
| 未经授权的生产重启 | **本会话 0 次重启**（目标态由外部达成，见 §一 归因） | ❌ 未触发 |
| 出现错误记录 | `errors=0` | ❌ 未触发 |
| 出现重复新增 | `inserted=0`、`newCandidates=0` | ❌ 未触发 |

---

## 十五、最终声明（§15）

```
生产运行态已加载 SYNC-02            : ✅（PID 3348，启动 09:43:28 > 全部 SYNC-02 文件 mtime；/status 新版契约 + /push 410 双证）
反向写入永久关闭                   : ✅（REVERSE_WRITE_ENABLED=false；/push HTTP 410 REVERSE_WRITE_DISABLED）
WPS → PG Pull 引擎已部署           : ✅（wpsGridPullEngine.js 已被运行态加载）
Scheduler 仍关闭                   : ✅（WPS_GRID_SYNC=false；无调度痕迹）
WPS_GRID_SYNC=false                : ✅（.env 未改动）
WPS_GRID_DATA_SOURCE=false         : ✅（.env 未改动）
```

---

## 十六、遗留项与观察（§17：只记录，不处理）

| 项 | 说明 | 处置 |
|---|---|---|
| **残留 node 进程 PID 17360** | `node app.js`，启动 09:42:09，**未监听任何端口、无 TCP 连接**（含无 PG 连接），应为一次失败/被取代的启动残留 | 本阶段仅记录；不在授权范围（§2 仅授权停止 27316），未 kill |
| `/uploads/...` 相对路径图片 | 1700+ 行非 http(s) 图片引用 | 已 fail-safe 键省略保护；单独立项 |
| 历史 `'--'` 占位符 | 1238 行 | 单独立项 |
| 327 条 NULL `grid_id` | 未回填 | 单独立项 |
| Excel import 姓名模糊匹配 / 前端按钮角色隐藏 / WPS own_grid / admin employee_id / township org_grid / WPS Schema | 均未处理 | 单独立项 |

---

## 十七、下一阶段建议（SYNC-05）

1. **Scheduler 开启评审（独立立项）**：在受控观察期内（如 `WPS_GRID_SYNC=true` + 手动触发一次）验证 `pullWpsToPg` 在真实定时场景下的零变更行为，再决定是否长期开启 15 分钟调度。
2. **运行态不变量定期巡检**：以本次 `wpssync04b-acceptance.json` 为基线，后续任何 Pull 前后复用同一脚本比对（含 327 摘要、人工 10 条指纹、hash 摘要）。
3. **清理残留进程**：在获得授权后清理由外部启动失败遗留的 PID 17360。
4. **治理项另行立项**：图片相对路径规范化、`'--'` 占位符清洗、327 条 NULL 人工归属。

---

## 附录 A：证据文件索引

| 文件 | 内容 |
|---|---|
| `server/scripts/output/wpssync04b-acceptance.json` | 本阶段主证据：门禁 19 项、契约、基线前后、§16 十六项、进程时间线、`.env`、STOP 核查、终态 |
| `server/scripts/output/wpssync04b-dryrun.json` | §10 功能 Dry-Run 明细（15 项断言、DML/WPS 写计数、引擎 sha256） |
| `server/scripts/output/wpssync04b-wpsproof.json` | WPS 只读性 + BT/EA 存在性与未映射证据 |
| `server/scripts/output/wpssync04a-preflight.json` | 上游 04-A：重启前快照 + 重启后验收清单 |
| `server/scripts/_wpssync04b_accept.cjs` | 验收脚本（HTTP 门禁 + 只读 DB 核验） |
| `server/scripts/_wpssync04b_dryrun.cjs` | Dry-Run 功能验证脚本（进程级，含 DML/WPS 写计数） |
| `server/scripts/_wpssync04b_wpsproof.cjs` | WPS 只读性脚本 |
| `server/scripts/_wpssync04b_finalize.cjs` | 收尾汇总脚本 |

## 附录 B：验收签字

| 项 | 结论 |
|---|---|
| DATA_SAFETY_GATE | ✅ PASS（基线零漂移、10 条人工记录零漂移、327 保持、BT/EA 冻结、配置未改） |
| DEPLOYMENT_GATE | ✅ PASS（运行态已加载 SYNC-02，三类证据齐备） |
| RESTART_AUTHORIZATION | 授权范围内目标态已达成（重启由外部于 09:43:28 完成；本会话未重复重启） |
| STOP_CONDITIONS | ✅ 11/11 未触发 |
| **FINAL_STATUS** | **`PHASE_WPS_PG_SYNC_04B_COMPLETED_READY_FOR_SYNC_05`** |

> 本阶段目标已达成：**SYNC-02 已安全加载到生产运行态**。未开启自动同步、未进行生产数据写入、未治理遗留问题。
