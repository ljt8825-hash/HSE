# Sprint-B 人员模型统一实施方案

**文档版本**：v1.0  
**编制日期**：2026-07-28  
**前置文档**：
- [Sprint-B人员模型统一前置审计清单.md](file:///F:/hse-dashboard/docs/Sprint-B人员模型统一前置审计清单.md)
- [Sprint-B组织模型映射审计报告.md](file:///F:/hse-dashboard/docs/personnel/Sprint-B组织模型映射审计报告.md)

**目标**：实现 `employee` + `employee_assignment` 作为人员唯一主数据链路  

---

## 一、实施阶段重新规划

Sprint B 拆分为 5 个子阶段，严格按顺序执行：

| 阶段 | 名称 | 目标 | 数据库影响 | 代码影响 |
|---|---|---|---|---|
| **B-0** | 人员数据恢复与基线重建 | 恢复 employee 表全量数据 | 仅 INSERT/UPDATE 数据 | 无 |
| **B-1** | 组织模型映射 | 建立 department → hse_org_unit/hse_operation_unit 映射 | 仅 INSERT 映射辅助表 | 无 |
| **B-2** | employee_assignment 统一迁移 | 将任职关系迁移到 employee_assignment | 仅 INSERT 数据 | 无 |
| **B-3** | 旧模型冻结 | hse-employee.js 读写切换到 employee_assignment | 无 | hse-employee.js |
| **B-4** | 业务验证 | 全模块数据一致性验证 | 无 | 无 |

**阶段依赖关系**：

```
B-0（数据恢复）→ B-1（组织映射）→ B-2（任职迁移）→ B-3（代码切换）→ B-4（验证）
```

---

## 二、Sprint B-0：人员数据恢复与基线重建

### 2.1 背景说明

Sprint-A 测试执行了 `clear-all` 操作，导致：

| 表 | 清空前 | 清空后 | 当前状态 |
|---|---|---|---|
| employee | ~1,360 条活跃 | 0 条活跃 | ❌ 仅 1 条测试数据 |
| employee_assignment | ~1,304 条活跃 | 0 条活跃 | ❌ 仅 1 条测试数据 |
| hse_employee_org | 1,285 条（未受影响） | 1,285 条 | ✅ 数据完整 |
| hse_employee_relation | 1,304 条（未受影响） | 1,304 条 | ✅ 数据完整 |

### 2.2 恢复方案

**方案选择**：从 `hse_employee_org` 反向恢复 `employee` 表数据

**原因**：
- `hse_employee_org` 数据完整（1,285 条）
- `employee` 表的 `is_deleted = true` 记录仍在（软删除未物理删除）
- 可通过 `UPDATE employee SET is_deleted = false` 恢复

### 2.3 恢复顺序

```
步骤1: 备份当前状态（记录基线）
  ↓
步骤2: 恢复 employee 表（is_deleted = false → WHERE id IN hse_employee_org.employee_id）
  ↓
步骤3: 验证 employee 数量与 hse_employee_org 一致
  ↓
步骤4: 清理测试数据（TEST001 等）
  ↓
步骤5: 记录恢复后基线
```

### 2.4 恢复 SQL

```sql
-- 步骤1: 记录恢复前基线
SELECT 'before_recovery' AS phase,
       COUNT(*) AS total,
       COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active
FROM employee;

-- 步骤2: 恢复 employee（将 hse_employee_org 中引用的员工恢复为活跃）
UPDATE employee SET is_deleted = false, updated_at = NOW()
WHERE id IN (
  SELECT DISTINCT employee_id FROM hse_employee_org WHERE is_deleted = false
)
AND is_deleted = true;

-- 步骤3: 验证
SELECT 'after_recovery' AS phase,
       COUNT(*) AS total,
       COUNT(CASE WHEN is_deleted = false THEN 1 END) AS active
FROM employee;

-- 步骤4: 清理测试数据
UPDATE employee SET is_deleted = true
WHERE employee_code IN ('TEST001', 'TEST002', 'TEST003');
```

### 2.5 数据校验

| 校验项 | SQL | 预期结果 |
|---|---|---|
| 活跃员工数 | `SELECT COUNT(*) FROM employee WHERE is_deleted = false` | ≈ 1,285（与 hse_employee_org 一致） |
| hse_employee_org 引用的员工都存在 | `SELECT COUNT(*) FROM hse_employee_org heo LEFT JOIN employee e ON heo.employee_id = e.id WHERE e.id IS NULL OR e.is_deleted = true` | 0 条 |
| 无测试数据残留 | `SELECT COUNT(*) FROM employee WHERE employee_code LIKE 'TEST%' AND is_deleted = false` | 0 条 |

### 2.6 失败回滚

```sql
-- 回滚：重新软删除恢复的记录
UPDATE employee SET is_deleted = true, updated_at = NOW()
WHERE id IN (
  SELECT DISTINCT employee_id FROM hse_employee_org WHERE is_deleted = false
)
AND is_deleted = false
AND employee_code NOT IN ('TEST001');  -- 保留原始测试数据
```

---

## 三、Sprint B-1：组织模型映射设计

### 3.1 映射目标

将 `hse_employee_org` 的五级组织字段映射到 V2.1 的 `hse_org_unit` + `hse_operation_unit`：

```
hse_employee_org.group_id   → department(Level 1) → hse_org_unit(Level 3)   → employee_assignment.org_unit_id
hse_employee_org.region_id  → department(Level 2) → hse_operation_unit      → employee_assignment.operation_unit_id
```

### 3.2 各级对应关系

#### 3.2.1 enterprise_id（企业级）

| 项目 | 内容 |
|---|---|
| hse_employee_org 使用率 | 0%（全部为 NULL） |
| 映射目标 | 无 |
| 处理方式 | 丢弃，不映射 |

#### 3.2.2 region_id（片区/乡镇级）

| 项目 | 内容 |
|---|---|
| hse_employee_org 使用率 | 99.4%（1,277/1,285 有值） |
| 引用表 | department（Level 2 班组） |
| 映射目标 | `hse_operation_unit.id`（班组/车组/转运站） |
| 映射规则 | department.name ↔ hse_operation_unit.unit_name（名称匹配） |
| NULL 处理 | 8 条 NULL → operation_unit_id 设为 NULL |

**映射对照表**（department Level 2 → hse_operation_unit）：

| department Level 2 名称 | hse_operation_unit 名称 | 匹配方式 |
|---|---|---|
| 保店镇一班 | 保店镇一班 | 精确匹配 |
| 柴胡店镇五班 | 柴胡店镇五班 | 精确匹配 |
| 宁城街道一班 | 宁城街道一班 | 精确匹配 |
| ...（共 63 个） | ...（共 75 个） | 需逐一核对 |

#### 3.2.3 group_id（集团/区域级）

| 项目 | 内容 |
|---|---|
| hse_employee_org 使用率 | 100%（1,285/1,285 有值） |
| 引用表 | department（Level 1 乡镇/部门） |
| 映射目标 | `hse_org_unit.id`（Level 3 town_center） |
| 映射规则 | department.name 去后缀 ↔ hse_org_unit.org_name 去后缀 |

**映射对照表**（department Level 1 → hse_org_unit）：

| department Level 1 名称 | hse_org_unit 名称 | hse_org_unit org_code | 匹配方式 |
|---|---|---|---|
| 长官镇 | 长官镇作业中心 | TOWN-CHANGGUAN | 去掉"作业中心"后缀匹配 |
| 张大庄镇 | 张大庄镇作业中心 | TOWN-ZHANGDAZHUANG | 同上 |
| 大曹镇 | 大曹镇作业中心 | TOWN-DACAO | 同上 |
| 杜集镇 | 杜集镇作业中心 | TOWN-DUJI | 同上 |
| 柴胡店镇 | 柴胡店镇作业中心 | TOWN-CHAIHUDIAN | 同上 |
| 保店镇 | 保店镇作业中心 | TOWN-BAODIAN | 同上 |
| 大柳镇 | 大柳镇作业中心 | TOWN-DALIU | 同上 |
| 相衙镇 | 相衙镇作业中心 | TOWN-XIANGYA | 同上 |
| 刘营伍 | 刘营伍乡作业中心 | TOWN-LIUYINGWU | 包含匹配 |
| 时集镇 | 时集镇作业中心 | TOWN-SHIJI | 去后缀匹配 |
| 宁城街道 | 宁城街道作业中心 | TOWN-NINGCHENG | 去后缀匹配 |
| 津城街道 | 津城街道作业中心 | TOWN-JINCHENG | 去后缀匹配 |
| 生产运营部 | 环卫作业中心 | CENTER-HW | 业务语义匹配 |
| 转运车辆 | （无对应） | — | 映射到 center_vehicle_team |

#### 3.2.4 project_id（项目级）

| 项目 | 内容 |
|---|---|
| hse_employee_org 使用率 | 0%（全部为 NULL） |
| 映射目标 | 无 |
| 处理方式 | 丢弃，不映射 |

#### 3.2.5 team_id（班组级）

| 项目 | 内容 |
|---|---|
| hse_employee_org 使用率 | 0%（全部为 NULL） |
| 映射目标 | 无 |
| 处理方式 | 丢弃，不映射 |

### 3.3 映射辅助表

为支持迁移，创建临时映射辅助表（迁移完成后可删除）：

```sql
CREATE TEMP TABLE _migration_dept_map AS
SELECT
  d.id AS department_id,
  d.name AS department_name,
  d.parent_id,
  ou.id AS org_unit_id,
  ou.org_name,
  ou.org_code
FROM department d
LEFT JOIN hse_org_unit ou ON (
  ou.is_deleted = false
  AND (
    ou.org_name = d.name || '作业中心'
    OR ou.org_name LIKE '%' || d.name || '%'
  )
  AND ou.org_type IN ('town_center', 'center')
);
```

### 3.4 未匹配数据处理

| 异常类型 | 数量 | 处理方式 |
|---|---|---|
| department "转运车辆" 无对应 hse_org_unit | 1 条 | 映射到环卫作业中心（CENTER-HW），operation_unit_id 设为 center_vehicle_team |
| department "生产运营部" → 环卫作业中心 | 1 条 | 手工指定 org_unit_id = CENTER-HW 的 ID |
| region_id 为 NULL | 8 条 | operation_unit_id 设为 NULL |
| group_id 孤立引用 | 1 条 | 排查后手动修正 |
| department Level 2 名称在 hse_operation_unit 中无匹配 | 待确认 | 输出未匹配清单，人工审核 |

---

## 四、Sprint B-2：employee_assignment 统一迁移设计

### 4.1 迁移源选择

**推荐方案**：从 `hse_employee_relation` 迁移（1,304 条，已是 V2.1 结构）

**理由**：
1. `hse_employee_relation` 表字段与 `employee_assignment` 高度一致（`org_unit_id`、`operation_unit_id` 已对齐）
2. 避免了 department → hse_org_unit 的名称匹配风险
3. 数据量更大（1,304 vs 1,285），覆盖更全

**备选方案**：从 `hse_employee_org` 迁移（1,285 条，需名称匹配转换）

### 4.2 字段映射表

#### 方案A：从 hse_employee_relation 迁移（推荐）

| hse_employee_relation 字段 | employee_assignment 字段 | 映射方式 | 说明 |
|---|---|---|---|
| `employee_id` | `employee_id` | ✅ 直接 | |
| `org_unit_id` | `org_unit_id` | ✅ 直接 | |
| `operation_unit_id` | `operation_unit_id` | ✅ 直接 | |
| `position_id` | `position_id` | ✅ 直接 | |
| `supervisor_id` | `supervisor_id` | ✅ 直接 | |
| `is_current` | `is_current` | ✅ 直接 | |
| `status` | `status` | ⚠️ 转换 | 见 4.3 |
| `is_primary` | `is_primary` | ✅ 直接 | |
| `start_date` | `start_date` | ✅ 直接 | |
| `end_date` | `end_date` | ✅ 直接 | |
| `remark` | `remark` | ✅ 直接 | |
| — | `created_by` | ⚠️ 补默认值 | `'system_migration_b2'` |
| `created_at` | `created_at` | ✅ 直接 | |
| `updated_at` | `updated_at` | ✅ 直接 | |
| `is_deleted` | `is_deleted` | ✅ 直接 | |

#### 方案B：从 hse_employee_org 迁移（备选）

| hse_employee_org 字段 | employee_assignment 字段 | 映射方式 | 说明 |
|---|---|---|---|
| `employee_id` | `employee_id` | ✅ 直接 | |
| `group_id` → dept → hse_org_unit | `org_unit_id` | ⚠️ 间接映射 | 需 B-1 映射表 |
| `region_id` → dept → hse_operation_unit | `operation_unit_id` | ⚠️ 间接映射 | 需 B-1 映射表 |
| `position_id` | `position_id` | ✅ 直接 | |
| `supervisor_id` | `supervisor_id` | ✅ 直接 | |
| `is_current` | `is_current` | ✅ 直接 | |
| `status` | `status` | ⚠️ 转换 | 见 4.3 |
| — | `is_primary` | ⚠️ 补默认值 | `true` |
| `start_date` | `start_date` | ✅ 直接 | |
| `end_date` | `end_date` | ✅ 直接 | |
| `change_reason` | `remark` | ⚠️ 语义映射 | 字段名不同 |
| — | `created_by` | ⚠️ 补默认值 | `'system_migration_b2'` |
| `created_at` | `created_at` | ✅ 直接 | |
| `updated_at` | `updated_at` | ✅ 直接 | |
| `is_deleted` | `is_deleted` | ✅ 直接 | |

### 4.3 status 值域转换

| 源表 status | employee_assignment status | 说明 |
|---|---|---|
| `在职` / `active` | `active` | 当前在职 |
| `待岗` / `pending` | `pending` | 待岗 |
| `离职` / `inactive` | `inactive` | 离职 |
| `退休` | `inactive` | 退休归入 inactive |
| `返聘` | `active` | 返聘视为在职 |
| NULL 或其他 | `active` | 默认值 |

### 4.4 SQL 迁移策略

```sql
-- ========================================
-- Sprint B-2: employee_assignment 统一迁移
-- ========================================

-- 步骤1: 清理旧的测试数据
UPDATE employee_assignment SET is_deleted = true
WHERE created_by = 'sprint_a_test' OR employee_id IN (
  SELECT id FROM employee WHERE employee_code LIKE 'TEST%'
);

-- 步骤2: 迁移 hse_employee_relation 数据（推荐方案）
INSERT INTO employee_assignment (
  employee_id, org_unit_id, operation_unit_id, position_id, supervisor_id,
  is_current, status, is_primary, start_date, end_date, remark, created_by,
  created_at, updated_at, is_deleted
)
SELECT
  her.employee_id,
  her.org_unit_id,
  her.operation_unit_id,
  her.position_id,
  her.supervisor_id,
  her.is_current,
  CASE her.status
    WHEN '在职' THEN 'active'
    WHEN 'active' THEN 'active'
    WHEN '待岗' THEN 'pending'
    WHEN 'pending' THEN 'pending'
    WHEN '离职' THEN 'inactive'
    WHEN 'inactive' THEN 'inactive'
    WHEN '退休' THEN 'inactive'
    WHEN '返聘' THEN 'active'
    ELSE 'active'
  END AS status,
  her.is_primary,
  her.start_date,
  her.end_date,
  her.remark,
  'system_migration_b2',
  her.created_at,
  her.updated_at,
  her.is_deleted
FROM hse_employee_relation her
WHERE her.is_deleted = false
  AND her.is_current = true
  -- 排除已存在的记录
  AND NOT EXISTS (
    SELECT 1 FROM employee_assignment ea
    WHERE ea.employee_id = her.employee_id
      AND ea.is_current = true
      AND ea.is_deleted = false
      AND ea.created_by = 'system_migration_b2'
  );

-- 步骤3: 验证迁移结果
SELECT
  'migration_result' AS phase,
  COUNT(*) AS total_migrated,
  COUNT(CASE WHEN is_current = true THEN 1 END) AS current_count,
  COUNT(CASE WHEN org_unit_id IS NOT NULL THEN 1 END) AS has_org,
  COUNT(CASE WHEN operation_unit_id IS NOT NULL THEN 1 END) AS has_op_unit,
  COUNT(CASE WHEN position_id IS NOT NULL THEN 1 END) AS has_position
FROM employee_assignment
WHERE created_by = 'system_migration_b2';
```

### 4.5 重复数据处理

| 重复类型 | 处理策略 |
|---|---|
| 同一员工在 employee_assignment 已有活跃记录 | `NOT EXISTS` 排除，不覆盖 |
| 同一员工在 hse_employee_relation 有多条 is_current=true | 取第一条，其余标记为 is_current=false |
| employee_id 在 employee 表中已软删除 | 仍迁移，但标记 is_deleted=true |

### 4.6 异常数据处理

| 异常类型 | 数量（预估） | 处理方式 |
|---|---|---|
| org_unit_id 为 NULL | 0（hse_employee_relation 已有值） | 跳过迁移，记录到异常日志 |
| operation_unit_id 为 NULL | 少量 | 允许 NULL，正常迁移 |
| position_id 为 NULL | 少量 | 允许 NULL，正常迁移 |
| supervisor_id 为 NULL | 少量 | 允许 NULL，正常迁移 |
| employee_id 不在 employee 表中 | 0 | 跳过迁移，记录到异常日志 |

---

## 五、代码改造范围

### 5.1 需要修改的文件

#### 5.1.1 server/routes/hse-employee.js

**改造原因**：V1 员工管理路由仍读写 `hse_employee_org`，需切换到 `employee_assignment`

**改造范围**：

| 代码位置 | 当前逻辑 | 改造为 | 说明 |
|---|---|---|---|
| [L504](file:///F:/hse-dashboard/server/routes/hse-employee.js#L504) | `SELECT FROM hse_employee_org` 统计 | 改为 `SELECT FROM employee_assignment` | 员工状态统计 |
| [L542](file:///F:/hse-dashboard/server/routes/hse-employee.js#L542) | `JOIN hse_employee_org eo` | 改为 `JOIN employee_assignment ea` | 员工列表查询 |
| [L693](file:///F:/hse-dashboard/server/routes/hse-employee.js#L693) | `UPDATE hse_employee_org SET is_current=false` | 改为 `UPDATE employee_assignment SET is_current=false` | 调岗旧记录关闭 |
| [L734-742](file:///F:/hse-dashboard/server/routes/hse-employee.js#L734-L742) | 五级 department 查询（group/region/enterprise/project/team） | 改为 `ea.org_unit_id` + `ea.operation_unit_id` | 按部门筛选员工 |
| [L820-833](file:///F:/hse-dashboard/server/routes/hse-employee.js#L820-L833) | `JOIN hse_employee_org eo` | 改为 `JOIN employee_assignment ea` + `JOIN hse_org_unit` + `JOIN hse_operation_unit` | 员工导出 |
| [L1090-1278](file:///F:/hse-dashboard/server/routes/hse-employee.js#L1090-L1278) | 人员组织关系维护（读写 hse_employee_org） | 改为读写 `employee_assignment` | 调岗/状态变更接口 |
| [L1677-1688](file:///F:/hse-dashboard/server/routes/hse-employee.js#L1677-L1688) | `UPDATE/INSERT hse_employee_org` | 改为 `UPDATE/INSERT employee_assignment` | V1 花名册导入中的组织关系写入 |
| [L4297](file:///F:/hse-dashboard/server/routes/hse-employee.js#L4297) | `JOIN hse_employee_org eo` | 改为 `JOIN employee_assignment ea` | 员工查询 |

**已使用视图的代码（无需修改）**：

| 代码位置 | 当前逻辑 | 说明 |
|---|---|---|
| [L467-482](file:///F:/hse-dashboard/server/routes/hse-employee.js#L467-L482) | `SELECT FROM v_employee_current` | ✅ 视图已基于 employee_assignment |
| [L5453-5964](file:///F:/hse-dashboard/server/routes/hse-employee.js#L5453-L5964) | `SELECT FROM v_employee_current` / `v_employee_org_full` | ✅ 员工档案中心已使用视图 |

#### 5.1.2 server/routes/hse-employee-import-v2.js

**改造原因**：V2 导入路由在 `batch/:id/import` 中写入 `employee_assignment`，需确认字段一致性

**改造范围**：

| 代码位置 | 当前逻辑 | 改造为 | 说明 |
|---|---|---|---|
| [L993-997](file:///F:/hse-dashboard/server/routes/hse-employee-import-v2.js#L993-L997) | `INSERT INTO employee_assignment` | 确认 `org_unit_id` 和 `operation_unit_id` 来源正确 | Sprint A 已修复字段，Sprint B 确认映射逻辑 |

**改造量**：极小，主要是确认而非修改。

#### 5.1.3 server/routes/personnel.js

**改造原因**：personnel 路由使用独立的 `personnel` 表，需冻结

**改造范围**：

| 改造方式 | 说明 |
|---|---|
| 将 POST/PUT/DELETE 接口返回 410 Gone | 冻结写入操作 |
| GET 接口改为查询 `employee` + `v_employee_current` | 兼容旧前端读取 |
| 保留路由文件，不删除 | 避免前端 404 |

### 5.2 无需修改的文件

| 文件 | 原因 |
|---|---|
| `hse-risk-profile.js` | 已通过 `employee_assignment` 查询 ✅ |
| `hse-warning-center.js` | 已通过 `employee_assignment` 查询 ✅ |
| `hse-assessment.js` | 已通过 `employee_assignment` 查询 ✅ |
| `hse-accident-analysis.js` | 已通过 `employee_assignment` 查询 ✅ |
| `hse-driver-risk-center.js` | 已通过 `employee_assignment` 查询 ✅ |
| `hazards.js` | 已通过 `v_employee_current` 查询 ✅ |
| `training.js` | 使用独立关联字段，Sprint C 处理 |
| `violations.js` | 使用独立关联字段，Sprint C 处理 |
| `insurance.js` | 使用 `personnel_insurance` 表，独立模块 |
| `hse-dashboard.js` | 聚合统计，已使用 `employee_assignment` ✅ |
| `hse-executive-cockpit.js` | 已使用 `employee_assignment` ✅ |

### 5.3 视图处理

| 视图 | 当前状态 | Sprint B 处理 |
|---|---|---|
| `v_employee_current` | 基于 `employee_assignment`（sprint5_6 定义） | ✅ 无需修改 |
| `v_employee_org_full` | 基于 `hse_employee_relation`（v68 定义） | 重建为基于 `employee_assignment` |

---

## 六、业务模块影响

### 6.1 Sprint B 处理的模块

| 模块 | 文件 | 处理内容 | 验证方式 |
|---|---|---|---|
| 员工列表 | hse-employee.js | 读写切换到 employee_assignment | 查询员工列表，确认数据完整 |
| 员工档案 | hse-employee.js | 视图已对齐，无需修改 | 查询员工档案，确认组织信息 |
| 员工导入 | hse-employee-import-v2.js | 确认字段一致性 | 重新导入花名册验证 |
| 员工调岗 | hse-employee.js | 读写切换到 employee_assignment | 执行调岗操作，验证记录 |

### 6.2 Sprint C 处理的模块

| 模块 | 文件 | 当前问题 | Sprint C 处理 |
|---|---|---|---|
| 三违管理 | violations.js | `violator_id` 100% 为 NULL（890 条） | 按姓名+身份证回填 `employee.id` |
| 培训管理 | training.js | `employee_id` 100% 为 NULL（100 条） | 按姓名+身份证回填 `employee.id` |
| 风险画像 | hse-risk-profile.js | 已使用 `employee_id` ✅ | 无需处理（B-4 验证） |
| 预警中心 | hse-warning-center.js | 已使用 `employee_assignment` ✅ | 无需处理（B-4 验证） |
| 事故管理 | hse-accident-analysis.js | 已使用 `employee_assignment` ✅ | 无需处理（B-4 验证） |
| 隐患管理 | hazards.js | 已使用 `v_employee_current` ✅ | 无需处理（B-4 验证） |

### 6.3 不受影响的模块

| 模块 | 原因 |
|---|---|
| 车辆保险 | 使用 `personnel_insurance` 表，与 employee 表无直接关联 |
| 培训考核 | 使用 `personnel_assessment_summary` 表，独立模块 |
| 概览统计 | 使用 `employee_assignment` ✅ |

---

## 七、验证方案

### 7.1 迁移前验证（B-0 完成后）

| 验证项 | SQL | 预期结果 |
|---|---|---|
| employee 活跃数 | `SELECT COUNT(*) FROM employee WHERE is_deleted = false` | ≈ 1,285 |
| hse_employee_org 活跃数 | `SELECT COUNT(*) FROM hse_employee_org WHERE is_deleted = false AND is_current = true` | 1,285 |
| hse_employee_relation 活跃数 | `SELECT COUNT(*) FROM hse_employee_relation WHERE is_deleted = false AND is_current = true` | 1,304 |
| employee_assignment 活跃数 | `SELECT COUNT(*) FROM employee_assignment WHERE is_deleted = false` | 0（仅测试数据） |
| 数据完整性 | hse_employee_org 中的 employee_id 全部在 employee 表中存在 | 0 条孤立 |

### 7.2 迁移中验证（B-2 执行后）

| 验证项 | SQL | 预期结果 |
|---|---|---|
| 迁移记录数 | `SELECT COUNT(*) FROM employee_assignment WHERE created_by = 'system_migration_b2'` | ≈ 1,304 |
| 员工覆盖数 | `SELECT COUNT(DISTINCT employee_id) FROM employee_assignment WHERE created_by = 'system_migration_b2'` | ≈ 1,304 |
| org_unit_id 有效性 | `SELECT COUNT(*) FROM employee_assignment ea LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id WHERE ea.created_by = 'system_migration_b2' AND ou.id IS NULL` | 0 |
| operation_unit_id 有效性 | `SELECT COUNT(*) FROM employee_assignment ea LEFT JOIN hse_operation_unit opu ON ea.operation_unit_id = opu.id WHERE ea.created_by = 'system_migration_b2' AND ea.operation_unit_id IS NOT NULL AND opu.id IS NULL` | 0 |
| position_id 有效性 | `SELECT COUNT(*) FROM employee_assignment ea LEFT JOIN position p ON ea.position_id = p.id WHERE ea.created_by = 'system_migration_b2' AND ea.position_id IS NOT NULL AND p.id IS NULL` | 0 |
| 重复检查 | `SELECT employee_id, COUNT(*) FROM employee_assignment WHERE is_current = true AND is_deleted = false GROUP BY employee_id HAVING COUNT(*) > 1` | 0 |

### 7.3 迁移后验证（B-3 代码切换后）

| 验证项 | 方法 | 预期结果 |
|---|---|---|
| 员工列表 API | `GET /api/hse/employees` | 返回全量员工（≈1,285） |
| 员工档案 API | `GET /api/hse/employees/:id/profile` | 返回完整组织信息 |
| 员工统计 API | `GET /api/hse/employees/statistics` | 统计数据正确 |
| 调岗 API | `POST /api/hse/employees/:id/transfer` | 新记录写入 employee_assignment |
| v_employee_current 视图 | `SELECT COUNT(*) FROM v_employee_current` | ≈ 1,285 |

### 7.4 业务模块验证（B-4）

| 模块 | 验证方式 | 预期结果 |
|---|---|---|
| 员工列表 | 页面查看/ API 调用 | 显示全量员工，组织信息正确 |
| 员工档案 | 页面查看/ API 调用 | 显示任职关系、组织路径 |
| 风险画像 | API 调用 | 通过 employee_id 查询到员工风险数据 |
| 预警中心 | API 调用 | 人员下拉框显示全量员工 |
| 三违管理 | API 调用 | ⚠️ violator_id 仍为 NULL（Sprint C 处理） |
| 培训管理 | API 调用 | ⚠️ employee_id 仍为 NULL（Sprint C 处理） |

---

## 八、回滚方案

### 8.1 备份策略

**迁移前必做**：

```sql
-- 1. 备份 employee_assignment 当前状态
CREATE TABLE IF NOT EXISTS _backup_employee_assignment_b2 AS
SELECT * FROM employee_assignment WHERE is_deleted = false;

-- 2. 记录 hse_employee_org 和 hse_employee_relation 状态快照
CREATE TABLE IF NOT EXISTS _backup_heo_snapshot_b2 AS
SELECT * FROM hse_employee_org WHERE is_deleted = false AND is_current = true;

CREATE TABLE IF NOT EXISTS _backup_her_snapshot_b2 AS
SELECT * FROM hse_employee_relation WHERE is_deleted = false AND is_current = true;

-- 3. 记录 employee 表状态快照
CREATE TABLE IF NOT EXISTS _backup_employee_snapshot_b2 AS
SELECT * FROM employee WHERE is_deleted = false;
```

### 8.2 标记策略

所有迁移数据通过 `created_by = 'system_migration_b2'` 标记，便于精准回滚。

### 8.3 回滚策略

| 回滚场景 | 回滚操作 | 影响范围 |
|---|---|---|
| B-0 数据恢复失败 | `UPDATE employee SET is_deleted = true WHERE id IN (SELECT employee_id FROM _backup_heo_snapshot_b2)` | 仅 employee 表 |
| B-2 迁移数据异常 | `UPDATE employee_assignment SET is_deleted = true WHERE created_by = 'system_migration_b2'` | 仅迁移数据，不影响原始数据 |
| B-3 代码切换失败 | Git revert 代码变更，重启服务 | 仅代码层面 |
| 全量回滚 | 执行上述所有回滚操作 + Git revert | 恢复到 Sprint A 完成状态 |

### 8.4 回滚验证

```sql
-- 回滚后验证
SELECT
  'rollback_verify' AS phase,
  (SELECT COUNT(*) FROM employee_assignment WHERE created_by = 'system_migration_b2' AND is_deleted = false) AS migration_records,
  (SELECT COUNT(*) FROM employee WHERE is_deleted = false) AS active_employees;
-- 预期: migration_records = 0, active_employees = 回滚前数量
```

---

## 九、实施时间线

| 阶段 | 前置条件 | 产出 | 验证 |
|---|---|---|---|
| B-0 | Sprint A 已合并 | employee 表恢复 | 员工数 ≈ 1,285 |
| B-1 | B-0 完成 | 映射辅助表 | 映射覆盖率 > 95% |
| B-2 | B-1 完成 | employee_assignment 全量数据 | 记录数 ≈ 1,304 |
| B-3 | B-2 完成 + 验证通过 | hse-employee.js 代码切换 | API 测试通过 |
| B-4 | B-3 完成 | 验收报告 | 全模块验证通过 |

---

## 十、确认清单

请逐项确认后进入代码实施：

| 序号 | 确认项 | 选项 |
|---|---|---|
| 1 | B-0 数据恢复方案 | ✅ 从 hse_employee_org 反向恢复 employee 表 |
| 2 | B-1 组织映射方案 | ✅ group_id → hse_org_unit, region_id → hse_operation_unit |
| 3 | B-2 迁移数据源 | ① hse_employee_relation（1,304 条，推荐）<br>② hse_employee_org（1,285 条，需名称匹配） |
| 4 | B-3 代码改造范围 | ✅ 仅 hse-employee.js + personnel.js 冻结 |
| 5 | hse_employee_org 迁移后处理 | ① 标记 is_deprecated = true（推荐）<br>② 直接软删除 |
| 6 | personnel.js 处理方式 | ① 写入接口返回 410，读取接口改查 employee（推荐）<br>② 完全保留不动 |
| 7 | v_employee_org_full 视图 | ✅ 重建为基于 employee_assignment |
| 8 | 回滚策略 | ✅ 通过 created_by 标记精准回滚 |

---

*Sprint-B 人员模型统一实施方案编制完成。等待确认后进入代码实施。*