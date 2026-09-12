# HSE 网格巡查身份链 · WPS-PG-SYNC-00
## WPS → PostgreSQL 单向同步机制可行性审计与设计冻结报告

- 项目：`G:\hse-dashboard`
- 后端：`G:\hse-dashboard\server`
- 正式前端：`G:\hse-dashboard\安全看板vben\apps\web-naive`
- 生产端口：`5876`
- 阶段：**WPS-PG-SYNC-00（只读审计 + 设计冻结）**
- 报告日期：2026-09-11
- 执行时间窗：2026-09-11 07:34 – 07:4x（GMT+8）
- 终态：**`PHASE_WPS_PG_SYNC_00_READY_FOR_IMPLEMENTATION`**

---

## 1. 执行摘要

本阶段为**纯只读审计 + 设计冻结**，不产生任何业务数据变化。

### 1.1 结论速览

| 问题 | 结论 |
|---|---|
| 当前是否已存在 WPS→PG 同步服务？ | **是**，`server/services/wpsGridSyncService.js`（完整双向引擎，非单向） |
| 是否已真正运行过？ | **从未运行**（见 §4.6 证据） |
| 是否存在 PG→WPS（反向写入）？ | **是**，代码已实现并已挂进主业务写路径 |
| 是否存在双向同步 / 隐式同步？ | **两者都存在** |
| 现有幂等键是否符合冻结口径？ | 迁移服务**符合**；同步引擎**部分偏离**（见 §5.4） |
| 现有同步是否写身份/网格？ | **否**（天然 fail-closed，保持 NULL） |
| 现有同步是否会误迁 BT/EA？ | **若启用则会误插**（**高风险，须冻结排除**，见 §14） |
| 图片处理是否一致？ | **不一致**：同步引擎不校验 URL，迁移服务校验（见 §10） |

### 1.2 冻结架构（本阶段最终冻结）

```
WPS（外部三违采集源 + 历史只读源）
        │  仅单向、只读拉取（永不回写 WPS）
        ▼
  Sync Engine（WPS → PG 单向）
        ▼
PostgreSQL（HSE 正式业务数据库，唯一权限/身份权威）
        ▼
    HSE 系统（own_grid / all_grid）
```

> WPS **不是** HSE 系统正式权限/身份数据源；PG 才是。**不得为兼容 WPS 而将 HSE 切回 WPS。**

### 1.3 写操作计数器（验收，见 §17）

```
DB writes       = 0
WPS writes      = 0
.env changes    = 0
frontend changes= 0
auth changes    = 0
DDL changes     = 0
```

---

## 2. 当前架构（已冻结事实）

### 2.1 数据源与开关（真机只读）

| 配置 | 值 | 证据 |
|---|---|---|
| `WPS_GRID_DATA_SOURCE` | `false` | `server/.env:100`（mtime 2026-09-11 07:13:11，本阶段未改） |
| `WPS_GRID_SYNC` | `false` | `server/.env:101` |
| `WPS_SYNC_DELETE` | （未设置） | → 默认 `false` |
| `WPS_SYNC_PUSH_CUTOFF` | （未设置） | → 取 `grid_record_sync_state.push_cutoff_at`，当前不存在 |
| `WPS_SYNC_CRON` | （未设置） | → 默认 `*/15 * * * *` |
| `SCHEDULER_ENABLED` | （未设置） | → 默认启用（`!== 'false'`） |
| WPS 凭证 `isConfigured()` | **true** | fileId=`cn229thwalDs`、sheetId=3 |
| 同步引擎 `isEnabled()` | **false** | 因 `WPS_GRID_SYNC=false`（非因凭证缺失） |

> 注：`server/.env:91` 存在注释行 `#WPS_GRID_SYNC=true`（历史残留，未生效，不修改）。

### 2.2 数据基线（真机只读，本阶段复算）

| 指标 | 值 | 与冻结基线一致 |
|---|---|---|
| `grid_inspection_records` | **2061** | ✅ |
| `grid_record_sync_map` | **2061** | ✅ |
| `grid_id IS NULL` | **327** | ✅ |
| `grid_id IS NOT NULL` | **1734** | ✅ |
| `inspector_employee_id IS NOT NULL` | **10** | ✅ |
| `live grid_areas` | **62** | ✅ |
| `active users` | **63**（admin 1 / grid_inspector 62） | ✅ |
| `sync_map conflict` | **0** | ✅ |
| WPS records | 2063（WPS-only = BT, EA） | ✅ |

---

## 3. 现有同步代码审计（实际读码，非按文件名推断）

### 3.1 文件清单与角色

| 文件 | 行数级 | 角色 | 是否含写 |
|---|---|---|---|
| `services/wpsClient.js` | ~400 | WPS HTTP 唯一出口（token/KSO-1/list/create/update/delete/schema） | 读+写 WPS |
| `services/wps/wpsErrors.js` | — | 错误分类 | 无 |
| `services/wps/wpsDbsheetAdapter.js` | ~95 | WPS API → 统一内部接口；附件归一 `{url,name,fieldId}` | 写 WPS |
| `services/wps/wpsFieldMap.js` | ~89 | **字段语义真源 B**（biz/pg/wps + mode），含 `inspectorEmployeeId`/`violatorEmployeeId` | — |
| `services/wps/gridInspectionService.js` | ~165 | WPS 业务服务（schema/list/get/probe/integrationTest/cleanup） | 写 WPS（受控自清理） |
| `services/wps/gridInspectionRepository.js` | ~299 | WPS 数据源模式的台账仓储（list/get/create/update/remove/clearAll） | **写 WPS** |
| `services/wps/gridDataSource.js` | ~51 | 数据源三态开关（pg/wps/misconfigured），进程内缓存 | 无 |
| **`services/wpsGridSyncService.js`** | **~526** | **双向同步引擎**（pull/push/reconcile/status） | **写 PG + 写 WPS** |
| `services/wpsGridSyncScheduler.js` | ~69 | node-cron 每 15 分钟 `reconcile` | 间接写 |
| `services/wpsGridMigrationService.js` | ~268 | **A 段 327 条历史迁移**（独立事务、严格幂等） | 写 PG（一次） |
| `routes/wps-grid-sync.js` | ~126 | 同步管理路由（status/pull/reconcile/push/mapping/conflicts/webhook/trigger） | 写 PG+WPS |
| `routes/wps-dbsheet.js` | ~56 | WPS 接入管理 Controller（schema/records/integration-test/cleanup） | 写 WPS（受控） |
| `routes/site-mgmt.js` | — | `grid-records` 业务路由；**含同步挂钩** | 写 PG（+触发同步） |

### 3.2 两套 FIELD_MAP 并存（关键架构不一致）

| | A：`wpsGridSyncService.FIELD_MAP` | B：`wps/wpsFieldMap.js FIELD_MAP` |
|---|---|---|
| 项数 | 18（wps→pg，含 `tf:'date'`） | ~30（wps/biz/pg + `type` + `mode`） |
| 用途 | **同步引擎上行/下行 + canonicalHash** | WPS 数据源模式仓储读写 + 语义文档 |
| `巡查人员ID` | **无** | 有（`inspectorEmployeeId`，`readwrite`，仅后端身份可写） |
| `车辆类型/上报状态/违章类型结果/是否需要整改/整改人` | **无** | 有 |
| `违章人员ID` | 无 | 有（`violatorEmployeeId`，`reserved`） |
| 图片 | 3 个「链接镜像」列映射 | 同 3 列（`link`） |

> **结论**：两套真源必须合并为单一真源（§19）。同步引擎目前使用 A（不含身份/网格）。

---

## 4. 重点审计 1：WPS → PG 当前同步能力（§四 十问逐一回答）

**1）当前是否已存在 WPS→PG 同步服务？**
> 是。`services/wpsGridSyncService.js` 导出 `pullFromWps()`（WPS→PG）、`pushRow()`（PG→WPS）、`reconcile()`（双向+删除追平）。

**2）入口是什么？**
> 三处：
> - HTTP：`POST /api/wps-grid-sync/pull`（WPS→PG）、`/push`（PG→WPS）、`/reconcile`（双向）
> - 定时：`wpsGridSyncScheduler`（cron）
> - 业务钩子：`site-mgmt.js` 写 PG 后调用 `onPgRowChanged` / `onPgRowsDeleted`

**3）谁调用它？**
> - `routes/wps-grid-sync.js`（管理端点，全局 JWT）
> - `routes/site-mgmt.js` L1652 / L1736 / L1787（业务写路径 fire-and-forget）
> - `services/wpsGridSyncScheduler.js`（cron 每 15 分钟）

**4）是否已有定时任务 / watcher / API / 手工脚本？**
> 有定时任务：`app.js:597 → initWpsGridSyncScheduler()` 注册 `node-cron`（默认 `*/15 * * * *`，时区 `Asia/Shanghai`）。有管理 API。有手工脚本（`_wps03b_migrate.cjs` 等，迁移用）。无 watcher。

**5）当前 `WPS_GRID_SYNC=true` 时具体会发生什么？**
> - `const SYNC_ENABLED = process.env.WPS_GRID_SYNC !== 'false'` → 语义为「**不显式 false 即启用**」。
> - `isEnabled() = SYNC_ENABLED && wps.isConfigured() && isConnected()`。当前 `isConfigured()=true`，故把该值改为 `true`（**或删除该行**）即立刻 `isEnabled()=true`。
> - 生效后果：
>   1. cron 每 15 分钟执行 `reconcile()`：**上行** `pullFromWps()`（WPS→PG upsert）＋**下行** `pushRow()`（PG→WPS create/update）＋**PG 删除追平**（映射存在但 PG 行消失 → **WPS 端 `deleteRecords`**）。
>   2. `site-mgmt.js` 的 POST/PUT 写 PG 后会 fire-and-forget 推送 WPS；DELETE 会下行删 WPS。
>   3. `ensureTables()` 会在业务进程内执行 DDL（`CREATE TABLE IF NOT EXISTS grid_record_sync_map / grid_record_sync_state`）。

**6）是否真正执行 WPS→PG？**
> **从未执行。** 证据：`grid_record_sync_state` 表**为空**（`[]`）→ `last_pull_at` / `last_reconcile_at` / `push_cutoff_at` 均无值 → `pullFromWps()`/`reconcile()` 在生产从未被调用。现有 2061 条 `sync_map` 由**迁移服务**（`wpsGridMigrationService.migrateRecord`）写入（`sync_map.created_at ≈ 2026-09-08 11:03`），与同步引擎无关。

**7）是否存在 PG→WPS？**
> **是**（`pushRow` / `onPgRowChanged` / `reconcile` 步骤 2 / `site-mgmt.js` POST+PUT 钩子 / `/push` 端点）。

**8）是否存在双向同步？**
> **是**（`reconcile` = 上行 + 下行 + 删除追平，三向合一）。

**9）是否存在隐式同步？**
> **是**。`site-mgmt.js` 主写路径内联触发下行推送，无独立开关，仅受 `isEnabled()` 总体控制 → 属隐式副作用。

**10）是否存在服务启动自动同步？**
> **否**。`initWpsGridSyncScheduler()` 仅注册 cron，不立即执行；`isEnabled()=false` 时打印休眠日志后返回。

### 4.1 调用链（现状）

```
【上行 WPS→PG】
cron(15min) / POST /pull / POST /reconcile / POST /webhook
   └─ svc.pullFromWps()
        ├─ wps.listAllRecords()                 ← 只读 WPS
        ├─ wpsToPg(fields) → canonicalHash      ← 18 列（A 映射）
        ├─ 已映射? sync_hash 相同 → skippedUnchanged（回声抑制）
        ├─ 已映射 & 变更 → applyPgUpdate + bindMap（含 LWW/conflict）
        └─ 未映射 → findPgIdByNaturalKey()  ← ⚠ 姓名+日期+违章人（禁用键）
                     └─ 未命中 → applyPgInsert() ← 仅 18 列，不写 grid_id/inspector_employee_id
                                  └─ bindMap()

【下行 PG→WPS】
site-mgmt POST/PUT → onPgRowChanged() → pushRow() → wps.create/updateRecords()
site-mgmt DELETE   → onPgRowsDeleted() → wps.deleteRecords()
cron reconcile 步骤2 (被 cut-off 之后更新的行) → pushRow()
cron reconcile 步骤3 (PG 行消失) → wps.deleteRecords()
POST /push → pushRow()
```

---

## 5. 重点审计 2：同步主键与幂等（§五）

### 5.1 键关系（真机 + 代码）

| 键 | 位置 | 性质 |
|---|---|---|
| WPS `record id`（如 `Fr`,`BT`,`EA`） | WPS 记录主键 | WPS 侧唯一 |
| `wps_file_id` | `sync_map` 列 | 板 ID（当前恒 `cn229thwalDs`） |
| `wps_sheet_id` | `sync_map` 列 | 表 ID（当前恒 `3`） |
| `serial_no`（编号） | PG 列 | **不可靠**（含时间串/空格，禁作幂等键） |
| `grid_inspection_records.id` | PG 主键 | `serial` 型，非业务编号 |
| `grid_record_sync_map` | 映射表 | 桥接 WPS↔PG |

### 5.2 sync_map 唯一约束（真机 `pg_indexes` + `pg_constraint`）

```
PRIMARY KEY (id)
UNIQUE (pg_record_id)
UNIQUE (wps_record_id, wps_file_id)   ← 幂等身份
```

**符合**冻结铁律：`(wps_record_id, wps_file_id)` 作为 WPS→PG 幂等身份；**未**使用姓名/日期/serialNo/行号作唯一键。

### 5.3 完整性真机核验（全部只读）

| 检查 | 结果 |
|---|---|
| 重复 `wps_record_id` | **0** |
| 重复 `(wps_record_id, wps_file_id)` | **0** |
| 重复 `pg_record_id` | **0** |
| `sync_map` 指向不存在的 PG（sync→PG orphan） | **0** |
| PG 行无 `sync_map`（PG→sync orphan） | **0** |
| `wps_record_id` 为空 | **0** |
| `pg_record_id` 为空 | **0** |
| `wps_file_id` 分布 | 100% `cn229thwalDs`（2061） |
| `wps_sheet_id` 分布 | 100% `3`（2061） |
| `conflict=true` | **0** |
| 1 个 WPS ID → 多 PG | **无** |
| 1 个 PG → 多 WPS | **无** |
| retry 重复插入 | 迁移服务事务内预检 + 唯一键 23505 → `ALREADY_EXISTS`（01-B 实测重放 10/10 幂等，零写入） |

### 5.4 ⚠ 偏离项（须重构）

1. **同步引擎绑定查找仅用 `wps_record_id`**：`byWpsId = Map(m.wps_record_id → m)`，**未含 `file_id`**。多板场景会产生歧义；当前单板不触发，但与冻结键不一致 → 须对齐为 `(wps_record_id, wps_file_id)`。
2. **`findPgIdByNaturalKey()` 使用 `(inspection_date, personnel_name, violator_name)`**——正是 §五 明令禁止的「姓名+日期」近似键。用途是「未映射记录防重插入」，仅 unique 命中才绑定，但**违背冻结口径** → 须废弃或改造为「不做自动绑定，直接 PENDING」。
3. **`bindMap()` 冲突键为 `pg_record_id`**（`ON CONFLICT (pg_record_id) DO UPDATE`）→ 一个 PG 行可被改绑到不同 WPS 记录（重绑语义），与「immutable 幂等映射」不一致。

---

## 6. 重点审计 3：新增数据同步（模拟设计，不执行）

### 6.1 期望完整链路（设计冻结）

```
WPS 新增记录 (record id = NEW)
  → wpsClient.listAllRecords()                      [只读]
  → wpsToPg(fields)                                 [字段映射]
  → 幂等预检 (wps_record_id + wps_file_id) 命中? → 跳过（ALREADY_EXISTS）
  → 排除名单检查（BT / EA → 跳过，PENDING_HUMAN_CONFIRMATION）
  → 身份解析：WPS 无登录上下文 → inspector_employee_id = NULL（FAIL-CLOSED）
  → 网格解析：WPS 无可靠 grid 键 → grid_id = NULL（FAIL-CLOSED）
  → 图片：仅 http(s) URL 落库，其余 NULL
  → PG INSERT（不含身份/网格列）
  → sync_map INSERT (wps_record_id, wps_file_id, sync_hash)
  → 结果状态：PENDING_HUMAN_CONFIRMATION（admin 可见，网格长不可见）
```

### 6.2 现状实现 vs 设计（差异）

| 环节 | 现状（`pullFromWps`） | 设计冻结 |
|---|---|---|
| 幂等键 | 查找仅 `wps_record_id`（缺 file） | `(wps_record_id, wps_file_id)` |
| 未映射插入 | `findPgIdByNaturalKey`（姓名+日期） | **禁用**，直接 PENDING |
| 身份列 | 不写（天然 NULL）✅ | 不写（FAIL-CLOSED）✅ |
| 网格列 | 不写（天然 NULL）✅ | 不写（FAIL-CLOSED）✅ |
| 排除名单 | **无** ❌ | BT/EA 必须排除 |
| 图片 | 原样 String（不校验）❌ | 仅 http(s) URL |
| 新增结果 | 插入后 grid_id=NULL → 仅 admin 可见 | 同左，显式标记 `PENDING_HUMAN_CONFIRMATION` |

### 6.3 三个必答问题

- **WPS 新增无 `inspectorEmployeeId` 时怎么办？**
  > `inspector_employee_id = NULL`（FAIL-CLOSED），记录可见性降级为 admin-only，标记 `PENDING_HUMAN_CONFIRMATION`，等人工确认。
- **WPS `inspectorEmployeeId` 有值时是否可信？**
  > **不可信。** WPS 是外部采集源；`wpsFieldMap` 明确 `巡查人员ID` 「只允许由后端身份上下文写入，前端不可覆盖」。同步侧**不得**以 WPS 值直接写 PG 权威身份列。
- **WPS 没有可靠 `grid_id` 时怎么办？**
  > `grid_id = NULL`（FAIL-CLOSED）。禁止模糊匹配、禁止粗粒度字段（如「公司管理」）作 grid key（详见 §8）。

---

## 7. 重点审计 4：`inspector_employee_id` 方案（§七 冻结）

### 7.1 现有权威解析器

- `services/authenticatedEmployeeResolver.js`
  ```
  req.user.id → public.users.employee_id → public.employee.id
  ```
  红线：**禁姓名兜底**、**Fail-Closed**、不改 JWT/auth、每次实时查库（绑定变更即时生效）、仅 SELECT。
  失败码：`AUTH_USER_REQUIRED(401)` / `AUTH_USER_NOT_FOUND(401)` / `EMPLOYEE_NOT_BOUND(403)` / `EMPLOYEE_NOT_FOUND(409)` / `EMPLOYEE_DELETED(409)` / `IDENTITY_LOOKUP_FAILED(503)`。

- `services/currentEmployeeContext.js`（**遗留**，姓名兜底）
  ```
  req.user.realName → employeeResolver.resolveEmployeeByName → v_employee_current 严格一对一
  ```
  仅用于「WPS 数据源模式」的 PC 录入（`gridInspectionRepository.create`）。切 PG 后**已不在**主链路；`site-mgmt.js:1683` 明确注释「禁止回退姓名兜底」。

### 7.2 冻结方案

| 场景 | 处理 |
|---|---|
| PG 录入（当前生产） | `authenticatedEmployeeResolver` 派生，客户端字段剥离（L1674/1678），后端恒等写入 |
| WPS→PG 同步 | **不写** `inspector_employee_id`（无登录上下文，无法解析）→ 保持 NULL |
| 姓名匹配 | **禁止**用于身份（不得 `resolveEmployeeByName` 作为同步身份） |
| 无法可靠确定 | `FAIL-CLOSED` → NULL → `PENDING_HUMAN_CONFIRMATION`（admin 可见，网格长不可见） |
| 覆盖保护 | 不得允许 WPS 数据覆盖 PG 权威身份列 |

> 现状一致性：legacy `FIELD_MAP`（A）不含身份列 → `applyPgUpdate/applyPgInsert` **不会触碰** `inspector_employee_id` → 天然 fail-closed，**符合**冻结要求。

---

## 8. 重点审计 5：`grid_id` 方案（§八 冻结）

### 8.1 现有权威派生

- `services/gridScope.js::deriveGridIdForEmployee(employeeId)`：
  `employee.id → grid_areas.personnel_id → 唯一 live grid`
  - 0 个 → `no_grid`（调用方 403）
  - 1 个 → `ok`
  - \>1 个 → `multiple`（调用方 409，**禁止猜测**）
- 读取过滤：`buildScopeSqlCondition` → `grid_id IN (SELECT id FROM grid_areas WHERE personnel_id=$n AND is_deleted=false)`；无网格 → `'1 = 0'`（fail-closed）。

### 8.2 WPS 侧能否可靠得到 grid_id？

**不能。** 依据（既有冻结事实 + 本轮复核）：

- WPS `巡查人员ID` 填充率 0%（历史），且不在 legacy 字段映射中；
- WPS `分组名称` = 乡镇文本，≠ `grid_areas.name`；
- `grid_areas.township` 100% NULL（组织关系不可靠）；
- WPS **无可靠 grid key**。

### 8.3 冻结方案

- WPS→PG 同步**不得**写 `grid_id`；
- **禁止**模糊匹配、**禁止**自动分配、**禁止**用「公司管理」等粗粒度字段作 grid key；
- 无法唯一确定 → `grid_id = NULL` → `PENDING_HUMAN_CONFIRMATION`；
- 与既有 327 条 NULL 同策（FAIL_CLOSED_ACCEPTED）。

---

## 9. 重点审计 6：字段映射表（WPS → PG）

> 现状为两套映射并存（§3.2）。下表为**合并后建议单一真源**，并给出各字段冻结规则。

| WPS 来源 | PG 字段 | 类型 | 转换规则 | 允许 NULL | 允许更新 | 后端派生 | 允许覆盖 | 异常处理 |
|---|---|---|---|---|---|---|---|---|
| 姓名 | `personnel_name` | text | trim，''→NULL | 是 | 是 | 否 | 是 | 原样 |
| 分组名称 | `area_team` | text | trim，''→NULL | 是 | 是 | 否 | 是 | 原样（非 grid key） |
| 所属岗位 | `position` | text | trim | 是 | 是 | 否 | 是 | 原样 |
| 网格等级 | `grid_level` | text | trim | 是 | 是 | 否 | 是 | 原样（快照，非 grid key） |
| 日期 | `inspection_date` | date | `toIsoDate()`；不可解析→NULL | 是 | 是 | 否 | 是 | 不写脏日期 |
| 三违行为 | `violation_behavior` | text | trim | 是 | 是 | 否 | 是 | 原样 |
| 违章人姓名 | `violator_name` | text | trim；伪空→NULL | 是 | 是 | 否 | 是 | 原样 |
| 违章人性别 | `violator_gender` | varchar | 非【男/女】告警但原样保留 | 是 | 是 | 否 | 是 | 告警 |
| 违章人年龄 | `violator_age` | varchar | 非 `^\d{1,2}$` 告警原样 | 是 | 是 | 否 | 是 | 告警 |
| 三违照片（链接） | `image_content` | text | **仅 http(s) URL**，否则 NULL | 是 | 是 | 否 | 是 | 非 URL 丢弃 |
| 整改后照片（链接） | `rectified_photo` | text | 同上 | 是 | 是 | 否 | 是 | 非 URL 丢弃 |
| 示意图（链接） | `schematic` | text | 同上 | 是 | 是 | 否 | 是 | 非 URL 丢弃 |
| 上报状态 | `report_status` | varchar | trim | 是 | 是 | 否 | 是 | 原样 |
| 车辆类型 | `vehicle_type` | varchar | trim | 是 | 是 | 否 | 是 | 原样 |
| 违章类型结果 | `violation_type_result` | varchar | trim | 是 | 是 | 否 | 是 | 原样 |
| 是否需要整改 | `need_rectification` | varchar | trim | 是 | 是 | 否 | 是 | 原样 |
| 整改人 | `rectifier` | varchar | trim | 是 | 是 | 否 | 是 | 原样 |
| 昵称2 | `nickname` | varchar | trim | 是 | 是 | 否 | 是 | 仅展示 |
| 当日是否报名 | `signup_today` | varchar | trim | 是 | 是 | 否 | 是 | 原样 |
| 是否补交 | `is_resubmit` | varchar | trim | 是 | 是 | 否 | 是 | 原样 |
| 标记 | `marker` | varchar | trim | 是 | 是 | 否 | 是 | 原样 |
| 提交时间 | `upload_time` | varchar | trim（原文） | 是 | 是 | 否 | 是 | 原样 |
| 编号 | `serial_no` | varchar | 原值保留（**禁作幂等键/不转换**） | 是 | 是 | 否 | 是 | 原样 |
| **巡查人员ID** | `inspector_employee_id` | bigint | **禁止由 WPS 写入** | 保持 NULL | **否** | **是（后端）** | **否** | FAIL-CLOSED |
| **（派生）网格** | `grid_id` | integer | **禁止由 WPS 写入** | 保持 NULL | **否** | **是（后端）** | **否** | FAIL-CLOSED |
| 违章人员ID | （无 PG 列） | — | `reserved`，不绑定 | — | — | — | — | 不写 |
| 当日序号 / 来源日期 / 巡查时间 / 经纬度等 | （无 PG 列） | — | WPS-only / reserved | — | — | — | — | 不写 |

### 9.1 `grid_inspection_records` 真机列（28 列，只读 `information_schema`）

```
1 id(integer,NOT NULL)            15 violation_type_result(varchar,NULL)
2 area_team(varchar,NULL)         16 need_rectification(varchar,NULL)
3 upload_time(varchar,NULL)       17 rectifier(varchar,NULL)
4 inspection_date(date,NULL)      18 rectified_photo(text,NULL)
5 personnel_name(varchar,NULL)    19 schematic(varchar,NULL)
6 grid_level(varchar,NULL)        20 grid_id(integer,NULL)          ← 后端派生
7 position(varchar,NULL)          21 created_at(timestamp,NOT NULL)
8 violator_name(varchar,NULL)     22 updated_at(timestamp,NOT NULL)
9 violator_gender(varchar,NULL)   23 nickname(varchar,NULL)
10 violator_age(varchar,NULL)     24 signup_today(varchar,NULL)
11 vehicle_type(varchar,NULL)     25 marker(varchar,NULL)
12 report_status(varchar,NULL)    26 is_resubmit(varchar,NULL)
13 image_content(text,NULL)       27 serial_no(varchar,NULL)
14 violation_behavior(text,NULL)  28 inspector_employee_id(bigint,NULL) ← 后端派生
```

> 注：`inspector_employee_id` 为 `bigint` → node-pg 返回**字符串**（如 `"6789"`），比较/写入须 `Number()`/`String()` 显式转换。

---

## 10. 重点审计 7：图片（§十）

### 10.1 现状

| 机制 | 现状 |
|---|---|
| 原生 Attachment（三违照片:图片1/2/3、整改后照片:图片1，共 4 列） | **不搬运**（v1 不做二进制）；`sync.FIELD_MAP` 未映射 |
| link mirror 字段（三违照片链接 / 整改后照片链接 / 示意图链接） | 映射至 `image_content` / `rectified_photo` / `schematic`（**text/varchar 列**，存 url 串） |
| DISPIMG | **不解析**（`gridInspectionRepository` 头注释明确「不解析 DISPIMG」） |
| URL | 迁移服务 `buildDto`：**仅合法 `http(s)://` 才落库**，非 URL → NULL + 告警；<br>同步引擎 `wpsToPg`：**原样 `String()`，不校验** ⚠ |

### 10.2 冻结方案

- 同步到 PG **只保存**镜像链接列（url 串），**不搬运**原生附件二进制；
- **不得**重新引入 DISPIMG 解析；
- **不得**假设 `uploadId` 是永久图片 URL；
- 落库口径**统一采用迁移服务的严格版**：仅 `^https?://` 通过，其余置 NULL 并告警（纠正同步引擎不校验的偏离）。

---

## 11. 重点审计 8：更新策略（§十一 冻结）

### 11.1 现状：**已存在反向写入（PG → WPS）**

| 位置 | 行为 |
|---|---|
| `wpsGridSyncService.pushRow()` | `wps.createRecords` / `wps.updateRecords` |
| `site-mgmt.js:1652`（PUT 后） | `onPgRowChanged()` → 下行推送 |
| `site-mgmt.js:1736`（POST 后） | `onPgRowChanged()` → 下行推送 |
| `wpsGridSyncService.reconcile()` 步骤 2 | 批量 `pushRow()` |
| `POST /api/wps-grid-sync/push` | 手动下行 |
| `wpsGridSyncService.onPgRowsDeleted()` / reconcile 步骤 3 | 下行**删除** WPS |
| `site-mgmt.js` WPS 分支（`gridWps.create/update/remove/clearAll`） | 直接写/删 WPS（当 mode=wps） |

### 11.2 冻结

- 第一阶段**只允许 WPS → PG 单向同步**；
- **不得**设计 PG → WPS；**不得**双向自动同步；
- 反向写入代码**已存在**，须在下一阶段**停用/隔离**（本阶段不改代码，仅记录，见 §17/§19）。

---

## 12. 重点审计 9：删除策略（§十二）

### 12.1 现状

| 方向 | 触发 | 行为 |
|---|---|---|
| WPS 删 → PG | `pullFromWps` 尾部 | `WPS_SYNC_DELETE !== 'true'`（默认）→ **仅记录，不回删**；<br>`=true` → **硬删 PG**（`DELETE FROM grid_inspection_records`） |
| PG 删 → WPS | `onPgRowsDeleted` / `reconcile` 步骤 3 | **删 WPS 记录** + 删 `sync_map` |

### 12.2 建议（冻结）

- WPS 侧删除**不得**导致 PG 正式业务数据物理删除；
- 建议（按优先级）：
  1. **短期**：`WPS_SYNC_DELETE` 恒 `false`（硬锁），WPS 删除仅记录 `wps_missing`；
  2. **中期**：PG 侧新增软删标记（`deleted_at` / `is_deleted`）——**需 DDL，超出本阶段**，留待后续；
  3. **不采用**：物理删除 PG。

---

## 13. 重点审计 10：冲突策略（§十三）

### 13.1 现有机制

| 机制 | 说明 |
|---|---|
| `sync_hash` | `canonicalHash()` = 18 个 PG 列固定顺序、`''`≡`null` 的 SHA-256 → 变更检测 + 回声抑制 |
| `updated_at` | 用于 LWW 比较 |
| `last_sync_at` | sync_map 记录上次同步时刻 |
| `conflict` | 布尔留痕位（冲突时置 `true`），当前全 `false` |

### 13.2 适配性判断

- `sync_hash` **适合**单向 WPS→PG 的**变更检测/幂等/回声抑制**（可直接复用）；
- 但**不适合**双向 LWW：
  - 覆盖列仅 18 列，**不含** `grid_id` / `inspector_employee_id`（对身份列是保护，但也无法检测身份列变更）；
  - 单向场景下 PG 不应是写方，LWW 语义退化（`applyPgUpdate` 会写 `updated_at` → 干扰比较）。
- **建议**：保留 `sync_hash` 作变更检测；**弃用** LWW/双向语义，或降级为「PG 侧人工已改 → 跳过 WPS 覆盖」的**保护位**。

### 13.3 分类处理表（冻结）

| 情形 | 处理 |
|---|---|
| 新增 | 幂等键未命中 → INSERT；身份/网格置 NULL；`PENDING_HUMAN_CONFIRMATION` |
| 修改 | 幂等键命中 且 hash 变 → UPDATE（**不含**身份/网格列）；hash 未变 → 跳过 |
| 删除 | WPS 删 → **不删 PG**（保留历史，记录 `wps_missing`） |
| 重复 | 幂等键唯一约束兜底；重复 → `ALREADY_EXISTS`，不改绑 |
| 身份不明 | `inspector_employee_id = NULL`（FAIL-CLOSED） |
| 网格不明 | `grid_id = NULL`（FAIL-CLOSED） |
| 字段异常 | 伪空→NULL；性别/年龄脏值告警原样；日期不可解析→NULL |
| 图片异常 | 非 http(s) → NULL + 告警（不伪装） |

---

## 14. 重点审计 11：历史数据保护（§十四）

### 14.1 BT / EA（人工裁定：WPS 保留、PG 不迁移）

> ⚠ **重大风险**：若未来启用 `pullFromWps()`，BT/EA 在 `sync_map` 中**无映射** → 会走「未映射 → `findPgIdByNaturalKey`（多数不命中）→ `applyPgInsert`」分支 → **被误插入 PG**，违背人工裁定。

**冻结要求**：单向同步引擎**必须内置排除名单（BT、EA）**，或对 `wps_record_id ∈ {BT, EA}` 显式 `skip → PENDING_HUMAN_CONFIRMATION`。本阶段仅记录，实现留待下一阶段。

### 14.2 327 条 `grid_id = NULL`

- 现状：327 条均为 `2026-09`，**且 327/327 均有 `sync_map`**（只读核验：`withSyncMap = 327`）；
- 同步引擎 `applyPgUpdate` / `applyPgInsert` **不含 `grid_id`** → 不会被覆盖/回填 → 保持 NULL ✅；
- **冻结**：不得自动回填，不得因同步启用而归属。

### 14.3 10 条人工补迁（7183–7192）

- `grid_id` / `inspector_employee_id` **不在**同步覆盖列 → 不会被覆盖 ✅；
- 排除名单与身份 fail-closed 不触碰这 10 条。

---

## 15. 安全风险清单

| # | 风险 | 级别 | 说明 |
|---|---|---|---|
| R1 | `WPS_GRID_SYNC` **默认开启语义**（`!== 'false'`） | **高** | 删除 `.env` 该行即启用双向同步（含写/删 WPS） |
| R2 | WPS 凭证齐备（`isConfigured()=true`），无二次门禁 | 高 | 仅靠单一 env 值兜底 |
| R3 | 启用后 `reconcile` 会**删 WPS 记录**（PG 删除追平） | 高 | 对外部采集源产生破坏性写入 |
| R4 | 启用后 **BT/EA 会被误插 PG** | 高 | 违背人工裁定 |
| R5 | `POST /api/wps-grid-sync/push` 可被持 JWT 用户触发 PG→WPS 写入 | 中 | 管理端点，无独立细粒度权限 |
| R6 | `pullFromWps` 用**姓名+日期**自然键防重 | 中 | 违背 §五 冻结口径（同名误绑风险） |
| R7 | `wpsToPg` **不校验图片 URL** | 中 | 与迁移服务口径不一致，可能落脏值 |
| R8 | `ensureTables()` 在业务进程内含 **DDL** | 中 | 同步启用即在生产执行 `CREATE TABLE IF NOT EXISTS` |
| R9 | WPS 分支 `gridWps.create` 走**姓名兜底身份** | 中 | 若回退 WPS 模式，身份链退化 |
| R10 | `bindMap` 冲突键为 `pg_record_id`（可改绑） | 低 | 与 immutable 幂等映射不一致 |

---

## 16. 推荐架构（冻结）

```
┌────────────────────────────────────────────────────────────┐
│ WPS 多维表（外部三违检查采集源 + 历史原始只读源）            │
│   file_id=cn229thwalDs / sheet_id=3 / 2063 条               │
└───────────────────────┬────────────────────────────────────┘
                        │ ① 仅单向、只读拉取（永不写 WPS）
                        │ ② 排除名单：BT / EA
                        ▼
┌────────────────────────────────────────────────────────────┐
│ Sync Engine（WPS → PG 单向）                                │
│  · 幂等键 = (wps_record_id, wps_file_id)                    │
│  · 变更检测 = sync_hash（18 列，回声抑制）                   │
│  · 身份：不写 inspector_employee_id（NULL / PENDING）        │
│  · 网格：不写 grid_id（NULL / PENDING）                      │
│  · 图片：仅 http(s) URL 落库                                │
│  · 删除：WPS 删 → 不删 PG（保留历史 + wps_missing）          │
│  · 反向写入：一律禁用（no push / no delete-wps）             │
└───────────────────────┬────────────────────────────────────┘
                        ▼
┌────────────────────────────────────────────────────────────┐
│ PostgreSQL（HSE 正式业务数据库 · 唯一身份/权限权威）          │
│   grid_inspection_records 2061 / sync_map 2061              │
└───────────────────────┬────────────────────────────────────┘
                        ▼
        HSE 系统（own_grid / all_grid 行级权限）
```

**核心原则**：WPS 仅为采集/历史源；PG 为正式业务库。**不得为兼容 WPS 而将 HSE 切回 WPS。**

---

## 17. 下一阶段实施拆分

| 阶段 | 目标 | 关键动作 | 硬门禁 |
|---|---|---|---|
| **WPS-PG-SYNC-01** | 关闭/隔离反向写入 | 移除 `site-mgmt` 的 `onPgRowChanged`/`onPgRowsDeleted` 挂钩；`/push` 下线；`reconcile` 拆为上行 only；`WPS_GRID_SYNC` 语义收紧为「显式 `true` 才开」（默认关） | 不改数据；单向化 |
| **WPS-PG-SYNC-02** | 单向 pull 引擎落地 | 新 `wpsToPgPull`：幂等键含 file、排除名单 BT/EA、身份/网格 fail-closed NULL、图片 URL 校验、变更检测 | DRY_RUN 零写入先行 |
| **WPS-PG-SYNC-03** | 验收 | 真机不变量（2061/2061/327/1734/10/62/63/0 conflict 不变）、WPS 只读、零残留、权限回归 | 冻结前后 diff 空 |

---

## 18. 可复用代码（明确）

| 资产 | 位置 | 复用点 |
|---|---|---|
| `wpsClient.listAllRecords()` | `services/wpsClient.js` | 只读拉取（唯一 HTTP 出口） |
| `wpsClient.getSchema()` | 同上 | Schema 核对 |
| `wpsGridMigrationService.buildDto()` | `services/wpsGridMigrationService.js` | **最佳基础**：字段映射 + 图片 URL 校验 + 身份 fail-closed 标记 |
| `wpsGridMigrationService.classifyIdempotency()` | 同上 | 幂等预检（含 CONFLICT/ORPHAN 分类） |
| `wpsGridMigrationService.migrateRecord()` | 同上 | **单事务 + 预检 + 纯 INSERT**，零半成功 |
| `wpsGridSyncService.{toIsoDate, wpsToPg, canonicalHash}` | `services/wpsGridSyncService.js` | 纯函数（日期/映射/哈希），已被迁移服务复用 |
| `gridScope.deriveGridIdForEmployee()` | `services/gridScope.js` | 网格派生（fail-closed） |
| `authenticatedEmployeeResolver` | `services/authenticatedEmployeeResolver.js` | 身份权威链 |
| `wps/wpsFieldMap.js` | 同上 | 字段语义真源（B），作为合并基底 |

---

## 19. 需重构代码（明确）

| 对象 | 重构内容 |
|---|---|
| `wpsGridSyncService.js` | 拆「上行只读 pull」与「下行 push」；**移除** 下行/删除追平；`findPgIdByNaturalKey` **废弃**；`wpsToPg` 增加图片 URL 校验；`applyPgInsert` 增加排除名单 + 身份/网格 fail-closed；`bindMap` 冲突键对齐 `(wps_record_id,wps_file_id)` |
| 两套 FIELD_MAP | **合并为单一真源**（以 B 为基底，补 A 的 `tf:'date'` 等） |
| `routes/wps-grid-sync.js` | 下线 `/push`；`/reconcile` 收敛为上行；`/webhook` 保持未启用 |
| `routes/site-mgmt.js` | 摘除同步挂钩（L1652/1736/1787）至「反向写入封禁」阶段 |
| `wpsGridSyncScheduler.js` | 默认关闭语义收紧（显式 `true` 才开） |

---

## 20. 不能动的代码（明确）

- `.env`（本阶段 0 修改）；`WPS_GRID_DATA_SOURCE`（保持 `false`）、`WPS_GRID_SYNC`（保持 `false`）
- 业务数据：`users` / `grid_areas` / `grid_record_sync_map` / `grid_inspection_records`
- 327 条 NULL `grid_id`（不回填）、BT/EA 人工裁定（不迁移）
- 身份权威链：`authenticatedEmployeeResolver` / `gridScope`（`deriveGridIdForEmployee`/`buildScopeSqlCondition`）
- 前端 `安全看板vben/apps/web-naive`（零改动）
- JWT / auth / login
- 数据库 DDL（本阶段 0 DDL）

---

## 附录 A：真机证据

| 证据 | 路径 |
|---|---|
| 只读审计原始输出 | `server/scripts/output/wpssync00-audit.json` |
| 审计脚本（只读） | `server/scripts/_wpssync00_audit.cjs` |
| 01-C 冻结基线（对比用） | `server/scripts/output/pgsource01c-audit.stage01c-frozen.json` |
| 02 切换报告 | `docs/HSE网格巡查身份链_PG-SOURCE-SWITCH-02_WPS转PG正式生产切换报告_20260911.md` |

### 关键原始片段

```json
"env": { "WPS_GRID_DATA_SOURCE": "false", "WPS_GRID_SYNC": "false",
         "wps_isConfigured": true, "wps_fileId": "cn229thwalDs", "wps_sheetId": 3,
         "sync_isEnabled": false }
"counts": { "grid_inspection_records": 2061, "grid_record_sync_map": 2061,
            "grid_areas": 62, "users_active": 63, "users_active_admin": 1,
            "users_active_grid_inspector": 62, "gr_null_grid_id": 327,
            "gr_notnull_grid_id": 1734, "gr_insp_notnull": 10, "sync_map_conflict": 0 }
"integrity": { "dup_wps_record_id": [], "dup_pg_record_id": [], "sync_orphan_pg": 0,
               "pg_orphan_sync": 0, "null_wps_record_id": 0, "null_pg_record_id": 0 }
"syncState": []          ← 同步引擎从未运行
```

---

## 附录 B：验收签字（本阶段）

```text
DB writes        = 0
WPS writes       = 0
.env changes     = 0     (mtime 2026-09-11 07:13:11 未变)
frontend changes = 0
auth changes     = 0
DDL changes      = 0
```

- 本阶段仅新增：只读脚本 1 个、审计输出 1 个、本报告 1 个；
- 未 INSERT/UPDATE/DELETE 任何业务表；未调用任何 WPS 写 API；未改 `.env`/前端/auth/DDL；
- 复算基线 2061/2061/327/1734/10/62/63/0 与冻结基线**逐项一致**（零漂移）。

**最终状态：`PHASE_WPS_PG_SYNC_00_READY_FOR_IMPLEMENTATION`**
