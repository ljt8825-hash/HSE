# Sprint-B 组织模型映射审计报告

**文档版本**：v1.0  
**审计日期**：2026-07-28  
**审计目的**：确认 `hse_employee_org` 如何安全映射到 `employee_assignment`  
**审计方法**：直接查询生产数据库 + SQL 迁移脚本分析  
**数据来源**：数据库实际数据 + `hse_employee_master_v59_migration.sql` + `hse_org_center_v68_migration.sql`  

---

## 一、组织表结构审计

### 1.1 hse_employee_org 表（V1 五级组织模型，v59 定义）

**定义文件**：[hse_employee_master_v59_migration.sql:157-183](file:///F:/hse-dashboard/server/sql/hse_employee_master_v59_migration.sql#L157-L183)

| 字段名 | 类型 | 可空 | 说明 |
|---|---|---|---|
| `id` | bigint | NO | 主键 |
| `employee_id` | bigint | NO | 外键 → employee.id |
| `group_id` | bigint | YES | 外键 → department.id（集团/区域级） |
| `region_id` | bigint | YES | 外键 → department.id（片区/乡镇级） |
| `enterprise_id` | bigint | YES | 外键 → department.id（企业级） |
| `project_id` | bigint | YES | 外键 → department.id（项目级） |
| `team_id` | bigint | YES | 外键 → department.id（班组级） |
| `org_path` | varchar(500) | YES | 组织路径快照：/集团/区域/企业/项目/班组 |
| `position_id` | bigint | YES | 外键 → position.id |
| `supervisor_id` | bigint | YES | 外键 → employee.id |
| `start_date` | date | NO | 开始日期 |
| `end_date` | date | YES | 结束日期 |
| `status` | varchar(20) | YES | 状态：在职/待岗/离职/退休/返聘 |
| `is_current` | boolean | YES | 是否当前记录 |
| `change_reason` | varchar(200) | YES | 变动原因 |
| `tenant_id` | bigint | YES | 租户ID |
| `created_at` | timestamptz | YES | 创建时间 |
| `updated_at` | timestamptz | YES | 更新时间 |
| `is_deleted` | boolean | YES | 软删除 |
| `is_deprecated` | boolean | YES | 是否废弃（v68 新增） |

### 1.2 hse_org_unit 表（V2.1 新组织模型，v68 定义）

**定义文件**：[hse_org_center_v68_migration.sql:15-31](file:///F:/hse-dashboard/server/sql/hse_org_center_v68_migration.sql#L15-L31)

| 字段名 | 类型 | 可空 | 说明 |
|---|---|---|---|
| `id` | bigint | NO | 主键 |
| `parent_id` | bigint | YES | 父组织ID，根节点为 NULL |
| `org_name` | varchar(128) | NO | 组织名称 |
| `org_type` | varchar(32) | NO | 类型：company/department/center/town_center |
| `org_code` | varchar(64) | NO | 组织编码（唯一） |
| `org_path` | varchar(512) | YES | 组织路径 |
| `level` | integer | YES | 层级：1-公司, 2-部门/中心, 3-乡镇 |
| `sort_order` | integer | YES | 排序号 |
| `headcount` | integer | YES | 编制人数 |
| `status` | varchar(20) | NO | 状态：active/inactive |
| `description` | varchar(256) | YES | 描述 |
| `manager_id` | bigint | YES | 负责人ID → employee.id |
| `created_at` | timestamp | NO | 创建时间 |
| `updated_at` | timestamp | NO | 更新时间 |
| `is_deleted` | boolean | NO | 软删除 |

### 1.3 hse_operation_unit 表（V2.1 作业单元，v68 定义）

**定义文件**：[hse_org_center_v68_migration.sql:59-73](file:///F:/hse-dashboard/server/sql/hse_org_center_v68_migration.sql#L59-L73)

| 字段名 | 类型 | 可空 | 说明 |
|---|---|---|---|
| `id` | bigint | NO | 主键 |
| `org_unit_id` | bigint | NO | 外键 → hse_org_unit.id |
| `unit_name` | varchar(128) | NO | 作业单元名称 |
| `unit_type` | varchar(32) | NO | 类型：cleaning_team/collection_team/transfer_station/vehicle_team 等 |
| `unit_code` | varchar(64) | NO | 单元编码（唯一） |
| `headcount` | integer | YES | 人员数量 |
| `location` | varchar(256) | YES | 位置 |
| `status` | varchar(20) | NO | 状态：active/inactive |
| `description` | varchar(256) | YES | 描述 |
| `supervisor_id` | bigint | YES | 组长ID → employee.id |
| `created_at` | timestamp | NO | 创建时间 |
| `updated_at` | timestamp | NO | 更新时间 |
| `is_deleted` | boolean | NO | 软删除 |

### 1.4 employee_assignment 表（V2 任职关系，migrate-employee-assignment.js 定义）

| 字段名 | 类型 | 可空 | 说明 |
|---|---|---|---|
| `id` | bigint | NO | 主键 |
| `employee_id` | bigint | NO | 外键 → employee.id |
| `org_unit_id` | bigint | YES | 管理组织ID |
| `operation_unit_id` | bigint | YES | 作业单元ID |
| `position_id` | bigint | YES | 岗位ID |
| `supervisor_id` | bigint | YES | 上级ID |
| `is_current` | boolean | NO | 是否当前 |
| `status` | varchar(32) | YES | 状态 |
| `is_primary` | boolean | NO | 是否主岗 |
| `start_date` | date | YES | 开始日期 |
| `end_date` | date | YES | 结束日期 |
| `remark` | text | YES | 备注 |
| `created_by` | varchar(64) | YES | 创建人 |
| `created_at` | timestamptz | NO | 创建时间 |
| `updated_at` | timestamptz | NO | 更新时间 |
| `is_deleted` | boolean | NO | 软删除 |

---

## 二、五级组织数据统计

### 2.1 hse_employee_org 五级字段使用情况

**统计范围**：1,285 条活跃记录（`is_deleted = false AND is_current = true`）

| 字段 | 有值记录数 | NULL 记录数 | 使用率 | 结论 |
|---|---|---|---|---|
| `enterprise_id` | 0 | 1,285 | **0%** | 🔴 完全未使用 |
| `region_id` | 1,277 | 8 | **99.4%** | ✅ 主要使用 |
| `group_id` | 1,285 | 0 | **100%** | ✅ 全部使用 |
| `project_id` | 0 | 1,285 | **0%** | 🔴 完全未使用 |
| `team_id` | 0 | 1,285 | **0%** | 🔴 完全未使用 |
| `org_path` | 1,285 | 0 | **100%** | ✅ 全部使用 |

**关键发现**：

**五级组织中实际只使用了 2 级**：
- `group_id`（100%）→ 引用 `department` 表 Level 1（乡镇/部门）
- `region_id`（99.4%）→ 引用 `department` 表 Level 2（班组）
- `enterprise_id`、`project_id`、`team_id` 全部为 NULL，从未使用

### 2.2 org_path 样本分析

org_path 格式为 `/乡镇名/班组名`（两级路径），与字段使用情况一致：

| 序号 | org_path | 层级 |
|---|---|---|
| 1 | /保店镇/保店镇 | 2 级 |
| 2 | /保店镇/保店镇一班 | 2 级 |
| 3 | /柴胡店镇/柴胡店镇五班 | 2 级 |
| 4 | /宁城街道/宁城街道一班 | 2 级 |

**特殊样本**：部分 org_path 只有 1 级（如 `/柴胡店镇五班`），说明存在数据不规范的情况（8 条 `region_id` 为 NULL 的记录）。

### 2.3 department 表层级分布

| 层级 | 数量 | 内容 |
|---|---|---|
| Level 1 | 14 | 12 个乡镇 + 生产运营部 + 转运车辆 |
| Level 2 | 63 | 班组（如"保店镇一班"、"柴胡店镇二班"等） |
| **合计** | **77** | |

### 2.4 hse_org_unit 表层级分布（V2.1 新模型）

| 层级 | org_type | 数量 | 内容 |
|---|---|---|---|
| Level 1 | company | 1 | 宁津项目公司 |
| Level 2 | department | 5 | 项目管理层、人力综合部、生产管理部、安环品质部、财务部 |
| Level 2 | center | 2 | 环卫作业中心、市政绿化作业中心 |
| Level 3 | town_center | 12 | 12 个乡镇作业中心 |
| **合计** | | **20** | |

### 2.5 hse_operation_unit 表统计（V2.1 作业单元）

| unit_type | 数量 | 说明 |
|---|---|---|
| cleaning_team | 51 | 保洁班组 |
| collection_team | 13 | 收运车组 |
| transfer_station | 10 | 转运站 |
| center_vehicle_team | 1 | 中心车辆作业组 |
| **合计** | **75** | |

### 2.6 异常数据检查

| 检查项 | 结果 | 说明 |
|---|---|---|
| NULL 组织节点 | 8 条 | `region_id` 为 NULL（仅有 `group_id`） |
| 重复组织名称 | 12 个 | department 表中每个乡镇名出现 2 次（Level 1 和 Level 2 各一条） |
| 孤立组织引用 | 1 条 | `group_id` 引用了不存在的 department（需排查） |
| org_path 为 NULL | 0 条 | 全部有值 |

---

## 三、映射关系分析

### 3.1 核心映射：department → hse_org_unit / hse_operation_unit

| department 层级 | 数量 | 对应 hse_org_unit | 对应 hse_operation_unit | 映射依据 |
|---|---|---|---|---|
| Level 1（乡镇） | 12 | Level 3（town_center） | — | 名称完全匹配（如"长官镇" ↔ "长官镇作业中心"） |
| Level 1（生产运营部） | 1 | Level 2（center：环卫作业中心） | — | 业务语义对应 |
| Level 1（转运车辆） | 1 | — | center_vehicle_team | 业务语义对应 |
| Level 2（班组） | 63 | — | cleaning_team(51) + collection_team(13) | 名称近似匹配（如"保店镇一班" ↔ 保洁班组） |

### 3.2 hse_employee_org → employee_assignment 字段映射

| hse_employee_org 字段 | employee_assignment 字段 | 映射方式 | 说明 |
|---|---|---|---|
| `employee_id` | `employee_id` | ✅ 直接映射 | 类型一致 |
| `group_id` → department → hse_org_unit | `org_unit_id` | ⚠️ 间接映射 | department Level 1 名称匹配 hse_org_unit |
| `region_id` → department → hse_operation_unit | `operation_unit_id` | ⚠️ 间接映射 | department Level 2 名称匹配 hse_operation_unit |
| `position_id` | `position_id` | ✅ 直接映射 | 类型一致 |
| `supervisor_id` | `supervisor_id` | ✅ 直接映射 | 类型一致 |
| `status` | `status` | ✅ 直接映射 | 值域需对齐（见 3.4） |
| `is_current` | `is_current` | ✅ 直接映射 | 类型一致 |
| `start_date` | `start_date` | ✅ 直接映射 | 类型一致 |
| `end_date` | `end_date` | ✅ 直接映射 | 类型一致 |
| `change_reason` | `remark` | ⚠️ 语义映射 | 字段名不同，语义相同 |
| `enterprise_id` | — | ❌ 丢弃 | 全部为 NULL |
| `project_id` | — | ❌ 丢弃 | 全部为 NULL |
| `team_id` | — | ❌ 丢弃 | 全部为 NULL |
| `org_path` | — | ❌ 丢弃 | EA 表无此字段，可从关联表重建 |
| `tenant_id` | — | ❌ 丢弃 | EA 表无此字段 |
| — | `is_primary` | ⚠️ 补默认值 | HEO 无此字段，迁移时设为 `true` |
| — | `created_by` | ⚠️ 补默认值 | HEO 无此字段，迁移时设为 `'system_migration'` |

### 3.3 名称匹配映射表（department → hse_org_unit）

| department Level 1 名称 | department ID 样例 | hse_org_unit 名称 | hse_org_unit org_code |
|---|---|---|---|
| 长官镇 | — | 长官镇作业中心 | TOWN-CHANGGUAN |
| 张大庄镇 | — | 张大庄镇作业中心 | TOWN-ZHANGDAZHUANG |
| 大曹镇 | — | 大曹镇作业中心 | TOWN-DACAO |
| 杜集镇 | — | 杜集镇作业中心 | TOWN-DUJI |
| 柴胡店镇 | — | 柴胡店镇作业中心 | TOWN-CHAIHUDIAN |
| 保店镇 | — | 保店镇作业中心 | TOWN-BAODIAN |
| 大柳镇 | — | 大柳镇作业中心 | TOWN-DALIU |
| 相衙镇 | — | 相衙镇作业中心 | TOWN-XIANGYA |
| 刘营伍 | — | 刘营伍乡作业中心 | TOWN-LIUYINGWU |
| 时集镇 | — | 时集镇作业中心 | TOWN-SHIJI |
| 宁城街道 | — | 宁城街道作业中心 | TOWN-NINGCHENG |
| 津城街道 | — | 津城街道作业中心 | TOWN-JINCHENG |
| 生产运营部 | — | 环卫作业中心 | CENTER-HW |

**匹配规则**：去除"作业中心"后缀，与 department Level 1 名称做包含匹配。

### 3.4 status 值域对齐

| hse_employee_org.status | employee_assignment.status | 说明 |
|---|---|---|
| `在职` | `active` | 值不同，需转换 |
| `待岗` | `pending` | 值不同，需转换 |
| `离职` | `inactive` | 值不同，需转换 |
| `退休` | `inactive` | 值不同，需转换 |
| `返聘` | `active` | 值不同，需转换 |

---

## 四、employee_assignment 设计建议

### 4.1 org_unit_id 应代表哪一级组织

**推荐方案**：`org_unit_id` → `hse_org_unit.id`（Level 3 town_center）

**理由**：

1. **数据实际使用**：hse_employee_org 的 `group_id`（100% 使用）引用的是 department Level 1（乡镇级），对应 hse_org_unit Level 3（town_center）
2. **业务语义**：乡镇作业中心是员工日常管理的最小行政组织单元，适合作为 `org_unit_id`
3. **V2.1 设计意图**：v68 迁移脚本的 `hse_employee_relation` 表已明确 `org_unit_id` 关联 `hse_org_unit.id`
4. **向上追溯**：通过 `hse_org_unit.parent_id` 可逐级向上找到 center → company，无需冗余存储

### 4.2 operation_unit_id 应代表哪一级组织

**推荐方案**：`operation_unit_id` → `hse_operation_unit.id`（班组/车组/转运站）

**理由**：

1. **数据实际使用**：hse_employee_org 的 `region_id`（99.4% 使用）引用的是 department Level 2（班组），对应 hse_operation_unit
2. **业务语义**：班组是员工实际作业的最小单元（保洁班组、收运车组、转运站）
3. **V2.1 设计意图**：v68 的 `hse_employee_relation.operation_unit_id` 已明确关联 `hse_operation_unit.id`
4. **nullable**：8 条 `region_id` 为 NULL 的记录，`operation_unit_id` 可为 NULL（表示尚未分配到具体班组）

### 4.3 最终映射方案

```
hse_employee_org.group_id  →  department(Level 1 乡镇)  →  名称匹配  →  hse_org_unit(Level 3)  →  employee_assignment.org_unit_id

hse_employee_org.region_id →  department(Level 2 班组)  →  名称匹配  →  hse_operation_unit     →  employee_assignment.operation_unit_id
```

### 4.4 特殊情况处理

| 特殊情况 | 数量 | 处理方案 |
|---|---|---|
| `region_id` 为 NULL | 8 条 | `operation_unit_id` 设为 NULL，仅关联到乡镇级 |
| `group_id` 孤立引用 | 1 条 | 排查具体 department ID，手动修正或标记为异常 |
| department "转运车辆" | 1 条 | 映射到 `hse_operation_unit`（center_vehicle_team），`org_unit_id` 设为环卫作业中心 |
| department "生产运营部" | 1 条 | 映射到 `hse_org_unit`（CENTER-HW 环卫作业中心） |
| 名称不完全匹配 | 待确认 | 采用模糊匹配 + 人工审核 |

---

## 五、迁移风险分析

### 5.1 组织丢失风险

| 风险点 | 影响范围 | 风险等级 | 缓解措施 |
|---|---|---|---|
| department Level 2（63 个班组）与 hse_operation_unit（75 个）**数量不一致** | 可能部分班组无法映射 | ⚠️ 中 | 需逐一核对名称，确认未匹配的班组 |
| department 名称重复（12 个乡镇名各出现 2 次） | 名称匹配可能命中错误层级 | ⚠️ 中 | 匹配时必须限定 `parent_id` 层级 |
| department "转运车辆"无对应 hse_org_unit | 1 条记录的 org_unit_id 无着落 | 🟡 低 | 映射到环卫作业中心（CENTER-HW） |
| hse_org_unit 中"市政绿化作业中心"无 department 对应 | 该组织下无员工数据 | 🟡 低 | 无影响，仅表示新组织尚未启用 |

### 5.2 岗位丢失风险

| 风险点 | 影响范围 | 风险等级 | 缓解措施 |
|---|---|---|---|
| hse_employee_org.position_id 引用的 position 表与 v68 扩展后的 position 表是否一致 | 全部 1,285 条 | 🟡 低 | position 表是同一张表，仅新增了字段，不影响 ID 关联 |
| 岗位状态为"离职/退休"的记录 | 少量 | 🟢 极低 | `is_current = false` 的记录不迁移（仅迁移当前在职） |

### 5.3 人员归属错误风险

| 风险点 | 影响范围 | 风险等级 | 缓解措施 |
|---|---|---|---|
| 名称模糊匹配可能误配 | 63 个班组 | 🔴 高 | 采用精确匹配 + 模糊匹配 + 人工审核三步法 |
| department 班组名（如"保店镇一班"）与 hse_operation_unit 名称（如"宁城街道一班"）格式不完全一致 | 部分记录 | ⚠️ 中 | 需编写匹配规则脚本，输出未匹配清单 |
| 8 条 `region_id` 为 NULL 的记录 | 8 条 | 🟡 低 | `operation_unit_id` 设为 NULL，不丢失员工数据 |
| 1 条 `group_id` 孤立引用 | 1 条 | 🟡 低 | 单独排查并修正 |

### 5.4 hse_employee_relation 表的存在

**关键发现**：数据库中存在 `hse_employee_relation` 表（v68 定义），且有 **1,304 条活跃记录**。

| 对比项 | hse_employee_org | hse_employee_relation | employee_assignment |
|---|---|---|---|
| 定义版本 | v59 | v68 | migrate-employee-assignment.js |
| 活跃记录数 | 1,285 | 1,304 | 1（Sprint A 清空后） |
| org_unit_id 来源 | 五级 department | hse_org_unit | hse_org_unit（设计上） |
| operation_unit_id 来源 | — | hse_operation_unit | hse_operation_unit（设计上） |
| 当前使用状态 | V1 路由使用 | v68 迁移脚本生成 | V2 路由使用 |

**这意味着实际上存在三张任职关系表**，Sprint B 需要决定：
- 是否将 `hse_employee_relation` 作为迁移源（它已经是 V2.1 结构）
- 还是从 `hse_employee_org` 迁移（数据更原始但需转换）

---

## 六、Sprint B 实施前置条件

### 6.1 必须满足的条件

| 序号 | 前置条件 | 当前状态 | 需要操作 |
|---|---|---|---|
| 1 | employee 表数据已恢复（重新导入花名册） | ❌ 仅 1 条测试数据 | 重新导入全量花名册 |
| 2 | department → hse_org_unit 名称映射规则已确认 | ⚠️ 12 个乡镇可匹配，"生产运营部"和"转运车辆"需确认 | 编写映射脚本并输出未匹配清单 |
| 3 | department Level 2 → hse_operation_unit 名称映射规则已确认 | ⚠️ 63 vs 75 数量不一致 | 逐一核对，输出匹配/未匹配清单 |
| 4 | hse_employee_relation 表的处理方案已确认 | ❌ 未决定 | 确认是否以其为迁移源 |
| 5 | status 值域转换规则已确认 | ⚠️ 已列出对照表 | 确认转换规则 |
| 6 | 8 条 region_id 为 NULL 的记录处理方案已确认 | ❌ 未决定 | 确认 operation_unit_id 设为 NULL |
| 7 | 1 条 group_id 孤立引用已排查 | ❌ 未排查 | 查询具体 department ID 并修正 |
| 8 | Sprint A 代码已合并到主分支 | ⚠️ 已提交到 feature 分支 | 完成代码审查并合并 |

### 6.2 需要确认的决策项

| 序号 | 决策项 | 选项 | 建议 |
|---|---|---|---|
| 1 | 迁移数据源 | ① hse_employee_org（1,285 条）<br>② hse_employee_relation（1,304 条）<br>③ 两者合并去重 | **建议 ②**（已是 V2.1 结构，无需转换 org_unit_id） |
| 2 | hse_employee_org 迁移后处理 | ① 标记 `is_deprecated = true`（只读保留）<br>② 直接软删除 | **建议 ①**（保留审计能力） |
| 3 | hse_employee_relation 迁移后处理 | ① 保留（双写）<br>② 标记废弃 | **建议 ②**（避免三表并存） |
| 4 | 是否在 employee_assignment 增加 org_path 字段 | ① 增加冗余字段<br>② 通过 JOIN 重建 | **建议 ②**（避免冗余，保持表结构不变） |
| 5 | V1 路由（hse-employee.js）的切换方式 | ① 直接改查 employee_assignment<br>② 通过视图 v_employee_org_full 间接查询 | **建议 ②**（降低耦合） |

### 6.3 迁移 SQL 思路（待确认后细化）

```sql
-- 方案A：从 hse_employee_relation 迁移（推荐）
INSERT INTO employee_assignment (
  employee_id, org_unit_id, operation_unit_id, position_id, supervisor_id,
  is_current, status, is_primary, start_date, end_date, remark, created_by,
  created_at, updated_at, is_deleted
)
SELECT
  employee_id, org_unit_id, operation_unit_id, position_id, supervisor_id,
  is_current,
  CASE status
    WHEN '在职' THEN 'active'
    WHEN '待岗' THEN 'pending'
    WHEN '离职' THEN 'inactive'
    WHEN '退休' THEN 'inactive'
    WHEN '返聘' THEN 'active'
    ELSE 'active'
  END,
  is_primary, start_date, end_date, remark, 'system_migration',
  created_at, updated_at, is_deleted
FROM hse_employee_relation
WHERE is_deleted = false AND is_current = true
ON CONFLICT DO NOTHING;
```

### 6.4 数据校验方法

| 校验项 | SQL | 预期结果 |
|---|---|---|
| 迁移前后员工数一致 | `SELECT COUNT(DISTINCT employee_id) FROM employee_assignment WHERE is_deleted=false` | = hse_employee_relation 的员工数 |
| 无孤立 org_unit_id | `SELECT * FROM employee_assignment ea LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id WHERE ou.id IS NULL` | 0 条 |
| 无孤立 operation_unit_id | `SELECT * FROM employee_assignment ea LEFT JOIN hse_operation_unit opu ON ea.operation_unit_id = opu.id WHERE ea.operation_unit_id IS NOT NULL AND opu.id IS NULL` | 0 条 |
| position_id 全部有效 | `SELECT * FROM employee_assignment ea LEFT JOIN position p ON ea.position_id = p.id WHERE ea.position_id IS NOT NULL AND p.id IS NULL` | 0 条 |

### 6.5 失败回滚方案

| 回滚操作 | 命令 |
|---|---|
| 清空迁移数据 | `UPDATE employee_assignment SET is_deleted = true WHERE created_by = 'system_migration'` |
| 恢复 hse_employee_org | `UPDATE hse_employee_org SET is_deprecated = false` |
| 恢复 hse_employee_relation | 无需操作（未删除） |

---

## 七、审计结论

### 7.1 映射可行性

**结论**：`hse_employee_org` → `employee_assignment` 的映射**可行**，但存在以下关键点：

1. **五级组织实际只用两级**（group_id + region_id），映射复杂度大幅降低
2. **hse_employee_relation 表已存在 1,304 条 V2.1 结构数据**，优先从此表迁移可避免 department → hse_org_unit 的名称匹配问题
3. **名称匹配存在风险**（63 vs 75 数量不一致），需逐一核对

### 7.2 推荐迁移路径

```
方案A（推荐）: hse_employee_relation (1,304条) → employee_assignment
  优点: 字段结构完全一致，无需名称匹配
  风险: 需确认 hse_employee_relation 数据完整性

方案B（备选）: hse_employee_org (1,285条) → department名称匹配 → hse_org_unit → employee_assignment
  优点: 数据来源更原始
  风险: 名称匹配可能出错，63 vs 75 不一致需逐一核对
```

### 7.3 下一步

等待以下确认后进入 Sprint B 实施方案设计：

1. 确认迁移数据源（hse_employee_relation vs hse_employee_org）
2. 确认 hse_employee_org 迁移后处理方式
3. 确认是否需要先恢复 employee 表数据
4. 确认 V1 路由切换方式

---

*Sprint-B 组织模型映射审计完成。等待确认。*