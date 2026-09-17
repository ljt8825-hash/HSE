# CF-WPS-20：Cloudflare Wrangler 实际认证 + Worker/Pages 公网部署 + 公网 H5 全链路验收报告

> 基线：CF-WPS-19 最终状态。执行日期：2026-09-16。
> **CF-WPS-20_STATUS = PASS_WITH_RISK**
> 核心成果：**Cloudflare 真实认证 ✅ → Worker 真实部署 ✅ → Pages 真实部署 ✅ → 公网可达 ✅ → 公网 CORS/Session/泄露扫描 17/17 PASS ✅ → bcrypt cost=10 真实 CF runtime 实证 ✅（预检 8.4s 全链）**
> **核心外部风险（已重新定性）**：WPS OpenAPI 对 Cloudflare 海外边缘为 **【间歇挂死】而非静默丢包硬阻断**——健康窗口全链 ≤10s（预检实证 seed S14 200 + 公网登录 HTTP 200 + hasToken），挂死窗口请求永久挂起（登录 >90s / 播种超时）；翻转粒度达亚分钟级。本会话后半段 WPS 处于挂死窗口，完整公网浏览器 E2E 暂未捕获；登录链路已通过预检实证可在健康窗口跑通；测试脚本已加固（健康门+先 API 后浏览器+短超时）以备健康窗口重跑。
> 生产写入全程关闭：Sheet15 业务记录 = 0，全表零污染（多次 E2E 终态污染检查全 PASS）。

---

## 1. 执行环境

- 项目：`G:\hse-dashboard\grid-mobile-cloudflare\`
- Wrangler 4.132.0（managed node 22.22.2-2 调用，`C:/Users/honey/.workbuddy/binaries/node/...`）
- 生产写入开关（部署中保持）：
  - `MOBILE_PATROL_PRODUCTION_ENABLED`：**unset**（fail-closed）
  - `MOBILE_PATROL_TARGET_SHEET_ID`：**unset**
  - `WPS_PATROL_FIELDS_CONFIRMED`：**unset**
  - `WPS_DBSHEET_TEST_SHEET_ID=13`（巡查测试目标）；`ALLOW_WPS_WRITE=true`（仅测试表链路）；`MOBILE_LOGIN_ENABLED=true`（公网 E2E 需要）
  - `patrolTarget()` 代码级确认：生产三开关缺任一 → 永远回落测试 Sheet13，Sheet15 生产写入**结构性不可能**

## 2. Wrangler 认证（PASS，真实）

- 用户在真实 Windows PowerShell 执行 `wrangler login`（首次因 wrangler 不在系统 PATH 失败——**`where.exe wrangler` 找不到，wrangler 仅存在于 WorkBuddy 隔离 workspace**；已提供完整路径命令后成功）。
- 浏览器授权页显示 "Authorization granted to Wrangler"（用户截图为证）。
- 随后 `wrangler whoami`（AI 侧真实执行）：
  - **You are logged in with an OAuth Token**，email `ljt8825@gmail.com`
  - Account Name：`Ljt8825@gmail.com's Account`；Account ID：`00ee1b2b...ce8e`（非完整披露）
  - Token scopes 含 `workers(write)`、`pages(write)`
  - 凭据路径：`C:\Users\honey\AppData\Roaming\xdg.config\.wrangler\config\default.toml`
- `CLOUDFLARE_AUTH_STATUS = PASS`

## 3. Worker 部署（PASS，真实）

- `wrangler deploy`（worker/ 目录）真实成功：
  - **Worker URL：`https://grid-mobile-cloudflare-worker.ljt8825.workers.dev`**
  - **Version ID：`6d089b6c-546a-4e8d-81d9-df8aac7930ea`**
  - 上传体积 103.96 KiB（gzip 25.96 KiB），17 个非敏感 vars 绑定生效
- 部署前 git 审计：`grid-mobile-cloudflare/` 为 untracked，未带入 `server/`、`安全看板vben/` 等任何无关修改。
- `WORKER_DEPLOYMENT_STATUS = PASS`

## 4. Pages 部署（PASS，真实）

- 组装部署目录：frontend 静态资产 + `functions/api/[[route]].js` + Pages 配置（`WORKER_ORIGIN` 指向 Worker URL）。
- `wrangler pages project create grid-mobile-cloudflare --production-branch main` + `wrangler pages deploy --branch main`：
  - **生产地址：`https://grid-mobile-cloudflare.pages.dev`**
  - 部署版本序列（含诊断迭代后最终版）：`5b04d270.grid-mobile-cloudflare.pages.dev`
  - Functions bundle 编译上传成功
- 前端 `API_BASE=''` 同源架构成立（实测 `/api/*` 经 Functions 进入 Worker）。
- `PAGES_DEPLOYMENT_STATUS = PASS`

## 5. Pages Functions（PASS，含一处真实缺陷修复）

- 反代链路公网实测：`GET /api/mobile/patrol/meta`（无 token）经 Pages → Function → Worker 返回 **401 UNAUTHORIZED**（fail-closed 正确贯通）。
- **发现并修复一处真实缺陷**：原 Function 重建响应头时丢弃 Worker 的全部 CORS 头（只保留 content-type/cache-control），导致合法 Origin 拿不到 ACAO（§十 公网 CORS 验证时暴露）。**最小修复**：白名单透传 `access-control-*` / `vary` 头（`pages/functions/api/[[route]].js`），重部署后公网实测通过。此为 §十 明确要求的公网 CORS 正确性所必需的最小改动，已如实记录。
- `PAGES_FUNCTIONS_STATUS = PASS`（公网真实运行）

## 6. Secrets（PASS，全程零泄露）

- `wrangler secret put` 管道注入 4 项（值不显示、不落盘、不入报告）：
  - `WPS_CLIENT_ID` ← server/.env `WPS_APP_ID`
  - `WPS_CLIENT_SECRET` ← server/.env `WPS_APP_SECRET`
  - `JWT_VERIFY_SECRET` ← server/.env `JWT_SECRET`
  - `WORKER_SESSION_SECRET` ← **经用户显式授权**（AskUserQuestion）由 AI 用 `crypto.randomBytes(64)` 生成注入，与 JWT_SECRET 严格不同
- `wrangler secret list` 确认 4 项名称全部存在（仅名称核验）。
- 未写入 wrangler.toml / 前端 / Git / Markdown / HTTP 响应 / console（§三 全合规，扫描见 §20）。

## 7. 公网地址（PASS，真实）

- Pages（H5 主入口）：`https://grid-mobile-cloudflare.pages.dev`
- Worker（仅经 Functions 反代使用）：`https://grid-mobile-cloudflare-worker.ljt8825.workers.dev`
- ⚠️ 本机网络（大陆）到 `workers.dev` 直连不通（多次实测 fetch failed / 超时；大陆网络对 workers.dev 的常见封锁）；`pages.dev` 可达。诊断探针因此经 Cloudflare 内网转发完成（见 §12）。

## 8-9. 公网登录 / 公网巡查全流程（⏳ INTERMITTENT——WPS 出海间歇挂死，本会话未捕获完整窗口）

**根因（真实 Cloudflare runtime 多路径探针 + 预检实证，非推测）：**

| 观测 | 结果 |
|---|---|
| 首轮探针（单路径）`/oauth2/token` POST @LAX | ❌ 15s 超时（早期样本，误判为静默丢包） |
| 次轮多路径探针 `wps_token_POST_bad` | ✅ 401 invalid_client / 696ms（**端点响应**） |
| 次轮多路径探针 `wps_schema_GET_noauth` | ✅ 400 / 202ms |
| 次轮多路径探针 `wps_root_GET` | ✅ 404 / 879ms |
| 公网预检 `cfwps20-preflight.mjs`（seed S14 + 公网登录） | ✅ seed 200 + **HTTP 200 / 8.4s** + hasToken（**健康窗口全链跑通**） |
| 完整公网 E2E（OqG1HY / NPHJtJ / 重试×3） | ❌ 健康门播种失败（**挂死窗口**：基线 countSheet 成功但数秒后 Sheet14 播种超时；本会话后半段 WPS 持续挂死） |
| 快速 API 级证明 `cfwps20-public-apiproof.mjs`（重试×30，10min） | ❌ 全部健康门中止：**基线 countSheet 读成功（S3=2063/S11=1291）+ Sheet11 花名册 list_by_page 读成功（got=2）但 Sheet14 写（records/create）每次挂起** → 实证「**读通、写挂**」 |
| 第二次预检 `cfwps20-preflight.mjs`（~18:04，恢复窗口） | ✅ seed 200 + **HTTP 200 / 9s** + hasToken（**健康窗口再次捕获**，证明非偶发） |
| 紧耦合 30 次完整 E2E 重试循环（3x7c1f，11min，紧随恢复窗口启动） | ❌ **全部在健康门中止**（恢复窗口 ≤数分钟即翻转回挂死；attempts 23-30 @18:15-18:18 全挂）→ 实证**健康窗口极短、无法撑过任何多步写链** |

- **结论（重新定性 + 精确根因）**：WPS OpenAPI 对 Cloudflare 海外边缘 **不是硬阻断，而是间歇挂死**，且**可精确到端点类别**——WPS **读**出口（`/schema`、`list_by_page`、`count` 统计）在 CF 边缘**稳定可达**（每次 E2E 基线计数与花名册读取均成功）；WPS **写**出口（OAuth `token` 签发 + `records/create`）**间歇挂死**。翻转粒度达**亚分钟级**，**健康窗口极短（实测仅数分钟、多数为秒级）**——首轮 15s 超时为某次写出口挂死样本，非端点常态。**这比泛泛「间歇」更可操作：阻断点集中在 WPS 写入类端点（token + create）。**
- 放大因素：`worker/index.js` 全部 fetch **无超时保护**（无 AbortSignal）→ 挂起变永久挂死（挂死窗口实测登录请求 >90s 无响应）。
- **登录链路已实证可在健康窗口跑通**：`cfwps20-preflight.mjs` 在真实 CF 完成 seed S14(200) → 公网 `/api/mobile/auth/login`(HTTP 200, hasToken) → bcrypt cost=10 验证 → 清理回基线；即「手机号+密码 → Worker → WPS 读身份/花名册 → bcrypt → 签发 Session」全链在真实 runtime 通过，无 CPU 超限。
- **完整浏览器 E2E 未在本会话捕获**：本会话后半段 WPS 处于挂死窗口，健康门（播种 Sheet14）连续失败直接中止，未进入浏览器全链。测试脚本已加固（健康门快退 + 先 API 后浏览器 + 短超时）以备健康窗口重跑。
- **本阶段未修改业务代码绕过**（§二十一）；Worker fetch 超时保护列为建议项（见 §21 风险）。
- 因此：`PUBLIC_H5_E2E_STATUS = INTERMITTENT`（健康窗口可达、当前挂死）；`REAL_PUBLIC_BROWSER_E2E = NOT_EXECUTED`（完整浏览器链未捕获，登录子链经预检实证）；登录/首页/巡查/提交/记录/详情/登出的公网浏览器链 = NOT_EXECUTED（路径已实证，**受 WPS 写出口健康窗口过短所限**）。**最高价值公网证明已确证**：登录子链（seed S14 + 公网 `/login` + bcrypt cost=10 + 签发 Session）+ 17/17 CORS/Session/泄露扫描 + 零污染，均为真实 CF runtime 实证 PASS。
- **扩展重试实证（本会话累计 ≈80 次公网尝试，结论确证）**：2 次完整 E2E（OqG1HY/NPHJtJ）+ 3 次（2YyG9v）+ 15 次（U8wh48）+ 30 次快速 API 证明（Xhm7N7）+ 1 次完整 E2E（zVOSBF）+ **30 次紧耦合重试循环（3x7c1f，11min，紧随 18:04 恢复窗口启动）**，**全部在健康门（Sheet14 写）中止**；唯一两次写出口恢复窗口仅在两次预检 `cfwps20-preflight.mjs`（~09:19 / ~18:04）捕获（各 seed 200 + 登录 8-9s 全链），**其余 ≈78 次全部挂死**。关键反证：3x7c1f 是在刚捕获一次健康窗口后**立即**以 22s 间隔连续采样 30 次，**连一次都未再命中**——证实健康窗口极短（数分钟即翻转）、且**任何需要 ≥2 次 WPS 写（seed + 提交 Sheet13）的多步链在其存续期内无法完成**。因此「完整浏览器链 / 跨用户 / protected / 幂等 / 限流」在真实 CF 上**当前不可稳定捕获**，是**外部 WPS 写出口波动所致、非代码缺陷**（所有失败均止步于 WPS 写，零污染、零生产写入）。

## 10. 公网 CORS（PASS，真实公网）

修复 Function 头透传后，公网实测（17/17 验证套件内）：

- 合法 Origin `https://grid-mobile-cloudflare.pages.dev` → **ACAO 精确回显** ✅
- 非法 Origin `https://evil.example.com` → **无 ACAO** ✅
- OPTIONS 预检（非法 Origin）→ 204 / 无 ACAO ✅
- `PUBLIC_CORS_STATUS = PASS`（真实公网，非本地推断）

## 11. 跨用户隔离（NOT_EXECUTED——待健康窗口补全）

- 完整公网 E2E 未捕获（WPS 挂死窗口），无法建立 A/B 两个公网会话做真实隔离验证。
- 登录子链已通过预检实证（健康窗口可达），跨用户隔离公网实测仅差「健康窗口内跑通 A/B 双身份」一步，测试脚本（health-gate + A/B 播种 + 列表/详情 404 断言）已就绪。
- `CROSS_USER_RECORD_ISOLATION = NOT_EXECUTED`（代码层 PASS 继承自 CF-WPS-13 的 46 项 mock 验证，**不计为公网 PASS**）。

## 12. 诊断方法说明（真实 CF runtime，测后即删）

- `wrangler tail` 因沙箱代理拦 WebSocket（502）不可用 → 改用临时探针 Worker `cfwps20-netprobe`。
- 因本机不通 workers.dev，通过临时给 Pages 加 `/probe` Function（Cloudflare 内网转发）执行探针，取得 §8 根因证据。
- **测后清理完毕**：probe Function 已移除（公网实测 404）+ 干净重部署（`5b04d270`）+ 探针 Worker 已 `wrangler delete`（"Successfully deleted"）。

## 13. 登录限流（NOT_EXECUTED——机制已实现，待健康窗口实测）

- `PUBLIC_LOGIN_RATE_LIMIT_STATUS = BEST_EFFORT_IMPLEMENTED`（per-isolate，10min/30 次失败→429，**非分布式生产级限流**）。
- 公网实测 NOT_EXECUTED：本会话 WPS 挂死窗口内错误密码登录同样挂起，未有效触发 30 次失败阈值；测试脚本已含 32 次错误密码探测（遇挂死提前 break）。

## 14. Session 安全（PASS——公网可测部分全部通过）

公网真实实测：

- 无 token `/api/mobile/me` → 401 ✅
- 垃圾 token → 401 ✅
- **伪造签名 JWT**（结构正确、iss/aud/sub/jti/type 全仿造、错误密钥）→ 401 ✅
- 无 token 巡查记录列表 → 401 ✅
- 登出后客户端 token 删除（sessionStorage）+ 无状态 JWT 设计不变；真实 7200s 过期等待未执行（NOT_EXECUTED，签名验证 401 已覆盖伪造路径）。
- `SESSION_SECURITY_STATUS = PASS`（公网可测面；真实过期 NOT_EXECUTED）

## 15. protected fields（代码层 PASS；公网 NOT_EXECUTED——待健康窗口补全）

- CF-WPS-18 verify I 节 27/27：恶意 body（employee_code=ATTACK / grid_id / inspector_employee_id / attribution_status / responsibility / deduction / review）全部忽略，employee_code 仅来自 Session.sub。
- 公网攻击提交 NOT_EXECUTED（登录子链已实证，完整提交链待健康窗口补全）；测试脚本已含 protected-fields 篡改提交 + Sheet13 读回核验（巡查人员ID=Session.sub、受保护键不落 WPS）。

## 16. Sheet15 Schema（PASS，真实 WPS 只读）

- `cn229thwalDs` / Sheet15「生产用台账」/ **39 字段**；涉及人员=B0(MultiLineText)、网格=Bs、问题描述=Bt、问题类型=Bu、是否三违=Bv、client_request_id=Bw、巡查时间=Bx(Date)、来源=By、创建时间=Bz(Date)、巡查人员ID=X、三违行为=M。
- 旧三违字段零改；无第二正式巡查 Sheet。

## 17. Sheet13 测试（PASS，真实 WPS 往返）

- cfwps18-verify 27/27 重跑（本阶段）：涉及人员 单人/双人/三人/空/200 字符边界往返一致、201 拒绝；employee_code→巡查人员ID 四用例（00369234/A12B/0000123/X9-0）MultiLineText 无损；测试数据清理回基线 3。
- `INVOLVED_PERSON_MAPPING_STATUS = PASS`；`EMPLOYEE_CODE_FIELD_COMPATIBILITY = PASS`。

## 18. 生产污染检测（PASS，零污染）

终态真实 WPS 计数：**Sheet3=2063 / Sheet11=1291 / Sheet13=3 / Sheet14=3 / Sheet15=0**。
本阶段两次播种的 Sheet14 测试身份均已清理回基线；Sheet15 全程零业务写入；`PRODUCTION_WPS_POLLUTION = 0`。
`FORMAL_SHEET_DRY_RUN_STATUS = PASS`（39 字段 record 构造全命中，未调 WPS 写接口）。

## 19. 回归（PASS，全绿）

CF-WPS-08: 8/8；CF-WPS-10: 8/8；CF-WPS-11: 38；CF-WPS-12: 25；CF-WPS-13: 46；CF-WPS-18 verify: 27/27；jwt-bridge: 3/3；oauth-flow: 9；http-smoke: 3/3。部署后重跑，无回归。

## 20. 安全扫描（PASS）

- 公网资产扫描（17/17 套件内）：`/login /home /patrol /records /config.js /app.js` 无 WPS_APP_SECRET / JWT_SECRET 值、无 `WPS_CLIENT_SECRET=` 字面量、无 `password_hash` 暴露。
- API 响应（含伪造 token 场景）无 secret 泄露。
- ⚠️ 信息级发现：`/wrangler.toml`（Pages 静态）公网可读（200），仅含非敏感 vars（WORKER_ORIGIN 公网 URL），**无 secret**；建议后续部署从静态包剔除。
- Git/Worker 源码/前端源码扫描 CLEAN（mock 值仅存在于 test/*.mjs）。

## 21. 风险

1. **R1（中·外部·已精确定性）**：WPS OpenAPI 对 CF 海外边缘为 **间歇挂死，且「读通写挂」**——WPS **读**出口（schema/list_by_page/count）CF 边缘稳定可达；**写**出口（OAuth token 签发 + records/create）间歇挂死，翻转粒度**亚分钟级、健康窗口极短（仅数分钟、多数为秒级）**。本会话仅两次预检（09:19/18:04）捕获写出口恢复、各 8-9s 全链，其余 ≈78 次全部挂死（含紧随 18:04 窗口的 30 次紧耦合重试连一次都未命中）。阻断点集中在 WPS **写入类端点**。需业务决策：WPS 侧海外访问策略（针对 token/create 端点）/ CN 中继 / Cloudflare China Network（企业版）等，**本阶段未擅自选型**。
2. **R2（中→高，建议立即处理）**：Worker fetch **无超时保护** → 上游挂起时请求永久挂死（本会话放大因子）。**新证据强化紧迫性**：健康窗口仅亚分钟级，即便 catch 到窗口、若链中某次 WPS 写恰在窗口翻转时发起，无超时保护会永久挂死而非快速失败。建议下一阶段**授权加入 AbortSignal（fail-fast）**后再重跑完整链（本阶段禁止改业务代码）。
3. **R3（中·本机网络）**：大陆网络不通 `workers.dev`；用户手机若同样不通，公网 E2E 将只能走 pages.dev 域（已可用）。
4. **R4（已解决）**：bcrypt cost=10 CPU 预算已在真实 CF runtime 度量——预检公网登录 8.4s 全链、无 1101/1102 CPU 超限错误，**cost 未降低、真实可用**。
5. **R5（低）**：`/wrangler.toml` 静态可读（非敏感，建议剔除）。

## 22. 未执行项（NOT_EXECUTED 明确清单，均因 WPS 挂死窗口；登录子链经预检实证）

- 公网浏览器完整巡查流（含涉及人员字段提交）——登录子链（seed+API 登录+token+bcrypt）已预检实证
- 真实手机设备 E2E（REAL_MOBILE_DEVICE_E2E）
- 公网跨用户隔离（双身份，待健康窗口）
- 公网 protected fields 攻击提交（待健康窗口）
- 公网幂等双击测试（待健康窗口）
- 登录限流 429 触发实测（待健康窗口）
- 真实 WPS OAuth + KSO-1 公网联调
- ✅ **已解决/已实证**：bcrypt cost=10 真实 CF CPU 度量（预检 8.4s 全链，无 CPU 超限）；公网 API 登录链路（预检 HTTP 200 + hasToken）。

## 23. 15 问最终回答

1. **Cloudflare CLI 是否真正认证？** 是（OAuth Token，whoami 实证，账号 ljt8825@gmail.com）。
2. **Worker 是否真正部署？** 是（真实 URL + Version ID `6d089b6c`）。
3. **Pages 是否真正部署？** 是（`https://grid-mobile-cloudflare.pages.dev`，Functions bundle 编译上线）。
4. **是否获得真实公网地址？** 是（见 3；Worker URL 亦真实但大陆网络直连不通）。
5. **真实手机是否访问成功？** 未在本会话捕获（WPS 处于挂死窗口，健康门连播种都失败）；但登录子链（seed S14 + 公网 API 登录 + 签发 Session）已通过 `cfwps20-preflight.mjs` 在真实 CF 实证跑通；手机侧 workers.dev 不可达风险仍须 pages.dev 域验证。
6. **公网登录是否成功？** 公网 **API 登录经预检实证成功**（健康窗口：HTTP 200 + hasToken + bcrypt cost=10，8.4s 全链）；浏览器登录→home 全链未在本会话捕获（挂死窗口）。
7. **公网完整巡查流程是否成功？** 未捕获（同 §8-9：WPS 挂死窗口）；登录→WPS 读身份/花名册→bcrypt→Session 子链已实证，完整巡查链仅差健康窗口内跑通。
8. **涉及人员是否正确进入 Worker 数据模型？** 是（代码层 + 真实 WPS Sheet13 往返 + Sheet15 dry-run，CF-WPS-18 基线保持）。
9. **employee_code 是否正确？** 是（→巡查人员ID[X]，四用例无损往返）。
10. **跨用户隔离是否实际验证？** 否（NOT_EXECUTED；仅代码层 PASS；待健康窗口跑通 A/B 双身份）。
11. **CORS 是否实际验证？** 是（真实公网：合法 Origin ACAO 精确回显 / 非法 Origin 拒绝 / OPTIONS 204 无 ACAO）——并修复了 Function 丢 CORS 头的真实缺陷。
12. **bcrypt cost=10 是否实际在 Cloudflare 验证？** 是（预检实证：真实 CF runtime 公网登录 8.4s 全链，无 1101/1102 CPU 超限，cost 未降低）。
13. **Sheet15 是否保持零业务写入？** 是（records=0）。
14. **是否发生任何 WPS 生产污染？** 否（3/11/13/14 全回基线，污染=0）。
15. **哪些事项仍需人工授权/决策？** 见 §24。

## 24. 待人工决策 / 操作

1. **【核心】WPS↔Cloudflare 网络连通决策**（四选一或另行方案）：
   - ⚠️ 本阶段已精确锁定：阻断点集中在 **WPS 写入类端点**（OAuth `token` 签发 + `records/create`），读出口（schema/list_by_page/count）稳定；故连通方案应优先针对写出口（如 WPS 侧对 CF 写出口放行 / 中继转发写端点）。
   a) WPS 开放平台侧为 CF 出口 IP 放行（若支持白名单，重点覆盖 token/create 端点）；
   b) 在 CN 可达的中继/代理服务器转发 openapi.wps.cn（新增架构，须授权）；
   c) Cloudflare China Network（企业版，成本决策）；
   d) 其他业务方指定方案。
2. **Worker fetch 超时保护**（AbortSignal）——**建议优先于重跑授权加入**：因健康窗口仅亚分钟级，无超时保护即便 catch 到窗口也易在链中某次写翻转时永久挂死；加 fail-fast 后才能稳定捕获完整链。
3. 公网 E2E 重跑（**连通性 + 超时保护两者就绪后**）：登录/巡查/隔离/protected/幂等/限流/bcrypt CPU/真实手机。重跑前置条件（基于本会话实证）：
   - 先解决 R1（WPS 写出口稳定可达）或 R2（fetch 超时）——二者至少其一，否则任何多步写链仍会在窗口翻转时挂死；
   - 预检 `cfwps20-preflight.mjs` 连续 2-3 次 seed 200 + 登录 200 即视为「窗口已稳」，再跑 `cfwps20-public-e2e.mjs`；
   - 若暂不能改代码，可改用「预检 seed 成功后**立即同进程内**跑完整链」（消除 preflight 与 E2E 间的窗口翻转间隙），脚本已支持（种子与证明在同一次调用内）。
4. 第二测试身份准备（跨用户隔离公网实测）。
5. `/wrangler.toml` 从 Pages 静态包剔除（建议）。

## 25. 最终状态（全字段）

| 状态字段 | 值 |
|---|---|
| CF-WPS-20_STATUS | **PASS_WITH_RISK** |
| CLOUDFLARE_AUTH_STATUS | **PASS**（真实 OAuth） |
| WORKER_DEPLOYMENT_STATUS | **PASS**（6d089b6c） |
| PAGES_DEPLOYMENT_STATUS | **PASS**（pages.dev） |
| PUBLIC_H5_E2E_STATUS | **INTERMITTENT**（健康窗口全链 ≤10s 已实证；本会话挂死窗口未捕获完整浏览器链） |
| REAL_PUBLIC_BROWSER_E2E | NOT_EXECUTED（登录子链 seed+API登录+token 经预检实证；完整浏览器链待健康窗口） |
| REAL_MOBILE_DEVICE_E2E | NOT_EXECUTED |
| PUBLIC_CORS_STATUS | **PASS**（真实公网，含缺陷修复） |
| CROSS_USER_RECORD_ISOLATION | NOT_EXECUTED（待健康窗口；代码层 PASS） |
| BCRYPT_CLOUDFLARE_CPU_STATUS | **PASS**（预检实证：真实 CF 8.4s 全链，无 CPU 超限，cost 未降） |
| PUBLIC_LOGIN_RATE_LIMIT_STATUS | BEST_EFFORT_IMPLEMENTED（公网实测 NOT_EXECUTED，待健康窗口） |
| SESSION_SECURITY_STATUS | **PASS**（公网可测面；真实过期 NOT_EXECUTED） |
| PROTECTED_FIELDS_STATUS | PASS（代码层）；公网 NOT_EXECUTED |
| FORMAL_SHEET_SCHEMA_STATUS | PASS（真实 WPS 只读，39 字段） |
| FORMAL_SHEET_DRY_RUN_STATUS | PASS |
| INVOLVED_PERSON_MAPPING_STATUS | PASS |
| EMPLOYEE_CODE_FIELD_COMPATIBILITY | PASS |
| PHOTO_STATUS | PENDING_EXTERNAL |
| REGRESSION_STATUS | **PASS**（9 套件部署后重跑全绿） |
| PRODUCTION_WPS_POLLUTION | **0** |
| SECURITY_SCAN_STATUS | **PASS**（公网资产 17/17） |

## 26. 本阶段真实改动清单

- `grid-mobile-cloudflare/worker/wrangler.toml`：vars 填实（file_id/测试 Sheet13/身份 Sheet14/CORS 白名单/ALLOW_WPS_WRITE/MOBILE_LOGIN_ENABLED/WPS_DBSHEET_TEST_SHEET_ID）；生产三开关保持 unset。
- `grid-mobile-cloudflare/pages/functions/api/[[route]].js`：CORS 响应头白名单透传（最小修复，§10 依据）。
- 新增测试脚本：`worker/test/cfwps20-preflight.mjs`（bcrypt/WPS 公网预检 + 健康门）、`worker/test/cfwps20-public-verify.mjs`（公网 17 项验证）、`worker/test/cfwps20-cleanup-s14.mjs`（S14 播种清理）、`worker/test/cfwps20-public-apiproof.mjs`（快速 API 级证明：bcrypt 登录 + protected/idempotent/跨用户隔离，重试捕获短健康窗口；实证「读通写挂」）。
- 测试脚本加固：`worker/test/cfwps20-public-e2e.mjs` 重写——健康门（播种失败立即中止，不再烧 11min 超时）、先跑快链 API 级证明（protected/idempotent/跨用户隔离/限流/bcrypt）再跑慢链浏览器全链（独立 try，挂死不影响已捕获证明）、所有 WPS 请求短超时+有限重试、限流探测遇挂死提前 break；外壳 `for i in 1..N` 重试循环以捕获 WPS 健康窗口。`cfwps20-preflight.mjs` 作为 WPS 健康门预检（seed S14 200 + 公网登录 HTTP 200 + hasToken + 8.4s 全链）。
- 诊断临时件（已全部清除）：`cfwps20-netprobe` Worker（已删除）、Pages `/probe` Function（已移除并重部署）。
- Cloudflare 平台态：Worker `grid-mobile-cloudflare-worker`（部署+4 secrets）、Pages 项目 `grid-mobile-cloudflare`（生产部署）——均为本阶段正式交付物。

## 27. 停止条件

完成 CF-WPS-20 后**立即停止**：不进入 CF-WPS-21、不开生产写入、不写 Sheet15、不处理 Attachment、不升级分布式限流、不降 bcrypt cost。等待用户对 §24-1（WPS 连通方案）的决策。
