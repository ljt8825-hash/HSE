# API V2 接口设计

## 一、设计原则

### 1.1 RESTful规范

- 使用标准HTTP方法: GET/POST/PUT/DELETE
- 使用复数名词作为资源路径
- 统一响应格式
- 支持分页、排序、筛选

### 1.2 统一响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": {},
  "timestamp": 1718761200000
}
```

### 1.3 错误响应格式

```json
{
  "code": 400,
  "message": "参数错误",
  "errors": ["文件类型不支持"],
  "timestamp": 1718761200000
}
```

### 1.4 状态码规范

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 201 | 创建成功 |
| 400 | 参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |

---

## 二、API模块总览

| 模块 | 路径前缀 | 说明 |
|------|----------|------|
| 文件管理 | `/api/hse/documents` | 文件上传、下载、搜索、版本管理 |
| AI分析 | `/api/hse/ai` | 文件分析、OCR、分类、风险识别 |
| 标准管理 | `/api/hse/standards` | 标准条款、达标台账、自评评分 |
| 报告管理 | `/api/hse/reports` | 报告生成、查询、下载 |
| 评分管理 | `/api/hse/scores` | 评分计算、查询、趋势 |
| 驾驶舱 | `/api/hse/cockpit` | 驾驶舱数据、统计指标 |

---

## 三、文件管理接口

### 3.1 文件上传

**POST** `/api/hse/documents/upload`

**请求体** (multipart/form-data):

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | 是 | 上传文件 |
| category_id | number | 否 | 分类ID |
| tags | string[] | 否 | 标签数组 |
| remark | string | 否 | 备注 |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "上传成功",
  "data": {
    "id": 1,
    "file_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "original_name": "2026年度安全培训记录.docx",
    "storage_name": "20260718_abc123.docx",
    "file_path": "/uploads/documents/2026/07/20260718_abc123.docx",
    "file_size": 102400,
    "file_type": "docx",
    "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "analysis_status": "pending",
    "uploaded_by": "zhangsan",
    "uploaded_at": "2026-07-18T10:30:00Z"
  }
}
```

### 3.2 文件列表查询

**GET** `/api/hse/documents`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码，默认1 |
| size | number | 否 | 每页数量，默认20 |
| category_id | number | 否 | 分类ID |
| file_type | string | 否 | 文件类型 |
| keyword | string | 否 | 搜索关键词 |
| analysis_status | string | 否 | 分析状态 |
| start_date | string | 否 | 开始日期(YYYY-MM-DD) |
| end_date | string | 否 | 结束日期(YYYY-MM-DD) |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "id": 1,
        "file_uuid": "550e8400-e29b-41d4-a716-446655440000",
        "original_name": "2026年度安全培训记录.docx",
        "file_type": "docx",
        "file_size": 102400,
        "category_name": "安全教育培训",
        "analysis_status": "completed",
        "completeness_score": 95,
        "uploaded_at": "2026-07-18T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "size": 20,
      "total": 100,
      "pages": 5
    }
  }
}
```

### 3.3 文件详情

**GET** `/api/hse/documents/:id`

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 文件ID |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "file_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "original_name": "2026年度安全培训记录.docx",
    "storage_name": "20260718_abc123.docx",
    "file_path": "/uploads/documents/2026/07/20260718_abc123.docx",
    "file_url": "/api/hse/documents/1/download",
    "file_size": 102400,
    "file_type": "docx",
    "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "category_id": 1,
    "category_name": "安全教育培训",
    "summary": "2026年度安全培训记录，共培训120人次...",
    "content_text": "...",
    "analysis_status": "completed",
    "completeness_score": 95,
    "risk_level": "low",
    "tags": ["培训", "2026年度"],
    "versions": [
      {"version_number": "V1.0", "created_at": "2026-07-18T10:30:00Z"}
    ],
    "uploaded_by": "zhangsan",
    "uploaded_at": "2026-07-18T10:30:00Z",
    "updated_at": "2026-07-18T10:30:00Z"
  }
}
```

### 3.4 文件下载

**GET** `/api/hse/documents/:id/download`

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 文件ID |

**成功响应**: 文件流

### 3.5 文件删除

**DELETE** `/api/hse/documents/:id`

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 文件ID |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "删除成功",
  "data": null
}
```

### 3.6 文件更新

**PUT** `/api/hse/documents/:id`

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| category_id | number | 否 | 分类ID |
| tags | string[] | 否 | 标签数组 |
| remark | string | 否 | 备注 |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "更新成功",
  "data": {}
}
```

### 3.7 文件版本列表

**GET** `/api/hse/documents/:id/versions`

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": 1,
      "version_number": "V1.0",
      "storage_name": "20260718_abc123_v1.docx",
      "file_size": 102400,
      "is_latest": false,
      "created_at": "2026-07-18T10:30:00Z"
    },
    {
      "id": 2,
      "version_number": "V2.0",
      "storage_name": "20260718_abc123_v2.docx",
      "file_size": 105000,
      "is_latest": true,
      "created_at": "2026-07-19T09:00:00Z"
    }
  ]
}
```

### 3.8 文件分类列表

**GET** `/api/hse/documents/categories`

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": 1,
      "parent_id": null,
      "code": "SAFETY_TRAINING",
      "name": "安全教育培训",
      "description": "安全培训相关文件",
      "children": [
        {"id": 5, "name": "培训计划"},
        {"id": 6, "name": "培训记录"}
      ]
    }
  ]
}
```

---

## 四、AI分析接口

### 4.1 文件分析

**POST** `/api/hse/ai/documents/analyze`

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file_id | number | 是 | 文件ID |
| analyze_type | string | 否 | 分析类型: all/ocr/parse/classify/risk/info，默认all |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "分析完成",
  "data": {
    "file_id": 1,
    "analysis_type": "all",
    "category": "安全教育培训",
    "category_confidence": 95,
    "extracted_info": {
      "documentType": "培训记录",
      "date": "2026-01",
      "trainer": "张三",
      "trainees": 120,
      "trainingContent": "消防安全知识"
    },
    "risk_level": "low",
    "risk_items": [],
    "suggested_tags": ["培训", "2026年度", "消防安全"],
    "suggested_standard_clauses": [
      {"clause_id": 101, "clause_name": "三级安全教育", "confidence": 90}
    ],
    "completeness_score": 95,
    "missing_items": [],
    "suggestions": "资料完整，建议定期更新培训内容",
    "analysis_time_ms": 3500,
    "ai_model": "grok-1"
  }
}
```

### 4.2 OCR识别

**POST** `/api/hse/ai/ocr`

**请求体** (multipart/form-data):

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| image | File | 是 | 图片文件 |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "识别完成",
  "data": {
    "ocr_text": "2026年1月安全检查记录\n检查人员：张三\n检查地点：第一作业区...",
    "confidence": 98
  }
}
```

### 4.3 文档分类

**POST** `/api/hse/ai/classify`

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| text | string | 是 | 文档内容 |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "分类完成",
  "data": {
    "category": "安全教育培训",
    "category_code": "TRAINING_RECORDS",
    "confidence": 95
  }
}
```

### 4.4 风险识别

**POST** `/api/hse/ai/risk-detect`

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| text | string | 是 | 文档内容 |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "风险识别完成",
  "data": {
    "risk_level": "medium",
    "risk_items": [
      {"description": "灭火器检查过期", "severity": "high"},
      {"description": "安全通道堵塞", "severity": "medium"}
    ],
    "suggestions": "建议立即更换过期灭火器，清理安全通道"
  }
}
```

---

## 五、标准管理接口

### 5.1 标准条款列表

**GET** `/api/hse/standards/clauses`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码 |
| size | number | 否 | 每页数量 |
| level | number | 否 | 级别: 1/2/3 |
| parent_id | number | 否 | 上级条款ID |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "id": 1,
        "parent_id": null,
        "level": 1,
        "code": "AQBZ-001",
        "name": "安全管理制度",
        "requirement": "建立健全安全管理制度体系",
        "score_criteria": "制度完善得10分，基本完善得6分，不完善得0分",
        "responsible_department": "安全部",
        "required_docs": ["安全生产责任制度", "安全培训制度"],
        "status": "completed",
        "score": 10,
        "children": [...]
      }
    ],
    "pagination": {}
  }
}
```

### 5.2 标准条款详情

**GET** `/api/hse/standards/clauses/:id`

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 101,
    "parent_id": 1,
    "level": 3,
    "code": "AQBZ-001-001",
    "name": "三级安全教育",
    "requirement": "新员工入职必须进行三级安全教育",
    "score_criteria": "培训记录完整得5分，部分完整得3分，无记录得0分",
    "responsible_department": "安全部",
    "responsible_person": "张三",
    "required_docs": ["三级安全教育记录", "考试试卷"],
    "status": "completed",
    "score": 5,
    "attached_docs": [
      {"id": 1, "name": "2026年度三级安全教育记录.docx"}
    ],
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

### 5.3 达标台账

**GET** `/api/hse/standards/compliance`

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "total_clauses": 150,
    "completed_clauses": 135,
    "compliance_rate": 90,
    "items": [
      {
        "clause_id": 101,
        "clause_name": "三级安全教育",
        "status": "completed",
        "score": 5,
        "required_docs_count": 2,
        "uploaded_docs_count": 2
      }
    ]
  }
}
```

### 5.4 自评评分

**POST** `/api/hse/standards/self-assessment`

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| clause_id | number | 是 | 条款ID |
| score | number | 是 | 评分(0-10) |
| comment | string | 否 | 自评意见 |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "评分成功",
  "data": {}
}
```

---

## 六、报告管理接口

### 6.1 生成报告

**POST** `/api/hse/reports/generate`

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| report_type | string | 是 | 报告类型: daily/weekly/monthly/quarterly/annual |
| period | string | 是 | 报告周期: 2026-01, 2026-W01, 2026-Q1 |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "报告生成成功",
  "data": {
    "id": 1,
    "report_type": "monthly",
    "period": "2026-01",
    "file_name": "2026年1月安全生产分析报告.md",
    "file_path": "/uploads/reports/monthly/2026/01/2026年1月安全生产分析报告.md",
    "file_url": "/api/hse/reports/1/download",
    "status": "completed",
    "generated_at": "2026-02-01T00:00:00Z"
  }
}
```

### 6.2 报告列表

**GET** `/api/hse/reports`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码 |
| size | number | 否 | 每页数量 |
| report_type | string | 否 | 报告类型 |
| period | string | 否 | 报告周期 |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "id": 1,
        "report_type": "monthly",
        "period": "2026-01",
        "file_name": "2026年1月安全生产分析报告.md",
        "status": "completed",
        "generated_at": "2026-02-01T00:00:00Z"
      }
    ],
    "pagination": {}
  }
}
```

### 6.3 报告下载

**GET** `/api/hse/reports/:id/download`

**成功响应**: 文件流

### 6.4 删除报告

**DELETE** `/api/hse/reports/:id`

**成功响应** (200):

```json
{
  "code": 200,
  "message": "删除成功",
  "data": null
}
```

---

## 七、评分管理接口

### 7.1 获取今日评分

**GET** `/api/hse/scores/today`

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "score_date": "2026-07-18",
    "standard_score": 90,
    "document_score": 95,
    "hazard_score": 98,
    "training_score": 100,
    "risk_score": 93,
    "overall_score": 92,
    "overall_level": "excellent",
    "details": {...}
  }
}
```

### 7.2 获取评分历史

**GET** `/api/hse/scores/history`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| start_date | string | 是 | 开始日期(YYYY-MM-DD) |
| end_date | string | 是 | 结束日期(YYYY-MM-DD) |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "score_date": "2026-07-18",
      "overall_score": 92,
      "overall_level": "excellent"
    },
    {
      "score_date": "2026-07-17",
      "overall_score": 91,
      "overall_level": "excellent"
    }
  ]
}
```

### 7.3 获取评分趋势

**GET** `/api/hse/scores/trend`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| trend_type | string | 否 | 趋势类型: daily/weekly/monthly/quarterly，默认monthly |
| months | number | 否 | 最近几个月，默认6 |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {"period": "2026-01", "overall_score_avg": 85},
    {"period": "2026-02", "overall_score_avg": 88},
    {"period": "2026-03", "overall_score_avg": 90},
    {"period": "2026-04", "overall_score_avg": 89},
    {"period": "2026-05", "overall_score_avg": 91},
    {"period": "2026-06", "overall_score_avg": 92}
  ]
}
```

### 7.4 手动触发评分计算

**POST** `/api/hse/scores/calculate`

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| date | string | 否 | 计算日期(YYYY-MM-DD)，默认今日 |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "计算完成",
  "data": {
    "overall_score": 92,
    "overall_level": "excellent"
  }
}
```

---

## 八、驾驶舱接口

### 8.1 获取驾驶舱概览数据

**GET** `/api/hse/cockpit/overview`

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "safety_index": 92,
    "safety_level": "excellent",
    "standard_compliance_rate": 90,
    "hazard_closed_rate": 98,
    "training_completion_rate": 100,
    "document_completeness_rate": 95,
    "risk_count": 5,
    "major_risk_count": 0,
    "active_hazard_count": 2,
    "today_inspection_count": 10
  }
}
```

### 8.2 获取隐患统计

**GET** `/api/hse/cockpit/hazard-stats`

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "by_level": [
      {"level": "重大", "count": 0, "color": "#ff4d4f"},
      {"level": "较大", "count": 1, "color": "#ff7a45"},
      {"level": "一般", "count": 5, "color": "#faad14"},
      {"level": "轻微", "count": 10, "color": "#52c41a"}
    ],
    "by_status": [
      {"status": "待整改", "count": 2},
      {"status": "整改中", "count": 3},
      {"status": "已闭环", "count": 11}
    ],
    "trend": [
      {"date": "07-12", "count": 5},
      {"date": "07-13", "count": 3},
      {"date": "07-14", "count": 8},
      {"date": "07-15", "count": 4},
      {"date": "07-16", "count": 6},
      {"date": "07-17", "count": 3},
      {"date": "07-18", "count": 2}
    ]
  }
}
```

### 8.3 获取培训统计

**GET** `/api/hse/cockpit/training-stats`

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "total_trainings": 120,
    "total_trainees": 500,
    "this_month_trainings": 15,
    "this_month_trainees": 60,
    "completion_rate": 100,
    "trend": [...]
  }
}
```

### 8.4 获取风险统计

**GET** `/api/hse/cockpit/risk-stats`

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "total_risks": 30,
    "controlled_risks": 28,
    "control_rate": 93.33,
    "by_level": [
      {"level": "重大", "count": 2},
      {"level": "较大", "count": 5},
      {"level": "一般", "count": 15},
      {"level": "低", "count": 8}
    ]
  }
}
```

### 8.5 获取事故统计

**GET** `/api/hse/cockpit/accident-stats`

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "this_year_accidents": 3,
    "this_month_accidents": 0,
    "trend": [...],
    "by_type": [...]
  }
}
```

---

## 九、标签管理接口

### 9.1 获取标签列表

**GET** `/api/hse/tags`

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {"id": 1, "name": "培训", "color": "#1890ff", "type": "manual", "usage_count": 50},
    {"id": 2, "name": "2026年度", "color": "#52c41a", "type": "auto", "usage_count": 30}
  ]
}
```

### 9.2 创建标签

**POST** `/api/hse/tags`

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 标签名称 |
| color | string | 否 | 标签颜色 |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "创建成功",
  "data": {"id": 1, "name": "新标签"}
}
```

---

## 十、权限认证接口

### 10.1 登录

**POST** `/api/auth/login`

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名 |
| password | string | 是 | 密码 |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "admin",
      "name": "管理员",
      "role": "admin",
      "permissions": ["document:view", "document:upload"]
    }
  }
}
```

### 10.2 刷新Token

**POST** `/api/auth/refresh`

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| refresh_token | string | 是 | 刷新Token |

**成功响应** (200):

```json
{
  "code": 200,
  "message": "刷新成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 10.3 获取用户信息

**GET** `/api/auth/me`

**成功响应** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "username": "admin",
    "name": "管理员",
    "role": "admin",
    "permissions": ["document:view", "document:upload", "document:delete"]
  }
}
```

---

## 十一、接口权限矩阵

| 接口路径 | 权限码 | 说明 |
|----------|--------|------|
| `/api/hse/documents/upload` | document:upload | 文件上传 |
| `/api/hse/documents` | document:view | 文件列表 |
| `/api/hse/documents/:id` | document:view | 文件详情 |
| `/api/hse/documents/:id/download` | document:download | 文件下载 |
| `/api/hse/documents/:id` (DELETE) | document:delete | 文件删除 |
| `/api/hse/ai/documents/analyze` | ai:analyze | 文件分析 |
| `/api/hse/ai/ocr` | ai:ocr | OCR识别 |
| `/api/hse/standards/clauses` | standard:view | 标准条款 |
| `/api/hse/standards/compliance` | standard:view | 达标台账 |
| `/api/hse/standards/self-assessment` | standard:assess | 自评评分 |
| `/api/hse/reports/generate` | report:generate | 生成报告 |
| `/api/hse/reports` | report:view | 报告列表 |
| `/api/hse/reports/:id/download` | report:download | 报告下载 |
| `/api/hse/scores/*` | score:view | 评分查询 |
| `/api/hse/scores/calculate` | score:calculate | 手动计算评分 |
| `/api/hse/cockpit/*` | cockpit:view | 驾驶舱 |
| `/api/hse/tags` | tag:view | 标签管理 |

---

## 十二、总结

### 12.1 API模块汇总

| 模块 | 接口数量 | 主要功能 |
|------|----------|----------|
| 文件管理 | 8 | 上传、下载、查询、删除、版本管理、分类 |
| AI分析 | 4 | 文件分析、OCR、分类、风险识别 |
| 标准管理 | 4 | 条款列表、详情、达标台账、自评评分 |
| 报告管理 | 4 | 生成、查询、下载、删除 |
| 评分管理 | 4 | 今日评分、历史、趋势、手动计算 |
| 驾驶舱 | 5 | 概览、隐患、培训、风险、事故统计 |
| 标签管理 | 2 | 标签列表、创建 |
| 权限认证 | 3 | 登录、刷新Token、用户信息 |

### 12.2 设计特点

1. **RESTful规范**: 标准的HTTP方法和资源路径
2. **统一响应**: 所有接口返回统一格式
3. **分页支持**: 列表接口支持分页查询
4. **权限控制**: 基于权限码的细粒度控制
5. **文件处理**: 支持文件上传、下载、版本管理
6. **AI集成**: 提供OCR、分类、风险识别等AI接口

---

**文档版本**: V2.0  
**生成日期**: 2026-07-18  
**设计范围**: REST API接口设计