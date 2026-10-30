# P2-OBJECTIVES ISSUE-02：预算状态语义污染专项审计 V1.0

> **审计性质：只读专项审计，不是开发修复。**
> 审计对象：`Objectives → 安全费用预算 → hse_safety_budget.status` 与 `calcBudgetStatus()` 派生状态之间的语义冲突。
> 结论：**AUDIT PASS WITH ISSUES**（ISSUE-02 已确认，污染链路与影响边界完全查清；当前数据库尚未被污染）。

---

## 1. 审计范围

- 后端预算域：`server/services/objectiveService.js`、`server/controllers/objectiveController.js`、`server/routes/objectives/main.js`
- 数据库：`safety_dashboard_dev` 的 `hse_safety_budget` 表（只读 SELECT）
- 前端预算 CRUD 页：`安全看板vben/apps/web-naive/src/views/objectives/budget/expenditure/index.vue`
- 前端 API 适配层：`安全看板vben/apps/web-naive/src/api/hse/goals.ts`
- 预算导入导出：`server/services/importShared.js`、`server/services/importExcelService.js`
- 规则配置：`server/config/hseRules/index.js`

**明确排除（不在本审计对象内）：** `src/api/hse/cost.ts`、`src/views/objectives/cost/index.vue`、`server/routes/cost.js` 属于 GAP-03 / P0 的**另一套**「成本（/api/cost/budgets）」新模块，与本次 `hse_safety_budget`（/api/objectives/safety-budget）预算模块无关，仅在工作树中并列存在，不影响本 ISSUE-02 链路。

---

## 2. GitHub 基线

```
5e8b052  （本地 HEAD = 5e8b0524ccd69369e59857024f0640cadec5f4cb，与 GitHub 基线完全一致）
```

---

## 3. 本地工作树状态

```
HEAD:      5e8b0524ccd69369e59857024f0640cadec5f4cb
分支:      feat/hse-business-closure
工作树:    与 GitHub 基线存在【未提交】差异（详见第 4 节末「GitHub 与本地的差异」）
```

已知本地未提交内容（与任务预期一致，未做任何 reset/revert/checkout/stash/commit/push/merge，未修改已存在未提交文件）：

| 文件 | 状态 | 说明 |
|---|---|---|
| `server/services/objectiveService.js` | M (tracked) | 方案 A：删除错误 `year` 映射（`-1` 行） |
| `安全看板vben/.../src/api/hse/cost.ts` | M (tracked) | GAP-03，+106 行 |
| `安全看板vben/.../src/views/objectives/cost/index.vue` | M (tracked) | GAP-03，+315 行 |
| `server/routes/cost.js` | ?? (untracked) | P0 新文件 |
| 8 个 `*.md` 审计报告 / `acl-out/` / `test-write.txt` | ?? (untracked) | 历史审计产物 |

`git diff --check` 对 tracked 改动结果：**干净（exit 0）**，无空白冲突。

---

## 4. 数据库真实字段

### 4.1 字段定义（`information_schema.columns`，dev）

| column_name | data_type | is_nullable | column_default |
|---|---|---|---|
| `status` | character varying | YES | `'active'::character varying` |
| `use_status` | character varying | YES | （无默认值） |

### 4.2 `status` 当前存量分布（live，`is_deleted=false`）

```
active | 101
```
**仅 `active` 一种取值。不存在 `planning`、`normal`、`warning`、`overspend`。**

### 4.3 `use_status` 当前存量分布（live）

```
未支出 | 67
已支出 | 34
```
`use_status` 承担「使用状态」语义（未支出 / 已支出），与 `status` 是**不同维度**的业务字段。

### 4.4 总量

```
is_deleted=false : 101   （live）
is_deleted=true  : 238   （软删）
合计             : 339
```

### 4.5 存量污染检查（期望为空，已确认）

```sql
SELECT ... WHERE status IN ('normal','warning','overspend')  →  0 行
```
**结论：当前数据库 `status` 字段未被派生值污染（全部为业务值 `active`）。** 但污染机制已激活（见第 15 节），下一次任意编辑即会污染。

---

## 5. `status` 语义证据

`status` 字段意图是**业务生命周期状态**：

- 数据库默认 `'active'`（4.1）。
- 导入 `statusMap` 写入：`active / completed / pending / draft`（`importShared.js:971-975`）。
- 前端表单/筛选/标签仅认知：`planning / executing / completed`（`expenditure/index.vue:162-171, 486-490, 626-630`）。
- 前端创建默认：`status: 'planning'`（`expenditure/index.vue:255, 283`）。

→ 证据指向：`status` = **A. 业务生命周期状态**（取值空间：active / planning / executing / completed / pending / draft）。

`calcBudgetStatus()` 返回的 `status: 'normal'/'warning'/'overspend'` 是**B. 预算执行健康度**，与 A 是**两个不同概念**，却被写入了同一个 `status` 字段（见第 7、12 节）。

---

## 6. `use_status` 语义证据

- 定义：可空，无默认值（4.1）。
- 写入方：前端表单 `useStatus` 选项 `已支出 / 申请中 / 未支出`（`expenditure/index.vue:615-619`），经 `budgetToSnake` 的 `use_status: b.useStatus`（`objectiveService.js:361`）写库；导入默认值 `未支出`（`importExcelService.js:532-533`）。
- 读取方：`budgetToCamel` 映射 `useStatus: r.use_status`（`objectiveService.js:332`）；前端列 `使用状态` 与详情展示（`:507, :659`）。
- 存量：未支出 67 / 已支出 34（4.3）。

→ `use_status` 是**独立的「使用/支出状态」业务字段**，语义清晰，目前**未被污染**，也不参与本 ISSUE-02 的派生覆盖。

---

## 7. `calcBudgetStatus()` 证据

**真实代码（`objectiveService.js:155-162`，与 GitHub 基线一致）：**

```js
function calcBudgetStatus(budgetAmt, spentAmt) {
  if (!budgetAmt || budgetAmt <= 0) {
    return { executionRate: 0, status: 'normal' };
  }
  const rate = (spentAmt / budgetAmt) * 100;
  const warn = getBudgetWarningThreshold();   // 默认 85（hseRules:329）
  let status = 'normal';
  if (rate >= 100) status = 'overspend';
  else if (rate >= warn) status = 'warning';
  return { executionRate: Math.round(rate * 100) / 100, status };
}
```

### Q1：这个 `status` 代表什么？
**预算执行健康度（B 类）**：根据「已支出 / 预算」执行率判定 `normal(<85%) / warning(≥85%) / overspend(≥100%)`。**不是**业务生命周期、审批状态或使用状态。

### Q2：`executionRate` 与 `status` 是否成对出现？
是。函数固定返回 `{ executionRate, status }` 二元组，两者始终成对。

### Q3：是否存在覆盖式展开？
**存在，且是污染根源：**

- `budgetList`（`objectiveService.js:1371-1374`）：
  ```js
  return { ...budgetToCamel(row), ...calcBudgetStatus(b, s) };
  ```
  `budgetToCamel(row)` 已含 `status`（= DB 业务值），随后 `...calcBudgetStatus` 用派生 `status` **覆盖**了它。
- `budgetDetail`（`objectiveService.js:1396`）：
  ```js
  return ok({ ...budgetToCamel(row), ...calcBudgetStatus(...) });
  ```
  同样覆盖。

**对比（正确的不对称）：** `budgetCreate`（`objectiveService.js:1408`）与 `budgetUpdate`（`objectiveService.js:1435`）的返回值是 `ok(budgetToCamel(r.rows[0]))`，**不**展开 `calcBudgetStatus` —— 即 CREATE/UPDATE 响应返回的是**真实 DB 业务 status**，而 LIST/DETAIL 返回的是**派生 health**。这种不对称正是污染得以成立的隐蔽前提。

---

## 8. LIST 链路

1. SQL：`SELECT * FROM hse_safety_budget WHERE is_deleted=false ...`（`objectiveService.js:1369`）。原始返回含 `status`（DB 业务值）。
2. 返回前端前：`listR.rows.map(row => ({ ...budgetToCamel(row), ...calcBudgetStatus(b, s) }))`（`:1371-1374`）。
3. 覆盖：`calcBudgetStatus` 的 `status`（normal/warning/overspend）覆盖 DB `status`。
4. **最终 JSON 的 `status` 来自计算结果，不是数据库。**

**证据：** `expenditure/index.vue:196` `budgetList.value = res.list`；列表无 `status` 列（`:94-151`），但状态筛选下拉只有 `planning/executing/completed`（`:486-490`），而后端按 `status=`（`:1365`）过滤的是 DB 业务值 —— 由于列表返回的已是派生 `normal/...`，**筛选功能实际失效**（按 planning 过滤永远 0 条）。

---

## 9. DETAIL 链路

1. SQL：`SELECT * FROM hse_safety_budget WHERE id=$1 AND is_deleted=false`（`:1393`）。
2. 返回：`{ ...budgetToCamel(row), ...calcBudgetStatus(...) }`（`:1396`）—— 同样覆盖。
3. 前端 `handleView(record)`（`expenditure/index.vue:322-324`）直接复用 LIST 行对象 `currentBudget = record`，未单独请求 `getBudgetDetail`，故详情抽屉显示的 `status` 同样是 LIST 的派生值。
4. 详情渲染：`STATUS_TAG[currentBudget.status]` / `STATUS_TEXT[currentBudget.status]`（`:669-670`）—— 这两个映射**只有** `planning/executing/completed`（`:162-171`），遇到 `normal/warning/overspend` 走 `|| 'neutral'` 与原文回退，显示异常。

**结论：DETAIL 链路 `status` 也被派生值覆盖（服务端端点 + 前端详情抽屉双重体现）。**

---

## 10. CREATE 链路

- Route：`POST /objectives/safety-budget` → `router.post('/budgets', ctl.budgetCreate)`（`main.js:88`），别名 `/safety-budget` 转发（`:124`）。
- Controller：`budgetCreate(req, res)` → `service.budgetCreate(req.body)`（`objectiveController.js:239-240`）。
- Service：`budgetCreate`（`objectiveService.js:1400-1410`）：`fm = budgetToSnake(b)` → `status: b.status`（`:362`）→ `INSERT INTO hse_safety_budget(...) VALUES(...)`（`Object.keys(fm)` 全列，`:1406-1407`）。
- 前端：`handleCreate` → `resetBudgetForm` 设 `status: 'planning'`（`expenditure/index.vue:283`）→ `createBudget(data)`（`goals.ts:463-465`）→ `handleSave` 发 `status: budgetForm.status`（`:362`）。

### A. 前端创建 `status='planning'` 如何进 service？
经 `data.status = budgetForm.status = 'planning'` → `createBudget` POST body → `req.body.status` → `budgetToSnake(b).status` = `'planning'`。

### B. `budgetToSnake()` 是否保留 `status: b.status`？
**是**（`:362` `status: b.status` 显式保留）。

### C. INSERT 最终写入 `planning` 还是默认 `active`？
写入 **`planning`**（前端显式传值，覆盖列默认值）。若前端未传 `status`，`budgetToSnake` 仍把 `status: undefined` 列入列集合 → INSERT 显式写入 `NULL`（**不触发** DB 默认 `'active'`），这是潜在独立缺陷，但非本次污染主因。

**CREATE 结论：不被派生值污染**（创建默认恒为 `planning`，直接落业务值）。

---

## 11. UPDATE 链路（ISSUE-02 核心）

- Route：`PUT /objectives/safety-budget/:id` → `router.put('/budgets/:id', ctl.budgetUpdate)`（`main.js:89`），别名转发（`:125`）。
- Controller：`budgetUpdate(req.params.id, req.body)`（`objectiveController.js:242-243`）。
- Service：`budgetUpdate`（`objectiveService.js:1412-1437`）：`fm = budgetToSnake(b)` → 仅 `v !== undefined` 列入 SET（`:1426-1432`）→ `UPDATE ... SET status=$n ...`（`:1434`）。
- 前端回填：`handleEdit(record)` 中 `status: record.status || 'planning'`（`expenditure/index.vue:317`）。**`record` 是 LIST 行，其 `status` 已被 calcBudgetStatus 覆写为 `normal/warning/overspend`**。
- 前端保存：`handleSave` 中 `data.status = budgetForm.status`（`:362`）→ `updateBudget(id, data)`（`goals.ts:467-468`）→ PUT body 携带该派生值。

### 为什么仅改备注/年度，`status` 会从 `planning/active` 变 `normal`？

完整时序（以一条 `status='active'`、支出率 0% 的记录为例）：

```
GET /budgets → LIST 行 status = calcBudgetStatus(...) = 'normal'   （业务值被覆盖）
   ↓
handleEdit(row): budgetForm.status = row.status = 'normal'          （回填派生值）
   ↓
用户仅改 remark → handleSave: data.status = 'normal'               （未察觉）
   ↓
PUT /budgets/:id → budgetToSnake → status:'normal'                 （业务值被写坏）
   ↓
UPDATE hse_safety_budget SET status='normal' ...                   （DB 业务 status 丢失）
```

**根因：LIST/DETAIL 把派生 health 当 `status` 返回 → 前端回填拿到派生值 → 保存时原样回写 → 业务 status 被不可逆覆盖。** 这正是浏览器回归实测「新建 planning → 编辑保存后变 normal」的代码级解释。

**UPDATE 结论：被污染（YES），是 ISSUE-02 的主战场。**

---

## 12. 前端回填与 PUT payload

| UI 字段 | API 字段 | DB 字段 | 备注 |
|---|---|---|---|
| 表单 `budgetForm.status`（NSelect，选项 planning/executing/completed） | `data.status` | `status` | 编辑时回填来源 = LIST 派生值（污染入口）|
| 表单 `budgetForm.useStatus`（选项 已支出/申请中/未支出） | `data.useStatus` | `use_status` | 独立业务字段，正常 |
| 列表筛选 `searchForm.status`（选项 planning/executing/completed） | `params.status` | `status`（WHERE） | 因 LIST 返回派生值，筛选失效 |
| 详情 `currentBudget.status` | LIST 行 `status` | — | 显示异常（映射缺失）|

**是否存在 `status = executionStatus` 语义混用？** 前端目前**不存在** `executionStatus` 字段（全局 grep 0 命中）。系统把「业务生命周期状态」与「执行健康度」硬塞进同一个 `status` 字段，前端 `STATUS_TAG/STATUS_TEXT` 只认前者，导致后者显示与筛选双双失效。

---

## 13. IMPORT / EXPORT

### 导入（`importShared.js` + `importExcelService.js`）
- 字段映射：`'状态': 'status'`、`'使用状态': 'use_status'`（`importShared.js:966`）。
- `statusMap`（`importShared.js:971-975`）：`执行中/进行中/有效→active`、`已完成/已结束→completed`、`待审批→pending`、`草稿→draft`。
- 应用点（`importShared.js:1548-1549`）：`if (dbField==='status' && statusMap[value]) value = statusMap[value]`。
- 默认值：`use_status` 缺省 `未支出`（`importExcelService.js:532-533`）；**`status` 无默认值**（Excel 无「状态」列时写 `NULL`，潜在独立缺陷）。
- 写入路径：导入走自身批量 INSERT（**不**经 `budgetToSnake`），直接写 `status` 业务值。

**导入是否污染？** **否。** 导入只写业务 status（active/completed/pending/draft 或 Excel 原文），**不产生** `normal/warning/overspend`。但导入与「拆分字段」方案相关：若把 `status` 拆成「生命周期 + 执行健康度」，Excel「状态」列应映射到生命周期字段，健康度改为服务端计算（见第 18 节）。

### 导出（`budgetExport`，`objectiveService.js:1379-1385`）
- `SELECT * FROM hse_safety_budget WHERE is_deleted=false` 原样返回，**包含 `status` 与 `use_status` 存储值**。
- **导出本身不污染**，但若 DB 已被 UPDATE 污染（status='normal'），导出会如实携带污染值。

---

## 14. 存量污染检查

只读查询（第 4.5 节）：`status IN ('normal','warning','overspend')` 命中 **0 行**；全部 101 条 live 为 `active`。

**当前存量未被污染。但污染机制已就绪：**
- 任意一条 live 记录一旦被编辑（即使只改备注/年度），`status` 即被覆写为 `normal/warning/overspend`（取决于支出率）。
- 编辑前无需任何用户主动选状态 —— 派生值经回填静默回写。

---

## 15. 实际污染链（按真实代码重建）

```
DB.status = 'active'  （业务生命周期；CREATE 写 / 导入写）
   ↓  budgetList: SELECT * → budgetToCamel(row){ status:'active' }
   ↓  ...calcBudgetStatus(b, s)  → { executionRate, status:'normal' }
   ↓  （对象展开，后者覆盖前者）★
   ↓  LIST 响应 status = 'normal'            ❌ 业务 status 被派生 health 覆盖
   ↓  前端 handleEdit(record): status = record.status   → 'normal'
   ↓  回填 budgetForm.status = 'normal'
   ↓  用户改备注 → handleSave: data.status = 'normal'
   ↓  PUT /budgets/:id → budgetToSnake → status:'normal'
   ↓  UPDATE hse_safety_budget SET status='normal'      ❌ 业务 status 被写坏
   ↓  DB.status = 'normal'
```
★ 覆盖点：`objectiveService.js:1373`（LIST）、`:1396`（DETAIL）。
回写点：`objectiveService.js:1434`（UPDATE）+ 前端 `expenditure/index.vue:317, 362`。

---

## 16. 影响范围矩阵

| 项 | 是否影响 | 证据 |
|---|---|---|
| CREATE | **NO** | 创建默认 `planning` 直写业务值，不经派生（`:1408` 响应也不含 calc） |
| UPDATE | **YES** | `:1434` + 前端回填 `:317`/`:362`，派生值覆写业务值 |
| LIST | **YES** | `:1373` 派生覆盖；状态筛选 `:486-490` 因返回值不符而失效 |
| DETAIL | **YES** | `:1396` 派生覆盖；详情抽屉 `:669-670` 映射缺失显示异常 |
| IMPORT | **NO** | 只写业务 status（statusMap），不产生派生值；不经 `budgetToSnake` |
| EXPORT | **NO**（传播型） | `:1383` 原样导出；不生成污染，但携带已有污染 |
| 统计 | **NO** | `budgetStats` 返回 total/planTotal/spentTotal/executionRate/warningItems，无 status 字段 |
| 存量是否已污染 | **NO（当前）** | 101 条 live 全 `active`，0 条 normal/warning/overspend；机制已就绪 |

---

## 17. 风险等级建议

**风险等级：高（HIGH）**，但当前**可逆**（DB 尚未污染）。

- 触发条件极低：用户**任何一次**编辑预算记录（哪怕只改备注）即写坏 `status`。
- 双重可见性破坏：列表/详情的「状态」展示错乱 + 状态筛选功能失效。
- 隐蔽性强：前端状态下拉只列 planning/executing/completed，派生值 `normal` 不在选项中却能被静默回填，用户无感知。
- 建议：**在下次生产编辑发生前**修复（见第 18 节），并尽快对可能被污染的历史 DB 做一次性核对（当前 0 命中，可省略）。

---

## 18. 最小修复候选方案（仅提出，不实施）

> 本轮禁止修改代码/DB/前端/API/导入导出。以下方案仅供决策。

### 方案 A（推荐，最小且根因修复）
- 改动文件：`server/services/objectiveService.js`（仅 `budgetList` `:1373`、`budgetDetail` `:1396`）。
- 是否改 DB：**否**。
- 是否改前端：**需配套**（详情/列表 health 显示改读新字段）。
- 做法：将 `...calcBudgetStatus(b, s)` 改为 `{ executionRate, executionStatus: calc.status }`，停止用派生 `status` 覆盖业务 `status`。LIST/DETAIL 的 `status` 恢复为 DB 业务值（筛选与标签恢复正确），健康度改由 `executionStatus` 展示。
- 是否影响历史数据：**否**（不改存储）。
- 是否影响 API contract：**是（新增字段 `executionStatus`/`executionRate` 已存在）**，属向后兼容新增；前端需同步读取。
- 风险：低。回滚：单文件还原，易。
- 附带收益：UPDATE 污染自然消失——回填来源变为干净的业务 `status`。

### 方案 B（仅后端、不动前端契约语义）
- 改动文件：`objectiveService.js` 同 A，但前端暂不改，仅停止覆盖（health 暂不在 UI 体现）。
- 是否改 DB：否。是否改前端：否（短期）。
- 风险：低；但 UI 暂时看不到执行健康度（可接受过渡）。回滚易。

### 方案 C（彻底拆分：新增 `execution_status` 列）
- 改动文件：`objectiveService.js` + migration（新增列）+ 导入映射 + 前端。
- 是否改 DB：**是（DDL + 数据迁移）**。
- 是否影响历史数据：**是**（需回填 `execution_status`，并把旧 `status` 中误写的 normal/warning/overspend 还原为业务值）。
- 是否影响 API contract：是（结构性）。
- 风险：中高；回滚难（需反向 migration）。
- 评价：过度设计，非「最小修复」，不推荐作为首选项。

**三方案共同前提：** 无论选哪个，UPDATE 路径都必须确保 `status` 回填来源是业务值而非派生值（方案 A/B 通过停止覆盖天然满足；方案 C 需显式分离）。

---

## 19. 最终判定

**AUDIT PASS WITH ISSUES**

- ISSUE-02 已确认：污染链路（LIST/DETAIL 派生覆盖 → 前端回填 → UPDATE 回写）完整查清，证据链闭合（后端 `:1373/:1396/:1434` + 前端 `:317/:362` + 数据库分布）。
- 影响边界完全查清（第 16 节矩阵）。
- 当前数据库**尚未**被污染（第 4、14 节），故不判系统 FAIL；但机制已激活，风险高。

---

## 20. 必须返回项

1. **判定**：AUDIT PASS WITH ISSUES
2. **实际修改文件数量**：0（本轮只读，未改动任何文件）
3. **`git diff --check`**：干净（exit 0）
4. **GitHub 5e8b052 与本地差异**：本地含未提交改动——`objectiveService.js`(-1，方案 A)、`cost.ts`(+106，GAP-03)、`cost/index.vue`(+315，GAP-03)、新增 `server/routes/cost.js`(P0) 及若干审计报告/目录；GitHub 仍为 5e8b052，未提交未推送。
5. **status 真实语义**：业务生命周期状态（取值 active/planning/executing/completed/pending/draft；DB 默认 active）。
6. **use_status 真实语义**：独立的「使用/支出状态」业务字段（未支出/已支出/申请中），未被污染。
7. **calcBudgetStatus 真实作用**：返回预算执行健康度 `{executionRate, status:'normal'/'warning'/'overspend'}`，按支出率（默认阈值 85%）判定；与业务 status 是不同概念却被写入同一字段。
8. **LIST 链路**：`SELECT *` → `budgetToCamel` → `...calcBudgetStatus` 覆盖 `status`（`:1373`）；响应 `status` 来自计算，非 DB；状态筛选失效。
9. **DETAIL 链路**：`SELECT * WHERE id` → `...calcBudgetStatus` 覆盖（`:1396`）；前端详情抽屉复用 LIST 行，同样显示派生值。
10. **CREATE 链路**：`budgetToSnake` 保留 `status: b.status`（`:362`）；前端默认 `planning`；INSERT 写业务值；**不污染**。
11. **UPDATE 链路**：`budgetToSnake` 保留 `status: b.status`；前端回填 `record.status`（派生值，`:317`）→ 保存回写 `:362` → `UPDATE` 写派生值（`:1434`）；**污染核心**。
12. **前端回填/PUT payload**：`handleEdit` 回填 LIST 派生 `status`；`handleSave` 经 `data.status` 发 PUT；API 层 `goals.ts` 纯透传；表单状态下拉仅 planning/executing/completed，与派生值冲突。
13. **import/export 影响**：导入只写业务 status（statusMap），不产生派生值，**不污染**；导出原样返回存储值，不生成污染但传播已有污染。
14. **存量污染情况**：当前 0 条 normal/warning/overspend，101 条全 `active`；**未被污染**，但机制已就绪，首次编辑即污染。
15. **完整污染链**：见第 15 节（DB active → LIST 覆写 normal → 前端回填 → PUT → UPDATE 写 normal）。
16. **影响范围矩阵**：见第 16 节（CREATE/IMPORT/EXPORT/统计=NO；UPDATE/LIST/DETAIL=YES；存量=当前 NO）。
17. **最小修复候选**：见第 18 节（A 推荐 / B 过渡 / C 过度）。
18. **数据库是否发生任何写入**：**否**（仅执行 `SELECT`/`information_schema` 只读查询，未执行任何 INSERT/UPDATE/DELETE/DDL）。
19. **是否 commit/push**：**否**（未执行任何 git commit / push / merge；仅读取 `git status`/`diff`）。
20. **报告路径**：`G:/hse-dashboard/OBJECTIVES_BUDGET_STATUS_SEMANTIC_AUDIT_V1.md`
