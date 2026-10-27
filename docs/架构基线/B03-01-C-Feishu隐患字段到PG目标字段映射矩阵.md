# B03-01-C Feishu 隐患字段 → PostgreSQL 目标字段映射矩阵

> **状态：PASS WITH GAPS**
> 版本：v1.0｜日期：2026-10-27｜基线 HEAD：`e2df310`
> 上游：`B03-01-B`（PASS WITH GAPS）、`B03-01-C-0`（PASS WITH GAPS）、`B02-DEC`（READY FOR BUSINESS DECISION）
> 本文件是**设计文档**，不含任何可执行代码、DDL、DML、同步实现。

---

## 1. 任务范围与基线

### 1.1 本轮做什么

把 `B03-01-C-0` 实测的 **Feishu 38 个字段**，逐一映射到 PostgreSQL 现有目标表，明确：

源字段身份 → 目标表 / 目标列（真实存在的列） → 转换规则 → 空值策略 → 归一规则 → 人员/区域关联 → 幂等角色 → 冲突策略 → 证据 → 决策依赖 → 映射状态。

并定义独立 Sync Layer 的**逻辑契约**（来源标识、幂等、更新、删除、失败审计），不写实现。

### 1.2 本轮不做什么

| 禁止项 | 状态 |
|---|---|
| 创建 Sync Service / cron / queue / Worker | 未做 |
| 创建 migration / 新表 / 新索引 | 未做 |
| 执行 DDL / DML | 未做 |
| 修改 `hazards` / `hse_rectifications` / `hse_reviews` / `hse_org_unit` / `employee` | 未做 |
| 修改 H5 / Cloudflare Worker / Feishu | 未做 |
| 自动合并历史 110 条与 Feishu 2 条 | 未做 |
| 真实写入 Feishu 或 PG | 未做 |
| 把条件设计写成正式业务裁决 | 未做（全部标 `CONDITIONAL`） |

### 1.3 与上游的口径继承

| 事项 | 继承自 | 本轮处理 |
|---|---|---|
| Feishu 生产表 `tblnyMjxtxjpP08q`、38 列、field_id | C-0 §3/§4/附录A | 直接采用，不重查 |
| `record_id` 生命周期、无删除路由 | C-0 §7 / B §5 | 直接采用 |
| 排查人唯一标识＝手机号；`排查人部门` 为常量 | C-0 §8 | 采用，并**补做 PG 侧命中实测**（§7.2，本轮新增） |
| 位置＝完全自由文本、非必填、GPS 可整段写入 | C-0 §9.2 | 采用 |
| 16 项 H5 词表 16/16 可确定性归一 | C-0 §9.3 | 采用，并**补做组织层级修正**（§8.4，本轮新增） |
| A+C 分层模型 = 审计建议，非裁决 | B02-DEC / B02-01 | 本文全部相关映射标 `CONDITIONAL` |

---

## 2. 生产冻结边界

### 2.1 冻结链路（本轮零触碰）

```text
手机 H5  →  Cloudflare Pages Functions  →  Cloudflare Worker  →  Feishu Bitable
（frontend/check.app.js）  （pages/functions/api/[[route]].js）  （worker/index.js）  （tblnyMjxtxjpP08q）
```

### 2.2 允许的目标架构（仅设计）

```text
Feishu READ API  →  独立 Sync Layer  →  PostgreSQL
     （GET only）        （不存在，本轮不建）      （只落数据，不改生产链）
```

### 2.3 四条强制约束的落地方式

| 约束 | 本文落地位置 |
|---|---|
| 约束 1 只读单向 | §10.1、§11.6、§17.3 第 1 条 |
| 约束 2 外部唯一键 | §10.2～§10.5（含**无 DDL 无法落地**的硬结论） |
| 约束 3 位置原值/标准值分离 | §6.3、§8、§9.4 |
| 约束 4 人员最小化 | §7（禁明文手机号、禁姓名兜底） |

---

## 3. 证据来源索引

### 3.1 文档证据

| 编号 | 文档 | 用途 |
|---|---|---|
| D1 | `docs/架构基线/B03-01-C-0-Feishu同步前置证据清障报告.md` | 38 列实测、field_id、类型、选项、2 条记录真值、record_id、PUT 语义 |
| D2 | `docs/架构基线/B03-01-B-Worker-Feishu隐患字段核验报告.md` | H5→Worker→Feishu 逐字段写入证据、状态机、改派清场 |
| D3 | `docs/架构基线/B02-DEC-业务裁决包.md` | DEC-03/04/05/09 未裁决状态 |
| D4 | `docs/架构基线/B02-核心数据对象权威归属总表.md` | 隐患域四通道、重复对象判定 |
| D5 | `docs/架构基线/B02-权威数据地图与C阶段输入.md` | 7 层架构、C 阶段输入清单 |
| D6 | `docs/架构基线/B01-主数据决策建议与B02输入.md` | 组织/身份/区域主数据结论 |

### 3.2 代码证据（本轮实读）

| 编号 | 文件 | 关键位置 |
|---|---|---|
| C1 | `server/services/hazardService.js` | `:141-145` 状态常量、`:152-166` 历史词映射、`:325-360` `formatRow` 输出投影、`:789` **INSERT 20 列白名单**、`:853-855` W2 禁直写 status、`:1039-1075` review 事务内双写 `hazards`+`hse_reviews` |
| C2 | `server/routes/overview.js` | `:161` 唯一活读 `hazard_level` 的统计查询 |
| C3 | `server/routes/alerts.js` | `:84`、`:310`、`:341` **三处查询取自 `hazards` 的 `title` / `resolved_at` 列不存在** |
| C4 | `server/routes/hse-chain.js` | `:166-168` 读 `hse_rectifications`、`:177-188` 读 `hse_reviews`（canonical 键 `hazard_id`，legacy 键 `rectification_id`） |
| C5 | `server/services/workflowService.js` | `:79` 唯一 `INSERT INTO hse_rectifications` |
| C6 | `server/utils/encryption.js` | `:133-139` `hashSensitive()` = HMAC-SHA256(key=DATA_ENCRYPTION_KEY) |
| C7 | `grid-mobile-cloudflare/worker/index.js` | `:3115-3120` `newHazardNo`、`:3310-3339` create、`:3691-3702` assign 8 键、`:3913-3923` review、`:2952-2974` 枚举、`:1211-1230` 作业中心 17 项注释 |
| C8 | `grid-mobile-cloudflare/worker/storage/index.js`、`feishuAdapter.js` | 表定位、`{fields}` 局部更新 |
| C9 | `grid-mobile-cloudflare/frontend/check.app.js` | `:4644` `HAZARD_LOCATIONS` 16 项 |

### 3.3 数据库证据（dev 库，仅 SELECT / information_schema）

| 编号 | 对象 | 结论摘要 |
|---|---|---|
| Q1 | `hazards`（46 列） | **无任何外部键列**、**无经纬度列**、**无附件列**、除主键外**无唯一约束** |
| Q2 | `hse_rectifications`（20 列，0 行） | `rect_code UNIQUE NOT NULL`、`measure text NOT NULL`、**无指派时间列** |
| Q3 | `hse_reviews`（18 列，0 行） | `review_code UNIQUE NOT NULL`、**无打回次数字段**、**无独立闭环时间列** |
| Q4 | `employee` | 3417 行；`phone_hash` 1326 非空 / 1315 唯一（3 组重复**全部 `is_deleted=true`**） |
| Q5 | `hse_org_unit` | 21 行：L1=2、L2=7、L3=12；**环卫作业中心 id=7、市政绿化作业中心 id=20 均在 L2**；安环管理部 id=5 |
| Q6 | `grid_record_sync_map` | 2061 行；库内唯一「字符串外部键」先例（见 §10.3） |
| Q7 | `hse_tasks` / `hse_events` | `source_table + source_id(bigint)` 模式，**source_id 为 bigint，无法承载 `recXXXX`** |
| Q8 | `hse_assessment_deduction` | `source_table` 实测 15 个取值，**不含 hazards / hse_rectifications / hse_reviews** |

### 3.4 本轮新增实测（只读，见 §7.2 / §8.4）

| # | 操作 | 结果 |
|---|---|---|
| N1 | 飞书 GET 2 条记录 → 取 `排查人ID` → HMAC-SHA256(DATA_ENCRYPTION_KEY) | 两条记录同号，哈希相同 |
| N2 | `SELECT ... FROM employee WHERE phone_hash = <hash>` | **命中且仅命中 1 行：`employee.id=6698`、`employee_code=00271317`、`is_deleted=false`** |
| N3 | 姓名 MD5 比对（飞书 `排查人姓名` vs `employee.name`） | **MD5 完全一致**（长度 3 字符） |
| N4 | `employee.roster_department` / `roster_position` | `安环管理部` / `安环管理部经理`，与飞书 `排查人部门`/`排查人职位` 一致 |
| N5 | `hse_org_unit` 全量 21 行 | **「市政绿化作业中心」（PG）vs「市政园林作业中心」（Worker/身份表口径）——名称不一致** |

> 本轮无任何写入：飞书侧仅 **1 次 records GET**（`page_size=10`，返回 2 条）+ 1 次 `auth` POST（取 token，非数据面），PG 侧仅 SELECT。手机号明文未写入本文档，姓名用 `刘**` 脱敏。

---

## 4. Feishu 实际字段清单（38 列，继承 C-0 实测，不重查）

**固定常量**（下表 38 行共用）：

- `source_system` = `FEISHU_HAZARD`
- `source_table_id` = `tblnyMjxtxjpP08q`（名「H5隐患排查台账表」，生产 base `WX9TbTqJKa7sywsgrU4cVoKdnXb`）
- 记录主键 = Feishu `record_id`（非列）

**类型分布**：`1/Text` **32** 列｜`3/SingleSelect` **3** 列（隐患类别 11 选项、隐患级别 2 选项、处理状态 5 选项）｜`17/Attachment` **2** 列｜`5/DateTime` **1** 列（`创建时间`，`auto_fill=true`）= **38**

**构成**：源码写入 36 列（基础 15 + 闭环 15 + AI 6）、表主字段 `多行文本` 1 列（源码 0 引用）、飞书自动日期列 `创建时间` 1 列（Worker 不写）。

> 完整逐列清单见 §5 矩阵（38 行）与 `B03-01-C-字段映射矩阵.csv`。

---

## 5. 全字段映射矩阵

### 5.0 读法说明（重要）

21 个必需属性**全部保留**，但拆成两张半表纵向排列，以便阅读：

- **表 A（溯源半表，11 属性）**：来源标识（=`source_system` / `source_table_id` 两值并写）、`source_field_id`、`source_field_name`、`source_field_type`、`source_write_evidence`、`production_value_evidence`、`semantic_definition`、`evidence_reference`、`decision_dependency`、`mapping_status`
- **表 B（落点半表，10 属性）**：`target_table`、`target_column`、`target_type`、`transform_rule`、`null_policy`、`normalization_rule`、`identity_or_region_link`、`idempotency_role`、`conflict_policy`、`notes`

两表以 `#` 一一对应；`#` 顺序与 C-0 附录A 完全一致。合并后的 21 列单表见 `B03-01-C-字段映射矩阵.csv`（由本文件同源生成，不另行维护）。

### 5.1 状态统计

| 状态 | 数量 | 含义 |
|---|---:|---|
| `CONFIRMED` | **5** | 源字段、目标列、转换规则三侧证据闭合 |
| `CONDITIONAL` | **11** | 依赖 DEC-04（隐患模型）或 DEC-16 等未裁决事项 |
| `PARTIAL` | **4** | 有落点但语义有损或存在不可解部分 |
| `UNMAPPED` | **15** | 目标表**无此列**，或存在但禁复用 |
| `NOT_APPLICABLE` | **3** | 经证据证明不应映射（常量、主字段、系统列） |
| **合计** | **38** | |

### 5.2 表 A｜溯源半表（38 行）

| # | 来源（system / table_id） | field_id | 源字段名 | 源类型 | 源码写入证据 | 生产有值 | 业务语义 | 证据引用 | 决策依赖 | 状态 |
|---:|---|---|---|---|---|---|:---:|---|---|---|---|
| 1 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldPMfL7wZ | 多行文本 | 1 Text（primary） | 无（源码 0 引用） | 0/2 | 建表默认主字段，无业务语义 | C-0 §4.1/§4.5 | — | NOT_APPLICABLE |
| 2 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fld9Qcn8Zt | 隐患编号 | 1 Text | `newHazardNo()` `index.js:3311,3115-3120` | 2/2 | `YH`+yyyyMMddHHmmss（UTC）+4随机，展示号 | C-0 §7.3 | — | UNMAPPED |
| 3 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldIhShxn1 | 排查人ID | 1 Text | `payload.sub` `index.js:3312`；会话签发 `:941` | 2/2 | 提交人手机号明文（源侧唯一机器标识） | C-0 §8.1；本文 §7.2 | — | CONFIRMED |
| 4 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fld89oRZUj | 排查人姓名 | 1 Text | `payload.name` `index.js:3313` | 2/2 | 展示用姓名快照 | `hazardService.js:334` | — | PARTIAL |
| 5 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldrnz29oS | 排查人部门 | 1 Text | `payload.department` `:3314`；gate `:3106` 硬校验 | 2/2 | **恒为「安环管理部」常量**，无组织语义 | C-0 §8.3 | — | NOT_APPLICABLE |
| 6 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fld3EUM6Nf | 排查人职位 | 1 Text | `payload.position` `:3315` | 2/2 | 职位文本（如 安环管理部经理） | Q1（`post_name` 0 引用） | — | UNMAPPED |
| 7 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldF4JmUeo | 排查时间 | 1 Text | `find_time` `:3228-3234`；H5 无控件 `check.app.js:5033` | 2/2 | **提交时刻，非发现时刻**（实测差 32/34 秒） | C-0 §6.4 | — | CONDITIONAL |
| 8 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldq1F3Eu1 | 隐患类别 | 3 SingleSelect（11） | `:3217-3220` + `HAZARD_CATEGORIES:2952` | 2/2 | 用户点选类别，11 值闭集 | Q1（`hazard_type` 为活写列 `:789`） | **DEC-16** | CONDITIONAL |
| 9 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldDaO3vor | 隐患级别 | 3 SingleSelect（2） | `:3221-3224` + `:2953` | 2/2 | 一般隐患 / 重大隐患 | C2 `overview.js:161` | — | CONFIRMED |
| 10 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldiUucXmF | 隐患位置 | 1 Text | `:3227`；H5 手输/词表/GPS 逆地理解析 | 2/2 | **完全自由文本（≤100，无归一）** | C-0 §9.2 | **DEC-17** | CONFIRMED |
| 11 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldPvIQkbL | 隐患描述 | 1 Text | `:3225-3226` 必填 ≤500 | 2/2 | 描述原文（实测 2/2 带「隐患描述：」前缀） | Q1（`description NOT NULL`） | — | CONFIRMED |
| 12 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldP6P2ihI | 纬度 | 1 Text | `:3241,3324` | 2/2 | 设备 GPS 纬度字符串 | Q1（无列） | — | UNMAPPED |
| 13 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldxvPILb3 | 经度 | 1 Text | `:3242,3325` | 2/2 | 设备 GPS 经度字符串 | Q1（无列） | — | UNMAPPED |
| 14 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fld2zIwhkm | 现场照片 | 17 Attachment | `:3244-3251,3326`；`feishuAdapter.js:320-348` | 2/2（各 1 张） | 附件 token 列表（≤3） | Q1（无列） | — | UNMAPPED |
| 15 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldCt5DLbd | 处理状态 | 3 SingleSelect（5） | `:3321`；常量 `:2954,2962,2963` | 2/2 | 5 选项；**Worker 只产 3 值** | C1 `:141-145,152-166`；C-0 §4.4 | **DEC-05** | CONDITIONAL |
| 16 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldu3cHKz4 | 备注 | 1 Text | `:3273,3322`（`req:<cid>`） | 2/2 | **幂等锚，非业务备注** | C-0 §7.5 | — | PARTIAL |
| 17 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldOJxQKEn | 创建时间 | 5 DateTime（auto_fill） | 无人（飞书自动） | 2/2 | 飞书记录创建时刻 | C-0 §4.2 | — | NOT_APPLICABLE |
| 18 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldiSFfNmS | 整改人ID | 1 Text | `assign` `:3691-3694` | 0/2 | 整改人手机号 | C1 `:1059`（`hse_reviews` 写入先例） | **DEC-04** | CONDITIONAL |
| 19 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldfwwoZhr | 整改人姓名 | 1 Text | `assign` `:3695` | 0/2 | 整改人姓名快照 | Q2 | **DEC-04** | CONDITIONAL |
| 20 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldiaRcKsc | 整改人部门 | 1 Text | `assign` `:3696`（必须 = 安环管理部，否则 403） | 0/2 | **恒为常量** | Q5（安环管理部 id=5） | **DEC-04 / DEC-18** | CONDITIONAL |
| 21 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldl2zSfOI | 指派人ID | 1 Text | `assign` `:3697` | 0/2 | 指派人手机号 | Q2（无列） | **DEC-04** | UNMAPPED |
| 22 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldLEBDHEt | 指派人姓名 | 1 Text | `assign` `:3698` | 0/2 | 指派人姓名 | Q2（无列） | **DEC-04** | UNMAPPED |
| 23 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldhphU1LH | 指派时间 | 1 Text | `assign` `:3699`（`todoNowLocal`） | 0/2 | 指派时刻 | Q2（`started_at` 非指派） | **DEC-04** | UNMAPPED |
| 24 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fld5pHrDuk | 整改期限 | 1 Text | `assign` `:3652-3654`（≥今天、≤365 天） | 0/2 | 整改截止日 `YYYY-MM-DD` | Q2 `deadline timestamptz` | **DEC-04** | CONDITIONAL |
| 25 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldq3lJtOU | 整改说明 | 1 Text | `rectify` `:3805,3838`（≤500） | 0/2 | 整改人填写的说明 | Q2（`measure NOT NULL`） | **DEC-04** | CONDITIONAL |
| 26 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldKA9IbHl | 整改提交时间 | 1 Text | `rectify` `:3836` | 0/2 | 整改提交时刻 | Q2 `completed_at` | **DEC-04** | CONDITIONAL |
| 27 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldwstfIuN | 整改后照片 | 17 Attachment | `rectify` `:3834-3839`；`submit` `:3328-3329` | 0/2 | 整改后附件 token 列表 | Q1/Q2（无列） | — | UNMAPPED |
| 28 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fld5bMJFxx | 验收人 | 1 Text | `review` `:3905,3911`（仅姓名） | 0/2 | 验收人姓名，**无手机号/ID** | Q3 `reviewer_name` | **DEC-04** | PARTIAL |
| 29 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldeU25mz5 | 验收时间 | 1 Text | `review` `:3912` | 0/2 | 验收时刻 | Q3 `review_date` | **DEC-04** | CONDITIONAL |
| 30 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldBZVPcGx | 验收结论 | 1 Text | `review` `:3887,3914,3922`（`通过：…`/`打回：…`） | 0/2 | 通过/打回文本 + 自由意见 | Q3 `comment` / `result` | **DEC-04** | CONDITIONAL |
| 31 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldpGGuLfg | 闭环时间 | 1 Text | `review(pass)` `:3913`；`submit` `:3330` | 0/2 | 闭环时刻 | Q3（无独立列） | **DEC-04** | PARTIAL |
| 32 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldDg13eF6 | 打回次数 | 1 Text | `review(reject)` `:3921`（读旧值 +1） | 0/2 | 打回计数 | Q3（无列） | — | UNMAPPED |
| 33 | FEISHU_HAZARD / tblnyMjxtxjpP08q | flddIntX6r | 整改依据 | 1 Text | `:3263,3334`（AI 回填 ≤1000） | 2/2 | AI 生成的整改依据 | Q1（无列） | — | UNMAPPED |
| 34 | FEISHU_HAZARD / tblnyMjxtxjpP08q | flddCusd9t | 整改建议 | 1 Text | `:3264,3335`（AI 回填 ≤1000） | 2/2 | AI 生成的整改建议 | Q1（无列） | — | UNMAPPED |
| 35 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldLlOVfXP | 三违判定 | 1 Text | `:3265-3266,3336`（是/否） | 2/2 | 是否三违（文本列无表级约束） | Q1（无列） | — | UNMAPPED |
| 36 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldB3n7CQ5 | 重大事故隐患判定 | 1 Text | `:3267-3268,3337`（是/否） | 2/2 | 是否重大事故隐患 | Q1（无列） | — | UNMAPPED |
| 37 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldEXjbtmo | 风险等级 | 1 Text | `:3269-3270,3338`（4 档） | 2/2 | 重大/较大/一般/低风险 | Q1 `risk_level varchar32` | — | CONFIRMED |
| 38 | FEISHU_HAZARD / tblnyMjxtxjpP08q | fldEEGJzWM | AI识别原始输出 | 1 Text（≤4000） | `:3271,3339` | 2/2 | `ai-fill` 返回的原始 JSON | Q1（无列） | **DEC-16** | UNMAPPED |

### 5.3 表 B｜落点半表（38 行）

| # | 目标表 | 目标列 | 列类型 | 转换规则 | 空值策略 | 归一规则 | 身份 / 区域关联 | 幂等角色 | 冲突策略 | 备注 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | — | 无 | — | 不映射 | 不适用 | 不适用 | 无 | 否 | 忽略 | 主字段不可删不可写 |
| 2 | — | 无 | — | 原样保留但**无落点** | 不参与键 | 禁解析时间 / 乡镇 | 无 | 否 | 只读存档 | 缺列；禁作主键或历史合并键 |
| 3 | `hazards` | `checker_id` | bigint（FK→`employee.id` ON DELETE SET NULL） | 手机号 → HMAC-SHA256(DATA_ENCRYPTION_KEY) → `phone_hash` → `employee.id` | 未命中 → NULL，计入 `identity_miss` | 去非数字字符；**禁姓名兜底** | `employee.phone_hash`（§7.3） | 否（辅助定位） | 身份变更才覆盖；命中 0 或 >1 均告警 | **实测 2/2 命中 id=6698**；明文禁落库 |
| 4 | `hazards` | `checker` | varchar(128) | 原样 | 空 → NULL | 不用于匹配 | 冗余展示快照 | 否 | 源变化覆盖 | 与 `employee.name` 存在漂移风险 |
| 5 | — | 无 | — | 不映射 | 不适用 | 不作组织归属 | 组织应由 `employee.roster_department` 决定 | 否 | 忽略 | 映射即制造伪组织数据 |
| 6 | — | 无（`hazards.post_name` 为死列） | — | 不映射 | — | — | `employee.roster_position` 已持同值 | 否 | 忽略 | 复用死列需 DEC，本轮不做 |
| 7 | `hazards` | `hazard_date` | date | `YYYY-MM-DD HH:mm` → 取日期部分（**丢时分**） | 空 → NULL | 不换算时区（源已是 UTC+8 本地串） | 否 | 否 | 源变化覆盖 | 语义降级：登记时刻 ≠ 发现时刻，需业务认可 |
| 8 | `hazards` | `hazard_type` | varchar(64) | 原样（11 值闭集校验） | 空 → NULL | 不与 AI 分类合并 | 否 | 否 | **不做 AI 覆盖**；冲突时两值并存 | `category`/`hazard_category` 为死列，禁复用 |
| 9 | `hazards` | `hazard_level` | varchar(32) | 原样 | 空 → NULL | 不写 `level` | 否 | 否 | 源变化覆盖 | `level` 唯一读点在坏查询里（C3），禁写 |
| 10 | `hazards` | `location` | varchar(128) | 原样（仅 trim 首尾空白） | 空 → NULL（源侧非必填） | **不归一**，`location_raw` 保真 | 见 §8 | 否 | 源变化覆盖 | 128 ≥ 源上限 100，不截断 |
| 11 | `hazards` | `description` | text NOT NULL | 原样（不剥「隐患描述：」前缀） | 空 → **整条 QUARANTINE**（NOT NULL） | 不归一 | 否 | 否 | 源变化覆盖 | 前缀污染影响文本检索 |
| 12 | — | 无 | — | 不映射 | — | **禁由经纬度反推乡镇** | — | 否 | 忽略 | 缺列（Q1） |
| 13 | — | 无 | — | 不映射 | — | 同上 | — | 否 | 忽略 | 缺列（Q1） |
| 14 | — | 无 | — | 仅保存 token 引用，**不下载不复制** | 空 → NULL | — | — | 否 | 文件不由同步层管理 | 需附件表；token 非永久 URL |
| 15 | `hazards` | `status` | varchar(16)，可空，default `discovered` | **5→4 有损映射**（见 §6.4） | 未知值 → NULL 并保留 `status_raw` | 不猜；不做语义近似 | 否 | 否 | 与状态机 W2 冲突，**直写需显式豁免**；禁由 `closed` 反推已复查 | `status_raw` 无列（缺） |
| 16 | `hazards` | `remark` | varchar(512) | 原样 `req:<cid>`（供追溯） | 空 → NULL | 不解析为键 | 否 | **辅助（非键）** | 源变化覆盖 | 禁作唯一性依据（约束 2） |
| 17 | — | 不写 `created_at` | — | 仅作同步水位 / 排序参考 | — | — | — | 否 | **禁覆盖 PG `created_at`** | 水位需 sync map 承载（缺表） |
| 18 | `hse_rectifications` | `responsible_person_id` | bigint（FK→`employee.id`） | 同 #3 身份桥 | 未命中 → NULL | 禁姓名兜底 | `employee.phone_hash` | 否 | 有值覆盖 | **Web 隐患页读 `hazards.fixer_id`**，A+C 下展示缺失 |
| 19 | `hse_rectifications` | `responsible_person_name` | varchar(128) | 原样 | 空 → NULL | 不用于匹配 | 快照 | 否 | 源变化覆盖 | — |
| 20 | `hse_rectifications` | `department_id` | bigint（FK→`hse_org_unit.id`） | 常量名「安环管理部」→ `org_unit_id=5` | 不匹配 → NULL | 名称→id 确定性映射 | `hse_org_unit`（Q5） | 否 | 源变化覆盖 | 值恒为常量，可由规则推导 |
| 21 | — | 无（`created_by` 语义不同） | — | **禁挪用 `created_by`** | — | — | — | 否 | — | 缺列；指派人是独立业务概念 |
| 22 | — | 无 | — | 不映射 | — | — | — | 否 | — | 缺列 |
| 23 | — | 无（`started_at` 是开始整改，非指派） | — | 不映射 | — | — | — | 否 | — | 缺列 |
| 24 | `hse_rectifications` | `deadline` | timestamptz | `YYYY-MM-DD` → 当日截止时刻（**口径待定**，见 §6.5） | 空 → NULL | 不换算 | 否 | 否 | 源变化覆盖 | 与 `hazards.deadline_date` 冗余，不同写 |
| 25 | `hse_rectifications` | `measure` | text NOT NULL | 原样 | 空 → **不建整改事实行**（NN） | 不归一 | 否 | 否 | 源变化覆盖 | 与 `hazards.rectification`（复查期字段）分属两阶段 |
| 26 | `hse_rectifications` | `completed_at` | timestamptz | `YYYY-MM-DD HH:mm` → UTC+8 时间戳 | 空 → NULL | — | 否 | 否 | 源变化覆盖 | — |
| 27 | — | 无 | — | 不映射（不下载不复制） | — | — | — | 否 | — | 需附件表 |
| 28 | `hse_reviews` | `reviewer_name` | varchar(128) | 原样 | 空 → NULL | **禁姓名匹配 ⇒ `reviewer_id` 恒 NULL** | 无法确定身份（源无手机号） | 否 | 源变化覆盖 | 复查证据链不完整，见 §9.3 |
| 29 | `hse_reviews` | `review_date` | timestamptz | → UTC+8 时间戳 | 空 → NULL | — | 否 | 否 | 源变化覆盖 | — |
| 30 | `hse_reviews` | `comment`（`result` 由前缀派生） | text | 全文入 `comment`；`result` 由「通过/打回」前缀确定性派生 | 空 → NULL | 前缀→`pass`/`reject`（值域待核 §6.6） | 否 | 否 | 源变化覆盖 | 「登记即闭环」结论为固定串，非真实验收 |
| 31 | `hse_reviews` | 复用 `review_date` | timestamptz | 与 #29 同值，**不单独落** | 空 → NULL | — | 否 | 否 | — | 无独立列；「登记即闭环」无验收人/时间，会丢 |
| 32 | — | 无 | — | 不映射 | — | — | — | 否 | — | 缺列；打回率不可统计 |
| 33 | — | 无 | — | 不映射 | — | — | — | 否 | — | 缺列 |
| 34 | — | 无 | — | 不映射 | — | — | — | 否 | — | 缺列 |
| 35 | — | 无 | — | 不映射 | — | — | **禁并入 `violation_records`**（另一域事实） | 否 | — | 缺列；混同会污染三违域 |
| 36 | — | 无 | — | 不映射 | — | **禁并入 `hazard_level`** | — | 否 | — | 缺列；级别与重大判定不等价 |
| 37 | `hazards` | `risk_level` | varchar(32) | 原样（4 值闭集校验） | 空 → NULL | 不映射到 `level` | 否 | 否 | 源变化覆盖 | 文本列无表级约束，需应用侧校验 |
| 38 | — | 无 | — | 不映射（需 raw 存档） | — | — | — | 否 | — | 缺列；是 DEC-16 仲裁的唯一原始依据 |

### 5.4 交叉校验（防「凭列名臆造」）

| 校验 | 方法 | 结果 |
|---|---|---|
| 目标列是否真实存在 | `information_schema.columns` 全量比对 | 表 B 中 12 个 `target_column` 全部实测存在；15 处 UNMAPPED 均经「列不存在」或「列存在但禁复用」验证 |
| 是否有列被臆造 | 逐列 grep `hazards` 46 列清单 | **0 处臆造**（`record_id` / `lat` / `lng` / `photo` / `hazard_code` / `reject_count` / `assigner_id` / `assigned_at` 全部实测不存在） |
| 冗余列是否误判 | 对照 C1 `:789` 活写白名单与 C1 `:325-360` 输出投影 | `category`、`hazard_category`、`post_name`、`responsible_dept_id` 在 `hazards` 语句窗口内 **0 引用** ⇒ 判为死列 |
| `level` 是否可作落点 | 追查 3 处读点 | C3 三处均取自不存在列 ⇒ 查询必报 42703 ⇒ `level` 无可用活读点 |

---

## 6. 字段转换与空值契约

### 6.1 六类转换规则（全表仅允许这六类）

| 代号 | 规则 | 适用字段 |
|---|---|---|
| T1 | **原样透传**（仅 trim 首尾空白，不改写内容） | #10、#11、#4、#19、#24、#25、#28、#30、#8、#9、#37 |
| T2 | **身份哈希桥**（手机号 → HMAC → `phone_hash` → `employee.id`） | #3、#18、#20（名称→org id） |
| T3 | **时间解析**（文本 → date / timestamptz，固定 UTC+8） | #7、#24、#26、#29、#31 |
| T4 | **枚举映射**（源枚举 → 目标枚举，允许有损但必须记录） | #15 |
| T5 | **展示派生**（不落业务列，或落冗余快照） | #4（快照）、#16（追溯串） |
| T6 | **不映射**（有意为之） | 15 个 UNMAPPED + 3 个 NOT_APPLICABLE |

### 6.2 空值契约（四态严格区分）

| 源状态 | 含义 | 处理 | 禁止行为 |
|---|---|---|---|
| 字段**不存在** | 表中无此列 | 不写；不视为空 | 不得建同名占位列 |
| 字段存在但**值为空** | `null` 或 `""` | 按字段 `null_policy` 处理；**不默认清空 PG** | 不得把「空」等同于「删除」 |
| 字段存在且**有新值** | 值变化 | 按 `conflict_policy` 覆盖 | 不得覆盖人工维护列 |
| 记录**读取失败** | API 异常 | 整条跳过 + 告警；**不写任何列** | 不得用空值兜底 |

### 6.3 `location_raw` / `township_norm` 契约（约束 3）

| 项 | 契约 |
|---|---|
| `location_raw` | 落 `hazards.location`，**原样保真**；非空即写；源空时 NULL（并计入 `location_missing`，**不拒绝整条记录**） |
| `township_norm` | 落 `hazards.township`（varchar 32），**允许 NULL** |
| 生成条件 | **仅当** `location_raw` 命中 §8.3 的确定性词表（12 行政 + 4 非行政），才写 `township_norm` |
| 未命中 | `township_norm = NULL`，保留 `location_raw`，记录 `region_miss_reason` 并计数 |
| 禁止 | 模糊匹配、经纬度反推、组织名当乡镇、把 `risk_area_dict` 未核验直接当乡镇主数据 |
| 结论边界 | 「16 个词表值可确定性归一」**不等于**「所有自由文本可归一」——生产 2 条记录恰好都是 `大柳镇`（词表内），但 `隐患位置` 允许 GPS 地址整段写入，一旦写入地址串即不可归一 |

### 6.4 状态映射契约（5 → 4，有损）

| Feishu 选项 | Worker 是否产出 | 目标 `hazards.status` | 依据 | 风险 |
|---|:---:|---|---|---|
| 待整改 | ✅ | `discovered` | C1 `:141-145` 四值闭集 | 「待整改」≠「发现」，语义近似 |
| 整改中 | ❌（仅人工改表可产生） | `processing` | C1 `:152-160` `'整改中'→processing` | 源侧实际不产生 |
| 已整改 | ❌（仅人工改表可产生） | **无对应** | C1 `:162-166` `已整改` 属 `NON_LIFECYCLE_STATUS`，注释明写「语义相近但不等价」「绝不参与状态机写入与统计口径」 | 若强行映射 `closed` 会直接违反既有约定 |
| 待验收 | ✅ | `pending_review` | C1 `:152-160` `'待复查'→pending_review`（语义最近） | 选项词不同，需业务确认 |
| 已闭环 | ✅ | `closed` | C1 `:141-145` | **已闭环 ≠ 已复查**（§9.3） |

**硬约束**：`status` 在 `hazardService` 中被 W2 守卫（C1 `:853-855`）明令「普通更新禁止修改生命周期 status」。Sync Layer 若直写 `status`，等于绕过该护栏 ⇒ 必须在 D 阶段取得显式豁免并留审计，否则应改为「只写非状态列 + 由业务动作驱动状态」。

### 6.5 未知值与非法值

| 情形 | 处理 |
|---|---|
| 源枚举值不在 5 项内 | `status = NULL`，`status_raw` 留原值，告警 |
| `隐患级别` 不在 2 项内 | 整条 QUARANTINE（该字段是统计口径根基） |
| `整改期限` 无法解析为日期 | `deadline = NULL`，告警，不猜测 |
| `deadline` 截止时刻口径（当日 00:00 vs 23:59:59） | **未定**，登记为 gap；默认按「当日 23:59:59 +08」实现前须业务确认 |
| `验收结论` 无「通过/打回」前缀 | `comment` 留全文，`result = NULL`，告警 |

### 6.6 待核字段值域（本轮未查证，禁止假设）

| 字段 | 未确认内容 |
|---|---|
| `hse_reviews.result` | 代码中 `reviewResult` 变量来源未逐一追平，值域（`pass`/`reject` 或中文）**未核**，故 #30 标 `CONDITIONAL` |
| `hse_rectifications.status` | 0 行数据、唯一写入方 `workflowService:79`，值域**未核** |
| `hse_rectifications.rect_code` / `hse_reviews.review_code` | 无现存数据可参照格式；现有命名先例为 `REV-HAZ-…`（C1 `:1031`） |

---

## 7. 人员身份映射

### 7.1 三侧人员字段总览

| 侧 | 字段 | 形态 | 可否作机器标识 |
|---|---|---|---|
| Feishu | 排查人ID | 11 位手机号明文 | ✅ 唯一桥 |
| Feishu | 排查人姓名 / 职位 / 部门 | 文本 | ❌（部门为常量） |
| Feishu | 整改人ID / 指派人ID | 手机号明文 | ✅（但生产 0/2 无值） |
| Feishu | **验收人** | **仅姓名** | ❌ **无任何机器标识** |
| PG | `employee.id` | bigint | ✅ 内部主键（40+ FK） |
| PG | `employee.phone_hash` | HMAC-SHA256 hex | ✅ 唯一可用外部桥 |
| PG | `employee.employee_code` | 8 位业务码 | ⚠️ 花名册有、身份表无，源侧拿不到 |

### 7.2 本轮新增实测：PG 侧身份桥真实命中

C-0 只验证了「飞书隐患库 → 飞书身份表」的匹配；**同步落点要的是 PG**。本轮补做：

```text
飞书 2 条记录「排查人ID」（11 位手机号，两条同号）
  → HMAC-SHA256(key = DATA_ENCRYPTION_KEY)  = phone_hash（与 C6 `:133-139` 同实现）
  → SELECT ... FROM employee WHERE phone_hash = <hash>
  → 命中 1 行：employee.id=6698 / employee_code=00271317 / is_deleted=false
  → 姓名 MD5 与飞书「排查人姓名」完全一致；roster_department=安环管理部；roster_position=安环管理部经理
```

**结论**：身份桥在 PG 侧**真实可用**，2/2 记录命中且**唯一**，无需姓名兜底。

### 7.3 匹配算法与失败处置

| 项 | 契约 |
|---|---|
| 输入 | 源手机号（去非数字） |
| 变换 | HMAC-SHA256，key = `DATA_ENCRYPTION_KEY`（与 `encryption.hashSensitive` 同实现，禁自造哈希） |
| 查询 | `SELECT id FROM employee WHERE phone_hash = $1`（**必须带** `is_deleted` 判断） |
| 命中 1 条 | 写 `employee.id` |
| 命中 0 条 | 目标列 NULL；`identity_status = 'miss'`；**不创建员工、不回填姓名、不模糊匹配** |
| 命中 >1 条 | 目标列 NULL；`identity_status = 'ambiguous'`；告警（Q4：现库 3 组重复**全部 `is_deleted=true`**，故当前不会发生；但**无唯一约束**，未来可能） |
| 源无手机号（验收人） | 只写姓名快照；`reviewer_id` 恒 NULL |
| 明文手机号 | **任何 PG 列都不得落**（含 `remark`、`checker`、日志） |

### 7.4 五类异常状态

`matched` / `miss` / `ambiguous` / `source_absent`（源无此字段）/ `bridge_unavailable`（哈希不可用）。

> 五态应写入同步审计（§11.5），本轮不建审计表。

---

## 8. 区域映射（DEC-03）

### 8.1 现状事实

| 事实 | 证据 |
|---|---|
| 隐患表**没有任何结构化区域列** | C-0 §9.1；38 列清单 |
| `隐患位置` 是普通 input（maxlength 100）、**非必填**、「定位」按钮可写入 GPS 逆地理整段地址 | C-0 §9.2 |
| `public` 下名为 `township`/`town`/`area_name` 的列 **31 个**，至少 3 种语义 | B02-DEC §7 |
| `hse_assessment_target.township` 925/925 全填充、16 值，但装的是**组织名**（作业中心名） | B02-DEC §7 |
| `personnel_insurances.township` 1330/1330、71 值，装的是**班组/片区** | B02-DEC §7 |
| `hazards.township` 当前 **0/110 填充** | Q1 |
| `risk_area_dict` 17 行、`org_unit_id` **0/17**，与考核 16 值**命中 0** | B02-DEC §7；Q5 |

### 8.2 七层分层（禁止压平为单一 `township`）

| 层 | 内容 | 当前载体 | 目标处理 |
|---:|---|---|---|
| L1 | 原始位置文本 | Feishu `隐患位置` | → `hazards.location`（`location_raw`，NOT NULL 契约） |
| L2 | 原始作业中心文本 | **源中不存在独立列** | 无源可映射 ⇒ 不生成 |
| L3 | 证据支持的标准化词表值 | 16 项 H5 词表（C9 `:4644`） | 作为**唯一允许的归一输入集** |
| L4 | 候选乡镇 | 由 L3 派生 | 仅在 L3 命中时生成 |
| L5 | `township_norm` | → `hazards.township` | 允许 NULL |
| L6 | 组织关联状态 | `hse_org_unit` L3 | 记录 `org_link_status`（不落库，进审计） |
| L7 | 未匹配原因 | — | `region_miss_reason` 枚举：`not_in_vocab` / `address_text` / `multi_match` / `empty` |

### 8.3 16 项词表的确定性归一实测（本轮复核）

| 原始值 | `hse_org_unit`（L3，名+「作业中心」） | `hse_assessment_target.township`（名+「作业中心」） | `risk_area_dict` | 归一结论 |
|---|---:|---:|---|---|
| 保店镇 / 柴胡店镇 / 大曹镇 / 大柳镇 / 杜集镇 / 津城街道 / 刘营伍乡 / 宁城街道 / 时集镇 / 相衙镇 / 张大庄镇 / 长官镇（12 项） | **各 1 命中** | 各命中（74/109/64/56/137/46/56/35/70/68/59/70 行） | 0 | → 乡镇（**行政单元**） |
| 康宁湖 | 0 | 0 | `康宁湖公园`（需 +「公园」） | → 作业区域（非乡镇） |
| 福宁河 | 0 | 0 | `福宁河公园`（需 +「公园」） | → 作业区域（**H5 独有值**） |
| 中心公园 | 0 | 0 | 精确命中 | → 作业区域 |
| 新河公园 | 0 | 0 | 精确命中 | → 作业区域 |

**12/12 行政单元 + 4/4 非行政单元 = 16/16 可确定性归一**，但**只能覆盖词表内取值**。

### 8.4 本轮新增修正：作业中心层级与命名（影响 DEC-18）

C-0 记录「`hse_org_unit` L3 缺环卫、市政园林两个作业中心」。本轮实测**需要修正表述**：

| 项 | C-0 表述 | 本轮实测（Q5 / N5） |
|---|---|---|
| 是否存在 | 「缺两个中心」 | **存在，但在 L2 而非 L3**：`环卫作业中心`(id=7, level=2, org_type=center)、`市政绿化作业中心`(id=20, level=2, org_type=center) |
| 名称 | 「市政**园林**作业中心」 | PG 为「市政**绿化**作业中心」；Worker 注释（C7 `:1219`）与飞书身份表为「市政**园林**作业中心」 |
| 影响 | 按 L3 聚合会丢 2 个单位 | 按 L3 聚合**确实**丢；但根因是**层级不同 + 名称不一致**，而非记录缺失 |

⇒ **DEC-18 的题面应从「是否补齐两个作业中心」改为「作业中心在组织树中的层级归属 + `市政园林`/`市政绿化` 名称对齐」**。本轮不修改任何组织数据。

### 8.5 `township_norm` 的语义冲突（必须裁决）

`hazards.township`（varchar 32，0/110 填充）与 `hse_assessment_target.township`（组织名）**语义不一致**：

| 方案 | `township_norm` 写入值 | 优点 | 缺点 |
|---|---|---|---|
| A｜乡镇名 | `大柳镇` | 符合字段名字面语义，报表可读 | **无法与 `assessment_target` 直接 join**（后者存「大柳镇作业中心」） |
| B｜组织名 | `大柳镇作业中心` | 与考核口径一致，可直接 join | 字段名 `township` 被用于存组织名，语义污染 |

**本轮不作选择**，登记为 DEC-03 的必答子项。临时安全行为：`township_norm` **先不写**（恒 NULL），仅保留 `location_raw`，避免制造第三种口径。

---

## 9. 隐患事实 / 整改事实 / 复查事实的条件化目标映射

### 9.0 前提声明（必须前置）

> **A+C 分层模型是 B02 的审计建议，不是正式业务裁决。** B02-DEC-04/05 至今仍为 `【待业务裁决】`（D3 全文 17 处占位，无一处填写）。因此本章全部内容为**条件设计方案**，`CONDITIONAL` 是其真实状态。

### 9.1 事实三层与载体

| 层 | 载体 | 当前行数 | 载体能力 |
|---|---|---:|---|
| 隐患事实 | `hazards` | 110（历史资产） | 46 列，无外部键、无经纬度、无附件 |
| 整改事实 | `hse_rectifications` | **0** | 20 列，`rect_code` 唯一，`measure NOT NULL` |
| 复查事实 | `hse_reviews` | **0** | 18 列，`review_code` 唯一，双关联键（`hazard_id` canonical / `rectification_id` legacy，C4 `:177-188`） |

### 9.2 三个方案下映射如何变化

| 方案 | 隐患落点 | 整改落点 | 复查落点 | 本文受影响字段 |
|---|---|---|---|---|
| **A 单表**（全部塞 `hazards`） | `hazards` | `hazards`（用 `fixer_id`/`rectification`/`fix_date` 等） | `hazards`（`reviewer_id`/`review_result`/`review_date`） | #18-#31 的 `target_table` 全部改为 `hazards`，且 #21/#22/#23/#32 仍 UNMAPPED（无列） |
| **A+C 分层**（审计建议） | `hazards` | `hse_rectifications` | `hse_reviews` | 本文 §5.3 现表 |
| **B 四表栈** | `hazard_record` | `rectification_task` + `rectification_action` | `review_record` | #18-#31 改为 4 张 0 引用表；**需多一层 task 拆解**，且前端 0 调用 |

**关键取舍（选 A+C 的代价，必须写明）**：

- `hazardService.formatRow`（C1 `:325-360`）只读 `hazards`；`hse_rectifications`/`hse_reviews` 仅由 `hse-chain.js`（C4）与 `hse-statistics.js` 读取。
- ⇒ 选 A+C 后，**Web 隐患列表/详情页看不到整改人、整改期限、整改说明、验收人**（这些只进新表），除非：① 同时冗余写 `hazards.fixer/fixer_id/fix_date/rectification`，或 ② D 阶段改页面。这是 A+C 的**直接功能代价**。

### 9.3 「已闭环 ≠ 已整改 ≠ 已复查 ≠ 已验收」（六态分离）

| 概念 | 源侧判据 | 目标侧可判定？ | 说明 |
|---|---|---|---|
| 原始状态 | `处理状态` 5 选项 | ✅ `status_raw`（**无列，需新增**） | 保真必需 |
| 标准化状态 | 5→4 有损映射 | ✅ `hazards.status` | §6.4 |
| 是否有整改事实 | `整改说明` 非空 + `整改提交时间` 非空 | ✅ 可建 `hse_rectifications` 行 | `measure NOT NULL` 恰好等于「有说明才算整改」 |
| 是否有复查事实 | 存在 `验收人`/`验收时间`/`验收结论` | ⚠️ 部分 | 「登记即闭环」时**这三个字段为空但状态为已闭环** |
| 是否有验收证据 | 存在 `验收人` 且 `验收人` 非空 | ⚠️ 只能靠 `reviewer_name` | 无法定身份（无手机号） |
| 是否为第三方复查 | 超出源能力 | ❌ | 源无独立「复查」概念（B03-01-B §11.1）；「已闭环」也可由提交人自证（登记即闭环，C-0 §6.2 R3） |

**硬规则**：若 `处理状态 = 已闭环` 但 `验收人`/`验收时间`/`验收结论` 皆空，**禁止自动生成一条 `hse_reviews` 记录**（否则等于伪造复查证据，触碰 B02 红线「不得伪造复查证据」）。此类记录应仅置 `hazards.status = closed`，并把 `evidence_level = 'self_closed'` 记入审计。

### 9.4 一致性与引用完整性

| 约束 | 现状 | 同步契约 |
|---|---|---|
| `hse_reviews.hazard_id` → `hazards.id` | FK `ON DELETE RESTRICT` | 必须先建 `hazards` 行，再建 `hse_reviews` 行（同事务） |
| `hse_rectifications.hazard_id` → `hazards` | **无 FK**（仅有索引） | 允许悬空，但同步层必须自校验 |
| `hse_rectifications.rect_code` / `hse_reviews.review_code` | `UNIQUE NOT NULL` | **可作无 DDL 幂等载体**（§10.4） |
| `hazards` 外部键 | **无** | **必须 DDL 才能幂等**（§10.3） |

### 9.5 源是「单行状态机」而非事件流（决定性限制）

源表一条记录 = 一个隐患的**最新态**。`assign` 改派时**清空上一任整改产物且不留痕**（B03-01-B §10.2）。因此：

- 同步只能得到**当前快照**，**无法重建操作序列**（何时指派给谁、被打回几次、每次整改内容）。
- `hse_rectifications` / `hse_reviews` 采用「1 隐患 : 1 行」或「1 隐患 : N 行（按当前态推断）」都无法还原历史。
- ⇒ **不得把同步结果用于「操作合规审计」**，只能用于「现状统计」。

---

## 10. `record_id` 与幂等契约

### 10.1 来源标识组合（三元组）

```text
external_key = ( source_system = 'FEISHU_HAZARD',
                 source_table_id = 'tblnyMjxtxjpP08q',
                 external_record_id = <Feishu record_id> )
```

**为什么必须带 `source_table_id`**：本机存在第二个 base，其 6 张表**与生产同名、table_id 全不同**（C-0 §3.3）。仅用 `record_id` 在三元组缺省 `table_id` 时，无法区分同源不同表；仅用 `record_id` 也无法防范未来接入第二张隐患表。

### 10.2 缺失 `record_id` 的处理

`record_id` 缺失（解析失败 / 字段被清空）⇒ **整条 QUARANTINE**，不落库，不生成替代键（禁止用 `隐患编号` 或 `req:<cid>` 顶替）。

### 10.3 三张目标表的幂等能力（实测结论）

| 目标表 | 可用唯一载体 | 是否需 DDL | 结论 |
|---|---|---|---|
| `hazards` | **无**（除主键 `id` 外无任何唯一约束，Q1；且无外部键列） | **需要** | **当前无法在不做 DDL 的前提下保证同一 Feishu 记录不重复落库** |
| `hse_rectifications` | `rect_code UNIQUE NOT NULL` | 否 | 可用 `FSHZ-<record_id>-R` 作确定性码 |
| `hse_reviews` | `review_code UNIQUE NOT NULL` | 否 | 可用 `FSHZ-<record_id>-V` 作确定性码 |

> 码前缀 `FSHZ-` 为本文件提议（未实施），须与既有 `REV-HAZ-…`（C1 `:1031`）区分命名空间；`record_id` 长度 16，加前缀与后缀远小于 varchar(64)。

### 10.4 两条 DDL 路径（D 阶段二选一，本轮不执行）

| 路径 | 内容 | 优点 | 缺点 |
|---|---|---|---|
| P1 加列 | `hazards` 增加 `external_source varchar(32)` + `external_id varchar(64)`，建部分唯一索引 `(external_source, external_id) WHERE external_source IS NOT NULL` | 与业务同行，查询简单 | 改主表；历史 110 行需全为 NULL 才不与唯一冲突 |
| P2 建映射表 | 新建 `hse_external_sync_map`，仿 `grid_record_sync_map`（Q6）：`UNIQUE(pg_record_id)`、`UNIQUE(source_system, source_table_id, external_record_id)`、`sync_hash`、`business_fingerprint`、`conflict bool`、`last_sync_at` | 不改主表；天然支持多源；库内有先例 | 多一次 join |

**审计建议（非决策）**：P2 更贴合现有工程习惯，且能同时承载「同步水位」「字段级 hash」「冲突标记」三项本轮缺失的能力。

### 10.5 已存在但**不可用**的外部键模式（必须写明）

| 模式 | 结构 | 为何不可用 |
|---|---|---|
| `hse_tasks.source_table + source_id` | `source_table varchar`、`source_id bigint` | `source_id` 为 **bigint**（Q7），`recXXXX` 无法解析为整数 |
| `hse_events.source_table + source_id` | 同上 | 同上 |
| `hse_assessment_deduction.source_table + source_id` | 同上 | 同上 |
| `hazards.remark` | varchar(512) | 可存 `req:<cid>`，但**人工可改、非唯一、无索引** ⇒ 只作辅助 |

### 10.6 幂等判定流程（契约，不实现）

```text
拉取一条源记录
  ├─ record_id 缺失 ────────────────▶ QUARANTINE（不计入统计，告警）
  ├─ 计算 sync_hash（映射字段有序集合 SHA-256）
  ├─ 查 external_key
  │    ├─ 命中且 sync_hash 相同 ────▶ SKIP（不写）
  │    ├─ 命中且 sync_hash 不同 ────▶ UPDATE（按字段级覆盖规则）
  │    └─ 未命中 ────────────────────▶ INSERT（先 hazards，后 rectification/review，同事务）
  └─ 任一步异常 ────────────────────▶ ROLLBACK + 记 audit（状态 FAILED，可重试）
```

**「映射规则版本变化」与「源数据变化」必须区分**：`sync_hash` 只对**源字段值**做哈希（不含映射规则）；映射规则变更时用 `mapping_version` 标记，触发**全量重算**而非全量重写，且不覆盖人工维护列。

---

## 11. 更新 / 冲突 / 删除 / 失败处理契约

### 11.1 字段级覆盖分级

| 级别 | 含义 | 本文涉及的列 |
|---|---|---|
| **S 源事实**（源变即覆盖） | 以 Feishu 为准 | `description`、`location`、`hazard_type`、`hazard_level`、`risk_level`、`hazard_date`、`checker_id`、`checker`、`remark`、`hse_rectifications.measure/completed_at/deadline`、`hse_reviews.comment/review_date/reviewer_name` |
| **C 条件覆盖**（需豁免方可写） | 与既有护栏冲突 | `hazards.status`（W2 状态机） |
| **M 人工维护**（**永不覆盖**） | 业务人工填 | `hazards.related_risk_id`（风险关联）、`hazards.grid_id`（网格归属）、`hse_rectifications.department_id`（若组织关系已人工修正） |
| **P PG 派生**（不由同步写） | 平台自算 | `created_at`、`updated_at`、`is_deleted` |

### 11.2 四种更新情形

| 情形 | 处理 |
|---|---|
| 源字段缺失（列不存在） | 不动目标列 |
| 源字段存在但为空 | **不默认清空**；仅当该字段在 `null_policy` 明确「空即清空」白名单内才写 NULL（本文**无**此类字段） |
| 源字段有新值 | 按级别覆盖 |
| 源记录未变化（`sync_hash` 相同） | 不写，仅更新 `last_sync_at` |

### 11.3 删除与撤销

- C-0 实测：**无删除路由**，2 条记录 `total=2` 稳定。
- 但不得外推为「永不删除」。契约：
  1. 单次拉取**失败** ≠ 记录被删（必须用分页完整性 + `total` 一致性判定）；
  2. 连续 N 次（建议 3）完整拉取均缺失 + `total` 同步下降，才进入 `SUSPECT_DELETED`；
  3. `SUSPECT_DELETED` **只告警，不删 PG**；软删/归档需独立数据治理规则（本轮不定义、不实现）。

### 11.4 失败分类与重试

| 类别 | 例子 | 重试 |
|---|---|---|
| 传输失败 | 429 / 5xx / 超时 | 指数退避，有上限 |
| 解析失败 | 字段类型异常、日期不可解析 | 不重试，进 QUARANTINE |
| 转换失败 | 枚举值越界 | 不重试，字段置 NULL + 告警 |
| 身份未命中 | `phone_hash` 0 命中 | 不重试，置 NULL |
| 区域未命中 | 词表外文本 | 不重试，`township_norm=NULL` |
| 落库失败 | 约束冲突 / 死锁 | 事务回滚，有限重试 |

### 11.5 审计字段（契约，不建表）

必须记录：`batch_id`、`fetched_at`、`source_system`、`source_table_id`、`external_record_id`、`record_parsed`、`field_converted`、`identity_status`、`region_status`、`conflict_flag`、`persist_result`、`error_class`、`retry_count`、`mapping_version`。

### 11.6 明确禁止

- ❌ 调 `/api/mobile/hazard/*`（生产写接口）
- ❌ 反向写 Feishu（任何 `PUT`/`POST`/`PATCH`/`DELETE`）
- ❌ 复用 Worker 的 `updateRecord` 局部更新通道
- ❌ 用 `hazards.remark` 里的 `cid` 做唯一判定
- ❌ 在同步层伪造 `hse_reviews` 行来「补齐」复查证据

---

## 12. 历史 110 条与 Feishu 2 条隔离规则

### 12.1 两组数据的性质

| 组 | 来源 | 行数 | 状态 |
|---|---|---:|---|
| H 组（历史资产） | `file_records.id=315`《2026年安全生产隐患排查登记表.xlsx》一次性导入 | **110** | `closed` 60 / `discovered` 50；`township` 0/110、`location` 2/110、`category`/`hazard_category`/`hazard_level`/`risk_level`/`grid_id`/`checker_id` **全 0** |
| F 组（Feishu 源） | H5→Worker→Feishu | **2** | 均 `待整改`；闭环 15 列 0/2 |

### 12.2 九条隔离规则

| # | 规则 | 依据 |
|---:|---|---|
| 1 | 不自动合并 | 两组**无共同键**（H 组无 `record_id`，F 组无 `no`） |
| 2 | 不回填 `external_record_id` 到历史行 | H 组 110 行来源为 Excel，与 Feishu 无对应关系 |
| 3 | 不按 `隐患编号` 合并 | F 组编号为 `YH…`；H 组无该字段 |
| 4 | 不按描述/位置/时间自动去重 | 兜底匹配等于制造假同一性 |
| 5 | 不把 H 组 `closed` 当「已复查」 | H 组 `closed` 系 Excel「是」→`已完成`→迁移，**0 条复查证据** |
| 6 | 不修改历史行 | 本轮禁 DML |
| 7 | F 组新增行必须带 `external_source` 标记（P1/P2 落地后） | 否则两组在同一张表内不可区分 |
| 8 | 统计口径必须能**排除**或**单列**某一组 | 否则闭环率被 60 条历史 `closed` 污染 |
| 9 | 历史迁移/去重/业务编号建设**另立任务** | 不在 B03 范围 |

### 12.3 潜在冲突预警

- `hazards.no`：110 行非空但 **仅 66 个唯一值**（Q1）⇒ 若未来用它做业务序号，会撞号；F 组写入时 `no` 必须留 NULL。
- `hazards.hazard_source`：110 行全为默认值 `'daily_check'`（非业务值）。若用作来源判别，历史行会被误判为「日常检查」⇒ **建议改用新增 `external_source` 列**，不复用 `hazard_source`。

---

## 13. DEC-03 / 04 / 05 / 09 的依赖关系

### 13.1 裁决状态（实测）

| 编号 | 主题 | 状态 | 证据 |
|---|---|---|---|
| B02-DEC-03 | 区域主数据 | **未裁决**（BLOCKED） | D3 全文 17 处 `【待业务裁决】`，无一处填写 |
| B02-DEC-04 | 隐患 A/B/C 模型选型 | **未裁决** | 同上 |
| B02-DEC-05 | PG 与飞书隐患权威归属 | **未裁决** | 同上 |
| B02-DEC-09 | 考核分数列 | **未裁决** | 同上 |

### 13.2 本文对四项的依赖

| DEC | 若未裁决 | 本文受影响范围 | 未裁决时的临时安全行为 |
|---|---|---|---|
| **DEC-05** | 无法确定「Feishu 是否为事实源、PG 是否为分析落点」 ⇒ **本文件全部映射的方向假设都不成立** | 整份（38/38） | 先只做「字段级契约」，不落任何数据；不设计 B03-01-D 实现 |
| **DEC-04** | 目标表不确定 | **11 个 `CONDITIONAL`**（#7 除外 → 受时间口径影响）：#18-#20、#24-#26、#28-#31 | 按 A+C 出契约，但**全部标 `CONDITIONAL`**，不得视为已定稿 |
| **DEC-03** | `township_norm` 语义未定（乡镇名 vs 组织名）§8.5 | #10 的归一结果、§8 全部 | `township_norm` **先不写**（恒 NULL），只保 `location_raw` |
| **DEC-09** | 考核分数列未定 | **本文无直接影响**（Q8：deduction 15 个 `source_table` 不含隐患三表） | 不受阻；但若未来把隐患接入考核，须先裁 DEC-09 |

### 13.3 B03 硬前置的收敛

B02 认定 B03 硬前置为 **01/03/04/05/09**。本文实测后进一步明确：

- **DEC-05 是「元前提」**：它不是某一字段的依赖，而是「整个 Feishu→PG 方向」的成立条件；
- **DEC-04 影响面最大**（11/38 字段），但**不阻塞字段级契约书写**，只阻塞「定稿」；
- **DEC-03 可通过「先不写 `township_norm`」降级规避**，不阻塞落库；
- **DEC-09 与本文无关**（Q8 实证）。

---

## 14. DEC-16 / 17 / 18 待裁决登记

> 以下三项由「本轮映射」暴露，B02-DEC 原文未覆盖。**均由业务负责人裁决，AI 与开发不得代裁。**

### 14.1 B02-DEC-16｜用户选择的隐患类别 vs AI 原始分类，谁是权威？

| 项 | 内容 |
|---|---|
| 当前证据 | 生产 2 条中 **1/2 冲突**：记录 B `隐患类别=设备设施`，但 `AI识别原始输出.category=高处作业`（C-0 §6.4）。`隐患类别` 是 11 值单选（用户点选，Worker 校验），`AI识别原始输出` 是 ≤4000 字 JSON 原文 |
| 未裁决内容 | ① 下游「隐患类别」统计应以哪个为准；② 二者冲突时的业务处置（以用户为准 / 以 AI 为准 / 需人工复核 / 双轨并存） |
| 影响字段 | #8 隐患类别、#38 AI识别原始输出 |
| 影响目标表 | `hazards.hazard_type` |
| 是否阻塞**当前字段映射** | **否**（两字段均独立保留，映射本身可写） |
| 是否阻塞**后续同步实现** | **是**（若选「AI 为准」，则 #8 写入值需改为解析 JSON；若选「用户为准」，则 #38 仅作存档） |
| 需谁决定 | 业务负责人（安环管理部） |
| 未裁决时临时安全行为 | **两值分别原样保留，互不覆盖**；`hazard_type` 只取 `隐患类别`；`AI识别原始输出` 因无目标列暂不落库（**数据会丢，需在 D 阶段补 raw 列**） |

### 14.2 B02-DEC-17｜隐患位置无法归一时如何处理？

| 项 | 内容 |
|---|---|
| 当前证据 | `隐患位置` 是普通 input（maxlength 100）、**非必填**、「定位」按钮可将 GPS 逆地理**整段地址**写入（C-0 §9.2）。16 项词表 16/16 可归一，但词表外文本**无归一依据**。生产 2 条恰好均为 `大柳镇`（词表内），**样本量为 0 的反例** |
| 未裁决内容 | ① 词表外位置是否允许入库；② 是否要求 H5 侧强制选择（涉及**修改生产链**，本轮禁）；③ 未归一时统计如何处置（计入「未归属」/ 单独报表 / 拒绝） |
| 影响字段 | #10 隐患位置 |
| 影响目标表 | `hazards.location`、`hazards.township` |
| 是否阻塞**当前字段映射** | **否**（`location_raw` 必写、`township_norm` 可空，契约已闭合） |
| 是否阻塞**后续同步实现** | **部分**（可实现落库，但乡镇统计口径会长期缺失） |
| 需谁决定 | 业务负责人 + H5 产品负责人（若要改必填） |
| 未裁决时临时安全行为 | `location_raw` 原样入库；`township_norm = NULL` 并计数；**不拒绝整条记录、不回填上级区域、不模糊匹配** |

### 14.3 B02-DEC-18｜`hse_org_unit` 是否补齐「环卫 / 市政园林」两个作业中心？

| 项 | 内容 |
|---|---|
| 当前证据 | **题面需修正**（§8.4）：两中心**存在**，但为 **L2**（`环卫作业中心` id=7、`市政绿化作业中心` id=20），非 L3；且 PG 名「市政**绿化**」vs Worker/身份表「市政**园林**」。L3 恰好 12 个乡镇作业中心 |
| 未裁决内容 | ① 作业中心应挂 L2 还是 L3；② `市政园林` 与 `市政绿化` 是否同一实体、以哪个为准；③ 若保持现状，按组织聚合时如何处理 2 个中心（单列 / 挂父级 / 排除） |
| 影响字段 | #20 整改人部门（以及任何「按作业中心聚合」的统计） |
| 影响目标表 | `hse_rectifications.department_id`、`hse_org_unit` |
| 是否阻塞**当前字段映射** | **否**（映射到 `hse_org_unit.id` 可行，#20 值恒为「安环管理部」，与两中心无关） |
| 是否阻塞**后续同步实现** | **否**（但会影响按作业中心的统计正确性） |
| 需谁决定 | 业务负责人 + 组织主数据责任人 |
| 未裁决时临时安全行为 | **不修改组织数据、不虚构 `org_unit_id`**；作业中心文本一律不转外键；涉及两中心的聚合降级为「未归类」 |

---

## 15. 未映射字段清单（15 项）

| # | 源字段 | 缺失原因 | 数据是否会丢 | 建议（不实施） |
|---:|---|---|---|---|
| 2 | 隐患编号 | `hazards` 无 code 类列 | **会** | D 阶段增 `display_no varchar(32)`（仅展示，非键） |
| 6 | 排查人职位 | 无可复用活列（`post_name` 死列） | 会（但 `employee.roster_position` 已有） | 不落；以 employee 为准 |
| 12 | 纬度 | 无列 | **会** | 增 `geo_lat numeric` |
| 13 | 经度 | 无列 | **会** | 增 `geo_lng numeric` |
| 14 | 现场照片 | 无附件列 | **会** | 增附件子表（`hazard_attachment`） |
| 21 | 指派人ID | 无列（`created_by` 语义不同） | **会** | 增 `assigner_id bigint` |
| 22 | 指派人姓名 | 无列 | 会 | 增 `assigner_name` |
| 23 | 指派时间 | 无列（`started_at` 非指派） | **会** | 增 `assigned_at timestamptz` |
| 27 | 整改后照片 | 无附件列 | **会** | 同上附件子表 |
| 32 | 打回次数 | 无列 | **会** | 增 `reject_count int` |
| 33 | 整改依据 | 无列 | **会**（AI 产出） | 增 `ai_basis text` |
| 34 | 整改建议 | 无列 | **会**（AI 产出） | 增 `ai_suggestion text` |
| 35 | 三违判定 | 无列 | **会** | 增 `is_three_violation boolean`；**禁并入 `violation_records`** |
| 36 | 重大事故隐患判定 | 无列 | **会** | 增 `is_major_hazard boolean`；**禁并入 `hazard_level`** |
| 38 | AI识别原始输出 | 无列 | **会**（且是 DEC-16 的唯一依据） | 增 `ai_raw jsonb` 或 `text` |

**统计**：15 项 UNMAPPED 中，**13 项是「目标表缺列」**，2 项是「字段存在但禁复用」（#6 死列、#2 无码列）。这意味着：**若不做 DDL，Feishu 38 字段中约 34% 的信息无法落地**。

---

## 16. 风险清单

| # | 级别 | 风险 | 证据 | 影响 |
|---|---|---|---|---|
| R1 | **P1** | `hazards` 无外部键列，无 DDL 即**无法幂等** | Q1 | 重复拉取会重复建行，历史 110 行被污染 |
| R2 | **P1** | 同步直写 `hazards.status` 绕过状态机 W2 | C1 `:853-855` | 状态可被任意改写，`closed` 与复查证据脱钩 |
| R3 | **P1** | 「已闭环」可由提交人自证（登记即闭环） | C-0 §6.2 / B03-01-B §9 | 若同步据 `closed` 生成 `hse_reviews`，等于伪造复查证据 |
| R4 | **P1** | 双 base 同名表（`.dev.vars` vs `wrangler.toml`） | C-0 §3.3 | 仅 `record_id` 不足以定位来源，必须三元组 |
| R5 | **P1** | `alerts.js` 3 处查询取自不存在列 | C3 `:84,310,341` | 该路径必报 42703；若被 catch 吞掉则静默返回 0 |
| R6 | **P2** | `hazards.no` 110 行仅 66 唯一 | Q1 | 禁作业务序号/键 |
| R7 | **P2** | `hazards.hazard_source` 全为默认值 | Q1 | 复用为来源判别会造成误判 |
| R8 | **P2** | `remark` 被 `req:<cid>` 占用 | C-0 §7.5 | 无法承载业务备注；人工可改 |
| R9 | **P2** | 状态 5→4 有损（`已整改`/`待验收` 无干净对应） | §6.4 | 统计口径不可逆 |
| R10 | **P2** | `排查人部门` 恒为常量 | C-0 §8.3 | 误用即伪组织维度 |
| R11 | **P2** | `phone_hash` 无唯一约束（3 组重复全已删） | Q4 | 未来可能出现 ambiguous |
| R12 | **P2** | `employee.phone_hash` 仅 1326/3417 覆盖（38.8%） | Q4 | 非全员可桥；未覆盖者只能 NULL |
| R13 | **P2** | 「市政园林」vs「市政绿化」名称不一致 | N5 | 按名匹配会漏 1 个中心 |
| R14 | **P2** | 源为单行状态机，改派清场 | B03-01-B §10.2 | 无法重建操作历史 |
| R15 | **P3** | 类型不匹配：`hazards.fixer_id` 为 `integer` 而 `employee.id` 为 `bigint` | Q1 / Q4 | 当前值域安全，但长期有溢出隐患 |
| R16 | **P3** | `hse_rectifications.deadline` 为 `timestamptz` 而源为纯日期 | Q2 | 截止时刻口径未定（§6.5） |

---

## 17. C 节点准入判断

### 17.1 九条 PASS 条件逐条核对

| # | 条件 | 结论 | 说明 |
|---:|---|---|---|
| 1 | 38 个实际字段全部进入矩阵 | ✅ | §5.2/§5.3 各 38 行，含 3 项 `NOT_APPLICABLE`（附不适用证据） |
| 2 | 每个映射都有真实源字段、真实目标结构与证据引用 | ✅ | 12 个目标列全部 `information_schema` 实测；15 个 UNMAPPED 均附「列不存在」证据 |
| 3 | 不存在按字段名臆造的目标列 | ✅ | §5.4 交叉校验：0 处臆造 |
| 4 | 外部键与幂等契约明确 | ✅ | §10；并明确 `hazards` **需 DDL** 才能幂等 |
| 5 | 人员与区域映射有空值及失败处理 | ✅ | §7.3 五态、§8.2 七层 + 四类 miss 原因 |
| 6 | 历史数据与未来同步数据完全隔离 | ✅ | §12 九条规则 |
| 7 | 所有未裁决事项显式登记 | ✅ | §13（4 项）+ §14（3 项） |
| 8 | 生产冻结边界完整遵守 | ✅ | 0 代码/0 部署/0 飞书写/0 PG 写 |
| 9 | 未发生代码、DDL、DML、配置、部署及生产数据修改 | ✅ | 见 §18 |

### 17.2 为什么不是 PASS

字段矩阵本身完整，但存在两类**不由本文件能闭合**的缺口：

1. **11/38 字段依赖 DEC-04**（隐患模型未裁决）⇒ 目标表本身是条件性的；
2. **DEC-05 是整个方向的前提**，未裁决 ⇒ 全部映射的「方向合法性」尚未被批准。

按任务书 §十五「字段矩阵完成，但 DEC 裁决或部分映射仍有缺口，应标记 `PASS WITH GAPS`」：

> **B03-01-C = PASS WITH GAPS**

### 17.3 进入 D 节点前必须满足的四条硬约束（建议直接写入 D 任务书）

1. **方向**：`Feishu READ API → 独立 Sync Layer → PG`；禁调 `/api/mobile/hazard/*`、禁任何反向写、禁复用 Worker 写通道。
2. **幂等**：先落地 P1 或 P2（§10.4）之一，**否则不得开工**（当前 `hazards` 无载体）。
3. **状态**：`hazards.status` 的写入必须取得 W2 豁免并留审计；未取得前，同步**只写非状态列**，状态由业务动作驱动。
4. **证据**：`hse_reviews` 行**只允许**在源侧存在 `验收人` 或 `验收结论` 时创建；**禁止**由 `closed` 反推。

---

## 18. 证据索引与合规声明

### 18.1 本轮实际读取

| 类别 | 内容 |
|---|---|
| 文档 | D1～D6（6 份，含 C-0 附录A 38 列、B03-01-B §4 字段矩阵、B02-DEC 全文） |
| 代码 | C1～C9（9 个文件的相关区段：`hazardService.js`、`overview.js`、`alerts.js`、`hse-chain.js`、`workflowService.js`、`encryption.js`、`worker/index.js`、`storage/*.js`、`frontend/check.app.js`） |
| 数据库 | 9 组只读查询（`information_schema.columns` / `pg_constraint` / `pg_indexes` / 计数与取值分布），仅 `safety_dashboard_dev` |
| 飞书 API | **1 次 records GET**（`page_size=10`，返回 2 条记录，用于计算 `phone_hash`）+ **1 次 auth POST**（取 token，非数据面） |

### 18.2 合规声明

| 项 | 结果 |
|---|---|
| 代码修改 | **0** |
| DDL | **0** |
| DML | **0** |
| 配置修改 | **0** |
| 部署 | **0** |
| 飞书写入 | **0**（无 PUT/POST/PATCH/DELETE） |
| PG 写入 | **0**（仅 SELECT） |
| 生产数据修改 | **0** |
| 新增文件 | **2**（本报告 + 同源 CSV） |
| 敏感信息 | 手机号未落文档；姓名脱敏为 `刘**`；密钥未输出 |

### 18.3 本轮自我纠错

| # | 初稿判断 | 实测 | 修正 |
|---:|---|---|---|
| 1 | 拟以 `hazards.level` 作「隐患级别」落点 | `level` 的 3 处读点（C3）均取自不存在列 ⇒ 无活读点 | 改落 `hazard_level`（C2 唯一活读点） |
| 2 | 拟把 `hazards.category` 作「隐患类别」落点 | `category` 在 `hazards` 语句窗口 **0 引用**（仅测试/demo） | 改落 `hazard_type`（C1 `:789` 活写列） |
| 3 | 拟沿用 C-0「L3 缺环卫/市政园林」表述 | 两中心存在，在 **L2**，且名称「市政绿化」≠「市政园林」 | §8.4 修正题面，DEC-18 重述 |
| 4 | 拟用 `hse_tasks.source_table + source_id` 作外部键先例 | `source_id` 为 **bigint** | §10.5 改为「不可用」，另引 `grid_record_sync_map` |

---

## 附录A：完整字段矩阵（21 列合并视图）

见同目录 **`B03-01-C-字段映射矩阵.csv`**（UTF-8，逗号分隔，38 行 × 21 列）。

- **生成原因**：21 列 × 38 行在单一 Markdown 表格中不可读，故正文拆为「溯源半表 + 落点半表」（§5.2/§5.3），CSV 为二者按 `#` 合并后的单表。
- **字段对应**：CSV 列顺序 = `source_system, source_table_id, source_field_id, source_field_name, source_field_type, source_write_evidence, production_value_evidence, semantic_definition, target_table, target_column, target_type, transform_rule, null_policy, normalization_rule, identity_or_region_link, idempotency_role, conflict_policy, evidence_reference, decision_dependency, mapping_status, notes`
- **相互关系**：CSV 与 §5.2/§5.3 **同源**（由正文解析生成，不单独维护）；修改正文即需重新生成 CSV。

## 附录B：字段级结论速查（不含证据列）

| # | 源字段 | → 目标 | 状态 |
|---:|---|---|---|
| 1 | 多行文本 | —（不映射） | NOT_APPLICABLE |
| 2 | 隐患编号 | —（缺列） | UNMAPPED |
| 3 | 排查人ID | `hazards.checker_id` | **CONFIRMED** |
| 4 | 排查人姓名 | `hazards.checker` | PARTIAL |
| 5 | 排查人部门 | —（常量） | NOT_APPLICABLE |
| 6 | 排查人职位 | —（缺列） | UNMAPPED |
| 7 | 排查时间 | `hazards.hazard_date` | CONDITIONAL |
| 8 | 隐患类别 | `hazards.hazard_type` | CONDITIONAL |
| 9 | 隐患级别 | `hazards.hazard_level` | **CONFIRMED** |
| 10 | 隐患位置 | `hazards.location` | **CONFIRMED** |
| 11 | 隐患描述 | `hazards.description` | **CONFIRMED** |
| 12 | 纬度 | —（缺列） | UNMAPPED |
| 13 | 经度 | —（缺列） | UNMAPPED |
| 14 | 现场照片 | —（缺列） | UNMAPPED |
| 15 | 处理状态 | `hazards.status` | CONDITIONAL |
| 16 | 备注 | `hazards.remark` | PARTIAL |
| 17 | 创建时间 | —（不写 created_at） | NOT_APPLICABLE |
| 18 | 整改人ID | `hse_rectifications.responsible_person_id` | CONDITIONAL |
| 19 | 整改人姓名 | `hse_rectifications.responsible_person_name` | CONDITIONAL |
| 20 | 整改人部门 | `hse_rectifications.department_id` | CONDITIONAL |
| 21 | 指派人ID | —（缺列） | UNMAPPED |
| 22 | 指派人姓名 | —（缺列） | UNMAPPED |
| 23 | 指派时间 | —（缺列） | UNMAPPED |
| 24 | 整改期限 | `hse_rectifications.deadline` | CONDITIONAL |
| 25 | 整改说明 | `hse_rectifications.measure` | CONDITIONAL |
| 26 | 整改提交时间 | `hse_rectifications.completed_at` | CONDITIONAL |
| 27 | 整改后照片 | —（缺列） | UNMAPPED |
| 28 | 验收人 | `hse_reviews.reviewer_name` | PARTIAL |
| 29 | 验收时间 | `hse_reviews.review_date` | CONDITIONAL |
| 30 | 验收结论 | `hse_reviews.comment` | CONDITIONAL |
| 31 | 闭环时间 | `hse_reviews.review_date`（复用） | PARTIAL |
| 32 | 打回次数 | —（缺列） | UNMAPPED |
| 33 | 整改依据 | —（缺列） | UNMAPPED |
| 34 | 整改建议 | —（缺列） | UNMAPPED |
| 35 | 三违判定 | —（缺列） | UNMAPPED |
| 36 | 重大事故隐患判定 | —（缺列） | UNMAPPED |
| 37 | 风险等级 | `hazards.risk_level` | **CONFIRMED** |
| 38 | AI识别原始输出 | —（缺列） | UNMAPPED |

## 附录C：权威数据地图（隐患域落点）

```text
                    ┌────────────────────┐
                    │ 主数据层            │
                    │ employee.id (6698)  │◀── phone_hash ── 源「排查人ID」
                    │ hse_org_unit (5/7/20)│◀── 名称→id ──── 源「整改人部门」
                    │ 区域词表 16 项       │◀── 位置文本 ──── 源「隐患位置」
                    └─────────┬──────────┘
                              │
                              ▼
                    ┌────────────────────┐
                    │ 隐患事实 hazards    │  ← #3 #4 #7 #8 #9 #10 #11 #15 #16 #37
                    │ （110 历史 + 新增）  │     全部落点均经 information_schema 验证
                    └─────────┬──────────┘
                              │ hazard_id (FK RESTRICT)
              ┌───────────────┴───────────────┐
              ▼                               ▼
   ┌──────────────────────┐        ┌──────────────────────┐
   │ 整改事实              │        │ 复查事实              │
   │ hse_rectifications   │        │ hse_reviews          │
   │ #18 #19 #20 #24 #25  │        │ #28 #29 #30 #31      │
   │ #26（0 行）           │        │（0 行）               │
   └──────────┬───────────┘        └──────────┬───────────┘
              │ rect_code UNIQUE                │ review_code UNIQUE
              └───────────────┬─────────────────┘
                              ▼
                    ┌────────────────────┐
                    │ 分析/统计（读）      │
                    │ overview.js:161     │  hazard_level / status / deadline_date
                    │ hse-chain.js:166-188│  rectifications / reviews
                    │ hse-statistics.js   │
                    └────────────────────┘

   ※ 考核域 hse_assessment_deduction 的 15 个 source_table 中**不含**上述三表
     ⇒ 隐患同步**不会**自动产生扣分（Q8 实测）。
```

---

**B03-01-C 结论：PASS WITH GAPS。**
38 字段全部入矩阵（21 属性），5 项 `CONFIRMED`、11 项 `CONDITIONAL`、4 项 `PARTIAL`、15 项 `UNMAPPED`、3 项 `NOT_APPLICABLE`；硬缺口是 `hazards` 无外部键列（幂等需 DDL）与 13 个字段无目标列。
