# HSE 网格巡查身份链 · PG-SOURCE-SWITCH-01-C 生产服务状态与正式切换最终门禁审计报告

> 阶段性质：**只读最终门禁审计（AUDIT ONLY / 零写）**
> 生成时间：2026-09-11 06:32 (GMT+8)
> 审计范围：`G:\hse-dashboard` · 后端 `server/` · 前端 `安全看板vben/apps/web-naive` · 生产端口 `5876`
> 审计脚本产物：`server/scripts/output/pgsource01c-audit.json`、`server/scripts/output/pgsource01c-ownscope-gate.json`

## 红线守约声明（本阶段未做任何写操作）

| 禁项 | 是否违反 | 说明 |
| --- | --- | --- |
| 业务数据写入 (PG/INSERT/UPDATE/DELETE) | 否 | 仅 `SELECT` + WPS 只读 `listAllRecords` |
| 修改 WPS | 否 | 仅读 `file_id=cn229thwalDs` / `sheet_id=3` |
| 修改 users / grid_areas / sync_map | 否 | 全部只读统计 |
| 修改 `.env` | 否 | `WPS_GRID_DATA_SOURCE=true` / `WPS_GRID_SYNC=false` 原样保留 |
| 重启 5876 | 否 | 仅观测，未触碰生产进程 |
| 执行 PG-SOURCE-SWITCH-02（切数据源） | 否 | 本阶段完成后**停止**，等人工批准 |

---

## 1. 5876 真实运行状态

通过 `netstat -ano | findstr :5876` + 健康检查接口核验：

| 项 | 值 |
| --- | --- |
| 监听状态 | **监听中** (`0.0.0.0:5876` + `[::]:5876`) |
| PID | `24436` |
| uptime | `28580 s`（约 7.9 小时，自 2026-09-10 夜间持续运行） |
| `/api/health` | `{"code":0,"data":{"status":"ok",...}}` |
| 当前进程 | 正常 |

**结论：生产服务 5876 正常运行，无需恢复/重启动作。**

---

## 2. 当前 WPS 数据源状态（只读读取 `.env`）

| 配置项 | 值 | 是否改动 |
| --- | --- | --- |
| `WPS_GRID_DATA_SOURCE` | `true` | 否（保持生产 WPS 模式） |
| `WPS_GRID_SYNC` | `false` | 否（保持关闭） |

```
current_source = WPS
sync = OFF
```

---

## 3. PG 最终数据基线（只读统计）

| 指标 | 实测 | 门禁 | 结果 |
| --- | --- | --- | --- |
| `grid_inspection_records` | **2061** | 2061 | PASS |
| `grid_record_sync_map` | **2061** | 2061 | PASS |
| `grid_id IS NULL` | **327** | 327 | PASS |
| `grid_id IS NOT NULL` | **1734** | 1734 | PASS |
| live `grid_areas` (is_deleted=false) | **62** | 62 | PASS |
| active `users` | **63** | 63 | PASS |
| `grid_inspector` 角色 | **62** | 62 | PASS |
| `admin` 角色 | **1** | 1 | PASS |
| `inspector_employee_id IS NOT NULL` | **10** | 0→10（仅本次补迁批次） | PASS |
| `sync_map.conflict=true` | **0** | 0 | PASS |

基线完全符合预期（含 01-B 补迁后 2051→2061 的 +10 增量）。

---

## 4. WPS 最终数据基线（只读 API）

经 WPS 开放平台只读接口（`listAllRecords`）拉取 `file_id=cn229thwalDs` / `sheet_id=3`：

| 指标 | 实测 | 门禁 | 结果 |
| --- | --- | --- | --- |
| WPS 总记录 | **2063** | 2063 | PASS |
| 12 条差异记录存在性 | BS/BT/D_/EA/FD/FG/FT/FU/FV/FW/FN/FQ **全部存在** | 全部存在 | PASS |

WPS 数据源未被任何修改。

---

## 5. WPS-only = BT / EA（唯一未映射记录）

| 指标 | 实测 | 门禁 | 结果 |
| --- | --- | --- | --- |
| `wps_only` 列表 | `["BT","EA"]` | 仅 BT/EA | PASS |
| `wps_only` 数量 | **2** | 2 | PASS |
| 其他 WPS-only 记录 | 无 | 无 | PASS |

BT（王铁民 / L2609）、EA（谢俊章 / L2794）经人工裁定 **放弃迁入 PG、保留 WPS 原始记录**，符合 01-B 裁定。

---

## 6. 327 条 NULL grid_id 政策

| 指标 | 实测 | 结果 |
| --- | --- | --- |
| `grid_id IS NULL` 计数 | **327** | PASS（未被回填） |
| 327 条全部有 sync_map 映射 | has_syncmap=**327**，missing=**0** | PASS |
| 327 条全部落在 2026-09 | in_2026_09=**327** | PASS |
| 权限口径 | grid_inspector 不可见 / admin 可见（fail-closed） | 已验证见 §9 |

```
NULL_GRID_POLICY = FAIL_CLOSED_ACCEPTED
```

> 注：本报告 §15 同时修正了 01-B 正式报告中的笔误——原句「（307 条 = 327，逐月同口径不变）」已统一为「（逐月同口径不变）」，**仅改文档文字，未触碰任何数据库数据**。

---

## 7. 10 条人工补迁数据核验

经 PG `SELECT` + WPS 字段级复算（采用 PG-SOURCE-SWITCH-01 已验证口径，全量 2061 对 `field mismatch=0`）：

| WPS ID | 姓名 | grid_id | employee_id | PG id | 日期(中文→归一) | 同步映射 | 字段 mismatch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BS | 王铁民 | 60 | 6789 | 7183 | 2026-09-02 | ✓ sheet匹配 | 0 |
| D_ | 谢俊章 | 14 | 7437 | 7184 | 2026-09-05 | ✓ | 0 |
| FD | 刘金涛 | 6 | 6698 | 7185 | 2026年09月02日→09-02 | ✓ | 0 |
| FG | 刘金涛 | 6 | 6698 | 7186 | 2026年09月02日→09-02 | ✓ | 0 |
| FT | 刘金涛 | 6 | 6698 | 7187 | 2026年09月02日→09-02 | ✓ | 0 |
| FU | 刘金涛 | 6 | 6698 | 7188 | 2026年09月02日→09-02 | ✓ | 0 |
| FV | 刘金涛 | 6 | 6698 | 7189 | 2026年09月02日→09-02 | ✓ | 0 |
| FW | 刘金涛 | 6 | 6698 | 7190 | 2026年09月04日→09-04 | ✓ | 0 |
| FN | 黄殿兴 | 1 | 6692 | 7191 | 2026年09月01日→09-01 | ✓ | 0 |
| FQ | 黄殿兴 | 1 | 6692 | 7192 | 2026年09月04日→09-04 | ✓ | 0 |

**10/10 PASS**；grid_id / employee_id 均按「姓名 → grid_areas.personnel_id 唯一 live 网格」反查派生（非「公司管理→grid_id=1」统一规则）。

---

## 8. sync_map 完整性

| 指标 | 实测 | 门禁 | 结果 |
| --- | --- | --- | --- |
| PG → sync_map 孤儿 | **0** | 0 | PASS |
| WPS → sync_map 孤儿 | **0** | 0 | PASS |
| `conflict=true` | **0** | 0 | PASS |
| 重复 sync key (wps_record_id) | **0** | 0 | PASS |

---

## 9. own_grid 权限（独立临时实例 HTTP 真机验证，零写）

> 方法：启动独立临时 Express 实例（`PORT=5881`，进程级 `WPS_GRID_DATA_SOURCE=false`），**不触碰生产 5876**。仅执行 GET 与「被前置守卫拒绝的 DELETE」，**所有删除请求均在写入前被拦截**，验证后计数不变。

| 验证项 | 结果 | 证据 |
| --- | --- | --- |
| A (grid_inspector, grid 56, 32 条) 仅见自己网格 | PASS | `gridIds=[56]` |
| A 看不到 `grid_id=NULL`（327 条） | PASS | 列表无 NULL |
| A 记录数 = 自身网格记录数 | PASS | total=32 |
| B (grid_inspector, grid 60, 32 条) 仅见自己网格 | PASS | `gridIds=[60]` |
| A 与 B 记录互不相交 | PASS | 交集=0 |
| admin 可见全量 2061 + 327 条 NULL | PASS | total=2061, null=327 |
| **VERDICT** | **ALL_PASS (20/20)** | 计数前后 `2061/2061/62` 不变 |

---

## 10. DELETE 保护（零删除验证）

| 验证项 | 结果 | 说明 |
| --- | --- | --- |
| grid_inspector 单条 DELETE → **403** | PASS | 被拒后记录仍存在（计数=1） |
| grid_inspector DELETE ALL → **403** | PASS | 角色不足，前置拒绝 |
| admin DELETE ALL **缺 confirmText** → **400** | PASS | `PURGE_CONFIRM_REQUIRED`，删除前拦截 |
| admin 缺 confirmText 时总记录数不变 | PASS | before=2061 / after=2061（零删除） |

> 本阶段**未执行任何真实 DELETE / DELETE ALL**。

---

## 11. PG POST 身份链（代码只读核查）

权威链：`req.user.id → users.employee_id → employee.id → grid_areas.personnel_id → 唯一 grid_id`。

代码层确认（`server/routes/site-mgmt.js`）：
- L1666：「巡查人员身份由后端从当前登录用户解析；前端提交的 inspector 身份不可覆盖（fail-closed）」
- L1676：「grid_id 同样不可由前端决定（fail-closed）。客户端提交的 `gridId`/`grid_id` 被剥离」
- L1708：「grid_id 由后端按 `employee_id` 反查 `grid_areas.personnel_id` 派生（`deriveGridIdForEmployee`，fail-closed）」
- `gridScope.js`：`buildScopeSqlCondition` 在 own_grid 无网格时返回 `'1 = 0'`（不可见任何记录，fail-closed）

客户端无法伪造 `employee_id` / `inspectorEmployeeId` / `inspector_employee_id` / `gridId` / `grid_id`；DTO 不外泄 `inspector_employee_id`。

---

## 12. 前端兼容性（代码只读核查）

- 巡查台账页面：`src/views/site/grid-ledger/index.vue`，经 `src/api/hse/site.ts` 调用 `/site-mgmt/grid-records`。
- 组件内**无 `gridId`/`grid_id`/`WPS`/`PG` 逻辑分支**（仅 L312 一处 id 类型兼容注释）。`gridId` 仅是服务端返回的记录属性字段，WPS/PG 两种模式下均返回，无需前端区分。
- **结论：数据源切换只改变后端数据源，不需要前端改造。** 本阶段未修改任何前端文件。

---

## 13. WPS 当前安全风险（明确记录，不提前切换）

当前 `WPS_GRID_DATA_SOURCE=true`，WPS own_grid 仍**非 PG scope**，即此前审计发现的「WPS 分支行级范围限制不足」问题在生产 WPS 模式下仍然存在（生产实测 grid_inspector 在 WPS 模式下可见全部 2063 条，越权）。

**这正是正式切换的安全收益**：切 PG 后，生产网格巡查 CRUD 进入 PG，`own_grid` 正式生效（已在本报告 §9 零写验证中证实）。本阶段**不提前切换**，等待下一次人工明确批准。

---

## 14. Excel import 延后治理（DEFERRED，已记录）

- `/import/*` 全部端点 `requireRole('admin','safety_manager')` → **grid_inspector 无导入权限**。
- 导入网关存在「姓名 → grid_areas 模糊匹配」逻辑（`routes/import.js` L2642–2721），与禁姓名键的 own_grid 口径冲突，属**待治理项**。
- 本阶段**不修改** `/import/*`。状态：`DEFERRED`，后续单独治理。

---

## 15. 正式切换门禁表（PRODUCTION_SWITCH_GATE）

| # | 门禁 | 要求 | 结果 |
| --- | --- | --- | --- |
| 1 | 5876 正常运行 | PASS | **PASS** |
| 2 | WPS 配置未改变 | PASS | **PASS** |
| 3 | PG = 2061 | PASS | **PASS** |
| 4 | sync_map = 2061 | PASS | **PASS** |
| 5 | WPS = 2063 | PASS | **PASS** |
| 6 | WPS-only = BT/EA | PASS | **PASS** |
| 7 | PG orphan = 0 | PASS | **PASS** |
| 8 | sync orphan = 0 | PASS | **PASS** |
| 9 | conflict = 0 | PASS | **PASS** |
| 10 | NULL grid_id = 327 | PASS | **PASS** |
| 11 | 327 条未被回填 | PASS | **PASS** |
| 12 | 10 条补迁正确 | PASS | **PASS** |
| 13 | field mismatch = 0（全量 2061 对） | PASS | **PASS** |
| 14 | grid_inspector own_grid | PASS | **PASS** |
| 15 | admin all_grid | PASS | **PASS** |
| 16 | DELETE 保护 | PASS | **PASS** |
| 17 | PG create 身份派生 | PASS | **PASS** |
| 18 | 前端兼容 | PASS | **PASS** |
| 19 | WPS 未修改 | PASS | **PASS** |
| 20 | .env 未修改 | PASS | **PASS** |
| 21 | WPS_SYNC = false | PASS | **PASS** |

**21/21 门禁全部 PASS。**

---

## 终态

```
PHASE_PG_SOURCE_SWITCH_01C_READY_FOR_PRODUCTION_SWITCH
```

触发条件核对：
- ✅ 5876 正常
- ✅ 所有数据门禁 PASS
- ✅ 327 政策确认（FAIL_CLOSED_ACCEPTED，已验证权限口径）
- ✅ 无数据异常（PG 2061 / WPS 2063 / 全量字段 mismatch=0）
- ✅ 无权限异常（own_grid 20/20、DELETE 保护 403/400）
- ✅ WPS 保持只读（仅读 API）
- ✅ `.env` 未修改

## 停止条件（强制）

无论审计结果如何，本阶段完成后**必须停止**。绝对不执行：
- `PG-SOURCE-SWITCH-02`（`.env` 改 `WPS_GRID_DATA_SOURCE=false` + 重启 5876）
- 任何 `WPS_GRID_DATA_SOURCE=true → false` 操作
- 重启 5876（`systemctl` / `pm2` / `npm run start` / `nodemon` 等）

正式切换必须等待**下一次人工明确批准**。
