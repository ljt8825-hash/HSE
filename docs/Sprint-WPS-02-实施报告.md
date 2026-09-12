# Sprint-WPS-02 实施报告

> 阶段：登录身份解析（目标 A）+ PC「网格长巡查台账」WPS 数据源切换（目标 B）
>
> 原则：先审计、后设计、再最小改造、最后验证；沿用 Sprint-WPS-01 接入层，不改登录/auth、不改 Vben Core、不改历史数据、默认零行为变化。

---

## 1. 背景与目标

### 目标 A — 登录用户 → employeeId 身份解析
系统采用 `users.id` 与 `employee.id` 两套独立序列，**无绑定字段、无 FK**；仅凭 JWT 无法直接确定当前登录人对应的员工主数据（员工姓名存在重名）。Sprint 硬约束：`明令禁止 users.id === employee.id`，且不得修改 `users` 表结构。

落地：以「真实姓名 → `v_employee_current` 严格一对一匹配」作为解析候选，成功后方得到真实 `employeeId`；失败（查无/重名/无当前任职/异常）一律 fail-closed，禁止继续创建巡查记录。

### 目标 B — PC 网格长巡查台账数据源可切换
系统当前为「PG 权威 → WPS 镜像」方向（Sprint-WPS-01 建立），PC 台账业务数据源固定为 PostgreSQL 表 `grid_inspection_records`。本 Sprint 实现在配置开关 `WPS_GRID_DATA_SOURCE`（默认 `false`）控制下，把 PC 台账各接口切换到 WPS 多维表读写；开关未开或 WPS 凭证不完整时，**完全走既有 PostgreSQL 路径，零行为变化**（fail-closed，绝不回落成隐蔽双数据源）。

---

## 2. 目标 A — 身份解析实现

### 2.1 能力分层与调用链

```text
POST /api/site/grid-records（WPS 分支，gridInspectionRepository.create）
      ↓
currentEmployeeContext.resolveCurrentEmployee(user)   ← 登录用户 → 员工上下文
      ↓
employeeResolver.resolveEmployeeByName(realName)      ← v_employee_current 严格一对一
      ↓
v_employee_current（employee_id / name / org_name / unit_name / position_name / assignment_id / is_current / is_primary / employee_deleted）
```

### 2.2 解析规则（fail-closed）
1. `user.realName` 缺失/空 → `not_authenticated`。
2. 姓名精确（`BTRIM(name)=BTRIM($1)`）查询 `v_employee_current`（过滤 `employee_deleted=false`）。
   - 0 条 → `employee_not_found`；
   - 超过 1 条 → `employee_multiple_candidates`（重名，拒绝而非随机取）；
   - 1 条但 `assignment_id` 为空（无当前有效任职）→ `no_current_assignment`；
   - 查询抛异常 → `lookup_failed`，不得放行。
3. 成功 → 返回 `{ userId, employeeId, employeeCode, employeeName, organization, operationUnit, position, gridLevel, assignmentStatus }`。
4. 对外响应仅返回固定中文 `message`（`safeMessage`），不暴露 SQL / 内部路径 / 技术细节。

> 姓名不是最终人员键，仅作解析候选；解析成功后才落地真实 employeeId。

### 2.3 对外 API
- `GET /api/current-employee`（`routes/current-employee.js`，挂载于 `app.js` 的 `/api` 全局 `authMiddleware` 之后，`req.user` 已注入）。
- 响应结构：`{ resolved: true, context }` 或 `{ resolved: false, reason, message }`。

---

## 3. 目标 B — 数据源切换实现

### 3.1 决策点与调用链

```text
site-mgmt.js（grid-records 各处理器）── isWpsGridDataSourceEnabled()? ──▶ gridInspectionRepository
                                     │（false/凭证缺→PG 原路径不变）        │
                                     │                                     ▼
                                     └──────────── 保留 PostgreSQL        wpsDbsheetAdapter ─▶ wpsClient ─▶ WPS
```

- `gridDataSource.isWpsGridDataSourceEnabled()`：唯一开启条件 = `WPS_GRID_DATA_SOURCE=true` **且** WPS 凭证齐全（`isConfigured()`）。进程内缓存一次判定；任一条件不满足返回 `false`。
- `gridInspectionRepository`：把 PC 台账既有语义适配到 WPS 多维表；**只经 adapter / wpsFieldMap / wpsGridSyncService.FIELD_MAP**，不直触 WPS 原始 API；返回前端的是既有 camelCase DTO（`PENDING` 阶段与 `site-mgmt.formatGridInspectionRow` 对齐）。

### 3.2 WPS → DTO 映射要点
- 读取列：`_pgValue` 按 `wpsGridSyncService.FIELD_MAP` 取 `pg→wps` 值，日期统一 `toIsoDate` 归一 `YYYY-MM-DD`，空→`''`。
- 图片：`_links` 经 `adapter.normalizeAttachments` 归一为 url，逗号串与 PG 的 `image_content / rectified_photo / schematic` 形态一致；**不解析 DISPIMG**。
- PG-only 字段（`reportStatus / vehicleType / violationTypeResult / needRectification / rectifier / gridId`）在 WPS 侧无对应列 → DTO 置空，前端不受影响（该功能依赖列见 §6 后续）。

### 3.3 写入（create）身份加固
- 新建时巡查人员身份由后端 `resolveCurrentEmployee(req.user)` 解析为准；前端提交的 inspector 身份 **不可覆盖**（fail-closed，禁伪造/代录）。
- 身份解析失败：抛 `IdentityError`（带 `identity` 标记 + 安全 `message`），`site-mgmt.js` catch 回中文提示，**不落任何数据**。
- 可写字段仅限 `wpsFieldMap` 中 `mode==='readwrite'` 列的 business 键（`_writableWpsName`），跳过 PG-only / 预留列，避免写到 WPS 不存在的列。
- WPS 为业务台账主数据源时**不再写 PostgreSQL，也无下行推送**（避免双写）。

### 3.4 各接口 WPS 分支（全部入口默认关闭）
| 接口 | WPS 分支行为 |
|---|---|
| `GET /grid-records` | `gridWps.list`（筛选/排序/分页，内存分页，上限 200/页） |
| `GET /grid-records/filter-options` | `gridWps.filterOptions`（areaTeam/gridLevel；reportStatus 无 WPS 列→空） |
| `POST /grid-records` | `gridWps.create`（身份校验）+ 不写 PG |
| `PUT /grid-records/:id` | `gridWps.update`（仅写可写映射字段） |
| `DELETE /grid-records` | `gridWps.remove`（按 WPS Record ID 批量删） |
| `POST /grid-records/clear` | `gridWps.clearAll`（清空 WPS 台账） |
| `GET /grid-records/:id` | `gridWps.get` |

---

## 4. 修改文件清单

| 文件路径 | 修改内容 | 修改原因 |
|---|---|---|
| `server/services/employeeResolver.js` | 新增 `resolveEmployeeByName(name)`：`v_employee_current` 按姓名严格一对一，返回完整当前行（含 assignment_id / org/unit/position）+ 失败 fail-closed | 姓名解析候选，供身份上下文使用 |
| `server/services/currentEmployeeContext.js` | 新增：`resolveCurrentEmployee(user)` + `safeMessage()`；注入式 resolver（默认 employeeResolver，便于单测）；fail-closed 分支 | 登录用户→当前员工上下文，目标 A 核心 |
| `server/routes/current-employee.js` | 新增 `GET /api/current-employee` | 暴露身份解析 API |
| `server/app.js` | 挂载 `/api/current-employee`（位于 `/api` 全局 auth 之后） | 启用身份解析端点 |
| `server/services/wps/gridDataSource.js` | 新增 `isWpsGridDataSourceEnabled()`：环境开关 + WPS 凭证完备双重判定，fail-closed，进程级缓存 | 目标 B 唯一决策点 |
| `server/services/wps/gridInspectionRepository.js` | 新增 WPS↔PC DTO 仓储：list/get/filterOptions/create/update/remove/clearAll + 身份写入 + `IdentityError` | 数据源切换落地核心 |
| `server/routes/site-mgmt.js` | 各 `grid-records` 处理器前置 `isWpsGridDataSourceEnabled()` 分支；WPS 分支不写 PG、无下行推送 | 接入目标 B，默认关零变化 |
| `server/.env.example` | 新增 `WPS_GRID_DATA_SOURCE=false` 注释模板 | 文档化开关 |
| `server/scripts/_wps_02_offline_verify.cjs` | 新增离线验证脚本（8 项断言，不依赖 WPS 凭证/不连库实时执行） | 自检 fail-closed 逻辑 |

> 未修改：登录/auth/JWT、`users` 表、Vben Core、PC「网格长巡查台账」页面与既有 PostgreSQL 查询路径、历史数据、其他模块。

---

## 5. 验证结果（离线 / 结构）

### 5.1 离线验证脚本
运行：`node server/scripts/_wps_02_offline_verify.cjs`

| 场景 | 期望 | 结果 |
|---|---|---|
| resolveCurrentEmployee 未认证（无 realName） | `not_authenticated` | ✅ |
| 查无此人 | `employee_not_found` | ✅ |
| 重名多候补 | `employee_multiple_candidates`（拒绝） | ✅ |
| 查询抛异常 | `lookup_failed`（不放行） | ✅ |
| 无当前任职（assignment_id 空） | `no_current_assignment` | ✅ |
| 成功解析 | 正确员工上下文（employeeId/operationUnit 等） | ✅ |
| WPS 记录→DTO 映射 + 日期归一 | 正确 camelCase / `YYYY-MM-DD` | ✅ |
| 身份解析失败 → create | 抛 `IdentityError`（禁止代录） | ✅ |

**结果：8 通过 / 0 失败。**

### 5.2 静态 / 结构检查
- 全部改动文件 `node --check` 通过。
- 跨模块导出核对：`wpsFieldMap.byBiz/FIELD_MAP`、`wpsGridSyncService.FIELD_MAP/toIsoDate`、`wpsDbsheetAdapter.list/get/create/update/delete/normalizeAttachments` 均存在。
- fail-closed 实测：
  - `WPS_GRID_DATA_SOURCE` 缺省 → `isWpsGridDataSourceEnabled()===false`（走 PG）✅；
  - `=true` 但 WPS 凭证缺 → `false`（回落 PG）✅。

---

## 6. 遗留项与后续（PENDING）

1. **WPS 凭证缺失**：`WPS_APP_ID/APP_SECRET/WPS_DBSHEET_FILE_ID/WPS_DBSHEET_SHEET_ID` 未配置，`isConfigured()` 为假，目标 B 当前不可真机验证；凭证就绪后需补实连联调（Schema/List/Create/Update/Delete + 回落）。
2. **`report_status` / 部分 PG-only 字段**：WPS 侧无对应列，DTO 置空；后续在 WPS 建列后再补映射（仓库已按可写列拦截，不会写到不存在列）。
3. **预留身份列**：`巡查人员ID / violatorEmployeeId` 为 `wpsFieldMap` 预留列（当前板上尚无列），WPS 建列后再写入，为未来人员选择/H5 打基础。
4. **重名在线核验**：目标 A 依赖员工姓名在 `v_employee_current` 中的唯一性；真实环境遇到重名的登录用户会返回 `employee_multiple_candidates`（fail-closed），需按业务确认名单/岗位唯一性后放行（可在接入 WPS 前用 `GET /api/current-employee` 抽查在线数据核对）。
5. **WPS 记录 ID 为字符串**：前端若对 `id` 有数值假设需兼容；当前 WPS 分支并不启用，待真机联调时一并核对前端展示。

---

## 7. 结论

- **目标 A 已完成**：登录用户 → employeeId 通过姓名严格一对一 fail-closed 解析，`users` 表与登录逻辑零改动。
- **目标 B 已完成代码落地**：PC 台账各接口已具备 WPS 数据源分支，`WPS_GRID_DATA_SOURCE` 默认 `false` → 保持 PostgreSQL 路径零变化；开关开启且凭证齐全时才切 WPS。
- 离线自检 8/8 通过；真机 WPS 联调待凭证就绪（见 §6.1）后执行。