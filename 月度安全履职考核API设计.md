# 月度安全履职考核API设计

> **文档性质**：前端调用接口设计文档
> **版本**：v1.0
> **冻结日期**：2026-07-23
> **关联任务**：Sprint10-D-1-9
> **接口规范**：RESTful API，统一前缀 `/api/v1/assessment`

---

## 一、接口总览

### 1.1 通用规范

| 规范项 | 说明 |
| :--- | :--- |
| **基础路径** | `/api/v1/assessment` |
| **请求格式** | `application/json`（文件上传除外） |
| **响应格式** | 统一JSON结构 |
| **认证方式** | Bearer Token（JWT） |
| **分页参数** | `page`(页码，从1开始), `page_size`(每页条数，默认20) |
| **排序参数** | `sort_by`(排序字段), `sort_order`(asc/desc) |

### 1.2 统一响应结构

```json
{
  "code": 200,
  "message": "success",
  "data": { ... },
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 100
  }
}
```

### 1.3 接口分组总览（10组）

| 序号 | 接口组 | 路径前缀 | 接口数 |
| :--- | :--- | :--- | :--- |
| 1 | 考核周期接口 | `/cycles` | 6 |
| 2 | 考核对象接口 | `/targets` | 5 |
| 3 | 指标接口 | `/metrics` | 5 |
| 4 | 自动评分接口 | `/scoring` | 3 |
| 5 | 扣分审核接口 | `/deductions/review` | 4 |
| 6 | 调整接口 | `/deductions/adjust` | 3 |
| 7 | 冻结接口 | `/freeze` | 3 |
| 8 | 结果查询接口 | `/results` | 5 |
| 9 | Excel导入接口 | `/import` | 3 |
| 10 | Excel导出接口 | `/export` | 3 |
| **合计** | — | — | **40** |

---

## 二、接口详细设计

### 2.1 考核周期接口

#### 2.1.1 创建考核周期

```
POST /api/v1/assessment/cycles
```

**请求体**：
```json
{
  "assessment_year": 2026,
  "assessment_month": 5,
  "cycle_name": "2026年5月月度考核",
  "remark": ""
}
```

**响应**：
```json
{
  "code": 200,
  "message": "考核周期创建成功",
  "data": {
    "id": 1,
    "cycle_code": "HSE-CYCLE-202605",
    "cycle_name": "2026年5月月度考核",
    "status": "not_started",
    "start_time": "2026-05-01T00:00:00+08:00",
    "end_time": "2026-05-31T23:59:59+08:00"
  }
}
```

#### 2.1.2 查询考核周期列表

```
GET /api/v1/assessment/cycles?page=1&page_size=20&status=in_progress&year=2026
```

**响应**：
```json
{
  "code": 200,
  "data": {
    "list": [
      {
        "id": 1,
        "cycle_code": "HSE-CYCLE-202605",
        "cycle_name": "2026年5月月度考核",
        "assessment_year": 2026,
        "assessment_month": 5,
        "status": "in_progress",
        "target_count": 50,
        "scored_count": 30,
        "reviewed_count": 10,
        "frozen_count": 0,
        "created_at": "2026-06-01T09:00:00+08:00"
      }
    ]
  },
  "pagination": { "page": 1, "page_size": 20, "total": 1 }
}
```

#### 2.1.3 获取考核周期详情

```
GET /api/v1/assessment/cycles/{cycleId}
```

#### 2.1.4 更新考核周期

```
PUT /api/v1/assessment/cycles/{cycleId}
```

#### 2.1.5 删除考核周期（软删除）

```
DELETE /api/v1/assessment/cycles/{cycleId}
```

#### 2.1.6 启动考核周期

```
POST /api/v1/assessment/cycles/{cycleId}/start
```

**响应**：
```json
{
  "code": 200,
  "message": "考核周期已启动，系统开始生成考核对象",
  "data": {
    "cycle_id": 1,
    "status": "in_progress",
    "target_count": 50
  }
}
```

---

### 2.2 考核对象接口

#### 2.2.1 查询考核对象列表

```
GET /api/v1/assessment/cycles/{cycleId}/targets?page=1&page_size=20&township=津城&position=管理员&status=pending
```

**响应**：
```json
{
  "code": 200,
  "data": {
    "list": [
      {
        "id": 1,
        "cycle_id": 1,
        "employee_id": 1001,
        "employee_name": "张三",
        "position": "管理员",
        "township": "津城街道",
        "department": "一班",
        "status": "pending",
        "review_status": "pending",
        "review_progress": 0,
        "score_total": null,
        "grade": null,
        "is_rejected": false
      }
    ]
  },
  "pagination": { "page": 1, "page_size": 20, "total": 50 }
}
```

#### 2.2.2 获取考核对象详情

```
GET /api/v1/assessment/targets/{targetId}
```

#### 2.2.3 添加考核对象

```
POST /api/v1/assessment/cycles/{cycleId}/targets
```

**请求体**：
```json
{
  "employee_ids": [1001, 1002]
}
```

#### 2.2.4 移除考核对象

```
DELETE /api/v1/assessment/targets/{targetId}
```

#### 2.2.5 从人员系统同步考核对象

```
POST /api/v1/assessment/cycles/{cycleId}/targets/sync
```

**响应**：
```json
{
  "code": 200,
  "message": "同步完成",
  "data": {
    "added": 3,
    "removed": 1,
    "total": 52
  }
}
```

---

### 2.3 指标接口

#### 2.3.1 查询指标列表

```
GET /api/v1/assessment/metrics?category=SAFETY&target_post=all&status=active
```

#### 2.3.2 获取指标详情

```
GET /api/v1/assessment/metrics/{metricId}
```

#### 2.3.3 新增指标

```
POST /api/v1/assessment/metrics
```

**请求体**：
```json
{
  "metric_code": "HSE-KPI-SAF-005",
  "metric_name": "现场规范率",
  "category": "SAFETY",
  "target_post": "all",
  "base_score": 10,
  "metric_type": "positive",
  "data_source": "inspection_records",
  "weight_manager": 5,
  "weight_admin": 5,
  "rule_config": {
    "calc_formula": "score = base_score * compliance_rate"
  }
}
```

#### 2.3.4 更新指标

```
PUT /api/v1/assessment/metrics/{metricId}
```

#### 2.3.5 删除指标（软删除）

```
DELETE /api/v1/assessment/metrics/{metricId}
```

---

### 2.4 自动评分接口

#### 2.4.1 执行自动评分

```
POST /api/v1/assessment/scoring/cycles/{cycleId}/execute
```

**请求体**：
```json
{
  "target_ids": [],
  "metric_codes": []
}
```

> `target_ids`为空数组表示全部考核对象；`metric_codes`为空数组表示全部指标。

**响应**：
```json
{
  "code": 200,
  "message": "自动评分已启动",
  "data": {
    "task_id": "scoring-task-202605-001",
    "total_targets": 50,
    "total_metrics": 9,
    "status": "running"
  }
}
```

#### 2.4.2 查询评分进度

```
GET /api/v1/assessment/scoring/cycles/{cycleId}/progress
```

**响应**：
```json
{
  "code": 200,
  "data": {
    "status": "completed",
    "total": 50,
    "completed": 50,
    "failed": 0,
    "progress": 100,
    "duration_ms": 15200
  }
}
```

#### 2.4.3 查询评分记录

```
GET /api/v1/assessment/targets/{targetId}/scores
```

**响应**：
```json
{
  "code": 200,
  "data": {
    "target_id": 1,
    "target_name": "张三",
    "position": "管理员",
    "scores": [
      {
        "id": 1,
        "metric_code": "HSE-KPI-SAF-001",
        "metric_name": "三违行为管控",
        "base_score": 40,
        "raw_value": 2,
        "raw_value_desc": "个人三违1次(轻微)，传导三违1次(轻微)",
        "deduction_total": 6,
        "original_score": 34,
        "final_score": 34,
        "review_status": "pending",
        "is_auto": true,
        "data_sources": {
          "violation_count": 1,
          "transmission_count": 1
        }
      }
    ]
  }
}
```

---

### 2.5 扣分审核接口

#### 2.5.1 查询扣分明细列表

```
GET /api/v1/assessment/targets/{targetId}/deductions?review_status=pending&metric_code=HSE-KPI-SAF-001
```

**响应**：
```json
{
  "code": 200,
  "data": {
    "list": [
      {
        "id": 1,
        "deduction_item": "个人三违-穿拖鞋",
        "deduction_type": "personal_violation",
        "deduction_source": "auto",
        "suggested_score": 5,
        "confirmed_score": null,
        "current_version": 1,
        "review_status": "pending",
        "violation_level": "轻微",
        "violation_date": "2026-05-15",
        "violator_name": "张三",
        "is_transmission": false,
        "source_detail": {
          "violation_id": 123,
          "description": "作业现场穿拖鞋"
        }
      },
      {
        "id": 2,
        "deduction_item": "责任传导-李四三违",
        "deduction_type": "transmission",
        "deduction_source": "auto",
        "suggested_score": 1,
        "confirmed_score": null,
        "current_version": 1,
        "review_status": "pending",
        "is_transmission": true,
        "violator_name": "李四",
        "source_detail": {
          "violation_id": 124,
          "description": "未佩戴安全帽"
        }
      }
    ]
  }
}
```

#### 2.5.2 批量审核扣分

```
POST /api/v1/assessment/deductions/review/batch
```

**请求体**：
```json
{
  "deduction_ids": [1, 2, 3],
  "action": "confirm",
  "comment": "审核无误"
}
```

> `action` 可选值：`confirm`(确认) / `reject`(驳回)

#### 2.5.3 审核确认扣分

```
POST /api/v1/assessment/deductions/{deductionId}/review/confirm
```

**请求体**：
```json
{
  "comment": "扣分合理，确认"
}
```

#### 2.5.4 审核驳回扣分

```
POST /api/v1/assessment/deductions/{deductionId}/review/reject
```

**请求体**：
```json
{
  "reject_reason": "经核实为系统误判，该记录为重复录入"
}
```

---

### 2.6 调整接口

#### 2.6.1 调整扣分值

```
POST /api/v1/assessment/deductions/{deductionId}/adjust
```

**请求体**：
```json
{
  "new_score": 2,
  "adjustment_reason": "当事人3日内完成整改并提交报告，酌情减免",
  "reviewed_by": 2002
}
```

**响应**：
```json
{
  "code": 200,
  "message": "扣分已调整，生成新版本",
  "data": {
    "deduction_id": 1,
    "version_no": 2,
    "old_score": 5,
    "new_score": 2,
    "adjusted_by": "王五",
    "adjusted_at": "2026-06-08T14:30:00+08:00"
  }
}
```

#### 2.6.2 查询扣分版本历史

```
GET /api/v1/assessment/deductions/{deductionId}/versions
```

**响应**：
```json
{
  "code": 200,
  "data": {
    "deduction_id": 1,
    "current_version": 2,
    "versions": [
      {
        "version_no": 1,
        "old_score": null,
        "new_score": 5,
        "operation_type": "CREATE",
        "adjustment_reason": "系统自动计算（三违轻微1次）",
        "adjusted_by": "SYSTEM",
        "adjusted_at": "2026-06-06T02:00:00+08:00",
        "is_current": false
      },
      {
        "version_no": 2,
        "old_score": 5,
        "new_score": 2,
        "operation_type": "ADJUST",
        "adjustment_reason": "已整改到位，酌情减免",
        "adjusted_by": "王五",
        "adjusted_at": "2026-06-08T14:30:00+08:00",
        "reviewed_by": "李四",
        "reviewed_at": "2026-06-08T16:00:00+08:00",
        "is_current": true
      }
    ]
  }
}
```

#### 2.6.3 版本回滚（特殊场景）

```
POST /api/v1/assessment/deductions/{deductionId}/adjust/rollback
```

**请求体**：
```json
{
  "target_version": 1,
  "rollback_reason": "误操作，恢复至原始值"
}
```

---

### 2.7 冻结接口

#### 2.7.1 冻结单个考核对象

```
POST /api/v1/assessment/freeze/targets/{targetId}
```

**请求体**：
```json
{
  "reason": "审核完成，确认冻结"
}
```

#### 2.7.2 批量冻结考核对象

```
POST /api/v1/assessment/freeze/cycles/{cycleId}/batch
```

**请求体**：
```json
{
  "target_ids": [1, 2, 3],
  "reason": "批量审核完成"
}
```

#### 2.7.3 冻结整个考核周期

```
POST /api/v1/assessment/freeze/cycles/{cycleId}
```

**请求体**：
```json
{
  "reason": "2026年5月考核全部审核完成，冻结归档"
}
```

**响应**：
```json
{
  "code": 200,
  "message": "考核周期已冻结",
  "data": {
    "cycle_id": 1,
    "frozen_count": 50,
    "frozen_by": "李四",
    "frozen_at": "2026-06-12T10:00:00+08:00"
  }
}
```

---

### 2.8 结果查询接口

#### 2.8.1 查询考核结果列表

```
GET /api/v1/assessment/results/cycles/{cycleId}?township=津城&position=管理员&grade=S&sort_by=score_total&sort_order=desc
```

**响应**：
```json
{
  "code": 200,
  "data": {
    "list": [
      {
        "target_id": 1,
        "employee_name": "张三",
        "position": "管理员",
        "township": "津城街道",
        "department": "一班",
        "score_auto": 62,
        "score_manual": 5,
        "score_bonus": 5,
        "score_total": 72,
        "grade": "C",
        "rank_township": 3,
        "rank_all": 5,
        "is_rejected": false,
        "status": "frozen"
      }
    ]
  }
}
```

#### 2.8.2 获取考核结果详情

```
GET /api/v1/assessment/results/targets/{targetId}
```

#### 2.8.3 查询排名

```
GET /api/v1/assessment/results/cycles/{cycleId}/ranking?scope=township&township=津城
```

#### 2.8.4 查询趋势分析

```
GET /api/v1/assessment/results/trends?employee_id=1001&months=6
```

#### 2.8.5 查询本人考核结果（考核对象视角）

```
GET /api/v1/assessment/results/my?cycle_id=1
```

---

### 2.9 Excel导入接口

#### 2.9.1 下载导入模板

```
GET /api/v1/assessment/import/template?type=deduction
```

**响应**：文件流（`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`）

#### 2.9.2 上传导入文件

```
POST /api/v1/assessment/import/cycles/{cycleId}
```

**请求**：`multipart/form-data`

| 参数 | 类型 | 说明 |
| :--- | :--- | :--- |
| file | File | Excel文件（.xlsx，≤5MB） |
| import_type | String | 导入类型：deduction(扣分)/score(评分) |

**响应**：
```json
{
  "code": 200,
  "message": "导入完成",
  "data": {
    "total_rows": 100,
    "success_count": 95,
    "failed_count": 5,
    "failed_details": [
      {
        "row": 12,
        "reason": "员工'王五'在'柴胡店'中未找到"
      },
      {
        "row": 25,
        "reason": "分值'abc'无效，应为0-100的数字"
      }
    ],
    "pending_review_count": 95
  }
}
```

#### 2.9.3 查询导入历史

```
GET /api/v1/assessment/import/history?page=1&page_size=20
```

---

### 2.10 Excel导出接口

#### 2.10.1 导出考核结果报表

```
POST /api/v1/assessment/export/cycles/{cycleId}/report
```

**请求体**：
```json
{
  "target_ids": [],
  "include_sheets": ["summary", "deductions", "versions"],
  "group_by": "township",
  "sort_by": "score_total",
  "sort_order": "desc"
}
```

**响应**：
```json
{
  "code": 200,
  "message": "报表生成成功",
  "data": {
    "file_id": "report-202605-001",
    "file_name": "HSE月度考核报表_宁津北控_202605.xlsx",
    "file_size": 256000,
    "download_url": "/api/v1/assessment/export/download/report-202605-001",
    "expire_at": "2026-06-13T10:30:00+08:00"
  }
}
```

#### 2.10.2 下载报表文件

```
GET /api/v1/assessment/export/download/{fileId}
```

**响应**：文件流（下载链接有效期30分钟）

#### 2.10.3 查询导出历史

```
GET /api/v1/assessment/export/history?page=1&page_size=20
```

**响应**：
```json
{
  "code": 200,
  "data": {
    "list": [
      {
        "file_id": "report-202605-001",
        "file_name": "HSE月度考核报表_宁津北控_202605.xlsx",
        "file_size": 256000,
        "exported_by": "王五",
        "exported_at": "2026-06-12T15:00:00+08:00",
        "download_count": 3
      }
    ]
  }
}
```

---

## 三、错误码定义

| 错误码 | 说明 | 触发场景 |
| :--- | :--- | :--- |
| 400 | 参数错误 | 请求参数缺失或格式错误 |
| 401 | 未认证 | Token缺失或过期 |
| 403 | 无权限 | 当前角色无权执行此操作 |
| 404 | 资源不存在 | 查询的周期/对象/扣分记录不存在 |
| 409 | 状态冲突 | 如：周期已冻结不可修改、同月周期已存在 |
| 422 | 业务校验失败 | 如：调整人与审核人为同一人、扣分值为负 |
| 500 | 服务器错误 | 系统内部异常 |

**错误响应示例**：
```json
{
  "code": 409,
  "message": "考核周期已冻结，不可修改",
  "data": null
}
```

---

## 四、接口权限矩阵

| 接口组 | 系统管理员 | HSE负责人 | HSE专员 | 审核人 | 考核对象 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 考核周期 | ✅ 全部 | ✅ 全部 | ✅ 创建/查询 | ❌ | ❌ |
| 考核对象 | ✅ 全部 | ✅ 全部 | ✅ 全部 | ✅ 查询(本乡镇) | ❌ |
| 指标管理 | ✅ 全部 | ❌ | ❌ | ❌ | ❌ |
| 自动评分 | ✅ 全部 | ✅ 全部 | ✅ 执行/查询 | ❌ | ❌ |
| 扣分审核 | ✅ 全部 | ✅ 全部 | ✅ 确认/驳回 | ✅ 确认/驳回(本乡镇) | ❌ |
| 扣分调整 | ✅ 全部 | ✅ 全部 | ✅ 调整 | ❌ | ❌ |
| 冻结 | ✅ 全部 | ✅ 全部 | ❌ | ❌ | ❌ |
| 结果查询 | ✅ 全部 | ✅ 全部 | ✅ 全部 | ✅ 本乡镇 | ✅ 本人 |
| Excel导入 | ✅ 全部 | ✅ 全部 | ✅ 导入 | ❌ | ❌ |
| Excel导出 | ✅ 全部 | ✅ 全部 | ✅ 导出 | ✅ 导出(本乡镇) | ✅ 导出(本人) |

---

*文档结束*
*冻结状态：✅ 已冻结*
*版本：v1.0*
