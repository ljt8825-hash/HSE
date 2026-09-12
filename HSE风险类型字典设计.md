# HSE风险类型字典设计文档

## 一、概述

风险类型字典是HSE风险画像系统的核心基础数据，用于统一管理各类风险类型的定义、数据来源和统计规则，为后续风险等级管控提供标准化基础。

## 二、表结构

### 2.1 表名

`risk_type_dict`

### 2.2 字段定义

| 字段名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | BIGSERIAL | 否 | 自增 | 主键 |
| risk_code | VARCHAR(32) | 是 | - | 风险编码（唯一） |
| risk_name | VARCHAR(64) | 是 | - | 风险名称 |
| risk_category | VARCHAR(32) | 是 | - | 风险大类 |
| description | TEXT | 否 | - | 风险描述 |
| data_source | VARCHAR(128) | 否 | - | 数据来源表名 |
| stat_period | VARCHAR(32) | 否 | - | 统计周期 |
| is_active | BOOLEAN | 否 | true | 是否启用 |
| display_order | INT | 否 | 0 | 显示顺序 |
| created_at | TIMESTAMPTZ | 否 | NOW() | 创建时间 |
| updated_at | TIMESTAMPTZ | 否 | NOW() | 更新时间 |

### 2.3 约束

- `risk_code` 字段唯一
- `risk_code` + `is_active` 组合用于业务查询

## 三、风险大类定义

| 风险大类编码 | 风险大类名称 | 说明 |
|--------------|--------------|------|
| behavior | 行为风险 | 与人员行为相关的风险 |
| capability | 能力风险 | 与培训、资质相关的风险 |
| event | 事件风险 | 与事故、事件相关的风险 |
| management | 管理风险 | 与管理责任相关的风险 |

## 四、风险类型明细

### 4.1 三违风险

| 项目 | 值 |
|------|-----|
| 风险编码 | violation |
| 风险名称 | 三违风险 |
| 风险大类 | behavior |
| 风险描述 | 违章指挥、违章操作、违反劳动纪律 |
| 数据来源 | violation_records |
| 统计周期 | 近12个月 |
| 显示顺序 | 1 |

### 4.2 培训风险

| 项目 | 值 |
|------|-----|
| 风险编码 | training |
| 风险名称 | 培训风险 |
| 风险大类 | capability |
| 风险描述 | 培训完成情况、证书状态 |
| 数据来源 | training_records |
| 统计周期 | 全部历史 |
| 显示顺序 | 2 |

### 4.3 事故风险

| 项目 | 值 |
|------|-----|
| 风险编码 | incident |
| 风险名称 | 事故风险 |
| 风险大类 | event |
| 风险描述 | 生产安全事故、交通事故、环境污染事故 |
| 数据来源 | hse_incident_records |
| 统计周期 | 全部历史 |
| 显示顺序 | 3 |

### 4.4 交通风险

| 项目 | 值 |
|------|-----|
| 风险编码 | traffic_accident |
| 风险名称 | 交通风险 |
| 风险大类 | event |
| 风险描述 | 交通事故专项统计 |
| 数据来源 | hse_incident_records |
| 统计周期 | 全部历史 |
| 显示顺序 | 4 |

### 4.5 驾驶行为风险

| 项目 | 值 |
|------|-----|
| 风险编码 | license_demerit |
| 风险名称 | 驾驶行为风险 |
| 风险大类 | behavior |
| 风险描述 | 驾驶证扣分记录 |
| 数据来源 | license_demerit_records |
| 统计周期 | 近5年 |
| 显示顺序 | 5 |

### 4.6 三检风险

| 项目 | 值 |
|------|-----|
| 风险编码 | inspection |
| 风险名称 | 三检风险 |
| 风险大类 | behavior |
| 风险描述 | 车辆三检完成情况 |
| 数据来源 | hse_driver_inspection_records |
| 统计周期 | 全部历史 |
| 显示顺序 | 6 |

### 4.7 管理责任风险

| 项目 | 值 |
|------|-----|
| 风险编码 | management_responsibility |
| 风险名称 | 管理责任风险 |
| 风险大类 | management |
| 风险描述 | 管理责任履行情况 |
| 数据来源 | hse_responsibility |
| 统计周期 | 全部历史 |
| 显示顺序 | 7 |

## 五、使用场景

### 5.1 风险画像展示

根据岗位风险映射，查询该岗位适用的风险类型列表，动态展示对应的风险卡片。

### 5.2 风险等级计算（Sprint6.2）

基于风险类型字典中的统计周期和数据来源，计算各风险类型的等级得分。

### 5.3 数据一致性校验

通过data_source字段校验风险数据的完整性，确保每个风险类型都有对应的数据来源。

## 六、维护规范

### 6.1 新增风险类型

1. 确定风险编码（英文小写+下划线）
2. 确定风险大类
3. 确定数据来源表
4. 确定统计周期
5. 插入risk_type_dict表

### 6.2 停用风险类型

将is_active设为false，不要删除记录，以保持历史数据一致性。

### 6.3 更新风险类型

更新description、stat_period等字段，risk_code不建议修改。

## 七、SQL参考

### 7.1 查询所有启用的风险类型

```sql
SELECT * FROM risk_type_dict 
WHERE is_active = true 
ORDER BY display_order;
```

### 7.2 按风险大类查询

```sql
SELECT * FROM risk_type_dict 
WHERE risk_category = 'behavior' AND is_active = true;
```

### 7.3 查询数据来源

```sql
SELECT risk_code, risk_name, data_source, stat_period 
FROM risk_type_dict 
WHERE is_active = true;
```