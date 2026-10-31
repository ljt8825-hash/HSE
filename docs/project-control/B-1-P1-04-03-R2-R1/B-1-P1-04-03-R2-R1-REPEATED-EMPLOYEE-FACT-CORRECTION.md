# B-1-P1-04-03-R2-R1｜V1/V2 重复员工场景事实勘误报告

> 节点类型：只读源码核验 + 报告定向勘误（事实表述修正）
> 前置节点：B-1-P1-04-03-R1-R1-R2（V1/V2 任职导入并发保护事实修正）
> 本节点不实施任何业务代码、数据库或配置变更；不重新审计人员底座、不重新设计任职架构。
> **本报告只修正事实表述，不代表业务代码验收，不代表 M0 正式冻结，不代表 M1/M2 授权。**

---

## 1. 任务背景

R2（B-1-P1-04-03-R1-R1-R2）已补齐 V1 导入并发保护事实，但助手独立对照实际源码后发现两处事实口径不准确：

1. **R2 对 V1 重复员工记录的最终结果描述错误**：原报告称「同 employee_code 多行会链式新建段 → 产生两条 `is_current=true` 的当前任职段」。这与实际 SQL 执行顺序不符——V1 在插入新段前先 `UPDATE ... SET is_current=false WHERE employee_id=$1 AND is_current=true`，后续重复行会**关闭前一行刚建立的段**再插段，净结果是一条当前段，而非必然两条。
2. **R2 六路径事实表的 `employment_relation 复核` 列未限定「锁定后复核」**：易把 V1/V2 的普通 `SELECT` 读关系 + 终态判断，误记为「锁后复核」。

本轮仅纠正这两处事实口径，避免 M1 实施时产生错误判断。

---

## 2. 仓库、分支、核验 HEAD

| 项 | 值 |
|---|---|
| 仓库 | `ljt8825-hash/HSE` |
| 分支 | `feat/b02-dec-03.13-a02d-status-code` |
| 基底 HEAD（执行前） | `d7898ccc8bd79a0a384fc98ffac50b6b04c4b6da` |
| 基底 HEAD 远端一致性 | `git ls-remote` = `d7898cc…`（已核验 0/0） |
| cost.js 保护态 | `A`（staged）+ MD5 `e88ae2b0b275346dfc1431408aa00bff`（未触碰） |
| 工作区既有无关修改 | 存在大量其他会话遗留修改（docs/191副、grid-mobile-cloudflare、server/*、安全看板vben/* 等）；**均不纳入本节点 pathspec** |

> 所有行号以**当前分支真实源码**为准，未沿用历史报告。

---

## 3. R2 原报告存在的两处问题

- **问题一（结果描述错误）**：R2 §4.1 称 V1 重复 employee_code「第 1 行关旧段+插新段（新段 `is_current=true`），第 2 行再次关『刚刚插入的段』+ 再插一段 → **产生两条 `is_current=true` 的当前任职段**」。该结论把「连续关段建段」错误等同于「最终多条当前段」。
- **问题二（口径混淆）**：R2 §5 六路径事实表中列名为 `employment_relation 复核`，未区分「普通 SELECT 读取并判断」与「`FOR UPDATE` 锁定后复核」。V1/V2 仅有前者，被混同于 assign/rehire/terminate 的后者。

---

## 4. V1 重复员工记录实际 SQL 执行顺序

依据 `server/services/employeeImportService.js`：

- 事务边界：`:523` `BEGIN` 位于 `for (const item of validRows)` **循环内部**，逐行独立事务；`:744` `COMMIT`、`:747` `ROLLBACK`。**每行提交后对其他行可见**。
- 员工查询（无锁）：`:538` `SELECT id, name, employee_code, employment_relation FROM employee WHERE employee_code = $1 AND is_deleted = false`（普通 SELECT，无 `FOR UPDATE`）。
- 关段（仅 when `existingEmployee`）：`:702-713`
  ```sql
  UPDATE employee_assignment
      SET is_current = false, end_date = ..., updated_at = NOW()
    WHERE employee_id = $1
      AND is_current = true
      AND is_deleted = false
  ```
  ⇒ 关闭该员工**所有** `is_current=true` 段（不限主岗）。
- 插段：`:721-727`
  ```sql
  INSERT INTO employee_assignment (... status, is_current, is_primary, ...)
  VALUES (... 'active', true, true, ...)   -- is_current=true, is_primary=true
  ```

**重复 employee_code 的实际执行顺序**（同一批次两行同 code）：

1. 第 1 行：`:538` 查不到（员工尚不存在）→ `:618-628` 新建 employee → `:720-727` 插新段（`is_current=true`）。`:744` 提交。
2. 第 2 行：`:538` 此时员工已存在（第 1 行已提交）→ 进入 `if (existingEmployee)` 分支 → `:702-713` 关闭**当前段**（即第 1 行刚建的段，因其 `is_current=true`）→ `:720-727` 再插新段。`:744` 提交。

⇒ 净结果：**该员工仅余 1 条 `is_current=true` 段**（第 2 行所建）。第 1 行的段已被 `is_current=false` 标记。

若员工在导入前已有当前段，结论同样为净 1 条（重复行依次关旧建新）。

---

## 5. V2 重复员工记录实际 SQL 执行顺序

依据 `server/services/employeeImportV2Service.js`：

- 事务边界：`:927` 单 `BEGIN`；`:933` 逐行 `SAVEPOINT`；`:1071` `RELEASE`；`:1075` `ROLLBACK TO SAVEPOINT`。同一事务内逐行处理 `pendingResult.rows`。
- 员工匹配（无锁）：`:939-956` 三处 `SELECT ... employment_relation`（按 employee_no / id_card_hash / phone_hash+name），均**无 `FOR UPDATE`**。
- 关段：`:1030-1035`
  ```sql
  UPDATE employee_assignment
   SET is_primary = false, is_current = false, end_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
   WHERE employee_id = $1 AND is_current = true AND is_primary = true AND is_deleted = false
  ```
  ⇒ **仅关闭当前主岗段**（`is_primary=true AND is_current=true`）。
- 插段：`:1057-1062`，`is_primary=true, is_current=true`。

**重复 employee_id 的实际执行顺序**（同一批次两行同 id，同事务）：

1. 第 1 行：匹配/创建 employee → `:1030-1035` 关闭当前主岗段（0 或 1 条）→ `:1057-1062` 插新主岗段（`is_primary=true, is_current=true`）。`:1071` 释放保存点。
2. 第 2 行：同事务内可见第 1 行结果 → 再次 `:1030-1035` 关闭当前主岗段（即第 1 行刚建段）→ `:1057-1062` 再插新主岗段。`:1071` 释放保存点。

⇒ 净结果：**该员工仅余 1 条 `is_current=true AND is_primary=true` 主岗段**。第 1 行的段已被标记非当前。

（注：若员工在导入前存在**非主岗**的当前段，该段不被 `:1030-1035` 触及，属既有数据条件，非重复导入本身造成，不在本勘误讨论的「重复场景」结论内。）

---

## 6. 修正后的重复员工场景结论

**V1 / V2 共同的正确结论**：

- 两者均**缺少批次级员工去重**（无 `seenEmployeeIds` 之类集合）；
- 同一员工可能在**同一批次被连续处理**；
- 后续重复行会**关闭前一行刚建立的当前段**（V1 关全部当前段、V2 关当前主岗段）再插入新段；
- 这会造成**任职历史不必要的重复变更**（多产生一条历史段记录）；
- 结果**受导入行顺序影响**（先到行建的段被后到行关闭）；
- **不得把「连续关段建段」描述成「必然产生多条当前段」**——在正常顺序执行下，净当前段数为 1。

**真实保留的问题（M1 须解决）**：

- 没有批次级 `employeeId` 去重；
- 同一员工可能在同一批次被连续处理；
- 可能产生不必要的任职历史变化；
- 缺少明确的重复员工冲突处理规则（如「同批次同员工仅取末行」或显式拒绝）。

---

## 7. 修正后的锁后 employment_relation 复核口径

将 R2 六路径事实表列名由 `employment_relation 复核` 改为 **`FOR UPDATE 锁定后的 employment_relation 复核`**，按实际代码填写：

| 路径 | FOR UPDATE 锁定后的 employment_relation 复核 | 实际代码依据 |
|---|---|---|
| assignEmployee | ✅ 有 | `:455-458` 员工 `FOR UPDATE`；`:463-467` 锁后重读并 `checkRelationAllowsAssignment` 复核 |
| rehireEmployee | ✅ 有 | `:668-672` 员工 `FOR UPDATE`；`:678-686` 锁后读关系并判定仅「退休」可返聘 |
| terminateEmployee | ✅ 有（锁后关系读取/校验） | `:1092-1095` 员工 `FOR UPDATE`；`:1105-1132` 锁后读 `employment_relation` 并多重闸门校验 |
| V1 导入 | ❌ 没有 | `:538` 普通 SELECT 读关系 + `:549` 终态判断；**无 `FOR UPDATE`、无锁后复核** |
| V2 导入 | ❌ 没有 | `:939-956` 普通 SELECT 读关系 + `:964` 终态判断；**无 `FOR UPDATE`、无锁后复核** |
| deleteEmployee | ❌ 没有 | `:620-623` 仅 `UPDATE` 软删员工（隐式锁被改行，非 `FOR UPDATE`），**全程无关系读取/校验** |

> 强制区分：**「读取并判断 `employment_relation`」≠「锁后复核」**。V1/V2 仅有前者（用于终态闸门），不具备员工级并发保护的「`FOR UPDATE` 显式锁 + 锁后重读复核」。

---

## 8. M1 六路径范围保持不变的说明

M1（人员任职写入路径统一）实施与验收范围**仍为六条路径**，本次勘误不缩小、不调整：

1. `assignEmployee` — 已具锁+锁后复核，保持+回归；
2. `rehireEmployee` — 已具锁+锁后复核，保持+回归；
3. `terminateEmployee` — 已具锁+锁后复核+关段 rowCount 强校验，保持+回归；
4. `V1 导入` — 缺口：员工行 `FOR UPDATE` ❌、锁后关系复核 ❌、批次去重 ❌ → 纳入 M1；
5. `V2 导入` — 缺口：员工行 `FOR UPDATE` ❌、锁后关系复核 ❌、批次去重 ❌ → 纳入 M1；
6. `deleteEmployee` — 缺口：关段无 rowCount 检查、无关系复核、隐式锁非显式 `FOR UPDATE` → 纳入 M1。

**本次勘误不改变上述 M1 范围**，也**不把 M1 实施要求提前变成 M0 冻结条件**。M0 仍为「设计决策冻结」，M1 实施项归 M1 内部验收。

---

## 9. 与 R2 原报告的差异

| 项 | R2 原报告 | 本 R2-R1 勘误 |
|---|---|---|
| V1 重复员工最终结果 | 「产生两条 `is_current=true` 当前段」 | **净 1 条当前段**（后续行关闭前一行刚建段再插段）；缺批次去重/顺序依赖/历史冗余为真实问题 |
| V2 重复员工最终结果 | 表内未明确「多条」，但同源于「链式新建段」表述 | 明确：仅关 `is_primary=true` 当前主岗段，净 1 条当前主岗段；不必然多条 |
| 六路径表列名 | `employment_relation 复核` | 改为 **`FOR UPDATE 锁定后的 employment_relation 复核`**；V1/V2 明确标 ❌（无锁后复核） |
| M1 范围 | 六路径 | 保持六路径不变，不缩小、不前置为 M0 条件 |

原 R2 报告及更早的 R1-R1 / R1 / 04-03 报告**均不覆盖、不删除、不改写**；本节点为独立新增报告。

---

## 10. 零代码、零 SQL、零数据库操作证明

- **业务代码零修改**：本节点仅新增报告文档 `docs/project-control/B-1-P1-04-03-R2-R1/`；`server/` 下任何 `.js` 均无改动（现有工作区修改来自其他会话，未纳入 pathspec）。
- **SQL/migration 零修改**：未新增或修改任何 `.sql` 或迁移脚本；仅**读取**既有源码中的 SQL 文本以核实执行顺序（读取不构成修改）。
- **数据库零连接**：无任何 `pool.query`/psql/SQL 执行，未连接 dev 或生产库；源码证据通过**静态读取文件**获得。
- **配置/环境变量零修改**：未触碰 `.env`、配置或 `server/routes/cost.js`。
- **cost.js 保护态**：`A`（staged）+ MD5 `e88ae2b0b275346dfc1431408aa00bff`（两次核验未变，未取消暂存、未覆盖、未提交）。

---

## 11. Git 提交和远端核验信息

- 基底 HEAD：`d7898ccc8bd79a0a384fc98ffac50b6b04c4b6da`；新 HEAD（已推送核验）：`689d7c9439572e22d0ae1a314aa8aed7966e0967`。
- 提交策略：仅 `git add docs/project-control/B-1-P1-04-03-R2-R1/` 后单独提交，不与业务代码混合。
- 推送分支：`feat/b02-dec-03.13-a02d-status-code`（禁止 `--force`、rebase、merge）。
- 远端核验：`git ls-remote origin` 比对 SHA；确认无业务代码/SQL/migration/配置文件混入 diff。
- 历史保留：原 R2 报告及全部历史提交均保留。

> 本节点不授权 M0/M1/M2，不启动后续业务代码实施。推送后立即停止，等待助手通过 GitHub 独立读取报告、实际代码与提交 diff 进行审查。
