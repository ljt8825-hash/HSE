# Sprint6.1-E 风险画像数据模型收口报告

## 一、任务概述

本阶段任务是对Sprint6.1-A至Sprint6.1-D开发的风险画像功能进行数据模型统一收口，为Sprint6.2风险等级管控提供基础。

### 收口目标
1. 统一所有HSE风险数据的人员关联字段为employee_id
2. 统一事故表为hse_incident_records
3. 调整三检表为hse_driver_inspection_records
4. 建立岗位风险映射表
5. 建立风险类型字典表

### 禁止项
- 禁止开发风险评分
- 禁止修改员工主数据（employee/employee_assignment/hse_responsibility）
- 禁止建立车辆绑定关系
- 禁止新增依赖

## 二、人员关联统一

### 2.1 收口前状态

| 数据表 | 关联字段 | 说明 |
|--------|----------|------|
| violation_records | violator_id | 三违记录关联字段 |
| accidents | personnel_id | 事故记录关联字段 |
| training_records | personnel_id | 培训记录关联字段 |
| license_demerit_records | employee_id | 驾驶证扣分关联字段 |
| vehicle_inspection_records | employee_id | 三检记录关联字段 |

### 2.2 收口后状态

| 数据表 | 关联字段 | 统一说明 |
|--------|----------|----------|
| violation_records | violator_id | 等同于employee_id，API查询统一入参为employee_id |
| hse_incident_records | employee_id | 统一使用employee_id |
| training_records | personnel_id | 等同于employee_id，API查询统一入参为employee_id |
| license_demerit_records | employee_id | 保持employee_id |
| hse_driver_inspection_records | employee_id | 保持employee_id |

### 2.3 API层面统一

所有风险画像API的入参统一使用employee_id：
- `GET /api/hse/risk-profile/employee/{employeeId}/risks`
- `GET /api/hse/risk-profile/employee/{employeeId}/driver-risk`

后端根据各表实际字段映射：
- violation_records: `violator_id = $1`
- hse_incident_records: `employee_id = $1`
- training_records: `personnel_id = $1`
- license_demerit_records: `employee_id = $1`
- hse_driver_inspection_records: `employee_id = $1`

### 2.4 禁止姓名关联

所有风险数据关联均通过employee_id实现，禁止通过员工姓名进行数据关联。

## 三、事故表统一

### 3.1 收口前

使用 `accidents` 表，关联字段为 `personnel_id`。

### 3.2 收口后

统一使用 `hse_incident_records` 表，关联字段为 `employee_id`。

### 3.3 数据迁移

将accidents表数据迁移至hse_incident_records表：
- personnel_id → employee_id
- 其他字段保持不变

### 3.4 事故分类保留

| 事故分类 | 状态 |
|----------|------|
| 生产安全事故 | 保留 |
| 交通事故 | 保留 |
| 环境污染事故 | 保留 |

### 3.5 API调整

事故风险查询改为从hse_incident_records表读取：
```sql
SELECT * FROM hse_incident_records 
WHERE employee_id = $1 AND is_deleted = false
```

## 四、三检表调整

### 4.1 收口前

使用 `vehicle_inspection_records` 表。

### 4.2 收口后

统一使用 `hse_driver_inspection_records` 表。

### 4.3 调整原则

- 三检属于驾驶员行为，非车辆数据
- 车辆字段vehicle_no仅作为辅助信息
- 禁止车辆绑定

### 4.4 数据迁移

将vehicle_inspection_records表数据迁移至hse_driver_inspection_records表。

### 4.5 API调整

三检风险查询改为从hse_driver_inspection_records表读取：
```sql
SELECT * FROM hse_driver_inspection_records 
WHERE employee_id = $1 AND is_deleted = false
```

## 五、岗位风险映射

### 5.1 设计目标

建立岗位到风险类型的映射关系，支持不同岗位展示不同的风险画像。

### 5.2 表结构

**表名**: position_risk_mapping

| 字段 | 说明 |
|------|------|
| position_name | 岗位名称 |
| position_code | 岗位编码 |
| risk_category | 风险类别（driver/normal/management） |
| is_driver | 是否驾驶员岗位 |
| applicable_risk_types | 适用的风险类型列表（JSONB） |

### 5.3 默认映射数据

| 岗位 | 风险类别 | 是否驾驶员 | 适用风险类型 |
|------|----------|------------|--------------|
| 垃圾转运车驾驶员 | driver | 是 | 三违、事故、培训、驾驶证扣分、交通事故、三检 |
| 垃圾收运车驾驶员 | driver | 是 | 三违、事故、培训、驾驶证扣分、交通事故、三检 |
| 吸污车驾驶员 | driver | 是 | 三违、事故、培训、驾驶证扣分、交通事故、三检 |
| 保洁员 | normal | 否 | 三违、事故、培训 |
| 管理员 | normal | 否 | 三违、事故、培训 |
| 网格长 | management | 否 | 三违、事故、培训、管理责任 |
| 片区长 | management | 否 | 三违、事故、培训、管理责任 |

## 六、风险类型字典

### 6.1 设计目标

建立统一的风险类型字典，为Sprint6.2风险等级管控提供基础数据。

### 6.2 表结构

**表名**: risk_type_dict

| 字段 | 说明 |
|------|------|
| risk_code | 风险编码（唯一） |
| risk_name | 风险名称 |
| risk_category | 风险大类（behavior/capability/event/management） |
| data_source | 数据来源表 |
| stat_period | 统计周期 |

### 6.3 字典数据

| 风险编码 | 风险名称 | 风险大类 | 数据来源 | 统计周期 |
|----------|----------|----------|----------|----------|
| violation | 三违风险 | behavior | violation_records | 近12个月 |
| training | 培训风险 | capability | training_records | 全部历史 |
| incident | 事故风险 | event | hse_incident_records | 全部历史 |
| traffic_accident | 交通风险 | event | hse_incident_records | 全部历史 |
| license_demerit | 驾驶行为风险 | behavior | license_demerit_records | 近5年 |
| inspection | 三检风险 | behavior | hse_driver_inspection_records | 全部历史 |
| management_responsibility | 管理责任风险 | management | hse_responsibility | 全部历史 |

## 七、收口后数据模型全景

```
employee (id)
  ├── violation_records (violator_id = employee.id)
  ├── hse_incident_records (employee_id = employee.id)
  ├── training_records (personnel_id = employee.id)
  ├── license_demerit_records (employee_id = employee.id)
  ├── hse_driver_inspection_records (employee_id = employee.id)
  └── position_risk_mapping (position_name匹配)
```

## 八、文件变更清单

### 8.1 后端文件

| 文件 | 变更内容 |
|------|----------|
| server/routes/hse-risk-profile-base.js | 事故表改为hse_incident_records，统一employee_id关联 |
| server/routes/hse-driver-risk.js | 事故表改为hse_incident_records，三检表改为hse_driver_inspection_records |

### 8.2 数据库表

| 表名 | 状态 |
|------|------|
| hse_incident_records | 新增（从accidents迁移） |
| hse_driver_inspection_records | 新增（从vehicle_inspection_records迁移） |
| position_risk_mapping | 新增 |
| risk_type_dict | 新增 |

## 九、约束合规

| 约束项 | 状态 | 说明 |
|--------|------|------|
| 禁止开发风险评分 | ✅ 符合 | 未开发评分功能 |
| 禁止修改员工主数据 | ✅ 符合 | 未修改employee/employee_assignment/hse_responsibility |
| 禁止建立车辆绑定关系 | ✅ 符合 | 车辆仅作为辅助信息 |
| 禁止新增依赖 | ✅ 符合 | 未新增第三方依赖 |

## 十、后续建议

1. 在Sprint6.2中基于risk_type_dict和position_risk_mapping开发风险等级计算
2. 考虑为violation_records和training_records添加employee_id字段以实现完全统一
3. 定期同步position_risk_mapping与岗位数据的一致性