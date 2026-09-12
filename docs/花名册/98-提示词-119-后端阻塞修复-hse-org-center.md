# 提示词-119: 后端阻塞修复 — hse-org-center.js 权限与路由顺序

## 背景

提示词-118（双轨制方案C）新建了 `hse_org_unit` 前端管理页，但在 API 联调中发现 `hse-org-center.js` 存在两处后端缺陷，导致所有写操作（新增/编辑/删除组织、作业单元）返回 403、类型枚举接口返回 500。

本提示词修复这两处阻塞，使前端页面完整可操作。

## 涉及文件

| 文件 | 修改范围 |
|------|----------|
| `f:\hse-dashboard\server\routes\hse-org-center.js` | requireRole 调用形式修复 + 路由注册顺序调整 |

**禁止修改**: 前端页面、数据库、其他路由、其他模块、middleware/auth.js

---

## 阻塞1：requireRole 调用形式错误（导致所有写接口 403）

### 根因分析

`auth.js:204` 中 `requireRole` 的签名为 **rest 参数**：

```javascript
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) { ... }
  };
}
```

全仓其他路由（如 `hse-employee.js`）均使用**展开写法**：

```javascript
router.post('/departments', requireRole('admin', 'safety_manager'), ...)
```

但 `hse-org-center.js` 6 处误用**数组写法**：

```javascript
router.post('/org', requireRole(['admin', 'safety_manager']), ...)
```

由于 `requireRole` 是 rest 参数，`...allowedRoles` 收到 `[['admin','safety_manager']]`（嵌套数组），`includes('admin')` 恒假 → **永久 403**。

影响范围：`POST/PUT/DELETE /org` 和 `POST/PUT/DELETE /operation-unit` 共 6 个端点全部不可达。

### 修复方案

将 `hse-org-center.js` 中 6 处 `requireRole(['admin', 'safety_manager'])` 改为 `requireRole('admin', 'safety_manager')`。

**修改位置**（行号）：
- 第 124 行：`POST /org`
- 第 174 行：`PUT /org/:id`
- 第 211 行：`DELETE /org/:id`
- 第 362 行：`POST /operation-unit`
- 第 397 行：`PUT /operation-unit/:id`
- 第 435 行：`DELETE /operation-unit/:id`

### 修复后验证

修复后用同一 admin token 发送 POST /org 请求，应返回 200 而非 403。

---

## 阻塞2：`/org/types` 与 `/operation-unit/types` 被 `/:id` 路由顺序遮蔽

### 根因分析

Express 路由按注册顺序匹配。`hse-org-center.js` 中：

```
GET /org/tree       ← 第 28 行
GET /org/list       ← 第 65 行
GET /org/:id        ← 第 103 行（通配，会匹配后面的 /org/types）
...
GET /org/types      ← 第 459 行（被 /org/:id 先匹配，永远不会被执行）
```

当请求 `GET /org/types` 时，`/org/:id` 先匹配，`"types"` 被当作 `id` 参数传入 `parseInt` → "无效的类型 bigint 输入语法"。

同样的问题也存在于 `/operation-unit/types` 被 `/operation-unit/:id` 遮蔽。

### 修复方案

将 `/org/types` 和 `/operation-unit/types` 的路由注册移到 `/:id` 之前。

**具体操作**：

1. 将 `GET /org/types`（第 459 行）移到 `GET /org/:id`（第 103 行）**之前**（建议放在 `GET /org/list` 之后，第 97 行处）
2. 将 `GET /operation-unit/types`（第 473 行）移到 `GET /operation-unit/:id`（第 341 行）**之前**（建议放在 `GET /operation-unit/all` 之后，第 335 行处）

**移动后路由顺序**：
```
GET /org/tree
GET /org/list
GET /org/types          ← 移到 /org/:id 之前
GET /org/:id
POST /org
PUT /org/:id
DELETE /org/:id

GET /operation-unit/list
GET /operation-unit/all
GET /operation-unit/types   ← 移到 /operation-unit/:id 之前
GET /operation-unit/:id
POST /operation-unit
PUT /operation-unit/:id
DELETE /operation-unit/:id
```

### 修复后验证

修复后用 admin token 发送 `GET /org/types`，应返回 200 并含 4 个组织类型枚举。

---

## 验证步骤

1. 重启后端：`node --check server/routes/hse-org-center.js` 确认语法正确
2. 重启 server 后，使用 admin token 发送 `POST /api/hse/org-center/org` 创建测试组织 → 确认返回 200
3. 发送 `PUT /api/hse/org-center/org/:id` 更新测试组织 → 确认返回 200
4. 发送 `DELETE /api/hse/org-center/org/:id` 删除测试组织 → 确认返回 200
5. 发送 `GET /api/hse/org-center/org/types` → 确认返回 200，含 4 个枚举值
6. 发送 `GET /api/hse/org-center/operation-unit/types` → 确认返回 200，含 7 个枚举值
7. 前端 `pnpm build` 确认 exit code 0（后端改动不影响前端构建）
8. 在前端"作业中心"页面 → 新增一个测试组织 → 确认保存成功 → 树中显示 → 删除清理

---

## 输出要求

执行完成后，生成以下文档并保存到 `f:\hse-dashboard\docs\花名册\`：

1. `98-提示词-119-验证报告.md`：包含修改前后对比、探针验证结果（6 个写端点 + 2 个枚举端点）、前端联调验证