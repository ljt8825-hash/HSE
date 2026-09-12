# HSE-MOBILE-GRID-ARCH-03-P2-B1-A 审计报告
## WPS Creator + Attachment 正式接入前技术审计

- **阶段性质**：READ-ONLY AUDIT + IMPLEMENTATION DESIGN（只读审计 + 最小实现方案设计）
- **前置阶段**：P2-B0 / P2-B0-CONT（基础设施已落地于 `safety_dashboard_dev`）
- **本阶段红线**：不修改生产 / 不修改移动 H5 / 不修改 Pull Engine / 不修改数据库 / 不调用 WPS 写接口 / 不进行正式切换
- **执行方式**：全部为静态代码 + 配置 + 已落地 P2-B0 证据 + WPS 官方文档知识复核；**本次未发起任何 WPS 网络调用（含只读列举）**，未执行任何 DDL/DML
- **生成时间**：2026-09-12

---

## 0. 审计结论速览（写在前）

| 能力 | 当前代码实况 | 判定 |
|---|---|---|
| WPS Client 端点 | 仅 record CRUD + schema（自研 REST，无 SDK） | 已实现（受限集合） |
| WPS Creator 身份（API 元数据层） | `list_by_page` 返回 `{id, fields, lastModifiedTime, createdTime}`，**无 creator/submitter/account_id** | **NOT_AVAILABLE_IN_CURRENT_CLIENT** |
| WPS Creator（表单「创建人」列） | 官方能力存在，但当前 FIELD_MAP 未映射、生产表单是否启用 UNVERIFIED | **UNVERIFIED** |
| Creator → employee 自动映射 | 无；`wps_account_employee_map` 为 P2-B0 空表 | 需人工/可信外部维护 |
| Attachment 上传/换 URL 端点 | 项目 `wpsClient.js` **未实现**任何 attachment 端点 | **UNVERIFIED**（平台文档有，项目未接） |
| Attachment → 稳定 URL | 原生字段值 `{fileName,uploadId,source}` 无 URL；换 URL 需 DBT v1 端点（跨 API 面授权未确认） | **UNVERIFIED** |
| Pull 不改代码的 Enrichment 接线 | 独立 enrichment worker + 可选独立 cron（方案 E/D） | 可行，不触冻结层 |
| 数据库是否需新增字段 | 否（P2-B0 已建齐扩展列 + 桥接表） | 无需新增 |

**最终判定（§十七）**：`READY_FOR_P2-B1-B`（附带明确 UNVERIFIED 清单与前置验证项）。
**本阶段不自动进入 P2-B1-B（§十八）**。

---

## 1. WPS 当前真实 Client / API 能力

来源：`server/services/wpsClient.js`（唯一直接接触 WPS HTTP 的模块），`server/services/wps/wpsDbsheetAdapter.js`。

**认证**
- `POST {WPS_OPENAPI_BASE}/oauth2/token`，`grant_type=client_credentials` → Bearer `access_token`（wpsClient.js:55-102）。
- KSO-1 签名：`WPS_API_SIGNATURE=true` 时附加 `X-Kso-Date`/`X-Kso-Authorization`（wpsClient.js:112-115,129-133）；当前 `.env:89` `WPS_API_SIGNATURE=false` → 关闭。
- token 缓存 7200s，失效（`code=401000001/401`）强刷一次（wpsClient.js:166-171）。

**配置坐标（`.env` 实测）**
- `WPS_OPENAPI_BASE=https://openapi.wps.cn`（.env:83）
- `WPS_DBSHEET_FILE_ID=cn229thwalDs`（.env:84）
- `WPS_DBSHEET_SHEET_ID=3`（.env:85）
- `WPS_APP_ID=AK20260908RJTXYG` / `WPS_APP_SECRET=***`（.env:86-87，已配置）
- `WPS_GRID_SYNC=true` / `WPS_GRID_DATA_SOURCE=false` / `SCHEDULER_ENABLED=true`（.env:100-101,104）

**已实现端点（`recPath()` = `/v7/coop/dbsheet/{fileId}/sheets/{sheetId}/records`，wpsClient.js:191-193）**
| 用途 | 端点 | 方法 | 位置 |
|---|---|---|---|
| 列举 | `.../records/list_by_page` | POST | wpsClient.js:211-226 |
| 创建 | `.../records/create`（50/批） | POST | wpsClient.js:240-262 |
| 更新 | `.../records/update`（50/批） | POST | wpsClient.js:264-275 |
| 批量删除 | `.../records/batch_delete` | POST | wpsClient.js:280-288 |
| Schema | `GET /v7/coop/dbsheet/{file_id}/schema` | GET | wpsClient.js:312-323 |
| 单条按 ID | **无专用端点**，靠 `listAllRecords` O(n) 扫描 | — | wpsClient.js:235-238 |

**未实现（grep 确认 `server/services` 内无 attachment/creator 端点）**
- 无任何 `attachments/upload`、`/attachment/urls`、`openapi/dbt` 调用。
- 无任何 `creator`/`submitter`/`account_id`/`member_id` 字段返回。
- 限频 10 次/秒（按 app_id），429 退避 ×2、token 失效强刷 ×1（wpsClient.js:145-149,166-171）。

**结论**：当前 Client 是「记录的读/写/删 + schema」最小集，**不含 Creator 读取、不含 Attachment 上传/换 URL**。SDK = 自研 fetch 封装，无第三方 SDK 依赖。

---

## 2. Creator 信息是否存在

**A. `rec.fields` 之外是否存在 creator/creator_id/submitter/operator/account_id？**

不存在（在 API 元数据层）。

- `buildRecord`（wpsClient.js:195-208）返回结构固定为：
  ```js
  { id, fields, lastModifiedTime, createdTime }
  ```
  无任何 creator 级字段。
- `wpsGridPullEngine.js:422` `const fields = rec.fields || {}` → `toCanonicalDto(fields)`（:436）→ 只读 `fields`，**不触及 creator**。
- `wpsFieldMap.js` 的 `FIELD_MAP`（:28-80）**无任何** creator/submitter/account_id 列。身份相关列仅：
  - `巡查人员ID`（biz `inspectorEmployeeId`，**`pg:'-'`** 即不落 PG，wpsFieldMap.js:32）
  - `姓名`（快照，`wpsFieldMap.js:35`）、`昵称2`（明确「仅展示，禁止作身份/关联键」，:44）
- `巡查人员ID` 仅由 PC→WPS 写路径 `gridInspectionRepository.create`（:194-237）用 `resolveCurrentEmployee(user)`（后端登录用户）写入 —— 是**后端身份**，不是 WPS Creator；且 `pg:'-'` 使其**不会被 Pull 拉回 PG**（与 ARCH-01 已知缺口一致：Pull 进 PG 后 `inspector_employee_id` 恒 NULL）。

**判定**：`rec.fields` 之外 → **UNVERIFIED / NOT_AVAILABLE_IN_CURRENT_CLIENT**。不猜测。

**B. 表单「创建人」高级字段（官方能力）**
WPS「表单视图」的「创建人」高级字段由系统按实名账号自动填充（填写者零输入、不可伪造），属**潜在可信身份来源**。但：
1. 当前 `FIELD_MAP` 未映射该列 → Pull 即使读到此列也会忽略；
2. 生产表单是否实际启用该字段 + 该列在板上的真实列名 → **UNVERIFIED**（需读取 WPS 记录 fields 或 schema 确认；本审计为严格只读、不发起任何 WPS 调用，故标 UNVERIFIED）。

---

## 3. Creator 稳定 ID

- 当前 Client 不返回任何稳定用户标识。
- 即便经由表单「创建人」列取得，其值为 **WPS 账号标识**，**≠ `employee.id`**，必须经由 `wps_account_employee_map` 做 1:1 映射。
- 两者区分硬约束（任务 §五 B）：`wps_account_id` 与 `employee.id` 必须是两个明确不同的字段（桥接表已按此设计）。

---

## 4. Creator → employee 映射能力

- 当前**无**自动映射机制。
- `wps_account_employee_map`（P2-B0 建，仅 `safety_dashboard_dev`）为**空表（0 行）**（P2-B0-CONT 测试确认）。
- 禁止：姓名 / nickname / 手机号 / realName 自动匹配（`wpsFieldMap.js:11` 明确「昵称 ≠ 身份标识」）。
- 可行路径（设计）：由**人工 / 可信外部**维护 `wps_account_id → employee.id`（例如管理员在确认 WPS 账号实名后录入）。本阶段不插入任何推测映射。

---

## 5. Attachment endpoint 是否真实存在

- `POST /api/v1/openapi/dbt/:file_token/attachment/urls`（developer.kdocs.cn，DBT v1 面）在 WPS 官方文档/社区中**确证存在**（取文档内附件下载地址）。
- 但 **当前项目 `wpsClient.js` 未实现该端点**（无封装、无调用）。
- 关键风险：它与本项目在用的 **V7 coop（openapi.wps.cn）是两套 API 面**；应用凭证（`WPS_APP_ID` 等）是否可跨面授权 → **NEEDS_EXTERNAL_CONFIRMATION**。
- WPS 原生 Attachment 字段值 = `{fileName, uploadId, source:"upload_ks3"}`（**无 URL**），必须换 URL 才能渲染。

**判定**：平台能力文档存在，但**本项目未实现 + 跨面授权未确认 + URL 有效期未确认** → **UNVERIFIED**。

---

## 6. Attachment response schema

- **写入（二段式，本项目未实现 upload）**：先 `POST /v7/documents/{file_id}/attachments/upload` → `{size, upload_id}`；再字段值 = `[{uploadId, fileName, source:"upload_ks3"|"cloud", type?, size?}]`。
- **读取（list_by_page 返回）**：Attachment 字段值 = `{fileName, uploadId, source}`，**无可直接渲染的 url**。
- **换 URL**：需 `attachment/urls` 端点（§5，UNVERIFIED）。
- `adapter.normalizeAttachments`（wpsDbsheetAdapter.js:24-35）当前仅解析 URL 字符串 / `{url,value}`，**对 `{uploadId,source}` 结构会返回空** → 若 WPS 改用原生 Attachment，链接镜像将断链（待桥接解决）。

---

## 7. URL 是否稳定

- download_url 的**有效期 / 稳定性 = NEEDS_EXTERNAL_CONFIRMATION**（受控/签名地址，未确证长效）。
- 若 URL 带时效性，PG 存储策略需设计：何时解析、何时刷新、是否缓存原始 `upload_id`。
- 任务 §八 明确要求**本阶段只设计、不新增 DB 字段** → 中间态可借用 `image_content`/`attachment_resolution_status`，不新增列。

---

## 8. Attachment → PG 图片字段方案

- 当前 PG `image_content`/`rectified_photo`/`schematic` 存 **link-mirror URL 文本**（http(s) 串）。
- 若 WPS 通道改原生 Attachment：
  - Adapter 解析 `{uploadId,source}` → 调 `attachment/urls` 换 URL → 写回**链接镜像列**（与现有 `link` 类型一致，`wpsFieldMap.js:70-72`）。
  - **不新增 DB 字段**（PG 列已存在）。
  - 待解决：① 跨面授权（§5）② URL 有效期/刷新（§7）③ 批量性能（每记录多附件需批量换 URL）。
- 图片本体永不直接进 WPS（ARCH-01/03 结论）；建议图片走云端对象存储，完全绕开未确证能力。

---

## 9. Pull Engine 接线边界（最重要架构问题）

现状：`server/app.js:89` 注册 `initWpsGridSyncScheduler`；`wpsGridSyncScheduler.js:35 runPull` → `svc.pullWpsToPg({})`（:35），`:60` `cron.schedule(CRON_PULL)` 每 15 分钟（`.env:97 WPS_SYNC_CRON=*/15 * * * *`）。Pull 内部 `insertWithMap` 写 `gir`+`sync_map`，新行 `attribution_status`/`attachment_resolution_status` 默认 NULL。

**五方案逐一分析（禁止修改 `wpsGridPullEngine.js`）**：

| 方案 | 描述 | 改 Pull？ | 事务影响 | 评价 |
|---|---|---|---|---|
| A. Pull 返回后旁路 | `runPull` 的 `await pullWpsToPg` 后调 enrich | 不改 Pull，但改 `wpsGridSyncScheduler.runPull` | 同进程；enrich 需 try/catch 隔离 | 可行但耦合调度 |
| B. Repository after-insert hook | 在 PG 插入处挂钩 | **改 Pull 内部 `insertWithMap`** | 进入 Pull 事务 | ❌ 违反冻结 |
| C. Service orchestration | 新建 orchestrator 调 pull 再 enrich | 不改 Pull，但改 scheduler 调 orchestrator | 分离 | 可行 |
| D. Scheduler 外层 post-process | **新建独立 cron**，扫 `WHERE attribution_status IS NULL OR attachment_resolution_status='pending'` | 不改 Pull、不改现有 scheduler | 独立事务 | ✅ 推荐 |
| E. 独立 enrichment worker | 独立 Node 脚本/进程（类迁移脚本），可手动/on-demand/挂 D 的 cron | 不改 app.js/scheduler 一行（若仅 CLI） | 独立 | ✅ 推荐（最保守） |

**采用：E + D。**
- 新建 `server/scripts/_p2b1_enrich_worker.cjs`（P2-B1-B 落地）+ 可选新建 `server/services/gridEnrichmentScheduler.js`（独立 cron，错峰于 Pull 之后，如 `*/17 * * * *`，**不改 `wpsGridSyncScheduler.js`**）。
- 满足 §九 全部评价：
  - 不改变 Pull 主链 ✓
  - 不影响事务（独立连接/事务）✓
  - enrichment 失败 ≠ Pull 失败 ✓
  - 可重复执行（只填 NULL 扩展列，幂等）✓
  - 不形成第二同步引擎（复用现有 Pull 产出）✓
  - 不造成数据半完成（核心 gir 由 Pull 保证，enrich 仅补 NULL 列）✓
- **无方案 B/C 所需的 Pull Engine 修改 → 不触发 `BLOCKED_BY_FROZEN_PULL_BOUNDARY`。**

---

## 10. 身份归属的正确目标链

```
WPS Record
   ↓ (UNVERIFIED) WPS Creator ID（表单「创建人」列 / 或无处可取）
   ↓ wps_account_employee_map（空，人工/可信外部维护）
employee.id
   ↓ gridScope.deriveGridIdForEmployee
inspector_employee_id
   ↓ gridScope 验证
attribution_status = 'attributed'
```

任一步失败 → `inspector_employee_id = NULL`，`attribution_status = 'pending'`。
禁止：姓名 / nickname / 手机号 / realName / 不明 Creator 时猜测员工。

---

## 11. 业务指纹

- `gridEnrichmentService.computeSubmissionFingerprint`（gridEnrichmentService.js:61-76）已实现且合规：
  - 依赖 `inspector_employee_id` + `inspection_date` + `area_team` + `violation_behavior` + `violator_name` 全齐；
  - 任一缺失 → 返回 `null`（前置不完整 → NULL）；
  - 禁止用 WPS Creator name 替代 employee_id。
- `detectDuplicateCandidate`（:84-90）：命中仅作 `candidate_only`，**不删/不改/不拒绝/不合并**。
- `submission_fingerprint` 仅「重复候选」语义，与任务 §十/§十一 一致。✅

---

## 12. client_token 与 WPS 通道

- **Channel A**（H5 → 本地 Backend → PG）：可带 `client_token`（`gir.client_token` 部分唯一索引 `WHERE NOT NULL` 已由 P2-B0-CONT 建立）。
- **Channel B**（WPS 表单 → Pull → PG）：当前 `client_token = NULL`。WPS Record 技术幂等已由 `UNIQUE(wps_record_id, wps_file_id)` 保证。
- 不强行复用 `client_token` 于 Channel B（除非 WPS 表单有可靠唯一提交 ID 且可安全映射到 client_token，UNVERIFIED）。
- 不重复发明第二套 WPS 技术幂等（与 ARCH-02 修正一致）。✅

---

## 13. source_channel 判定

可靠信号（**无需改 WPS / 无需改 Pull**）：用 `grid_record_sync_map` 反查。
- `gir` 行若 JOIN `sync_map` 存在 `wps_record_id` → 经 WPS 云缓冲 → `wps_form`
- 无 `sync_map` 条目（Channel A 直插 PG 行）→ `mobile_h5`

当前历史 2061 行全部带 `wps_record_id`（均源自 WPS Pull）→ 全部判 `wps_form`（符合事实）。
禁止「仅因来自 WPS Pull 就全标 wps_form」的盲目：本判定用 sync_map JOIN 是**精确判定**；若未来 WPS 板出现非表单来源（如 PC→WPS 镜像写），它们同样带 `wps_record_id`，此时应保留 `unknown` 作为保守默认，仅当可信「表单来源」列已映射才标 `wps_form`。
设计：enrichment worker 默认置 `unknown`；`wps_record_id IS NOT NULL` → `wps_form`（当前全部）；Channel A 直插（无 `wps_record_id`）→ `mobile_h5`。**当前阶段不回填历史（§15）**。

---

## 14. Enrichment 生命周期

- 幂等 / 可重复执行 / fail-safe / 不阻断 Pull / 不删正式数据 / 不覆盖可信数据 / 只填充 NULL 扩展字段 / 保留失败·待处理状态。
- 第一次失败 → 第二次重跑安全（扩展列 only，NULL 可重算；核心 gir 由 Pull 保证）。✅
- `gridEnrichmentService.enrichAfterInsert`（:98-118）已按此实现：任一子步骤异常 → 整体回落 pending/NULL/candidate-only，绝不抛错中断。

---

## 15. 历史数据

- 禁止批量回填：`source_channel` / `client_token` / `submission_fingerprint` / `attribution_status` / `attachment_resolution_status` / `business_fingerprint`。
- 当前历史数据保持原样（NULL / unknown）。✅

---

## 16. 输出报告（20 项对应）

1. WPS 当前真实 Client/API 能力 → §1
2. Creator 信息是否存在 → §2（NOT_AVAILABLE + UNVERIFIED 表单列）
3. Creator 稳定 ID → §3（无；需映射）
4. Creator → employee 映射能力 → §4（无自动；空桥接表）
5. Attachment endpoint 真实性 → §5（UNVERIFIED）
6. Attachment response schema → §6
7. URL 是否稳定 → §7（NEEDS_EXTERNAL_CONFIRMATION）
8. Attachment → PG 图片字段方案 → §8（link-mirror 桥接，不新增字段）
9. Pull 不改代码的 Enrichment 接线 → §9（E+D，不触冻结层）
10. source_channel 判定 → §13（sync_map JOIN）
11. client_token 方案 → §12（Channel A 用，Channel B 不强行复用）
12. submission_fingerprint 方案 → §11（前置不全→NULL）
13. identity fail-safe 方案 → §10/§14（pending，禁猜测）
14. attachment fail-safe 方案 → §8/§14（pending，禁伪造 URL）
15. duplicate candidate 方案 → §11（candidate_only，不删不改）
16. 历史数据处理 → §15（禁批量回填）
17. 数据库是否需新增字段 → **否**（P2-B0 已建齐）
18. 预计源码修改范围 → §18
19. 预计测试范围 → §19
20. 风险与 BLOCKED → §20

---

## 17. 数据库是否需要新增字段

**否。**
- `grid_inspection_records`：P2-B0 已加 `source_channel`/`client_token`/`submission_fingerprint`/`attribution_status`/`attachment_resolution_status`（dev 33 列）。
- `grid_record_sync_map`：P2-B0-CONT 已加 `business_fingerprint`。
- `wps_account_employee_map`：P2-B0-CONT 已建空表。
- 所有 fail-safe 所需字段已就位；任务 §八「不新增数据库字段」可满足。
- 若未来需缓存原始 Attachment ID（用于 URL 刷新），可复用 `image_content` 或 `attachment_resolution_status` 承载，不新增列。

---

## 18. 预计源码修改范围

**P2-B1-B 允许（仅设计，本阶段不执行）：**
- 扩展 `server/services/wps/gridEnrichmentService.js`（已建骨架，补真实 WPS 读取/桥接逻辑，仍无 WPS 调用直到能力验证）。
- 新建 `server/scripts/_p2b1_enrich_worker.cjs`（enrichment worker，独立进程）。
- 可选新建 `server/services/gridEnrichmentScheduler.js`（独立 cron，错峰于 Pull；**不改 `wpsGridSyncScheduler.js`**）。
- 仅当 Attachment 能力被验证且跨面授权确认后（P2-B1-C/D）：在 `wpsClient.js` 新增 `getAttachmentUrls`/`uploadAttachment` 方法（wpsClient.js 不在禁止修改列表，但属「接入 WPS Attachment 实际能力」，须授权后执行）。

**禁止修改（任务 §三 + 冻结层）：**
`wpsGridPullEngine.js` / `wpsFieldMap.js` / `gridInspectionRepository.js`（写侧不改）/ `authenticatedEmployeeResolver.js` / `gridScope.js` / `site-mgmt.js` / 移动 H5 / auth·JWT·users / Vben Core / `package.json` / `npm dependencies` / `wpsGridSyncScheduler.js`（现有逻辑）。

---

## 19. 预计测试范围

A. **单元**（gridEnrichmentService，dev/本地）：
   - identity unavailable → `attribution='pending'`，绝不写错 employee_id
   - attachment unavailable → `attachment='pending'`，绝不生成假 URL
   - fingerprint 前置不全 → `NULL`
   - duplicate candidate → `candidate_only`（不删/不改/不拒绝）
   - 模块内**零 WPS 网络调用**（grep 验证无 fetch/http/wpsClient 依赖）
B. **集成**（仅 `safety_dashboard_dev`）：
   - enrichment worker 对 dev 样本行（构造带 `wps_record_id` 行）执行，验证：只填扩展列、不动核心 gir 数据、幂等重跑安全、`source_channel` 经 sync_map JOIN 正确判定。
   - 测试数据创建/清理（DELETE 回滚，residual=0）。
C. **WPS 实测**（P2-B1-B/C 才做，须授权）：表单「创建人」列确认、Attachment 换 URL 跨面授权。
D. **生产冻结回归**（只读）：`safety_dashboard` 仍 `gir=2061 / sync_map=2061 / max(id)=7192 / conflict=0 / 28 列`；Pull 仍 15min；`.env` 三开关不变。

---

## 20. 风险与 BLOCKED 项

**风险**
- R1 Creator 来源全 UNVERIFIED：上线前须真机确认表单「创建人」列 + 映射机制，否则 attribution 全 `pending`（fail-safe 可接受，但不满足「可靠归属」业务诉求）。
- R2 Attachment 跨面授权 + URL 有效期 NEEDS_EXTERNAL_CONFIRMATION：图片云端缓冲在上帝视角仍受限；若无法授权，WPS 通道图片继续走 link-mirror（关机图片断，与现状一致）。
- R3 enrichment worker 与 Pull 时序：worker 须在 Pull 之后处理新行 → 用错峰 cron 或 Pull 后触发缓解；enrichment 失败不影响 Pull。
- R4 `wps_account_employee_map` 空：即使有 creator，也无 employee.id 映射 → 仍 `pending`。需人工/可信外部灌入至少可信映射。

**BLOCKED 判定**：**无 BLOCKED 项**。所有约束均可满足 fail-safe 实现，无需修改冻结层、无需触碰生产。Creator/Attachment 虽 UNVERIFIED，但按任务 §十七规则不导致整体 BLOCKED（已明确标 UNVERIFIED 并提供 fail-safe 兜底）。

---

## 17（终）. 最终判定

**`READY_FOR_P2-B1-B`**

理由：
- 可在**不修改冻结层**（SYNC_PROJECTION / PROTECTED / canonicalHash / Pull Engine / FIELD_MAP）、**不触碰生产**的前提下，以「独立 enrichment worker（E）+ 可选独立 cron（D）」实现 Creator/Attachment 的 fail-safe 接入；
- 所有未验证能力（Creator 表单列、Attachment 换 URL、跨面授权、URL 有效期）均设 `pending`/`NULL`/`candidate_only` 兜底，不伪造、不猜测；
- 数据库字段已齐备，**无需新增**；
- 无 `BLOCKED_BY_FROZEN_PULL_BOUNDARY`。

**UNVERIFIED 清单（P2-B1-B 前/时须验证）**：① WPS 表单「创建人」列存在性与列名 ② 该列 → wps_account_id 的稳定映射 ③ `attachment/urls` 跨 API 面授权 ④ download_url 有效期/刷新策略 ⑤ 桥接表至少一条经核验的 `wps_account_id→employee.id`。

**§十八 禁止自动执行**：本阶段完成审计即停止，**不自动进入 P2-B1-B**、不修改代码/数据库、不调用 WPS 写接口、不修改 Mobile H5 / Pull Engine。

> 下一步：若授权进入 P2-B1-B，建议先据本报告的「UNVERIFIED 清单」做最小真机验证（只读列举 WPS 记录确认表单「创建人」列 + 跨面授权探测），再落地 E/D 接线与 `gridEnrichmentService` 真实实现（仍 fail-safe）。
