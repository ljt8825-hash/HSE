# CF-WPS-12B：WPS 官方 Attachment 预览能力 — 技术支持工单材料

> 用途：可直接提交给 WPS 开放平台技术支持 / 工单系统的完整问题说明。
> 证据来源：CF-WPS-12 / CF-WPS-12A 两阶段真机实测（全部为真实 API 调用与人工页面核验，非推测）。
> 日期：2026-09-15 ｜ 提交方：HSE 网格长巡查项目组

---

## 1. 问题背景

我们正在通过 WPS 开放平台官方 API 将移动端巡查照片写入 WPS 多维表（DBSheet）的 Attachment 字段。实测发现：**API 写入的附件对象在多维表页面「有附件但缩略图空白、点击预览失败」**，而 WPS 客户端历史上传的同类对象一切正常。两个官方写入通道（V7 documents API、AirScript base64）症状完全一致，请求侧已排除全部变量。

## 2. 环境信息

| 项 | 值 |
|---|---|
| 多维表文件 | `cn229thwalDs`（kdocs.cn） |
| 测试 Sheet | Sheet 13「H5提交测试」（隔离测试表，非生产） |
| Attachment 字段 | 「测试图片」，fieldId=`Bm`（经官方 API `POST .../sheets/13/fields` 创建成功） |
| 应用授权 | client_credentials（应用授权），已开通 `kso.dbsheet.readwrite` + `kso.documents.readwrite`（经企业管理后台审批） |
| 鉴权方式 | V7：`Bearer access_token` + `KSO-1` 签名（文档附件端点双头并用） |

## 3. 已验证成功的能力（真实实测）

### 3.1 V7 documents 附件三步上传（官方文档化链路）

```
POST /v7/documents/{file_id}/attachments/upload/address  {name,size,type}
  → data.request{url,method,headers} + upload_id(UUID) + send_back_params
PUT  上一步返回的 url（二进制）→ 响应头 ETag + newfilename
POST /v7/documents/{file_id}/attachments/upload/complete {upload_id, params:{etag,key}}
  → data.attachment_id（大写短格式，如 ATHCN2RJAAAGG）
```

真实 JPEG/PNG 上传全通；返回的 `upload_id`（UUID）与 `attachment_id`（大写短格式）写入 Attachment 字段均被接受。

### 3.2 AirScript base64 写入（官方 AttachmentField_setValue 能力）

```js
Application.Sheets('H5提交测试').Views(1).RecordRange(recordId, '@测试图片').Value =
  Application.DBCellValue([{ fileData: "data:image/jpeg;base64,...", fileName: "xxx.jpg" }]);
```

真实手机照片（1080×1920，约 664KB）**3/3 稳定写入成功**；经 webhook（`sync_task`，脚本环境 2.0）远程触发。

### 3.3 API 回读

`POST /v7/coop/dbsheet/{file_id}/sheets/{sheet_id}/records/list_by_page` 可完整回读 Attachment 对象（fileName/size/source/type/uploadId 逐字段一致）。

## 4. 决定性失败：页面不可预览

**同一字段（Sheet 13「测试图片」）、同一查看环境（主账号 WPS 网页），四轮受控对照实验（CF-WPS-12）+ 13 组实验矩阵（CF-WPS-12A）：**

| 对象族 | 生成通道 | source | uploadId 形态 | size | 页面缩略图 | 点击预览 |
|---|---|---|---|---|---|---|
| A 历史（对照） | WPS 客户端上传 | `upload_ks3` | 大写短格式（如 `N3HQXRJJACQCY`），对象路径 `2_<hash>/compatible` | 真实值（+imgSize） | ✅ 显示 | ✅ 正常 |
| B documents API | V7 三步上传 | `upload_ks3`* | UUID / attachment_id，对象路径 `1_<hash>/ks3_compatible` | 真实值 | ❌ 空白 | ❌ 失败 |
| C AirScript | DBCellValue base64 | `cloud` | 短格式（如 `MgAzx1I`） | **回读 size=0** | ❌ 空白 | ❌ 失败 |

\* B 族回读 source 与 A 族相同，但对象本体路径不同（`1_` vs `2_` 前缀）。

已排除的请求侧变量（四轮对照）：`imgSize` 有无、uploadId 取 UUID 还是 attachment_id、PUT 是否带 Content-Type、Data URL 格式、图片类型/尺寸/EXIF/宽高比、来源脚本。**结论：预览失败与字段值形态完全无关，是对象本体的属性差异。**

补充实测：C 族（source=cloud）`size=0`，且文档级附件信息端点对 C 族 uploadId 返回 500/404，字节落盘完整性无法用现有官方 API 取证。

## 5. dbsheet 专用上传端点验证结果

候选端点：`POST /v7/coop/dbsheet/{file_id}/attachments/upload`

| 验证手段 | 结果 |
|---|---|
| V7 官方文档（open.wps.cn dbsheet 文档族：schema/records/fields/sheets/views） | **无该端点定义，无请求 schema** |
| 实测 POST（CF-WPS-12） | 路由存在：`400 ParameterFormatError`，body 呈 proto 风格（`file` 为对象且必填子字段未知） |
| 实测 OPTIONS（CF-WPS-12B，无副作用探测） | `404 Route Not Found`（code=404000001） |

**DBSHEET_ATTACHMENT_UPLOAD_SCHEMA=UNAVAILABLE** —— 该端点对 ISV 不可用（未公开 schema）。

另查到旧版 API 体系（WPS-3 签名）有一个公开文档化的「上传附件到文件」端点：
`POST /kopen/api/v3/developer/dmc/office/file/:file_id/attachment`（multipart/form-data，返回大写短格式 `object_id`，如 `KI55UBAASY`，含 `extra_info.width/height`）。其 `object_id` 形态与历史可预览对象的 uploadId 同族。**该端点属旧版 kopen/WPS-3 体系，我们未在本次验证范围测试**，作为问题 ③ 一并请官方确认。

## 6. 请求官方确认的问题清单

1. **【核心】** 为什么不同来源生成的 Attachment 对象在多维表页面行为不同（A 族可预览、B/C 族不可）？是对象存储路径（`1_` vs `2_` 前缀）、预览服务白名单、还是其他属性差异？**是否存在面向 ISV 的、经官方 API 写入后可在页面正常缩略图/预览的 Attachment 上传通道？**
2. `POST /v7/coop/dbsheet/{file_id}/attachments/upload` 是否为真实对外端点？如是，请提供官方请求 schema（POST 返回 400 ParameterFormatError、OPTIONS 返回 404 Route Not Found）；如否，请忽略。
3. 旧版 `POST /kopen/api/v3/developer/dmc/office/file/:file_id/attachment`（WPS-3 签名，返回大写短格式 `object_id`）是否仍可用？其返回的 `object_id` 能否写入多维表 Attachment 字段并在页面正常预览？新版 V7 应用（KSO-1 签名）如何调用它？
4. AirScript `DBCellValue` 写入的对象（source=cloud，回读 size=0）：字节是否完整落盘？`Application.Record.GetAttachmentURL({UploadId, Source})` 能否对其返回可用 URL？
5. 文档级附件（`/v7/documents/*`）是否提供官方删除端点？（实测 `DELETE /v7/documents/{fid}/attachments/{id}` 404，测试文件本体无法经 API 清理。）

## 7. 结论与诉求

- 两个官方公开写入通道（documents API、AirScript）产出的 Attachment 对象**均不可在页面预览**，跨通道、跨实验、跨 25 分钟时间窗一致复现。
- 我们已按官方文档完成全部可得步骤（权限审批、官方三步链、官方脚本 API），无任何绕过行为。
- **诉求**：请官方确证「API 写入 → 页面可预览」的正确官方通道（问题 1/3），或明确当前版本暂不支持并给出规划；如问题 2/3 端点可用，请提供 schema。

## 8. 判定

在官方答复前，本项目照片链路状态为 **PENDING_EXTERNAL（外部平台能力阻断）**——非 H5/Worker 实现缺陷：上传、写入、回读子链路已全部真机打通并保持代码就绪。
