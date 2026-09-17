# P2-B1-E-08-10 生产前端发布指南（FRONTEND-PUBLISH-GUIDE）

> 生成时间：2026-09-14 20:40（E-08-10 阶段）
> 前提：本机经全端口扫描确认**无 nginx / IIS / 其他静态托管服务**托管前端，故生产 Web 根目录无法由脚本确认，**需人工确认发布目标**。本指南不替代发布操作，仅说明现状与验证方法。

## 一、当前构建物状态（已核验）

| 项 | 值 |
|---|---|
| 构建产物目录 | `G:\hse-dashboard\安全看板vben\apps\web-naive\dist\` |
| 交付压缩包 | `G:\hse-dashboard\安全看板vben\apps\web-naive\dist.zip` |
| 构建时间 | **2026-09-14 20:17**（E-08-09 阶段 `07_build.cjs` 构建） |
| 压缩包大小 | 2,374,551 字节（约 2.37 MB） |
| 应用 | Vben Admin v5 / Vue 3 / TypeScript / **Naive UI**（apps/web-naive，无 web-antd 引用） |
| 增量内容 | E-09 + E-08-08 全部前端增量：`violation_behavior`（三违行为选择）、检查来源、违规人员只读信息卡（组织/岗位）、检查区域、提交后自动展示处理结果（resolver 状态/责任传递/扣分/fail-closed 告警/evidence chain） |
| 扣分计算 | **前端零分值计算**（已审计：页面源码无任何 score 硬编码/计算，全部由后端返回展示） |

## 二、应发布到哪里（需人工确认）

本机未发现任何 Web 服务器托管前端的先例（无 nginx 目录、无 IIS W3SVC 服务、无静态文件监听端口）。请确认以下之一：

1. **此前 dist.zip 的实际发布通道**（2026-09-09 有一次同方式交付先例，当时的发布人/目标服务器为准）；
2. 若部署在**内网其他服务器**：将 dist.zip 解压后整体覆盖该服务器前端根目录（保留服务器侧已有的运行时配置，如 `_app.config.js` 若曾被服务器侧定制）。

**不要**将前端指向除 `5876` 生产 API 以外的后端地址。

## 三、发布后验证清单（只读）

1. 浏览器访问 `http://<前端地址>/site/violation/records`，页面正常加载（web-naive 外观，Naive UI 组件）；
2. 登录正常（不应出现 auth/JWT 异常——后端未改动认证）；
3. 打开「三违记录管理」：
   - 新增表单可见「三违行为（violation_behavior）」「查处来源」「检查区域」字段；
   - 选择违规人员后出现只读信息卡（当前组织/当前岗位，来自后端）；
4. 提交一条**真实业务**记录后，详情抽屉可见：检查来源、resolver 状态、责任传递结果、扣分明细、（公司检查时）fail-closed 告警区；
5. F12 Network 确认 API 全部打到生产 `5876`，响应均来自后端（前端无本地分值计算）。

## 四、未发布期间的行为（保守安全）

生产前端未更新时，旧前端录入不写 `violation_behavior` 字段 → 头盔事件按普通三违 **1 分**处理（保守方向，无多扣风险）。后端规则已就绪，前端发布后 5 分规则完整生效。

## 五、发布状态登记

- ~~`FRONTEND_PUBLISH=WAITING_MANUAL_RELEASE`~~（原报告生成时状态）
- ~~`FRONTEND_PUBLISH=DEPLOYED_COMPANION_8090`~~（过渡方案，已退役）
- **`FRONTEND_PUBLISH=DEPLOYED_SAME_ORIGIN_5876`**（2026-09-14 21:23 完成：5876 直接同源托管前端）

### 最终发布方案（单端口同源，零额外进程）

- 生产后端 5876 运行于本机（当前 PID 27384），本机无 nginx/IIS 托管前端。
  将静态托管 + SPA 回退**并入 `server/app.js`**（原 `app.get('/')` 重定向改为同源静态托管块，
  约第 275 行；`SERVE_DIST` 默认启用、`SERVE_DIST=0` 可回退原重定向；`/api`/`/uploads`/`/templates` 不被吞）。
- 发布后访问地址即**生产后端地址**，无需独立端口：
  - `http://localhost:5876`（本机）
  - `http://192.168.10.101:5876`（局域网）
  - 9090 伴随服务器（`server/serve-frontend.cjs`）已**停用退役**（2026-09-14 21:24 `taskkill /PID 4876 /F`）。
- **已验证（只读，2026-09-14 21:23 重启后）**：
  1. `GET /` → 200（index.html，3448 字节，5876 同源直接返回）；
  2. `GET /api/health` → 200（同一 5876 进程返回真实数据）；
  3. `GET /site/violation/records` → 200（Vue History 路由 SPA 回退正常）；
  4. `GET /_app.config.js` → 200（前端 API 基址 `/api` 同源）；
  5. `/api/health` 带 `text/html` 仍返回 JSON（未被 SPA 回退吞掉，护栏有效）。
- **深度复核（Node 全量扫描 dist 420 个 js 依赖图）**：相对 import 0 悬空 + 绝对(/js,/jse,/assets) import 0 悬空 ⇒ 构建模块图一致、前端可正常启动（非空白页）。curl 早期报的 size=0 / asyncToGenerate 404 均为工具假象（响应头 Content-Length 真实；asyncToGenerate 仅 `__vite__mapDeps` 预载列表残留串，非真实 import）。

### 生产重启执行记录（2026-09-14 21:23）

- 因用户连续确认推进「单端口升级」，执行了生产重启（属生产变更，已与用户对齐）：
  1. 重启前基线：5876 由 PID 27944 托管，健康 200，uptime ~63min（E-08-09 部署实例）。
  2. `Stop-ScheduledTask HSE-Backend-5876` → **实际会终止常驻 node 进程**（与旧记忆"杀不掉"相反，本环境已变更）。
  3. `Start-ScheduledTask HSE-Backend-5876` → 5876 重新上线，新 PID 27384，`SERVE_DIST=1` 默认生效。
  4. 重启后验证全绿（见上）。
- **脚本改动回归安全**：`app.js` 静态托管块受 `SERVE_DIST` 控制，设 `SERVE_DIST=0` 即还原 `app.get('/')` 重定向行为；
  代码改动在测试端口 5889 + dev 库已先行验证通过，未对生产库做任何写入（PRODUCTION_WRITE=0）。

### ⚠️ 重启注意事项（后续若需再次重启）

- 工作树当前仍有未提交改动（git status 显示 server/app.js 及二十余个 services/routes/controllers 为 modified），
  且曾出现 `services/ai/aiPromptRegistry.js` 的 `require('./aiService')` 断链（21:17 已改回 `../aiService`）。
  **再次重启前请确认工作树稳定**（已 commit 或确认无半成品），否则会用脏树覆盖运行实例。
- 重启命令（管理员/计划任务）：
  `Stop-ScheduledTask HSE-Backend-5876`（`Stop` 会真正终止 node）→ `Start-ScheduledTask HSE-Backend-5876`。
  若 `Start` 未自起 node，需 `taskkill /PID <旧PID> /F`（管理员）后重试 `Start`。
- 回退路径：在 `HSE-Backend-5876` 任务的启动环境变量加 `SERVE_DIST=0`，重启后即还原旧重定向行为（前端回归"需独立发布"）。

### 发布后人工验收（浏览器执行）

1. 访问 `http://<本机>:5876/site/violation/records`，页面正常加载（web-naive / Naive UI）；
2. 登录正常（后端认证未改动）；
3. 打开「三违记录管理」：新增表单可见「三违行为 / 查处来源 / 检查区域」；选人后显示只读信息卡；
4. 提交真实记录后详情抽屉可见 resolver 状态 / 责任传递 / 扣分明细 /（公司检查时）fail-closed 告警区；
5. F12 Network 确认 API 全部打到 5876 同源 `/api`，响应来自后端（前端无本地分值计算）。

### 移动端（手机）访问

本机无独立 Web 服务器没关系：生产后端 5876 就跑在这台机器上，并已同源托管前端。
**手机只要能连到这台电脑的 5876 端口即可，无需额外服务器。**

- **前提**：手机与电脑连**同一 WiFi**（手机拿到同一 `192.168.10.x` 网段 IP）。
- **地址**：手机浏览器打开 `http://192.168.10.101:5876`（本机以太网 LAN IP，已 TCP 探测确认 5876 在监听）。
- **网络类型已确认为 `Private`（专用）** ⇒ Windows 防火墙默认允许入站，手机大概率直连即通（无需额外规则）。
- **若打不开**（最常见原因 = 公司 WiFi 开启了 AP 客户端隔离，手机与电脑二层不通）：
  1. 改用「手机开热点 → 电脑连热点」或「电脑开热点 → 手机连热点」；
  2. 或换一个未隔离的 WiFi；
  3. 仍不行则走内网穿透（见下）。
- 管理员如需**显式**放行防火墙（Private 默认已允许，通常不必）：
  - `netsh advfirewall firewall add rule name="HSE-Frontend-5876" dir=in action=allow protocol=TCP localport=5876`
  - 或 PowerShell：`New-NetFirewallRule -DisplayName "HSE-Frontend-5876" -Direction Inbound -Protocol TCP -LocalPort 5876 -Action Allow -Profile Private`

#### 公网访问（手机不在同一 WiFi / 随时随地）

若手机用流量、或不与电脑同网，需用**内网穿透**把 5876 暴露到公网
（前端与 `/api` 同源，穿透 5876 即前后端整体出去）：
- 免费方案：`cloudflared tunnel --url http://localhost:5876` ⇒ 得 HTTPS 公网域名，无需自有服务器；
- 国内备选：cpolar / 花生壳 / 樱花 frp / 自建 frp；
- ⚠️ 安全提示：暴露到公网会使管理后台可被外网访问，建议仅临时使用、用完即停，或配合强认证/访问限制。
