# WPS 网格巡查字段映射表

> 维护人：Sprint-WPS-02-B（WPS 业务字段补齐与真机上线准备）/ Sprint-WPS-02-C（真机 Schema 回填）
>
> 用途：PC「网格长巡查台账」业务字段 ↔ PostgreSQL 列 ↔ WPS 多维表字段的唯一对照表。
> 代码唯一真源：`server/services/wps/wpsFieldMap.js`（写侧）与 `server/services/wpsGridSyncService.js`（读/同步侧）。
>
> WPS 多维表（**2026-09-08 真机 Schema 证实**）：`WPS_DBSHEET_FILE_ID=cn229thwalDs`、`WPS_DBSHEET_SHEET_ID=3`（数据表名「表格视图」，339 条记录；同文件 sheet 1=「数据表」、sheet 2=「仪表盘」）。
>
> 读写标记：
> - **RW** = readwrite（当前 PC 台账真正需要写入 WPS 的业务字段）
> - **R**  = read / readonly（WPS 只读或自动产生的字段）
> - **RSV** = reserved（预留字段，未放开写入；violatorEmployeeId / GPS 等）
>
> 说明：下表字段 ID / 类型均为 **2026-09-08 真实 WPS API 返回**（`GET /v7/coop/dbsheet/cn229thwalDs/schema`），非猜测。6 个业务列与 3 个链接镜像列为本 Sprint 真机补建（`POST .../sheets/3/fields`，类型 MultiLineText）。

| PC业务字段 | PostgreSQL字段 | WPS字段 | WPS字段ID | 类型 | 读写 | 来源 | 备注 |
|---|---|---|---|---|---|---|---|
| inspectorEmployeeId | - | 巡查人员ID | **X** | MultiLineText | RW | 后端身份 | Sprint-WPS-02-C 真机补建；只允许后端 `currentEmployeeContext.employeeId` 写入，前端不可覆盖 |
| inspectorName / personnelName | personnel_name | 姓名 | F | MultiLineText | RW | 快照 | |
| areaTeam / operationUnit | area_team | 分组名称 | E | MultiLineText | RW | 快照 | |
| position | position | 所属岗位 | G | MultiLineText | RW | 快照 | |
| gridLevel | grid_level | 网格等级 | H | MultiLineText | RW | 快照 | |
| inspectionDate | inspection_date | **日期**（原「检查日期」） | I | MultiLineText | RW | 业务 | 真机证实为文本（含时间如 `2026-09-01 15:27`）；读侧按 `YYYY-MM-DD` 归一 |
| violationBehavior | violation_behavior | 三违行为 | M | MultiLineText | RW | 业务 | |
| violatorName | violator_name | 违章人姓名 | N | MultiLineText | RW | 快照 | |
| violatorGender | violator_gender | 违章人性别 | O | MultiLineText | RW | 快照 | |
| violatorAge | violator_age | 违章人年龄 | P | MultiLineText | RW | 快照 | |
| reportStatus | report_status | 上报状态 | **Y** | MultiLineText | RW | 业务 | Sprint-WPS-02-C 真机补建；取值 已上报/未上报/待上报；PC 筛选依赖 |
| vehicleType | vehicle_type | 车辆类型 | **Z** | MultiLineText | RW | 业务 | Sprint-WPS-02-C 真机补建 |
| violationTypeResult | violation_type_result | 违章类型结果 | **a** | MultiLineText | RW | 业务 | Sprint-WPS-02-C 真机补建 |
| needRectification | need_rectification | 是否需要整改 | **b** | MultiLineText | RW | 业务 | Sprint-WPS-02-C 真机补建 |
| rectifier | rectifier | 整改人 | **c** | MultiLineText | RW | 业务 | Sprint-WPS-02-C 真机补建 |
| imageContent | image_content | 三违照片链接 | **d** | MultiLineText | RW | WPS附件 | Sprint-WPS-02-C 真机补建（链接镜像） |
| rectifiedPhoto | rectified_photo | 整改后照片链接 | **e** | MultiLineText | RW | WPS附件 | Sprint-WPS-02-C 真机补建（链接镜像） |
| schematic | schematic | 示意图链接 | **f** | MultiLineText | RW | WPS附件 | Sprint-WPS-02-C 真机补建（链接镜像） |
| nickname | nickname | **昵称2**（原「昵称」） | C | MultiLineText | R | 历史遗留 | 真机证实列名为「昵称2」；仅展示，禁止作身份/关联键 |
| signupToday | signup_today | 当日是否报名 | R | MultiLineText | RW | 业务 | |
| isResubmit | is_resubmit | 是否补交 | T | MultiLineText | RW | 业务 | |
| uploadTime | upload_time | 提交时间 | U | MultiLineText | RW | 业务 | |
| sourceDate | - | 来源日期 | W | MultiLineText | R | WPS侧维护 | 不回灌 PG |
| marker | marker | 标记 | S | MultiLineText | RW | 业务 | |
| serialNo | serial_no | 编号 | V | MultiLineText | RW | 业务 | 真机证实为文本（非自动编号）；样例值 `L2572`。历史编号保持原值，禁止转换为 Record ID |
| inspectionId | - | 巡查编号 | 无列 | - | R | 预留 | reserved 语义，板上无对应列，未放开写入 |
| violatorEmployeeId | - | 违章人员ID | 无列 | - | RSV | 预留 | **本 Sprint 保持 reserved**；无可靠违章人员选择机制，禁止按姓名/重名自动匹配 |
| insprectionTime | - | 巡查时间 | 无列 | - | RSV | 预留 | 待 H5 |
| longitude / latitude | - | 经度 / 纬度 | 无列 | - | RSV | 预留 | 待 H5 / GPS |
| locationAddress / gridArea / patrolArea | - | 定位地址 / 所属网格 / 巡查区域 | 无列 | - | RSV | 预留 | 待 H5 |
| - | grid_id | - | - | - | PG-only | 系统 | 不下发 WPS |

### 附件字段（多维表原生附件，非 DISPIMG）

| 业务字段 | WPS 附件列 | 字段ID | 类型 | 说明 |
|---|---|---|---|---|
| 三违照片图片1 | 三违照片：图片1 | J | **Attachment** | 手机原生拍照位；v1 系统读取走链接镜像列 d |
| 三违照片图片2 | 三违照片：图片2 | K | **Attachment** | 同上 |
| 三违照片图片3 | 三违照片：图片3 | L | **Attachment** | 同上 |
| 整改后照片图片1 | 整改后照片：图片1 | Q | **Attachment** | 同上；系统读取走链接镜像列 e |

> 真机证实：附件字段类型为原生 `Attachment`，记录值形如 `{fileName, imgSize, size, source:"upload_ks3", type:"image/jpeg", uploadId,…}`（无直接 url）。
> 规范：不解析 `_xlfn.DISPIMG(...)`；系统侧图片读取走链接镜像列（d/e/f）`adapter.normalizeAttachments → { url, name, fieldId }` 归一，前端只见 url；原生附件列保留为手机端拍照位。

### 真机 Schema 全量记录（2026-09-08 实测）

sheet 3「表格视图」共 **29 字段**（20 原有 + 6 业务列 + 3 链接镜像列）：
`C 昵称2` `E 分组名称` `F 姓名` `G 所属岗位` `H 网格等级` `I 日期` `J 三违照片：图片1` `K 三违照片：图片2` `L 三违照片：图片3` `M 三违行为` `N 违章人姓名` `O 违章人性别` `P 违章人年龄` `Q 整改后照片：图片1` `R 当日是否报名` `S 标记` `T 是否补交` `U 提交时间` `V 编号` `W 来源日期` `X 巡查人员ID` `Y 上报状态` `Z 车辆类型` `a 违章类型结果` `b 是否需要整改` `c 整改人` `d 三违照片链接` `e 整改后照片链接` `f 示意图链接`

### 上线判断

- ✅ 6 个业务列已在真机补建并经真实 Schema 复核（X/Y/Z/a/b/c）。
- ✅ 3 个链接镜像列已真机补建（d/e/f），恢复 v1 图片链接通道。
- ✅ 代码映射已按真机 Schema 校正：`昵称→昵称2`、`检查日期→日期`、`编号` 语义修正、`getSchema` 端点修正（`/sheets`→`/schema`）。
- ✅ `.env` `WPS_DBSHEET_SHEET_ID` 已修正 2→3（原 2 为「仪表盘」，非数据表）。
