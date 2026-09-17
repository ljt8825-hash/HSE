# CF-WPS-11：H5 移动端身份表设计与手机号+密码登录最小闭环 实施报告

> 日期：2026-09-15 ｜ 阶段：CF-WPS-11 ｜ 状态：**PASS_WITH_RISK**
> 上游依据：CF-WPS-08（Worker 安全代理）/ CF-WPS-09（WPS 身份实测）/ CF-WPS-10（隔离测试 Sheet 真机联调）/ H5-GRID-LOGIN-02（PC 链手机号登录先例）

---

## 1. 执行摘要

本阶段只解决一件事：**「手机端如何证明自己是哪一个员工，并得到稳定的 employee_code」**。

业务方经 WPS 网页界面人工创建了独立身份 Sheet「H5移动端身份」（**Sheet 14**，10 字段）。Worker 在 CF-WPS-08 代理骨架上最小追加 3 个端点（login / me / logout），实现：

- 手机号 + 密码 → 身份 Sheet 唯一命中 → 身份状态校验 → **bcrypt** 校验 → employee_code 非空 → **员工花名册（Sheet 11）身份桥校验**（存在 + 唯一 + 非离职）→ 签发 Worker 专用 Session JWT。
- 全部认证失败统一 `401 手机号或密码错误`（防账号枚举）；输入侧严格 fail-closed（11 位纯数字、密码 ≤72 字节）。

验证结果：**Mock 38/38 + 真机 27/27 全部通过**，测试数据零残留，生产 Sheet 3（2063 条）与花名册 Sheet 11（1291 条）前后快照一致。

**PASS_WITH_RISK 的风险全部在「部署侧」而非「实现侧」**（Worker 未部署、H5 未浏览器 E2E、bcrypt 在 Workers 免费计划的 CPU 限制、无状态 JWT 无服务端吊销），详见 §15。

## 2. 当前架构

```
手机 H5 (grid-mobile-cloudflare/frontend/，静态最小登录页)
  ↓  HTTPS
Cloudflare Pages（functions/api/[[route]].js 同源反代，CF-WPS-08 设计交付，未部署）
  ↓
Cloudflare Worker（POST /api/mobile/auth/login · /api/mobile/me · /api/mobile/auth/logout）
  ↓  服务端注入身份，WPS secrets 仅存 Worker
WPS 多维表 cn229thwalDs
  ├─ Sheet 14「H5移动端身份」（本阶段身份承载，业务方 UI 人工创建）
  └─ Sheet 11「员工信息维护」（身份桥只读校验源）
  ↓
现有 WPS → PostgreSQL Pull（本阶段零改动）
  ↓
PostgreSQL → 现有 HSE / PC 系统（本阶段零改动）
```

架构纪律逐条核对：无 Tunnel / 无内网穿透 / Worker 不触本地 HSE 与 PG / H5 不触本地 HSE 与 PG / WPS 为公网缓冲 / 不改 Pull / 不改 PC 登录与 JWT / 不动三违 / 不新增照片存储（照片仍 BLOCKED，`/wps/upload/image` 保持 501）/ 不生产部署 / 不改生产库 / 不向生产 Sheet 3 写入。✅ 全部满足。

## 3. 身份模型

- **业务主键：employee_code**（唯一，来源=员工花名册/员工主数据）。Session 中 `sub` 即 employee_code，Worker 服务端注入，前端不可指定/篡改。
- **登录账号：手机号**（身份 Sheet「手机号码」列）。
- **明确禁止且未实现**：SMS / 微信登录 / WPS OAuth 登录 / WPS user_id 作业务身份 / 用户自填 employee_code / 姓名兜底 / 身份证兜底 / 模糊与拼音匹配 / 手机号作 employee 主键。Worker 登录链无任何兜底路径，任一环失败即统一 401。
- **网格长等级**：身份 Sheet 中仅为登录展示快照，最终权威仍是 PG `employee + grid_areas`（后续 CF-WPS-15 归因阶段）。

## 4. WPS 身份 Sheet 真实 schema（Sheet 14「H5移动端身份」，API 实读）

| 字段 | fieldId | 类型 | 说明 |
|---|---|---|---|
| employee_code | Bc | MultiLineText | =花名册「员工编码」 |
| 姓名 | Bd | MultiLineText | 展示 |
| 手机号码 | Be | **Phone** | 登录账号；**平台级唯一约束（见 §10 G）** |
| password_hash | Bf | MultiLineText | bcrypt，禁明文 ✅ |
| 部门 | Bg | MultiLineText | 展示快照 |
| 职位 | Bh | MultiLineText | 展示快照 |
| 网格长等级 | Bi | MultiLineText | 展示快照（非权威） |
| 身份状态 | Bj | **SingleSelect** | 正常/停用/离职；激活集可配 |
| 创建时间 | Bk | MultiLineText | 元数据 |
| 更新时间 | Bl | **Date** | 元数据 |

实测要点：手机号码列是 **Phone 类型**（非文本）；身份状态是 SingleSelect；list_by_page 返回键为 `fields`（UI 新建 Sheet 形态，与 Sheet 13 一致）。

## 5. employee_code 身份链

```
H5移动端身份.employee_code (Sheet 14)
  → 员工花名册.员工编码 (Sheet 11)   ← Worker 登录时只读扫描校验：唯一命中 + 用工关系状态非空非「离职」
  → PG employee.employee_code        ← 后续阶段（CF-WPS-14/15）桥接，本阶段未触碰
```

真机实证：以 Sheet 11 中一名「正式员工」的真实 employee_code 作为 T1 身份行，roster check on 下登录成功（A，PASS_REAL）；TEST 前缀编码不在花名册，同配置下被拒（E，PASS_REAL）；空 employee_code 被拒（mock E2）。

## 6. password_hash 方案

- **bcryptjs 2.4.3**（与本地 HSE 后端同一密码体系，不重造算法），cost 10，哈希格式断言 `^\$2[aby]\$`，非法 hash = fail-closed 401。
- 全链路无明文：WPS 只存 hash；登录请求体用后即弃；响应/日志/错误信息零密码零 hash（泄露扫描实证）。
- 密码输入 >72 字节直接 400（bcrypt 72 字节截断特性 → 超长输入 fail-closed）。
- 明确禁用项（MD5/SHA1/裸 SHA256/Base64/可逆加密/前端或 WPS 存明文）全部未使用。

## 7. Worker 登录实现（`grid-mobile-cloudflare/worker/index.js`）

新增端点与处理链：

- `POST /api/mobile/auth/login`：登录开关门（`MOBILE_LOGIN_ENABLED`，默认关，fail-closed）→ Session 密钥/身份表配置门 → 内存级失败限速（best-effort）→ 体限制 8KB + 输入严格校验（原始手机号必须 `/^1\d{10}$/`，密码 1..72 字节；注入串/全角/带格式一律 400）→ 身份 Sheet 全表扫描（统一 `scanWpsRecords`）→ 手机号数字归一化后**唯一命中** → 身份状态 ∈ 激活集（默认「正常」）→ bcrypt.compare（用户不存在时执行同代价哑比较，防时序枚举）→ employee_code 非空 → 花名册桥校验（可 `IDENTITY_ROSTER_CHECK=off` 关断，仅测试）→ 签发 Session。
- `GET /api/mobile/me`：Session → 最小身份快照。
- `POST /api/mobile/auth/logout`：Session 验证后返回成功；客户端丢弃 token。

返回体仅含：`success/token/tokenType/expiresIn/employee{employee_code,name,department,position,grid_level}`。**绝不返回**：password_hash、完整手机号、身份证号、WPS access_token/refresh_token、APPKEY/APPSECRET（泄露扫描实证）。

配套重构：抽取统一 **`normalizeWpsRecord()`**（`fields_value ?? fields` 双形态兼容 + JSON.parse），`findExistingByClientRequestId` 已改为复用；CF-WPS-12/13/14 必须继续复用，不得各写一套。

## 8. Session 方案（选定：Worker 专用 JWT）

- **算法**：HS256（Web Crypto）。**Secret**：新增 `WORKER_SESSION_SECRET`（独立随机值）。
- **关键审计结论——不复用 `JWT_VERIFY_SECRET` 签发**：该 secret 与本地 HSE 后端共享；若 Worker 用它签发，签出的 token 会被本地 HSE 后端接受，形成**跨系统信任升级**。故 Session 签名 secret 与后端 JWT secret 严格分离；Worker 对 `/wps/records/create` 仍只验签后端 JWT（CF-WPS-08 语义不变）。
- **claims**：`iss=hse-worker-mobile`、`aud=hse-mobile-h5`（双重隔离：后端 token / 伪造 iss 均被拒，已测）、`sub=employee_code`、name/department/position/grid_level 快照、`iat/exp/jti`。TTL 默认 7200s（300s~7天可配）。
- **employee_code 不可篡改**：payload 改 `sub` / 改签名均 401（真机 O 实测）；H5 提交记录时不得自行指定 employee_code——该纪律由 Worker 端从 Session 注入保证（生产提交通道的强制注入在 CF-WPS-12/13 落地）。
- **泄露面**：token 仅经 Authorization 头传输；响应体/日志无 token 落地；H5 存 sessionStorage（XSS 面已知，最小阶段取舍，HttpOnly Cookie 方案属后续）。
- **已知限制（如实声明）**：无状态 JWT 无服务端吊销通道——logout 后**已泄露的 token 在 exp 前仍有效**（mock N-caveat 实证）；缓解=短 TTL + logout 即丢弃 + 限速。引入吊销需外部存储，任务书禁止本阶段引入。

## 9. H5 登录实现（`grid-mobile-cloudflare/frontend/`，4 文件）

- `login.html`：手机号（11 位前端预校验）+ 密码 → `/api/mobile/auth/login` → token 存 sessionStorage → 跳首页。
- `home.html`：最小「网格长巡查」占位页——`/api/mobile/me` 展示工号/姓名/部门/职位/网格长等级 + 退出登录（logout → 本地丢弃 → 回登录页）。
- `app.js`：公共请求封装；401 自动清会话回登录页；不打印 token/密码。
- `config.js`：`API_BASE` 留空=同源 `/api`（走 Pages 反代）；开发可指向 Worker 地址。
- **未做**（按任务书 §十二）：照片、三违完整流程、整改、审核、责任、扣分、PC 台账、WPS Pull、归因、网格自动判定。

## 10. 测试矩阵（A–S 实测结果）

| # | 场景 | 结果 | 级别 |
|---|---|---|---|
| A | 正常登录（真实花名册 employee_code，桥 on） | 200 + token + 正确 employee_code | **PASS_REAL** |
| B | 手机号不存在 | 401 统一口令 | **PASS_REAL** |
| C | 密码错误 | 401 统一口令 | **PASS_REAL** |
| D | 身份停用 | 401 统一口令 | **PASS_REAL** |
| E | employee_code 不在花名册 | 401 统一口令；off 时 200（配置语义） | **PASS_REAL** |
| F | employee_code 在花名册重复 | 401 | PASS_MOCK |
| G | 手机号重复 | **WPS Phone 列平台级拒绝重复（500 实证）**；Worker 多命中→统一 401 防御（mock）；唯一行登录 200 | PASS_REAL+PASS_MOCK |
| H | 空手机号 | 400 | **PASS_REAL** |
| I | 空密码 | 400 | **PASS_REAL** |
| J | 超长输入 | 400 | **PASS_REAL** |
| K | SQL 注入串 / 全角 Unicode / 特殊字符 | 400 fail-closed（严格 11 位纯数字校验） | **PASS_REAL** |
| L | Session 过期 | 401 | **PASS_REAL** |
| M | Logout | 200 | **PASS_REAL** |
| N | Logout 后无 token 访问 | 401（无状态限制见 §8） | **PASS_REAL** |
| O | employee_code 篡改 / 签名篡改 | 401 | **PASS_REAL** |
| P | password_hash 泄露扫描 | 全响应体无 `$2a$/$2b$/$2y$` 模式 | PASS_REAL+PASS_MOCK |
| Q | APPSECRET 泄露扫描 | 无 | PASS_REAL+PASS_MOCK |
| R | access_token 泄露扫描 | 无（WPS token/secret 均不出现在任何响应） | PASS_REAL+PASS_MOCK |
| S | 身份接口敏感字段扫描 | 无完整手机号/密码字面量/18 位身份证模式 | PASS_REAL+PASS_MOCK |

回归：cfwps08 (8/8)、cfwps10 (8/8)、oauth-flow (9/9)、jwt-bridge (3/3)、http-smoke (3/3) 全部通过。

## 11. 五态分类

- **PASS_REAL（27 项）**：真机 WPS Sheet 14 播种→Worker 全链路→清理，含 A/B/C/D/E/G/H/I/J/K/L/M/N/O 及全部泄露扫描、污染检查。
- **PASS_MOCK（38 项）**：门控（默认禁登录/缺配置）、F 花名册重复、多命中防御、normalizeWpsRecord 单元、iss/aud 隔离、后端 secret token 拒收。
- **DESIGN_ONLY**：Pages 同源反代（CF-WPS-08 交付，未部署）；H5 页面逻辑（未浏览器 E2E）。
- **BLOCKED / PENDING_AUTHORIZATION**：Worker 云端部署（含 secrets 配置与 CPU 限制评估）、H5 正式发布、生产 WPS 写入授权。
- **绝对无「Mock 冒充 Real」**：上表逐项标注。

## 12. 安全审计汇总

1. 前端 bundle（4 文件）grep `APPKEY|APPSECRET|client_secret|access_token|refresh_token|password_hash|JWT_SECRET` = 零命中。
2. 全部真实/模拟响应体联合扫描：无 bcrypt 模式、无 WPS token/secret、无测试密码/手机号字面量、无身份证模式。
3. 错误信息不泄露 WPS 原始响应/连接信息/secret；WPS 上游异常统一归一化为 `身份服务暂不可用`。
4. 防枚举：失败统一「手机号或密码错误」+ 哑 bcrypt 恒定代价 + 内存限速（30 次/10 分钟/IP，isolate 级 best-effort，已声明局限）。
5. 输入侧：严格 11 位纯数字（注入/全角/格式串 400）、密码 ≤72 字节、体 ≤8KB。

## 13. 测试数据清理

- 4 条种子行（1 条含真实花名册 employee_code 的 T1 + 3 条 CF-WPS-11-TEST-*）全部 `batch_delete`；T2 停用、T3/T5 正常、T4（重复手机号）由平台拒绝未创建。
- 身份 Sheet 残留扫描：`CF-WPS-11-TEST` 前缀命中 **0**；Sheet 14 行数 3 → 3（业务方的 3 条空行原样保留，未触碰）。
- 一次性诊断脚本（schema 探针/原始形态探针/字段写入探针）已删除；回归资产 `cfwps11.test.mjs` / `cfwps11-realtest.mjs` 保留。

## 14. 生产污染检查

- 生产巡查 Sheet 3：2063 → 2063（只读快照，零写入）。
- 花名册 Sheet 11：1291 → 1291（全程只读）。
- 本地 HSE 后端 / PG：零访问（本阶段无任何本地服务依赖；Session token 为测试脚本自签，未动 dev/prod 后端）。
- 未部署任何 Cloudflare 资源；无生产 WPS 写入；无生产库变更。

## 15. 风险

| # | 风险 | 等级 | 缓解/去向 |
|---|---|---|---|
| R1 | **bcrypt 在 Workers 免费计划 10ms CPU 上限会超时**（纯 JS，cost 10 约 50–150ms CPU）；付费计划需评估 `[limits] cpu_ms` | 中 | 部署前决策项；wrangler.toml 已注释；不降低 cost（安全不妥协） |
| R2 | 无状态 JWT：logout 后已泄露 token 在 exp 前仍有效；限速为 isolate 级 best-effort | 中 | 短 TTL 7200s；后续阶段可评估 KV 吊销表（须另行授权） |
| R3 | H5 未做浏览器端到端（Worker 未部署，无真实联调目标）；token 存 sessionStorage 有 XSS 面 | 中 | 部署阶段补 E2E；HttpOnly Cookie 为后续选项 |
| R4 | 登录链每次全表扫描身份 Sheet + 花名册（1291+ 条、≥8 次 list_by_page），延迟与限频压力随花名册增长上升 | 低-中 | POC 规模可接受；生产前考虑缓存/快照策略 |
| R5 | WPS 上游瞬时 500（首跑整批播种即遇一次）；重试已内置 | 低 | 种子/业务写入须带重试 |

## 16. Blocker

无实现级 Blocker。**待授权决策项**：
- D1：Worker 云端部署 + secrets 配置（`WORKER_SESSION_SECRET` 必须为独立随机值）+ `MOBILE_LOGIN_ENABLED=true` + CPU 限制评估（R1）。
- D2：H5 正式发布与浏览器 E2E（依赖 D1）。
- D3：真实员工身份批量灌入身份 Sheet（业务方决策；password_hash 生成流程须另行约定）。

## 17. 回滚方案

- 本阶段未部署、未写生产，**无需生产回滚**。
- 代码回滚：`worker/index.js` 为纯追加（CF-WPS-08/10 已验证路径行为不变，回归全绿）；如需回退，删除 CF-WPS-11 块与 3 条路由即可，`/wps/*` 各端点不受影响。
- 身份 Sheet：测试行已清零；业务方在 WPS UI 可直接编辑/删除 Sheet 14。
- 依赖回滚：`npm remove bcryptjs`（package.json 已声明，删除不影响既有端点）。

## 18. CF-WPS-11_STATUS

**PASS_WITH_RISK**

PASS 标准 20 项逐条达成（schema 实读✅ 身份链✅ hash 安全✅ 手机号唯一✅ 正常/错误登录✅ 状态校验✅ employee_code 校验✅ Session 建立/过期/logout✅ 防篡改✅ 敏感字段与 secrets 不泄露✅ 清理✅ 零生产变化✅ 无本地 HSE/PG 访问✅ 无 Tunnel✅ 无照片改动✅ 无三违改动✅）。风险均为部署侧既知事项（§15），不阻塞下一阶段设计；生产幂等仍保持 **IDEMPOTENCY_PENDING**（本阶段未触碰）。

---

### 附：修改文件清单

**新增/修改**
- `grid-mobile-cloudflare/worker/index.js` — CF-WPS-11 块（login/me/logout + normalizeWpsRecord/scanWpsRecords 统一能力 + Session 签发验签），纯追加
- `grid-mobile-cloudflare/worker/wrangler.toml` — CF-WPS-11 变量与 secrets 注释
- `grid-mobile-cloudflare/worker/package.json` — bcryptjs 2.4.3
- `grid-mobile-cloudflare/worker/test/cfwps11.test.mjs` — Mock 38 项
- `grid-mobile-cloudflare/worker/test/cfwps11-realtest.mjs` — 真机 27 项（回归资产，保留）
- `grid-mobile-cloudflare/frontend/{login.html,home.html,app.js,config.js}` — H5 最小登录

**明确未修改（禁改清单逐项声明）**：`server/` 全部（含 server/sql/）、现有 HSE/PC 登录、WPS Pull（wpsFieldMap/Pull 引擎零触碰）、三违业务、生产数据库、生产部署配置、Sheet 3 / Sheet 11 数据、`/wps/upload/image`（保持 501）。
