# P4-1 — 只读保护双机制决策与 SQL 自检修复建议

> 文档类型：执行前专项技术分析 + 决策建议（仅输出建议，不修改任何源文件、不执行任何 SQL）
> 生成日期：2026-07-29
> 关联任务链：P0-1 → … → P3-3（治理阶段关闭）→ P4-1（执行前技术决策）
> 红线遵守：未修改任何 SQL / Runbook / 已有文档；未执行任何 SQL；未代签任何角色；所有结论引用源文档具体位置。

---

## 执行摘要

P3-3 执行前最终检查（§五 一致性观察，L167 / L169）发现两个需在进入生产执行前解决的技术问题：

1. **只读保护「双机制」表述并存**：`hse_employee_org_ReadOnly_Change.sql` 采用 **3 个 BEFORE TRIGGER**（SQL L68/74/80），而 Runbook-Final §十「旧模型冻结方案」（L1162）采用 **REVOKE INSERT/UPDATE/DELETE FROM hse_app_user**。两者均实现只读，但机制不同（触发器层 vs 权限层），执行时须明确选择或互补，避免重复/遗漏/冲突。
2. **SQL 自检 `WHERE id=0` 误通过陷阱**：SQL Step 3.3（L153）/ 3.4（L165）用 `WHERE id=0` 验证阻断。若生产库无 `id=0` 行，UPDATE/DELETE 影响 0 行 → BEFORE ROW 触发器不触发 → 落入外层 `EXCEPTION` 误报「被正确阻止」（P1-4 §五 L72 已警告，TRAE-Step9 §2.4 L136 在开发环境实测中踩中并改用真实 ID=1 解决）。

> **一句话推荐**：采用 **互补方案 C**（触发器为主防御 + REVOKE 为权限兜底），执行顺序为「先触发器 SQL（含修复后自检）→ 验证（真实行 ID）→ 再 REVOKE → 验证应用层权限拒绝」；SQL 自检将 Step 3.3 / 3.4 的 `WHERE id=0` 临时替换为「先取真实行 ID 再验证」（方案 A），但不修改源文件，由 DBA 现场执行修复片段。

---

## 一、双机制分析（REVOKE vs BEFORE TRIGGER）

### 1.1 机制原理对比

**方案 A — REVOKE（Runbook §十）**
来源：`Runbook-Final.md` §10.2（L1159-1170），核心语句：
```sql
-- L1162
REVOKE INSERT, UPDATE, DELETE ON hse_employee_org FROM hse_app_user;
-- L1163
GRANT SELECT ON hse_employee_org TO hse_app_user;
```
- 作用层级：PostgreSQL **权限系统**（catalog 级）
- 覆盖范围：仅 `hse_app_user` 这一数据库角色
- 绕过方式：拥有该表写权限的**其他角色**（如 superuser、手动 GRANT 的 DBA 角色）仍可写入
- 可逆性：`GRANT INSERT, UPDATE, DELETE ...` 单命令即可恢复（Runbook §11.2 Phase 3，L1210-1214）
- 附带动作：写入 `employee_assignment_migration_log`（L1165-1169，`FREEZE_20260728_0400` 标记）

**方案 B — BEFORE TRIGGER（只读保护 SQL）**
来源：`hse_employee_org_ReadOnly_Change.sql` Step 1（L53-85），核心为：
```sql
-- L54-60 保护函数
CREATE OR REPLACE FUNCTION fn_hse_employee_org_read_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'hse_employee_org 已冻结为只读表（Sprint-C Step 4）。禁止 % 操作。...', TG_OP;
END; $$ LANGUAGE plpgsql;
-- L68/74/80 三个 BEFORE 触发器
CREATE TRIGGER trg_hse_employee_org_block_insert  BEFORE INSERT  ON hse_employee_org FOR EACH ROW EXECUTE FUNCTION fn_hse_employee_org_read_only();
CREATE TRIGGER trg_hse_employee_org_block_update  BEFORE UPDATE  ON hse_employee_org FOR EACH ROW EXECUTE FUNCTION fn_hse_employee_org_read_only();
CREATE TRIGGER trg_hse_employee_org_block_delete  BEFORE DELETE  ON hse_employee_org FOR EACH ROW EXECUTE FUNCTION fn_hse_employee_org_read_only();
```
- 作用层级：数据库**行级触发器**（表数据操作层）
- 覆盖范围：**所有角色**（含 superuser，除非显式 `ALTER TABLE ... DISABLE TRIGGER` 或 `DROP TRIGGER`）
- 绕过方式：仅能经 `DISABLE TRIGGER` / `DROP TRIGGER`（有显式审计痕迹）
- 可逆性：`DROP TRIGGER × 3 + DROP FUNCTION`（SQL L180-183 回滚段）
- 附带动作：自定义错误消息含 `TG_OP`，可明确提示走新模型 `employee_assignment`

> 开发环境验证结论（TRAE-Step9 §2.3 / §2.5，L105-147）：3 个触发器均成功创建（`tgenabled='O'` 启用），INSERT/UPDATE/DELETE 全部被阻断，SELECT 正常，1285 条记录未受影响。P1-4 §3（L98-102）与 §1.2（L53）确认语法正确、与代码 Grep「0 写入旧表」互为印证。

### 1.2 优劣势矩阵（9 维度逐项对比）

| 维度 | REVOKE 方案（Runbook §十） | BEFORE TRIGGER 方案（只读 SQL） | 推荐倾向 |
|------|----------------------------|--------------------------------|----------|
| 防御深度 | 权限层（仅应用用户 hse_app_user） | 行级（覆盖所有角色含 superuser） | **触发器** |
| 绕过难度 | 低（superuser/其他 GRANT 角色可直接写） | 中（需 DISABLE/DROP TRIGGER，留痕） | **触发器** |
| 可审计性 | 依赖 PG 权限日志 | 自定义错误消息含操作类型，语义清晰 | **触发器** |
| 对现有功能影响 | 应用立即报 `permission denied` | 应用收到自定义中文错误消息（更友好） | **触发器** |
| 回滚复杂度 | `GRANT` 单命令 | `DROP TRIGGER × 3 + DROP FUNCTION` | REVOKE |
| 与 Runbook 一致性 | 完全一致（§十 即其定义） | 不一致（Runbook 未含触发器步骤） | REVOKE |
| 与 P1-4 / P3-2 / TRAE-Step9 一致性 | 不一致（三者均引用触发器） | 完全一致 | **触发器** |
| 执行复杂度 | 1 条核心 SQL | 约 200 行 SQL（含验证+回滚） | REVOKE |
| 误通过风险 | 无（权限拒绝即拒绝，不依赖行存在） | 有（`WHERE id=0` 陷阱，见本报告第二章） | REVOKE |

> 矩阵说明：单列「推荐倾向」仅表示该维度下谁更优，**综合推荐见 1.4**（互补方案 C）。

### 1.3 冲突风险分析

**若两者都执行（顺序不当）的风险**：
- 若**先 REVOKE** → 应用写操作在权限层即被拒绝（`permission denied`）→ 触发器**永远不会被触发** → 触发器验证（SQL Step 3.2-3.4）中的 INSERT/UPDATE/DELETE 测试会因「权限不足」失败，而非「触发器拦截」，导致验证结论**不可判定**（无法区分是权限拦的还是触发器拦的）。
- 若**先触发器后 REVOKE**：触发器验证可在「无 REVOKE 干扰」下用真实行 ID 完成（干净验证），随后 REVOKE 作为权限兜底叠加，二者互不冲突。

**互补方案逻辑**（推荐）：
- 触发器 = **主防御**（行级全角色覆盖，含 superuser，最强）
- REVOKE = **权限兜底**（应用层快速失败，权限拒绝优先于触发器异常，双层保险）
- 二者叠加后，任何写入尝试都至少被一层拦截；且触发器已覆盖 superuser，REVOKE 额外覆盖「应用用户被误 GRANT」类场景。

**唯一须注意的副作用**：互补后若需回滚，必须**两步都做**（DROP TRIGGER ×3 + GRANT），否则会出现「触发器已删但权限仍被 REVOKE」导致应用无法写入的残留冻结。Runbook §11.2 Phase 3（L1210-1214）只写了 GRANT 回滚，未含 DROP TRIGGER —— 这是互补方案的**回滚补丁点**（见决策卡「四、回滚准备」与第四章残留风险 R3）。

### 1.4 推荐方案及理由

**推荐：方案 C — 互补（触发器为主 + REVOKE 兜底）**

理由（逐条引用源文档）：
1. **触发器是已验证的交付物**：TRAE-Step9 §2.3-2.5（L105-147）在开发环境实测 3 触发器全部生效、数据 0 影响；P1-4 §1.2（L53）/ §3（L98-102）确认语法正确且与代码 0 写入互为印证；P3-2 §二 T-0 速查卡（L106-110）明确引用触发器方案。触发器是 Sprint-C v1.0 的产物，有完整验证链。
2. **触发器防御深度更高**：覆盖所有角色含 superuser（1.2 矩阵「防御深度/绕过难度」行）；REVOKE 仅覆盖 `hse_app_user`，superuser 仍可绕过。
3. **REVOKE 提供防御纵深（defense-in-depth）**：在权限层再加一道，使应用层写尝试在到达触发器前即快速失败，符合纵深防御安全原则；且 Runbook §十 已将其纳入冻结方案，不采用即浪费既有设计。
4. **冲突可经执行顺序消解**：先触发器并验证 → 再 REVOKE（1.3 已论证），顺序正确则无冲突。
5. **若追求极简**：降级为 **方案 A（仅触发器）** 亦可接受 —— 因触发器已覆盖 superuser，REVOKE 主要价值是「应用层快速失败 + 复用 Runbook 冻结标记」，非必需。但不推荐「仅 REVOKE」（方案 B），因其对 superuser 无防御、且放弃已验证的触发器产物。

> 决策权归 DBA：本报告给出推荐（C），最终勾选以决策卡「一、双机制选择」为准。

---

## 二、SQL 自检 `WHERE id=0` 误通过陷阱分析

### 2.1 误通过逻辑详解（含伪代码）

问题定位：`hse_employee_org_ReadOnly_Change.sql` Step 3.3（L153）、Step 3.4（L165）。

```sql
-- Step 3.3（SQL L153）原片段
DO $$
BEGIN
  BEGIN
    UPDATE hse_employee_org SET updated_at = NOW() WHERE id = 0;   -- 若 id=0 不存在 → 影响 0 行
    RAISE EXCEPTION '[Step 3.3] 错误：UPDATE 未被阻止！';          -- 无异常时执行到此 → 主动抛错
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '[Step 3.3] UPDATE 被正确阻止 ✓ (错误: %)', SQLERRM;  -- 任何异常都被当作"已阻止"
  END;
END $$;
```

**误通过链路（关键）**：
1. `WHERE id = 0` 在生产库（预期 1304 行，主键从 ≥1 起始）几乎必然**无匹配行**；
2. UPDATE/DELETE 影响 **0 行** → PostgreSQL **不会为任何行触发 BEFORE ROW 触发器**；
3. 触发器未触发 → 无 `RAISE EXCEPTION` 来自函数；
4. 执行流落到 `RAISE EXCEPTION '[Step 3.3] 错误：UPDATE 未被阻止！'`（这是**故意的反向断言**）；
5. 该反向断言异常被外层 `EXCEPTION WHEN OTHERS` 捕获 → 打印 `UPDATE 被正确阻止 ✓`；

**结果**：触发器实际上**并未被验证**（根本没有触发），却输出「验证通过」——即「误通过」。这与 P1-4 §五（L72）描述、TRAE-Step9 §2.4（L136）实测完全一致：开发环境初次用 `id=0` 时也未触发，改用**真实 ID=1** 后才正确阻断。

> 注意：这是**测试手法陷阱，非 SQL 逻辑缺陷**——触发器本身正确（P1-4 §五 L72 明确「SQL 本身逻辑正确」），问题仅在「验证脚本用了不存在的行」。但因其会制造虚假绿灯，必须在执行前消除。

### 2.2 修复方案 A — 真实行 ID 验证（推荐）

原理：先取一个真实存在的行 ID，用它执行 UPDATE/DELETE，确保 BEFORE ROW 触发器**确实被触发**，此时「正确阻止 ✓」才是真验证。

```sql
-- Step 3.3 修复后（方案 A，替换 SQL L149-159 内 DO 块）
DO $$
DECLARE
  v_real_id INT;
BEGIN
  -- 取一个真实存在的行 ID（避免使用 id=0 这类不存在的行）
  SELECT id INTO v_real_id FROM hse_employee_org ORDER BY id LIMIT 1;
  IF v_real_id IS NULL THEN
    RAISE EXCEPTION '[Step 3.3] 错误：表为空，无法验证 UPDATE 阻断';
  END IF;

  BEGIN
    UPDATE hse_employee_org SET updated_at = NOW() WHERE id = v_real_id;
    RAISE EXCEPTION '[Step 3.3] 错误：UPDATE 未被阻止！';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '[Step 3.3] UPDATE 被正确阻止 ✓ (真实行 id=% 错误: %)', v_real_id, SQLERRM;
  END;
END $$;
```

```sql
-- Step 3.4 修复后（方案 A，替换 SQL L161-171 内 DO 块）
DO $$
DECLARE
  v_real_id INT;
BEGIN
  SELECT id INTO v_real_id FROM hse_employee_org ORDER BY id LIMIT 1;
  IF v_real_id IS NULL THEN
    RAISE EXCEPTION '[Step 3.4] 错误：表为空，无法验证 DELETE 阻断';
  END IF;

  BEGIN
    DELETE FROM hse_employee_org WHERE id = v_real_id;
    RAISE EXCEPTION '[Step 3.4] 错误：DELETE 未被阻止！';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '[Step 3.4] DELETE 被正确阻止 ✓ (真实行 id=% 错误: %)', v_real_id, SQLERRM;
  END;
END $$;
```

> 安全性：验证后该行数据**未被真正修改/删除**（触发器已 RAISE 中止事务内该语句），表记录数不变（TRAE-Step9 §2.4 L136 实测：1285 条记录未受影响）。

### 2.3 修复方案 B — 存在性校验

原理：先判断 `id=0` 是否存在，不存在则显式告警「无法验证」，而非误报通过。

```sql
-- Step 3.3 修复后（方案 B，替换 SQL L149-159 内 DO 块）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hse_employee_org WHERE id = 0) THEN
    RAISE NOTICE '⚠️ id=0 不存在，无法验证触发器。请手动用真实行 ID 验证。';
  ELSE
    BEGIN
      UPDATE hse_employee_org SET updated_at = NOW() WHERE id = 0;
      RAISE EXCEPTION '[Step 3.3] 错误：UPDATE 未被阻止！';
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '[Step 3.3] UPDATE 被正确阻止 ✓ (错误: %)', SQLERRM;
    END;
  END IF;
END $$;
```
（Step 3.4 同理，将 UPDATE 替换为 DELETE。）

### 2.4 推荐方案及理由

**推荐方案 A（真实行 ID 验证）**：
- 方案 A **主动制造真实触发**，使「正确阻止 ✓」是**真实验证结论**，而非「跳过验证」；
- 方案 B 仅在 `id=0` 不存在时**告警并跳过**，并未真正证明阻断生效（仍可能漏验），且保留 `id=0` 写法本身有歧义；
- 与 TRAE-Step9 §2.4（L133-134，开发环境即改用 `id=1` 真实 ID 验证）工程实践一致；
- 与 P1-4 §五（L72）/ P3-3 §五（L169）/ P3-2 §二（L109）的「必须用真实存在行 ID 验证」口径一致。

### 2.5 修复后 SQL 片段（仅建议，不写入源文件）

> ⚠️ **红线**：以下片段仅供 DBA 在**生产现场执行时**临时替换 Step 3.3 / 3.4 的 `DO $$` 块使用，**不修改** `hse_employee_org_ReadOnly_Change.sql` 源文件（遵守本任务禁止事项）。

**Step 3.3 替换内容（方案 A）**：
```sql
-- 3.3 验证 UPDATE 被阻止（应失败）— 修复版：使用真实行 ID
DO $$
DECLARE
  v_real_id INT;
BEGIN
  SELECT id INTO v_real_id FROM hse_employee_org ORDER BY id LIMIT 1;
  IF v_real_id IS NULL THEN
    RAISE EXCEPTION '[Step 3.3] 错误：表为空，无法验证 UPDATE 阻断';
  END IF;
  BEGIN
    UPDATE hse_employee_org SET updated_at = NOW() WHERE id = v_real_id;
    RAISE EXCEPTION '[Step 3.3] 错误：UPDATE 未被阻止！';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '[Step 3.3] UPDATE 被正确阻止 ✓ (真实行 id=% 错误: %)', v_real_id, SQLERRM;
  END;
END $$;
```

**Step 3.4 替换内容（方案 A）**：
```sql
-- 3.4 验证 DELETE 被阻止（应失败）— 修复版：使用真实行 ID
DO $$
DECLARE
  v_real_id INT;
BEGIN
  SELECT id INTO v_real_id FROM hse_employee_org ORDER BY id LIMIT 1;
  IF v_real_id IS NULL THEN
    RAISE EXCEPTION '[Step 3.4] 错误：表为空，无法验证 DELETE 阻断';
  END IF;
  BEGIN
    DELETE FROM hse_employee_org WHERE id = v_real_id;
    RAISE EXCEPTION '[Step 3.4] 错误：DELETE 未被阻止！';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '[Step 3.4] DELETE 被正确阻止 ✓ (真实行 id=% 错误: %)', v_real_id, SQLERRM;
  END;
END $$;
```

> 注：Step 3.2（INSERT 验证，SQL L137-147）使用 `VALUES (0, '测试', true)` 插入**新行**，该行不存在故 INSERT 触发器必然触发，无 `id=0` 陷阱，保持原样即可。

---

## 三、只读保护执行决策卡（DBA 逐项勾选确认）

> 🔒 **禁止代签**：以下勾选与签认须由 DBA **本人**在生产维护窗口现场完成。任何 AI 治理代理 / 开发 / 项目负责人均不代签。

### 一、双机制选择
- ☐ 方案 A：仅触发器（3 个 BEFORE TRIGGER）
- ☐ 方案 B：仅 REVOKE（Runbook §十 L1162）
- ☑ 方案 C：互补（触发器 + REVOKE 兜底）— **本报告推荐**
- 推荐理由（摘要）：触发器为已验证产物且覆盖 superuser；REVOKE 提供权限层纵深防御；顺序正确则无冲突（见 1.4）。
- DBA 最终选择：______（若改选 A/B，请于下方备注理由）

### 二、执行顺序（方案 C 互补路径）
- ☐ Step 1：执行触发器 SQL（`hse_employee_org_ReadOnly_Change.sql` 全文，含 2.5 修复后 Step 3.3/3.4）
- ☐ Step 2：验证触发器（用**真实行 ID**，确认 INSERT/UPDATE/DELETE 均被阻断，SELECT 正常）
- ☐ Step 3：执行 REVOKE 兜底（Runbook §十 L1162-1163：`REVOKE INSERT,UPDATE,DELETE ... FROM hse_app_user` + `GRANT SELECT`）
- ☐ Step 4：验证应用层权限拒绝（以 hse_app_user 身份尝试写入，预期 `permission denied`）

> 若选方案 A（仅触发器）：跳过 Step 3 / Step 4。
> 若选方案 B（仅 REVOKE）：跳过 Step 1 / Step 2 的触发器验证，直接执行 REVOKE 并验证权限拒绝；但**须另行确认 superuser 写入管控措施**。

### 三、SQL 自检修复确认
- ☐ 已确认 `WHERE id=0` 误通过陷阱（P1-4 §五 L72 / P3-3 §五 L169）
- ☐ 已采用修复方案 A（真实行 ID，见 2.5 片段）
- ☐ 已准备好真实行 ID 用于验证（执行 `SELECT id FROM hse_employee_org ORDER BY id LIMIT 1;` 取得）
- ☐ Step 3.2 INSERT 验证保持原样（无陷阱）

### 四、回滚准备（互补方案须两步都备）
- ☐ 触发器回滚：`DROP TRIGGER × 3`（block_insert/update/delete）+ `DROP FUNCTION fn_hse_employee_org_read_only()`（SQL L180-183）
- ☐ REVOKE 回滚：`GRANT INSERT, UPDATE, DELETE ON hse_employee_org TO hse_app_user;`（Runbook §11.2 L1211）
- ☐ ⚠️ 互补方案回滚**必须两步都执行**，否则残留冻结（详见第四章 R3）

### 五、DBA 签认区（🔒 禁止代签）
| 角色 | 姓名 | 签字 | 日期 | 确认方案 |
|------|------|------|------|----------|
| DBA | | | | □ A / □ B / □ C |
| 后端开发负责人 | | | | 协同确认 |
| 运维负责人 | | | | 协同确认 |

---

## 四、残留风险提示

- **R1（双机制源文档不一致）**：Runbook-Final §十 含 REVOKE 步骤、不含触发器；只读 SQL 含触发器、不含 REVOKE。两者由不同团队产出，文档层面未对齐。本次以「决策卡」统一，但 Runbook 未同步修订（本任务禁止修改 Runbook，遵守红线）。建议执行后由专人提交 Runbook 修订，将触发器步骤纳入 §十 或注明「与只读 SQL 互补」。
- **R2（执行顺序误用风险）**：若 DBA 误将 REVOKE 置于触发器验证之前，触发器验证将「不可判定」（1.3）。决策卡已强制 Step 顺序，但现场仍须严格遵循。
- **R3（互补回滚残留冻结）**：Runbook §11.2 Phase 3（L1210-1214）回滚仅含 `GRANT`，未含 `DROP TRIGGER`。若采用互补方案 C，回滚时若只执行 GRANT 而遗忘 DROP TRIGGER，表将处于「权限恢复但触发器仍拦截」的残留冻结态，应用无法写入。决策卡「四、回滚准备」已要求两步都备，属已知缺口，执行后须修订 Runbook 回滚段。
- **R4（触发器对 superuser 的拦截副作用）**：互补方案中触发器覆盖 superuser，意味着 DBA 自身的写操作也会被拦截（除非 `DISABLE TRIGGER`）。运维/DBA 的合法维护写入需先 `ALTER TABLE ... DISABLE TRIGGER` 或临时 DROP，维护后重建——属操作注意点，非缺陷。
- **R5（Step 3.2 INSERT 验证的新行残留）**：Step 3.2 用 `VALUES (0,'测试',true)` 插入，若触发器未生效（应先发生，属异常），会留下测试行。当前顺序下触发器必拦截，无残留；但修复片段仅覆盖 3.3/3.4，3.2 保持原样，逻辑自洽。

---

## 五、建议（下一步行动）

1. **DBA 在 T-0 维护窗口前**：阅读本报告，于「决策卡」勾选方案 C 并完成签认（🔒 禁止代签）。
2. **DBA 现场执行顺序**：严格按决策卡「二」——先触发器 SQL（用 2.5 修复片段替换 3.3/3.4）→ 真实行 ID 验证 → REVOKE → 权限拒绝验证。
3. **回滚预案**：将「DROP TRIGGER ×3 + DROP FUNCTION」与「GRANT」两步并列写入执行 checklist，避免 R3 残留冻结。
4. **文档闭环（执行后，非本任务范围）**：建议专人提交 Runbook §十 修订（纳入触发器步骤）与 §11.2 回滚修订（补 DROP TRIGGER），消除 R1/R3 源文档不一致。
5. **不阻塞生产放行**：本报告两项问题均为「执行手法 / 文档对齐」层面，已提供可执行修复，不引入新阻断项；生产放行仍受 P3-2 / P3-3 所述 4 项门控（签字、联系人、生产未实测、维护窗口）约束，须由人工与 DBA 闭环。

---

> 文档结束。本文件为分析与建议性质，不修改任何源 SQL / Runbook / 已有文档，不执行任何 SQL，不代签任何角色。
