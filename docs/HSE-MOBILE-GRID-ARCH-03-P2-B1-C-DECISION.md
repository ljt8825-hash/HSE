# HSE-MOBILE-GRID-ARCH-03-P2-B1-C-DECISION
## WPS Creator 身份能力 BLOCKED 后的架构决策审计

| 项 | 值 |
|---|---|
| 任务性质 | **READ-ONLY ARCHITECTURE DECISION / NO IMPLEMENTATION** |
| 执行时间 | 2026-09-12 23:13–23:2x（GMT+8） |
| 上游状态 | `P2-B1-C-EXT` = **`BLOCKED`** |
| 本阶段最终状态 | **`ARCHITECTURE_DECISION_READY`** |
| 是否改代码/DB/.env | **否**（本次仅 SELECT 读 PG + GET/list_by_page 读 WPS + 读文件） |
| 是否自动进入下阶段 | **否**（完成后停止，等待人工审核） |

---

## 1. 执行摘要

**结论一句话**：WPS Creator 作为「身份来源」在当前证据下**不可用**，但**这不应、也不必**阻塞 ARCH-03 的真实业务目标——因为**业务的真实目标是「数据不丢」，不是「身份自动归好」**；而「数据不丢」这条链路在 05-H-0 冻结时点**就已经在生产上跑通**（2063 → 2061，conflict=0）。

三处关键判断：

1. **放弃「以 WPS Creator 为身份源」**（方案 A）。全量 2066 条记录 `creator` 恒为单一账号 `1901573333`，业务姓名却有 61 个，`creator === last_modified_by` 恒真，全部记录同属 2026/09/08 一个 2 小时批量写入窗口 ⇒ 该值是**应用/属主账号**，不具备逐提交者语义。且文件内无 Form 视图、无任何新增提交 ⇒ 连"creator 会不会随提交者变"都无法验证（`BLOCKED`）。**严禁**把它当身份。

2. **确认 WPS 作为「数据云缓冲层」成立**（Record Buffer + Attachment Buffer）。**这不是新方案，而是对既有冻结架构的确认与形式化**：`wpsGridPullEngine.js` 已在 `stats.inspectorNull++ / gridNull++` 处**恒定写入 NULL 身份**，且 `PROTECTED_COLUMNS=['grid_id','inspector_employee_id']` 在 `toCanonicalDto()` 末尾被 `delete`——**冻结设计本身就已假定「身份不来自 WPS」**。因此"身份 pending 而数据照常入 PG"在架构上**不是妥协，而是既定语义**。

3. **推荐方案 C（双通道）**：通道 A = Mobile H5 → HSE Backend → PG（**唯一可信身份来源**，现状可用）；通道 B = Mobile → WPS → Pull → PG（**数据不丢的兜底通道**，身份 `pending`）。两通道权威边界为 **PG = 业务主库，gridScope = 最终授权边界**，WPS 的任何字段**永不**直接构成授权或身份。

**本阶段未改任何代码、任何 DB、任何 `.env`、任何 WPS 数据**；生产基线 2061/2061/7192/0/28 列保持不变。

---

## 2. 当前 BLOCKED 原因

| # | 事实 | 证据来源 |
|---|---|---|
| 1 | 文件 `cn229thwalDs` 内 **Form 视图数 = 0**（3 个 Sheet 的视图类型全为 `Grid`） | `getSchema` 实测 |
| 2 | **观察窗口内人工提交 = 0**；2063 条 `created_time` 100% 落在 2026/09/08 17:11:58–19:11:02 | 全量分页扫描 |
| 3 | 因此**无法构造「用户A vs 用户B」的受控对照**，`creator` 是否随提交者变化**不可判定** | 无样本 |
| 4 | 创建临时 Form 属 **WPS 写操作**，本阶段明令禁止 | §一/§十三 |

⇒ 落 `BLOCKED`，措辞按 §三：**「无法建立独立测试Form，因此无法完成逐提交者creator实证。」**

**性质澄清（重要）**：这是**能力验证的 BLOCKED**，不是**架构可行性 的 BLOCKED**。二者必须分开——见 §4。

---

## 3. Creator 能力最终判断

### 3.1 可得性 ≠ 可用性

| 维度 | 结论 | 证据 |
|---|---|---|
| **字段是否可得** | ✅ 可得 | 原始 `list_by_page`（`show_record_extra_info:true`）返回体含 `{fields,id,created_time,creator,last_modified_by,last_modified_time}`；`wpsClient.buildRecord()` 只挑 4 字段**丢弃** creator（可得性曾被此归一化层掩盖） |
| **是否稳定** | ✅ 样本内稳定 | 2066 条单值，跨日修改后仍同值 |
| **是否逐提交者不同** | ❌ **无证据**（且形态强烈指向相反） | distinct creator = **1**，对应 **61** 个业务姓名 |
| **是否共享账号** | ⚠️ **强间接证据指向是**，未受控 CONFIRMED | ① 1 creator : 61 姓名 ② `creator === last_modified_by` **2066/2066** ③ 全部落于单一 2 小时批量写入窗口 ④ 唯一跨日修改后仍同值 ⑤ 10 位数字形态符合平台账号 ID |
| **能否比对应用自身账号** | ❌ 不可观测 | `/users/me`、`/account`、`/files/{id}/members` 等 12 个只读端点**全 404** |

### 3.2 最终判定

> **`WPS_CREATOR = SEMANTICS_UNVERIFIED` → 架构上正式判定为「不可作为身份来源」（正式禁用）**

**正式口径（本文档生效后）**：

- `WPS Creator` **不进入**任何身份归属路径；`gridEnrichmentService.resolveAttribution()` 中 `creatorTrust === 'shared_account'` 分支**保留并常驻生效**（返回 `pending` / `IDENTITY_STATE.UNTRUSTED`，`reason='creator_shared_account'`）。
- `wps_account_employee_map` **保持 0 行**；`1901573333` **仅作记录**，永不认领 employee。
- 即使未来某天出现 `distinctCreators > 1`，也只能进入 `per_submitter_candidate`（**候选**），仍需人工核验后才可建 bridge——**永不自动 attributed**。

---

## 4. WPS Buffer 可行性判断

### 4.1 五个问题（§二 1/2/3/4/5）的直接回答

| 问题 | 回答 | 依据 |
|---|---|---|
| **1. WPS 无法提供可信提交者身份，是否仍可作为可靠的「数据云缓冲层」？** | **可以** | 云缓冲层的职责是**承载并暂存记录**，与身份无关。WPS→Pull→PG 链路已在 05-H-0 生产验证（2063→2061、conflict=0、幂等每 15min 零 DML）。Pull 引擎从不依赖 creator 即可完成入库 |
| **2. 若 WPS 只负责 Record Buffer + Attachment Buffer，身份可否延迟到 PG/HSE 侧？** | **可以，且这正是冻结设计的本意** | `PROTECTED_COLUMNS` 被 `delete`、`inspectorNull++/gridNull++` 恒定 NULL、`deriveGridIdForEmployee` 只在 PG 侧派生 → 身份从来就是 PG 侧职责 |
| **3. 无法确定 `inspector_employee_id` 的记录，可否以 NULL + pending 进入 PG？** | **可以，且已经在这样做** | 冻结 Pull 路径下 **2061 条中大量行的 `inspector_employee_id` 就是 NULL**（含 327 条历史 NULL grid 指纹集合）；`attribution_status` 默认 `pending` |
| **4. 进入 PG 后可否由管理员人工认领 / 后续可信信息补充 / HSE 后台确认完成归属？** | **可以，且这是当前唯一合规路径** | 通道 A 的记录 `inspector_employee_id` 已由服务端派生（无需人工）；**通道 B** 的记录需人工/后台确认。前提：不得用弱字段自动匹配（§五） |
| **5. 「数据接收成功」与「身份归属成功」是否两个不同状态？** | **必须是两个独立状态** | `attribution_status`（归属）与行是否存在（接收）本就解耦；本决策要求将其**显式化**（见 §14 状态机） |

### 4.2 关键洞察：业务目标与身份解耦

```
业务真实目标：  现场数据在电脑关机/重启/Backend 暂停后不丢失，恢复后能从 WPS 拉回 PG
             ↑ 这条链路 100% 不依赖 creator / attachment / identity

身份归属：     「这条记录是谁提交的」 —— 增强能力，可延迟、可人工、可 pending
```

⇒ **身份归属不得成为云缓冲架构的单点阻塞**（本任务 §一 的核心要求）。本决策正式采纳该原则。

---

## 5. 四种 WPS 接入方式比较（§九）

> 前提说明：**方案 2/3 的"普通 Record 写入"与"H5→WPS API 写入"都需要 HSE Backend 在场**（因为 `WPS_APP_SECRET` 是应用级红线，不能下发到手机浏览器）。这直接决定了它们在「电脑关机」场景下的价值。

| 维度 | **方案 1：WPS Form（表单视图）** | **方案 2：WPS 普通 Record 写入** | **方案 3：H5 → WPS API 写入** | **方案 4：H5 → WPS 官方表单入口** |
|---|---|---|---|---|
| 手机端易用性 | 中（浏览器内填写页，需适配） | 差（需 PC/客户端操作表） | 好（复用现有 H5 UI） | 中 |
| **图片上传** | ✅ 原生附件字段（JPG/PNG） | ✅ 原生附件 | ✅ 但需二段式上传（本应用面未确证） | ✅ |
| **云端缓冲（关机可用）** | ✅ **成立**——手机直连 WPS，不经本地 Backend | ✅ 成立 | ❌ **不成立**（第一跳仍经本地 Backend/应用密钥） | ✅ 成立（官方表单链接） |
| 离线电脑恢复 | ✅ 恢复后 Pull 自动拉回 | ✅ 同 | ❌ 关机即断（Backend 不可用） | ✅ 同方案 1 |
| **身份可信度** | ❌ 无（creator 不可用，见 §3） | ❌ 无 | ✅ 有（Backend 身份链，但见下一列） | ❌ 无 |
| 重复控制 | ❌ 无跨通道技术幂等（人力填写无法携带 H5 token） | ❌ 同 | ✅ 可与通道 A 共享 `client_token`（Backend 落 WPS 字段） | ❌ 同方案 1 |
| 数据结构稳定性 | ⚠️ 表单写入**原生 Attachment 字段**（当前 Pull 不映射） | ✅ 与现有映射一致 | ✅ 与现有映射一致 | ⚠️ 同方案 1 |
| API 可控性 | ❌ 表单元数据**不可观测**（`/forms` 等全 404） | ✅ 完全可控 | ✅ 完全可控 | ❌ 不可控 |
| 安全边界 | ⚠️ 分享链接即入口（需"仅企业内"+"登录后填写"） | ✅ | ⚠️ 需防密钥外泄 | ⚠️ 同方案 1 |
| **是否解决「关机不丢数」** | ✅ **是（唯一无需 Backend 的可控路径）** | ✅ 是 | ❌ **否** | ✅ 是 |

### 5.1 关键判断

1. **方案 3 不解决核心痛点**：它仍然要求本地 Backend 存活（手机不能持应用密钥）。**"手机→HSE Backend→WPS"段已实现且休眠**，但它对"电脑关机"场景**零收益**。⇒ **不作为云缓冲通道**。
2. **方案 1 与方案 4 功能等价**（形态不同），是唯一在"电脑关机"下仍能把现场数据送上云的路径。**但两者都拿不到可信身份**。
3. ⇒ **"WPS Form 是否仍有业务价值"的答案取决于业务是否接受"通道 B 记录由人工确认身份"**。技术上：**有价值（数据不丢）**；运营上：**价值大小 = 人工归属成本 vs 数据丢失成本**。
4. **不得为了"必须使用 Form"而保留 Form**（本任务 §九 明令）。本决策的立场是：**Form 是可选应急通道，不是架构必需件**；若业务侧评估人工归属成本过高，**可以只保留通道 A**，云缓冲能力降级为"WPS 侧数据副本"（仍可作为 WPS→PG 的冷备回流）。

---

## 6. 三种身份架构比较（§二）

| | **方案 A：WPS Creator 作为身份来源** | **方案 B：WPS 业务字段显式携带 employee_id / grid_id** | **方案 C：双通道身份架构** |
|---|---|---|---|
| 身份来源 | WPS Record `creator` | WPS 业务字段（`巡查人员ID` / 新增"工号"类字段） | 通道 A：H5 认证会话；通道 B：**pending** |
| 可信性 | ❌ **不可信**（单一共享账号，2066/2066） | ⚠️ **取决于写入方**： ① 由**可信 HSE Backend** 写入 → 可作为"服务端写入的身份快照"（但仍非权威）； ② 由**客户端/WPS 用户自行填写** → **不可信**（可伪造、可填错） | ✅ 通道 A 权威；通道 B 明确不产生身份 |
| 是否可自动归属 | 名义上可，**实际不可**（无区分度） | 仅在①时可"半自动"；②时**严禁**当作身份 | 通道 A 自动；通道 B **人工** |
| 与冻结层冲突 | 需改 Pull / 身份来源，**冲突** | 需新增 WPS 字段（改 WPS 结构） | ✅ **零冲突**：不动 `SYNC_PROJECTION` / `PROTECTED_COLUMNS` / Pull |
| grid 安全边界 | ❌ 可能绕过 gridScope | ❌ WPS 的 grid_id 有直接授权风险 | ✅ gridScope 为唯一授权边界 |
| 依赖未验证能力 | 是（需 per-submitter creator） | 部分（需 WPS 建列 + 写入方可信） | **否**（不依赖任何未验证 WPS 能力） |
| **结论** | **❌ 否决** | **⚠️ 有条件保留**（见下） | ✅ **推荐** |

### 6.1 方案 B 的严格界定（本任务要求明确回答）

> **"这些字段是否由可信 HSE Backend 生成，还是由客户端/WPS 用户填写？"**

**当前代码事实**：

- `wpsFieldMap.js:32` — `巡查人员ID` 定义 `pg:'-'`（**永不落 PG**），`mode:'readwrite'`，注释明确：「**只允许由后端身份上下文（`currentEmployeeContext.employeeId`）写入，前端不可覆盖**」。
- **但** 反向写入已被焊死：`REVERSE_WRITE_ENABLED = false`（"任何环境变量都无法开启"）、`POST /api/wps-grid-sync/push` 恒 **410**。⇒ 该字段**当前没有任何可信写入方**。
- 实测该列 **2063/2063 为空** ⇒ 现实中既无 Backend 写入、也无人工填写。

**裁定**：

| 情形 | 是否可作身份来源 |
|---|---|
| 由**可信 HSE Backend**在服务端身份上下文中写入，且写入路径不可被客户端伪造 | ⚠️ 可作为**身份快照**（等同于通道 A 的产物），但**仍须**经 `gridScope` 复核后才可授权 |
| 由**客户端 / WPS 用户自行填写**（表单字段、表内手填） | ❌ **绝对不可作身份来源**；最多降级为**候选线索**（见 §7 Level 2），**必须人工确认** |
| 现状（DB 全空 + 反向写关闭） | ❌ 不可用（且 `pg:'-'` 使其连 PG 都进不去） |

⇒ **方案 B 不采纳为架构基础**；仅保留其"由 Backend 写入的身份快照"这一**语义位置**，作为未来可选增强，且**永不**替代 gridScope。

---

## 7. WPS 与 PG 权威边界 + 可信等级矩阵（§六）

### 7.1 权威边界（正式定义）

| 实体 | 定位 | 说明 |
|---|---|---|
| **WPS** | **Record Buffer + Attachment Buffer**（缓冲层/副本） | **不是** Source of Truth、**不是** Business Master、**不是**身份源、**不是**权限源 |
| **PostgreSQL** | **Business Master**（业务主库）+ **唯一权威身份/授权面** | HSE 正式数据源；`grid_inspection_records` 为正式台账 |
| **身份产生点** | **H5 认证会话**（`authMiddleware` → `authenticatedEmployeeResolver`） | 唯一。WPS 侧不产生身份 |
| **授权边界** | **`gridScope`**（PG 侧 SQL，fail-closed `1=0`） | 唯一。WPS 侧任何字段不得参与授权 |

```
WPS Record ──▶ PG（inspector_employee_id/grid_id = NULL, attribution_status=pending）
                 │
                 └──▶ gridScope（PG 侧按 users.employee_id ↔ grid_areas.personnel_id）
                          │
                          └──▶ 允许 / 拒绝（1=0 fail-closed）

禁止路径：WPS grid_id / 所属网格 / 巡查人员ID ──▶ 直接认定用户拥有该网格权限  ❌
```

### 7.2 可信等级矩阵（正式输出，§六 Level 1–5）

| Level | 来源 | 可信度 | **允许的用途** | **明确禁止** |
|---|---|---|---|---|
| **L1** | **WPS Record ID**（`wps_record_id`） | 高（技术标识） | **技术同步幂等**（`UNIQUE(wps_record_id, wps_file_id)` 唯一键） | 作业务编号；与 `serial_no` 混用；`Number()` 转换（20 位精度） |
| **L2** | **WPS Record fields**（业务字段，含 `姓名`/`昵称2`/`所属岗位`/`提交时间`…） | 中（业务数据） | 业务展示、台账内容、**重复候选信号** | **默认视为可信身份**；`姓名+日期`/`姓名+行为` 自动删重；自动建 bridge |
| **L2b** | `巡查人员ID`（业务字段子类） | **低** | **无**（`pg:'-'`，连 PG 都不落） | 作身份来源；写入 `inspector_employee_id` |
| **L3** | **WPS `creator` / `last_modified_by`** | **不可用** | **仅可记录**（用于审计/统计） | 正式身份归属；自动认领 employee；驱动 attributed |
| **L4** | **WPS Attachment** | 条件可信 | **经安全解析后**作为**图片候选**（写 `image_content` 等镜像列） | 伪造 URL；把 `uploadId` 当 URL；阻塞 Record Pull |
| **L5** | **PG authenticated identity**（`req.user` → `users.employee_id` → `employee.id`，经 `authenticatedEmployeeResolver` + `gridScope`） | **最高（权威）** | **唯一**可写 `inspector_employee_id` / 派生 `grid_id` 的来源 | 客户端覆盖；姓名兜底；WPS 反向注入 |

> ⚠️ **跨级规则**：**任何低可信级来源，都不得单独跨越到 L5 的授权结论**。低级别只能产生"候选"，升级必须经 L5 路径或**人工显式确认**。

---

## 8. Grid 安全边界（§四）

**结论：全部保持，并正式写入决策基线。**

| 检查项 | 现状（代码事实） | 决策 |
|---|---|---|
| `grid_id` 来源 | **仅** PG 侧 `gridScope.deriveGridIdForEmployee()`（0→`no_grid` / 1→`ok` / >1→`multiple`） | ✅ 唯一来源，保持 |
| WPS 的 `grid_id` / `所属网格` / `巡查人员ID` | `所属网格` 为 `reserved`（WPS 侧，`pg:'-'`）；`grid_id` 在 `PROTECTED_COLUMNS` 中于 Pull 归一化时被 `delete` | ✅ **永不进入 PG、永不参与授权** |
| 授权边界 | `gridScope.buildScopeSqlCondition()`：`own_grid` → `grid_id IN (SELECT id FROM grid_areas WHERE personnel_id=$n AND is_deleted=false)`；无网格/未知角色 → `1 = 0` | ✅ **PG gridScope = 最终授权边界**（fail-closed） |
| 通道 A 创建时 | `site-mgmt.js` POST：`no_grid → 403 NO_GRID_FOR_EMPLOYEE`；`multiple → 409 MULTIPLE_GRIDS_FOR_EMPLOYEE`（禁猜测） | ✅ 保持 |
| 通道 B 记录 | `grid_id` 恒 NULL（Pull 不写）→ 在 `own_grid` 视角下**永不可见**（NULL 不匹配 `IN` 子查询） | ⚠️ **已知后果**：通道 B 记录对网格长不可见，直到被归属。**这是 fail-closed 的正确表现**，不是 bug |

**必须保持的红线**：`WPS grid_id → 直接认定用户拥有该网格权限` **禁止出现**；归属（`grid_id` 写入）**只能**由 PG 侧 `deriveGridIdForEmployee` 在精确 1 个 live grid 时完成，且**只补 NULL、永不覆盖**（`applyEnrichment` 的 `AND inspector_employee_id IS NULL AND grid_id IS NULL` 守卫须保留）。

---

## 9. Attachment 解耦方案（§七）

**结论：Attachment 不作为当前主阻塞项；「Record 已入 PG」与「图片已解析」必须独立状态化。**

### 9.1 现状事实

| 事实 | 证据 |
|---|---|
| WPS Attachment→URL 端点在本应用面**不可用** | `POST /api/v1/openapi/dbt/{file}/attachment/urls` 实测 **HTTP 404**（DBT v1 面，与 V7 coop 域不同） |
| 原生 Attachment 列**板上存在**（J/K/L/Q）但**不在 `FIELD_MAP`** | `getSchema` 实测 → Pull **从不摄入** |
| 系统实际使用的是**链接镜像列**（`三违照片链接` / `整改后照片链接` / `示意图链接`，`MultiLineText`） | `wpsFieldMap.js:70-72`，`type:'link'` |
| 现有判定 | `resolveAttachmentStatus()`：PG 已有合法 `http(s)` URL 镜像 → `resolved`；否则 `pending` |

### 9.2 解耦设计（判定：**可以且应当独立状态化**）

```
DATA_RECEIVED（记录已入 PG）           ← 与图片无关，恒可达成
        ‖（独立）
DATA_PENDING_ATTACHMENT（图片未解析）  ← 允许长期 pending
DATA_READY（图片已解析）               ← 终态之一
```

| 原则 | 规定 |
|---|---|
| 允许 `attachment_resolution_status = pending` | ✅ 且为**默认值** |
| 禁止伪造 URL | ✅ 明文禁止（不得把 `uploadId`/`fileName` 当 URL） |
| 禁止阻塞 Record Pull | ✅ Record 入库与图片解析**无依赖** |
| 不得把 Attachment 当主阻塞项 | ✅ 本决策正式降级为**非阻塞增强项** |
| 图片列由谁写 | **只有**合法 `http(s)` URL 才可落 `image_content`/`rectified_photo`/`schematic`（`SYNC_URL_COLUMNS` 约束保持） |

**⚠️ 设计缺口（本次审计发现，仅提出，不实施）**：当前 `resolveAttachmentStatus()` 只有 `pending|resolved` 两态，**无"本条记录本来就没有图片"的表达**。若"有图才 ready"，则**无图记录将永久停在 pending**，`DATA_READY` 永不可达。⇒ §15 提出 `not_applicable` 扩展（**本阶段不 migration**）。

---

## 10. 双通道重复控制（§五）

### 10.1 问题定义

同一次现场业务，可能经两条通道各产生一条 PG 记录：

```
通道 A：Mobile → Backend → PG        （有身份、无 client_token——现状 H5 不生成）
通道 B：Mobile → WPS → Pull → PG     （无身份、无 token）
```

### 10.2 五个问题（§五 1–5）的严格回答

| 问题 | 回答 |
|---|---|
| **1. `client_token` 是否仍值得保留？** | **保留，但须正名**。它是**通道内技术幂等键**，不是跨通道去重键。**现状事实**：全仓无任何生产路径生成 `client_token`（H5 POST 的 `cols` 列表里没有它）⇒ 部分唯一索引 `uq_grid_inspection_records_client_token_notnull` **当前是惰性的**。保留理由：一旦未来 H5 生成并由服务端落库，即可用**数据库约束**（而非应用逻辑）挡住"同一次业务提交两条记录"（这是 `wps_record_id` 唯一键**做不到**的，因为它由 WPS 服务端生成、客户端不可指定） |
| **2. `submission_fingerprint` 是否只能作为"重复候选"？** | ✅ **只能作为候选**。现有实现已正确：`detectDuplicateCandidate()` 命中即 `isCandidate=true`，`action` **恒为 `candidate_only`**，**绝不删除/拒绝/覆盖/合并**。必须永久保持 |
| **3. 是否应要求 H5 生成 `client_token` 且 WPS 云缓冲携带同一 `client_token`？** | ⚠️ **仅在「方案 3：H5→WPS API 写入」下可行**（Backend 在写 WPS 时可把同一 token 落进 WPS 字段）。**在「方案 1/4：WPS 表单」下不可行**——人工填写的表单无法携带 H5 侧 token（表单元数据不可观测、无隐藏字段可靠通道、`/forms` 全 404）。 |
| **4. 若 WPS 无法可信携带 `client_token`，如何处理双通道重复？** | **降级为「业务重复候选 + 人工裁决」**：`submission_fingerprint` / `sync_map.business_fingerprint` 标记候选 → 输出**人工复核清单** → **人工**决定保留哪条、删哪条。**不得自动删除** |
| **5. 是否允许用姓名+日期 / 姓名+行为等弱字段自动删记录？** | ❌ **明文禁止**。`姓名` 为 L2 业务字段（可伪造/可重名，实测 61 个姓名 / 2063 条记录），不得参与任何自动化归属或删除决策 |

### 10.3 正式两层模型（必须形成）

| 层 | 键 | 语义 | 行为 | 现状 |
|---|---|---|---|---|
| **第 1 层：technical idempotency** | `UNIQUE(wps_record_id, wps_file_id)` | "同一条 WPS 记录不被重复拉取" | **自动**（幂等，零 DML） | ✅ 已存在且生产验证（05-H-0） |
| | `UNIQUE(client_token) WHERE client_token IS NOT NULL`（部分唯一） | "同一次业务提交不被创建两次" | **自动拒绝/去重**（一旦有生成方） | ⚠️ 已建索引，**但无生成方 ⇒ 惰性** |
| **第 2 层：business duplicate candidate** | `submission_fingerprint`（PG 侧）/ `business_fingerprint`（sync_map 侧） | "这两条**可能**是同一次业务" | **仅标记候选**，产出人工复核清单，**永不自动处置** | ✅ 已建（`candidate_only`），且**当前恒为 NULL**（前置字段不全时禁算） |

> ⚠️ **跨通道技术幂等不可达**（除非走方案 3，而方案 3 不解决关机场景）。这是**架构性事实**，必须被业务接受，不能靠"更聪明的匹配算法"绕过。

---

## 11. `client_token` 是否保留

**保留（`KEEP`）**，定位修正为 **"通道内技术幂等键"**。

| 项 | 结论 |
|---|---|
| 是否删除 | ❌ 不删（列 + 部分唯一索引均保留） |
| 是否当前生效 | ❌ 否——**无任何生产代码生成它**（`site-mgmt.js` POST 的 `cols` 无此项），索引惰性 |
| 未来启用条件 | 须由**通道 A 的 H5/Backend**在创建时生成（UUID，服务端落库）；`site-mgmt.js` 为**冻结文件**⇒ 启用须独立授权 + 走冻结例外流程 |
| 是否可用于通道 B | ❌ **否**（表单通道无法可信携带，见 §10.2-3/4） |
| 与 `source_channel` 的关系 | `resolveSourceChannel()` 目前以"`client_token` 非空"作为 `mobile_h5` 的**唯一可靠证据**——**逻辑自洽但当前恒为 null**。须保留该保守语义（宁可 unknown，不得凭 `wps_record_id` 推断 `wps_form`） |

---

## 12. `submission_fingerprint` 是否保留

**保留（`KEEP`）**，定位严格限定为 **"业务重复候选信号"**。

| 项 | 结论 |
|---|---|
| 是否自动删重 | ❌ **永不允许**（`action` 恒 `candidate_only`） |
| 计算前置 | 要求 `inspector_employee_id` + `inspection_date` + `area_team` + `violation_behavior` + `violator_name` 全部非空；**缺一即 NULL**（禁猜） |
| 是否用姓名代替 employee_id | ❌ 明文禁止（`computeSubmissionFingerprint` 注释已固化该红线） |
| 通道 B 记录的问题 | 通道 B 记录 `inspector_employee_id` 恒 NULL ⇒ **指纹恒 NULL** ⇒ 通道 B 记录**当前无法进入候选池**。这是 fail-closed 的必然结果，**须如实记录**（不是 bug） |
| `sync_map.business_fingerprint` | 保留（结构位），**Pull 引擎为冻结文件**⇒ 现无写入方，属预留 |

---

## 13. `source_channel` 判定规则

**正式规则（保持现有保守口径，禁止放宽）**：

| 取值 | 判定条件 | 说明 |
|---|---|---|
| `mobile_h5` | **存在可靠通道 A 证据**：`client_token` 非空 | 唯一可自动判定的取值 |
| `wps_form` | ⛔ **禁止自动判定** | "经过 WPS" ≠ "来自 WPS 表单"。仅凭 `wps_record_id IS NOT NULL` 推断是**错误推断**，明文禁止 |
| `unknown` / `NULL` | 其余全部情形（含**现状**：通道 B 记录、无 token 的通道 A 记录） | **保持 NULL 优于猜测** |

**配套要求**：
- **不得**批量回填 2061 条历史记录的 `source_channel`（历史来源不可追溯）。
- 若未来需区分通道 B，**唯一合规路径**是取得**通道 B 专属的可信证据**（例如由 WPS 表单写入的、且由人工确认过的来源标记字段）——**不得**以时间、extraction 顺序、creator 值等间接特征代替。

---

## 14. `attribution_status` 状态机

### 14.1 设计要求（§十一）

```
DATA_RECEIVED → DATA_PENDING_ATTRIBUTION → DATA_ATTRIBUTED
                        │
                        └──（不可自动越级）
```

### 14.2 现有字段能否表达？（先判断，后提方案）

| 需要的状态 | 现有 `attribution_status` 能否表达 | 说明 |
|---|---|---|
| `DATA_RECEIVED` | ✅ **可表达**（隐式） | 行存在于 `grid_inspection_records` 即"已接收"，无需额外列 |
| `DATA_PENDING_ATTRIBUTION` | ✅ 可表达 | `attribution_status = 'pending'`（默认） |
| `DATA_ATTRIBUTED` | ✅ 可表达 | `attribution_status = 'attributed'` |
| **人工确认归属** | ❌ **不可表达** | 现只有 `pending|attributed`，**无法区分"系统派生"与"人工确认"** |
| **归属冲突 / 被否决** | ❌ 不可表达 | 无 `conflict` / `rejected` |
| **无需归属**（如运营/测试记录） | ❌ 不可表达 | 无 `not_required` |

### 14.3 提出方案（**仅设计，本阶段不 migration**）

> **不新增 DB 列**，仅扩展 `attribution_status` 的**枚举取值**（VARCHAR，无 CHECK 约束 ⇒ 可平滑扩展）；细粒度原因继续由 `IDENTITY_STATE`（`gridEnrichmentService.js` 内，**仅决策不入库**）承载。

| 状态 | 语义 | 可写 `inspector_employee_id` / `grid_id`？ |
|---|---|---|
| `pending` | 未归属（默认；含 `PENDING_CREATOR / PENDING_BRIDGE / PENDING_EMPLOYEE / PENDING_GRID`） | ❌ 否 |
| `attributed` | **系统派生**归属成功（通道 A 身份链，或人工核验过的 bridge + 唯一 live grid） | ✅ 是（仅补 NULL） |
| `manual_confirmed`（**新增**） | **人工确认**归属（管理员/后台认领），来源须留审计痕迹 | ✅ 是（仅补 NULL） |
| `untrusted`（**新增**） | 存在身份线索但已被判为不可信（如 `creator` 共享账号） | ❌ 否 |
| `rejected`（**新增**） | 人工明确否决归属（如误报/非本网格） | ❌ 否 |
| `not_required`（**新增**） | 无需归属（运营/测试/非巡查来源） | ❌ 否 |

**红线**：
- **绝不新增 `failed`**——在没有可信来源的世界里，"失败"是不可判定的（保持 P2-B1-B 的既有判断）。
- **`attributed` 的前置永不变**：必须经 `gridScope` 求得的**精确 1 个 live grid**（`ok`），且**仅补 NULL、永不覆盖**。
- `source_channel` / `attribution_status` / `attachment_resolution_status` 三者**相互独立**，不得互相推断。

---

## 15. `attachment_resolution_status` 状态机

### 15.1 现有字段能否表达？

| 需要的状态 | 现有 | 说明 |
|---|---|---|
| `DATA_PENDING_ATTACHMENT` | ✅ `pending` | 默认 |
| 图片已解析 | ✅ `resolved` | PG 已有合法 `http(s)` 镜像 |
| **本条记录不含图片** | ❌ **不可表达** | ⚠️ **真实缺口**：无图记录会永久 `pending` ⇒ `DATA_READY` 不可达 |
| **解析失败（端点不可用等）** | ❌ 不可表达 | 与"尚未解析"混同 |
| **无附件需求（豁免）** | ❌ 不可表达 | 同上 |

### 15.2 提出方案（**仅设计，本阶段不 migration**）

| 状态 | 语义 |
|---|---|
| `pending` | 尚未尝试/尚未解析（默认；含"端点 404 不可用"） |
| `resolved` | 已获得合法 `http(s)` URL 并落镜像列 |
| `not_applicable`（**新增**） | **该记录本就不含任何图片字段** ⇒ 不阻塞 `DATA_READY` |
| `skipped`（**新增**） | 明确豁免解析（如纯文本记录、测试数据） |
| `failed`（**允许新增**，与 attribution 不同） | 已尝试且**确定性失败**（如 URL 非法、下载 4xx）——附件解析的失败**是**可判定的 |

**红线**：
- **绝不伪造 URL**；**绝不**把 `uploadId`/`fileName`/Attachment ID 当 URL。
- **`pending` 不得阻塞 Record Pull**（现状正确，保持）。
- 无图记录**不得**因 `pending` 而永远无法进入 `DATA_READY`。

---

## 16. 推荐正式架构（RECOMMENDED ARCHITECTURE）

```
┌──────────────────────── 通道 A（主通道 · 唯一可信身份） ────────────────────────┐
│  Mobile H5 ──▶ HSE Backend(5876) ──▶ PG(grid_inspection_records)              │
│     身份：authMiddleware → authenticatedEmployeeResolver（L5）                │
│     grid：deriveGridIdForEmployee（唯一 live grid，0→403 / >1→409）           │
│     client_token：由 H5/Backend 生成 → 技术幂等                               │
│     source_channel = 'mobile_h5'                                              │
└───────────────────────────────────────────────────────────────────────────────┘
┌────────────────── 通道 B（应急缓冲 · 不产生身份） ────────────────────────────┐
│  Mobile ──▶ WPS（Form / 记录）──▶ Pull Engine(每15min, 幂等) ──▶ PG          │
│     身份：inspector_employee_id = NULL，grid_id = NULL                       │
│     attribution_status = 'pending'（恒）                                     │
│     attachment_resolution_status = 'pending' | 'not_applicable'              │
│     source_channel = NULL（禁止推断 wps_form）                                │
└───────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
      PG = Business Master ＝ 唯一权威数据 + 身份 + 授权面
      gridScope = 最终授权边界（fail-closed 1=0）
      人工/后台归属（manual_confirmed）＝ 通道 B 唯一的身份闭合路径
```

### 16.1 十三问逐条回答（§十）

| # | 问题 | 答案 |
|---|---|---|
| 1 | **WPS 到底是什么？** | **Record Buffer + Attachment Buffer**（缓冲层/副本）。**不是** Source、**不是** Business Master、**不是** Attachment Store（图片正式存储仍在 PG 镜像列 + 本机 `/uploads`，且该点本身是待解技术债） |
| 2 | **PG 到底是什么？** | **Business Master**（业务主库）+ 唯一权威身份/授权面 |
| 3 | **身份在哪里产生？** | **H5 authenticated session**（`req.user.id → users.employee_id → employee.id`，经 `authenticatedEmployeeResolver`）。**不是** WPS |
| 4 | **WPS Creator 是否正式使用？** | **否**。正式判定 `SEMANTICS_UNVERIFIED` / 不可用；`UNTRUSTED` 分支常驻 |
| 5 | **WPS `巡查人员ID` 是否正式使用？** | **否**。`UNTRUSTED_BUSINESS_FIELD`（`pg:'-'` 不落 PG；实测 2063/2063 空） |
| 6 | **`grid_id` 谁产生？** | **仅** PG 侧 `gridScope.deriveGridIdForEmployee()`（精确 1 个 live grid）；WPS 侧永不作来源 |
| 7 | **`inspector_employee_id` 谁产生？** | **仅** L5 身份链（通道 A 自动；通道 B 由**人工确认**后写）。WPS 永不作来源 |
| 8 | **`attribution_status` 有哪些状态？** | **现状**：`pending` / `attributed`（+ 决策建议新增 `manual_confirmed` / `untrusted` / `rejected` / `not_required`，见 §14） |
| 9 | **`attachment_resolution_status` 有哪些状态？** | **现状**：`pending` / `resolved`（+ 建议新增 `not_applicable` / `skipped` / `failed`，见 §15） |
| 10 | **`source_channel` 如何判定？** | **仅**当 `client_token` 非空 → `mobile_h5`；**禁止**由 `wps_record_id` 推断 `wps_form`；其余保持 NULL/unknown（见 §13） |
| 11 | **`client_token` 是否保留？** | **保留**，正名为通道内技术幂等键；当前无生成方（惰性），启用须走冻结例外（见 §11） |
| 12 | **`submission_fingerprint` 是否保留？** | **保留**，严格限定为业务重复**候选**信号；永不自动删重（见 §12） |
| 13 | **duplicate candidate 是否自动处理？** | **否，永不自动**。仅产出人工复核清单（见 §10.3） |

### 16.2 本推荐架构的成立条件（诚实声明）

| # | 条件 | 性质 |
|---|---|---|
| C1 | 业务**接受**"通道 B 记录需人工确认身份" | **业务决策**（非技术） |
| C2 | 通道 B 的**表单写入不得**改变正式 WPS 表结构（否则触碰 05-H-0 冻结语义） | 架构约束 |
| C3 | Attachment 长期 `pending` 可被接受（图片晚到或不到） | 业务容忍度 |
| C4 | **通道 B 的 `DATA_READY` 需要 `not_applicable` 语义**（否则无图记录永不 ready） | 设计前置（见 §15） |

> **若 C1 不成立**（业务要求"通道 B 全自动归属"）⇒ **本推荐架构不成立**，状态应降级为 `NEEDS_REVIEW`，因为**当前不存在任何可信的自动化身份路径**。**绝不允许**为了满足 C1 而把 WPS Creator 假设为可信身份。

---

## 17. 不推荐方案及原因

| 方案 | 不推荐原因（证据） |
|---|---|
| **A. 以 WPS Creator 作身份源** | 2066/2066 单账号 vs 61 姓名；`creator≡last_modified_by`；单一批量写入窗口 ⇒ 共享/应用账号，**零区分度**。且无 Form、无新增提交 ⇒ 连"能否 per-submitter"都无法验证（`BLOCKED`） |
| **B′. 以客户端/表单自填字段作身份源** | 可伪造、可填错；`巡查人员ID` 实测全空且 `pg:'-'`；不得"把客户端填写字段直接当作可信身份"（本任务 §二 明令） |
| **在 WPS 侧做行级权限** | WPS 无行级权限模型；`site-mgmt.js` 的 WPS 分支提前 return（`WPS_ROW_SCOPE_DEFERRED`）；**授权边界只能在 PG/gridScope** |
| **方案 3（H5→WPS API）作为云缓冲通道** | 第一跳仍需本地 Backend + 应用级密钥 ⇒ **对"电脑关机"场景零收益**（不解决核心痛点） |
| **修改 Pull Engine 以接入身份/附件** | Pull Engine 为 **05-H-0 冻结组件**；且 `PROTECTED_COLUMNS`/`SYNC_HASH_COLUMNS`/`canonicalHash` 为 2061 条历史哈希口径的字节级兼容基线，改动会引发存量误判"已变更"。⇒ **零改动，靠独立平级组件**（现有 `gridEnrichmentService` 思路正确，保留） |
| **增强 WPS 附件 URL 能力绕过** | DBT v1 `attachment/urls` 在本应用面 **404**；跨 API 面授权为 `NEEDS_EXTERNAL_CONFIRMATION`。⇒ 不得作为架构前提 |
| **自动删重（弱字段匹配 / 自动 merge）** | 姓名 61 个值、重名风险、可伪造；明文禁止（§五/§十二） |
| **把身份问题当作云缓冲的前置阻塞** | 与业务真实目标（数据不丢）无关；且冻结架构**本就**假定身份不来自 WPS。⇒ 架构性错误优先级排序 |

---

## 18. P2-B1-D 是否仍然必要

> **歧义澄清**：既往文档对 P2-B1-D 有两种用法——① `P2-B1-B 报告 §22` 定义为**「Attachment 真实解析」**；② 部分任务清单写作「P2-B1-D / Attachment」并列。本审计按 ① 认定。

| 判断 | 结论 |
|---|---|
| **P2-B1-D（Attachment 真实解析）是否仍必要？** | **降级：不是必要项，是可选增强项**。理由：① 附件已被证明**不阻塞**主链（`pending` 可长期存在，Record 照常入 PG）；② 其前置为**跨 API 面授权**（DBT v1 `attachment/urls` 在本应用 404），属**外部依赖**，非内部可实现项；③ 正式图片路径当前是**链接镜像列**（已有可用方案），并非必需改造 |
| **若 P2-B1-D 的原意是「Creator 身份桥接正式启用」** | ⛔ **不再必要，应予取消或重新定义**——其前提（per-submitter creator）已被证否 |
| 建议动作 | **重新定义 P2-B1-D 的范围**为："在取得跨面授权的前提下，评估 Attachment URL 解析；否则保持 `pending`"。**在授权到位前不得启动**。⚠️ 本项建议与 P2-B1-D 的精确定义**须人工确认**后才能拍板 |

---

## 19. P2-C（真实链路验证）是否可以进入

| 项 | 判断 |
|---|---|
| 定义（据 P2-A 路线图） | 真实链路验证（`ARCH-03-P2-C 真实链路验证 NOT_STARTED`） |
| **是否可以进入** | ⚠️ **有条件可以**（**须人工授权**，本阶段不自动进入） |
| 进入的前置条件 | ① **通道 A** 的真机链路验证（用隔离库 5882 + 隔离前端 5175）——**不依赖任何 WPS 未验证能力**，**可以立即做**；② **通道 B** 的真机验证需要「独立临时 WPS 文件 + 表单视图 + 两名真实用户提交」这一**人工前置**（与 P2-B1-C-EXT 的解除条件相同） |
| 建议拆分 | **P2-C-A（通道 A 真实链路验证）** —— 无外部依赖，可先做；**P2-C-B（通道 B 云缓冲验证）** —— 需人工前置 + 独立授权 |
| 风险 | 若在通道 B 未验证的情况下宣称"云缓冲可用"，即**证据不足的推进**，不可接受 |

---

## 20. P2-D（正式切换）是否可以进入

| 项 | 判断 |
|---|---|
| 定义 | `ARCH-03-P2-D 正式切换 NOT_STARTED`（把 WPS 云缓冲通道正式启用/切换） |
| **是否可以进入** | ⛔ **不可以**（现在进入即为无证据推进） |
| 阻塞项 | ① 通道 B 的真实性从未被验证（无 Form、无人工提交样本 —— `P2-B1-C-EXT` = `BLOCKED`）；② `client_token` 无生成方 ⇒ 幂等链未闭合（且 `site-mgmt.js` 为冻结文件）；③ 人工归属流程**尚无**任何运营方案/界面/审计痕迹设计；④ **生产写入永久禁止由本 AI 执行** |
| 前置最低门槛 | ① 通道 B 真机验证通过（§19 P2-C-B）；② 业务侧书面接受"人工归属"（§16.2 C1）；③ 独立的冻结例外授权（若需碰 `site-mgmt.js` / Pull 周边） |

---

## 21. 后续最小实现顺序（建议，须逐项独立授权）

| 顺序 | 事项 | 依赖 | 是否触碰生产/冻结 |
|---|---|---|---|
| 1 | **人工归属流程设计**（`manual_confirmed` 状态 + 审计痕迹 + 待归属清单只读接口） | **无**（纯设计） | 否 |
| 2 | **`attribution_status` / `attachment_resolution_status` 枚举扩展**（`manual_confirmed` / `untrusted` / `rejected` / `not_required` / `not_applicable` / `skipped` / `failed`） | 步骤 1 | ⚠️ 仅**dev 库**（须受护栏 runner） |
| 3 | **通道 A `client_token` 生成**（H5/Backend 落库） | 需**冻结例外授权**（`site-mgmt.js`） | ⚠️ 生 产 相 关 |
| 4 | **P2-C-A：通道 A 真实链路验证**（隔离库 + 隔离前端 + E2E） | 无 | 否（隔离环境） |
| 5 | **P2-C-B：通道 B 云缓冲验证** | **人工前置**：独立临时 WPS 文件 + 表单 + 两名真实用户 | 否（临时文件） |
| 6 | **Attachment 解析评估（原 P2-B1-D）** | 跨 API 面授权到位 | 否 |
| 7 | **常驻 enrichment worker**（cursor + 幂等 + 失败隔离，替代手动 `--ids`） | 步骤 2 | ⚠️ 须独立授权 |

> **顺序原则**：**先做不依赖任何未验证外部能力的事**（身份流程设计、状态语义、通道 A 验证），把外部依赖项（WPS 表单、Attachment 授权）放到最后。

---

## 22. 风险与未验证项（必须明示缺口）

### 22.1 未验证项（UNVERIFIED）

| # | 项 | 影响 | 处置 |
|---|---|---|---|
| U1 | **WPS Form 是否真的能产生 per-submitter creator** | 决定"通道 B 能否自动归属"（当前倾向：**不能**） | `BLOCKED`，需人工双用户受控提交 |
| U2 | **本应用能否访问独立临时 WPS 文件**（协作者授权） | 决定 U1 的验证可行性 | 需人工在 WPS 侧操作 |
| U3 | **Attachment URL 跨 API 面授权**（DBT v1） | 决定图片能否自动解析 | `NEEDS_EXTERNAL_CONFIRMATION`；本应用面 404 |
| U4 | **WPS 表单元数据可观测性**（`/forms`、`/views`、`/fields` 全 404） | 无法从 API 侧判定/管理表单 | 接受现状，仅作通道 B 运维注意事项 |
| U5 | **通道 B 记录被 Pull 后对 `own_grid` 用户不可见**（`grid_id` 恒 NULL） | 影响"提交者能否立刻看到自己的记录" | 已确认为 fail-closed 的正确行为；若业务要求可见，须先归属（人工） |
| U6 | **P2-B1-D 的精确定义** | 影响 §18 结论的适用性 | ⚠️ **须人工确认** |
| U7 | **人工归属的运营可承受性**（何种量级需人工） | 决定通道 B 的**业务**价值（非技术可行性） | ⚠️ **业务侧确认**（§16.2 C1） |

### 22.2 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 把 WPS Creator 误当身份（后续会话重犯） | **高** | 本文档 §3 正式禁用 + `IDENTITY_STATE.UNTRUSTED` 常驻 + 技能/MEMORY 已更正 |
| 把 `client_token` 惰性误读为"幂等已生效" | **中** | §11 明示"无生成方"；启用前不得宣称具备跨通道去重 |
| 基于 `Fingerprint` 自动删重 | **高** | §12 明文永久禁止（`candidate_only`） |
| 无图记录永久停在 `pending` ⇒ 永不 `DATA_READY` | **中** | §15 提出 `not_applicable`（设计，未实施） |
| 通道 B 长期无人工归属 ⇒ 数据在 PG 中"存在但不可用" | **中** | §21 步骤 1（人工归属流程）优先 |
| 误改冻结层（Pull/FieldMap/哈希口径） | **高** | 全链零改动原则；`PROTECTED_COLUMNS`/18 列哈希口径不可动 |

### 22.3 证据边界声明

- 本决策的 WPS 侧证据来自**只读** `getSchema` + `list_by_page`（全量 2066 条；`sheetId=3` → 2063、`sheetId=1` → 3、`sheetId=2` → 400 `E_DBSHEET_SHEET_NOT_FOUND`）。
- PG 侧证据来自**只读 SELECT**（dev 库结构预检 + 生产基线）。
- **未使用**姓名/昵称/手机号/realName 做任何推断或匹配。
- 本阶段**未**修改任何代码、DB、`.env`、Scheduler、WPS 数据。

---

## 23. 生产基线确认（§九，本次复核）

| 项 | 要求 | 实测（2026-09-12 23:1x） | 判定 |
|---|---|---|---|
| database | `safety_dashboard` | `safety_dashboard` | PASS |
| `grid_inspection_records` | 2061 | **2061** | PASS |
| `grid_record_sync_map` | 2061 | **2061** | PASS |
| `MAX(gir.id)` | 7192 | **7192** | PASS |
| conflict | 0 | **0** | PASS |
| gir 列数 | 28 | **28** | PASS |
| gir 是否含 P2-B0 新列 | 无 | `[]` | PASS |
| `.env` 未修改 | — | mtime `2026-09-11 22:22:50 +0800`（早于本阶段） | PASS |
| `WPS_GRID_DATA_SOURCE` | `false` | `false` | PASS |
| `WPS_GRID_SYNC` | `true` | `true` | PASS |
| `SCHEDULER_ENABLED` | `true` | `true` | PASS |
| 5876 / PID | 23396，未启停 | `0.0.0.0:5876` + `[::]:5876` LISTENING，PID **23396** | PASS |

**dev 库（`safety_dashboard_dev`，只读预检 `RESULT: PASS`）**：gir 列数 **33**（28+5）、`sync_map` 含 `business_fingerprint`（12 列）、桥接表 `wps_account_employee_map` **存在且 0 行**、3 个索引齐备（`uq_grid_inspection_records_client_token_notnull` / `idx_grid_inspection_records_submission_fingerprint` / `idx_grid_record_sync_map_business_fingerprint`）。

**本阶段未执行任何生产 DML / migration / WPS 写。**

---

## 24. 05-H-0 冻结确认

| 项 | 状态 |
|---|---|
| 冻结声明 | `docs/WPS-PG-SYNC-05-FREEZE.md`（冻结时点 2026-09-12 12:17，**STRICT READ-ONLY FREEZE**） |
| 正式架构（不可逆） | `WPS → One-way Pull(15min, 幂等) → PostgreSQL → HSE` ✅ 未被本决策挑战 |
| 语义边界 | `WPS ≠ 权限源 / ≠ 正式身份源 / ≠ grid_id 来源 / ≠ inspector_employee_id 来源`；`WPS DELETE ≠ PG DELETE`；`PG ≠ 自动反写 WPS（reverseWriteEnabled=false, /push 恒 410）` ✅ **全部与本文档一致** |
| 冻结组件 | `wpsGridPullEngine.js` / `wps/wpsFieldMap.js` / `wps/gridInspectionRepository.js` / `authenticatedEmployeeResolver.js` / `gridScope.js` / `routes/site-mgmt.js` / `app.js` / `wpsGridSyncScheduler.js` —— **本阶段全部 NONE_MODIFIED**（只读引用） |
| 三闸 | `WPS_GRID_DATA_SOURCE=false / WPS_GRID_SYNC=true / SCHEDULER_ENABLED=true` ✅ 未变 |
| 安全开关 | `reverseWriteEnabled=false` / `deleteSyncEnabled=false` / `exclusions=[BT,EA]` / `hashScopeColumns=18` ✅ 未变 |

> **关键确认**：本推荐架构（方案 C）**与 05-H-0 冻结语义完全兼容**——它**不要求**解冻任何组件，**不要求**改 Pull，**不要求**改哈希口径，**不要求**改 WPS 表结构。它所做的只是把冻结层"身份恒 NULL"的既有行为，**显式化**为一个可运营的延迟归属流程。

---

## 最终状态

# `ARCHITECTURE_DECISION_READY`

**理由**：推荐的**方案 C** 不依赖任何未验证的 WPS 外部能力，且其可行性**已由 05-H-0 生产冻结事实背书**（身份恒 NULL 的 Pull 路径已稳定运行，2061 条、conflict=0）。因此"WPS 作数据云缓冲层、身份延迟归属"这一架构决策**证据充分、可以拍板**。

**但必须同时承接以下明示缺口（见 §22，不影响本决策成立，影响后续实施）**：

- **U1/U2**：通道 B 的 per-submitter creator **未验证且倾向为否** ⇒ 通道 B 归属**只能人工**；
- **U6**：P2-B1-D 的精确定义**须人工确认**（§18 结论以其为 Attachment 解析为前提）；
- **U7 / §16.2 C1**：业务是否接受"人工归属"是**业务决策**；**若业务要求通道 B 全自动归属，则本决策失效，状态应降级为 `NEEDS_REVIEW`**；
- **U3**：Attachment URL 跨面授权未到位 ⇒ 图片能力维持 `pending`，不阻塞主链。

**绝不允许**为了推进项目而自行假设 WPS Creator 是可信身份——本文档已将其正式禁用（§3.2）。

---

## 停止条件

本阶段为 **READ-ONLY ARCHITECTURE DECISION**。文档产出后**立即停止**：

- 未继续实现；
- **未自动进入下一 Sprint**（未进入 P2-B1-D / P2-C / P2-D / Attachment / Resident Enrichment）；
- 等待**人工审核架构决策**。

**本阶段执行确认**：未修改 WPS 正式文件 / 未创建 WPS Form / 未调用 WPS create·update·delete / 未执行 PG DML / 未 migration / 未改 `.env` / 未改 scheduler / 未改 Pull Engine / 未改 Mobile H5 / 未改 auth·JWT·users / 未改 gridScope / 未改 05-H-0 冻结文件 / 未建立真实 `wps_account_employee_map` / 未认领 creator / 未姓名·手机号·realName 匹配 / 未自动删除 duplicate / 未新增 npm 依赖。
