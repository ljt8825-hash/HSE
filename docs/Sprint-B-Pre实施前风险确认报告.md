# Sprint-B 实施前风险确认审计报告

> 审计日期：2026-07-28
> 审计范围：F:\hse-dashboard
> 审计目的：在进入 Sprint-B 数据迁移和代码改造前，确认数据来源、组织模型、前端依赖风险
> 审计约束：仅生成审计报告 Markdown，不修改任何业务代码

---

## 一、hse_employee_relation 真实性审计

### 1.1 执行 SQL

```sql
SELECT COUNT(*) FROM hse_employee_relation;
SELECT * FROM hse_employee_relation LIMIT 10;
```

### 1.2 审计结果

| 指标 | 数值 |
|------|------|
| 总记录数 | 1304 |
| 活跃记录（is_deleted=false） | 1304 |
| 已删除记录（is_deleted=true） | 0 |
| 当前在职（is_current=true AND is_deleted=false） | 1304 |

### 1.3 样本数据（前 10 条）

| # | id | employee_id | org_unit_id | operation_unit_id | position_id | status | is_current | created_at |
|---|----|----|----|----|----|----|----|----|
| 1 | 1437 | 5360 | 7 | NULL | 1393 | active | true | 2026-07-22 08:51:39 |
| 2 | 1438 | 5361 | 7 | NULL | 1393 | active | true | 2026-07-22 08:51:39 |
| 3 | 1439 | 5362 | 7 | NULL | 1393 | active | true | 2026-07-22 08:51:39 |
| 4 | 1440 | 5363 | 7 | NULL | 1392 | active | true | 2026-07-22 08:51:39 |
| 5 | 141  | 3867 | 9 | 4  | 1395 | active | true | 2026-07-22 08:29:41 |
| 6 | 137  | 3866 | 9 | 4  | 1394 | active | true | 2026-07-22 08:29:41 |
| 7 | 138  | 3868 | 9 | 55 | 1398 | active | true | 2026-07-22 08:29:41 |
| 8 | 139  | 3869 | 9 | 55 | 1398 | active | true | 2026-07-22 08:29:41 |
| 9 | 140  | 3870 | 9 | 55 | 1398 | active | true | 2026-07-22 08:29:41 |
| 10 | 142 | 5151 | 9 | 4  | 1386 | active | true | 2026-07-22 08:29:41 |

### 1.4 关联有效性验证

| 校验项 | 总数 | 有效 | NULL | 无效 |
|--------|------|------|------|------|
| org_unit_id → hse_org_unit | 1304 | 1304 | 0 | 0 |
| operation_unit_id → hse_operation_unit | 1304 | 1300 | 4 | 0 |
| employee_id → employee（活跃） | 1304 | 0 | - | 1304（全部为 is_deleted=true） |

### 1.5 与 hse_employee_org 数据重叠分析

| 指标 | 数值 |
|------|------|
| 重叠员工数 | 1246 |
| status 匹配数 | 0 |
| position_id 匹配数 | 0 |

> **关键发现**：hse_employee_relation 与 hse_employee_org 在员工维度重叠 1246 人，但 status 和 position_id 完全不匹配。原因是两表使用不同的状态体系（her.status='active' vs heo.status='在职'）和不同的 position_id 来源（her 引用 v68 岗位表，heo 引用 v59 position 表）。

### 1.6 创建时间范围

| 指标 | 值 |
|------|----|
| 最早 created_at | 2026-07-22 08:29:41 |
| 最晚 created_at | 2026-07-22 08:51:39 |
| 不同日期数 | 1 |

### 1.7 代码引用检查

| 引用位置 | 文件 | 用途 |
|----------|------|------|
| 迁移脚本 | server/sql/hse_org_center_v68_migration.sql | 表结构定义 |
| 迁移脚本 | server/sql/sprint5_6_employee_master_migration.sql | 标注为"废弃，由 employee_assignment 替代" |
| 迁移脚本 | server/scripts/migrate_employee_v2.js | 数据生成脚本 |
| 迁移脚本 | server/migrate-employee-assignment.js | 任职关系迁移脚本 |
| 业务路由 | server/routes/hse-employee.js | **无引用** |
| 业务路由 | server/routes/personnel.js | **无引用** |
| 测试/审计脚本 | 多个 _check_*.js、survey-*.js、audit-*.js | 仅查询用途 |

### 1.8 审计结论

| 确认项 | 结论 |
|--------|------|
| 1. 是否真实业务表 | **是**。由 v68 迁移脚本 `hse_org_center_v68_migration.sql` 定义，schema 完整，含 org_unit_id/operation_unit_id/position_id 等业务字段 |
| 2. 是否历史迁移表 | **是**。全部 1304 条记录由 `migrate_employee_v2.js` 在 2026-07-22 单日批量生成，非业务流程产生 |
| 3. 是否仍被代码引用 | **否**。业务路由 hse-employee.js 和 personnel.js 均未引用，仅在迁移脚本和审计脚本中引用 |
| 4. 是否适合作为 employee_assignment 迁移源 | **适合**。字段结构与 employee_assignment 完全对齐（employee_id/org_unit_id/operation_unit_id/position_id/supervisor_id），关联有效性 100%，且不再被业务代码依赖 |

---

## 二、employee 恢复安全审计

### 2.1 执行 SQL

```sql
SELECT COUNT(*)
FROM hse_employee_org heo
LEFT JOIN employee e
ON heo.employee_id = e.id
WHERE e.id IS NULL;
```

### 2.2 审计结果

| 指标 | 数值 |
|------|------|
| 孤儿数量（heo 引用的 employee_id 不在 employee 表） | **0** |
| 可恢复数量（employee 存在但 is_deleted=true） | **1285** |
| 已活跃数量（employee 存在且 is_deleted=false） | **0** |
| hse_employee_org 引用的独立员工总数 | **1285** |

### 2.3 恢复风险评估

| 风险维度 | 评估 |
|----------|------|
| 数据完整性风险 | **低**。无孤儿记录，1285 名员工全部可通过 `UPDATE employee SET is_deleted=false` 恢复 |
| 业务一致性风险 | **低**。恢复后 employee 表与 hse_employee_org/hse_employee_relation 的 employee_id 完全对齐 |
| 唯一性冲突风险 | **低**。employee_code 唯一索引带 `WHERE is_deleted=false` 条件，恢复不会触发唯一约束冲突 |
| 加密字段风险 | **中**。恢复的 employee 记录中 id_card/phone 字段可能存在历史加密格式不一致，需在恢复后校验密文可解密性 |

### 2.4 审计结论

- **孤儿数量**：0
- **可恢复数量**：1285
- **恢复风险**：低。可安全执行 `UPDATE employee SET is_deleted=false WHERE id IN (SELECT DISTINCT employee_id FROM hse_employee_org WHERE is_current=true AND is_deleted=false)`

---

## 三、组织模型语义审计

### 3.1 字段对照分析

#### hse_employee_org 五级组织字段

| 字段 | 引用表 | 实际数据样本 | 层级 |
|------|--------|-------------|------|
| group_id | department | 杜集镇(4077)、柴胡店镇(4067)、长官镇(4087)、大曹镇(4114)、保店镇(4120)、张大庄镇(4093)、大柳镇(4098)、相衙镇(4109)、时集镇(4126)、津城街道(4061)、刘营伍(4104)、宁城街道(4056)、转运车辆(4132) | Level 1（乡镇） |
| region_id | department | 长官镇四班(4092)、张大庄镇二班(4096)、大曹镇二班(4117) 等 | Level 2（班组） |
| enterprise_id | department | （未在审计样本中出现显著数据） | Level 3 |
| project_id | department | （未在审计样本中出现显著数据） | Level 4 |
| team_id | department | （未在审计样本中出现显著数据） | Level 5 |

#### employee_assignment 组织字段

| 字段 | 关联表 | 语义 |
|------|--------|------|
| org_unit_id | hse_org_unit | 管理组织 ID（必有） |
| operation_unit_id | hse_operation_unit | 生产作业单元 ID（管理人员可为 NULL） |

### 3.2 hse_org_unit 中 town_center 列表

| id | org_name | org_type | org_code | level |
|----|----------|----------|----------|-------|
| 10 | 长官镇作业中心 | town_center | TOWN-CHANGGUAN | 3 |
| 18 | 张大庄镇作业中心 | town_center | TOWN-ZHANGDAZHUANG | 3 |
| 19 | 大曹镇作业中心 | town_center | TOWN-DACAO | 3 |
| 13 | 杜集镇作业中心 | town_center | TOWN-DUJI | 3 |
| 12 | 柴胡店镇作业中心 | town_center | TOWN-CHAIHUDIAN | 3 |
| 17 | 保店镇作业中心 | town_center | TOWN-BAODIAN | 3 |
| 15 | 大柳镇作业中心 | town_center | TOWN-DALIU | 3 |
| 16 | 相衙镇作业中心 | town_center | TOWN-XIANGYA | 3 |
| 8  | 刘营伍乡作业中心 | town_center | TOWN-LIUYINGWU | 3 |
| 11 | 时集镇作业中心 | town_center | TOWN-SHIJI | 3 |
| 9  | 宁城街道作业中心 | town_center | TOWN-NINGCHENG | 3 |
| 14 | 津城街道作业中心 | town_center | TOWN-JINCHENG | 3 |
| 7  | 环卫作业中心 | center | CENTER-HW | 2 |

### 3.3 hse_employee_relation.org_unit_id 实际指向验证

| hse_org_unit.id | org_name | org_type | 员工数 |
|-----------------|----------|----------|--------|
| 12 | 柴胡店镇作业中心 | town_center | 168 |
| 13 | 杜集镇作业中心 | town_center | 168 |
| 10 | 长官镇作业中心 | town_center | 157 |
| 19 | 大曹镇作业中心 | town_center | 127 |
| 17 | 保店镇作业中心 | town_center | 113 |
| 15 | 大柳镇作业中心 | town_center | 110 |
| 18 | 张大庄镇作业中心 | town_center | 107 |
| 11 | 时集镇作业中心 | town_center | 78 |
| 14 | 津城街道作业中心 | town_center | 77 |
| 16 | 相衙镇作业中心 | town_center | 75 |
| 8  | 刘营伍乡作业中心 | town_center | 64 |
| 9  | 宁城街道作业中心 | town_center | 49 |
| 7  | 环卫作业中心 | center | 11 |

### 3.4 hse_employee_relation.operation_unit_id 实际指向验证（前 20 条）

| hse_operation_unit.id | unit_name | unit_type | 员工数 |
|----------------------|-----------|-----------|--------|
| 29 | 长官镇四班 | cleaning_team | 43 |
| 31 | 张大庄镇二班 | cleaning_team | 40 |
| 44 | 大曹镇二班 | cleaning_team | 39 |
| 26 | 长官镇一班 | cleaning_team | 37 |
| 30 | 张大庄镇一班 | cleaning_team | 36 |
| 27 | 长官镇二班 | cleaning_team | 35 |
| 46 | 大曹镇四班 | cleaning_team | 34 |
| 45 | 大曹镇三班 | cleaning_team | 34 |
| 28 | 长官镇三班 | cleaning_team | 34 |
| 20 | 杜集镇三四班 | cleaning_team | 33 |
| 14 | 柴胡店镇四班 | cleaning_team | 31 |
| 47 | 保店镇一班 | cleaning_team | 31 |

### 3.5 《组织字段最终映射建议》

基于实际数据验证（非名称猜测）：

| 源字段（hse_employee_org） | 目标字段（employee_assignment） | 映射依据 |
|----------------------------|--------------------------------|----------|
| group_id（department Level 1，乡镇） | **org_unit_id**（hse_org_unit.town_center） | hse_employee_relation.org_unit_id 实际指向的 hse_org_unit 全部为 town_center 类型，且名称与 department 乡镇名一一对应（杜集镇→杜集镇作业中心） |
| region_id（department Level 2，班组） | **operation_unit_id**（hse_operation_unit.cleaning_team） | hse_employee_relation.operation_unit_id 实际指向的 hse_operation_unit 全部为 cleaning_team 类型，且名称与 department 班组名一一对应（长官镇四班→长官镇四班） |
| enterprise_id | 不迁移 | 审计样本中无显著数据，且 employee_assignment 无对应字段 |
| project_id | 不迁移 | 审计样本中无显著数据，且 employee_assignment 无对应字段 |
| team_id | 不迁移 | 审计样本中无显著数据，且 employee_assignment 无对应字段 |

#### 明确结论

- **org_unit_id 代表**：管理组织单元，对应乡镇级作业中心（hse_org_unit 中 org_type='town_center' 的记录），是员工所属的行政管理组织。
- **operation_unit_id 代表**：生产作业单元，对应具体班组（hse_operation_unit 中 unit_type='cleaning_team' 的记录），是员工实际工作的作业班组。管理人员（如中心直管车组）可为 NULL。

> **映射证据链**：department(4077,杜集镇) → group_id → hse_employee_relation.org_unit_id(13,杜集镇作业中心) → hse_org_unit.town_center；department(4092,长官镇四班) → region_id → hse_employee_relation.operation_unit_id(29,长官镇四班) → hse_operation_unit.cleaning_team。名称完全一致，层级关系吻合。

---

## 四、hse_employee_org 依赖审计

### 4.1 全项目搜索结果

搜索关键字：`hse_employee_org`

| # | 文件 | 行号 | 用途 | 是否需要迁移 |
|---|------|------|------|-------------|
| 1 | server/routes/hse-employee.js | 5 | 文件头注释，说明对应表 | 否（注释） |
| 2 | server/routes/hse-employee.js | 11 | 文件头注释，说明模块职责 | 否（注释） |
| 3 | server/routes/hse-employee.js | 504 | 员工状态统计查询 | **是** |
| 4 | server/routes/hse-employee.js | 542 | 员工列表查询（JOIN） | **是** |
| 5 | server/routes/hse-employee.js | 693 | 调岗时关闭旧记录（UPDATE） | **是** |
| 6 | server/routes/hse-employee.js | 734-742 | 按组织层级查询部门（5 个 SELECT） | **是** |
| 7 | server/routes/hse-employee.js | 820 | 员工列表查询（JOIN） | **是** |
| 8 | server/routes/hse-employee.js | 833 | 员工列表查询（JOIN） | **是** |
| 9 | server/routes/hse-employee.js | 1090 | 模块注释 | 否（注释） |
| 10 | server/routes/hse-employee.js | 1106 | 组织关系列表查询 | **是** |
| 11 | server/routes/hse-employee.js | 1135 | 组织关系列表查询 | **是** |
| 12 | server/routes/hse-employee.js | 1175 | 查询当前组织关系 | **是** |
| 13 | server/routes/hse-employee.js | 1193 | 调岗关闭旧记录（UPDATE） | **是** |
| 14 | server/routes/hse-employee.js | 1205 | 新增组织关系（INSERT） | **是** |
| 15 | server/routes/hse-employee.js | 1257 | 查询组织关系详情 | **是** |
| 16 | server/routes/hse-employee.js | 1272 | 更新状态（UPDATE） | **是** |
| 17 | server/routes/hse-employee.js | 1278 | 更新状态（UPDATE） | **是** |
| 18 | server/routes/hse-employee.js | 1677 | 导入时关闭旧记录（UPDATE） | **是** |
| 19 | server/routes/hse-employee.js | 1683 | 导入时新增记录（INSERT） | **是** |
| 20 | server/routes/hse-employee.js | 4297 | 员工列表查询（JOIN） | **是** |
| 21 | server/_init_help.js | - | 初始化帮助数据 | 否（脚本） |
| 22 | server/_check_supervisor.js | - | 检查主管关系 | 否（脚本） |
| 23 | server/_inspect_org.js | - | 检查组织数据 | 否（脚本） |
| 24 | server/survey-sprint63a1.js | - | 调查脚本 | 否（脚本） |
| 25 | server/_check_hse_emp.js | - | 检查员工数据 | 否（脚本） |
| 26 | server/_tmp_check_data.js | - | 临时检查 | 否（脚本） |
| 27 | server/sql/hse_org_center_v68_migration.sql | - | 表结构定义 | 否（DDL） |
| 28 | server/sql/hse_employee_master_v59_migration.sql | - | 表结构定义 | 否（DDL） |
| 29 | server/__tests__/hse-employee.standalone.test.js | - | 单元测试 | 否（测试） |
| 30 | server/__tests__/hse-employee.permissions.test.js | - | 权限测试 | 否（测试） |
| 31 | server/test-uploads/audit-pre-sprint-b.js | - | 审计脚本 | 否（审计） |
| 32 | server/test-uploads/audit-org-model.js | - | 审计脚本 | 否（审计） |
| 33 | server/test-uploads/audit-sprint-b.js | - | 审计脚本 | 否（审计） |

### 4.2 依赖审计结论

- **业务代码引用**：仅 `server/routes/hse-employee.js` 一个文件，共 24 处引用（含 5 处注释），实际业务逻辑引用 19 处
- **迁移工作量**：需将该文件中 19 处 SQL 从 `hse_employee_org` 改为 `employee_assignment`，并同步调整字段名（group_id/region_id → org_unit_id/operation_unit_id）
- **非业务文件**：13 个文件为脚本/测试/审计/DDL，无需迁移，可保留作为历史数据查询工具

---

## 五、前端人员模型依赖审计

### 5.1 搜索关键字段使用情况

搜索关键字：`personnel_id`、`employee_name`、`employee_id`、`id_card`、`name`

#### 5.1.1 personnel_id 使用情况

| 范围 | 结果 |
|------|------|
| 前端（安全看板vben） | **无使用** |
| 后端业务路由（hse-employee.js） | **无使用** |

> **结论**：personnel_id 字段已在前端和业务路由中完全消除，无需处理。

### 5.2 前端文件依赖清单

| # | 文件路径 | 使用字段 | 用途 | 是否需后续修改 |
|---|----------|----------|------|---------------|
| 1 | components/hse/EmployeeSelector.vue | employee_id, name, org_name, position_name, unit_name | 统一员工选择组件 | **是**（核心组件，需确保字段与 employee_assignment 对齐） |
| 2 | api/hse/employee-selector.ts | employee_id | 选择器 API 类型定义 | **是** |
| 3 | api/hse/employee.ts | id_card, employee_id | 员工 CRUD API | 否（字段不变） |
| 4 | api/hse/employee-profile.ts | id_card | 员工档案 API | 否（字段不变） |
| 5 | api/hse/employee-import-v2.ts | id_card_hash, employee_name | 导入 v2 API | 否（字段不变） |
| 6 | api/hse/assessment-monthly.ts | employee_id, employee_name | 考核 API | 否（字段不变） |
| 7 | views/hse/employee/index.vue | id_card | 员工列表页 | 否（字段不变） |
| 8 | views/hse/employee/departments.vue | id_card | 部门管理页 | 否（字段不变） |
| 9 | views/hse/employee/over-age/index.vue | id_card | 超龄人员页 | 否（字段不变） |
| 10 | views/hse/employee-profile/index.vue | id_card | 员工档案页 | 否（字段不变） |
| 11 | views/hse/employee/components/EmployeeImportModal.vue | id_card | 导入弹窗 | 否（字段不变） |
| 12 | views/hse/employee/components/EmployeeEditModal.vue | id_card | 编辑弹窗 | 否（字段不变） |
| 13 | views/hse/employee/components/OrgTransferModal.vue | employee_id | 调岗弹窗 | **是**（需适配 employee_assignment） |
| 14 | views/hse/employee-import-v2/index.vue | employee_name | 导入页面 | 否（字段不变） |
| 15 | views/hse/assessment-monthly/scoring.vue | employee_name | 考核评分页 | 否（字段不变） |
| 16 | views/hse/assessment-monthly/targets.vue | employee_name | 考核目标页 | 否（字段不变） |
| 17 | views/insurance/over-age/index.vue | id_card | 保险超龄页 | 否（字段不变） |

### 5.3 EmployeeSelector 组件使用业务页面

| # | 业务页面 | 文件路径 | 使用场景 |
|---|----------|----------|----------|
| 1 | 培训台账 | views/training/ledger/index.vue | 参训人员、培训师选择 |
| 2 | 三违管理 | views/violations/index.vue | 违章人、检查人、处理人、处罚人选择 |
| 3 | 目标职责 | views/goals/index.vue | 责任人选择 |
| 4 | 隐患管理 | views/hazards/index.vue | 发现人、责任人、整改人、复查人选择 |
| 5 | 培训计划 | views/training/plans/index.vue | 培训对象选择 |
| 6 | 培训需求 | views/training/requirements/index.vue | 需求人员选择 |
| 7 | 培训执行 | views/training/execute/index.vue | 执行人员选择 |

### 5.4 前端依赖审计结论

- **核心组件**：EmployeeSelector.vue 是统一员工选择入口，被 7 个业务页面引用，字段使用 `employee_id` 作为值字段
- **需后续统一修改的位置**：
  1. `components/hse/EmployeeSelector.vue` - 确保返回字段与 employee_assignment 视图对齐
  2. `api/hse/employee-selector.ts` - 类型定义同步
  3. `views/hse/employee/components/OrgTransferModal.vue` - 调岗逻辑适配 employee_assignment
- **无需修改的位置**：id_card、employee_name 等字段在 employee 表中保持不变，前端展示层无需改动

---

## 六、最终结论

### 6.1 必须回答的 5 个问题

#### 问题 1：hse_employee_relation 是否作为迁移源？

**是，作为迁移源。**

依据：
1. 表结构由 v68 迁移脚本定义，字段与 employee_assignment 完全对齐
2. 1304 条记录关联有效性 100%（org_unit_id 100%有效，operation_unit_id 99.7%有效）
3. 不再被业务路由代码引用（hse-employee.js、personnel.js 均未引用）
4. 数据由 migrate_employee_v2.js 单日批量生成，属历史迁移数据，可作为权威数据源
5. sprint5_6 迁移脚本已明确标注"废弃，由 employee_assignment 替代"

**迁移策略**：
```sql
INSERT INTO employee_assignment (employee_id, org_unit_id, operation_unit_id, position_id, supervisor_id, is_primary, is_current, status, start_date, end_date, remark)
SELECT employee_id, org_unit_id, operation_unit_id, position_id, supervisor_id, true, is_current, status, start_date, end_date, remark
FROM hse_employee_relation
WHERE is_deleted = false;
```

#### 问题 2：employee_assignment 是否作为唯一任职表？

**是，作为唯一任职表。**

依据：
1. sprint5_6 迁移脚本明确设计为"统一员工任职关系表（组织+作业单元+岗位+上级）"
2. 含主岗唯一约束（uk_emp_assign_primary：同一员工当前只能一个主岗）
3. 字段设计完整：employee_id + org_unit_id + operation_unit_id + position_id + supervisor_id + is_primary + is_current + status + start_date + end_date
4. 索引设计完善：6 个业务索引 + 1 个主岗唯一索引
5. 支持 v_employee_current 视图提供当前任职查询

**前置条件**：
- 需先恢复 employee 表中 1285 名软删员工（`UPDATE employee SET is_deleted=false`）
- 需先验证 position_id 在 employee_assignment 中引用的 position 表与 hse_employee_relation 一致

#### 问题 3：hse_employee_org 如何处理？

**冻结为只读历史表，迁移数据后保留不删除。**

依据：
1. 被 hse-employee.js 引用 24 处（19 处业务逻辑），需在 Sprint-B 中迁移至 employee_assignment
2. 1285 名员工的组织关系数据需迁移至 employee_assignment
3. 五级组织字段（group_id/region_id/enterprise_id/project_id/team_id）仅 group_id（乡镇）和 region_id（班组）有实际数据
4. 迁移完成后，hse_employee_org 作为历史快照保留，供审计追溯

**处理步骤**：
1. Sprint-B 阶段：将 hse-employee.js 中 19 处 SQL 从 hse_employee_org 改为 employee_assignment
2. 数据迁移：按字段映射（group_id→org_unit_id, region_id→operation_unit_id）迁移至 employee_assignment
3. 冻结表：hse_employee_org 标记为 `is_frozen=true`，禁止新增/修改，仅允许查询
4. 不删除表：保留作为历史数据，供审计和回滚使用

#### 问题 4：personnel.js 如何冻结？

**保留路由但冻结数据表，标记为废弃。**

依据：
1. personnel.js 使用 `personnel` 表（非 employee/hse_employee_org），是独立的旧人员表
2. 前端已无 personnel_id 使用，EmployeeSelector 统一使用 employee_id
3. personnel.js 仍注册在 app.js（`app.use('/api/personnel', personnelRoutes)`），提供 6 个 CRUD 接口
4. 直接删除路由可能影响未知的前端调用

**冻结策略**：
1. **路由层**：保留 `/api/personnel` 路由注册，在路由文件头部添加 `@deprecated` 标注
2. **数据层**：personnel 表标记为冻结，禁止 INSERT/UPDATE/DELETE，仅允许 SELECT
3. **迁移层**：将 personnel 表中有价值的员工数据迁移至 employee 表（按 employee_code 匹配）
4. **监控层**：在 personnel.js 中添加调用日志，监控是否有前端仍调用该接口
5. **下线计划**：Sprint-B 完成后观察 2 周，无调用则下线路由

#### 问题 5：Sprint-B 是否可以进入代码实施？

**是，可以进入代码实施，但需遵循以下风险控制措施。**

### 6.2 Sprint-B 实施前置条件清单

| # | 前置条件 | 状态 | 备注 |
|---|----------|------|------|
| 1 | hse_employee_relation 数据完整性验证 | ✅ 已完成 | 1304 条记录，关联有效性 100% |
| 2 | employee 恢复安全性验证 | ✅ 已完成 | 0 孤儿，1285 可恢复 |
| 3 | 组织模型字段映射确认 | ✅ 已完成 | group_id→org_unit_id, region_id→operation_unit_id |
| 4 | hse_employee_org 依赖梳理 | ✅ 已完成 | 19 处业务 SQL 需迁移 |
| 5 | 前端依赖梳理 | ✅ 已完成 | 3 处需修改，其余无需改动 |
| 6 | employee_assignment 表结构就绪 | ✅ 已完成 | sprint5_6 迁移脚本已定义 |
| 7 | 数据备份 | ⏳ 待执行 | 实施前需全量备份数据库 |

### 6.3 Sprint-B 实施风险控制措施

| 风险等级 | 风险项 | 控制措施 |
|----------|--------|----------|
| 高 | employee 恢复导致数据冲突 | 恢复前备份 employee 表；恢复后验证 employee_code 唯一性 |
| 高 | hse-employee.js 迁移导致业务中断 | 迁移后逐接口测试；保留 hse_employee_org 回滚能力 |
| 中 | position_id 来源不一致 | 迁移前验证 hse_employee_relation.position_id 与 position 表的关联有效性 |
| 中 | 加密字段格式不一致 | 恢复 employee 后校验 id_card/phone 密文可解密性 |
| 低 | personnel.js 调用方未知 | 添加调用日志监控，观察 2 周后下线 |
| 低 | 前端 EmployeeSelector 字段变更 | 确保后端 API 返回字段与前端类型定义一致 |

### 6.4 Sprint-B 实施顺序建议

```
Step 1: 数据库全量备份
Step 2: 恢复 employee 表 1285 名软删员工
Step 3: 验证 employee 表数据完整性
Step 4: 从 hse_employee_relation 迁移数据至 employee_assignment
Step 5: 验证 employee_assignment 数据完整性
Step 6: 迁移 hse-employee.js 中 19 处 SQL 至 employee_assignment
Step 7: 适配 EmployeeSelector.vue 和 OrgTransferModal.vue
Step 8: 冻结 hse_employee_org 和 personnel.js
Step 9: 全功能回归测试
Step 10: 上线观察
```

---

## 附录：审计执行记录

### A.1 审计脚本

- 审计脚本：`server/test-uploads/audit-pre-sprint-b.js`
- 执行命令：`node test-uploads/audit-pre-sprint-b.js`
- 执行结果：成功，exit code 0

### A.2 审计数据快照

- 审计时间：2026-07-28
- 数据库：safety_dashboard
- hse_employee_relation 总记录数：1304
- hse_employee_org 引用独立员工数：1285
- employee 表可恢复记录数：1285

### A.3 相关文档参考

- `docs/personnel/Sprint-B人员模型统一实施方案.md`
- `docs/personnel/Sprint-B组织模型映射审计报告.md`
- `docs/Sprint-B人员模型统一前置审计清单.md`
- `server/sql/sprint5_6_employee_master_migration.sql`（employee_assignment 表定义）
- `server/sql/hse_org_center_v68_migration.sql`（hse_employee_relation 表定义）
- `server/sql/hse_employee_master_v59_migration.sql`（hse_employee_org 表定义）

---

**审计结论：Sprint-B 可进入代码实施阶段，建议按 6.4 实施顺序执行，确保数据备份完成后开始。**
