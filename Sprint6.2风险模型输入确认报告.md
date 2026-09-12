# Sprint6.2 风险模型输入确认报告

## 一、概述

本报告确认Sprint6.2风险等级管控模块的最终输入数据模型，为风险评分计算提供标准化基础。

## 二、输入数据源确认

### 2.1 核心输入表

| 表名 | 说明 | 关联字段 | 状态 |
|------|------|----------|------|
| employee | 员工主数据 | id | ✅ 已确认 |
| hse_employee_relation | 员工岗位关系 | employee_id, position_id | ✅ 已确认 |
| risk_type_dict | 风险类型字典 | risk_code | ✅ 已确认 |
| position_risk_mapping | 岗位风险映射 | position_name, position_id | ✅ 已确认 |
| position_alias_mapping | 岗位别名映射 | standard_position_name, alias_position_name | ✅ 已确认 |
| violation_records | 三违记录 | violator_id | ✅ 已确认 |
| hse_incident_records | 事故记录 | employee_id | ✅ 已确认 |
| training_records | 培训记录 | personnel_id | ✅ 已确认 |
| license_demerit_records | 驾驶证扣分记录 | employee_id | ✅ 已确认 |
| hse_driver_inspection_records | 三检记录 | employee_id | ✅ 已确认 |
| management_execution | 管理履职记录 | employee_id | ✅ 已确认 |

### 2.2 数据关联关系确认

```
employee (id)
  ├── hse_employee_relation (employee_id) → position (id)
  │     ├── position_risk_mapping (position_name 或 position_id)
  │     │     └── risk_type_dict (risk_code)
  │     │
  │     └── position_alias_mapping (standard_position_name, alias_position_name)
  │
  ├── violation_records (violator_id)
  ├── hse_incident_records (employee_id)
  ├── training_records (personnel_id)
  ├── license_demerit_records (employee_id)
  ├── hse_driver_inspection_records (employee_id)
  └── management_execution (employee_id)
```

## 三、风险类型输入模型确认

### 3.1 三违风险

| 属性 | 值 | 状态 |
|------|-----|------|
| 风险编码 | violation | ✅ 已确认 |
| 风险名称 | 三违风险 | ✅ 已确认 |
| 风险大类 | behavior | ✅ 已确认 |
| 数据来源 | violation_records | ✅ 已确认 |
| 统计周期 | 近12个月 | ✅ 已确认 |
| 适用范围 | all | ✅ 已确认 |

**输入指标**:
- count12m: 近12个月记录数
- types: 按violation_type分组计数
- pendingCount: 待处理三违数
- latestDate: 最近三违日期

### 3.2 驾驶合规风险

| 属性 | 值 | 状态 |
|------|-----|------|
| 风险编码 | driver_compliance | ✅ 已确认 |
| 风险名称 | 驾驶合规风险 | ✅ 已确认 |
| 风险大类 | behavior | ✅ 已确认 |
| 数据来源 | license_demerit_records, hse_driver_inspection_records | ✅ 已确认 |
| 统计周期 | 近5年（驾驶证）/ 全部历史（三检） | ✅ 已确认 |
| 适用范围 | driver | ✅ 已确认 |

**输入指标**:
- licenseDemeritPoints: 近5年累计扣分
- licenseDemeritCount: 近5年扣分次数
- inspectionCount: 三检总次数
- inspectionCompletedCount: 三检完成次数
- inspectionCompletionRate: 三检完成率

### 3.3 培训合规风险

| 属性 | 值 | 状态 |
|------|-----|------|
| 风险编码 | training_compliance | ✅ 已确认 |
| 风险名称 | 培训合规风险 | ✅ 已确认 |
| 风险大类 | capability | ✅ 已确认 |
| 数据来源 | training_records | ✅ 已确认 |
| 统计周期 | 全部历史 | ✅ 已确认 |
| 适用范围 | all | ✅ 已确认 |

**输入指标**:
- totalCount: 培训总次数
- completedCount: 合格次数
- pendingCount: 待培训次数
- expiredCount: 过期培训次数（预留）

### 3.4 事故风险

| 属性 | 值 | 状态 |
|------|-----|------|
| 风险编码 | incident | ✅ 已确认 |
| 风险名称 | 事故风险 | ✅ 已确认 |
| 风险大类 | event | ✅ 已确认 |
| 数据来源 | hse_incident_records | ✅ 已确认 |
| 统计周期 | 全部历史 | ✅ 已确认 |
| 适用范围 | all | ✅ 已确认 |

**输入指标**:
- totalCount: 事故总次数
- responsibilityCount: 责任事故次数
- types: 事故类型分布
- latestDate: 最近事故日期

**事故子分类**:
- 生产安全事故
- 交通事故
- 环境污染事故

### 3.5 管理履职风险

| 属性 | 值 | 状态 |
|------|-----|------|
| 风险编码 | management_execution | ✅ 已确认 |
| 风险名称 | 管理履职风险 | ✅ 已确认 |
| 风险大类 | management | ✅ 已确认 |
| 数据来源 | management_execution | ✅ 已确认 |
| 统计周期 | 全部历史 | ✅ 已确认 |
| 适用范围 | management | ✅ 已确认 |

**输入指标**:
- totalCount: 巡查总次数
- completedCount: 完成次数
- problemsFoundCount: 发现问题数
- rectifiedCount: 已整改数

## 四、岗位风险输入模型确认

### 4.1 驾驶员岗位

| 属性 | 值 | 状态 |
|------|-----|------|
| 岗位分类 | driver | ✅ 已确认 |
| 适用风险类型 | violation, driver_compliance, training_compliance, incident | ✅ 已确认 |

**岗位列表**:
- 垃圾转运车驾驶员（position_id: 1397）
- 垃圾收运车驾驶员（position_id: 1385）
- 吸污车驾驶员
- 勾臂车司机

**风险权重建议**:
| 风险类型 | 权重 |
|----------|------|
| 三违风险 | 30% |
| 驾驶合规风险 | 35% |
| 培训合规风险 | 20% |
| 事故风险 | 35% |

### 4.2 普通作业岗位

| 属性 | 值 | 状态 |
|------|-----|------|
| 岗位分类 | normal | ✅ 已确认 |
| 适用风险类型 | violation, training_compliance, incident | ✅ 已确认 |

**岗位列表**:
- 保洁员（position_id: 1386）
- 挂桶员

**风险权重建议**:
| 风险类型 | 权重 |
|----------|------|
| 三违风险 | 45% |
| 培训合规风险 | 25% |
| 事故风险 | 45% |

### 4.3 基层管理岗位

| 属性 | 值 | 状态 |
|------|-----|------|
| 岗位分类 | management | ✅ 已确认 |
| 适用风险类型 | violation, training_compliance, incident, management_execution | ✅ 已确认 |

**岗位列表**:
- 管理员（position_id: 1374，人工班长）
- 网格长
- 片区长（position_id: 1383）
- 乡镇作业中心经理（人工片区长）
- 环卫作业中心片区长

**风险权重建议**:
| 风险类型 | 权重 |
|----------|------|
| 三违风险 | 25% |
| 培训合规风险 | 20% |
| 事故风险 | 30% |
| 管理履职风险 | 40% |

### 4.4 中层管理岗位

| 属性 | 值 | 状态 |
|------|-----|------|
| 岗位分类 | management | ✅ 已确认 |
| 适用风险类型 | violation, training_compliance, incident, management_execution | ✅ 已确认 |

**岗位列表**:
- 部门经理

**风险权重建议**:
| 风险类型 | 权重 |
|----------|------|
| 三违风险 | 15% |
| 培训合规风险 | 25% |
| 事故风险 | 30% |
| 管理履职风险 | 50% |

### 4.5 高层管理岗位

| 属性 | 值 | 状态 |
|------|-----|------|
| 岗位分类 | management | ✅ 已确认 |
| 适用风险类型 | violation, training_compliance, incident, management_execution | ✅ 已确认 |

**岗位列表**:
- 总经理

**风险权重建议**:
| 风险类型 | 权重 |
|----------|------|
| 三违风险 | 10% |
| 培训合规风险 | 25% |
| 事故风险 | 30% |
| 管理履职风险 | 55% |

## 五、风险评分输入接口确认

### 5.1 员工基础画像接口

**接口**: `GET /api/hse/risk-profile/employee/{employeeId}`

**返回结构**:

```json
{
  "employee": { "id", "name", "position" },
  "organization": { ... },
  "operationUnit": { ... },
  "position": { "id", "name" },
  "responsibility": { ... }
}
```

**状态**: ✅ 已实现

### 5.2 风险事实数据接口

**接口**: `GET /api/hse/risk-profile/employee/{employeeId}/risks`

**返回结构**:

```json
{
  "violationRisk": { ... },
  "incidentRisk": { ... },
  "trainingComplianceRisk": { ... }
}
```

**状态**: ✅ 已实现

### 5.3 驾驶员风险接口

**接口**: `GET /api/hse/risk-profile/employee/{employeeId}/driver-risk`

**返回结构**:

```json
{
  "driverComplianceRisk": {
    "licenseRisk": { ... },
    "inspectionRisk": { ... }
  }
}
```

**状态**: ✅ 已实现

### 5.4 建议新增接口

| 接口 | 说明 | 优先级 |
|------|------|--------|
| GET /api/hse/risk-profile/risk-types | 查询风险类型字典 | 中 |
| GET /api/hse/risk-profile/position-mapping/{positionId} | 查询岗位风险映射 | 中 |
| GET /api/hse/risk-profile/position-mapping/by-name/{positionName} | 通过岗位名称查询映射 | 中 |
| GET /api/hse/risk-profile/risk-score/{employeeId} | 计算风险评分 | 高（Sprint6.2） |

## 六、数据质量要求

### 6.1 数据准确性

| 要求 | 说明 | 检查方法 |
|------|------|----------|
| employee_id一致性 | 所有风险数据必须通过employee_id关联 | 抽样验证 |
| position_id有效性 | position_id必须存在于position表 | 外键约束 |
| 日期有效性 | 日期字段必须在合理范围内 | 数据校验 |
| 状态规范性 | 状态字段必须使用标准值 | 数据字典 |

### 6.2 数据完整性

| 要求 | 说明 | 检查方法 |
|------|------|----------|
| 必填字段 | 关键字段不能为空 | 非空约束 |
| 关联完整性 | employee_id必须存在于employee表 | 外键约束 |
| 业务完整性 | 风险记录必须有对应的事件描述 | 业务规则 |

### 6.3 数据一致性

| 要求 | 说明 | 检查方法 |
|------|------|----------|
| 岗位名称一致性 | position_name与position表一致 | 定期同步 |
| 风险类型一致性 | applicable_risk_types与risk_type_dict一致 | 数据校验 |
| 统计周期一致性 | stat_period与业务规则一致 | 业务规则 |

## 七、风险等级计算输入

### 7.1 计算流程确认

```
输入: employeeId
  ↓
1. 查询员工基础信息（岗位ID）
  ↓
2. 查询岗位风险映射（适用风险类型）
  ↓
3. 查询各风险类型指标数据
  ↓
4. 计算各风险类型得分
  ↓
5. 加权计算综合得分
  ↓
6. 确定风险等级
  ↓
输出: 风险等级（低/中/高/极高）
```

### 7.2 风险等级定义

| 等级 | 得分范围 | 颜色 | 说明 |
|------|----------|------|------|
| 低 | 0-30分 | 绿色 | 风险可控 |
| 中 | 31-60分 | 黄色 | 风险可控，需关注 |
| 高 | 61-80分 | 橙色 | 风险较高，需管控 |
| 极高 | 81-100分 | 红色 | 风险极高，需重点管控 |

### 7.3 输入数据要求

| 数据项 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| employeeId | Integer | 是 | 员工ID |
| positionId | Integer | 是 | 岗位ID |
| applicableRiskTypes | Array | 是 | 适用风险类型列表 |
| riskTypeData | Object | 是 | 各风险类型指标数据 |

## 八、后续开发建议

### 8.1 Sprint6.2开发要点

1. **风险评分计算引擎**：基于输入指标和权重计算风险等级
2. **风险等级定义**：建立风险等级字典（低/中/高/极高）
3. **风险趋势分析**：分析风险变化趋势
4. **风险预警机制**：根据风险等级触发预警

### 8.2 数据扩展建议

1. 为risk_type_dict增加权重配置字段
2. 建立风险等级阈值配置表
3. 增加风险评分历史记录表
4. 建立风险预警规则配置表

### 8.3 API扩展建议

1. 新增风险类型字典查询接口
2. 新增岗位风险映射查询接口
3. 新增风险评分计算接口
4. 新增风险预警查询接口

## 九、收口确认

### 9.1 数据模型收口

| 项目 | 状态 | 说明 |
|------|------|------|
| 风险类型字典 | ✅ 已冻结 | 5个标准化风险类型 |
| 岗位风险映射 | ✅ 已冻结 | 支持position_id关联 |
| 岗位别名映射 | ✅ 已冻结 | 3组别名映射 |

### 9.2 API收口

| 项目 | 状态 | 说明 |
|------|------|------|
| 员工基础画像API | ✅ 已实现 | 返回员工、组织、岗位、责任信息 |
| 风险事实数据API | ✅ 已实现 | 返回三违、事故、培训风险 |
| 驾驶员风险API | ✅ 已实现 | 返回驾驶合规风险 |

### 9.3 约束合规

| 约束项 | 状态 | 说明 |
|--------|------|------|
| 禁止开发风险评分 | ✅ 符合 | 仅提供输入模型 |
| 禁止修改employee | ✅ 符合 | 未修改employee表 |
| 禁止修改组织模型 | ✅ 符合 | 未修改组织相关表 |
| 禁止新增车辆关系 | ✅ 符合 | 未建立车辆绑定 |