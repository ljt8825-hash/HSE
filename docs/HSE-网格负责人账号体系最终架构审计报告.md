# HSE 网格负责人账号体系最终架构审计报告

> 只读专项审计 · 全程零写入 / 零 DDL / 零代码修改 / 零账号创建
> 审计时间：2026-09-10 ｜ 项目：G:\hse-dashboard ｜ 生效库：safety_dashboard（PostgreSQL，public schema）
> 证据产物：`server/scripts/output/audit-gridowner-step1-schema.json`、`audit-gridowner-step3-account-dryrun.json`、step2 只读统计（控制台）

---

## 一、执行摘要（核心结论）

**AUDIT_STATUS = READY_FOR_IMPLEMENTATION**

业务提出的身份链设想：

```
网格负责人 → 按姓名匹配花名册 → employee_id → 生成系统账号 → 登录 → grid_inspection_records.inspector_employee_id
```

**方案整体成立，但其中"按姓名匹配花名册"这一步是多余且有害的，必须删除。** 原因是系统里**已经存在稳定的「网格 → 员工」ID 关系**：`grid_areas.personnel_id` 就是 `employee.id` 的外键，62 个网格实测 100% 填充、零孤儿、零重名歧义。业务设想里"按姓名匹配"反而会把这条已经确定的 ID 链退化成姓名匹配——而花名册有 85 组同名（182 人），仅 62 个负责人里按姓名匹配就已产生 **2 例多命中**（郭秀梅、赵书坤，正是 WPS-03-B 暂缓的两人）。

因此最终身份链应修正为：

```
网格负责人 = grid_areas.personnel_id（已是 employee.id，直接采用，不走姓名）
        ↓
按 personnel_id 读花名册取手机号 → 生成 username/初始密码
        ↓
创建 users 并写入 users.employee_id（方案 B）
        ↓
登录 → req.user.id → users.employee_id → 稳定 employee_id
        ↓
创建网格巡查 → 后端自动写 grid_inspection_records.inspector_employee_id（前端不可传）
```

**一句话结论**：地基（网格↔员工 ID）已经具备，缺的只是三段"最小补齐"——① `users.employee_id` 绑定列 ② `grid_inspection_records.inspector_employee_id` 身份列 ③ 一个拼音首字母工具函数（后端当前无拼音依赖）。三者都不触碰登录/JWT/auth 既有逻辑，属最小、可回退改造。

---

## 二、当前实际身份链（现状，逐段代码实证）

```
登录 POST /api/auth/login
    ↓  routes/auth.js：校验 username/password（bcrypt）
JWT payload = { id: users.id, username, role, realName }
    ↓  middleware/auth.js：verify + jti 黑名单 + checkUser 回库复核（fail-closed）
req.user = { id, username, role, realName, jti }
    ↓  user.id 就是 public.users.id
realName（= users.real_name）
    ↓  currentEmployeeContext → employeeResolver.resolveEmployeeByName(realName)
employee（按姓名唯一匹配 v_employee_current，命中多个→fail-closed 抛错）
```

**现状致命缺口**：
- `users` 与 `employee` 是**两套独立 ID 体系**，`public.users` 无任何 employee 绑定列（无 FK、无 employee_id、无 employee_code）。
- 身份下沉**唯一途径是 real_name → 花名册姓名唯一匹配**，实现正确且 fail-closed，但依赖"姓名唯一"这一脆弱前提。
- **全库仅 1 个账号 admin（real_name='管理员'）**，在 3025 人花名册零匹配 → 现存唯一账号的身份链必然失败。
- 花名册 85 组同名（182 人），姓名兜底对这些人结构性失效。

→ 结论：**登录身份（用户级）稳定，员工身份（员工级）不稳定**。这正是本方案要解决的根问题。

---

## 三、审计 A：网格负责人数据源与「网格↔员工」关系

### 3.1 数据来源（已定位）
- 三级菜单「网格巡查管理」下的网格台账，前端页面 `apps/web-naive/src/views/site/grid/index.vue`，后端 `routes/site-mgmt.js` 的 `/grid-areas` 系列端点，数据表 **`grid_areas`**。
- 「网格负责人」在表中由**两列**表达：
  - `grid_areas.name`（varchar，NOT NULL）——负责人**姓名**（展示用）
  - `grid_areas.personnel_id`（bigint，nullable）——负责人**员工 ID**，即 `employee.id`

### 3.2 关键实测（step2 只读统计，62 个网格）

| 指标 | 值 | 含义 |
|---|---|---|
| 网格总数 total | 62 | 全部启用网格 |
| name 有值 | 62/62 | 负责人姓名无空 |
| **personnel_id 有值** | **62/62** | **负责人 ID 全部填充** |
| personnel_id 为空 | 0 | 无缺失 |
| distinct personnel_id | 62 | 一员工一网格，无一人多网格 |
| 孤儿（personnel_id 在 employee 找不到） | 0 | 外键完整 |
| 绑定已删除员工 | 0 | 无失效绑定 |
| **name 与绑定员工姓名不一致** | **0** | name 与 personnel_id 指向同一人 |
| 同名负责多网格 | [] | 无 |
| 同员工多网格 | [] | 无 |

### 3.3 姓名匹配 vs ID 直连（决定性对比）
对同样 62 个负责人分别做两种解析：
- **按 personnel_id 直连 employee**：unique=62、multi=0、no_match=0 → **零歧义**
- **按 name 匹配 v_employee_current**：unique_match=60、**multi_match=2**、no_match=0 → 郭秀梅、赵书坤两人姓名多命中

→ **业务设想的"按姓名匹配花名册"是退步**。系统已有 `personnel_id` 稳定 ID，必须直接复用，禁止再引入姓名匹配这一步。这也回答了 WPS-03-B 遗留的 12 条：郭秀梅/赵书坤之所以当初"多人匹配"，正是因为走了姓名；改用 personnel_id 后歧义根除。

### 3.4 前后端读写
- 前端 `grid/index.vue`：负责人以「员工选择器」选取，提交时携带 employee 主数据；列表展示 name。
- 后端 `formatGridAreaRow`：回读 `personnel_id` 关联 employee 输出姓名/岗位。
- `gridCompletionService`：完成度统计按 `grid_areas.id`（即 `grid_inspection_records.grid_id` 外键）聚合，与"谁巡查"无关。

### 3.5 负责人调整对历史记录的影响
- 历史巡查记录当前**不含**任何 employee 身份列，`personnel_name` 只是姓名快照。改负责人**不会**追溯改写历史（这是好事）。加 `inspector_employee_id` 后同样应遵循"写入时快照、事后不随负责人变动"的原则。

---

## 四、审计 B：花名册主数据与手机号唯一性统计

数据源：`employee` / `employee_assignment` / `v_employee_current`（视图，含在岗关联）。employee_id 为 bigint 主键，稳定不变，是长期身份键的天然候选。

### 4.1 全库真实统计（step2，只读）

| 指标 | 值 |
|---|---|
| 员工总数 | 3025 |
| 有手机号 phone 非空 | 1388 |
| 无手机号 | 1637 |
| 手机号"看起来是 11 位" | 0（**见注**） |
| 手机号重复组 / 人数 | 0 / 0 |
| **同名组 / 同名人数** | **85 / 182** |
| 姓名+手机号仍重复 | 0 / 0 |
| 一员工多在岗行 | 0 |

> **注（关键）**：`phoneValid11=0` 不是数据缺失，而是 **`employee.phone` 以 AES-256-GCM 密文（`ENC:` 前缀）存储**。解密后 1388 个手机号 **1388/1388 均为合法 11 位**、零异常（step3 实证）。即"手机号可用性"其实完好，只是密文态下正则不匹配。

### 4.2 结论
- **employee_id 稳定、唯一、可作为长期身份键**；姓名不可作长期键（85 组同名）。
- 手机号在花名册整体覆盖 46%（1388/3025），但**在 62 个网格负责人子集里覆盖 62/62**——本方案只给网格负责人建账号，手机缺失对本期零影响。
- 手机号唯一（零重复），后四位可安全参与账号规则。

---

## 五、审计 C/D：账号生成规则可行性（DRY RUN）

业务规则：`username = 姓名首字母 + 手机号后4位`，`初始密码 = 同上`。

### 5.1 对 62 个网格负责人的 DRY RUN（step3，零 INSERT）

| 指标 | 值 |
|---|---|
| 负责人总数 | 62 |
| personnel_id 缺失 / 孤儿 / 已删除 | 0 / 0 / 0 |
| 手机缺失 PHONE_MISSING | 0 |
| 手机异常 PHONE_ABNORMAL | 0 |
| 手机可用 phoneUsable | 62/62 |
| **手机后四位冲突组** | **0** |
| **(姓首字母+后四位) 冲突组** | **0** |
| 与现有账号同名命中 | 0（现仅 admin） |
| 状态 = READY_EXCEPT_PINYIN | **62/62** |

→ **数据层面 62 个账号可无冲突生成**。唯一阻挡项是"姓名首字母"需要拼音能力。

### 5.2 拼音首字母能力（关键约束）
- 后端 `package.json` 与 `node_modules` **均无任何拼音依赖**（pinyin / nzh / chinese-* 全无）。
- 业务要求"不新增依赖"→ 需**自建一个轻量汉字→拼音首字母映射表**（覆盖姓氏首字，纯静态 JS，零依赖）。
- 多音字/复姓风险：**姓名首字母仅取姓氏首字**，常见姓氏多音极少；即便个别偏差，因 username 还拼接手机后四位且系统校验唯一，冲突可被"唯一性校验 + 冲突自动加序号"兜底。62 人实测零冲突。
- 结论：**规则可行**，但首字母生成必须走自建静态映射（不新增依赖），且 username 落库前必须做唯一性校验与冲突消解。

### 5.3 账号创建时机（三选一）
推荐 **C：管理员在「网格负责人账号初始化」功能中批量创建**。
- 排除 A（系统初始化批量）——时机过早、无人审核；
- 排除 B（负责人首次出现自动建）——隐式创建难审计、易与调整并发冲突；
- C 可人工复核冲突/离职/停用，最符合"fail-closed + 可审计"。

---

## 六、审计 users 用户体系（表 / API / 密码 / JWT）

### 6.1 生效表确认（否决方案 A 的根据）
- 库内**存在两张同名 users**：`public.users`（15 列，**无 metadata**）与 `webapp.users`（22 列，有 metadata jsonb）。
- `routes/auth.js`、`routes/users.js` 全部用**无 schema 前缀**的 `users` → search_path 解析到 **`public.users`**（step2 实证 `生效 users 所属 schema: public`；且脚本查询 `webapp` 才有的 metadata 列时报 `字段 "metadata" 不存在`，反证生效表无 metadata）。

### 6.2 public.users 结构（生效表）
`id(int PK) / username(text, UNIQUE) / email / password_hash / role / real_name / created_at / department / updated_at`。
- **无 employee_id、无 metadata、无 must_change_password（首次登录标记）**。

### 6.3 用户管理机制（routes/users.js，已具备）
- CRUD 完整：创建 / 编辑 / 禁用(is_active) / 管理员重置密码 / 用户自助改密 / 个人资料。
- 密码：bcrypt 哈希存储；**从不返回明文、不日志输出**（合规）。
- `phone` 走 encrypt/decrypt 中间件（AES-256-GCM 可逆）。
- **缺**：首次登录强制改密标记与流程。

### 6.4 三方案最终比较

| 方案 | 存储位置 | 改 users 表 | 改 JWT | 改 auth/login | 稳定性 | 推荐 |
|---|---|---|---|---|---|---|
| A | `users.metadata.employeeId` | 否 | 否 | 否 | — | ❌ **不可行**：生效表 `public.users` 根本无 metadata 列 |
| B | `users.employee_id`（新列） | 是（加 1 列，nullable） | **否** | **否** | 高 | ✅ **推荐** |
| C | 已有独立 user↔employee 映射 | — | — | — | — | ❌ **不存在**：全库无此映射 |
| D | 复用 real_name→姓名匹配 | 否 | 否 | 否 | 低 | ❌ 85 组同名，结构性歧义，违背"不可猜测" |

**最终推荐：方案 B（`users.employee_id`）**。
- 登录/注册/改密的 SQL 均为**显式列清单**，新增 nullable 列不影响任何现有语句，不需改 JWT、不需改 auth middleware。
- 解析优先级：`users.employee_id`（权威）→ 为空时才回落 `real_name` 姓名匹配（过渡兼容）。
- 可选增强：登录时把 employee_id 一并放进 JWT（非必须——middleware 已回库复核，可在需要时按 users.id 查 employee_id，避免动 JWT）。**本期建议不改 JWT**，运行期按 user.id 查绑定即可。

---

## 七、网格负责人 vs 实际巡查人员（是否允许代巡查）

- 现状：`personnel_name` 与网格负责人无强绑定，PG 创建分支甚至由前端自填 personnel_name，无任何"负责人才能巡查"的校验。
- 业务语义：网格负责人 = **默认/授权范围**；巡查人员 = **实际登录并创建记录的员工**。二者不必永远相同（负责人请假、他人代巡查是真实场景）。
- **建议：允许代巡查**。
  - `inspector_employee_id` = 当前登录账号解析出的 employee_id（后端自动写，前端不可传/不可改）；
  - 网格负责人（grid_areas.personnel_id）只作为默认值与统计口径，不直接等同 inspector；
  - 若未来业务要求"仅负责人可巡查"，再在创建时增加"当前 employee_id 是否等于该网格 personnel_id"的校验即可——本期不强制。

---

## 八、grid_inspection_records 身份模型

### 8.1 现状 Schema（27 列，step1 实证）
`id / area_team / upload_time / inspection_date / personnel_name / grid_level / position / violator_* / vehicle_type / report_status / image_content / violation_* / need_rectification / rectifier / rectified_photo / schematic / grid_id / created_at / updated_at / nickname / signup_today / marker / is_resubmit / serial_no`。
- **无 inspector_employee_id、无 violator_employee_id、无 created_by / creator_employee_id / created_user_id 等任何身份/创建人字段**。
- `grid_id` = `grid_areas.id` 外键（完成度统计用，**禁挪作身份**）。
- `personnel_name` = 姓名快照（非唯一、非身份键）。

### 8.2 结论
- **需新增 `grid_inspection_records.inspector_employee_id varchar(20)`**（snake_case，nullable）——这是最小且必要的字段，现有任何列都无法可靠表达"实际巡查人员"。
- WPS 侧沿用已有 `inspectorEmployeeId`（"巡查人员ID"列），两者表达**同一业务身份**。
- **该列不进入 WPS FIELD_MAP / canonicalHash**（属 PG 专属身份列，与 WPS 同步/幂等哈希解耦，零冲突）。
- `personnel_name` 保留为姓名快照，不升级为身份键。

---

## 九、历史数据处理方案（327 / 1724 / 12）

前提：`inspector_employee_id` 加列后默认 NULL。**原则：不为填满字段而猜测历史巡查人员，禁按姓名模糊批量绑定。**

| 数据段 | 数量 | 处理方式 |
|---|---|---|
| WPS A 类（已迁 PG） | 327 | **默认保持 NULL**；无客观身份证据的不回填。仅其中 12 条例外（见下） |
| B 类（既有 PG 镜像） | 1724 | **保持 NULL**，不动。这批是 8 月历史，无可靠登录者信息 |
| **C 类（人工确认）** | **12** | **具备回填条件**：赵书坤 6 条 → 7085、郭秀梅 6 条 → 7947，已由板上"分组名称/所属岗位/昵称"三重证据 + 用户确认，且映射严格走 `sync_map → pg_record_id` 锁定 12 条 |

- 哪些可自动回填：**仅这 12 条**（已锁定 record_id、当前 inspector 列一旦存在即为 NULL、目标值明确）。
- 哪些必须保持 NULL：其余 315 条 A 类 + 1724 条 B 类。
- 是否按姓名推断：**否**。
- WPS 是否回写：**本期否**（WPS 巡查人员ID 列全空是既有事实，回写属独立 Sprint，需另行授权）。
- 是否改 grid_record_sync_map：**否**。

> 依赖关系：12 条回填的**前置条件是先落地 `inspector_employee_id` 列**。列不存在前，Batch 3 只能是 BLOCKED（与上一轮 DRY-RUN 结论一致）。

---

## 十、风险与问题清单

| # | 问题 | 级别 | 说明 / 缓解 |
|---|---|---|---|
| 1 | `public.users` 无 employee 绑定列 | 高 | 方案 B 加 `employee_id` 解决 |
| 2 | 存在 `public.users` 与 `webapp.users` 两套同名表 | 中 | 生效表是 public；改造只动 public，勿误碰 webapp |
| 3 | 后端无拼音依赖 | 中 | 自建静态姓氏首字母映射，不新增依赖 |
| 4 | 无首次登录强制改密标记 | 中 | 建议加 `must_change_password boolean`；本期至少落"初始密码=账号规则"并要求尽快改密 |
| 5 | 现存唯一账号 admin 无法解析员工 | 低 | admin 是系统管理账号，不参与巡查身份链，可不绑定 |
| 6 | 花名册 85 组同名 | 高（对姓名方案） | 正是弃用姓名、改用 personnel_id 的理由 |
| 7 | employee.phone 密文态 | 低 | AES 可逆，账号初始化时解密取后四位（内存中用，不落明文、不日志） |
| 8 | PG 创建分支 personnel_name 前端自填 | 中 | 加 inspector_employee_id 后端自动写，堵住身份自填 |

---

## 十一、最小改造清单（按层，仅方案，未执行）

**数据库（2 处 DDL，均为加 nullable 列，可回退）**
1. `ALTER TABLE users ADD COLUMN employee_id bigint NULL;`（可选加索引/唯一约束视是否允许一员工多账号而定，建议先不加唯一约束）
2. `ALTER TABLE grid_inspection_records ADD COLUMN inspector_employee_id varchar(20) NULL;`
3. （可选）`ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;`

**后端**
4. 新增静态工具 `utils/pinyinInitial.js`（姓氏首字母映射，零依赖）。
5. 账号初始化服务：读 `grid_areas.personnel_id` → employee → 解密手机取后四位 → 生成 username/密码（bcrypt）→ 唯一性校验 + 冲突消解 → 建 users 并写 `employee_id`。全流程 fail-closed。
6. 身份解析升级：`currentEmployeeContext` 优先 `users.employee_id`，为空回落姓名匹配。
7. 网格巡查 PG 创建分支：INSERT 前调 `resolveCurrentEmployee`，写 `inspector_employee_id`；解析失败整单拒绝；**编辑/更新白名单不接收 inspector_employee_id**（前端不可改）。

**前端**
8. 巡查创建/编辑页：移除任何可手填"巡查人员"的入口（若有），巡查人员改为只读展示（由后端回填）。
9. 新增「网格负责人账号初始化」管理页（列出 62 负责人、预览 username、冲突/异常标记、批量创建按钮）。

**账号初始化**
10. 采用时机 C（管理员批量），产出创建结果报告（成功/跳过/异常），异常项 fail-closed 不自动猜测。

**历史数据**
11. 仅回填已确认 12 条（列落地后重跑 Batch 3 DRY-RUN → PASS → 人工批准 → EXECUTE）；其余保持 NULL。

**WPS**
12. 本期不动 WPS、不开 `WPS_GRID_SYNC`、不回写巡查人员ID列、不改 sync_map。

---

## 十二、是否需要新增 inspector_employee_id

**需要，且是最小合理改造。** 现有 27 列无任何字段能可靠表达"实际巡查人员"（personnel_name 是非唯一姓名快照、grid_id 是网格外键、无 created_by 类字段）。该列 snake_case、nullable、不入 WPS canonicalHash，与同步/迁移链路零耦合。

---

## 十三、新建记录身份写入方案

```
POST /api/site/grid-records
  → 后端读取 req.user.id
  → 查 users.employee_id（方案 B 绑定）→ 得 employee_id
  → INSERT grid_inspection_records(..., inspector_employee_id = 该 employee_id)
```
- 前端**不得**传 inspectorEmployeeId；即便传了，后端白名单**不采纳**。
- 解析不到 employee_id（未绑定/离职/停用）→ **整单拒绝**（fail-closed），不落 NULL 蒙混。
- 编辑已有记录：**不允许**修改 inspector_employee_id（更新白名单不含该字段）。

---

## 十四、历史 12 条数据处理方案

- 绑定已确认并锁定：赵书坤→7085、郭秀梅→7947（`output/wps03b-batch3-adjudication-dossier.json` = CONFIRMED_BY_USER）。
- 更新范围严格限定 12 条已迁 record_id（走 sync_map，禁姓名模糊）。
- 执行顺序：**先落 `inspector_employee_id` 列 → 重跑 Batch 3 DRY-RUN（应转 PASS）→ 人工批准 → EXECUTE（12 条 UPDATE）**。
- 其余历史保持 NULL。

---

## 十五、最终实施顺序（分阶段，本次不执行）

```
阶段 0：账号绑定架构落地（users.employee_id + 可选 must_change_password；DDL 评审）
阶段 1：网格负责人账号初始化（拼音工具 + 初始化服务 + 管理页；批量建 62 账号）
阶段 2：employee_id 身份链（currentEmployeeContext 优先 employee_id，姓名回落）
阶段 3：grid_inspection_records.inspector_employee_id 落地 + PG 创建分支自动写入
阶段 4：WPS 身份同步（独立评估，本期不做）
阶段 5：历史 12 条身份回填（Batch 3 DRY-RUN→PASS→批准→EXECUTE）
阶段 6：完整回归测试（登录/建账号/创建巡查/身份不可伪造/历史不受影响）
```

---

## 十六、十个必答问题速览

1. **登录账号能唯一确定 employeeId？** 现状不能（admin 无法解析、85 组同名姓名兜底会失效）；方案 B 落地后能。
2. **缺什么？** 缺 `users → employee` 稳定绑定列（employee_id）。
3. **employeeResolver 能复用？** 能，作为 employee_id 为空时的回落，且已 fail-closed。
4. **users→employee 有稳定绑定？** 现状无（public.users 无绑定列、无中间映射）。
5. **grid_inspection_records 有可替代身份字段？** 无（27 列均非身份键）。
6. **新增 inspector_employee_id 是否最小合理？** 是。
7. **新建时后端在哪写 employee_id？** PG 创建分支 INSERT 前，由 req.user.id → users.employee_id 解析后写入。
8. **编辑时允许改 inspector_employee_id？** 不允许（更新白名单不收）。
9. **WPS 模式谁存巡查人员？** WPS 存业务快照（inspectorEmployeeId 列已就位），PG 存人员主数据与身份关联；本期以 PG 为身份权威。
10. **12 条何时回填？** 列落地后 DRY-RUN 转 PASS、人工批准再 EXECUTE。

---

## 十七、验收标准核对

- [x] 找到网格负责人真实数据来源（grid_areas.name + personnel_id）
- [x] 找到花名册真实主数据来源（employee / v_employee_current）
- [x] 实际统计姓名/手机号/重复（同名 85 组、手机密文解密后 1388/1388 合法、零重复）
- [x] 实际模拟账号生成（62/62 READY_EXCEPT_PINYIN，零冲突）
- [x] 审计 users 全部机制（表/CRUD/密码/JWT/auth）
- [x] 明确 users→employee 最终绑定（方案 B）
- [x] 明确是否改 users 表（是，加 employee_id nullable 列）
- [x] 明确是否改 JWT（否）
- [x] 明确 inspector_employee_id 方案（新增 varchar(20)，不入 canonicalHash）
- [x] 明确负责人与实际巡查人员关系（允许代巡查）
- [x] 明确异常数据处理（全部 fail-closed）
- [x] 明确 327/1724/12 处理（保持 NULL / 保持 NULL / 仅 12 回填）
- [x] 明确 WPS 兼容（本期不动 WPS，不开 SYNC）
- [x] 无任何数据写入 / 无代码修改 / 无账号创建 / 无环境变量修改 / 无登录·auth·JWT 改动

---

## 十八、本阶段未修改内容（纪律声明）

本次全程**只读**，未执行任何：INSERT / UPDATE / DELETE / DDL / ALTER；未改 users / employee / employee_assignment / grid_areas / grid_inspection_records / grid_record_sync_map / WPS；未改 `.env` / JWT / auth / login；未新增依赖 / 新建表 / 新建组件 / 改 Vben Core / 改菜单；未执行 WPS-03-B Batch 3 EXECUTE，未回填 12 条历史。所有产物为只读查询结果与本报告。

---

## 最终结论

```
AUDIT_STATUS = READY_FOR_IMPLEMENTATION
```

地基已就位（`grid_areas.personnel_id` = 稳定 employee.id），身份链设想中"按姓名匹配花名册"一步应删除、直接用 personnel_id。最小改造 = users.employee_id（方案 B）+ grid_inspection_records.inspector_employee_id + 零依赖拼音首字母工具，均不触碰登录/JWT/auth 既有逻辑。请审核本报告后再决定是否进入阶段 0 实施。

