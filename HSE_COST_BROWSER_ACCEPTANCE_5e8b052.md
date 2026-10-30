# HSE 成本台账浏览器端验收报告（5e8b052）

> 验收基准：分支 `feat/hse-business-closure`，提交 `5e8b0524ccd69369e59857024f0640cadec5f4cb`（父提交 `299d9ab`）。
> 验收方式：真实浏览器（本机 Chrome + playwright-core，无头）走用户运行中的 dev 前端 `127.0.0.1:5173`（服务当前工作区前端代码），全程抓取 Console / Network / 页面 DOM，并以 dev 数据库只读查询交叉验证。
> **本轮纪律：未修改任何业务代码、迁移 SQL、测试用例；未执行生产迁移；未对生产库（5876）做任何读写；未产生任何测试数据。**（`git status` 除两个他人遗留未跟踪项外无变化，HEAD 仍为 `5e8b052`。）

---

# 1. 环境

```text
Commit:   5e8b0524ccd69369e59857024f0640cadec5f4cb（feat/hse-business-closure，git rev-parse 实测）
Frontend: 安全看板vben/apps/web-naive @ 工作区代码，经 dev server http://127.0.0.1:5173（vite 8.1.4，无依赖预打包模式）实测
Backend:  工作区后端代码 @ 5e8b052 无法启动（BUG-01）。
          环境中实际在跑的后端仅两个，且均为成本功能上线（16:48 首次提交）之前的旧代码：
            - 127.0.0.1:5888（AI 验证栈，uptime ≈9.4 小时，启动于 10:50 前后，5173 的 /api 代理目标）
            - 127.0.0.1:5876（生产后端，uptime ≈35.8 小时；本轮仅对其做过只读 /api/health 探测，无任何写操作）
          按项目约定本应承载 dev 后端的 5882 端口无任何服务；以 5e8b052 代码启动 5882 立即崩溃（见 BUG-01）。
Database: safety_dashboard_dev（只读验证：费用域 10/10 张表齐全、3 个硬化索引
          uq_cost_commitment_active_per_request / uq_hse_safety_budget_bizkey / idx_cost_import_batch_fingerprint
          与 file_fingerprint/file_size 列均在）
```

---

# 2. 测试结果

| 编号 | 测试项 | 结果 | 备注 |
|---|---|---|---|
| PAGE-01 | 页面加载 | **FAIL** | 页面挂载成功、路由/菜单/登录正常、无 JS 运行时错误；但模板中 12 种 Naive UI 组件未注册，渲染为无样式内联元素（BUG-03）；且 5 个 `/api/cost/*` 请求全部 404（BUG-01） |
| COST-01 | 新增成本 | **FAIL（阻断）** | 后端无法启动 + 页面 UI 不可用，业务流无法执行 |
| ALLOC-01 | 新增分摊 | **FAIL（阻断）** | 同上；且页面本就没有独立分摊入口（见 BUG-03 备注） |
| ALLOC-02 | 超额分摊拒绝 | **FAIL（阻断）** | 无法执行 |
| ALLOC-EDIT-01 | 修改分摊 | **FAIL（阻断）** | 无法执行；另记录设计缺口：前端无分摊管理 UI，`PUT /api/cost/allocations/:id` 无页面入口 |
| ALLOC-DELETE-01 | 删除分摊 | **FAIL（阻断）** | 无法执行；同上，`DELETE` 亦无页面入口 |
| ALLOC-DELETE-02 | 重复/不存在 ID 删除 | **FAIL（阻断）** | 无法执行 |
| ALLOC-INVALID-01/02/03 | 非法分摊 | **FAIL（阻断）** | 无法执行 |
| IMPORT-01 | 正常导入 | **FAIL（阻断）** | 无法执行（导入弹窗本身也因 BUG-03 内联常驻、不可用） |
| IMPORT-DUP-01 | 重复导入 | **FAIL（阻断）** | 无法执行 |
| BATCH-01 | 批次追踪 | **FAIL（阻断）** | 无法执行 |
| IMPORT-ERR-01 | 错误导入 | **FAIL（阻断）** | 无法执行 |
| IMPORT-RETRY-01 | 失败重试 | **FAIL（阻断）** | 无法执行 |
| CONSISTENCY-01 | 刷新一致性 | **FAIL（阻断）** | 无法执行 |
| CONSOLE-01 | Console 清洁度 | **FAIL** | 无 `pageerror`/Uncaught/Unhandled Rejection/TypeError；但存在 5 个 404 资源加载错误（5 个成本 API），按验收标准不通过 |

**浏览器实测关键证据（PAGE-01）**：

- 成本页 URL 正常到达 `http://127.0.0.1:5173/objectives/budget/cost`，面包屑/菜单「安全费用预算及支出 → 安全生产费用（业务闭环）」正常，`devAutoLogin` 登录（admin/admin123 → 5888）成功。
- 页面发出的 5 个请求全部 404：`/api/cost/budgets?pageSize=100`、`/api/cost/requests?pageSize=100`、`/api/cost/budgets/stats`、`/api/cost/reference/biz-domains`、`/api/cost/reference/invest-categories`（运行中的 5888 是旧代码，根本没有 `/api/cost` 路由）。
- DOM 实测：成本页存在 **13 种未升级自定义元素**（`N-H2×1、N-CARD×3、N-SPACE×2、N-STATISTIC×3、N-DATA-TABLE×2、N-MODAL×2、N-FORM×1、N-FORM-ITEM×15、N-SELECT×6、N-INPUT×5、N-INPUT-NUMBER×4、N-ALERT×1`），真实 `.n-card`/`.n-data-table` 数量为 0；导入弹窗内容内联常驻主区域、无遮罩、不可开关。
- 同环境对照：兄弟页 `/objectives/budget/expenditure` 实测 38 个真实 `.n-button`、5 个真实 `.n-card`、**0 个未知自定义元素** ⇒ 问题在本成本页自身，而非环境或全局配置。

---

# 3. BUG

BUG 合计：**3 个代码缺陷 + 2 个环境事实**。按纪律本轮只记录、未修复。

```text
BUG-01（P0 阻断级 · 后端根本无法启动）
页面/组件：无（后端进程级）。任何调用 /api/cost 的前端页面都不可用。
操作步骤：cd server && PORT=5882 DB_NAME=safety_dashboard_dev SCHEDULER_ENABLED=false
          WPS_GRID_SYNC=false WPS_GRID_DATA_SOURCE=false node app.js
预期：后端正常启动并监听 5882。
实际：进程启动即崩溃退出 —— Error: Cannot find module './routes/cost'
      （app.js:121 `const costRoutes = require('./routes/cost');`）。
根因：项目惯例为「目录路由 routes/xxx/main.js + 同名聚合入口 routes/xxx.js
      （内容：router.use('/', require('./xxx/main'))）」，Node 解析时文件优先于目录。
      routes/cost/ 下只有 main.js，从未存在 index.js，也没有 routes/cost.js
      （git log --all 确认该文件从未入库；第一轮提交 9d9b173 引入此挂载）。
      前三轮所有「验证」均为模块级 require('./routes/cost/main')（可加载），
      从未真正启动过 app.js，因此未暴露。
HTTP：N/A（服务未起）。
Console：N/A。
数据库影响：无（进程未起来，未连接业务）。dev 库结构完整，修复无需迁移。
严重程度：P0。影响面：该分支部署到任何环境（dev/生产）后端 100% 无法启动；
      用户当前 dev 前端（5173→5888 旧后端）全部 /api/cost 接口 404（已浏览器实测）。
修复建议（下一轮实施）：新增 server/routes/cost.js，四行，与 hazards.js/objectives.js 同款：
      const express = require('express');
      const router = express.Router();
      router.use('/', require('./cost/main'));
      module.exports = router;
```

```text
BUG-02（P1 阻断级 · 与费用域无关，HEAD 前端既有缺陷）
页面：/overview/assessment-analysis（考核分析页）
操作步骤：浏览器进入该路由。
预期：正常渲染。
实际：src/views/analysis/assessment/index.vue 静态 import 的 8 个 .vue 文件
      （AssessmentOverview / DepartmentRanking / DeductionAnalysis / DeductionDetail /
      GoalsAssociation / IndicatorAnalysis 等）在提交态缺失（目录下仅 index.vue，
      git status 干净 ⇒ 提交态即缺）。该路由为懒加载，故仅此路由崩，不影响其他页面。
HTTP：模块加载 404/解析失败。
Console：vite 依赖扫描报 [UNRESOLVED_IMPORT] × 8。
数据库影响：无。
严重程度：P1（阻断该路由，非费用域、非本轮引入，但同分支交付带上线即坏）。
```

```text
BUG-03（P0 阻断级 · 前端页面渲染全面失效）
页面：/objectives/budget/cost（成本台账页）
操作步骤：浏览器登录后进入成本台账页。
预期：统计卡、预算概览表、费用申请表、新建申请弹窗、导入弹窗正常渲染与交互。
实际：index.vue 模板使用了 16 种 Naive UI 组件，script 只导入了 3 种
      （NButton / NTag / NUpload）。项目无全局注册、无 unplugin 自动导入
      （已 grep 证实：无 app.component、无 Components/Resolver 插件）。
      未导入的 12 种组件在浏览器中渲染为无样式内联的自定义元素：
      n-h2 / n-card / n-space / n-statistic / n-data-table / n-modal /
      n-form / n-form-item / n-input / n-input-number / n-select / n-alert。
      实测后果：无卡片、无表格、无统计数字；两个弹窗内容内联常驻主区域、
      无遮罩、无法开关；表单控件全部不可交互。同浏览器同环境下兄弟页
      expenditure 实测 0 个未知元素，排除环境因素。
HTTP：N/A（页面自身渲染问题）。
Console：无 JS 运行时错误（未知元素不抛错，属于静默失效）。
数据库影响：无。
严重程度：P0。另注意：前端 vue-tsc「0 错误」不构成反证——项目未启用
      strictTemplates，模板中未注册元素会被类型检查静默放行
      （已 grep tsconfig 证实无 strictTemplates 配置）。
      这正是「函数能加载/类型能过 ≠ 浏览器可用」的实例。
修复建议（下一轮实施）：script setup 中补导入上述 12 种组件
      （import { NCard, NH2, NSpace, NStatistic, NDataTable, NModal, NForm,
      NFormItem, NInput, NInputNumber, NSelect, NAlert } from 'naive-ui';）。
```

```text
ENV-01（环境事实，非代码缺陷）
dev 后端端口 5882 无服务；用户 dev 前端 5173 的 /api 实际代理到 5888
（AI 验证栈，早于成本提交约 6 小时启动 ⇒ 旧代码，无 /api/cost 路由）；
生产 5876 在跑（本轮只读探测，未写）。⇒ 即使 BUG-01 修好，也需把 dev 前端
代理指向新起的 dev 后端（或重启 5888 栈）才能完整验收。
```

```text
ENV-02（环境事实，非代码缺陷）
本环境（WorkBuddy）safe-delete 护栏会把 vite 依赖优化器清理临时目录
（111 个文件 > 50 阈值）判定为批量删除并直接杀死 node 进程 ⇒ 以全新
cacheDir 启动独立 dev server 不可行。本轮改用用户已运行的 5173 完成前端取证。
```

---

# 4. 数据库清理

```text
测试数据已清理：YES（实际未产生任何测试数据——所有业务流均被阻断，从未写库）
测试批次已清理：YES（hse_cost_import_batch = 0）
真实业务数据是否受到影响：NO
```

dev 库只读复核（验收结束后实测）：

```text
reqs=0  batches=0  actuals=0  commitments=0  allocs=0  test_budgets=0
```

本轮临时产物（探针脚本、浏览器 profile、临时 vite 配置、日志）已全部删除；`git status` 与开始时一致（仅两个他人遗留未跟踪项 `acl-out/`、`安全看板vben/test-write.txt`），HEAD 仍为 `5e8b052`，未提交、未推送任何内容。

---

# 5. 最终结论

```text
FAIL — 存在阻断问题，不得合并。
```

判定依据：`BUG-01`（后端无法启动，自第一轮提交起该分支后端从未成功运行过）与 `BUG-03`（前端成本页 12 种组件未注册、页面渲染与交互全面失效）均为上线阻断级；`BUG-02` 同分支携带另一个路由级阻断。二者叠加导致「前端页面 → API → 后端业务 → 数据库 → 刷新后状态」五项验收链在第一环即断，本轮 15 个测试项无一可执行为 PASS。

本轮未修复任何问题（遵守「不修改业务代码」纪律）。建议下一轮按上述修复建议补齐 `routes/cost.js` 与页面组件导入后，**重新完整走一轮浏览器验收**（并需先把 dev 前端代理指向真正运行 5e8b052 代码的 dev 后端），通过前不得合并主分支、不得上线。
