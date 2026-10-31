# B-1-P1-04-02C-R2｜考核周期模型与任职事务边界定稿

> 节点：B-1-P1-04-02C-R2　分支：feat/b02-dec-03.13-a02d-status-code　基线 HEAD：1e5f5e0
> 前置：04-02C（4463f10）／04-02C-R1（1e5f5e0）
> 本轮只处理 ChatGPT 独立审查指出的三个问题：D-08 周期模型矛盾、D-02 事务边界、负责人 PUT 字段语义。
> 不重新盘点全仓；不修改业务代码；不执行数据库操作；唯一 Git 写操作 = 本报告独立提交。

---

## 一、R2 问题定界与 R1 关系

R1-02 推荐的 D-08「方案 2（cycle 共用）」被独立审查指出两处硬矛盾，本轮定稿：

1. **共用同一行 `hse_assessment_cycle` 时 `status/scored_count/frozen_*` 全部单值共享**——两套体系无法各自开启/关闭/审核/确认，违反「不得因同一自然月自动共享生命周期状态」约束。
2. R1 方案 2 的「加 `assessment_system` 可空列、NULL 视为 hse_special」实质是**一行周期服务两套体系**的表达，被明确禁止。

R1 的另两项（R1-01 停用并发、R1-03 统一写入）方向保留，本轮分别补充事务边界定稿（R1-03 深化）与无新证据声明（R1-01/TEST-U-119）。

---

## 二、D-08：考核周期模型重新定稿

### 2.1 周期创建与状态流转实证（本轮全部重读源码，非推断）

| # | 证据点 | 实码位置 | 内容 |
|---|---|---|---|
| E1 | 手动创建入口 | `assessmentMonthlyCycleService.createCycle :22-52` | `cycle_code = 'HSE-CYCLE-' + YYYYMM`（前缀硬编码 HSE）；不传 status → 表默认 `not_started` |
| E2 | 自动创建入口 | `assessmentScheduler.autoCreateAndSyncCycle :84-117` + cron `:29-31`（每月 1 日 00:30，当月+上月兜底 `:45-52`） | **直接 `status='in_progress'`**（:101），跳过 not_started；INSERT（:97-107）与 `syncAssessmentTargets`（:110）**两步独立、无事务包裹** |
| E3 | 状态机 | `assessmentMonthlyShared.CYCLE_STATUS :31-37` | 5 态：`not_started → in_progress → pending_review → reviewed → frozen` |
| E4 | 启动 | `startCycle :245-316` | not_started→in_progress；事务内从 `v_employee_org_full` 白名单生成 target（正式员工 + 岗位/网格长过滤，:264-283） |
| E5 | 评分置态 | `assessmentMonthlyScoringService :105-108` | in_progress→**pending_review**；LIVE/HISTORICAL_BACKFILL 双模式（:62-69） |
| E6 | 冻结 | `assessmentMonthlyFreezeService.freezeCycle :18-129` | 前置=全部 target `review_status='approved'`（:37-46）；事务内锁乡镇排名+全量排名（:54-79）→ cycle status='frozen' + target 全部 frozen |
| E7 | 解冻 | `unfreezeCycle :132-190` | frozen→reviewed；受 `evaluateCycleHistoryProtection` 历史保护（shared :230-248） |
| E8 | 旁门状态口 | `updateCycle :159-213` | `status` 字段可直接由 PUT 改写（:190-193），仅挡 frozen——**非状态机流转的第三入口** |
| E9 | 调度消费 | `runDailyCheck :192-195`、`runGridCheck :391-397` | `WHERE status IN (...)` **无任何体系维度过滤** |
| E10 | 排名读取 | `hseAssessmentAnalysisService.townshipRanking :550-570` | 按 cycleId 或「最新含乡镇经理 target 的周期」取数，读 cycle 表 + target.township 文本 |
| E11 | 前端周期选择器 | `安全看板vben/apps/web-antd/src/api/hse/assessment-monthly.ts :190-202`（getAssessmentCycleList → `GET /cycles`） | cycles.vue / deduction-adjust.vue / deduction-review.vue / excel.vue / freeze.vue 五页面消费；**请求参数无体系维度** |
| E12 | 表结构 | `sprint10d2_assessment_init.sql :25-48` | `idx_cycle_code_active` = UNIQUE(cycle_code) WHERE is_deleted=FALSE（:53）；cycle_code 注释固定 `'HSE-CYCLE-{YYYYMM}'`（:56）；表注释「月度考核周期表」 |
| E13 | 生产绩效域现状 | 全仓 grep `production_perf / 生产绩效`（services+routes） | **零命中——第二套体系尚无任何代码**，R1 的 production_perf_target/score 是纯设计 |
| E14 | 权限 | `routes/hse-assessment-monthly/main.js :22-28` | 周期 CRUD/start 复用 `hse:training:create/update/delete` 权限码（考核域写权限复用为存量定局） |

**核心事实**：`hse_assessment_cycle` 被 ≥9 处读取/消费（E1-E12），**全部无体系过滤**；cycle_code 全局唯一（E12）；第二套体系零代码（E13）。

### 2.2 三方案比较

**方案 A：共用自然月基础数据，两套体系分别拥有独立考核周期**（同表两行：`hse_assessment_cycle` 加体系列，每行单属一个体系，cycle_code 前缀区分 `HSE-CYCLE-*` / `PERF-CYCLE-*`）
**方案 B：共用周期主表 + 周期与考核体系关联表**（`cycle_system_map(cycle_id, system_code)` 多对多）
**方案 C：两套周期完全独立**（新建 `production_perf_cycle` 表；HSE 专项周期表一列不加、一行不增；只复用 `cycleBoundary()` 日期边界、评分工具等通用能力）

| 维度 | 方案 A（同表两行） | 方案 B（多对多） | **方案 C（独立周期表）** |
|---|---|---|---|
| 生命周期隔离 | 行级隔离，status 各自独立 ✓ | **一行周期 status 单值，两体系共享 ✗（若把状态挂到 map 表则状态机复制、主表 status 语义悬空）✗** | 表级隔离，完全独立 ✓✓ |
| API 兼容 | `GET /cycles` 必须加体系参数，5 个前端页面全部改造；遗漏=生产绩效周期混入 HSE 管理页 | 同左，另加 map 表 CRUD | 现有 API/前端**零改动**；生产绩效新前缀独立成组 ✓ |
| 权限隔离 | 共用 `hse:training:*`（E14），需新增权限码并改造 28 条路由 | 同左 | 新独立权限码，新路由组 ✓ |
| 历史兼容 | 加列 + 新行；历史行体系值=NULL 或默认——依赖读取解释规则 | 历史行不动 + map 空表 | **hse_assessment_cycle 一字节不动** ✓✓ |
| 统计隔离 | runDailyCheck（E9）/runGridCheck（E9）/townshipRanking（E10）/listCycles **≥9 处读取全部必须补 `体系='hse_special'` 谓词**——重蹈 R1 否掉方案 3 的「查询纪律」覆辙 | 同左且更重 | **生产绩效域在 HSE 全部既有查询中天然不可见** ✓✓ |
| 迁移复杂度 | 中（加列+改 9 处读点+前端 5 页） | 高（map 表+状态语义重构） | 中低（一张新表+新服务，与 production_perf_target/score 新表风格统一） |
| 回滚能力 | DROP 列+删新行（列上有行，回滚半破坏） | DROP 两表 | **DROP 新表即完全回滚** ✓✓ |

**方案 B 直接排除**：一行周期被两体系共享即违反约束 1/2（status 单值共享生命周期）；把开启/关闭/审核/确认状态复制进关联表等于两套状态机叠加在同一个 cycle_id 上，主表 5 态状态机（E3-E7）悬空，复杂度最高且语义最扭曲。

**推荐：方案 C（独立周期表）**。决定性论据：E9/E10/E11 实证 `hse_assessment_cycle` 的全部现有消费链**无体系过滤**——方案 A 下生产绩效周期行一旦创建即流入每日重算、网格缺巡校验、乡镇排名、前端周期列表，每一处补谓词都是一次「遗漏即混数」的查询纪律负担，与 R1 否掉「加体系字段方案」的逻辑完全同构；方案 C 使生产绩效域（cycle/target/score/metric 四张新表）自成一体，约束 2（生命周期不共享）由物理隔离自动满足，约束 5（新表不进现有排名/扣分查询）由「无任何连接路径」自动满足。

**约束 3 的落点**（历史周期 NULL 按 HSE 专项解释）：方案 C 下不新增体系列，不存在 NULL 解释需求；该规则转写为硬边界——**禁止给 `hse_assessment_cycle` 加任何体系列**；若未来 M2+ 出现必须跨体系对账的报表，走应用层显式 UNION，不改表。

**方案 A 保留为次选**：仅当业务方在 M0 前明确要求「单一周期管理界面管理两套体系」时重启，且必须附带全部 9 处读点补谓词 + 5 前端页面改造 + 新权限码的完整清单（见 2.5）。

### 2.3 推荐架构（方案 C）表关系图

```
        ┌─── HSE 专项考核体系（存量，零改动）─────────────────────┐
        │  hse_assessment_cycle ──1:N── hse_assessment_target    │
        │         │                        └──1:N── score        │
        │         │                        └──1:N── deduction    │
        │         └──1:N── hse_responsibility_chain               │
        │  消费：runDailyCheck / runGridCheck / townshipRanking    │
        │        / assessmentMonthly* 12 服务 / 前端 5 页面        │
        └──────────────────────────────────────────────────────────┘

        ┌─── 生产绩效考核体系（全新，物理隔离）───────────────────┐
        │  production_perf_cycle ──1:N── production_perf_target   │
        │         （乡镇级 org_unit_id + 班组级 operation_unit_id   │
        │           + target_level）                              │
        │                                └──1:N── production_perf_score
        │                                └──1:N── production_perf_metric（Q-B 待定）
        │  数据源：transfer_station_check（51 班组 CSV 映射回填      │
        │           operation_unit_id，加列，文本列保留快照）        │
        └──────────────────────────────────────────────────────────┘

  两域之间：无外键、无共享行、无共享状态；唯一交集 = 同锚定自然月
  （assessment_year/assessment_month）+ 复用 cycleBoundary() 日期工具。
```

### 2.4 API 调用关系与周期生命周期图

```
API（生产绩效，新前缀 /api/hse/perf/*，新权限码 perf:*）      HSE 专项（现状零改动）
POST   /perf/cycles                     （手动建）            POST /cycles
POST   /perf/cycles/auto-generate       （幂等自动建）         POST /cycles/auto-generate
GET    /perf/cycles / /perf/cycles/:id                        GET  /cycles / /cycles/:id
PUT    /perf/cycles/:id                                       PUT  /cycles/:id
POST   /perf/cycles/:id/start           （同步对象）           POST /cycles/:id/start
POST   /perf/scoring/execute            （体系内独立评分）      POST /scoring/execute
POST   /perf/freeze/cycle/:id           （体系内独立冻结）      POST /freeze/cycle/:id

                    生产绩效周期生命周期（镜像 HSE 5 态，独立实例）
   ┌─────────┐  start   ┌────────────┐  scoring  ┌────────────────┐
   │not_started├────────►│ in_progress ├─────────►│ pending_review │
   └─────────┘          └────────────┘           └───────┬────────┘
                                                  全 target approved
         ┌──────────┐   unfreeze   ┌──────────┐   freeze  ┌──▼──┐
         │ reviewed │◄─────────────┤  frozen  │◄──────────┤ ✓   │
         └──────────┘              └──────────┘           └─────┘
   调度（若业务要求自动建）= perf_scheduler 独立 cron，禁止复用
   assessmentScheduler（其 createScheduledCycles 只写 HSE 前缀，天然安全）。
```

### 2.5 若业务强制选择方案 A 的最低护栏（备查，非推荐）

1. `ALTER TABLE hse_assessment_cycle ADD COLUMN assessment_system VARCHAR(20) NOT NULL DEFAULT 'hse_special'`（每行单值，非「一行属两体系」）；
2. 生产绩效行 cycle_code 前缀 `PERF-CYCLE-YYYYMM`（不动 `idx_cycle_code_active`）；
3. 以下读点全部补 `assessment_system='hse_special'` 谓词（**缺一即混数**）：listCycles（cycle service :90-139）、runDailyCheck（scheduler :192-195）、runGridCheck（:391-397）、townshipRanking 两查询（analysis :556-570）、getCycle、updateCycle、deleteCycle、startCycle、freezeCycle + 前端 5 页面；
4. 历史行不改写（DEFAULT 元数据级生效）。

### 2.6 D-08 约束符合性对照

| 任务书约束 | 方案 C 落实 |
|---|---|
| 1. 禁止 assessment_system 表示一行属两体系 | 不加任何体系列 ✓ |
| 2. 禁止同一自然月自动共享生命周期状态 | 物理隔离，两套 status 实例 ✓ |
| 3. 历史 NULL 按 HSE 解释仅为读规则 | 无 NULL 需求；禁加列写为硬边界 ✓ |
| 4. target/score/deduction 历史零修改 | HSE 三表零触碰 ✓ |
| 5. 生产绩效新表不进现有排名/扣分查询 | 无连接路径，townshipRanking/runDailyCheck 天然不可见 ✓ |
| 6. Q-B 班组指标模板与乡镇汇总口径待确认 | production_perf_metric 独立建表倾向维持（R1 §4.3），Q-B 继续阻断 D-08 第二步 ✓ |

---

## 三、D-02：统一任职段服务事务边界

### 3.1 四路径现状实码（本轮重读，行号为当前 HEAD）

| 路径 | 事务结构 | 员工行锁 | 当前段读取 | 关段 | 缺陷 |
|---|---|---|---|---|---|
| `assignEmployee`（employeeAssignmentService :419-556） | pool.connect→BEGIN :444；COMMIT :523；catch ROLLBACK :551 | 事务内 FOR UPDATE + 关系复核 :445-467（A-02B 并发栅栏） | :469-478，**无 FOR UPDATE** | :482-489 `UPDATE ... WHERE id=$1` 只关 rows[0] 一条；**无 rowCount 检查** | C 场景（≥2 条 current）只关第一条后继续建段，靠 uk_emp_assign_primary 23505 兜底；读段与关段间无锁 |
| `rehireEmployee`（:648-860） | BEGIN :668；COMMIT :820 | FOR UPDATE :671-679 | :695-712（无 FOR UPDATE） | **不关段**：`rows.length>0` 即 ROLLBACK 拒绝（:695-712） | 场景 C 由「>0 即拒」覆盖（含 B 场景一律拒——退休人不应有 current 段，语义正确） |
| `terminateEmployee`（:1060-1160+） | BEGIN :1098 | FOR UPDATE :1101-1105 | :1148-1153 **FOR UPDATE** | 关段在锁定下执行 | **范式先例**：0 条拒绝 + ≥2 条拒绝并要求人工核实（:1154-1160） |
| V2 导入（employeeImportV2Service :927-1127） | 外层单事务 BEGIN :927→COMMIT :1090→ROLLBACK :1124；行级 SAVEPOINT :933/:1071/:1075 | **无员工行锁**（:1017-1023 直 UPDATE roster 列） | 无独立读取 | :1031-1035 `WHERE employee_id AND is_current=true AND is_primary=true`（**漏关 is_primary=false 的 current 段**）；**无 FOR UPDATE、无 rowCount 检查；多条自动全关后继续建段** | C 场景被静默吞掉；B 场景 is_primary=false 时漏关 → 与新段并存双 current |

`assignmentSegmentService` 全仓 grep 零命中——纯新设计，无兼容负担。

### 3.2 事务边界九问定稿

1. **哪一层创建事务**：业务入口层（assignEmployee / rehireEmployee / terminateEmployee / V2 批次导入）各自 `pool.connect() + BEGIN`。`writeSegment` 不取连接、不开事务。
2. **哪一层 COMMIT / ROLLBACK**：入口层。`writeSegment` 以 throw / 返回错误对象表达失败，由入口层统一 ROLLBACK；COMMIT 后的员工事件发布维持现有 fire-and-forget 模式（COMMIT 之后，失败仅告警）。
3. **writeSegment 只接收事务 client**：签名 `writeSegment(client, { employeeId, startDate, segmentFields, historyFields, actor })`。入口层断言 client 为连接对象（约定禁止传 pool），单测覆盖「传入 pool 即抛 SEGMENT_CLIENT_INVALID」。
4. **服务内部禁止独立事务**：硬规则——writeSegment 内不得出现 `pool.connect` / `BEGIN` / `COMMIT` / `ROLLBACK`；以代码评审 + 单测双重约束。
5. **employee FOR UPDATE 唯一执行位置**：入口层，事务内第一把锁（assignEmployee :445-467 / rehire :671-679 / terminate :1101-1105 现状保留；**V2 需补**：每行写段前 `SELECT id FROM employee WHERE id=$1 FOR UPDATE`，V2 现状无员工行锁是并发窗口）。writeSegment 不再锁员工。锁序 = employee → employee_assignment 段，与 R1-01 组织写事务锁序（unit → employee）为两族不相交。
6. **employee_assignment 当前段读取与锁定**：统一在 writeSegment 内部执行 `SELECT id, status, org_unit_id, position_id, start_date FROM employee_assignment WHERE employee_id=$1 AND is_current=true AND is_deleted=false FOR UPDATE`——补齐 assignEmployee（现无段锁）与 V2（现无任何锁）的缺口；terminateEmployee 的段锁逻辑收敛进服务后语义不变。
7. **原子性边界**：关段 + 建段 + employee_history 必须同一事务原子（COMMIT 前完成）；操作审计日志（ip/userAgent 类）维持事务外独立写入，失败仅告警不回滚业务——与 rehire 事件发布模式（:823+）一致。employee_history 的 `event_date` 与新段 `start_date` 同源同日（rehire :804-818 范式，历史查询以 `eh.event_date = ea.start_date` 关联）。
8. **23505 与 rowCount 转换**：
   - C 场景（≥2 条 current）：writeSegment 锁定读取后直接返回 `{ok:false, code:'SEGMENT_MULTI_CURRENT', segmentIds:[...]}`，不写任何行；入口转 BIZ_CONFLICT（409）「属数据异常，请先人工核实」——terminateEmployee :1155-1160 范式。
   - B 场景关段 `rowCount !== 1`：已 FOR UPDATE 理论不可达，防御性 ROLLBACK + 内部错误（不静默继续）。
   - 建段 INSERT 命中 `uk_emp_assign_primary`（partial unique：`is_primary AND is_current AND NOT is_deleted`）抛 23505：catch `e.code==='23505' && e.constraint==='uk_emp_assign_primary'` → 业务码 `EMP_OPERATION_DUPLICATE`（R1-01 定局维持）——这是「校验通过后被并发插入」竞态的最终防线。
   - 建段 `rowCount !== 1`：ROLLBACK + 内部错误。
9. **V2 每员工独立事务与批次状态关系**：维持外层单批次事务 + 行级 SAVEPOINT（:927/:933/:1071/:1075/:1090/:1124）。writeSegment 接收 V2 的批次 client；C 场景在 V2 语境 = 该行 `ROLLBACK TO SAVEPOINT` + 行标记 failed（记 SEGMENT_MULTI_CURRENT 原因）+ 批次继续，最终 `partial_completed` 统计——与「立即返回 409」的在线入口不同，批处理以行级失败表达冲突。批次状态更新（employee_import_pending.status='imported' :1060-1063）与段写入同事务，原子性不变。

### 3.3 三种旧段数量场景处理表

| 场景 | current 段数 | writeSegment 行为 | assignEmployee | rehireEmployee | V2 导入 | terminateEmployee |
|---|---|---|---|---|---|---|
| **A** 无旧段 | 0 | 无关段动作，返回 closedCount=0 | 合法（首次任职/空窗重建段），history event_type='入职'（:516-518 现状） | 合法（退休人段应早已关闭） | 新建段 | **拒绝**（无段不补造，:1154-1160） |
| **B** 恰一条 | 1 | FOR UPDATE 读取 → 关段（`is_current=false, end_date=新start-1`）→ 校验 rowCount=1 → 建段 | 正常调岗，history='调岗' | **拒绝**（退休人不得有 current 段，:695-712 语义保留） | 正常（谓词统一后不再漏关 is_primary=false 段） | 正常关段+登记终态 |
| **C** 多条 | ≥2 | **拒绝**：返回 SEGMENT_MULTI_CURRENT，零写入 | BIZ_CONFLICT 409 + 人工核实 | 同左（现 >0 即拒已覆盖） | 该行 SAVEPOINT 回滚 + 行失败标记，批次继续 | 拒绝 + 人工核实（现状） |

**禁止事项落实**：A/B/C 不得共用同一 `rowCount===1` 判断——A 场景无关段 UPDATE（无 rowCount 语义）、B 场景 rowCount 必须=1、C 场景在读取阶段即拒绝；**C 场景绝不自动全部关闭后继续建段**（现 V2 :1031-1035 与 assignEmployee :482-489 的行为即此禁令所指，由 writeSegment 统一消除）。

### 3.4 统一后的调用关系

```
路由层（参数解析/鉴权）
   │
   ├─ assignEmployee ────┐
   ├─ rehireEmployee ────┤  入口层：pool.connect + BEGIN
   ├─ terminateEmployee ─┤  ① employee FOR UPDATE（唯一位置）
   └─ V2 confirmBatch ───┘  ② 业务闸门（关系/资格）
   │                        ③ 调 writeSegment(client, ...)
   │                        ④ COMMIT / ROLLBACK（入口层）
   ▼
assignmentSegmentService.writeSegment(client, params)
   ├─ SELECT current segments ... FOR UPDATE      ← 段锁定（补缺口）
   ├─ C: ≥2 条 → 返回 SEGMENT_MULTI_CURRENT（零写入）
   ├─ B: 关段 UPDATE → rowCount 必须=1
   ├─ INSERT 新段 → 23505 → EMP_OPERATION_DUPLICATE（由入口 catch 或服务内转译，二选一，定局：服务内转译后 throw 业务错误对象）
   ├─ INSERT employee_history（event_date = 新段 start_date）
   └─ 返回 { closedCount, newSegmentId }（不 COMMIT）
```

**统一服务落地后，assignEmployee / rehireEmployee / V2 不得各自保留独立 INSERT/UPDATE 任职段 SQL**（任务书禁令）：三者删除各自关段/建段语句（assignEmployee :482-506、rehire :786-802、V2 :1031-1057），改为调用 writeSegment；rehire 的「不关段」语义由参数 `{ closeCurrent: false }` 表达。terminateEmployee 段关闭亦收编（其 0/≥2 拒绝语义由 writeSegment C 场景统一提供）。

### 3.5 Q-C 维持待确认

返聘作业归属来源（重选/历史恢复/允许置空）继续待业务确认，不得自行决定；Q-C 仍仅阻断 D-02 返聘场景实施，不阻塞其余场景（R1 定局维持）。

---

## 四、负责人资格校验：PUT 字段语义修正

### 4.1 现状实码（hse-org-center.js，已停挂路由，恢复前置 5-6 项维持）

`PUT /org/:id`（:188-215）：单条 UPDATE，无事务：

```sql
SET ... manager_id = COALESCE($6, manager_id) ...   -- :208
参数：manager_id !== undefined ? manager_id : null   -- :211
```

**矛盾实锤**：`undefined → null → COALESCE 吞掉` ⇒ 「未提供」与「显式 null」殊途同归为「保持原值」，**清除负责人在任何客户端语义下都不可能**；同函数 `org_name || null`（:211）还有 falsy 吞并瑕疵。POST（:140-174）`manager_id || null` 同类。此即独立审查指出的「无法区分 null 和未提供字段」问题。

### 4.2 三种字段语义定稿

| 客户端请求体 | 语义 | SQL 行为 |
|---|---|---|
| `manager_id` 键不存在（undefined） | 保持原负责人 | 该列不进入 SET 子句 |
| `manager_id: null` | 清除负责人 | `SET manager_id = NULL` |
| `manager_id: <employee ID>` | 变更负责人 | 事务内资格校验通过后 `SET manager_id = $n`（参数绑定） |

**实现方式**：放弃 COALESCE，改用动态 SET（现成先例 = `updateCycle` :174-193）：

```js
const sets = []; const params = [];
if (org_name !== undefined)   { sets.push(`org_name = $${params.length + 1}`);   params.push(org_name); }
if (manager_id !== undefined) { sets.push(`manager_id = $${params.length + 1}`); params.push(manager_id); } // null/数值均直写
// 数值分支且目标 org_type='town_center' 时先走资格校验事务
```

参数一律 `$n` 绑定，不拼字符串。

### 4.3 资格校验事务（数值分支，且 manager_id 非空、目标 org_type='town_center'）

锁序遵循 R1-01 组织写事务族（unit → employee）：

```
BEGIN
  ① SELECT org_type FROM hse_org_unit WHERE id=$1 FOR UPDATE   -- 锁 unit 行，status 校验在此锁内（防 TOCTOU）
  ② org_type !== 'town_center' → 跳过资格校验（department/center/company 不扩展，U03 维持）
  ③ SELECT id, employment_relation FROM employee
      WHERE id=$2 AND is_deleted=false FOR UPDATE
      AND employment_relation = '正式员工'                       -- 精确等值；NULL ≠ '正式员工'，不算合格
  ④ 0 行 → ROLLBACK，返回 409「负责人须为在职正式员工」
  ⑤ UPDATE hse_org_unit SET manager_id=$2 ...（与①③同事务）
COMMIT
```

- FK 只兜底「employee ID 存在」，资格完全由服务层校验（与 D-05 九场景一致）；
- `employment_relation` 精确等值 `'正式员工'`，复用 `formalEmployeeEligibilitySql` 语义（EXISTS + 等值）；**不得用 `IS NOT NULL` 或 IN 宽化**；
- 显式 `null` 清除分支与 `undefined` 保持分支**不走资格校验**；
- 历史不符合新规则的存量负责人：读取/展示侧零改动（兼容展示）；仅新写入/变更时强制。

---

## 五、D-07 与 D-01：保留声明

1. **D-07**（组织停用端点）：R1-01 的锁内状态校验（status 校验入 unit 行锁）、停用前归属核对、并发时序六场景、23505→EMP_OPERATION_DUPLICATE、双 client jest 并发测试设计**全部保留**，本轮零修改。本轮新证据仅一处补充：`runDailyCheck/runGridCheck` 对周期状态的无过滤消费（E9）属 D-08 范畴，与 D-07 无冲突。
2. **D-01/TEST-U-119**：保留 R1-04 结论——cleaning_team 实态 51 active + 1 软删（id=78，is_deleted=t，引用面全 0），无需动作；生产仍须 U05 独立核验 TEST-* 存在性与 is_deleted 状态。本轮未发现与 R1 冲突的新证据。

---

## 六、D-01～D-09 依赖更新（累计定局）

| 批次 | 状态 | 前置依赖 | R2 变化 |
|---|---|---|---|
| D-01 | 定稿 | — | 无变化 |
| D-02 | **设计定稿（R2）** | D-01；Q-C 阻断返聘场景 | 事务边界九问 + A/B/C 场景定稿（§三）；V2 补员工行锁与段锁；writeSegment 收编四路径全部关段/建段 SQL |
| D-03 | 定稿 | D-02 | 无变化（23505→EMP_OPERATION_DUPLICATE 已并入 §3.2-8） |
| D-04 | 定稿 | D-01 | 无变化 |
| D-05 | 定稿 | D-01 | PUT 三种字段语义（§四）为 D-05 负责人资格的接口层落地形态 |
| D-06 | 定稿 | D-02 | 无变化 |
| D-07 | 定稿（R1） | D-02（writeSegment）+ D-06 | 无变化（§五保留声明） |
| **D-08** | **架构再更换（R2）** | D-01 | **方案 2 废除 → 方案 C**（production_perf_cycle 独立周期表；hse_assessment_cycle 零触碰；禁加体系列为硬边界）；Q-B 继续阻断生产绩效指标/口径第二步 |
| D-09 | 定稿 | D-01~D-04 + D-08 | 无变化（旧模型退役最后执行） |

阻断分级不变：Q-A（is_primary 语义）待确认不阻断设计；Q-C 阻断 D-02 返聘场景；Q-B 阻断 D-08 第二步（生产绩效指标模板/乡镇汇总口径）；U05 阻断全部生产 DDL。

---

## 七、分类清单

- **事实（本轮实码实证）**：§2.1 E1-E14、§3.1 四路径表、§4.1 COALESCE 矛盾。
- **业务规则（已确认，引用维持）**：约束 1-6（§2.6 对照表）；正式员工=精确等值；终态人不得经调岗复活；Q-A/Q-B/Q-C 待确认项。
- **技术建议（本轮定稿）**：§2.2-2.4 方案 C 架构、§3.2-3.4 writeSegment 事务边界、§4.2-4.3 PUT 动态 SET 与资格事务。
- **待业务确认**：Q-A（is_primary 语义）；Q-B（班组指标模板/乡镇汇总口径）；Q-C（返聘作业归属来源）；U03（资格校验不扩展到非 town_center）；U06（体系 A/B 对象边界）。
- **生产待核验（U05 清单不变）**：存量多段 / departments 复数表 / hse_employee_org 触发器 / 51 班组对拍 / org_type 分布 / TEST-* 记录 / V2 生产导入路径版本一致性。

## 八、测试设计、回滚与生产授权边界

- **测试**：writeSegment 单测（A/B/C 三场景 × 四入口 ≥12 例 + 传 pool 抛 SEGMENT_CLIENT_INVALID + rowCount≠1 防御分支）；并发双 client 测试（R1-01 六场景沿用，新增「V2 批次中 C 场景行失败不中断批次」1 组）；PUT 三语义集成测试（undefined/null/数值 + 非 town_center 数值分支跳过资格校验 + 资格失败零写入）；D-08 无代码改动无需新测。
- **回滚**：D-08 方案 C = DROP production_perf_* 新表即完全回滚（零历史影响）；D-02 = 统一服务为代码层重构，回滚=还原调用方（无数据变更）；PUT = 接口层改动，无数据回滚需求。
- **生产授权边界**：本轮设计含**零生产 DDL**；全部 production_perf_* 建表与 HSE 侧任何迁移均须 U05 生产核验 + M0 冻结 + 生产变更授权三重前置后另行申请。

## 九、总体路线图

```
OVERALL-00～06      [已完成]
B-1-P0              [已完成]
B-1-P1-01～03       [已完成]
B-1-P1-04-01        [已完成]
B-1-P1-04-02A/R1    [已完成]
B-1-P1-04-02B/R1    [已完成]
B-1-P1-04-02C       [完成]
B-1-P1-04-02C-R1    [完成]
B-1-P1-04-02C-R2    [本轮：D-08 方案 C 定稿 / D-02 事务边界定稿 / PUT 三语义定稿]
M0                  [未冻结（前置：04-02 链验收 + U05 生产核验 + Q-A/Q-B/Q-C 业务确认）]
M1/M2               [未授权]
生产数据库变更       [未授权]
B-1-P2～P4 / C3～C6 [未开始]
Z H5                [继续冻结]
```

## 十、零变更证明与交付纪律

- 本轮零业务代码、零 SQL/迁移、零配置改动；无 dev/生产数据库连接（全部证据来自仓库源码静态读取）。
- 工作区核验（提交前实测）：分支 feat/b02-dec-03.13-a02d-status-code；HEAD=1e5f5e0；`server/routes/cost.js` staged `A`、MD5 `e88ae2b0b275346dfc1431408aa00bff` 不变。
- 唯一 Git 写操作：本报告文件 pathspec 独立提交。
