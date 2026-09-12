# HSE 知识库设计方案

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint10-B
> 关联文档：《Sprint10-B 智能决策中心总体设计方案》

---

## 一、概述

### 1.1 建设目标

建设 HSE 企业知识库，汇聚企业制度、法规标准、历史案例和平台业务规则四类知识，建立知识分类体系和向量索引，支持语义搜索、AI 问答和知识推荐。

### 1.2 知识来源

| 知识类别 | 包含内容 | 文档格式 | 预估文档数 |
|----------|----------|----------|------------|
| 企业制度文件 | HSE 管理制度、岗位责任制、操作规程、检查标准 | PDF/Word | 50-80 |
| 法规标准 | 国家法规、行业标准、地方标准 | PDF/Word | 30-50 |
| 历史案例 | 事故案例、隐患案例、整改案例、优秀管理案例 | Word/Excel | 100-200 |
| 平台业务规则 | 风险模型规则、考核规则、预警规则、整改规则 | 系统自动 | 20-30 |

---

## 二、知识分类体系

### 2.1 分类层级

```
HSE 知识库
├── 企业制度
│   ├── 管理制度
│   │   ├── 安全生产管理制度
│   │   ├── 隐患排查治理制度
│   │   ├── 事故报告和调查制度
│   │   └── 培训管理制度
│   ├── 岗位责任制
│   │   ├── 集团安全职责
│   │   ├── 部门安全职责
│   │   └── 岗位安全职责
│   ├── 操作规程
│   │   ├── 车辆操作规程
│   │   ├── 设备操作规程
│   │   └── 作业操作规程
│   └── 检查标准
│       ├── 自检标准
│       ├── 互检标准
│       └── 专检标准
├── 法规标准
│   ├── 国家法规
│   │   ├── 安全生产法
│   │   ├── 道路交通安全法
│   │   └── 消防法
│   ├── 行业标准
│   │   └── 环卫行业安全标准
│   └── 地方标准
│       └── 地方安全管理规定
├── 历史案例
│   ├── 事故案例
│   ├── 隐患案例
│   ├── 整改案例
│   └── 优秀管理案例
└── 平台业务规则
    ├── 风险模型规则
    ├── 考核规则
    ├── 预警规则
    └── 整改规则
```

### 2.2 知识文档结构

| 字段 | 说明 | 数据类型 |
|------|------|----------|
| knowledge_id | 知识文档唯一标识 | BIGINT |
| category_id | 所属分类 ID | BIGINT |
| title | 文档标题 | VARCHAR(500) |
| content | 文档内容（Markdown）| TEXT |
| source | 文档来源 | VARCHAR(200) |
| doc_type | 文档类型（制度/法规/案例/规则）| VARCHAR(20) |
| version | 文档版本号 | VARCHAR(20) |
| effective_date | 生效日期 | DATE |
| expire_date | 失效日期 | DATE |
| status | 状态（有效/失效/草稿）| VARCHAR(20) |
| tags | 知识标签 | JSON |
| embedding | 文档向量（pgvector）| VECTOR(1536) |
| created_at | 创建时间 | TIMESTAMP |
| updated_at | 更新时间 | TIMESTAMP |

### 2.3 知识章节结构

| 字段 | 说明 | 数据类型 |
|------|------|----------|
| chapter_id | 章节唯一标识 | BIGINT |
| knowledge_id | 所属文档 ID | BIGINT |
| parent_chapter_id | 父章节 ID | BIGINT |
| chapter_no | 章节编号 | VARCHAR(50) |
| title | 章节标题 | VARCHAR(500) |
| content | 章节内容 | TEXT |
| embedding | 章节向量 | VECTOR(1536) |
| sort_order | 排序号 | INT |

### 2.4 知识标签体系

| 标签类别 | 标签示例 | 用途 |
|----------|----------|------|
| 业务域 | 安全/环保/健康/消防 | 知识分类 |
| 风险类型 | 事故/隐患/违章/设备 | 风险关联 |
| 岗位类型 | 驾驶员/班长/网格长 | 权限过滤 |
| 作业类型 | 道路清扫/垃圾清运/设备维护 | 业务关联 |
| 紧急程度 | 紧急/重要/一般 | 优先级 |

---

## 三、向量索引设计

### 3.1 向量化方案

| 环节 | 技术选型 | 说明 |
|------|----------|------|
| 文档解析 | Apache Tika | 支持 PDF/Word/Excel 解析 |
| 文本切分 | 递归字符切分 | 按章节/段落切分，每段 500-1000 字 |
| 向量生成 | Embedding API | 生成 1536 维向量 |
| 向量存储 | PostgreSQL pgvector | 向量索引存储和检索 |
| 相似度计算 | 余弦相似度 | cosine similarity |

### 3.2 向量索引配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 向量维度 | 1536 | OpenAI Embedding 维度 |
| 索引类型 | IVFFlat | pgvector 近似索引 |
| 相似度函数 | cosine | 余弦相似度 |
| Top-K | 5 | 检索返回前 5 条 |
| 相似度阈值 | 0.7 | 低于 0.7 视为不相关 |

### 3.3 检索流程

```
用户输入问题
  ↓
问题向量化（Embedding）
  ↓
向量相似度检索（pgvector）
  ↓
Top-K 相关知识章节
  ↓
相似度过滤（≥ 0.7）
  ↓
业务规则过滤（权限/标签）
  ↓
排序返回
```

---

## 四、知识管理功能

### 4.1 知识录入

| 录入方式 | 说明 | 适用场景 |
|----------|------|----------|
| 文件上传 | 上传 PDF/Word/Excel，自动解析 | 制度文件、法规标准 |
| 手动录入 | 在线编辑知识内容 | 平台业务规则 |
| 系统自动 | 从业务系统自动提取规则 | 风险/预警/整改规则 |

### 4.2 知识版本管理

| 版本操作 | 说明 |
|----------|------|
| 新增版本 | 知识文档新增版本号 |
| 生效切换 | 新版本生效，旧版本标记失效 |
| 版本回溯 | 查看历史版本内容 |
| 版本对比 | 对比两个版本的差异 |

### 4.3 知识检索

| 检索方式 | 说明 |
|----------|------|
| 关键词搜索 | 基于标题和内容的全文检索 |
| 语义搜索 | 基于向量的语义相似度检索 |
| 分类浏览 | 按知识分类树浏览 |
| 标签过滤 | 按标签筛选知识 |

### 4.4 知识推荐

| 推荐场景 | 推荐逻辑 |
|----------|----------|
| 风险分析时 | 推荐与风险类型相关的制度和案例 |
| 预警处理时 | 推荐与预警类型相关的处理规范 |
| 整改执行时 | 推荐与整改类型相关的操作规程 |
| 事故调查时 | 推荐类似事故案例和法规条款 |

---

## 五、数据库设计

### 5.1 知识分类表

```sql
CREATE TABLE hse_knowledge_category (
    category_id   BIGSERIAL PRIMARY KEY,
    parent_id     BIGINT REFERENCES hse_knowledge_category(category_id),
    category_name VARCHAR(200) NOT NULL,
    category_code VARCHAR(50) NOT NULL UNIQUE,
    doc_type      VARCHAR(20) NOT NULL,
    sort_order    INT DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5.2 知识文档表

```sql
CREATE TABLE hse_knowledge_doc (
    knowledge_id    BIGSERIAL PRIMARY KEY,
    category_id     BIGINT REFERENCES hse_knowledge_category(category_id),
    title           VARCHAR(500) NOT NULL,
    content         TEXT,
    source          VARCHAR(200),
    doc_type        VARCHAR(20) NOT NULL,
    version         VARCHAR(20) DEFAULT '1.0',
    effective_date  DATE,
    expire_date     DATE,
    status          VARCHAR(20) DEFAULT 'draft',
    tags            JSONB,
    created_by      VARCHAR(50),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5.3 知识章节表

```sql
CREATE TABLE hse_knowledge_chapter (
    chapter_id        BIGSERIAL PRIMARY KEY,
    knowledge_id      BIGINT REFERENCES hse_knowledge_doc(knowledge_id),
    parent_chapter_id BIGINT REFERENCES hse_knowledge_chapter(chapter_id),
    chapter_no        VARCHAR(50),
    title             VARCHAR(500) NOT NULL,
    content           TEXT,
    embedding         vector(1536),
    sort_order        INT DEFAULT 0
);
```

### 5.4 知识标签表

```sql
CREATE TABLE hse_knowledge_tag (
    tag_id      BIGSERIAL PRIMARY KEY,
    tag_name    VARCHAR(100) NOT NULL,
    tag_type    VARCHAR(50) NOT NULL,
    UNIQUE(tag_name, tag_type)
);
```

---

## 六、接口设计

| 接口 | 方法 | 说明 |
|------|------|------|
| /api/knowledge/category/tree | GET | 获取知识分类树 |
| /api/knowledge/doc/list | GET | 知识文档列表 |
| /api/knowledge/doc/{id} | GET | 知识文档详情 |
| /api/knowledge/doc/upload | POST | 上传知识文档 |
| /api/knowledge/doc/create | POST | 手动创建知识 |
| /api/knowledge/doc/update | PUT | 更新知识文档 |
| /api/knowledge/search | POST | 知识搜索（关键词+语义）|
| /api/knowledge/recommend | GET | 知识推荐 |

---

## 七、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | HSE 知识库设计方案初始版本 |
