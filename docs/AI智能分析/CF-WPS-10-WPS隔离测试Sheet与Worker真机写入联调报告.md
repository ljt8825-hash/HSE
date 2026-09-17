# CF-WPS-10：WPS 隔离测试 Sheet 与 Worker 真机写入联调报告

> 阶段：CF-WPS-10 ｜ 日期：2026-09-15 ｜ 执行：WorkBuddy（AI 审计与联调）
> 性质：【审计 → 隔离 Sheet 确认 → 最小代码修改 → 真机联调 → 清理 → 污染检查 → 报告】。本阶段无生产部署授权，未执行任何生产操作。

---

## 1. 执行摘要

**目标达成**：手机 H5 未来提交链路的核心一段——「Worker → WPS 多维表隔离测试 Sheet」的真实写入闭环已在真机打通：

- 测试 Sheet「H5提交测试」（sheet_id=13）由业务方经 WPS 网页界面人工创建（API 建 Sheet 保持禁用，CF-WPS-09 实测 404）；
- Worker `POST /wps/records/create`（`target=test`）**真机创建成功**（真实 WPS 响应 code=0、真实 record_id `CKB`）；
- 失败门（401/401/403/503/413/400）**6/6 真机 PASS**；上游错误标准化 502 **真机 PASS**；secret 零泄露**真机 PASS**；
- **幂等真机 PASS**：同一 `client_request_id` 二次提交返回 `deduplicated:true`，测试 Sheet 记录数不变、无重复记录；
- 测试记录 **4 条全部按 `CF-WPS-10-TEST-` 前缀精确清理**，业务方原始 3 条数据零触碰；生产 Sheet 3 记录数全程 2063 不变。

**CF-WPS-10_STATUS=PASS_WITH_RISK**
（唯一扣分项：幂等机制为「扫描式预查」，仅适用于小体量隔离 Sheet；生产通道幂等为 PENDING——见 §13，未伪造 PASS。）

## 2. 测试 Sheet 信息

| 项 | 值 |
|---|---|
| 文件 | 三违巡查台账 `cn229thwalDs`（kdocs.cn/l/cn229thwalDs） |
| Sheet | **H5提交测试，sheet_id=13**（业务方 WPS 网页界面人工创建，非 API） |
| 创建方式合规性 | ✅ 遵守 §二：未通过 API 建 Sheet（CF-WPS-09 实测建 Sheet/建文件端点 404） |
| 用途限定 | 仅 CF-WPS-10；配置仅存在于 Worker 测试环境变量 `WPS_DBSHEET_TEST_SHEET_ID` |

## 3. Schema 实读（2026-09-15 真机）

Sheet 13 实测 10 字段（与 §三 要求一一对应）：

| 字段名 | 实测类型 | 说明 |
|---|---|---|
| 测试编号 | MultiLineText | 测试唯一标识（CF-WPS-10-TEST-<ts>） |
| employee_code | MultiLineText | 业务身份验证列（§五） |
| 姓名 | MultiLineText | |
| 巡查时间 | **Date** | 唯一非文本列；真机实测字符串 `2026-09-15` 被 WPS 自动归一为 `2026/09/15` 落表 |
| 网格 | MultiLineText | |
| 问题描述 | MultiLineText | |
| 来源 | MultiLineText | 承载 source_channel 语义（worker_realtest） |
| 测试状态 | MultiLineText | |
| client_request_id | MultiLineText | 幂等键 |
| 创建时间 | MultiLineText | 文本列（与「巡查时间」Date 列并存） |

审计记录：实测 schema 与建议结构的差异仅为「巡查时间」为 Date 类型（其余均文本）——按 §三 纪律未改变业务含义，实测 Date 列接受 ISO 日期字符串。

## 4. Worker 写入链路（真实实现）

```
测试脚本（真实 fetch，无 mock）
  → Worker handleRecordCreate
     → 门1 JWT 验签（JWT_VERIFY_SECRET，HS256，dev 后端真实登录签发的令牌）
     → 门2 ALLOW_WPS_WRITE fail-closed（403）
     → 门3 目标选择：body.target==='test' → WPS_DBSHEET_TEST_SHEET_ID(13)；未配置 → 503
        （缺省无 target → 生产 Sheet 3 通道，行为与 CF-WPS-09 版本完全一致）
     → 门4 体限制 512KB → 413
     → 白名单（TEST_FIELD_WHITELIST / RECORD_FIELD_WHITELIST）+ PROTECTED_FIELDS 剥离
     → 幂等预查（仅 test：list_by_page 扫描 client_request_id，命中即返回 deduplicated）
     → WPS V7 /v7/coop/dbsheet/cn229thwalDs/sheets/13/records/create
  → 标准化响应 { success, code, recordIds [, deduplicated] }
```

**本次实际修改文件**（全部限 `grid-mobile-cloudflare/worker/`，遵守 §十三）：

| 文件 | 修改 |
|---|---|
| `index.js` | ① `TEST_FIELD_WHITELIST`（10 测试列）与 `BODY_META_FIELDS`/`MAX_BODY_BYTES`；② `target=test` 目标语义 + 503 fail-closed；③ 413 体限制；④ 幂等预查 `findExistingByClientRequestId`（含 `fields_value ?? fields` 双形态兼容，Sheet 13 实测返回键为 `fields`）；⑤ `employee_code` 仅测试目标放行（生产通道仍无条件剥离） |
| `test/cfwps10.test.mjs` | **新增** 离线测试 8 项（mock upstream，零触网） |
| `test/cfwps10-realtest.mjs` | **新增** 真机联调脚本（回归资产；凭据从 server/.env 内存读取，永不打印；JWT 来自 dev 后端真实登录） |

未修改：HSE 业务代码、WPS Pull、CF-WPS-07、生产 SQL、三违业务、登录体系、照片系统（照片 501 语义原样保留）。

## 5. 真机 records/create 证据（PASS_REAL）

真实 WPS API 返回证据（非 mock）：

1. **S1 创建**：HTTP 200，`{"success":true,"code":"OK","recordIds":["CKB"]}`——WPS 服务端生成真实 record_id；
2. **S2 落表回读**（list_by_page 全量回扫）：record_id=`CKB`，10 字段全部正确——`employee_code=00307234`、`client_request_id` 一致、`巡查时间=2026/09/15`（Date 归一）、**`grid_id`/`inspector_employee_id`/`attribution_status` 零残留**（提交体中故意携带，全部被剥离）；
3. **F7 上游错误**（真实 WPS 对虚拟 sheet 999999 的非 0 响应）→ Worker 标准化 502 `WPS_UPSTREAM_ERROR`，不回传上游原始 body；
4. 上游请求格式：`{prefer_id:false, records:[{fields_value:"<JSON>"}]}`（与生产 wpsClient.createRecords 同端点同格式）。

**关键实测发现（新增踩坑知识）**：`list_by_page` 返回记录键因 Sheet 而异——Sheet 3/11 为 `fields_value`，**新建 Sheet 13 为 `fields`**（值同为 JSON 字符串）。Worker 幂等预查已做双形态兼容；此差异已回写知识库（wps-dbsheet-api skill）。

## 6. 字段映射

| 测试字段 | WPS 列 | 白名单状态 |
|---|---|---|
| 测试编号 / 姓名 / 网格 / 问题描述 / 来源 / 测试状态 / 创建时间 | 同名列 | ✅ 允许 |
| employee_code | 同名列 | ✅ **仅测试 Sheet 放行**；生产巡查 Sheet 通道仍为 PROTECTED（剥离） |
| 巡查时间 | Date 列 | ✅ 允许（ISO 字符串，WPS 归一） |
| client_request_id | 同名列 | ✅ 允许（幂等键） |
| grid_id / inspector_employee_id / attribution_status / deduction / responsibility / review | — | ❌ PROTECTED，真机验证零残留 |
| 身份证号 / 手机号 / password_hash / access_token 等敏感字段 | — | ❌ 白名单外（且本次提交体从未包含） |

## 7. allowlist（真机）

- 白名单内字段全部写入成功（S2 回读一致）；
- 白名单外字段（如 `身份证号`）真机 400 `BAD_REQUEST`（F6：全白名单外 → 400 且**不触上游**）；
- 记录内混入 `target` 元字段 → 被忽略（BODY_META_FIELDS）。

## 8. protected fields（真机）

提交体故意携带 `grid_id=133`、`inspector_employee_id=6697`、`attribution_status=pending` → 创建成功后回读**三列均不存在**。真机 PASS_REAL。

## 9. JWT（真机）

- 令牌来源：**dev 后端 `/api/auth/login` 真实登录签发**（非自签，PASS_REAL 口径）；
- 无 JWT → 401（F1）、无效 JWT → 401（F2）；
- 与现有 HSE JWT 体系同密钥只验签（CF-WPS-08 jwt-bridge 3/3 回归通过）。

## 10. error normalization（真机）

| 场景 | 实测 |
|---|---|
| 无/无效 JWT | 401 `UNAUTHORIZED` ✅ |
| 写开关关闭 | 403 `WPS_WRITE_DISABLED` ✅ |
| 测试 Sheet 未配置 | 503 `TEST_SHEET_NOT_CONFIGURED` ✅ |
| body 超限 | 413 `BODY_TOO_LARGE` ✅ |
| 全白名单外 | 400 `BAD_REQUEST`（不触上游）✅ |
| WPS 上游错误（真实非 0 响应） | 502 `WPS_UPSTREAM_ERROR`，原始 body 不透传 ✅ |
| 成功 | 200 `{success,code:'OK',recordIds[,deduplicated]}` ✅ |

## 11. body limit（真机）

`Content-Length > 512KB` → 413 `BODY_TOO_LARGE`（F5 真机 PASS）。上限值写入 `MAX_BODY_BYTES`，纯文本记录场景余量充足。

## 12. secret audit（真机）

全量响应体扫描（含成功/失败/上游错误全部响应）：`APP_SECRET`、真实 JWT、`app access_token` **零出现**（S4 PASS_REAL）。补充：`wrangler.toml` 无明文凭据（CF-WPS-08 结论维持）；本次真实调用未产生任何 Worker 常规日志（本地直驱 handler；Cloudflare 部署侧日志纪律见 CF-WPS-08 §11）。

## 13. 幂等验证（真机 + 诚实定级）

- **真机 PASS_REAL（隔离测试 Sheet 范围）**：同一 `client_request_id` 第二次提交 → `deduplicated:true`、返回既有 record_id、**测试 Sheet 记录数 7→7 不变**（S3）；
- **机制**：create 前对目标 Sheet 做 `list_by_page` 扫描（200/页、上限 20 页）按 `client_request_id` 查重，命中即不创建；
- **定级（不伪造）**：
  - 隔离测试 Sheet（小体量）：**PASS_REAL**（扫描式幂等成立）；
  - 生产巡查 Sheet（2063+ 条持续增长）：**IDEMPOTENCY_PENDING**——扫描式查重在 O(n) 成本与限频（10 req/s）下不可持续，真正幂等需 WPS 侧条件查询端点（官方能力清单存在但调用面未确证）或服务端幂等登记（后续阶段实现）。当前生产通道行为：无幂等（重复提交会产生重复记录），与 CF-WPS-09 报告结论一致。

## 14. 测试数据清理（真机）

- 清理方式：`batch_delete`（真实 WPS API，HTTP 200），**仅精确匹配 `CF-WPS-10-TEST-` 前缀**的记录；
- 结果：本次 + 前两次试运行共 **4 条测试记录全部删除**（ids 含 CKA/CKB 等）；
- **业务方原始 3 条数据零触碰**（清理后 Sheet 13 剩余 3 条 = 业务方建表时自建的示例数据）；
- 测试数据清单：测试编号 `CF-WPS-10-TEST-1789xxxxxx` ×4（含两次试运行各 1-2 条与正式运行 1 条），**清理状态=已全部删除**。

> 试运行记录：第一轮暴露脚本字段解析 bug（`fields_value` vs `fields`），第二轮暴露幂等预查同源问题——两轮产生的测试记录均在本轮按前缀清理完毕。

## 15. 生产污染检查

| 检查项 | 结果 |
|---|---|
| 生产 Sheet 3 记录数 | 联调前后 **2063 → 2063 不变**（真机全量扫描核对）✅ |
| 写调用面 | 全部 URL 为 `sheets/13/`（F7 为虚拟 999999）；**零 `sheets/3/` 写调用** ✅ |
| 生产 PG | Worker 链路根本不接触 PG（架构性隔离）；本次零 DML ✅ |
| 生产 WPS 正式数据 | Sheet 3 / Sheet 11 未做任何写操作 ✅ |
| Cloudflare Tunnel / 内网穿透 | **没有** ✅ |
| 生产部署 / 服务重启 | **没有** ✅ |

## 16. 风险

1. **生产幂等 PENDING**（§13）：生产通道重复提交会产生重复记录（既有已知限制，非本阶段引入）；
2. **`fields` vs `fields_value` 形态分叉**：WPS 不同 Sheet 版本返回键不同——任何新增读取逻辑都必须双形态兼容（已回写知识库）；
3. **`target=test` 语义依赖环境变量**：`WPS_DBSHEET_TEST_SHEET_ID` 配置于 Worker 环境时测试通道开放；部署侧须确保生产环境**不配**该变量（fail-closed 503 兜底已实现）；
4. Date 列归一行为（`2026-09-15`→`2026/09/15`）由 WPS 服务端决定，消费侧不得假设原始格式。

## 17. blocker

无本阶段 BLOCKER。遗留待授权项（继承自 CF-WPS-09，不变）：附件通道（ATTACHMENT_BLOCKED）、登录/身份表（CF-WPS-11）、归因接线（B5）、生产通道幂等机制（见 §13）。

## 18. 回滚方式

- `git revert` Worker 三文件（`index.js`、`test/cfwps10.test.mjs`、`test/cfwps10-realtest.mjs`）即恢复 CF-WPS-09 状态；行为影响仅限未部署的 Worker POC；
- WPS 侧：测试记录已清理完毕，Sheet 13 可保留（后续阶段复用）或由业务方 UI 删除；
- 配置回滚：移除 Worker 测试环境 `WPS_DBSHEET_TEST_SHEET_ID` 即关闭测试通道（fail-closed 503）。

## 19. CF-WPS-10_STATUS

**PASS_WITH_RISK**

验收条件对照（§十六）：

| # | 条件 | 结果 |
|---|---|---|
| 1 | 隔离 Sheet 创建成功 | ✅（业务方 UI 创建，sheet_id=13） |
| 2 | schema 实读成功 | ✅ PASS_REAL（10 字段实读） |
| 3 | Worker → WPS create 真机成功 | ✅ PASS_REAL（record_id=CKB，真实 code=0） |
| 4 | allowlist 正常 | ✅ PASS_REAL |
| 5 | protected fields 正常 | ✅ PASS_REAL（零残留） |
| 6 | JWT 安全正常 | ✅ PASS_REAL（真实登录令牌 + 401/401） |
| 7 | error normalization 正常 | ✅ PASS_REAL（含真实上游 502） |
| 8 | body limit 正常 | ✅ PASS_REAL（413） |
| 9 | secret discipline 正常 | ✅ PASS_REAL（全响应零泄露） |
| 10 | 测试数据可清理 | ✅ PASS_REAL（4 条全清、原始数据零触碰） |
| 11 | 无生产数据变化 | ✅（Sheet 3 2063 不变；PG 零接触） |
| 12 | 无 Cloudflare Tunnel | ✅ 没有 |
| 13 | 无本地 HSE/PG 访问（Worker 链路） | ✅（JWT 仅由测试脚本从 dev 后端获取令牌，Worker 本身未访问本地服务） |
| 14 | 无照片系统修改 | ✅（501 语义原样） |
| 15 | 无三违业务修改 | ✅ |

扣分项（PASS → PASS_WITH_RISK 的唯一原因）：生产通道幂等 IDEMPOTENCY_PENDING（§13），按 §十五纪律如实定级，未把 Mock/测试 Sheet 范围的结论外推到生产通道。

---

## 附：测试口径总表

| 测试 | 口径 | 结果 |
|---|---|---|
| F1/F2 401、F3 403、F4 503、F5 413、F6 400、F7 502、S1 创建、S2 落表回读、S3 幂等、S4 泄露扫描、C1 清理、P1/P2 污染检查 | **PASS_REAL**（真实 WPS API + dev 后端真实 JWT） | 14 项全过 |
| cfwps10.test.mjs（T1-T8） | PASS_MOCK（离线 mock upstream） | 8/8 |
| cfwps08.test.mjs / oauth-flow / http-smoke / jwt-bridge 回归 | PASS_MOCK + jwt-bridge 为 PASS_REAL（dev 后端真实令牌） | 8/8 + 9/9 + 3/3 + 3/3 |
| 生产通道幂等 | **IDEMPOTENCY_PENDING** | — |
| 附件 uploadId→URL | **BLOCKED**（维持 CF-WPS-09 裁定，本阶段未触碰） | — |
| 登录/身份表/password_hash | **DESIGN_ONLY → CF-WPS-11**（本阶段未实施） | — |
