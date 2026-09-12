# 执行报告 14：事故/三检/维修/违章模块 vehicle_id 联动扫描

- 执行日期：2026-08-05 (GMT+8)
- 轮次：阶段14 — 车辆主数据联动（事故/三检/维修/违章）
- 前置轮次：执行报告-13（车辆主数据收敛完成）
- 本轮性质：**只读扫描与分析报告**（未修改任何代码文件、未连接数据库、未执行 SQL）
- 报告结论：**扫描完成**（发现 P0 级问题 4 项、P1 级 10 项、P2 级 8 项，建议下一阶段按优先级修复）

---

## 一、总体结论

四模块 vehicle_id 联动现状与前置表格基本一致，但**发现了前置探索未记录的关键差异**：

| 模块 | 前置结论 | 本轮复核 | 关键新发现 |
|------|---------|---------|-----------|
| 事故 | 有 vehicle_id，完整度"高" | **高（CRUD+附件+版本）但有 3 项 P0** | ① `accidents.vehicle_id` 字段**无 DDL 来源**（init-tables/ensureTables/SQL 迁移均未定义，真实库需人工加列否则写操作失败）；② 全部路由无 requireRole；③ 10 处 err.message 泄漏 |
| 三检 | 无 vehicle_id，完整度"低" | 低（仅新增+导入） | 新旧两表结构**完全一致**（仅改名无字段升级）；risk-center 统计仍查旧表（口径分裂） |
| 维修 | 不存在 | 未开发 | `vehicles.status` schema 枚举**不含"维修中"**但 BI/demo/import 依赖该值（口径分裂） |
| 违章 | 无 vehicle_id，完整度"高" | 高（人员三违） | **requirePermission 权限码未注册**——admin/safety_manager 写三违全部 403（仅 system_admin 可写） |

**整改优先级排序**：违章权限黑洞（P0，影响现场生产）≈ 事故无角色校验/泄漏（P0）> 事故 vehicle_id DDL 缺口（P0，写操作运行期风险）> 三检统计旧表引用（P1）> 维修状态枚举口径（P1）> 三检 CRUD 补齐（P1，工作量最大，建议独立轮次）。

**结论**：四模块中事故模块是唯一真正使用 vehicle_id 的模块，但存在字段 DDL 来源缺失与鉴权/安全漏洞；三检/违章不需要 vehicle_id（人员/驾驶员维度），维修模块不开发独立工单、仅需修复状态口径。**不建议**在本轮直接补三检 CRUD（工作量大且非 vehicle_id 联动核心），建议作为独立轮次。

---

## 二、事故模块审计

### 2.1 vehicle_id 字段使用现状

**字段定义（P0 风险）**：
- `server/init-tables.js`（42-63 行）`CREATE TABLE accidents` **无 vehicle_id 字段**（仅 id/no/accident_type/level/description/accident_date/occur_time/location/personnel_id/involved_person/responsibility/responsibility_level/loss_amount/casualties/injuries/status/remark/is_deleted/created_at/updated_at）
- `server/routes/accidents.js` `ensureTables`（75-100 行）只 ALTER 补 `rectification_deadline_days/related_hazard_id/related_emergency_id/casualties/injuries`，**未补 vehicle_id**
- `server/sql/` 下**无任何** `ALTER TABLE accidents ADD COLUMN vehicle_id` 迁移（`hse_fix69` 是 `hse_events.vehicle_id`，与 accidents 无关）
- **结论**：`accidents.vehicle_id` 在代码库中无 DDL 来源。INSERT（780 行）与 UPDATE（890 行）直接引用该列——真实数据库若未人工添加此列，事故创建/更新会抛 `column "vehicle_id" does not exist`。属**运行期高危隐患**（可能是真实库已手工加列但未入代码，需用户确认）。

**INSERT 使用**（780-795 行）：`b.vehicle_id || null`——**非必填**（schema `z.number().int().positive().optional()`）、**无车辆存在校验**（不查 vehicles 表）。

**UPDATE 使用**（890 行）：`vehicle_id = COALESCE($8, vehicle_id)`——支持修改但 **COALESCE 语义无法置空**（传 null 不生效）；无车辆存在校验。

**SELECT/列表**（665-680 行）：`SELECT accidents.*` **不 JOIN vehicles**、不返回车牌；筛选仅 `involved_vehicle ILIKE` 文本关键字（645 行），**无 vehicle_id 筛选参数**；`formatRow`（218-260 行）只输出 `involvedVehicle` 文本，**不输出 vehicleId**（前端编辑无法回显车辆 ID）。

**involved_vehicle 与 vehicle_id 关系**：冗余并存——`involved_vehicle`（文本，用于列表展示与关键字搜索）与 `vehicle_id`（ID 关联，预留但前端未使用）。当前实际"生效"的是文本字段。

### 2.2 数据一致性风险

- **孤儿事故风险（P1）**：`DELETE /api/insurance/vehicle/:id`（insurance.js 795-830 行）只软删 vehicles + 同步软删 `insurance_history`，**未处理 `accidents.vehicle_id` 引用**——软删车辆后事故仍指向已删除车辆（虽事故端无 JOIN 不报错，但 vehicle_id 语义悬空）。
- **无车辆存在校验（P1）**：创建/更新时仅信任前端传入 vehicle_id，不校验目标车辆存在且未删除。
- **事务完整性（OK）**：创建（775-816 行）与更新（881-944 行）均使用 `client.query('BEGIN/COMMIT/ROLLBACK')` + 版本履历（accident_versions）——事故主表与版本履历原子。
- **孤儿附件（P2）**：DELETE /:id（947-973 行）只软删事故主表，`accident_attachments` 附件未同步软删。

### 2.3 鉴权与安全

- **无角色校验（P0）**：`router.get/post/put/delete` 全部**无 requireRole**（`grep -c requireRole accidents.js = 0`），仅依赖 app 级 authMiddleware（登录即可）——POST/PUT/DELETE/附件上传/版本接口任何登录用户可写，与车辆模块 13 轮修复前同级别漏洞。
- **数据权限（无）**：列表无部门/人员范围过滤，任何登录用户可查全部事故。
- **错误处理（P0）**：`catch { res.json(error(-1, err.message)) }` 共 **10 处**直接泄漏 SQL/连接信息。

### 2.4 事故类型与车辆关联

- 类型枚举（139-142 行）：`traffic:'交通' / occupational:'职业伤害' / equipment:'设备' / fire:'火灾' / environmental:'环境' / other:'其他'`（兼容 '交通事故' → traffic）。
- **无强制关联**（P2）：交通事故不强制 vehicle_id 必填；非交通事故允许为空（schema 均 optional）。当前无"交通 ⇒ 必须有车辆"的校验逻辑。

### 2.5 前端调用情况

- API 路径：`安全看板vben/apps/web-antd/src/api/hse/accidents.ts` 调 `/accidents`（`requestClient.get('/accidents')` 等），对应后端 `app.js:371` `app.use('/api/accidents', accidentsRoutes)`——**不是 /api/insurance**。
- 表单传值：`views/accidents/index.vue` 中 **grep 不到 involvedVehicle/vehicleId/车牌 任何引用**——前端事故表单当前**不传 vehicle_id**，vehicle_id 是后端预留但前端未接入。

### 2.6 需要修复的问题清单

| 级别 | 问题 | 位置 | 建议 |
|-----|------|------|------|
| P0 | `accidents.vehicle_id` 无 DDL 来源 | init-tables.js / accidents.js ensureTables / sql 目录 | 补充幂等 `ALTER TABLE accidents ADD COLUMN IF NOT EXISTS vehicle_id BIGINT`（对齐人员保险 employee_id 迁移模式），并确认真实库状态 |
| P0 | 事故全部写接口无 requireRole | accidents.js 全部 router | POST/PUT/DELETE/attachments 补齐 `requireRole('admin','safety_manager')`（同车辆模块 13 轮） |
| P0 | 10 处 err.message 泄漏 | accidents.js 各 catch | 改 console.error + 安全文案（同车辆模块） |
| P1 | 车辆删除不联动 accidents.vehicle_id | insurance.js DELETE /vehicle/:id | 事务内决定策略：置空 vehicle_id / 阻止删除（车辆有关联事故时）/ 记录历史——建议**阻止删除并提示先处理关联事故** |
| P1 | 创建/更新无车辆存在校验 | POST/PUT | 传入 vehicle_id 时校验 `vehicles.id 存在且 is_deleted=false`，非法返回稳定错误 |
| P2 | UPDATE COALESCE 无法置空 vehicle_id | PUT 890 行 | 改显式 undefined 检查（同车辆 PUT 13 轮修复模式） |
| P2 | 列表不 JOIN vehicles、无 vehicle_id 筛选、不返回车牌 | GET / 680 行 | LEFT JOIN vehicles 返回 plate，支持 `vehicleId` 查询参数 |
| P2 | formatRow 不输出 vehicleId | formatRow 218-260 行 | 补 `vehicleId` 字段供前端回显 |
| P2 | 交通事故不强制车辆关联 | POST/PUT | 若业务要求"交通事故必须关联车辆"，加 type=traffic ⇒ vehicle_id 必填校验（需业务确认） |
| P2 | 删除事故不删附件 | DELETE /:id | 事务内同步软删 accident_attachments |

---

## 三、三检模块审计

### 3.1 表结构与新旧表混用问题

**两表字段完全一致（仅表名不同）**：
- 旧表 `vehicle_inspection_records`（init-driver-tables.js 29-47 行）与新表 `hse_driver_inspection_records`（init-risk-model-cleanup.js 55-73 行）字段逐列相同：`employee_id BIGINT NOT NULL / employee_name / vehicle_no VARCHAR(32) / inspection_date / inspection_type / inspection_items / result / problems_found / rectification_status / rectification_desc / inspector_name / remark / is_deleted / created_at / updated_at`
- **两表均无 vehicle_id 字段**——车辆关联仅 `vehicle_no` 文本

**迁移逻辑**（init-risk-model-cleanup.js 76-89 行）：`INSERT INTO 新表 SELECT 旧表 WHERE NOT EXISTS(新表.id=旧表.id)` 幂等迁移——**不删旧表、不标记已迁移**。风险：若迁移后旧表又有新数据写入（driver-test-data.js 种子脚本仍写旧表），迁移脚本再次执行会补迁（幂等 OK），但**运行中两表并存**。

**旧表引用点**（3 处）：
- `server/check-db-schema.js:9`（schema 校验清单）
- `server/driver-test-data.js:18`（测试种子写旧表）
- **`server/routes/hse-driver-risk-center.js:101`（统计接口查旧表——生产影响）**

### 3.2 业务定位与 vehicle_id 需求

- **主体是驾驶员**：两表 `employee_id BIGINT NOT NULL` 必填；`hse-driver-risk.js` 87-95 行按 employee_id 关联查询三检；接口入参 `employeeId` 必填（184 行校验）。
- **车辆是辅助维度**：`vehicle_no` 文本记录驾驶的车辆，无存在校验、无规范化（trim/大小写）。
- **vehicle_id 升级需求（中优先级）**：三检"出车前检查"语义下按车辆查询历史三检记录是有业务价值的（如排查某车历次检查结果），但当前无任何按车辆查询需求落地。**建议**：在 `hse_driver_inspection_records` 增加可空 `vehicle_id BIGINT`（写入时按 vehicle_no 精确匹配 vehicles.plate 关联，匹配不到留空并保留文本），不设 NOT NULL 以兼容历史数据。

### 3.3 CRUD 缺口

现有接口（`server/routes/hse-driver-risk.js`）：
- `POST /:employeeId/driver-risk`（驾驶员风险总览，含三检数据）
- `POST /driver-risk/license-demerit`（驾照扣分）
- `POST /driver-risk/inspection`（新增三检）
- `POST /driver-risk/inspection/import`（批量导入）
- risk-center（`hse-driver-risk-center.js`）：`GET /overview /drivers /demerit/statistics /accident/statistics`

**缺失**：GET 列表（分页/按车辆/按驾驶员筛选）、GET 详情、PUT 更新、DELETE 删除——三检记录一旦创建无法查看明细列表/修改/删除。**补齐优先级：P1**（但建议独立轮次，涉及面广）。

### 3.4 导入逻辑车辆匹配

`POST /driver-risk/inspection/import`（211-248 行）：逐条 `item.employeeId/employeeName/vehicleNo` 直接 INSERT——**vehicleNo 不做任何规范化**（不 trim/不大小写/不校验存在），**无 vehicle_id 自动关联**。改进建议：导入时按 `vehicle_no` 精确匹配 `vehicles.plate`（trim().toUpperCase() 后比对），命中则写入 vehicle_id，未命中留空并计入 rowErrors 提示。

### 3.5 统计接口旧表引用问题

**P1 口径分裂**：`hse-driver-risk-center.js:101` 的 overview 三检统计 `SELECT COUNT(DISTINCT vr.employee_id) ... FROM vehicle_inspection_records vr` 查**旧表**；而 `hse-driver-risk.js:89` 的驾驶员风险数据查**新表**。若新表有新三检数据，risk-center 的"三检执行人数/总次数/不合格数"会漏统计。**建议**：统一查 `hse_driver_inspection_records`（新表）。

### 3.6 需要修复/新建的问题清单

| 级别 | 问题 | 位置 | 建议 |
|-----|------|------|------|
| P1 | risk-center 统计查旧表（口径分裂） | hse-driver-risk-center.js:101 | 改查新表 `hse_driver_inspection_records` |
| P1 | CRUD 严重不全（无列表/详情/更新/删除） | hse-driver-risk.js | 独立轮次补齐：GET 列表（employeeId/vehicleId/日期范围筛选+分页）、GET /:id、PUT /:id、DELETE /:id |
| P1 | 写接口无 requireRole + 4 处 err.message 泄漏 | hse-driver-risk.js / risk-center.js | 补 requireRole + 安全错误 |
| P2 | 两表并存、种子脚本写旧表 | init-risk-model-cleanup.js / driver-test-data.js | 迁移脚本增加"旧表数据已全部迁出后归档/清理"步骤（人工执行）；种子脚本改新表 |
| P2 | vehicle_no 无规范化、无 vehicle_id 关联 | POST/import | 按 plate 精确匹配关联可空 vehicle_id；文本 trim |

---

## 四、维修模块评估

### 4.1 现有线索汇总

- **BI 驾驶舱依赖"维修中"状态**：`server/routes/bi.js:65` `COUNT(*) FILTER (WHERE status = '维修中') AS maintenance`——车辆安全汇总展示"维修中"车辆数。
- **演示/导入可写入"维修中"**：`demo-data.js:389` 车辆演示 statuses 含 '维修中'；`import.js:189` 车辆模块状态映射 '维修中'→'维修中'。
- **主入口 schema 枚举不含"维修中"**：`server/schemas/insurance.js:19` `status: z.enum(['在用', '停用', '报废'])`——通过 `/api/insurance/vehicle` 创建/更新**无法设置"维修中"**（zod 拒绝）。
- **无维修工单/保养记录表**、**无前端维修页面/菜单/路由**（`views/` 与 `router/routes/` 搜索 0 命中）。
- 岗位字典 `demo-data.js:143` 含"维修工"（人员岗位，非模块）；`hse-org-center.js:362` 有"维修组"组织单元（组织结构，非业务模块）。

### 4.2 模块必要性结论

- **无业务逻辑依赖维修记录**（除 BI 状态计数），无工单流转需求线索。
- **结论：本轮不开发独立维修模块**（无需求依据，开发成本高）。仅需修复**状态枚举口径**（P1）：
  - 方案 A（推荐）：`createVehicleSchema/updateVehicleSchema` 的 status 枚举改为 `['在用', '维修中', '停用', '报废']`，使主入口可设置"维修中"，与 BI/import/demo 一致。
  - 方案 B：确认业务上"维修中"是否应为瞬态（送修即置停用），若如此则统一 BI 统计口径为 `status IN ('停用')` 或由后端计算——需业务确认。
- **车辆状态字段保留**：`vehicles.status` 作为"维修中/停用"的单一状态表达，暂不引入独立工单表。

### 4.3 如果开发，建议数据模型（备选，后续轮次）

```
vehicle_repair_orders（维修工单）
  id BIGSERIAL PK, vehicle_id BIGINT NOT NULL（FK → vehicles.id，ON DELETE RESTRICT）,
  order_no VARCHAR, repair_type VARCHAR（保养/小修/大修/年检）,
  repair_shop VARCHAR, cost DECIMAL(15,2), mileage INT,
  fault_desc TEXT, send_date DATE, finish_date DATE,
  status VARCHAR（待送修/维修中/已完工/已验收）,
  handler_name VARCHAR, remark TEXT,
  is_deleted BOOLEAN, created_at/updated_at TIMESTAMPTZ
vehicle_repair_items（维修项目明细，可选）: repair_order_id FK, item_name, part_cost, labor_cost
```
关联 `vehicles.status='维修中'` 由工单流转驱动（送修置维修中、验收置在用）——留待有明确需求时评估。

---

## 五、违章模块定性

### 5.1 模块业务定性

- **三违 = 人员安全违章**（非交通违章）：`violation_records` 表（init-tables.js 6-40 行）字段为 `violator_name/violator_id`（违章人员）、`inspector/handler/punisher`（检查/处理/处罚人员维度）、`punishment_type/amount/rectification/review_result/need_retraining`——完整的人员违章闭环；`violator_id` 经 `violator_id_card`/姓名解析关联 `employee`（violations.js 12-32 行注释）。
- **无"交通违章"类型**：violations.js 与 init-tables.js 中 grep "交通" **0 命中**——三违模块不包含交通违章。
- **`vehicle_type_or_cleaner` 字段含义**：VARCHAR(128)（102 行），赋值 `b.vehicleTypeOrCleaner`（556 行）——从字段名与上下文判断为"车辆作业类/保洁员作业类"的**违章场景标签**（如"车辆作业类违章 vs 保洁作业类违章"），**不是交通违章的车辆关联**，无 vehicle_id 语义。

### 5.2 vehicle_id 需求结论

- **三违为人员维度违章，不需要 vehicle_id**（violator_id 已关联员工，车辆不是三违主体）。
- **交通违章处理**：事故模块 `accident_type` 已含 `traffic:'交通'/'交通事故'`（accidents.js 132 行）——交通违章/交通事故**归入事故模块统一管理**；无需单独交通违章模块。
- 结论：**violation_records 不添加 vehicle_id**；若未来要区分"涉车三违"，可用 `vehicle_type_or_cleaner` 文本标签或追加可空 `vehicle_no` 文本，不做车辆外键。

### 5.3 需要修复的问题清单

| 级别 | 问题 | 位置 | 建议 |
|-----|------|------|------|
| P0 | `requirePermission('hse:site-mgmt:violations')` 权限码未注册 | violations.js 526/649/738/776/878/915 行 + auth.js ROLE_PERMISSIONS_MAP | `HSE_MANAGER_PERMISSIONS` 增加 `'hse:site-mgmt:violations'`（admin/safety_manager/hse_manager 可写）；当前仅 system_admin('*') 可写，**admin 写三违 403**，影响现场管理网格三违维护 |
| P1 | 15 处 err.message 泄漏 | violations.js 各 catch | 改 console.error + 安全文案 |

---

## 六、跨模块共性问题

| 维度 | 事故 | 三检 | 违章 | 车辆（13 轮已修复，参照基准） |
|------|------|------|------|------|
| 写接口角色校验 | ❌ 无 requireRole（P0） | ❌ 无（P1） | ⚠️ requirePermission 码未注册（P0） | ✅ requireRole('admin','safety_manager') |
| 错误处理 | ❌ 10 处 err.message 泄漏（P0） | ❌ 8 处泄漏（P1） | ❌ 15 处泄漏（P1） | ✅ console.error + 安全文案 |
| 事务 | ✅ 创建/更新有事务+版本履历 | ❌ 无事务 | ⚠️ 部分（batch 等有） | ✅ 事务 |
| 车辆删除联动 | ❌ 不处理 accidents（P1） | N/A（无 vehicle_id） | N/A | ✅ 同步软删 insurance_history |
| 车辆存在校验 | ❌ 无（P1） | N/A（仅文本） | N/A | ✅ plate 查重 |

共性结论：**错误处理与鉴权是系统级问题**——保险模块（13 轮）已统一为"安全文案 + requireRole"，事故/三检/违章模块尚未跟进；建议按模块分批执行与 13 轮相同的加固模式。

---

## 七、下阶段建议

| 优先级 | 事项 | 归属 | 建议轮次 |
|-------|------|------|---------|
| P0-1 | 违章权限码注册（admin/safety_manager 可写三违） | auth.js ROLE_PERMISSIONS_MAP + violations.js | 下一轮立即修（影响现场生产） |
| P0-2 | 事故模块鉴权加固 + err.message 收敛 | accidents.js（对齐 13 轮车辆模式） | 下一轮 |
| P0-3 | `accidents.vehicle_id` DDL 补齐 + 真实库状态确认 | init-tables.js / accidents.js ensureTables / 迁移 SQL | 下一轮（需用户确认真实库是否已手工加列） |
| P1-1 | 车辆删除联动策略（事故有关联时阻止/置空） | insurance.js DELETE /vehicle/:id | 下一轮 |
| P1-2 | 车辆存在校验（创建/更新事故时） | accidents.js POST/PUT | 下一轮 |
| P1-3 | risk-center 统计改查新表 | hse-driver-risk-center.js:101 | 下一轮（一行改动） |
| P1-4 | vehicles.status 枚举含"维修中"（或统一 BI 口径） | schemas/insurance.js + bi.js | 下一轮（需业务确认语义） |
| P1-5 | 三检 CRUD 补齐 + vehicle_id 可空升级 | hse-driver-risk.js + 迁移 | **独立轮次**（工作量大，非 vehicle_id 联动核心） |
| P2 | 事故列表 JOIN vehicles / vehicle_id 筛选 / formatRow 补 vehicleId | accidents.js | 随 P0/P1 一起或后续 |
| P2 | 三检两表归档清理、导入按 plate 关联 | 迁移脚本 / import | 随三检轮次 |

**本轮明确不做**：不开发维修工单模块、不开发交通违章模块、不给三违加 vehicle_id、不给事故加"交通必填车辆"强制（待业务确认）、不补三检 CRUD（独立轮次）。

---

## 八、禁止操作确认

| 事项 | 状态 |
|------|------|
| 修改任何 .js/.ts/.vue/.sql 文件 | ❌ 未修改（唯一写入文件为本报告） |
| 连接/读取/修改真实数据库 | ❌ 未连接（全部信息来自代码 Grep/Read） |
| 执行任何 SQL 语句 | ❌ 未执行 |
| 运行迁移/种子/开发服务器 | ❌ 未运行 |
| 删除/覆盖用户文件 | ❌ 未删除/未覆盖 |
| 使用 Task 子代理做修改 | ❌ 仅使用 Grep/Read 工具做只读扫描 |
| 运行修改数据的命令 | ❌ 未运行（未执行 npm test——本轮纯扫描，无代码改动需回归验证；如需可下轮执行） |
