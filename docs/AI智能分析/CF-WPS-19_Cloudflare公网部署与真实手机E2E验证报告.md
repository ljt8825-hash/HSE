# CF-WPS-19：Cloudflare 真实运行环境部署 + 公网 H5 E2E + 正式台账只读/受控验证报告

- 项目：`G:\hse-dashboard` —— HSE「网格长巡查管理」Cloudflare H5
- 阶段：CF-WPS-19（CF-WPS-18 之后，本阶段为最新）
- 执行时间：2026-09-16
- 基线：以 CF-WPS-18 最终状态为准（Sheet15=39 字段，涉及人员=B0，生产分支已接入）
- 结论总判定：**CF-WPS-19_STATUS = PASS_WITH_RISK**
  - 全部「可控 / 只读 / 受控」验证项 PASS；
  - **公网部署链全部 BLOCKED**（Cloudflare CLI 未认证，沙箱无凭据），凡依赖公网的项一律 NOT_EXECUTED / BLOCKED，**未写成 PASS**。

---

## 1. Cloudflare CLI 认证（§四）

执行真实命令（Node 22.22.2-2 + 仓库内 wrangler 4.132.0）：

```
wrangler whoami
▲ [WARNING] Proxy environment variables detected. We'll use your proxy for fetch requests.
 ⛅️ wrangler 4.132.0
────────────────────
Getting User settings...
You are not authenticated. Please run `wrangler login`.
```

- 结果：**未认证**。
- 环境核查：`CF_API_TOKEN`=UNSET、`CLOUDFLARE_API_TOKEN`=UNSET、`~/.cloudflare` 不存在、`~/.wrangler` 不存在、全盘无 `*cloudflare*` 凭据文件。
- `wrangler login` 为浏览器交互式 OAuth，**无法在本沙箱（无显示/无人工浏览器）内完成**，若强行执行将挂起。本阶段**不伪造登录、不伪造 pages.dev、不把任何浏览器状态当作 CLI 登录成功**。
- 判定：**CLOUDFLARE_AUTH_STATUS = BLOCKED**。
- 依据 §四：「如果登录无法完成 → CLOUDFLARE_AUTH_STATUS=BLOCKED；CLOUDFLARE_DEPLOYMENT_STATUS=BLOCKED；并停止公网部署部分」。公网部署部分已停止；其余只读/受控验证继续。

## 2. Worker 部署（§六）

- 因 §四 认证失败，未执行 `wrangler deploy`。
- 部署前 `git diff` / `git status` 确认：`grid-mobile-cloudflare/` 为 **untracked（0 个被 git 跟踪文件）**，与 `server/`、`安全看板vben/`、`docs/` 等既有修改**完全隔离**，不会把无关修改带入 Cloudflare。
- 判定：**WORKER_DEPLOYMENT_STATUS = BLOCKED**。

## 3. Pages 部署（§七）

- 因认证失败，未部署 Pages 静态资源。
- `frontend/config.js`：`const API_BASE = '';`（同源）→ 经 Pages Functions `/api/*` 反代到 Worker，架构成立（见 §8）。
- 判定：**PAGES_DEPLOYMENT_STATUS = BLOCKED**。

## 4. Pages Functions（§八）

- 文件存在：`grid-mobile-cloudflare/pages/functions/api/[[route]].js`（Pages Functions 文件路由 ↔ `/api/*`）。
- 行为确认（源码审计）：
  - 透传 `/api/*` 到 `env.WORKER_ORIGIN`（`WORKER_ORIGIN` 未配置 → 503 `PROXY_NOT_CONFIGURED` fail-closed）；
  - 删除 `host` / `cookie` 头，透传状态码与 JSON 体，不缓存、不重写鉴权头；
  - 同源访问结构正确；非白名单 Origin 不会在此层获得错误 ACAO（ACAO 由 Worker `corsHeaders()` 白名单控制）。
- 因未部署，真实公网 `/api/*` 进入 Worker 的验证 **NOT_EXECUTED**（见 §18）。

## 5. Worker Origin（§五/§六）

- Worker 名：`grid-mobile-cloudflare-worker`（`worker/wrangler.toml`）。
- 因未部署，**无真实 Worker URL / 部署版本标识**。不伪造。

## 6. Secrets（§五）

- `worker/wrangler.toml`：**仅含 `[vars]` 非敏感配置**；敏感项 `WPS_CLIENT_ID / WPS_CLIENT_SECRET / JWT_VERIFY_SECRET / WORKER_SESSION_SECRET` 仅以注释形式给出 `wrangler secret put` 指令，**无任何字面量值写入源码 / Git / 前端**。
- `wrangler secret list` 需认证，未执行（认证已 BLOCKED）；但源码层已确认无硬编码凭据（见 §23 安全扫描）。
- 报告口径（§五）：仅确认「**存在/不存在于源码**」——**不存在于源码**，正式配置须由业务方经 `wrangler secret put` 注入。**未输出任何 secret 值**。

## 7. 公网 H5（§七/§九）

- 因未部署，**无真实公网 H5 地址**，未做真实公网访问。
- 判定：**PUBLIC_H5_E2E_STATUS = BLOCKED**；**REAL_PUBLIC_BROWSER_E2E = NOT_EXECUTED**。

## 8. 真实手机 E2E（§十）

- 严格区分 `LOCAL_BROWSER_E2E` 与 `REAL_PUBLIC_BROWSER_E2E`：
  - `LOCAL_BROWSER_E2E`：CF-WPS-14 已 33/33 通过（本地真实浏览器 + 本地 Worker handler，非公网）。
  - `REAL_PUBLIC_BROWSER_E2E`：需真实公网 Worker+Pages，**本阶段无法执行**。
- 17 项手机流程（打开 H5 / 登录 / 首页 / 巡查 / 身份 / 网格 / 描述 / 类型 / 三违 / 涉及人员 / 时间 / 校验 / 提交 / 记录 / 详情 / 登出 / session 失效）**未做真实手机执行**。
- 判定：**REAL_PUBLIC_BROWSER_E2E = NOT_EXECUTED（BLOCKED）**，不将 LOCAL 结果折算为 PUBLIC。

## 9. 登录（§九）

- 登录链在代码中完整实现（§身份链 fail-closed）：手机号 → Sheet14 H5移动端身份 → 唯一匹配 → 身份状态 ∈ 激活集(默认「正常」) → bcrypt.verify → employee_code 非空 → Sheet11 员工信息维护「员工编码」唯一命中且非离职 → 签发 Worker Session。
- 禁用项在代码中落实：无 WPS user_id 登录、无 WPS OAuth 登录、无姓名/手机号模糊匹配（`phoneMatches.length !== 1` 一律 401）。
- 真实公网手机号+密码登录：**未执行**（未部署）。

## 10. Session（§十九）

- 代码层验证（单元测试 + http-smoke 真实 HTTP）：
  - `/api/mobile/me`：缺失/过期/伪造 Session → 401（由 `verifyWorkerSession` 保证）；
  - `/api/mobile/auth/logout`：验证后返回成功，客户端丢弃 token；无状态 JWT 无服务端吊销（限制如实标注）。
- 真实公网 401 路径未单独执行（未部署），但**结构性 fail-closed**，与本地行为一致。
- 判定：**SESSION_SECURITY_STATUS = PASS（LOCAL/CODE 验证；公网未执行）**。

## 11. 跨用户隔离（§十五）

- 代码层验证（CF-WPS-13 单元测试 46/46，含）：
  - 列表仅含本人记录（`employee_code === payload.sub` 过滤）；
  - 他人记录详情 → 404（防枚举）；
  - 不存在 → 404。
- 真实公网双身份（A/B）隔离验证：**未执行**——本环境无法准备第二个有效测试身份，且无公网。
- 判定：**CROSS_USER_RECORD_ISOLATION = NOT_EXECUTED**（依 §十五「如无法准备第二身份 → 写 NOT_EXECUTED」）。

## 12. protected fields（§十四）

- 生产 record 由 `handlePatrolSubmit` 服务端定值构建，**绝不使用 body 字段展开**；`PROTECTED_FIELDS = {grid_id, inspector_employee_id, attribution_status, deduction, responsibility, review, employee_code}` 在生产通道无条件剥离。
- CF-WPS-18 verify 第 I 项（27/27 子项之一）构造恶意 body 断言：employee_code→来自 Session.sub（00369234，非 ATTACK）；无 inspector_employee_id / grid_id / attribution_status / responsibility / deduction / review 键；涉及人员正常写入。
- 判定：**PROTECTED_FIELDS_STATUS = PASS**。

## 13. CORS（§十八）

- 代码层验证（CF-WPS-08 T6）：`corsOrigin()` 仅放行 `CF_ALLOWED_ORIGINS` 白名单，非白名单 Origin 返回 `null` → 无 `Access-Control-Allow-Origin` 头（fail-closed，不泄露错误 ACAO）。
- OPTIONS 预检按设计处理（204 + 白名单头）。
- 真实公网 CORS 验证：**NOT_EXECUTED**（未部署，依 §十八「不得因本地 PASS 直接写 PUBLIC_CORS=PASS」）。
- 判定：**PUBLIC_CORS_STATUS = NOT_EXECUTED**。

## 14. bcrypt Cloudflare CPU（§十六）

- `bcryptjs` cost=10 **在代码中强制**（未降低；注释明确「绝对禁止降低」）。
- 真实 Cloudflare Worker runtime 的 CPU 时间度量：**无法取得**（未部署）。
- 判定：**BCRYPT_CLOUDFLARE_CPU_STATUS = NOT_EXECUTED**（不推测）。

## 15. 登录限流（§十七）

- 维持 `BEST_EFFORT_IMPLEMENTED`：`loginRateLimited(ip)` per-isolate 内存计数（10min / 30 次失败 → 429）。
- 未升级分布式限流，未因公网测试自动修改。
- 真实公网限流行为实测：**未执行**（未部署）；不描述为「分布式生产级限流」。
- 判定：**PUBLIC_LOGIN_RATE_LIMIT_STATUS = BEST_EFFORT_IMPLEMENTED**。

## 16. Sheet13 真实测试（§十二）

- 经 `cfwps18-verify.mjs` 在测试 Sheet13 做真实 WPS 写读往返（本阶段重新执行，27/27）：
  - 涉及人员：张三 / 张三、李四 / 张三、李四、王五 / 空值 / 200 字符边界 —— 写入==读取 全一致；
  - 201 字符 —— 校验拒绝（ok=false）；
  - employee_code：00369234 / A12B / 0000123 / X9-0 —— round-trip 无损（含前导零、字母、连字符，MultiLineText 类型安全）；
  - 测试后 `batch_delete` 清理，Sheet13 回到基线 **3**。
- 判定：Sheet13 真实链路 **PASS**（受控、可清理、零污染扩散）。

## 17. Sheet15 dry-run（§十三）

- 构造完整 39 字段正式 record（CF-WPS-18 verify 第 J 项），全部字段名命中 Sheet15 Schema（39 字段），**未调用 WPS 写接口**。
- 映射核对：
  - employee_code → 巡查人员ID [X]
  - 涉及人员 → B0
  - 巡查时间 → Bx，网格 → Bs，问题描述 → Bt，问题类型 → Bu，是否三违 → Bv，三违行为 → M，来源 → By，client_request_id → Bw，创建时间 → Bz
- 判定：**FORMAL_SHEET_DRY_RUN_STATUS = PASS**；**FORMAL_SHEET_SCHEMA_STATUS = PASS**（Sheet15=39，涉及人员[B0] MultiLineText 存在）。

## 18. employee_code（§十三/§十二）

- 映射：employee_code（业务身份）→ 巡查人员ID [X]（复用现有列，CF-WPS-17 §六 有证据）。
- round-trip：4 用例全无损（见 §16）。
- 判定：**EMPLOYEE_CODE_FIELD_COMPATIBILITY = PASS**。

## 19. 涉及人员（§十二/§二）

- 字段：Sheet15 涉及人员 = B0，类型 MultiLineText（≥200 字上限，业务侧 ≤200 控制）。
- 数据模型：H5 `violation_people` → Worker `values.violationPeople` → 正式 record `涉及人员`；仅当 `是否三违=是` 时校验非空且 ≤200，多人逗号分隔。
- 映射：CF-WPS-18 verify 27/27 全过；CF-WPS-13 单元测试含涉及人员逻辑。
- 判定：**INVOLVED_PERSON_MAPPING_STATUS = PASS**。

## 20. 照片状态（§二十）

- 维持 **PHOTO_STATUS = PENDING_EXTERNAL**（CF-WPS-12/12A/12B 结论不变）。
- H5 保留照片入口，但不宣称照片已完成生产链路；WPS Attachment 二段式上传能力未在生产通道启用（写开关默认关，且仅测试 Sheet 可写）。
- 未改变 CF-WPS-12/12A/12B 结论。

## 21. 回归（§二十四）

重新执行既有测试套件（本阶段，全部本地/离线，0 网络外部依赖，0 失败）：

| 套件 | 结果 |
|---|---|
| CF-WPS-08（Worker 代理/白名单/CORS/归一化） | 8/8 PASS |
| CF-WPS-10（隔离测试 Sheet/幂等/保护字段） | 8/8 PASS |
| CF-WPS-11（身份登录/泄露扫描） | 38 PASS_MOCK |
| CF-WPS-12（照片上传 fail-closed/泄露扫描） | 25 PASS_MOCK |
| CF-WPS-13（网格/校验/跨用户隔离/泄露扫描） | 46 PASS_MOCK |
| JWT-bridge（真实 JWT 验签桥接） | 3/3 PASS |
| OAuth-flow（WPS OAuth/KSO-1/泄露扫描） | 9 项 PASS |
| HTTP-smoke（真实 HTTP 401/503/404） | 3/3 PASS |
| CF-WPS-18 verify（Sheet15 39 字段+Sheet13 往返+employee_code+protected+dry-run） | 27/27 PASS |

- 判定：**REGRESSION_STATUS = PASS**（既有测试失败项：0）。

## 22. 污染（§二十二）

经真实 WPS schema `records_count`（CF-WPS-18 verify 第 M 项，本阶段重新执行）：

| Sheet | 名称 | 记录数 | 期望 | 结论 |
|---|---|---|---|---|
| 3 | 表格视图（三违台账） | 2063 | 2063 | 未变 |
| 11 | 员工信息维护 | 1291 | 1291 | 未变 |
| 13 | H5提交测试 | 3 | 3 | 回到基线（测试后清理） |
| 14 | H5移动端身份 | 3 | 3 | 未变 |
| 15 | 生产用台账 | 0 | 0 | **零业务写入** |

- 未授权生产记录：无。
- 判定：**PRODUCTION_WPS_POLLUTION = 0**（三违台账/员工表/身份表/生产台账全部零污染）。

## 23. 安全扫描（§二十三）

- 源码字面量凭据扫描（`grid-mobile-cloudflare/`）：命中均为 `test/*.mjs` 内**明显 mock 值**（`mock-app-id` / `mock-app-secret` / `smoke_jwt_secret` / `bridge_app_secret` 等），**生产代码（`worker/index.js`、`wrangler.toml`、`frontend/`）零真实凭据**，仅以 `env.*` 引用。
- 前端 bundle：`frontend/config.js` 仅 `API_BASE=''`，无 WPS_CLIENT_ID / SECRET / token。
- Worker 响应泄露扫描（CF-WPS-08 T7、CF-WPS-11/12 泄露扫描）：secret / token / 密码 / 哈希 / 完整手机号 **均不出现**于任何响应体。
- Git secret scan：凭据仅经 `wrangler secret put` 注入（注释），未入 Git。
- 判定：**SECURITY_SCAN_STATUS = PASS**（无凭据泄漏）。

## 24. 风险（RISK）

- **R1（阻断级）**：Cloudflare 凭据缺失 → 公网部署 / 真实手机 E2E / 公网 CORS / 公网跨用户 / bcrypt CPU 度量 **全部不可执行**，须业务方提供 CF 账号并完成 `wrangler login`。
- **R2**：bcrypt cost=10 在 Cloudflare 免费计划 10ms CPU 上限可能超时；付费计划须评估 `[limits] cpu_ms`。须真实部署后实测（BLOCKED）。
- **R3**：登录限流为 per-isolate best-effort，非分布式生产级；isolate 重建即清零。
- **R4**：Session 为无状态 JWT，无服务端吊销通道（仅 exp 短 TTL 兜底）。
- **R5**：真实 WPS OAuth + KSO-1 闭环未在公网联调（oauth-flow 仅代码层离线验证）。

## 25. 未完成事项（NOT_EXECUTED / BLOCKED 汇总）

| 项 | 状态 | 原因 |
|---|---|---|
| Cloudflare CLI 认证 | BLOCKED | wrangler whoami 未认证，无凭据 |
| Worker 部署 | BLOCKED | 认证失败 |
| Pages 部署 | BLOCKED | 认证失败 |
| 真实公网 H5 | BLOCKED | 未部署 |
| 真实手机浏览器 E2E | NOT_EXECUTED | 未部署 |
| 公网 CORS 验证 | NOT_EXECUTED | 未部署 |
| 跨用户隔离（真实双身份） | NOT_EXECUTED | 无第二测试身份 + 未部署 |
| bcrypt Cloudflare CPU 度量 | NOT_EXECUTED | 无真实 CF runtime |
| Sheet15 真实业务写入 | 禁止 | PRODUCTION_WRITE_AUTHORIZED=false |

## 26. 最终状态（FINAL STATUS FIELDS）

```
CF-WPS-19_STATUS                 = PASS_WITH_RISK
CLOUDFLARE_AUTH_STATUS           = BLOCKED
CLOUDFLARE_DEPLOYMENT_STATUS     = BLOCKED
WORKER_DEPLOYMENT_STATUS         = BLOCKED
PAGES_DEPLOYMENT_STATUS          = BLOCKED
PUBLIC_H5_E2E_STATUS             = BLOCKED
REAL_PUBLIC_BROWSER_E2E          = NOT_EXECUTED
PUBLIC_CORS_STATUS               = NOT_EXECUTED
CROSS_USER_RECORD_ISOLATION      = NOT_EXECUTED
BCRYPT_CLOUDFLARE_CPU_STATUS     = NOT_EXECUTED
PUBLIC_LOGIN_RATE_LIMIT_STATUS   = BEST_EFFORT_IMPLEMENTED
SESSION_SECURITY_STATUS          = PASS (LOCAL/CODE; 公网未执行)
PROTECTED_FIELDS_STATUS          = PASS
FORMAL_SHEET_SCHEMA_STATUS       = PASS
FORMAL_SHEET_DRY_RUN_STATUS      = PASS
INVOLVED_PERSON_MAPPING_STATUS   = PASS
EMPLOYEE_CODE_FIELD_COMPATIBILITY= PASS
PHOTO_STATUS                     = PENDING_EXTERNAL
REGRESSION_STATUS                = PASS
PRODUCTION_WPS_POLLUTION         = 0
SECURITY_SCAN_STATUS             = PASS
```

---

## 最终必须回答（15 问）

1. **Cloudflare CLI 是否真正认证？** → 否（`wrangler whoami` 返回未认证）。
2. **Worker 是否真正部署？** → 否（BLOCKED）。
3. **Pages 是否真正部署？** → 否（BLOCKED）。
4. **是否获得真实公网地址？** → 否。
5. **真实手机是否访问成功？** → 否（未部署）。
6. **手机登录是否成功？** → 否（未部署）。
7. **手机完整巡查流程是否成功？** → 否（未部署）。
8. **涉及人员是否正确进入 Worker 数据模型？** → 是（代码分支 + 27/27 验证；H5 `violation_people` → Worker `涉及人员` → Sheet15[B0]）。
9. **employee_code 是否正确？** → 是（→ 巡查人员ID[X]，round-trip 无损，4 用例通过）。
10. **跨用户隔离是否实际验证？** → 代码层验证（CF-WPS-13 单元测试 46/46，他人记录 404）；真实双身份公网验证 NOT_EXECUTED。
11. **CORS 是否实际验证？** → 代码层验证（白名单 fail-closed，无错误 ACAO）；公网验证 NOT_EXECUTED。
12. **bcrypt cost=10 是否实际在 Cloudflare 验证？** → 代码层强制 cost=10（未降低）；真实 CF CPU 度量 NOT_EXECUTED。
13. **Sheet15 是否保持零业务写入？** → 是（records=0；WPS 写开关默认关；三生产开关缺省）。
14. **是否发生任何 WPS 生产污染？** → 否（Sheet3=2063 / Sheet11=1291 / Sheet13=3 / Sheet14=3 / Sheet15=0）。
15. **哪些事项仍需要人工授权？** → 见下。

### 仍需人工授权的事项（BUSINESS_DECISION_REQUIRED = true）

1. **提供 Cloudflare 凭据**：业务方在真实终端执行 `wrangler login`（浏览器 OAuth），使 `wrangler whoami` 返回已认证账号 —— 解锁 Worker/Pages 部署与全部公网验证。
2. **显式授权开启生产写入**：同时满足 `MOBILE_PATROL_PRODUCTION_ENABLED=true` + `MOBILE_PATROL_TARGET_SHEET_ID=15` + `WPS_PATROL_FIELDS_CONFIRMED=true` + `ALLOW_WPS_WRITE=true` + `MOBILE_LOGIN_ENABLED=true`，并经 `wrangler secret put` 注入四项敏感 secret。本阶段结束前**三者仍为 false**（未部署，wrangler.toml 中对应开关缺省/注释）。
3. **bcrypt 成本/CPU 决策**：真实部署后实测 cost=10 的 CPU 表现，决定是否需付费计划 `[limits] cpu_ms`（**不得降低 cost**）。
4. **分布式登录限流**：如需生产级限流，须另行引入（本阶段不自动升级）。
5. **真实 WPS OAuth/KSO-1 公网联调**：待部署后由业务方联调。
6. **第二个有效测试身份**：用于真实公网跨用户隔离验证。

---

## 停止条件（§二十九）

- CF-WPS-19 已完成并停止。
- **不自动执行 CF-WPS-20**。
- **不自动开启生产写入**（三开关仍 false）。
- **不自动向 Sheet15 创建真实业务记录**（records=0）。
- **不自动修改 Attachment / 三违业务 / 分布式限流 / bcrypt cost**。
