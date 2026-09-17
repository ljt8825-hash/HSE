# CF-WPS-24 `/home` 页彻底移除与入口分流 / 历史栈治理 实施与验证报告

- **日期**：2026-09-17
- **范围**：Cloudflare Pages H5 前端（`grid-mobile-cloudflare/frontend/*` → `_pages_deploy/*`）
- **状态**：**已上线生产**（Pages 部署 `c0909cfe.grid-mobile-cloudflare.pages.dev`，生产域名 `grid-mobile-cloudflare.pages.dev`）
- **验证**：本地等价服务 **22 PASS / 0 FAIL**，公网生产 **22 PASS / 0 FAIL**；回归 cfwps23 33/33、cfwps21 99/99、Worker 离线 248 断言 0 FAIL
- **未动**：Worker（`worker/index.js` 与 wrangler 变量均未改）

---

## 一、用户诉求与真实根因

**用户原话**：「登录后 /home 这一页去掉，直接到 /check；——已经是实现，但是在从这个页面返回的时候，还是会到 /home。我怎么感觉这个页面是增加的？按说，登录后就到（截图那屏）这才是首页。」

截图那屏（`开始检查` + 本月上报/待整改/已闭环 + 底部导航「首页/任务反馈/巡查台账/我的」）**就是 `/check` 的 `view-home`**，也就是系统首页本身——用户判断正确：`/home` 是多余的一页。

### 1.1 真根因（不是猜测，已用 git 取证）

| # | 根因 | 证据 |
|---|---|---|
| **A（主因）** | **`patrol.html` / `records.html` 的左上角返回箭头写死 `href="./home.html"`** —— 一点就打到 `/home` | `git show HEAD:grid-mobile-cloudflare/frontend/patrol.html` → 第 41 行 `<a class="back" href="./home.html">`；`records.html` 第 27 行同 |
| B | `index.html` / `home.html` **同时**用 `<meta http-equiv="refresh">` + `location.replace()` 双重导航 | 源码；meta refresh 会额外产生一条独立历史记录，也是「返回键回到分流页」的常见成因 |
| C | 会话失效 / 退出登录用 `location.href`（**push**） | `app.js`、`check.html` 共 6 处；会把「已登出的页面」留在历史栈里，返回键退回后又被踢去登录，来回弹 |
| D | CF-WPS-23 只把 `/home` 降级为「跳转桩」而非删除 | 桩页仍可被 A 命中，用户就会看到「又回到 /home」 |

> 说明：A 是唯一能被**用户操作直接触发**的路径。B/C 是同一类问题的次因（历史栈污染），一并治理。

---

## 二、改动清单

| 文件 | 改动 |
|---|---|
| `frontend/home.html` | **删除**（源目录 + 部署目录同时删） |
| `frontend/_redirects`（新增） | `/home`、`/home.html` → **`/check` 302**。用 HTTP 重定向而非页面级 JS 跳转，是因为**重定向不产生历史记录**，返回键才不会又落到 `/home`；同时旧书签/旧二维码不 404 |
| `frontend/index.html` | 改为**入口分流页**：有会话或「记住我」凭据 → `./check.html`，否则 → `./login.html`，**一律 `location.replace`**；**移除 meta refresh** |
| `frontend/app.js` | 新增唯一出口 **`redirectToLogin()`**（内部 `location.replace`；守卫同时匹配 `/login` 与 `/login.html`，兼容线上 pretty URL）；`mobileApi` / `mobileUpload` 的 401 分支改调它 |
| `frontend/check.html` | 4 处失效/退出跳转由 `location.href` 改为 `redirectToLogin()` |
| `frontend/patrol.html` | 返回箭头 → `./check.html`；会话失效跳转 → `redirectToLogin()` |
| `frontend/records.html` | 返回箭头 → `./check.html`；会话失效跳转 → `redirectToLogin()` |
| `frontend/detail.html` | 返回箭头由 `javascript:history.back()` 改为确定目标 `./records.html`（历史栈浅时 `history.back()` 会失效）；跳转同上 |
| `tools/local-pages-server.mjs` | 新增 **`_redirects` 解析**（301/302/303/307/308，命中即跳且优先于静态资源），否则 `/home` 302 在本地根本测不出来 |
| `worker/test/cfwps24-browser-e2e.mjs`（新增） | 本阶段端到端验证脚本，见第四节 |
| `worker/test/cfwps14-e2e.mjs` | 文件头标注**废弃**（其断言的旧工作台 `/home.html`、`#code`、`#logout` 自 CF-WPS-23 起即不成立），并指路 cfwps21/23/24 |
| `worker/test/cfwps21-browser-e2e.mjs` | 注释同步（`/home` 已移除） |

**跳转语义总原则（本次确立）**：进入系统/分流/失效回登录**全部 `replace`**，只有用户主动点击的内部导航才用普通跳转。这样历史栈里永远不会出现「已失效或多余的中间页」。

---

## 三、验证

### 3.1 HTTP 层（本地等价服务与公网生产双向一致）

| 断言 | 本地 | 公网生产 |
|---|---|---|
| `GET /home` → **302**，`Location: /check` | PASS | PASS |
| `GET /home.html` → **302**，`Location: /check` | PASS | PASS |
| 7 个源码文件（check/login/index/patrol/records/detail/app.js）**再无 `home.html` 引用** | PASS | PASS |
| `/` 已无 `<meta http-equiv="refresh">`（剥离注释后判定） | PASS | PASS |

### 3.2 浏览器层（真机 Chrome headless，16 项断言）

- 无会话访问 `/` → 停在登录页；**已登录**访问 `/` → 直达 `/check`
- 登录成功直达 `/check`，且 `#view-home.active` 可见（即用户截图那一屏）
- 旧书签 `/home` 打开后落在 `/check`
- **决定性用例**：进入 `patrol` / `records` 后点返回箭头 → 直接回 `/check`，且**全程 0 次 `/home` 请求**（旧代码必失败）
- 从 `/check` 按浏览器返回键，落点不是 `/home`
- 退出登录后按返回键，不会退回 `/check`（`replace` 生效）
- 旧页回归：`patrol` / `records` 未被会话改造踢回登录页，正常渲染
- 无 JS 运行时错误 / 无 4xx 资源

### 3.3 回归

- `cfwps23-browser-e2e.mjs`：33 PASS / 0 FAIL
- `cfwps21-browser-e2e.mjs`：99 PASS / 0 FAIL
- Worker 离线：cfwps08/10/11/12/13/19/21/22 共 **248 断言 0 FAIL**（本阶段未改 Worker，确认零漂移）

### 3.4 实测与官方文档不一致（如实记录，不掩盖）

官方文档称 `_redirects`「不会被当作静态资源提供」，但生产实测 `GET /_redirects` → **200**（返回规则文本本身）。
本地服务已按**生产实测行为**对齐，该断言降级为 `INFO` 仅记录，不参与判定（它不影响任何功能，也不含敏感信息）。

---

## 四、发布与回滚

```bash
# ✅ 正确：必须在 _pages_deploy 目录内、不带目录参数执行
cd grid-mobile-cloudflare/_pages_deploy
npx wrangler pages deploy --project-name grid-mobile-cloudflare
```

回滚：Pages 控制台 → Deployments → 上一版本 → **Rollback**（CLI 无 rollback 子命令）。

### 4.1 ⛔ 发布过程中的一次真实事故与处置（必须留档）

**第一次发布我用错了命令**：`cd grid-mobile-cloudflare && npx wrangler pages deploy _pages_deploy --project-name grid-mobile-cloudflare`
（上一份报告 CF-WPS-23 §四 里也是这么写的，属错误记录，已一并修正）。

- 现象：部署**显示成功**，但 **Functions 一个都没上传** ⇒ `/api/*` 落到静态兜底 ⇒
  `POST /api/mobile/auth/login` **405**、`GET /api/mobile/health` 返回 **`index.html`** ⇒ **生产登录直接不可用**。
- 识别依据：安装日志**缺少** `✨ Compiled Worker successfully` 与 `✨ Uploading Functions bundle`（只有 `Uploading... (9/9)`）。
- 处置：**立即用正确命令重发**（比控制台回滚更快，且能把目标改动一起带上），随后按下面三条探针复验，生产恢复。
- 部署后必跑的三条探针：

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'Content-Type: application/json' \
  -d '{"phone":"<手机号>","password":"wrong0000"}' https://grid-mobile-cloudflare.pages.dev/api/mobile/auth/login   # 期望 401（不是 405）
curl -s -o /dev/null -w "%{http_code}\n" https://grid-mobile-cloudflare.pages.dev/api/mobile/health                  # 期望 404（JSON NOT_FOUND = Functions→Worker 已通）
curl -s -D - -o /dev/null https://grid-mobile-cloudflare.pages.dev/home | grep -i '^location'                        # 期望 /check
```

> 恢复后实测：登录 401（错密码，正确语义）、健康接口 404 JSON、`/home` → 302 `/check`；公网 E2E 22/22 全绿。

---

## 五、遗留与边界

1. **`/home` 用 302 而非 404**：目的是旧书签/旧二维码仍能进系统。若业务要求「彻底查无此页」，把 `_redirects` 改成 404 即可，但会打断仍在使用旧链接的人。
2. **`#patrol-photo`（「不是三违」→ 普通巡查页）仍保留照片预览**：CF-WPS-23 起的既有口径，本阶段未扩大改动范围。
3. **真机相机行为**仍只能实机确认（headless 以 filechooser 事件替代）。
4. **CF-WPS-22「姓名+职位」重名消歧**为独立的 Worker 发布线，本阶段未触碰。
5. **`cfwps14-e2e.mjs` 已废弃**：它断言的是已删除的旧工作台页，重写等于复制 cfwps21/23/24，故只标注废弃而不重写。

---

## 六、复现脚本

| 文件 | 作用 |
|---|---|
| `worker/test/cfwps24-browser-e2e.mjs` | 本阶段全量端到端（HTTP 层 + 浏览器层）。**同一脚本可直接指向公网**：`LOCAL_PAGES=https://grid-mobile-cloudflare.pages.dev node test/cfwps24-browser-e2e.mjs` |
| `tools/local-pages-server.mjs` | 本地「Pages 等价」服务（静态 + `_redirects` + `/api`、`/wps` 反代到生产 Worker），不动生产即可真机走查 |
| 截图 | `worker/test/_cfwps24_shots/`（入口分流 / 首页 / 旧书签 / 退出后） |
