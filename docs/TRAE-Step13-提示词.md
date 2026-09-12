# TRAE Step 13 提示词：修订《生产放行执行门控 Runbook》的 2 处缺陷

> 复制整段给 TRAE 执行。**仅修订文档，不碰代码/数据/迁移 SQL 正文，不代签。**

---

# 任务：修订 docs/TRAE-Step12-生产放行执行门控Runbook.md 的 2 处生产安全隐患

## 背景（验证者审核结论）
- status 映射本身**正确**（内联 B-2-4 与已验证生产包 `04_B2_Assignment_Migration.sql` L140-151 完全一致：NULL→active 显式、leave/resigned/retired/dismissed→inactive、无 ELSE）。**无需改映射。**
- 但 Runbook 有两处会影响生产安全的缺陷，修订后即可交付 DBA。

## 缺陷 1（重要）：B-2 迁移 SQL 与已验证生产包不一致 + 执行指向模糊
- **现状**：Runbook §3.2 B-2-4 内联了一段"简化重写"的迁移 SQL，与已验证正确的生产包不一致：
  1. 内联版用 `migration_id='B2_PROD_'`，生产包用 `'B2_20260728'`；
  2. 内联版**删掉了生产包的异常日志 `b2_anomaly_log`（生产包 L178-201）与行数范围硬校验**（生产包 L208-215：偏差 >2% 直接 `RAISE EXCEPTION` 中止）；
  3. Runbook 没明确告诉 DBA「执行生产包文件」，只给了内联 SQL，DBA 可能跑弱化版。
- **修订动作**：
  1. 在 §3.2 顶部加醒目说明框：「**⚠️ DBA 必须执行已验证生产包文件 `docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql`，不要手动执行本 Runbook 内联 SQL；本内联 SQL 仅作逻辑说明。** 该包已含脏数据检查、status 预检查、8 分支无 ELSE 映射、异常日志 `b2_anomaly_log`、行数范围硬校验（偏差 >2% 直接中止）。」
  2. 内联 SQL 上方标注「参考摘录，以生产包为准」；若坚持用内联版，须补齐 `b2_anomaly_log` 异常捕获与 `IF insert_count 超基线 2% 则 RAISE EXCEPTION` 的硬校验，且 `migration_id` 改为 `'B2_20260728'`。
  3. §4 动态基线校验的 `migration_id` 说明里提示：执行生产包时基线键为 `'B2_20260728'`，须与生产包一致（不要混用 `B2_PROD_`）。
  4. 同理检查 §3.1 B-0 是否也应改为「执行生产包 B-0 文件」的指向；若 B-0 也内联，保持内联但确保备份表/回滚一致（见缺陷 2）。

## 缺陷 2（回滚缺口）：B-0 全量回滚引用了不存在的备份表
- **现状**：Runbook §3.1 B-0-5「全量回滚」SQL 引用 `employee_b0_backup_20260728`，但 Runbook 全程从未创建该表（只建了临时表 `temp_b0_recover_ids`）。会话断开需全量回滚时，备份表不存在 → 回滚失败。
- **修订动作**：在 §3.1 B-0-1（恢复前快照）之后新增一步「B-0-1.5 创建全量备份表」：
  ```sql
  DROP TABLE IF EXISTS employee_b0_backup_20260728;
  CREATE TABLE employee_b0_backup_20260728 AS
  SELECT * FROM employee
  WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids);
  ```
  （或：明确说明 B-0 执行依赖生产包中创建该备份表的步骤，Runbook 不重复创建——二选一，须明确、不可留空引用。）
  并在 B-0-5 回滚策略表中注明该备份表来源。

## 验收（验证者逐条核对）
- [ ] §3.2 已明确「执行生产包文件，内联 SQL 仅供参考」
- [ ] 内联 SQL 标注参考性质，且说明补齐 anomaly/范围校验 + migration_id 一致性的要求
- [ ] §4 baseline 的 migration_id 与生产包对齐说明
- [ ] B-0 全量回滚引用的 `employee_b0_backup_20260728` 已被创建或明确来源
- [ ] 未改动任何迁移 SQL 正文、未代签

## 产出
- 修订后的 `docs/TRAE-Step12-生产放行执行门控Runbook.md`（在原文件上改，保留版本号 v1.1）
