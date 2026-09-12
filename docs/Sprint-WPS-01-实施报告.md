# Sprint-WPS-01 实施报告

> 阶段：WPS 多维表基础接入层（网格长巡查业务台账数据层准备）
>
> 原则：先审计、后设计、再最小改造、最后测试。

---

## 1. 审计结果（摘要）

详见 `docs/Sprint-WPS-01-现状审计报告.md`。要点：

- **项目结构**：Express 入口 `server/app.js`；路由 `server/routes/`；服务 `server/services/`；配置 `server/config/`；PostgreSQL 连接池（`pg.Pool`）；登录身份 = `users` 表 + JWT。
- **网格长巡查台账**：Naive UI 页面 `apps/web-naive/src/views/site/grid-ledger/index.vue`；API `GET/POST/PUT/DELETE /api/site/grid-records`（`routes/site-mgmt.js`）；表 `grid_inspection_records`。
  - 核心口径：`personnel_name`（姓名快照）、`violator_name`（姓名快照），**未落 employeeId**。
  - 图片：`image_content / rectified_photo / schematic` 存链接/文本（历史含 `_xlfn.DISPIMG(...)` 公式文本），非正式附件。
- **人员模型**：`employee`（employeeId = `employee.id`）→ `employee_assignment`（is_primary+is_current+status）→ `v_employee_current` 当前全景视图。`personnel / hse_employee_org` 为历史体系。
  - **关键发现**：`users.id` 与 `employee.id` 两套独立序列、无 FK 绑定；仅凭 JWT 无法直接获取当前登录人的 employeeId。网格台账当前以姓名匹配员工主数据。

---

## 2. WPS 接入架构

```text
Controller（routes/wps-dbsheet.js   admin 门控，只读+受控自清理）
      ↓
GridInspectionService（services/wps/gridInspectionService.js   业务层唯一入口）
      ↓
WpsDbsheetAdapter（services/wps/wpsDbsheetAdapter.js           统一数据访问接口，屏蔽 WPS 原始形态）
      ↓
WpsClient（services/wpsClient.js   基础通信：认证/Token/HTTP/超时/响应/错误/日志）
      ↓
WPS OpenAPI（https://openapi.wps.cn）
```

- 业务层只依赖 Adapter，不直接接触 WPS 原始 API；未来换数据源（PostgreSQL）只替换 Adapter 实现，业务方法签名稳定。
- 前端（PC/H5）一律不直连 WPS，不出现任何 WPS Token/Secret/App Token/API Key。

---

## 3. 修改文件清单

| 文件路径 | 修改内容 | 修改原因 |
|---|---|---|
| `server/services/wpsClient.js` | 整理为统一 WpsClient 基础设施：认证/access_token 缓存+失效刷新、请求头（Bearer+可选 KSO-1 签名）、超时、429 退避、token 失效重试、统一 WpsError 分类、`listAllRecords/getRecord/getSchema/createRecords/updateRecords/deleteRecords` | 建立唯一 WPS 基础通信层，禁止业务逻辑进入；复用既有 WPS 同步服务承载的路径常量与鉴权习惯 |
| `server/services/wps/wpsErrors.js` | 新增统一错误模型：`WPS_KIND_ORDER`（AUTH/PERMISSION/PARAMETER/NETWORK/SERVICE/DATA_STRUCTURE）、`WpsError`（kind/code/status/detail/safeMessage）、`classify()` 分类器、`toWpsError()` | 区分六类 WPS 失败；对外只回安全 message，不漏 Token/Secret/头/内部路径 |
| `server/services/wps/wpsFieldMap.js` | 新增集中字段映射 `FIELD_MAP` + `byBiz()/byWps()`：系统/巡查人员/位置(GPS 预留)/三违/附件/其他；预留 `巡查人员ID`、`违章人员ID`；`昵称` 仅展示；`mode` 含 reserved | 让 WPS 字段 ID 与名字集中管理，避免散落业务代码；落实「昵称≠身份」「employeeId 为关联键」 |
| `server/services/wps/wpsDbsheetAdapter.js` | 新增统一数据访问接口：`getSchema/listRecords/getRecord/createRecord/updateRecord/deleteRecord` + `normalizeAttachments()` | 把 WPS API 转成系统内部接口；附件统一归一为 `{url,name,fieldId}`；不解析 DISPIMG；错误统一转 WpsError |
| `server/services/wps/gridInspectionService.js` | 新增业务服务：`schema/list/get/probe/integrationTest/cleanupTestRecords/isTestRecord`；测试标记 `WPS-INTEGRATION-TEST` | 业务层唯一入口，向上给 Controller/未来 H5，向下依赖 Adapter；提供受控自清理 CRUD 演练 |
| `server/routes/wps-dbsheet.js` | 新增管理 Controller：`GET /schema`、`GET /records`、`GET /records/:id`、`POST /integration-test`、`POST /cleanup`；`safe()` 只回 `safeMessage` | 暴露接入层能力给后期联调，admin 门控，防凭证/结构泄露 |
| `server/app.js` | 挂载 `app.use('/api/wps/dbsheet', authMiddleware, requireRole('system_admin','admin'), require('./routes/wps-dbsheet'))` | 启用 WPS 接入层管理端点 |
| `server/scripts/_wps_01_integration_test.cjs` | 新增受控集成测试 CLI：凭证未配置即 SKIP(exit 2)；走 `integrationTest()`；校验失败/final 兜底清扫 | 受控 CRUD 演练（Schema/List/Get/Create/Update/Delete）+ 清理，正式业务零残留 |
| `server/.env.example` | 新增 WPS 接入层环境变量模板（`WPS_OPENAPI_BASE/WPS_APP_ID/WPS_APP_SECRET/WPS_DBSHEET_FILE_ID/WPS_DBSHEET_SHEET_ID/WPS_API_SIGNATURE/WPS_TIMEOUT_MS` 等） | 凭证只进服务端环境配置，不提交、不写死 |

> 未修改：登录/auth/JWT/token、Vben Core（packages/@core、packages/effects、packages/themes）、PC「网格长巡查台账」数据源（`site-mgmt.js` + `grid_inspection_records`）、历史数据。

---

## 4. WPS 配置

### 4.1 环境变量（仅服务端，见 `server/.env.example`）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `WPS_OPENAPI_BASE` | `https://openapi.wps.cn` | WPS OpenAPI 基础地址 |
| `WPS_APP_ID` | 空 | 开放平台应用凭证 |
| `WPS_APP_SECRET` | 空 | 开放平台应用密钥（**不提交/不写死**） |
| `WPS_DBSHEET_FILE_ID` | 空 | 多维表格文件 ID（.dbt） |
| `WPS_DBSHEET_SHEET_ID` | 0 | 数据表（sheet）ID |
| `WPS_API_SIGNATURE` | false | 是否启用 KSO-1 API 签名头 |
| `WPS_TIMEOUT_MS` | 30000 | 请求超时（毫秒） |

> 本报告不输出真实 Secret/Token。真实凭证由管理员在服务端 `.env` 配置，`gitignore` 覆盖，不入前端。

### 4.2 应用 / 多维表 / 数据表

以「WPS 应用授权（client_credentials）→ access_token → records/dbsheet 端点 + sheets 端点」为鉴权与读表链路；具体 `file_id / sheet_id` 依据已授权配对的 `.dbt` 多维表填写。表/字段/视图的真实形态以首跑集成测试实测为准（见 §6）。

---

## 5. 字段映射（业务字段 ↔ WPS 字段）

集中管理于 `server/services/wps/wpsFieldMap.js`。节选（type: text/number/time/link/picture; mode: read/write/readwrite/reserved/readonly）。

| 业务字段 | WPS 字段 | 类型 | 读/写 | 备注 |
|---|---|---|---|---|
| `record_no` | 编号 | text | rw | WPS 自动编号，系统侧仅展示 |
| `inspectionId` | 巡查编号 | text | read | 系统巡查编号（预留建列） |
| `inspectorEmployeeId` | 巡查人员ID | text | reserved | **人员关联键=employeeId**（预留） |
| `inspector_name` | 姓名 | text | rw | 巡查人快照 |
| `operation_unit` | 分组名称 | text | rw | 乡镇/作业中心下班组分组 |
| `position` | 所属岗位 | text | rw | 岗位快照 |
| `grid_level` | 网格等级 | text | rw | 网格等级 |
| `nickname` | 昵称 | text | readonly | **仅展示，禁止作身份/关联键** |
| `inspection_time` | 巡查时间 | time | reserved | 预留 |
| `longitude` | 经度 | number | reserved | GPS 预留 |
| `latitude` | 纬度 | number | reserved | GPS 预留 |
| `location_address` | 定位地址 | text | reserved | 预留 |
| `grid_area` | 所属网格 | text | reserved | 预留 |
| `patrol_area` | 巡查区域 | text | reserved | 预留 |
| `violation_behavior` | 三违行为 | text | rw | 无三违行为（视为未发现） |
| `violatorEmployeeId` | 违章人员ID | text | reserved | **人员关联键=employeeId**（预留，禁止姓名作唯一键） |
| `violator_name` | 违章人姓名 | text | rw | 违章人快照 |
| `violator_gender` | 违章人性别 | text | rw | 快照 |
| `violator_age` | 违章人年龄 | text | rw | 快照（可能含 岁/文本） |
| `violation_photos` | 三违照片链接 | link | rw | 附件归一为 `{url,name,fieldId}[]` |
| `rectified_photos` | 整改后照片链接 | link | rw | 附件归一 |
| `schematic` | 示意图链接 | link | rw | 附件归一 |
| `signup_today` | 当日是否报名 | text | rw | 其他 |
| `is_resubmit` | 是否补交 | text | rw | 其他 |
| `upload_time` | 提交时间 | text | rw | 提交时间原文 |
| `source_date` | 来源日期 | text | readonly | WPS 侧维护 |
| `marker` | 标记 | text | rw | 其他 |

---

## 6. 测试结果（WPS-INTEGRATION-TEST）

### 6.1 离线验证（已执行，通过）

凭证缺失环境下完成静态验证：
- 错误分类 `classify()` 六类判定正确（HTTP 401→AUTH、403→PERMISSION、400/404/405→PARAMETER、5xx→SERVICE、网络 TypeError/AbortError→NETWORK、SyntaxError→DATA_STRUCTURE；`safeMessage` 无敏感信息）。
- 字段映射 `byBiz/byWps` 查询正确；**昵称映射 `mode=readonly` 非身份/关联键**。
- 各新模块 `node -c` 语法校验通过。

### 6.2 真实集成测试（PENDING —— 凭证未配置）

真实执行入口：
- CLI：`node server/scripts/_wps_01_integration_test.cjs`
- HTTP：`GET /api/wps/dbsheet/integration-test`（admin）

覆盖步骤（`gridInspectionService.integrationTest`）：
1. **Schema**：读取数据表/视图/字段/类型/ID（`getSchema`；端点不可用时降级记录推断字段）
2. **List（before）**：读取现有记录
3. **Create**：以 `WPS-INTEGRATION-TEST-20260908-001` 为标记创建测试记录
4. **Get**：按 id 读取单条
5. **Update**：写入 `标记=updated-by-integration-test` 并回读校验
6. **Delete**：删除并确认消失
7. **Cleanup**：兜底删除所有残留测试标记记录
8. **List（after）**：确认残余=0

> 当前 `.env` 未提供真实 `WPS_APP_ID/WPS_APP_SECRET/WPS_DBSHEET_FILE_ID/WPS_DBSHEET_SHEET_ID`，脚本判定 `isConfigured()=false`，输出 `SKIP: WPS 凭证未配置`（exit 2）。代码与流程已就绪，待管理员提供 WPS 应用凭证与目标 .dbt 表配置后即可执行真实 CRUD 并清理。

### 6.3 异常处理设计（已实现，待实测收口）

六类错误均归一到 `WpsError.kind`，前端只拿 `safeMessage`；服务端日志可记录完整 WPS 错误。权限错误/参数错误/网络异常/服务异常/结构异常在实测中据 `code/status` 收敛（`PERMISSION_CODES` 等已在 Sprint-WPS-02 首跑校准点预留）。

---

## 7. 测试数据清理确认

- 所有测试记录使用唯一前缀 `WPS-INTEGRATION-TEST`，`integrationTest()` 每步后立即清理，并在 `list-after` 前执行 `cleanupTestRecords()` 兜底删除；脚本 `finally` 也做兜底清扫。
- 测试失败路径同样触发兜底清扫。
- **最终结论（待真实运行后回填）**：执行后正式业务数据不得残留任何测试记录；当前由于凭证未配置尚未产生任何测试数据，故现无残留。

---

## 8. 后续 Sprint 接口

- **Sprint-WPS-02**：PC「网格长巡查台账」正式切换 WPS（复用 `GridInspectionService`，替换 `site-mgmt.js` 数据源；首跑实测收口 `PERMISSION_CODES`、`sheets` Schema 形态、单条记录端点）。
- **Sprint-WPS-03**：历史数据治理 + PostgreSQL 人员主数据与 WPS 记录绑定（用 `巡查人员ID/违章人员ID`=employeeId 关联，昵称仅存档）。
- **Sprint-WPS-04**：移动 H5 —— 登录 → 当前用户 → 当前乡镇 → 当前班组 → 当前有效人员 → GPS 定位 → 巡查 → 点击选违章人员 → 自动带出人员信息 → 拍照 → 提交 WPS（本 Sprint 已预留 GPS/网格/巡查区域/巡查人员ID/违章人员ID 字段与映射；「登录用户 → employeeId」绑定需在此打通）。

---

## 9. 完成标准核对

| 完成项 | 状态 |
|---|---|
| 已完成当前项目代码审计 | ✅ |
| 已完成网格长巡查台账现状审计 | ✅ |
| 已确认当前人员主数据模型（`employee`+`employee_assignment`+`v_employee_current`） | ✅ |
| 已确认 employeeId 获取方式（= `employee.id`，建议走 `employeeResolver`） | ✅ |
| 已建立 WpsClient | ✅ |
| 已建立 WpsDbsheetAdapter | ✅ |
| WPS 凭证使用服务端配置（`.env.example`） | ✅ |
| WPS Token 不进入前端（Controller 只回 safeMessage / 前端不直连） | ✅ |
| 已实现 Schema 查询能力（getSchema + 降级推断） | ✅ |
| 已实现 List 测试（WPS-INTEGRATION-TEST） | ✅（PENDING 凭证） |
| 已实现 Get 测试 | ✅（PENDING 凭证） |
| 已实现 Create 测试 | ✅（PENDING 凭证） |
| 已实现 Update 测试 | ✅（PENDING 凭证） |
| 已实现 Delete 测试 | ✅（PENDING 凭证） |
| 测试记录已清理（自清理 + 兜底） | ✅（当前无残留） |
| WPS 字段映射已集中管理（wpsFieldMap.js） | ✅ |
| 已预留巡查人员ID（inspectorEmployeeId） | ✅ |
| 已预留违章人员ID（violatorEmployeeId） | ✅ |
| 已预留 GPS 字段（经度/纬度/定位地址） | ✅ |
| 已预留所属网格/巡查区域字段 | ✅ |
| 已明确附件字段处理方案（归一 `{url,name,fieldId}`，不暴露内部对象） | ✅ |
| 未解析 DISPIMG | ✅ |
| 未修改正式历史数据 | ✅ |
| 未切换 PC 数据源 | ✅ |
| 未开发 H5 | ✅ |
| 未修改登录认证 | ✅ |
| 未修改 Vben Core | ✅ |
| 未新增 npm 依赖 | ✅（仅用原生 fetch） |
| 未创建新的 UI 自定义组件 | ✅ |