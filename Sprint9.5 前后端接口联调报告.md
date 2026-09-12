# Sprint9.5 前后端接口联调报告

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint9.5
> 关联文档：
> - 《Sprint9.5 PC端系统架构设计报告》
> - 《Sprint9.5 数据库初始化报告》

---

## 一、概述

### 1.1 报告目的

本报告定义 HSE 智能运营平台前后端接口的统一规范和详细设计，作为前后端联调的依据，确保接口的一致性、稳定性和可维护性。

### 1.2 适用范围

| 模块 | 说明 | 优先级 |
|------|------|--------|
| 认证权限接口 | 登录、用户信息、菜单 | P0 |
| 员工风险接口 | 员工档案、风险计算、画像 | P0 |
| 预警整改接口 | 预警生成、整改处理 | P0 |
| 考核展示接口 | 评分、排名、驾驶舱 | P0 |
| AI 接口预留 | 风险分析、整改建议 | P1 |

### 1.3 接口规范

#### 1.3.1 URL 规范

| 规则 | 说明 | 示例 |
|------|------|------|
| 前缀 | `/api` 开头 | `/api/auth/login` |
| 模块 | 小写英文 | `/api/employee` |
| 资源 | 小写英文 | `/api/employee/list` |
| 层级 | 用 `/` 分隔 | `/api/employee/{id}` |
| 操作 | GET 查询、POST 创建、PUT 更新、DELETE 删除 | - |

#### 1.3.2 响应规范

##### 统一响应结构

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

##### 响应码定义

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 资源冲突 |
| 500 | 服务器错误 |

##### 分页响应结构

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "total": 100,
    "page": 1,
    "pageSize": 10,
    "list": [ ... ]
  }
}
```

#### 1.3.3 请求规范

| 规则 | 说明 |
|------|------|
| Content-Type | `application/json` |
| 认证方式 | `Authorization: Bearer {token}` |
| 时间格式 | ISO 8601：`2026-07-15T14:30:00` |
| 数字格式 | 整数不带引号，小数最多 2 位 |

#### 1.3.4 异常处理

##### 错误响应结构

```json
{
  "code": 400,
  "message": "参数错误",
  "data": null,
  "errors": [
    {
      "field": "username",
      "message": "用户名不能为空"
    }
  ]
}
```

##### 业务异常码

| 错误码 | 说明 |
|--------|------|
| 1001 | 用户不存在 |
| 1002 | 密码错误 |
| 1003 | 用户已禁用 |
| 2001 | 员工不存在 |
| 2002 | 员工档案已存在 |
| 2003 | 风险计算失败 |
| 3001 | 预警不存在 |
| 3002 | 预警状态不允许操作 |
| 4001 | 整改任务不存在 |
| 4002 | 整改任务已完成 |
| 5001 | 考核指标不存在 |
| 6001 | AI 分析服务暂不可用 |

---

## 二、认证权限接口

### 2.1 登录接口

#### POST /api/auth/login

**说明**：用户登录，返回 Token

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名 |
| password | string | 是 | 密码 |
| captcha | string | 否 | 验证码 |

**请求示例**：
```json
{
  "username": "admin",
  "password": "123456"
}
```

**响应数据**：
```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "expiresIn": 86400
  }
}
```

### 2.2 获取用户信息

#### GET /api/auth/user-info

**说明**：获取当前登录用户的详细信息

**请求头**：
```
Authorization: Bearer {token}
```

**响应数据**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "userId": 1,
    "username": "admin",
    "realName": "系统管理员",
    "avatar": null,
    "roles": ["admin"],
    "permissions": [
      "employee:view",
      "employee:create",
      "risk:calculate",
      "warning:handle",
      "rectify:create",
      "assessment:view",
      "cockpit:view"
    ],
    "menus": [
      {
        "id": 1,
        "title": "工作台",
        "icon": "home",
        "path": "/dashboard"
      },
      {
        "id": 2,
        "title": "员工风险",
        "icon": "user",
        "path": "/risk",
        "children": [
          {
            "id": 21,
            "title": "员工档案",
            "path": "/risk/employee"
          },
          {
            "id": 22,
            "title": "风险画像",
            "path": "/risk/profile"
          }
        ]
      },
      {
        "id": 3,
        "title": "预警管理",
        "icon": "alert",
        "path": "/warning"
      },
      {
        "id": 4,
        "title": "整改管理",
        "icon": "repair",
        "path": "/rectify"
      },
      {
        "id": 5,
        "title": "考核驾驶舱",
        "icon": "dashboard",
        "path": "/assessment"
      }
    ]
  }
}
```

### 2.3 退出登录

#### POST /api/auth/logout

**说明**：退出登录，注销 Token

**响应数据**：
```json
{
  "code": 200,
  "message": "退出成功",
  "data": null
}
```

---

## 三、员工风险接口

### 3.1 员工档案

#### GET /api/employee/list

**说明**：查询员工列表

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码，默认 1 |
| pageSize | integer | 否 | 每页数量，默认 10 |
| keyword | string | 否 | 搜索关键词（姓名/工号） |
| orgId | long | 否 | 组织ID |
| riskLevel | string | 否 | 风险等级（LOW/MEDIUM/HIGH/CRITICAL） |
| status | integer | 否 | 状态（0-离职/1-在职） |

**请求示例**：
```
GET /api/employee/list?page=1&pageSize=10&keyword=张&riskLevel=HIGH
```

**响应数据**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "total": 500,
    "page": 1,
    "pageSize": 10,
    "list": [
      {
        "id": 1001,
        "employeeCode": "EMP20260001",
        "name": "张三",
        "phone": "138****1234",
        "orgId": 100,
        "orgName": "北京分公司-运营一部",
        "positionId": 200,
        "positionName": "项目经理",
        "riskScore": 72.50,
        "riskLevel": "HIGH",
        "riskLevelName": "高风险",
        "lastRiskCalcAt": "2026-07-15T10:30:00",
        "status": 1,
        "createdAt": "2026-01-15T09:00:00"
      }
    ]
  }
}
```

#### GET /api/employee/{id}

**说明**：查询员工详情

**路径参数**：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | long | 员工ID |

**响应数据**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1001,
    "employeeCode": "EMP20260001",
    "name": "张三",
    "idCard": "110***********1234",
    "phone": "138****1234",
    "orgId": 100,
    "orgName": "北京分公司-运营一部",
    "positionId": 200,
    "positionName": "项目经理",
    "status": 1,
    "createdAt": "2026-01-15T09:00:00",
    "updatedAt": "2026-07-15T10:30:00"
  }
}
```

#### POST /api/employee

**说明**：新增员工

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| employeeCode | string | 是 | 员工工号（唯一） |
| name | string | 是 | 姓名 |
| idCard | string | 否 | 身份证号 |
| phone | string | 否 | 手机号 |
| orgId | long | 是 | 组织ID |
| positionId | long | 是 | 岗位ID |

**请求示例**：
```json
{
  "employeeCode": "EMP20260002",
  "name": "李四",
  "idCard": "110101199001011234",
  "phone": "13900005678",
  "orgId": 100,
  "positionId": 200
}
```

**响应数据**：
```json
{
  "code": 201,
  "message": "创建成功",
  "data": {
    "id": 1002,
    "employeeCode": "EMP20260002"
  }
}
```

#### PUT /api/employee/{id}

**说明**：更新员工信息

**请求参数**：同新增接口

**响应数据**：
```json
{
  "code": 200,
  "message": "更新成功",
  "data": null
}
```

#### DELETE /api/employee/{id}

**说明**：删除员工（软删除）

**响应数据**：
```json
{
  "code": 200,
  "message": "删除成功",
  "data": null
}
```

#### POST /api/employee/import

**说明**：Excel 批量导入员工

**请求格式**：`multipart/form-data`

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | file | 是 | Excel 文件 |

**响应数据**：
```json
{
  "code": 200,
  "message": "导入完成",
  "data": {
    "total": 100,
    "success": 95,
    "failed": 5,
    "failedItems": [
      {
        "row": 10,
        "employeeCode": "EMP00000010",
        "reason": "员工工号已存在"
      }
    ]
  }
}
```

#### GET /api/employee/import/template

**说明**：下载导入模板

**响应**：Excel 文件流

### 3.2 风险计算

#### POST /api/risk/calculate/{employeeId}

**说明**：计算单个员工的风险评分

**路径参数**：
| 字段 | 类型 | 说明 |
|------|------|------|
| employeeId | long | 员工ID |

**响应数据**：
```json
{
  "code": 200,
  "message": "计算成功",
  "data": {
    "employeeId": 1001,
    "employeeName": "张三",
    "riskScore": 72.50,
    "riskLevel": "HIGH",
    "riskLevelName": "高风险",
    "riskFactors": {
      "attendance": 85.00,
      "violation": 60.00,
      "training": 70.00,
      "performance": 80.00,
      "other": 75.00
    },
    "calculatedAt": "2026-07-15T14:30:00"
  }
}
```

#### POST /api/risk/calculate/batch

**说明**：批量计算员工风险

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| employeeIds | long[] | 否 | 员工ID列表（空则计算全部） |

**请求示例**：
```json
{
  "employeeIds": [1001, 1002, 1003]
}
```

**响应数据**：
```json
{
  "code": 200,
  "message": "批量计算完成",
  "data": {
    "total": 3,
    "success": 3,
    "failed": 0
  }
}
```

### 3.3 风险画像

#### GET /api/risk/profile/{employeeId}

**说明**：查询员工风险画像

**响应数据**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "employeeId": 1001,
    "employeeCode": "EMP20260001",
    "employeeName": "张三",
    "orgName": "北京分公司-运营一部",
    "positionName": "项目经理",
    "riskScore": 72.50,
    "riskLevel": "HIGH",
    "riskLevelName": "高风险",
    "riskFactors": {
      "attendance": {
        "score": 85.00,
        "weight": 0.30,
        "weightedScore": 25.50,
        "description": "出勤率 92%，良好"
      },
      "violation": {
        "score": 60.00,
        "weight": 0.25,
        "weightedScore": 15.00,
        "description": "近3个月违章2次"
      },
      "training": {
        "score": 70.00,
        "weight": 0.20,
        "weightedScore": 14.00,
        "description": "培训完成率 80%"
      },
      "performance": {
        "score": 80.00,
        "weight": 0.15,
        "weightedScore": 12.00,
        "description": "绩效良好"
      },
      "other": {
        "score": 75.00,
        "weight": 0.10,
        "weightedScore": 7.50,
        "description": "其他因素正常"
      }
    },
    "riskHistory": [
      {
        "date": "2026-07",
        "score": 72.50,
        "level": "HIGH"
      },
      {
        "date": "2026-06",
        "score": 65.00,
        "level": "MEDIUM"
      },
      {
        "date": "2026-05",
        "score": 58.00,
        "level": "MEDIUM"
      }
    ],
    "calculatedAt": "2026-07-15T14:30:00"
  }
}
```

#### GET /api/ranking

**说明**：员工风险排名

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | 排名类型（riskScore/countermeasure） |
| orgId | long | 否 | 组织ID |
| topN | integer | 否 | TOP N，默认 10 |

**响应数据**：
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "rank": 1,
      "employeeId": 1005,
      "employeeName": "赵六",
      "orgName": "上海分公司",
      "value": 85.00
    },
    {
      "rank": 2,
      "employeeId": 1001,
      "employeeName": "张三",
      "orgName": "北京分公司",
      "value": 72.50
    }
  ]
}
```

---

## 四、预警整改接口

### 4.1 预警管理

#### GET /api/warning/list

**说明**：查询预警列表

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码 |
| pageSize | integer | 否 | 每页数量 |
| warningLevel | string | 否 | 预警等级 |
| status | string | 否 | 状态（PENDING/PROCESSING/RESOLVED/ESCALATED） |
| employeeId | long | 否 | 员工ID |
| startDate | string | 否 | 开始日期 |
| endDate | string | 否 | 结束日期 |

**请求示例**：
```
GET /api/warning/list?page=1&pageSize=10&warningLevel=HIGH&status=PENDING
```

**响应数据**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "total": 50,
    "list": [
      {
        "id": 1,
        "warningCode": "WRN20260001",
        "warningType": "RISK_SCORE",
        "warningLevel": "HIGH",
        "warningLevelName": "高",
        "title": "员工风险评分异常",
        "description": "员工张三风险评分为 72.50，超过阈值",
        "employeeId": 1001,
        "employeeName": "张三",
        "employeeOrgName": "北京分公司-运营一部",
        "status": "PENDING",
        "statusName": "待处理",
        "deadline": "2026-07-16T14:30:00",
        "createdAt": "2026-07-15T14:30:00"
      }
    ]
  }
}
```

#### GET /api/warning/{id}

**说明**：查询预警详情

**响应数据**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "warningCode": "WRN20260001",
    "warningType": "RISK_SCORE",
    "warningLevel": "HIGH",
    "title": "员工风险评分异常",
    "description": "员工张三风险评分为 72.50，超过高风险阈值 60",
    "employeeInfo": {
      "id": 1001,
      "name": "张三",
      "employeeCode": "EMP20260001",
      "orgName": "北京分公司-运营一部",
      "positionName": "项目经理",
      "riskScore": 72.50,
      "riskLevel": "HIGH"
    },
    "status": "PENDING",
    "deadline": "2026-07-16T14:30:00",
    "handler": null,
    "createdAt": "2026-07-15T14:30:00",
    "statusHistory": []
  }
}
```

#### POST /api/warning/generate

**说明**：根据风险数据自动生成预警

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| employeeId | long | 否 | 指定员工ID（空则批量生成） |

**响应数据**：
```json
{
  "code": 200,
  "message": "预警生成完成",
  "data": {
    "generatedCount": 5,
    "warnings": [
      {
        "warningId": 10,
        "warningCode": "WRN20260010",
        "employeeId": 1001,
        "employeeName": "张三",
        "warningLevel": "HIGH"
      }
    ]
  }
}
```

#### POST /api/warning/{id}/process

**说明**：处理预警（接受/忽略/升级）

**路径参数**：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | long | 预警ID |

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | 操作（ACCEPT/IGNORE/ESCALATE） |
| remark | string | 否 | 处理备注 |
| handlerId | long | 否 | 处理人ID（接受时必填） |

**请求示例**：
```json
{
  "action": "ACCEPT",
  "remark": "已确认，指派给安全经理处理",
  "handlerId": 50
}
```

**响应数据**：
```json
{
  "code": 200,
  "message": "处理成功",
  "data": {
    "id": 1,
    "status": "PROCESSING",
    "statusName": "处理中",
    "handler": {
      "id": 50,
      "name": "安全经理"
    }
  }
}
```

#### POST /api/warning/{id}/create-rectify

**说明**：从预警创建整改任务

**路径参数**：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | long | 预警ID |

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| requirement | string | 是 | 整改要求 |
| handlerId | long | 是 | 整改责任人ID |
| deadline | string | 是 | 整改截止时间 |

**请求示例**：
```json
{
  "requirement": "加强员工安全教育培训，重点关注违章操作行为",
  "handlerId": 60,
  "deadline": "2026-07-20T23:59:59"
}
```

**响应数据**：
```json
{
  "code": 201,
  "message": "整改任务创建成功",
  "data": {
    "rectifyId": 1,
    "rectifyCode": "REC20260001",
    "warningId": 1,
    "warningCode": "WRN20260001"
  }
}
```

### 4.2 整改管理

#### GET /api/rectify/list

**说明**：查询整改任务列表

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码 |
| pageSize | integer | 否 | 每页数量 |
| status | string | 否 | 状态（PENDING/PROCESSING/COMPLETED/CLOSED） |
| handlerId | long | 否 | 处理人ID |
| employeeId | long | 否 | 员工ID |

**响应数据**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "total": 20,
    "list": [
      {
        "id": 1,
        "rectifyCode": "REC20260001",
        "warningId": 1,
        "warningCode": "WRN20260001",
        "employeeId": 1001,
        "employeeName": "张三",
        "handlerId": 60,
        "handlerName": "李四",
        "requirement": "加强员工安全教育培训",
        "status": "PROCESSING",
        "statusName": "处理中",
        "deadline": "2026-07-20T23:59:59",
        "completedAt": null,
        "effectScore": null,
        "createdAt": "2026-07-15T15:00:00"
      }
    ]
  }
}
```

#### GET /api/rectify/{id}

**说明**：查询整改任务详情

**响应数据**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "rectifyCode": "REC20260001",
    "warningInfo": {
      "id": 1,
      "code": "WRN20260001",
      "title": "员工风险评分异常",
      "level": "HIGH"
    },
    "employeeInfo": {
      "id": 1001,
      "name": "张三",
      "orgName": "北京分公司-运营一部"
    },
    "handlerInfo": {
      "id": 60,
      "name": "李四",
      "role": "安全经理"
    },
    "requirement": "加强员工安全教育培训，重点关注违章操作行为",
    "status": "PROCESSING",
    "deadline": "2026-07-20T23:59:59",
    "statusHistory": [
      {
        "status": "PENDING",
        "action": "创建任务",
        "time": "2026-07-15T15:00:00",
        "operator": "系统"
      },
      {
        "status": "PROCESSING",
        "action": "接受任务",
        "time": "2026-07-15T16:00:00",
        "operator": "李四"
      }
    ]
  }
}
```

#### POST /api/rectify/{id}/accept

**说明**：接受整改任务

**响应数据**：
```json
{
  "code": 200,
  "message": "接受成功",
  "data": {
    "id": 1,
    "status": "PROCESSING"
  }
}
```

#### POST /api/rectify/{id}/complete

**说明**：完成整改任务

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| result | string | 是 | 整改结果描述 |
| effectScore | decimal | 否 | 效果评分（0-100） |

**请求示例**：
```json
{
  "result": "已完成安全教育培训，员工考核合格",
  "effectScore": 85.00
}
```

**响应数据**：
```json
{
  "code": 200,
  "message": "完成成功",
  "data": {
    "id": 1,
    "status": "COMPLETED",
    "effectScore": 85.00,
    "completedAt": "2026-07-18T10:30:00"
  }
}
```

#### POST /api/rectify/{id}/close

**说明**：关闭整改任务

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| reason | string | 否 | 关闭原因 |

**响应数据**：
```json
{
  "code": 200,
  "message": "关闭成功",
  "data": {
    "id": 1,
    "status": "CLOSED",
    "closedAt": "2026-07-19T09:00:00"
  }
}
```

---

## 五、考核驾驶舱接口

### 5.1 考核指标评分

#### GET /api/assessment/score

**说明**：查询考核评分

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| period | string | 否 | 周期（month/quarter/year） |
| orgId | long | 否 | 组织ID |

**响应数据**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "period": "month",
    "periodLabel": "2026年7月",
    "orgId": 100,
    "orgName": "北京分公司",
    "totalScore": 82.50,
    "totalLevel": "GOOD",
    "items": [
      {
        "itemId": 1,
        "itemName": "员工风险控制",
        "weight": 0.30,
        "score": 85.00,
        "weightedScore": 25.50
      },
      {
        "itemId": 2,
        "itemName": "预警及时响应",
        "weight": 0.25,
        "score": 80.00,
        "weightedScore": 20.00
      },
      {
        "itemId": 3,
        "itemName": "整改完成率",
        "weight": 0.25,
        "score": 90.00,
        "weightedScore": 22.50
      },
      {
        "itemId": 4,
        "itemName": "安全培训",
        "weight": 0.20,
        "score": 75.00,
        "weightedScore": 15.00
      }
    ]
  }
}
```

#### POST /api/assessment/calculate

**说明**：触发考核评分计算

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| period | string | 是 | 周期 |
| orgId | long | 否 | 组织ID（空则全部） |

**响应数据**：
```json
{
  "code": 200,
  "message": "计算完成",
  "data": {
    "calculatedCount": 10,
    "period": "month"
  }
}
```

### 5.2 考核排名

#### GET /api/assessment/ranking

**说明**：查询考核排名

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| period | string | 否 | 周期 |
| type | string | 否 | 排名类型（ORG/EMPLOYEE） |
| topN | integer | 否 | TOP N |

**响应数据**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "period": "month",
    "type": "ORG",
    "rankings": [
      {
        "rank": 1,
        "orgId": 100,
        "orgName": "北京分公司",
        "score": 88.50,
        "level": "EXCELLENT"
      },
      {
        "rank": 2,
        "orgId": 101,
        "orgName": "上海分公司",
        "score": 85.00,
        "level": "GOOD"
      }
    ]
  }
}
```

### 5.3 驾驶舱数据

#### GET /api/cockpit/overview

**说明**：查询驾驶舱概览数据

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| period | string | 否 | 周期 |
| orgId | long | 否 | 组织ID |

**响应数据**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "orgInfo": {
      "orgId": 100,
      "orgName": "北京分公司",
      "orgLevel": "BRANCH"
    },
    "risk": {
      "totalEmployees": 200,
      "highRiskCount": 15,
      "highRiskRate": 7.5,
      "riskDistribution": {
        "LOW": 150,
        "MEDIUM": 35,
        "HIGH": 12,
        "CRITICAL": 3
      }
    },
    "warning": {
      "pendingCount": 5,
      "processingCount": 3,
      "resolvedCount": 20,
      "overdueCount": 1
    },
    "rectify": {
      "pendingCount": 3,
      "processingCount": 5,
      "completedCount": 15,
      "completionRate": 83.3,
      "avgDuration": 2.5
    },
    "assessment": {
      "totalScore": 82.50,
      "rank": 5,
      "totalOrgs": 10
    },
    "trend": {
      "dates": ["07-01", "07-02", "07-03", "07-04", "07-05"],
      "riskScores": [65, 68, 70, 72, 72.5],
      "warningCounts": [2, 3, 1, 4, 2]
    }
  }
}
```

#### GET /api/cockpit/risk-trend

**说明**：查询风险趋势

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| startDate | string | 否 | 开始日期 |
| endDate | string | 否 | 结束日期 |
| orgId | long | 否 | 组织ID |

**响应数据**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "dates": ["07-01", "07-02", "07-03", "07-04", "07-05", "07-06", "07-07"],
    "avgRiskScores": [65.0, 68.0, 70.0, 72.0, 72.5, 70.0, 68.5],
    "highRiskCounts": [10, 12, 15, 14, 15, 12, 11],
    "targetLine": 60.0
  }
}
```

---

## 六、AI 接口预留

### 6.1 AI 风险分析

#### POST /api/ai/risk-analysis

**说明**：AI 风险分析（接口预留，待模型接入）

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| employeeId | long | 是 | 员工ID |
| context | object | 否 | 上下文信息 |

**请求示例**：
```json
{
  "employeeId": 1001,
  "context": {
    "recentWarnings": 5,
    "recentViolations": 2
  }
}
```

**响应数据**：
```json
{
  "code": 200,
  "message": "AI 分析完成",
  "data": {
    "analysisType": "RISK_ANALYSIS",
    "targetId": 1001,
    "targetType": "EMPLOYEE",
    "suggestion": "员工风险评分较高，建议加强安全教育培训，关注违章操作行为",
    "riskLevel": "HIGH",
    "keyFactors": ["近期违章2次", "培训完成率偏低"],
    "confidence": 0.85,
    "analyzedAt": "2026-07-15T14:30:00",
    "modelVersion": "RESERVED_V1"
  }
}
```

### 6.2 AI 整改建议

#### POST /api/ai/rectify-suggestion

**说明**：AI 整改建议（接口预留，待模型接入）

**请求参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| warningId | long | 是 | 预警ID |
| employeeId | long | 是 | 员工ID |

**响应数据**：
```json
{
  "code": 200,
  "message": "AI 建议生成完成",
  "data": {
    "suggestionType": "RECTIFY",
    "warningId": 1,
    "employeeId": 1001,
    "suggestions": [
      {
        "title": "加强安全教育培训",
        "content": "针对员工违章操作行为，安排专项安全教育培训",
        "priority": "HIGH"
      },
      {
        "title": "建立行为监督机制",
        "content": "建立员工安全行为监督和奖惩机制",
        "priority": "MEDIUM"
      }
    ],
    "confidence": 0.90,
    "generatedAt": "2026-07-15T14:30:00",
    "modelVersion": "RESERVED_V1"
  }
}
```

### 6.3 AI 接口状态

#### GET /api/ai/status

**说明**：查询 AI 接口状态

**响应数据**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "available": false,
    "reason": "AI 模型暂未接入",
    "reserved": true,
    "modelVersion": "RESERVED_V1",
    "plannedDate": "2026-Q4"
  }
}
```

---

## 七、联调测试

### 7.1 测试环境

| 环境 | 地址 | 说明 |
|------|------|------|
| 后端 API | http://localhost:8080/api | Spring Boot 服务 |
| 前端应用 | http://localhost:5173 | Vite Dev Server |
| 数据库 | localhost:3306 | MySQL |

### 7.2 联调流程

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│ 前端开发 │ →  │ 接口联调 │ →  │ 功能验证 │
│ Mock数据 │    │ 真实接口 │    │ 业务闭环 │
└──────────┘    └──────────┘    └──────────┘
      │
      ↓
┌──────────┐    ┌──────────┐    ┌──────────┐
│ 发现问题 │ →  │ 修复问题 │ →  │ 回归测试 │
│ 记录缺陷 │    │ 提交修复 │    │ 验收通过 │
└──────────┘    └──────────┘    └──────────┘
```

### 7.3 测试清单

| 序号 | 测试场景 | 接口 | 优先级 | 状态 |
|------|----------|------|--------|------|
| 1 | 登录成功 | POST /api/auth/login | P0 | 待测试 |
| 2 | 获取用户信息 | GET /api/auth/user-info | P0 | 待测试 |
| 3 | 员工列表查询 | GET /api/employee/list | P0 | 待测试 |
| 4 | 员工新增 | POST /api/employee | P0 | 待测试 |
| 5 | 员工详情查询 | GET /api/employee/{id} | P0 | 待测试 |
| 6 | 员工更新 | PUT /api/employee/{id} | P0 | 待测试 |
| 7 | 员工删除 | DELETE /api/employee/{id} | P0 | 待测试 |
| 8 | Excel 导入 | POST /api/employee/import | P0 | 待测试 |
| 9 | 单个风险计算 | POST /api/risk/calculate/{id} | P0 | 待测试 |
| 10 | 批量风险计算 | POST /api/risk/calculate/batch | P0 | 待测试 |
| 11 | 风险画像查询 | GET /api/risk/profile/{id} | P0 | 待测试 |
| 12 | 员工风险排名 | GET /api/ranking | P0 | 待测试 |
| 13 | 预警列表查询 | GET /api/warning/list | P0 | 待测试 |
| 14 | 预警详情查询 | GET /api/warning/{id} | P0 | 待测试 |
| 15 | 自动生成预警 | POST /api/warning/generate | P0 | 待测试 |
| 16 | 处理预警 | POST /api/warning/{id}/process | P0 | 待测试 |
| 17 | 创建整改任务 | POST /api/warning/{id}/create-rectify | P0 | 待测试 |
| 18 | 整改任务列表 | GET /api/rectify/list | P0 | 待测试 |
| 19 | 接受整改任务 | POST /api/rectify/{id}/accept | P0 | 待测试 |
| 20 | 完成整改任务 | POST /api/rectify/{id}/complete | P0 | 待测试 |
| 21 | 关闭整改任务 | POST /api/rectify/{id}/close | P0 | 待测试 |
| 22 | 考核评分查询 | GET /api/assessment/score | P0 | 待测试 |
| 23 | 考核排名查询 | GET /api/assessment/ranking | P0 | 待测试 |
| 24 | 驾驶舱概览 | GET /api/cockpit/overview | P0 | 待测试 |
| 25 | 风险趋势 | GET /api/cockpit/risk-trend | P0 | 待测试 |
| 26 | AI 风险分析 | POST /api/ai/risk-analysis | P1 | 待测试 |
| 27 | AI 整改建议 | POST /api/ai/rectify-suggestion | P1 | 待测试 |

### 7.4 联调进度

| 模块 | 接口数 | 已完成 | 进行中 | 待开发 |
|------|--------|--------|--------|--------|
| 认证权限 | 3 | 0 | 0 | 3 |
| 员工风险 | 9 | 0 | 0 | 9 |
| 预警整改 | 10 | 0 | 0 | 10 |
| 考核驾驶舱 | 5 | 0 | 0 | 5 |
| AI 预留 | 3 | 0 | 0 | 3 |
| **合计** | **30** | **0** | **0** | **30** |

---

## 八、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | Sprint9.5 接口联调初始版本 |