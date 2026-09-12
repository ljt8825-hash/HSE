# Sprint6.1-G 岗位风险映射收口报告

## 一、任务概述

本阶段任务是对Sprint6.1-F优化的岗位风险映射进行最终收口，修正岗位风险分类，为Sprint6.2风险等级模型提供最终输入。

### 收口目标
1. 为position_risk_mapping增加position_id字段，通过position_id关联而非position_name
2. 调整管理员岗位分类（normal → management）
3. 新增中高层管理岗位映射
4. 支持岗位别名兼容
5. 更新岗位风险映射矩阵

### 禁止项
- 禁止开发风险评分
- 禁止修改employee
- 禁止修改组织模型
- 禁止新增车辆关系

## 二、岗位关联优化

### 2.1 优化前

**表名**: position_risk_mapping

**字段**: position_name

**关联方式**: 通过position_name字符串匹配

**问题**: 依赖字符串匹配，存在拼写错误风险，不支持岗位变更

### 2.2 优化后

**字段**: position_id

**关联方式**: 通过position表的id关联

**表结构更新**:

| 字段名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | BIGSERIAL | 否 | 自增 | 主键 |
| position_name | VARCHAR(128) | 是 | - | 岗位名称 |
| position_code | VARCHAR(64) | 否 | - | 岗位编码 |
| position_id | BIGINT | 否 | - | 岗位ID（新增） |
| risk_category | VARCHAR(32) | 是 | - | 风险类别 |
| is_driver | BOOLEAN | 否 | false | 是否驾驶员 |
| applicable_risk_types | JSONB | 否 | - | 适用风险类型 |
| description | TEXT | 否 | - | 描述 |
| is_active | BOOLEAN | 否 | true | 是否启用 |
| created_at | TIMESTAMPTZ | 否 | NOW() | 创建时间 |
| updated_at | TIMESTAMPTZ | 否 | NOW() | 更新时间 |

### 2.3 关联方式调整

```sql
-- 优化前
FROM position_risk_mapping 
WHERE position_name = '管理员'

-- 优化后
FROM position_risk_mapping prm
INNER JOIN position p ON p.id = prm.position_id
WHERE prm.position_id = 1374
```

## 三、管理员岗位调整

### 3.1 调整原因

管理员岗位在实际业务中承担以下职责：
- 人工班长职责
- 三级网格长职责
- 需要支持管理履职风险

### 3.2 调整内容

| 调整项 | 调整前 | 调整后 |
|--------|--------|--------|
| 风险类别 | normal | management |
| 适用风险类型 | violation, training_compliance, incident | violation, training_compliance, incident, management_execution |
| 说明 | 管理岗位 | 管理员（人工班长），属于三级网格长，需要支持管理履职风险 |

### 3.3 数据更新

```sql
UPDATE position_risk_mapping 
SET risk_category = 'management',
    applicable_risk_types = '["violation","training_compliance","incident","management_execution"]',
    description = '管理员（人工班长），属于三级网格长，需要支持管理履职风险'
WHERE position_name = '管理员';
```

## 四、管理岗位范围调整

### 4.1 管理岗位分类

| 级别 | 岗位 | 说明 |
|------|------|------|
| 高层管理 | 总经理 | 公司最高管理者 |
| 中层管理 | 部门经理 | 部门负责人 |
| 基层管理 | 乡镇作业中心经理 | 乡镇作业中心负责人（人工片区长） |
| 基层管理 | 环卫作业中心片区长 | 环卫作业中心片区负责人 |
| 基层管理 | 管理员 | 人工班长，三级网格长 |
| 基层管理 | 网格长 | 网格管理负责人 |
| 基层管理 | 片区长 | 片区管理负责人 |

### 4.2 新增管理岗位

#### 总经理

| 项目 | 值 |
|------|-----|
| 岗位名称 | 总经理 |
| 岗位编码 | GM |
| 风险类别 | management |
| 是否驾驶员 | 否 |
| 适用风险类型 | violation, training_compliance, incident, management_execution |
| 说明 | 总经理，高层管理岗位 |

#### 部门经理

| 项目 | 值 |
|------|-----|
| 岗位名称 | 部门经理 |
| 岗位编码 | DM |
| 风险类别 | management |
| 是否驾驶员 | 否 |
| 适用风险类型 | violation, training_compliance, incident, management_execution |
| 说明 | 部门经理，中层管理岗位 |

#### 乡镇作业中心经理

| 项目 | 值 |
|------|-----|
| 岗位名称 | 乡镇作业中心经理 |
| 岗位编码 | TOWM_MGR |
| 风险类别 | management |
| 是否驾驶员 | 否 |
| 适用风险类型 | violation, training_compliance, incident, management_execution |
| 说明 | 乡镇作业中心经理（人工片区长），基层管理岗位 |

#### 环卫作业中心片区长

| 项目 | 值 |
|------|-----|
| 岗位名称 | 环卫作业中心片区长 |
| 岗位编码 | AREA_MGR |
| 风险类别 | management |
| 是否驾驶员 | 否 |
| 适用风险类型 | violation, training_compliance, incident, management_execution |
| 说明 | 环卫作业中心片区长，基层管理岗位 |

### 4.3 管理岗位汇总

| 序号 | 岗位名称 | 风险类别 | 层级 | 适用风险类型 |
|------|----------|----------|------|--------------|
| 1 | 总经理 | management | 高层 | violation, training_compliance, incident, management_execution |
| 2 | 部门经理 | management | 中层 | violation, training_compliance, incident, management_execution |
| 3 | 乡镇作业中心经理 | management | 基层 | violation, training_compliance, incident, management_execution |
| 4 | 环卫作业中心片区长 | management | 基层 | violation, training_compliance, incident, management_execution |
| 5 | 管理员 | management | 基层 | violation, training_compliance, incident, management_execution |
| 6 | 网格长 | management | 基层 | violation, training_compliance, incident, management_execution |
| 7 | 片区长 | management | 基层 | violation, training_compliance, incident, management_execution |

## 五、岗位别名兼容

### 5.1 新建别名表

**表名**: position_alias_mapping

| 字段名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | BIGSERIAL | 否 | 自增 | 主键 |
| standard_position_name | VARCHAR(128) | 是 | - | 标准岗位名称 |
| alias_position_name | VARCHAR(128) | 是 | - | 别名岗位名称 |
| position_id | BIGINT | 否 | - | 岗位ID |
| description | TEXT | 否 | - | 描述 |
| is_active | BOOLEAN | 否 | true | 是否启用 |
| created_at | TIMESTAMPTZ | 否 | NOW() | 创建时间 |
| updated_at | TIMESTAMPTZ | 否 | NOW() | 更新时间 |

### 5.2 别名映射数据

| 标准岗位名称 | 别名岗位名称 | 说明 |
|--------------|--------------|------|
| 乡镇作业中心经理 | 人工片区长 | 乡镇作业中心经理的岗位别名 |
| 管理员 | 人工班长 | 管理员作为三级网格长的别名 |
| 环卫作业中心片区长 | 片区长 | 环卫作业中心片区长的简称 |

### 5.3 查询逻辑

```sql
-- 标准岗位查询
SELECT * FROM position_risk_mapping 
WHERE position_id = $1;

-- 别名兼容查询
SELECT prm.* 
FROM position_risk_mapping prm
INNER JOIN position_alias_mapping pam ON pam.standard_position_name = prm.position_name
WHERE pam.alias_position_name = $1;
```

## 六、驾驶员岗位扩展

### 6.1 新增驾驶员岗位

| 项目 | 值 |
|------|-----|
| 岗位名称 | 勾臂车司机 |
| 岗位编码 | HOOK_TRUCK_DRV |
| 风险类别 | driver |
| 是否驾驶员 | 是 |
| 适用风险类型 | violation, driver_compliance, training_compliance, incident |
| 说明 | 勾臂车驾驶员岗位 |

### 6.2 驾驶员岗位汇总

| 序号 | 岗位名称 | 岗位编码 | 适用风险类型 |
|------|----------|----------|--------------|
| 1 | 垃圾转运车驾驶员 | - | violation, driver_compliance, training_compliance, incident |
| 2 | 垃圾收运车驾驶员 | - | violation, driver_compliance, training_compliance, incident |
| 3 | 吸污车驾驶员 | - | violation, driver_compliance, training_compliance, incident |
| 4 | 勾臂车司机 | HOOK_TRUCK_DRV | violation, driver_compliance, training_compliance, incident |

## 七、风险映射矩阵更新

### 7.1 驾驶员岗位

| 适用风险类型 | 风险名称 | 权重建议 |
|--------------|----------|----------|
| violation | 三违风险 | 中 |
| driver_compliance | 驾驶合规风险 | 高 |
| training_compliance | 培训合规风险 | 中 |
| incident | 事故风险 | 高 |

### 7.2 普通作业岗位

| 适用风险类型 | 风险名称 | 权重建议 |
|--------------|----------|----------|
| violation | 三违风险 | 高 |
| training_compliance | 培训合规风险 | 中 |
| incident | 事故风险 | 高 |

### 7.3 基层管理岗位

| 适用风险类型 | 风险名称 | 权重建议 |
|--------------|----------|----------|
| violation | 三违风险 | 中 |
| training_compliance | 培训合规风险 | 中 |
| incident | 事故风险 | 高 |
| management_execution | 管理履职风险 | 高 |

### 7.4 中高层管理岗位

| 适用风险类型 | 风险名称 | 权重建议 |
|--------------|----------|----------|
| violation | 三违风险 | 低 |
| training_compliance | 培训合规风险 | 中 |
| incident | 事故风险 | 高 |
| management_execution | 管理履职风险 | 高 |

## 八、文件变更清单

### 8.1 数据库表

| 表名 | 变更内容 |
|------|----------|
| position_risk_mapping | 新增position_id字段 |
| position_alias_mapping | 新建别名表 |

### 8.2 脚本文件

| 文件 | 说明 |
|------|------|
| init-position-mapping-optimization.js | 岗位映射优化脚本 |

## 九、约束合规

| 约束项 | 状态 | 说明 |
|--------|------|------|
| 禁止开发风险评分 | ✅ 符合 | 未开发评分功能 |
| 禁止修改employee | ✅ 符合 | 未修改employee表 |
| 禁止修改组织模型 | ✅ 符合 | 未修改组织相关表 |
| 禁止新增车辆关系 | ✅ 符合 | 未建立车辆绑定 |

## 十、后续建议

1. 在Sprint6.2中基于最终岗位映射开发风险等级计算
2. 考虑为position_id增加索引提升查询性能
3. 定期同步position_risk_mapping与position表的一致性
4. 为岗位别名建立自动同步机制