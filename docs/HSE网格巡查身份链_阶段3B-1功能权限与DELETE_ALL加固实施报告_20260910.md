# HSE 网格巡查身份链 · 阶段3-B-1 实施报告
## 网格巡查功能权限收紧 + DELETE ALL 高危接口加固

- **项目**：`G:\hse-dashboard`
- **报告日期**：2026-09-10
- **前置状态**：`PHASE_3A_COMPLETED_READY_FOR_3B`（阶段0/1/2 已完成）
- **实施范围**：仅"批次1"——功能权限收紧 + DELETE ALL 三层加固
- **最终状态**：`PHASE_3B1_COMPLETED_READY_FOR_PHASE_4`

---

## 1. 执行摘要

本阶段在**不破坏当前 WPS 生产路径**（`WPS_GRID_DATA_SOURCE=true`）的前提下，对 `grid-records` 全部 6 个端点补齐**功能权限门禁**，并将高危的 `DELETE /grid-records/all`（清空全部台账）升级为 **requirePermission + requireRole + confirmText 三层保护**，且 PG / WPS 双分支**共用同一道门禁**（门禁位于数据源分叉之前，WPS 的 `gridWps.clearAll()` 无法绕过）。

实施前 `site-mgmt.js` 中 6 个端点**零功能权限、零数据范围**（仅全局登录中间件），任意登录用户可增删改全量 2051 条记录，且"清空全部"无权限、无范围、无二次确认，属 `HIGH_RISK`。本阶段已消除该风险。

改动文件仅 2 个：
- `server/middleware/auth.js`：在既有 `ROLE_PERMISSIONS_MAP` 中新增 4 个网格专用权限码并分配至相应角色。
- `server/routes/site-mgmt.js`：为 6 个端点挂 `requirePermission`；重写 `DELETE /grid-records/all` 为三层保护。

所有历史数据、WPS 数据、`.env`、JWT/auth 中间件、前端均**零修改**。阶段0/1/2 回归全部通过。

---

## 2. 实际修改文件

| 文件 | 改动类型 | 内容 |
| --- | --- | --- |
| `server/middleware/auth.js` | 修改（权限码） | `HSE_MANAGER_PERMISSIONS` 新增 `hse:site:grid:create/update/delete/purge`；`township_manager` 新增 `create/update/delete`；`manager` 新增 `create/update`；`viewer` 不新增任何 grid 码 |
| `server/routes/site-mgmt.js` | 修改（门禁） | 6 个 `grid-records` 端点挂 `requirePermission`；`DELETE /grid-records/all` 重写为三层保护（L1735-1785）；新增常量 `GRID_PURGE_CONFIRM_TEXT='清空全部台账'`（L29） |

**未修改（mtime 佐证，均早于本阶段 17:30）**：
`routes/auth.js`(08-05)、`services/authenticatedEmployeeResolver.js`(09-10 14:49)、`services/currentEmployeeContext.js`(09-08)、`services/employeeResolver.js`(09-08)、`services/wpsGridSyncService.js`(09-08)、`services/wps/gridInspectionRepository.js`(09-08)、`services/wps/wpsFieldMap.js`(09-08)、`server/.env`(仅被读取，两开关值未变)。

---

## 3. 每个权限码的最终授予角色

权限码推导机制（`middleware/auth.js`）：`requirePermission(code)` → `getPermissionsForRole(req.user.role)` → `ROLE_PERMISSIONS_MAP[role]`，`system_admin` 持 `['*']` 通配放行。

| 权限码 | system_admin | admin | safety_manager | hse_manager | township_manager | manager | viewer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hse:site:grid:view` | ✓(*) | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `hse:site:grid:create` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `hse:site:grid:update` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `hse:site:grid:delete` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `hse:site:grid:purge` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |

说明：
- `hse:site:grid:view` 在阶段3-B-1 之前已存在，本阶段保持。
- `create/update/delete/purge` 为本次新增。
- **township_manager**：按阶段3-A 冻结方案授予 `create/update/delete`，**不授予 purge**（清空全部属高危，留给 admin/system_admin）。
- **manager**：仅 `create/update`，**不授予 delete 与 purge**。
- **viewer**：不授予任何 grid 操作码 → 对所有网格端点 403（符合指令预期）。
- **DELETE ALL 额外叠加 `requireRole('system_admin','admin')`**：即使某角色持 `grid:purge`，若非 `system_admin`/`admin` 仍被第二层拦截（见第6节）。

---

## 4. 6 个端点的最终权限映射

| 方法 + 路径 | 功能权限 | 数据范围 | 代码位置 |
| --- | --- | --- | --- |
| `GET /api/site-mgmt/grid-records` | `hse:site:grid:view` | 无（批次1 不含 row scope） | L1450 |
| `GET /api/site-mgmt/grid-records/filter-options` | `hse:site:grid:view` | 无 | L1553 |
| `POST /api/site-mgmt/grid-records` | `hse:site:grid:create` | 无（身份由阶段2 后端派生） | L1631 |
| `PUT /api/site-mgmt/grid-records/:id` | `hse:site:grid:update` | 无（身份不可变，阶段2 冻结） | L1583 |
| `DELETE /api/site-mgmt/grid-records` | `hse:site:grid:delete` | 无 | L1696 |
| `DELETE /api/site-mgmt/grid-records/all` | `hse:site:grid:purge` + `requireRole('system_admin','admin')` + `confirmText` | 无 | L1740-1785 |

> 注：本批次**仅为功能权限**，未引入 `own_grid`/`org_grid`/`gridScope`（属阶段3-B-2+）。`POST` 的 `inspector_employee_id` 仍由阶段2 的 `resolveAuthenticatedEmployeeFromRequest` 后端派生，门禁不影响该逻辑。

---

## 5. DELETE ALL PG / WPS 双分支保护结果

`DELETE /grid-records/all` 的三层门禁**在路由定义处（数据源分叉之前）统一挂载**，因此无论 `gridDataSourceMode()` 返回 `pg` 还是 `wps`，权限校验都先于实际删除：

```
router.delete('/grid-records/all',
  requirePermission('hse:site:grid:purge'),   // 第一层：功能权限
  requireRole('system_admin', 'admin'),        // 第二层：高权限角色
  async (req, res) => {
    // 第三层：confirmText 二次确认（早于 gridDataSourceMode 分叉）
    if (!req.body || req.body.confirmText !== GRID_PURGE_CONFIRM_TEXT) return res.status(400)...
    const dsClear = gridDataSourceMode(res);
    if (dsClear === 'wps') { const deleted = await gridWps.clearAll(); ... }   // WPS 分支
    if (!isConnected()) { ...内存模式... }
    const result = await pool.query('DELETE FROM grid_inspection_records');     // PG 分支
    await pool.query('UPDATE grid_areas SET completion_rate = 0');              // 完成率归零
  }
);
```

**双分支实测结论（见第7节测试）**：
- WPS 分支（`WPS_GRID_DATA_SOURCE=true`，`gridWps.clearAll` 被 stub 替换）：E1-E5 证明在权限/角色/confirmText 任一不满足时，`clearAll` **从未被调用**；E6/E7 三层全过时 `clearAll` 恰好被调用 1 次（stub，非真实删除）。
- PG 分支（进程级 override `WPS_GRID_DATA_SOURCE=false`）：D5 证明 confirmText 正确后进入删除逻辑，事务内 `grid_inspection_records` 被清空、`grid_areas.completion_rate` 归零；ROLLBACK 后生产数据不变。
- **二者共用同一道门禁**，不存在"PG 有保护、WPS 无保护"的缺口。

审计保留：`purgeMeta` 仅记录 `userId/username/role/action/module/dataSource`（**不含密码/token/phone**），成功与失败均落 `auditLog`。

---

## 6. requirePermission / requireRole / confirmText 三层保护证明

| 层级 | 机制 | 失败响应 | 失败码 | 验证用例 |
| --- | --- | --- | --- | --- |
| 第一层 | `requirePermission('hse:site:grid:purge')` | 403 | 缺少权限: hse:site:grid:purge | C1/C2（无 purge 角色）、E1/E2/E3（WPS 分支） |
| 第二层 | `requireRole('system_admin','admin')` | 403 | 权限不足 | C3（hse_manager 持 purge 但角色不符）、E3 |
| 第三层 | `req.body.confirmText === '清空全部台账'` | 400 | PURGE_CONFIRM_REQUIRED | D1 缺失 / D2 错误 / D3 尾部空格 / D4 英文大写 / E4/E5 |

三层**顺序固定**：先权限（requirePermission）→ 再角色（requireRole）→ 最后 confirmText（在 handler 内、早于数据源分叉）。任一层不满足即短路返回，绝不进入删除逻辑。

**关键边界验证**：
- `hse_manager` 持有 `grid:purge`（第一层通过），但因非 `system_admin`/`admin` 被**第二层**拦截（C3/E3：403，确认角色层生效）。
- `township_manager` 持 `grid:delete` 但无 `grid:purge`，被**第一层**拦截（C2/E2：403，确认 purge≠delete）。
- `manager` 持 `create/update` 无 purge，被第一层拦截（C2）。
- confirmText 严格 `===` 全匹配：尾部空格、英文、大写均 400（D3/D4），杜绝模糊匹配绕过。

---

## 7. 测试结果

### 7.1 PG 分支真机测试（34/34 PASS）
测试手法：进程级 `process.env.WPS_GRID_DATA_SOURCE='false'`（不落盘）→ 真实 Express 挂载真实 `site-mgmt` 路由 → `db.pool.query` 重定向到事务 client → 全程事务、ROLLBACK 零残留。脚本：`server/scripts/_phase3b1_pg_test.cjs`，产物：`output/phase3b1-pg-test.json`。

| 分组 | 用例 | 结果 |
| --- | --- | --- |
| Case0 | 数据源判定为 PG | PASS |
| A1-A2 | admin GET list / filter-options → 200 | PASS |
| A3-A4 | admin POST（eid=NULL 与已绑定均未被功能权限拒绝）→ 200 | PASS |
| A5-A6 | admin PUT / DELETE → 200 | PASS |
| B1-B6 | viewer GET/GET-opts/POST/PUT/DELETE/DELETE-ALL 全部 → 403 | PASS |
| C1 | township_manager（有 delete 无 purge）DELETE ALL → 403 | PASS |
| C2 | manager（有 create/update 无 purge）DELETE ALL → 403 | PASS |
| C3 | hse_manager（有 purge 但角色不符）DELETE ALL → 403（命中第二层） | PASS |
| C4 | hse_manager GET → 200 | PASS |
| D1-D4 | confirmText 缺失/错误/尾部空格/英文大写 → 400 | PASS |
| D5 | confirmText 正确 → 进入删除逻辑 200；事务内台账清空、completion_rate 归零 | PASS |
| 计数 | users/employee/grid_inspection_records/sync_map 前后一致；inspector_employee_id 仍全 NULL；admin.employee_id 仍 NULL | PASS |

### 7.2 WPS 分支真机测试（22/22 PASS）
测试手法：进程级 override `WPS_GRID_DATA_SOURCE=true`，并将 `gridWps.clearAll` 替换为 stub（记录调用次数，不真实删除）。脚本：`server/scripts/_phase3b1_wps_test.cjs`，产物：`output/phase3b1-wps-test.json`。

| 分组 | 用例 | 结果 |
| --- | --- | --- |
| Case0 | 数据源判定为 WPS；clearAll 已被 stub 替换 | PASS |
| E1 | viewer DELETE ALL → 403；clearAll 未被调用 | PASS |
| E2 | township_manager DELETE ALL → 403；clearAll 未被调用（持 delete 不放行 purge） | PASS |
| E3 | hse_manager DELETE ALL → 403；命中第二层；clearAll 未被调用 | PASS |
| E4 | admin confirmText 缺失 → 400；clearAll 未被调用 | PASS |
| E5 | admin confirmText 错误 → 400；clearAll 未被调用 | PASS |
| E6 | admin 三层全过 → 200；clearAll 调用 1 次（stub）；响应标注 WPS 分支 | PASS |
| E7 | system_admin 三层全过 → 200；clearAll 调用 1 次 | PASS |
| 零写 | WPS 分支未写 PG（grid_inspection_records 不变）；sync_map 不变；completion_rate 未被 PG 分支归零；admin.employee_id 仍 NULL | PASS |

> 结论：WPS 分支的 `gridWps.clearAll()` **无法绕过**三层门禁（E1-E5 中 clearAll 调用次数均为 0），且即便通过也只触达 stub，未真实清空 WPS。

---

## 8. 数据库核心计数

执行前 / 执行后（ROLLBACK 后复核）完全一致，本阶段未对任何业务表做 INSERT/UPDATE/DELETE：

| 表 | 计数 | 备注 |
| --- | --- | --- |
| `public.users` | 1 | 无新增账号 |
| `public.employee` | 3041 | 未变 |
| `public.grid_inspection_records` | 2051 | 未变（未清空） |
| `public.grid_record_sync_map` | 2051 | 未变 |
| `public.grid_areas` | 62 | 未变 |
| `grid_inspection_records WHERE inspector_employee_id IS NOT NULL` | 0 | 历史身份未回填 |
| `grid_inspection_records WHERE grid_id IS NULL` | 327 | 即 WPS-03-B 迁入批次，未变 |

---

## 9. WPS 数据零修改证明

- `server/.env`：`WPS_GRID_DATA_SOURCE=true`（L100）、`WPS_GRID_SYNC=false`（L101）—— 与阶段2 末次完全一致，未被切换。
- `server/services/wps/*`（`gridInspectionRepository` / `wpsFieldMap` / `wpsGridSyncService`）未修改（mtime 均为 09-08）。
- 测试全程未发起任何真实 WPS 写入；WPS 分支测试以 stub 替换 `clearAll`，调用次数可观测且非破坏性。
- `grid_record_sync_map` 行数保持 2051；`grid_areas.completion_rate` 在 WPS 测试后未被 PG 分支归零（值为 3，即测试前原值）。

---

## 10. admin.employee_id 未修改证明

- 查询 `public.users WHERE username='admin'`：`role='admin'`、`is_active=true`、`employee_id=NULL`、`must_change_password=false`。
- 本阶段未执行任何 `UPDATE users`；未创建测试绑定；未给 admin 写入 employee_id。
- 所有回归与功能测试均证明 admin 以 `employee_id=NULL` 正常通过全部门禁（admin 持 `*` 级权限，不依赖 employee_id）。

---

## 11. 阶段0/1/2 回归结果

| 阶段 | 脚本 | 结果 |
| --- | --- | --- |
| 阶段0 | `_phase0_apply_verify.cjs` | `PHASE_0_VERIFY_PASS`（三列结构、部分唯一索引、UNIQUE 事务测试 ROLLBACK、admin 零影响、行数零变更全部 PASS） |
| 阶段1 | `_phase1_identity_test.cjs` | `PHASE_1_TEST_PASS (22/22)`（解析器无姓名兜底、无 JWT 引用、无写操作） |
| 阶段2 | `_phase2_pg_create_test.cjs` | `PHASE_2_TEST_PASS (26/26)`（PG 创建身份后端派生、前端字段防覆盖、PUT 身份不可变、fail-closed、WPS 零影响） |

> 阶段2 回归在本阶段新增 `requirePermission` 门禁后**仍 26/26 通过**——证明门禁未破坏身份链：阶段2 测试用户均为 `role:'admin'`（持全部 grid 码），权限校验 next() 放行，身份派生逻辑不变。

---

## 12. 未实施事项（严格按指令冻结）

以下均**未实施**，留待后续阶段，本批次未扩展：
- `own_grid` / `org_grid` / `gridScope` 数据范围行级权限
- `grid_id` 后端自动派生（新建记录归属网格）
- `grid_inspector` 数据库角色实际落地（仅在本阶段 `ROLE_PERMISSIONS_MAP` 中预留权限码，未建角色）
- 62 个网格负责人账号创建
- `users.employee_id` 批量绑定（含 admin）
- 历史 327 / 1724 / 12 条身份数据回填
- WPS 身份链迁移（仍走 `currentEmployeeContext` 姓名兜底）
- PG / WPS 数据源切换（`WPS_GRID_DATA_SOURCE` 保持 true）
- `must_change_password` 逻辑实现
- 任何 JWT / authMiddleware / login / 前端 / 菜单 / 数据库 DDL 修改

---

## 13. 已知观察项（仅记录，不修改）

1. **DB `roles` 表与代码 `ROLE_PERMISSIONS_MAP` 不一致**（继承自阶段3-A）：数据库 `roles` 表仅有 3 个角色，代码运行时使用 7 个角色；`roles`/`user_role`/`role_menu` 三表不参与接口鉴权，仅驱动菜单。`auth.js` 对未知角色静默降级为 `viewer`（潜在风险，不在本批次范围）。
2. **`GRID_RECORD_CREATE_CAMELS` 不含 `gridId`**（阶段3-A 已发现，影响后续阶段）：当前 PG 新建记录的 `grid_id` 恒为 NULL。若后续做网格维度行级 scope，须由后端按 `inspector_employee_id` 反查本人网格**服务端派生** `grid_id`，不能依赖前端提交（且 `EDITABLE` 白名单也不含 `grid_id`，事后无法补）。
3. **327 条 `grid_id=NULL` 记录**（即 WPS-03-B 迁入批次）：WPS 不携带网格外键，无法在源侧归属。行级 scope 阶段须对其单独处理（如归入"无网格归属"视图或按巡查人维度兜底）。
4. **`inspector_employee_id` 当前填充率为 0**：阶段2 仅确保"新建 PG 记录由后端派生写入"的机制就绪，历史 2051 条均未回填。巡查人维度在回填完成前**不能**作为 scope 依据；阶段3-B-2 的 scope 应首选"网格负责人"维度。
5. **viewer 对全部 grid 端点 403**：符合指令预期（viewer 不持任何 grid 码），但若生产环境存在 viewer 账号且需只读查看台账，需在上线评审中确认是否授予 `hse:site:grid:view`。

---

## 14. 最终状态

```text
PHASE_3B1_COMPLETED_READY_FOR_PHASE_4
```

- 6 个端点功能权限门禁全部就位；`DELETE ALL` 三层保护（purge 权限 + 高权限角色 + confirmText）对 PG / WPS 双分支生效。
- 所有真机测试通过：PG 34/34、WPS 22/22；阶段0/1/2 回归全绿。
- 生产数据零变更：核心计数不变、`inspector_employee_id` 全 NULL、`admin.employee_id` 仍 NULL、`.env` 两开关未变、WPS 零写入。
- **上线前置依赖（阶段4）**：本批次为"只收紧不放松"，admin/system_admin 持 `['*']` 不受影响；但一旦进入阶段4 切换 PG 数据源或绑定账号，须同步完成 employee_id 绑定，否则未绑定账号将被阶段2 的 fail-closed（403）挡在 PG 新建门外。

---

> 本阶段严格停止于"批次1"。未自动进入阶段4 / grid_inspector 账号创建 / employee_id 绑定 / gridScope / grid_id 派生 / own_grid / 历史数据处理 / WPS-PG 切换。下一阶段须等待明确指令。


