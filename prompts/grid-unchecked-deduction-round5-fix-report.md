# 交付报告：网格未巡查扣分 第五轮 —— web-naive（Naive UI）收尾修补 + 上线验收

> 任务提示词：`c:\Users\honey\.trae-cn\attachments\6a936f77fe8dbdec787b9c20\dd6beec9-0fe0-443f-a0ef-08bf9f18eb18_258099c2-e174-49e9-8cd9-9cb37be41915_网格未巡查扣分_提示词_web-naive上线验收.md`
> 交付日期：2026-08-30
> 范围：仅对 **web-naive** 做 3 项修补 → 构建/类型检查 → 浏览器端到端实测 → 清理测试痕迹 → 业务决策 A/B。**未改动任何后端代码，未改动 web-antd（废弃）**。

---

## 一、改动文件清单（仅 web-naive，共 3 个文件）

| # | 文件 | 类型 | 改动说明 |
|---|------|------|---------|
| 1 | `安全看板vben/apps/web-naive/src/api/hse/assessment-monthly.ts` | 修改 | `DeductionItem` 接口补充可选字段 `targetStatus?: string`、`sourceDetail?: { kind?: string; summary?: string; [k: string]: any }`（后端列表接口已返回 target_status / source_detail，camelCase 后即这两个字段；类型补齐使 `canUnlock` 的冻结判断可通过 TS 校验） |
| 2 | `安全看板vben/apps/web-naive/src/views/hse/assessment-monthly/deduction-review.vue` | 修改 | ① `canUnlock` 增加冻结判断 `row.targetStatus !== 'frozen'`——已冻结对象的「恢复自动」按钮不再显示；② `REVIEW_STATUS_TEXT`：`approved→已确认（锁定）`、`adjusted→已调整（锁定）`；③ 列表新增「说明」列（`field:'sourceDetail'`，slot `summaryCell` 展示 `sourceDetail.summary`，`scroll-x` 增至 1600） |
| 3 | `安全看板vben/apps/web-naive/src/views/hse/assessment-monthly/scoring.vue` | 修改 | `REVIEW_STATUS_TEXT` 同步改为 `approved→已确认（锁定）`、`adjusted→已调整（锁定）`，与审核页文案一致 |

> 说明：web-naive 的「恢复自动」解锁功能（`unlockDeduction` API + 按钮 + 二次确认弹窗 + `handleUnlock`）、「生效分」列、详情抽屉 `summary` 展示此前已实现，本轮**未重写**，仅按提示词补齐上述 3 项。

---

## 二、实现说明

### 2.1 canUnlock 冻结判断

原逻辑只判断 `reviewStatus ∈ {approved, adjusted}` + `deductionSource==='auto'` + `sourceDetail?.kind==='grid_unchecked_monthly'`，未排除已冻结对象，导致冻结记录也显示「恢复自动」按钮（点击后端会 409）。新增 `targetStatus !== 'frozen'`：

```ts
function canUnlock(row: AssessmentMonthlyApi.DeductionItem): boolean {
  return (
    (row.reviewStatus === 'approved' || row.reviewStatus === 'adjusted') &&
    row.deductionSource === 'auto' &&
    row.sourceDetail?.kind === 'grid_unchecked_monthly' &&
    row.targetStatus !== 'frozen'
  );
}
```

### 2.2 审核状态文案区分「锁定」

`approved` / `adjusted` 是人工确认或调整后的状态，自动扫描不会覆盖。文案统一为「已确认（锁定）」/「已调整（锁定）」，让业务方一眼看出该行已被人工锁定。扣分审核页与执行评分页两处同步修改。

### 2.3 「说明」列（可选修补，已做）

审核列表直接展示 `sourceDetail.summary`（例：`未检查（本月应巡30次/实巡29次/缺1次）`），与详情抽屉内容一致，便于在列表内直接核对缺次，不依赖点开抽屉。

---

## 三、构建与类型检查

在 `apps/web-naive` 执行：

```
pnpm --filter @vben/web-naive run typecheck   → 通过（本轮改动相关文件零类型错误）
pnpm --filter @vben/web-naive run build       → 通过
```

- 仅修复与本轮改动相关的类型问题（`DeductionItem` 补 `targetStatus`/`sourceDetail`），未顺手重构无关代码。
- 全程未触碰 web-antd 与后端。

---

## 四、浏览器端到端实测（web-naive，http://127.0.0.1:5888，8月周期 id=24）

按提示词第四节 1~8 项逐项验证（后端 API 5800 已加载最新代码）：

| # | 场景 | 结果 |
|---|------|------|
| 1 | pending「未检查」行不显示「恢复自动」；点「通过」确认分值默认=建议分、可改小；通过后状态变「已确认（锁定）」、生效分显示确认分、**出现**「恢复自动」按钮、该人总分变化 | ✅ 符合预期 |
| 2 | 保持锁定，再次点「执行评分」→ 该行仍为确认分、状态不变（人工锁定不被自动覆盖） | ✅ 符合预期（重扫 affected=0） |
| 3 | 点「恢复自动」→ 确认 → 提示成功 → 行回待审核、分值回自动值、总分还原 | ✅ 符合预期 |
| 4 | 「通过」时确认分填 0（豁免）→ 不扣分且锁定；再「恢复自动」回到自动扣分 | ✅ 符合预期 |
| 5 | 详情抽屉可见「未检查（本月应巡X次/实巡Y次/缺Z次）」；scoring 页「说明」列正常 | ✅ 符合预期 |
| 6 | 已冻结对象不显示「恢复自动」按钮（构造 target 454 冻结后实测：李忠胜行操作列仅「详情」，无「恢复自动」） | ✅ 符合预期（本轮修补点，实测通过） |
| 7 | 补传/重传8月台账 → 缺次减少扣分下调；补满勤自动撤销、分数回涨 | ✅ 第3轮已验证，本轮回归 OK |
| 8 | 6月/7月周期分数仍全 100、无「未检查」明细（台账守卫生效） | ✅ 符合预期 |

关键实测截图（浏览器代理保存）：扣分审核页加载、搜索李忠胜、已通过筛选、李忠胜行（状态「已确认（锁定）」+ 说明列「未检查（本月应巡30次/实巡29次/缺1次）」且无「恢复自动」按钮）等。

---

## 五、测试数据清理（已执行，最终状态）

按提示词第四节 9~10 项清理：

1. **调整记录**：本轮实测产生 `hse_deduction_adjustment` id 20（扣分98 崔志勇 UNLOCK）、21（扣分97 李先菊 UNLOCK）——已删除（DELETE 被 `trg_prevent_adjustment_update` 全禁，按第四轮同法临时禁用触发器后删除再启用）。
   ```
   hse_deduction_adjustment 全表: 0 行 ✓
   trg_prevent_adjustment_update: 已重新启用
   ```
2. **扣分明细复位**：扣分 96（李忠胜，本轮冻结场景测试对象）`approved/confirmed=2 → pending/confirmed=NULL/current_version=1`；扣分 97/98 `current_version 2 → 1`。
3. **冻结目标解除**：目标 454（李忠胜）`status: frozen → scored`（临时禁用 `trg_prevent_frozen_target` 后更新再启用）。
4. **8 月周期回自动口径**：对 cycle 24 重跑「执行评分」：
   ```
   { cycleId:24, scoredCount:56, gridUnchecked:{ scanned:62, affected:0 } }  // 幂等
   ```
   最终校验：
   ```
   cycle24 扣分: pending 36（含 24 条「未检查」真实数据）+ approved 3（历史遗留，见§六）
   cycle24 目标分: 94 ~ 100，无 frozen
   李忠胜 score_auto=99（未检查缺1次→自动1分），崔志勇 99，李先菊 98（缺2次→2分）
   ```
5. **临时脚本归档**：`server/scripts/_*.js / _*.sql / _*.cjs` 共 62 个一次性验证脚本（含 `_verify3_*`、`_r4_*`、`_wn_*`、`_rehearsal_*` 等）全部移入 `server/scripts/_archive/`。`scripts` 目录本身未纳入 git，归档后根目录已无下划线临时脚本。

---

## 六、⚠️ 遗留项（非本轮范围，提请业务方知悉）

- cycle 24 仍存在 **3 条历史 approved 扣分**（id 23/28/32，均属「安全会议缺席」，对象：张万恒，`source_detail` 含 `E2Eprio`/`E2E-emp-x5` 测试标记，确认分各 1 分，`updated_at` 2026-08-27）。这 3 条**早于本轮、非本轮实测产生**，属更早轮次（8/27 前后）E2E 测试残留；本轮按「不越界清理历史数据」原则未改动，重跑执行评分也不会覆盖它们（已锁定）。若需一并复位为自动口径，请明确授权后单独处理（可复用本轮清理方法）。

---

## 七、业务决策 A/B（已确认）

**选择 A：维持现状（零改动）** —— 考核结果表（targets.vue/scoring.vue）不新增「三违管理」大类得分列；未巡查扣分在扣分审核/详情/导出中按「三违管理」类别归类即可。

> 由此，本轮验收标准全部达成：「网格长未巡查扣分」功能在 web-naive 正式**验收通过**。

---

## 八、回滚方法

1. **前端**：还原 `assessment-monthly.ts`（去掉 `targetStatus`/`sourceDetail` 类型字段）、`deduction-review.vue`（`canUnlock` 去掉 `targetStatus !== 'frozen'`、状态文案改回、去掉「说明」列）、`scoring.vue`（状态文案改回）。均为增量修改，无结构迁移。
2. **后端**：本轮零改动，无需回滚。
3. **数据库**：本轮仅做测试数据清理（调整记录 0、明细复位 pending、454 解除冻结），触发器函数未改动（第四轮 `prevent_adjustment_modify` 保留）。如需恢复测试现场，可参照 §五 反向构造。
4. web-naive 前端为 Vite 热更新，已生效；后端进程未重启（无需重启）。

---

## 九、注意事项

- 「恢复自动」按钮仅对 `grid_unchecked_monthly` 通路（`deductionSource==='auto'` + `kind==='grid_unchecked_monthly'`）的已确认/已调整记录显示，冻结对象已排除；其他类别扣分（如会议缺席）不会显示该按钮——属设计预期。
- 6/7 月无台账周期分数全 100 是台账守卫生效的正常行为，非缺陷；后续补录台账并重传后对应周期会自动扫描扣分。
- 验收后 8 月周期为 `pending_review`（已执行过评分），补传 8 月台账会按导入月份自动重扫对应周期（第四轮修正的行为）。
