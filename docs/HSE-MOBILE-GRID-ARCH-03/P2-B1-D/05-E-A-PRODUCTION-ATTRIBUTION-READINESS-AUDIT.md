# HSE-MOBILE-GRID-ARCH-03 / P2-B1-D / 05-E-A
# Production Attribution Readiness Audit（生产人工归属准备度审计）

- 阶段：`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_05-E-A_PRODUCTION_ATTRIBUTION_READINESS_AUDIT`
- 性质：**READ-ONLY**（零生产 DML、零代码/配置修改、零重启、零 WPS 写）
- 审计时间：2026-09-13 15:24–15:33 CST
- 只读连接：`default_transaction_read_only=on` + `current_database()` 复核

---

## 最终结论

### 阶段结论：**PASS**（只读审计完成，11 项 STOP 条件零触发）

### 生产人工归属是否具备正式启用条件 —— **分别判断**：

| 维度 | 判定 | 说明 |
|---|---|---|
| **技术链路** | ✅ **READY** | API/事务/审计/权限/幂等/闭环（05-D-B 实证）全部就绪，pending 队列 327 条可被完整承载与操作 |
| **业务正式启用** | ⛔ **NOT READY（需业务治理先行）** | 存在 2 项 GOVERNANCE 阻塞：①生产无 hse_manager/safety_manager 真实账号（OPERATOR_GOVERNANCE_GAP）；②327 条 pending **无任何可信归属证据**（全部为 E 类），人工归属需要业务侧提供身份依据（如人工判读 + 逐条确认）；grid 126 无主需治理 |

> 「技术链路 PASS」≠「业务正式启用 READY」。两者结论如上，互不等价。

---

## 1. 05-D-B 完成状态

**PASS**（2026-09-13 15:09–15:14）：record 6797 完成 `pending → manual_confirmed → revoke → pending` 真实闭环，业务状态完整恢复基线，audit +2 保留。详见 `05-D-B-PRODUCTION-SINGLE-RECORD-ATTRIBUTION-E2E.md`。

## 2. 当前生产基线（A 点 15:24 / B 点 15:32 全等）

| 指标 | 值 | 预期 | 判定 |
|---|---|---|---|
| gir total / max(id) | 2061 / 7192 | 2061 / 7192 | ✅ |
| pending / manual_confirmed / attributed | **327 / 0 / 0** | 327 / 0 / 0 | ✅ |
| grid_id 非空 / inspector 非空 | 1734 / 10 | 1734 / 10 | ✅ |
| sync_map / bridge | 2061 / 0 | 2061 / 0 | ✅ |
| **audit_record** | **2**（05-D-B 产物） | 2 | ✅ |
| source_channel / client_token / fingerprint 非空 | 0 / 0 / 0 | 0 | ✅ |
| users by role | admin=1(active) + grid_inspector=62(active) | — | ⚠️ 见 §8 |
| grid_areas | total=63 / live=62 / owned=61 / **ownerless=1** | — | ⚠️ 见 §5 |
| employee | total=3417 / live=3401 | — | — |
| 5876 PID / health / .env | 39616 / 200 / 09-11 22:22 | 不变 | ✅ |

## 3. 327 pending 完整性

- 严格四条件（三条件 + `EXISTS sync_map`）= **327**，`JOIN sync_map` 后仍 327 → **零孤儿映射**。
- ⚠️ 规范笔误：所写表名 `grid_inspection_sync_map` 实际为 **`grid_record_sync_map`**（生产真实表名），已按实际表名执行。
- `wps_record_id` / `wps_file_id` 位于 sync_map（gir 18 列投影不含 wps id）：327 条 **wps_record_id 全部 distinct**、wps_file_id 全为 `cn229thwalDs`（单文件）。
- serial_no 全部非空（0 空）；violator_name 全 NULL。
- 样本：6797/L2572、6798/L2548、6799/L2539（inspection_date 均为 2026-08-31）。

## 4. pending 分类统计（§六，只依据现有正式数据，禁止推断）

| 类别 | 数量 |
|---|---|
| A. 有明确正式员工/网格对应关系 | **0** |
| B. 无唯一员工 | **0** |
| C. multiple grid | **0** |
| D. ownerless grid | **0** |
| **E. 无任何可信归属证据** | **327** |

论证：pending 行 inspector_employee_id 全 NULL（严格三条件）；PG 18 列投影**不含 creator**（观察字段 N/A，未采信未使用）；bridge 表 0 行。正式数据中不存在任何可推导「巡查人」身份的路径。`violator_name` 为**违规人**而非巡查人，且全 NULL，禁用于归属。

## 5. 候选员工归属能力统计（§四，只读 derive，未 Attribute）

| 状态 | 数量 | 说明 |
|---|---|---|
| **ok（唯一 live grid）** | **61** | 每 owner 恰好 1 个 live grid，全为未删除员工 |
| multiple | **0** | 零多网格员工；零多 owner 网格 |
| no_grid | **3340** | live employee 3401 中 3340 人无网格 |
| ownerless live grid | **1** | 见 §5-grid126 |

即：**当前最多 61 名员工可作为合法归属目标**（每人唯一网格），归属能力本身健康。

## 6. ownerless grid 分析（§五）

- grid_areas：live 62 个中 **61 个有 owner**、**1 个无主**。
- 多 owner 网格：**0**（无异常占用）。

## 7. grid 126 专项

```json
{"id":126, "name":"", "status":"在岗", "personnel_id":null, "emp_name":null}
```

- **OWNERLESS_GRID**：name 为空串、personnel_id=NULL、不存在对应 employee、不存在唯一合法负责人。
- 按阶段边界：**未创建 owner、未修改 grid**。若未来候选员工唯一关联该网格，attribute 将以 409 GRID_NONE fail-closed 拒绝（正确表现）。

## 8. /pending 分页风险（§七）

- 后端实现：`limit=500 / offset=0` 硬编码，`total=rows.length`；**无 page/cursor 真分页**。
- 前端：`listPendingRecords` 一次性拉取（limit 默认 500），无服务端分页 UI。
- **当前 327 条完整返回**（05-D-A 实测 total=327/rows=327，前端可获取全部数据）。
- 判定：**NON_BLOCKING_TECH_DEBT（G2 遗留）**——pending 增长超过 500 时列表将截断（计数不受影响），届时须升级为真分页。

## 9. 生产实际 operator 角色（§八）

| 角色 | 数量 | active |
|---|---|---|
| admin | 1 | 1 |
| grid_inspector | 62 | 62 |
| **hse_manager** | **0** | — |
| **safety_manager** | **0** | — |

- **真实 hse_manager 不存在；真实 safety_manager 不存在** → 记录为 **OPERATOR_GOVERNANCE_GAP**（业务治理问题，非技术缺陷）。
- 当前生产唯一可用操作人 = admin。权限模型本身（requireRole 三角色 + 403/401）已验证正确。
- 未创建/未修改任何用户。

## 10. 前后端权限一致性（§九）

- 后端 `ATTR_ROLES = ['admin','hse_manager','safety_manager']`（pending/attribute/revoke/attributed 四端点一致）。
- 前端 `/site/grid/attribution` 与 `/site/grid/attributed` 的 `authority` 均为 `['admin','hse_manager','safety_manager']` —— **与后端逐字一致**。
- grid_inspector：后端 403（05-D-A 实测）+ 前端不可见 —— **不具备人工归属权限**。未修改任何权限。

## 11. audit_record 现状（§十，只读，未删改）

| id | action | record_id | operator | old → new | changed_fields | created_at |
|---|---|---|---|---|---|---|
| 1 | attribute | 6797 | admin(1) | pending/NULL/NULL → manual_confirmed/6698/6 | status,insp,grid | 15:11:48 |
| 2 | revoke | 6797 | admin(1) | manual_confirmed/6698/6 → pending/NULL/NULL | status,insp,grid | 15:12:45 |

字段完整（module/table_name/ip_address 均在），与 05-D-B 业务快照互洽。**未删除、未修改。**

## 12. WPS zero-write / production zero-DML / PID（§十一）

- **WPS write = 0**：全程零 WPS 调用。
- **生产 DML = 0**：pgstat A/B `tup_i/u/d = 35839/73543/32249` **delta 0/0/0**；业务 13 项计数 + users/grid_areas/employee 统计 A/B 全等；audit_record 恒 2。
- **PID 39616 未变**、health=200、`.env` mtime 未变、vite.config.ts / 后端代码 / DB 结构零修改。

## 13. 风险分级汇总

| 级别 | 项 | 说明 |
|---|---|---|
| **GOVERNANCE（业务启用阻塞）** | OPERATOR_GOVERNANCE_GAP：无 hse_manager/safety_manager 真实账号 | 业务需建号并授权，否则唯一操作人为 admin（无职责分离） |
| **GOVERNANCE（业务启用阻塞）** | 327 条 pending 全部为 E 类（无可信归属证据） | 人工归属需业务侧建立身份依据流程（如人工判读记录 + 逐条确认），技术系统已就绪承接 |
| **GOVERNANCE** | grid 126 OWNERLESS_GRID（name=''，在岗） | 需业务补齐负责人；不影响其余 61 网格归属能力 |
| **TECH_DEBT（NON_BLOCKING）** | G2：/pending limit=500 无真分页 | 当前 327 完整返回；pending>500 前须升级 |
| **NON_BLOCKING** | users 状态列为 is_active、grid_areas 名称列为 name | 仅实现细节备注 |

## 14. 阶段边界声明

本阶段**未执行**任何 Attribute / Revoke / pending 处理 / 批量归属；未修改任何代码/配置/权限/用户/网格；未自动进入下一阶段。生产业务数据 A/B 全等、DML=0。

---

## 附：证据清单

- 基线：`.workbuddy/tmp/p05ea_baseline_A.json` / `p05ea_baseline.json`（B 点）
- 分析：`.workbuddy/tmp/p05ea_pending_analysis.json` + `p05ea_analysis.cjs` / `p05ea_baseline.cjs`（ro 连接）
- audit 2 条全字段只读查询输出（本报告 §11）
