# 考核扣分规则库（hse_assessment_rule）交付文档

> 交付类型：一期规则引擎配置端 · 扣分规则库管理
> 交付时间：2026-08-28
> 技术栈：Node.js/Express + PostgreSQL / Vue3 + Naive UI + vue-vben-admin（web-naive）
> 后端端口：5800 ｜ 前端 dev（web-naive）：5888

---

## 1. 模块概述

「扣分规则库」是安全履职考核规则引擎的**配置侧一期**：将原有硬编码的扣分规则迁移为可配置、可维护的规则库，支持四层结构（考核模板→指标→检查项→扣分规则）中的**规则/检查项**层配置，并为二期「事件驱动评分 / 推荐规则」落地提供数据底座。

一期交付范围：
- 建表 DDL（6 张核心表）+ 规则种子迁移脚本
- 后端 CRUD API（列表/统计/类别/详情/新建/更新/启停/软删）
- 前端管理页面（统计卡 + 筛选 + 分页列表 + 新建/编辑/查看/启停/删除）
- 路由菜单注册与浏览器 / API 双重验证

---

## 2. 建表 DDL 与种子迁移

### 2.1 表结构

| 表名 | 作用 |
| --- | --- |
| `hse_assessment_rule` | 扣分规则主表（类别/来源表/触发方式/扣分方式/条件/范围/优先级/版本/有效期/状态） |
| `hse_rule_detail` | 明细子项行存储（CAR003 车辆异常等：号牌污损/GPS离线… 新增异常仅加一行，零代码） |
| `hse_rule_condition` | 简单条件行（字段/操作符/取值，AND/OR 组合） |
| `hse_assessment_veto_rule` | 否决项（优先级 100，首先执行） |
| `hse_bonus_rule` | 加分项（最后执行） |
| `hse_assessment_score_detail` | 评分扣分明细快照（外键 `hse_assessment_target`，`rule_snapshot` 存规则版本快照） |
| `hse_assessment_category_limit` | 类别扣分上限（每类别合计扣分封顶；`rule_count` 存自定义规则数，可空表示沿用真实规则数） |

关键设计：
- **唯一约束**：`uq_rule_code`、`uq_rule_detail`、`uq_veto_code`、`uq_bonus_code`（支持 `ON CONFLICT` 幂等重复执行）
- **条件双模式**：`condition_mode = simple | advanced`，统一以 JSON 存储（`hse_rule_condition` 行 / `condition_expr` 树）
- **四种扣分方式**：`fixed`（固定/次）、`cumulative`（次数×单次）、`detail`（明细查表）、`tiered`（阶梯），统一 `deduct_config` JSON 承载附加配置
- **行内版本 + 快照**：主表 `version` 每次更新 +1，结果表 `rule_snapshot` 存版本快照，保证评分历史可追溯

### 2.2 种子迁移结果（已落库）

| 项 | 数量 | 说明 |
| --- | --- | --- |
| 扣分规则 | 12 | 安全文化建设1 / HSE教育培训2 / 三违管理3 / 现场管理-驾驶员管理3 / 现场管理-转运站管理2 / 消防管理1 |
| 否决项 | 3 | 优先级 100 |
| 加分项 | 3 | — |
| 明细子项行 | 12 | 含 CAR003 多子项（号牌污损/转向灯异常/GPS离线/未固定停车/摄像头异常） |
| 简单条件行 | 6 | — |

脚本：
- `server/sql/sprint_assessment_rule_engine_tables.sql` — 建表 DDL
- `server/sql/sprint_assessment_rule_migration_seed.sql` — 迁移 + 种子（`ON CONFLICT DO UPDATE` 幂等）

---

## 3. 后端 API

路由：`server/routes/hse-assessment-rule.js`，挂载 `app.use('/api/hse/assessment-rule', ...)`。

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/` | 规则列表（类别/触发/扣分方式/状态/关键词筛选 + 分页，附子项数） | — |
| GET | `/stats` | 统计（总数/启用/各扣分方式/自动手动/子项行数） | — |
| GET | `/categories` | 类别字典（筛选用） | — |
| GET | `/:id` | 规则详情（主表 + 子项 + 条件） | — |
| POST | `/` | 新建规则（事务，可选携带子项/条件） | admin/safety_manager |
| PUT | `/:id` | 更新规则（整体替换子项/条件，`version+1`） | admin/safety_manager |
| PUT | `/:id/status` | 启停 | admin/safety_manager |
| DELETE | `/:id` | 软删（`is_deleted=TRUE`，保留记录供追溯） | admin/safety_manager |

字段约定：前端统一 **camelCase** 提交，后端兼容读取；返回统一 `camelKeys`（camel 优先）；子项/条件在新建、更新中以事务包裹保证原子性。

**类别扣分上限**（路由 `server/routes/hse-assessment-category.js`，挂载 `app.use('/api/hse/assessment-category', ...)`）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/limits` | 类别扣分上限列表（含规则数 / 启用规则数，及自定义 `ruleCount`） |
| POST | `/limits` | **全量保存**（事务：先清空再写入提交列表，支持新增 / 改名 / 删除行；重复类别 `ON CONFLICT (category) DO UPDATE` 合并而非报错） |

---

## 4. 前端页面

### 4.1 API 适配层
`apps/web-naive/src/api/hse/assessment-rule.ts` — TypeScript 命名空间 `AssessmentRuleApi` + 8 个调用函数，字段与后端 camelCase 契约一一对应。

### 4.2 页面
`apps/web-naive/src/views/hse/assessment-rule/index.vue`（`defineOptions name = AssessmentRuleManagement`）
- **统计卡**：规则总数 / 已启用 / 固定 / 累计 / 明细(子项行) / 自动触发 / 人工触发
- **搜索面板**：类别（字典下拉，可筛选）/ 扣分方式 / 触发方式 / 状态 / 关键词
- **服务端分页表格**：编码 / 名称 / 类别 / 数据来源 / 扣分 / 方式(标签) / 触发 / 状态 / 操作
- **新建/编辑模态**：主表单（编码/名称/类别/来源表/触发/扣分方式/单次扣分/最大扣分/优先级/状态/备注）+ `detail` 子项动态行 + 触发条件动态行
- **查看抽屉**：完整详情（含子项、条件、版本、有效期）
- **操作**：编辑 / 查看 / 启停（状态标签联动）/ 删除（Popconfirm 二次确认）

### 4.3 路由菜单
`apps/web-naive/src/router/routes/modules/hse-objectives.ts`
- 菜单：「目标职责 → 扣分规则库」，路由 `/objectives/assessment-rule`，`authority: ['admin']`
- 命名 `AssessmentRuleLibrary`，图标 `lucide:list-tree`（该文件头部注释同步更新说明）

### 4.4 类别扣分上限页签（全可编辑）
页面以 `NTabs` 分两个页签：**「扣分规则」**与**「类别扣分上限」**。后者为**完全自定义的可编辑表格**（非只读派生）：
- 列：**类别**（文本输入）/ **扣分上限（分）**（数字输入，留空 = 不设上限）/ **规则**（数字输入）/ **说明** / **操作**
- 工具栏：**「保存类别上限」**（整表全量提交）/ **「刷新」** / **「＋ 增加行」**（新增一行空白可编辑行）
- 每行操作列「删除」按钮，可删任意行（含新增行）
- 类别、扣分上限、规则数三列全部可自由编辑；「+ 增加行」即自定义新增类别

---

## 5. 数据口径与约定

- **「有效规则」= `is_deleted = FALSE`**：列表与统计统一此口径。
- **统计 total** 同样按 `is_deleted=FALSE` 过滤（修复详见 §6），保证「总数 = 列表行数」。
- 扣分方式标签：fixed 固定 / cumulative 累计 / detail 明细 / tiered 阶梯。
- 触发方式：auto 自动（定时扫描来源表批量扣分）/ manual 人工（评分页填写）。
- 新建/编辑提交载荷：`details`、`conditions` 仅在 `deductType=detail` / 配置了条件时携带，由后端 `pickDetails/pickConditions` 幂等解析。
- **类别扣分上限**：以 `hse_assessment_category_limit` 表为唯一数据源（不再由规则自动派生）；每类别一行，最大扣分与该类规则实际扣分相互独立——`max_deduct` 为类别合计封顶，单条规则的封顶在规则主表 `max_deduct`（可选）。`rule_count` 为自定义显示/配置的规则数（空则前端展示该类别真实规则数）。
- **「保存类别上限」为全量替换语义**：提交列表即表的最终内容，不在列表中的旧行会被删除（用于撑持增/删/改名自定义）。

---

## 6. 开发过程中修复的问题

1. **`/stats.total` 口径缺陷**：原 `COUNT(*)` 未过滤 `is_deleted`，软删记录会被计入「规则总数」，造成列表 12 条而统计 13。修复为 `COUNT(*) FILTER (WHERE is_deleted=FALSE)`，前后端口径统一。
2. **前端统计字段命名不一致**：后端 `/stats` 经 `camelKeys` 返回 camelCase（`fixedCnt`/`detailRows` 等），前端初稿误用 snake_case 导致显示 undefined，已对齐为 camelCase。
3. **前端模板缺失 `operatorLabel`**：查看抽屉条件列引用的操作符文案函数未定义，已补齐。
4. **自动化浏览器测试误删种子数据**：测试脚本在表格多行操作时行索引错位，误将编辑/停用/删除作用于 `SAFE001`。已按种子原值完整还原为「安全文化建设 / 人工 / 固定 10 分/次 / 上限 20 / 启用」（对真实数据无影响，已复核）。
5. **类别上限全量保存撞唯一约束整体回滚**：还原数据时提交列表出现重复 `category`（原行 + 改名行回改），触发 `category` 唯一约束导致事务整体回滚。修复为 `INSERT ... ON CONFLICT (category) DO UPDATE`，重复类别合并而非报错，保证自定义增删改的健壮性。
6. **PostgreSQL `numeric` 返回字符串**：`max_deduct` 为 `numeric` 列，驱动返回 `"8.00"` 字符串，测试断言用全等比较 `=== 8` 误报 false。产品数据本身正确（前端输入组件正常接收字符串数值），此为验证脚本断言问题，非功能缺陷。

---

## 7. 验证结果

- **API 层**（有效 token）：列表 total=12；统计 `{total:12, enabled:12, fixedCnt:1, cumulativeCnt:8, detailCnt:3, tieredCnt:0, autoCnt:11, manualCnt:1, detailRows:12}`；类别 6 类齐全。
- **CRUD 全链路**：新建→查看详情→编辑（2→3 分、maxDeduct 生效、version 1→2）→停用（enabled→disabled）→删除（软删，列表即时移除）均通过。
- **浏览器实机**：页面加载（统计卡+12 行）、新建演示规则（12→13）、查看详情抽屉均通过（截图 demo-*.png）。
- **收尾数据态**：有效规则 12 条、enabled=12、auto=11、manual=1，无演示/E2E 残留，SAFE001 还原完好。
- **类别扣分上限（本次新增验证）**：新增 2 行 → 生效；改「规则」数 → 生效；类别改名 → 生效；提交含重复类别 → 合并为一行不崩；删除行 / 还原 → 回初始 6 类，无测试残留。初始数据：HSE教育培训30 / 消防管理50 / 现场管理-转运站管理50 / 现场管理-驾驶员管理50 / 三违管理=不设上限 / 安全文化建设20，`rule_count` 全空。

---

## 8. 遗留与二期建议

- `advanced` 条件树与 `tiered` 阶梯高级配置：本期前端仅开放 `simple`/基础表单，`condition_expr`、`deduct_config` 支持存储但无专门编辑 UI，建议二期补充。
- `hse_assessment_veto_rule` / `hse_bonus_rule`：本期已建表 + 种子，无管理界面；二期可纳入统一规则管理页。
- 规则引擎「评分执行 / 事件驱动扣分 / 每日扫描」已在此前阶段落地（见 `monthly-assessment-chain-report`），本规则库后续应接入引擎加载规则校验。
- 自动化 UI 测试对表格多行定位存在错位风险，新增其它模块自动化时需做行索引稳定处理。

---

## 9. 类别扣分上限（自定义配置，本次新增）

背景：「考核表」口径中，**扣分上限归属类别而非单条规则**（如「三违管理」月度合计上限，而非「三违检查未反馈」单独封顶）。据此将上限管理上移至类别层，并做成**完全可自定义**的编辑表格，而非固定代码 / 只读派生。

设计要点：
- **数据源**：`hse_assessment_category_limit` 表（每类别一行），不再由规则表自动派生。
- **表结构**：`category`（类别名，唯一约束）、`max_deduct`（类别合计扣分封顶，空 = 不设上限）、`rule_count`（自定义规则数，本次 `ALTER TABLE ADD COLUMN` 新增）、`remark`、时间戳。
- **API**：`GET /api/hse/assessment-category/limits` 返回列表（含真实规则数 `ruleTotal`/启用数 `ruleEnabled`）；`POST /limits` **全量保存**（见 §3）。
- **前端**：见 §4.4 —— 类别 / 扣分上限 / 规则三列均可编辑，工具栏含「＋ 增加行」「保存类别上限」「刷新」，每行可删除。

边界与语义：
- 类别上限是**类别维度**的合计封顶；单条规则仍可（可选）在规则主表 `max_deduct` 设独立封顶，二者互不冲突。
- 「规则」列默认取该类别真实规则数（`ruleTotal`），也可手动改写并持久化到 `rule_count`，满足"活动可自定义"诉求。

初始化数据（6 类，本次验证后已重置）：HSE教育培训 30 / 消防管理 50 / 现场管理-转运站管理 50 / 现场管理-驾驶员管理 50 / 三违管理 不设上限 / 安全文化建设 20。

> 说明：`rule_count` 列通过运行时 `ALTER TABLE` 添加；如需要在正式迁移脚本固化，可补充到 `sprint_assessment_rule_engine_tables.sql`。

---

## 涉及文件清单

| 文件 | 说明 |
| --- | --- |
| `server/sql/sprint_assessment_rule_engine_tables.sql` | 建表 DDL（7 表，含 `hse_assessment_category_limit`；`rule_count` 建议在此补充） |
| `server/sql/sprint_assessment_rule_migration_seed.sql` | 迁移 + 种子 |
| `server/routes/hse-assessment-rule.js` | 规则库 CRUD API |
| `server/routes/hse-assessment-category.js` | 类别扣分上限 API（GET/POST `/limits`） |
| `server/app.js` | 挂载路由 |
| `apps/web-naive/src/api/hse/assessment-rule.ts` | 前端 API 适配层 |
| `apps/web-naive/src/views/hse/assessment-rule/index.vue` | 管理页面（含「类别扣分上限」页签） |
| `apps/web-naive/src/router/routes/modules/hse-objectives.ts` | 路由菜单注册 |