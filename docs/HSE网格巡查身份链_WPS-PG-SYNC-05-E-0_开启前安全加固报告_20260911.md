# WPS-PG-SYNC-05-E-0：Scheduler 开启前安全加固报告

**日期**：2026-09-11
**阶段**：WPS-PG-SYNC-05-E-0（STRICT CONTROLLED CHANGE，仅两项安全加固）
**前置状态**：`PHASE_WPS_PG_SYNC_05D_COMPLETED_READY_FOR_05E`
**终态**：`PHASE_WPS_PG_SYNC_05E0_COMPLETED_READY_FOR_05E1`（PASS）

---

## 1. 修改文件清单（含备份）

| 文件 | 变更 | 备份 |
|---|---|---|
| `server/services/wpsGridSyncScheduler.js` | R1：`SCHEDULER_ENABLED` 语义改为显式双闸 + 头注释/日志同步 | `server/backups/wpssync05e0_20260911/wpsGridSyncScheduler.js` |
| `server/routes/wps-grid-sync.js` | R3：`POST /trigger` 增加 `canWrite` 403 门禁（2 行逻辑 + 注释） | `server/backups/wpssync05e0_20260911/wps-grid-sync.js` |
| `server/.env` | 仅追加 2 行（注释 + `SCHEDULER_ENABLED=false`，§十授权范围内唯一 .env 变更） | `server/backups/wpssync05e0_20260911/env.bak-05e0` |
| 新增测试脚本 | `server/scripts/_wpssync05e0_tests.cjs`（sw/trigger 隔离测试） | — |

`diff` 证明：两份源码变更之外**零改动**（Pull Engine、wpsGridSyncService、wpsFieldMap、app.js、auth、users、JWT 全部未触碰）。

## 2. 修改前后 Scheduler 开关语义

| | 修改前 | 修改后 |
|---|---|---|
| 表达式 | `process.env.SCHEDULER_ENABLED !== 'false'`（**默认开启**：未设置/''/abc/0 均视为 true） | `process.env.SCHEDULER_ENABLED === 'true'`（**fail-closed 显式双闸**：仅显式 `'true'` 开启） |
| 注册条件 | SCHEDULER_ENABLED ∧ svc.isEnabled() | SCHEDULER_ENABLED ∧ svc.isEnabled()（语义不变，第一道闸改为显式） |
| 职责边界 | — | 注释冻结：仅控制「Scheduler 是否自动触发 Pull」，不改变 WPS_GRID_SYNC / Pull Engine / 数据源开关语义（§五 三开关职责不混淆） |

## 3. `SCHEDULER_ENABLED` 五种取值测试（隔离进程，mock node-cron）

| SCHEDULER_ENABLED | svc.isEnabled 真实（隔离=DB 未连） | svc.isEnabled mock=true（模拟第二道闸已开） |
|---|---|---|
| `'false'` | cron.schedule **0 次** | **0 次** |
| `'true'` | **0 次**（第二道闸拦截） | **1 次**（正向路径正确） |
| `''`（空） | **0 次** | **0 次** |
| `'abc'` | **0 次** | **0 次** |
| `'0'` | **0 次** | **0 次** |
| 未设置 | **0 次** | **0 次** |

B 组证明 R1 **独立拦截能力**：即使第二道闸（WPS_GRID_SYNC+凭证+DB）全部就绪，非显式 `'true'` 的任何取值都不注册。A 组证明 `WPS_GRID_SYNC=false` 时即使 `SCHEDULER_ENABLED=true` 仍不注册（§八 要求成立）。

## 4. `WPS_GRID_SYNC × SCHEDULER_ENABLED` 组合测试

见 §3 矩阵 A（WPS_GRID_SYNC=false × 6 种 SCHED 值 → 全 0 次注册）与矩阵 B（WPS_GRID_SYNC=true × 6 种 → 仅显式双 true 注册 1 次）。组合语义 = **AND**，任一非 true 即休眠。

## 5. `/trigger` 四类身份权限测试（真实 router + mock runPull，不真实 Pull）

| 身份 | 结果 |
|---|---|
| admin | **200** 进入 trigger 流程（mock 返回 `skipped:'disabled(mock)'`） |
| system_admin | **200** 同上 |
| grid_inspector | **403** `ADMIN_REQUIRED`「手动触发仅允许管理员角色」 |
| township（其他非 admin） | **403** 同上 |
| 未认证 | **401**（JWT 认证失败行为，由全局 authMiddleware 承担——模拟验证） |
| 无角色 token（防御性） | **403** |

`realPullExecutions = 0`（runPull 为 mock，admin/system_admin 的 200 仅证明通过权限门禁；引擎内部 fail-closed/硬锁/排除/保护语义零改动——本阶段未触碰引擎任何代码）。R3 复用 `/pull` 真实写路径同款 `canWrite`（WRITE_ROLES=['admin','system_admin']），未新造权限体系；当前库内实际仅 admin 1 人。

## 6–9. Pull / DML / WPS 写 / DDL

真实 Pull **0 次**；PG INSERT/UPDATE/DELETE **0**；WPS create/update/delete **0**；DDL **0**。全程隔离测试不连生产 DB（测试进程 pg Pool 惰性未连接）、不调真实 WPS API。

## 10. 生产 `.env` 前后指纹

| | mtime | size | md5 |
|---|---|---|---|
| before | 2026-09-11 07:13:11.963 | 4225B | `dcbfd1c0baf8e3f47ff731edff41167e` |
| after | 2026-09-11 16:33:49.740 | 4388B | `8e697bb7dcf64bee9028b30e5e49f50a` |

`diff` 证明：**仅追加 2 行**（`# WPS-PG-SYNC-05-E-0 R1…` 注释 + `SCHEDULER_ENABLED=false`）；`WPS_GRID_SYNC=false`、`WPS_GRID_DATA_SOURCE=false` 字节级未动。未写 true、未开启 Scheduler、未执行生产 Pull、未重启生产服务。

## 11–16. 生产基线 before/after（§十一 + §十二）

before 基线（16:27，`wpssync05e0-baseline-before.json`）与 §十一 17 项期望 **0 偏差**：gir=2062、sm=2062、MAX=7217、MIN=4954、历史 NULL=327（MD5 `2668ce0c51f9f29b3e1272ba7cc56288`）、总 NULL=328、非 NULL 历史=1734、inspector 非空=10、grids=62、users=63（gi 62/adm 1）、conflict=0、sync_hash NULL=0、历史身份指纹 `6a6c19f3e710efca4ea7c6e35f18792e`、绑定指纹 `e0d11e45c9034b5dcd9daab7c7ce7906`、gt→7217、go→6796、BT/EA 不在 sync_map。

变更后 recheck（两轮，末轮 16:35）：**9 项中 8 项全等**（counts / 历史身份指纹 / 人工 10 条 / gt·go 测试行 / BT-EA / 图片列 / WPS 元数据 / 运行态字段），唯一 `env` 项差异 = §10 授权内 2 行追加（diff 已证明最小性）。**05-C 测试数据、10 条人工绑定、历史 327 NULL、BT/EA 排除、图片列 100% 保持**。

## 17. Scheduler 是否仍关闭 —— 是

- **磁盘新代码**：当前 `.env` 组合（SCHEDULER_ENABLED=false + WPS_GRID_SYNC=false）下，矩阵 A 实测 cron.schedule 注册 0 次。
- **生产运行态**：5876 现为 **PID 28020**（外部第 7 次重启，≈16:29:35 启动——**早于** 16:33:49 的 .env 修改，故该进程加载的是旧 env/旧 scheduler 代码）。其行为判别确认仍为 SYNC-02（`syncEnabledByEnv=false`、`running=false`、`reverseWriteEnabled=false`、`deleteSyncEnabled=false`、`mappingCount=2062`、`conflicts=0`、`exclusions=['BT','EA']`、`hashScopeColumns=18`、认证 `/push`→410 `REVERSE_WRITE_DISABLED`）。运行态 cron 注册=0 的证据链：旧 scheduler 代码在 `WPS_GRID_SYNC=false` 时 `svc.isEnabled()`=false，`initWpsGridSyncScheduler` 必然休眠（05-D 已对同一代码 mock 实测 cron 注册 0 次）+ `/status.running=false`。
- **如实归因**：PID 27248→28020 为外部重启（本会话重启 0 次）；因发生在我方 .env 修改之前，与本次变更无关，且重启后运行态仍安全关闭。

## 18. STOP 条件逐项核查

真实 Pull>0 ✗ / 开 Scheduler ✗ / .env WPS_GRID_SYNC→true ✗ / WPS_DATA_SOURCE 修改 ✗ / WPS 写 ✗ / PG DML ✗ / DDL ✗ / 清理 05-C 测试数据 ✗ / 删 gt·7217 ✗ / 改 6796 marker ✗ / 改 327 NULL ✗ / 改人工 10 条 ✗ / 改 grid_id·inspector ✗ / 改 users·employee·JWT·auth 核心 ✗ / 改 Pull Engine 业务逻辑·FIELD_MAP·SYNC_PROJECTION·FROZEN_EXCLUSIONS ✗ / 启用 /webhook ✗ / 顺手处理 R2 ✗ / 重构 Scheduler ✗ / 新增 npm 依赖 ✗（node-cron 为既有依赖）——**0 触发**。

## 19. 最终结论

**`PHASE_WPS_PG_SYNC_05E0_COMPLETED_READY_FOR_05E1`（PASS）**

两道安全加固落地且经隔离测试证明：① R1 显式双闸（默认开启语义已消除，六种非 true 取值全拦截）；② R3 /trigger admin 门禁（非 admin 403）。Scheduler 保持关闭，数据基线 100% 不变，`.env` 变更严格限于授权范围。

## 20. 下一阶段建议（不自动执行）

**05-E-1（受控开启 Scheduler）**建议前置条件清单：
1. 人工授权后 `.env` 将 `SCHEDULER_ENABLED=true` + `WPS_GRID_SYNC=true`（双闸同时显式）；
2. 受控重启 5876（本阶段未重启；当前 PID 28020 为外部进程）；
3. 开启后首小时观察：首轮 `[wps-pull]` 日志、`/status.running` 波动、`pg_stat` 增量、`imageWarnings`；确认 15 分钟周期无 `already-running` 冲突（Pull ~3s ≪ 周期）；
4. R2（/webhook secret）与测试数据治理（gt/7217、go/6796）仍为独立遗留项，建议另行立项。

## 21. 产物

- 本报告：`docs/HSE网格巡查身份链_WPS-PG-SYNC-05-E-0_开启前安全加固报告_20260911.md`
- 测试脚本：`server/scripts/_wpssync05e0_tests.cjs`；证据：`server/scripts/output/wpssync05e0-tests.json`（矩阵 A/B 12 组 + trigger 6 案）、`wpssync05e0-baseline-before.json`
- 备份：`server/backups/wpssync05e0_20260911/`（scheduler、routes、.env 三件原样）
