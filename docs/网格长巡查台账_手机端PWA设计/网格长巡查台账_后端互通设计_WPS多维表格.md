# 网格长巡查台账 · 后端互通设计（WPS 多维表格 ↔ PostgreSQL）

> 范围：仅后端。前端 PWA/界面在《网格长巡查台账_手机端PWA设计.md》已设计，本文件定义
> 「手机端用 WPS 多维表格作为数据层」与「系统现有 PostgreSQL 台账（三级菜单 `/site/grid/ledger`）」之间的互通后端方案。
> 设计先于编码，落地需用户确认第 9 节未决项。

---

## 1. 目标与范围

- **现状**：系统三级菜单「网格长巡查台账」= `grid_inspection_records`（PostgreSQL），由 `server/routes/site-mgmt.js` 的
  `GET/PUT/POST/DELETE /site-mgmt/grid-records` 提供，前端 `src/views/site/grid-ledger/index.vue` 消费；接口已稳定，零后端改造即可复用。
- **新需求**：手机端 Web（PWA）使用 **WPS 多维表格（.dbt）** 作为自己的数据层，且 WPS 多维表格必须与上述 PostgreSQL 台账**互通**。
- **本设计交付**：① 互通架构；② WPS 多维表格字段建模；③ 双向同步引擎；④ 新增后端模块清单；⑤ 鉴权/风险/未决决策。

## 2. 总体架构（三层 + 同步引擎）

```
┌─────────────────────┐        ┌──────────────────────────┐        ┌─────────────────────────┐
│  手机端 PWA          │        │  WPS 多维表格 (.dbt)       │        │  PostgreSQL             │
│  (移动端 UI)         │◀──────▶│  巡查台账 sheet           │◀──────▶│  grid_inspection_records│
│  表单/看板/表格视图   │ 读写   │  + 表单视图(移动录入)      │ 同步   │  (系统权威台账)          │
└─────────────────────┘        └──────────────────────────┘        └─────────────────────────┘
                                          ▲                                  ▲
                                          │ Webhook(创建/修改/删除)            │ 桌面 Web 写入后下发
                                          │                                  │
                                 ┌────────┴──────────────────────────────────┴────────┐
                                 │           同步引擎 (新增后端模块)                    │
                                 │  wpsGridSyncService + wps-grid-sync 路由 + 调度器     │
                                 │  · 映射表 grid_record_sync_map                       │
                                 │  · FIELD_MAP(PG↔WPS 单一真源)                         │
                                 │  · 上行 Webhook → upsert PG                          │
                                 │  · 下行 桌面写 → push WPS + 15min 对账 cron          │
                                 └─────────────────────────────────────────────────────┘
```

- **桌面 Web（/site/grid/ledger）**：读写不变，仍直连 PostgreSQL；任何写操作后由同步引擎把变更推给 WPS。
- **手机 PWA**：以 WPS 多维表格为数据层（推荐用 WPS 原生「表单视图/看板视图」承载移动录入与查看，PWA 外壳负责「添加到桌面+全屏」）。
- **同步引擎**：唯一新增后端，负责 WPS↔PG 双向一致，是「互通」的核心。

## 3. 数据源权威性与同步方向（含冲突策略）

**推荐：PostgreSQL 为权威源（authoritative），WPS 多维表格为移动协作副本。**

理由：桌面系统的评分引擎、扣分规则、审计日志、cell-edit 校验全部读 PG；把 WPS 设为权威需重接这些链路，风险高。让 PG 权威，移动端写入先落 WPS、再由 Webhook 同步回 PG，桌面写入再下行同步到 WPS，即可双向互通且不破坏现有逻辑。

| 方向 | 触发 | 机制 | 写入目标 |
|------|------|------|----------|
| **WPS → PG（上行）** | 手机在 WPS 增/改/删记录 | WPS Webhook 实时回调 + 防漏对账 | PostgreSQL（upsert / 软删） |
| **PG → WPS（下行）** | 桌面 Web PUT/POST/DELETE | 写后即时下发 + 15min 全量对账 cron | WPS 多维表格 |
| **冲突** | 两侧在同步窗口内各自改动同一行 | 以 `updated_at`/`last_modified_time` **后写胜出（LWW）**；同时变更则置 `conflict=TRUE` 并留痕，不静默覆盖 | 两侧均更新为较新值 |

> 若用户坚持「WPS 权威」（移动端独占写、桌面只读），则需改造桌面写路径改为先写 WPS 再回灌 PG——第 9 节需确认。

## 4. WPS 多维表格数据模型

> ### 4.0 现有 WPS 多维表格资产（设计前置发现，重要）
> 今日已存在一个同主题 `.dbt` 文件，可能被直接用作移动端数据层：
> - 文件名：**`网格长巡查台账（2026年9月1-6日·多维表）.dbt`**
> - `file_id = dgEXT2FACrM7BgbNq1gvrx85BsAXpdMwN`，`sheet_id = 2`，分享链接 `https://www.kdocs.cn/l/cgzvOiLEoqpK`
> - 已导入 **339 条**；字段为 **17 个 `MultiLineText`**：`当日序号/昵称/分组名称/姓名/所属岗位/网格等级/检查日期/三违行为/违章人姓名/违章人性别/违章人年龄/当日是否报名/标记/是否补交/提交时间/编号/来源日期`（4 个图片列已剔除）。
> - **关键差异**：该表 schema 是"新版三违台账 xlsx"的 17 列，**并非** `grid_inspection_records` 的 26 列。互通前必须先决定：是以此现有 `.dbt` 为移动端存储（则需把 17 列映射到 PG 26 列），**还是**新建一个与 PG 26 列对齐的 `.dbt`（把现有 339 行作为种子数据灌入）。见 §9 决策 #1。

新建 / 对齐 `.dbt` 文件，含 1 个数据表 **「巡查台账」**，字段由 `grid_inspection_records` 26 列映射而来，外加 2 个同步辅助列。（若采用 §4.0 现有 `.dbt`，则本节字段映射改为"17 列 ↔ 26 列"的对齐映射，结构不变。）

### 4.1 字段映射表（PG snake → WPS field）

| PG 列 (snake) | WPS 字段名 | WPS 类型 | 说明 / 备注 |
|---|---|---|---|
| `area_team` | 片区班组 | SingleLineText | 亦可 SingleSelect（便于筛选） |
| `upload_time` | 上报时间 | Date | 与 CreatedTime 自动字段二选一，建议显式保留 |
| `inspection_date` | 巡查日期 | Date | 排序主字段 |
| `personnel_name` | 检查人 | SingleLineText | |
| `grid_level` | 网格等级 | SingleSelect | 选项：如 一级/二级/三级 |
| `position` | 岗位 | SingleLineText | |
| `violator_name` | 违章人 | SingleLineText | |
| `violator_gender` | 违章人性别 | SingleSelect | 男/女 |
| `violator_age` | 违章人年龄 | Number | |
| `vehicle_type` | 车辆类型 | SingleLineText | |
| `report_status` | 上报状态 | SingleSelect | 待上报/已上报/… |
| `image_content` | 三违照片 | Attachment | **v1 用 Url 链接镜像**，见 §5.4 |
| `violation_behavior` | 三违行为 | SingleLineText | 亦可 SingleSelect |
| `violation_type_result` | 三违类型结果 | SingleLineText | |
| `need_rectification` | 需整改 | Checkbox | |
| `rectifier` | 整改人 | SingleLineText | |
| `rectified_photo` | 整改后照片 | Attachment | v1 用 Url 链接镜像 |
| `schematic` | 示意图 | Attachment | v1 用 Url 链接镜像 |
| `grid_id` | 网格ID | Number | |
| `nickname` | 昵称 | SingleLineText | |
| `signup_today` | 当日签到 | Number | 计数 |
| `marker` | 标记 | SingleLineText | |
| `is_resubmit` | 是否重报 | Checkbox | |
| `serial_no` | 编号 | SingleLineText | 或 AutoNumber |
| *(系统字段)* | 创建时间/最后修改时间 | CreatedTime/LastModifiedTime | WPS 自动字段，用于冲突比较 |
| **`pg_id`**（新增） | PG记录ID | SingleLineText | 回指 PostgreSQL `id`，排查/对账用 |
| **`sync_state`**（新增） | 同步状态 | SingleSelect | synced/conflict/pending |

> 自动字段 `id/created_at/updated_at`（PG 侧）不映射为 WPS 输入字段，由两侧各自系统维护；关联通过 `pg_id` 列 + 映射表双保险。

### 4.2 视图（面向移动端）

- **表单视图 `巡查录入`**：手机端主要录入入口，按高频字段排序，必填校验。
- **看板视图 `整改看板`**：按 `上报状态` 分列，便于网格长手机上跟进整改。
- **表格视图 `全部台账`**：完整字段浏览/筛选（对应桌面功能）。

## 5. 同步引擎设计

### 5.1 映射表 `grid_record_sync_map`（双向关联真源）

```sql
CREATE TABLE grid_record_sync_map (
  id              BIGSERIAL PRIMARY KEY,
  pg_record_id    BIGINT       NOT NULL REFERENCES grid_inspection_records(id),
  wps_record_id   VARCHAR(32)  NOT NULL,
  wps_file_id     VARCHAR(64)  NOT NULL,
  wps_sheet_id    BIGINT       NOT NULL,
  last_sync_at    TIMESTAMPTZ,
  pg_updated_at   TIMESTAMPTZ,
  wps_updated_at  TIMESTAMPTZ,
  sync_hash       VARCHAR(64),            -- 业务字段内容的稳定哈希，用于跳过无变更/检测冲突
  conflict        BOOLEAN DEFAULT FALSE,
  UNIQUE (pg_record_id),
  UNIQUE (wps_record_id, wps_file_id)
);
```
> 备选：直接在 `grid_inspection_records` 加 `wps_record_id` 列（单表场景够用）。映射表更通用（支持多 sheet/多视图/未来分镇），**推荐映射表**。

### 5.2 字段映射单一真源 `FIELD_MAP`

在 `wpsGridSyncService.js` 顶部集中维护一份 `{ pg: snake, wps: 字段名, type, transform? }` 数组，**上行/下行共用**，杜绝两侧漂移。转换函数处理类型差异（如 PG `need_rectification` 文本 ↔ WPS Checkbox 布尔；日期格式 `YYYY-MM-DD` ↔ `2025/11/15`）。

### 5.3 方向 A — WPS → PG（上行，Webhook 驱动）

1. 在 WPS 订阅 Webhook：`create_record` / `update_sheet` / `remove_record`，`callback_url = https://<host>/api/wps-grid-sync/webhook`（公网可达、接收 JSON POST）。
2. 后端 `/webhook`：
   - 校验签名（WPS-3 / KSO-1，见 §6 凭证）；拒绝非法来源。
   - 解析 `command` + `record_id` + `sheet_id`；用 `dbsheet.get_record` 拉全量字段（Webhook 体可能仅含最小信息）。
   - 按 `FIELD_MAP` 转为 PG 字段；查映射表：
     - **create**：`INSERT`（`GRID_RECORD_CREATE_CAMELS` 白名单）→ 写映射。
     - **update**：`UPDATE grid_inspection_records SET … WHERE id=映射.pg_record_id`（复用现有白名单逻辑，保持一致）。
     - **remove**：`UPDATE … SET is_deleted=true`（软删，符合现有约定）。
   - 写 `sync_hash`/`last_sync_at`；对同一事件重放做幂等（按事件去重 + hash 无变化则跳过）。

### 5.4 照片/附件（互通最难点）

PG 三照片字段为 **text**（存 URL/文件名），WPS 为 **Attachment**（需 `uploadId`）。分阶段：

- **v1（链接镜像，推荐首版）**：WPS 侧三照片列用 **Url / SingleLineText** 存 PG 原有 URL 字符串；手机端点链接在浏览器看原图。零二进制搬运，可立即互通，但 WPS 内不内联预览。
- **v2（二进制复制）**：PG→WPS 下载图片字节 → 调 WPS 附件上传取 `uploadId` → 写 Attachment；WPS→PG 反向下载 URL 存回 text。需实现上传/下载适配层，作后续增强。

> 决策点见 §9。强烈建议 v1 先上线验证同步链路，照片复制后置。

### 5.5 方向 B — PG → WPS（下行 + 对账）

- **即时**：桌面 Web `PUT/POST/DELETE /grid-records` 成功后，调用 `wpsGridSyncService.pushFromPg(record)`：
  - 新记录 → `dbsheet.create_records` 建 WPS 行并写映射；
  - 已有 → `dbsheet.update_records` 更新映射行字段；
  - 删除 → `dbsheet.delete_records`（若已映射）。
- **对账 cron**（遵循 `node-cron` + `SCHEDULER_ENABLED` 既有约定）：
  - 每 15 分钟：取 `updated_at > 上次对账时间` 的 PG 行下发；遍历 WPS `list_records` 与映射表比对，补推漏网 Webhook 的变更。
  - 冲突检测：比较 `pg_updated_at` 与 `wps_updated_at`，均晚于上次同步且 hash 不同 → `conflict=TRUE` + 记审计，按 LWW 后写胜出。

### 5.6 幂等与可靠性

- 事件去重（WPS 可能重试）+ `sync_hash` 跳过无变更。
- 下行用映射表 idempotent upsert；上行用 `pg_record_id`/`wps_record_id` 唯一约束防重。
- 失败进重试队列（简单内存队列或 DB 任务表），不阻塞主写路径。

## 6. 鉴权与凭证

- **后端 ↔ WPS**（服务到服务）：用 **应用授权（app access_token，`kso.dbsheet.readwrite`）**，OAuth2 `client_id`/`client_secret` → token，带刷新缓存。
  - 推荐入口：**V7 REST** `https://openapi.wps.cn/v7/coop/dbsheet/{file_id}/sheets/{sheet_id}/records`（KSO-1 签名）；`core/execute`(kopen/WPS-3) 作备选。
- **Webhook 验签**：用 `WPS_WEBHOOK_SECRET` 校验 `X-Auth`/`X-Kso-Authorization`，拒绝伪造。
- **env 新增**（`server/.env`，不入库明文）：
  ```
  WPS_DBSHHET_FILE_ID=        # .dbt 文件 ID
  WPS_DBSHHET_SHEET_ID=       # 数据表 ID
  WPS_APP_ID=                 # 开放平台应用 ID
  WPS_APP_SECRET=             # 应用密钥
  WPS_OPENAPI_BASE=https://openapi.wps.cn
  WPS_WEBHOOK_SECRET=         # 回调验签
  ```
- **手机 PWA 鉴权**（见 §9 决策）：推荐 PWA 直接读写 WPS（WPS 用户/协作者授权），后端只做同步；或 PWA 经后端代理（后端持有 token，更安全集中）。

## 7. 新增后端模块清单

| 文件 | 作用 |
|---|---|
| `server/services/wpsTokenService.js` | WPS 应用 token 获取/刷新/缓存 |
| `server/services/wpsGridSyncService.js` | FIELD_MAP、PG↔WPS 转换、upsertPG、pushToWPS、reconcile、冲突检测、Webhook 验签处理 |
| `server/routes/wps-grid-sync.js` | `POST /api/wps-grid-sync/webhook`（WPS 回调）、`GET /status`、`POST /reconcile`（手动触发）、`GET /conflicts`、`POST /bootstrap`（一次性建 .dbt/表/字段/表单视图/Webhook + 把现有 PG 行灌入 WPS）、`GET /mapping` |
| `server/services/wpsGridSyncScheduler.js` | `initWpsGridSyncScheduler()`：node-cron 15min 对账，受 `SCHEDULER_ENABLED` 控制 |
| `server/app.js` | 挂载 `app.use('/api/wps-grid-sync', …)`；启动 `initWpsGridSyncScheduler()`；启动时确保 Webhook 已订阅 |
| `server/.env` | 上述 WPS_* 配置 |
| DB 变更 | 建 `grid_record_sync_map`；（可选）`grid_inspection_records` 加 `wps_record_id` |
| 改造点 | `site-mgmt.js` 的 `PUT/POST/DELETE /grid-records` 成功后调用 `pushFromPg()`（最小侵入，沿用现有白名单） |

## 8. 关键时序

**上行（手机写 → 系统）**
```
手机(WPS表单) ──创建记录──▶ WPS ──Webhook──▶ /api/wps-grid-sync/webhook
        └─验签→get_record→FIELD_MAP→upsert PG(grid_inspection_records)→写映射
                 ▲                                                 │
          桌面 /site/grid/ledger 立即可见（只读 PG）◀──────────────┘
```
**下行（桌面写 → 手机）**
```
桌面 Web PUT /grid-records/:id ──▶ PG 更新成功 ──▶ pushFromPg() 
        └─FIELD_MAP→dbsheet.update_records(WPS 行)→更新映射/last_sync_at
                 ▲                                          │
          手机 WPS 看板/表格视图立即可见◀────────────────────┘
```
**对账（防漏）**：cron 每 15min 双向 diff（PG `updated_at` 窗口 + WPS 全量翻页）× 映射表 → 补推 + 冲突标记。

## 9. 风险与未决决策（2026-09-08 已全部拍板 ✅）

1. **目标 WPS 多维表格** ✅ 采用现有 `网格长巡查台账（2026年9月1-6日·多维表）.dbt`（17 文本字段 + 4 附件图 + 3 新增链接列，339 条）。
2. **权威源** ✅ PostgreSQL 权威；WPS 为移动协作副本；冲突 LWW 后写胜出 + conflict 标记。
3. **手机 PWA 接入** ✅ WPS 原生视图嵌入（表单视图 `移动端巡查录入` 已建，view_id=D；PWA 外壳负责加桌面+全屏）。
4. **照片互通** ✅ v1 链接镜像（新增 `三违照片链接/整改后照片链接/示意图链接` 3 个 MultiLineText 列，field id a/b/c；4 个附件图列保留作手机原生拍照位，v2 再做二进制搬运）。

**实施修正（重要）**：本机部署（127.0.0.1:5800）无公网回调地址，WPS Webhook 当前不可达 →
**轮询对账为主通道**（默认每 15 分钟），`POST /api/wps-grid-sync/webhook` 端点已预留，公网部署后于
`middleware/auth.js` `PUBLIC_ROUTES` 放行并订阅即可切换实时模式。

附带待确认：手机端（网格长/乡镇经理）是否直接获 WPS 多维表格协作者写权限，还是统一走后端代理（§6）。

## 10. 落地步骤（建议分阶段）

- **P0 打通**：bootstrap 建 .dbt/表/字段/Webhook → 现有 PG 数据灌入 WPS → 上行 Webhook→PG 跑通 → 手机表单写入能进系统台账。
- **P1 一致**：下行 pushFromPg + 15min 对账 cron + 冲突标记；桌面改动能回写手机。
- **P2 增强**：照片 v2 二进制复制、sync_state 管理视图、失败重试队列、手动 reconcile 接口治理。

---
*对齐依据：现有 `grid_inspection_records` 26 字段与 `GRID_RECORD_EDITABLE`(17)/`GRID_RECORD_CREATE_CAMELS` 白名单（site-mgmt.js:228-259）；
WPS 多维表格 dbsheet OpenAPI 与 Webhook 能力（kdocs 连接器参考：data_table/field/record/webhook）；
既有调度约定（assessmentScheduler.js：node-cron + SCHEDULER_ENABLED）。*

---

## 11. 实施记录（2026-09-08，后端已落地，待凭证激活）

### 11.1 已完成

**WPS 侧（经 kdocs 连接器实时操作，已回读验证）**
- `.dbt`（file_id=`dgEXT2FACrM7BgbNq1gvrx85BsAXpdMwN`，sheet_id=2，339 条）新增 3 列：`三违照片链接`(a)、`整改后照片链接`(b)、`示意图链接`(c)，均为 MultiLineText。
- 新建表单视图 **`移动端巡查录入`**（view_id=D，type=Form）——手机端主录入入口（WPS 原生移动适配）。
- 现有 4 个附件图列（三违照片图片1/2/3、整改后照片图片1，Attachment，supportMulti）保留为手机原生拍照位。

**后端（语法检查 + 自测全部通过）**

| 文件 | 内容 |
|---|---|
| `server/services/wpsClient.js` | WPS V7 REST 客户端：应用 token（client_credentials，缓存+强刷）、可选 KSO-1 签名、429 退避、`list_by_page`/`create`/`update`/`delete` 记录四接口（50 条/批） |
| `server/services/wpsGridSyncService.js` | 同步引擎：FIELD_MAP 18 对映射（单一真源）、`toIsoDate` 中文日期转换、规范化哈希（回声抑制+变更检测）、`pullFromWps`（自然键防重：日期+检查人+违章人唯一命中才绑定）、`pushRow`/`onPgRowChanged`/`onPgRowsDeleted`、`reconcile`（上行+下行清扫+PG删除追平）、LWW 冲突标记、`status` |
| `server/services/wpsGridSyncScheduler.js` | node-cron 每 15 分钟对账（`WPS_SYNC_CRON` 可调，Asia/Shanghai）；凭证缺失自动休眠 |
| `server/routes/wps-grid-sync.js` | `GET /status`、`POST /pull`、`POST /reconcile`（均支持 `dryRun`）、`POST /push {pgIds}`、`GET /mapping`、`GET /conflicts`、`POST /webhook`（预留）、`POST /trigger` |
| `server/app.js` | 挂载 `/api/wps-grid-sync` + 启动 `initWpsGridSyncScheduler()` |
| `server/routes/site-mgmt.js` | `PUT/POST /grid-records` 成功后 `onPgRowChanged`（fire-and-forget）、`DELETE` 后 `onPgRowsDeleted`（未启用时 no-op，最小侵入 4 处） |
| DB（自建幂等，无 psql 中文坑） | `grid_record_sync_map`（pg↔wps 双向唯一映射 + sync_hash + conflict）、`grid_record_sync_state`（KV：last_pull_at / push_cutoff_at 等） |
| `server/.env` | WPS_* 配置块（file_id/sheet_id 已填，`WPS_APP_ID/SECRET` 待填） |
| `server/scripts/_wps_sync_selftest.cjs` | 回归自测（6 项断言，凭证齐后可重跑） |

**数据口径（实测）**：PG 现有 1724 行均为 2026-08 数据、9 月为 0 → WPS 339 条 9/1-6 为净新增，首跑上行无重复风险；
下行推送以 `push_cutoff_at`（默认首次启用时刻）截断，8 月历史数据不灌入 WPS（`WPS_SYNC_PUSH_CUTOFF` 可覆盖）。
`serial_no` 在 PG 含 '2026/08/10 08:08' 类脏值 → 自然键弃用 serial_no。

### 11.2 激活步骤（待用户）

1. 在 WPS 开放平台（open.wps.cn）开发者后台创建**企业自建应用**，授予 `kso.dbsheet.readwrite`，并将应用添加为该 `.dbt` 协作者；
2. 把 `APP_ID/APPKEY` 填入 `server/.env` 的 `WPS_APP_ID / WPS_APP_SECRET`；
3. 重启 5800 后端（调度器自动启动，日志见 `[wps-grid-sync]`）；
4. 先 `POST /api/wps-grid-sync/reconcile {"dryRun":true}` 干跑核对，再实跑完成 339 条上行入 PG；
5. 手机端：打开表单视图 `移动端巡查录入` 分享链接（PWA 外壳封装见《手机端PWA设计》）。

### 11.3 已知边界

- update/delete 的 V7 路径为对称命名推断（`.../records/update|delete`），首跑联调若 404 需按官方文档校准（常量集中在 `wpsClient.js` 顶部，一处可改）；
- 同轮询窗口内双侧同改一行：桌面（PG）胜出，WPS 侧改动标记 conflict 留痕（`GET /conflicts` 可查）；
- WPS 端删除默认不回删 PG（`WPS_SYNC_DELETE=true` 才开启）；
- 附件图列（4 个 Attachment）与 PG 照片列的**二进制互搬为 v2**；v1 仅链接镜像。
