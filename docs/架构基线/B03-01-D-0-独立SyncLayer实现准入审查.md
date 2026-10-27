B03-01-D-0 = PASS WITH GAPS
实现准入 = BLOCKED（7 项硬阻塞：4 项待业务裁决 / 2 项待技术授权 / 1 项待人类确认配置；不得据此开工）

> 本文件为**只读审查**产出。全文未执行任何 `INSERT/UPDATE/DELETE/DDL`，未修改任何代码、配置、依赖、部署与生产数据；
> 未触碰 `H5 → Worker → Feishu` 生产链路；未新增 Worker→PG / H5→PG 链路。唯一对数据库的动作是对 `safety_dashboard_dev`
> 执行 **9 组只读 SELECT**（首条 SQL 断言 `current_database()`）。

---

# B03-01-D-0｜独立 Sync Layer 实现准入与幂等载体方案审查

| 项 | 值 |
|---|---|
| 任务编号 | B03-01-D-0 |
| 上游交付 | B02-DEC（`56c369d`）／B03-01-B（`d045abf`）／B03-01-C-0（`e2df310`）／B03-01-C（`36f286c`） |
| 本文件状态 | `PASS WITH GAPS`（审查完成，缺口已列明） |
| 实现准入 | `BLOCKED`（不具备进入实现阶段条件） |
| 业务裁决依赖 | DEC-03 / DEC-04 / DEC-05 / DEC-09 / DEC-16 / DEC-17 / DEC-18（**7 项全部仍为「待决定」**） |
| 数据库动作 | 0 DDL / 0 DML（仅 9 组只读 SELECT，见 §12） |
| 代码动作 | 0（未修改任何 `.js` / `.vue` / `.toml` / `.env`） |
| 生产链路动作 | 0（H5 / Worker / Feishu 表结构 / 权限 / 配置均未改动） |

---

## 0. 结论摘要（先给答案，再看证据）

| 任务设问 | 结论 | 一句话依据 |
|---|---|---|
| ① 现有架构是否具备进入实现阶段的条件？ | **否** | 元前提 DEC-05 未裁；幂等载体不存在；状态机 3↔4 不对称且无裁决 |
| ② Feishu 记录如何建立稳定唯一可追溯的外部身份？ | **可解，但必须新建 `hazard_sync_map`** | `hazards` 46 列中**零**外部标识列、除 PK 外**零**唯一约束；`record_id` 是唯一稳定标识（`no` 只有 66/110 唯一） |
| ③ 如何保证幂等、状态安全、字段完整性？ | **幂等可解；状态安全不可解（需裁）；字段完整性 13/38 无落点** | 见 §3 / §4 / §6 |
| ④ 哪些由业务裁、哪些由技术提方案？ | 业务 8 项（§9）／技术 16 项（§10） | 已分离管理，无一条技术建议被写成结论 |
| ⑤ 若暂不具备准入条件，阻塞项是什么？ | **7 项硬阻塞 + 5 项软阻塞** | 见 §11 |

**三条最容易被忽略的硬事实**（本轮新增证据，直接决定设计方向）：

1. **`hazards` 110 行的所有业务关联列填充率均为 0**：`township` 0/110、`hazard_level` 0/110、`hazard_type` 0/110、`risk_level` 0/110、`responsible_dept_id` 0/110、`grid_id` 0/110、`checker_id` 0/110、`fixer_id` 0/110、`location` 仅 2/110。
   ⇒ 「不得自动合并历史 110 条与 Feishu 记录」不只是纪律要求，而是**技术上除 `description`/`location` 文本外没有任何连接点**。
2. **Feishu 侧不存在「整改中」状态，PG 侧存在 `processing`**：Worker 只有 3 态（`待整改/待验收/已闭环`，`index.js:2954,2962,2963`），PG 状态机有 4 态。
   ⇒ 同步**不可能**用「源状态镜像」实现，必须显式裁决 `processing` 的归属。
3. **「已闭环」可以由提交人自证，且 `close()` 路径零验收证据**：`index.js:3321,3327-3332`（带整改后照片提交即置「已闭环」，`验收结论='登记时已现场整改，直接闭环'`）；`hazardService.js:1099-1138`（`close()` 只改 `hazards.status`，**不写 `hse_reviews`**）。
   ⇒ 若同步据 `已闭环` 生成 `hse_reviews`，等于**伪造复查证据**（触碰红线 11）。

---

## 1. 执行环境与基线核验

### 1.1 Git 与工作区

| 检查项 | 命令 | 实测结果 | 判定 |
|---|---|---|---|
| 当前分支 | `git rev-parse --abbrev-ref HEAD` | `feat/hse-business-closure` | — |
| HEAD | `git rev-parse HEAD` | `36f286c900556d253793daf038918692edb72c6c` | — |
| 远端 HEAD | `git rev-parse origin/feat/hse-business-closure` | `36f286c900556d253793daf038918692edb72c6c` | **HEAD == origin** ✅ |
| 最近提交 | `git log --oneline -6` | `36f286c` C（映射矩阵）→ `e2df310` C-0 → `d045abf` B → `56c369d` B02-DEC → `38be299` B02 → `b435948` B01 | ✅ 与摘要一致 |
| 工作区改动总数 | `git status --porcelain \| wc -l` | **153**（29 个 ` M`、4 个 `M `、1 个 `A `、119 个 `??`） | 既有改动**未被本轮触碰** |
| `server/routes/cost.js` 状态 | `git status --porcelain server/routes/cost.js` | `A  server/routes/cost.js` | ✅ 仍为暂存新增 |
| `server/routes/cost.js` MD5 | `md5sum server/routes/cost.js` | `e88ae2b0b275346dfc1431408aa00bff` | ✅ 与红线 12 一致 |

本轮执行的 Git 命令**全部为只读**（`rev-parse` / `log` / `status` / `md5sum`）；未执行 `add` / `reset` / `checkout` / `restore` / `commit` / `push`。

### 1.2 上游交付物实物核验

| 文档 | 路径 | 行数 | 字节 | 首次提交 |
|---|---|---:|---:|---|
| B02-DEC 业务裁决包 | `docs/架构基线/B02-DEC-业务裁决包.md` | 1275 | 76,570 | `56c369d` |
| B03-01-B 字段核验 | `docs/架构基线/B03-01-B-Worker-Feishu隐患字段核验报告.md` | 861 | 61,492 | `d045abf` |
| B03-01-C-0 清障 | `docs/架构基线/B03-01-C-0-Feishu同步前置证据清障报告.md` | 925 | 59,713 | `e2df310` |
| B03-01-C 映射矩阵 | `docs/架构基线/B03-01-C-Feishu隐患字段到PG目标字段映射矩阵.md` | 930 | 70,515 | `36f286c` |
| B03-01-C 矩阵 CSV | `docs/架构基线/B03-01-C-字段映射矩阵.csv` | 39 行（1 表头 + 38） | 13,924 | `36f286c` |

CSV 实测：**39 行 × 21 列**，UTF-8 BOM，`mapping_status` 分布 = `CONFIRMED 5 / CONDITIONAL 11 / PARTIAL 4 / UNMAPPED 15 / NOT_APPLICABLE 3`（合计 38，与正文一致 ✅）。

### 1.3 数据库对象实测（`safety_dashboard_dev`，PostgreSQL 17.10）

> 断言：每条 `-f` 脚本首条 SQL 均为 `SELECT current_database()`，输出 `safety_dashboard_dev` 后才执行后续语句。
> 连接方式：`psql -h 127.0.0.1 -U hse_app -d safety_dashboard_dev -f <file> -o <file>`，密码取自 `server/.env` 的 `DB_PASSWORD`（仅进程内 `PGPASSWORD`，未落盘、未打印）。

| 表 | 列数 | 行数 | 主键 | UNIQUE | 外键 | CHECK |
|---|---:|---:|---|---|---|---:|
| `hazards` | **46** | **110** | `id` | **0（除 PK）** | `checker_id→employee`、`fixer_id→employee` | **0** |
| `hse_rectifications` | 20 | **0** | `id` | `rect_code` | `department_id→hse_org_unit`、`responsible_person_id→employee`（**`hazard_id` 无 FK**） | 0 |
| `hse_reviews` | 18 | **0** | `id` | `review_code` | `hazard_id→hazards ON DELETE RESTRICT`、`reviewer_id→employee` | 0 |
| `grid_record_sync_map` | 12 | **2061** | `id` | `pg_record_id`、`(wps_record_id, wps_file_id)` | **0（无 FK 指向 `grid_inspection_records`）** | 0 |
| `hazard_attachments` | 13 | **0** | `id` | **0** | **0** | 0 |
| `hse_events` | 26 | 16 | `id` | `event_code` | `department_id→hse_org_unit`、`personnel_id→employee` | 0 |
| `hazard_record` | — | 9 | — | — | — | — |
| `hazard_versions` | — | 0 | — | — | — | — |
| `employee` | — | 3401（活跃） | `id` | **`uk_employee_phone_hash`（部分唯一：`WHERE phone_hash IS NOT NULL AND is_deleted=false`）** | — | — |
| `hse_org_unit` | 15 | 20（`is_deleted=false`） | `id` | — | — | — |

`hazards` 关键索引 15 个（`idx_haz_date`、`idx_haz_deadline`、`idx_haz_deleted`、`idx_haz_fixdate`、`idx_haz_level`、`idx_haz_no`、`idx_haz_status`、`idx_haz_township`、`idx_hazards_risk_level`、`idx_hazards_checker_id`、`idx_hazards_fixer_id`、`idx_hazards_grid_id`、`idx_hazards_hazard_type`、`idx_hazards_responsible_id`、`idx_hazards_status`），**无任何外部标识类索引**。

`hazards` 值分布实测：

| 列 | 填充 | 值分布 |
|---|---:|---|
| `status` | 110/110 | `closed` 60 / `discovered` 50（**已是 canonical，无 legacy 残留**） |
| `level` | 110/110 | `一般` 110（**列默认值冒充业务值**） |
| `hazard_level` | **0/110** | 全 NULL |
| `hazard_type` | **0/110** | 全 NULL |
| `risk_level` | **0/110** | 全 NULL |
| `township` | **0/110** | 全 NULL |
| `location` | **2/110** | — |
| `responsible_dept_id` / `grid_id` / `checker_id` / `fixer_id` | **各 0/110** | — |
| `review_result` / `reviewer_id` | **各 0/110** | — |
| `no` | 110/110 | 66 个唯一值；`COUNT(DISTINCT (no, hazard_date))` = **110** |

### 1.4 组织树实测（`hse_org_unit`，`is_deleted=false` 共 20 行：L1=1 / L2=7 / L3=12）

| id | level | org_name | org_type | org_code | parent_id | 本轮关注 |
|---:|---:|---|---|---|---:|---|
| 1 | 1 | 宁津项目公司 | company | COMPANY-001 | — | 根 |
| 5 | 2 | **安环管理部** | department | DEPT-SAFETY | 1 | **`org_path` 写的是「/宁津项目公司/安环品质部」——同一行内名称不一致** |
| 7 | 2 | **环卫作业中心** | center | CENTER-HW | 1 | **12 个 L3 乡镇作业中心全部挂在它下面** |
| 20 | 2 | **市政绿化作业中心** | center | CENTER-LH | 1 | **L3 子节点 = 0**；名称与 Worker/身份表的「市政**园林**」不一致 |
| 8–19 | 3 | 12 个乡镇作业中心 | town_center | TOWN-* | 7 | 行政单元落点 |

> 新增证据（本轮）：`市政绿化作业中心`(id=20) **没有任何 L3 子节点**。C-0/C 记录的是「两中心在 L2 而非 L3」，本轮进一步查明**它下面也没有乡镇层**——若隐患归到「市政园林」片区，组织树上无对应 L3 可落。该事实改变 DEC-18 的实质（不只是「层级归属」，而是「该中心缺失整棵子树」）。

### 1.5 代码侧实测（关键行号均为当前 HEAD 实读）

| 断言 | 证据位置 | 结论 |
|---|---|---|
| `hazards` 状态机 4 态 | `server/services/hazardService.js:140-145` | `discovered / processing / pending_review / closed` |
| 状态四分类（canonical/legacy/non_lifecycle/unknown） | `hazardService.js:152-200` | 读取可识别、写入只允许 4 值 |
| **W1**：创建时状态由服务端定死 | `hazardService.js:754-756` | 忽略客户端 `status` / `isResolved` |
| **W2**：普通更新禁止改状态 | `hazardService.js:847-849` | `update()` 白名单**不含** `status`；`reviewer_id/review_date/review_result` 已彻底移除（`:842-843`） |
| `close()` 不改写 `hse_reviews` | `hazardService.js:1114-1119`（仅 `UPDATE hazards`） | **「已闭环」可零验收证据存在** |
| `review(pass)` 同事务双写 | `hazardService.js:1038-1079` | 唯一产生 `hse_reviews` 的路径 |
| `formatRow` 只读 `hazards` 单表 | `hazardService.js:312-360` | **不 JOIN `hse_reviews` / `hse_rectifications`**；输出无 `township` |
| Web 复查信息取自同一行 | `views/hazards/index.vue:1271,1283,1289-1290` | `currentHazard.reviewerId / rectification / reviewResult` |
| 隐患域共 3 条 `INSERT INTO hazards` | `hazardService.js:789`、`riskControlService.js:1194`、`routes/demo-data.js:272` | 同步层将是**第 4 个写入者** |
| `hseEventSync` 在 `create()` 内被调用 | `hazardService.js:802` → `hseEventSyncService.js:83` | 同步层直写 SQL 将**不产生 `hse_events`** |
| ⚠️ `syncHazard(id)` 无数据入参时必失败 | `hseEventSyncService.js:93-96`（`SELECT ... dept ...`），但 `hazards` **无 `dept`/`department` 列**（实测 0） | 潜在 42703；当前 `create()` 传了 `hazardData` 才没炸 |
| Feishu 侧只有 3 态 | `worker/index.js:2954,2962,2963` | `待整改 / 待验收 / 已闭环` |
| 存量状态归一 | `worker/index.js:3055-3064`（`hazardStatusNorm`） | **空串 / 整改中 / 已整改 → 一律「待整改」** |
| 登记即闭环 | `worker/index.js:3321`、`:3327-3332` | 带整改后照片提交 ⇒ 直接「已闭环」+ 自证文案 |
| `review(reject)` 覆盖式写入 | `worker/index.js:3920-3927` | `验收人/验收时间/验收结论` **单槽覆盖**，仅 `打回次数`+1 |
| `assign` 写 8 键 + 改派清场 | `worker/index.js:3694-3711` | 改派会清空上一轮 `整改说明/整改提交时间/整改后照片` |
| `排查人ID` = 明文手机号 | `worker/index.js:940,1077`（`sub: identity.phone`）→ `:3313` | 身份桥必须 hash，源侧是明文 PII |
| 附件只发 `{fields}` | `worker/storage/feishuAdapter.js:186-211` | 同步层只能读，不可写 |
| 全表分页读取能力 | `feishuAdapter.js:52-83`（`page_size=500` + `page_token` 串行） | **无 filter / sort / 增量能力** |
| 服务端零 Feishu 代码 | `grep -rl feishu server/{services,routes}` = **0 文件**；`server/.env` 无 `FS_*` 键 | 凭证与客户端均不存在 |
| 可借鉴的幂等先例 | `wpsGridPullEngine.js:223-318`、`wpsFieldMap.js:108-148` | 受保护列硬断言 + 单事务双写 + hash 未变跳过 |

---

## 2. 范围与方法

### 2.1 本文件做什么 / 不做什么

| 做 | 不做 |
|---|---|
| 判定实现准入条件是否满足 | 不实现同步服务、定时任务、API |
| 设计外部身份与幂等载体（结构层面） | 不建表、不加列、不改索引 |
| 逐字段复核 C 的映射矩阵并修正 | 不执行数据迁移、不写任何业务数据 |
| 输出业务决策清单与技术问题清单（分离） | 不代替业务负责人作任何选择 |

### 2.2 「技术建议」与「业务决策」的分界（本文件的自律条款）

- **技术建议**（本文件可直接给出）：索引结构、事务边界、重试策略、日志脱敏、fail-closed 断言、幂等算法。
- **业务决策**（本文件只列题面、列选项、列影响，不给结论）：谁是事实源、状态语义、字段是否可丢、验收证据的定义、组织/区域口径。
- 凡本文件出现「建议选 X」，若属业务范畴，一律降级为 **`【待业务裁决】`** 并附「审计建议 ≠ 业务决策」声明。

---

## 3. P1｜外部身份与幂等载体方案

### 3.1 现状硬约束（先摆事实，再谈方案）

| 编号 | 事实 | 实测证据 | 对方案的含义 |
|---|---|---|---|
| P1-F1 | `hazards` 46 列中**没有任何**外部来源 / 外部 ID 列 | §1.3 列清单；`information_schema.columns` 中 `hazards` 无 `record_id/source_*/external_id` | 方案 B 必须**新增列**；方案 A 不碰 `hazards` |
| P1-F2 | `hazards` 除 PK 外**零唯一约束**，除 PK 外**零 CHECK** | `pg_constraint` 仅 `hazards_pkey` + 2 FK | 无现成幂等载体可挂 |
| P1-F3 | `hazards.no` 110 行仅 **66 唯一**；`(no, hazard_date)` 恰好 110 唯一但**无约束保证** | §1.3 值分布 | `no` 禁作键；`(no,hazard_date)` 是巧合，不可作为契约 |
| P1-F4 | 历史 110 行业务列全 0 填充 | §1.3 | 任何「按业务字段反查历史行」的合并策略都会失败 |
| P1-F5 | Feishu `record_id` 是唯一稳定标识，且 `no`（隐患编号）是 `newHazardNo()` 生成的 UTC 时间戳 + 4 随机数 | `index.js:3115-3120`（`new Date()` 未 +8h）；C-0 §7.3 | `no` 可重复、时区失真 ⇒ **禁作键**；`record_id` 是唯一候选 |
| P1-F6 | **双 base 同名表**：`.dev.vars` 与 `wrangler.toml` 的 6 张表**同名不同 ID**（生产隐患 `tblnyMjxtxjpP08q`，dev `tblxTdsCT9v3YY03`） | C-0 §3.3 | **仅 `record_id` 不足以定位来源**，键必须是含 `app_token + table_id` 的三元组 |
| P1-F7 | Feishu 一条记录要落到 **3 张目标表**（`hazards` 10 列 / `hse_rectifications` 6 列 / `hse_reviews` 4 列，见 C §11） | B03-01-C 矩阵 `target_table` 分布 | 单列 unique **无法表达 1:N 目标关系** |
| P1-F8 | `hse_rectifications.rect_code`、`hse_reviews.review_code` 均为 **UNIQUE NOT NULL** | §1.3 | 子对象可用**确定性 code** 作二级幂等载体，无需 DDL |
| P1-F9 | `grid_record_sync_map` 无 FK 指向 `grid_inspection_records` | §1.3 | 先例本身有孤儿风险，**不可照抄** |

### 3.2 三个方案

#### 方案 A｜专用同步映射表 `hazard_sync_map`（新表，`hazards` 零改动）

建议结构（**仅设计，未执行**）：

```
hazard_sync_map
  id                    bigserial      PRIMARY KEY
  source_system         varchar(16)    NOT NULL DEFAULT 'feishu'
  source_app_token      varchar(64)    NOT NULL      -- 双 base 隔离的第一段
  source_table_id       varchar(64)    NOT NULL      -- 双 base 隔离的第二段
  source_record_id      varchar(64)    NOT NULL      -- 飞书 record_id
  pg_hazard_id          bigint         NOT NULL      -- → hazards(id)，建议 ON DELETE RESTRICT（禁 CASCADE）
  pg_rectification_id   bigint         NULL          -- → hse_rectifications(id)
  pg_review_id          bigint         NULL          -- → hse_reviews(id)，至多 1（见 §4.4）
  source_hash           varchar(64)    NULL          -- 源字段投影哈希，判「未变更」
  last_status_raw       varchar(32)    NULL          -- 源侧原始状态原文，供审计
  last_sync_at          timestamptz    NULL
  miss_count            int            NOT NULL DEFAULT 0   -- 连续未读到次数
  conflict              boolean        NOT NULL DEFAULT false
  created_at            timestamptz    NOT NULL DEFAULT now()

  UNIQUE (source_app_token, source_table_id, source_record_id)
  UNIQUE (pg_hazard_id)
  CHECK  (source_system IN ('feishu'))     -- 一期单源，扩展时再放开
```

#### 方案 B｜`hazards` 增列 + 部分唯一索引

```
ALTER TABLE hazards ADD COLUMN source_system      varchar(16);
ALTER TABLE hazards ADD COLUMN source_record_id   varchar(64);
CREATE UNIQUE INDEX uk_hazards_source
  ON hazards (source_system, source_record_id)
  WHERE source_record_id IS NOT NULL;      -- 110 行历史保持 NULL，不冲突
```

#### 方案 C｜通用外部身份注册表 `external_record_map`

`(source_system, source_table, source_record_id, target_table, target_id, hash, ...)` 一张表承载所有源→所有目标；`hazards` 同样零改动。

### 3.3 八维度 × 三方案对比

| # | 维度 | 方案 A（专用映射表） | 方案 B（`hazards` 加列） | 方案 C（通用注册表） |
|---|---|---|---|---|
| 1 | **唯一性与重复防护** | 三元组 UNIQUE 强约束；`pg_hazard_id` 再 UNIQUE 防「一行挂两记录」。**可挡住全部重复路径** | 二元组 UNIQUE 可挡主对象重复；但**无法约束子对象**（1 条 Feishu → 1 rectification + ≤1 review），重拉时会重复插 `hse_rectifications` | 三元组 + `target_table` 复合 UNIQUE，能力等价 A；但「目标表」是字符串，**DB 层无法保证指向真实存在的行** |
| 2 | **重试/重复拉取幂等** | 先 `SELECT ... FOR SHARE` 再决定 INSERT/UPDATE；配合 `source_hash` 未变则只 rebaseline，**零业务写入** | 主对象可 `ON CONFLICT DO UPDATE`，语义干净；子对象仍需额外机制 | 同 A，但每次都要按 `target_table` 分支，逻辑分叉 |
| 3 | **同一记录更新后的识别** | `source_hash` 变化 ⇒ UPDATE；未变 ⇒ 跳过。哈希口径**可控且可冻结**（参照 `wpsFieldMap` 前 18 列冻结护栏） | 同 A（需另建哈希列，否则只能逐列比对） | 同 A |
| 4 | **来源隔离与未来扩展** | `source_system + app_token + table_id` 三段隔离；新增源需加常量或放宽 CHECK | 两列挤在核心业务表，**每加一个源就要在主表加列或塞值**；多源同表时语义漂移 | 天然多源；但一期只有 1 源 1 目标，**抽象税**明显高于收益 |
| 5 | **与 `hazards` 主键/历史兼容** | `hazards` **零改动**；110 行无需回填、无需标记；删除映射表 = 完全回滚 | 需加 2 列 + 1 部分唯一索引；110 行全 NULL（`WHERE` 条件已规避冲突，**迁移安全**） | 同 A（`hazards` 零改动） |
| 6 | **与 Web 页面/服务层/状态保护兼容** | 服务层零感知（`formatRow` 不读它）；`update()` 白名单不涉及；**W2 完全不受影响** | ⚠️ 新增列进入 `SELECT *`（`hazardService.js:886` 用 `RETURNING *`、`feishuAdapter` 不涉），`formatRow` 虽不输出但仍在行对象里；更关键：**任何人可写 `hazards` 的 3 条 INSERT 路径都会继承这两个列**，污染面扩张 | 同 A |
| 7 | **迁移风险/回滚/索引** | 回滚 = `DROP TABLE`（数据零损）；风险集中在「新表 DDL」本身；索引 2 唯一 + 1 普通即可 | 回滚 = `DROP COLUMN`（**在已有 110 行、15 索引的表上 DDL，锁表 + `RETURNING *` 兼容性风险**）；部分唯一索引需 `CONCURRENTLY` 才不阻塞 | 回滚同 A |
| 8 | **外部记录删除/停用/不可读** | `miss_count` 累加，达阈值置 `conflict=true` + 进异常报表；**绝不 DELETE 业务行**（对齐 `wpsGridPullEngine` 头部注释第 14 条「WPS 删除 ⇏ PG 删除」） | 只能把 `source_record_id` 置 NULL 或加 deleted 标记，**丢失「曾经同步过」的事实** | 同 A |
| 9 | **能否承载子对象映射**（本轮新增维度） | ✅ 有 `pg_rectification_id` / `pg_review_id` 位 | ❌ **不能**（`hazards` 只有一行，装不下 1:N） | ✅ 用多行表达 |
| 10 | **能否承载 `sync_hash`/批次/冲突** | ✅ 全部有位 | ❌ 需再加 3-4 列 ⇒ 核心表被同步元数据侵蚀 | ✅ |
| 11 | **是否需要 DDL 触碰核心业务表** | ❌ 不需要 | ✅ **需要**（`hazards` 是 31 FK 的 `employee` 之外最核心的隐患主表） | ❌ 不需要 |

### 3.4 技术推荐：方案 A

**推荐方案 A（专用映射表），理由按优先级：**

1. **决定性的**：Feishu 一条记录要落 3 张目标表（P1-F7），方案 B 的「单列 unique」在结构上无法表达 1:N 子对象幂等 —— 这是**能力缺失**，不是优劣取舍。
2. **风险最小**：`hazards` 是 Web 端唯一展示源（`formatRow` 只读它），任何一个列级 DDL 都会同时影响 3 条 `INSERT` 路径（P1-F4 之外的 `riskControlService.js:1194`、`demo-data.js:272`）与 `RETURNING *` 行为。方案 A 让核心表**零改动**。
3. **可回滚性最好**：`DROP TABLE` 是干净回退；`DROP COLUMN` 在 110 行 + 15 索引的表上需要更多维护窗口。
4. **与既有先例同构**：`grid_record_sync_map`（2061 行实证）就是「业务行 + 映射行同事务双写」的模式，风险已被验证。
5. **可演进到 C**：若未来接入 WPS/Excel 多源，`hazard_sync_map` 的 `source_system` 已是扩展点，必要时再抽通用层；**先专用后通用**比**先通用后专用**的返工成本低。

**不推荐方案 C 的理由**：一期只有 1 源（Feishu）1 目标主表，通用注册表的 `target_table` 字符串外键无法被 DB 约束，反而把「引用完整性」从「DB 保证」降级为「应用保证」——在当前 `hazards` 已有「`hse_rectifications.hazard_id` 无 FK」这种既存缺陷的环境里，再引入一个应用级引用是加重而非减轻。

**不推荐方案 B 的理由**：能力缺失（维度 9）+ 核心表污染（维度 11）+ 回滚成本（维度 7）。

### 3.5 关于「直接复用 `grid_record_sync_map`」

**结论：不可复用，只可借鉴。** 五条不适配事实：

| # | 不适配项 | 证据 |
|---|---|---|
| 1 | 键结构不匹配 | 该表键 = `(wps_record_id, wps_file_id)`；Feishu 必须 `(app_token, table_id, record_id)` 三元组（P1-F6） |
| 2 | 主键类型不匹配 | `pg_record_id` 是 `integer`，指向 `grid_inspection_records`；`hazards.id` 是 `bigint` |
| 3 | 无外键（孤儿风险） | §1.3：该表 **0 个 FK**；隐患映射更需要引用完整性 |
| 4 | 无子对象位 | 12 列中没有 `pg_rectification_id` / `pg_review_id` |
| 5 | 哈希口径不可移植 | `wpsFieldMap.js:116-148` 的 `SYNC_HASH_COLUMNS` 是 WPS 18 列冻结投影，模块加载即断言（`FROZEN_HASH_SEGMENT`），**换业务必须换口径** |

**可借鉴的三点**：① `assertNoProtectedColumns()` 的受保护列硬断言（`wpsGridPullEngine.js:223-230`）；② 单事务「业务行 + 映射行」双写（`:241-280`）；③ hash 未变则只 rebaseline、零业务写入（`:314-318`）。

### 3.6 P1 结论

| 项 | 结论 |
|---|---|
| 外部身份 | Feishu `record_id`，**必须**与 `source_system + app_token + table_id` 组成三元组；`隐患编号` 禁作键（UTC 时间戳 + 4 随机，非唯一保证） |
| 幂等载体（主对象） | **`hazard_sync_map` 的 3 列 UNIQUE**（需 DDL） |
| 幂等载体（子对象） | 复用既有 UNIQUE NOT NULL：`hse_rectifications.rect_code = 'RECT-FS-{record_id}'`、`hse_reviews.review_code = 'REV-FS-{record_id}'`（**零 DDL**）；但仅在业务裁决允许生成子对象行时启用 |
| 需要业务决策的部分 | 「Feishu 记录是否为 PG 隐患行的唯一来源」→ 属 **DEC-05**，不由技术定 |
| 需要技术授权的部分 | 新表 DDL（**T-01**） |

> **审计建议，不等于业务决策。** 方案 A 是技术选型，不涉及「谁是事实源」。

---

## 4. P2｜状态语义与写入权限

### 4.1 两侧状态机实测对照

**PG 侧（`hazardService.js:140-145`，4 态 canonical，无 CHECK 约束）**

| 值 | 中文标签 | 产生路径 |
|---|---|---|
| `discovered` | 发现 | `create()` 唯一入口（W1 服务端定死，`:756`） |
| `processing` | 整改中 | `rectify()`，源状态必须 `discovered`（`:957`）；`review(fail)` 也回到此态（`:1018`） |
| `pending_review` | 待复查 | `submitReview()`，源状态必须 `processing`（`:985`） |
| `closed` | 关闭 | `review(pass)`（`:1046` 源须 `pending_review`）**或** `close()`（`:1119` 源须 `pending_review`） |

**Feishu 侧（`index.js:2954,2962,2963`，3 态，单选 5 选项）**

| 值 | 产生路径 | 存量归一（`:3055-3064`） |
|---|---|---|
| `待整改` | `submit()`（`:3321`）、`assign()`（`:3704`）、`review(reject)`（`:3921`） | 空串 / `整改中` / `已整改` **一律归一为「待整改」** |
| `待验收` | `rectify()`（`:3835`） | 精确匹配 |
| `已闭环` | `review(pass)`（`:3907`）、**`submit()` 带整改后照片（`:3321,3327-3332`）** | 精确匹配 |

### 4.2 状态映射表（唯一允许的映射，逐项带边界条件）

| # | 源值 | 目标 `hazards.status` | 判定 | 边界条件 / 禁止事项 |
|---:|---|---|---|---|
| M1 | `待整改` | `discovered` | ✅ 允许 | 仅当 PG 当前态 ∈ {NULL, `discovered`, `processing`}；**禁止**把 `processing` 回退为 `discovered`（见 M9） |
| M2 | `待验收` | `pending_review` | ✅ 允许 | 仅当 PG 当前态 ∈ {`discovered`, `processing`, `pending_review`} |
| M3 | `已闭环` | `closed` | ⚠️ **有条件** | 只在业务明确「源状态即事实」后允许；且**不得**据此生成 `hse_reviews`（§4.3） |
| M4 | 空串 / `null` | 不写 | ⚠️ 保留现状 | Worker 视为「待整改」；同步层**不得**自行补成 `discovered`（会与 Worker 语义漂移） |
| M5 | `整改中` | **不映射** | ❌ 禁止 | Worker 已归一为「待整改」；若映射为 `processing` 会造成「PG 有 `processing`、Feishu 显示待整改」的永久不一致 |
| M6 | `已整改` | **不映射（严禁 `closed`）** | ❌ **硬禁止** | 任务硬约束 1。注：`hazardService.NON_LIFECYCLE_STATUS`（`:167`）把 `已整改→closed` 仅用于**读取展示**，不得被同步层当作写入依据 |
| M7 | 任意其他值 | **隔离，不写** | ❌ 硬禁止静默转换 | 任务硬约束 4；进入 `unknown_status` 计数 + 异常表 |
| M8 | 源记录消失/无权限 | **不写、不删** | ❌ 硬禁止 | 只见 `miss_count++`，达阈值置 `conflict` |
| M9 | — | `processing` **无源对应值** | — | **同步层永不产生 `processing`**；该态只能由 Web `rectify()` 产生 |

### 4.3 「已闭环」是否等于「有验收证据」——答案是**否**

| 路径 | 是否写 `hse_reviews` | 证据 | 结论 |
|---|---|---|---|
| `review(pass)` | ✅ 同事务 INSERT | `hazardService.js:1058-1077` | 有独立验收证据（`reviewer_id` 取自 `users.employee_id`，`:1026-1028`） |
| `close()` | ❌ **不写** | `hazardService.js:1114-1137`（只有 `UPDATE hazards`） | **零验收证据**，`review_result` 与 `reviewer_id` 均为 NULL |
| Feishu `submit()` 带整改后照片 | 不适用（Worker 侧无 `hse_reviews`） | `index.js:3321,3327-3332` | 提交人自证；`验收结论='登记时已现场整改，直接闭环'` |
| Feishu `review(pass)` | 不适用 | `index.js:3905-3918` | 验收人只有**姓名**（`payload.name`），无 ID/手机号 |

⇒ **同步层严禁根据 `已闭环` 生成 `hse_reviews` 行。** 若业务需要「Feishu 的验收动作在 PG 落证据」，必须由业务先定义「Feishu 验收人姓名 → employee 的匹配规则」，而**姓名匹配正是红线 4 禁止的兜底方式**。这是 DEC 级矛盾，不是技术能解。

### 4.4 复查证据为何「至多 1 行」

Feishu 的 `验收人`（`HAZARD_FIELDS.reviewer`）、`验收时间`、`验收结论`、`闭环时间` 都是**主记录上的单槽字段**，`review(reject)` 直接用新值覆盖（`index.js:3920-3927`），只有 `打回次数` 累加。⇒ 源侧**只保留最后一次验收快照**，多轮打回的历史**不可再生**。

**因此**：
- 若同步生成 `hse_reviews`，**每隐患至多 1 行**（`hazard_sync_map.pg_review_id` 单列即可）。
- **严禁**用 `打回次数 = N` 反推 N-1 条「打回」记录 —— 那是**伪造复查证据**（红线 11）。`打回次数` 只能作为 `hazards` 上的一个计数事实（当前无列，见 §6）。
- 多轮历史若要保留，必须由 **PG 自己**产生（Web 端 `review()`），不能靠同步补。

### 4.5 并发风险实测

| 风险 | 位置 | 说明 |
|---|---|---|
| Worker 侧「读-判-写」非原子 | `index.js:3665-3676`（assign 守卫）→ `:3712`（updateRecord）；`rectify` 同构 | Feishu 无 CAS/ETag/版本号；两个并发请求可同时通过守卫 ⇒ **丢失更新**。`assign` 的「改派清场」（`:3707-3711`）尤其危险，会清掉他人刚提交的整改照片 |
| PG 侧状态机是原子的 | `hazardService.js:957,985,1046,1119` 均为 `WHERE status = <前置态>` | 条件更新 ⇒ 并发安全 ✅ |
| 同步层 vs Web 端 | — | 若同步层**无条件** `UPDATE hazards SET status=...`，可覆盖 Web 端正在进行的整改/验收。**必须在 `WHERE` 中带前置态**，或干脆不写状态（§4.6 推荐） |

### 4.6 字段级写入白名单（同步层）

由 B03-01-C 矩阵中 `target_table = hazards` 的 10 个目标列推导，**再剔除 2 个**：

| 列 | 允许 | 理由 |
|---|---|---|
| `description` | ✅ | 源 `隐患描述` 必填 |
| `location` | ✅ | 源 `隐患位置`；契约要求非空（§7 DEC-17） |
| `hazard_date` | ✅ | 源 `排查时间`（`YYYY-MM-DD HH:MM` 需归一为 date，原串另存审计） |
| `hazard_type` | ✅ | 源 `隐患类别`（用户点选，11 值闭集） |
| `hazard_level` | ✅ | 源 `隐患级别` |
| `risk_level` | ✅ | 源 `风险等级` |
| `checker` | ✅ | 源 `排查人姓名` 快照（文本，非身份） |
| `checker_id` | ⚠️ 条件 | 源 `排查人ID`（**明文手机号**）→ HMAC → `employee.phone_hash` 唯一命中才写；未命中写 NULL（禁令见 §8.3） |
| `status` | ❌ **一期不写** | 见下 |
| `remark` | ❌ **不写** | 源 `备注` 实测值恒为 `req:<cid>`（`index.js:3321`），是**内部去重 token**；写入即把内部实现细节当业务备注入库，且 Web `update()` 可改（`:828`），双向污染 |

**一期推荐：只写 8 列（上表 7 个 ✅ + `checker_id` 条件写）。**

**`status` 一期不写的四条理由：**
1. W2 保护（`:847-849`）的业务含义是「状态只能经业务动作变更」；同步层不是业务动作。
2. 状态 3↔4 不对称（M9）无解，写哪个都会制造不一致。
3. `已闭环` 语义污染（§4.3），写 `closed` 会让「零证据闭环」扩散到 PG。
4. 代价可控：Feishu 侧状态推进**不会**自动反映到 PG 页面 ⇒ 页面显示滞后。**该滞后是否可接受，属业务决策（B-03）。**

**禁止覆盖列清单（绝对不可写）**：
`id`、`no`、`is_deleted`、`created_at`、`updated_at`、`township`（DEC-03 未裁）、`responsible_dept_id`、`grid_id`、`finder_id`、`responsible_id`、`corrector_id`、`fixer_id`、`reviewer_id`、`review_result`、`review_date`、`rectify_date`、`rectification`、`deadline_date`、`actual_rectify_date`、`hazard_source`、`hazard_category`、`related_risk_id`、`related_risk_ids`、`category`、`level`、`post_name`、`area`、`is_demo`、`deadline_days`。

> 其中 `level` / `category` / `hazard_category` / `post_name` / `area` / `hazard_source` 是**默认值或死列**（§1.3、B03-01-C R6/R7），写入即制造伪业务值。

### 4.7 P2 结论

| 项 | 结论 |
|---|---|
| 状态可映射性 | 3 个源值中 **1 个可直接映射（待整改）**、1 个条件映射（待验收）、1 个有条件映射（已闭环）；2 个存量值禁止映射 |
| 状态安全 | **不可靠同步保障** ⇒ 推荐一期不写 `status` |
| 验收证据 | `已闭环` ≠ 有证据；`close()` 路径证实 PG 自身也能产生零证据闭环 ⇒ **两条链路都需业务裁决** |
| 幻觉风险点 | 若同步生成 `hse_reviews`，唯一合规来源是 `review(pass)` 且验收人可解析到 `employee.id`（姓名不可兜底） ⇒ 当前**不满足** |

---

## 5. P3｜DEC-04 与 DEC-05 准入审查

### 5.1 两项决策的当前状态（复核，不采信任务书假设）

| 编号 | 题面 | 正式状态 | 证据 |
|---|---|---|---|
| `B02-DEC-04` | 隐患权威模型选型（A 单表 / B 三栈 / C 分层） | **待决定** | `B02-DEC-业务裁决包.md:313-386`；全文 17 处 `【待业务裁决】` 无一处填写 |
| `B02-DEC-05` | PG `hazards`(110) 与 Feishu 隐患 的权威归属 | **待决定** | `B02-DEC-业务裁决包.md:387-460` |

> 编号复核：任务书所说的「DEC-04 = 隐患事实/整改事实/复查验收事实的权威模型」「DEC-05 = Feishu 与 PG 权威关系」与正式文档编号**一致**（本轮无编号偏移，与 B02-DEC 任务书的情形不同）。

### 5.2 DEC-05 为何是「元前提」

DEC-05 决定的是方向本身：

| 若 DEC-05 选 | 含义 | 对 B03-01-D 的影响 |
|---|---|---|
| A｜Feishu 为隐患事实源，PG 为分析/展示落点 | 同步单向 Feishu→PG | 本文 §3/§4/§6 全部成立 |
| B｜PG 为事实源，Feishu 仅移动端采集缓存 | 不需要 Feishu→PG 同步（Feishu→PG 只是「导入一次」） | **本文 §3 的映射表设计整体作废** |
| C｜双源并存，按字段分权 | 需逐字段定义主源 | 需重写 C 的 38 字段矩阵的「权威」列 |

⇒ **在 DEC-05 未裁前，任何同步层实现都是「为一个未成立的方向写代码」。**

### 5.3 决策未完成时：允许做 / 必须阻止

| 允许继续 | 必须阻止 |
|---|---|
| 只读探针（列字段、读 sample、验证 token scope） | 任何写 PG 的代码 |
| 映射表结构设计与评审（本文件） | 建表 DDL |
| 字段级契约（C 已完成） | 状态写入 |
| 幂等算法设计（本文件 §3） | 生成 `hse_reviews` / `hse_rectifications` 行 |
| 只读凭证申请与最小权限界定 | 生产环境部署、定时任务 |
| 影子模式差异报告（不写业务表，§11.3） | 反向写 Feishu |

### 5.4 特别检查：`formatRow` 只读 `hazards`，分表后页面会不会缺失？

**会，而且必然缺失。** 逐条证据：

| 环节 | 代码 | 事实 |
|---|---|---|
| 服务层 | `hazardService.js:325-360` | `formatRow()` 输出的 `reviewerId`、`reviewResult`、`reviewDate`、`rectification`、`rectifyDate` **全部来自同一行的 `hazards.*` 列**，**无任何 JOIN** |
| 列表/详情 | `hazardService.js:419,476` → `formatRow` | 同上 |
| 前端详情 | `views/hazards/index.vue:1271` `{{ empName(currentHazard.reviewerId) }}`、`:1283` `currentHazard.rectification`、`:1289-1290` `currentHazard.reviewResult` | 只认 `hazards` 行上的字段 |
| 复查写入 | `hazardService.js:1038-1077` | 既写 `hazards`（`reviewer_id/review_result/review_date/rectification`）**也**写 `hse_reviews` ⇒ 当前是**双写冗余**，`hazards` 是展示源、`hse_reviews` 是证据源 |

⇒ 若 DEC-04 选「B 三栈分离（`hazards` / `hse_rectifications` / `hse_reviews` 各为权威）」，且同步层**只写** `hse_reviews`/`hse_rectifications` 而不回写 `hazards`，则：
- 页面复查区**永久空白**；
- `stats()` 的统计（`hazardService.js:559-562` 按 `hazards.status` 计数）与证据表脱钩；
- 且 `update()` 的 W2/N-01 保护（`:842-849`）**明确禁止**经普通更新路径写 `reviewer_id/review_date/review_result` ⇒ 想「反规范化回写」必须新增专用写路径，那是新代码 + 新风险。

**本文件不决定用「前端改造」还是「反规范化写入」解决。** 两条路都不在本轮授权内，且都需业务先裁 DEC-04。登记为 **T-06** 与 **B-02**。

---

## 6. P4｜未映射字段与数据完整性（含对 B03-01-C 的三处修正）

### 6.1 先修正 C 的三处事实错误（不静默覆盖，记录差异）

| # | C 的原表述 | 本轮实测 | 影响 |
|---|---|---|---|
| **X1** | 现场照片/整改后照片「**无附件列**」⇒ `UNMAPPED`（C §15 #14/#27） | **`hazard_attachments` 表已存在**：13 列、`hazard_id BIGINT NOT NULL`、`file_url VARCHAR(512) NOT NULL`、仅 PK、**0 FK**、**0 行**；由 `hazardsService.js:47-63` 的 `ensureTables()` 建 | 两项从 `UNMAPPED` 升为 `PARTIAL(SCHEMA_EXISTS)`：表在，但**缺 3 个承载槽**（token 列 / 方向列 / 幂等键） |
| **X2** | `employee.phone_hash`「**无唯一约束** ⇒ 未来可能 ambiguous」（C R11） | **存在部分唯一索引** `uk_employee_phone_hash ON employee(phone_hash) WHERE phone_hash IS NOT NULL AND is_deleted=false` | 身份桥**有唯一性保证**（在活跃员工范围内）；R11 风险解除，但「未覆盖者只能 NULL」仍成立 |
| **X3** | 未记录三个「CONFIRMED 映射列」的历史填充率 | `hazard_level` **0/110**、`hazard_type` **0/110**、`risk_level` **0/110** | 三个「已确认」映射的目标列在历史数据中**全空**；同步写入将是**首次填充** ⇒ `routes/overview.js:163-164` 的 `byLevel` 统计将从「恒空」突变为「有值」，属**统计口径突变**，需提前告知业务 |

> X1/X2 是对既有结论的**事实层修正**，不改变 C 的映射方向；X3 是**新增风险**而非修正。

### 6.2 重算后的映射统计（以 38 字段为准）

| 状态 | C 原值 | **本轮** | 变化 |
|---|---:|---:|---|
| `CONFIRMED` | 5 | **5** | — |
| `CONDITIONAL` | 11 | **11** | — |
| `PARTIAL` | 4 | **6** | **+2**（现场照片、整改后照片，由 UNMAPPED 升级） |
| `UNMAPPED` | 15 | **13** | **−2** |
| `NOT_APPLICABLE` | 3 | **3** | — |
| 合计 | 38 | **38** | ✅ |

**信息落地能力重算**：

| 口径 | 数量 | 占比 | 说明 |
|---|---:|---:|---|
| 可无损落地 | 5（CONFIRMED） | 13.2% | 不依赖任何裁决 |
| 条件无损落地 | 11（CONDITIONAL） | 28.9% | 全部依赖 DEC-04 / DEC-16（C §13） |
| **可落但有损** | 6（PARTIAL） | 15.8% | 语义/精度/唯一性有损 |
| **完全无落点** | **13（UNMAPPED）** | **34.2%** | 不做 DDL 或业务降级即为**静默丢弃** |

### 6.3 13 项未映射字段逐条审查

| # | 源字段 | 来源类型 | 现有目标字段 | 缺失原因 | 建议承载方式（不实施） | 性质 |
|---:|---|---|---|---|---|---|
| 2 | 隐患编号 | 源生成（`newHazardNo()`，UTC + 4 随机） | 无 | `hazards` 无 code 类列 | `display_no varchar(32)`，**仅展示、非键、不解析时间** | **可重算**（展示号；也可由 `id` 派生） |
| 6 | 排查人职位 | 源写入 `payload.position` | `hazards.post_name`（死列） | 复用死列需裁决 | **不落**；以 `employee.roster_position` 为准 | **可重算**（人员主数据派生） |
| 12 | 纬度 | 设备 GPS 字符串 | 无 | `hazards` 无列 | `geo_lat numeric(10,7)` | **原始证据**（不可重算） |
| 13 | 经度 | 设备 GPS 字符串 | 无 | 同上 | `geo_lng numeric(10,7)` | **原始证据** |
| 21 | 指派人ID | `assign()` 写入（`payload.sub` = 手机号） | 无（`created_by` 语义不同） | 指派人是独立业务概念 | `assigner_id bigint`（经身份桥） | **业务证据**（责任链） |
| 22 | 指派人姓名 | `assign()` 写 `payload.name` | 无 | 同上 | `assigner_name varchar(128)` 快照 | **业务证据** |
| 23 | 指派时间 | `assign()` 写 `todoNowLocal()` | 无（`started_at` 是「开始整改」） | 语义不同 | `assigned_at timestamptz` | **业务证据**（时限考核依据） |
| 32 | 打回次数 | `review(reject)` 读旧值 +1（上限 99） | 无 | 无列 | `reject_count int`；**禁反推为多条 review 行** | **业务证据**（质量指标） |
| 33 | 整改依据 | `ai-fill` 回填（≤1000） | 无 | 无列 | `ai_basis text` | **派生**（可由 #38 重算，前提是 #38 保留） |
| 34 | 整改建议 | `ai-fill` 回填（≤1000） | 无 | 无列 | `ai_suggestion text` | **派生**（同上） |
| 35 | 三违判定 | `ai-fill` 回填（是/否） | 无 | 无列 | `is_three_violation boolean`；**严禁并入 `violation_records`** | **业务判定**（跨域，需 DEC） |
| 36 | 重大事故隐患判定 | `ai-fill` 回填（是/否） | 无 | 无列 | `is_major_hazard boolean`；**严禁并入 `hazard_level`** | **业务判定**（法定属性） |
| 38 | AI识别原始输出 | `ai-fill` 返回原始 JSON（≤4000） | 无 | 无列 | `ai_raw jsonb`（首选）或 `text` | **原始证据**（DEC-16 唯一仲裁依据） |

### 6.4 六条硬约束的遵守声明

| 约束 | 遵守 | 做法 |
|---|---|---|
| 不得把 AI 原始输出与人工确认类别混为一项 | ✅ | #8 `隐患类别`（用户点选，11 值闭集）与 #38 `AI识别原始输出`（原始 JSON）**分列记录、互不覆盖**；冲突 1/2 已登记为 DEC-16 |
| 不得静默丢弃照片 | ✅ | 两项升为 `PARTIAL(SCHEMA_EXISTS)`，并列出 3 个缺失槽；**未**建议丢弃 |
| 不得静默丢弃 AI 原始输出 | ✅ | #38 列为「原始证据」并要求保留；#33/#34 标注「可由 #38 重算」而非「可丢」 |
| 不得静默丢弃人员责任信息 | ✅ | #21/#22/#23 列为「业务证据」，缺失原因写明「无列」 |
| 业务证据 vs 派生信息要分清 | ✅ | §6.3「性质」列：原始证据 5 项 / 业务证据 4 项 / 业务判定 2 项 / 可重算 2 项 |
| 需业务批准丢弃或降级须列为正式决策项 | ✅ | §9 **B-04**（13 项处置批复） |

### 6.5 关键提示：`备注` 是污染列，不是业务字段

源 `备注` 实测值 = `req:<client_request_id>`（`index.js:3321`）。写进 `hazards.remark` 会：
1. 把内部幂等 token 当业务备注长期留存；
2. 与 Web 端 `update()`（`hazardService.js:828`，`remark` 在可写白名单内）形成**双向可改**，token 一旦被人工修改，源侧幂等判断与本列就无关联。

⇒ 保持 C 的 `PARTIAL`，但**一期建议不写**（§4.6 已将其剔出白名单）。是否「等同丢弃」需 **B-04** 一并批复。

### 6.6 若不做 DDL 的后果量化

- 13 项无落点 = **34.2% 字段**；
- 其中 **7 项是原始证据/业务证据**（#12 #13 #21 #22 #23 #32 #38），**丢了不可再生**；
- 4 项（#22 姓名已在 #21 手机号存在时部分冗余、#33 #34 可由 #38 重算、#2 可由 id 派生）**降级可接受**；
- 2 项（#35 #36）是**跨域/法定属性**，丢弃会影响三违域与重大隐患统计。

---

## 7. P5｜DEC-03 / 09 / 16 / 17 / 18 状态复核

### 7.1 五项决策状态总表

| 编号 | 题面 | 状态 | 证据 | 是否阻塞同步实现 |
|---|---|---|---|---|
| `B02-DEC-03` | 区域主数据（区域 ≠ 组织；`township_norm` 存乡镇名还是组织名） | **待决定** | `B02-DEC:229-312`；C §8.5 | **否**（可降级：`township_norm` 恒 NULL） |
| `B02-DEC-09` | 考核分数列 `suggested_score` vs `confirmed_score` | **待决定** | `B02-DEC:654-758` | **否**（C §13 已证 `deduction` 15 类 `source_table` **不含** hazards） |
| `B02-DEC-16` | 用户选择的隐患类别 vs AI 原始分类，谁是权威 | **待决定**（本轮新增登记） | C §14.1；生产 1/2 冲突 | **是**（若选「AI 为准」，`hazard_type` 写入逻辑需改） |
| `B02-DEC-17` | 隐患位置无法归一时如何处理 | **待决定**（本轮新增登记） | C §14.2 | **部分**（可落库，但乡镇统计长期缺失） |
| `B02-DEC-18` | 组织层级 + 「市政园林/市政绿化」命名对齐 | **待决定**（本轮新增登记） | C §14.3；§1.4 实测 | **否**（但影响组织聚合正确性） |

### 7.2 七条临时约束的有效性核验

| # | 约束 | 是否仍有效 | 本轮核验 |
|---:|---|---|---|
| 1 | 位置原文 `location_raw` 必须保留 | ✅ **有效且必须强化** | `hazards.location` 可空（`is_nullable=YES`），且历史仅 2/110 ⇒ 「非空」只能靠同步层**契约强制**，DB 不兜底 |
| 2 | 无法匹配的 `township_norm` 置空并计异常，不得猜测 | ✅ **有效，且是唯一安全解** | `hazards.township` 0/110；且 `stats()` **完全不按 township 分组**（`hazardService.js:559-562,598-602`）⇒ 置空**当前零业务损失** |
| 3 | 不得使用姓名作为唯一人员匹配依据 | ✅ **有效，理由更强** | 新增依据：`uk_employee_phone_hash` 提供**唯一性保证**（X2 修正），姓名无此保证；且 `reviewer_name` 只有姓名（§4.3） |
| 4 | `phone_hash` 覆盖率有限，匹配失败不得姓名兜底 | ✅ **有效** | 实测活跃员工 **1312/3401 = 38.6%** 有 `phone_hash` ⇒ 61.4% 人员无法桥接，只能 NULL |
| 5 | 不得自动合并 PG 历史 110 条与 Feishu 当前记录 | ✅ **有效，且技术上不可行** | 110 行 `township/hazard_level/hazard_type/risk_level/responsible_dept_id/grid_id/checker_id/fixer_id` **全 0 填充**，`location` 仅 2/110 ⇒ 除 `description` 文本外**无连接点** |
| 6 | `环卫作业中心`/`市政绿化作业中心` 存在于 L2，「缺失组织」不是问题，重点是层级+名称 | ✅ **有效，并新增一条事实** | §1.4：两中心 L2（id=7 / id=20）；**`市政绿化作业中心` 的 L3 子节点 = 0**（12 个 L3 全挂 id=7）⇒ 「层级」之外还有「子树缺失」 |
| 7 | （本轮新增）`安环管理部` 自身名称一致性 | ⚠️ **新发现问题** | `hse_org_unit` id=5：`org_name='安环管理部'` 但 `org_path='/宁津项目公司/安环品质部'` ⇒ **同一行内不一致**；而 Worker `hazardGate`（`index.js:3108`）硬校验 `department === '安环管理部'`，任何按 `org_path` 解析的实现都会 403 |

### 7.3 各项的「未裁决时允许/禁止」边界

| 决策 | 未裁决时允许 | 未裁决时必须阻止 |
|---|---|---|
| DEC-03 | `location_raw` 原样入库；`township_norm` 恒 NULL + 异常计数 | 任何猜测性归一、任何模糊匹配、任何「回填上级区域」 |
| DEC-09 | 完全不涉及 | 若未来把隐患接入考核，须先裁 |
| DEC-16 | 两值分别原样保留（`hazard_type` 取用户选择；`ai_raw` 待落） | 用 AI 结果覆盖用户选择；用用户选择覆盖 AI 原始输出 |
| DEC-17 | 词表内 16 项可确定性归一（C §8.3）；词表外不归一并计数 | 把 GPS 整段地址当地点；拒绝整条记录 |
| DEC-18 | 作业中心文本**不转外键**；涉及两中心的聚合降级为「未归类」 | 修改组织数据；虚构 `org_unit_id` |

---

## 8. P6｜同步运行与故障恢复设计（只设计，不开发）

### 8.1 读取模式

| 环节 | 设计 | 现状依据 / 待验证 |
|---|---|---|
| 首次全量 | `scanRecords` 全表翻页：`page_size=500` + `page_token` 链式串行（`feishuAdapter.js:52-83`） | ✅ 现有能力；隐患表当前仅 2 行，1 页即可 |
| 后续增量 | **当前适配器无 filter/sort/增量能力** ⇒ 只能「全量拉取 + `source_hash` 比对」 | 若要走「按最后修改时间增量」，需验证 Feishu `search` 接口是否支持 `filter`（**待验证项 V-01**） |
| 分页 | `has_more` / `page_token` 判定，`maxPages` 上限保护 | ✅ 现有实现 |
| 限流 | 429 ⇒ `e.isRateLimit`（`feishuAdapter.js:167,199`）；建议指数退避（1s/2s/4s/8s，上限 4 次）+ 单批 ≤ 200 条 | ⚠️ 现有适配器**只抛不重试** |
| 超时 | 单请求 10s、单批 60s、单次运行 10min 硬上限 | 新增设计 |
| 断点续跑 | **不依赖 `page_token` 持久化**（其 TTL 与语义未验证，V-02）；改为「已同步 record_id 集合 + hash 表」驱动，重复拉取天然幂等 | 新增设计 |
| 单条失败 | 写入 `hazard_sync_map.conflict` + 异常明细；**不中断整批**；批次结束输出 `failed[]`（对齐 `wpsGridPullEngine` 的 stats 结构） | 借鉴 |
| 整批失败 | 单事务边界只包「一条记录的全部目标写入」，不做「整批一个事务」（避免一条脏数据回滚全部） | 借鉴 `insertWithMap` |

### 8.2 批次统计指标（必须落盘可查）

```
batch_id, started_at, finished_at
total_read, created, updated, unchanged, skipped_noop
failed, unknown_status, unmatched_region, unmatched_person, conflict
pg_deleted(恒 0), feishu_writes(恒 0)
```

其中三个**恒为 0 的护栏**（违反即 fail-closed）：
- `pg_deleted` 必须 0（对齐 `wpsGridPullEngine.js:232-238` 的 `assertNoPgDelete`）
- `feishu_writes` 必须 0（同步层只读，不得反向写）
- `protected_column_writes` 必须 0（对齐 `assertNoProtectedColumns`）

### 8.3 敏感字段与日志

| 字段 | 处理 |
|---|---|
| `排查人ID` / `指派人ID` / `整改人ID`（**均为明文手机号**，`index.js:940,3313,3691`） | **只允许**在内存中计算 HMAC 后立即丢弃；日志只记 `phone_hash[0:8]` + 长度；**禁止**打印原值 |
| `phone_hash` | 不落日志；如需排查只记前 8 位 |
| `AI识别原始输出`（≤4000 JSON） | 不落日志；异常时记长度 + JSON 解析状态 |
| 附件 `file_token` | 不含 PII，但不得拼成可访问 URL 打印 |
| `隐患描述` / `隐患位置` | 可含人名/地点，日志截断 40 字 |

### 8.4 追溯与回滚

| 能力 | 设计 |
|---|---|
| 溯源（源→PG） | `hazard_sync_map (app_token, table_id, record_id) → pg_hazard_id / pg_rectification_id / pg_review_id` |
| 反向溯源（PG→源） | `UNIQUE(pg_hazard_id)` 保证 1:1，可反查 |
| 单行回滚 | 按 `hazard_sync_map` 定位后**软删业务行**（`is_deleted=true`）+ 保留映射行并标 `conflict=true`；**禁止硬 DELETE** |
| 批次回滚 | 需要 `batch_id` 列（建议加在映射表）；当前设计**未含** ⇒ 若要求批次级回滚，需扩表（T-08） |
| 暂停开关 | 建议环境变量 `FEISHU_HAZARD_SYNC_ENABLED=false`（默认 **false**），与 `SCHEDULER_ENABLED` / `WPS_GRID_SYNC` 同构 |
| 人工复核 | `conflict=true` 的记录进独立报表，需人工决策后才解锁 |

### 8.5 环境隔离（红线相关）

| 环境 | Feishu base | `table_id`（隐患） | PG |
|---|---|---|---|
| 生产 | `WX9TbTqJKa7sywsgrU4cVoKdnXb`（`wrangler.toml:110,116`） | `tblnyMjxtxjpP08q` | `safety_dashboard`（**禁碰**） |
| dev | `.dev.vars` 中的 base（**表同名，ID 全不同**，隐患为 `tblxTdsCT9v3YY03`，C-0 §3.3） | 同上 | `safety_dashboard_dev`（**唯一允许**） |

强制要求：
1. 同步层启动时断言 `current_database() = 'safety_dashboard_dev'`（不符 `exit(2)`）；
2. 断言 `source_app_token != 'WX9TbTqJKa7sywsgrU4cVoKdnXb'`（除非显式只读探针模式）；
3. 三元组映射表**天然隔离**双 base（这正是方案 A 选三元组的原因）。

### 8.6 待验证的 API 行为（不得编造）

| 编号 | 待验证项 | 为什么重要 |
|---|---|---|
| `V-01` | Feishu 记录列表/search 是否支持 `filter`（如 `last_modified_time`）与 `sort` | 决定能否做真增量，而非全量比对 |
| `V-02` | `page_token` 的有效期与跨请求复用语义 | 决定断点续跑方案 |
| `V-03` | 附件 `file_token` 的有效期 | 决定照片能否只存 token；若会过期则必须下载转存 |
| `V-04` | 删除记录后 `record_id` 是否可被复用 | 决定 `miss_count` 阈值与「删除」判定 |
| `V-05` | 单表最大记录数与分页深度上限 | 决定全量拉取可行性 |
| `V-06` | 只读应用凭证能否读取附件列（scope 差异） | 决定照片链路是否可行 |

---

## 9. 业务决策清单（技术不得代裁）

> 全部标 `【待业务裁决】`。每项含：题面 / 当前证据 / 选项与影响 / 需要谁答。
> **审计建议 ≠ 业务决策。**

### B-01｜DEC-05：Feishu 与 PG 的隐患权威关系【待业务裁决】

- **证据**：`B02-DEC:387-460` 未裁；生产 Feishu 2 条 / PG 110 条，两侧零连接点（§7.2 #5）。
- **选项**：A Feishu 为事实源、PG 为分析落点｜B PG 为事实源、Feishu 仅采集缓存｜C 双源按字段分权。
- **影响**：A ⇒ 本文设计成立；B ⇒ §3 映射表整体作废；C ⇒ 需重写 38 字段的权威列。
- **需谁答**：业务负责人（安环管理部）+ 信息化归口。

### B-02｜DEC-04：隐患/整改/复查三事实的权威模型【待业务裁决】

- **证据**：`B02-DEC:313-386` 未裁；`formatRow` 只读 `hazards`（§5.4）。
- **选项**：A `hazards` 单表｜B 三栈分离（`hazards` + `hse_rectifications` + `hse_reviews`）｜C 分层（事实表 + 视图）。
- **影响**：选 B 必须同时决定「是否反规范化回写 `hazards`」或「是否改造前端」；两者都不在本轮授权内。
- **需谁答**：业务负责人 + 前端负责人。

### B-03｜状态同步边界：一期是否允许同步写 `hazards.status`【待业务裁决】

- **证据**：§4.2 M5/M6/M9（3↔4 不对称）；Worker 把 `整改中/已整改` 归一为 `待整改`（`index.js:3055-3064`）。
- **选项**：① 一期不写状态（页面显示滞后，但零风险）｜② 只写 `待整改→discovered`、`待验收→pending_review`（不写 `已闭环`）｜③ 全量 3→3 映射。
- **影响**：②③ 会让 PG `processing` 与 Feishu `待整改` 永久不一致；① 会让 Feishu 侧推进不同步。
- **需谁答**：业务负责人。

### B-04｜13 项未映射字段的处置批复【待业务裁决】

- **证据**：§6.3；其中 7 项为不可再生证据（#12 #13 #21 #22 #23 #32 #38）。
- **选项**：① 批准增列（13 列）｜② 批准「降级存 JSONB raw」（1 列 `source_raw jsonb` 承载 13 项）｜③ 批准丢弃并留清单。
- **影响**：③ 意味着 Feishu 38 字段中 34.2% 永久丢失，且 DEC-16 失去唯一仲裁依据（#38）。
- **需谁答**：业务负责人 + 数据责任人。

### B-05｜「已闭环」是否可生成 PG 复查证据【待业务裁决】

- **证据**：§4.3（`close()` 零证据；`submit()` 登记即闭环自证）；`hse_reviews.reviewer_id → employee.id`。
- **选项**：① 一律不生成（PG 只信 Web 端 `review(pass)`）｜② 仅在「验收人姓名能唯一解析到 employee」时生成（**受红线 4 限制，实际不可行**）｜③ 生成但标 `result='unverified'`。
- **影响**：②违反红线 4；③ 会让 `hse_reviews` 出现非验收结论的行。
- **需谁答**：业务负责人。

### B-06｜`processing` 态在 Feishu 侧无对应值，如何处置【待业务裁决】

- **证据**：§4.2 M9；`rectify()` 是唯一入口（`hazardService.js:957`）。
- **选项**：① 承认 `processing` 为 PG-only 态，同步永不动它｜② 在 Feishu 新增「整改中」选项（**修改生产表结构，本轮禁**）。
- **影响**：① 简单安全；② 触碰生产 Feishu 配置。
- **需谁答**：业务负责人 + H5 产品负责人。

### B-07｜DEC-03：`township_norm` 语义（乡镇名 vs 组织名）【待业务裁决】

- **证据**：C §8.5；`hazards.township` 0/110；`hse_assessment_target.township` 装组织名。
- **影响**：选 A（乡镇名）无法 join 考核；选 B（组织名）污染字段语义。
- **需谁答**：业务负责人 + 考核归口。

### B-08｜DEC-16/17/18 合并裁决【待业务裁决】

- **证据**：C §14.1/14.2/14.3 + §7.2 #7（新发现 `安环管理部` 内部名称不一致）。
- **需谁答**：业务负责人 + 组织主数据责任人 + H5 产品负责人。

---

## 10. 技术问题清单（开发可自行提方案）

| 编号 | 问题 | 状态 | 处置 |
|---|---|---|---|
| `T-01` | `hazard_sync_map` 建表 DDL 需授权 | **待授权** | 只在 dev 执行；结构见 §3.2；含 3 索引 |
| `T-02` | `hse_rectifications.hazard_id` 无 FK | 已证实（§1.3） | 建议后续补 FK（非本轮） |
| `T-03` | `grid_record_sync_map` 无 FK（孤儿风险） | 已证实 | 新表**不照抄**，建议 `ON DELETE RESTRICT` |
| `T-04` | `hseEventSyncService.js:93-96` SELECT 不存在的 `dept` 列 | 已证实（42703 潜在） | 同步层直写 SQL 将不产生 `hse_events`；需决定「是否补事件」→ `T-05` |
| `T-05` | 同步创建的隐患是否要补 `hse_events` 行 | 待定 | 若补，需复用 `syncHazard`，但该函数有 `T-04` 缺陷 |
| `T-06` | 分表后页面展示缺失的解法（反规范化 vs 前端改造） | **依赖 B-02** | 本轮不给结论 |
| `T-07` | `hse_rectifications.measure` / `responsible_person_name` 等 NOT NULL 列的占位策略 | 待定 | `measure text NOT NULL` ⇒ 空整改说明无法建行；建议「无说明则不建整改行」而非塞 `''` |
| `T-08` | 映射表是否需要 `batch_id` 以支持批次回滚 | 待定 | 若业务要求批次级回滚则加列 |
| `T-09` | `hazard_attachments` 三缺口：无 token 列 / 无方向列 / 无幂等键 | 已证实（X1） | 照片落地的前置；属 B-04 范畴 |
| `T-10` | `file_url NOT NULL VARCHAR(512)` 与 Feishu `file_token` 语义不匹配 | 已证实 | 不能把 token 塞进 `file_url`（语义污染）；需新增 `file_token` 列 |
| `T-11` | `hazards.checker_id`/`fixer_id` 是 `integer`，`employee.id` 是 `bigint` | 已证实（C R15） | 当前值域安全，长期需 `ALTER TYPE` |
| `T-12` | 服务端零 Feishu 凭证（0 个 `FS_*`） | 已证实 | 需申请只读应用凭证；属 **T-13** 的安全前提 |
| `T-13` | 凭证最小权限界定（只读 bitable record） | 待定 | 禁带写 scope；禁复用 Worker 的生产 app |
| `T-14` | 全量+hash 比对的计算成本（38 字段投影） | 待定 | 建议冻结哈希口径（参照 `wpsFieldMap` 的 `FROZEN_HASH_SEGMENT` 护栏） |
| `T-15` | 同步层写 `hazards` 时如何避开 3 条既有 INSERT 路径的副作用 | 待定 | 建议单一写入口 + 受保护列硬断言 |
| `T-16` | 批次并发保护（进程内互斥 vs 分布式锁） | 待定 | 参照 `wpsGridPullEngine` 的进程内互斥；多实例时需 DB 锁 |

---

## 11. 准入结论

### 11.1 硬阻塞（必须全部清零才能进入实现）

| # | 阻塞项 | 类别 | 解除方式 | 责任方 |
|---|---|---|---|---|
| **H1** | `DEC-05` 未裁（元前提） | 业务 | 出具裁决 | 业务负责人 |
| **H2** | `DEC-04` 未裁（目标表不确定） | 业务 | 出具裁决 | 业务负责人 |
| **H3** | 状态映射规则未批准（3↔4 不对称 / `已整改` / `已闭环`） | 业务 | B-03 + B-05 + B-06 批复 | 业务负责人 |
| **H4** | 13 项未映射字段处置未批复 | 业务 | B-04 批复 | 业务负责人 + 数据责任人 |
| **H5** | 幂等载体不存在，建表 DDL 未授权 | 技术授权 | `T-01` 授权（仅 dev） | 技术负责人 |
| **H6** | 服务端零 Feishu 只读凭证 | 技术授权 | `T-12`/`T-13` 申请并绑定 dev base | 技术负责人 |
| **H7** | dev/生产双 base 同名表隔离未以代码固化 | 人类确认 | 断言 `current_database()` + `app_token != 生产` | 技术负责人 |

### 11.2 软阻塞（可降级绕过，不阻断准入）

| # | 项 | 降级方案 |
|---|---|---|
| S1 | `DEC-03` 未裁 | `township_norm` 恒 NULL + 异常计数（当前零业务损失，§7.2 #2） |
| S2 | `DEC-18` 未裁 | 作业中心文本不转外键；聚合降级「未归类」 |
| S3 | `phone_hash` 覆盖 38.6% | 未命中写 NULL + `unmatched_person` 计数 |
| S4 | `DEC-16` 未裁 | `hazard_type` 只取用户选择；`ai_raw` 暂不落（有损，B-04 一并批） |
| S5 | `DEC-17` 未裁 | 只保 `location_raw`，词表外不归一并计数 |

### 11.3 允许进入实现的最小条件集（建议）

若上述 H1–H7 全部解除，建议以**影子模式**分两步进入：

**第一步（D-1）：影子模式，零业务写入**
- 只建 `hazard_sync_map`（dev）+ 只读拉取 + 计算 diff
- **不写 `hazards`**，只产出「将创建 N 条 / 将更新 M 条 / 冲突 K 条」报告
- 判据：连续 2 次全量拉取 `source_hash` 全一致、业务表写入 0 行

**第二步（D-2）：受控写入**
- 只写 §4.6 的 8 列；`status` / `remark` / 全部子对象表仍不写
- 判据：幂等（重跑 0 变更）+ 回滚演练（`DROP TABLE` 后业务表无残留）

> **即使本文完成，也不构成实现授权。** 需用户逐项确认 H1–H7 后方可开始。

---

## 12. 本轮执行的数据库只读清单（可复现）

| 组 | 内容 | 输出 |
|---|---|---|
| G-01 | `current_database()` / `current_user` / `version()` | `safety_dashboard_dev` / `hse_app` / `PostgreSQL 17.10` |
| G-02 | `hazards` 46 列 / 3 约束 / 16 索引 / `COUNT(*)`=110 | §1.3 |
| G-03 | `hse_rectifications` 20 列 / 4 约束；`hse_reviews` 18 列 / 4 约束；`grid_record_sync_map` 12 列 / 3 约束 / 4 索引；四表行数 | §1.3 |
| G-04 | `hazards` 有无 `dept` 列（0）；`hse_events` 存在（26 列 / 16 行）；`township`/`status` 分布 | §1.3 |
| G-05 | `hse_events` 约束；含 `record_id/source_record_id` 语义列的表清单（9 张）；附件表清单（11 张） | §3.5 |
| G-06 | `hazard_attachments` 13 列 / 1 约束 / 0 行 | X1 |
| G-07 | `employee` 约束 + `phone_hash` 索引 | X2 |
| G-08 | 隐患域 6 表行数；`hazards` CHECK 约束数（0）；`location/township/review_*` 填充 | §1.3 |
| G-09 | `hse_org_unit` 全量 20 行（L1/L2/L3） | §1.4 |

临时目录 `G:/_tmp_b0301d/` 已在使用后清理，无残留。

---

## 13. 与既有文档的差异记录（不静默覆盖）

| # | 既有结论 | 出处 | 本轮实测 | 处理 |
|---|---|---|---|---|
| D1 | 现场/整改后照片「无附件列」 | B03-01-C §15 #14/#27；CSV `UNMAPPED` | `hazard_attachments` 表已存在（0 行，13 列，无 FK） | **修正**为 `PARTIAL(SCHEMA_EXISTS)`；C 原文不删，本文件 §6.1 X1 记录 |
| D2 | `employee.phone_hash` 无唯一约束 | B03-01-C §16 R11 | 存在部分唯一索引 `uk_employee_phone_hash` | **修正**；R11 风险解除 |
| D3 | 两中心「在 L2 而非 L3」 | B03-01-C §8.4 | 补充：`市政绿化作业中心`(id=20) **L3 子节点 = 0** | **补充**（不推翻） |
| D4 | `DEC-03/04/05/09` 未裁 | B03-01-C §13 | 复核一致 | 确认 |
| D5 | `hazards.township` 0/110 | B03-01-C §8.1 | 复核一致 | 确认 |
| D6 | `hazards.no` 66/110 唯一 | B02 / B03-01-C R6 | 复核一致；补 `(no,hazard_date)` 恰好 110 唯一 | 补充（强调是巧合，不可作契约） |
| D7 | 隐患域 11 表 | B02 摘要 | 复核一致（`hazard_record` 9 行、`hazard_versions` 0、`hazard_attachments` 0） | 确认 |
| D8 | `hazard_level`/`hazard_type`/`risk_level` 为「活写列」 | B03-01-C §11 | 是活写列，但历史 **0/110** 填充 | **补充风险**（统计口径突变） |

---

## 14. 证据索引

| 类别 | 路径 |
|---|---|
| PG 结构 | `information_schema.columns` / `pg_constraint` / `pg_indexes`（`safety_dashboard_dev`，9 组只读） |
| 状态机 | `server/services/hazardService.js:140-200,312-360,754-756,842-849,934-1137` |
| 路由与权限 | `server/routes/hazards/main.js:17-60` |
| 事件副作用 | `server/services/hseEventSyncService.js:83-120` |
| 幂等先例 | `server/services/wpsGridPullEngine.js:194-318`；`server/services/wps/wpsFieldMap.js:108-148` |
| Worker 状态与门禁 | `grid-mobile-cloudflare/worker/index.js:940,1077,2954-2963,3055-3064,3104-3120,3290-3345,3690-3712,3826-3855,3895-3945` |
| Feishu 适配器 | `grid-mobile-cloudflare/worker/storage/feishuAdapter.js:52-83,89-110,186-215` |
| 前端展示 | `安全看板vben/apps/web-naive/src/views/hazards/index.vue:1271,1283,1289-1290` |
| 配置 | `grid-mobile-cloudflare/worker/wrangler.toml:110,116` |
| 上游审计 | `docs/架构基线/B02-DEC-业务裁决包.md`、`B03-01-B-*.md`、`B03-01-C-0-*.md`、`B03-01-C-*.md`、`B03-01-C-字段映射矩阵.csv` |

---

## 15. 下一阶段建议（不自动进入）

| 项 | 内容 |
|---|---|
| 建议任务编号 | `B03-01-D-1` |
| 建议标题 | 隐患同步层影子模式（dev-only，零业务写入） |
| 前置 | §11.1 的 H1–H7 **全部**解除；未解除前不得开工 |
| 严格范围 | ① 仅 `safety_dashboard_dev`；② 仅建 `hazard_sync_map`；③ 仅只读拉取 + diff 报告；④ **不写 `hazards`**、不写子对象表、不写状态、不反向写 Feishu |
| 明确排除 | 生产配置变更、定时任务上线、前端改造、状态机改动、任何数据迁移 |
| 完成判据 | 连续 2 次全量拉取 `source_hash` 全一致；业务表写入 0 行；`pg_deleted=0`、`feishu_writes=0`、`protected_column_writes=0` |
| 交付物 | `docs/架构基线/B03-01-D-1-隐患同步影子模式验证报告.md` + 差异 CSV |

**本文件完成不等于获得实现授权。是否启动 D-1、以及 H1–H7 的解除方式，需用户明确指示。**
