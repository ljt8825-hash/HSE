# 文件体系数据库设计

## 一、设计目标

设计安全资料智能中心的文件管理体系，实现以下功能：

1. **文件上传** - 支持PDF、Word、Excel、图片等多种格式
2. **OCR识别** - 图片/扫描件文字识别
3. **文本解析** - PDF/DOCX内容提取
4. **AI分类** - 自动分类文件类型
5. **关联标准条款** - 文件与安全标准化条款关联
6. **生成标签** - 自动生成关键词标签
7. **版本管理** - 文件版本追溯

---

## 二、文件体系ER图

```
                    ┌───────────────────┐
                    │ document_categories│
                    └─────────┬─────────┘
                              │ category_id (FK)
                              ▼
┌───────────────┐    ┌───────────────────┐    ┌───────────────────┐
│document_tags  │    │  document_files   │    │document_versions  │
└───────┬───────┘    └─────────┬─────────┘    └─────────┬─────────┘
        │                     │                        │
        │ tag_id (FK)         │ file_id (FK)            │ file_id (FK)
        ▼                     ▼                        ▼
┌───────────────────────┐    ┌───────────────────┐
│document_tag_relation  │    │document_analysis   │
└───────────────────────┘    └─────────┬─────────┘
                                      │ file_id (FK)
                                      ▼
                         ┌─────────────────────────┐
                         │document_standard_relation│
                         └─────────────────────────┘
```

---

## 三、表结构设计

### 3.1 document_categories（文件分类表）

用于管理文件的分类体系，支持多级分类。

| 字段名 | 类型 | 约束 | 中文注释 |
|--------|------|------|----------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| parent_id | BIGINT | NULL, FK | 上级分类ID |
| code | VARCHAR(64) | UNIQUE | 分类编码 |
| name | VARCHAR(128) | NOT NULL | 分类名称 |
| description | VARCHAR(512) | NULL | 分类描述 |
| icon | VARCHAR(64) | NULL | 分类图标 |
| sort_order | INTEGER | DEFAULT 0 | 排序号 |
| status | VARCHAR(16) | DEFAULT 'active' | 状态: active/inactive |
| created_by | VARCHAR(64) | NULL | 创建人 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_by | VARCHAR(64) | NULL | 更新人 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新时间 |
| is_deleted | BOOLEAN | DEFAULT false | 软删除 |

**索引设计**:
```sql
CREATE INDEX idx_category_parent ON document_categories(parent_id);
CREATE INDEX idx_category_code ON document_categories(code);
CREATE INDEX idx_category_status ON document_categories(status);
```

**分类示例数据**:
| id | parent_id | code | name | description |
|----|-----------|------|------|-------------|
| 1 | NULL | SAFETY_TRAINING | 安全教育培训 | 安全培训相关文件 |
| 2 | NULL | INSPECTION | 安全检查记录 | 隐患排查、安全检查 |
| 3 | NULL | EMERGENCY | 应急管理 | 应急预案、演练记录 |
| 4 | NULL | REGULATIONS | 规章制度 | 安全制度、操作规程 |
| 5 | 1 | TRAINING_PLAN | 培训计划 | 年度/月度培训计划 |
| 6 | 1 | TRAINING_RECORDS | 培训记录 | 培训签到、考核记录 |
| 7 | 2 | HAZARD_INSPECTION | 隐患排查 | 隐患排查登记表 |
| 8 | 2 | SAFETY_CHECK | 安全检查 | 日常安全检查表 |

---

### 3.2 document_tags（文件标签表）

用于管理文件标签，支持用户自定义标签和AI自动生成标签。

| 字段名 | 类型 | 约束 | 中文注释 |
|--------|------|------|----------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| name | VARCHAR(64) | NOT NULL, UNIQUE | 标签名称 |
| color | VARCHAR(16) | NULL | 标签颜色 |
| type | VARCHAR(16) | DEFAULT 'manual' | 标签类型: manual/auto |
| usage_count | INTEGER | DEFAULT 0 | 使用次数 |
| status | VARCHAR(16) | DEFAULT 'active' | 状态: active/inactive |
| created_by | VARCHAR(64) | NULL | 创建人 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_by | VARCHAR(64) | NULL | 更新人 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

**索引设计**:
```sql
CREATE INDEX idx_tag_name ON document_tags(name);
CREATE INDEX idx_tag_type ON document_tags(type);
CREATE INDEX idx_tag_status ON document_tags(status);
```

---

### 3.3 document_files（文件主表）

存储上传文件的基本信息，是文件管理的核心表。

| 字段名 | 类型 | 约束 | 中文注释 |
|--------|------|------|----------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| file_uuid | VARCHAR(36) | UNIQUE | 文件唯一标识 |
| original_name | VARCHAR(256) | NOT NULL | 原始文件名 |
| storage_name | VARCHAR(128) | NOT NULL | 存储文件名 |
| file_path | VARCHAR(512) | NOT NULL | 文件存储路径 |
| file_url | VARCHAR(512) | NULL | 文件访问URL |
| file_size | BIGINT | NOT NULL | 文件大小(字节) |
| file_type | VARCHAR(32) | NOT NULL | 文件类型: pdf/docx/xlsx/image |
| mime_type | VARCHAR(128) | NOT NULL | MIME类型 |
| category_id | BIGINT | NULL, FK | 分类ID |
| summary | TEXT | NULL | 文件摘要(AI生成) |
| content_text | TEXT | NULL | 提取的文本内容 |
| analysis_status | VARCHAR(16) | DEFAULT 'pending' | 分析状态: pending/analyzing/completed/failed |
| completeness_score | DECIMAL(5,2) | NULL | 资料完整度评分(0-100) |
| risk_level | VARCHAR(16) | NULL | 风险等级 |
| status | VARCHAR(16) | DEFAULT 'active' | 文件状态: active/archived/deleted |
| uploaded_by | VARCHAR(64) | NOT NULL | 上传人 |
| uploaded_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 上传时间 |
| updated_by | VARCHAR(64) | NULL | 更新人 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新时间 |
| is_deleted | BOOLEAN | DEFAULT false | 软删除 |
| metadata | JSONB | DEFAULT '{}' | 扩展元数据 |

**索引设计**:
```sql
CREATE INDEX idx_file_uuid ON document_files(file_uuid);
CREATE INDEX idx_file_category ON document_files(category_id);
CREATE INDEX idx_file_type ON document_files(file_type);
CREATE INDEX idx_file_status ON document_files(status);
CREATE INDEX idx_file_analysis_status ON document_files(analysis_status);
CREATE INDEX idx_file_uploaded_by ON document_files(uploaded_by);
CREATE INDEX idx_file_uploaded_at ON document_files(uploaded_at);
```

---

### 3.4 document_tag_relation（文件标签关联表）

建立文件与标签的多对多关系。

| 字段名 | 类型 | 约束 | 中文注释 |
|--------|------|------|----------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| file_id | BIGINT | NOT NULL, FK | 文件ID |
| tag_id | BIGINT | NOT NULL, FK | 标签ID |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**索引设计**:
```sql
CREATE UNIQUE INDEX uk_tag_relation ON document_tag_relation(file_id, tag_id);
CREATE INDEX idx_tag_relation_file ON document_tag_relation(file_id);
CREATE INDEX idx_tag_relation_tag ON document_tag_relation(tag_id);
```

---

### 3.5 document_versions（文件版本表）

管理文件的版本历史，支持版本追溯和回滚。

| 字段名 | 类型 | 约束 | 中文注释 |
|--------|------|------|----------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| file_id | BIGINT | NOT NULL, FK | 文件ID |
| version_number | VARCHAR(32) | NOT NULL | 版本号(如 V1.0, V2.1) |
| version_description | VARCHAR(512) | NULL | 版本描述 |
| storage_name | VARCHAR(128) | NOT NULL | 版本存储文件名 |
| file_path | VARCHAR(512) | NOT NULL | 版本文件路径 |
| file_size | BIGINT | NOT NULL | 版本文件大小 |
| is_latest | BOOLEAN | DEFAULT true | 是否最新版本 |
| created_by | VARCHAR(64) | NOT NULL | 创建人 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**索引设计**:
```sql
CREATE INDEX idx_version_file ON document_versions(file_id);
CREATE INDEX idx_version_latest ON document_versions(is_latest);
```

---

### 3.6 document_analysis（文件AI分析结果表）

存储文件的AI分析结果，包括分类、风险识别、信息抽取等。

| 字段名 | 类型 | 约束 | 中文注释 |
|--------|------|------|----------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| file_id | BIGINT | NOT NULL, FK, UNIQUE | 文件ID |
| analysis_type | VARCHAR(32) | NOT NULL | 分析类型: ocr/parse/classify/risk/info |
| ocr_text | TEXT | NULL | OCR识别结果 |
| parsed_text | TEXT | NULL | 文档解析文本 |
| category | VARCHAR(64) | NULL | AI分类结果 |
| category_confidence | DECIMAL(5,2) | NULL | 分类置信度(0-100) |
| extracted_info | JSONB | NULL | 抽取的关键字段 |
| risk_level | VARCHAR(16) | NULL | 风险等级 |
| risk_items | JSONB | NULL | 识别的风险项 |
| suggested_tags | JSONB | NULL | 建议标签列表 |
| suggested_standard_clauses | JSONB | NULL | 建议关联的标准条款 |
| completeness_score | DECIMAL(5,2) | NULL | 完整度评分 |
| missing_items | JSONB | NULL | 缺失项列表 |
| suggestions | TEXT | NULL | AI建议内容 |
| analysis_time_ms | INTEGER | NULL | 分析耗时(毫秒) |
| ai_model | VARCHAR(64) | NULL | 使用的AI模型 |
| status | VARCHAR(16) | DEFAULT 'completed' | 状态: pending/completed/failed |
| error_message | TEXT | NULL | 错误信息 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

**索引设计**:
```sql
CREATE INDEX idx_analysis_file ON document_analysis(file_id);
CREATE INDEX idx_analysis_type ON document_analysis(analysis_type);
CREATE INDEX idx_analysis_risk_level ON document_analysis(risk_level);
CREATE INDEX idx_analysis_status ON document_analysis(status);
```

**extracted_info JSON结构示例**:
```json
{
  "documentType": "安全检查记录",
  "date": "2026-01-15",
  "checkPerson": "张三",
  "location": "第一作业区",
  "problems": ["灭火器过期", "安全通道堵塞"],
  "rectificationStatus": "已完成"
}
```

---

### 3.7 document_standard_relation（资料与标准关联表）

建立文件与安全标准化条款的关联关系。

| 字段名 | 类型 | 约束 | 中文注释 |
|--------|------|------|----------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| file_id | BIGINT | NOT NULL, FK | 文件ID |
| clause_id | BIGINT | NOT NULL, FK | 标准条款ID |
| match_type | VARCHAR(16) | DEFAULT 'auto' | 匹配类型: auto/manual |
| match_confidence | DECIMAL(5,2) | NULL | 匹配置信度(0-100) |
| status | VARCHAR(16) | DEFAULT 'valid' | 状态: valid/invalid/pending |
| verified_by | VARCHAR(64) | NULL | 审核人 |
| verified_at | TIMESTAMP | NULL | 审核时间 |
| remark | VARCHAR(512) | NULL | 备注 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**索引设计**:
```sql
CREATE UNIQUE INDEX uk_standard_relation ON document_standard_relation(file_id, clause_id);
CREATE INDEX idx_relation_file ON document_standard_relation(file_id);
CREATE INDEX idx_relation_clause ON document_standard_relation(clause_id);
CREATE INDEX idx_relation_match_type ON document_standard_relation(match_type);
```

---

## 四、文件智能归档流程数据流转

```
用户上传文件
    ↓
写入 document_files (analysis_status=pending)
    ↓
文件存储成功
    ↓
┌─────────────────────────────────────────────┐
│            AI分析引擎处理                    │
│  1. OCR识别 (图片)                          │
│  2. 文本解析 (PDF/DOCX)                     │
│  3. AI分类                                  │
│  4. 信息抽取                                │
│  5. 风险识别                                │
│  6. 标准匹配                                │
└─────────────────────────────────────────────┘
    ↓
写入 document_analysis
    ↓
更新 document_files (analysis_status=completed)
    ↓
创建/关联 document_tags
    ↓
创建 document_standard_relation
    ↓
生成文件摘要和标签
```

---

## 五、数据字典

### 5.1 文件类型枚举

| 枚举值 | 说明 |
|--------|------|
| pdf | PDF文档 |
| docx | Word文档 |
| doc | Word文档(旧格式) |
| xlsx | Excel表格 |
| xls | Excel表格(旧格式) |
| image | 图片(JPG/PNG/GIF/WebP) |
| other | 其他文件 |

### 5.2 分析状态枚举

| 枚举值 | 说明 |
|--------|------|
| pending | 待分析 |
| analyzing | 分析中 |
| completed | 分析完成 |
| failed | 分析失败 |

### 5.3 风险等级枚举

| 枚举值 | 说明 |
|--------|------|
| critical | 重大风险 |
| high | 高风险 |
| medium | 中风险 |
| low | 低风险 |
| none | 无风险 |

### 5.4 匹配类型枚举

| 枚举值 | 说明 |
|--------|------|
| auto | AI自动匹配 |
| manual | 人工手动匹配 |

---

## 六、总结

### 6.1 表结构总览

| 表名 | 用途 | 关联表 |
|------|------|--------|
| document_categories | 文件分类管理 | document_files |
| document_tags | 文件标签管理 | document_tag_relation |
| document_files | 文件主表 | 所有关联表 |
| document_tag_relation | 文件标签关联 | document_files, document_tags |
| document_versions | 文件版本管理 | document_files |
| document_analysis | AI分析结果 | document_files |
| document_standard_relation | 标准条款关联 | document_files, safety_standard_clauses |

### 6.2 设计特点

1. **完整的文件生命周期管理**: 从上传、分析、分类、版本控制到归档
2. **AI分析集成**: 专门的分析结果表存储OCR、分类、风险识别等结果
3. **灵活的标签系统**: 支持人工和自动标签，便于搜索和检索
4. **标准化关联**: 文件与安全标准条款的双向关联
5. **版本追溯**: 完整的版本历史记录，支持回滚

---

**文档版本**: V2.0  
**生成日期**: 2026-07-18  
**设计范围**: 文件体系数据库表结构