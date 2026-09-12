# HSE V2 Sprint4 Phase 2 开发报告

> 阶段：标准条款管理后端 API
> 日期：2026-07-19

---

## 1. 修改文件列表

### 新增文件

| 文件 | 说明 |
|------|------|
| `server/services/standardService.js` | 标准条款管理服务：树查询、CRUD、状态管理、导入导出 |
| `server/routes/hse-standard.js` | REST API 路由：8 个端点，参数校验 + 统一错误处理 |
| `server/test/sprint4-phase2-test.js` | 自动化测试脚本：25 个测试用例 |
| `server/test/_clean.js` | 测试数据清理工具脚本 |

### 修改文件

| 文件 | 说明 |
|------|------|
| `server/app.js` | 挂载 `/api/hse/standard` 路由 |

---

## 2. API 列表

所有接口统一前缀：`/api/hse/standard`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/tree` | 登录用户 | 获取三级条款树（默认只返回 active） |
| GET | `/stats` | 登录用户 | 条款统计（总数、各层级、启用/停用数） |
| GET | `/export` | admin / safety_manager | 导出所有条款（JSON） |
| GET | `/:id` | 登录用户 | 获取单条条款详情 |
| POST | `/` | admin / safety_manager | 新增条款 |
| PUT | `/:id` | admin / safety_manager | 修改条款 |
| PUT | `/:id/status` | admin / safety_manager | 启用/停用条款（软删除） |
| POST | `/import` | admin / safety_manager | 批量导入条款 |

### 统一响应格式

```json
{
  "code": 0,
  "success": true,
  "message": "操作成功",
  "data": {}
}
```

### 权限控制

- 只读接口（`/tree`、`/stats`、`/:id`）：登录即可访问
- 写操作接口（创建、修改、状态、导入、导出）：需要 `admin` 或 `safety_manager` 角色
- 全部接口走全局 JWT 认证中间件

---

## 3. 数据库使用说明

### 复用表：`safety_standard_clauses`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGSERIAL | 主键 |
| `code` | VARCHAR(64) | 条款编码（唯一） |
| `parent_id` | BIGINT | 父级 ID，一级为 NULL |
| `level` | SMALLINT | 层级 1/2/3 |
| `element_name` | VARCHAR(128) | 要素名称（一级要素使用） |
| `clause_title` | VARCHAR(256) | 条款标题 |
| `clause_content` | TEXT | 条款要求内容 |
| `check_method` | TEXT | 检查方法 |
| `score_weight` | DECIMAL(5,2) | 分值权重 |
| `required_doc_types` | JSONB | 要求资料类型数组 |
| `keywords` | JSONB | 关键词数组 |
| `sort_order` | INTEGER | 排序值 |
| `status` | VARCHAR(20) | 状态：`active` / `inactive` |
| `created_by` | BIGINT | 创建人 ID |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 更新时间 |
| `is_deleted` | BOOLEAN | 硬删除标记（默认 false） |

### 软删除机制

- 删除/停用条款通过 `status = 'inactive'` 实现，**不做物理删除**
- `is_deleted` 字段保留用于后台硬删除（本阶段不暴露 API）
- 条款树查询默认只返回 `status = 'active' AND is_deleted = FALSE` 的记录

### 层级约束

- 最大层级：3 级（一级要素 / 二级子项 / 三级条款）
- 一级条款 `parent_id` 为 NULL，二级必须指向一级，三级必须指向二级
- `createClause` 方法在创建时会校验父级层级关系

### JSONB 字段处理

- `required_doc_types`、`keywords` 为 JSONB 数组类型
- 写入时通过 `JSON.stringify()` 转换后传入参数
- 读取时 `pg` 驱动自动解析为 JS 对象/数组

---

## 4. 测试结果

测试环境：本地开发环境（PostgreSQL + Node.js Express）

### 测试用例（共 25 项，全部通过）

| # | 测试项 | 结果 |
|---|--------|------|
| 0 | 获取登录 token | ✅ |
| 1-1 | GET /tree 返回成功 | ✅ |
| 1-2 | GET /tree 包含 8 个一级要素 | ✅ |
| 2-1 | GET /stats 返回成功 | ✅ |
| 2-2 | GET /stats total >= 50 | ✅ |
| 3-1 | GET /:id 返回成功 | ✅ |
| 3-2 | GET /:id id 正确 | ✅ |
| 3-3 | GET /:id 不存在返回失败 | ✅ |
| 4-1 | POST / 创建成功 | ✅ |
| 4-2 | POST / 返回正确的 code | ✅ |
| 5-1 | PUT /:id 修改成功 | ✅ |
| 5-2 | PUT /:id 标题已更新 | ✅ |
| 5-3 | PUT /:id 权重已更新 | ✅ |
| 6-1 | PUT /:id/status 停用成功 | ✅ |
| 6-2 | PUT /:id/status 状态为 inactive | ✅ |
| 6-3 | PUT /:id/status 启用成功 | ✅ |
| 6-4 | PUT /:id/status 状态为 active | ✅ |
| 6-5 | PUT /:id/status 非法状态返回失败 | ✅ |
| 7-1 | GET /export 返回成功 | ✅ |
| 7-2 | GET /export 包含数据数组 | ✅ |
| 8-1 | POST /import 导入成功 | ✅ |
| 8-2 | POST /import 成功数=2 | ✅ |
| 8-3 | POST /import 重复导入失败数=2 | ✅ |
| 9 | POST / 重复编码返回失败 | ✅ |
| 10-1 | POST / 缺少编码返回失败 | ✅ |
| 10-2 | POST / 层级错误返回失败 | ✅ |
| 清理 | 测试数据已清理 | ✅ |

```
通过: 25
失败: 0
总计: 25
```

### 验证要点

1. ✅ 条款树返回三级嵌套结构，一级 8 个 GB/T 33000 要素
2. ✅ CRUD 完整流程（创建 → 查询 → 修改 → 停用 → 启用）
3. ✅ 软删除：状态切换为 inactive，不从数据库物理删除
4. ✅ 参数校验：缺少必填项、非法层级、非法状态均返回明确错误
5. ✅ 编码唯一性：重复编码创建失败
6. ✅ 批量导入：重复编码自动跳过，返回成功/失败统计
7. ✅ 导出：返回所有条款的 JSON 数组
8. ✅ 权限：写操作需要 admin/safety_manager 角色

---

## 5. 已知问题

### 5.1 待后续阶段实现

| 问题 | 说明 | 计划阶段 |
|------|------|----------|
| 前端页面 | 条款管理的前端界面未开发 | Phase 3+ |
| AI 评价 | 条款与资料关联 + AI 评价流程未开发 | Phase 4+ |
| Excel 导入导出 | 当前仅支持 JSON 格式导入导出 | 后续迭代 |
| 条款移动/排序 | 暂不支持批量调整层级和排序 | 后续迭代 |
| 操作日志 | 条款变更审计日志未实现 | 后续迭代 |

### 5.2 技术注意事项

1. **DECIMAL 类型比较**：`score_weight` 字段在 PostgreSQL 中为 `DECIMAL(5,2)`，`pg` 驱动读取为字符串类型，前端或业务逻辑比较时需用 `Number()` 转换。
2. **路由顺序**：Express 路由按定义顺序匹配，静态路径（如 `/export`、`/tree`、`/stats`）必须放在动态路径（如 `/:id`）之前，否则会被动态路由错误匹配。
3. **JSONB 写入**：向 PostgreSQL JSONB 字段写入数组/对象时，必须先 `JSON.stringify()`，否则会报"类型json的输入语法无效"错误。

---

## 6. 约束遵守情况

| 约束 | 状态 |
|------|------|
| 未修改 `packages/` | ✅ |
| 未修改 `auth/` | ✅ |
| 未修改 JWT / 登录代码 | ✅ |
| 未新增 npm 依赖 | ✅ |
| 未创建公共组件 | ✅ |
| 只开发后端 API | ✅ |
| 删除使用 status=inactive（软删除） | ✅ |
| 所有接口参数校验 | ✅ |
| 统一错误返回格式 | ✅ |
| 保持已有 Express 路由风格 | ✅ |
| 未修改已有 service | ✅ |

---

**Phase 2 完成，等待下一阶段指令。**
