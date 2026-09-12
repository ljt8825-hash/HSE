# HSE V2.0 Sprint 1 开发报告

## 一、完成内容

### 1.1 数据库层

| 文件 | 说明 |
|------|------|
| [sql/v2_document_tables.sql](file:///f:/deploy/hse-dashboard/sql/v2_document_tables.sql) | 6张新表建表SQL（幂等，IF NOT EXISTS） |
| [sql/v2_seed_data.sql](file:///f:/deploy/hse-dashboard/sql/v2_seed_data.sql) | 14个环卫分类 + 4个常用标签 |

**新建表清单**:

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| document_categories | 文件分类 | code（唯一）、parent_id（多级树） |
| document_tags | 文件标签 | name（唯一）、type（manual/auto） |
| document_files | 文件主表 | 含审查意见7字段 + 有效期3字段 |
| document_tag_relation | 标签关联 | file_id + tag_id |
| document_versions | 版本表 | **Sprint1仅建表预留** |
| document_standard_relation | 标准关联 | **clause_code字符串关联（无外键），仅建表预留** |

**document_files 含审查意见字段**: source_type、source_id、review_status、ai_summary、ai_score、review_user、review_time
**document_files 含有效期字段**: valid_start_date、valid_end_date、remind_days

### 1.2 后端层

| 文件 | 说明 |
|------|------|
| [server/routes/hse-documents.js](file:///f:/deploy/hse-dashboard/server/routes/hse-documents.js) | 安全资料中心路由（14个接口） |
| [server/services/documentService.js](file:///f:/deploy/hse-dashboard/server/services/documentService.js) | 文件管理业务逻辑层 |
| [server/app.js](file:///f:/deploy/hse-dashboard/server/app.js) | 新增2行（require + 挂载） |

**接口清单**:

| 方法 | 路径 | 角色 | 状态 |
|------|------|------|------|
| POST | /api/hse/documents/upload | 所有登录用户 | ✅ |
| GET | /api/hse/documents | 所有登录用户 | ✅ 已测 |
| GET | /api/hse/documents/stats | 所有登录用户 | ✅ 已测 |
| GET | /api/hse/documents/categories | 所有登录用户 | ✅ 已测 |
| POST | /api/hse/documents/categories | admin/safety_manager | ✅ |
| PUT | /api/hse/documents/categories/:id | admin/safety_manager | ✅ |
| DELETE | /api/hse/documents/categories/:id | admin/safety_manager | ✅ |
| GET | /api/hse/documents/tags | 所有登录用户 | ✅ |
| POST | /api/hse/documents/tags | admin/safety_manager | ✅ |
| GET | /api/hse/documents/:id | 所有登录用户 | ✅ |
| GET | /api/hse/documents/:id/download | 所有登录用户 | ✅ |
| PUT | /api/hse/documents/:id | admin/safety_manager | ✅ |
| DELETE | /api/hse/documents/:id | admin/safety_manager | ✅ 软删除 |
| POST | /api/hse/documents/:id/review | admin/safety_manager | ✅ |

### 1.3 前端层

| 文件 | 说明 |
|------|------|
| [api/hse/documents.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/documents.ts) | 14个API封装 + TypeScript类型定义 |
| [router/routes/modules/hse-documents.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-documents.ts) | 路由配置（嵌套结构，2个页面） |
| [views/hse/documents/library/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/documents/library/index.vue) | 文件库主页面 |
| [views/hse/documents/library/components/UploadModal.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/documents/library/components/UploadModal.vue) | 上传弹窗（页面内组件） |
| [views/hse/documents/review/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/documents/review/index.vue) | 文件审核页面 |

### 1.4 国际化

| 文件 | 说明 |
|------|------|
| [locales/langs/zh-CN/hse.json](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/locales/langs/zh-CN/hse.json) | 新增 documents 文案（72个键） |
| [locales/langs/en-US/hse.json](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/locales/langs/en-US/hse.json) | 新增 documents 英文文案 |

---

## 二、修改清单

### 2.1 新增文件（9个）

| 类型 | 文件 |
|------|------|
| 数据库 | sql/v2_document_tables.sql |
| 数据库 | sql/v2_seed_data.sql |
| 后端 | server/routes/hse-documents.js |
| 后端 | server/services/documentService.js |
| 前端 | api/hse/documents.ts |
| 前端 | router/routes/modules/hse-documents.ts |
| 前端 | views/hse/documents/library/index.vue |
| 前端 | views/hse/documents/library/components/UploadModal.vue |
| 前端 | views/hse/documents/review/index.vue |

### 2.2 修改文件（3个）

| 文件 | 修改内容 | 影响范围 |
|------|----------|----------|
| [server/app.js](file:///f:/deploy/hse-dashboard/server/app.js) | 第80-81行新增 require，第347-348行新增路由挂载 | 仅新增 /api/hse/documents，现有路由不受影响 |
| [locales/.../zh-CN/hse.json](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/locales/langs/zh-CN/hse.json) | 新增 documents 文案块 | 仅新增键，不影响现有文案 |
| [locales/.../en-US/hse.json](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/locales/langs/en-US/hse.json) | 新增 documents 英文文案块 | 仅新增键 |

### 2.3 额外修复（既有缺陷，非Sprint1范围）

| 文件 | 问题 | 修复 |
|------|------|------|
| [server/routes/objectives.js](file:///f:/deploy/hse-dashboard/server/routes/objectives.js) | 文件为0字节（损坏），缺少 module.exports，导致应用启动崩溃 | 补充占位路由和 module.exports = router |

**说明**: objectives.js 为既有损坏文件（0字节），导致 `Router.use() requires a middleware function` 错误，阻塞整个应用启动。为完成 Sprint 1 验证，补充了最小占位实现。**这不是 Sprint 1 的功能改动，仅是解除启动阻塞的最小修复。**

---

## 三、数据库说明

### 3.1 执行方式

```bash
# 建表（幂等，可重复执行）
psql -U hse_app -d safety_dashboard -f sql/v2_document_tables.sql

# 种子数据
psql -U hse_app -d safety_dashboard -f sql/v2_seed_data.sql
```

### 3.2 表结构概览

```
document_categories（14个环卫分类）
    ↓ category_id
document_files（文件主表）
    ↓ file_id          ↓ file_id
document_tag_relation  document_versions（预留）
    ↓ tag_id
document_tags

document_standard_relation（clause_code字符串关联，预留Sprint2/4）
```

### 3.3 与旧表关系

- **完全隔离**: 6张新表与现有19张旧表无外键关联
- **只读旧表**: Sprint 3 报告生成时将只读 hazards、training_records 等旧表
- **不修改旧表**: 未执行任何 ALTER 操作

### 3.4 字段规范

所有新表均包含:
- id（BIGSERIAL 主键）
- created_at / updated_at（时间戳）
- is_deleted（软删除）
- status（状态字段）

document_files 额外包含审查意见要求的7个字段 + 有效期3个字段。

---

## 四、测试结果

### 4.1 后端语法检查

```
node -c routes\hse-documents.js      ✅ 通过
node -c services\documentService.js  ✅ 通过
node -c app.js                       ✅ 通过
```

### 4.2 后端启动验证

```
[DB] PostgreSQL 连接池初始化成功
HSE 后端服务启动成功 (port: 5667)
WebSocket 服务已启动
```

### 4.3 接口测试

| 接口 | 测试结果 |
|------|----------|
| POST /api/auth/login | ✅ 登录成功，获取token |
| GET /api/hse/documents/categories | ✅ 返回14个环卫分类 |
| GET /api/hse/documents/stats | ✅ 返回统计结构（total:0） |
| GET /api/hse/documents?page=1&pageSize=5 | ✅ 返回分页列表（空） |

### 4.4 数据库验证

```sql
-- 表创建成功
SELECT tablename FROM pg_tables WHERE tablename LIKE 'document_%';
-- 返回6张表 ✅

-- 种子数据
SELECT code, name FROM document_categories WHERE is_deleted = false;
-- 返回14行 ✅

INSERT 0 14  -- 分类种子数据
INSERT 0 4   -- 标签种子数据
```

### 4.5 未测试项（用户取消）

- 文件上传接口（POST /upload）—— 实现已完成，语法正确，因用户取消未执行端到端测试
- 文件审核接口（POST /:id/review）—— 实现已完成，需上传文件后测试

---

## 五、风险说明

### 5.1 既有缺陷修复风险

| 风险 | 说明 | 影响 |
|------|------|------|
| objectives.js 占位修复 | 既有文件为0字节，补充了占位路由 | 目标管理模块返回空数据，需后续Sprint补充完整实现 |

### 5.2 功能限制

| 限制 | 说明 | 后续计划 |
|------|------|----------|
| 文件物理删除未实现 | 按要求仅软删除，不删服务器文件 | 如需释放空间，后续提供清理工具 |
| 前端角色按钮控制 | 审核按钮仅前端按角色显示，后端requireRole为最终防线 | 当前admin角色可见所有按钮 |
| 文件上传未端到端测试 | 用户取消了上传测试 | 部署后需手动验证上传功能 |

### 5.3 约束合规

| 约束 | 合规 |
|------|------|
| 未修改 packages/ | ✅ |
| 未修改 auth.js / auth routes / JWT / 登录页 | ✅ |
| 未修改 upload.js / response.js | ✅（仅require复用） |
| 未新增 npm 依赖 | ✅（package.json未变） |
| 未修改旧数据库表 | ✅（仅CREATE TABLE新表） |
| 软删除（不物理删除） | ✅ |
| 角色校验复用 requireRole（不硬编码） | ✅ |
| 所有新增代码含注释 | ✅ |

---

## 六、部署说明

### 6.1 数据库迁移

```bash
# 1. 执行建表SQL
psql -U hse_app -d safety_dashboard -f sql/v2_document_tables.sql

# 2. 执行种子数据
psql -U hse_app -d safety_dashboard -f sql/v2_seed_data.sql
```

### 6.2 后端部署

无需额外操作，新增路由已在 [app.js](file:///f:/deploy/hse-dashboard/server/app.js) 自动挂载。重启后端服务即可。

### 6.3 前端部署

无需额外操作，新增路由文件放入 `modules/` 后由 `import.meta.glob` 自动加载。重新构建前端即可。

### 6.4 验证步骤

1. 启动后端，确认日志无错误
2. 登录系统，确认登录正常
3. 访问"安全资料中心 > 文件库"，确认14个分类树展示
4. 上传文件，确认上传成功
5. 访问"安全资料中心 > 文件审核"，确认待审核列表
6. 审核文件，确认状态流转

---

**Sprint 1 开发完成。**
**等待 Sprint 2（AI文件分析）开发指令。**
