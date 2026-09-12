# WPS-HSE 网格巡查巡查人员身份链专项审计报告

> 审计时间：2026-09-09 22:0x（GMT+8）｜性质：**只读专项审计，零修改**  
> 范围：`G:\hse-dashboard\server` + `安全看板vben\apps\web-naive` + PG `safety_dashboard` + WPS 板 cn229thwalDs/sheet3  
> 最终结论：**BLOCKED_BY_IDENTITY_MAPPING**（详见 §16，最小改造方案见 §11）



---

## 一、审计结论（先答核心问题）

**当前登录账号不能 100% 稳定唯一确定 employeeId。** 身份链的「解析逻辑」已经存在且 fail-closed（Sprint-WPS-02 建：`currentEmployeeContext` → `employeeResolver.resolveEmployeeByName`），但链路缺一个稳定锚点：**users 表没有任何 employee 绑定字段**，全链依赖 `real_name → 花名册姓名` 唯一匹配兜底。而现实是：

1. **users 全库仅 1 个账号**：`admin / real_name='管理员' / role=admin`，`'管理员'` 在 3025 人花名册中**零匹配** → 唯一现有用户走完身份链得到 `employee_not_found`，**fail-closed 拒绝创建巡查**。
2. 花名册同名严重（刘桂芹×5、刘秀芬×5、郭秀梅×3 等 15+ 组重名）→ 姓名兜底对相当一部分真实员工**结构性不可用**。
3. 全板 6189 条 WPS 记录的「巡查人员ID」**100% 为空**（全量扫描实证）——说明该链路自建成以来从未成功写出过一个身份。

因此结论不是「缺一列就完事」，而是**身份映射本身缺失** → `BLOCKED_BY_IDENTITY_MAPPING`。最小改造方案（§11）= 稳定绑定 + 新增列 + 复用现有解析器，三件套缺一不可。

## 二、当前身份链实际架构（以代码为准，非设计文档）

```
POST /auth/login（routes/auth.js:354）
  tokenPayload = { id: users.id, username, role, realName: users.real_name }
        ↓ JWT（HS256, type=access, jti, 默认 12h）
middleware/auth.js resolveAuthentication({checkUser:true})
  校验：签名/有效期/type/jti → 黑名单(fail-closed) → 回库校验 users 存在且 is_active
  req.user = { id, username, role, realName, jti }     ← 规范字段，不透传原始 payload
        ↓（app.js:246 app.use('/api', authMiddleware)，全 API 强制认证）
GET /api/current-employee（app.js:388）
  currentEmployeeContext.resolveCurrentEmployee(req.user)
    └─ employeeResolver.resolveEmployeeByName(realName)
         v_employee_current WHERE BTRIM(name)=BTRIM($1) AND employee_deleted=false
         0 条→employee_not_found；>1 条→employee_multiple_candidates；=1 条→命中
    └─ assignment_id 为空→no_current_assignment
  context = { userId, employeeId, employeeCode, employeeName, organization, operationUnit, position, assignmentStatus }
```

**登录身份四问回答**：JWT 字段 = `{id, username, role, realName}`；`req.user` = `{id, username, role, realName, jti}`；存在 `user.id` 且就是 `users.id`（checkUser 时回库复核）；存在 username 与 realName；当前登录用户可被**唯一识别为 users 行**（id 主键 + 回库校验 + 黑名单 + is_active，fail-closed）——即**用户级身份稳定，员工级身份不稳定**（§三）。

## 三、users → employee 映射分析

| 审计项                       | 事实                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. 正式 DB FK               | **不存在**（users 无任何 employee 引用列；两表无外键关系）                                                                                                                                              |
| B. users.employee_id      | **不存在**（users 实有 22 列：id/username/email×2/password_hash/role×2/real_name/metadata/department/phone/avatar/is_active/last_login_at/timestamps/visual_layout/menu_order，无 employee 绑定） |
| C. username→employee 稳定映射 | **不存在**（username 是登录名，与员工工号/花名册无对应规则）                                                                                                                                                |
| D. realName→employee 映射   | **存在但非稳定键**：仅姓名等值匹配；花名册 3025 人含 15+ 组同名（最多×5）；`users.id` 与 `employee.id` 属不同域（integer vs bigint），代码已明令禁止混同                                                                           |
| E. employeeResolver 实际规则  | `resolveEmployee`：employeeId/employeeCode/idCard(HMAC 哈希) 三键任一，多键必须同指一人，fail-closed；`resolveEmployeeByName`：姓名严格一对一，绝不取第一条                                                           |
| F. 同名 2+ 员工时              | 返回 `employee_multiple_candidates`，**拒绝**（不猜测、不选第一条）                                                                                                                                  |
| G. 找不到员工时                 | 返回 `employee_not_found`，**拒绝**；查询异常 `lookup_failed` 同样拒绝                                                                                                                             |
| H. 是否 fail-closed         | **是**（解析失败/异常/无任职一律阻断上层写入；安全中文提示，不泄内部细节）                                                                                                                                             |

**当前用户实证**：`users` 仅 `{id:1, username:'admin', real_name:'管理员'}` → 姓名解析 0 候选 → **现有唯一账号身份链不通**。

## 四、employeeResolver 分析

调用链（实际代码）：`req.user(realName) → currentEmployeeContext.resolveCurrentEmployee → employeeResolver.resolveEmployeeByName → v_employee_current(唯一命中) → employeeId`。

**本部分判定：BLOCKED（对当前用户基线）/ WARNING（对未来用户）**。理由：解析器本身实现正确（fail-closed、严格唯一、复用 v_employee_current DISTINCT ON 语义），可以**直接复用**；但它依赖的输入（realName 唯一匹配）对当前唯一账号 admin 必然失败，对未来账号在重名场景必然失败。「100% 稳定唯一」目前不成立，堵点在 users→employee 缺稳定绑定，不在解析器。

## 五、网格巡查 POST 创建链分析

`POST /api/site/grid-records`（site-mgmt.js:1623）按数据源开关分流：

**WPS 模式（当前生效：WPS_GRID_DATA_SOURCE=true）** → `gridInspectionRepository.create({user, data})`：

1. ✅ 读取 `req.user`，调用 `resolveCurrentEmployee`（fail-closed，失败抛 `IdentityError`，前端提交身份不可覆盖）
2. ✅ 获取 `ctx.employeeId`，写入 WPS `巡查人员ID` 列（wpsFieldMap biz=inspectorEmployeeId，readwrite，且**只允许**后端写入）
3. ✅ 同步写 `姓名=ctx.employeeName`（覆盖前端 personnelName，防代录）、岗位/分组取后端解析或前端快照
4. ❌ 不写 PG（WPS 为台账主数据源，设计如此，无双写）
5. violatorEmployeeId 保持 reserved 不写（无可靠违章人选择机制）

**PG 模式（WPS_GRID_DATA_SOURCE 非 true 时）** → 白名单 `GRID_RECORD_CREATE_CAMELS`（21 字段）循环取 `req.body` 拼 INSERT：

1. ❌ 不读 req.user 做身份解析（仅 auditLog 用了 req.user.id）
2. ❌ 不调用 employeeResolver
3. ❌ 无 employeeId 概念——表中无列可写
4. ⚠️ `personnel_name`（巡查人姓名快照）完全由前端提交，属于「前端自填巡查人」，违反「后端定身份」原则

**身份伪造风险回答**：两种模式下前端提交 `inspectorEmployeeId` 均不会被信任——WPS 模式被后端解析结果覆盖（字段级不可注入）；PG 模式被白名单剥除。**不存在伪造写入 employeeId 的通道**；真正的风险不是伪造，而是 PG 模式下身份压根没人写、WPS 模式下身份解析对现用户必然失败。

## 六、grid_inspection_records Schema 分析

实有 27 列：`id, area_team, upload_time, inspection_date, personnel_name, grid_level, position, violator_name, violator_gender, violator_age, vehicle_type, report_status, image_content, violation_behavior, violation_type_result, need_rectification, rectifier, rectified_photo, schematic, grid_id, created_at, updated_at, nickname, signup_today, marker, is_resubmit, serial_no`。

逐项排查：无 `inspector_employee_id / inspectorEmployeeId / inspector_id / inspector / creator_employee_id / created_by / created_user_id` 中的任何一个。

**现有字段能否表达「实际巡查人员」？不能。**

- `personnel_name`＝巡查人姓名**快照**（展示用），非身份键：无唯一性（同名 15+ 组），且来自前端/历史导入，不可作人员关联；
- `grid_id`＝**grid_areas.id（网格区域外键）**，供完成度统计聚合（gridCompletionService），与「谁巡查」语义无关，**严禁挪用**；
- `created_at/updated_at` 是时间戳，非创建人。
- 注意「创建人」与「巡查人」之辨（§六要求）：表中连创建人字段也没有；且本业务假设明确记录在案——**当前登录用户 = 本次系统登记的巡查人员**（对 WPS 模式本就如此实现；代录场景未来若出现，需另立「代录人」字段，本期不做）。

## 七、前端身份传递分析（grid-ledger/index.vue）

- 新增弹窗 `formModel` 含 `personnelName`（NInput「选填」，用户可自由填写）等 16 字段，**无 inspectorEmployeeId 字段、不发送任何身份字段**；
- 全前端代码 `grep current-employee|currentEmployee` **零命中**——Sprint-WPS-02 的 `GET /api/current-employee` 前端从未消费（纯后端能力）；
- 单元格编辑白名单（EDITABLE_CAMEL_TO_PG 19 字段）含 `personnelName`（快照可编辑），不含任何身份键；
- 结论：前端不是身份权威来源 ✅（无伪造通道）；但前端也未做「我的身份」展示/预填，身份链对用户完全不可见。

## 八、WPS/PG 架构影响

当前开关（server/.env 实测）：`WPS_GRID_DATA_SOURCE=true`、`WPS_GRID_SYNC=false`。

按现有架构（wpsFieldMap 头注即设计真源）：**PG = 人员主数据与身份关联；WPS = 巡查业务台账（业务快照，含巡查人员ID 列）**。因此：

- WPS 模式创建：身份快照（巡查人员ID=employeeId + 姓名快照）应保存在 WPS 行内——代码已实现，但见 §九实证：从未写出成功值；
- PG 侧 `inspector_employee_id` 的角色：承载「PG 模式创建的记录」及「历史/镜像记录」的人员关联键，供与 `v_employee_current` 做人员级关联统计；不在 FIELD_MAP 18 字段内 → 不影响 canonicalHash/sync_hash，与 WPS-03 迁移及未来下行同步零冲突（同 vehicle_type 等 PG_ONLY 列语义）；
- `WPS_GRID_SYNC=false` 保持不动；本审计未改任何 WPS 数据。

## 九、历史数据影响

- **327 条已迁移记录（PG）**：表中无任何可保存巡查人员的字段 → 当前**无处可存**身份；其 WPS 侧原行「巡查人员ID」为空。
- **12 条人工确认记录（赵书坤→7085×6、郭秀梅→7947×6，CONFIRMED_BY_USER）**：具备回填条件——绑定关系已确认并存档（wps03b-batch3-adjudication-dossier.json），映射链 sync_map→pg_record_id 已 12/12 验证（见 Batch3 DRY-RUN 报告）；唯一前置条件是「目标列存在」（PG 方案 A）或「授权 WPS 写巡查人员ID 列」（方案 B）。**本次不回填。**
- **其他历史记录**：`personnel_name` 快照 + 花名册存在 15+ 组同名 → 按「不允许猜测/不允许姓名模糊匹配/不允许批量自动绑定」纪律，**判定为不可确定**，保持身份空白，等待后续逐批人工裁定。

## 十、风险与问题清单

| #  | 级别 | 问题                                                                                                               |
| -- | -- | ---------------------------------------------------------------------------------------------------------------- |
| R1 | 🔴 | users→employee 无稳定绑定；唯一现有账号 admin（real_name=管理员）身份链必然失败 → WPS 模式新增巡查当前**整个系统不可用**（fail-closed 422/IdentityError） |
| R2 | 🔴 | 花名册 15+ 组同名（×5 最多）→ 姓名兜底对部分员工结构性失效                                                                               |
| R3 | 🟠 | PG 表无任何身份列；PG 模式下巡查人身份完全缺位且 personnel_name 前端自填                                                                  |
| R4 | 🟠 | WPS 板 6189 条记录巡查人员ID 全空（全量实证）→ 身份链从未端到端跑通                                                                        |
| R5 | 🟡 | grid_id 语义=网格区域外键，存在被误用为身份列的隐患（已完成代码级澄清，留档警示）                                                                    |
| R6 | 🟡 | `GET /api/current-employee` 已建成但前端零消费，身份不可见                                                                      |
| R7 | 🟡 | users.id(integer) 与 employee.id(bigint) 异域不同源，混同即事故（代码已有禁令，保持）                                                   |

## 十一、最小改造方案（只提方案，不执行）

```
HSE 登录账号 → users.id（已稳定）
    ↓ [新增1] users.employee_id 绑定列（或 users_metadata），管理端人工指定，一人一员工
employee（v_employee_current 校验存在且唯一、未删除）
    ↓ [复用] currentEmployeeContext（改造解析优先级：employee_id 直连 > 姓名兜底）
employeeId
    ↓ [新增2] grid_inspection_records.inspector_employee_id varchar(20)（可同批加 violator_employee_id 备用）
POST /api/site/grid-records 后端自动写入（两种模式统一）
```

1. **新增1（绑定）**：`ALTER TABLE users ADD COLUMN employee_id bigint`（可空唯一）+ 管理员在用户管理里为每个账号指定员工；解析时先走 employee_id 直查 `v_employee_current`（复用 `resolveEmployee` 的 byId 分支），查无/已删除 fail-closed；姓名兜底保留但降级为第二优先级。此改动不改登录/JWT 代码（payload 不变，绑定为库内读取）。
2. **新增2（落点）**：`ALTER TABLE grid_inspection_records ADD COLUMN inspector_employee_id varchar(20)`（字符串列，与花名册 employee_id 文本形态一致；不入 FIELD_MAP/canonicalHash，同步零影响；禁用 grid_id）。
3. **写入点**：`POST /grid-records` PG 分支在 INSERT 前调用 `resolveCurrentEmployee(req.user)`，失败即拒绝（对齐 WPS 分支语义）；`inspector_employee_id=ctx.employeeId` 由后端写入，白名单不含该字段（前端永不可指定）。UPDATE 分支不开放该列（见 §13）。
4. **不做**：不改 employeeResolver 核心逻辑（直接复用）；不批量回填历史；不动 WPS；不建前端身份选择器。

## 十二、是否需要新增 inspector_employee_id

**需要。** 判定依据：27 列中无任何字段能可靠表达「实际巡查人员」（§六逐项排除）；`personnel_name` 是非唯一快照、`grid_id` 是区域外键。按纪律——不是因为「看起来规范」才加，而是**客观无落点**。同时明确：只加这一列（+备用 violator 列可选项）即满足需求，不引入员工快照冗余列（姓名/部门快照已有 personnel_name/position/area_team 承载）。

## 十三、新建记录身份写入方案

- **写入时机**：PG 分支 INSERT 前（service 层点：site-mgmt.js POST handler 内、白名单组装之后、pool.query 之前调用解析）；WPS 分支已在 `gridInspectionRepository.create` 内实现（保持）。
- **写入值**：仅 `ctx.employeeId`；解析失败→整单拒绝（409/422 + 现有 safeMessage），**禁止**降级为「无身份记录」。
- **编辑场景**：`inspector_employee_id` **一经写入不可通过普通接口修改**——UPDATE 白名单（EDITABLE_CAMEL_TO_PG / GRID_RECORD_UPDATE 白名单）不加入该列；纠错走管理员通道（后台脚本/管理接口，另行授权），审计留痕。
- **前端**：新增/编辑表单不出现巡查人员身份字段；后续可选在详情/列表以只读形式展示解析后身份（消费 GET /api/current-employee 或行内字段），非本期必需。

## 十四、历史 12 条数据处理方案

维持 Batch 3 DRY-RUN 报告结论与既定纪律：

- 绑定已确认（赵书坤→7085、郭秀梅→7947，CONFIRMED_BY_USER），映射链已 12/12 验证；
- 回填时机 = **方案 A 的 inspector_employee_id 列落地之后**（先 ALTER → 重跑 `_wps03b_batch3_dryrun.cjs` 应转 PASS → 人工批准后 EXECUTE 12 条 UPDATE）；或与「新增1」绑定列同步施工时一并处理；
- 在列落地前，任何形式的回填（含 WPS 侧写巡查人员ID 列）均不执行。

## 十五、验收标准（供下一步实施 Sprint 使用）

1. 给定任一启用账号，`GET /api/current-employee` 返回唯一 employeeId 或明确 fail-closed 错误（不出现第二候选被静默采用）；
2. `POST /api/site/grid-records`（两种模式）成功记录的 `inspector_employee_id`（或 WPS 巡查人员ID）＝ 后端解析 employeeId，与登录账号一一对应；
3. 前端提交含 `inspectorEmployeeId` 的 payload 不得改变落库身份（防伪造回归用例）；
4. UPDATE 接口对 `inspector_employee_id` 的修改请求被忽略/拒绝；
5. 重名员工账号在绑定缺失时创建巡查被拒绝且提示明确（不误绑）；
6. 12 条历史记录回填后：`SELECT COUNT(*) FROM grid_inspection_records WHERE inspector_employee_id IN ('7085','7947')` = 12，且其余 2039 条该列仍为 NULL；
7. 全程 sync_hash/FIELD_MAP 零变化（迁移与同步回归通过）。

## 十六、本阶段未修改内容（执行纪律留档）

零 PG 写入（仅 SELECT information_schema/业务表/视图）、零 ALTER/INSERT/UPDATE/DELETE、零 .env 修改、零登录/JWT/auth 代码改动、零 users/employee/employee_assignment 改动、零 WPS 写入（仅只读 listRecords 抽样/全量扫描）、零 sync_map 改动、零 npm 依赖、零新组件、零 Vben Core 改动；未执行 Batch 3 EXECUTE、未回填 12 条历史身份、未开 WPS_GRID_SYNC。本报告完成后立即停止，等待审核。
