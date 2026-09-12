# Sprint-WPS-01 现状审计报告

> 阶段：WPS 多维表基础接入（网格长巡查业务台账数据层准备）
>
> 原则：先审计、后设计、再最小改造、最后测试。

---

## 0. 活动项目与前端技术栈声明

- **活动项目目录**：`G:\hse-dashboard`（本机工作区、项目记忆与可写沙盒）。
  - 任务书曾要求 `F:\deploy\hse-dashboard\安全看板vben`，但该目录不在本会话可写沙盒范围内，也不为本机工作区所引用。
  - Sprint-WPS-01 全部后端接入层代码均落在 `G:\hse-dashboard\server` 下；正式前端页面位于 `G:\hse-dashboard\安全看板vben\apps\web-naive`。
- **前端技术栈**：本系统实际使用并维护的是 **Naive UI** 体系（`apps/web-naive`，vben admin v5 + Naive UI），**不是** antd。
  - 仓库内保留了另一套 `apps/web-antd`（inspection/grid 等），属历史/对照工程，本 Sprint 不在其目录下做任何改造。
- Grid「网格长巡查台账」的当前页面为用户日常使用的 Naive UI 页面：`apps/web-naive/src/views/site/grid-ledger/index.vue`。

---

## 1. 项目结构

### 1.1 Express 启动入口

- `server/app.js` —— Express 应用装配与启动入口；路由注册、中间件、调度器初始化均在此。

启动链：

```text
server/app.js
   ├── require('./config/db')         （数据库连接池）
   ├── require('./middleware/auth.js')（JWT 认证 / 角色 / 权限）
   ├── require('./middleware/response.js')（统一响应 success()）
   ├── app.use('/api/...', routes/xxx)（路由挂载）
   └── require('./services/xxxScheduler').initXxxScheduler()（调度器，含 WPS 网格同步调度）
```

### 1.2 目录构成

| 职责 | 目录/文件 |
|---|---|
| Express 入口 | `server/app.js` |
| 路由（API） | `server/routes/`（`site-mgmt.js`、`wps-grid-sync.js`、`wps-dbsheet.js` 等） |
| 控制器 | `server/controllers/`（部分模块、少量按需使用） |
| 服务层 | `server/services/`（业务服务；WPS 相关为 `services/wpsClient.js`、`services/wpsGridSyncService.js`、`services/wps/*`） |
| 配置 | `server/config/`（`db.js` 数据源、`validateEnv.js` 环境校验） |
| 中间件 | `server/middleware/`（`auth.js`、`response.js`、`error.js`、`requestLogger.js`、`queryLogger.js`、`upload.js` 等） |
| 工具 | `server/utils/`（`encryption.js` 等） |
| SQL/迁移 | `server/sql/` |
| 脚本 | `server/scripts/`（数据导入、重算、受控测试等） |
| 环境配置 | `server/.env`（真实值，不提交）；`server/.env.example`（模板） |

### 1.3 当前数据库访问方式

- PostgreSQL，连接池 `server/config/db.js`（`pg.Pool`）。
- 连接串由 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` 等环境变量拼接（兼容 `DB_DATABASE`），见 `server/utils/validateEnv.js`。
- 业务代码统一 `const { pool } = require('../config/db')` 后 `pool.query(...)`，无 ORM。

### 1.4 HTTP / 请求封装、日志、错误处理

- **HTTP**：Node 原生全局 `fetch`（本项目已运行于支持 fetch 的 Node 版本），供 WPS 客户端使用，**未引入 axios**。
- **日志**：`middleware/requestLogger.js`（请求日志）、`middleware/queryLogger.js`（SQL 日志），配合 `console.*`。
- **错误处理**：`middleware/error.js` 统一错误出口；`middleware/response.js` 提供 `success()`/`fail()` 统一响应体。
- **权限**：`middleware/auth.js` — `authMiddleware` / `requireRole` / `requirePermission`，角色集见 `ROLE_PERMISSIONS_MAP`。

---

## 2. 网格长巡查台账现状

### 2.1 页面与菜单

- **页面**：`apps/web-naive/src/views/site/grid-ledger/index.vue`（Naive UI，用户日常使用）。
  - 另有 `apps/web-naive/src/views/site/grid/index.vue` 与 `apps/web-antd/src/views/inspection/grid/index.vue`，属历史/对照页面。
- **菜单**：一级「现场管理」体系下；数据同时被「三违管理 → 三违台账」子页复用。

### 2.2 API

路由文件：`server/routes/site-mgmt.js`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/site/grid-records` | 台账分页列表（页码/每页、关键词、片区、网格等级、上报状态、是否含三违、是否含整改照片筛选；服务端白名单排序） |
| GET | `/api/site/grid-records/filter-options` | 年/月、片区等筛选选项（聚合自 `grid_inspection_records`） |
| GET | `/api/site/grid-records/:id` | 单条详情 |
| POST | `/api/site/grid-records` | 新增 |
| PUT | `/api/site/grid-records/:id` | 编辑 |
| DELETE | `/api/site/grid-records` | 删除（批量） |
| DELETE | `/api/site/grid-records/all` | 全量清空（管理用） |
| GET | `/api/site/stats` | 统计 |

> 另有 `server/routes/wps-grid-sync.js`（既有 WPS 同步通道）与此台账衔接，本轮仅审计、不改其数据源逻辑。

### 2.3 数据表

表 `grid_inspection_records`（定义：`server/sql/grid_inspection_records.sql`），对应「宁津项目三违检查清单_三违检查记录表」17 列；统计侧另有 `hse-grid-inspection-records` 派生视图（`server/controllers/hse-dashboard.js` 使用）。

关键字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | serial PK | 主键 |
| area_team | varchar(100) | 片区/班组 |
| upload_time | varchar(50) | 上传时间（原始时间戳文本） |
| inspection_date | date | 检查日期（派生自 upload_time） |
| personnel_name | varchar(100) | **检查人姓名**（完成率/台账核心口径，仅姓名，非 employeeId） |
| grid_level | varchar(50) | 网格等级 |
| position | varchar(100) | 所属岗位 |
| violator_name / violator_gender / violator_age | varchar | 违章人姓名/性别/年龄（快照文本） |
| vehicle_type | varchar(100) | 车辆类型/保洁员 |
| report_status | varchar(50) | 上报状态 |
| image_content | varchar(255) | 图片内容 |
| violation_behavior | text | "三违"行为 |
| violation_type_result | varchar(255) | 三违类型.输出结果 |
| need_rectification | varchar(50) | 需要整改 |
| rectifier | varchar(100) | 整改执行人 |
| rectified_photo | varchar(255) | 整改后的照片 |
| schematic | varchar(255) | 示意图 |
| grid_id | int FK→grid_areas | 关联网格（按 片区/班组+网格等级 模糊匹配） |
| created_at / updated_at | timestamptz | 审计时间戳 |

### 2.4 字段口径结论（审计要点）

- 台账核心人员键是 **`personnel_name`（姓名快照）**，历史数据**未落 employeeId**。
- `violator_name` 同样是**姓名快照**，未落 `violatorEmployeeId`。
- **图片**：`image_content / rectified_photo / schematic` 均为 `VARCHAR(255)` 文本，实际存放图片 **链接/文本内容**（历史含 `_xlfn.DISPIMG(...)` 公式结果文本），**非二进制附件**，也非正式附件对象。

### 2.5 CRUD / 筛选 / 分页 / 详情

- 分页：服务端分页（`page`/`pageSize`，默认 20，上限 200），避免整表渲染（尤其每行图片缩略图）。
- 筛选：关键词模糊（姓名/片区/违章人/三违行为）、片区等值、网格等级等值、上报状态等值、真实三违开关、整改后照片开关。
- 排序：白名单列映射（`inspection_date` 默认最新在前 + `id DESC`），防注入。
- 详情/新增/编辑/删除均已具备。

---

## 3. 人员主数据模型现状（人员模型审计确认）

### 3.1 结论：当前实际人员模型

系统采用 **PostgreSQL 人员主数据 + 当前任职视图**，核心实体为 `employee` + `employee_assignment`（Sprint5.6 统一任职表），对外统一读取 `v_employee_current` 视图。`personnel` / `hse_employee_org` 为历史/补充体系。

```text
employee（人员实体，id 即 employeeId）
   ↓
employee_assignment（任职关系：org_unit/operation_unit/position/supervisor，
                     is_primary + is_current + status 判断当前有效性）
   ↓
v_employee_current（当前有效全景视图：组织/作业单元/岗位/上级，名称快照）
```

### 3.2 employeeId 如何获取

- **employeeId = `employee.id`**（库字段 `employee_id`）。
- 推荐获取入口：复用 `server/services/employeeResolver.js` 的 `resolveEmployee({ employeeId, employeeCode, idCard })`，稳定返回 `{ employee }` 或 `{ reason }`（`missing_employee_id / employee_not_found / employee_multiple_candidates / id_code_conflict / lookup_failed`），查询失败 **fail-closed**。
- 查询统一走 `v_employee_current`（过滤 `employee_deleted=false`）。

### 3.3 当前登录用户如何对应 employee（重要审计发现）

- 登录身份：`users` 表 + JWT（`req.user = { id, username, role, realName, jti }`），见 `middleware/auth.js`。
- **`users.id` 与 `employee.id` 是两套独立的 ID 序列，二者之间没有数据库级外键/绑定关系**（佐证：`server/sql/hse_fix_cycle_fk_to_users.sql` 注释明确 "users 与 employee 为两套独立 ID 序列，无对应关系"）。
- 因此：**仅凭 JWT 无法直接得到当前登录用户对应的 employeeId**；当前系统在业务层（如网格台账）实际以 **姓名（real_name/personnel_name）** 与员工主数据匹配，未在登录态直接绑定 employeeId。
- **对 Sprint-WPS-01 的含义**：WPS 巡查记录中的「巡查人员ID / 违章人员ID」必须预留 `employeeId` 字段；未来 H5 的「当前登录用户 → employeeId」绑定需要单独打通（进入 Sprint-WPS-04 范畴，本 Sprint 只预留字段）。

### 3.4 当前有效任职关系、组织、岗位、历史任职

- 判断：`employee_assignment.is_current=true AND is_primary=true AND is_deleted=false AND status='active'`，结合 `start_date/end_date`。
- 组织 `org_name / org_type` 来自 `hse_org_unit`；作业单元 `unit_name / unit_type` 来自 `hse_operation_unit`；岗位 `position_name / position_code / job_category` 来自 `position`。
- **存在历史任职记录**：`employee_assignment` 支持同一员工多任职（`start_date/end_date/status`），`v_employee_current` 取 `DISTINCT ON (e.id)` + `ORDER BY a.start_date DESC`。

### 3.5 花名册 / 组织 / 岗位视图说明

- 花名册导入与历史治理另有 `employee_*` 配套表（`employee_import_batch`、`employee_import_mapping_rule`、`employee_position_mapping_rule` 等）。
- 老体系 `hse_employee_org`、`personnel` 保留但非当前主链路（主链路为 `v_employee_current`）。本 Sprint **不重构、不迁移** 人员模型。

---

## 4. 可复用能力盘点

| 能力 | 位置 | 复用于 WPS 接入层 |
|---|---|---|
| 响应统一体 | `middleware/response.js`（`success`/`fail`） | 用于 WPS Controller 输出 |
| 认证/角色 | `middleware/auth.js`（`authMiddleware`/`requireRole`） | 用于 WPS 管理端点（admin 门控） |
| 错误出口 | `middleware/error.js` | 结合 WPS 安全 message 使用 |
| 请求日志 | `middleware/requestLogger.js` | 通用 |
| 数据库访问 | `config/db.js`（pool） | 后续 Sprint（入库/对账/人员解析）复用 |
| 人员解析 | `services/employeeResolver.js` | 后续 Sprint 人员关联复用（本 Sprint 仅审计） |
| WPS 同步既有服务 | `services/wpsGridSyncService.js` / 调度器 | 本 Sprint 在其基础上整理 WpsClient 基础设施，不改其业务数据源 |
| Node `fetch` | 全局原生 | WPS HTTP 请求基础（不新增 axios） |

---

## 5. WPS 接入最小改造点（新增清单）

针对现状，新增以下能力（均为**新增**，不修改既有 PC 数据源、登录、Vben Core）：

1. **WpsClient**（基础设施）— 新增 `server/services/wpsClient.js`
   - WPS 认证（应用授权 `client_credentials` → access_token）
   - Token 内存缓存 + 失效强制刷新
   - HTTP 请求 / 请求头（Bearer；可选 KSO-1 签名头）/ 超时
   - 429 退避重试、token 失效自动重试一次
   - 响应处理 + 统一错误分类（`WpsError`）
   - 日志埋点
2. **统一错误模型** — 新增 `server/services/wps/wpsErrors.js`
   - 类别：`AUTH / PERMISSION / PARAMETER / NETWORK / SERVICE / DATA_STRUCTURE`
   - `classify()` 分类器；对外仅回稳定 `safeMessage`（不漏 Token/Secret/头/路径）
3. **统一字段映射** — 新增 `server/services/wps/wpsFieldMap.js`
   - 业务字段 ↔ WPS 字段集中真源；预留 `巡查人员ID`、`违章人员ID`、GPS（经度/纬度/定位地址/所属网格/巡查区域）、附件链接
   - **「昵称」仅展示，不作身份/关联键；正式人员关联键为 employeeId**
4. **WpsDbsheetAdapter** — 新增 `server/services/wps/wpsDbsheetAdapter.js`
   - `getSchema / listRecords / getRecord / createRecord / updateRecord / deleteRecord`
   - 附件归一为 `{ url, name, fieldId }`；**不把 WPS 内部附件对象原样暴露**；**不解析 `DISPIMG` 公式**
5. **GridInspectionService** — 新增 `server/services/wps/gridInspectionService.js`
   - 业务层唯一入口：`schema / list / get / probe / integrationTest / cleanupTestRecords`
   - 受控测试标记 `WPS-INTEGRATION-TEST`，自清理
6. **管理 Controller** — 新增 `server/routes/wps-dbsheet.js`
   - `GET /schema`、`GET /records`、`GET /records/:id`、`POST /integration-test`、`POST /cleanup`
   - 在 `server/app.js` 挂载 `app.use('/api/wps/dbsheet', authMiddleware, requireRole('system_admin','admin'), ...)`（admin 门控，防凭证/结构泄露）
7. **环境变量** — 扩充 `server/.env.example`
   - `WPS_OPENAPI_BASE / WPS_APP_ID / WPS_APP_SECRET / WPS_DBSHEET_FILE_ID / WPS_DBSHEET_SHEET_ID / WPS_API_SIGNATURE / WPS_TIMEOUT_MS`（凭证仅服务端，不入前端、不入 Git）
8. **受控集成测试脚本** — 新增 `server/scripts/_wps_01_integration_test.cjs`
   - Schema/List/Get/Create/Update/Delete + 清理，复用 `WPS-INTEGRATION-TEST` 标记

### 边界（本 Sprint 明确不做）

- ❌ 不切换 PC「网格长巡查台账」数据源（数据仍走 `site-mgmt.js` + `grid_inspection_records`）
- ❌ 不迁移历史数据（339 条左右） / 不批量改历史 / 不删历史 / 不重建历史编号
- ❌ 不开发 H5 / GPS / 人员选择器 / 图片组件 / 地图 / 移动端
- ❌ 不新增 npm 依赖
- ❌ 不修改登录认证（登录/auth/JWT/token/用户认证）
- ❌ 不修改 Vben Core（packages/@core、packages/effects、packages/themes）
- ❌ 不创建 UI 自定义组件

---

## 6. 待办 / 风险提示

- WPS 准入（凭证/表配置）就绪后才能执行真实集成测试。
- `users ↔ employee` 无绑定关系：后续 Sprint 若需「当前登录用户 → 当前员工 → 所属乡镇/班组/岗位」，需在 Sprint-WPS-04 单独设计打通，本 Sprint 仅预留字段与记录。