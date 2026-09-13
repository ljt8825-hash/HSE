# HSE-MOBILE-GRID-ARCH-03 · P2-B1-D-IMPLEMENTATION-04-B 报告

## 通道 B 待归属闭环 —— 人工归属 API 最小实现

- 阶段性质：**IMPLEMENTATION ONLY / DEV-FIRST**
- 状态：**`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_04-B_COMPLETED`**
- 产出日期：2026-09-13
- DEV 测试：**54/54 PASS**（§十六 A–Z 全场景）
- 生产业务写入：**0**（仅生产只读回归 SELECT）

---

## 1. 实际修改文件

| 文件 | 动作 | 说明 |
|---|---|---|
| `server/services/gridAttributionService.js` | **新增** | 人工归属核心逻辑（GET/attribute/revoke），事务 BEGIN/COMMIT/ROLLBACK，事务内直写 audit_record |
| `server/routes/hse-grid-attribution.js` | **新增** | 独立 router，3 个端点，仅 `requireRole('admin','hse_manager','safety_manager')` |
| `server/app.js` | **修改（§十五 许可的最小挂载）** | 仅新增 1 条 router mount（见 §15 diff），未改任何既有逻辑/中间件/scheduler |
| `server/scripts/_p2b1d_impl04b_devtest.cjs` | 新增 | DEV 全场景测试 A–Z + 隔离数据清理 + 生产库守卫 |
| `server/scripts/_p2b1d_impl04b_prodregress.cjs` | 新增 | 生产只读回归（仅 SELECT） |
| `server/scripts/_p2b1d_impl04b_cols.cjs` | 新增 | 一次性只读列/分布探查（已用，可留作审计脚本） |

**未修改（冻结文件，8 个 + .env）**：`wpsGridPullEngine.js` / `wps/wpsFieldMap.js` / `wps/gridInspectionRepository.js` / `authenticatedEmployeeResolver.js` / `gridScope.js` / `routes/site-mgmt.js` / `wpsGridSyncScheduler.js` / `.env`。详见 §14 冻结回归。
**未新增 npm 依赖**（express / pg 均为既有）。

---

## 2. 三个 API

### GET /api/grid-attribution/pending
- 严格条件：`attribution_status='pending' AND inspector_employee_id IS NULL AND grid_id IS NULL`（**无 OR**；`NULL` 绝不自动显示为 pending，§五/§十三）。
- 返回字段（按现有正式字段；`inspection_type` 在 `grid_inspection_records` 中**不存在**，已剔除）：`id, inspection_date, area_team, personnel_name, violation_behavior, attribution_status, created_at, updated_at`。
- 不引入新业务字段。

### POST /api/grid-attribution/attribute
- 客户端白名单仅 `record_id` + `candidate_employee_id`；`grid_id / inspector_employee_id / attribution_status / source_channel / client_token / submission_fingerprint / operator_user_id / operator_employee_id` **一律不读取、被忽略**（§七，测试 L/M/N/O 验证）。
- 服务端流程：校验 candidate employee 存在且 `is_deleted=false` → `deriveGridIdForEmployee`（fail-closed：`no_grid`/`multiple` → 409，**禁止猜测/选第一个**）→ 条件 UPDATE（仅 pending+双 NULL）→ 事务内 audit → COMMIT。
- 操作人：`req.user.id` / `req.user.username`（不要求 employee 绑定，admin.employee_id 可为 NULL，见 04-A）。

### DELETE /api/grid-attribution/revoke
- 客户端仅 `record_id`（+ 可选 `reason` 仅作审计 detail，不参与权限、**不持久化**）；严禁 `oldEmployeeId`/`oldGridId`（§十一，测试 V 验证）。
- 事务内 `SELECT ... FOR UPDATE` 取真实旧值 → 仅 `manual_confirmed → pending` 可撤销（pending/attributed/NULL → 409）→ 清空 `inspector_employee_id`/`grid_id` → audit（真实旧值）→ COMMIT。
- 不删除业务记录、不写 WPS。

---

## 3. 权限矩阵

| 角色 | GET /pending | POST /attribute | DELETE /revoke |
|---|---|---|---|
| `admin` | ✅ 200 | ✅ 200 | ✅ 200 |
| `hse_manager` | ✅ 200 | ✅ 200 | ✅ 200 |
| `safety_manager` | ✅ 200 | ✅ 200 | ✅ 200 |
| `grid_inspector` | ❌ 403 | ❌ 403 | ❌ 403 |
| `township_manager` | ❌ 403 | ❌ 403 | ❌ 403 |
| 其他 / 匿名 | 401（全局 authMiddleware） | 401 | 401 |

- 使用 `requireRole('admin','hse_manager','safety_manager')`（fail-closed，可变参数式）。
- **严禁** `requirePermission('hse:site:grid:update')` —— 该权限码 `grid_inspector` 也持有，会误放行（§四/§六）。
- 权限不经过 `gridScope`：pending 行 `grid_id=NULL`，`grid_inspector` 的 own_grid 谓词天然不匹配 → 不可见（构造性 fail-closed，04-A 已论证）。

---

## 4. 事务模型（§九/§十一）

```
pool.connect()
  BEGIN
    1. 校验 candidate employee（employee 表，is_deleted=false）
    2. deriveGridIdForEmployee(candidate, {client})  → ok / no_grid / multiple
    3. 条件 UPDATE（WHERE id=$1 AND attribution_status='pending' AND inspector_employee_id IS NULL AND grid_id IS NULL）
       rowCount !== 1 → throw ApiError(409)
    4. INSERT audit_record（同事务 client，非 pool helper）
  COMMIT
catch → ROLLBACK（单次） → 返回 ApiError 或 500
finally → client.release()
```
- revoke 增加 `SELECT ... FOR UPDATE` 串行化并发撤销，取真实旧值供审计。
- **关键约束 H1**：审计直写当前事务 `client`，**不复用** `auditLog()` / `createAuditRecord()`（两者用全局 pool 且吞异常、非原子，04-A 已确认）。

---

## 5. audit_record 字段

复用现有 `audit_record` 表（**未新增任何列**，04-A 结论）。本阶段写入：

| 列 | 值 |
|---|---|
| `operation_log_id` | `NULL` |
| `user_id` | `req.user.id`（操作人，非客户端伪造） |
| `username` | `req.user.username` |
| `module` | `'grid-attribution'` |
| `table_name` | `'grid_inspection_records'` |
| `record_id` | `String(id)` |
| `action` | `'attribute'` / `'revoke'` |
| `old_value` (jsonb) | attribute：`{attribution_status:'pending', inspector_employee_id:null, grid_id:null}`；revoke：事务内真实库值 |
| `new_value` (jsonb) | attribute：`{attribution_status:'manual_confirmed', inspector_employee_id, grid_id}`；revoke：`{attribution_status:'pending', inspector_employee_id:null, grid_id:null}` |
| `changed_fields` (text[]) | `['attribution_status','inspector_employee_id','grid_id']` |
| `ip_address` | `req.ip` |

> 注：`reason` 仅 `console.log` 到服务端（表无 detail 列，04-A 决定不新增字段）。

---

## 6. 并发测试（§十二/§十六 P）

两个 admin 同时 POST attribute 同一 pending 记录：
- 条件 UPDATE + `rowCount` 守卫 → 一个 `200`，另一个 `409`。
- 验证结果：**恰一个 200 一个 409**，最终仅一次 `manual_confirmed`，无重复状态变化、无 audit 缺失。
- 撤销并发同理：`FOR UPDATE` 串行化，第二个 revoke 见 `pending` → 409。

---

## 7. no_grid 测试（§八/§十六 I）

candidate employee 无 live 网格（DEV 真实 `employee.id=9958`）：POST attribute → **409 `GRID_NONE`**，记录保持 pending 不变。

---

## 8. multiple 测试（§八/§十六 J）

DEV 无真实多网格员工（0 样本），故创建**临时** `employee` + 2 个 `grid_areas`（personnel_id 指向它），清理时一并删除。POST attribute → **409 `GRID_MULTIPLE`**，记录保持 pending 不变。`multiple` 分支在真实数据零样本下经造数验证。

---

## 9. revoke 测试（§十一/§十六 S/T/U/V/W/Y）

- S：`manual_confirmed` → DELETE revoke → **200**，重置 `pending` + `inspector/grid=NULL` + audit `action=revoke`。
- T：`pending` → 409。U：`attributed` → 409。
- V：携带伪造 `oldEmployeeId/oldGridId` → **200**（服务端忽略客户端 old\*，仍按真实库值重置）。
- W：audit `old_value` 等于事务内真实库值（inspector/grid 与 candidate 派生一致）。
- Y：revoke 后再 POST attribute → **200**（可重新归属）。

---

## 10. client spoof 测试（§七/§十六 L/M/N/O）

POST attribute 携带 `{grid_id:99999, inspector_employee_id:88888, attribution_status:'manual_confirmed', source_channel:'wps_form', client_token:'x', submission_fingerprint:'y', operator_user_id:123, operator_employee_id:456}`：
- 结果记录 `grid_id` = 服务端派生（非 99999）、`inspector_employee_id` = candidate（非 88888）、`attribution_status='manual_confirmed'`（服务端定）。
- audit `user_id` = 操作人 `1`（非伪造 123）。
- N：对非 pending 记录附带伪造 `attribution_status:'pending'` → 仍 **409**（服务端未读取客户端 attribution_status 绕过守卫）。

---

## 11. rollback 测试（§九/§十六 R）

测试开关 `P2B1D_FORCE_AUDIT_FAIL=true` 强制审计 INSERT 抛错：
- POST attribute → **500**，记录 **回滚保持 pending**，audit_record 无残留行。
- 证明「审计失败 → 整事务 ROLLBACK」，业务标记与审计原子一致。

---

## 12. DEV 数据清理（§十九）

harness `finally` 精确删除本阶段创建的全部隔离数据：
- `grid_inspection_records WHERE id = ANY(<test ids>)`（共 20+ 行，含 pending/confirmed/attributed/NULL 各场景）
- `grid_areas WHERE id = ANY(<temp grid ids>)`（multiple 测试临时 2 网格）
- `employee WHERE id = ANY(<temp emp ids>)`（multiple 测试临时员工）
- 无测试上传文件、无残留 pending、无污染生产/WPS。复跑前后 DEV `attribution_status` 分布均为全 NULL（2061）。

---

## 13. 生产只读回归（§十七）

连接 `safety_dashboard`（与运行 5876 服务同实例、独立只读连接），仅 SELECT：

| 指标 | 实测 | 基线(§十七) | 结论 |
|---|---|---|---|
| gir row_count | 2061 | 2061 | ✅ |
| MAX(id) | 7192 | 7192 | ✅ |
| grid_id 非 NULL | 1734 | 1734 | ✅ |
| inspector 非 NULL | 10 | 10 | ✅ |
| both-null | 327 | 327 | ✅ |
| sync_map count | 2061 | 2061 | ✅ |
| conflict | 0 | 0 | ✅ |
| attribution_status 非 NULL | 0 | 0 | ✅ |
| source_channel 非 NULL | 0 | 0 | ✅ |
| client_token 非 NULL | 0 | 0 | ✅ |
| submission_fingerprint 非 NULL | 0 | 0 | ✅ |
| attachment 非 NULL | 0 | 0 | ✅ |
| bridge rows | 0 | 0 | ✅ |

生产**零业务写入**；新 router / app.js 挂载未加载到运行中的 5876 服务（需用户重启后端方能生效，见 §未解决问题）。

---

## 14. 冻结文件回归（§十八）

| 文件 | mtime | 本阶段 |
|---|---|---|
| `server/.env` | 2026-09-11 22:22:50 | 未改 |
| `wpsGridPullEngine.js` | 2026-09-11 08:39:40 | 未改 |
| `wps/wpsFieldMap.js` | 2026-09-11 08:14:02 | 未改（05-H-0 常量见下） |
| `wps/gridInspectionRepository.js` | 2026-09-08 20:29:23 | 未改 |
| `authenticatedEmployeeResolver.js` | 2026-09-10 14:49:40 | 未改 |
| `gridScope.js` | 2026-09-10 19:19:23 | 未改 |
| `routes/site-mgmt.js` | 2026-09-12 16:41:31 | 未改 |
| `wpsGridSyncScheduler.js` | 2026-09-11 16:29:00 | 未改 |
| `server/app.js` | 2026-09-13 08:24:05 | **本阶段按 §十五 改（1 条挂载）** |

05-H-0 常量（`wpsFieldMap.js`）：`SYNC_PROJECTION_ORDER`(:107) / `SYNC_HASH_COLUMNS`(:118) / `PROTECTED_COLUMNS=['grid_id','inspector_employee_id']`(:127) **完全不变**。
生产进程：`5876 → PID 23396` 未动（未重启、未停止）。

---

## 15. app.js diff（§十五）

仅新增 1 条独立 router mount，**未改动任何既有代码逻辑、中间件顺序、启动逻辑、scheduler**：

```diff
 app.use('/api/site-mgmt', siteMgmtRoutes);
+// 阶段 P2-B1-D-IMPLEMENTATION-04-B：通道 B 待归属人工归属（独立 router，不动既有逻辑/中间件/scheduler）
+const gridAttributionRoutes = require('./routes/hse-grid-attribution');
+app.use('/api/grid-attribution', gridAttributionRoutes);
 app.use('/api/wps-grid-sync', require('./routes/wps-grid-sync'));
```

> 生效条件：当前运行的 5876 服务（PID 23396）需在用户侧重启以加载新 router；重启前新 API 在生产不暴露。

---

## 16. 未解决问题 / 风险

- **部署生效**：新 router 需重启后端（PID 23396）才在生产生效 —— 属用户侧运维动作，本阶段不自动重启（符合 05-H-0 红线）。
- **admin.employee_id=NULL（P3 历史遗留）**：审计以 `user_id` 记录操作人，符合 04-A Option A；若业务要求职责分离，须新建 `hse_manager`/`safety_manager` 实际用户（当前生产中 0 个）。
- **multiple 真实样本**：生产中 `multiple` 分支 0 样本，已在 DEV 造数验证 409；上线后如遇真实多网格员工，需业务决定归属网格。
- **reason 不持久化**：仅服务端日志；如需落库需后续阶段新增 audit_record 列（本阶段按 04-A 决议不新增字段）。
- **生产 apply 未执行**：本阶段性质为「实现 + DEV 验证」，未对生产做任何业务写入；生产 pending 数据仍 0。

---

## 17. 下一阶段建议

- **激活**：用户重启后端使新 router 生效；建议配合 P2-B1-D-IMPLEMENTATION-03 的 stamping worker（生产 apply 仍需你单独授权 `--target=prod --apply --confirm-production`）产生真实 pending 数据。
- **可进入 04-C / 04-D / 05**（前端 pending 列表与归属操作页、Attachment、client_token 生成等），须你明确授权。
- **P2/P3 前置**仍未决：独立 stamping worker 接受度（P2）、admin 运维操作人绑定（P3）。

---

## 22. 最终停止（§二十二）

**`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_04-B_COMPLETED`** —— 未自动进入 04-C / 04-D / 05 / P2-C / P2-D；未执行生产归属、未接 scheduler、未改造 Mobile/WPS Form/Attachment/client_token。等待下一条明确指令。
