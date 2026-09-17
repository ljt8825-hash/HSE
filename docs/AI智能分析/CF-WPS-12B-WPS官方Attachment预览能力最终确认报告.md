# CF-WPS-12B：WPS 官方 Attachment 预览能力最终确认报告

| 项 | 值 |
|---|---|
| 阶段 | CF-WPS-12B（CF-WPS-12 / 12A 均为 BLOCKED 的收口阶段） |
| 日期 | 2026-09-15 |
| **CF-WPS-12B_STATUS** | **BLOCKED** |
| 一句话结论 | dbsheet 专用上传端点 `/v7/coop/dbsheet/{file_id}/attachments/upload` 经官方文档全面查证**无公开 schema**（**DBSHEET_ATTACHMENT_UPLOAD_SCHEMA=UNAVAILABLE**；实测 POST 400 ParameterFormatError / OPTIONS 404 Route Not Found），按任务书 §六不做任何猜测性请求；照片链路正式定级为 **PENDING_EXTERNAL（WPS 平台能力阻断）**，工单材料已备妥，本阶段后停止对 WPS Attachment 的继续破解。 |

---

## 1. 执行摘要

- **第一任务（官方支持材料）**：基于 CF-WPS-12 / 12A 真实实测证据，生成可直接提交 WPS 开放平台的技术支持工单材料（§13 引用文件），含环境、两通道实测、三族对象对照、失败证据与 5 项待官方确认问题。
- **第二任务（dbsheet 专用端点验证）**：按 §五纪律先查官方资料——V7 dbsheet 官方文档族（schema/records/fields/sheets/views）**无该端点定义**；官方 SDK/OpenAPI schema 无匹配。→ 记录 `DBSHEET_ATTACHMENT_UPLOAD_SCHEMA=UNAVAILABLE`，仅执行一次无副作用 OPTIONS 探测（404 Route Not Found，code=404000001），未猜任何请求结构，**未进入实际写入验证**。
- 全程零生产写入、零第三方存储、零禁改项触碰；回归 08/10/11/12 全绿；三表基线前后一致。

## 2. 先审计：现有报告证据（任务书 §三）

已完整读取四份报告（不凭记忆）：

| 报告 | 状态 | 关键证据 |
|---|---|---|
| CF-WPS-10 | PASS_WITH_RISK | 隔离 Sheet 13 写入闭环；`fields` vs `fields_value` 双形态 |
| CF-WPS-11 | PASS_WITH_RISK | 身份表+登录 27 项真机；WPS Phone 列平台级唯一约束 |
| CF-WPS-12 | **BLOCKED** | documents 三步链全通；四轮对照实验：仅客户端通道（`2_<hash>`）对象可预览；dbsheet 端点 POST 探测 400 ParameterFormatError |
| CF-WPS-12A | **BLOCKED** | AirScript base64 真机全通（手机照片 3/3）；页面仍不预览；C 族 source=cloud、size=0 |

## 3. dbsheet 专用端点官方资料查证（任务书 §五）

查证范围（均于本阶段实际执行）：

1. **官方公开文档**：open.wps.cn V7 dbsheet 文档族（quickly_start / get_schema / parameters-description / views 等）——能力清单为 schema、记录 CRUD、字段 CRUD、Sheet CRUD、视图 CRUD，**无任何 attachment 上传端点**；
2. **官方旧版文档**（open.wps.cn/previous/docs/dbSheet/api-info）：19 项多维表能力 + 1 项「上传附件到文件」，后者为**旧版 kopen v3 体系**端点（`/kopen/api/v3/developer/dmc/office/file/:file_id/attachment`，WPS-3 签名 + multipart），**并非**任务书指定的 `/v7/coop/dbsheet/...` 端点；
3. **官方 SDK / OpenAPI schema / 示例 / 错误码文档**：搜索无 `/v7/coop/dbsheet/{file_id}/attachments/upload` 的任何 schema 定义；
4. **社区/生态资料**（bbs.wps.cn、WPS+ 博客、生态服务商文档）：均只覆盖客户端上传、AirScript base64、旧版 kopen 端点，无该 V7 端点定义。

**结论：无可信请求结构 → 不允许实际请求（§五），进入 §六 分支。**

## 4. 唯一一次无副作用探测（任务书 §六）

| 请求 | 结果 |
|---|---|
| `OPTIONS https://openapi.wps.cn/v7/coop/dbsheet/cn229thwalDs/attachments/upload`（Bearer，无 body） | **HTTP 404，`{"msg":"404 Route Not Found","code":404000001}`**，`Allow` 头为空 |

与 CF-WPS-12 的 POST 探测（400 ParameterFormatError，proto 风格 body）合并解读：该路径存在内部路由痕迹但**对 ISV 调用面未开放、无文档、无 schema**。

```
DBSHEET_ATTACHMENT_UPLOAD_SCHEMA=UNAVAILABLE
```

未猜测 multipart/JSON/proto/base64/uploadId/fileData/attachmentId/objectId 等任何参数形态；未发送任何 POST/PUT 写入请求。探测脚本 `cfwps12b-options-probe.mjs`（一次性资产保留，凭证仅内存）。

**附带发现（仅记录，未测试）**：旧版 kopen v3 端点有完整公开 schema 且其返回的 `object_id`（大写短格式，如 `KI55UBAASY`）与历史可预览对象 uploadId 同族——已写入工单材料问题 ③，请 WPS 官方确证其可用性与适用性；按任务书 §五「只验证 dbsheet 专用端点」与 §十「停止尝试其它未公开 API」纪律，本阶段未对其实测（其属另一签名/鉴权体系，贸然调用亦无法归因）。

## 5. 最终判定链（任务书 §八 / §十）

PASS 标准 11 项中第 1 项（官方明确支持的请求结构）即不成立 → 后续 2–11 项不适用 → **CF-WPS-12B_STATUS=BLOCKED**。

照片链路定级：**PENDING_EXTERNAL** —— 属 WPS 平台能力阻断，非 H5/Worker 实现缺陷（三步上传、Attachment 写入、API 回读、Session 身份、幂等、安全门控均已在 12/12A 真机 PASS 并保持代码就绪）。

按 §十/§十五：**停止继续尝试其它未公开 Attachment API，不进入 CF-WPS-13。**

## 6. 回归（任务书 §十二）

| 套件 | 结果 |
|---|---|
| cfwps08.test.mjs | **8/8 PASS** |
| cfwps10.test.mjs | **8/8 PASS** |
| cfwps11.test.mjs | **38/38 PASS_MOCK** |
| cfwps12.test.mjs | **25/25 PASS_MOCK** |
| http-smoke.mjs | **3/3 PASS** |
| CF-WPS-12A 回归 | 12A 无独立 mock 套件（其真机 runner 依赖业务方账号级脚本令牌，按 12A 报告建议该令牌已建议删除）；按 12A 报告自身口径，其回归=10/11/12 套件，本轮全绿即覆盖 |

既有 PASS 结论零修改；全部历史断言原样通过。

## 7. 清理与生产污染检查（任务书 §十一）

| 检查项 | 结果 |
|---|---|
| Sheet 13 本阶段新增测试记录 | **0 条**（本阶段仅 OPTIONS 探测 + 只读计数，无任何记录写入，无需清理） |
| Sheet 13 基线 | **3 条**（业务方原始数据，零触碰） |
| Sheet 3 行数 | **2063**（只读核对，与历史基线一致） |
| Sheet 11 行数 | **1291**（只读核对，与历史基线一致） |
| 本地 HSE/PG | 零访问 |
| Tunnel | 无 |
| 第三方存储 | 无 |
| Git 工作区 | 本阶段新增 2 个 test 脚本（`cfwps12b-options-probe.mjs`、`cfwps12b-baseline-count.mjs`）+ 本阶段 2 份报告；`server/` 等既有改动为前序阶段遗留，本阶段零触碰 |
| Secret 泄露 | 两脚本凭证仅经 `server/.env` 进内存，无硬编码；报告/日志无 APPSECRET/token/脚本令牌（含 AirScript 令牌负向断言通过） |
| 附件本体残留 | 维持 12/12A 报告声明：API 无附件删除端点（工单问题 ⑤），测试文件本体残留于文档附件区，可由业务方在 WPS UI 手工删除 |

## 8. 风险

| # | 风险 | 等级 |
|---|---|---|
| R1 | 照片链路 PENDING_EXTERNAL：预览能力取决于 WPS 官方答复，时间不可控 | 高（对照片目标） |
| R2 | 旧版 kopen v3 端点属另一鉴权体系（WPS-3 签名），若官方确认可用仍需独立的接入与验证阶段 | 中 |
| R3 | 文档附件本体无 API 删除通道，测试残留持续存在 | 低 |

## 9. 后续建议（不在本阶段实施）

1. **提交工单**：将《CF-WPS-12B-WPS官方Attachment预览能力最终确认材料.md》提交 WPS 开放平台技术支持，核心诉求为问题 1/3（是否存在 ISV 可预览上传通道）。
2. **照片链路兜底决策**（业务方）：在官方解锁前，可选 ① WPS 客户端人工上传兜底；② 照片以链接/文本形式记录（Attachment 列留空）。
3. **CF-WPS-13 另行规划**：不依赖照片预览的 H5 巡查文字业务链（登录→巡查→提交→Pull）可先行，照片环节以 PENDING_EXTERNAL 标注——须另立阶段，本阶段不实施。

## 10. 修改文件清单

| 文件 | 说明 |
|---|---|
| `grid-mobile-cloudflare/worker/test/cfwps12b-options-probe.mjs` | 新增（一次性 OPTIONS 探测资产） |
| `grid-mobile-cloudflare/worker/test/cfwps12b-baseline-count.mjs` | 新增（只读基线核对资产） |
| `docs/AI智能分析/CF-WPS-12B-WPS官方Attachment预览能力最终确认材料.md` | 新增（工单材料） |
| `docs/AI智能分析/CF-WPS-12B-WPS官方Attachment预览能力最终确认报告.md` | 新增（本报告） |

Worker/Frontend/Pull/server/生产库/CF-WPS-07/10/11/12 代码：**零改动**。

## 11. CF-WPS-12B_STATUS

**BLOCKED**（判定依据：§五先查官方资料 → 无公开 schema → §六 UNAVAILABLE + 单次 OPTIONS 探测 → 不允许实际请求 → §十 BLOCKED 分支成立）。

照片链路：**PENDING_EXTERNAL**。本阶段按 §十五到此停止，不进入 CF-WPS-13。
