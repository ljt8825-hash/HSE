# HSE系统API开发规范

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | HSE系统API开发规范 |
| 版本 | v1.0 |
| 后端技术栈 | Node.js + Express + PostgreSQL 15 |
| 前端技术栈 | Vue 3 + TypeScript + Axios |
| 生效日期 | 2026-07-24 |

---

## 一、接口路径规范

### 1.1 基础路径

所有业务接口统一使用以下基础路径格式：

```
/api/hse/{module}/{resource}
```

- `/api`：API 统一前缀，用于 Nginx 反向代理和中间件过滤
- `/hse`：HSE 业务系统标识，区分其他业务系统
- `{module}`：业务模块名，小写，多单词用连字符 `-` 分隔
- `{resource}`：资源名，小写复数形式

**示例：**
```
/api/hse/hazard/hazards
/api/hse/risk/risks
/api/hse/personnel/employees
```

### 1.2 模块划分

HSE 系统按业务领域划分为以下一级模块：

| 模块标识 | 模块名称 | 说明 |
|----------|----------|------|
| `overview` | 安全总览 | 驾驶舱、统计看板、预警通知、报告中心 |
| `risk` | 风险管控 | 风险分级、人员风险画像、驾驶员风险、事故分析、AI 风险分析 |
| `hazard` | 隐患治理 | 隐患排查、整改闭环、预警中心、隐患统计 |
| `site` | 现场管理 | 三违管理、网格管理、消防器材、车辆管理、现场巡查 |
| `personnel` | 人员管理 | 员工花名册、组织架构、岗位责任、保险管理、超龄人员 |
| `training` | 培训考核 | 培训计划、培训需求、培训台账、专项培训、考核评估 |
| `emergency` | 应急管理 | 应急预案、应急演练、应急资源 |
| `objectives` | 目标职责 | 目标责任书、安全机构、安委会会议、预算管理 |
| `standards` | 制度标准 | 规章制度、文档管理、制度条款、制度关联、对标评估 |
| `system` | 系统管理 | 用户管理、角色权限、审计日志、工作流、批量导入 |

### 1.3 资源命名

- 资源名统一使用**复数形式**
- 多单词使用小写连字符（kebab-case）
- 避免使用缩写，保持语义清晰

**正确示例：**
```
/api/hse/hazard/hazards          # 隐患列表
/api/hse/personnel/employees     # 员工列表
/api/hse/training/trainings      # 培训记录
/api/hse/emergency/emergency-plans  # 应急预案
```

**错误示例：**
```
/api/hse/hazard/hazard       # 单数，错误
/api/hse/personnel/empList   # 缩写+驼峰，错误
/api/hse/training/training   # 单数，错误
```

### 1.4 操作命名

标准 CRUD 操作遵循 RESTful 风格：

| 操作 | 请求方式 | 路径格式 | 说明 |
|------|----------|----------|------|
| 列表查询 | GET | `/{resource}` | 分页列表查询（默认列表接口） |
| 详情查询 | GET | `/{resource}/:id` | 根据 ID 获取单条详情 |
| 创建 | POST | `/{resource}` | 新建一条资源 |
| 更新 | PUT | `/{resource}/:id` | 整体更新一条资源 |
| 删除 | DELETE | `/{resource}/:id` | 删除一条资源 |

**示例：**
```
GET    /api/hse/hazard/hazards          # 获取隐患列表
GET    /api/hse/hazard/hazards/123      # 获取ID为123的隐患详情
POST   /api/hse/hazard/hazards          # 新建隐患
PUT    /api/hse/hazard/hazards/123      # 更新ID为123的隐患
DELETE /api/hse/hazard/hazards/123      # 删除ID为123的隐患
```

### 1.5 特殊操作

非标准 CRUD 的业务操作使用子路径方式，动词放在资源 ID 之后：

| 操作类型 | 请求方式 | 路径格式 | 示例 |
|----------|----------|----------|------|
| 审核 | POST | `/{resource}/:id/audit` | `POST /api/hse/hazard/hazards/123/audit` |
| 冻结/解冻 | POST | `/{resource}/:id/freeze` | `POST /api/hse/site/violations/123/freeze` |
| 导出 | GET | `/{resource}/export` | `GET /api/hse/hazard/hazards/export` |
| 导入 | POST | `/{resource}/import` | `POST /api/hse/personnel/employees/import` |
| 批量删除 | POST | `/{resource}/batch-delete` | `POST /api/hse/hazard/hazards/batch-delete` |
| 统计 | GET | `/{resource}/stats` | `GET /api/hse/hazard/hazards/stats` |
| 状态变更 | POST | `/{resource}/:id/{action}` | `POST /api/hse/hazard/hazards/123/resolve` |

---

## 二、请求方式规范

### 2.1 GET（查询、获取数据）

- **用途**：获取数据、查询列表、获取详情、统计数据
- **特性**：幂等，多次调用结果一致，不产生副作用
- **参数**：通过 URL Query String 传递
- **缓存**：可被浏览器缓存

**示例：**
```http
GET /api/hse/hazard/hazards?page=1&pageSize=10&level=high
```

### 2.2 POST（创建、提交、执行操作）

- **用途**：创建资源、提交表单、执行操作（审核、冻结、导入等）
- **特性**：非幂等，每次调用可能产生不同结果
- **参数**：通过 Request Body 传递 JSON 格式数据

**示例：**
```http
POST /api/hse/hazard/hazards
Content-Type: application/json

{
  "title": "消防通道堵塞",
  "level": "high",
  "location": "A栋1楼"
}
```

### 2.3 PUT（更新、修改，整体更新）

- **用途**：整体更新资源，客户端提供完整的资源对象
- **特性**：幂等，相同请求多次调用结果一致
- **参数**：通过 Request Body 传递完整资源数据

**示例：**
```http
PUT /api/hse/hazard/hazards/123
Content-Type: application/json

{
  "title": "消防通道严重堵塞",
  "level": "critical",
  "location": "A栋1楼东侧",
  "status": "pending"
}
```

### 2.4 PATCH（部分更新，可选使用）

- **用途**：部分更新资源，仅传递需要修改的字段
- **特性**：非幂等（取决于实现）
- **参数**：通过 Request Body 传递需要更新的字段

> **注意**：当前项目主要使用 PUT 进行更新，PATCH 为可选项。若接口支持部分更新，需在文档中明确说明。

**示例：**
```http
PATCH /api/hse/hazard/hazards/123
Content-Type: application/json

{
  "status": "resolved"
}
```

### 2.5 DELETE（删除）

- **用途**：删除资源
- **特性**：幂等，删除已删除的资源应返回成功或资源不存在
- **参数**：通过路径参数传递资源 ID

**示例：**
```http
DELETE /api/hse/hazard/hazards/123
```

### 2.6 禁止GET请求修改数据

**严格禁止**使用 GET 请求进行任何会产生副作用的操作，包括但不限于：

- ❌ 创建数据：`GET /create?name=xxx`
- ❌ 修改数据：`GET /update?id=1&status=xxx`
- ❌ 删除数据：`GET /delete?id=1`
- ❌ 执行操作：`GET /audit?id=1`
- ❌ 导出数据（特殊情况除外，需用 GET 触发文件下载）

> **导出例外**：导出接口使用 GET 是因为需要浏览器直接下载文件，属于特殊场景。

---

## 三、参数格式规范

### 3.1 查询参数（GET请求）

GET 请求的查询参数通过 URL Query String 传递，字段命名使用 **camelCase**。

**示例：**
```
/api/hse/hazard/hazards?page=1&pageSize=10&hazardLevel=high&departmentId=5
```

**常用查询参数约定：**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `keyword` | string | 模糊搜索关键词 |
| `status` | string | 状态筛选 |
| `startDate` | string | 开始日期 |
| `endDate` | string | 结束日期 |
| `departmentId` | number | 部门ID |

### 3.2 分页参数

所有列表接口统一使用以下分页参数：

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `page` | number | 1 | 页码，从 1 开始 |
| `pageSize` | number | 10 | 每页条数 |

**示例：**
```
/api/hse/hazard/hazards?page=1&pageSize=20
```

### 3.3 排序参数

列表接口支持排序时使用以下参数：

| 参数名 | 类型 | 可选值 | 说明 |
|--------|------|--------|------|
| `sortField` | string | 字段名（camelCase） | 排序字段 |
| `sortOrder` | string | `asc` / `desc` | 排序方向 |

**示例：**
```
/api/hse/hazard/hazards?sortField=createdAt&sortOrder=desc
```

### 3.4 请求体（POST/PUT）

POST/PUT 请求使用 JSON 格式传递数据，字段命名使用 **camelCase**。

**请求头要求：**
```
Content-Type: application/json
```

**示例：**
```json
{
  "hazardTitle": "消防通道堵塞",
  "hazardLevel": "high",
  "location": "A栋1楼",
  "responsiblePerson": "张三",
  "deadlineDate": "2026-08-01"
}
```

### 3.5 路径参数

路径参数用于传递资源 ID 等标识：

- 数字 ID：`/api/hse/hazard/hazards/123`
- 字符串 ID：`/api/hse/system/users/uuid-xxx`

**后端路由定义（Express）：**
```javascript
router.get('/hazards/:id', async (req, res) => {
  const hazardId = req.params.id;
  // ...
});
```

### 3.6 日期格式

日期时间统一使用 **ISO 8601** 格式：

- 完整日期时间：`YYYY-MM-DD HH:mm:ss`（如：`2026-07-24 14:30:00`）
- 仅日期：`YYYY-MM-DD`（如：`2026-07-24`）
- 时区：默认使用服务器时区（东八区）

**示例：**
```json
{
  "createdAt": "2026-07-24 14:30:00",
  "updatedAt": "2026-07-24 15:00:00",
  "deadlineDate": "2026-08-01"
}
```

---

## 四、返回格式规范

### 4.1 统一响应结构

所有接口响应统一使用以下结构：

```typescript
interface ApiResponse<T> {
  success: boolean;      // 是否成功
  code: number;          // 状态码：0成功，负数错误码
  message: string;       // 提示信息
  data: T;               // 响应数据
  timestamp: number;     // 响应时间戳（毫秒）
}
```

**后端实现（参考 `server/middleware/response.js`）：**
```javascript
// 成功响应
const success = (data = null, message = '操作成功') => ({
  code: 0,
  success: true,
  message,
  data,
  timestamp: Date.now()
});

// 失败响应
const error = (code = -1, message = '操作失败', data = null) => ({
  code,
  success: false,
  message,
  data,
  timestamp: Date.now()
});
```

### 4.2 成功响应

成功响应时 `code` 为 `0`，`success` 为 `true`：

```json
{
  "success": true,
  "code": 0,
  "message": "操作成功",
  "data": {
    "id": 123,
    "title": "消防通道堵塞"
  },
  "timestamp": 1711345200000
}
```

### 4.3 失败响应

失败响应时 `code` 为负数错误码，`success` 为 `false`：

```json
{
  "success": false,
  "code": -400,
  "message": "参数错误：hazardTitle 必填",
  "data": null,
  "timestamp": 1711345200000
}
```

### 4.4 列表响应

列表查询接口的 `data` 字段包含分页信息：

```json
{
  "success": true,
  "code": 0,
  "message": "获取成功",
  "data": {
    "list": [
      { "id": 1, "title": "隐患1", "level": "high" },
      { "id": 2, "title": "隐患2", "level": "medium" }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 10,
    "totalPages": 10
  },
  "timestamp": 1711345200000
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `list` | Array | 数据列表 |
| `total` | number | 总条数 |
| `page` | number | 当前页码 |
| `pageSize` | number | 每页条数 |
| `totalPages` | number | 总页数 |

### 4.5 详情响应

详情查询接口的 `data` 为资源详情对象：

```json
{
  "success": true,
  "code": 0,
  "message": "获取成功",
  "data": {
    "id": 123,
    "hazardTitle": "消防通道堵塞",
    "hazardLevel": "high",
    "location": "A栋1楼",
    "status": "pending",
    "createdAt": "2026-07-24 10:00:00",
    "updatedAt": "2026-07-24 11:00:00"
  },
  "timestamp": 1711345200000
}
```

### 4.6 空响应

无返回数据的接口（如删除、部分更新操作），`data` 为 `null`：

```json
{
  "success": true,
  "code": 0,
  "message": "删除成功",
  "data": null,
  "timestamp": 1711345200000
}
```

---

## 五、错误码规范

### 5.1 错误码规则

- `0`：成功
- 负数：错误码（与 HTTP 状态码区分，避免混淆）
- 错误码分段管理，按模块分配范围

### 5.2 通用错误码

| 错误码 | 名称 | HTTP 状态码 | 说明 |
|--------|------|-------------|------|
| `0` | 成功 | 200 | 请求成功 |
| `-1` | 通用错误 | 500 | 未知错误或通用失败 |
| `-400` | 参数错误 | 400 | 请求参数不合法 |
| `-401` | 未认证 | 401 | 未登录或 Token 失效 |
| `-403` | 无权限 | 403 | 权限不足 |
| `-404` | 资源不存在 | 404 | 请求的资源不存在 |
| `-409` | 冲突 | 409 | 资源冲突（如重复创建） |
| `-422` | 验证失败 | 422 | 数据验证不通过 |
| `-429` | 请求限流 | 429 | 请求过于频繁 |
| `-500` | 服务器错误 | 500 | 服务器内部错误 |
| `-503` | 服务不可用 | 503 | 服务暂时不可用 |

**错误响应示例：**
```json
{
  "success": false,
  "code": -400,
  "message": "参数错误：hazardTitle 不能为空",
  "data": null,
  "timestamp": 1711345200000
}
```

### 5.3 业务错误码范围

业务模块错误码按以下范围分配：

| 模块 | 错误码范围 | 说明 |
|------|-----------|------|
| 通用业务 | `-1000 ~ -1099` | 跨模块通用业务错误 |
| 安全总览（overview） | `-1100 ~ -1199` | 驾驶舱、报表等错误 |
| 风险管控（risk） | `-1200 ~ -1299` | 风险相关业务错误 |
| 隐患治理（hazard） | `-1300 ~ -1399` | 隐患相关业务错误 |
| 现场管理（site） | `-1400 ~ -1499` | 现场、三违等错误 |
| 人员管理（personnel） | `-1500 ~ -1599` | 员工、组织等错误 |
| 培训考核（training） | `-1600 ~ -1699` | 培训相关错误 |
| 应急管理（emergency） | `-1700 ~ -1799` | 应急相关错误 |
| 目标职责（objectives） | `-1800 ~ -1899` | 目标、职责等错误 |
| 制度标准（standards） | `-1900 ~ -1999` | 制度、文档等错误 |
| 系统管理（system） | `-2000 ~ -2099` | 用户、角色、权限等错误 |

**示例业务错误码：**

| 错误码 | 名称 | 模块 | 说明 |
|--------|------|------|------|
| `-1301` | 隐患不存在 | hazard | 指定的隐患记录不存在 |
| `-1302` | 隐患状态异常 | hazard | 当前状态不允许此操作 |
| `-1303` | 超出整改期限 | hazard | 已超过整改期限 |
| `-1501` | 员工工号重复 | personnel | 员工工号已存在 |
| `-1502` | 部门下存在员工 | personnel | 部门下有员工，无法删除 |

### 5.4 错误信息规范

错误信息遵循以下原则：

1. **简洁明了**：不超过 50 个汉字
2. **中文描述**：面向最终用户，使用中文
3. **可直接展示**：前端可直接 `message` 展示给用户
4. **具体明确**：指出具体哪个参数、什么问题

**正确示例：**
```
"隐患标题不能为空"
"员工工号 E001 已存在"
"请先登录后再操作"
"您没有删除此隐患的权限"
```

**错误示例：**
```
"error"              // 太模糊
"invalid parameter"  // 英文，用户看不懂
"参数错误"           // 不够具体，不知道哪个参数
```

---

## 六、分页格式规范

### 6.1 请求参数

所有列表接口统一使用以下分页请求参数：

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `page` | number | 否 | 1 | 页码，从 1 开始 |
| `pageSize` | number | 否 | 10 | 每页条数 |

**前端类型定义（参考 `src/types/api.ts`）：**
```typescript
interface PageQuery {
  page: number;
  pageSize: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}
```

### 6.2 响应结构

分页响应的 `data` 字段结构：

```typescript
interface PageResult<T> {
  list: T[];           // 数据列表
  total: number;       // 总条数
  page: number;        // 当前页码
  pageSize: number;    // 每页条数
  totalPages: number;  // 总页数
}
```

**后端计算总页数：**
```javascript
const totalPages = Math.ceil(total / pageSize);
```

### 6.3 页码规则

- 页码从 `1` 开始，不是从 `0` 开始
- 如果传入 `page < 1`，按 `page = 1` 处理
- 如果 `page > totalPages`，返回空列表，不报错

### 6.4 分页大小限制

- 默认 `pageSize = 10`
- 最大 `pageSize = 200`（防止一次性查询过多数据导致性能问题）
- 如果传入 `pageSize > 200`，按 `pageSize = 200` 处理
- 如果传入 `pageSize < 1`，按 `pageSize = 10` 处理

**后端实现参考：**
```javascript
const pageNum = Math.max(1, parseInt(req.query.page) || 1);
const limitNum = Math.min(Math.max(1, parseInt(req.query.pageSize) || 10), 200);
const offset = (pageNum - 1) * limitNum;
```

### 6.5 排序参数（可选）

支持排序的列表接口需提供排序参数：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `sortField` | string | 否 | 排序字段名（camelCase） |
| `sortOrder` | string | 否 | 排序方向：`asc` 升序 / `desc` 降序 |

**注意事项：**
- 需对 `sortField` 做白名单校验，防止 SQL 注入
- 默认排序字段和排序方向需在接口文档中明确

**后端排序白名单示例：**
```javascript
const allowedSortFields = ['createdAt', 'hazardLevel', 'status'];
const sortField = allowedSortFields.includes(req.query.sortField)
  ? camelToSnake(req.query.sortField)
  : 'created_at';
const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
```

---

## 七、权限校验规范

### 7.1 认证中间件

所有 `/api` 路径下的接口（公开接口除外）都需经过 JWT 认证中间件 `authMiddleware` 校验。

**中间件位置**：`server/middleware/auth.js`

**认证流程：**
1. 从请求头 `Authorization: Bearer <token>` 获取 Token
2. 验证 Token 签名和有效期
3. 检查 Token 是否在黑名单中
4. 将用户信息（`id`, `username`, `role`, `realName`）附加到 `req.user`
5. 认证失败返回 401 错误

**Express 全局挂载：**
```javascript
// app.js
const { authMiddleware } = require('./middleware/auth');
app.use('/api', authMiddleware);
```

**公开接口（无需认证）：**
- `/api/auth/login` - 登录
- `/api/auth/refresh` - 刷新 Token
- `/api/auth/logout` - 登出
- `/api/health` - 健康检查
- `/api/import/*` - 导入相关接口

### 7.2 权限中间件

接口级别的权限校验使用 `requirePermission(permissionCode)` 中间件。

**使用方式：**
```javascript
const { requirePermission } = require('../middleware/auth');

// 查看隐患列表
router.get('/hazards', requirePermission('hse:hazard:view'), async (req, res) => {
  // ...
});

// 创建隐患
router.post('/hazards', requirePermission('hse:hazard:create'), async (req, res) => {
  // ...
});
```

**校验逻辑：**
1. 检查用户是否已认证（`req.user` 是否存在）
2. 根据用户角色获取权限列表
3. 检查权限码是否在列表中（通配符 `*` 表示拥有全部权限）
4. 权限不足返回 403 错误

### 7.3 角色校验

特殊场景下可使用 `requireRole(...roles)` 中间件进行角色级校验。

**使用方式：**
```javascript
const { requireRole } = require('../middleware/auth');

// 仅系统管理员可访问
router.get('/admin/settings', requireRole('system_admin'), async (req, res) => {
  // ...
});

// HSE管理员和乡镇负责人可访问
router.get('/reports/summary', requireRole('hse_manager', 'township_manager'), async (req, res) => {
  // ...
});
```

> **建议**：优先使用权限码（`requirePermission`）进行细粒度权限控制，角色校验仅用于特殊场景。

### 7.4 权限码规则

权限码格式：`hse:{module}:{sub}:{action}`

| 层级 | 说明 | 示例 |
|------|------|------|
| `hse` | 系统标识，固定为 `hse` | `hse` |
| `{module}` | 一级模块名 | `hazard` / `risk` / `personnel` |
| `{sub}` | 子模块（可选） | `hazards` / `rectification` / `statistics` |
| `{action}` | 操作类型 | `view` / `create` / `update` / `delete` |

**权限码示例：**

| 权限码 | 说明 |
|--------|------|
| `hse:hazard:view` | 隐患治理模块查看权限 |
| `hse:hazard:hazards:view` | 隐患列表查看权限 |
| `hse:hazard:create` | 隐患创建权限 |
| `hse:hazard:update` | 隐患更新权限 |
| `hse:hazard:delete` | 隐患删除权限 |
| `hse:hazard:export` | 隐患导出权限 |
| `hse:hazard:import` | 隐患导入权限 |
| `hse:hazard:audit` | 隐患审核权限 |
| `hse:hazard:freeze` | 隐患冻结权限 |

### 7.5 权限码与接口对应表

| 操作类型 | 权限码后缀 | 请求方式 | 示例接口 | 示例权限码 |
|----------|-----------|----------|----------|-----------|
| 查看（列表/详情） | `view` | GET | `GET /hazards` | `hse:hazard:view` |
| 创建 | `create` | POST | `POST /hazards` | `hse:hazard:create` |
| 更新 | `update` | PUT | `PUT /hazards/:id` | `hse:hazard:update` |
| 删除 | `delete` | DELETE | `DELETE /hazards/:id` | `hse:hazard:delete` |
| 审核 | `audit` | POST | `POST /hazards/:id/audit` | `hse:hazard:audit` |
| 冻结 | `freeze` | POST | `POST /hazards/:id/freeze` | `hse:hazard:freeze` |
| 导出 | `export` | GET | `GET /hazards/export` | `hse:hazard:export` |
| 导入 | `import` | POST | `POST /hazards/import` | `hse:hazard:import` |

**角色权限映射参考**（`server/middleware/auth.js` 中 `ROLE_PERMISSIONS_MAP`）：

| 角色 | 权限说明 |
|------|----------|
| `system_admin` | 系统管理员，拥有全部权限（`*`） |
| `hse_manager` | HSE管理员，所有HSE模块 view + create/update/delete/export/import |
| `township_manager` | 乡镇/单位负责人，有限的查看和操作权限 |
| `manager` | 管理人员，部分模块操作权限 |
| `viewer` | 查看者，仅查看权限 |

---

## 八、审计日志规范

### 8.1 记录内容

审计日志记录以下字段（对应表 `sys_operation_log`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `userId` | number | 操作人用户 ID |
| `username` | string | 操作人用户名 |
| `action` | string | 操作动作（create/update/delete/export/import 等） |
| `module` | string | 模块名称（hazard/risk/personnel 等） |
| `description` | string | 操作描述 |
| `ip` | string | 客户端 IP 地址 |
| `userAgent` | string | 用户浏览器 User-Agent |
| `statusCode` | number | HTTP 状态码（200成功，其他失败） |
| `detail` | object | 额外详情（JSON 格式存储） |
| `createdAt` | string | 操作时间 |

### 8.2 使用方式

#### 方式一：手动调用 `auditLog()`

在路由处理函数中手动调用审计日志函数。

**函数位置**：`server/routes/audit.js` 中导出的 `auditLog()`

**使用示例：**
```javascript
const { auditLog } = require('./audit');

router.post('/hazards', requirePermission('hse:hazard:create'), async (req, res) => {
  try {
    // ... 创建隐患逻辑 ...
    const newHazard = await createHazard(req.body);

    // 记录审计日志
    await auditLog({
      userId: req.user.id,
      username: req.user.username,
      action: 'create',
      module: 'hazard',
      description: `创建隐患：${newHazard.hazardTitle}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: 200,
      detail: { hazardId: newHazard.id }
    });

    res.json(success(newHazard, '创建成功'));
  } catch (err) {
    // 失败也记录日志
    await auditLog({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'create',
      module: 'hazard',
      description: '创建隐患失败',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: 500,
      detail: { error: err.message }
    });
    next(err);
  }
});
```

#### 方式二：审计中间件（推荐）

对于标准 CRUD 操作，可封装审计中间件简化使用。

**中间件示例：**
```javascript
// server/middleware/audit.js
function auditMiddleware(module, action) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      // 记录审计日志（异步，不阻塞响应）
      auditLog({
        userId: req.user?.id,
        username: req.user?.username,
        action,
        module,
        description: `${action} ${module}`,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        statusCode: data.success ? 200 : (Math.abs(data.code) || 500),
        detail: { params: req.params, body: req.body }
      }).catch(() => {});

      return originalJson(data);
    };
    next();
  };
}
```

### 8.3 需要记录的操作

以下操作**必须**记录审计日志：

| 操作类型 | 说明 | 示例 |
|----------|------|------|
| `create` | 创建数据 | 新建隐患、新增员工 |
| `update` | 修改数据 | 更新隐患信息、修改员工信息 |
| `delete` | 删除数据 | 删除隐患、删除员工 |
| `audit` | 审核操作 | 审核隐患、审批流程 |
| `freeze` | 冻结/解冻 | 冻结账号、冻结三违记录 |
| `import` | 导入数据 | 批量导入员工、导入隐患 |
| `export` | 导出数据 | 导出隐患列表、导出员工报表 |
| `login` | 登录 | 用户登录系统 |
| `logout` | 登出 | 用户退出系统 |
| `config` | 配置变更 | 修改系统配置、修改角色权限 |

### 8.4 不需要记录的操作

以下操作**不需要**记录审计日志：

| 操作类型 | 说明 | 示例 |
|----------|------|------|
| 查询操作 | 普通列表查询、详情查询 | GET 列表、GET 详情 |
| 统计操作 | 统计数据查询 | GET /stats、GET /summary |
| 下拉选项 | 获取字典、选项数据 | GET /options、GET /dict |

> **原则**：只读、不产生业务影响的操作不需要记录审计日志。

---

## 九、前端API调用规范

### 9.1 文件位置

前端 API 层统一放在 `src/api/modules/` 目录下，按业务模块分文件：

```
src/api/
├── client.ts          # Axios 实例封装（通用）
├── index.ts           # API 统一出口
└── modules/
    ├── auth.ts        # 认证模块
    ├── user.ts        # 用户管理
    ├── hazard.ts      # 隐患治理
    ├── risk.ts        # 风险管控
    ├── personnel.ts   # 人员管理
    ├── training.ts    # 培训考核
    └── ...
```

**文件命名规则**：模块名 `.ts` 后缀，小写，多单词用点或连字符分隔。

### 9.2 函数命名

API 函数命名遵循以下约定：

| 操作类型 | 命名前缀 | 示例 |
|----------|----------|------|
| 获取列表 | `fetch` + 资源名 + `List` | `fetchHazardList` |
| 获取详情 | `fetch` + 资源名 + `Detail` | `fetchHazardDetail` |
| 创建 | `create` + 资源名 | `createHazard` |
| 更新 | `update` + 资源名 | `updateHazard` |
| 删除 | `delete` + 资源名 | `deleteHazard` |
| 批量删除 | `batchDelete` + 资源名 | `batchDeleteHazard` |
| 审核 | `audit` + 资源名 | `auditHazard` |
| 导出 | `export` + 资源名 | `exportHazard` |
| 导入 | `import` + 资源名 | `importHazard` |
| 统计 | `fetch` + 资源名 + `Stats` | `fetchHazardStats` |

**示例（参考 `src/api/modules/hazard.ts`）：**
```typescript
// src/api/modules/hazard.ts

/** 分页查询隐患列表 */
export function fetchHazardList(params: HazardQueryParams): Promise<PageResult<HazardItem>> {
  return client.get('/hazards', { params });
}

/** 获取隐患详情 */
export function fetchHazardDetail(id: number): Promise<HazardItem> {
  return client.get(`/hazards/${id}`);
}

/** 创建隐患 */
export function createHazard(data: HazardFormData): Promise<HazardItem> {
  return client.post('/hazards', data);
}

/** 更新隐患 */
export function updateHazard(id: number, data: Partial<HazardFormData>): Promise<HazardItem> {
  return client.put(`/hazards/${id}`, data);
}

/** 删除隐患 */
export function deleteHazard(id: number): Promise<null> {
  return client.delete(`/hazards/${id}`);
}
```

### 9.3 类型定义

每个 API 函数都必须有明确的 TypeScript 类型定义。

**类型定义位置**：
- 通用类型：`src/types/api.ts`
- 业务类型：`src/features/{module}/types.ts`

**通用类型（参考 `src/types/api.ts`）：**
```typescript
/** 通用 API 响应 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

/** 分页请求参数 */
export interface PageQuery {
  page: number;
  pageSize: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}

/** 分页响应结果 */
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 标准化 API 错误 */
export interface ApiError {
  code: number;
  message: string;
  detail?: string;
  status: number;
  isCanceled: boolean;
}
```

**业务类型示例：**
```typescript
// src/features/hazard/types.ts

/** 隐患查询参数 */
export interface HazardQueryParams extends PageQuery {
  keyword?: string;
  hazardLevel?: string;
  status?: string;
  departmentId?: number;
  startDate?: string;
  endDate?: string;
}

/** 隐患列表项 */
export interface HazardItem {
  id: number;
  hazardTitle: string;
  hazardLevel: 'low' | 'medium' | 'high' | 'critical';
  location: string;
  status: string;
  responsiblePerson: string;
  createdAt: string;
}

/** 隐患表单数据 */
export interface HazardFormData {
  hazardTitle: string;
  hazardLevel: string;
  location: string;
  description: string;
  responsiblePerson: string;
  deadlineDate: string;
}
```

### 9.4 调用方式

使用封装好的 `client` 对象进行 API 调用，方法包括：`get`、`post`、`put`、`patch`、`delete`。

**client 位置**：`src/api/client.ts`

**示例：**
```typescript
import { client } from '@/api/client';

// GET 请求（带查询参数）
client.get('/hazards', { params: { page: 1, pageSize: 10 } });

// POST 请求（带请求体）
client.post('/hazards', { hazardTitle: '标题', hazardLevel: 'high' });

// PUT 请求（带路径参数和请求体）
client.put(`/hazards/${id}`, { hazardTitle: '新标题' });

// DELETE 请求（带路径参数）
client.delete(`/hazards/${id}`);
```

**client 封装说明**：
- 自动添加 `Authorization` 请求头（Bearer Token）
- 响应拦截器自动解包 `data` 字段（成功时直接返回 data）
- 错误统一处理（Token 过期自动刷新、网络错误提示等）
- 自动附加请求 ID（`X-Request-ID`）用于链路追踪

### 9.5 错误处理

#### 统一错误处理

大部分错误在响应拦截器中统一处理：

- **401 未认证**：自动刷新 Token，刷新失败跳转登录页
- **网络错误**：统一提示"网络连接异常"
- **业务错误**：统一 `ElMessage.error(message)` 提示

#### 业务层补充处理

特殊场景下业务层可补充错误处理：

```typescript
import { client } from '@/api/client';
import type { ApiError } from '@/types/api';

export async function createHazard(data: HazardFormData): Promise<HazardItem> {
  try {
    return await client.post('/hazards', data);
  } catch (err) {
    const apiError = err as ApiError;

    // 特定错误码的特殊处理
    if (apiError.code === -1301) {
      // 自定义处理逻辑
      console.error('隐患不存在', apiError);
    }

    // 重新抛出，让调用方也能处理
    throw err;
  }
}
```

#### 静默请求

不需要默认错误提示的请求，可添加 `X-Silent: true` 请求头：

```typescript
client.get('/hazards/stats', {
  headers: { 'X-Silent': 'true' }
});
```

---

## 十、接口示例

### 10.1 列表查询接口示例

**接口信息：**

| 项目 | 内容 |
|------|------|
| 接口路径 | `GET /api/hse/hazard/hazards` |
| 接口描述 | 分页查询隐患列表 |
| 权限码 | `hse:hazard:view` |
| 审计日志 | 否 |

**请求参数（Query）：**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，默认 10，最大 200 |
| keyword | string | 否 | 搜索关键词 |
| hazardLevel | string | 否 | 隐患等级：low/medium/high/critical |
| status | string | 否 | 状态：pending/processing/resolved |
| sortField | string | 否 | 排序字段：createdAt/hazardLevel |
| sortOrder | string | 否 | 排序方向：asc/desc |

**请求示例：**
```http
GET /api/hse/hazard/hazards?page=1&pageSize=10&hazardLevel=high&sortField=createdAt&sortOrder=desc
Authorization: Bearer <token>
```

**响应示例（成功）：**
```json
{
  "success": true,
  "code": 0,
  "message": "获取成功",
  "data": {
    "list": [
      {
        "id": 1,
        "hazardTitle": "消防通道堵塞",
        "hazardLevel": "high",
        "location": "A栋1楼东侧",
        "status": "pending",
        "responsiblePerson": "张三",
        "deadlineDate": "2026-08-01",
        "createdAt": "2026-07-24 10:00:00"
      },
      {
        "id": 2,
        "hazardTitle": "灭火器过期",
        "hazardLevel": "high",
        "location": "B栋3楼",
        "status": "processing",
        "responsiblePerson": "李四",
        "deadlineDate": "2026-07-30",
        "createdAt": "2026-07-23 14:30:00"
      }
    ],
    "total": 42,
    "page": 1,
    "pageSize": 10,
    "totalPages": 5
  },
  "timestamp": 1711345200000
}
```

**响应示例（失败）：**
```json
{
  "success": false,
  "code": -401,
  "message": "登录已过期，请重新登录",
  "data": null,
  "timestamp": 1711345200000
}
```

---

### 10.2 创建接口示例

**接口信息：**

| 项目 | 内容 |
|------|------|
| 接口路径 | `POST /api/hse/hazard/hazards` |
| 接口描述 | 创建隐患记录 |
| 权限码 | `hse:hazard:create` |
| 审计日志 | 是（action: create） |

**请求体（JSON）：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| hazardTitle | string | 是 | 隐患标题 |
| hazardLevel | string | 是 | 隐患等级：low/medium/high/critical |
| location | string | 是 | 隐患位置 |
| description | string | 否 | 隐患描述 |
| responsiblePerson | string | 是 | 责任人 |
| deadlineDate | string | 是 | 整改期限（YYYY-MM-DD） |
| relatedRiskId | number | 否 | 关联风险ID |
| gridId | number | 否 | 网格ID |

**请求示例：**
```http
POST /api/hse/hazard/hazards
Content-Type: application/json
Authorization: Bearer <token>

{
  "hazardTitle": "消防通道堵塞",
  "hazardLevel": "high",
  "location": "A栋1楼东侧",
  "description": "消防通道被杂物堆放，影响紧急疏散",
  "responsiblePerson": "张三",
  "deadlineDate": "2026-08-01",
  "gridId": 5
}
```

**响应示例（成功）：**
```json
{
  "success": true,
  "code": 0,
  "message": "创建成功",
  "data": {
    "id": 123,
    "hazardTitle": "消防通道堵塞",
    "hazardLevel": "high",
    "location": "A栋1楼东侧",
    "description": "消防通道被杂物堆放，影响紧急疏散",
    "status": "pending",
    "responsiblePerson": "张三",
    "deadlineDate": "2026-08-01",
    "gridId": 5,
    "createdBy": 10,
    "createdAt": "2026-07-24 10:00:00",
    "updatedAt": "2026-07-24 10:00:00"
  },
  "timestamp": 1711345200000
}
```

**响应示例（参数错误）：**
```json
{
  "success": false,
  "code": -400,
  "message": "参数错误：hazardTitle 不能为空",
  "data": null,
  "timestamp": 1711345200000
}
```

---

### 10.3 更新接口示例

**接口信息：**

| 项目 | 内容 |
|------|------|
| 接口路径 | `PUT /api/hse/hazard/hazards/:id` |
| 接口描述 | 更新隐患信息（整体更新） |
| 权限码 | `hse:hazard:update` |
| 审计日志 | 是（action: update） |

**路径参数：**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| id | number | 隐患ID |

**请求体（JSON）：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| hazardTitle | string | 是 | 隐患标题 |
| hazardLevel | string | 是 | 隐患等级 |
| location | string | 是 | 隐患位置 |
| description | string | 否 | 隐患描述 |
| responsiblePerson | string | 是 | 责任人 |
| deadlineDate | string | 是 | 整改期限 |

**请求示例：**
```http
PUT /api/hse/hazard/hazards/123
Content-Type: application/json
Authorization: Bearer <token>

{
  "hazardTitle": "消防通道严重堵塞",
  "hazardLevel": "critical",
  "location": "A栋1楼东侧楼梯口",
  "description": "消防通道被大量杂物堆放，完全堵塞",
  "responsiblePerson": "王五",
  "deadlineDate": "2026-07-28"
}
```

**响应示例（成功）：**
```json
{
  "success": true,
  "code": 0,
  "message": "更新成功",
  "data": {
    "id": 123,
    "hazardTitle": "消防通道严重堵塞",
    "hazardLevel": "critical",
    "location": "A栋1楼东侧楼梯口",
    "description": "消防通道被大量杂物堆放，完全堵塞",
    "status": "pending",
    "responsiblePerson": "王五",
    "deadlineDate": "2026-07-28",
    "updatedBy": 10,
    "updatedAt": "2026-07-24 11:00:00"
  },
  "timestamp": 1711345800000
}
```

**响应示例（资源不存在）：**
```json
{
  "success": false,
  "code": -1301,
  "message": "隐患不存在",
  "data": null,
  "timestamp": 1711345800000
}
```

---

### 10.4 删除接口示例

**接口信息：**

| 项目 | 内容 |
|------|------|
| 接口路径 | `DELETE /api/hse/hazard/hazards/:id` |
| 接口描述 | 删除隐患记录 |
| 权限码 | `hse:hazard:delete` |
| 审计日志 | 是（action: delete） |

**路径参数：**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| id | number | 隐患ID |

**请求示例：**
```http
DELETE /api/hse/hazard/hazards/123
Authorization: Bearer <token>
```

**响应示例（成功）：**
```json
{
  "success": true,
  "code": 0,
  "message": "删除成功",
  "data": null,
  "timestamp": 1711345200000
}
```

**响应示例（权限不足）：**
```json
{
  "success": false,
  "code": -403,
  "message": "权限不足，无法执行此操作",
  "data": null,
  "timestamp": 1711345200000
}
```

---

### 10.5 审核接口示例

**接口信息：**

| 项目 | 内容 |
|------|------|
| 接口路径 | `POST /api/hse/hazard/hazards/:id/audit` |
| 接口描述 | 审核隐患 |
| 权限码 | `hse:hazard:audit` |
| 审计日志 | 是（action: audit） |

**路径参数：**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| id | number | 隐患ID |

**请求体（JSON）：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| auditResult | string | 是 | 审核结果：approved/rejected |
| auditRemark | string | 否 | 审核意见 |

**请求示例：**
```http
POST /api/hse/hazard/hazards/123/audit
Content-Type: application/json
Authorization: Bearer <token>

{
  "auditResult": "approved",
  "auditRemark": "情况属实，同意立案"
}
```

**响应示例（成功）：**
```json
{
  "success": true,
  "code": 0,
  "message": "审核成功",
  "data": {
    "id": 123,
    "hazardTitle": "消防通道堵塞",
    "status": "processing",
    "auditResult": "approved",
    "auditRemark": "情况属实，同意立案",
    "auditedBy": 20,
    "auditedAt": "2026-07-24 15:00:00"
  },
  "timestamp": 1711359600000
}
```

**响应示例（状态异常）：**
```json
{
  "success": false,
  "code": -1302,
  "message": "隐患状态异常，当前状态不允许审核",
  "data": null,
  "timestamp": 1711359600000
}
```

---

## 附录：快速参考

### 后端路由模板

```javascript
// server/routes/hse-hazard.js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { requirePermission } = require('../middleware/auth');
const { auditLog } = require('./audit');

// 列表查询
router.get('/hazards', requirePermission('hse:hazard:view'), async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, keyword, status } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (keyword) {
      conditions.push(`hazard_title ILIKE $${idx++}`);
      params.push(`%${keyword}%`);
    }
    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM hazards ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT * FROM hazards ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    const list = result.rows.map(row => ({
      id: row.id,
      hazardTitle: row.hazard_title,
      hazardLevel: row.hazard_level,
      location: row.location,
      status: row.status,
      createdAt: row.created_at
    }));

    res.json(success({
      list,
      total,
      page: pageNum,
      pageSize: limitNum,
      totalPages: Math.ceil(total / limitNum)
    }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

### 前端 API 模块模板

```typescript
// src/api/modules/hazard.ts
import { client } from '../client';
import type { PageResult } from '@/types/api';
import type { HazardItem, HazardQueryParams, HazardFormData } from '@/features/hazard/types';

/** 分页查询隐患列表 */
export function fetchHazardList(params: HazardQueryParams): Promise<PageResult<HazardItem>> {
  return client.get('/hazards', { params });
}

/** 获取隐患详情 */
export function fetchHazardDetail(id: number): Promise<HazardItem> {
  return client.get(`/hazards/${id}`);
}

/** 创建隐患 */
export function createHazard(data: HazardFormData): Promise<HazardItem> {
  return client.post('/hazards', data);
}

/** 更新隐患 */
export function updateHazard(id: number, data: Partial<HazardFormData>): Promise<HazardItem> {
  return client.put(`/hazards/${id}`, data);
}

/** 删除隐患 */
export function deleteHazard(id: number): Promise<null> {
  return client.delete(`/hazards/${id}`);
}
```

### 数据库字段命名规范

| 规则 | 数据库（snake_case） | API/前端（camelCase） |
|------|----------------------|----------------------|
| 主键 | `id` | `id` |
| 创建时间 | `created_at` | `createdAt` |
| 更新时间 | `updated_at` | `updatedAt` |
| 创建人 | `created_by` | `createdBy` |
| 更新人 | `updated_by` | `updatedBy` |
| 隐患标题 | `hazard_title` | `hazardTitle` |
| 隐患等级 | `hazard_level` | `hazardLevel` |
| 责任人 | `responsible_person` | `responsiblePerson` |

---

**文档结束**
