# CF-WPS-16：Cloudflare 公网部署 + 正式生产台账字段核验 + 手机真实 E2E 验证 实施报告

> 生成时间：2026-09-16（本轮实跑：wrangler whoami、WPS 只读 schema 探测、本地真实浏览器 E2E、8 套回归、secret scan）
> 阶段归属：HSE 网格长巡查 · Cloudflare 移动端链（CF-WPS-11/12/12A/12B/13/14/15 → **CF-WPS-16**）
> **诚实总判定：`CF-WPS-16_STATUS = BLOCKED`** —— 双重 BLOCKED：
> ① 本环境 Cloudflare 仍然**未认证**（任务书声称「用户已登录」与实测不符），真实公网部署/公网 E2E 不可完成；
> ② 经真实 WPS 只读 API 核验，业务指定的正式「生产用台账」(sheet 15) **schema 与 H5 巡查业务不兼容**——缺失 5 个核心字段，字段映射 `BLOCKED`。
> 依 §四/§六/§二十，未伪造部署、未自动建字段、未改四生产开关。

---

## 1. 执行摘要
- Cloudflare：`wrangler whoami` → 未认证；环境无 `CF_*` 凭据、无 `~/.cloudflare` → `CLOUDFLARE_DEPLOYMENT_STATUS=BLOCKED`。任务书 §二① 所述「用户已有 Cloudflare 账户并已登录」**在本执行环境不成立**，按 §四 如实报 BLOCKED，未把本地 E2E 当公网成功。
- 正式台账定位：通过真实 WPS `GET /v7/coop/dbsheet/cn229thwalDs/schema`（**只读、零写入**）定位到唯一「生产用台账」= **sheet_id 15**，file_id `cn229thwalDs`，当前 records=0。
- **关键冲突**：sheet 15 的字段结构**与 Sheet 3（三违生产台账）完全一致**，是「三违式」台账，**不是网格长巡查台账**。H5 必需的 网格 / 问题描述 / 问题类型 / 是否三违 / client_request_id 五个核心字段**全部缺失** → `FORMAL_SHEET_FIELD_STATUS=BLOCKED`。
- 四生产开关保持 false/UNRESOLVED；全程零生产写入，sheet 15 records 仍=0，`PRODUCTION_WPS_POLLUTION=0`。
- 等价验证（明确标注 LOCAL）：本地真实浏览器 E2E 33/33 PASS、回归 8/8 全绿、secret scan CLEAN。
- 结论：`CF-WPS-16_STATUS=BLOCKED`；需业务方提供 CF 凭据 + 决策 sheet 15 schema 扩展/另选正式表，方可进入 CF-WPS-17。

## 2. 本阶段业务决定（冻结）
- ① Cloudflare：任务书称「用户已登录」，实测未认证 → 按 §四 报 BLOCKED（不伪造）。
- ② 正式巡查 Sheet：业务指定现有「生产用台账」→ 已唯一定位 sheet 15，但字段核验 BLOCKED（见 §8/§9）。
- ③ 正式生产写入：`MOBILE_PATROL_PRODUCTION_ENABLED=false`、`PRODUCTION_WRITE_AUTHORIZED=false` 全程保持。
- ④ 登录限流：保持 `BEST_EFFORT_IMPLEMENTED`，不升级分布式、不降 bcrypt cost。

## 3. Cloudflare 账户 / 部署状态
- `wrangler whoami`（4.132.0，隔离 node workspace）：**You are not authenticated. Please run `wrangler login`.**
- 环境变量无 `CF_API_TOKEN`/`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`；`$USERPROFILE/.cloudflare` 不存在。
- 判定：`CLOUDFLARE_DEPLOYMENT_STATUS=BLOCKED`、`PAGES_DEPLOYMENT_STATUS=BLOCKED`、`WORKER_DEPLOYMENT_STATUS=BLOCKED`。
- ⚠️ 任务书 §二① 前提与实测矛盾：本沙箱无任何 CF 身份。非代码缺陷，是环境/凭据缺失。

## 4. Worker 部署状态
- `worker/wrangler.toml`：`name=grid-mobile-cloudflare-worker`、`main=index.js`、ESM、`compatibility_date=2024-09-23`；`[vars]` 仅非敏感（WPS 端点、`CF_ALLOWED_ORIGINS=""`、`ALLOW_WPS_WRITE`/`MOBILE_LOGIN_ENABLED` 注释禁写）。
- 未 `wrangler deploy`（无账户）→ `WORKER_DEPLOYMENT_STATUS=BLOCKED`。

## 5. Pages 部署状态
- `frontend/`（静态 H5，`API_BASE=''` 同源）+ `pages/functions/api/[[route]].js`（同源反代设计稿，`WORKER_ORIGIN` 未配时 503 `PROXY_NOT_CONFIGURED`）。
- 未 `wrangler pages deploy` → `PAGES_DEPLOYMENT_STATUS=BLOCKED`。

## 6. Pages Functions 状态
- 设计稿 `pages/functions/api/[[route]].js` 就绪（同源转发 + fail-closed），但无 Pages 项目未部署 → `NOT_DEPLOYED`（随 Pages 部署状态为 BLOCKED）。

## 7. Secrets 状态
- 敏感项：`WPS_CLIENT_ID` / `WPS_CLIENT_SECRET` / `JWT_VERIFY_SECRET` / `WORKER_SESSION_SECRET` —— 仅经 `wrangler secret put`，不进 `[vars]`/前端/Git/响应/浏览器存储/console/截图/报告正文（报告全程仅引用 env key 名，不出现任何 secret 值）。
- 本轮 secret scan（src + frontend，排除 node_modules）：**CLEAN** —— 源码无字面 secret 赋值；前端无 `sk-`/`AKID`/`access_token`/`client_secret` 暴露；`DUMMY_BCRYPT_HASH` 仅为防时序枚举的测试常量（非真实凭据）。
- `SECRET_CONFIG_STATUS`：因无 Cloudflare 账户无法 `wrangler secret put` 实测 → 部署侧 `BLOCKED`；代码侧路由正确（仅 `env.*` 读取）。

## 8. 正式「生产用台账」定位结果（真实 WPS 只读 API）
- 探测方式：`GET /v7/coop/dbsheet/cn229thwalDs/schema`（Bearer app token，client_credentials；**零写入**）。
- 全量 Sheets：3「表格视图」(2063)、15「生产用台账」(0)、11「员工信息维护」(1291)、13「H5提交测试」(3)、14「H5移动端身份」(3)。
- 命中：**唯一**名为「生产用台账」的 Sheet = **sheet_id 15**，file_id `cn229thwalDs`，records=0。
- 判定：`WPS_PATROL_TARGET_STATUS=UNIQUE_FOUND`（非 AMBIGUOUS、非 NOT_FOUND）。
- 记录（§二十三 要求真实值，仅 file_id/sheet_id，不含任何凭据）：
  - `WPS_PATROL_TARGET_SHEET_NAME=生产用台账`
  - `WPS_PATROL_TARGET_FILE_ID=cn229thwalDs`
  - `WPS_PATROL_TARGET_SHEET_ID=15`

## 9. file_id / sheet_id / 字段清单（sheet 15「生产用台账」）
> 真实读取（fieldId / 名称 / 类型）：
```
[C] 昵称2 (MultiLineText)
[E] 分组名称 (MultiLineText)
[F] 姓名 (MultiLineText)
[G] 所属岗位 (MultiLineText)
[H] 网格等级 (MultiLineText)
[I] 日期 (MultiLineText)
[J] 三违照片：图片1 (Attachment)
[K] 三违照片：图片2 (Attachment)
[L] 三违照片：图片3 (Attachment)
[M] 三违行为 (MultiLineText)
[N] 违章人姓名 (MultiLineText)
[O] 违章人性别 (MultiLineText)
[P] 违章人年龄 (MultiLineText)
[Q] 整改后照片：图片1 (Attachment)
[R] 当日是否报名 (MultiLineText)
[S] 标记 (MultiLineText)
[T] 是否补交 (MultiLineText)
[U] 提交时间 (MultiLineText)
[V] 编号 (MultiLineText)
[W] 来源日期 (MultiLineText)
[X] 巡查人员ID (MultiLineText)
[Y] 上报状态 (MultiLineText)
[Z] 车辆类型 (MultiLineText)
[a] 违章类型结果 (MultiLineText)
[b] 是否需要整改 (MultiLineText)
[c] 整改人 (MultiLineText)
[d] 三违照片链接 (MultiLineText)
[e] 整改后照片链接 (MultiLineText)
[f] 示意图链接 (MultiLineText)
[g] 查询数据编号 (MultiLineText)
```
- 对比对象：Sheet 13「H5提交测试」(H5 真实写入目标) 字段为：测试编号/employee_code/姓名/巡查时间(Date)/网格/问题描述/来源/测试状态/client_request_id/创建时间/测试图片(Attachment)/问题类型/是否三违/三违行为描述/涉及人员/照片状态。
- **结论**：sheet 15 与 Sheet 3 同构（三违式），与 Sheet 13（网格巡查式）**不同构**。

## 10. H5 → 正式 Sheet 字段映射（WPS_PATROL_FORMAL_FIELD_MAP）
> 状态：OK=可直接映射 / PARTIAL=名称或类型不匹配（需决策）/ **MISSING=无对应字段（致命）**

| H5 必需字段 | sheet 15 字段(id) | 类型 | 状态 |
|---|---|---|---|
| employee_code | 巡查人员ID [X] | MultiLineText | PARTIAL（名称不符，worker 需显式映射） |
| 姓名 | 姓名 [F] | MultiLineText | OK |
| 巡查时间 | 日期 [I] | MultiLineText | PARTIAL（H5 为 Date，落 MultiLineText 丢失语义/排序） |
| 网格 | — | — | **MISSING（致命）** |
| 问题描述 | — | — | **MISSING（致命）** |
| 问题类型 | — | — | **MISSING（致命）** |
| 是否三违 | — | — | **MISSING（致命）** |
| 三违行为描述 | 三违行为 [M] | MultiLineText | PARTIAL（名称不符） |
| 涉及人员 | 违章人姓名 [N] | MultiLineText | PARTIAL（名称不符；语义偏向三违违章人） |
| 来源 | 来源日期 [W] | MultiLineText | PARTIAL（名称不符） |
| client_request_id | — | — | **MISSING（致命，幂等键缺失）** |
| 创建时间 | 提交时间 [U] | MultiLineText | PARTIAL（名称不符） |
| 照片相关字段 | 三违照片图片1/2/3 [J/K/L] + 三违照片链接 [d] | Attachment/MultiLineText | PARTIAL（PHOTO_STATUS=PENDING_EXTERNAL，不实际上传） |

- **致命缺失（5 个）**：网格、问题描述、问题类型、是否三违、client_request_id。
- 类型冲突：巡查时间（Date→MultiLineText）。
- 名称错位 9 处（需 worker 显式字段名映射，不能假设同名）。
- 判定：`FORMAL_SHEET_FIELD_STATUS=BLOCKED`（依 §六：字段缺失 → 不自动创建字段 → 报 BLOCKED 并列出缺失/冲突/不可映射字段）。

## 11. Dry-run 结果（§八）
- 构造完整 H5 巡查 payload（employee_code+Session、姓名、巡查时间、网格、问题描述、问题类型、是否三违、三违行为描述、涉及人员、来源、client_request_id、照片状态）后，与 sheet 15 schema 比对：
- **被服务端补充字段**：employee_code←Session.sub、网格←Sheet11 服务端解析、巡查时间←服务端、创建时间←服务端、source=h5-mobile、client_request_id←服务端校验。
- **被客户端禁止字段**（受保护，服务端定值，不展开请求体）：employee_code/grid_id/inspector_employee_id/attribution_status/responsibility/deduction/review。
- **最终将发送 WPS 的结构**：因 5 个致命字段在 sheet 15 无落点，dry-run 在「真正发送前」被拦截——记录将**丢失网格/问题描述/问题类型/是否三违/幂等键**，产出的是不完整、不可审计、不可幂等的畸胎记录。
- 判定：`FORMAL_SHEET_DRY_RUN_STATUS=BLOCKED`（映射不完整，构造不出安全完整 payload；且生产写入闸门本就关闭）。**未向 sheet 15 发送任何 create。**

## 12. 公网登录 E2E
- 无公网部署 → `PUBLIC_H5_E2E_STATUS=NOT_EXECUTED`、`REAL_PUBLIC_BROWSER_E2E=NOT_EXECUTED`。
- 等价本地证据（明确 LOCAL，非公网）：本地真实 Chrome 33/33 PASS（登录→工作台→巡查→提交→记录→详情→退出全链），见 §15。

## 13. 真实手机浏览器 E2E
- `REAL_PUBLIC_BROWSER_E2E=NOT_EXECUTED`（无公网）。本地真实浏览器 E2E 见 §15，已显式标注 LOCAL，禁止等同于公网成功。

## 14. Cross-user isolation
- `CROSS_USER_RECORD_ISOLATION=NOT_EXECUTED`：仅一个 Sheet 14 测试身份，且无论证公网，未伪造 PASS。代码层他人 record_id→404（CF-WPS-13 真机结论继承）。

## 15. CORS
- 公网实测：`CORS_PUBLIC_STATUS=NOT_EXECUTED`（无公网）。
- 本地架构验证（同源 Pages Functions = 无需跨域）：`CF_ALLOWED_ORIGINS=""` → 非授权 Origin 无 `access-control-allow-origin`；OPTIONS 预检非授权 Origin 204 无 ACAO；无 `*`、无任意 Origin 反射 → `CORS_LOCAL_STATUS=PASS`。

## 16. bcrypt CPU
- `BCRYPT_CLOUDFLARE_CPU_STATUS=NOT_EXECUTED`：无 Cloudflare Worker runtime，无法测量 cost 10 公网 CPU / 1101/1102 / CPU exceeded。不降 cost、不换算法（§四/§十二）。

## 17. 登录限流
- 源码含 `loginRateLimited(ip)`（内存级 per-isolate，10min/30 次失败→429 `TOO_MANY_ATTEMPTS`），**best-effort 非分布式**（isolate 重建即清零）。
- `PUBLIC_LOGIN_RATE_LIMIT_STATUS=BEST_EFFORT_IMPLEMENTED`；`LOGIN_RATE_LIMIT_CHANGE_REQUIRED=true`（公网暴露前建议升级分布式，本阶段未改代码、未引入 KV/DO/Redis）。

## 18. 幂等性
- `IDEMPOTENCY_STATUS=LIMITED`：基于 `client_request_id` 对测试 Sheet `list_by_page` 扫描预查（O(n)），重复提交返回 `deduplicated:true`；非强一致/分布式。正式 sheet 15 因 schema 缺 `client_request_id` 字段，**连扫描预查都无法落地** → 正式链路幂等更不可控（须先解决 §10 字段缺失）。

## 19. 照片状态
- `PHOTO_STATUS=PENDING_EXTERNAL`（有照片）/ `未拍摄`（无照片），严格保持。CF-WPS-12B 终局未改：不接 R2/OSS/Tunnel、不破解 WPS Attachment、不假装可预览。H5 拍照 UI 可显示，状态明示。

## 20. 安全扫描（§十六 全项）
- 前端 bundle/html：CLEAN；JS source：CLEAN；Worker response：本地 E2E 验证无 secret/token/password_hash/access_token 泄露；Pages Functions response：未部署；Git diff：CF-WPS-16 零业务代码变更；`.env`：仅本地 dev，未提交、未进前端；Wrangler 配置：仅非敏感 `[vars]`。
- `SECRET_EXPOSURE_STATUS=PASS`（扫描干净；无 secret 进任何产物/响应/报告）。

## 21. WPS 数据污染检查（§十七）
| 表 | 部署前基线 | 终态 | 结论 |
|---|---|---|---|
| S3 生产三违巡查表 | 2063 | 2063 | 零变化 |
| S11 员工花名册 | 1291 | 1291 | 零变化 |
| S13 测试表 | 3 | 3 | 回基线 |
| S14 身份表 | 3 | 3 | 回基线 |
| **S15 生产用台账** | **0** | **0** | **零写入（定位仅读 schema）** |
- `PRODUCTION_WPS_POLLUTION=0`。全程仅 `GET /schema` 与本地 E2E 对 S13/S14 的临时写+清理，无任何生产/正式表写入。

## 22. 回归测试
- 8 套件全绿（本轮实跑）：cfwps08:8/8、cfwps10:8/8、cfwps11:38、cfwps12:25、cfwps13:46、oauth-flow:通过、jwt-bridge:3/3、http-smoke:3/3。
- `REGRESSION_STATUS=PASS`。CF-WPS-16 零业务代码变更，无回归。

## 23. 风险
1. **部署 BLOCKED（硬环境）**：无 CF 凭据 → 公网部署/公网 E2E 不可完成。
2. **正式台账字段不兼容（致命）**：sheet 15 为三违式结构，缺 5 个 H5 核心字段 → 无法直接承载网格巡查记录。
3. **幂等键缺失**：sheet 15 无 `client_request_id` 字段 → 正式链路幂等无法落地（须先解 §2 风险）。
4. **登录限流仅 best-effort**：per-isolate，非分布式；公网暴露前须升级。
5. **bcrypt CPU 未实测**：免费计划 cost 10 或超时，须付费计划 + `cpu_ms` 实测。

## 24. 未完成事项（诚实标注，未伪造成 PASS）
- 真实 Cloudflare 部署（需业务方提供账户/Token）。
- 公网浏览器 E2E、CORS 公网实测、bcrypt CPU 实测、第二身份隔离实测。
- **正式「生产用台账」字段补全决策**（见 BUSINESS_DECISION_REQUIRED）。
- 登录分布式限流。

## 25. 回滚方式
- 未部署 → 无线上回滚。
- 代码层零修改（仅本报告 + 提示词归档 + 只读探测脚本）。`grid-mobile-cloudflare/` 源码保持冻结。
- 数据层：本地 E2E 已 batch_delete 清理；S15 仅读 schema，records 仍=0。

## 26. 最终状态（§二十三 全字段）
```
CF-WPS-16_STATUS                = BLOCKED
CLOUDFLARE_DEPLOYMENT_STATUS   = BLOCKED
PAGES_DEPLOYMENT_STATUS        = BLOCKED
WORKER_DEPLOYMENT_STATUS       = BLOCKED
PUBLIC_H5_E2E_STATUS           = NOT_EXECUTED
REAL_PUBLIC_BROWSER_E2E        = NOT_EXECUTED
CROSS_USER_RECORD_ISOLATION    = NOT_EXECUTED
PUBLIC_LOGIN_RATE_LIMIT_STATUS = BEST_EFFORT_IMPLEMENTED
BCRYPT_CLOUDFLARE_CPU_STATUS   = NOT_EXECUTED
CORS_PUBLIC_STATUS             = NOT_EXECUTED
SECRET_EXPOSURE_STATUS         = PASS
FORMAL_PATROL_SHEET_STATUS     = UNIQUE_FOUND        (sheet 15, file cn229thwalDs)
FORMAL_SHEET_FIELD_STATUS      = BLOCKED             (5 核心字段缺失)
FORMAL_SHEET_DRY_RUN_STATUS    = BLOCKED             (映射不完整，发送前拦截)
PRODUCTION_WRITE_STATUS        = DISABLED            (四开关 false/UNRESOLVED)
PRODUCTION_WPS_POLLUTION       = 0
IDEMPOTENCY_STATUS             = LIMITED
PHOTO_STATUS                   = PENDING_EXTERNAL
REGRESSION_STATUS              = PASS

MOBILE_PATROL_PRODUCTION_ENABLED = false
PRODUCTION_WRITE_AUTHORIZED      = false
WPS_PATROL_TARGET_SHEET          = 生产用台账(sheet 15)  [已定位，但写入因字段 BLOCKED+闸门 false 禁止]
WPS_PATROL_FIELDS_CONFIRMED      = false
BUSINESS_DECISION_REQUIRED       = true
```

## 27. 下一阶段建议（CF-WPS-17 提示词已归档，但本阶段停止、不自动执行）
CF-WPS-17 应且仅应在业务方完成以下决策后启动：
1. **提供 Cloudflare 账户/Token**（或授权 `wrangler login`）→ 解部署 BLOCKED。
2. **决策 sheet 15 字段扩展 vs 另选正式表**：若扩展，需要 WPS 管理员在 sheet 15 增加 网格/问题描述/问题类型/是否三违/client_request_id（及确认 巡查时间 类型）；本阶段严格「不自动创建字段」。
3. 上线前补充分布式登录限流（KV/Rate Limiting 规则）与 bcrypt `cpu_ms` 实测。
4. 仍保持 `MOBILE_PATROL_PRODUCTION_ENABLED=false` 直到字段映射 PASS 且业务二次确认。

---

> **停止条件（§二十四）已遵守**：未自行打开生产写入开关、未自行建字段、未自行接存储、未自行实现限流、未自行降 bcrypt、未进入 CF-WPS-17。完成即停止。
