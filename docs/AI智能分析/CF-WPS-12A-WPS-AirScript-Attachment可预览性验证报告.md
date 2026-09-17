# CF-WPS-12A：WPS AirScript Attachment 可预览性验证报告

| 项 | 值 |
|---|---|
| 阶段 | CF-WPS-12A（接续 CF-WPS-12，BLOCKED） |
| 日期 | 2026-09-15 |
| **CF-WPS-12A_STATUS** | **BLOCKED** |
| 一句话结论 | AirScript base64 写入链**真机全通**（webhook → DBCellValue → Attachment 字段写入/回读成功，真实手机照片 3/3 稳定），但 **WPS 页面缩略图/预览仍失败**——与 CF-WPS-12 documents API 通道完全相同症状。**平台级预览阻断现已跨两个官方写入通道确认**，API 侧已无可解变量，需 WPS 官方支持确认（NEEDS_EXTERNAL_CONFIRMATION）。 |

---

## 1. 执行摘要

- 按任务书搭建 AirScript 执行环境：业务方在 WPS 多维表 cn229thwalDs 内通过「脚本编辑器」创建脚本 + **脚本令牌（APIToken）** + webhook 链接，外部系统可 `POST https://www.kdocs.cn/api/v3/ide/file/{file_id}/script/{script_id}/sync_task`（header `AirScript-Token`）同步触发——**该形态即未来 CF-WPS-13 Worker 通道的候选**。
- 官方 `DBCellValue([{fileData, fileName}])` 写 Attachment 链路真机打通：**fileData 必须为 Data URL 格式**（`data:image/jpeg;base64,xxx`；纯 base64 报 `download error: Invalid URL`）。
- 实验矩阵 13 组：**真实手机照片（664KB）3/3 稳定写入成功**；重存同像素（239KB）亦成功；但 PNG 全尺寸被拒（7.8KB–787KB 均 `upload attachment failed`）；JPEG 存在压缩体积下限（59–274KB 的样本均失败，239KB/574KB/664KB 成功，274KB 为边界毛刺；该规律为**经验实测，非官方规格**）。
- **页面人工验证（决定性环节）：全部写入成功的记录「有附件但不预览」**——缩略图空白、点击预览失败，跨 25 分钟创建的多条记录一致。与 CF-WPS-12 四轮对照实验的结论汇合：**只有 WPS 客户端上传通道（source=upload_ks3）的对象可预览**。
- 按任务书 §九「setValue 成功但页面不能预览 → 必须停止」，本阶段停止，未引入任何第三方存储，未放宽 PASS 标准。

## 2. Precheck（CF-WPS-12A_PRECHECK）

| 条件 | 结果 |
|---|---|
| 测试 Sheet | ✅ Sheet 13「H5提交测试」（基线 3 行） |
| Attachment 字段 | ✅ 「测试图片」fieldId=Bm（CF-WPS-12 创建，留存） |
| 可执行 AirScript 的 WPS 文件 | ✅ 业务方在文件内搭建（脚本编辑器 2.0 环境 + 脚本令牌 + webhook） |
| 测试图片来源 | ✅ 程序生成（PNG/JPEG）+ 业务方提供真实手机照片（664KB，`ffd8ffe0`，1080×1920） |
| 可人工查看 WPS 页面 | ✅ |

## 3. 测试环境

- WPS 文件：cn229thwalDs（多维表，kdocs）
- 脚本执行环境：**脚本环境(2.0)**（webhook 响应 logs 实证）
- 触发方式：webhook 同步执行（`sync_task`），返回 `{data:{logs, result}}`，脚本返回值在 `data.result`
- 测试脚本：`grid-mobile-cloudflare/worker/test/cfwps12a-airscript-v2.js`（部署于脚本编辑器；v1 已被替换）
- 令牌：**账号级全局凭证，仅经环境变量进入内存**，不落盘、不写入日志与本报告（阶段结束后建议业务方删除重建）

## 4. WPS 官方能力验证（文档 vs 实际环境）

官方文档（airsheet.wps.cn/docs/api/dbsheet/Record.html）声明多维表脚本可用 `Application.Record.CreateRecords/GetRecords`。**实际环境（脚本环境 2.0）差异**：

- `Application.Record` **undefined**（`Cannot read properties of undefined (reading 'CreateRecords')`）
- `Application` 键集呈 ET/表格风格（AutoFormatAsYouTypeReplaceHyperlinks、CalculationInterruptKey 等），但 `Application.Sheets(...)`、`Application.DBCellValue(...)`、`RecordRange(recordId, '@字段').Value` **可用且触达多维表附件服务**
- 结论：**记录创建改由 OpenAPI 承担（外部预创建），脚本只负责 Attachment 写入**——实测可行的职责分工

## 5. AirScript 调用方式（实测有效形态）

```js
// webhook 请求体：{"Context":{"argv":{"recordId","fileName","fileData"}}}
// fileData ⭐必须为 Data URL：data:image/jpeg;base64,<base64>（纯 base64 → "download error: Invalid URL"）
Application.Sheets('H5提交测试').Views(1).RecordRange(recordId, '@测试图片').Value =
  Application.DBCellValue([{ fileData: dataUrl, fileName: fileName }]);
```

- `RecordRange` 第一参数为**记录 ID 字符串**（如 `CK9`），非行号
- `Sheets(数字索引)` 不带 `Views` 层不可用；`Sheets('表名')` 与 `ActiveView` 均可
- 官方附件大小限制：社区文档称 ≤20MB；本实测另有**隐性下限**（见 §7）
- 官方 `Application.Record.GetAttachmentURL({UploadId, Source})` 可取附件 URL（本阶段脚本未集成，列为后续取证手段）

## 6. 第一轮 Base64 测试（合成图）

| 用例 | 类型 | 尺寸 | 大小 | setValue | 回读 | 页面 |
|---|---|---|---|---|---|---|
| MIN-JPG | JPEG 1×1 | 188B | ❌ upload attachment failed | — | — | — |
| MIN-PNG | PNG 1×1 | 70B | ❌ | — | — | — |
| PNG-SMALL | PNG 64×64 | 7.8KB | ❌ | — | — | — |
| PNG-MID | PNG 200×200 | 89.5KB | ❌ | — | — | — |
| JPEG-MID | JPEG 1×1(COM填充) | 95KB | ❌ | — | — | — |
| PNG-BIG | PNG 512×512 | 787KB | ❌（复测仍败） | — | — | — |
| J100 | PNG 100×100(PIL) | 30KB | ❌ | — | — | — |
| J600 | JPEG 600×600(PIL) | 274KB | ❌（复测仍败） | — | — | — |
| A2000 | JPEG 2000×2000(PIL) | 71KB | ❌ | — | — | — |
| C1PORT | JPEG 1080×1920(PIL) | 80KB | ❌ | — | — | — |
| C2S600 | JPEG 600×600(PIL照片缩放) | 59KB | ❌ | — | — | — |
| **D150** | **JPEG 800×800(PIL)** | **574KB** | ✅ | ✅ | ✅ | ❌ |
| MIN/PNG 纯base64对照 | — | — | ❌ `download error: Invalid URL`（fileData 非 Data URL） | | | |

## 7. 第二轮：真实手机照片

| 用例 | 说明 | 大小 | setValue | API回读 | 页面 |
|---|---|---|---|---|---|
| PHONE ×3 | 原始手机照片 1080×1920 | 664KB | ✅✅✅（稳定） | ✅ | ❌ |
| BRE | 同像素 PIL 重存（EXIF 剥离） | 239KB | ✅ | ✅ | ❌ |

**经验规律（实测，非官方规格，勿当承诺）**：此通道 PNG 一律拒绝；JPEG 疑似有压缩体积下限（~250KB 附近有毛刺：239KB 过、274KB 拒）。**真实业务照片（1–8MB）远高于下限，写入可行性不受影响。**

## 8. 三类 Attachment 对象对比

| 对象族 | source | uploadId 形态 | size | 生成通道 | 页面预览 |
|---|---|---|---|---|---|
| A 历史对象 | `upload_ks3` | 大写短格式（如 `N3HQXRJJACQCY`） | 真实值+imgSize | WPS 客户端上传 | ✅ 可预览 |
| B CF-WPS-12 对象 | `upload_ks3`* | UUID / attachment_id | 真实值 | documents API 三步上传 | ❌ |
| C CF-WPS-12A 对象 | **`cloud`** | 短格式（如 `MgAzx1I`） | **回读 size=0** | AirScript base64 | ❌ |

\* 见 CF-WPS-12 报告 §8。三个对象族互不相通，**只有 A 族被预览服务渲染**。C 族 `size=0` 且文档级附件查询端点对 C 族 uploadId 返回 500/404，**字节是否完整落盘无法用现有官方 API 取证**（NEEDS_EXTERNAL_CONFIRMATION，可用 AirScript `GetAttachmentURL` 进一步验证）。

## 9. WPS 页面人工验证（决定性环节）

业务方打开 WPS 网页 → Sheet 13 → 逐条检查写入成功的记录（PHONE/PHONER1/PHONER2/BRE/D150，跨 25 分钟创建）：**全部「有附件但不预览」**——单元格有附件形态、缩略图空白、点击预览失败。与 CF-WPS-12 的 UIVERIFY 记录症状一致；同期 Sheet 3 生产历史图片（A 族）预览正常（CF-WPS-12 已验证），排除查看环境问题。

## 10. API 回读

`records/list_by_page` 回读 C 族对象结构与写入一致：`[{fileName, linkUrl:"data:image/jpeg;base64"(截断), size:0, source:"cloud", type, uploadId}]`——写入/回读链路本身无损坏。

## 11. 测试矩阵（任务书 §五 A–F + 补充）

| 项 | 结果 |
|---|---|
| A setValue 成功 | **PASS_REAL**（PHONE×3/BRE/D150） |
| B 脚本返回成功 | **PASS_REAL**（`{ok:true, recordId}`） |
| C Attachment 字段有值 | **PASS_REAL** |
| D WPS 页面缩略图 | **FAIL → BLOCKED** |
| E 点击预览 | **FAIL → BLOCKED** |
| F 图片内容正确 | **BLOCKED**（不显示则无法人工核对） |
| 补充：真实手机照片写入 | **PASS_REAL**（3/3） |
| 补充：client_request_id / 幂等 | 不适用（本阶段不涉及 Worker 记录幂等，生产幂等保持 IDEMPOTENCY_PENDING） |

## 12. 安全审计

- 脚本令牌：仅经 `AIRSCRIPT_TOKEN` 环境变量进入进程内存；未写入任何文件、报告、日志；测试代码无硬编码
- 前端/Worker 无任何改动，无 secret 暴露面变化；webhook URL 含 file_id/script_id（非密钥，但已知悉其与令牌组合即可执行，报告中不外传）
- 日志未输出 base64 全文（脚本内仅输出 `b64len`）
- 测试图片无敏感内容；手机照片为业务方自选
- ⚠️ 遗留动作：脚本令牌为**账号级全局凭证**，建议业务方在脚本编辑器删除该令牌（可随时重建）

## 13. 数据清理

- Sheet 13 测试记录：**19 条全部 batch_delete（HTTP 200），残留 0**（脚本基线 3 行业务方原始空行未动）
- 附件文件本体：与 CF-WPS-12 相同，**API 无附件文件删除端点**，AirScript 通道上传的文件本体（成功 5 个：约 239–664KB）残留于文档附件区，可在 WPS UI 手动删除
- 本地一次性生成图（_c12a-*.png/jpg）已删除；保留 `cfwps12a-airscript-v2.js`（当前部署版）、`cfwps12a-airscript.js`（v1 存档）、`cfwps12a-realtest.mjs`（回归资产）

## 14. 生产污染检查

| Sheet | 结果 | 基线 |
|---|---|---|
| Sheet 3（生产巡查表） | 2063 | ✅ 零变化 |
| Sheet 11（员工花名册） | 1291 | ✅ 零变化 |
| Sheet 13（隔离测试表） | 3 | ✅ 回基线 |

全程未访问本地 HSE/PG，未使用 Tunnel，未修改 WPS Pull / server/ / 生产数据库。

## 15. 风险

| # | 风险 | 等级 |
|---|---|---|
| R1 | **平台级预览阻断跨两个官方写入通道确认**（documents API、AirScript base64）；只剩 WPS 客户端上传通道可预览，而其 API 面未公开 | 高（对照片目标） |
| R2 | AirScript 环境与官方文档 API 面不一致（`Application.Record` 缺失、ET 风格 Application），且类型/体积隐性限制未在官方文档记载——未来版本可能变化 | 中 |
| R3 | 脚本令牌账号级全局权限，长期持有有泄露风险 | 中（缓解：用后即删） |
| R4 | C 族对象 `size=0`，字节落盘完整性未取证 | 中 |
| R5 | 类型/体积规律为经验实测，边界（~250KB 毛刺）未完全标定 | 低 |

## 16. Blocker

- **B1（核心）**：AirScript 通道对象在 WPS 页面不可预览，与 CF-WPS-12 同根因。请求侧已无可解变量（本轮已排除 Data URL 格式、类型、尺寸、EXIF、来源脚本），**需 WPS 开放平台官方支持/工单确认**：API 写入的 Attachment（source=cloud/upload_ks3-API 族）为何不被预览服务渲染，以及是否存在面向 ISV 的可预览上传通道。NEEDS_EXTERNAL_CONFIRMATION。
- B2：dbsheet 专用上传端点 `/v7/coop/dbsheet/{fid}/attachments/upload`（路由存在、proto schema 未公开）仍是潜在线索，需官方文档支持。

## 17. 回滚

- 无生产代码/配置改动（Worker 侧 CF-WPS-12 代码冻结未动，回归全绿）
- WPS 侧：删除测试脚本、删除脚本令牌（建议）、UI 手动清理残留附件文件本体
- 如放弃 AirScript 路线：删除脚本即可，无其他残留

## 18. 修改文件清单

| 文件 | 说明 |
|---|---|
| `grid-mobile-cloudflare/worker/test/cfwps12a-airscript.js` | v1 脚本（诊断存档，已被替换） |
| `grid-mobile-cloudflare/worker/test/cfwps12a-airscript-v2.js` | 当前部署于 WPS 脚本编辑器的版本（诊断+多策略+回读） |
| `grid-mobile-cloudflare/worker/test/cfwps12a-realtest.mjs` | 真机实验 runner（OpenAPI 建记录→webhook→回读） |

`server/`、`WPS Pull`、生产数据库、CF-WPS-10/11/12 代码：**零改动**（回归 10: 8/8、11: 38/38、12: 25/25 全绿）。

## 19. CF-WPS-12A_STATUS

**BLOCKED**（任务书 §九第 1 情形：setValue 成功但页面不能预览 → 必须停止）。

- 已真实达成：AirScript 官方链路真机全通（含真实手机照片 3/3 稳定写入）；触发形态（webhook+令牌）即 CF-WPS-13 所需通道形态；类型/体积隐性限制已实测标定
- 未达成：WPS 页面缩略图/预览（平台级阻断，跨两通道确认）
- 后续建议：① 以本报告两阶段实证向 WPS 开放平台提交工单（B1）；② 若官方确认无解，照片链路需业务侧决策（WPS 客户端人工上传兜底 / 等待官方通道），**不得自行引入第三方存储**；③ CF-WPS-13（完整 H5 巡查链）在照片预览解锁前，其余环节（登录→巡查→提交→Pull）可先行设计，照片环节以 PENDING_EXTERNAL 标注
