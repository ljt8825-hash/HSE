# 交付报告：网格长「未巡查/未检查」月度自动扣分通路修复

> 任务提示词：`prompts/grid-unchecked-deduction-fix.md`
> 交付日期：2026-08-30
> 范围：只修「未巡查/未检查」这一条扣分通路，未做通用规则引擎改造

---

## 一、改动文件清单

| # | 文件 | 类型 | 改动说明 |
|---|------|------|---------|
| 1 | `server/services/gridUncheckedDeductionService.js` | 新增 | 月度缺巡扫描 + 幂等 upsert + 类别上限钳制 + dryRun（核心服务） |
| 2 | `server/services/assessmentRuleCategoryService.js` | 新增 | 扣分规则名 → 类别 解析服务（30s 缓存，供路由与服务复用） |
| 3 | `server/services/assessmentScoringEngine.js` | 修改 | 导出 `ensureTargetScoreRecord`（供新服务复用） |
| 4 | `server/routes/hse-assessment-monthly.js` | 修改 | `/scoring/execute` 执行评分前当场扫描缺巡；`sumDeductionsByCategory` 过滤补齐 `auto_deduction`；目标扣分明细接口返回 `summary` |
| 5 | `server/routes/import.js` | 修改 | 网格台账导入成功钩子后，追加缺巡扫描（对全部进行中周期，幂等） |
| 6 | `server/services/assessmentScheduler.js` | 修改 | `runGridCheck` 重写：删除引用不存在的 `pg.is_deleted` 的滚动窗口 SQL，改为按月度口径遍历进行中周期同步 |
| 7 | `server/services/assessmentEventService.js` | 修改 | `dispatch` 中 `GRID_MISS` 改为跳过（停用旧滚动扣分，避免与新月度扣分重复） |
| 8 | `安全看板vben/apps/web-naive/src/api/hse/assessment-monthly.ts` | 修改 | `TargetDeduction` 增加 `summary` 字段 |
| 9 | `安全看板vben/apps/web-naive/src/views/hse/assessment-monthly/scoring.vue` | 修改 | 扣分明细抽屉增加「说明」列，展示 `source_detail.summary`（应巡/实巡/缺次） |

---

## 二、实现说明

### 2.1 核心服务 `gridUncheckedDeductionService.js`

`syncGridUncheckedDeductions(cycleId, { dryRun })` 按以下步骤执行：

1. **周期守卫**：`frozen`/`not_started` 直接返回 `{ok:false, reason}`；年份月份取 `assessment_year/month`，为空则按 `start_time` 推导。
2. **规则配置**（容错默认值）：只读规则库「未检查」一条（`category='三违管理'`、`rule_name` 匹配「未检查/未巡查」）。`unit=deduct_score||1`、`cumulative = (deduct_type==='cumulative')`。`deduction_item` 逐字写 `rule_name`，保证被 `sumDeductionsByCategory` 归入「三违管理」列。
3. **指标保障**：`metric_code` 为空或不存在时，幂等补建 `HSE-KPI-SAF-004`（`metric_name='网格未巡查（未检查）'`、`category='SAFETY'`、`metric_type='auto'`、`data_source='grid_inspection_records'`）。**未使用** `HSE-KPI-GRD-001`（网格类）。
4. **类别上限**：`hse_assessment_category_limit.max_deduct`（当前 15）；未配置则为 `Infinity`。
5. **应巡/实巡**：复用 `gridCompletionService.getGridPatrolStats(grids, {year, month, hireDateByGrid})`，按 `personnel_id` 跨网格聚合 `expected/actual`；`missing = max(0, expected − actual)`。
6. **只处理本周期考核对象**：`engine.findAssessmentTarget(cycleId, personnelId)`，非对象计入 `skipped`。
7. **类别上限钳制**：先算该对象本周期「三违管理」类别下、除本通路外的有效扣分 `otherCatScore`（按规则名匹配类别，排除 `source_detail.kind='grid_unchecked_monthly'` 行）；`rawScore = cumulative ? missing*unit : (missing>0?unit:0)`；`cappedScore = min(rawScore, max(0, cap − otherCatScore))`。
8. **幂等 upsert（避开 BIGINT 坑）**：`source_id` 一律 `NULL`，稳定唯一键存 `source_detail.kind='grid_unchecked_monthly'` + `source_detail.deductKey='grid-unchecked:'+cycleId+':'+employeeId`。`source_detail` 含 `{kind, deductKey, ruleName, category, eventType:'GRID_UNCHECKED', expected, actual, missing, unit, rawScore, cap, cappedScore, year, month, summary:'未检查（本月应巡X次/实巡Y次/缺Z次）'}`。`deduction_type='auto_deduction'`、`source_table='grid_inspection_records'`、`review_status='pending'`、`is_transmission=FALSE`。
   - 缺次>0 且可扣 → INSERT 或 UPDATE（分值或明细变化才更新，含 jsonb 键序稳定比较）；
   - 缺次=0 或钳制为 0 且已有行 → `is_deleted=TRUE`（补传台账自动回退扣分）。
   - **不调用** `engine.addAutoDeduction()`（按 source_id 幂等、会触发规则层 scale_factor 换算，口径冲突）。
9. **重算分数**：对发生增/改/删的 target 调 `engine.recalculateTarget(cycleId, targetId)`。
10. **dryRun**：只算不写，返回 `details` 供人工核对（`action` 为 `noop/none/inserted/updated/removed` 之一）。

### 2.2 接入点 1：执行评分当场扫描

`POST /scoring/execute` 在 `engine.recalculateCycle(cycle_id)` **之前**调用 `syncGridUncheckedDeductions(cycle_id)`；失败仅告警、不阻断评分。审计日志 detail 与响应体新增 `grid_unchecked: {ok, scanned, affected, dryRun}`。

### 2.3 接入点 2：台账上传后立即扫描

`import.js` 网格导入成功钩子（`recalculateAllCompletionRates()` 之后）追加：查询 `status IN ('in_progress','pending_review','reviewed')` 的周期逐一 `syncGridUncheckedDeductions`；失败仅告警、不影响导入结果。

### 2.4 接入点 3：定时任务兜底 + 停用旧滚动扣分

- `runGridCheck()` 重写：删除引用 `pg.is_deleted` 的滚动窗口 SQL 与「总3/一级2/二级2/三级1」梯度扣分，改为遍历进行中周期调用月度同步（与手动同一幂等 upsert，不会重复扣分）。cron 保留每日 01:00 兜底。
- `assessmentEventService.dispatch` 的 `GRID_MISS` 分支改为 `{skipped:'grid-miss-disabled', reason:'…改由月度统一扫描扣分'}`，不再产生 `HSE-KPI-GRD-001` 滚动扣分。

### 2.5 前端最小调整

web-naive `scoring.vue` 扣分明细抽屉增加「说明」列（`source_detail.summary`），未巡查行显示「未检查（本月应巡X次/实巡Y次/缺Z次）」，其余行显示 `-`。「三违管理」动态维度列无需改动（`category_deductions` 按规则名自动计入）。

---

## 三、自测结果（本地库 safety_dashboard）

> 全部自测完成并已**回滚**，未残留测试数据。

### 3.1 dryRun 输出（周期 #28 · 2026-06）

`syncGridUncheckedDeductions(28, {dryRun:true})` → `scanned=62`，`affected=0`（不写库）。样本：

```
李忠胜 应巡30 实巡0 缺30  raw=30 capped=15 action=noop
李先菊 应巡30 实巡0 缺30  raw=30 capped=15 action=noop
韩晓亮 应巡15 实巡0 缺15  raw=15 capped=15 action=noop
```

### 3.2 真实执行 + 幂等 + 分数对比（周期 #28）

- 真实执行：`affected=62`，62 条明细全部 `inserted`，`suggested_score=15`（全部被类别上限钳制到 15）。
- 复跑：`affected=0`（幂等，无重复明细）。
- 分数：对象 `score_auto=100 → 85`，`score_total=85`，`grade` 相应变化；`三违管理` 类别合计 = 15 ≤ 上限 15。
- 落库明细示例：
  ```
  #35 target=654 HSE-KPI-SAF-004 未检查 auto_deduction/auto score=15.00
      | 未检查（本月应巡30次/实巡0次/缺30次）
  ```
- 类别归属：62/62 条按 `deduction_item='未检查'` 匹配到规则「未检查」→ 类别「三违管理」。

### 3.3 真实数据周期（周期 #24 · 2026-08，台账 1655 条）dryRun

```
scanned=62  缺巡>0=24  无缺巡=32
李忠胜 应巡30 实巡29 缺1 扣1   action=noop
张和祥 应巡30 实巡28 缺2 扣2   action=noop
孙建栋 应巡30 实巡26 缺4 扣4   action=noop
刘秀梅 应巡30 实巡30 缺0 none（无缺巡不扣）
```

结论：比例扣分（缺1扣1/缺2扣2/缺4扣4）、无缺巡不扣、有实巡者正确折算，均符合业务口径。

### 3.4 回滚自测数据

对周期 #28 的 62 条自测明细执行 `is_deleted=TRUE` 并 `recalculateTarget` 后：剩余有效缺巡明细=0，62 个对象 `score_auto` 全部恢复 100。**测试数据已清理，库内无残留。**

---

## 四、上线前预检 SQL（先跑，人工确认姓名匹配）

```sql
-- 1) 规则配置（应能查到 未检查 / 三违管理 / cumulative / 1）
SELECT id, rule_name, category, metric_code, deduct_type, deduct_score, status
FROM hse_assessment_rule
WHERE is_deleted=FALSE AND category='三违管理'
  AND (rule_name LIKE '%未检查%' OR rule_name LIKE '%未巡查%');

-- 2) 类别上限（确认三违管理=15）
SELECT category, max_deduct FROM hse_assessment_category_limit WHERE category='三违管理';

-- 3) 台账表确无 is_deleted 列（预期 0 行）
SELECT 1 FROM information_schema.columns
WHERE table_name='grid_inspection_records' AND column_name='is_deleted';

-- 4) 网格长姓名匹配核对：ledger_match_cnt=0 的人需人工确认是真没巡查还是姓名不一致
SELECT ga.id AS grid_id, ga.name AS grid_leader_name, ga.personnel_id, ga.grid_level,
       ga.patrol_frequency,
       (SELECT COUNT(*) FROM grid_inspection_records r WHERE r.personnel_name = ga.name) AS ledger_match_cnt
FROM grid_areas ga
WHERE ga.is_deleted=FALSE AND ga.personnel_id IS NOT NULL
ORDER BY ledger_match_cnt ASC;

-- 5) 当月实巡人次（dry-run 对照）
SELECT r.personnel_name, COUNT(*) AS actual_cnt
FROM grid_inspection_records r
WHERE r.inspection_date >= date_trunc('month', NOW())
GROUP BY r.personnel_name;
```

---

## 五、幂等建标 SQL（指标缺失时补建 HSE-KPI-SAF-004）

> 服务内 `ensureMetric()` 已幂等自动补建；如需手工预建，执行：

```sql
INSERT INTO hse_assessment_metric
  (metric_code, metric_name, category, target_post, base_score, metric_type,
   data_source, calc_formula, sort_order, status, remark)
VALUES
  ('HSE-KPI-SAF-004', '网格未巡查（未检查）', 'SAFETY', 'all', 0, 'auto',
   'grid_inspection_records',
   '网格长本月缺巡次数×单次分值，受三违管理类别上限钳制', 12, 'active',
   '自动考核：网格长未巡查（未检查）月度缺次扣分，计入三违管理类别')
ON CONFLICT (metric_code) DO UPDATE SET is_deleted=FALSE;
```

---

## 六、回滚方法

### 6.1 代码回滚

- 删除新服务引用即可回到旧行为：
  - `server/routes/hse-assessment-monthly.js`：移除 `gridUncheckedDeduction` 的 require 与 `/scoring/execute` 中的扫描调用；
  - `server/routes/import.js`：移除 `gridUncheckedDeduction` 的 require 与上传钩子；
  - `server/services/assessmentScheduler.js`：`runGridCheck` 还原为旧滚动窗口逻辑（或直接停用该 cron）；
  - `server/services/assessmentEventService.js`：`GRID_MISS` 分支还原为 `await onGridMiss(...)`；
  - `server/services/assessmentScoringEngine.js`：移除 `ensureTargetScoreRecord` 导出（非必要）。
- 可整体删除 `server/services/gridUncheckedDeductionService.js` 与 `server/services/assessmentRuleCategoryService.js`。

### 6.2 数据清理（一键软删本通路明细 + 重算）

```sql
-- 软删所有「网格未巡查」月度明细（含已软删的历史行可加条件）
UPDATE hse_assessment_deduction
SET is_deleted=TRUE, updated_at=NOW()
WHERE source_detail->>'kind'='grid_unchecked_monthly' AND is_deleted=FALSE;

-- 之后对该周期点一次「执行评分」即可让 score_auto/score_total 回涨（或等待每日 02:00 全量校验）。
```

> 说明：历史自测已回滚，当前库内 `source_detail->>'kind'='grid_unchecked_monthly'` 的有效明细为 0 条。

---

## 七、注意事项与遗留观察

1. **台账数据只到 2026-08**（`grid_inspection_records` 共 1655 条，全部为 8 月）。6/7 月周期无台账数据，若对该周期点「执行评分」，所有网格长将按缺巡全额扣分并被钳制到类别上限 15——这是**真没巡查**的合理结果，但请结合第 4 条姓名匹配预检确认。
2. **姓名匹配**：`actual=0` 的人员需人工确认是「真没巡查」还是 `grid_areas.name` 与台账 `personnel_name` 写法不一致（多空格/别名/同音字），不一致先修数据避免误扣。
3. **类别上限口径**：本次让上限对「未检查」这笔扣分生效（钳制到 `cap − 三违其它有效扣分`），未改造其它类别上限执行。
4. **旧 GRID_MISS 滚动扣分已停用**，其历史事件日志（`hse_assessment_event_log`）中的历史 `GRID_MISS` 行保留不动，不产生新扣分。
5. **前端**：`三违管理` 列会自动计入「未检查」（`category_deductions` 按规则名匹配）；明细抽屉新增「说明」列展示应巡/实巡/缺次。
