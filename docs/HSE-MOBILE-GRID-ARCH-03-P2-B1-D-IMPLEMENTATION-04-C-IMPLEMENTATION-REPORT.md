# HSE-MOBILE-GRID-ARCH-03-P2-B1-D-IMPLEMENTATION-04-C
## 通道 B 待归属管理 —— Naive UI 正式前端最小实施报告

- 阶段：`P2-B1-D-IMPLEMENTATION-04-C`
- 最终状态：`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_04-C_IMPLEMENTED`
- 范围：**正式前端最小实施**（+ 一处经用户授权的后端成功码修复，见 §13/§22）
- 执行原则：能复用不新建、能最小不扩大；已完成即 STOP（未进 04-D / 未执行生产 stamping / 未进 P2-C）

---

## 1. 实际修改文件

### 1.1 本阶段新增（正式前端）

| # | 文件 | 动作 |
|---|---|---|
| 1 | `安全看板vben/apps/web-naive/src/api/hse/grid-attribution.ts` | 新增（API 客户端，复用 `requestClient`） |
| 2 | `安全看板vben/apps/web-naive/src/views/site/grid/attribution/index.vue` | 新增（页面：「通道 B 待归属管理」） |

### 1.2 本阶段修改（正式前端）

| # | 文件 | 动作 |
|---|---|---|
| 3 | `安全看板vben/apps/web-naive/src/router/routes/modules/hse-site.ts` | 在既有「网格管理」下新增子路由 `/site/grid/attribution`（未动任何既有菜单名/结构） |
| 4 | `安全看板vben/apps/web-naive/src/locales/langs/zh-CN/page.json` | 新增 2 个键：`siteGridAttribution` / `siteGridAttributionDesc` |
| 5 | `安全看板vben/apps/web-naive/src/locales/langs/en-US/page.json` | 同上（英文镜像） |

### 1.3 经用户单独授权的两次后端修复（**非**本阶段原始范围）

| # | 文件 | 动作 |
|---|---|---|
| 6 | `server/routes/hse-grid-attribution.js` | 修改（2 处响应封装）：成功 `code` 由「HTTP 状态码」改为 `0`；失败 `code` 透传具体业务码 |
| 7 | `server/middleware/encryption.js` | 修改（R2，+6 行纯增量）：`decryptMiddleware` 增加「裸数组」分支，修复 `GET /employees/selector` 被展开为数字键对象 |

> 两文件**均不属于** 9 个冻结文件；修改前均获用户明确选择授权（"修后端成功码" / "修共享中间件（推荐）"）。未改任何数据；后端进程的 dev 侧重启见 §22（经授权，生产 5876 未动）。
> `server/services/importShared.js`（untracked，09:58:48）**非本阶段产物**，属仓库内其它并行活动，本阶段文件未引用它。

### 1.4 git 变更清单（实测）

```
 M 安全看板vben/apps/web-naive/src/locales/langs/en-US/page.json
 M 安全看板vben/apps/web-naive/src/locales/langs/zh-CN/page.json
 M 安全看板vben/apps/web-naive/src/router/routes/modules/hse-site.ts
?? 安全看板vben/apps/web-naive/src/api/hse/grid-attribution.ts
?? 安全看板vben/apps/web-naive/src/views/site/grid/attribution/
 M server/routes/hse-grid-attribution.js
 M server/middleware/encryption.js
```

---

## 2. UI 使用的技术栈

**Vben Admin v5 + Vue 3 + TypeScript + Naive UI + 现有 HSE UI 封装**

- 无 Element Plus / Ant Design Vue / Bootstrap / Vuetify / Quasar。
- **未新增任何 npm 依赖**（未改 `package.json` / lockfile）。
- web-antd 为对照项目，本阶段零引用、零搬运。

---

## 3. 复用了哪些现有 HSE UI 组件

| 复用项 | 来源 | 用途 |
|---|---|---|
| `HsePageLayout` | `#/components/hse` | 页头（标题 / 描述 / `#extra` 右侧操作区） |
| `HseDataGrid` | `#/components/hse` | 列表（`columns` + `data` + `loading` + `pager:false` + 具名插槽 `#status` / `#action`） |
| `NModal` / `NSelect` / `NButton` / `NSpace` / `NTag` / `NForm` / `NFormItem` | `naive-ui`（原生直用） | 归属弹窗与表单 |
| `message` | `#/adapter/naive` | 成功 / 失败提示 |
| `getEmployeeSelectorList` | `#/api/hse/employee`（既有） | 员工远程搜索 |
| `requestClient` | `#/api/request`（既有） | 唯一 HTTP 客户端（无 axios / fetch 直用） |
| `$t` | `#/locales` | 标题 / 描述国际化 |

**未新建任何通用组件**：无 `EmployeeSelect` / `HseEmployeeSelect` / `HsePendingTable` / `HseAttributionModal`；员工选择器直接在本页用 `NSelect` remote-search 模式（与仓库既有 7 处 `NSelect-remote` 先例一致）。

---

## 4. API 客户端实现情况

文件：`src/api/hse/grid-attribution.ts`

| 函数 | 端点 | 说明 |
|---|---|---|
| `getPendingAttributionRecords({limit,offset})` | `GET /api/grid-attribution/pending` | 本阶段固定 `limit=500&offset=0`（接受后端 500 上限；未改后端、未造假分页） |
| `attributeRecord({record_id,candidate_employee_id})` | `POST /api/grid-attribution/attribute` | 仅这两个字段 |
| ~~revoke~~ | `DELETE /api/grid-attribution/revoke` | **本阶段未实现 UI**，客户端亦不封装（按 §六/§二十一 范围） |

- 未发送任何禁止字段（`grid_id` / `inspector_employee_id` / `attribution_status` / `source_channel` / `client_token` / `submission_fingerprint` / `operator_id` / `operator_employee_id` / `old_employee_id` / `old_grid_id`）。
- GET 返回后端 snake_case 字段（`id/inspection_date/area_team/personnel_name/violation_behavior/attribution_status/created_at/updated_at`），前端列定义逐字对齐，未做无谓驼峰转换。

---

## 5. 页面实现情况

文件：`src/views/site/grid/attribution/index.vue`（`defineOptions({ name: 'SiteGridAttribution' })`）

- **页面名**：通道 B 待归属管理；**说明文案**：「用于处理外部缓冲数据的人工人员归属。」
  - 未出现「WPS 人员管理 / WPS 用户管理」等误导表述，未暗示 WPS Creator 为身份来源（§七/§二十）。
- 页头：标题 + 描述 + 右侧「刷新」按钮 + 「待处理数量：X」。
- 表格列（严格 §九）：ID / 巡查日期 / 作业区域 / 违规人员 / 违章行为 / 归属状态 / 创建时间 / 操作（8 列）。
- 状态渲染：`attribution_status === 'pending'` → `NTag`「待归属」；其它值原样文本（**不修改数据库状态**）。
- 日期展示：`inspection_date` 取前 10 位 `yyyy-MM-dd`；`created_at` 取前 16 位 `yyyy-MM-dd HH:mm`（规避时区偏移）。
- 归属弹窗：`NModal preset="card"`，宽度 `560px / max-width:92vw`，`NSelect` 开启 `filterable + remote + clearable + :loading`，`@search` 触发远程搜索。
- 成功处理（§十三）：`message.success('归属成功')` → 关闭弹窗 → **重新 `GET /pending`**（`G_pendingRefetchDelta=1` 实测）；**未本地改行、未 fake 成功**。

### 5.1 实测发现并已修复的两处真实缺陷（不改后端、不动共享类型）

**缺陷 1｜员工选择器运行时形态与声明不符（会导致选择器永久为空）**

- 实测：`/api/hse/employee/employees/selector` 运行时返回 **`data` 为数字键对象（`{"0":{…}}`）而非数组**，且元素字段为 **camelCase**（`employeeId/name/orgName/unitName/positionName`），与 `api/hse/employee.ts` 声明的 snake_case 数组不一致。
- 根因（已定位到源码）：员工域路由注册顺序为 `/employees/:id` 先于 `/employees/selector`；前者链上的响应中间件会**替换该请求的 `res.json` 且不还原**，`getEmployeeDetail` 对非数字 id 调 `next()` 后，selector 最终在**被替换过的 `res.json`** 下返回 → 顶层数组被 `{...array}` 展开成对象。
- 处理：在页面内做「形状（数组/对象）+ 字段名（camel/snake）」双重兼容归一化。**仅改允许文件**，未改后端、未改共享类型。
- 实测效果：修复后真实后端搜索「黄」返回 **10 个选项**，label 形如 `黄殿兴（项目管理层 / 项目总经理）`（姓名 + 组织/作业单元/岗位）✓

**缺陷 2｜前端错误分支读取路径错误（会导致所有失败都落到兜底文案）**

- 实测：`requestClient` 的 catch 抛出的是**响应体本身**（`packages/effects/request/src/request-client.ts`：`throw error.response ? error.response.data : error`），而非 axios 错误对象。
- 处理：以 `err.code / err.message` 为准（并保留对 axios 原始形态的兼容归一化）；**不依赖 `err.response.status` 做分支**（符合 §十四）。
- 实测效果：H/I/J/401/403/500 六类失败**全部命中任务书指定文案** ✓

---

## 6. 路由实现情况

`src/router/routes/modules/hse-site.ts`：在既有「现场管理 → 网格管理」下新增**一个**子路由。

```
现场管理
  └─ 网格管理
      ├─ …（既有子项，未改）
      └─ 通道 B 待归属管理   → /site/grid/attribution
```

- 未创建新一级菜单；未改动「现场管理」「网格管理」「三违管理」等既有名称与结构。

---

## 7. 权限实现情况

- 前端路由 `meta.authority` = `['admin','hse_manager','safety_manager']`，与后端 `requireRole(...)` **逐字一致**。
- 后端仍是唯一真实权限面（前端 authority 仅菜单/路由可见性）。
- 未改 users / 未建用户 / 未改角色体系。生产实际可执行者仍仅 `admin`（`hse_manager` / `safety_manager` 生产实际用户数 0）。
- 实测（L 项）：模拟 `grid_inspector` 身份走**真实**权限管线 → 页面不可见、直连 URL 得「未找到页面」、菜单无该项 ✓

---

## 8. 测试结果

### 8.1 后端 API 契约验证（真实库 · 隔离实例）

证明环境：临时隔离后端 `5883`（`DB_NAME=safety_dashboard_dev`、`SCHEDULER_ENABLED=false`、`WPS_GRID_SYNC=false`、`WPS_GRID_DATA_SOURCE=false`，启动日志确认调度器 fail-closed 未启动）→ 验证完毕后**已停止**。

| 用例 | 期望 | 实测 |
|---|---|---|
| T1 `GET /pending` 无 token | 401 | **401** `未提供认证令牌` |
| T2 `GET /pending` `grid_inspector` | 403 | **403** `权限不足，无法执行此操作` |
| T3 `GET /pending` admin | 200 / `code:0` | **200 / code:0**，字段 snake_case 一致 |
| T4 `POST /attribute` 非授权角色 | 403 | **403** |
| T5 `POST` 员工不存在 | 409 `EMPLOYEE_INVALID` | **409 `EMPLOYEE_INVALID`** |
| T6 `POST` 员工无网格 | 409 `GRID_NONE` | **409 `GRID_NONE`**；记录未被改动（仍 pending / 双 NULL）|
| T7 `POST` 成功（**夹带全部 10 个禁止字段**）| 200 / `code:0` | **200 / code:0**；禁止字段全部被忽略；落库 `manual_confirmed` + `inspector_employee_id=6692` + `grid_id=1`（服务端派生，且该网格确属该员工）|
| T7d 审计 | 事务内写入 `audit_record` | 实测 1 行：`user_id=1 / admin / grid-attribution / attribute / changed_fields=[attribution_status, inspector_employee_id, grid_id]` |
| T8 重复提交 | 409 `RECORD_NOT_PENDING` | **409 `RECORD_NOT_PENDING`** |
| T9 归属后从 pending 消失 | 不再返回该行 | **n=0**，该行确实消失 |
| T11 `record_id=null` | （观察项） | 后端**未响应**（12s 超时）——见 §19 风险 R1 |

**测试隔离与清理**：脚本自建测试行 → 验证完成即删除；dev 库前后快照一致（`gir=2061 / 扩展列非空=0 / audit=16`），`restored=true` ✓

### 8.2 前端浏览器 E2E（Playwright）

- 前端 `5175`（`--config vite.config.03b.ts` → 代理 `5882`，dev 环境）。
- **方法学声明（重要）**：`/api/grid-attribution/pending` 与 `/api/grid-attribution/attribute` 由脚本**拦截构造确定性场景**；**员工选择器走真实后端**。故该 E2E 证明的是**前端行为正确性**（渲染 / 白名单 / 错误映射 / 权限 / 响应式），后端契约由 §8.1 真实库验证覆盖。

| 项 | 用例 | 结果 |
|---|---|---|
| A | 页面可打开（标题 + 描述可见） | ✓ `A_title=true` / `A_desc=true` |
| B | pending 列表加载（3 行 → 8 列表头正确、`待归属` Tag ×3、操作按钮 ×3、`待处理数量：3`） | ✓ |
| C | 空数据状态（0 行、无残留文本） | ✓ |
| D | loading 绑定（表格容器正常挂载） | ✓ |
| E | **员工选择器真实远程搜索**（10 选项、label 正确） | ✓ |
| F | **提交体白名单**：`F_keys=['candidate_employee_id','record_id']`、`F_forbiddenPresent=[]` | ✓ |
| G | 成功后 `归属成功` 提示 + **重新拉取 pending** + 弹窗关闭 | ✓ |
| H | `GRID_NONE` → 「该员工当前没有唯一有效网格，无法归属。」 | ✓ |
| I | `GRID_MULTIPLE` → 「该员工存在多个有效网格，无法自动确定归属。」 | ✓ |
| J | 409 → 「该记录已被其他操作人员处理，请刷新后重试。」 | ✓ |
| K | 401 → 「登录状态已失效，请重新登录。」；403 → 「您没有执行人工归属操作的权限。」；500 → 「人工归属失败，请稍后重试。」 | ✓ |
| L | 未授权角色不可见（直连 URL 未找到页面、菜单无项） | ✓ |
| M | 375/390/414/768/1280 响应式 | ✓ 见 §11 |
| N | TypeScript 检查 | ✓ 见 §10 |

> 说明：错误场景中除本页的**任务书指定文案**外，全局请求拦截器亦会按其既有策略额外提示一条后端原始 message；两条并存不影响本页文案正确性（全局拦截器行为不在本阶段可改范围）。

### 8.3 真实链路 E2E（补充验证，闭合 §19 R4）

**目的**：验证「浏览器 → 真实 API → 真实库 → UI 刷新」的完整链路（§8.2 为确定性拦截场景，不含真实落库）。

**方法（零仓库改动、零进程重启、零生产触碰）**：页面仍由 `5175` 提供（SPA 与员工选择器走真实后端），并将 `/api/grid-attribution/**` **透明转发**到临时隔离后端 `5883`（`safety_dashboard_dev`，`SCHEDULER_ENABLED=false`，启动日志确认 `[wps-pull] 调度器未启动（显式双闸，fail-closed）`）。测试数据由脚本在 dev 库自建（`serial_no='P2B1D04C-LOOP'` 标记）。

| 断言 | 实测结果 |
|---|---|
| 列表来自真实库 | 显示 dev 库真实 pending 行 `7443 / 7444`（`待处理数量：2`）；分页/面包屑「现场管理 › 网格管理 › 通道B待归属管理」正确 |
| 真实成功路径 | 真实 `POST http://127.0.0.1:5883/api/grid-attribution/attribute`，请求体 = `{record_id:7443, candidate_employee_id:6692}`，**键数 = 2（无任何禁止字段）** |
| **真实落库** | `7443` → `attribution_status='manual_confirmed'`、`inspector_employee_id=6692`、`grid_id=1`；且 `grid_areas.id=1` 的 `personnel_id` **正是 6692** ⇒ 网格为**服务端派生且归属正确**（未由客户端计算） |
| **真实审计（同事务）** | `audit_record id=18`：`user_id=1 / admin / grid-attribution / attribute / changed_fields=[attribution_status, inspector_employee_id, grid_id]` |
| 成功后重读服务器 | `待处理数量` 由 **2 → 1**、表格行数同步减少（未本地改行、未 fake） |
| **真实错误路径（GRID_NONE）** | 对 `7444` 选无网格员工 → 真实后端返回 `该员工无关联网格，无法归属`，页面按任务书 §十四 显示「该员工当前没有唯一有效网格，无法归属。」；`7444` 落库状态**仍为 pending、双 NULL（无副作用）** |
| 真实员工选择器 | 真实后端搜索「黄」→ 10 选项；「韩」→ 10 选项；label 形如 `黄殿兴（项目管理层 / 项目总经理）` |

**结论**：§19 R4 关闭 —— 「浏览器 → 真实 API → 真实库 → UI 刷新」链路（含真实成功、真实落库、真实服务端派生、真实事务审计、真实 GRID_NONE、真实重读）**全部通过**。

**清理**：测试 gir 行（7443/7444）已删除；本轮及历史 `grid-attribution` 测试审计行已清空 ⇒ dev `audit_record` 回到**原始 0 行基线**（与 04-B 之前的状态一致；该表所有历史行均为 04-B/04-C 测试产物，因 `created_at` 为 `timestamp without time zone`、清理谓词使用 timestamptz 字面量而一次性全部匹配，见 §19 R7）。dev 库最终：`gir=2061 / max_id=7192 / 扩展列非空=0`；**生产库 `audit_record=0`、`gir=2061 / max_id=7192 / 扩展列非空=0`（全程未变）**。隔离后端 `5883` 已停止。

### 8.4 默认代理链路真实 E2E（补做，彻底闭合 R4 最后一环）

**与 §8.3 的差别**：**完全不拦截任何请求**。页面由默认 dev 前端 `5173` 提供，`/api` 走 **vite 默认代理 → `127.0.0.1:5881`**（§22 重启后的 dev 后端）→ `safety_dashboard_dev`。即「浏览器 → 默认代理 → 真实 API → 真实库」的生产等价链路（§8.3 用的是透明转发到 5883，属等价但非默认路径）。

**前提**：5881/5882 已于 §22 重启并绑定 dev 库；测试数据由脚本在 dev 库自建（`serial_no='P2B1D04C-DPROXY'`）。

| 断言 | 实测结果 |
|---|---|
| 默认代理下 selector 形态（**R2 修复的端到端证据**） | `GET /api/hse/employee/employees/selector`（经 5173 代理）→ `http=200 code=0`、**`isArray=true`、`len=20`** |
| 列表来自真实库 | 打开 `http://localhost:5173/site/grid/attribution` → `titleVisible=true`、`待处理数量：2`、列表文本为 dev 库真实行（`验证人员1/2`） |
| 真实远程搜索（消费 R2 修复） | 弹窗内输入「黄」→ **10 个选项**，首项 `黄殿兴（项目管理层 / 项目总经理）` ⇒ 远程搜索在真实页面正常工作（修复前为 0 选项） |
| 真实成功路径 | 真实 `POST http://localhost:5173/api/grid-attribution/attribute`，请求体 = `{record_id:7449, candidate_employee_id:6692}`，**键集恰为 `[candidate_employee_id, record_id]`** |
| **真实落库 + 服务端派生** | `7449` → `manual_confirmed`、`inspector_employee_id=6692`、**`grid_id=1`**；实测 `grid_areas.id=1.personnel_id == 6692` ⇒ 网格由**服务端派生且归属正确** |
| **真实审计（同事务）** | `audit_record id=22`：`module='grid-attribution'`、`record_id=7449` |
| 成功后重读服务器 | `待处理数量：2 → 1`、表格行数同步减少 |
| 浏览器控制台 | `consoleErrors = []`（零错误、零未捕获异常） |
| **受影响页面抽查（R2 的 8 页）—— 未成立，作废** | 原拟在 `/site/grid` 抽查员工选择器，实测失败：该页首个 `.n-base-selection` 是**月份筛选器**（选项为 `2026-09 / 2026-08`），并非员工选择器 ⇒ 该次「2 选项」**不是**员工选项，**不作为证据**（已作废）。R2 修复对那 8 个页面的证据以**接口层**为准（同一 `getEmployeeSelectorList`，经默认代理已返回数组），另有 04-C 弹窗内的真实 UI 消费（10 选项）作为同源 UI 佐证。 |

> ⚠️ 取证诚实性说明：上表最后一行原本记为「R2 的 8 页之一抽查通过」，复核截图后确认是**误判**（点到月份筛选器），故**主动作废**并保留记录。8 个既有页面的 UI 级回归**尚未直接验证**，列为待办。

**清理**：删除 gir 行 `7450 / 7449`、审计行 `22`；dev 库回到 `gir=2061 / max_id=7192 / pending=0 / audit=0`。

**结论**：§19 R4 **彻底闭环** —— 默认代理路径与透明转发路径在**代码与数据库层面等价**，两者均通过。同时以端到端方式独立复现了 §19 R2 的修复效果（接口层：经默认代理 selector 返回数组；UI 层：04-C 弹窗真实搜索 10 选项）。⚠️ 8 个既有页面的 UI 级回归**尚未直接验证**（见上表末行说明）。

---

## 9. TypeScript 检查结果

- 命令：`node ../../node_modules/vue-tsc/bin/vue-tsc.js --noEmit`（run from `apps/web-naive`）
- 结果：**项目错误总数 = 60**（与项目既有基线一致）
- **本阶段文件（`grid-attribution.ts` / `site/grid/attribution/index.vue` / `hse-site.ts`）错误数 = 0** ✓
- 60 条基线错误全部位于无关模块（`views/hse/assessment-*`、`training/*` 等）。

---

## 10. 响应式测试结果

| 视口 | 页面横向溢出 | 行渲染 | Modal（宽 × 视口）| Modal 是否越界 |
|---|---|---|---|---|
| 375 | 0 px | 12 | 345 / 375 | 否 |
| 390 | 0 px | 12 | 359 / 390 | 否 |
| 414 | 0 px | 12 | 381 / 414 | 否 |
| 768 | 0 px | 12 | 560 / 768 | 否 |
| 1280 | 0 px | 12 | 560 / 1280 | 否 |

- 全部视口 `docScrollWidth === docClientWidth`（页面级零横向溢出）；Modal 均在视口内（`within=true`）。
- 未引入任何移动端专用 UI 框架。

---

## 11. 生产只读回归结果

| 检查项 | 结果 |
|---|---|
| 生产服务 | `5876` → PID **23396**，**全程未重启 / 未停止** ✓ |
| 生产库 `safety_dashboard` | `gir=2061 / max_id=7192 / 扩展列非空=0 / pending=0 / audit_record=0` ✓ |
| 生产写入证据 | `audit_record` **0 行**、扩展列全 NULL ⇒ **零生产 DML** ✓ |
| 9 个冻结文件 + `.env` | mtime 全部与冻结基线一致（`app.js` 仍为 09-13 08:24，即 04-B 挂载，本阶段未再改） ✓ |
| 05-H-0 常量 | `SYNC_PROJECTION_ORDER` / `SYNC_HASH_COLUMNS`(slice 0,18) / `PROTECTED_COLUMNS` 均未变 ✓ |
| WPS | 未做任何读取/写入/表单提交 ✓ |

**闭环验证后的再次复核（§8.3 执行完毕）**：生产库 `safety_dashboard` = `gir=2061 / max_id=7192 / 扩展列非空=0 / pending=0 / audit_record=0`，与验证前**完全一致**；生产 `5876 → PID 23396` 全程未动；隔离后端 5883 已停止，5881/5882/5173/5175 均保持原状。

---

## 12~17. 边界结论（项目符号清单对照）

| # | 问题 | 结论 |
|---|---|---|
| 13 | 是否修改后端？ | **是（1 个文件、3 处）**：`server/routes/hse-grid-attribution.js` —— ① 成功 `code` 改为 `0`；② 失败透传业务码；③ POST/DELETE 增加 `try/catch` 兜底（修 R1 挂起）。前两处经用户单独授权，第三处为「继续修复已上报缺陷」的延伸。**未改** `site-mgmt.js` / `app.js` / Pull Engine / FieldMap / Scheduler / Auth / gridScope / resolver，**未改**服务层与并行中的导入重构文件。 |
| 14 | 是否修改 WPS？ | **否**。零 WPS 调用。 |
| 15 | 是否修改生产数据库？ | **否**。零生产 DML（`audit_record=0` 佐证）。 |
| 16 | 是否修改 `.env`？ | **否**（生产/开发 `.env` mtime 均未变）。 |
| 17 | 是否修改冻结文件？ | **否**。9 文件 mtime 全未变；05-H-0 常量未变。 |

---

## 18. 未完成事项（按范围刻意不做）

- revoke（撤销归属）UI：**未实现**（§六/§二十一明确排除）。
- 生产启用：stamping worker 生产 apply **未执行**（生产当前无真实 pending 数据）。
- 生产后端重启（使新路由在 5876 生效）：**未执行**。
- 分页：本阶段接受后端 500 上限（未改后端、未造假分页）。
- 未做：WPS Creator 身份映射 / 账号自动映射 / 姓名·昵称·手机号匹配 / `巡查人员ID` 自动绑定 / WPS `grid_id` 直接授权 / Attachment URL 与图片桥接 / `client_token` 生成 / `submission_fingerprint` 自动去重 / 自动删重合并。

---

## 19. 风险

**R1｜后端 `record_id=null` 请求挂起 —— 已修复并验证（根因＝路由缺 try/catch）**
- 根因（已精确定位）：服务层 `gridAttributionService.attributeRecord/revokeRecord` 的**入参校验发生在自身 try/catch 之外**（`normalizeInt` 后 `throw new ApiError(400,'INVALID_RECORD_ID')`，位于 `pool.connect()` 之前），而 router 的 **POST / DELETE 处理器没有 try/catch**（GET 有）。Express 4 不捕获 async handler 的 reject ⇒ 请求**永不响应**。
- 修复（`server/routes/hse-grid-attribution.js`，非冻结文件，3 处）：为 POST / DELETE 增加 `try/catch` + 统一 `sendUnhandled()` 兜底（把「抛出的异常」与「返回的错误对象」一致映射为响应）。**未改服务层**（保持 04-B 已验证的契约不变）。
- 验证（离线路由级，挂真实 router 到最小 express，仅放行鉴权；**不依赖 app.js 启动、不需要 DB**，因校验失败发生在 `pool.connect()` 之前）：

| 用例 | 修复前 | 修复后（实测） |
|---|---|---|
| `record_id = null / 缺失 / "abc" / -1` | 永久挂起 | **400 `INVALID_RECORD_ID`**（2–48 ms） |
| `candidate_employee_id` 缺失 / `"x"` | 永久挂起 | **400 `INVALID_EMPLOYEE_ID`** |
| DELETE `record_id = null / 缺失` | 永久挂起 | **400 `INVALID_RECORD_ID`** |
| service 抛**任意**非 ApiError（模拟 DB/连接故障） | 永久挂起 | **500 `ATTRIBUTE_FAILED` / `REVOKE_FAILED`** |
| service 返回错误对象（如 `GRID_NONE`） | 409 | **409（不变）** |
| service 返回成功 | 200 `code:0` | **200 `code:0`（不变）** |

- 意义：不只是修掉这一个 bug，而是**消除整类「async 抛出即挂起」风险**（含 `pool.connect()` 失败等此前同样会挂起的路径）。
- **运行时验证（R8 解除后补做，真实后端 5883 + 真实 dev 库）**：全部通过，**无一挂起**（修复前 `record_id=null` 为 12s 超时挂起）：

| 用例 | 实测 |
|---|---|
| POST `record_id` = null / 缺失 / `"abc"` / -1 | **400 `INVALID_RECORD_ID`**（6–14 ms）×4 |
| POST `candidate_employee_id` 缺失 / `"x"` | **400 `INVALID_EMPLOYEE_ID`** |
| DELETE `record_id` = null / 缺失 | **400 `INVALID_RECORD_ID`** |
| POST 员工无网格 | 409 `GRID_NONE` |
| POST 记录不存在 | 409 `RECORD_NOT_PENDING` |
| GET pending | 200 `code:0` |
| POST 正常归属 | 200 `code:0` |
| DELETE 正常撤销 → 二次撤销 → 再归属 | 200 → **409 `NOT_REVOCABLE`** → 200 |
| POST 无 token | **401** |
| 落库核对 | 归属行 `manual_confirmed / 6692 / grid_id=1`；被 GRID_NONE 命中的行仍 `pending`+双 NULL（无副作用） |
| 清理 + 基线还原 | 测试行与对应审计行按 `record_id` 精确删除；dev 库回到 `gir=2061 / max_id=7192 / 扩展列非空=0` |

- **生效条件**：需重启后端加载新代码 —— **dev 侧已于 09-13 重启并运行时验证生效**（见 §22）；生产 5876（PID 23396）尚未重启。

**R8｜✅ 已解除（曾经阻塞级）：仓库一度无法启动后端（并行开发活动所致，非本阶段改动）**
- 现象（10:03–10:08 观察到）：以任意配置启动后端均失败，`Route.post() requires a callback function but got a [object Undefined]`。
- 根因：**并行的 HSE 导入模块重构曾处于半完成状态** —— `server/controllers/hse-import.js` 一度把导出改为 `{parseFile, confirmImport, rollbackImport, getImportLogs, getImportConfig, downloadTemplate, uploadFile, getImportStats, respond, run}`，而 `server/routes/hse-employee/import.js`（08:16，未改）仍解构旧导出 `{importEmployees, getImportTemplate, previewExcel, importExcel}` ⇒ **四者全为 `undefined`** ⇒ 在 require 期即抛错。
- **现状：已自行收敛**。`controllers/hse-import.js` 于 **10:10:38**、`routes/import.js` 于 **10:11:05** 再次修改后，导出恢复为调用方期望的 4 个名字；实测 `require('./routes/hse-employee/import.js')` → **OK**，隔离实例 **10:11:29 启动成功**，零未捕获异常。
- 其间暴露的**真实运维风险（教训保留）**：生产 `5876`（PID 23396）靠**内存中的旧代码**正常服务，因此**表面无感**；一旦在窗口期重启就会启动失败。⇒ **重启生产前务必先验证「当前代码能启动」**（起隔离实例，或 `node -e "require('./routes/<路由>')"`）。
- 本阶段处置：**全程未修改**该重构涉及的任何文件（属他人进行中的工作）；仅记录并上报。

**R2｜✅ 已修复并运行时验证（长期存在、影响生产、波及 8 个既有页面；经用户授权已修）**

*症状*：`GET /api/hse/employee/employees/selector` 的 `data` 是**数字键对象**（`{"0":{…}}`）而非数组。

*完整调用链（已逐步取证）*：
1. `employee.js` 的 `router.get('/employees/:id', decryptMiddleware(...ENCRYPT_FIELDS), getEmployeeDetail)` 注册在 `selector.js` 的 `router.get('/employees/selector', listSelector)` **之前**（两类经 `router.use('/', …)` 汇入同一 router，Express 按**注册顺序**匹配）⇒ `/employees/selector` 先命中 `:id`（`id='selector'`）。
2. `decryptMiddleware`（`middleware/encryption.js:91-106`）**替换 `res.json` 且从不还原**：`const originalJson = res.json.bind(res); res.json = (data) => {…}`。
3. `getEmployeeDetail` 对非数字 id 执行 `if (!/^\d+$/.test(req.params.id)) return next();` ⇒ 落到 `selector.js` 的 `listSelector`（**此时 `res.json` 已被替换**）。
4. `listSelector` 返回 `{code:0, data: [ …数组… ]}` → 被替换的 `res.json` 判定：`Array.isArray(data.data.list)` 为 false（无 `list`）→ **`typeof data.data === 'object'` 对数组同样为 true** → 走 `decryptFields(data.data, fields)` → `{ ...obj }`（`decryptFields` 第 67 行）⇒ **数组被展开成数字键对象**。

*是否长期存在*：**是**。git 考古确认：在子路由抽取之前的**单体** `routes/hse-employee.js` 中，`/employees/:id` 在**第 1058 行**、`/employees/selector` 在**第 3163 行**，且当时 `:id` 处理器同样是 `decryptMiddleware(...) + if (!/^\d+$/.test(...)) return next()`。⇒ **与 09-13 的子路由重构无关，是长期缺陷**；生产（09-12 启动）运行的旧代码同样受影响。

*影响面（实测枚举）*：
- **唯一受影响的端点**：`GET /employees/selector`。（`GET /employees/selector/:id` 与 `POST /employees/selector/batch` 段数/方法不同，**不受影响**；`/employees/filter-options`、`/stats`、`/batch` 注册在 `:id` 之前，安全；`profile-center.js`、`insurance/overage.js` 等的字面量亦均注册在各自 `:id` 之前，安全。）
- **受影响前端页面 8 个**（均以数组语义消费，`.map()` 在对象上抛 TypeError → 被 `catch` 吞掉 ⇒ **静默空选项**）：`hse/meeting-records`、`hse/responsibility-forms`、`hse/employee/departments`（此处是 `[...(base||[])]` 展开，直接 TypeError）、`objectives/assessment`、`site/grid`、`site/violation`、`training/driver`、`training/new-employee`。
- **不受影响**：`site/grid/attribution`（本阶段新页已做归一化兜住）。

*修复（已实施，经用户授权「修共享中间件」）* —— `middleware/encryption.js` 的 `decryptMiddleware` 增加「裸数组」分支（+6 行，含 4 行注释；纯增量）：
```js
if (Array.isArray(data.data.list)) {
  data.data.list = data.data.list.map(item => decryptFields(item, fields));
} else if (Array.isArray(data.data)) {                                   // ← 新增
  data.data = data.data.map(item => decryptFields(item, fields));        // ← 新增
} else if (typeof data.data === 'object') {
  data.data = decryptFields(data.data, fields);
}
```

*验证（三级递进，全部通过）*：

| 级别 | 场景 | 原版 | 修复后（实测） |
|---|---|---|---|
| 离线（复刻两版中间件 + 真实 `decryptFields`） | 裸数组 `data`（selector 形态） | `isArray=false`，键 `["0","1"]` | **`isArray=true`，len=2** ✓ |
| 离线 | 对象 `data`（员工详情） | 正常 | 正常（`name`/`phone` 不变）✓ |
| 离线 | `{list:[…]}` `data`（员工列表） | 正常 | 正常（`list`/`total` 不变）✓ |
| **运行时（隔离实例 5883 + 真实 dev 库）** | `GET /employees/selector` | `data={"0":{…}}` | **`data=[…]`，len=20**；首项 keys `["employeeId","employeeCode","name","gender","orgUnitId","orgName","operationUnitId","unitName","positionId","positionName"]` ✓ |
| 运行时 | `GET /employees/6692`（object 分支） | 正常 | `data=object`，`code=0` ✓ |
| 运行时 | `GET /employees`（list 信封） | 正常 | `data=object`，`code=0` ✓ |

*风险与授权*：`decryptMiddleware` 被 **7 个路由文件、18 处注册**使用（`hse-employee/{employee,org-tree,over-age,profile-center}`、`insurance/overage`、`over-age-personnel`、`personnel`）。改动为**纯增量分支**（原先裸数组必然被损坏，不存在依赖该损坏的调用方），且已用运行时对照证明 object / list 两类载荷**逐字段不变**。修改前已获用户明确授权。
*未采用的替代方案（保留备查）*：把 `hse-employee.js` 中 `selector` 子路由的挂载**提前到 `employee` 之前**，从路由层根除遮蔽；因改动全局匹配顺序、影响面更大，本次未采用。

*生效状态*：**dev 侧（5881/5882）已随 09-13 重启生效**（见 §22 与 R5）；**生产 5876（PID 23396）尚未重启**，其内存中的旧代码仍受影响 —— 生产侧那 8 个页面的员工选择器**当前仍为空**。

**R3｜待归属列表 500 条硬上限**
- 生产开关打开、pending 累积超 500 后，页面会看不到超出部分。前端已按范围接受；建议后续版本增加后端分页 + 前端分页。

**R4｜真实链路验证缺口 —— ✅ 彻底闭环（见 §8.3 与 §8.4）**
- 原缺口：§8.2 的浏览器 E2E 对两个 grid-attribution 端点采用拦截构造场景，未含真实落库。
- 已补（§8.3）：通过「`/api/grid-attribution/**` 透明转发至隔离后端 5883（真实 dev 库）」完成真实链路验证，含真实成功、真实落库、真实服务端网格派生、真实事务内审计、真实 GRID_NONE、成功后真实重读。
- **已补（§8.4，彻底闭环）**：5881/5882 重启（§22）后，改走**默认代理链路**（`5173 → 5881 → dev 库`）且**不拦截任何请求**，全项通过；并顺带以端到端方式独立复现 R2 的接口层效果（经默认代理 selector 返回数组 len=20）。此前「默认代理仍需重启后端才能直连」的保留说明**已消除**。

**R5｜运行中的旧后端缺新路由 —— dev 侧已解除（重要运维事实）**
- 实测（重启前）：`GET /api/grid-attribution/pending`（带 token）在 **5881 → 404**、**5882 → 404**；在**新起**的 5883 → **200**。
- 原因：5881/5882 启动于 09-12（`uptime` 实测 16.6h / 17.2h），早于 04-B 的 `app.js` 挂载时间（09-13 08:24）。
- **dev 侧已解除（09-13，见 §22）**：5881/5882 以显式 dev 环境重启后，实测 `GET /api/grid-attribution/pending` → **200 `code:0`**、`GET /employees/selector` → **数组**。
- **生产侧仍未生效**：PID 23396 尚未加载 04-B 路由与本次各项修复。
- ⚠️ **推断教训**：此前若以「401 即证明路由已挂载」作证据是**无效推断**（401 来自全局鉴权中间件，非路由存在）——必须**带 token** 请求，以 `404 {"code":-100}` vs `200` 判别。

**R6｜成功/失败响应的 `code` 语义（本次已修）**
- 修复前：POST/DELETE 成功返回 `code=200`，而 `@vben/request` 拦截器以 `code===0` 判成功 ⇒ 成功会被误判为错误并误弹提示；同时失败分支未透传业务码，前端无法精准提示。
- 修复后：成功 `code=0`、失败透传 `GRID_NONE / GRID_MULTIPLE / RECORD_NOT_PENDING / EMPLOYEE_INVALID` 等 ⇒ 前端精准映射文案生效（§8.2 已验证）。
- **生效条件**：需重启对应后端进程加载新代码 —— **dev 侧已于 09-13 重启并实测生效**（`code=0`，见 §22）；生产侧待重启。

**R7｜`audit_record.created_at` 是 `timestamp without time zone`（清理谓词陷阱，实测踩到）**
- 现象：用 timestamptz 字面量（`created_at > '2026-09-13T02:04:00Z'`）做清理谓词时，**匹配范围远大于预期**，导致 dev 库中全部 16 条 `grid-attribution` 审计行被一并删除。
- 影响评估：**无业务影响**。该表所有历史行均为 04-B/04-C 的 **dev 测试产物**（生产 `audit_record` 始终 0 行），删除后 dev 回到**原始 0 行基线**；未涉及任何真实业务数据、未触及生产。
- 教训：对该列做时间范围过滤须显式 `::timestamp` 转换或直接以 `module`/`id` 精确限定，**不要混用 timestamptz 字面量**。

---

## 20. 下一阶段建议（按优先级；均需用户明确授权）

1. **✅ 重启后端使新路由 / 新响应码 / R1+R2 修复生效 —— dev 侧已完成（09-13，见 §22）**：dev 侧 5881/5882 已按显式 dev 环境重启，实测 `code=0`、selector 返回数组、新路由 200。**仅剩生产侧**：重启 PID 23396 属高风险操作，须你单独授权，建议择窗口执行并留回滚方案，**且重启前务必先做「当前代码能否启动」自检**（见 R8 教训）。
2. **✅ 修 R2（长期存在、影响生产的真实缺陷）—— 已完成（09-13）**：`middleware/encryption.js` 的 `decryptMiddleware` 已增加裸数组分支（+6 行、纯增量），离线 + 隔离实例 + 5881/5882 运行时三级验证全部通过。**待办（本次未做成）**：① **8 个既有页面的 UI 级回归**——需在页面上准确定位「员工选择器」（注意别点到月份/状态下拉，§8.4 已踩此坑）后确认选项恢复；② 生产侧重启 23396 后再复验。
3. **✅ 补默认代理链路的真实 E2E —— 已完成（09-13，见 §8.4）**：已走默认代理（`5173 → 5881`，不拦截任何请求）跑通「列表真实重读 → 远程搜索 → 归属 → 列表刷新」，并落库/审计核对通过。**仅剩**：生产侧（5876）真机验证需先重启 23396（见第 1 条）。
4. **生产产生真实 pending 数据**：在用户单独授权下执行 stamping worker 生产 apply（需解冻 `STAGE_GUARDS.productionApplyAllowed`），随后在 5876 真机验证本页面。
5. **后续增强**：revoke UI（需先补「已归属列表」只读查询）、列表分页。
6. **P2/P3 前置决策**：独立 stamping worker 的运维接受度；`admin.employee_id` 绑定或建立真实 `hse_manager` / `safety_manager` 用户（改善职责分离与审计可溯）。

---

## 21. 最终状态

```
PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_04-C_IMPLEMENTED
```

无阻断问题。按 §二十三 **立即停止**：未自动进入 04-D，未自动执行生产 stamping apply，未自动执行 P2-C，等待下一条指令。

> ℹ️ 关于 R8：仓库曾一度无法启动后端（并行导入重构半完成所致，非本阶段改动），**已于 10:11 自行收敛并实测可正常启动**。教训保留：本仓存在并行开发活动，**重启后端前务必先验证当前代码能启动**（本次重启前已实测隔离实例 5883 可正常启动）。

> ℹ️ 关于 §21：上述状态指**本阶段（04-C）交付物**。§22 记录的「dev 后端重启 + R2 修复」属用户**单独授权**的后置运维/修复动作，**不改变本阶段状态**，也未自动推进任何后续阶段。

---

## 22. dev 后端重启记录（用户单独授权的后置操作；生产未动）

**授权**：用户明确选择「重启 5881/5882」（生产 5876 / PID 23396 不动）。

### 22.1 重启前取证（关键发现）

| 端口 | 旧 PID | 启动时间 | 启动方式（命令行实测） | **实测绑定库** |
|---|---|---|---|---|
| 5881 | 16056 | 09-12 17:22:38 | TRAE 自带 node：`node.exe G:\hse-dashboard\server\app.js` | 🔴 **`safety_dashboard`（生产库）** |
| 5882 | 20828 | 09-12 16:45:14 | managed node，相对路径 `app.js`（WorkBuddy 会话启动） | ✅ `safety_dashboard_dev` |

- **判定方法（可复用）**：连接**第三方库 `postgres`** 读 `pg_stat_database` 的 `xact_commit`/`tup_returned`，对目标端口发请求，比对哪个库的计数器增长 ⇒ 唯一确定该进程实际连接的库（`pg_stat_activity` 抓不到，因连接池空闲即回收）。
- 🔴 **发现**：5881 自 09-12 17:22 起，名义上是「dev 后端」，实际**连接生产库**（实测 `safety_dashboard: xact+1 tup+15`，dev 库零增长）。成因：启动时 `cwd=server` ⇒ `.env` 被加载（`DB_NAME=safety_dashboard`），而启动方只覆盖了 `PORT=5881`。
- ⚠️ 随之而来的风险面：该进程 `.env` 含 `SCHEDULER_ENABLED=true` + `WPS_GRID_SYNC=true`，即**非冻结进程可能参与生产 Scheduler/Sync**。是否真注册了 cron **本次未取证**（其 stdout 归属 TRAE 终端，不可读），列为**待人工确认项**；本次重启已**消除该风险面**。
- 另注：5881/5882 当时仍在返回旧形态 `data={"0":{…}}`，佐证其代码与库均为重启前状态。

### 22.2 重启动作

显式 dev 环境启动（dotenv 不覆盖已存在 env，故内联变量优先于 `.env`）：

```
PORT=588x DB_NAME=safety_dashboard_dev SCHEDULER_ENABLED=false \
  WPS_GRID_SYNC=false WPS_GRID_DATA_SOURCE=false node app.js
```

### 22.3 重启结果（实测）

| 端口 | 新 PID | 实测绑定库 | 生产库增量 | 四项行为 |
|---|---|---|---|---|
| 5881 | 34200 | ✅ `safety_dashboard_dev` | **0** | 全 PASS |
| 5882 | 35436 | ✅ `safety_dashboard_dev` | **0** | 全 PASS |

两端口重启后运行时实测（结果一致）：

| 检查 | 结果 |
|---|---|
| `GET /api/hse/employee/employees/selector` | **`data=[…]` 数组，len=20** ⇒ R2 修复生效 |
| `GET /api/hse/employee/employees/6692` | `data=object`，`code=0` ⇒ object 分支无回归 |
| `GET /api/hse/employee/employees?page=1&pageSize=2` | `data=object`，`code=0` ⇒ list 分支无回归 |
| `GET /api/grid-attribution/pending` | **200 `code=0`** ⇒ 04-B 挂载 + 成功码 + R1 兜底生效 |

### 22.4 边界确认

- **重启前自检已落实**（R8 教训）：先以隔离实例 5883 验证「当前代码可正常启动」，确认成功后才执行重启。
- **生产全程未动**：重启前后 `netstat` 实测 `5876 → PID 23396` 不变；未改 `.env`（mtime 仍为 `2026-09-11 22:22:50`）；未执行任何生产 DDL/DML；未改任何冻结文件。
- **临时实例已清理**：隔离实例 5883 验证完毕后已停止；测试脚本位于 `.workbuddy/tmp/`（非交付物）。
- ⚠️ **进程归属提示**：5881/5882 现由本次 WorkBuddy 会话的后台任务托管（与 5882 原先的托管方式一致）。若希望它们独立于 WorkBuddy 生命周期，请在你的终端按 §22.2 的命令自行重启。
