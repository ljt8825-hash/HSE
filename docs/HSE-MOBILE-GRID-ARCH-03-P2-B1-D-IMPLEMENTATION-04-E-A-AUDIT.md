# HSE-MOBILE-GRID-ARCH-03 / P2-B1-D / 04-E-A
# Revoke UI 前置安全审计报告（只读，零实施）

| 项 | 值 |
|---|---|
| 阶段 | `PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_04-E-A` |
| 性质 | READ-ONLY AUDIT / IMPLEMENTATION DESIGN ONLY |
| 状态 | **`..._04-E-A_READY_FOR_REVIEW`** |
| 日期 | 2026-09-13 |
| 前置 | 04-A ✅ 04-B ✅ 04-C ✅ 04-D-A ✅ 04-D-B ✅ |
| 代码改动 | **0**（无代码 / 无 DDL / 无 DML / 无路由 / 无权限改动；未调用 revoke；未造数；未重启任何进程） |
| 数据库访问 | 仅 `safety_dashboard_dev` **纯 SELECT**（脚本 `.workbuddy/tmp/p2b1d04ea_readonly.cjs`，脚本自身声明零写入并逐句可核） |

---

## §一 审计范围与方法

只读重读以下文件并逐行核对（全部为当前工作区真实状态，非缓存记忆）：

- `server/services/gridAttributionService.js`（293 行，重点 `revokeRecord` L150–217、`insertAudit` L60–84）
- `server/routes/hse-grid-attribution.js`（121 行，重点 `DELETE /revoke` L82–100）
- `安全看板vben/apps/web-naive/src/api/hse/grid-attribution.ts`（139 行）
- `安全看板vben/apps/web-naive/src/views/site/grid/attributed/index.vue`（235 行，04-D-B 页面）
- `安全看板vben/apps/web-naive/src/router/routes/modules/hse-site.ts`
- `server/services/gridScope.js`（`deriveGridIdForEmployee`，用于 Q11 推演）
- dev 库只读取证：`audit_record` 列结构、`grid_inspection_records` 约束/触发器/状态分布、`grid_areas` live 网格 per-owner 基数
- 前端既有确认交互模式盘点（`dialog.warning` / `NModal` / `NPopconfirm`）

---

## §二 二十问逐答（Q1–Q20）

### Q1：`DELETE /api/grid-attribution/revoke` 当前真实行为是什么？

**完整链路**（`routes/hse-grid-attribution.js` L82–100 → `services/gridAttributionService.js` L152–217）：

1. 全局 `authMiddleware`（app.js 已挂）→ `requireRole('admin','hse_manager','safety_manager')`；
2. **仅读取** `body.record_id`；`body.reason` 若为字符串则**仅打 console 日志、不持久化、不参与权限**（service L155–158 注释明确「audit_record 无 detail 列，04-A 决定不新增字段」）；其余字段一律不读；
3. 服务层事务：`BEGIN` → `SELECT ... FOR UPDATE` 取真实当前状态 → 状态非 `manual_confirmed` 即 409 → 条件 UPDATE（`manual_confirmed → pending`，双身份字段置 NULL）→ 同事务直写 `audit_record` → `COMMIT`；
4. 成功返回 `{ ok:true, record_id, attribution_status:'pending' }`；任何一步失败 `ROLLBACK`（单次，catch 统一）。

### Q2：是否服务端读取旧状态，而不是相信客户端？

**是**。`revokeRecord` L165–179：`oldValue` 完全来自 `SELECT ... FOR UPDATE` 返回的数据库行（`attribution_status / inspector_employee_id / grid_id`），与客户端提交的任何字段无关。服务端连「客户端声称的旧值」这个输入通道都不存在（router 只解构 `record_id`/`reason` 两个键）。

### Q3：是否存在 `SELECT ... FOR UPDATE` 或等价并发保护？

**是**。service L165–168：

```sql
SELECT attribution_status, inspector_employee_id, grid_id
FROM grid_inspection_records WHERE id = $1 FOR UPDATE
```

行级锁串行化并发撤销：两个并发 revoke 同一 record 时，后到者阻塞在前者的 UPDATE 上，拿到锁后读到的是已提交的 `pending`，直接 409 `NOT_REVOCABLE`。

### Q4：是否存在条件 UPDATE 守卫？

**是**，双保险。L182–192 的 UPDATE 带 `WHERE id=$1 AND attribution_status='manual_confirmed'`，且 `upd.rowCount !== 1` → 409 `REVOKE_CONFLICT`。即使 FOR UPDATE 与 UPDATE 之间状态被改变（理论上同事务内不可能，防御纵深），rowCount 守卫仍然兜底。

### Q5：`manual_confirmed` 能否撤销？

**能**。这是唯一可撤销状态（L172–174 白名单式判断）。

### Q6：`attributed` 能否撤销？

**不能**。`attribution_status !== 'manual_confirmed'` 一律 409 `NOT_REVOCABLE`（「仅 manual_confirmed 状态可撤销」）。`attributed`（系统自动归属）**不可经此接口撤销**——与 04-A 冻结状态机一致。

### Q7：非法状态是否 fail-closed？

**是**，逐层：

| 输入 | 结果 |
|---|---|
| `record_id` 非正整数 | 400 `INVALID_RECORD_ID`（L153–154，connect 之前） |
| 记录不存在 | 404 `RECORD_NOT_FOUND`（L170） |
| 状态非 `manual_confirmed`（含 `attributed`/`pending`/NULL/未知值） | 409 `NOT_REVOCABLE`（L172–174） |
| rowCount≠1（并发竞态） | 409 `REVOKE_CONFLICT`（L192） |
| 任意异常 | 500 `REVOKE_FAILED` + 整事务 ROLLBACK |

无任何「尽力而为」「宽松匹配」分支。

### Q8：revoke 后 `attribution_status` 如何变化？

`manual_confirmed` → **`pending`**（L184）。不会变成 `NULL`、不会变成其他状态。

### Q9：revoke 后 `grid_id` 如何变化？

→ **`NULL`**（L186）。

### Q10：revoke 后 `inspector_employee_id` 如何变化？

→ **`NULL`**（L185）。

### Q11：revoke 后 gridScope 是否会自动重新排除？

**会，且是构造性结果**（已在 IMPL-01 实测证明过同款机制，本轮为代码推演复核）：

- `own_grid` 用户的可见谓词为 `grid_id IN (SELECT id FROM grid_areas WHERE personnel_id=$1)`；revoke 后 `grid_id = NULL` ⇒ `IN` 谓词为 NULL ⇒ **永不匹配** ⇒ 网格长/相关 own_grid 视图自动看不到该行（fail-closed，无需任何新代码）；
- 该行回到 `pending` 后**只会**出现在独立端点 `GET /grid-attribution/pending`（授权角色 = `ATTR_ROLES` 三角色）的待归属队列，等待重新归属；
- `grid_inspector` 两处都看不到（pending 页 authority + 后端 requireRole 双重排除）。

### Q12：是否写 `audit_record`？

**是**。L195–206：`action='revoke'`、`module='grid-attribution'`、`table_name='grid_inspection_records'`、`record_id`（字符串化）、`old_value`（**真实旧值** jsonb：`{attribution_status:'manual_confirmed', inspector_employee_id:<eid>, grid_id:<gid>}`）、`new_value`（`{pending, null, null}`）、`changed_fields:['attribution_status','inspector_employee_id','grid_id']`、`ip_address`。dev 实测列结构完全匹配：`old_value/new_value = jsonb`、`changed_fields = text[]`、`record_id = varchar`。当前 dev `audit_record` 该模块 **0 行**（干净基线，与 04-D-B 收尾后一致）。

### Q13：审计是否与状态更新处于同一个 DB transaction？

**是**。`insertAudit(client, ...)`（L60–84）使用**事务内同一 client** 直写，显式避开 `auditLog()/createAuditRecord()`（那些用 pool、不接事务 client、吞异常——service 文件头 L9 注释明令禁止）。审计 INSERT 失败 ⇒ catch ⇒ 整事务 `ROLLBACK` ⇒ **状态不落、审计必落，二者原子**。（`P2B1D_FORCE_AUDIT_FAIL` 仅测试故障注入开关，生产不设置。）

### Q14：前端应该显示哪些状态的撤销按钮？

**仅 `row.attribution_status === 'manual_confirmed'`**。依据：

- 后端仅允许该状态撤销（Q5/Q6）；
- 04-D-B 页面按行渲染，`attribution_status` 已在每行返回（`listAttributed` SELECT 含该列）⇒ 无需额外请求；
- `attributed` 行显示 `-`（无操作）；`pending` 行不可能出现在该页（服务端 `WHERE attribution_status IN ('attributed','manual_confirmed')` 固定，前端无需也无法过滤）。

### Q15：是否需要二次确认？

**需要**。撤销虽非物理删除（可重新归属），但它：清空身份字段、改变状态机位置、写审计、影响该行在多角色视图中的可见性。且当前**全库归属数据为空、正式使用在即**，误撤销的代价是「找回成本 = 重新走一遍归属流程」。必须二次确认，且确认内容须可辨识到**具体行**（见 Q16），不能是无信息量的通用 confirm。

### Q16：确认信息至少应该包含什么？

至少 5 项（全部来自**当前行数据**，前端已有，无需新请求）：

1. **记录 ID**（`row.id`，主键，唯一标识）；
2. **记录编号**（`row.serial_no`，业务侧人工核对键，可能为空 → 显示 `-`）；
3. **归属巡查人**（`row.inspector_name`，撤销动作的受害者主体；空 → `-`）；
4. **归属网格**（`row.grid_name` + `grid_township`，空 → `-`）；
5. **后果声明**（固定文案）：撤销后该记录状态回 `pending`、巡查人与网格归属被清空、记录回到待归属队列、需人工重新归属。

可选第 6 项见 §五「DECISION-01」。

### Q17：是否存在客户端伪造 record_id 以外参数的越权风险？

**不存在**。router L85–87 仅解构 `record_id` 与 `reason`；`reason` 不持久化、不参与权限。伪造 `old_employee_id` / `old_grid_id` / `inspector_employee_id` / `grid_id` / `attribution_status` / `operator_id` / `operator_user_id` 等任何键**都会被忽略**（连读取都没有）。旧值来源=数据库（Q2），状态迁移目标值硬编码（`pending`/`NULL`/`NULL`），无一处取自请求体。

### Q18：`grid_inspector` 是否能够调用 revoke？

**不能**。后端：`DELETE /revoke` 挂 `requireRole(...ATTR_ROLES)`（L83），`grid_inspector` 不在列表 ⇒ 403（04-B 阶段权限矩阵已实测）。前端：`/site/grid/attributed` 路由 authority 不含 `grid_inspector`（04-D-B 已落地并经 19/19 模块 filterTree 证明），04-D-B E2E 用**真实 grid_inspector 账号**实测 403 + 菜单隐藏 + fallback。

### Q19：`hse_manager / safety_manager / admin` 是否均符合预期？

**符合**。三者均在 `ATTR_ROLES`，与 04-B/04-C/04-D-B 权限口径**逐字一致**（同一常量复用，无漂移面）；`township_manager` 不在列表 → 403（by design）。DEF-A 后三个角色均可达页面路由（04-D-B 已运行时证明）。

### Q20：是否存在任何必须由用户人工确认的业务规则？

**存在 2 项，列于 §六 DECISION 区**（reason 是否入 UI、确认强度），本审计**不代选**。

---

## §三 状态机与数据流总览（冻结口径复核）

```
                    attribute (POST, 04-B)
  pending ─────────────────────────────────► manual_confirmed
     ▲                                            │
     │              revoke (DELETE, 04-B 已实现)   │  唯一可撤销边
     └────────────────────────────────────────────┘
       状态→pending；inspector_employee_id→NULL；grid_id→NULL；
       同事务审计 action='revoke'（真实旧值）

  attributed：系统归属态，不参与人工 revoke（409 NOT_REVOCABLE）
  NULL/未知状态：fail-closed，不可撤销、不可归属
```

**复核结论**：当前实现与 04-A 冻结状态机**零偏差**。Q8/Q9/Q10 与规格 §二.3/§二.4 完全一致；无自造状态、无额外迁移边。

---

## §四 数据库事实（dev 只读实测，2026-09-13 12:11）

| 事实 | 实测值 | 对 04-E 的含义 |
|---|---|---|
| `audit_record` 列 | `old_value/new_value=jsonb`、`changed_fields=text[]`、`record_id=varchar`、`operation_log_id` 可 NULL | revoke 审计模型**无需任何 DDL** 即可落库 |
| dev `audit_record`（module=grid-attribution） | **0 行** | 干净基线；04-E-B 造数后须恢复到 0 |
| gir 约束 | 仅 PK + `grid_id FK ON DELETE SET NULL`；**无 CHECK、无触发器** | ① `attribution_status` 无 DB 级保护（已登记的 G3 缺口，本阶段不处理）；② ⚠️ **半状态行陷阱依然成立**：网格被删时 `grid_id` 自动置 NULL 但状态仍是 `manual_confirmed`——**revoked 行与 FK 置空行都可能是「pending+身份空」**，撤销后回流到 pending 队列的行与 FK 事故行不可凭 NULL 组合区分，**前端/查询一律只信 `attribution_status`**（现有实现已如此） |
| dev gir 状态分布 | 全 2061 行 `attribution_status=NULL`（insp NULL=2051 / grid NULL=327） | 与 04-D-A 结论一致：stamping 未 apply ⇒ 当前**无任何 manual_confirmed 行**，04-E-B 的 E2E 必须先在 dev 造数 |
| live 网格 per-owner | 62 人 × 恰好 1 网格；`multiple` 分支 0 样本 | revoke → pending 的行**100% 可重新归属**（重新 attribute 时 `deriveGridIdForEmployee` 主路径 ok） |

---

## §五 前端最小 UI 方案（仅设计，不实施）

### 5.1 方案定位

**不新增页面、不新增路由、不新增通用组件、不新增 npm 依赖。** 全部改动收敛在 04-D-B 已归属页内——与规格 §五「pending 不应出现在已归属页面」天然满足（服务端已过滤）。

### 5.2 改动点（04-E-B 预计范围）

| 文件 | 改动 | 性质 |
|---|---|---|
| `src/api/hse/grid-attribution.ts` | 新增 `revokeRecord({record_id, reason?})`：`requestClient.delete('/grid-attribution/revoke', { data: { record_id } })` | 纯新增 |
| `src/views/site/grid/attributed/index.vue` | ① 新增**操作列**（fixed:'right'，width≈100）：`manual_confirmed` 行渲染 `NButton size=small type=warning secondary`「撤销归属」，`attributed` 行渲染 `-`；② 点击 → **`dialog.warning` 二次确认**（复用 `views/site/grid-ledger/index.vue:328-342` 的 `Promise<boolean>` 包装模式，与 04-C 的 `NModal` 相比更轻、且已有同模块先例）；③ 确认后调 API，成功 `message.success` + 当前页 `loadData()` 刷新；失败按 `err.code`/`err.message` 精准提示（`NOT_REVOCABLE` / `RECORD_NOT_FOUND` / `REVOKE_CONFLICT`，错误读取方式见 `grid-attribution.ts` 文件头约定） | 页内增量 |
| 路由 / locale / 权限 / 后端 | **零改动** | — |

### 5.3 确认弹窗内容（对应 Q16）

```
标题：撤销归属确认
内容：
  将撤销以下记录的人工归属：
    记录ID：{row.id}
    记录编号：{row.serial_no || '-'}
    归属巡查人：{row.inspector_name || '-'}
    归属网格：{row.grid_name ? `${grid_name} / ${grid_township}` : '-'}
  撤销后：状态回到「待归属」，巡查人与网格归属将被清空，
  该记录回到待归属队列，需重新人工归属。
positiveText：确认撤销    negativeText：取消
```

### 5.4 并发与边界行为（页面层）

- 弹窗打开期间数据可能过期：确认后若后端返回 `NOT_REVOCABLE`/`RECORD_NOT_FOUND`，toast 错误并 `loadData()` 刷新（行已不在已归属列表，自然消失）；
- `REVOKE_CONFLICT` 视同瞬时竞态，toast + 刷新重试由用户决定；
- **不做**批量撤销、不做撤销后跳转 pending 页、不在按钮旁展示 reason 输入（除非 DECISION-01 选 B）。

### 5.5 验证要点（04-E-B 时执行，此处仅备忘）

dev 造数（`manual_confirmed` + `attributed` 各若干）→ 按钮可见性矩阵 → 真实 revoke 落库断言（状态回 pending、双字段 NULL、审计行 old/new/changed_fields）→ `attributed` 行无按钮 → `grid_inspector` 403 → 清理恢复五项基线。

---

## §六 人工决策项（本审计不代选）

> 除以下 2 项外，**无其他人工决策项**。两项均不阻断实施路径（DECISION-01 默认不阻塞：可选 A 不加输入框）。

**DECISION-01｜撤销原因（reason）是否进入 UI？**
现状：后端接受可选 `reason` 但**仅 console 日志、不持久化**（audit_record 无 detail 列，04-A 决定不加 DDL）。
- **A（推荐·最小）**：UI 不提供 reason 输入，前端只传 `record_id`。零信息损失感（审计已有操作人/IP/前后值），零歧义。
- **B**：弹窗加可选 reason 输入框并透传——但用户须接受**该文字不落库**（仅服务端日志），存在「填了却查不到」的预期落差。
- **C**：持久化 reason ⇒ 需 `audit_record` 加列（DDL + 迁移 + 备份），**超出 04-E 最小范围**，须单独授权且建议并入 G3 一起评估。

**DECISION-02｜二次确认强度？**
- **A（推荐·最小）**：`dialog.warning` 信息确认（Q16 五要素齐全），与仓内 `grid-ledger` 清空台账同强度。
- **B**：强确认（要求手动输入记录编号匹配后才可点击确认）——更稳但交互重，仓内无先例，需引入新交互模式。

---

## §七 生产边界核查

| 项 | 结果 |
|---|---|
| 生产 5876 / PID 23396 | **未动**（实测 LISTENING 23396，全程无连接） |
| `server/.env` mtime | `2026-09-11 22:22:50` **未变** |
| 生产 DB | **零连接、零写入**（本轮仅连 dev 库 SELECT） |
| WPS / Scheduler / Pull Engine / 冻结文件 | 未触碰 |
| dev 5881/5882 | 未重启（PID 40456/40820 不变），本轮未发任何 API 请求（含 GET）——审计全部基于代码与只读 SQL，避免任何形式的写路径触发 |
| 代码 / 路由 / 权限 / 组件 | **零改动**（`git status` 与开工前一致：仅历史 3 个已授权修改文件） |
| 测试数据 | 未创建（规格 §九 禁止） |

---

## §八 结论

- **后端 revoke 模型无需任何修改即可支撑 UI**：事务 + `SELECT FOR UPDATE` + 条件 UPDATE 守卫 + 同事务真实旧值审计 + fail-closed 状态白名单，20 问中 18 问全部「已实现且正确」；
- **前端最小方案 = 2 文件纯增量**（API 函数 + 已归属页操作列/确认弹窗），零后端、零路由、零权限、零新组件；
- 2 个人工决策项（DECISION-01/02）均为交互层面选项，**无阻断**。

**【是否需要用户人工确认】需要：存在 DECISION-01（reason 是否入 UI）、DECISION-02（确认强度）两项业务决策，见 §六。**

**最终状态：`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_04-E-A_READY_FOR_REVIEW`**

本阶段到此停止。不进入 04-E-B，不实施任何 UI，不修改任何文件（本报告除外），等待下一条指令。
