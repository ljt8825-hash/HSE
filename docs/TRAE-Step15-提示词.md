# 任务：修订生产包与 Runbook 中 Dev 彩排暴露的 2 处 SQL 缺陷（Step 15）

> **性质**：dev 侧文档/SQL 修订（非生产执行），对应 `docs/TRAE-Step14-生产放行清单Dev彩排.md` 的 §10.2 缺陷表 #1(P0)、#2(P1)。
> **背景**：Step 14 在 dev 真实执行生产包 `04_B2_Assignment_Migration.sql` 时，**B-2 迁移失败**——根因是 `uk_emp_assign_primary` 是 PostgreSQL **部分唯一索引（PARTIAL UNIQUE INDEX）**，不是 CONSTRAINT，而 SQL 用了 `ON CONFLICT ON CONSTRAINT <name>`（该语法仅支持真正的 CONSTRAINT）。此缺陷若带进生产，DBA 执行 B-2 必然失败。
> **为何可改"冻结物"**：先前将生产包/Runbook 列为冻结物，是建立在"已验证正确"的前提下；Step 14 证明生产包含**致命语法缺陷**，冻结前提不成立，必须修订。修订后版本号标注 `v1.2-fix`（生产包文件头 + Runbook 修订记录）。

---

## 一、必须修订的缺陷（精确位置）

### P0 — `ON CONFLICT` 语法（生产必失败）

| 文件 | 行 | 当前（错误） | 改为（正确） |
|------|----|------------|------------|
| `docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql` | **L162** | `ON CONFLICT ON CONSTRAINT uk_emp_assign_primary` | `ON CONFLICT (employee_id) WHERE is_primary = true AND is_current = true AND is_deleted = false` |
| `docs/TRAE-Step12-生产放行执行门控Runbook.md` | **L375**（§3.2 内联 B-2-4） | 同上 `ON CONFLICT ON CONSTRAINT uk_emp_assign_primary` | 同上 `ON CONFLICT (employee_id) WHERE is_primary = true AND is_current = true AND is_deleted = false` |

> ⚠️ 前提：迁移 INSERT 必须为 `employee_assignment` 写入 `is_primary=true, is_current=true, is_deleted=false`（与索引谓词一致），`ON CONFLICT` 才能命中。Step 14 的 dev 修正版 `_rehearsal_b2_fixed.sql` 仅改了这一行即跑通（insert_count=1304, anomaly=0），证明 INSERT 已带这些列，修订安全。

### P1 — `migration_backup_registry` 字段名错误（B-0 备份登记会报错）

| 文件 | 行 | 当前（错误） | 改为（正确） |
|------|----|------------|------------|
| `docs/TRAE-Step12-生产放行执行门控Runbook.md` | **L141**（§3.1 B-0-1.5） | `INSERT INTO migration_backup_registry (backup_id, backup_table, description)` | `INSERT INTO migration_backup_registry (backup_id, backup_table, remark)` |
| `docs/TRAE-Step12-生产放行执行门控Runbook.md` | **L255**（§3.2 B-2-1） | 同上 `..., description)` | 同上 `..., remark)` |

> 依据：Step 14 在 dev 实测 `migration_backup_registry` 真实列名为 `remark`（非 `description`），原 INSERT 会报"字段不存在"。备份表 `employee_b0_backup_20260728` 的创建语句本身不受影响，仅登记行的列名需改。

---

## 二、明确**不**改动的部分（保持已验证正确）

- status 映射 8 分支无 ELSE（L140-151 / Runbook L356-366）——**已验证正确，禁止动**。
- `uk_emp_assign_primary` 索引 DDL（Runbook §2.1 L59-63）——**部分唯一索引定义正确，禁止改**；问题只在引用它的 `ON CONFLICT` 语法，不在索引本身。
- `b2_anomaly_log` 异常日志、±2% 硬校验——保持。
- 回填脚本 `backfillEmployeeId.cjs` 生产硬拦截——保持。

---

## 三、修订后必须做的回归验证（在 dev，复用 Step 14 脚本）

1. **重跑 B-2（用修订后的真实生产包文件，不再是 dev 副本）**：
   ```bash
   psql -h 127.0.0.1 -p 5432 -U hse_app -d safety_dashboard \
     -f docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql
   ```
   期望：不再报 `ON CONFLICT ON CONSTRAINT ... 约束不存在`；最终 `insert_count=1304, baseline=1304, anomaly_count=0`，偏差 0.00%。
2. **重跑 B-0-1.5 备份登记**（确认 `remark` 列不再报错）：执行 Runbook §3.1 B-0-1.5 修订后的 INSERT，期望无"字段不存在"错误。
3. **重跑基线校验 + 端到端**（同 Step 14 §六、§九），确认仍全部 PASS。

---

## 四、产出

`docs/TRAE-Step15-生产包与Runbook缺陷修订.md`，含：
- 每项缺陷的 旧行 / 新行 / 文件:行号 diff 片段
- 修订后版本号标注（生产包文件头注释 + Runbook 修订记录 v1.2-fix）
- 回归验证实际输出（B-2 重跑成功、B-0-1.5 不再报错、基线/E2E 仍 PASS）
- 明确声明：仅改 SQL 语法与列名，未改 status 映射 / 索引定义 / 冻结逻辑，未代签

## 五、验收点（验证者逐条核对）

- [ ] 生产包 L162 与 Runbook L375 的 `ON CONFLICT` 已改为 `(employee_id) WHERE is_primary=true AND is_current=true AND is_deleted=false`
- [ ] Runbook L141、L255 的 `description` 已改为 `remark`
- [ ] status 映射、索引 DDL、硬拦截等"不改动"项未被触碰
- [ ] 修订后重跑生产包文件，B-2 在 dev 真实跑通（insert_count=1304, anomaly=0, 偏差 0.00%）
- [ ] B-0-1.5 备份登记不再报字段错误
- [ ] 版本号已标注 v1.2-fix

> 铁律：仍仅 dev 侧修订 + 验证，不连生产、不代签、不执行生产迁移。修订经我审核通过后，DBA 方可按修订后的 Runbook/生产包执行正式迁移。
