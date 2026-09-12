# Sprint-B v2.1 修订差异分析报告

> **版本**: v1.0
> **审计日期**: 2026-07-28
> **审计范围**: Runbook v2 + 检查清单 v2
> **审计目标**: 识别生产执行风险,为 v2.1 修订提供依据

---

## 一、执行摘要

### 1.1 审计结论

| 维度 | 状态 | 风险等级 |
|------|------|---------|
| SQL 执行可靠性 | ⚠️ 存在问题 | 🔴 P0 |
| 回滚能力完整性 | ❌ 不完整 | 🔴 P0 |
| 数据一致性门禁 | ⚠️ 固定硬编码 | 🟡 P1 |
| 文档一致性 | ✅ 基本一致 | 🟢 P2 |
| 生产就绪度 | ❌ 未达标 | 🔴 阻断 |

### 1.2 核心阻断问题

| # | 问题 | 影响 | 优先级 |
|---|------|------|--------|
| B1 | B-0 回滚依赖临时表会话保持,无持久化备份 | 会话断开无法回滚 | 🔴 P0 |
| B2 | B-2 UPSERT 覆盖记录无法恢复 | 数据丢失风险 | 🔴 P0 |
| B3 | GET DIAGNOSTICS 变量未声明 | SQL 执行失败 | 🔴 P0 |
| B4 | 数据量硬编码 1304,未动态校验 | 校验失效 | 🟡 P1 |
| B5 | 缺少数据库锁/活跃连接检查 | 迁移冲突 | 🟡 P1 |

---

## 二、SQL 执行可靠性审计

### 2.1 问题清单

#### ❌ P0-1: GET DIAGNOSTICS 变量未声明

**位置**: Runbook v2 第四章 4.6 Step B-0-3

**问题代码**:
```sql
BEGIN;
UPDATE employee
SET is_deleted = false,
    updated_at = NOW()
WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids)
  AND is_deleted = true;

GET DIAGNOSTICS rec_count = ROW_COUNT;
COMMIT;
```

**风险分析**:
- PostgreSQL `GET DIAGNOSTICS` 需要先声明变量: `DECLARE rec_count INTEGER;`
- 当前代码直接使用 `rec_count`,会在执行时抛出 `syntax error`
- 同样问题出现在第四章 4.8 回滚脚本、第七章 7.7 迁移脚本、第七章 7.10 回滚脚本

**影响范围**:
- B-0 Step 3 执行失败
- B-0 回滚失败
- B-2 Step 2 执行失败
- B-2 回滚失败

**修复方案**:
```sql
-- 方案 A: 使用 DO 块封装(推荐,无需提前声明)
DO $$
DECLARE
    rec_count INTEGER;
BEGIN
    UPDATE employee
    SET is_deleted = false,
        updated_at = NOW()
    WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids)
      AND is_deleted = true;

    GET DIAGNOSTICS rec_count = ROW_COUNT;

    RAISE NOTICE '恢复记录数: %', rec_count;

    -- 自动校验(可选)
    IF rec_count NOT BETWEEN 1285 AND 1310 THEN
        RAISE EXCEPTION '恢复行数异常: %,预期范围 [1285, 1310]', rec_count;
    END IF;
END $$;
```

**修订优先级**: 🔴 P0 必须修复

---

#### ❌ P0-2: ON CONFLICT 子句语法错误

**位置**: Runbook v2 第七章 7.7 Step 2

**问题代码**:
```sql
ON CONFLICT (employee_id)
WHERE is_primary = true AND is_current = true AND is_deleted = false
DO UPDATE SET ...
```

**风险分析**:
- `ON CONFLICT` 子句语法错误
- PostgreSQL 14 正确语法: `ON CONFLICT ON CONSTRAINT constraint_name` 或 `ON CONFLICT (column_name)`
- 当前写法试图在 `ON CONFLICT` 后直接加 `WHERE` 子句,语法不合法
- 正确的唯一索引约束名: `uk_emp_assign_primary`

**影响范围**:
- B-2 Step 2 迁移执行失败
- 无法完成数据迁移

**修复方案**:
```sql
-- 修正后
INSERT INTO employee_assignment (...)
SELECT ...
FROM hse_employee_relation her
WHERE her.is_deleted = false
  AND her.is_current = true
ON CONFLICT ON CONSTRAINT uk_emp_assign_primary
DO UPDATE SET
    org_unit_id = EXCLUDED.org_unit_id,
    ...
```

**修订优先级**: 🔴 P0 必须修复

---

#### ⚠️ P1-1: TEMP TABLE 跨步骤依赖风险

**位置**: Runbook v2 第四章 4.5/4.8/4.9

**问题场景**:
- B-0 Step 2 创建 `temp_b0_recover_ids`
- B-0 Step 3 执行恢复
- B-0 Step 4 验证
- B-0 Step 5 回滚(依赖临时表)

**风险分析**:
- PostgreSQL TEMP TABLE 生命周期: 当前会话
- 若 B-0 Step 3 执行后会话意外断开(网络超时、工具崩溃、手动关闭):
  - Step 4 验证失败(临时表不存在)
  - Step 5 回滚失败(无法定位恢复范围)
- 需要从备份全量恢复 employee 表,风险高

**修复方案**:
```sql
-- 方案 A: 将临时表改为持久化备份表
CREATE TABLE IF NOT EXISTS temp_b0_recover_ids_backup (
    employee_id BIGINT PRIMARY KEY,
    recovered_at TIMESTAMP DEFAULT NOW(),
    migration_id VARCHAR(64) DEFAULT 'B0_' || to_char(NOW(), 'YYYYMMDD_HH24MI')
);

-- Step 2 填充后立即备份
INSERT INTO temp_b0_recover_ids_backup
SELECT * FROM temp_b0_recover_ids;

-- 后续回滚可从备份表读取
```

**修订优先级**: 🟡 P1 建议修复

---

#### ⚠️ P1-2: B-2 备份表生命周期不明确

**位置**: Runbook v2 第七章 7.6 Step 1

**问题代码**:
```sql
DROP TABLE IF EXISTS employee_assignment_b2_backup;
CREATE TABLE employee_assignment_b2_backup AS
SELECT * FROM employee_assignment;
```

**风险分析**:
- 备份表为持久表,但生命周期未明确说明
- 若多次执行 B-2,每次都会 DROP 旧备份,覆盖历史备份
- 缺少备份表命名规范(应含时间戳或 migration_id)

**修复方案**:
```sql
-- 增加 migration_id 后缀
CREATE TABLE employee_assignment_b2_backup_20260728_0300 AS
SELECT * FROM employee_assignment;

-- 或使用配置表管理备份
CREATE TABLE IF NOT EXISTS migration_backup_registry (
    backup_id VARCHAR(64) PRIMARY KEY,
    backup_table VARCHAR(128),
    created_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

INSERT INTO migration_backup_registry VALUES
('B2_20260728_0300', 'employee_assignment_b2_backup_20260728_0300', NOW(), true);
```

**修订优先级**: 🟡 P1 建议修复

---

### 2.2 SQL 执行注意事项总结

| 问题类型 | 位置 | 风险等级 | 修复方案 |
|---------|------|---------|---------|
| GET DIAGNOSTICS 变量未声明 | B-0/B-2 多处 | 🔴 P0 | 改用 DO 块封装 |
| ON CONFLICT 语法错误 | B-2 Step 2 | 🔴 P0 | 使用 ON CONSTRAINT 子句 |
| TEMP TABLE 会话依赖 | B-0 全流程 | 🟡 P1 | 增加持久化备份 |
| 备份表生命周期管理 | B-2 Step 1 | 🟡 P1 | 增加 migration_id 命名 |

---

## 三、回滚能力审计

### 3.1 B-0 回滚模型缺陷

#### ❌ 当前方案(不完整)

```sql
-- 仅能回滚新增的软删除恢复
UPDATE employee
SET is_deleted = true
WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids)
  AND is_deleted = false;
```

**缺陷分析**:
- ✅ 可回滚恢复的软删除记录
- ❌ 无法处理会话断开场景
- ❌ 无法恢复被覆盖的 updated_at 字段
- ❌ 缺少回滚验证步骤

#### ✅ 完整回滚方案(v2.1 需新增)

```sql
-- ============================================================
-- B-0 完整回滚方案(v2.1 新增)
-- ============================================================

-- Phase 1: 从备份表读取恢复范围(若临时表丢失)
CREATE TABLE IF NOT EXISTS temp_b0_recover_ids_backup (
    employee_id BIGINT PRIMARY KEY,
    recovered_at TIMESTAMP,
    migration_id VARCHAR(64)
);

-- Phase 2: 精准回滚软删除标记
BEGIN;

UPDATE employee
SET is_deleted = true,
    updated_at = NOW()
WHERE id IN (
    SELECT employee_id FROM temp_b0_recover_ids
    UNION ALL
    SELECT employee_id FROM temp_b0_recover_ids_backup
    WHERE migration_id = 'B0_20260728_0215'
)
AND is_deleted = false;

GET DIAGNOSTICS rollback_count = ROW_COUNT;

COMMIT;

-- Phase 3: 验证回滚结果
SELECT
    (SELECT COUNT(*) FROM temp_b0_recover_ids) AS expected_count,
    rollback_count AS actual_count,
    CASE WHEN rollback_count >= (SELECT COUNT(*) FROM temp_b0_recover_ids) * 0.99
         THEN 'PASS'
         ELSE 'FAIL'
    END AS status;
```

---

### 3.2 B-2 回滚模型缺陷

#### ❌ 当前方案(不完整)

**方式 1: 删除迁移标记记录**
```sql
DELETE FROM employee_assignment
WHERE created_by = 'system_migration_b2';
```

**方式 2: 从备份恢复**
```sql
DROP TABLE IF EXISTS employee_assignment;
CREATE TABLE employee_assignment AS
SELECT * FROM employee_assignment_b2_backup;
```

**缺陷分析**:
- ✅ 方式 1 可删除新增记录
- ❌ 方式 1 无法恢复被 UPSERT 覆盖的原有记录
- ✅ 方式 2 可恢复全部数据
- ❌ 方式 2 会丢失迁移后业务系统新增的记录

#### ✅ 完整回滚方案(v2.1 需新增)

```sql
-- ============================================================
-- B-2 完整回滚方案(v2.1 新增)
-- ============================================================

-- 分类回滚策略

-- 策略 1: 仅回滚新增记录(created_by='system_migration_b2')
-- 适用场景: 迁移前 employee_assignment 为空
BEGIN;

DELETE FROM employee_assignment
WHERE created_by = 'system_migration_b2';

GET DIAGNOSTICS deleted_count = ROW_COUNT;

COMMIT;

-- 策略 2: 恢复 UPSERT 覆盖记录
-- 适用场景: 迁移前 employee_assignment 已有数据
-- 前提: 已执行 B-2 Step 1 备份

BEGIN;

-- 2.1 删除本次迁移新增记录
DELETE FROM employee_assignment
WHERE created_by = 'system_migration_b2';

-- 2.2 恢复被覆盖的记录(从备份表)
INSERT INTO employee_assignment
SELECT *
FROM employee_assignment_b2_backup backup
WHERE EXISTS (
    SELECT 1 FROM employee_assignment ea
    WHERE ea.id = backup.id
    AND ea.created_by = 'system_migration_b2'
)
ON CONFLICT (id) DO UPDATE SET
    org_unit_id = EXCLUDED.org_unit_id,
    operation_unit_id = EXCLUDED.operation_unit_id,
    position_id = EXCLUDED.position_id,
    status = EXCLUDED.status,
    updated_at = NOW();

GET DIAGNOSTICS recovered_count = ROW_COUNT;

COMMIT;

-- 策略 3: 全量恢复(最后手段)
-- 适用场景: 策略 1/2 失败,或数据严重错乱
BEGIN;

TRUNCATE employee_assignment;

INSERT INTO employee_assignment
SELECT * FROM employee_assignment_b2_backup;

GET DIAGNOSTICS restored_count = ROW_COUNT;

COMMIT;
```

---

### 3.3 回滚能力矩阵

| 场景 | v2 当前方案 | v2.1 增强方案 | 风险等级 |
|------|-----------|-------------|---------|
| B-0 会话断开 | ❌ 无法回滚 | ✅ 持久化备份 | 🔴 P0 |
| B-0 回滚验证 | ❌ 缺失 | ✅ 增加验证步骤 | 🟡 P1 |
| B-2 新增记录回滚 | ✅ 支持 | ✅ 保持 | 🟢 P2 |
| B-2 UPSERT 覆盖恢复 | ❌ 不支持 | ✅ 从备份恢复 | 🔴 P0 |
| B-2 全量恢复 | ⚠️ 有风险 | ✅ 增强验证 | 🟡 P1 |

---

## 四、数据一致性门禁审计

### 4.1 硬编码数据量问题

#### ⚠️ 问题位置

**Runbook v2 多处出现硬编码**:
- 第四章 4.4: "预期结果: recoverable_count ≈ 1304"
- 第四章 4.5: "预期: recover_id_count ≈ 1304"
- 第四章 4.6: "最小预期: 1285, 最大预期: 1310"
- 第四章 4.7: "验证通过: active_employees 应比恢复前增加 ≈1304"
- 第七章 7.2: "迁移记录数: ≈ 1304"
- 第八章 8.1: "预期: total ≈ 1304"

**检查清单 v2 多处硬编码**:
- 第三章 S3: 缺少动态基线说明
- 第三章 B0-3: "≈1304"
- 第六章 B2-2: "≈1304"

#### ✅ 修复方案: 动态基准原则

**Runbook v2.1 需增加章节: "数据量动态校验规则"**

```markdown
## X. 数据量动态校验规则

### 校验原则
1. 所有迁移前后数据量校验必须以 Step 0 实际统计结果为准
2. 禁止使用固定硬编码数值作为校验阈值
3. 校验规则必须在 Step 0 阶段生成并记录到迁移日志表

### 动态基线生成

```sql
-- Step 0 结束时生成基线记录
INSERT INTO migration_baseline (
    migration_id,
    metric_name,
    metric_value,
    recorded_at
) VALUES
('B0_20260728_0215', 'employee_active_before', (SELECT COUNT(*) FROM employee WHERE is_deleted=false), NOW()),
('B0_20260728_0215', 'recoverable_count', (SELECT COUNT(*) FROM temp_b0_recover_ids), NOW()),
('B2_20260728_0310', 'her_current_count', (SELECT COUNT(*) FROM hse_employee_relation WHERE is_current=true AND is_deleted=false), NOW()),
('B2_20260728_0310', 'ea_before_count', (SELECT COUNT(*) FROM employee_assignment), NOW());
```

### 校验规则

```sql
-- B-0 校验规则(使用动态基线)
SELECT
    baseline.metric_value AS expected_active,
    (SELECT COUNT(*) FROM employee WHERE is_deleted=false) AS actual_active,
    CASE
        WHEN actual_active >= expected_active + (SELECT metric_value FROM migration_baseline WHERE migration_id='B0_20260728_0215' AND metric_name='recoverable_count') * 0.98
        THEN 'PASS'
        ELSE 'FAIL'
    END AS status
FROM migration_baseline baseline
WHERE baseline.migration_id = 'B0_20260728_0215'
  AND baseline.metric_name = 'employee_active_before';
```
```

---

### 4.2 数据一致性门禁清单

| # | 门禁项 | v2 状态 | v2.1 要求 |
|---|--------|---------|----------|
| D1 | B-0 恢复数量动态校验 | ❌ 硬编码 1304 | ✅ 使用 Step 0 基线 |
| D2 | B-2 迁移数量动态校验 | ❌ 硬编码 1304 | ✅ 使用 Step 0 基线 |
| D3 | 关联完整性校验 | ✅ 已有 | ✅ 保持 |
| D4 | 唯一性冲突检测 | ✅ 已有 | ✅ 保持 |
| D5 | UPSERT 覆盖范围量化 | ⚠️ 仅提及 | ✅ 增加强制对比 |

---

## 五、文档一致性审计

### 5.1 Runbook vs 检查清单一致性

| # | 检查项 | Runbook v2 | 检查清单 v2 | 一致性 |
|---|--------|-----------|-----------|--------|
| 1 | Step 0 检查项数量 | 7 项(Check 0.1-0.7) | 10 项(S1-S10) | ⚠️ 不一致 |
| 2 | B-0 检查项数量 | 9 项(V1-V9) | 14 项(B0-1-B0-14) | ⚠️ 不一致 |
| 3 | B-2 检查项数量 | 10 项(C1-C10) | 13 项(B2-1-B2-13) | ⚠️ 不一致 |
| 4 | 回滚脚本位置 | 第十一章 | 附录 A.3 | ⚠️ 位置不同 |
| 5 | 数据量硬编码 | 多处 ≈1304 | 多处 ≈1304 | ✅ 一致(需统一修改) |

### 5.2 修复建议

- 统一检查项编号规则
- Runbook 作为主文档,检查清单完全对应
- 增加交叉引用索引

---

## 六、生产执行风险总结

### 6.1 风险矩阵

| 风险 ID | 风险描述 | 概率 | 影响 | 风险等级 | 缓解措施 |
|---------|---------|------|------|---------|---------|
| R1 | GET DIAGNOSTICS 语法错误导致 SQL 执行失败 | 高 | 严重 | 🔴 P0 | 改用 DO 块封装 |
| R2 | ON CONFLICT 语法错误导致 B-2 迁移失败 | 高 | 严重 | 🔴 P0 | 修正为 ON CONSTRAINT |
| R3 | 会话断开导致无法回滚 B-0 | 中 | 严重 | 🔴 P0 | 增加持久化备份表 |
| R4 | UPSERT 覆盖数据无法恢复 | 中 | 严重 | 🔴 P0 | 增加分类回滚方案 |
| R5 | 数据量硬编码导致校验失效 | 中 | 高 | 🟡 P1 | 改为动态基线 |
| R6 | 缺少数据库锁/连接检查 | 中 | 高 | 🟡 P1 | 增加 Step 0 检查 |
| R7 | 备份表管理混乱 | 低 | 中 | 🟢 P2 | 增加 migration_id 命名 |

### 6.2 修订优先级建议

| 优先级 | 修订项 | 必要性 |
|--------|--------|--------|
| 🔴 P0 | GET DIAGNOSTICS 语法修复 | 必须 |
| 🔴 P0 | ON CONFLICT 语法修复 | 必须 |
| 🔴 P0 | B-0 持久化备份方案 | 必须 |
| 🔴 P0 | B-2 UPSERT 覆盖恢复方案 | 必须 |
| 🟡 P1 | 动态基线校验机制 | 强烈建议 |
| 🟡 P1 | 数据库锁/连接检查 | 强烈建议 |
| 🟢 P2 | 备份表命名规范 | 建议 |

---

## 七、v2.1 修订建议清单

### 7.1 Runbook v2.1 必须新增章节

| # | 章节名称 | 位置 | 内容要点 |
|---|---------|------|---------|
| 1 | SQL 执行注意事项 | 第二章后 | DO 块使用、会话保持、事务边界 |
| 2 | 数据量动态校验规则 | 第三章后 | 基线生成、动态校验、禁止硬编码 |
| 3 | B-0 完整回滚方案 | 第四章 4.8 后 | 持久化备份、分类回滚、验证步骤 |
| 4 | B-2 UPSERT 覆盖恢复方案 | 第七章 7.10 后 | 分类回滚策略(新增/覆盖/全量) |
| 5 | 迁移失败决策树 | 第十一章后 | Step0/B0/B2/代码启动失败处理流程 |
| 6 | 生产阻断项清单 | 附录新增 | 必须修复项、责任人、验证方式 |

### 7.2 检查清单 v2.1 必须新增检查项

| # | 检查项 ID | 检查内容 | 对应 Runbook 章节 |
|---|----------|---------|------------------|
| 1 | E8 | 数据库锁检查 | Step 0 |
| 2 | E9 | 活跃连接检查 | Step 0 |
| 3 | E10 | Schema 版本检查 | Step 0 |
| 4 | S11 | uk_emp_assign_primary 唯一索引完整验证 | Step 0 |
| 5 | B0-15 | B-0 持久化备份表已创建 | B-0 |
| 6 | B2-14 | B-2 UPSERT 覆盖范围已记录 | B-2 |
| 7 | B2-15 | B-2 覆盖记录恢复方案已验证 | B-2 |
| 8 | C11 | API 结构兼容验证 | 代码切换 |
| 9 | C12 | 前端旧字段扫描(.team_id 等) | 代码切换 |

---

## 八、结论与建议

### 8.1 生产就绪度评估

| 维度 | 评估结果 |
|------|---------|
| SQL 执行可靠性 | ❌ 不通过(存在 P0 语法错误) |
| 回滚能力完整性 | ❌ 不通过(UPSERT 覆盖无法恢复) |
| 数据一致性门禁 | ⚠️ 部分通过(需改为动态基线) |
| 文档一致性 | ✅ 通过 |
| **综合评估** | **❌ 未达到生产执行标准** |

### 8.2 v2.1 修订必要性结论

**结论: 必须进行 v2.1 修订**

**理由**:
1. 存在 4 项 P0 级 SQL 语法错误,会导致迁移执行失败
2. 回滚方案不完整,存在数据丢失风险
3. 数据量硬编码会导致校验机制失效
4. 缺少生产环境必要的安全检查

### 8.3 下一步行动建议

| # | 行动项 | 负责人 | 截止时间 |
|---|--------|--------|---------|
| 1 | 修复 GET DIAGNOSTICS 语法错误 | 数据迁移负责人 | 立即 |
| 2 | 修复 ON CONFLICT 语法错误 | 数据迁移负责人 | 立即 |
| 3 | 设计 B-0 持久化备份方案 | DBA | 立即 |
| 4 | 设计 B-2 UPSERT 覆盖恢复方案 | 数据迁移负责人 | 立即 |
| 5 | 生成 v2.1 修订版文档 | 技术负责人 | T+1 日 |
| 6 | 执行测试环境 Dry Run | QA | v2.1 完成后 |

---

> **审计报告结束**
>
> 本报告识别了 Runbook v2 和检查清单 v2 的核心问题,为 v2.1 修订提供了明确方向。建议立即启动 v2.1 修订工作,修复所有 P0 级问题后方可进入生产迁移阶段。