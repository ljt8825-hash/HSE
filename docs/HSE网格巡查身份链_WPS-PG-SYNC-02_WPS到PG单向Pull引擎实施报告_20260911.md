# HSE 网格巡查身份链 · WPS-PG-SYNC-02
## WPS → PostgreSQL 单向 Pull Engine 实施报告

- 项目：`G:\hse-dashboard`
- 后端：`G:\hse-dashboard\server`
- 正式前端：`G:\hse-dashboard\安全看板vben\apps\web-naive`
- 生产端口：`5876`（本阶段**未重启**，PID 27316 全程未变）
- 阶段：**WPS-PG-SYNC-02（WPS → PostgreSQL 单向 Pull Engine 实施）**
- 报告日期：2026-09-11
- 前置阶段：`PHASE_WPS_PG_SYNC_01_COMPLETED_READY_FOR_SYNC_02`（已确认）
- 终态：**`PHASE_WPS_PG_SYNC_02_COMPLETED_READY_FOR_SYNC_03`**

> 本阶段**未执行任何生产全量 Pull**；生产表零写入、WPS 零写入、DDL 零变更、`.env` 零修改、前端零改动。

---

## 1. 实施摘要

本阶段把历史上一个**双向同步引擎**收敛为一个**可审计、可回滚、幂等、只允许 WPS → PG 的单向 Pull Engine**：

```text
WPS 多维表格（外部三违采集源）
   ↓ ① listAllRecords（唯一 HTTP 出口，只读）
   ↓ ② 排除名单（BT / EA，按 wps_record_id）
   ↓ ③ canonical DTO（唯一字段真源 SYNC_PROJECTION）
   ↓ ④ 幂等识别（wps_record_id + wps_file_id）
   ↓ ⑤ 变更检测（sync_hash 快路径 + 字段级权威比对）
   ↓ ⑥ 单事务 INSERT / UPDATE（业务列）+ sync_map
PostgreSQL（HSE 正式业务库 · 唯一身份/权限权威）
   ↓
HSE 系统（own_grid / all_grid 行级权限）
```

核心交付：

| # | 交付 | 说明 |
|---|---|---|
| 1 | **字段真源唯一化** | 全项目 FIELD_MAP 字面量由 3 套收敛为 1 套（`services/wps/wpsFieldMap.js`） |
| 2 | **单向 Pull Engine** | 新增 `services/wpsGridPullEngine.js`（555 行，含全部护栏） |
| 3 | **旧引擎降级为 facade** | `services/wpsGridSyncService.js` 不再含任何写入逻辑 / DDL / 字段字面量 |
| 4 | **调度器单向化** | 只调用 `pullWpsToPg()`；不再调用双向 `reconcile()` |
| 5 | **路由单向化 + 管理员门禁** | `/pull` `/reconcile` 接新引擎；真实写入需 admin；`/push` 恒 410 |
| 6 | **零残留真机门禁** | 112/112 ALL_PASS（TEMP 副本表手法，生产零写入） |
| 7 | **真机 Dry Run** | 2063 条全量只读干跑：`inserted=0 updated=0 pgDeleted=0`，DML=0 |

---

## 2. 修改文件清单

| 文件 | 类型 | 行数 | 变更摘要 |
|---|---|---|---|
| `services/wpsGridPullEngine.js` | **新增** | 555 | 唯一 WPS→PG 单向引擎：canonical DTO / 排除名单 / 幂等 / 事务 / 护栏 / dryRun |
| `services/wpsGridSyncService.js` | 重写 | 169（原 486） | 降级为 facade；删除内联 FIELD_MAP；Pull 路径移除 DDL；反向写入恒封禁 |
| `services/wpsGridSyncScheduler.js` | 重写 | 68（原 70） | 只调用 `pullWpsToPg()`；`runPull` 首行 disabled 早退 |
| `services/wps/wpsFieldMap.js` | 扩展 | 150（原 89） | **唯一字段真源**：补 `日期↔inspection_date`；新增 `SYNC_PROJECTION` 等冻结导出 |
| `services/wpsGridMigrationService.js` | 微改 | 264（原 268） | 删除本地 `FIELD_MAP`/`PHOTO_MAP` 字面量，改由真源派生（行为等价） |
| `routes/wps-grid-sync.js` | 重写 | 159（原 116） | 接新引擎；`/pull` `/reconcile` 暴露 dryRun 明细；真实写入需 admin |
| `scripts/_wpssync02_recon.cjs` | **新增** | — | 只读现状取证 |
| `scripts/_wpssync02_colprobe.cjs` | **新增** | — | 只读列分布探针 |
| `scripts/_wpssync02_equiv.cjs` | **新增** | — | 字段真源收敛「等价性证明」（11 项） |
| `scripts/_wpssync02_drift.cjs` | **新增** | — | 存量「规范化 DTO vs PG 现值」漂移量化 |
| `scripts/_wpssync02_imgcmp.cjs` | **新增** | — | 图片值形态量化 |
| `scripts/_wpssync02_switch_probe.cjs` | **新增** | — | 开关语义子进程探针 |
| `scripts/_wpssync02_gate.cjs` | **新增** | — | 门禁测试（112 项） |
| `scripts/_wpssync02_dryrun.cjs` | **新增** | — | 真机只读 Dry Run |

备份（可一键回滚）：`server/backups/wpssync02_20260911/*.bak`（5 个原始文件）。

---

## 3. Pull Engine 架构

### 3.1 执行顺序（`pullWpsToPg(opts)`）

```
0  isEnabled() 门禁（WPS_GRID_SYNC==='true' && 凭证齐备 && DB已连接）→ 否则 skipped
1  fileId/sheetId 与配置一致性校验（不一致 → FILE_MISMATCH 抛错）
2  进程内互斥锁（pullRunning）→ 已在跑则 skipped: ALREADY_RUNNING
3  assertSchemaReady()：to_regclass 只读存在性 + 幂等唯一索引存在性（**零 DDL**）
4  wps.listAllRecords() —— 唯一 WPS 出口（只读）
5  一次性载入 sync_map(2061) + PG 现行行(2061)，建立 byKey / byId 索引
6  逐条：排除名单 → canonical DTO → 幂等键判定 → 变更检测 → 写
7  WPS 端消失统计（wpsDeleted 只计数，绝不删除）
8  assertNoPgDelete(stats)：pgDeleted !== 0 直接抛错 FAIL
```

### 3.2 返回结构（`§15` 契约 + dry-run 扩展）

```json
{
  "direction": "wps->pg", "dryRun": false, "enabled": true,
  "pulled": 2063, "inserted": 0, "updated": 0,
  "skippedUnchanged": 2061, "skippedExcluded": 2, "skippedUnbound": 0,
  "conflicts": 0, "wpsDeleted": 0, "pgDeleted": 0, "pgDeletedCatchUp": 0,
  "hashRebaselined": 0,
  "totalWps": 2063, "alreadyExists": 2061, "newCandidates": 0, "changedCandidates": 0,
  "excluded": 2, "unbound": 0, "gridNull": 0, "inspectorNull": 0, "bt": 1, "ea": 1,
  "errors": [], "imageWarnings": [], "excludedDetail": [], "unboundDetail": [], "wpsDeletedDetail": []
}
```

- `pgDeleted` / `pgDeletedCatchUp` **恒为 0**，且由 `assertNoPgDelete()` 在每次运行末尾硬断言，否则抛 `PG_DELETE_FORBIDDEN`。
- `skippedUnbound` = `sync_map` 指向的 PG 行缺失（ORPHAN）或映射冲突的记录数；**不自动修复、不改绑、不删除**。
- `unbound` / `gridNull` / `inspectorNull` = 因 WPS 无可靠网格/身份来源而以 `NULL` 落库的候选数（fail-closed 的正常结果，非错误）。

---

## 4. FIELD_MAP 最终使用情况

### 4.1 收敛前（3 套并存）

| 位置 | 形态 | 消费方 |
|---|---|---|
| `wpsGridSyncService.FIELD_MAP`（A） | 18 列 `{wps,pg,tf}` | 同步引擎 + `sync_hash` + 仓储兜底读 |
| `wps/wpsFieldMap.js FIELD_MAP`（B） | 业务语义 31 项 `{wps,biz,pg,type,mode}` | PC 台账仓储读写 |
| `wpsGridMigrationService.FIELD_MAP`（C） | 15 项 `[wps,pg]` + PHOTO_MAP 3 项 | 一次性历史迁移 |

### 4.2 收敛后（唯一真源）

`services/wps/wpsFieldMap.js` 为**唯一字段真源**，新增以下冻结导出：

| 导出 | 含义 |
|---|---|
| `SYNC_PROJECTION_ORDER` | 规范化投影顺序：前 18 列 = **冻结 hash 口径**；后 5 列 = PC 台账业务列（板上暂无此列 → 惰性，不参与 hash） |
| `SYNC_HASH_COLUMNS` / `SYNC_HASH_COLUMN_COUNT` | 参与 sync_hash 的列（冻结 18） |
| `SYNC_PROJECTION` | `[{wps,pg,tf,type,hash}]`（由 FIELD_MAP 反查构造，缺映射即抛错，防静默漂移） |
| `SYNC_URL_COLUMNS` | 图片列 `image_content / rectified_photo / schematic` |
| `PROTECTED_COLUMNS` | `['grid_id','inspector_employee_id']`（PG 权威字段，引擎永不触碰） |

> 同时补齐了真源此前**缺失的 `日期 ↔ inspection_date`**（历史上只能靠 A 兜底）。

### 4.3 等价性证明（`wpssync02-equivalence.json`，11/11 PASS）

| 断言 | 结果 |
|---|---|
| 2061 条映射记录的 `canonicalHash(wpsToPg(fields))` 与库中 `sync_map.sync_hash` **逐字节一致** | **2061/2061 match，mismatch=0** |
| 通用字段映射集合 == 历史字面量 C 的集合 | 15 == 15 ✅ |
| 照片列顺序/集合 == 历史 PHOTO_MAP | 完全一致 ✅ |
| `sync.FIELD_MAP.length == 18`（冻结） | ✅ |
| 迁移 `buildDto.insertCols` 集合 == 历史（样例 80 条） | 80/80 ✅ |
| `buildDto.syncHash` == `canonicalHash(wpsToPg())` | ✅ |
| 历史迁移门禁 `pass=true` / `phase=all_done` / `NOT_EXISTS=0` | ✅ |

---

## 5. 幂等机制

| 项 | 实现 |
|---|---|
| **唯一幂等键** | `(wps_record_id, wps_file_id)`（库内已有 `UNIQUE` 索引，实测存在） |
| **禁止使用的键** | 姓名 / 日期 / 违章人姓名 / 自然键 / WPS 行号 / serialNo / inspectionId |
| **自然键匹配** | **已彻底删除**（`findPgIdByNaturalKey` / `matchedByNaturalKey` 全项目 0 处） |
| **未命中（NOT_EXISTS）** | 允许新增；`(wps_record_id,wps_file_id)` 未命中 → `INSERT` + `sync_map INSERT`（同事务） |
| **命中且未变** | `SKIPPED_UNCHANGED`（不写） |
| **命中且已变** | 仅更新**业务列**（受保护列硬断言禁止出现） |
| **并发兜底** | 事务内 `SELECT … FOR SHARE` 预检 + `UNIQUE` 唯一约束；`23505` → `ALREADY_EXISTS`，**绝不改绑** |

**bindMap 改绑风险已消除**：新引擎不再使用旧的 `ON CONFLICT (pg_record_id) DO UPDATE`（该写法允许一个 PG 行被改绑到不同 WPS 记录）；新增走纯 `INSERT`，更新走 `WHERE pg_record_id=$1 AND wps_record_id=$2`。

---

## 6. BT / EA 排除机制

```js
const FROZEN_EXCLUSIONS = [
  { recordId: 'BT', serialNo: 'L2609', name: '王铁民', date: '2026-09-02', reason: '人工裁定：WPS 保留、PG 不迁入' },
  { recordId: 'EA', serialNo: 'L2794', name: '谢俊章', date: '2026-09-05', reason: '人工裁定：WPS 保留、PG 不迁入' },
];
```

- **判定依据 = `wps_record_id`（不是姓名/日期/serialNo）**；`serial_no/name/date` 仅作审计留痕。
- **不依赖「PG 里已经有了所以自然跳过」**：排除检查发生在幂等判定**之前**，BT/EA 永远进不了 `newCandidates`。
- `WPS_SYNC_EXCLUDE_EXTRA` 只能**追加**排除，**无法移除**冻结项（fail-safe）。
- 命中结果：`skippedExcluded++ / excluded++ / bt++ / ea++`，并入 `excludedDetail`（含 reason）。

**真机验证**：`INJECT = [BT, EA]` → `inserted=0 / unbound=0 / skippedExcluded=2 / bt=1 / ea=1`，PG 与 sync_map 行数**零变化**。

---

## 7. inspector_employee_id 保护

| 规则 | 实现 |
|---|---|
| 引擎**永不写入**该列 | 它不在 `SYNC_PROJECTION` 中；`PROTECTED_COLUMNS` 硬断言 |
| WPS `姓名` → employee | **禁止**（不做任何姓名匹配 / 花名册查询 / 唯一命中推断） |
| WPS 网格负责人 → employee | **禁止** |
| WPS 账号 / `巡查人员ID` → employee | **禁止** |
| 新记录取值 | **恒 `NULL`**（fail-closed） |
| 存量记录 | 更新语句不含该列 → 既有值（含 10 条人工补迁值）**不可能被覆盖** |

真机验证：新插入记录 `inspector_employee_id IS NULL`；10 条人工记录（7183–7192）更新前后 `6789/7437/6698×6/6692×2` **零漂移**。

---

## 8. grid_id 保护

| 规则 | 实现 |
|---|---|
| 引擎**永不写入**该列 | 不在 `SYNC_PROJECTION` 中；`PROTECTED_COLUMNS` 硬断言 |
| WPS 分组名称 / 乡镇名称 → grid_id | **禁止** |
| 姓名 → grid_id | **禁止** |
| 模糊匹配 / 粗粒度字段（如「公司管理」） | **禁止** |
| 新记录 | **恒 `NULL`**（fail-closed）→ 管理员可见、`grid_inspector` 不可见（沿用既有 own_grid 规则） |
| 327 条历史 NULL | 更新语句不含该列 → **保持 NULL，永不回填** |

真机验证：原 327 条 NULL 记录的 `(id, grid_id)` 集合在全部 Pull 运行前后**完全一致**。

---

## 9. WPS 删除保护

```text
WPS 中不存在某 Record
        ↓
只统计 wpsDeleted（+ wpsDeletedDetail 审计）
        ↓
绝不 DELETE FROM grid_inspection_records
绝不 DELETE FROM grid_record_sync_map
绝不调用 WPS 删除 API
绝不触发 PG → WPS
```

- **未新增任何 DDL**（无 `deleted_at` / `is_deleted` / `wps_missing` 列）——按 `§8` 要求仅在运行结果中统计 `wpsDeleted`。
- 真机验证（最坏情况）：`INJECT = 真实记录前 100 条` → `wpsDeleted = 1961`、`pgDeleted = 0`、PG 行数不变、sync_map 行数不变、全程 `DELETE` 语句计数 **0**、WPS 写 API 计数 **0**。

---

## 10. 图片处理

- 继续使用已验证的**链接镜像**方式（`三违照片链接 / 整改后照片链接 / 示意图链接` → `image_content / rectified_photo / schematic`）。
- **未重新引入** `_xlfn.DISPIMG()` 字符串解析。
- 仅合法 `^https?://` URL 写入图片列；异常值**独立记入 `imageWarnings`**，**不影响**身份或网格归属。
- 图片异常**不会**导致整条记录错误身份绑定（图片列与身份列完全解耦）。

### ⚠ 本阶段新增的关键数据安全修正（真机实测发现）

真机量化（`wpssync02-imgcmp.json`）：

| 列 | WPS=非 http 且 PG=非 http | 样本 |
|---|---|---|
| `image_content` | **1698** | `/uploads/grid-inspection/backfill_run_mt…` |
| `rectified_photo` | **471** | 同上 / `是` |
| 另有 `violator_name/gender/age` | **1238 行** PG 存 `'--'` | 历史占位符 |

若按 SYNC-00 冻结的「伪空→NULL / 非 http(s)→NULL」直译，**任何一次真实 UPDATE 都会把上述 1700+ 条既有站内相对路径引用与 1238 行历史占位符抹成 NULL**（数据降级）。

**修正后的 fail-safe 规则**（`toCanonicalDto`）：

| WPS 原值形态 | 处理 | 理由 |
|---|---|---|
| 字段不存在 | 键省略（PG 保持） | WPS 未提供该字段 |
| `null` / `''` / 纯空白 | 写 `null` | 用户主动清空，清空意图明确 |
| **伪空占位符** `nan/--/-/无/None/undefined` | **键省略 + warning** | 占位符≠清空意图；保留 PG 历史原文 |
| 图片列非 `http(s)` | **键省略 + warning** | 保留 PG 既有站内相对路径引用 |
| 日期不可解析 | `null` | 不写脏日期 |

- 新增记录：键省略 → 取列默认 `NULL`，**完全符合「仅 http(s) 落库」冻结口径**。
- 存量记录：键省略 → **PG 现值保留**，**物理上不可能造成数据降级**。

修正后复测（`wpssync02-drift.json`）：

```text
mapped=2061  hashSame=2061  matched=2061  drifted=0  noRow=0  diffCols={}
```

> 即：即使完全绕过 `sync_hash` 快路径、对全部 2061 条逐列比对，也**没有任何一条会触发 UPDATE** —— 这是「零数据漂移」的最强证据。

---

## 11. sync_hash

| 项 | 结论 |
|---|---|
| 用途 | **仅**作 WPS→PG 单向 **变更检测 / 回声抑制 / 快速预筛** |
| 口径 | **冻结 18 列**固定顺序、`''≡null` 的 SHA-256（与既有 2061 条 `sync_map.sync_hash` **逐字节兼容**） |
| 与旧语义区别 | **不再**解释为 LWW / 双向冲突解决 / 「谁覆盖谁」；单向只有一个方向 |
| 双向字段 | `push` / `pgDeletedCatchUp` 保留仅为结构兼容，恒为「未执行」 |
| 变更检测双保险 | ①`sync_hash` 快路径命中即 `SKIPPED_UNCHANGED`；②未命中则做**字段级权威比对**（`dtoEqualsPgRow`），一致 → `SKIPPED_UNCHANGED` 并**重基线** `sync_map.sync_hash`（业务行零写入，`hashRebaselined++`） |
| 写入口径 | INSERT/UPDATE 使用**规范化 DTO**，与 hash 口径分离（hash 保留历史口径以兼容存量映射，DTD 使用更干净的 fail-safe 规则） |

---

## 12. 事务机制

```text
每条【新增】记录：
  BEGIN
    SELECT ... FROM grid_record_sync_map WHERE wps_record_id=$1 AND wps_file_id=$2 FOR SHARE
    INSERT INTO grid_inspection_records (...) RETURNING id
    INSERT INTO grid_record_sync_map (...)              -- 纯 INSERT，无 ON CONFLICT DO UPDATE
  COMMIT
  任一步失败 → ROLLBACK → 绝不留下半条映射
```

- 每条【更新】记录同样使用 `BEGIN … COMMIT` 包裹「业务行 UPDATE + 映射行 UPDATE」。
- 不可能出现「PG 有数据 / sync_map 没数据」或反之。
- **真机注入故障验证**：在 TEMP 副本 `grid_record_sync_map` 上挂 `BEFORE INSERT` 触发器对测试记录抛异常 →
  `errors=1 / inserted=0`，PG 业务行 **零残留**、sync_map **零残留**（无半条映射）。

---

## 13. Scheduler

| 要求 | 实现 |
|---|---|
| `WPS_GRID_SYNC=false` → 无害不执行 | `runPull()` 首行 `if (!svc.isEnabled()) return {skipped:true,reason:'disabled'}`；`initWpsGridSyncScheduler()` 亦不注册 cron |
| 只有 `=true` 才允许启动 | 双重判定（注册时 + 每次执行时） |
| 只能调用 WPS→PG | 只调用 `svc.pullWpsToPg()`；**不再调用 `svc.reconcile()`**（静态断言 N5/N6 验证） |
| `reconcile()` 等价性 | 实现已收敛为「仅 `pullWpsToPg()` + 恒 disabled 的 push 占位」，**不再是旧双向 reconcile** |
| 并发保护 | 模块级 `running` 标志（调度器）+ 引擎内 `pullRunning` 互斥锁，**双重保证同一时刻只有一个 Pull** |
| 未新增依赖 | 复用既有 `node-cron`；无新 npm 依赖 |

`.env` 保持 `WPS_GRID_SYNC=false`（mtime 全程 `2026-09-11 07:13:11` 未变）→ **生产调度器仍处于休眠态**，本阶段未启动任何定时同步。

---

## 14. Dry Run 结果（真机 · 只读）

`server/scripts/_wpssync02_dryrun.cjs` → `server/scripts/output/wpssync02-dryrun.json`

```text
=== 真机 Dry Run 结果（WPS → PG，只读，2063 条）===
{
  "total": 2063,          // WPS 全量
  "alreadyExists": 2061,  // 幂等键命中
  "newCandidates": 0,     // 无未映射业务记录
  "changedCandidates": 0, // 无真实变更
  "excluded": 2, "bt": 1, "ea": 1,
  "unbound": 0, "gridNull": 0, "inspectorNull": 0,
  "inserted": 0, "updated": 0,
  "skippedUnchanged": 2061, "skippedExcluded": 2,
  "conflicts": 0, "wpsDeleted": 0, "pgDeleted": 0,
  "errors": 0, "imageWarnings": 200
}
DML counted: {"insert":0,"update":0,"delete":0,"ddl":0}
ZERO_WRITE = true     BASELINE_UNCHANGED = true
```

- 开关通过**进程级 `process.env.WPS_GRID_SYNC=true`** 打开，**`.env` 未修改**。
- `imageWarnings=200`（列表上限）全部为「非 http(s) 的站内相对路径 `/uploads/...`」→ 已按 §10 fail-safe 规则**键省略**，不置空。

---

## 15. 测试结果

### 15.1 门禁测试：`112/112 ALL_PASS`

脚本 `server/scripts/_wpssync02_gate.cjs` → `server/scripts/output/wpssync02-gate.json`

**零残留手法（本阶段核心创新）**：在同一 PostgreSQL 会话内建立 **TEMP 副本表**
（`grid_inspection_records` / `grid_record_sync_map` `LIKE public.* INCLUDING ALL`）+ 会话私有 TEMP 序列
（`setval` 到种子最大值之后，**不消耗生产 sequence**）。`pg_temp` 在 `search_path` 中隐式优先，
故引擎全部读写真机落在 TEMP 表上；会话结束自动销毁 → **生产表零写入**，同时保留**真实 SQL / 真实唯一约束 / 真实事务**语义。

| 组 | 覆盖 | 结果 |
|---|---|---|
| **A（7）** | 开关语义 5 态（`true`/`false`/未设置/`abc`/`''`）+ `reverseWriteEnabled` 恒 false + `deleteSyncEnabled` 硬锁 false | 7/7 ✅ |
| **Case0（6）** | 最坏情况 `isEnabled()=true`、冻结 hash 列 18、真机 WPS 2063 条、TEMP 副本 2061/2061、`search_path→pg_temp` | 6/6 ✅ |
| **B（12）** | 反向写隔离：`pushRow` disabled、`onPgRowChanged/onPgRowsDeleted` no-op、`reconcile` 单向、`POST /push`→410、`dryRun` 零 DML、非管理员真实写入→403 | 12/12 ✅ |
| **C（10）** | 真机全量 Pull：`pulled=2063 inserted=0 updated=0 unchanged=2061 excluded=2 pgDeleted=0 errors=0`、WPS 零写 | 10/10 ✅ |
| **D（7）** | 幂等：第二次 Pull 同结果，无重复插入，TEMP 两表行数不变 | 7/7 ✅ |
| **E（7）** | 更新：业务字段更新成功、`grid_id`/`inspector_employee_id` 未被覆盖、**历史占位符 `--` 与既有照片引用未被抹除**、WPS 零写 | 7/7 ✅ |
| **F（5）** | 身份保护：新记录 `inspector_employee_id IS NULL`、业务字段正确写入、sync_map 成对建立 | 5/5 ✅ |
| **G（4）** | 网格保护：`grid_id IS NULL`、照片非 URL → NULL、`imageWarnings` 独立记录 | 4/4 ✅ |
| **H（10）** | BT/EA：`skippedExcluded=2 unbound=0`，PG 行/映射行零变化，排除依据为 `wps_record_id` | 10/10 ✅ |
| **I（6）** | WPS 删除：`wpsDeleted=1961 pgDeleted=0`，PG/sync_map 零删除，全程 `DELETE` 语句 0，WPS 写 0 | 6/6 ✅ |
| **J（2）** | 327 条 NULL 保护：`(id,grid_id)` 集合零漂移 | 2/2 ✅ |
| **K（1）** | 10 条人工记录 `grid_id`/`inspector_employee_id` 零漂移 | 1/1 ✅ |
| **L（5）** | 事务原子性：注入 sync_map 写入失败 → `errors=1 inserted=0`，PG 与 sync_map 双零残留 | 5/5 ✅ |
| **X（3）** | `limit=10` 生效；`dryRun` 全量 `pgDeleted=0` 且零 DML | 3/3 ✅ |
| **N（13）** | 静态残留扫描（见 §21） | 13/13 ✅ |
| **M（14）** | 生产基线不变量 + 10 条人工 + `sync_state` 空 + BT/EA 无映射 + 最大 id 7192 | 14/14 ✅ |

### 15.2 等价性证明：`11/11 ALL_PASS`（见 §4.3）
### 15.3 漂移量化：`drifted=0 / matched=2061`（见 §10）
### 15.4 真机 Dry Run：`ZERO_WRITE=true, BASELINE_UNCHANGED=true`（见 §14）

---

## 16. 数据基线（前后零漂移）

| 指标 | 实施前 | 实施后 | 一致 |
|---|---|---|---|
| `grid_inspection_records` | 2061 | 2061 | ✅ |
| `grid_record_sync_map` | 2061 | 2061 | ✅ |
| `grid_id IS NULL` | 327 | 327 | ✅ |
| `grid_id IS NOT NULL` | 1734 | 1734 | ✅ |
| `inspector_employee_id IS NOT NULL` | 10 | 10 | ✅ |
| live `grid_areas` | 62 | 62 | ✅ |
| active `users`（admin 1 / grid_inspector 62） | 63 | 63 | ✅ |
| `sync_map conflict` | 0 | 0 | ✅ |
| `grid_record_sync_state` | 空 | 空 | ✅ |
| `MAX(grid_inspection_records.id)` | 7192 | 7192 | ✅（生产 sequence 未被消耗） |
| WPS 记录数 | 2063 | 2063 | ✅ |
| WPS-only | BT / EA | BT / EA | ✅ |

- `.env` mtime 全程 `2026-09-11 07:13:11` **未变**；`WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=false` 未变。
- 5876 进程 PID **27316 全程未变**（本阶段**重启 0 次**）。
- 生产 10 条人工记录 `grid_id`/`inspector_employee_id` 零漂移。

---

## 17. WPS 写入计数

```text
WPS writes   = 0   （createRecords / updateRecords / deleteRecords 全程 0 次）
WPS deletes  = 0
反向写入调用 = 0   （pushRow / onPgRowChanged / onPgRowsDeleted 全部 no-op）
```

门禁对 `wpsClient.{createRecords,updateRecords,deleteRecords}` 与 `adapter.{createRecord,updateRecord,deleteRecord}` 全程计数，B/C/E/G/H/I 各组断言均为 **0**（`gate.json.wpsWrites = 0`）。

---

## 18. PG 删除计数

```text
PG deletes = 0   （Pull Engine 无任何 DELETE 语句；静态断言 N1/N2 通过）
pgDeleted  = 0   （运行期硬断言，非 0 即抛 PG_DELETE_FORBIDDEN）
```

- 真机 L 组（事务回滚）与 I 组（WPS 源消失）均断言 `DELETE` 语句计数 = 0。
- 未删除任何业务行、映射行、WPS 记录。

---

## 19. 风险与遗留项

| # | 项 | 风险 | 处理 |
|---|---|---|---|
| R1 | **`imageWarnings` 200 条**：WPS 侧 1698 条 `image_content` / 471 条 `rectified_photo` 为站内相对路径 `/uploads/...`，非 http(s) | 低 | 已按 fail-safe **键省略**保留 PG 现值；**不落库、不置空**。若要支持，需后续阶段定义「相对路径 + 站点前缀」的规范化规则（**不在本阶段**） |
| R2 | 1238 行 PG `violator_name/gender/age` 存历史占位符 `'--'` | 低 | 已按 fail-safe **键省略**保留；同步不会抹成 NULL |
| R3 | 生产 5876 运行态代码 | 中 | 本阶段**未重启**（未授权）→ 运行进程仍为 SYNC-01 版代码。因 `WPS_GRID_SYNC=false`，运行态本就不执行 Pull；改动于**下次授权重启/部署**后生效 |
| R4 | 前端删/清空/导入按钮未按角色隐藏 | 低 | 既有缺口，后端 403 兜底；不在本阶段 |
| R5 | 327 条 `grid_id IS NULL` 未回填 | — | 冻结不动；同步引擎结构上不可能回填 |
| R6 | Excel `import` 网关按姓名模糊匹配 `grid_id` | 低 | 独立于本引擎（facade 外），仍待治理 |
| R7 | `site-mgmt` WPS 原生分支 `gridWps.*` 与 `/api/wps/dbsheet/*` admin 端点仍可写 WPS | 低 | 受 `WPS_GRID_DATA_SOURCE=false` 保护、生产不可达；按 §2 纪律本阶段未动 |
| R8 | `unboundDetail` 仅保留前 50 条 | 低 | 审计信息截断上限，非行为限制 |

---

## 20. 下一阶段建议（SYNC-03）

1. **人工门禁后执行首次受控生产 Pull**（建议顺序）：
   `dryRun` → `limit=50` 实跑 → 核对基线与 `updated` 明细 → 放开全量。
2. **真机不变量复核**：`2061 / 2061 / 327 / 1734 / 10 / 62 / 63 / 0 conflict` 冻结前后 diff 为空。
3. **WPS 只读性验证**：全程 WPS 写 API 计数 0。
4. **`WPS_GRID_SYNC=true` 开启前的二次评审**：确认 `WPS_GRID_DATA_SOURCE=false`、`WPS_SYNC_DELETE` 保持 unset、BT/EA 排除仍在。
5. **可选治理项**（需单独立项，不在 SYNC-03 内自动执行）：
   - 站内相对路径 `/uploads/...` 的图片引用规范化；
   - `violator_name/gender/age` 历史占位符 `'--'` → `NULL` 的数据清洗（需人工确认）；
   - 327 条 NULL `grid_id` 的人工归属；
   - 前端按角色隐藏删除/清空/导入入口。
6. **SYNC-01 改动生效确认**：连同本阶段改动一并在授权重启窗口部署后复验 `/api/wps-grid-sync/status`。

---

## 21. 旧代码残留检查（§21 逐项）

全项目搜索并断言（N 组 13/13 PASS）：

| 搜索项 | 结论 |
|---|---|
| `pushRow` | 仅存在于 facade 中，恒 `{disabled:true, reason:'REVERSE_WRITE_DISABLED'}`；**无生产调用点** |
| `pushFromPg` | **不存在** |
| `onPgRowChanged` / `onPgRowsDeleted` | 仅 facade no-op；`site-mgmt` **0 引用** |
| `reconcile` | 调度器**不再调用**；其实现已等价于 `pullWpsToPg()` |
| `deleteRecords` | 引擎中 **0 处**；`wpsClient` 的删除 API 无调用方 |
| `ensureTables` | 名称保留兼容，**语义已改为只读断言**（`assertSchemaReady`），**Pull 路径零 DDL** |
| `WPS_GRID_SYNC` | 仅 `=== 'true'` 才启用（`false`/未设置/`''`/`abc` 全部 disabled） |
| `initWpsGridSyncScheduler` | 仅在 `isEnabled()` 时注册 cron |
| 自然键幂等 | `findPgIdByNaturalKey` / `matchedByNaturalKey` **全项目 0 处** |

**最终证明**：

```text
✅ 不存在 PG → WPS 生产调用
✅ 不存在 PG DELETE → WPS
✅ 不存在 WPS DELETE → PG DELETE
✅ 不存在自动 DDL（Pull Engine 内 CREATE/ALTER/DROP 计数 = 0）
✅ 不存在自然键作为正式幂等键
```

---

## 22. 生产数据安全门禁（§22 逐项复核）

| 门禁项 | 状态 |
|---|---|
| BT/EA 可能进入 PG | ❌ 不可能（排除检查先于幂等判定，H 组验证） |
| `grid_id` 被自动推导 | ❌ 不可能（不在投影中 + 硬断言） |
| `inspector_employee_id` 被自动绑定 | ❌ 不可能（不在投影中 + 硬断言） |
| `PG DELETE > 0` | ❌ 恒 0（`assertNoPgDelete` 抛错兜底） |
| WPS DELETE API 被调用 | ❌ 0 次 |
| PG → WPS API 被调用 | ❌ 0 次 |
| `sync_map` 重绑 | ❌ 不可能（纯 INSERT + `WHERE pg_record_id AND wps_record_id` 定向更新） |
| 自然键参与正式身份判断 | ❌ 0 处 |
| 事务无法保证 | ❌ 单事务成对写入，注入故障验证双零残留 |
| `ensureTables()` 仍会执行 DDL | ❌ 已改为只读断言，Pull 路径零 DDL |

**无一项触发 STOP 条件。**

---

## 23. 报告要求对照（§23）

1. 实施摘要 ✅ §1　2. 修改文件清单 ✅ §2　3. Pull Engine 架构 ✅ §3
4. FIELD_MAP 最终使用情况 ✅ §4　5. 幂等机制 ✅ §5　6. BT/EA 排除机制 ✅ §6
7. `inspector_employee_id` 保护 ✅ §7　8. `grid_id` 保护 ✅ §8　9. WPS 删除保护 ✅ §9
10. 图片处理 ✅ §10　11. `sync_hash` ✅ §11　12. 事务机制 ✅ §12
13. Scheduler ✅ §13　14. Dry Run 结果 ✅ §14　15. 测试结果 ✅ §15
16. 数据基线 ✅ §16　17. WPS 写入计数 ✅ §17　18. PG 删除计数 ✅ §18
19. 风险与遗留项 ✅ §19　20. 下一阶段建议 ✅ §20

---

## 附录 A：验收签字

```text
[x] 旧的双向同步代码已彻底收敛为单向 Pull Engine
[x] 唯一字段真源（services/wps/wpsFieldMap.js）；3 套 FIELD_MAP 字面量 → 1 套
[x] 幂等键冻结为 (wps_record_id, wps_file_id)；自然键彻底废弃
[x] BT / EA 内置硬排除（依据 wps_record_id）
[x] inspector_employee_id / grid_id 结构性不可写（PROTECTED_COLUMNS 硬断言）
[x] WPS 删除绝不回删 PG；pgDeleted 恒 0（运行期硬断言）
[x] 每条新增/更新均单事务；注入故障验证双零残留
[x] Pull 路径零 DDL；ensureTables 改为只读断言
[x] dryRun 只读（零 DML）；真机 Dry Run ZERO_WRITE=true / BASELINE_UNCHANGED=true
[x] 存量零漂移：规范化 DTO vs PG 现值逐列比对 drifted=0（2061/2061）
[x] sync_hash 口径与既有 2061 条逐字节兼容（mismatch=0）
[x] Scheduler 单向；WPS_GRID_SYNC=false 时休眠
[x] WPS writes = 0 ／ PG deletes = 0 ／ DDL = 0 ／ frontend = 0 ／ auth = 0
[x] .env 未改（mtime 07:13:11 未变）；5876 未重启（PID 27316 未变）
[x] 基线 2061/2061/327/1734/10/62/63/0 全部不变
[x] 未执行生产全量 Pull（按 §17 要求等待下一道人工门禁）
```

- 门禁测试：**112/112 ALL_PASS**（`server/scripts/output/wpssync02-gate.json`）
- 等价性证明：**11/11 ALL_PASS**（`server/scripts/output/wpssync02-equivalence.json`）
- 漂移量化：**drifted=0 / matched=2061**（`server/scripts/output/wpssync02-drift.json`）
- 真机 Dry Run：**ZERO_WRITE / BASELINE_UNCHANGED**（`server/scripts/output/wpssync02-dryrun.json`）

## 附录 B：真机证据索引

| 证据 | 路径 |
|---|---|
| 现状取证 | `server/scripts/output/wpssync02-recon.json` |
| 列分布探针 | `server/scripts/output/wpssync02-colprobe.cjs`（脚本） |
| 图片形态量化 | `server/scripts/output/wpssync02-imgcmp.json` |
| 存量漂移量化 | `server/scripts/output/wpssync02-drift.json` |
| 等价性证明 | `server/scripts/output/wpssync02-equivalence.json` |
| 门禁测试 | `server/scripts/output/wpssync02-gate.json` |
| 真机 Dry Run | `server/scripts/output/wpssync02-dryrun.json` |
| 修改前备份 | `server/backups/wpssync02_20260911/*.bak` |

---

**最终状态：`PHASE_WPS_PG_SYNC_02_COMPLETED_READY_FOR_SYNC_03`**

> 完成后已停止，未自行执行生产全量同步。
