# 提示词：网格未巡查扣分 —— 在 web-naive（Naive UI）上收尾验收

> 归档自：`c:\Users\honey\.trae-cn\attachments\6a936f77fe8dbdec787b9c20\dd6beec9-0fe0-443f-a0ef-08bf9f18eb18_258099c2-e174-49e9-8cd9-9cb37be41915_网格未巡查扣分_提示词_web-naive上线验收.md`
> 归档日期：2026-08-30（第五轮，交付报告见 `grid-unchecked-deduction-round5-fix-report.md`）

---

> 【重要前提·务必先读】
> 1. 本项目前端实际使用的是 **`apps/web-naive`（Naive UI + vxe-table/HseDataGrid）**。`apps/web-antd`（Ant Design Vue）**计划废弃，不要再修改、不要再往里加功能**。之前误改到 web-antd 的内容保持原样即可（属于废弃代码，无需回退、也无需再维护）。
> 2. **后端已 100% 完成并验证通过，且为各前端应用共享，本轮不要改任何后端代码**（`server/` 下的引擎、扣分服务、unlock 接口、台账守卫、触发范围、版本链等都已就绪）。
> 3. 经核查，**web-naive 的解锁功能其实已经基本实现**。本轮目标是：在 web-naive 上做少量修补 → 构建/类型检查 → 浏览器实测。**不要重写已存在的功能，不要扩大范围。**

---

## 一、web-naive 现状（已实现，只需核对，勿重做）

- API：`apps/web-naive/src/api/hse/assessment-monthly.ts` 已有 `unlockDeduction(deductionId)`（POST `/deductions/:id/unlock`）。
- 扣分审核页 `apps/web-naive/src/views/hse/assessment-monthly/deduction-review.vue`：
  - 已有「恢复自动」按钮（`canUnlock`）、二次确认 `NModal`、`handleUnlock` 调用 `unlockDeduction` 后 `loadData()`；
  - 已有"生效分"列 `effectiveCell`（approved/adjusted 用 confirmedScore，pending 用 suggestedScore，rejected 为 0）；
  - 详情抽屉 `NDrawer` 已展示 `currentRecord.sourceDetail?.summary`（应巡/实巡/缺次）；
  - 审核通过弹窗可填"确认分值"（`showReviewModal` 默认带出 `suggestedScore`，改成 0 即豁免），通过后状态 approved 即锁定。
- 执行评分页 `scoring.vue` 已有"说明"列（`summaryCell` 展示 summary）。
- 后端列表接口 `GET /deductions` 以 camelCase 返回 `sourceDetail`、`targetStatus`（target.status AS target_status），前端可直接用。

请先通读上述文件确认这些功能在位；**已在位的不要重写。**

---

## 二、web-naive 需要的少量修补（只做这 3 项）

1. **`canUnlock` 增加冻结判断**（`deduction-review.vue` 约 251-257 行）：当前只判断了状态/来源/kind，未排除已冻结对象，导致冻结记录也显示"恢复自动"按钮（点击后端会 409）。补上非冻结条件：
   ```ts
   function canUnlock(row): boolean {
     return (
       (row.reviewStatus === 'approved' || row.reviewStatus === 'adjusted') &&
       row.deductionSource === 'auto' &&
       row.sourceDetail?.kind === 'grid_unchecked_monthly' &&
       row.targetStatus !== 'frozen'   // 新增：已冻结对象不显示
     );
   }
   ```
   （请确认 `getDeductionList` 返回的行里含 `targetStatus`；后端已返回 target_status，camelCase 后即 targetStatus。若类型定义 `DeductionItem` 缺该字段，在 `assessment-monthly.ts` 的类型里补上可选字段 `targetStatus?: string`、`sourceDetail?: { kind?: string; summary?: string; [k: string]: any }`。）

2. **审核状态文案区分"锁定"**（`deduction-review.vue` 的 `REVIEW_STATUS_TEXT`、`scoring.vue` 约 262 行）：把 `approved` 显示为"已确认（锁定）"、`adjusted` 显示为"已调整（锁定）"，让用户一眼看出人工锁定、自动扫描不会覆盖。

3. **审核列表可选加"说明"列**（可选，低优先级）：若希望在审核列表直接看到"未检查（本月应巡X次/实巡Y次/缺Z次）"，在 `deduction-review.vue` 的 `columns` 增加一列 `{ title: '说明', field: 'sourceDetail', minWidth: 240, slots: { default: 'summaryCell' } }` 并加对应 slot 展示 `row.sourceDetail?.summary`；不加也可（详情抽屉里已有）。**以不影响现有布局为准。**

> 不要新增"三违管理"大类得分列（见第五节业务决策，未定前不做）。不要改 `deduction-adjust.vue`（那是"考核标准配置"页，不是单条扣分调整，保持原样）。

---

## 三、构建与类型检查（针对 web-naive）

在 `apps/web-naive` 目录（或仓库根用 pnpm filter）执行：
```bash
pnpm install
pnpm --filter @vben/web-naive run typecheck   # 或在 apps/web-naive 下 pnpm run typecheck
pnpm --filter @vben/web-naive run build       # 或在 apps/web-naive 下 pnpm run build
```
- 若有 TS/编译错误，**只修与本轮改动相关的**（deduction-review.vue、assessment-monthly.ts 类型），不顺手重构无关代码。
- 回报 typecheck 与 build 结果。

---

## 四、浏览器端到端实测（在 web-naive 应用上，逐项截图）

> 前置：后端已重启加载最新代码；8月周期(id=24)现有 24 条「未检查」pending 扣分。请用实际运行的 **web-naive** 开发/部署地址测试，不要在 antd 应用上测。

1. 进入「月度安全履职考核 → 扣分审核」，选8月周期：
   - pending 的「未检查」行**不显示**"恢复自动"按钮；点"通过"时确认分值默认=建议分，可改小。
   - 把一条改为 2 分通过（原因/意见填"测试-上线验收"）→ 状态变"已确认（锁定）"，生效分显示 2，**出现**"恢复自动"按钮；该人总分相应变化。
2. 保持锁定，再次点「执行评分」/触发台账同步 → 该行**仍为 2 分**、状态不变（不被自动覆盖）。
3. 点"恢复自动"→ 确认 → 提示成功 → 该行回到待审核、分值变回自动值，总分还原。
4. 把一条"通过"时确认分填 0（豁免）→ 该人不因此扣分且锁定；再"恢复自动"回到自动扣分。
5. 详情抽屉能看到"未检查（本月应巡X次/实巡Y次/缺Z次）"；scoring 页"说明"列正常。
6. 已冻结对象（若有）不显示"恢复自动"按钮。
7. 补传/重传8月台账（构造某人巡查次数增加）→ 不手点执行评分，该人缺次减少、扣分自动下调；补到满勤则该行自动撤销、分数回涨。
8. 6月/7月周期分数仍全 100、无「未检查」明细（台账守卫生效）。
9. 验收后清理测试痕迹：删除原因含"测试-上线验收/测试"的调整记录，并对8月周期重跑一次"执行评分"使全部回到自动口径：
   ```sql
   SELECT * FROM hse_deduction_adjustment WHERE adjustment_reason LIKE '%测试%';
   DELETE FROM hse_deduction_adjustment WHERE adjustment_reason LIKE '%测试%';
   -- 然后对 cycle 24 重跑执行评分（或对被锁定明细逐条"恢复自动"）
   ```
10. 清理后端临时验证脚本：`server/scripts/_verify3_*.js` 等一次性脚本删除或归档（与前端应用无关，顺手清理）。

---

## 五、挂起业务决策（需业务方拍板，先不要实现）

考核结果表（web-naive 的 `targets.vue`/`scoring.vue`）目前**没有**"三违管理"大类得分列；"未检查"扣分体现在扣分审核/详情/导出里（类别归三违管理、明细名"未检查"）。请二选一：
- **A. 维持现状（推荐，零改动）**：在扣分审核/详情/导出中按三违管理归类即可。
- **B. 新增"三违管理"得分列**：在 web-naive 考核结果表增加该大类合计生效分列（后端 `category_deductions` 已算好，前端联调即可，约 0.5 天）。确认后再单独做。

---

## 六、验收标准
- web-naive `typecheck` 与 `build` 通过。
- 第二节 3 项修补完成；第四节 1~8 项浏览器实测全部符合预期并截图。
- 测试数据清理干净，8月周期回到自动口径（24 人、94~100 分布），6/7月零改动。
- 全程**未修改 web-antd、未修改后端**。
- 业务方对第五节给出 A/B 选择。

达到以上即视为"网格长未巡查扣分"功能在 web-naive 正式验收通过。
