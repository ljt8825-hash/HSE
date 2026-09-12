# TRAE Step 12 提示词：起草《生产放行执行门控 Runbook》

> 复制整段给 TRAE 执行。TRAE 只起草文档，**不得执行任何生产语句**。

---

# 任务：起草《生产放行执行门控 Runbook》（Sprint B 迁移 + Sprint D 回填 + 端到端验证）

## 背景
- dev 侧已全部就绪并已验证通过：
  - employee_assignment 为唯一事实来源（Step 1~2）；
  - hse_employee_org 已加只读触发器、巡检定时任务已部署（Step 9）；
  - 后端写入路径已回填外键、前端已打通身份证录入字段、回填脚本已加生产硬拦截（Step 10~11）。
- 生产环境"花名册导入后与其他板块无法交互"的根因（下游 `violator_id` / `employee_id` 全 NULL）尚未在生产消除——
  因为 **Sprint B 生产迁移（B-0/B-2）与历史数据回填都还没在生产库执行，且需签字放行**。
- 本步目标：产出一份 **DBA/运维可逐步照做的生产执行 Runbook**，把所有前置条件、执行顺序、回滚、签字固化下来。

## 执行动作（TRAE 只写文档，**不执行**）
1. **Preflight 索引复核**：明确 `uk_emp_assign_primary` 在生产库的存在性检查 SQL
   （Step 9 已确认 dev 缺失、Runbook-Final §4.7 有"缺失即自动创建"兜底）；
   在 Runbook 的 **Step 0** 写入该检查 SQL，并附"若不存在则用如下 DDL 创建"的语句（引用 Runbook-Final §4.7 Check 0.7）。
2. **只读触发器确认**：写入生产库验证 `trg_hse_employee_org_block` 已生效的 SQL（Step 9 部署的触发器），
   作为迁移前冻结确认项。
3. **Sprint B 迁移执行步骤**：引用已验证正确的执行包
   （`Sprint-B-v2.1-Production-Package`，status 映射为 8 分支无 ELSE 版，Step 2 已确认），
   按 **B-0（employee 恢复）→ B-2（employee_assignment 迁移）** 顺序，写明每步命令、预期影响行数
   （B-0 ~1287、B-2 以生产库实际基线为准）、回滚策略（B-0/B-2 各有 3 种回滚）。
4. **迁移后基线校验**：写入动态基线校验 SQL（`migration_baseline` 表 / 偏差 0% 判定），引用 Runbook-Final 对应章节。
5. **历史数据回填步骤**：写入 `node server/scripts/backfillEmployeeId.cjs --dry-run` 在生产库先预估
   （预期：培训 `unmatched=100`、三违 `noName=673` 不可自动关联）；
   预估无误后，写明"**DBA 签字 → 移除 NODE_ENV 临时执行实际回填**"的门控流程
   （脚本生产硬拦截已在 Step 11 部署，production 无 --dry-run 会 `exit(1)`）。
6. **巡检调度启用决策**：当前 `HEALTH_CHECK_ENABLED=false`（Step 9 为 dev 安全默认）；
   在 Runbook 写明生产是否启用（建议 `true` + cron `0 2 * * *` + `Asia/Shanghai`），由运维决定并标注。
7. **端到端验证**：给出抽样验证方法——取 1 条已回填三违/培训记录，确认下游板块能显示/联动人员；
   并明确 **673/890 条无姓名无身份证的记录"业务补录"为后续流程，不阻塞本次放行**。
8. **签字栏**：含 DBA、后端、前端、业务负责人四栏，留空，禁止代签。

## 输入（TRAE 应引用并核对）
- `docs/Sprint-B-v2.1-Runbook-Final.md`、`docs/Sprint-B-v2.1-Production-Package/`（已验证执行包）
- `docs/TRAE-Step9-只读保护与巡检部署.md`（触发器 + 巡检 + 索引复核结论）
- `docs/TRAE-Step10-下游交互根因修复.md`、`docs/TRAE-Step11-前端打通与脚本加固.md`（dev 就绪声明）
- `server/scripts/backfillEmployeeId.cjs`（生产硬拦截已部署）

## 产出
- `docs/TRAE-Step12-生产放行执行门控Runbook.md`
  章节：①适用范围与前置 ②Step 0 Preflight（索引 + 触发器复核）③Sprint B 迁移执行（B-0/B-2 + 回滚）
  ④迁移后基线校验 ⑤历史回填（dry-run 预估 → 签字 → 执行）⑥巡检启用决策 ⑦端到端验证
  ⑧签字栏（留空）⑨证据索引
- **铁律**：TRAE 不执行任何生产语句、不改迁移 SQL、不代签。

## 验收点（验证者逐条核对）
- [ ] Runbook 自包含、顺序正确、每步有回滚
- [ ] 索引/触发器 Preflight SQL 真实可执行（引用 Step 9 结论）
- [ ] 引用的迁移包为已验证正确版（无 `ELSE 'active'`）
- [ ] 回填明确 dry-run 前置 + DBA 签字门控
- [ ] 673/890 不可关联记录已如实标注为业务补录
- [ ] 签字栏留空、无代签
