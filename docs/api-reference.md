
# API 接口文档 — 宁津环卫 HSE 安全管理系统

## 基础信息

- **Base URL**: `/api`
- **认证方式**: Bearer Token（请求头 `Authorization: Bearer <token>`）
- **数据格式**: JSON
- **字符编码**: UTF-8
- **时间格式**: ISO 8601

## 响应格式

### 成功响应
```json
{
  "code": 0,
  "message": "操作成功",
  "data": {
    // 业务数据
  }
}
```

### 错误响应
```json
{
  "code": 400,
  "message": "参数错误",
  "details": {
    "username": "用户名不能为空"
  }
}
```

### 分页响应
```json
{
  "code": 0,
  "message": "查询成功",
  "data": {
    "list": [],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

---

## 认证模块 (Auth)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| POST | `/api/auth/login` | 登录 | ❌ |
| POST | `/api/auth/register` | 注册 | ❌ |
| POST | `/api/auth/logout` | 登出 | ✅ |
| GET | `/api/auth/me` | 获取当前用户信息 | ✅ |
| PUT | `/api/auth/password` | 修改密码 | ✅ |
| PUT | `/api/auth/profile` | 更新个人资料 | ✅ |
| POST | `/api/auth/refresh` | 刷新 Token | ❌ |

### POST /api/auth/login
**请求体**:
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**响应**:
```json
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "...",
    "user": {
      "id": 1,
      "username": "admin",
      "roles": ["super_admin"]
    }
  }
}
```

---

## 用户管理 (Users)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|:----:|
| GET | `/api/users` | 用户列表（分页） | users:list |
| GET | `/api/users/:id` | 用户详情 | users:view |
| POST | `/api/users` | 创建用户 | users:create |
| PUT | `/api/users/:id` | 更新用户 | users:update |
| DELETE | `/api/users/:id` | 删除用户 | users:delete |
| PUT | `/api/users/:id/status` | 启用/禁用用户 | users:update |

---

## 角色管理 (Roles)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|:----:|
| GET | `/api/roles` | 角色列表 | roles:list |
| GET | `/api/roles/:id` | 角色详情 | roles:view |
| POST | `/api/roles` | 创建角色 | roles:create |
| PUT | `/api/roles/:id` | 更新角色 | roles:update |
| DELETE | `/api/roles/:id` | 删除角色 | roles:delete |
| PUT | `/api/roles/:id/permissions` | 分配权限 | roles:update |
| PUT | `/api/roles/:id/menus` | 分配菜单 | roles:update |

---

## 菜单管理 (Menus)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|:----:|
| GET | `/api/menus` | 菜单树形列表 | menus:list |
| GET | `/api/menus/:id` | 菜单详情 | menus:view |
| POST | `/api/menus` | 创建菜单 | menus:create |
| PUT | `/api/menus/:id` | 更新菜单 | menus:update |
| DELETE | `/api/menus/:id` | 删除菜单 | menus:delete |
| GET | `/api/menus/user/me` | 当前用户菜单树 | ✅ 登录 |

---

## 告警中心 (Alerts)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|:----:|
| GET | `/api/alerts` | 告警列表（分页） | alerts:list |
| GET | `/api/alerts/:id` | 告警详情 | alerts:view |
| POST | `/api/alerts` | 创建告警 | alerts:create |
| PUT | `/api/alerts/:id` | 更新告警 | alerts:update |
| DELETE | `/api/alerts/:id` | 删除告警 | alerts:delete |
| PUT | `/api/alerts/:id/acknowledge` | 确认告警 | alerts:handle |
| PUT | `/api/alerts/:id/resolve` | 解决告警 | alerts:handle |
| GET | `/api/alerts/stats/summary` | 告警统计 | alerts:view |

**WebSocket 消息类型**:
- `ALERT_NEW` — 新告警推送
- `ALERT_UPDATE` — 告警更新
- `ALERT_RESOLVE` — 告警解决

---

## 工作流 (Workflow)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|:----:|
| GET | `/api/workflow/definitions` | 流程定义列表 | workflow:definition:list |
| GET | `/api/workflow/definitions/:id` | 流程定义详情 | workflow:definition:view |
| POST | `/api/workflow/definitions` | 创建流程定义 | workflow:definition:create |
| PUT | `/api/workflow/definitions/:id` | 更新流程定义 | workflow:definition:update |
| DELETE | `/api/workflow/definitions/:id` | 删除流程定义 | workflow:definition:delete |
| GET | `/api/workflow/instances` | 流程实例列表 | workflow:list |
| GET | `/api/workflow/instances/:id` | 流程实例详情 | workflow:view |
| POST | `/api/workflow/instances` | 发起流程 | workflow:start |
| GET | `/api/workflow/tasks/mine` | 我的待办任务 | workflow:task:view |
| GET | `/api/workflow/tasks/done` | 我的已办任务 | workflow:task:view |
| POST | `/api/workflow/tasks/:id/action` | 处理任务（通过/驳回） | workflow:task:handle |

### 流程节点类型
| 类型 | 说明 |
|------|------|
| `start` | 开始节点 |
| `end` | 结束节点 |
| `approval` | 审批节点 |
| `condition` | 条件分支节点 |
| `parallel` | 并行审批节点 |
| `cc` | 抄送节点 |

### 审批人类型
| 类型 | 说明 |
|------|------|
| `user` | 指定用户 |
| `role` | 指定角色（所有角色成员） |
| `dept` | 指定部门 |
| `initiator` | 发起人 |
| `dynamic` | 动态指定（表单字段） |

---

## 通知中心 (Notifications)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| GET | `/api/notifications` | 通知列表（分页） | ✅ |
| GET | `/api/notifications/unread-count` | 未读消息数 | ✅ |
| PUT | `/api/notifications/:id/read` | 标记已读 | ✅ |
| PUT | `/api/notifications/read-all` | 全部标记已读 | ✅ |
| DELETE | `/api/notifications/:id` | 删除通知 | ✅ |

**通知类型**:
- `system` — 系统通知
- `workflow` — 工作流通知
- `alert` — 告警通知

---

## 审计日志 (Audit)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|:----:|
| GET | `/api/audit/logs` | 审计日志列表（分页） | audit:list |
| GET | `/api/audit/logs/:id` | 日志详情 | audit:view |
| GET | `/api/audit/stats` | 统计数据 | audit:view |

---

## Dashboard 概览

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| GET | `/api/dashboard/summary` | 总览统计 | ✅ |
| GET | `/api/dashboard/alerts/trend` | 告警趋势 | ✅ |
| GET | `/api/dashboard/hazards/summary` | 隐患统计 | ✅ |
| GET | `/api/dashboard/training/summary` | 培训统计 | ✅ |

---

## 文件上传 (Files)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| POST | `/api/files/upload` | 上传文件 | ✅ |
| GET | `/api/files/:id` | 文件信息 | ✅ |
| GET | `/api/files/:id/download` | 下载文件 | ✅ |
| DELETE | `/api/files/:id` | 删除文件 | ✅ |

---

## 系统接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| GET | `/api/health` | 健康检查 | ❌ |
| GET | `/api/system/info` | 系统信息 | ✅ |
| GET | `/api/system/dict/:type` | 数据字典 | ✅ |

---

## WebSocket 连接

- **地址**: `ws://<host>:<port>/ws`
- **认证**: URL 参数 `?token=<access_token>`
- **心跳**: 每 30s 服务端发送 `HEARTBEAT`

### 连接示例
```javascript
const ws = new WebSocket('ws://localhost:3000/ws?token=eyJhbGciOi...');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case 'ALERT_NEW':
      console.log('新告警:', data.payload);
      break;
    case 'NOTIFICATION':
      console.log('新通知:', data.payload);
      break;
    case 'HEARTBEAT':
      ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK' }));
      break;
  }
};
```

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 400 | 参数错误 |
| 401 | 未认证 / Token 失效 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如用户名已存在） |
| 422 | 数据校验失败 |
| 500 | 服务器内部错误 |

---

## 权限代码命名规范

- 模块:list — 列表查看
- 模块:view — 详情查看
- 模块:create — 创建
- 模块:update — 更新
- 模块:delete — 删除
- 模块:export — 导出
- 模块:import — 导入
