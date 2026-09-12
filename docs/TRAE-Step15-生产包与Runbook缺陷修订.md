# TRAE-Step15 生产包与 Runbook 缺陷修订报告

> **性质**: dev 侧文档/SQL 修订（非生产执行），对应 `docs/TRAE-Step14-生产放行清单Dev彩排.md` §10.2 缺陷表 #1(P0)、#2(P1)
> **修订时间**: 2026-07-28
> **修订人**: TRAE
> **修订版本**: v1.2-fix
> **铁律**: 仅 dev 侧修订 + 验证；不连生产；不代签；不执行生产迁移
> **修订范围**: 仅 SQL 语法与列名；**未改** status 映射 / 索引 DDL / 硬拦截 / 冻结逻辑

---

## 一、修订原因

TRAE-Step14 Dev 彩排中，直接执行生产包 `04_B2_Assignment_Migration.sql` **B-2 迁移失败**：

```
错误: 表 "employee_assignment" 的 "uk_emp_assign_primary" 约束不存在
CONTEXT: SQL 语句 "INSERT INTO employee_assignment (...) ... ON CONFLICT ON CONSTRAINT uk_emp_assign_primary
DO UPDATE SET ..." 在SQL语句的第11行的PL/pgSQL函数inline_code_block
```

**根因**: `uk_emp_assign_primary` 是 PostgreSQL **PARTIAL UNIQUE INDEX**（部分唯一索引，带 `WHERE` 子句），**不是 CONSTRAINT**（约束）。PostgreSQL 语法规定：
- `ON CONFLICT ON CONSTRAINT <name>` → 仅适用于真正的 CONSTRAINT
- `ON CONFLICT (<column>) WHERE <condition>` → 适用于 PARTIAL UNIQUE INDEX

同时发现 B-0-1.5 备份登记 SQL 中 `migration_backup_registry` 表字段名 `description` 错误，实际为 `remark`。

**为何可改"冻结物"**: 先前将生产包/Runbook 列为冻结物，是建立在"已验证正确"的前提下；Step 14 证明生产包含**致命语法缺陷**，冻结前提不成立，必须修订。

---

## 二、修订内容（精确 diff）

### 2.1 P0 — `ON CONFLICT` 语法（生产必失败）

#### 文件 1: `docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql` L169-171

**修订前**:
```sql
    FROM hse_employee_relation her
    WHERE her.is_deleted = false
      AND her.is_current = true
    ON CONFLICT ON CONSTRAINT uk_emp_assign_primary
    DO UPDATE SET
```

**修订后**:
```sql
    FROM hse_employee_relation her
    WHERE her.is_deleted = false
      AND her.is_current = true
    -- v1.2-fix: PARTIAL UNIQUE INDEX 必须用 ON CONFLICT (col) WHERE ... 语法
    ON CONFLICT (employee_id) WHERE is_primary = true AND is_current = true AND is_deleted = false
    DO UPDATE SET
```

#### 文件 2: `docs/TRAE-Step12-生产放行执行门控Runbook.md` §3.2 B-2-4 L381-382

**修订前**:
```sql
    FROM hse_employee_relation her
    WHERE her.is_deleted = false AND her.is_current = true
    ON CONFLICT ON CONSTRAINT uk_emp_assign_primary
    DO UPDATE SET
```

**修订后**:
```sql
    FROM hse_employee_relation her
    WHERE her.is_deleted = false AND her.is_current = true
    -- v1.2-fix: PARTIAL UNIQUE INDEX 必须用 ON CONFLICT (col) WHERE ... 语法
    ON CONFLICT (employee_id) WHERE is_primary = true AND is_current = true AND is_deleted = false
    DO UPDATE SET
```

### 2.2 P1 — `migration_backup_registry` 字段名错误

#### 文件: `docs/TRAE-Step12-生产放行执行门控Runbook.md`

**位置 1**: §3.1 B-0-1.5 L147-148

**修订前**:
```sql
INSERT INTO migration_backup_registry (backup_id, backup_table, description)
VALUES ('B0_EMPLOYEE_BACKUP', 'employee_b0_backup_20260728', 'B-0 Employee 全量备份（用于全量回滚）')
ON CONFLICT (backup_id) DO UPDATE SET created_at = NOW();
```

**修订后**:
```sql
-- v1.2-fix: 字段名 description → remark（与实际表结构一致）
INSERT INTO migration_backup_registry (backup_id, backup_table, remark)
VALUES ('B0_EMPLOYEE_BACKUP', 'employee_b0_backup_20260728', 'B-0 Employee 全量备份（用于全量回滚）')
ON CONFLICT (backup_id) DO UPDATE SET created_at = NOW();
```

**位置 2**: §3.2 B-2-1 L262-263

**修订前**:
```sql
INSERT INTO migration_backup_registry (backup_id, backup_table, description)
VALUES ('B2_EA_PROD', 'employee_assignment_b2_backup_prod', 'B-2 employee_assignment 备份')
ON CONFLICT (backup_id) DO UPDATE SET created_at = NOW();
```

**修订后**:
```sql
-- v1.2-fix: 字段名 description → remark（与实际表结构一致）
INSERT INTO migration_backup_registry (backup_id, backup_table, remark)
VALUES ('B2_EA_PROD', 'employee_assignment_b2_backup_prod', 'B-2 employee_assignment 备份')
ON CONFLICT (backup_id) DO UPDATE SET created_at = NOW();
```

---

## 三、版本号标注

### 3.1 生产包文件头

[04_B2_Assignment_Migration.sql](file:///F:/hse-dashboard/docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql) L1-19 新增 `v1.2-fix` 修订记录块:

```
-- Sprint-B v2.1 Production Migration (v1.2-fix)
-- ...
-- v1.2-fix 修订记录 (2026-07-28, TRAE-Step15):
--   L162: ON CONFLICT ON CONSTRAINT uk_emp_assign_primary
--         → ON CONFLICT (employee_id) WHERE is_primary = true AND is_current = true AND is_deleted = false
--   原因: uk_emp_assign_primary 是 PostgreSQL PARTIAL UNIQUE INDEX（非 CONSTRAINT），
--         必须用 ON CONFLICT (col) WHERE ... 语法匹配部分索引谓词。
--   依据: TRAE-Step14 Dev 彩排实测，原语法报"约束不存在"；修订后 dev 重跑 insert_count=1304, anomaly=0。
```

### 3.2 Runbook 修订记录

[TRAE-Step12-生产放行执行门控Runbook.md](file:///F:/hse-dashboard/docs/TRAE-Step12-生产放行执行门控Runbook.md):

- 文档头版本号 L7 由 `v1.1` → `v1.2-fix`，并新增 4 行修订说明
- 文档末尾新增 §⑪ `v1.2-fix 修订记录` 表格，含 3 项修订条目、回归验证结论、未改动项声明

---

## 四、明确**不**改动的部分（保持已验证正确）

| 不改动项 | 位置 | 原因 |
|---------|------|------|
| status 映射 8 分支无 ELSE | 生产包 L148-158 / Runbook L356-366 | 已验证正确，dev 彩排全部映射为 `active` |
| `uk_emp_assign_primary` 索引 DDL | Runbook §2.1 L59-63 | 部分唯一索引定义正确，问题只在引用它的 `ON CONFLICT` 语法 |
| `b2_anomaly_log` 异常日志 | 生产包 L230+ | 异常捕获逻辑已验证 |
| ±2% 硬校验 | 生产包 L235+ | 偏差阈值正确 |
| 回填脚本硬拦截 | `backfillEmployeeId.cjs` L218+ | `NODE_ENV=production` 拦截已验证 |

---

## 五、回归验证实际输出

### 5.1 重跑生产包文件（修订后真实生产包，不再是 dev 副本）— ✅ PASS

**执行命令**:
```bash
psql -h 127.0.0.1 -p 5432 -U hse_app -d safety_dashboard \
  -f docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql
```

**实际输出**:
```
DROP TABLE
SELECT 2609                            -- Step 1 备份成功
UPDATE 1
INSERT 0 2
 original_count | backup_count
----------------+--------------
           2609 |         2609         -- 备份与原表一致

NOTICE:  发现重复当前关系记录数: 0       -- Step 1.5 脏数据检查通过
DO
NOTICE:  status 映射预检查通过           -- Step 1.6 status 预检查通过
DO
NOTICE:  迁移记录数: 1304 (基线: 1304), 异常记录数: 0    -- ✅ B-2 迁移成功
DO
 employee_id | old_status | old_position_id | anomaly_type | detected_at
-------------+------------+-----------------+--------------+-------------
(0 rows)                                -- 无异常记录
```

**关键指标**:
- `insert_count = 1304`
- `baseline_count = 1304`
- `anomaly_count = 0`
- 偏差 = 0.00%（远低于 ±2% 阈值）

### 5.2 重跑 B-0-1.5 备份登记 — ✅ PASS

**执行命令**:
```bash
psql -h 127.0.0.1 -p 5432 -U hse_app -d safety_dashboard \
  -f server/scripts/_rehearsal_step15_b0_verify.sql
```

**实际输出**:
```
INSERT 0 1                              -- B-0-1.5 备份登记成功
INSERT 0 1                              -- B-2-1 备份登记成功

        backup_id        |              backup_table              |                      remark
-------------------------+----------------------------------------+---------------------------------------------------
 B2_EA_PROD              | employee_assignment_b2_backup_prod     | B-2 employee_assignment 备份（v1.2-fix 回归验证）
 B0_EMPLOYEE_BACKUP      | employee_b0_backup_20260728            | B-0 Employee 全量备份
 B2_EA_20260728          | employee_assignment_b2_backup_20260728 | B-2 employee_assignment 备份
 B0_RECOVER_IDS_20260728 | temp_b0_recover_ids_backup_20260728    | B-0 恢复范围备份
(4 rows)
```

**结论**: `description → remark` 修订生效，不再报"字段不存在"错误，登记成功。

### 5.3 基线校验 — ✅ PASS

**执行命令**:
```bash
psql -h 127.0.0.1 -U hse_app -d safety_dashboard -f server/scripts/_rehearsal_step4_validate.sql
```

**实际输出**:
```
=== 4.1 动态基线偏差检查 ===
 baseline_count | actual_count | verdict | deviation_pct
----------------+--------------+---------+---------------
           1304 |         1304 | PASS    |          0.00

=== 4.2 迁移结果汇总 ===
 baseline | actual | b2_records | b2_distinct_employees
----------+--------+------------+-----------------------
     1304 |   1304 |       1304 |                  1304

=== 4.3 异常日志检查 ===
 anomaly_count = 0

=== 4.4 status 分布检查 (无 ELSE 验证) ===
 status | cnt
--------+------
 active | 1304                       -- 全部映射到合法值，无 ELSE 兜底

=== 4.5 当前 employee_assignment 行数 (与基线对比) ===
 ea_total_after | ea_active_after | ea_total_before | ea_active_before
----------------+-----------------+-----------------+------------------
           2609 |            1305 |            2609 |             1305
```

### 5.4 端到端验证（新建培训记录 FK 填充）— ✅ PASS

**执行命令**:
```bash
cd server && node scripts/_rehearsal_e2e_test.cjs
```

**实际输出**:
```
=== 1. Login ===
Login status: 200

=== 4. Create Training (id_card=371421198503151234) ===
Training create status: 200
Training response: {"code":0,"success":true,"message":"创建成功","data":{"id":"901","name":"张三",
"employeeId":"5364","idCard":"371421198503151234",...}}

=== 5. Verify Training FK ===
Training detail: {"code":0,"success":true,...,"data":{"id":"901","employeeId":"5364",...}}

=== E2E Summary ===
Training ID: 901
```

**结论**: 修订后端到端联动仍正常，新建培训记录通过 `id_card=371421198503151234` 自动填充 `employee_id=5364`。

> 三违 API 创建仍因 dev admin 缺少 `hse:site-mgmt:violations` 权限返回 403（与 Step14 相同，非修订引入），但 `resolveViolatorId` 核心逻辑已在 Step14 §九.2 验证 PASS。

---

## 六、验收点核对

| 验收点 | 状态 | 证据 |
|--------|------|------|
| 生产包 L162 与 Runbook L375 的 `ON CONFLICT` 已改为 `(employee_id) WHERE is_primary=true AND is_current=true AND is_deleted=false` | ✅ | §二.1 |
| Runbook L141、L255 的 `description` 已改为 `remark` | ✅ | §二.2 |
| status 映射、索引 DDL、硬拦截等"不改动"项未被触碰 | ✅ | §四 |
| 修订后重跑生产包文件，B-2 在 dev 真实跑通（insert_count=1304, anomaly=0, 偏差 0.00%） | ✅ | §五.1 |
| B-0-1.5 备份登记不再报字段错误 | ✅ | §五.2 |
| 版本号已标注 v1.2-fix | ✅ | §三 |

---

## 七、声明

1. **仅改 SQL 语法与列名**: 本次修订只修改了 `ON CONFLICT` 语法（P0）和 `migration_backup_registry` 字段名（P1），未改 status 映射 8 分支无 ELSE、`uk_emp_assign_primary` 索引 DDL、`b2_anomaly_log` 异常日志、±2% 硬校验、回填脚本硬拦截等已验证正确的逻辑。
2. **未代签**: 所有签字栏保持空白。
3. **未连生产**: 全程仅连 dev 库（`127.0.0.1:5432/safety_dashboard`），未触生产连接串。
4. **未执行生产迁移**: 仅 dev 侧修订 + 回归验证，生产迁移仍需 DBA 按修订后的 Runbook/生产包在维护窗口执行。
5. **修订经审核后放行**: 修订经我审核通过后，DBA 方可按修订后的 Runbook/生产包执行正式迁移。

---

## 八、证据索引

| # | 修订/验证项 | 证据位置 |
|---|------------|---------|
| 1 | 生产包 L169-171 ON CONFLICT 修订 | [04_B2_Assignment_Migration.sql#L169-L171](file:///F:/hse-dashboard/docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql#L169-L171) |
| 2 | 生产包文件头 v1.2-fix 标注 | [04_B2_Assignment_Migration.sql#L1-L19](file:///F:/hse-dashboard/docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql#L1-L19) |
| 3 | Runbook §3.2 B-2-4 L381-382 ON CONFLICT 修订 | [TRAE-Step12-生产放行执行门控Runbook.md#L381-L382](file:///F:/hse-dashboard/docs/TRAE-Step12-生产放行执行门控Runbook.md#L381-L382) |
| 4 | Runbook §3.1 B-0-1.5 L147-148 description→remark | [TRAE-Step12-生产放行执行门控Runbook.md#L147-L148](file:///F:/hse-dashboard/docs/TRAE-Step12-生产放行执行门控Runbook.md#L147-L148) |
| 5 | Runbook §3.2 B-2-1 L262-263 description→remark | [TRAE-Step12-生产放行执行门控Runbook.md#L262-L263](file:///F:/hse-dashboard/docs/TRAE-Step12-生产放行执行门控Runbook.md#L262-L263) |
| 6 | Runbook 文档头 v1.2-fix 标注 | [TRAE-Step12-生产放行执行门控Runbook.md#L7-L13](file:///F:/hse-dashboard/docs/TRAE-Step12-生产放行执行门控Runbook.md#L7-L13) |
| 7 | Runbook §⑪ v1.2-fix 修订记录表 | [TRAE-Step12-生产放行执行门控Runbook.md#L754-L764](file:///F:/hse-dashboard/docs/TRAE-Step12-生产放行执行门控Runbook.md#L754-L764) |
| 8 | 回归验证: 生产包 B-2 重跑成功 | §五.1（本报告） |
| 9 | 回归验证: B-0-1.5 备份登记 SQL | [server/scripts/_rehearsal_step15_b0_verify.sql](file:///F:/hse-dashboard/server/scripts/_rehearsal_step15_b0_verify.sql) |
| 10 | 回归验证: 基线校验 SQL | [server/scripts/_rehearsal_step4_validate.sql](file:///F:/hse-dashboard/server/scripts/_rehearsal_step4_validate.sql) |
| 11 | 回归验证: E2E 测试脚本 | [server/scripts/_rehearsal_e2e_test.cjs](file:///F:/hse-dashboard/server/scripts/_rehearsal_e2e_test.cjs) |
| 12 | status 映射 8 分支无 ELSE（未改动证据） | [04_B2_Assignment_Migration.sql#L148-L158](file:///F:/hse-dashboard/docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql#L148-L158) |
| 13 | TRAE-Step14 Dev 彩排报告（修订依据） | [docs/TRAE-Step14-生产放行清单Dev彩排.md](file:///F:/hse-dashboard/docs/TRAE-Step14-生产放行清单Dev彩排.md) |

---

**修订报告结束。**
