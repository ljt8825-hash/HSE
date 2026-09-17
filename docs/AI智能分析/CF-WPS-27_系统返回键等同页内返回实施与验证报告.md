# CF-WPS-27：系统返回键 = 页内返回（与左上角箭头一致）实施与验证报告

- 日期：2026-09-17 晚
- 范围：`grid-mobile-cloudflare/frontend/check.html`（H5 主应用，单页多视图）；Worker 无改动
- 阶段号：CF-WPS-27（`ls worker/test/cfwps*` 查重后确定）

## 1. 用户诉求（原话）

> 「现在使用系统的上一步或者返回键时，直接退出H5页面。但是点击左上角的返回键，就会到上一页。我现在就要系统的返回/上一步和点击左上角的功能一样」

即：**安卓返回键 / 浏览器「上一步」/ 微信左上角返回，行为要和页内左上角返回箭头一致——回到上一视图**，而不是直接退出 H5。

## 2. 根因

`check.html` 是单文件多视图 SPA（`.view.active` 切换），**视图切换从未接入浏览器历史栈**（无 pushState/popstate）。系统返回键只能操作真实历史条目，而主链路（index→login→check）全是 `location.replace`，页内无条目 ⇒ 一按返回就离开 H5。两套「返回」（系统键 vs 页内箭头）走的是两条完全不相干的通道。

## 3. 修法（`showView` 接入历史栈）

1. 原 `showView` 改名 `renderView`（只管切 DOM，原样保留）；新增同名包装 `showView(name)` 负责导航：
   - **前进**：`pushState({ h5view: name })`，与自维护 `viewStack` 一一对应；
   - **首个落地视图**：`replaceState` 占用当前条目，不新增（首页按返回仍是自然退出，符合微信习惯）；
   - **页内相邻返回**（目标 = 栈顶前一项，正是所有左上角箭头的情况）：改走 `history.back()`，让 popstate 统一切视图 ⇒ **箭头与系统返回共用同一条栈，行为永远一致**；
   - **非相邻回首页**（检查/整改完成后 `btn-done-home` → `enterHome`）：`history.go(1 - 栈深)` 整条收拢回首页起点，避免返回键重走已完成流程。
2. `popstate` 监听：读 `ev.state.h5view` 切回对应视图（`home` 走 `enterHome()` 保证统计刷新）；无 `h5view`（页内历史边界）不拦，交还浏览器/微信 = 退出 H5。
3. boot 两个错误分支改用 `renderView("boot")`——启动页是瞬态视图，不入栈（否则首页按返回会退到过期的加载屏）。
4. **顺带修复两个潜在 bug**：`dt-back`（`from: "view-my-checks"` 等）与 `rf-back`（`rectifyFrom = "view-home"`）会调 `showView("view-xxx")`，原实现拼出 `#view-view-xxx` 取到 null 直接 TypeError；包装层统一 `name.replace(/^view-/, "")` 容错。

## 4. 验证

- `worker/test/cfwps27-browser-e2e.mjs`：**26 PASS / 0 FAIL**
  - 静态层 7 条：pushState/popstate/replaceState/收拢接线齐全、boot 不入栈、前缀容错；
  - 浏览器层 19 条（决定性）：落地栈初始化、前进 pushState、**系统返回回首页/回拍照页（=箭头目标）**、左上角箭头回归、Tab 前进后系统返回、**非相邻回首页收拢后系统返回=直接退出 H5**（URL → about:blank）、无 JS 错误/无 4xx。
  - 纪律：只在视图层走查，未提交任何巡查记录。
- 回归：cfwps23 **33 PASS**、cfwps24 **22 PASS**、cfwps25 **60 PASS**、cfwps26 **24 PASS**（合计 165 断言全绿）。
- `node tools/check-repo-source-integrity.mjs`：0 缺件。
- E2E 测试本身的两个坑（复用价值）：
  1. 顶层 `let viewStack` 是全局词法绑定，**不挂 `window`**——`page.evaluate` 里直接写 `viewStack.length` 可见，`window.viewStack` 是 undefined；
  2. 同文档 popstate 的返回键模拟要用 `page.evaluate(() => history.back())` + `waitForSelector`，**别用 `page.goBack()`**（它按跨文档导航等，同文档场景会超时）。

## 5. 已知边界（如实说明）

- 中途刷新页面（F5/下拉无）会丢页内栈而真实历史条目仍在，此后按返回可能先穿过几个过期视图再回到首页；自愈（穿过即同步），且微信内无刷新入口，影响极小。
- 老 WebView 禁用 history API 时 try/catch 退化为无返回栈（等同旧行为）。
- 页内返回箭头与系统返回共用栈后，「箭头返回 → 再按系统返回」会退到箭头来源页之前一屏（真实历史语义），与原生 App 一致。

## 6. 产物

- `frontend/check.html` + `_pages_deploy/check.html`（diff 一致）
- `worker/test/cfwps27-browser-e2e.mjs`（截图 `worker/test/_cfwps27_shots/`，已 gitignore）
