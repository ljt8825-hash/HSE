# HSE-MOBILE-GRID-ARCH-03-P2-B0 · PRECHECK + 最小数据库落地

> 阶段性质：**IMPLEMENTATION + MIGRATION DRY-RUN + FAIL-SAFE FOUNDATION**（非切换、非上线、非 WPS 能力最终验收）
> 执行日期：2026-09-12 ｜ 执行方式：仅开发/测试库 `safety_dashboard_dev`（已证明 ≠ 生产）
> 配套脚本：`server/scripts/_p2b0_precheck.cjs`（只读）、`server/scripts/_p2b0_migrate.cjs`（受护栏 runner）、`server/sql/20260912_arch03_p2b0_grid_inspection_ext.sql`

---

## 0. 红线遵守声明（最高优先级）

| 红线 | 遵守情况 |
|---|---|
| 严禁触碰生产 5876 / PID 23396 / 生产 PG / 生产 .env / Scheduler / WPS 生产写入 / WPS_GRID_SYNC / SCHEDULER_ENABLED | ✅ 全程未触碰；迁移仅作用于独立库 `safety_dashboard_dev` |
| 写操作前执行目标环境确认（PID / 端口 / 库名 / 连接 / 环境变量） | ✅ runner 启动时打印全部 5 项并断言 |
| 无法证明目标 ≠ 生产则 STOP | ✅ 目标 `safety_dashboard_dev` 经 `pg_database` 实列为独立 `datname`，硬编码护栏拒绝 `safety_dashboard` |
| 严禁修改冻结层（SYNC_PROJECTION 前18 / SYNC_HASH / canonicalHash / toCanonicalDto / toLegacyHashDict / PROTECTED_COLUMNS / FIELD_MAP / sync_hash / UNIQUE / 05-H-0 / WPS 反向 no-op） | ✅ 本回合**未修改任何源码文件**；新增列全部落在 18-hash 投影之外 |

---

## 1. §三 PRECHECK（只读，全部已执行）

所有检查均通过 `server/scripts/_p2b0_precheck.cjs`（**仅 SELECT，零 DDL**）完成。

| # | 检查项 | 结果 |
|---|---|---|
| 1 | `grid_inspection_records` 真实 schema | **28 列**（见下）；5 个 P2-B0 新列**尚不存在** |
| 2 | `grid_record_sync_map` 真实 schema | 11 列（沿用 P2-A 基线），`UNIQUE(wps_record_id,wps_file_id)` 存在且未被破坏；本回合未改动 |
| 3 | `wpsFieldMap.js` | 重读确认冻结：`SYNC_PROJECTION_ORDER` 前 18 列 = hash 口径、`PROTECTED_COLUMNS=['grid_id','inspector_employee_id']`、`SYNC_HASH_COLUMN_COUNT=18`，未变 |
| 4 | `wpsGridPullEngine.js` | 重读确认冻结：no-DDL（`assertSchemaReady` 仅查存在性）、`assertNoProtectedColumns`、`assertNoPgDelete`、`UNIQUE` 断言，未变 |
| 5 | `gridInspectionRepository.js` | 重读确认：WPS 模式 `inspectorEmployeeId` 写 WPS 列但**不在 SYNC_PROJECTION** → Pull 忽略 → PG NULL，未变 |
| 6 | `gridScope.js` | 重读确认：`resolveGridScope` / `deriveGridIdForEmployee` 行级范围逻辑未变 |
| 7 | `authenticatedEmployeeResolver.js` | 重读确认：`req.user.id→users.employee_id→employee.id` 链、无姓名兜底、fail-closed，未变 |
| 8 | 当前 migration 机制 | **无 `server/migrations/` 目录**；项目约定 = `server/sql/*.sql`（幂等 `IF NOT EXISTS`）+ JS migrate 脚本；Pull Engine 自身不做任何 DDL |
| 9 | 当前测试库连接 | `safety_dashboard_dev` **真实存在**（`pg_database` 独立 `datname`），可达，为 2061 行克隆库 |
| 10 | 当前开发/测试启动方式 | 本回合为**纯数据库落地**，未启动后端；02-B 阶段已确立 `DB_NAME=safety_dashboard_dev` + `PORT≠5876` 为隔离启动方式 |

### `grid_inspection_records` 28 列（生产实查）
`id, area_team, upload_time, inspection_date, personnel_name, grid_level, position, violator_name, violator_gender, violator_age, vehicle_type, report_status, image_content, violation_behavior, violation_type_result, need_rectification, rectifier, rectified_photo, schematic, grid_id, created_at, updated_at, nickname, signup_today, marker, is_resubmit, serial_no, inspector_employee_id`

### PRECHECK 四项必达判定（全部 PASS）
- **目标库 ≠ 生产**：`safety_dashboard_dev` ≠ `safety_dashboard` ✅
- **目标进程 ≠ PID 23396**：迁移以独立 node 脚本运行（PID 4936/10836），非生产后端 23396 ✅
- **目标端口 ≠ 5876**：脚本直连 PG `127.0.0.1:5432`，不经后端 5876 ✅
- **05-H-0 baseline 未变化**（执行后复核）：生产 `gir=2061 / sync_map=2061 / max(id)=7192 / conflict=0 / inspector_employee_id NULL=2051 / grid_id NULL=327` ✅

---

## 2. §四 数据库最小落地（已执行，仅开发/测试库）

**目标库**：`safety_dashboard_dev`（隔离测试库，02-B 克隆）
**执行产物**：
- `server/sql/20260912_arch03_p2b0_grid_inspection_ext.sql` — 幂等 `ADD COLUMN IF NOT EXISTS` + 列注释
- `server/scripts/_p2b0_migrate.cjs` — 受护栏 runner（默认 DRY-RUN，仅 `--apply` 且目标非生产时才真正执行）

**新增 5 列（全部 `text NULL`，位于 18-hash 投影之外，不影响 `sync_hash` 口径）**：

| 列名 | 语义 | Fail-Safe 默认值语义 |
|---|---|---|
| `source_channel` | 来源通道：`mobile_h5` / `wps_form` / `unknown` | 未验证能力 → `unknown` |
| `client_token` | 客户端提交幂等令牌（Channel A 强键） | WPS 通道不填 → `NULL` |
| `submission_fingerprint` | 业务指纹（跨通道去重键） | 未验证能力 → `NULL` |
| `attribution_status` | 身份归属状态：`pending`/`attributed`/`failed` | WPS 无 creator → `pending` |
| `attachment_resolution_status` | 附件解析状态：`pending`/`resolved`/`failed` | WPS Attachment≠URL 镜像 → `pending` |

**执行核对（runner 自报）**：
- 5 列全部就位 = YES
- `gir` 行数 before=2061 / after=2061（零 DML 数据变更）
- 执行后 `safety_dashboard_dev` 列数 = 33（28 + 5）

---

## 3. 冻结层遵守确认

本回合**未修改任何源码/配置/DDL 之外的对象**：
- ❌ 未改 `SYNC_PROJECTION_ORDER` 前 18 列 / `SYNC_HASH_COLUMNS` / `canonicalHash` / `toCanonicalDto` / `toLegacyHashDict`
- ❌ 未改 `PROTECTED_COLUMNS` / 现有 `FIELD_MAP` / `sync_hash` 算法 / `UNIQUE(wps_record_id,wps_file_id)`
- ❌ 未改 05-H-0 冻结文档 / WPS 反向写入 no-op 语义
- ❌ 未重写 Pull Engine
- ✅ 仅对 `safety_dashboard_dev`（非生产）的 `grid_inspection_records` 增加 5 个 nullable 列

---

## 4. 生产边界确认（执行后复核）

- `netstat`：`5876→PID 23396`、`5432→PID 10680` 仍 LISTENING，与冻结态一致，**未被本回合改动**
- 生产 `safety_dashboard`：`grid_inspection_records` 仍为 **28 列**、基线 2061/2061/7192/0 不变（已实查）
- `server/.env` mtime = `2026-09-11 22:22:50`（未变）
- `WPS_GRID_SYNC=true` / `WPS_GRID_DATA_SOURCE=false` / `SCHEDULER_ENABLED=true` 均未被修改

---

## 5. ⚠ 任务规格截断提示（重要，需你确认）

你本次下发的任务在 **§四 的 SQL 代码块起始处被截断**——列出 `grid_inspection_records` 的 5 个新列后消息即结束，未收到后续内容。因此以下**很可能属于本阶段、但本次未收到的部分，我未擅自猜测或执行**：

1. `grid_record_sync_map` 的附加列（P2-A 设计为 +1 列）
2. 新桥接表 `wps_account_employee_map`（P2-A 设计）
3. Fail-Safe **Post-Insert Enrichment Layer** 运行时代码（身份归属 / 附件解析 / 业务去重 三组件的实现）

我严格遵循「不猜实现、未验证能力 fail-safe、不碰生产」的纪律，**只执行了明确给出的 5 列 gir 扩展**。

---

## 6. 下一步 / 待确认

- 请补全 §四 截断的剩余部分（sync_map 列名？桥接表 schema？Enrichment Layer 规格？），或确认仅需当前 5 列。
- 收到后，下一子阶段（P2-B1）可据补全规格在 `safety_dashboard_dev` 上落地 bridge 表 + Enrichment Layer，并复跑本回合的只读门禁。
- 生产切换、WPS 能力最终验收、P2-B 全链联调均不在本阶段范围。

**状态机**：`P2-B0_DB_LANDED_ON_DEV`（仅数据库最小落地已完成；规格截断部分待确认，未进入后续编码子阶段）
