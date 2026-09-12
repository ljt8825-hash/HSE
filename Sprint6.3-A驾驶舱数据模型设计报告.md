# Sprint6.3-A 驾驶舱数据模型设计报告

## 一、阶段概述

| 项目 | 内容 |
|------|------|
| 阶段名称 | Sprint6.3-A HSE综合驾驶舱数据模型设计 |
| 前置阶段 | Sprint6.2 风险等级计算开发 |
| 设计目标 | 设计HSE综合驾驶舱数据模型，支持多角色驾驶舱展示、风险趋势分析、风险等级参数化管理 |
| 设计日期 | 2026-07-22 |
| 设计状态 | 已完成 |

## 二、驾驶舱对象设计

### 2.1 驾驶舱角色矩阵

| 角色 | 岗位 | risk_category | management_level | 驾驶舱视角 |
|------|------|---------------|------------------|------------|
| 集团领导 | 总经理 | management | high | 全集团风险总览 |
| 部门经理 | 部门经理 | management | middle | 部门风险总览 |
| 乡镇作业中心经理 | 乡镇作业中心经理 | management | middle | 中心风险总览 |
| 环卫作业中心片区长 | 环卫作业中心片区长 | management | frontline | 片区风险明细 |
| 管理员 | 管理员/网格长/片区长 | management | frontline | 网格风险明细 |

### 2.2 数据权限范围

| 角色 | 数据范围 | 筛选条件 |
|------|----------|----------|
| 集团领导 | 全集团所有员工 | 无限制 |
| 部门经理 | 本部门及下属组织员工 | org_id = 用户所属部门及子部门 |
| 乡镇作业中心经理 | 本中心员工 | org_id = 用户所属中心 |
| 环卫作业中心片区长 | 本片区员工 | org_id = 用户所属片区 |
| 管理员 | 管辖网格员工 | org_id = 用户管辖网格区域 |

## 三、新增数据模型

### 3.1 risk_score_history（风险评分历史表）

**用途**：存储员工风险评分的历史快照，支持趋势分析和时间序列查询。

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| employee_id | BIGINT | 员工ID（FK→employee） |
| employee_code | VARCHAR(64) | 员工工号 |
| employee_name | VARCHAR(128) | 员工姓名 |
| position_id | BIGINT | 岗位ID |
| position_name | VARCHAR(128) | 岗位名称 |
| risk_category | VARCHAR(32) | 风险类别（driver/normal/management） |
| management_level | VARCHAR(32) | 管理级别（frontline/middle/high） |
| org_id | BIGINT | 组织ID |
| org_name | VARCHAR(256) | 组织名称 |
| violation_score | NUMERIC(5,2) | 三违风险积分 |
| driver_compliance_score | NUMERIC(5,2) | 驾驶合规风险积分 |
| training_compliance_score | NUMERIC(5,2) | 培训合规风险积分 |
| incident_score | NUMERIC(5,2) | 事故风险积分 |
| management_execution_score | NUMERIC(5,2) | 管理履职风险积分 |
| total_score | NUMERIC(5,2) | 综合风险得分 |
| risk_level | VARCHAR(32) | 风险等级名称 |
| risk_level_code | VARCHAR(32) | 风险等级代码 |
| special_rules_triggered | TEXT[] | 触发的特殊规则 |
| calculate_date | DATE | 计算日期（用于趋势分析） |
| calculate_period | VARCHAR(32) | 计算周期（daily/weekly/monthly） |
| data_source | VARCHAR(64) | 数据来源（auto/manual） |

**索引设计**

| 索引名 | 字段 | 用途 |
|--------|------|------|
| idx_score_history_employee_id | employee_id | 按员工查询历史 |
| idx_score_history_calculate_date | calculate_date | 按日期查询趋势 |
| idx_score_history_employee_date | employee_id, calculate_date | 按员工+日期联合查询 |
| idx_score_history_org_id | org_id | 按组织查询趋势 |
| idx_score_history_risk_level | risk_level_code | 按风险等级筛选 |

**趋势分析支持**

- 日趋势：calculate_period = 'daily'，按天记录快照
- 周趋势：calculate_period = 'weekly'，按周聚合
- 月趋势：calculate_period = 'monthly'，按月聚合
- 支持按员工、组织、岗位类别等维度进行趋势查询

### 3.2 risk_level_config（风险等级配置表）

**用途**：风险等级参数化管理，支持动态调整等级分值区间，无需修改代码。

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| level_code | VARCHAR(32) | 等级代码（唯一约束） |
| level_name | VARCHAR(32) | 等级名称 |
| level_order | INTEGER | 等级排序（1-4） |
| min_score | NUMERIC(5,2) | 最低分值 |
| max_score | NUMERIC(5,2) | 最高分值 |
| color_code | VARCHAR(16) | 显示颜色代码 |
| description | TEXT | 等级描述 |
| is_enabled | BOOLEAN | 是否启用 |

**初始配置数据**

| level_code | level_name | level_order | min_score | max_score | color_code | 描述 |
|------------|------------|-------------|-----------|-----------|------------|------|
| low | 低风险 | 1 | 0 | 25 | #52c41a | 风险处于可控范围，常规管理即可 |
| medium | 一般风险 | 2 | 26 | 50 | #faad14 | 存在一定风险因素，需要关注和跟踪 |
| high | 较高风险 | 3 | 51 | 75 | #fa8c16 | 风险较高，需要重点管控和干预 |
| critical | 重大风险 | 4 | 76 | 100 | #f5222d | 风险极高，需要立即采取管控措施 |

**参数化优势**

- 等级分值区间可通过数据库调整，无需重新部署代码
- 支持新增/禁用等级（如临时增加"极低风险"级别）
- 颜色代码支持前端展示统一管理
- 等级描述支持动态展示

### 3.3 hse_grid_inspection_records（网格巡查记录表）

**用途**：存储各级网格长巡查记录，支撑管理履职风险积分计算和驾驶舱巡查统计。

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| employee_id | BIGINT | 巡查人ID（FK→employee） |
| employee_code | VARCHAR(64) | 巡查人工号 |
| employee_name | VARCHAR(128) | 巡查人姓名 |
| grid_level | VARCHAR(32) | 网格级别（总/一级/二级/三级） |
| grid_role | VARCHAR(64) | 网格角色 |
| inspection_date | DATE | 巡查日期 |
| inspection_type | VARCHAR(32) | 巡查类型（routine/special/followup） |
| inspection_area | VARCHAR(256) | 巡查区域 |
| inspection_content | TEXT | 巡查内容 |
| problems_found | TEXT | 发现问题 |
| rectification_status | VARCHAR(32) | 整改状态（pending/completed/overdue） |
| rectification_deadline | DATE | 整改截止日期 |
| rectification_result | TEXT | 整改结果 |
| inspector_id | BIGINT | 被巡查人ID |
| inspector_name | VARCHAR(128) | 被巡查人姓名 |
| org_id | BIGINT | 组织ID |
| org_name | VARCHAR(256) | 组织名称 |
| remark | TEXT | 备注 |

**网格长等级映射**

| 网格级别 | grid_level值 | 巡查频次 | 对应管理岗位 |
|----------|-------------|----------|-------------|
| 总网格长 | chief | 1次/3天 | 总经理 |
| 一级网格长 | level1 | 1次/2天 | 部门经理/乡镇作业中心经理 |
| 二级网格长 | level2 | 1次/天 | 环卫作业中心片区长 |
| 三级网格长 | level3 | 1次/天 | 管理员/网格长 |

**巡查类型**

| 类型代码 | 说明 | 使用场景 |
|----------|------|----------|
| routine | 日常巡查 | 按频次执行的常规巡查 |
| special | 专项检查 | 针对特定主题或问题检查 |
| followup | 跟踪复查 | 对已发现问题整改复查 |

**整改状态**

| 状态代码 | 说明 |
|----------|------|
| pending | 待整改 |
| completed | 已整改 |
| overdue | 逾期未整改 |

**索引设计**

| 索引名 | 字段 | 用途 |
|--------|------|------|
| idx_grid_inspection_employee_id | employee_id | 按巡查人查询 |
| idx_grid_inspection_date | inspection_date | 按日期查询 |
| idx_grid_inspection_grid_level | grid_level | 按网格级别筛选 |
| idx_grid_inspection_org_id | org_id | 按组织查询 |

## 四、数据模型关系图

```
employee（员工主表）
    │
    ├── risk_score_records（风险评分记录 - Sprint6.2）
    │       存储每次计算的完整评分结果
    │
    ├── risk_level_records（风险等级记录 - Sprint6.2）
    │       存储等级变更历史，is_active标记当前等级
    │
    ├── risk_score_history（风险评分历史 - Sprint6.3-A 新增）
    │       按日/周/月存储评分快照，支持趋势分析
    │
    └── hse_grid_inspection_records（网格巡查记录 - Sprint6.3-A 新增）
            存储各级网格长巡查记录

risk_level_config（风险等级配置 - Sprint6.3-A 新增）
        参数化管理风险等级分值区间

position_risk_mapping（岗位风险映射 - Sprint6.1-G）
        提供risk_category和management_level

hse_responsibility（责任信息 - Sprint6.1-H-2）
        提供grid_level和grid_role
```

## 五、与Sprint6.2的衔接

| 衔接点 | 说明 |
|--------|------|
| 评分数据来源 | risk_score_history的评分数据从risk_score_records计算结果同步 |
| 等级判定 | 通过risk_level_config参数化配置动态判定风险等级 |
| 管理履职 | hse_grid_inspection_records为管理履职积分计算提供事实数据 |
| 岗位映射 | 通过position_risk_mapping获取risk_category和management_level |
| 责任信息 | 通过hse_responsibility获取grid_level确定巡查频次要求 |

## 六、约束遵守

| 约束 | 遵守情况 |
|------|----------|
| 禁止修改风险评分模型 | ✓ 未修改riskScoreService.js中的任何评分逻辑 |
| 禁止修改岗位权重 | ✓ 未修改FROZEN_WEIGHT_MATRIX冻结权重 |
| 禁止修改员工主数据 | ✓ 未修改employee表结构 |
| 未修改组织模型 | ✓ 未修改department/org相关表结构 |

## 七、数据库脚本

| 脚本 | 路径 | 说明 |
|------|------|------|
| 驾驶舱表初始化 | [init-dashboard-tables.js](file:///f:/deploy/hse-dashboard/server/init-dashboard-tables.js) | 创建3张新表+索引+默认配置 |
| 现状调研 | [survey-sprint63a.js](file:///f:/deploy/hse-dashboard/server/survey-sprint63a.js) | 调研现有数据库表结构 |

## 八、设计总结

Sprint6.3-A驾驶舱数据模型设计完成，新增3张数据表：

1. **risk_score_history**：风险评分历史表，24个字段，支持按日/周/月存储评分快照，5个索引优化趋势查询性能，覆盖员工、组织、岗位类别等多维趋势分析
2. **risk_level_config**：风险等级配置表，9个字段，参数化管理4级风险等级的分值区间、颜色代码和描述，支持动态调整无需改代码
3. **hse_grid_inspection_records**：网格巡查记录表，20个字段，支持4级网格长巡查记录管理，包含巡查内容、发现问题、整改状态全流程跟踪，10个索引优化查询性能

所有新增表均未修改现有风险评分模型、岗位权重和员工主数据，严格遵循Sprint6.2冻结的模型体系。
