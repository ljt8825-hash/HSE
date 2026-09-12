# 第三轮提示词：网格未巡查扣分 —— 修复历史周期误扣 + 新增「人工改分锁定」小功能

> 本文件合并并取代第二轮要求。请先通读，再按顺序实现。范围仍限定在「未巡查/未检查」这一条扣分通路及其所依赖的通用算分口径，**不要**做通用规则引擎。所有结论均已在代码/数据库中定位核实。

---

## 〇、已审核确认正确、请勿改动的部分

- `server/services/gridUncheckedDeductionService.js` 主体口径：缺次=应巡−实巡、复用 `gridCompletionService.getGridPatrolStats`、读规则「未检查」(deduct_score=1, cumulative)、类别上限 15 钳制、`source_id=NULL` + `source_detail.kind='grid_unchecked_monthly'` 幂等键、写库后 `engine.recalculateTarget` 重算。
- 四处接线已就位：`hse-assessment-monthly.js` 的 `/scoring/execute`（recalculateCycle 之前、try/catch 不阻断）、`import.js` 网格导入后钩子、`assessmentScheduler.js` 的 `runGridCheck` 调用本服务、`assessmentEventService.js` 已停用 `GRID_MISS`。
- 类别汇总 SQL 已含 `deduction_type IN ('auto','chain_transmission','auto_deduction')`；共享服务 `server/services/assessmentRuleCategoryService.js`。
- DB 实测：规则「未检查/三违管理/cumulative/1分/enabled」、上限 15、指标 `HSE-KPI-SAF-004` active、台账表无 `is_deleted`、无一人多网格、台账姓名全部能匹配网格长。8月周期(id=24) dryRun 约 24 人应扣 1~6 分，结果合理。

---

## 一、本轮新增小功能：人工改分「锁定」+ 全系统统一「生效分」

### 1.1 要解决的真实问题（已核实，必须修）
系统已有扣分调整接口 `POST /api/.../deductions/adjust`（写 `hse_deduction_adjustment`，把明细置 `review_status='adjusted'`、`confirmed_score=新分值`）和审核确认接口（置 `review_status='approved'`、`confirmed_score=suggested_score`）。但存在两套互相矛盾的算分公式：

- **调整/审核接口**算总分时（`hse-assessment-monthly.js` 约 1680-1699 行）：
  `SUM(CASE WHEN review_status IN ('approved','adjusted') THEN confirmed_score ELSE 0 END)` —— 只认已审核/已调整，**pending 算 0**。
- **评分引擎** `getEffectiveDeductionTotal`（`server/services/assessmentScoringEngine.js` 304-315 行）：
  `SUM(suggested_score) WHERE review_status != 'rejected'` —— **完全不看 `confirmed_score`**。
- 网格同步服务 `gridUncheckedDeductionService` 每次重扫还会把 `suggested_score` 覆盖回自动值、缺次归 0 时直接软删该行。

**后果**：人工把「未检查」扣分从 5 改成 2（或审核确认、或豁免）后，下一次「执行评分」/台账重传/凌晨定时一跑，人工结果被覆盖、分数被弹回。这就是"更改扣分值不生效/留不住"的根因。

### 1.2 统一「生效分」口径（全系统唯一规则）
为每条扣分明细定义唯一的"生效分 effectiveScore"：

```
is_deleted=TRUE                         → 0
review_status='rejected'                → 0
review_status IN ('approved','adjusted')→ COALESCE(confirmed_score, suggested_score)   -- 人工已锁定
其余（'pending' 等）                     → suggested_score                              -- 自动值生效
```

要求：
1. 在 `assessmentScoringEngine.js` 中把 `getEffectiveDeductionTotal` 的 SQL 改为按上述 CASE 计算（`deduction_source IN ('auto','chain_transmission')` 过滤保留）：
   ```sql
   SELECT COALESCE(SUM(
     CASE WHEN review_status IN ('approved','adjusted')
          THEN COALESCE(confirmed_score, suggested_score)
          ELSE suggested_score END
   ),0)::numeric AS total
   FROM hse_assessment_deduction
   WHERE target_id=$1 AND cycle_id=$2 AND is_deleted=FALSE
     AND deduction_source IN ('auto','chain_transmission')
     AND review_status <> 'rejected';
   ```
2. 把扣分调整接口里那段"只 SUM approved/adjusted、pending 算 0"的总分重算（约 1680-1699 行）改为调用同一口径（建议抽成引擎导出的公共函数，如 `engine.getEffectiveDeductionTotal` 或新增 `engine.recalculateTarget` 直接复用），**不要再用 pending=0 的旧公式**。审核通过/驳回等其它改 `review_status/confirmed_score` 的地方，重算目标分时也统一走该口径。
3. 排查并统一其它汇总扣分的位置（如导出/列表 `excel.vue` 对应后端、`hse-assessment-monthly.js` 内 2268、2479 行附近），确保"生效分"展示与算分一致：approved/adjusted 显示 `confirmed_score`，pending 显示 `suggested_score`。

### 1.3 自动扫描必须尊重「人工锁定」
改 `gridUncheckedDeductionService.js`：
1. 查找本通路已有行时（`findExisting`），额外取 `review_status, confirmed_score`。
2. 若已有行 `review_status IN ('approved','adjusted')`（人工已处理=锁定）：
   - **不得** UPDATE `suggested_score/confirmed_score/source_detail`，**不得**软删；
   - 跳过写操作，`details` 中记 `action:'locked'`，并把本次自动算出的参考值放进返回（不写库或仅写入 `source_detail.autoReference` 这类不影响分数的参考字段，二选一，建议不写库以免污染）；
   - 即使缺次归 0（`revokeDeduction` 场景）也**不得**软删锁定行——人工决定保持，直到人工解锁。
3. 仅对 `review_status='pending'`（含曾被软删）的行执行现有的 upsert / 复活 / 软删逻辑。
4. `otherSanweiScore`（三违类别上限钳制）统计"其它已生效扣分"时，也按 1.2 的生效分口径取值（approved/adjusted 用 confirmed_score），避免上限误算。

### 1.4 新增「恢复自动计算（解锁）」动作
- 后端新增接口（建议 `POST /api/hse-assessment-monthly/deductions/:id/unlock`，权限同调整接口）：
  - 仅允许对 `review_status IN ('approved','adjusted')` 且 `source_detail->>'kind'='grid_unchecked_monthly'`（本期范围）的明细操作；冻结对象拒绝。
  - 置 `review_status='pending'`、`confirmed_score=NULL`、`updated_at=NOW()`；在 `hse_deduction_adjustment` 写一条 `operation_type='UNLOCK'` 记录（原因如"恢复自动计算"）；随后调用 `gridUncheckedDeductionService.syncGridUncheckedDeductions(cycleId)` 让自动值立即接管，再 `recalculateTarget`。
  - 记审计日志。
- 前端在「扣分调整/扣分审核」页对这类锁定行提供"恢复自动"按钮（见第四节）。

> 说明：本期"锁定"复用现有 `review_status`（approved/adjusted 即锁定）与 `confirmed_score`，**不新增数据库列**。豁免某人=把该条调整为 0 分（confirmed_score=0，adjusted）即锁定为不扣。

---

## 二、P0：修复「无台账历史周期全员误扣」炸弹

### 2.1 现象（dryRun 已复现）
自动触发扫描所有 `pending_review/reviewed` 周期；6月(id=28)/7月(id=27)周期在 `grid_inspection_records` 无当月台账 → 每人 actual=0 → missing=应巡次数 → 每人扣满 15。6月已误生成过 62 条（后被软删），且 `findExisting` 只查 `is_deleted=FALSE`，重扫会再次 INSERT 有效行，把历史周期分数改成 85。

### 2.2 修复（两处）
1. **服务内加"台账覆盖"守卫**（`syncGridUncheckedDeductions`，对所有调用方生效）：算出 year/month 后、加载网格前，先统计该考核月台账条数；日期口径必须与 `getGridPatrolStats` 一致（同一日期列、同月界/时区）：
   ```sql
   SELECT COUNT(*)::int AS c FROM grid_inspection_records
   WHERE inspection_date >= make_date($1,$2,1)
     AND inspection_date <  make_date($1,$2,1) + INTERVAL '1 month';
   ```
   `c=0` 时直接返回 `{ ok:false, reason:'no-ledger-data', year, month, scanned:0, affected:0 }`，**不写扣分、不重算**；`/scoring/execute` 视其为正常（不阻断），审计/响应带上 reason。
2. **收窄自动触发周期范围**：`import.js` 网格导入钩子（约 3028-3039）与 `assessmentScheduler.runGridCheck`（约 350-355）的选周期 SQL 由
   `status IN ('in_progress','pending_review','reviewed')` 改为**仅当前在评周期**：
   ```sql
   SELECT id FROM hse_assessment_cycle
   WHERE is_deleted=FALSE AND status='in_progress'
     AND start_time <= NOW() AND end_time >= NOW()
   ORDER BY id DESC LIMIT 1;
   ```
   手动「执行评分」仍可对管理员选定周期执行，但同样受 2.1 守卫保护。

---

## 三、P1 收尾项

1. **清理第一轮测试残留**（确认后执行）：当前 62 条 `kind='grid_unchecked_monthly'` 均为 cycle 28 的软删测试数据，8月周期尚无正式明细。
   ```sql
   SELECT cycle_id, is_deleted, COUNT(*) FROM hse_assessment_deduction
   WHERE source_detail->>'kind'='grid_unchecked_monthly' GROUP BY 1,2;  -- 先确认
   DELETE FROM hse_assessment_deduction WHERE source_detail->>'kind'='grid_unchecked_monthly';
   ```
2. **软删行"复活"而非新增**：`upsertDeduction` 查找时不要限定 `is_deleted=FALSE`（按 target+cycle+source_table+kind+deductKey 取最新一条）；命中 `is_deleted=TRUE` 且未锁定时，`UPDATE ... SET is_deleted=FALSE, suggested_score=$1, source_detail=$2, review_status='pending', confirmed_score=NULL, updated_at=NOW()`；命中未删除走更新/无变化；未命中再 INSERT。避免软删残骸累积。
3. **`actual===0` 标记**：`details` 中对 `actual===0` 的人加 `actualZero:true`，便于人工区分"真没巡查/数据缺失"（配合 2.1 守卫，正常当月不应再出现整月 actual=0）。

---

## 四、前端（最小改动，先核对再改）

- 现有 `views/hse/assessment-monthly/deduction-adjust.vue`、`deduction-review.vue` 已提供调整/审核界面。请确认：
  1. 「未检查」自动扣分能在扣分调整/审核列表出现，调整时必填"调整原因"，调整后该行状态显示为"已调整/已确认（锁定）"，生效分显示 `confirmed_score`。
  2. 对 `kind='grid_unchecked_monthly'` 且已锁定的行，新增"恢复自动"按钮，调用 1.4 的 unlock 接口；pending 行不显示该按钮。
  3. 明细展示 `source_detail.summary`（未检查（本月应巡X次/实巡Y次/缺Z次））；若列表/详情未展示，补上。
- `targets.vue`/`scoring.vue` 当前**没有**按大类（三违管理/网格巡查）渲染列，后端 `category_deductions` 未被消费。本期**不新增大类列**；"在三违管理看到扣分"通过扣分审核/调整/导出中类别归为「三违管理」、明细名「未检查」体现。若业务方坚持要在考核结果表新增"三违管理"得分列，属新增需求，先提出再做，勿自行扩表。
- 「网格巡查」完成率展示保持不变。

---

## 五、明确不要做

- 不做通用规则引擎；不改其它类别（隐患/培训/会议/三违行为等）扣分口径。
- 不新增数据库列/表（复用 review_status、confirmed_score、hse_deduction_adjustment）。
- 不自动改动 `pending_review/reviewed/frozen` 历史周期分数（守卫+范围收窄后满足）。
- 人工锁定行不得被任何自动流程覆盖或删除。

---

## 六、验证步骤（逐项执行并回报实际输出/截图）

1. **重启后端**（第一轮代码在磁盘但进程未加载，8月周期至今 56 人全 100、0 明细）。
2. **历史周期守卫**：对 cycle 28 dryRun → 应 `{ok:false, reason:'no-ledger-data'}`，不写扣分、不改分；6月/7月目标分仍全 100。
3. **8月 dryRun**（cycle 24）：约 24 人扣 1~6 分、32 人无动作、6 人非考核对象跳过；与网格巡查管理页完成率一致。
4. **正式执行评分**：响应 `grid_unchecked.ok=true, affected≈24`；库中约 24 条有效 `未检查` 行（`source_id IS NULL`），目标表出现 score_auto<100。
5. **幂等**：再次执行评分，有效行数/分数不变。
6. **【新功能核心】人工改分锁定**：
   - 选一条「未检查」扣分（如自动 5 分），调调整接口改为 2 分、填原因；该 target 分数按 2 分重算。
   - 再次「执行评分」+ 再次触发台账同步：该行仍为 2 分（`review_status='adjusted'`、`confirmed_score=2` 不被覆盖），target 分数不变；`details` 中该人 `action='locked'`。
   - 把某人调整为 0 分（豁免）→ 重扫后仍不扣。
   - 调"恢复自动"解锁后再扫：该行回到自动值并参与重算。
7. **统一口径**：调整某行后，目标 score_auto = 100 − Σ生效分（pending 用 suggested、adjusted/approved 用 confirmed）；与扣分审核/导出页显示一致，不得出现 pending 算 0 或 confirmed 被忽略。
8. **上限**：三违类别合计生效分不超过 15；锁定行按 confirmed_score 参与上限统计。
9. **回退链路**：补传台账使某 pending 人缺次减少 → 分值下调；缺次归 0 → 该行软删/复活复用、分数回涨；锁定人不受影响。
10. 回报：改动文件清单、每步输出、第四节前端核对结果（是否需要新增大类列的业务结论）。

## 七、回滚
- 代码：移除 `/scoring/execute`、`import.js`、`assessmentScheduler.js` 对 `gridUncheckedDeductionService` 的引用即回到旧行为（GRID_MISS 保持停用）；生效分口径改动如须回退，恢复 `getEffectiveDeductionTotal` 原 SQL。
- 数据：`UPDATE hse_assessment_deduction SET is_deleted=TRUE WHERE source_detail->>'kind'='grid_unchecked_monthly';` 后重跑执行评分还原；人工解锁用 1.4 接口。
