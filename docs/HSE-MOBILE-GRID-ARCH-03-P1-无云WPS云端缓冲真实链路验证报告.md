# HSE-MOBILE-GRID-ARCH-03-P1：WPS云端缓冲真实链路实证验证与冻结影响核验

- 任务类型：**STRICT READ-ONLY 只读验证 + 人工外部实证协议**
- 报告生成时间：2026-09-12 19:11（Asia/Shanghai）
- 前置：ARCH-03（无云 WPS 云端缓冲架构复核，已 `COMPLETED_WITH_EXTERNAL_DEPENDENCIES`）
- 本轮已执行：**只读代码审计 + 只读 PostgreSQL 内省 + 只读生产状态检查 + 本报告生成**
- 本轮未执行（需人工/真机）：WPS 表单视图人工创建、真实手机提交、电脑关闭缓冲实测、图片 Attachment 真机链路、重复提交基线、恢复后 Pull 实测
- 严守红线：**0 代码改动 / 0 PG DDL / 0 PG DML / 0 WPS OpenAPI 写 / 0 生产生命周期操作 / 0 .env 修改**

---

## 1. 执行摘要

### 1.1 本轮回炉可下结论的部分（只读审计）

| 验证目标 | 结论（只读审计） | 依据 |
|---|---|---|
| **P1-1** WPS 官方表单是否可作真实手机提交入口 | **PASS（能力确证）** | ARCH-03 §4 官方文档逐项确证 + 本轮回读 `wpsClient.js`/`wpsFieldMap.js` 确认表单产生的就是普通多维表记录，`list_by_page` 全量可读 |
| **P1-5** 表单普通 Record 能否被现有 Pull 消费（文本业务字段） | **PASS（设计路径）** | `wpsGridPullEngine.js` 全量遍历 `list_by_page`，按 `SYNC_PROJECTION` 逐列映射；业务文本字段均在投影内 |
| **P1-6** 新增 WPS 字段是否改变 sync_hash / 05-H-0 | **PASS（技术兼容）** | `toCanonicalDto`/`toLegacyHashDict`/`canonicalHash` 仅遍历 `SYNC_PROJECTION`，未映射字段被静默忽略；DB 实测无 `client_token` 列、前 18 列 hash 口径未变 |
| **05-H-0 兼容性** | **PASS（只读）** | FieldMap / SYNC_PROJECTION / PROTECTED_COLUMNS / sync_hash 逻辑 / Pull 代码 / sync_map 全部未改（源码 mtime 未动，仅新增本报告与只读脚本） |
| **03-B 兼容性** | **PASS** | 03-B 改动（整改照片补传白名单）与 WPS-PG-SYNC 冻结层正交，本轮回读无冲突 |

### 1.2 本轮回炉**不能**下结论、需人工实证的项

| 验证目标 | 状态 | 说明 |
|---|---|---|
| **P1-2** WPS 提交者身份真实返回内容 | **NEEDS_EXTERNAL_CONFIRMATION** | 需真机表单 + 真实账号提交，观察 WPS 实际返回的「创建人/提交者」字段值（姓名/昵称/账号 ID？） |
| **P1-3** 图片 Attachment → HSE 可稳定显示 | **NEEDS_EXTERNAL_CONFIRMATION** | WPS 存储 = PASS（确证）；但 `download_url` 有效期/长期稳定性需真机换 URL 验证 |
| **P1-4** 电脑关闭期间 WPS 可靠保存 | **NEEDS_EXTERNAL_CONFIRMATION** | 需人工关闭本机后端/PG、用真机经表单提交，确认 WPS 端记录完整 |
| **P1-5 实证** 恢复后 Pull 真机追赶 | **NEEDS_EXTERNAL_CONFIRMATION** | 设计路径 PASS，但需真实「关机→提交→开机→自然 Pull」一轮实测闭环 |
| 重复提交基线（§九） | **NEEDS_EXTERNAL_CONFIRMATION** | 需真机同账号重复提交两次，验证 PG 产生两条 + sync_map 各自映射 |

### 1.3 终态状态机

```
PHASE_HSE_MOBILE_GRID_ARCH_03P1_COMPLETED_WITH_EXTERNAL_DEPENDENCIES
```

**判定理由**：只读审计 6 项目标中，可代码/数据定论的 3 项（P1-1 能力、P1-5 设计路径、P1-6 冻结兼容）全部 PASS，未发现任何硬阻断；但 P1-2/P1-3/P1-4 的真实链路与恢复实证尚未由人工跑通，属「外部能力未闭环但架构可继续推进」。**此状态不等于「P1 全量通过」**，仅代表只读部分完成、架构无阻断、可进入人工实证阶段。

---

## 2. 当前生产状态（只读观测，2026-09-12 19:11）

| 项 | 实测值 | 来源 |
|---|---|---|
| 后端 5876 | `0.0.0.0:5876` / `[::]:5876` **LISTENING**，PID **23396**（Services/SYSTEM 看护） | `netstat -ano` |
| 数据库 | 本机 PostgreSQL `safety_dashboard@127.0.0.1:5432` | `.env` |
| `grid_inspection_records` | **2061** 行；MAX(id)=7192 / MIN(id)=4954 | SELECT |
| `grid_record_sync_map` | **2061** 行；`conflict=0`；`sync_hash` 全部非 NULL | SELECT |
| `inspector_employee_id NULL` | **2051** / 2061 | SELECT |
| `grid_id NULL` | **327** / 2061 | SELECT |
| `.env` 口径 | `WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=true` / `SCHEDULER_ENABLED=true`；`WPS_DBSHEET_FILE_ID=cn229thwalDs` / `WPS_DBSHEET_SHEET_ID=3` | `.env`（未改） |
| 调度 | Task Scheduler「HSE-Backend」SYSTEM 看护，Scheduler 每 15 分钟自然 Pull | 既有（ARCH-03 §2） |
| 其它 node.exe | 大量 Console 会话进程；`24036`/`12680` 为已知无害残留（无监听端口、未连生产库） | `tasklist` |

**结论：生产健康、冻结态完整、6 表禁直写未破。本回未对上述任何进程/服务/数据库执行写或生命周期操作。**

---

## 3. WPS 表单实际配置结果（P1 第三阶段 · 人工执行）

**状态：NEEDS_EXTERNAL_CONFIRMATION（人工未执行，本 AI 按红线禁止自动创建）**

### 3.1 配置目标（来自任务书 §五）
1. 仅企业内可填写　2. 登录后填写　3. 收集填写者信息　4. 隐藏内部字段　5. 暴露巡查业务字段　6. 暴露问题照片 Attachment 字段　7. **不暴露** `grid_id` / `inspector_employee_id` / sync 内部字段 / 映射字段 / 链接镜像字段 / 其他不应由手机填写的字段。

### 3.2 人工执行协议（供用户/管理员操作，非 AI 执行）
1. 用 WPS 管理员账号打开生产板 `cn229thwalDs`（sheet 3，即现有生产多维表格）。
2. 新建「表单视图」，按 §3.1 七项配置。
3. 字段暴露清单（建议，依据 §5 字段矩阵）：暴露 `三违行为`/`违章人姓名`/`违章人性别`/`违章人年龄`/`上报状态`/`车辆类型`/`违章类型结果`/`是否需要整改`/`整改人`/`三违照片链接(或原生附件列)`/`整改后照片链接(或原生附件列)`/`示意图链接`/`姓名`/`分组名称`/`所属岗位`/`网格等级`/`日期`/`当日是否报名`/`是否补交`/`提交时间`/`标记`。
4. **隐藏**：任何含 `巡查人员ID`/`创建人`/链接镜像列/内部标记列（若表单误暴露，Pull 也会忽略，但应遵守最小暴露原则）。
5. 开启「登录后填写」+「收集填写者信息」+ 系统「创建人」高级字段（自动填实名账号）。
6. 生成企业内分享链接，记录链接与表单视图 ID。

### 3.3 完成时登记
- 表单链接、视图 ID、暴露字段清单、隐藏字段清单、分享权限档位。

---

## 4. WPS 提交者身份实际结果（P1 第四阶段 · 人工执行）

**状态：NEEDS_EXTERNAL_CONFIRMATION（未实证）**

### 4.1 代码层已确证的事实（只读）
- `wpsClient.js:buildRecord` 仅提取 `id / fields / lastModifiedTime / createdTime`；**`show_record_extra_info:true` 已开启，但若 WPS 在 `fields` 外返回 `creator` 等额外信息，当前 Pull 不读取**——即「创建人/提交者」字段即使 WPS 填了，也**不在 `SYNC_PROJECTION` 中 → Pull 静默忽略 → 不进 PG**（见 §5 缺口 G4）。
- 因此「身份桥接」必须依赖**独立归属组件**（ARCH-03 §7/§11，定性 B 类）在 Pull 之后读取 WPS 记录的创建人快照并映射到 `employee.id`，**不能**靠现有 Pull 把身份写进 `inspector_employee_id`（该列受 `PROTECTED_COLUMNS` 硬断言保护，Pull 恒写 NULL）。

### 4.2 需真机实证的字段内容
用 2~3 个真实网格长账号各提交 1 条，记录 WPS 实际返回：
- `creator` / 「创建人」高级字段值 = 实名姓名？昵称？企业账号 ID？邮箱？手机号？
- 是否每次提交一致、不同人员之间是否唯一、是否存在稳定账号 ID。
- **若只有姓名/昵称、无稳定账号 ID → 结论必须标记 `IDENTITY_BRIDGE_WEAK`，不得包装为 PASS。**

### 4.3 桥接判定前置（只读已定）
- users/employee 表**无 WPS 账号字段** → WPS 身份 ↔ employee 无既有映射。
- 姓名对照：employee 表存在重名风险 → 必须 fail-closed（拒绝归属、转人工）。
- 可行桥：①姓名对照唯一命中；②人工维护 WPS账号↔employee 对照表（62 网格长可人工维护）。

---

## 5. WPS 字段逐字段映射矩阵（P1 第二阶段 · 只读完成）

> 真源：`server/services/wps/wpsFieldMap.js`（`FIELD_MAP` + `SYNC_PROJECTION_ORDER`）+ `grid_inspection_records` 实际列（SELECT 实测 28 列）。
> 投影定义：`SYNC_PROJECTION_ORDER` 23 列 = 前 18 列（`SYNC_HASH_COLUMNS`，入 sync_hash）+ 后 5 列（业务列，不入 hash）。`grid_id`/`inspector_employee_id` 永不入投影（PROTECTED）。

| 业务语义 | WPS 字段 | PG 列 | 在 SYNC_PROJECTION | 入 hash(前18) | Pull 消费？ | 说明 / 缺口 |
|---|---|---|---|---|---|---|
| 编号 | 编号 | serial_no | ✓ | ✓ | ✓ | 业务编号 |
| 巡查人员(姓名) | 姓名 | personnel_name | ✓ | ✓ | ✓ | 快照 |
| 巡查人员ID | 巡查人员ID | inspector_employee_id(pg='-') | ✗(PROTECTED) | ✗ | ✗ | **G1**：PROTECTED，Pull 恒 NULL |
| 巡查人员ID(biz) | — | — | — | — | — | 同上 |
| 分组 | 分组名称 | area_team | ✓ | ✓ | ✓ | |
| 岗位 | 所属岗位 | position | ✓ | ✓ | ✓ | |
| 网格等级 | 网格等级 | grid_level | ✓ | ✓ | ✓ | |
| 巡查日期 | 日期 | inspection_date | ✓ | ✓ | ✓ | 归一 YYYY-MM-DD |
| 昵称 | 昵称2 | nickname | ✓ | ✓(首位) | ✓ | 仅展示，禁作身份 |
| 三违行为(问题描述) | 三违行为 | violation_behavior | ✓ | ✓ | ✓ | **核心业务字段** |
| 违章人姓名(违规人员) | 违章人姓名 | violator_name | ✓ | ✓ | ✓ | 仅姓名 |
| 违章人性别 | 违章人性别 | violator_gender | ✓ | ✓ | ✓ | |
| 违章人年龄 | 违章人年龄 | violator_age | ✓ | ✓ | ✓ | |
| 上报状态 | 上报状态 | report_status | ✓ | ✗ | ✓ | 业务列 |
| 车辆类型 | 车辆类型 | vehicle_type | ✓ | ✗ | ✓ | |
| 违章类型结果 | 违章类型结果 | violation_type_result | ✓ | ✗ | ✓ | |
| 是否整改 | 是否需要整改 | need_rectification | ✓ | ✗ | ✓ | |
| 整改人 | 整改人 | rectifier | ✓ | ✗ | ✓ | |
| 问题照片 | 三违照片链接(链接镜像) | image_content | ✓ | ✓ | 条件✓ | **G2**：仅当 WPS 存 http(s) URL；表单 Attachment 不入此列 → 不消费 |
| 整改照片 | 整改后照片链接(链接镜像) | rectified_photo | ✓ | ✓ | 条件✓ | **G2**：同上 |
| 示意图 | 示意图链接 | schematic | ✓ | ✓ | 条件✓ | 同上 |
| 报名 | 当日是否报名 | signup_today | ✓ | ✓ | ✓ | |
| 补交 | 是否补交 | is_resubmit | ✓ | ✓ | ✓ | |
| 提交时间 | 提交时间 | upload_time | ✓ | ✓ | ✓ | |
| 标记 | 标记 | marker | ✓ | ✓ | ✓ | 可复用为 client_token 快照（零 DDL） |
| 巡查时间 | 巡查时间 | -(reserved) | ✗ | ✗ | ✗ | **G3**：reserved，未建列 |
| 巡查地点/所属网格 | 所属网格/巡查区域 | -(reserved) | ✗ | ✗ | ✗ | **G3**：reserved，未建列 → 无地点进 PG |
| 网格归属 | （无 WPS 源） | grid_id | — | — | ✗ | **G1**：PROTECTED，需归属组件补 |
| 创建人/提交者 | 创建人(高级字段) | -(不在 FIELD_MAP) | ✗ | ✗ | ✗ | **G4**：Pull 忽略，需桥/归属组件读 |
| 原生附件 | Attachment 列(J/K/L/Q) | -(不在 FIELD_MAP) | ✗ | ✗ | ✗ | **G2**：Pull 忽略，需桥 |

### 5.1 缺口汇总（禁止为通过测试改 FieldMap）
- **G1 身份/网格**：`inspector_employee_id`/`grid_id` 受 PROTECTED，Pull 恒 NULL → 需独立归属组件（B 类）在 Pull 之后按「创建人快照→employee.id→grid_id（唯一才写，NULL→值永不覆盖）」补。
- **G2 图片错位**：表单写原生 Attachment，现有 Pull 只从「链接镜像列」取 http(s) URL → 须桥（α：attachment-urls 端点换 URL；β：AirScript 回写链接列，Pull 零改动）。
- **G3 地点/时间 reserved**：`巡查时间`/`所属网格`/`巡查区域` 为 reserved（pg='-'），表单提交后不入 PG。
- **G4 创建人**：WPS 创建人字段不在 FIELD_MAP，Pull 不读；需归属组件经 `list_by_page` 只读读取快照。

### 5.2 结论（P1-5 设计层）
表单产生的「普通 Record」**文本业务字段可完整被现有 Pull 消费**（它们在 SYNC_PROJECTION 内）；**身份/网格/图片/地点四类不可消费**，且已明确缺口与解法，**不靠修改 FieldMap/PROTECTED/SYNC_PROJECTION 解决**（符合冻结红线）。

---

## 6. 电脑关闭提交测试（P1 第五阶段 Case B · 人工执行）

**状态：NEEDS_EXTERNAL_CONFIRMATION（未实证）**

### 6.1 人工执行协议
1. 确认本机 `5876`(PID 23396) 由 SYSTEM 看护、Task Scheduler 自动拉起——**仅验证其存在，不手动停止**（红线：禁操作生产生命周期）。
2. 关闭本机后端进程 / 停止 PostgreSQL 服务（仅验证本地业务环境可停；**不碰 5876 生产 PID**）。
3. 真机经 §3 表单链接提交 3~5 条，记录：提交时间、WPS Record ID、提交账号。
4. 确认 WPS 端记录完整存在（WPS 云端与本机无关，理论必然成立，需真机确认）。

### 6.2 完成时登记
- 提交清单、WPS 端记录数、是否全部落 WPS。

---

## 7. 电脑恢复 Pull 测试（P1 第五阶段 Case C / P1-5 实证）

**状态：NEEDS_EXTERNAL_CONFIRMATION（设计 PASS，实证未跑）**

### 7.1 设计层已确证（只读代码审计）
- `pullWpsToPg` 全量 `listAllRecords` → 对每条未映射记录执行 `insertWithMap`（单事务 INSERT gir + INSERT sync_map，失败 ROLLBACK）→ 幂等键 `UNIQUE(wps_record_id,wps_file_id)` 防重。
- 关机期间 WPS 累积的记录，开机后 Scheduler 15 分钟周期自然 Pull，**追赶式补齐**，与历史 2061 条逻辑完全一致。
- 预期恒等式：`WPS测试记录数 = PG新增记录数 = sync_map新增数`，且 `重复记录数 = 0`（幂等键保证）。

### 7.2 人工执行协议
1. 恢复本机 PostgreSQL 与后端（让 Task Scheduler 自然拉起，或确认其已自动拉起）。
2. **不人工执行 Pull**，等待 Scheduler 自然运行。
3. 观察 `grid_inspection_records` 新增数、`grid_record_sync_map` 新增数、是否一一对应。
4. 若归属组件尚未实现：`inspector_employee_id=NULL` / `grid_id=NULL` 为**预期行为**，不强行补。

---

## 8. 图片 Attachment 测试（P1 第六阶段 / P1-3 · 人工执行）

**状态：NEEDS_EXTERNAL_CONFIRMATION（WPS 存储 PASS；HSE 显示链路待实证）**

### 8.1 代码/文档已确证（只读）
- 表单 Attachment 值形态：`{ fileName, uploadId, source:"upload_ks3"|"cloud" }`（ARCH-03 §5.11；`wpsDbsheetAdapter.normalizeAttachments` 已能归一）。
- **WPS 可稳定存图 = PASS**（官方 + 真机 Schema 确证）。
- 取得可访问 URL 的官方路径：`POST /api/v1/openapi/dbt/:file_token/attachment/urls`（uploadId→download_url，限图片/云文档附件）；或 AirScript `Record.GetAttachmentURL`。
- 现有 `rectified_photo` 基线（SELECT 实测）：empty 1504 / 相对路径 468 / http 84 / other 5；`image_content`：相对 1698 / http 337 / empty 26 → **PG 本就兼容 http(s) URL 与相对路径两种形态**。

### 8.2 需真机实证（本回未做）
- 真机经表单提交 ≥1 条带真实照片记录。
- 经 attachment-urls 端点换 `download_url`，记录：URL 格式 / 是否可访问 / 是否需鉴权 / 有效期 / 长期稳定性 / 提交后多久可取 / 电脑恢复后是否仍可取。
- **若无法证明长期稳定 → 标记 `IMAGE_URL_LONG_TERM = NEEDS_EXTERNAL_CONFIRMATION`，不得写 PASS。**

---

## 9. 重复提交基线（P1 第七阶段 · 人工执行）

**状态：NEEDS_EXTERNAL_CONFIRMATION（未实证）**

### 9.1 设计层已确证（只读）
- 同一账号提交完全相同内容两次 → WPS 产生两个 Record ID（A/B）。
- Pull 各自 `insertWithMap` → PG 产生两条正式记录，sync_map 对 A/B 分别建映射（`ALREADY_EXISTS` 仅命中同一 wps_record_id，A≠B 故各建一条）。
- 这是方案 C 唯一真实数据质量缺口；本阶段**只建基线、不解决**（client_token 去重留待后续决策）。

### 9.2 人工执行协议
1. 真机同账号提交两次完全相同内容。
2. 电脑恢复后观察 PG 是否两条、sync_map 是否两条映射。
3. 明确区分「Pull 幂等（同 wps_record_id 不重复）」与「业务重复提交幂等（无唯一业务键）」。

---

## 10. sync_hash 冻结影响验证（P1 第八阶段 / P1-6 · 只读完成）

**结论：CLIENT_TOKEN_FIELD_COMPATIBLE_WITH_FREEZE（技术兼容，已代码级证明）**

### 10.1 sync_hash 究竟基于什么（任务书 §三 必答题）

| 候选 | 是否 | 依据 |
|---|---|---|
| A. 固定 field_id | ✗ | 代码无 field_id 参与 hash |
| B. 字段顺序(WPS 侧) | ✗ | hash 不依赖 WPS 表内列序 |
| **C. SYNC_PROJECTION** | **✓** | `canonicalHash` 遍历 `SYNC_PROJECTION` 过滤 `p.hash`（= 前 18 列 `SYNC_HASH_COLUMNS`） |
| D. DTO 属性 | 部分（DTO 由投影派生） | DTO 由 `toCanonicalDto` 从投影生成，根因仍是投影 |
| E. 其他方式 | ✗ | 无 |

**精确定位**：
- `wpsFieldMap.js:107-115` `SYNC_PROJECTION_ORDER`（23 列，前 18 = `SYNC_HASH_COLUMNS`）。
- `wpsFieldMap.js:118` `SYNC_HASH_COLUMN_COUNT = 18`。
- `wpsGridPullEngine.js:163-174` `canonicalHash`：对 `SYNC_PROJECTION` 中 `p.hash` 为真者，按序取 `pg=trimmed_value`（''≡null）拼 `|` 后 SHA-256。
- `wpsGridPullEngine.js:147-160` `toLegacyHashDict`：同序 18 列，''→null（不做伪空/URL 过滤，与历史口径逐字节一致）。

**最终答案：sync_hash 基于 `SYNC_PROJECTION_ORDER` 前 18 列的有序投影（PG 列名 + 归一值），与 WPS field_id、WPS 列序、未映射字段均无关。**

### 10.2 新增 WPS 字段（不入 FIELD_MAP）的影响（任务书 §三.3 必答题）
设 WPS 表末新增 `client_token`（不入 FIELD_MAP）：
- `toCanonicalDto(fields)`：`for (const p of SYNC_PROJECTION)` 只遍历投影内的 WPS 字段名；`client_token` 不在投影 → **完全忽略**，DTO 不含该字段。
- `toLegacyHashDict` / `canonicalHash`：同上，只遍历投影 18 列 → **前 18 列 hash 不变**。
- Pull 变更检测：`mapped.sync_hash === hash` 命中 → `skippedUnchanged`，**零 DML**。
- `sync_map`：因零 DML，**不变化**。
- 既有 2061 条 PG 数据：**无任何业务变化**。
- DB 实测：`grid_inspection_records` **无 `client_token` 列**，前 18 列 hash 口径未漂移（2061/2061 全映射、conflict=0）。

**判定：`CLIENT_TOKEN_FIELD_COMPATIBLE_WITH_FREEZE`** —— 技术兼容，冻结层（FieldMap/SYNC_PROJECTION/PROTECTED_COLUMNS/sync_hash/Pull/sync_map/既有数据）零扰动。
**重要限定**：此结论仅代表「WPS 侧加一个未映射字段」技术无害，**不等于已批准增加该字段**；若要真正用 `client_token` 去重，仍需后续在「只读消费路径」或「复用 `marker` 列」落地，并经一次 Pull 幂等回归（预期零 DML）验证。

### 10.3 八项核验清单（任务书 §十）
1. FieldMap 是否变化 — **否**（未改）
2. SYNC_PROJECTION 是否变化 — **否**
3. PROTECTED_COLUMNS 是否变化 — **否**
4. sync_hash 计算逻辑是否变化 — **否**
5. 前 18 列 hash 是否变化 — **否（代码证明 + DB 实测）**
6. Pull 代码是否变化 — **否**（源码未动）
7. sync_map 是否变化 — **否**（只读，零 DML）
8. 既有 2061 条业务数据是否变化 — **否**（只读，零 DML）

---

## 11. 05-H-0 兼容性结论（只读）

**PASS（技术兼容，已代码+DB 证明）**

- 冻结态 `PHASE_WPS_PG_SYNC_05H0_PRODUCTION_FROZEN` 在本回未被触碰：`.env` 未改、6 表未直写、5876 未启停、源码 mtime 未变、仅新增本报告与 1 个只读脚本（`_arch03p1_introspect.cjs`，SELECT-only，已跑完即退出，不残留进程）。
- 新 WPS 字段（不入 FIELD_MAP）对 05-H-0 三个冻结物（FieldMap / SYNC_PROJECTION / sync_hash）零影响（§10.2）。
- 结论：`CLIENT_TOKEN_FIELD_COMPATIBLE_WITH_FREEZE`，05-H-0 保持冻结。

---

## 12. 03-B 兼容性结论（只读）

**PASS**

- 03-B（整改照片补传 `rectified_photo` 白名单）属 PG 业务层改动，与 WPS-PG-SYNC 冻结链路正交。
- 本回读 `site-mgmt.js` 相关白名单与 `wpsFieldMap.js` 投影，无冲突；`rectified_photo` 仍在 `SYNC_PROJECTION` + `SYNC_URL_COLUMNS` 内，WPS→PG 方向消费逻辑不变。
- 03-B 全部保留（与 ARCH-03 §16 一致）。

---

## 13. 风险清单

| 风险 | 等级 | 说明 |
|---|---|---|
| R-P1-1 身份桥接弱 | 高 | 若 WPS 创建人仅返回姓名/昵称、无稳定账号 ID → `IDENTITY_BRIDGE_WEAK`，归属 fail-closed |
| R-P1-2 图片 URL 非长期 | 高 | `download_url` 有效期/稳定性未实证 → 显示侧可能失效 |
| R-P1-3 表单图片错位 | 中 | Attachment ≠ 链接镜像列，现有 Pull 拿不到表单图片，需桥（α/β） |
| R-P1-4 重复提交 | 中 | 方案 C 固有缺口，需 client_token（后续决策，本 Sprint 不实施） |
| R-P1-5 归属组件未实现 | 中 | G1/G4 依赖独立归属组件，本 Sprint 不实施，故 `inspector_employee_id`/`grid_id` 暂恒 NULL |
| R-P1-6 表单误暴露内部列 | 低 | 若表单暴露 `grid_id`/链接镜像列，Pull 忽略但违反最小暴露原则（人工配置纪律） |
| R-P1-7 残留进程 | 低 | `24036`/`12680` 无害残留，按纪律不碰（待用户授权清理） |

---

## 14. 外部依赖（NEEDS_EXTERNAL_CONFIRMATION）

1. **P1-2**：WPS 创建人/提交者字段真实内容（姓名/昵称/账号 ID？）。
2. **P1-3**：`download_url` 有效期、长期稳定性、对本项目应用凭证的端点授权。
3. **P1-4**：电脑关闭期间 WPS 真实保存（真机一轮）。
4. **P1-5 实证**：关机→提交→开机→自然 Pull 闭环。
5. **§九**：同账号重复提交基线（真机）。
6. **图片桥 α/β**：attachment-urls 端点授权 / AirScript `GetAttachmentURL` 触发与额度。
7. **组织 WPS 版本档位**：视图级权限（「仅自己创建记录」筛选）是否对本组织开放。

---

## 15. 尚未解决问题

1. WPS 身份 ↔ employee 映射机制（姓名对照重名 fail-closed / 人工对照表）未定。
2. 图片桥方案 α 与 β 的选择与实施（本 Sprint 不实施）。
3. `client_token` 是否增加、加在 WPS 侧还是复用 `marker` 列、去重组件形态（后续决策）。
4. 独立归属组件（B 类）的实现与触发时机（后续决策）。
5. 表单视图「查看自己提交」是否需要企业版高级权限（待确认）。

---

## 16. 下一阶段建议

### 16.1 本 Sprint 剩余人工实证（按顺序，约 0.5~1 天真机时间）
1. **§3** 管理员人工创建表单视图（七项配置），登记链接/字段清单。
2. **§4** 2~3 真实网格长各提交 1 条，记录 WPS 创建人真实值 → 判定 `IDENTITY_BRIDGE_WEAK` 或可行。
3. **§6+§7** 关机提交 3~5 条 → 开机让 Scheduler 自然 Pull → 核对 `WPS数=PG新增=sync_map新增`、`重复=0`。
4. **§8** 带图提交 1 条 → 换 `download_url` → 记录有效期/稳定性。
5. **§9** 同账号重复提交两次 → 核对 PG 两条 + sync_map 两条。
6. 全部完成后回填本报告 §3/§4/§6/§7/§8/§9，重判终态（预期升级为 `READY_FOR_P2` 或维持 `COMPLETED_WITH_EXTERNAL_DEPENDENCIES`）。

### 16.2 严格禁止（本 Sprint 收官前）
`wpsGridAttribution` / `client_token` / marker 复用 / AirScript 自动化 / 新 PG 字段 / 新 PG 表 / WPS 字段自动创建 / H5 应急入口 / 新 API / 新前端页面 / WPS row-level 改造 / WPS OpenAPI 移动端直连 / 云服务器 / Backend 迁移。**本 Sprint 仅负责「证明方案 C 能否真实跑起来」，验证完即停。**

### 16.3 终态
```
PHASE_HSE_MOBILE_GRID_ARCH_03P1_COMPLETED_WITH_EXTERNAL_DEPENDENCIES
```
（只读审计 PASS、无硬阻断；P1-2/3/4/5 实证与图片桥为未闭环外部依赖，待人工按 §16.1 跑通后复核升级。）

---

### 附录 A：本回只读取证脚本与产物
- `server/scripts/_arch03p1_introspect.cjs`：SELECT-only PostgreSQL 内省（已执行，退出无残留进程）。
- 关键 SELECT 结果快照：gir=2061 / sync_map=2061 / conflict=0 / sync_hash 全非空 / inspector_null=2051 / grid_null=327 / 无 client_token 列 / `UNIQUE(wps_record_id,wps_file_id)` 存在。
- 生产 `:5876` PID 23396 LISTENING（未触碰）。
