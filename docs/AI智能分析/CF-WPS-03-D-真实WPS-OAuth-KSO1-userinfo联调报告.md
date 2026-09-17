# CF-WPS-03-D 真实 WPS OAuth / KSO-1 / userinfo 联调报告

> 阶段定位：CF-WPS-03-A PASS → CF-WPS-03-B BLOCKED_EXTERNAL_VALIDATION → CF-WPS-03-C READY_FOR_BUSINESS_SETUP → **本阶段 CF-WPS-03-D**
> 任务目标：在真实 Cloudflare Worker 环境中完成 WPS OAuth2 用户授权 → code 换 token → KSO-1 → `/v7/users/current`，取得真实 WPS `user_id`。
> 严格范围：仅允许操作 `grid-mobile-cloudflare/worker/` 与本报告；禁止修改任何 HSE 生产代码、登录/JWT/权限、`employee_id`、`authenticatedEmployeeResolver`、WPS→PG 同步、PostgreSQL、正式 H5/API；禁止向用户索取任何 Secret / token。

---

## 1. 阶段目标

证明 `grid-mobile-cloudflare/worker` 可以在**真实 Cloudflare Worker 环境**中完成：

```
浏览器 /wps/oauth/start
  → WPS OAuth 授权页（人工登录授权）
  → /wps/oauth/callback?code=...&state=...
  → 服务端 /oauth2/token 换 access_token
  → KSO-1 签名
  → GET /v7/users/current
  → 真实 WPS data.id / user_name / company_id / avatar
```

并额外审计 `AUTH_SESSION_STATUS`（§九）。

---

## 2. 环境

| 项 | 检测命令 | 结果 |
|----|----------|------|
| Node | `node --version` | v22.22.2 |
| npm / npx | `npm --version` / `npx --version` | 10.9.7 / 10.9.7 |
| Wrangler 可用性 | `npx -y wrangler@latest --version` | **wrangler 4.131.2**（可经 npx 拉起） |
| **Cloudflare 登录态** | `npx -y wrangler@latest whoami` | **未认证**：`You are not authenticated. Please run wrangler login.` |
| Cloudflare 凭据文件 | `ls ~/.cloudflare`、`ls ~/.config/.wrangler` | **均不存在** |
| Cloudflare 环境变量 | `env \| grep -iE "cloudflare\|CF_API\|WRANGLER"` | **无任何 CF 变量** |
| WPS_SECRET 本地文件 | `ls .dev.vars .env .env.local` | 无（凭据仅经 `wrangler secret`，正确） |

**结论**：本执行环境（WorkBuddy 沙箱）**未持有业务方的 Cloudflare 登录态**，也**无任何 WPS 凭据**。业务方宣称"已完成 Cloudflare / WPS 配置"，但配置存在于业务方本机，未映射到本沙箱。

---

## 3. Cloudflare 登录结果

- `npx wrangler whoami` → **失败**，原因：本环境未认证。
- 无 `CF_API_TOKEN`、无 `~/.cloudflare` 凭据缓存。
- 因此本沙箱**无法执行 `wrangler deploy`**（会直接报 `not authenticated`）。

> 说明：即便能拉起 wrangler，部署也需真实 Cloudflare 账号与已配置的 `WPS_CLIENT_ID`/`WPS_CLIENT_SECRET` Secret；二者在本环境均缺失。

---

## 4. Worker 部署结果

**未执行部署。**

按 §四，部署前置条件为：

| 前置项 | 要求值 | 本环境实际 |
|--------|--------|-----------|
| WPS_AUTHORIZE_URL | `https://openapi.wps.cn/oauth2/auth` | ✅ 已满足（代码默认） |
| WPS_TOKEN_URL | `https://openapi.wps.cn/oauth2/token` | ✅ 已满足（代码默认） |
| WPS_USERINFO_URL | `https://openapi.wps.cn/v7/users/current` | ✅ 已满足（代码默认） |
| WPS_SCOPE | `kso.user_base.read` | ✅ 已满足（wrangler.toml） |
| **WPS_REDIRECT_URI** | 真实公网 callback URL | ❌ **仍为占位符** `https://<your-pages-or-worker-subdomain>/wps/oauth/callback` |
| **WPS_CLIENT_ID / SECRET** | 已 `wrangler secret put` | ❌ **本环境未配置** |
| **Cloudflare 登录态** | 已 `wrangler login` | ❌ **未认证** |

依据 §十一（失败处理），任意前置缺失即不得绕过——故**未执行部署**，不伪造成功。

---

## 5. OAuth `/wps/oauth/start` 结果

- **代码层**：`handleStart(env)`（`index.js:179`）生成 `crypto.randomUUID()` 的 `state`，重定向到 `{WPS_AUTHORIZE_URL}?client_id&response_type=code&redirect_uri&scope=kso.user_base.read&state`，并下發 `HttpOnly; Secure` 的 `wps_oauth_state` cookie。
- **真实执行**：未执行（无 Cloudflare 部署、无公网 Worker、需人工登录 WPS）。
- 离线测试 T2 已确认重定向构造与 scope 正确，但**不等于真实 WPS 授权成功**。

---

## 6. OAuth `/wps/oauth/callback` 结果

- **代码层**：`handleCallback()`（`index.js:206`）校验 `code` + cookie `wps_oauth_state` 双重提交；通过后向 `/oauth2/token` POST 换 token。
- **真实执行**：未执行（前置阻塞，见 §3/§4）。
- 离线测试 T6 已确认 state 校验生效。

---

## 7. Token 结果（仅脱敏）

- **真实 token 换领：未执行**（无 Secret、无回调 code）。
- 代码解析逻辑（T3/T5 离线验证）：`parseTokenResponse()` 按 OAuth2 扁平结构解析 `access_token`/`refresh_token`/`expires_in`/`token_type`；失败按 `{code,msg}` 诊断。
- 按 §六纪律，**本报告不记录任何 access_token / refresh_token / client_secret / APPKEY**。
- 若真实执行，将仅记录：`token_received` / `refresh_token_received` / `expires_in` / `token_type`，绝不记录 token 原文。

---

## 8. KSO-1 结果

- **代码层**：`buildKso1Headers()` + `kso1Signature()`（`index.js:74-88`）实现官方算法：
  ```
  signStr = "KSO-1" + METHOD + RequestURI + ContentType + KsoDate + sha256(RequestBody)
  sig     = HMAC-SHA256(secretKey=APPKEY, signStr)
  头      = X-Kso-Date: <RFC1123>
             X-Kso-Authorization: KSO-1 <APPID>:<sig>
  ```
  `/v7/users/current` 调用**固定** `Bearer + KSO-1`（POC-03-A 起删除开关），`token` 端点不加 KSO-1。
- **真实执行**：未执行（无 access_token、无 WPS 真机请求）。
- 离线测试 T1（Web Crypto vs Node crypto 交叉校验）、T4（userinfo 头始终含 `Authorization`+`X-Kso-Date`+`X-Kso-Authorization`）已确认实现正确。

---

## 9. `/v7/users/current` 结果（仅脱敏）

- **真实请求：未执行**。
- 代码解析（T5 离线验证）：`unwrapV7()` 处理 `{code,msg,data}` 包裹，`normalizeUser()` 仅取官方字段 `id`/`user_name`/`company_id`/`avatar`（容错仅限 `user_id`/`userName`/`companyId` 同义命名）。
- 401/403/签名错误显式处理（T8 离线验证）：保留真实 `httpStatus` + `wpsCode`，不泄露 token。
- 若真实执行，将仅记录：`userinfo_http_status` / `userinfo_wps_code` / `wps_user_id_present` / `wps_user_id_length` / `wps_user_id_fingerprint`（不可逆脱敏摘要），**不记录完整 user_id**。

---

## 10. 真实 WPS user_id 是否取得

- **未取得**。本阶段未进行真实 WPS 调用，未获取任何 `data.id`。
- 依据 §八，即便取得也**不**在本阶段做 `wps_user_id → employee_id` 映射。

---

## 11. AUTH_SESSION_STATUS（§九 重点审计）

审计 `index.js` 回调实现：

- `handleCallback` 在拿到 userinfo 后，直接将脱敏 user（`id`/`userName`/`companyId`/`avatarReceived`）以 JSON 响应返回。
- **全程未设置任何登录态 Session Cookie**；`access_token`/`refresh_token` 在响应中被显式丢弃（不返回浏览器、不持久化）。
- 后续 Worker 请求**无法识别"当前 WPS user_id"**——每次都需重新走完整 OAuth。

```
AUTH_SESSION_STATUS = NOT_IMPLEMENTED
```

按 §九/§十：此状态**不阻止**本阶段 OAuth 链路的 PASS 判定（若在真实环境下链路跑通），但会作为进入"正式 Worker 业务 API"前的**前置设计项**被记录。

---

## 12. 安全检查

| 检查项 | 结果 |
|--------|------|
| 响应体含 `access_token` / `refresh_token` | ❌ 无（代码审计 + T9 离线） |
| 响应体含 `client_secret` / 明文 `APPKEY` | ❌ 无 |
| 仓库内明文 `WPS_CLIENT_SECRET` | ❌ 无（`grep` 全目录扫描） |
| 凭据注入方式 | ✅ 仅 `wrangler secret`，不落盘代码 |
| `WPS_REDIRECT_URI` 是否浏览器可注入 | ✅ 仅取自 `env`，无开放重定向 |
| `state` 校验 | ✅ 服务端 `crypto.randomUUID()` + cookie 双重提交 |
| token 端点是否误加 KSO-1 | ✅ 不加（T3） |
| userinfo 是否强制 Bearer+KSO-1 | ✅ 强制（T4） |

---

## 13. HSE 生产代码修改统计

- **本任务对 HSE 生产代码修改数 = 0**。
- 本任务仅读取 `grid-mobile-cloudflare/worker/`（隔离、未跟踪目录），未写入任何 `server/`、``安全看板vben/``、登录/JWT/权限/employee/WPS→PG 等文件。
- 注意：仓库工作树中另有大量 `M server/...`、`M 安全看板vben/...`、`M docs/...` 的**既有修改**，属其他阶段遗留，**非本任务产生**；依 §十一（CF-WPS-03-C）/§二纪律，本任务不处理、不 reset、不覆盖这些文件。

---

## 14. Git 状态

- `git status --short -- grid-mobile-cloudflare/` → `?? grid-mobile-cloudflare/`（整个 POC 目录为**未跟踪**，完全隔离，不污染生产提交）。
- `git status --short`（全仓）显示 40+ 既有 `M` 文件，均为其他工作遗留，与本任务无关。
- 本任务未新增任何对生产跟踪文件的改动。

---

## 15. 问题与风险

1. **Cloudflare 未认证（本环境）**：`wrangler whoami` 报未登录；本沙箱无业务方 Cloudflare 凭据。
2. **WPS_SECRET 未配置（本环境）**：`WPS_CLIENT_ID`/`WPS_CLIENT_SECRET` 未 `wrangler secret put`，无法换 token。
3. **WPS_REDIRECT_URI 占位符**：`wrangler.toml` 仍为 `<your-pages-or-worker-subdomain>`，无真实公网 callback，即便部署 WPS 也无法回跳。
4. **OAuth 需人工浏览器登录授权**：`/wps/oauth/start → WPS 授权页` 必须由真人完成 WPS 登录与授权点击，沙箱无法自动化。
5. **AUTH_SESSION_STATUS = NOT_IMPLEMENTED**：当前 callback 不建立持久登录态，是进入正式 Worker 业务 API 前必须补的设计项。
6. **"业务方已完成配置"与沙箱证据不符**：任务书序言称业务方已配置，但本执行环境实测三项关键前置均缺失——配置在业务方本机，未映射到本沙箱。真实联调必须在业务方本机或其已登录 Cloudflare 的环境执行。

---

## 16. 下一阶段建议

在进入 CF-WPS-04 或任何正式 Worker 业务 API 之前，业务方需在其**已登录 Cloudflare 的本机环境**完成：

1. `npx wrangler login`（确认 `whoami` 成功）
2. `npx wrangler secret put WPS_CLIENT_ID` / `WPS_CLIENT_SECRET`（仅命令形式，绝不粘贴内容）
3. 将 `wrangler.toml` 的 `WPS_REDIRECT_URI` 改为真实公网 Worker URL，并与 WPS 开放平台后台登记的 Redirect URI **完全一致**
4. WPS 后台：开启 OAuth2 用户授权、授权 scope `kso.user_base.read`、开启接口签名（APPID↔WPS_CLIENT_ID、APPKEY↔WPS_CLIENT_SECRET）
5. `npx wrangler deploy` → 浏览器访问 `/wps/oauth/start` 完成真实授权 → 本阶段判定方可转为 PASS

**前置设计项**：补充 `AUTH_SESSION_STATUS` 的正式实现（登录态 Session Cookie / 短期 token 缓存），否则每次请求都需重走 OAuth。

---

## 17. 最终状态

```
CF-WPS-03-D_STATUS = BLOCKED_EXTERNAL_VALIDATION
AUTH_SESSION_STATUS = NOT_IMPLEMENTED
```

**说明**：本阶段**未**完成真实 WPS OAuth / KSO-1 / `/v7/users/current` 联调，原因是本执行环境不具备三项关键前置（Cloudflare 未认证、WPS Secret 未配置、WPS_REDIRECT_URI 占位符），且真实授权需人工浏览器登录。依据 §十一，未猜测、未绕过、未伪造成功。代码层口径与离线测试（9/9）均为 PASS，但最终状态**不得**写为 PASS / READY_FOR_NEXT_STEP。

待业务方在其已登录 Cloudflare 的本机完成 §16 步骤后，重新进入真实联调，再判定 CF-WPS-03-D 是否 PASS。

---
*本任务未进入 CF-WPS-04，未开发正式 H5 / Worker 业务 API / employee_id 映射 / 照片上传 / WPS 业务写入。*
