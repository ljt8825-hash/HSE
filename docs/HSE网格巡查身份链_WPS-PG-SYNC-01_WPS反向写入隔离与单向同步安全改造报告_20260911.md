# HSE 网格巡查身份链 · WPS-PG-SYNC-01
## WPS → PG 单向同步引擎隔离与反向写入封禁报告

- 项目：`G:\hse-dashboard`
- 后端：`G:\hse-dashboard\server`
- 正式前端：`G:\hse-dashboard\安全看板vben\apps\web-naive`
- 生产端口：`5876`
- 阶段：**WPS-PG-SYNC-01（反向写入隔离与单向同步安全改造）**
- 报告日期：2026-09-11
- 执行时间窗：2026-09-11 07:47 – 07:5x（GMT+8）
- 终态：**`PHASE_WPS_PG_SYNC_01_COMPLETED_READY_FOR_SYNC_02`**

---

## 1. 实施前架构

按 WPS-PG-SYNC-00 冻结架构，本阶段前系统内 `services/wpsGridSyncService.js` 是一个**双向同步引擎**，且反向写入（PG → WPS）已挂进正式业务写路径：

```
site-mgmt POST/PUT ──▶ onPgRowChanged() ──▶ pushRow() ──▶ WPS create/update
site-mgmt DELETE    ──▶ onPgRowsDeleted() ─▶ WPS delete
cron(15min) reconcile ─▶ ①pull(WPS→PG) ②push(PG→WPS) ③PG删除追平→删WPS
POST /api/wps-grid-sync/push ──▶ pushRow() ──▶ WPS
```

配置（实施前，真机只读）：`.env` `WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=false`（mtime 2026-09-11 07:13:11）；WPS 凭证齐备（`isConfigured()=true`）；同步引擎**从未运行**（`grid_record_sync_state` 为空）。

> ⚠ 实施前高风险：`SYNC_ENABLED = process.env.WPS_GRID_SYNC !== 'false'` —— 语义为「**未设置即启用**」。删除 `.env` 该行即立刻打开双向同步（含写/删 WPS）。

---

## 2. PG → WPS 完整调用链清单（实施前，实际读码）

| # | 类别 | 位置 | 触发 | 行为 |
|---|---|---|---|---|
| 1 | HTTP 手工触发 | `routes/wps-grid-sync.js` `POST /push` | 持 JWT 管理端 | 读取 PG 行 → `svc.pushRow()` → WPS create/update |
| 2 | 定时任务 | `services/wpsGridSyncScheduler.js` cron(15min) | 定时 | `svc.reconcile()`（含下行 push + 删除追平） |
| 3 | POST 业务钩子 | `routes/site-mgmt.js:1736` | `POST /grid-records` 成功后 | `onPgRowChanged()` → `pushRow()` → WPS |
| 4 | PUT 业务钩子 | `routes/site-mgmt.js:1652` | `PUT /grid-records/:id` 成功后 | `onPgRowChanged()` → `pushRow()` → WPS |
| 5 | DELETE 业务钩子 | `routes/site-mgmt.js:1787` | `DELETE /grid-records` 后 | `onPgRowsDeleted()` → WPS delete + 删 sync_map |
| 6 | reconcile 内部 | `wpsGridSyncService.reconcile()` 步骤2 | 被 #1/#2 调用 | 批量 `pushRow()`（PG→WPS） |
| 7 | reconcile 内部 | `wpsGridSyncService.reconcile()` 步骤3 | 被 #1/#2 调用 | PG 行消失 → WPS `deleteRecords()` + 删 sync_map |
| 8 | 其他隐式 | `POST /reconcile`、`POST /trigger`、`POST /webhook` | 手工/回调 | #6/#7；`/webhook` 反向不写（仅 WPS→PG pull） |

**调用方排查**：前端 `安全看板vben/apps/web-naive/src` **零引用** `wps-grid-sync`；server 内除自引用外无其他调用方；`scripts/` 无调用方。

---

## 3. 修改文件清单

| 文件 | 变更行数 | 变更摘要 |
|---|---|---|
| `services/wpsGridSyncService.js` | 188 | 开关语义收紧；反向写入硬锁；`pushRow/onPgRowChanged/onPgRowsDeleted` 改为 fail-closed；`reconcile` 单向化；`pullFromWps` 删除分支封禁；`status` 暴露反向状态 |
| `services/wpsGridSyncScheduler.js` | 21 | `runReconcile` 增加 `!isEnabled()` 双重保险；日志/注释单向化 |
| `routes/wps-grid-sync.js` | 34 | `POST /push` 下线（410 fail-closed）；`/reconcile` 文档单向化 |
| `routes/site-mgmt.js` | 9 | 摘除 3 处同步钩子；移除 `wpsGridSync` require |
| `scripts/_wpssync01_gate.cjs`（新增） | — | 门禁测试（44 项） |
| `scripts/_wpssync01_switch_probe.cjs`（新增） | — | 开关语义探针 |

备份（可回滚）：`server/backups/wpssync01_20260911/*.bak`（4 个原始文件）。

---

## 4. 删除 / 隔离的反向写入路径

| 路径 | 处置 | 结果 |
|---|---|---|
| `site-mgmt.js` POST 钩子 (#3) | **删除** | PG POST 只写 PG |
| `site-mgmt.js` PUT 钩子 (#4) | **删除** | PG PUT 只写 PG |
| `site-mgmt.js` DELETE 钩子 (#5) | **删除** | PG DELETE 只写 PG |
| `svc.pushRow()` | **fail-closed**（硬锁返回 `{disabled:true}`，绝不触达 WPS 写 API） | 无 WPS 写 |
| `svc.onPgRowChanged()` | **no-op**（仅告警日志） | 无 WPS 写 |
| `svc.onPgRowsDeleted()` | **no-op**（不删 WPS，不删 sync_map） | 无 WPS 写/删 |
| `svc.reconcile()` 步骤2 | **移除** | 不再 PG→WPS push |
| `svc.reconcile()` 步骤3 | **移除** | 不再 PG删除→删WPS |
| `site-mgmt` WPS 数据源分支 `gridWps.*` | **保留**（见 §15 未解决问题） | `WPS_GRID_DATA_SOURCE=false` 下不可达 |

---

## 5. `/push` 处理方式

`POST /api/wps-grid-sync/push` **下线**（保留路由注册不破坏加载）：

```js
router.post('/push', async (_req, res) => {
  return res.status(410).json(error(410,
    'PG→WPS 反向推送功能已下线（WPS-PG-SYNC-01 反向写入隔离）',
    { code: 'REVERSE_WRITE_DISABLED' }));
});
```

- 不读取/不写入任何 WPS 数据；不读取 PG 行；不调用 `svc.pushRow`。
- 前端/脚本**无调用方**，故可直接下线而非兼容。

---

## 6. reconcile 单向化结果

`reconcile()` 现仅执行上行只读拉取：

```
reconcile()
  └─ pullFromWps()   ← 仅 WPS → PG（本阶段不执行，见 §16）
     push = { disabled: true, reason: 'REVERSE_WRITE_DISABLED' }   ← 恒不执行
     pgDeletedCatchUp = 0                                          ← 恒不执行
```

- 不再调用 `pushRow()` / `wps.createRecords` / `wps.updateRecords` / `wps.deleteRecords`。
- 报告保留 `push`/`pgDeletedCatchUp` 键仅为结构兼容，恒为“未执行”。

---

## 7. scheduler 安全结果

`wpsGridSyncScheduler.runReconcile()` 首行新增硬保险：

```js
if (!svc.isEnabled()) return { skipped: true, reason: 'disabled' };
```

- `WPS_GRID_SYNC=false`（含未设置/空/其他值）→ `isEnabled()=false` → **直接休眠返回**，不做上行/下行/删除。
- `initWpsGridSyncScheduler()` 在 `!isEnabled()` 时不注册 cron（沿用原逻辑）。
- 即「注册 scheduler」也不会产生任何 WPS/PG 业务数据变化。

---

## 8. WPS_GRID_SYNC 开关语义

**改造前**：`process.env.WPS_GRID_SYNC !== 'false'`（未设置 = 启用，生产高风险）。
**改造后**：

```js
const SYNC_ENABLED = process.env.WPS_GRID_SYNC === 'true';
```

| WPS_GRID_SYNC | 结果 |
|---|---|
| `true` | **enabled** |
| `false` | disabled |
| 未设置 | disabled |
| `''`（空） | disabled |
| 其他值（如 `abc`） | disabled |

真机探针（子进程实测，见 `wpssync01-gate.json.switchProbe`）：`true→enabled`、`false→disabled`、`unset→disabled`、`abc→disabled` 全部符合。

`.env` **未修改**，保持 `WPS_GRID_SYNC=false`。

---

## 9. WPS 删除安全策略

**硬锁**：`DELETE_SYNC_ENABLED` 恒为 `false`，且 `pullFromWps` 内 **物理删除分支已整体移除**。

| 方向 | 改造前 | 改造后 |
|---|---|---|
| WPS 删 → PG 硬删（`WPS_SYNC_DELETE=true`） | 会 `DELETE FROM grid_inspection_records` | **已删除该代码路径；恒不删 PG，仅记录 `wps_missing` 告警** |
| PG 删 → WPS 删 | `onPgRowsDeleted` / reconcile 步骤3 | **已移除** |
| 数据库结构 | — | **未新增** `deleted_at`/`is_deleted`/`wps_missing` 列（DDL=0） |

真机验证（D 组）：listAllRecords 置空使 2061 条映射全部视为「WPS 已删」→ `wpsDeleted=2061`、`pgDeleted=0`、未调用任何 WPS 写/删 API、未发出 `DELETE grid_inspection_records`、PG 计数不变。

---

## 10. 自动化测试结果

脚本：`server/scripts/_wpssync01_gate.cjs` + `_wpssync01_switch_probe.cjs`
手法：进程级**最坏情况** env（`WPS_GRID_SYNC=true` + `WPS_SYNC_DELETE=true`）+ 真实 Express 路由 + `pool.query` 事务重定向 `BEGIN…ROLLBACK` + WPS 写 API 全程计数。

**结果：`ALL_PASS` 44/44**（`server/scripts/output/wpssync01-gate.json`）

| 组 | 覆盖 | 结果 |
|---|---|---|
| A（6） | 开关语义 4 态 + `reverseWriteEnabled` 恒 false + `deleteSyncEnabled` 硬锁 false | 6/6 PASS |
| B（11） | POST 200 / PUT own 200 / DELETE 403 / DELETE ALL 403 / admin 缺 confirmText 400；每步后 **WPS 零写**；POST 仍派生 inspector/grid | 11/11 PASS |
| C（6） | `onPgRowChanged`/`onPgRowsDeleted`/`pushRow`/`reconcile` 均 **WPS 零写**；`pushRow.disabled=true`；`reconcile.push.disabled=true` | 6/6 PASS |
| D（4） | WPS 记录消失 → `wpsDeleted=2061`、**`pgDeleted=0`**、无 WPS 写/删、无 `DELETE` 语句 | 4/4 PASS |
| E（10） | 生产不变量零漂移 | 10/10 PASS |
| F（4） | 静态隔离证据（引擎无 PG 删除、无 WPS 写 API；site-mgmt 无引擎引用/钩子） | 4/4 PASS |

> 真机 B3 观测：POST 仍正确派生 `inspector_employee_id=7099 / grid_id=48`（PG 身份链完好，未受隔离影响）。

---

## 11. 生产基线前后对比（零漂移）

| 指标 | 前 | 后 | 一致 |
|---|---|---|---|
| `grid_inspection_records` | 2061 | 2061 | ✅ |
| `grid_record_sync_map` | 2061 | 2061 | ✅ |
| `grid_id IS NULL` | 327 | 327 | ✅ |
| `grid_id IS NOT NULL` | 1734 | 1734 | ✅ |
| `inspector_employee_id IS NOT NULL` | 10 | 10 | ✅ |
| `live grid_areas` | 62 | 62 | ✅ |
| `active users`（admin 1 / grid_inspector 62） | 63 | 63 | ✅ |
| `sync_map conflict` | 0 | 0 | ✅ |
| `grid_record_sync_state` | 空 `[]` | 空 `[]` | ✅ |

`.env` mtime 全程 `2026-09-11 07:13:11` 未变；5876 进程 PID 27316 全程未变（本阶段重启 0 次）。

---

## 12. WPS 写入计数

```
WPS writes = 0      （createRecords / updateRecords / deleteRecords 全程 0 次）
WPS deletes= 0
```

门禁测试对 `wpsClient.{createRecords,updateRecords,deleteRecords}` 与 `adapter.{createRecord,updateRecord,deleteRecord}` 全程计数，B/C/D 三组断言均为 0。

---

## 13. 数据库写入计数

```
DB 业务数据 writes = 0   （users / grid_areas / grid_inspection_records / grid_record_sync_map 零 DML）
```

- B 组 PG 业务写入全部发生在事务内并 `ROLLBACK`，零残留；
- D 组 pull 非干跑调用：`setState(last_pull_at)` 亦被重定向进事务并回滚 → `grid_record_sync_state` 仍为空；
- 唯一执行的 DDL 语句为 `CREATE TABLE IF NOT EXISTS`（在 `ensureTables()` 内，表已存在 → **no-op**，无结构变化，且发生在已回滚/幂等路径）。

---

## 14. DDL 计数

```
DDL changes = 0    （无 CREATE/ALTER/DROP/INDEX 任何结构变更；未新增软删列）
```

---

## 15. 未解决问题（记录，不在本阶段处理）

| # | 项 | 现状 | 建议 |
|---|---|---|---|
| U1 | **WPS 数据源原生分支**仍可写 WPS | `site-mgmt.js` 内 `if(ds==='wps') gridWps.create/update/remove/clearAll`；受 `WPS_GRID_DATA_SOURCE=false`（已冻结）保护，生产不可达 | 保持现状；SYNC-02 评估是否加二次硬门禁 |
| U2 | **admin 管理端点** `/api/wps/dbsheet/*`（`integration-test`/`cleanup`）可写/删 WPS 测试标记记录 | 仅 `system_admin`/`admin` 角色可访问；自清理测试记录；**非 PG 业务链路** | 记录；SYNC-02 评估是否限流/审计 |
| U3 | 两套 `FIELD_MAP` 并存 | 本阶段未合并（避免扩大变更面） | **SYNC-02 必须统一**，以 `services/wps/wpsFieldMap.js` 为语义基底 |
| U4 | `pullFromWps` 幂等键仅 `wps_record_id`（缺 file_id）；`findPgIdByNaturalKey` 用姓名+日期 | 本阶段记录，未改 | **SYNC-02**：键统一为 `(wps_record_id, wps_file_id)`；废弃自然键 |
| U5 | BT/EA 排除名单 | pull 未运行，BT/EA 未进 PG（现状安全） | **SYNC-02 必须内置排除名单** |
| U6 | `bindMap` 冲突键为 `pg_record_id`（可改绑） | 未改 | SYNC-02 对齐为 `(wps_record_id,wps_file_id)` |
| U7 | 生产 5876 运行态代码 | 未重启（本阶段未授权重启）→ 运行进程仍为改造前代码 | 因 `WPS_GRID_SYNC=false`，运行态本就不反向写；改动于**下次授权重启/部署**后生效 |
| U8 | 327 NULL `grid_id`、10 条人工补迁、admin 未绑 employee | 保持冻结 | 不回填、不动 |

---

## 16. WPS-PG-SYNC-02 前置条件

进入 SYNC-02（单向 pull 引擎落地）前须满足：

1. **本阶段验收通过**：反向写入已封禁、`/push` 已下线、`reconcile` 单向、scheduler 安全、开关语义收紧（✅ 已完成）。
2. **统一 FIELD_MAP**（以 `wps/wpsFieldMap.js` 为基底）。
3. **幂等键统一** `(wps_record_id, wps_file_id)`；废弃姓名+日期自然键。
4. **排除名单** BT / EA 内置；未映射记录 → `PENDING_HUMAN_CONFIRMATION`（身份/网格 FAIL-CLOSED 置 NULL）。
5. **图片 URL 校验**（仅 `^https?://` 落库）。
6. **DRY_RUN 零写入先行**，再灰度实跑。
7. `.env` `WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=false` 保持不变（不得为测试开启）。

---

## 附录 A：验收签字（本阶段）

```text
[x] PG → WPS 所有业务钩子已隔离
[x] /push 已下线（410 REVERSE_WRITE_DISABLED）
[x] reconcile 不再执行 PG → WPS
[x] reconcile 不再删除 WPS
[x] scheduler disabled 时不执行同步
[x] WPS_GRID_SYNC 只有明确 true 才 enabled
[x] WPS_SYNC_DELETE 不再产生 PG/WPS 删除（硬锁）
[x] PG POST/PUT/DELETE 不触发 WPS 写
[x] WPS writes = 0
[x] DB 业务数据 writes = 0
[x] DDL = 0
[x] frontend = 0
[x] auth/JWT = 0
[x] BT/EA 未发生任何变化
[x] 2061/2061/327/1734/10/62/63/0 基线不变
```

- 门禁测试：**44/44 ALL_PASS**（`server/scripts/output/wpssync01-gate.json`）。
- 未 INSERT/UPDATE/DELETE 任何业务表；未调用任何 WPS 写 API；未改 `.env`/前端/auth/DDL；未重启 5876。

## 附录 B：真机证据

| 证据 | 路径 |
|---|---|
| 门禁测试输出 | `server/scripts/output/wpssync01-gate.json` |
| 门禁测试脚本 | `server/scripts/_wpssync01_gate.cjs` |
| 开关语义探针 | `server/scripts/_wpssync01_switch_probe.cjs` |
| 修改前备份 | `server/backups/wpssync01_20260911/*.bak` |

**最终状态：`PHASE_WPS_PG_SYNC_01_COMPLETED_READY_FOR_SYNC_02`**
