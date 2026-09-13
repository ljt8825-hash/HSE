# HSE-MOBILE-GRID-ARCH-03 · P2-B1-D-IMPLEMENTATION-04-A 审计报告

> 阶段名称：通道 B 待归属闭环 —— 人工归属操作人 / 权限 / 审计前置审计
> 阶段性质：**READ-ONLY AUDIT ONLY**（本阶段零业务实现、零数据写入）
> 目标库：`safety_dashboard`（5876 / PID 23396）
> 审计时间：2026-09-13
> 最终状态：**`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_04-A_READY`**

---

## 0. 执行概要 / 结论

本阶段对「谁有资格对通道 B `pending` 数据做人工归属」做了纯只读审计，覆盖身份链、`users/employee`、权限中间件、网格派生、审计机制、事务模式、并发与撤销模型。

**结论：人工归属所需的 6 项前置（操作人 / 权限 / employee 身份 / employee→grid / 审计 / 事务）均已明确，可进入 API 实现阶段（`04-B`）。** 但有 3 个必须在实现阶段落地的硬约束和一个业务待决项：

- **H1（原子审计）**：现有 `auditLog()` / `createAuditRecord()` 用全局 `pool` 且 `catch` 吞异常，**不可**直接复用于人工归属事务。未来 API 必须用事务 `client`（`pool.connect → BEGIN → UPDATE → INSERT audit_record → COMMIT`）自行写审计，`audit_record` 表结构已满足。
- **H2（admin.employee_id IS NULL）**：唯一真实管理操作人 `admin`（id=1）的 `employee_id` 为 `NULL`。审计只能可靠记录 `operator_user_id` / `operator_username`（来自 JWT `req.user`），**无法**记录 `operator_employee_id`。采用 **方案 A**。
- **H3（hse_manager / safety_manager 实际用户 = 0）**：两角色在代码中已定义，但生产 0 个用户。当前唯一可执行归属的是 `admin`。若业务要求「职责分离（操作人 ≠ 网格归属对象）」，须另行创建这两个角色的用户——不在本阶段范围。

---

## 1. 当前用户 / 角色实际情况（生产实测）

来源：`SELECT role, COUNT(*), COUNT(employee_id), SUM(employee_id IS NULL), is_active FROM users GROUP BY role`

| role | total | with_employee_id | null_employee_id | active |
|------|-------|-------------------|-------------------|--------|
| grid_inspector | 62 | 62 | 0 | 62 |
| admin | 1 | **0** | **1** | 1 |
| hse_manager | 0 | 0 | 0 | 0 |
| safety_manager | 0 | 0 | 0 | 0 |

- **真实管理操作人**：仅 `admin`（id=1，username=`admin`，role=`admin`，`employee_id=NULL`，active）。
- 62 名 `grid_inspector` 全部绑定 `employee_id`（活跃）。
- **`hse_manager` / `safety_manager` 在生产中不存在任何用户**——角色「定义存在」但实际「用户不存在」，二者必须分开报告。

---

## 2. admin.employee_id 实际状态

- `users.id=1`（admin）：`employee_id = NULL`、`is_active = true`、`real_name = '管理员'`。
- 因此 `authenticatedEmployeeResolver.resolveAuthenticatedEmployee(1)` 会命中 `EMPLOYEE_NOT_BOUND`（403）——即 admin 作为「被解析的员工」会失败，但**这不影响 admin 作为「操作人」**：操作人身份来自 JWT `req.user`（含 `id`/`username`/`role`），不依赖 `employee_id`。
- 结论：`employee_id` 缺失只影响「admin 自身作为巡查人员」的场景，**不影响「admin 作为归属操作人」**。归属业务只需要操作人 `user_id`，不需要操作人 `employee_id`。

---

## 3. authenticatedEmployeeResolver 审计

文件：`server/services/authenticatedEmployeeResolver.js`（FROZEN，本阶段未读改）

链路（严禁旁路）：`req.user.id → public.users.id → users.employee_id → public.employee.id`

- 红线：禁止姓名兜底；`employee_id IS NULL` 即失败（fail-closed）；不改 JWT/auth/login；`employee_id` 不进 JWT（每次实时查库）。
- 返回：`{ ok, userId, employeeId, employeeName }` 或 `{ ok:false, code, httpStatus, message }`。
- **对归属的意义**：
  - 作为「操作人」解析：不适用（操作人用 `req.user.id` 即可，无需走此解析器）。
  - 作为「被归属候选员工」解析：本阶段归属的**目标**是客户端提交的 `candidate_employee_id`，再由 `deriveGridIdForEmployee` 派生 `grid_id`，**不**经此解析器（解析器面向「当前登录用户→巡查人员」）。
- 结论：可复用，但归属场景不需要它解析操作人；候选员工的合法性校验改由 `deriveGridIdForEmployee` + 显式存在性检查完成。

---

## 4. 权限 middleware 审计

文件：`server/middleware/auth.js`（FROZEN，未改）

- `requireRole(...roles)`：可变参数 / 数组式；**fail-closed**（角色集合为空或含非法值整体拒绝）；未认证 401、角色不符 403。
- `requirePermission(code)`：基于 `ROLE_PERMISSIONS_MAP` 角色→权限码映射；`system_admin` 为 `'*'` 通配。
- `ROLE_PERMISSIONS_MAP`：`admin` / `hse_manager` / `safety_manager` 三者均持 `HSE_MANAGER_PERMISSIONS`（含 `hse:site:grid:view/create/update/delete/purge`）。
- `grid_inspector` 也持有 `hse:site:grid:view/create/update`（**不含 delete/purge**）。
- **关键判定**：若用 `requirePermission('hse:site:grid:update')` 作归属权限码，会把 `grid_inspector` 也放进来——**错误**。归属操作必须排除 `grid_inspector`。
- **推荐**：归属三端点统一用 `requireRole('admin','hse_manager','safety_manager')`（语义精确、零改动、fail-closed，且天然排除 `grid_inspector` 与 `township_manager` 的「误操作归属」）。与 `P2-B1-D-IMPLEMENTATION-01` 报告建议一致。

---

## 5. employee → grid 审计（deriveGridIdForEmployee）

文件：`server/services/gridScope.js`（FROZEN，未改）

- `deriveGridIdForEmployee(employeeId)`：`SELECT id FROM grid_areas WHERE personnel_id=$1 AND is_deleted=false ORDER BY id`
  - 0 个 live grid → `no_grid`；1 个 → `ok`(+gridId)；>1 个 → `multiple`（禁止猜测，调用方应 409）。
- 生产实测（`grid_areas`）：62 网格、0 删除、62 个 distinct `personnel_id`、**每人恰好 1 个 live grid**，`personnel_with_multiple_live_grids = 0`。
- **结论**：该函数可直接复用；当前 `ok` 路径 100% 可达，`multiple` 分支**零样本**（实现阶段须造数验证，`no_grid` 亦须造数验证）。客户端**永不允许**提交 `grid_id`，`grid_id` 只由该函数后端派生。

---

## 6. gridScope 审计（§九 安全边界）

文件：`server/services/gridScope.js`

- `resolveGridScope(ctx)`：`ALL_GRID_ROLES = [system_admin, admin, hse_manager, safety_manager, township_manager]` → `scopeType='all_grid'`；`OWN_GRID_ROLES=[grid_inspector, manager]` → `own_grid`。
- `buildScopeSqlCondition(scope)`：`all_grid` 返回 `null`（无限制）；`own_grid` 用 `grid_id IN (SELECT id FROM grid_areas WHERE personnel_id=$n AND is_deleted=false)`；无网格/none → `'1 = 0'`（fail-closed）。
- **pending 可见性（§十四）构造性结论**：pending 行 `grid_id IS NULL`，`own_grid` 谓词 `grid_id IN (...)` 遇 `NULL` 永不匹配 ⇒ `grid_inspector` 天然看不到 pending（fail-closed，非新代码）。`all_grid` 角色（admin/hse_manager/safety_manager/township_manager）无限制 ⇒ 可见全部 pending。
- **WPS 不产生权限**：creator / 巡查人员ID / 所属网格 / grid_id 均不决定操作权限。最终授权 = `req.user.role`（requireRole）→ 范围 = `gridScope`（仅决定列表可见性，pending 因 grid_id NULL 对 own_grid 不可见）。WPS 字段**绝不**参与授权。
- 结论：`gridScope` 可复用，归属列表端点复用 `resolveGridScope`+`buildScopeSqlCondition` 即可，不改冻结文件。

---

## 7. sys_operation_log 审计

- 表 17 列：`id, module, action, target_id, target_type, operator, ip, detail, created_at, user_id, username, description, ip_address, user_agent, status_code, detail_json, ...`
- 写入函数 `auditLog()`（`routes/audit.js`）：用**全局 `pool`**、`try/catch` 吞异常（`console.error` 后不抛出）、参数取 `req.user.id/username`。
- 当前活跃 **4587 行**。
- **问题**：用 `pool` 而非事务 `client`、且吞异常 ⇒ **不能**与人工归属 `UPDATE` 放在同一事务里保证原子性。

---

## 8. audit_record 审计

- 表存在，**当前 0 行**，13 列：`id, operation_log_id, user_id, username, module, table_name, record_id, action, old_value(jsonb), new_value(jsonb), changed_fields(text[]), ip_address, created_at`。
- 写入函数 `createAuditRecord()`（`routes/hse-audit-records.js`）：同样用**全局 `pool`**、`catch` 返回 `null`（吞异常）。
- **关键：该表已具备细粒度前后值审计能力**（`old_value`/`new_value`/`changed_fields`），**完全满足**未来人工归属「记录本次把记录改成 pending/归属给谁」的需求。**无需新增任何字段**。
- 但同样的原子性问题：必须改用事务 `client` 写入，不能直接用 `createAuditRecord()` 的 pool 路径。

---

## 9. transaction 审计（原子性）

- 成熟模式在其它路由存在（`routes/accidents.js` 等多处）：
  ```js
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    /* UPDATE / INSERT 业务 */
    await client.query('INSERT INTO audit_record (...) VALUES (...)', [...]); // 用 client
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
  ```
- **推荐未来归属 API 事务结构**：
  ```
  BEGIN
    UPDATE grid_inspection_records
      SET inspector_employee_id=$cand, grid_id=$derived,
          attribution_status='manual_confirmed', updated_at=NOW()
      WHERE id=$id
        AND attribution_status='pending'
        AND inspector_employee_id IS NULL
        AND grid_id IS NULL        -- 条件 UPDATE，rowCount 守卫
    IF rowCount != 1 → ROLLBACK + 409(已被他人处理/状态变化)
    INSERT audit_record(user_id, username, module, table_name, record_id,
                        action, old_value, new_value, changed_fields, ip_address)  -- 用同一 client
  COMMIT
  ```
- **严禁**复用 `auditLog()`/`createAuditRecord()` 的全局 pool 路径进入该事务。应在归属服务内用事务 `client` 直接写 `audit_record`（表结构已满足，无需新字段）。

---

## 10. 并发模型（§十一）

- 两个管理员（当前实际仅 1 个 admin）同时操作同一 pending：
  ```
  UPDATE ... WHERE id=$id AND attribution_status='pending'
                AND inspector_employee_id IS NULL AND grid_id IS NULL
  ```
  - `rowCount=1` → 成功；`rowCount=0` → 已被他人处理/状态已变 → 409。
- 禁止「先 SELECT 再无条件 UPDATE」。条件 UPDATE + `rowCount` 守卫即可天然串行化。
- 该模式已在 `P2-B1-D-IMPLEMENTATION-03` 的 H（并发）场景用隔离数据实测通过。

---

## 11. revoke 模型（§十二）

- 仅允许 `attribution_status='manual_confirmed' → 'pending'`；**不得**撤销 `attributed`；**不得删除数据**。
- 请求**不信任**客户端提交的 `oldEmployeeId/oldGridId`：
  ```
  BEGIN
    SELECT 当前 inspector_employee_id, grid_id, attribution_status  -- 用 client，校验仍为 manual_confirmed
    IF 状态 != 'manual_confirmed' → ROLLBACK + 409
    UPDATE grid_inspection_records
      SET inspector_employee_id=NULL, grid_id=NULL,
          attribution_status='pending', updated_at=NOW()
      WHERE id=$id AND attribution_status='manual_confirmed'
    INSERT audit_record(..., action='revoke', old_value, new_value)
  COMMIT
  ```
- 客户端只提交 `record_id`（及可选撤销理由进 `detail`）。

---

## 12. pending 可见范围（§十四）

- `grid_inspector`（own_grid）：pending 行 `grid_id IS NULL` ⇒ `grid_id IN (...)` 永不匹配 ⇒ **不可见**（构造性 fail-closed，非新代码）。
- `admin/hse_manager/safety_manager/township_manager`（all_grid）：无 SQL 限制 ⇒ **可见全部 pending**。
- **推荐**：pending 列表端点用 `requireRole('admin','hse_manager','safety_manager')` 做操作授权，列表可见性复用 `resolveGridScope`+`buildScopeSqlCondition`（all_grid 全量、own_grid 因 grid_id NULL 得空）。`township_manager` 是否能「看」pending 为可选项，本阶段建议**先不放宽到 township_manager 的操作权**（仅 admin/hse_manager/safety_manager 可归属）。

---

## 13. 推荐操作人方案（§五 三选一）

**选 方案 A（记录 operator_user_id）**，理由：

1. 复用现有身份模型：操作人身份已由 JWT 注入 `req.user = {id, username, role, realName}`，`auditLog()`/`createAuditRecord()` 历来取 `req.user.id/username`——与现有审计习惯一致。
2. 不新建「系统操作人」概念（否决方案 C，避免新增复杂身份体系）。
3. 不强制绑定 employee（否决方案 B 的硬门槛）：因为归属业务只要求「操作人被授权 + 审计可追溯」，并不要求操作人自身是巡查人员。`admin.employee_id=NULL` 不应阻断归属操作。
4. **`operator_employee_id` 处理**：审计中如项目字段允许，写入 `req.user.employee_id`（admin 为 `NULL`，如实记录 `NULL`）；若无该字段则仅记 `user_id`。

> 透明披露：由于 admin 无 employee 绑定，审计对 admin 操作**只能可靠记录 user_id/username，不能记录 employee_id**。这是现有系统身份模型的真实约束，非缺陷，不因此新增身份体系。

---

## 14. 推荐权限方案

- 归属三端点（`GET /pending`、`POST /attribution`、`DELETE /revoke`）统一前缀（建议新 router，如 `routes/hse-grid-attribution.js`，**不改动冻结 `site-mgmt.js`**）：
  - 挂载顺序：在 `app.js` 注册（属后续 `04-B` 阶段，本阶段不改 `app.js`）。
  - 每个端点：`authMiddleware` → `requireRole('admin','hse_manager','safety_manager')` → 业务逻辑。
- 列表可见性：`resolveGridScope` + `buildScopeSqlCondition`（all_grid 全量；own_grid 因 pending grid_id NULL 自然为空）。
- 复用既有权限码 `hse:site:grid:*` 仅作参考；**操作授权用 `requireRole` 而非 `requirePermission`**，以避免把 `grid_inspector` 误放进归属操作。

---

## 15. 推荐审计方案

- 复用 `audit_record` 表（已满足 old/new/changed_fields，0 行待填）。
- 在归属服务内用**事务 `client`** 直接 `INSERT audit_record`（不调全局 pool 的 `createAuditRecord()`），保证与业务 `UPDATE` 同事务原子。
- 审计字段：`user_id=req.user.id`、`username=req.user.username`、`module='grid_attribution'`、`table_name='grid_inspection_records'`、`record_id=归属记录id`、`action='attribute'|'revoke'`、`old_value={attribution_status, inspector_employee_id, grid_id}`、`new_value=更新后值`、`changed_fields=['attribution_status','inspector_employee_id','grid_id']`、`ip_address=req.ip`。
- 可选补充：在 `sys_operation_log` 记一条粗粒度操作日志（同样应走事务 `client`；若用现有 `auditLog()` 则接受其非原子、仅作旁路）。

---

## 16. 是否需要新增任何 DB 字段

**否。** `audit_record` 已含 `user_id/username/table_name/record_id/action/old_value/new_value/changed_fields/ip_address`，足以审计本次归属。无需为「操作人」新增 `operator_employee_id` 列（`user_id` 足以追溯；admin 的 `employee_id` 为 NULL 如实留空）。

---

## 17. 是否需要修改 users

**否。** 不修改 `users` / `employee` / `employee_assignment` / JWT / login / auth。操作人身份取自 JWT `req.user`。`admin.employee_id=NULL` 现状保留，不影响归属（仅影响审计能否记 employee_id，已按方案 A 处理）。

> 业务待决（不在本阶段）：若要求「职责分离」，须由业务侧另行创建 `hse_manager` / `safety_manager` 用户；当前 0 个，导致唯一可执行归属者为 `admin`。

---

## 18. 是否可以直接进入 API 实现

**可以（READY）。** 六前置全部明确：

| 前置 | 状态 | 落地方式 |
|------|------|----------|
| 操作人 | ✅ | JWT `req.user.id`；方案 A 记 user_id |
| 权限 | ✅ | `requireRole('admin','hse_manager','safety_manager')`（冻结文件不改） |
| employee 身份 | ✅ | 候选 `employee_id` 由客户端提交 + `deriveGridIdForEmployee` 派生 grid |
| employee→grid | ✅ | 复用 `deriveGridIdForEmployee`（ok/no_grid/multiple，fail-closed） |
| audit | ✅ | 复用 `audit_record` 表 + 事务 `client` 直写 |
| transaction | ✅ | `pool.connect → BEGIN → UPDATE → INSERT audit_record → COMMIT` 成熟模式 |

进入 `04-B` 前须遵守的硬约束：**H1（事务内写审计，不复用 pool helper）、H2（admin 审计只记 user_id）、H3（职责分离需另建用户）**。

---

## 19. 风险清单

- **R1｜admin.employee_id=NULL**：审计对 admin 仅能记 `user_id/username`，不能记 `employee_id`。可接受（方案 A），但须明确写入报告/UI 提示，避免误以为「操作人已绑定员工」。
- **R2｜hse_manager/safety_manager 0 用户**：唯一可执行归属者为 `admin`，无职责分离。若合规要求分离，须业务建用户。
- **R3｜审计非原子**：现有 `auditLog()`/`createAuditRecord()` 用 pool 且吞异常，**严禁**进归属事务；必须用事务 `client` 直写 `audit_record`。
- **R4｜deriveGridIdForEmployee `multiple` 零样本**：当前 62 owner 各 1 grid，`multiple`/`no_grid` 分支未在生产样本验证；`04-B` 须造数覆盖。
- **R5｜pending 对 own_grid 不可见是构造性结果**：非显式代码，确认正确（fail-closed），但实现列表端点时勿「为让网格长看到 pending」而反向写 `grid_id`（会破坏冻结 `PROTECTED_COLUMNS`）。
- **R6｜并发**：条件 UPDATE + `rowCount` 守卫已可串行化；双管理员实测环境仅 1 admin，但逻辑对多操作人通用。

---

## 20. 下一阶段建议

1. **进入 `P2-B1-D-IMPLEMENTATION-04-B`**（API 实现，需用户明确授权）：
   - 新增独立 router（不改 `site-mgmt.js`/`app.js` 既有逻辑，仅在 `app.js` 注册新路由——属 `04-B`）。
   - `GET /api/grid-attribution/pending`：`requireRole(admin,hse_manager,safety_manager)` + `gridScope` 可见性。
   - `POST /api/grid-attribution/attribute`：body `{ record_id, candidate_employee_id }`；事务内 `deriveGridIdForEmployee` → 条件 UPDATE → 写 `audit_record`。
   - `DELETE /api/grid-attribution/revoke`：body `{ record_id }`；仅 `manual_confirmed→pending`，事务内 SELECT 校验 + UPDATE + 审计。
   - 客户端**绝不**提交 `grid_id` / `inspector_employee_id` / `attribution_status` / `source_channel` / `client_token` / `submission_fingerprint`。
2. `04-B` 必须 DEV 造数覆盖：正常归属、幂等、已归属保护、`no_grid`/`multiple` 分支、并发双操作人、revoke 仅 manual_confirmed、冻结回归（9 文件 + `.env` + 05-H-0 常量）。
3. **不进入** `P2-C` / `P2-D` / `IMPLEMENTATION-05`，等待下一条明确指令。

---

## 附录 A：冻结回归（本阶段只读，零写入）

- 9 冻结文件 + `.env` mtime 与任务前一致（无任何文件被修改）：
  - `.env` 2026-09-11 22:22:50 / `app.js` 2026-09-09 22:38:15 / `site-mgmt.js` 2026-09-12 16:41:31 / `wpsGridPullEngine.js` 09-11 08:39 / `wpsFieldMap.js` 09-11 08:14 / `gridInspectionRepository.js` 09-08 20:29 / `authenticatedEmployeeResolver.js` 09-10 14:49 / `gridScope.js` 09-10 19:19 / `wpsGridSyncScheduler.js` 09-11 16:29
- 05-H-0 常量未变：`SYNC_PROJECTION_ORDER`(:107) / `SYNC_HASH_COLUMNS`(:118) / `PROTECTED_COLUMNS=['grid_id','inspector_employee_id']`(:127)
- `.env` 开关未变：`PORT=5876` / `WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=true` / `SCHEDULER_ENABLED=true`
- 生产进程 `5876 → PID 23396` 未动。
- 生产数据零变化（只读 SELECT）：gir=2061 / sync_map=2061 / MAX(id)=7192 / pending=0 / conflict=0 / attribution_status 全 NULL。

## 附录 B：审计脚本

- `server/scripts/_p2b1d_impl04a_introspect.cjs`（只读 introspection，含 `current_database()='safety_dashboard'` 守卫）
