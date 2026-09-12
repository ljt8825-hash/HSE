# 提示词-07：事件幂等 kind 键修复 + VIOLATION002（检查未反馈）适配器备建不激活 + 观测文案刷新

> 执行方：WorkBuddy（全栈编码代理）
> 日期：2026-08-31
> 前置：第 06 轮（阶段3 收尾）已审核通过。覆盖矩阵 P0 项 VIOLATION002 具备清晰命中集（need_rectification='是' 且未整改 = 128 条/5.1%），本轮**备建但不激活**，等业务拍板口径后一键启用。
> 本轮铁律：**零评分行为变化**。VIOLATION002 规则行保持 pending_data 不动；不产生任何新扣分；不拆 FILL_SOURCES；不碰 web-antd。
> 完成后：执行报告写到 `g:\hse-dashboard\docs\rule-engine-design\执行报告-07-事件幂等kind键修复与VIOLATION002备建.md`。

---

## 0. 已核验事实（直接采信）

- 引擎现状：统一门面 `runCycleAutoDeductions` → AUTO_DEDUCTION_ADAPTERS = ['grid_unchecked','violation_record']；writer 双模式（monthly/event）；categoryCap 按行排除；人工锁定 approved/adjusted；runLogger 支持 deductedUnit（events→"人次"）。
- **引擎缺陷（本轮必修）**：`server/services/ruleEngine/deductionWriter.js` 的 `findEventExisting`（约 73-84 行）事件幂等匹配条件为 `target_id + cycle_id + source_table + source_id`，**不含 kind**；月度模式 `findMonthlyExisting` 含 `source_detail->>'kind'` + deductKey。两个事件适配器共用 violation_records 时，同一 source_id 会互相误判"已存在"（第二个适配器的 intent 命中第一个适配器的行 → noop/误更新）。
- VIOLATION002 数据现状（第 06 轮调研）：violation_records 存活 2506 行；`need_rectification='是'` 且（rectification 空 或 rectification_time 空）= 128 条；但历史行 violator_id 全 NULL（2506/2506），故当前可落扣分数为 0——与 VIOLATION003 上线时同构，新录入数据落键后自然生效。
- violation_records 可用字段：need_rectification（是/否/未判定/NULL）、rectification、rectification_time、rectification_executor、rectification_photos、status、report_status、handler_id/handler_name、violator_id、violator_name、check_source、violation_date。
- 规则行 VIOLATION002：rule_name「检查未反馈」、category 三违管理、deduct_score 1、integration_status='pending_data'、adapter_key NULL、metric_code NULL。
- VIOLATION003 观测文案线上仍为旧文案"扫描0人/扣分0人"（第 06 轮只跑 dryRun 未刷新）；代码已支持"人次"。
- 基线：cycle 24 网格 54 行/103.00 分/全 pending；三违来源扣分 0 行；ruleEngine jest 74/74（6 套件）；typecheck 51 基线。

## 1. 任务 A：事件幂等补 kind 维度（引擎缺陷修复）

1. `deductionWriter.js`：
   - `findEventExisting(sourceTable, cycleId, targetId, sourceId, kind)` 的 SQL 增加 `AND source_detail ->> 'kind' = $5`，参数追加 kind（kind 来自 writer 构造时的 `kind` 常量，与月度模式同源）。
   - 调用处 `findByIdempotency` 透传 kind。
   - 复活/更新路径不变（同 kind 内行才可能被复活）。
2. 兼容性论证写入报告：生产环境 violation 来源扣分 0 行，无存量错配风险；同适配器重跑匹配集不变（kind 相同）。
3. 单测 `deductionWriter.unit.test.js`（或既有 writer 测试文件）新增：
   - 同 (target,cycle,source_table,source_id) 但 kind 不同 → 视为两条不同扣分（各自 upsert 不互相命中）；
   - 同 kind 同 source_id 重跑 → 幂等 noop；
   - 月度模式行为不受影响（回归）。
   - 测试必须 mock config/db，不连真实库。

## 2. 任务 B：VIOLATION002 适配器备建（注册但不进自动门面）

新建 `server/services/ruleEngine/adapters/violationUnrectifiedAdapter.js`，契约对齐 violationAdapter：

- 常量：KEY='violation_unrectified'、RULE_CODE='VIOLATION002'、SOURCE_TABLE='violation_records'、KIND='violation_unrectified'、IDEMPOTENCY='event'、deductedUnit='events'；METRIC_CODE=null（激活前需业务/指标映射，报告标注）。
- scan 候选 SQL：`is_deleted=FALSE AND violator_id IS NOT NULL AND need_rectification='是' AND (rectification IS NULL OR btrim(rectification)='' OR rectification_time IS NULL)` 且 violation_date 落在周期月窗口；violation_date NULL 的落键行 → skipped 'no-date'（同三违）。
- 逐人 `engine.findAssessmentTarget(cycleId, employeeId)`，非考核对象 skipped 'not-assessment-target'。
- rawScore = rule.deductScore>0 ? rule.deductScore : 1（不区分查处来源，统一 1 分/条；报告标注此口径待业务确认）。
- buildItem：'检查未反馈/未整改1次'；buildDetail 含 kind/deductKey（`violation-unrectified:${cycleId}:${sourceId}`）/ruleName/category/eventType='VIOLATION_UNRECTIFIED'/sourceId/employeeId/targetId/violationDate/needRectification/rawScore/cap/cappedScore/otherCatScore/summary。
- 撤销集：与 violationAdapter 同构（Map<sourceId, employeeId>，recordGone/reassigned 双分支，existR 过滤本 kind `source_detail->>'kind'='violation_unrectified'`）；记录被整改（rectification 补齐）后离开候选集 → 自动撤销。
- 注册：`engine.js` ensureAdaptersRegistered 增加 `registerAdapter('violation_unrectified', require('./adapters/violationUnrectifiedAdapter'))`；**AUTO_DEDUCTION_ADAPTERS 保持 ['grid_unchecked','violation_record'] 不变**（门面不跑它）。
- 规则行 VIOLATION002 **不改**（pending_data/adapter_key NULL/metric NULL 原样）；不写迁移 SQL。
- 单测 `__tests__/violationUnrectifiedAdapter.unit.test.js`：候选过滤（需整改未整改命中/已整改排除/need_rectification 非"是"排除）、落键缺失跳过、非考核对象跳过、撤销（整改后撤销/换人撤销）、buildDetail 字段；mock db。

## 3. 任务 C：dryRun 验证脚本 + 观测文案刷新

1. 新建 `server/scripts/_ruleEngine/_probe_violation002.js`：显式以 `runCycleAdapters(cycleId, {adapterKeys:['violation_unrectified'], dryRun:true})`（或引擎等价入口）跑 cycle 24，输出 scanned/assessed/intents/revocations/skipped 分布；**全程 dryRun 零写入**。预期：历史 128 条候选因 violator_id 全 NULL → scanned=0、intents=0；报告贴输出证明"备建可用、当前零命中"。
2. 观测文案刷新：在 cycle 24 上**真实运行一次** `runCycleAutoDeductions(24)`（affected=0 幂等），验证：
   - VIOLATION003 last_run_summary 刷新为「扫描0人/扣分0**人次**」；
   - R000001 文案不变（「扫描62人/考核56人/扣分54人」）；
   - 网格 54 行/103.00 分/全 pending 不变、三违来源 0 行。
   贴库内查询结果。

## 4. 硬约束

1. VIOLATION002 不激活：不进 AUTO_DEDUCTION_ADAPTERS、规则行不动、门面运行结果与本轮前完全一致。
2. 零扣分：dryRun 验证不造数；真实运行仅任务 C 第 2 项的幂等刷新（affected 必须=0）。
3. 不拆 FILL_SOURCES.training/accident；不碰其他适配器逻辑（任务 A 对 monthly 路径零影响需测试证明）。
4. 只改 apps/web-naive（本轮预期无前端改动）；web-antd 禁碰；中文注释。
5. ruleEngine jest 全绿且数量 ≥ 74 + 新增；全量 jest 失败数不增加（基线 7 条 import-personnel-behavior 预存在）；typecheck=51 基线。

## 5. 验收清单（证据进报告）

1. 任务 A：贴 findEventExisting 新 SQL 与调用处；kind 隔离/幂等/月度回归单测输出。
2. 任务 B：适配器完整代码要点；注册行 grep 证明（注册 3 个、AUTO 列表仍 2 个）；VIOLATION002 规则行查询证明 pending_data 未动；适配器单测输出。
3. 任务 C：dryRun 脚本输出（scanned=0/intents=0/skipped 说明）；真实运行后两条规则观测文案库内值（VIOLATION003 含"人次"）；parity（54 行/103.00/全 pending/三违 0 行）。
4. jest ruleEngine 总数贴底；全量 jest 失败数=7 基线；grep 证明 FILL_SOURCES 未动、web-antd 未动。
5. 报告中写明**激活清单**（业务拍板后需要做的动作）：规则行置 active + adapter_key='violation_unrectified' + metric_code 映射 + 加入 AUTO_DEDUCTION_ADAPTERS + 口径确认（是否区分查处来源、与 VIOLATION003 同记录双重扣分是否符合业务预期、三违管理大类 15 分上限共用）。

## 6. 本轮明确不做（非目标）

- 不激活 VIOLATION002、不建培训/事故/车辆/消防/转运站/晨会适配器。
- 不做历史 violator_id 回填；不清理 82 行乱码培训数据。
- 不改任何规则分值/状态；不做前端页面改动。
