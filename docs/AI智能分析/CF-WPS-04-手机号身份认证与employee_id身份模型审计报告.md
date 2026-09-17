# CF-WPS-04 手机号身份认证与 employee_id 身份模型审计报告

> 阶段定位：CF-WPS-03 系列（WPS OAuth 验证）已收口；本阶段将移动端身份体系正式切换到
> **手机号 + WPS 移动端身份表 + 花名册员工编码 → employee_id + Worker Session**，
> 并明确 **WPS OAuth 身份路线归档**。
> 本阶段为 **审计 / 设计 / 验证**，不修改 HSE 生产代码、不写生产数据、不部署正式服务、不注册短信服务、不继续 WPS OAuth 作为正式身份方案。
> 引用资料：`G:\safety_vault\08_保险及人员管理\花名册\员工信息维护_20260910140825(1).xlsx`、`server/`、`安全看板vben/`、`grid-mobile-cloudflare/worker/`。

---

## 一、当前身份架构现状

### 1.1 现有 HSE 员工身份（生产，PC/现有移动端共用）
- **权威入口**：`server/services/authenticatedEmployeeResolver.js`
  - 链路：`req.user.id → public.users.id → public.users.employee_id → public.employee.id`
  - 设计红线：严禁姓名兜底、Fail-Closed、不改 JWT/login、`employee_id` 不进 JWT（每次实时查库）。
- **`public.employee` 表双键结构**（证据：`server/services/employeeService.js:455` 的 INSERT、`:439/:472` 唯一性校验、`rosterImportService.js`/`employeeImportV2Service.js` 的映射）：
  - `id`：BIGSERIAL 代理主键（即 `employee_id` 指向的 `employee.id`）。
  - `employee_code`：VARCHAR，**花名册「员工编码」映射目标**（导入映射 `'员工编码':'employee_code'`、`'工号':'employee_code'`）。
  - 其他：`name`、`phone`/`phone_hash`、`id_card`(加密)/`id_card_hash`、`gender`、`birth_date`、`person_category` 等。
- **结论**：系统内部早已区分「`employee.id`（代理主键，用于外键）」与「`employee_code`（花名册员工编码，业务主键）」。

### 1.2 现有移动端（Vben 内嵌）
- 位置：`安全看板vben/apps/web-naive/src/views/mobile/**`（index / grid / me / violation / rectify 等）。
- 认证：**复用 HSE 后端 JWT 登录 + `authenticatedEmployeeResolver`**（与 PC 同源同登录），并非独立身份体系。
- 授权判定：`mobile/grid/grid-access.ts` 仅为「前端展示门槛」，真实授权 100% 在后端 `requirePermission` + 行级 `own_grid`。

### 1.3 现有 WPS→PG 同步中的人员字段
- 同步目标表（WPS 同步主线）：`grid_inspection_records`（非 `hse_grid_inspection_records`），字段含 `inspector_employee_id`、`grid_id`、`image_content`、`rectified_photo`、`schematic`、`area_team`、`violation_behavior`、`violator_name`、`submission_fingerprint`、`attribution_status`、`source_channel`、`client_token`、`wps_record_id`。
- 归因逻辑：`server/services/wps/gridEnrichmentService.js`
  - 优先：`inspector_employee_id` 已存在 → `attributed`。
  - 否则：`wps_account_employee_map`（WPS 账号 → `employee.id`，当前 0 行）→ `gridScope.deriveGridIdForEmployee`。
  - 红线：禁姓名/手机/nickname 匹配、禁共享账号归属、多重映射视为不可信。
- 旧表 `hse_grid_inspection_records`（`init-dashboard-tables.js:72`）：同时含 `employee_id BIGINT FK→employee.id` **与** 冗余 `employee_code VARCHAR(64)`，佐证「代理键 + 业务编码」双写模式早已存在。

### 1.4 短信/验证码能力
- **审计结论：项目当前无任何短信供应商 SDK / 网关集成**（grep `twilio|aliyun|dysmsapi|qcloud|tencentcloud|sendSms|SmsClient` 于 `server/services` → 0 命中）。
- 提醒类能力（`reminderService.js` 等）为应用内/既有通道，非手机短信验证码。

---

## 二、旧 WPS OAuth 路线处理结论

> **WPS OAuth 身份路线：`ARCHIVED_FOR_CURRENT_MOBILE_IDENTITY`**

- 依据：CF-WPS-03-A/B/C/D 系列仅验证「WPS OAuth 能取得 user_id」，但本阶段正式确定 WPS 在本项目的定位为
  **互联网数据缓冲层 / 数据交换层**，而非企业员工身份认证平台。
- 既有 WPS OAuth POC（`grid-mobile-cloudflare/worker/index.js` 及 CF-WPS-03 系列报告）**保留为技术验证历史**，但：
  - **不得**继续作为移动端正式员工登录方案；
  - **不得**将 `WPS user_id` 写入/映射为 `employee_id`；
  - **不得**修改 HSE 生产代码以接入 WPS OAuth 身份；
  - 本阶段不删除历史 POC（尊重既存 frozen 纪律与审计追溯）。
- 新身份链：`手机号 → WPS 移动端身份表 → 花名册员工编码 → employee_id → Worker Session`。

---

## 三、新身份模型（统一口径）

```
手机 H5（Cloudflare Pages）
   ↓ 手机号 + 短信验证码
Cloudflare Worker（认证 / 身份匹配 / Session / WPS 代理 / 安全控制）
   ↓ 查 WPS「移动端身份表」（手机号精确匹配）
   ↓ employee_id = 花名册员工编码
   ↓ 校验身份状态 / 与花名册一致性
   ↓ 建立 Worker Session（HttpOnly Cookie 持有 employee_id）
本地 HSE / PostgreSQL（继续承担既有业务，不暴露公网）
   ↑ 仅经 HSE 后端 API / 既有 WPS→PG 同步间接写入
```

**三件不可动摇的事实**：
1. `花名册员工编码 = employee_id`（业务主键，直接复用，绝不重新生成）。
2. `手机号` = 登录身份匹配依据（仅匹配，不作主键、不作展示主键）。
3. `姓名` = 展示字段（绝不参与关联/匹配）。

**WPS 角色**：移动端身份表、花名册、网格长巡查台账、巡查照片/附件的云端缓冲。
**Worker 角色**：认证、身份匹配、Session、WPS API 代理、安全控制。
**HSE/PG 角色**：既有业务承载（履职考核、三违、整改），不因此项目暴露公网。

---

## 四、employee_id 来源确认

| 来源 | 结论 |
|------|------|
| 花名册 Excel（`员工信息维护_20260910140825(1).xlsx`，sheet `员工信息维护`，3250 行 = 1 表头 + 3249 数据） | 列 **B = `员工编码`**，3249 行非空 → **即 employee_id 唯一权威来源** |
| `public.employee.employee_code` | 导入映射 `'员工编码':'employee_code'`（`rosterImportService.js:29`、`employeeImportV2Service.js:65-66`）→ 与花名册员工编码一一对应 |
| `public.employee.id` | BIGSERIAL 代理键，仅作外键目标，非业务主键 |
| `wps_account_employee_map` | WPS 账号 → `employee.id`（旧 OAuth 路线残留，0 行，本阶段不启用） |

**确认**：`employee_id` 业务键 = 花名册 `员工编码` = `employee.employee_code`。
**禁止**：自生成 UUID、新工号、`WPS user_id`、手机号、姓名、身份证号 作为 `employee_id`。

> ⚠️ **关键兼容点（见 §十二）**：历史外键（`grid_inspection_records.inspector_employee_id`、`users.employee_id`、旧 `hse_grid_inspection_records.employee_id`）指向 `employee.id`（代理键）。
> 新模型以 `employee_code` 为身份主键，写入既有表时必须 **`employee_code → employee.id` 解析** 后落外键；建议在业务记录上**冗余 `employee_code`**（沿用既有双写模式）以便审计与排错。

---

## 五、WPS 两个基础表模型

### 表1：移动端身份表（WPS 多维表，云端缓冲）
| 字段 | 说明 | 约束 |
|------|------|------|
| `employee_id`（=员工编码） | 业务主键，来自花名册 | 必填、非空、唯一 |
| `姓名` | 展示 | 来自花名册 |
| `手机号码` | 登录匹配依据 | **正常态唯一**，精确匹配，禁同名兜底 |
| `网格长等级` | 网格长资格 | 枚举 |
| `部门` | 展示/归属 | 来自花名册 |
| `职位` | 展示 | 来自花名册 |
| `身份状态` | 正常 / 停用 / 离职 | 默认「正常」；禁删除历史员工记录 |

### 表2：花名册（WPS 多维表，企业正式人员基础数据）
| 字段 | 说明 | 敏感处理 |
|------|------|----------|
| `employee_id`（=员工编码） | 业务主键 | 来自花名册 |
| `姓名` | 展示 | — |
| `所属部门` | 归属 | — |
| `职位` | 展示 | — |
| `身份证号` | **敏感** | 不参与登录、不返 H5、不进 Session、不发前端、不落日志 |
| `直接上级` | 归属链 | — |
| `用工关系状态` | 在职/离职等 | 治理用 |

> 两表关联：`移动端身份表.employee_id → 花名册.employee_id`（员工编码一致）。
> 花名册字段结构已与 Excel 实证对齐（B 员工编码 / C 姓名 / D 所属部门 / E 职位 / H 身份证号(敏感) / K 直接上级 / L 用工关系状态）。

---

## 六、身份匹配规则（Fail-Closed）

登录时 Worker 在 WPS「移动端身份表」中以**手机号精确相等**定位单行：
1. 命中 0 行 → 拒绝（手机号不存在）。
2. 命中 >1 行（同手机号多有效身份）→ 拒绝（不唯一）。
3. 取 `employee_id`（=员工编码）→ 查花名册确认该编码存在且非离职。
4. 校验 `身份状态 = 正常`，否则拒绝（停用/离职）。
5. 移动端身份表与花名册 `employee_id` 不一致 → 拒绝并告警。

**硬性禁止**（与 `authenticatedEmployeeResolver` 红线一致）：
- 手机号匹配失败 → 改用姓名猜测 ❌
- 手机号匹配失败 → 改用身份证号猜测 ❌
- 手机号匹配失败 → 模糊搜索 ❌
- 同名员工自动选择一个 ❌
- 任何无法唯一确定身份的情形 → **拒绝 + 记录安全事件**（日志脱敏，不含身份证号/验证码）。

---

## 七、登录流程（目标方案）

```
H5 输入手机号
  → POST /api/auth/send-code  → Worker 调用短信服务下发验证码（服务端限频/防枚举）
  → 用户输入验证码
  → POST /api/auth/login      → Worker 校验验证码
        → 查 WPS 移动端身份表（手机号精确匹配，fail-closed）
        → 得 employee_id（员工编码）
        → 校验 身份状态=正常 且 花名册存在该 employee_id
        → 建立 Worker Session（HttpOnly Cookie，仅含 employee_id 等脱敏字段）
        → 返回登录成功 + 基础展示信息（姓名/网格长等级，不含身份证号）
```

- 接口仅设计（本阶段不实现生产）：`POST /api/auth/send-code`、`POST /api/auth/login`、`POST /api/auth/logout`。
- 验证码校验、限流、防爆破、防手机号枚举均在 Worker 服务端完成。

---

## 八、Session 设计（架构）

- 载体：HttpOnly + Secure + SameSite（Lax/Strict）Cookie，持有 `employee_id`（员工编码）与可选 `employee.id`（代理键，便于后端外键写入）。
- 属性：合理 TTL（如 8h）、过期重登、显式 Logout、服务端可吊销、防简单重放（绑定 Worker 签发签名/nonce）。
- **Session 禁存**：身份证号、WPS `access_token`/`refresh_token`、`APPKEY`/`APPSECRET`、明文验证码。
- 后续请求：`Session → employee_id → Worker 识别当前员工 → 访问巡查业务`。
- 现状：CF-WPS-03-A POC 的 callback 仅返回脱敏 user 且**未建 Session**（`AUTH_SESSION_STATUS = NOT_IMPLEMENTED`），本阶段正式要求补 Session 设计（仍属架构设计，不进入完整业务实现）。

---

## 九、短信验证码技术方案（仅方案，不注册）

- **能力现状**：无（§1.4）。
- **选型原则**（供下一阶段决策，本阶段不落地）：
  1. **不自行注册第三方短信服务、不购买、不写真实密钥到代码**（任务书 §十五）。
  2. Worker 环境约束：Cloudflare Worker 无持久磁盘，验证码与限流状态应置于 **KV / Durable Object / 或经 HSE 后端 API 代理**（推荐后者——由 HSE 后端持有短信密钥与发送，Worker 仅做协议转换与安全校验，避免密钥进 Worker）。
  3. 若由 HSE 后端承担短信发送：新增 `server` 侧「发送验证码 / 校验验证码」服务，密钥存 `.env`/Secret，Worker 经鉴权调用；WPS/移动端不触密钥。
  4. 验证码：服务端哈希存储 + 短期 TTL（如 5min）+ 单手机号限频（如 1 次/60s，每日上限）+ 失败次数封顶。
- **决策点（待负责人定）**：短信供应商选择、由 Worker 直连还是 HSE 后端代理。本阶段不预决。

---

## 十、身份数据完整性检查（仅报告，不改 WPS 正式数据）

- **检查 A**：移动端身份表 `employee_id` 必须在花名册中存在 → 否则标记孤儿身份。
- **检查 B**：移动端身份表 `手机号码` 不得重复（正常态唯一）→ 重复即阻断登录唯一性。
- **检查 C**：`身份状态=正常` 必须有 `手机号码` → 否则无法登录。
- **检查 D**：`身份状态=正常` 必须有 `employee_id` → 否则无法关联。
- **检查 E**：`employee_id ↔ 姓名` 可做一致性校验（仅告警，**不**作为关联键）。
- **检查 F**：花名册 `employee_id` 不得重复 → 与导入唯一性校验（`employeeService.js` 已做）一致。

> 执行方式：建议在 WPS 侧或 HSE 后端提供只读校验脚本/接口；本阶段只定义规则，不修改数据。

---

## 十一、安全风险

1. **身份证号泄露**：花名册含 `身份证号`（敏感列）。必须确保不进登录链路、不返 H5、不进 Session、不落日志。任何调试用脱敏/虚拟数据。
2. **手机号枚举**：send-code 接口须限频、统一响应、不暴露"是否存在"。
3. **验证码暴力**：服务端限频 + 失败封顶 + 绑定设备/签名。
4. **Session 重放/劫持**：HttpOnly+Secure+SameSite、短 TTL、可吊销、签名校验。
5. **WPS 数据治理**：移动端身份表/花名册在 WPS 云端，须控制 WPS 应用权限、字段最小化、避免身份证号入 WPS（见 §五 敏感处理）。
6. **公网暴露**：HSE/PostgreSQL 严禁因本项目暴露公网；Worker 仅经 WPS 缓冲 + HSE 后端 API 间接互通。
7. **身份路线混淆**：严禁 WPS OAuth `user_id` 与 `employee_id`（员工编码）混用；旧 OAuth POC 已归档，不得回灌。

---

## 十二、与现有 HSE / WPS→PG 的兼容性

### 12.1 employee_id 双键解析（核心）
- 既有写入均以 `employee.id`（代理键）为外键；新模型身份主键为 `employee_code`（员工编码）。
- **兼容方案**：移动端以 `employee_code` 为会话身份；写入 `grid_inspection_records` 等业务表前，由 HSE 后端/WPS 同步侧执行 `employee_code → employee.id` 解析（`employee` 表已有 `employee_code` 唯一键，解析开销低、确定性高）。建议在记录上冗余 `employee_code`（沿用 `hse_grid_inspection_records` 双写先例）。
- 既有的 `authenticatedEmployeeResolver`、`users.employee_id`、`wps_account_employee_map` **保持不变**。

### 12.2 WPS→PG 同步归因扩展（需后续决策）
- 现有归因：`inspector_employee_id` 已置 → attributed；否则 `wps_account_employee_map`（WPS 账号→employee.id）。
- 新手机身份**无 WPS 账号**，提交经 WPS「网格长巡查台账」缓冲。同步侧需新增第三条归因路径：**WPS 记录携带 `employee_code`（员工编码）→ 解析 `employee.id`**。
- 该扩展属下游（CF-WPS-05 或 WPS→PG 同步演进），本阶段仅标识为**必做决策项**，不阻塞本阶段身份模型审计。

### 12.3 现有 Vben 移动端
- 现有 `安全看板vben/.../mobile/*` 走 HSE JWT 登录，与本项目新 Cloudflare H5 **并行不冲突**；新 H5 为「独立静态 H5」，认证路径不同，不修改既有 Vben 移动端。

---

## 十三、对现有代码的影响范围

| 模块 | 本阶段影响 |
|------|-----------|
| `authenticatedEmployeeResolver.js` | **不变**（PC/现有移动端继续用） |
| `employee` 表 / `employeeService.js` | **不变**（已含 `employee_code`、`phone`） |
| `grid_inspection_records` / `wpsGridPullEngine` / `gridEnrichmentService` | **不变**（本阶段）；仅标注 §12.2 归因扩展待决 |
| `wps_account_employee_map` | **不启用**（旧 OAuth 残留，0 行保留） |
| `grid-mobile-cloudflare/worker/` | 归档 WPS OAuth POC；新增 `phone+sms` 认证路由（仅设计/后续实现） |
| `安全看板vben/.../mobile/*` | **不变** |
| HSE 登录 / JWT / 权限 | **不变** |
| PostgreSQL 生产数据 | **0 写入** |

---

## 十四、是否需要数据库变化

- **现有 `employee` 表**：已含 `employee_code`、`phone`/`phone_hash`、加密 `id_card`，**满足本阶段模型，无需变更**。
- **`grid_inspection_records`（WPS 同步主线）**：是否含冗余 `employee_code` 列待核实（旧 `hse_grid_inspection_records` 有；主线需确认）。若缺，建议**非破坏性追加** `employee_code VARCHAR(64)` 一列（不影响既有外键）。
- **WPS 侧**：需新建 2 张多维表（移动端身份表、花名册镜像）——属 WPS 配置，非 PG 变更。
- **结论**：本阶段**无强制 PG Schema 变更**；唯一可能项为「为 `grid_inspection_records` 补 `employee_code` 冗余列」（建议项，非阻塞）。

---

## 十五、下一阶段建议

1. **负责人决策项**：
   - 短信供应商选型，及「Worker 直连 vs HSE 后端代理」架构（§九）。
   - WPS→PG 同步的 `employee_code → employee.id` 归因扩展方案（§12.2）。
   - `grid_inspection_records` 是否补 `employee_code` 冗余列。
2. **WPS 配置**：在 WPS 建「移动端身份表」「花名册」两表，字段按 §五；导入花名册员工编码等（身份证号脱敏/不导入 WPS 为宜）。
3. **Worker 实现（下阶段）**：`/api/auth/send-code`、`/api/auth/login`、`/api/auth/logout`、Session 签发/校验、WPS 身份表精确查询（手机号）、`employee_code→employee.id` 解析（经 HSE 后端或只读 PG 代理）。
4. **完整性脚本**：实现 §十 A–F 只读校验。
5. **不进入 CF-WPS-05**：本阶段完成后停止，待上述决策与 WPS 配置就绪再推进实施。

---

## 十六、最终状态

```
CF-WPS-04_STATUS = PASS
```

**判定依据（满足 PASS 条件）**：
- 当前身份架构已完成审计（§一）；
- 旧 WPS OAuth 路线已明确归档 `ARCHIVED_FOR_CURRENT_MOBILE_IDENTITY`（§二）；
- 新身份模型、两表、匹配规则、登录、Session、完整性检查、风险、兼容性均已设计（§三–§十二）；
- **`employee_id` 来源明确**：花名册「员工编码」(Excel 列 B) = `employee.employee_code`（§四，实证）；
- 架构无关键阻塞：唯一需下游决策项（短信选型、WPS→PG 归因扩展、可选冗余列）均已显式列出并递延，不构成本阶段阻塞。

**遗留决策项（非阻塞，待负责人定）**：
- D1 短信供应商与发送架构（Worker 直连 / HSE 后端代理）；
- D2 WPS→PG 同步的 `employee_code → employee.id` 归因扩展；
- D3 `grid_inspection_records` 是否补 `employee_code` 冗余列。

> 说明：本阶段为审计/设计，未修改任何 HSE 生产代码、未写 PG、未部署服务、未注册短信、未推进 WPS OAuth 正式路线。报告作为后续开发正式依据。
