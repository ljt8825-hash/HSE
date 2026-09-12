# 员工风险画像基础 API 接口文档

## 接口名称

员工基础画像查询

## 请求方法

`GET`

## URL

```
/api/hse/risk-profile/employee/{employeeId}
```

## 路径参数

| 参数名     | 类型    | 是否必填 | 说明     |
| ---------- | ------- | -------- | -------- |
| employeeId | Integer | 是       | 员工 ID  |

## 请求示例

```http
GET /api/hse/risk-profile/employee/3866
```

## 响应格式

统一 JSON 结构：

```json
{
  "code": 0,
  "data": {},
  "message": "success"
}
```

## data 结构

| 字段名          | 类型   | 说明             |
| --------------- | ------ | ---------------- |
| employee        | Object | 员工基础信息     |
| organization    | Object | 所属组织信息     |
| operationUnit   | Object | 作业单元信息     |
| position        | Object | 岗位信息         |
| responsibility  | Object | 责任信息         |

### employee 对象

| 字段名       | 类型    | 说明     |
| ------------ | ------- | -------- |
| id           | Integer | 员工 ID  |
| employee_code| String  | 工号     |
| name         | String  | 姓名     |
| gender       | String  | 性别     |
| phone        | String  | 手机号   |
| id_card      | String  | 身份证   |
| birth_date   | String  | 出生日期 |
| person_type  | String  | 人员类型 |

### organization 对象

| 字段名    | 类型    | 说明       |
| --------- | ------- | ---------- |
| id        | Integer | 组织 ID    |
| org_name  | String  | 组织名称   |
| org_type  | String  | 组织类型   |
| org_code  | String  | 组织编码   |
| org_path  | String  | 组织路径   |
| status    | String  | 状态       |

### operationUnit 对象

| 字段名     | 类型    | 说明           |
| ---------- | ------- | -------------- |
| id         | Integer | 作业单元 ID    |
| unit_name  | String  | 作业单元名称   |
| unit_type  | String  | 作业单元类型   |
| unit_code  | String  | 作业单元编码   |

### position 对象

| 字段名 | 类型    | 说明       |
| ------ | ------- | ---------- |
| id     | Integer | 岗位 ID    |
| name   | String  | 岗位名称   |
| alias  | String  | 岗位别名   |

### responsibility 对象规则

- **`grid_leader`**：

```json
{
  "responsibility_type": "grid_leader",
  "grid_level": "三级网格",
  "grid_role": "网格长",
  "inspection_frequency": "每周一次"
}
```

- **`production_manager`**：

```json
{
  "responsibility_type": "production_manager"
}
```

> 不包含 `grid_level`、`grid_role`、`inspection_frequency`。

- **`none`**：`null`

## 错误响应

| HTTP 状态码 | 错误码 | 说明             |
| ----------- | ------ | ---------------- |
| 400         | 1      | employeeId 参数错误 |
| 404         | 1      | 员工不存在       |
| 500         | 1      | 服务器错误       |

错误响应示例：

```json
{
  "code": 1,
  "data": null,
  "message": "员工不存在"
}
```

## 实际响应示例

### 示例 1：张万恒（grid_leader）

```json
{
  "code": 0,
  "data": {
    "employee": {
      "id": 3866,
      "employee_code": "",
      "name": "张万恒",
      "gender": "男",
      "phone": "",
      "id_card": "",
      "birth_date": "",
      "person_type": ""
    },
    "organization": {
      "id": 1,
      "org_name": "",
      "org_type": "",
      "org_code": "",
      "org_path": "",
      "status": "active"
    },
    "operationUnit": {
      "id": 1,
      "unit_name": "",
      "unit_type": "",
      "unit_code": ""
    },
    "position": {
      "id": 1,
      "name": "",
      "alias": ""
    },
    "responsibility": {
      "responsibility_type": "grid_leader",
      "grid_level": "三级网格",
      "grid_role": "网格长",
      "inspection_frequency": "每周一次"
    }
  },
  "message": "success"
}
```

### 示例 2：验证_城区东片片区长（production_manager）

```json
{
  "code": 0,
  "data": {
    "employee": {
      "id": 5360,
      "employee_code": "",
      "name": "验证_城区东片片区长",
      "gender": "",
      "phone": "",
      "id_card": "",
      "birth_date": "",
      "person_type": ""
    },
    "organization": {
      "id": 1,
      "org_name": "",
      "org_type": "",
      "org_code": "",
      "org_path": "",
      "status": "active"
    },
    "operationUnit": {
      "id": 1,
      "unit_name": "",
      "unit_type": "",
      "unit_code": ""
    },
    "position": {
      "id": 1,
      "name": "",
      "alias": ""
    },
    "responsibility": {
      "responsibility_type": "production_manager"
    }
  },
  "message": "success"
}
```
