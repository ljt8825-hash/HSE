# 执行报告-07 · 事件幂等 kind 键修复 + VIOLATION002（检查未反馈）适配器备建

> 归属：规则引擎（rule-engine）阶段3 收尾延伸轮
> 提示词：`提示词-07-事件幂等kind键修复与VIOLATION002适配器备建.md`
> 执行日期：2026-08-31
> 铁律（全程遵守）：**零评分行为变化**——VIOLATION002 规则行保持 `pending_data` 不动、不产生任何新扣分、不拆 `FILL_SOURCES`、不碰 web-antd；VIOLATION002 备建但**不进 AUTO 门面**。

---

## 0. 验收结论速览

| 验收项 | 期望 | 实测 | 结果 |
|---|---|---|---|
| 任务 A · kind 隔离单测 | kind 不同视为两条扣分 / 同 kind 幂等 / 月度回归 | 3 新用例全过 | ✅ |
| 任务 B · 注册 3 个、AUTO 仍 2 个 | `registerAdapter` ×3、`AUTO_DEDUCTION_ADAPTERS` 不变 | grep 证明 | ✅ |
| 任务 B · 规则行未动 | VIOLATION002 `pending_data`/`adapter_key` NULL/`metric` NULL | psql 证明 | ✅ |
| 任务 B · 适配器单测 | 候选过滤/跳过/撤销/buildDetail | 12 新用例全过 | ✅ |
| 任务 C.1 · dryRun 探针 | scanned=0/intents=0/零写入 | RAW=128、带键=0、scanned=0 | ✅ |
| 任务 C.2 · 观测文案刷新 | VIOLATION003→「人次」、R000001 不变、affected=0、parity 不变 | 实测一致 | ✅ |
| jest ruleEngine | 全绿，74→89 | **89 passed / 89 total（7 suites）** | ✅ |
| jest 全量失败数 | =7 基线（import-personnel-behavior） | **7 failed**（未增加） | ✅ |
| typecheck | 51 基线 | **51 errors** | ✅ |
| grep 证明 | FILL_SOURCES 未动 / web-antd 未动 | 已证明 | ✅ |

---

## 1. 任务 A：事件幂等补 kind 维度（引擎缺陷修复）

**文件**：`server/services/ruleEngine/deductionWriter.js`

### 改动
- `findEventExisting(sourceTable, cycleId, targetId, sourceId, kind)`（原 4 参 → 5 参）：SQL 新增
  `AND source_detail ->> 'kind' = $5`，参数追加 `String(kind)`。
- `findByIdempotency`（事件分支）：调用改为 `findEventExisting(sourceTable, cycleId, targetId, sourceId, kind)`（`kind` 取自 `createDeductionWriter` 闭包，与月度模式同源）。
- 月度模式 `findMonthlyExisting` 不变；revive/update 路径不变（同 kind 内行才可能被命中/改写）。

### 兼容性论证
- 生产环境 violation 来源扣分 **0 行**，无存量错配风险。
- 同适配器（如 `violation_record`，`KIND='violation_event'`）重跑时，既有行 `source_detail.kind='violation_event'`，新 SQL 仍命中 → 匹配集与改动前完全一致（幂等 noop 不变）。
- 修复后，两个事件适配器（`violation_event` 与 `violation_unrectified`）共用 `violation_records` 时，各自只匹配本 kind 的行，不再互相误判「已存在」。

### 单测（`__tests__/deductionWriter.unit.test.js` 新增 3 用例，mock db）
- 同 `(target,cycle,source_table,source_id)` 但 kind 不同 → 视为两条不同扣分（各自 upsert 不互相命中，B 适配器 INSERT 且 `source_detail.kind='violation_unrectified'`）。
- 同 kind 同 `source_id` 重跑 → 幂等 `noop`，且定位 SQL 含 `source_detail ->> 'kind' = $5`、第 5 参数为 `'violation_event'`。
- 月度模式回归：月度 writer upsert 仍走 monthly 查询（含 `deductKey`），**不含**事件式 `source_id = $4` 匹配。

---

## 2. 任务 B：VIOLATION002 适配器备建（注册但不进自动门面）

**新文件**：`server/services/ruleEngine/adapters/violationUnrectifiedAdapter.js`

### 常量
`KEY='violation_unrectified'`、`RULE_CODE='VIOLATION002'`、`SOURCE_TABLE='violation_records'`、`KIND='violation_unrectified'`、`EVENT_TYPE='VIOLATION_UNRECTIFIED'`、`IDEMPOTENCY='event'`、`deductedUnit='events'`、`METRIC_CODE=null`（激活前不映射）。

### 契约要点（对齐 violationAdapter）
- **scan 候选 SQL**：`is_deleted=FALSE AND violator_id IS NOT NULL AND need_rectification='是' AND (rectification IS NULL OR btrim(rectification)='' OR rectification_time IS NULL) AND violation_date 落在周期月窗口`。
- `violation_date` 为 NULL 的落键行 → `skipped 'no-date'`（同三违）。
- 逐人 `engine.findAssessmentTarget(cycleId, employeeId)`；非考核对象 → `skipped 'not-assessment-target'`。
- `rawScore = rule.deductScore>0 ? rule.deductScore : 1`（**统一 1 分/条，不区分查处来源**；口径待业务确认）。
- `buildItem`：`'检查未反馈/未整改1次'`；`buildDetail` 含 `kind`/`deductKey('violation-unrectified:${cycleId}:${sourceId}')`/`ruleName`/`category`/`eventType`/`sourceId`/`employeeId`/`targetId`/`violationDate`/`needRectification`/`rectification`/`rectificationTime`/`rawScore`/`cap`/`cappedScore`/`otherCatScore`/`summary`。
- **撤销集**：与 violationAdapter 同构（`Map<sourceId, employeeId>`，`recordGone`/`reassigned` 双分支），`existR` 过滤本 kind `source_detail->>'kind'='violation_unrectified'`；记录被整改（rectification 补齐）离开候选集 → 自动撤销。
- `ensureMetric`：`METRIC_CODE` 为 null 时直接返回 `{code:null,id:null}`（**零写库**，适配 dryRun 与"激活前不绑定指标"）；激活后填常量即自动补建/复用。

### 注册（`server/services/ruleEngine/engine.js`）
- `ensureAdaptersRegistered` 新增 `registerAdapter('violation_unrectified', require('./adapters/violationUnrectifiedAdapter'))` → **注册 3 个**。
- `AUTO_DEDUCTION_ADAPTERS`（第 30 行）**保持 `['grid_unchecked', 'violation_record']` 不变** → 门面运行结果与本轮前完全一致。
- 规则行 VIOLATION002 **不改**（`integration_status='pending_data'`、`adapter_key` NULL、`metric_code` NULL）；不写迁移 SQL。

### 单测（`__tests__/violationUnrectifiedAdapter.unit.test.js`，12 用例，mock db）
候选 SQL 过滤条件断言（need_rectification='是'/未整改三态/violator_id 非空/月窗口/本 kind 撤销隔离）、需整改未整改命中→1 分、非考核对象跳过、无日期跳过、字段透传、四类撤销（离开候选集/换人/未换人不误撤销/历史行无 employeeId 跳过）、`ensureMetric(null)` 零写、`build*` 纯函数。

---

## 3. 任务 C：dryRun 验证脚本 + 观测文案刷新

### C.1 dryRun 探针（零写入）
**脚本**：`server/scripts/_ruleEngine/_probe_violation002.js`
- 显式 `engine.runCycleAdapters(24, { adapterKeys: ['violation_unrectified'], dryRun: true })`。
- 诊断计数（只读）：`RAW_CANDIDATE(需整改未整改) = 128`；`RAW_CANDIDATE_WITH_VIOLATOR_KEY = 0`（历史 128 条因 `violator_id` 全 NULL → 当前零命中）。
- 探针输出：`adapter=violation_unrectified scanned=0 assessed=0 affected=0 deducted=0`、`SKIPPED_SAMPLE=[]`、`VIOLATION002_DRYRUN_ZERO_WRITE_OK: true`。
- 结论：**备建可用、当前零命中**，符合"激活前零影响"。

### C.2 观测文案刷新（真实运行，幂等）
**脚本**：`server/scripts/_ruleEngine/_refresh_cycle24_summary.js`
- 在 cycle 24 真实运行 `runCycleAutoDeductions(24)`（`dryRun:false`，受约束 2 允许，仅幂等刷新）。
- 运行前：`VIOLATION003` 文案仍为旧「扫描0人/扣分0人」。
- 运行后：
  - `VIOLATION003` → **「扫描0人/扣分0人次」**（代码已支持"人次"，本轮首刷）；
  - `R000001` → 「扫描62人/考核56人/扣分54人」（**不变**）；
  - `affected=0`（两适配器均 0 变更）；
  - GRID_PARITY：`n=54, s=103.00, nonpending=0`（不变）；
  - VIOLATION_EVENT_ROWS：`n=0`（三违来源 0 行）。
- `CYCLE24_REFRESH_PARITY_OK: true`。

---

## 4. 验收证据汇总（§5 清单逐条对齐）

1. **任务 A**：`findEventExisting` 新 SQL（含 `AND source_detail ->> 'kind' = $5`）与调用处（`findByIdempotency` 透传 `kind`）已贴；kind 隔离/幂等/月度回归单测全过（见 §1）。
2. **任务 B**：适配器代码要点见 §2；grep 证明 `registerAdapter` ×3、`AUTO_DEDUCTION_ADAPTERS` 仍 `['grid_unchecked','violation_record']`；psql 证明 `VIOLATION002` 行 `integration_status=pending_data`、`adapter_key`、`metric_code` 均为 NULL（未动）；适配器 12 单测全过。
3. **任务 C**：dryRun 脚本输出 `scanned=0/intents=0/skipped=[]`（已贴）；真实运行后库内 `VIOLATION003` 文案含"人次"、`R000001` 不变、parity（54 行/103.00/全 pending/三违 0 行）已贴（见 §3）。
4. **jest**：ruleEngine **89 passed / 89 total**；全量失败 **7**（import-personnel-behavior 预存在，未增加）；typecheck **51**（基线）。grep：`FILL_SOURCES`（`assessmentScoringEngine.js:523`，仅 `training`/`accident`）未动；web-antd 工作区无本次改动（`git diff --stat` 为空）。
5. **激活清单**见 §6。

---

## 5. 偏离项 / 注意点

| # | 项 | 说明 |
|---|---|---|
| 1 | `ensureMetric` 在 `METRIC_CODE=null` 时零写 | 备建期不创建指标；激活时填 `METRIC_CODE` 常量即自动补建/复用（已在代码预留）。 |
| 2 | `rawScore` 统一 1 分/条 | 未区分查处来源（与 VIOLATION003 的 check_source 5/1 分口径不同），业务拍板前保持保守。 |
| 3 | 潜在双重扣分 | VIOLATION003（按 check_source 计）与 VIOLATION002（按未整改计）可能命中同一条违规记录 → 同记录两条扣分（kind 隔离后互不干扰，但业务上是否允许需确认）。已列入 §6 口径确认。 |
| 4 | 当前零命中 | 历史 `violator_id` 全 NULL，激活后仍需录入端落键方可真正产生扣分（与 VIOLATION003 同构）。 |

---

## 6. 激活清单（业务拍板后需执行的动作）

> 以下动作本轮**均未执行**，待业务确认口径后一键启用。

1. **规则行置活**：`UPDATE hse_assessment_rule SET integration_status='active', adapter_key='violation_unrectified', metric_code=<映射指标> WHERE rule_code='VIOLATION002';`（`<映射指标>` 如新增 `HSE-KPI-SAF-007` 或复用三违指标，待定）。
2. **加入自动门面**：`engine.js` 第 30 行 `AUTO_DEDUCTION_ADAPTERS` 数组追加 `'violation_unrectified'`。
3. **口径确认**（务必先对齐业务）：
   - 是否区分查处来源（当前统一 1 分/条 vs 公司/乡镇差异化）；
   - 与 VIOLATION003 同记录是否允许双重扣分（§5 #3）；
   - 三违管理大类 15 分上限共用（`categoryCap` 已按行排除，自动共用，无需额外改动）。
4. **历史落键**：激活前需推动录入端补 `violator_id`（当前全 NULL → 0 命中），新录入数据落键后自然生效。

---

## 7. 回滚方案

- **A（kind 修复）**：还原 `deductionWriter.js` 两处（`findEventExisting` 去 `$5` 与 `kind` 参数、`findByIdempotency` 调用去掉 `kind`）→ jest 回到 86（89−3）。月度行为零影响，事件模式回退到"不按 kind 隔离"（注意：若已激活 VIOLATION002 并产生跨 kind 行，回退后可能误判，故激活前回退安全）。
- **B（适配器）**：删除 `violationUnrectifiedAdapter.js`；`engine.js` 去掉第 39 行 `registerAdapter('violation_unrectified', ...)`；删除 `__tests__/violationUnrectifiedAdapter.unit.test.js` → jest 回到 77（89−12）。
- **C（探针/刷新）**：`_probe_violation002.js` / `_refresh_cycle24_summary.js` 为只读/幂等脚本，删除即可；C.2 真实运行仅刷新 `last_run_summary` 文本，若需还原旧文案可手动 `UPDATE hse_assessment_rule SET last_run_summary='扫描0人/扣分0人' WHERE rule_code='VIOLATION003';`（不影响扣分行）。

---

## 8. 交付物索引

| 类型 | 路径 |
|---|---|
| A 改动 | `server/services/ruleEngine/deductionWriter.js` |
| A 单测 | `server/services/ruleEngine/__tests__/deductionWriter.unit.test.js`（+3 用例） |
| B 适配器 | `server/services/ruleEngine/adapters/violationUnrectifiedAdapter.js` |
| B 注册 | `server/services/ruleEngine/engine.js`（registerAdapter ×3；AUTO 列表仍 2） |
| B 单测 | `server/services/ruleEngine/__tests__/violationUnrectifiedAdapter.unit.test.js`（12 用例） |
| C.1 探针 | `server/scripts/_ruleEngine/_probe_violation002.js` |
| C.2 刷新 | `server/scripts/_ruleEngine/_refresh_cycle24_summary.js` |
| 本报告 | `docs/rule-engine-design/执行报告-07-事件幂等kind键修复与VIOLATION002备建.md` |
