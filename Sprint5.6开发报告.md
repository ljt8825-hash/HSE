# HSE Sprint5.6 员工主数据中心开发报告

## 一、任务概述

依据《员工主数据最终冻结清单》《Sprint5.6员工主数据开发任务清单》《员工花名册导入流程设计方案》，完成 Sprint5.6 员工主数据中心编码实施。

**开发周期**：第一阶段（数据库迁移+初始化）+ 第二阶段（Excel导入V2）

**核心原则**：
- 严格遵守冻结模型（employee / employee_assignment / hse_org_unit / hse_operation_unit / position 禁止修改）
- 禁止新增 npm 依赖
- 禁止硬编码组织和岗位规则
- 禁止修改 Vben 核心目录、auth/JWT 相关代码
- 所有改动最小化，优先复用现有模式

---

## 二、第一阶段：数据库迁移与初始化

### 2.1 迁移脚本

**文件**：`server/sql/sprint5_6_employee_master_migration.sql`

**新增6张表**：

| 序号 | 表名 | 说明 | 核心字段 |
|------|------|------|----------|
| 1 | `employee_assignment` | 统一员工任职关系表（替代 hse_employee_relation） | employee_id, org_unit_id, operation_unit_id, position_id, supervisor_id, is_primary, is_current |
| 2 | `employee_import_batch` | 导入批次表 | batch_no, rule_version, total_count, success_count, pending_count, status, operator, client_ip |
| 3 | `employee_import_pending` | 待确认记录表 | batch_id, row_num, pending_type, pending_desc, target_org_id, target_unit_id, target_pos_id, status |
| 4 | `employee_import_mapping_rule` | 组织映射规则表 | source_value, target_type, target_id, condition_dept, match_priority |
| 5 | `employee_position_mapping_rule` | 岗位映射规则表 | source_position, target_position_id, condition_dept, effective_date, expire_date |
| 6 | `employee_import_mapping_rule_version` | 规则版本管理表 | version, effective_date, expire_date, status |

**新增视图**：
- `v_employee_current`：基于 `employee_assignment` 的员工全景视图（替代 v68 的 `v_employee_org_full`）

**新增索引**：共 29 个索引（含唯一索引 `uk_emp_assign_primary`）

**执行方式**：
```bash
psql -U postgres -d safety_dashboard -f server/sql/sprint5_6_employee_master_migration.sql
```

### 2.2 初始化数据脚本

**文件**：`server/sql/sprint5_6_employee_master_init_data.sql`

**初始化内容**：

| 类别 | 数量 | 说明 |
|------|------|------|
| 组织单元 | 18+ 条 | 1公司 + 3职能部门 + 2作业中心 + 12乡镇（增量安全，不删除已有 v68 数据） |
| 标准岗位 | 20 条 | 管理/生产/技术/辅助四类，使用现有 position 表字段兼容初始化 |
| 固定作业单元 | 1 个 | 中心车辆作业组（getOrCreate，不重复插入） |
| 规则版本 | 1 条 | v1.0（Sprint5.6初始版本） |
| 组织映射规则 | 20+ 条 | 职能部门、车队、12乡镇片区及班组映射 |
| 岗位映射规则 | 15+ 条 | 含司机细分规则（车队→转运车驾驶员，片区→收运车驾驶员） |

**关键设计**：
- 所有 INSERT 采用 `WHERE NOT EXISTS` 模式，可重复执行
- 动态作业单元（保洁组/收运车组/转运站）使用 getOrCreate 模式，防止重复创建
- 岗位映射支持条件匹配（`condition_dept`），实现司机岗位按部门细分

**执行方式**：
```bash
psql -U postgres -d safety_dashboard -f server/sql/sprint5_6_employee_master_init_data.sql
```

---

## 三、第二阶段：Excel导入V2 API开发

### 3.1 路由文件

**文件**：`server/routes/hse-employee-import-v2.js`

**注册路径**：`server/app.js` 新增 `/api/hse/employee-import/v2`

### 3.2 API清单

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/upload` | admin / safety_manager | 上传Excel → 解析 → 校验 → 匹配 → 创建批次 + pending记录 |
| GET | `/batches` | admin / safety_manager | 查询导入批次列表（分页） |
| GET | `/batch/:batchId/preview` | admin / safety_manager | 查询批次解析结果预览 |
| GET | `/batch/:batchId/pending` | admin / safety_manager | 查询批次的待确认记录（可按状态/类型筛选） |
| POST | `/pending/:id/resolve` | admin / safety_manager | 审核单条待确认记录（approved / rejected） |
| POST | `/batch/:batchId/import` | admin / safety_manager | 正式入库：approved记录写入 employee + employee_assignment |

### 3.3 导入流程

```
上传Excel
    ↓
解析12个标准字段（员工编号/姓名/身份证号/性别/出生日期/所属部门/班组/职位/入职日期/联系电话/是否驾驶员/驾驶证类型）
    ↓
基础校验（姓名必填、身份证格式、手机号格式、性别枚举）
    ↓
员工匹配（employee_no → id_card_hash → phone_hash+name）
    ↓
组织匹配（employee_import_mapping_rule.source_value → org_unit_id）
    ↓
岗位匹配（employee_position_mapping_rule，支持condition_dept司机细分）
    ↓
作业单元匹配（映射规则 → 班组动态创建保洁组 → 岗位推断收运车组/转运站）
    ↓
唯一性校验（身份证号/手机号冲突检测）
    ↓
├─ 全部通过 → 保存为 pending.status='approved'（可直接入库）
├─ 异常 → 保存为 pending.status='pending'（待人工审核）
    ↓
人工审核（/pending/:id/resolve）
    ↓
正式入库（/batch/:id/import）
    ├─ 新员工 → INSERT employee + INSERT employee_assignment
    ├─ 已有员工 → UPDATE employee_assignment（旧关系标记is_current=false）
    └─ 单条失败不影响其他记录（部分完成状态）
```

### 3.4 核心匹配逻辑

#### 组织匹配（matchOrgUnit）
- 查询 `employee_import_mapping_rule`，`source_type='excel_department'`，`target_type='org_unit'`
- 按 `match_priority DESC` 取第一条

#### 岗位匹配（matchPosition）
- **条件匹配**：`source_position + condition_dept`（如"司机"+"车队"→转运车驾驶员）
- **无条件匹配**：`source_position` 且 `condition_dept IS NULL`
- 支持 `effective_date / expire_date` 有效期控制

#### 作业单元匹配（matchOperationUnit）
- 先查映射规则中的 `operation_unit`
- 班组动态推断："X班" → "{乡镇}第X保洁组"（cleaning_team）
- 岗位动态推断：司机 → "{乡镇}收运车组"（collection_team），转运站管理员 → "{乡镇}转运站"（transfer_station）
- 全部采用 getOrCreate（`org_unit_id + unit_type + unit_name` 防重复）

#### 员工匹配（matchEmployee）
- 优先级1：`employee_code = employee_no`
- 优先级2：`id_card_hash = hash(id_card)`
- 优先级3：`phone_hash = hash(phone) AND name = name`
- **禁止纯姓名匹配**

### 3.5 关键约束实现

| 约束 | 实现方式 |
|------|----------|
| 禁止直接写 employee | upload API 仅创建 pending 记录，import API 才写入 employee |
| 禁止硬编码规则 | 全部使用 employee_import_mapping_rule / employee_position_mapping_rule 配置表 |
| 司机岗位细分 | position_mapping_rule.condition_dept（"车队" vs "*片区"） |
| 动态作业单元防重复 | hse_operation_unit 查询 `org_unit_id + unit_type + unit_name`，不存在则 INSERT |
| 主岗唯一 | employee_assignment 唯一索引 `uk_emp_assign_primary`（is_primary=true AND is_current=true） |
| 调岗历史 | 新 assignment 创建前，旧主岗标记 `is_current=false, end_date=CURRENT_DATE` |

---

## 四、修改文件清单

| 序号 | 文件路径 | 操作 | 说明 |
|------|----------|------|------|
| 1 | `server/sql/sprint5_6_employee_master_migration.sql` | 新增 | 6张新表 + 视图 + 29个索引 |
| 2 | `server/sql/sprint5_6_employee_master_init_data.sql` | 新增 | 组织/岗位/作业单元/映射规则初始化 |
| 3 | `server/routes/hse-employee-import-v2.js` | 新增 | V2导入API路由（6个接口） |
| 4 | `server/app.js` | 修改 | 注册 `/api/hse/employee-import/v2` 路由 |

**未修改的文件（符合冻结约束）**：
- `packages/@core/*`、`packages/effects/*`、`packages/themes/*`（Vben核心）
- `auth/` 下所有登录/JWT相关代码
- `employee`、`hse_org_unit`、`hse_operation_unit`、`position` 表结构
- 无新增 npm 依赖

---

## 五、待办与后续工作

1. **前端页面开发**：需开发导入管理页面（批次列表、预览、待审核、执行入库）
2. **集成测试**：使用真实Excel模板进行端到端测试
3. **性能优化**：大批量导入（1300+记录）时的分页处理和进度反馈
4. **日志审计**：完善 auditLog 调用记录导入操作

---

## 六、交付确认

- [x] 数据库迁移脚本（6张表 + 视图 + 索引）
- [x] 初始化数据脚本（组织/岗位/作业单元/映射规则）
- [x] Excel上传解析API
- [x] 组织/作业单元/岗位匹配逻辑
- [x] 异常审核和正式入库流程
- [x] 开发报告
- [ ] 测试报告（待实际测试环境验证后补充）
