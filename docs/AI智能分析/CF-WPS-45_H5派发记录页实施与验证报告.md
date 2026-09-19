# CF-WPS-45 H5「派发记录」页实施与验证报告

- 日期：2026-09-19
- 范围：`grid-mobile-cloudflare`（H5 网格长巡查移动端）
- 需求原话：「增加：派发的记录」
- 用户确认的两个口径（AskUserQuestion 作答）：
  - **形态** = 底部导航新增一页
  - **范围** = 只列「之前派发但未完成的」（跨月一直显示，直到整改完成）
- 结论：实现完成，本地验证 **25/25（后端离线）+ 54/54（浏览器 E2E）** 全绿；**已发布并生产验证通过**（Worker `b9c31893` → Pages `ef920da4`，见 §6）
- ⚠️ 发布后生产验证发现 **1 处真实文案缺陷**并已修复重发（空态把「从未派发」误写成「都整改完成了」），详见 §6.2

---

## 1. 需求解读与设计决策

### 1.1 为什么落在「底部导航新增一页」

现有首页对经理/管理员的统计是：本月派发（我创建的）、已整改、待整改、已闭环。这四张卡全部是「**我收到的 / 我做的**」视角 —— 经理派出去的活派给了谁、对方整改了没有，**前端一直看不到**。

数据基础是现成的：CF-WPS-36/43 的整改待办落在主台账 9 个文本列里，其中 `指派人ID`（`TODO_FIELDS.assignerId`）记录的正是「谁派的」。建单即指派（CF-WPS-43）在 `patrol/submit` 里把它写成调用者本人。所以「我派发出去的记录」= `指派人ID == 我`，不需要新增任何列或表。

### 1.2 与 `/api/mobile/inbox` 互为镜像

| 接口 | 过滤键 | 语义 |
|---|---|---|
| `GET /api/mobile/inbox` | `整改接收人ID == 我` | 别人派给我的（我的整改） |
| `GET /api/mobile/dispatched` | `指派人ID == 我` | **我派出去的（本次新增）** |

### 1.3 口径：列表只放未完成，已完成只报数

用户选择「只列之前派发但未完成的」。因此：

- **列表** = `整改状态 !== 已完成`，**不按自然月过滤** ⇒ 上月派出去的今天没整改完，这个月继续挂着，直到整改完成才消失（这是本次需求的核心，也是与「本月已整改」口径的关键区别）；
- **`done_count`** = 我派出去且已完成的条数，只做页面顶部上下文提示（「另有 N 条已整改完成」），**不占列表**。

### 1.4 角色门槛：为什么是 公司管理 / 经理

页签只挂给**真的会派发**的角色。依据：

- 建单即指派（CF-WPS-43）把 `指派人ID` 写成调用者本人，能成为调用者的只有 `公司管理`（全公司可派）与 `乡镇作业中心经理`（派本中心下级）；
- `管理员` 在前端走「不转派」分支（转派页 `session.role !== "管理员"` 才加载组织关系），实际不会产生派发记录 ⇒ 给它挂一个**恒空**页签只会让人白点。

⇒ `DISPATCH_TAB_ROLES = ["公司管理", "经理"]`，其余角色 `display:none`。

### 1.5 排序与「挂账天数」

列表按 `指派时间` **倒序**（与 inbox 同族口径）：刚派完的排最前，便于确认派发成功。
另为每条加「**挂账 N 天**」胶囊（派发当天 → 今天的自然日差），**≥30 天标红** —— 这条页码的用途是追未整改项，挂最久的必须一眼可见，否则光靠排序看不出来。

---

## 2. 改动清单

### 2.1 后端 `worker/index.js`

新增 `handleDispatched()`，紧随 `handleInbox()`：

- 鉴权、`patrolTarget`、`ensureTodoFields` 与 inbox 完全同款；
- 取数优先飞书原生 `searchRecords({ field: '指派人ID', value: 我 })`（单次往返），**抛异常**时退回 `scanRecords` 全表扫描 + 内存过滤（保留退路：极早老数据的该列可能为空，search 返回空集而非报错）；
- 过滤 → 排序 → `todoView(r, false)` 映射（与 inbox 复用同一视图函数，字段名天然一致）；
- 响应：`{ success, code, me, pending_count, done_count, total, records }`；
- 路由注册 `GET /api/mobile/dispatched`；接口清单注释由「三个接口」更新为「四个接口」。

### 2.2 前端 `frontend/check.html`

| 位置 | 改动 |
|---|---|
| 底部导航 | 新增第 2 个页签「派发记录」（`data-tab="dispatch"`，飞镖图标，角标 `#badge-dispatch`），默认 `display:none` 由角色门槛放开 |
| 样式 | `.tabbar` 左右内边距 `24px → 12px`（4 → 5 个页签）；`.tab-item` 加 `white-space:nowrap`（见 §3.2） |
| 视图 | 新增 `<section class="view has-tab" id="view-dispatch">`，`.page#dispatch-list` |
| 常量 | `TAB_VIEWS` 加入 `"dispatch"` |
| 导航 | `openTab` / `openEntry` 增加 `dispatch` 分支 → `renderDispatch()` |
| 角色门槛 | 新增 `DISPATCH_TAB_ROLES` + `applyDispatchTabGate()`，在 `renderIdentity()` 内调用 |
| 取数与渲染 | `loadDispatched()` / `dispatchedToRec()` / `dispatchCard()` / `hangDays()` / `renderDispatch()` |
| 首页角标 | `refreshHomeStats()` 调 `refreshDispatchBadge()` —— 派发方在首页就能看到还有几条挂着，不必点进去才发现 |
| 构建号 | `hse-build` 与两处 `?v=` 后缀 `2026-09-18.58 → 2026-09-19.59` |

`_pages_deploy/check.html` 已同步（md5 一致）。

### 2.3 测试

| 文件 | 作用 |
|---|---|
| `worker/test/cfwps45-dispatch-fixture.mjs` | **共享夹具**：离线 mock 飞书端点，跑出 `/api/mobile/dispatched` 的**真实响应 JSON**。两个测试共用同一份数据 |
| `worker/test/cfwps45-dispatched.test.mjs` | 后端口径离线单测：25 断言 |
| `worker/test/cfwps45-dispatch-tab.mjs` | 浏览器 E2E：49 断言 |
| `worker/package.json` | `test` 纳入离线单测；新增 `test:e2e` |

**为什么夹具要共享**：若后端单测自己造 JSON、前端 E2E 再自己造一份，**两边字段名对不上时两个测试都会绿、线上却空白**。夹具统一由后端真实处理器产出 ⇒ 字段名/口径任一侧改了，另一侧立刻红。

---

## 3. 验证证据

### 3.1 后端离线单测 `cfwps45-dispatched.test.mjs` —— 25 PASS / 0 FAIL

关键断言与实测值：

| 断言 | 实测 |
|---|---|
| 服务端按「**指派人ID**」检索（不是接收人ID） | `指派人ID` |
| ★ 上月派出、至今未整改 → **仍在列表** | `D-THIS, D-CROSS` |
| 未整改完成 = 2（跨月 1 + 本月 1） | `2` |
| 本月 / 上月**已整改完成**的都不在列表 | 均不含 |
| `done_count = 2`（只报数不占列表） | `2` |
| 别人派的记录不进列表 | ✔ |
| 从未派发（指派人ID 空）不进列表 | ✔ |
| 我派出去的总数 = 4 | `4` |
| 按指派时间倒序（刚派完的排最前） | `D-THIS, D-CROSS` |
| 前端所需字段确实下发 | `assignee_name / todo_status / assigned_at / assigner_name / town / violation_desc / violation_people` 全非空 |
| 无会话 → 401 且响应体不含 records | `HTTP 401` |

### 3.2 浏览器 E2E `cfwps45-dispatch-tab.mjs` —— 49 PASS / 0 FAIL（补 ⑨b/⑨c 后为 54 / 0）

- ① 真实生产账号（`role=经理`）页签可见性与角色一致；
- ② 点击页签 → 视图切换 + 页签高亮同步；
- ③ 顶部汇总 = 「未整改完成 2 条（另有 2 条已整改完成）」；
- ④ 列表 2 条，本月派的在前；
- ⑤ ★ 跨月（2026-08-01 派出）未整改的记录**确实在列表**，显示「挂账 49 天」；
- ⑥ 卡片含派发对象姓名 + 责任单位；
- ⑦ 页签角标 = 2；
- ⑧ 管理员 → 页签隐藏；
- ⑨ 空列表 → 空态文案；接口 503 → 降级文案且**不亮角标**（不拿旧值骗人）；恢复后重新正确渲染；
- ⑩ 360 / 375 / 390 三种宽度下：5 个页签同行、顺序 = `首页|派发记录|整改任务|巡查台账|我的`、导航栏无横向溢出、**逐项实测每个页签都放得下自己的标签**、无换行。

只读纪律：收尾断言 `guard.blocked === 0` —— 除登录 POST 外零非 GET 请求，**一个生产写请求都没发出去**。`/api/mobile/dispatched` 全程走夹具注入，未打真实网络（生产尚未部署该接口）。

### 3.3 回归与静态检查

| 检查 | 结果 |
|---|---|
| `npm test`（10 个离线测试链） | 退出码 **0**，`FAIL` 计数 **0**（42/55/30/18/27/13/25 各段全过） |
| 前端内联 script 语法 | 3 段，语法错 **0** |
| `deploy.js` 漂移检测 | **7/7**（路由数 deploy=20 index=20，前 N 行逐字节一致） |
| `check-repo-source-integrity.mjs` | **A=0 / B=0** |
| 真实手机号扫描（本批次改动） | **0 命中**（夹具全为合成号 `1390000045x`） |

### 3.4 本轮踩到的两个「测试自己写错」的坑（记录以免重犯）

这两条**都是测试度量的错，不是产品缺陷**，第一轮分别报出 8 个和 6 个假 FAIL：

1. **从 `.tab-item` 里取标签文本不能用 `querySelector('span')`**：`首页`/`我的` 的标签是**裸文本节点**（无 span）；`整改任务`/`巡查台账` 的第一个 `<span>` 是**角标**（`#badge-rectify` / `#badge-checks`）。结果是标签被读成 `''` 或 `'0'`。正解：克隆节点后移除 `.tab-badge` 与 `svg` 再取 `textContent`。
2. **「不裁切」不能用 `scrollWidth > clientWidth` 判**：角标是 `position:absolute; right:-6px`，它**本就该溢出可见**，必然让 `scrollWidth` 变大。也不能拿「最窄页签」比「最宽标签」——`首页` 只有 2 字（页签 22px）本就窄。正解：用探针 span 量每个标签的**自然宽度**，与**它自己那个页签**的宽度逐项比较。

顺带做了一处现场机加固：`.tab-item` 加 `white-space:nowrap`。安卓系统字体缩放会把 11px 渲染得更大，5 个页签一旦换行会撑破导航栏高度。

---

## 4. 边界与未验证项（如实标注）

- ~~**生产未部署**~~ → **已解决**：Worker + Pages 均已发布（§6.1）。该接口生产返回 401（无凭证）/ 200（有凭证），不再走降级文案。**发布顺序：先 Worker 后 Pages**（顺序反了会有一段时间 404）。
- **真实飞书数据下的取值未验证**：E2E 的夹具来自离线 mock 飞书端点。生产上「经理账号实际能查到几条」取决于该账号是否真的派发过（建单即指派才会写 `指派人ID`）。**需发布后用真实账号复验一次**。
- **>50 条截断**：列表上限沿用 `PATROL_LIST_LIMIT = 50`（与 inbox / 台账一致）。挂账超过 50 条时只显示最新 50 条，`pending_count` 仍是真实总数（角标不会骗人）。
- **本页只读**：不提供任何写入口 —— 整改必须由接收人本人完成，派发方不能替他结案（与 `/api/mobile/assign/complete` 的「仅接收人可操作」一致）。

## 5. 顺带发现的仓库卫生问题（2026-09-19 晚仍未处理，属待决策项）

`worker/package.json` 的 `test` 链引用了两个**已被 gitignore 隔离**的测试文件：

- `cfwps28-town-list.test.mjs`（含 18 个真实姓名）
- `cfwps30-feishu-typing.test.mjs`（含真实号尾号）

这意味着**全新 clone 的仓库跑 `npm test` 会在第 5 步断链**。二者此前因红线 PII 被隔离，隔离本身是对的，但与 `test` 脚本出现了冲突。可选处置：把这两个文件里的真实姓名/手机号替换为合成值后解隔离入库，或把它们从 `test` 链里摘出并在 README 说明需另配本地夹具。本轮未擅动（属另一主题）。

---

## 6. 发布与生产验证（2026-09-19 晚；用户授权「现在发（先 Worker 后 Pages）」）

### 6.1 发布记录

| 步骤 | 产物 | 关键日志 |
|---|---|---|
| Worker | Version `b9c31893-dfe4-42fa-9c35-c503a938263d` | `Uploaded ... (5.00 sec)` |
| Pages（第一版） | `6be3ced1.grid-mobile-cloudflare.pages.dev` | `✨ Compiled Worker successfully` + `✨ Uploading Functions bundle` |
| Pages（文案修正版，**最终**） | **`ef920da4.grid-mobile-cloudflare.pages.dev`** | 同上（Functions 未丢） |

> ⚠️ 日志里必须出现 `✨ Uploading Functions bundle` —— 缺了就是「`pages deploy <dir>` 丢 Functions」事故（症状：登录接口 405）。发布命令一律在 `_pages_deploy/` **目录内、不带目录参数**执行。

### 6.2 生产验证发现并修复的**真实缺陷**：空态文案

发布后用 4 个真实账号（含 2 个公司管理）读 `/api/mobile/dispatched`，`total` **全为 0** —— 即系统里目前尚无任何派发中记录（派发动作尚未被真实使用）。但当时空态文案写的是「**派出去的都整改完成了**」。

**这是语义错误**：会让人误以为自己的派发都已闭环，而事实是「压根没派过」。已修正为按 `total` 分流：

| 条件 | 汇总行 | 空态 |
|---|---|---|
| `total === 0` | 还没有派发记录 | 你还没有派发过记录（+ 引导语） |
| `total > 0` 且 `pending === 0` | 派出去的都整改完成了 | 派出去的都整改完成了 |
| `pending > 0` | 未整改完成 N 条（另有 M 条已整改完成） | —（走列表） |

### 6.3 最终 E2E：54 passed / 0 failed

在 §3.2 基础上新增：

- **⑨b** 两种空态文案不混用（含**反向**断言：不得出现「都整改完成了」）；
- **⑨c** **真·生产后端对照**：用 `localStorage` 里的真实 token 直连 `/api/mobile/dispatched`，按真实 `total` / `pending_count` 分三支校验文案，截图 `05-real-backend-data`。实测生产回传 `HTTP 200 code=OK pending=0 total=0`。

只读纪律收尾断言 `guard.blocked === 0` 仍为 0（全程零生产写入）。

### 6.4 发布后探针（6 项全过）

| 探针 | 期望 | 实测 |
|---|---|---|
| `POST /api/mobile/auth/login`（空 body） | 非 405（405 = Functions 丢） | **400** `BAD_REQUEST` |
| 对照：对只允许 GET 的路由 POST | 405 | 405（确认 405 特征可辨识） |
| `GET /api/mobile/dispatched` 无凭证 | 401 | **401** `UNAUTHORIZED` |
| `/home` | 302 → `/check` | `Location: /check` |
| `/check` 构建号 | `2026-09-19.59` | 已在线 |
| 新文案 / `tab-dispatch` | 在线 | 空态文案 1 处 / `tab-dispatch` 3 处 |

### 6.5 两处探针踩坑（修正上轮记录）

1. **登录端点不是 `/api/mobile/login`，而是 `/api/mobile/auth/login`**（`worker/index.js:2810`）。用错路径会拿到 Worker 自己的 `unknown route` 404，极易误判成「Functions 挂了」。空 body 的正确期望是 **400**（不是 401）。
2. **`/check.html` 会 308 → `/check`**（Pages clean-URL）。直接 `curl /check.html` 拿到的是**空 body 的 308**，grep 构建号/文案必然 0 命中。探针要打 `/check`（或加 `-L`）。

### 6.6 ⚠️ 环境陷阱：本机 Bash 工具无法更新 `refs/remotes/**`

`git push` / `git fetch` 在本环境的 Bash 工具里**报告成功、但永远不会更新本地远程跟踪引用**：

- `mkdir -p .git/refs/remotes/origin` 报成功、`ls` 也能看到目录，但**往里写文件报 `No such file or directory`**（写普通文件同样失败）；
- `git update-ref refs/remotes/origin/main HEAD` 返回 **rc=0 但引用纹丝不动**，松散 ref 文件不生成；
- 结果：`git status` / `git branch -vv` 长期显示**假的 `ahead N`**（本次为 **129**），极易让人误以为「没推上去」而重复劳动。本机工作副本一直如此（`refs/remotes/origin/main` 停在 `31975ef`「initial cleaned baseline」）。
- **验证推送的唯一可靠办法**：`git ls-remote origin main`（本次权威确认 `bdec43b` = 本地 HEAD）。
- **修复办法**：改用 PowerShell 写 `.git/refs/remotes/origin/main`（内容为 HEAD 的 SHA）—— PowerShell 侧写入正常。本会话已修，之后 `git branch -vv` 归一为 `[origin/main]`、无 ahead。

---

## 7. 提交与推送

| 提交 | 说明 |
|---|---|
| `e8486d0` | feat：H5 新增「派发记录」页（接口 + 页签 + 视图 + 测试 + 报告） |
| `d332078` | docs：本报告 |
| `bdec43b` | fix：空态文案按 `total` 分流 + E2E 补 ⑨b/⑨c 真实生产对照 |

推送命令（本机非交互环境专用，见用户级记忆；只加 `wincred` 会挂死，必须先空值清空 helper 列表）：

```bash
git -c credential.helper= -c credential.helper=wincred \
  -c http.proxy=http://127.0.0.1:7890 -c https.proxy=http://127.0.0.1:7890 push origin main
```

结果：`d0d7903..bdec43b  main -> main`；随后 `ls-remote` 复核 `refs/heads/main = bdec43b0eaa45bdf7f7e67624ab7cb1e11acef47`。

提交前自检：`check-repo-source-integrity.mjs` **A=0 / B=0**；diff 凭据/PII 扫描 **0 命中**（唯一命中为 `localStorage` 取 token 的变量名）。
