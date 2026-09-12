# 修复任务提示词：月度安全履职考核「网格长未巡查」自动扣分通路

> 请把本文件完整作为需求交给开发助手（DeepSeek）执行。本任务**只修「未巡查/未检查」这一条扣分通路**，不要做通用规则引擎改造。所有结论均已在代码中定位，请先按「第一步 必读与核验」核对，再动手。

---

## 一、项目背景与技术栈

- 后端：Node.js + Express，目录 `g:\hse-dashboard\server`，PostgreSQL 15（`pg` 连接池，`server/config/db.js` 导出 `pool / isConnected`）。
- 定时任务：`node-cron`，调度器 `server/services/assessmentScheduler.js`，在 `server/app.js` 中初始化。
- 前端：Vben Admin（Vue3 + Ant Design Vue），目录 `g:\hse-dashboard\安全看板vben`（本任务**基本不需要改前端**，见第六节）。
- 涉及的核心表：
  - `grid_inspection_records`：网格长巡查台账（**无 `is_deleted` 字段，无软删除**，清空是物理 `DELETE`）。字段：`personnel_name`(检查人姓名)、`inspection_date`(日期)、`grid_id`→`grid_areas(id)`、`grid_level`、`area_team` 等。建表脚本：`server/sql/grid_inspection_records.sql`。
  - `grid_areas`：网格/网格长登记。关键字段：`id`、`name`(网格长姓名)、`personnel_id`→`employee.id`、`grid_level`(总/一级/二级/三级)、`patrol_frequency`(巡查频率，如「1天1次」「每日一次」)、`completion_rate`、`is_deleted`。
  - `hse_assessment_cycle`：考核周期（`assessment_year`、`assessment_month`、`start_time`、`end_time`、`status`）。
  - `hse_assessment_target`：考核对象（`cycle_id`、`employee_id`、`employee_name`、`score_auto`、`score_total`、`grade`、`status`）。
  - `hse_assessment_deduction`：扣分明细。**注意 `source_id BIGINT`（可为 NULL，不能写字符串）**；另有 `metric_code VARCHAR`、`deduction_item VARCHAR(100)`、`deduction_source`('auto'/'chain_transmission'/'manual'/'import')、`suggested_score NUMERIC`、`source_detail JSONB`、`review_status`、`is_deleted`。
  - `hse_assessment_metric`：考核指标字典（`metric_code`、`metric_name`、`category`，三违类 `category='SAFETY'`，网格类 `category='GRID'`）。
  - `hse_assessment_rule`：扣分规则库（登记簿）。关键字段：`rule_name`、`category`(中文类别名，如「三违管理」)、`metric_code`、`deduct_type`('fixed'/'cumulative'/'detail'/'tiered')、`deduct_score`、`max_deduct`、`source_table`、`source_route`(前端跳转路由)、`status`。
  - `hse_assessment_category_limit`：类别扣分上限（`category` 中文名、`max_deduct`）。三违管理上限以该表当前值为准（现配为 15）。
  - `hse_assessment_event_log`：事件幂等日志。

---

## 二、问题现象与已确认根因（已核实，勿重复怀疑）

现象：三级菜单「网格长巡查台账」上传后，「网格长巡查管理」能看到每个人的巡查完成率；二级菜单「扣分规则库」里三违管理已配「未检查」规则（1 分/次、累计、数据来源链接到网格巡查页）；但在二级菜单「月度安全履职考核」点「自动评分 → 执行评分」后，未完成巡查的人员在「三违管理」一项**没有被扣分**（8 月周期 56 人全部 100 分，有效扣分为 0）。

根因（共 4 处，全部要修）：

1. **「执行评分」只汇总、不扫描业务表。**
   `server/routes/hse-assessment-monthly.js` 的 `POST /scoring/execute`（约 865–942 行）只调用 `engine.recalculateCycle(cycle_id)`；而 `recalculateCycle/recalculateTarget`（`server/services/assessmentScoringEngine.js` 322–391 行）仅对 `hse_assessment_deduction` 里**已存在**的明细求和（`getEffectiveDeductionTotal`，304–315 行）。没有任何代码在评分时去扫描 `grid_inspection_records` 生成缺巡扣分。

2. **每日网格校验定时任务 SQL 引用了不存在的字段，每天静默失败。**
   `server/services/assessmentScheduler.js` 的 `runGridCheck()`（345–406 行）中：
   ```sql
   LEFT JOIN grid_inspection_records pg
     ON pg.personnel_name = ea.name AND COALESCE(pg.is_deleted,FALSE)=FALSE
   ```
   `grid_inspection_records` **没有 `is_deleted` 列**，该查询必然抛错，被 365–369 行 `catch` 降级为 `{ skipped:'grid-check-unavailable' }`，历史上一次扣分都没产生过。

3. **即便查询修好，扣分写入也会失败：`source_id` 是 BIGINT，却传字符串。**
   `server/services/assessmentEventService.js` 的 `onGridMiss()`（510–525 行）把 `sourceId` 设为 `` `${employee_id}-${dateKey}` ``（如 `123-20260830`）写入 `hse_assessment_deduction.source_id`，而该列类型是 `BIGINT`，插入会报 `invalid input syntax for type bigint`。对照同文件 `onMeetingAbsent()`（593 行注释）已明确「source_id 为 bigint 列，必须用数值型 id」。

4. **归类口径对不上「三违管理」。**
   - 现有网格缺次走指标 `HSE-KPI-GRD-001`（类别 `GRID`，明细名 `网格巡查缺次（…）`），不属于三违管理。
   - 考核对象列表里「按类别汇总扣分」`sumDeductionsByCategory()`（`hse-assessment-monthly.js` 121–142 行）是把每条扣分的 `deduction_item`（或 `source_detail.ruleHit.ruleName`）**与 `hse_assessment_rule.rule_name` 逐字匹配**，取该规则的 `category` 作为列 key。明细名若不等于规则库里的规则名（「未检查」），就归不进「三违管理」列。
   - 规则库里那条规则的「数据来源」存的是 `source_route='/site/grid/mgmt'`（前端页面跳转路由），`source_table` 为空；评分链路从不读 `source_route`。

> 补充：`hse_assessment_category_limit` 的类别上限目前**只在规则库/类别管理界面读写展示，评分引擎并未强制执行**。本任务要求让该上限对「未检查」这笔扣分生效（见第四步算法），但**不**改造其它类别的上限执行。

---

## 三、已确认的业务口径（用户拍板，照此实现）

1. **扣分口径**：按「**应巡次数 − 实巡次数 = 缺次次数**」，**每缺 1 次扣 X 分**。应巡/实巡直接复用 `server/services/gridCompletionService.js` 的 `getGridPatrolStats(grids,{year,month,hireDateByGrid})`（返回每个网格 `{ expected, actual, completionRate, ... }`，已含当月按今天截止、过去月按整月、新入职按入职日折算的逻辑）。**不要**再用定时任务里那套「最近 1~3 天没巡查」的滚动超期口径。
2. **扣分显示位置（选项 C，两者都要）**：
   - 「**三违管理**」列体现「未检查」扣分（这是本次新增的罚分）。
   - 「网格巡查」列**保留**原有频次达标/完成率展示（来自网格统计，不是罚分），**不要破坏、不要把罚分挪到网格列**。
3. **分值与上限**：扣分值与方式从规则库读取——规则名「未检查」、类别「三违管理」、`deduct_type='cumulative'`、`deduct_score=1`（即缺次 ×1，累计）。同时受「三违管理」**类别上限 `hse_assessment_category_limit.max_deduct`（当前 15）**约束：该人员本周期「三违管理」类别下所有有效扣分合计不得超过上限，超出部分把本笔罚分压到刚好不超限（最小可为 0）。
4. **触发时机（两处都接）**：
   - 台账**上传完成后立即**扫描相关人员扣分；
   - 点「**执行评分**」时**当场扫描**巡查台账并生成/更新扣分（主路径，必须可靠，不依赖夜间服务）。
5. **范围**：本次只打通「未巡查/未检查」这一条通路（硬编码扫描逻辑 + 接入评分 + 读取本条规则的分值/上限配置）。**规则库仍是配置/参考登记簿，不做通用规则引擎化。**

---

## 四、实现方案

### 4.1 新增一个专用服务（核心）

新建 `server/services/gridUncheckedDeductionService.js`，导出：

```js
async function syncGridUncheckedDeductions(cycleId, { dryRun = false } = {})
// 返回 { ok, cycleId, scanned, affected, details:[{employeeId, employeeName, expected, actual, missing, rawScore, cappedScore, action}], skipped:[...] }
```

逻辑步骤：

1. 读取周期：`SELECT * FROM hse_assessment_cycle WHERE id=$1 AND is_deleted=FALSE`。状态为 `frozen`/`not_started` 直接返回 `{ok:false, reason:'cycle-status-...'}`（与引擎守卫一致）。取 `assessment_year/assessment_month`（为空则由 `start_time` 推导）。
2. 读取本规则配置（一次性，带容错默认值）：
   ```sql
   SELECT id, rule_name, category, metric_code, deduct_type, deduct_score
   FROM hse_assessment_rule
   WHERE is_deleted=FALSE AND status='enabled'
     AND category='三违管理'
     AND (rule_name='未检查' OR rule_name LIKE '%未检查%' OR rule_name LIKE '%未巡查%')
   ORDER BY id DESC LIMIT 1;
   ```
   - 记 `ruleName = row.rule_name`（**扣分明细的 `deduction_item` 必须逐字等于这个 `rule_name`**，才能被 `sumDeductionsByCategory` 归到「三违管理」）。
   - `unit = Number(row.deduct_score)||1`；`cumulative = row.deduct_type==='cumulative'`。
   - `metricCode = row.metric_code`；若为空或 `hse_assessment_metric` 中不存在，则补建指标 `HSE-KPI-SAF-004`（`metric_name='网格未巡查（未检查）'`、`category='SAFETY'`、`metric_type='auto'`、`data_source='grid_inspection_records'`、`status='active'`）并使用之。**不要用 `HSE-KPI-GRD-001`**（那是网格类）。
   - 读类别上限：`SELECT max_deduct FROM hse_assessment_category_limit WHERE category='三违管理'`；`cap = max_deduct==null ? Infinity : Number(max_deduct)`。
3. 加载网格长与其网格：
   ```sql
   SELECT id, name, personnel_id, grid_level, patrol_frequency
   FROM grid_areas
   WHERE is_deleted=FALSE AND personnel_id IS NOT NULL;
   ```
   调 `gridCompletionService.getHireDateMap(ids)` 与 `getGridPatrolStats(rows,{year,month,hireDateByGrid})` 拿到每个网格 `{expected,actual}`。
   **按人聚合**：同一 `personnel_id` 名下多个网格，`expected`、`actual` 分别求和；`missing = max(0, expectedSum - actualSum)`。
4. 只处理本周期考核对象：对每个 `personnel_id` 调 `engine.findAssessmentTarget(cycleId, personnel_id)`（`assessmentScoringEngine.js`），不是考核对象则跳过（计入 `skipped`）。
5. **类别上限钳制**：对该 target，先算「三违管理」类别下**除本规则外**已有的有效扣分合计 `otherCatScore`——复用 `hse-assessment-monthly.js` 里 `getRuleCategoryMap()/resolveRuleForDeductionRows()` 的同款规则名匹配思路（建议把这两个纯函数抽到可复用位置或在本服务内等价实现）：查 `hse_assessment_deduction` 中该 target 本周期 `is_deleted=FALSE AND review_status<>'rejected' AND deduction_source IN('auto','chain_transmission')` 的明细，逐条按 `deduction_item`/`source_detail.ruleHit.ruleName` 匹配规则库得到类别，累计类别=「三违管理」且**不是本规则 upsert 行**（用下面的 JSONB 标记排除）的 `suggested_score`。
   - `rawScore = cumulative ? missing*unit : (missing>0?unit:0)`，四舍五入到 2 位。
   - `allowed = max(0, cap - otherCatScore)`；`cappedScore = min(rawScore, allowed)`。
6. **幂等 upsert（关键，避开 BIGINT 坑）**：本笔是「人×周期」的月度汇总，没有数值型业务主键，**`source_id` 一律置 NULL**，稳定唯一键放进 `source_detail` JSONB：
   - 标记：`source_detail.kind = 'grid_unchecked_monthly'`，`source_detail.deductKey = 'grid-unchecked:'+cycleId+':'+employeeId`。
   - 查找已有行：
     ```sql
     SELECT id, suggested_score FROM hse_assessment_deduction
     WHERE target_id=$1 AND cycle_id=$2 AND deduction_source='auto'
       AND source_table='grid_inspection_records'
       AND source_detail->>'kind'='grid_unchecked_monthly'
       AND source_detail->>'deductKey'=$3 AND is_deleted=FALSE;
     ```
   - 若 `missing>0 且 cappedScore>0`：不存在则 INSERT（字段参照 `engine.addAutoDeduction` 的写法：`score_id` 用 `engine.ensureTargetScoreRecord`、`metric_code=metricCode`、`deduction_item=ruleName`(逐字)、`deduction_type='auto_deduction'`、`source_table='grid_inspection_records'`、`source_id=NULL`、`suggested_score=cappedScore`、`review_status='pending'`、`is_transmission=FALSE`）；已存在且分值变化则 UPDATE `suggested_score`、`source_detail`、`updated_at`。
     `source_detail` 至少含：`{kind, deductKey, ruleName:'未检查', category:'三违管理', eventType:'GRID_UNCHECKED', expected, actual, missing, unit, rawScore, cap, cappedScore, year, month, summary:'未检查（本月应巡X次/实巡Y次/缺Z次）'}`。
   - 若 `missing==0` 或 `cappedScore==0` 且已有行：将该行 `is_deleted=TRUE`（撤销），实现「补传台账后缺次减少→扣分自动回退」。
   - 注意：不要调用 `engine.addAutoDeduction()`（它按 `source_id` 做幂等且会触发规则层 `scale_factor` 换算，与本需求口径冲突）；本服务自行写库，但分数汇总仍走 `engine.recalculateTarget()`。
7. 对发生增/改/删的 target 调 `engine.recalculateTarget(cycleId, targetId)` 刷新 `score_auto/score_total/grade` 与快照。
8. `dryRun=true` 时只算不写库，返回 `details` 供人工核对。

> 姓名匹配提醒：`getGridPatrolStats` 是以 `grid_areas.name` 匹配台账 `personnel_name`。若某网格长姓名在台账里写法不一致，会被当成 `actual=0`（缺巡全部），可能误扣。**上线前必须跑第七节预检 SQL**，对「actual=0」的人员人工确认是真没巡查还是姓名不一致；`details` 里要把 `actual=0` 的人单独标出。

### 4.2 接入点 1：执行评分时当场扫描

`server/routes/hse-assessment-monthly.js` 的 `POST /scoring/execute`：在 `engine.recalculateCycle(cycle_id)`（约 893 行）**之前**，加入：

```js
try {
  const gridSync = await require('../services/gridUncheckedDeductionService')
    .syncGridUncheckedDeductions(cycle_id);
  // 可把 gridSync.affected / 未巡查人数并入审计 detail
} catch (e) {
  logger.error(`[assessment-scoring] 未巡查扫描失败（不阻断评分）: ${e.message}`);
}
```

扫描失败不得阻断评分主流程。审计日志 `recordAudit` 的 detail 里增加 `grid_unchecked: { affected, capped }`。

### 4.3 接入点 2：台账上传完成后立即扫描

`server/routes/import.js` 在网格导入成功后的钩子（约 3016–3024 行，`if (moduleType === 'grid' && isConnected())` 内，`recalculateAllCompletionRates()` 之后）追加：找到当前进行中的周期并扫描（失败不影响导入结果）：

```js
try {
  const { pool } = require('../config/db');
  const cyc = await pool.query(
    `SELECT id FROM hse_assessment_cycle
     WHERE status IN ('in_progress','pending_review','reviewed') AND is_deleted=FALSE
       AND start_time <= NOW() AND end_time >= NOW()
     ORDER BY id DESC LIMIT 1`);
  if (cyc.rows.length) {
    await require('../services/gridUncheckedDeductionService')
      .syncGridUncheckedDeductions(cyc.rows[0].id);
  }
} catch (e) {
  console.warn('[NativeImport] 未巡查扣分扫描失败（不影响导入）:', e.message);
}
```

### 4.4 接入点 3：修正/替换每日定时任务（避免旧口径与双重扣分）

`server/services/assessmentScheduler.js`：
- 重写 `runGridCheck()`：**删除**引用 `pg.is_deleted` 的滚动窗口 SQL 与「总3/一级2/二级2/三级1」梯度扣分逻辑，改为遍历所有 `in_progress/pending_review/reviewed` 周期调用 `gridUncheckedDeductionService.syncGridUncheckedDeductions(cycleId)`（与手动评分同一套月度口径、同一幂等 upsert，天然不会重复扣分）。
- 停用旧的 `EVENT_TYPES.GRID_MISS` 滚动事件通路：`assessmentEventService.js` 中 `onGridMiss` 不再产生 `HSE-KPI-GRD-001` 滚动扣分（可保留函数但改为 no-op 或直接不再被调用），避免与新的月度「未检查」扣分重复。不要再发布 `GRID_MISS` 事件。
- 保留 cron 时间表即可（每日 01:00 作为兜底补偿）。

---

## 五、明确不要做的事（边界）

- 不做通用规则引擎：不把 `hse_assessment_rule` 的 `trigger_type/condition_expr/deduct_config` 等通用化驱动评分；只读取「未检查」这一条规则的 `rule_name/category/metric_code/deduct_type/deduct_score` 和类别上限。
- 不改「网格巡查」列的完成率/频次展示，不把罚分计入 GRID 类指标。
- 不改其它类别（隐患/培训/会议/三违行为等）既有扣分逻辑与口径。
- 不给 `hse_assessment_deduction.source_id` 写字符串；不需要新增数据库列（用 `source_detail` JSONB 标记即可）。如确有必要再加列，须先说明。
- 不删除历史数据、不动冻结周期。

---

## 六、前端

- 「三违管理」列的取值来自考核对象列表接口返回的 `category_deductions['三违管理']`（`sumDeductionsByCategory` 按规则名匹配）。只要扣分明细 `deduction_item` 逐字等于规则名「未检查」、规则类别为「三违管理」，该列会自动计入，**通常无需改前端**。
- 请在前端「月度安全履职考核」页面核实：① 未巡查人员「三违管理」列出现扣分；② 点开扣分明细能看到「未检查」及应巡/实巡/缺次说明（取自 `source_detail.summary`）；③「网格巡查」列完成率展示不变。若明细页未展示 `source_detail.summary`，再做最小化前端展示调整。

---

## 七、上线前预检 SQL（先跑，人工确认姓名匹配）

```sql
-- 1) 确认规则配置（应能查到 rule_name='未检查', category='三违管理', deduct_type='cumulative', deduct_score=1）
SELECT id, rule_name, category, metric_code, deduct_type, deduct_score, source_table, source_route, status
FROM hse_assessment_rule
WHERE is_deleted=FALSE AND category='三违管理'
  AND (rule_name LIKE '%未检查%' OR rule_name LIKE '%未巡查%');

-- 2) 类别上限（确认三违管理=15）
SELECT category, max_deduct FROM hse_assessment_category_limit WHERE category='三违管理';

-- 3) 台账表确无 is_deleted 列（预期：返回 0 行）
SELECT 1 FROM information_schema.columns
WHERE table_name='grid_inspection_records' AND column_name='is_deleted';

-- 4) 网格长姓名匹配核对：网格登记名 vs 台账出现过的检查人名
SELECT ga.id AS grid_id, ga.name AS grid_leader_name, ga.personnel_id, ga.grid_level, ga.patrol_frequency,
       (SELECT COUNT(*) FROM grid_inspection_records r WHERE r.personnel_name = ga.name) AS ledger_match_cnt
FROM grid_areas ga
WHERE ga.is_deleted=FALSE AND ga.personnel_id IS NOT NULL
ORDER BY ledger_match_cnt ASC;
-- ↑ ledger_match_cnt=0 的人，必须人工确认：是真没巡查，还是 grid_areas.name 与台账 personnel_name 写法不一致（如多空格/别名/同音字）。不一致的先修数据，避免误扣。

-- 5) 当月每人应巡/实巡/缺次（ dry-run 对照）
WITH g AS (
  SELECT ga.personnel_id, ga.name,
         SUM(/* 复用 getGridPatrolStats 口径，这里仅人工粗算 */ 1) AS dummy
  FROM grid_areas ga WHERE ga.is_deleted=FALSE AND ga.personnel_id IS NOT NULL
  GROUP BY ga.personnel_id, ga.name
)
SELECT r.personnel_name, COUNT(*) AS actual_cnt
FROM grid_inspection_records r
WHERE r.inspection_date >= date_trunc('month', NOW())
GROUP BY r.personnel_name;
```

---

## 八、验收标准

1. 准备一个含「缺巡」人员的在评周期，先以 `dryRun` 调用 `syncGridUncheckedDeductions(cycleId,{dryRun:true})`，返回的 `expected/actual/missing/rawScore/cappedScore` 与「网格长巡查管理」页完成率、人工核算一致；`actual=0` 人员已逐个确认。
2. 正式执行后，`hse_assessment_deduction` 中每个缺巡考核对象恰有 1 条 `deduction_item='未检查'`、`source_table='grid_inspection_records'`、`source_id IS NULL`、`source_detail->>'kind'='grid_unchecked_monthly'` 的明细，`suggested_score = min(缺次×1, 三违类别剩余额度)`。
3. 重复执行（再次点「执行评分」/重复上传/每日任务）**不产生重复明细**（upsert 幂等）；补传台账使缺次减少后，再次扫描该明细分值下调，缺次归零则该行 `is_deleted=TRUE`、分数回涨。
4. 「三违管理」类别合计扣分不超过类别上限 15；某人三违其它扣分已达 15 时，本笔罚分为 0。
5. 点「执行评分」后，未巡查人员 `score_auto/score_total` 正确下降、`grade` 相应变化；前端「三违管理」列显示扣分、明细可见「未检查」，「网格巡查」列完成率展示不变。
6. 台账上传完成后自动触发扫描（看服务日志 `[NativeImport]` / 本服务日志）。
7. 每日 01:00 定时任务不再报 `is_deleted` 相关错误（日志无「网格巡查校验不可用，降级跳过」）。
8. 冻结/未启动周期不被改动；扫描或写入异常不阻断「执行评分」和台账导入主流程。

## 九、交付物

- 新增 `server/services/gridUncheckedDeductionService.js`；
- 修改 `server/routes/hse-assessment-monthly.js`（/scoring/execute 接入扫描）；
- 修改 `server/routes/import.js`（网格导入后钩子）；
- 修改 `server/services/assessmentScheduler.js`（runGridCheck 改为月度扫描兜底）与 `server/services/assessmentEventService.js`（停用 GRID_MISS 滚动扣分）；
- 如指标缺失，附带幂等建标 SQL（`HSE-KPI-SAF-004`）；
- 自测：dry-run 输出 + 一处真实周期的前后分数对比截图/日志；列出改动文件与回滚方法（删除新服务引用即可回到旧行为，新明细按 `source_detail->>'kind'='grid_unchecked_monthly'` 可一键软删清理）。
