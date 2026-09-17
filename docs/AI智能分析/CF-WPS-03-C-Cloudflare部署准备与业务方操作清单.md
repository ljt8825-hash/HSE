# CF-WPS-03-C：Cloudflare 部署准备与业务方操作清单

> 阶段性质：CF-WPS-03-B `BLOCKED_EXTERNAL_VALIDATION` 之后的**部署准备**子阶段。
> 本阶段**不进行**真实 WPS OAuth 调用、不部署真实 Worker、不请求用户提供任何 Secret。
> 目标：将 `grid-mobile-cloudflare/worker` POC 整理到「业务方只需完成 Cloudflare 登录、Secret 配置、WPS 应用配置即可部署联调」的状态。
> 最终状态：**CF-WPS-03-C_STATUS = READY_FOR_BUSINESS_SETUP**（非 CF-WPS-03_READY=YES，未进 CF-WPS-04）。

---

## 1. 当前环境检查

| 项 | 命令 | 结果 |
|----|------|------|
| Node | `node --version` | v22.22.2（managed，位于 `.workbuddy/binaries/node`） |
| npm | `npm --version` | 10.9.7 |
| npx | `command -v npx` | 存在（`/c/Users/honey/.workbuddy/binaries/node/versions/22.22.2-2/npx`） |
| Wrangler（PATH） | `command -v wrangler` | **不存在** |
| Wrangler（local） | `node_modules/.bin/wrangler` | **不存在** |
| Wrangler（global） | `npm root -g` 下 `wrangler` | **不存在** |

结论：本开发沙箱**未安装 Wrangler**，但 `npx` 可用。按任务书 §三，不为此修改 `package.json` 添加依赖、不执行全局安装；部署阶段业务方使用 **`npx wrangler`**（npx 按需拉取），无需预装。

---

## 2. Wrangler 状态

- 安装状态：**未安装**（本环境）。
- 登录状态：**未知 / 未登录**（本环境未配置 Cloudflare 账号，且本阶段不执行登录）。
- 可执行能力：`npx wrangler <cmd>` 可在具备网络与凭证的环境运行（首次会按需下载 wrangler 到 npx 缓存，不污染项目 `node_modules`）。
- 本环境未实际运行 `npx wrangler whoami`（该命令需 Cloudflare 登录凭证，留待业务方执行）。

---

## 3. Worker 配置检查（`grid-mobile-cloudflare/worker/wrangler.toml`）

| 配置项 | 当前值 | 是否符合 §四 |
|--------|--------|--------------|
| `WPS_AUTHORIZE_URL` | `https://openapi.wps.cn/oauth2/auth` | ✅ |
| `WPS_TOKEN_URL` | `https://openapi.wps.cn/oauth2/token` | ✅ |
| `WPS_USERINFO_URL` | `https://openapi.wps.cn/v7/users/current` | ✅ |
| `WPS_SCOPE` | `kso.user_base.read` | ✅ |
| `WPS_API_SIGNATURE` 开关 | **不存在** | ✅（POC-03-A 已删除，userinfo 强制 Bearer+KSO-1） |
| Bearer-only 正式路径 | **不存在** | ✅ |
| UserInfo 是否固定 Bearer + KSO-1 | 是（`index.js` 强制附加 `X-Kso-*` 头） | ✅ |
| Token endpoint 是否使用 KSO-1 | 否（标准 OAuth2 表单，无签名） | ✅ |
| `WPS_CLIENT_ID` 是否写入代码 | 否（仅 `env.WPS_CLIENT_ID`，注释说明） | ✅ |
| `WPS_CLIENT_SECRET` 是否写入代码 | 否（仅 `env.WPS_CLIENT_SECRET`，注释说明） | ✅ |
| `WPS_REDIRECT_URI` 是否硬编码为假生产地址 | 否（占位符 `https://<your-pages-or-worker-subdomain>/wps/oauth/callback`） | ✅ |

> `wrangler.toml` 仅含 `[vars]`（非敏感）与注释；敏感凭据经 `wrangler secret put` 注入，**任何值均不落地于文件**。

---

## 4. OAuth start / callback 检查（`index.js`）

| 路由 | 行号 | 行为 | 结论 |
|------|------|------|------|
| `GET /wps/oauth/start` | `handleStart` (L179-201) | 服务端 `crypto.randomUUID()` 生成 `state`；用 `env.WPS_REDIRECT_URI` 拼 `authorizeUrl`；302 跳转；`Set-Cookie: wps_oauth_state=...; HttpOnly; Secure; SameSite=Lax` | ✅ |
| `GET /wps/oauth/callback` | `handleCallback` (L206-356) | 取 `code`/`state`；服务端 cookie 双重提交校验；`code`→`token`；`token`→`/v7/users/current`（Bearer+KSO-1）；返回脱敏 user 字段 | ✅ |

- `state` 由 Worker 服务端生成（`L180`），不依赖浏览器输入。
- `callback` 始终把 `access_token`/`refresh_token` 保留在服务端，**响应体不含任何 token/secret**（`L348-351` `accessTokenReturnedToBrowser:false`）。

---

## 5. Redirect URI 安全检查（§五）

| 检查点 | 实现 | 结论 |
|--------|------|------|
| redirect_uri 可经环境变量配置 | `env.WPS_REDIRECT_URI`（start `L181`、callback `L240`） | ✅ |
| callback 与 authorize 使用同一 redirect_uri | 两处均读 `env.WPS_REDIRECT_URI`，非各自硬编码 | ✅ |
| redirect_uri 不允许浏览器任意传入 | 仅取自 `env`，**未**从 `request.url`/query 读取 | ✅ |
| 不允许开放 redirect_uri 注入 | 同上，服务端唯一来源 | ✅ |
| state 仍由服务端生成 | `crypto.randomUUID()` `L180` | ✅ |
| state 仍服务端校验 | cookie 双重提交 `L212-213` | ✅ |
| callback 不向浏览器返回 access_token | 响应无 token 字段 | ✅ |
| callback 不向浏览器返回 refresh_token | 响应无 refresh_token 字段 | ✅ |

结论：现有代码**已满足全部 Redirect URI 安全要求，无需修改**。

---

## 6. Secret 安全检查（§八）

- 存储方式：仅经 Cloudflare Secret 注入（`wrangler secret put`），运行时通过 `env.WPS_CLIENT_ID` / `env.WPS_CLIENT_SECRET` 读取。
- 禁止落地位置（均确认未违反）：`.env` / `.dev.vars` / `wrangler.toml` / `index.js` / `package.json` / 报告 / Git。
- 仓库扫描：`grid-mobile-cloudflare/` 全目录 `grep` 未发现任何明文 `WPS_CLIENT_SECRET=` 实际值。
- 浏览器/日志/URL 泄露：代码层保证响应体零 token/secret；离线测试 T9 已验证。
- 推荐配置命令（仅命令形式，绝不索取内容）：
  ```
  npx wrangler secret put WPS_CLIENT_ID
  npx wrangler secret put WPS_CLIENT_SECRET
  ```
- **明确禁止**：要求业务方将 `WPS_CLIENT_SECRET` 粘贴到聊天窗口 / 文档 / 任何非 Cloudflare Secret 的位置。

---

## 7. WPS 后台配置要求（业务方操作清单 · 后台侧，§九）

### OAuth2 用户授权
- [ ] 应用已开启 **OAuth2 用户授权**
- [ ] **Redirect URI 已登记**到 WPS 开放平台应用
- [ ] 登记的 Redirect URI 与 Worker 实际 `WPS_REDIRECT_URI` **完全一致**（含协议/域名/路径 `/wps/oauth/callback`）
- [ ] scope 包含 **`kso.user_base.read`**

### 接口签名（KSO-1）
- [ ] 应用「接口签名」能力已开启
- [ ] `APPID` 与 Worker `WPS_CLIENT_ID` 对应
- [ ] `APPKEY` 与 Worker `WPS_CLIENT_SECRET` 对应（即 KSO-1 签名的 `secretKey`）

> 注意：`APPKEY` / `WPS_CLIENT_SECRET` 不允许进入本报告或任何聊天记录。

---

## 8. 离线测试结果（§十）

执行：`node test/oauth-flow.test.mjs`（managed node 22.22.2-2）

```
T1 ✓ KSO-1 签名算法正确性（Web Crypto vs Node crypto 交叉校验）
T2 ✓ start 重定向与 state 下发（scope=kso.user_base.read）
T3 ✓ token 请求体校验（client_id/client_secret，无 KSO-1）
T4 ✓ userinfo 始终含 Bearer + KSO-1 头
T5 ✓ userinfo 解析（仅官方身份字段）
T6 ✓ state 校验失败应被拒
T7 ✓ token 错误码诊断且不泄露 token
T8 ✓ userinfo 401/403/签名错误显式处理
T9 ✓ 安全检查（无 token/refresh_token/secret/APPKEY 泄露）
+   解析单元通过
```

**结果：9 项全部通过。** 满足 §十「部署前自动检查」要求，可进入部署准备收尾。

---

## 9. Git 状态（§十一）

- 执行：`git status --short -- grid-mobile-cloudflare/`
- 结果：`?? grid-mobile-cloudflare/` —— 整个 POC 目录为**未跟踪**（untracked），与 HSE 生产代码基线完全隔离。
- **本任务对 HSE 生产代码修改计数 = 0**。本阶段仅只读审计 + 离线测试 + 报告生成，未触碰任何 tracked 生产文件。
- 仓库内其他历史 dirty 文件（`server/`、`docs/191副/` 等）属**此前会话**遗留，**不删除、不恢复、不 reset、不 checkout 覆盖、不处理**。

---

## 10. HSE 生产修改确认（§二）

| 受保护项 | 是否修改 |
|----------|----------|
| HSE 登录 / JWT / 权限 / 用户中心 | 否 |
| `employee_id` / `authenticatedEmployeeResolver` | 否 |
| `grid_inspection_records` / `grid_record_sync_map` | 否 |
| WPS→PG 同步 | 否 |
| PC 网格长巡查台账 / 三违台账 | 否 |
| 任何正式 HSE API / 正式 H5 | 否 |
| `server/` / `安全看板vben/` | 否 |

→ **HSE production modified by this task = 0**。

---

## 11. 业务方必须执行的操作（§七）

### A. WorkBuddy（本环境）已完成 / 可完成
- [x] 检查 Wrangler 可用性（结论：未安装，建议 `npx wrangler`）
- [x] 检查 `wrangler.toml` 配置（端点/scope/无开关/无明文 secret）
- [x] 检查 Worker 路由（`/wps/oauth/start`、`/wps/oauth/callback`）
- [x] 检查 OAuth start/callback 与 Redirect URI 安全策略
- [x] 运行离线测试（9/9 通过）
- [x] 检查 Git 隔离与 HSE 生产 0 修改
- [x] 准备部署命令清单（见下）

### B. 业务方本人必须完成（WorkBuddy 不代执行、不索取 Secret）
1. **登录 Cloudflare**：`npx wrangler login`（浏览器授权）
2. **确认/创建 Worker**：账号内确认目标 Worker 名称（与 `wrangler.toml` 的 `name = "grid-mobile-cloudflare-worker"` 一致）
3. **配置 Cloudflare Secret**（仅命令，内容自填，勿告知 WorkBuddy）：
   ```
   npx wrangler secret put WPS_CLIENT_ID
   npx wrangler secret put WPS_CLIENT_SECRET
   ```
4. **填写真实 `WPS_REDIRECT_URI`**：编辑 `wrangler.toml` 第 17 行占位符，改为真实、可公网访问、且与 WPS 后台登记**完全一致**的地址：
   ```
   WPS_REDIRECT_URI = "https://<真实worker或pages子域>/wps/oauth/callback"
   ```
5. **WPS 开放平台创建/配置应用**：开启 OAuth2 用户授权、登记 Redirect URI、授权 `kso.user_base.read`、开启接口签名（APPID/APPKEY 与上方 Secret 对应）
6. **部署 Worker**：`npx wrangler deploy`
7. **完成真实 WPS 登录授权**：浏览器访问 `/wps/oauth/start` → WPS 授权 → 真实 callback → 真实 token → 真实 KSO-1 → 真实 `/v7/users/current` → 取得脱敏 `data.id`

> ⚠️ **绝不**要求业务方将 `WPS_CLIENT_SECRET` / `APPKEY` 粘贴到聊天窗口、文档或任何非 Cloudflare Secret 的位置。

---

## 12. 下一阶段进入条件（CF-WPS-03-B 真实联调）

满足**全部**以下条件后，重新进入真实联调（仍沿用 CF-WPS-03-B 判定标准）：

1. `npx wrangler whoami` 返回有效 Cloudflare 账号
2. `WPS_CLIENT_ID` / `WPS_CLIENT_SECRET` 已通过 `wrangler secret put` 注入
3. `WPS_REDIRECT_URI` 为真实公网地址，且与 WPS 后台登记 Redirect URI **完全一致**
4. WPS 应用已开启 OAuth2 用户授权、`kso.user_base.read` 已授权、接口签名已开启
5. `npx wrangler deploy` 成功，Worker URL 可公网访问
6. 浏览器 `/wps/oauth/start` 完成真实 WPS 登录授权，成功取得真实 `data.id`（脱敏记录）

进入后按 CF-WPS-03-B §六/§十一 记录脱敏结果，再判定 `PASS` 或维持 `BLOCKED_EXTERNAL_VALIDATION`。

---

### 停止条件确认

报告生成即停止。本阶段**未**部署真实 Worker、**未**执行真实 WPS OAuth、**未**请求用户提供 Secret、**未**进入 H5 开发、**未**进入 employee_id 映射、**未**进入 CF-WPS-04。等待业务方完成 Cloudflare / WPS 配置后，再执行真实 CF-WPS-03-B 联调。

---

*生成时间：2026-09-15（本机时间）*
*执行者：WorkBuddy（Agent 模式，遵循 CF-WPS-03-C 任务书）*
