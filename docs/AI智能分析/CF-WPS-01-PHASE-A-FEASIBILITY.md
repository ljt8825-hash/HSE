# CF-WPS-01 · Phase A 可行性验证报告

> 阶段：Phase A（架构与身份验证可行性）
> 性质：**只读审计 + 可行性验证**，禁止任何代码/数据库/WPS 写入
> 继承基线：`docs/AI智能分析/MOBILE-WPS-V1-SCOPE-REBASELINE-01.md`
> 本阶段产物：`_cf_audit/*.cjs`（只读探针）、本报告
> 执行纪律复核：0 业务代码修改、0 DB 写入、0 WPS 写入、0 既有 WPS-PG-SYNC 修改

---

## 一、执行摘要

Phase A 的目标不是开发，而是确认「手机 → Cloudflare Pages → Worker → WPS → 现有 WPS-PG-SYNC → PostgreSQL → 网格长巡查台账」这条链路在**架构层面是否可行**。

| 验证项 | 结论 | 关键依据 |
|---|---|---|
| **P-02 写入目标（WPS→PG 同步链）** | ✅ **PASS** | file_id/sheet_id 实测一致；`grid_inspection_records` 列齐全；`grid_record_sync_map` 幂等唯一约束存在；2061 存量记录已实证 |
| **P-01 WPS 用户身份验证** | ⚠️ **CONDITIONAL** | 身份解析机制已存在，但桥接表为空、OAuth 未在本地可测、WPS OAuth 身份字段与 `wps_account_id` 关系未验证 |
| **三违字典来源** | ⚠️ **CONDITIONAL** | 字典表权威存在，但 PC 字典接口对 `grid_inspector` 返回 403；需经 WPS 镜像（新增只读 WPS 源） |
| **照片能力** | ⚠️ **CONDITIONAL** | WPS 多维表 **Attachment 字段确实存在**；但 PG URL 镜像端点历史实测 404，需确认附件 URL 取法 |
| **Cloudflare Pages / Worker** | ❌ NO | 尚未构建（属 Phase B/C，按纪律本阶段不做） |
| **端到端闭环** | ❌ NO | 需 Phase B–E 完成后方可验证 |

**Phase A 总体状态：`CF_WPS_01_STATUS = CONDITIONAL_PASS`** —— 核心写入链路（P-02）已实证可行；身份/字典/照片三项为条件可行，存在明确、可解决的缺口，未构成硬阻塞，但必须在 Phase B 前由业务/技术侧确认。

---

## 二、实际架构确认（与任务书一致）

```
手机浏览器 (Cloudflare Pages 静态 H5)
   │  HTTPS + WPS 用户授权 (OAuth2 auth-code)
   ▼
Cloudflare Worker  (Serverless, 仅持 WPS Secret)
   │  WPS 应用级 token (client_credentials) + 用户级 token
   ▼
WPS 多维表  (file_id=cn229****alDs, sheet=3)   ← 现有生产数据源
   │  现有 WPS→PG Pull 引擎 (单向, 定时)
   ▼
PostgreSQL  grid_inspection_records + grid_record_sync_map   ← 现有生产库
   │
   ▼
现有「网格长巡查台账」/「三违台账」  (既有 HSE PC 业务)
```

- 本阶段**不修改**上图中任何既有块（WPS-PG-SYNC、PG schema、PC 三违、E-08-11、JWT 体系均冻结）。
- Worker **只**与 WPS 通信，不连 PG / 不上 192.168 / 不调 HSE Backend（任务 §十四硬约束）。

---

## 三、P-02：写入目标与同步链验证（PASS）

### 3.1 WPS 文件身份一致
- 环境 `WPS_DBSHEET_FILE_ID` = 实测 schema `fileId` = `cn229****alDs`（脱敏），`sheetId = 3`，**完全匹配**。
- 该文件即 `wpsFieldMap` / `wpsGridPullEngine` 同步所用的生产数据源。

### 3.2 WPS 字段 → PostgreSQL 列映射（已与真实 Schema 复核）
| WPS 字段（真实） | PG 列 | 模式 | 手机端是否写入 |
|---|---|---|---|
| 编号 | serial_no | readwrite | 建议写（业务编号） |
| 姓名 | personnel_name | readwrite | 写（巡查人快照） |
| 分组名称 | area_team | readwrite | 写（乡镇/班组） |
| 所属岗位 | position | readwrite | 写 |
| 网格等级 | grid_level | readwrite | 写 |
| 日期 | inspection_date | readonly | 写（同步层归一） |
| 巡查人员ID | （PG 无列，仅 WPS 快照） | readwrite | 建议写 employeeId 快照 |
| 三违行为 | violation_behavior | readwrite | 写（字典 code 或名称） |
| 违章人姓名 | violator_name | readwrite | 写（仅快照，非关联键） |
| 违章人性别 / 年龄 | violator_gender / age | readwrite | 可选 |
| 上报状态 / 车辆类型 / 违章类型结果 / 是否需要整改 / 整改人 | 对应列 | readwrite | 手机端不写（交 PC） |
| 三违照片：图片1/2/3 | （Attachment 类型，WPS 原生） | — | 写附件 |
| 三违照片链接 / 整改后照片链接 / 示意图链接 | image_content / rectified_photo / schematic | readwrite(link) | 见 §六 |
| 当日是否报名 / 是否补交 / 提交时间 / 标记 / 来源日期 | 对应列 | readwrite/readonly | 可选 |

> **结论**：手机端需要写入的全部业务字段，在现有 WPS→PG 契约中**已有对应映射**，无需新建 `t_account/t_roster/t_area/t_violation_rule/t_transfer/t_review` 等表（任务 §五明令禁止）。

### 3.3 同步引擎写入契约（只读审计 `wpsGridPullEngine.js`）
- 新记录：`INSERT grid_inspection_records` + `INSERT grid_record_sync_map`，**单事务，失败整体 ROLLBACK**。
- fail-closed：`fileId/sheetId` 必须与配置一致，否则拒绝执行。
- 幂等：`grid_record_sync_map` 含 `UNIQUE(wps_record_id, wps_file_id)`；插入前查重，命中则更新/跳过，**不重复建行**。
- 投影：`SYNC_PROJECTION` 由 `wpsFieldMap` 单一真源驱动，前 18 列 hash 口径冻结，与 2061 条存量 `sync_hash` 字节兼容。
- `grid_id` / `inspector_employee_id` 为 **PROTECTED_COLUMNS**，同步引擎**永不写入**（只能由后端身份链派生）。

### 3.4 目标表就绪度
- `grid_inspection_records` 实际列 = 33 列，**wpsFieldMap 期望列全部存在**（missingCols=[]）。
- 含扩展列：`client_token`（移动端来源证据）、`source_channel`、`submission_fingerprint`、`attribution_status`、`attachment_resolution_status`。
- 存量：2061 条 live 记录，链路已在生产运行。

**P-02 = PASS**：手机经 Worker 写入一条符合契约的 WPS 记录，现有 Pull 引擎将把它落入 `grid_inspection_records`，并最终进入网格长巡查台账。CASE-06/07/08/09 在架构层已成立。

---

## 四、P-01：WPS 用户身份验证可行性（CONDITIONAL）

### 4.1 现有身份解析机制（已存在）
- `wps_account_employee_map`（PG）：`wps_account_id → employee_id` 桥接表，含 `status` 与唯一索引。
- `gridEnrichmentService.resolveAttribution`：WPS 账号 → `employee.id` → `gridScope.deriveGridIdForEmployee` → 唯一 live grid 才写 `grid_id`；全部 fail-safe（任一失败回落 `pending`，**绝不按姓名/手机号猜**）。
- 身份状态机：`PENDING_CREATOR / PENDING_BRIDGE / PENDING_EMPLOYEE / PENDING_GRID / ATTRIBUTED / UNTRUSTED`。

### 4.2 三个未决子项（Phase A 无法在本地闭环确认）
1. **桥接表为空（0 行）**：`wps_account_employee_map.rows=0, active=0`。当前任何经 WPS 进来的记录都会落为 `attribution_status='pending'`（有记录、无归属）。需在上线前由**可信管理员流程**填充（禁止姓名/昵称匹配）。
2. **WPS OAuth 无法本地实测**：本环境无 Cloudflare、无公网回调地址，无法跑通 auth-code → user access_token 全链路。Worker 必须**从零实现** WPS 用户级 OAuth（应用级 `client_credentials` 已由 `wpsClient.js` 实现，但**全仓库无任何用户级 OAuth 代码**）。
3. **WPS OAuth 身份字段 vs `wps_account_id` 关系未验证**：桥接表注释明确「当前 WPS Creator 能力未验证」。`wps_account_id` 描述为「WPS 稳定账号 ID（如 Creator 系统账号标识）」；WPS 用户授权返回的 `openid/unionid/company_uid` 是否与之等同，**需 WPS 平台侧 + 应用配置确认**。

### 4.3 AUTH_MAPPING 状态
- **非硬阻塞，但为条件可行**：机制与数据落点均已存在，缺口均为「上线前需确认的外部/配置项」，而非技术不可行。
- 按任务 §四纪律：未自行发明方案、未用姓名/手机号猜身份。
- 报告登记：**`AUTH_MAPPING = CONDITIONAL`**，需在 Phase B 前确认上述 3 项。

### 4.4 关键约束：Worker 不连 PG ⇒ 身份解析也必须在 WPS 侧完成
- 现有桥接表与 `grid_inspection_records` 都在 **PG**，而 Worker 被禁止连 PG。
- 因此「WPS 用户 → 员工/网格」的解析若要服务于 H5 的「当前网格 / 我的记录」展示，**映射数据须放在 WPS 侧**（例如新增一张只读 WPS 映射表，由可信流程填充），而非依赖 PG 桥接表。
- 这是 Phase B 的设计决策点：PG 桥接表负责 Pull 后归因，WPS 侧映射表负责 Worker 实时解析。两者可同源维护，但物理隔离（符合 §八隔离原则）。

---

## 五、三违字典来源（CONDITIONAL）

### 5.1 字典权威存在
- `sanwei_behavior_dict`：列含 `behavior_code`(如 `SANWEI-SW-001`)、`behavior_name`(未穿工作服)、`behavior_type`(违反劳动纪律)、`is_violation`、`severity`、`enabled`、`valid_from/valid_to`、`aliases`。
- 抽样：SANWEI-SW-000「无三违行为」(is_violation=false)、SW-001~SW-006 等，带类型与有效期，**是正式、可筛选的字典**。

### 5.2 PC 字典接口对手机端不可用（已实证）
- `routes/hse-grid-violation-candidates.js`：`GET /dict` 挂 `requireRole('admin','hse_manager','safety_manager')`。
- 注释明确：`grid_inspector` **不在白名单（越权 403，后端强校验）**；「前端隐藏不是安全措施」。
- 结论：H5（以 `grid_inspector` 身份提交）**不能**调用现有 PC 字典接口。

### 5.3 可行路径（不修改 PC 权限）
- **WPS 字典镜像**：将 `sanwei_behavior_dict` 的有效行（按 `valid_from/valid_to` + `enabled` 过滤）镜像进一张**新增只读 WPS 多维表**，Worker 只读该表返回 H5。属「新增 WPS 源」，不触碰现有 WPS-PG-SYNC、不修改 PC 权限（任务 §九允许「Worker 从明确的 WPS 配置/字典数据源读取」）。
- 禁止：把 15 条行为硬编码进前端、复制一份长期失效 JSON（任务 §九）。

**DICT_SOURCE = CONDITIONAL**：字典数据齐全，但需 Phase B 新建 WPS 只读字典表 + 一次性镜像（由可信脚本从 PG 读出写入 WPS，仅此一次，非同步器）。

---

## 六、照片能力（CONDITIONAL）

### 6.1 WPS 原生附件已确认
- 实测 WPS Schema：字段 `三违照片：图片1/2/3`、`整改后照片：图片1` 类型 **`Attachment`**，且 `only_upload_by_camera=false`。
- ⇒ Worker 可将手机照片作为 Attachment 写入 WPS，记录本身即带照片（CASE-05/06 照片部分可行）。

### 6.2 PG URL 镜像缺口（已知）
- `gridEnrichmentService` 注释：「WPS Attachment uploadId→URL 端点（DBT v1 attachment/urls）本阶段探针实测 **404** → 不调用」。
- 即：WPS 存了附件，但 `image_content`(PG URL 列) 可能拿不到 URL；`attachment_resolution_status` 会落 `pending`。
- 影响：PC 台账若只认 `image_content` 的 http(s) URL，则手机照片在 PG 侧不显示（但 WPS 侧可见）。
- 需 Phase B 验证：WPS 附件上传响应是否直接返回可写 URL；若是，Worker 同时写入「三违照片链接」文本列即可闭环。

**PHOTO_STORAGE = CONDITIONAL**：附件存储可行（WPS Attachment 字段在）；PG URL 闭环待 Phase B 实测确认，不得自行引入新云存储（任务 §十一）。

---

## 七、现有能力复用清单（含 Worker 不可用项）

| 能力 | 现有端点/机制 | 手机端能否直接复用 |
|---|---|---|
| 巡查记录创建/查看 | `POST/GET/PUT /api/site-mgmt/grid-records` | ❌ Worker 不连 PG/HSE，不能直调 |
| 三违创建 | `POST /api/violations`（含 grid_inspector 角色） | ❌ 同上 |
| 整改/复查 | `PUT /violations/:id/rectify|review` | ❌ 手机端本就不做（范围外） |
| 人员选择 | `GET /api/hse/employee/employees/selector` | ❌ Worker 不连 PG |
| 照片上传 | `POST /api/files/upload/image` | ❌ 改走 WPS Attachment |
| WPS 多维表读写 | `wpsClient`(应用级 token) | ✅ Worker 复用此模式 |
| WPS→PG 同步 | `wpsGridPullEngine` | ✅ 直接受益，零改动 |
| 三违字典 | `sanwei_behavior_dict`(PG) | ⚠️ 需经 WPS 镜像（见 §五） |
| 身份桥接 | `wps_account_employee_map`(PG) | ⚠️ Worker 侧需 WPS 映射副本 |

> 关键认知：因为 Worker **不连后端**，所有「现有 HSE 接口」均**不能**被 H5 直接调用。H5 的唯一后端是 Worker，Worker 的唯一外部依赖是 WPS。因此「复用」的含义从「调 HSE API」转变为「写 WPS 让现有同步链消费」。**这正是本阶段架构与 MOBILE-WPS-V1 旧设计的根本区别**。

---

## 八、关键风险与未决事项

1. **身份解析（最高优先级）**：AUTH_MAPPING 三子项未决（§4.2）。若上线前无法确认 WPS OAuth 身份↔员工映射，H5 只能做「匿名记录写入」，无法可靠展示「当前网格 / 我的记录」。
2. **WPS 用户 OAuth 从零实现**：全仓库无用户级 OAuth 代码，Worker 需自行实现 auth-code 流 + token 存储 + 回调，且需 WPS 应用配置 redirect_uri / scope。
3. **字典 403**：PC 字典接口排除 `grid_inspector`，H5 必须走 WPS 镜像。
4. **照片 URL 缺口**：WPS Attachment→URL 历史 404，需 Phase B 实测。
5. **并发修改登记**：`server/app.js`、`violationController.js`、`encryption.js`、assessment 系列、`ruleEngine/*` 等 30+ 跟踪文件存在他者并发修改。**本报告不处理、不覆盖、不 reset**，仅登记。
6. **安全红线**：WPS APPID/APPKEY/client_secret/access_token/refresh_token 仅存 Worker Secret；本报告正文、前端、HTML、Git 均不含任何凭据（file_id 已脱敏）。

---

## 九、后续 Phase 最小建议（仅建议，本阶段不执行）

- **Phase B（最小 Worker）**：实现 WPS 用户 OAuth（auth/config、callback、me）；WPS 应用级 token 写记录；`/api/grid`（WPS 侧映射表解析）、`/api/records`(list/create)、`/api/violations/dict`（读 WPS 字典镜像）、`/api/photos`（WPS Attachment）。
- **Phase C（静态 H5）**：原生 HTML/CSS/TS，无第三方依赖；登录→首页→我的网格→开始巡查→拍照→三违人员/行为→提交→我的记录；三违行为下拉来自 `/api/violations/dict`。
- **Phase D（真实链路）**：H5→Worker→WPS→WPS-PG→PG→台账 真机走通；重复提交幂等（WPS 侧 `client_submission_id` 或 `编号` 唯一 + sync_map 唯一约束兜底）。
- **Phase E（部署）**：Pages 构建产物、Worker + wrangler.toml、Secret 清单、OAuth redirect 配置、真机地址说明。

---

## 十、状态代码（Phase A 粒度）

```
CF_WPS_01_STATUS        = CONDITIONAL_PASS
CLOUDFLARE_PAGES_READY  = NO
CLOUDFLARE_WORKER_READY = NO
WPS_AUTH_READY          = CONDITIONAL
WPS_WRITE_READY         = CONDITIONAL
WPS_PG_CHAIN_READY      = YES
MOBILE_H5_READY         = NO
END_TO_END_READY        = NO

AUTH_MAPPING            = CONDITIONAL   (3 子项待确认，见 §4.2)
DICT_SOURCE             = CONDITIONAL   (需 WPS 只读字典镜像，见 §5.3)
PHOTO_STORAGE           = CONDITIONAL   (WPS Attachment 在；PG URL 缺口待 §6.2)
NODE_02A_DECISION       = CLOSED_BY_BUSINESS (复查/责任/扣分均不在本阶段)
```

---

## 十一、暂停声明

Phase A 已按任务 §二十四完成「架构与身份验证」可行性验证，并已实证 **P-02 写入链路 PASS**。

依据任务纪律「**Phase A 完成后停止，不要直接进入大规模 Phase B/C**」，本阶段在此暂停：
- 未构建 Cloudflare Pages / Worker / H5；
- 未写入任何 WPS / PostgreSQL / 业务代码；
- 未修改现有 WPS-PG-SYNC、PC 三违、E-08-11、JWT。

**等待授权后进入 Phase B**。进入前建议业务/技术侧先确认：① WPS 应用是否启用用户授权及 redirect_uri/scope；② 由可信流程填充 WPS 侧身份映射（与 PG 桥接表同源）；③ 三违字典 WPS 镜像的一次性生成方式。
