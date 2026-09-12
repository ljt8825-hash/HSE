# TRAE-Step16 生产包最终就绪确认（交付 DBA 前清理 + 全链路彩排）

> **性质**: dev 侧文档/SQL 一致性清理 + 全链路 dev 彩排（非生产执行）
> **对应**: Step 15 验收通过后，交付 DBA 前的最后收口
> **铁律**: DEV ONLY（严禁连生产）；不代签；不引入新逻辑；不改动 status 映射 / 索引 DDL / 硬拦截 / ±2% 校验

---

## 一、背景

验证者（吴八哥）已独立核对 Step 15 修订：生产包 `04_B2_Assignment_Migration.sql` L169-170、Runbook L147-148 / L262-263 / L383-384 的 `ON CONFLICT` 语法与 `description→remark` 改动**全部正确**，status 映射 / 硬校验 / 索引 DDL 未被触碰。P0/P1 已实质闭环。

但核验中发现 **1 处 P2 残留**：生产包实际创建的 B-2 备份表名是 `employee_assignment_b2_backup_20260728`（L24-26 + 注册 `B2_EA_20260728`），而 Runbook §3.2 B-2-1(L258) 与 B-2-5(L419) 仍引用 `employee_assignment_b2_backup_prod`。DBA 执行生产包后真实存在的表是 `_20260728`，若照 Runbook 做 B-2 回滚会"表不存在"。本步交付前必须对齐。

## 二、目标

1. **全仓扫描残留（清零）**：
   - 生产包 + Runbook 中不得再出现 `ON CONFLICT ON CONSTRAINT`（旧语法）
   - Runbook 中不得再出现 `migration_backup_registry (..., description)`（旧字段名）
2. **修复回滚表名不一致（P2）**：
   - 将 Runbook §3.2 B-2-1(L258-260) 与 B-2-5(L419) 引用的 `employee_assignment_b2_backup_prod` 改为 `employee_assignment_b2_backup_20260728`，与生产包实际创建的表名对齐。
   - 同步将 B-2-1 注册 `B2_EA_PROD` 改为 `B2_EA_20260728`（与生产包 L28-30 的注册键一致）。
3. **全链路 dev 彩排（单一 pre-DBA 就绪证据）**：连 dev 库，按 Runbook 顺序跑：
   - B-0（含 B-0-1.5 备份登记用 `remark` 列）→ 确认无"字段不存在"
   - B-2（**执行真实生产包文件** `04_B2_Assignment_Migration.sql`）→ 确认 `insert_count=1304, anomaly=0, 偏差 0.00%`
   - 迁移后基线校验（§4）→ PASS
   - E2E（新建培训记录填 `id_card`、新建三违填 `violator_id_card`）→ 确认 `employee_id`/`violator_id` 被正确填充
4. **版本标注**: 保持 `v1.2-fix`，在修订记录表 §⑪ 追加一行"pre-DBA 就绪确认（Step 16）"；或升 `v1.3-ready`（二选一，说明理由）。

## 三、执行动作

- 用 Grep 在生产包 + Runbook 全文确认三类残留均已清零（保留清零证据截图/输出）。
- 改 Runbook 回滚表名两处（B-2-1、B-2-5）+ 注册键一处（B-2-1）。
- 连 dev 库跑全链路（可复用 Step 14/15 的 `_rehearsal_*.sql` / `_rehearsal_e2e_test.cjs`，不必重写），记录关键输出。
- E2E 若三违 API 仍因 dev admin 缺 `hse:site-mgmt:violations` 权限返回 403，属已知 dev 限制（非本步引入），注明即可；`resolveViolatorId` 核心逻辑已在前序步骤验证。

## 四、验收点（验证者逐条核对）

- [ ] 生产包 Grep `ON CONFLICT ON CONSTRAINT` → 0 命中
- [ ] Runbook Grep `migration_backup_registry (..., description)` → 0 命中
- [ ] Runbook B-2-1 / B-2-5 回滚表名 = `employee_assignment_b2_backup_20260728`；注册键 = `B2_EA_20260728`
- [ ] dev 全链路彩排 B-2 `insert_count=1304, anomaly=0, 偏差 0.00%` PASS
- [ ] E2E FK 填充正常（培训 `employee_id` / 三违 `violator_id` 由身份证号关联）
- [ ] 签字栏留空（禁代签）
- [ ] 产出 `docs/TRAE-Step16-生产包最终就绪确认.md`

## 五、产出

`docs/TRAE-Step16-生产包最终就绪确认.md`，含：残留清零证据、回滚表名修订 diff、全链路彩排输出、验收点核对表、证据索引。

> **交付后**: 此文档即"pre-DBA 就绪"凭证。验证者做最终放行判定 → 生产包 v1.2-fix + Runbook v1.2-fix 正式交付 DBA 执行 + 签字。**本步是 TRAE 在 dev 侧的最后一环；之后不再生成 TRAE 执行提示词。**
