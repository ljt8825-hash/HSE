# 网格长巡查台账 · PostgreSQL 主库 + WPS 在线文档镜像同步（原型方案）

> 目标：保留 PostgreSQL 作为系统主库（system of record），把"网格长巡查台账"
> （`grid_inspection_records`）同步进 WPS 在线文档，让非技术同事能在 WPS 里查看/编辑；
> 可选把 WPS 里的改动回写 PG。WPS **不**替代数据库，只是协作镜像层。

---

## 1. 现状（来自代码核查）

后端 `server/routes/site-mgmt.js` 对 `grid_inspection_records` 表提供 5 个接口：
`GET /grid-records`（分页/筛选/排序）、`/filter-options`、`PUT /:id`（单元格白名单编辑）、
`POST`（新增）、`DELETE`（批量）、`DELETE /all`（清空）。

表字段（共 23 列，图片类存的是**服务器路径**不是 base64）：

| 类别 | 字段（snake_case） |
|---|---|
| 主键/时间 | `id`、`upload_time`、`created_at`、`updated_at` |
| 基础 | `area_team`、`inspection_date`、`personnel_name`、`grid_level`、`position` |
| 违章人 | `violator_name`、`violator_gender`、`violator_age`、`vehicle_type` |
| 上报/整改 | `report_status`、`violation_behavior`、`violation_type_result`、`need_rectification`、`rectifier` |
| 图片(路径) | `image_content`、`rectified_photo`、`schematic` |
| 关联/其它 | `grid_id`、`nickname`、`signup_today`、`marker`、`is_resubmit`、`serial_no` |

白名单可编辑字段（`GRID_RECORD_EDITABLE`，17 个）：
`area_team, inspection_date, personnel_name, grid_level, position, violator_name,
violator_gender, violator_age, report_status, violation_behavior, need_rectification,
rectifier, nickname, signup_today, marker, is_resubmit, serial_no`。

前端 `apps/web-naive/src/views/site/grid-ledger/index.vue`：分页 + 虚拟滚动 + 单元格点改即存
+ 导入/导出，接口契约不变。

---

## 2. 架构

```
┌─────────────┐   写/读(主)   ┌──────────────────┐
│  Web 前端    │ ───────────▶ │  Express 后端     │
│ (网格长台账) │ ◀─────────── │  PostgreSQL       │   ◀─── 系统主库（唯一真相源）
└─────────────┘   读(主)      │  grid_inspection │
                             │  _records        │
                             └────────┬─────────┘
                                      │  定时 / 事件触发同步
                                      ▼
                             ┌──────────────────┐
                             │  同步服务          │  server/scripts/_sync_grid_ledger_to_kdocs/
                             │  (本骨架)          │   pull PG → diff → push WPS
                             └────────┬─────────┘
                                      │  kdocs MCP 连接器（限频退避）
                                      ▼
                             ┌──────────────────┐
                             │  WPS 在线文档      │   https://www.kdocs.cn/l/cbj5jDkU0KRu
                             │  （镜像/协作层）    │   建议类型：多维表格 dbsheet（次选普通表格）
                             └──────────────────┘
```

**同步方向（推荐分阶段）**
- **阶段 A（只读镜像，最稳）**：PG → WPS 单向。非技术同事在 WPS 只看不改（或改了不回写）。
  实现最简单，零并发风险，立刻可用。
- **阶段 B（双向）**：WPS 用**多维表格 dbsheet** + **Webhook**，把 WPS 单元格改动推送回 PG。
  注意：从 WPS 回写的字段应**限制在白名单 17 列内**，且 PG 侧做乐观锁（`updated_at` 比对），
  避免覆盖 Web 端的并发编辑。

---

## 3. 为什么用 WPS 当"镜像"而非"主库"

| 维度 | PostgreSQL（主库） | WPS 在线文档（镜像） |
|---|---|---|
| 并发/事务 | 行锁、事务 | 无锁，后写覆盖 |
| 鉴权 | 内网账号 | 连接器授权，会过期（`400006`） |
| 限流 | 无 | 有（`429001 限频` / `429002 熔断`） |
| 查询性能 | 服务端筛选分页 | 每次基本全表拉回再内存处理 |
| 图片 | 存路径，稳定 | 路径可作文本列；base64 会被拒 |
| 合规 | 内网 HSE 数据 | 第三方云，需确认合规 |

→ 因此 WPS 只做"人能看的协作层"，写入仍以 PG 为准。

---

## 4. 字段映射（PG → WPS）

WPS 文档首行作为表头，列序建议与下表一致（普通表格按 A~W 列；多维表格按字段名）：

| WPS 列 | PG 字段 | 备注 |
|---|---|---|
| id | `id` | 用于 diff/upsert 的主键；WPS 侧存为文本避免科学计数 |
| 片区班组 | `area_team` | |
| 巡查日期 | `inspection_date` | 文本 `yyyy-MM-dd` |
| 网格长姓名 | `personnel_name` | |
| 网格级别 | `grid_level` | |
| 职务 | `position` | |
| 违章人 | `violator_name` | |
| 违章人性别 | `violator_gender` | |
| 违章人年龄 | `violator_age` | |
| 车辆类型 | `vehicle_type` | |
| 上报状态 | `report_status` | |
| 三违照片 | `image_content` | **仅存路径**（逗号分隔） |
| 三违行为 | `violation_behavior` | |
| 违章类型结果 | `violation_type_result` | |
| 需整改 | `need_rectification` | |
| 整改人 | `rectifier` | |
| 整改后照片 | `rectified_photo` | 仅存路径 |
| 示意图 | `schematic` | 仅存路径 |
| 网格ID | `grid_id` | |
| 昵称 | `nickname` | |
| 今日报名 | `signup_today` | |
| 标记 | `marker` | |
| 是否重报 | `is_resubmit` | |
| 编号 | `serial_no` | |

> 映射逻辑集中在 `mapper.js` 的 `PG_TO_KDOCS`，改字段只动这一处。

---

## 5. 同步策略与健壮性

1. **拉取**：`pgSource.js` 只读 `WHERE is_deleted IS NOT TRUE`（若表有软删列）或全表，
   按 `id` 排序，返回简洁数组。
2. **diff**：以 `id` 为键；WPS 侧每行也带 `id` 列。新增/更新/删除分别走
   `dbsheet.add_records` / `dbsheet.update_records` / `dbsheet.delete_records`
   （普通表格则用 `sheet` 的追加/批量更新/删除范围）。
3. **限频退避**（关键）：kdocs 连接器会返回 `429001/429002` 并带恢复时间。
   `kdocsSink.js` 必须：捕获限频 → **立刻停止** → `sleep(恢复秒数)` → 续传，**禁止**立即重试。
   写入按小批量（如每批 20 行）切分，批间留间隔。
4. **缓存/幂等**：WPS 读取结果可在本地缓存（带 TTL），减少云端只读调用；
   写入带 `updated_at` 比对，避免重复覆盖。
5. **失败可观测**：每次同步落一条日志（行数、耗时、限频次数、错误），便于排障。

---

## 6. 接入前提（必做）

1. 在 WorkBuddy 连接器管理里**连接并授权金山文档**；确认链接
   `https://www.kdocs.cn/l/cbj5jDkU0KRu` 解析出的 `file_id`/`drive_id` 可访问，
   且文档类型为 **多维表格（.dbt）** 或 **表格（.xlsx/.ksheet）**。
2. 首次运行前，用本骨架的 `init.js` 按第 4 节表头**建表/补表头**（或在 WPS 里手动建好）。
3. 凭据由连接器托管，脚本**不**存 token；写操作前连接器会自动鉴权。

---

## 7. 改造清单（落地步骤）

- [ ] 连接器授权 + 确认文档类型/列结构（可让我先读该文档核验）
- [ ] 放置骨架 `server/scripts/_sync_grid_ledger_to_kdocs/`
- [ ] 填 `config.js`：`KDOCS_FILE_ID`、`DOC_TYPE`、`SYNC_MODE`(mirror|twoway)
- [ ] 跑 `node init.js` 建表头 → `node sync.js --dry-run` 预览 → `node sync.js` 实跑
- [ ] 用 WorkBuddy **自动化** 定时（如每天 02:00）触发 `sync.js`
- [ ] （可选）阶段 B：WPS 多维表格配置 Webhook 回写 PG（需新增一个接收端路由）

---

## 8. 风险与边界

- **限频是硬约束**：并发用户多在 WPS 里编辑会触发熔断，故阶段 A（只读镜像）最稳。
- **图片**：只镜像路径，不搬二进制；WPS 单元格里点开路径需另配访问（内网图片服务）。
- **合规**：HSE 安全数据入第三方云前请确认内部合规口径。
- **回写冲突**：阶段 B 必须限制回写字段 + 乐观锁，否则 Web/ WPS 双向改会互相覆盖。
