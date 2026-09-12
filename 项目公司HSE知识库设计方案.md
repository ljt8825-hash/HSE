# 项目公司HSE知识库设计方案

## 文档信息

| 项目 | 内容 |
|------|------|
| 所属Sprint | Sprint10-B 项目公司智能决策与知识增强中心建设 |
| 版本 | v1.0 |
| 日期 | 2026-07-23 |
| 系统定位 | 项目公司HSE智能运营管理系统（项目公司为主体） |

---

## 一、建设目标

建设项目公司HSE知识库，将项目公司内部管理制度、外部法规标准、历史经验教训、平台业务规则系统化沉淀，为AI智能问答、风险分析、管理决策提供知识支撑。

所有知识内容必须关联**项目公司业务场景**。

---

## 二、知识来源

### 2.1 四大知识来源

| 来源 | 类别 | 说明 | 示例 |
|------|------|------|------|
| 项目公司内部知识 | 制度类 | 项目公司内部管理制度 | 项目公司HSE管理制度、岗位安全职责、操作规程 |
| 外部标准知识 | 法规类 | 国家、行业、地方标准 | 安全生产法、行业标准、地方管理要求 |
| 项目公司历史知识 | 案例类 | 项目公司历史事件记录 | 历史事故案例、隐患案例、整改案例 |
| 平台业务规则 | 规则类 | 系统运行规则 | 风险模型规则、预警规则、整改规则 |

### 2.2 知识内容要求

- 所有知识内容必须关联项目公司业务场景
- 历史案例必须基于项目公司真实发生的事件
- 平台规则必须与当前系统运行规则一致（风险模型v1.1、预警规则v1.1、考核模型v1.1）
- 外部标准需标注适用范围（国家/行业/地方）

---

## 三、知识分类体系

### 3.1 分类架构

```
项目公司HSE知识库
├── 一、项目公司内部知识
│   ├── 1.1 HSE管理制度
│   │   ├── 安全生产责任制度
│   │   ├── 安全教育培训制度
│   │   ├── 隐患排查治理制度
│   │   ├── 事故报告与调查处理制度
│   │   └── 应急管理制度
│   ├── 1.2 岗位安全职责
│   │   ├── 项目公司管理员安全职责
│   │   ├── 作业中心负责人安全职责
│   │   ├── 片区长安全职责
│   │   ├── 乡镇负责人安全职责
│   │   ├── 网格长安全职责
│   │   └── 员工/驾驶员安全职责
│   ├── 1.3 操作规程
│   │   ├── 作业前安全检查规程
│   │   ├── 车辆安全检查规程
│   │   ├── 设备操作规程
│   │   └── 应急处置规程
│   ├── 1.4 检查标准
│   │   ├── 日检检查标准
│   │   ├── 周检检查标准
│   │   ├── 月检检查标准
│   │   └── 专项检查标准
│   ├── 1.5 风险管理制度
│   │   ├── 风险识别与评估制度
│   │   ├── 风险分级管控制度
│   │   ├── 风险告知制度
│   │   └── 风险动态更新制度
│   ├── 1.6 整改管理要求
│   │   ├── 隐患整改流程
│   │   ├── 整改验收标准
│   │   ├── 整改时限要求
│   │   └── 整改延期审批制度
│   └── 1.7 考核管理办法
│       ├── 考核指标与权重
│       ├── 考核周期与流程
│       ├── 考核结果应用
│       └── 考核申诉机制
│
├── 二、外部标准知识
│   ├── 2.1 国家法律法规
│   │   ├── 中华人民共和国安全生产法
│   │   ├── 中华人民共和国道路交通安全法
│   │   ├── 生产安全事故报告和调查处理条例
│   │   └── 工伤保险条例
│   ├── 2.2 行业标准
│   │   ├── 城镇道路清扫保洁质量标准
│   │   ├── 城市环境卫生质量标准
│   │   └── 环卫车辆安全管理规范
│   └── 2.3 地方管理要求
│       ├── 项目所在省安全生产条例
│       └── 项目所在市环卫作业安全管理规定
│
├── 三、项目公司历史知识
│   ├── 3.1 历史事故案例
│   │   ├── 车辆伤害事故案例
│   │   ├── 物体打击事故案例
│   │   ├── 高处坠落事故案例
│   │   └── 其他类型事故案例
│   ├── 3.2 历史隐患案例
│   │   ├── 车辆隐患案例
│   │   ├── 设备隐患案例
│   │   ├── 作业环境隐患案例
│   │   └── 管理缺陷案例
│   ├── 3.3 历史整改案例
│   │   ├── 高效整改案例
│   │   ├── 逾期整改案例
│   │   └── 重复整改案例
│   └── 3.4 优秀管理案例
│       ├── 网格优秀管理案例
│       ├── 乡镇优秀管理案例
│       └── 作业中心优秀管理案例
│
└── 四、平台业务规则
    ├── 4.1 风险模型规则
    │   ├── 五维风险模型说明
    │   ├── 三检风险计算方法
    │   ├── 事故风险计算方法
    │   ├── 培训风险计算方法
    │   ├── 考核风险计算方法
    │   ├── 整改风险计算方法
    │   └── 风险等级划分标准
    ├── 4.2 预警规则
    │   ├── 员工风险预警(WR-EMP)
    │   ├── 驾驶员风险预警(WR-DRV)
    │   ├── 事故预警(WR-ACC)
    │   ├── 组织评分预警(WR-ASM)
    │   └── 网格管理预警(WR-MGT)
    ├── 4.3 整改规则
    │   ├── 整改任务生成规则
    │   ├── 整改时限规则
    │   ├── 整改超时升级规则
    │   └── 整改关闭条件
    ├── 4.4 考核规则
    │   ├── 考核指标计算规则
    │   ├── 考核评分规则
    │   └── 考核排名规则
    └── 4.5 指标计算规则
        ├── 各指标计算公式
        ├── 数据来源说明
        └── 更新周期说明
```

---

## 四、数据库设计

### 4.1 知识分类表

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
```

### 4.2 知识文档表

```sql
CREATE TABLE hse_knowledge_doc (
    knowledge_id    BIGSERIAL PRIMARY KEY,
    category_id     BIGINT REFERENCES hse_knowledge_category(category_id),
    title           VARCHAR(500) NOT NULL,
    summary         TEXT,
    content         TEXT,
    doc_type        VARCHAR(20) NOT NULL CHECK (doc_type IN ('system', 'regulation', 'case', 'rule')),
    -- system=项目公司内部制度, regulation=外部法规, case=历史案例, rule=平台规则
    version         VARCHAR(20) DEFAULT '1.0',
    status          VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'reviewing', 'published', 'archived')),
    source          VARCHAR(200),
    -- 知识来源说明，如"项目公司HSE管理制度v2.0"
    applicable_scope VARCHAR(200),
    -- 适用范围，如"全公司"、"作业中心级"、"网格级"
    tags            JSONB DEFAULT '[]',
    created_by      VARCHAR(50) NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at    TIMESTAMP
);
```

### 4.3 知识章节表（含向量索引）

```sql
CREATE TABLE hse_knowledge_chapter (
    chapter_id        BIGSERIAL PRIMARY KEY,
    knowledge_id      BIGINT REFERENCES hse_knowledge_doc(knowledge_id),
    parent_chapter_id BIGINT REFERENCES hse_knowledge_chapter(chapter_id),
    title             VARCHAR(500) NOT NULL,
    content           TEXT,
    embedding         vector(1536),
    -- OpenAI text-embedding-3-small 1536维
    sort_order        INT DEFAULT 0,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- pgvector 向量索引
CREATE INDEX idx_knowledge_chapter_embedding ON hse_knowledge_chapter
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### 4.4 知识标签表

```sql
CREATE TABLE hse_knowledge_tag (
    tag_id      BIGSERIAL PRIMARY KEY,
    tag_name    VARCHAR(100) UNIQUE NOT NULL,
    tag_type    VARCHAR(50) DEFAULT 'custom',
    -- system=系统内置, custom=自定义
    usage_count INT DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 知识-标签关联
CREATE TABLE hse_knowledge_doc_tag (
    knowledge_id BIGINT REFERENCES hse_knowledge_doc(knowledge_id),
    tag_id       BIGINT REFERENCES hse_knowledge_tag(tag_id),
    PRIMARY KEY (knowledge_id, tag_id)
);
```

### 4.5 知识访问日志

```sql
CREATE TABLE hse_knowledge_access_log (
    log_id        BIGSERIAL PRIMARY KEY,
    user_id       VARCHAR(50) NOT NULL,
    knowledge_id  BIGINT REFERENCES hse_knowledge_doc(knowledge_id),
    access_type   VARCHAR(20) NOT NULL,
    -- view/search/download
    search_query  TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 五、向量化流水线

### 5.1 流程

```
文档上传
  ↓
内容解析（PDF/Word/Txt/Markdown）
  ↓
章节自动拆分（按标题层级）
  ↓
内容清洗（去除特殊字符、格式化）
  ↓
调用Embedding API生成1536维向量
  ↓
存储到hse_knowledge_chapter.embedding
  ↓
索引更新（ivfflat索引）
  ↓
完成
```

### 5.2 章节拆分规则

| 文档类型 | 拆分依据 | 最大长度 |
|----------|----------|----------|
| 制度文件 | 按章节标题（第X章/第X节） | 2000字符 |
| 操作规程 | 按步骤/条款 | 1500字符 |
| 案例 | 按事件经过/原因/措施 | 2000字符 |
| 规则 | 按规则条目 | 1500字符 |

### 5.3 向量更新策略

| 场景 | 处理方式 |
|------|----------|
| 新增文档 | 全量向量化 |
| 修改文档 | 变更章节重新向量化，未变更章节保留 |
| 删除文档 | 删除对应章节向量 |
| 批量导入 | 异步任务队列处理，100章节/批 |

---

## 六、检索能力设计

### 6.1 关键词检索

- 全文检索：对知识文档标题、摘要、内容进行全文检索
- 标签检索：按标签筛选知识文档
- 分类检索：按分类层级浏览知识

### 6.2 语义搜索

```sql
-- 语义搜索：查询向量与章节向量的余弦相似度
SELECT
    c.chapter_id,
    c.knowledge_id,
    c.title,
    c.content,
    d.title AS doc_title,
    1 - (c.embedding <=> :query_embedding) AS similarity
FROM hse_knowledge_chapter c
JOIN hse_knowledge_doc d ON c.knowledge_id = d.knowledge_id
WHERE d.status = 'published'
  AND c.embedding IS NOT NULL
  AND 1 - (c.embedding <=> :query_embedding) > 0.7
ORDER BY similarity DESC
LIMIT 5;
```

### 6.3 混合检索

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

### 6.4 检索参数

| 参数 | 默认值 | 可调范围 | 说明 |
|------|--------|----------|------|
| 相似度阈值 | 0.7 | 0.5-0.9 | 低于阈值的结果过滤 |
| 返回TopK | 5 | 3-10 | 语义搜索返回数量 |
| 关键词TopK | 10 | 5-20 | 关键词检索返回数量 |
| 混合权重-语义 | 50% | 30%-70% | 语义搜索权重 |
| 混合权重-关键词 | 40% | 20%-50% | 关键词检索权重 |
| 混合权重-标签 | 10% | 5%-20% | 标签匹配权重 |

---

## 七、知识内容初始化

### 7.1 初始化数据清单

| 分类 | 预计数量 | 来源 |
|------|----------|------|
| 项目公司内部知识 | 30-50篇 | 项目公司制度文件 |
| 外部标准知识 | 10-20篇 | 法规标准文档 |
| 历史案例 | 20-30篇 | 项目公司历史事故/隐患/整改记录 |
| 平台业务规则 | 15-20篇 | 系统运行规则文档化 |

### 7.2 平台规则知识化要求

以下平台规则必须知识化：

| 规则 | 知识化内容 |
|------|------------|
| 五维风险模型 | 模型说明、各维度计算方法、权重配置 |
| 预警规则WR-EMP-001~002 | 规则触发条件、扫描频率、升级策略 |
| 预警规则WR-DRV-001~002 | 规则触发条件、扫描频率、升级策略 |
| 预警规则WR-ACC-001~002 | 规则触发条件、扫描频率、升级策略 |
| 预警规则WR-ASM-001~002 | 规则触发条件、扫描频率、升级策略 |
| 预警规则WR-MGT-001~002 | 规则触发条件、扫描频率、升级策略 |
| 整改规则 | 生成条件、时限、超时策略、关闭条件 |
| 考核指标 | 39指标定义、公式、数据源、更新周期 |

---

## 八、知识库管理功能

### 8.1 管理功能

| 功能 | 说明 | 权限 |
|------|------|------|
| 知识文档CRUD | 增删改查知识文档 | 项目公司管理员 |
| 章节管理 | 添加/编辑/删除/排序章节 | 项目公司管理员 |
| 标签管理 | 创建/编辑/删除标签 | 项目公司管理员 |
| 文档导入 | PDF/Word/Txt/Markdown导入 | 项目公司管理员 |
| 版本管理 | 文档版本记录与回滚 | 项目公司管理员 |
| 发布审核 | 草稿→审核→发布流程 | 安全管理人员审核 |
| 向量化任务 | 触发/查看向量化进度 | 项目公司管理员 |
| 访问统计 | 知识浏览/搜索/下载统计 | 项目公司管理员 |

### 8.2 用户功能

| 功能 | 说明 | 权限 |
|------|------|------|
| 知识浏览 | 按分类浏览知识文档 | 全部角色 |
| 关键词搜索 | 输入关键词搜索知识 | 全部角色 |
| 语义搜索 | 自然语言描述搜索知识 | 全部角色 |
| 知识推荐 | 基于当前页面推荐相关知识 | 全部角色 |
| 知识收藏 | 收藏常用知识文档 | 全部角色 |

---

## 九、知识库API设计

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

## 十、约束

| 约束 | 说明 |
|------|------|
| 知识关联项目公司 | 所有知识内容必须关联项目公司业务场景 |
| 历史案例真实 | 历史案例必须基于项目公司真实发生的事件 |
| 平台规则一致 | 知识化的平台规则必须与当前系统运行规则一致 |
| 不引入新依赖 | 使用现有技术栈，pgvector已安装 |
| 数据库仅新增 | 仅新增知识库相关表 |
