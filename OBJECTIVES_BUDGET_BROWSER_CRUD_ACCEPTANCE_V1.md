# Objectives 预算 CRUD 浏览器真实回归审计 V1

> 任务性质：**只读浏览器回归审计**（不修任何业务代码）
> 审计对象：方案 A（`objectiveService.js` 删除 `budgetToSnake()` 错误 `year` 映射）之后的 Objectives 安全费用预算页面真实业务闭环
> 证据口径：UI（真实浏览器操作）→ Network（浏览器实际请求）→ API body.code → DB（pg 直查）→ F5 → UI
> 基线：`feat/hse-business-closure` @ `5e8b052`

**最终判定：`PASS WITH ISSUES`**

---

## 1. 审计环境

| 项 | 值 |
|---|---|
| HEAD | `5e8b0524ccd69369e59857024f0640cadec5f4cb`（`5e8b052`） |
| branch | `feat/hse-business-closure` |
| working tree | 4 类未提交修改（P0 / GAP-03 / 方案 A / 无本轮新增）详见 §2 |
| 后端 | `PORT=5882 DB_NAME=safety_dashboard_dev SCHEDULER_ENABLED=false WPS_GRID_SYNC=false WPS_GRID_DATA_SOURCE=false NODE_ENV=development node app.js` |
| 前端 | `npx vite --config vite.config.accept3.ts --port 5177`（临时配置：`/api` 与 `/uploads` 均代理 5882，独立 cacheDir，禁连生产 5876） |
| 页面 | `http://127.0.0.1:5177/objectives/budget/expenditure`（菜单：目标职责 → 安全费用预算及支出 → 安全费用支出） |
| 数据库 | `safety_dashboard_dev`（每次写/查均先 `SELECT current_database()` 断言，非 dev 即退出） |
| 浏览器 | Chromium `chrome-headless-shell-1223`（Playwright 1.61.1），真实鼠标/键盘操作，非脚本直连接口 |
| 登录 | 浏览器访问 `/auth/login`，dev 自动登录实际发出 `POST /api/auth/login`（200 / code 0），随后 `GET /api/user/info` 200 |
| 本轮代码修改 | **0 个业务文件**（详见 §2） |

---

## 2. 当前工作树（审计前后一致）

审计开始前后各核验一次，结果一致：

| 类别 | 文件 | 状态 |
|---|---|---|
| P0（本地未提交） | `server/routes/cost.js` | 在 |
| P0（本地未提交） | `安全看板vben/apps/web-naive/src/views/objectives/cost/index.vue`（Naive UI imports 块） | 在 |
| GAP-03（本地未提交） | `安全看板vben/apps/web-naive/src/api/hse/cost.ts` | 在 |
| GAP-03（本地未提交） | 同上 `index.vue`（分摊卡片/模态框） | 在 |
| 方案 A（本地未提交） | `server/services/objectiveService.js`（删除 `budgetToSnake` 中 `year` 映射 1 行） | 在 |

- `git diff --stat`：`objectiveService.js | 1 -`（唯一方案 A 改动，纯删除，无其他 hunk）
- 本轮**未新增任何业务文件修改**；仅创建临时验收脚本/临时 vite 配置（审计结束已删除，见 §7）
- 未 commit / 未 push / 未 merge / 未 reset / 未 revert

### 后端实际代码复核（不以历史报告行号操作）

- `objectiveService.js` `budgetToSnake()`（当前行 338-366）：**已无 `year` 键**，年度仅有 `budget_year: b.budgetYear ?? b.budget_year ?? b.year`
- `budgetCreate()`：`Object.keys(fm)` 动态生成 INSERT 列（无 undefined 过滤）
- `budgetUpdate()`：`Object.entries(fm)` 仅过滤 `undefined` 后动态 SET
- 路由：`routes/objectives/main.js` canonical `/budgets` 系列 + 别名 `/safety-budget`（POST/PUT/DELETE/list/stats）；`app.use('/api', authMiddleware)` 全局登录鉴权，预算写路由无 `requireRole`

---

## 3. 测试矩阵（TEST-01 ~ TEST-11）

测试数据标识：名称 `P2-OBJECTIVES-BROWSER-REGRESSION-2026`；备注 `P2_BROWSER_REGRESSION_20261024`

### TEST-01 页面初始读取 — **PASS**

| 层 | 证据 |
|---|---|
| UI | 标题「安全费用支出 - HSE 安全看板」；统计卡 4 个：`计划总额(万元)5.75万`、`已支出(万元)3.63万`、`执行率63%`、`项目数34`；表格渲染 10 条数据行（vxe 每行渲染 3 个 `tr`，故 DOM 中 30 个）；**Naive UI unknown element 0**、无 JS exception |
| Network | `GET /api/objectives/safety-budget?page=1&pageSize=10` → HTTP 200 / code 0 / 「查询成功」；`GET /api/objectives/safety-budget/stats?year=2026` → HTTP 200 / code 0 / 「统计成功」 |
| DB | `live=101 / total=339 / 2027=0 / 标记残留=0` |
| Result | UI 正常 + Network 成功 + code 0 + DB 一致 ⇒ **PASS** |

### TEST-02 UI 新增预算 — **PASS**（另含 2 项观察）

| 层 | 证据 |
|---|---|
| UI | 点击工具栏「新增」→ 模态框「新增支出记录」；填「名称」「预算年度=2026 年」「备注」「计划-总价(万)=1」「计划使用时间=2026-03-01」→「保存」；toast「创建成功」 |
| Network | `POST /api/objectives/safety-budget` → HTTP 200 / **code 0** / 「创建成功」；请求体**同时含 `budgetYear:2026` 与 `year:2026`**（双字段前端契约，原样记录）；`itemName`=`P2-OBJECTIVES-BROWSER-REGRESSION-2026` |
| DB | 新增 1 行：`id=757, budget_year=2026, project_name=item_name=P2-OBJECTIVES-BROWSER-REGRESSION-2026, budget_amount=10000.00, status=planning, remark=P2_BROWSER_REGRESSION_20261024, is_deleted=false` |
| Result | **PASS**（`budget_year` = UI 提交年度；无 `year` 列写入问题） |

附：两次「只观察、不修」的失败路径

| 子项 | 操作 | HTTP / code / message | DB |
|---|---|---|---|
| TEST-02A | 严格按页面默认**留空**「计划使用时间」 | 200 / **-1** / `无效的类型 date 输入语法: ""` | 0 行 |
| TEST-02A2 | 按页面 placeholder 示例填 `2026-03` | 200 / **-1** / `无效的类型 date 输入语法: "2026-03"` | 0 行 |

### TEST-03 新增后 F5 持久化 — **PASS**

| 层 | 证据 |
|---|---|
| UI（F5 后） | 重新加载后用页面真实搜索框检索到该行：`1 P2-OBJECTIVES-BROWSER-REGRESSION-2026 2026-02-28 1.00 … P2_BROWSER_REGRESSION_20261024` |
| Network | `GET …/safety-budget?page=1&pageSize=10&keyword=…` → 200 / code 0 / 「查询成功」，返回该行 `budget_year=2026` |
| DB | `id=757 budget_year=2026 project_name/remark` 与 UI 一致 |
| Refresh | **刷新后 GET 返回值 = DB 实际值 = UI 显示值** |
| Result | **PASS** |

### TEST-04 编辑年度 2026 → 2027 — **PASS**

| 层 | 证据 |
|---|---|
| UI | 行内「编辑」→ 模态框「编辑支出记录」；年度由 `2026 年` 改为 `2027 年` →「保存」；toast「更新成功」 |
| Network | `PUT /api/objectives/safety-budget/757` → HTTP 200 / **code 0** / 「更新成功」；请求体含 `budgetYear:2027` 与 `year:2027`（双字段） |
| DB | `budget_year=2027`，**标记行数仍为 1（未新增第二条）** |
| Result | **PASS** |

### TEST-05 年度修改后 F5 — **PASS**

| 层 | 证据 |
|---|---|
| UI | F5 后行内「查看」→ 详情抽屉「支出详情」→ **预算年度 2027** |
| Network | 列表 API 返回该行 `budget_year=2027`（200 / code 0） |
| DB | `budget_year=2027` |
| Result | UI = API = DB = **2027**，刷新后未回退 ⇒ **PASS** |

### TEST-06 编辑普通字段（备注） — **PASS**

| 层 | 证据 |
|---|---|
| UI | 「编辑」→ 仅改备注为 `P2_BROWSER_REGRESSION_20261024_EDITED` →「保存」 |
| Network | `PUT /api/objectives/safety-budget/757` → 200 / code 0 / 「更新成功」 |
| DB | `remark=P2_BROWSER_REGRESSION_20261024_EDITED`；**`budget_year` 保持 2027**；标记行数 1 |
| Result | **PASS**（年度未被意外修改） |

### TEST-07 列表回归 — **PASS**

| 层 | 证据 |
|---|---|
| UI | 关键词检索后列表 1 行：`1 P2-OBJECTIVES-BROWSER-REGRESSION-2026 2026-02-26 1.00 … P2_BROWSER_REGRESSION_20261024_EDITED` |
| Network | `GET …/safety-budget?page=1&pageSize=10&keyword=P2-OBJECTIVES-BROWSER-REGRESSION` → 200 / code 0，`data.list` 长度 **1**，行 `budget_year=2027` |
| DB | `budget_year=2027`、`item_name` 与列表一致 |
| Result | **PASS**（无前端状态缓存错乱） |

### TEST-08 详情回归 — **PASS**

| 层 | 证据 |
|---|---|
| UI | 行内「查看」→ 抽屉显示：`预算年度 2027`、`名称 P2-OBJECTIVES-BROWSER-REGRESSION-2026`、`备注 P2_BROWSER_REGRESSION_20261024_EDITED`、`计划-总价(万) 1.00` |
| DB | `id=757 budget_year=2027 item_name` 与抽屉一致 |
| Network | **OBS**：页面详情未发起独立 detail GET（抽屉直接复用列表行数据）；证据中该字段命中的 200/code 0 记录实为 TEST-06 的 PUT `/api/objectives/safety-budget/757`，不是 detail 请求。canonical `GET /objectives/budgets/:id` 存在但前端未调用，别名 `GET /safety-budget/:id` 未注册 |
| Result | **PASS**（UI 与 DB 一致） |

### TEST-09 统计回归 — **PASS**

以**现有代码已定义的统计口径**核对（不自行定义公式）：
`is_deleted=false AND budget_year=2026`；`planTotal = MAX(annual_plan_total) > 0 ? MAX : SUM(plan_total)`；`spentTotal = SUM(actual_expenditure_total)`（year≥2026 分支）

| 层 | 值 |
|---|---|
| UI | `计划总额(万元)5.75万`、`已支出(万元)3.63万`、`执行率63%`、`项目数34` |
| API | `GET /api/objectives/safety-budget/stats?year=2026` → 200 / code 0 / `{total:34, planTotal:5.7504, spentTotal:3.627, executionRate:63, warningItems:0}` |
| DB 复算 | `total=34`、`planTotal=5.7504`、`spentTotal=3.627` |
| Result | 三者一致 ⇒ **PASS** |

### TEST-10 年度缺失（**只观察，不修**） — **OBS**

| 观察项 | 结果 |
|---|---|
| 年度下拉是否有清空入口 | **无**（`hasClearIcon=false`） |
| 是否标 required | **是**（`n-form-item-label__asterisk` 存在） |
| 当前值 | `2026 年`（恒为当前年，默认不可为空） |
| 尝试清空后 | 仍为 `2026 年` |
| 判定 | **UI validation PASS**：前端无法构造缺年度提交；后端亦无应用层必填校验（已知 ISSUE，本轮不修） |

### TEST-11 重复创建（**只观察，不修**） — **OBS**

| 层 | 结果 |
|---|---|
| 操作 | 用同一「名称」+ 同一年度 2027（与 TEST-04 后该行年度一致）+ 同一预算金额再次「新增→保存」 |
| Network | `POST /api/objectives/safety-budget` → HTTP 200 / **code -1** / `重复键违反唯一约束"uq_hse_safety_budget_bizkey"` |
| DB | 标记行数仍为 **1**，未产生第二条 |
| 判定 | **不允许**（由 DB 唯一约束 `(budget_year, project_name, item_name, budget_amount)` 拦截）；错误文案为 PG 原文透出（已知 ISSUE 表现） |

---

## 4. Issues（严格区分本轮与非本轮）

| 编号 | 级别 | 类别 | 内容 | 是否本轮引入 | 是否阻断核心闭环 |
|---|---|---|---|---|---|
| ISSUE-01 | P2 | KNOWN ISSUE（既有） | 「计划使用时间」留空或填 `2026-03`（placeholder 示例格式）→ `plan_time` 空串/短格式透传至 `date` 列 → HTTP 200 / code -1 `无效的类型 date 输入语法`；属「create 无应用层必填/格式校验」的同一类缺口 | 否（修复前 CREATE 必先在 `year` 列失败，被掩盖） | 否（填合法完整日期 `YYYY-MM-DD` 即成功） |
| ISSUE-02 | P1 | 既有缺陷（本轮修复后可见） | **编辑保存会把派生状态写回业务 `status` 列**：`budgetList` 返回 `{...budgetToCamel(row), ...calcBudgetStatus(b,s)}`，`calcBudgetStatus` 的 `status`（normal/warning/overspend）覆盖了真实业务状态列；前端 `handleEdit` 取 `record.status` 回填表单，保存时写回。实测：创建时 `status=planning`，一次编辑后变为 **`normal`**（存量 101 行业务状态为 `active`，被 API 一律呈现为 `normal`） | 否（既有覆盖逻辑；修复前 PUT 必然 42703，从未发生写回） | 否（CRUD 闭环成立，但会污染业务状态字段） |
| ISSUE-03 | OBS | KNOWN ISSUE（既有） | 年度字段 UI 层不可清空且标 required；后端无应用层必填校验，仅靠 DB NOT NULL 兜底，缺失时透出 PG 原文 | 否 | 否 |
| ISSUE-04 | OBS | KNOWN ISSUE（既有） | 重复业务键被 DB 唯一约束拦截，错误信息为 PG 原文（无业务化文案） | 否 | 否 |
| ISSUE-05 | OBS | 既有 | 详情抽屉不发起独立 GET detail；`GET /objectives/budgets/:id` 存在但前端未用；别名 `GET /safety-budget/:id` 未注册 | 否 | 否 |
| ISSUE-06 | OBS | KNOWN ISSUE（既有，上轮已记录） | `budget_code` 经该端点创建恒为 NULL（列表响应中 `"budget_code":null`）；`budgetToSnake` 未映射该字段 | 否 | 否 |

**FAIL 项：无。** 上述均为 OBS / KNOWN ISSUE / P1-P2 非阻断项，未把历史 ISSUE 重算为本轮 FAIL。

---

## 5. 数据库清理证据

| 项 | 值 |
|---|---|
| 测试前 `hse_safety_budget` | `total=339 / live=101 / budget_year=2027 行数=0 / 标记残留=0` |
| 测试中创建 | **1 行**（`id=757`，名称/备注带本轮唯一标识）；TEST-11 重复创建被拒（0 行）；TEST-02A/A2 被拒（0 行） |
| 测试中更新 | 同一行 2 次 PUT（年度 2026→2027；备注追加 `_EDITED`），**未产生新行** |
| 清理方式 | `current_database()` 断言后，定向 `DELETE … WHERE project_name LIKE 'P2-OBJECTIVES-BROWSER-REGRESSION%' OR item_name LIKE … OR remark LIKE 'P2_BROWSER_REGRESSION_20261024%'`（**未使用 TRUNCATE / DROP / 全表 DELETE**） |
| 删除行数 | **1** |
| 清理后 | `total=339 / live=101 / 2027=0 / 标记残留=0 / status='normal' 残留=0` ⇒ **基线完整恢复** |

---

## 6. 控制台与类型检查

| 项 | 结果 |
|---|---|
| `consoleErrors` | **0** |
| `pageErrors` | **0** |
| `requestFailed` | **0** |
| toast 全集（全流程） | `无效的类型 date 输入语法: ""`（TEST-02A 预期失败）、`创建成功`、`更新成功` —— 服务端/前端消息均按真实业务语义呈现，无伪造成功 |
| TypeScript | 本轮**未修改任何前端/后端代码**，无需重跑 vue-tsc；既有 82 个前端 baseline errors 属仓库既有状态，未处理、未计入本轮 |

---

## 7. 环境与产物清理

- 已停止：后端 5882、前端 5177（本轮自建）；**用户既有 5173 / 5888 未做任何操作**
- 已删除：临时脚本（`_obj_regression.mjs`、`_obj_probe*.mjs`、`_obj_evidence.json` 待报告定稿后删）、临时配置 `vite.config.accept3.ts`、独立缓存目录 `.accept3-cache`、调试截图
- 未修改：任何业务代码、SQL、migration、前端页面、API、测试、登录/JWT/权限
- 未执行：commit / push / merge / reset / revert / npm install / migration

---

## 8. 结论

**PASS WITH ISSUES**

- 核心 CRUD 浏览器闭环（`新增 → 列表 → 编辑年度 → 编辑普通字段 → 详情 → 统计`，每层均含 F5 刷新复核）**全部通过**，`UI = Network/API = DB` 三者一致
- `year → budget_year` Schema Drift **未再复现**：创建与年度修改均成功（修复前同形状请求确定性 42703），且 `{budgetYear, year}` 双字段前端契约在修复后仍正常工作
- `consoleErrors=0 / pageErrors=0 / requestFailed=0`
- 遗留 ISSUE-01~06 均为既有问题，未导致本轮核心业务失败（ISSUE-02 为 P1，建议另立专项：编辑保存写回派生状态污染业务 `status` 列）
