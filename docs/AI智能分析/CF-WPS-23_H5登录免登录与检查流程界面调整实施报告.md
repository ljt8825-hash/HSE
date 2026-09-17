# CF-WPS-23 H5 登录免登录与检查流程界面调整 · 实施与验证报告

- **阶段编号**：CF-WPS-23（原编号 CF-WPS-22 已被「姓名+职位重名消歧」占用，经 `ls worker/test/cfwps*` 查重后定号）
- **日期**：2026-09-17
- **线上地址**：https://grid-mobile-cloudflare.pages.dev/login → 登录后直达 `/check`
- **改动范围**：**仅 Cloudflare Pages 前端**（`grid-mobile-cloudflare/frontend/*` → `_pages_deploy/*`）。
  Worker（`worker/index.js`）本阶段**零改动**，无需 Worker 重新部署。
- **状态**：代码完成 + 本地真机浏览器 E2E **33 PASS / 0 FAIL**；Worker 离线回归 248 断言全绿；**已部署到生产 Pages**（2026-09-17 晚，部署 ID `bd273395.grid-mobile-cloudflare.pages.dev`），生产复跑 **33 PASS / 0 FAIL** + 布局回归 **99 PASS / 0 FAIL**

---

## 一、诉求与交付对照

| # | 用户诉求（原文要点） | 交付 | 状态 |
|---|---|---|---|
| 1 | 登录页增加保存密码，或登录一次后不用再次登录 | ①会话从 `sessionStorage` 迁到 **`localStorage`**（关浏览器/微信重进仍在）②新增「**记住我**」勾选框（默认勾选），勾选后本机保存登录凭据 ③会话过期/失效时**静默重登**（用户看不到登录页）④退出登录清空凭据 | 已实现 |
| 2 | 登录后 `/home` 去掉，直接到 `/check` | 登录成功 `location.replace('./check.html')`；`home.html` 改为**跳转桩**（旧书签/旧链接扫到 `/home` 直接进 `/check`，不再出现第二个页面） | 已实现 |
| 3 | 去掉 `document.querySelector("#cta-sub")` | 该 `id` 只存在于 HTML（首页「开始检查」下方「定位在后台持续进行，不影响开始检查」），**代码里并无对应 JS 查询语句**；已删除该元素及其文案 | 已实现 |
| 4 | 拍完照片直接显示「下一步」，不再显示「拍现场照片」「从相册上传」；点照片预览可重拍 | 拍照成功后：`#photo-actions`（两个拍照入口）整块收起、`#btn-photo-next` 显示；点击照片预览重新调起相机；提示文案改为「点击上方照片可重新拍摄」；未拍摄时点照片区**不误触发**相机 | 已实现 |
| 5 | 点「下一步」后去掉照片预览，只留两个按钮 | `view-classify` 删除 `photo-box` / `#classify-photo`；页面仅剩「不是三违」「是三违」两张卡 | 已实现 |

---

## 二、关键设计

### 2.1 免登录：不解锁新品类，只做「凭据换 token」

会话 TTL 由 Worker 决定（`MOBILE_SESSION_TTL_SECONDS = 7200`，2 小时）。**未放宽 TTL、未改 Worker**，而是：

```
打开页面 → 有未过期 token ?  → 直入
           ↓ 否
        有「记住我」凭据 ? → POST /api/mobile/auth/login → 换新 token → 直入（用户无感）
           ↓ 否/失败
        登录页
```

**为什么可行且安全**：
- 登录限流 `loginRateLimited(ip)` **只统计失败**（`index.js` 中 `loginRecordFail(ip)` 仅在错误分支调用），
  成功后不计数、不重置窗口 ⇒ 静默重登不会把用户/IP 打到 429。
- 凭据失效（密码规则变更 / 账号停用）时**主动丢弃并回登录页**，不会死循环。
- `mobileApi` 收到 **401** 时先静默重登并**重试一次**，仍失败才回登录页 —— 巡检途中会话到期不再打断作业。

**已知取舍（须业务确认）**：勾选「记住我」后，密码以明文存于本机浏览器 `localStorage`
（key `hse_login_creds_v1`）。该密码口径为「姓名拼音首字母 + 手机号后 4 位」，属台账派生弱凭据；
若业务不接受本机落明文，改为「只记住手机号 + 延长 token TTL」即可（需 Worker 变更，另立阶段）。

### 2.2 防死循环：身份接口非 401 失败不再清会话

原 `boot()` 对 `/api/mobile/me` 任何非 200 都 `clearSession()` + 跳登录 —— 叠加自动重登会形成
「后端抖动 → 清会话 → 自动重登 → 再抖动」死循环。现改为：
**401 才清会话回登录页；其他错误保留登录态**，并在启动页给「重试」按钮。

### 2.3 改动清单

| 文件 | 改动 |
|---|---|
| `frontend/app.js` | 新增 `getToken/setSession/getSessionExp`（localStorage + **旧 `sessionStorage` 自动迁移** `migrateLegacySession()`）、`saveLoginCreds/loadLoginCreds/clearLoginCreds`、`ensureSession(force)`；`mobileApi` 401 静默重登重试；`mobileUpload` 改用 `getToken()` |
| `frontend/login.html` | 新增「记住我（下次打开自动登录）」勾选框（默认勾选）；进入页面即尝试免登录，成功直接 `replace` 到 `/check`；登录成功写凭据；支持回车提交 |
| `frontend/check.html` | 删 `#cta-sub`；`view-photo` 包一层 `#photo-actions`；`setScenePhoto` 收入口/露下一步；新增 `resetScenePhotoUI()`；`#scene-photo-box` 点击重拍；`view-classify` 删照片预览；`boot()` 接 `ensureSession` + 非 401 保留登录态；退出登录同时 `clearLoginCreds()`；CSS 加 `.photo-box.clickable` |
| `frontend/home.html` | 由工作台页改为**跳转桩** → `./check.html` |
| `tools/local-pages-server.mjs` | **新增（本地验证工具，不部署）**：复现 Pages「静态 + `/api`、`/wps` 反代」，用于不动生产跑真机 E2E |
| `worker/test/cfwps23-browser-e2e.mjs` | **新增**：浏览器 E2E（25 断言） |

---

## 三、验证

### 3.1 本地「Pages 等价」真机 E2E（33 PASS / 0 FAIL）

启动方式（本地复现 Pages Functions 反代，`/api` 打到**真实生产 Worker**，只读零写入）：

```bash
cd grid-mobile-cloudflare
HTTPS_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1 node tools/local-pages-server.mjs   # 监听 127.0.0.1:5899
node worker/test/cfwps23-browser-e2e.mjs
```

| 组 | 断言 | 结果 |
|---|---|---|
| ① 免登录 | 默认勾选记住我 / 凭据+会话落 localStorage / 重进 `/login` 免登录 / 新开页面免登录 / 退出后凭据清空且停留登录页 | 6 PASS |
| ② 直达 | 登录后 URL 为 `/check`（`/home` 不再出现） | 1 PASS |
| ③ 文案 | `#cta-sub` 元素数 = 0；首页无「定位在后台持续进行…」 | 2 PASS |
| ④ 拍照 | 未拍：两入口可见、下一步隐藏、点照片区不误触发相机；拍后：两入口不可见、下一步出现、预览在、提示改文案、点预览触发 filechooser | 8 PASS |
| ⑤ 分类 | 无 `#classify-photo`、无 `photo-box`、仅 2 张 opt-card | 4 PASS |
| 回归 | 重新开始检查时拍照入口复位、下一步恢复隐藏 | 2 PASS |
| ⑥ 旧页无回归 | `records.html` / `patrol.html` / `detail.html` 均未被会话改造踢回登录页且正常渲染（巡查人正确显示「张万恒（二级网格长）」） | 6 PASS |
| ⑥ 向下兼容 | 仅持旧 `sessionStorage` 会话（无 localStorage）仍可访问，且**自动迁移**到 localStorage | 2 PASS |
| 健康 | 无 JS 运行时错误 / 无 4xx 资源（favicon 与「刻意的 id=0 探针」除外） | 1 PASS |

> 说明：三个 `*.html` 旧页已无任何入口引用（`check/home/login` 都不再链接它们），但仍公网可达且都依赖共享的 `app.js`，
> 因此必须验证没被本次会话改造踢坏 —— 结论是无回归。`/detail.html?id=0` 的 404 是 Worker `NOT_FOUND` 的**正确**响应（记录不存在）。

截图（`worker/test/_cfwps23_shots/`）：`01-login` / `02-home` / `03-photo-empty` / `04-photo-done` / `05-classify` / `06-logged-out`。
其中 `02-home` 可见「开始检查」按钮下方已无小字；`04-photo-done` 仅剩照片 +「下一步」+「点击上方照片可重新拍摄」；`05-classify` 仅两张卡。

### 3.2 静态校验

- 三份 HTML 内联脚本 + `app.js` 语法校验全通过（`new vm.Script`）。
- 元素 id 引用完整性：`check.html` 104 个 id / 77 个 JS 引用，**无悬空引用**；已删的 `#cta-sub`、`#classify-photo` 无残留引用；新增 `#photo-actions`、`#photo-tip` 就位。
- `frontend/*` 与 `_pages_deploy/*` 逐文件 `diff` 全为 SAME。

### 3.3 Worker 离线回归（本阶段未改 Worker，确认无漂移）

`cfwps08 8/8`、`cfwps10 8/8`、`cfwps11 46`、`cfwps12 25`、`cfwps13 58`、`cfwps19 55`、`cfwps21 30`、`cfwps22 18` ⇒ **248 断言，0 FAIL**。

### 3.4 部署后补做的验证（2026-09-17 晚，已执行）

- **生产 Pages 复跑本阶段 E2E**（`LOCAL_PAGES=https://grid-mobile-cloudflare.pages.dev node test/cfwps23-browser-e2e.mjs`）：**33 PASS / 0 FAIL**。
- **生产布局回归**（`node test/cfwps21-browser-e2e.mjs`）：**99 PASS / 0 FAIL**（3 视口 390×844 / 360×640 / 430×932 + 拒绝定位场景），确认 CF-WPS-23 改动未破坏底部导航常驻与每屏自适应。
- ⚠️ 该回归脚本有**两处随 CF-WPS-23 失效的旧断言，已同批修正**：①`login()` 仍等 `/home` → 改为等 `/check`（`/home` 已是跳转桩）并兼容「已有凭据免登录直接跳走」；②无从定位场景仍断言 `#cta-sub` 文案 → 改为断言 `#cta-sub` 元素数 = 0 且首页无「定位成功后才能开始」文案。
- 真机相机（`capture=environment`）行为仍只能实机确认，headless 仅以 filechooser 事件替代。

---

## 四、部署与回滚（已于 2026-09-17 晚执行）

> ⚠️ **本节命令已于 CF-WPS-24 修正**：下面这条「在上级目录带目录参数」的写法**会静默丢掉 Pages Functions**
> （实测：`/api/*` 落到静态兜底 ⇒ **登录 POST 405**、`GET /api/mobile/health` 返回 `index.html`）。
> 正确写法必须在 `_pages_deploy/` **目录内、不带目录参数**执行：

```bash
cd grid-mobile-cloudflare/_pages_deploy
npx wrangler pages deploy --project-name grid-mobile-cloudflare
# 安装日志必须同时出现：✨ Compiled Worker successfully + ✨ Uploading Functions bundle
```

```bash
# ❌ 不要这样写（本次事故版本，Functions 不会上传）
# cd grid-mobile-cloudflare && npx wrangler pages deploy _pages_deploy --project-name grid-mobile-cloudflare
# → Deployment complete! https://bd273395.grid-mobile-cloudflare.pages.dev （生产域名 grid-mobile-cloudflare.pages.dev）
```

- 回滚：Pages 控制台 → Deployments → 选中上一版本 → **Rollback**（前端无状态，回滚零风险）。
  CLI **没有** rollback 子命令，因此「先本地验证再发」比回滚更靠得住。
- ⚠️ **本报告 §二 第 2 条已被 CF-WPS-24 取代**：`/home` 不再是「跳转桩」，而是**整页删除 + `_redirects` 302 → `/check`**
  （因为跳转桩仍会被 `patrol.html`/`records.html` 的返回箭头打到，用户按返回键就会"再回到 /home"）。
- **本阶段未动 Worker**。与之独立的 CF-WPS-22「姓名+职位重名消歧」也已在同批上线
  （Worker 版本 `b8edf674-3d99-4c18-aeb1-a44f59102580`），两者可独立回滚。

---

## 五、遗留与待确认

1. **明文保存密码**是否可接受（见 2.1 取舍）。若不可接受 → 改「只记住手机号」+ 延长 Worker token TTL。
2. **「不是三违」→ 普通巡查页仍保留照片预览**（`#patrol-photo`）。本轮诉求只点名分类页，未擅动。
   若口径一致，建议一并去掉。
3. `/home` 现为跳转桩而非删除文件 —— 保留是为了旧书签/旧二维码不 404；若要彻底移除需清 CDN + 通知使用者改书签。
4. `VIO_LIB` 三违宫格仍硬编码 6 项（既有遗留，与本阶段无关）。
