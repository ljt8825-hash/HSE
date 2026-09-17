# CF-WPS-06：employee_code 巡查归因链最小实现与 sync_hash 不变量验证报告

- **阶段**：CF-WPS-06（CF-WPS-05 PASS 后的最小实现阶段）
- **执行时间**：2026-09-15 16:2x–16:5x（GMT+8）
- **目标库**：`safety_dashboard_dev`（隔离开发库）
- **生产库**：`safety_dashboard` —— **本阶段零改动（DDL/DML 均未执行）**
- **最终状态**：**CF-WPS-06_STATUS = PASS**

---

## 1. 阶段目标

只做两件事：

1. 在既有 `grid_inspection_records` 上增加 **`employee_code` 业务快照列**（花名册员工编码）；
2. 建立并验证 **`employee_code → public.employee.id → grid_id`** 的安全归因链。

明确不做（本阶段禁止且实际未做）：短信登录 / OTP / Cloudflare Worker / Pages / 独立 H5 / 移动端完整 UI / WPS OAuth 启用 / 新身份认证体系 / 三违 / PC 网格管理重构 / PC 台账重构 / 权限重构。
WPS OAuth 身份路线保持 `ARCHIVED_FOR_CURRENT_MOBILE_IDENTITY`。

**铁律达成**：`inspector_employee_id` 永远只保存 `employee.id`（BIGINT）；不存在任何 `employee_code → inspector_employee_id` 直接赋值路径。

---

## 2. 实际修改文件

| # | 文件 | 类型 | 说明 |
|---|------|------|------|
| 1 | `server/services/wps/wpsFieldMap.js` | **M** | 新增 WPS「员工编码」→ PG `employee_code` 映射；投影末尾追加该列；新增冻结 hash 段 fail-fast 护栏 |
| 2 | `server/services/wps/gridEnrichmentService.js` | **M** | 接入 `employee_code` 业务身份路径（复用既有富化入口，不新建第二套机制） |
| 3 | `server/services/gridEmployeeCodeResolver.js` | **A（新）** | `employee_code → employee.id → grid_id` 唯一解析器 + 受护栏写计划 |
| 4 | `server/sql/20260915_cf06_gir_employee_code.sql` | **A（新）** | 最小 migration（列 + 部分索引 + 3 项断言） |
| 5 | `server/services/__tests__/gridEmployeeCodeResolver.unit.test.js` | **A（新）** | 31 项单测 |

Git 取证（`git status --porcelain`，仅本阶段相关项）：

```
 M server/services/wps/gridEnrichmentService.js
 M server/services/wps/wpsFieldMap.js
?? server/services/__tests__/gridEmployeeCodeResolver.unit.test.js
?? server/services/gridEmployeeCodeResolver.js
?? server/sql/20260915_cf06_gir_employee_code.sql
```

**修改范围合规性证明**（禁改模块未被本阶段触碰，按 mtime 取证）：

| 抽查禁改文件 | 最后修改时间 | 结论 |
|---|---|---|
| `server/services/assessmentEventService.js` | 2026-09-14 18:29 | 历史遗留 `M`，非本阶段 |
| `server/services/assessmentScheduler.js` | 2026-09-14 15:21 | 历史遗留 `M`，非本阶段 |
| `安全看板vben/.../api/hse/violations.ts` | 2026-09-14 06:41 | 历史遗留 `M`，非本阶段 |

`server/.env` **未被改动**（`git status` 无输出），`DB_NAME` 仍为 `safety_dashboard`。
本阶段真正写入的已跟踪文件仅有 `wpsFieldMap.js` 与 `gridEnrichmentService.js` 两个。

---

## 3. Migration 内容

文件：`server/sql/20260915_cf06_gir_employee_code.sql`（幂等、单事务、含断言 STOP）

```sql
BEGIN;

-- 1) 业务快照列（nullable，无默认值 ⇒ 存量行保持 NULL，零业务行为改变）
ALTER TABLE public.grid_inspection_records
  ADD COLUMN IF NOT EXISTS employee_code varchar(64) NULL;

COMMENT ON COLUMN public.grid_inspection_records.employee_code IS
  '花名册员工编码（WPS「员工编码」业务快照，移动端业务身份键）。非身份列：严禁写入 inspector_employee_id；须经 gridEmployeeCodeResolver 解析为 public.employee.id 后方可用于归属。不参与 sync_hash（位于 18 列冻结 hash 段之外）。';

-- 2) 候选扫描用部分索引（仅覆盖「未归属」行，随归因完成自动缩小）
CREATE INDEX IF NOT EXISTS idx_gir_employee_code_pending
  ON public.grid_inspection_records(employee_code)
  WHERE employee_code IS NOT NULL
    AND inspector_employee_id IS NULL
    AND grid_id IS NULL;

-- 3) 断言：列必须存在且类型必须为 varchar（防静默漂移）
DO $$ ... IF v_type IS NULL THEN RAISE EXCEPTION ...$$;

-- 4) 断言：employee_code 不得出现在任何 FK / UNIQUE 约束中（它是快照，不是主数据键）
DO $$ ... IF v_cnt > 0 THEN RAISE EXCEPTION ...$$;

COMMIT;
```

设计要点：

- **不建 FK**：`employee_code` 是业务快照，不是主数据键；若建 FK 会强制"必须存在于花名册"，与"移动端可能提交未知编码 → 必须 fail-closed 而不是报错"的语义冲突。
- **索引有据**：唯一真实查询模式为归因任务候选集（`source_channel='mobile_h5' AND employee_code IS NOT NULL AND inspector_employee_id IS NULL AND grid_id IS NULL`），故建**部分索引**而非全量索引，无理由的索引一律不加。
- **可回退**：回退脚本见文件末尾（DROP INDEX → DROP COLUMN），纯新增可空列，回退不影响任何既有列 / sync_hash / 映射表。

---

## 4. employee_code 解析器设计

文件：`server/services/gridEmployeeCodeResolver.js`（新，275 行）

### 4.1 唯一解析入口 `resolveByEmployeeCode(employeeCode, { client })`

| 步骤 | 规则 | 结论 |
|---|---|---|
| 1 | `trim()` | — |
| 2 | 空值 / 纯空白 | `pending(empty_employee_code)` |
| 3 | `SELECT id FROM public.employee WHERE employee_code=$1 AND is_deleted=false ORDER BY id` | — |
| 4 | **0 行** | `pending(unknown_employee_code)` |
| 5 | **1 行** | 继续 |
| 6 | **>1 行** | `pending(multiple_employee_match)` ← 绝不任选其一 |
| 7 | bigint 由 node-pg 返回字符串 → 显式校验安全整数且 `^\d+$` | 否则 `pending(invalid_employee_id)` |
| 8 | `gridScope.deriveGridIdForEmployee(employeeId)` | — |
| 9 | `no_grid` | `pending(no_grid)` |
| 10 | `multiple` | `pending(multiple_grid)` ← 禁止猜测网格 |
| 11 | `ok` | `attributed(employeeId, gridId)` |

查询异常一律 `pending(lookup_error)`（fail-closed，不抛错、不中断批处理）。

### 4.2 写计划 `buildEmployeeCodeWritePlan(record, resolution)`（纯函数，所有覆盖护栏集中于此）

允许写入的**唯一**条件（**全部**满足）：

1. 解析结论 `status === 'attributed'`；
2. `record.source_channel === 'mobile_h5'`（本次新移动端链路）；
3. `record.inspector_employee_id == null`；
4. `record.grid_id == null`；
5. `record.employee_code` 非空。

任一不满足 → 写计划为空。**不存在"只补一个"的旁路**。

```js
// 关键：写下的是 employee.id（BIGINT），永远不是 employee_code
writes: { inspector_employee_id: Number(res.employeeId), grid_id: Number(res.gridId) }
```

### 4.3 受护栏写入 `applyWritePlan` —— SQL 层双重断言

```sql
UPDATE grid_inspection_records
   SET inspector_employee_id = $1, grid_id = $2, updated_at = NOW()
 WHERE id = $3
   AND inspector_employee_id IS NULL      -- ← SQL 层再次断言
   AND grid_id IS NULL;                   -- ← SQL 层再次断言
```

Node 侧护栏 + SQL 侧护栏双重保险，任何并发/竞态下都不可能覆盖已有归属；且**禁止部分写入**（缺任一列直接返回 0，不执行 UPDATE）。

### 4.4 批量入口 `attributePendingByEmployeeCode`

候选集在 **SQL 层**硬限定：

```sql
WHERE source_channel = 'mobile_h5' AND employee_code IS NOT NULL
  AND inspector_employee_id IS NULL AND grid_id IS NULL
LIMIT $n
```

⇒ 结构上**不可能**触碰历史记录（历史 `source_channel` 全为 `NULL`）。支持 `dryRun`（只产出计划，零写入）与 `ids` 精确限定。

---

## 5. WPS Field Map 修改

仅在第 1 步 hash 验证明确 PASS 后执行。

### 5.1 FIELD_MAP 新增（复用既有命名规范，无 `employeeCode` 双轨）

```js
{ wps: '员工编码', biz: 'employee_code', pg: 'employee_code', type: 'text', mode: 'readonly',
  note: '花名册员工编码（移动端业务身份键，业务快照）。非身份列；归因须经 gridEmployeeCodeResolver → employee.id；不参与 sync_hash' }
```

代码内部统一使用 `employee_code`，**未引入** `employeeCode` 第二套概念。

### 5.2 SYNC_PROJECTION_ORDER 末尾追加（第 24 位）

```js
const SYNC_PROJECTION_ORDER = [
  // —— 冻结 hash 口径（18 列，顺序不可变）——
  'nickname','area_team','personnel_name','position','grid_level','inspection_date',
  'violation_behavior','violator_name','violator_gender','violator_age',
  'signup_today','marker','is_resubmit','upload_time','serial_no',
  'image_content','rectified_photo','schematic',
  // —— 非 hash 业务列（5 列）——
  'report_status','vehicle_type','violation_type_result','need_rectification','rectifier',
  // —— 非 hash 移动端业务快照列（CF-WPS-06）——
  'employee_code',                    // ← 第 24 位，仅此处允许追加
];
```

### 5.3 新增机器级 fail-fast 护栏

```js
const FROZEN_HASH_SEGMENT = Object.freeze([ /* 18 列字面量，绝对不可修改 */ ]);
if (SYNC_PROJECTION_ORDER.slice(0, 18).join('|') !== FROZEN_HASH_SEGMENT.join('|')) {
  throw new Error('wpsFieldMap 冻结口径违规：SYNC_PROJECTION_ORDER 前 18 列必须与 FROZEN_HASH_SEGMENT 完全一致。...');
}
```

任何"插入 / 删除 / 换位"都会在**进程启动时直接抛错**，彻底杜绝"悄悄改变 hash 口径 → 存量 2061 条被误判为已变更 → 误 UPDATE"。

### 5.4 `mode: 'readonly'` 的正确语义

`mode: 'readonly'` 指 **PG 侧只读**（不反向写回 WPS 板）；在 **WPS → PG 同步方向**上，`wpsGridPullEngine` 仍会把「员工编码」写入 PG `employee_code`。**该列不在 `PROTECTED_COLUMNS` 中**，与 `inspector_employee_id` / `grid_id` 严格区分。

---

## 6. Pull Engine 是否修改

**未修改。零改动。**

`server/services/wpsGridPullEngine.js` 本阶段**一行未动**（不在 `git status` 修改列表中）。

`PROTECTED_COLUMNS` 设计完整保留：

| 项 | 状态 |
|---|---|
| `PROTECTED_COLUMNS = ['grid_id','inspector_employee_id']` | 未变 |
| `toCanonicalDto` 中 `for (const col of PROTECTED_COLUMNS) delete dto[col];` | 未变 |
| `PROTECTED_COLUMN_WRITE_FORBIDDEN` 守卫 | 未变 |
| Pull Engine 直写 `inspector_employee_id` | **否** |
| Pull Engine 直写 `grid_id` | **否** |

**新流程（符合任务书 §六）**：

```
WPS Pull ──► employee_code（普通业务字段，非 protected）
        ──► PG grid_inspection_records.employee_code
        ──► 独立 enrichment / gridEmployeeCodeResolver
        ──► employee_code → public.employee.id
        ──► gridScope.deriveGridIdForEmployee(employee.id)
        ──► 安全补齐 inspector_employee_id + grid_id（仅当两列同 NULL）
```

### 6.1 接入既有富化链（未新建第二套机制）

`gridEnrichmentService.js` 内新增：

- `resolveAttributionByEmployeeCode(record, ctx)` —— **只做结果封装**，解析唯一实现来自 `gridEmployeeCodeResolver`；
- `resolveAttribution` 优先级调整：记录带非空 `employee_code` 时走新路径（优先级高于 WPS creator 账号桥接），因为 `employee_code` 是移动端**显式提交**的业务身份键；
- 新增两个 pending 细分状态（不改变既有状态语义）：`PENDING_EMPLOYEE_CODE`、`PENDING_CODE_GRID`；
- 既有 `UNTRUSTED`（共享账号 creator）判定**保持最高优先级**不变。

历史记录（无 `employee_code`）行为完全不变（仍走原 `PENDING_CREATOR` 等路径）。

---

## 7. hash 验证结果

### 7.1 代码证据（第一步 A–D）

**A. 前 18 列到底是不是 hash 输入 —— 是。**
`SYNC_HASH_COLUMNS = SYNC_PROJECTION_ORDER.slice(0, 18)`，`SYNC_HASH_COLUMN_COUNT = 18`。
`SYNC_PROJECTION` 构造时 `const hash = SYNC_HASH_COLUMNS.includes(pg);`（`wpsFieldMap.js`）。

**B. 第 19 列以后是否完全不参与 hash —— 是。**
两处 hash 函数**均**以 `p.hash` 为唯一闸门：

```js
// wpsGridPullEngine.js:147 toLegacyHashDict
for (const p of SYNC_PROJECTION) { if (!p.hash) continue; ... }
// wpsGridPullEngine.js:163 canonicalHash
for (const p of SYNC_PROJECTION) { if (!p.hash) continue; ... }
```

`employee_code` 的 `hash` 恒为 `false` ⇒ 在两处均被 `continue` 跳过。
**并非**"硬编码只迭代前 18 个下标"，而是**由 `hash` 标志驱动**，因此"末尾追加"策略天然安全。

**C. 新增 employee_code 放在哪里不会改变历史 hash —— 第 19 位及之后（本实现取第 24 位）。**
`SYNC_PROJECTION_ORDER` 位置敏感：`slice(0,18)` 一旦被插入/换位即漂移。

**D. CF-WPS-05「非 hash 段追加」结论成立 —— 成立，且已用代码证据 + 实测双重确认。**

**E. 是否需停止实现 —— 不需要（未触发 `ARCHITECTURE_DECISION_REQUIRED`）。**

### 7.2 实测证据（真实 WPS 源，R1–R5）

脚本：`_cf06_hash_regression.cjs`（只读；目标库 `safety_dashboard_dev`）

| 用例 | 内容 | 结果 |
|---|---|---|
| C0 | 独立重实现哈希函数与 `engine.canonicalHash` 逐字节等价 | **PASS**（n=2063） |
| **R1** | 存量 `sync_hash`（18 列口径 · WPS 源）全量命中 | **PASS 2061/2061，miss=0** |
| **R2** | 追加 `employee_code`（第 24 位）后 hash 完全不变 | **PASS 2061/2061** |
| **R3** | WPS 记录新增「员工编码」字段后 hash 完全不变 | **PASS 2061/2061** |
| **R4** | 负对照：`employee_code` 插入 hash 段 → 哈希必须**全部改变** | **PASS same=0/2061** |
| R1b | WPS-only 记录（BT/EA）无映射 | PASS noMap=2 |
| R5 | `toCanonicalDto` 永不产出 `grid_id` / `inspector_employee_id` | PASS violations=0 |
| Z1 | 本轮零写入：`grid_inspection_records` 不变 | PASS |
| Z2 | 本轮零写入：`grid_record_sync_map` 不变 | PASS |

**TOTAL = 9 / PASS = 9 / FAIL = 0**

R4 负对照是关键：它证明"位置敏感"是真实的——若把 `employee_code` 插到第 1 位，2061 条哈希**全部改变**。这正是"必须末尾追加"的实证依据。

---

## 8. 测试结果

### 8.1 单元测试（jest）

`server/services/__tests__/gridEmployeeCodeResolver.unit.test.js`

```
Test Suites: 1 passed, 1 total
Tests:       31 passed, 31 total
```

| 分组 | 用例 | 结果 |
|---|---|---|
| 解析器 | T1 valid → attributed / T1b trim / T2 empty（null/""/空白） / T3 unknown(0行) / T4 deleted / T5 multiple match / T5b 非法 id / T5c 查询异常 fail-closed / T6 no grid / T7 multiple grid | 10/10 PASS |
| 覆盖护栏 | T8 已有 inspector / T8b 已有 grid / T8c SQL 层双断言 / T8d 禁部分写入 / T8e 非 mobile_h5 不归因 | 5/5 PASS |
| 双键铁律 | T9 写入的是 employee.id 不是 employee_code / T9b 投影与 DTO 永不产出受保护列 / T9c 唯一命名无双轨 | 3/3 PASS |
| hash 不变量 | T10a 冻结列数恒 18 且逐字节一致 / T10b employee_code 位于非 hash 段 / T10c 追加后 canonicalHash 逐字节不变 / T10d 同 PG 行重算与 dto 中 employee_code 无关 | 4/4 PASS |
| 富化链接入 | E1–E9 | 9/9 PASS |

### 8.2 真机 E2E（`safety_dashboard_dev`，单事务 + ROLLBACK + 事务外基线复核）

脚本：`_cf06_e2e.cjs`

```
TOTAL=19  PASS=19  FAIL=0
```

| 用例 | 任务书要求 | 结果 |
|---|---|---|
| **A** | valid employee_code → employee.id → grid_id | PASS（`employee_code=00179501` → `employee.id=6692` → `grid_id=1`） |
| **A2** | `inspector_employee_id` 是 BIGINT 而非编码 | PASS（写入 `6692`，非 `00179501`） |
| **B** | employee_code 不存在 → pending | PASS（`unknown_employee_code`，两列保持 NULL） |
| **C** | employee_code 为空 → pending | PASS（`empty_employee_code`） |
| **D** | 停用员工 → pending | PASS（`is_deleted=true` 编码 `TESTPW001` → `unknown_employee_code`） |
| **E** | multiple grid → pending | PASS（事务内构造第 2 个 live 网格 → `multiple_grid`，两列 NULL） |
| **E2** | 拆除 synthetic 网格还原基线 | PASS（liveGrids=1） |
| **F** | 已有 inspector_employee_id → 不覆盖 | PASS（`already_attributed`，原值 `6693` 未变） |
| **G** | 已有 grid_id → 不覆盖 | PASS（`already_grid_bound`，`inspector` 保持 NULL） |
| **H** | employee_code 正常但无网格 → 不归因 | PASS（`no_grid`） |
| **I** | 非 mobile_h5 来源不进候选集 | PASS（candidates=0，禁止历史回填） |
| **J** | 批量入口只处理「mobile_h5 + 两列 NULL」 | PASS（candidates=4，恰为 B/D/E/H） |
| **K** | dryRun 只产出计划不写库 | PASS（attributed=1，行仍 NULL） |
| **L** | 全表扫描不触碰任何历史记录 | PASS（histNull 329→329，候选集恰为 mobile_h5 子集，applied=0） |
| **M** | `enrichAfterInsert` 走 employee_code 路径 | PASS（`ATTRIBUTED`，writes 含 `inspector_employee_id=6692`、`grid_id=1`） |
| **Z1–Z3** | ROLLBACK 后基线完全一致 | PASS（gir 2062/insp 10/grid 1734 不变；sync_map 2061；grid_areas 62） |

> 说明：`E` 用例的"多网格"在 dev 库无自然样本（无任一在职员工持有 2 个 live 网格），故在**事务内临时构造** synthetic 第 2 网格并在用例后立即删除，最终 `ROLLBACK`；`Z1–Z3` 证明零残留。

### 8.3 Pull Engine dryRun（dev 库，新列已存在）

脚本：`_cf06_pull_dryrun.cjs`

```
TOTAL=7  PASS=7  FAIL=0
```

| 用例 | 结果 |
|---|---|
| S1 `SYNC_PROJECTION` 不含 `grid_id`/`inspector_employee_id` | PASS |
| S2 `employee_code` 在投影中且 `hash=false` | PASS |
| S3 冻结 hash 段仍为 18 列且不含 `employee_code` | PASS |
| P1 dryRun 成功执行（errors=0，无 `PROTECTED_COLUMN_WRITE_FORBIDDEN`） | PASS |
| P2 写入计划不含受保护列（protectedMentions=0） | PASS |
| P3 整轮零写入：`grid_inspection_records` 统计不变 | PASS |
| P4 整轮零写入：`grid_record_sync_map` 不变 | PASS |

dryRun 实测输出：`totalWps=2063, pulled=2063, inserted=0, updated=0, skippedUnchanged=2061, skippedExcluded=2, errCount=0`。
（`imageWarnings=200` 为既有图片 URL 告警，与本阶段无关，且未写入任何数据。）

### 8.4 汇总

| 套件 | 总数 | 通过 | 失败 |
|---|---|---|---|
| 单元测试（jest） | 31 | **31** | 0 |
| 真机 E2E | 19 | **19** | 0 |
| hash 回归 | 9 | **9** | 0 |
| Pull dryRun | 7 | **7** | 0 |
| **合计** | **66** | **66** | **0** |

---

## 9. fail-safe 验证

任务书 §九 A–H 全部通过（见 §8.2）。核心 fail-closed 矩阵：

| 情形 | 解析结论 | 是否写库 |
|---|---|---|
| employee_code 有效 + 唯一网格 | `attributed` | **写**（仅当两列同 NULL） |
| employee_code 不存在（0 行） | pending | 否 |
| employee_code 为空 | pending | 否 |
| employee_code 对应停用员工 | pending | 否 |
| employee_code 命中 >1 在职行 | pending | 否（绝不任选其一） |
| employee.id 非法/非安全整数 | pending | 否 |
| 该员工 0 个 live 网格 | pending | 否 |
| 该员工 >1 个 live 网格 | pending | 否（禁止猜测） |
| 已有 `inspector_employee_id` | 不覆盖 | 否 |
| 已有 `grid_id` | 不覆盖 | 否 |
| `source_channel != 'mobile_h5'` | 不进候选集 | 否 |
| 查询异常 | pending | 否（不抛错） |

**结构级 fail-closed**：批量候选集 SQL 硬限定 `source_channel='mobile_h5' AND inspector_employee_id IS NULL AND grid_id IS NULL`，从查询层就排除了历史数据与已归属数据。

---

## 10. 数据库是否实际执行 migration

| 库 | `employee_code` 列 | `idx_gir_employee_code_pending` | 说明 |
|---|---|---|---|
| `safety_dashboard_dev` | **1（已创建）** | **1（已创建）** | ✅ **本阶段已执行**（唯一合规写入目标） |
| `safety_dashboard`（生产） | **0（不存在）** | **0（不存在）** | ❌ **未执行**（符合任务书 §十二） |

dev 库执行取证：

```
[CF06] 目标库 = safety_dashboard_dev（隔离开发库）
[CF06] 迁移前 employee_code 列 = （不存在）
[CF06] 迁移执行成功（含断言）
[CF06] 迁移后列 = {"column_name":"employee_code","data_type":"character varying","character_maximum_length":64,"is_nullable":"YES"}
[CF06] 部分索引 = idx_gir_employee_code_pending
[CF06] employee_code 落入 FK/UNIQUE 约束数 = 0 (必须为 0)
[CF06] 表统计 = {"total":2062,"has_code":0,"mobile":0}
```

`has_code=0` 表明：迁移后**全部存量 2062 行 `employee_code` 仍为 NULL**，零业务行为改变（无历史回填）。

迁移执行器 `_cf06_apply_migration_dev.cjs` 内置硬护栏：目标库名必须严格等于 `safety_dashboard_dev`，`safety_dashboard` 被显式列入拒绝名单；并在连接后二次校验 `current_database()`。

未执行项：**生产 DDL**（须项目负责人单独授权后走生产变更护栏）。

---

## 11. 生产环境是否修改

**否。生产环境零改动。**

| 检查项 | 结果 |
|---|---|
| 生产库 DDL（`employee_code` 列 / 索引） | **未执行**（生产库实测列数=0、索引数=0） |
| 生产数据批量回填 | **未执行** |
| 生产库 DML | **未执行**（所有验证脚本均在 dev 库运行；hash 回归为只读且断言零写入） |
| `server/.env` | **未修改**（`DB_NAME` 仍为 `safety_dashboard`） |
| Cloudflare 部署 / Worker 部署 | **未执行** |
| WPS OAuth 启用 / SMS 服务 / H5 发布 | **未执行** |
| 生产后端重启 | **未执行** |

> 说明：本阶段所有写入操作（migration + E2E 用例）均限定在 `safety_dashboard_dev`；E2E 的写入还额外包裹在单事务内并最终 `ROLLBACK`，`Z1–Z3` 证明零残留。

---

## 12. 未完成事项

1. **生产迁移未执行** —— 需项目负责人授权后走生产变更护栏（独立事务 + 断言 STOP + 演练先行）。当前状态：migration 脚本已就绪，仅 dev 已执行。
2. **归因链未接线到运行时常驻流程** —— `attributePendingByEmployeeCode` 已实现并验证，但**未**挂入任何定时任务 / 同步后钩子（本阶段任务书未要求，且 WPS OCR 侧尚不产生「员工编码」）。
3. **WPS 板「员工编码」字段尚未实际填充** —— R3 验证显示真实 WPS 记录中该字段存在但尚未有值（`empCodeFieldPresentInWpsBoard=0`），故 `employee_code` 落库链路处于"已通但无数据"状态。
4. **`mobile_h5` 来源尚无真实生产者** —— 移动端 H5 未开发（本阶段禁止），故 dev 库 `mobile=0`；E2E 用例为事务内构造数据。
5. **`wps_account_employee_map` 未标记 deprecated** —— 按 §十保持现状，未打标、未删除（仅在本报告记录其已被 employee_code 路径取代的地位）。
6. **`grid_inspection_records` 是否需要 `employee_code` 唯一性/校验约束** —— 有意未加（快照列语义），如后续业务需要另行评估。

---

## 13. 下一阶段建议

按任务书 §十五，本阶段完成即停止，**不自动进入 CF-WPS-07**。以下为**建议**，须由项目负责人单独授权：

1. **CF-WPS-07（建议：生产变更）** —— 将本 migration 以生产护栏流程应用到 `safety_dashboard`：dev 已演练 + 断言齐备 + 回退脚本就绪，可直接复用。
2. **归因链接线** —— 在 WPS 同步完成钩子或独立定时任务中调用 `attributePendingByEmployeeCode({ dryRun:false, limit:N })`；建议首轮先以 `dryRun` 观察 `byReason` 分布再放开写入。
3. **移动端 H5 最小闭环（前置依赖）** —— 只有 H5 能提交 `employee_code` 并落 `source_channel='mobile_h5'` 后，本条归因链才会有真实流量；建议作为独立阶段（含手机号+短信+花名册校验）单独立项。
4. **可观测性** —— 建议为归因结果增加计数指标（`attributed / pending by reason`），便于运维定位"为何某条未归属"。
5. **文档同步** —— 建议在 WPS 字段映射文档中登记第 24 列（`employee_code`）与冻结 hash 段边界。

---

## 14. 最终状态

```
CF-WPS-06_STATUS = PASS
```

判定依据（全部满足）：

| 验收项 | 结果 |
|---|---|
| 第一步 hash 前置验证 PASS（未触发 `ARCHITECTURE_DECISION_REQUIRED`） | ✅ |
| `employee_code` 业务快照列已最小实现（migration 就绪 + dev 已执行） | ✅ |
| `employee_code → employee.id → grid_id` 归因链已实现并真机验证 | ✅ |
| `inspector_employee_id` 永远只保存 `employee.id`（无直接赋值路径） | ✅ |
| `PROTECTED_COLUMNS` 保留，Pull Engine 零改动，不直接写两列 | ✅ |
| 存量 2061 条 `sync_hash` 零漂移 | ✅ |
| 不触发 `PROTECTED_COLUMN_WRITE_FORBIDDEN` | ✅ |
| 仅处理 `mobile_h5`，无历史批量回填 | ✅ |
| 测试 66/66 全通过 | ✅ |
| 生产环境零改动 | ✅ |
| 禁改模块零触碰 | ✅ |

---

## 附录 A：本阶段产生的证据文件

| 文件 | 用途 |
|---|---|
| `_cf06_apply_migration_dev.cjs` / `_cf06_migration.json` | dev 迁移执行器（含生产拒绝护栏）与结果 |
| `_cf06_e2e.cjs` / `_cf06_e2e.json` | 真机 E2E（A–Z，19 项） |
| `_cf06_hash_regression.cjs` / `_cf06_hash_regression.json` | hash 不变量回归（R1–R5，9 项） |
| `_cf06_pull_dryrun.cjs` / `_cf06_pull_dryrun.json` | Pull Engine dryRun 复核（7 项） |
| `_cf06_hash_verify.cjs` / `_cf06_schema_probe.cjs` / `_cf06_drift_diag.cjs` | 前置只读探查（schema / 哈希 / 差异根因） |

## 附录 B：铁律对照表

| 铁律 | 落地方式 |
|---|---|
| `employee_code` = 花名册员工编码（VARCHAR，移动端业务身份键） | `employee_code varchar(64)`，独立业务快照列 |
| `employee.id` = PG 内部代理键（BIGINT） | 经 `SELECT id FROM public.employee WHERE employee_code=$1 AND is_deleted=false` 获得 |
| `inspector_employee_id` = `employee.id`，**绝不**等于 `employee_code` | 解析器 `writes` 只写 `Number(res.employeeId)`；单测 T9 + E2E A2 双重断言 |
| 唯一允许路径：`employee_code → SELECT employee.id → inspector_employee_id` | `gridEmployeeCodeResolver` 为该转换的唯一出口 |
| WPS 是数据缓冲层 | Pull Engine 只同步业务字段，零归一化、零人员归因 |
| Pull Engine 不负责人员归因 | Pull Engine 本阶段零改动，`PROTECTED_COLUMNS` 完整保留 |
| 所有无法确定的情况 fail-closed | 0 行 / >1 行 / 无网格 / 多网格 / 非法 id / 查询异常 → 全部 pending |
