# WPS-PG-SYNC-05-D：Scheduler 生产安全审计报告

**日期**：2026-09-11
**阶段**：WPS-PG-SYNC-05-D（STRICT READ-ONLY 审计）
**前置状态**：`PHASE_WPS_PG_SYNC_05C_COMPLETED_READY_FOR_05D`
**终态**：`PHASE_WPS_PG_SYNC_05D_COMPLETED_READY_FOR_05E`（PASS）

---

## 1. 执行摘要

本阶段对 WPS→PG 单向同步 Scheduler 做**生产运行安全审计**，为后续受控开启 Scheduler 建立门禁。全程 STRICT READ-ONLY：未执行任何真实 Pull、未执行任何 WPS/PG 写、未修改 `.env`、未开启 Scheduler、未清理测试数据。

**结论：PASS**。Scheduler 结构安全、false 时绝不运行（隔离测试 cron 注册 0 次）、Pull-only（引擎首行 fail-closed + 唯一写入口受 admin 门禁）、反向写/PG 删除/WPS 删除全部硬锁、BT/EA 排除有效、grid_id/inspector_employee_id 保护有效、旧双向同步不可执行（no-op + 零调用方）。审计前后 21 项基线指纹 100% 不变。

另登记 4 条**风险/建议**（R1–R4，均不构成 BLOCKED，见 §12 与 §21）。

## 2. 05-C 前置状态验证

- 报告在位：`docs/HSE网格巡查身份链_WPS-PG-SYNC-05-C_受控新增修改同步验证报告_20260911.md`（14,309B，12:58）
- 证据在位：`server/scripts/output/wpssync05c-controlled-change.json`（95,682B，12:55）
- `finalStatus = PHASE_WPS_PG_SYNC_05C_COMPLETED_READY_FOR_05D`，`pass = true`
- 测试数据登记一致：WPS `gt` ↔ PG **7217**（serial `SYNC05C-TEST-20260911-001`）；WPS `go` ↔ PG **6796**（marker `SYNC05C-UPDATE-TEST`）

未重新执行 05-C，未重新执行任何 Pull。

## 3. 生产 Baseline（21 项，只读记录）

证据：`server/scripts/output/wpssync05d-baseline.json`（audit 子命令，执行约 14:1x，elapsed 6,777ms）。

| # | 项 | 值 |
|---|---|---|
| 1 | grid_inspection_records 总数 | **2062** |
| 2 | grid_record_sync_map 总数 | **2062** |
| 3 | MAX(id) | **7217**（05-C 测试行） |
| 4 | MIN(id) | **4954** |
| 5 | NULL grid_id 总数 | **328**（历史 327 + 测试行 7217） |
| 6 | 历史 NULL 集合（id≤7192） | **327** 条 |
| 7 | 非 NULL 历史 grid_id（id≤7192） | **1734** 条 |
| 8 | inspector_employee_id 非空 | **10** 条 |
| 9 | live grids（is_deleted=false） | **62** |
| 10 | users 总数 | **63**（grid_inspector 62 + admin 1） |
| 11 | grid_inspector 数量（users 角色口径） | **62** |
| 12 | admin 数量 | **1** |
| 13 | conflict | **0** |
| 14 | sync_hash NULL | **0** |
| 15 | sync_hash 聚合 MD5 | `86de62e9bdadf9e06894278bc01f969f` |
| 16 | sync_map 绑定指纹 MD5（n=distinctkeys=2062） | `e0d11e45c9034b5dcd9daab7c7ce7906` |
| 17 | 10 条人工记录 | 7183`60/6789`、7184`14/7437`、7185-7190`6/6698`、7191-7192`1/6692` ✅ |
| 18 | 05-C 新增测试行 | PG 7217 / WPS `gt`，grid=NULL、inspector=NULL、marker=`SYNC05C-CREATE-TEST` ✅ |
| 19 | 05-C 修改测试行 | PG 6796 / WPS `go`，grid=1、inspector=NULL、marker=`SYNC05C-UPDATE-TEST` ✅ |
| 20 | BT/EA 在 WPS | 均存在（total=**2064**，bt=1、ea=1、gt=1、go=1） |
| 21 | BT/EA 在 sync_map | **均不存在**（查询结果空） |

历史 327 NULL 五项指纹：COUNT=327 / SUM=2,275,920 / MIN=6797 / MAX=7123 / **MD5 `2668ce0c51f9f29b3e1272ba7cc56288`**（与 05-B/05-C 冻结值一致）。
历史身份集合指纹（id≤7192，`id:grid_id:inspector_employee_id` 有序聚合）：`6a6c19f3e710efca4ea7c6e35f18792e`。

## 4. Scheduler 代码位置

- **唯一实现**：`server/services/wpsGridSyncScheduler.js`（69 行）
- **唯一注册点**：`app.js:597`（`server.listen` 回调内调用 `initWpsGridSyncScheduler()`）
- **依赖**：`node-cron@^4.6.0`（package.json 已声明，SYNC-02 引入）
- 全局调度机制静态搜索结果：`cron.schedule` 共 4 处（wpsGridSyncScheduler / assessmentScheduler / employeeHealthCheckScheduler / hse-warning-center），**仅前者引用 wps 同步**；setInterval（accidents/cache/wsServer）与 setTimeout（import/training-ocr/aiService 退避/wpsClient HTTP 重试退避）均与 wps 同步无关；PM2 `ecosystem.config.js` 存在但**无 cron_restart**、`instances: 1` + `exec_mode: 'fork'`（单实例）。

## 5. Scheduler 调用链（§四 18 问逐项回答）

```
initWpsGridSyncScheduler() [app.js:597，唯一]
  └─ svc.isEnabled()=false ⇒ 休眠 return（不注册 cron）
     = true ⇒ cron.schedule('*/15 * * * *', Asia/Shanghai) [唯一一处]
        └─ runPull() [Scheduler 模块级 running 标志]
           ├─ L24: if (!svc.isEnabled()) return skipped:'disabled'   ← 首行 fail-closed
           ├─ L25: if (running) return skipped:'already-running'
           └─ svc.pullWpsToPg({}) → engine.pullWpsToPg
              ├─ L376: if (!isEnabled()) skipped:'DISABLED'          ← 引擎第二道 fail-closed
              ├─ L384: if (pullRunning) skipped:'ALREADY_RUNNING'    ← 引擎进程内互斥锁
              └─ 单事务 INSERT/UPDATE（含 sync_map），收尾 assertNoPgDelete
```

| # | 问题 | 结论 | 证据 |
|---|---|---|---|
| 1 | 唯一入口？ | ✅ 是 | `initWpsGridSyncScheduler` 全仓仅 app.js:597 一处调用 |
| 2 | 只有一个 Scheduler？ | ✅ 是 | 模块单例 `task` 变量；其余 3 个 cron 模块不触 wps |
| 3 | cron？ | ✅ 仅本模块 1 处 | `cron.schedule` 全局搜索 |
| 4 | setInterval？ | ✅ 无（wps 相关） | 全局搜索，3 处 setInterval 均与 wps 无关 |
| 5 | setTimeout 递归调度？ | ✅ 无 | wpsClient:147 仅 HTTP 重试退避 |
| 6 | PM2 schedule？ | ✅ 无 | ecosystem.config.js 无 cron_restart |
| 7 | 多进程同时调度？ | ✅ 否 | PM2 instances=1/fork；无 cluster |
| 8 | 只能调 pullWpsToPg？ | ✅ 是 | runPull 仅调 `svc.pullWpsToPg` |
| 9 | 能调 push？ | ✅ 不能 | pushRow no-op 硬锁；Scheduler 不引用 pushRow；`/push` 恒 410 |
| 10 | 能调旧双向逻辑？ | ✅ 不能 | reconcile 已等价 pullWpsToPg；triggerReconcile=runPull |
| 11 | 能调 WPS DELETE？ | ✅ 不能 | deleteRecords 全仓零调用方 |
| 12 | 能执行 PG DELETE？ | ✅ 不能 | 引擎无 DELETE SQL + L508 assertNoPgDelete 断言 |
| 13 | 能绕过权限？ | ✅ 不能 | 进程内触发无 HTTP 面；HTTP 入口受全局 JWT（app.js:246）+ /pull 写路径 admin 403 + 引擎 fail-closed 兜底 |
| 14 | 能改 grid_id？ | ✅ 不能 | PROTECTED_COLUMNS=['grid_id',...]，每次写前 assertNoProtectedColumns(L244/283) |
| 15 | 能改 inspector_employee_id？ | ✅ 不能 | 同上 |
| 16 | 能改 users？ | ✅ 不能 | 引擎无任何 users 表 SQL |
| 17 | 能改 employee？ | ✅ 不能 | 引擎无任何 employee 表 SQL |
| 18 | 能绕过 BT/EA？ | ✅ 不能 | checkExcluded 于幂等判定前执行；FROZEN_EXCLUSIONS 不可移除，EXTRA 仅可追加 |

## 6. Scheduler 开关语义（§五，隔离测试，未触碰生产）

**静态语义**：`SYNC_ENABLED = process.env.WPS_GRID_SYNC === 'true'`（引擎模块加载时快照，仅显式 `'true'` 启用）；`isEnabled() = SYNC_ENABLED && wps.isConfigured() && isConnected()`（**三重条件**）。

**隔离进程实测**（5 种取值 × 独立 spawn，显式 env 覆盖，不连 DB、不调 WPS API）：

| WPS_GRID_SYNC 取值 | engine.SYNC_ENABLED | svc.isEnabled() |
|---|---|---|
| `'false'` | false | false |
| `'true'` | **true** | false（隔离进程未连 DB → 证明三重条件生效） |
| `''`（空） | false | false |
| `'abc'` | false | false |
| `'0'` | false | false |

**Scheduler 休眠路径隔离验证**（mock node-cron）：`WPS_GRID_SYNC=false` 下调用 `initWpsGridSyncScheduler()` → **`cron.schedule` 调用次数 = 0**、打印「调度器休眠」、`runPull()` 返回 `{skipped:true, reason:'disabled'}`。

**生产 `.env`（未修改）**：mtime `2026-09-11 07:13:11.963` / 4225B / MD5 `dcbfd1c0baf8e3f47ff731edff41167e`；`WPS_GRID_SYNC=false`、`WPS_GRID_DATA_SOURCE=false` 在位；`SCHEDULER_ENABLED` 键不存在。

## 7. Scheduler 并发安全（§六）

**双层互斥 + 单实例部署**：

1. Scheduler 层：模块级 `running` 标志，未完成时下次调度 → `skipped:'already-running'`；
2. 引擎层：进程内 `pullRunning` 互斥锁（L384），即使 Scheduler 层被绕过（如 /webhook 直接调引擎）也不会并发；
3. 部署层：PM2 `instances:1, exec_mode:'fork'`，无多进程重复注册。

**回答**：一次 Pull 未完成、下一次调度时间到 → 第二次 Pull **不会并发执行**（skipped），且 skip 不是丢弃——数据仍会在下一个 15 分钟周期被拉到，无永久遗漏风险。
**已知边界（如实登记，不构成 BLOCKED）**：互斥锁为进程内，若有人**绕开 PM2 手动另起一个 node 进程**，两进程间无 DB 级锁。但引擎幂等键 UNIQUE 约束（`(wps_record_id, wps_file_id)`）在 DB 层兜底，重复执行不会产生重复数据；生产以 PM2 单实例运行为准。

## 8. Pull Engine 安全边界（§七 20 项）—— 全部 PASS

| # | 项 | 证据 |
|---|---|---|
| 1 | WPS→PG 单向 | 引擎头注释冻结 + `direction:'wps->pg'` |
| 2 | PG→WPS 不存在 | 引擎无任何 WPS 写调用 |
| 3 | reverseWriteEnabled 恒 false | `const REVERSE_WRITE_ENABLED = false`（硬锁，环境变量无法开启） |
| 4 | push 路由 410 | routes/wps-grid-sync.js:101-105 + 本阶段实测 410 `REVERSE_WRITE_DISABLED` |
| 5 | WPS DELETE ⇏ PG DELETE | wpsDeleted 只统计；assertNoPgDelete 收尾断言 |
| 6 | WPS 消失 ⇏ PG 物理删除 | 引擎无 DELETE SQL |
| 7 | natural key 不参与绑定 | 幂等键唯一 (wps_record_id, wps_file_id)（库 UNIQUE） |
| 8 | WPS Record ID + fileId 唯一幂等键 | 同上 |
| 9 | BT/EA 在幂等判定前排除 | checkExcluded 先于 exists 判定 |
| 10 | grid_id 不在投影 | PROTECTED_COLUMNS（wpsFieldMap.js:127）+ L244/283 断言 |
| 11 | inspector_employee_id 不在投影 | 同上 |
| 12 | 姓名不能推导 employee | 引擎无任何姓名匹配逻辑 |
| 13 | 分组不能推导 grid | 引擎无任何分组匹配逻辑 |
| 14 | 网格负责人不能推导 inspector | 引擎无该逻辑 |
| 15 | 图片失败不覆盖已有图片 | 非 http(s) → 键省略（保留现值），L132 + imageWarnings |
| 16 | 每条同步在事务中 | insertWithMap L247 BEGIN→L269 COMMIT；update L290 BEGIN→L300 COMMIT |
| 17 | 单条失败不半写 | L253/L272/L303 ROLLBACK |
| 18 | Pull 不修改 users | 无 users SQL |
| 19 | Pull 不修改 employee | 无 employee SQL |
| 20 | Pull 不修改 employee_assignment | 无该表 SQL |

## 9. Reverse-write 安全（§八前置）

`pushRow / onPgRowChanged / onPgRowsDeleted` 在 `wpsGridSyncService.js` 中均为 **no-op 硬锁**（返回 `{disabled:true, reason:'REVERSE_WRITE_DISABLED'}` / 忽略）。全仓调用方搜索：**除 facade 自身外零调用方**（hse-assessment-monthly.js 的 `pushRow` 为同名局部函数，无关）。`isReverseWriteEnabled()` 恒 false。本阶段实测 `/push`（认证）→ **HTTP 410 `REVERSE_WRITE_DISABLED`**。

## 10. Delete 安全

- `WPS_SYNC_DELETE` 已失效（facade 头注释「硬锁：任何值都不得触发」）；
- 引擎无 `DELETE FROM` SQL；`pgDeleted`/`pgDeletedCatchUp` 恒 0，assertNoPgDelete（L508）作为 Pull 收尾硬断言；
- `grid_record_sync_state` 仍为 0 行（无删除追赶轨迹）。

## 11. BT/EA 排除

WPS 侧：BT、EA 均存在（含于 total 2064）；PG sync_map：BT=0、EA=0（查询空）。`FROZEN_EXCLUSIONS` 代码冻结（含 serialNo/姓名/日期人工裁定依据），`WPS_SYNC_EXCLUDE_EXTRA` 仅可追加。05-B/05-C 三次真实 Pull 实测 `bt=1/ea=1/excluded=2`。

## 12. 旧同步代码残留审计 + 风险登记

`wpsGridSyncService.js`（169 行）现为**安全 facade**：无字段映射字面量、无写入逻辑、无 DDL；reconcile 单向化；反向挂钩 no-op。结论：**PASS（无任何可执行旧双向逻辑）**。

**风险/建议登记（只报告，不修改）**：

- **R1（低）**：`SCHEDULER_ENABLED` 默认值语义为「未设置即 true」（`!== 'false'`），`.env` 无该键——当前靠 `WPS_GRID_SYNC=false` 第二道开关兜底休眠（实测 cron 注册 0 次）。建议：05-E 开启时在 `.env` 显式声明 `SCHEDULER_ENABLED`，形成显式双闸。
- **R2（低）**：`POST /webhook` 在 `WPS_WEBHOOK_SECRET` 未配置时无应用层 secret 校验——当前有全局 JWT（app.js:246）+ 引擎 fail-closed 双兜底，且该端点为预留未启用。建议：若未来启用 WPS 回调，先配置 secret。
- **R3（低）**：`POST /trigger` 仅受全局 JWT 保护、无角色限制——当前引擎 disabled → 恒 skipped；若开启 SYNC，任何有效登录用户可手动触发（受引擎互斥锁保护、且幂等，风险有限）。建议：补 `canWrite`（admin）校验。
- **R4（备注）**：`SYNC_ENABLED` 为模块加载时快照——运行中的进程改环境变量不生效，须重启才切换。这与既有「.env 冻结 + 授权后受控重启」纪律一致，非缺陷。

## 13. 05-C 测试数据治理登记（§九，不清算）

| 数据 | WPS | PG | 现状 | 若开启 Scheduler 的行为 |
|---|---|---|---|---|
| 新增测试行 | `gt`（serial `SYNC05C-TEST-20260911-001`，marker `SYNC05C-CREATE-TEST`） | id **7217**（grid/inspector/图片全 NULL） | 生产正式数据集中 | 作为**正常 mapped record** 持续参与 hash 比对；除非 WPS 侧变更，恒 unchanged |
| 修改测试行 | `go`（marker=`SYNC05C-UPDATE-TEST`） | id **6796**（grid=1、inspector=NULL） | 生产正式数据集中 | 同上，恒 unchanged |

**明确不执行**：删除 `gt`/`7217`、恢复 `go` marker、为恢复 WPS=2063/PG=2061 的任何删除。后续应单独设计「测试数据治理/隔离/清理」阶段（如 WPS 侧标记归档 + PG 侧 soft-delete/标记位），不在本阶段处理。

## 14. `.env` 指纹

mtime `2026-09-11T07:13:11.963 (+0800)` / 4225B / MD5 `dcbfd1c0baf8e3f47ff731edff41167e`。审计前（baseline）与审计后（recheck）**完全一致**。

## 15. PG before/after

recheck（elapsed 5,241ms）与 baseline 逐项比对 **9/9 全等**：counts、历史身份集合指纹、人工 10 条、gt/go 测试行（含 sync_hash MD5）、sync_map 无 BT/EA、图片列计数+last_sync_at 聚合指纹、`.env`、运行态字段、WPS 元数据。`INSERT=0 / UPDATE=0 / DELETE=0 / DDL=0`。

## 16. WPS before/after（元数据，只读 listAllRecords）

before 与 after 完全一致：total=**2064**、fileId `cn229thwalDs`、sheetId 3、BT=1、EA=1、gt=1、go=1。`WPS WRITE = 0`（本阶段无任何 create/update/delete 调用）。

## 17. DML / DDL 证据

- 本阶段 **realPullExecutions = 0**（未调用任何 Pull；引擎未被触发）；
- 审计脚本全程仅 SELECT（独立连接，代码审阅可证）+ WPS 只读 listAllRecords × 2 + HTTP 只读探针；
- pg_stat_user_tables 当前累计值（gir ins=85/upd=35/del=30850；sm ins=11/upd=1/del=0）为**历史累计**参考值，本阶段零增量由两轮全量指纹比对全等独立证明；
- 无任何 DDL。

## 18. STOP 条件逐项核查（§十二 21 项）—— 0 触发

PG DELETE=0 ✅ / 非批准 WPS WRITE=0 ✅ / DDL=0 ✅ / BT·EA 未进 PG ✅ / 历史 327 NULL 集合不变（MD5 `2668ce0c…`）✅ / 人工 10 条零漂移 ✅ / inspector 未被自动修改 ✅ / grid_id 未被自动修改 ✅ / sync_map 绑定指纹不变（`e0d11e45…`）✅ / natural key 未被使用 ✅ / 无身份·分组·负责人推断 ✅ / errors=0 ✅ / 未授权 INSERT=0 ✅ / MAX(id)=7217 不变 ✅ / Scheduler 未启动（cron 注册 0 次）✅ / `.env` 未修改 ✅ / 仅既有 gt/go 两条测试数据、无新增 ✅ / 图片列未被触碰 ✅ / push 仍 410 ✅。

## 19. 最终结论

**`PHASE_WPS_PG_SYNC_05D_COMPLETED_READY_FOR_05E`（PASS）**

依据（§十四全部条件）：Scheduler 结构安全 ✅ / 单实例无并发风险 ✅ / false 时绝不运行（隔离实测）✅ / Pull-only ✅ / 反向写恒关 ✅ / PG DELETE 恒关 ✅ / WPS DELETE 恒关 ✅ / BT·EA 排除有效 ✅ / grid_id 保护有效 ✅ / inspector_employee_id 保护有效 ✅ / 旧双向同步不可执行 ✅ / `.env` 未修改 ✅ / PG DML=0 ✅ / WPS write=0 ✅ / DDL=0 ✅ / 生产 baseline 100% 不变 ✅。

## 20. 下一阶段建议（05-E 受控开启 Scheduler 前置清单）

1. **决策项**：在 `.env` 显式新增 `SCHEDULER_ENABLED`（R1），与 `WPS_GRID_SYNC=true` 形成双闸；按既有纪律须人工授权后修改 `.env` 并受控重启 5876；
2. **建议随阶段处理**：`/trigger` 补 admin 角色校验（R3）、若启用 WPS 回调先配 `WPS_WEBHOOK_SECRET`（R2）；
3. **开启后首日观察**：首轮 cron Pull 日志（`[wps-pull]`）、`/status.running` 波动、`pg_stat` 增量、`imageWarnings` 数量；确认 15 分钟周期 `skipped:'already-running'` 不出现（Pull 耗时 ~3s ≪ 周期）；
4. **遗留项**：gt/go 测试数据治理（独立立项）；不变量定期巡检可复用 `wpssync05d-baseline.json` 指纹集。

## 21. 产物

- 本报告：`docs/HSE网格巡查身份链_WPS-PG-SYNC-05-D_Scheduler生产安全审计报告_20260911.md`
- 审计脚本：`server/scripts/_wpssync05d_audit.cjs`（audit/recheck 子命令）
- 证据：`server/scripts/output/wpssync05d-baseline.json`、`server/scripts/output/wpssync05d-recheck.json`
