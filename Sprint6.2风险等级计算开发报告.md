# Sprint6.2 风险等级计算开发报告

## 一、阶段概述

| 项目 | 内容 |
|------|------|
| 阶段名称 | Sprint6.2 风险等级计算开发 |
| 前置阶段 | Sprint6.1-H-2 风险模型最终冻结 |
| 开发目标 | 开发员工HSE风险等级计算能力，实现风险积分计算、岗位权重应用、风险等级判定 |
| 开发日期 | 2026-07-22 |
| 开发状态 | 已完成 |

## 二、开发内容

### 2.1 数据库表新增

#### risk_score_records（风险评分记录表）

存储每次风险评分计算的完整结果，包括各风险类型积分、岗位权重、基础总分、特殊加权、最终得分和风险等级。

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| employee_id | BIGINT | 员工ID（关联employee表） |
| employee_code | VARCHAR(64) | 员工工号 |
| employee_name | VARCHAR(128) | 员工姓名 |
| position_id | BIGINT | 岗位ID |
| position_name | VARCHAR(128) | 岗位名称 |
| risk_category | VARCHAR(32) | 风险类别（driver/normal/management） |
| management_level | VARCHAR(32) | 管理级别（frontline/middle/high） |
| violation_score | NUMERIC(5,2) | 三违风险积分 |
| driver_compliance_score | NUMERIC(5,2) | 驾驶合规风险积分 |
| training_compliance_score | NUMERIC(5,2) | 培训合规风险积分 |
| incident_score | NUMERIC(5,2) | 事故风险积分 |
| management_execution_score | NUMERIC(5,2) | 管理履职风险积分 |
| base_total_score | NUMERIC(5,2) | 基础总分（加权计算） |
| special_weighted_score | NUMERIC(5,2) | 特殊加权分 |
| final_score | NUMERIC(5,2) | 最终得分 |
| risk_level | VARCHAR(32) | 风险等级（低风险/一般风险/较高风险/重大风险） |
| risk_level_code | VARCHAR(32) | 风险等级代码（low/medium/high/critical） |
| special_rules_triggered | TEXT[] | 触发的特殊规则 |
| special_weightings | TEXT[] | 特殊加权项 |
| calculated_at | TIMESTAMPTZ | 计算时间 |

#### risk_level_records（风险等级记录表）

存储员工风险等级变更历史，支持等级变化追踪。

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| employee_id | BIGINT | 员工ID |
| risk_level | VARCHAR(32) | 风险等级 |
| risk_level_code | VARCHAR(32) | 风险等级代码 |
| risk_score | NUMERIC(5,2) | 风险得分 |
| previous_risk_level | VARCHAR(32) | 前次风险等级 |
| previous_risk_score | NUMERIC(5,2) | 前次风险得分 |
| level_change | VARCHAR(32) | 等级变化类型（首次评定/等级上升/等级下降/无变化） |
| change_reason | TEXT | 变更原因 |
| valid_from | TIMESTAMPTZ | 生效起始时间 |
| valid_to | TIMESTAMPTZ | 生效结束时间 |
| is_active | BOOLEAN | 是否当前有效 |

### 2.2 风险评分计算引擎

文件：[riskScoreService.js](file:///f:/deploy/hse-dashboard/server/services/riskScoreService.js)

#### 计算流程

```
输入 employee_id
    ↓
查询员工基础信息（employee表）
    ↓
查询岗位信息（hse_employee_relation → position_risk_mapping）
    ↓
查询责任信息（hse_responsibility）
    ↓
获取岗位权重（根据risk_category和management_level）
    ↓
计算5个风险类型积分：
  ├── 三违风险积分（violation_records，近12个月）
  ├── 驾驶合规风险积分（license_demerit_records + hse_driver_inspection_records，近5年）
  ├── 培训合规风险积分（training_records）
  ├── 事故风险积分（hse_incident_records）
  └── 管理履职风险积分（hse_grid_inspection_records，近30天）
    ↓
应用岗位权重计算基础总分
    ↓
检查特殊规则（重大事故直接升级等）
    ↓
计算特殊加权分
    ↓
生成最终得分和风险等级
    ↓
保存评分记录和等级记录
```

#### 5个风险类型积分计算规则

##### 1. 三违风险积分（violation）

| 维度 | 计算方式 | 上限 |
|------|----------|------|
| 违规次数积分 | 次数 × 8 | 40分 |
| 级别权重积分 | 严重25分/较大15分/一般8分 | 25分 |
| 待处理积分 | 待处理数 × 5 | 20分 |
| 类型多样性积分 | ≥3种类型 | 10分 |
| **合计** | **MIN(100, 各项之和)** | **100分** |

##### 2. 驾驶合规风险积分（driver_compliance）

| 维度 | 计算方式 | 上限 |
|------|----------|------|
| 驾驶证扣分积分 | 扣分 × 1.5 | 42分 |
| 扣分次数积分 | 次数 × 3 | 18分 |
| 扣满12分加成 | ≥12分直接加 | 50分 |
| 三检不合格率 | 不合格率 × 40 | 40分 |
| 未整改积分 | 未整改数 × 3 | 12分 |
| **合计** | **MIN(100, 各项之和)** | **100分** |

##### 3. 培训合规风险积分（training_compliance）

| 维度 | 计算方式 | 上限 |
|------|----------|------|
| 无培训记录 | 直接加 | 50分 |
| 不合格率积分 | 不合格率 × 30 | 30分 |
| 待完成积分 | 待完成数 × 5 | 20分 |
| **合计** | **MIN(100, 各项之和)** | **100分** |

##### 4. 事故风险积分（incident）

| 维度 | 计算方式 | 上限 |
|------|----------|------|
| 事故次数积分 | 次数 × 15 × 类型权重 | 45分 |
| 级别积分 | 重大10/较大7/一般4 | - |
| 责任积分 | 责任数 × 5 | 15分 |
| 伤亡积分 | 有伤亡直接加 | 25分 |
| **合计** | **MIN(100, 各项之和)** | **100分** |

事故类型权重：生产安全事故1.0、交通事故0.8、环境污染事故0.7

##### 5. 管理履职风险积分（management_execution）

| 维度 | 计算方式 | 上限 |
|------|----------|------|
| 巡查完成率积分 | 0次80分/<50%60分/<70%40分/<90%20分 | 80分 |
| 发现问题积分 | 问题数 × 4 | 20分 |
| 未整改积分 | 未整改数 × 8 | 20分 |
| **合计** | **MIN(100, 各项之和)** | **100分** |

网格长巡查频次：总网格长1次/3天、一级网格长1次/2天、二级网格长1次/天、三级网格长1次/天

### 2.3 岗位权重矩阵（冻结）

| 岗位类别 | 三违风险 | 驾驶合规 | 培训合规 | 事故风险 | 管理履职 |
|----------|----------|----------|----------|----------|----------|
| 驾驶员 | 20% | 35% | 15% | 30% | 0% |
| 普通员工 | 35% | 0% | 25% | 40% | 0% |
| 基层管理 | 20% | 0% | 15% | 25% | 40% |
| 中层管理 | 15% | 0% | 20% | 25% | 40% |
| 高层管理 | 10% | 0% | 20% | 25% | 45% |

### 2.4 风险等级定义

| 风险等级 | 代码 | 分值区间 |
|----------|------|----------|
| 低风险 | low | 0-25 |
| 一般风险 | medium | 26-50 |
| 较高风险 | high | 51-75 |
| 重大风险 | critical | 76-100 |

### 2.5 特殊规则实现

| 规则 | 触发条件 | 处理方式 |
|------|----------|----------|
| 重大事故直接升级 | 事故级别为"重大" | 直接判定重大风险，得分=100 |
| 死亡事故直接升级 | 事故造成人员死亡 | 直接判定重大风险，得分=100 |
| 重伤事故升级 | 事故造成人员重伤 | 风险等级不低于重大风险 |
| 较大事故保底 | 事故级别为"较大" | 风险等级不低于较高风险 |
| 多次交通事故加权 | 12个月内≥2次交通事故 | +15分；≥3次+30分 |
| 驾驶证扣满12分 | 5年内扣分≥12 | 触发规则标记 |
| 巡查完成率低 | 完成率<50% | 触发规则标记 |

### 2.6 岗位别名兼容

由于position表中存在同名的岗位记录（如多个"垃圾收运车驾驶员"），实现了岗位别名兼容机制：
1. 优先通过position_id匹配position_risk_mapping
2. 若未找到，回退到position_name匹配
3. 确保所有同名岗位都能正确获取风险类别

## 三、开发文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| [init-risk-score-tables.js](file:///f:/deploy/hse-dashboard/server/init-risk-score-tables.js) | 数据库脚本 | 创建risk_score_records和risk_level_records表 |
| [riskScoreService.js](file:///f:/deploy/hse-dashboard/server/services/riskScoreService.js) | 核心服务 | 风险评分计算引擎，包含5个风险类型积分计算、权重应用、特殊规则检查 |
| [hse-risk-score.js](file:///f:/deploy/hse-dashboard/server/routes/hse-risk-score.js) | 路由接口 | 风险评分API路由，提供7个接口端点 |
| [app.js](file:///f:/deploy/hse-dashboard/server/app.js) | 主应用 | 注册Sprint6.2路由（/api/hse/risk-score） |

## 四、数据库变更

### 新增表
- risk_score_records（风险评分记录表）
- risk_level_records（风险等级记录表）

### 字段变更
- position_risk_mapping 表新增 management_level 字段（VARCHAR(32)）
- position_risk_mapping 表补充position_id关联（修复空值记录）

### 数据修复
- 为position_risk_mapping表12条记录设置management_level值
- 修复7个岗位的position_id关联
- 补充缺失的驾驶员岗位映射

## 五、约束遵守

| 约束 | 遵守情况 |
|------|----------|
| 禁止重新设计风险模型 | ✓ 使用Sprint6.1-H-2冻结的5个风险类型和积分规则 |
| 禁止修改岗位权重 | ✓ 使用冻结的5类岗位权重矩阵 |
| 禁止新增车辆管理 | ✓ 未新增任何车辆管理功能 |
| 禁止修改employee表 | ✓ 未修改employee表结构 |
| 禁止修改组织模型 | ✓ 未修改组织相关表结构 |
| employee_id作为风险主体 | ✓ 所有计算基于employee_id |
| position_id岗位关联 | ✓ 通过hse_employee_relation关联position_id |
| grid_level责任角色 | ✓ 通过hse_responsibility获取grid_level |
| risk_type_dict风险类型 | ✓ 使用5个标准化风险类型 |
| position_risk_mapping岗位风险映射 | ✓ 通过映射表获取risk_category和management_level |

## 六、开发总结

Sprint6.2风险等级计算开发任务已全部完成：

1. **数据库表**：新增risk_score_records和risk_level_records两张表，支持评分记录存储和等级变更追踪
2. **计算引擎**：实现5个风险类型积分计算函数，完整覆盖三违、驾驶合规、培训合规、事故、管理履职
3. **岗位权重**：严格按照冻结的权重矩阵应用，支持driver/normal/management三大类5个级别
4. **特殊规则**：实现7条特殊规则检查，包括重大事故直接升级、多次交通事故加权等
5. **岗位别名兼容**：实现position_id优先、position_name回退的匹配机制
6. **接口开发**：提供7个API端点，覆盖风险等级查询、评分计算、明细查询、历史记录、批量计算、统计等场景
