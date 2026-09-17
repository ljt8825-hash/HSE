# WPS-OAUTH-POC-03-A 官方接口口径收敛与联调前验证报告

> 阶段性质：POC-03 的**修正子阶段**。仅做代码层接口口径收敛与离线验证，**不进入 CF-WPS-04**。
> 真实浏览器 OAuth + 真机 KSO-1 联调仍待业务方完成 Cloudflare 部署后执行。

---

## 1. POC-03 原问题

POC-03 虽已修正 POC-02 的端点错误（`/oauthapi/v1/oauth2/token` + `app_id`/`app_key` → `/oauth2/token` + `client_id`/`client_secret`），但经对照**当前 WPS 官方开放平台文档**，仍残留以下口径问题：

| 项 | POC-03 原值 | 问题 |
|----|------------|------|
| scope | `kso.user_current.read` | 非官方用户授权流程与 `/v7/users/current` 要求的 scope |
| KSO-1 开关 | `WPS_API_SIGNATURE='false'`（默认关闭，Bearer-only 为默认正式路径） | 官方 `/v7/users/current` 明确要求 KSO-1 签名，应以 **Bearer + KSO-1** 为正式调用路径，不应默认绕过 |
| userinfo 身份字段 | `normalizeUser` 含 `openid`/`unionid`/`nickname`/`company_uid` 容错映射 | 这些字段未被当前接口确认，不得作为正式身份字段（即使容错也不得替代官方 `id`） |

本阶段任务：以官方文档为准做最小修正，并重跑离线验证。

---

## 2. 官方接口核对结果

经 **WPS 官方开放平台文档 + 本项目生产 `server/services/wpsClient.js`（KSO-1 实现）交叉核对**，确认：

- **授权地址**：`GET https://openapi.wps.cn/oauth2/auth`
  参数：`response_type=code`、`client_id`、`redirect_uri`、`scope`、`state`。
- **Token 端点**：`POST https://openapi.wps.cn/oauth2/token`
  表单：`grant_type=authorization_code`、`client_id`、`client_secret`、`code`、`redirect_uri`；`Content-Type: application/x-www-form-urlencoded`。
  - 成功响应为**扁平 OAuth2** `{access_token, refresh_token, expires_in, token_type}`，**非** `{code,data}` 包裹。
  - 失败响应为 `{code, msg}`。
- **KSO-1 签名**（与 `wpsClient.js` 的 `kso1Sign` 完全一致）：
  `signStr = "KSO-1" + METHOD + RequestURI + ContentType + KsoDate + sha256(RequestBody)`
  `sig = HMAC-SHA256(APPKEY, signStr)`
  头：`X-Kso-Date: <RFC1123>`、`X-Kso-Authorization: KSO-1 <APPID>:<sig>`。
- **`/v7/users/current` 鉴权**：官方文档明确要求 **KSO-1 签名**，请求须同时带 `Authorization: Bearer <access_token>`、`X-Kso-Date`、`X-Kso-Authorization`、`Content-Type: application/json`；响应为 `{code, msg, data:{id, user_name, company_id, avatar}}`。

---

## 3. scope 修正

- `DEFAULT_SCOPE`：`kso.user_current.read` → **`kso.user_base.read`**
- `wrangler.toml` 的 `WPS_SCOPE`：同步改为 `kso.user_base.read`
- 离线测试 `ENV.WPS_SCOPE`：同步改为 `kso.user_base.read`，并显式断言重定向 URL 含 `scope=kso.user_base.read`、不含 `kso.user_current.read`

依据：WPS 用户授权流程与 `/v7/users/current` 的权限要求均为 `kso.user_base.read`。

---

## 4. oauth2/auth 修正

- 默认授权地址固定为 **`https://openapi.wps.cn/oauth2/auth`**（`DEFAULT_AUTHORIZE_URL`），与官方一致。
- 保留 `WPS_AUTHORIZE_URL` Var 覆盖能力，但默认固定；`oauth2/authorize`、`oauthapi/v2/authorize` 不再作为 WPS 365 用户授权流程的默认候选（除非真实 WPS 应用实际返回明确证据）。

---

## 5. KSO-1 修正（核心）

- **删除 `WPS_API_SIGNATURE` 开关**：`/v7/users/current` 的正式调用路径固定为 **`Bearer + KSO-1`**，不再保留 Bearer-only 默认路径。
- 沿用既有 `kso1Signature()` / `buildKso1Headers()` 纯函数（Web Crypto，0 npm 依赖），仅将「条件附加」改为「始终附加」。
- `userHeaders` 中固定包含：`Authorization: Bearer <access_token>`、`Content-Type: application/json`、`X-Kso-Date`、`X-Kso-Authorization: KSO-1 <APPID>:<sig>`。
- Token 端点（`/oauth2/token`）**不加** KSO-1（OAuth2 标准，无需签名）。
- 签名计算与请求构造皆为纯函数，由 Worker 服务端生成，secret 不返回浏览器。

---

## 6. token endpoint

保持不变（POC-03 已修正）：

- `POST https://openapi.wps.cn/oauth2/token`
- 表单：`grant_type=authorization_code&client_id=<APPID>&client_secret=<APPKEY>&code=<code>&redirect_uri=<redirect_uri>`
- `Content-Type: application/x-www-form-urlencoded`
- **不加** `X-Kso-Date` / `X-Kso-Authorization`
- 成功响应按**扁平 OAuth2** 解析（`access_token`/`refresh_token`/`expires_in`/`token_type`），不强制 `data.access_token`

---

## 7. userinfo endpoint

- `GET https://openapi.wps.cn/v7/users/current`
- 请求头：`Authorization: Bearer <access_token>` + `X-Kso-Date` + `X-Kso-Authorization: KSO-1 ...` + `Content-Type: application/json`（POC-03-A 起强制）
- 响应：`{code, msg, data:{avatar, company_id, id, user_name}}`
- 解析仅取官方字段：`data.id` / `data.user_name` / `data.company_id` / `data.avatar`
- **正式身份字段仅限上述官方字段**；容错仅保留同字段命名变体（`user_id` / `userName` / `companyId`），不以 `openid` / `unionid` / `nickname` / `company_uid` / `name` 替代官方 `id`
- 新增：userinfo 返回 **401/403/签名错误/业务码非 0** 时，显式保留真实 `httpStatus` 与 `wpsCode`，不泄露 token/secret

---

## 8. 实际修改文件

| 文件 | 修改点 |
|------|--------|
| `grid-mobile-cloudflare/worker/index.js` | `DEFAULT_SCOPE` → `kso.user_base.read`；删除 `WPS_API_SIGNATURE` 条件，userinfo 强制 Bearer+KSO-1；`normalizeUser` 仅保留官方字段+命名变体容错；userinfo 错误（401/403/业务码）显式处理 |
| `grid-mobile-cloudflare/worker/wrangler.toml` | `WPS_SCOPE` → `kso.user_base.read`；**删除 `WPS_API_SIGNATURE` 变量**；注释更新 |
| `grid-mobile-cloudflare/worker/package.json` | 描述补充 POC-03-A |
| `grid-mobile-cloudflare/worker/test/oauth-flow.test.mjs` | 重写为 T1–T9 覆盖：KSO-1 交叉校验、start(scope)、token 请求体、userinfo 头强制 KSO-1、解析、state、token 错误、userinfo 401/403/签名错误、安全无泄露 |

---

## 9. HSE 生产修改数量

**0**。本阶段仅修改隔离目录 `grid-mobile-cloudflare/worker/` 下的 POC 代码与测试，未触碰任何 HSE 生产文件（登录、JWT、权限、用户中心、`employee_id`、`authenticatedEmployeeResolver`、`grid_inspection_records`、WPS→PG 同步、网格长巡查台账、三违台账、正式 H5、正式 WPS 写入、WPS→员工映射均无任何改动）。git 跟踪的生产文件 **0 修改**。

---

## 10. 离线测试结果

运行：`node test/oauth-flow.test.mjs`（managed Node 22.22.2-2）

```
T-UNIT: 解析函数单元（仅官方身份字段）            ✓
T1: KSO-1 签名算法正确性（Web Crypto vs Node crypto 交叉校验） ✓
T2: start 重定向与 state 下发（scope=kso.user_base.read）      ✓
T3: token 请求体校验（client_id/client_secret，无 KSO-1）+ T5 userinfo 解析 ✓
T4: userinfo 始终含 Bearer + KSO-1 头（POC-03-A 强制）         ✓
T6: state 校验失败应被拒                              ✓
T7: token 返回错误码 → 诊断信息且不泄露 token          ✓
T8: userinfo 401/403/签名错误显式处理                  ✓
T9: 安全检查（无 token / refresh_token / secret / APPKEY 泄露） ✓

离线测试全部通过：9 项（T1–T9 + 单元）
```

KSO-1 签名用 **独立 Node `crypto` 参考实现交叉校验**（非假设），算法与官方及 `wpsClient.js` 一致。

---

## 11. 安全检查

- 所有浏览器响应体均不含 `access_token` / `refresh_token` / `client_secret(APPKEY)` / 明文 `Bearer <token>`。
- `access_token` / `refresh_token` 绝不返回浏览器、绝不写入日志、绝不入数据库。
- `WPS_CLIENT_ID` / `WPS_CLIENT_SECRET` 仅存在于 Worker 服务端 Secret/Env，前端/日志/报告/数据库 0 泄露。
- 本 Worker 不连接 PG / HSE / JWT，不把 WPS 身份映射至 `employee_id`，不写任何生产库。
- `X-Kso-Authorization` 中的 APPID 经断言等于 `client_id`，签名 secret 为 `client_secret`（APPKEY），均在服务端计算。

---

## 12. 真实联调状态

**PENDING（未执行）**。本环境无真实 `WPS_CLIENT_ID`/`WPS_CLIENT_SECRET`、无可公开访问回调地址、无 Cloudflare 部署，无法代替业务方联调。按任务书 §十/§十一，仅代码层离线验证通过**不可**标记为就绪。

待业务方完成：

1. `wrangler secret put WPS_CLIENT_ID` / `WPS_CLIENT_SECRET`
2. `wrangler.toml` 填真实 `WPS_REDIRECT_URI`（须与 WPS 应用登记回调一致）
3. 确认该应用「接口签名」已开启（本 POC 已强制 KSO-1，无需再加开关）
4. `wrangler deploy` → 浏览器 `/wps/oauth/start` 完成真实 OAuth

---

## 13. 最终状态

```
CF-WPS-03-A_STATUS = PASS
CF-WPS-03_STATUS   = BLOCKED_EXTERNAL_VALIDATION
```

- `CF-WPS-03-A PASS` 仅代表**代码口径与离线测试通过**。
- **未**写 `CF-WPS-03_READY = YES`：真实 OAuth + KSO-1 + `/v7/users/current` + 真实 `user_id` 尚未取得。
- 只有业务方完成 Cloudflare 部署 + 真实 WPS OAuth + 真实 KSO-1 + 真实 `/v7/users/current` + 真实 `user_id` 后，方可进入下一阶段（CF-WPS-04）。

> 本阶段停止，未进入 CF-WPS-04。
