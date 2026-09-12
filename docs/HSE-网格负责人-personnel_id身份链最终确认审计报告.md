# HSE 网格负责人 → personnel_id → employee_id 身份链最终确认审计报告

> 审计性质：**只读审计 + 数据验证 + 架构结论**。全程零写入、零 DDL、零代码修改、零账号创建、未改 WPS / JWT / auth / login / `.env`。
> 审计时间：2026-09-10　|　数据库：`safety_dashboard`（127.0.0.1:5432）
> 数据证据产物：
> - `server/scripts/output/audit-gridowner-step4-personnelid-verify.json`（本轮核心，personnel_id JOIN / 一致性 / 一人多网格 / users schema）
> - `server/scripts/output/audit-gridowner-step3-account-dryrun.json`（62 负责人账号规则 DRY RUN + 手机解密宏观）
> - `server/scripts/output/audit-gridowner-step1-schema.json`（表结构快照）

---

## 一、执行摘要

**结论：`grid_areas.personnel_id → employee.id` 身份链成立，且已是稳定、唯一、可审计的网格责任关系。** 业务设想中「网格负责人姓名 → 姓名匹配花名册 → employee_id」这一步**多余且有害**，应予删除。

一句话回答核心问题：

> **可以直接采用 `grid_areas.personnel_id = employee.id` 作为网格负责人身份，不需要再走姓名匹配。**

真机核验（62 个网格，全部 `is_deleted=false`、`status='在岗'`）：

| 验证项 | 结果 |
|---|---|
| `personnel_id` 非空 | **62 / 62**（无一为空） |
| `personnel_id` 唯一值 | **62**（distinct = 行数，零重复） |
| `personnel_id` JOIN `employee.id` 命中 | **62 / 62** |
| 孤儿（personnel_id 在 employee 找不到） | **0** |
| 多匹配（1 个 personnel_id 命中多个 employee） | **0**（employee.id 是主键，天然唯一） |
| 绑定到已删除 employee | **0** |
| 绑定到非在岗 employee（无当前有效任职） | **0**（assignment_status 全部 = active） |
| 网格 `name` 与 employee `name` 一致 | **62 / 62**（不一致 0） |
| 一个 employee 负责多个网格 | **0**（62 员工 : 62 网格，1:1） |

**唯一阻塞项与上一轮一致：** `grid_inspection_records` 27 列中**不存在** `inspector_employee_id`（也无任何可替代身份/创建人列），且 `public.users`（登录实际生效表）**无 `employee_id` 列、无 `metadata` 列**。因此要落地完整身份链，需要两处最小 DDL（加列，不改现有列、不改 JWT/auth）。

> **AUDIT_STATUS = READY_FOR_IMPLEMENTATION**（数据地基已就绪，改造点清晰且最小；详见 §十三、§十五）

---

## 二、`grid_areas.personnel_id` 实际验证结果

**验证方法：按 ID JOIN，不用姓名反证。** 执行 `grid_areas.personnel_id = employee.id` 直连。

```
grid_areas 总记录数（含软删）      : 62
grid_areas 有效记录（is_deleted=0）: 62
  └ status 分布                    : 在岗 × 62（无其他状态）
personnel_id 非空                  : 62
personnel_id 为空                  : 0
personnel_id 唯一值(distinct)      : 62   ← 等于行数，零重复
```

**结论 1**：`grid_areas.personnel_id` 是 `bigint`，逐行都能唯一命中 `employee.id`，是**稳定的「网格 → 员工」引用**。

**结构性提示（写入实施方案）**：`personnel_id` 目前**没有正式外键约束**（`information_schema` 约束清单里 grid_areas 仅有 `grid_areas_pkey`，无指向 employee 的 FK）。当前数据完整性靠应用层维护、实测 100% 干净；如需长期防孤儿，实施阶段可补 `FOREIGN KEY (personnel_id) REFERENCES employee(id)`（本次仅提示，不执行）。

---

## 三、网格负责人数据统计

数据来源：`grid_areas`（有效 62 行）JOIN `employee` JOIN `v_employee_current`。

```
网格总数            : 62
负责人有值          : 62
负责人为空          : 0
唯一负责人(distinct): 62
重复负责人          : 0
在岗(status=在岗)   : 62
```

保存链路（§五详述）确认：后端 `POST/PUT /grid-areas` 存的是 **`personnel_id`（bigint）**，不是姓名字符串——即"网格 → 员工"的稳定 ID 关系**在写入时就已建立**，前端只是额外显示了一个姓名。

---

## 四、personnel_id → employee.id 匹配统计

```
能匹配 employee.id          : 62
不能匹配（孤儿）            : 0
匹配到多个 employee         : 0        （employee.id 为主键 → 结构上不可能 >1）
已删除 employee             : 0
非在岗 employee（无当前任职）: 0
assignment_status 分布       : active × 62
```

**姓名 / 手机号 / 岗位 一致性**（`grid_areas` vs `employee`/`v_employee_current`）：

```
人员ID存在                   : 62
employee 不存在（孤儿）      : 0
姓名一致                     : 62   （grid_areas.name == employee.name）
姓名不一致                   : 0
手机号一致                   : 0    ┐
手机号不一致                 : 0    ├ grid_areas.phone 全部为空（enc=0/plain=0/empty=62）→ 无可比对项
手机号无法比对               : 62   ┘  → 手机号权威来源是 employee.phone（AES 密文，解密后可用）
```

**结论 2**：网格负责人的**姓名与员工姓名 100% 一致**，但这只能用于**显示核对**，不能当身份键——花名册整体有 85 组同名（182 人），其中就包含 WPS-03-B 暂缓的郭秀梅、赵书坤。**按 personnel_id 直连零歧义，按姓名匹配会产生多命中**，这正是"弃姓名、用 ID"的硬证据。
`grid_areas.phone` 列当前全空，不承载业务；员工手机号一律以 `employee.phone`（`ENC:` 密文）为权威来源。

---

## 五、"网格负责人"前端显示来源（实际代码链）

```
前端  安全看板vben/apps/web-naive/src/views/site/grid/index.vue
        · 表单用「员工选择器」选人 → 提交 personnelId（employee.id）
        · 列表展示列 name（网格名，恰等于负责人姓名）
   ↓  API   /api/site/grid-records（列表） · POST/PUT /api/site/grid-areas（增改）
   ↓  Route/Controller  server/routes/site-mgmt.js
        · POST /grid-areas  (L1313)  INSERT ... personnel_id = b.personnelId||b.personnel_id  (L1342/1348)
        · PUT  /grid-areas  (L1367)  personnel_id = COALESCE($4, personnel_id)                (L1381/1391)
        · formatGridAreaRow (L117)   返回 { name: row.name, personnelId: row.personnel_id }   (L122/123)
   ↓  SQL
grid_areas.personnel_id (bigint)   ← 稳定员工引用
grid_areas.name         (varchar)  ← 显示用姓名快照（== 负责人姓名 62/62）
```

**关键判定**：
1. 网格负责人显示的是 `grid_areas.name`；但后端**同时持有 `personnel_id`**（employee.id）。
2. 保存时前端提交 `personnelId`，后端直接落 `personnel_id` bigint，**不存在"前端只传姓名、后端再姓名匹配"的情况**。
3. 因此**稳定的"网格→员工"关系已经存在**（personnel_id），无需重复设计。姓名仅负责显示。

---

## 六、账号生成 DRY RUN（`username = 姓名首字母 + 手机号后4位`）

数据来源：`audit-gridowner-step3-account-dryrun.json`（对 62 个有效网格负责人，解密真实手机、只读、不落明文）。

**花名册手机宏观（解密后）**：

```
员工总数              : 3025
phone 加密(ENC:)      : 1388
phone 明文            : 0
phone 为空            : 1637
解密后合法11位手机     : 1388 / 1388   （"11位校验=0"是密文假象，解密后 100% 合法）
解密后异常            : 0
```

**62 个网格负责人 DRY RUN**：

```
有效网格负责人        : 62
唯一员工              : 62      （1 员工 : 1 网格）
NO_PERSONNEL_ID       : 0
PERSONNEL_ORPHAN      : 0
EMPLOYEE_DELETED      : 0
PHONE_MISSING         : 0
PHONE_ABNORMAL        : 0
手机可用              : 62 / 62
手机后4位冲突组        : 0
(姓首字 + 后4位) 冲突组: 0
employee_id 已绑定账号 : 0      （users 无 employee_id 列，且现仅 admin 一个账号）
pinyin 首字母能力      : ❌ 无（后端 package.json 与 node_modules 均无拼音依赖）
```

**结论 3**：账号规则在**数据层面完全可行**（62/62 手机可用、后四位零冲突、姓首字+后四位零冲突）。**唯一缺口是拼音首字母生成能力**——后端零拼音依赖。按项目"禁随意新增依赖"约束，建议**自建零依赖的姓氏→首字母静态映射表**（覆盖 62 负责人姓氏即可，含复姓/多音特判），而非引入 pinyin npm 包。

初始密码同规则 `姓名首字母+手机后4位`：数据可行，但需配"首次登录强制改密"（见 §十二 历史结论 / §十三 实施）。`public.users` 当前**无 `must_change_password` / 首次登录标记列**，需补一列。

---

## 七、users 实际表确认（多 schema 消歧）

上一轮审计报告曾提示"users 列名重复"，本轮已彻底查清根因与归属：

```
current_database : safety_dashboard
search_path      : "$user", public          ← 未包含 webapp
```

数据库内**同时存在两张 users 表**：

| schema | 列数 | 有 metadata | 有 employee_id | 行数 | 关键列 |
|---|---|---|---|---|---|
| **`public.users`** ✅ 登录生效 | 15 | ❌ 无 | ❌ 无 | 1（admin/管理员/role=admin） | username, password_hash, real_name, role, department, phone, email, avatar, **is_active**, last_login_at, visual_layout, menu_order |
| `webapp.users` ⛔ 非登录表 | 7 | ✅ 有 | ❌ 无 | 1 | username(text), email, role(text), **metadata(jsonb)** |

约束归属：`users_pkey` + **`users_username_key`(UNIQUE)** 属于 **`public`**；`webapp.users` 只有 `users_pkey`（连 username 唯一约束都没有）。

**登录实际使用的 users 表：`public.users`。** 依据：`server/routes/auth.js` 登录 / 注册 / 改密 SQL 全部使用**不带 schema 前缀**的 `users`，按 `search_path = "$user", public` 解析——`$user`(postgres) 无同名表 → 落到 **`public.users`**。`webapp.users` 不在 search_path 中，登录永远不会命中它。

**由此直接否决方案 A**：`users.metadata.employeeId` 方案依赖 metadata 列，但**登录生效表 `public.users` 根本没有 metadata 列**（有 metadata 的 `webapp.users` 不是登录表、且是仅 1 行的历史遗留）。之前若认为"可用 metadata"是被混合 schema 的列清单误导，本轮已更正。

---

## 八、user → employee 绑定方案比较

| 方案 | 存储位置 | 改 users 表 | 改 JWT | 改 auth/login | 稳定性 | 推荐度 |
|---|---|---|---|---|---|---|
| **A** | `users.metadata.employeeId` | 需先给 public.users 加 metadata 列（等于也要 DDL）；语义脆弱 | 否 | 否 | 低（JSON 软字段，无约束、易覆盖） | ❌ 否决（登录表无 metadata） |
| **B** ✅ | `public.users.employee_id`（bigint, nullable, UNIQUE） | 加 1 列 | **否** | **否** | 高（列级约束，可加 FK + UNIQUE 防一人多账号） | ✅ **唯一推荐** |
| **C** | 现有独立 user↔employee 映射机制 | — | — | — | — | ❌ 不存在（全库无此中间表/映射） |
| **D** | 其他更优机制 | — | — | — | — | 无更优项 |

**方案 B 为什么不动 JWT / auth**：登录/注册/改密的 SQL 都是**显式列清单**（`INSERT INTO users (username, password_hash, ...)` / `SELECT ... FROM users WHERE username=$1`），新增一个 nullable 列不出现在这些语句里，**现有登录零影响**。取 employee_id 的时机是"登录后按 `req.user.id` 回查 `public.users.employee_id`"，属新增读取，不改令牌结构。

建议约束：`employee_id bigint UNIQUE NULL REFERENCES employee(id)`——UNIQUE 保证"一个 employee 最多绑一个账号"，nullable 兼容 admin 等无员工身份的系统账号。

---

## 九、inspector_employee_id 设计

`grid_inspection_records` 实查 **27 列**，核验候选身份列**全部缺失**：

```
inspector_employee_id : ❌     inspector_id  : ❌     creator_employee_id : ❌
inspector             : ❌     created_by    : ❌     created_user_id     : ❌
```

`grid_id`(integer) 语义 = `grid_areas.id`（完成度统计外键，gridCompletionService 依赖），**禁止挪作身份列**。`personnel_name` 是前端自填的**姓名快照**（非唯一、可伪造），不能当身份键。

**设计建议**（仅提案）：

```sql
-- PostgreSQL（snake_case，PG 专属身份列）
ALTER TABLE grid_inspection_records ADD COLUMN inspector_employee_id bigint NULL;   -- 引用 employee.id
```

- 与 WPS 侧已有 `inspectorEmployeeId` 表达**同一业务身份**（员工 id），命名对应：WPS camelCase ↔ PG snake_case。
- **不进入 WPS FIELD_MAP / canonicalHash**：它是 PG 专属身份列，不参与 WPS 同步的内容指纹，避免破坏 WPS-03 已建立的 sync_hash 变更检测（与上一轮结论一致）。
- 写入规则：创建巡查时后端按登录者 `req.user.id → public.users.employee_id` **自动写入**；**前端不可传、不可改**；解析失败 → 整单 fail-closed 拒绝，绝不落脏身份。

---

## 十、网格负责人 vs 实际巡查人员关系

**结论 4：建议允许"代巡查"，两者必须分开。** 依据当前业务代码：
- `grid_areas.personnel_id` = 网格**责任人 / 默认负责人**（长期责任关系）。
- 巡查记录当前用前端自填的 `personnel_name`，**与网格负责人之间没有任何强绑定/校验**——即系统现状本就默许"谁登录谁录入"。
- 现实存在"A 负责人请假、B 代巡查"的合理场景。

因此推荐：

```
grid_areas.personnel_id            → 该网格责任人（授权范围 / 默认值）
grid_inspection_records.inspector_employee_id → 实际执行巡查的登录员工 employee_id
```

二者**语义不同、字段分离**。`inspector_employee_id` 恒等于"当前登录账号对应的 employee_id"，不等于网格负责人。

若业务后续要求"只有网格负责人本人可巡查"，则加一条校验：`当前登录 employee_id == grid_areas.personnel_id`，不满足则拒绝——但这会禁止代巡查，需业务明确后再定（**本次只提方案，不实现**）。

---

## 十一、历史数据处理方案（327 / 1724 / 12）

前提：新增 `inspector_employee_id` 后，历史记录一律**默认 NULL，无可靠证据绝不猜测**。

| 批次 | 数量 | 处理方案 | 理由 |
|---|---|---|---|
| **A 类（WPS 迁移）** | 327 | **默认 NULL**；仅 §十二裁定的 12 条可回填 | WPS 原始"巡查人员ID"列全板 6189 条 100% 为空，无可靠身份来源；不得按姓名反推 |
| **B 类（PG 镜像）** | 1724 | **全部保持 NULL** | 8 月历史镜像，无身份字段，无来源可回填 |
| **C 类（暂缓 12 条）** | 12 | 可回填：赵书坤→**7085**、郭秀梅→**7947** | 已人工裁定并 CONFIRMED_BY_USER；证据 = 板上分组/岗位/昵称交叉验证 |

**关于这 12 条"是否确实是巡查人员"**：证据链（上一轮 Batch 3 DRY-RUN）显示 12 条记录中赵书坤/郭秀梅均以**巡查人员**身份出现（违章人=--），身份为巡查人无疑；且两人 personnel_id（7085/7947）与网格负责人绑定完全一致。**回填前置条件**：先落 `inspector_employee_id` 列（这正是 Batch 3 DRY-RUN 判 BLOCKED 的根因，本轮再次确认）。

WPS 侧与 `grid_record_sync_map`：**均不需回写 / 修改**。inspector_employee_id 是 PG 专属列，不入 WPS 同步指纹，历史 sync_map 不受影响。

---

## 十二、风险与异常清单

| # | 风险 / 异常 | 影响 | 状态 / 建议 |
|---|---|---|---|
| R1 | `public.users` 无 `employee_id` 列 | 无法稳定绑定登录→员工 | 方案 B 加列（阶段0） |
| R2 | `public.users` 无首次登录/强制改密标记 | 初始密码规则无法闭环 | 加 `must_change_password boolean default true`（阶段0） |
| R3 | `grid_inspection_records` 无 `inspector_employee_id` | 巡查身份无处落库；12 条无法回填 | 加列（阶段3），DRY-RUN 转 PASS 后回填 |
| R4 | 后端零拼音依赖 | username 首字母无法自动生成 | 自建零依赖姓氏→首字母映射（阶段1） |
| R5 | `personnel_id` 无正式外键 | 理论上可写入孤儿（当前实测 0） | 可选补 FK（阶段0/2），非阻塞 |
| R6 | 花名册 85 组同名（182 人） | 姓名匹配必然多命中 | 已规避——只用 personnel_id，不用姓名 |
| R7 | 存在 `webapp.users`（含 metadata）历史遗留表 | 易误判为登录表 | 登录不命中它；本次不动，建议后续确认是否清理 |
| R8 | `employee.phone` 1637 人为空 | 全员账号化时缺手机 | 仅 62 负责人账号化，62/62 手机可用，暂不受影响 |

**均无阻断项**：R1/R2/R3 是"加列"型最小 DDL，R4 是零依赖代码，R5/R7 可选。

---

## 十三、最小实施方案（按层）

> 本次**只列清单、不执行**。

**数据库（最小 DDL，全部加列，不改现有列）**
1. `public.users` ADD `employee_id bigint UNIQUE NULL`（可选 `REFERENCES employee(id)`）
2. `public.users` ADD `must_change_password boolean NOT NULL DEFAULT true`
3. `grid_inspection_records` ADD `inspector_employee_id bigint NULL`
4. （可选）`grid_areas` ADD FK `(personnel_id) REFERENCES employee(id)`

**后端**
5. `employeeResolver`：解析优先级改为 **`users.employee_id` 直取 > 姓名兜底**（姓名兜底保留但降级）
6. 登录后 `currentEmployeeContext` 读 `public.users.employee_id`
7. PG 分支创建巡查时后端自动写 `inspector_employee_id`（前端不可传/改），失败整单拒绝
8. 新增"网格负责人账号初始化"接口（管理员批量）：读 `grid_areas.personnel_id → employee.name/phone` 生成 username/初始密码、绑定 employee_id、置 `must_change_password=true`
9. 零依赖姓氏首字母映射工具

**前端**
10. 巡查创建/编辑页：移除任何"巡查人员可手工选择/传参"入口；巡查人员改为只读展示（后端派生）
11. 管理端加"网格负责人账号初始化"页（方案 C：管理员批量创建）

**账号初始化**：采用 **C. 管理员在专用页批量创建**（不选 A 全量、不选 B 首次出现时自动创建）——网格负责人集合稳定（62）、可控、可复核、可 fail-closed。

**历史数据**：327/1724 保持 NULL；12 条在列落地 + DRY-RUN 转 PASS + 人工批准后回填（赵书坤→7085、郭秀梅→7947）。

**WPS**：不改数据、不改开关、不回写、不动 sync_map。

**实施顺序**：阶段0 账号绑定架构（加 users.employee_id + must_change_password）→ 阶段1 网格负责人账号初始化 → 阶段2 employee_id 身份链（resolver 改造）→ 阶段3 inspector_employee_id 列 → 阶段4 WPS 身份同步核对 → 阶段5 历史 12 条回填 → 阶段6 回归测试。

---

## 十四、最终架构图

```
grid_areas.personnel_id  (bigint, 62/62 唯一, 无孤儿)
        │  = employee.id（按 ID 直连，非姓名）
        ▼
   employee.id            ← 唯一稳定员工身份
        │
        ├── employee.name   → 仅显示 / 历史快照（不作身份键）
        └── employee.phone  → AES 密文，账号初始化依据（后4位）
        │
        ▼   管理员批量初始化账号
   public.users
        ├── username           = 姓氏首字母 + 手机后4位   （仅登录标识）
        ├── password_hash      = 初始 (姓氏首字母+后4位) 的哈希；must_change_password=true
        └── employee_id (新列)  ── UNIQUE ──► employee.id   （稳定绑定）
        │
        ▼   登录 → JWT{ id, username, role, realName } → req.user.id
   currentEmployeeContext: public.users.employee_id → employeeId
        │
        ▼   创建网格巡查（后端自动写，前端不可传/改）
   grid_inspection_records.inspector_employee_id (新列) ──► employee.id
        （= 实际执行巡查的登录员工；≠ 网格负责人，允许代巡查）
```

三者边界（严格区分）：
- `employee.id` = **唯一稳定员工身份**
- `username` = **登录标识**（可再生）
- `real_name` / `personnel_name` = **显示 / 历史快照**
- `employee.phone` = **联系方式 + 账号初始化依据**
- `grid_areas.personnel_id` = **网格责任关系**
- `inspector_employee_id` = **实际巡查人员身份**

---

## 十五、最终唯一推荐方案

> **采用 `grid_areas.personnel_id = employee.id` 作为网格负责人身份键；user↔employee 绑定采用方案 B（`public.users.employee_id` 新列）；巡查人员身份用新增 `grid_inspection_records.inspector_employee_id`，由后端按登录账号自动写入。彻底弃用"姓名匹配花名册"作为身份链。**

---

## 十六、七个核心问题明确回答

**问题1｜是否可直接采用 `grid_areas.personnel_id → employee.id` 作为网格负责人身份？**
> **可以。** 62/62 命中、唯一值 62、孤儿 0、多匹配 0、已删除 0、非在岗 0。是稳定、唯一、可审计的责任关系。

**问题2｜是否还需要"网格负责人姓名 → 花名册姓名匹配"作为主身份链？**
> **不需要，且应删除。** 姓名匹配会因 85 组同名（含郭秀梅/赵书坤）产生多命中；personnel_id 直连零歧义。姓名只做显示。

**问题3｜系统账号应如何稳定绑定 employee_id？**
> **方案 B：`public.users.employee_id`（bigint, UNIQUE, nullable）**。登录 SQL 是显式列清单，加列不改 JWT/auth/login。方案 A 被否（登录表 public.users 无 metadata 列），方案 C 不存在。

**问题4｜一个员工负责多个网格如何处理？**
> 实测当前 **1 员工:1 网格（62:62）**，无一人多网格。原则上仍以 **employee_id 唯一** 建 1 个账号，关联多个 `grid_areas`；`users.employee_id` UNIQUE 保证不会一人多账号。

**问题5｜网格负责人调整后如何保证历史巡查记录不变？**
> `grid_inspection_records.inspector_employee_id` 记录的是**巡查发生时的实际登录员工**，是**独立冗余快照**，不随 `grid_areas.personnel_id` 后续变更而改变。历史记录天然稳定。

**问题6｜是否允许代巡查？**
> **建议允许。** personnel_id=责任人/授权范围，inspector_employee_id=实际巡查登录者，两者分离。若业务要求"仅负责人可巡查"，则加 `登录 employee_id == grid_areas.personnel_id` 校验（待业务明确）。

**问题7｜`inspector_employee_id` 应如何产生？**
> 登录 → `req.user.id` → `public.users.employee_id` → 创建巡查时**后端自动写入**；前端不可传、不可改；解析失败整单 fail-closed 拒绝。

---

## 十七、本次未修改内容声明

本次为纯只读审计，**未发生任何写入 / 变更**：
- 未 INSERT / UPDATE / DELETE / DDL
- 未创建用户、未修改 `users` / `employee` / `employee_assignment` / `grid_areas` / `grid_inspection_records`
- 未修改 WPS 数据、未改 `grid_record_sync_map`、未开启 `WPS_GRID_SYNC`
- 未修改 JWT / auth / login / `.env`
- 未执行 WPS-03-B Batch 3 EXECUTE、未回填 12 条历史身份
- 未新增依赖、未改 Vben Core、未改前端业务代码 / 菜单

所有结论均来自只读 SELECT 与代码阅读，证据落盘于 3 份 `output/audit-gridowner-step*.json`。

---

## 最终状态

```
AUDIT_STATUS = READY_FOR_IMPLEMENTATION
```

数据地基已确认成立（personnel_id 身份链 62/62 干净），改造点最小且清晰（3 处加列 + 后端解析改造 + 零依赖拼音映射 + 管理员批量初始化）。无任何阻断性数据问题。**本次仅审计，等待人工审核后再决定是否启动阶段 0。**
