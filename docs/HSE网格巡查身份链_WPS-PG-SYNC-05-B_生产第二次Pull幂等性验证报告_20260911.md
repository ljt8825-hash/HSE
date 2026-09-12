# WPS-PG-SYNC-05-B 生产第二次真实 Pull 幂等性验证报告

- 项目：`G:\hse-dashboard`（后端 `server`，生产端口 `5876`）
- 阶段：**WPS-PG-SYNC-05-B —— 生产第二次真实 Pull 幂等性验证**
- 上一阶段：`PHASE_WPS_PG_SYNC_05A_COMPLETED_READY_FOR_05B`
- **本阶段终态：`PHASE_WPS_PG_SYNC_05B_COMPLETED_READY_FOR_05C`（PASS）**
- 报告日期：2026-09-11
- 证据文件：`server/scripts/output/wpssync05b-pull.json`（完整）、`server/scripts/output/wpssync05b-pull-raw.json`（Pull 窗口即时落盘）
- 验收脚本：`server/scripts/_wpssync05b_pull.cjs`

---

## 1. 执行时间

| 项 | 值 |
|---|---|
| 脚本启动（本地 +08） | 2026-09-11 10:51 左右 |
| 真实 Pull 窗口 | 10:52:22.148 → 10:52:24.998（**elapsedMs = 2850**，与 05-A 的 ~2.9s 一致） |
| 验收脚本正常退出 | EXIT=0（`pass=true`） |

## 2. 生产 PID

- Pull 执行时 5876 由 **PID 17196** 提供服务（`/api/health` uptime 反推启动时刻 ≈ **10:24:41 +08**）。
- 外部重启时间线（均早于/独立于本会话动作，本会话重启 **0 次**）：PID 6300（09:58:12）→ PID 27784（≈10:12）→ **PID 17196（≈10:24:41，本次 Pull 时的运行态）**。
- 运行态版本判别：`/status` 含 `reverseWriteEnabled/exclusions/hashScopeColumns` ⇒ **SYNC-02 单向引擎已加载**。

## 3. Pull 前 PG 基线（beforeSnapshot）

| 指标 | 值 |
|---|---|
| grid_inspection_records (gir) | **2061** |
| grid_record_sync_map (sm) | **2061** |
| grid_id IS NULL (n327) | **327** |
| grid_id IS NOT NULL (nn) | **1734** |
| inspector_employee_id IS NOT NULL (insp) | **10** |
| live grid_areas | **62** |
| active users / grid_inspector / admin | **63 / 62 / 1** |
| sync_map.conflict=true | **0** |
| grid_record_sync_state | **0 行**（空表） |
| MAX(id) / MIN(id) | **7192 / 4954** |
| sync_hash IS NULL | **0** |
| sync_hash 聚合 MD5 | **f5b2f63082863619f9db673b618eac55**（n=2061） |
| image_content / rectified_photo / schematic 非空 | **2035 / 557 / 0** |
| violator_name='--' | 1213 |
| 序列 last_value / is_called | 已记录（前后一致） |

## 4. Pull 前 WPS 基线

| 指标 | 值 |
|---|---|
| WPS total | **2063** |
| fileId / sheetId | **cn229thwalDs / 3** |
| BT exists / EA exists | **true / true** |
| mappingCount（sync_map） | **2061** |
| WPS-only（未映射） | **["BT","EA"]**（恰 2 条，无第三条） |
| mapped PG rows missing in WPS | **0** |
| WPS 写调用（读取期间） | **0** |

## 5. 第二次真实 Pull 参数

```json
{ "dryRun": false, "limit": 0, "fileId": "cn229thwalDs", "sheetId": 3 }
```

- 开关方式：与 05-A 完全相同的**一次性进程级** `process.env.WPS_GRID_SYNC='true'`（脚本进程内生效，退出即消失；`.env` 未动）。
- 另设 `process.env.WPS_SYNC_DELETE='true'`（最坏情况假设，证明 WPS 删除同步仍恒封禁）。
- 幂等键：`(wps_record_id, wps_file_id)`（未改变）。

## 6. Pull 实际结果（引擎自报）

| 指标 | 期望（§五） | 实际 | 判定 |
|---|---|---|---|
| totalWps / pulled | 2063 / 2063 | **2063 / 2063** | ✅ |
| alreadyExists | 2061 | **2061** | ✅ |
| newCandidates / changedCandidates | 0 / 0 | **0 / 0** | ✅ |
| inserted / updated | 0 / 0 | **0 / 0** | ✅ |
| skippedUnchanged / skippedExcluded | 2061 / 2 | **2061 / 2** | ✅ |
| bt / ea | 1 / 1 | **1 / 1** | ✅ |
| conflicts / wpsDeleted | 0 / 0 | **0 / 0** | ✅ |
| pgDeleted / pgDeletedCatchUp | 0 / 0 | **0 / 0** | ✅ |
| hashRebaselined / skippedUnbound | 0 / 0 | **0 / 0** | ✅ |
| errors | 0 | **0** | ✅ |
| imageWarnings（fail-safe 告警，非写入） | — | 200（伪空占位符 `--` 键省略提示） | 记录 |

期望块 18 项 **0 mismatch**。

## 7. newCandidates / changedCandidates / unchanged 分类

Pull 前独立只读分类（零写入预检）：

```json
{ "new": 0, "changed": 0, "hashRebaseline": 0, "unchanged": 2061, "excluded": 2, "orphan": 0 }
```

- 前置护栏（preflight）五项全 true：**unchanged=2061、excluded=2、new=0、changed=0、orphan=0** ⇒ 允许执行真实 Pull。
- 引擎运行结果与预检完全一致（alreadyExists=2061 = unchanged 2061；skippedExcluded=2 = excluded 2）。

## 8. INSERT / UPDATE / DELETE / DDL 计数（三重独立证据）

| 证据层 | INSERT | UPDATE | DELETE | DDL | 备注 |
|---|---|---|---|---|---|
| ① 引擎自报 | 0 | 0 | 0（pgDeleted+pgDeletedCatchUp） | 0 | — |
| ② JS 埋点（Pull 窗口 pool.query/wps 包装） | **0** | **0** | **0** | **0** | 窗口内仅 4 条 SELECT（引擎自身读） |
| ③ DB 服务端 pg_stat_user_tables 前后差 | Δ0 | Δ0 | Δ0 | — | gir 与 sm 两表 ins/upd/del 增量全 0 |

`pg_stat_user_tables` 明细：`grid_inspection_records` ins 84→84 / upd 34→34 / del 30850→30850；`grid_record_sync_map` ins 10→10 / upd 0→0 / del 0→0。

## 9. sync_map 前后变化

| 项 | before | after | 判定 |
|---|---|---|---|
| 行数 | 2061 | **2061** | ✅ 不变 |
| 绑定指纹 MD5（wps_record_id\|wps_file_id->pg_record_id 有序聚合） | 0d6821ba622dedb746b598c3bf608f49 | **同值** | ✅ 未重新绑定 |
| distinctkeys / n | 2061 / 2061 | **2061 / 2061** | ✅ 键唯一 |
| sync_hash 聚合 MD5 | f5b2f63082863619f9db673b618eac55 | **同值** | ✅ 未 rebaseline |
| sync_hash NULL | 0 | **0** | ✅ |
| last_sync_at/pg_updated_at 聚合指纹 | — | **前后一致** | ✅ 无触碰 |
| conflict=true | 0 | **0** | ✅ |

## 10. 327 条 NULL grid_id 指纹

| 项 | 期望 | before | after |
|---|---|---|---|
| COUNT | 327 | 327 | **327** |
| SUM(id) | 2275920 | 2275920 | **2275920** |
| MIN(id) | 6797 | 6797 | **6797** |
| MAX(id) | 7123 | 7123 | **7123** |
| 有序 ID MD5 | 2668ce0c51f9f29b3e1272ba7cc56288 | 同 | **同** |

五项指纹前后逐一相等 ⇒ **327 条 NULL 集合零变化**。

## 11. 10 条人工迁移记录指纹

| id | 期望 grid/inspector | before | after |
|---|---|---|---|
| 7183 | 60 / 6789 | ✅ | ✅ |
| 7184 | 14 / 7437 | ✅ | ✅ |
| 7185–7190 | 6 / 6698 | ✅ | ✅ |
| 7191–7192 | 1 / 6692 | ✅ | ✅ |

`driftIds=[]`、`mismatches=[]`、`missing=[]` ⇒ **零漂移**（且以 `Number()` 归一化 bigint 字符串后严格比较）。

## 12. BT / EA 排除证据

- WPS：`BT` 存在、`EA` 存在（btExists/eaExists=true）；未被删除。
- PG：`sync_map` 中 `wps_record_id IN ('BT','EA')` 查询结果 **0 行**（before/after 均 0）。
- 引擎：`bt=1`、`ea=1`、`skippedExcluded=2`；分类 `excluded=[BT,EA]`。
- WPS-only 恰为 `["BT","EA"]`，无第三条未映射记录。

## 13. 身份安全检查

- `inspector_employee_id IS NOT NULL`：10 → **10**（无自动增加）。
- 全表身份集合指纹（`id:grid_id:inspector_employee_id` 有序聚合 MD5）：before = after = **同值** ⇒ 无任何身份列变化。
- 静态复证：引擎使用 `wps_record_id`/`wps_file_id` 键；`naturalKey` 命中 0；`findPgIdByNaturalKey` 命中 0；`assertNoProtectedColumns`/`assertNoPgDelete` 存在；`REVERSE_WRITE_ENABLED=false`。
- DML 埋点中触碰 `grid_id`/`inspector_employee_id` 的语句：**0 条**。
- Scheduler：`syncEnabledByEnv=false`、`running=false`、`grid_record_sync_state` 0 行 ⇒ 无调度痕迹。

## 14. 图片安全检查

- 图片列计数：image_content 2035 → **2035**、rectified_photo 557 → **557**、schematic 0 → **0**。
- 三图片列联合值集合 MD5：before = after（**同值**）⇒ 无覆盖、无抹除。
- DML 埋点中触碰 `image_content|rectified_photo|schematic` 的语句：**0 条**（`image columns written = 0` 由捕获证据直接证实，非推断）。
- 未解析 `_xlfn.DISPIMG`；`/uploads/...` 相对路径继续 fail-safe 键省略。
- `imageWarnings=200`：全部为「伪空占位符（如 `--`）→ 键省略（保留 PG 现值）」告警，属 fail-safe 防护行为，非写入。

## 15. WPS 写调用

| 函数 | 调用次数 |
|---|---|
| createRecords | **0** |
| updateRecords | **0** |
| deleteRecords | **0** |
| **合计** | **0**（calls=[]） |

反向写隔离同时由 HTTP 层证实：`POST /api/wps-grid-sync/push` → **HTTP 410** `{"code":"REVERSE_WRITE_DISABLED"}`。

## 16. PG DELETE

- `pgDeleted = 0`、`pgDeletedCatchUp = 0`（引擎自报）。
- DML 埋点 DELETE = **0**；pg_stat_user_tables 的 `del` 增量 = **0**。
- `assertNoPgDelete()` 硬断言在位；`WPS_SYNC_DELETE='true'` 最坏情况下仍恒封禁。

## 17. Scheduler 状态

- `.env`：`WPS_GRID_SYNC=false` ⇒ `status.syncEnabledByEnv=false`、`status.running=false`。
- `grid_record_sync_state` 表保持 0 行；无 scheduler run trace；`last_sync_at` 聚合指纹不变。
- 本阶段未新增任何 cron / setInterval / 计划任务 / PM2 调度。

## 18. `.env` 状态

| 项 | 值 |
|---|---|
| mtime | **2026-09-11 07:13:11.963（前后一致，未动）** |
| 大小 | 4225 B |
| WPS_GRID_DATA_SOURCE | **false** |
| WPS_GRID_SYNC | **false** |

脚本进程内 `engine.isEnabled()=true` 仅由一次性进程级环境变量提供（`processLevelSwitchOnly=true`），进程退出即消失。

## 19. STOP 条件逐项核查（20 项）

| # | 条件 | 触发 | 证据摘要 |
|---|---|---|---|
| 1 | PG DELETE > 0 | 否 | dml.delete=0, pgDeleted=0, catchUp=0 |
| 2 | WPS WRITE > 0 | 否 | create/update/delete = 0/0/0 |
| 3 | DDL > 0 | 否 | ddl=0 |
| 4 | BT/EA 进入 PG | 否 | sync_map 中 0 行；bt=1, ea=1 |
| 5 | 327 NULL 数量下降 | 否 | 327 → 327 |
| 6 | 327 ID 集合变化 | 否 | MD5 五项指纹全等 |
| 7 | 10 条人工记录漂移 | 否 | drift/mismatch/missing 全空 |
| 8 | inspector_employee_id 变化 | 否 | 10 → 10；身份指纹不变 |
| 9 | grid_id 变化 | 否 | 1734 → 1734；身份指纹不变 |
| 10 | sync_map 被重新绑定 | 否 | 绑定指纹不变；distinctkeys=n=2061 |
| 11 | natural key 被使用 | 否 | naturalKey/findPgId 命中 0；引擎键正确 |
| 12 | PG → WPS | 否 | reverseWriteEnabled=false；WPS 写 0 |
| 13 | WPS DELETE → PG DELETE | 否 | pgDeleted=0；wps.delete=0 |
| 14 | errors > 0 | 否 | errors=[] |
| 15 | 重复新增 | 否 | inserted=0；gir 不变；bind n 不变 |
| 16 | MAX(id) 增长（≥7216） | 否 | 7192 → 7192 |
| 17 | Scheduler 自动运行 | 否 | stateRows=0；syncEnabledByEnv=false |
| 18 | .env 被修改 | 否 | mtime/bytes 不变；两开关均 false |
| 19 | 第二次以上真实 Pull | 否 | realPullExecutions=1 |
| 20 | 图片列被写入 / 保护列被写入 | 否 | imageTouched=0；protectedTouched=0 |

**触发数：0 / 20。**

## 20. 最终判定

- 门禁 `checks` 全部通过（`failedChecks=[]`），期望块 18 项 0 mismatch，STOP 条件 20 项 0 触发。
- **第二次完全相同的真实 Pull 严格幂等**：2063 全量读取 → 2061 全部 unchanged → BT/EA 排除 → INSERT/UPDATE/DELETE/DDL/WPS 写/ERROR 全 0 → 数据库前后零漂移。

```text
PHASE_WPS_PG_SYNC_05B_COMPLETED_READY_FOR_05C
```

---

## 附录 A：首跑事故记录（不影响预算与结论，全程零数据影响）

**时间线（2026-09-11）**

1. 10:21:50 首跑启动（脚本 PID 29052，我方子进程）。
2. **Pull 前基线 SELECT 阶段即抛 `FATAL: 字段 "wps_record_id" 不存在`（42703）**——根因：`BIND_SQL` 漏写 `FROM grid_record_sync_map`，无 FROM 的 SELECT 中列名无处解析（同 snap 中带 FROM 的 `BTEA_SQL` 正常执行，行为吻合）。
3. catch 分支 `await db.pool.end()` 因 `prodConn`（已 checkout 未释放）永久等待 → 进程悬挂 19 分钟。
4. 只读诊断（Node inspector 运行期挂载）：引擎标志 `isRunning=false`、事件循环空闲、无网络连接 → **真实 Pull 从未进入引擎**。
5. 10:46 终止我方脚本进程 PID 29052（生产 5876 未受任何影响）。
6. 10:47 只读对照 05-A 终态基线：gir/sm/MAX(id)/327 指纹/sync_hash 聚合全部一致 ⇒ 首跑**零副作用**。

**预算裁定（§三.1）**

- 任务书禁止的模式是「**真实 Pull 失败** → 修脚本 → 再跑一次 Pull」；本次 Pull **从未被调用**（`realPullExecutions=0`、`isRunning=false`、preflight 未评估、Pull 窗口内无任何 DML）。
- 修复对象是验收脚本自身只读基线阶段的缺陷（SELECT 漏 FROM），不涉及业务 Pull 行为变更。
- 故本阶段真实 Pull 执行次数仍为 **0 消耗**，随后执行了**唯一一次**第二次真实 Pull（`realPullExecutions=1`），全程合计恰好 1 次，符合 §三.1。

**修复点（`_wpssync05b_pull.cjs`）**

1. `BIND_SQL` 补 `FROM grid_record_sync_map`；别名统一小写（`distinctkeys`、`inspnonempty`），规避「未加引号别名被小写化」已知坑。
2. catch 分支改为：同步 `prodConn.release()` 后立即 `process.exit(9)`，**绝不 await `pool.end()`**（防悬挂）。
3. 新增 5 分钟看门狗强制退出；`prodConn` 提升到外层作用域供 catch 释放。

## 附录 B：本次验证新增的两条工程教训（已同步技能库）

1. **SELECT 漏 FROM 也会以 42703「字段不存在」报错**——错误信息指向列名而非缺表，易误判为字段名拼写问题；基线类长 SQL 逐条具名验证可快速定位。
2. **catch 分支中的 `await pool.end()` 是悬挂高发点**——只要主流程 checkout 过连接且未 release，pool.end 会无限等待；带真实连接的脚本必须：外层持有连接引用、catch 同步 release、禁止在 catch 里 await pool.end、并设看门狗。

## 附录 C：审计指针

- 证据 JSON：`server/scripts/output/wpssync05b-pull.json`（before/after 快照、expectedBlock、pgStatDelta、stopConditions、checks 全量）
- 即时落盘：`server/scripts/output/wpssync05b-pull-raw.json`（Pull 窗口 2.85s、pullResult、pullError=null、pgDmlStatements 仅 SELECT）
- 源码 mtime 冻结（Pull 前）：wpsGridPullEngine.js 08:39:40 / wpsGridSyncService.js 08:15:42 / wpsGridSyncScheduler.js 08:15:50 / wpsFieldMap.js 08:14:02 / routes/wps-grid-sync.js 08:16:03（均为部署时版本，Pull 前后未动）
- 历史报告：`docs/HSE网格巡查身份链_WPS-PG-SYNC-05-A_生产单次Pull验证报告_20260911.md`
