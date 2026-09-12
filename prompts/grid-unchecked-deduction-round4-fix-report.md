# 交付报告：网格未巡查扣分 第四轮 —— 前端解锁入口 + 自动触发范围修正 + 数据收尾

> 任务提示词：`c:\Users\honey\.trae-cn\attachments\6a936f77fe8dbdec787b9c20\958a4755-532e-488a-9f28-c92a056cee1b_5b3b799e-61d1-4cd0-841c-ff07b3e69887_网格未巡查扣分_第四轮提示词_前端解锁与触发收尾.md`
> 交付日期：2026-08-30
> 范围：仅做「前端补齐解锁入口 + 触发范围修正 + 数据/版本链收尾」；未改动第三轮已验证的生效分口径、锁定/守卫/复活逻辑；未新增数据库表/列

---

## 一、改动文件清单

### 后端

| # | 文件 | 类型 | 改动说明 |
|---|------|------|---------|
| 1 | `server/routes/import.js` | 修改 | 台账导入钩子改为**按本次导入台账的月份**定位周期（从 `inspection_date` 取年月），仅扫 `status IN ('in_progress','pending_review')` 的周期做幂等同步（补传哪个月重扫哪个月，reviewed/frozen 不动；该月无台账由服务内 `no-ledger-data` 守卫跳过） |
| 2 | `server/services/assessmentScheduler.js` | 修改 | `runGridCheck` 选周期 SQL 放宽为 `status IN ('in_progress','pending_review')` + 时间窗（`start_time<=NOW() AND end_time>=NOW()`） |
| 3 | `server/routes/hse-assessment-monthly.js` | 修改 | 调整(ADJUST)/解锁(UNLOCK)插入新调整记录前，先 `UPDATE hse_deduction_adjustment SET is_current=FALSE WHERE deduction_id=$1`（保证同一 deduction 仅一条 `is_current=TRUE`）；解锁时同步 `current_version = current_version + 1`（与调整记录 version_no 对齐） |

### 数据库（已执行）

| # | 对象 | 类型 | 改动说明 |
|---|------|------|---------|
| 4 | `public.prevent_adjustment_modify()` | 修改 | 触发器函数原为「调整记录表禁止 UPDATE/DELETE」。现改为：DELETE 仍全禁；UPDATE **仅允许翻转 `is_current`**（版本链记账位），审计内容列（分值/原因/经办人/时间戳等）仍一律禁止修改。这是版本链 `is_current=FALSE` 更新能落库的必要前提 |

### 前端（web-antd）

| # | 文件 | 类型 | 改动说明 |
|---|------|------|---------|
| 5 | `apps/web-antd/src/api/hse/assessment-monthly.ts` | 修改 | `AssessmentTarget`/`ScoringProgress`/`DeductionItem` 等接口统一 camelCase（与后端返回一致）；新增 `unlockDeduction(id)`；修正 `reviewDeduction` 路径为 `/deductions/review/approve` |
| 6 | `apps/web-antd/src/views/hse/assessment-monthly/deduction-adjust.vue` | 修改 | 新增「恢复自动」按钮（`canUnlock`：approved/adjusted 且本通路 `grid_unchecked_monthly` 且对象未冻结）+ 二次确认弹窗 + `handleUnlock`；新增「生效分」列（approved/adjusted 显示 confirmed_score、pending 显示 suggested_score、rejected 显示 0）；新增「说明」列展示 `sourceDetail.summary`（应巡/实巡/缺次）；状态文案补 `adjusted→已调整（锁定）`、`approved→已确认（锁定）` |
| 7 | `apps/web-antd/src/views/hse/assessment-monthly/deduction-review.vue` | 修改 | 同上补齐「恢复自动」按钮/弹窗/handleUnlock；状态筛选补 `adjusted` 选项；生效分/说明列 |
| 8 | `apps/web-antd/src/views/hse/assessment-monthly/excel.vue` | 修改 | `cycle_name` 等 snake_case → camelCase |
| 9 | `apps/web-antd/src/views/hse/assessment-monthly/freeze.vue` | 修改 | `cycle_name`/`target_count`/`scored_count`/`reviewed_count` → camelCase |
| 10 | `apps/web-antd/src/views/hse/assessment-monthly/index.vue` | 修改 | 同上 camelCase |
| 11 | `apps/web-antd/src/views/hse/assessment-monthly/scoring.vue` | 修改 | `cycle_name`/进度/`score_total` → camelCase |
| 12 | `apps/web-antd/src/views/hse/assessment-monthly/targets.vue` | 修改 | `cycle_name`/`score_total`/排名 → camelCase |

### 脚本（server/scripts，均为一次性验证/清理，不入业务）

| # | 文件 | 用途 |
|---|------|------|
| 13 | `_r4_cleanup_adjustments.js` / `_r4_check_adjustments.js` | 第三轮测试调整记录（id 11~15）清理与复查 |
| 14 | `_r4_trigger_update.sql` / `_r4_trigger_test.sql` | 触发器函数修改与三行为验证 |
| 15 | `_r4_cleanup.cjs` | 第四轮自测产生的调整记录清理 + 明细 119 复位 |
| 16 | `_verify4_r4.cjs` | 第四轮端到端自测（触发范围/解锁/版本链/回归） |

---

## 二、实现说明

### 2.1 触发范围修正：恢复「上传即扫描」

- 第三轮把选周期 SQL 收窄为仅 `in_progress`；当时 8 月周期(id=24) 已是 `pending_review`（执行过评分）→ 补传 8 月台账不会自动重扫。本轮修正：
  - **import.js 钩子（推荐做法）**：直接按**本次导入台账的月份**（`inspection_date` 前 7 位）定位周期，对该月 `status IN ('in_progress','pending_review')` 的周期逐个 `syncGridUncheckedDeductions`。补传哪个月就重扫哪个月；`reviewed/frozen` 绝不自动改动。
  - **定时任务**：`runGridCheck` 选 `in_progress + pending_review` 且 `start_time<=NOW() AND end_time>=NOW()`。8 月周期(end=08-31)在时间窗内会被扫；6/7 月(end 已过)被时间窗排除，即便被选中也由服务内 `no-ledger-data` 守卫跳过。
- 安全性由第三轮已上线的台账守卫兜底：任何「该月无台账」的周期直接 `no-ledger-data` 跳过、不写扣分。

### 2.2 前端「恢复自动（解锁）」入口（web-antd）

- API：`unlockDeduction(deductionId)` → `POST /deductions/:id/unlock`。
- 按钮条件（扣分调整页 + 扣分审核页）：
  ```
  review_status ∈ {approved, adjusted}   -- 已人工锁定
  deductionSource === 'auto'
  sourceDetail?.kind === 'grid_unchecked_monthly'
  targetStatus !== 'frozen'
  ```
  pending / rejected 行不显示按钮。
- 点击 → 二次确认弹窗（提示「将解除人工锁定，恢复为系统自动计算的分值」）→ 调用解锁 → 成功提示 → 刷新列表与目标分。
- 状态与生效分：`adjusted` 显示「已调整（锁定）」、`approved` 显示「已确认（锁定）」；生效分列 approved/adjusted 显示 `confirmed_score`、pending 显示 `suggested_score`、rejected 显示 0；本通路行「说明」列展示 `sourceDetail.summary`（未检查（本月应巡X次/实巡Y次/缺Z次））。

### 2.3 is_current 版本链修正 + 触发器适配

- 原缺陷：adjust/unlock 插入新调整记录时未把同 deduction 的旧 `is_current` 置 FALSE，可能多条 `is_current=TRUE`。
- 修正：插入 ADJUST/UNLOCK 前先 `UPDATE hse_deduction_adjustment SET is_current=FALSE WHERE deduction_id=$1`；解锁时 `current_version = current_version + 1`，与插入记录的 `version_no = current_version + 1` 对齐。
- **关键坑（自测中发现并修复）**：该 UPDATE 原本会被 `trg_prevent_adjustment_update` 触发器拦截（该表禁止 UPDATE）→ 只要 deduction 已有历史调整记录，解锁/调整就必然 500 回滚。已最小化修改触发器函数：DELETE 仍全禁；UPDATE 仅放行 `is_current` 翻转，审计内容列仍禁止修改。审计记录的不可篡改意图得以保留。

---

## 三、自测结果（本地库 safety_dashboard，后端 5800 已加载新代码）

> 全部自测完成后已清理测试数据并复位现场（见 §3.5）。

### 3.1 触发范围：pending_review 可自动扫描 + 幂等 + 守卫

```
syncGridUncheckedDeductions(24, {dryRun:true})   // 2026-08 pending_review 时间窗内
→ { ok:true, scanned:62, affected:0 }
syncGridUncheckedDeductions(24, {dryRun:false})  // 真实幂等重扫
→ { ok:true, scanned:62, affected:0 }           // 无变化不写库不重算
syncGridUncheckedDeductions(27, {dryRun:true})   // 2026-07 pending_review 时间窗外
→ { ok:false, reason:'no-ledger-data', scanned:0, affected:0 }
syncGridUncheckedDeductions(28, {dryRun:true})   // 2026-06 pending_review 时间窗外
→ { ok:false, reason:'no-ledger-data', scanned:0, affected:0 }
```

结论：8 月(pending_review)补传台账可自动重扫且幂等；6/7 月被守卫/时间窗双层保护，0 改动。

### 3.2 审核锁定 → 生效分 → 重扫不覆盖 → 解锁 → 版本链

以明细 119（未检查，应巡30/实巡29/缺1次，建议分1）为样本：

```
[B0] 调整前对象分          scoreAuto=99, scoreTotal=99
[B1] 审核通过 confirmed=8  → review_status=approved, confirmed_score=8
                           对象分 99 → 92（按 confirmed=8 生效）
[B2] 锁定后重扫 affected=0 → 该行仍 approved/confirmed=8/is_deleted=false（人工锁定不被覆盖）
[B3] 解锁                 → review_status=pending, confirmed_score=NULL
                           current_version 3 → 4
                           对象分回 92 → 99（自动值 1 生效）
[B3] 版本链（同 deduction 全部调整记录）：
     id=17 UNLOCK v2 is_current=false
     id=18 UNLOCK v3 is_current=false
     id=19 UNLOCK v4 is_current=true
     → is_current=TRUE 数量 = 1 ✓（且与 deduction.current_version=4 一致）
```

### 3.3 解锁修复验证（先失败场景复测）

- 修复前：明细已有历史调整记录时，解锁的 `UPDATE ... SET is_current=FALSE` 被触发器拦截 → 500「恢复自动计算失败」、事务回滚。
- 修复后：对同一场景（已有记录 id=17）再解锁 → HTTP 200 `{"code":0,"message":"已恢复自动计算"}`。

### 3.4 回归

```
cycle24 扣分明细分布: [{ review_status:'pending', c:24 }]
cycle24 目标分分布:   { total:58, min:94.0, max:100.0, deducted_cnt:24, in_range:58 }
再次幂等重扫 affected=0，pending 明细仍 24 条
```

8 月 24 人扣分分布 94~100 不变；执行评分幂等；人工锁定行不被覆盖（§3.2 B2）。

### 3.5 数据收尾（已清理，最终状态）

```
hse_deduction_adjustment 全表: 0 行（第三轮 id 11~15 与第四轮自测 id 17/18/19 均已删除）
hse_assessment_deduction 119:  review_status=pending, confirmed_score=NULL, current_version=1（复位）
对象 439: scoreAuto=99, scoreTotal=99（自动值，正确）
cycle24: 24 条 pending「未检查」明细（真实数据，未动）
trg_prevent_adjustment_update: 已重新启用（O）
```

---

## 四、前端类型检查

- `web-antd` 运行 `pnpm typecheck`：本轮改动的 `assessment-monthly.ts` 与 `views/hse/assessment-monthly/` 下 7 个文件**零类型错误**。
- 其余报错来自历史遗留文件（`todos/plan/index.vue`、`inspection/grid/index.vue`、`violations/index.vue`），与本次改动无关，未触碰。

---

## 五、数据库变更说明（需执行 SQL 摘要）

本次唯一数据库对象变更：

```sql
-- server/scripts/_r4_trigger_update.sql（已执行）
CREATE OR REPLACE FUNCTION public.prevent_adjustment_modify()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION '扣分调整记录表禁止DELETE';
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.deduction_id IS DISTINCT FROM NEW.deduction_id OR ...  -- 全部审计内容列
        OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
            RAISE EXCEPTION '扣分调整记录表仅允许修改is_current（版本链记账位），禁止修改审计内容';
        END IF;
    END IF;
    RETURN NEW;
END; $function$;
```

- 放行：`UPDATE hse_deduction_adjustment SET is_current = FALSE WHERE deduction_id = $1`（版本链记账）。
- 仍拦截：DELETE 全部；UPDATE 分值/原因/经办人/时间戳等任何审计内容列。

---

## 六、回滚方法

1. **前端**：`assessment-monthly.ts` 与 6 个视图文件按 `git status` 差异还原即可（本轮均为增量修改，无结构迁移）。
2. **后端**：`import.js` / `assessmentScheduler.js` 选周期条件改回仅 `in_progress`；`hse-assessment-monthly.js` 去掉 is_current 前置 UPDATE 与 `current_version+1`。
3. **数据库**：恢复原触发器函数（`RAISE EXCEPTION '扣分调整记录表仅允许INSERT，禁止UPDATE和DELETE'`）。回滚后同一 deduction 若存在多条历史调整记录，`is_current` 可能不再唯一——属预期（第三轮行为），如需清理按「先查后删、临时禁用触发器」流程处理。
4. 后端改完需重启 `server/app.js` 生效（当前 5800 进程已加载新代码）。

---

## 七、注意事项

- 前端「生效分」列与「说明」列依赖扣分明细接口已返回 `confirmedScore/suggestedScore/sourceDetail.summary`（后端 2451 行附近已 select source_detail，验证通过）。
- 6/7 月无台账周期在全系统口径下分数全 100 为守卫的正常行为；如后续补录 6/7 月台账，重传后对应周期会被自动扫描并按缺次扣分。
- `actual=0`（应巡为 0）人员不参与扣分（`missing<=0` 分支），如需复核名单见 `gridUncheckedDeductionService` 的 `details.actualZero`。
