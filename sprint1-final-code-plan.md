# HSE V2.0 Sprint 1 最终冻结版代码计划

## 〇、冻结说明

本文档为 Sprint 1 开发冻结版，在 `sprint1-code-change-plan.md` 基础上整合5项修正：

| 修正项 | 内容 |
|--------|------|
| 修正1 | 文件分类调整为环卫安全资料14个一级分类 |
| 修正2 | document_files 增加 valid_start_date / valid_end_date / remind_days |
| 修正3 | Sprint 1 暂不开发：文件版本管理页面、AI分析页面、标准自动关联页面（数据库预留） |
| 修正4 | 审核接口增加角色校验，仅 admin + safety_manager 可审核 |
| 修正5 | 严格遵守红线：不改 packages/auth/JWT/login/upload.js/response.js，不新增依赖 |

**冻结后变更范围不再扩大，严格按本计划编码。**

---

## 一、红线约束（不可逾越）

### 1.1 禁止修改文件

| 文件 | 原因 |
|------|------|
| `安全看板vben/packages/` 全部 | Vben 核心保护 |
| `server/middleware/auth.js` | JWT 认证保护（**仅复用 requireRole，不修改**） |
| `server/routes/auth.js` | 认证路由保护 |
| `安全看板vben/.../store/auth.ts` | 前端认证状态 |
| `安全看板vben/.../views/_core/authentication/` | 登录页面 |
| `安全看板vben/.../router/access.ts`、`router/guard.ts` | 路由权限/守卫 |
| `server/middleware/upload.js` | 上传中间件（**仅复用，不修改**） |
| `server/middleware/response.js` | 响应格式（**仅复用，不修改**） |
| `server/services/aiService.js` | AI 服务（仅调用，不修改） |
| `server/config/db.js` | 数据库配置 |
| `server/package.json` | 禁止新增依赖 |
| 所有现有 `server/routes/*.js` | 现有业务路由 |
| 所有旧数据库表 | 仅 CREATE TABLE 新表，不 ALTER |

### 1.2 角色校验方案（修正4）

**复用现有能力**: [auth.js](file:///f:/deploy/hse-dashboard/server/middleware/auth.js) 第201行已导出 `requireRole(...allowedRoles)` 中间件，**无需新增任何中间件**。

**使用方式**:
```javascript
const { requireRole } = require('../middleware/auth');

// 审核接口仅允许 admin 和 safety_manager
router.post('/:id/review', requireRole('admin', 'safety_manager'), async (req, res) => {
  // 审核逻辑
});
```

**权限矩阵**:

| 接口 | 允许角色 | 说明 |
|------|----------|------|
| POST /upload | 所有登录用户 | 任何登录用户可上传 |
| GET / | 所有登录用户 | 任何登录用户可查看列表 |
| GET /:id | 所有登录用户 | 任何登录用户可查看详情 |
| GET /:id/download | 所有登录用户 | 任何登录用户可下载 |
| DELETE /:id | admin, safety_manager | 仅管理员/安全主管可删除 |
| PUT /:id | admin, safety_manager | 仅管理员/安全主管可更新 |
| **POST /:id/review** | **admin, safety_manager** | **仅管理员/安全主管可审核** |
| 分类/标签 CRUD | admin, safety_manager | 仅管理员/安全主管可管理 |

---

## 二、数据库变更

### 2.1 新增文件

#### 文件1: `sql/v2_document_tables.sql`

**作用**: 创建文件中心6张表（含修正2新增字段）

**建表 SQL**（幂等，IF NOT EXISTS）:

```sql
-- ============================================================
-- V2 文件分类表
-- ============================================================
CREATE TABLE IF NOT EXISTS document_categories (
    id           BIGSERIAL    PRIMARY KEY,
    parent_id    BIGINT       REFERENCES document_categories(id),
    code         VARCHAR(64)  NOT NULL,
    name         VARCHAR(128) NOT NULL,
    description  VARCHAR(512),
    icon         VARCHAR(64),
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    status       VARCHAR(16)  NOT NULL DEFAULT 'active',
    created_by   VARCHAR(64),
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by   VARCHAR(64),
    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted   BOOLEAN      NOT NULL DEFAULT false
);
COMMENT ON TABLE document_categories IS 'V2-文件分类表（环卫安全资料分类）';
COMMENT ON COLUMN document_categories.code IS '分类编码（唯一）';
CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_category_code ON document_categories (code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_doc_category_parent ON document_categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_doc_category_status ON document_categories (status);

-- ============================================================
-- V2 文件标签表
-- ============================================================
CREATE TABLE IF NOT EXISTS document_tags (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(64)  NOT NULL,
    color       VARCHAR(16),
    type        VARCHAR(16)  NOT NULL DEFAULT 'manual',
    usage_count INTEGER      NOT NULL DEFAULT 0,
    status      VARCHAR(16)  NOT NULL DEFAULT 'active',
    created_by  VARCHAR(64),
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted  BOOLEAN      NOT NULL DEFAULT false
);
COMMENT ON TABLE document_tags IS 'V2-文件标签表（人工+AI标签）';
CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_tag_name ON document_tags (name) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_doc_tag_type ON document_tags (type);

-- ============================================================
-- V2 文件主表（含审查意见字段 + 修正2有效期字段）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_files (
    id                  BIGSERIAL    PRIMARY KEY,
    file_uuid           VARCHAR(36)  NOT NULL,
    original_name       VARCHAR(256) NOT NULL,
    storage_name        VARCHAR(128) NOT NULL,
    file_path           VARCHAR(512) NOT NULL,
    file_url            VARCHAR(512),
    file_size           BIGINT       NOT NULL,
    file_type           VARCHAR(32)  NOT NULL,
    mime_type           VARCHAR(128) NOT NULL,
    category_id         BIGINT       REFERENCES document_categories(id),
    summary             TEXT,
    content_text        TEXT,
    analysis_status     VARCHAR(16)  NOT NULL DEFAULT 'pending',
    completeness_score  DECIMAL(5,2),
    risk_level          VARCHAR(16),
    -- 审查意见字段 ↓
    source_type         VARCHAR(32)  NOT NULL DEFAULT 'upload',
    source_id           VARCHAR(64),
    review_status       VARCHAR(16)  NOT NULL DEFAULT 'pending',
    ai_summary          TEXT,
    ai_score            DECIMAL(5,2),
    review_user         VARCHAR(64),
    review_time         TIMESTAMP,
    -- 审查意见字段 ↑
    -- 修正2 有效期字段 ↓
    valid_start_date    DATE,                       -- 有效期开始日期
    valid_end_date      DATE,                       -- 有效期结束日期
    remind_days         INTEGER      DEFAULT 30,    -- 到期前提醒天数
    -- 修正2 有效期字段 ↑
    status              VARCHAR(16)  NOT NULL DEFAULT 'active',
    uploaded_by         VARCHAR(64)  NOT NULL,
    uploaded_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT false,
    metadata            JSONB        NOT NULL DEFAULT '{}'
);
COMMENT ON TABLE  document_files IS 'V2-文件主表（含来源/审核/AI/有效期字段）';
COMMENT ON COLUMN document_files.source_type      IS '来源类型: upload/import/system/sync';
COMMENT ON COLUMN document_files.review_status    IS '审核状态: pending/approved/rejected';
COMMENT ON COLUMN document_files.ai_summary       IS 'AI生成的文件摘要';
COMMENT ON COLUMN document_files.ai_score         IS 'AI评分(0-100)';
COMMENT ON COLUMN document_files.valid_start_date IS '有效期开始日期';
COMMENT ON COLUMN document_files.valid_end_date   IS '有效期结束日期';
COMMENT ON COLUMN document_files.remind_days      IS '到期前提醒天数(默认30)';
CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_file_uuid ON document_files (file_uuid);
CREATE INDEX IF NOT EXISTS idx_doc_file_category ON document_files (category_id);
CREATE INDEX IF NOT EXISTS idx_doc_file_type ON document_files (file_type);
CREATE INDEX IF NOT EXISTS idx_doc_file_analysis ON document_files (analysis_status);
CREATE INDEX IF NOT EXISTS idx_doc_file_review ON document_files (review_status);
CREATE INDEX IF NOT EXISTS idx_doc_file_source ON document_files (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_doc_file_valid_end ON document_files (valid_end_date);

-- ============================================================
-- V2 文件标签关联表
-- ============================================================
CREATE TABLE IF NOT EXISTS document_tag_relation (
    id         BIGSERIAL PRIMARY KEY,
    file_id    BIGINT    NOT NULL REFERENCES document_files(id),
    tag_id     BIGINT    NOT NULL REFERENCES document_tags(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_tag_rel ON document_tag_relation (file_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_doc_tag_rel_file ON document_tag_relation (file_id);
CREATE INDEX IF NOT EXISTS idx_doc_tag_rel_tag ON document_tag_relation (tag_id);

-- ============================================================
-- V2 文件版本表（Sprint1 仅建表预留，不开发页面）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_versions (
    id                  BIGSERIAL    PRIMARY KEY,
    file_id             BIGINT       NOT NULL REFERENCES document_files(id),
    version_number      VARCHAR(32)  NOT NULL,
    version_description VARCHAR(512),
    storage_name        VARCHAR(128) NOT NULL,
    file_path           VARCHAR(512) NOT NULL,
    file_size           BIGINT       NOT NULL,
    is_latest           BOOLEAN      NOT NULL DEFAULT true,
    status              VARCHAR(16)  NOT NULL DEFAULT 'active',
    created_by          VARCHAR(64)  NOT NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT false
);
COMMENT ON TABLE document_versions IS 'V2-文件版本表（Sprint1仅建表预留）';
CREATE INDEX IF NOT EXISTS idx_doc_ver_file ON document_versions (file_id);

-- ============================================================
-- V2 资料与标准关联表（Sprint1 仅建表预留，不开发页面；clause_code 无外键）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_standard_relation (
    id               BIGSERIAL    PRIMARY KEY,
    file_id          BIGINT       NOT NULL REFERENCES document_files(id),
    clause_code      VARCHAR(64)  NOT NULL,
    clause_name      VARCHAR(256),
    match_type       VARCHAR(16)  NOT NULL DEFAULT 'auto',
    match_confidence DECIMAL(5,2),
    status           VARCHAR(16)  NOT NULL DEFAULT 'valid',
    verified_by      VARCHAR(64),
    verified_at      TIMESTAMP,
    remark           VARCHAR(512),
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted       BOOLEAN      NOT NULL DEFAULT false
);
COMMENT ON TABLE document_standard_relation IS 'V2-资料标准关联表（Sprint1仅建表预留，clause_code关联）';
CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_std_rel ON document_standard_relation (file_id, clause_code);
CREATE INDEX IF NOT EXISTS idx_doc_std_rel_file ON document_standard_relation (file_id);
CREATE INDEX IF NOT EXISTS idx_doc_std_rel_code ON document_standard_relation (clause_code);
```

#### 文件2: `sql/v2_seed_data.sql`

**作用**: 初始化环卫安全资料14个一级分类（修正1）

```sql
-- ============================================================
-- V2 文件分类种子数据（环卫安全资料14个一级分类）
-- ============================================================
INSERT INTO document_categories (code, name, description, sort_order) VALUES
    ('RESPONSIBILITY',    '安全责任制',     '安全生产责任体系相关资料', 1),
    ('REGULATIONS',       '安全制度',       '安全管理制度、操作规程', 2),
    ('TRAINING',          '安全培训',       '安全教育培训计划、记录、考核', 3),
    ('HAZARD_INSPECTION', '隐患排查',       '隐患排查治理记录', 4),
    ('RISK_CONTROL',      '风险管控',       '风险辨识、评估、管控资料', 5),
    ('EMERGENCY',         '应急管理',       '应急预案、演练、评估', 6),
    ('VEHICLE_SAFETY',    '车辆安全',       '车辆安全管理制度、记录', 7),
    ('SANITATION_SAFETY', '环卫作业安全',   '环卫作业安全规程、记录', 8),
    ('FIRE_SAFETY',       '消防安全',       '消防管理资料', 9),
    ('OCCUPATIONAL_HEALTH','职业健康',      '职业健康检查、防护资料', 10),
    ('SPECIAL_EQUIPMENT', '特种设备',       '特种设备管理资料', 11),
    ('ACCIDENT_MANAGEMENT','事故管理',      '事故报告、调查、处理资料', 12),
    ('INSPECTION_DATA',   '检查资料',       '各类安全检查资料', 13),
    ('GOVERNMENT_SUPERVISION','政府监管资料','政府监管部门文件、整改', 14)
ON CONFLICT DO NOTHING;

-- 初始化常用标签
INSERT INTO document_tags (name, color, type) VALUES
    ('2026年度', '#1890ff', 'manual'),
    ('重要', '#ff4d4f', 'manual'),
    ('待完善', '#faad14', 'manual')
ON CONFLICT DO NOTHING;
```

**执行方式**:
```bash
psql -U postgres -d safety_dashboard -f sql/v2_document_tables.sql
psql -U postgres -d safety_dashboard -f sql/v2_seed_data.sql
```

### 2.2 修改文件

无。**不修改任何旧表，不 ALTER**。

### 2.3 测试方法

```sql
-- 验证6张表创建
SELECT tablename FROM pg_tables WHERE tablename LIKE 'document_%' ORDER BY tablename;
-- 应返回: document_categories, document_files, document_standard_relation, document_tag_relation, document_tags, document_versions

-- 验证14个分类种子数据
SELECT code, name, sort_order FROM document_categories WHERE is_deleted = false ORDER BY sort_order;
-- 应返回14行

-- 验证有效期字段
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'document_files' AND column_name IN ('valid_start_date','valid_end_date','remind_days');
-- 应返回3行

-- 验证幂等（重复执行不报错）
```

---

## 三、后端变更

### 3.1 新增文件

#### 文件1: `server/routes/hse-documents.js`

**作用**: 安全资料中心路由

**接口清单**（含角色校验）:

| 方法 | 路径 | 说明 | 角色要求 |
|------|------|------|----------|
| POST | /upload | 文件上传 | 所有登录用户 |
| GET | / | 文件列表 | 所有登录用户 |
| GET | /:id | 文件详情 | 所有登录用户 |
| GET | /:id/download | 文件下载 | 所有登录用户 |
| DELETE | /:id | 文件删除 | admin, safety_manager |
| PUT | /:id | 文件更新 | admin, safety_manager |
| POST | /:id/review | **文件审核** | **admin, safety_manager** |
| GET | /categories | 分类树 | 所有登录用户 |
| POST | /categories | 创建分类 | admin, safety_manager |
| PUT | /categories/:id | 更新分类 | admin, safety_manager |
| DELETE | /categories/:id | 删除分类 | admin, safety_manager |
| GET | /tags | 标签列表 | 所有登录用户 |
| POST | /tags | 创建标签 | admin, safety_manager |
| GET | /stats | 文件统计 | 所有登录用户 |

**实现要点**:

1. **复用上传中间件**（不修改 upload.js）:
```javascript
const { createUploader, validateUploadedFile, getFileUrl, deleteFile, fixFilenameEncoding } = require('../middleware/upload');
// 自建上传器支持所有类型
const documentUploader = createUploader({ type: 'all', subDir: 'documents' });
```

2. **复用角色校验**（不修改 auth.js）:
```javascript
const { requireRole } = require('../middleware/auth');
// 审核接口仅 admin + safety_manager
router.post('/:id/review', requireRole('admin', 'safety_manager'), async (req, res) => {...});
```

3. **复用响应格式**（不修改 response.js）:
```javascript
const { success, error } = require('../middleware/response');
res.json(success(data, '操作成功'));
res.json(error(-1, '操作失败'));
```

4. **复用数据库连接**:
```javascript
const { pool } = require('../config/db');
```

5. **审核接口实现逻辑**:
```javascript
router.post('/:id/review', requireRole('admin', 'safety_manager'), async (req, res) => {
  // 1. 校验 review_status 值（approved/rejected）
  // 2. UPDATE document_files SET review_status, review_user=req.user.username, review_time=NOW()
  // 3. 调用 notificationService 推送通知给上传人（仅调用，不修改）
  // 4. 返回 success()
});
```

6. **文件上传支持有效期字段**（修正2）:
```javascript
router.post('/upload', documentUploader.single('file'), async (req, res) => {
  // 接收 valid_start_date, valid_end_date, remind_days（可选）
  // INSERT document_files 含有效期字段
});
```

#### 文件2: `server/services/documentService.js`

**作用**: 文件管理业务逻辑层

**方法清单**:

| 方法 | 说明 | 角色校验位置 |
|------|------|--------------|
| uploadFile(req) | 文件上传（含有效期字段） | 路由层 |
| getFileList(params) | 文件列表（分页+筛选） | 路由层 |
| getFileDetail(id) | 文件详情 | 路由层 |
| deleteFile(id) | 文件删除（软删除+物理删除） | 路由层 requireRole |
| updateFile(id, data) | 更新文件（含有效期字段） | 路由层 requireRole |
| downloadFile(req, res, id) | 文件下载 | 路由层 |
| reviewFile(id, data, user) | 文件审核 | 路由层 requireRole |
| getCategoryTree() | 分类树 | - |
| createCategory(data) | 创建分类 | 路由层 requireRole |
| updateCategory(id, data) | 更新分类 | 路由层 requireRole |
| deleteCategory(id) | 删除分类 | 路由层 requireRole |
| getTagList() | 标签列表 | - |
| createTag(data) | 创建标签 | 路由层 requireRole |
| getFileStats() | 文件统计（按分类/类型/审核状态） | - |

**实现要点**:
- 所有查询加 `WHERE is_deleted = false`
- 列表查询返回 `{ list, total }` 结构
- 文件列表支持按 `review_status`、`category_id`、`file_type`、`keyword`、有效期状态筛选
- 审核状态流转: `pending` → `approved`/`rejected`
- 审核时调用 `require('../services/notificationService')` 推送通知
- 有效期提醒: 查询 `valid_end_date - remind_days <= CURRENT_DATE` 的文件

### 3.2 修改文件

#### 文件: [server/app.js](file:///f:/deploy/hse-dashboard/server/app.js)

**修改原因**: 注册新路由

**修改位置**: 第343行附近（现有 HSE 路由挂载区域之后）

**修改内容**（仅新增2行，不改动现有代码）:

```javascript
// 现有代码（不修改）
app.use('/api/hse/iot', iotRoutes);

// ===== V2 Sprint 1 新增 =====
const hseDocumentsRoutes = require('./routes/hse-documents');
app.use('/api/hse/documents', hseDocumentsRoutes);
```

**影响范围**: 仅新增 `/api/hse/documents` 路由前缀，现有路由完全不受影响。JWT 认证由 [app.js 第205行](file:///f:/deploy/hse-dashboard/server/app.js#L205) `app.use('/api', authMiddleware)` 统一拦截，新路由自动受保护。

### 3.3 不修改文件（红线）

见第一章 1.1 节。

### 3.4 测试方法

```bash
# 1. 启动后端
cd server && npm run dev

# 2. 登录获取 token（admin 用户）
TOKEN=$(curl -s -X POST http://localhost:5666/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"xxx"}' | jq -r '.data.token')

# 3. 测试分类树（应返回14个分类）
curl -s http://localhost:5666/api/hse/documents/categories -H "Authorization: Bearer $TOKEN" | jq

# 4. 测试文件上传（含有效期字段）
curl -s -X POST http://localhost:5666/api/hse/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdf" \
  -F "valid_start_date=2026-01-01" \
  -F "valid_end_date=2027-01-01" \
  -F "remind_days=30" | jq

# 5. 测试文件列表
curl -s "http://localhost:5666/api/hse/documents?page=1&pageSize=20&review_status=pending" \
  -H "Authorization: Bearer $TOKEN" | jq

# 6. 测试文件审核（admin 角色可审核）
curl -s -X POST http://localhost:5666/api/hse/documents/1/review \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"review_status":"approved","review_comment":"资料完整"}' | jq

# 7. 角色校验测试（普通用户审核应返回403）
# 用普通用户token调用审核接口，应返回 code:403

# 8. 回归测试（现有接口不受影响）
curl -s http://localhost:5666/api/training/records -H "Authorization: Bearer $TOKEN" | jq '.code'
# 应返回 0
```

**自动化测试**: 新增 `server/__tests__/routes/documents.test.js`，使用 Jest + Supertest，参考现有测试模式。

---

## 四、前端变更

### 4.1 新增文件

#### 文件1: `router/routes/modules/hse-documents.ts`

**作用**: 安全资料中心路由配置

**结构**: 扁平结构（对齐 hse-center.ts 模式）

**路由项**（修正3：仅2个页面，不含版本管理/AI分析/标准关联页面）:

| name | path | title | order | authority |
|------|------|-------|-------|-----------|
| HseDocumentsLibrary | /hse/documents/library | 文件库 | 20 | ['admin'] |
| HseDocumentsReview | /hse/documents/review | 文件审核 | 21 | ['admin'] |

#### 文件2: `api/hse/documents.ts`

**作用**: 文件管理 API 封装

**接口封装**:

| 函数 | 方法 | 路径 | TypeScript类型 |
|------|------|------|----------------|
| getDocumentList | GET | /hse/documents | params: DocumentListParams |
| getDocumentDetail | GET | /hse/documents/:id | - |
| uploadDocument | POST | /hse/documents/upload | FormData |
| deleteDocument | DELETE | /hse/documents/:id | - |
| updateDocument | PUT | /hse/documents/:id | data |
| downloadDocument | GET | /hse/documents/:id/download | responseType: blob |
| reviewDocument | POST | /hse/documents/:id/review | data: ReviewParams |
| getCategoryTree | GET | /hse/documents/categories | - |
| createCategory | POST | /hse/documents/categories | data |
| updateCategory | PUT | /hse/documents/categories/:id | data |
| deleteCategory | DELETE | /hse/documents/categories/:id | - |
| getTagList | GET | /hse/documents/tags | - |
| createTag | POST | /hse/documents/tags | data |
| getDocumentStats | GET | /hse/documents/stats | - |

**类型定义**（含修正2有效期字段）:

```typescript
export namespace DocumentsApi {
  export interface DocumentFile {
    id: number;
    fileUuid: string;
    originalName: string;
    fileType: string;
    fileSize: number;
    categoryId?: number;
    categoryName?: string;
    reviewStatus: 'pending' | 'approved' | 'rejected';
    reviewUser?: string;
    reviewTime?: string;
    analysisStatus: 'pending' | 'analyzing' | 'completed' | 'failed';
    aiSummary?: string;
    aiScore?: number;
    validStartDate?: string;      // 修正2: 有效期开始
    validEndDate?: string;        // 修正2: 有效期结束
    remindDays?: number;          // 修正2: 提醒天数
    uploadedBy: string;
    uploadedAt: string;
    tags?: string[];
  }
  export interface DocumentListParams {
    page?: number;
    pageSize?: number;
    categoryId?: number;
    fileType?: string;
    reviewStatus?: string;
    keyword?: string;
    validStatus?: string;  // valid/expiring/expired
  }
  export interface ReviewParams {
    reviewStatus: 'approved' | 'rejected';
    reviewComment?: string;
  }
}
```

#### 文件3: `views/hse/documents/library/index.vue`

**作用**: 文件库主页面

**布局**:
```
┌──────────────────────────────────────────────────────────────┐
│  统计卡片: 总文件数 | 待审核 | 已通过 | 即将过期              │
├──────────┬───────────────────────────────────────────────────┤
│ 分类树   │  搜索框  类型▾ 审核状态▾ 有效期状态▾  [上传文件]   │
│ (14分类) │  文件列表表格（a-table）                           │
│          │  文件名|类型|大小|分类|审核状态|有效期|上传时间|操作│
│          │  操作: 下载/详情/删除                              │
│          │  分页器                                            │
└──────────┴───────────────────────────────────────────────────┘
```

**组件使用**:
| 区域 | 组件 | 来源 |
|------|------|------|
| 页面容器 | `<Page>` | Vben 内置 |
| 统计卡片 | `HseStatCard` | components/hse/（复用） |
| 分类树 | `a-tree` | Ant Design Vue |
| 搜索框 | `a-input-search` | Ant Design Vue |
| 筛选下拉 | `a-select` | Ant Design Vue |
| 上传按钮 | `a-button` | Ant Design Vue |
| 文件表格 | `a-table` | Ant Design Vue |
| 审核状态 | `a-tag`（颜色: pending黄/approved绿/rejected红） | Ant Design Vue |
| 有效期状态 | `a-tag`（valid绿/expiring橙/expired红） | Ant Design Vue |
| 分页 | `a-pagination` | Ant Design Vue |

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
│  分类: [下拉选择(14分类)]       │
│  标签: [输入标签]               │
│  有效期: [开始日期] - [结束日期]│
│  提醒天数: [30]                 │
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
| 有效期 | `a-range-picker` | Ant Design Vue |
| 提醒天数 | `a-input-number` | Ant Design Vue |

#### 文件5: `views/hse/documents/review/index.vue`

**作用**: 文件审核页面

**布局**:
```
┌──────────────────────────────────────────────────────────────┐
│  文件审核           状态: [待审核▾]  [批量通过] [批量驳回]   │
├──────────────────────────────────────────────────────────────┤
│  待审核文件表格                                               │
│  文件名|类型|分类|上传人|上传时间|AI摘要|AI评分|有效期|操作   │
│  操作: 通过/驳回/查看详情                                     │
│                                                              │
│  审核弹窗（点击通过/驳回时弹出）:                             │
│  ┌─────────────────────────────┐                             │
│  │ 审核意见: [文本框]          │                             │
│  │        [取消] [确认审核]    │                             │
│  └─────────────────────────────┘                             │
└──────────────────────────────────────────────────────────────┘
```

**权限控制**: 前端根据用户角色（admin/safety_manager）显示审核按钮，普通用户仅查看。但**后端 requireRole 是最终防线**，前端控制仅为体验优化。

### 4.2 修改文件

#### 文件: `locales/langs/zh-CN/hse.json`（如存在）或对应国际化文件

**修改原因**: 新增菜单文案

**新增内容**:
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
    "validDate": "有效期",
    "validStartDate": "有效期开始",
    "validEndDate": "有效期结束",
    "remindDays": "提醒天数",
    "reviewStatus": "审核状态",
    "reviewComment": "审核意见",
    "approved": "已通过",
    "rejected": "已驳回",
    "pending": "待审核",
    "valid": "有效",
    "expiring": "即将过期",
    "expired": "已过期"
  }
}
```

### 4.3 不修改文件（红线）

见第一章 1.1 节。

### 4.4 测试方法

```bash
# 1. 启动前端
cd 安全看板vben && pnpm dev:antd

# 2. 登录系统（admin 用户，确认登录正常）

# 3. 验证菜单出现"文件库""文件审核"

# 4. 文件库页面测试:
#    - 分类树展示14个环卫分类
#    - 统计卡片展示
#    - 上传文件（拖拽/选择，含有效期字段）
#    - 文件列表分页
#    - 按分类/类型/审核状态/有效期状态筛选
#    - 文件下载
#    - 文件删除（admin/safety_manager 可见按钮）

# 5. 文件审核页面测试:
#    - 待审核列表
#    - 审核通过（填写审核意见）
#    - 审核驳回
#    - 通知推送
#    - 普通用户访问审核页面（按钮不可见或提示无权限）

# 6. 回归测试: 现有页面全部正常访问
```

---

## 五、修正项落实清单

| 修正项 | 落实位置 | 状态 |
|--------|----------|------|
| 修正1: 14个环卫分类 | sql/v2_seed_data.sql | ✅ 已写入 |
| 修正2: 有效期3字段 | document_files 表 + 前端上传弹窗 + 列表展示 | ✅ 已规划 |
| 修正3: 暂不开发3页面 | 路由仅2项（文件库+审核），版本/AI/标准表仅建表 | ✅ 已规划 |
| 修正4: 审核角色校验 | 路由用 requireRole('admin','safety_manager') | ✅ 已规划 |
| 修正5: 红线遵守 | 全程仅复用 upload.js/response.js/auth.js，不修改 | ✅ 已确认 |

---

## 六、变更汇总

### 6.1 文件变更总表

| 类型 | 文件 | 操作 | 说明 |
|------|------|------|------|
| 数据库 | sql/v2_document_tables.sql | 新增 | 6张表（含有效期字段，版本/标准表预留） |
| 数据库 | sql/v2_seed_data.sql | 新增 | 14个环卫分类 + 常用标签 |
| 后端 | server/routes/hse-documents.js | 新增 | 14个接口（含角色校验） |
| 后端 | server/services/documentService.js | 新增 | 文件管理服务 |
| 后端 | server/app.js | 修改 | 新增2行（require+挂载） |
| 前端 | router/routes/modules/hse-documents.ts | 新增 | 2个路由 |
| 前端 | api/hse/documents.ts | 新增 | 14个API封装 |
| 前端 | views/hse/documents/library/index.vue | 新增 | 文件库页面 |
| 前端 | views/hse/documents/library/components/UploadModal.vue | 新增 | 上传弹窗 |
| 前端 | views/hse/documents/review/index.vue | 新增 | 审核页面 |
| 前端 | locales/.../hse.json | 修改 | 新增文案 |

### 6.2 复用清单（零新增依赖）

| 复用项 | 来源 | 用途 |
|--------|------|------|
| createUploader | upload.js | 文件上传 |
| validateUploadedFile | upload.js | 魔术字节校验 |
| getFileUrl/deleteFile | upload.js | URL/删除 |
| fixFilenameEncoding | upload.js | 文件名编码 |
| **requireRole** | **auth.js** | **角色校验（不修改auth.js）** |
| success/error | response.js | 统一响应 |
| pool | config/db.js | 数据库 |
| requestClient | api/request.ts | 前端HTTP |
| notificationService | services/ | 审核通知 |
| `<Page>` | Vben内置 | 页面容器 |
| HseStatCard | components/hse/ | 统计卡片 |
| a-table/a-tree/a-upload | Ant Design Vue | UI组件 |

### 6.3 暂不开发（数据库已预留）

| 模块 | 数据库表 | 开发Sprint |
|------|----------|------------|
| 文件版本管理页面 | document_versions ✅已建 | 后续Sprint |
| AI分析页面 | document_analysis（Sprint2建） | Sprint 2 |
| 标准自动关联页面 | document_standard_relation ✅已建 | Sprint 2 |

---

## 七、验收标准

### 7.1 功能验收

- [ ] 数据库6张表创建成功
- [ ] 14个环卫分类种子数据写入
- [ ] document_files 含 valid_start_date/valid_end_date/remind_days 字段
- [ ] 文件上传成功（PDF/Word/Excel/图片），含有效期字段
- [ ] 文件列表分页展示，支持按分类/类型/审核状态/有效期状态筛选
- [ ] 文件详情、下载、删除正常
- [ ] 文件分类树（14分类）展示和CRUD正常
- [ ] 文件标签管理正常
- [ ] 文件审核: admin/safety_manager 可审核，普通用户返回403
- [ ] 审核通知推送正常
- [ ] 文件统计（按分类/类型/审核状态）正常

### 7.2 红线验收

- [ ] 登录功能 100% 正常
- [ ] 现有所有页面正常访问
- [ ] 现有所有API正常响应
- [ ] server/package.json 未变（无新增依赖）
- [ ] 未修改 packages/ 任何文件
- [ ] 未修改 auth.js（仅 require 复用 requireRole）
- [ ] 未修改 upload.js（仅 require 复用）
- [ ] 未修改 response.js（仅 require 复用）
- [ ] 未修改 aiService.js
- [ ] API 响应格式为 `{ code: 0, success: true, data }`
- [ ] 旧表无 ALTER（仅 CREATE TABLE）

---

**冻结完成，等待编码实施指令。**
