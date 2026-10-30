# Objectives 预算 Schema 漂移专项审计

> 任务性质：**只读专项审计**（不修改任何业务代码/SQL/migration/schema/前端）
> 测试标识：无（本轮不写库；回滚式探针目标行为不存在的 id=-999999，且全部 ROLLBACK）
> 日期：2026-10-24

---

## 1. 审计环境

| 项 | 值 | 核验命令 |
|---|---|---|
| HEAD | `5e8b0524ccd69369e59857024f0640cadec5f4cb`（`5e8b052`） | `git rev-parse HEAD` |
| 分支 | `feat/hse-business-closure` | `git branch --show-current` |
| 工作树 | 与审计前完全一致：2 个已修改前端文件（GAP-03）+ 既有未跟踪项 | `git status --short` |
| 数据库 | `safety_dashboard_dev`（唯一允许库） | `SELECT current_database()` = `safety_dashboard_dev` ✓ |

**P0/P2 保护核验（审计前实测）**：

| 保护项 | 状态 |
|---|---|
| `server/routes/cost.js`（P0 聚合入口，未跟踪新文件） | ✓ 在，字节未动 |
| cost 页面 P0 Naive UI import 块（index.vue:7-25） | ✓ 在 |
| GAP-03 `api/hse/cost.ts`（+106 行） | ✓ 在 |
| GAP-03 `views/objectives/cost/index.vue`（+315 行，含 P0 import） | ✓ 在 |

**本审计未触碰上述任何文件；未连接任何生产数据库；未执行 npm/git 写操作。**

---

## 2. 当前 DB Schema（Q1）

`hse_safety_budget` 实测 **40 列**（`information_schema.columns` 全量，`safety_dashboard_dev`）：

| # | 字段 | 类型 | 可空 | 默认 |
|---|---|---|---|---|
| 1 | id | bigint | NO | nextval 序列 |
| 2 | budget_code | varchar(64) | YES | — |
| 3 | **budget_year** | **integer** | **NO** | — |
| 4 | category | varchar(50) | YES | — |
| 5 | department | varchar(100) | YES | — |
| 6 | project_name | varchar(200) | YES | — |
| 7 | budget_amount | numeric | YES | 0 |
| 8 | spent_amount | numeric | YES | 0 |
| 9 | org_unit_id | bigint | YES | — |
| 10 | responsible_person | varchar(100) | YES | — |
| 11 | responsible_employee_id | bigint | YES | — |
| 12 | start_date | date | YES | — |
| 13 | end_date | date | YES | — |
| 14 | status | varchar(32) | YES | `'active'` |
| 15 | description | text | YES | — |
| 16 | remark | varchar(500) | YES | — |
| 17 | created_at | timestamp | YES | CURRENT_TIMESTAMP |
| 18 | updated_at | timestamp | YES | CURRENT_TIMESTAMP |
| 19 | created_by | bigint | YES | — |
| 20 | updated_by | bigint | YES | — |
| 21 | is_deleted | boolean | YES | false |
| 22 | measure_item | text | YES | — |
| 23 | budget_subject | varchar(32) | YES | — |
| 24 | purpose | text | YES | — |
| 25 | plan_time | date | YES | — |
| 26 | location | varchar(200) | YES | — |
| 27 | spec | varchar(200) | YES | — |
| 28 | plan_quantity | numeric | YES | 0 |
| 29 | plan_unit_price | numeric | YES | 0 |
| 30 | plan_total | numeric | YES | 0 |
| 31 | actual_quantity | numeric | YES | 0 |
| 32 | actual_unit_price | numeric | YES | 0 |
| 33 | use_status | varchar(32) | YES | — |
| 34 | item_name | varchar(200) | YES | — |
| 35 | annual_plan_total | numeric | YES | 0 |
| 36 | actual_total | numeric | YES | 0 |
| 37 | serial_no | integer | YES | — |
| 38 | actual_expenditure_quantity | numeric | YES | 0 |
| 39 | actual_expenditure_unit_price | numeric | YES | 0 |
| 40 | actual_expenditure_total | numeric | YES | 0 |

**明确结论**：

| 项 | 值 |
|---|---|
| 真实字段 | 上表 40 列；**不存在 `year` 列**（`has 'year' column = false` 实测） |
| 主键 | `hse_safety_budget_pkey` (id) |
| 唯一约束 | `hse_safety_budget_budget_code_key` UNIQUE (budget_code) |
| 唯一索引（非 constraint） | `uq_hse_safety_budget_bizkey` UNIQUE (budget_year, project_name, item_name, budget_amount) **WHERE NOT is_deleted**（2026-10-25 迁移建） |
| 外键 | `fk_safety_budget_org` (org_unit_id → hse_org_unit, ON DELETE SET NULL)；`fk_safety_budget_responsible` (responsible_employee_id → employee, ON DELETE SET NULL) |
| CHECK 约束 | **无**（`pg_constraint` 权威直查仅 4 条；information_schema 表约束查询曾出现 2 条 `2200_79643_*_not_null`，经核实为**同名跨表 join 伪象**，非本表约束——方法论备注，防止后续审计被误导） |
| 软删除字段 | `is_deleted` (boolean default false) |
| 年度字段 | **`budget_year` integer NOT NULL**（唯一年度列） |
| 金额字段 | budget_amount / spent_amount / plan_* / actual_* / annual_plan_total / actual_total / actual_expenditure_* 均为 numeric |
| 状态字段 | `status` varchar(32) default `'active'`（另有 use_status varchar(32) 可空） |

**数据分布（只读）**：总行 339，其中软删除 238、存活 101；存活行 `budget_year` ∈ {2025: 67, 2026: 34}。

**同库遗留表（只读发现，与漂移直接相关）**：
- `safety_budgets`（旧表，11 列）：`id, **year** integer NOT NULL, item, budget_amount double precision, used_amount double precision, category, status, remark, created_at, updated_at, is_deleted` —— **旧 schema 用 `year`/`used_amount`/`item`**
- `hse_safety_budget_backup_20260811` / `_20260812` / `_20260812_fix` / `backup_98_hse_safety_budget`：历史备份表（均已用 budget_year）

---

## 3. 当前 CRUD Contract（Q2/Q3 合同层）

链路：`POST|GET|PUT|DELETE /api/objectives/safety-budget[/:id]` →（routes/objectives/main.js:121-126 别名重写）→ `/budgets[/:id]`（main.js:83-90）→ objectiveController（:225-246 薄 handler）→ objectiveService → `hse_safety_budget`。

| Method | Endpoint（对外） | Controller | Service | DB 操作 | 状态 |
|---|---|---|---|---|---|
| GET | `/api/objectives/safety-budget` | budgetList (:230) | budgetList (:1347) | SELECT … WHERE budget_year=$n | **正常**（年度列用 budget_year ✓） |
| GET | `/api/objectives/safety-budget/stats` | budgetStats (:227) | budgetStats (:1280) | SELECT … WHERE budget_year=$n | **正常** |
| GET | `/api/objectives/safety-budget/export` | budgetExport (:233) | budgetExport (:1380) | SELECT * | **正常**（返回原始 snake 行，未经 budgetToCamel—— minor 不一致，记录） |
| GET | `/api/objectives/safety-budget/:id` | budgetDetail (:236) | budgetDetail (:1389) | SELECT * WHERE id | **正常** |
| POST | `/api/objectives/safety-budget` | budgetCreate (:239) | budgetCreate (:1401) | INSERT（列恒含 `year`） | **确定性失败** |
| PUT | `/api/objectives/safety-budget/:id` | budgetUpdate (:242) | budgetUpdate (:1413) | UPDATE（SET 视 body 而定） | **部分失败**（body 含年度类字段即失败；否则正常） |
| DELETE | `/api/objectives/safety-budget/:id` | budgetDelete (:246) | budgetDelete (:1440) | UPDATE … SET is_deleted=true | **正常** |

**鉴权**：`app.js:251 app.use('/api', authMiddleware)` 全局登录鉴权；预算五个写/读路由**均无 requireRole** ⇒ 任何登录用户可建/改/删预算（既有设计，记录备查）。

---

## 4. Service 字段映射（Q2）

`budgetToSnake`（objectiveService.js:338-367，**写路径**）与 `budgetToCamel`（:309-336，**读路径**）实测映射：

| 业务字段 | snake_case（写） | DB 实际字段 | create | update | list/read |
|---|---|---|---|---|---|
| 年度 | `budget_year` + **`year`**（:340-341 双键同值） | **budget_year**（无 year 列） | ✗ 恒写 year 列→失败 | △ body 含年度字段→失败 | ✓ budgetToCamel :313-314 输出 budgetYear+year 双别名 |
| 预算金额 | `budget_amount` (:346) | budget_amount ✓ | ✓ | ✓ | ✓ |
| 已支金额 | `spent_amount`（回退 `usedAmount/used_amount` :347） | spent_amount ✓ | ✓ | ✓ | ✓（:319-320 双别名） |
| 项目名 | `project_name`（回退 itemName/item :344） | project_name ✓ | ✓ | ✓ | ✓ |
| 事项名 | `item_name`（回退 item/projectName :345） | item_name ✓ | ✓ | ✓ | ✓（:315-316 item/itemName 双别名） |
| 预算编码 | **无映射** | budget_code | **永不写入（恒 NULL）** | 永不更新 | ✓ 原样读出 |
| 类别/部门/状态/备注/用途/计量等 | 同名映射 (:342-364) | 同名列 ✓ | ✓ | ✓ | ✓ |
| 计划/实际数量单价系列 | 同名映射 (:354-361) | 同名列 ✓ | ✓ | ✓ | ✓ |
| description/start_date/end_date/org_unit_id/responsible_*/annual_plan_total/actual_total/serial_no | **无映射** | 存在但不在映射表 | 不写（留默认/NULL） | 不更新 | ✓ 原样读出 |

**Q3 答复：存在明确的 year ↔ budget_year 命名漂移**，且是复合漂移：
1. **致命**：`year` 键（旧表 safety_budgets 的列名）残留在写映射中；
2. 次级（不致命）：`used_amount`（旧列名）作为 spent_amount 的回退源；`item`（旧列名）作为 item_name/project_name 的回退源——均为旧 schema 残留，但因目标列正确故不报错。

---

## 5. Create 缺陷（POST）

| 层 | 事实 |
|---|---|
| 代码 | `objectiveService.js:1406-1408`：`const fm = budgetToSnake(b); const keys = Object.keys(fm); INSERT INTO hse_safety_budget(${keys.join(',')}) …`——**`Object.keys` 不过滤 undefined、不校验列存在性**，25 个映射键（含 `year`）恒进入 INSERT 列列表 |
| SQL（实测生成） | `INSERT INTO hse_safety_budget(budget_year,year,category,department,project_name,item_name,budget_amount,spent_amount,measure_item,budget_subject,purpose,plan_time,location,spec,plan_quantity,plan_unit_price,plan_total,actual_quantity,actual_unit_price,actual_expenditure_quantity,actual_expenditure_unit_price,actual_expenditure_total,use_status,status,remark) VALUES(...)`（从源码提取 budgetToSnake 纯函数实测，见 §13-E1） |
| DB | `hse_safety_budget` 无 `year` 列（§2） |
| 实际错误 | `code:-1`，消息逐字：`关系 hse_safety_budget 的 year 字段不存在`（HTTP 200 + body code<0，OBS-01 约定；GAP-01 UI 实测 + 最小 payload 探针复验，与 payload 无关） |
| 回滚式复验 | 独立事务内执行上述 INSERT（PREPARE 即解析失败）：**42703 `关系 "hse_safety_budget" 的 "year" 字段不存在`**；对照组（同列集去掉 year，24 列）**OK**（§13-E3/E4） |

---

## 6. Update 缺陷（PUT，逐字段实证，不推定）

复刻 `budgetUpdate`（:1423-1435）的 SET 生成逻辑（`Object.entries(fm)` 过滤 undefined）后，按 body 内容分三类，**每类均有独立事务回滚探针实证**：

| body 场景 | 生成 SET 键 | 探针结果（独立事务 + ROLLBACK，目标 id=-999999） |
|---|---|---|
| 含 `budgetYear`/`budget_year`/`year`（两个前端页面编辑年度都发 budgetYear+year） | `budget_year, year` | **FAIL 42703「year 字段不存在」**（§13-E1 纯函数 + §13-E2 探针双证） |
| 仅 `status`/`remark` 等非年度字段 | `status, remark` | **OK**（rowCount=0，§13-E2 对照） |
| 空 body | `updates` 为空数组 → SQL 语法错 `SET , updated_at=…` | 静态判定：同样坏（语法错误），无探针必要 |

**金额字段 UPDATE**：`budget_amount` 映射正确（:346），无字段名/类型问题；pg 驱动把 numeric 序列化为字符串由前端 `Number()` 处理（GAP-03 轮已修，属另一模块）。**金额类更新失败的唯一原因是它与年度同批次发送时被 year 列错误连坐**，非金额字段自身缺陷。

**结论**：PUT 是「部分坏」——坏的部分精确等于「body 含年度类字段」，与 create 的「恒坏」不同。此结论有纯函数生成证据 + PG 级探针证据，非由 create 错误推定。

---

## 7. Migration 历史（Q5）

**时间线**（每一行都有据可查，推测处已标注）：

```
? (2026-07-11 前)   objectives 预算域早期表名 safety_investments
                    （据《进度报告_20260711_阶段4_objectives表名修复》：route /safety-budget → dbTable safety_investments）
        ↓ 表名修复（具体迁移文件不在清理后的 git 历史中——标注：未找到直接迁移脚本）
≤2026-07-30         hse_safety_budget（budget_year）与旧表 safety_budgets（year）并存
                    【实证：server/sql/_backup_before_fk58_20260730_182647.dump 两表 DDL 俱在】
2026-08-11/12       hse_safety_budget 列扩展 + 多次备份（backup_* 表遗留在 dev 库）
2026-09-12          git 清理基线 31975ef：routes/objectives.js 已含 year 映射 + hse_safety_budget DDL（budget_year）
                    【git show 31975ef:server/routes/objectives.js:1191-1194 实证】
2026-09-13          cb9b956 三层化重构：budgetToSnake 逐字搬迁入 objectiveService.js，year 映射原样带入
2026-10-23          20261023_hse_safety_cost_domain.sql：明确「预算主体复用既有 hse_safety_budget（不作改名/不删除），
                    本迁移只新增」——未动年度列
2026-10-25          20261025_hse_cost_import_constraints.sql：以 budget_year 建 uq_hse_safety_budget_bizkey
                    （现行 schema 的最后一笔迁移，用 budget_year，反证 year 从未成为正式列名）
2026-10-23/24       GAP-01 UI 实测 → year 字段不存在（缺陷暴露）
```

**Q5 明确答复**：
1. 创建 `hse_safety_budget` 的 migration：**不在仓库内**。该表 DDL 存在于代码 `ensureTables()`（现 objectiveService.js:74-89，`CREATE TABLE IF NOT EXISTS`）；2026-07-30 的 dump 已含该表，故创建早于该时点，手段不在清理后的历史中（**未找到，如实标注**）。
2. 增加/修改年度字段的 migration：**不存在**（全库 grep `add column.*year|budget_year` 为空）。
3. 删除/重命名 `year` 的 migration：**不存在于仓库**。旧表 `safety_budgets`（带 year）至今仍留在 dev 库未被删除——「建新表、弃旧表、代码映射半迁」是当年实际发生的事，不是「改名」。
4. 当前 schema 最终来源：代码 DDL（ensureTables）+ 20261025 索引迁移；`year` 从来不是 `hse_safety_budget` 的列。

---

## 8. Git blame / commit 证据（Q4）

| 调查 | 命令 | 结果 |
|---|---|---|
| objectiveService.js 全历史 | `git log --all --oneline --follow` | 仅 2 个 commit：`cb9b956`（三层化拆分）、`31975ef`（清理基线）——**更早历史不在本库** |
| `year` 进入该文件 | `git log -S"year" --all -- objectiveService.js` | 仅 `cb9b956`（文件创建 commit，全部行为新增） |
| `budget_year` 历史 | `git log -S"budget_year" --all -- server` | 31975ef / cb9b956 / 9d9b173 / 5e8b052 / 5e39c36（基线起即在） |
| 基线版本直查 | `git show 31975ef:server/routes/objectives.js` | :1191-1194 `budgetToSnake` **已含** `budget_year`+`year` 双键 ⇒ year 映射**早于基线** |
| **cb9b956 实际 diff**（任务要求，非只引 blame） | `git show cb9b956 -- routes/objectives.js services/objectiveService.js` | budgetToSnake 整段**逐字搬迁**：删除侧与新增侧字符串完全一致（`budget_year: b.budgetYear ?? b.budget_year ?? b.year,` / `year: b.budgetYear ?? b.budget_year ?? b.year,` 两侧同行同文）；diff stat = routes/objectives.js −2029 / objectiveService.js +2010 / controller +385 / main.js +140，为纯结构重构 |

**Q4 答复（缺陷从哪个 commit 开始）**：
- **可精确证明的最早在库时点：基线 `31975ef`（2026-09-12）的 `server/routes/objectives.js:1194`**；
- `cb9b956`（2026-09-13）**不是引入者**，是逐字搬迁者（diff 实证）；
- **真正的引入 commit 不在 git 历史中**（清理基线之前）。结合旧表 safety_budgets（year 列）与 2026-07-30 dump 证据，引入时间窗 = objectives 预算域从旧表 schema 迁移到 hse_safety_budget 的那次改造（≤2026-07-30 已既成事实），具体 commit 不可考——如实标注，不编造。

---

## 9. 调用方审计（字段语义统一性）

| 调用方 | 文件:行 | 发送/使用方式 |
|---|---|---|
| **web-naive 支出页**（唯一 naive 调用页） | `views/objectives/budget/expenditure/index.vue:337-339` | 创建/更新 payload = `{ budgetYear, year, … }` **双发**；编辑回填 `record.budgetYear \|\| record.year`（:295-296，用到读别名 year） |
| **web-antd 预算页** | `apps/web-antd/src/views/objectives/budget/index.vue:672-674` | 同样 `{ budgetYear, year, … }` 双发 |
| API 封装 | `api/hse/goals.ts:463-472`（naive）/ `:335-344`（antd） | `BudgetItem` 类型**同时声明 budgetYear 与 year**（:404-405），与后端读别名同构 |
| 列表参数 | `BudgetListParams.year` | → budgetList `effectiveBudgetYear = budgetYear \|\| year` → SQL `budget_year=$n` ✓ 一致 |
| 后端→后端 | 全库 grep | **无**（仅 HTTP 路由入口） |
| 测试 | `server/__tests__/objectives.test.js:177-185` | 「创建安全投入」用例 payload 为 `{ item, amount }`（无年度字段）；INSERT 列仍恒含 year ⇒ **若该测试曾对连通 DB 运行必失败**；它未暴露缺陷，说明要么未跑、要么跑在 DB 断连的内存降级模式（`isConnected()=false` 走 mem.budgets 分支，:1404）。本审计不运行测试（禁写库），仅静态指出其断言与实时契约矛盾 |
| 数据导入通道（3 条，均正常） | `server/_import_budget.js`（显式列名 INSERT，用 budget_year）；`server/services/importShared.js:931-937`（generic import，targetTable=hse_safety_budget，numericFields 含 budget_amount）；cost 域导入（costService） | 全部直写 `budget_year`，**不走 budgetToSnake** ⇒ 339 行存量数据由此而来，与坏映射无关 |

**字段语义统一性结论**：全系统只有 **objectiveService.budgetToSnake 一个点**把年度写成 `year` 列；其余所有路径（读、统计、导入、索引、前端类型）统一用 `budget_year`。漂移是**单点残留**，不是系统性分裂——这决定了修复面可以极小（见 §11）。

---

## 10. 生产风险（严格三分）

| 类别 | 内容 |
|---|---|
| **已证实** | ① dev `hse_safety_budget` 无 `year` 列、年度列为 `budget_year` NOT NULL；② dev 上 POST /api/objectives/safety-budget 确定性失败（42703，UI + 最小探针 + 回滚探针三证）；③ PUT 含年度字段同样失败（探针实证） |
| **推断风险** | 生产库由**同一份代码的 `ensureTables()` DDL**（CREATE TABLE IF NOT EXISTS，无 year 列）建表，且仓库内无任何迁移给该表加过 year 列 ⇒ **若生产未经额外人工修复，POST/PUT(年度) 在同一 schema 上同样失败**。生产与 dev 跑同一工作区代码（计划任务 HSE-Backend-5876），故障面相同 |
| **未核验** | **生产数据库实际 schema**——本专项未连接生产，不作生产现状断言。如需定论，应由具备生产读权限者执行一次 `information_schema.columns` 只读查询（单条 SELECT，零写入） |

**禁止句式自查**：本报告未写「生产确定存在同样问题」；未连接生产；未对生产做任何读写。

---

## 11. 最小修复方案（Q6，只提出、不实施）

### 方案 A：修 service 字段映射（删 year 键）— **推荐**

- 修改文件：`server/services/objectiveService.js`（`budgetToSnake` 删 :341 `year` 键一行）
- 是否需要 SQL：否
- 是否需要 migration：否
- 是否影响已有数据：否（纯代码路径，无数据变更；存量 339 行不动）
- 是否影响前端：否（前端双发 budgetYear+year，服务端只取 budgetYear 分支即可；读别名 year 保留不影响）
- 是否影响 API contract：否（请求/响应结构不变；失败码 -1 变为成功 0）
- 风险：极低。唯一行为变化 = 创建/改年度从「必败」变「可用」。注意连带修复两点：① `budgetCreate` 仍不过滤 undefined ⇒ 未传字段写 NULL，若调用方漏传 budgetYear 会撞 `budget_year NOT NULL`（建议顺带在 create 里校验必填，但属增强、可分期）；② `budget_code` 无映射 ⇒ 新建记录编码恒 NULL（如产品要求编码，需另加映射，顺带处理唯一冲突错误原始文本问题）
- 回归面：objectives 支出页增/改、goals.ts 封装、objectives.test.js 创建用例（修后该测试对连通 DB 才可能转绿）

### 方案 B：兼容层（INSERT/UPDATE 前按真实 schema 过滤列）

- 修改文件：objectiveService.js（新增「列名白名单/信息schema 预检」逻辑，或抽一个 `pickExistingColumns(fm)`）
- SQL：否；migration：否；数据：无影响；前端：无影响；contract：无影响
- 风险：中。一劳永逸防同类漂移（未来加映射写错列名不会炸），但引入运行时信息schema 查询（可缓存）与更多代码面；对本单点缺陷属杀鸡用牛刀
- 适用场景：若判断 objectives 域映射表还会继续腐化，则值得

### 方案 C：给 cost 域新建带校验的预算主体创建端点（GAP-01 正规解）

- 修改文件：`server/routes/cost/main.js` + `costController.js` + `costService.js`（新端点 + toCents 严校验 + budget_code 生成/判重）
- SQL：否（复用 hse_safety_budget）；migration：否；数据：无影响；前端：cost 页接新端点；contract：**新增** POST /api/cost/budgets（不伪造、不覆盖既有 objectives 端点）
- 风险：中高（新端点=新攻击面+新测试面），但能把预算创建纳入 cost 域统一的严格校验与权限体系（后端 costWriter 角色集），并让 GAP-01 有正解
- 定位：产品级决策，建议与方案 A 并行排期，不互相阻塞

**推荐**：**方案 A**（一行删除 + 两项顺带增强），理由：缺陷是单点残留（§9），最小改动恢复功能，零数据/契约/前端风险；方案 B/C 作为后续演进按需启动。

---

## 12. 是否建议修复

# **RECOMMEND FIX（按方案 A，一行删键 + 两项顺带增强）**

理由：
1. 缺陷确定性、可复现、有最小修复（删 1 行），风险面已闭环量化；
2. 影响两个前端 app 的预算创建与年度修改，用户可见功能缺失已长期存在（早于 git 基线）；
3. 与 GAP-01 直接相关——不修则 GAP-01 永远 BLOCKED；
4. 修复不需 SQL/migration/数据变更，可在常规发版窗口执行，执行时仍遵守「dev 演练 + 用户授权」的既有生产纪律。

**同时明确不建议现在做的**：不改旧表 `safety_budgets` 的生死（数据治理议题，另立任务前先确认无引用）；不借本次修复顺手重构 budgetToSnake 全表（单点缺陷单点修）。

---

## 13. 证据附件索引（本轮全部实证命令与结果）

| # | 证据 | 方式 | 结果 |
|---|---|---|---|
| E1 | budgetToSnake 纯函数实测（从源码提取后 eval，不连 DB） | `node _audit_purefn.cjs` | INSERT 列恒含 year（25 键）；UPDATE 仅 status/remark → SET 无 year；UPDATE 改年度 → SET 含 year；budget_code 永不在映射 |
| E2 | 回滚式 PG 探针（独立事务 ×5，全部 ROLLBACK，目标 id=-999999） | `node _audit_rollback_probe.cjs` | update_with_year **42703**；update_status_only **OK 0 行**；insert_with_year **42703**；insert_without_year **OK**（修正参数个数后复跑）；read_list_path **OK 5 行**；post-check probe 残留 0、总行 339 不变 |
| E3 | schema 全量 | `node _audit_schema.cjs` | 40 列、无 year、budget_year NOT NULL、约束/索引如 §2 |
| E4 | GAP-01 历史失败证据 | 上轮 UI + 最小探针（已存档于 HSE_COST_GAP01_GAP03_BROWSER_ACCEPTANCE_5e8b052_V1.md §三） | `关系 hse_safety_budget 的 year 字段不存在` |
| E5 | git 考古 | `git log/blame/-S`、`git show 31975ef:…`、`git show cb9b956` | §7/§8 时间线；cb9b956 逐字搬迁实证 |
| E6 | 遗留表现证 | `pg_dump` 文本解析（2026-07-30/08-01/08-04 备份） | safety_budgets(year) 与 hse_safety_budget(budget_year) 并存；旧表现今仍在 dev 库 |

---

## 14. 最终结论

# **BLOCKED**

**范围界定（重要）**：本结论描述**被审计系统**的状态，非审计工作本身——审计 6 问全部有据可答，证据链完整闭合。

| 功能 | 状态 |
|---|---|
| objectives 预算 **创建（POST）** | **BLOCKED**——对当前 schema 确定性失败（year 列），自早于 git 基线的年代起即坏 |
| objectives 预算 **更新（PUT）body 含年度字段** | **BLOCKED**——同根因失败（探针实证） |
| objectives 预算 列表/统计/详情/导出/删除 | 正常 |
| 预算导入（3 条通道） | 正常（直写 budget_year） |
| GAP-01（成本页预算手工新增） | 维持 BLOCKED，待方案 A 或 C 落地后解冻 |

**这不是为了得到 BLOCKED 而寻找的问题**：year 键在写映射中、DB 无 year 列、错误逐字可复现、最小修复一行——四层证据（源码/纯函数/PG 探针/git 历史）互相独立且一致。**修不修、何时修，留待产品/开发决定；本专项不修。**

---

## 15. 纪律自查

- [x] 未修改 objectiveService.js / objectiveController.js / routes / SQL / migration / schema / 前端 / cost 模块 / 登录 JWT / 权限 / 其他业务模块
- [x] 未执行 npm install/update/migration/migrate
- [x] 未执行 git commit/push/merge
- [x] 未连接生产数据库
- [x] 仅只读 SQL + 回滚式探针（全部 ROLLBACK，post-check 零残留）
- [x] 终局 `git diff` 与审计前一致（无新业务代码修改；唯一新增为本报告 .md 与 3 个一次性只读审计脚本，脚本在报告定稿后删除）
