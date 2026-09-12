# Sprint-B 人员模型统一前置审计清单

**文档版本**：v1.0  
**审计日期**：2026-07-28  
**审计目的**：为 Sprint B（统一人员模型）提供数据现状基线  
**审计方法**：直接查询生产数据库  

---

## 一、employee 表数量

| 统计项 | 数量 |
|---|---|
| 总记录数 | 1,361 |
| 活跃记录（`is_deleted = false`） | 1 |
| 已删除记录（`is_deleted = true`） | 1,360 |

**说明**：Sprint-A 测试中执行了清空操作，1,360 条历史数据被软删除。当前仅剩 1 条活跃记录（TEST001 测试数据）。正式环境需重新导入花名册恢复数据。

---

## 二、employee_assignment 表数量

| 统计项 | 数量 |
|---|---|
| 总记录数 | 1,305 |
| 活跃记录（`is_deleted = false`） | 1 |
| 已删除记录（`is_deleted = true`） | 1,304 |
| 当前在职（`is_current = true AND is_deleted = false`） | 1 |

**说明**：与 employee 表一致，历史任职关系已软删除，仅剩 1 条测试数据。

---

## 三、hse_employee_org 表数量

| 统计项 | 数量 |
|---|---|
| 总记录数 | 1,285 |
| 活跃记录（`is_deleted = false`） | 1,285 |
| 已删除记录（`is_deleted = true`） | 0 |
| 当前在职（`is_current = true AND is_deleted = false`） | 1,285 |

**关键发现**：
- `hse_employee_org` 表**未被 Sprint A 的清空操作影响**
- 该表仍保留全部 1,285 条活跃任职关系记录
- 这证实了**双任职关系表并存**的问题：`employee_assignment` 被清空，但 `hse_employee_org` 未被清空

---

## 四、personnel 表数量

| 统计项 | 数量 |
|---|---|
| 总记录数 | 0 |
| 活跃记录 | 0 |
| 已删除记录 | 0 |

**说明**：`personnel` 表为空，已无实际数据，可安全废弃。

---

## 五、四张表数据差异

### 5.1 employee vs employee_assignment

| 对比项 | 数量 |
|---|---|
| employee 表活跃员工数 | 1 |
| employee_assignment 关联的独立员工数 | 1 |
| 匹配情况 | ✅ 一致（1:1） |

### 5.2 employee vs personnel

| 对比项 | 数量 |
|---|---|
| employee 表活跃员工数 | 1 |
| personnel 表活跃记录数 | 0 |
| 按工号匹配数 | 0 |

**结论**：`personnel` 表为空，无需迁移。

### 5.3 employee_assignment vs hse_employee_org

| 对比项 | 数量 |
|---|---|
| employee_assignment 关联员工数 | 1 |
| hse_employee_org 关联员工数 | 1,285 |
| 两表同时存在的员工数 | 0 |

**关键发现**：
- `hse_employee_org` 有 1,285 条活跃记录，但 `employee_assignment` 仅 1 条
- **两表无任何交集**——`hse_employee_org` 中的 1,285 名员工在 `employee_assignment` 中不存在
- 这意味着 Sprint B 需要将 `hse_employee_org` 的 1,285 条记录迁移到 `employee_assignment`

---

## 六、当前有效人员名单差异

| 差异类型 | 数量 | 说明 |
|---|---|---|
| 仅在 employee 表（无任职关系） | 0 | 所有活跃 employee 都有 assignment |
| 仅在 employee_assignment（不在 hse_employee_org） | 1 | TEST001 测试数据 |
| 仅在 personnel 表（不在 employee） | 0 | personnel 表为空 |

**重点**：`hse_employee_org` 中的 1,285 条记录对应的员工在 `employee` 表中已被软删除（Sprint A 清空操作），但 `hse_employee_org` 未同步清理。

---

## 七、employee_assignment 与 hse_employee_org 映射关系

### 7.1 字段对比

| employee_assignment 字段 | 类型 | hse_employee_org 对应字段 | 类型 | 映射关系 |
|---|---|---|---|---|
| `id` | bigint | `id` | bigint | 各自独立主键 |
| `employee_id` | bigint | `employee_id` | bigint | ✅ 直接映射 |
| `org_unit_id` | bigint | `group_id` | bigint | ⚠️ 需映射（五级组织→单元） |
| `operation_unit_id` | bigint | `region_id` | bigint | ⚠️ 需映射 |
| — | — | `enterprise_id` | bigint | EA 无此字段 |
| — | — | `project_id` | bigint | EA 无此字段 |
| — | — | `team_id` | bigint | EA 无此字段 |
| — | — | `org_path` | varchar | EA 无此字段（可从五级组织拼接） |
| `position_id` | bigint | `position_id` | bigint | ✅ 直接映射 |
| `supervisor_id` | bigint | `supervisor_id` | bigint | ✅ 直接映射 |
| `is_current` | boolean | `is_current` | boolean | ✅ 直接映射 |
| `status` | varchar | `status` | varchar | ✅ 直接映射 |
| `is_primary` | boolean | — | — | HEO 无此字段 |
| `start_date` | date | `start_date` | date | ✅ 直接映射 |
| `end_date` | date | `end_date` | date | ✅ 直接映射 |
| `remark` | text | — | — | HEO 无此字段 |
| `created_by` | varchar | — | — | HEO 无此字段 |
| — | — | `change_reason` | varchar | EA 无此字段 |
| — | — | `tenant_id` | bigint | EA 无此字段 |
| `created_at` | timestamptz | `created_at` | timestamptz | ✅ 直接映射 |
| `updated_at` | timestamptz | `updated_at` | timestamptz | ✅ 直接映射 |
| `is_deleted` | boolean | `is_deleted` | boolean | ✅ 直接映射 |
| — | — | `is_deprecated` | boolean | EA 无此字段 |

### 7.2 映射难点

**核心难点**：`hse_employee_org` 使用五级组织树（`group_id`/`region_id`/`enterprise_id`/`project_id`/`team_id`），而 `employee_assignment` 使用扁平的 `org_unit_id` + `operation_unit_id`。

**Sprint B 需要解决的问题**：
1. `org_unit_id` 应映射到五级组织中的哪一级？
2. `operation_unit_id` 是否需要？还是可以合并到 `org_unit_id`？
3. `hse_employee_org.org_path`（如"集团/华北区域/德州项目/清扫一队"）如何拆解？
4. 是否需要在 `employee_assignment` 中增加五级组织字段？

---

## 八、业务模块影响范围

### 8.1 三违管理（violation_records）

| 统计项 | 数量 |
|---|---|
| 总记录数 | 890 |
| 有 `violator_id`（关联 employee.id） | 0 |
| 无 `violator_id`（NULL） | 890 |

**关键问题**：**全部 890 条三违记录的 `violator_id` 均为 NULL**，完全无法关联到员工档案。仅靠 `violator_name` 展示，无法实现数据联动。

**Sprint C 需处理**：根据 `violator_name` + 身份证号/工号回查 `employee.id`，批量回填 `violator_id`。

### 8.2 培训管理（training_records）

| 统计项 | 数量 |
|---|---|
| 总记录数 | 100 |
| 有 `employee_id` | 0 |
| 无 `employee_id`（NULL） | 100 |
| 有 `personnel_id` | 0 |

**关键问题**：**全部 100 条培训记录的 `employee_id` 和 `personnel_id` 均为 NULL**，完全无法关联到员工档案。

**Sprint C 需处理**：根据培训记录中的姓名 + 身份证号回查 `employee.id`，批量回填 `employee_id`。

### 8.3 风险画像

| 统计项 | 结果 |
|---|---|
| `hse_risk_profile` 表 | 不存在 |

**说明**：风险画像通过 `hse-risk-profile.js` 路由实时聚合查询，不依赖独立表。

### 8.4 预警中心

| 统计项 | 结果 |
|---|---|
| `hse_warnings` 表 | 不存在 |

**说明**：预警中心可能使用其他表名或实时计算，需进一步确认。

### 8.5 事故管理

| 统计项 | 结果 |
|---|---|
| `accident_records` 表 | 不存在 |

**说明**：事故管理可能使用其他表名，需进一步确认。

---

## 九、Sprint B 启动前需确认事项

### 9.1 数据恢复

| 确认项 | 当前状态 | 建议操作 |
|---|---|---|
| employee 表数据 | 仅 1 条测试数据 | 重新导入花名册恢复全量员工数据 |
| employee_assignment 表数据 | 仅 1 条测试数据 | 导入花名册后自动生成 |

### 9.2 hse_employee_org 迁移方案

| 确认项 | 说明 |
|---|---|
| 迁移方向 | `hse_employee_org` → `employee_assignment` |
| 迁移数据量 | 1,285 条活跃记录 |
| 字段映射难点 | 五级组织树（group/region/enterprise/project/team）→ 扁平结构（org_unit_id） |
| `org_unit_id` 映射规则 | **待确认**：映射到哪一级？ |
| 是否保留 `org_path` | **待确认**：是否在 `employee_assignment` 增加 `org_path` 字段？ |
| 迁移后 `hse_employee_org` 处理 | **待确认**：冻结只读 or 同步双写？ |

### 9.3 业务模块关联回填

| 模块 | 关联字段 | NULL 数量 | 回填方式 |
|---|---|---|---|
| 三违管理 | `violator_id` | 890 / 890 (100%) | 姓名 + 身份证号 → `employee.id` |
| 培训管理 | `employee_id` | 100 / 100 (100%) | 姓名 + 身份证号 → `employee.id` |

### 9.4 personnel 表处理

| 确认项 | 说明 |
|---|---|
| 数据量 | 0 条（空表） |
| 处理方式 | **待确认**：直接 DROP or 保留空表 + 冻结路由？ |

---

## 十、风险提示

### 10.1 高风险

1. **三违和培训数据 100% 无关联**：890 条三违 + 100 条培训记录的员工关联字段全部为 NULL，数据联动完全断裂
2. **hse_employee_org 与 employee_assignment 零交集**：1,285 条任职关系仅存在于 `hse_employee_org`，迁移时需确保不丢失

### 10.2 中风险

1. **五级组织树映射**：`hse_employee_org` 的五级组织字段无法直接映射到 `employee_assignment` 的扁平结构，需设计映射规则
2. **Sprint A 清空操作的副作用**：`employee` 和 `employee_assignment` 已被清空，但 `hse_employee_org` 未同步，导致数据不一致

### 10.3 低风险

1. `personnel` 表为空，废弃无数据风险
2. 风险画像和预警中心通过实时聚合查询，不依赖独立表，Sprint B 影响较小

---

*Sprint-B 前置审计完成。等待确认后启动 Sprint B 实施方案设计。*