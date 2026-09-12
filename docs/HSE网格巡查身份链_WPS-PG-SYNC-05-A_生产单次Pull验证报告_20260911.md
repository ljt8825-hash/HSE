# HSE 网格巡查身份链 · WPS-PG-SYNC-05-A 生产单次 Pull 验证报告

- **项目**：`G:\hse-dashboard`
- **后端**：`G:\hse-dashboard\server`
- **生产端口**：`5876`
- **报告日期**：2026-09-11
- **执行脚本**：`server/scripts/_wpssync05a_pull.cjs`（唯一一次真实 Pull）
  - `server/scripts/_wpssync05a_reeval.cjs`（事后验收重算，零 Pull 零写入）
  - `server/scripts/_wpssync05a_wpsproof.cjs`（WPS 只读性 + 运行态复证，只读）
- **证据 JSON**：
  - `server/scripts/output/wpssync05a-pull.json`
  - `server/scripts/output/wpssync05a-wpsproof.json`
- **最终状态**：**`PHASE_WPS_PG_SYNC_05A_COMPLETED_READY_FOR_05B`**

---

## 摘要（一段话）

本阶段按 §6 的「一次性进程级参数/脚本调用」方式，把执行开关在**进程内**临时置为 `WPS_GRID_SYNC=true`（**未写入 `.env`**、**未开启 Scheduler**），对真实生产库执行了**唯一一次**真实 Pull：读取 WPS 全量 2063 条，逐条走「排除规则 → 规范化 DTO → 幂等识别（`(wps_record_id, wps_file_id)`）→ 变更检测（18 列冻结 hash）」，落库结果为 **`inserted=0 / updated=0 / pgDeleted=0 / conflicts=0 / errors=0`**，**WPS 写入 0 次、PG 删除 0 次、DDL 0 次**，执行前后生产基线 **逐项 diff 为空**。当前 WPS 与 PG 完全对齐（2061 条已映射且 hash 一致、2 条 BT/EA 硬排除），因此本次真实 Pull 的**正确结果就是零变更** —— 这恰好证明「引擎在真实写入模式下不会误报变更、不会误写」。

---

## 1. 执行时间

| 项 | 值 |
|---|---|
| 脚本启动（本地 +08） | **2026-09-11 10:04:21 +08** |
| Pull 窗口（UTC） | `2026-09-11T02:04:26.172Z` → `2026-09-11T02:04:29.061Z` |
| Pull 耗时 | **2 889 ms** |
| 验收重算（本地） | 2026-09-11 10:05 左右（零 Pull、零写入） |
| WPS/运行态复证（本地） | 2026-09-11 10:05 左右（只读） |

---

## 2. 生产 PID

| 项 | 值 |
|---|---|
| 5876 监听 PID | **6300** |
| 进程启动 | **2026-09-11 09:58:12**（父进程 `pwsh.exe` PPID 30568，09:58:11） |
| 启动命令 | `"C:\Program Files\nodejs\node.exe" app.js` |
| `/api/health` | `HTTP 200`，`data.status="ok"`，`uptime` 反推启动时刻与 09:58:12 一致 |

> **⚠ 如实归因（不得含糊）**：本阶段授权的是「由我方停止旧 PID 27316 并启动新进程」。但**开工现状取证时发现目标态已由外部达成**：
> - 旧 **PID 27316 已不存在**（SYNC-04-B 时的 PID 3348 亦已不存在）；
> - 5876 现由 **PID 6300（启动 09:58:12）** 提供服务 —— **早于本会话任何动作**（本会话首个工具调用约 10:02）。
>
> 按项目既定纪律「外部先于我方改动生产 ⇒ 转为验证 + 如实归因，**不重复修改/重启**」，且 §三.22 明令「不得重新执行生产重启」，**本会话未 kill、未 start、重启次数 = 0**。授权事项的**目标状态已满足**，故不构成阻塞。
>
> **部署必要性已消除**：进程启动 **09:58:12** **晚于全部** SYNC-02 文件 mtime（最晚 `wpsGridPullEngine.js` 08:39:40）⇒ Node 启动期 `require` 到的必然是 SYNC-02 代码。

---

## 3. Pull 前 PG 基线

`SELECT` 只读，采集于真实 Pull 之前：

| 指标 | 值 |
|---|---|
| `grid_inspection_records` | **2061** |
| `grid_record_sync_map` | **2061** |
| `grid_id IS NULL`（327 条） | **327** |
| `grid_id IS NOT NULL` | **1734** |
| `inspector_employee_id IS NOT NULL` | **10** |
| live `grid_areas`（`is_deleted=false`） | **62** |
| active `users` | **63**（`grid_inspector` **62** / `admin` **1**） |
| `sync_map.conflict=true` | **0** |
| `grid_record_sync_state` | **0**（空） |
| `MAX(grid_inspection_records.id)` | **7192** |
| `sync_map.sync_hash IS NULL` | **0** |
| `image_content` 非空 | 2035 |
| `rectified_photo` 非空 | 557 |
| `schematic` 非空 | 0 |
| `violator_name = '--'`（历史占位符） | 1213 |
| **327 条 NULL 集合摘要** | `SUM(id)=2275920 / COUNT=327 / MIN(id)=6797 / MAX(id)=7123` / **有序 ID MD5 = `2668ce0c51f9f29b3e1272ba7cc56288`** |
| `sync_map.sync_hash` 聚合摘要 | `f5b2f63082863619f9db673b618eac55`（n=2061） |
| `grid_inspection_records.id` 列默认 | `nextval('grid_inspection_records_id_seq'::regclass)` |

**10 条人工迁移记录（Pull 前）**

| PG id | grid_id | inspector_employee_id |
|---|---|---|
| 7183（王铁民） | 60 | 6789 |
| 7184（谢俊章） | 14 | 7437 |
| 7185–7190（刘金涛 ×6） | 6 | 6698 |
| 7191–7192（黄殿兴 ×2） | 1 | 6692 |

---

## 4. Pull 前 WPS 基线

| 项 | 值 |
|---|---|
| WPS 总记录数 | **2063** |
| `fileId` / `sheetId` | `cn229thwalDs` / `3` |
| `BT` 存在 | ✅ `true` |
| `EA` 存在 | ✅ `true` |
| `sync_map` 映射数 | **2061** |
| PG `sync_map` 中 `BT` | ❌ 不存在 |
| PG `sync_map` 中 `EA` | ❌ 不存在 |
| WPS 中未映射的记录 | 恰好 **`['BT','EA']`**（2 条） |
| 已映射记录在 WPS 中缺失（潜在 `wpsDeleted`） | **0 条** |

> 2063 = 2061（已映射） + 2（BT/EA 硬排除）。**无孤儿、无缺口。**

---

## 5. Pull 实际结果

| 字段 | 值 |
|---|---|
| `direction` | `wps->pg` |
| `dryRun` | **`false`**（真实 Pull） |
| `totalWps` | 2063 |
| `pulled` | 2063 |
| `alreadyExists` | 2061 |
| `newCandidates` | **0** |
| `changedCandidates` | **0** |
| `inserted` | **0** |
| `updated` | **0** |
| `skippedUnchanged` | 2061 |
| `skippedExcluded` | 2 |
| `skippedUnbound` | 0 |
| `excluded` | 2 |
| `unbound` | 0 |
| `gridNull` | 0 |
| `inspectorNull` | 0 |
| `bt` | 1 |
| `ea` | 1 |
| `conflicts` | 0 |
| `wpsDeleted` | 0 |
| `pgDeleted` | **0** |
| `pgDeletedCatchUp` | 0 |
| `hashRebaselined` | 0 |
| `errors` | **0** |
| `imageWarnings` | 200（上限截断；见 §11） |

**独立只读分类（§9，真实 Pull 之前由本脚本用引擎导出的纯函数复算）**

| 分类 | 数量 | 说明 |
|---|---|---|
| 新增候选 | **0** | — |
| 变化候选 | **0** | — |
| 仅 hash 需重基线 | **0** | — |
| 未变化（hash 一致） | **2061** | `mapped.sync_hash === canonicalHash(...)` 全命中 |
| 排除（BT/EA） | **2** | `BT`、`EA`，reason = `FROZEN_EXCLUSION` |
| 孤儿（`sync_map` 指向不存在的 PG 行） | **0** | — |

> 分类结果与引擎统计**逐项一致**（`newCandidates`/`changedCandidates`/`skippedUnchanged`/`excluded` 四项 cross-check 全对），互为交叉校验。

---

## 6. inserted / updated / deleted

| 操作 | 计数 | 证据 |
|---|---|---|
| **INSERT** | **0** | 包装后的 `pool.query` 捕获到的 `INSERT/UPDATE/DELETE/DDL` 语句 **0 条**（`pgDmlStatements.length = 0`） |
| **UPDATE** | **0** | 同上 |
| **DELETE（PG）** | **0** | `pgDeleted=0`、`pgDeletedCatchUp=0`，且 `assertNoPgDelete()` 未抛 `PG_DELETE_FORBIDDEN` |
| DDL | **0** | `ddl=0` |

**「零 INSERT」的独立数学证明**：`grid_inspection_records.id` 默认值为 `nextval('grid_inspection_records_id_seq')`，该序列当前 `last_value = 7216`。若本次 Pull 发生过任何 INSERT，新行 id 必为 **≥ 7216**，则 `MAX(id)` 必 ≥ 7216；而实测 `MAX(id) = 7192`（未变）⇒ **本次 Pull 结构性地未执行任何 INSERT**。

---

## 7. BT / EA

| 检查 | 结果 |
|---|---|
| WPS 中 `BT` 存在 | ✅ `true` |
| WPS 中 `EA` 存在 | ✅ `true` |
| WPS 中 `BT`/`EA` 被删除 | ❌ 未发生（WPS 写调用 0 次） |
| PG `grid_record_sync_map` 中 `BT` | ❌ **不存在** |
| PG `grid_record_sync_map` 中 `EA` | ❌ **不存在** |
| PG 业务表中新增 `BT`/`EA` | ❌ 未发生（`inserted=0`） |
| 引擎计数 | `bt=1`、`ea=1`、`skippedExcluded=2` |
| 排除依据 | `wps_record_id`（`FROZEN_EXCLUSIONS`），**非**姓名/日期/自然键 |
| 排除判定位置 | **先于**幂等判定（对照 `pullWpsToPg` 第 ① 步） |

---

## 8. 327 条 NULL `grid_id`

| 项 | Pull 前 | Pull 后 | 一致 |
|---|---|---|---|
| `COUNT(grid_id IS NULL)` | 327 | **327** | ✅ |
| `SUM(id)` | 2275920 | **2275920** | ✅ |
| `MIN(id)` | 6797 | **6797** | ✅ |
| `MAX(id)` | 7123 | **7123** | ✅ |
| 有序 ID MD5 | `2668ce0c51f9f29b3e1272ba7cc56288` | **`2668ce0c51f9f29b3e1272ba7cc56288`** | ✅ |

集合**完全一致**，未发生任何回填；**未使用** 分组名 / 姓名 / 乡镇名 / 公司管理 / 岗位 / 模糊匹配 推导 `grid_id`（引擎 `PROTECTED_COLUMNS` + `assertNoProtectedColumns()` 双保险，且 `gridNull=0` 表示无新增候选需要判定）。

---

## 9. 10 条人工记录

| PG id | 期望 `grid_id` / `inspector_employee_id` | Pull 后实测 | 一致 |
|---|---|---|---|
| 7183 王铁民 | 60 / 6789 | 60 / 6789 | ✅ |
| 7184 谢俊章 | 14 / 7437 | 14 / 7437 | ✅ |
| 7185–7190 刘金涛 | 6 / 6698（×6） | 6 / 6698（×6） | ✅ |
| 7191–7192 黄殿兴 | 1 / 6692（×2） | 1 / 6692（×2） | ✅ |

- `driftIds = []`
- `mismatches = []`
- `missing = []`

**零漂移。**

---

## 10. Identity 安全检查

| 检查 | 结果 | 证据 |
|---|---|---|
| 姓名 → `employee_id` | ❌ 未发生 | 引擎 `toCanonicalDto` 不含身份列；`SYNC_PROJECTION` 无 `inspector_employee_id` |
| 姓名 → `inspector_employee_id` | ❌ 未发生 | 同上 + `inspector_employee_id NOT NULL` 计数 10 → 10 不变 |
| 分组名称 → `grid_id` | ❌ 未发生 | `grid_id` 不在投影；`grid_id IS NULL` 计数 327 → 327 不变 |
| 乡镇名称 / 岗位 → `grid_id` | ❌ 未发生 | 同上 |
| WPS 网格负责人 → PG `inspector_employee_id` | ❌ 未发生 | 同上 |
| 受保护列出现在任何 DML 语句中 | ❌ **0 条**（`protectedColumnStatements.length = 0`） | 对捕获到的全部 INSERT/UPDATE 语句做 `grid_id`/`inspector_employee_id` 正则扫描 |
| 新记录身份是否恒 NULL | ✅ 本阶段无新增；`newRowIdentity = []`（回查条件未触发） | — |
| 身份回填 | ❌ 未做 | — |
| `inspector_employee_id IS NOT NULL` | 10 → **10** | 不变 |

**本阶段只做「保留已有正式身份」与「新记录恒 NULL」，未做任何身份推导/回填。**

---

## 11. 图片安全检查

| 检查 | 结果 |
|---|---|
| 是否解析 `_xlfn.DISPIMG` | ❌ 未解析（SYNC-02 冻结规则保持） |
| 是否写入/置空任何图片列 | ❌ **未发生**：本次 `inserted=0` 且 `updated=0` ⇒ **未产生任何 INSERT/UPDATE 语句** ⇒ 结构性不可能触碰 `image_content` / `rectified_photo` / `schematic` |
| `image_content` 非空计数 | 2035 → **2035** ✅ |
| `rectified_photo` 非空计数 | 557 → **557** ✅ |
| `schematic` 非空计数 | 0 → **0** ✅ |
| 既有有效图片被空值覆盖 | ❌ 未发生（上三行证明） |
| `/uploads/...` 相对路径 fail-safe 策略 | 保持（`imageWarnings` 200 条为上限截断的既有告警：WPS 侧约 1698 条 `image_content`、471 条 `rectified_photo` 为站内相对路径，非 `http(s)` ⇒ **键省略**，保留 PG 现值） |
| 图片异常是否阻断整批 | ❌ 未阻断（`errors=0`，仅作为 `imageWarnings` 独立记录） |

**未触发 SYNC-02 已定义的任何图片相关 STOP 条件。**

---

## 12. `sync_map` 变化

| 项 | Pull 前 | Pull 后 | 变化 |
|---|---|---|---|
| `grid_record_sync_map` 行数 | 2061 | **2061** | **0** |
| `sync_map` 增量 vs 合法新增数 | — | `Δ = 0` = `inserted = 0` = 合法新增候选数 **0** | ✅ 一致 |
| `BT` in `sync_map` | 否 | **否** | 不变 |
| `EA` in `sync_map` | 否 | **否** | 不变 |
| `sync_hash` 聚合摘要 | `f5b2f63082863619f9db673b618eac55` | **`f5b2f63082863619f9db673b618eac55`** | **未变** |
| `sync_hash IS NULL` | 0 | **0** | 不变 |
| `last_sync_at` / `pg_updated_at` 聚合摘要 | — | **未变** | ✅ 无任何 `sync_map` UPDATE |
| `conflict=true` | 0 | **0** | 不变 |
| 映射重绑 | — | **未发生**（无 UPDATE 语句；新增走纯 INSERT） | ✅ |

---

## 13. WPS 写入计数

| 方法 | 调用次数 |
|---|---|
| `createRecords`（WPS create） | **0** |
| `updateRecords`（WPS update） | **0** |
| `deleteRecords`（WPS delete） | **0** |
| 合计 WPS 写调用 | **0** |

同时保持（SYNC-02 冻结门面）：

| 门面 | 行为 |
|---|---|
| `pushRow` | 恒 `{ disabled: true, reason: 'REVERSE_WRITE_DISABLED' }` |
| `onPgRowChanged` | no-op |
| `onPgRowsDeleted` | no-op |
| `REVERSE_WRITE_ENABLED` | 常量 `false` |
| `POST /api/wps-grid-sync/push` | **HTTP 410 `data.code = "REVERSE_WRITE_DISABLED"`** |

---

## 14. PG DELETE 计数

| 项 | 值 |
|---|---|
| `DELETE FROM grid_inspection_records` | **0** |
| `DELETE FROM grid_record_sync_map` | **0** |
| `pgDeleted` | **0** |
| `pgDeletedCatchUp` | **0** |
| WPS 中消失记录 → PG DELETE | **未发生**（`wpsDeleted=0`；且即便 >0，冻结策略亦只统计不删） |
| `assertNoPgDelete()` | 未抛出 `PG_DELETE_FORBIDDEN` |

---

## 15. DDL 计数

| 项 | 值 |
|---|---|
| `CREATE / ALTER / DROP / TRUNCATE` | **0** |
| `ensureTables()` 语义 | 只读断言（`to_regclass` + `pg_indexes`），Pull 路径**零 DDL** |
| 新增表 / 列 / 索引 | 无 |

---

## 16. `.env` 状态

| 项 | Pull 前 | Pull 后 | 一致 |
|---|---|---|---|
| `mtime` | `2026-09-11 07:13:11.963 +08` | **`2026-09-11 07:13:11.963 +08`** | ✅ |
| 字节数 | 4225 | **4225** | ✅ |
| `WPS_GRID_DATA_SOURCE` | `false` | **`false`** | ✅ |
| `WPS_GRID_SYNC` | `false` | **`false`** | ✅ |
| `WPS_SYNC_DELETE` | 该行**不存在** | **不存在** | ✅ |

**一次性开关的实现方式**：仅在**本次验证脚本的进程内**设置 `process.env.WPS_GRID_SYNC='true'`（同时设 `WPS_SYNC_DELETE='true'` 做最坏情况验证）。脚本进程退出即消失，**未向 `.env` 写入任何内容**（文件 mtime/字节数逐字节未变）。
本阶段 `.env` 写入次数 = **0**。

---

## 17. Scheduler 状态

| 检查 | 结果 |
|---|---|
| `.env` `WPS_GRID_SYNC` | **`false`** |
| `/status` `syncEnabledByEnv` | **`false`** |
| `/status` `running` | **`false`** |
| `/status` `enabled` | `false`（生产进程） |
| 15 分钟自动同步 | **未开启** |
| 验证期间 Scheduler 是否自动运行 | **否**（见下三重证据） |
| `grid_record_sync_state` 行数 | 0 → **0** |
| `POST /api/wps-grid-sync/pull`（HTTP 路径） | **`{ code: -2, data.code: "SYNC_DISABLED" }`** —— 生产进程 `isEnabled()=false` 首行 fail-closed 拒绝，**证明开关确为关闭** |

**「Scheduler 未自动运行」的三重证据**：① 生产进程 `.env` 为 `false` ⇒ `isEnabled()` 恒 `false` ⇒ scheduler `runPull()` 首行即早退；② `/status.running=false`；③ `grid_record_sync_state` 为空、`sync_map.last_sync_at/pg_updated_at` 聚合摘要未变 ⇒ 除本次受控 Pull（零写入）外无任何调度痕迹。

**Scheduler 开启须另行立项评审（下一阶段 SYNC-05-B 之后）。**

---

## 18. STOP 条件逐项核查

| # | STOP 条件 | 结果 |
|---|---|---|
| 1 | PG DELETE > 0 | ✅ 未触发（0） |
| 2 | WPS WRITE > 0 | ✅ 未触发（0/0/0） |
| 3 | DDL > 0 | ✅ 未触发（0） |
| 4 | BT / EA 被插入 PG | ✅ 未触发（`sync_map` 中无 BT/EA，`inserted=0`） |
| 5 | `grid_id` 被自动修改 | ✅ 未触发（327 集合与 MD5 完全一致） |
| 6 | `inspector_employee_id` 被自动修改 | ✅ 未触发（10 → 10） |
| 7 | 327 NULL `grid_id` 数量下降 | ✅ 未触发（327 → 327） |
| 8 | 10 条人工记录发生漂移 | ✅ 未触发（`mismatches=[] / missing=[]`） |
| 9 | `sync_map` 被重新绑定 | ✅ 未触发（无 UPDATE；`sync_hash` 摘要未变） |
| 10 | natural key 被使用 | ✅ 未触发（幂等键恒为 `(wps_record_id, wps_file_id)`；全项目 `findPgIdByNaturalKey`/`matchedByNaturalKey` 0 处） |
| 11 | 出现 PG → WPS 调用 | ✅ 未触发（`/push` → 410；WPS 写 0） |
| 12 | 出现 WPS DELETE → PG DELETE | ✅ 未触发（`wpsDeleted=0`、`pgDeleted=0`） |
| 13 | 未经授权的 `.env` 修改 | ✅ 未触发（mtime/bytes 未变） |
| 14 | 未经授权的生产重启 | ✅ 未触发（**本会话重启 0 次**；PID 6300 由外部于 09:58:12 启动，已如实归因） |
| 15 | 出现错误记录 | ✅ 未触发（`errors=0`） |
| 16 | 出现重复新增 | ✅ 未触发（`inserted=0`；`gir` 2061→2061） |
| 17 | 执行了第二次真实 Pull | ✅ 未触发（本阶段仅一次真实 Pull；验收判定改为**事后重算 + 只读重查**，未重跑） |
| 18 | 顺手治理遗留问题 | ✅ 未触发（图片相对路径 / `'--'` 占位符 / 327 NULL / Excel 模糊匹配 / 前端按钮 / WPS own_grid 全部未动） |
| 19 | 清理 PID 17360 | ✅ 未触发（授权外，保持原状） |

**19 项 STOP 条件：0 项触发。**

---

## 19. 最终状态

```
PHASE_WPS_PG_SYNC_05A_COMPLETED_READY_FOR_05B
```

**§15 十五项 PASS 条件逐条达成**

| # | 条件 | 结果 |
|---|---|---|
| 1 | Pull 正常完成 | ✅ `pulled=2063`，2 889 ms，无异常 |
| 2 | `errors = 0` | ✅ |
| 3 | PG DELETE = 0 | ✅ |
| 4 | WPS writes = 0 | ✅ |
| 5 | DDL = 0 | ✅ |
| 6 | BT / EA 未进入 PG | ✅ |
| 7 | 327 NULL `grid_id` 未被回填 | ✅（MD5 `2668ce0c…` 一致） |
| 8 | 10 条人工记录零漂移 | ✅ |
| 9 | 无 `inspector_employee_id` 自动修改 | ✅ |
| 10 | 无 `grid_id` 自动推导 | ✅ |
| 11 | 无重复新增 | ✅ |
| 12 | `sync_map` 幂等正常 | ✅（Δ=0，`sync_hash` 摘要未变） |
| 13 | Scheduler 未自动运行 | ✅ |
| 14 | `.env` 未被长期修改 | ✅ |
| 15 | Pull 后恢复 `WPS_GRID_SYNC=false` | ✅（从未写入 `.env`；生产进程始终 `false`） |

### 状态说明（必须明确）

| 项 | 状态 |
|---|---|
| 生产运行态已加载 SYNC-02 | ✅（PID 6300，启动 09:58:12 晚于全部 SYNC-02 文件 mtime；`/status` 现 `reverseWriteEnabled:false` + `exclusions:['BT','EA']` + `hashScopeColumns:18` + `mappingCount:2061` + `conflicts:0`；`/push`→410） |
| 反向写入 | ✅ 永久关闭 |
| WPS→PG Pull 引擎 | ✅ 已部署并经**一次真实 Pull** 验证 |
| Scheduler | ⛔ 仍关闭（须另行立项评审） |
| `WPS_GRID_SYNC` | ✅ `false`（`.env` 未改） |
| `WPS_GRID_DATA_SOURCE` | ✅ `false`（`.env` 未改） |

---

## 附录 A：验收判定重算说明（透明记录，未弱化门禁）

首轮脚本判定中 `imagesNotErased` 报 FAIL。定位结论：**本检查器自身缺陷**——PG 中未加引号的列别名会被折叠为小写（`imgContent` → `imgcontent`），导致 `after.counts.imgContent` 取到 `undefined`，`undefined >= 2035` 恒为 `false`。（与 SYNC-04-B 首轮 `stateRows` → `staterows` 属同类问题。）

处置方式（严格遵守 §13/§15）：
- **不重跑第二次真实 Pull**（§13）；
- **不"自行修复后重新跑"**（§15）；
- 改为新增 `_wpssync05a_reeval.cjs`，只做两件事：① **只读**重查当前生产库，证明「记录到的 `after` 快照 == 当前真实状态」（`recordedAfterEqualsCurrentDb = true`，无漂移）；② 用**修正后的键名**对**已记录的本次 Pull 证据**重算全部 checks。

重算结果：`checks FAIL = []`，全部通过；该重算脚本**非 SELECT 语句 = 0 条**（`[]`），未对数据库做任何写。

同时修正了 `_wpssync05a_pull.cjs` 中的键名（改为小写别名），使脚本本身正确——**判据强度未降低**，反而额外新增了 `noImageColumnWritten`（无图片列被写入）与 `noNonSelectStatement`（本次 Pull 未产生任何非 SELECT 语句）两条更强断言。

---

## 附录 B：证据索引

| 用途 | 路径 |
|---|---|
| 单次真实 Pull 全量证据（含分类明细、DML 语句、前后快照、19 项 checks、事后重算） | `server/scripts/output/wpssync05a-pull.json` |
| WPS 只读性 + BT/EA 冻结 + 运行态复证 | `server/scripts/output/wpssync05a-wpsproof.json` |
| 真实 Pull 执行脚本 | `server/scripts/_wpssync05a_pull.cjs` |
| 事后验收重算脚本（零 Pull 零写入） | `server/scripts/_wpssync05a_reeval.cjs` |
| WPS/运行态只读复证脚本 | `server/scripts/_wpssync05a_wpsproof.cjs` |
| 上一阶段（部署验收） | `docs/HSE网格巡查身份链_WPS-PG-SYNC-04-B_生产运行态部署与验收报告_20260911.md` |
| 设计冻结 / 反向隔离 / 引擎实施 / 首次受控 Pull | `docs/HSE网格巡查身份链_WPS-PG-SYNC-0{0,1,2,3}_*.md` |

---

## 附录 C：下一阶段（SYNC-05-B，需另行立项）

1. **幂等性第二次 Pull 验证**（§13 明确留给 05-B）：以完全相同的受控方式再执行一次真实 Pull，断言 `inserted=0 / updated=0 / pgDeleted=0 / errors=0` 且 `sync_map` 无变化 —— 证明「重复执行不产生重复新增」。
2. **受控新增/变化样本演练**（可选，需人工确认）：在 WPS 侧构造 1 条测试记录，验证 `insertWithMap` 的真实 INSERT 路径、`grid_id/inspector_employee_id` 恒 NULL、以及单事务原子性（PG 业务行 + `sync_map` 同成同败）。
3. **Scheduler 开启评审**：独立立项，评审开启条件、限流、告警与回滚预案。
4. **遗留治理**（独立立项，本阶段未动）：`/uploads/...` 相对路径图片规范化、`'--'` 占位符清洗（1213 行）、327 条 NULL `grid_id` 人工归属、Excel import 姓名模糊匹配、前端删/清空/导入按钮按角色隐藏、WPS `own_grid`、admin `employee_id`、WPS Schema 治理、残留 PID 17360 清理授权。
5. **运行态不变量定期巡检**：将本报告 §3 的基线 12 项 + §8 的 327 摘要 + §9 的 10 条人工记录指纹固化为巡检脚本，定期只读比对。

---

**报告结束 · 终态 `PHASE_WPS_PG_SYNC_05A_COMPLETED_READY_FOR_05B`**
