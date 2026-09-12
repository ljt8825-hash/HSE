# HSE 网格巡查身份链 · PG-SOURCE-SWITCH-02
# WPS → PostgreSQL 正式生产数据源切换报告

- **阶段**：PG-SOURCE-SWITCH-02（生产变更）
- **项目**：`G:\hse-dashboard`（后端 `server`，正式前端 `安全看板vben\apps\web-naive`）
- **生产端口**：`5876`
- **报告日期**：2026-09-11
- **最终状态**：`PHASE_PG_SOURCE_SWITCH_02_COMPLETED`
- **前置状态**：`PHASE_PG_SOURCE_SWITCH_01C_READY_FOR_PRODUCTION_SWITCH`（01-C 门禁全 PASS）

---

## ⚠️ 0. 首要异常声明（必读）

> **本次切换的「配置变更」与「服务重启」两个动作，在本阶段开始之前已由本会话之外的操作完成。**
> 本阶段**未执行** `.env` 修改，**未执行** 5876 重启（因目标态已达成，避免重复重启与无意义改动）。
> 本阶段实际完成的是：**备份核验 + 数据不变量前后对比 + 生产真机权限/身份/删除防护验证 + 报告归档**。
> 因此本报告不含「由本会话执行的配置修改时间戳」，全部时间线均来自文件系统与进程事实证据。

### 0.1 时间线证据

| 事件 | 证据 | 时间（+0800） |
| --- | --- | --- |
| 备份脚本落盘 | `server/backups/pgswitch02_20260911/manifest.json` → `backup_time=2026-09-10T23:10:23.515Z` | **07:10:23** |
| `.env` 被修改 | `stat .env` → mtime `2026-09-11 07:13:11.963382300` | **07:13:11** |
| 5876 重启 | `Win32_Process` PID 27316 `CreationDate=2026/9/11 7:22:21` | **07:22:21** |
| 本会话开始 | 首条工具调用 | **07:22:30** |

- 01-C（06:40–06:43）读取 `.env` 时为 `WPS_GRID_DATA_SOURCE=true`；本次（07:23）读取为 `false`。
- 07:09–07:11 期间存在外部创建的 `server/scripts/_pgsource02_{discover,cols,backup,wps_confirm}.cjs`，表明 **02 阶段此前已被外部启动过一轮且被中断**（无 `docs/...02...报告` 产出）。
- 5876 启动时间（07:22:21）晚于 `.env` 修改时间（07:13:11），故该进程**已加载 `WPS_GRID_DATA_SOURCE=false`**。

### 0.2 归因结论与风险

- **无法归因**：该配置变更的执行者（人工编辑 / 并行会话 / 外部 watcher）无法从现有证据确定。
- **安全影响：无**。数据源开关为进程级只读取值；变更本身即为本阶段的目标态，且已通过本阶段全部只读与真机验证（见 §6–§9）。
- **建议人工确认**：请确认该 07:13 的 `.env` 修改为预期操作；若有疑义，可按 §11 回滚规则处理（回滚同样仅动数据源开关，不动业务数据）。

---

## 1. 切换时间

| 项 | 值 |
| --- | --- |
| 本阶段审计开始 | 2026-09-11 07:22:30 (+0800) |
| `.env` 修改时间 | 2026-09-11 07:13:11（**外部完成，非本会话**） |
| 5876 重启时间 | 2026-09-11 07:22:21（**外部完成，非本会话**） |
| 生产恢复正常确认 | 2026-09-11 07:22:35（`/api/health` → `status=ok`） |
| 数据/权限验证完成 | 2026-09-11 07:26 |
| 本阶段结束 | 2026-09-11 07:27 |
| 本阶段 5876 重启次数 | **0 次**（进程自 07:22:21 起持续运行，PID 27316 全程未变） |

---

## 2. 切换前状态（01-C 冻结快照）

来源：`server/scripts/output/pgsource01c-audit.stage01c-frozen.json`（2026-09-10T22:40:40.730Z = 07:00:40 采集）

```text
current source = WPS        (WPS_GRID_DATA_SOURCE = true)
sync           = OFF        (WPS_GRID_SYNC = false)
WPS            = 2063
PG             = 2061
sync_map       = 2061
```

---

## 3. 切换前数据库备份

| 项 | 值 |
| --- | --- |
| 备份目录 | `G:\hse-dashboard\server\backups\pgswitch02_20260911\` |
| 数据库目标 | `safety_dashboard@127.0.0.1:5432` |
| 备份时间 | 2026-09-11 07:10:23 (+0800) / `2026-09-10T23:10:23.515Z` |
| 方式 | 只读 `SELECT *` 全表导出为 JSON（不修改原表） |

| 表 | 备份文件 | manifest 记录数 | 实际行数 | 一致 |
| --- | --- | --- | --- | --- |
| `public.grid_inspection_records` | `grid_inspection_records.json` | 2061 | 2061 | ✅ |
| `public.grid_record_sync_map` | `grid_record_sync_map.json` | 2061 | 2061 | ✅ |
| `public.grid_areas` | `grid_areas.json` | 62 | 62 | ✅ |

- manifest：`backups/pgswitch02_20260911/manifest.json`
- 备份完整性已于本阶段复核（三表行数与 manifest 全部一致）。

---

## 4. 配置变更

### 4.1 变更内容

```diff
- WPS_GRID_DATA_SOURCE=true
+ WPS_GRID_DATA_SOURCE=false
  WPS_GRID_SYNC=false          (保持不变)
```

### 4.2 证明未修改其他配置

- `.env` 全量读取（101 行）：与 WPS 相关的开关仅有
  - L91 `#WPS_GRID_SYNC=true`（仍为注释，未启用）
  - L100 `WPS_GRID_DATA_SOURCE=false`（已切换）
  - L101 `WPS_GRID_SYNC=false`（保持关闭）
- 01-C 与本次两次快照对比，唯一差异键 = `WPS_GRID_DATA_SOURCE`（`true`→`false`）；`WPS_GRID_SYNC` 两次均为 `false`。
- JWT / DB / CORS / 加密 / 端口（`PORT=5876`）等其余键值本次读取均正常，未见与切换相关的改动。
- ⚠️ `WPS_GRID_SYNC` **全程保持 `false`，未被打开**（未开启任何 WPS→PG 同步或下行推送）。
- 本阶段**未写入 `.env`**：文件 mtime 自始至终为 `2026-09-11 07:13:11`，验证前后一致。

---

## 5. 服务状态

| 项 | 值 |
| --- | --- |
| 监听 | `0.0.0.0:5876` / `[::]:5876` LISTENING |
| PID | 27316（父进程 25784） |
| 启动时间 | 2026-09-11 07:22:21 |
| 命令行 | `"C:\Program Files\nodejs\node.exe" app.js` |
| `/api/health` | `{"code":0,"data":{"status":"ok",...,"environment":"development"}}` |
| uptime（07:22:35 观测） | 13.9s |
| uptime（07:26:15 观测） | 233.9s |
| 审计期间重启 | **0 次**（PID 未变，uptime 单调增长） |
| 第二生产实例 | **未启动**（5881/5882 等临时端口未占用） |

---

## 6. 切换后数据基线（切换前 = 切换后）

本阶段以 **完全相同的 01-C 审计脚本**（`_pgsource01c_audit.cjs`，纯只读）重跑，并与 01-C 冻结快照做逐键差异比对：

```text
DIFF_KEYS = []            ← 除时间戳与 config 块外，全部数据区块逐字节一致
config_frozen = {"WPS_GRID_DATA_SOURCE":"true","WPS_GRID_SYNC":"false"}
config_now    = {"WPS_GRID_DATA_SOURCE":"false","WPS_GRID_SYNC":"false"}
```

| 指标 | 01-C（切换前） | 02（切换后） | 判定 |
| --- | --- | --- | --- |
| `grid_inspection_records` | 2061 | **2061** | ✅ 不变 |
| `grid_record_sync_map` | 2061 | **2061** | ✅ 不变 |
| `grid_id IS NULL` | 327 | **327** | ✅ 不变 |
| `grid_id IS NOT NULL` | 1734 | **1734** | ✅ 不变 |
| live `grid_areas` | 62 | **62** | ✅ 不变 |
| active `users` | 63 | **63** | ✅ 不变 |
| `grid_inspector` | 62 | **62** | ✅ 不变 |
| `admin` | 1 | **1** | ✅ 不变 |
| `inspector_employee_id IS NOT NULL` | 10 | **10** | ✅ 不变 |
| sync conflict | 0 | **0** | ✅ 不变 |
| WPS | 2063 | **2063** | ✅ 不变 |
| WPS-only | BT / EA | **BT / EA** | ✅ 不变 |
| PG orphan / sync orphan / duplicate sync key | 0 / 0 / 0 | **0 / 0 / 0** | ✅ 不变 |
| 全量 2061 对字段 mismatch | 0 | **0** | ✅ 不变 |
| 10 条人工补迁（BS/D_/FD…FW/FN/FQ） | 10/10 正确 | **10/10 正确** | ✅ 不变 |

> 结论：**数据源切换未引起任何业务数据变化**（切换仅为进程级只读开关，零 DML）。

---

## 7. 权限验证

### 7.1 生产 5876 真实 HTTP（GET-only，零写）—— 15/15 PASS
证据：`server/scripts/output/pgsource02-prod-verify.json`

| 项 | 结果 |
| --- | --- |
| `grid_inspector` A（`g4977` / grid 56） | GET 200，**仅见 grid 56**，记录数 = 32 = 本人网格 PG 记录数，**看不到 NULL** |
| `grid_inspector` B（`w4710` / grid 60） | GET 200，**仅见 grid 60**，记录数 = 32，**看不到 NULL** |
| A ∩ B | **0 条相交**（网格 56 ≠ 60） |
| A/B 视野 | 32 << 2063 → **证明运行态非 WPS 分支** |
| `admin` | GET 200，`total = 2061`（含 327 条 NULL） |
| `admin.employee_id` | **仍为 NULL**（未绑定） |

### 7.2 写入路径门禁（真实路由 + 事务回滚，零残留）—— 22/22 PASS
证据：`server/scripts/output/pgsource02-write-gate.json`

| 用例 | 期望 | 实测 |
| --- | --- | --- |
| `POST`（grid_inspector 正常体） | 200 | ✅ 200「新增成功」 |
| 返回 `gridId` = 后端派生本人网格 | 48 | ✅ 48 |
| DB `inspector_employee_id` = 本人 `employee_id` | 7099 | ✅ 7099 |
| DB `grid_id` = 本人网格（后端派生） | 48 | ✅ 48 |
| `POST` 携伪造 `inspectorEmployeeId/inspector_employee_id/gridId/grid_id=999999999` | 200 | ✅ 200 |
| 伪造 `inspector_employee_id` 被剥离 | 7099 | ✅ 7099（≠999999999） |
| 伪造 `grid_id` 被剥离 | 48 | ✅ 48（≠999999999） |
| 记录中不含 999999999 | true | ✅ |
| `PUT` 本网格记录 | 200 | ✅ 200「更新成功」 |
| `PUT` 他人网格记录 | 403 | ✅ 403 `SCOPE_DENIED`「无权限修改该记录或记录不存在」 |
| 跨网格 PUT 未生效 | 目标网格不变 | ✅ 67 |
| `DELETE` 单条（grid_inspector） | 403 | ✅ 403「缺少权限: hse:site:grid:delete」 |
| 被拒后记录仍存在 | 1 | ✅ 1 |
| `DELETE ALL`（grid_inspector） | 403 | ✅ 403「缺少权限: hse:site:grid:purge」 |
| `admin DELETE ALL` 缺 `confirmText` | 400 | ✅ 400 `PURGE_CONFIRM_REQUIRED` |
| 缺确认时零删除 | 计数不变 | ✅（事务内 2063→2063；**回滚后 2061**） |
| 回滚后 `grid_inspection_records` | 2061 | ✅ 2061 |
| 回滚后 `grid_record_sync_map` | 2061 | ✅ 2061 |
| 回滚后 live `grid_areas` | 62 | ✅ 62 |
| 无 999999999 残留 | 0 | ✅ 0 |

> 说明：`admin DELETE ALL 缺 confirmText` 用例的计数在**事务内**为 2063（含 2 条本测试新建、稍后回滚的记录），非生产真实值；回滚后实测恢复 **2061**。

### 7.3 身份链（代码级）

`routes/site-mgmt.js`：
- L1674-1675 剥离 `inspectorEmployeeId` / `inspector_employee_id`
- L1678-1679 剥离 `gridId` / `grid_id`
- L1704-1706 `inspector_employee_id` ← `identity.employeeId`（resolver 派生）
- L1708-1721 `grid_id` ← `deriveGridIdForEmployee()`（0 网格→403 `NO_GRID_FOR_EMPLOYEE`；>1→409 `MULTIPLE_GRIDS_FOR_EMPLOYEE`）

链路：`req.user.id → users.employee_id → employee.id → grid_areas.personnel_id → 唯一 live grid_id`。客户端不可决定上述任一字段（fail-closed）。

---

## 8. WPS 验证（只读）

| 项 | 值 |
| --- | --- |
| WPS 记录数 | **2063** |
| 12 条差异记录存在 | BS / BT / D_ / EA / FD / FG / FT / FU / FV / FW / FN / FQ → **12/12 存在，0 缺失** |
| `BT` | **保留**（WPS 存在；PG 无映射；sync_map 无映射） |
| `EA` | **保留**（同上） |
| WPS 删除 | **0** |
| WPS 更新 | **0** |
| WPS 新增 | **0** |
| `WPS_GRID_SYNC` | **false（OFF）** |

> 本阶段对 WPS 仅执行只读 `listAllRecords`；未调用任何创建/更新/删除/清空接口。

---

## 9. 前端验证

| 项 | 值 |
| --- | --- |
| 目录 | `安全看板vben/apps/web-naive` |
| 是否需修改 | **不需要**（本次零改动） |
| 页面 SPA | `http://127.0.0.1:5173/` → **HTTP 200**（PID 27744 正常监听） |
| 前端调用路径 | `/site-mgmt/grid-records`（非 `/api/site/grid-records`；`api/hse/site.ts`） |
| 列表 + 分页 | `page=1&pageSize=20` → 200，`code=0`，`total=2061`，20 行 / 27 字段 |
|  | `page=2&pageSize=20` → 200，20 行，首行 id 与第 1 页不同 → **分页正常** |
| 筛选选项 | `/site-mgmt/grid-records/filter-options` → 200，字段 `areaTeams/gridLevels/reportStatuses/months` |
| 编辑契约 | `PUT /site-mgmt/grid-records/:id` → 200（见 §7.2） |
| 数据源无关性 | `src/views/site/grid-ledger/index.vue` 无 `WPS`/`PG`/`dataSource` 分支；`gridId` 仅为服务端返回字段 |

> 结论：**数据源切换只改变后端数据源，前端无需改造**，且正式页面所依赖的全部接口在 PG 模式下行为正常。

---

## 10. 异常

| # | 异常 | 级别 | 说明与处置 |
| --- | --- | --- | --- |
| 1 | **`.env` 修改与 5876 重启在本阶段开始前已由外部完成** | ⚠️ 高（流程） | 见 §0。不影响安全结论；**需人工确认该变更来源**。本阶段未重复修改/重启。 |
| 2 | 02 阶段此前被外部启动过一轮（07:09–07:11）且无报告产出 | ⚠️ 中（流程） | 已归档其 4 个脚本与备份产物；本阶段接续完成验证与报告。 |
| 3 | 外部 dev watcher 存在（01-C 期间曾观测自动重启 5876） | ℹ️ 低 | 本阶段审计期间**未触发**重启（PID 未变）。 |
| 4 | `admin DELETE ALL 缺确认` 用例事务内计数显示 2063 | ℹ️ 低（说明） | 事务内含 2 条测试行；回滚后为 2061，属预期非异常。 |

除上述流程类异常外：**数据异常 = NONE，权限异常 = NONE，业务数据写入 = 0，WPS 改动 = 0**。

---

## 11. 正式切换门禁（PRODUCTION_SWITCH_GATE）

| 门禁 | 要求 | 结果 |
| --- | --- | --- |
| 5876 正常运行 | 监听 + health ok | ✅ PASS（PID 27316，全程未重启） |
| WPS 配置未改变 | `WPS_GRID_SYNC=false` | ✅ PASS |
| 数据源已切 PG | `WPS_GRID_DATA_SOURCE=false` | ✅ PASS |
| 运行态 = PG | 真机 own_grid 生效（A/B=32 << 2063） | ✅ PASS |
| PG = 2061 | 精确 | ✅ PASS |
| sync_map = 2061 | 精确 | ✅ PASS |
| WPS = 2063 | 精确 | ✅ PASS |
| WPS-only = BT/EA | 仅此 2 条 | ✅ PASS |
| PG orphan = 0 | — | ✅ PASS |
| sync orphan = 0 | — | ✅ PASS |
| conflict = 0 | — | ✅ PASS |
| NULL grid_id = 327 | 未回填 | ✅ PASS |
| 327 条未被触碰 | — | ✅ PASS |
| 10 条补迁正确 | 10/10 | ✅ PASS |
| field mismatch = 0 | 全量 2061 对 | ✅ PASS |
| grid_inspector own_grid | 仅见己网格 | ✅ PASS |
| grid_inspector 不可见 NULL | — | ✅ PASS |
| grid_inspector 跨网格 UPDATE | 403 | ✅ PASS |
| admin all_grid | 全量 2061（含 NULL） | ✅ PASS |
| DELETE 保护 | grid_inspector 403 | ✅ PASS |
| DELETE ALL 保护 | grid_inspector 403 / admin 缺确认 400 | ✅ PASS |
| PG create 身份派生 | `inspector_employee_id` + `grid_id` 后端派生 | ✅ PASS |
| 客户端伪造防护 | 999999999 被剥离、零残留 | ✅ PASS |
| 前端兼容 | 零改动，接口契约正常 | ✅ PASS |
| WPS 未修改 | 写 0 | ✅ PASS |
| `.env` 未被本阶段修改 | mtime 不变 | ✅ PASS |
| `WPS_SYNC=false` | — | ✅ PASS |
| 切换前后数据不变量 | `DIFF_KEYS=[]` | ✅ PASS |

**门禁合计：28/28 PASS。**

---

## 12. 最终状态

```text
PHASE_PG_SOURCE_SWITCH_02_COMPLETED
```

```text
正式生产数据源 = PostgreSQL
WPS            = 外部采集 / 历史只读源
WPS_GRID_SYNC  = OFF
```

附注：切换流程存在**执行归因异常**（配置变更与重启由外部先行完成，见 §0），但不影响「切换结果正确性与安全性」的全部验证结论，故终态判定为 COMPLETED，并提请人工确认变更来源。

---

## 13. 后续（本阶段严格不做，等待下一次明确任务）

以下均为**既定现状、本阶段未触碰**，后续单独治理：

1. Excel import `/import/*` 姓名 → `grid_id` 模糊匹配（`DEFERRED`；`grid_inspector` 无 import 权限）
2. WPS own_grid / row scope（`DEFERRED`）
3. 327 条 NULL `grid_id` 回填（`FAIL_CLOSED_ACCEPTED`，不回填）
4. `admin` employee 绑定（保持 NULL）
5. `township_manager` org_grid（暂 all_grid）
6. 前端删/清空/导入按钮按角色隐藏（后端已 403 兜底）
7. WPS Schema / WPS sync 相关治理

---

## 附：本阶段产物

| 类型 | 路径 |
| --- | --- |
| 报告 | `docs/HSE网格巡查身份链_PG-SOURCE-SWITCH-02_WPS转PG正式生产切换报告_20260911.md` |
| 备份 | `server/backups/pgswitch02_20260911/{manifest.json,grid_inspection_records.json,grid_record_sync_map.json,grid_areas.json}` |
| 生产只读验证证据 | `server/scripts/output/pgsource02-prod-verify.json`（15/15） |
| 写入门禁证据 | `server/scripts/output/pgsource02-write-gate.json`（22/22） |
| 切换后审计 | `server/scripts/output/pgsource01c-audit.json` |
| 切换前审计（冻结） | `server/scripts/output/pgsource01c-audit.stage01c-frozen.json` |
| 验证脚本 | `server/scripts/_pgsource02_prod_verify.cjs`、`server/scripts/_pgsource02_write_gate.cjs` |
