# 第四轮提示词：网格未巡查扣分 —— 前端解锁入口 + 自动触发范围修正 + 收尾

> 第三轮后端经审核与数据库实测，核心逻辑全部正确且已上线（8月周期 24 人已扣，分数 94~100；6/7月历史周期守卫生效仍全 100；锁定/解锁后端脚本验证通过）。本轮只做**前端补齐、一个触发范围修正、数据收尾**，不要重写后端已验证正确的逻辑，不要扩大范围。

---

## 〇、已验证正确、请勿改动

- `assessmentScoringEngine.getEffectiveDeductionTotal` 的生效分 CASE；adjust/approve/reject/batch 全部走 `engine.recalculateTarget`；列表/导出 3 处生效分展示（hse-assessment-monthly.js 约 140、2319、2553 行）。
- `gridUncheckedDeductionService.js`：no-ledger-data 守卫、锁定返回 `locked`（upsert/revoke 均不覆盖不软删 approved/adjusted 行）、软删复活、`actualZero`、`otherSanweiScore` 生效分口径。
- 解锁后端接口 `POST /api/hse-assessment-monthly/deductions/:id/unlock`（已实现并经 `server/scripts/_verify3_*.js` 验证）。
- DB 现状：8月周期(id=24) 有 24 条有效「未检查」明细（review_status=pending），目标分 94~100；6月(28)/7月(27) 全 100；旧 62 条测试残留已清理。

---

## 一、P0：前端补齐「恢复自动（解锁）」入口（后端已就绪，前端缺失）

后端接口已可用，但前端 `apps/web-antd/src/api/hse/assessment-monthly.ts` 无 unlock 方法、`views/hse/assessment-monthly/` 下扣分调整/审核页无按钮，导致功能在界面上不可达。

1. **API**：在 `assessment-monthly.ts` 仿照 `adjustDeduction` 新增：
   ```ts
   export function unlockDeduction(deductionId: number | string) {
     return requestClient.post<void>(`${BASE}/deductions/${deductionId}/unlock`, {});
   }
   ```
2. **按钮**：在扣分调整页 `deduction-adjust.vue` 与扣分审核页 `deduction-review.vue` 的操作列，对**同时满足**以下条件的行显示「恢复自动」按钮：
   - `source_detail?.kind === 'grid_unchecked_monthly'`
   - `review_status` 为 `approved` 或 `adjusted`（即已锁定）
   - 对象未冻结（target 状态非 frozen，沿用页面现有冻结判断）
   - pending / rejected 行不显示。
   点击后二次确认（提示"将解除人工锁定，恢复为系统自动计算的分值"），调用 `unlockDeduction`，成功后刷新列表与目标分数。
3. **状态与生效分展示**：
   - 列表中 review_status 文案补充：`adjusted` 显示"已调整（锁定）"、`approved` 显示"已确认（锁定）"；
   - 生效分列：approved/adjusted 显示 `confirmed_score`，pending 显示 `suggested_score`（与后端口径一致）；
   - 对本通路行展示 `source_detail.summary`（"未检查（本月应巡X次/实巡Y次/缺Z次）"）作为扣分说明/tooltip；若当前列表未取 source_detail，请确认列表接口已返回该字段（后端 2451 行附近已 select source_detail）。
4. 调整弹窗保持"调整原因必填"；把某条调整为 0 即视为豁免（confirmed_score=0、adjusted 锁定）。

---

## 二、P0：修正自动触发范围，恢复"上传即扫描"（当前月补传要能自动重扫）

### 问题（已核实）
8月周期(id=24) 现为 `pending_review`（执行过评分），而第三轮把 `import.js` 钩子与 `assessmentScheduler.runGridCheck` 的选周期 SQL 收窄为**仅** `status='in_progress'`。当前系统没有 in_progress 周期 → **现在补传8月台账不会自动重扫**，必须人工再点"执行评分"，与"台账上传完成后立即扫描"的预期不符。

### 修法（依赖已上线的 no-ledger-data 守卫，安全）
守卫已保证：任何"该月无台账"的周期在服务内直接 `no-ledger-data` 跳过、不写扣分。因此可安全把自动范围放宽到"在评 + 待审核"，**排除 reviewed/frozen**：

- `server/routes/import.js`（约 3029-3036）与 `server/services/assessmentScheduler.js`（约 351-357）的选周期 SQL 改为：
  ```sql
  SELECT id FROM hse_assessment_cycle
  WHERE is_deleted=FALSE
    AND status IN ('in_progress','pending_review')
    AND start_time <= NOW() AND end_time >= NOW()
  ORDER BY id DESC
  ```
  （去掉 `LIMIT 1`，允许跨当前在评/待审核周期；6月/7月虽 status=pending_review 但 end_time 已早于 NOW()，被时间窗排除；即便被选中，也会被服务内 no-ledger-data 守卫跳过。）
- 更稳妥的做法（二选一，推荐）：import 钩子直接按**本次导入台账的年月**定位周期（从导入记录的 inspection_date 取年月），对该周期 `status IN ('in_progress','pending_review')` 时扫描；这样补传哪个月就重扫哪个月，reviewed/frozen 不动。定时任务保持"时间窗内 in_progress+pending_review"。
- 不得扫描 `reviewed`、`frozen` 周期。
- 修正后自测：8月周期(pending_review) 补传/重传台账后，缺次变化能自动反映到扣分与目标分，无需人工点执行评分；6/7月仍 0 改动。

---

## 三、P1 数据收尾

1. **清理测试调整记录**：`hse_deduction_adjustment` 中 id 11~15 为第三轮脚本验证产生的"验证/临时测试"ADJUST/UNLOCK 记录（对应明细 96/119，现已还原 pending）。先查后删：
   ```sql
   SELECT * FROM hse_deduction_adjustment
   WHERE adjustment_reason LIKE '%测试%' OR adjustment_reason LIKE '%验证%';
   -- 确认均为本轮测试数据后删除
   DELETE FROM hse_deduction_adjustment
   WHERE adjustment_reason LIKE '%测试%' OR adjustment_reason LIKE '%验证%';
   ```
   （这两条明细 96/119 本身是真实8月扣分，保持 pending 不变。）
2. **调整版本链 is_current**：unlock/adjust 插入新版本时未把同 deduction 的旧 `is_current` 置 FALSE，可能出现多条 is_current=TRUE。请在插入 ADJUST/UNLOCK 记录前，先 `UPDATE hse_deduction_adjustment SET is_current=FALSE WHERE deduction_id=$1`，再插新行 is_current=TRUE。

---

## 四、明确不要做
- 不改后端已验证的生效分口径、锁定/守卫/复活逻辑。
- 不新增大类得分列（仍在扣分审核/调整/导出体现三违管理）；如业务确需考核结果表"三违管理"列，另行提需求。
- 不自动改动 reviewed/frozen 周期。
- 不新增数据库表/列。

---

## 五、验证（逐项回报截图/输出）

1. 前端：对一条已调整/已确认的「未检查」行，能看到"恢复自动"按钮；点击→确认→列表刷新后该行回到 pending、分值变为自动值、目标分同步变化；pending 行无此按钮。
2. 前端：锁定行状态显示"已调整（锁定）/已确认（锁定）"，生效分显示 confirmed_score；本通路行显示应巡/实巡/缺次说明。
3. 触发范围：8月周期(pending_review) 下重传/补传台账，缺次变化自动反映（无需点执行评分）；6月/7月周期分数与明细 0 变化（守卫跳过）。
4. 调整为 0 分（豁免）后重扫：仍不扣分且行保持锁定；点"恢复自动"后回到自动值。
5. 数据：测试调整记录已删；调整历史同一 deduction 仅一条 is_current=TRUE。
6. 回归：8月 24 人扣分仍为 94~100 分布；再次执行评分幂等不变；人工锁定行不被覆盖。
7. 回报改动文件清单与每步结果。
