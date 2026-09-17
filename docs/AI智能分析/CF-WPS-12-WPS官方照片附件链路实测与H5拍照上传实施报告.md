# CF-WPS-12：WPS 官方照片附件链路实测与 H5 拍照上传 实施报告

> 日期：2026-09-15 ｜ 阶段：CF-WPS-12 ｜ 状态：**BLOCKED（WPS 页面预览环节）**
> 上游依据：CF-WPS-10（隔离测试 Sheet）/ CF-WPS-11（Session 身份体系）/ CF-WPS-02（Attachment→URL 不可用实证）

---

## 1. 执行摘要

本阶段目标：确认手机 H5 拍摄的图片能否经 Cloudflare Worker 用 **WPS 官方能力**写入多维表 Attachment 字段并在 WPS 页面正常查看。

实测结论分层明确：

| 环节 | 结论 |
|---|---|
| ① 官方三步上传链（address→PUT→complete） | **PASS_REAL**（权限开通后全通） |
| ② Attachment 字段写入（官方对象结构） | **PASS_REAL** |
| ③ API 回读（结构与生产历史记录一致） | **PASS_REAL** |
| ④ **WPS 页面缩略图/预览** | **❌ FAIL（BLOCKED）** |

四轮受控对照实验（§9）把预览失败定位为**平台级阻断**：同一字段、同一对象结构，生产历史对象（WPS 客户端上传）可显示，而 OpenAPI 文档级上传链产生的对象「收得下、读得出、不可预览」——与 imgSize 有无、uploadId 取 UUID 还是 attachment_id、PUT 是否带 Content-Type **均无关**。

**cfwps12-status=BLOCKED**（§二十一 PASS 标准 #4 不满足，不硬凑 PASS）。上传/写入/回读子链路全部真实成功且代码已就绪；预览阻断的官方备选方案已找到（AirScript base64 setValue，见 §9.6），**需业务方决策后另立阶段验证**，本阶段未擅自实施。

## 2. WPS 官方 API 实测

**权限前置（本阶段已解除）**：应用原缺 `kso.documents.readwrite`，WPS 明确返回 `invalid_scope: "The requested scopes 'kso.documents.readwrite' has not been granted"`（HTTP 403 code=400000003）。业务方已在开发者后台「开发配置→权限管理」申请、经「应用发布→版本管理」创建版本发布、企业管理后台审批通过。**未绕过任何权限。**

**认证面**：文档附件端点须 `Bearer (client_credentials) + KSO-1 签名` 双头；dbsheet 记录端点维持 Bearer-only。

## 3. Attachment Schema（真实实测）

- 生产 Sheet 3 附件字段（fieldId/类型实读）：三违照片：图片1/2/3（J/K/L，Attachment）、整改后照片：图片1（Q，Attachment）。
- **生产历史附件真实结构**（339+84+14+6 条非空，修正了 CF-WPS-09「全空」的旧结论）：
  ```json
  [{"fileName":"....jpeg","imgSize":"640*854","size":77486,"source":"upload_ks3","type":"image/jpeg","uploadId":"N3HQXRJJACQCY"}]
  ```
  `imgSize` 为可选字段；uploadId 为大写短格式（12 位）。
- 链接镜像列（三违照片链接等，2037 条非空）：`https://ksc-bj.ag.wps.cn/api/object/2_<hash>/compatible`。**匿名 GET 实测 404**（受控地址，非公网直链，与 CF-WPS-02 一致）。
- 测试 Sheet 13 新增字段：API `POST .../sheets/13/fields {name:"测试图片",type:"Attachment"}` **成功**（fieldId=Bm）——官方 API 支持创建 Attachment 字段。

## 4. 上传三步链（官方，全真机）

```
① POST /v7/documents/{file_id}/attachments/upload/address   {name,size,type}
     → 200 { request:{url,method:"PUT",headers:{host,x-domain-id}},
             send_back_params:{etag:"header.ETag", key:"header.newfilename"},
             upload_id:"<uuid>" }
② PUT ①的 url（带 ①的 headers；+Content-Type）传图片二进制 → 200
     → 响应头 ETag（带引号）+ newfilename
③ POST /v7/documents/{file_id}/attachments/upload/complete
     {upload_id, params:{etag:<去引号>, key:<newfilename>}}
     → 200 { data:{ attachment_id:"ATHCN2RJAAAGG", kind:"" } }
```

踩坑记录（均为实测纠正）：
- ①的 URL/method/headers 在 `data.request` 下，不是 data 顶层；
- ③的请求体是 `{upload_id, params:{etag,key}}`——`send_back_params` 是「从响应头哪里取值」的指示，首次猜测 echo request/response 结构报 `params is empty, must contain key and etag`；
- 地址须 10 分钟内使用；对象 URL 完成后 GET→405（**upload URL ≠ download URL**）。

**鉴权/其他路径探测**：`/v7/coop/dbsheet/{file_id}/attachments/upload` **路由存在**（400 ParameterFormatError；body 为 proto 风格，`file` 为对象且必填子字段未知）→ 该 dbsheet 专用上传端点真实存在但公开文档无定义，标 **NEEDS_EXTERNAL_CONFIRMATION**（不盲目猜 proto schema）。DBT v1 `attachment/urls` 在本调用面仍 404（CF-WPS-02 结论维持）。附件信息/删除端点路径均 404（文档附件一经上传，**API 无删除通道**）。

## 5. 实际请求/响应结构摘要

（敏感参数已掩码；完整字段见 §4）① 返回 `upload_id`（UUID 格式）与 `attachment_id`（大写短格式，与历史可显示对象同族）是两个不同对象。② 响应头 `ETag`/`newfilename` 为 ③ 的必传参数。

## 6. 测试 Sheet

复用 CF-WPS-10 的 Sheet 13「H5提交测试」，API 新增「测试图片」Attachment 字段（Bm），未新建 Sheet，未动 Sheet 3/11。

## 7. WPS 页面验证（人工）＝ ❌ BLOCKED

业务方（主账号/管理员）在 WPS 网页打开 Sheet 13 人工核验：**所有 API 上传对象的记录「有附件图标但缩略图空白、预览失败」**；同页对照的历史生产对象（HISTREF，引用生产 uploadId `N3HQXRJJACQCY`）**显示正常**。

## 8. API 回读

`list_by_page` 回读值与写入结构逐字段一致（fileName/size/source/type/uploadId 原样返回）；回读不含可渲染 URL（无 file_id/preview_url/download_url 字段）——「H5 渲染需要另一次 URL 换取，而换取端点在本调用面不存在」（CF-WPS-02 结论维持并加固）。

## 9. 历史图片结构对比（四轮受控对照实验）

同一字段（Sheet 13「测试图片」）、同一查看环境（业务方 WPS 网页）、四组变量隔离：

| 记录 | uploadId 来源 | 变量 | 结果 |
|---|---|---|---|
| UIVERIFY | 新链 UUID | 基准 | ❌ 不显示 |
| FRESH-IMGSIZE | 新链 UUID | +imgSize | ❌ 不显示 |
| ATTID / UUIDCTL | attachment_id vs UUID | ID 格式 | ❌ 两条均不显示 |
| CT | 新链 UUID | PUT 带 Content-Type:image/jpeg | ❌ 不显示 |
| **HISTREF** | **生产历史对象（N3HQXRJJACQCY）** | 与生产记录逐字段一致 | ✅ **显示** |

**结论**：预览失败与字段值形态完全无关，是**对象本体**的属性差异——官方文档级上传链（`/v7/documents/*`，对象路径 `1_<hash>/ks3_compatible`）产生的对象不被多维表预览服务接受；可显示对象来自 WPS 客户端上传通道（对象路径 `2_<hash>/compatible`），该通道未在本应用 API 面暴露。**「API 写入→页面可看」在当前官方调用面上被平台阻断。**

### 9.6 官方备选方案（已找到，未实施）

官方文档确证：**多维表格 Attachment 字段支持 base64 编码输入**（`AttachmentField_setValue`，AirScript 脚本层 API）。可行链路：Worker 存图 → 自动化 Webhook 触发 AirScript → AirScript HTTP 拉取图片（≤2M）→ base64 setValue 写 Attachment。全程 WPS 官方能力、零第三方存储。**属新阶段工作（AirScript 部署在 WPS 文件内，需业务方操作授权），本阶段未实施。** 另一官方备选：多维表「自动化 HTTP 请求/插件」通道。

## 10. Pull 兼容性验证（只读，零修改）

代码级只读结论：现有 Pull 引擎 `SYNC_PROJECTION` 仅投影 18 列文本列（18-hash 冻结段），Attachment 列不在投影内，`toCanonicalDto()` 不读附件 → **Pull 本就不消费 Attachment 列**，本阶段对其零影响；「Attachment→PG」的图片带入属 CF-WPS-14 范畴。测试 Sheet 13 不在 Pull 绑定内（Pull 仅绑 Sheet 3），无法做运行时验证——如实标注：**Attachment 已验证，Pull 运行时兼容性未验证（无修改、无影响）**。

## 11. Worker 实现（升级现有端点，无重复 endpoint）

`/wps/upload/image` 由 CF-WPS-08 的 501 占位升级为真实实现（任务书 §十一「优先修复现有接口」）：

```
Session 验签(WORKER_SESSION_SECRET) → employee_code=sub 服务端注入
→ ALLOW_WPS_WRITE 门 → 仅隔离测试 Sheet 门
→ multipart 解析 → 大小校验(≤5MB/体≤6MB)
→ magic bytes 嗅探（FFD8FF/89504E47，不信 Content-Type）+ 扩展名一致性
→ client_request_id 幂等预查（复用 CF-WPS-10 扫描语义）
→ WPS 三步上传（KSO-1+Bearer）→ 测试 Sheet 建记录（白名单字段）
→ 返回 {recordIds, attachment:{uploadId, attachmentId}, employee:{employee_code}}
错误映射：WPS 403→503 UPLOAD_SCOPE_MISSING；5xx→502 WPS_UPSTREAM_ERROR；429→429
```

H5（`frontend/home.html`）：最小拍照上传控件（`capture=environment` + accept jpeg/png）+ 上传按钮 + 结果提示；`app.js` 增 `mobileUpload()`（FormData，前端不传 employee_code）。

**注**：因预览被平台阻断，该端点写入的记录图片当前不可预览——代码保留（链路真实可用），激活与使用方式属 §16 决策项。

## 12. 安全审计

- Session 门：未登录/篡改 token → 401（真机）；`ALLOW_WPS_WRITE` 缺省关闭。
- **employee_code 不可伪造**：FormData 传入 `employee_code=HACKER-CODE` → 记录实际写入 Session sub（真机读回验证）。
- magic bytes：非图片/伪造 MIME → 400；>5MB → 413（本地拒绝，不打上游）。
- 泄露扫描（真机+mock 全响应体）：无 APPSECRET、无 WPS token、无 Session secret/token、无 etag/newfilename、无身份证模式；前端 bundle grep 全禁词零命中。
- 幂等：同 `client_request_id` 重复上传 → `deduplicated:true`，不产生重复记录（真机）。生产 Sheet 3 幂等仍 **IDEMPOTENCY_PENDING**（未触碰、未声称解决）。

## 13. 测试矩阵（A–T）

| 项 | 结果 | 级别 |
|---|---|---|
| A 真实 JPG 上传 | 上传+写入+回读全通 | PASS_REAL |
| B 真实 PNG 上传 | 同上 | PASS_REAL |
| C >5MB | 413 本地拒绝 | PASS_REAL |
| D 非图片 | 400 | PASS_REAL |
| E 伪造 MIME | 400（magic bytes） | PASS_REAL |
| F 官方上传成功 | 三步链 200 全通 | PASS_REAL |
| G 上传失败 | 500→502 / 403→503 归一化 | PASS_MOCK（真机 403 权限期已实证） |
| H Attachment 写入 | 字段接受官方结构 | PASS_REAL |
| I Attachment 回读 | 结构一致、无 URL | PASS_REAL |
| J WPS 页面预览 | **缩略图空白/预览失败** | **❌ FAIL** |
| K URL/文件有效性 | upload URL≠download URL；对象 URL GET 405；匿名镜像 URL 404 | PASS_REAL |
| L client_request_id 重复 | deduplicated | PASS_REAL |
| M 未登录 | 401 | PASS_REAL |
| N token 篡改 | 401 | PASS_REAL |
| O employee_code 伪造 | 服务端注入，忽略前端 | PASS_REAL |
| P/Q/R token/secret 泄露/清理 | 全绿 | PASS_REAL |
| S/T Sheet 3/11 零变化 | 2063/1291 前后一致 | PASS_REAL |

回归：cfwps08 8/8（T5 断言随 501→真实实现升级，见 §19）、cfwps10 8/8、cfwps11 38/38、cfwps12 mock 25/25、cfwps12 real 18/18、oauth 9/9、jwt-bridge 3/3、http-smoke 3/3。

## 14. 测试数据清理

- 真机测试自建记录 4 条 + 人工核验/对照记录 6 条（UIVERIFY/HISTREF/FRESH-IMGSIZE/ATTID/UUIDCTL/CT）全部 batch_delete；`CF-WPS-12-TEST` 前缀残留 **0**；Sheet 13 回到基线 3 行（业务方原始空行未动）。
- **不可删除残留（如实声明）**：实验经官方链上传的文件本体（≤188B 合成测试图 ×7，已注册为文档级附件，`DELETE /v7/documents/.../attachments/{id}` 404 无删除端点）留存于 WPS 文件附件区，无业务影响，可由业务方在 WPS UI 手工删除。

## 15. 生产污染检查

Sheet 3 = 2063（前后一致，零写入）；Sheet 11 = 1291（前后一致，只读）；Sheet 13 = 3（回基线）；本地 HSE/PG 零访问；无 Tunnel；未部署任何 Cloudflare 资源；CF-WPS-07/10/11 冻结代码零改动。

## 16. 风险

| # | 风险 | 等级 |
|---|---|---|
| R1 | **平台级阻断**：官方文档级上传链对象在 Attachment 字段不可预览（四轮对照实证）；dbsheet 专用上传端点存在但 proto schema 未公开 | 高（对本阶段目标） |
| R2 | 文档附件 API 无删除端点 → 测试文件本体残留（7 个小文件） | 低 |
| R3 | `kso.documents.readwrite` 已开通——权限面变大，须在后续阶段继续最小使用 | 中 |
| R4 | 上传 URL 10 分钟有效、地址/完成两步间无幂等键 → Worker 侧以 client_request_id 幂等兜底 | 中 |

## 17. Blocker

- **B1（核心）**：Attachment 对象预览被平台阻断，PASS 标准 #4 不满足 → 状态 BLOCKED。
- **D1（决策项）**：是否批准下一阶段实施 §9.6 官方备选（AirScript base64 setValue / 自动化通道）？全程 WPS 官方能力，需业务方在 WPS 文件内部署脚本并授权。
- **D2（可选）**：就 dbsheet 专用上传端点（proto schema）向 WPS 开放平台支持确证。

## 18. 回滚方案

本阶段未部署、未写生产，无需生产回滚。代码回滚：`worker/index.js` 中 CF-WPS-12 块删除、`/wps/upload/image` 恢复 501 占位（cfwps08 T5 与 http-smoke S2 断言同步还原）；`frontend` 上传控件删除；Sheet 13「测试图片」字段可由业务方在 WPS UI 删除；cfwps08/10/11 全部测试不依赖新块。

## 19. 修改文件清单

**新增/修改（允许范围内）**
- `grid-mobile-cloudflare/worker/index.js` — CF-WPS-12 块：三步上传原语 + `/wps/upload/image` 真实实现（501→Session/门控/magic bytes/幂等/错误映射），纯追加；`/wps/*` 既有端点行为不变
- `grid-mobile-cloudflare/worker/test/cfwps12.test.mjs` — Mock 25 项（新增）
- `grid-mobile-cloudflare/worker/test/cfwps12-realtest.mjs` — 真机 18 项（新增，回归资产保留）
- `grid-mobile-cloudflare/worker/test/cfwps08.test.mjs` — 仅 T5 断言：501 占位 → 503 fail-closed（CF-WPS-12 升级后的新门控语义，行为变更如实记录）
- `grid-mobile-cloudflare/worker/test/http-smoke.mjs` — 仅 S2 断言：同上
- `grid-mobile-cloudflare/frontend/home.html`、`frontend/app.js` — H5 最小上传控件

**明确未修改（禁改清单逐项声明）**：`server/` 全部、WPS Pull（wpsFieldMap/引擎零触碰，18-hash 冻结段不变）、HSE/PC 登录、三违业务、生产数据库、CF-WPS-07 employee_code、CF-WPS-10 create record 语义、CF-WPS-11 login/session；Sheet 3/11 数据零变化。

## 20. CF-WPS-12_STATUS

**BLOCKED（WPS 页面预览环节）**

上传链（F）、Attachment 写入（H）、回读（I）、Session 身份（M/N/O）、幂等（L）、安全（P/Q）、清理（R）、生产零污染（S/T）全部 PASS_REAL；唯一但**核心**的「页面真实显示（J）」被平台级因素阻断（四轮对照实验排除所有请求侧变量）。按任务书 §二十四不包装成 PASS。备选官方方案已备好（§9.6），待 D1 授权后另立阶段实施。生产幂等保持 IDEMPOTENCY_PENDING。
