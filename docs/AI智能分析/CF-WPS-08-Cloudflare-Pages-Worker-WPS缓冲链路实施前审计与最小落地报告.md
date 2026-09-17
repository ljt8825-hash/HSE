# CF-WPS-08：网格长巡查 H5 → Cloudflare Pages + Worker + WPS 缓冲链路实施前审计与最小落地报告

> 阶段：CF-WPS-08 ｜ 日期：2026-09-15 ｜ 环境：本机 dev（无任何生产操作）
>
> **本阶段没有生产部署授权，因此没有执行任何生产修改**（无生产 DDL/DML、无生产 WPS 写入、无生产服务重启、无生产 dist 替换、无 Cloudflare 发布）。

## 1. 阶段目标

为「网格长巡查管理」手机端 H5 审计并最小落地 **Cloudflare Pages（静态托管）+ Cloudflare Worker（安全代理 + WPS 缓冲层）+ WPS 多维表（业务缓冲）** 架构，回答两个核心架构问题：

1. H5 提交的巡查记录能否直接写 WPS，再由现有 WPS→PG 同步带回 PostgreSQL？
2. 照片能否以 WPS Attachment 作为 Cloudflare 架构下的最终存储/缓冲？

并明确区分「页面能否部署到 Pages」与「业务 API 能否脱离本地 HSE」两个不同问题。

## 2. 审计范围

- 前置报告：H5-GRID-UI-01、H5-GRID-LOGIN-02、CF-WPS-01/02/03-A~D/04/05/06/07（实际文件名经目录核实，未猜测路径）
- Worker POC：`grid-mobile-cloudflare/worker/`（index.js 383→570 行、wrangler.toml、test/）
- H5 实际代码：`安全看板vben/apps/web-naive` 移动端路由树、API 模块、request 封装、生产构建产物 `dist/`
- WPS 链路：`server/services/wpsClient.js`、`wps/wpsFieldMap.js`、`wpsGridPullEngine.js`、`wps/gridEnrichmentService.js`、`wps/wpsDbsheetAdapter.js`
- WPS API 能力：以 CF-WPS-02 真机探针实证 + 官方文档口径交叉核对

## 3. 当前架构（审计实证）

- **H5 全部 API 走同源相对路径 `/api`**（`.env.production`: `VITE_GLOB_API_URL=/api`），由本地 Node HSE 后端（5876 生产 / 5882 dev）服务并直连 PostgreSQL。
- 生产路由为 **hash 模式**（`.env.production`: `VITE_ROUTER_HISTORY=hash`），dist 资源全部根相对（`/js /jse /css /geojson`）。
- 移动端 H5 的完整 API 依赖面（审计枚举）：

| 功能 | 端点 | 后端依赖 |
|---|---|---|
| 登录 | POST /api/mobile/auth/login | 本地 HSE + PG（users.phone/bcrypt/JWT） |
| 身份上下文 | GET /api/current-employee | 本地 HSE + PG |
| 照片上传 | POST /api/files/upload/image | 本地文件系统（/uploads） |
| 正常巡查提交 | POST /api/site-mgmt/grid-records | 本地 HSE + PG |
| 巡查列表/详情/网格 | GET /api/site-mgmt/grid-records 等 | 本地 HSE + PG |
| 违章人选择器 | GET /api/hse/employee（selector） | 本地 HSE + PG |
| 三违提交 | POST /api/violations | 本地 HSE + PG（violationService→violation_records） |

- **WPS 侧现状**：系统对 WPS 是**纯 Pull 单向**（wpsGridPullEngine 冻结，反向写入恒封禁）；`wpsClient.createRecords/updateRecords` 已封装且 create 端点经 Sprint-WPS-02-C 真机校准，但**当前无任何业务调用方**（WPS 板记录由人工/原有流程产生）。

## 4. 目标架构

```
手机 → Cloudflare Pages（静态 H5）
     → Pages Functions /api/* 反代（同源，业务零改动）
     → Cloudflare Worker（安全代理 + WPS 缓冲；JWT 验签 + secrets + CORS + 错误归一化）
     → WPS 多维表（网格巡查表 record create；照片链接镜像列）
     → 现有 WPS→PG Pull（grid_inspection_records + grid_record_sync_map）
     → 现有 HSE/PC 台账
```

Worker 不重做 HSE 后端；H5 不直连 PG、不访问本地 HSE、不接触 WPS 凭据。

## 5. Pages 审计 —— **READY**

| 审计项 | 结论 |
|---|---|
| 纯静态 SPA 发布 | 可行。生产 dist 为纯静态文件（8589 modules 构建两次通过，UI-01 已验证） |
| history fallback | **不需要**：生产为 hash 路由，深链刷新即 `/?#/mobile/...`，只托 index.html 即可 |
| 路由可用性 | /mobile/login、/mobile/index、/mobile/inspection/* 均为 hash 子路径，Pages 刷新无 404 风险 |
| 资源引用 | 全部根相对（`/js/... /jse/... /favicon.ico`），无内网/盘符硬编码 |
| API base | `/api`（同源相对）→ Pages 上用 `functions/api/[[route]].js` 反代到 Worker（本阶段已交付代码，未部署） |
| 运行时配置 | `_app.config.js` 注入 VITE_GLOB_API_URL，部署时可覆盖 |

## 6. Worker 审计（POC → 可复用 / 须废弃 / 须新建）

POC（`grid-mobile-cloudflare/worker/index.js`）做了什么：仅 WPS OAuth 授权 + `/v7/users/current` userinfo（KSO-1 签名、state 校验、token 绝不回传），离线测试 9 项。

| 项 | 判定 |
|---|---|
| KSO-1 签名实现 | **可复用**（与生产 wpsClient.kso1Sign 同算法） |
| OAuth2 token 端点口径 | **可复用**（client_id/client_secret 扁平响应，已按官方修正） |
| secret 纪律（env/Secret，不入 Git/日志/响应） | **可复用**（模式正确） |
| token 缓存 | POC 无（userinfo 一次性）；业务代理**须新建**（本阶段已建：client_credentials 缓存） |
| WPS record API 封装 | POC 无 → **须新建**（本阶段已建最小 create 代理） |
| CORS / 错误归一化 / JWT 验签 | POC 无 → **须新建**（本阶段已建） |
| 「可直接生产使用」 | ❌ POC 本身不可直接生产（无业务能力）；但骨架安全纪律合格，未发现生产风险代码 |

## 7. WPS schema 审计（真源 `server/services/wps/wpsFieldMap.js`）

1. 网格长巡查对应 **生产 .dbt 多维表**（`.env`: WPS_DBSHEET_FILE_ID/SHEET_ID，值本报告不落盘）
2. sheet = 网格巡查数据表（Sprint-WPS-02-B 补建列后的 Schema 与 FIELD_MAP 对齐）
3. 真实字段名：编号/姓名/分组名称/所属岗位/网格等级/日期/昵称2/三违行为/违章人姓名/性别/年龄/上报状态/是否需要整改/三违照片链接/整改后照片链接/示意图链接/当日是否报名/是否补交/提交时间/标记/**员工编码**（CF-WPS-06 建列）等
4. **员工编码字段已存在**（CF-WPS-06，readonly 产生方=WPS/移动端）
5. **图片1/2/3 语义**：生产板照片列是「链接镜像」列（`三违照片链接` type=link），**不是**原生 Attachment 直读；历史记录里 Attachment 对象形状为 `[{fileName,imgSize,size,source:'upload_ks3',type,uploadId}]`（CF-WPS-02 实证）
6. 普通巡查照片：同列（image_content 逗号串）；存量 PG 有 1700+ 行站内相对路径 `/uploads/grid-inspection/...`
7. WPS→PG 识别：**幂等键 = (wps_record_id, wps_file_id)**（禁自然键）
8. wps_record_id/wps_file_id/sync_hash：`grid_record_sync_map` 单事务 INSERT（Pull 铁律 2）
9. **18 hash 字段（冻结）**：nickname, area_team, personnel_name, position, grid_level, inspection_date, violation_behavior, violator_name, violator_gender, violator_age, signup_today, marker, is_resubmit, upload_time, serial_no, image_content, rectified_photo, schematic
10. 非 hash 扩展：report_status/vehicle_type/violation_type_result/need_rectification/rectifier + **employee_code**（第 24 列；新字段只准末尾追加，R4 负对照实证）

**结论：H5 经 Worker 写 WPS 新记录不触碰 18-hash 冻结口径**（追加记录只产生新 wps_record_id，存量 2061 条 hash 不变）。

## 8. WPS API 审计（官方口径 + 真机探针）

| 能力 | 状态 |
|---|---|
| record create | **已验证**（Sprint-WPS-02-C 真机校准：`POST /v7/coop/dbsheet/{fileId}/sheets/{sheetId}/records/create`，fields_value 为 JSON 字符串） |
| record list / update / delete | 已验证（list_by_page / update / batch_delete） |
| 新建 WPS 文件 / 工作表 | **404**（CF-WPS-02：3 类文件端点 + sheets 创建端点全 404）→ **无法自建隔离测试容器** |
| 原生 Attachment 上传 | 仅返回 `uploadId`，**无 URL**（CF-WPS-02 实证） |
| Attachment uploadId→URL（DBT v1 attachment/urls） | **404**（ARCH-03 真机） |
| `ksc-bj.ag.wps.cn` 对象 URL 签发端点 | 未在本应用调用面暴露 |

本阶段按「只实现 H5 必需最小 API」原则：仅实现 record create 代理；照片上传显式 501。

## 9. Attachment（照片）审计 —— **BLOCKED**

目标链「手机 → Worker → WPS Attachment → record → Pull → PG」的缺口仅在 Worker 侧：**在当前 V7 coop 调用面，没有任何已验证能力能把手机上传的图片变成可入库的 URL**。而 Pull 引擎对照片列只接受 `^https?://`（规则 5，保护存量相对路径不被抹掉），PG 台账 `<img>` 也需要可公开访问的 URL。

- WPS→PG 腿：**PASS**（生产记录 `三违照片链接` 列含 ksc-bj URL，fieldMap 已同步进 image_content，台账可读）
- Worker 上传→URL 腿：**未验证且真机探针 404**

按任务书 §七：**停止照片链路实现，不自行选择 OSS/COS/S3/R2 等新存储**，原因与待决策项见 §21。Worker 的 `/wps/upload/image` 以 **501 PHOTO_UPLOAD_UNAVAILABLE** 显式表达不可用（禁止假实现）。

## 10. 登录架构审计 —— **BLOCKED（架构缺口）**

对任务书 §八四方案的判定：

- **方案 A（Worker 自实现手机号+密码认证）**：不成立。Worker 连不了 PG（§十七.24 禁止公网开放 PG），简单复制 bcrypt/JWT 违反任务书。
- **方案 B（Worker 只做业务代理，认证走可达认证服务）**：认证服务=本地 HSE 后端，位于内网（192.168.10.101），**无公网入口**；建立公网入口（Tunnel/反代/公网 IP）属新基础设施，须授权。
- **方案 C（WPS 存身份/密码）**：违反任务书原则，直接排除。
- **方案 D（新最小认证服务）**：等于新部署一套服务（含 users.phone 读权 + bcrypt + JWT），超本阶段边界。

**书面结论：Cloudflare 全静态架构下，当前 JWT 登录存在架构缺口** —— `/api/mobile/auth/login` 与 `/api/current-employee` 均依赖本地 PG，Pages→Worker→WPS 通道无法承载。

**已落地的最小桥接（复用而非重写）**：Worker 新增 `/wps/records/create` 以 **JWT_VERIFY_SECRET（与本地 HSE 后端同一密钥）做 HS256 验签**——登录态仍由现有体系签发，Worker 只验签不签发，不新建认证、不改 JWT payload。这为「下一阶段认证服务可达化（如 Cloudflare Tunnel）」预留了即插即用的安全门。

**桥接交叉验证（dev 实证，test/jwt-bridge.test.mjs 3/3）**：dev 后端 `/api/auth/login` 真实签发的 JWT → Worker `verifyJwt` 用同一密钥**验证通过**；篡改签名/错误密钥**拒绝**；真实 JWT → 门1(JWT)→门2(写开关)→WPS record create（mock upstream）全链 200。即：Worker 验签门与现有 HSE 令牌体系**零改动兼容**，已实证；剩余缺口仅为「认证服务公网可达性」这一部署层问题。

## 11. employee_code 审计 —— 链路 READY，归因接线有缺口

- WPS「员工编码」列已建（CF-WPS-06），Pull 投影第 24 列（不参与 sync_hash）
- H5 只提交业务数据（employee_code=业务快照），不提交 inspector_employee_id/grid_id（Worker 白名单强制剥离这两个 PG 权威列名，测试 T3 断言）
- Pull 后归因：`gridEnrichmentService`（employee_code → gridEmployeeCodeResolver → employee.id → gridScope 唯一网格）**已实现且单测覆盖，但当前无生产调用方**（grep 全库仅单测引用）——即 Pull 落库后 inspector_employee_id/grid_id 恒为 NULL、attribution_status=pending。**接线归因属生产链变更，须下一阶段授权**；本阶段不改（禁止项 19：不改 CF-WPS-07 归因规则）。

## 12. 正常巡查链路（H5→Worker→WPS→Pull→PG）

**关键问题 §六 的回答：可以，且已由既有代码证明**：
- Worker→WPS：record create 端点真机校准（wpsClient.createRecords 同款端点/格式），Worker v2 最小代理已实现并通过离线测试；
- WPS→PG：Pull 引擎按 (wps_record_id, wps_file_id) 幂等 INSERT grid_inspection_records + grid_record_sync_map，新记录自动入库；
- 18-hash：不变（§7）；employee_code 随投影第 24 列入库。

**残余缺口（如实声明）**：H5 的「巡查记录列表/详情」读接口（/api/site-mgmt/grid-records 等）仍依赖本地 PG——纯 Cloudflare 下 H5 写入成功后**自己看不到记录**（除非下一阶段为读接口建 WPS 查询代理）。本地依赖面上登录/照片同样 BLOCKED（§9/§10）。

判定：**写腿 READY（待真实 WPS 写授权联调）；整链端到端未验证（无生产 WPS 写权限）**。

## 13. 三违链路

- 三违现场记录（行为/违章人快照/照片）在网格巡查表中字段齐全（三违行为/违章人姓名/性别/年龄/三违照片链接），**网格巡查表的 WPS 写腿与正常巡查相同**；
- 但 H5 三违提交的业务落点是 **`violation_records`（PC 三违台账，POST /api/violations → violationService）**，且违章人选择器依赖 PG employee 数据——两者在纯 Cloudflare 下**无 WPS 通道**。
- 按任务书 §十六：不重写 violationService。**报告声明：三违业务 API 在完全脱离本地 HSE 后端时存在依赖。** 最小桥接建议见 §22。

判定：**BLOCKED（纯 Cloudflare）**。

## 14. 安全审计

- WPS APPKEY/APPSECRET/access_token/refresh_token：仅 Worker 服务端 Secret（wrangler secret put），不入 Git/wrangler.toml 明文/日志/响应——测试 T7 全路由扫描断言
- JWT_VERIFY_SECRET：与本地 HSE 后端同值，仅验签（HS256 + exp 校验，Web Crypto 实现，无新依赖）
- 日志：Worker 不打印 body/token；手机号不落 Worker 日志（业务字段白名单仅含 WPS 列名值透传）
- 写防护三重门：JWT 门（503 未配置=拒）→ ALLOW_WPS_WRITE 显式 'true'（403 fail-closed）→ WPS 目标文件配置门（503）
- 字段白名单：仅放行 wpsFieldMap 移动端相关列；`inspector_employee_id`/`grid_id` 强制剥离（防 H5 越权直写 PG 权威列）
- 错误归一化：`{success:false, code, message}`；上游原始 body 不回传（测试 T4 断言）
- CORS：CF_ALLOWED_ORIGINS 白名单，默认空=拒绝全部跨域

## 15. 环境隔离

- **无法自建隔离 WPS 容器**（文件/工作表创建端点 404，CF-WPS-02）→ 任务书 §十三「优先独立测试文件」不可行。
- 本阶段因此**未向任何真实 WPS 写入测试数据**（§十七.3「禁止生产 WPS 写测试数据」优先于「临时记录+清理」路径）。WPS 写验证（§十八 D/E/F/G）标记为**未验证/待授权**。
- Worker 测试全部离线（mock upstream，连真实 WPS 都不触网）；测试脚本自检 env（WPS_OPENAPI_BASE 指向 mock 域）。
- 数据库侧本阶段零 DML（dev 与生产均未触碰）。

## 16. 测试结果

| 验证项（§十八） | 结果 | 方式 |
|---|---|---|
| A Pages production build | ✅ 已验证 | UI-01 两次构建通过（8589 modules）；**本阶段复验**：新增 mobile-transport.ts 后 production build 通过（49.82s，隔离 outDir，生产 dist 零污染——mtime 仍为 2026-09-14，dist.zip 内容条目未变） |
| B Worker 本地启动 | ✅ 已验证 | 两层：直驱 fetch handler（cfwps08.test.mjs）+ **真实 HTTP 冒烟**（node http server 包 worker.fetch，401/501/404 经真实 socket 返回，http-smoke.mjs 3/3）；wrangler dev 属部署侧，不阻塞 |
| C Worker secrets 使用方式 | ✅ 已验证 | wrangler.toml 注释流程 + env 读取；T7 泄露扫描 |
| D WPS test file record create | ⛔ 未验证 | 无隔离容器 + 禁生产写（§15） |
| E WPS test attachment upload | ⛔ 未验证 | 同上；且能力本身 404（§9） |
| F WPS record+attachment 查询 | ⛔ 未验证 | 同上 |
| G WPS→PG test pull | ⛔ 未验证 | 同上（Pull 引擎本身为已冻结生产在跑能力，非本阶段代码） |
| H employee_code 保留 | ✅ 已验证（代码层） | 白名单含员工编码列；Pull 投影含 employee_code（CF-WPS-06 既有断言） |
| I sync_hash 18 字段稳定 | ✅ 已验证 | 模块加载 fail-fast 断言（FROZEN_HASH_SEGMENT）+ 追加记录不触碰存量 hash 的结构性论证 |
| J 正常巡查最小闭环 | ◐ 部分 | Worker 写腿离线 8/8；真实 WPS→PG 闭环待授权 |
| K 三违照片最小闭环 | ⛔ BLOCKED | §13 |
| L 登录架构可行性 | ⛔ BLOCKED | §10（架构缺口=认证服务公网可达性；**桥接验签已与 dev 后端真实令牌交叉验证通过**：jwt-bridge.test.mjs 3/3，Worker 验签门与现有 HSE JWT 零改动兼容） |
| M CORS | ✅ 已验证 | T6 |
| N 401/403/409/5xx 归一化 | ✅ 已验证 | T1/T2/T4（409 语义暂无场景：record create 无重复冲突路径，预留 code 体系） |
| O 网络失败 | ✅ 已验证 | 上游异常→502 归一化（T4）；token 失败→503 |
| P Worker 不泄露 secret | ✅ 已验证 | T7 全路由扫描 |
| Q production 防误写护栏 | ✅ 已验证 | ALLOW_WPS_WRITE fail-closed（T2）+ 白名单剥离 PG 权威列（T3）+ 本阶段零真实写入 |

**新增自动化测试：Worker 业务代理 8/8 通过（test/cfwps08.test.mjs）+ 真实 HTTP 冒烟 3/3（test/http-smoke.mjs）+ JWT 桥接交叉验证 3/3（test/jwt-bridge.test.mjs，dev 后端真实令牌 × Worker 验签门）；POC 回归 9/9 不破坏（oauth-flow.test.mjs）；production build 复验通过且生产 dist 零污染；前端 vue-tsc 全库错误数与基线持平（60），新增文件 0 错误。**

## 17. 修改文件（实际）

| 文件 | 变更 |
|---|---|
| `grid-mobile-cloudflare/worker/index.js` | 追加 CF-WPS-08 增量：`/wps/records/create`（JWT 验签+写开关+白名单+错误归一化）、`/wps/upload/image`（501 显式）、CORS、client_credentials token 缓存、`verifyJwt`；POC 原路由/导出不动 |
| `grid-mobile-cloudflare/worker/wrangler.toml` | 新增 vars：WPS_OPENAPI_BASE / WPS_DBSHEET_FILE_ID / WPS_DBSHEET_SHEET_ID / CF_ALLOWED_ORIGINS /（注释）ALLOW_WPS_WRITE；新增 secret 说明 JWT_VERIFY_SECRET |
| `grid-mobile-cloudflare/worker/test/cfwps08.test.mjs` | **新增** 离线测试 8 项 |
| `grid-mobile-cloudflare/worker/test/http-smoke.mjs` | **新增** 真实 HTTP 冒烟 3 项 |
| `grid-mobile-cloudflare/worker/test/jwt-bridge.test.mjs` | **新增** JWT 桥接交叉验证 3 项（dev 后端真实令牌；JWT_SECRET 仅内存使用，绝不打印/落盘） |
| `grid-mobile-cloudflare/pages/functions/api/[[route]].js` | **新增** Pages Functions 同源 /api 反代（仅设计交付，未部署） |
| `安全看板vben/apps/web-naive/src/api/mobile-transport.ts` | **新增** H5 transport 抽象接缝（默认同源 /api，无调用方，业务零改动） |

## 18. 未修改文件（明确声明）

login.vue / capture.vue / normal.vue / issue.vue / violation.vue / ledger.vue / detail.vue / me.vue / layouts/mobile.vue、authStore、PC 登录、auth.js、JWT 签发/中间件、wpsClient.js、wpsFieldMap.js、wpsGridPullEngine.js、gridEnrichmentService.js、gridEmployeeCodeResolver.js、violationService、CF-WPS-07 迁移、/mw、Cloudflare OAuth POC 路由——全部未动。

## 19. 生产操作说明

**生产操作：无。** 生产数据库零 DDL/DML；生产 WPS 零写入（连测试写入都没有）；无生产部署/重启/dist 替换；Cloudflare 未发布。唯一与生产的接触是**只读**阅读生产配置键名与既有报告。

## 20. 风险

1. **照片存储无解（高）**：WPS Attachment→URL 能力在当前调用面不存在（真机 404），任务书禁止自选第三方存储。若下一阶段仍无 WPS 官方能力开放，Cloudflare 架构下的三违照片链路无法成立（见 §21 决策项）。
2. **登录架构缺口（高）**：方案 B 需要认证服务公网可达。推荐 **Cloudflare Tunnel → 本地 HSE 后端**（免费、不开放 PG、不暴露公网 IP），但属新基础设施，须授权评估。
3. **归因接线缺口（中）**：H5 经 WPS 写入的记录在 Pull 落库后 inspector_employee_id/grid_id 恒 NULL（enrichment 无调用方），台账「已归属」口径会滞后；接线须生产变更授权。
4. **读接口缺口（中）**：纯 Cloudflare 下 H5 无法读巡查列表/详情（依赖本地 PG）；需 WPS 查询代理或 hybrid 架构。
5. **WPS 写联调未做（中）**：record create 真机校准发生在 PC 后端上下文；Worker 上下文（出口 IP/限频 10 qps）未真机验证。
6. Pages Functions 与 Worker 的 **双域 CORS/cookie** 细节（OAuth state 等）需部署联调。

## 21. 阻塞项（须业务负责人决策/授权）

| # | 阻塞 | 需要的决策 |
|---|---|---|
| B1 | 登录在纯 CF 下 BLOCKED | 授权 Cloudflare Tunnel（或等效）把本地 HSE 认证服务纳入公网可达；或授权方案 D 最小认证服务 |
| B2 | 照片在纯 CF 下 BLOCKED | 与 WPS 核实官方「附件上传→URL」能力（或提供企业云文档上传 API 的可用性结论）；或授权保留本地照片服务（hybrid） |
| B3 | WPS 真实写入联调 | 授权 Worker 对生产 .dbt 的**受控测试写入**（带 TEST 标记 + WPS_SYNC_EXCLUDE_EXTRA 防护 + 完整清理），或提供隔离测试文件（WPS 控制台人工置备——API 建文件 404） |
| B4 | 三违台账无 WPS 通道 | 决策三违记录在 CF 架构下的归属（仅网格巡查表快照 / 暂留本地 / 后续阶段桥接） |
| B5 | 归因接线 | 授权在生产 Pull 链后启用 gridEnrichmentService employee_code 归因（生产变更） |

## 22. 下一阶段建议（按优先级）

1. **CF-WPS-09（建议）**：Cloudflare Tunnel 打通认证 + current-employee；真机联调 Worker record create（B1+B3+B5 一并授权）
2. 与 WPS 开放平台核实附件能力（B2）——结论直接决定照片架构
3. H5 读接口的 WPS 查询代理设计（列表/详情脱离本地 PG）
4. Pages 正式发布（静态 READY，随时可发；但发布前须 B1/B2 至少一项落地，否则 H5 不可用）

## 23. 回滚方案

- 本阶段产物全部为**新增/追加**：删除 `mobile-transport.ts`、`pages/functions/`、`test/cfwps08.test.mjs`、`worker/index.js` 的 CF-WPS-08 增量段（单一明确代码块）+ `wrangler.toml` 增量 vars 即完全回到 UI-01/LOGIN-02 状态；无数据库/WPS/前端业务改动需要回滚。
- 未来启用 ALLOW_WPS_WRITE 后的回滚：置空即禁写（fail-closed）；Worker 误写记录可用 WPS batch_delete（已验证端点）按 recordIds 清理，且可用 `WPS_SYNC_EXCLUDE_EXTRA` 阻断其进入 PG。

## 24. 最终状态

| 链路 | 状态 |
|---|---|
| Pages | **READY**（未部署） |
| Worker | **READY**（最小代理已实现并离线验证；未部署） |
| WPS Record | **READY**（真机端点已校准 + 代理就绪；真实写入联调待授权） |
| WPS Attachment | **BLOCKED**（能力真机 404，无上传→URL 通道） |
| WPS→PG | **READY**（冻结引擎在跑；归因接线待授权） |
| employee_code | **READY**（列/投影/resolver 就绪；归因接线待授权） |
| 正常巡查（纯 CF 端到端） | **READY_WITH_GAPS**（写腿通；读腿+照片缺口） |
| 三违（纯 CF） | **BLOCKED** |
| 登录（纯 CF） | **BLOCKED**（桥接验签已就绪） |
| **整体架构** | **BLOCKED**（按 §十九：关键链路 BLOCKED 时不得宣称 Cloudflare 架构已完成；Pages/Worker/写腿三块 READY 已为下一步消除全部代码层障碍） |

### 状态口径声明（§二十一）

- **已验证**：Worker 离线测试 8 项、POC 回归 9 项、Pages 构建可行性（静态审计+既有构建）、sync_hash 冻结断言、CORS/错误归一化/secret 泄露扫描
- **代码已实现（未真机验证）**：Worker record create 代理、JWT 验签、Pages Functions 反代、H5 transport 接缝
- **仅设计**：认证公网可达方案（Tunnel）、照片存储替代决策、三违桥接、读接口 WPS 代理
- **未验证**：真实 WPS 写入、WPS→PG 经 Worker 写入的端到端、Attachment 上传
- **生产未部署**：全部
