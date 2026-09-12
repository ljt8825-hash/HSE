# HSE-MOBILE-GRID-ARCH-02：WPS 云端缓冲最小可行架构设计与外部能力验证报告

> **任务性质**：架构设计 + 外部能力验证，**STRICT READ-ONLY**
> **上游依据**：`HSE-MOBILE-GRID-ARCH-01`《移动端 WPS 云端缓冲架构复核报告》→ `PHASE_HSE_MOBILE_GRID_ARCH_01_AUDIT_COMPLETED_WITH_EXTERNAL_DEPENDENCIES`
> **当前生产冻结态**：`WPS-PG-SYNC-05-H-0` FROZEN；`PHASE_HSE_MOBILE_GRID_03B_IMPLEMENTED_READY_FOR_03C`
> **本任务核心命题**：在不破坏 05-H-0 冻结原则的前提下，**WPS 作为手机三违巡查云端缓冲层的最小、最安全、可逐步落地架构到底是什么**
> **报告生成时间**：2026-09-12

---

## 0. 本轮执行边界声明（先行自证）

| 禁止项（用户 §二） | 本轮实际 |
|---|---|
| 修改任何业务代码 | ✅ **0 文件** |
| 修改 `server/.env` | ✅ 未触碰（仍 `2026-09-11 22:22:50`） |
| 修改数据库结构 | ✅ **0 DDL** |
| INSERT / UPDATE / DELETE | ✅ **0 DML**（本轮甚至未新建 DB 连接，仅复用 ARCH-01 已落盘的只读取证 JSON） |
| 修改 / 创建 / 删除 WPS 数据 | ✅ **0 次 WPS 网络调用** |
| 修改 WPS-PG-SYNC / 恢复 PG→WPS | ✅ 未触碰 |
| 修改 `REVERSE_WRITE_ENABLED` | ✅ 未触碰（仍为代码级硬锁 `false`，`wpsGridPullEngine.js:40`） |
| 修改 `PROTECTED_COLUMNS` | ✅ 未触碰（`wpsFieldMap.js:127`） |
| 修改 `SYNC_PROJECTION` | ✅ 未触碰（`wpsFieldMap.js:107-115`） |
| 修改 `gridScope` / `authenticatedEmployeeResolver` | ✅ 未触碰 |
| 修改 users / JWT / auth | ✅ 未触碰 |
| 停止 / 杀死 / 重启任何进程 | ✅ 未执行任何进程操作 |
| 操作 5876 生产服务 | ✅ 未操作 |
| 执行生产 WPS Pull | ✅ 未执行 |
| 继续 GRID-03-C / 04 / 05 | ✅ 未继续 |
| 新增 npm 依赖 | ✅ 0 依赖 |
| 破坏性真机测试 | ✅ 未做的任何故障注入 |
| 为验证而创建 / 修改 / 删除真实 WPS 业务数据 | ✅ 未创建 / 未修改 / 未删除 |

**本轮唯一新增产物 = 本报告文件。** 外部能力验证手段限于：① 官方文档（`open.wps.cn` / `developer.kdocs.cn` / `365.kdocs.cn`）② 项目内既有真机验收报告（`Sprint-WPS-02-C-真机执行验收报告.md`）③ 只读代码与只读数据结构。

---

## 1. 执行摘要

### 1.1 一句话结论

> **WPS 云端缓冲在「技术可行性」上成立；但「手机电脑关机仍可提交」这个业务目标的成立与否，取决于 `HSE Backend` 的部署位置，而不是 WPS 的能力。**
> **在现有全部约束（不解冻 / 不改表 / 不改 SYNC_PROJECTION / 不动 05-H-0）下，唯一可逐步落地的最小架构是「方案 C′ + 独立归属组件」—— 而它的第一步不是写代码，是把 Backend 迁出这台会被关机的电脑。**

### 1.2 与 ARCH-01 相比，本轮**新增/修正**的五个决定性判断

| # | 判断 | 性质 | 依据 |
|---|---|---|---|
| **1** | **「创建时指定 WPS Record ID」不是硬前置条件**；硬前置是「**按字段值条件查询**」或「**服务端幂等登记**」 | ⭐ **修正 ARCH-01** | §6、§9 |
| **2** | WPS 附件写入是**二段式**（先上传得 `upload_id` → 字段值写 `{uploadId,fileName,source}` 结构体数组），**不是**「字段里塞 URL / 塞二进制」 | ⭐ **新增能力事实** | §5.2 |
| **3** | WPS 板的**原生 Attachment 列真实存在**（J/K/L/Q），但**其值不含可直接渲染的 URL** ⇒ 天生不能作为 HSE 图片渲染源 | 强化 ARCH-01 | §5.3 |
| **4** | **身份 / grid_id 归属可以在「不解冻 + 不改表」下解决**——办法是新增一个**与 Pull 引擎平级的独立归属组件**，它直接读 WPS 的 `巡查人员ID`（服务端写、手机不可写）并回填 PG 的 `inspector_employee_id`/`grid_id`，**不改 SYNC_PROJECTION、不改 PROTECTED_COLUMNS、不改 Pull 引擎** | ⭐ **新增可行路径** | §7.4 |
| **5** | **行级权限缺口（`WPS_ROW_SCOPE_DEFERRED`）与身份归属是同一个依赖**：WPS DTO 恒 `gridId: null`（`gridInspectionRepository.js:86`），所以**归属不做完，行级权限无论怎么写都做不出来** | ⭐ **新增依赖识别** | §8 |

### 1.3 四个阶段的严格区分（用户 §一 的核心要求）

> 用户要求「A 手机提交成功并保存到 WPS / B WPS 数据进入 PG / C PG 形成归属 / D HSE 可见」四阶段**不得混为一谈**。本报告全文遵守，并在每个结论处标注所处阶段。

| 阶段 | 定义 | 当前是否有独立保障 | 卡点 |
|---|---|---|---|
| **A** | 手机提交成功，数据**已落 WPS 云端** | ❌ 无（Backend 在本机） | **P1 部署位置** |
| **B** | WPS 数据**经 Pull 进入 PG 行** | ✅ 有（单事务 INSERT + `sync_map` 幂等） | 无（已冻结且验证） |
| **C** | PG 行**形成 `grid_id` / `inspector_employee_id` 归属** | ❌ **无**（Pull 恒写 NULL） | **P3 归属组件** |
| **D** | HSE 正式业务**可见**（网格长能看到自己的记录） | ❌ 无 | **P2 行级权限 + P3 归属** |

**关键结论**：ARCH-01 的「云端缓冲成功 ≠ PG 已同步」在本报告中细化为——**「A 成功」甚至不蕴含「B 一定发生」，「B 成功」也不蕴含「C 成立」，「C 成立」才可能「D 可见」。四段是四个独立故障域。**

---

## 2. 当前架构真实拓扑（实测）

### 2.1 现状（生产态，`WPS_GRID_DATA_SOURCE=false`）

```text
                      ┌───────────────────────────────────────────┐
                      │      这台会被关机的开发电脑（单点）        │
                      │                                           │
   手机 WebApp ──────▶│  HSE Backend (5876, PID 23396)            │
   (移动端 5 路由)     │    ├─ 认证: JWT → users 表覆盖 role        │
                      │    ├─ 身份: authenticatedEmployeeResolver  │
                      │    ├─ 范围: gridScope (SQL 行级 fail-closed)│
                      │    ├─ 写: POST/PUT/DELETE /grid-records    │
                      │    ├─ 上传: POST /api/files/upload/image    │
                      │    │        └▶ ./server/uploads/images/ ** │
                      │    └─ Scheduler (每 15 min) ──┐            │
                      │                               │            │
                      │  PostgreSQL 17.10 (5432)      │            │
                      │   grid_inspection_records ◀───┘ Pull(只读) │
                      │   grid_record_sync_map                     │
                      └───────────────────────────────────────────┘
                                                    ▲
                                                    │ 单向 Pull（只读）
                                                    │
                                        ┌───────────┴────────────┐
                                        │  WPS 多维表格（云 SaaS）│
                                        │  file_id cn229thwalDs  │
                                        │  sheet_id 3 / 2063 条  │
                                        └────────────────────────┘
   注意：** 图片物理文件落本机磁盘，是关机场景下的断点
```

### 2.2 关键实测数据（只读）

| 项 | 实测值 | 来源 |
|---|---|---|
| `grid_inspection_records` | **2061** 行 / `max(id)=7192` | ARCH-01 只读取证 |
| `grid_record_sync_map` | **2061** 行 / `conflicts=0` / `hash_null=0` | 同上 |
| 幂等键 | `UNIQUE(wps_record_id, wps_file_id)` ✅ 存在 | `pg_indexes` |
| `inspector_employee_id IS NULL` | **2051 / 2061**（99.5%） | 同上 |
| `grid_id IS NULL` | **327** | 同上 |
| `rectified_photo` 形态 | EMPTY 1114 / RELATIVE 468 / NULL 392 / **HTTP_URL 84** / OTHER 3 | 同上 |
| `image_content` 形态 | RELATIVE **1698** / HTTP_URL 337 / NULL 26 | 同上 |
| `rectified_photo` 相对路径 × sync_map | **mapped 468 / local_only 0** | 同上 |
| `users` / `employee` / `grid_areas` | 63（62 已绑定）/ 3417 / **62** | 同上 |
| `grid_record_sync_state` | **0 行**（无代码引用，实际未使用） | 同上 |
| WPS 连接配置 | `file_id=cn229thwalDs`, `sheet_id=3` | `.env` + sync_map 实测 |

### 2.3 当前 WPS 调用面能力（代码级）

| 能力 | 实现 | 位置 |
|---|---|---|
| 应用级 token | `client_credentials` → Bearer，缓存 + 失效刷新 | `wpsClient.js:55-102` |
| KSO-1 签名（可选） | HMAC-SHA256，官方文档确认为本接口族签名方式 | `wpsClient.js:112-115` |
| 列举（全量翻页） | `POST .../records/list_by_page`，body **仅** `page_num/page_size/prefer_id/show_record_extra_info` | `wpsClient.js:211-226` |
| 单条读取 | ⚠️ **O(n) 全表扫描**（无单条直查端点） | `wpsClient.js:235-238` |
| 创建 | `POST .../records/create`（`prefer_id:false`，批量 50/请求） | `wpsClient.js:241-262` |
| 更新 | `POST .../records/update`（批量 50/请求） | `wpsClient.js:265-275` |
| 删除 | `POST .../records/batch_delete`（**非** `records/delete`，02-C 真机校准） | `wpsClient.js:280-288` |
| 附件上传 | ❌ **无任何实现** | —— |
| 条件查询 / 过滤 | ❌ **无**（`list_by_page` 无 filter 参数） | —— |
| 限频退避 | 429 → 1.5s/3.0s 两次重试 | `wpsClient.js:146-149` |

---

## 3. 电脑关机时数据流（用户 §三 要求，必须分两阶段画）

### 3.1 电脑**开机**时（完整链路）

```text
 阶段A                阶段B                      阶段C          阶段D
 ┌──────┐   ┌─────────────────┐   ┌──────────────────────┐   ┌─────────┐
 │ 手机 │──▶│ 云端 Backend     │──▶│ WPS 多维表格（云）    │   │         │
 └──────┘   │ (C′ 形态)        │   └──────────┬───────────┘   │         │
            └─────────────────┘              │               │         │
                                     Pull（只读，每15min）      │         │
                                               ▼               │         │
                              ┌────────────────────────────┐   │         │
                              │ 本地 Backend + 本地 PG      │──▶│ HSE     │
                              │ grid_inspection_records    │   │ 可见    │
                              │ grid_record_sync_map       │   │         │
                              └────────────────────────────┘   └─────────┘
                                              ▲
                                     ★ 归属组件（新增，阶段C）
```

### 3.2 电脑**关机**时（两阶段必须分开陈述）

```text
 阶段A：手机 → 云端 Backend → WPS                ✅ 成立（前提：Backend 在云端）
 ┌──────┐   ┌─────────────────┐   ┌──────────────────────┐
 │ 手机 │──▶│ 云端 Backend     │──▶│ WPS 云端持久保存      │
 └──────┘   │ 身份/范围/上传   │   │ （数据已安全落地）    │
            └─────────────────┘   └──────────────────────┘
                    ⇣
            「云端缓冲成功」

 ═══════════════════ 以下**未发生**，必须分阶段陈述 ═══════════════════

 阶段B：WPS → Pull → PG                          ❌ **停止**
 阶段C：PG 形成 grid_id / inspector_employee_id  ❌ **停止**
 阶段D：HSE 正式业务可见                          ❌ **停止**

 原因：Scheduler 是**进程内**组件（`app.js` → `initWpsGridSyncScheduler()`），
       Backend 停 ⇒ Pull 停 ⇒ 即使 WPS 已有手机数据，也**不会**进入 PG。

 ⟹ 等待本地环境恢复后，由下一次 Pull 自动补齐（幂等可重入）
```

### 3.3 逐项回答（用户 §三 的两个提问）

**状态 A：手机 → 云端 Backend → WPS，电脑关闭时**
- **手机是否仍能成功提交？** ✅ **能** —— **但前提是 Backend 部署在云端**。当前生产态 Backend 就在这台电脑上 ⇒ **当前答案是不能**。
- **数据是否已经安全保存 WPS？** ✅ **是**（WPS 为云 SaaS，持久化）。

**状态 B：WPS → Pull → 本地 Backend → 本地 PG，电脑关闭时**
- **Pull 是否停止？** ✅ **停止**（进程内 Scheduler 随进程消失）。
- **PG 是否仍然无法更新？** ✅ **是**，PG 完全静默。

### 3.4 ⚠️ 必须明确的一句话（用户 §三 明确要求）

> ### **「云端缓冲成功」 ≠ 「PG 已经同步」**
> 二者是两个独立的故障域：**上游成功只保证数据不丢，不保证 HSE 能看见。**

---

## 4. 云端 Backend 与本地 PG 的关系（用户 §三·四）

### 4.1 现状：**Backend 与 PG 是同一台机器上的两个进程**（强耦合）

- `Scheduler` 在 Backend 进程内（`app.js` 内 `initWpsGridSyncScheduler()`），Pull 是 Backend 的行为；
- PG 在 `127.0.0.1:5432`，**只监听本机**；
- ⇒ **Backend 与 PG 生死同步**：电脑关机 ⇒ 两者同时消失 ⇒ 阶段 B/C/D 同时停止。

### 4.2 引入「云端 Backend」后的三种拓扑可能

| 拓扑 | 云端 Backend 写哪里 | 本地 PG 角色 | 阶段 A 成立 | 阶段 B/C/D |
|---|---|---|---|---|
| **T1 只写 WPS**（推荐起点） | 只写 WPS（`gridInspectionRepository`） | 仍由**本机** Backend 跑 Pull | ✅ | 依赖本机开机 |
| **T2 直写云端 PG** | 写**云端** PG | **退役**或降级为副本 | ✅ | 需复制/切换策略（**大改造**） |
| **T3 双写** | 同时写 WPS + 本地 PG（需内网穿透） | 保留 | ✅ | ⚠️ 一致性分裂，**明确不推荐** |

> **本报告默认推荐 T1**：它把「云端 Backend」限定为一个**纯写入口**，**不触碰 PG 权威性**，也**不触碰 05-H-0 的 Pull 单向性**。T2 会把「谁是权威库」这个根本问题重新打开，超出本架构线。

### 4.3 结论：`/uploads/**` 是这条链路上的**隐藏单点**

- 图片物理文件落在 **`server/uploads/images/`（本机磁盘）**（`middleware/upload.js:112`，`baseDir=path.join(__dirname,'../uploads')`，**无法用环境变量隔离**）。
- 云端 Backend 若在本机 ⇒ 阶段 A 本身就依赖那台电脑；若在云端 ⇒ **上传的文件落在云端磁盘**，与本地 `uploads` 目录**不是同一份数据** ⇒ HSE 渲染会 404。
- ⇒ **图片必须先云端化，云端 Backend 才有意义**（详见 §5.6）。

---

## 5. WPS 图片能力审计（用户 §四）

### 5.1 提问 1~2：是否支持记录附件 / 图片上传、是否支持 API 上传二进制

**分三层裁定（不同层结论不同，禁止混答）：**

| 层次 | 裁定 | 证据 |
|---|---|---|
| **平台数据结构层** | ✅ **支持** | WPS 板上**真实存在原生 `Attachment` 类型列**（`三违照片：图片1`=J 等，共 J/K/L/Q 四列），2026-09-08 真机 Schema 返回 |
| **服务端 OpenAPI（V7 co-op，本项目调用面）** | ⚠️ **PARTIALLY_SUPPORTED** | 官方能力清单列有第 20 项「**上传附件到文件**」；官方文档给出 `POST /v7/documents/{file_id}/attachments/upload`（KSO-1，`kso.documents.readwrite`，body `{file:"string"}`，返回 `{size, upload_id}`）。**但「dbsheet 记录字段专用附件上传端点」在公开 V7 文档中未见独立条目** |
| **AirScript（文档内脚本运行时）** | ✅ **支持** | 官方 `airsheet.wps.cn` 确有 `Application.DBCellValue([{fileData:<base64>, fileName}])` 写图片 + `Record.GetAttachmentURL({UploadId, Source:"upload_ks3"})` 取 URL |

> ### 🔖 **WPS 图片能力最终裁定**
> ```
> PARTIALLY_SUPPORTED
> ```
> **理由**：平台与脚本层确证支持；**本项目所用的服务端 V7 调用面**上，记录字段附件写入的**确切端点未在公开文档中确证** ⇒ 属 `NEEDS_EXTERNAL_CONFIRMATION` 的子集。**不得据此设计为「已完成能力」。**

### 5.2 提问 3：上传后如何获得稳定引用 —— **关键机制发现（本轮新增事实）**

官方 `developer.kdocs.cn`（DBT v1）文档明确写出**附件字段的值格式**：

```text
图片与附件：参数是数组，元素格式为结构体，每个结构体必须包含 uploadId、fileName，
           可选 source / type / size；source 必须为 "upload_ks3" 或 "cloud"，
           否则该元素被跳过。
```

⇒ **WPS 附件写入是「二段式」，而不是「一段式」**：

```text
 ① 上传文件 → 得到 uploadId                      （能力清单第 20 项：上传附件到文件）
                       ↓
 ② 写记录字段 = [ { uploadId, fileName, source:"upload_ks3"|"cloud", type?, size? } ]
```

**这项事实纠正了 ARCH-01 的隐含假设**——图片不是「把 URL 字符串写进字段」，而是「**上传二进制 → 拿 opaque `uploadId` → 字段里写引用结构体**」。
**直接后果**：**`uploadId` 不是 URL，PG 无法直接渲染** ⇒ 任何「WPS 附件字段作为 HSE 图片源」的方案，**都必须经过一次「换 URL」调用**（REST 等价物或 AirScript `GetAttachmentURL`）。

### 5.3 提问 4：手机上传图片是否必须经过 Backend —— ✅ **必须**

三条独立理由（任一条成立即「必须」）：
1. **凭证不可下发**：调用 WPS 需 `WPS_APP_ID`/`WPS_APP_SECRET`；下发到浏览器 = 交出整表读写权（ARCH-01 §4.7 已判为**安全红线**）。
2. **签名在服务端**：KSO-1 用 `app_secret` 做 HMAC（`wpsClient.js:112-115`），前端无法安全持有。
3. **两段式本身需要编排**：上传 → 拿 `uploadId` → 写字段，需要一个可信编排方，且**必须先有身份上下文**（否则无法归属，见 §7）。

### 5.4 提问 5：WPS 图片是否可以作为**长期业务附件** —— ⚠️ **不建议**

| 风险 | 说明 |
|---|---|
| **不可直渲染** | Attachment 值无可用 URL（02-C 真机：返回 `{fileName, uploadId, source:"upload_ks3"}`，**无 url**）⇒ 每次渲染都要换 URL |
| **平台强绑定** | 图片生命周期挂在 WPS 文档上；文档迁移/权限变更/租户变更都可能改变可访问性 |
| **删除耦合** | 记录删除后附件归属不明（**NEEDS_EXTERNAL_CONFIRMATION**） |
| **与现有 2166 处引用冲突** | PG 中 `image_content` 相对路径 1698 + `rectified_photo` 相对路径 468 全部指向本机 `/uploads/**` |

### 5.5 提问 6~9：限制 / 权限 / 删除

| 提问 | 裁定 | 依据 |
|---|---|---|
| 6 大小 / 格式 / 数量限制 | **NEEDS_EXTERNAL_CONFIRMATION** | 公开文档未给出记录附件的明确上限；AirScript 侧已知「HTTP 响应体上限 2M」**不是**附件上限 |
| 7 访问权限 / 登录权限问题 | ⚠️ **存在**：附件 URL 需经 `GetAttachmentURL` 换取，属**受控访问**，非公网静态直链 | 官方 AirScript 文档 |
| 8 图片删除 / 修改 | ⚠️ **PARTIALLY**：字段可被 `update` 覆盖（写空数组即清空）；**单张附件的定向删除未确证** | `wpsClient.js:265-275` + 文档 |
| 9 记录删除后附件如何处理 | **NEEDS_EXTERNAL_CONFIRMATION** | 未找到官方明确说明 |

### 5.6 提问 B6 延伸：`/uploads/**` 能否继续作为 HSE 最终图片存储

| 场景 | 裁定 |
|---|---|
| **单机部署（方案 A 现状）** | ✅ 可接受 |
| **引入云端缓冲（方案 C′）** | ❌ **不可接受** —— 云端上传的文件不落在本地磁盘；且关机时本机 404 |
| **最小替代路径** | 迁移到**云端对象存储**（COS/OSS/S3），PG 存对象 URL。**这是基础设施决策，不是 WPS 能力问题** |

> **重要利好**：把图片迁到云对象存储，**恰好完全绕开 §5.1 的 WPS 附件能力未确证问题**。⇒ **图片链路不构成 WPS-first 的硬阻断。**

---

## 6. `client_token` 幂等方案（用户 §五）

### 6.1 提问：WPS 是否支持「按字段值查询 / 过滤」

| 调用面 | 支持？ | 证据 |
|---|---|---|
| **`records/list_by_page`（本项目在用）** | ❌ **不支持** | 官方请求参数仅 `page_num`/`page_size`/`prefer_id`/`show_record_extra_info`；本项目实现一致（`wpsClient.js:211-226`）。**无 filter / view_id / 条件参数** |
| **`records`（列举记录，官方新口径）** | ❌ **未见于文档** | 官方 quick-start curl body 仅 `prefer_id`/`show_fields_info`/`text_value`/`page_size`/`fields` |
| **官方能力清单中的「18. 查询记录 / 19. 查询多条记录」** | ⚠️ **很可能支持（专用端点）**，但**参数未见于公开文档** | 官方能力清单（20 项）把「列举记录 / 按页列举记录 / **查询记录 / 查询多条记录**」并列为**四个不同能力** ⇒ 存在专用条件查询端点的可能性高 |
| **AirScript `GetRecords`** | ✅ **支持**（有 `Filter` Object 与 `ViewId`） | 官方 AirScript 文档确证 —— **但不是本项目的服务端调用面** |

> ### 🔖 **裁定**
> ```
> 按字段值条件查询：NOT_SUPPORTED（本项目调用面）
>                  / NEEDS_EXTERNAL_CONFIRMATION（平台是否存在专用「查询记录」端点）
> ```

### 6.2 若「不支持」，最小实现路径是什么

**三层递进，按代价从低到高：**

```text
【路径①】O(n) 提交前查重（零新增对象，立即可用）
 手机生成 client_token(UUID) → 写入 WPS 的 client_token 镜像列
 Backend 提交前：listAllRecords()（约 2063 条 ÷ 200/页 ≈ 11 次请求）
              → 本地比对 client_token
 成本：每次提交多 ~11 次 HTTP；限频 10/s ⇒ 单次提交约 1.1~2s 额外延迟
 并发缺陷：⚠️ 两个并发同 token 请求可能同时「未命中」⇒ 非原子，弱幂等

【路径②】服务端内存/文件幂等登记（零新增 DB 对象）
 Backend 侧 LRU/落盘 Map<client_token, wps_record_id>（带 TTL）
 成本：零 schema 变更；⚠️ Backend 重启丢失 → 降级为路径①兜底

【路径③】PG 侧幂等登记（最强，但需新表/新列）
 grid_record_sync_map 增加 client_token 列 或 新建预登记表
 ⛔ 用户 §五 明确禁止本任务新增字段/表 ⇒ **仅设计，不实施**
```

### 6.3 对现有冻结架构的影响

| 路径 | 是否触碰冻结 | 影响 |
|---|---|---|
| ① | ❌ 不触碰 | 仅新增 WPS 板上一列（**注意：WPS 板加列属 WPS 侧变更，需人工决策**）+ 应用层逻辑 |
| ② | ❌ 不触碰 | 纯应用层 |
| ③ | ⚠️ **触碰**（改表结构） | 需单独解冻申请 ⇒ **本 Sprint 禁止** |

### 6.4 手机端必备的三条硬约束（用户 §五）

1. `client_token` 必须**提交前生成**，并**持久化**（localStorage/IndexedDB）。
2. **重试必须携带同一个 token**；**严禁**每次重试重新生成。
3. **不要求手机指定 WPS Record ID**（见 §9）。
4. Backend 必须能判断 token 是否已处理（路径①/②/③ 任选）。
5. **等价可靠幂等记录必须存在**——若 WPS 无法承载，则必须落到服务端（②或③）。

---

## 7. 身份与 `grid_id` 归属方案（用户 §六，**最高优先级**）

### 7.1 现状（必须先说清）

| 事实 | 代码位置 |
|---|---|
| Pull 引擎**永不写** `grid_id`/`inspector_employee_id`，新记录恒 NULL | `wpsGridPullEngine.js:31, 446-447, 223-230` |
| `PROTECTED_COLUMNS = ['grid_id','inspector_employee_id']` | `wpsFieldMap.js:127` |
| 两者**不在** `SYNC_PROJECTION` | `wpsFieldMap.js:107-115` |
| WPS create 路径**已经**把服务端 `employeeId` 写入 WPS 的「巡查人员ID」列 | `gridInspectionRepository.js:202-205`（02-C 真机 PASS：`6709` 落库） |
| 但该列的 PG 映射是 `'-'`（**无 PG 列**） | `wpsFieldMap.js:32` |
| WPS DTO 恒 `gridId: null` | `gridInspectionRepository.js:86` |
| `deriveGridIdForEmployee(employeeId)` **已存在**：employeeId → `grid_areas.personnel_id` → grid_id；**多网格返回 `status:'multiple'` 且 gridId=null（fail-closed）** | `gridScope.js:131-152` |
| `resolveGridScope` / `buildScopeSqlCondition` 是 **SQL 生成器**（输出 `grid_id IN (SELECT …)`） | `gridScope.js:43, 109-115` |

### 7.2 逐项回答（用户 §六 的 5 个问题）

**Q1. WPS 中的「巡查人员ID」能否被定义为「服务器产生的身份快照」而不是「WPS 身份来源」？**

> ✅ **能，而且现在已经是这样了。** `gridInspectionRepository.create()` 用 `resolveCurrentEmployee()` 的 `ctx.employeeId` 写入该列（`gridInspectionRepository.js:204`），**手机提交的身份字段无法覆盖**（update 的 `EDITABLE_CAMEL_TO_PG` 不含 `inspectorEmployeeId`，`gridInspectionRepository.js:244-252`）。
> **语义定性**：该列是「**巡查发生时的身份快照**」，**不是**身份权威源。权威源仍是 PG 的 `users`/`employee`。
> ⚠️ **但有一处缺陷必须登记**：`resolveCurrentEmployee` 走 `currentEmployeeContext`（**姓名兜底**），而 PG 路径走 `authenticatedEmployeeResolver`（严格链）。**两者不统一 = 同一用户两条路径可能得到不同 employeeId** ⇒ 这是 P3 的前置整改项（对应 R-ARCH-08）。

**Q2. Pull 时如何保证手机不能伪造人员 ID？**

> 现状：**不存在伪造面，因为 Pull 根本不读该列**（不在 `SYNC_PROJECTION`）。
> 若采纳归属方案（§7.4），必须做的是「**校验而非信任**」：
> ```text
> 读到 WPS「巡查人员ID」= E
>   ├─ E 必须存在于 employee / grid_areas.personnel_id  （存在性校验）
>   ├─ E 必须能派生出唯一 grid_id（deriveGridIdForEmployee）
>   │     status='ok'       → 回填 grid_id
>   │     status='multiple' → 拒绝归属（不猜），标记 conflict
>   │     status='no_grid'  → 拒绝归属，标记冲突待人工
>   └─ 任一校验失败 → 不回填，记入异常清单（绝不静默降级为姓名匹配）
> ```
> **关键**：手机侧本来就**没有写入该列的能力**（create 由服务端写、update 不触及该列）⇒ 伪造面被限制为「**直接编辑 WPS 板的人工操作**」，而校验可拦住它。

**Q3. 如何保证一个 WPS 记录不会被错误绑定到其他网格？**

> ✅ **机制已存在**：`deriveGridIdForEmployee()` 在 `grid_areas` 命中 **>1 条** 时返回 `status:'multiple'` 且 **gridId=null**（`gridScope.js:149`）。即**歧义即拒绝**，符合 fail-closed。
> 另需一条**不变式**：归属只允许在 `inspector_employee_id IS NULL` 时**首次写入**，之后**永不覆盖**（防止二次归属篡改）。

**Q4. 是否能在 PG 侧根据可信同步元数据重新完成 `grid_id` 归属？**

> ✅ **能，但「可信同步元数据」不够用。**
> - 现有可信元数据 = `grid_record_sync_map(pg_record_id, wps_record_id, wps_file_id, wps_sheet_id, timestamps, sync_hash)` —— **不含任何身份/网格信息**。
> - ⇒ **仅凭 `sync_map` 无法归属**。
> - **必须**额外获得「`wps_record_id` → 服务端产生的 employeeId」这一映射。可信来源只有两个：① WPS 的「巡查人员ID」列（服务端写、手机不可写）② 新增 PG 侧列（**禁止**）。

**Q5. 若必须新增 PG 侧同步绑定机制：需要什么数据？能否复用 `grid_record_sync_map`？**

> **需要的数据**：`wps_record_id → inspector_employee_id（快照）`，且必须携带「来源可信」标记。
> **复用 `grid_record_sync_map`？** ❌ **不成立**。理由：该表**没有**任何身份列；**加列 = 改表结构**，用户 §二-3 禁止。

### 7.3 三条可选解法（承接 ARCH-01 §9.3，本轮新增「解法丁」）

| 解法 | 做法 | 是否需解冻 | 是否需改表 | 裁定 |
|---|---|---|---|---|
| **甲** | 把「巡查人员ID」纳入 `SYNC_PROJECTION` 并解除 `PROTECTED` | ⛔ **需解冻**（破坏身份权威性） | 需加 PG 列 | ❌ **不推荐**（风险最高） |
| **乙** | 新增 PG 侧「同步后绑定」组件，按 `wps_record_id` 回填 | ✅ **不需解冻** | ✅ **不需改表** | ✅ **推荐（见 §7.4）** |
| **丙** | 维持 PG-first 写路径，WPS 仅作**只读镜像** | ✅ 不需 | ✅ 不需 | ✅ 安全兜底（= 方案 A，**不解决关机**） |
| **丁** | **云端 Backend 直写云端 PG**（拓扑 T2），身份在云端产生 | ✅ 不需 | 需 PG 复制/切换策略 | ⚠️ 超出本架构线（重新打开「谁是权威库」） |

### 7.4 ⭐ 解法乙的精确定义（本轮新增的最小可行路径）

```text
【新增组件】wpsGridAttribution（与 wpsGridPullEngine **平级**，不改动后者）
  触发：Pull 完成之后（同一 Scheduler 周期内的第二步）
  步骤：
   1. 只读 WPS：listAllRecords() → 建 { wps_record_id → 巡查人员ID } 映射
   2. 只读 PG：SELECT pg_record_id, wps_record_id FROM grid_record_sync_map
   3. JOIN → 候选 (pg_record_id, employeeId)
   4. 逐条校验：employeeId 存在？deriveGridIdForEmployee 唯一？
        status='ok'  → UPDATE grid_inspection_records
                         SET inspector_employee_id=$e, grid_id=$g
                       WHERE id=$pg AND inspector_employee_id IS NULL   ← 只补 NULL，永不覆盖
        other        → 不回填，记入异常清单（人工处理）
   5. 输出统计（filled / rejected / ambiguous），写日志

【为什么它不违反 05-H-0 冻结】
  · 不修改 SYNC_PROJECTION        ✅
  · 不修改 PROTECTED_COLUMNS      ✅
  · 不修改 wpsGridPullEngine      ✅（新文件，平级）
  · 不改表结构 / 不新增列          ✅（复用现有 inspector_employee_id / grid_id 列）
  · 不恢复 PG→WPS                ✅（只写 PG，不写 WPS）
  · 唯一需要人工确认的一点：它「代表身份权威写入了 PROTECTED 列」——
    ⇒ 该写入的**合法性来源**是一个独立的身份权威组件，而不是「WPS 同步」。
      这正是「WPS ≠ 身份来源」原则的**正确体现**（身份来自 PG 的校验，WPS 只是承运）
```

> ⚠️ **待人工确认的边界问题**：用户 §二-7「不得修改 WPS-PG-SYNC」——新增一个**平级模块**是否算「修改」？本报告按字面理解为「不修改既有模块」= 合规；但**这属于架构口径判断，已在 §12 提升为必须人工决策事项**。

---

## 8. `WPS_ROW_SCOPE_DEFERRED` 风险审计（用户 §七）

### 8.1 当前代码实际权限链（精确到行）

| 端点 | 功能权限 | WPS 分支 | 行级范围 | 位置 |
|---|---|---|---|---|
| `GET /grid-records` | `hse:site:grid:view` | `gridWps.list(...)` | ❌ **无** | `site-mgmt.js:1733 / 1744-1753` |
| `PUT /grid-records/:id` | `hse:site:grid:update` | `gridWps.update(id, body)` | ❌ **无**（提前 `return`，`resolveGridScope` 被**完全跳过**） | `site-mgmt.js:1877 / 1879-1884` |
| `DELETE /grid-records` | `hse:site:grid:delete` | `gridWps.remove(ids)` | ❌ **无** | `site-mgmt.js:2036 / 2038-2046` |
| `DELETE /grid-records/all` | `grid:purge` + `requireRole('system_admin','admin')` + `confirmText` | `gridWps.clearAll()` | N/A（超管专属） | `site-mgmt.js:2060+ / 2100-2115` |

代码**自认**了该缺口（原文注释，`site-mgmt.js:1787`）：

```js
// 客户端不得干预。WPS 数据源分支（上方已 return）不在本范围控制内（WPS_ROW_SCOPE_DEFERRED）。
```

### 8.2 风险成立条件

```text
① WPS_GRID_DATA_SOURCE=true 且 WPS 凭证完整（mode='wps'，gridDataSource.js:28-40）
② 调用者持 hse:site:grid:{view,update,delete}
③ 调用者已知目标 WPS Record ID（GET 列表即可全量获得 ⇒ 门槛极低）
        ↓
结果：grid_inspector 可 【读全表 / 改任意记录 / 删任意记录】
```

**当前状态：开关为 `false` ⇒ 风险休眠。一经开启即立即成立（无需任何额外条件）。**

### 8.3 逐项回答（用户 §七 的 6 个问题）

| # | 问题 | 回答 |
|---|---|---|
| 1 | 当前代码实际权限链 | 见 §8.1 —— **仅功能权限（角色/权限码），零行级范围** |
| 2 | 风险成立条件 | 见 §8.2 —— **开关一开即成立** |
| 3 | 最小修复方案 | **在 WPS 分支内、调用 `gridWps.*` 之前，插入归属过滤层**：①先取当前用户 `employeeId`（`authenticatedEmployeeResolver`）②WPS 列表按「巡查人员ID == 本人 employeeId」过滤 / 更新前校验目标记录归属 ③不匹配 → `403 + code:'SCOPE_DENIED'`（与 PG 分支**同错误码**，保持前端一致性） |
| 4 | 能否复用现有 `gridScope` | ⚠️ **部分**：可复用 `resolveGridScope` 的**判定结果**（scopeType / employeeId）与 `deriveGridIdForEmployee`；**不可复用** `buildScopeSqlCondition`（它输出 SQL 片段，WPS 不是 SQL） |
| 5 | 是否需要新 API | ❌ **不需要**。仅在既有 WPS 分支内加过滤层 |
| 6 | 是否需要修改 WPS 数据结构 | ❌ **不需要**。「巡查人员ID」列**已存在**（Field ID `X`，02-C 真机）；「所属网格」列虽为 reserved 未建列，但归属可由 PG 侧派生（§7.4），无需 WPS 新列 |

### 8.4 ⚠️ 依赖识别（本轮新增结论）

> **§8 与 §7 是同一个依赖，不能分开做。**
> 因为 WPS DTO **恒 `gridId: null`**（`gridInspectionRepository.js:86`），**行级过滤没有可用的归属字段**。
> ⇒ **执行顺序强制**：**先 §7（归属组件）→ 再 §8（范围过滤）**。任何「先修权限、后做归属」的顺序都做不出正确行为。

---

## 9. 五种架构比较（用户 §八）

### 9.1 统一评分表

| 维度 | **A** 手机→PG | **B** 手机→WPS→PG | **C** 手机→**本机**Backend→WPS→PG | **C′** 手机→**云端**Backend→WPS→本地Pull→本地PG | **D** 手机→云端Backend→WPS→**云Pull→云PG** |
|---|---|---|---|---|---|
| 1 数据可靠性 | ★★★★☆ | ★★★★☆ | ★★★★☆ | ★★★★☆ | ★★★☆☆（云 PG 需复制/备份策略） |
| 2 **电脑关机可用性** | ★☆☆☆☆ | ★★★★★ | ★☆☆☆☆ | **★★★★★** | ★★★★★ |
| 3 手机弱网适应性 | ★★☆☆☆ | ★★★☆☆ | ★★☆☆☆ | ★★★☆☆（可加幂等＋重试队列） | ★★★☆☆ |
| 4 **身份安全** | ★★★★★ | **☆☆☆☆☆（红线）** | ★★★☆☆ | ★★★★☆（+归属组件） | ★★★★☆ |
| 5 图片处理 | ★★★☆☆ | ★☆☆☆☆ | ★★☆☆☆ | ★★★☆☆（需云存储） | ★★★☆☆ |
| 6 幂等 | ★★★☆☆ | ★☆☆☆☆ | ★★★☆☆ | ★★★★☆（client_token） | ★★★★☆ |
| 7 开发复杂度 | ★★★★★（零新增） | ★★☆☆☆ | ★★★★☆ | ★★★☆☆ | ★★☆☆☆ |
| 8 运维复杂度 | ★★★★☆ | ★★★☆☆ | ★★★☆☆ | ★★★☆☆ | ★★☆☆☆ |
| 9 与 05-H-0 兼容 | ★★★★★ | ★☆☆☆☆ | ★★☆☆☆ | ★★★★☆ | ★★☆☆☆ |
| 10 改动规模 | **0** | 极大 | 中 | 中 | 大 |

### 9.2 方案 B 的否决理由（红线复述）

`WPS_APP_SECRET` 必须下发到浏览器 ⇒ **任何人可读/改/删全部 2063 条**；且无法按用户行级隔离；身份只能靠手机自报（可伪造）。**架构红线，不可接受。**

### 9.3 ⭐ 五个条件同时成立的唯一方案

用户 §八 要求：「**最小改造 + 安全 + 手机电脑关机仍可提交 + PG 仍然保留正式权威 + WPS-PG-SYNC 冻结不被破坏**」五条同时成立。

| 方案 | 最小改造 | 安全 | 关机可提交 | PG 保权威 | 冻结不破 | **五条同时** |
|---|---|---|---|---|---|---|
| A | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| B | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| C（本机） | ✅ | ⚠️ | ❌ | ✅ | ⚠️ | ❌ |
| **C′** | ⚠️中 | ✅（补 P2/P3） | ✅ | ✅ | ✅ | ✅ **唯一** |
| D | ❌ | ✅ | ✅ | ❌ **（权威库迁移）** | ❌ | ❌ |

> ### **结论：五个条件同时成立 ⇒ 只有方案 C′。**
> **注意 C 与 C′ 的差别不在代码，而在 Backend 的部署位置**——这也正是本报告最核心的业务洞察：
> **「手机电脑关机仍可提交」这个目标，本质是一个部署问题，不是 WPS 能力问题。**

---

## 10. 推荐架构

### 10.1 目标态（方案 C′）

```text
 ┌──────────┐
 │  手机     │  ← 移动端现有 5 路由 + 新增幂等 token
 └────┬─────┘
      │ HTTPS（JWT）
      ▼
 ┌──────────────────────────────────┐     ┌──────────────────┐
 │ 云端常驻 HSE Backend（C′ 核心）   │────▶│ WPS 多维表格（云）│
 │  · JWT 认证（不变）               │     │  巡查记录快照     │
 │  · authenticatedEmployeeResolver  │     │  + client_token  │
 │  · 行级范围（新增，WPS 模式）      │     └────────┬─────────┘
 │  · 图片 → 云对象存储（新增）       │              │ Pull（只读）
 └──────────────────────────────────┘              ▼
                                        ┌────────────────────────────┐
                                        │ 本地 HSE Backend（可关机）  │
                                        │  · Scheduler Pull（15min） │
                                        │  · ★ 归属组件（新增，§7.4） │
                                        │  · PG 5432（正式权威）      │
                                        └────────────────────────────┘
                                                     ▼
                                                HSE 正式业务
```

### 10.2 推荐理由（按权重）

1. **唯一满足五条件交集**（§9.3）。
2. **代码成本最低的可行方向**：`gridClient.createRecords` / `gridInspectionRepository.create` **已真机 PASS**，「Backend → WPS」这一段**无需新写**。
3. **不触碰 05-H-0**：Pull 方向、幂等键、排除名单、`pgDeleted=0`、`REVERSE_WRITE_ENABLED=false` **全部保持**。
4. **PG 权威性不变**：身份与网格归属由 **PG 侧校验组件**产生（§7.4），而非由 WPS 信任。
5. **方案 A 作为默认保留态**：在 P1–P4 全部确认前，**不应切换任何开关**。

### 10.3 四项硬前置（缺一不可）

| # | 前置 | 性质 | 关联 |
|---|---|---|---|
| **P1** | HSE Backend 迁至常开主机 / 云端 | 基础设施决策 | 决定「关机可提交」是否成立 |
| **P2** | 补 WPS 模式行级范围（复用 `resolveGridScope` 判定） | **安全阻断项** | §8 |
| **P3** | 新增**独立归属组件**（§7.4） | 架构新增（需确认合规口径） | §7 |
| **P4** | 图片迁至云对象存储 | 基础设施决策 | §5.6 |

---

## 11. 最小实施拆分（仅设计，不实施）

> **铁律：P1–P4 未确认前，不得启动任何实施。**

### 阶段 0 · 决策与外部确认（纯咨询，零代码）
| # | 事项 | 产出 |
|---|---|---|
| 0.1 | 架构决策：维持 A / 采纳 C′ | 一页决策记录 |
| 0.2 | 外部能力确认：①V7 记录附件上传端点 ②「查询记录」条件检索端点 | WPS 官方确认（API 在线调试器/工单） |
| 0.3 | 归属组件合规口径确认：新增平级模块是否算「修改 WPS-PG-SYNC」 | 口径批复 |
| 0.4 | 基础设施决策：Backend 迁出本机？图片迁云对象存储？ | 部署方案 |

### 阶段 1 · 安全阻断项（C′ 前置必做）
| # | 事项 | 关联风险 |
|---|---|---|
| 1.1 | WPS 模式行级范围层（filter by employeeId；越权 `403 SCOPE_DENIED`） | R-ARCH-02 |
| 1.2 | WPS 模式身份入口统一到 `authenticatedEmployeeResolver`（消除姓名兜底） | R-ARCH-08 |

### 阶段 2 · 归属与幂等
| # | 事项 | 备注 |
|---|---|---|
| 2.1 | 归属组件（§7.4），只补 NULL、永不覆盖、歧义拒绝 | 依赖 0.3 |
| 2.2 | `client_token`：手机生成/持久化/重试复用 + Backend 查重（路径①→②） | 依赖 0.2 |
| 2.3 | 图片迁云对象存储（绕开 WPS 附件未确证问题） | 依赖 0.4 |

### 阶段 3 · 关机场景演练
| # | 事项 |
|---|---|
| 3.1 | ✅ **正例演练（本轮补做）**：**云端 Backend 存活 + 本地全关** ⇒ 手机提交 → WPS 落库（阶段 A 成立）→ 本地开机 → 自动 Pull → 归属 → 网格长可见 |
| 3.2 | 离线 IndexedDB / Service Worker（**GRID-05 范围，独立任务**） |

### 阶段 4 · 明确不在本架构线内
GRID-04（GPS/地图）、GRID-05（图片访问鉴权）、`violator_employee_id`、WPS 整改照片回写。

### 11.1 ⭐ 必须补做的正例演练（本轮识别的方法论缺口）

> **ARCH-01 的六场景表缺一个「P1 已完成」的正例场景。** 现补：

| 场景 | 云端 Backend | 本地电脑 | 手机提交 | 阶段A | 阶段B/C/D | 数据是否丢 |
|---|---|---|---|---|---|---|
| **2′（新增）** | ✅ 存活 | ❌ **完全关机** | ✅ 成功 | ✅ 落 WPS | 开机后 ≤15 min 自动补齐 | ❌ **不丢** |

**前提**：P1（Backend 迁出）+ P3（归属组件）落地。**这是 C′ 的验收基准场景**，也是「云端缓冲」业务目的**唯一被证明成立**的场景。

---

## 12. 必须人工决策事项（用户 §十·12）

| # | 决策项 | 选项 | 影响 |
|---|---|---|---|
| **D1** | 是否采纳方案 C′ | 采纳 / 维持 A / 其他 | 全局 |
| **D2** | Backend 是否迁出本机 | 迁云 / 迁常开主机 / 不迁 | 「关机可提交」成立与否 |
| **D3** | 归属组件合规口径：新增平级模块是否算「修改 WPS-PG-SYNC」 | 算 / 不算 | P3 可否开工 |
| **D4** | 图片最终存储 | 云对象存储 / WPS 附件（待确证）/ 维持本机 | §5.6 |
| **D5** | 是否允许 WPS 板加列（`client_token`） | 允许 / 改用服务端登记 | §6.2 |
| **D6** | 是否确认 §7 解法乙（或回到甲/丙） | 乙 / 甲 / 丙 | §7.3 |
| **D7** | `WPS_GRID_DATA_SOURCE` 总开关能否被拆分（手机走 WPS、PC 留 PG） | 拆分 / 不拆分 | §9.4（ARCH-01 R-ARCH-09） |

---

## 13. 外部依赖事项（用户 §十·13）

| # | 外部依赖 | 当前裁定 | 对本架构的影响 | 规避路径 |
|---|---|---|---|---|
| **E1** | V7 co-op 记录字段**附件上传端点** | **NEEDS_EXTERNAL_CONFIRMATION**（机制已知，端点待证） | 影响图片落 WPS 方案 | ✅ **可完全绕开** → 图片走云对象存储 |
| **E2** | **按字段值条件查询**端点 | **NEEDS_EXTERNAL_CONFIRMATION**（能力清单暗示存在） | 影响 `client_token` 查重性能 | ✅ **可绕开** → O(n) 扫描 / 服务端登记 |
| **E3** | **创建时指定 Record ID** | ✅ **本轮裁定：非硬前置**（见 §9 下行） | **无** | —— |
| **E4** | 附件大小 / 格式 / 数量上限 | NEEDS_EXTERNAL_CONFIRMATION | 低 | 走云存储即无影响 |
| **E5** | 删除记录后附件回收策略 | NEEDS_EXTERNAL_CONFIRMATION | 低 | —— |

### 13.1 ⭐ 对 E3 的重新裁定（用户 §九 明确要求）

> **「创建时指定 WPS Record ID」是否真的属于硬前置条件？**

### **结论：不属于硬前置条件。**

**三条论证：**

1. **Pull 侧不需要它。** 幂等键 `(wps_record_id, wps_file_id)` 只要 **WPS 生成即可**（`wpsGridPullEngine.js:249, 264-267`），Pull 从不要求客户端预知 record_id。
2. **重复提交的根因在「提交侧」，不在「ID 生成侧」。** 重复 = 手机重试产生**第二条 WPS 记录**；用 `client_token` 做**提交前查重**即可拦截。**与 record_id 能否指定无关。**
3. **现有实现已在 `prefer_id:false` 下真机 PASS**（02-C），说明 WPS 自生成 ID 的工作流是**已验证可用**的。

**⇒ 是否可以允许 WPS 自行生成 record_id？**
> ### ✅ **可以。** 前提是 §6 的 `client_token` 幂等落地。
> **同时须修正 ARCH-01 的表述**：ARCH-01 把「创建时指定 Record ID」与「二进制附件上传」「按字段值过滤」并列为三项重要外部能力；本轮裁定应**下调其权重**——**真正的硬前置是「按字段值条件查询」或「服务端幂等登记」二者之一**（用于 token 查重），而 Record ID 指定**可以不做**。

---

## 14. 不可解冻事项（用户 §十·14）

以下冻结项在本架构线内**任何阶段都不得解冻**：

| # | 冻结项 | 依据 |
|---|---|---|
| 1 | `REVERSE_WRITE_ENABLED`（PG→WPS 反向写入） | `wpsGridPullEngine.js:40` 代码级硬锁 |
| 2 | Pull 唯一方向：**WPS → PG 单向** | 05-FREEZE §2 |
| 3 | 幂等键 = `(wps_record_id, wps_file_id)`；禁用自然键 | 05-FREEZE §1 |
| 4 | `pgDeleted` 恒 = 0（WPS 删除 ⇏ PG 删除） | `wpsGridPullEngine.js:232-238, 494-508` |
| 5 | 排除名单 BT / EA（按 `wps_record_id`，只可追加） | `wpsGridPullEngine.js:54-72` |
| 6 | **`WPS ≠ 正式身份源`** | 05-FREEZE §2 |
| 7 | **`WPS ≠ grid_id 来源`** | 05-FREEZE §2 |
| 8 | `PROTECTED_COLUMNS = ['grid_id','inspector_employee_id']`（Pull 永不写） | `wpsFieldMap.js:127` |
| 9 | 冻结 hash 口径 = 前 **18 列**，顺序不可变 | `wpsFieldMap.js:107-120` |
| 10 | WPS-PG-SYNC 05-H-0 冻结态本身 | 用户 §二·7 |

> **本架构设计对上述 10 项零触碰。** 其中 #6/#7 通过「**归属组件由 PG 侧校验产生、WPS 仅承运**」的方式**在不违背原则的前提下**满足业务需求——**这是本报告的关键设计贡献**。

---

## 15. 不允许修改事项（用户 §十·15）

| # | 不允许修改 | 本报告遵守 |
|---|---|---|
| 1 | `server/.env` | ✅ |
| 2 | `PROTECTED_COLUMNS` / `SYNC_PROJECTION` | ✅ |
| 3 | `gridScope.js` / `authenticatedEmployeeResolver.js` | ✅ |
| 4 | 数据库表结构（DDL） | ✅ |
| 5 | WPS 数据 | ✅ |
| 6 | users / JWT / auth | ✅ |
| 7 | 生产进程 / 5876 | ✅ |
| 8 | 既有移动端功能 | ✅ |
| 9 | npm 依赖 | ✅ |

---

## 16. 与 03-B 的兼容性（用户 §十·16）

> **结论：完全兼容，无需回退，无需修改。**

| 03-B 改动 | C′ 落地后的处置 | 说明 |
|---|---|---|
| `rectify.vue` + `photo-group.ts` + `grid-access.ts` | ✅ **保留** | 页面/交互/校验 **100% 可复用**，仅需把**提交目标**从 `PUT /grid-records/:id` 改为经云端 Backend 转写 |
| `mobile.ts` 路由 / `mobile.vue` 高亮 / `detail.vue` 入口 / `ledger.vue` 徽标入口 | ✅ **保留** | 纯前端路由与 DOM，无数据源耦合 |
| `GRID_RECORD_EDITABLE` 追加 `'rectified_photo'` | ✅ **保留** | 仅影响 PG 分支；若切 WPS 模式，需在 `EDITABLE_CAMEL_TO_PG`（`gridInspectionRepository.js:244-252`）中**补 `rectifiedPhoto` 映射**（注意：该表**已含** `rectifier`，**不含** `rectifiedPhoto` ⇒ **这是一个已识别的 WPS 模式缺口**） |
| `POST /grid-records` `personnel_name` 服务端派生 | ✅ **保留，且应延续到 WPS 路径** | WPS 分支走 `gridInspectionRepository` + `currentEmployeeContext`（**姓名兜底**），**未继承此保证** ⇒ 属 P3/阶段 1.2 整改项 |
| `POST`/`PUT`/`DELETE` `/grid-records` 定位 | ✅ **保留为「正式 PG API」**；C′ 落地后退化为「PC 维护入口 + 内部同步/后台补偿接口」 | 同 ARCH-01 §12.2 |

### 16.1 ⭐ 本轮新识别的 03-B 关联缺口

> `gridInspectionRepository.EDITABLE_CAMEL_TO_PG`（`gridInspectionRepository.js:244-252`）**含 `rectifier`、但不含 `rectifiedPhoto`**。
> ⇒ 若未来切 WPS 模式，**PC 台账与移动端都无法通过 PUT 更新整改照片**（与 03-B 在 PG 侧补 `rectified_photo` 白名单的改动**不对称**）。
> **这是一个 WPS 模式下的功能缺口，需在阶段 1 一并处理。**（本报告只登记，不修改。）

---

## 17. 与 WPS-PG-SYNC-05-H-0 的兼容性（用户 §十·17）

| 冻结要素 | C′ 是否触碰 | 说明 |
|---|---|---|
| Pull 单向性 | ✅ 不触碰 | 归属组件**只写 PG、不写 WPS** |
| 幂等键 | ✅ 不触碰 | 归属组件**不参与**幂等判定 |
| `pgDeleted` 恒 0 | ✅ 不触碰 | 归属组件**无任何 DELETE** |
| 排除名单 BT/EA | ✅ 不触碰 | 归属组件按 `sync_map` 取候选，自然继承排除结果 |
| `sync_hash` 口径 | ✅ 不触碰 | 归属组件**不修改 sync_map**（只读它做 JOIN） |
| `PROTECTED_COLUMNS` | ⚠️ **语义张力（须人工定口径）** | 归属组件会**写** `inspector_employee_id`/`grid_id`——但**不是 Pull 引擎在写**，而是**独立身份权威在写**。是否算「突破 PROTECTED」= **D3 决策项** |
| `REVERSE_WRITE_ENABLED=false` | ✅ 不触碰 | —— |
| WPS-PG-SYNC 模块文件 | ✅ 不修改 | 归属组件为**新增平级文件** |
| 生产 `.env` | ✅ 不修改 | 归属组件可由**独立开关**控制（如 `WPS_GRID_ATTRIBUTION=true`，**建议默认关闭**） |

### 17.1 唯一需报告的冲突（用户 §十二 要求「只报告」）

> **冲突 C-01**：`PROTECTED_COLUMNS` 的设计意图是「PG 权威字段永不被 WPS 体系写入」。归属组件**在结果上**会写入这两个列。
> **性质**：这不是「违反」，而是**对「谁有权写」这一问题的边界重新划定**——即把「身份写入权」从「无人可写」改为「**由 PG 侧身份权威组件写**」。
> **本报告只报告，不解决，不实施。** 需 D3 决策。

---

## 18. 风险清单

| ID | 风险 | 等级 | 状态 | 依据 |
|---|---|---|---|---|
| **R2-01** | 关机场景不成立 = **业务目标不成立**（Backend 与 PG 同机） | 🔴 **高（绑定 P1）** | 只报告 | `app.js` Scheduler 进程内；PG 仅本机监听 |
| **R2-02** | 身份 / `grid_id` 归属缺失 ⇒ 网格长看不到自己提交的记录 | 🔴 **高** | **有设计解（§7.4），待 D3/D6** | 2051/2061 inspector NULL |
| **R2-03** | WPS 模式行级范围缺失（`WPS_ROW_SCOPE_DEFERRED`）⇒ 开关一开即水平越权（读/改/删全表） | 🔴 **高** | 只报告 | `site-mgmt.js:1787, 1879-1884, 2038-2046` |
| **R2-04** | `/uploads/**` 为本机磁盘单点 ⇒ 云端化后图片链路断裂（2166 处引用） | 🔴 **高** | 只报告 | 1698 + 468 |
| **R2-05** | 归属组件写 `PROTECTED_COLUMNS` 存在**口径张力** | 🟠 **中（决策项）** | 待 D3 | `wpsFieldMap.js:127` |
| **R2-06** | WPS 无字段条件查询 ⇒ `client_token` 查重需 O(n)（约 11 请求/次提交，非原子） | 🟠 **中** | 有替代（§6.2） | `wpsClient.js:211-226` |
| **R2-07** | WPS V7 **记录附件上传端点未确证** | 🟠 **中（外部依赖）** | NEEDS_EXTERNAL_CONFIRMATION | §5.1 |
| **R2-08** | WPS 单条直查缺失 ⇒ `getRecord` O(n) 全表扫描 | 🟡 低→高（规模化） | NEEDS_EXTERNAL_CONFIRMATION | `wpsClient.js:235-238` |
| **R2-09** | WPS 模式身份入口为**姓名兜底**（`currentEmployeeContext`），与 PG 路径不统一 | 🟠 **中** | 只报告 | `gridInspectionRepository.js:195`；`gridScope` 严格链 |
| **R2-10** | `WPS_GRID_DATA_SOURCE` 为**全有或全无**总开关（不能「手机走 WPS、PC 留 PG」） | 🟠 **中** | 待 D7 | `site-mgmt.js` 六处分支 |
| **R2-11** | WPS 模式 `EDITABLE_CAMEL_TO_PG` **缺 `rectifiedPhoto`** ⇒ PC/移动端无法在 WPS 模式更新整改照片 | 🟡 低（WPS 未启用） | **本轮新识别** | `gridInspectionRepository.js:244-252` |
| **R2-12** | **R-03A-6**：WPS 源记录字段级变更可覆盖手机补传的 `rectified_photo`（**量化：84 条现存暴露面**） | 🟠 中（已量化） | **已登记（不解决）** | `wpsGridPullEngine.js:131-134, 473`；实测 HTTP_URL 84 |
| **R2-13** | WPS 限频 10 次/秒（app_id 级）：高并发提交可能 429 | 🟡 低 | 已缓解（退避重试） | `wpsClient.js:146-149` |
| **R2-14** | `inspection_date` 前端显示 -1 天（既有应用级现象） | 🟡 低（既有） | 已登记 | 03-B 报告 |

### 18.1 是否存在**新增**风险（因本审计引入）

> **不存在。** 本轮：`0` 代码修改、`0` DDL、`0` DML、`0` WPS 调用、`0` 进程操作、`0` 依赖新增。唯一新增产物 = 本报告。**上述 14 项风险全部为既有风险的识别/量化/升级，而非新引入。**

### 18.2 ⭐ 一个必须分级说清的对比（回应用户 §一 的四阶段拆分）

| 风险 | 影响阶段 | 若不解 | 后果的**业务语义** |
|---|---|---|---|
| R2-01 | A | 关机无法提交 | 「云端缓冲」目的**完全落空** |
| R2-02 | C | 归属恒空 | 数据进了 PG 但**网格长看不见**（最易被误判为「功能已上线」） |
| R2-03 | D | 范围缺失 | **数据泄露 + 越权篡改**（安全事件） |
| R2-04 | A/D | 图片不可达 | 有记录无照片（业务证据链断裂） |

---

## 19. 最终结论

### 19.1 对用户核心命题的直接回答

> **问**：「如果最终确定采用 WPS 作为手机三违巡查的云端缓冲层，在不破坏现有 WPS-PG-SYNC-05-H-0 冻结原则的前提下，最小、最安全、可逐步落地的架构到底应该是什么？」

> **答**：**方案 C′ + 独立归属组件**：
> ```text
> 手机 → 云端常驻 HSE Backend（身份/范围/图片编排）
>           → WPS 多维表格（云端缓冲，阶段 A 的唯一落点）
>           → 本地 Backend 定时 Pull（只读，方向不变）
>           → 本地 PG（正式权威，阶段 B）
>           → ★ 归属组件（新增平级模块，阶段 C）
>           → HSE 可见（阶段 D）
> ```
> **四项硬前置**：P1 Backend 迁出本机 / P2 补 WPS 行级范围 / P3 归属组件 / P4 图片云化。
> **顺序强制**：**P1 是第一位的**——在它完成之前，这个架构的业务目标（关机可提交）**在物理上不成立**。

### 19.2 与前序阶段的关系

| 项 | 裁定 |
|---|---|
| GRID-03-B 四项改动 | ✅ **全部保留，无需回退**（§16） |
| WPS-PG-SYNC-05-H-0 | ✅ **零触碰，冻结态维持**（§17） |
| ARCH-01 结论 | ✅ 主体承接；**修正 1 项**（Record ID 非硬前置）、**强化 1 项**（附件二段式 + 无可用 URL）、**新增 1 条可行路径**（§7.4 归属组件） |

### 19.3 最终状态（用户 §十一）

```text
PHASE_HSE_MOBILE_GRID_ARCH_02_COMPLETED_WITH_EXTERNAL_DEPENDENCIES
```

**判定说明（如实交代口径）**：

- **为什么不判 `READY_FOR_DECISION`**：架构的**最小实施路径已明确**（§10/§11），但按用户 §十一 的口径，仍存在 **2 项 WPS 官方能力待确认**（E1 记录附件上传端点 / E2 按字段条件查询端点），故取 `WITH_EXTERNAL_DEPENDENCIES`。
- **为什么不判 `BLOCKED`**：三项 ARCH-01 的阻断项在本轮**均获得了「不破坏冻结」的可行路径**——
  - 身份/归属 ⇒ §7.4 归属组件（不解冻、不改表）；
  - 行级权限 ⇒ §8.3 过滤层（复用 `resolveGridScope` 判定）；
  - 图片 ⇒ §5.6 云对象存储（完全绕开 WPS 附件未确证问题）。
  ⇒ **不存在「无法接受的技术/安全阻断」**。
- **两项外部依赖均非阻断**：E1、E2 都有**已验证可用的替代路径**（§13），故不升级为 `BLOCKED`。

### 19.4 下一步（等待架构决策，不实施）

```text
1. 就 D1~D7 做出人工决策（尤其 D1 是否采纳 C′、D2 Backend 是否迁出、D3 归属组件合规口径）
2. 用 WPS 官方「API 在线调试器」验证 E1 / E2（**只读/沙箱，不写业务数据**）
3. 三份口径确认后，再按 §11 拆分启动实施（**不在本任务内**）
```

---

## 附录 A · 本轮证据索引

| 类别 | 证据 | 位置 |
|---|---|---|
| 代码·WPS 客户端 | `wpsClient.js` 全文（399 行）：token 55-102 / KSO-1 112-115 / 退避 146-149 / `listAllRecords` 211-226 / `getRecord` 235-238 / `createRecords` 241-262 / `updateRecords` 265-275 / `deleteRecords` 280-288 | `server/services/wpsClient.js` |
| 代码·Pull 引擎 | `wpsGridPullEngine.js` 全文（556 行）：开关 38-40 / 排除 54-72 / `toCanonicalDto` 116-140（规则5 = 131-134）/ `canonicalHash` 163-174 / hash 快路径 473 / `insertWithMap` 241-278 / `updateBusinessColumns` 281-308 / `assertNoProtectedColumns` 223-230 | `server/services/wpsGridPullEngine.js` |
| 代码·字段真源 | `wpsFieldMap.js`：`FIELD_MAP` 28-80（`巡查人员ID` 32 = `pg:'-'`）/ `SYNC_PROJECTION_ORDER` 107-115 / `SYNC_HASH_COLUMN_COUNT` 120 / `PROTECTED_COLUMNS` 127 / `SYNC_URL_COLUMNS` 130 | `server/services/wps/wpsFieldMap.js` |
| 代码·WPS 仓储 | `gridInspectionRepository.js`：`wpsRecordToDto` 64-95（`gridId: null` 86）/ `list` 107-145 / `create` 194-237（身份 202-205）/ `EDITABLE_CAMEL_TO_PG` 244-252 / `update` 258-271 / `remove` 274-279 / `clearAll` 282-287 | `server/services/wps/gridInspectionRepository.js` |
| 代码·数据源开关 | `gridDataSource.js` 三态 28-40 | `server/services/wps/gridDataSource.js` |
| 代码·适配层 | `wpsDbsheetAdapter.js`（`normalizeAttachments` 仅读取归一） | `server/services/wps/wpsDbsheetAdapter.js` |
| 代码·路由 | `site-mgmt.js`：GET 1733 / WPS 分支 1744-1753 / **`WPS_ROW_SCOPE_DEFERRED` 注释 1787** / PUT 1877 **WPS 分支 1879-1884** / scope 1906-1911 / 403 1918-1922 / POST 1942 / DELETE 2036（WPS 2038-2046）/ clearAll 2100-2115 | `server/routes/site-mgmt.js` |
| 代码·范围 | `gridScope.js`：`resolveGridScope` 43 / `buildScopeSqlCondition` 109 / **`deriveGridIdForEmployee` 131-152** | `server/services/gridScope.js` |
| 真机报告 | `Sprint-WPS-02-C-真机执行验收报告.md`：`WPS_REAL_TEST=PASS`；原生 Attachment 列 J/K/L/Q 返回 `{fileName,uploadId,source:upload_ks3}`（**无 url**）；`巡查人员ID` Field `X` 真机落库 `6709` | `docs/` |
| 字段映射 | `WPS-网格巡查字段映射表.md`：附件字段段（J/K/L/Q = Attachment） | `docs/` |
| 只读数据 | `_arch01_schema.json`（表结构/索引/形态分布/映射样本） | 仓库根 |
| 官方文档·V7 列举 | `POST /v7/coop/dbsheet/{file_id}/sheets/{sheet_id}/records` 与 `.../records/list_by_page`；签名 **KSO-1**；权限 `kso.dbsheet.read` / `kso.dbsheet.readwrite` | `open.wps.cn` / WPS365 应用开发文档 |
| 官方文档·附件 | `POST /v7/documents/{file_id}/attachments/upload`（KSO-1、`kso.documents.readwrite`、body `{file}`、返回 `{size, upload_id}`） | `open.wps.cn/documents/app-integration-dev/wps365/server/documents/attachments/documents_attachments_upload` |
| 官方文档·附件值格式 | 「图片与附件：数组元素结构体须含 `uploadId`、`fileName`，可选 `source/type/size`，`source` 必须 `upload_ks3`/`cloud`」 | `developer.kdocs.cn/server/dbt/create-records.html` |
| 官方文档·能力清单 | 20 项能力含「**20. 上传附件到文件**」「18. 查询记录」「19. 查询多条记录」 | 金山 WPS 多维表格数据打通方案（能力对照页） |
| 官方文档·AirScript | `Record.GetAttachmentURL({UploadId, Source})`；`DBCellValue([{fileData,fileName}])`；`GetRecords` 支持 `Filter` / `ViewId` | `airsheet.wps.cn/docs/api/excel/databook/Record.html` |

## 附录 B · 与 ARCH-01 的差异对照（修正 / 强化 / 新增）

| 项 | ARCH-01 表述 | ARCH-02 裁定 | 类型 |
|---|---|---|---|
| 创建时指定 Record ID | 列为「重要外部能力（NEEDS VERIFICATION）」 | **非硬前置**；硬前置是「条件查询」或「服务端幂等登记」 | ⭐ **修正** |
| WPS 附件写入机制 | 「无任何上传实现」（未描述机制） | **二段式**：`上传 → uploadId → 字段写 {uploadId,fileName,source}` | ⭐ **新增事实** |
| WPS 附件值可渲染性 | 未明确 | **Attachment 值无可用 URL** ⇒ 不能作为 HSE 渲染源 | ⭐ **强化** |
| 身份/grid 归属 | 「甲乙丙三选一，均需解冻或改表」 | **解法乙可在不解冻 + 不改表下成立**（§7.4 平级归属组件） | ⭐ **新增路径** |
| 行级权限修复 | 「需补 scope」 | **与归属同依赖**：WPS DTO 恒 `gridId:null` ⇒ **必须先归属、后权限** | ⭐ **新增依赖识别** |
| 关机场景验证 | 六场景（无 P1 完成后的正例） | 补 **场景 2′（云端 Backend 存活 + 本地全关）正例** | ⭐ **方法论补全** |
| 03-B 兼容性 | 4 项保留 | 承接，并**新识别 R2-11**（WPS 模式 `EDITABLE_CAMEL_TO_PG` 缺 `rectifiedPhoto`） | ⭐ **新增缺口** |
| 最终状态 | `..._ARCH_01_AUDIT_COMPLETED_WITH_EXTERNAL_DEPENDENCIES` | `..._ARCH_02_COMPLETED_WITH_EXTERNAL_DEPENDENCIES`（阻断项均有可行路径，故不升 BLOCKED） | 承接 |

---

**报告结束。本任务严格遵守 STRICT READ-ONLY：0 代码修改、0 DDL、0 DML、0 WPS 调用、0 进程操作、0 依赖新增。按用户 §十二 停止，等待架构决策。**
