# Sprint-B 数据迁移执行前最终技术审计报告

> **审计日期**：2026-07-28
> **审计范围**：数据库模型、Runbook SQL、后端代码、前端代码、迁移顺序
> **审计约束**：只读分析，不修改业务代码，不执行数据库写操作

---

## 一、数据库模型一致性审计

### 1.1 employee 表实际结构

**来源**：[hse_employee_master_v59_migration.sql](file:///F:/hse-dashboard/server/sql/hse_employee_master_v59_migration.sql#L112-L133) + [hse_employee_master_v60_hardening.sql](file:///F:/hse-dashboard/server/sql/hse_employee_master_v60_hardening.sql#L32-L33)

| 字段 | 类型 | 约束 | Runbook 匹配 |
|------|------|------|-------------|
| id | BIGSERIAL | PRIMARY KEY | ✅ |
| employee_code | VARCHAR(50) | UNIQUE (WHERE is_deleted=false), NULLABLE | ✅ |
| id_card | VARCHAR(128) | ENC: 加密存储 | ✅ |
| id_card_hash | VARCHAR(64) | HMAC-SHA256 哈希（v60 新增） | ✅ |
| name | VARCHAR(100) NOT NULL | | ✅ |
| gender | VARCHAR(10) | | ✅ |
| birth_date | DATE | | ✅ |
| phone | VARCHAR(64) | ENC: 加密存储 | ✅ |
| phone_hash | VARCHAR(64) | HMAC-SHA256 哈希（v60 新增） | ✅ |
| person_category | VARCHAR(20) | | ✅ |
| person_type | VARCHAR(20) | | ✅ |
| is_public_welfare | BOOLEAN DEFAULT FALSE | | ✅ |
| created_at | TIMESTAMP NOT NULL | | ✅ |
| updated_at | TIMESTAMP NOT NULL | | ✅ |
| **updated_by** | **不存在** | — | **❌ 不匹配** |
| is_deleted | BOOLEAN DEFAULT FALSE | | ✅ |

#### 🔴 P0 级问题

**employee 表没有 `updated_by` 字段**。Runbook 中 B-0 恢复和回滚 SQL 均使用了 `updated_by`：

```sql
-- B-0 Step 2 (Runbook L167-171):
UPDATE employee SET is_deleted=false, updated_at=NOW(), updated_by='system_migration_b0' ...

-- B-0 Step 4 rollback (Runbook L262-265):
UPDATE employee SET is_deleted=true, updated_at=NOW(), updated_by='system_migration_b0_rollback' ...
WHERE ... AND updated_by='system_migration_b0' ...
```

**影响**：以上 SQL 执行将直接报错 `column "updated_by" of relation "employee" does not exist`，B-0 步骤完全不可执行。

### 1.2 hse_employee_relation 实际结构

**来源**：[hse_org_center_v68_migration.sql](file:///F:/hse-dashboard/server/sql/hse_org_center_v68_migration.sql#L97-L114)

| 字段 | 类型 | 约束 | Runbook 匹配 |
|------|------|------|-------------|
| id | BIGSERIAL | PRIMARY KEY | ✅ |
| employee_id | BIGINT NOT NULL | | ✅ |
| org_unit_id | BIGINT NOT NULL | | ✅ |
| operation_unit_id | BIGINT | NULLABLE | ✅ |
| position_id | BIGINT | | ✅ |
| supervisor_id | BIGINT | NULLABLE | ✅ |
| is_current | BOOLEAN DEFAULT true | | ✅ |
| status | VARCHAR(20) DEFAULT 'active' | | ✅ |
| start_date | DATE | | ✅ |
| end_date | DATE | NULLABLE | ✅ |
| is_primary | BOOLEAN DEFAULT true | | ✅ |
| remark | VARCHAR(256) | NULLABLE | ✅ |
| created_by | VARCHAR(64) | NULLABLE | ✅ |
| created_at | TIMESTAMP NOT NULL | | ✅ |
| updated_at | TIMESTAMP NOT NULL | | ✅ |
| **updated_by** | **不存在** | — | ⚠️ Runbook B-2 不使用此字段 |
| is_deleted | BOOLEAN DEFAULT FALSE | | ✅ |

**结论**：hse_employee_relation 字段与 Runbook 字段映射表完全匹配，无差异。

### 1.3 employee_assignment 实际结构

**来源**：[sprint5_6_employee_master_migration.sql](file:///F:/hse-dashboard/server/sql/sprint5_6_employee_master_migration.sql#L17-L64)

| 字段 | 类型 | 约束 | Runbook 匹配 |
|------|------|------|-------------|
| id | BIGSERIAL | PRIMARY KEY | ✅ |
| employee_id | BIGINT NOT NULL | REFERENCES employee(id) | ✅ |
| org_unit_id | BIGINT NOT NULL | REFERENCES hse_org_unit(id) | ✅ |
| operation_unit_id | BIGINT | REFERENCES hse_operation_unit(id), NULLABLE | ✅ |
| position_id | BIGINT NOT NULL | REFERENCES position(id) | ✅ |
| supervisor_id | BIGINT | REFERENCES employee(id), NULLABLE | ✅ |
| is_primary | BOOLEAN DEFAULT true | | ✅ |
| is_current | BOOLEAN DEFAULT true | | ✅ |
| status | VARCHAR(20) DEFAULT 'active' | | ✅ |
| start_date | DATE DEFAULT CURRENT_DATE | | ✅ |
| end_date | DATE | NULLABLE | ✅ |
| remark | VARCHAR(256) | NULLABLE | ✅ |
| created_by | VARCHAR(64) | NULLABLE | ✅ |
| **updated_by** | **VARCHAR(64)** | NULLABLE | ✅ |
| created_at | TIMESTAMP NOT NULL | | ✅ |
| updated_at | TIMESTAMP NOT NULL | | ✅ |
| is_deleted | BOOLEAN DEFAULT false | | ✅ |

**唯一索引**：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uk_emp_assign_primary
    ON employee_assignment (employee_id)
    WHERE is_primary = true AND is_current = true AND is_deleted = false;
```

**Runbook ON CONFLICT 子句**：
```sql
ON CONFLICT (employee_id)
WHERE is_primary = true AND is_current = true AND is_deleted = false
```

**结论**：唯一索引与 ON CONFLICT 子句**完全匹配** ✅

### 1.4 数据库模型一致性审计总结

| 审计项 | 结果 | 风险等级 |
|--------|------|----------|
| employee 表字段 | **缺失 updated_by** | 🔴 P0 |
| hse_employee_relation 字段 | 全部匹配 | ✅ 无风险 |
| employee_assignment 字段 | 全部匹配 | ✅ 无风险 |
| employee_assignment 唯一索引 | 与 ON CONFLICT 匹配 | ✅ 无风险 |
| employee_code 唯一约束 | 存在，带条件 WHERE | ✅ 无风险 |
| id_card/phone 加密格式 | ENC: 格式 + hash 字段 | ✅ 无风险 |

---

## 二、Runbook SQL 执行风险报告

### 2.1 SQL 语法与逻辑审计

#### 审计项 1：GET DIAGNOSTICS 语法

```sql
GET DIAGNOSTICS rec_count = ROW_COUNT;
```

**结论**：✅ 正确。PostgreSQL 9.0+ 支持此语法，可直接执行。

#### 审计项 2：B-0 恢复逻辑

```sql
UPDATE employee
SET is_deleted = false, updated_at = NOW(), updated_by = 'system_migration_b0'
WHERE id IN (...) AND is_deleted = true;
```

**问题**：
- ❌ `updated_by` 字段在 employee 表中不存在 → **P0 无法执行**
- ✅ `AND is_deleted = true` 作为安全守卫逻辑正确

#### 审计项 3：B-0 回滚逻辑

```sql
UPDATE employee
SET is_deleted = true, updated_at = NOW(), updated_by = 'system_migration_b0_rollback'
WHERE ... AND updated_by = 'system_migration_b0' AND is_deleted = false;
```

**问题**：
- ❌ `updated_by` 字段不存在 → **P0 无法执行**
- ❌ 因无法通过 `updated_by` 定位恢复的员工，回滚将**无法精确定位** → **P1 可能导致数据错误**

#### 审计项 4：B-2 ON CONFLICT 匹配

```sql
ON CONFLICT (employee_id)
WHERE is_primary = true AND is_current = true AND is_deleted = false
```

**结论**：✅ 匹配唯一索引 `uk_emp_assign_primary`，不会导致死锁或索引不匹配错误。

#### 审计项 5：B-2 UPSERT 重复处理安全性

当 employee_assignment 中已存在同一 employee_id 的记录时：
- ✅ DO UPDATE SET 覆盖更新所有字段
- ⚠️ 风险：如果旧记录的 org_unit_id 与新源数据不同，将被覆盖。需确认这是预期行为。

#### 审计项 6：B-0 并集恢复范围

```sql
SELECT DISTINCT employee_id FROM (
    SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
    UNION
    SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
) AS source_union
```

**结论**：✅ 逻辑正确。UNION 自动去重，恢复范围覆盖两表并集。

### 2.2 SQL 执行风险分级

| # | 风险项 | 位置 | 级别 | 描述 |
|---|--------|------|------|------|
| S1 | employee 表无 updated_by 字段 | B-0 Step 2 (L167-171) | 🔴 **P0** | SQL 直接报错，B-0 不可执行 |
| S2 | employee 表无 updated_by 字段 | B-0 Step 4 (L262-265) | 🔴 **P0** | SQL 直接报错，B-0 回滚不可执行 |
| S3 | 回滚无法精确定位 | B-0 Step 4 (L269-273) | 🟡 **P1** | 即使改为用 id 定位，回滚逻辑依赖 B-0 已完成，若 B-0 部分完成将导致不完整回滚 |
| S4 | UPSERT 覆盖风险 | B-2 Step 2 (L517-529) | 🟡 **P1** | 若 employee_assignment 已有数据，可能被覆盖 |
| S5 | `created_at` 保留原始时间 | B-2 Step 2 (L511) | 🟢 **P2** | COALESCE(her.created_at, NOW()) 逻辑正确，但需确保 hse_employee_relation.created_at 存在且合理 |
| S6 | 异常日志临时表 | B-2 Step 2 (L534-550) | 🟢 **P2** | b2_anomaly_log 为 TEMP TABLE，会话结束自动清除，需在同一事务/会话中查询 |

### 2.3 SQL 修复建议

#### S1/S2 修复：移除 updated_by 引用

**B-0 Step 2 修改建议**：
```sql
UPDATE employee
SET is_deleted = false,
    updated_at = NOW()
WHERE id IN (
    SELECT DISTINCT employee_id
    FROM (
        SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
        UNION
        SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
    ) AS source_union
    AND is_deleted = true
);
-- 注意：通过 ROW_COUNT 验证影响行数，替代 updated_by 标记
```

**B-0 回滚修改建议**（改用 id 列表定位）：
```sql
-- 回滚前先获取恢复的 ID 列表（需在 B-0 执行前保存）
-- 或者直接使用 source_union 子查询定位
UPDATE employee
SET is_deleted = true, updated_at = NOW()
WHERE id IN (
    SELECT DISTINCT employee_id
    FROM (
        SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
        UNION
        SELECT employee_id FROM hse_employee_org WHERE is_deleted = false AND is_current = true
    ) AS source_union
    AND is_deleted = false
);
```

**回滚风险**：如果 B-0 之后有其他业务操作修改了 employee 表，回滚将把所有并集中的员工都标记为软删，包括恢复期间新增的活跃修改。**建议改为记录恢复 ID 列表到临时表**。

---

## 三、后端代码迁移影响清单

### 3.1 hse-employee.js 代码位置验证

**文件路径**：[server/routes/hse-employee.js](file:///F:/hse-dashboard/server/routes/hse-employee.js)

#### 核心迁移点（17 处）

| # | 行号 | 接口/功能 | 当前数据源 | 目标数据源 | 修改风险 | 建议修改方式 |
|---|------|----------|-----------|-----------|----------|-------------|
| 1 | 504 | GET /employees/stats 状态统计 | hse_employee_org | employee_assignment | 🔴 高 | status 枚举转换（在职→active） |
| 2 | 542 | GET /employees 员工列表（分页） | hse_employee_org | employee_assignment | 🟡 中 | JOIN 变更 + 字段映射 |
| 3 | 693 | PUT /employees/:id/transfer 调岗（关旧记录） | hse_employee_org | employee_assignment | 🔴 高 | 表名+字段名变更 |
| 4 | 734-742 | GET /employees/dept-ids 5级组织查询 | hse_employee_org | employee_assignment | 🔴 高 | 5处 SELECT 需改写为两级查询 |
| 5 | 820 | GET /employees 员工列表（另一查询） | hse_employee_org | employee_assignment | 🟡 中 | JOIN 变更 |
| 6 | 833 | GET /employees 员工列表（又一查询） | hse_employee_org | employee_assignment | 🟡 中 | JOIN 变更 |
| 7 | 1106 | GET /employees/:id/assignments 组织关系列表 | hse_employee_org | employee_assignment | 🟡 中 | 字段映射 |
| 8 | 1135 | GET /employees/:id/assignments 组织关系列表 | hse_employee_org | employee_assignment | 🟡 中 | 字段映射 |
| 9 | 1175 | GET /employees/:id/current-org 当前组织 | hse_employee_org | employee_assignment | 🟡 中 | WHERE 条件变更 |
| 10 | 1193 | PUT /employees/:id/transfer 调岗（关旧记录） | hse_employee_org | employee_assignment | 🔴 高 | UPDATE 目标+字段 |
| 11 | 1205 | POST /employees 新增组织关系 | hse_employee_org | employee_assignment | 🔴 高 | INSERT 字段映射（group_id→org_unit_id, region_id→operation_unit_id） |
| 12 | 1257 | GET /employees/assignments/:id 组织关系详情 | hse_employee_org | employee_assignment | 🟡 中 | 字段映射 |
| 13 | 1272 | PUT /employees/assignments/:id/status 更新状态 | hse_employee_org | employee_assignment | 🟡 中 | UPDATE 目标+字段 |
| 14 | 1278 | PUT /employees/assignments/:id/status 更新状态 | hse_employee_org | employee_assignment | 🟡 中 | UPDATE 目标+字段 |
| 15 | 1677 | POST /employees/import 导入（关旧记录） | hse_employee_org | employee_assignment | 🔴 高 | UPDATE 目标+字段 |
| 16 | 1683 | POST /employees/import 导入（新增） | hse_employee_org | employee_assignment | 🔴 高 | INSERT 字段映射 |
| 17 | 4297 | GET /employees 员工列表（第三查询） | hse_employee_org | employee_assignment | 🟡 中 | JOIN 变更 |

#### 已完成迁移点（2 处）

| # | 行号 | 接口/功能 | 当前数据源 | 状态 |
|---|------|----------|-----------|------|
| A | 5583 | GET /employees/profile/:id 员工档案 | employee_assignment | ✅ 已迁移 |
| B | 5610 | GET /employees/profile/:id/driver-info 驾驶员信息 | employee_assignment | ✅ 已迁移 |

### 3.2 关键风险点

#### 🔴 风险 R1：INSERT 语句字段映射（#11, #16）

行 1205 和 1683 的 INSERT 语句当前使用 `group_id, region_id, enterprise_id, project_id, team_id`，迁移后需改为 `org_unit_id, operation_unit_id`。这涉及：
- 五级组织 → 两级组织的字段裁剪
- 位置查询逻辑（如"根据 group_id 查下属员工"）需要完全重写

#### 🔴 风险 R2：status 枚举不兼容（#1, #13, #14）

hse_employee_org 使用中文状态：`'在职'`, `'待岗'`, `'离职'`, `'退休'`, `'返聘'`
employee_assignment 使用英文状态：`'active'`, `'pending'`, `'inactive'`

迁移时需要建立映射表，否则状态统计将失效。

#### 🟡 风险 R3：调岗流程逻辑（#3, #10）

调岗涉及关闭旧记录（SET is_current=false）和创建新记录，迁移后需确保：
- 主岗唯一约束正确触发
- start_date/end_date 语义保持一致
- supervisor_id 映射正确

---

## 四、Sprint-B 前端字段迁移检查报告

### 4.1 前端文件字段检查

| # | 文件路径 | 检查字段 | 使用情况 | 风险 |
|---|----------|----------|----------|------|
| 1 | [EmployeeSelector.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/components/hse/EmployeeSelector.vue#L113) | org_unit_id / operation_unit_id / group_id / region_id | ✅ 仅使用 org_unit_id | 无风险 |
| 2 | [employee-selector.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/employee-selector.ts#L18-L29) | org_unit_id / operation_unit_id / group_id / region_id | ✅ 仅使用 org_unit_id 和 operation_unit_id | 无风险 |
| 3 | OrgTransferModal.vue | org_unit_id / operation_unit_id / group_id / region_id | ✅ 无相关引用 | 无风险 |
| 4 | employee/index.vue | group_id / region_id | ✅ 无相关引用 | 无风险 |
| 5 | employee/departments.vue | group_id / region_id | ✅ 无相关引用 | 无风险 |

### 4.2 前端审计结论

✅ **前端已完成字段适配**。EmployeeSelector.vue 和 employee-selector.ts 已统一使用 `org_unit_id` / `operation_unit_id`，无 `group_id` / `region_id` 残留引用。

### 4.3 前端潜在风险

| # | 风险项 | 描述 | 建议 |
|---|--------|------|------|
| F1 | 后端 API 返回字段 | 需确认 employee_assignment 查询接口返回的字段名与前端类型定义一致 | 代码切换时同步验证 |
| F2 | API 路由路径 | 当前 EmployeeSelector 调用的 API 是否已指向 employee_assignment 数据源 | 确认后端 profile 接口已迁移 |
| F3 | OrgTransferModal 提交逻辑 | 需确认调岗提交时传递的字段是否与后端接收字段一致 | 代码切换时同步验证 |

---

## 五、迁移顺序重新评估

### 5.1 当前 Runbook 顺序

```
B-0 (Employee 恢复) → B-1 (前置检查) → B-2 (数据迁移) → 代码切换
```

### 5.2 顺序风险分析

| 风险 | 描述 | 严重等级 |
|------|------|----------|
| 数据孤岛风险 | B-2 迁移后 employee_assignment 有数据，但 hse-employee.js 仍读 hse_employee_org。期间员工档案（profile）接口已读 employee_assignment，而列表接口仍读 hse_employee_org → 数据不一致 | 🟡 P1 |
| 回滚复杂度 | 如果代码切换失败需回滚，不仅要回滚 B-2 数据，还要恢复代码 | 🟢 P2 |
| 停机窗口过长 | B-0→B-2→代码切换全流程需停机 ≈2.5 小时 | 🟢 P2 |

### 5.3 建议迁移顺序

**方案：停机原子切换（保留 Runbook 顺序，增强风险控制）**

```
Phase 1: 数据准备（不停机）
  ├── B-0 Employee 恢复（需停机，15分钟）
  ├── B-1 前置检查（停机中，10分钟）
  └── B-2 数据迁移（停机中，15分钟）
        ↓
Phase 2: 双验证（停机中）
  ├── 验证 employee_assignment 数据完整性
  ├── 验证 employee_assignment 关联完整性
  └── 确认 hse_employee_org 与 employee_assignment 数据一致
        ↓
Phase 3: 代码切换（停机中）
  ├── 切换 hse-employee.js 17 处 SQL
  ├── 启动后端服务
  └── 冒烟测试
        ↓
Phase 4: 冻结与上线
  ├── 冻结 hse_employee_org（REVOKE 写入）
  ├── 启动 72 小时观察
  └── 代码切换完成
```

**关键改动**：
1. B-2 数据迁移后**立即**进行代码切换，缩短数据不一致窗口
2. 代码切换后**立即**冻结 hse_employee_org 写入，防止双写
3. 整个流程在**一次停机窗口**内完成，避免业务数据不一致

### 5.4 风险缓解措施

| 措施 | 描述 |
|------|------|
| 双源读取过渡期 | 代码切换前，hse-employee.js 的 profile 接口已读 employee_assignment，主列表接口读 hse_employee_org。B-2 迁移后，profile 接口立即可用新数据 |
| 数据一致性校验 | B-2 后立即执行 `hse_employee_org ∪ employee_assignment` 数据对比，确保无遗漏 |
| 快速回滚预案 | 代码切换失败时，只需停止后端、恢复代码、重启，无需回滚数据（数据在 employee_assignment 中保留） |

---

## 六、最终审计结论

### 6.1 总体结论

```
□ 可以执行（需修复 P0 问题后）
✅ 修改后执行
□ 暂停执行
```

### 6.2 必须修复问题列表

| # | 问题 | 级别 | 位置 | 修复方案 |
|---|------|------|------|----------|
| 1 | employee 表无 updated_by 字段 | 🔴 P0 | B-0 Step 2 (L167-171) | 移除 `updated_by` 引用，改用 `updated_at` 作为变更标记 |
| 2 | employee 表无 updated_by 字段 | 🔴 P0 | B-0 Step 4 回滚 (L262-265) | 移除 `updated_by` 引用，改用 `id IN (...)` 定位回滚范围 |
| 3 | 回滚无法精确定位 | 🟡 P1 | B-0 Step 4 (L269-273) | B-0 执行前将恢复 ID 列表保存到临时表 `temp_b0_recover_ids`，回滚时从临时表读取 |
| 4 | status 枚举不兼容 | 🟡 P1 | 代码切换 R1-R3 | 建立 hse_employee_org.status ↔ employee_assignment.status 映射表 |
| 5 | INSERT 字段映射 | 🟡 P1 | 代码切换 #11, #16 | group_id→org_unit_id, region_id→operation_unit_id，其余 3 级字段丢弃 |

### 6.3 建议修改 Runbook 内容

| # | Runbook 位置 | 修改内容 |
|---|-------------|----------|
| 1 | B-0 Step 2 (L167-171) | 移除 `updated_by` 列，改为仅 `SET is_deleted=false, updated_at=NOW()` |
| 2 | B-0 Step 3 (L195-239) | 新增"恢复 ID 列表持久化"步骤，将恢复的 employee_id 保存至 `temp_b0_recover_ids` 临时表 |
| 3 | B-0 Step 4 (L251-284) | 回滚 SQL 改为从 `temp_b0_recover_ids` 读取 ID 列表，移除 `updated_by` 引用 |
| 4 | B-2 Step 2 (L517-529) | 补充 status 映射表说明，明确转换规则 |
| 5 | B-2 Step 3 (L558-564) | 增加 UPSERT 覆盖风险提示，建议迁移前备份 employee_assignment |
| 6 | 第八章 (L706-776) | 补充 status 枚举映射表，补充字段映射完整列表 |

### 6.4 建议新增检查项

| # | 检查项 | 检查方式 | 目的 |
|---|--------|----------|------|
| 1 | employee 表实际列检查 | `\d employee` 或 `SELECT column_name FROM information_schema.columns WHERE table_name='employee'` | 确认无 updated_by 字段，避免 SQL 执行失败 |
| 2 | employee_assignment 表是否已存在 | `SELECT COUNT(*) FROM employee_assignment` | 确认表已创建且结构正确 |
| 3 | employee_assignment 唯一索引状态 | `\d employee_assignment` | 确认 uk_emp_assign_primary 索引存在 |
| 4 | hse_employee_relation 与 employee_assignment 数据对比 | 迁移后执行 `SELECT COUNT(*) FROM (SELECT employee_id,org_unit_id FROM hse_employee_relation EXCEPT SELECT employee_id,org_unit_id FROM employee_assignment)` | 确保无数据丢失 |
| 5 | hse_employee_org status 枚举检查 | `SELECT DISTINCT status FROM hse_employee_org` | 确认中文状态映射范围 |
| 6 | employee_assignment status 枚举检查 | `SELECT DISTINCT status FROM employee_assignment` | 确认英文状态值存在 |
| 7 | 代码中 employee_assignment 已有数据检查 | `SELECT COUNT(*) FROM employee_assignment` | 评估 UPSERT 覆盖风险 |

### 6.5 迁移执行前最后确认清单

| # | 确认项 | 确认方式 | 状态 |
|---|--------|----------|------|
| 1 | employee 表无 updated_by 字段 | `SELECT column_name FROM information_schema.columns WHERE table_name='employee' AND column_name='updated_by'` = 空 | □ |
| 2 | Runbook B-0 SQL 已修复（移除 updated_by） | 人工审查修改后的 Runbook | □ |
| 3 | employee_assignment 表存在且结构正确 | `SELECT COUNT(*) FROM employee_assignment` | □ |
| 4 | hse_employee_relation 数据完整性验证通过 | B-1 四项检查全部通过 | □ |
| 5 | employee 恢复影响行数在合理范围 | B-0 Step 2 ROW_COUNT ∈ [1285, 1310] | □ |
| 6 | B-2 迁移前备份完成 | `SELECT COUNT(*) FROM employee_assignment_b2_backup` | □ |
| 7 | B-2 迁移后数据一致性验证通过 | 第七章 10 项检查全部通过 | □ |
| 8 | hse-employee.js 代码切换已准备 | 代码 diff 已审查 | □ |
| 9 | 前端代码无需修改 | 4 个前端文件已确认无 group_id/region_id | □ |
| 10 | 回滚脚本已验证可执行 | B-0/B-2 回滚 SQL 已通过语法检查 | □ |
| 11 | 停机窗口已确认 | 已与业务方沟通并通知 | □ |
| 12 | 紧急联系人已就绪 | 5 类角色全部到位 | □ |
| 13 | 迁移记录保存方案已确认 | 临时表 temp_b0_recover_ids 创建脚本已准备 | □ |
| 14 | status 枚举映射表已创建 | 在职→active, 待岗→pending, 离职→inactive | □ |
| 15 | employee_assignment 冻结方案已确认 | REVOKE/GRANT 脚本已准备 | □ |

---

## 附录：关键文件引用

| 文件 | 路径 | 用途 |
|------|------|------|
| employee 表定义 | [hse_employee_master_v59_migration.sql#L112-L133](file:///F:/hse-dashboard/server/sql/hse_employee_master_v59_migration.sql#L112-L133) | 确认字段结构 |
| employee 加固 | [hse_employee_master_v60_hardening.sql#L32-L33](file:///F:/hse-dashboard/server/sql/hse_employee_master_v60_hardening.sql#L32-L33) | id_card_hash/phone_hash |
| hse_employee_relation 定义 | [hse_org_center_v68_migration.sql#L97-L114](file:///F:/hse-dashboard/server/sql/hse_org_center_v68_migration.sql#L97-L114) | 迁移源表结构 |
| employee_assignment 定义 | [sprint5_6_employee_master_migration.sql#L17-L64](file:///F:/hse-dashboard/server/sql/sprint5_6_employee_master_migration.sql#L17-L64) | 迁移目标表结构 |
| 后端路由 | [hse-employee.js](file:///F:/hse-dashboard/server/routes/hse-employee.js) | 17 处迁移点 |
| 员工选择组件 | [EmployeeSelector.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/components/hse/EmployeeSelector.vue) | 前端字段检查 |
| 员工选择 API | [employee-selector.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/employee-selector.ts) | 类型定义检查 |

---

> **审计结论**：修复 2 个 P0 级问题（employee 表无 updated_by 字段导致的 SQL 错误）和 3 个 P1 级问题后，Sprint-B 数据迁移可安全执行。建议按 6.3 和 6.4 节修改 Runbook 后再次审查。
