# HSE V2.0 Sprint 1 代码变更计划

## 〇、项目扫描结果确认

### 1. 文件上传模块位置 ✅

**位置**: [server/middleware/upload.js](file:///f:/deploy/hse-dashboard/server/middleware/upload.js)

**关键能力**（均可复用，不修改）:

| 导出 | 说明 |
|------|------|
| `createUploader({ type, subDir })` | 创建上传器，返回 `{ single, array, fields, any }` |
| `uploadDocument` | 预置文档上传器（type='document', subDir='documents'，支持 pdf/doc/docx） |
| `uploadImage` | 预置图片上传器（subDir='images'） |
| `uploadExcel` | 预置Excel上传器（subDir='excel'） |
| `validateUploadedFile(file, expectedType)` | 魔术字节校验（防伪造） |
| `getFileUrl(req, filename, subDir)` | 生成文件访问URL |
| `getFilePath(filename, subDir)` | 获取文件物理路径 |
| `deleteFile(filePath)` | 删除物理文件 |
| `fixFilenameEncoding(name)` | Windows中文文件名编码修复 |

**重要约束**: upload.js 的 `document` 类型仅支持 pdf/doc/docx，图片/Excel 需用 `uploadImage`/`uploadExcel`。Sprint 1 需要支持多种类型，**必须用 `createUploader({ type: 'all', subDir: 'documents' })` 自建上传器**，或在上传路由中根据扩展名动态选择预置上传器。

### 2. notificationService 位置 ✅

**后端**: [server/services/notificationService.js](file:///f:/deploy/hse-dashboard/server/services/notificationService.js)
**后端路由**: [server/routes/notifications.js](file:///f:/deploy/hse-dashboard/server/routes/notifications.js)
**前端API**: [api/hse/notifications.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/notifications.ts)
**前端Store**: [store/notifications.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/store/notifications.ts)

**复用方式**: 文件审核状态变更时，调用 notificationService 推送通知（仅调用，不修改）。

### 3. request 调用方式 ✅

**位置**: [api/request.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/request.ts)

**核心导出**: `requestClient`（已配置 baseURL、token、响应拦截器）

**响应约定**（[response.js](file:///f:/deploy/hse-dashboard/server/middleware/response.js) + request.ts 拦截器）:

| 项 | 值 |
|----|-----|
| 成功 code | `0`（request.ts 第79行 `successCode: 0`） |
| 数据字段 | `data`（request.ts 第78行 `dataField: 'data'`） |
| 成功响应 | `{ code: 0, success: true, message, data }` |
| 失败响应 | `{ code: -1, success: false, message, data }` |

**调用模板**（参考 [api/hse/training.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/training.ts)）:

```typescript
import { requestClient } from '#/api/request';

// GET 列表
export async function getDocumentList(params) {
  return requestClient.get<{ list: Document[]; total: number }>(
    '/hse/documents',
    { params },
  );
}

// POST 上传（FormData）
export async function uploadDocument(formData: FormData) {
  return requestClient.post<Document>('/hse/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

// GET 下载（Blob）
export async function downloadDocument(id: number) {
  return requestClient.get<Blob>(`/hse/documents/${id}/download`, {
    responseType: 'blob',
  });
}
```

**注意**: request.ts 已配置 `responseReturn: 'data'`，调用方直接拿到 data 字段内容。

### 4. HSE 页面结构 ✅

**位置**: [views/hse/](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse)

**现有页面**: alerts、ai-analysis、bi、cockpit、iot、notifications、reports、supply-chain、workflow

**路由模式**: [router/routes/modules/hse-center.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-center.ts) —— **扁平结构**（非嵌套 children），每项独立路由，`meta.authority: ['admin']`。

**路由自动加载**: [router/routes/index.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/index.ts) 使用 `import.meta.glob('./modules/**/*.ts', { eager: true })`，新增路由文件放入 `modules/` 即自动生效，**无需修改 index.ts**。

**页面组件模板**（参考 [views/hse/reports/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/reports/index.vue)）:
- 使用 `<Page>` 容器组件
- 使用 Ant Design Vue 的 `Row/Col/Card`
- 复用 `components/hse/` 下的 StatCard、ImportButtonGroup 等

### 5. 数据库迁移目录 ✅

**位置**: [sql/](file:///f:/deploy/hse-dashboard/sql)

**现有迁移文件**: auth_schema.sql、migrate_*.sql、unified_schema.sql

**Sprint 1 新增**: `sql/v2_document_tables.sql` + `sql/v2_seed_data.sql`

**数据库连接**: [config/db.js](file:///f:/deploy/hse-dashboard/server/config/db.js) 导出 `pool`（pg 连接池）、`isConnected()`、`testConnection()`。

**模式**: 现有路由采用"连接可用走 PG，不可用走内存降级"双模式（见 training.js 第24行 `ensureTables`）。Sprint 1 为纯新增功能，**无需内存降级**，直接用 pool.query 即可，但建表 SQL 用 `IF NOT EXISTS` 保证幂等。

---

## 一、Sprint 1 目标范围

### 1.1 实现

| 序号 | 功能 | 说明 |
|------|------|------|
| 1 | 文件资料中心数据库 | 6张新表 + 种子数据 |
| 2 | 文件分类管理 | 多级分类树CRUD |
| 3 | 文件上传 | 支持PDF/Word/Excel/图片，复用upload.js |
| 4 | 文件列表 | 分页+按分类/类型/审核状态/关键词筛选 |
| 5 | 文件查询 | 文件详情、文件下载 |
| 6 | 文件审核状态 | review_status 流转（pending→approved/rejected） |

### 1.2 暂不实现

- ❌ AI 分析（Sprint 2）
- ❌ 标准自动匹配（Sprint 2，但 document_standard_relation 表 Sprint 1 建好）
- ❌ OCR（暂缓）
- ❌ PDF 解析（暂缓）

---

## 二、数据库变更

### 2.1 新增文件

**文件**: `sql/v2_document_tables.sql`

**作用**: 创建文件中心6张表

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| document_categories | 文件分类 | parent_id（多级树）、code（唯一） |
| document_tags | 文件标签 | name（唯一）、type（manual/auto） |
| document_files | 文件主表 | file_uuid、analysis_status、review_status、source_type、ai_summary、ai_score、review_user、review_time |
| document_tag_relation | 文件标签关联 | file_id + tag_id（联合唯一） |
| document_versions | 文件版本 | file_id、version_number、is_latest |
| document_standard_relation | 资料标准关联 | **clause_code（字符串，无外键）**、match_type |

**建表 SQL**: 完整内容见 [v2-final-implementation-plan.md](file:///f:/deploy/hse-dashboard/v2-final-implementation-plan.md) 第二章，包含：
- 所有表使用 `CREATE TABLE IF NOT EXISTS`（幂等）
- 所有表含 `id/created_at/updated_at/status/is_deleted`
- document_files 含审查意见要求的7个新字段
- document_standard_relation 使用 `clause_code VARCHAR(64)` 解除 Sprint 顺序依赖
- 完整 `COMMENT ON` 中文注释
- 完整索引（`CREATE INDEX IF NOT EXISTS`）

**执行方式**:
```bash
psql -U postgres -d safety_dashboard -f sql/v2_document_tables.sql
```

**文件**: `sql/v2_seed_data.sql`

**作用**: 初始化文件分类种子数据（6个一级分类）

**种子数据**:
| code | name |
|------|------|
| SAFETY_TRAINING | 安全教育培训 |
| INSPECTION | 安全检查记录 |
| EMERGENCY | 应急管理 |
| REGULATIONS | 规章制度 |
| RESPONSIBILITY | 安全责任 |
| VEHICLE_SAFETY | 车辆安全 |

### 2.2 修改文件

无。**不修改任何旧表，不 ALTER**。

### 2.3 影响范围

- 仅新增表，与旧表（file_records 等）完全隔离
- document_standard_relation 通过 clause_code 字符串与 Sprint 4 的 safety_standard_clauses.code 关联，无外键依赖

### 2.4 测试方法

```sql
-- 验证建表成功
SELECT tablename FROM pg_tables WHERE tablename LIKE 'document_%';
-- 验证种子数据
SELECT code, name FROM document_categories WHERE is_deleted = false;
-- 验证幂等（重复执行不报错）
-- 重新执行 v2_document_tables.sql 不报错
```

---

## 三、后端变更

### 3.1 新增文件

#### 文件1: `server/routes/hse-documents.js`

**作用**: 安全资料中心路由（文件CRUD/分类/标签/版本/审核）

**接口清单**:

| 方法 | 路径 | 说明 | 复用能力 |
|------|------|------|----------|
| POST | /upload | 文件上传 | createUploader(type:'all', subDir:'documents') + validateUploadedFile |
| GET | / | 文件列表 | pool 分页查询 |
| GET | /:id | 文件详情 | pool 查询 |
| DELETE | /:id | 文件删除 | pool 软删除 + deleteFile 删物理文件 |
| PUT | /:id | 文件更新（分类/标签） | pool 更新 |
| GET | /:id/download | 文件下载 | fs.createReadStream 流式响应 |
| POST | /:id/review | 文件审核 | pool UPDATE review_status + notificationService |
| GET | /categories | 分类树 | pool 递归查询 |
| POST | /categories | 创建分类 | pool INSERT |
| PUT | /categories/:id | 更新分类 | pool UPDATE |
| DELETE | /categories/:id | 删除分类 | pool 软删除 |
| GET | /tags | 标签列表 | pool 查询 |
| POST | /tags | 创建标签 | pool INSERT |
| GET | /:id/versions | 文件版本列表 | pool 查询 |

**实现要点**:
- 复用 `require('../middleware/upload')` 的 `createUploader`、`validateUploadedFile`、`getFileUrl`、`deleteFile`、`fixFilenameEncoding`
- 复用 `require('../middleware/response')` 的 `success`/`error`
- 复用 `require('../config/db')` 的 `pool`
- 复用 `require('../services/notificationService')` 推送审核通知
- 路由文件顶部 require 服务层 `documentService`

**上传接口实现逻辑**:
1. `createUploader({ type: 'all', subDir: 'documents' }).single('file')` 接收文件
2. `validateUploadedFile` 魔术字节校验（按实际扩展名映射 type）
3. 生成 file_uuid（复用 uuid 库）
4. INSERT document_files，设 `analysis_status='pending'`、`review_status='pending'`、`source_type='upload'`
5. 返回 `success(result, '上传成功')`

**审核接口实现逻辑**:
1. 接收 `{ review_status: 'approved'|'rejected', review_comment }`
2. UPDATE document_files SET review_status, review_user, review_time
3. 调用 notificationService 推送通知给上传人
4. 返回 `success(result, '审核完成')`

#### 文件2: `server/services/documentService.js`

**作用**: 文件管理业务逻辑层

**方法清单**:

| 方法 | 说明 | 数据操作 |
|------|------|----------|
| uploadFile(req) | 文件上传 | INSERT document_files |
| getFileList(params) | 文件列表 | SELECT + 分页 + 动态条件 |
| getFileDetail(id) | 文件详情 | SELECT by id + 关联分类/标签 |
| deleteFile(id) | 文件删除 | UPDATE is_deleted=true + deleteFile 删物理 |
| updateFile(id, data) | 更新文件 | UPDATE category_id + 标签关联 |
| downloadFile(req, res, id) | 文件下载 | fs.createReadStream + Content-Disposition |
| reviewFile(id, data, user) | 文件审核 | UPDATE review_status + 通知 |
| getCategoryTree() | 分类树 | SELECT 全部 + 内存构建树 |
| createCategory(data) | 创建分类 | INSERT |
| updateCategory(id, data) | 更新分类 | UPDATE |
| deleteCategory(id) | 删除分类 | UPDATE is_deleted=true |
| getTagList() | 标签列表 | SELECT |
| createTag(data) | 创建标签 | INSERT |
| getFileVersions(id) | 版本列表 | SELECT document_versions |
| addFileVersion(id, file) | 新增版本 | INSERT + UPDATE is_latest |

**实现要点**:
- 所有查询加 `WHERE is_deleted = false`
- 列表查询返回 `{ list, total }` 结构（对齐前端 requestClient 约定）
- 审核状态流转: `pending` → `approved`/`rejected`
- 下载接口设置 `Content-Disposition: attachment; filename="UTF-8''编码后文件名"`

### 3.2 修改文件

#### 文件: [server/app.js](file:///f:/deploy/hse-dashboard/server/app.js)

**修改原因**: 注册新路由

**修改位置**: 第297行附近（现有 HSE 路由挂载区域之后）

**修改内容**（仅新增2行 require + 1行挂载，不改动现有代码）:

```javascript
// 现有代码（第294-343行，不修改）
app.use('/api/auth', authRoutes);
// ... 其他现有挂载 ...
app.use('/api/hse/iot', iotRoutes);

// ===== V2 Sprint 1 新增 =====
const hseDocumentsRoutes = require('./routes/hse-documents');
app.use('/api/hse/documents', hseDocumentsRoutes);
```

**影响范围**: 仅新增 `/api/hse/documents` 路由前缀，现有路由完全不受影响。

### 3.3 不修改文件（红线）

| 文件 | 原因 |
|------|------|
| [server/middleware/upload.js](file:///f:/deploy/hse-dashboard/server/middleware/upload.js) | 仅复用，不修改 |
| [server/middleware/auth.js](file:///f:/deploy/hse-dashboard/server/middleware/auth.js) | 登录认证保护 |
| [server/middleware/response.js](file:///f:/deploy/hse-dashboard/server/middleware/response.js) | 仅复用 |
| [server/routes/auth.js](file:///f:/deploy/hse-dashboard/server/routes/auth.js) | 认证路由保护 |
| [server/services/aiService.js](file:///f:/deploy/hse-dashboard/server/services/aiService.js) | AI服务核心 |
| [server/config/db.js](file:///f:/deploy/hse-dashboard/server/config/db.js) | 数据库配置 |
| [server/package.json](file:///f:/deploy/hse-dashboard/server/package.json) | 禁止新增依赖 |
| 所有现有 routes/*.js | 现有业务路由 |

### 3.4 测试方法

```bash
# 1. 启动后端
cd server && npm run dev

# 2. 登录获取 token（复用现有登录）
curl -X POST http://localhost:5666/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"xxx"}'

# 3. 测试分类树
curl http://localhost:5666/api/hse/documents/categories -H "Authorization: Bearer <token>"

# 4. 测试文件上传
curl -X POST http://localhost:5666/api/hse/documents/upload -H "Authorization: Bearer <token>" -F "file=@test.pdf"

# 5. 测试文件列表
curl "http://localhost:5666/api/hse/documents?page=1&pageSize=20" -H "Authorization: Bearer <token>"

# 6. 测试文件审核
curl -X POST http://localhost:5666/api/hse/documents/1/review -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"review_status":"approved"}'

# 7. 回归测试：现有接口不受影响
curl http://localhost:5666/api/training/records -H "Authorization: Bearer <token>"
```

**自动化测试**: 参考 [__tests__/routes/](file:///f:/deploy/hse-dashboard/server/__tests__/routes) 现有测试模式，新增 `server/__tests__/routes/documents.test.js`，使用 Jest + Supertest。

---

## 四、前端变更

### 4.1 新增文件

#### 文件1: `router/routes/modules/hse-documents.ts`

**作用**: 安全资料中心路由配置

**结构**: 扁平结构（对齐 hse-center.ts 模式，非嵌套 children）

**路由项**:

| name | path | title | order | authority |
|------|------|-------|-------|-----------|
| HseDocumentsLibrary | /hse/documents/library | 文件库 | 20 | ['admin'] |
| HseDocumentsReview | /hse/documents/review | 文件审核 | 21 | ['admin'] |

**实现要点**:
- 复用 `import.meta.glob` 自动加载机制，放入 modules/ 即生效
- `meta.authority: ['admin']` 对齐现有权限模式
- `keepAlive: true` 启用缓存

#### 文件2: `api/hse/documents.ts`

**作用**: 文件管理 API 封装

**接口封装**:

| 函数 | 方法 | 路径 |
|------|------|------|
| getDocumentList | GET | /hse/documents |
| getDocumentDetail | GET | /hse/documents/:id |
| uploadDocument | POST | /hse/documents/upload（FormData） |
| deleteDocument | DELETE | /hse/documents/:id |
| updateDocument | PUT | /hse/documents/:id |
| downloadDocument | GET | /hse/documents/:id/download（Blob） |
| reviewDocument | POST | /hse/documents/:id/review |
| getCategoryTree | GET | /hse/documents/categories |
| createCategory | POST | /hse/documents/categories |
| updateCategory | PUT | /hse/documents/categories/:id |
| deleteCategory | DELETE | /hse/documents/categories/:id |
| getTagList | GET | /hse/documents/tags |
| createTag | POST | /hse/documents/tags |

**实现要点**:
- 复用 `requestClient` from `#/api/request`
- 上传用 `FormData` + `Content-Type: multipart/form-data`
- 下载用 `responseType: 'blob'`
- TypeScript 类型定义（namespace DocumentsApi）

#### 文件3: `views/hse/documents/library/index.vue`

**作用**: 文件库主页面

**布局**:
```
┌──────────────────────────────────────────────────────┐
│  文件库         搜索框  分类▾ 类型▾ 审核状态▾  [上传] │
├──────────┬───────────────────────────────────────────┤
│ 分类树   │  文件列表表格（a-table）                   │
│ (a-tree) │  文件名|类型|大小|分类|审核状态|上传时间|操作│
│          │  操作: 下载/详情/删除                      │
│          │  分页器                                    │
└──────────┴───────────────────────────────────────────┘
```

**组件使用**:
| 区域 | 组件 | 来源 |
|------|------|------|
| 页面容器 | `<Page>` | Vben 内置 |
| 分类树 | `a-tree` | Ant Design Vue |
| 搜索框 | `a-input-search` | Ant Design Vue |
| 筛选下拉 | `a-select` | Ant Design Vue |
| 上传按钮 | `a-button` | Ant Design Vue |
| 文件表格 | `a-table` | Ant Design Vue |
| 分页 | `a-pagination` | Ant Design Vue |
| 审核状态 | `a-tag`（颜色映射） | Ant Design Vue |
| 统计卡片 | `HseStatCard` | components/hse/（复用） |

**数据获取**: 使用 TanStack Query（`useQuery`）或组件内 `onMounted` 调用 API

#### 文件4: `views/hse/documents/library/components/UploadModal.vue`

**作用**: 文件上传弹窗（**页面内组件，非公共组件**）

**布局**:
```
┌─────────────────────────────────┐
│           上传文件              │
├─────────────────────────────────┤
│  [拖拽文件到此处]               │
│  或 [选择文件]                  │
│  支持 PDF/Word/Excel/图片       │
│                                 │
│  分类: [下拉选择]               │
│  标签: [输入标签]               │
│  备注: [文本框]                 │
│              [取消] [上传]      │
└─────────────────────────────────┘
```

**组件使用**:
| 区域 | 组件 | 来源 |
|------|------|------|
| 弹窗 | `a-modal` | Ant Design Vue |
| 拖拽上传 | `a-upload-dragger` | Ant Design Vue |
| 分类选择 | `a-tree-select` | Ant Design Vue |
| 标签输入 | `a-select`（mode=tags） | Ant Design Vue |

#### 文件5: `views/hse/documents/review/index.vue`

**作用**: 文件审核页面

**布局**:
```
┌──────────────────────────────────────────────────────┐
│  文件审核           状态: [待审核▾]  [批量通过]       │
├──────────────────────────────────────────────────────┤
│  待审核文件表格                                       │
│  文件名|类型|分类|上传人|上传时间|AI摘要|AI评分|操作   │
│  操作: 通过/驳回/查看详情                             │
└──────────────────────────────────────────────────────┘
```

### 4.2 修改文件

#### 文件: `locales/langs/zh-CN/hse.json`（如存在）或对应国际化文件

**修改原因**: 新增菜单文案

**修改内容**:
```json
{
  "documents": {
    "title": "安全资料中心",
    "library": "文件库",
    "review": "文件审核",
    "upload": "上传文件",
    "search": "搜索文件",
    "category": "分类",
    "tags": "标签",
    "reviewStatus": "审核状态",
    "approved": "已通过",
    "rejected": "已驳回",
    "pending": "待审核"
  }
}
```

**影响范围**: 仅新增文案键，不影响现有文案。

### 4.3 不修改文件（红线）

| 文件 | 原因 |
|------|------|
| `packages/` 全部 | Vben 核心保护 |
| `store/auth.ts` | 登录认证保护 |
| `api/core/auth.ts` | 认证API保护 |
| `views/_core/authentication/` | 登录页面保护 |
| `router/access.ts`、`router/guard.ts` | 路由权限/守卫保护 |
| `api/request.ts` | 仅复用 |
| `components/hse/` 现有组件 | 仅复用 |
| `package.json` | 禁止新增依赖 |

### 4.4 测试方法

```bash
# 1. 启动前端
cd 安全看板vben && pnpm dev:antd

# 2. 登录系统（确认登录正常）

# 3. 验证菜单出现"文件库""文件审核"

# 4. 文件库页面：
#    - 分类树展示
#    - 上传文件（拖拽/选择）
#    - 文件列表分页
#    - 按分类/类型/状态筛选
#    - 文件下载
#    - 文件删除

# 5. 文件审核页面：
#    - 待审核列表
#    - 审核通过
#    - 审核驳回
#    - 通知推送

# 6. 回归测试：现有页面全部正常
```

---

## 五、变更汇总

### 5.1 文件变更总表

| 类型 | 文件 | 操作 | 说明 |
|------|------|------|------|
| 数据库 | sql/v2_document_tables.sql | 新增 | 6张表建表SQL |
| 数据库 | sql/v2_seed_data.sql | 新增 | 分类种子数据 |
| 后端 | server/routes/hse-documents.js | 新增 | 文件管理路由 |
| 后端 | server/services/documentService.js | 新增 | 文件管理服务 |
| 后端 | server/app.js | 修改 | 新增2行require+1行挂载 |
| 前端 | router/routes/modules/hse-documents.ts | 新增 | 路由配置 |
| 前端 | api/hse/documents.ts | 新增 | API封装 |
| 前端 | views/hse/documents/library/index.vue | 新增 | 文件库页面 |
| 前端 | views/hse/documents/library/components/UploadModal.vue | 新增 | 上传弹窗 |
| 前端 | views/hse/documents/review/index.vue | 新增 | 审核页面 |
| 前端 | locales/.../hse.json | 修改 | 新增文案 |

### 5.2 复用清单

| 复用项 | 来源 | 用途 |
|--------|------|------|
| createUploader | upload.js | 文件上传 |
| validateUploadedFile | upload.js | 魔术字节校验 |
| getFileUrl/deleteFile | upload.js | URL生成/文件删除 |
| success/error | response.js | 统一响应 |
| pool | config/db.js | 数据库查询 |
| requestClient | api/request.ts | 前端HTTP |
| notificationService | services/ | 审核通知 |
| `<Page>` | Vben内置 | 页面容器 |
| HseStatCard | components/hse/ | 统计卡片 |
| a-table/a-tree/a-upload | Ant Design Vue | UI组件 |

### 5.3 新增依赖

**无**。全部使用现有依赖（express、multer、pg、uuid、xlsx）。

---

## 六、验收标准

### 6.1 功能验收

- [ ] 数据库6张表创建成功，种子数据写入
- [ ] 文件上传成功（PDF/Word/Excel/图片），魔术字节校验生效
- [ ] 文件列表分页展示，支持按分类/类型/审核状态/关键词筛选
- [ ] 文件详情查看正常
- [ ] 文件下载正常
- [ ] 文件删除（软删除）正常
- [ ] 文件分类树展示和CRUD正常
- [ ] 文件标签管理正常
- [ ] 文件审核状态流转正常（pending→approved/rejected）
- [ ] 审核通知推送正常

### 6.2 约束验收

- [ ] 登录功能 100% 正常
- [ ] 现有所有页面正常访问
- [ ] 现有所有API正常响应
- [ ] server/package.json 未变（无新增依赖）
- [ ] 未修改 packages/ 任何文件
- [ ] 未修改 auth 相关任何文件
- [ ] 未修改 upload.js、response.js、auth.js
- [ ] API 响应格式为 `{ code: 0, success: true, data }`
- [ ] 旧表无 ALTER（仅 CREATE TABLE）
- [ ] 新表含 id/created_at/updated_at/status/is_deleted + 审查意见7字段

---

**等待确认后开始编码实施。**
