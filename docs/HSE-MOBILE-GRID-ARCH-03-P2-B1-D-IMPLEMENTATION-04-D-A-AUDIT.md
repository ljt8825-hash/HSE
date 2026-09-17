# HSE-MOBILE-GRID-ARCH-03 P2-B1-D-IMPLEMENTATION-04-D-A
# 已归属记录管理 —— Revoke UI 前置只读审计报告

- **阶段**：`P2-B1-D-IMPLEMENTATION-04-D-A`
- **性质**：**READ-ONLY AUDIT / IMPLEMENTATION DESIGN ONLY**（未写任何业务代码、未改任何数据库、未重启任何服务）
- **阶段状态**：`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_04-D-A_READY`
- **执行日期**：2026-09-13
- **证据库**：`safety_dashboard_dev`（读）+ `safety_dashboard`（只读对照）
- **结论摘要**：审计完成。**未发现阻断项**。发现 **1 项 04-C 遗留可达性缺陷（DEF-A，latent）** 与 **5 项技术缺口（G1–G5）**，均已给出最小方案，**本阶段未实施**。

---

## 一、当前已归属数据模型

### 1.1 权威表：`grid_inspection_records`（gir）

实测（dev 与 prod **结构完全一致**，33 列）：

| 列 | 类型 | 可空 | 归属语义 |
|---|---|---|---|
| `id` | integer | NO | PK，`nextval` 序列；**当前 max(id)=7192**（legacy 高水位） |
| `attribution_status` | text | YES | **归属状态机唯一载体**（P2-B2 扩展列） |
| `inspector_employee_id` | bigint | YES | 归属后的巡查人（**无 FK**） |
| `grid_id` | integer | YES | 归属后的网格（**FK → `grid_areas(id)` ON DELETE SET NULL**） |
| `source_channel` | text | YES | 通道标记（P2-B2 扩展列） |
| `client_token` | text | YES | 部分唯一索引 `WHERE client_token IS NOT NULL` |
| `submission_fingerprint` | text | YES | 业务重复候选 |
| `attachment_resolution_status` | text | YES | 附件解析状态 |
| `inspection_date` | date | YES | 巡查日期（业务时间） |
| `area_team` / `personnel_name` / `violation_behavior` | varchar / varchar / text | YES | 台账展示字段 |
| `created_at` / `updated_at` | **timestamp without time zone** | NO | `now()` 默认 |

> ⚠️ **`created_at` / `updated_at` 是 `timestamp without time zone`**（无时区）。任何按时间范围过滤/清理的谓词**不得使用 timestamptz 字面量**（历史坑见 §19 附录 R7）。

### 1.2 扩展列是「28 + 5」结构

gir 33 列 = 原有 28 列 + **5 个 P2-B2 扩展列**（`attribution_status`、`source_channel`、`client_token`、`submission_fingerprint`、`attachment_resolution_status`）。

### 1.3 关联表

| 表 | 列数 | 与归属的关系 |
|---|---|---|
| `grid_record_sync_map` | 12 | 技术幂等映射（`(wps_record_id, wps_file_id)`）；时间列为 **timestamptz** |
| `grid_areas` | — | 62 行 / **62 distinct `personnel_id`**（每人恰好 1 网格） |
| `employee` | — | live 3401 行（员工选择器基数） |
| `audit_record` | 13 | **归属/撤销的唯一权威时间来源**（见 §14） |
| `wps_account_employee_map` | — | 桥接表，**0 行**（身份链未闭合，本阶段无影响） |

### 1.4 ⭐ 关键事实：归属数据当前**全库为空**

`attribution_status` 分布（dev 与 prod **逐字相同**）：

| attribution_status | 行数 | 有 inspector | 有 grid |
|---|---|---|---|
| **`NULL`** | **2061** | 10 | 1734 |
| `pending` | **0** | — | — |
| `manual_confirmed` | **0** | — | — |
| `attributed` | **0** | — | — |

- gir 总计 **2061** 行；`min(id)=4954`、`max(id)=7192`。
- 扩展列非空计数：`attribution_status=0`、`source_channel=0`、`client_token=0`、`submission_fingerprint=0`、`attachment_resolution_status=0`；仅 `inspector_employee_id=10` / `grid_id=1734`（**均为 legacy 数据，非通道 B 归属产物**）。
- `audit_record` = **0 行**（dev 与 prod 均 0）。
- 历史 NULL 组合（复核一致）：both-null **327** / grid-only **1724** / inspector-only **0** / both-set **10**。

> **⭐ 最重要的运行事实**：**通道 B 的「待归属」与「已归属」在全库（含生产）都还没有任何真实数据。**
> 原因：Pull Engine 只写 18 列投影（**不含** `attribution_status`）⇒ 新回流行拿到的是 **`NULL` 而非 `'pending'`**；而打标（stamping worker）尚未接线（`gridEnrichmentService.js` 全仓**零引用**，实测确认）。
> ⇒ **04-D 的「已归属」列表在实施后仍会是空的**，除非：① dev 造数验证；② 生产执行 stamping（需单独授权）；③ 管理员先经 04-C 完成人工归属（但 04-C 的 pending 列表同为 0 行，需先有 pending）。
> **这直接决定了 04-D-B 的验收方式：必须先用造数（dev）验证，不能指望真实数据。**

---

## 二、`manual_confirmed` 状态分析

### 2.1 语义

`manual_confirmed` = **管理人员经 04-C 页面人工归属成功**后的终态（`gridAttributionService.attributeRecord` 的 `SET attribution_status='manual_confirmed'`）。

### 2.2 写入路径（唯一）

```
POST /api/grid-attribution/attribute  →  attributeRecord()
  BEGIN
    1. employee 存在且 is_deleted != true            （否则 409 EMPLOYEE_INVALID）
    2. deriveGridIdForEmployee(eid)                  （no_grid→409 GRID_NONE / multiple→409 GRID_MULTIPLE）
    3. UPDATE gir SET attribution_status='manual_confirmed',
                     inspector_employee_id=$eid, grid_id=$grid, updated_at=NOW()
       WHERE id=$rid AND attribution_status='pending'
         AND inspector_employee_id IS NULL AND grid_id IS NULL
       → rowCount!==1 ⇒ 409 RECORD_NOT_PENDING
    4. INSERT audit_record（同事务 client，action='attribute'）
  COMMIT
```

**不变量**（由步骤 3 的 WHERE 保证）：`manual_confirmed` ⇒ 写入当刻 `inspector_employee_id` 与 `grid_id` **均非空**。

### 2.3 是否可以安全查询

✅ **可以，且天然安全**：
- `attribution_status='manual_confirmed'` 是**单列等值谓词**，无 `NULL` 歧义（`NULL = 'manual_confirmed'` 为 NULL，不会误纳）。
- 行数上限 = 人工操作次数，规模天然极小。
- **不需** `inspector IS NOT NULL AND grid IS NOT NULL` 作为守卫（那反而会漏行，见 §6.3 的 FK 边角）。

### 2.4 ⚠️ 状态机无数据库级约束（G3）

- 实测 gir **约束仅 2 条**：`PRIMARY KEY(id)` + `FOREIGN KEY(grid_id)`。
- **`attribution_status` 上无 `CHECK` 约束**、**无索引**。
- ⇒ 状态合法性**完全依赖应用层 SQL**（service 的 WHERE 守卫），DB 层无法阻止越权 UPDATE 写入任意字符串。
- ⇒ 未来任何人（脚本/运维）直写 `attribution_status='attributed'` 都不会被数据库拒绝。**这是设计缺口，非当前缺陷。**

---

## 三、`attributed` 状态分析

### 3.1 语义

`attributed` = **自动归属成功**（由 enrichment/stamping 环节判定，非人工）。

依据 `services/wps/gridEnrichmentService.js:23`：
```
attribution_status : pending | attributed   （绝不出 failed —— 无可信来源可判定失败）
```
以及 `:183` `w.attribution_status = result.attribution.status; // pending | attributed`

### 3.2 当前是否可达

❌ **不可达**：
- `gridEnrichmentService.js` 在本仓**零引用**（`grep -rn "gridEnrichment" --include='*.js' server/` 无结果）。
- 全库 `attributed` 计数 = **0**。
- ⇒ 「自动归属」通道**尚未接线**（与 ARCH-03 记忆一致：接线方式＝独立 enrichment worker，仍未实施）。

### 3.3 对 04-D 的影响（重要）

| 问题 | 答复 |
|---|---|
| 本阶段能否把 `attributed` 纳入「已归属」列表？ | **可以且应当纳入**（只读查询，零风险） |
| 能否针对 `attributed` 提供 revoke？ | **不可以**。用户已明确 04-D 第一版**只允许 `manual_confirmed → pending`**（§七.7）；且 service 已硬编码 `if (row.attribution_status !== 'manual_confirmed') throw NOT_REVOCABLE`。 |
| 列表是否需要区分来源？ | **需要**。UI 必须能区分「人工归属」与「自动归属」，否则用户无法判断哪条可撤销。 |

> **设计结论**：查询层 `attribution_status IN ('manual_confirmed','attributed')`；**操作层仅 `manual_confirmed` 显示「撤销」按钮**，`attributed` 显示为不可撤销（或直接不渲染按钮），并在文案中标注「自动归属」。**不要**为了统一而放宽后端 revoke 的状态机。

---

## 四、已有查询能力（逐项实测）

### 4.1 后端：全仓 `attribution_status` 引用清单（完整）

| 文件 | 用途 | 是否可复用为「已归属查询」 |
|---|---|---|
| `services/gridAttributionService.js` | `getPendingRecords()`（严格 pending）/ `getPendingCount()` / `attributeRecord` / `revokeRecord` | ❌ 只有 pending，**无 manual_confirmed/attributed 查询** |
| `services/wps/gridEnrichmentService.js` | 写 `pending`/`attributed`（**未接线，死代码**） | ❌ 无查询 |
| `routes/hse-grid-attribution.js` | 3 个端点（pending/attribute/revoke） | 见 §6 |
| `routes/site-mgmt.js` | 台账 `GET /grid-records`（`SELECT *`，**无 attribution 过滤**） | ❌ 见 §4.3 |
| 其余 routes/controllers/middleware/config | **无任何引用** | — |

> **实测命令**：`grep -rn "manual_confirmed\|attribution_status" --include='*.js' routes controllers middleware config utils` → 仅命中 `hse-grid-attribution.js` 的注释一行。

### 4.2 前端：现有消费面

| 位置 | 内容 |
|---|---|
| `api/hse/grid-attribution.ts` | `getPendingAttributionRecords()` / `attributeRecord()`；**无 attributed 查询** |
| `views/site/grid/attribution/index.vue` | 仅 pending 列表 + 归属弹窗 |
| 其余全仓 | `attribution_status` 仅出现在上述两文件 |

### 4.3 ❌ 最接近的既有台账 API 也不能复用（G1）

`GET /api/site-mgmt/grid-records`（`views/site/grid-ledger` 与 `views/site/violation/ledger` 在用）：

✅ 有真实分页（`page`/`pageSize`/`total`/`truncated`）、服务端排序白名单、`gridScope` 行级过滤。
❌ **四条硬阻断**：

1. **`site-mgmt.js` 是冻结文件**（八类禁：冻结组件禁改）⇒ 无法为其增加 `attribution_status` 参数。
2. **参数集不含 `attribution_status`**（仅 `keyword/areaTeam/gridLevel/reportStatus/month/hasViolation/hasRectifiedPhoto`）⇒ 无法筛出已归属。
3. **权限码不匹配**：`requirePermission('hse:site:grid:view')`，而 **`grid_inspector` 亦持有该码**（实测 `middleware/auth.js:446`）⇒ 与「grid_inspector 不得进入归属管理」的边界冲突。
4. **返回体不含归属字段**：`GridInspectionRecord`（`api/hse/site.ts:99`）含 `gridId`，**不含** `attribution_status` / `inspector_employee_id`。

### 4.4 ✅ 意外收获：审计轨迹**已有真实分页查询**（可直接复用）

`GET /api/hse/audit-records/records`（`server/routes/hse-audit-records.js`，挂载 `app.js:562`）：

| 能力 | 实测结果 |
|---|---|
| 参数 | `page` / `pageSize` / `module` / `tableName` / `action` / `userId` / `recordId` |
| 真实分页 | ✅ `{list, total, page, pageSize}`；`pageSize=999` → **裁剪为 200**（实测） |
| 归属过滤 | ✅ `?module=grid-attribution&action=attribute` 实测 200 |
| 返回字段 | `id, operation_log_id, user_id, username, module, table_name, record_id, action, **old_value, new_value, changed_fields**, ip_address, created_at` |
| 响应封装 | `success()` → `{code:0, success:true, message, data}` ⇒ 与 `requestClient`（`successCode:0`）**兼容** |
| 现有前端消费方 | **无**（web-naive 与 web-antd 均未使用） |

> ⚠️ **附带发现（H1）**：该路由**无 `requireRole`**，仅受全局 `authMiddleware`（`app.js:246`）保护 ⇒ **任何已登录用户（含 `grid_inspector`）都可读取 `audit_record` 全量，含 `old_value`/`new_value`**。属既有设计（非本阶段引入），**列出待评估**，本阶段不改。

### 4.5 ✅ 员工回显：**零新增 API 即可拿到姓名**

| 端点 | 实测 | 用途 |
|---|---|---|
| `GET /employees/selector?keyword=&limit=` | ✅ 数组，`limit` 默认 20 / **上限 100** | 远程搜索选人（04-C 已用） |
| `POST /employees/selector/batch` `{ids:[…]}` | ✅ **数组，4/4 命中**，`{employeeId, name, orgName, positionName, …}`（实测 `6692→黄殿兴/项目管理层/项目总经理`） | ⭐ **已归属列表按 id 批量回显巡查人姓名** |
| `GET /employees/selector/:id` | ✅ 单对象 | 单条回显 |

> `batchSelector` 的 SQL 为 `WHERE ev.employee_id = ANY($1) AND ev.is_deleted = false AND ev.is_current = true`。
> **⇒ 「已归属列表显示巡查人姓名」不需要新 API，也不需要 JOIN `employee`。** 这是本次审计最有价值的复用点之一。

---

## 五、是否存在重复 API

| 候选 | 结论 |
|---|---|
| 已有「已归属列表」API？ | ❌ **不存在**（全仓无 `manual_confirmed` 查询） |
| 能否复用 `site-mgmt/grid-records`？ | ❌ **不能**（G1：冻结 + 无过滤参数 + 权限码冲突 + 无归属字段） |
| 能否复用 `audit-records/records`？ | ⚠️ **部分可以**（见 §5.4）。可作「操作历史/审计明细」，**不能**替代「当前已归属名录」 |
| 是否需要新建 API？ | ✅ **需要 1 个最小只读 GET**，且**应挂在既有 04-B router**上（不新建 router、不新建权限码） |
| 会造成重复 API 吗？ | ❌ 不会。与 `/pending` 是**同一资源的两个状态视图**，同一 router、同一权限、同一服务层文件，属**对称补全**而非重复。 |

### 5.1 为什么审计轨迹不能替代已归属名录（决定性论据）

审计轨迹（`audit_record`）记录的是**事件**，不是**当前状态**。反例：

```
T0  记录 7443: pending
T1  人工归属 → audit: {old:{pending}, new:{manual_confirmed, insp:6692, grid:1}}
T2  撤销     → audit: {old:{manual_confirmed}, new:{pending, null, null}}
     gir 当前: attribution_status = 'pending'
```
⇒ 若从 `audit_record` 派生「已归属列表」，记录 7443 **仍会被列出**（存在 `action='attribute'` 行），与真实状态**矛盾**。
⇒ **唯一权威来源必须是 gir 本身。** 审计轨迹只能作为「历史/明细」补强。

### 5.2 为什么不能合并进 `/pending`

- `/pending` 的判据是 `L1_STRICT`（`pending` + 双 NULL），已归属的判据是 `attribution_status IN (...)`，**谓词不兼容**。
- `/pending` 返回**裸数组**（无 `total`），而「已归属」列表**必须**有 `total`（真实分页）。
- 合并会破坏 04-C 的已验收契约（§十七：不要重写 04-C）。

### 5.3 与 04-B 的对称性

| 维度 | `/pending`（04-B 已有） | 建议 `/attributed`（04-D-B） |
|---|---|---|
| 谓词 | `= 'pending' AND insp IS NULL AND grid IS NULL` | `IN ('manual_confirmed','attributed')` |
| 权限 | `requireRole('admin','hse_manager','safety_manager')` | **逐字相同**（不新增角色） |
| 封装 | 裸数组 + 顶层 `total` | **`data:{list,total,page,pageSize}`**（对齐项目既有分页约定，见 §7） |
| 服务层 | `getPendingRecords` | 新增 `getAttributedRecords` + `getAttributedCount`（同文件） |
| 前端 API | `getPendingAttributionRecords` | 新增 `getAttributedAttributionRecords`（同文件） |

> **取舍说明**：同一 router 内出现两种封装（裸数组 vs `{list,total}`）是**已存在的既成事实**。建议**新端点采用项目主流 `{list,total,page,pageSize}`**（与 `grid-records`、`audit-records` 一致），**不回头改 `/pending`**（避免触碰 04-C 已验收面）。该不一致需在 04-D-B 报告中显式记录。

### 5.4 建议采用的「审计轨迹复用」方式

「已归属」列表的**操作历史/明细抽屉**（谁在何时归属了哪条、旧值→新值）**直接复用**：
```
GET /api/hse/audit-records/records?module=grid-attribution&action=attribute&recordId=<id>&page=1&pageSize=20
```
✅ 零新增后端代码、✅ 真实分页、✅ 返回 `old_value/new_value/changed_fields`。
⚠️ 前置：H1（该路由无角色门）。**若要在 04-D 页面暴露给 hse_manager/safety_manager，建议先单独授权为其加 `requireRole`（1 行纯增量）**，否则等同一并放宽了 grid_inspector 的读取面。

---

## 六、推荐的最小查询 API（**仅方案，本阶段不实施**）

### 6.1 端点

```
GET /api/grid-attribution/attributed
      ?page=1&pageSize=20
      &status=manual_confirmed|attributed|all     (默认 all)
      &keyword=<模糊：personnel_name / area_team>
      &inspectionDateFrom=YYYY-MM-DD
      &inspectionDateTo=YYYY-MM-DD
      &sortField=id|inspection_date|created_at     (白名单；默认 id desc)
      &sortOrder=asc|desc
```

### 6.2 权限

`requireRole('admin','hse_manager','safety_manager')` —— **与 `/pending` 逐字相同，不新增角色、不改 auth/JWT/users**。

### 6.3 SQL 草案（服务层，纯 SELECT）

```sql
SELECT id, inspection_date, area_team, personnel_name, violation_behavior,
       attribution_status, inspector_employee_id, grid_id,
       source_channel, created_at, updated_at
FROM grid_inspection_records
WHERE attribution_status IN ('manual_confirmed', 'attributed')   -- ← 只按状态列，见下
  /* 可选：AND inspection_date BETWEEN $a AND $b */
  /* 可选：AND (personnel_name ILIKE $k OR area_team ILIKE $k) */
ORDER BY <白名单列> <asc|desc> NULLS LAST, id DESC
LIMIT $n OFFSET $m;
```
配套 `SELECT count(*)::int` 同谓词。

**三条设计要点**：

1. ⭐ **谓词只能按 `attribution_status`，绝不可加 `AND grid_id IS NOT NULL`。** 理由：`grid_id` 的 FK 是 **`ON DELETE SET NULL`** ⇒ 若某网格被删，`grid_id` 会被置 NULL 而 `attribution_status` 保持 `manual_confirmed`（**应用不感知**）。若加了 `grid_id IS NOT NULL`，这类行会在「已归属列表」**永久消失**（既不 pending 也不 attributed）→ 成为不可见孤儿行。**必须允许列表出现 `grid_id = NULL` 的行，前端渲染为 `-`。**
2. `inspector_employee_id` 亦**不要**作为过滤条件（同上：无 FK，可被外部置 NULL；且列表应忠实反映 DB 真实状态）。
3. `ORDER BY` 默认 **`id DESC`**（即 `MAX(id)` 最新在前）。**不要用 `updated_at` 排序**（见 §6.4）。

### 6.4 ⭐⭐ 为什么排序/展示「归属时间」**不能**用 `updated_at`

实测 `services/wpsGridPullEngine.js:292`：
```js
`UPDATE grid_inspection_records SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${...}`
```
即 **Pull Engine 每 15 分钟同步时会重写 `updated_at`**（`updated_at != created_at` 的行实测 **1708** 行，而归属数为 0 —— 这些差异全部来自 Pull，不是归属）。

| 结论 | |
|---|---|
| `updated_at` = 归属时间？ | ❌ **不是**。它是「最后一次被 Pull 重写或归属写入」的混合时间 |
| `created_at` = 归属时间？ | ❌ 不是（是回流入库时间） |
| 归属时间的**唯一权威来源** | ✅ `audit_record.created_at`（`action='attribute'`、`module='grid-attribution'`、`record_id=<id>`） |

⇒ **04-D-B 的 UI 若要显示「归属时间/归属人」，必须从 audit 轨迹取，或列表不显示该列（只显示状态）。** 本审计推荐：**列表默认不显示「归属时间」，改在明细抽屉中从 audit 轨迹展示**（复用 §5.4）。这是本报告最重要的设计约束之一。

### 6.5 是否需要 `gridScope`

❌ **不需要，且不应加**。理由见 §17。

---

## 七、是否需要分页

### 7.1 现状：`/pending` **没有真实分页**（G2 —— 技术缺口，本阶段**不修**）

实测 `routes/hse-grid-attribution.js:46-54`：
```js
const rows = await svc.getPendingRecords({ limit: 500, offset: 0 });   // ← 硬编码
return res.json({ success: true, code: 0, data: rows, total: rows.length });
```
- `limit=500/offset=0` **硬编码在路由层**，前端传参**被忽略**（前端 `getPendingAttributionRecords` 虽传 `limit/offset`，后端不读）。
- 顶层 `total` 被 `requestClient` 拦截器解包时**丢弃**（只保留 `data`）⇒ 04-C 只能用 `list.length` 当「待处理数量」。
- 超过 500 条会**静默截断**（无 `truncated` 标志，不像 `grid-records` 有）。

> **记录为 G2（技术缺口）**：`/pending` 无真实分页、无真 `total`、无 `truncated`。**本阶段不修改后端**（§十二），仅登记。当前 pending=0 行，**无实际影响**；一旦 stamping 上线导致 pending 上千，**必须**在 04-D-B 或后续阶段一并补齐。

### 7.2 已归属查询是否已有分页能力

❌ 无（因为端点尚不存在）。✅ 但项目**已有成熟的分页范式**可直接照抄：

| 参考实现 | 分页形态 |
|---|---|
| `GET /api/site-mgmt/grid-records` | `page`/`pageSize` → `{list, total, truncated}` |
| `GET /api/hse/audit-records/records` | `page`/`pageSize`（**上限 200**）→ `{list, total, page, pageSize}` |
| 前端 `HseDataGrid` | `:pager` `:total` `:current-page` `:page-size` `@page-change`（**服务端分页已支持**） |

### 7.3 结论

- **必须提供真实服务端分页**（`page`/`pageSize`/`total`），**不得假分页**（§十二）。
- 不要复制 `/pending` 的「一次性返回」模式（那是 G2，不是范式）。
- 上限建议 `pageSize ≤ 200`（与 `audit-records` 对齐）。

---

## 八、前端页面结构建议（**只评估，不实施**）

### 8.1 项目既有模式证据

| 模式 | 既有实现 | 适用性 |
|---|---|---|
| **Tab（同页切换）** | `views/site/violation/index.vue`（`NTabs` + `NTabPane`）、`views/accidents`、`views/hazards`、`views/hse/*` 等 19 处 | ✅ 项目**已有成熟 Tab 范式** |
| **同页 `NTabs` 包裹 `HseDataGrid`** | `views/site/violation/index.vue:1054` 起（`NTabs` → `NTabPane` → `HseDataGrid`） | ✅ 有先例 |
| **多路由页** | `/site/grid/mgmt` 与 `/site/grid/ledger` 两页并列 | ✅ 亦有先例 |

### 8.2 方案对比

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **A｜同页 `NTabs`：待归属 / 已归属** | ① 与项目既有 Tab 范式一致；② 「待归属→已归属」是**同一资源的两个状态**，同页切换符合心智；③ **无需新增路由与 authority**；④ 归属成功后可直接把行「移到」已归属 Tab | 需把 04-C 页面外壳改造为 `NTabs`（**触碰 04-C**，§十七需评估） | ⚠️ 需权衡 |
| **B｜新增独立页 `/site/grid/attribution-confirmed`** | 完全不动 04-C（§十七无冲突）；可独立验收 | ① 需新增路由（含 authority）；② 用户需在两个菜单间切换，归属后看不到结果；③ 菜单层级变深 | ✅ **推荐（风险最小）** |
| **C｜同页 Tab 但 04-C 仅做最小包裹** | 兼顾 A 的优点 | 改造范围不可控 | ❌ 折中不划算 |

### 8.3 推荐

**推荐 B**（新增独立只读页），理由是**本阶段最硬的约束是「不要重新修改 04-C」**（§十七）——方案 A 必须改造 04-C 的模板外壳与 `loadData` 结构，属明确的越界风险；而 B 是纯新增，且「已归属」本质是**只读审计视图**（第一阶段无写操作），与「待归属」的**操作视图**职责不同，**分页独立反而更清晰**。

> 若你更看重「同页切换」的体验，可授权方案 A；但那需要同时把 §十七的「不改 04-C」放宽为「允许外壳 Tab 化」，**请单独确认**。

### 8.4 页面骨架（方案 B，`HsePageLayout` 复用）

```
HsePageLayout(title=已归属记录, description=…)
 ├ #extra → HseActionBar(刷新 / 导出)          ← 复用
 ├ HseSearchPanel(@query/@reset)               ← 复用（日期范围 + 关键字 + 状态 NSelect）
 ├ HseDataGrid(:columns :data :loading
 │             :pager="true" :total :current-page :page-size
 │             @page-change)                   ← 复用（服务端分页）
 └ NDrawer/NDrawerContent + NDescriptions      ← 复用（明细 + 审计轨迹）
      └ NModal + NSelect(remote) —— 仅用于「撤销二次确认」，非选人
```

**列建议**（默认 7 列，避免横向溢出）：

| 列 | field | 对齐 | 说明 |
|---|---|---|---|
| ID | `id` | 居中 | `fixed: 'left'` |
| 巡查日期 | `inspection_date` | 居中 | 复用 04-C 的 `formatDateShort`（只取前 10 位，避免时区偏移） |
| 作业区域 | `area_team` | 左 | 长文本 `showOverflow: 'tooltip'` |
| 违规人员 | `personnel_name` | 居中 | |
| 归属状态 | `attribution_status` | 居中 | `NTag`：`manual_confirmed`→「人工归属」/`attributed`→「自动归属」；**这是 revoke 可用性的唯一判据** |
| 巡查人 | `inspector_employee_id` → 姓名 | 居中 | 由 `batchSelector` 回显；查不到显示 `-`（勿显示裸 id） |
| 操作 | — | 居中 | ⚠️ **仅 `attribution_status==='manual_confirmed'` 渲染「撤销」**；`attributed` 不渲染（或渲染为禁用 + tooltip「自动归属不可撤销」） |

> ⚠️ **不要显示「归属时间」列**（§6.4）；如需，放明细抽屉。

---

## 九、`HseDataGrid` 复用方案

实测 `components/hse/HseDataGrid.vue` 已具备全部所需能力，**零改造**：

| 需求 | 组件已支持 |
|---|---|
| 服务端分页 | ✅ `:pager="true"` + `:total` + `:current-page` + `:page-size` + `@page-change`（组件内部维护 `currentPage` 并回写 `pagerConfig`，注释明确说明「否则翻页高亮不动」） |
| 服务端排序 | ✅ `sortConfig.remote=true` + `@sort-change` 三态（asc→desc→取消）；组件**绝不本地重排** |
| 长文本省略 | ✅ 默认 `showOverflow:'tooltip'` |
| 列显隐持久化 | ✅ `:toolbar-custom="{ storageKey: 'hse_grid_attribution_confirmed_columns' }"`（可选） |
| 自定义单元格 | ✅ 全插槽透传（`#action`、`#attribution_status` 等） |
| 序号列 | ✅ `formatter: p => (p?.rowIndex ?? 0) + (page-1)*pageSize + 1`（项目既有写法） |

**不需要**：`editable`（本页只读）、`virtualScroll`（规模小）、`height`（自适应即可）。

---

## 十、Naive UI 组件复用方案

| 组件 | 用途 | 来源 |
|---|---|---|
| `HsePageLayout` | 页面外壳（title/description/#extra） | ✅ 复用 |
| `HseSearchPanel` | 筛选区（`@query`/`@reset`；`NGi` 提供项；支持 `#more` 折叠） | ✅ 复用 |
| `HseActionBar` | 刷新/导出按钮组 | ✅ 复用 |
| `HseDataGrid` | 表格 | ✅ 复用 |
| `NDatePicker`（`type="daterange"`） | 巡查日期范围 | ✅ 复用（`views/site/violation/index.vue:721` 既有写法，`@update:value` + `clearable`） |
| `NSelect`（`remote`） | 状态筛选（本地选项，非远程） | ✅ 复用 |
| `NTag` | 归属状态标签 | ✅ 复用（04-C 已用） |
| `NModal` + `NForm` | **撤销二次确认**（输入可选 reason） | ✅ 复用 Naive 原生 |
| `NDrawer` + `NDescriptions` | 明细抽屉（含审计轨迹） | ✅ 复用 Naive 原生 |
| `message` / `dialog` | 提示 | ✅ 复用 `#/adapter/naive` 的 `message`（04-C 已用） |

### 10.1 ❌ 明确**不新建**的组件（用户硬约束）

`EmployeeSelect`、`HseAttributionTable`、`HseRevokeModal` 等**一律不建**。
⇒ 员工搜索仍内联 `NSelect remote`（照抄 04-C）；撤销确认仍内联 `NModal`。
**理由**：本仓 `components/hse/` 下的公共组件均为**跨域通用**（DataGrid/PageLayout/SearchPanel/ActionBar/ImportDialog/SplitPane/StatCard/StatusTag）；而「归属域」组件只服务 1–2 个页面，**抽象收益低于维护成本**，且会引入「通用组件」的版本约束。**窄域 UI 内联在页面内**是 04-C 已确立的范式。

### 10.2 无新依赖确认

全部所需组件（`NTabs`/`NDatePicker`/`NDrawer`/`NDescriptions`/`NModal`/`NSelect`/`NTag`/`NButton`/`NForm`/`NSpace`/`NGi`/`NStatistic`/`NCard`）**均为 `naive-ui` 已有导出**；`vxe-table` 经 `HseDataGrid` 间接使用。**新增 npm 依赖 = 0。**

---

## 十一、Revoke 安全模型

### 11.1 现状（**已实现，且设计正确**）

`revokeRecord()` 已具备（`gridAttributionService.js:152-217`）：

| 要求 | 实现 | 评价 |
|---|---|---|
| 必须事务 | ✅ `BEGIN … COMMIT`（单 client） | ✅ |
| 是否需要 `SELECT FOR UPDATE` | ✅ **已用**：`SELECT … WHERE id=$1 FOR UPDATE` | ✅ 串行化并发撤销 |
| 是否读取**服务端** old values | ✅ **已读**：`FOR UPDATE` 之后取 `attribution_status/inspector_employee_id/grid_id` 真实值 | ✅ **不接受客户端 old\*** |
| 客户端只发 `record_id` + 可选 `reason` | ✅ 路由仅读 `body.record_id` / `body.reason` | ✅ |
| 禁止客户端发送 old/new/status/operator | ✅ 一律**不读取**（白名单读取） | ✅ |
| 状态机只允许 `manual_confirmed → pending` | ✅ `if (row.attribution_status !== 'manual_confirmed') throw 409 NOT_REVOCABLE` | ✅ |
| 并发守卫 | ✅ 条件 UPDATE + `rowCount!==1` ⇒ 409 `REVOKE_CONFLICT` | ✅ |

### 11.2 客户端字段白名单（**逐字**）

| 字段 | 后端行为 |
|---|---|
| `record_id` | ✅ 读取（`normalizeInt` → 非法⇒`400 INVALID_RECORD_ID`） |
| `reason` | ⚠️ 读取，**仅 `console.log`，不持久化**（`audit_record` 无 detail 列；源码注释明确「04-A 决定不新增字段」） |
| `old_employee_id` / `old_grid_id` / `inspector_employee_id` / `grid_id` / `attribution_status` / `operator_id` | ❌ **一律忽略**（`body` 只被显式读取 `record_id`、`reason`） |

> **04-D 的前端契约**：**只发送 `{ record_id, reason? }`**。`reason` 即使发送也不会落库 ⇒ **若产品要求「撤销原因可追溯」，需先授权修改 `audit_record` 结构或改用 `sys_operation_log`**（本阶段仅登记为 G5）。

### 11.3 事务/并发模型（详见 §13、§16）

### 11.4 revoke 前置安全审计逐条答复（对应 §七）

| # | 问题 | 答复 |
|---|---|---|
| 1 | revoke 是否必须事务 | ✅ **必须**。`FOR UPDATE` 必须在同一事务内才有效；且审计必须与业务变更原子（当前实现正确） |
| 2 | 是否需要 `SELECT FOR UPDATE` | ✅ **需要**。用于①取真实 old values ②串行化「两个管理员同时撤销同一条」 |
| 3 | 是否必须读取服务器当前 old values | ✅ **必须**。禁止客户端传入（否则可伪造审计、可绕过状态判断） |
| 4 | 客户端是否只能发 `record_id`（+可选 `reason`） | ✅ **是** |
| 5 | 是否禁止客户端发 `old_*`/`inspector_employee_id`/`grid_id`/`attribution_status`/`operator_id` | ✅ **禁止**（当前实现已完全忽略） |
| 6 | `audit_record` 如何记录 old/new/changed | ✅ `old_value`/`new_value` = jsonb **对象**（3 字段），`changed_fields` = `text[]`（3 项）；见 §14 |
| 7 | revoke 是否允许 `attributed → pending` | ❌ **第一版只允许 `manual_confirmed → pending`**。当前实现已如此；**04-D 不得放宽** |

---

## 十二、Revoke 状态转换（状态机冻结）

```
                 ┌──────────────────────────────────────┐
                 │  (Pull 回流新行)                      │
                 │  attribution_status = NULL           │  ← 当前实况：18 列投影不含状态列
                 └───────────────┬──────────────────────┘
                                 │ stamping（未接线）
                                 ▼
                        ┌────────────────┐
        ┌──────────────▶│    pending     │◀─────────────────┐
        │               │ insp=NULL      │                  │
        │               │ grid=NULL      │                  │
        │               └───┬────────┬───┘                  │
        │     人工归属(POST)│        │自动归属(enrichment,未接线)
        │                   ▼        ▼                      │
        │        ┌──────────────────┐  ┌──────────────┐     │
        │        │ manual_confirmed │  │  attributed  │     │
        │        │ insp!=NULL       │  │  insp!=NULL  │     │
        │        │ grid!=NULL       │  │  grid!=NULL  │     │
        │        └────────┬─────────┘  └──────────────┘     │
        │                 │ 撤销(DELETE /revoke)             │
        │                 │ ★ 04-D 唯一允许的转换             │
        └─────────────────┘  （attributed ⇒ ❌ 不可撤销）     │
```

### 12.1 允许的转换（04-D 第一版，**不扩大**）

| # | From | To | 触发 | 本阶段 |
|---|---|---|---|---|
| T1 | `pending` | `manual_confirmed` | `POST /attribute` | 04-B/04-C 已实现 |
| T2 | `manual_confirmed` | `pending` | `DELETE /revoke` | 后端已实现；**04-D 仅做 UI** |
| T3 | `pending` | `attributed` | enrichment（未接线） | ❌ 不在本阶段 |

### 12.2 明确**禁止**的转换

| 禁止 | 原因 |
|---|---|
| `attributed → pending` | 用户已明确第一版不扩大状态机；自动归属的撤销语义未定义 |
| `manual_confirmed → manual_confirmed`（改归属给另一人） | **不是 revoke**。需「先撤销再归属」两步，各自留审计 |
| `NULL → pending` 直接写 | 打标属 stamping 职责，**04-D/04-C 都不得代劳** |
| 任何 → `rejected` / `failed` | 状态枚举不含（DECISION 明确「不设 failed」） |

### 12.3 撤销后重归属

T2 后行回到 `pending` + 双 NULL ⇒ **可再次被 T1 归属**（无需额外代码）。
⚠️ **但注意**：若该行是通道 B 行，其 `attribution_status` 由 `manual_confirmed` 变 `pending` 后，会**重新出现在 `/pending` 列表**——这是正确行为。

---

## 十三、事务模型

### 13.1 现状（已实现，模型正确）

```
client = await pool.connect()
try {
  BEGIN
  [revoke]  SELECT … FOR UPDATE           ← 行锁 + 取真实旧值
            if status !== 'manual_confirmed' → throw 409 NOT_REVOCABLE
            UPDATE gir SET status='pending', insp=NULL, grid=NULL, updated_at=NOW()
                   WHERE id=$1 AND status='manual_confirmed'
            if rowCount !== 1 → throw 409 REVOKE_CONFLICT
            INSERT audit_record (同 client)   ← ★ 必须同一 client，禁 pool
  COMMIT
} catch { ROLLBACK; 映射 ApiError→业务码 / 其他→500 }
finally { client.release() }
```

### 13.2 三条硬约束（04-D 必须遵守）

1. ⭐ **审计必须走「当前事务 client」直写 `audit_record`**。
   **严禁** `auditLog()` / `createAuditRecord()` —— 二者用 `pool`（**另一条连接**）、**吞异常**（`return null`）、**非原子**。`hse-audit-records.js` 的 `createAuditRecord` 正是 `pool.query` 且 catch 后返回 `null`（实测源码）。**若用它，撤销成功但审计失败时数据库仍会提交 ⇒ 审计缺失。**
2. **审计失败必须导致整事务 ROLLBACK**（当前实现满足：`insertAudit` 抛错 ⇒ catch ⇒ ROLLBACK）。仓内有**故障注入开关** `P2B1D_FORCE_AUDIT_FAIL==='true'`（仅测试用，生产永不设置）——**04-D 不得修改或调用它**。
3. **一次性 `ROLLBACK`**（单一 catch），不在 catch 里再抛未捕获异常（Express 4 会挂起请求，见 §19 R1）。

### 13.3 隔离级别

使用 PG 默认 `READ COMMITTED` 即可：`FOR UPDATE` 提供行级串行化，条件 UPDATE 的 `rowCount` 提供最终一致性守卫。**无需** `SERIALIZABLE`（会引入序列化失败重试复杂度，收益为零）。

---

## 十四、`audit_record` 模型

### 14.1 结构（实测 13 列）

| 列 | 类型 | 归属写入值 |
|---|---|---|
| `id` | bigint | 自增 |
| `operation_log_id` | bigint | **NULL**（归属不使用） |
| `user_id` | integer | `req.user.id` |
| `username` | varchar | `req.user.username`（缺失→`'unknown'`） |
| `module` | varchar | **`'grid-attribution'`** |
| `table_name` | varchar | `'grid_inspection_records'` |
| `record_id` | **character varying** | `String(rid)` ← ⚠️ **字符串**，查询需 `recordId=<数字>` 由后端 `String()` 转换 |
| `action` | varchar | **`'attribute'`** / **`'revoke'`** |
| `old_value` | jsonb | attribute：`{attribution_status:'pending', inspector_employee_id:null, grid_id:null}`；revoke：**真实旧值** |
| `new_value` | jsonb | attribute：`{..., 'manual_confirmed', eid, gridId}`；revoke：`{..., 'pending', null, null}` |
| `changed_fields` | ARRAY | **`['attribution_status','inspector_employee_id','grid_id']`** |
| `ip_address` | varchar | `req.ip` 或 `x-forwarded-for` |
| `created_at` | **timestamp without time zone** | 默认 `now()` ← ⚠️ 无时区 |

### 14.2 revoke 的审计应如何记录（设计答复，对应 §七.6）

**完全复用 `attribute` 的既有形态**（对称）：

```js
await insertAudit(client, {
  userId: operator.userId, username: operator.username,
  module: 'grid-attribution',
  table_name: 'grid_inspection_records',
  record_id: rid,                       // 内部 String() 化
  action: 'revoke',
  old_value: { attribution_status: 'manual_confirmed', inspector_employee_id: <真实值>, grid_id: <真实值> },
  new_value: { attribution_status: 'pending', inspector_employee_id: null, grid_id: null },
  changed_fields: ['attribution_status', 'inspector_employee_id', 'grid_id'],
  ip_address: ip,
});
```

**三条规则**：
1. `old_value` **必须来自 `FOR UPDATE` 读到的真实值**，不得由客户端提供、不得硬编码 `'manual_confirmed'`（与 attribute 的写死不同：attribute 时旧值恒为 pending，可安全写死；**revoke 时旧值必须实读**）。
2. `reason` **不落库**（无 detail 列）。当前仅 `console.log`。
3. 不新增审计列、不新增审计表（**G5**：若业务确需「撤销原因」，需单独授权改结构）。

### 14.3 时间列陷阱（复用 §4.4 的查询时必须注意）

`audit_record.created_at` 是 `timestamp without time zone`。任何 `WHERE created_at > '<ISO with Z>'` 都会**过匹配**（历史坑 R7：曾一次性误删 16 行 dev 审计）。**清理/过滤请改用 `id` 或显式 `::timestamp` 字面量。**

---

## 十五、权限模型

### 15.1 现状（**已正确，04-D 逐字沿用**）

| 项 | 值 |
|---|---|
| 中间件 | `requireRole('admin','hse_manager','safety_manager')`（`hse-grid-attribution.js:21` `ATTR_ROLES`） |
| 实现 | `middleware/auth.js:288` `requireRole` —— **fail-closed**：入参非法则整个中间件恒 403；`!req.user` → 401；角色不匹配 → 403 |
| 角色来源 | `req.user.role`（`authMiddleware` 注入，来自 JWT） |
| **严禁** | `requirePermission('hse:site:grid:update')`（`grid_inspector` 亦持有 ⇒ 会误放行）；`hse:site:grid:view` 同理（实测 `auth.js:446`） |

### 15.2 角色矩阵（实测 + 设计）

| 角色 | 后端（`requireRole`） | 前端路由（`meta.authority`） | DB 实际用户数 |
|---|---|---|---|
| `admin` | ✅ 允许 | ✅ 可达 | **1**（active） |
| `hse_manager` | ✅ 允许 | ❌ **不可达（DEF-A）** | **0** |
| `safety_manager` | ✅ 允许 | ❌ **不可达（DEF-A）** | **0** |
| `grid_inspector` | ❌ 403 | ❌ 不可见 | **62**（active） |
| `township_manager` | ❌ 403 | ❌ 不可见 | **0** |

> **实测角色分布**（`safety_dashboard_dev.users`）：`grid_inspector` **62** / `admin` **1**，合计 63。⇒ **目前不存在 `hse_manager`/`safety_manager` 用户**。

### 15.3 约束（用户硬要求，04-D 必须遵守）

- ❌ 不新增角色；❌ 不改 `users`；❌ 不改 JWT；❌ 不改 `auth`。
- ✅ `grid_inspector` **不能**执行人工归属管理（查询/撤销）。
- ✅ `township_manager` **不能**执行人工归属管理。
- ⚠️ **注意 `township_manager` 的特殊性**：它在 `gridScope.ALL_GRID_ROLES` 里（网格范围=全部），**但**在 `requireRole` 白名单外 ⇒ **角色门（而非 scope）才是本端点的授权边界**（见 §17）。

---

## 十六、并发模型

### 16.1 已识别的并发场景

| # | 场景 | 现状 | 风险 |
|---|---|---|---|
| C1 | 两个管理员同时**撤销**同一条 | ✅ `FOR UPDATE` 串行化；后者读到的状态已是 `pending` ⇒ `409 NOT_REVOCABLE`；即便竞态穿透，条件 UPDATE 的 `rowCount!==1` ⇒ `409 REVOKE_CONFLICT` | **无** |
| C2 | **撤销** 与 **归属** 并发 | ✅ 两侧都 `BEGIN` + 条件 UPDATE（revoke 用 `FOR UPDATE`，attribute 用 3 条件守卫）；attribute 的 `WHERE …='pending' AND insp IS NULL AND grid IS NULL` 在 revoke 提交后会 rowCount=0 ⇒ `409 RECORD_NOT_PENDING` | **无**（DB 行锁保证） |
| C3 | 撤销 与 **Pull 同步** 并发 | ⚠️ Pull 的 UPDATE **不含** `inspector_employee_id`/`grid_id`（`assertNoProtectedColumns` 硬断言）⇒ 不会覆盖归属。**但** Pull 会重写 `updated_at` ⇒ **列表若按 `updated_at` 排序会「跳动」** | 低（见 §6.4：不按 `updated_at` 排序即规避） |
| C4 | 撤销 与 **网格被删**（`grid_areas` DELETE） | ⚠️ FK `ON DELETE SET NULL` ⇒ `grid_id` 变 NULL 但 `attribution_status` 仍 `manual_confirmed`；revoke 只校验状态 ⇒ **仍可撤销** | 低（要求列表允许 `grid_id=NULL`，见 §6.3） |
| C5 | 两条**不同**记录并发撤销 | ✅ 行锁互不影响 | 无 |

### 16.2 前端侧并发

- 撤销按钮需**防重复点击**（提交中 `disabled` + `loading`），避免用户连点产生第 2 次请求（第 2 次会得 `409 NOT_REVOCABLE`，虽无害但体验差）。
- 撤销成功后**只刷新列表**（`loadData()`），不做本地乐观删除（避免与 DB 真实状态分叉）。

### 16.3 结论

✅ **无需新增锁机制、无需调整隔离级别、无需版本号/乐观锁列。** 现有「行锁 + 条件 UPDATE + rowCount 守卫 + 同事务审计」已覆盖全部并发场景。

---

## 十七、`gridScope` 安全边界

### 17.1 正式口径（不改）

`gridScope`（`services/gridScope.js`）是**网格巡查数据的行级授权边界**，其唯一身份纽带是：
```
users.employee_id = grid_areas.personnel_id → grid_areas.id
```
**永久禁止**的任何身份推断来源（用户硬要求 + 代码注释一致）：
❌ WPS `grid_id` 授权 ❌ WPS 所属网格授权 ❌ WPS Creator 授权 ❌ 姓名匹配 ❌ 昵称匹配 ❌ 手机号匹配。

`resolveGridScope` 的角色映射（实测）：
- `ALL_GRID_ROLES = ['system_admin','admin','hse_manager','safety_manager','**township_manager**']`
- `OWN_GRID_ROLES = ['grid_inspector','manager']`
- 未识别角色 → `NONE`（fail-closed）
- `buildScopeSqlCondition(own_grid, n)` → `grid_id IN (SELECT id FROM grid_areas WHERE personnel_id = $n AND is_deleted = false)`；`none` / own 无网格 → **`1 = 0`**

### 17.2 本阶段结论：**归属管理端点不适用 `gridScope`，且不应加**

| 论据 | 说明 |
|---|---|
| ① 角色门已完全覆盖 | 允许的 3 个角色**全部**在 `ALL_GRID_ROLES` 内 ⇒ 若加 `resolveGridScope`，一律得到 `all_grid`（`condition=null`）⇒ **过滤器恒为空，加了等于没加**（纯冗余） |
| ② 不该把「管理面」收窄成「网格面」 | 人工归属是**平台级数据治理动作**（用户明确要求由 admin/hse_manager/safety_manager 执行）。把它降级为「只看自己网格」会**改变产品语义** |
| ③ `township_manager` 的陷阱 | 它在 `ALL_GRID_ROLES` 内但**被角色门挡在门外**（403）。**切勿**因为「它 scope=全部」就以为它可以访问——**授权边界是角色门，不是 scope** |
| ④ `grid_id IS NULL` 的构造性隔离（既有事实） | 对 `own_grid` 用户（`grid_inspector`），`grid_id IN (SELECT …)` 遇 `NULL` ⇒ 谓词为 NULL ⇒ **永不匹配**。⇒ 「网格长看不到通道 B 待归属行」是 **fail-closed 的构造性结果**，不是新代码 |
| ⑤ 通道 B 的 `grid_id` 归属后才非空 | 归属**后**，`grid_id` 生效 ⇒ 该行进入对应网格长的 `own_grid` 可见范围（届时会出现在 `/site/grid/ledger` 台账中）。这是**期望行为**，不是泄漏 |

> **正式建议**：`/attributed` 仅用 `requireRole(...)`，**不引入 `gridScope`**，与 `/pending` 保持逐字对称。若未来业务要求「网格长只读自己网格的已归属记录」，那属于**另一个只读端点**（应挂在 `site-mgmt` 域、加 `attribution_status` 过滤、并受冻结政策约束）——**不在 04-D 范围**。

### 17.3 反向确认（不得触碰）

❌ 不修改 `gridScope.js` ❌ 不修改 `authenticatedEmployeeResolver` ❌ 不修改 `site-mgmt.js` ❌ 不用 WPS 字段做授权。

---

## 十八、R2 回归结果（最小回归，dev）

**方法**：复用 04-C 建立的只读验证脚本（`BASE` 指向 dev 5881 / 5882），断言 `Array.isArray(data)`。
**未修改** `middleware/encryption.js`（R2 修复已于 04-C 阶段完成并生效）。

| 端口 | PID | 断言 1<br>`GET /hse/employee/employees/selector` | 断言 2<br>`GET /hse/employee/employees/6692` | 断言 3<br>`GET /hse/employee/employees` | 断言 4<br>`GET /grid-attribution/pending` |
|---|---|---|---|---|---|
| **:5881** | 34200 | ✅ **200 `code=0` `data=Array(len=20)`** | ✅ object | ✅ object | ✅ `code=0` `Array(len=0)` |
| **:5882** | 35436 | ✅ **200 `code=0` `data=Array(len=20)`** | ✅ object | ✅ object | ✅ `code=0` `Array(len=0)` |

- **`Array.isArray(data) === true`** ✅（R2 目标达成，不再是 `{"0":{…}}` 对象）
- 首项键：`["employeeId","employeeCode","name","gender","orgUnitId","orgName","operationUnitId","unitName","positionId","positionName"]`
- ✅ **无回归**：对象载荷（详情）与 `{list}` 载荷（列表）**逐字未变**，证明 04-C 的纯增量修复未换 bug。
- ④ `pending` = 0 行 ⇒ 与 §1.4「全库无 pending」一致。

**判定：R2 最小回归 PASS（dev 双实例）。**

---

## 十九、生产边界检查（逐项实测）

| 项 | 期望 | 实测 | 结论 |
|---|---|---|---|
| 生产后端 | `5876 → PID 23396`，**全程未动** | `5876 → 23396`（LISTENING） | ✅ |
| `server/.env` | **mtime 不变** | `2026-09-11 22:22:50.606548700 +0800` | ✅ **未改** |
| dev 后端 | 5881/5882 绑 **`safety_dashboard_dev`** | 计数器差值法：**两库中仅 dev 增长**（`xact+1 tup+15`），`safety_dashboard` **零增量** | ✅ |
| 生产 DML / POST / DELETE / API 写 | 禁止 | **0 次**（本轮仅 SELECT + 2 次 GET/1 次只读 POST `selector/batch` 于 dev） | ✅ |
| 生产 WPS 写入 / 表单提交 | 禁止 | 0 次 | ✅ |
| `.env` / Scheduler / Pull Engine / `site-mgmt.js` / auth / users / gridScope | 禁改 | **均未改** | ✅ |
| 冻结文件 | 禁改 | **未改** | ✅ |
| 本轮代码改动 | **0** | `git status --porcelain server/` → 仅 2 个 **04-C 阶段遗留**文件（`M middleware/encryption.js` = R2 修复、`M routes/hse-grid-attribution.js` = R1 修复）；**本轮新增改动 = 0** | ✅ |
| 数据库写 | 0 | 全部脚本为 `SELECT` / `pg_stat_database` 只读读取；`POST selector/batch` 是**只读批量查询**（`employeeSelectorService.batchSelector` 仅 SELECT） | ✅ |
| schema 变更 | 0 | 未执行任何 DDL | ✅ |

### 19.1 ⚠️ 5881 风险复核（用户特别要求）

**本轮开工第一件事**即用**计数器差值法**判定 5881 的实际绑定库（不依赖端口/启动参数推断）：

```
--- :5881 ---
  /api/health -> 200 {"code":0,"data":{"status":"ok",...}}
  /api/hse/employee/employees/selector -> 200 {...,"data":[{"employeeId":"8205",...}]}
  DB 计数增长 => safety_dashboard_dev: xact+1 tup+15      ← ✅ 仅 dev 增长
--- :5882 ---
  DB 计数增长 => safety_dashboard_dev: xact+1 tup+15      ← ✅ 仅 dev 增长
```
⇒ **5881 当前绑定 `safety_dashboard_dev`，未触发「立即停止」条件。**（04-C 阶段曾发现旧 5881 误连生产库，已在该阶段重启修正；本轮复核保持在位。）

### 19.2 数据库只读审计脚本

| 脚本 | 行为 |
|---|---|
| `.workbuddy/tmp/p2b1d04da_schema.cjs` | gir/sync_map/audit_record 结构 + 状态分布 + 索引（dev + prod 双库，仅 SELECT） |
| `.workbuddy/tmp/p2b1d04da_roles.cjs` | `users` 角色分布（仅 SELECT） |
| `.workbuddy/tmp/p2b1d04da_reuse_probe.cjs` | 端点复用探针（GET + 只读 POST） |
| `.workbuddy/tmp/p2b1d04da_route_proof.mjs` | 路由可达性证明（纯内存，无 IO） |
| `.workbuddy/tmp/p2b1d04c_dbmap2.cjs` | 库绑定判定（复用 04-C 脚本） |

---

## 二十、需要修改的文件清单（**04-D-B 实施时**，本阶段不实施）

| # | 文件 | 动作 | 预估规模 | 越界检查 |
|---|---|---|---|---|
| 1 | `server/services/gridAttributionService.js` | 修改：新增 `getAttributedRecords()` + `getAttributedCount()`（纯 SELECT）；导出 | ~45 行 | ✅ 非冻结；✅ 不在 9 冻结清单 |
| 2 | `server/routes/hse-grid-attribution.js` | 修改：新增 `GET /attributed`（沿用 `ATTR_ROLES`） | ~25 行 | ✅ 非冻结 |
| 3 | `apps/web-naive/src/api/hse/grid-attribution.ts` | 修改：新增 `AttributedRecord` 类型 + `getAttributedAttributionRecords()` | ~45 行 | ✅ |
| 4 | `apps/web-naive/src/views/site/grid/attribution-confirmed/index.vue` | **新建**（方案 B） | ~380 行 | ✅ 新文件 |
| 5 | `apps/web-naive/src/router/routes/modules/hse-site.ts` | 修改：新增路由 + `authority` | ~10 行 | ✅ |
| 6 | `apps/web-naive/src/locales/langs/{zh-CN,en-US}/page.json` | 修改：新增 locale 键（照 04-C 的 `siteGridAttribution` / `…Desc` 两个键的格式） | 各 +2 行 | ✅ |
| 7 | ⭐ `apps/web-naive/src/router/routes/modules/hse-site.ts`（**DEF-A 修复**） | 修改：把 `/site` 与 `/site/grid` 两个**祖先** `meta.authority` 放宽为 `['admin','grid_inspector','hse_manager','safety_manager']` | 各 1 行 | ⚠️ **需单独授权**（见 §22.1） |
| 8 | `server/routes/hse-audit-records.js`（**H1 可选加固**） | 修改：为 `/records`、`/records/:id`、`/stats` 加 `requireRole('admin','hse_manager','safety_manager')` | 3 行 | ⚠️ **需单独授权**（跨域共享审计面） |

> **合计**：3 个后端（1 service + 1 router + 1 可选）+ 5 个前端（1 新建页 + 1 api + 1 路由 + 2 locale）+ 2 个可选加固。**均不涉及**冻结文件、`.env`、auth、users、gridScope、WPS、Scheduler。

### 20.1 后端改动为什么必须（而不是纯前端）

前端无法从 `/pending` 或 `site-mgmt/grid-records` 得到 `attribution_status IN ('manual_confirmed','attributed')` 的数据集：
- `/pending` 谓词互斥；
- `site-mgmt/grid-records` **冻结** + 无该过滤参数 + 权限码含 `grid_inspector` + 返回体无归属字段（§4.3）。

---

## 二十一、明确**不应该修改**的文件（红线清单）

| 类别 | 文件 / 对象 | 理由 |
|---|---|---|
| **生产进程** | PID `23396`（:5876） | §十三 生产边界；重启需单独授权 |
| **环境** | `server/.env` | 冻结（mtime 必须保持 `2026-09-11 22:22:50`） |
| **冻结业务文件** | `routes/site-mgmt.js` | 八类禁（冻结组件禁改）⇒ **这也是不能用 `grid-records` 的根因（§4.3）** |
| **冻结组件** | `services/gridScope.js`、`authenticatedEmployeeResolver`、`services/wpsGridPullEngine.js`、`services/wps/wpsFieldMap.js`、`middleware/auth.js`、`config/db.js` 等 9 个冻结文件 | 八类禁 |
| **04-C 已验收面** | `views/site/grid/attribution/index.vue`（**结构**）、`GET /pending` 的**响应封装** | §十七；除非**选定方案 A**并单独授权 |
| **共享中间件** | `middleware/encryption.js` | R2 已完成（04-C 阶段），**不要再改**（§十六） |
| **导入重构在制品** | `controllers/hse-import.js`、`routes/import.js`、`routes/import/`、`controllers/import.js`、`services/import*Service.js`、`services/importShared.js` | **并行开发中**（非本线），碰它会制造冲突 |
| **权限面** | `users` 表、JWT 载荷、`requireRole` 白名单、角色枚举 | §八 硬约束 |
| **WPS 面** | WPS 表、Pull Engine、Scheduler、反写 | ARCH-03 边界 |
| **数据库** | 任何 DDL（含加 `CHECK` 约束、加索引） | 生产 DDL 需单独授权（§2.4 G3 仅登记） |
| **死代码** | `services/wps/gridEnrichmentService.js`（零引用） | 接线＝独立 worker，属另一阶段 |
| **测试开关** | `P2B1D_FORCE_AUDIT_FAIL` | 仅测试；生产永不可设 |

---

## 二十二、下一阶段实施建议（04-D-B）

### 22.1 ⚠️ 必须优先裁决的 3 项（否则实施会踩坑）

| # | 事项 | 说明 | 建议 |
|---|---|---|---|
| **DEF-A** | **04-C 路由对 `hse_manager`/`safety_manager` 不可达** | 已用**仓库真实 `filterTree`** 证明：`/site` 与 `/site/grid` 祖先 `authority=['admin','grid_inspector']` ⇒ 角色为 `hse_manager` 的用户 **`/site` 整棵树被丢弃（可达 0 条）**，永远进不了 `/site/grid/attribution`。**仅 `admin` 可达**（这正是 04-C E2E 用 admin 因此未暴露的原因）。<br>**当前影响 = 0 用户**（DB 实测无 `hse_manager`/`safety_manager` 账号）⇒ **latent 缺陷**，但一旦建此类账号即**立即可见**。<br>**已验证的最小修复**（仅放宽两个**祖先**节点）：`hse_manager` → 可达 `/site`, `/site/grid`, `/site/grid/attribution`；`safety_manager` 同；`grid_inspector` **不变**（仍无 attribution）；`township_manager` **仍为空** ⇒ **无过度暴露**（兄弟叶子各自保留更窄 authority 被正确过滤）。 | **建议随 04-D-B 一并修**（1 文件 +2 行，纯放宽祖先，叶子不动）。**需你单独授权**（触碰 04-C 路由文件）。 |
| **G1** | 必须新增后端只读 GET | 无任何既有可复用路径（§4.3） | 实施 §6 |
| **G2** | `/pending` 无真实分页 | 硬编码 `limit=500/offset=0`、无 `total`、无 `truncated` | **本阶段不修**（§十二）；登记；stamping 上线前必须处理 |

### 22.2 技术缺口清单（G1–G5，均不阻断 04-D-B）

| # | 缺口 | 影响 | 处理 |
|---|---|---|---|
| **G1** | 无「已归属」查询 API | **阻断** 04-D-B | ✅ 04-D-B 新增（§6） |
| **G2** | `/pending` 无真实分页/无真 total | 现在无影响（0 行）；stamping 后可截断 | 04-D-B 或后续阶段一并补；**不得假分页** |
| **G3** | `attribution_status` 无 `CHECK` 约束、**无索引** | 状态机仅靠应用层；大表时 `IN (...)` 会全表扫（当前 2061 行，无感知） | 登记；如需加索引/约束**须单独授权 DDL**（可加**部分索引** `WHERE attribution_status IS NOT NULL`，与 P2-B2 扩展列 DDL 一并评估） |
| **G4** | `updated_at` 被 Pull 每 15 分钟重写 | ⚠️ **不能**用作归属时间/排序依据 | **设计已规避**（§6.4：排序用 `id DESC`，归属时间取 audit） |
| **G5** | `reason` 不落库 | 撤销原因**不可追溯** | 若业务必需，需授权改 `audit_record`（加列）或用 `sys_operation_log`；**04-D-B 不做** |

### 22.3 附带发现（H1，非阻断）

`GET /api/hse/audit-records/*` **无角色门**（仅全局 `authMiddleware`）⇒ 任何已登录用户（含 `grid_inspector`）可读取全量 `audit_record`（含 `old_value`/`new_value`）。
- **性质**：既有设计，非本阶段引入。
- **与 04-D 的关系**：若 04-D 复用其做「审计轨迹抽屉」，则**同一条数据同时暴露给网格长**。建议**单独授权加 `requireRole`（3 行）**，或 04-D 不复用（改由 `/attributed` 附带返回）。
- **现状**：`audit_record` 全库 0 行 ⇒ **当前无数据可泄漏**。

### 22.4 实施顺序建议

```
04-D-B-1  后端：service 新增 getAttributedRecords/Count（纯 SELECT）+ router 新增 GET /attributed
          └─ 验收：dev 造数 → 断言 manual_confirmed/attributed 均可查、count 一致、NULL 行被排除
04-D-B-2  前端：api/hse/grid-attribution.ts 新增类型与函数
04-D-B-3  前端：新建 views/site/grid/attribution-confirmed/index.vue
          └─ 复用 HsePageLayout/HseSearchPanel/HseActionBar/HseDataGrid/NDatePicker/NSelect/NTag
          └─ 巡查人姓名用 POST /employees/selector/batch 批量回显（零新增 API）
          └─ 不显示「归属时间」列；明细抽屉复用 /hse/audit-records/records（待 H1 决策）
04-D-B-4  路由：hse-site.ts 新增路由 + authority（+ 视裁决结果一并修 DEF-A）
04-D-B-5  locale：zh-CN / en-US 各 +2 键
04-D-B-6  【Revoke UI 独立阶段 04-E】NDialog/NModal 二次确认 → DELETE /revoke（只发 record_id + reason）
          └─ 仅 manual_confirmed 渲染按钮；成功后仅刷新列表；防重复点击
```

> **为什么把 Revoke UI 拆到 04-E**：用户已明确 04-D 第一版**只允许 `manual_confirmed → pending`** 且 **04-D 先只做「查看」**。把「已归属查看」与「撤销写操作」拆开，可让写操作单独验收（含并发/审计/门禁测试），风险最低。

### 22.5 需要你授权的动作（本阶段**均未执行**）

1. ⚠️ **DEF-A 修复**（`hse-site.ts` 祖先 `authority` +2 行）—— 触碰 04-C 路由文件。
2. ⚠️ **H1 加固**（`hse-audit-records.js` 加 `requireRole`，3 行）—— 跨域共享审计面。
3. 生产侧：重启 `23396`（使 R2 + 04-B 路由在生产生效）、执行 stamping（使通道 B 有真实数据）。
4. 方案 A vs B（§8.2）的最终选择。

---

## 附录 R｜本轮风险与坑（新增）

| # | 坑 | 事实 | 处理 |
|---|---|---|---|
| **R7（复用自 04-C）** | `gir.created_at` / `updated_at` / `audit_record.created_at` 均为 **`timestamp without time zone`** | timestamptz 字面量会**过匹配**（曾误删 16 行 dev 审计） | 清理/过滤按 `id`；如必须按时间，用 `::timestamp` 显式字面量 |
| **R9（本轮新增）** | `gir.grid_id` 的 FK 是 **`ON DELETE SET NULL`** | 网格被删 ⇒ `manual_confirmed` 行的 `grid_id` 变 NULL（**状态不变**），形成「已归属但无网格」的行 | 已归属查询**只按 `attribution_status` 过滤**（§6.3）；UI 渲染 `-` |
| **R10（本轮新增）** | `updated_at` 被 **Pull Engine 每 15 分钟重写**（`wpsGridPullEngine.js:292`） | 实测 1708 行 `updated_at != created_at`，而归属数为 0 | **不得**用 `updated_at` 作归属时间/排序（§6.4） |
| **R11（本轮新增）** | Vben `filterTree` 是**严格自顶向下**（父不通过 ⇒ 整棵子树丢弃，**不会**因叶子通过而保留父） | 04-C 的 `authority` 与其祖先不匹配 ⇒ DEF-A | 祖先 `authority` 必须**覆盖**所有后代角色 |
| **R12（本轮新增）** | `audit_record.record_id` 是 **`character varying`**（非整型） | 查询需 `recordId=<数字>`（后端 `String()` 转换）；SQL 中与整数比较需显式转换 | 复用 audit API 时传字符串 |
| **R13（本轮新增）** | 「401/403 不是路由可达性的证据」的**前端版本** | 后端 `requireRole` 通过 ≠ 前端路由可达（反之亦然，见 DEF-A 的两栏矩阵） | 授权审计必须**同时**核对后端 `requireRole` 与前端 `meta.authority` **整条祖先链** |

---

## 附录 S｜本阶段边界自证（逐条对照用户 20 节要求）

| 用户要求 | 本阶段执行 |
|---|---|
| 只读审计 / 设计，**不直接开发** | ✅ **未写任何业务代码**（本轮 `git status` 新增改动 = 0） |
| 不实现 revoke UI、不调用 DELETE /revoke | ✅ 未调用、未实现 |
| 不改 `gridAttributionService.js` / `hse-grid-attribution.js` | ✅ **未改**（仅只读阅读） |
| 不改 `encryption.js`（R2 已完成） | ✅ 未改 |
| 不重写 04-C 页面 | ✅ 未改 04-C 任何文件 |
| 生产严格只读（SELECT/health/静态审计） | ✅ 全部 SELECT；无 DML/POST(写)/DELETE；未重启 23396 |
| 不改 `.env`/Scheduler/Pull/`site-mgmt.js`/auth/users/gridScope/冻结文件 | ✅ 均未改（逐项实测，§19） |
| 如需验证只用 `safety_dashboard_dev`，并显式确认 `DB_NAME` + 三闸 | ✅ 5881/5882 实测**仅 dev 计数增长**；三闸为 false（04-C 阶段启动时设置） |
| 5881 若连生产库须立即停止 | ✅ 实测为 dev，未触发 |
| R2 最小回归（只读/dev） | ✅ 双实例 PASS（§18） |
| 不新建通用组件 | ✅ 未新建任何组件（仅方案） |
| 不新 npm 依赖 / 不用 Element Plus / antd | ✅ 方案**全部**基于 Naive UI + 现有 HSE 封装 |
| 不新增角色 / 不改 JWT / auth / users | ✅ 方案沿用 `requireRole('admin','hse_manager','safety_manager')` |
| 报告输出至指定路径 + 22 节 | ✅ 本文件 |
| 完成后**立即停止**，不自动进入 04-D-B | ✅ **停止**；未实施、未改生产、未自动推进 |

---

## 二十三、最终状态

```
PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_04-D-A_READY
```

**判定依据**：
- ✅ 22 节审计全部完成，全部结论均有**实测证据**（源码 + DB + 运行实例 + 仓库内真实实现的行为验证）。
- ✅ **无阻断项**（`NEEDS_REVIEW` 条件未触发）：未发现任何「无法在不破坏边界的前提下推进」的障碍。
- ⚠️ 但存在 **1 项 latent 可达性缺陷（DEF-A）** 与 **5 项技术缺口（G1–G5）**，均已在 §20/§22 给出最小方案与授权请求。
- ✅ 生产边界 **100% 守住**（§19 逐项实测）。
- ✅ **本阶段未实施任何代码/DDL/服务变更**。

**本阶段到此停止。**
未进入 04-D-B，未实现 revoke UI，未修改生产，等待下一条指令。
