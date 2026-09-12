# TRAE-Step14 提示词：生产放行清单 Dev 彩排（Rehearsal）

> 本文件是给 TRAE 的执行提示词。复制整份给 TRAE 即可。
> 对应主序列文档：`docs/Sprint-A-B-C-TRAE执行提示词序列.md` 的 Step 14。
> 被彩排的对象：`docs/DBA-Step-生产放行确认清单.md`（7 步）+ `docs/TRAE-Step12-生产放行执行门控Runbook.md`（v1.1）。

---

## 一、性质与硬边界（先读，违反即失败）

- **DEV 环境 ONLY**：全程只允许连接 dev / 测试数据库。严禁连接生产库、严禁使用生产连接串、严禁在生产执行任何 SQL。
- **不代签**：本彩排不涉及任何签字；签字栏归 DBA/业务负责人现场人工填，TRAE 不得模拟或代填。
- **不改冻结物**：`04_B2_Assignment_Migration.sql`、`hse_employee_org_ReadOnly_Change.sql`、Runbook v1.1 的内容**保持不变**，你只执行 + 报告，不修改。
- **dev 是沙箱**：允许在 dev 真实执行迁移与回填以验证端到端（这正是彩排目的），但**执行前必须先记录 dev 当前行数基线**（见步骤 0），便于异常时回溯。

## 二、背景（为什么做这步）

Step 1~13 的 dev 侧代码与文档已全部验证通过。DBA 清单（`DBA-Step-生产放行确认清单.md`）是正式生产执行交接物，不归 TRAE 执行。但为避免 DBA 正式执行时踩坑，需要你在 dev 把清单 7 步**完整走一遍**，产出"每步在真实环境能否跑通、输出是什么、哪里会卡"的证据，供 DBA 执行前排雷。

## 三、目标

1. 验证清单 7 步在真实（dev）环境下**每步都可执行**，不只在纸面上。
2. 输出每步的**实际命令 + 实际输出 + PASS/FAIL + 给 DBA 的提醒**。
3. 重点验证**端到端联动是否真通**：跑完 B-2 + 回填后，新建一条带身份证号的三违/培训记录，确认 `violator_id` / `employee_id` 被正确填充。

## 四、输入文件

- `docs/DBA-Step-生产放行确认清单.md`（被彩排的 7 步）
- `docs/TRAE-Step12-生产放行执行门控Runbook.md`（v1.1，详细 SQL）
- `docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql`（B-2 迁移，dev 执行同一文件）
- `docs/Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql`（只读触发器，确认已部署）
- `server/scripts/backfillEmployeeId.cjs`（历史回填脚本，dev 执行）

## 五、执行步骤（严格对应 DBA 清单 7 步）

### 步骤 0：Dev 行数基线快照（先做，必做）
记录 dev 当前：`employee` 行数、`employee_assignment` 行数、`violation_records` 行数、`training_records` 行数、`violation_records` 中 `violator_id IS NULL` 数、`training_records` 中 `employee_id IS NULL` 数。这些数字用于后续对比与回溯。

### 步骤 1：Step 0 Preflight（索引 + 触发器复核）
- 查 dev 是否存在唯一索引 `uk_emp_assign_primary`（`WHERE is_primary AND is_current AND NOT is_deleted`）。存在→PASS；不存在→报告"需按 Runbook §2.1 DDL 创建"，并在 dev 实际执行创建以验证 DDL 正确性。
- 查 dev 是否部署 `hse_employee_org` 只读触发器 3 个（`trg_hse_employee_org_block_insert/update/delete`）。已部署→PASS；未部署→在 dev 执行 `hse_employee_org_ReadOnly_Change.sql` 验证。
- 给 DBA 的提醒：生产 Preflight 任一 FAIL 会阻断迁移，提前确认生产已有这两个对象。

### 步骤 2：B-0 Employee 恢复（dev 演练）
- 按 Runbook B-0-1.5 在 dev 创建全量备份表 `employee_b0_backup_20260728`（取 dev employee 快照）。
- 演练恢复逻辑（仅验证 SQL 可执行，不必真改 dev 业务数据状态；若演练需写回，须明确标注并在步骤 0 基线内可回溯）。
- 报告：备份表行数、恢复语句是否可执行。

### 步骤 3：B-2 迁移（dev 真实执行）
- **执行生产包文件** `04_B2_Assignment_Migration.sql`（与 DBA 同文件，勿手敲内联）。
- 记录执行输出：`employee_assignment` 新增行数、是否触发 `b2_anomaly_log`、是否触发 `±2% RAISE EXCEPTION`。
- 报告：迁移后 `employee_assignment` 行数（对比步骤 0 基线）、有无异常日志、status 映射是否无 ELSE（抽查输出）。

### 步骤 4：迁移后基线校验
- 对比迁移前后 `employee_assignment` 行数偏差，给出百分比。偏差 ≤ 2%→PASS；否则 FAIL 并说明。
- 提醒 DBA：生产同样需偏差 ≤ 2% 方放行。

### 步骤 5：历史回填（dry-run 必做 + 真实 dev 回填可选）
- **必做**：`node scripts/backfillEmployeeId.cjs --dry-run`，记录预估影响行数（violation_records / training_records 各多少条将被回填）。
- **可选（dev 沙箱）**：在 dev 真实执行 `node scripts/backfillEmployeeId.cjs`（无 --dry-run），验证写入路径 `resolveViolatorId` / `resolveEmployeeId` 真能关联。执行后对比步骤 0 基线，确认 NULL 数下降。
- 提醒 DBA：生产回填**必须**先 `--dry-run` 预估 → DBA+业务签字 → 再执行；脚本生产硬拦截（无 --dry-run 直接 exit(1)）已在 Step 11 验证就位。
- **验证硬拦截**：在 dev 用 `NODE_ENV=production node scripts/backfillEmployeeId.cjs`（不带 --dry-run）跑一次，确认脚本 `exit(1)` 中止（证明安全阀生效）。注意此命令不连生产，仅验证 guard 逻辑。

### 步骤 6：巡检启用决策
- 仅报告 `employeeHealthCheckScheduler.js` 的 `HEALTH_CHECK_ENABLED` 当前值与 cron 配置（`0 2 * * *` / `Asia/Shanghai`）。不强制在 dev 启用。
- 给 DBA 提醒：建议生产开启巡检，fail 时告警。

### 步骤 7：端到端验证（最关键）
- 在 dev 通过 API 新建一条**带身份证号**的三违记录，确认落库后 `violator_id` 被正确填充（非 NULL）。
- 在 dev 通过 API 新建一条**带身份证号**的培训记录，确认 `employee_id` 被正确填充。
- 抽样验证：取一条被回填的历史三违/培训，确认其外键已关联 `employee.id`。
- 报告：新建记录的 FK 填充结果、抽样历史记录关联结果。这才是"花名册导入后与其他板块联动"的真验证。

## 六、铁律（再次强调）

- DEV ONLY，绝不碰生产。
- 不修改迁移 SQL / 触发器 SQL / Runbook 内容。
- 不代签任何栏位。
- 所有"真实执行"均在 dev 沙箱，且步骤 0 已留基线便于回溯。

## 七、产出

`docs/TRAE-Step14-生产放行清单Dev彩排.md`，结构如下：
1. 环境与权限声明（明确是 dev，列连接库名）
2. 步骤 0 基线快照表
3. 步骤 1~7 逐条：执行命令 + 实际输出（关键行）+ PASS/FAIL + 给 DBA 的提醒
4. 端到端验证结果（新建记录 FK + 历史回填抽样）
5. 整体结论：清单 7 步在 dev 是否全部可执行、有哪些坑 DBA 需特别注意
6. 证据索引（每条结论对应的命令/文件/行号）

## 八、验收点（验证者吴八哥将逐条核对）

- [ ] 明确声明 dev-only，无任何生产连接迹象
- [ ] 步骤 0 基线快照已记录
- [ ] Preflight：索引 + 触发器实际状态已报告
- [ ] B-2 在 dev 真实执行，输出与行数已记录，status 映射确认无 ELSE
- [ ] 基线校验偏差百分比已给出
- [ ] 回填 `--dry-run` 预估行数已报告
- [ ] 生产硬拦截 `NODE_ENV=production` 无 `--dry-run` → exit(1) 已验证
- [ ] 端到端：新建三违/培训记录的 FK 填充结果已验证
- [ ] 未修改任何冻结 SQL/文档，未代签
- [ ] 产出 md 含证据索引
