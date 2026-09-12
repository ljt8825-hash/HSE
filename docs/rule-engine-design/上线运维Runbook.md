# 上线运维 Runbook · HSE 月度安全履职自动考核（规则引擎）

> 适用对象：业务管理员 / 运维
> 配套：执行报告-09（`执行报告-09-9月上线就绪核查.md`）、执行报告-10（`执行报告-10-9月周期补建与调度修复.md`）、执行报告-11（`执行报告-11-窗口修复与旧路开关.md`）、`方案设计-月末自动冻结.md`
> 范围：规则引擎自动扣分（网格缺巡 `grid_unchecked` + 三违自身行为 `violation_record`）的月度上线、监控、重跑、异常处置。
> 铁律：**零评分行为变化**——非经评估不得改动调度逻辑、不得激活 VIOLATION002、不得改动 AUTO 列表。

---

## 1. 月初检查清单（每月 1 日）

目标：确认"上月"考核周期已自动创建、调度在跑、规则库最近执行结果可读。

1. **当月周期是否创建（提示词-10 已修复调度语义）**
   - 调度语义（自 2026-09 起）：每月 1 日 00:30 `CRON_CREATE_CYCLE` 触发 `createScheduledCycles`，**自动确保"当月 + 上月兜底"两个周期存在**（幂等，已存在跳过）→ 9/1 建 9 月（HSE-CYCLE-202609）+ 兜底 8 月（已存在跳过）。
   - 界面：考核评分页 → 周期下拉，应出现 `YYYY年MM月月度考核`（**当月**）。
   - 库（运维）：`SELECT id, cycle_code, status, target_count FROM hse_assessment_cycle WHERE cycle_code='HSE-CYCLE-YYYYMM' AND is_deleted=FALSE;`
   - ⚠️ 若调度未跑 / 后端进程停机 / 刚改完调度代码未重启：当月周期可能缺失。应急手工补建（同 `_create_cycle_202609.js` 同款逻辑）：
     `node server/scripts/_ruleEngine/_create_cycle_202609.js`（参数化可复用），或直接调 `autoCreateAndSyncCycle(年,月)`。
   - 历史背景：修复前（提示词-09 发现）调度只建"上月"，9 月周期不会自动出现；**2026-09 周期已由任务 A 于 2026-08-31 应急补建**（id=43, target_count=62），故 9/1 起旧代码也会因"窗口含 9/1"而累计。
2. **调度日志关键字**：后端 stdout 搜 `[assessment-scheduler]`
   - 期望见到：`✅ 定时调度已启用`、`自动确保考核周期存在（当月+上月兜底）`、`周期创建结果 YYYY-MM: ...`、`每日校验完成`、`网格巡查校验完成`。
   - 若整日无上述日志 → 见 §5.1。
3. **规则库「最近执行结果」三数读法**（规则库页 → 扣分规则 → 最近执行结果列）：
   - 形如 `扫描62人/考核56人/扣分54人`：月度聚合（按人），`assessed≠scanned` 时显式补"考核 N 人"避免误解。
   - 形如 `扫描0人/扣分0人次`：事件级（按条/人次），三违自身行为适用。
   - `—`：该规则本轮未实际运行（新接入/无数据）。

---

## 2. 月中：自动扣分随调度累计

- **进行中周期数字增长属预期**：每日 01:00（网格校验）+ 02:00（全量校验）会累计网格缺巡与三违自身行为扣分；随着当月台账/违规录入增多，扣分人数与分数上升。
- **月末冻结为整月口径**：周期状态进入 `frozen` 后引擎拒绝自动变更（`assessmentScoringEngine.js` 有 `frozen/not_started` 守卫）。注意：**当前调度器无自动冻结逻辑**，周期会长期保持 `pending_review`，需人工冻结或后续补 freeze 任务（见执行报告-09 发现 A3）。
- **人工扣分 Excel 导入超上限提示**：仅提示不拦截。含义——某类别（如三违管理）累计扣分已达 `hse_assessment_category_limit.max_deduct` 上限时，前端/接口返回 advisory 预警，但**不阻断导入**；自动通路则强制钳制（`applyCap` 走 `VALID_SOURCES` 强制砍断）。

---

## 3. 手动触发 / 重跑（安全、可幂等）

门面 `runCycleAutoDeductions(cycleId,{dryRun})` 幂等，可安全重跑。

### 3.1 预览（零写入，强烈建议先跑）
```
cd server
node -e "require('dotenv').config({path:require('path').resolve(__dirname,'../.env')}); \
const {pool,testConnection}=require('./config/db'); \
const eng=require('./services/ruleEngine/engine'); \
(async()=>{await testConnection();eng.ensureAdaptersRegistered(); \
const r=await eng.runCycleAutoDeductions(<周期ID>,{dryRun:true}); \
console.log(JSON.stringify(r.adapters));})().catch(e=>console.error(e))"
```
- 输出每适配器 `scanned/assessed/affected/deducted`。`dryRun` 不写库、不刷新分数、不写观测。

### 3.2 正式重跑（写库，幂等）
- 去掉 `dryRun`、直接调用 `runCycleAutoDeductions(<周期ID>)`（建议经后端既有接口/脚本，勿直连生产库手工 UPDATE）。
- 重复运行安全：按月度幂等键（网格）与 `source_id`（三违）去重，已存在且未变 → `noop`，已锁定（approved/adjusted）→ `locked` 不覆盖。
- 既有探针脚本：`server/scripts/_ruleEngine/_probe_cycle24.js`（cycle24 回归）、`_probe_cycle_sept.js`（9 月窗口/cycle24 无回归，只读）。

### 3.3 输出解读
- `affected=0`：本轮无新增/撤销（数据未变或已被过往运行覆盖）→ 正常。
- `affected>0`：本轮新增/撤销了扣分行 → 检查对应 `hse_assessment_deduction` 行的 `source_detail`（含 `summary`/`kind`/`sourceId`）。

---

## 4. VIOLATION002（三违未整改）激活流程

> 当前状态：**已备建、未激活**。适配器 `adapters/violationUnrectifiedAdapter.js` 已 `registerAdapter`（引擎 `engine.js:39`），但其 `METRIC_CODE=null`（激活前 `ensureMetric` 返回 `{code:null,id:null}` 不写库），且**不在** `AUTO_DEDUCTION_ADAPTERS`（`engine.js:30` 仅 `grid_unchecked`+`violation_record`）。故当前零影响。

激活四步（须业务拍板后由开发执行，**本轮未激活**）：
1. **业务口径确认**：未整改三违的判定口径（需整改=是 / 未整改三态 / violator_id 非空 / 月窗口），与计分（当前默认 1 分/次，见适配器 `scan` 测试）。
2. **指标号确认**：确定 `metric_code`（或沿用适配器默认值），确保 `hse_assessment_metric` 存在。
3. **去注释/执行就绪 SQL**：确认适配器内候选 SQL 与指标补建语句；如有被注释的就绪 SQL，按业务口径解除并执行（**生产执行须走变更审批，不在就绪核查内**）。
4. **AUTO 列表加键 + 重启**：将 `'violation_unrectified'` 加入 `AUTO_DEDUCTION_ADAPTERS`（`engine.js:30`），重启后端使 `ensureAdaptersRegistered` 生效；随后按 §3.1 跑 `dryRun` 验证，再正式重跑目标周期。
- ⚠️ 激活前必须确保**录入端已落键**（violator_id / violation_date 完整），否则事件级幂等无法命中。

---

## 5. 异常处置

### 5.1 调度没跑
- 查后端进程是否在 00:30/01:00/02:00 存活；搜日志 `[assessment-scheduler]`。
- node-cron **无补跑**：漏跑的当天需人工补——按 §3 手动重跑对应周期。
- 确认 `SCHEDULER_ENABLED`（提示词-10 已外置：默认 `true`，环境变量显式设 `SCHEDULER_ENABLED='false'` 即停用，**无需改码**，重启后端进程生效）。

### 5.2 扣分明显错误如何查
路径：`hse_assessment_deduction` → 按 `cycle_id` + `source_detail->>'kind'` 定位：
- 网格缺巡：`kind='grid_unchecked_monthly'`，看 `source_detail.{expected,actual,missing,summary}`。
- 三违自身行为：`kind='violation_event'`，看 `source_detail.{sourceId,violationDate,checkSource,checkSourceText,employeeId}`。
- 跨适配器隔离：两个事件适配器按 `kind` 区分（`violation_event` vs `violation_unrectified`），互不误判"已存在"。
- 锁定态排查：`review_status IN ('approved','adjusted')` 的自动扣分行不会被重跑覆盖/软删（返回 `locked`）。

### 5.3 回滚要点
- **适配器下线**：从 `AUTO_DEDUCTION_ADAPTERS` 移除对应键 + 重启 → 该通路不再产生新扣分（既有行保留，不自动撤销）。
- **规则置待数据**：将规则 `integration_status` 改为 `pending_data`（前端显「暂不会自动扣分」），等同于停用自动通路。
- **扣分行软删**：引擎 `revoke` 走软删（`is_deleted=TRUE`），可经既有管理接口/脚本恢复（`revived`）。

---

## 5.4 调度长效语义（提示词-10 修复，2026-09 起生效）

> 仅动 `server/services/assessmentScheduler.js`，引擎层零改动。改动后**必须重启后端进程**才生效（node-cron 不支持热替换已注册任务）。

- **建周期（每月 1 日 00:30，`CRON_CREATE_CYCLE`）**：回调调 `createScheduledCycles(now)` → `getScheduledTargetMonths` 返回 `[当月, 上月]` 两项，分别 `autoCreateAndSyncCycle`（幂等，已存在返回 `skipped`）。彻底修复"只建上月"缺陷，确保当月周期从 1 日起就在位。
- **网格校验（每日 01:00，`CRON_GRID_CHECK`，`runGridCheck`）**：周期 WHERE 新增 **3 天收尾宽限**：
  ```sql
  WHERE is_deleted=FALSE AND status IN ('in_progress','pending_review')
    AND start_time <= NOW()
    AND ( end_time >= NOW() OR end_time >= NOW() - INTERVAL '3 days' )
  ```
  语义：窗口含今天的周期（当月累计）+ 刚结束 3 天内的周期（月初补跑上月收尾整月口径，upsert 幂等、人工锁定行不覆盖，与"执行评分"手工触发同路径，无新增风险）。服务器宕机/晚建场景的安全网。
- **调度开关外置**：`SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED !== 'false'`（默认 `true`；显式 `'false'` 停用，无需改码）。
- **cron 表达式 / 时区**：`CRON_CREATE_CYCLE='30 0 1 * *'`、`CRON_DAILY_CHECK='0 2 * * *'`、`CRON_GRID_CHECK='0 1 * * *'`、`CRON_TZ='Asia/Shanghai'`，均保持硬编码常量不动。
- **单测**：`server/services/__tests__/assessmentScheduler.unit.test.js`（10 项，覆盖 getScheduledTargetMonths 跨年/年末、createScheduledCycles 幂等、runGridCheck 3 天宽限 WHERE、SCHEDULER_ENABLED 外置、cycleBoundary 本地午夜边界）。

---

## 5.5 周期窗口时区修复 + 旧路刹车开关（提示词-11，2026-08-31）

> 仅动 `assessmentScheduler.js`（`cycleBoundary`）+ `assessmentScoringEngine.js`（`FILL_SOURCES` 开关），引擎自动扣分路径零改动。代码修复**待重启后端生效**；数据修复即时生效。

### 5.5.1 周期窗口时区修复（cycleBoundary）
- **缺陷**：原 `cycleBoundary` 用 `new Date(Date.UTC(...))` 构造窗口 → 落库为 UTC 0 点 = 北京 08:00，周期窗口偏 8 小时（9/1 01:00 网格校验 `start_time<=NOW()` 不成立、月末跨入下月早 8）。
- **修复**：改为本地午夜 `new Date(year, month-1, 1, 0,0,0,0)` 与 `new Date(year, month, 0, 23,59,59,999)`（服务器时区固定 Asia/Shanghai，与手工建周期落库口径一致）。已 `grep Date.UTC` 确认仅此一处业务边界使用（其余如 `objectives.js` 的 `Date.UTC(1899,...)` 为 Excel 时间戳，不动）。
- **数据修正（即时生效）**：`server/scripts/_ruleEngine/_fix_cycle43_window.js` 已执行，将 `HSE-CYCLE-202609` 窗口由 `2026-09-01 08:00~2026-10-01 07:59` 修正为 `2026-09-01 00:00:00~2026-09-30 23:59:59`；前置断言 deduction/score 均为 0 行（安全），幂等。
- **单测**：`cycleBoundary` 返回本地 00:00:00 / 23:59:59.999，年末/年初月份借位正确。

### 5.5.2 旧评分路刹车开关（FILL_SOURCES，默认=现状）
- 位置：`assessmentScoringEngine.js` 的 `fillMissingDeductionsForTarget` 两条旧路：
  - **training**（培训不合格补扣，`HSE-KPI-TRN-002`，3 分/次）——受 `LEGACY_TRAINING_FILL` 控制。
  - **accident**（事故一票否决，`HSE-KPI-NEG-001/002/003`，suggestedScore=100）——受 `LEGACY_ACCIDENT_VETO` 控制。
- **默认值（铁律）**：`LEGACY_TRAINING_FILL !== 'false'`、`LEGACY_ACCIDENT_VETO !== 'false'` → **默认启用 = 与今天完全一致**。两路当前关联键全空（死路），不产生任何新扣分；关闭仅跳过、不打断其它评分。
- **用途**：事故/培训录入落键治理前，业务可先关旧路、等引擎适配器按规则库口径重建（避免落键后静默激活、无口径无测试覆盖的风险）。
- **停用方法**：设环境变量 `LEGACY_TRAINING_FILL=false` 或 `LEGACY_ACCIDENT_VETO=false` 并**重启后端**；首次跳过时打印 `旧培训补扣路已停用 (LEGACY_TRAINING_FILL=false)` / `旧事故否决路已停用 (LEGACY_ACCIDENT_VETO=false)`。
- **单测**：`server/services/__tests__/assessmentScoringEngine.fill.unit.test.js`（默认双路执行并各产生补扣/否决；单关/双关时对应 fetch 不被调用、无补扣）。

### 5.5.3 每日健康检查脚本（只读）
- 新增 `server/scripts/_ruleEngine/health_check_daily.js`（只读、零写入、可重复执行）：
  1. 当月周期存在性 + 窗口本地边界（发现 UTC 偏移报 WARN）；
  2. 当月 targets 行数与 `target_count` 一致性；
  3. 对当月周期 `runCycleAutoDeductions(cycleId,{dryRun:true})` 演练，断言扣分表 count 前后一致（零写入）；
  4. R000001 / VIOLATION003 最近执行周期/摘要/时间，提示"今天是否已跑过"。
- 退出码：`0` 全绿 / `1` 有 WARN / `2` 有 ERROR（可接入监控告警）。
- 用法：`node server/scripts/_ruleEngine/health_check_daily.js`（建议每日 02:30 后由 cron/CI 调用，结合 §3.1 的 dryRun 预览）。

### 5.6 调度事实：启动期行为（提示词-12 查证，2026-08-31）

> 结论：**后端启动期不会立即执行引擎/网格校验，仅注册 cron 任务**。9/1 实战观察期内每次重启都不会"重跑"考核，无噪声、无副作用。

- **启动入口**：`server/app.js:575` 在 `server.listen` 回调内调用 `initAssessmentScheduler()`（仅 `NODE_ENV !== 'test'` 时）。
- **`initAssessmentScheduler()` 行为**（`assessmentScheduler.js:418`）：开启 `SCHEDULER_ENABLED` 后**只 `cron.schedule(...)` 注册三个定时任务**（create 00:30 / daily 02:00 / grid 01:00），**无任何 `runCycleAutoDeductions` / `runGridCheck` 的启动期即时调用**。首次真实执行发生在下一个 cron 命中点。
- **09:02 观测写入来源查证（非启动即跑）**：规则库 `last_run_at=2026-08-31 09:02`、R000001「扫描62人/考核56人/扣分54人」、VIOLATION003「扫描0人/扣分0人次」，由人工脚本 `server/scripts/_ruleEngine/_refresh_cycle24_summary.js`（提示词-07 任务 C.2，文件 mtime 恰为 09:02）调用 `engine.runCycleAutoDeductions(24)`（非 dryRun、幂等刷新观测文案）产生；**非后端启动触发**。
- **影响评估**：幂等无害（重复运行 `affected=0`）；后端重启只是重新 `cron.schedule`，不会自动补跑历史周期——漏跑当天仍需按 §3 手动重跑。既非"每次重启都跑一遍"的噪声，也非阻断问题，属预期行为。
- **运维要点**：所以 9/1 首日的"首次考核"发生在 `00:30 建周期 → 01:00 网格校验 → 02:00 全量校验` 的 cron 链上；若首日须提前看到 9 月窗口首跑，可在 02:30 后先跑 `health_check_daily.js`（dryRun 零写入），再按需按 §3.2 正式重跑。
- **宽限期补跑只补扣分、不刷观测（提示词-14 修复）**：`runCycleAdapters` 的观测写入条件由 `if(!dryRun)` 改为 `if(!dryRun && shouldWriteObservability(cycle, now))`。即仅当 `now` 处于周期窗口 `[start_time, end_time]` 内才刷新 `last_run_*` 三数；3 天宽限期内补跑上月（`now > end_time`）照常执行扣分 upsert/撤销/钳制/锁定，**但不覆写** `last_run_*` —— 规则库页"最近执行结果"永远=进行中周期最近一次运行，消除"新月份却显示上月扣分 54 人"的误读。扣分计算行为零变化，改动随 D7 重启生效。
- **D7 重启完成（2026-08-31 15:38）**：本小节所述调度新语义、`LEGACY_FILL_ENABLED` 刹车开关、观测守卫均已随用户重启（OLD_PID 26244 → NEW_PID 28544）生效；重启后实测见 §7.4 与 `执行报告-15-D7重启与验证.md` §9。

---

## 6. 9/1 首日复核记录表（任务 A 已补建，预填实测值）

> 背景（提示词-09 发现 + 提示词-10 修复）：原调度只建"上月"，9 月周期不会自动出现；**任务 A 已于 2026-08-31 应急补建 `HSE-CYCLE-202609`（id=43, status=in_progress, 窗口 2026-09-01~2026-09-30, target_count=62，较 8 月 +6 名新任经理）**，故 9/1 起旧代码也会因"窗口含 9/1"而累计。自 2026-10 起由新语义（建当月+上月兜底）长效保障。

> ✅ **执行时序说明（提示词-13 已完成）**：本核验设计执行时机为 **2026-09-01 09:30 之后**（00:30 建周期 / 01:00 网格校验 / 02:00 全量校验三段 cron 已跑完）。
> - 第一轮于 **2026-08-31 12:26** 提前执行，仅完成「9/1 前就绪确认」（见 §6.1），当时 9/1 实战数据尚未产生，未伪造任何值。
> - **第二轮（正式）于 2026-09-01 16:40 执行**，三段 cron 均已跑完，§6.2 已按实测值填写完毕，详见 `执行报告-13-9月首日实战核验.md`。
> - **总结论：首日实战 GREEN**（守卫实战成立、无错误扣分、cycle24 parity 保持）；另有 1 项非阻断观测缺口（R000001 因 9 月台账为空被 noLedger 跳过未写观测）与 2 项记录事项（PID 变化、健康检查 WARN 语义），见 §6.2 末三行。

### 6.1 预核验基线（2026-08-31 实测，非 9/1 值）

| 检查项 | 实测（8/31） | 结论 |
|---|---|---|
| 9 月周期 `HSE-CYCLE-202609` 是否存在 | **存在** id=43, status=in_progress, 窗口 `2026-09-01 00:00:00 ~ 2026-09-30 23:59:59`, target_count=62, targets 行数=62 | ✅ 就绪 |
| 周期唯一性 | 仅 id=43 一行有效（含软删复核仅 1 行） | ✅ 无重复 |
| 窗口本地午夜（无 UTC 偏移） | `09-01 00:00:00 ~ 09-30 23:59:59` CST | ✅ 正确 |
| cycle43 扣分行数 / 分值 | 0 行 / 0（首日前预期） | ✅ |
| cycle43 得分行数 / 分值 | 0 行 / 0 | ✅ |
| cycle43 三违 9 月窗口计数 | 0（随录入增长） | ✅ |
| 每日健康检查（今日=8 月→定位 202608） | 退出码 0 / GREEN；dryRun 零写入断言通过；脚本健康 | ✅ |
| cycle24 parity（8 月不应变） | 网格 54 行 / 103.00 分 / 三违 0 行；targets 56 / 5497.00 / 56 非零 | ✅ 不变 |
| 调度日志 `[assessment-scheduler]`（9/1 段） | 今日(8/31)无 9/1 日志；已知日志文件(_10/_06d2)为 8/22 且无 scheduler 标记 → 以库内证据替代 | ⏳ 待 9/1 |

> 注：健康检查脚本按服务器当前月定位周期，8/31 正确指向 `HSE-CYCLE-202608`（56 targets）；**2026-09-01 00:00 起自动切到 `HSE-CYCLE-202609`（62 targets）**，无需改码。

### 6.2 首日实战复核（**已填写 · 2026-09-01 16:40 实测**，提示词-13）

> 执行人：WorkBuddy（自动化核验）· 执行时刻：2026-09-01 16:40（三段 cron 均已跑完）· 全部数字来自实跑/连库实测。
> 详细证据与判定见 `执行报告-13-9月首日实战核验.md`。

| 检查项 | 预期 | 实际（9/1 实测） | 结论 |
|---|---|---|---|
| 9 月周期 `HSE-CYCLE-202609` 是否存在 | **已存在**（任务 A 补建 id=43, target_count=62） | **存在**：id=43 / in_progress / target_count=62 / targets 62 / 窗口 `2026-09-01 00:00:00 ~ 2026-09-30 23:59:59` | ✅ |
| 周期唯一性（无重复） | 仅 1 行有效 | `HSE-CYCLE-202609` 仅 id=43（`is_deleted=FALSE`）；`HSE-CYCLE-202608` 仅 id=24 | ✅ 00:30 幂等跳过 |
| 调度日志 `[assessment-scheduler] 定时调度已启用` | 存在 | **存在**（`logs/backend_restart_out.log`，进程启动 2026-09-01 12:49:52）。00:30/01:00/02:00 **执行行无日志文件**（该时段进程无 stdout 重定向，符合预期） | ✅ 注册在案；执行以库内证据替代 |
| 01:00 网格校验 | 触发；cycles≥1（含 9 月窗口） | **已触发**：VIOLATION003 观测 `last_run_at=2026-09-01 01:00:00.781`（UTC 17:00:00.781Z）；选中集 = **[43(in_progress), 24(pending_review)]**（`ORDER BY id DESC`） | ✅ 宽限两周期同跑 |
| 02:00 全量校验 | 触发 | **已触发**：cycle43 新增 62 行 `AUTO_TOTAL_SNAPSHOT` 得分行，`created_at=2026-09-01 02:00:01`（UTC 18:00:01.051Z） | ✅ |
| 规则库 R000001 最近执行结果 | 9 月窗口新值 | **仍为 8 月值**：`扫描62人/考核56人/扣分54人`、cycle_id=24、`last_run_at=2026-08-31 16:11:20`、标签 `HSE-CYCLE-202608` | ⚠️ **未更新（非守卫失效）**：9 月网格台账 0 行 → 适配器返回 `noLedger` → engine `continue` 跳过观测写入。9 月台账首条数据录入后自动补写 |
| 规则库 VIOLATION003 最近执行结果 | `扫描0人/扣分0人次` | **符合**：`扫描0人/扣分0人次`、cycle_id=**43**、`last_run_at=2026-09-01 01:00:00.781`、标签 `HSE-CYCLE-202609` | ✅ |
| **观测守卫实战判定** | cycle24 宽限重跑不覆写当月观测 | **成立**：43 先跑写入 VIOLATION003=cycle43；随后 cycle24 宽限重跑未覆写（仍为 43） | ✅ 原「最后写入者胜」歧义项**关闭** |
| cycle43 扣分行数 / 分值 | 0 或极小 | **0 行 / 0 分** | ✅ |
| cycle43 得分行数 / 分值 | 0 或少量 | **62 行**，均 `AUTO_TOTAL_SNAPSHOT` / approved / `final_score=100.00` / `deduction_total=0` | ✅ 首日无扣分，满分合理 |
| cycle24 parity（8 月不应变） | 54 行 / 103.00 / 全 pending；三违 0 | **网格 54 行 / 103.00 / 非pending 0；三违 0 行**；全量仅 `grid_unchecked_monthly` 一种 kind | ✅ 宽限重跑幂等（affected=0） |
| 9 月窗口 `grid_inspection_records` 计数（SELECT） | 随台账录入增长 | **0**（全表 1654 行，集中在 2026-08-01 ~ 2026-08-28） | ✅ 首日无台账 → R000001 未写观测的**根因** |
| 9 月窗口 `violation_records`(有 violator_id) 计数 | 随录入增长 | **0**（存活 2506 行，`violator_id` 全 NULL → 带键 0） | ✅ 与已知落键现状一致 |
| 每日健康检查 | 退出码 0 / GREEN | **退出码 1 / 有 WARN**：周期定位、窗口、targets=62、dryRun 零写入断言**全部通过**；唯一 WARN = `R000001 今日尚未运行`（实为 noLedger 跳过，非 cron 未跑） | ⚠️ 非阻断（脚本无法区分"未跑"与"台账跳过"） |
| 代码版本判定 | 新代码在进程内生效 | **是**：01:00 cron 触发 + 宽限选中 43/24 + cycle24 未覆写观测，三项均为提示词-10/11 新语义特征 | ✅ 新代码生效 |
| 后端进程 | FINAL_PID=27488 | **PID=12280**，启动于 **2026-09-01 16:26:59**（今日 16:27 重启，晚于三段 cron）；另有 12:49:52 一次重启（有日志） | ⚠️ PID 变化已如实记录；重启均在 cron 之后，不影响取证 |

补充 SQL（只读）：
```sql
-- 9 月周期是否存在
SELECT id, cycle_code, status, target_count
FROM hse_assessment_cycle
WHERE cycle_code='HSE-CYCLE-202609' AND is_deleted=FALSE;

-- 9 月窗口台账/违规当前计数（印证 dryRun 预期）
SELECT COUNT(*) FROM grid_inspection_records
WHERE inspection_date >= '2026-09-01' AND inspection_date < '2026-10-01';
SELECT COUNT(*) FROM violation_records
WHERE is_deleted=FALSE AND violator_id IS NOT NULL
  AND violation_date >= '2026-09-01' AND violation_date < '2026-10-01';
```

---

## 7. 首日 / 月初实战核验卡（提示词-12 固化）

> 目的：把 9/1 实战观察期首日动作固化为可照做的卡片。所有命令零写入或幂等；异常分支给出对应脚本。

### 7.1 首日执行顺序（9/1 上午，约 09:30 后）

1. **看调度启动日志**（后端 stdout 搜 `[assessment-scheduler]`）：应见 `✅ 定时调度已启用` → `自动确保考核周期存在（当月+上月兜底）` → `周期创建结果 2026-09: ...` → `网格巡查校验完成` → `每日校验完成`。（若后端为提示词-10/11 修复代码且已重启，则新语义生效；若仍是旧进程未重启，建的是"上月"但 9 月周期已由应急补建存在，仍会被 01:00/02:00 选中。）
2. **跑每日健康检查（只读、零写入）**：
   ```bash
   cd server
   node ../server/scripts/_ruleEngine/health_check_daily.js
   ```
   - **预期输出（9/1）**：当月周期 `id=43`、窗口本地午夜 `2026-09-01 00:00:00 ~ 2026-09-30 23:59:59`、targets=62 与 `target_count` 一致、dryRun 扣分表 count 前后一致（零写入）、R000001/VIOLATION003 观测给出"今天是否已跑过"。退出码 `0`。
   - 9 月进行中周期的数字（scan/deduct）首日约为 `扫描0人/考核0人/扣分0人`，随台账/违规录入自然增长——**属预期，勿判为异常**。
3. **（可选）正式重跑确认**：如想首日即落 9 月窗口首值，按 §3.2 正式重跑 `runCycleAutoDeductions(43)`（幂等）；通常等待 02:00 全量校验自动跑即可。

### 7.2 异常处置分支表

| 现象 | 可能原因 | 排查步骤 / 对应脚本 |
|---|---|---|
| 当月周期不存在（health 报 `NO_CURRENT_CYCLE` / 库查无 `HSE-CYCLE-202609`） | 调度未跑 / 进程停机 / 改完调度未重启 | ① 查进程存活与 `[assessment-scheduler]` 日志；② 手工补建：`node server/scripts/_ruleEngine/_create_cycle_202609.js`（参数化，可改年月）；③ 或直接调 `autoCreateAndSyncCycle(2026,9)`。 |
| 周期窗口偏 `08:00`（health 报 `WINDOW_UTC_OFFSET`，如 `08:00:00~07:59:59`） | 运行的是旧代码（未重启，仍用 `Date.UTC` 构造） | 重启后端加载提示词-11 修复；或应急 `node server/scripts/_ruleEngine/_fix_cycle43_window.js`（前置断言 0 扣分/0 得分，幂等）。 |
| dryRun 报错 / health 退出码 `2` | 引擎/适配器异常或 DB 不可达 | ① 读 health 脚本 ERROR 行；② 按 §3.1 单独 dryRun 看 `adapters[]` 哪路 `ok=false` 及其 `reason`；③ 查 `hse_assessment_rule` 该适配器 `integration_status` 是否为 `pending_data`/`no_table`（预期零命中，非故障）。 |
| 观测没刷新（`last_run_at` 仍是旧日 / 健康报 `NOT_RUN_TODAY`） | 当日 cron 未到 / 进程重启后尚未到 02:00 | 等 02:00 全量校验；或按 §3.2 手工重跑目标周期（幂等，刷新观测文案）。 |
| 扣分异常增大（某 adapter `affected` 远超预期） | 上月底/月初台账批量补录、或历史脏数据命中 | ① 按 §5.2 定位 `hse_assessment_deduction` 的 `source_detail`（kind=网格/三违）；② 区分"真实新增" vs "脏数据"（如 82 行乱码，见 §8 决策 3）；③ 锁定态行不会覆盖；④ 必要时经管理接口软删并 §3.2 重跑。 |

### 7.3 自然增长说明

- **进行中周期数字随日期增长属预期**：网格缺巡（每日 01:00）+ 三违自身行为（每日 02:00）随当月台账/违规录入累计；首日为 0 或极小均正常。
- **月末冻结为整月口径**：当前调度无自动冻结，周期长期 `pending_review`（`frozen` 守卫已就绪，方案见 `方案设计-月末自动冻结.md`），冻结落地前数字持续累计属预期。

### 7.4 ✅ 后端重启（已完成，2026-08-31 15:38）

- **重启已由用户执行完成**（OLD_PID 26244 → 28544（15:38 首次）→ **27488（16:10 二次重启，最终）**），提示词-10/11/14 的代码（调度新语义 / `LEGACY_FILL_ENABLED` 旧路开关 / `shouldWriteObservability` 观测守卫 / `last_run_cycle_code` 接口字段）已全部加载生效。
- **重启后验证（2026-08-31 实测，FINAL_PID=27488）**：
  1. 进程与探活：`netstat` 5800 → PID 27488；`/api/health` ok（uptime 秒级，`environment=development`）；
  2. `health_check_daily.js` 退出码 `0` 全绿（当月=202608 id=24，扣分 54 行 dryRun 零写入）；
  3. 接口 `GET /api/hse/assessment-rule` 返回 `lastRunCycleCode`（R000001/VIOLATION003=`HSE-CYCLE-202608`，TRAIN002/VIOLATION001=`null`）；
  4. 观测守卫两场景实跑 GREEN（`_post_restart_verify_20260901.js` 退出码 0）：触发 cycle24（窗口内）→ `last_run_at` 09:02:58→15:44:26 刷新；触发 cycle43（窗口外，9/1 起）→ 保持 24、未写成 43；
  5. 三套件 jest **121/121**（9 suites）。
- **残留复核（9/2 上午）**：确认三段 cron 注册行（`[assessment-scheduler]` 日志）、9/1 01:00 网格校验选中 cycle24+cycle43、观测切 9 月口径且未被 cycle24 覆写。
- ⚠️ **运维教训**：WorkBuddy 代理会话（非提权）**无权终止**用户后端进程（`Stop-Process` 拒绝访问），后续重启应由用户在自己的终端执行，代理只做验证与清理自身孤儿进程。

---

## 8. 待业务决策 5 项（不决策的影响）

| # | 决策项 | 不决策的影响 |
|---|---|---|
| 1 | **未标注来源 1 分 vs 0 分**（三违 `check_source=NULL` 的 `NULL_SCORE`）：当前 `violationAdapter.js` 默认 1 分，注释说明"若业务要求未标注不计分改 0 即可" | 未标注的违规一律按 1 分计，可能高估三违扣分；长期口径不一致难追溯。 |
| 2 | **培训口径 A/B**（`TRAIN001` 等 `no_table`/`pending_data` 计分口径未定）；旧培训补扣路 `LEGACY_TRAINING_FILL` 是否保留默认启用 | 培训类规则持续 `pending_data`/"未接表"，不参与自动扣分，培训考核口径空缺；落键后旧路可能静默激活，建议先关旧路等适配器重建。 |
| 3 | **82 行乱码处置**（`violation_records` 等历史脏数据） | 脏数据干扰三违窗口命中与归类，潜在错扣/漏扣。 |
| 4 | **VIOLATION002 口径**（三违未整改激活口径与指标号） | 未整改三违不自动计分，整改闭环缺乏自动考核牵引（当前已备建未激活）。 |
| 5 | **四类无源表检查立项**（培训/车辆/消防/转运站/晨会适配器是否建设） | 对应业务数据无自动考核覆盖，仍依赖人工/Excel，考核完整性不足。 |

---

## 9. 附录：关键不变式（上线后勿破）

- `AUTO_DEDUCTION_ADAPTERS` = `['grid_unchecked','violation_record']`（2 个）。
- `FILL_SOURCES`（training/accident 旧评分路）已被 `LEGACY_TRAINING_FILL` / `LEGACY_ACCIDENT_VETO` 刹车开关包住，**默认启用=现状**（死路不产生新扣分）；业务拍板后可设 env 停用，无需改码。不主动拆除（保留历史回填能力）。
- `web-antd` 不改动；前端仅 `安全看板vben/apps/web-naive`。
- 调度零写入路径：`dryRun` 不写库、不写观测、不刷新分数。
- 月末冻结：**当前调度无自动冻结逻辑**（周期长期 `pending_review`），`frozen` 守卫已在引擎/调度 WHERE 就绪；方案设计见 `方案设计-月末自动冻结.md`（仅设计，未实现）。
- 回归门禁：规则引擎三套件（ruleEngine 95 + scheduler 14 + scoring-fill 4）**共 121/121**（提示词-14 在 engine 单测追加 8 项守卫用例）；全量 jest 失败数=7 基线；typecheck=51 基线。

### 9.1 已知问题（观察记录，下轮候选，不改码）

- **观测文案"最后写入者胜"歧义 —— ✅ 已修复（提示词-14，2026-08-31）**：原 `hse_assessment_rule.last_run_*` 每次真实运行按规则覆写、不区分周期，9/1 新代码（带 3 天宽限）会让 cycle24 后写覆盖 R000001，页面显示"9 月却扣分 54 人"（实为 8 月数字）。**修复手段**：
  - 后端守卫：`runCycleAdapters` 观测写入条件加 `shouldWriteObservability(cycle, now)`（仅 `now` ∈ 周期窗口 `[start_time, end_time]` 才刷观测；宽限期补跑只补扣分不刷观测），扣分计算行为零变化。
  - 前端标签：规则库页"最近执行结果"列新增"执行周期"标签（如 `2026-08周期`），由列表接口 `last_run_cycle_code`（LEFT JOIN `hse_assessment_cycle`）驱动；`last_run_cycle_id` 为 NULL 时不显示。
  - 改动随 D7 重启生效；**重启前旧代码行为不变**（旧代码无宽限、只跑当月周期，本就不会覆写）。**✅ 已于 2026-08-31 重启后实测复测通过**：触发 cycle43（9 月周期，窗口未到）→ `last_run_cycle_id` 保持 24、`last_run_at` 未刷新（守卫拦截不覆写）；触发 cycle24（8 月窗口内）→ `last_run_at` 正常刷新（09:02:58→15:44:26）。详见执行报告-15 §9.5。
