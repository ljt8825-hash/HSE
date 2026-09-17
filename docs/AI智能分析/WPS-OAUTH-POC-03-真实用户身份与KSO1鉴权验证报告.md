# WPS-OAUTH-POC-03：真实 WPS 用户身份与 KSO-1 鉴权闭环验证报告

> 报告生成时间：2026-09-15
> 阶段定位：POC（仅修改 `grid-mobile-cloudflare/worker/` 内 POC 代码与测试，不接入生产 HSE 登录/JWT/账号体系/数据库）
> 最终状态：**BLOCKED_EXTERNAL_VALIDATION**

---

## 1. 阶段目标

验证 WPS OAuth 真实接口鉴权闭环：

```
浏览器
  ↓
Cloudflare Worker POC
  ↓
WPS OAuth 用户授权
  ↓
authorization code
  ↓
access_token
  ↓
KSO-1 签名（按需）
  ↓
GET /v7/users/current
  ↓
真实 WPS user_id / user_name / company_id / avatar
```

核心诉求（任务书 §三～§四）：**不盲信 POC-02 的 endpoint 与"Bearer 即可、无需 KSO-1"结论**，以当前 WPS 官方开放平台文档 + 实际接口返回 + 本项目生产 `server/services/wpsClient.js` 交叉核对为准，修正错误并补齐 KSO-1 能力。

---

## 2. POC 范围

允许修改范围：`grid-mobile-cloudflare/worker/`（POC 代码 + 测试代码）。
禁止范围（任务书 §二，0 修改）：HSE 登录系统、JWT、权限体系、用户中心、`employee_id`、`authenticatedEmployeeResolver`、`grid_inspection_records`、WPS→PG 同步、现有网格长巡查台账、三违台账、正式移动 H5、正式 WPS 写入接口、WPS→员工映射表、按姓名/手机/昵称猜测员工身份。
禁止泄露：`access_token` / `refresh_token` / `client_secret` 不写入前端、日志、数据库、报告、Git、浏览器响应、`console.log`。

---

## 3. 实际修改文件

| 文件 | 修改类型 | 关键变更 |
|---|---|---|
| `grid-mobile-cloudflare/worker/index.js` | 重写 | ① 端点修正：授权 `oauth2/auth` + token `oauth2/token`（表单 `client_id`/`client_secret`），废弃 POC-02 的 `oauthapi/v1/oauth2/token` + `app_id`/`app_key`；② 新增纯函数 `kso1Signature()`（Web Crypto HMAC-SHA256）与 `buildKso1Headers()`；③ token 与 userinfo **分开解析**（token=扁平 OAuth2，userinfo=v7 `{code,msg,data}` 包裹）；④ KSO-1 仅用于 `/v7/users/current`，且仅当 `WPS_API_SIGNATURE='true'` 时附加；⑤ 响应脱敏（无 token/secret） |
| `grid-mobile-cloudflare/worker/wrangler.toml` | 更新 | 新增 `WPS_AUTHORIZE_URL`/`WPS_TOKEN_URL`/`WPS_USERINFO_URL`/`WPS_API_SIGNATURE` 公开 Var；注释说明端点已按官方文档核对；Secret 仍仅 `WPS_CLIENT_ID`/`WPS_CLIENT_SECRET` |
| `grid-mobile-cloudflare/worker/package.json` | 更新 | 更新 description |
| `grid-mobile-cloudflare/worker/test/oauth-flow.test.mjs` | 重写 | 7 项离线测试：KSO-1 签名交叉校验、start 端点构造、token 请求体校验、callback 完整流程、KSO-1 条件附加、state 校验、token 错误诊断、解析单元 |

> ⚠️ 所有 WPS 凭据（APPID/APPKEY）仅在 `env`（Cloudflare Secret/Var）中存在，代码中零明文。本报告不输出任何真实 `access_token` / `refresh_token` / `client_secret` / KSO-1 secret。

---

## 4. 未修改的 HSE 生产文件

- `server/app.js`、`server/services/wpsClient.js`、`server/services/wpsGridSyncService.js`、`server/services/wpsGridPullEngine.js`、`server/services/wps/wpsFieldMap.js`、`server/routes/wps-grid-sync.js`、`server/routes/wps-dbsheet.js`
- `authenticatedEmployeeResolver.js`、登录/JWT/权限中间件、`grid_inspection_records` 相关 schema 与迁移
- 三违台账、WPS→PG 同步逻辑、前端 `安全看板vben` 代码
- 本仓库 git 跟踪的生产代码 **0 修改**（所有变更仅在隔离的 `grid-mobile-cloudflare/worker/` 目录）

---

## 5. WPS 官方接口核对结果（任务书 §三）

以 `open.wps.cn` 官方文档 + 本项目生产 `wpsClient.js` 交叉核对，发现 **POC-02 的端点结论错误，已修正**：

| 项 | POC-02 结论（错误） | 当前官方结论（已核对） | 依据 |
|---|---|---|---|
| OAuth token 地址 | `https://openapi.wps.cn/oauthapi/v1/oauth2/token` | `https://openapi.wps.cn/oauth2/token` | WPS 365 官方「获取用户 access_token」文档 + 生产 `wpsClient.js`（`POST {base}/oauth2/token`） |
| token 参数 | `app_id` / `app_key` | `client_id` / `client_secret`（`grant_type=authorization_code`） | 同上 |
| token 请求方法 | POST（form） | POST（`application/x-www-form-urlencoded`） | 同上 |
| token 响应结构 | 假设 `{code:0,data:{...}}` | **扁平 OAuth2** `{access_token, expires_in, refresh_token, token_type}`（失败 `{code:int,...}`） | WPS 365 官方文档「接口成功/失败响应体」 |
| 用户接口包裹 | 假设统一 `{code,msg,data}` | 仅 v7 **数据类**接口为 `{code,msg,data}`；OAuth2 token 端点**不是**该包裹 | 生产 `wpsClient.js` 仅对 v7 数据接口判定 `json.code !== 0`；OAuth token 直接读 `json.access_token` |

> 关键纠正：**不能假设所有 WPS API 返回统一 `{code,data}` 包裹**。OAuth2 的 `/oauth2/token` 是标准 OAuth2 扁平 JSON；`/v7/users/current` 属 v7 数据接口，才是 `{code,msg,data}` 包裹。本 POC-03 已分别处理（见 §8、§15）。

授权地址（authorize）说明：任务书指定 `https://openapi.wps.cn/oauth2/auth`。官方 WPS 365 文档的 token 页仅标注"查看获取 code 的方法"未直接给出 authorize URL；同族/旧版文档出现 `oauthapi/v2/authorize`、私有化版本出现 `oauth2/authorize`。本 POC 以任务书指定的 `oauth2/auth` 为默认，并**做成可配置 Var `WPS_AUTHORIZE_URL`**，待业务方按实际 WPS 365 应用登记地址最终确认（见 §17）。

---

## 6. OAuth endpoint 核对结果

- **授权（authorize）**：`GET {WPS_AUTHORIZE_URL}?client_id=<APPID>&response_type=code&redirect_uri=<回调>&scope=<权限>&state=<state>`。
  - 参数名使用 **`client_id`**（非 POC-02 的 `app_id`）。
  - `state` 由 Worker `crypto.randomUUID()` 生成，经 `Set-Cookie: wps_oauth_state=...; HttpOnly; Secure; SameSite=Lax` 下发；callback 时比对 cookie 与 query（双重提交 cookie 防 CSRF）。
- **授权地址默认值**：`https://openapi.wps.cn/oauth2/auth`（任务书指定，可经 `WPS_AUTHORIZE_URL` 覆盖）。

---

## 7. token endpoint 核对结果

- **地址**：`POST https://openapi.wps.cn/oauth2/token`（已修正 POC-02 的 `oauthapi/v1/oauth2/token`）。
- **请求头**：`Content-Type: application/x-www-form-urlencoded`。
- **请求体**（表单）：`grant_type=authorization_code&client_id=<APPID>&client_secret=<APPKEY>&code=<code>&redirect_uri=<回调>`。
- **成功响应**（扁平 OAuth2，已按官方文档核对）：
  ```json
  { "access_token": "...", "expires_in": 7200, "refresh_token": "...", "refresh_expires_in": "...", "token_type": "Bearer" }
  ```
- **失败响应**：`{ "code": <int>, ... }`（错误码）。
- 解析逻辑：`parseTokenResponse()` 优先取扁平 `access_token`；兼容旧版 `{result:0, token:{...}}` 嵌套；失败返回 `wpsCode`/`wpsMsg` 供诊断。**token 请求不附加任何 KSO-1 签名**（OAuth2 标准）。

---

## 8. `/v7/users/current` 鉴权方式

- **地址**：`GET {WPS_USERINFO_URL}`（默认 `https://openapi.wps.cn/v7/users/current`，可经 `WPS_USERINFO_URL` 覆盖）。
- **请求头**：
  - `Authorization: Bearer <access_token>`（必填，用户级令牌）。
  - `Content-Type: application/json`。
  - 当 `WPS_API_SIGNATURE='true'`（开发者后台「接口签名」开启）时，附加 `X-Kso-Date` + `X-Kso-Authorization`（KSO-1）；否则仅 Bearer。
- **响应解析**：v7 数据接口包裹 `{code:0, msg:"success", data:{ id, user_name, company_id, avatar }}`；先 `unwrapV7()` 取 `data` 层，再 `normalizeUser()` 归一化（兼容 `user_id`/`openid`/`unionid`、`user_name`/`nickname`、`company_id`/`company_uid`）。

> ⚠️ 该「当前用户」接口的确切路径以 WPS 365 应用实际授予的 scope 与官方文档为准；本 POC 采用任务书指定的 `/v7/users/current`，并在 `WPS_USERINFO_URL` 中可配置，待业务方按真实应用确认。

---

## 9. KSO-1 实现情况（任务书 §四）

**官方算法（已核对，且与生产 `wpsClient.js` 的 `kso1Sign` 完全一致）**：

```
signStr = "KSO-1" + METHOD + RequestURI + ContentType + KsoDate + sha256(RequestBody)
sig     = HMAC-SHA256(secretKey = APPKEY, signStr)
请求头：X-Kso-Date: <RFC1123>
        X-Kso-Authorization: KSO-1 <APPID>:<sig>
```

实现要点：
- **纯函数 `kso1Signature({method, uri, contentType, ksoDate, bodyStr, secretKey})`**：用 Worker 原生 Web Crypto（`crypto.subtle.importKey` + `crypto.subtle.sign('HMAC', …, SHA-256)` + `crypto.subtle.digest('SHA-256', …)`），**不引入任何第三方 npm 依赖**。
- **`buildKso1Headers(...)`**：生成完整 KSO-1 请求头（取当前 RFC1123 时间）。
- **仅用于 `/v7/users/current`**：token 交换（OAuth2）不附加 KSO-1。
- **按需开关**：仅当 `WPS_API_SIGNATURE='true'` 时附加（与本项目生产 `WPS_API_SIGNATURE` 默认 `false` 一致）。
- **不建立新签名框架**：KSO-1 逻辑内聚于 2 个纯函数，专供本 POC 的 userinfo 调用。

关于 POC-02 的"Bearer 即可、无需 KSO-1"结论：官方文档明确 KSO-1 仅在开发者后台开启「接口签名」时才需要。因此该结论在"接口签名未开启"时成立，但属**不完整的默认态**。本 POC-03 将其补全为"默认 Bearer-only + 能力就绪的条件 KSO-1"，既符合生产默认，又能在应用开启签名时正确鉴权。

---

## 10. 真实浏览器 OAuth 测试结果

**未执行（真实联调待业务方完成）**。

本环境无 WPS 真实 `client_id`/`client_secret`、无可公开访问的回调地址、无 Cloudflare 部署，无法代替业务方完成「浏览器 → WPS 登录 → 授权 → 回调」真实往返。真实联调前置条件（任务书 §六）需业务方在 Cloudflare 配置：

```
WPS_CLIENT_ID     # wrangler secret put
WPS_CLIENT_SECRET # wrangler secret put
WPS_REDIRECT_URI # 须与 WPS 开放平台应用登记的回调一致
WPS_SCOPE        # 应用已开通的用户信息权限
```

配置完成后由业务方执行 `wrangler deploy` 并浏览器访问 `/wps/oauth/start` 完成真实 OAuth。本 POC 代码层已就绪。

---

## 11. 真实 WPS user_id 结果

**未取得（待真实联调）**。代码层能正确从 v7 `{code,msg,data}` 包裹解析 `id`/`user_name`/`company_id`/`avatar`（见 §15 离线验证），但真实 `user_id` 须真实 WPS 授权后取得。

---

## 12. scope 结果

- 默认 `scope = kso.user_current.read`（可经 `WPS_SCOPE` 覆盖）。
- **待业务方确认**：WPS 365 应用实际已开通的"获取用户信息"权限 scope 名称须与之一致（不同 WPS 产品线 scope 命名可能不同：旧版用 `user_info`，WPS 365 可能用 `kso.user_current.read` 等）。真实联调时以应用授权范围为准；若 scope 不匹配，`/oauth2/token` 或 `/v7/users/current` 会返回权限错误（见 §13 错误处理预案）。

---

## 13. 错误码及处理（任务书 §八）

代码已内建错误分支，且**严禁用 mock 绕过真实错误**：

| 失败环节 | 代码行为 | 记录内容（脱敏） |
|---|---|---|
| callback 缺 code / state 不匹配 | 返回 400，`stateVerified:false` | 不泄露 token |
| `/oauth2/token` 失败（如 `code:40001 invalid authorization code`） | 返回 502，带回 `httpStatus` + `wpsCode` + `message` | 不泄露 token/secret |
| `/v7/users/current` 返回 401/403/签名错误/权限不足/`InvalidToken`/`InsufficientScope` | 返回 502，带回 `httpStatus` + `wpsCode` + `message` + `kso1Applied` | 不泄露 token/secret |

若真实联调出现上述错误，将**保留真实 HTTP 状态码、WPS `code`、`msg`**，并分析 `scope` / `Authorization` / `X-Kso-Date` / `X-Kso-Authorization` / 签名原文与算法；报告中**不输出密钥或 token**。不会删除 KSO-1、不会降级为 Bearer-only、不会猜测 scope 或用户字段、不会用姓名替代身份。

---

## 14. 安全检查

- ✅ `WPS_CLIENT_ID` / `WPS_CLIENT_SECRET`：仅存在于 `env`（Cloudflare Secret/Var），代码零明文；报告不输出真实值。
- ✅ `access_token` / `refresh_token`：绝不写入响应体、日志、数据库、Git、浏览器、`console.log`；响应体含 `security.accessTokenReturnedToBrowser:false`。
- ✅ KSO-1 `secretKey`（=APPKEY）仅服务端用于签名计算，绝不回传。
- ✅ 未修改任何 HSE 生产文件（§4）。
- ✅ 未新增任何 npm 依赖（KSO-1 用 Worker 原生 Web Crypto）。
- ✅ 未把 WPS OAuth 接入生产登录（本 POC 不绑定 `employee_id`、不写库、不建映射表）。
- ✅ 未用 mock 数据替代真实 WPS 验证（§10–§11 如实标注 PENDING）。
- ⚠️ `state` 校验当前用 HttpOnly Cookie 承载（双重提交 cookie 模式，真实 CSRF 防护）。正式生产接入前建议将 state 改存服务端会话/缓存以形成完整闭环（与 POC-02 一致的建议，本阶段未变更）。

---

## 15. mock 测试结果（代码层离线验证）

> 说明：以下为 **Node 离线确定性测试**，通过覆盖 `globalThis.fetch` 模拟 WPS 响应，真实驱动 Worker 的 `fetch` 处理函数。共 **7 项全部通过**。

| # | 测试项 | 结果 |
|---|---|---|
| T1 | KSO-1 签名算法正确性（Web Crypto 实现 vs Node `crypto` 独立参考实现交叉校验；64 位十六进制；对 body/ksoDate 输入敏感） | ✅ |
| T2 | `/wps/oauth/start` 重定向构造：使用 `client_id`（非 `app_id`）、含 `response_type/redirect_uri/scope/state` | ✅ |
| T3 | callback 完整流程：token 请求体含 `client_id`/`client_secret`/`grant_type=authorization_code`、无 `app_id`/`app_key`、无 KSO-1；userinfo 从 v7 `{code,data}` 正确解析 `id/user_name/company_id/avatar`；响应无 token/secret | ✅ |
| T4 | `WPS_API_SIGNATURE=true` 时 KSO-1 仅附加到 userinfo：`X-Kso-Date` 为 RFC1123、`X-Kso-Authorization` 格式 `KSO-1 <APPID>:<64hex>`、APPID=client_id；token 调用仍无 KSO-1 | ✅ |
| T5 | state 校验失败 → 400，`stateVerified:false` | ✅ |
| T6 | token 错误码 `code:40001` → 502 诊断带回 `wpsCode`，不泄露 token/secret | ✅ |
| T7 | 解析单元：`parseTokenResponse`（扁平/旧版嵌套/失败）、`unwrapV7`、`normalizeUser` | ✅ |

运行命令与结果：
```
cd grid-mobile-cloudflare/worker
node test/oauth-flow.test.mjs
→ 离线测试全部通过：7 项
```

---

## 16. 真实联调结果

**PENDING（待业务方完成 Cloudflare 部署 + 真实 OAuth 往返）**。

未执行真实浏览器 OAuth、未真实调用 `openapi.wps.cn` 生产接口。代码层（§15）已验证端点构造、KSO-1 签名算法、解析与脱敏逻辑全部正确。

---

## 17. 是否存在生产阻塞

- **代码层**：无阻塞。端点、KSO-1、解析、安全脱敏均已实现并通过离线测试。
- **真实验证阻塞（外部）**：需业务方完成 Cloudflare Secret 配置、`wrangler deploy`、以及可公开访问的回调地址，并确认：
  1. 授权地址（`oauth2/auth` vs `oauth2/authorize` vs `oauthapi/v2/authorize`）以应用登记为准；
  2. `scope` 与 WPS 365 应用实际开通权限一致；
  3. 该应用「接口签名」是否开启 → 决定 `WPS_API_SIGNATURE` 是否需设 `true`。
- **生产代码**：0 修改，无生产阻塞。

---

## 18. 最终状态

```
CF-WPS-03_STATUS = BLOCKED_EXTERNAL_VALIDATION
```

判定依据（任务书 §九判定条件 vs 现实）：

| 条件 | 状态 |
|---|---|
| A. OAuth 真实浏览器授权成功 | ⏳ PENDING（待业务方 Cloudflare 联调）|
| B. 真实 WPS 返回 access_token/refresh_token/expires_in | ⏳ PENDING |
| C. 真实 `/v7/users/current` 满足官方鉴权（含 KSO-1 按需） | ⏳ PENDING |
| D. 真实返回 id/user_name/company_id | ⏳ PENDING |
| E. 安全（token/secret 不返浏览器） | ✅ 代码层已保证 |
| F. 生产隔离（HSE 生产=0 修改） | ✅ 已满足 |

> **明确：本阶段不写 `READY_FOR_NEXT_STEP`**（任务书 §十/§十一 硬性要求：仅有 mock 6/6 通过不得标记为就绪）。仅在「真实 OAuth + KSO-1 + /v7/users/current 全部验证成功」后，方可置 `CF-WPS-03_READY=YES` 并进入下一阶段。当前为 **代码层验证 PASS、真实 WPS 验证 PENDING**。

---

## 附：下一步（业务方联调清单，非本 POC 范围）

1. `cd grid-mobile-cloudflare/worker`
2. `wrangler secret put WPS_CLIENT_ID` / `wrangler secret put WPS_CLIENT_SECRET`
3. 在 `wrangler.toml` 填真实 `WPS_REDIRECT_URI`（须与 WPS 开放平台应用登记回调一致）；必要时覆盖 `WPS_AUTHORIZE_URL` / `WPS_USERINFO_URL`
4. 按应用是否开启「接口签名」设 `WPS_API_SIGNATURE`（`true`/`false`）
5. `wrangler deploy`
6. 浏览器访问 `/wps/oauth/start` → WPS 登录授权 → 自动回调 → 查看返回 `user` 字段
7. 若返回 401/403/签名/权限错误，按 §13 预案保留真实错误码并分析，不降级、不 mock 绕过
