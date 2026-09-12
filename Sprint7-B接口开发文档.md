# Sprint7-B 接口开发文档

## 一、概述

本文档描述HSE智能预警中心的后端API接口设计。所有接口均遵循RESTful规范，使用JSON格式数据交互。

### 1.1 基础信息
- **路由前缀**：`/api/hse/warning-center`
- **数据格式**：JSON
- **字符编码**：UTF-8
- **认证方式**：JWT Token（Authorization: Bearer {token}）

### 1.2 通用响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

- **code**：状态码，0表示成功，非0表示失败
- **message**：响应消息
- **data**：响应数据

---

## 二、模块一：风险预警中心

### 2.1 GET /warnings - 预警列表

**功能**：分页查询预警记录列表

**请求参数**（Query）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| source_type | string | 否 | 预警来源：employee_risk/driver_risk/accident/assessment/management |
| warning_level | string | 否 | 预警等级：critical/major/minor/info |
| status | string | 否 | 状态：pending/processing/resolved/closed/ignored |
| target_type | string | 否 | 对象类型：employee/organization |
| page | number | 否 | 页码，默认1 |
| pageSize | number | 否 | 每页条数，默认20，最大100 |

**响应数据**：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

**列表项字段**：参见WarningRecord类型定义。

---

### 2.2 GET /warnings/stats - 预警统计

**功能**：获取预警总体统计数据

**请求参数**：无

**响应数据**：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "overall": {
      "total": 100,
      "pendingCount": 20,
      "processingCount": 30,
      "resolvedCount": 10,
      "closedCount": 35,
      "ignoredCount": 5,
      "criticalCount": 10,
      "majorCount": 25,
      "minorCount": 40,
      "infoCount": 25,
      "escalatedCount": 5
    },
    "bySource": [
      {
        "sourceType": "employee_risk",
        "sourceTypeLabel": "员工风险",
        "total": 30,
        "activeCount": 15,
        "closedCount": 15
      }
    ]
  }
}
```

---

### 2.3 GET /warnings/:id - 预警详情

**功能**：获取单条预警记录的详细信息

**请求参数**（Path）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | number | 是 | 预警记录ID |

**响应数据**：WarningRecord完整对象，包含关联任务信息。

---

### 2.4 POST /warnings/scan - 手动触发预警扫描

**功能**：手动触发一次全量预警扫描

**权限要求**：admin / safety_manager

**请求体**：无

**响应数据**：

```json
{
  "code": 0,
  "message": "扫描完成，共生成 15 条预警",
  "data": {
    "totalGenerated": 15,
    "rulesScanned": 10,
    "details": [
      {
        "ruleCode": "WR-EMP-001",
        "ruleName": "高风险员工预警",
        "generated": 5
      }
    ]
  }
}
```

---

### 2.5 POST /warnings/escalate - 执行升级检查

**功能**：手动触发预警升级检查

**权限要求**：admin / safety_manager

**请求体**：无

**响应数据**：

```json
{
  "code": 0,
  "message": "升级检查完成，共升级 3 条预警",
  "data": {
    "totalEscalated": 3,
    "criticalEscalated": 2,
    "majorEscalated": 1,
    "details": [
      {
        "warningId": 100,
        "warningCode": "WN-20250115-0001",
        "originalLevel": "major",
        "escalatedLevel": "critical",
        "pendingHours": 52,
        "targetName": "张三"
      }
    ]
  }
}
```

---

## 三、模块二：整改任务中心

### 3.1 GET /tasks - 整改任务列表

**功能**：分页查询整改任务列表

**请求参数**（Query）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| status | string | 否 | 任务状态 |
| priority | string | 否 | 优先级：low/normal/high/urgent |
| responsible_id | number | 否 | 责任人ID |
| org_id | number | 否 | 责任单位ID |
| warning_id | number | 否 | 关联预警ID |
| page | number | 否 | 页码，默认1 |
| pageSize | number | 否 | 每页条数，默认20 |

**响应数据**：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [...],
    "total": 50,
    "page": 1,
    "pageSize": 20
  }
}
```

---

### 3.2 GET /tasks/:id - 任务详情

**功能**：获取单条整改任务详情

**请求参数**（Path）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | number | 是 | 任务ID |

**响应数据**：WarningTask完整对象，包含关联预警信息。

---

### 3.3 POST /tasks - 创建整改任务

**功能**：手动创建整改任务

**权限要求**：admin / safety_manager / department_manager / township_manager / area_manager / administrator

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| warning_id | number | 否 | 关联预警ID |
| task_title | string | 是 | 任务标题 |
| description | string | 否 | 任务描述 |
| responsible_id | number | 是 | 责任人ID |
| responsible_name | string | 否 | 责任人姓名 |
| org_id | number | 否 | 责任单位ID |
| org_name | string | 否 | 责任单位名称 |
| deadline_date | string | 是 | 整改期限（YYYY-MM-DD） |
| priority | string | 否 | 优先级，默认normal |

**响应数据**：创建的任务对象。

---

### 3.4 PUT /tasks/:id/dispatch - 下发任务

**功能**：将任务状态从pending改为dispatched

**权限要求**：admin / safety_manager / department_manager / township_manager / area_manager / administrator

**请求参数**（Path）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | number | 是 | 任务ID |

---

### 3.5 PUT /tasks/:id/process - 开始处理

**功能**：将任务状态改为processing

**请求参数**（Path）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | number | 是 | 任务ID |

---

### 3.6 PUT /tasks/:id/submit-proof - 提交整改证明

**功能**：提交整改证明，状态改为pending_review

**请求参数**（Path）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | number | 是 | 任务ID |

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| process_note | string | 是 | 处理说明 |
| process_attachment | array | 否 | 处理附件列表 |
| progress | number | 否 | 进度百分比，默认100 |

---

### 3.7 PUT /tasks/:id/review - 复核

**功能**：复核任务，通过则关闭，驳回则退回处理

**权限要求**：admin / safety_manager / department_manager / township_manager

**请求参数**（Path）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | number | 是 | 任务ID |

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| review_result | string | 是 | 复核结果：approved/rejected |
| review_note | string | 否 | 复核意见 |
| review_attachment | array | 否 | 复核附件 |

---

### 3.8 PUT /tasks/:id/close - 手动关闭任务

**功能**：手动关闭任务

**权限要求**：admin / safety_manager

**请求参数**（Path）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | number | 是 | 任务ID |

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| close_note | string | 否 | 关闭备注 |

---

## 四、模块三：整改闭环分析

### 4.1 GET /analysis - 整改闭环分析

**功能**：获取整改闭环统计分析数据

**请求参数**（Query）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| year | number | 否 | 统计年份，默认当前年 |

**响应数据**：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "currentYear": 2025,
    "overall": {
      "totalTasks": 100,
      "closedTasks": 75,
      "overdueTasks": 10,
      "pendingTasks": 5,
      "dispatchedTasks": 5,
      "processingTasks": 8,
      "reviewTasks": 4,
      "rejectedTasks": 3,
      "avgCloseDays": 5.2,
      "rectificationRate": 75,
      "overdueRate": 10
    },
    "bySource": [...],
    "byLevel": [...],
    "monthlyTrend": [...],
    "repeatRiskRate": 15,
    "repeatTargets": 15,
    "totalTargets": 100
  }
}
```

---

## 五、模块四：预警规则管理

### 5.1 GET /rules - 规则列表

**功能**：分页查询预警规则列表

**请求参数**（Query）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| source_type | string | 否 | 预警来源 |
| status | string | 否 | 状态：active/inactive |
| page | number | 否 | 页码，默认1 |
| pageSize | number | 否 | 每页条数，默认50 |

---

### 5.2 GET /rules/:id - 规则详情

**功能**：获取单条规则详情，包含版本历史

**请求参数**（Path）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | number | 是 | 规则ID |

---

### 5.3 POST /rules - 创建规则

**功能**：创建新的预警规则（初始版本v1.0）

**权限要求**：admin / safety_manager

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| rule_name | string | 是 | 规则名称 |
| source_type | string | 是 | 预警来源 |
| warning_level | string | 是 | 预警等级 |
| target_type | string | 否 | 对象类型，默认employee |
| condition_config | object | 否 | 触发条件配置 |
| action_config | object | 否 | 处置动作配置 |
| description | string | 否 | 规则描述 |
| status | string | 否 | 状态，默认active |

---

### 5.4 PUT /rules/:id - 更新规则（版本化）

**功能**：更新规则，自动递增版本号（+0.1），保存版本快照

**权限要求**：admin / safety_manager

**请求参数**（Path）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | number | 是 | 规则ID |

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| rule_name | string | 否 | 规则名称 |
| source_type | string | 否 | 预警来源 |
| warning_level | string | 否 | 预警等级 |
| target_type | string | 否 | 对象类型 |
| condition_config | object | 否 | 触发条件配置 |
| action_config | object | 否 | 处置动作配置 |
| description | string | 否 | 规则描述 |
| change_log | string | 是 | 变更说明 |

---

### 5.5 PUT /rules/:id/toggle - 启停规则

**功能**：切换规则启用/停用状态

**权限要求**：admin / safety_manager

**请求参数**（Path）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | number | 是 | 规则ID |

---

### 5.6 GET /rules/versions - 规则版本列表

**功能**：获取指定规则的版本历史列表

**请求参数**（Query）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| rule_id | number | 是 | 规则ID |

---

## 六、定时任务说明

### 6.1 预警扫描任务
- **Cron表达式**：`0 2 * * *`
- **执行时间**：每日凌晨2:00（Asia/Shanghai时区）
- **功能**：扫描所有active规则，生成新的预警记录

### 6.2 升级检查任务
- **Cron表达式**：`0 * * * *`
- **执行时间**：每小时整点（Asia/Shanghai时区）
- **功能**：检查待处理/处理中的预警，执行升级逻辑

---

## 七、核心代码文件

- 后端路由：[hse-warning-center.js](file:///f:/deploy/hse-dashboard/server/routes/hse-warning-center.js)
- 前端API：[warning-center.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/warning-center.ts)
