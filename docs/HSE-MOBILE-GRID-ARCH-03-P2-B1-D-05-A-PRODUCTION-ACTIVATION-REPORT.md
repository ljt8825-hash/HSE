# HSE-MOBILE-GRID-ARCH-03 / P2-B1-D / 05-A
# 生产生效前审计 + HSE Backend 生产重启 — 最终报告

**阶段**：`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_PRODUCTION_ACTIVATION_05-A`
**日期**：2026-09-13 ｜ **结论**：`_05-A_COMPLETED`

---

## 1. 阶段状态

**PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_PRODUCTION_ACTIVATION_05-A_COMPLETED**

满足全部十四节收口条件：5876 正常、新 PID 正常、health=200、DB 正确、Scheduler 正常、WPS 正常、生产业务数据 A/B 一致、无生产 DML、无 WPS write、GET API 正常、DEF-B 正常、无未授权代码变化。

## 2. 是否成功重启生产 Backend

**是**。旧 PID 23396（09-12 11:52 启动）→ 新 **PID 39616**（09-13 13:44:28 经 HSE-Backend 看护任务自动重启）。R2 / P2-B1-D 04-B/04-D-B/04-E-B 后端代码已全部在生产生效。

生产停机窗口：**约 59 秒**（13:43:30 任务停止 → 13:44:29 health 200）。

## 3. 重启前 PID

**23396**（ppid=2356 svchost；CIM 创建时间 2026-09-12 11:52:27；提权 proctree 复核 CommandLine=prod-launch.cjs）

## 4. 重启后 PID

**39616**（ppid=2356 svchost；`prod-service-console.log` 启动头 time=2026-09-13T05:44:28Z pid=39616 cwd=G:\hse-dashboard\server node=v24.18.0）

## 5. health 状态

`GET /api/health` = **200**（`{"status":"ok"}`，uptime 正常增长）。重启前亦为 200。

## 6. DB 连接确认

- `server/.env` mtime **2026-09-11 22:22:50.606**（与冻结基线一致，未修改）；`DB_NAME=safety_dashboard`、`PORT=5876`、`WPS_GRID_SYNC=true`、`SCHEDULER_ENABLED=true`、`WPS_GRID_DATA_SOURCE=false`。
- `prod-launch.cjs`（生产启动器）`process.chdir(server)` 后同进程 require `app.js` → 读 `server/.env` → **连 safety_dashboard**。
- `pg_stat_activity`：hse_app 连接全部落在 `safety_dashboard`（无 dev 库连接）。

## 7. Scheduler 状态

新实例启动日志（13:44:29）：warning-center ✅ / health-check ✅ / assessment-scheduler ✅ / **wps-pull `*/15 * * * *` ✅** / monthly-ledger-import ✅。配置未做任何修改。

## 8. WPS 状态

`GET /api/wps-grid-sync/status`：`syncEnabledByEnv=true`、**`reverseWriteEnabled=false`**、**`deleteSyncEnabled=false`**、`conflicts=0`、`mappingCount=2061`、exclusions=[BT,EA]。
重启后首轮 Pull：`pulled=2063 inserted=0 updated=0 unchanged=2061 excluded=2 wpsDeleted=0 pgDeleted=0 errors=0`（零漂移）。

## 9. 生产数据 A/B 对照表

| 指标 | A 点（重启前 13:30） | B 点（重启后 13:48） | 一致 |
| --- | --- | --- | --- |
| gir count | 2061 | 2061 | ✅ |
| gir max(id) | 7192 | 7192 | ✅ |
| gir 列数 | 33 | 33 | ✅ |
| grid_id non-null | 1734 | 1734 | ✅ |
| inspector_employee_id non-null | 10 | 10 | ✅ |
| attribution_status 各状态 | 全 NULL(2061) | 全 NULL(2061) | ✅ |
| 5 扩展列 non-null | 全 0 | 全 0 | ✅ |
| grid_record_sync_map | 2061 | 2061 | ✅ |
| audit_record | 0 | 0 | ✅ |
| sys_operation_log | 4588 | 4588 | ✅ |
| wps_account_employee_map | 0 | 0 | ✅ |

## 10. API GET 验证结果（生产 5876 直连，admin JWT）

| 请求 | 结果 |
| --- | --- |
| `GET /api/grid-attribution/pending` | **200**，code=0，total=0（空态=真实态，stamping 未 apply） |
| `GET /api/grid-attribution/attributed?page=1&pageSize=20` | **200**，code=0，total=0（04-D-B 新端点已生效） |
| `GET /api/wps-grid-sync/status` | 200（见 §8） |
| `GET /api/hse/employee/employees/selector` | **200，`data` 为真实数组（20 项）——R2 修复生产生效**（此前为 `{"0":…}` 破损形状） |
| 未授权 `GET /pending` | 401 ✅ |
| 未执行 | POST /attribute、DELETE /revoke（按阶段禁令跳过） |

## 11. DEF-B 生产验证结果（非破坏）

生产前端 = Vite 5173（提权启动器拉起，直接服务源码）。实测其加载的 `src/adapter/naive.ts` 模块内容含 `usePreferences`（×3）、`theme: isDark.value ? darkTheme : lightTheme` —— 即**已修复版本**；`/site/grid/attribution`、`/site/grid/attributed` 两页面模块均 200 可服务。未修改任何用户数据、未做 DOM 破坏性操作。（双色系页面视觉复验留待用户日常使用确认；dev 侧已做过双模式对比度验证 221/219。）

## 12. 生产 DML = 0 证明

`pg_stat_database`（safety_dashboard）A→B：`tup_inserted 35831→35831`、`tup_updated 73187→73187`、`tup_deleted 32249→32249`——**重启窗口内零插入/零更新/零删除**。业务计数 A/B 全等（§9）。全阶段仅执行 SELECT（只读基线脚本）。

## 13. WPS write = 0 证明

① `reverseWriteEnabled=false` + `deleteSyncEnabled=false`（API 实测）；② Pull 引擎只读拉取且重启窗口内 inserted/updated/wpsDeleted/pgDeleted 全 0；③ 本会话未发起任何 WPS OpenAPI 调用。

## 14. 修改文件清单

**0**（产品代码/配置）。本阶段新增文件仅为：
- `server/logs/p05a-restart-transcript.log`、`server/logs/p05a-recover-transcript.log`（运维审计日志，自动生成）
- `.workbuddy/tmp/` 下验证脚本与 A/B 基线 JSON（工具产物，不入库）
- 本报告 `docs/HSE-MOBILE-GRID-ARCH-03-P2-B1-D-05-A-PRODUCTION-ACTIVATION-REPORT.md`

## 15. 异常与 STOP 点记录（均已自愈，未损失数据）

| 时刻 | 事件 | 处置 |
| --- | --- | --- |
| 13:38 | 沙箱内 `Start-Process -Verb RunAs`、`cmd start`、`explorer` 均无法触发 UAC | 改为**用户手动双击**自提权 bat（安全沙箱限制，非生产问题） |
| 13:43:33 | 重启脚本 STEP2 `Stop-ScheduledTask` **同时终止了进程树**（23396 随任务停止退出），STEP3 杀前复核守卫发现 PID 已消失 → 自动 **[BLOCKED]**，未执行任何 kill | 符合设计（安全守卫生效）；任务处于 Stopped，5876 短暂停机 |
| 13:44:28 | **HSE-Backend 看护任务失败恢复（RestartCount=3）自动重启生产进程** → 新 PID 39616、health 200 | ✅ watchdog 自动恢复链**首次在生产实测走通**（05g2 演练曾因提权会话幽灵 PID 未完成此项证明） |
| 13:46:26 | 恢复脚本守卫发现进程已存在（39616）→ 拒绝二次启动 [BLOCKED] | 符合设计，防止双实例 |

未出现：5876 无法恢复 / health 非 200 / 双生产实例 / DB 指向错误 / Scheduler 异常 / 生产数据非预期变化 / 未授权代码变化 / .env 修改 / WPS 写操作 / stamping 意外执行。

## 16. 声明

**stamping production apply 本阶段未执行**；G2、H1 未执行；无生产 DDL/DML；无 WPS 写；Scheduler/Pull Engine/auth/users/gridScope/菜单均未修改。

---

## 附录：生产形态取证（本阶段新固化的事实）

1. **生产 5876 = SYSTEM 提权计划任务「HSE-Backend」**（非 Windows 服务；`HKLM\Services` 无此项，非提权会话的 `Get-ScheduledTask`/`Get-Service` 不可见）。链路：任务 → `node.exe server/scripts/prod-launch.cjs`（同进程 require app.js，无中间包装进程）。
2. **提权会话 TCP 表对 :5876 报幽灵 PID**（05g2 已知问题）——生产进程身份必须用「提权 CIM proctree（CommandLine 匹配 prod-launch.cjs）+ health HTTP 轮询」判定，禁信 TCP 表。
3. **`Stop-ScheduledTask` 会连带终止进程树**：重启 = 停任务即可杀进程，无需（也不应）再 taskkill；恢复 = `Start-ScheduledTask`，或依赖 RestartCount 失败自动重启（已实测有效，恢复约 60s）。
4. 提权操作需用户手动双击 bat（沙箱无法代触发 UAC）。
5. 已知遗留（不在本阶段范围）：5173 正式前端 vite proxy 当前指向 **5881（dev 后端）**（`vite.config.ts` 注释「生产/正式联调请改回 5876」）；切回属前端配置修改，须另行授权。5876 根路径 302 → localhost:5173。
6. 遗留待授权事项（不变）：stamping production apply、G2 真分页、H1 audit-records 权限治理、23396 时代残留进程 24036/12680 清理。
