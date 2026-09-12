# HSE V2.0 最终实施方案（二次修订版）

## 〇、修订说明

本文档为依据《HSE V2.0实施方案架构审查意见》的二次修订版，核心修正如下：

| 修订项 | 旧方案（错误） | 新方案（修正） |
|--------|----------------|----------------|
| 数据库字段 | 缺少来源/审核/AI字段 | 新增 source_type/source_id/review_status/ai_summary/ai_score/review_user/review_time |
| document_standard_relation | clause_id 外键依赖 Sprint 4 的表 | 改用 clause_code 字符串关联，Sprint 1 即可建表，解除顺序依赖 |
| AI分析流程 | 上传→AI分析→归档（无审核） | 上传→文件检查→AI分析→标准匹配→人工审核→归档（6步） |
| DOCX解析 | zlib.unzipSync 解压 ZIP（**错误**） | 废弃错误方案；DOCX 暂缓全文解析，仅文件名+元数据 AI 分类 |
| 文件解析依赖 | 假设 mammoth/pdf-parse 可用 | 严格基于 package.json 实际依赖：仅 xlsx 可用 |

**约束红线（不变）**：
1. 不改变 Vben 保护规则（不改 packages/）
2. 不修改登录认证（不改 auth/）
3. 不增加 npm 依赖（不改 package.json）
4. 保持增量开发（不改旧表、不改现有路由逻辑）

---

## 一、约束合规确认

### 1.1 实际依赖盘点（基于 [server/package.json](file:///f:/deploy/hse-dashboard/server/package.json)）

| 依赖 | 版本 | 位置 | 可用性 | 用途 |
|------|------|------|--------|------|
| express | ^4.19.2 | dependencies | ✅ | Web 框架 |
| multer | ^1.4.5-lts.1 | dependencies | ✅ | 文件上传 |
| pg | ^8.22.0 | dependencies | ✅ | PostgreSQL |
| xlsx | ^0.18.5 | dependencies | ✅ | **Excel 解析（唯一可用文档解析库）** |
| zod | ^4.4.3 | devDependencies | ✅（validate.js 已在用） | 数据校验 |
| winston | ^3.19.0 | dependencies | ✅ | 日志 |
| uuid | ^14.0.1 | dependencies | ✅ | UUID |
| helmet | ^8.2.0 | dependencies | ✅ | 安全头 |
| express-rate-limit | ^8.5.2 | dependencies | ✅ | 限流 |
| compression | ^1.8.1 | dependencies | ✅ | 压缩 |
| jsonwebtoken | ^9.0.3 | dependencies | ✅ | JWT（禁止修改） |
| bcryptjs | ^3.0.3 | dependencies | ✅ | 密码（禁止修改） |
| morgan | ^1.11.0 | dependencies | ✅ | 访问日志 |

**未安装依赖（禁止使用，禁止新增）**：

| 依赖 | 用途 | 处置 |
|------|------|------|
| pdf-parse | PDF 解析 | ❌ 暂缓 PDF 全文解析 |
| mammoth | DOCX 解析 | ❌ 暂缓 DOCX 全文解析 |
| yauzl/adm-zip/unzipper | ZIP 解压 | ❌ 无，**zlib 模块不能解压 ZIP 归档** |

### 1.2 Node 内置模块能力边界（重要修正）

| 内置模块 | 能力 | 能否解析 DOCX |
|----------|------|---------------|
| zlib | 解压 gzip/zlib/deflate **流** | ❌ **不能**。DOCX 是 ZIP 归档（多文件容器），zlib.unzipSync 仅处理单流压缩数据，无法识别 ZIP 文件头和目录结构 |

**结论**：之前 v2-feasibility-analysis.md 中"DOCX 用 zlib.unzipSync 解压"的方案是**错误的技术判断**，已废弃。

### 1.3 禁止修改清单（红线）

| 范围 | 文件/目录 | 原因 |
|------|-----------|------|
| Vben 核心 | `安全看板vben/packages/` 全部 | 保护核心机制 |
| 登录认证 | `server/middleware/auth.js` | JWT 认证 |
| 登录认证 | `server/routes/auth.js` | 认证路由 |
| 登录认证 | `apps/web-antd/src/store/auth.ts` | 前端认证状态 |
| 登录认证 | `apps/web-antd/src/views/_core/authentication/` | 登录页面 |
| 登录认证 | `apps/web-antd/src/router/access.ts`、`router/guard.ts` | 路由权限/守卫 |
| 现有中间件 | `server/middleware/upload.js`、`response.js`、`validate.js` | 仅复用不改 |
| AI 服务 | `server/services/aiService.js` | 仅调用不改核心 |
| 数据库旧表 | `sql/unified_schema.sql` 中所有表 | 只读不修改 |
| 依赖 | `server/package.json`、`安全看板vben/package.json` | 禁止新增依赖 |

---

## 二、数据库最终设计

### 2.1 字段规范（所有新表必须包含）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL PRIMARY KEY | 主键 |
| created_at | TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP | 更新时间 |
| is_deleted | BOOLEAN NOT NULL DEFAULT false | 软删除（兼容现有规范） |
| status | VARCHAR(16) NOT NULL DEFAULT 'active' | 状态字段 |

### 2.2 新增通用字段（审查意见要求）

以下字段按需加入相关表，含义统一：

| 字段 | 类型 | 中文注释 | 适用表 |
|------|------|----------|--------|
| source_type | VARCHAR(32) | 来源类型: upload/import/system/sync | document_files, hse_reports |
| source_id | VARCHAR(64) | 来源记录ID | document_files, hse_reports |
| review_status | VARCHAR(16) | 审核状态: pending/approved/rejected | document_files, document_analysis |
| ai_summary | TEXT | AI生成的摘要 | document_files, document_analysis |
| ai_score | DECIMAL(5,2) | AI评分(0-100) | document_files, document_analysis |
| review_user | VARCHAR(64) | 审核人 | document_files, document_analysis |
| review_time | TIMESTAMP | 审核时间 | document_files, document_analysis |

### 2.3 document_standard_relation 优化（解除 Sprint 顺序依赖）

**问题**：旧方案 `clause_id BIGINT REFERENCES safety_standard_clauses(id)`，但 `safety_standard_clauses` 表在 Sprint 4 才建，导致 Sprint 1 无法建此表、Sprint 2 的"标准匹配"无法落地。

**优化方案**：改用 `clause_code VARCHAR(64)` 字符串关联，**不设外键约束**。

| 字段 | 类型 | 说明 |
|------|------|------|
| clause_code | VARCHAR(64) NOT NULL | 标准条款编码（与 Sprint 4 的 safety_standard_clauses.code 关联） |
| clause_name | VARCHAR(256) | 条款名称（冗余，便于Sprint4前展示） |

**优势**：
- Sprint 1 即可建表，Sprint 2 的 AI 标准匹配可直接写入 clause_code
- Sprint 4 建 safety_standard_clauses 后，通过 `clause_code` JOIN 关联查询
- 无外键约束，无顺序依赖

### 2.4 完整建表 SQL

执行文件：`sql/v2_document_tables.sql`（Sprint 1 一次性建好文件中心全部表，含标准关联表）

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
COMMENT ON TABLE document_categories IS 'V2-文件分类表（多级分类树）';
CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_category_code ON document_categories (code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_doc_category_parent ON document_categories (parent_id);

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

-- ============================================================
-- V2 文件主表（含审查意见新增字段）
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
    -- 审查意见新增字段 ↓
    source_type         VARCHAR(32)  NOT NULL DEFAULT 'upload',   -- 来源类型
    source_id           VARCHAR(64),                              -- 来源记录ID
    review_status       VARCHAR(16)  NOT NULL DEFAULT 'pending',  -- 审核状态
    ai_summary          TEXT,                                     -- AI摘要
    ai_score            DECIMAL(5,2),                             -- AI评分
    review_user         VARCHAR(64),                              -- 审核人
    review_time         TIMESTAMP,                                -- 审核时间
    -- 审查意见新增字段 ↑
    status              VARCHAR(16)  NOT NULL DEFAULT 'active',
    uploaded_by         VARCHAR(64)  NOT NULL,
    uploaded_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT false,
    metadata            JSONB        NOT NULL DEFAULT '{}'
);
COMMENT ON TABLE  document_files IS 'V2-文件主表（含来源/审核/AI字段）';
COMMENT ON COLUMN document_files.source_type   IS '来源类型: upload/import/system/sync';
COMMENT ON COLUMN document_files.review_status IS '审核状态: pending/approved/rejected';
COMMENT ON COLUMN document_files.ai_summary    IS 'AI生成的文件摘要';
COMMENT ON COLUMN document_files.ai_score      IS 'AI评分(0-100)';
CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_file_uuid ON document_files (file_uuid);
CREATE INDEX IF NOT EXISTS idx_doc_file_category ON document_files (category_id);
CREATE INDEX IF NOT EXISTS idx_doc_file_type ON document_files (file_type);
CREATE INDEX IF NOT EXISTS idx_doc_file_analysis ON document_files (analysis_status);
CREATE INDEX IF NOT EXISTS idx_doc_file_review ON document_files (review_status);
CREATE INDEX IF NOT EXISTS idx_doc_file_source ON document_files (source_type, source_id);

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

-- ============================================================
-- V2 文件版本表
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
CREATE INDEX IF NOT EXISTS idx_doc_ver_file ON document_versions (file_id);

-- ============================================================
-- V2 资料与标准关联表（优化：解除Sprint顺序依赖）
-- 使用 clause_code 字符串关联，不设外键，Sprint1即可建表
-- ============================================================
CREATE TABLE IF NOT EXISTS document_standard_relation (
    id               BIGSERIAL    PRIMARY KEY,
    file_id          BIGINT       NOT NULL REFERENCES document_files(id),
    clause_code      VARCHAR(64)  NOT NULL,    -- 标准条款编码（关联 safety_standard_clauses.code，Sprint4建）
    clause_name      VARCHAR(256),             -- 条款名称冗余（Sprint4前展示用）
    match_type       VARCHAR(16)  NOT NULL DEFAULT 'auto',
    match_confidence DECIMAL(5,2),
    status           VARCHAR(16)  NOT NULL DEFAULT 'valid',
    verified_by      VARCHAR(64),
    verified_at      TIMESTAMP,
    remark           VARCHAR(512),
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted       BOOLEAN      NOT NULL DEFAULT false
);
COMMENT ON TABLE  document_standard_relation IS 'V2-资料与标准条款关联表（clause_code关联，无外键依赖）';
CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_std_rel ON document_standard_relation (file_id, clause_code);
CREATE INDEX IF NOT EXISTS idx_doc_std_rel_file ON document_standard_relation (file_id);
CREATE INDEX IF NOT EXISTS idx_doc_std_rel_code ON document_standard_relation (clause_code);
```

执行文件：`sql/v2_analysis_tables.sql`（Sprint 2）

```sql
-- ============================================================
-- V2 AI分析结果表（含审查意见新增字段）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_analysis (
    id                        BIGSERIAL    PRIMARY KEY,
    file_id                   BIGINT       NOT NULL REFERENCES document_files(id),
    analysis_type             VARCHAR(32)  NOT NULL,
    parsed_text               TEXT,
    category                  VARCHAR(64),
    category_confidence       DECIMAL(5,2),
    extracted_info            JSONB,
    risk_level                VARCHAR(16),
    risk_items                JSONB,
    suggested_tags            JSONB,
    suggested_standard_clauses JSONB,        -- 建议关联的标准条款(code数组)
    completeness_score        DECIMAL(5,2),
    missing_items             JSONB,
    suggestions               TEXT,
    -- 审查意见新增字段 ↓
    ai_summary                TEXT,          -- AI摘要
    ai_score                  DECIMAL(5,2),  -- AI评分
    review_status             VARCHAR(16)    NOT NULL DEFAULT 'pending',
    review_user               VARCHAR(64),
    review_time               TIMESTAMP,
    -- 审查意见新增字段 ↑
    analysis_time_ms          INTEGER,
    ai_model                  VARCHAR(64),
    status                    VARCHAR(16)    NOT NULL DEFAULT 'completed',
    error_message             TEXT,
    created_at                TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted                BOOLEAN        NOT NULL DEFAULT false
);
COMMENT ON TABLE document_analysis IS 'V2-AI文件分析结果表（含审核字段）';
CREATE INDEX IF NOT EXISTS idx_doc_analysis_file ON document_analysis (file_id);
CREATE INDEX IF NOT EXISTS idx_doc_analysis_review ON document_analysis (review_status);
```

执行文件：`sql/v2_report_tables.sql`（Sprint 3）

```sql
-- ============================================================
-- V2 报告记录表（含来源字段）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_reports (
    id             BIGSERIAL    PRIMARY KEY,
    report_type    VARCHAR(32)  NOT NULL,
    report_subtype VARCHAR(32),
    period         VARCHAR(32)  NOT NULL,
    title          VARCHAR(256) NOT NULL,
    file_name      VARCHAR(256) NOT NULL,
    file_path      VARCHAR(512) NOT NULL,
    file_url       VARCHAR(512),
    file_size      BIGINT,
    content        TEXT,
    summary        TEXT,
    -- 审查意见新增字段 ↓
    source_type    VARCHAR(32)  NOT NULL DEFAULT 'system',
    source_id      VARCHAR(64),
    review_status  VARCHAR(16)  NOT NULL DEFAULT 'approved',
    review_user    VARCHAR(64),
    review_time    TIMESTAMP,
    -- 审查意见新增字段 ↑
    status         VARCHAR(16)  NOT NULL DEFAULT 'completed',
    generated_by   VARCHAR(64),
    generated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted     BOOLEAN      NOT NULL DEFAULT false,
    metadata       JSONB        NOT NULL DEFAULT '{}'
);
COMMENT ON TABLE hse_reports IS 'V2-报告记录表（含来源/审核字段）';
CREATE INDEX IF NOT EXISTS idx_hse_report_type ON hse_reports (report_type);
CREATE INDEX IF NOT EXISTS idx_hse_report_period ON hse_reports (period);
```

执行文件：`sql/v2_standard_tables.sql`（Sprint 4）

```sql
-- ============================================================
-- V2 安全标准化条款表（Sprint 4 建，code 字段与 document_standard_relation.clause_code 关联）
-- ============================================================
CREATE TABLE IF NOT EXISTS safety_standard_clauses (
    id                     BIGSERIAL    PRIMARY KEY,
    parent_id              BIGINT       REFERENCES safety_standard_clauses(id),
    level                  INTEGER      NOT NULL,
    code                   VARCHAR(64)  NOT NULL,   -- 与 document_standard_relation.clause_code 关联
    name                   VARCHAR(256) NOT NULL,
    requirement            TEXT,
    score_criteria         TEXT,
    max_score              DECIMAL(5,2) NOT NULL DEFAULT 10,
    responsible_department VARCHAR(128),
    responsible_person     VARCHAR(64),
    required_docs          JSONB,
    status                 VARCHAR(16)  NOT NULL DEFAULT 'active',
    completion_status      VARCHAR(16)  NOT NULL DEFAULT 'pending',
    current_score          DECIMAL(5,2) NOT NULL DEFAULT 0,
    sort_order             INTEGER      NOT NULL DEFAULT 0,
    created_by             VARCHAR(64),
    created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted             BOOLEAN      NOT NULL DEFAULT false
);
COMMENT ON TABLE safety_standard_clauses IS 'V2-安全标准化条款表（code关联document_standard_relation）';
CREATE UNIQUE INDEX IF NOT EXISTS uk_std_clause_code ON safety_standard_clauses (code) WHERE is_deleted = false;

-- ============================================================
-- V2 评分记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS safety_scores (
    id              BIGSERIAL    PRIMARY KEY,
    score_date      DATE         NOT NULL,
    standard_score  DECIMAL(5,2) NOT NULL,
    document_score  DECIMAL(5,2) NOT NULL,
    hazard_score    DECIMAL(5,2) NOT NULL,
    training_score  DECIMAL(5,2) NOT NULL,
    risk_score      DECIMAL(5,2) NOT NULL,
    overall_score   DECIMAL(5,2) NOT NULL,
    overall_level   VARCHAR(16)  NOT NULL,
    details         JSONB,
    status          VARCHAR(16)  NOT NULL DEFAULT 'active',
    calculated_by   VARCHAR(64),
    calculated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN      NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_score_date ON safety_scores (score_date);
```

### 2.5 与旧表关系（只读不修改）

| V2 新表 | 读取的旧表 | 用途 | 是否修改旧表 |
|---------|-----------|------|--------------|
| hse_reports | hazards, accidents, training_records | 报告数据来源 | ❌ 只读 |
| safety_scores | hazards, training_records, risk_sources | 评分数据来源 | ❌ 只读 |
| cockpit 聚合 | 所有旧表 | 驾驶舱统计 | ❌ 只读 |
| document_files | 无 | 独立 | - |

---

## 三、AI 分析流程（6步，含人工审核）

### 3.1 流程图

```
① 上传
   用户上传文件 → document_files(source_type='upload', review_status='pending')
        ↓
② 文件检查
   复用 upload.js 魔术字节校验 + 文件类型判断
        ↓
③ AI 分析
   文本提取（按能力分级）→ 复用 aiService.chat 做分类/抽取/风险识别
   写入 document_analysis + 更新 document_files.ai_summary/ai_score
        ↓
④ 标准匹配
   AI 建议关联标准条款 → 写入 document_standard_relation(clause_code, match_type='auto')
        ↓
⑤ 人工审核
   审核人在前端确认/驳回 → 更新 review_status='approved'/'rejected', review_user, review_time
        ↓
⑥ 归档
   审核通过 → status='active'(归档)，可被报告/台账引用
   审核驳回 → 退回重新处理
```

### 3.2 各步骤实现要点

| 步骤 | 实现 | 复用能力 |
|------|------|----------|
| ① 上传 | documentService.uploadFile | upload.js 的 uploadDocument |
| ② 文件检查 | validateUploadedFile 魔术字节 | upload.js（不改） |
| ③ AI 分析 | documentAnalysisService.analyzeFile | aiService.chat（不改核心） |
| ④ 标准匹配 | documentAnalysisService.matchStandard | aiService.chat + document_standard_relation |
| ⑤ 人工审核 | documentService.reviewFile | pg UPDATE review_status |
| ⑥ 归档 | documentService.archiveFile | pg UPDATE status |

### 3.3 审核状态流转

```
pending（待审核）
   ├── approved（审核通过）→ 归档，可被引用
   └── rejected（审核驳回）→ 退回，重新分析或删除
```

---

## 四、文件解析方案（基于实际依赖）

### 4.1 解析能力矩阵

| 文件类型 | 全文解析 | 实现方式 | 说明 |
|----------|----------|----------|------|
| XLSX/XLS | ✅ 支持 | 复用已安装的 xlsx ^0.18.5 库 | 唯一可全文解析的类型 |
| PDF | ❌ 暂缓 | 仅文件名+元数据 AI 分类 | 无 pdf-parse 依赖 |
| DOCX/DOC | ❌ 暂缓 | 仅文件名+元数据 AI 分类 | 无 mammoth；**zlib 不能解压 ZIP 归档** |
| 图片 | ❌ 暂缓 | 仅文件名+元数据 AI 分类 | 无 OCR 依赖 |

### 4.2 fileParser.js 实现（仅用 xlsx，无错误方案）

**文件**: `server/utils/fileParser.js`

```javascript
/**
 * 文件文本提取（基于实际依赖，仅 xlsx 可用）
 * 不使用 zlib 解压 DOCX（错误方案已废弃）
 * 不使用 pdf-parse/mammoth（未安装）
 */
const fs = require('fs');
const path = require('path');

async function extractText(file) {
  const ext = path.extname(file.original_name).toLowerCase();

  switch (ext) {
    case '.xlsx':
    case '.xls': {
      // ✅ 复用已安装的 xlsx 库
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(file.file_path);
      const sheets = workbook.SheetNames.map(name => {
        const sheet = workbook.Sheets[name];
        return XLSX.utils.sheet_to_txt(sheet);
      });
      return { text: sheets.join('\n'), method: 'xlsx', full: true };
    }
    case '.pdf':
    case '.docx':
    case '.doc':
    case '.jpg':
    case '.jpeg':
    case '.png':
    case '.gif':
    case '.webp':
      // ❌ 无可用依赖，降级为文件名+元数据
      return { text: file.original_name, method: 'filename', full: false };
    default:
      return { text: file.original_name, method: 'filename', full: false };
  }
}

module.exports = { extractText };
```

### 4.3 AI 分析降级策略

对无法全文解析的文件，AI 分析输入为：文件名 + 分类 + 标签等元数据，仍能完成：
- 文件分类（基于文件名关键词）
- 标准条款建议匹配（基于文件名）
- 完整度评估（基于文件是否存在）

准确率会降低，但功能可用，待依赖解禁后再增强。

---

## 五、开发顺序（Sprint 1-5）

### Sprint 1：安全资料中心

**目标**：文件上传/分类/标签/查询/版本/标准关联表（含人工审核基础）

**数据库**：执行 `sql/v2_document_tables.sql`（6张表 + 种子数据，**含 document_standard_relation**，解除顺序依赖）

**新增后端**：
- `server/routes/hse-documents.js`（文件CRUD/分类/标签/版本/审核）
- `server/services/documentService.js`

**修改后端**：
- [server/app.js](file:///f:/deploy/hse-dashboard/server/app.js)（仅新增路由挂载行）

**新增前端**：
- `router/routes/modules/hse-documents.ts`
- `api/hse/documents.ts`
- `views/hse/documents/library/index.vue`
- `views/hse/documents/library/components/UploadModal.vue`（页面内组件）

**接口**：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/hse/documents/upload | 文件上传（review_status=pending） |
| GET | /api/hse/documents | 文件列表（支持按review_status筛选） |
| GET | /api/hse/documents/:id | 文件详情 |
| DELETE | /api/hse/documents/:id | 文件删除 |
| PUT | /api/hse/documents/:id | 文件更新 |
| GET | /api/hse/documents/:id/download | 文件下载 |
| POST | /api/hse/documents/:id/review | 人工审核（review_status流转） |
| GET | /api/hse/documents/categories | 分类树 |
| POST | /api/hse/documents/categories | 创建分类 |
| GET | /api/hse/documents/tags | 标签列表 |
| POST | /api/hse/documents/tags | 创建标签 |

**测试**：上传各类型文件、审核流转、登录兼容、现有功能回归

---

### Sprint 2：AI 文件分析

**目标**：文本提取(XLSX)/AI分类/信息抽取/风险识别/标准匹配

**数据库**：执行 `sql/v2_analysis_tables.sql`（document_analysis 表，含审核字段）

**新增后端**：
- `server/routes/hse-document-analysis.js`
- `server/services/documentAnalysisService.js`
- `server/utils/fileParser.js`（仅 xlsx，无错误方案）

**修改后端**：
- `server/app.js`（新增路由挂载）

**新增前端**：
- `api/hse/document-analysis.ts`
- `views/hse/documents/ai-analysis/index.vue`
- `views/hse/documents/ai-analysis/components/AnalysisResult.vue`（页面内）

**接口**：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/hse/document-analysis/:id/analyze | 触发分析（步骤③④） |
| GET | /api/hse/document-analysis/:id/result | 分析结果 |
| GET | /api/hse/document-analysis/pending | 待分析列表 |
| POST | /api/hse/document-analysis/:id/match-standard | 标准匹配 |

**测试**：XLSX 解析、PDF/DOCX 降级、AI 分类、标准匹配写入 clause_code、aiService 兼容

---

### Sprint 3：Markdown 报告

**目标**：安全月报/隐患报告/培训报告自动生成

**数据库**：执行 `sql/v2_report_tables.sql`（hse_reports 表，含来源字段）

**新增后端**：
- `server/routes/hse-document-reports.js`
- `server/services/documentReportService.js`（复用 aiService + 只读旧表）

**修改后端**：
- `server/app.js`（新增路由挂载）

**新增前端**：
- `api/hse/document-reports.ts`
- `views/hse/documents/reports/index.vue`
- `views/hse/documents/reports/components/ReportPreview.vue`（页面内）

**接口**：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/hse/document-reports/generate | 生成报告 |
| GET | /api/hse/document-reports | 报告列表 |
| GET | /api/hse/document-reports/:id/download | 报告下载 |
| DELETE | /api/hse/document-reports/:id | 删除报告 |

**测试**：月报/隐患/培训报告生成、只读旧表验证、下载验证

---

### Sprint 4：标准化台账

**目标**：标准条款管理/达标台账/自评评分

**数据库**：执行 `sql/v2_standard_tables.sql`（safety_standard_clauses + safety_scores，**code 与 Sprint1 的 clause_code 关联**）

**新增后端**：
- `server/routes/hse-standard.js`
- `server/routes/hse-score.js`
- `server/services/standardService.js`
- `server/services/scoreService.js`

**修改后端**：
- `server/app.js`（新增路由挂载）

**新增前端**：
- `router/routes/modules/hse-standard.ts`
- `api/hse/standard.ts`、`api/hse/score.ts`
- `views/hse/standard/clauses/index.vue`
- `views/hse/standard/compliance/index.vue`
- `views/hse/standard/assessment/index.vue`

**接口**：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/hse/standard/clauses | 条款树 |
| POST | /api/hse/standard/clauses | 创建条款 |
| GET | /api/hse/standard/compliance | 达标台账（JOIN document_standard_relation.clause_code） |
| POST | /api/hse/standard/assessment | 自评评分 |
| GET | /api/hse/score/today | 今日评分 |
| POST | /api/hse/score/calculate | 计算评分 |

**测试**：条款树、达标率计算（关联 Sprint1 的 clause_code）、评分计算

---

### Sprint 5：集团驾驶舱

**目标**：安全指数/统计/趋势展示

**数据库**：无新增表（复用 safety_scores + 旧表聚合）

**新增后端**：
- `server/routes/hse-cockpit-v2.js`
- `server/services/cockpitService.js`

**修改后端**：
- `server/app.js`（新增路由挂载）

**新增前端**：
- `router/routes/modules/hse-cockpit-v2.ts`
- `api/hse/cockpit-v2.ts`
- `views/hse/cockpit-v2/index.vue`

**接口**：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/hse/cockpit-v2/overview | 概览（安全指数+5指标） |
| GET | /api/hse/cockpit-v2/hazard-stats | 隐患统计 |
| GET | /api/hse/cockpit-v2/score-trend | 评分趋势 |

**测试**：概览数据、隐患统计、评分趋势、图表渲染、旧表只读

---

## 六、文件修改范围汇总

### 6.1 新增文件

| 类型 | 数量 | 位置 |
|------|------|------|
| 后端路由 | 6 | server/routes/ |
| 后端服务 | 6 | server/services/ |
| 后端工具 | 1 | server/utils/ |
| SQL | 4 | sql/ |
| 前端路由 | 3 | router/routes/modules/ |
| 前端API | 6 | api/hse/ |
| 前端页面 | 7 | views/hse/ |
| 前端页面内组件 | 4 | views/hse/xxx/components/ |

### 6.2 修改文件（仅挂载/文案）

| 文件 | 修改内容 |
|------|----------|
| [server/app.js](file:///f:/deploy/hse-dashboard/server/app.js) | 新增路由挂载行（不改现有逻辑） |
| `locales/langs/zh-CN/hse.json` | 新增菜单文案 |
| `locales/langs/en-US/hse.json` | 新增英文文案 |

### 6.3 禁止修改（红线）

见 1.3 节，含 packages/、auth/、中间件、aiService、旧表、package.json。

---

## 七、验收标准

### 7.1 通用验收（每 Sprint）

- [ ] 登录功能 100% 正常
- [ ] 现有所有页面正常访问
- [ ] `server/package.json` 未变（无新增依赖）
- [ ] 未修改 packages/ 任何文件
- [ ] 未修改 auth 相关任何文件
- [ ] API 响应格式为 `{ code: 0, success: true, ... }`
- [ ] 新表含 id/created_at/updated_at/status/is_deleted + 审查意见字段
- [ ] 旧表无 ALTER（仅 CREATE TABLE 新表）

### 7.2 修订项验收

- [ ] document_files 含 source_type/source_id/review_status/ai_summary/ai_score/review_user/review_time
- [ ] document_analysis 含 ai_summary/ai_score/review_status/review_user/review_time
- [ ] hse_reports 含 source_type/source_id/review_status
- [ ] document_standard_relation 使用 clause_code（无外键），Sprint 1 可建表
- [ ] AI 流程含"人工审核"环节（review_status 流转）
- [ ] fileParser.js 仅用 xlsx，无 zlib 解压 DOCX 错误方案
- [ ] DOCX/PDF 降级为文件名+元数据 AI 分类

---

**文档版本**: V2.0（二次修订版）  
**生成日期**: 2026-07-18  
**修订依据**: 《HSE V2.0实施方案架构审查意见》  
**核心修正**: 数据库新增7字段、标准关联解除顺序依赖、AI流程增加人工审核、废弃错误DOCX解析方案