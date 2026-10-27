# P2-F｜隐患状态字段与状态流转一致性只读审计报告

> 审计类型：**只读**（零代码改动、零 DDL、零 DML、零部署、零生产写入）
> 审计日期：2026-10-27
> 分支：`feat/hse-business-closure`
> 结论：**P2-F = PASS WITH GAPS**

---

## 0. 结论摘要（先看这一段）

**一句话结论**：`hazards.status` 本身是干净的（110 行只有 `closed`(60) / `discovered`(50)，无 NULL、无空串、无历史中文词汇），但**围绕这一个字段存在 9 套并行词表**，其中至少 **6 处已证实不一致**、**7 项业务语义未定**、**5 项证据不足**。状态机在服务端是"窄口径正确"，在配置/声明/前端/移动端是多口径漂移。

**9 套词表的逐条出处（供复核）**：

| # | 词表 | 值 | 出处 |
|---|---|---|---|
| V1 | DB canonical | `discovered` / `processing` / `pending_review` / `closed` | `hazards.status` 实存 2 值（§3.4） |
| V2 | 后端 legacy | `发现` / `整改中` / `待复查` / `关闭` / `未完成` / `已完成` | `hazardService.js:152-159` |
| V3 | 后端 non_lifecycle | `待处理` / `处理中` / `已关闭` / `已整改` / `已验收` | `hazardService.js:163-169` |
| V4 | 声明式状态机 | V1 + **`assigned`** + **`expired`** | `config/hseRules/hazard-rule.json` → `statusFlow` |
| V5 | 持久化配置 | V4 的 6 值（中文标签「待登记/待整改/整改中/待复查/已闭环/已超期」）+ `byStatus` 取数字段 | `hse_filter_config` / `hse_dashboard_card_config` 实存（§6.3） |
| V6 | 前端展示 | V1 + 5 个历史词（标签另立一套） | `components/hse/statusColors.ts:25-53` |
| V7 | Worker/Feishu | `待整改` / `待验收` / `已闭环` | `worker/index.js:2954-2963` |
| V8 | 事件映射 | `open` / `processing` / `resolved` / `closed` | `hseEventSyncService.js:49-61` |
| V9 | 并行栈 `hazard_record` | `pending` / `confirmed` / `processing` / `pending_review` / `closed`，实存 `open` | `hazardRectificationService.js:76,189,237,453` + DB 实存 |

> 9 套词表彼此**没有任何一处互为权威声明**——不存在"以 X 为准"的文档或代码注释。这正是本报告所有不一致的根因。

| 维度 | 判定 |
|---|---|
| 数据库字段定义 | `varchar(16)`、可空、默认 `'discovered'`、**零 CHECK / 零触发器 / 零 ENUM / 零 rule** |
| 数据库现存值 | 110 行：`closed` 60、`discovered` 50；NULL 0、空串 0、历史中文 0 |
| 后端规范化 | 有完整的 `canonical / legacy / non_lifecycle / unknown` 四分类，但**分类函数 `classifyStatus` 从未被调用**（死路径） |
| 后端写入面 | 只允许 4 个 canonical 值，W1（创建）与 W2（更新）两道封口真实生效 |
| 后端流转 | 仅实现 **4 条状态边 / 5 个写入动作**；`assigned`、`expired`、`reopen` **有声明、无实现** |
| 已闭环证据 | **60/60 条 `closed` 零验收证据**（`review_date`/`reviewer_id`/`review_result`/`rectification` 全 0，`hse_reviews` 表 0 行） |
| 前端 | 主页面与后端 4 态严格对齐；但「关闭」按钮越权显示，`closed` 标签三处不一致 |
| Worker/Feishu | 3 态（待整改/待验收/已闭环），与 PG 4 态**无语义等价声明**；「待整改」三层含义不同 |
| 生产链路改动 | **0**（H5→Worker→Feishu 全链路未触碰） |

**必须强调的一条**：PG 的 60 条 `closed` 全部来自 Excel「已完成」的一次性迁移，**不存在任何独立复查/验收记录**。任何"PG 已闭环数 = 已完成验收数"的口径都不成立。

---

## 1. 审计目标、范围与明确不包含的内容

### 1.1 审计目标

回答六个问题：

1. `hazards.status` 在设计库中的真实类型、约束、现有取值；
2. 后端实际接受哪些状态、如何规范化旧值、如何校验流转；
3. 前端显示与筛选使用哪些值，是否与后端一致；
4. Feishu/Worker 侧映射与 HSE 后端规则之间已证实的差异；
5. 哪些差异是确定缺陷、哪些只是语义待确认、哪些证据不足；
6. 若需修改，应先确认哪些业务规则。

### 1.2 包含范围

- 数据库：`safety_dashboard_dev` 的 `hazards` 表字段/约束/索引/触发器/值分布，以及直接消费该字段的 `hse_reviews`、`hse_rectifications`、`hse_events`、`hazard_record`、`hse_filter_config`、`hse_dashboard_card_config`；
- 后端：`hazardService` / `hazardController` / `routes/hazards/*` / `overview` / `todos` / `dashboard` / `hseEventSyncService` / `hseRules`；
- 前端（web-naive）：`views/hazards/index.vue`、`components/hse/statusColors.ts`、`api/hse/hazard.ts`、`analysis/cockpit-dashboard/index.vue`；
- 移动端：`grid-mobile-cloudflare/worker/index.js`（状态常量、归一、四处写状态）、`frontend/check.app.js`（状态徽标）。

### 1.3 **明确不包含**（本轮未做，也不得据本报告推断）

- 未修改任何状态枚举、映射、约束或流转规则；
- 未评价隐患级别 `hazard_level`、隐患类别 `hazard_type`、风险等级 `risk_level` 的取值正确性（仅在与状态联动处提及）；
- 未审计考核域 `deduction` 与隐患状态的关系；
- 未验证 Feishu 生产环境当前部署的 Worker 版本（见 §7.3）；
- 未执行任何测试脚本（原因见 §7.1）；
- 未评价前端 UI 视觉规范。

---

## 2. 执行基线核验

| 项目 | 实际值 | 核验方式 |
|---|---|---|
| 当前目录 | `/g/hse-dashboard`（Git Bash 视图） | `pwd` |
| 仓库根 | `G:/hse-dashboard` | `git rev-parse --show-toplevel` |
| 当前分支 | `feat/hse-business-closure` | `git rev-parse --abbrev-ref HEAD` |
| 本地 HEAD | `9d0f9ed128137f0f9d74715317d142ea9fd4c203` | `git rev-parse HEAD` |
| 本地 origin ref | `9d0f9ed128137f0f9d74715317d142ea9fd4c203` | `git rev-parse origin/feat/hse-business-closure` |
| **远端真实 SHA** | `9d0f9ed128137f0f9d74715317d142ea9fd4c203` | `git ls-remote origin refs/heads/feat/hse-business-closure`（绕开本地 ref 缓存） |
| 本地 == 远端 | **是** | 上述对比 |
| 与任务书已知 SHA 一致 | **是**（`9d0f9ed…`） | 对比 |
| 工作区改动数 | **153 项**（用户既有未提交改动，未触碰） | `git status --short \| wc -l` |
| `server/routes/cost.js` | 状态 `A`；md5 `e88ae2b0b275346dfc1431408aa00bff` | `git status --porcelain` + `md5sum` |
| 远端地址 | `https://github.com/ljt8825-hash/HSE.git` | `git remote -v` |

**基线判定**：环境、分支、基准均可确认，未发生漂移，**未执行** `git reset/restore/checkout/强制推送`。工作区 153 项改动为审计开始前既有，本轮未覆盖、未清理、未暂存。

### 2.1 数据库连接目标断言

每条 SQL 脚本**首条语句**均为 `SELECT current_database()`，实际输出：

```
      db_assert
----------------------
 safety_dashboard_dev
```

| 项目 | 值 |
|---|---|
| 数据库 | `safety_dashboard_dev` ✅（非生产 `safety_dashboard`） |
| 用户 | `hse_app` |
| 地址/端口 | `127.0.0.1:5432` |
| 版本 | PostgreSQL 17.10 (x86_64-windows) |
| 只读保证 | 全部为 `SELECT`；脚本内**无** `INSERT/UPDATE/DELETE/CREATE/ALTER/DROP`（逐脚本人工核对 + `-v ON_ERROR_STOP=1`） |

生产库**未连接、未查询、未写入**。

---

## 3. A 段｜数据库真实结构与状态分布

### 3.1 字段定义

```sql
SELECT column_name, data_type, udt_name, character_maximum_length,
       is_nullable, column_default, ordinal_position
FROM information_schema.columns
WHERE table_schema='public' AND table_name='hazards' AND column_name='status';
```

| 属性 | 实际值 |
|---|---|
| 列名 | `status` |
| 类型 | `character varying(16)` |
| 可空 | **YES**（允许 NULL） |
| 默认值 | **`'discovered'::character varying`** |
| 位置 | 第 15 列 |

**判读**：`varchar(16)` 足够容纳全部词表最长值（`pending_review` = 14 字符），但类型本身**不表达值域**；可空 + 有默认值意味着"省略即 discovered，显式 NULL 也合法"——后者是一个未封口的写入面。

### 3.2 约束（含 CHECK / ENUM）

```sql
SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.hazards'::regclass;
```

| 约束名 | 类型 | 定义 |
|---|---|---|
| `hazards_pkey` | 主键 | `PRIMARY KEY (id)` |
| `fk_hazards_checker_id` | 外键 | `FOREIGN KEY (checker_id) REFERENCES employee(id) ON DELETE SET NULL` |
| `fk_hazards_fixer_id` | 外键 | `FOREIGN KEY (fixer_id) REFERENCES employee(id) ON DELETE SET NULL` |

- **CHECK 约束数：0**
- **自定义 ENUM 类型数：0**（`pg_enum` 中无 `%status%` / `%hazard%` 类型）
- **触发器数：0**（`pg_trigger` 非内部触发器为空）
- **规则数：0**（`pg_rules` 无 `hazards` 行）

**结论**：数据库层面对 `status` **零值域保护**。任意字符串（含 `''`、`'abc'`、`'assigned'`、`'已整改'`）都可写入成功。值域完全由应用层承担，而应用层只有读取侧 fail-closed，写入侧靠"不给入口"而非"拒绝非法值"。

### 3.3 索引

| 索引名 | 定义 |
|---|---|
| `idx_haz_status` | `btree (status)` |
| `idx_hazards_status` | `btree (status)` |

**发现 D10**：`status` 上存在**两个功能完全重复的索引**。二者均来自 `hazardService.js` 的运行时建表逻辑（`CREATE INDEX IF NOT EXISTS idx_hazards_status ON hazards(status)`，`:107`）与另一处历史建索引（`idx_haz_status`）。功能重复、写放大、无查询收益差异。属清理项，非功能缺陷。

其余 14 个索引分布在 `hazard_date` / `deadline` / `is_deleted` / `fix_date` / `level` / `no` / `township` / `checker_id` / `fixer_id` / `grid_id` / `hazard_type` / `responsible_id` / `risk_level`。**无任何索引涉及 `review_result` / `review_date` / `reviewer_id`**（与 §3.5 的证据缺口呼应）。

### 3.4 实际取值分布（**未规范化，保留原始值**）

```sql
SELECT CASE WHEN status IS NULL THEN '<NULL>' ELSE '['||status||']' END AS raw_status,
       COUNT(*), MIN(created_at)::date, MAX(created_at)::date
FROM public.hazards GROUP BY status ORDER BY 2 DESC;
```

| 原始值 | 行数 | 最早 created_at | 最晚 created_at |
|---|---|---|---|
| `closed` | **60** | 2026-08-24 | 2026-08-24 |
| `discovered` | **50** | 2026-08-24 | 2026-08-24 |
| **合计** | **110** | | |

补充核验：

| 检查 | 结果 |
|---|---|
| NULL 行数 | **0** |
| 空串行数 | **0** |
| 历史中文词汇（已完成/未完成/待处理/处理中/已关闭/已整改/已验收） | **0** |
| 首尾空格 | 0 |
| 含大写字母 | 0 |
| `status` 最大长度 | 10（`discovered`）；最小 6（`closed`） |
| `is_deleted` 交叉分布 | 110 行全部 `is_deleted=false` |

**关键判读**：`status` 现存值只有 2 个，`processing` 与 `pending_review` **在库中 0 行**。这意味着这两条流转边从未在真实数据上被走过——不是"没被触发过"，而是**无任何历史痕迹可验证其正确性**（见 §7.4 E4）。

### 3.5 已闭环行的证据完整性（本轮最重要的数据发现）

```sql
SELECT status, COUNT(*), COUNT(fix_date), COUNT(rectify_date), COUNT(review_date),
       COUNT(reviewer_id), COUNT(review_result), COUNT(rectification)
FROM public.hazards GROUP BY status;
```

| status | 行数 | fix_date | rectify_date | review_date | reviewer_id | review_result | rectification |
|---|---|---|---|---|---|---|---|
| `closed` | 60 | **60** | **0** | **0** | **0** | **0** | **0** |
| `discovered` | 50 | 9 | 0 | 0 | 0 | 0 | 2 |

配套实证：

| 表 | 行数 |
|---|---|
| `hse_reviews`（正式复查证据） | **0** |
| `hse_rectifications`（正式整改证据） | **0** |
| `hazards` 中 `review_result` 非空 | **0 / 60（closed 行全为 NULL）** |

**结论（确定事实）**：

1. 60 条 `closed` 的**唯一**闭环痕迹是 `fix_date`（整改日期）被填充，该字段来自 Excel 列映射；
2. 不存在任何 `reviewer_id`、`review_date`、`review_result`，`hse_reviews` 表为空；
3. 因此 **"PG 已闭环" ≠ "已通过复查/验收"**。这 60 条是"Excel 里写了『已完成』→ 迁移脚本写成 `closed`"，属**一次性状态搬运**，不是流程产物；
4. 该结论与 B02/B03 系列"60 条 closed 零复查证据"一致，本轮从 `status` 单一字段维度再次独立证实。

### 3.6 依赖该字段的派生列与邻接表

| 对象 | 与 `status` 的关系 | 实证 |
|---|---|---|
| `fix_date`（date） | 闭环痕迹（非状态） | closed 60/60 有值 |
| `rectify_date`、`review_date`、`review_result`、`reviewer_id` | 应为状态流转副产物 | 全 0，**未使用** |
| `deadline` / `deadline_date` / `deadline_days` | 逾期派生输入 | `deadline` 0/110、`deadline_date` 0/110、`deadline_days` 110/110（全默认 30） |
| `hse_events.status` | 独立词表（open/processing/closed） | 16 行**全部来源 `accidents`**，来源 `hazards` = **0 行** |
| `hazard_record.status` | 同域并行栈（另一张表） | 9 行，值只有 `open` |
| `hse_filter_config` / `hse_dashboard_card_config` | 把状态当筛选/看板维度 | 见 §6.3 |

**注意**：`deadline` 与 `deadline_date` 两列**均 0/110**，而 `stats()` 的逾期口径用 `hazard_date + deadline_days`、`overview.js` 的逾期口径用 `deadline_date`。两者当前都算不出逾期（前者因 `hazard_date` 有值可算，后者恒 0）。这是**逾期口径双源**问题，与状态统计的"未闭环"判定耦合，列为旁证，不在本轮展开。

---

## 4. B 段｜后端服务层实际规则

### 4.1 正式状态枚举（声明）

`server/services/hazardService.js:138-148`

```js
const HAZARD_STATUS = {
  DISCOVERED: 'discovered',
  PROCESSING: 'processing',
  PENDING_REVIEW: 'pending_review',
  CLOSED: 'closed',
};
const HAZARD_STATUS_VALUES = Object.values(HAZARD_STATUS);
const HAZARD_STATUS_SET = new Set(HAZARD_STATUS_VALUES);
```

注释明确：**"只有以下 4 个值可以写入 hazards.status；任何其它值只能'识别'，不能'写回'"**（`:139`）。

前端类型同源：`安全看板vben/apps/web-naive/src/api/hse/hazard.ts:11`
`export type HazardStatus = 'discovered' | 'processing' | 'pending_review' | 'closed';`

### 4.2 旧状态兼容表（三张，语义不同）

**（1）`STATUS_MAP` — legacy，可识别、不写回**（`:150-159`）

| 原始值 | 归一结果 | 说明 |
|---|---|---|
| `发现` | `discovered` | |
| `整改中` | `processing` | |
| `待复查` | `pending_review` | |
| `关闭` | `closed` | |
| `未完成` | `discovered` | 历史 Excel 词汇 |
| `已完成` | `closed` | 历史 Excel 词汇 |

**（2）`NON_LIFECYCLE_STATUS` — 告警/看板词，单独归类**（`:161-169`）

| 原始值 | 归一结果 |
|---|---|
| `待处理` | `discovered` |
| `处理中` | `processing` |
| `已关闭` | `closed` |
| **`已整改`** | **`closed`** |
| `已验收` | `closed` |

注释（`:161-162`）明确这类词"语义与生命周期**相近但不等价**"，"**绝不参与状态机写入与统计口径**"。

**（3）四分类函数 `classifyStatus`**（`:179-200`）

```js
function classifyStatus(raw) {
  if (raw === null || raw === undefined || raw === '') return { status: null, category: 'unknown' };
  if (HAZARD_STATUS_SET.has(raw)) return { status: raw, category: 'canonical' };
  if (hasOwnProperty(STATUS_MAP, raw)) return { status: STATUS_MAP[raw], category: 'legacy' };
  if (hasOwnProperty(NON_LIFECYCLE_STATUS, raw)) return { status: NON_LIFECYCLE_STATUS[raw], category: 'non_lifecycle' };
  return { status: null, category: 'unknown' };
}
```

**关键发现 D6 前半**：`classifyStatus` 与 `isCanonicalStatus`（`:202-204`）在全仓**仅有定义与导出**（`:1407-1413`），**无任何调用点**（全库 grep 仅命中定义行与 `module.exports`）。即：

> "`已整改` → `closed`" 这条映射**确实存在于代码中，但位于一条从未执行的分支**。

因此任务书线索"后端服务层状态识别逻辑中，`已整改` 曾被识别为 `closed`" **核实为真、但作用于死路径**；真正生效的路径对它另有处理（见 4.3）。

### 4.3 实际生效的读取侧规则

**`statusToIsResolved`**（`:253-262`）—— `formatRow`、列表筛选、逾期计算、统计全部走它：

```js
function statusToIsResolved(status) {
  if (!status) return '否';
  if (status === 'closed' || status === '已完成' || status === 'completed') return '是';
  return '否';
}
```

→ **`已整改` → `'否'`（未解决）**，与 `classifyStatus` 的 `closed` 相反。

**`getStatusLabel`**（`:206-213`）—— 仅用于 `formatRow` 之外的列表映射（`:1157`、`:1181`）：

```js
if (status === '已完成' || status === '已关闭' || status === '已整改' || status === '已验收') return '已关闭';
```

→ **`已整改` → `'已关闭'`（显示为闭环）**，又与 `statusToIsResolved` 相反。

**同一文件、同一输入 `'已整改'`，三种结果**：

| 函数 | 结果 | 是否生效 |
|---|---|---|
| `classifyStatus` | `closed`（canonical） | ❌ 死路径 |
| `getStatusLabel` | `已关闭`（显示闭环） | ✅ 列表 `statusLabel` |
| `statusToIsResolved` | `'否'`（未解决） | ✅ `isResolved`、筛选、逾期、统计 |

**这是 D6 的核心**：不是"某一处写错了"，而是"三处各写一套、且两处互相矛盾"。虽然当前库中 `已整改` 出现 0 次（故影响为潜伏），但一旦历史数据回灌或 Feishu 同步接入，`isResolved='否'` 与 `statusLabel='已关闭'` 会**同一行同时出现**。

### 4.4 SQL 侧闭环判定（唯一来源）

`server/services/hazardService.js:215-235`

```js
const SQL_CLOSED_STATUS_LIST = `('closed', '已完成')`;
function sqlStatusClosed(alias = '') { return `${alias}status IN ${SQL_CLOSED_STATUS_LIST}`; }
function sqlStatusOpen(alias = '') {
  return `(${alias}status IS NULL OR ${alias}status NOT IN ${SQL_CLOSED_STATUS_LIST})`;
}
```

设计意图（`:216-224` 注释）：修复两处叠加缺陷 —— ①迁移后写 `closed`，旧判断 `!= '已完成'` 会把已闭环判为未闭环；②`NULL != '已完成'` 求值为 NULL，导致 NULL 行被排除。

**调用方**：

| 调用点 | 用途 |
|---|---|
| `hazardService.js:485` | `list()` 的 `isResolved` 筛选 |
| `hazardService.js:401`（`syncRiskOnHazardResolve` 内） | 风险点反向联动统计"未闭环隐患数" |
| `routes/overview.js:33` | 总览"已整改"卡片 |
| `routes/overview.js:92` | 总览"未闭环"计数 |
| `routes/todos.js:112` | 待办"隐患逾期" |

**注意（D7）**：`stats()` 的 `overdueCount` **没有**用 `sqlStatusOpen`，而是裸写 `h.status != 'closed'`（`:623`）：

```sql
WHERE h.is_deleted = false
  AND h.status != 'closed'
  AND h.hazard_date IS NOT NULL
  AND h.hazard_date + (h.deadline_days || ' days')::interval < CURRENT_DATE
```

NULL 状态下该条件求值为 NULL（非 TRUE）→ **NULL 行不计入逾期**，与 `sqlStatusOpen`（NULL 计为未闭环）相反。当前 0 行 NULL ⇒ **影响 0，属潜伏缺陷**。这与 `todos.js:102-106` 注释里已修过的同类问题（原为 `status != 'CLOSED'`）是同一类错误，只是 `stats()` 漏改。

### 4.5 写入路径（四个动作 + 两道封口）

**W1 创建封口**（`:754-756`）

```js
// P3-04-00 (W1): 生命周期初始状态由服务端决定。
// 忽略客户端传入的 status / isResolved，防止伪造 closed / processing 绕过状态机。
const status = HAZARD_STATUS.DISCOVERED;
```

`INSERT INTO hazards (... status ...)` 20 列（`:788-798`），`status` 恒为 `'discovered'`。客户端传 `status` / `isResolved` 均被丢弃，**不入 SQL**。

**W2 更新封口**（`:843-847`）

```js
// P3-04-00 (W2): 普通更新禁止修改生命周期 status（含 isResolved 派生入口）。
// 即使客户端传 status / isResolved 也被忽略，不进入 SQL；状态只能经
// rectify / submitReview / review / close 业务动作变更。
```

实测 `update()`（`:815-900`）的 `setClauses` 白名单：`no / description / measure / hazard_date / checker / fixer / fix_date / remark / related_risk_id / risk_level / finder_id / responsible_id / corrector_id / checker_id / fixer_id / hazard_type / location / grid_id / rectification / rectify_date / deadline_days / updated_at` —— **不含 `status`，也不含 `reviewer_id` / `review_date` / `review_result`**（`:842-843` 注释说明这三列已"彻底移除，不留隐藏兼容路径"）。内存镜像分支（`:864-882`）同样不写 `status`。

**四个状态变更动作**（均在 `hazardService.js`，均带源状态守卫）：

| 动作 | 端点在位 | 源状态守卫（WHERE） | 目标状态 | 同步写证据 | 失败语义 |
|---|---|---|---|---|---|
| `rectify`（`:934-967`） | `PUT /:id/rectify` | `status = 'discovered'` | `processing` | 写 `corrector_id`/`rectification`/`rectify_date` | `rows.length===0` → `err(-2,'隐患不存在或状态不允许整改')` |
| `submitReview`（`:971-995`） | `PUT /:id/submit-review` | `status = 'processing'` | `pending_review` | 无 | `err(-2,'…状态不允许提交复查')` |
| `review`（`:999-1094`） | `PUT /:id/review` | `status = 'pending_review'` | pass→`closed`；fail→`processing` | **同事务 `INSERT INTO hse_reviews`**（`:1058-1077`），`review_code` 唯一 | 事务 `ROLLBACK` → `err(-1,'复查失败')` |
| `close`（`:1099-1138`） | `PUT /:id/close` | `status = 'pending_review'` | `closed` | **无 INSERT** | 区分"不存在"与"状态不允许" |

**D4（已证实缺陷）**：`close()` 与 `review(pass)` 目标状态相同（`closed`），但 `close()`：
- 不写 `hse_reviews`（全仓 `INSERT INTO hse_reviews` 只有 `:1059` 一处）；
- 不写 `review_result`、不写 `reviewer_id`、不写 `review_date`；
- 只把 `closeNote` 塞进 `rectification`（`:1117`）。

→ 同一个 `closed` 状态，**存在"有正式复查证据"与"零证据"两条到达路径**，且库中无法从 `status` 区分。这与 §3.5 的 60/60 零证据互为印证：**当前 PG 的 `closed` 语义实际是"被外部声明为完成"，不是"已验收"**。

**并发语义**：四个动作都用 `WHERE id=$n AND status='期望源状态'` 做**乐观锁式条件更新**，未使用 `SELECT ... FOR UPDATE`。并发下第二个请求会命中 `rows.length===0` 并返回"状态不允许"，不会产生中间态。这是当前实现里**设计正确的部分**。

### 4.6 声明式状态机与实际实现的对账（D1）

`server/config/hseRules/hazard-rule.json` → `statusFlow`，经 `config/hseRules/index.js:167-171` 的 `getHazardStatusFlow()` 对外暴露，路由 `GET /api/hazards/rules/status-flow`（`routes/hazards/main.js:55` → `hazardService.js:1389`）。

**声明的 6 个状态**：

| code | label | 声明语义 |
|---|---|---|
| `discovered` | **待登记** | 隐患已发现，待登记建档 |
| **`assigned`** | **待整改** | 已登记并分配整改责任人 |
| `processing` | 整改中 | 落实整改措施 |
| `pending_review` | 待复查 | 提交复查申请 |
| `closed` | 已闭环 | 复查通过 |
| **`expired`** | **已超期** | 超过整改期限仍未完成 |

**声明的 11 条迁移**：`discovered→assigned(assign)`、`discovered→processing(rectify)`、`assigned→processing(rectify)`、`assigned→assigned(reassign)`、`processing→pending_review(submitReview)`、`processing→processing(updateRectify)`、`pending_review→closed(reviewPass)`、`pending_review→processing(reviewFail)`、`expired→processing(rectify)`、`expired→assigned(extendDeadline)`、**`closed→discovered(reopen)`**。

**实际实现 4 状态 / 4 条状态边（5 个写入动作；`pending_review→closed` 有 `review(pass)` 与 `close()` 两条路径）**：

| 声明的迁移 | 是否实现 | 实证 |
|---|---|---|
| `discovered→assigned` | ❌ | 全仓无任何写 `assigned` 的 SQL（仅配置表出现） |
| `discovered→processing` | ✅ | `rectify()` |
| `assigned→processing` | ❌ | 无 `assigned` 源数据，等于永不命中 |
| `assigned→assigned`（改派） | ❌ | 无 assign/reassign 服务端动作 |
| `processing→pending_review` | ✅ | `submitReview()` |
| `processing→processing`（更新进展） | ❌ | 无对应端点 |
| `pending_review→closed` | ✅ | `review(pass)` **和** `close()` 两条 |
| `pending_review→processing` | ✅ | `review(fail)` |
| `expired→*` | ❌ | `expired` 不是 `hazards.status` 的值，而是 `calcExpiryStatus()` 派生结果 |
| `closed→discovered`（reopen） | ❌ | 无 reopen 端点；`update()` 被 W2 封口 |

**结论 D1**：`GET /api/hazards/rules/status-flow` 对外声明的是一个 **6 态 11 边**的状态机，而系统实际只能执行 **4 态 4 边（5 个写入动作）**。接口返回的规则**无法作为调用方的行为依据** —— 任何依据该接口实现的客户端（含未来同步层）都会实现出系统不支持的动作。

另附：`assigned` 在整个 `hazards` 域**没有任何写入路径**，只在种子脚本 `server/init-hazard-module.js:24` 的下拉选项与 `:68` 的看板卡片参数里出现（见 §6.3）。`expired` 同理。

### 4.7 其他写入面排查

| 位置 | 是否写 `hazards.status` | 说明 |
|---|---|---|
| `routes/hazards/main.js` 全部端点 | 否 | 只经 service；`/rules/*` 全为只读规则 |
| `controllers/hazardController.js` | 否 | 薄封装，仅 `res.status()` HTTP 码，无业务字段处理 |
| `services/hseEventSyncService.js` | 否（写 `hse_events.status`） | 见 §6.2 |
| `services/hazardRectificationService.js` | 否（写 `hazard_record.status`） | 另一张表，见 §6.2 |
| `scripts/p3-04-02-migrate-legacy-status.js:112,118,124` | **是** | 一次性迁移：`已完成→closed`、`NULL→discovered`；DB 实证已执行完毕（0 残留） |
| `services/importExcelService.js` | 否 | 经 `hazardService.create`，被 W1 约束；测试脚本 T17 已固化"重导入不改 status" |

**未发现绕过统一规则的第三处 `hazards.status` 写入面**（迁移脚本除外，且已执行完毕）。

---

## 5. C 段｜前端状态规则

### 5.1 主页面 `views/hazards/index.vue`

**筛选下拉**（`:120-125`）：

```js
const STATUS_OPTIONS = [
  { label: '发现', value: 'discovered' },
  { label: '整改中', value: 'processing' },
  { label: '待复查', value: 'pending_review' },
  { label: '关闭', value: 'closed' },
];
```

→ 4 值，**与后端 canonical 完全一致**。

**统计卡**（`:858-868`）：

| 卡片标签 | 点击筛选值 | 取数 |
|---|---|---|
| 待整改 | `discovered` | `stats.discovered` |
| 整改中 | `processing` | `stats.processing` |
| 待复查 | `pending_review` | `stats.pendingReview` |
| 已关闭 | `closed` | `stats.closed` |

**表格状态列**（`:932-935`、`:1503-1506`）：

```
<HseStatusTag :type="STATUS_TAG[row.status || ''] || 'neutral'">
  {{ STATUS_LABEL[row.status || ''] || row.status || '-' }}
</HseStatusTag>
```

映射来自 `components/hse/statusColors.ts:25-51`：

| 值 | 标签 | 语义色 |
|---|---|---|
| `discovered` | 发现 | info |
| `processing` | 整改中 | warning |
| `pending_review` | 待复查 | warning |
| **`closed`** | **已关闭** | success |
| 未完成 | 待整改 | neutral |
| 已完成 | 已关闭 | success |
| 待处理 | 待处理 | warning |
| 处理中 | 整改中 | warning |
| 已关闭 | 已关闭 | success |
| **已整改** | **已整改** | success |
| 已验收 | 已验收 | success |

**D12（标签不一致，已证实）**：同一个 `closed`，三个位置三种写法 ——
- 筛选下拉：**关闭**
- 表格/统计卡：**已关闭**
- 后端 `STATUS_LABEL`（`:172-177`）与 `getStatusLabel`：**关闭**

**D6 后半**：前端对 `已整改` 显示 **"已整改"**（未归一到"已关闭"），而标签色是 `success`（暗示已完成），同时后端 `statusToIsResolved` 返回 `'否'`（未解决）。=> 同一行可能出现「已整改·绿色」但 `isResolved='否'`。库中 0 行 ⇒ 潜伏。

### 5.2 操作按钮的前后端权限差异（D5）

`index.vue:945-975`：

| 按钮 | 显示条件 | 后端实际要求 | 一致性 |
|---|---|---|---|
| 整改 | `row.status === 'discovered'` | `rectify` 要求源 `discovered` | ✅ |
| 提交复查 | `row.status === 'processing'` | `submitReview` 要求源 `processing` | ✅ |
| 复查确认 | `row.status === 'pending_review' && canFormalReview` | `hse:hazard:review` 权限 + 源 `pending_review` | ✅ |
| **关闭** | **`row.status !== 'closed'`** | **`close` 要求源 `pending_review`** | ❌ **已证实不一致** |

**实证影响**：`discovered`（50 行）与 `processing` 的行都会显示「关闭」按钮 → 点击 → `onConfirmClose()`（`:522-536`）直接调 `closeHazard()`，无任何前置判断 → 后端 `close()` 命中 `rows.length===0` → 返回 `err(-2,'隐患状态不允许关闭（仅待复查可关闭）')`（`:1130`）→ 前端 `catch {}` 静默（"拦截器已提示"）。

即：**50 条现存隐患的「关闭」按钮 100% 必然失败**，且失败原因只有一句 toast。这是"仅前端限制、后端有校验"的反向情形 —— 前端**缺少**限制，后端**有**校验，形成必然失败的死按钮。

### 5.3 其他前端页面

| 文件 | 状态使用 | 判定 |
|---|---|---|
| `api/hse/hazard.ts:11` | `HazardStatus` 类型 = 4 canonical | ✅ 与后端一致 |
| `api/hse/hazard.ts:38` | `status?: HazardStatus \| string` | ⚠️ 放开了任意字符串（读侧兼容，写侧被 W2 拦） |
| `analysis/cockpit-dashboard/index.vue:166-169` | 通用取数：`field==='byStatus'` → `stats.hazard.byStatus?.[key] \|\| 0` | 见 D2 |
| `analysis/cockpit-dashboard/index.vue:193-195` | `card_code==='hazard_pending'` → `(byStatus.assigned\|\|0)+(byStatus.discovered\|\|0)` | **不可达**（被 `:169` 提前 `return`） |
| `risk-control/components/RiskDetailDrawer.vue:287` | `hz.isResolved === '是' ? '已整改' : '未整改'` | ⚠️ 用「已整改」表达"已解决"，与隐患域 `已整改` 一词三义叠加 |
| `hse/leader-dashboard`、`hse/bi` | 无隐患状态硬编码 | ✅ |

**D2（已证实缺陷，影响可见数字）**：

链路：
1. `hse_dashboard_card_config` 中 `hazard_pending`（标题「待整改」）的参数是 `{"key":"assigned","field":"byStatus"}`（DB 实证，见 §6.3）；
2. `/api/overview` 构造 `byStatus` 的方式是 `SELECT status, COUNT(*) FROM hazards GROUP BY status`（`routes/overview.js:165-166`）→ 键只有 `discovered`、`closed`；
3. 前端取 `byStatus['assigned'] || 0` → **恒 0**；
4. 原本 `:193-195` 写了 `assigned + discovered` 的补偿，但 `:167-169` 的 `if (field === 'byStatus') return ...` 已先行返回 → **补偿分支永远执行不到**。

结果：**驾驶舱「待整改隐患」卡片显示 0，实际 `discovered` = 50**。

（同源问题：`hazard_level*` 卡片取 `byLevel`，而 `hazard_level` 110/110 全 NULL → 4 张等级卡全 0。属级别域，本轮仅备注。）

### 5.4 前端是否自行转换状态

- **不转换**：`formatRow` 回传的 `status` 被原样使用（`hazardService.js:329`），表格与按钮都按原始值比较；
- **不做 legacy 归一**：前端只在**显示标签**上做了历史词映射，**逻辑判断（按钮/筛选/统计卡）完全不认历史值** → 若历史行回来，按钮会全部消失而标签仍可读；
- `isResolved` 由后端 `formatRow` 计算（`:317`），前端只读不推。

---

## 6. D 段｜Feishu / Worker 状态映射

### 6.1 Worker 源码归属与版本

| 项目 | 值 |
|---|---|
| 路径 | `grid-mobile-cloudflare/worker/index.js`（4957 行） |
| 是否属本仓库 | **是**（`git ls-files` 命中 206 个文件，无嵌套 `.git`） |
| 该文件最后提交 | `69c0d181a056ca1b351520af82bd2afa31ac6ac3`（2026-10-23 14:10:09 +0800） |
| 分支 | 随主仓库 `feat/hse-business-closure` |
| 表 ID 配置 | `worker/wrangler.toml:116` → `FS_HAZARD_TABLE_ID = "tblnyMjxtxjpP08q"` |

**⚠️ 版本关系限制**：源码最后提交 `69c0d181` 与审计基准 `9d0f9ed` 不同（前者是后者历史中的某次提交），说明 Worker 代码在审计基准下**未变更**。但**"仓库中是哪一版" ≠ "Cloudflare 上跑的是哪一版"**：仓库内无部署 SHA、无 `wrangler deployments` 记录、无 `version_id` 落盘。**生产实际运行版本未核实**（见 §7.3 E1）。

### 6.2 Worker 状态词表（3 态）

`grid-mobile-cloudflare/worker/index.js:2954-2963`：

```js
const HAZARD_STATUS_PENDING = '待整改';
/* 待整改 ──整改人提交（照片+说明）──▶ 待验收 ──安环部通过──▶ 已闭环（唯一终点）
     ▲                                  │
     └──────────安环部打回────────────────┘（打回次数 +1，回炉重改）
   存量历史数据「处理状态」可能是空串 / 整改中 / 已整改：读取与写入都按「待整改」 */
const HAZARD_STATUS_REVIEW = '待验收';
const HAZARD_STATUS_CLOSED = '已闭环';
```

**归一函数**（`:3055-3061`）：

```js
function hazardStatusNorm(s) {
  const v = String(s || '').trim();
  if (v === HAZARD_STATUS_REVIEW) return HAZARD_STATUS_REVIEW;
  if (v === HAZARD_STATUS_CLOSED) return HAZARD_STATUS_CLOSED;
  return HAZARD_STATUS_PENDING;          // 空串 / 整改中 / 已整改 / 任意未知值 → 待整改
}
```

→ **"非终态一律归为待整改"** 核实为真，且范围比线索更宽：**任意未知值**（含 `已验收`）也落入 `待整改`。这是一个 fail-open 归一（对比 PG 侧 `classifyStatus` 的 fail-closed → `null`）。

**四处写状态**（精确行号）：

| 动作 | 位置 | 写入值 | 前置条件 |
|---|---|---|---|
| 登记 | `:3321` | `rectTokens.length ? 已闭环 : 待整改` | 若带"整改后照片"则**直接已闭环**（`:3327-3332` 同时写 `闭环时间` + `验收结论='登记时已现场整改，直接闭环'`） |
| 整改提交 | `:3834-3837` | `待验收` | `item.status !== 待整改` → 409（`:3827-3831`） |
| 验收通过 | `:3908-3915` | `已闭环` | `item.status !== 待验收` → 409（`:3898-3902`） |
| 验收打回 | `:3916-3923` | `待整改` | 同上；`打回次数 +1`（上限 99） |

**关键事实**：Worker 侧**没有任何 `processing` 中间态**。"整改中"这个语义在移动端不存在 —— 隐患要么「待整改」要么「待验收」要么「已闭环」。而 PG 侧 `discovered→processing→pending_review` 是必走的两个中间态。**两侧流程步数不同（Feishu 2 步 / PG 4 步）**。

**H5 渲染**（`frontend/check.app.js:5079-5085`）：3 值 + 默认回退 `待整改`，与 Worker 一致。

**另附（旁证，非隐患域）**：`check.app.js:3053-3065` 的 `statusChip()` 使用 `unfinished/transferred/reviewed/done` 另一套词表，服务于"网格检查记录"，与隐患「处理状态」**不是同一字段**，不得混用。

### 6.3 持久化配置中的第三套状态词表（DB 实证）

`server/init-hazard-module.js` 是独立种子脚本（无任何文件引用它，未被应用调用），但**其写入的数据已在库中**：

```sql
SELECT field_name, data_options FROM hse_filter_config
WHERE module_code='hazard_governance' AND field_name='status';
```

实际值：

| label | value |
|---|---|
| 待登记 | `discovered` |
| **待整改** | **`assigned`** |
| 整改中 | `processing` |
| 待复查 | `pending_review` |
| 已闭环 | `closed` |
| **已超期** | **`expired`** |

`hse_dashboard_card_config`（隐患域 11 张卡）实际值节选：

| card_code | card_title | data_source_params | filter_conditions |
|---|---|---|---|
| `hazard_pending` | 待整改 | `{"key":"assigned","field":"byStatus"}` | `{"status":"assigned"}` |
| `hazard_processing` | 整改中 | `{"key":"processing","field":"byStatus"}` | `{"status":"processing"}` |
| `hazard_closed` | 已闭环 | `{"key":"closed","field":"byStatus"}` | `{"status":"closed"}` |
| `hazard_level1~4` | 重大/较大/一般/轻微 | `{"key":"一级","field":"byLevel"}` … | `{"hazardLevel":"一级"}` … |
| `hazard_expiring` | 临期隐患 | `{"field":"expiring"}` | `{"expiryStatus":"expiring"}` |
| `hazard_expired` | 超期隐患 | `{"field":"expired"}` | `{"expiryStatus":"expired"}` |

**消费方实证**：`cockpit-dashboard/index.vue:204` 请求 `GET /overview/cards`（`routes/overview.js:226`，读 `hse_dashboard_card_config`）→ **配置是活数据**，不是死配置。而 `hse_filter_config` 在 web-naive 中**未找到消费方**（前端全量 grep 无 `filterConfig`/`hse_filter_config` 引用）→ 筛选器配置属**悬空配置**。

**由此产生 D2/D3 两个已证实缺陷**：

- **D2**（见 §5.3）：配置 `key=assigned` → 卡片恒 0；
- **D3**：若动态筛选器被任一前端消费（如 web-antd 或其他端），其「待整改」提交 `status=assigned`、`已超期` 提交 `status=expired`，而 `list()` 是**等值匹配**：

  ```js
  if (status) { whereSql += ` AND status = $${paramIdx}`; params.push(status); }   // :487-491
  ```

  库中无 `assigned`/`expired` → **恒 0 行**。且 `discovered` 在该配置里叫「待登记」，与服务端 `STATUS_LABEL` 的「发现」、页面卡片的「待整改」三者互不相同。

### 6.4 「待整改」「已闭环」「已整改」三层含义对照

| 词 | PG 页面/服务端 | PG 配置/规则 | Worker/Feishu | 是否等价 |
|---|---|---|---|---|
| **待整改** | `discovered`（统计卡标签） | `assigned` | `待整改`（= PG 的 `discovered` 位置） | **❌ 三层三种取值** |
| 待登记 | — | `discovered` | — | — |
| 发现 | `discovered`（下拉/表格） | — | — | — |
| 待复查 | `pending_review` | `pending_review` | — | ✅ 两侧一致 |
| 待验收 | — | — | `待验收` | ❓ 与 `pending_review` 位置相同、证据强度不同 |
| 关闭 / 已关闭 | `closed` | `closed`（标签「已闭环」） | — | 值一致，标签 3 种 |
| 已闭环 | — | `closed`（标签） | `已闭环` | ❓ 需业务确认 |
| **已整改** | 显示「已整改」/`isResolved='否'`/`classifyStatus=closed` | — | 归一为 `待整改` | **❌ 四处四种** |
| 已超期 | 派生 `expiryStatus` | `expired`（当状态用） | 派生 `overdue:true` | ❌ 派生 vs 状态 |

### 6.5 差异是否会导致错误关闭 / 错误开放

| 场景 | 当前是否发生 | 依据 |
|---|---|---|
| 错误关闭（未验收即 closed） | **已在库中发生 60 次** | §3.5：60/60 零验收证据 |
| 错误关闭（Worker"登记即闭环"） | 设计如此，非 bug，但**闭环定义被放宽** | `index.js:3321,3327-3332` |
| 错误开放（已整改仍算未闭环） | 今日否（0 行 `已整改`）；若历史回灌则**必然发生** | `statusToIsResolved('已整改')==='否'` |
| 遗漏整改 | 不可判定 | 需业务口径 |
| 统计失真（待整改卡片恒 0） | **已发生** | §5.3 D2 |
| 统计失真（逾期口径 NULL 排除） | 今日否（0 NULL） | §4.4 D7 |

### 6.6 同一原始值经不同链路的结果（静态推演，非运行时实测）

| 原始值 | PG `formatRow().isResolved` | PG `statusLabel` | Worker `status` | 一致？ |
|---|---|---|---|---|
| `discovered` | 否 | 发现 | （无此值） | — |
| `closed` | 是 | 关闭 | （无此值） | — |
| `已整改` | **否** | **已关闭** | **待整改** | ❌ 三向分歧 |
| `已验收` | **否** | **已关闭** | **待整改**（未知值兜底） | ❌ 三向分歧 |
| `已完成` | 是 | 已关闭 | 待整改 | ❌ |
| 空串 / NULL | 否 | `''` / `null` | 待整改 | ⚠️ 显示为空 vs 待整改 |

**说明**：该表是**代码路径推演**，非运行时观测。PG 与 Worker 当前**不存在自动链路**（§7.2 已证），故上表描述的是"若把同一值分别喂给两侧"的结果，用于未来同步层的映射设计，不构成现行生产缺陷。

---

## 7. E 段｜规则一致性矩阵

### 7.1 主矩阵

| 原始状态值 | 数据库是否存在 | 后端规范化结果 | 后端是否允许写入 | 对应业务操作及前置条件 | 前端显示 / 提交值 | Worker 映射结果 | 已证实风险 | 证据位置 | 结论状态 |
|---|---|---|---|---|---|---|---|---|---|
| `discovered` | ✅ 50 行 | 原样（canonical） | ✅ 仅 `create()`，恒写此值 | 创建；`rectify` 的源状态 | 标签「发现」（表格/筛选）；统计卡标签「待整改」 | — （Worker 无此值） | 同一值在页面内有两个标签 | `hazardService.js:140,756,957`；`index.vue:121,858` | **一致（PG 内部）** |
| `processing` | ❌ 0 行 | 原样（canonical） | ✅ 仅 `rectify()` | 源须 `discovered`；`submitReview` 的源状态 | 「整改中」 | — | 无历史数据可验证该边正确性 | `hazardService.js:952-957` | **证据不足** |
| `pending_review` | ❌ 0 行 | 原样（canonical） | ✅ 仅 `submitReview()` | 源须 `processing` | 「待复查」 | 位置≈`待验收` | 与 Feishu「待验收」无等价声明 | `hazardService.js:983-985` | **业务语义待确认** |
| `closed` | ✅ 60 行 | 原样（canonical） | ✅ `review(pass)` / `close()` | pass：源须 `pending_review`；close：源须 `pending_review` | 「关闭」/「已关闭」/「已闭环」三写法 | 位置≈`已闭环` | **60/60 无验收证据** | `hazardService.js:1018,1046,1116-1119`；DB §3.5 | **已证实不一致（闭环语义）** |
| `assigned` | ❌ 0 行 | `unknown` → `null`（fail-closed） | ❌ 无任何写入路径 | 声明式规则有 `assign` 动作，服务端无实现 | 无（页面无此值） | — | 配置/规则声明存在、实现缺失 → 卡片恒 0 | `hazard-rule.json`；`hse_filter_config`；`init-hazard-module.js:24,68` | **已证实不一致** |
| `expired` | ❌ 0 行 | `unknown` → `null` | ❌ 无写入路径 | 服务端用 `calcExpiryStatus()` 派生，不落库 | `expiryStatus` 派生值 | Worker `overdue` 布尔派生 | 同一概念「超期」在两处是状态、在服务端是派生 | `hazardService.js:123-136`；`hazard-rule.json` | **已证实不一致** |
| `已完成` | ❌ 0 行（迁移已清空） | `closed`（legacy） | ❌（`STATUS_MAP` 仅识别） | 历史 Excel 词汇 | 「已关闭」 | 归一为`待整改` | 已无数据，仅兼容分支 | `hazardService.js:158,260` | **一致（历史兼容）** |
| `未完成` | ❌ 0 行 | `discovered`（legacy） | ❌ | 历史 Excel 词汇 | 「待整改」 | 归一为`待整改` | 同上 | `hazardService.js:157` | **一致（历史兼容）** |
| `发现` | ❌ 0 行 | `discovered`（legacy） | ❌ | — | — | — | — | `hazardService.js:153` | 一致 |
| `整改中` | ❌ 0 行 | `processing`（legacy） | ❌ | — | 「整改中」 | **归一为`待整改`** | 同一词两侧不同终态 | `hazardService.js:154`；`worker:3055-3061` | **业务语义待确认** |
| `待复查` | ❌ 0 行 | `pending_review`（legacy） | ❌ | — | 「待复查」 | 未知值→`待整改` | 同上 | 同上 | **业务语义待确认** |
| `关闭` | ❌ 0 行 | `closed`（legacy） | ❌ | — | 「关闭」 | 未知值→`待整改` | 同上 | 同上 | **业务语义待确认** |
| **`已整改`** | ❌ 0 行 | **三处不一致**：`classifyStatus→closed` / `getStatusLabel→已关闭` / `statusToIsResolved→否` | ❌ | — | 「已整改」+ success 色 | **归一为`待整改`** | 同值四处四种结果 | `hazardService.js:167,210,260`；`statusColors.ts:52`；`worker:3060` | **已证实不一致** |
| `已验收` | ❌ 0 行 | `closed`（non_lifecycle） | ❌ | — | 「已验收」+ success | 未知值→`待整改` | 显示闭环 vs 移动端回退待整改 | 同上 | **业务语义待确认** |
| `已关闭` | ❌ 0 行 | `closed`（non_lifecycle） | ❌ | — | 「已关闭」 | 未知值→`待整改` | — | `hazardService.js:166` | 一致 |
| `待处理` | ❌ 0 行 | `discovered`（non_lifecycle） | ❌ | — | 「待处理」 | — | 告警域词汇混入隐患域 | `hazardService.js:164` | **业务语义待确认** |
| `处理中` | ❌ 0 行 | `processing`（non_lifecycle） | ❌ | — | 「整改中」 | 未知值→`待整改` | — | `hazardService.js:165` | **业务语义待确认** |
| `待整改`（Feishu 主值） | ❌ 0 行 | **`unknown` → `null`** | ❌ | — | 无 | **Worker 主值** | **Feishu 最高频状态在 PG 无落点** | `hazardService.js:199`；`worker:2954` | **已证实不一致** |
| `待验收`（Feishu 主值） | ❌ 0 行 | `unknown` → `null` | ❌ | — | 无 | Worker 中间态 | 与 `pending_review` 无等价声明 | `hazardService.js:199` | **业务语义待确认** |
| `已闭环`（Feishu 终态） | ❌ 0 行 | `unknown` → `null` | ❌ | — | 无 | Worker 终态 | 与 `closed` 无等价声明 | `hazardService.js:199` | **业务语义待确认** |
| `NULL` | ❌ 0 行 | `unknown`（`status:null`） | ⚠️ 列可空，但无写入入口 | — | 标签回退 `'-'`；`isResolved='否'` | 归一为`待整改` | 若由外部写入：统计按未闭环、逾期不计 | `hazardService.js:187-188,234` | 一致（fail-closed） |
| `''`（空串） | ❌ 0 行 | `unknown`（`status:null`） | ⚠️ varchar 允许 | — | 标签回退 `'-'` | 归一为`待整改` | 同上 | 同上 | 一致（fail-closed） |
| `abc`（任意串） | ❌ 0 行 | `unknown` → `null` | ⚠️ **DB 无 CHECK，可直接写入** | — | 标签原样回显 | 归一为`待整改` | 值域仅靠应用层 | §3.2 零 CHECK | **已证实风险（DB 层无保护）** |
| `open`（`hazard_record` 表） | 9 行（**另一张表**） | 不适用 | 不适用 | `hazardRectificationService` 写 `pending/processing/pending_review/closed`，实际数据是 `open` | 前端 0 调用 | — | 并行栈自身也不自洽 | §7.2 | **已证实不一致（邻接域）** |

### 7.2 旁支：同域另外两套状态机（实证）

| 对象 | 词表 | 数据实况 | 结论 |
|---|---|---|---|
| `hse_events.status`（隐患/事故通用事件表） | `open / processing / resolved / closed` | 16 行：`open` 12、`processing` 3、`closed` 1；**来源 `hazards` = 0 行**，全部来自 `accidents` | **D8（潜伏）**：`hseEventSyncService.js:49-61` 的 `STATUS_MAP` 键为中文（`待整改/整改中/已整改/已验收`），而 `hazards.status` 是英文 canonical → `STATUS_MAP[hazard.status]` 恒 `undefined` → 落默认 `'open'`（`:123,157`）。**任何通过 API 创建的隐患，其事件行状态必为 `open`，包括已闭环的**。今日 0 行隐患来源，影响 0 |
| `hazard_record.status`（并行栈 B） | 服务层写 `pending / confirmed / processing / pending_review / closed`（`hazardRectificationService.js:76,189,237,453`） | 9 行，值**只有 `open`** —— 服务层从不写 `open` | **已证实不一致（邻接域）**：存量 9 行无一条可由现有服务产生。前端对 `hazard_record` 0 调用（B02 已证），故无用户可见影响 |
| `rectification_task.status` | `completed` 等 | — | 未纳入本轮 |

**方法学提示**：`hazards` 与 `hazard_record` 是两张不同表、两套状态机、同一业务域。任何"隐患状态"结论必须声明落在哪张表上，否则结论无法复核。

### 7.3 证据不足清单

| 编号 | 事项 | 为什么无法判断 |
|---|---|---|
| **E1** | Cloudflare 生产实际运行的 Worker 版本 | 仓库内无部署 SHA / `version_id` / `wrangler deployments` 落盘；`wrangler.toml` 无版本标记。**不得宣称生产在跑 `69c0d181` 版本** |
| **E2** | 110 行 `status` 的逐行来源链路 | 仅知：①全表 `created_at` 均为 2026-08-24（一次性导入）；②`p3-04-02-migrate-legacy-status.js` 存在且 DB 已无旧词汇（推断已执行）。**迁移执行时间、执行人、是否二次修改无日志可查** |
| **E3** | 是否有人/系统直接在飞书侧改过「处理状态」 | 需飞书审计日志，本轮未取（且是否开放该能力未验证） |
| **E4** | `processing` / `pending_review` 两条边在真实业务中是否可用 | DB 0 行历史 ⇒ 无成功案例、无失败案例、无耗时数据 |
| **E5** | `hse_filter_config` 的 6 态筛选器是否在 web-antd 等其他前端渲染 | 仅核查 `web-naive`（0 消费方）；其他应用未核查 |

---

## 8. 问题清单（三类分开）

### 8.1 已证实缺陷（确定性，有代码/数据双重证据）

| 编号 | 缺陷 | 影响面 | 严重度 | 证据 |
|---|---|---|---|---|
| **D1** | 声明式状态机 6 态 11 边 vs 实现 4 态 4 边（5 个写入动作）；`GET /rules/status-flow` 对外声明了 `assigned`/`expired`/`reopen`，系统均不支持 | 任何依据该接口实现的客户端/同步层 | **高** | `hazard-rule.json`；`hazardService.js:1389`；全仓无 `assigned` 写入 |
| **D2** | 驾驶舱「待整改隐患」卡片恒 0（配置 `key=assigned`；`byStatus` 无该键；补偿分支 `:193-195` 不可达） | 管理驾驶舱可见数字 | **高** | `hse_dashboard_card_config` 实证；`overview.js:165-166`；`cockpit-dashboard.vue:167-169,193-195` |
| **D3** | 治理状态筛选配置提供 `assigned`/`expired`，`list()` 等值匹配 → 恒 0 行；`discovered` 在该配置叫「待登记」 | 如该配置被消费则筛选全废 | **中**（消费方未证实，见 E5） | `hse_filter_config` 实证；`hazardService.js:487-491` |
| **D4** | `close()` 可从 `pending_review` 直达 `closed` 且**零验收证据**（不写 `hse_reviews` / `review_result` / `reviewer_id` / `review_date`）；与 `review(pass)` 共用同一目标状态 | 闭环口径、考核、审计追溯 | **高** | `hazardService.js:1099-1138`；全仓唯一 `INSERT INTO hse_reviews` 在 `:1059`；DB 60/60 零证据 |
| **D5** | 前端「关闭」按钮对 `status !== 'closed'` 全部显示，后端只接受 `pending_review` → 50 条现存 `discovered` 行点击必然失败 | 用户操作死路 | **中** | `index.vue:973`；`hazardService.js:1119,1130` |
| **D6** | 同一值 `已整改` 四处四种结果：`classifyStatus→closed`（死路径）/ `getStatusLabel→已关闭` / `statusToIsResolved→否` / 前端「已整改」+success / Worker→`待整改` | 历史数据回灌或同步接入时立刻显性化 | **中**（当前 0 行） | `hazardService.js:167,210,260`；`statusColors.ts:52`；`worker:3060` |
| **D7** | `stats().overdueCount` 用裸 `status != 'closed'`（NULL 排除），与 `sqlStatusOpen`（NULL 计未闭环）相反 | 逾期统计 | **低**（当前 0 NULL，潜伏） | `hazardService.js:623` vs `:233-235`；`todos.js:102-106` 已修同类问题 |
| **D8** | `hseEventSyncService.STATUS_MAP` 用中文键映射英文状态值 → 隐患事件状态恒 `open` | 事件中心一致性 | **低**（当前 0 行隐患来源，潜伏） | `hseEventSyncService.js:49-61,123,157`；DB 16 行全来自 `accidents` |
| **D9** | `hazards.status` **零 CHECK / 零 ENUM / 零触发器**，任意字符串可写入 | 数据质量底线 | **中** | §3.2 实证 |
| **D10** | `status` 上两个功能重复索引（`idx_haz_status` / `idx_hazards_status`） | 写放大，无收益 | **低** | §3.3 实证 |
| **D11** | 代码注释与库实证不符：`:150` 称"历史 110 行 status=未完成/已完成"、`:220` 称"历史 50 条 NULL" —— 实际 0 条旧词汇、0 条 NULL | 误导后续维护与审计 | **中** | §3.4 实证 vs 代码注释 |
| **D12** | `closed` 标签三处不一：筛选「关闭」/ 表格·卡片「已关闭」/ 后端 `statusLabel`「关闭」 | 用户认知 | **低** | `index.vue:124,868`；`statusColors.ts:44`；`hazardService.js:176` |

### 8.2 业务语义待确认（技术人员**不得**代为决定）

| 编号 | 待确认问题 | 为什么必须业务定 | 现状 |
|---|---|---|---|
| **B1** | Feishu「待整改」在 PG 应落 `discovered` 还是 `assigned`？ | PG 声明模型把"待登记"与"待整改"分两态（`assigned`），实现却把两者合并为 `discovered`；Feishu 只有一个「待整改」 | 实现=合并；声明=分离；**冲突** |
| **B2** | Feishu「待验收」是否等价 PG `pending_review`？ | 二者在流程位置相同，但 Feishu 是"安环部验收"、PG 是"复查"；验收主体与证据强度不同 | 未定 |
| **B3** | Feishu「已闭环」是否等价 PG `closed`？含"登记即闭环"（带整改后照片直接闭环）是否算闭环？ | 涉及闭环定义与考核口径 | 未定 |
| **B4** | PG `pending_review` 的业务名是"待复查"还是"待验收"？ | 决定与 Feishu 的映射方向，也决定 `review_result` 语义 | 未定 |
| **B5** | `已整改` 是否应等价 `closed`？ | 现四处不一致，必须选定唯一权威口径 | 未定 |
| **B6** | 「已超期」是**状态**还是**派生属性**？ | 声明式规则当状态（`expired`，有 `extendDeadline` 动作）；服务端当派生（`calcExpiryStatus`）；DB 无列。三者不可同时成立 | 未定 |
| **B7** | 是否允许 `closed → discovered` 重新开启（`reopen`）？ | 规则已声明，实现无路径；若需要则涉及 W2 开例外 | 未定 |

### 8.3 证据不足（不得写成结论）

见 §7.3 的 **E1–E5**。

---

## 9. 风险影响与下一步建议

### 9.1 风险按"是否已发生"排序

| 等级 | 风险 | 是否已发生 | 说明 |
|---|---|---|---|
| 🔴 高 | 闭环语义失真：60 条 `closed` 无任何验收证据 | **已发生** | 任何"闭环率/整改完成率"指标都不等于"验收通过率" |
| 🔴 高 | 驾驶舱「待整改」显示 0 | **已发生** | 管理层可见数字错误 |
| 🟠 中 | 「关闭」按钮必然失败（50 条） | **已发生** | 用户操作死路，且错误提示不解释原因 |
| 🟠 中 | 状态机声明与实现不一致 | 已存在 | 未来同步层/客户端会照抄错误规则 |
| 🟠 中 | DB 层零值域保护 | 已存在 | 任意写入不会被拒 |
| 🟡 低 | `已整改` 四处分歧、NULL 口径、事件映射 | **潜伏**（当前 0 行） | 一旦历史回灌或 Feishu 同步接入立刻显性化 |

### 9.2 下一步建议（**只提建议，本轮不实施**）

**必须先由业务定，技术不动**（B1–B7 全部）：

1. **B3 + B5 优先**：先定"什么算闭环"。这直接决定 D4 是修（补证据）还是接受（承认闭环=外部声明）。在 B3 未定前，**任何**基于 `status` 的完成率指标都应标注口径。
2. **B1 次之**：Feishu「待整改」的落点。这决定同步层是否需要区分 `discovered`/`assigned`；若业务确认"不需要待登记态"，则应在**声明层**删除 `assigned`，使 D1 与实现对齐 —— 而不是反过来新增 `assign` 动作。
3. **B6**：`expired` 归位。建议明确为**派生属性**（与 `calcExpiryStatus` 一致），并从规则 JSON 的 `statuses` 中移除，仅保留在 `transitions` 的 `extendDeadline` 语义里 —— 但这属业务/架构决策，非本轮结论。

**技术侧可独立推进（不需业务裁决，但需授权）**：

| 优先级 | 事项 | 涉及缺陷 | 风险 |
|---|---|---|---|
| P1 | 修正 `cockpit-dashboard.vue` 的 `hazard_pending` 取数（改用 `discovered` 或让 `byStatus` 输出 `assigned`） | D2 | 低，纯读 |
| P1 | 修正前端「关闭」按钮条件为 `status === 'pending_review'`（与后端一致） | D5 | 低，纯前端 |
| P2 | 补 `hazards.status` 的 CHECK 约束或应用层写前校验 | D9 | 中，需 DDL 授权 |
| P2 | 统一 `closed` 标签为「关闭」或「已闭环」（择一，全端统一） | D12 | 低 |
| P2 | 修正 `stats().overdueCount` 改用 `sqlStatusOpen` | D7 | 低 |
| P3 | 修正 `hseEventSyncService.STATUS_MAP` 支持英文 canonical | D8 | 低 |
| P3 | 更新 `hazardService.js:150,220` 过期注释 | D11 | 无 |
| P3 | 删除重复索引 `idx_haz_status` | D10 | 低，需 DDL 授权 |

**明确不建议做**（本轮证据不支持）：

- ❌ 不要为了"让 `assigned` 有数据"去新增 assign 服务端动作 —— 那是在实现一个业务未确认的状态；
- ❌ 不要把 `已整改` 直接映射为 `closed` —— 违反 B03-01-D-0 已确立的"不得把已整改直接映射为 closed"约束，且会伪造闭环证据；
- ❌ 不要修改 Worker 状态词表 —— 生产链路零改动边界；
- ❌ 不要用 `review_result` 反推补齐 60 条历史闭环 —— 那等于伪造验收证据。

---

## 10. 受限事项、执行失败与未执行的检查

### 10.1 未执行的检查与原因

| 项目 | 原因 |
|---|---|
| `p3-04-00-status-safety.test.js`（状态安全验收脚本） | 该脚本会向 dev 库 `INSERT` 测试隐患（`:166,328,514`）并 `DELETE` 清理（`:116-125`），**属 DML**，违反本轮"禁止 DML"硬约束 → **未运行** |
| `p3-04-01-signoff-factcheck.js` / `p3-04-02-post-verify.js` | 同上，含写操作/依赖既有迁移上下文 → 未运行 |
| 其他 `npm --prefix server test` | 与状态无关且基线已知 3 用例失败（改造前即存在），本轮不引入噪声 → 未运行 |
| 飞书生产 API 只读核验 | 本轮范围为源码+DB；未取得飞书只读凭证，且生产链路零接触 → 未调用 |
| Cloudflare 部署版本核验 | 无 `wrangler` 凭证/部署记录 → 未核实（E1） |
| web-antd 等其他前端 | 未在核查范围 → 未核实（E5） |

**没有任何测试结果被描述为"通过"** —— 本轮**未运行任何测试**。

### 10.2 执行失败与绕过

| 失败 | 处置 |
|---|---|
| `pg_rules` 查询使用不存在的 `ev_enabled` 列 → `ERROR: 字段 "ev_enabled" 不存在`，因 `ON_ERROR_STOP=1` 中断后续 A7–A9 | 拆分为独立脚本重跑，改用 `pg_rules` 实际列（`schemaname/tablename/rulename/definition`），结果见 §3.2 |
| 无其他执行失败 | — |

### 10.3 报告与日志中的凭据

- 本报告**未包含**任何口令、令牌、连接串、密钥；
- 数据库连接口令通过 shell 变量注入 `PGPASSWORD`，**未落盘、未打印**；
- 发现的凭据风险：`server/scripts/p3-04-00-status-safety.test.js:32` 存在**明文数据库口令硬编码**（内容不在本报告重复），仓库为 PUBLIC。属既有 P0 级安全问题（与 B 系列已登记项一致），**本轮未改动、未轮换**，仅登记位置。

---

## 11. 本轮变更声明

| 项目 | 数量 | 说明 |
|---|---|---|
| 业务代码修改 | **0** | 未编辑任何 `.js` / `.vue` / `.ts` / `.json` |
| 前端页面修改 | **0** | — |
| 配置文件修改 | **0** | — |
| DDL | **0** | 未建表/改表/加索引/加约束 |
| DML | **0** | 未 `INSERT/UPDATE/DELETE`，未回填 |
| 数据库迁移 | **0** | — |
| 部署 / 发布 | **0** | 未触碰 Cloudflare / Pages / Worker |
| 生产数据库操作 | **0** | 未连接 `safety_dashboard` |
| 飞书写入 | **0** | 未调用 |
| H5→Worker→Feishu 生产链路 | **未改动** | 零接触 |
| 数据库只读查询 | **9 组** | 全部 `SELECT`，首条均断言 `current_database()` |
| `git add .` | **未使用** | 仅按显式路径暂存本报告 |
| `git reset/restore/checkout/强制推送` | **未使用** | — |
| 工作区既有 153 项改动 | **未触碰** | 未覆盖、未清理、未暂存 |
| `server/routes/cost.js` | **未变** | 状态 `A`，md5 `e88ae2b0b275346dfc1431408aa00bff` |

---

## 12. 附录：证据索引

### 12.1 数据库查询脚本（9 组，全部只读）

| 组 | 目的 | 关键结果 |
|---|---|---|
| A1 | 连接目标断言 | `safety_dashboard_dev` / `hse_app` / PG 17.10 |
| A2 | `status` 定义、CHECK、全部约束、索引、触发器、ENUM、值分布 | varchar(16)/可空/默认 discovered；0 CHECK；0 触发器；2 重复索引 |
| A3 | rules、值分布、NULL/空串、长度异常、status×is_deleted | closed 60 / discovered 50；0 NULL / 0 空串 |
| A4 | `deadline*` 列存在性与 `deadline_date` 可用性 | 三列均存在；`deadline_date` 可用但 0/110 |
| A5 | closed 行证据填充率、`hse_reviews`/`hse_rectifications` 行数 | **60/60 零证据**；两表均 0 行 |
| A6 | `hse_dashboard_card_config` / `hse_filter_config` 隐患行 | `key=assigned`；6 态筛选配置 |
| A7 | `hazard_record` 状态分布、`hazards` 是否有 `department`、旧词汇残留 | `hazard_record` 9 行全 `open`；`hazards` 无 `department`；旧词汇 0 |
| A8 | `hse_events` 与 `hazards` 关联、事件状态分布 | 关联 0 行；16 行全来自 `accidents` |
| A9 | `hse_events` 结构与全量 | source_table 全部 `accidents` |

### 12.2 代码位置索引

| 文件 | 关键行 | 内容 |
|---|---|---|
| `server/services/hazardService.js` | 138-148 | `HAZARD_STATUS` 四值 |
| 同上 | 150-159 | `STATUS_MAP` legacy |
| 同上 | 161-169 | `NON_LIFECYCLE_STATUS`（含 `已整改→closed`） |
| 同上 | 172-177 | `STATUS_LABEL`（`closed→关闭`） |
| 同上 | 179-200 | `classifyStatus`（**无调用点**） |
| 同上 | 202-204 | `isCanonicalStatus`（**无调用点**） |
| 同上 | 206-213 | `getStatusLabel`（`已整改→已关闭`） |
| 同上 | 215-235 | `sqlStatusClosed` / `sqlStatusOpen` |
| 同上 | 253-262 | `statusToIsResolved`（`已整改→否`） |
| 同上 | 312-360 | `formatRow`（`:317` isResolved、`:329` status 原样透传） |
| 同上 | 447-449 / 487-491 | `list()` 状态筛选（内存/DB，均等值匹配） |
| 同上 | 538-641 | `stats()`（`:559-562` 四态计数、`:623` 裸 `!= 'closed'`） |
| 同上 | 754-756 | W1 创建封口 |
| 同上 | 788-798 | `INSERT` 20 列（status 恒 discovered） |
| 同上 | 843-847 | W2 更新封口注释 |
| 同上 | 934-967 | `rectify` |
| 同上 | 971-995 | `submitReview` |
| 同上 | 999-1094 | `review`（`:1058-1077` 唯一 `INSERT hse_reviews`） |
| 同上 | 1096-1138 | `close`（零证据闭环） |
| 同上 | 1389 | `rulesStatusFlow` |
| `server/routes/hazards/main.js` | 17-60 | 全部端点与权限码 |
| `server/routes/overview.js` | 33 / 92 / 165-166 / 167 / 170-173 / 226 | 总览统计与 `byStatus` 构造、`/cards` |
| `server/routes/todos.js` | 102-112 | `sqlStatusOpen` 用法（含历史修复注释） |
| `server/routes/dashboard.js` | 120-133 | `status='closed'` KPI + `department`（`hazards` 无此列） |
| `server/config/hseRules/hazard-rule.json` | `statusFlow` | 6 态 11 边声明 |
| `server/config/hseRules/index.js` | 167-171 | `getHazardStatusFlow` |
| `server/init-hazard-module.js` | 24 / 68-72 | `assigned` 选项与卡片参数（**未被引用**） |
| `server/services/hseEventSyncService.js` | 49-61 / 123 / 157 | 中文键 `STATUS_MAP` → 事件恒 `open` |
| `server/services/hazardRectificationService.js` | 76-77 / 189 / 237 / 453 | `hazard_record` 并行状态机 |
| `安全看板vben/.../views/hazards/index.vue` | 120-125 / 140 / 152 / 858-868 / 932-935 / 945-975 / 1503-1506 | 筛选、卡片、状态列、按钮 |
| `安全看板vben/.../components/hse/statusColors.ts` | 25-51 | 前端状态标签/色 |
| `安全看板vben/.../api/hse/hazard.ts` | 11 / 38 | `HazardStatus` 类型 |
| `安全看板vben/.../analysis/cockpit-dashboard/index.vue` | 166-169 / 193-195 / 204 | `byStatus` 取数与不可达补偿 |
| `grid-mobile-cloudflare/worker/index.js` | 2954 / 2962-2963 / 3055-3061 / 3321 / 3327-3332 / 3827-3839 / 3898-3924 | Worker 3 态与四处写 |
| `grid-mobile-cloudflare/frontend/check.app.js` | 5079-5085 | H5 状态徽标 |
| `grid-mobile-cloudflare/worker/wrangler.toml` | 116 | `FS_HAZARD_TABLE_ID` |

### 12.3 触发本报告的数据指纹（可复算）

```
hazards:           110 行 | closed 60 | discovered 50 | NULL 0 | 空串 0 | 旧词汇 0
closed 行证据:     fix_date 60/60 | rectify_date 0 | review_date 0 | reviewer_id 0 | review_result 0 | rectification 0
hse_reviews:       0 行
hse_rectifications:0 行
hse_events:        16 行（全部 source_table='accidents'）| open 12 / processing 3 / closed 1
hazard_record:     9 行，status 仅 'open'
配置:              hazard_pending → {key:'assigned', field:'byStatus'}；筛选 status 6 选项含 assigned/expired
```

---

**报告结束。**
本轮为只读审计，未修改任何业务代码、未执行 DDL/DML、未部署、未接触生产环境。
是否修改、如何修改、先确认哪条业务规则，请你裁决。
