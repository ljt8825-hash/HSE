# TRAE Step 1：Sprint B 人员迁移数据基线复核 + 花名册关联现状诊断

> **文档版本**：v1.0
> **执行日期**：2026-07-28
> **执行环境**：本地开发环境（PostgreSQL，safety_dashboard）
> **执行人**：TRAE
> **对应 ACT**：ACT-01

---

## 1. 目标

1. **复核迁移源表行数**：查清前置审计记载的 hse_employee_relation=1304 条、hse_employee_org=1285 条 与 Dry Run 第二轮基线 her_current_count=3156 条的差异来源（约 2.4 倍）。
2. **诊断花名册与下游板块的关联现状**：确认三违 violator_id、培训 employee_id 等外键的 NULL 比例与根因（呼应"花名册导入后与其他业务板块无法交互"的核心痛点）。
3. **产出本 md 文档**，记录发现与证据。

---

## 2. 环境与权限

| 项目 | 状态 | 说明 |
|------|------|------|
| 数据库访问 | **是** | PostgreSQL 连接池初始化成功，可执行 SELECT 查询 |
| 数据库名 | safety_dashboard | 从 `server/config/db.js` 默认配置读取 |
| 代码访问 | **是** | 可读取 `F:\hse-dashboard` 下所有源码 |
| 写入权限 | 未使用 | 本次仅执行只读查询，不修改任何数据 |
| 执行方式 | 实际 SQL 查询 + 代码阅读 | 非静态分析，结果均来自真实查询 |

---

## 3. 执行动作与原始结果

### 3.1 数据库核对：源表行数

**执行 SQL（A 组：源表总数）：**

```sql
SELECT 'hse_employee_relation' AS src, count(*) AS cnt FROM hse_employee_relation
UNION ALL SELECT 'hse_employee_org', count(*) FROM hse_employee_org
UNION ALL SELECT 'employee_assignment', count(*) FROM employee_assignment
UNION ALL SELECT 'employee', count(*) FROM employee;
```

**原始结果：**

| src | cnt |
|-----|-----|
| hse_employee_relation | **1304** |
| hse_employee_org | **1285** |
| employee_assignment | 1305 |
| employee | 1361 |

---

**执行 SQL（B 组：hse_employee_relation 详细维度）：**

```sql
SELECT is_deleted, is_current, status, count(*) as cnt
FROM hse_employee_relation
GROUP BY is_deleted, is_current, status
ORDER BY is_deleted, is_current, status;
```

**原始结果：**

| is_deleted | is_current | status | cnt |
|------------|------------|--------|-----|
| false | true | active | **1304** |

> 结论：hse_employee_relation 全部 1304 条均为 `is_deleted=false AND is_current=true AND status='active'`，无软删除记录、无历史版本记录、无其他 status 值。

---

**执行 SQL（C 组：hse_employee_org 详细维度）：**

```sql
SELECT is_deleted, is_current, status, count(*) as cnt
FROM hse_employee_org
GROUP BY is_deleted, is_current, status
ORDER BY is_deleted, is_current, status;
```

**原始结果：**

| is_deleted | is_current | status | cnt |
|------------|------------|--------|-----|
| false | true | 在职 | **1285** |

---

**执行 SQL（D 组：employee_id 唯一性检查）：**

```sql
SELECT employee_id, count(*) as cnt
FROM hse_employee_relation
WHERE is_deleted = false
GROUP BY employee_id
HAVING count(*) > 1
ORDER BY cnt DESC
LIMIT 10;
```

**原始结果：** 返回 0 行（无重复 employee_id）。

---

**执行 SQL（E 组：各表独立员工数与并集）：**

```sql
-- 各表独立员工数
SELECT count(DISTINCT employee_id) as cnt FROM hse_employee_relation WHERE is_deleted = false;  -- 1304
SELECT count(DISTINCT employee_id) as cnt FROM hse_employee_org WHERE is_deleted = false;     -- 1285
SELECT count(DISTINCT employee_id) as cnt FROM employee_assignment WHERE is_deleted = false;  -- 1

-- her ∪ heo 并集员工数
SELECT count(DISTINCT employee_id) as cnt
FROM (
  SELECT employee_id FROM hse_employee_relation WHERE is_deleted = false
  UNION
  SELECT employee_id FROM hse_employee_org WHERE is_deleted = false
) t;
```

**原始结果：**

| 指标 | 数值 |
|------|------|
| hse_employee_relation 独立员工数 | 1304 |
| hse_employee_org 独立员工数 | 1285 |
| employee_assignment 独立员工数 | 1（TEST001 测试数据） |
| her ∪ heo 并集员工数 | **1343** |

---

**执行 SQL（F 组：hse_employee_relation 表结构）：**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'hse_employee_relation'
ORDER BY ordinal_position;
```

**原始结果（16 列）：**
`id, employee_id, org_unit_id, operation_unit_id, position_id, supervisor_id, is_current, status, start_date, end_date, is_primary, remark, created_by, created_at, updated_at, is_deleted`

> 无 `tenant_id` 字段，无多租户设计。

---

**执行 SQL（G 组：hse_employee_org 表结构与 tenant_id）：**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'hse_employee_org'
ORDER BY ordinal_position;
```

**原始结果（20 列）：**
`id, employee_id, group_id, region_id, enterprise_id, project_id, team_id, org_path, position_id, start_date, end_date, supervisor_id, status, is_current, change_reason, tenant_id, created_at, updated_at, is_deleted, is_deprecated`

```sql
SELECT tenant_id, count(*) as cnt FROM hse_employee_org GROUP BY tenant_id ORDER BY cnt DESC;
```

**原始结果：**

| tenant_id | cnt |
|-----------|-----|
| 1 | 1285 |

> hse_employee_org 有 tenant_id，但全部属于 tenant_id=1，不构成多租户数据膨胀。

---

**执行 SQL（H 组：employee 与 employee_assignment 当前状态）：**

```sql
SELECT is_deleted, count(*) as cnt FROM employee GROUP BY is_deleted ORDER BY is_deleted;
SELECT is_deleted, is_current, count(*) as cnt FROM employee_assignment GROUP BY is_deleted, is_current ORDER BY is_deleted, is_current;
```

**原始结果（employee）：**

| is_deleted | cnt |
|------------|-----|
| false | 1（TEST001） |
| true | 1360 |

**原始结果（employee_assignment）：**

| is_deleted | is_current | cnt |
|------------|------------|-----|
| false | true | 1 |
| true | true | 1304 |

> employee_assignment 的 1304 条软删除记录与 hse_employee_relation 的 1304 条记录数量完全对应，推测为 Sprint A 清空操作所致。

---

### 3.2 下游关联诊断

**执行 SQL（I 组：三违表 violator_id NULL 统计）：**

```sql
SELECT
  count(*) as total,
  count(violator_id) as has_violator_id,
  count(*) - count(violator_id) as null_violator_id,
  round((count(*) - count(violator_id)) * 100.0 / count(*), 2) as null_pct,
  count(violator_name) as has_violator_name,
  count(inspector_id) as has_inspector_id,
  count(handler_id) as has_handler_id,
  count(punisher_id) as has_punisher_id
FROM violation_records
WHERE is_deleted = false;
```

**原始结果：**

| total | has_violator_id | null_violator_id | null_pct | has_violator_name | has_inspector_id | has_handler_id | has_punisher_id |
|-------|-----------------|------------------|----------|-------------------|------------------|----------------|-----------------|
| **890** | **0** | **890** | **100.00%** | 217 | 0 | 0 | 0 |

> 关键数据：三违表 890 条记录的 `violator_id` **100% 为 NULL**。其中仅 217 条（24.4%）有 `violator_name`，其余 673 条（75.6%）连违章人姓名都为空。

---

**执行 SQL（J 组：培训表 employee_id NULL 统计）：**

```sql
SELECT
  count(*) as total,
  count(employee_id) as has_employee_id,
  count(*) - count(employee_id) as null_employee_id,
  round((count(*) - count(employee_id)) * 100.0 / count(*), 2) as null_pct,
  count(personnel_id) as has_personnel_id,
  count(name) as has_name,
  count(id_card) as has_id_card
FROM training_records
WHERE is_deleted = false;
```

**原始结果：**

| total | has_employee_id | null_employee_id | null_pct | has_personnel_id | has_name | has_id_card |
|-------|-----------------|------------------|----------|------------------|----------|-------------|
| **100** | **0** | **100** | **100.00%** | 0 | 100 | 100 |

> 关键数据：培训表 100 条记录的 `employee_id` 和 `personnel_id` **均为 100% NULL**。但 `name` 和 `id_card` 字段 100% 有值。

---

**执行 SQL（K 组：三违表样本数据）：**

```sql
SELECT id, violator_name, violator_id, inspector_name, inspector_id, handler_name, handler_id
FROM violation_records
WHERE is_deleted = false
LIMIT 5;
```

**原始结果：**

| id | violator_name | violator_id | inspector_name | inspector_id | handler_name | handler_id |
|----|---------------|-------------|----------------|--------------|--------------|------------|
| 3185 | NULL | NULL | 李真真 | NULL | NULL | NULL |
| 3186 | NULL | NULL | 李真真 | NULL | NULL | NULL |
| 3187 | NULL | NULL | 李真真 | NULL | NULL | NULL |
| 3188 | NULL | NULL | 李真真 | NULL | NULL | NULL |
| 3189 | NULL | NULL | 李真真 | NULL | NULL | NULL |

---

**执行 SQL（L 组：培训表样本数据）：**

```sql
SELECT id, name, employee_id, personnel_id, id_card, dept, position
FROM training_records
WHERE is_deleted = false
LIMIT 5;
```

**原始结果：**

| id | name | employee_id | personnel_id | id_card | dept | position |
|----|------|-------------|--------------|---------|------|----------|
| 798 | 演示人员001 | NULL | NULL | 110101202407210001 | 时集镇 | 安全员 |
| 799 | 演示人员002 | NULL | NULL | 110101202503230002 | 大柳镇 | 管理员 |
| 800 | 演示人员003 | NULL | NULL | 110101202503130003 | 相衙镇 | 司机 |
| 801 | 演示人员004 | NULL | NULL | 110101202401260004 | 大柳镇 | 安全员 |
| 802 | 演示人员005 | NULL | NULL | 110101202410110005 | 津城街道 | 转运站站长 |

---

**执行 SQL（M 组：数据创建时间范围）：**

```sql
-- 三违记录
SELECT min(created_at) as min_created, max(created_at) as max_created FROM violation_records WHERE is_deleted = false;
-- 培训记录
SELECT min(created_at) as min_created, max(created_at) as max_created FROM training_records WHERE is_deleted = false;
-- employee表
SELECT min(created_at) as min_created, max(created_at) as max_created FROM employee;
```

**原始结果：**

| 数据 | 最早创建时间 | 最晚创建时间 |
|------|-------------|-------------|
| 三违记录 | 2026-07-27 22:10:46 | 2026-07-27 22:14:49 |
| 培训记录 | 2026-07-27 23:29:04 | 2026-07-27 23:29:04 |
| employee 表 | 2026-07-20 12:46:25 | 2026-07-28 03:40:05 |

> 三违和培训数据均为 2026-07-27 单日批量生成（演示/测试数据），早于 employee 表最新记录时间。

---

### 3.3 代码阅读结果

#### 3.3.1 花名册导入代码（hse-employee-import-v2.js）

**文件**：`server/routes/hse-employee-import-v2.js`

**关键发现：**

| 代码位置 | 行为 |
|----------|------|
| L5 注释 | 明确模型为 `employee + employee_assignment`（统一任职关系表） |
| L941-950 | 正式入库时执行 `INSERT INTO employee`，12 个字段对齐 v59 结构 |
| L977/L990 | 正式入库时 `UPDATE/INSERT employee_assignment`，写入任职关系 |
| L1101-1129 | 清空人员功能：软删除 employee_assignment、employee、pending、batch 表 |

**结论**：V2 花名册导入正确写入 `employee + employee_assignment`，不写入 `hse_employee_org`，也**没有任何触发下游模块回填 violator_id/employee_id 的逻辑**。

---

#### 3.3.2 三违模块代码（violations.js）

**文件**：`server/routes/violations.js`

**关键发现：**

| 代码位置 | 行为 |
|----------|------|
| L30 | 表结构包含 `violator_id BIGINT`、`inspector_id BIGINT`、`handler_id BIGINT`、`punisher_id BIGINT` 字段 |
| L91 | 有 `idx_violation_records_violator_id` 索引 |
| L167 | `violator_id: data.violator_id || null` — 插入时接受前端传入的 violator_id，否则为 null |
| L522 | INSERT 语句包含 `violator_id` 字段，值来自前端提交 |
| L252-265 | 查询时通过 `v_employee_org_full` 视图用 `name = violator_name` 关联员工信息（仅用于判断违规类型，不回填 ID） |
| L925/L985 | 统计排名查询使用 `violator_id, violator_name` 分组，若 violator_id 为 NULL 则用 name 作为 key |

**结论**：
1. 三违表有人员 ID 字段（violator_id、inspector_id、handler_id、punisher_id），但**全部依赖前端传入**，后端不自动回填。
2. 查询时通过 `violator_name` 与 `v_employee_org_full` 的 `name` 做弱关联（仅用于违规类型判断，不回填 ID）。
3. 890 条记录中 673 条（75.6%）连 `violator_name` 都为空，完全无法关联。

---

#### 3.3.3 培训模块代码（training.js）

**文件**：`server/routes/training.js`

**关键发现：**

| 代码位置 | 行为 |
|----------|------|
| L62-63 | Sprint5.9 增加 `employee_id/trainer_id` 字段 |
| L169-170 | 数据格式化包含 `personnelId` 和 `employeeId` |
| L349-353 | INSERT 语句接受 `employee_id` 参数，默认为 `null`（`employee_id || null`） |
| L370-383 | UPDATE 语句也是直接使用传入的 `employee_id`，不自动回填 |
| L1113/L1121/L1150 | 部分高级查询（培训矩阵）已使用 `employee_id` 关联 `v_employee_current` 视图 |
| L1228-1237 | 有"人员解析"逻辑：从 employee_ids 数组查询 `v_employee_current` 获取姓名 |

**结论**：
1. 培训表有 `employee_id` 和 `personnel_id` 双字段，均依赖前端传入。
2. 现有 100 条演示数据的 employee_id 和 personnel_id 全部为 NULL。
3. 培训模块有部分高级查询功能依赖 `employee_id` 关联（如培训矩阵），**这些功能在当前数据状态下无法正常工作**。
4. name 和 id_card 字段 100% 有值，具备通过身份证号回查 employee.id 的条件。

---

## 4. 发现

### 4.1 源表行数发现（1304 vs 3156）

**当前环境实测：**

| 表 | 行数（实测） | 前置审计记载 | Dry Run R2 基线 | 差异 |
|----|-------------|-------------|----------------|------|
| hse_employee_relation | **1304** | 1304 ✅ | 3156 ❌ | 差 1852 条（2.4 倍） |
| hse_employee_org | **1285** | 1285 ✅ | — | — |

**关键证据：**
- 当前环境 `hse_employee_relation` 仅 1304 条，全部为 `is_deleted=false AND is_current=true AND status='active'`（见 §3.1 B 组结果）。
- 无软删除记录（is_deleted=true 的数量为 0）。
- 无历史版本记录（is_current=false 的数量为 0）。
- 无重复 employee_id（见 §3.1 D 组结果）。
- 无 tenant_id 多租户字段。

**3156 的可能来源推断（按可能性排序）：**

| 推断 | 可能性 | 证据支撑 |
|------|--------|---------|
| **不同环境数据量不同**：Dry Run 在测试环境执行，测试环境的 hse_employee_relation 数据量更大（可能有额外的测试数据生成脚本或多次导入） | **高** | 当前环境 1304 与 Pre-risk 审计一致，而 3156 仅出现在 Dry Run R2 报告中；两报告执行环境不同（生产审计 vs 测试环境 Dry Run） |
| 1304 + 1285 + 其他表联合计数 | 中低 | 1304+1285=2589，仍不等于 3156；her∪heo 并集 1343 员工也不等于 |
| 笛卡尔积 / 多次导入导致重复 | 低 | 当前环境无重复 employee_id；Dry Run 环境若有重复则已被 Step 1.5 脏数据检查捕获（报告显示 duplicate_count=0） |
| 包含已删除记录 | 低 | Dry Run R2 的基线定义为 `is_current=true AND is_deleted=false`，应排除已删除 |

**结论陈述（事实）：**
- 当前本地环境 `hse_employee_relation = 1304 条`，与《Sprint-B-Pre 实施前风险确认报告》§1.2 记载一致。
- Dry Run R2 报告中 `her_current_count = 3156` 与当前环境差异巨大（差 1852 条），**无文档对该差异做出解释**。
- 3156 最可能来源于 Dry Run 测试环境的不同数据量（测试环境可能有额外的数据生成）。
- **生产迁移前必须在生产环境重新执行基线确认，禁止直接沿用 Dry Run 的 3156 作为生产基线**。

---

### 4.2 下游关联 NULL 根因发现

**三违模块（violation_records）：**

| 指标 | 数值 | 比例 |
|------|------|------|
| 总记录数 | 890 | — |
| violator_id 为 NULL | 890 | **100.00%** |
| violator_name 为 NULL | 673 | 75.6% |
| inspector_id 为 NULL | 890 | 100.00% |
| handler_id 为 NULL | 890 | 100.00% |

**培训模块（training_records）：**

| 指标 | 数值 | 比例 |
|------|------|------|
| 总记录数 | 100 | — |
| employee_id 为 NULL | 100 | **100.00%** |
| personnel_id 为 NULL | 100 | 100.00% |
| name 有值 | 100 | 100% |
| id_card 有值 | 100 | 100% |

**根因分析（基于代码阅读 + 数据验证）：**

1. **架构层面：后端不自动回填，完全依赖前端传入 ID**
   - 三违 INSERT（violations.js L167/L522）：`violator_id: data.violator_id || null`，后端不做任何人员匹配回填。
   - 培训 INSERT（training.js L349-353）：`employee_id || null`，同样依赖前端传入。

2. **历史遗留：早期数据通过批量导入/演示生成，未经过人员选择流程**
   - 三违 890 条数据均为 2026-07-27 单日批量生成（见 §3.2 M 组结果），其中 75.6% 连 violator_name 都为空。
   - 培训 100 条数据同样为 2026-07-27 单日生成，有 name 和 id_card 但无 employee_id。

3. **花名册导入与下游模块无联动机制**
   - V2 花名册导入（hse-employee-import-v2.js）仅写入 employee + employee_assignment，无触发下游模块回填的逻辑。
   - 下游模块（三违、培训）也没有"根据姓名/身份证号自动回查 employee.id 并回填外键"的任务或接口。

4. **查询层的弱关联不足以支撑业务联动**
   - 三违查询通过 `violator_name` 与 `v_employee_org_full.name` 做字符串匹配（violations.js L252-265），仅用于判断违规类型，不回填 ID。
   - 培训模块部分高级查询（培训矩阵）依赖 `employee_id` 关联（training.js L1113/L1150），当前数据下这些功能完全无法工作。

---

## 5. 结论

### 5.1 基线是否准确？

| 基线来源 | 数值 | 当前环境验证 | 结论 |
|----------|------|-------------|------|
| Pre-risk 审计（生产审计） | her=1304 | ✅ 一致 | **当前环境可信** |
| 前置审计清单（生产审计） | heo=1285 | ✅ 一致 | **当前环境可信** |
| Dry Run R2 基线（测试环境） | her_current_count=3156 | ❌ 差 2.4 倍 | **环境不一致，不能直接沿用** |

**结论**：
- 当前环境基线（her=1304, heo=1285）与前置审计文档一致，数据可靠。
- Dry Run R2 的 3156 基线来自不同测试环境，**生产迁移前必须在生产环境重新执行基线确认**。
- 3156 的差异原因需进一步在 Dry Run 测试环境中排查（是否有额外数据生成脚本、是否包含历史版本等）。

### 5.2 下游关联是否断裂？

**结论：完全断裂，严重程度为 P0 级。**

- 三违模块：violator_id 100% 为 NULL，且 75.6% 的记录连违章人姓名都为空。
- 培训模块：employee_id 100% 为 NULL，虽有 name 和 id_card 但未关联。
- 花名册导入后不触发下游回填，下游模块也无自动回填机制。
- 培训矩阵等依赖 employee_id 的高级功能当前不可用。
- 这直接印证了用户背景中"花名册导入后与其他业务板块无法交互"的核心痛点。

---

## 6. 风险与建议

### 6.1 数据基线风险

| 风险 | 等级 | 建议 |
|------|------|------|
| Dry Run 基线 3156 与生产审计 1304 不一致，若直接沿用将导致迁移量预估错误、回滚量错误、"偏差 0%"结论失效 | **P0** | 1. 生产迁移前必须在生产库执行 Runbook Check 0.12，确认真实 her_current_count；2. 在 Dry Run 测试环境调查 3156 的数据来源（是否有额外数据生成脚本、是否包含 is_deleted 记录等），并补充差异归因文档 |
| migration_baseline 表在当前环境不存在 | P2 | 确认 Dry Run 环境的 baseline 表是由 Runbook 的 Step 0 创建，还是由其他脚本创建 |

### 6.2 下游关联风险

| 风险 | 等级 | 建议 |
|------|------|------|
| 三违 890 条记录 violator_id 100% NULL，人员档案与三违记录完全脱节 | **P0** | 开发"三违人员关联回填"功能：1. 对于有 violator_name 的 217 条，通过姓名 + 身份证/工号回查 employee.id 并回填；2. 对于无姓名的 673 条，标记为"待完善"，需业务部门补充 |
| 培训 100 条记录 employee_id 100% NULL，培训矩阵等功能不可用 | **P1** | 开发"培训人员关联回填"功能：利用已有的 id_card 字段，通过身份证号哈希匹配 employee.id_card_hash，批量回填 employee_id。回填成功率预计可达 100%（100 条都有 id_card） |
| 未来新增三违/培训记录仍可能不填 violator_id/employee_id | P1 | 1. 前端 EmployeeSelector 组件已存在（被 7 个业务页面引用），确保各模块新增/编辑时强制通过选择器选择人员，禁止手动输入姓名；2. 后端增加校验：若提交了 violator_name 但未提交 violator_id，应自动尝试匹配并回填 |
| 花名册导入后不触发下游联动 | P2 | 长期可考虑在导入完成后增加"下游数据修复任务"，自动扫描各业务模块的 NULL 外键并尝试回填 |

### 6.3 对后续迁移的建议

1. **B-2 迁移基线值必须在生产环境重新确认**，不得直接使用 Dry Run 的 3156。
2. **Sprint C 应将"下游模块人员外键回填"纳入范围**，否则人员中心重构的价值无法传递到业务板块。
3. **培训模块的回填优先级高于三违**——因为培训数据有 id_card，可精确匹配，回填成功率高（预计 100%）。
4. **三违模块需分层处理**：有姓名的 217 条可尝试模糊匹配，无姓名的 673 条需业务侧补数据。

---

## 7. 待办 / 下一步

1. **需验证者确认**：当前环境的 1304 条是否为生产基线，还是测试环境数据。（若为测试环境，需明确生产环境的真实数据量）
2. **待执行**：在 Dry Run 测试环境调查 3156 的数据来源（需访问 Dry Run 环境的数据库）。
3. **待执行**：Sprint C 中开发培训记录的 employee_id 回填功能（基于 id_card 匹配）。
4. **待执行**：Sprint C 中开发三违记录的 violator_id 回填方案（基于姓名匹配 + 业务补数据）。
5. **待确认**：是否将"下游外键回填"作为 Sprint C 的正式工作项，还是作为独立的 Sprint D 任务。

---

## 8. 证据索引

| 结论 | 证据位置 |
|------|---------|
| hse_employee_relation = 1304 条 | §3.1 A 组查询 / `_step1_check.js` 执行结果 |
| hse_employee_relation 全部为 is_deleted=false, is_current=true, status=active | §3.1 B 组查询 |
| hse_employee_org = 1285 条，status='在职' | §3.1 C 组查询 |
| 无重复 employee_id | §3.1 D 组查询 |
| her ∪ heo = 1343 独立员工 | §3.1 E 组查询 |
| hse_employee_relation 无 tenant_id 字段 | §3.1 F 组查询 |
| 三违 violator_id 100% NULL（890/890） | §3.2 I 组查询 |
| 三违 violator_name 仅 217 条有值（24.4%） | §3.2 I 组查询 |
| 培训 employee_id 100% NULL（100/100） | §3.2 J 组查询 |
| 培训 name 和 id_card 100% 有值 | §3.2 J 组查询 |
| 三违 890 条数据均为 2026-07-27 单日生成 | §3.2 M 组查询 |
| 培训 100 条数据均为 2026-07-27 单日生成 | §3.2 M 组查询 |
| V2 花名册导入写入 employee + employee_assignment | `server/routes/hse-employee-import-v2.js` L5, L941-990 |
| 三违 INSERT 不自动回填 violator_id | `server/routes/violations.js` L167, L522 |
| 三违查询通过 violator_name 弱关联 v_employee_org_full | `server/routes/violations.js` L252-265 |
| 培训 INSERT 不自动回填 employee_id | `server/routes/training.js` L349-353 |
| 培训高级查询依赖 employee_id 关联 | `server/routes/training.js` L1113, L1150 |
| Pre-risk 审计记载 her=1304 | `docs/Sprint-B-Pre实施前风险确认报告.md` §1.2 |
| Dry Run R2 记载 her_current_count=3156 | `docs/Sprint-B-v2.1-DryRun-Round2-Report.md` §3.4 |
| 前置审计记载三违 890 条 100% NULL | `docs/Sprint-B人员模型统一前置审计清单.md` §8.1 |
| 前置审计记载培训 100 条 100% NULL | `docs/Sprint-B人员模型统一前置审计清单.md` §8.2 |

---

**文档结束。**
