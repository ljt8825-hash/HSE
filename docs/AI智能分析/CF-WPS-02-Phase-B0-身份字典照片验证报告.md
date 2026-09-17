# CF-WPS-02 · Phase B-0：WPS 身份 / 字典 / 照片 条件解除验证报告

> 阶段定位：CF-WPS-01 Phase A 之后，解除其三个 CONDITIONAL 项（WPS OAuth 身份、三违字典 WPS 镜像、WPS 附件→PG 图片链路）。
> 执行纪律：只读审计 + 受控探针；**0 既有文件修改、0 PG 写入、0 WPS 生产写入、0 既有 WPS-PG-SYNC 改动**。
> 生成时间：2026-09-15

---

## 1. 执行摘要

本阶段对 Phase A 遗留的三个 CONDITIONAL 项逐一做了**实证验证**，结论如下：

| 项 | 结论 | 关键原因 |
|---|---|---|
| AUTH_MAPPING（WPS OAuth 身份） | **BLOCKED**（AUTH_IDENTITY_FIELD_MISMATCH） | 全仓无用户级 OAuth；现有桥接表 `wps_account_id` 语义=Creator 系统账号标识，与 OAuth 返回的 openid/unionid 不是同一概念；沙箱无法跑真实 OAuth 回调 |
| DICT_SOURCE（三违字典 WPS 镜像） | **CONDITIONAL** | PG 权威字典已完整读取（15 条有效）；PG→WPS 转换逻辑已 dry-run 验证通过；但本应用 V7 coop 调用面**无文件/工作表创建端点**（3 类候选全 404），且禁止污染生产 sheet3，故真实 WPS 镜像容器需在 WPS 控制台/业务侧先行置备 |
| PHOTO_STORAGE（WPS 附件→PG 图片） | **CONDITIONAL** | WPS→PG→台账图片链路**已实证可行**（生产记录 `三违照片链接` 列含 `ksc-bj.ag.wps.cn` URL，fieldMap 将其同步至 `image_content`）；但 Worker 从手机上传图片**生成该 URL** 的 V7 coop 能力未验证（原生 Attachment 仅返回 uploadId 无 URL，DBT v1 `attachment/urls` 在本应用调用面实测 404） |

**最终状态：`CF_WPS_02_STATUS = BLOCKED`**（因 AUTH_MAPPING 硬阻塞）；`CF_WPS_03_READY = NO`。
未进入完整 Phase B / H5 / Worker 开发（遵守"先解除条件、不擅自扩展"纪律）。

---

## 2. 实际执行内容

新增文件（全部位于隔离目录，未触碰既有业务代码）：

- `_cf_audit/b02-file-create-probe.cjs` — 探测新建 WPS 文件端点（结论：404）
- `_cf_audit/b02-sheet-create-probe.cjs` — 探测新建 WPS 工作表端点（结论：404）
- `_cf_audit/b03-attachment-probe.cjs` — 只读读取生产 WPS 记录的 Attachment 字段形状
- `_cf_audit/b02-dict-mirror.cjs` — 三违字典 PG→WPS 镜像脚本（默认 dry-run；`--apply` 需先置备独立 WPS 容器）
- `_cf_audit/wps-schema.json`（Phase A 已生成，本阶段复用）

所有探针通过既有 `server/services/wpsClient.js`（应用级 `client_credentials`）与 `_mw_audit/ro-probe.cjs`（PG 只读，连接级 `default_transaction_read_only=on`）执行。**未发生任何 WPS 写入、PG 写入、既有文件修改。**

---

## 3. OAuth 验证结果（B-0.1）

1. **代码级结论**：全仓唯一 WPS 认证在 `server/services/wpsClient.js`，仅 `POST /oauth2/token`（grant_type=client_credentials，**应用级/租户级**）。**不存在任何用户授权（auth-code）实现**。
2. **真实 OAuth 不可执行**：auth-code 流程需「浏览器跳转 WPS 授权页 → 真实 WPS 用户登录 → 回调 Worker → 换取 token → 取 userinfo」。本沙箱无浏览器/回调环境，且当前 WPS 应用是否开启"用户授权"属未确认的业务配置，故**无法取得本应用实际返回的 OAuth 身份字段值**。
3. **Creator 不可作身份源**：Phase A/ARCH-03 实测，生产 2063 条记录的 `creator` 去重后仅 1 个值（`1901573333`，共享/应用账号），且 `created_time` 集中在同一导入窗口 ⇒ **Creator 是共享账号，不能识别逐条提交人**（skill 踩坑第 7 条）。
4. **结论**：AUTH_MAPPING = **BLOCKED**。

---

## 4. WPS identity 字段确认结果

- WPS 用户授权（open.wps.cn 官方文档）返回的userinfo 字段为 `openid / unionid / company_uid / company_id / nickname` 等。
- 这些**均为 OAuth 用户维度标识**，与"应用级 client_credentials"体系正交。
- 本项目从未用用户授权取得过上述任何字段，故**无法确认本应用实际会返回哪一个作为稳定唯一标识**（openid 还是 unionid 还是 company_uid）。

---

## 5. wps_account_id 关系

- 既有桥接表 `wps_account_employee_map.wps_account_id` 为 `text`，其建表注释明确定义为"**WPS 稳定账号 ID（如 Creator 系统账号标识），非 employee.id**"。
- 该表当前 **0 行**（空表）。
- **概念冲突**：`wps_account_id`（Creator 系统账号标识）≠ OAuth 返回的 `openid/unionid/company_uid`。二者不是同一个标识空间。
- 依据任务书 §四"如果现有 wps_account_id 的定义与 OAuth 返回字段不是同一个概念：不得直接映射。报告 AUTH_IDENTITY_FIELD_MISMATCH = BLOCKED" ⇒ 命中。

---

## 6. WPS 身份映射验证结果

- 目标链路：`WPS OAuth identity → 稳定 wps_account_id → employee_id → 唯一 grid_id`，且全过程不得依赖姓名/手机号。
- **当前无法验证**：
  - 无真实 OAuth 可取 identity；
  - 既有的 Creator 型 `wps_account_id` 与 OAuth identity 概念不匹配，不能直接复用；
  - Worker 禁止连 PG，故映射须落在 WPS 侧，但 WPS 侧映射键必须用 OAuth identity 字段（待确认），而该字段尚未取得。
- **严禁**以姓名/昵称/手机号/WPS Creator 名称兜底匹配。
- ⇒ AUTH_MAPPING = **BLOCKED**。

---

## 7. 字典镜像结果（B-0.2）

- **PG 权威源**（`sanwei_behavior_dict`）实测：共 15 行，全部 `is_deleted=false`、全部 `enabled=true`、全部在 `valid_from/valid_to` 有效期内 ⇒ **15 条当前有效**。
- 字段（已内省）：`id, behavior_code, behavior_name, behavior_type, aliases(text[]), is_violation(bool), severity, enabled(bool), valid_from(date), valid_to(date), description, created_by, created_by_name, is_deleted, created_at, updated_at`。
- **转换逻辑 dry-run 通过**：`b02-dict-mirror.cjs` 已构造 15 条 WPS field-map，唯一 `behavior_code` 数=15（一致），样例载荷正确（code/name/type/is_violation/severity/enabled/valid_from/valid_to/aliases 全部映射）。
- **真实 WPS 写入被阻断**：
  - 新建 WPS 文件 3 个候选端点（`/v7/coop/dbsheets`、`/v7/coop/dbsheet`、`/v7/coop/files`）**全部 404**；
  - 在现有生产文件内新建工作表 `/v7/coop/dbsheet/{fileId}/sheets` **也 404**；
  - 唯一可写目标是生产网格数据表 sheet3，向其写字典行会污染 `grid_inspection_records` 且同步器会拉取 ⇒ **禁止**。
- ⇒ 真实镜像需先在 WPS 控制台或由业务侧置备一个**独立字典容器**（新文件或专用 sheet），再执行 `--apply`。该容器置备动作超出本沙箱 API 能力，属业务/控制台动作。

---

## 8. PG / WPS 字典一致性结果

- 因真实 WPS 镜像容器无法在本环境置备，**PG=WPS 的逐项一致性尚未能在线上达成**。
- 但 PG 侧已完整取得、转换脚本已验证等价，当且仅当独立 WPS 容器就绪后执行一次 `--apply` 即可达成；届时以 `behavior_code` 为键逐行比对 code/name/type/severity/enabled/valid_from/valid_to 即可验收。
- 当前状态：**DICT_SOURCE = CONDITIONAL**（数据层与转换层 PASS，仅差容器置备这一业务动作）。

---

## 9. Attachment 实测结果（B-0.3）

- 生产 WPS 记录的照片以**两种形态**共存（已实测读取首条记录）：
  - **原生 Attachment 字段**（`三违照片：图片1` id=J 等）：值形如
    `[{ "fileName":"979d...0373b19d.jpeg", "imgSize":"640*854", "size":77486, "source":"upload_ks3", "type":"image/jpeg", "uploadId":"N3HQXRJJACQCY" }]`
    ⇒ **无 URL**、无 download/preview 地址（`ATTACHMENT_HAS_URL_FIELD=false` 实测）。
  - **链接镜像列**（`三违照片链接` id=d，类型 `MultiLineText`）：值形如
    `https://ksc-bj.ag.wps.cn/api/object/2_a62347bda6804cefa643dafc36c735ec/compatible`
    ⇒ **是可直接入库的 URL**。
- 现有生产数据采用"链接镜像列存 URL"方案，而非依赖原生 Attachment 字段取 URL。

---

## 10. WPS Attachment → PG 结果

- `server/services/wps/wpsFieldMap.js` 映射：
  - `三违照片链接`(MultiLineText, link) → `image_content`(PG)，`type:'link'`；
  - 原生 Attachment 字段 `三违照片：图片1/2/3`(J/K/L) **不在 FIELD_MAP**，不同步到 PG。
- `SYNC_URL_COLUMNS = ['image_content','rectified_photo','schematic']`，仅允许合法 http(s) URL 落库。
- **结论**：WPS→PG→台账图片链路**已实证可行**——生产记录 `三违照片链接` 列已含 `ksc-bj.ag.wps.cn` URL，且 fieldMap 将其同步进 `image_content`，PC 台账可读取。
- **缺口仅在 Worker 侧**：Worker 要从手机上传的图片生成该 `ksc-bj.ag.wps.cn` URL，在当前 V7 coop 调用面**无已验证能力**：原生 Attachment 上传仅返回 `uploadId`（无 URL），DBT v1 `attachment/urls` 端点在本应用调用面实测 404（ARCH-03 真机）。`ksc-bj.ag.wps.cn` URL 的签发端点未在本应用服务端暴露。
- ⇒ PHOTO_STORAGE = **CONDITIONAL**：WPS→PG 腿 PASS，Worker 上传→URL 腿未验证。

---

## 11. 所有测试数据及测试记录标识

- **本阶段未产生任何 WPS 写入**（文件/工作表创建端点均 404，未落到生产 sheet）。
- **本阶段未产生任何 PG 写入**（只读探针 + dry-run）。
- 测试标识约定（供后续 `--apply` 使用，本次未执行）：WPS 字典容器命名 `sanwei_dict_mirror_*`，记录以 `source_version=PG-sanwei_behavior_dict` 标记；测试巡查记录若未来写入须用 `WPS-TEST-*` 前缀（本阶段未写）。

---

## 12. 并发修改登记（只读，未处理）

`git status` 显示以下跟踪文件存在他者并发修改，按 §七纪律**仅登记、不覆盖、不 reset、不 checkout**：

```
server/app.js, server/controllers/violationController.js, server/middleware/encryption.js,
server/routes/ai-enhanced.js, server/routes/hse-dashboard.js, server/routes/hse-grid-attribution.js,
server/routes/hse-tasks.js, server/routes/regulations.js, server/routes/training-ocr.js,
server/routes/violations/main.js,
server/services/aiService.js,
server/services/assessmentEventService.js, server/services/assessmentMonthlyCycleService.js,
server/services/assessmentMonthlyScoringService.js, server/services/assessmentMonthlyTargetService.js,
server/services/assessmentScheduler.js, server/services/assessmentScoringEngine.js,
server/services/gridAttributionService.js, server/services/gridUncheckedDeductionService.js,
server/services/violationService.js, server/test/setup.js,
server/services/ruleEngine/__tests__/violationAdapter.unit.test.js,
server/services/ruleEngine/adapters/safetyCultureAdapter.js,
server/services/ruleEngine/adapters/violationAdapter.js,
server/services/ruleEngine/deductionWriter.js, server/services/ruleEngine/engine.js,
server/services/ruleEngine/ruleLoader.js,
安全看板vben/apps/web-naive/src/adapter/naive.ts,
安全看板vben/apps/web-naive/src/api/hse/violations.ts,
安全看板vben/apps/web-naive/src/locales/langs/en-US/page.json,
安全看板vben/apps/web-naive/src/locales/langs/zh-CN/page.json,
安全看板vben/apps/web-naive/src/router/routes/modules/hse-site.ts,
安全看板vben/apps/web-naive/src/router/routes/modules/hse.ts,
安全看板vben/apps/web-naive/src/router/routes/modules/mobile.ts,
安全看板vben/apps/web-naive/src/views/hse/ai-analysis/index.vue,
安全看板vben/apps/web-naive/src/views/hse/assessment-rule/index.vue,
安全看板vben/apps/web-naive/src/views/mobile/index.vue,
docs/191副/_index.md, docs/191副/project_memory.md, overview.md
```

本阶段新增文件均落在 `_cf_audit/` 与 `docs/AI智能分析/`，与上述并发修改无交集。

---

## 13. 安全检查

- **无 WPS Secret / APPKEY / access_token / refresh_token 进入前端、HTML、Git 或本报告正文**。本报告对所有凭证一律脱敏，仅以端点路径与字段名描述。
- **Worker 不连 PG / 不连 192.168.x.x / 不连本地 HSE**：本阶段未编写 Worker（属后续阶段），但验证全程遵守该边界。
- **未引入任何第三方 npm 依赖**（全部复用 `server/node_modules` 既有 `pg` / `dotenv` / `wpsClient`）。
- **未修改现有 WPS-PG-SYNC / grid_inspection_records / grid_record_sync_map / E-08-11 / JWT / PC 权限**。
- **无姓名/手机号/昵称/WPS Creator 名称身份匹配**。

---

## 14. 未决问题

1. **（硬阻塞）WPS 用户授权**：当前 WPS 应用是否开启"用户授权"？开启后 auth-code 回调的 redirect_uri 与 scope 配置为何？返回的稳定唯一标识是 openid / unionid / company_uid 中的哪一个？—— 需业务方在 WPS 开放平台确认并授权一次真实回调。
2. **身份映射键重定**：既有 `wps_account_employee_map.wps_account_id` 为 Creator 语义，与 OAuth identity 不匹配；若采用 OAuth，需新增以 OAuth identity 字段为键的 WPS 侧映射（或重定义该列语义），且须由可信流程（非姓名匹配）填充。
3. **字典容器置备**：需在 WPS 控制台/业务侧创建一个独立字典容器（新文件或专用 sheet），方可执行 `b02-dict-mirror.cjs --apply`。
4. **Worker 图片 URL 能力**：需确认 `ksc-bj.ag.wps.cn` 对象 URL 的服务端签发端点（或采用链接镜像列由既有上传服务回填），该能力在当前 V7 coop 调用面未验证。

---

## 15. 下一阶段建议

- **CF-WPS-03 暂不开启**（AUTH_MAPPING 硬阻塞）。
- 业务侧优先解决第 14 节 #1/#2（WPS 用户授权 + 映射键定义），这是唯一硬阻塞；#3/#4 为 CONDITIONAL，可在 Phase B/C 以"控制台置备容器 + 链接镜像列"方式平滑解决，不阻塞架构。
- 待 #1/#2 有明确结论后，再进入 CF-WPS-03（最小 Worker + 静态 H5）。本阶段已交付：字典镜像脚本（dry-run 验证通过）、附件形状实证、身份字段不匹配的书面裁定，可直接被后续阶段复用。

---

## 16. 最终状态代码

```
CF_WPS_02_STATUS        = BLOCKED
AUTH_MAPPING            = BLOCKED
AUTH_IDENTITY_FIELD_MISMATCH = true
AUTH_IDENTITY_FIELD     = UNCONFIRMED (需真实 OAuth 回调确认 openid/unionid/company_uid)
DICT_SOURCE             = CONDITIONAL
PHOTO_STORAGE           = CONDITIONAL
CF_WPS_03_READY         = NO
```

### 继承/覆盖说明

- 继承 `CF-WPS-01-SCOPE-REBASELINE-01`：当前只做"手机端网格长巡查管理"移动记录入口。
- 覆盖 `CF-WPS-01-Phase-A` 的 `WPS_PG_CHAIN_READY=YES` 保持不变（P-02 仍 PASS）。
- 本阶段三项条件解除情况：**AUTH 未解除（BLOCKED）、DICT 部分解除（CONDITIONAL）、PHOTO 部分解除（CONDITIONAL）**。

---

*报告结束。本阶段未进入完整 Phase B / H5 / Worker 开发，未修改任何既有业务文件，未向 WPS/PG 写入任何数据。*
