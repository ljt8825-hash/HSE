# CF-WPS-03-B：真实 WPS OAuth + KSO-1 + /v7/users/current 联调报告

> 阶段性质：CF-WPS-03 的真实外部联调子阶段。
> 本阶段唯一目标：验证「真实 WPS OAuth → 真实 KSO-1 → 真实 /v7/users/current → 真实 WPS user_id」。
> 最终状态：**CF-WPS-03-B_STATUS = BLOCKED_EXTERNAL_VALIDATION**（非 PASS，非 READY_FOR_NEXT_STEP）。

---

## 1. 执行环境

| 项 | 值 |
|----|----|
| 工作目录 | `G:\hse-dashboard\grid-mobile-cloudflare\worker\`（隔离 POC 目录） |
| OS | Windows 10 / win32 |
| Shell | Git Bash（WorkBuddy 默认） |
| Node（仅离线测试） | 22.22.2-2（managed） |
| Cloudflare Wrangler | **未安装 / 未登录**（本环境 PATH 与 node_modules、global 均无 wrangler） |
| 网络 | 开发沙箱，**无公网可访问回调地址**（WPS 无法回跳到本机） |
| 真实 WPS 凭据 | **本环境无 `WPS_CLIENT_ID` / `WPS_CLIENT_SECRET`**（属业务方生产凭据，禁止写入本机文件/前端/日志） |

---

## 2. 前置配置检查（任务书 §三）

> 执行原则：先检查、不修改代码、不猜测、缺失即标记 BLOCKED 并列出缺失项。

| # | 检查项 | 结果 | 证据 |
|----|--------|------|------|
| 1 | Cloudflare Worker 是否可部署 | ❌ 否 | `wrangler` 不在 PATH；`node_modules/.bin/wrangler` 与 global 均无；`wrangler` 未登录 |
| 2 | Wrangler 是否已登录 | ❌ 否 | 同上，无法执行 `wrangler whoami` / `wrangler deploy` |
| 3 | `WPS_CLIENT_ID` 是否已配置 | ❌ 否 | 无 Cloudflare Secret；无 `.dev.vars`/`.env` 本地文件；凭据仅业务方持有 |
| 4 | `WPS_CLIENT_SECRET` 是否已配置 | ❌ 否 | 同 #3 |
| 5 | `WPS_REDIRECT_URI` 是否已配置 | ⚠️ 占位符 | `wrangler.toml` 中为 `https://<your-pages-or-worker-subdomain>/wps/oauth/callback`（非真实公网地址） |
| 6 | WPS 后台登记的 callback 与 Worker 是否一致 | ❓ 不可验证 | 无已部署 Worker、无真实 redirect，无法核对 |
| 7 | WPS 应用是否允许 `kso.user_base.read` | ❓ 不可验证 | 无 WPS 开放平台应用控制台访问权限 |
| 8 | WPS 应用是否允许用户 OAuth 授权 | ❓ 不可验证 | 同 #7 |
| 9 | 授权地址 = `https://openapi.wps.cn/oauth2/auth` | ✅ 代码侧就绪 | `index.js:34` `DEFAULT_AUTHORIZE_URL`；`wrangler.toml` `WPS_AUTHORIZE_URL` 一致 |
| 10 | Token 地址 = `https://openapi.wps.cn/oauth2/token` | ✅ 代码侧就绪 | `index.js:35` `DEFAULT_TOKEN_URL`；`wrangler.toml` `WPS_TOKEN_URL` 一致 |
| 11 | UserInfo 地址 = `https://openapi.wps.cn/v7/users/current` | ✅ 代码侧就绪 | `index.js:36` `DEFAULT_USERINFO_URL`；`wrangler.toml` `WPS_USERINFO_URL` 一致 |
| 12 | `/v7/users/current` 使用 `Bearer + KSO-1` | ✅ 代码侧就绪 | POC-03-A 已删除 `WPS_API_SIGNATURE` 开关，`index.js:273-287` 对 userinfo 强制附加 `X-Kso-Date` + `X-Kso-Authorization` |

**结论**：第 9–12 项（代码口径）已就位；第 1–8 项（真实外部联调所需的环境、凭据、平台权限、公网回调）在本环境均缺失或不可验证。按 §三「任意前置条件缺失 → 标记 BLOCKED_EXTERNAL_VALIDATION 并输出缺失项」，本阶段不进入真实 OAuth 执行。

---

## 3. WPS OAuth 实际结果

- **未执行真实 OAuth。**
- 原因：第 1–8 项前置条件缺失（无 wrangler/未登录、无真实 `WPS_CLIENT_ID/SECRET`、无真实公网 `WPS_REDIRECT_URI`、WPS 后台权限不可验证）。
- 未对 `https://openapi.wps.cn/oauth2/auth` 发起任何真实浏览器授权请求；未猜测授权页行为。

---

## 4. callback 实际结果

- **未执行。** `/wps/oauth/callback` 仅由 WPS 在用户授权后携带 `code` + `state` 回跳至已登记 `redirect_uri` 触发；本环境无已部署 Worker 与真实 `redirect_uri`，故无任何 callback 请求到达。
- 代码侧 `handleCallback`（`index.js:206-356`）已实现：`state` 服务端 cookie 双重提交校验、缺失 `code`/`state` 校验失败时返回 400、不回传任何 token。离线测试 T6 已覆盖 state 拒绝。

---

## 5. token exchange 实际结果

- **未执行真实 token 兑换。**
- 预期行为（代码侧，待真实联调验证）：`POST {WPS_TOKEN_URL}` 表单 `grant_type=authorization_code&client_id&client_secret&code&redirect_uri`，HTTP `application/x-www-form-urlencoded`，**不加 KSO-1**；响应按扁平 OAuth2 `{access_token, refresh_token, expires_in, token_type}` 解析（`index.js:94-127`）。
- 真实 `httpStatus` / `wpsCode` / `token_type` / `expires_in` / `refresh_token` 是否存在：待业务方联调后记录（禁止记录 token 值本身）。

---

## 6. KSO-1 实际结果

- **未执行真实 KSO-1 调用。**
- 算法（代码侧已就绪，待真机验证）：
  ```
  signStr   = "KSO-1" + METHOD + RequestURI + ContentType + KsoDate + sha256(RequestBody)
  signature = HMAC-SHA256(APPKEY=client_secret, signStr)
  请求头： X-Kso-Date: <RFC1123>
           X-Kso-Authorization: KSO-1 <APPID=client_id>:<signature>
  ```
- 仅附加于 `/v7/users/current`；token 端点不加（符合官方 OAuth2 标准）。
- 真机验证待业务方部署后确认：`signature` 是否使用 `client_secret` 作为 `secretKey`、`RequestURI` 是否含 query、`GET` body 是否为空、`X-Kso-Date` 是否有效、WPS 是否返回签名错误。

---

## 7. /v7/users/current 实际结果

- **未执行真实调用。**
- 代码侧请求头构成（`index.js:267-291`）：`Authorization: Bearer <access_token>` + `Content-Type: application/json` + `X-Kso-Date` + `X-Kso-Authorization`。
- 响应按 v7 `{code,msg,data}` 包裹解析（`unwrapV7`），取官方字段 `data.id / data.user_name / data.company_id / data.avatar`（`normalizeUser`，`index.js:143-151`）。
- 已实现对 401/403/签名错误/业务码非 0 的显式处理（保留真实 `httpStatus` + `wpsCode`，不泄露 token）（`index.js:308-328`）。
- 真实 `HTTP status` / `WPS code` / `data.*` 是否取得：待业务方联调。

---

## 8. 真实身份字段

- **未获取真实 WPS user_id。** 真实联调未执行。
- 代码侧最终判定（待真实返回后生效）：`REAL_WPS_USER_ID_FIELD = data.id`（以官方 `/v7/users/current` 返回为准）。
- 若真实返回 `data.id` 缺失：按 §八直接标记 `REAL_USER_ID_MAPPING = BLOCKED`，**不以** `openid`/`unionid`/`nickname`/`company_uid` 等未确认字段替代。
- 本阶段**不做** employee_id 映射、不写 PG、不修改任何生产表（§九）。

---

## 9. 安全检查

| 检查点 | 结果 |
|--------|------|
| 仓库内是否存在明文 `WPS_CLIENT_SECRET` 值 | ✅ 无（`grep` 扫描 `grid-mobile-cloudflare/` 全目录，未发现任何 `WPS_CLIENT_SECRET = "实际值"`） |
| 凭据存储介质 | ✅ 凭据仅经 `wrangler secret put` 注入 Cloudflare，绝不入 `index.js`/`wrangler.toml`/`package.json`/`test`/报告/Git |
| 浏览器响应是否含 token/secret | ✅ 代码层保证：成功响应仅返回脱敏 user 字段 + `security.accessTokenReturnedToBrowser=false`（`index.js:348-351`） |
| 日志/URL/query 是否泄露 token | ✅ 本环境未发起真实请求，无任何 token 经过日志/URL |
| 离线测试凭据泄露扫描 | ✅ T9 通过：所有 mock 响应均不含 `access_token`/`refresh_token`/`client_secret`/`APPKEY` |
| KSO-1 secretKey 来源 | ✅ 仅 `env.WPS_CLIENT_SECRET`（服务端 Secret），不暴露前端 |

---

## 10. git status（HSE 生产修改核对）

执行阶段前后均核对 `git status`：

- **本任务新增/修改范围（隔离目录）**：仅 `grid-mobile-cloudflare/worker/`（未跟踪，与 HSE 生产无交集）。
- **HSE 生产文件修改计数（本任务所致）= 0**。
  - 说明：仓库当前存在 `server/`、`docs/191副/` 等多处已修改文件，均属**此前会话**遗留（与本任务无关，本任务未触碰任何 tracked 生产文件）。
- `grid-mobile-cloudflare/` 在 git 中显示为 `??`（未跟踪），确认其完全隔离于生产代码基线。

---

## 11. 是否修改 HSE 生产代码

- **否。**
- 未修改：HSE 登录、JWT、权限、用户中心、`employee_id`、`authenticatedEmployeeResolver`、`grid_inspection_records`、`grid_record_sync_map`、WPS→PG 同步、PC 网格长巡查台账、三违台账、任何正式 HSE API/前端。
- 本任务仅就 `grid-mobile-cloudflare/worker/` 做**只读核对 + 离线测试**，未对该目录做任何代码改动（代码已在 POC-03-A 定型，本阶段无需修改以绕过任何缺项）。

---

## 12. 最终状态

```
CF-WPS-03-B_STATUS = BLOCKED_EXTERNAL_VALIDATION
```

### 缺失项清单（需业务方/平台侧补齐后方可联调）

1. **安装并登录 Wrangler**（本环境缺失）：`npm i -g wrangler` 或 `npx wrangler` + `wrangler login`。
2. **配置 Cloudflare Secret**（本环境缺失，且禁止明文落盘）：
   - `wrangler secret put WPS_CLIENT_ID`
   - `wrangler secret put WPS_CLIENT_SECRET`（= KSO-1 的 `APPKEY`）
3. **填写真实 `WPS_REDIRECT_URI`**：将 `wrangler.toml` 中占位符 `https://<your-pages-or-worker-subdomain>/wps/oauth/callback` 改为真实、可公网访问、且与 WPS 应用后台登记的 `redirect_uri` **完全一致** 的地址。
4. **WPS 开放平台应用侧确认**（本环境不可验证）：
   - 应用已开启 OAuth2 用户授权；
   - 已授予 `kso.user_base.read` scope；
   - 后台登记的 callback/redirect_uri 与 #3 一致。
5. **真实联调执行**：`wrangler deploy` → 浏览器访问 `/wps/oauth/start` → 完成 WPS 登录授权 → 真实回调 → 真实 token → 真实 KSO-1 → 真实 `/v7/users/current` → 记录脱敏 `data.id`。

### 成功标准（§十一）当前满足情况

| 项 | 状态 |
|----|------|
| Cloudflare Worker 成功部署 | ❌ 未部署（缺失项 1、3） |
| WPS OAuth 授权成功 | ❌ 未执行（缺失项 2、4） |
| callback 成功 | ❌ 未执行 |
| state 校验成功 | ⚠️ 代码就绪，未真实验证 |
| code 兑换 token 成功 | ❌ 未执行 |
| token 响应正确解析 | ⚠️ 代码就绪，未真实验证 |
| access_token 未泄露 | ✅ 代码层 + 离线测试保证 |
| refresh_token 未泄露 | ✅ 同上 |
| /v7/users/current 调用成功 | ❌ 未执行 |
| Bearer 正确 | ⚠️ 代码就绪 |
| KSO-1 正确 | ⚠️ 代码就绪 |
| HTTP status 正常 | ❌ 未执行 |
| WPS code = 0 | ❌ 未执行 |
| data.id 取得 | ❌ 未执行 |
| data.user_name 取得 | ❌ 未执行 |
| 真实 user_id 已脱敏记录 | ❌ 未执行 |
| HSE production modified = 0 | ✅ 本任务 0 修改 |

→ 因存在未满足项，**不标记 PASS**。

---

## 13. 停止与后续

- 本阶段至报告生成即停止，**不进入 CF-WPS-04**，不开发静态 H5 / Worker 正式业务 API / 照片上传 / WPS→PG / employee_id 映射。
- 待业务方完成 §12 缺失项 1–5 后，重新进入「真实联调」执行，按 §六记录脱敏结果，再判定 `PASS`。
- POC Worker 代码保留于 `grid-mobile-cloudflare/worker/`，供后续阶段复用（未擅自删除）。

---

### 附：离线代码层验证（非真实联调替代证据）

- 运行：`node test/oauth-flow.test.mjs`
- 结果：**9 项全部通过**（T1 KSO-1 签名交叉校验 / T2 start+scope / T3 token 请求体 / T4 userinfo 强制 KSO-1 头 / T5 解析 / T6 state 校验 / T7 token 错误 / T8 userinfo 401·403·签名错误 / T9 安全无泄露 + 解析单元）。
- 说明：此为代码层离线验证，证明接口口径（端点、scope、KSO-1 算法、解析、安全脱敏）正确；**不等于真实 WPS 联调成功**，故不替代 `BLOCKED_EXTERNAL_VALIDATION` 判定。

---

*报告生成时间：2026-09-15（本机时间）*
*执行者：WorkBuddy（Agent 模式，遵循 CF-WPS-03-B 任务书）*
