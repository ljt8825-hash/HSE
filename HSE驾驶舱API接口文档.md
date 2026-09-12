# HSE驾驶舱API接口文档

## 一、接口总览

| 序号 | 接口名称 | 路径 | 方法 |
|------|----------|------|------|
| 1 | 驾驶舱总览 | /api/hse/dashboard/overview | GET |
| 2 | 风险等级分布 | /api/hse/dashboard/level-distribution | GET |
| 3 | 风险类型分析 | /api/hse/dashboard/risk-type-analysis | GET |
| 4 | 风险TOP排行 | /api/hse/dashboard/risk-top | GET |
| 5 | 风险趋势 | /api/hse/dashboard/risk-trend | GET |
| 6 | 管理履职 | /api/hse/dashboard/management-execution | GET |
| 7 | 风险等级配置 | /api/hse/dashboard/risk-level-config | GET |

## 二、通用说明

### 2.1 认证

所有接口需要在Header中携带认证令牌：

```
Authorization: Bearer <token>
```

### 2.2 响应格式

```json
{
  "success": true,
  "data": { ... },
  "message": "查询成功"
}
```

### 2.3 错误响应

```json
{
  "success": false,
  "message": "错误描述"
}
```

## 三、接口详情

### 3.1 驾驶舱总览

```
GET /api/hse/dashboard/overview
```

**请求参数**: 无

**响应示例**:

```json
{
  "success": true,
  "data": {
    "totalEmployees": 1304,
    "evaluatedCount": 5,
    "criticalRiskCount": 0,
    "highRiskCount": 0,
    "highRiskRatio": 0.0,
    "improvementRate": 0.0,
    "levelDistribution": {
      "low": { "name": "低风险", "count": 5, "color": "#52c41a" },
      "medium": { "name": "一般风险", "count": 0, "color": "#faad14" },
      "high": { "name": "较高风险", "count": 0, "color": "#fa8c16" },
      "critical": { "name": "重大风险", "count": 0, "color": "#f5222d" }
    },
    "avgScore": null
  },
  "message": "查询成功"
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| totalEmployees | Integer | 员工总数（employee_assignment统计） |
| evaluatedCount | Integer | 已评估人数 |
| criticalRiskCount | Integer | 重大风险人数 |
| highRiskCount | Integer | 高风险合计（重大+较高） |
| highRiskRatio | Float | 高风险占比（%） |
| improvementRate | Float | 风险改善率（%，近30天等级下降占比） |
| levelDistribution | Object | 4级等级分布，含name/count/color |

### 3.2 风险等级分布

```
GET /api/hse/dashboard/level-distribution
```

**请求参数**: 无

**响应示例**:

```json
{
  "success": true,
  "data": {
    "levels": [
      { "levelCode": "low", "levelName": "低风险", "colorCode": "#52c41a", "minScore": 0, "maxScore": 25, "count": 5, "ratio": 100.0 },
      { "levelCode": "medium", "levelName": "一般风险", "colorCode": "#faad14", "minScore": 26, "maxScore": 50, "count": 0, "ratio": 0.0 },
      { "levelCode": "high", "levelName": "较高风险", "colorCode": "#fa8c16", "minScore": 51, "maxScore": 75, "count": 0, "ratio": 0.0 },
      { "levelCode": "critical", "levelName": "重大风险", "colorCode": "#f5222d", "minScore": 76, "maxScore": 100, "count": 0, "ratio": 0.0 }
    ],
    "total": 5
  },
  "message": "查询成功"
}
```

### 3.3 风险类型分析

```
GET /api/hse/dashboard/risk-type-analysis
```

**请求参数**: 无

**响应示例**:

```json
{
  "success": true,
  "data": {
    "riskTypes": [
      {
        "typeCode": "violation",
        "typeName": "三违风险",
        "avgScore": 0.0,
        "highRiskCount": 0,
        "extra": { "totalViolations": 15 }
      },
      {
        "typeCode": "driver_compliance",
        "typeName": "驾驶风险",
        "avgScore": 0.0,
        "highRiskCount": 0,
        "extra": { "driverCount": 43 }
      },
      {
        "typeCode": "incident",
        "typeName": "事故风险",
        "avgScore": 0.0,
        "highRiskCount": 0,
        "extra": { "totalIncidents": 3, "majorIncidents": 0, "casualtyIncidents": 0 }
      },
      {
        "typeCode": "training_compliance",
        "typeName": "培训风险",
        "avgScore": 50.0,
        "highRiskCount": 0,
        "extra": { "totalTrainings": 3, "qualifiedCount": 2, "uncompletedPersons": 1 }
      },
      {
        "typeCode": "management_execution",
        "typeName": "管理履职风险",
        "avgScore": 0.0,
        "highRiskCount": 0,
        "extra": {}
      }
    ],
    "totalEvaluated": 5
  },
  "message": "查询成功"
}
```

**字段说明**:

| 字段 | 说明 |
|------|------|
| typeCode | 风险类型代码 |
| typeName | 风险类型名称 |
| avgScore | 平均积分（单项风险积分） |
| highRiskCount | 高风险人数（单项积分≥51，使用单项风险等级） |
| extra | 补充统计信息 |

### 3.4 风险TOP排行

```
GET /api/hse/dashboard/risk-top?limit=10
```

**请求参数**:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| limit | Integer | 10 | TOP员工数量（最大20） |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "topEmployees": [
      {
        "employeeId": 5361,
        "employeeCode": "V-HSE-004",
        "employeeName": "验证_环卫中心副经理",
        "positionName": "环卫作业中心副经理（人工）",
        "finalScore": 12.5,
        "riskLevel": "低风险",
        "riskLevelCode": "low",
        "scores": {
          "violation": 0,
          "driverCompliance": 0,
          "trainingCompliance": 50,
          "incident": 0,
          "managementExecution": 0
        }
      }
    ],
    "topDepartments": [
      {
        "orgId": 1,
        "orgName": "环卫作业中心",
        "avgScore": 8.75,
        "highRiskCount": 0,
        "totalCount": 4
      }
    ],
    "topOperationUnits": [
      {
        "unitId": 2,
        "unitName": "城区环卫作业区",
        "avgScore": 8.75,
        "highRiskCount": 0,
        "totalCount": 3
      }
    ]
  },
  "message": "查询成功"
}
```

### 3.5 风险趋势

```
GET /api/hse/dashboard/risk-trend?period=daily&metric=total
```

**请求参数**:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| period | String | daily | 聚合粒度（daily/weekly/monthly） |
| metric | String | total | 趋势指标（total/violation/driver/training/incident/management） |

**period默认时间范围**:

| period | 默认时间范围 |
|--------|-------------|
| daily | 近30天 |
| weekly | 近84天（12周） |
| monthly | 近365天（12月） |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "period": "daily",
    "metric": "total",
    "trend": [
      {
        "date": "2026-07-22",
        "avgScore": 8.50,
        "employeeCount": 5,
        "highRiskCount": 0
      }
    ],
    "levelTrend": [
      {
        "date": "2026-07-22",
        "levelCode": "low",
        "count": 5
      }
    ]
  },
  "message": "查询成功"
}
```

### 3.6 管理履职

```
GET /api/hse/dashboard/management-execution?days=30
```

**请求参数**:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| days | Integer | 30 | 统计天数 |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalInspections": 0,
      "totalProblems": 0,
      "completedCount": 0,
      "overdueCount": 0,
      "problemFoundRate": 0.0,
      "rectificationRate": 0.0
    },
    "execution": {
      "title": "巡查完成率（执行指标）",
      "gridLevels": [
        { "gridLevel": "chief", "actualCount": 0, "expectedCount": 10, "completionRate": 0.0 }
      ]
    },
    "quality": {
      "title": "问题发现率（质量指标）",
      "gridLevels": [
        { "gridLevel": "chief", "totalInspections": 0, "problemCount": 0, "problemFoundRate": 0.0 }
      ]
    },
    "closure": {
      "title": "整改完成率（闭环指标）",
      "gridLevels": [
        { "gridLevel": "chief", "totalProblems": 0, "completedCount": 0, "pendingCount": 0, "overdueCount": 0, "rectificationRate": 0.0 }
      ]
    }
  },
  "message": "查询成功"
}
```

**三类指标说明**:

| 指标类别 | 指标名称 | 计算公式 | 数据来源 |
|----------|----------|----------|----------|
| 执行指标 | 巡查完成率 | 实际巡查次数/应巡查次数×100% | hse_grid_inspection_records |
| 质量指标 | 问题发现率 | 发现问题巡查数/总巡查数×100% | hse_grid_inspection_records.problems_found |
| 闭环指标 | 整改完成率 | 已整改数/应整改数×100% | hse_grid_inspection_records.rectification_status |

**应巡查次数（按grid_level）**:

| grid_level | 角色 | 频次 | 30天应巡查 |
|------------|------|------|-----------|
| chief | 总网格长 | 1次/3天 | 10次 |
| level1 | 一级网格长 | 1次/2天 | 15次 |
| level2 | 二级网格长 | 1次/天 | 30次 |
| level3 | 三级网格长 | 1次/天 | 30次 |

### 3.7 风险等级配置

```
GET /api/hse/dashboard/risk-level-config
```

**请求参数**: 无

**响应示例**:

```json
{
  "success": true,
  "data": [
    {
      "levelCode": "low",
      "levelName": "低风险",
      "levelOrder": 1,
      "minScore": 0,
      "maxScore": 25,
      "colorCode": "#52c41a",
      "description": "风险处于可控范围，常规管理即可"
    },
    {
      "levelCode": "medium",
      "levelName": "一般风险",
      "levelOrder": 2,
      "minScore": 26,
      "maxScore": 50,
      "colorCode": "#faad14",
      "description": "存在一定风险因素，需要关注和跟踪"
    },
    {
      "levelCode": "high",
      "levelName": "较高风险",
      "levelOrder": 3,
      "minScore": 51,
      "maxScore": 75,
      "colorCode": "#fa8c16",
      "description": "风险较高，需要重点管控和干预"
    },
    {
      "levelCode": "critical",
      "levelName": "重大风险",
      "levelOrder": 4,
      "minScore": 76,
      "maxScore": 100,
      "colorCode": "#f5222d",
      "description": "风险极高，需要立即采取管控措施"
    }
  ],
  "message": "查询成功"
}
```

## 四、数据来源映射

| 接口 | 主数据表 | 关联模型 |
|------|----------|----------|
| 总览 | risk_level_records + risk_level_config | employee_assignment |
| 等级分布 | risk_level_records + risk_level_config | - |
| 风险类型 | risk_score_records + violation_records + hse_incident_records + v_training_records + employee_assignment | - |
| 风险TOP | risk_score_records + employee_assignment + hse_org_unit | - |
| 风险趋势 | risk_score_history | - |
| 管理履职 | hse_grid_inspection_records | - |
| 等级配置 | risk_level_config | - |
