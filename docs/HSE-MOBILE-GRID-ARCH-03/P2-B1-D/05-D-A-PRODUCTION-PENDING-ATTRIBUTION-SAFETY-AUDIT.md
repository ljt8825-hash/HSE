# HSE-MOBILE-GRID-ARCH-03 / P2-B1-D / 05-D-A
# Production Pending Attribution Safety Audit（人工归属闭环只读安全审计）

- 阶段：`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_05-D-A_PRODUCTION_PENDING_ATTRIBUTION_SAFETY_AUDIT`
- 性质：**READ-ONLY**（零生产 DML、零代码/配置修改、零重启、零 WPS 写）
- 审计时间：2026-09-13 14:57–15:05 CST
- 执行环境：生产 safety_dashboard（只读连接 `-c default_transaction_read_only=on`）+ 经正式前端 5173→5876 代理的 GET 实测

---

## 结论：**PASS**

成功标准达成：已证明 05-C 之后的 327 条 pending 队列完整、真实；`POST /attribute` 的输入白名单、服务端身份推导、状态转换、事务、并发、审计六层防护**全部构造性成立**；11 项 STOP 条件零触发。

---

## 1. 审计范围

| 对象 | 方式 |
|---|---|
| 生产 pending 队列与 05-C candidate 集合 | 只读 SQL（ro 连接）+ 集合逐 id 比对 |
| `GET /api/grid-attribution/pending` | 经 5173→5876 实测（4 角色矩阵 + 匿名） |
| `POST /api/grid-attribution/attribute` | 纯静态代码审计（router + service + deriveGridIdForEmployee） |
| revoke / attributed / 前端页面 / 路由 authority / 依赖 | 静态检查（不执行 POST/DELETE） |

## 2. 生产基线（A 点 = B 点，全程不变）

| 指标 | 值 |
|---|---|
| gir 总数 / max(id) | 2061 / 7192 |
| attribution 分布 | NULL=1734 / **pending=327** / attributed=0 / manual_confirmed=0 / rejected=0 |
| grid_id 非空 / NULL | 1734 / 327 |
| inspector_employee_id 非空 | 10 |
| client_token / source_channel / submission_fingerprint 非空 | 0 / 0 / 0 |
| sync_map / bridge / audit_record | 2061 / 0 / 0 |
| pgstat tup_i/u/d | 35837 / 73541 / 32249（**A/B delta = 0/0/0**） |
| 5876 PID | **39616（未重启）**，health=200 |
| .env mtime | 2026-09-11 22:22:50（未变） |

## 3. §一 Pending 327 核验 — PASS

- 严格三条件 `attribution_status='pending' AND inspector_employee_id IS NULL AND grid_id IS NULL`：**327**
- record_id 集合与 05-C candidate（05-B dry-run 结果文件）逐 id 比对：**strictly_equal = true**（327=327，零差异）
- 首条 id=6797（与 05-B 一致）

## 4. §二 GET /pending API 安全核验 — PASS（经 5173→5876 实测）

| 角色 | HTTP | total | rows |
|---|---|---|---|
| admin | 200 | 327 | 327 |
| hse_manager | 200 | 327 | 327 |
| safety_manager | 200 | 327 | 327 |
| grid_inspector | **403** | - | - |
| 匿名 | **401** | - | - |

- 链路证明复用 05-B0 结论（uptime 特征 + counter-delta：5173→5876→safety_dashboard）。
- ⚠️ 记录（G2 遗留，不阻塞）：`GET /pending` 为 `limit=500` 定长实现、无真分页；当前 327<500 暂不构成正确性问题。
- 注：生产无 hse_manager/safety_manager 真实账号（users=63：grid_inspector×62+admin×1），权限位验证用 admin 记录铸角色 JWT（既有约定，未修改任何 user/auth）。

## 5. §三 POST /attribute 输入白名单 — PASS

- router（`hse-grid-attribution.js:58-80`）：仅读取 `body.record_id`、`body.candidate_employee_id`；**grid_id / inspector_employee_id / attribution_status / source_channel / client_token / submission_fingerprint / operator_id / operator_employee_id 一律忽略（不读取）**。
- service（`gridAttributionService.js:87-91`）：`normalizeInt` 严格校验两参，非法即 400。
- 操作人来自 `req.user`（服务端 JWT 身份），客户端不可指定。

## 6. §三/§四 服务端身份推导 — PASS（不信任客户端）

1. candidate employee **存在性 + 未删除校验**（`SELECT id, is_deleted FROM employee WHERE id=$1`，409 EMPLOYEE_INVALID）；
2. **服务端执行 `deriveGridIdForEmployee(eid, { client })`**（fail-closed：`no_grid`→409 GRID_NONE，`multiple`→409 GRID_MULTIPLE，只有唯一 live grid 才继续）；
3. 写入的 `inspector_employee_id=eid`、`grid_id=g.gridId` **全部由服务端派生**，无任何客户端注入路径。

## 7. §四 状态转换 — PASS

- UPDATE 的 WHERE 强制 `attribution_status='pending' AND inspector_employee_id IS NULL AND grid_id IS NULL`（`gridAttributionService.js:109-123`）：
  - **NULL → manual_confirmed：不可能**（NULL 不匹配 `'pending'`）
  - **attributed → manual_confirmed：不可能**
  - **manual_confirmed → manual_confirmed（重复归属）：不可能**
  - **pending → attributed：不存在此路径**（目标状态硬编码 `'manual_confirmed'`，客户端无法指定状态）
- SET 子句仅 4 字段：`attribution_status='manual_confirmed'`、`inspector_employee_id=$2`、`grid_id=$3`、`updated_at=NOW()`；source_channel/client_token/submission_fingerprint/sync_hash 无赋值路径。

## 8. §五 事务与审计 — PASS

- 流程（`attributeRecord`）：`BEGIN → employee 校验 → deriveGrid（事务内 client）→ 条件 UPDATE（rowCount!==1 → throw → ROLLBACK）→ insertAudit（同事务 client 直写 audit_record）→ COMMIT`；catch 统一单次 ROLLBACK。
- **audit 与业务 UPDATE 同一事务**（显式注释禁止用 pool 的 `auditLog()`/`createAuditRecord()`——非原子）；审计 old/new/changed_fields 为服务端真实值。
- 故障注入开关 `P2B1D_FORCE_AUDIT_FAIL` 仅测试用，生产 `.env` 未设置。

## 9. §六 并发安全 — PASS（构造性证明）

两管理员并发 attribute 同一 pending record：
- 两事务均执行同一条条件 UPDATE；PostgreSQL 行锁使后者**阻塞等待**前者；
- 前者提交后（状态→manual_confirmed），后者的 WHERE 失配 → `rowCount=0` → 409 RECORD_NOT_PENDING → ROLLBACK；
- **不可能产生两条 manual_confirmed**，不可能产生错误 grid/inspector（grid 由服务端派生且 grid_areas 未变）。
- （revoke 侧另有显式 `SELECT ... FOR UPDATE`；attribute 的条件 UPDATE 行锁等价安全。）

## 10. §七 权限边界 — PASS

- 后端：`requireRole('admin','hse_manager','safety_manager')` 逐字一致（fail-closed 实现，auth.js:288 起）；grid_inspector **实测 403**。
- 前端路由：`/site/grid/attribution` 与 `/site/grid/attributed` 的 `authority: ['admin','hse_manager','safety_manager']`（仅可见性，安全边界在后端）；`/site` 与 `/site/grid` 祖先为 04-D-B DEF-A 既有四角色，未扩大。
- 本阶段未修改任何权限。

## 11. §八 前端安全 — PASS

- API 层（`grid-attribution.ts`）：`attributeRecord` 类型签名仅 `{ record_id: number; candidate_employee_id: number }`；注释显式禁止提交身份/状态字段。
- pending 页（`attribution/index.vue`）：candidate selector 复用现有 `getEmployeeSelectorList`（`#/api/hse/employee`），无自造身份来源。
- attributed 页（04-E-B）：仅提交 `{record_id}`。
- **零新增依赖**：package.json / pnpm-lock.yaml 无 diff；未改 Vben Core / login / auth / JWT / users；沿用 HsePageLayout/HseDataGrid 等既有组件 + Naive UI。

## 12. §九 生产零写入 / WPS 零写入证明

- 业务计数 A/B 全等（13 项指标逐项相同，见 §2）；pending=327 不变、manual_confirmed=0 不变。
- `pg_stat_database` tup_inserted/updated/deleted **A/B delta = 0/0/0**。
- 全程未调用任何 WPS 接口；Pull Engine / Scheduler 未触碰（PID 39616 持续运行）。
- 未修改文件：**0**（git 工作区 diff 均为历阶段既授权改动；本阶段仅新增审计报告与临时只读脚本）。

## 13. 风险 / 遗留项（不阻塞）

1. **G2**：`GET /pending` 无真分页（limit=500）；pending>500 时列表截断（计数正确性不受影响）。
2. **生产无 hse_manager/safety_manager 真实账号**：正式启用人工归属前需业务建号，否则实际操作人仅 admin。
3. **无主网格 id=126**（05-B 发现）：若某候选员工唯一关联该网格，attribute 会以 GRID_NONE 失败——fail-closed 正确表现，待业务治理。
4. **attribute/audit 非原子提示**：审计直写已同事务，但 `sys_operation_log` 不在 attribute 链路（无影响，记录备查）。

## 14. 下一阶段建议（05-D-B，未自行进入）

- 若业务已就绪：可进入正式「人工归属闭环」实施/试运行阶段（pending=327 队列已就绪，全部防护层已验证）。
- 建议先决：业务确认 hse_manager/safety_manager 真实账号、grid 126 治理、（可选）G2 真分页。
- 本阶段 **未执行** 任何 POST attribute / DELETE revoke；生产 manual_confirmed 仍为 0。

---

## 附：审计证据清单

- A/B 基线 JSON：`.workbuddy/tmp/p05da_baseline.json`（ro 连接 + 集合比对）
- 角色矩阵实测：admin/hse_manager/safety_manager 200×total=327；grid_inspector 403；匿名 401
- 代码定位：`hse-grid-attribution.js:47/58/83/106`（requireRole）、`gridAttributionService.js:87-148`（attributeRecord 事务）、`gridScope.js`（deriveGridIdForEmployee fail-closed）、`auth.js:288`（requireRole fail-closed）
- STOP 条件 11 项：全部未触发
