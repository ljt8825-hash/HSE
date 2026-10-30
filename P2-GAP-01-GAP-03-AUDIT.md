# P2 GAP-01 / GAP-03 审计结论（改码前必读）

> 基线：`feat/hse-business-closure` @ `5e8b052`（`5e8b0524ccd69369e59857024f0640cadec5f4cb`）
> 纪律：先审计、后改码；本文件所有结论均来自当前本地工作树源码 + dev 库实际结构直查，未引用任何历史报告作为事实依据。

> **最终状态（2026-10-23 收尾更新）**：GAP-03 已实现并通过浏览器验收（PASS）；**GAP-01 = BLOCKED**（§1.5：objectives 预算创建端点 year 列缺陷，修复需后端改动，超出本轮禁止范围）。本文档 §1.5/§3/§4 已按实现尝试后的实测证据修正。

---

## 0. P0 未提交修改保护（改码前核验）

| 检查项 | 命令 | 结果 |
|---|---|---|
| HEAD | `git rev-parse HEAD` | `5e8b0524ccd69369e59857024f0640cadec5f4cb` = `5e8b052` ✓ |
| 分支 | `git branch --show-current` | `feat/hse-business-closure` ✓ |
| `server/routes/cost.js` | `git status --short` | `??` 未跟踪新文件（18 行纯聚合入口，`router.use('/', require('./cost/main'))`），与上轮 P0-01 一致 ✓ |
| 成本页 diff | `git diff -- index.vue` | **+18/−1，仅 Naive UI import 块**（NAlert/NCard/NDataTable/NForm/NFormItem/NH2/NInput/NInputNumber/NModal/NSelect/NSpace/NStatistic + useMessage），无任何其它改动 ✓ |
| 工作树其它未跟踪项 | `git status --short` | `.accept2/`（上轮证据档）、3 份历史报告、`acl-out/`、`安全看板vben/test-write.txt` —— 与费用域无关，**不动** |

**结论：P0 未提交修改完好，无覆盖风险，未触发任何停止条件。**

---

## 1. GAP-01：预算主体无手工新增入口

### 1.1 页面「预算」到底对应什么（全链路证据）

```
页面组件  views/objectives/cost/index.vue（预算概览 n-card + budgetColumns）
   ↓  import { getBudgetOverview } from '#/api/hse/cost'
前端 API  cost.ts:128  getBudgetOverview() → GET /cost/budgets
   ↓
Express   routes/cost/main.js:26  router.get('/budgets', ctl.budgetOverview)
   ↓
Controller costController.js:33   budgetOverview → service.budgetFinancialOverview(req.query)
   ↓
Service   costService.js:840-879  SELECT b.id, b.budget_code, b.budget_year, b.project_name, b.item_name,
                                   b.budget_amount, ... FROM hse_safety_budget b WHERE b.is_deleted=false
   ↓
DB        hse_safety_budget（预算主体表）
```

**页面「预算」表格展示的就是预算主体（hse_safety_budget 行）**，每行含 项目名称 + 事项名称 + 预算金额 + 由交易表计算的财务状态。

### 1.2 预算主体实际字段（dev 库 `\d hse_safety_budget` 直查）

| 字段 | 类型 | 约束 |
|---|---|---|
| id | bigint | PK |
| budget_code | varchar(64) | 可空；**唯一索引 `hse_safety_budget_budget_code_key`**（NULL 不冲突） |
| budget_year | integer | **NOT NULL** |
| project_name / item_name | varchar(200) | 可空（导入业务键依赖二者非空） |
| budget_amount | numeric(14,2) | default 0 |
| category / department / purpose / remark | text/varchar | 可空 |
| status | varchar(32) | default 'active' |
| spent_amount 及其它计划/实际数量单价字段 | numeric | default 0 |
| created_at/updated_at/created_by/updated_by/is_deleted | — | 软删除标记 |

**唯一约束（`pg_indexes` 直查）**：
- `hse_safety_budget_budget_code_key`：budget_code 唯一；
- `uq_hse_safety_budget_bizkey`：(budget_year, project_name, item_name, budget_amount) 部分唯一（WHERE NOT is_deleted）——20261025 迁移所建。

### 1.3 是否存在预算主体 POST / UPDATE / DELETE

| 能力 | cost 域（/api/cost） | objectives 域（/api/objectives） |
|---|---|---|
| GET 列表 | ✓ `/budgets`（含财务状态计算） | ✓ `/safety-budget`（别名 `/budgets`） |
| **POST 创建** | **✗ 不存在** | **✓ `POST /safety-budget` → objectiveService.budgetCreate → `INSERT INTO hse_safety_budget`**（objectiveService.js:1408） |
| PUT 更新 | ✗ | ✓ `/safety-budget/:id` → budgetUpdate（软更新） |
| DELETE 删除 | ✗ | ✓ `/safety-budget/:id` → budgetDelete（软删除 is_deleted=true） |

**关键发现（推翻了"后端无 create contract"的预设，但该 contract 已坏）**：预算主体的在线创建代码路径**已经存在**，位于 objectives 域：
- 后端：`routes/objectives/main.js:88-90`（ budgets 写路由，仅全局登录鉴权，无 requireRole）+ `objectiveService.js:1401-1414`（budgetCreate，budgetToSnake 字段映射后直接 INSERT，**无应用层字段校验**，仅靠 DB NOT NULL/唯一约束兜底）；
- 前端：`api/hse/goals.ts:464-472` 已封装 `createBudget/updateBudget/deleteBudget`，且 `views/objectives/budget/expenditure/index.vue:366-416` **已在实际调用**（新增/编辑/删除/批量删除都在用）。
- 跨模块引用有先例：`views/hazards/index.vue` 同时引用 employee/goals/hazard 三个 api 模块。
- ⚠️ **但该 create 路径对 dev schema 确定性失败**（year 列不存在，详见 §1.5 证据链）——「有代码」≠「可用」。

### 1.4 预算主体 vs 预算明细关系

- **hse_safety_budget = 预算主体**：页面展示对象；Excel 导入直写（costService.js:1123 `INSERT INTO hse_safety_budget(...)`）。
- **hse_budget_item = 预算明细**（20261023 迁移所建）：`budget_id` 外键指向主体；`POST /api/cost/budget-items` **强制要求 budgetId**（costService.js:268「必须关联预算主体(budgetId)」）；**页面完全不展示明细、导入也不产生明细**。
- 即：当前产品设计 = 「预算主体在线维护（objectives 支出页）+ 批量导入（cost 页导入）双通道；明细层 API 具备但未投入使用」。

### 1.5 GAP-01 结论（实现尝试后修正为 **BLOCKED**）

> **初版审计结论「可复用 objectives 既有端点纯前端修复」已被实现尝试证伪。最终结论：GAP-01 = BLOCKED（停止条件 #1 触发），前端新增已回滚，仅报告证据。**

**证据链（四层，全部来自本轮实测）**：

1. **UI 实测**：成本页「新增预算」模态框提交 → `POST /api/objectives/safety-budget` → HTTP 200 + `code:-1`，服务端消息逐字为：
   `关系 hse_safety_budget 的 year 字段不存在`
2. **最小探针复验**：绕过 UI、以最小 payload 直连该端点 → **同样确定性失败**（与 payload 内容无关，排除前端传参问题）。
3. **源码根因**（`server/services/objectiveService.js`）：
   - `budgetToSnake()`（:338-367）fieldMap **恒含 `year` 键**（:341 `year: b.budgetYear ?? b.budget_year ?? b.year`）；
   - `budgetCreate()`（:1401-1411）用 `Object.keys(fm)` 取列名、**不过滤 undefined**（对比 `budgetUpdate` :1427 有 `if (v !== undefined)` 过滤）→ INSERT 列列表恒含 `year`；
   - 而同文件 `hse_safety_budget` DDL（:74-89）**只有 `budget_year`、没有 `year` 列** → PG 必然报「year 字段不存在」。
4. **git blame**：`year` 映射行（:341）与无 `year` 的 DDL（:75）**同出自 `cb9b956`（2026-09-13 三层化重构）** —— 缺陷自该提交诞生即存在，非分支漂移；dev 库实际结构（§1.2 直查）与 DDL 一致。

**影响面（既有缺陷，非本轮引入，仅记录不修复）**：
- objectives 支出页（`views/objectives/budget/expenditure/index.vue`）的「新增预算」**自 2026-09-13 起确定性失败**；任何由本代码 `ensureTables()` 建库的环境（含生产，同代码路径）同样缺失 `year` 列 ⇒ **生产同样坏掉的可能性极高**（未直连生产核验，不作断言）。
- `budgetUpdate` 仅当 body 含 budgetYear/budget_year/year 时才写入 `year` 列 ⇒ 改「年度/金额类」字段同样失败，改其它字段不受影响（部分坏）。

**修复方向（均超出本轮禁止范围，留待专项）**：
- 最小修：`budgetToSnake` 删除 `year` 键（或 budgetCreate 过滤不存在的列）—— 属改后端 objectives 模块，本轮禁改范围含「其它 HSE 模块」；
- 正规修：cost 域新增带校验的预算主体创建端点（toCents 严解析 + 行级必填 + 年度 4 位，对齐导入口径）—— 属「需新增预算主体 POST API」，**停止条件 #1 触发**。

**已执行动作**：GAP-01 前端新增（按钮/模态框/状态/函数/createBudget import）**全部回滚**，`grep` 验证零残留；`hasGap01Btn:0` 见浏览器验收 GAP-03-01。

**必须同时记录的三条告诫（原审计发现，依然有效，不本轮修复）**：
1. **校验不对称**：objectives 的 budgetCreate 无应用层校验（金额合法性、必填、年度格式均无），与 cost 域导入的严格校验（toCents 严解析 + 行级必填 + 年度 4 位）不一致。任何未来的修复端点都应带服务端校验，**后端仍是最终裁判**。
2. **唯一冲突错误原始**：撞 `budget_code` 唯一索引或 `uq_hse_safety_budget_bizkey` 时，服务端返回的是 PG 原始错误文本（经 err(-1, e.message) 透出）。前端对已加载列表（pageSize=100）做编码/业务键重复预检并拦截，DB 全量仍靠服务端。
3. objectives 写路由无 requireRole（仅登录即可写）——既有行为，本轮不碰；cost 页按钮按后端 costWriter 同角色集做 UX 置灰。

---

## 2. GAP-03：成本分摊前端无操作入口

### 2.1 allocation 四个接口的真实契约（controller → service 逐行确认）

**GET `/api/cost/allocations`**（allocationList，costService.js:594-608）
- Query：`page, pageSize, costActualId, requestId, bizDomainId`；`is_deleted=false`；ORDER BY id DESC
- 返回 `list(...)` → `buildListResponse` → `{code:0, data:{list,total,page,pageSize}, message}`；list 行为 `rowToCamel` 全字段（含 record_type）
- 行字段：id, costActualId, requestId, company, bizDomainId, opTypeId, investCategoryId, objectType, objectId, objectName, eventType, eventId, eventName, amount, recordType, remark, createdAt, updatedAt, isDeleted

**POST `/api/cost/allocations`**（allocationCreate，costService.js:629-681）
- **必填**：`costActualId`（必须存在且未删除的实际支出，否则 -2）、`amount`（parseAmountInput：>0、禁负/NaN/千分位/超两位小数）
- `recordType`：默认 `normal`，仅 normal/reversal，**必须与实际支出的 record_type 一致**（不一致 -1）
- `request_id` **不由前端传**——服务端取实际支出上的值（「防伪造错挂」，costService.js:667）
- 可选：company, bizDomainId, opTypeId, investCategoryId, objectType, objectId, objectName, eventType, eventId, eventName, remark
- **业务铁律**：事务内 `FOR UPDATE` 锁定实际支出；追加后「有效分摊净额」必须**恰好等于**「实际支出净额」——首笔不足（1000/1600）拒、超额（已满再+700）拒、仅允许一次补齐；失败整体回滚

**PUT `/api/cost/allocations/:id`**（allocationUpdate，costService.js:687-748）
- body 可含任意白名单列；`amount` 可选（不传则只改其它字段）
- 事务内锁定分摊行+实际支出，改后重算总额一致性；不一致 -1 且**原值保持**（回滚）
- 分摊记录/关联实际不存在或已删除 → -2

**DELETE `/api/cost/allocations/:id`**（allocationDelete，costService.js:756-784）
- **软删除**（`is_deleted=true`），非物理 DELETE
- 关联的实际支出未删除 → **-1 拒绝**（「删除会破坏归因完整性」）
- 计划归因（cost_actual_id 为 NULL，随费用申请创建时内嵌写入）→ 允许删除

**成功/失败格式**（costController.js:9-25）：`{code:0, data, message}` / `{code:<负>, message}`；**HTTP 恒 200**（仅 code>0 的罕见描述符才设 HTTP status）。前端 `defaultResponseInterceptor`（successCode=0）对 code≠0 抛错 → `makeErrorMessage` 取 `error.response.data.message` 弹提示 —— **服务端业务消息能真实到达用户**，页面既有 try/catch 模式正确。

### 2.2 当前页面 allocation 展示状况

- **无分摊列表、无分摊卡片**。allocation 数据唯一入口是「新建费用申请」模态框内嵌的一条计划归因（createCostRequest 的 allocations 数组，costService.js:352-369），写入后**任何页面都看不到、改不了、删不了**（除申请级随请求软删）。
- 页面已加载：bizDomains / investCategories（loadRefs），opTypes 按领域联动（onBizDomainChange）——分摊表单的三个下拉数据源**已具备**。
- 实际支出列表 `GET /api/cost/actuals`（pageSize≤200）尚未在 cost.ts 封装——分摊表单选择「关联实际支出」需要它。

### 2.3 权限

- 后端写操作：`requireRole('system_admin','admin','safety_manager','hse_manager')`（routes/cost/main.js:18,55-57）——**安全边界在后端**。
- 前端 UX 惯例（既有写法，只读不写 store）：`useAccess()` + `hasAccessByRoles([...])`（如 views/hse/employee-import-v2/index.vue:61-65）。按同角色集置灰按钮。不修改 authMiddleware/JWT/登录/用户 Store。

### 2.4 GAP-03 结论

> **GAP-03 可纯前端实现**：在现有成本页追加「成本分摊（归因）」卡片（列表 + 新增 + 编辑 + 删除），不新建第二套页面、不引新依赖、全部复用已导入/已封装的 Naive UI 与 requestClient。删除确认用 `#/adapter/naive` 离散 `dialog.warning`（根无 NDialogProvider，项目既有解法）。

---

## 3. 修改文件清单

**实际修改（仅 2 个前端文件，均已验证未提交）**：
1. `安全看板vben/apps/web-naive/src/api/hse/cost.ts` —— 新增 allocation ×4（list/create/update/delete）+ actuals ×1（list）的类型与封装（对齐 main.js 实际路由）
2. `安全看板vben/apps/web-naive/src/views/objectives/cost/index.vue` —— GAP-03 分摊卡片/模态框/删除确认/按钮权限 UX；**GAP-01 新增预算部分已全部回滚**（零残留）

**实际不修改**：
- `server/**` 全部（含 P0 未提交的 `server/routes/cost.js`——只增不改）
- 任何 cost SQL / 迁移 / `server/__tests__`
- objectives 域全部（含已损坏的 `budgetToSnake`——仅报告，修复留待专项）
- 登录 / JWT / authMiddleware / 用户 Store / 角色体系
- 其它 HSE 模块、BUG-02（assessment）、OBS-01~04
- Vite/Node/项目配置；不新增 npm 依赖

---

## 4. 停止条件复核（任务第二十条）

| 条件 | 是否触发 | 依据 |
|---|---|---|
| 1. GAP-01 需要新增预算主体 POST API / 修复既有损坏端点 | **是（GAP-01 触发，已停止实现并回滚）**——唯一既有创建端点（objectives budgetCreate）对 dev schema 确定性失败；修复需改 objectives 后端或新增 cost 域端点，均在禁止范围 | §1.5 |
| 2. DB 模型与页面语义不一致 | 否——页面=主体，契约清晰 | §1.1 |
| 3. allocation contract 不足以支持 UI | 否——四接口契约完整满足增删改 | §2.1 |
| 4. 必须修改 costService | 否 | §2.1 |
| 5. 必须修改 SQL | 否 | §3 |
| 6. P0 diff 会被覆盖 | 否——只增不改两个 P0 文件 | §0 |
| 7. 工作树与 5e8b052 不一致且无法解释 | 否——差异全部可解释 | §0 |
| 8. 生产数据库连接 | 否——仅 safety_dashboard_dev | 全程 |
| 9. 需修改登录/JWT/权限体系 | 否——useAccess 只读使用 | §2.3 |

**审计结论（分治）**：
- **GAP-03**：契约完整，纯前端实现已完成，浏览器验收 GAP-03-01~09 全部通过（见最终报告 `HSE_COST_GAP01_GAP03_BROWSER_ACCEPTANCE_5e8b052_V1.md`）。
- **GAP-01**：**BLOCKED**——既有 objectives 创建端点损坏（year 列），修复需后端改动，超出本轮范围；证据与影响面见 §1.5，留待专项。
