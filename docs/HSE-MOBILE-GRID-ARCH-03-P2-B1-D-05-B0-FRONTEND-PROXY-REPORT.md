# HSE-MOBILE-GRID-ARCH-03 / P2-B1-D / 05-B0
# 正式前端 Proxy 生产链路修复报告

阶段：`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_PRODUCTION_FRONTEND_PROXY_05-B0`
日期：2026-09-13
结论：**COMPLETED**

---

## 一、阶段结果总览

5173 正式前端 proxy 已由 **5881（dev backend）→ 5876（production backend）** 修复并经三层独立证据验证生效。修改文件仅 `vite.config.ts`（+1 个本报告与运维脚本）。stamping production apply **未执行**，生产 DML=0，WPS write=0。

## 二、修改前后 target

| proxy 条目 | 修改前 | 修改后 |
|---|---|---|
| `/api` | `http://127.0.0.1:5881` | `http://127.0.0.1:5876` |
| `/uploads` | `http://127.0.0.1:5881` | `http://127.0.0.1:5876` |

配置位置与预期一致（`安全看板vben/apps/web-naive/vite.config.ts`），未发生 STOP 条件。仅改 target 行 + 同步两行注释（非功能）；port / host / changeOrigin / ws / configure / Origin 剥离逻辑全部未动。git diff 全文见附录 A。

## 三、PID 清单（重启后）

| 端口 | PID | 身份 | 说明 |
|---|---|---|---|
| 5876 | **39616** | 生产 Backend | 未触碰（05-A 重启产物，uptime 连续） |
| 5881 | **40456** | dev Backend | 未触碰 |
| 5173 | **39944** | 正式前端 vite（新） | 旧 PID 6296 由正式启动器 `start-hse-naive-fe.bat`（自提权，Kill-Port→重拉 vite）替换，用户手动双击完成 UAC |

Scheduler / Pull Engine / HSE-Backend 任务：未触碰。

## 四、实际 API 路由验证（全部经 5173 代理发请求）

**修改前特征（证明问题存在）**：via5173 health uptime=9658.13s ≈ 直连 5881=9658.58s（同一进程），而直连 5876=736.47s ⇒ 修改前 5173 确实走 5881。

**修改后证据链（三层）**：

1. **uptime 特征**：via5173 uptime=1468.96s ≈ 直连 5876=1469.67s（同一进程），与 5881（10392.95s）截然不同。
2. **counter-delta（DB 层）**：经 5173 发 3 个请求前后对比 `pg_stat_database`：`safety_dashboard` xact_commit **+2** / tup_returned **+222**；`safety_dashboard_dev` **双零** ⇒ 请求实际进入生产库。
3. **admin GET 全套**（自签 JWT，jti+type 齐备）：

| API | HTTP | 结果 |
|---|---|---|
| `/api/health` | 200 | status=ok |
| `/api/grid-attribution/pending` | 200 | 空（stamping 未执行，符合预期） |
| `/api/grid-attribution/attributed` | 200 | total=0（符合预期） |
| `/api/hse/employee/employees/selector` | 200 | 真数组 20 项（R2 生产生效） |
| 未授权 pending | **401** | 符合既有规则 |

未执行 POST /attribute、DELETE /revoke（spec 禁止）。

## 五、DB 环境验证（环境甄别）

- **5876 → safety_dashboard**：counter-delta（见上）+ `pg_stat_database` 快照 + prod-launch.cjs 启动链（05-A 取证）+ `.env`（DB_NAME 未动，mtime 未变）。
- **5881 → safety_dashboard_dev**：04-C 重启时以显式 `DB_NAME=safety_dashboard_dev` 启动并经 counter-delta 证明；本轮 counter-delta 中 dev 库零事务，进一步佐证 5173 不再经过 5881。
- 未以 HTTP 200 单独判定，均为端口/PID + DB 计数器 + uptime 特征综合证据。

## 六、生产数据 A/B 对照（全部只读）

| 指标 | A 点（修改前） | B 点（修改后） | 一致 |
|---|---|---|---|
| grid_inspection_records count | 2061 | 2061 | ✅ |
| grid_inspection_records max(id) | 7192 | 7192 | ✅ |
| grid_record_sync_map count | 2061 | 2061 | ✅ |
| grid_id non-null | 1734 | 1734 | ✅ |
| inspector_employee_id non-null | 10 | 10 | ✅ |
| attribution_status 非空 / pending / attributed / manual | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | ✅ |
| client_token / source_channel 非空 | 0 / 0 | 0 / 0 | ✅ |
| audit_record | 0 | 0 | ✅ |
| wps_account_employee_map（桥接） | 0 | 0 | ✅ |
| sys_operation_log | 4588 | 4588 | ✅（运行日志） |
| **pg_stat tup_inserted/updated/deleted delta** | — | **0 / 0 / 0（两库均零）** | ✅ |

**生产 DML = 0**（业务表 A/B 全等 + 三类 tup 计数零漂移双重证明）。**WPS write = 0**（本阶段无任何 WPS 触达；5876/5881 均未重启，reverse/delete 开关未动）。

## 七、P2-B1-D 页面验证（非破坏性，经 5173）

| 模块 | HTTP |
|---|---|
| `/src/views/site/grid/attribution/index.vue` | 200 |
| `/src/views/site/grid/attributed/index.vue` | 200 |
| `/src/adapter/naive.ts` | 200（DEF-B 修复内容实测：`isDark.value ? darkTheme : lightTheme`） |
| `/src/api/hse/grid-attribution.ts` | 200 |

生产 pending=0 / attributed=0 符合「stamping 未执行」预期，未制造任何测试数据。页面后端数据均来自 5876（counter-delta 证明），无 5881 dev 数据混入。

## 八、修改文件清单

1. `安全看板vben/apps/web-naive/vite.config.ts`（唯一功能修改：两处 target + 注释）
2. `docs/HSE-MOBILE-GRID-ARCH-03-P2-B1-D-05-B0-FRONTEND-PROXY-REPORT.md`（本报告）
3. `.workbuddy/tmp/`（验证脚本与快照，非产品代码）

其余 git 变更均为 04-C→04-E-B 既授权改动与本阶段无关。git diff 见附录 A。

## 九、异常与 STOP

无 STOP 条件触发。5173 重启由正式启动器完成（需 UAC，用户手动双击，与 05-A 相同机制）。

## 十、声明

- **stamping production apply = 未执行**
- 生产 DML = 0；DDL = 0；WPS 写 = 0
- Backend（5876/5881）/ Scheduler / Pull Engine / auth / users / gridScope / 菜单 = 零修改
- G2 / H1 = 未执行

## 附录 A：vite.config.ts git diff（唯一功能修改）

```diff
@@ -18,8 +18,8 @@
           '/api': {
             changeOrigin: true,
-            // 开发阶段代理到开发后端 5881；生产/正式联调请改回 5876
-            target: 'http://127.0.0.1:5881',
+            // 05-B0：正式前端代理生产后端 5876（safety_dashboard）；开发调试如需走 dev 后端，临时改回 5881
+            target: 'http://127.0.0.1:5876',
@@ -31,8 +31,8 @@
           '/uploads': {
             changeOrigin: true,
-            // 开发阶段随 /api 一起走开发后端 5881
-            target: 'http://127.0.0.1:5881',
+            // 05-B0：随 /api 一起走生产后端 5876
+            target: 'http://127.0.0.1:5876',
```
