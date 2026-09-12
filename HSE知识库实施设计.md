# HSE知识库实施设计

## 文档信息

| 项目 | 内容 |
|------|------|
| 所属Sprint | Sprint10-B1 项目公司智能知识与解释能力建设 |
| 版本 | v1.0 |
| 日期 | 2026-07-23 |
| 系统定位 | 项目公司HSE智能运营管理系统（项目公司为主体） |

---

## 一、建设目标

建设项目公司HSE知识库，将项目公司内部管理制度、岗位职责、操作规程、检查标准、风险规则、整改规则、事故案例、历史整改案例系统化沉淀，形成可检索、可问答的知识资产。

---

## 二、知识内容规划

### 2.1 知识分类体系

```
项目公司HSE知识库
├── 一、制度文件
│   ├── 安全生产责任制度
│   ├── 安全教育培训制度
│   ├── 隐患排查治理制度
│   ├── 事故报告与调查处理制度
│   ├── 应急管理制度
│   └── 风险分级管控制度
│
├── 二、岗位职责
│   ├── 项目公司管理员安全职责
│   ├── 作业中心负责人安全职责
│   ├── 片区长安全职责
│   ├── 乡镇负责人安全职责
│   ├── 网格长安全职责
│   └── 员工/驾驶员安全职责
│
├── 三、操作规程
│   ├── 作业前安全检查规程
│   ├── 车辆安全检查规程
│   ├── 设备操作规程
│   └── 应急处置规程
│
├── 四、检查标准
│   ├── 日检检查标准
│   ├── 周检检查标准
│   ├── 月检检查标准
│   └── 专项检查标准
│
├── 五、风险规则
│   ├── 五维风险模型说明
│   ├── 三检风险计算方法
│   ├── 事故风险计算方法
│   ├── 培训风险计算方法
│   ├── 考核风险计算方法
│   ├── 整改风险计算方法
│   └── 风险等级划分标准
│
├── 六、整改规则
│   ├── 隐患整改流程
│   ├── 整改验收标准
│   ├── 整改时限要求
│   └── 整改延期审批制度
│
├── 七、事故案例
│   ├── 车辆伤害事故案例
│   ├── 物体打击事故案例
│   ├── 高处坠落事故案例
│   └── 其他类型事故案例
│
└── 八、历史整改案例
    ├── 高效整改案例
    ├── 逾期整改案例
    └── 重复整改案例
```

### 2.2 知识内容来源

| 分类 | 内容来源 | 数量预估 | 负责部门 |
|------|----------|----------|----------|
| 制度文件 | 项目公司HSE管理制度 | 6-10篇 | 安全管理部门 |
| 岗位职责 | 项目公司岗位说明书 | 6-8篇 | 人力资源部 |
| 操作规程 | 项目公司操作规程文档 | 4-6篇 | 作业中心 |
| 检查标准 | 项目公司检查标准文档 | 4-5篇 | 安全管理部门 |
| 风险规则 | 系统运行规则文档化 | 7-10篇 | 安全管理部门 |
| 整改规则 | 项目公司整改管理制度 | 4-5篇 | 安全管理部门 |
| 事故案例 | 项目公司历史事故记录 | 10-15篇 | 安全管理部门 |
| 历史整改案例 | 项目公司历史整改记录 | 8-10篇 | 安全管理部门 |

**合计：49-69篇知识文档**

---

## 三、数据库设计

### 3.1 知识分类表

```sql
CREATE TABLE hse_knowledge_category (
    category_id     BIGSERIAL PRIMARY KEY,
    parent_id       BIGINT REFERENCES hse_knowledge_category(category_id),
    category_code   VARCHAR(50) UNIQUE NOT NULL,
    category_name   VARCHAR(200) NOT NULL,
    level           INT NOT NULL DEFAULT 1,
    sort_order      INT DEFAULT 0,
    description     TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 初始化数据
INSERT INTO hse_knowledge_category (category_code, category_name, level, sort_order) VALUES
('SYSTEM', '制度文件', 1, 1),
('DUTY', '岗位职责', 1, 2),
('OPERATION', '操作规程', 1, 3),
('INSPECTION_STD', '检查标准', 1, 4),
('RISK_RULE', '风险规则', 1, 5),
('RECT_RULE', '整改规则', 1, 6),
('ACCIDENT_CASE', '事故案例', 1, 7),
('RECT_CASE', '历史整改案例', 1, 8);
```

### 3.2 知识文档表

```sql
CREATE TABLE hse_knowledge_doc (
    knowledge_id    BIGSERIAL PRIMARY KEY,
    category_id     BIGINT NOT NULL REFERENCES hse_knowledge_category(category_id),
    title           VARCHAR(500) NOT NULL,
    summary         TEXT,
    content         TEXT,
    doc_type        VARCHAR(20) NOT NULL,
    -- system:制度文件, duty:岗位职责, operation:操作规程, inspection:检查标准,
    -- risk_rule:风险规则, rect_rule:整改规则, accident:事故案例, rect_case:整改案例
    version         VARCHAR(20) DEFAULT '1.0',
    status          VARCHAR(20) DEFAULT 'draft',
    -- draft:草稿, reviewing:审核中, published:已发布, archived:已归档
    source          VARCHAR(200),
    applicable_scope VARCHAR(200),
    tags            JSONB DEFAULT '[]',
    created_by      VARCHAR(50) NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at    TIMESTAMP
);
```

### 3.3 知识章节表（含向量索引）

```sql
CREATE TABLE hse_knowledge_chapter (
    chapter_id        BIGSERIAL PRIMARY KEY,
    knowledge_id      BIGINT NOT NULL REFERENCES hse_knowledge_doc(knowledge_id),
    parent_chapter_id BIGINT REFERENCES hse_knowledge_chapter(chapter_id),
    title             VARCHAR(500) NOT NULL,
    content           TEXT,
    embedding         vector(1536),
    sort_order        INT DEFAULT 0,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- pgvector 向量索引
CREATE INDEX idx_knowledge_chapter_embedding ON hse_knowledge_chapter
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### 3.4 知识标签表

```sql
CREATE TABLE hse_knowledge_tag (
    tag_id      BIGSERIAL PRIMARY KEY,
    tag_name    VARCHAR(100) UNIQUE NOT NULL,
    tag_type    VARCHAR(50) DEFAULT 'custom',
    usage_count INT DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hse_knowledge_doc_tag (
    knowledge_id BIGINT REFERENCES hse_knowledge_doc(knowledge_id),
    tag_id       BIGINT REFERENCES hse_knowledge_tag(tag_id),
    PRIMARY KEY (knowledge_id, tag_id)
);
```

### 3.5 知识访问日志

```sql
CREATE TABLE hse_knowledge_access_log (
    log_id        BIGSERIAL PRIMARY KEY,
    user_id       VARCHAR(50) NOT NULL,
    knowledge_id  BIGINT REFERENCES hse_knowledge_doc(knowledge_id),
    access_type   VARCHAR(20) NOT NULL,
    -- view:浏览, search:搜索, download:下载
    search_query  TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 四、向量化流水线

### 4.1 处理流程

```
文档上传/录入
  ↓
内容解析（支持PDF/Word/Txt/Markdown）
  ↓
章节自动拆分
  - 制度文件：按章节标题（第X章/第X节）
  - 操作规程：按步骤/条款
  - 案例：按事件经过/原因/措施/教训
  - 规则：按规则条目
  ↓
内容清洗（去除特殊字符、格式化）
  ↓
调用Embedding API生成1536维向量
  ↓
存储到hse_knowledge_chapter.embedding
  ↓
索引更新（ivfflat索引）
```

### 4.2 章节拆分规则

| 文档类型 | 拆分依据 | 最大长度 | 示例 |
|----------|----------|----------|------|
| 制度文件 | 按章节标题 | 2000字符 | "第一章 总则"、"第二章 职责" |
| 岗位职责 | 按职责条目 | 1500字符 | "一、安全职责"、"二、检查职责" |
| 操作规程 | 按操作步骤 | 1500字符 | "步骤1：检查车辆"、"步骤2：启动设备" |
| 检查标准 | 按检查项目 | 1500字符 | "项目1：车辆制动"、"项目2：轮胎气压" |
| 风险规则 | 按规则条目 | 1500字符 | "规则1：三检风险计算" |
| 整改规则 | 按流程节点 | 1500字符 | "节点1：隐患发现"、"节点2：整改派发" |
| 事故案例 | 按事件段落 | 2000字符 | "事故经过"、"原因分析"、"防范措施" |
| 整改案例 | 按处理阶段 | 2000字符 | "问题描述"、"整改过程"、"效果评价" |

### 4.3 向量更新策略

| 场景 | 处理方式 |
|------|----------|
| 新增文档 | 全量向量化，异步处理 |
| 修改文档 | 变更章节重新向量化，未变更章节保留 |
| 删除文档 | 删除对应章节向量 |
| 批量导入 | 异步任务队列，50章节/批 |

---

## 五、检索能力设计

### 5.1 关键词检索

- 全文检索：对知识文档标题、摘要、内容进行全文检索
- 标签检索：按标签筛选知识文档
- 分类检索：按分类层级浏览知识

### 5.2 语义搜索

```sql
-- 语义搜索：查询向量与章节向量的余弦相似度
SELECT
    c.chapter_id,
    c.knowledge_id,
    c.title,
    LEFT(c.content, 200) AS content_preview,
    d.title AS doc_title,
    d.doc_type,
    1 - (c.embedding <=> :query_embedding) AS similarity
FROM hse_knowledge_chapter c
JOIN hse_knowledge_doc d ON c.knowledge_id = d.knowledge_id
WHERE d.status = 'published'
  AND c.embedding IS NOT NULL
  AND 1 - (c.embedding <=> :query_embedding) > 0.7
ORDER BY similarity DESC
LIMIT 5;
```

### 5.3 混合检索

```
用户查询
  ├── 关键词检索 → 结果A（权重40%）
  ├── 语义搜索 → 结果B（权重50%）
  └── 标签匹配 → 结果C（权重10%）
       ↓
  融合排序（RRF/Rank Fusion）
       ↓
  TopK结果返回
```

### 5.4 检索参数配置

| 参数 | 默认值 | 可调范围 | 说明 |
|------|--------|----------|------|
| 相似度阈值 | 0.7 | 0.5-0.9 | 低于阈值的结果过滤 |
| 语义搜索TopK | 5 | 3-10 | 语义搜索返回数量 |
| 关键词TopK | 10 | 5-20 | 关键词检索返回数量 |
| 混合权重-语义 | 50% | 30%-70% | 语义搜索权重 |
| 混合权重-关键词 | 40% | 20%-50% | 关键词检索权重 |
| 混合权重-标签 | 10% | 5%-20% | 标签匹配权重 |

---

## 六、前端页面设计

### 6.1 知识库列表页

```
┌─────────────────────────────────────────────────┐
│  项目公司HSE知识库                      [搜索]   │
├─────────────────────────────────────────────────┤
│  ┌─左侧分类树────────┐  ┌─右侧文档列表────────┐│
│  │ 制度文件            │  │ 知识文档（共56篇）  ││
│  │  ├── 安全生产责任  │  │ ┌─────────────────┐ ││
│  │  ├── 安全教育培训  │  │ │ 安全生产责任制度 │ ││
│  │  ├── 隐患排查治理  │  │ │ 发布时间:2026-07 │ ││
│  │  └── ...           │  │ │ 标签: 制度,安全  │ ││
│  │ 岗位职责            │  │ └─────────────────┘ ││
│  │ 操作规程            │  │ ┌─────────────────┐ ││
│  │ 检查标准            │  │ │ 网格长安全职责   │ ││
│  │ 风险规则            │  │ └─────────────────┘ ││
│  │ 整改规则            │  │                     ││
│  │ 事故案例            │  │  [分页]             ││
│  │ 历史整改案例        │  │                     ││
│  └─────────────────────┘  └─────────────────────┘│
└─────────────────────────────────────────────────┘
```

### 6.2 知识详情页

```
┌─────────────────────────────────────────────────┐
│  安全生产责任制度                    [编辑][返回]│
├─────────────────────────────────────────────────┤
│  分类: 制度文件  版本: v1.0  状态: 已发布        │
│  标签: 制度,安全,责任                            │
│  来源: 项目公司HSE管理制度v2.0                   │
│  适用范围: 全公司                                │
├─────────────────────────────────────────────────┤
│                                                  │
│  第一章 总则                                     │
│  第一条 为加强项目公司安全生产管理...            │
│                                                  │
│  第二章 安全生产责任体系                         │
│  第二条 项目公司实行安全生产责任制...            │
│                                                  │
│  第三章 各级人员安全职责                         │
│  ...                                             │
│                                                  │
│  [🤖 问AI关于这个制度的问题]                     │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 6.3 知识搜索页

```
┌─────────────────────────────────────────────────┐
│  知识搜索                              [高级搜索]│
├─────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────┐   │
│  │  请输入搜索内容...                [搜索]  │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  [关键词搜索] [语义搜索] [混合搜索]              │
│                                                  │
│  ┌─搜索结果────────────────────────────────┐   │
│  │ 1. 安全生产责任制度 (相似度: 0.92)      │   │
│  │    分类: 制度文件 | 标签: 制度,安全     │   │
│  │                                         │   │
│  │ 2. 网格长安全职责 (相似度: 0.85)        │   │
│  │    分类: 岗位职责 | 标签: 网格,职责     │   │
│  │                                         │   │
│  │ 3. 隐患排查治理制度 (相似度: 0.78)      │   │
│  │    分类: 制度文件 | 标签: 隐患,治理     │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## 七、API设计

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 分类列表 | GET | /api/hse/knowledge/categories | 获取知识分类树 |
| 文档列表 | GET | /api/hse/knowledge/docs | 按分类/标签/状态筛选 |
| 文档详情 | GET | /api/hse/knowledge/docs/:id | 获取文档详情及章节 |
| 创建文档 | POST | /api/hse/knowledge/docs | 创建知识文档 |
| 更新文档 | PUT | /api/hse/knowledge/docs/:id | 更新知识文档 |
| 删除文档 | DELETE | /api/hse/knowledge/docs/:id | 删除知识文档 |
| 发布文档 | POST | /api/hse/knowledge/docs/:id/publish | 发布知识文档 |
| 关键词搜索 | GET | /api/hse/knowledge/search | 关键词全文检索 |
| 语义搜索 | POST | /api/hse/knowledge/semantic-search | 向量语义检索 |
| 混合搜索 | POST | /api/hse/knowledge/hybrid-search | 混合检索 |
| 标签列表 | GET | /api/hse/knowledge/tags | 获取所有标签 |
| 向量化任务 | POST | /api/hse/knowledge/vectorize | 触发向量化任务 |
| 文档导入 | POST | /api/hse/knowledge/import | 导入文档文件 |

---

## 八、实施 checklist

| 阶段 | 任务 | 状态 |
|------|------|------|
| 数据库 | 创建知识库相关表 | 待执行 |
| 数据库 | 安装pgvector扩展 | 待执行 |
| 数据库 | 创建ivfflat索引 | 待执行 |
| 后端 | 实现知识库CRUD API | 待执行 |
| 后端 | 实现关键词搜索 | 待执行 |
| 后端 | 实现语义搜索 | 待执行 |
| 后端 | 实现混合搜索 | 待执行 |
| 后端 | 实现向量化流水线 | 待执行 |
| 前端 | 知识库列表页面 | 待执行 |
| 前端 | 知识详情页面 | 待执行 |
| 前端 | 知识搜索页面 | 待执行 |
| 数据 | 导入制度文件 | 待执行 |
| 数据 | 导入岗位职责 | 待执行 |
| 数据 | 导入操作规程 | 待执行 |
| 数据 | 导入检查标准 | 待执行 |
| 数据 | 导入风险规则 | 待执行 |
| 数据 | 导入整改规则 | 待执行 |
| 数据 | 导入事故案例 | 待执行 |
| 数据 | 导入历史整改案例 | 待执行 |
| 数据 | 执行向量化处理 | 待执行 |

---

## 九、约束

| 约束 | 说明 |
|------|------|
| 知识关联项目公司 | 所有知识内容必须关联项目公司业务场景 |
| 历史案例真实 | 事故案例和整改案例必须基于项目公司真实事件 |
| 平台规则一致 | 知识化的规则必须与当前系统运行规则一致 |
| 不引入新依赖 | 使用现有技术栈，pgvector已安装 |
| 数据库仅新增 | 仅新增知识库相关表 |
