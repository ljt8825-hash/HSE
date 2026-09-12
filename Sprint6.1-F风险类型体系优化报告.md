# Sprint6.1-F 风险类型体系优化报告

## 一、任务概述

本阶段任务是对Sprint6.1-E设计的风险类型字典进行优化，建立更清晰的风险体系结构，为Sprint6.2风险等级模型提供稳定基础。

### 优化目标
1. 调整风险体系结构，建立四级风险分类
2. 为risk_type_dict增加applicable_scope字段
3. 调整三检风险描述，强调驾驶行为属性
4. 事故风险保留子分类，禁止交通风险作为独立一级风险
5. 管理责任风险调整为管理履职风险

### 禁止项
- 禁止开发风险评分
- 禁止修改员工主数据
- 禁止修改组织模型

## 二、风险体系调整

### 2.1 调整前体系

| 风险大类 | 风险类型 |
|----------|----------|
| behavior | 三违风险 |
| behavior | 驾驶行为风险 |
| behavior | 三检风险 |
| capability | 培训风险 |
| event | 事故风险 |
| event | 交通风险 |
| management | 管理责任风险 |

### 2.2 调整后体系

```
行为风险 (behavior)
├── 三违风险 (violation)
└── 驾驶合规风险 (driver_compliance)
    ├── 驾驶证扣分
    └── 三检执行

能力风险 (capability)
└── 培训合规风险 (training_compliance)

事件风险 (event)
└── 事故风险 (incident)
    ├── 生产安全事故
    ├── 交通事故
    └── 环境污染事故

管理风险 (management)
└── 管理履职风险 (management_execution)
```

### 2.3 调整说明

| 调整项 | 调整前 | 调整后 | 说明 |
|--------|--------|--------|------|
| 驾驶行为风险 | 独立风险类型 | 合并入驾驶合规风险 | 驾驶证扣分和三检执行统一为驾驶合规 |
| 三检风险 | 车辆三检完成情况 | 驾驶员三检执行情况 | 强调属于驾驶员行为 |
| 交通风险 | 独立一级风险 | 事故风险子分类 | 禁止交通风险独立 |
| 培训风险 | 培训风险 | 培训合规风险 | 强调合规属性 |
| 管理责任风险 | 基于hse_responsibility | 管理履职风险 | 新增management_execution表 |

## 三、字段优化

### 3.1 新增字段

**字段名**: `applicable_scope`

**类型**: `VARCHAR(255)`

**说明**: 风险适用岗位范围

**取值**:
- `all`: 所有岗位
- `driver`: 仅驾驶员岗位
- `management`: 仅管理岗位

### 3.2 更新后表结构

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| risk_code | VARCHAR(32) | 风险编码（唯一） |
| risk_name | VARCHAR(64) | 风险名称 |
| risk_category | VARCHAR(32) | 风险大类 |
| description | TEXT | 风险描述 |
| data_source | VARCHAR(128) | 数据来源表 |
| stat_period | VARCHAR(32) | 统计周期 |
| applicable_scope | VARCHAR(255) | 适用岗位范围 |
| is_active | BOOLEAN | 是否启用 |
| display_order | INT | 显示顺序 |

## 四、三检风险调整

### 4.1 调整前

- **风险名称**: 三检风险
- **描述**: 车辆三检完成情况
- **风险大类**: behavior

### 4.2 调整后

- **风险名称**: 三检执行（驾驶合规风险子项）
- **描述**: 驾驶员三检执行情况
- **风险大类**: behavior（驾驶合规风险下）

### 4.3 调整原则

- 三检属于驾驶员行为，非车辆数据
- 强调驾驶员作为风险主体
- 车辆字段仅作为辅助信息

## 五、事故风险调整

### 5.1 调整前

| 风险类型 | 风险大类 | 说明 |
|----------|----------|------|
| 事故风险 | event | 生产安全事故、交通事故、环境污染事故 |
| 交通风险 | event | 交通事故专项统计（独立一级风险） |

### 5.2 调整后

| 风险类型 | 风险大类 | 说明 |
|----------|----------|------|
| 事故风险 | event | 包含生产安全事故、交通事故、环境污染事故 |

### 5.3 事故子分类

| 事故类型 | 说明 |
|----------|------|
| 生产安全事故 | 生产过程中的安全事故 |
| 交通事故 | 交通出行中的事故 |
| 环境污染事故 | 环境污染相关事故 |

### 5.4 禁止项

禁止将交通风险作为独立一级风险，交通事故作为事故风险的子分类处理。

## 六、管理责任调整

### 6.1 hse_responsibility定位

- **仅作为**: 责任画像属性
- **用途**: 展示员工的责任配置信息
- **不参与**: 风险评分计算

### 6.2 新增管理履职风险

**风险编码**: `management_execution`

**数据来源**: `management_execution`表

**说明**: 管理职责履行、巡查执行情况

**表结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| employee_id | BIGINT | 员工ID |
| execution_type | VARCHAR(64) | 执行类型（安全巡查、安全检查等） |
| execution_date | DATE | 执行日期 |
| execution_content | TEXT | 执行内容 |
| result | VARCHAR(32) | 执行结果 |
| problems_found | VARCHAR(512) | 发现问题 |
| rectification_status | VARCHAR(32) | 整改状态 |

### 6.3 数据来源说明

管理履职风险的后续数据来源为巡查记录，当前已创建基础表结构，待后续接入巡查数据。

## 七、优化后风险字典数据

| 风险编码 | 风险名称 | 风险大类 | 数据来源 | 适用范围 | 统计周期 |
|----------|----------|----------|----------|----------|----------|
| violation | 三违风险 | behavior | violation_records | all | 近12个月 |
| driver_compliance | 驾驶合规风险 | behavior | license_demerit_records,hse_driver_inspection_records | driver | 近5年 |
| training_compliance | 培训合规风险 | capability | training_records | all | 全部历史 |
| incident | 事故风险 | event | hse_incident_records | all | 全部历史 |
| management_execution | 管理履职风险 | management | management_execution | management | 全部历史 |

## 八、岗位风险映射更新

### 8.1 驾驶员岗位

| 适用风险类型 | 风险名称 |
|--------------|----------|
| violation | 三违风险 |
| driver_compliance | 驾驶合规风险 |
| training_compliance | 培训合规风险 |
| incident | 事故风险 |

### 8.2 普通员工岗位

| 适用风险类型 | 风险名称 |
|--------------|----------|
| violation | 三违风险 |
| training_compliance | 培训合规风险 |
| incident | 事故风险 |

### 8.3 管理岗位

| 适用风险类型 | 风险名称 |
|--------------|----------|
| violation | 三违风险 |
| training_compliance | 培训合规风险 |
| incident | 事故风险 |
| management_execution | 管理履职风险 |

## 九、API调整

### 9.1 风险事实数据API

**文件**: [hse-risk-profile-base.js](file:///f:/deploy/hse-dashboard/server/routes/hse-risk-profile-base.js)

| 返回字段 | 说明 |
|----------|------|
| violationRisk | 三违风险 |
| incidentRisk | 事故风险（包含交通事故子分类） |
| trainingComplianceRisk | 培训合规风险 |

### 9.2 驾驶员风险API

**文件**: [hse-driver-risk.js](file:///f:/deploy/hse-dashboard/server/routes/hse-driver-risk.js)

| 返回字段 | 说明 |
|----------|------|
| driverComplianceRisk | 驾驶合规风险 |
| driverComplianceRisk.licenseRisk | 驾驶证扣分风险 |
| driverComplianceRisk.inspectionRisk | 三检执行风险 |

### 9.3 变更说明

- 移除 `trafficAccidentRisk` 字段
- 交通事故作为事故风险的子分类通过 `/risks` 接口查询
- 三检风险合并入 `driverComplianceRisk`

## 十、约束合规

| 约束项 | 状态 | 说明 |
|--------|------|------|
| 禁止开发风险评分 | ✅ 符合 | 未开发评分功能 |
| 禁止修改员工主数据 | ✅ 符合 | 未修改employee等表 |
| 禁止修改组织模型 | ✅ 符合 | 未修改组织相关表 |

## 十一、后续建议

1. 在Sprint6.2中基于优化后的风险体系开发风险等级计算
2. 接入巡查记录数据到management_execution表
3. 考虑为风险类型增加权重配置，为风险评分做准备
4. 建立风险数据质量监控机制