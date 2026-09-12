# Sprint6.2 输入模型说明文档

## 一、概述

本文档定义Sprint6.2风险等级管控模块的输入数据模型，为风险评分计算提供标准化基础。

## 二、输入数据源

### 2.1 核心输入表

| 表名 | 说明 | 关联字段 |
|------|------|----------|
| employee | 员工主数据 | id |
| hse_employee_relation | 员工岗位关系 | employee_id, position_id |
| risk_type_dict | 风险类型字典 | risk_code |
| position_risk_mapping | 岗位风险映射 | position_name |
| violation_records | 三违记录 | violator_id |
| hse_incident_records | 事故记录 | employee_id |
| training_records | 培训记录 | personnel_id |
| license_demerit_records | 驾驶证扣分记录 | employee_id |
| hse_driver_inspection_records | 三检记录 | employee_id |
| management_execution | 管理履职记录 | employee_id |

### 2.2 数据关联关系

```
employee (id)
  ├── hse_employee_relation (employee_id) → position (id)
  │     └── position_risk_mapping (position_name)
  │           └── risk_type_dict (risk_code)
  │
  ├── violation_records (violator_id)
  ├── hse_incident_records (employee_id)
  ├── training_records (personnel_id)
  ├── license_demerit_records (employee_id)
  ├── hse_driver_inspection_records (employee_id)
  └── management_execution (employee_id)
```

## 三、风险类型输入模型

### 3.1 三违风险输入

**风险编码**: violation

**数据来源**: violation_records

**输入指标**:

| 指标名称 | 字段来源 | 计算方式 |
|----------|----------|----------|
| count12m | violation_records | 近12个月记录数 |
| types | violation_records | 按violation_type分组计数 |
| pendingCount | violation_records | status='待处理'或'整改中'的记录数 |
| latestDate | violation_records | 最近一条记录的violation_date |

**统计周期**: 近12个月

**适用范围**: all

### 3.2 驾驶合规风险输入

**风险编码**: driver_compliance

**数据来源**: license_demerit_records, hse_driver_inspection_records

**输入指标**:

| 指标名称 | 字段来源 | 计算方式 |
|----------|----------|----------|
| licenseDemeritPoints | license_demerit_records | 近5年demerit_points总和 |
| licenseDemeritCount | license_demerit_records | 近5年记录数 |
| inspectionCount | hse_driver_inspection_records | 总记录数 |
| inspectionCompletedCount | hse_driver_inspection_records | result='合格'的记录数 |
| inspectionCompletionRate | hse_driver_inspection_records | completedCount/count*100 |

**统计周期**: 近5年（驾驶证扣分）/ 全部历史（三检）

**适用范围**: driver

### 3.3 培训合规风险输入

**风险编码**: training_compliance

**数据来源**: training_records

**输入指标**:

| 指标名称 | 字段来源 | 计算方式 |
|----------|----------|----------|
| totalCount | training_records | 总记录数 |
| completedCount | training_records | result='合格'的记录数 |
| pendingCount | training_records | result<>'合格'的记录数 |
| expiredCount | training_records | 过期培训记录数（预留） |

**统计周期**: 全部历史

**适用范围**: all

### 3.4 事故风险输入

**风险编码**: incident

**数据来源**: hse_incident_records

**输入指标**:

| 指标名称 | 字段来源 | 计算方式 |
|----------|----------|----------|
| totalCount | hse_incident_records | 总记录数 |
| responsibilityCount | hse_incident_records | responsibility<>''的记录数 |
| types | hse_incident_records | 按accident_type分组计数 |
| latestDate | hse_incident_records | 最近一条记录的accident_date |

**统计周期**: 全部历史

**适用范围**: all

**事故子分类**:

| 子分类 | accident_type值 |
|--------|-----------------|
| 生产安全事故 | 生产安全事故 |
| 交通事故 | 交通事故 |
| 环境污染事故 | 环境污染事故 |

### 3.5 管理履职风险输入

**风险编码**: management_execution

**数据来源**: management_execution

**输入指标**:

| 指标名称 | 字段来源 | 计算方式 |
|----------|----------|----------|
| totalCount | management_execution | 总记录数 |
| completedCount | management_execution | result='合格'的记录数 |
| problemsFoundCount | management_execution | problems_found<>''的记录数 |
| rectifiedCount | management_execution | rectification_status='已整改'的记录数 |

**统计周期**: 全部历史

**适用范围**: management

**执行类型**:

| 类型 | 说明 |
|------|------|
| 安全巡查 | 安全隐患巡查 |
| 安全检查 | 安全检查 |
| 管理检查 | 管理职责检查 |

## 四、岗位风险输入模型

### 4.1 驾驶员岗位

**风险类别**: driver

**适用风险类型**:

| 风险编码 | 风险名称 | 权重建议 |
|----------|----------|----------|
| violation | 三违风险 | 中 |
| driver_compliance | 驾驶合规风险 | 高 |
| training_compliance | 培训合规风险 | 中 |
| incident | 事故风险 | 高 |

**驾驶合规风险权重分配**:

| 子项 | 权重建议 |
|------|----------|
| 驾驶证扣分 | 60% |
| 三检执行 | 40% |

### 4.2 普通员工岗位

**风险类别**: normal

**适用风险类型**:

| 风险编码 | 风险名称 | 权重建议 |
|----------|----------|----------|
| violation | 三违风险 | 高 |
| training_compliance | 培训合规风险 | 中 |
| incident | 事故风险 | 高 |

### 4.3 管理岗位

**风险类别**: management

**适用风险类型**:

| 风险编码 | 风险名称 | 权重建议 |
|----------|----------|----------|
| violation | 三违风险 | 中 |
| training_compliance | 培训合规风险 | 中 |
| incident | 事故风险 | 高 |
| management_execution | 管理履职风险 | 高 |

## 五、风险评分输入接口

### 5.1 员工风险画像接口

**接口**: `GET /api/hse/risk-profile/employee/{employeeId}`

**返回结构**:

```json
{
  "employee": { "id", "name", "position" },
  "organization": { ... },
  "operationUnit": { ... },
  "position": { "name" },
  "responsibility": { ... }
}
```

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

### 5.4 风险类型字典接口（预留）

**建议新增接口**: `GET /api/hse/risk-profile/risk-types`

**返回结构**:

```json
{
  "riskTypes": [
    {
      "riskCode", "riskName", "riskCategory",
      "dataSource", "statPeriod", "applicableScope", "displayOrder"
    }
  ]
}
```

### 5.5 岗位风险映射接口（预留）

**建议新增接口**: `GET /api/hse/risk-profile/position-mapping/{positionName}`

**返回结构**:

```json
{
  "positionName", "riskCategory", "isDriver",
  "applicableRiskTypes": ["riskCode1", "riskCode2", ...]
}
```

## 六、输入数据校验规则

### 6.1 员工有效性校验

```
1. employee.id 必须存在且 is_deleted = false
2. 通过hse_employee_relation获取当前岗位
3. 通过position_risk_mapping获取风险类别和适用风险类型
```

### 6.2 风险数据完整性校验

```
1. 根据risk_type_dict.data_source校验各表数据是否存在
2. 根据risk_type_dict.stat_period校验统计周期是否正确
3. 根据risk_type_dict.applicable_scope校验适用范围是否匹配
```

### 6.3 空值处理规则

```
1. 无风险记录时返回 hasRecords: false
2. 统计指标为空时返回默认值（0或null）
3. 字符串字段为空时返回空字符串
```

## 七、数据质量要求

### 7.1 数据准确性

| 要求 | 说明 |
|------|------|
| employee_id一致性 | 所有风险数据必须通过employee_id关联 |
| 日期有效性 | 日期字段必须在合理范围内 |
| 状态规范性 | 状态字段必须使用标准值 |

### 7.2 数据完整性

| 要求 | 说明 |
|------|------|
| 必填字段 | 关键字段不能为空 |
| 关联完整性 | employee_id必须存在于employee表 |
| 业务完整性 | 风险记录必须有对应的事件描述 |

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