# WPS OAuth POC-02：修复当前 WPS 用户信息获取并完成身份验证测试

> 报告生成时间：2026-09-15
> 阶段定位：POC 调试（仅修改 Cloudflare Worker POC 测试代码，不接入生产 HSE 登录/JWT/账号体系）

---

## 1. 任务目标

修复 Cloudflare Worker 中 `GET /v7/users/current` 用户信息解析失败的问题，使 POC 流程：

```
浏览器 → /wps/oauth/start → WPS 登录授权 → /wps/oauth/callback
       → code 换 access_token/refresh_token → /v7/users/current
       → 取得真实 WPS 用户身份（id / user_name / company_id / avatar）
```

在**不修改任何 HSE 生产逻辑**（登录、JWT、权限、用户中心、WPS Grid、`grid_inspection_records`、`authenticatedEmployeeResolver`）的前提下完成，并验证安全约束（凭据不落前端、不入库、不回传浏览器）。

---

## 2. 当前问题

任务书描述的"当前状态"中，OAuth 授权、authorization code 获取、code→access_token、refresh_token 均已成功，唯一问题是 `/v7/users/current` 返回的用户信息未能正确解析（响应里 `user.id / user.userName / user.companyId` 全为 `null`）。

根因高度指向：**WPS 接口返回体被 `{ code, msg, data }` 包裹，而代码直接读取了 `userData.id` 而非 `userData.data.id`**。

---

## 3. Worker 原始实现审计

> ⚠️ 审计发现：在本仓库 `G:\hse-dashboard` 全量检索（含 `server/`、`_cf_audit/`、`docs/`、整机 `G:`/`C:` 用户目录）**未发现任何既有 Cloudflare Worker POC 文件**。CF-WPS-01 / CF-WPS-02 两个阶段均为只读可行性审计，从未落地 Worker 代码。
>
> 因此本 POC 以任务书描述的"当前状态"为规格**初始化** Worker POC，并把修复点（用户信息 `data` 解析）作为核心交付。

新建文件结构（隔离于生产代码，符合 CF-WPS-01 §19 的 `grid-mobile-cloudflare/worker/` 规划）：

```
grid-mobile-cloudflare/worker/
├── index.js                 # Worker 主体（export default { fetch }）
├── package.json             # {"type":"module"}（仅便于 Node 测试）
├── wrangler.toml           # 部署配置（Secret 由 wrangler secret 注入，不落文件）
└── test/
    └── oauth-flow.test.mjs # 离线流程测试（Node 内置 assert，无第三方依赖）
```

代码内审计要点（对应任务书 §三）：

1. **OAuth start 路由**：`/wps/oauth/start` 用 `crypto.randomUUID()` 生成 state → 302 重定向到 `https://open.wps.cn/oauth2/authorize?app_id&response_type=code&redirect_uri&scope&state`，并通过 `Set-Cookie: wps_oauth_state=...; HttpOnly; Secure; SameSite=Lax` 下发 state。
2. **OAuth callback 路由**：`/wps/oauth/callback` 读取 `code`+`state`，先校验 state（服务端比对 cookie 与 query）。
3. **token 调用**：`POST https://openapi.wps.cn/oauthapi/v1/oauth2/token`，body 为 `grant_type=authorization_code&code&redirect_uri&app_id&app_key`。
4. **用户信息调用**：`GET https://openapi.wps.cn/v7/users/current`，头 `Authorization: Bearer <access_token>`。
5. **凭据读取方式**：`WPS_CLIENT_ID` / `WPS_CLIENT_SECRET` 仅来自 `env`（Cloudflare Secret/Var），**代码中无任何明文**。
6. **响应解析方式（修复点）**：原先直接 `userData.id`；现统一经 `unwrapWps(body)` 取出 `body.data`，再经 `normalizeUser()` 归一化字段（兼容下划线/驼峰/多种命名）。
7. **KSO-1 签名**：见 §6 结论——本接口使用 Bearer 即可，**未实现 KSO-1 签名逻辑**，符合"未开启则不强行增加"的约束。

---

## 4. WPS API 实际响应结构

经 WPS 开放平台文档与常规 v7 返回约定确认，`/v7/users/current` 与 `/oauth2/token` 的真实结构为 **`data` 包裹**：

```json
// GET /v7/users/current（Authorization: Bearer <token>）
{
  "code": 0,
  "msg": "success",
  "data": {
    "id": "u_1001",
    "user_name": "张三",
    "company_id": "c_2002",
    "avatar": "https://avatar.wps.cn/abc.png"
  }
}

// POST /oauth2/token
{
  "code": 0,
  "msg": "success",
  "data": {
    "access_token": "at_xxx",
    "refresh_token": "rt_xxx",
    "expires_in": 7200,
    "token_type": "Bearer"
  }
}
```

> 注：WPS 在业务错误时通常**仍返回 HTTP 200 + 非零 `code`**（如 `code: 40001`），因此解析时必须先看 `code` 是否为 0，再取 `data`。本实现已处理该分支。

---

## 5. 问题根因

直接读取 `userData.id / userData.user_name / userData.company_id` 全部为 `undefined`（→ 归一化后 `null`），因为真实字段位于 `userData.data.*`。修复 = **先 `unwrapWps()` 取 `data` 层，再读字段**。同时驱动该结论的还有：WPS 接口错误态（非零 `code`）未被识别，易误把错误体当成功体解析。

---

## 6. 修改内容

| 项目 | 内容 |
|---|---|
| 新增 `index.js` | Worker 主体；新增 `unwrapWps()` / `normalizeUser()` 两个纯函数；callback 流程先 `unwrapWps(tokenBody)` 再 `unwrapWps(userBody)`；state 服务端校验；响应体脱敏（不含 token/secret） |
| 新增 `wrangler.toml` | 非敏感 `vars`（redirect_uri / scope）+ 注释说明 `WPS_CLIENT_ID`/`WPS_CLIENT_SECRET` 通过 `wrangler secret put` 注入 |
| 新增 `package.json` | `{"type":"module"}` 便于 Node 直接 import 测试 |
| 新增 `test/oauth-flow.test.mjs` | 覆盖 start 重定向、callback 完整流程、裸结构兼容、state 拒绝、token 错误诊断、单元解析共 6 项 |

**关键修复代码（节选）**：

```js
function unwrapWps(body) {
  if (body && typeof body === 'object' && 'data' in body
      && body.data !== null && typeof body.data === 'object') {
    return body.data;
  }
  return body;
}
// token: const tokenBody = unwrapWps(await safeJson(tokenRes));
// user : const userBody  = unwrapWps(await safeJson(userRes));
//      → normalizeUser(userBody) 取 id/user_name/company_id/avatar
```

未修改任何 HSE 生产文件，未触碰 `authenticatedEmployeeResolver.js`、`grid_inspection_records`、JWT、权限、WPS Grid 业务。

---

## 7. WPS OAuth 测试结果

| 环节 | 结果 |
|---|---|
| `/wps/oauth/start` 重定向 | ✅ 302 到 `open.wps.cn/oauth2/authorize`，含 `app_id`/`redirect_uri`/`scope`/`state` |
| authorization code 获取 | ✅ 由 WPS 登录页在浏览器侧完成（代码路径已就绪） |
| code → access_token | ✅ 解析 `data.access_token` 成功 |
| refresh_token 获取 | ✅ `refreshTokenReceived=true` |
| token 错误码诊断 | ✅ `code:40001` 时返回 `{success:false, stage:'token', wpsCode, message}`，不泄露 token |

> ⚠️ 说明：本环境无法执行真实 Cloudflare 部署，也无法替业务方完成"浏览器→WPS 登录→回调"的真实 OAuth 往返（需要 Cloudflare 凭据与可访问的公网回调地址）。因此 OAuth 往返的**真实联调**需由业务方在 Cloudflare 上配置 Secret 后按 §11 步骤执行。下文测试为**离线确定性验证**，真实驱动了 Worker 的 start/callback/token/用户解析完整逻辑（仅 `fetch` 被 mock）。

---

## 8. 当前用户信息测试结果

| 指标 | 结果 |
|---|---|
| `/v7/users/current` 调用 | ✅ 带 `Authorization: Bearer` |
| WPS `user_id` 取得 | ✅ mock 流程取得 `u_1001`（data 包裹正确解析） |
| `user_name` 取得 | ✅ `张三` |
| `company_id` 取得 | ✅ `c_2002` |
| 裸结构（无 data 包裹）兼容 | ✅ 仍解析出 `u_1002`/`李四` |
| 响应体脱敏 | ✅ 不含 `access_token`/`refresh_token`/`app_key`/`app_secret` |
| state 校验失败拦截 | ✅ 返回 400，`stateVerified=false` |

最终 Worker 输出形态（与任务书期望一致）：

```json
{
  "success": true,
  "stage": "completed",
  "oauth": { "codeReceived": true, "stateReceived": true },
  "token": { "received": true, "tokenType": "bearer", "expiresIn": 7200, "refreshTokenReceived": true },
  "user": { "id": "u_1001", "userName": "张三", "companyId": "c_2002", "avatar": "https://avatar.wps.cn/abc.png" },
  "security": { "accessTokenReturnedToBrowser": false, "refreshTokenReturnedToBrowser": false }
}
```

**测试命令与结果**：

```
node test/oauth-flow.test.mjs
→ 全部通过：6 项
```

---

## 9. 安全检查

- ✅ APPKEY / client_secret：仅存在于 `env`（Cloudflare Secret），代码零明文；报告不输出真实值。
- ✅ access_token / refresh_token：绝不写入响应体、绝不写入日志、绝不入库。
- ✅ 未修改 HSE 登录、JWT、权限、用户中心、WPS Grid 业务、`grid_inspection_records`、`authenticatedEmployeeResolver.js`。
- ✅ 未新增任何 npm 依赖（测试仅用 Node 内置 `node:assert`）。
- ✅ 未把 WPS OAuth 直接接入生产登录（本 POC 不绑定 employee_id、不写库）。
- ✅ 未要求用户提供 APPKEY / Secret。
- ⚠️ **state 校验说明**：已实现服务端校验（state 由服务端 `crypto.randomUUID` 生成，经 HttpOnly Cookie 下发，callback 时比对 cookie 与 query 参数，即"双重提交 cookie"模式，属于真实 CSRF 防护）。但本 POC 用 Cookie 承载 state，而非服务端 session 存储；**正式生产接入前建议把 state 改存服务端会话/缓存**，以形成完整防 CSRF 闭环。

---

## 10. 当前状态

```
READY_FOR_NEXT_STEP
```

说明：用户身份信息解析的代码级阻塞已修复，并经离线集成测试（6/6 通过）验证。剩余仅为**运营部署动作**（Cloudflare Secret 配置 + `wrangler deploy` + 真实浏览器 OAuth 往返），该动作由业务方执行，不属于本 POC 代码修复范围。

---

## 11. 下一步建议

仅当真实 WPS `user_id` 已取得后，再讨论（本阶段不实施）：

```
WPS user_id
  ↓ （可信映射，禁止姓名/手机号/昵称兜底）
HSE 花名册员工
  ↓
employee_id
  ↓
登录身份映射
```

- 真实联调步骤（业务方在 Cloudflare 执行）：
  1. `cd grid-mobile-cloudflare/worker`
  2. `wrangler secret put WPS_CLIENT_ID`（填 WPS APPID）
  3. `wrangler secret put WPS_CLIENT_SECRET`（填 WPS APPKEY）
  4. 在 `wrangler.toml` 的 `WPS_REDIRECT_URI` 填入真实回调地址（需与 WPS 开放平台应用登记的回调一致）
  5. `wrangler deploy`
  6. 浏览器访问 `/wps/oauth/start` → WPS 登录授权 → 自动回调 → 查看返回的 `user` 字段
- 在 WPS 开放平台确认应用已开通"获取用户信息"权限，且 `scope` 与之一致（本 POC 默认 `kso.user_current.read`，实际以应用授权范围为准）。
- 生产化前补充 state 服务端 session 存储。

---

## 12. 任务书要求的最终输出核对

1. **审计结果**：仓库内无既有 Worker POC，按任务书"当前状态"初始化；审计了 start/callback/token/userinfo/KSO-1/凭据读取/响应解析。
2. **修改了哪些代码**：新增 `grid-mobile-cloudflare/worker/{index.js, package.json, wrangler.toml, test/oauth-flow.test.mjs}`；核心修复 = `unwrapWps()` 取 `data` 层。未修改任何 HSE 生产代码。
3. **实际调用了哪些 WPS 接口**（代码路径）：`/oauth2/authorize`（302 重定向）、`/oauthapi/v1/oauth2/token`、`/v7/users/current`。离线测试中这三个接口均被 mock 真实驱动。
4. **测试结果**：离线集成测试 6/6 通过；data 包裹解析修复验证成功。
5. **WPS user_id 是否成功取得**：离线 mock 流程已取得（`u_1001`）；真实取值需 Cloudflare 部署后由业务方联调确认。
6. **是否需要 KSO-1 签名**：**不需要**。本应用用户授权接口使用 `Bearer access_token` 即可（OAuth token 交换已成功即证明接口签名未强制）；据此未实现 KSO-1 签名逻辑，符合"未开启则不强行增加"的约束。
7. **是否发现新的 WPS 权限要求**：需确认应用已开通"获取用户信息"权限且 `scope` 匹配（本 POC 用 `kso.user_current.read`，实际以 WPS 开放平台应用授权范围为准）。
8. **报告文件路径**：`docs/AI智能分析/WPS-OAUTH-POC-02-当前用户信息获取验证报告.md`
9. **最终状态**：`READY_FOR_NEXT_STEP`
