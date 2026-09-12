# 员工风险画像API设计

> 基础URL: `/api/hse/risk-profile`

---

## 1. GET /list — 员工风险画像列表

获取员工风险画像分页列表，支持多条件筛选与排序。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码，默认1 |
| pageSize | int | 否 | 每页条数，默认20 |
| orgId | long | 否 | 组织ID筛选 |
| operationUnitId | long | 否 | 作业单元ID筛选 |
| riskLevel | string | 否 | 风险等级筛选：low / medium / high / very_high |
| responsibilityType | string | 否 | 责任类型筛选：grid_leader / production_manager / none |
| keyword | string | 否 | 姓名/工号模糊搜索 |

### 响应格式

```json
{
  "code": 0,
  "message": "success",
  "result": {
    "items": [
      {
        "employeeId": 1001,
        "employeeName": "张三",
        "employeeNo": "EMP001",
        "orgName": "采油一队",
        "operationUnitName": "注采站A",
        "positionName": "采油工",
        "responsibilityType": "grid_leader",
        "totalScore": 72,
        "riskLevel": "medium",
        "riskLevelLabel": "中风险",
        "snapshotDate": "2026-07-20",
        "dimensionScores": {
          "violation": 65,
          "training": 80,
          "accident": 70,
          "hazard": 85,
          "traffic": 90,
          "patrol": 60
        }
      }
    ],
    "total": 156,
    "page": 1,
    "pageSize": 20
  }
}
```

---

## 2. GET /:employeeId — 员工风险画像详情

获取指定员工的完整风险画像，包含6类风险维度明细。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| employeeId | long | 是 | 员工ID（路径参数） |

### 响应格式

```json
{
  "code": 0,
  "message": "success",
  "result": {
    "basicInfo": {
      "employeeId": 1001,
      "employeeName": "张三",
      "employeeNo": "EMP001",
      "orgName": "采油一队",
      "operationUnitName": "注采站A",
      "positionName": "采油工",
      "responsibilityType": "grid_leader",
      "responsibility": {
        "gridLevel": "三级网格",
        "gridRole": "网格长",
        "patrolRequired": 4,
        "patrolActual": 3
      }
    },
    "riskScore": {
      "totalScore": 72,
      "riskLevel": "medium",
      "riskLevelLabel": "中风险",
      "snapshotDate": "2026-07-20",
      "dimensionScores": {
        "violation": 65,
        "training": 80,
        "accident": 70,
        "hazard": 85,
        "traffic": 90,
        "patrol": 60
      }
    },
    "dimensions": {
      "violation": {
        "label": "三违风险",
        "score": 65,
        "weight": 0.30,
        "applicable": true,
        "details": {
          "totalViolations": 3,
          "thisYearViolations": 1,
          "severityBreakdown": {
            "minor": 2,
            "major": 1,
            "critical": 0
          },
          "deductionItems": [
            { "rule": "年度三违次数扣分", "count": 1, "deduction": 15 },
            { "rule": "历史严重三违扣分", "count": 1, "deduction": 20 }
          ]
        }
      },
      "training": {
        "label": "培训风险",
        "score": 80,
        "weight": 0.20,
        "applicable": true,
        "details": {
          "totalCourses": 10,
          "completedCourses": 8,
          "overdueCourses": 1,
          "completionRate": 0.80,
          "deductionItems": [
            { "rule": "培训完成率低于90%扣分", "rate": 0.80, "deduction": 10 },
            { "rule": "逾期培训扣分", "count": 1, "deduction": 10 }
          ]
        }
      },
      "accident": {
        "label": "事故风险",
        "score": 70,
        "weight": 0.25,
        "applicable": true,
        "details": {
          "totalAccidents": 1,
          "responsibleAccidents": 1,
          "severityBreakdown": {
            "minor": 1,
            "major": 0,
            "critical": 0
          },
          "deductionItems": [
            { "rule": "责任事故扣分", "count": 1, "deduction": 20 },
            { "rule": "一般事故扣分", "count": 1, "deduction": 10 }
          ]
        }
      },
      "hazard": {
        "label": "隐患责任风险",
        "score": 85,
        "weight": 0.15,
        "applicable": true,
        "details": {
          "totalHazards": 5,
          "rectifiedHazards": 4,
          "overdueRectification": 1,
          "majorHazards": 0,
          "deductionItems": [
            { "rule": "整改逾期扣分", "count": 1, "deduction": 10 },
            { "rule": "隐患发现率加分", "rate": 0.80, "deduction": 5 }
          ]
        }
      },
      "traffic": {
        "label": "交通安全风险",
        "score": 90,
        "weight": 0.10,
        "applicable": true,
        "details": {
          "isDriver": true,
          "trafficViolations": 0,
          "trafficAccidents": 0,
          "deductionItems": []
        }
      },
      "patrol": {
        "label": "网格巡查责任风险",
        "score": 60,
        "weight": 0.10,
        "applicable": true,
        "details": {
          "gridLevel": "三级网格",
          "gridRole": "网格长",
          "patrolRequired": 4,
          "patrolActual": 3,
          "patrolCompletionRate": 0.75,
          "deductionItems": [
            { "rule": "巡查完成率低于100%扣分", "rate": 0.75, "deduction": 25 },
            { "rule": "巡查频次不足扣分", "shortfall": 1, "deduction": 15 }
          ]
        }
      }
    }
  }
}
```

---

## 3. GET /:employeeId/score — 计算员工风险评分

实时计算指定员工的风险评分并返回结果（不写入快照表）。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| employeeId | long | 是 | 员工ID（路径参数） |
| save | boolean | 否 | 是否保存到快照表，默认false |

### 响应格式

```json
{
  "code": 0,
  "message": "success",
  "result": {
    "employeeId": 1001,
    "totalScore": 72,
    "riskLevel": "medium",
    "riskLevelLabel": "中风险",
    "calculatedAt": "2026-07-22T10:30:00+08:00",
    "saved": false,
    "dimensionScores": {
      "violation": { "score": 65, "weight": 0.30, "deduction": 35 },
      "training": { "score": 80, "weight": 0.20, "deduction": 20 },
      "accident": { "score": 70, "weight": 0.25, "deduction": 30 },
      "hazard": { "score": 85, "weight": 0.15, "deduction": 15 },
      "traffic": { "score": 90, "weight": 0.10, "deduction": 10 },
      "patrol": { "score": 60, "weight": 0.10, "deduction": 40 }
    },
    "weightRedistribution": {
      "originalWeights": { "violation": 0.30, "training": 0.20, "accident": 0.25, "hazard": 0.15, "traffic": 0.10, "patrol": 0.10 },
      "actualWeights": { "violation": 0.30, "training": 0.20, "accident": 0.25, "hazard": 0.15, "traffic": 0.10, "patrol": 0.10 },
      "excludedDimensions": []
    }
  }
}
```

---

## 4. GET /risk-stats/overview — 风险统计概览

获取员工风险画像的整体统计数据。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| orgId | long | 否 | 组织ID筛选 |
| operationUnitId | long | 否 | 作业单元ID筛选 |
| snapshotDate | string | 否 | 快照日期，默认最新 |

### 响应格式

```json
{
  "code": 0,
  "message": "success",
  "result": {
    "snapshotDate": "2026-07-20",
    "totalEmployees": 156,
    "riskLevelDistribution": {
      "low": { "count": 68, "percentage": 43.6 },
      "medium": { "count": 52, "percentage": 33.3 },
      "high": { "count": 28, "percentage": 17.9 },
      "very_high": { "count": 8, "percentage": 5.1 }
    },
    "dimensionAverages": {
      "violation": 71.5,
      "training": 82.3,
      "accident": 88.2,
      "hazard": 79.6,
      "traffic": 91.0,
      "patrol": 74.5
    },
    "overallAverage": 78.2,
    "topRiskEmployees": [
      {
        "employeeId": 1042,
        "employeeName": "李四",
        "totalScore": 28,
        "riskLevel": "very_high"
      },
      {
        "employeeId": 1087,
        "employeeName": "王五",
        "totalScore": 32,
        "riskLevel": "very_high"
      }
    ]
  }
}
```

---

## 5. GET /score-config — 评分配置列表

获取当前风险评分配置列表。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| riskDimension | string | 否 | 按维度筛选（violation/training/accident/hazard/traffic/patrol） |
| enabled | boolean | 否 | 按启用状态筛选 |

### 响应格式

```json
{
  "code": 0,
  "message": "success",
  "result": {
    "items": [
      {
        "id": 1,
        "riskDimension": "violation",
        "riskIndicator": "年度三违次数扣分",
        "indicatorCode": "VIOLATION_ANNUAL_COUNT",
        "weight": 0.40,
        "scoreRule": {
          "type": "tiered",
          "tiers": [
            { "min": 0, "max": 0, "deduction": 0 },
            { "min": 1, "max": 2, "deduction": 10 },
            { "min": 3, "max": 5, "deduction": 25 },
            { "min": 6, "max": 999, "deduction": 50 }
          ]
        },
        "maxScore": 50,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-15T14:30:00+08:00"
      },
      {
        "id": 2,
        "riskDimension": "violation",
        "riskIndicator": "严重三违扣分",
        "indicatorCode": "VIOLATION_SEVERITY",
        "weight": 0.30,
        "scoreRule": {
          "type": "per_count",
          "deductionPerCount": 15,
          "severityFilter": ["major", "critical"]
        },
        "maxScore": 45,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-01T00:00:00+08:00"
      },
      {
        "id": 3,
        "riskDimension": "violation",
        "riskIndicator": "近期三违频率",
        "indicatorCode": "VIOLATION_RECENT_FREQ",
        "weight": 0.30,
        "scoreRule": {
          "type": "tiered",
          "timeWindow": "90d",
          "tiers": [
            { "min": 0, "max": 0, "deduction": 0 },
            { "min": 1, "max": 1, "deduction": 5 },
            { "min": 2, "max": 999, "deduction": 15 }
          ]
        },
        "maxScore": 15,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-01T00:00:00+08:00"
      },
      {
        "id": 4,
        "riskDimension": "training",
        "riskIndicator": "培训完成率扣分",
        "indicatorCode": "TRAINING_COMPLETION_RATE",
        "weight": 0.50,
        "scoreRule": {
          "type": "threshold",
          "thresholds": [
            { "gte": 0.95, "deduction": 0 },
            { "gte": 0.85, "lt": 0.95, "deduction": 10 },
            { "gte": 0.70, "lt": 0.85, "deduction": 20 },
            { "lt": 0.70, "deduction": 35 }
          ]
        },
        "maxScore": 35,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-01T00:00:00+08:00"
      },
      {
        "id": 5,
        "riskDimension": "training",
        "riskIndicator": "逾期培训扣分",
        "indicatorCode": "TRAINING_OVERDUE",
        "weight": 0.30,
        "scoreRule": {
          "type": "per_count",
          "deductionPerCount": 8,
          "maxDeduction": 24
        },
        "maxScore": 24,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-01T00:00:00+08:00"
      },
      {
        "id": 6,
        "riskDimension": "training",
        "riskIndicator": "关键培训缺失扣分",
        "indicatorCode": "TRAINING_KEY_MISSING",
        "weight": 0.20,
        "scoreRule": {
          "type": "per_count",
          "deductionPerCount": 10,
          "keyTrainingOnly": true,
          "maxDeduction": 20
        },
        "maxScore": 20,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-01T00:00:00+08:00"
      },
      {
        "id": 7,
        "riskDimension": "accident",
        "riskIndicator": "责任事故扣分",
        "indicatorCode": "ACCIDENT_RESPONSIBLE",
        "weight": 0.50,
        "scoreRule": {
          "type": "tiered_severity",
          "tiers": {
            "minor": { "deductionPerCount": 10, "maxDeduction": 30 },
            "major": { "deductionPerCount": 20, "maxDeduction": 40 },
            "critical": { "deductionPerCount": 40, "maxDeduction": 50 }
          }
        },
        "maxScore": 50,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-01T00:00:00+08:00"
      },
      {
        "id": 8,
        "riskDimension": "accident",
        "riskIndicator": "近期事故频率扣分",
        "indicatorCode": "ACCIDENT_RECENT_FREQ",
        "weight": 0.50,
        "scoreRule": {
          "type": "tiered",
          "timeWindow": "180d",
          "tiers": [
            { "min": 0, "max": 0, "deduction": 0 },
            { "min": 1, "max": 1, "deduction": 10 },
            { "min": 2, "max": 999, "deduction": 25 }
          ]
        },
        "maxScore": 25,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-01T00:00:00+08:00"
      },
      {
        "id": 9,
        "riskDimension": "hazard",
        "riskIndicator": "整改逾期扣分",
        "indicatorCode": "HAZARD_OVERDUE_RECTIFICATION",
        "weight": 0.40,
        "scoreRule": {
          "type": "per_count",
          "deductionPerCount": 8,
          "maxDeduction": 32
        },
        "maxScore": 32,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-01T00:00:00+08:00"
      },
      {
        "id": 10,
        "riskDimension": "hazard",
        "riskIndicator": "重大隐患扣分",
        "indicatorCode": "HAZARD_MAJOR",
        "weight": 0.40,
        "scoreRule": {
          "type": "per_count",
          "deductionPerCount": 15,
          "severityFilter": ["major", "critical"],
          "maxDeduction": 30
        },
        "maxScore": 30,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-01T00:00:00+08:00"
      },
      {
        "id": 11,
        "riskDimension": "hazard",
        "riskIndicator": "隐患发现率调整",
        "indicatorCode": "HAZARD_DISCOVERY_RATE",
        "weight": 0.20,
        "scoreRule": {
          "type": "adjustment",
          "description": "隐患发现率高于平均值给予加分",
          "bonusPerPercentAboveAvg": 0.5,
          "maxBonus": 10
        },
        "maxScore": 10,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-01T00:00:00+08:00"
      },
      {
        "id": 12,
        "riskDimension": "traffic",
        "riskIndicator": "交通违章扣分",
        "indicatorCode": "TRAFFIC_VIOLATION",
        "weight": 0.50,
        "scoreRule": {
          "type": "per_count",
          "deductionPerCount": 10,
          "maxDeduction": 30,
          "applicableOnly": "driver"
        },
        "maxScore": 30,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-01T00:00:00+08:00"
      },
      {
        "id": 13,
        "riskDimension": "traffic",
        "riskIndicator": "交通事故扣分",
        "indicatorCode": "TRAFFIC_ACCIDENT",
        "weight": 0.50,
        "scoreRule": {
          "type": "tiered_severity",
          "tiers": {
            "minor": { "deductionPerCount": 8, "maxDeduction": 24 },
            "major": { "deductionPerCount": 15, "maxDeduction": 30 },
            "critical": { "deductionPerCount": 30, "maxDeduction": 50 }
          },
          "applicableOnly": "driver"
        },
        "maxScore": 50,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-01T00:00:00+08:00"
      },
      {
        "id": 14,
        "riskDimension": "patrol",
        "riskIndicator": "巡查完成率扣分",
        "indicatorCode": "PATROL_COMPLETION_RATE",
        "weight": 0.60,
        "scoreRule": {
          "type": "threshold",
          "thresholds": [
            { "gte": 1.0, "deduction": 0 },
            { "gte": 0.8, "lt": 1.0, "deduction": 10 },
            { "gte": 0.6, "lt": 0.8, "deduction": 20 },
            { "lt": 0.6, "deduction": 35 }
          ],
          "applicableOnly": "grid_leader"
        },
        "maxScore": 35,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-01T00:00:00+08:00"
      },
      {
        "id": 15,
        "riskDimension": "patrol",
        "riskIndicator": "巡查频次不足扣分",
        "indicatorCode": "PATROL_FREQUENCY_SHORTFALL",
        "weight": 0.40,
        "scoreRule": {
          "type": "per_count",
          "deductionPerCount": 8,
          "maxDeduction": 24,
          "applicableOnly": "grid_leader"
        },
        "maxScore": 24,
        "enabled": true,
        "createdAt": "2026-07-01T00:00:00+08:00",
        "updatedAt": "2026-07-01T00:00:00+08:00"
      }
    ],
    "total": 15
  }
}
```

---

## 6. PUT /score-config/:id — 更新评分配置

更新指定评分配置项的权重、评分规则等。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | long | 是 | 配置ID（路径参数） |

### 请求体

```json
{
  "weight": 0.35,
  "scoreRule": {
    "type": "tiered",
    "tiers": [
      { "min": 0, "max": 0, "deduction": 0 },
      { "min": 1, "max": 2, "deduction": 12 },
      { "min": 3, "max": 5, "deduction": 30 },
      { "min": 6, "max": 999, "deduction": 55 }
    ]
  },
  "maxScore": 55,
  "enabled": true
}
```

### 响应格式

```json
{
  "code": 0,
  "message": "success",
  "result": {
    "id": 1,
    "riskDimension": "violation",
    "riskIndicator": "年度三违次数扣分",
    "indicatorCode": "VIOLATION_ANNUAL_COUNT",
    "weight": 0.35,
    "scoreRule": {
      "type": "tiered",
      "tiers": [
        { "min": 0, "max": 0, "deduction": 0 },
        { "min": 1, "max": 2, "deduction": 12 },
        { "min": 3, "max": 5, "deduction": 30 },
        { "min": 6, "max": 999, "deduction": 55 }
      ]
    },
    "maxScore": 55,
    "enabled": true,
    "createdAt": "2026-07-01T00:00:00+08:00",
    "updatedAt": "2026-07-22T16:00:00+08:00"
  }
}
```

---

## 7. POST /calculate-all — 批量计算所有员工评分

触发全量员工的评分计算，结果写入快照表。该接口为异步操作，立即返回任务ID。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| snapshotDate | string | 否 | 快照日期，默认当天 |
| force | boolean | 否 | 是否强制重算（覆盖当日已有快照），默认false |

### 请求体

```json
{
  "snapshotDate": "2026-07-22",
  "force": false
}
```

### 响应格式

```json
{
  "code": 0,
  "message": "success",
  "result": {
    "taskId": "calc_20260722_163000",
    "status": "processing",
    "snapshotDate": "2026-07-22",
    "totalEmployees": 156,
    "processedCount": 0,
    "startedAt": "2026-07-22T16:30:00+08:00",
    "message": "批量计算任务已启动，共156名员工待计算"
  }
}
```

### 补充说明

- 计算完成后，快照自动写入 `hse_employee_risk_snapshot` 表
- 同一 `snapshot_date` 的已有记录默认跳过（`force=true` 时覆盖）
- 大批量计算建议在非高峰时段执行

---

## 8. GET /dimension/:type — 维度明细查询

查询指定风险维度的明细数据，支持分页。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 维度类型（路径参数）：violation / training / accident / hazard / traffic / patrol |
| employeeId | long | 否 | 员工ID筛选 |
| page | int | 否 | 页码，默认1 |
| pageSize | int | 否 | 每页条数，默认20 |

### 响应格式

以 `violation`（三违）为例：

```json
{
  "code": 0,
  "message": "success",
  "result": {
    "dimension": "violation",
    "dimensionLabel": "三违风险",
    "items": [
      {
        "employeeId": 1001,
        "employeeName": "张三",
        "employeeNo": "EMP001",
        "orgName": "采油一队",
        "score": 65,
        "details": {
          "totalViolations": 3,
          "thisYearViolations": 1,
          "severityBreakdown": {
            "minor": 2,
            "major": 1,
            "critical": 0
          },
          "recentViolations": [
            {
              "id": 2001,
              "type": "违章作业",
              "severity": "major",
              "date": "2026-05-15",
              "description": "未佩戴安全帽进入施工现场"
            }
          ]
        }
      }
    ],
    "total": 45,
    "page": 1,
    "pageSize": 20
  }
}
```

以 `training`（培训）为例：

```json
{
  "code": 0,
  "message": "success",
  "result": {
    "dimension": "training",
    "dimensionLabel": "培训风险",
    "items": [
      {
        "employeeId": 1001,
        "employeeName": "张三",
        "employeeNo": "EMP001",
        "orgName": "采油一队",
        "score": 80,
        "details": {
          "totalCourses": 10,
          "completedCourses": 8,
          "overdueCourses": 1,
          "completionRate": 0.80,
          "overdueList": [
            {
              "courseId": 301,
              "courseName": "HSE安全管理",
              "dueDate": "2026-06-30",
              "status": "overdue"
            }
          ]
        }
      }
    ],
    "total": 38,
    "page": 1,
    "pageSize": 20
  }
}
```

以 `patrol`（巡查）为例：

```json
{
  "code": 0,
  "message": "success",
  "result": {
    "dimension": "patrol",
    "dimensionLabel": "网格巡查责任风险",
    "items": [
      {
        "employeeId": 1001,
        "employeeName": "张三",
        "employeeNo": "EMP001",
        "orgName": "采油一队",
        "score": 60,
        "details": {
          "gridLevel": "三级网格",
          "gridRole": "网格长",
          "patrolRequired": 4,
          "patrolActual": 3,
          "patrolCompletionRate": 0.75,
          "recentPatrols": [
            {
              "date": "2026-07-18",
              "status": "completed",
              "duration": 45,
              "issuesFound": 2
            },
            {
              "date": "2026-07-20",
              "status": "completed",
              "duration": 30,
              "issuesFound": 0
            }
          ]
        }
      }
    ],
    "total": 12,
    "page": 1,
    "pageSize": 20
  }
}
```

---

## 通用错误响应

所有接口在异常时返回统一格式：

```json
{
  "code": 500,
  "message": "错误描述信息",
  "result": null
}
```

| 错误码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 未授权访问 |
| 403 | 无权限操作 |
| 404 | 资源不存在（员工/配置项未找到） |
| 409 | 冲突（如当日快照已存在且未设置force） |
| 500 | 服务器内部错误 |
