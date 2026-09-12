# Sprint10-D-4-2-A HSE后端统一响应格式与字段转换规范冻结报告

**版本**: v1.0  
**日期**: 2026-07-24  
**状态**: 已冻结  
**适用范围**: HSE系统所有后端接口（风险管控、隐患治理、三违管理、人员管理、月度安全履职考核等模块）

---

## 一、任务概述

本次任务统一HSE系统后端响应格式和字段转换规范，解决以下问题：

1. 部分接口返回字段 snake_case 与 camelCase 混用
2. 部分模块未使用统一响应工具（`success`/`error`）
3. 分页格式不统一（部分接口缺少 `page`/`pageSize`）
4. 前端类型定义与后端响应不一致

---

## 二、统一响应格式规范（已冻结）

### 2.1 成功响应

```json
{
  "code": 0,
  "success": true,
  "message": "操作成功",
  "data": {}
}
```

### 2.2 错误响应

```json
{
  "code": -1,
  "success": false,
  "message": "操作失败",
  "data": null
}
```

### 2.3 基础工具

- **文件**: `server/middleware/response.js`
- **函数**:
  - `success(data, message)` — 构建成功响应
  - `error(code, message, data)` — 构建错误响应

---

## 三、统一字段转换规范（已冻结）

### 3.1 转换规则

| 方向 | 规则 | 示例 |
|------|------|------|
| 数据库 → 前端 | snake_case → camelCase | `assessment_year` → `assessmentYear` |
| 前端 → 数据库 | camelCase → snake_case | `pageSize` → `page_size` |

### 3.2 核心工具函数

- **文件**: `server/utils/commonResponse.js`

| 函数 | 用途 |
|------|------|
| `camelKeys(obj)` | 递归将对象所有 key 从 snake_case 转为 camelCase |
| `snakeKeys(obj)` | 递归将对象所有 key 从 camelCase 转为 snake_case |
| `toCamelCase(str)` | 单字符串转换 snake_case → camelCase |
| `toSnakeCase(str)` | 单字符串转换 camelCase → snake_case |
| `buildListResponse(res, list, total, page, pageSize, msg, options)` | 构建统一列表响应，支持 `{ camelCase: true }` |
| `buildDetailResponse(res, data, msg, options)` | 构建统一详情响应，支持 `{ camelCase: true }` |
| `paginateMemory(data, page, pageSize)` | 内存模式分页 |

### 3.3 强制约束

- **同一模块内禁止混合命名**：所有返回数据必须统一为 camelCase
- **列表接口**：必须通过 `buildListResponse` 输出，启用 `camelCase: true`
- **详情/创建/更新接口**：必须通过 `buildDetailResponse` 输出，启用 `camelCase: true`
- **简单对象/统计响应**：使用 `camelKeys()` 包裹后再通过 `success()` 输出

---

## 四、分页格式统一（已冻结）

### 4.1 标准分页响应

```json
{
  "code": 0,
  "success": true,
  "message": "查询成功",
  "data": {
    "list": [],
    "total": 0,
    "page": 1,
    "pageSize": 20
  }
}
```

### 4.2 约束

- 所有列表接口必须返回 `list`、`total`、`page`、`pageSize` 四个字段
- `pageSize` 必须为 camelCase（禁止 `page_size`）
- `page` 和 `pageSize` 必须为数字类型

---

## 五、各模块整改详情

### 5.1 月度安全履职考核模块

- **文件**: `server/routes/hse-assessment-monthly.js`
- **整改内容**:
  - 引入 `buildListResponse`、`buildDetailResponse`、`camelKeys`
  - 6个列表接口改用 `buildListResponse`（周期列表、考核对象、扣分明细、责任链、考核结果等）
  - 10个详情/创建/更新接口改用 `buildDetailResponse`
  - 9个非记录型响应用 `camelKeys` 包裹
  - 修复分页字段 `page_size` → `pageSize`
  - 所有数据字段统一转为 camelCase
- **验证结果**: 通过

### 5.2 风险管控模块（员工风险画像）

- **文件**: `server/routes/hse-risk-profile.js`
- **整改内容**:
  - 引入 `success`、`error`、`buildListResponse`、`buildDetailResponse`、`camelKeys`
  - 替换所有直接 `res.json({ code: 0, data: ... })` 为统一 `success()` 格式
  - 替换所有 `res.status(500).json({ code: 1, message: ... })` 为 `error()` 格式
  - 7个接口全部添加 `camelKeys` 字段转换
  - `risk_distribution` 重命名为 `riskDistribution`
- **验证结果**: 通过

### 5.3 三违管理模块

- **文件**: `server/routes/violations.js`
- **整改内容**:
  - 引入 `buildListResponse`、`buildDetailResponse`
  - 内存模式列表响应改用 `buildListResponse`
  - 数据库模式列表响应补充 `page`、`pageSize` 字段
  - 数据字段通过原有 `formatRow` + `camelKeys` 保持 camelCase
- **验证结果**: 通过

### 5.4 隐患治理模块

- **文件**: `server/routes/hazards.js`
- **整改内容**:
  - 该模块已正确使用 `camelKeys` 和 `buildListResponse`
  - 经检查无需修改，作为其他模块整改参考标杆
- **验证结果**: 通过（保持现状）

### 5.5 人员管理模块

- **文件**: `server/routes/hse-employee.js`
- **整改内容**:
  - 引入 `buildListResponse`、`buildDetailResponse`、`camelKeys`
  - 所有列表接口改用 `buildListResponse`
  - 所有详情/创建/更新接口改用 `buildDetailResponse`
  - 所有返回数据统一 `camelKeys` 转换
  - 内存降级模式同步处理
- **验证结果**: 通过

---

## 六、前端类型定义同步

### 6.1 修改内容

- **文件**: `src/types/api.ts`
- **修改**:
  - `ApiResponse` 接口添加 `success: boolean` 字段
  - 移除未使用的 `timestamp` 字段

```typescript
export interface ApiResponse<T = unknown> {
  code: number
  success: boolean   // 新增
  message: string
  data: T
}
```

### 6.2 分页类型（无需修改）

`PageResult<T>` 已正确包含 `list`、`total`、`page`、`pageSize`，与后端统一格式一致。

---

## 七、接口测试结果

### 7.1 测试环境

- 后端服务: `http://localhost:5666`
- 数据库: PostgreSQL 15
- 测试时间: 2026-07-24

### 7.2 测试用例与结果

| 模块 | 接口 | 测试项 | 结果 |
|------|------|--------|------|
| 考核 | `GET /api/hse/assessment-monthly/cycles` | 列表响应格式 + camelCase | 通过 |
| 考核 | `GET /api/hse/assessment-monthly/cycles/:id` | 详情响应格式 + camelCase | 通过 |
| 风险 | `GET /api/hse/risk-profile/list` | 列表响应格式 + camelCase + success字段 | 通过 |
| 风险 | `GET /api/hse/risk-profile/:id` | 详情响应格式 + camelCase | 通过 |
| 三违 | `GET /api/violations` | 列表响应格式 + camelCase + page/pageSize | 通过 |
| 三违 | `GET /api/violations/:id` | 详情响应格式 + camelCase | 通过 |
| 隐患 | `GET /api/hazards` | 列表响应格式 + camelCase | 通过 |
| 隐患 | `GET /api/hazards/:id` | 详情响应格式 + camelCase | 通过 |
| 人员 | `GET /api/hse/employee/employees` | 列表响应格式 + camelCase | 通过 |
| 人员 | `GET /api/hse/employee/employees/:id` | 详情响应格式 + camelCase | 通过 |

### 7.3 字段转换验证示例

**考核周期列表（整改后）**:
```json
{
  "code": 0,
  "success": true,
  "message": "查询成功",
  "data": {
    "list": [
      {
        "id": "9",
        "cycleCode": "HSE-CYCLE-202606",
        "cycleName": "2026年6月三违传导测试",
        "assessmentYear": 2026,
        "assessmentMonth": 6,
        "targetCount": 55,
        "scoredCount": 55,
        "createdByName": "管理员",
        "isDeleted": false,
        ...
      }
    ],
    "total": 4,
    "page": 1,
    "pageSize": 20
  }
}
```

---

## 八、冻结结论

### 8.1 已达成目标

1. 所有HSE接口响应格式统一为 `{ code, success, message, data }`
2. 所有返回数据数据库 snake_case 字段已自动转换为 camelCase
3. 分页格式统一为 `{ list, total, page, pageSize }`
4. 前端 `ApiResponse` 类型定义已与后端响应一致
5. 5个重点模块（考核、风险、隐患、三违、人员）全部验证通过

### 8.2 后续模块开发标准

后续风险模块、隐患模块、人员模块等新接口开发必须遵循以下标准：

1. **列表接口**: 使用 `buildListResponse(res, list, total, page, pageSize, '查询成功', { camelCase: true })`
2. **详情接口**: 使用 `buildDetailResponse(res, data, '查询成功', { camelCase: true })`
3. **简单响应**: 使用 `res.json(success(camelKeys(data), '操作成功'))`
4. **错误响应**: 使用 `res.json(error(code, '错误信息'))`
5. **禁止**: 直接 `res.json({ code: 0, data: ... })` 或混合命名风格

### 8.3 参考文件

| 文件 | 说明 |
|------|------|
| `server/middleware/response.js` | 基础响应格式定义 |
| `server/utils/commonResponse.js` | 字段转换与响应构建工具 |
| `server/routes/hazards.js` | 整改标杆（已正确使用工具） |
| `src/types/api.ts` | 前端API类型定义 |

---

## 九、签核

| 角色 | 签核状态 |
|------|----------|
| 后端规范 | 已冻结 |
| 前端类型定义 | 已同步 |
| 接口测试 | 已通过 |
| 作为后续开发标准 | 生效 |

---

**备注**: 本报告作为后续风险模块、隐患模块、人员模块统一开发的唯一标准依据。
