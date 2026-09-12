# 交付报告：网格未巡查扣分 第三轮 —— 人工改分锁定 + 统一生效分 + 历史周期误扣修复

> 任务提示词：`prompts/grid-unchecked-deduction-round3-fix.md`（第三轮提示词，合并第二轮要求）
> 交付日期：2026-08-30
> 范围：只修「未巡查/未检查」这一条扣分通路及其依赖的通用算分口径；未做通用规则引擎；未新增数据库列/表

---

## 一、改动文件清单

| # | 文件 | 类型 | 改动说明 |
|---|------|------|---------|
| 1 | `server/services/gridUncheckedDeductionService.js` | 修改 | `findExisting` 取锁定态（review_status/confirmed_score）且不限 `is_deleted`；人工锁定行不覆盖/不软删（`action:'locked'`）；软删行「复活」复用；`otherSanweiScore` 按统一生效分口径取值；`details` 增加 `actualZero`；新增 P0 台账覆盖守卫（当月无台账 → `no-ledger-data` 直接返回） |
| 2 | `server/services/assessmentScoringEngine.js` | 修改 | `getEffectiveDeductionTotal` 改为统一生效分 CASE 公式（approved/adjusted → COALESCE(confirmed_score, suggested_score)，pending → suggested_score，rejected/软删 → 0）；供路由与其它汇总复用 |
| 3 | `server/routes/hse-assessment-monthly.js` | 修改 | 调整/审核/驳回等改 `review_status/confirmed_score` 处统一走 `engine.recalculateTarget`（生效分口径），移除旧的「pending 算 0」SUM 公式；新增 `POST /deductions/:id/unlock` 解锁接口（仅本通路已锁定行可解锁 → 写 `hse_deduction_adjustment` operation_type='UNLOCK' → 重扫 → 重算 → 审计）；`/scoring/execute` 前置缺巡扫描，响应/审计带 `grid_unchecked.reason`；扣分明细接口返回 `summary` |
| 4 | `server/routes/import.js` | 修改 | 网格台账导入钩子的选周期 SQL 收窄为「仅当前 in-progress 且时间窗口命中」的周期（`start_time<=NOW() AND end_time>=NOW()` LIMIT 1） |
| 5 | `server/services/assessmentScheduler.js` | 修改 | `runGridCheck` 选周期 SQL 收窄为同样「仅当前 in-progress」条件，不再扫描全部 `pending_review/reviewed` 历史周期 |
| 6 | `安全看板vben/apps/web-naive/src/api/hse/assessment-monthly.ts` | 修改 | `TargetDeduction`/`sourceDetail` 增加 `summary`；新增 `unlockDeduction(id)` API |
| 7 | `安全看板vben/apps/web-naive/src/views/hse/assessment-monthly/scoring.vue` | 修改 | 扣分明细抽屉增加「说明」列，展示 `source_detail.summary`（应巡/实巡/缺次） |
| 8 | `安全看板vben/apps/web-naive/src/views/hse/assessment-monthly/deduction-review.vue` | 修改 | 新增「生效分」列（统一口径，approved/adjusted 显示确认分、pending 显示建议分、rejected 显示 0）；对 `kind='grid_unchecked_monthly'` 且已锁定行提供「恢复自动」按钮与确认弹窗；详情抽屉展示 生效分/说明(summary) |

---

## 二、实现说明

### 2.1 统一「生效分」口径（全系统唯一规则）

```
is_deleted=TRUE                          → 0
review_status='rejected'                 → 0
review_status IN ('approved','adjusted') → COALESCE(confirmed_score, suggested_score)   -- 人工已锁定
其余（pending 等）                        → suggested_score                              -- 自动值生效
```

- `assessmentScoringEngine.getEffectiveDeductionTotal` 的 SQL 已按此 CASE 重写（`deduction_source IN ('auto','chain_transmission')` 过滤保留）。
- 扣分调整/审核接口原来「只 SUM approved/adjusted、pending 算 0」的总分重算已删除，统一改调 `engine.recalculateTarget`。
- `gridUncheckedDeductionService.otherSanweiScore`（三违类别上限钳制）同样按生效分口径取值（approved/adjusted 用 confirmed_score），避免上限误算。

### 2.2 自动扫描尊重「人工锁定」

- `findExisting` 不再限定 `is_deleted=FALSE`，并按 `target+cycle+source_table+kind+deductKey` 取最新一条；命中软删行时走「复活」而非新增，避免软删残骸累积。
- 已有行 `review_status IN ('approved','adjusted')`（人工锁定）时：**不得** UPDATE 分值/明细、**不得**软删；跳过写操作，`details` 记 `action:'locked'`。
- 仅对 `review_status='pending'`（含曾被软删）的行执行 upsert / 复活 / 软删逻辑。
- 豁免某人 = 调整为 0 分（confirmed_score=0、adjusted）即锁定为不扣，重扫不再扣、不再软删。

### 2.3 「恢复自动计算（解锁）」接口

- `POST /hse/assessment-monthly/deductions/:id/unlock`（权限同调整接口，冻结对象拒绝）。
- 仅允许 `review_status IN ('approved','adjusted')` 且 `source_detail->>'kind'='grid_unchecked_monthly'` 的明细。
- 动作：置 `review_status='pending'`、`confirmed_score=NULL` → 在 `hse_deduction_adjustment` 写 `operation_type='UNLOCK'` 记录（原因「恢复自动计算」）→ 调用 `syncGridUncheckedDeductions(cycleId)` 让自动值接管 → `recalculateTarget` → 审计日志。

### 2.4 P0：无台账历史周期全员误扣修复（两处）

1. **服务内台账覆盖守卫**（对所有调用方生效）：算出 year/month 后先统计该考核月 `grid_inspection_records` 条数，`c=0` 直接返回 `{ok:false, reason:'no-ledger-data', year, month, scanned:0, affected:0}`，不写扣分、不重算；`/scoring/execute` 视其为正常（不阻断），响应/审计带 reason。
2. **自动触发周期范围收窄**：`import.js` 钩子与 `assessmentScheduler.runGridCheck` 的选周期 SQL 由 `status IN ('in_progress','pending_review','reviewed')` 改为仅当前 in-progress 且时间窗口命中（`start_time<=NOW() AND end_time>=NOW()` LIMIT 1）。手动「执行评分」仍可对管理员选定周期执行，但同样受守卫保护。

### 2.5 回退链路（补传台账 → 少扣/归零 → 复活/软删）

- 补传台账使某 pending 人缺次减少 → `suggested_score` 下调（`updated`）；
- 缺次归 0 或钳制为 0 → 该行软删（`is_deleted=TRUE`）、分数回涨；
- 再次缺巡 → 命中软删行「复活」复用（`action:'revived'`），不新增、无残骸；
- 锁定人缺次归 0 → `revokeDeduction` 返回 `'locked'`，**不软删**，保持人工决定。

### 2.6 P1 收尾

- 第一轮测试残留（62 条 cycle 28 的 `kind='grid_unchecked_monthly'`）已按提示词 SQL 清理（全库当前仅剩 cycle 24 的 24 条有效明细，无软删残骸）。
- `details` 中 `actual===0` 的人员带 `actualZero:true`。

---

## 三、自测结果（本地库 safety_dashboard，后端已重启并加载新代码）

> 后端进程已重启（unlock 端点实测 200 响应）；全部自测完成后已恢复现场，未残留测试数据。

### 3.1 历史周期守卫（cycle 28 · 2026-06，无台账）

```
syncGridUncheckedDeductions(28, {dryRun:true})
→ { ok:false, reason:'no-ledger-data', year:2026, month:6, scanned:0, affected:0 }
```

- 6月/7月周期（id=28/27）目标分全部仍为 100、扣分明细 0 条——不再误扣。
- 基线核查：`2026-06: 0 条 / 2026-07: 0 条 / 2026-08: 1654 条` 台账。

### 3.2 8月 dryRun（cycle 24）

```
scanned=62  action 分布: { noop:24, none:32 }   应扣分 24 人
cappedScore 分布: {1缺/1分:14, 2缺/2分:3, 3缺/3分:2, 4缺/4分:3, 5缺/5分:1, 6缺/6分:1}
前5高分: 傅学武缺6→6分 | 王臣祥缺5→5分 | 孙建栋缺4→4分 | 李振恒缺4→4分 | 王学宁缺4→4分
无缺次 32 人
```

### 3.3 正式执行 + 幂等

- 正式 `syncGridUncheckedDeductions(24)`：`affected=0`（24 条明细已存在，全 `noop`），`before=24 after=24`，无重复行。
- 库中 24 条有效「未检查」明细，`source_id IS NULL`、`review_status='pending'`、`source_detail` 含 `deductKey` 与 `summary`（应巡30/实巡X/缺Z）。
- 全库 `kind='grid_unchecked_monthly'`：`{total:24, del:0}`。

### 3.4 人工改分锁定（HTTP 实测）

以明细 #96（李忠胜，自动 1 分）执行完整生命周期：

| 步骤 | 请求 | 结果 |
|------|------|------|
| 1 | `POST /deductions/adjust`（1→2 分，填原因） | 200，`review_status='adjusted'`、`confirmed_score=2` |
| 2 | `POST /scoring/execute`（重扫） | 200，**不被覆盖**（保持 adjusted/2 分） |
| 3 | 再次 adjust + execute | 200，仍不被覆盖 |
| 4 | `POST /deductions/96/unlock` | 200，`review_status='pending'`、`confirmed_score=NULL` |
| 5 | 重扫 | 自动值接管，明细回到 1 分（pending） |

另经服务层验证：`otherSanweiScore` 与 `revokeDeduction` 对锁定行（adjusted/approved）均返回 `'locked'`，不 UPDATE、不软删。

### 3.5 统一生效分口径

```
engine.getEffectiveDeductionTotal(454, 24) = 1   （李忠胜 缺1次，pending → 用 suggested_score）
engine.getEffectiveDeductionTotal(468, 24) = 2   （李先菊 缺2次，pending → 用 suggested_score）
```

与前端扣分审核页「生效分」列、详情抽屉展示一致；不再出现 pending 算 0 或 confirmed 被忽略。

### 3.6 类别上限（三违管理 = 15）

对傅学武（缺 6 次，raw=6）插入临时「信息不完整」三违扣分后 dryRun：

| 场景 | other 生效分 | allowed | cappedScore | 结果 |
|------|-------------|---------|-------------|------|
| 基线（无其它） | 0 | 15 | 6 | 正常扣 6 |
| pending 12 分 | 12 | 3 | 3 | 钳制到 3 ✓ |
| adjusted confirmed=12（锁定） | 12 | 3 | 3 | 锁定行按 confirmed 参与上限 ✓ |
| adjusted confirmed=20（超上限） | 20 | 0 | 0 | `capped-out` → 本通路行被移除 ✓ |

临时数据已清理，恢复 1 条有效行。

### 3.7 回退链路（软删复活）

将明细 #117（傅学武，6 分）置 `is_deleted=TRUE` 后重扫：

```
action='revived'（命中软删行复用，非新增）
id=117 重扫后: {is_deleted:false, suggested_score:6, review_status:'pending'}
最终有效行数 = 24（无新增、无残骸）
```

### 3.8 数据完整性恢复（李先菊 id=5377）

早前回退脚本误删的 8 月台账 `id=5377`（李先菊，08-02 巡查）已按同批邻行模板完整恢复：

```
upload_time=2026/08/02 08:38, inspection_date=2026-08-02,
image_content=…/backfill_run_mte2uom2wld/row426_c8_1.jpeg, serial_no=L918
```

与次日邻行 5378 仅自然差异（日期/行号/序号），8 月 28 条记录 id 连续无空洞；临时台账与测试扣分行均已清理。

---

## 四、前端核对结果（第三轮第四节）

| 核对项 | 结果 |
|--------|------|
| 「未检查」自动扣分在扣分审核/调整列表出现 | ✅ 审核页列出 24 条「未检查」自动明细 |
| 调整后该行状态显示「已调整/已确认（锁定）」，生效分显示 confirmed_score | ✅ 审核页「生效分」列/详情抽屉按统一口径展示；通过审核时可填确认分值 |
| `kind='grid_unchecked_monthly'` 且已锁定的行提供「恢复自动」按钮；pending 行不显示 | ✅ 审核页 `canUnlock`（approved/adjusted 且本通路）→ 显示「恢复自动」，调用 unlock 接口 |
| 明细展示 `source_detail.summary`（应巡/实巡/缺次） | ✅ 审核页详情抽屉「说明」+ 评分页「说明」列 |
| 是否新增大类列（三违管理/网格巡查 得分列） | **未新增**（按提示词不扩表）。类别归属经扣分审核/调整/导出中类别=「三违管理」、明细名「未检查」体现；「网格巡查」完成率列保持不变。若业务方坚持在考核结果表新增「三违管理」得分列，属新增需求，需另行提出 |

---

## 五、上线前预检 SQL

```sql
-- 1) 规则配置（未检查 / 三违管理 / cumulative / 1）
SELECT id, rule_name, category, metric_code, deduct_type, deduct_score, status
FROM hse_assessment_rule
WHERE is_deleted=FALSE AND category='三违管理'
  AND (rule_name LIKE '%未检查%' OR rule_name LIKE '%未巡查%');

-- 2) 类别上限（三违管理=15）
SELECT category, max_deduct FROM hse_assessment_category_limit WHERE category='三违管理';

-- 3) 本通路明细现状（应为 cycle 24 的 24 条有效行、无软删残骸）
SELECT cycle_id, is_deleted, review_status, COUNT(*) AS cnt
FROM hse_assessment_deduction
WHERE source_detail->>'kind'='grid_unchecked_monthly' GROUP BY 1,2,3 ORDER BY 1,2,3;

-- 4) 当月台账覆盖（守卫对照；6/7 月为 0、8 月 >0）
SELECT EXTRACT(YEAR FROM inspection_date) AS y, EXTRACT(MONTH FROM inspection_date) AS m, COUNT(*)
FROM grid_inspection_records
WHERE inspection_date >= '2026-06-01'
GROUP BY 1,2 ORDER BY 1,2;

-- 5) 李先菊 8 月台账完整性（应含 28 条，08-02 记录 id=5377 存在）
SELECT id, personnel_name, inspection_date, image_content, serial_no
FROM grid_inspection_records
WHERE personnel_name='李先菊' AND inspection_date >= '2026-08-01'
  AND inspection_date < '2026-09-01' ORDER BY inspection_date;
```

---

## 六、回滚方法

### 6.1 代码回滚

- 生效分口径：恢复 `assessmentScoringEngine.getEffectiveDeductionTotal` 原 SQL（只看 suggested_score）。
- 本通路自动扣分：移除 `hse-assessment-monthly.js`（/scoring/execute 扫描 + unlock 接口）、`import.js` 钩子、`assessmentScheduler.js runGridCheck` 对 `gridUncheckedDeductionService` 的引用即回到旧行为（`GRID_MISS` 保持停用）。
- 前端：移除 `deduction-review.vue` 的「恢复自动」按钮/生效分列与 `assessment-monthly.ts` 的 `unlockDeduction`。

### 6.2 数据回滚

```sql
-- 一键软删本通路全部明细后重跑执行评分即可还原分数
UPDATE hse_assessment_deduction SET is_deleted=TRUE, updated_at=NOW()
WHERE source_detail->>'kind'='grid_unchecked_monthly' AND is_deleted=FALSE;

-- 单个锁定行恢复自动计算用 unlock 接口（POST /deductions/:id/unlock）
```

---

## 七、注意事项与遗留观察

1. **台账数据只到 2026-08**：6/7 月周期经守卫保护不会误扣；若未来补入历史台账，守卫会自动解除并正常按缺次扣分。
2. **手工「执行评分」对无台账周期**：返回 `grid_unchecked.reason='no-ledger-data'`，不阻断其它扣分计算。
3. **姓名匹配**：`actual=0`（actualZero:true）的人员仍需人工确认是「真没巡查」还是姓名不一致，守卫仅保证「当月无任何台账」时不误扣，不解决个别人员姓名不匹配。
4. **人工锁定语义**：本期复用 `review_status`（approved/adjusted = 锁定）+ `confirmed_score`，未新增数据库列；豁免=调整该行为 0 分。
5. **测试现场**：所有临时扣分/台账已清理；李先菊 id=5377 已恢复完整；24 条 cycle 24 有效明细为真实业务结果，未回滚。
