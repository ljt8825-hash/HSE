# AI数据溯源设计

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint8-B-1
> 关联文档：《Sprint8-B-1 AI能力冻结报告》、《AI Prompt版本管理设计》、《AI输出审核流程设计》

---

## 一、设计概述

### 1.1 设计背景

AI 生成的分析报告、整改建议等内容需要依赖历史 HSE 数据。为确保 AI 输出的准确性和可验证性，需要建立完整的数据溯源机制，记录所有输入数据的来源、指标和计算结果。

### 1.2 设计目标

| 目标 | 说明 |
|------|------|
| 数据来源可查 | 所有 AI 输出可追溯到原始数据来源 |
| 计算过程可溯 | AI 使用的指标、计算结果可溯源 |
| 结果可验证 | AI 输出可通过溯源数据验证准确性 |

### 1.3 溯源范围

| 溯源类型 | 数据来源 | 记录内容 |
|----------|----------|----------|
| 数据源 | employee_risk_snapshot | 员工风险评分快照 |
| 数据源 | driver_risk_snapshot | 驾驶风险评分快照 |
| 数据源 | hse_accident | 事故记录 |
| 数据源 | hse_assessment | 考核记录 |
| 数据源 | hse_warning_record | 预警记录 |
| 数据源 | hse_rectification_task | 整改任务 |
| 计算结果 | hse_risk_prediction | 预测结果 |
| 计算结果 | hse_analysis_snapshot | 分析快照 |

---

## 二、数据表设计

### 2.1 hse_ai_trace_record 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| ai_task_id | BIGINT | 关联 AI 任务 ID |
| trace_type | VARCHAR(32) | 溯源类型 |
| source_type | VARCHAR(32) | 来源类型 |
| source_id | BIGINT | 来源记录 ID |
| source_table | VARCHAR(64) | 来源表名 |
| metric_name | VARCHAR(128) | 指标名称 |
| metric_value | NUMERIC(20,6) | 指标值 |
| metric_unit | VARCHAR(32) | 指标单位 |
| data_time | TIMESTAMP | 数据时间 |
| calculation_method | TEXT | 计算方法说明 |
| data_details | JSONB | 数据详情 |
| created_at | TIMESTAMP | 创建时间 |

### 2.2 索引设计

```sql
-- AI任务索引
CREATE INDEX idx_trace_ai_task 
ON hse_ai_trace_record(ai_task_id);

-- 来源类型索引
CREATE INDEX idx_trace_source_type 
ON hse_ai_trace_record(source_type);

-- 数据时间索引
CREATE INDEX idx_trace_data_time 
ON hse_ai_trace_record(data_time);
```

---

## 三、溯源类型定义

### 3.1 溯源类型

| 类型 | 编码 | 说明 |
|------|------|------|
| 数据源 | data_source | 原始数据来源 |
| 指标计算 | metric_calculation | 指标计算结果 |
| 预测结果 | prediction_result | 预测模型输出 |

### 3.2 来源类型

| 来源类型 | 编码 | 说明 | 数据表 |
|----------|------|------|--------|
| 员工风险 | employee_risk | 员工风险评分 | employee_risk_snapshot |
| 驾驶风险 | driver_risk | 驾驶风险评分 | driver_risk_snapshot |
| 事故记录 | accident | HSE 事故 | hse_accident |
| 考核记录 | assessment | HSE 考核 | hse_assessment |
| 预警记录 | warning | 预警记录 | hse_warning_record |
| 整改任务 | rectification | 整改任务 | hse_rectification_task |
| 预测结果 | prediction | 风险预测 | hse_risk_prediction |
| 分析快照 | analysis_snapshot | 分析快照 | hse_analysis_snapshot |

---

## 四、溯源记录示例

### 4.1 风险分析溯源示例

```json
{
  "ai_task_id": 100,
  "trace_records": [
    {
      "trace_type": "data_source",
      "source_type": "employee_risk",
      "source_id": 501,
      "source_table": "employee_risk_snapshot",
      "metric_name": "risk_score",
      "metric_value": 72.5,
      "metric_unit": "分",
      "data_time": "2026-07-22T00:00:00Z",
      "data_details": {
        "employee_id": 501,
        "employee_name": "张三",
        "risk_level": "major",
        "snapshot_date": "2026-07-22"
      }
    },
    {
      "trace_type": "metric_calculation",
      "source_type": "employee_risk",
      "source_id": 501,
      "metric_name": "avg_risk_score_12m",
      "metric_value": 68.3,
      "metric_unit": "分",
      "calculation_method": "近12个月风险评分均值",
      "data_details": {
        "data_points": 12,
        "start_date": "2025-07-22",
        "end_date": "2026-07-22",
        "values": [65, 67, 68, 66, 70, 72, 69, 71, 70, 68, 72, 72.5]
      }
    },
    {
      "trace_type": "prediction_result",
      "source_type": "prediction",
      "source_id": 100,
      "source_table": "hse_risk_prediction",
      "metric_name": "predicted_score",
      "metric_value": 78.5,
      "metric_unit": "分",
      "data_time": "2026-07-23T00:00:00Z",
      "data_details": {
        "prediction_type": "risk_trend",
        "predicted_level": "major",
        "predicted_trend": "up",
        "confidence": 0.85
      }
    }
  ]
}
```

### 4.2 事故分析溯源示例

```json
{
  "ai_task_id": 101,
  "trace_records": [
    {
      "trace_type": "data_source",
      "source_type": "accident",
      "source_id": 1001,
      "source_table": "hse_accident",
      "metric_name": "accident_info",
      "data_time": "2026-07-15T08:30:00Z",
      "data_details": {
        "accident_code": "ACC-20260715-0001",
        "accident_type": "交通事故",
        "accident_level": "一般事故",
        "location": "XX路段",
        "description": "..."
      }
    },
    {
      "trace_type": "data_source",
      "source_type": "employee_risk",
      "source_id": 501,
      "source_table": "employee_risk_snapshot",
      "metric_name": "driver_risk_score",
      "metric_value": 72.5,
      "data_time": "2026-07-15T00:00:00Z"
    },
    {
      "trace_type": "metric_calculation",
      "source_type": "accident",
      "metric_name": "similar_accident_count",
      "metric_value": 3,
      "metric_unit": "起",
      "calculation_method": "近12个月同类事故数量",
      "data_details": {
        "accident_type": "交通事故",
        "period": "12个月",
        "accident_ids": [998, 999, 1000]
      }
    }
  ]
}
```

---

## 五、溯源记录生成

### 5.1 生成时机

| 时机 | 说明 |
|------|------|
| AI 任务执行前 | 聚合输入数据时记录数据源 |
| AI 任务执行中 | 计算指标时记录计算结果 |
| AI 任务执行后 | 引用预测结果时记录预测输出 |

### 5.2 生成流程

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI 任务执行                                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   数据聚合阶段                                    │
│  - 查询数据源                                                     │
│  - 记录数据源溯源信息                                             │
│  - 写入 hse_ai_trace_record (trace_type=data_source)            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   指标计算阶段                                    │
│  - 计算聚合指标                                                   │
│  - 记录计算结果溯源信息                                           │
│  - 写入 hse_ai_trace_record (trace_type=metric_calculation)     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AI 推理阶段                                     │
│  - 调用 AI 模型                                                   │
│  - 引用预测结果时记录                                             │
│  - 写入 hse_ai_trace_record (trace_type=prediction_result)      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   溯源记录完成                                    │
│  - 溯源记录与 AI 任务关联                                         │
│  - 支持溯源查询和验证                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 六、API 设计

### 6.1 API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /ai/trace/:ai_task_id | 查询 AI 任务溯源记录 |
| GET | /ai/trace/:ai_task_id/export | 导出溯源报告 |
| GET | /ai/trace/verify/:ai_task_id | 验证溯源数据 |
| GET | /ai/trace/source/:source_type/:source_id | 查询数据源被引用记录 |

### 6.2 API 详细设计

#### 6.2.1 查询溯源记录

```
GET /api/hse/ai-assistant/ai/trace/:ai_task_id
```

**响应示例**

```json
{
  "code": 0,
  "data": {
    "aiTaskId": 100,
    "analysisType": "risk_analysis",
    "targetType": "employee",
    "targetId": 501,
    "targetName": "张三",
    "traceRecords": [
      {
        "id": 1,
        "traceType": "data_source",
        "sourceType": "employee_risk",
        "sourceId": 501,
        "sourceTable": "employee_risk_snapshot",
        "metricName": "risk_score",
        "metricValue": 72.5,
        "metricUnit": "分",
        "dataTime": "2026-07-22T00:00:00Z"
      }
    ],
    "totalRecords": 5,
    "createdAt": "2026-07-23T10:00:00Z"
  }
}
```

#### 6.2.2 导出溯源报告

```
GET /api/hse/ai-assistant/ai/trace/:ai_task_id/export?format=pdf
```

**响应**

返回溯源报告文件（PDF/Word/HTML）。

#### 6.2.3 验证溯源数据

```
GET /api/hse/ai-assistant/ai/trace/verify/:ai_task_id
```

**响应示例**

```json
{
  "code": 0,
  "data": {
    "aiTaskId": 100,
    "verifyResult": "passed",
    "verifyDetails": [
      {
        "sourceType": "employee_risk",
        "sourceId": 501,
        "metricName": "risk_score",
        "originalValue": 72.5,
        "currentValue": 72.5,
        "verifyStatus": "matched"
      }
    ],
    "verifiedAt": "2026-07-23T11:00:00Z"
  }
}
```

---

## 七、溯源验证机制

### 7.1 验证时机

| 时机 | 说明 |
|------|------|
| AI 输出审核时 | 验证引用数据是否准确 |
| 定期验证 | 定期验证历史 AI 输出数据是否变化 |
| 用户质疑时 | 用户质疑 AI 结论时验证数据来源 |

### 7.2 验证规则

| 验证项 | 说明 | 验证方法 |
|--------|------|----------|
| 数据存在性 | 验证来源数据是否存在 | 查询源表记录 |
| 数据一致性 | 验证数据值是否一致 | 对比原始值和当前值 |
| 计算正确性 | 验证计算结果是否正确 | 重新计算对比 |

### 7.3 验证结果

| 结果 | 说明 |
|------|------|
| passed | 验证通过，数据一致 |
| warning | 验证警告，数据轻微变化 |
| failed | 验证失败，数据不一致 |

---

## 八、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | AI数据溯源设计初始版本 |