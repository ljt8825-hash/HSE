# Sprint6.3-B-1 驾驶舱接口开发报告

## 一、阶段概述

| 项目 | 内容 |
|------|------|
| 阶段名称 | Sprint6.3-B-1 HSE综合驾驶舱后端接口开发 |
| 前置阶段 | Sprint6.3-A-2 员工关系模型一致性收口 |
| 开发目标 | 开发HSE综合驾驶舱6个后端数据接口 |
| 开发日期 | 2026-07-22 |
| 开发状态 | 已完成 |

## 二、开发内容

### 2.1 数据准备

| 项目 | 说明 |
|------|------|
| v_training_records视图 | 创建视图统一training_records.personnel_id为employee_id输出 |
| risk_score_history初始化 | 从risk_score_records迁移5名员工评分快照到历史表 |

### 2.2 接口清单

| 序号 | 接口 | 路径 | 方法 | 说明 |
|------|------|------|------|------|
| 1 | 驾驶舱总览 | /api/hse/dashboard/overview | GET | 员工总数、评估人数、风险人数、风险占比、改善率 |
| 2 | 风险等级分布 | /api/hse/dashboard/level-distribution | GET | 4级风险等级分布及占比 |
| 3 | 风险类型分析 | /api/hse/dashboard/risk-type-analysis | GET | 5种风险类型平均积分和高风险人数 |
| 4 | 风险TOP排行 | /api/hse/dashboard/risk-top | GET | TOP10员工、TOP5部门、TOP5作业单元 |
| 5 | 风险趋势 | /api/hse/dashboard/risk-trend | GET | 日/周/月趋势，支持6种指标 |
| 6 | 管理履职 | /api/hse/dashboard/management-execution | GET | 巡查完成率、问题发现率、整改完成率 |
| 7 | 风险等级配置 | /api/hse/dashboard/risk-level-config | GET | 参数化等级配置查询 |

### 2.3 核心代码文件

| 文件 | 说明 |
|------|------|
| [hse-dashboard.js](file:///f:/deploy/hse-dashboard/server/routes/hse-dashboard.js) | 驾驶舱7个接口路由（565行） |
| [prepare-dashboard-data.js](file:///f:/deploy/hse-dashboard/server/prepare-dashboard-data.js) | 数据准备脚本（v_training_records+risk_score_history初始化） |
| [test-dashboard-apis.js](file:///f:/deploy/hse-dashboard/server/test-dashboard-apis.js) | 接口测试脚本（9项测试） |

## 三、统一数据规则

### 3.1 员工统计统一

所有员工统计使用 `employee_assignment` 表，条件 `is_current=true AND is_deleted=false`。

| 统计场景 | SQL关联方式 |
|----------|-------------|
| 员工总数 | FROM employee_assignment ea WHERE is_current=true AND is_deleted=false |
| 驾驶员人数 | employee_assignment JOIN position WHERE name LIKE '%驾驶员%' |
| TOP部门 | risk_score_records JOIN employee_assignment JOIN hse_org_unit |
| TOP作业单元 | risk_score_records JOIN employee_assignment.operation_unit_id JOIN hse_org_unit |

### 3.2 培训数据统一

通过v_training_records视图统一输出employee_id：

```sql
CREATE VIEW v_training_records AS
SELECT t.id, t.personnel_id AS employee_id, e.employee_code, e.name AS employee_name, ...
FROM training_records t
LEFT JOIN employee e ON t.personnel_id = e.id
WHERE t.is_deleted = false;
```

### 3.3 风险等级参数化

所有等级展示通过risk_level_config表读取，禁止硬编码：

```sql
SELECT level_code, level_name, color_code, min_score, max_score
FROM risk_level_config WHERE is_enabled = true AND is_deleted = false ORDER BY level_order
```

## 四、接口详细设计

### 4.1 驾驶舱总览接口

**路径**: `GET /api/hse/dashboard/overview`

**返回字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| totalEmployees | Integer | 员工总数（employee_assignment统计） |
| evaluatedCount | Integer | 已评估人数（risk_level_records统计） |
| criticalRiskCount | Integer | 重大风险人数 |
| highRiskCount | Integer | 高风险合计（重大+较高） |
| highRiskRatio | Float | 高风险占比（%） |
| improvementRate | Float | 风险改善率（%） |
| levelDistribution | Object | 4级等级分布 |

### 4.2 风险等级分布接口

**路径**: `GET /api/hse/dashboard/level-distribution`

**返回字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| levels | Array | 4级等级数组 |
| levels[].levelCode | String | 等级代码 |
| levels[].levelName | String | 等级名称 |
| levels[].colorCode | String | 颜色代码（来自risk_level_config） |
| levels[].count | Integer | 人数 |
| levels[].ratio | Float | 占比（%） |
| total | Integer | 总评估人数 |

### 4.3 风险类型分析接口

**路径**: `GET /api/hse/dashboard/risk-type-analysis`

**返回5种风险类型**:

| 风险类型 | avgScore | highRiskCount | extra |
|----------|----------|---------------|-------|
| 三违风险 | violation_score平均 | 积分≥51人数 | totalViolations |
| 驾驶风险 | driver_compliance_score平均 | 积分≥51人数 | driverCount |
| 事故风险 | incident_score平均 | 积分≥51人数 | totalIncidents, majorIncidents, casualtyIncidents |
| 培训风险 | training_compliance_score平均 | 积分≥51人数 | totalTrainings, qualifiedCount, uncompletedPersons |
| 管理履职 | management_execution_score平均 | 积分≥51人数 | - |

### 4.4 风险TOP接口

**路径**: `GET /api/hse/dashboard/risk-top?limit=10`

**返回3类排行**:

| 排行 | 数量 | 排序字段 | 关联方式 |
|------|------|----------|----------|
| topEmployees | 10 | final_score DESC | risk_score_records |
| topDepartments | 5 | AVG(final_score) DESC | + employee_assignment.org_unit_id + hse_org_unit |
| topOperationUnits | 5 | AVG(final_score) DESC | + employee_assignment.operation_unit_id + hse_org_unit |

### 4.5 风险趋势接口

**路径**: `GET /api/hse/dashboard/risk-trend?period=daily&metric=total`

**period参数**:

| 值 | 时间范围 | 数据粒度 |
|----|----------|----------|
| daily | 近30天 | 日 |
| weekly | 近84天 | 周 |
| monthly | 近365天 | 月 |

**metric参数**:

| 值 | 对应字段 |
|----|----------|
| total | total_score |
| violation | violation_score |
| driver | driver_compliance_score |
| training | training_compliance_score |
| incident | incident_score |
| management | management_execution_score |

### 4.6 管理履职接口

**路径**: `GET /api/hse/dashboard/management-execution?days=30`

**三类指标**:

| 指标类别 | 指标名 | 计算方式 |
|----------|--------|----------|
| 执行指标 | 巡查完成率 | 实际巡查次数/应巡查次数×100% |
| 质量指标 | 问题发现率 | 发现问题巡查数/总巡查数×100% |
| 闭环指标 | 整改完成率 | 已整改数/应整改数×100% |

**应巡查次数**（按grid_level）:

| grid_level | 频次 | 30天应巡查 |
|------------|------|-----------|
| chief（总网格长） | 1次/3天 | 10次 |
| level1（一级） | 1次/2天 | 15次 |
| level2（二级） | 1次/天 | 30次 |
| level3（三级） | 1次/天 | 30次 |

## 五、测试结果

| 测试项 | 结果 | 关键数据 |
|--------|------|----------|
| 驾驶舱总览 | PASS | 员工总数:1304, 已评估:5, 高风险:0, 改善率:0% |
| 风险等级分布 | PASS | 低风险:5, 一般:0, 较高:0, 重大:0 |
| 风险类型分析 | PASS | 培训均分:50, 驾驶员:43人 |
| 风险TOP | PASS | TOP1:验证_环卫中心副经理(12.5分) |
| 风险趋势 | PASS | 1个数据点，均分8.50 |
| 管理履职 | PASS | 暂无巡查数据 |
| 风险等级配置 | PASS | 4级配置正常 |
| v_training_records视图 | PASS | 3条数据，employee_id输出正确 |
| employee_assignment验证 | PASS | 1304名员工 |

**总计: 9/9 通过**

## 六、约束遵守

| 约束 | 遵守情况 |
|------|----------|
| 禁止修改风险评分规则 | ✓ 未修改riskScoreService.js评分逻辑 |
| 禁止修改岗位权重 | ✓ 未修改FROZEN_WEIGHT_MATRIX |
| 禁止修改employee表 | ✓ 未修改employee表结构 |
| 禁止新增车辆模型 | ✓ 未新增车辆相关内容 |
| 禁止使用hse_employee_relation | ✓ 全部使用employee_assignment |
