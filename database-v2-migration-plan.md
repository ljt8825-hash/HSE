# HSE V2.0 数据库实施策略

## 一、实施原则

### 1.1 核心原则

| 原则 | 说明 |
|------|------|
| 禁止修改旧表 | 不 ALTER 任何现有表结构 |
| 只做 CREATE TABLE | 所有变更通过新增表实现 |
| 幂等设计 | 所有 SQL 使用 `IF NOT EXISTS`，可安全重复执行 |
| 字段规范统一 | 所有新表包含 id/created_at/updated_at/status/is_deleted |

### 1.2 字段规范

所有 V2 新表必须包含以下基础字段：

```sql
id          BIGSERIAL    PRIMARY KEY,           -- 主键
created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 创建时间
updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 更新时间
is_deleted  BOOLEAN      NOT NULL DEFAULT false,              -- 软删除（兼容现有规范）
status      VARCHAR(16)  NOT NULL DEFAULT 'active'            -- 状态字段（MVP要求）
```

### 1.3 命名规范

| 规范 | 示例 |
|------|------|
| 表名小写+下划线 | `document_files` |
| V2新表前缀 | `doc_*` 或 `hse_v2_*`（本文档统一用语义命名） |
| 索引前缀 | `idx_` / `uk_` |
| 注释 | `COMMENT ON TABLE/COLUMN` |

---

## 二、与旧模块关系说明

### 2.1 新表与旧表隔离

| V2 新表 | 对应旧表 | 关系 |
|---------|----------|------|
| document_files | file_records | **独立**，不关联。V2 文件中心独立运作 |
| hse_reports | reports（如有） | **独立**，不关联。V2 报告独立运作 |
| safety_standard_clauses | 无 | **全新**，标准化管理为新增能力 |
| safety_scores | 无 | **全新**，评分为新增能力 |

### 2.2 数据引用关系

V2 新表**可读取**旧表数据（用于报告生成、评分计算），但**不修改**旧表：

| V2 新表 | 读取的旧表 | 用途 |
|---------|-----------|------|
| document_analysis | 无 | 独立 |
| hse_reports | hazards, accidents, training_records | 报告数据来源 |
| safety_scores | hazards, training_records, risk_sources | 评分数据来源 |
| cockpit 统计 | 所有旧表 | 驾驶舱数据聚合 |

---

## 三、Sprint 1：文件中心建表

### 3.1 document_categories（文件分类表）

```sql
-- ============================================================
-- V2 文件分类表
-- 与旧表关系: 无（独立新增）
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

COMMENT ON TABLE  document_categories IS 'V2-文件分类表（多级分类树）';
COMMENT ON COLUMN document_categories.parent_id IS '上级分类ID，NULL为根分类';
COMMENT ON COLUMN document_categories.code IS '分类编码（唯一）';
COMMENT ON COLUMN document_categories.sort_order IS '排序号';
COMMENT ON COLUMN document_categories.status IS '状态: active/inactive';

CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_category_code ON document_categories (code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_doc_category_parent ON document_categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_doc_category_status ON document_categories (status);
```

### 3.2 document_tags（文件标签表）

```sql
-- ============================================================
-- V2 文件标签表
-- 与旧表关系: 无（独立新增）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_tags (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(64)  NOT NULL,
    color       VARCHAR(16),
    type        VARCHAR(16)  NOT NULL DEFAULT 'manual',  -- manual/auto
    usage_count INTEGER      NOT NULL DEFAULT 0,
    status      VARCHAR(16)  NOT NULL DEFAULT 'active',
    created_by  VARCHAR(64),
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted  BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  document_tags IS 'V2-文件标签表（人工+AI标签）';
COMMENT ON COLUMN document_tags.type IS '标签类型: manual(人工)/auto(AI生成)';
COMMENT ON COLUMN document_tags.usage_count IS '使用次数';

CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_tag_name ON document_tags (name) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_doc_tag_type ON document_tags (type);
```

### 3.3 document_files（文件主表）

```sql
-- ============================================================
-- V2 文件主表
-- 与旧表关系: 与 file_records 独立，互不干扰
-- ============================================================
CREATE TABLE IF NOT EXISTS document_files (
    id                  BIGSERIAL    PRIMARY KEY,
    file_uuid           VARCHAR(36)  NOT NULL,
    original_name       VARCHAR(256) NOT NULL,
    storage_name        VARCHAR(128) NOT NULL,
    file_path           VARCHAR(512) NOT NULL,
    file_url            VARCHAR(512),
    file_size           BIGINT       NOT NULL,
    file_type           VARCHAR(32)  NOT NULL,   -- pdf/docx/xlsx/image
    mime_type           VARCHAR(128) NOT NULL,
    category_id         BIGINT       REFERENCES document_categories(id),
    summary             TEXT,
    content_text        TEXT,
    analysis_status     VARCHAR(16)  NOT NULL DEFAULT 'pending',  -- pending/analyzing/completed/failed
    completeness_score  DECIMAL(5,2),
    risk_level          VARCHAR(16),
    status              VARCHAR(16)  NOT NULL DEFAULT 'active',    -- active/archived/deleted
    uploaded_by         VARCHAR(64)  NOT NULL,
    uploaded_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT false,
    metadata            JSONB        NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE  document_files IS 'V2-文件主表（安全资料中心核心表）';
COMMENT ON COLUMN document_files.file_uuid IS '文件唯一标识(UUID)';
COMMENT ON COLUMN document_files.analysis_status IS '分析状态: pending/analyzing/completed/failed';
COMMENT ON COLUMN document_files.content_text IS '提取的文本内容(XLSX/DOCX)';
COMMENT ON COLUMN document_files.metadata IS '扩展元数据(JSON)';

CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_file_uuid ON document_files (file_uuid);
CREATE INDEX IF NOT EXISTS idx_doc_file_category ON document_files (category_id);
CREATE INDEX IF NOT EXISTS idx_doc_file_type ON document_files (file_type);
CREATE INDEX IF NOT EXISTS idx_doc_file_analysis ON document_files (analysis_status);
CREATE INDEX IF NOT EXISTS idx_doc_file_status ON document_files (status);
CREATE INDEX IF NOT EXISTS idx_doc_file_uploaded_at ON document_files (uploaded_at);
```

### 3.4 document_tag_relation（文件标签关联表）

```sql
CREATE TABLE IF NOT EXISTS document_tag_relation (
    id         BIGSERIAL PRIMARY KEY,
    file_id    BIGINT    NOT NULL REFERENCES document_files(id),
    tag_id     BIGINT    NOT NULL REFERENCES document_tags(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE document_tag_relation IS 'V2-文件标签关联表（多对多）';

CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_tag_rel ON document_tag_relation (file_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_doc_tag_rel_file ON document_tag_relation (file_id);
CREATE INDEX IF NOT EXISTS idx_doc_tag_rel_tag ON document_tag_relation (tag_id);
```

### 3.5 document_versions（文件版本表）

```sql
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

COMMENT ON TABLE document_versions IS 'V2-文件版本表（版本追溯）';

CREATE INDEX IF NOT EXISTS idx_doc_ver_file ON document_versions (file_id);
CREATE INDEX IF NOT EXISTS idx_doc_ver_latest ON document_versions (is_latest);
```

---

## 四、Sprint 2：AI分析建表

### 4.1 document_analysis（AI分析结果表）

```sql
-- ============================================================
-- V2 AI分析结果表
-- 与旧表关系: 无（独立新增）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_analysis (
    id                        BIGSERIAL    PRIMARY KEY,
    file_id                   BIGINT       NOT NULL REFERENCES document_files(id),
    analysis_type             VARCHAR(32)  NOT NULL,  -- ocr/parse/classify/risk/info
    ocr_text                  TEXT,
    parsed_text               TEXT,
    category                  VARCHAR(64),
    category_confidence       DECIMAL(5,2),
    extracted_info            JSONB,
    risk_level                VARCHAR(16),
    risk_items                JSONB,
    suggested_tags            JSONB,
    suggested_standard_clauses JSONB,
    completeness_score        DECIMAL(5,2),
    missing_items             JSONB,
    suggestions               TEXT,
    analysis_time_ms          INTEGER,
    ai_model                  VARCHAR(64),
    status                    VARCHAR(16)  NOT NULL DEFAULT 'completed',
    error_message             TEXT,
    created_at                TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted                BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  document_analysis IS 'V2-AI文件分析结果表';
COMMENT ON COLUMN document_analysis.analysis_type IS '分析类型: ocr/parse/classify/risk/info';
COMMENT ON COLUMN document_analysis.extracted_info IS 'AI抽取的关键字段(JSON)';
COMMENT ON COLUMN document_analysis.risk_items IS '识别的风险项(JSON数组)';

CREATE INDEX IF NOT EXISTS idx_doc_analysis_file ON document_analysis (file_id);
CREATE INDEX IF NOT EXISTS idx_doc_analysis_type ON document_analysis (analysis_type);
CREATE INDEX IF NOT EXISTS idx_doc_analysis_risk ON document_analysis (risk_level);
CREATE INDEX IF NOT EXISTS idx_doc_analysis_status ON document_analysis (status);
```

### 4.2 document_standard_relation（资料标准关联表）

```sql
-- ============================================================
-- V2 资料与标准关联表
-- 与旧表关系: 无（独立新增，Sprint 4 标准条款表建后生效）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_standard_relation (
    id               BIGSERIAL    PRIMARY KEY,
    file_id          BIGINT       NOT NULL REFERENCES document_files(id),
    clause_id        BIGINT       NOT NULL,  -- 关联 safety_standard_clauses.id (Sprint 4 建)
    match_type       VARCHAR(16)  NOT NULL DEFAULT 'auto',  -- auto/manual
    match_confidence DECIMAL(5,2),
    status           VARCHAR(16)  NOT NULL DEFAULT 'valid',  -- valid/invalid/pending
    verified_by      VARCHAR(64),
    verified_at      TIMESTAMP,
    remark           VARCHAR(512),
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted       BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  document_standard_relation IS 'V2-资料与标准条款关联表';
COMMENT ON COLUMN document_standard_relation.match_type IS '匹配类型: auto(AI)/manual(人工)';

CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_std_rel ON document_standard_relation (file_id, clause_id);
CREATE INDEX IF NOT EXISTS idx_doc_std_rel_file ON document_standard_relation (file_id);
CREATE INDEX IF NOT EXISTS idx_doc_std_rel_clause ON document_standard_relation (clause_id);
```

---

## 五、Sprint 3：报告建表

### 5.1 hse_reports（V2报告记录表）

```sql
-- ============================================================
-- V2 报告记录表
-- 与旧表关系: 与现有 reports 表独立（不修改旧表）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_reports (
    id             BIGSERIAL    PRIMARY KEY,
    report_type    VARCHAR(32)  NOT NULL,   -- daily/weekly/monthly/quarterly/annual
    report_subtype VARCHAR(32),             -- safety/hazard/training/standard
    period         VARCHAR(32)  NOT NULL,   -- 2026-07, 2026-W29, 2026-Q3
    title          VARCHAR(256) NOT NULL,
    file_name      VARCHAR(256) NOT NULL,
    file_path      VARCHAR(512) NOT NULL,
    file_url       VARCHAR(512),
    file_size      BIGINT,
    content        TEXT,                    -- Markdown 全文
    summary        TEXT,                    -- 报告摘要
    status         VARCHAR(16)  NOT NULL DEFAULT 'completed',  -- generating/completed/failed
    generated_by   VARCHAR(64),
    generated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted     BOOLEAN      NOT NULL DEFAULT false,
    metadata       JSONB        NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE  hse_reports IS 'V2-报告记录表（Markdown报告）';
COMMENT ON COLUMN hse_reports.report_type IS '报告类型: daily/weekly/monthly/quarterly/annual';
COMMENT ON COLUMN hse_reports.report_subtype IS '报告子类型: safety/hazard/training/standard';
COMMENT ON COLUMN hse_reports.content IS '报告Markdown全文';

CREATE INDEX IF NOT EXISTS idx_hse_report_type ON hse_reports (report_type);
CREATE INDEX IF NOT EXISTS idx_hse_report_period ON hse_reports (period);
CREATE INDEX IF NOT EXISTS idx_hse_report_status ON hse_reports (status);
CREATE INDEX IF NOT EXISTS idx_hse_report_generated_at ON hse_reports (generated_at);
```

---

## 六、Sprint 4：标准化建表

### 6.1 safety_standard_clauses（标准条款表）

```sql
-- ============================================================
-- V2 安全标准化条款表
-- 与旧表关系: 无（全新能力）
-- ============================================================
CREATE TABLE IF NOT EXISTS safety_standard_clauses (
    id                    BIGSERIAL    PRIMARY KEY,
    parent_id             BIGINT       REFERENCES safety_standard_clauses(id),
    level                 INTEGER      NOT NULL,   -- 1/2/3（一级要素/二级要素/三级指标）
    code                  VARCHAR(64)  NOT NULL,
    name                  VARCHAR(256) NOT NULL,
    requirement           TEXT,
    score_criteria        TEXT,
    max_score             DECIMAL(5,2) NOT NULL DEFAULT 10,
    responsible_department VARCHAR(128),
    responsible_person    VARCHAR(64),
    required_docs         JSONB,       -- 所需资料清单
    status                VARCHAR(16)  NOT NULL DEFAULT 'active',  -- active/inactive
    completion_status     VARCHAR(16)  NOT NULL DEFAULT 'pending', -- pending/partially/completed
    current_score         DECIMAL(5,2) NOT NULL DEFAULT 0,
    sort_order            INTEGER      NOT NULL DEFAULT 0,
    created_by            VARCHAR(64),
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted            BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  safety_standard_clauses IS 'V2-安全标准化条款表（三级指标体系）';
COMMENT ON COLUMN safety_standard_clauses.level IS '级别: 1=一级要素, 2=二级要素, 3=三级指标';
COMMENT ON COLUMN safety_standard_clauses.completion_status IS '完成状态: pending/partially/completed';

CREATE UNIQUE INDEX IF NOT EXISTS uk_std_clause_code ON safety_standard_clauses (code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_std_clause_parent ON safety_standard_clauses (parent_id);
CREATE INDEX IF NOT EXISTS idx_std_clause_level ON safety_standard_clauses (level);
CREATE INDEX IF NOT EXISTS idx_std_clause_completion ON safety_standard_clauses (completion_status);
```

### 6.2 safety_scores（评分记录表）

```sql
CREATE TABLE IF NOT EXISTS safety_scores (
    id              BIGSERIAL    PRIMARY KEY,
    score_date      DATE         NOT NULL,
    standard_score  DECIMAL(5,2) NOT NULL,  -- 标准化完成率
    document_score  DECIMAL(5,2) NOT NULL,  -- 资料完整率
    hazard_score    DECIMAL(5,2) NOT NULL,  -- 隐患整改率
    training_score  DECIMAL(5,2) NOT NULL,  -- 培训完成率
    risk_score      DECIMAL(5,2) NOT NULL,  -- 风险管控率
    overall_score   DECIMAL(5,2) NOT NULL,  -- 安全标准化指数
    overall_level   VARCHAR(16)  NOT NULL,  -- excellent/good/qualified/basic/unqualified
    details         JSONB,
    status          VARCHAR(16)  NOT NULL DEFAULT 'active',
    calculated_by   VARCHAR(64),
    calculated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  safety_scores IS 'V2-安全标准化评分记录表';

CREATE UNIQUE INDEX IF NOT EXISTS uk_score_date ON safety_scores (score_date);
CREATE INDEX IF NOT EXISTS idx_score_level ON safety_scores (overall_level);
```

---

## 七、种子数据

### 7.1 文件分类初始数据

```sql
-- 文件分类种子数据（可在 v2_seed_data.sql 中执行）
INSERT INTO document_categories (code, name, description, sort_order) VALUES
    ('SAFETY_TRAINING', '安全教育培训', '安全培训相关文件', 1),
    ('INSPECTION', '安全检查记录', '隐患排查、安全检查', 2),
    ('EMERGENCY', '应急管理', '应急预案、演练记录', 3),
    ('REGULATIONS', '规章制度', '安全制度、操作规程', 4),
    ('RESPONSIBILITY', '安全责任', '安全责任书、责任制度', 5),
    ('VEHICLE_SAFETY', '车辆安全', '车辆安全管理制度', 6)
ON CONFLICT DO NOTHING;
```

### 7.2 标准条款种子数据

标准条款需按环卫行业安全生产标准化要求导入，Sprint 4 实施。

---

## 八、执行顺序

| 顺序 | 文件 | Sprint | 说明 |
|------|------|--------|------|
| 1 | sql/v2_document_tables.sql | Sprint 1 | 文件中心6张表 |
| 2 | sql/v2_seed_data.sql | Sprint 1 | 分类种子数据 |
| 3 | sql/v2_analysis_tables.sql | Sprint 2 | AI分析2张表 |
| 4 | sql/v2_report_tables.sql | Sprint 3 | 报告1张表 |
| 5 | sql/v2_standard_tables.sql | Sprint 4 | 标准化2张表 |
| 6 | sql/v2_cockpit_tables.sql | Sprint 5 | 驾驶舱统计表（如需） |

### 执行命令

```bash
# 按 Sprint 顺序执行
psql -U postgres -d safety_dashboard -f sql/v2_document_tables.sql
psql -U postgres -d safety_dashboard -f sql/v2_seed_data.sql
psql -U postgres -d safety_dashboard -f sql/v2_analysis_tables.sql
psql -U postgres -d safety_dashboard -f sql/v2_report_tables.sql
psql -U postgres -d safety_dashboard -f sql/v2_standard_tables.sql
```

---

## 九、回滚方案

若需回滚，执行以下 SQL（仅删除 V2 新表，不影响旧表）：

```sql
-- 按依赖反序删除
DROP TABLE IF EXISTS safety_scores;
DROP TABLE IF EXISTS safety_standard_clauses;
DROP TABLE IF EXISTS hse_reports;
DROP TABLE IF EXISTS document_standard_relation;
DROP TABLE IF EXISTS document_analysis;
DROP TABLE IF EXISTS document_versions;
DROP TABLE IF EXISTS document_tag_relation;
DROP TABLE IF EXISTS document_files;
DROP TABLE IF EXISTS document_tags;
DROP TABLE IF EXISTS document_categories;
```

---

**文档版本**: V1.0  
**生成日期**: 2026-07-18  
**范围**: 数据库建表策略、新旧表关系、执行顺序、回滚方案