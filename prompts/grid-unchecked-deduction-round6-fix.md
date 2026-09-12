# 提示词：网格未巡查扣分 —— 终审验收（只验证，不改功能代码）

> 归档自：`c:\Users\honey\.trae-cn\attachments\6a936f77fe8dbdec787b9c20\dbe9c412-e371-4d33-b3be-0e900dd3210d_ac0d60da-85de-4d12-96ed-dc6ad826da3b_网格未巡查扣分_第六轮提示词_终审验收.md`
> 归档日期：2026-08-30（第六轮·终审验收，交付报告见 `grid-unchecked-deduction-round6-fix-report.md`）

---

> 【现状】后端与 web-naive 前端的功能代码经人工逐行静态审核 + 数据库实测，**已全部完成且正确**。本轮是**终审验收**：只允许做"构建验证 + 浏览器端到端实测 + 部署生效确认"，**不要新增/修改任何功能代码**（web-antd 废弃不动、后端不动）。若验证中发现 bug，仅做最小修复并说明原因。
> 【纪律】所有命令必须**真实执行并粘贴完整终端输出**；浏览器测试必须**真实操作并截图**。不得用"应该可以/理论上通过"代替实测。

---

## 一、环境与部署生效确认（先做）

1. 确认后端运行的是最新代码（第三/四轮已含 unlock 接口、台账守卫、触发范围、版本链）。若后端进程自那以后未重启，请重启。自检：
   ```bash
   # 后端健康/路由自检：unlock 路由应存在
   curl -s -o /dev/null -w "%{http_code}" http://<后端地址>/api/hse-assessment-monthly/deductions/1/unlock -X POST
   # 未登录预期返回 401（说明路由存在）；若 404 说明后端不是最新代码，需重启
   ```
2. 前端实际使用 **web-naive**。若线上/测试环境跑的是**构建产物（dist）**，必须在 `apps/web-naive` 重新构建并部署，否则用户看不到新按钮：
   ```bash
   # 仓库根目录
   pnpm install
   pnpm --filter @vben/web-naive run typecheck
   pnpm --filter @vben/web-naive run build
   ```
   - 粘贴 typecheck 与 build 的**完整输出**（含报错/警告/成功信息、产物目录）。
   - 若报错，只修与 `deduction-review.vue`、`scoring.vue`、`assessment-monthly.ts` 相关的问题，贴出修改 diff。
3. 确认全程**未修改 `apps/web-antd`、未修改 `server/`**（贴 `git status --short` 输出佐证；本轮预期只有 web-naive 构建产物或无源码改动）。

---

## 二、浏览器端到端实测（在运行中的 web-naive 上，逐项截图）

> 前置：8月周期(id=24) 现有 24 条「未检查」待审核扣分，分数 94~100。请在**实际使用的 web-naive 地址**（开发或部署地址）操作，不要在 antd 应用测。

1. **按钮可见性**：进入「月度安全履职考核 → 扣分审核」选8月周期。
   - 待审核(pending) 的「未检查」行：**不显示**"恢复自动"按钮；列表"说明"列显示"未检查（本月应巡X次/实巡Y次/缺Z次）"。
   - 点"通过"，弹窗中"确认分值"默认=建议分，可改小。
2. **改分锁定**：把一条改为 2 分通过（意见填"测试-终审"）→ 状态显示"已确认（锁定）"，生效分列显示 2，出现"恢复自动"按钮；该人总分相应下降。截图。
3. **锁定不被覆盖**：保持该状态，再点「执行评分」（或触发一次台账同步/重传）→ 该行**仍为 2 分**、状态不变。截图对比。
4. **恢复自动**：点"恢复自动"→ 确认弹窗→ 成功提示 → 该行回到待审核、分值变回自动值（按缺次），总分还原。截图。
5. **豁免=0**：把一条"通过"时确认分填 0 → 该人不因此扣分且锁定；再"恢复自动"回到自动扣分。截图。
6. **详情**：点"详情"抽屉，能看到"未检查（本月应巡X次/实巡Y次/缺Z次）"。截图。
7. **冻结保护**（若有已冻结对象）：冻结对象的「未检查」行**不显示**"恢复自动"按钮；若无冻结对象，说明跳过并注明。
8. **补传回退**：对8月周期(待审核) 重传/补传台账（构造某人巡查次数增加）→ 不手点执行评分，该人缺次减少、扣分自动下调；若补到满勤，该行自动撤销、分数回涨。截图前后对比。
9. **历史周期安全**：切到6月/7月周期，分数仍全 100、无「未检查」明细。截图。

---

## 三、实测后清理（恢复自动口径）

浏览器测试会产生"测试-终审"等人工锁定记录，验收后清理并复位：
```sql
-- 1) 查看测试痕迹
SELECT * FROM hse_deduction_adjustment WHERE adjustment_reason LIKE '%测试%';
-- 2) 删除测试调整/解锁记录
DELETE FROM hse_deduction_adjustment WHERE adjustment_reason LIKE '%测试%';
-- 3) 复位被测试锁定的明细为待审核、清除人工确认分
UPDATE hse_assessment_deduction
SET review_status='pending', confirmed_score=NULL, reviewer_id=NULL, review_comment=NULL, reviewed_at=NULL,
    updated_at=NOW()
WHERE cycle_id=24 AND source_detail->>'kind'='grid_unchecked_monthly'
  AND review_status IN ('approved','adjusted');
-- 4) 对8月周期重跑一次"执行评分"（页面按钮或接口），使目标分回到自动口径
```
清理后核验并贴结果：
```sql
SELECT review_status, COUNT(*)::int FROM hse_assessment_deduction
WHERE cycle_id=24 AND source_detail->>'kind'='grid_unchecked_monthly' AND is_deleted=FALSE
GROUP BY 1;  -- 预期：pending 24
SELECT score_auto, COUNT(*)::int FROM hse_assessment_target
WHERE cycle_id=24 AND is_deleted=FALSE GROUP BY 1 ORDER BY 1;
-- 预期：94×1,95×1,96×3,97×2,98×3,99×14,100×32
```

---

## 四、需业务方拍板（先不实现，回报业务方选择）

考核结果表（targets/scoring 页）目前**无"三违管理"大类得分列**，"未检查"扣分体现在扣分审核/详情/导出（类别归三违管理）。
- **A. 维持现状（推荐，零改动）**。
- **B. 在 web-naive 考核结果表新增"三违管理"得分列**（后端 category_deductions 已算好，仅前端联调，约 0.5 天）。
> 业务方未选 B 之前，不要做这一列。

---

## 五、终审通过标准（逐条给出"通过/不通过 + 证据"）

1. web-naive `typecheck`、`build` 真实通过（贴输出）；若为部署环境，已重新构建并部署、用户可见新按钮。
2. 后端为最新代码（unlock 路由非 404）。
3. 浏览器实测 1~9 项全部符合预期并截图。
4. 测试数据已清理，8月回到自动口径（pending 24、分数分布同上），6/7月零改动。
5. `git status` 证明本轮未改 web-antd、未改后端功能代码。
6. 业务方对第四节给出 A/B。

全部满足 → "网格长未巡查扣分"功能**终审通过、正式上线**。任一项不通过 → 贴出现象/报错，做最小修复后重验该项。
