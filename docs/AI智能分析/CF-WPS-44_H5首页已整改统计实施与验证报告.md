# CF-WPS-44 H5 首页「已整改」统计 —— 实施与验证报告

- 日期：2026-09-19
- 项目：`G:\hse-dashboard\grid-mobile-cloudflare`（Cloudflare Pages H5 + Worker + 飞书多维表格）
- 站点：`grid-mobile-cloudflare.pages.dev`

## 1. 诉求（用户原话）

> 在乡镇作业中心经理、管理员两级账号的首页，在本月上报后增加「已整改」，显示这个月已整改的数量，若待整改数量到了次月，待整改数量继续显示，直到整改完成为止。

## 2. 审计：进场时是什么状态

| 项 | 事实 |
|---|---|
| 前端卡片 | `check.html` 里已存在 `#stat-rectified-card`，但**写死 `display:none` 且全文件没有任何 JS 引用** → 永远不可见、数值恒为 0，等于没做 |
| 前端取数 | `loadInbox()` 只解析 `pending_count`，**没有**解析 `monthly_done_count` |
| 后端 | `handleInbox` 已算出 `monthly_done_count`（本月已整改），**未提交**（工作树 +10 行） |
| `deploy.js` | **已漂移**：`index.js` 20:41 改过，`deploy.js` 停留在 16:58，不含 `monthly_done_count` |
| 待整改口径 | 前端本机过滤与后端 `pending` 过滤**都没有任何月份条件** → 跨月不清零这条**现状已满足**，本次只做复核、未改 |

结论：这是一个「做了一半」的阶段 —— 骨架在、接线缺失、且部署产物已落后于源码。

## 3. 口径设计（两条口径必须互补，不能重叠）

| 卡片 | 口径 | 是否按月 |
|---|---|---|
| **待整改** | 指派给我 且 **未完成**（本机 + 服务端指派，去重） | ❌ 不按月 —— 上月没整改完的，这个月继续挂着，直到完成为止 |
| **已整改**（本次新增） | 指派给我 且 **完成时间落在本自然月** | ✅ 按自然月 —— 只回答「这个月我整改掉了几条」 |
| 已闭环 | 我**自己上报**的三违记录里已 done/reviewed 的 | 否（存量） |

因此跨月时「已整改」会归零重数、「待整改」不会 —— 这是刻意设计的两个口径，不是 bug。

**取值** = 服务端 `monthly_done_count`（按全量台账统计，不受 `todos` 列表 50 条上限影响）
　　　　+ 本机「本月已完成、且**尚未进服务端**」的整改（`localRectifiedThisMonth()`）。

去重规则：本机记录若已有 `serverRecordId`，说明服务端已计过，本机不再计一次。

**角色门槛**：仅 `角色 ∈ {经理, 管理员}`（即乡镇作业中心经理 / 管理员）；公司管理不显示，保持原 3 卡布局。

**卡片位置**：紧跟「本月上报 / 本月派发」之后（第 2 张），即
`本月派发|本月上报 → 已整改 → 待整改 → 已闭环`。

## 4. 改动清单

### 4.1 前端 `frontend/check.html`（+3 处接线）
1. 卡片从「待整改」之后**移到「本月上报」之后**，并补口径注释。
2. 新增 `inboxMonthlyDone`，`loadInbox()` 解析 `monthly_done_count`（拉取失败置 0，不残留旧值；老 Worker 无此字段时按 0 降级）。
3. 新增 `RECTIFIED_ROLES` / `showRectifiedCard()` / `localRectifiedThisMonth()` / `updateRectifiedStat()`，唯一渲染入口；
   `refreshHomeStats()`（进首页）与 `refreshInboxStats()`（服务端计数到手）各调一次。
4. `submitRectify()` 里 `/assign/complete` 回写成功后**强制回源** `loadInbox(true)` + `refreshHomeStats()` —— 整改完成即「待整改 -1、已整改 +1」，不必等 25s 轮询。

### 4.2 后端 `worker/index.js`（沿用已有实现，本次未改逻辑）
`handleInbox` 返回 `monthly_done_count`；用 `todoNowLocal().slice(0,7)` 做 `YYYY-MM` 字符串前缀匹配（避免 Worker UTC 时区解析歧义）。

### 4.3 新增测试（本次）
- `worker/test/cfwps44-inbox-monthly.test.mjs` —— 离线 mock 单测，钉死服务端两条口径（13 断言）。
- `worker/test/cfwps44-rectified-stat.mjs` —— 浏览器 E2E，钉死前端接线与排版（30 断言）。
- `worker/package.json`：`test` 回归集纳入 `cfwps44-inbox-monthly.test.mjs`。

### 4.4 部署产物
`frontend/*` 已 `cp` 同步到 `_pages_deploy/*`，逐文件 `diff -q` 全部 **SAME**；
`worker/deploy.js` 已由 `python _scratch/mkdeploy.py` 重新生成（2786 行），漂移检测 **7/7 过**。

## 5. 验证证据

| 验证 | 结果 |
|---|---|
| 内联脚本语法（`vm.Script` 逐段） | 3 段脚本，**0 语法错** |
| 元素 id 完整性（HTML id 集 vs JS 引用集） | 153 id / 122 引用，**无缺件** |
| 卡片 DOM 顺序 | `stat-month → stat-rectified → stat-pending → stat-done` ✅ |
| **浏览器 E2E（真实账号登录 + 本地 Pages 等价服务）** | **30 passed / 0 failed** |
| 离线 Worker 回归（cfwps11 / 19 / 22） | 42 + 55 + 18 PASS，**0 FAIL** |
| 新后端单测（cfwps44-inbox-monthly） | **13 PASS_MOCK / 0 FAIL** |
| `deploy.js` 漂移检测 | **7 passed / 0 failed** |
| 生产写入 | **0**（E2E 全程路由拦截，除登录 POST 外非 GET 一律 abort，跑完 `blocked === 0`） |

E2E 关键断言摘录：
- 真实账号 `role=经理` → 4 卡，顺序 `本月派发|已整改|待整改|已闭环`；`role=公司管理` → 3 卡、无「已整改」。
- 取值：注入「服务端 7 + 本机本月未入库 1 条 + 已入库 1 条（不得重复计）+ 跨月 1 条（不得计）」→ 显示 **8**（若非 8 则说明重复计数或跨月误计）。
- 待整改跨月：塞入上月仍未完成的记录后计数 **+1**（跨月不清零）。
- 3 视口（360×640 / 375×667 / 390×844）：4 卡同一行不换行、横向溢出 0、文字不裁切、单卡最窄 73–80px。

截图：`grid-mobile-cloudflare/worker/test/_cfwps44_shots/`（`01-real-role-home` / `02-company-3cards` / `03-manager-390-4cards`）

## 6. 边界与未验证项（如实标注）

1. **本月已整改的真实服务端取值尚未在生产上跑过** —— 前端 E2E 打的是**尚未升级的生产 Worker**（还没有 `monthly_done_count` 字段），因此浏览器里那条路径降级为 0；真实服务端口径由 `cfwps44-inbox-monthly.test.mjs` 离线覆盖。**本阶段结束前生产尚未部署**，需用户授权后执行（见 §7）。
2. **完成时间为空的存量已完成记录不计入本月已整改** —— 「整改完成时间」列是 CF-WPS-36 才加的，更早完成的老记录没有完成时间，无法归属月份，代码选择「如实不猜」。它们同样不占「待整改」，不会误导用户。
3. `已整改` 与 `已闭环` 是两个不同人群：前者 = 指派给我且我整改掉的；后者 = 我自己上报且已闭环的。对同时兼任网格长的管理员，两个数字可能都非零，属预期。

## 7. 部署清单（均未执行，待授权）

```bash
# ① Worker（提供 monthly_done_count，必须先发；未发时前端降级为 0，不会报错）
cd grid-mobile-cloudflare/worker && npm run deploy

# ② Pages（页面改动，含 4 卡布局）
cd grid-mobile-cloudflare/_pages_deploy && npx wrangler pages deploy --project-name grid-mobile-cloudflare
```
⛔ ② 必须在 `_pages_deploy/` 目录内、**不带目录参数**执行（带目录参数会静默丢 Functions ⇒ 登录 405，2026-09-17 真实事故）。
部署后必跑三条探针（见技能 `cf-pages-h5-verify` §0.1）：登录 POST 期望 401、`/api/mobile/health` 期望 404 JSON、`/home` 期望 302 → `/check`。
回滚：Pages 控制台 → Deployments → Rollback（CLI 无 rollback 子命令）。
